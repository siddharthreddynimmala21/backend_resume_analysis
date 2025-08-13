import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sample data for testing
const sessionId = 'test-session';
const userAnswers = {
  mcq: {
    '0': 'A',
    '1': 'B'
  },
  desc: {}
};

const questions = {
  mcq_questions: [
    {
      question: 'What is 1+1?',
      options: ['A. 2', 'B. 3', 'C. 4', 'D. 5'],
      answer: 'A. 2'
    },
    {
      question: 'What is the capital of France?',
      options: ['A. London', 'B. Paris', 'C. Berlin', 'D. Rome'],
      answer: 'B. Paris'
    }
  ],
  desc_questions: []
};

// Convert to JSON strings
const userAnswersJson = JSON.stringify(userAnswers);
const questionsJson = JSON.stringify(questions);

console.log('User Answers:', userAnswersJson);
console.log('Questions:', questionsJson);

// Create a modified version of the Python script that skips descriptive validation
const modifiedPythonScript = `
import argparse
import json
import os
from typing import Dict, List, Any, Tuple

def validate_mcq_answers(user_answers: Dict[str, str], correct_answers: List[Dict]) -> Tuple[int, int, List[Dict]]:
    """
    Validate MCQ answers and calculate score.
    Each correct MCQ is worth 1 point.
    
    Returns:
        Tuple containing (score, max_possible_score, detailed_results)
    """
    score = 0
    max_score = len(correct_answers)
    detailed_results = []
    
    # Debug logging
    print(f"DEBUG: MCQ validation - User answers: {json.dumps(user_answers)}")
    print(f"DEBUG: MCQ validation - Correct answers count: {len(correct_answers)}")
    if len(correct_answers) > 0:
        print(f"DEBUG: MCQ validation - First correct answer: {json.dumps(correct_answers[0])}")
    else:
        print("DEBUG: MCQ validation - No correct answers provided")
    
    for idx, question_data in enumerate(correct_answers):
        question = question_data["question"]
        correct_answer = question_data["answer"]
        options = question_data["options"]
        
        # Convert string index to actual answer option
        user_answer = user_answers.get(str(idx))
        
        is_correct = False
        if user_answer:
            # Extract the letter prefix if it exists (e.g., "A. Option" -> "A")
            correct_letter = correct_answer.split(".")[0] if "." in correct_answer else correct_answer
            
            # Check if user's answer matches the correct answer
            if user_answer.startswith(correct_letter) or user_answer == correct_letter:
                score += 1
                is_correct = True
        
        detailed_results.append({
            "question": question,
            "user_answer": user_answer,
            "correct_answer": correct_answer,
            "is_correct": is_correct,
            "options": options
        })
    
    return score, max_score, detailed_results

def generate_validation_report(mcq_results, desc_results=None):
    """
    Generate a comprehensive validation report.
    
    Args:
        mcq_results: Tuple of (score, max_score, detailed_results) for MCQs
        desc_results: Tuple of (score, max_score, detailed_results) for descriptive questions
    
    Returns:
        Dictionary containing the validation report
    """
    mcq_score, mcq_max, mcq_details = mcq_results
    
    # If descriptive results are not provided, use default values
    if desc_results is None:
        desc_score, desc_max, desc_details = 0, 0, []
    else:
        desc_score, desc_max, desc_details = desc_results
    
    # Calculate total score and percentage
    total_score = mcq_score + desc_score
    max_possible_score = mcq_max + desc_max
    
    # Determine verdict (Pass/Fail)
    # Passing threshold is 60%
    percentage = (total_score / max_possible_score * 100) if max_possible_score > 0 else 0
    verdict = "Pass" if percentage >= 60 else "Fail"
    
    # Compile the report
    report = {
        "mcq": {
            "score": mcq_score,
            "max_score": mcq_max,
            "details": mcq_details
        },
        "descriptive": {
            "score": desc_score,
            "max_score": desc_max,
            "details": desc_details
        },
        "total_score": total_score,
        "max_possible_score": max_possible_score,
        "verdict": verdict,
        "percentage": round(percentage, 2)
    }
    
    return report

def main():
    parser = argparse.ArgumentParser(description="Validate interview answers and generate a score report")
    parser.add_argument("--session_id", required=True, help="Session ID of the interview")
    parser.add_argument("--user_answers", required=True, help="JSON string of user answers")
    parser.add_argument("--questions", required=True, help="JSON string of questions with correct answers")
    
    args = parser.parse_args()
    
    try:
        # Parse input JSON
        user_answers = json.loads(args.user_answers)
        questions = json.loads(args.questions)
        
        # Debug logging
        print(f"DEBUG: Parsed user_answers: {json.dumps(user_answers)}")
        print(f"DEBUG: Parsed questions: {json.dumps(questions)}")
        print(f"DEBUG: MCQ questions count: {len(questions.get('mcq_questions', []))}")
        print(f"DEBUG: Descriptive questions count: {len(questions.get('desc_questions', []))}")
        print(f"DEBUG: User MCQ answers count: {len(user_answers.get('mcq', {}))}")
        print(f"DEBUG: User descriptive answers count: {len(user_answers.get('desc', {}))}")
        
        # Check if answers and questions are empty
        if not user_answers.get('mcq') and not user_answers.get('desc'):
            print("WARNING: Both MCQ and descriptive answers are empty")
        
        if not questions.get('mcq_questions') and not questions.get('desc_questions'):
            print("WARNING: Both MCQ and descriptive questions are empty")
        
        # Validate MCQ answers
        mcq_results = validate_mcq_answers(
            user_answers.get("mcq", {}),
            questions.get("mcq_questions", [])
        )
        
        # Skip descriptive validation for this test
        desc_results = (0, 0, [])
        
        # Generate validation report
        report = generate_validation_report(mcq_results, desc_results)
        
        # Add session ID to the report
        output = {
            "session_id": args.session_id,
            "validation_report": report
        }
        
        # Output the report as JSON
        print(json.dumps(output))
        
    except Exception as e:
        error_output = {
            "error": str(e),
            "session_id": args.session_id
        }
        print(json.dumps(error_output))
        raise

if __name__ == "__main__":
    main()
`;

