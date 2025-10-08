import argparse
import json
import os
import random
from typing import List, Dict, Any

from langgraph.graph import StateGraph
from langchain_groq import ChatGroq
from langchain.prompts import ChatPromptTemplate
import json

from typing import TypedDict

class ResumeInterviewState(TypedDict, total=False):
    # Input data
    resume_text: str
    job_desc: str
    target_role: str
    experience: str
    current_role: str
    focus_area: str  # "skills" | "projects" | "work_experience"
    
    # Extracted content
    extracted_skills: Dict[str, Any]
    extracted_projects: List[Dict[str, Any]]
    extracted_work_experience: List[Dict[str, Any]]
    
    # Focus-specific processing
    focus_content: Dict[str, Any]
    job_requirements: Dict[str, Any]
    
    # Analysis results
    gap_analysis: Dict[str, Any]
    question_strategy: Dict[str, Any]
    
    # Final output
    questions: Dict[str, Any]


def _resolve_groq_model() -> str:
    """Return a supported Groq model name, remapping deprecated aliases if needed."""
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


def _safe_json(text: str):
    """Safely parse JSON from LLM response."""
    try:
        if "```" in text:
            parts = text.split("```")
            for p in parts:
                p = p.strip()
                if p.startswith("{") or p.startswith("["):
                    return json.loads(p)
        return json.loads(text)
    except Exception:
        return None


