import argparse
import json
import os
import sys
from typing import Dict, List, Any, Tuple

from langchain_groq import ChatGroq
from langchain.prompts import ChatPromptTemplate

def _resolve_groq_model() -> str:
    """Resolve a supported Groq model, remapping deprecated names if needed.
    Honors GROQ_MODEL env var and defaults to a current model if not set.
    """
    alias_map = {
        "llama3-70b-8192": "llama-3.1-70b-versatile",
        "llama3-8b-8192": "llama-3.1-8b-instant",
        "llama3-70b": "llama-3.1-70b-versatile",
        "llama3-8b": "llama-3.1-8b-instant",
    }
    env_model = os.getenv("GROQ_MODEL")
    if env_model:
        return alias_map.get(env_model, env_model)
    return "llama-3.1-8b-instant"

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
    print(f"DEBUG: MCQ validation - User answers: {json.dumps(user_answers)}", file=sys.stderr)
    print(f"DEBUG: MCQ validation - Correct answers count: {len(correct_answers)}", file=sys.stderr)
    if len(correct_answers) > 0:
        print(f"DEBUG: MCQ validation - First correct answer: {json.dumps(correct_answers[0])}", file=sys.stderr)
    else:
        print("DEBUG: MCQ validation - No correct answers provided", file=sys.stderr)
    
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

def validate_descriptive_answers(user_answers: Dict[str, str], questions: List[str]) -> Tuple[int, int, List[Dict]]:
    """
    Validate descriptive answers using Groq LLM.
    Each descriptive answer is worth 3 points.
    
    Returns:
        Tuple containing (score, max_possible_score, detailed_results)
    """
    # Ensure the API key is set
    if "GROQ_API_KEY" not in os.environ:
        raise RuntimeError("GROQ_API_KEY environment variable is not set.")
    
    llm = ChatGroq(temperature=0.2, model_name=_resolve_groq_model(), max_tokens=2048)
    
    max_score = len(questions) * 3  # Each question is worth 3 points
    detailed_results = []
    total_score = 0
    
    # Debug logging
    print(f"DEBUG: Descriptive validation - User answers: {json.dumps(user_answers)}", file=sys.stderr)
    print(f"DEBUG: Descriptive validation - Questions count: {len(questions)}", file=sys.stderr)
    if len(questions) > 0:
        print(f"DEBUG: Descriptive validation - First question: {questions[0]}", file=sys.stderr)
    else:
        print("DEBUG: Descriptive validation - No questions provided", file=sys.stderr)
    
    for idx, question in enumerate(questions):
        user_answer = user_answers.get(str(idx), "")
        
        if not user_answer.strip():
            # No answer provided
            detailed_results.append({
                "question": question,
                "user_answer": "",
                "score": 0,
                "max_score": 3,
                "feedback": "No answer provided."
            })
            continue
        
        # Create prompt for evaluation
        prompt = ChatPromptTemplate.from_template(
            """
            You are an expert technical interviewer evaluating a candidate's answer to a question.
            
            Question: {question}
            
            Candidate's Answer: {answer}
            
            Evaluate the answer on a scale of 0-3 points where:
            - 0 points: Completely incorrect or irrelevant
            - 1 point: Partially correct but missing key concepts
            - 2 points: Mostly correct with minor omissions
            - 3 points: Completely correct and comprehensive
            
            IMPORTANT STYLE REQUIREMENT:
            - Write the feedback in SECOND PERSON, as if you are speaking directly to the candidate.
            - Use "you" language (e.g., "You explained X well, but you missed Y").
            - Do NOT use third-person phrasing like "the candidate" or "they".
            - Keep the tone professional, constructive, and concise.
            
            Provide your evaluation in JSON format only with the following structure:
            {{"score": <score>, "feedback": "<second-person feedback explaining the score>"}}
            """
        )
        
        prompt_text = prompt.format(question=question, answer=user_answer)
        result = llm.predict(prompt_text)
        
        try:
            # Extract JSON from the result if needed
            if "```" in result:
                result = result.split("```")[1].strip()
                if result.startswith("json"):
                    result = result[4:].strip()
            
            evaluation = json.loads(result)
            score = int(evaluation.get("score", 0))
            feedback = evaluation.get("feedback", "No feedback provided.")
            
            # Ensure score is within valid range
            score = max(0, min(score, 3))
            total_score += score
            
            detailed_results.append({
                "question": question,
                "user_answer": user_answer,
                "score": score,
                "max_score": 3,
                "feedback": feedback
            })
            
        except (json.JSONDecodeError, ValueError) as e:
            # Fallback if parsing fails
            detailed_results.append({
                "question": question,
                "user_answer": user_answer,
                "score": 0,
                "max_score": 3,
                "feedback": f"Error evaluating answer: {str(e)}",
                "raw_response": result
            })
    
    return total_score, max_score, detailed_results

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
    
    # Determine verdict
    # If there are no questions, use "No Questions Available"
    # Otherwise, use a percentage-based approach: Pass if >= 60%, otherwise Fail
    if max_possible_score == 0:
        verdict = "No Questions Available"
    else:
        percentage_score = (total_score / max_possible_score * 100)
        verdict = "Pass" if percentage_score >= 60 else "Fail"
    
    # Calculate percentage safely
    percentage = 0
    if max_possible_score > 0:
        percentage = round((total_score / max_possible_score * 100), 2)
    
    # Adjust verdict for edge case where there are no questions
    if max_possible_score == 0:
        verdict = "No Questions Available"
    
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
            print(f"DEBUG: Restructured user_answers: {json.dumps(user_answers)}", file=sys.stderr)
        
        # Debug logging
        print(f"DEBUG: Parsed user_answers: {json.dumps(user_answers)}", file=sys.stderr)
        print(f"DEBUG: Parsed questions: {json.dumps(questions)}", file=sys.stderr)
        print(f"DEBUG: MCQ questions count: {len(questions.get('mcq_questions', []))}", file=sys.stderr)
        print(f"DEBUG: Descriptive questions count: {len(questions.get('desc_questions', []))}", file=sys.stderr)
        print(f"DEBUG: User MCQ answers count: {len(user_answers.get('mcq', {}))}", file=sys.stderr)
        print(f"DEBUG: User descriptive answers count: {len(user_answers.get('desc', {}))}", file=sys.stderr)
        
        # Check if answers and questions are empty
        if not user_answers.get('mcq') and not user_answers.get('desc'):
            print("WARNING: Both MCQ and descriptive answers are empty", file=sys.stderr)
        
        if not questions.get('mcq_questions') and not questions.get('desc_questions'):
            print("WARNING: Both MCQ and descriptive questions are empty", file=sys.stderr)
            
        # Ensure questions has the expected structure
        if not isinstance(questions, dict):
            print(f"WARNING: questions is not a dictionary: {type(questions)}", file=sys.stderr)
            questions = {}
            
        # Ensure mcq_questions and desc_questions fields exist
        if 'mcq_questions' not in questions:
            print("WARNING: 'mcq_questions' field missing in questions, adding empty list", file=sys.stderr)
            questions['mcq_questions'] = []
            
        if 'desc_questions' not in questions:
            print("WARNING: 'desc_questions' field missing in questions, adding empty list", file=sys.stderr)
            questions['desc_questions'] = []
        
        # Validate MCQ answers
        mcq_results = validate_mcq_answers(
            user_answers.get("mcq", {}),
            questions.get("mcq_questions", [])
        )
        
        # Validate descriptive answers
        desc_results = validate_descriptive_answers(
            user_answers.get("desc", {}),
            questions.get("desc_questions", [])
        )
        
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