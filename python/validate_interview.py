import argparse
import json
import os
import sys
import re
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
    
    # Heuristic helpers
    def _is_non_informative(text: str) -> bool:
        if not isinstance(text, str):
            return True
        s = text.strip()
        if len(s) < 5:
            return True
        # Only punctuation/whitespace
        if re.fullmatch(r"[\W_]+", s):
            return True
        # Very low alphanumeric content
        alnum = re.sub(r"[^A-Za-z0-9]", "", s)
        if len(alnum) < 3:
            return True
        # Repeated same character patterns like "....." or "aaaaa"
        if re.fullmatch(r"(.)\1{2,}", s):
            return True
        # Extremely low unique character variety
        if len(set(s)) <= 2:
            return True
        return False

    def _tokens(text: str) -> List[str]:
        return re.findall(r"[A-Za-z0-9]+", (text or "").lower())

    def _overlap_ratio(q: str, a: str) -> float:
        qt = set(_tokens(q))
        at = set(_tokens(a))
        if not at:
            return 0.0
        inter = len(qt & at)
        return inter / max(1, len(at))

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

        # Pre-LLM heuristics: immediately reject non-informative or off-topic, ultra-short answers
        if _is_non_informative(user_answer):
            detailed_results.append({
                "question": question,
                "user_answer": user_answer,
                "score": 0,
                "max_score": 3,
                "feedback": "Your answer appears non-informative (empty, only symbols, or gibberish). Provide a substantive response."
            })
            continue

        # Low-overlap with short length: likely off-topic
        overlap = _overlap_ratio(question, user_answer)
        ans_tokens = _tokens(user_answer)
        if overlap < 0.1 and len(ans_tokens) < 6:
            detailed_results.append({
                "question": question,
                "user_answer": user_answer,
                "score": 0,
                "max_score": 3,
                "feedback": "Your answer does not address the question. Please provide a relevant, detailed response."
            })
            continue
        
        # Create prompt for evaluation with explicit relevance gating and structured rubric
        prompt = ChatPromptTemplate.from_template(
            """
            You are an expert interviewer STRICTLY evaluating how well an answer addresses the SPECIFIC question.
            Score only for content that is relevant and correct for THIS question.

            Question: {question}
            Candidate's Answer: {answer}

            EVALUATION STEPS:
            1) Identify the key requirements of the question (short bullet list).
            2) Identify the main claims/points made in the answer (short bullet list).
            3) Determine relevance: the proportion of answer points that directly address the question's key requirements.
               - Output a numeric relevance value in [0,1]. If relevance < 0.4, the answer is considered off-topic.
            4) Determine correctness: for the relevant parts only, how accurate/appropriate are they (in [0,1]).
            5) Assign the final score in [0,1,2,3] using this STRICT rubric:
               - If relevance < 0.4: score = 0 (off-topic or mostly irrelevant).
               - Else if relevance < 0.7: score ∈ [1,2] depending on correctness (<=0.5 -> 1, >0.5 -> 2).
               - Else (relevance >= 0.7): score ∈ [2,3] depending on correctness (<=0.6 -> 2, >0.6 -> 3).

            IMPORTANT:
            - If the answer is empty, only punctuation/symbols (e.g., "..."), repeated characters, or obvious gibberish,
              set relevance = 0 and score = 0.

            STYLE REQUIREMENT FOR FEEDBACK:
            - Write feedback in SECOND PERSON (use "you").
            - Be concise, professional, and point out missing key points explicitly.

            OUTPUT STRICT JSON ONLY with this structure:
            {{
              "score": <0|1|2|3>,
              "relevance": <float 0..1>,
              "feedback": "<second-person feedback>",
              "reasoning": {{
                "question_points": ["..."],
                "answer_points": ["..."],
                "matched_points": ["..."],
                "missing_points": ["..."]
              }}
            }}
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
            # Pull fields with defaults
            score = int(evaluation.get("score", 0))
            feedback = evaluation.get("feedback", "No feedback provided.")
            relevance = float(evaluation.get("relevance", 0))
            
            # Ensure score is within valid range
            score = max(0, min(score, 3))
            # Enforce off-topic gating: if low relevance, force zero (stricter server threshold)
            if relevance < 0.6:
                score = 0

            # Additional server-side safeguards against short/gibberish answers
            ans_tokens = re.findall(r"[A-Za-z0-9]+", (user_answer or "").lower())
            token_count = len(ans_tokens)
            char_count = len((user_answer or "").strip())

            # If extremely short, force 0
            if token_count < 5 or char_count < 15:
                score = 0
            # If short-ish, cap at 1
            elif token_count < 8 and score > 1:
                score = 1
            total_score += score
            
            detailed_results.append({
                "question": question,
                "user_answer": user_answer,
                "score": score,
                "max_score": 3,
                "feedback": feedback,
                "relevance": relevance,
                "llm_raw": evaluation
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