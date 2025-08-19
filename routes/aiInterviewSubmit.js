import express from 'express';
import jwt from 'jsonwebtoken';
import InterviewSession from '../models/InterviewSession.js';

const router = express.Router();

router.post('/submit', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const { userId } = jwt.decode(token);
    const { sessionId, round, answers } = req.body;
    const roundNum = parseInt(round);
    
    // Validate required fields
    if (!sessionId || Number.isNaN(roundNum)) {
      return res.status(400).json({ error: 'sessionId and round are required', details: { sessionId, round } });
    }
    
    // Validate answers structure
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'answers must be a valid object' });
    }
    
    // Ensure answers has the expected structure
    if (!answers.mcq || !answers.desc) {
      console.log('Malformed answers object:', JSON.stringify(answers));
      // Initialize missing properties if needed
      answers.mcq = answers.mcq || {};
      answers.desc = answers.desc || {};
    }

    // First, find the session to verify it exists
    const sessionExists = await InterviewSession.findOne({ 
      userId, 
      'interviews.sessionId': sessionId,
      'interviews.rounds.round': roundNum
    });
    
    if (!sessionExists) return res.status(404).json({ error: 'Session or round not found', details: { sessionId, round: roundNum } });
    
    // Debug the incoming answers
    console.log('Received answers:', JSON.stringify(answers));
    
    // Use MongoDB's update operators to directly update the nested document
    // This is more reliable for nested document updates
    const result = await InterviewSession.updateOne(
      { 
        userId, 
        'interviews.sessionId': sessionId,
        'interviews.rounds.round': roundNum 
      },
      { 
        $set: { 
          'interviews.$[i].rounds.$[r].answers.mcq': answers.mcq,
          'interviews.$[i].rounds.$[r].answers.desc': answers.desc,
          'interviews.$[i].rounds.$[r].submittedAt': new Date() 
        } 
      },
      { 
        arrayFilters: [
          { 'i.sessionId': sessionId },
          { 'r.round': roundNum }
        ]
      }
    );
    
    console.log('Update result:', JSON.stringify(result));
    
    // Verify the save worked by fetching the document again
    const verifySession = await InterviewSession.findOne(
      { userId, 'interviews.sessionId': sessionId },
      { 'interviews.$': 1 }
    );
    
    if (verifySession && verifySession.interviews && verifySession.interviews[0]) {
      const verifyRound = verifySession.interviews[0].rounds.find(r => r.round === round);
      if (verifyRound) {
        console.log('Verified saved answers:', JSON.stringify(verifyRound.answers));
      } else {
        console.log('Could not find round in verification query');
      }
    } else {
      console.log('Verification query did not return expected structure');
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Submit error', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
