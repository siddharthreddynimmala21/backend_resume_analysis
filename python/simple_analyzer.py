import sys
import json

def analyze_resume(resume_text, job_description, current_role, target_role, experience):
    """Simple resume analyzer that returns a basic analysis"""
    
    # In a real implementation, this would use NLP or ML to analyze the resume
    # For now, we'll just return a simple analysis based on the inputs
    
    # Count words in resume
    word_count = len(resume_text.split())
    
    # Simple keyword matching
    keywords = ["python", "javascript", "react", "node", "express", "mongodb", "sql", "database", 
               "frontend", "backend", "fullstack", "developer", "engineer", "software", "web"]
    
    found_keywords = []
    for keyword in keywords:
        if keyword.lower() in resume_text.lower():
            found_keywords.append(keyword)
    
    # Generate a simple analysis
    analysis = {
        "word_count": word_count,
        "keywords_found": found_keywords,
        "keyword_match_percentage": round(len(found_keywords) / len(keywords) * 100, 2),
        "current_role": current_role,
        "target_role": target_role,
        "experience_years": experience,
        "recommendations": [
            "Add more specific technical skills to your resume",
            "Quantify your achievements with metrics",
            "Tailor your resume to match the job description more closely"
        ],
        "skills_match_report": f"Found {len(found_keywords)} relevant keywords in your resume.",
        "role_relevance_report": f"Your current role ({current_role}) and target role ({target_role}) analysis.",
        "final_markdown_report": f"""
# Resume Analysis Report

## Overview
- **Word Count**: {word_count}
- **Keywords Found**: {', '.join(found_keywords)}
- **Keyword Match**: {round(len(found_keywords) / len(keywords) * 100, 2)}%
- **Current Role**: {current_role}
- **Target Role**: {target_role}
- **Experience**: {experience}

## Recommendations
1. Add more specific technical skills to your resume
2. Quantify your achievements with metrics
3. Tailor your resume to match the job description more closely

## Skills Match
Found {len(found_keywords)} relevant keywords in your resume.

## Role Relevance
Your current role ({current_role}) and target role ({target_role}) analysis.
"""
    }
    
    return json.dumps(analysis)

def main():
    # Check if all required parameters are provided
    if len(sys.argv) < 6:
        print("❌ Error: Missing required parameters. Please provide resume text, job description, current role, target role, and experience.")
        sys.exit(1)
    
    try:
        resume_text = sys.argv[1]
        job_description = sys.argv[2]
        current_role = sys.argv[3]
        target_role = sys.argv[4]
        experience = sys.argv[5]
        
        result = analyze_resume(
            resume_text=resume_text,
            job_description=job_description,
            current_role=current_role,
            target_role=target_role,
            experience=experience
        )
        
        print(result)
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()