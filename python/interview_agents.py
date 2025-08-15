"""
LangGraph-based Interview System with Two Agents:
1. Question Generation Agent
2. Answer Validation Agent
"""

import json
import os
from typing import Dict, List, Any, TypedDict, Tuple
from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq
from langchain.prompts import ChatPromptTemplate


class InterviewState(TypedDict, total=False):
    # Common fields
    session_id: str
    agent_type: str  # "question_generation" or "answer_validation"
    
    # Question Generation Agent fields
    resume_text: str
    job_desc: str
    current_role: str
    target_role: str
    experience: str
    round_type: str
    questions: Dict[str, Any]
    
    # Answer Validation Agent fields
    user_answers: Dict[str, Any]
    correct_questions: Dict[str, Any]
    validation_report: Dict[str, Any]
    
    # Error handling
    error: str


class QuestionGenerationAgent:
    """Agent responsible for generating interv