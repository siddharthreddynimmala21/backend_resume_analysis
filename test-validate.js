import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sample test data
const sessionId = 'test-session-123';
const userAnswers = {
  mcq: {
    '0': 'A. Option 1',
    '1': 'B. Option 2'
  },
  desc: {
    '0': 'This is a sample descriptive answer for testing purposes.',
    '1': 'Another sample answer to test the validation script.'
  }
};

const questions = {
  mcq_questions: [
    {
      question: 'Test MCQ Question 1?',
      options: ['A. Option 1', 'B. Option 2', 'C. Option 3', 'D. Option 4'],
      answer: 'A. Option 1'
    },
    {
      question: 'Test MCQ Question 2?',
      options: ['A. Option 1', 'B. Option 2', 'C. Option 3', 'D. Option 4'],
      answer: 'C. Option 3'
    }
  ],
  desc_questions: [
    'Test Descriptive Question 1?',
    'Test Descriptive Question 2?'
  ]
};

// Convert to JSON strings
const userAnswersJson = JSON.stringify(userAnswers);
const questionsJson = JSON.stringify(questions);

// Path to the Python script
const pythonScript = path.join(__dirname, 'python', 'validate_interview.py');

// Spawn Python process
console.log('Starting validation test...');
const pythonProcess = spawn('python', [
  pythonScript,
  '--session_id', sessionId,
  '--user_answers', userAnswersJson,
  '--questions', questionsJson
]);

let pythonData = '';
let pythonError = '';

pythonProcess.stdout.on('data', (data) => {
  const chunk = data.toString();
  pythonData += chunk;
  console.log('Python output chunk:', chunk);
});

pythonProcess.stderr.on('data', (data) => {
  const chunk = data.toString();
  pythonError += chunk;
  console.error('Python error chunk:', chunk);
});

pythonProcess.on('close', (code) => {
  console.log(`Python process exited with code ${code}`);
  
  if (code !== 0) {
    console.error('Python validation failed with error:', pythonError);
  } else {
    console.log('Python validation completed successfully');
    try {
      const result = JSON.parse(pythonData);
      console.log('Validation result:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Failed to parse Python output as JSON:', error);
      console.log('Raw output:', pythonData);
    }
  }
});