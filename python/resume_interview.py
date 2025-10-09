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
            You are an experienced technical interviewer. Generate interview questions focused on SKILLS assessment based on the candidate's actual resume.
            
            CANDIDATE'S SKILLS FROM RESUME:
            {focus_content}
            
            JOB REQUIREMENTS:
            {job_requirements}
            
            TARGET ROLE: {target_role}
            EXPERIENCE: {experience} years
            
            INSTRUCTIONS:
            - Create questions that test SPECIFIC technologies and skills from their resume
            - Make questions sound like a real interviewer who has read their resume
            - Test practical knowledge relevant to their experience level
            - Generate diverse, non-repetitive questions
            - Each question should test different concepts/technologies
            
            CRITICAL MCQ REQUIREMENTS:
            - Each MCQ must have EXACTLY ONE correct answer
            - Options must be realistic and technically accurate
            - Test specific technical concepts, not general knowledge
            - Make questions challenging but appropriate for their experience level
            
            Generate EXACTLY 5 MCQ questions and 3 descriptive questions.
            
            Return ONLY valid JSON in this exact format:
            {{
              "mcq_questions": [
                {{
                  "question": "What is the primary purpose of React hooks?",
                  "options": ["A. To replace class components entirely", "B. To manage state and side effects in functional components", "C. To improve performance only", "D. To handle routing"],
                  "answer": "B"
                }},
                {{
                  "question": "In JavaScript, what does the 'this' keyword refer to in an arrow function?",
                  "options": ["A. The global object", "B. The function itself", "C. The lexical scope where it was defined", "D. Undefined"],
                  "answer": "C"
                }},
                {{
                  "question": "Which HTTP status code indicates a successful POST request that created a new resource?",
                  "options": ["A. 200 OK", "B. 201 Created", "C. 202 Accepted", "D. 204 No Content"],
                  "answer": "B"
                }},
                {{
                  "question": "What is the main advantage of using CSS Grid over Flexbox?",
                  "options": ["A. Better browser support", "B. Simpler syntax", "C. Two-dimensional layout control", "D. Faster rendering"],
                  "answer": "C"
                }},
                {{
                  "question": "In Git, what does 'git rebase' do?",
                  "options": ["A. Creates a new branch", "B. Merges branches with a merge commit", "C. Replays commits on top of another base", "D. Deletes the current branch"],
                  "answer": "C"
                }}
              ],
              "desc_questions": [
                "Tell me about a challenging technical problem you solved. What was your approach and what technologies did you use?",
                "Describe your experience with [specific technology from resume]. How have you used it in your projects?",
                "How do you stay updated with new technologies and best practices in your field?"
              ]
            }}
            """,
            
            "projects": """
            You are an experienced technical interviewer. Generate interview questions focused on PROJECT experience based on the candidate's actual projects.
            
            CANDIDATE'S PROJECTS:
            {focus_content}
            
            JOB REQUIREMENTS:
            {job_requirements}
            
            TARGET ROLE: {target_role}
            EXPERIENCE: {experience} years
            
            INSTRUCTIONS:
            - Reference their actual project names and technologies when possible
            - Ask about technical decisions, architecture, and implementation
            - Test project management and problem-solving skills
            - Make questions sound like a real interviewer who studied their resume
            - Generate diverse questions covering different aspects of project work
            
            Generate EXACTLY 5 MCQ questions and 3 descriptive questions.
            
            Return ONLY valid JSON in this exact format:
            {{
              "mcq_questions": [
                {{
                  "question": "When implementing a REST API, which HTTP method should be used for updating a partial resource?",
                  "options": ["A. POST", "B. PUT", "C. PATCH", "D. UPDATE"],
                  "answer": "C"
                }},
                {{
                  "question": "What is the main benefit of using a microservices architecture?",
                  "options": ["A. Simpler deployment", "B. Better scalability and maintainability", "C. Reduced code complexity", "D. Lower infrastructure costs"],
                  "answer": "B"
                }},
                {{
                  "question": "In agile development, what is the purpose of a sprint retrospective?",
                  "options": ["A. Plan the next sprint", "B. Review completed work", "C. Identify improvements for the team process", "D. Estimate story points"],
                  "answer": "C"
                }},
                {{
                  "question": "Which database approach is best for handling complex relationships between entities?",
                  "options": ["A. NoSQL document store", "B. Key-value store", "C. Relational database", "D. Graph database"],
                  "answer": "D"
                }},
                {{
                  "question": "What is the primary purpose of containerization in software deployment?",
                  "options": ["A. Improve application performance", "B. Ensure consistent environments across deployments", "C. Reduce code size", "D. Eliminate the need for testing"],
                  "answer": "B"
                }}
              ],
              "desc_questions": [
                "Walk me through one of your most challenging projects. What was the problem you were solving and how did you approach it?",
                "Tell me about a time when you had to make a difficult technical decision in a project. What factors did you consider?",
                "Describe how you handled project requirements that changed during development. What was your process?"
              ]
            }}
            """,
            
            "work_experience": """
            You are an experienced HR interviewer. Generate interview questions focused on WORK EXPERIENCE based on the candidate's actual work history.
            
            CANDIDATE'S WORK EXPERIENCE:
            {focus_content}
            
            JOB REQUIREMENTS:
            {job_requirements}
            
            TARGET ROLE: {target_role}
            EXPERIENCE: {experience} years
            
            INSTRUCTIONS:
            - Reference their actual companies and roles when possible
            - Ask about career progression, leadership, and teamwork
            - Test professional skills and workplace scenarios
            - Make questions sound like a real interviewer who studied their background
            - Generate diverse questions covering different aspects of work experience
            
            Generate EXACTLY 5 MCQ questions and 3 descriptive questions.
            
            Return ONLY valid JSON in this exact format:
            {{
              "mcq_questions": [
                {{
                  "question": "When facing a tight deadline with competing priorities, what is the most effective approach?",
                  "options": ["A. Work overtime to complete everything", "B. Communicate with stakeholders to prioritize tasks", "C. Delegate everything to team members", "D. Focus only on the most visible tasks"],
                  "answer": "B"
                }},
                {{
                  "question": "How should you handle a situation where a team member consistently misses deadlines?",
                  "options": ["A. Report them to management immediately", "B. Do their work for them", "C. Have a private conversation to understand and address the issue", "D. Ignore it and hope it improves"],
                  "answer": "C"
                }},
                {{
                  "question": "What is the best way to handle constructive criticism from your manager?",
                  "options": ["A. Defend your actions immediately", "B. Listen actively and ask clarifying questions", "C. Agree without understanding", "D. Dismiss it as unfair"],
                  "answer": "B"
                }},
                {{
                  "question": "When working on a cross-functional team, what is most important for success?",
                  "options": ["A. Being the most technically skilled", "B. Taking charge of all decisions", "C. Clear communication and collaboration", "D. Working independently"],
                  "answer": "C"
                }},
                {{
                  "question": "How should you approach learning a new technology required for your role?",
                  "options": ["A. Wait for formal training", "B. Proactively learn through multiple resources and practice", "C. Ask colleagues to do the work instead", "D. Claim you already know it"],
                  "answer": "B"
                }}
              ],
              "desc_questions": [
                "Tell me about your career progression and what motivated your transition between roles.",
                "Describe a challenging workplace situation you faced and how you handled it professionally.",
                "How do you approach working with difficult team members or stakeholders?"
              ]
            }}
            """
        }
        
        prompt_template = prompts.get(focus_area, prompts["skills"])
        prompt = ChatPromptTemplate.from_template(prompt_template)
        
        try:
            result = llm.predict(prompt.format(**state))
            
            # Simple JSON parsing with fallback
            try:
                if "```json" in result:
                    json_part = result.split("```json")[1].split("```")[0]
                    data = json.loads(json_part)
                elif "```" in result:
                    json_part = result.split("```")[1]
                    if json_part.startswith("json"):
                        json_part = json_part[4:]
                    data = json.loads(json_part)
                else:
                    data = json.loads(result)
            except:
                # If JSON parsing fails, return error
                state["questions"] = {
                    "error": "Failed to parse questions from AI response",
                    "raw_response": result[:500]
                }
                return state

            # Validate structure
            if not isinstance(data, dict):
                state["questions"] = {"error": "Invalid response format"}
                return state
                
            mcq_questions = data.get("mcq_questions", [])
            desc_questions = data.get("desc_questions", [])
            
            # Validate MCQ questions
            validated_mcq = []
            for mcq in mcq_questions[:5]:  # Take only first 5
                if not isinstance(mcq, dict):
                    continue
                question = mcq.get("question", "").strip()
                options = mcq.get("options", [])
                answer = mcq.get("answer", "A").strip().upper()
                
                if not question or not options or len(options) != 4:
                    continue
                    
                if answer not in ["A", "B", "C", "D"]:
                    answer = "A"
                    
                validated_mcq.append({
                    "question": question,
                    "options": options,
                    "answer": answer
                })
            
            # Validate descriptive questions
            validated_desc = []
            for desc in desc_questions[:3]:  # Take only first 3
                if isinstance(desc, str) and desc.strip():
                    validated_desc.append(desc.strip())
            
            # Ensure we have the right number of questions
            while len(validated_mcq) < 5:
                validated_mcq.append({
                    "question": f"Sample technical question {len(validated_mcq) + 1}",
                    "options": ["A. Option 1", "B. Option 2", "C. Option 3", "D. Option 4"],
                    "answer": "A"
                })
                
            while len(validated_desc) < 3:
                validated_desc.append(f"Describe your experience with relevant technologies for this role.")
            
            state["questions"] = {
                "mcq_questions": validated_mcq,
                "desc_questions": validated_desc
            }
            
        except Exception as e:
            state["questions"] = {
                "error": f"Question generation failed: {str(e)}",
                "fallback": True
            }
        
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