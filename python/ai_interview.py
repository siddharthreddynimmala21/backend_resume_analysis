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
    # New fields for topic-based pipeline
    easy_topic_skills: List[str]
    hard_topic_skills: List[str]
    selected_easy_topics: List[str]
    selected_hard_topics: List[str]
    prev_used_hard_topics: List[str]
    target_role: str
    experience: str
    questions: Dict[str, Any]


def _resolve_groq_model() -> str:
    """Return a supported Groq model name, remapping deprecated aliases if needed.
    Honors the GROQ_MODEL env var if present, else defaults to a safe current model.
    """
    # Known decommissioned/old aliases -> current recommended equivalents
    alias_map = {
        "llama3-70b-8192": "llama-3.1-70b-versatile",
        "llama3-8b-8192": "llama-3.1-8b-instant",
        "llama3-70b": "llama-3.1-70b-versatile",
        "llama3-8b": "llama-3.1-8b-instant",
    }
    env_model = os.getenv("GROQ_MODEL")
    if env_model:
        return alias_map.get(env_model, env_model)
    # Default to a currently supported model
    return "llama-3.1-8b-instant"


def build_graph(round_type: str = "technical_round1") -> StateGraph:
    """Return a compiled LangGraph that produces interview questions for different rounds."""
    # Ensure the API key is set; fallback to env variable
    if "GROQ_API_KEY" not in os.environ:
        raise RuntimeError("GROQ_API_KEY environment variable is not set.")

    llm = ChatGroq(temperature=0.7, model_name=_resolve_groq_model(), max_tokens=2048)
    
    # Define different prompts for different rounds (now topic-aware)
    prompts = {
        "technical_round1": """
        # ROLE: You are an expert Technical Interviewer and Question Architect. Your persona is a Senior Engineer tasked with creating a fair and effective screening interview.
        # OBJECTIVE: Generate a set of 8 interview questions for a "Technical Round 1" based on the provided skill topics, candidate resume, and job description.

        # CONTEXTUAL INPUTS:
        1. FOCUSED SKILL TOPICS:
           - Easy Difficulty (4 topics): {selected_easy_topics}
           - Hard Difficulty (1 topic): {selected_hard_topics}
        2. CANDIDATE RESUME: {resume_text}
        3. JOB DESCRIPTION: {job_desc}

        # STRICT GUIDELINES:
        1. Question Distribution & Topic Adherence:
           - Generate exactly 5 Multiple-Choice Questions (MCQs) and 3 Descriptive Questions.
           - MCQs: Create 4 questions from the 'Easy Difficulty' topics and 1 question from the 'Hard Difficulty' topic.
           - Descriptive Questions: Create 2 questions from the 'Easy Difficulty' topics and 1 challenging, in-depth question from the 'Hard Difficulty' topic.
           - CRITICAL: Do NOT ask about any topic or skill NOT listed in the FOCUSED SKILL TOPICS.
        2. Contextual Tailoring:
           - Subtly tailor the questions to be relevant to the candidate's experience in the CANDIDATE RESUME and the requirements in the JOB DESCRIPTION.
           - For example, frame a question around a project or technology mentioned in their resume.
        3. Quality Standards:
           - MCQs: Ensure there are four distinct options (A, B, C, D) with only one unambiguously correct answer. The incorrect options should be plausible distractors.
           - Descriptive Questions: Assess thought process, problem-solving, and depth of knowledge.

        # OUTPUT FORMAT:
        - Your entire response MUST be a single, valid JSON object.
        - Do NOT include any text, explanations, or markdown formatting before or after the JSON structure.
        {{
          "mcq_questions": [
            {{ "question": "...", "options": {{ "A": "...", "B": "...", "C": "...", "D": "..." }}, "answer": "A" }}
          ],
          "desc_questions": [ "...", "...", "..." ]
        }}
        """,
        
        "technical_round2": """
        # ROLE: You are a Principal Engineer or Tech Lead. Your task is to conduct a deep-dive technical interview (Round 2) to rigorously assess a candidate's expert-level knowledge and problem-solving abilities.
        # OBJECTIVE: Generate a highly challenging set of 8 interview questions. This round must be significantly more difficult than a preliminary screening and should focus on architectural thinking, trade-off analysis, and practical application of advanced concepts.

        # CONTEXTUAL INPUTS:
        1. ADVANCED SKILL TOPICS: {remaining_hard_topics}
        2. TOPICS TO AVOID (Covered in Round 1): {prev_used_hard_topics}
        3. CANDIDATE RESUME: {resume_text}
        4. JOB DESCRIPTION: {job_desc}

        # STRICT GUIDELINES:
        1. Difficulty Level: EXPERT
           - Move beyond definitional questions. Focus on "How would you design...", "What are the trade-offs between...", and "Why would you choose X over Y in a scenario like..."
           - Questions must probe deep understanding of underlying principles.
        2. Question Composition
           - Advanced MCQs (5 total): test nuanced understanding of complex topics. Incorrect options must be subtle misconceptions or suboptimal solutions.
           - Problem-Solving Scenarios (3 total): mini case studies/design challenges requiring the candidate to architect a solution, debug a complex issue, or justify architectural decisions.
        3. Strict Topic Adherence
           - Base ALL questions strictly on ADVANCED SKILL TOPICS.
           - CRITICAL: Do NOT ask about any topic listed in TOPICS TO AVOID.
        4. Contextual Scenarios
           - Use the candidate resume and job description to craft realistic, role-relevant problems (e.g., scale to millions of users, align with domain/constraints).

        # OUTPUT FORMAT:
        - Your entire response MUST be a single, valid JSON object.
        - Do NOT include any text, explanations, or markdown formatting before or after the JSON structure.
        {{
          "mcq_questions": [
            {{ "question": "...", "options": {{ "A": "...", "B": "...", "C": "...", "D": "..." }}, "answer": "A" }}
          ],
          "desc_questions": [ "...", "...", "..." ]
        }}
        """,

        "managerial_round": """
        # ROLE: You are a seasoned Director or VP of Engineering. You are interviewing a candidate for a leadership position and need to assess their people management skills, strategic thinking, and emotional intelligence.
        # OBJECTIVE: Generate a set of sophisticated behavioral and situational judgment questions for a final-round Managerial Interview. The questions must evaluate the candidate's leadership potential and alignment with modern management practices.

        # CONTEXTUAL INPUTS:
        1. CANDIDATE RESUME: {resume_text}
        2. JOB DESCRIPTION (for organizational context): {job_desc}
        3. CANDIDATE PROFILE:
           - Target Role: {target_role}
           - Years of Experience: {experience}

        # STRICT GUIDELINES:
        1. Seniority Calibration (Crucial):
           - Adjust scope and complexity based on years of experience.
           - For junior managers/leads (< 5 years): focus on team-level challenges, direct-report performance, and project execution.
           - For senior managers/directors (> 10 years): focus on cross-functional strategy, managing other managers, org design, and ambiguity.
        2. Question Focus:
           - Questions must be strictly about leadership, strategy, and people management.
           - CRITICAL: Do NOT generate questions about individual coding tasks, technical system design, or specific technologies.
        3. MCQ Scenario Design:
           - Generate 5 MCQ questions. Each MCQ should be a realistic managerial dilemma.
           - Options (A–D) should represent distinct, plausible management approaches (e.g., passive, authoritarian, collaborative/empowering, etc.). Mark as correct the option best aligned with modern leadership principles.
        4. Descriptive Question Theming:
           - Generate 3 descriptive, open-ended questions.
           - Each must probe a different core leadership theme. Choose three distinct themes from:
             1) Conflict Resolution & Communication
             2) Performance Management & Coaching
             3) Strategic Planning & Prioritization
             4) Stakeholder Management & Influence
             5) Leading Through Change & Ambiguity
           - Frame the questions to encourage storytelling using the STAR method (Situation, Task, Action, Result).

        # OUTPUT FORMAT:
        - Your entire response MUST be a single, valid JSON object.
        - Do NOT include any text, explanations, or markdown formatting before or after the JSON structure.
        {{
          "mcq_questions": [
            {{ "question": "...", "options": {{ "A": "...", "B": "...", "C": "...", "D": "..." }}, "answer": "A" }}
          ],
          "desc_questions": [ "...", "...", "..." ]
        }}
        """,

        "hr_round": """
        # ROLE: You are an experienced HR Business Partner. Your role is to assess a candidate's motivation, self-awareness, collaborative spirit, and overall alignment with a healthy and productive workplace culture.
        # OBJECTIVE: Generate a set of classic HR interview questions for a final screening round. The questions should be designed to understand the candidate's past behaviors, future ambitions, and interpersonal skills.

        # CONTEXTUAL INPUTS:
        1. CANDIDATE RESUME: {resume_text}
        2. JOB DESCRIPTION (for organizational context): {job_desc}
        3. CANDIDATE PROFILE:
           - Target Role: {target_role}
           - Years of Experience: {experience}

        # STRICT GUIDELINES:
        1. Assessment Focus:
           - Evaluate across four key areas:
             1) Motivation & Ambition
             2) Collaboration & Teamwork
             3) Self-Awareness & Growth
             4) Resilience & Professionalism
        2. MCQ Design (Situational Judgment):
           - Generate 5 MCQ questions, each a common workplace scenario testing professional judgment.
           - Options (A–D) must reflect different reactions (e.g., proactive, passive, overly individualistic, collaborative). The best answer reflects maturity, ownership, and a team-oriented mindset.
        3. Descriptive Question Theming:
           - Generate 3 classic, open-ended questions; each targets a different area from the four above. Examples include:
             - Motivation & Ambition: "Why this company?", "Where do you see yourself in 5 years?"
             - Collaboration & Teamwork: "Tell me about a time you disagreed with a teammate."
             - Self-Awareness & Growth: "What is your greatest weakness?", "Describe a time you received difficult feedback."
        4. General Rules:
           - CRITICAL: Do NOT ask any technical questions or day-to-day role-specific tasks.
           - Use clear, simple, and universally understood HR language.

        # OUTPUT FORMAT:
        - Your entire response MUST be a single, valid JSON object.
        - Do NOT include any text, explanations, or markdown formatting before or after the JSON structure.
        {{
          "mcq_questions": [
            {{ "question": "...", "options": {{ "A": "...", "B": "...", "C": "...", "D": "..." }}, "answer": "A" }}
          ],
          "desc_questions": [ "...", "...", "..." ]
        }}
        """,
        
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

    def topic_extraction(state: dict):
        """Agent 1: Extract easy and hard topic skills from the ENTIRE resume (all sections)."""
        extract_prompt = ChatPromptTemplate.from_template(
            """
            You are a resume topic mining assistant. Read the ENTIRE resume content below (skills, projects, work experience, summary, certifications, any other sections) and extract two arrays:
            1) easy_topic_skills: up to 10 topics that are foundational/common for the candidate based on resume content
            2) hard_topic_skills: up to 5 topics that are advanced/deep or complex according to the resume content

            Rules:
            - Deduplicate and normalize topic names (short, canonical terms)
            - Consider the full resume, not just a skills list
            - Do not invent technologies that aren't implied by the resume
            - Keep the limits strictly: easy max 10, hard max 5

            Return STRICT JSON only in this format:
            {{
              "easy_topic_skills": ["..."],
              "hard_topic_skills": ["..."]
            }}

            RESUME TEXT:
            {resume_text}
            """
        )
        result = llm.predict(extract_prompt.format(resume_text=state.get("resume_text", "")))
        data = _safe_json(result) or {}
        easy = (data.get("easy_topic_skills") or [])[:10]
        hard = (data.get("hard_topic_skills") or [])[:5]
        state["easy_topic_skills"] = easy
        state["hard_topic_skills"] = hard
        return state

    def topic_selection(state: dict):
        """Agent 2: Select topics per round:
        - Round 1: pick 4 random easy topics and 1 random hard topic
        - Round 2: use all remaining hard topics excluding previously used hard topics
        """
        easy = state.get("easy_topic_skills", []) or []
        hard = state.get("hard_topic_skills", []) or []
        prev = state.get("prev_used_hard_topics", []) or []

        try:
            round_num = int(state.get("round", "1"))
        except Exception:
            round_num = 1

        if round_num == 1:
            sel_easy = random.sample(easy, k=min(4, len(easy))) if easy else []
            sel_hard = random.sample(hard, k=min(1, len(hard))) if hard else []
            state["selected_easy_topics"] = sel_easy
            state["selected_hard_topics"] = sel_hard
        elif round_num == 2:
            remaining_hard = [h for h in hard if h not in prev]
            state["remaining_hard_topics"] = remaining_hard
            state["selected_easy_topics"] = []
            state["selected_hard_topics"] = remaining_hard[:]  # for consistency in output
        else:
            # Other rounds don't use topic selection
            state["selected_easy_topics"] = []
            state["selected_hard_topics"] = []
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
        # For technical rounds, ensure proper prompt variables are present
        try:
            round_num = int(state.get("round", "1"))
        except Exception:
            round_num = 1

        if round_type == "technical_round1":
            prompt_text = prompt.format(
                selected_easy_topics=json.dumps(state.get("selected_easy_topics", [])),
                selected_hard_topics=json.dumps(state.get("selected_hard_topics", [])),
                resume_text=state.get("resume_text", ""),
                job_desc=state.get("job_desc", ""),
            )
        elif round_type == "technical_round2":
            prompt_text = prompt.format(
                remaining_hard_topics=json.dumps(state.get("remaining_hard_topics", state.get("selected_hard_topics", []))),
                prev_used_hard_topics=json.dumps(state.get("prev_used_hard_topics", [])),
                resume_text=state.get("resume_text", ""),
                job_desc=state.get("job_desc", ""),
            )
        else:
            prompt_text = prompt.format(
                resume_text=state.get("resume_text", ""),
                job_desc=state.get("job_desc", ""),
                target_role=state.get("target_role", ""),
                experience=state.get("experience", ""),
            )
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
                        # Strip code fence artifacts and numbering like 'Q6.'
                        q = q.replace("```", "").strip()
                        if q.lower().startswith("q") and ":" not in q and "." in q[:5]:
                            # Remove leading 'Qn.' prefix
                            try:
                                parts = q.split(".", 1)
                                if parts[0][1:].isdigit():
                                    q = parts[1].strip()
                            except Exception:
                                pass
                        # Drop placeholder text entirely
                        if q.lower().startswith("placeholder mcq"):
                            q = "Which of the following best aligns with the target role?"
                        opts_raw = item.get("options", [])
                        ans = str(item.get("answer", "")).strip().upper()
                        labeled = []
                        # Accept either dict {A:...,B:...,C:...,D:...} or list [..]
                        if isinstance(opts_raw, dict):
                            a = str(opts_raw.get("A", "Option")).replace("```", "").strip()
                            b = str(opts_raw.get("B", "Option")).replace("```", "").strip()
                            c = str(opts_raw.get("C", "Option")).replace("```", "").strip()
                            d = str(opts_raw.get("D", "Option")).replace("```", "").strip()
                            labeled = [f"A. {a}", f"B. {b}", f"C. {c}", f"D. {d}"]
                        else:
                            opts = item.get("options", [])
                            if not isinstance(opts, list):
                                opts = []
                            # Keep only first 4, enforce labels A-D
                            opts = [str(o) for o in opts if isinstance(o, str)]
                            # If options not labeled, label them
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
                        if not isinstance(d, str):
                            continue
                        s = d.replace("```", "").strip()
                        # Remove leading numbering like 'Q6.'
                        if s.lower().startswith("q") and "." in s[:5]:
                            try:
                                parts = s.split(".", 1)
                                if parts[0][1:].isdigit():
                                    s = parts[1].strip()
                            except Exception:
                                pass
                        # Filter out code block markers or empty/very short strings
                        if not s or len(s) < 8:
                            continue
                        if is_option_like(s):
                            continue
                        # Prefer questions or instruction-like prompts
                        if not (s.endswith("?") or s.lower().startswith(("describe", "explain", "how", "what", "why", "design"))):
                            continue
                        out["desc_questions"].append(s)

            # If parsed is list or malformed dict, derive heuristically from text
            if not out["mcq_questions"] and not out["desc_questions"]:
                lines = []
                if isinstance(parsed, list):
                    lines = [str(x) for x in parsed]
                else:
                    # fallback: split raw text
                    raw = str(result).replace("```", "")
                    lines = [ln.strip("- ") for ln in raw.split("\n") if ln.strip()]

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
                    # Clean line numbering like 'Q6.'
                    if line.lower().startswith("q") and "." in line[:5]:
                        try:
                            p = line.split(".", 1)
                            if p[0][1:].isdigit():
                                line = p[1].strip()
                        except Exception:
                            pass
                    if (line.endswith('?') or len(line) > 40) and len(opts) >= 3:
                        # take first 4 options
                        taken = []
                        for x in lookahead:
                            if is_option_like(x):
                                taken.append(x)
                            if len(taken) == 4:
                                break
                        temp_mcq.append({
                            "question": line if not line.lower().startswith("placeholder mcq") else "Which of the following best aligns with the target role?",
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
                q = str(m.get("question",""))
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
                out["mcq_questions"].append({
                    "question": "Which of the following best aligns with the target role?",
                    "options": ["A. Option", "B. Option", "C. Option", "D. Option"],
                    "answer": "A"
                })

            # Randomize options for each MCQ and remap the correct answer accordingly
            def _strip_label(opt: str) -> str:
                s = (opt or "").strip()
                if len(s) >= 3 and s[1] == '.' and s[0].upper() in ['A','B','C','D']:
                    return s[3:].strip()
                return s

            randomized_mcq = []
            import random as _rnd
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
                    if t == correct_text and new_correct_idx == 0 and correct_text != "":
                        new_correct_idx = i
                # If we didn't match above (e.g., duplicates), fallback to position of first occurrence
                if correct_text != "" and correct_text in shuffled:
                    new_correct_idx = shuffled.index(correct_text)
                new_ans = chr(65 + new_correct_idx)
                randomized_mcq.append({
                    "question": str(m.get("question","")),
                    "options": labeled[:4],
                    "answer": new_ans
                })
            out["mcq_questions"] = randomized_mcq[:5]

            return out

        data = _safe_json(result)
        questions = normalize_output(data)
        state["questions"] = questions
        return state

    sg = StateGraph(InterviewState)
    sg.add_node("topic_extraction", topic_extraction)
    sg.add_node("topic_selection", topic_selection)
    sg.add_node("generate", generate_questions)
    sg.set_entry_point("topic_extraction")
    sg.add_edge("topic_extraction", "topic_selection")
    sg.add_edge("topic_selection", "generate")
    sg.set_finish_point("generate")
    return sg.compile()

def generate_job_description(target_role: str, experience: str, current_role: str) -> str:
    """Generate a job description based on target role and experience level."""
    # Ensure the API key is set
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
    parser.add_argument("--prev_used_hard", default="", help="Comma-separated list or JSON array of previously used hard topics (from round 1)")
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
    # Parse prev_used_hard topics
    prev_used_hard_topics: List[str] = []
    try:
        if args.prev_used_hard:
            s = args.prev_used_hard.strip()
            if s.startswith("["):
                prev_used_hard_topics = json.loads(s)
            else:
                prev_used_hard_topics = [x.strip() for x in s.split(",") if x.strip()]
    except Exception:
        prev_used_hard_topics = []

    state = {
        "resume_text": args.resume_text,
        "job_desc": job_desc,
        "target_role": args.target_role,
        "experience": args.experience,
        "round": args.round,
        "prev_used_hard_topics": prev_used_hard_topics,
    }

    try:
        final = graph.invoke(state)
        questions = final.get("questions", {})
        output = {
            "session_id": args.session_id,
            "questions": questions,
            # Include selections for backend persistence
            "easy_topic_skills": final.get("easy_topic_skills", []),
            "hard_topic_skills": final.get("hard_topic_skills", []),
            "selected_easy_topics": final.get("selected_easy_topics", []),
            "selected_hard_topics": final.get("selected_hard_topics", []),
        }
        print(json.dumps(output))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        raise

if __name__ == "__main__":
    main()