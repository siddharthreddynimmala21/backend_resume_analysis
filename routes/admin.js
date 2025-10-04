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
    const q = { isVerified: true, hasPassword: true };
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

// GET /api/admin/metrics/timeseries?metric=signups|interviews&granularity=day|week&from=&to=
router.get('/metrics/timeseries', auth, requireAdmin, async (req, res) => {
  try {
    const { metric = 'signups', granularity = 'day', from, to } = req.query;
    const start = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = to ? new Date(to) : new Date();

    const dateFormat = granularity === 'week'
      ? { $dateToString: { format: '%G-%V', date: '$date' } } // ISO week key e.g., 2025-37
      : { $dateToString: { format: '%Y-%m-%d', date: '$date' } };

    if (metric === 'signups') {
      const agg = await User.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, isVerified: true, hasPassword: true } },
        { $addFields: { date: '$createdAt' } },
        { $group: { _id: dateFormat, value: { $sum: 1 } } },
        { $project: { _id: 0, key: '$_id', value: 1 } },
        { $sort: { key: 1 } },
      ]);
      return res.json({ metric: 'signups', granularity, from: start, to: end, series: agg });
    }

    if (metric === 'interviews') {
      // Compute an interview date as:
      // 1) min(rounds.createdAt) if any rounds exist
      // 2) else interviews.createdAt if present
      // 3) else session createdAt (if present)
      const agg = await InterviewSession.aggregate([
        { $unwind: '$interviews' },
        { $project: {
          interviews: 1,
          createdAt: 1,
          roundDates: {
            $filter: {
              input: {
                $map: {
                  input: { $ifNull: ['$interviews.rounds', []] },
                  as: 'r',
                  in: '$$r.createdAt'
                }
              },
              as: 'd',
              cond: { $ne: ['$$d', null] }
            }
          }
        } },
        { $addFields: {
          interviewDate: {
            $ifNull: [
              { $min: '$roundDates' },
              { $ifNull: ['$interviews.createdAt', '$createdAt'] }
            ]
          }
        } },
        { $match: { interviewDate: { $gte: start, $lte: end } } },
        { $addFields: { date: '$interviewDate' } },
        { $group: { _id: dateFormat, value: { $sum: 1 } } },
        { $project: { _id: 0, key: '$_id', value: 1 } },
        { $sort: { key: 1 } },
      ]);

      // Pass rate (round-level) over time: per day/week, fraction of rounds passed
      const passAgg = await InterviewSession.aggregate([
        { $unwind: '$interviews' },
        { $unwind: '$interviews.rounds' },
        { $match: { 'interviews.rounds.createdAt': { $gte: start, $lte: end } } },
        { $addFields: {
          _pct: { $ifNull: ['$interviews.rounds.validation.percentage', 0] },
          _date: '$interviews.rounds.createdAt'
        } },
        { $addFields: { _pass: { $gte: ['$_pct', 60] }, date: '$_date' } },
        { $group: { _id: dateFormat, total: { $sum: 1 }, passed: { $sum: { $cond: ['$_pass', 1, 0] } } } },
        { $project: { _id: 0, key: '$_id', total: 1, passed: 1, rate: { $cond: [{ $gt: ['$total', 0] }, { $divide: ['$passed', '$total'] }, 0] } } },
        { $sort: { key: 1 } },
      ]);

      return res.json({ metric: 'interviews', granularity, from: start, to: end, series: agg, passRate: passAgg });
    }

    return res.status(400).json({ error: 'Unsupported metric' });
  } catch (err) {
    console.error('Admin GET /metrics/timeseries error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/metrics/distribution?type=interviews_per_user|mcq_desc|round_pass
router.get('/metrics/distribution', auth, requireAdmin, async (req, res) => {
  try {
    const { type = 'interviews_per_user', from, to } = req.query;
    const start = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = to ? new Date(to) : new Date();

    if (type === 'interviews_per_user') {
      const perUser = await InterviewSession.aggregate([
        { $unwind: '$interviews' },
        // interview date via min round date; if no rounds, skip
        { $unwind: '$interviews.rounds' },
        { $group: { _id: { userId: '$userId', interviewId: '$interviews._id' }, d: { $min: '$interviews.rounds.createdAt' } } },
        { $match: { d: { $gte: start, $lte: end } } },
        { $group: { _id: '$_id.userId', count: { $sum: 1 } } },
        { $project: { _id: 0, userId: '$_id', count: 1 } },
      ]);
      return res.json({ type, from: start, to: end, perUser });
    }

    if (type === 'mcq_desc') {
      // Bucket distributions for MCQ and Descriptive percentages at round-level
      const dist = await InterviewSession.aggregate([
        { $unwind: '$interviews' },
        { $unwind: '$interviews.rounds' },
        { $match: { 'interviews.rounds.createdAt': { $gte: start, $lte: end } } },
        { $addFields: {
          mcqScore: { $ifNull: ['$interviews.rounds.validation.mcq.score', 0] },
          mcqMax: { $ifNull: ['$interviews.rounds.validation.mcq.max_score', 0] },
          descScore: { $ifNull: ['$interviews.rounds.validation.descriptive.score', 0] },
          descMax: { $ifNull: ['$interviews.rounds.validation.descriptive.max_score', 0] },
        } },
        { $addFields: {
          mcqPct: { $cond: [{ $gt: ['$mcqMax', 0] }, { $divide: ['$mcqScore', '$mcqMax'] }, 0] },
          descPct: { $cond: [{ $gt: ['$descMax', 0] }, { $divide: ['$descScore', '$descMax'] }, 0] },
        } },
        { $project: { mcqPct: 1, descPct: 1 } }
      ]);
      return res.json({ type, from: start, to: end, values: dist });
    }

    if (type === 'round_pass') {
      // Pass/fail by round number
      const rp = await InterviewSession.aggregate([
        { $unwind: '$interviews' },
        { $unwind: '$interviews.rounds' },
        { $match: { 'interviews.rounds.createdAt': { $gte: start, $lte: end } } },
        { $addFields: { pct: { $ifNull: ['$interviews.rounds.validation.percentage', 0] } } },
        { $addFields: { pass: { $gte: ['$pct', 60] }, roundNum: '$interviews.rounds.round' } },
        { $group: { _id: '$roundNum', total: { $sum: 1 }, passed: { $sum: { $cond: ['$pass', 1, 0] } } } },
        { $project: { _id: 0, round: '$_id', total: 1, passed: 1, failed: { $subtract: ['$total', '$passed'] } } },
        { $sort: { round: 1 } },
      ]);
      return res.json({ type, from: start, to: end, byRound: rp });
    }

    return res.status(400).json({ error: 'Unsupported distribution type' });
  } catch (err) {
    console.error('Admin GET /metrics/distribution error:', err);
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

// New: Global KPIs overview for Admin dashboard
// GET /api/admin/metrics/overview
// Returns global counts and ratios to power KPI cards
router.get('/metrics/overview', auth, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Users related metrics
    const [
      totalUsers,
      newUsers7d,
      newUsers30d,
    ] = await Promise.all([
      User.countDocuments({ isVerified: true, hasPassword: true }),
      User.countDocuments({ createdAt: { $gte: weekAgo }, isVerified: true, hasPassword: true }),
      User.countDocuments({ createdAt: { $gte: monthAgo }, isVerified: true, hasPassword: true }),
    ]);

    // Sum resume uploads from users
    const uploadsAgg = await User.aggregate([
      { $group: { _id: null, total: { $sum: { $ifNull: [ '$resumeUploadCount', 0 ] } } } }
    ]);
    const resumeUploadsTotal = (uploadsAgg[0]?.total) || 0;

    // Interviews related metrics
    // Use aggregation to count interviews precisely
    const totalInterviewsAgg = await InterviewSession.aggregate([
      { $unwind: '$interviews' },
      { $count: 'totalInterviews' }
    ]);
    const totalInterviews = totalInterviewsAgg[0]?.totalInterviews || 0;

    // Fetch sessions to compute round-based metrics and activity
    const sessions = await InterviewSession.find({}, { userId: 1, interviews: 1 }).lean();
    let totalRounds = 0;
    let sumRoundsPassedPerInterview = 0; // for avg rounds passed per interview

    const activeUsers1d = new Set();
    const activeUsers30d = new Set();

    for (const s of sessions) {
      const uid = String(s.userId);
      const interviews = Array.isArray(s.interviews) ? s.interviews : [];
      for (const interview of interviews) {
        const rounds = Array.isArray(interview.rounds) ? interview.rounds : [];
        let roundsPassedThisInterview = 0;
        for (const r of rounds) {
          totalRounds += 1;
          const v = r?.validation || {};
          const pct = typeof v.percentage === 'number' ? v.percentage : 0;
          const passed = pct >= 60;
          if (passed) roundsPassedThisInterview += 1;
          if (r?.createdAt) {
            const createdAt = new Date(r.createdAt);
            if (createdAt >= dayAgo) activeUsers1d.add(uid);
            if (createdAt >= monthAgo) activeUsers30d.add(uid);
          }
        }
        sumRoundsPassedPerInterview += roundsPassedThisInterview;
      }
    }

    const totalRoundsPassedDerived = sumRoundsPassedPerInterview;
    const overallRoundPassRateFixed = totalRounds > 0 ? (totalRoundsPassedDerived / totalRounds) : 0;

    const avgRoundsPassedPerInterview = totalInterviews > 0 ? (sumRoundsPassedPerInterview / totalInterviews) : 0;

    // Include users who logged in/active recently (even if they didn't do interviews)
    try {
      const recent1dUsers = await User.find(
        {
          $or: [
            { lastActiveAt: { $gte: dayAgo } },
            { lastLoginAt: { $gte: dayAgo } },
          ],
        },
        { _id: 1 }
      ).lean();
      for (const u of recent1dUsers) activeUsers1d.add(String(u._id));

      const recent30dUsers = await User.find(
        {
          $or: [
            { lastActiveAt: { $gte: monthAgo } },
            { lastLoginAt: { $gte: monthAgo } },
          ],
        },
        { _id: 1 }
      ).lean();
      for (const u of recent30dUsers) activeUsers30d.add(String(u._id));
    } catch (e) {
      console.warn('Failed to enrich DAU/MAU with login activity:', e?.message || e);
    }

    const dau = activeUsers1d.size;
    const mau = activeUsers30d.size;
    const dauMauRatio = mau > 0 ? (dau / mau) : 0;

    return res.json({
      totalUsers,
      newUsers7d,
      newUsers30d,
      resumeUploadsTotal,
      totalInterviews,
      avgRoundsPassedPerInterview,
      overallRoundPassRate: overallRoundPassRateFixed,
      dau,
      mau,
      dauMauRatio,
      lastUpdated: now.toISOString(),
    });
  } catch (err) {
    console.error('Admin GET /metrics/overview error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
