import express from 'express';
import jwt from 'jsonwebtoken';
import InterviewSession from '../models/InterviewSession.js';

const router = express.Router();

// GET /api/interview-analytics
router.get('/', async (req, res) => {
    try {
        const token = req.headers.authorization?.split('Bearer ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized', message: 'No authorization token provided' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            return res.status(401).json({ error: 'Invalid token', message: 'Authentication token is invalid' });
        }

        const userId = decoded.userId;

        // Get user's interview sessions
        const userSessions = await InterviewSession.findOne({ userId });

        if (!userSessions) {
            return res.json({
                success: true,
                analytics: {
                    aiInterview: {
                        totalSessions: 0,
                        totalRounds: 0,
                        averageScore: 0,
                        bestScore: 0,
                        totalQuestions: 0,
                        correctAnswers: 0,
                        recentSessions: [],
                        scoreHistory: [],
                        performanceByRound: []
                    },
                    resumeInterview: {
                        totalSessions: 0,
                        averageScore: 0,
                        bestScore: 0,
                        totalQuestions: 0,
                        correctAnswers: 0,
                        recentSessions: [],
                        scoreHistory: [],
                        performanceByFocusArea: {
                            skills: { sessions: 0, averageScore: 0 },
                            projects: { sessions: 0, averageScore: 0 },
                            work_experience: { sessions: 0, averageScore: 0 }
                        }
                    },
                    overall: {
                        totalSessions: 0,
                        totalQuestions: 0,
                        overallAccuracy: 0,
                        timeSpent: 0,
                        improvementTrend: 'stable'
                    }
                }
            });
        }

        // Process AI Interview Analytics
        const aiInterviews = userSessions.interviews || [];
        let aiTotalSessions = aiInterviews.length;
        let aiTotalRounds = 0;
        let aiTotalScore = 0;
        let aiMaxScore = 0;
        let aiBestScore = 0;
        let aiTotalQuestions = 0;
        let aiCorrectAnswers = 0;
        let aiScoreHistory = [];
        let aiPerformanceByRound = [];

        aiInterviews.forEach(interview => {
            const rounds = interview.rounds || [];
            aiTotalRounds += rounds.length;

            rounds.forEach((round, roundIndex) => {
                if (round.validation) {
                    const score = round.validation.total_score || 0;
                    const maxScore = round.validation.max_possible_score || 0;
                    const percentage = round.validation.percentage || 0;

                    aiTotalScore += score;
                    aiMaxScore += maxScore;
                    aiBestScore = Math.max(aiBestScore, percentage);

                    // Count questions and correct answers
                    if (round.validation.mcq) {
                        aiTotalQuestions += round.validation.mcq.max_score || 0;
                        aiCorrectAnswers += round.validation.mcq.score || 0;
                    }
                    if (round.validation.descriptive) {
                        aiTotalQuestions += round.validation.descriptive.max_score || 0;
                        aiCorrectAnswers += round.validation.descriptive.score || 0;
                    }

                    // Score history
                    aiScoreHistory.push({
                        date: round.validatedAt || round.submittedAt || round.createdAt,
                        score: percentage,
                        round: round.round,
                        sessionId: interview.sessionId
                    });

                    // Performance by round
                    if (!aiPerformanceByRound[roundIndex]) {
                        aiPerformanceByRound[roundIndex] = { round: roundIndex + 1, scores: [], averageScore: 0 };
                    }
                    aiPerformanceByRound[roundIndex].scores.push(percentage);
                }
            });
        });

        // Calculate averages for AI interviews
        aiPerformanceByRound.forEach(roundData => {
            roundData.averageScore = roundData.scores.reduce((a, b) => a + b, 0) / roundData.scores.length;
        });

        const aiAverageScore = aiMaxScore > 0 ? (aiTotalScore / aiMaxScore) * 100 : 0;

        // Process Resume Interview Analytics
        const resumeInterviews = userSessions.resumeInterviews || [];
        let resumeTotalSessions = resumeInterviews.length;
        let resumeTotalScore = 0;
        let resumeMaxScore = 0;
        let resumeBestScore = 0;
        let resumeTotalQuestions = 0;
        let resumeCorrectAnswers = 0;
        let resumeScoreHistory = [];
        let resumePerformanceByFocusArea = {
            skills: { sessions: 0, totalScore: 0, maxScore: 0, averageScore: 0 },
            projects: { sessions: 0, totalScore: 0, maxScore: 0, averageScore: 0 },
            work_experience: { sessions: 0, totalScore: 0, maxScore: 0, averageScore: 0 }
        };

        resumeInterviews.forEach(interview => {
            if (interview.validation) {
                const score = interview.validation.total_score || 0;
                const maxScore = interview.validation.max_possible_score || 0;
                const percentage = interview.validation.percentage || 0;

                resumeTotalScore += score;
                resumeMaxScore += maxScore;
                resumeBestScore = Math.max(resumeBestScore, percentage);

                // Count questions and correct answers
                if (interview.validation.mcq) {
                    resumeTotalQuestions += interview.validation.mcq.max_score || 0;
                    resumeCorrectAnswers += interview.validation.mcq.score || 0;
                }
                if (interview.validation.descriptive) {
                    resumeTotalQuestions += interview.validation.descriptive.max_score || 0;
                    resumeCorrectAnswers += interview.validation.descriptive.score || 0;
                }

                // Score history
                resumeScoreHistory.push({
                    date: interview.validatedAt || interview.submittedAt || interview.createdAt,
                    score: percentage,
                    focusArea: interview.focusArea,
                    sessionId: interview.sessionId
                });

                // Performance by focus area
                const focusArea = interview.focusArea;
                if (resumePerformanceByFocusArea[focusArea]) {
                    resumePerformanceByFocusArea[focusArea].sessions++;
                    resumePerformanceByFocusArea[focusArea].totalScore += score;
                    resumePerformanceByFocusArea[focusArea].maxScore += maxScore;
                }
            }
        });

        // Calculate averages for resume interviews
        Object.keys(resumePerformanceByFocusArea).forEach(area => {
            const areaData = resumePerformanceByFocusArea[area];
            areaData.averageScore = areaData.maxScore > 0 ? (areaData.totalScore / areaData.maxScore) * 100 : 0;
        });

        const resumeAverageScore = resumeMaxScore > 0 ? (resumeTotalScore / resumeMaxScore) * 100 : 0;

        // Overall analytics
        const totalSessions = aiTotalSessions + resumeTotalSessions;
        const totalQuestions = aiTotalQuestions + resumeTotalQuestions;
        const totalCorrectAnswers = aiCorrectAnswers + resumeCorrectAnswers;
        const overallAccuracy = totalQuestions > 0 ? (totalCorrectAnswers / totalQuestions) * 100 : 0;

        // Calculate improvement trend
        const allScores = [...aiScoreHistory, ...resumeScoreHistory]
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map(item => item.score);

        let improvementTrend = 'stable';
        if (allScores.length >= 3) {
            const recentScores = allScores.slice(-3);
            const earlierScores = allScores.slice(0, -3);
            const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
            const earlierAvg = earlierScores.reduce((a, b) => a + b, 0) / earlierScores.length;

            if (recentAvg > earlierAvg + 5) improvementTrend = 'improving';
            else if (recentAvg < earlierAvg - 5) improvementTrend = 'declining';
        }

        // Get recent sessions (last 5)
        const aiRecentSessions = aiScoreHistory
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5)
            .map(session => ({
                date: session.date,
                score: session.score,
                type: 'AI Interview',
                round: session.round
            }));

        const resumeRecentSessions = resumeScoreHistory
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5)
            .map(session => ({
                date: session.date,
                score: session.score,
                type: 'Resume Interview',
                focusArea: session.focusArea
            }));

        res.json({
            success: true,
            analytics: {
                aiInterview: {
                    totalSessions: aiTotalSessions,
                    totalRounds: aiTotalRounds,
                    averageScore: Math.round(aiAverageScore * 100) / 100,
                    bestScore: Math.round(aiBestScore * 100) / 100,
                    totalQuestions: aiTotalQuestions,
                    correctAnswers: aiCorrectAnswers,
                    recentSessions: aiRecentSessions,
                    scoreHistory: aiScoreHistory.sort((a, b) => new Date(a.date) - new Date(b.date)),
                    performanceByRound: aiPerformanceByRound
                },
                resumeInterview: {
                    totalSessions: resumeTotalSessions,
                    averageScore: Math.round(resumeAverageScore * 100) / 100,
                    bestScore: Math.round(resumeBestScore * 100) / 100,
                    totalQuestions: resumeTotalQuestions,
                    correctAnswers: resumeCorrectAnswers,
                    recentSessions: resumeRecentSessions,
                    scoreHistory: resumeScoreHistory.sort((a, b) => new Date(a.date) - new Date(b.date)),
                    performanceByFocusArea: resumePerformanceByFocusArea
                },
                overall: {
                    totalSessions,
                    totalQuestions,
                    overallAccuracy: Math.round(overallAccuracy * 100) / 100,
                    timeSpent: 0, // Could be calculated if we track time
                    improvementTrend
                }
            }
        });

    } catch (error) {
        console.error('Error fetching interview analytics:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to fetch interview analytics'
        });
    }
});

export default router;