def build_resume_interview_graph() -> StateGraph:
    """Build the multi-agent graph for resume-based interview question generation."""
    
    if "GROQ_API_KEY" not in os.environ:
        raise RuntimeError("GROQ_API_KEY environment variable is not set.")

    llm = ChatGroq(temperature=0.7, model_name=_resolve_groq_model(), max_tokens=2048)
    
    def content_extraction_agent(state: dict):
        """Agent 1: Extract all relevant content from resume based on focus area."""
        
        extract_prompt = ChatPromptTemplate.from_template("""
        Extract structured information from the following resume text.
        Focus Area: {focus_area}
        
        Resume Text:
        {resume_text}
        
        Return STRICT JSON with the following structure:
        {{
            "skills": {{
                "technical_skills": ["skill1", "skill2"],
                "soft_skills": ["communication", "leadership"],
                "tools_technologies": ["tool1", "tool2"],
                "certifications": ["cert1", "cert2"]
            }},
            "projects": [
                {{
                    "name": "Project Name",
                    "description": "Brief description",
                    "technologies": ["tech1", "tech2"],
                    "role": "Your role in project",
                    "duration": "Timeline",
                    "achievements": ["achievement1", "achievement2"],
                    "challenges": ["challenge1", "challenge2"]
                }}
            ],
            "work_experience": [
                {{
                    "company": "Company Name",
                    "position": "Job Title",
                    "duration": "Start - End",
                    "responsibilities": ["resp1", "resp2"],
                    "achievements": ["achievement1", "achievement2"],
                    "technologies_used": ["tech1", "tech2"],
                    "team_size": "Number or description",
                    "challenges_faced": ["challenge1", "challenge2"]
                }}
            ]
        }}
        """)
        
        result = llm.predict(extract_prompt.format(**state))
        data = _safe_json(result) or {}
        
        state["extracted_skills"] = data.get("skills", {})
        state["extracted_projects"] = data.get("projects", [])
        state["extracted_work_experience"] = data.get("work_experience", [])
        
        return state

    def job_requirements_analysis_agent(state: dict):
        """Agent 2: Analyze job description to extract requirements relevant to focus area."""
        
        analysis_prompt = ChatPromptTemplate.from_template("""
        Analyze the job description and extract requirements relevant to: {focus_area}
        
        Job Description:
        {job_desc}
        Target Role: {target_role}
        
        Return STRICT JSON:
        {{
            "skills_requirements": {{
                "must_have_technical": ["skill1", "skill2"],
                "must_have_soft": ["skill1", "skill2"],
                "nice_to_have": ["skill1", "skill2"],
                "tools_required": ["tool1", "tool2"]
            }},
            "project_requirements": {{
                "project_types": ["web development", "mobile apps"],
                "complexity_level": "junior/mid/senior",
                "domain_experience": ["fintech", "healthcare"],
                "methodologies": ["agile", "scrum"]
            }},
            "experience_requirements": {{
                "years_required": "3-5",
                "industry_experience": ["tech", "finance"],
                "leadership_experience": "team lead experience preferred",
                "specific_roles": ["developer", "architect"],
                "company_types": ["startup", "enterprise"]
            }}
        }}
        """)
        
        result = llm.predict(analysis_prompt.format(**state))
        data = _safe_json(result) or {}
        
        state["job_requirements"] = data
        return state

    def focus_content_processing_agent(state: dict):
        """Agent 3: Process and structure content based on selected focus area."""
        
        focus_area = state.get("focus_area", "skills")
        
        if focus_area == "skills":
            state["focus_content"] = {
                "type": "skills",
                "content": state.get("extracted_skills", {}),
                "context": f"Candidate has {state.get('experience', '0')} years of experience"
            }
        
        elif focus_area == "projects":
            projects = state.get("extracted_projects", [])
            # Select most relevant projects (max 3-4 for focused questions)
            selected_projects = projects[:4] if len(projects) > 4 else projects
            state["focus_content"] = {
                "type": "projects", 
                "content": selected_projects,
                "context": f"Targeting {state.get('target_role', '')} role"
            }
        
        elif focus_area == "work_experience":
            experience = state.get("extracted_work_experience", [])
            state["focus_content"] = {
                "type": "work_experience",
                "content": experience,
                "context": f"Transitioning from {state.get('current_role', '')} to {state.get('target_role', '')}"
            }
        
        return state

    def gap_analysis_matching_agent(state: dict):
        """Agent 4: Analyze gaps and matches between resume content and job requirements."""
        
        focus_area = state.get("focus_area")
        focus_content = state.get("focus_content", {})
        job_requirements = state.get("job_requirements", {})
        
        analysis_prompt = ChatPromptTemplate.from_template("""
        Perform gap analysis between candidate's {focus_area} and job requirements.
        
        Candidate's {focus_area}:
        {focus_content}
        
        Job Requirements:
        {job_requirements}
        
        Return STRICT JSON:
        {{
            "strengths": [
                {{
                    "area": "specific strength",
                    "evidence": "supporting evidence from resume",
                    "relevance": "how it matches job requirement"
                }}
            ],
            "gaps": [
                {{
                    "area": "missing skill/experience",
                    "requirement": "what job needs",
                    "impact": "how critical this gap is"
                }}
            ],
            "opportunities": [
                {{
                    "area": "area to explore",
                    "reason": "why this is worth exploring",
                    "question_angle": "how to frame questions around this"
                }}
            ]
        }}
        """)
        
        result = llm.predict(analysis_prompt.format(
            focus_area=focus_area,
            focus_content=json.dumps(focus_content, indent=2),
            job_requirements=json.dumps(job_requirements, indent=2)
        ))
        
        data = _safe_json(result) or {}
        state["gap_analysis"] = data
        
        return state

    def strategy_planning_agent(state: dict):
        """Agent 5: Plan question generation strategy based on focus area and gap analysis."""
        
        focus_area = state.get("focus_area")
        gap_analysis = state.get("gap_analysis", {})
        
        strategy_prompt = ChatPromptTemplate.from_template("""
        Create a question generation strategy for {focus_area}-focused interview.
        
        Gap Analysis:
        {gap_analysis}
        
        Target Role: {target_role}
        Experience: {experience} years
        
        Return STRICT JSON strategy:
        {{
            "mcq_strategy": {{
                "strength_validation": {{
                    "count": 3,
                    "areas": ["area1", "area2", "area3"],
                    "difficulty": "appropriate level",
                    "approach": "how to validate these strengths"
                }},
                "gap_assessment": {{
                    "count": 2, 
                    "areas": ["gap1", "gap2"],
                    "difficulty": "diagnostic level",
                    "approach": "how to assess these gaps"
                }}
            }},
            "descriptive_strategy": {{
                "scenario_based": {{
                    "count": 2,
                    "scenarios": ["scenario type 1", "scenario type 2"],
                    "focus": "what to evaluate"
                }},
                "deep_dive": {{
                    "count": 1,
                    "area": "most critical area to explore",
                    "approach": "how to structure this question"
                }}
            }}
        }}
        """)
        
        result = llm.predict(strategy_prompt.format(
            focus_area=focus_area,
            gap_analysis=json.dumps(gap_analysis, indent=2),
            target_role=state.get('target_role', ''),
            experience=state.get('experience', '')
        ))
        
        data = _safe_json(result) or {}
        state["question_strategy"] = data
        
        return state

    def question_generation_agent(state: dict):
        """Agent 6: Generate targeted questions based on strategy and focus area."""
        
        focus_area = state.get("focus_area")
        
        # Focus-specific prompts
        prompts = {
            "skills": """
            Generate interview questions focused on SKILLS assessment.
            
            Candidate's Skills: {focus_content}
            Job Requirements: {job_requirements}
            Gap Analysis: {gap_analysis}
            Strategy: {question_strategy}
            
            INSTRUCTIONS:
            - Focus ONLY on technical and soft skills evaluation
            - Create questions that validate claimed skills with practical scenarios
            - Include questions that assess skill gaps identified in analysis
            - Test depth of knowledge in claimed expertise areas
            - Evaluate problem-solving approach using mentioned skills
            
            CRITICAL MCQ REQUIREMENTS:
            - Each MCQ must have EXACTLY ONE correct answer - no ambiguity
            - The other 3 options must be clearly incorrect or less optimal
            - Avoid questions where multiple answers could be considered correct
            - Make sure the correct answer is definitively the best choice
            - Double-check that the answer you mark as correct is actually correct
            - Avoid subjective questions - focus on factual, technical knowledge
            
            Output JSON format ONLY (no prose). Return exactly one JSON object:
            {{
              "mcq_questions": [
                {{
                  "question": "Based on your React experience, what is the correct way to handle state updates?",
                  "options": ["A. Direct mutation", "B. Using setState", "C. Global variables", "D. DOM manipulation"],
                  "answer": "B"
                }},
                ... 5 items total ...
              ],
              "desc_questions": [
                "Describe how you implemented authentication in your React project...",
                "Explain your approach to state management in complex applications...",
                "How would you optimize performance in a React application based on your experience..."
              ]
            }}
            """,
            
            "projects": """
            Generate interview questions focused on PROJECT experience.
            
            Candidate's Projects: {focus_content}
            Job Requirements: {job_requirements}
            Gap Analysis: {gap_analysis}
            Strategy: {question_strategy}
            
            INSTRUCTIONS:
            - Focus ONLY on project-based scenarios and experiences
            - Ask about specific projects mentioned in resume
            - Explore technical decisions, challenges, and solutions
            - Assess project management and collaboration skills
            - Evaluate learning and adaptation from project experiences
            - Connect project experience to target role requirements
            
            CRITICAL MCQ REQUIREMENTS:
            - Each MCQ must have EXACTLY ONE correct answer - no ambiguity
            - Focus on project management, technical decisions, and best practices
            - Questions should relate to actual projects mentioned in resume
            
            Output JSON format ONLY (no prose). Return exactly one JSON object:
            {{
              "mcq_questions": [
                {{
                  "question": "In your e-commerce project, what would be the best approach for handling payment processing?",
                  "options": ["A. Store card details locally", "B. Use a payment gateway", "C. Process payments manually", "D. Skip payment validation"],
                  "answer": "B"
                }},
                ... 5 items total ...
              ],
              "desc_questions": [
                "Walk me through the architecture of your most complex project...",
                "Describe a major challenge you faced in one of your projects and how you solved it...",
                "How did you ensure code quality and maintainability in your team projects..."
              ]
            }}
            """,
            
            "work_experience": """
            Generate interview questions focused on WORK EXPERIENCE.
            
            Candidate's Experience: {focus_content}
            Job Requirements: {job_requirements}
            Gap Analysis: {gap_analysis}
            Strategy: {question_strategy}
            
            INSTRUCTIONS:
            - Focus ONLY on work experience, roles, and responsibilities
            - Explore career progression and role transitions
            - Assess leadership, teamwork, and professional growth
            - Evaluate handling of workplace challenges and conflicts
            - Connect past experience to target role requirements
            - Assess cultural fit and work style preferences
            
            CRITICAL MCQ REQUIREMENTS:
            - Each MCQ must have EXACTLY ONE correct answer - no ambiguity
            - Focus on workplace scenarios, leadership, and professional situations
            - Questions should relate to actual work experience mentioned
            
            Output JSON format ONLY (no prose). Return exactly one JSON object:
            {{
              "mcq_questions": [
                {{
                  "question": "As a team lead, what's the best approach when a team member consistently misses deadlines?",
                  "options": ["A. Ignore the issue", "B. Have a private discussion to understand and address the root cause", "C. Publicly criticize them", "D. Immediately escalate to HR"],
                  "answer": "B"
                }},
                ... 5 items total ...
              ],
              "desc_questions": [
                "Describe a time when you had to lead a team through a challenging project...",
                "Tell me about a conflict you resolved in your previous workplace...",
                "How did you adapt when transitioning from individual contributor to a leadership role..."
              ]
            }}
            """
        }
        
        prompt_template = prompts.get(focus_area, prompts["skills"])
        prompt = ChatPromptTemplate.from_template(prompt_template)
        
        result = llm.predict(prompt.format(**state))
        data = _safe_json(result)
        questions = normalize_output(data)
        
        state["questions"] = questions
        return state

    # Build the graph
    sg = StateGraph(ResumeInterviewState)
    
    # Add all agents
    sg.add_node("content_extraction", content_extraction_agent)
    sg.add_node("job_requirements_analysis", job_requirements_analysis_agent)
    sg.add_node("focus_content_processing", focus_content_processing_agent)
    sg.add_node("gap_analysis_matching", gap_analysis_matching_agent)
    sg.add_node("strategy_planning", strategy_planning_agent)
    sg.add_node("question_generation", question_generation_agent)
    
    # Define flow
    sg.set_entry_point("content_extraction")
    sg.add_edge("content_extraction", "job_requirements_analysis")
    sg.add_edge("job_requirements_analysis", "focus_content_processing")
    sg.add_edge("focus_content_processing", "gap_analysis_matching")
    sg.add_edge("gap_analysis_matching", "strategy_planning")
    sg.add_edge("strategy_planning", "question_generation")
    sg.set_finish_point("question_generation")
    
    return sg.compile()


