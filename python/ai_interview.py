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

class InterviewState(TypedDict, total=False):
    resume_text: str
    job_desc: str
    # New fields for skill-based pipeline
    user_skills: List[str]
    required_skills: List[str]
    matched_skills: List[str]
    unmatched_skills: List[str]
    target_role: str
    experience: str
    # Sampling controls
    matched_sample_size: int
    unmatched_sample_size: int
    sampled_matched_skills: List[str]
    sampled_unmatched_skills: List[str]
    questions: Dict[str, Any]


def build_graph(round_type: str = "technical_round1") -> StateGraph:
    """Return a compiled LangGraph that produces interview questions for different rounds."""
    # Ensure the API key is set; fallback to env variable
    if "GROQ_API_KEY" not in os.environ:
        raise RuntimeError("GROQ_API_KEY environment variable is not set.")

    llm = ChatGroq(temperature=0.7, model_name=os.getenv("GROQ_MODEL", "llama3-70b-8192"), max_tokens=2048)
    
    # Define different prompts for different rounds (now skill-aware)
    prompts = {
        "technical_round1": """
        Generate interview questions for Technical Round 1 based on BOTH the candidate's resume and the job description.

        Additionally, use the SKILL ANALYSIS below to target strengths and gaps.

       

        CANDIDATE'S RESUME:

        {resume_text}



        JOB DESCRIPTION:

        {job_desc}

       

        SKILL ANALYSIS (derived by earlier agents):

        - Matched Skills (full set): {matched_skills}

        - Unmatched Skills (full set): {unmatched_skills}

        - SAMPLED Matched Skills (USE ONLY THESE FOR CONTENT): {sampled_matched_skills}

        - SAMPLED Unmatched Skills (USE ONLY THESE FOR CONTENT): {sampled_unmatched_skills}

        - Target Role: {target_role}

        - Experience (years): {experience}

       

        INSTRUCTIONS:

        - Analyze the candidate's background from their resume

        - Identify key technical requirements from the job description

        - Focus on fundamental technical skills and basic concepts that match BOTH the resume and job requirements

        - Validate proficiency in MATCHED skills with appropriately scoped questions

        - Probe knowledge gaps in UNMATCHED skills with diagnostic questions

        - Tailor difficulty and context to the Target Role and Experience

        - Create questions that test skills mentioned in the job description while considering the candidate's experience level

        - IMPORTANT: When selecting skills to write questions about, ONLY USE the SAMPLED skill lists shown above. Do NOT use skills outside those lists.

        - Ensure questions are relevant to the specific role and technologies mentioned in the job description

       

        Requirements:

        - Generate EXACTLY 5 MCQ questions with 4 options each (based on technologies/skills from job description)

        - Generate EXACTLY 3 descriptive questions (focused on job-relevant scenarios and skills)

        - For MCQ questions, indicate the correct answer as one of "A","B","C","D"

        - Questions should be tailored to the specific job requirements and candidate's background

        - Ensure a balanced mix: at least 2 questions targeting unmatched skills (to assess gaps) and 3 leveraging matched skills (to validate strengths)

       

        CRITICAL MCQ REQUIREMENTS:

        - Each MCQ must have EXACTLY ONE correct answer - no ambiguity

        - The other 3 options must be clearly incorrect or less optimal

        - Avoid questions where multiple answers could be considered correct

        - Make sure the correct answer is definitively the best choice

        - Double-check that the answer you mark as correct is actually correct

        - Avoid subjective questions - focus on factual, technical knowledge

        - Test specific, verifiable technical concepts with clear right/wrong answers

       

        Output JSON format ONLY (no prose). Return exactly one JSON object with the following structure:

        {{

          "mcq_questions": [

            {{

              "question": "In JavaScript, what will be the output of: console.log(typeof null)?",

              "options": ["A. null", "B. undefined", "C. object", "D. boolean"],

              "answer": "C"

            }},

            ... 5 items total ...

          ],

          "desc_questions": [

            "Describe X ...",

            "Explain Y ...",

            "How would you approach Z ..."

          ]

        }}
        """,
        
        "technical_round2": """
        Generate ADVANCED interview questions for Technical Round 2 based on BOTH the candidate's resume and the job description.

        Additionally, use the SKILL ANALYSIS below to target strengths and gaps.

       

        CANDIDATE'S RESUME:

        {resume_text}



        JOB DESCRIPTION:

        {job_desc}

       

        SKILL ANALYSIS (derived by earlier agents):

        - Matched Skills (full set): {matched_skills}

        - Unmatched Skills (full set): {unmatched_skills}

        - SAMPLED Matched Skills (USE ONLY THESE FOR CONTENT): {sampled_matched_skills}

        - SAMPLED Unmatched Skills (USE ONLY THESE FOR CONTENT): {sampled_unmatched_skills}

        - Target Role: {target_role}

        - Experience (years): {experience}

       

        INSTRUCTIONS:

        - This is a SIGNIFICANTLY MORE DIFFICULT technical round compared to Technical Round 1

        - Questions must be EXPERT-LEVEL and test deep understanding of complex concepts

        - Focus on ADVANCED system design, architecture patterns, performance optimization, and scalability challenges

        - Test knowledge of advanced algorithms, data structures, distributed systems, and enterprise-level solutions

        - Questions should require SENIOR-LEVEL expertise and problem-solving skills

        - Consider complex real-world scenarios that require advanced technical decision-making

        - Validate proficiency in MATCHED skills and probe UNMATCHED skills at advanced depth, considering role and experience

        - IMPORTANT: ONLY USE the SAMPLED skill lists shown above when choosing skills for questions.

       

        DIFFICULTY REQUIREMENTS:

        - MCQ questions should test EXPERT knowledge of advanced concepts, edge cases, and complex scenarios

        - Questions should involve multi-layered thinking and deep technical understanding

        - Focus on advanced topics like: distributed systems, microservices architecture, performance optimization,

          advanced algorithms, system scalability, security architecture, advanced database concepts,

          cloud architecture patterns, advanced design patterns, and complex problem-solving

        - Descriptive questions should require designing complex systems and solving challenging technical problems

       

        Output JSON format ONLY (no prose). Return exactly one JSON object with the structure:

        {{

          "mcq_questions": [

            {{

              "question": "In the CAP theorem for distributed systems, what does the 'P' represent?",

              "options": ["A. Performance", "B. Partition tolerance", "C. Persistence", "D. Parallel processing"],

              "answer": "B"

            }},

            ... 5 items total ...

          ],

          "desc_questions": [

            "Design a fault-tolerant ...",

            "Architect a real-time ...",

            "Design a comprehensive security ..."

          ]

        }}
        """,
        
        "managerial_round": """
        Generate interview questions for Managerial Round based on BOTH the candidate's resume and the job description.
        Additionally, use the SKILL ANALYSIS below to target strengths and gaps.
        
        CANDIDATE'S RESUME:
        {resume_text}

        JOB DESCRIPTION:
        {job_desc}
        
        SKILL ANALYSIS (derived by earlier agents):
        - Matched Skills (full set): {matched_skills}
        - Unmatched Skills (full set): {unmatched_skills}
        - SAMPLED Matched Skills (USE ONLY THESE FOR CONTENT): {sampled_matched_skills}
        - SAMPLED Unmatched Skills (USE ONLY THESE FOR CONTENT): {sampled_unmatched_skills}
        - Target Role: {target_role}
        - Experience (years): {experience}
        
        INSTRUCTIONS:
        - Analyze the candidate's leadership experience and management background from their resume
        - Focus on the specific management responsibilities and team leadership requirements mentioned in the job description
        - Consider the team size, project scope, and management challenges described in the job posting
        - IMPORTANT: ONLY USE the SAMPLED skill lists shown above when choosing skills for questions.
        
        Requirements:
        - Generate EXACTLY 5 MCQ questions and EXACTLY 3 descriptive questions
        - Follow the same JSON output schema as above with keys "mcq_questions" and "desc_questions"
        
        Output JSON format ONLY (no prose). Use this structure:
        {{
          "mcq_questions": [ {{"question": "...", "options": ["A. ...","B. ...","C. ...","D. ..."], "answer": "A"}}, ... ],
          "desc_questions": ["...", "...", "..."]
        }}
        """,
        
        "hr_round": """
        Generate interview questions for HR Round based on BOTH the candidate's resume and the job description.
        Additionally, use the SKILL ANALYSIS below to target strengths and gaps.
        
        CANDIDATE'S RESUME:
        {resume_text}

        JOB DESCRIPTION:
        {job_desc}
        
        SKILL ANALYSIS (derived by earlier agents):
        - Matched Skills (full set): {matched_skills}
        - Unmatched Skills (full set): {unmatched_skills}
        - SAMPLED Matched Skills (USE ONLY THESE FOR CONTENT): {sampled_matched_skills}
        - SAMPLED Unmatched Skills (USE ONLY THESE FOR CONTENT): {sampled_unmatched_skills}
        - Target Role: {target_role}
        - Experience (years): {experience}
        
        INSTRUCTIONS:
        - Analyze the candidate's career progression, values, and motivations from their resume
        - Focus on the company culture, values, and work environment described in the job description
        - Consider the specific role requirements, team dynamics, and organizational fit mentioned in the job posting
        - IMPORTANT: ONLY USE the SAMPLED skill lists shown above when choosing skills for questions.
        
        Requirements:
        - Generate EXACTLY 5 MCQ questions and EXACTLY 3 descriptive questions
        - Follow the JSON output schema with keys "mcq_questions" and "desc_questions"
        
        Output JSON format ONLY (no prose). Use this structure:
        {{
          "mcq_questions": [ {{"question": "...", "options": ["A. ...","B. ...","C. ...","D. ..."], "answer": "A"}}, ... ],
          "desc_questions": ["...", "...", "..."]
        }}
        """
    }
    
    prompt_template = prompts.get(round_type, prompts["technical_round1"])
    prompt = ChatPromptTemplate.from_template(prompt_template)

    def _safe_json(text: str):
        try:
            if "```" in text:
                # try to extract fenced JSON
                parts = text.split("```")
                for p in parts:
                    p = p.strip()
                    if p.startswith("{") or p.startswith("["):
                        return json.loads(p)
            return json.loads(text)
        except Exception:
            return None

    def skill_extraction(state: dict):
        """Agent 1: extract user_skills and required_skills from resume and JD."""
        extract_prompt = ChatPromptTemplate.from_template(
            """
            You are a skill extraction assistant. Read the following resume text and job description and extract concise, deduplicated skill names.
            Return STRICT JSON only in the following format with two arrays of strings:
            {{
              "user_skills": ["skill1", "skill2", ...],
              "required_skills": ["skillA", "skillB", ...]
            }}

            Resume Text:
            {resume_text}

            Job Description:
            {job_desc}
            """
        )
        result = llm.predict(extract_prompt.format(**state))
        data = _safe_json(result) or {}
        state["user_skills"] = data.get("user_skills", [])
        state["required_skills"] = data.get("required_skills", [])
        return state

    def skill_matching(state: dict):
        """Agent 2: compute matched and unmatched skills."""
        # ensure lists
        user = state.get("user_skills", []) or []
        req = state.get("required_skills", []) or []
        match_prompt = ChatPromptTemplate.from_template(
            """
            Compare the following skill lists and return STRICT JSON only:
            {{
              "matched_skills": ["..."],
              "unmatched_skills": ["..."]
            }}
            - matched_skills: skills present in both user_skills and required_skills (case-insensitive, normalize synonyms where obvious)
            - unmatched_skills: skills present in required_skills but not in user_skills

            user_skills: {user_skills}
            required_skills: {required_skills}
            """
        )
        result = llm.predict(match_prompt.format(user_skills=user, required_skills=req))
        data = _safe_json(result) or {}
        state["matched_skills"] = data.get("matched_skills", [])
        state["unmatched_skills"] = data.get("unmatched_skills", [])
        return state

    def skill_sampling(state: dict):
        """Agent 2.5: randomly sample a fixed count of matched and unmatched skills for question generation."""
        matched = state.get("matched_skills", []) or []
        unmatched = state.get("unmatched_skills", []) or []
        ms = state.get("matched_sample_size")
        us = state.get("unmatched_sample_size")
        # Defaults if not provided
        if not isinstance(ms, int) or ms <= 0:
            ms = 3
        if not isinstance(us, int) or us <= 0:
            us = 2
        sampled_matched = random.sample(matched, k=min(ms, len(matched))) if matched else []
        sampled_unmatched = random.sample(unmatched, k=min(us, len(unmatched))) if unmatched else []
        state["matched_sample_size"] = ms
        state["unmatched_sample_size"] = us
        state["sampled_matched_skills"] = sampled_matched
        state["sampled_unmatched_skills"] = sampled_unmatched
        return state

    def generate_questions(state: dict):
        prompt_text = prompt.format(**state)
        result = llm.predict(prompt_text)

        def is_option_like(s: str) -> bool:
            s = (s or '').strip()
            return len(s) > 2 and s[1] == '.' and s[0].upper() in ['A', 'B', 'C', 'D']

        def normalize_output(parsed):
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
                        opts = item.get("options", [])
                        ans = str(item.get("answer", "")).strip().upper()
                        if not isinstance(opts, list):
                            opts = []
                        # Keep only first 4, enforce labels A-D
                        opts = [str(o) for o in opts if isinstance(o, str)]
                        # If options not labeled, label them
                        labeled = []
                        for i, o in enumerate(opts[:4]):
                            label = chr(65 + i)
                            if is_option_like(o):
                                labeled.append(o)
                            else:
                                labeled.append(f"{label}. {o}")
                        # Pad if fewer than 4
                        while len(labeled) < 4:
                            label = chr(65 + len(labeled))
                            labeled.append(f"{label}. " + "Option")
                        # Validate answer
                        if ans not in ["A", "B", "C", "D"]:
                            # try to infer from correct option text if present
                            ans = "A"
                        if q:
                            out["mcq_questions"].append({
                                "question": q,
                                "options": labeled[:4],
                                "answer": ans
                            })
                if isinstance(descs, list):
                    for d in descs:
                        if isinstance(d, str) and not is_option_like(d):
                            out["desc_questions"].append(d.strip())

            # If parsed is list or malformed dict, derive heuristically from text
            if not out["mcq_questions"] and not out["desc_questions"]:
                lines = []
                if isinstance(parsed, list):
                    lines = [str(x) for x in parsed]
                else:
                    # fallback: split raw text
                    lines = [ln.strip("- ") for ln in str(result).split("\n") if ln.strip()]

                # Heuristic: collect long sentences as descriptive, group blocks into MCQ when we see a question followed by options
                temp_mcq = []
                i = 0
                while i < len(lines):
                    line = lines[i]
                    if not line:
                        i += 1
                        continue
                    # If the line looks like a question (ends with ? or is long) and following lines include options
                    lookahead = lines[i+1:i+6]
                    opts = [x for x in lookahead if is_option_like(x)]
                    if (line.endswith('?') or len(line) > 40) and len(opts) >= 3:
                        # take first 4 options
                        taken = []
                        for x in lookahead:
                            if is_option_like(x):
                                taken.append(x)
                            if len(taken) == 4:
                                break
                        temp_mcq.append({
                            "question": line,
                            "options": taken if len(taken) == 4 else (taken + [f"{chr(65+len(taken))}. Option"]*(4-len(taken))),
                            "answer": "A"
                        })
                        i += 1 + len(lookahead)
                        continue
                    else:
                        # treat as descriptive candidate if not an option line
                        if not is_option_like(line):
                            out["desc_questions"].append(line)
                    i += 1

                out["mcq_questions"] = temp_mcq

            # Enforce counts exactly: 5 MCQ, 3 desc
            out["mcq_questions"] = out["mcq_questions"][:5]
            out["desc_questions"] = [d for d in out["desc_questions"] if not is_option_like(d)][:3]

            # Final safety: ensure each MCQ has exactly 4 options and a valid answer
            cleaned_mcq = []
            for m in out["mcq_questions"]:
                q = str(m.get("question", "")).strip()
                opts = [o for o in (m.get("options") or []) if isinstance(o, str)]
                labeled = []
                for i, o in enumerate(opts[:4]):
                    label = chr(65 + i)
                    labeled.append(o if is_option_like(o) else f"{label}. {o}")
                while len(labeled) < 4:
                    label = chr(65 + len(labeled))
                    labeled.append(f"{label}. Option")
                ans = str(m.get("answer", "A")).strip().upper()
                if ans not in ["A", "B", "C", "D"]:
                    ans = "A"
                if q:
                    cleaned_mcq.append({"question": q, "options": labeled[:4], "answer": ans})
            out["mcq_questions"] = cleaned_mcq[:5]

            # If still insufficient, trim or pad desc
            out["desc_questions"] = [d for d in out["desc_questions"] if isinstance(d, str) and d][:3]
            while len(out["desc_questions"]) < 3:
                out["desc_questions"].append("Describe a project relevant to the role and your contribution.")

            while len(out["mcq_questions"]) < 5:
                idx = len(out["mcq_questions"]) + 1
                out["mcq_questions"].append({
                    "question": f"Placeholder MCQ {idx} based on the job description and resume.",
                    "options": ["A. Option", "B. Option", "C. Option", "D. Option"],
                    "answer": "A"
                })

            return out

        data = _safe_json(result)
        questions = normalize_output(data)
        state["questions"] = questions
        return state

    sg = StateGraph(InterviewState)
    sg.add_node("skill_extraction", skill_extraction)
    sg.add_node("skill_matching", skill_matching)
    sg.add_node("skill_sampling", skill_sampling)
    sg.add_node("generate", generate_questions)
    sg.set_entry_point("skill_extraction")
    sg.add_edge("skill_extraction", "skill_matching")
    sg.add_edge("skill_matching", "skill_sampling")
    sg.add_edge("skill_sampling", "generate")
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
    parser.add_argument("--matched_sample_size", type=int, default=3, help="Number of matched skills to sample")
    parser.add_argument("--unmatched_sample_size", type=int, default=2, help="Number of unmatched skills to sample")
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
        "matched_sample_size": args.matched_sample_size,
        "unmatched_sample_size": args.unmatched_sample_size,
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