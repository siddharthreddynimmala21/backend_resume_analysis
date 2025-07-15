import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the Python script
const pythonScriptPath = path.join(__dirname, 'python', 'hello.py');

// Test data
const testData = {
    resumeText: 'This is a test resume',
    jobDescription: 'This is a test job description',
    currentRole: 'Current Role',
    targetRole: 'Target Role',
    experience: '5 years'
};

console.log(`Starting Python process with script: ${pythonScriptPath}`);

// Spawn a child process to run the Python script with test data
const pythonProcess = spawn('python', [
    pythonScriptPath, 
    testData.resumeText,
    testData.jobDescription,
    testData.currentRole,
    testData.targetRole,
    testData.experience,
    process.env.GROQ_API_KEY // Pass the GROQ_API_KEY from environment variables
]);

let dataString = '';

// Collect data from script
pythonProcess.stdout.on('data', (data) => {
    const chunk = data.toString();
    console.log(`Python stdout: ${chunk}`);
    dataString += chunk;
});

// Handle errors
pythonProcess.stderr.on('data', (data) => {
    console.error(`Python stderr: ${data}`);
});

// Handle process errors
pythonProcess.on('error', (error) => {
    console.error(`Failed to start Python process: ${error.message}`);
});

// When the script is done
pythonProcess.on('close', (code) => {
    console.log(`Python process exited with code: ${code}`);
    console.log('Final output:', dataString);
});