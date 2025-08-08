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
    if (!sessionId || typeof round !== 'number') {
      return res.status(400).json({ error: 'sessionId and round are required' });
    }

    const session = await InterviewSession.findOne({ userId, 'interviews.sessionId': sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const interview = session.interviews.find((i) => i.sessionId === sessionId);
    const roundDoc = interview.rounds.find((r) => r.round === round);
    if (!roundDoc) return res.status(404).json({ error: 'Round not found' });

    roundDoc.answers = answers;
    await session.save();

    return res.json({ success: true });
  } catch (err) {
    console.error('Submit error', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
