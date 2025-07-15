import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { PDFExtract } from 'pdf.js-extract';

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
    console.log('Python hello route called with query:', req.query);
    
    // Path to the Python script
    const pythonScriptPath = path.join(__dirname, '..', 'python', 'untitled39.py');
    
    // Get name from query parameter or use default
    const nameToSend = req.query.name || "Siddharth";
    console.log(`Sending name to Python script: ${nameToSend}`);
    
    // Default array of numbers
    const numbersArray = req.query.numbers || "10,20,30";
    console.log(`Sending numbers to Python script: ${numbersArray}`);
    
    // Spawn a child process to run the Python script with the name and numbers as arguments
    const pythonProcess = spawn('python', [pythonScriptPath, nameToSend, numbersArray, "dummy", "dummy", "dummy", process.env.GROQ_API_KEY]);
    console.log(`Python process started with script: ${pythonScriptPath}`);
    
    let dataString = '';
    
    // Collect data from script
    pythonProcess.stdout.on('data', (data) => {
        dataString += data.toString();
    });
    
    // Handle errors
    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python script error: ${data}`);
        console.error('Error details:', data.toString());
        return res.status(500).json({ error: 'Python script execution failed', details: data.toString() });
    });
    
    // Handle process errors (e.g., Python executable not found)
    pythonProcess.on('error', (error) => {
        console.error(`Failed to start Python process: ${error.message}`);
        return res.status(500).json({ error: 'Failed to start Python process', details: error.message });
    });
    
    // When the script is done
    pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code: ${code}`);
        console.log('Last received data:', dataString);
        
        if (code !== 0) {
            console.error(`Python script failed with exit code ${code}`);
            return res.status(500).json({ error: `Python script exited with code ${code}`, lastOutput: dataString });
        }
        
        const output = dataString.trim();
        console.log(`Python script output: ${output}`);
        
        // Return the output from the Python script
        return res.status(200).json({ 
            message: output,
            input: {
                name: nameToSend,
                numbers: numbersArray
            },
            success: true
        });
    });
});

// Route to analyze resume using Python script
router.post('/analyze-resume', upload.single('resume'), async (req, res) => {
    console.log('Resume analysis route called');
    
    if (!req.file) {
        return res.status(400).json({ error: 'No resume file uploaded' });
    }
    
    // Extract required fields from request body
    const { currentRole, targetRole, experience, jobDescription } = req.body;
    
    // Validate required fields
    if (!currentRole || !targetRole || !experience || !jobDescription) {
        return res.status(400).json({ 
            error: 'Missing required fields', 
            details: 'Please provide currentRole, targetRole, experience, and jobDescription' 
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
    const pythonScriptPath = path.join(__dirname, '..', 'python', 'untitled39.py');
    
    // Spawn a child process to run the Python script with the extracted text and other parameters
    const pythonProcess = spawn('python', [
        pythonScriptPath, 
        extractedText,
        jobDescription,
        currentRole,
        targetRole,
        experience,
        process.env.GROQ_API_KEY // Pass the GROQ_API_KEY from environment variables
    ]);
    
    console.log(`Python process started with script: ${pythonScriptPath}`);
    
    let dataString = '';
    
    // Collect data from script
    pythonProcess.stdout.on('data', (data) => {
        dataString += data.toString();
    });
    
    // Handle errors
    let hasResponded = false;
    
    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python script error: ${data}`);
        if (!hasResponded) {
            hasResponded = true;
            return res.status(500).json({ error: 'Python script execution failed', details: data.toString() });
        }
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
    pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code: ${code}`);
        
        if (code !== 0 && !hasResponded) {
            hasResponded = true;
            return res.status(500).json({ error: `Python script exited with code ${code}` });
        }
        
        if (!hasResponded) {
            const output = dataString.trim();
            console.log(`Python script output length: ${output.length} characters`);
            
            // Return the output from the Python script
            return res.status(200).json({ 
                message: output,
                input: {
                    currentRole,
                    targetRole,
                    experience,
                    jobDescription: jobDescription.substring(0, 100) + '...' // Truncate for logging
                },
                success: true
            });
        }
    });
});

export default router;