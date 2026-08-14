import os
import json
import pg8000.dbapi as pg8000
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

DB_NAME = os.getenv("DB_NAME", "resume_analyzer")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))

def get_db_connection():
    """Establishes and returns a connection to the PostgreSQL database."""
    try:
        conn = pg8000.connect(
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT
        )
        return conn
    except Exception as e:
        print(f"Error connecting to PostgreSQL database: {e}")
        raise e

def _rows_to_dicts(cursor, rows):
    """Helper: converts pg8000 result rows into a list of dictionaries,
    since pg8000 doesn't have a built-in RealDictCursor like psycopg2."""
    if not rows:
        return []
    columns = [desc[0] for desc in cursor.description]
    return [dict(zip(columns, row)) for row in rows]

def init_db(schema_path="schema.sql"):
    """Reads schema.sql and runs it to initialize the database tables."""
    print("Initializing database tables...")
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        with open(schema_path, "r", encoding="utf-8") as f:
            schema_sql = f.read()
        cursor.execute(schema_sql)
        conn.commit()
        print("Database initialized successfully!")
    except Exception as e:
        print(f"Failed to initialize database: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

# --- USER AUTHENTICATION METRICS ---

def create_user(email, password_hash):
    """Registers a new user inside the database."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        query = """
            INSERT INTO users (email, password_hash)
            VALUES (%s, %s)
            RETURNING id;
        """
        cursor.execute(query, (email, password_hash))
        user_id = cursor.fetchone()[0]
        conn.commit()
        return user_id
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def get_user_by_email(email):
    """Fetches a user profile dictionary by email query."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        query = """
            SELECT id, email, password_hash, created_at 
            FROM users 
            WHERE email = %s;
        """
        cursor.execute(query, (email,))
        row = cursor.fetchone()
        if not row:
            return None
        return _rows_to_dicts(cursor, [row])[0]
    except Exception as e:
        raise e
    finally:
        conn.close()

# --- RESUME OPERATIONS ---

def save_resume(user_id, filename, raw_text):
    """Inserts a new resume linked to a user, returning its generated ID."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        query = """
            INSERT INTO resumes (user_id, filename, raw_text) 
            VALUES (%s, %s, %s) 
            RETURNING id;
        """
        cursor.execute(query, (user_id, filename, raw_text))
        resume_id = cursor.fetchone()[0]
        conn.commit()
        return resume_id
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def save_analysis(resume_id, ats_score, missing_keywords, suggestions):
    """Saves the analysis results linked to a specific resume."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        query = """
            INSERT INTO analysis_results (resume_id, ats_score, missing_keywords, suggestions)
            VALUES (%s, %s, %s, %s)
            RETURNING id;
        """
        cursor.execute(
            query, 
            (
                resume_id, 
                ats_score, 
                json.dumps(missing_keywords), 
                json.dumps(suggestions)
            )
        )
        analysis_id = cursor.fetchone()[0]
        conn.commit()
        return analysis_id
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def get_recent_analyses(user_id, limit=10):
    """Fetches list of recent resume uploads with scores and dates for a specific user."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        query = """
            SELECT 
                r.id as resume_id, 
                r.filename, 
                r.uploaded_at,
                a.id as analysis_id,
                a.ats_score,
                a.analyzed_at
            FROM resumes r
            LEFT JOIN analysis_results a ON r.id = a.resume_id
            WHERE r.user_id = %s
            ORDER BY r.uploaded_at DESC
            LIMIT %s;
        """
        cursor.execute(query, (user_id, limit))
        rows = cursor.fetchall()
        return _rows_to_dicts(cursor, rows)
    except Exception as e:
        raise e
    finally:
        conn.close()

def get_detailed_result(analysis_id, user_id):
    """Fetches the complete analysis details for a single resume, verifying user ownership."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        query = """
            SELECT 
                r.filename, 
                r.raw_text, 
                a.id as analysis_id,
                a.ats_score,
                a.missing_keywords,
                a.suggestions,
                a.analyzed_at
            FROM analysis_results a
            JOIN resumes r ON r.id = a.resume_id
            WHERE a.id = %s AND r.user_id = %s;
        """
        cursor.execute(query, (analysis_id, user_id))
        row = cursor.fetchone()
        if row is None:
            return None
        return _rows_to_dicts(cursor, [row])[0]
    except Exception as e:
        raise e
    finally:
        conn.close()

if __name__ == "__main__":
    # Test connection and table schemas on direct file execution
    try:
        conn = get_db_connection()
        print("Successfully connected to the database!")
        conn.close()
    except Exception as e:
        print(f"Database connection check failed: {e}")