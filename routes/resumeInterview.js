import express from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { PDFExtract } from 'pdf.js-extract';
import { spawn } from 'child_process';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import InterviewSession from '../models/InterviewSession.js';
import { fileURLToPath } from 'url';

// Polyfill __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB file size limit
        fieldSize: 10 * 1024 * 1024 // 10MB field size limit
    }
});

const pdfExtract = new PDFExtract();

// POST /resume-interview/start
router.post('/start', upload.single('resume'), async (req, res) => {
    try {
        // Validate file
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded', message: 'Please select a PDF file to upload' });
        }
        if (req.file.mimetype !== 'application/pdf') {
            return res.status(400).json({ error: 'Invalid file type', message: 'Only PDF files are allowed' });
        }
        if (!req.file.buffer || req.file.buffer.length === 0) {
            return res.status(400).json({ error: 'Invalid PDF file', message: 'The uploaded PDF file is empty or corrupted' });
        }

        const token = req.headers.authorization?.split('Bearer ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized', message: 'No authorization token provided' });
        }

        // Parse PDF to extract text
        let extractedText = '';
        try {
            const pdfData = await pdfExtract.extractBuffer(req.file.buffer);
            extractedText = pdfData.pages.map(page => page.content.map(item => item.str).join(' ')).join('\n').trim();
        } catch (parseError) {
            return res.status(400).json({ error: 'PDF Parsing Failed', message: 'Unable to extract text from the PDF', details: parseError.message || 'Unknown parsing error' });
        }
        if (!extractedText) {
            return res.status(400).json({ error: 'No Text Extracted', message: 'No text could be extracted from the PDF' });
        }

        // Get other fields and user
        const { currentRole, targetRole, experience, jobDescription, jobDescriptionOption, focusArea, userId: userIdBody, round, sessionId: sessionIdBody } = req.body;
        const authUserId = req.user?.id; // if you use auth middleware
        const userId = authUserId || userIdBody || 'guest';
        const interviewRound = round || '1'; // Default to round 1

        // Generate unique session ID for resume-based interviews
        const sessionId = sessionIdBody || `resume-${userId}-${Date.now()}-${uuidv4()}`;

        if (!currentRole || !targetRole || !experience || !focusArea) {
            return res.status(400).json({ error: 'Missing fields', message: 'Current role, target role, experience, and focus area are required.' });
        }

        // Validate focus area
        if (!['skills', 'projects', 'work_experience'].includes(focusArea)) {
            return res.status(400).json({ error: 'Invalid focus area', message: 'Focus area must be skills, projects, or work_experience.' });
        }

        // Validate job description based on option
        if (jobDescriptionOption === 'paste' && !jobDescription) {
            return res.status(400).json({ error: 'Missing job description', message: 'Job description is required when paste option is selected.' });
        }

        // Call Python script with proper path
        const scriptPath = path.resolve(__dirname, '../python/resume_interview.py');
        const pythonArgs = [
            scriptPath,
            '--session_id', sessionId,
            '--resume_text', extractedText,
            '--job_desc', jobDescription || '',
            '--job_desc_option', jobDescriptionOption || 'paste',
            '--current_role', currentRole,
            '--target_role', targetRole,
            '--experience', experience,
            '--focus_area', focusArea,
            '--round', interviewRound
        ];

        console.log('[ResumeInterview] Calling Python script with args:', pythonArgs.map(arg => arg.length > 100 ? arg.substring(0, 100) + '...' : arg));

        const pythonProcess = spawn('python', pythonArgs);

        let pythonOutput = '';
        let pythonError = '';

        pythonProcess.stdout.on('data', (data) => {
            pythonOutput += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            pythonError += data.toString();
        });

        // Add a timeout in case the Python process hangs
        const timeoutMs = 60000; // 60 seconds
        let responded = false;
        const safeJson = (status, body) => {
            if (responded || res.headersSent) return;
            responded = true;
            try { res.status(status).json(body); } catch (_) { /* noop */ }
        };
        const timeoutHandle = setTimeout(() => {
            pythonProcess.kill('SIGKILL');
            safeJson(500, { error: 'Python script timeout', details: 'The Python script took too long to respond.' });
        }, timeoutMs);

        pythonProcess.on('error', (err) => {
            clearTimeout(timeoutHandle);
            console.error('[ResumeInterview] Python process error:', err);
            safeJson(500, { error: 'Python script error', details: `Failed to start Python process: ${err.message}` });
        });

        pythonProcess.on('close', async (code) => {
            clearTimeout(timeoutHandle);
            const output = pythonOutput.trim();
            const errorOut = pythonError.trim();
            console.log('[ResumeInterview] Python stdout:', output);
            console.log('[ResumeInterview] Python stderr:', errorOut);
            console.log('[ResumeInterview] Python exit code:', code);

            if (responded || res.headersSent) return; // already handled (e.g., timeout)
            if (code !== 0) {
                return safeJson(500, {
                    error: 'Python script failed',
                    details: errorOut || 'Unknown error',
                    exitCode: code,
                    stdout: output
                });
            }

            // Try to parse JSON coming from python
            let payload;
            try {
                payload = JSON.parse(output);
            } catch (_e) {
                payload = { raw: output };
            }

            // Debug: Log what we're about to store
            console.log('Debug - Payload from Python:', JSON.stringify(payload, null, 2));
            console.log('Debug - payload.questions:', JSON.stringify(payload.questions, null, 2));

            const decodedToken = jwt.decode(token);
            const userId = decodedToken.userId;

            // persist to DB - using a separate collection field for resume interviews
            try {
                const userInterview = await InterviewSession.findOne({ userId: userId });

                if (userInterview) {
                    // Add to existing user's resume interviews
                    if (!userInterview.resumeInterviews) {
                        userInterview.resumeInterviews = [];
                    }
                    userInterview.resumeInterviews.push({
                        sessionId,
                        focusArea,
                        questions: payload.questions,
                        createdAt: new Date()
                    });
                    await userInterview.save();
                } else {
                    // Create new user interview session
                    await InterviewSession.create({
                        userId,
                        interviews: [], // Keep existing AI interviews separate
                        resumeInterviews: [{
                            sessionId,
                            focusArea,
                            questions: payload.questions,
                            createdAt: new Date()
                        }]
                    });
                }
            } catch (dbErr) {
                console.error('Failed to save resume interview session:', dbErr);
            }

            // Remove correct answers before sending to the client
            let clientQuestions = payload.questions;
            if (clientQuestions?.mcq_questions) {
                clientQuestions = {
                    ...clientQuestions,
                    mcq_questions: clientQuestions.mcq_questions.map(({ answer, ...rest }) => rest),
                };
            }

            safeJson(200, {
                success: true,
                sessionId,
                focusArea,
                questions: clientQuestions
            });
        });
    } catch (error) {
        console.error('[ResumeInterview] Error:', error);
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

export default router;