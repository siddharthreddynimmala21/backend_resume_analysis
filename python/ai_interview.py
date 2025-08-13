import argparse
import json
import os
from typing import List

from langgraph.graph import StateGraph
from langchain_groq import ChatGroq
from langchain.prompts import ChatPromptTemplate
import json

from typing import TypedDict

class InterviewState(TypedDict, total=False):
    resume_text: str
    job_desc: str
    questions: List[str]


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
    parser = argparse.ArgumentParser(description="Generate interview questions using LangGraph")
    parser.add_argument("--session_id", required=True)
    parser.add_argument("--resume_text", required=True)
    parser.add_argument("--job_desc", default="", help="Job description (empty if generating)")
    parser.add_argument("--job_desc_option", default="paste", help="Job description option: paste or generate")
    parser.add_argument("--current_role", required=True)
    parser.add_argument("--target_role", required=True)
    parser.add_argument("--experience", required=True)
    parser.add_argument("--round", default="1", help="Interview round number")
    args = parser.parse_args()

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

if __name__ == "__main__":
    main()