#!/usr/bin/env python
# coding: utf-8

# In[2]:


import os
import json
import re
import sys
from typing import TypedDict, List, Optional

# --- Safely import LangChain components ---
try:
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import StrOutputParser
    from langgraph.graph import StateGraph, END
except ImportError as e:
    # If crucial LangChain bits are missing, print a clear message and exit
    print(f"❌ Missing LangChain dependency: {e}", file=sys.stderr, flush=True)
    print("👉 Please install dependencies with: pip install langchain langgraph", file=sys.stderr, flush=True)
    sys.exit(1)

# --- Import ChatOpenAI with fallback for different LangChain versions ---
try:
    from langchain.chat_models import ChatOpenAI  # Newer versions
except ImportError:
    try:
        from langchain_community.chat_models import ChatOpenAI  # Older versions
    except ImportError as e:
        print(f"❌ Cannot import ChatOpenAI: {e}", file=sys.stderr, flush=True)
        print("👉 Make sure 'langchain' is installed and up to date.", file=sys.stderr, flush=True)
        sys.exit(1)

# Ensure UTF-8 encoding for stdout to avoid UnicodeEncodeError on Windows
if sys.version_info >= (3, 7):
    sys.stdout.reconfigure(encoding='utf-8')

class ResumeAnalyzer:
    def __init__(self, groq_api_key: str):
        """Initialize the Resume Analyzer with Groq API key"""
        # Directly use the API key passed from JavaScript
        GROQ_BASE_URL = "https://api.groq.com/openai/v1"

        # Warn if API key looks empty / undefined
        if not groq_api_key or groq_api_key == "undefined":
            print("⚠️  GROQ_API_KEY is empty or undefined - ChatOpenAI may fail to authenticate.", flush=True)

        try:
            self.llm = ChatOpenAI(
                openai_api_base=GROQ_BASE_URL,
                openai_api_key=groq_api_key,
                model="llama3-70b-8192"
            )
        except Exception as e:
            print(f"❌ Failed to initialize ChatOpenAI: {e}", file=sys.stderr, flush=True)
            # Re-raise to be caught by outer try/except in main()
            raise
        
        # Build the LangGraph workflow
        self.graph = self._build_graph()
    
    def _build_graph(self):
        """Build the LangGraph workflow"""
        
        # Define state schema
        class AgentState(TypedDict):
            resume_text: str
            job_description: str
            current_role: str
            target_role: str
            experience: str
            projects_json: Optional[List[dict]]
            skills_list: Optional[List[str]]
            work_experience_list: Optional[List[dict]]
            skills_match_report: Optional[str]
            role_relevance_report: Optional[str]
            final_markdown_report: Optional[str]
            work_experience_report: Optional[str]
            projects_report: Optional[str]
        
        # Create prompt templates
        project_extraction_prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert resume parser."),
            ("user", """
            Given the following resume text, extract all the projects in this JSON format:

            Return the result as a JSON array where each object represents one project:
            [
                {{
                    "name": "Project Name",
                    "technologies": "Tech1, Tech2",
                    "description": "Description in bullet points",
                    "github_link": "https://github.com/user/repo"
                }}
            ]

            Resume text:
            {resume_text}
            """)
        ])

        skills_extraction_prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert at analyzing resumes and extracting core technical skills."),
            ("user", """
            Extract a list of **technical and professional skills** from the given resume text. 
            Only include clearly mentioned tools, technologies, and proficiencies in only **skills** section in the resume, donot extract the skills mentioned in the work experience or projects, only and only consider the skills which are mentioned in the Skills section.
            Return the result in this exact JSON format:

            {{
                "skills": ["skill1", "skill2", "skill3"]
            }}

            Resume Text:
            {resume_text}
            """)
        ])

        work_experience_prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert resume parser specialized in extracting structured professional experiences."),
            ("user", """
            Given the following resume text, extract all the **work experience** details in this JSON format:

            Return the result as a JSON array where each object represents one work experience:
            [
                {{
                    "company": "Company Name",
                    "role": "Job Title",
                    "tenure": "Duration/Dates",
                    "description": "Description of the work experience"
                }}
            ]

            Resume Text:
            {resume_text}
            """)
        ])

        skills_match_prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert career analyst."),
            ("user", """
            Given the extracted skills, job description, and target role, generate a **Skills Match Report**.

            ## Report Format (Markdown):
            - **Skill Match Score**: (score out of 100)
            - **Strengths**: (skills user already has that match the JD and role)
            - **Suggestions**: (skills user should acquire or improve to meet the JD)

            ### Data:
            **Extracted Skills**: {skills}  
            **Job Description**: {jd}  
            **Target Role**: {target_role}
            """)
        ])

        role_relevance_prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a career path advisor."),
            ("user", """
            Compare the user's **current role** and **target role**, and generate a **Role Relevance Report**.

            ## Report Format (Markdown):
            - **Role Relevance Score**: (score out of 100)
            - **Strengths**: (how roles align)
            - **Suggestions**: (gaps and recommendations to bridge the roles)

            ### Data:
            **Current Role**: {current_role}  
            **Target Role**: {target_role}
            """)
        ])

        work_experience_rewrite_prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a resume optimization expert."),
            ("user", """
            Given the following work experiences, job description, and target role, rewrite each experience with the following format in markdown:

            ## For each experience:
            - **Original**: original experience description
            - **Improved**: rewritten to align with the target role and JD
            - **Reason**: reasoning behind the changes

            ### Data:
            **Job Description**: {jd}  
            **Target Role**: {target_role}  
            **Work Experiences**:  
            {work_experience}
            """)
        ])

        projects_rewrite_prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a resume optimization expert."),
            ("user", """
            Given the following projects, job description, and target role, rewrite each project with the following format in markdown:

            ## For each project:
            - **Original**: original project description
            - **Improved**: rewritten to align with the target role and JD
            - **Reason**: reasoning behind the changes

            ### Data:
            **Job Description**: {jd}  
            **Target Role**: {target_role}  
            **Projects**:  
            {projects}
            """)
        ])

        # Create chains
        project_extraction_chain = project_extraction_prompt | self.llm | StrOutputParser()
        skill_extraction_chain = skills_extraction_prompt | self.llm | StrOutputParser()
        work_experience_chain = work_experience_prompt | self.llm | StrOutputParser()
        skills_match_chain = skills_match_prompt | self.llm | StrOutputParser()
        role_relevance_chain = role_relevance_prompt | self.llm | StrOutputParser()
        work_experience_rewrite_chain = work_experience_rewrite_prompt | self.llm | StrOutputParser()
        project_rewrite_chain = projects_rewrite_prompt | self.llm | StrOutputParser()

        # Define node functions
        def extract_projects_node(state):
            response = project_extraction_chain.invoke({"resume_text": state["resume_text"]})
            json_match = re.search(r"\[\s*{.*?}\s*\]", response, re.DOTALL)
            projects = json.loads(json_match.group(0)) if json_match else []
            return {"projects_json": projects}

        def extract_skills_node(state):
            response = skill_extraction_chain.invoke({"resume_text": state["resume_text"]})
            match = re.search(r"\{.*\}", response, re.DOTALL)
            skills_json = json.loads(match.group(0)) if match else {"skills": []}
            return {"skills_list": skills_json["skills"]}

        def extract_work_experience_node(state):
            response = work_experience_chain.invoke({"resume_text": state["resume_text"]})
            match = re.search(r"\[\s*{.*?}\s*\]", response, re.DOTALL)
            work_exps = json.loads(match.group(0)) if match else []
            return {"work_experience_list": work_exps}

        def skills_match_node(state):
            response = skills_match_chain.invoke({
                "skills": state["skills_list"],
                "jd": state["job_description"],
                "target_role": state["target_role"]
            })
            return {"skills_match_report": response}

        def role_relevance_node(state):
            response = role_relevance_chain.invoke({
                "current_role": state["current_role"],
                "target_role": state["target_role"]
            })
            return {"role_relevance_report": response}

        def work_experience_agent(state):
            work_exp = state.get("work_experience_list", [])
            jd = state.get("job_description", "")
            target = state.get("target_role", "")
            
            formatted_exp = json.dumps(work_exp, indent=2)
            response = work_experience_rewrite_chain.invoke({
                "jd": jd,
                "target_role": target,
                "work_experience": formatted_exp
            })
            return {"work_experience_report": response}

        def projects_agent(state):
            projects = state.get("projects_json", [])
            jd = state.get("job_description", "")
            target = state.get("target_role", "")
            
            formatted_projects = json.dumps(projects, indent=2)
            response = project_rewrite_chain.invoke({
                "jd": jd,
                "target_role": target,
                "projects": formatted_projects
            })
            return {"projects_report": response}

        def generate_final_report_node(state):
            skills = state.get("skills_match_report", "")
            relevance = state.get("role_relevance_report", "")
            projects = state.get("projects_report", "")
            work_exp = state.get("work_experience_report", "")

            final_report = f"""
# 🧾 Final Career Analysis Report

---

## ✅ Skills Match Report
{skills}

---

## 🎯 Role Relevance Report
{relevance}

---

## 💻 Improved Projects (Aligned to JD & Target Role)
{projects}

---

## 💼 Improved Work Experience (Aligned to JD & Target Role)
{work_exp}

---

### 📝 Summary
- This report evaluates your readiness for the target role.
- Use the suggestions to improve your fit and bridge any gaps.
"""
            return {"final_markdown_report": final_report}

        # Build the graph
        builder = StateGraph(AgentState)

        # Add all nodes
        builder.add_node("extract_projects", extract_projects_node)
        builder.add_node("extract_skills", extract_skills_node)
        builder.add_node("extract_work_experience", extract_work_experience_node)
        builder.add_node("skills_match", skills_match_node)
        builder.add_node("role_relevance", role_relevance_node)
        builder.add_node("projects_agent", projects_agent)
        builder.add_node("work_experience_agent", work_experience_agent)
        builder.add_node("generate_final_report", generate_final_report_node)

        # Set entry point
        builder.set_entry_point("extract_projects")

        # Define edges
        builder.add_edge("extract_projects", "extract_skills")
        builder.add_edge("extract_projects", "extract_work_experience")
        builder.add_edge("extract_projects", "projects_agent")
        builder.add_edge("extract_work_experience", "work_experience_agent")
        builder.add_edge("extract_skills", "skills_match")
        builder.add_edge("skills_match", "role_relevance")
        builder.add_edge("role_relevance", "generate_final_report")
        builder.add_edge("projects_agent", "generate_final_report")
        builder.add_edge("work_experience_agent", "generate_final_report")

        # Set final node
        builder.set_finish_point("generate_final_report")

        return builder.compile()

    def analyze_resume(self, resume_text: str, job_description: str, 
                      current_role: str, target_role: str, experience: str) -> str:
        """
        Analyze resume and return markdown report
        
        Args:
            resume_text: The text content of the resume
            job_description: Job description for the target role
            current_role: User's current role
            target_role: Target role they're applying for
            experience: Total years of experience
            
        Returns:
            str: Markdown formatted analysis report
        """
        if not resume_text or not job_description:
            return "Error: Please provide both resume text and job description."
        
        try:
            # Run the graph
            final_state = self.graph.invoke({
                "resume_text": resume_text,
                "job_description": job_description,
                "current_role": current_role,
                "target_role": target_role,
                "experience": experience
            })
            
            return final_state.get("final_markdown_report", "Error generating report")
            
        except Exception as e:
            return f"Error during analysis: {str(e)}"

