import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { PDFExtract } from 'pdf.js-extract';
import { sendMarkdownReportEmail } from '../utils/emailService.js';
import auth from '../middleware/auth.js'

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        // Accept only PDF files
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// Initialize PDF extractor
const pdfExtract = new PDFExtract();

// Route to execute Python script for array mean calculation (legacy route)
router.get('/hello', (req, res) => {
    // Path to the Python script
    const pythonScriptPath = path.join(__dirname, '..', 'python', 'untitled39.py');
    
    // Get name from query parameter or use default
    const nameToSend = req.query.name || "Siddharth";
    
    // Default array of numbers
    const numbersArray = req.query.numbers || "10,20,30";
    
    // Prepare arguments for the Python script
    const pythonArgs = [pythonScriptPath, nameToSend, numbersArray, "dummy", "dummy", "dummy", process.env.GROQ_API_KEY];

    // Spawn a child process to run the Python script with the prepared arguments
    const pythonProcess = spawn('python', pythonArgs);
    
    let dataString = '';
    // Collect everything from stderr so we can decide later whether it is fatal
    let errorString = '';
    
    // Collect data from script
    pythonProcess.stdout.on('data', (data) => {
        const decoded = data.toString();
        // Only log in development environment
        if (process.env.NODE_ENV === 'development') {
            console.log(`[PYTHON STDOUT]: ${decoded}`);
        }
        dataString += decoded;
    });
    
    // Handle errors
    pythonProcess.stderr.on('data', (data) => {
        const decodedErr = data.toString();
        console.error(`[PYTHON STDERR]: ${decodedErr}`);
        errorString += decodedErr; // store for later evaluation
    });
    
    // Handle process errors (e.g., Python executable not found)
    pythonProcess.on('error', (error) => {
        console.error(`Failed to start Python process: ${error.message}`);
        return res.status(500).json({ error: 'Failed to start Python process', details: error.message });
    });
    
    // When the script is done
    pythonProcess.on('close', (code) => {
        // Non-zero exit code is always treated as an error
        if (code !== 0) {
            console.error(`Python script failed with exit code ${code}`);
            return res.status(500).json({ 
                error: `Python script exited with code ${code}`,
                stderr: errorString.trim(),
                stdout: dataString.trim() 
            });
        }

        // If exit code is 0, we still succeed, even if there was something on stderr (warnings, etc.)
        const output = dataString.trim();
        return res.status(200).json({ 
            message: output,
            warnings: errorString.trim() || undefined,
            input: {
                name: nameToSend,
                numbers: numbersArray
            },
            success: true
        });
    });
});

