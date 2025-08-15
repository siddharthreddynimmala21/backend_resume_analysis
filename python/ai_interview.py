import argparse
import json
import os
import sys
from typing import List, Dict, Any, Tuple

from langgraph.graph import StateGraph
from langchain_groq import ChatGroq
from langchain.prompts import ChatPromptTemplate
import json

from typing import TypedDict

class InterviewState(TypedDict, total=False):
    resume_text: str
    job_desc: str
    questions: List[str]

class ValidationState(TypedDict, total=False):
    session_id: str
    user_answers: Dict[str, Any]
    questions: Dict[str, Any]
    mcq_results: Tuple[int, int, List[Dict]]
    desc_results: Tuple[int, int, List[Dict]]
    validation_report: Dict[str, Any]


def build_graph(round_type: str = "technical_round1") -> StateGraph:
    """Return a compiled LangGraph that produces interview questions for different rounds."""
    # Ensure the API key is set; fallback to env variable
    if "GROQ_API_KEY" not in os.environ:
        raise RuntimeError("GROQ_API_KEY environment variable is not set.")

    llm = ChatGroq(temperature=0.7, model_name=os.getenv("GROQ_MODEL", "llama3-70b-8192"), max_tokens=2048)
    
    # Define different prompts for different rounds
    prompts = {
        "technical_round1": """
        Generate interview questions for Technical Round 1 based on BOTH the candidate's resume and the job description.
        
        CANDIDATE'S RESUME:
        {resume_text}

        JOB DESCRIPTION:
        {job_desc}
        
        INSTRUCTIONS:
        - Analyze the candidate's background from their resume
        - Identify key technical requirements from the job description
        - Focus on fundamental technical skills and basic concepts that match BOTH the resume and job requirements
        - Create questions that test skills mentioned in the job description while considering the candidate's experience level
        - Ensure questions are relevant to the specific role and technologies mentioned in the job description
        
        Requirements:
        - Generate 5 MCQ questions with 4 options each (based on technologies/skills from job description)
        - Generate 3 descriptive questions (focused on job-relevant scenarios and skills)
        - For MCQ questions, indicate the correct answer
        - Questions should be tailored to the specific job requirements and candidate's background
        
        CRITICAL MCQ REQUIREMENTS:
        - Each MCQ must have EXACTLY ONE correct answer - no ambiguity
        - The other 3 options must be clearly incorrect or less optimal
        - Avoid questions where multiple answers could be considered correct
        - Make sure the correct answer is definitively the best choice
        - Double-check that the answer you mark as correct is actually correct
        - Avoid subjective questions - focus on factual, technical knowledge
        - Test specific, verifiable technical concepts with clear right/wrong answers
        
        Important Note:
        - Output JSON format ONLY - no other text as "Here are the questions","Questions are here" etc.
        - Return just JSON object in the following manner

        {{
            "mcq_questions": [
                {{
                    "question": "In JavaScript, what will be the output of: console.log(typeof null)?",
                    "options": ["A. null", "B. undefined", "C. object", "D. boolean"],
                    "answer": "C"
                }},
                {{
                    "question": "Which HTTP status code indicates that a resource was successfully created?",
                    "options": ["A. 200 OK", "B. 201 Created", "C. 202 Accepted", "D. 204 No Content"],
                    "answer": "B"
                }},
                ...
            ],
            "desc_questions": [
                "Based on the job requirements and your background, how would you approach building the specific features mentioned in the job description?",
                "Describe how you would implement the technical architecture required for this role, considering the technologies mentioned in the job posting.",
                "Given the job's focus on [specific requirement from job description], explain how your experience aligns with these needs."
            ]
        }}
        """,
        
        "technical_round2": """
        Generate ADVANCED interview questions for Technical Round 2 based on BOTH the candidate's resume and the job description.
        
        CANDIDATE'S RESUME:
        {resume_text}

        JOB DESCRIPTION:
        {job_desc}
        
        INSTRUCTIONS:
        - This is a SIGNIFICANTLY MORE DIFFICULT technical round compared to Technical Round 1
        - Questions must be EXPERT-LEVEL and test deep understanding of complex concepts
        - Focus on ADVANCED system design, architecture patterns, performance optimization, and scalability challenges
        - Test knowledge of advanced algorithms, data structures, distributed systems, and enterprise-level solutions
        - Questions should require SENIOR-LEVEL expertise and problem-solving skills
        - Consider complex real-world scenarios that require advanced technical decision-making
        
        DIFFICULTY REQUIREMENTS:
        - MCQ questions should test EXPERT knowledge of advanced concepts, edge cases, and complex scenarios
        - Questions should involve multi-layered thinking and deep technical understanding
        - Focus on advanced topics like: distributed systems, microservices architecture, performance optimization, 
          advanced algorithms, system scalability, security architecture, advanced database concepts, 
          cloud architecture patterns, advanced design patterns, and complex problem-solving
        - Descriptive questions should require designing complex systems and solving challenging technical problems
        
        Requirements:
        - Generate 5 EXPERT-LEVEL MCQ questions with 4 options each (significantly harder than Round 1)
        - Generate 3 COMPLEX descriptive questions (advanced system design and architecture challenges)
        - For MCQ questions, indicate the correct answer
        - Questions must test ADVANCED knowledge far beyond basic concepts
        
        CRITICAL MCQ REQUIREMENTS:
        - Each MCQ must have EXACTLY ONE correct answer - no ambiguity
        - The other 3 options must be clearly incorrect or less optimal
        - Avoid questions where multiple answers could be considered correct in different contexts
        - Make sure the correct answer is definitively the best choice for the specific scenario
        - Double-check that the answer you mark as correct is actually correct
        - Focus on factual, technical knowledge with clear right/wrong answers
        - Even for advanced topics, ensure there's one clearly superior answer
        
        Important Note:
        - Output JSON format ONLY - no other text as "Here are the questions","Questions are here" etc.
        - Return just JSON object in the following manner

        {{
            "mcq_questions": [
                {{
                    "question": "In the CAP theorem for distributed systems, what does the 'P' represent?",
                    "options": ["A. Performance", "B. Partition tolerance", "C. Persistence", "D. Parallel processing"],
                    "answer": "B"
                }},
                {{
                    "question": "Which Big O notation correctly describes the time complexity of QuickSort in the worst case?",
                    "options": ["A. O(n log n)", "B. O(n)", "C. O(n²)", "D. O(log n)"],
                    "answer": "C"
                }},
                {{
                    "question": "Given the job's requirement for zero-downtime deployments in a microservices architecture, which deployment strategy combination would handle database schema migrations with backward compatibility?",
                    "options": ["A. Blue-green deployment + Expand-contract pattern + Feature flags", "B. Rolling deployment + Database versioning + Circuit breakers", "C. Canary deployment + Shadow traffic + A/B testing", "D. Immutable deployment + Event sourcing + CQRS"],
                    "answer": "A"
                }},
                {{
                    "question": "For the security requirements mentioned in the job posting, you need to implement defense against advanced persistent threats in a distributed system. Which combination provides the most comprehensive protection?",
                    "options": ["A. WAF + Rate limiting + Input validation + HTTPS", "B. Zero-trust architecture + Behavioral analytics + Micro-segmentation + Encrypted service mesh", "C. OAuth2 + JWT tokens + API gateway + Load balancer", "D. Firewall + Antivirus + Intrusion detection + VPN"],
                    "answer": "B"
                }},
                {{
                    "question": "Based on the job's performance requirements, you're designing a real-time analytics system that needs to process streaming data with sub-millisecond latency. Which architecture pattern would be most suitable?",
                    "options": ["A. Lambda architecture + Batch processing + Data lake", "B. Kappa architecture + Stream processing + In-memory computing + RDMA networking", "C. Event sourcing + CQRS + Eventually consistent reads", "D. Microservices + Message queues + Distributed caching"],
                    "answer": "B"
                }},
                ...
            ],
            "desc_questions": [
                "Design a fault-tolerant, globally distributed system architecture that can handle the scale mentioned in the job description (assume 100M+ users, 99.99% uptime, sub-100ms latency globally). Include detailed considerations for data consistency, partition tolerance, disaster recovery, and cost optimization across multiple cloud regions.",
                "Based on the job's technical requirements, architect a real-time recommendation engine that processes 1M+ events per second, maintains user state across sessions, handles concept drift in ML models, and provides personalized results within 50ms. Explain your approach to feature engineering, model serving, A/B testing, and performance monitoring.",
                "Given the security and compliance requirements in the job description, design a comprehensive security architecture for a financial services platform. Address threat modeling, zero-trust implementation, data encryption at rest and in transit, audit logging, compliance monitoring, incident response, and secure CI/CD pipelines. Include specific technologies and implementation strategies."
            ]
        }}
        """,
        
        "managerial_round": """
        Generate interview questions for Managerial Round based on BOTH the candidate's resume and the job description.
        
        CANDIDATE'S RESUME:
        {resume_text}

        JOB DESCRIPTION:
        {job_desc}
        
        INSTRUCTIONS:
        - Analyze the candidate's leadership experience and management background from their resume
        - Focus on the specific management responsibilities and team leadership requirements mentioned in the job description
        - Consider the team size, project scope, and management challenges described in the job posting
        - Create questions that evaluate leadership potential relevant to the specific role and organizational context
        
        Requirements:
        - Generate 5 MCQ questions with 4 options each (management scenarios relevant to the job requirements)
        - Generate 3 descriptive questions (leadership situations specific to the role and company context)
        - For MCQ questions, indicate the correct answer
        - Questions should assess management skills needed for the specific role and team described
        
        CRITICAL MCQ REQUIREMENTS:
        - Each MCQ must have EXACTLY ONE correct answer - no ambiguity
        - Focus on established management best practices with clear right/wrong approaches
        - Avoid subjective management styles - focus on proven methodologies
        - The correct answer should be based on widely accepted management principles
        - Double-check that the answer you mark as correct is actually the best practice
        - Make the other 3 options clearly suboptimal or incorrect approaches
        - Test specific management knowledge, not personal preferences
        
        Important Note:
        - Output JSON format ONLY - no other text as "Here are the questions","Questions are here" etc.
        - Return just JSON object in the following manner

        {{
            "mcq_questions": [
                {{
                    "question": "Based on the team structure described in the job posting, what would be your priority when managing a team of [team size/type from job description]?",
                    "options": ["A. Establish clear processes", "B. Focus on individual performance", "C. Implement new tools", "D. Increase meeting frequency"],
                    "answer": "A"
                }},
                {{
                    "question": "Given the project management methodology mentioned in the job requirements, how would you handle scope creep in a critical project?",
                    "options": ["A. Accept all changes", "B. Reject all changes", "C. Evaluate impact and negotiate priorities", "D. Delegate decisions to the team"],
                    "answer": "C"
                }},
                ...
            ],
            "desc_questions": [
                "Based on the management responsibilities outlined in this job description, describe how you would structure and lead the team to achieve the stated goals.",
                "Given the specific challenges mentioned in the job posting, explain your approach to managing stakeholder expectations and team performance.",
                "How would you handle the leadership challenges specific to this role, considering the company size and project complexity described in the job description?"
            ]
        }}
        """,
        
        "hr_round": """
        Generate interview questions for HR Round based on BOTH the candidate's resume and the job description.
        
        CANDIDATE'S RESUME:
        {resume_text}

        JOB DESCRIPTION:
        {job_desc}
        
        INSTRUCTIONS:
        - Analyze the candidate's career progression, values, and motivations from their resume
        - Focus on the company culture, values, and work environment described in the job description
        - Consider the specific role requirements, team dynamics, and organizational fit mentioned in the job posting
        - Create questions that assess cultural alignment and motivation for this specific role and company
        
        Requirements:
        - Generate 5 MCQ questions with 4 options each (workplace scenarios relevant to the company culture and role)
        - Generate 3 descriptive questions (career goals and cultural fit specific to this opportunity)
        - For MCQ questions, indicate the correct answer
        - Questions should evaluate fit with the specific company culture and role requirements described
        
        CRITICAL MCQ REQUIREMENTS:
        - Each MCQ must have EXACTLY ONE correct answer - no ambiguity
        - Focus on universally accepted professional behaviors and workplace ethics
        - Avoid questions where cultural preferences could make multiple answers valid
        - The correct answer should represent best professional practices
        - Double-check that the answer you mark as correct is actually the most professional choice
        - Make the other 3 options clearly unprofessional or suboptimal
        - Test objective workplace knowledge, not subjective preferences
        
        Important Note:
        - Output JSON format ONLY - no other text as "Here are the questions","Questions are here" etc.
        - Return just JSON object in the following manner

        {{
            "mcq_questions": [
                {{
                    "question": "Based on the work environment described in this job posting, how would you prefer to collaborate with your team?",
                    "options": ["A. Primarily through email", "B. Regular face-to-face meetings", "C. Flexible mix of remote and in-person collaboration", "D. Minimal interaction"],
                    "answer": "C"
                }},
                {{
                    "question": "Given the company values mentioned in the job description, what drives your professional motivation?",
                    "options": ["A. Individual recognition only", "B. Team success and continuous learning", "C. Minimal responsibility", "D. Strict hierarchical structure"],
                    "answer": "B"
                }},
                ...
            ],
            "desc_questions": [
                "Based on this specific job opportunity and company, explain how this role aligns with your long-term career goals and what attracts you to this position.",
                "Describe how your work style and values align with the company culture and team environment described in this job posting.",
                "Given the specific challenges and opportunities mentioned in this job description, what excites you most about potentially joining this team?"
            ]
        }}
        """
    }
    
    prompt_template = prompts.get(round_type, prompts["technical_round1"])
    prompt = ChatPromptTemplate.from_template(prompt_template)

    def generate_questions(state: dict):
        prompt_text = prompt.format(**state)
        result = llm.predict(prompt_text)
        # if("```" in result):
        #     print("Result",result.split("```")[1])
        # else:
        #     print("Result",result)
        # Try to load as JSON list; fallback to splitting lines
        try:
            if("```" in result):
                questions = json.loads(result.split("```")[1])
            else:
                questions = json.loads(result)
        except Exception:
            questions = [q.strip("- ") for q in result.split("\n") if q.strip()]
        state["questions"] = questions
        return state

    sg = StateGraph(InterviewState)
    sg.add_node("generate", generate_questions)
    sg.set_entry_point("generate")
    sg.set_finish_point("generate")
    return sg.compile()

