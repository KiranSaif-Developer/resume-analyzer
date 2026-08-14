import os
import json
import pdfplumber
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Instantiate the client to connect to Groq's OpenAI-compatible endpoint.
client = OpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=os.getenv("GROQ_API_KEY")
)

def extract_text_from_pdf(file_stream):
    """
    Extracts text from a PDF file stream using pdfplumber.
    Accepts a file-like object directly (from Flask file uploads).
    """
    text = ""
    try:
        with pdfplumber.open(file_stream) as pdf:
            for page in pdf.pages:
                extracted_page_text = page.extract_text()
                if extracted_page_text:
                    text += extracted_page_text + "\n"
        return text.strip()
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        raise e

def analyze_resume_text(resume_text):
    """
    Sends the extracted resume text to OpenAI GPT model for analysis.
    Forces a JSON response structure containing ats_score, missing_keywords, and suggestions.
    """
    system_prompt = """
    You are an expert technical recruiter and ATS (Applicant Tracking System) optimizer.
    Analyze the provided resume text and generate a structured evaluation.
    
    You MUST return your response as a valid, parsable JSON object. Do not include any markdown formatting (like ```json ... ```) in your output.
    
    The JSON structure MUST follow this format:
    {
        "ats_score": <Integer between 0 and 100>,
        "missing_keywords": [<list of missing industry-standard tools, skills, or terminologies>],
        "suggestions": [<list of clear, actionable recommendations to improve the resume>]
    }
    """
    
    user_prompt = f"""
    Please evaluate the following resume text:
    
    --- RESUME START ---
    {resume_text}
    --- RESUME END ---
    """
    
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile", # Using llama-3.3-70b-versatile on Groq for high-quality analysis
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"} # Force OpenAI to return a JSON object
        )
        
        # Parse the JSON response
        result_content = response.choices[0].message.content
        analysis_data = json.loads(result_content)
        return analysis_data
        
    except Exception as e:
        print(f"Error calling OpenAI API: {e}")
        # Return fallback values if the API fails or JSON is unparsable
        return {
            "ats_score": 0,
            "missing_keywords": [],
            "suggestions": ["Failed to connect to the AI service. Please check your API key and try again."]
        }

if __name__ == "__main__":
    # Small test block to verify extraction and mock call if run directly
    print("Testing PDF Plumber parser function...")
    # This block won't run normal OpenAI API call unless you have a key,
    # but serves as a quick sanity check script.