// Route to analyze resume using Python script
router.post('/analyze-resume', auth, upload.single('resume'), async (req, res) => {
    console.log('Resume analysis route called');
    
    if (!req.file) {
        return res.status(400).json({ error: 'No resume file uploaded' });
    }
    
    // Extract required fields from request body
    const { currentRole, targetRole, experience, jobDescription, generateJobDescription } = req.body;
    
    // Validate required fields
    if (!currentRole || !targetRole || !experience) {
        return res.status(400).json({ 
            error: 'Missing required fields', 
            details: 'Please provide currentRole, targetRole, and experience' 
        });
    }
    
    // Check if we need to generate a job description
    let finalJobDescription = jobDescription;
    if (generateJobDescription === 'true') {
        try {
            console.log('Generating job description using Groq API...');
            // Import the Groq API function
            const { generateResponse } = await import('../GroqApi.js');
            
            // Create a prompt for generating a job description
            const prompt = `Generate a detailed job description for a ${targetRole} position with ${experience} years of experience requirement. 

The job description should include:
- Required skills and qualifications
- Responsibilities
- Preferred experience
- Education requirements

Make it detailed and professional, suitable for use in resume analysis.`;
            
            // Generate the job description
            finalJobDescription = await generateResponse(prompt);
            console.log('Job description generated successfully');
        } catch (error) {
            console.error('Error generating job description:', error);
            return res.status(500).json({ 
                error: 'Failed to generate job description', 
                details: error.message 
            });
        }
    } else if (!jobDescription) {
        return res.status(400).json({ 
            error: 'Missing job description', 
            details: 'Please provide a job description or select the option to generate one' 
        });
    }
    
    // Parse PDF to extract text
    let extractedText = '';
    try {
        console.log('Starting PDF extraction...');
        const pdfData = await pdfExtract.extractBuffer(req.file.buffer);
        extractedText = pdfData.pages.map(page => page.content.map(item => item.str).join(' ')).join('\n').trim();
        console.log('PDF extraction completed successfully');
    } catch (parseError) {
        console.error('PDF Parsing Error:', parseError);
        return res.status(400).json({ 
            error: 'Failed to parse PDF', 
            details: parseError.message 
        });
    }
    
    // Path to the Python script
    const pythonScriptPath = path.join(__dirname, '..', 'python', 'hello.py');

    // Prepare args for python script and log them
    const pythonArgs = [
        pythonScriptPath,
        extractedText,
        finalJobDescription,
        currentRole,
        targetRole,
        experience,
        process.env.GROQ_API_KEY
    ];

    console.log('Spawning python analyze-resume process with args:', {
        script: pythonScriptPath,
        args: pythonArgs.slice(1, 6).map((a, idx) => `arg${idx + 1}_len=${typeof a === 'string' ? a.length : 'n/a'}`),
        hasApiKey: !!process.env.GROQ_API_KEY
    });

    const pythonProcess = spawn('python', pythonArgs);
    console.log(`Python process (PID: ${pythonProcess.pid}) started for analyze-resume`);
 
    let dataString = '';
    // Container for stderr so we can handle non-fatal warnings
    let errorString = '';
 
    // Collect data from script
    pythonProcess.stdout.on('data', (data) => {
        const decoded = data.toString();
        console.log(`[PYTHON STDOUT]: ${decoded}`);
        dataString += decoded;
    });
 
    // Handle errors
    let hasResponded = false;
    pythonProcess.stderr.on('data', (data) => {
        const decodedErr = data.toString();
        console.error(`[PYTHON STDERR]: ${decodedErr}`);
        errorString += decodedErr; // collect but don't respond yet
    });
    
    // Handle process errors (e.g., Python executable not found)
    pythonProcess.on('error', (error) => {
        console.error(`Failed to start Python process: ${error.message}`);
        if (!hasResponded) {
            hasResponded = true;
            return res.status(500).json({ error: 'Failed to start Python process', details: error.message });
        }
    });
    
    // When the script is done
    pythonProcess.on('close', async (code) => {
        console.log(`Python process exited with code: ${code}`);
        console.log('STDOUT collected length:', dataString.length);
        console.log('STDERR collected length:', errorString.length);
        
        if (code !== 0 && !hasResponded) {
            hasResponded = true;
            return res.status(500).json({ 
                error: `Python script exited with code ${code}`,
                stderr: errorString.trim() 
            });
        }
        
        if (!hasResponded) {
            const output = dataString.trim();
            console.log(`Python script output length: ${output.length} characters`);

            // Validate email configuration before attempting to send
            if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
                console.error('❌ EMAIL CONFIGURATION MISSING!');
                console.error('EMAIL_USER:', process.env.EMAIL_USER ? 'Set' : 'NOT SET');
                console.error('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'Set' : 'NOT SET');
                console.error('Please configure EMAIL_USER and EMAIL_PASSWORD in your .env file');
                console.error('Skipping email send - user will not receive report via email');
                
                hasResponded = true;
                return res.status(200).json({ 
                    message: output,
                    warnings: errorString.trim() || undefined,
                    emailSent: false,
                    emailError: 'Email service not configured. Please configure EMAIL_USER and EMAIL_PASSWORD in .env file.',
                    input: {
                        currentRole,
                        targetRole,
                        experience,
                        jobDescription: finalJobDescription.substring(0, 100) + '...', // Truncate for logging
                        generatedJobDescription: generateJobDescription === 'true'
                    },
                    success: true
                });
            }

            // Build markdown report
            const markdownReport = `# Resume Analysis Report\n\n${output}`;
            
            // Attempt to send the report email before responding
            let emailSent = false;
            let emailError = null;
            
            try {
                console.log(`Attempting to send email to: ${req.user.email}`);
                const emailResult = await sendMarkdownReportEmail(req.user.email, 'Your Resume Analysis Report', markdownReport);
                
                if (emailResult) {
                    emailSent = true;
                    console.log(`✅ Report email successfully sent to ${req.user.email}`);
                } else {
                    emailError = 'Email service returned false - check server logs for details';
                    console.error(`❌ Email sending failed for ${req.user.email} - service returned false`);
                }
            } catch (emailErr) {
                emailError = emailErr.message || 'Unknown email error';
                console.error('❌ Failed to send report email:', emailErr);
                console.error('Email error details:', {
                    message: emailErr.message,
                    code: emailErr.code,
                    command: emailErr.command
                });
            }
            
            hasResponded = true;
            // Return the output from the Python script with email status
            return res.status(200).json({ 
                message: output,
                warnings: errorString.trim() || undefined,
                emailSent: emailSent,
                emailError: emailError,
                input: {
                    currentRole,
                    targetRole,
                    experience,
                    jobDescription: finalJobDescription.substring(0, 100) + '...', // Truncate for logging
                    generatedJobDescription: generateJobDescription === 'true'
                },
                success: true
            });
        }
    });
});

export default router;