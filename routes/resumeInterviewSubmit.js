import express from 'express';
import jwt from 'jsonwebtoken';
import InterviewSession from '../models/InterviewSession.js';

const router = express.Router();

router.post('/submit', async (req, res) => {
    try {
        const token = req.headers.authorization?.split('Bearer ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        const { userId } = jwt.decode(token);
        const { sessionId, answers } = req.body;

        // Validate required fields
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required', details: { sessionId } });
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
            'resumeInterviews.sessionId': sessionId
        });

        if (!sessionExists) {
            return res.status(404).json({ error: 'Resume interview session not found', details: { sessionId } });
        }

        // Debug the incoming answers
        console.log('Received resume interview answers:', JSON.stringify(answers));

        // Use MongoDB's update operators to directly update the nested document
        const result = await InterviewSession.updateOne(
            {
                userId,
                'resumeInterviews.sessionId': sessionId
            },
            {
                $set: {
                    'resumeInterviews.$.answers.mcq': answers.mcq,
                    'resumeInterviews.$.answers.desc': answers.desc,
                    'resumeInterviews.$.submittedAt': new Date()
                }
            }
        );

        console.log('Resume interview update result:', JSON.stringify(result));

        // Verify the save worked by fetching the document again
        const verifySession = await InterviewSession.findOne(
            { userId, 'resumeInterviews.sessionId': sessionId },
            { 'resumeInterviews.$': 1 }
        );

        if (verifySession && verifySession.resumeInterviews && verifySession.resumeInterviews[0]) {
            console.log('Verified saved resume interview answers:', JSON.stringify(verifySession.resumeInterviews[0].answers));
        } else {
            console.log('Resume interview verification query did not return expected structure');
        }

        return res.json({ success: true });
    } catch (err) {
        console.error('Resume interview submit error', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;