def normalize_output(parsed):
    """Normalize and validate the question output format."""
    
    def is_option_like(s: str) -> bool:
        s = (s or '').strip()
        return len(s) > 2 and s[1] == '.' and s[0].upper() in ['A', 'B', 'C', 'D']

    # Initialize canonical structure
    out = {"mcq_questions": [], "desc_questions": []}

    # If parsed is dict and appears well-formed
    if isinstance(parsed, dict):
        mcqs = parsed.get("mcq_questions")
        descs = parsed.get("desc_questions")
        
        if isinstance(mcqs, list):
            for item in mcqs:
                if not isinstance(item, dict):
                    continue
                q = str(item.get("question", "")).strip()
                q = q.replace("```", "").strip()
                
                opts = item.get("options", [])
                ans = str(item.get("answer", "")).strip().upper()
                
                if not isinstance(opts, list):
                    opts = []
                
                # Keep only first 4, enforce labels A-D
                opts = [str(o) for o in opts if isinstance(o, str)]
                labeled = []
                for i, o in enumerate(opts[:4]):
                    label = chr(65 + i)
                    o = str(o).replace("```", "").strip()
                    if is_option_like(o):
                        labeled.append(o)
                    else:
                        labeled.append(f"{label}. {o}")
                
                # Pad if fewer than 4
                while len(labeled) < 4:
                    label = chr(65 + len(labeled))
                    labeled.append(f"{label}. Option")
                
                # Validate answer
                if ans not in ["A", "B", "C", "D"]:
                    ans = "A"
                
                if q:
                    out["mcq_questions"].append({
                        "question": q,
                        "options": labeled[:4],
                        "answer": ans
                    })
        
        if isinstance(descs, list):
            for d in descs:
                if not isinstance(d, str):
                    continue
                s = d.replace("```", "").strip()
                
                if not s or len(s) < 8:
                    continue
                if is_option_like(s):
                    continue
                
                out["desc_questions"].append(s)

    # Enforce counts exactly: 5 MCQ, 3 desc
    out["mcq_questions"] = out["mcq_questions"][:5]
    out["desc_questions"] = out["desc_questions"][:3]

    # Ensure minimum counts
    while len(out["desc_questions"]) < 3:
        out["desc_questions"].append("Describe a relevant experience from your background.")

    while len(out["mcq_questions"]) < 5:
        out["mcq_questions"].append({
            "question": "Which of the following best aligns with your experience?",
            "options": ["A. Option", "B. Option", "C. Option", "D. Option"],
            "answer": "A"
        })

    # Randomize MCQ options
    import random as _rnd
    
    def _strip_label(opt: str) -> str:
        s = (opt or "").strip()
        if len(s) >= 3 and s[1] == '.' and s[0].upper() in ['A','B','C','D']:
            return s[3:].strip()
        return s

    randomized_mcq = []
    for m in out["mcq_questions"]:
        opts = m.get("options", [])
        ans_letter = m.get("answer", "A").strip().upper()
        
        # Extract plain texts and identify correct text
        texts = [_strip_label(o) for o in opts[:4]]
        try:
            correct_idx = ["A","B","C","D"].index(ans_letter)
        except ValueError:
            correct_idx = 0
        
        correct_text = texts[correct_idx] if texts else ""
        
        # Shuffle texts
        shuffled = texts[:]
        _rnd.shuffle(shuffled)
        
        # Relabel
        labeled = []
        new_correct_idx = 0
        for i, t in enumerate(shuffled[:4]):
            label = chr(65 + i)
            labeled.append(f"{label}. {t}")
            if t == correct_text and correct_text != "":
                new_correct_idx = i
        
        new_ans = chr(65 + new_correct_idx)
        randomized_mcq.append({
            "question": str(m.get("question","")),
            "options": labeled[:4],
            "answer": new_ans
        })
    
    out["mcq_questions"] = randomized_mcq[:5]
    return out


