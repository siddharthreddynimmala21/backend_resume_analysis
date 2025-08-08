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


def build_graph() -> StateGraph:
    """Return a compiled LangGraph that produces technical_round1 questions."""
    # Ensure the API key is set; fallback to env variable
    if "GROQ_API_KEY" not in os.environ:
        raise RuntimeError("GROQ_API_KEY environment variable is not set.")

    llm = ChatGroq(temperature=0.7, model_name=os.getenv("GROQ_MODEL", "llama3-70b-8192"), max_tokens=2048)
    prompt = ChatPromptTemplate.from_template(
        """
        Generate interview questions for Technical round 1.
        
        Resume:
        {resume_text}

Job Description:
{job_desc}
        
        Focus on fundamental technical skills.
        
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
        """
    )

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
    parser = argparse.ArgumentParser(description="Generate technical_round1 interview questions using LangGraph")
    parser.add_argument("--session_id", required=True)
    parser.add_argument("--resume_text", required=True)
    parser.add_argument("--job_desc", required=True)
    parser.add_argument("--current_role", required=True)
    parser.add_argument("--target_role", required=True)
    parser.add_argument("--experience", required=True)
    args = parser.parse_args()

    graph = build_graph()
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
            "round": "technical_round1",
            "questions": questions,
        }
        print(json.dumps(payload))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        raise

if __name__ == "__main__":
    main()