# Main function to process command line arguments
def main():
    # Check if all required parameters are provided
    if len(sys.argv) < 7:
        print("Error: Missing required parameters. Please provide resume text, job description, current role, target role, experience, and groq_api_key.")
        sys.exit(1)
    
    try:
        print("🪵 [untitled39.py] Script started", flush=True)
        print(f"Arguments received (count={len(sys.argv) - 1}): {sys.argv[1:]}", flush=True)
        # Get parameters from command line arguments
        resume_text = sys.argv[1]
        job_description = sys.argv[2]
        current_role = sys.argv[3]
        target_role = sys.argv[4]
        experience = sys.argv[5]
        groq_api_key = sys.argv[6]
        
        print(f"[DEBUG] Parameters received - resume_text length: {len(resume_text)}, job_description length: {len(job_description)}, current_role: {current_role}, target_role: {target_role}, experience: {experience}", flush=True)
        # Initialize analyzer with Groq API key passed as parameter
        analyzer = ResumeAnalyzer(groq_api_key=groq_api_key)
        
        # Analyze resume with the provided parameters
        result = analyzer.analyze_resume(
            resume_text=resume_text,
            job_description=job_description,
            current_role=current_role,
            target_role=target_role,
            experience=experience
        )
        
        # Print the result to be captured by the Node.js process
        print(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error during analysis: {str(e)}", flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()


# In[ ]:




