import os
from flask import Flask, request, jsonify, render_template, session
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

import db
import analyzer

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Required for Flask encrypted session cookies
app.secret_key = os.getenv("SECRET_KEY", "resume_ai_super_secret_cookie_key_998877")

# Limit uploads to 5MB (standard resume PDF sizes are usually under 1-2MB)
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024
ALLOWED_EXTENSIONS = {'pdf'}

def allowed_file(filename):
    """Checks if the uploaded file has a valid PDF extension."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- WEB PAGE ROUTES ---

@app.route('/')
def index():
    """Renders the main layout template (Landings, Auth, and Dashboards are managed in SPA)."""
    return render_template('index.html')

# --- AUTHENTICATION API ROUTES ---

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    """Registers a new user inside the application database."""
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({"error": "Email and Password are required fields."}), 400

    try:
        # Check if user already exists
        existing_user = db.get_user_by_email(email)
        if existing_user:
            return jsonify({"error": "An account with this email already exists."}), 400

        # Secure password hashing
        password_hash = generate_password_hash(password)
        user_id = db.create_user(email, password_hash)

        # Set user session
        session['user_id'] = user_id
        session['email'] = email

        return jsonify({
            "success": True,
            "message": "User registered successfully",
            "user": {"id": user_id, "email": email}
        }), 201

    except Exception as e:
        print(f"Error during registration: {e}")
        return jsonify({"error": "Failed to create user account."}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Authenticates an existing user profile."""
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({"error": "Email and Password are required."}), 400

    try:
        user = db.get_user_by_email(email)
        if not user or not check_password_hash(user['password_hash'], password):
            return jsonify({"error": "Invalid email or password combination."}), 401

        # Establish session
        session['user_id'] = user['id']
        session['email'] = user['email']

        return jsonify({
            "success": True,
            "message": "Login successful",
            "user": {"id": user['id'], "email": user['email']}
        }), 200

    except Exception as e:
        print(f"Error during login: {e}")
        return jsonify({"error": "An error occurred during authentication."}), 500

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Terminates the user's active session."""
    session.clear()
    return jsonify({"success": True, "message": "Logged out successfully"}), 200

@app.route('/api/auth/me', methods=['GET'])
def get_current_user():
    """Returns profile details of the currently logged-in session."""
    if 'user_id' not in session:
        return jsonify({"logged_in": False}), 200
    return jsonify({
        "logged_in": True,
        "user": {
            "id": session['user_id'],
            "email": session['email']
        }
    }), 200

# --- CORE APPLICATION API ROUTES (SECURED) ---

@app.route('/api/upload', methods=['POST'])
def upload_resume():
    """
    Handles PDF resume uploads.
    Secured: Checks active session before processing.
    """
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized. Please login to upload resumes."}), 401
        
    user_id = session['user_id']
    
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400
        
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({"error": "No file selected for upload"}), 400
        
    if not allowed_file(file.filename):
        return jsonify({"error": "Invalid file format. Only PDF files are allowed."}), 400

    try:
        filename = secure_filename(file.filename)
        
        # 1. Parse PDF contents
        print(f"Extracting text from: {filename}")
        raw_text = analyzer.extract_text_from_pdf(file)
        
        if not raw_text:
            return jsonify({"error": "Failed to extract text from the PDF. It might be scanned or empty."}), 400

        # 2. Save raw resume to PostgreSQL linked to user_id
        print(f"Saving resume raw text linked to User ID: {user_id}...")
        resume_id = db.save_resume(user_id, filename, raw_text)

        # 3. Generate AI analysis using Groq
        print("Analyzing resume with Groq AI model...")
        analysis_data = analyzer.analyze_resume_text(raw_text)

        # 4. Save AI evaluation to PostgreSQL
        print("Saving analysis results to database...")
        analysis_id = db.save_analysis(
            resume_id=resume_id,
            ats_score=analysis_data.get('ats_score', 0),
            missing_keywords=analysis_data.get('missing_keywords', []),
            suggestions=analysis_data.get('suggestions', [])
        )

        return jsonify({
            "success": True,
            "analysis_id": analysis_id,
            "resume_id": resume_id,
            "filename": filename,
            "ats_score": analysis_data.get('ats_score', 0),
            "missing_keywords": analysis_data.get('missing_keywords', []),
            "suggestions": analysis_data.get('suggestions', [])
        }), 200

    except Exception as e:
        print(f"Server error during resume processing: {e}")
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

@app.route('/api/history', methods=['GET'])
def get_history():
    """Retrieves list of recent resume uploads with scores for the logged-in user."""
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized. Please login to view history."}), 401
    
    try:
        user_id = session['user_id']
        history = db.get_recent_analyses(user_id, limit=15)
        return jsonify(history), 200
    except Exception as e:
        print(f"Error fetching history: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/results/<int:analysis_id>', methods=['GET'])
def get_results(analysis_id):
    """Retrieves full analysis details verifying active user ownership."""
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized. Please login."}), 401
        
    try:
        user_id = session['user_id']
        detailed_data = db.get_detailed_result(analysis_id, user_id)
        if not detailed_data:
            return jsonify({"error": "Analysis report not found or unauthorized access."}), 404
        return jsonify(detailed_data), 200
    except Exception as e:
        print(f"Error fetching details: {e}")
        return jsonify({"error": str(e)}), 500

# Error Handler for file size exceeding MAX_CONTENT_LENGTH
@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({"error": "File size exceeds the 5MB limit."}), 413

if __name__ == '__main__':
    # Start the server on port 5000 in debug mode
    app.run(host='127.0.0.1', port=5000, debug=True)
