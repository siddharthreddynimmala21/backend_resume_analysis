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
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required', details: { sessionId } });
        }
        if (Number.isNaN(roundNum)) {
            return res.status(400).json({ error: 'round is required and must be a number', details: { round } });
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

        // Prefer per-round update if rounds exist; otherwise fallback to legacy fields
        let result;
        const riMatched = (sessionExists.resumeInterviews || []).find(ri => ri.sessionId === sessionId) || null;
        const hasRounds = Array.isArray(riMatched?.rounds) && riMatched.rounds.length > 0;
        if (hasRounds) {
            result = await InterviewSession.updateOne(
                {
                    userId,
                    'resumeInterviews.sessionId': sessionId,
                    'resumeInterviews.rounds.round': roundNum
                },
                {
                    $set: {
                        'resumeInterviews.$[ri].rounds.$[r].answers.mcq': answers.mcq,
                        'resumeInterviews.$[ri].rounds.$[r].answers.desc': answers.desc,
                        'resumeInterviews.$[ri].rounds.$[r].submittedAt': new Date()
                    }
                },
                {
                    arrayFilters: [
                        { 'ri.sessionId': sessionId },
                        { 'r.round': roundNum }
                    ]
                }
            );
        } else {
            result = await InterviewSession.updateOne(
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
        }

        console.log('Resume interview update result:', JSON.stringify(result));

        // Verify the save worked by fetching the document again
        const verifySession = await InterviewSession.findOne(
            { userId, 'resumeInterviews.sessionId': sessionId }
        );

        if (verifySession && Array.isArray(verifySession.resumeInterviews)) {
            const ri = verifySession.resumeInterviews.find(x => x.sessionId === sessionId);
            if (Array.isArray(ri.rounds) && ri.rounds.length) {
                const vr = ri.rounds.find(r => r.round === roundNum);
                console.log('Verified saved resume interview round answers:', JSON.stringify(vr?.answers));
            } else {
                console.log('Verified saved resume interview answers (legacy):', JSON.stringify(ri.answers));
            }
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