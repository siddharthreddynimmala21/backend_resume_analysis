import express from 'express';
import auth from '../middleware/auth.js';
import requireAdmin from '../middleware/requireAdmin.js';
import User from '../models/User.js';
import InterviewSession from '../models/InterviewSession.js';

const router = express.Router();

// GET /api/admin/users?search=&page=&limit=
router.get('/users', auth, requireAdmin, async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10 } = req.query;
    const q = {};
    if (search) {
      q.email = { $regex: new RegExp(search, 'i') };
    }

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.max(parseInt(limit) || 10, 1);

    const [total, users] = await Promise.all([
      User.countDocuments(q),
      User.find(q, { email: 1, resumeUploadCount: 1, createdAt: 1 })
        .sort({ email: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
    ]);

    return res.json({ users, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error('Admin GET /users error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/users/:userId/resume-count
router.get('/users/:userId/resume-count', auth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId, { resumeUploadCount: 1 });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ resumeUploadCount: user.resumeUploadCount || 0 });
  } catch (err) {
    console.error('Admin GET /users/:userId/resume-count error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/users/:userId/interviews
router.get('/users/:userId/interviews', auth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const sessions = await InterviewSession.find({ userId });

    const summaries = [];
    let totalInterviews = 0;

    for (const s of sessions) {
      for (const interview of (s.interviews || [])) {
        totalInterviews += 1;
        const rounds = (interview.rounds || []).map(r => {
          const v = r.validation || {};
          // Round pass rule: reuse existing verdict logic -> Pass when percentage >= 60 (from validate_interview.py)
          const percentage = typeof v.percentage === 'number' ? v.percentage : 0;
          const passed = percentage >= 60;

          // Build questions details combining MCQ and Descriptive
          const mcqDetails = Array.isArray(v.mcq?.details) ? v.mcq.details.map((d, i) => ({
            type: 'mcq',
            index: i,
            question: d.question,
            user_answer: d.user_answer,
            correct_answer: d.correct_answer,
            is_correct: d.is_correct,
            options: d.options,
          })) : [];

          const descDetails = Array.isArray(v.descriptive?.details) ? v.descriptive.details.map((d, i) => ({
            type: 'desc',
            index: i,
            question: d.question,
            user_answer: d.user_answer,
            score: d.score,
            max_score: d.max_score,
            feedback: d.feedback,
          })) : [];

          return {
            round: r.round,
            createdAt: r.createdAt,
            submittedAt: r.submittedAt,
            validatedAt: r.validatedAt,
            scores: {
              mcq: { score: v.mcq?.score ?? 0, max_score: v.mcq?.max_score ?? 0 },
              descriptive: { score: v.descriptive?.score ?? 0, max_score: v.descriptive?.max_score ?? 0 },
              total_score: v.total_score ?? 0,
              max_possible_score: v.max_possible_score ?? 0,
              verdict: v.verdict || '',
              percentage: percentage,
              passed,
            },
            questions: [...mcqDetails, ...descDetails],
          };
        });

        const roundsPassed = rounds.filter(r => r.scores.passed).length;
        summaries.push({
          sessionId: interview.sessionId,
          roundsPassed,
          rounds,
        });
      }
    }

    return res.json({ totalInterviews, sessions: summaries });
  } catch (err) {
    console.error('Admin GET /users/:userId/interviews error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