def build_validation_graph() -> StateGraph:
    """Return a compiled LangGraph that validates interview answers."""
    # Note: API key check is done in descriptive validation where it's actually needed
    llm = None
    if "GROQ_API_KEY" in os.environ:
        llm = ChatGroq(temperature=0.2, model_name=os.getenv("GROQ_MODEL", "llama3-70b-8192"), max_tokens=2048)

    def preprocess_validation_data(state: dict):
        """Preprocess and validate input data structure."""
        user_answers = state.get("user_answers", {})
        questions = state.get("questions", {})
        
        # Debug logging
        print(f"DEBUG: Raw user_answers: {json.dumps(user_answers)}", file=sys.stderr)
        print(f"DEBUG: Raw questions: {json.dumps(questions)}", file=sys.stderr)
        
        # Ensure user_answers has the expected structure
        if not isinstance(user_answers, dict):
            print(f"WARNING: user_answers is not a dictionary: {type(user_answers)}", file=sys.stderr)
            user_answers = {}
            
        # Ensure mcq and desc fields exist
        if 'mcq' not in user_answers:
            print("WARNING: 'mcq' field missing in user_answers, adding empty dict", file=sys.stderr)
            user_answers['mcq'] = {}
            
        if 'desc' not in user_answers:
            print("WARNING: 'desc' field missing in user_answers, adding empty dict", file=sys.stderr)
            user_answers['desc'] = {}
            
        # Handle case where user_answers is a flat structure without mcq/desc nesting
        # This happens when the frontend sends answers directly without proper structure
        has_numeric_keys = any(key.isdigit() for key in user_answers.keys())
        if has_numeric_keys and not user_answers.get('mcq') and not user_answers.get('desc'):
            print("WARNING: user_answers appears to be flat structure, restructuring", file=sys.stderr)
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
        
        # Debug logging after preprocessing
        print(f"DEBUG: Processed user_answers: {json.dumps(user_answers)}", file=sys.stderr)
        print(f"DEBUG: Processed questions: {json.dumps(questions)}", file=sys.stderr)
        print(f"DEBUG: MCQ questions count: {len(questions.get('mcq_questions', []))}", file=sys.stderr)
        print(f"DEBUG: Descriptive questions count: {len(questions.get('desc_questions', []))}", file=sys.stderr)
        print(f"DEBUG: User MCQ answers count: {len(user_answers.get('mcq', {}))}", file=sys.stderr)
        print(f"DEBUG: User descriptive answers count: {len(user_answers.get('desc', {}))}", file=sys.stderr)
        
        # Update state with processed data
        state["user_answers"] = user_answers
        state["questions"] = questions
        return state

    def validate_mcq_answers(state: dict):
        """Validate MCQ answers and calculate score."""
        user_answers = state.get("user_answers", {}).get("mcq", {})
        correct_answers = state.get("questions", {}).get("mcq_questions", [])
        
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
        
        state["mcq_results"] = (score, max_score, detailed_results)

        return state

    def validate_descriptive_answers(state: dict):
        """Validate descriptive answers using Groq LLM."""
        user_answers = state.get("user_answers", {}).get("desc", {})
        questions = state.get("questions", {}).get("desc_questions", [])
        
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
        
        # Check if API key is available for LLM evaluation
        if not llm or "GROQ_API_KEY" not in os.environ:
            print("WARNING: GROQ_API_KEY not available, skipping descriptive validation", file=sys.stderr)
            for idx, question in enumerate(questions):
                user_answer = user_answers.get(str(idx), "")
                detailed_results.append({
                    "question": question,
                    "user_answer": user_answer,
                    "score": 0,
                    "max_score": 3,
                    "feedback": "API key not available for evaluation."
                })
            state["desc_results"] = (0, max_score, detailed_results)
            return state
        
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
                You are an expert technical interviewer providing feedback directly to a candidate about their answer.
                
                Question: {question}
                
                Candidate's Answer: {answer}
                
                Evaluate the answer on a scale of 0-3 points where:
                - 0 points: Completely incorrect or irrelevant
                - 1 point: Partially correct but missing key concepts
                - 2 points: Mostly correct with minor omissions
                - 3 points: Completely correct and comprehensive
                
                IMPORTANT: Write your feedback in second person, addressing the candidate directly (use "Your answer..." instead of "The candidate's answer...").
                Be constructive, specific, and helpful in your feedback.
                
                Provide your evaluation in JSON format only with the following structure:
                {{"score": <score>, "feedback": "<detailed feedback explaining the score, written in second person addressing the candidate directly>"}}            
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
        
        state["desc_results"] = (total_score, max_score, detailed_results)

        return state

    def generate_validation_report(state: dict):
        """Generate a comprehensive validation report with scores and verdict."""

        
        mcq_results = state.get("mcq_results", (0, 0, []))
        desc_results = state.get("desc_results", (0, 0, []))
        
        print(f"DEBUG: MCQ results in report generation: {mcq_results}", file=sys.stderr)
        print(f"DEBUG: Desc results in report generation: {desc_results}", file=sys.stderr)
        
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
        
        state["validation_report"] = report
        return state

    # Build the validation graph
    sg = StateGraph(ValidationState)
    sg.add_node("preprocess", preprocess_validation_data)
    sg.add_node("validate_mcq", validate_mcq_answers)
    sg.add_node("validate_descriptive", validate_descriptive_answers)
    sg.add_node("generate_report", generate_validation_report)
    
    sg.set_entry_point("preprocess")
    sg.add_edge("preprocess", "validate_mcq")
    sg.add_edge("validate_mcq", "validate_descriptive")
    sg.add_edge("validate_descriptive", "generate_report")
    sg.set_finish_point("generate_report")
    
    return sg.compile()

