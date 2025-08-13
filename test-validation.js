import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file path in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the Python script
const pythonScript = path.join(__dirname, 'python', 'validate_interview.py');

// Test data
const sessionId = 'test-session';
const userAnswers = JSON.stringify({
  "0": "B. O(log n)", 
  "1": "D. All of the above", 
  "2": "B. To refer to the current object", 
  "3": "A. '==' checks for value equality, '===' checks for type and value equality", 
  "4": "B. To handle asynchronous code"
});

const questions = JSON.stringify({
  mcq_questions: [
    {
      question: 'What is the time complexity of binary search?', 
      options: ['A. O(n)', 'B. O(log n)', 'C. O(n log n)', 'D. O(1)'], 
      answer: 'B. O(log n)'
    }
  ], 
  desc_questions: []
});

// Create a temporary Python script that skips descriptive validation
const tempPythonScript = `
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

def generate_validation_report(mcq_results: Tuple[int, int, List[Dict]], 
                              desc_results: Tuple[int, int, List[Dict]]) -> Dict[str, Any]:
    """
    Generate a comprehensive validation report with scores and verdict.
    
    Returns:
        Dictionary containing the validation report
    """
    mcq_score, mcq_max, mcq_details = mcq_results
    desc_score, desc_max, desc_details = desc_results
    
    total_score = mcq_score + desc_score
    max_possible_score = mcq_max + desc_max
    
    # Calculate percentage safely
    percentage = 0
    if max_possible_score > 0:
        percentage = round((total_score / max_possible_score * 100), 2)
    
    # Adjust verdict for edge case where there are no questions
    if max_possible_score == 0:
        verdict = "No Questions Available"
    else:
        # Determine verdict (Pass if score is 10 or above, otherwise Fail)
        verdict = "Pass" if total_score >= 10 else "Fail"
    
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
        "percentage": percentage
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
        
        # Ensure user_answers has the expected structure
        if not isinstance(user_answers, dict):
            print(f"WARNING: user_answers is not a dictionary: {type(user_answers)}")
            user_answers = {}
            
        # Ensure mcq and desc fields exist
        if 'mcq' not in user_answers:
            print("WARNING: 'mcq' field missing in user_answers, adding empty dict")
            user_answers['mcq'] = {}
            
        if 'desc' not in user_answers:
            print("WARNING: 'desc' field missing in user_answers, adding empty dict")
            user_answers['desc'] = {}
            
        # Handle case where user_answers is a flat structure without mcq/desc nesting
        # This happens when the frontend sends answers directly without proper structure
        has_numeric_keys = any(key.isdigit() for key in user_answers.keys())
        if has_numeric_keys and not user_answers.get('mcq') and not user_answers.get('desc'):
            print("WARNING: user_answers appears to be flat structure, restructuring")
            # Try to determine if keys are for MCQ or descriptive based on values
            mcq_answers = {}
            desc_answers = {}
            
            for key, value in user_answers.items():
                if key.isdigit():
                    # If value starts with a letter followed by period, it's likely an MCQ answer
                    if isinstance(value, str) and len(value) > 1 and value[0].isalpha() and value[1:].startswith('. '):
                        mcq_answers[key] = value
                    else:
                        desc_answers[key] = value
            
            user_answers = {
                'mcq': mcq_answers,
                'desc': desc_answers
            }
            print(f"DEBUG: Restructured user_answers: {json.dumps(user_answers)}")
        
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
            
        # Ensure questions has the expected structure
        if not isinstance(questions, dict):
            print(f"WARNING: questions is not a dictionary: {type(questions)}")
            questions = {}
            
        # Ensure mcq_questions and desc_questions fields exist
        if 'mcq_questions' not in questions:
            print("WARNING: 'mcq_questions' field missing in questions, adding empty list")
            questions['mcq_questions'] = []
            
        if 'desc_questions' not in questions:
            print("WARNING: 'desc_questions' field missing in questions, adding empty list")
            questions['desc_questions'] = []
        
        # Validate MCQ answers
        mcq_results = validate_mcq_answers(
            user_answers.get("mcq", {}),
            questions.get("mcq_questions", [])
        )
        
        # Skip descriptive validation for testing
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

// Write the temporary Python script to a file
import fs from 'fs';
const tempScriptPath = path.join(__dirname, 'temp_validate.py');
fs.writeFileSync(tempScriptPath, tempPythonScript);

// Spawn Python process using the temporary script
const pythonProcess = spawn('python', [
  tempScriptPath, 
  '--session_id', sessionId, 
  '--user_answers', userAnswers, 
  '--questions', questions
]);

// Clean up the temporary script when done
pythonProcess.on('close', () => {
  try {
    fs.unlinkSync(tempScriptPath);
    console.log('Temporary script deleted');
  } catch (err) {
    console.error('Error deleting temporary script:', err);
  }
});

// Handle Python process output
pythonProcess.stdout.on('data', (data) => {
  console.log(`Python output: ${data}`);
});

pythonProcess.stderr.on('data', (data) => {
  console.log(`Python error: ${data}`);
});

pythonProcess.on('close', (code) => {
  console.log(`Python process exited with code ${code}`);
});