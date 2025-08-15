import express from 'express';
import jwt from 'jsonwebtoken';
import reportGenerator from '../services/reportGenerator.js';
import emailService from '../services/emailService.js';
import InterviewSession from '../models/InterviewSession.js';

const router = express.Router();

/**
 * Generate and send interview report via email
 * POST /api/interview-report/send
 */
router.post('/send', async (req, res) => {
    try {
        const token = req.headers.authorization?.split('Bearer ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized', message: 'No authorization token provided' });
        }

        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Session ID is required'
            });
        }

        // Decode token to get user ID
        const decodedToken = jwt.decode(token);
        const userId = decodedToken.userId;

        // Get user email from database
        const User = (await import('../models/User.js')).default;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                message: 'User account not found'
            });
        }

        const userEmail = user.email;
        const userName = user.email.split('@')[0]; // Use email prefix as name

        // Generate comprehensive report
        const report = await reportGenerator.generateInterviewReport(userId, sessionId);

        // Send report via email
        const emailResult = await emailService.sendInterviewReport(
            userEmail,
            userName || 'Candidate',
            report
        );

        // Update database to mark report as sent
        await InterviewSession.updateOne(
            {
                userId,
                'interviews.sessionId': sessionId
            },
            {
                $set: {
                    'interviews.$.reportSentAt': new Date(),
                    'interviews.$.reportSentTo': userEmail
                }
            }
        );

        res.json({
            success: true,
            message: 'Interview report sent successfully',
            messageId: emailResult.messageId,
            reportSummary: {
                sessionId: report.sessionId,
                overallScore: `${report.overallAnalysis.totalScore}/${report.overallAnalysis.maxPossibleScore}`,
                overallPercentage: report.overallAnalysis.overallPercentage,
                verdict: report.overallAnalysis.overallVerdict,
                roundsCompleted: report.totalRounds
            }
        });

    } catch (error) {
        console.error('Error sending interview report:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to generate or send interview report',
            details: error.message
        });
    }
});

/**
 * Generate interview report (without sending email)
 * GET /api/interview-report/generate/:sessionId
 */
router.get('/generate/:sessionId', async (req, res) => {
    try {
        const token = req.headers.authorization?.split('Bearer ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized', message: 'No authorization token provided' });
        }

        const { sessionId } = req.params;

        // Decode token to get user ID
        const decodedToken = jwt.decode(token);
        const userId = decodedToken.userId;

        // Generate comprehensive report
        const report = await reportGenerator.generateInterviewReport(userId, sessionId);

        res.json({
            success: true,
            report
        });

    } catch (error) {
        console.error('Error generating interview report:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to generate interview report',
            details: error.message
        });
    }
});

/**
 * Check if interview is complete and trigger report sending
 * POST /api/interview-report/check-completion
 */
router.post('/check-completion', async (req, res) => {
    try {
        const token = req.headers.authorization?.split('Bearer ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized', message: 'No authorization token provided' });
        }

        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({
                error: 'Missing session ID',
                message: 'Session ID is required'
            });
        }

        // Decode token to get user ID
        const decodedToken = jwt.decode(token);
        const userId = decodedToken.userId;

        // Find the interview session
        const session = await InterviewSession.findOne({
            userId,
            'interviews.sessionId': sessionId
        });

        if (!session) {
            return res.status(404).json({ error: 'Interview session not found' });
        }

        const interview = session.interviews.find(i => i.sessionId === sessionId);
        if (!interview) {
            return res.status(404).json({ error: 'Interview not found' });
        }

        // Check completion criteria
        const completionStatus = checkInterviewCompletion(interview);

        let reportSent = false;
        let reportResult = null;

        // If interview is complete and report hasn't been sent, send it
        if (completionStatus.isComplete && !interview.reportSentAt) {
            try {
                // Get user email from database
                const User = (await import('../models/User.js')).default;
                const user = await User.findById(userId);

                if (user) {
                    const userEmail = user.email;
                    const userName = user.email.split('@')[0]; // Use email prefix as name

                    const report = await reportGenerator.generateInterviewReport(userId, sessionId);
                    reportResult = await emailService.sendInterviewReport(
                        userEmail,
                        userName,
                        report
                    );

                    // Update database to mark report as sent
                    await InterviewSession.updateOne(
                        {
                            userId,
                            'interviews.sessionId': sessionId
                        },
                        {
                            $set: {
                                'interviews.$.reportSentAt': new Date(),
                                'interviews.$.reportSentTo': userEmail
                            }
                        }
                    );

                    reportSent = true;
                }
            } catch (emailError) {
                console.error('Error sending completion report:', emailError);
                // Don't fail the request if email fails
            }
        }

        res.json({
            success: true,
            completionStatus,
            reportSent,
            reportAlreadySent: !!interview.reportSentAt,
            reportSentAt: interview.reportSentAt,
            messageId: reportResult?.messageId
        });

    } catch (error) {
        console.error('Error checking interview completion:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to check interview completion',
            details: error.message
        });
    }
});

/**
 * Helper function to check if interview is complete
 * @param {Object} interview - Interview object
 * @returns {Object} Completion status
 */
function checkInterviewCompletion(interview) {
    const rounds = interview.rounds || [];
    const completedRounds = rounds.filter(r => r.validatedAt).length;
    const totalRounds = 4; // Maximum possible rounds

    // Check if interview failed at any point
    const failedRounds = rounds.filter(r =>
        r.validation &&
        r.validation.verdict === 'Fail' &&
        (r.round === 1 || r.round === 2) // Only technical rounds can cause failure
    );

    // Interview is complete if:
    // 1. All 4 rounds are completed, OR
    // 2. User failed a technical round (1 or 2), OR
    // 3. User completed managerial round (3) - can proceed to HR regardless of score
    const isComplete =
        completedRounds === totalRounds || // All rounds completed
        failedRounds.length > 0 || // Failed a technical round
        (completedRounds >= 3 && rounds.some(r => r.round === 3 && r.validatedAt)); // Completed managerial round

    const lastCompletedRound = Math.max(...rounds.filter(r => r.validatedAt).map(r => r.round), 0);

    return {
        isComplete,
        completedRounds,
        totalRounds,
        lastCompletedRound,
        failedAt: failedRounds.length > 0 ? failedRounds[0].round : null,
        reason: isComplete ?
            (completedRounds === totalRounds ? 'All rounds completed' :
                failedRounds.length > 0 ? `Failed at round ${failedRounds[0].round}` :
                    'Managerial round completed') :
            'Interview in progress'
    };
}

export default router;