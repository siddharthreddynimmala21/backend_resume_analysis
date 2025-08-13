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
        Generate interview questions for Technical Round 1.
        
        Resume:
        {resume_text}

Job Description:
{job_desc}
        
        Focus on fundamental technical skills and basic concepts.
        
        Requirements:
        - Generate 5 MCQ questions with 4 options each
        - Generate 3 descriptive questions
        - For MCQ questions, indicate the correct answer
        
        Important Note:
        - Output JSON format ONLY - no other text as "Here are the questions","Questions are here" etc.
        - Return just JSON object in the following manner

        {{
            "mcq_questions": [
                {{
                    "question": "What is the time complexity of quicksort?",
                    "options": ["A. O(n)", "B. O(log n)", "C. O(n log n)", "D. O(n²)"],
                    "answer": "C"
                }},
                {{
                    "question": "What does DNS stand for?",
                    "options": ["A. Data Network System", "B. Domain Name System", "C. Digital Network System", "D. Data Naming Service"],
                    "answer": "B"
                }},
                ...
            ],
            "desc_questions": [
                "Explain how you would optimize a database query for performance.",
                "Describe the difference between HTTP and HTTPS."
            ]
        }}
        """,
        
        "technical_round2": """
        Generate interview questions for Technical Round 2.
        
        Resume:
        {resume_text}

Job Description:
{job_desc}
        
        Focus on advanced technical skills, system design, and problem-solving abilities.
        This is a more advanced round than Technical Round 1.
        
        Requirements:
        - Generate 5 MCQ questions with 4 options each (more advanced than round 1)
        - Generate 3 descriptive questions (focus on system design and architecture)
        - For MCQ questions, indicate the correct answer
        
        Important Note:
        - Output JSON format ONLY - no other text as "Here are the questions","Questions are here" etc.
        - Return just JSON object in the following manner

        {{
            "mcq_questions": [
                {{
                    "question": "In a distributed system, what is the CAP theorem?",
                    "options": ["A. Consistency, Availability, Partition tolerance", "B. Cache, API, Performance", "C. Concurrency, Atomicity, Persistence", "D. Client, Application, Protocol"],
                    "answer": "A"
                }},
                {{
                    "question": "What is the main advantage of microservices architecture?",
                    "options": ["A. Easier debugging", "B. Single deployment", "C. Independent scaling", "D. Shared database"],
                    "answer": "C"
                }},
                ...
            ],
            "desc_questions": [
                "Design a scalable system for handling millions of concurrent users.",
                "Explain how you would implement a distributed cache system.",
                "Describe your approach to handling database sharding in a high-traffic application."
            ]
        }}
        """,
        
        "managerial_round": """
        Generate interview questions for Managerial Round.
        
        Resume:
        {resume_text}

Job Description:
{job_desc}
        
        Focus on leadership, management skills, team handling, project management, and decision-making abilities.
        This round evaluates managerial and leadership potential.
        
        Requirements:
        - Generate 5 MCQ questions with 4 options each (focus on management scenarios)
        - Generate 3 descriptive questions (focus on leadership and management situations)
        - For MCQ questions, indicate the correct answer
        
        Important Note:
        - Output JSON format ONLY - no other text as "Here are the questions","Questions are here" etc.
        - Return just JSON object in the following manner

        {{
            "mcq_questions": [
                {{
                    "question": "What is the most effective approach when dealing with a underperforming team member?",
                    "options": ["A. Immediately terminate them", "B. Provide coaching and set clear expectations", "C. Ignore the issue", "D. Assign them easier tasks"],
                    "answer": "B"
                }},
                {{
                    "question": "In Agile methodology, what is the primary role of a Scrum Master?",
                    "options": ["A. Write code", "B. Manage the team's budget", "C. Facilitate the process and remove impediments", "D. Make all technical decisions"],
                    "answer": "C"
                }},
                ...
            ],
            "desc_questions": [
                "Describe how you would handle a situation where two team members have a conflict that's affecting project delivery.",
                "Explain your approach to motivating a team during a challenging project with tight deadlines.",
                "How would you prioritize features when stakeholders have conflicting requirements?"
            ]
        }}
        """,
        
        "hr_round": """
        Generate interview questions for HR Round.
        
        Resume:
        {resume_text}

Job Description:
{job_desc}
        
        Focus on cultural fit, communication skills, career goals, work-life balance, and general personality assessment.
        This is the final round to assess overall fit with the organization.
        
        Requirements:
        - Generate 5 MCQ questions with 4 options each (focus on workplace scenarios and values)
        - Generate 3 descriptive questions (focus on career goals, motivation, and cultural fit)
        - For MCQ questions, indicate the correct answer
        
        Important Note:
        - Output JSON format ONLY - no other text as "Here are the questions","Questions are here" etc.
        - Return just JSON object in the following manner

        {{
            "mcq_questions": [
                {{
                    "question": "How do you typically handle work-life balance?",
                    "options": ["A. Work always comes first", "B. Maintain clear boundaries between work and personal life", "C. Work only during business hours", "D. Avoid work-related thoughts after hours"],
                    "answer": "B"
                }},
                {{
                    "question": "What motivates you most in your work?",
                    "options": ["A. High salary only", "B. Learning new skills and growing professionally", "C. Working alone without interruption", "D. Having minimal responsibilities"],
                    "answer": "B"
                }},
                ...
            ],
            "desc_questions": [
                "Tell us about your long-term career goals and how this role fits into your plans.",
                "Describe a time when you had to adapt to a significant change in your workplace.",
                "What aspects of our company culture appeal to you the most?"
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

def main():
    parser = argparse.ArgumentParser(description="Generate interview questions using LangGraph")
    parser.add_argument("--session_id", required=True)
    parser.add_argument("--resume_text", required=True)
    parser.add_argument("--job_desc", required=True)
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
    
    graph = build_graph(round_type)
    init_state = {
        "resume_text": args.resume_text,
        "job_desc": args.job_desc,
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