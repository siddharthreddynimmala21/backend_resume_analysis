import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import InterviewSession from '../models/InterviewSession.js';
import User from '../models/User.js';
import { sendPDFReportEmail, sendMarkdownReportEmail } from '../utils/emailService.js';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @route POST /api/resume-interview/validate
 * @desc Validate resume interview answers using Python backend and Groq API
 * @access Private
 */
router.post('/validate', async (req, res) => {
    try {
        const { sessionId, sendEmail } = req.body;

        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }

        // Find the resume interview session
        const session = await InterviewSession.findOne({
            'resumeInterviews.sessionId': sessionId
        });

        if (!session) {
            return res.status(404).json({ error: 'Resume interview session not found' });
        }

        // Find the specific resume interview
        const resumeInterview = session.resumeInterviews.find(ri => ri.sessionId === sessionId);
        if (!resumeInterview) {
            return res.status(404).json({ error: 'Resume interview not found' });
        }

        // Debug: Log the complete resumeInterview structure
        console.log('Debug - Complete resumeInterview:', JSON.stringify(resumeInterview, null, 2));
        console.log('Debug - resumeInterview.questions type:', typeof resumeInterview.questions);
        console.log('Debug - resumeInterview.questions:', resumeInterview.questions);

        // Check if answers have been submitted
        if (!resumeInterview.submittedAt) {
            return res.status(400).json({ error: 'Answers have not been submitted yet' });
        }

        // Prepare data for Python validation script
        const userAnswers = JSON.stringify(resumeInterview.answers);

        // Prepare questions with correct answers
        let questions = {
            mcq_questions: [],
            desc_questions: []
        };

        // Handle questions structure (similar to AI interview but for resume interview)
        if (resumeInterview.questions && typeof resumeInterview.questions === 'object') {
            if (resumeInterview.questions.mcq_questions && Array.isArray(resumeInterview.questions.mcq_questions)) {
                questions.mcq_questions = resumeInterview.questions.mcq_questions.map(q => ({
                    question: q.question,
                    options: q.options,
                    answer: q.answer
                }));
            }

            if (resumeInterview.questions.desc_questions && Array.isArray(resumeInterview.questions.desc_questions)) {
                questions.desc_questions = resumeInterview.questions.desc_questions;
            }
        }

        const questionsJson = JSON.stringify(questions);

        // Debug logging
        console.log('Debug - Session ID:', sessionId);
        console.log('Debug - Focus Area:', resumeInterview.focusArea);
        console.log('Debug - Raw Questions from DB:', JSON.stringify(resumeInterview.questions));
        console.log('Debug - User Answers:', userAnswers);
        console.log('Debug - Processed Questions:', questionsJson);
        console.log('Debug - MCQ Questions Count:', questions.mcq_questions.length);
        console.log('Debug - Descriptive Questions Count:', questions.desc_questions.length);
        console.log('Debug - User MCQ Answers Count:', Object.keys(resumeInterview.answers?.mcq || {}).length);
        console.log('Debug - User Descriptive Answers Count:', Object.keys(resumeInterview.answers?.desc || {}).length);

        // Check if the answers structure is as expected
        if (!resumeInterview.answers?.mcq || !resumeInterview.answers?.desc) {
            console.warn('Warning: User answers structure is not as expected. Missing mcq or desc fields.');
        }

        // Spawn Python process for validation (reuse the same validation script)
        const pythonScript = path.join(__dirname, '..', 'python', 'validate_interview.py');
        const pythonProcess = spawn('python', [
            pythonScript,
            '--session_id', sessionId,
            '--user_answers', userAnswers,
            '--questions', questionsJson
        ]);

        let pythonData = '';
        let pythonError = '';

        pythonProcess.stdout.on('data', (data) => {
            pythonData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            const errorData = data.toString();
            pythonError += errorData;
            console.log('Python debug output:', errorData);
        });

        // Set a timeout for the Python process
        const timeout = setTimeout(() => {
            pythonProcess.kill();
            return res.status(500).json({ error: 'Validation process timed out' });
        }, 60000); // 60 seconds timeout

        pythonProcess.on('close', async (code) => {
            clearTimeout(timeout);

            if (code !== 0) {
                console.error(`Python process exited with code ${code}`);
                console.error(`Python error: ${pythonError}`);
                return res.status(500).json({ error: 'Validation process failed', details: pythonError });
            }

            try {
                console.log('Raw Python output:', pythonData);

                // Parse the validation results
                const validationResult = JSON.parse(pythonData);
                console.log('Parsed validation result:', JSON.stringify(validationResult, null, 2));

                if (validationResult.error) {
                    return res.status(500).json({ error: validationResult.error });
                }

                // Update the database with validation results
                const updateResult = await InterviewSession.updateOne(
                    {
                        'resumeInterviews.sessionId': sessionId
                    },
                    {
                        $set: {
                            'resumeInterviews.$.validation': validationResult.validation_report,
                            'resumeInterviews.$.validatedAt': new Date()
                        }
                    }
                );

                if (updateResult.modifiedCount === 0) {
                    return res.status(500).json({ error: 'Failed to update validation results' });
                }

                // Email sending (optional)
                if (sendEmail === true) {
                    try {
                        // Re-fetch session to access userId
                        const freshSession = await InterviewSession.findOne({ 'resumeInterviews.sessionId': sessionId });
                        let userEmail = null;
                        if (freshSession && freshSession.userId) {
                            const user = await User.findById(freshSession.userId);
                            userEmail = user?.email || null;
                        }

                        if (userEmail) {
                            // Build a concise markdown report from validation_result
                            const v = validationResult.validation_report || {};
                            const lines = [];
                            lines.push(`# Resume-based Interview Report`);
                            lines.push('');
                            lines.push(`- Session ID: ${sessionId}`);
                            lines.push(`- Focus Area: ${resumeInterview.focusArea}`);
                            lines.push('');
                            if (typeof v.total_score !== 'undefined' || typeof v.max_possible_score !== 'undefined') {
                                lines.push(`## Overall`);
                                if (typeof v.percentage !== 'undefined') lines.push(`- Percentage: ${v.percentage}%`);
                                if (typeof v.total_score !== 'undefined' && typeof v.max_possible_score !== 'undefined') {
                                    lines.push(`- Score: ${v.total_score} / ${v.max_possible_score}`);
                                }
                                if (v.verdict) lines.push(`- Verdict: ${v.verdict}`);
                                lines.push('');
                            }
                            if (v.mcq) {
                                lines.push(`## MCQ Section`);
                                if (typeof v.mcq.score !== 'undefined' && typeof v.mcq.max_score !== 'undefined') {
                                    lines.push(`- Score: ${v.mcq.score} / ${v.mcq.max_score}`);
                                }
                                if (Array.isArray(v.mcq.details) && v.mcq.details.length) {
                                    lines.push('- Details:');
                                    v.mcq.details.forEach((d, i) => {
                                        lines.push(`  - Q${i + 1}: ${typeof d === 'string' ? d : JSON.stringify(d)}`);
                                    });
                                }
                                lines.push('');
                            }
                            if (v.descriptive) {
                                lines.push(`## Descriptive Section`);
                                if (typeof v.descriptive.score !== 'undefined' && typeof v.descriptive.max_score !== 'undefined') {
                                    lines.push(`- Score: ${v.descriptive.score} / ${v.descriptive.max_score}`);
                                }
                                if (Array.isArray(v.descriptive.details) && v.descriptive.details.length) {
                                    lines.push('- Details:');
                                    v.descriptive.details.forEach((d, i) => {
                                        lines.push(`  - Q${i + 1}: ${typeof d === 'string' ? d : JSON.stringify(d)}`);
                                    });
                                }
                            }

                            const markdownContent = lines.join('\n');
                            await sendMarkdownReportEmail(userEmail, 'Resume-based Interview Report', markdownContent);
                            console.log('Resume interview report email sent successfully');
                        } else {
                            console.log('No user email found for resume interview report');
                        }
                    } catch (emailError) {
                        console.error('Failed to send resume interview report email:', emailError);
                        // Don't fail the validation if email fails
                    }
                }

                return res.json({
                    success: true,
                    validation: validationResult.validation_report
                });

            } catch (parseError) {
                console.error('Failed to parse validation result:', parseError);
                console.error('Raw Python output:', pythonData);
                return res.status(500).json({ error: 'Failed to parse validation result' });
            }
        });

    } catch (error) {
        console.error('Resume interview validation error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;