def generate_job_description(target_role: str, experience: str, current_role: str) -> str:
    """Generate a job description based on target role and experience level."""
    # Ensure the API key is set
    if "GROQ_API_KEY" not in os.environ:
        raise RuntimeError("GROQ_API_KEY environment variable is not set.")

    llm = ChatGroq(temperature=0.7, model_name=os.getenv("GROQ_MODEL", "llama3-70b-8192"), max_tokens=2048)
    
    prompt = ChatPromptTemplate.from_template(
        """
        Generate a comprehensive job description for the following role:
        
        Target Role: {target_role}
        Experience Level: {experience} years
        Current Role: {current_role}
        
        Create a realistic and detailed job description that includes:
        1. Job Title and Company Overview
        2. Role Summary
        3. Key Responsibilities (5-7 bullet points)
        4. Required Skills and Qualifications
        5. Technical Requirements
        6. Experience Requirements
        7. Nice-to-have Skills
        8. Company Culture and Benefits
        
        Make the job description:
        - Appropriate for the experience level ({experience} years)
        - Relevant to someone transitioning from {current_role} to {target_role}
        - Include specific technologies and skills commonly required for {target_role}
        - Professional and realistic
        - Comprehensive enough to generate meaningful interview questions
        
        Format the output as a well-structured job description that could be posted on a job board.
        """
    )
    
    try:
        result = llm.predict(prompt.format(
            target_role=target_role,
            experience=experience,
            current_role=current_role
        ))
        return result.strip()
    except Exception as e:
        # Fallback job description if generation fails
        return f"""
Job Title: {target_role}

We are seeking a skilled {target_role} with {experience} years of experience to join our dynamic team.

Key Responsibilities:
• Develop and maintain high-quality software solutions
• Collaborate with cross-functional teams to deliver projects
• Write clean, maintainable, and efficient code
• Participate in code reviews and technical discussions
• Stay updated with industry best practices and technologies

Required Qualifications:
• {experience}+ years of experience in software development
• Strong problem-solving and analytical skills
• Experience with modern development frameworks and tools
• Excellent communication and teamwork abilities
• Bachelor's degree in Computer Science or related field

Technical Skills:
• Proficiency in relevant programming languages
• Experience with databases and web technologies
• Understanding of software development lifecycle
• Knowledge of version control systems

We offer competitive compensation, comprehensive benefits, and opportunities for professional growth in a collaborative environment.
        """.strip()