def generate_job_description(target_role: str, experience: str, current_role: str) -> str:
    """Generate a job description based on target role and experience level."""
    
    if "GROQ_API_KEY" not in os.environ:
        raise RuntimeError("GROQ_API_KEY environment variable is not set.")

    llm = ChatGroq(temperature=0.7, model_name=_resolve_groq_model(), max_tokens=2048)
    
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
        
        Format the output as a well-structured job description.
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
• Develop and maintain high-quality solutions
• Collaborate with cross-functional teams to deliver projects
• Apply best practices and industry standards
• Participate in technical discussions and code reviews
• Stay updated with latest technologies and methodologies

Required Qualifications:
• {experience}+ years of relevant experience
• Strong problem-solving and analytical skills
• Experience with modern development frameworks and tools
• Excellent communication and teamwork abilities
• Bachelor's degree in relevant field or equivalent experience

We offer competitive compensation, comprehensive benefits, and opportunities for professional growth.
        """.strip()


def main():
    parser = argparse.ArgumentParser(description="Generate resume-based interview questions using multi-agent system")
    parser.add_argument("--session_id", required=True)
    parser.add_argument("--resume_text", required=True)
    parser.add_argument("--job_desc", default="", help="Job description (empty if generating)")
    parser.add_argument("--job_desc_option", default="paste", help="Job description option: paste or generate")
    parser.add_argument("--current_role", required=True)
    parser.add_argument("--target_role", required=True)
    parser.add_argument("--experience", required=True)
    parser.add_argument("--focus_area", required=True, 
                       choices=["skills", "projects", "work_experience"],
                       help="Interview focus area")
    parser.add_argument("--round", default="1", help="Interview round number (for compatibility)")
    
    args = parser.parse_args()

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
    
    # Build graph and initialize state
    graph = build_resume_interview_graph()
    init_state = {
        "resume_text": args.resume_text,
        "job_desc": job_desc,
        "current_role": args.current_role,
        "target_role": args.target_role,
        "experience": args.experience,
        "focus_area": args.focus_area,
    }

    try:
        final_state = graph.invoke(init_state)
        questions = final_state.get("questions", {})
        
        payload = {
            "session_id": args.session_id,
            "focus_area": args.focus_area,
            "questions": questions,
        }
        print(json.dumps(payload))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        raise


if __name__ == "__main__":
    main()