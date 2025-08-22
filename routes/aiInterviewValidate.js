import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import InterviewSession from '../models/InterviewSession.js';
import User from '../models/User.js';
import { sendPDFReportEmail, sendMarkdownReportEmail } from '../utils/emailService.js';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @route POST /api/ai-interview/validate
 * @desc Validate interview answers using Python backend and Groq API
 * @access Private
 */
router.post('/validate', async (req, res) => {
  try {
    const { sessionId, round, sendEmail } = req.body;

    if (!sessionId || round === undefined) {
      return res.status(400).json({ error: 'Session ID and round are required' });
    }

    // Find the interview session
    const session = await InterviewSession.findOne({
      'interviews.sessionId': sessionId
    });

    if (!session) {
      return res.status(404).json({ error: 'Interview session not found' });
    }

    // Find the specific interview and round
    const interview = session.interviews.find(i => i.sessionId === sessionId);
    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const roundData = interview.rounds.find(r => r.round === parseInt(round));
    if (!roundData) {
      return res.status(404).json({ error: 'Round not found' });
    }

    // Debug: Log the complete roundData structure
    console.log('Debug - Complete roundData:', JSON.stringify(roundData, null, 2));
    console.log('Debug - roundData.questions type:', typeof roundData.questions);
    console.log('Debug - roundData.questions:', roundData.questions);

    // Check if answers have been submitted
    if (!roundData.submittedAt) {
      return res.status(400).json({ error: 'Answers have not been submitted yet' });
    }

    // Prepare data for Python validation script
    const userAnswers = JSON.stringify(roundData.answers);

    // Prepare questions with correct answers
    // The questions are stored as an object with mcq_questions and desc_questions arrays
    let questions = {
      mcq_questions: [],
      desc_questions: []
    };

    // Check if roundData.questions has the expected structure
    if (roundData.questions && Array.isArray(roundData.questions) && roundData.questions.length > 0) {
      // Handle the case where questions is an array containing the structured object
      const questionsData = roundData.questions[0];

      if (questionsData && typeof questionsData === 'object') {
        // Handle the correct structure with mcq_questions and desc_questions
        if (questionsData.mcq_questions && Array.isArray(questionsData.mcq_questions)) {
          questions.mcq_questions = questionsData.mcq_questions.map(q => ({
            question: q.question,
            options: q.options,
            answer: q.answer
          }));
        }

        if (questionsData.desc_questions && Array.isArray(questionsData.desc_questions)) {
          questions.desc_questions = questionsData.desc_questions;
        }
      }
    } else if (roundData.questions && typeof roundData.questions === 'object' && !Array.isArray(roundData.questions)) {
      // Handle the case where questions is directly the structured object
      if (roundData.questions.mcq_questions && Array.isArray(roundData.questions.mcq_questions)) {
        questions.mcq_questions = roundData.questions.mcq_questions.map(q => ({
          question: q.question,
          options: q.options,
          answer: q.answer
        }));
      }

      if (roundData.questions.desc_questions && Array.isArray(roundData.questions.desc_questions)) {
        questions.desc_questions = roundData.questions.desc_questions;
      }
    }

    const questionsJson = JSON.stringify(questions);

    // Debug logging
    console.log('Debug - Session ID:', sessionId);
    console.log('Debug - Round:', round);
    console.log('Debug - Raw Questions from DB:', JSON.stringify(roundData.questions));
    console.log('Debug - User Answers:', userAnswers);
    console.log('Debug - Processed Questions:', questionsJson);
    console.log('Debug - MCQ Questions Count:', questions.mcq_questions.length);
    console.log('Debug - Descriptive Questions Count:', questions.desc_questions.length);
    console.log('Debug - User MCQ Answers Count:', Object.keys(roundData.answers.mcq || {}).length);
    console.log('Debug - User Descriptive Answers Count:', Object.keys(roundData.answers.desc || {}).length);

    // Additional detailed logging
    console.log('Debug - User Answers Structure:', JSON.stringify(roundData.answers));
    console.log('Debug - MCQ Questions Structure:', JSON.stringify(questions.mcq_questions));
    console.log('Debug - Descriptive Questions Structure:', JSON.stringify(questions.desc_questions));

    // Check if the answers structure is as expected
    if (!roundData.answers.mcq || !roundData.answers.desc) {
      console.warn('Warning: User answers structure is not as expected. Missing mcq or desc fields.');
    }

    // Spawn Python process for validation
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
      // Append to error string but also log for debugging
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
            'interviews.sessionId': sessionId,
            'interviews.rounds.round': parseInt(round)
          },
          {
            $set: {
              'interviews.$[interview].rounds.$[round].validation': validationResult.validation_report,
              'interviews.$[interview].rounds.$[round].validatedAt': new Date()
            }
          },
          {
            arrayFilters: [
              { 'interview.sessionId': sessionId },
              { 'round.round': parseInt(round) }
            ]
          }
        );

        if (updateResult.modifiedCount === 0) {
          return res.status(500).json({ error: 'Failed to update validation results' });
        }

        // Email the validation report PDF to the user (legacy, markdown->PDF)
        // Only send if not explicitly disabled by client
        if (sendEmail !== false) try {
          // Re-fetch session to access userId and round data
          const freshSession = await InterviewSession.findOne({ 'interviews.sessionId': sessionId });
          let userEmail = null;
          if (freshSession && freshSession.userId) {
            const user = await User.findById(freshSession.userId);
            userEmail = user?.email || null;
          }

          if (userEmail) {
            // Build a concise markdown report from validation_result
            const v = validationResult.validation_report || {};
            const lines = [];
            lines.push(`# AI Interview Report`);
            lines.push('');
            lines.push(`- Session ID: ${sessionId}`);
            lines.push(`- Round: ${round}`);
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
              lines.push('');
            }
            const markdown = lines.join('\n');

            const subject = 'Your AI Interview Report (PDF)';
            const sent = await sendPDFReportEmail(userEmail, subject, markdown);
            if (!sent) {
              console.error('Report PDF email failed to send to', userEmail, '- attempting Markdown email fallback');
              const fallback = await sendMarkdownReportEmail(userEmail, 'Your AI Interview Report', markdown);
              if (!fallback) {
                console.error('Markdown fallback email also failed for', userEmail);
              }
            }
          } else {
            console.warn('User email not found for session', sessionId);
          }
        } catch (mailErr) {
          console.error('Error while sending interview report email:', mailErr);
        }

        // Return the validation report
        return res.status(200).json({
          message: 'Validation completed successfully',
          validation: validationResult.validation_report
        });

      } catch (error) {
        console.error('Error parsing validation results:', error);
        console.error('Python output:', pythonData);
        return res.status(500).json({ error: 'Failed to parse validation results' });
      }
    });

  } catch (error) {
    console.error('Error in validation route:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
});

export default router;