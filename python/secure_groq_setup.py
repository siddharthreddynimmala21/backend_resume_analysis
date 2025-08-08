# Secure way to use Groq API
import os
import json
import random
import re
from datetime import datetime
from typing import TypedDict, List, Dict, Literal, Optional
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END

# Initialize Groq client
# Load API key from environment variable
# DO NOT hardcode API keys in source code

# Method 1: Load from environment variable that you've set before running the script
# Example of setting it (in terminal/command prompt):
# export GROQ_API_KEY="your_api_key_here"  # Linux/Mac
# set GROQ_API_KEY=your_api_key_here       # Windows

# Method 2: Use a .env file with python-dotenv
# First install: pip install python-dotenv
'''
from dotenv import load_dotenv
load_dotenv()  # This loads the variables from .env file
'''

# Method 3: Use a secure configuration file that is not committed to git
# Create a config.json file and add it to .gitignore
'''
with open("config.json") as f:
    config = json.load(f)
    os.environ["GROQ_API_KEY"] = config["GROQ_API_KEY"]
'''

# Now use the API key from environment
llm = ChatGroq(temperature=0.7, model_name="llama3-70b-8192", max_tokens=2048)