// Write the modified Python script to a temporary file
const tempPythonScriptPath = path.join(__dirname, 'temp_validate.py');
fs.writeFileSync(tempPythonScriptPath, modifiedPythonScript);

// Spawn Python process using the temporary script
const pythonProcess = spawn('python', [
  tempPythonScriptPath,
  '--session_id', sessionId,
  '--user_answers', userAnswersJson,
  '--questions', questionsJson
]);

let pythonData = '';
let pythonError = '';

pythonProcess.stdout.on('data', (data) => {
  pythonData += data.toString();
  console.log('Python output:', data.toString());
});

pythonProcess.stderr.on('data', (data) => {
  pythonError += data.toString();
  console.error('Python error:', data.toString());
});

pythonProcess.on('close', (code) => {
  console.log(`Python process exited with code ${code}`);
  
  if (code !== 0) {
    console.error('Python process failed');
    console.error(pythonError);
    return;
  }
  
  try {
    // Extract the JSON output from the Python script
    const jsonOutput = pythonData.split('\n').filter(line => line.trim().startsWith('{') && line.includes('validation_report')).pop();
    if (jsonOutput) {
      const validationResult = JSON.parse(jsonOutput);
      console.log('Validation result:', JSON.stringify(validationResult, null, 2));
    } else {
      console.error('No valid JSON output found');
    }
  } catch (error) {
    console.error('Error parsing validation results:', error);
    console.error('Python output:', pythonData);
  }
  
  // Clean up the temporary file
  try {
    fs.unlinkSync(tempPythonScriptPath);
  } catch (error) {
    console.error('Error deleting temporary file:', error);
  }
});