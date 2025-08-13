import { spawn } from 'child_process';

const userAnswers = {
  desc: {
    0: 'iujpn;lkm,',
    1: 'ugeorihvdsojpak cmxguoeipuoivp;welaSKXZ',
    2: '8YWIPEOULIJSADVKM CUOEIUODSLHIJKALSE,DŚĪOJX'
  },
  mcq: {
    0: 'A. Front-end development',
    1: 'A. High bias',
    2: 'A. To refer to the global object',
    3: 'A. O(n)',
    4: 'A. \'==\' checks for value equality, \'===\' checks for type equality'
  }
};

const questions = {
  mcq_questions: [],
  desc_questions: []
};

// Use command line arguments instead of stdin
const pythonProcess = spawn('python', [
  'python/validate_interview.py',
  '--session_id', 'test-session',
  '--user_answers', JSON.stringify(userAnswers),
  '--questions', JSON.stringify(questions)
]);


let pythonOutput = '';
let pythonError = '';

pythonProcess.stdout.on('data', (data) => {
  pythonOutput += data.toString();
  console.log('Python output:', data.toString());
});

pythonProcess.stderr.on('data', (data) => {
  pythonError += data.toString();
  console.log('Python error:', data.toString());
});

pythonProcess.on('close', (code) => {
  console.log(`Python process exited with code ${code}`);
  
  if (pythonOutput) {
    try {
      const validationResult = JSON.parse(pythonOutput);
      console.log('Validation result:', JSON.stringify(validationResult, null, 2));
    } catch (error) {
      console.error('Error parsing validation results:', error);
      console.log('Python output:', pythonOutput);
    }
  } else {
    console.error('No output from Python script');
  }
});