def main():
    parser = argparse.ArgumentParser(description="Generate interview questions or validate answers using LangGraph")
    parser.add_argument("--mode", choices=["generate", "validate"], default="generate", help="Mode: generate questions or validate answers")
    parser.add_argument("--session_id", required=True)
    
    # Arguments for question generation
    parser.add_argument("--resume_text", help="Resume text for question generation")
    parser.add_argument("--job_desc", default="", help="Job description (empty if generating)")
    parser.add_argument("--job_desc_option", default="paste", help="Job description option: paste or generate")
    parser.add_argument("--current_role", help="Current role for question generation")
    parser.add_argument("--target_role", help="Target role for question generation")
    parser.add_argument("--experience", help="Years of experience for question generation")
    parser.add_argument("--round", default="1", help="Interview round number")
    
    # Arguments for validation
    parser.add_argument("--user_answers", help="JSON string of user answers for validation")
    parser.add_argument("--questions", help="JSON string of questions with correct answers for validation")
    
    args = parser.parse_args()

    if args.mode == "generate":
        # Question generation mode
        if not all([args.resume_text, args.current_role, args.target_role, args.experience]):
            print(json.dumps({"error": "Missing required arguments for question generation"}))
            return

        # Determine round type
        round_num = int(args.round)
        if round_num == 1:
            round_type = "technical_round1"
        elif round_num == 2:
            round_type = "technical_round2"
        elif round_num == 3:
            round_type = "managerial_round"
        elif round_num == 4:
            round_type = "hr_round"
        else:
            round_type = "technical_round1"  # fallback
        
        # Handle job description generation if needed
        job_desc = args.job_desc
        if args.job_desc_option == "generate" or not job_desc.strip():
            try:
                job_desc = generate_job_description(
                    target_role=args.target_role,
                    experience=args.experience,
                    current_role=args.current_role
                )
            except Exception as e:
                print(json.dumps({"error": f"Failed to generate job description: {str(e)}"}))
                raise
        
        graph = build_graph(round_type)
        init_state = {
            "resume_text": args.resume_text,
            "job_desc": job_desc,
            "current_role": args.current_role,
            "target_role": args.target_role,
            "experience": args.experience,
        }

        try:
            final_state = graph.invoke(init_state)
            questions: List[str] = final_state.get("questions", [])
            payload = {
                "session_id": args.session_id,
                "round": round_type,
                "questions": questions,
            }
            print(json.dumps(payload))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
            raise

    elif args.mode == "validate":
        # Validation mode
        if not all([args.user_answers, args.questions]):
            print(json.dumps({"error": "Missing required arguments for validation"}))
            return

        try:
            # Parse input JSON
            user_answers = json.loads(args.user_answers)
            questions = json.loads(args.questions)
            
            # Basic debug logging before passing to graph
            print(f"DEBUG: Raw input user_answers: {json.dumps(user_answers)}", file=sys.stderr)
            print(f"DEBUG: Raw input questions: {json.dumps(questions)}", file=sys.stderr)
            print(f"DEBUG: User answers type: {type(user_answers)}", file=sys.stderr)
            print(f"DEBUG: Questions type: {type(questions)}", file=sys.stderr)
            print(f"DEBUG: Questions keys: {list(questions.keys()) if isinstance(questions, dict) else 'Not a dict'}", file=sys.stderr)
            print(f"DEBUG: User answers keys: {list(user_answers.keys()) if isinstance(user_answers, dict) else 'Not a dict'}", file=sys.stderr)

            # Build validation graph and run validation
            validation_graph = build_validation_graph()
            init_state = {
                "session_id": args.session_id,
                "user_answers": user_answers,
                "questions": questions
            }

            final_state = validation_graph.invoke(init_state)
            
            # Output the validation report
            output = {
                "session_id": args.session_id,
                "validation_report": final_state.get("validation_report", {})
            }
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