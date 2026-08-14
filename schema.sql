-- Clean up existing tables if they exist to allow a fresh start
DROP TABLE IF EXISTS analysis_results CASCADE;
DROP TABLE IF EXISTS resumes CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Table to store user registrations
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table to store metadata and raw parsed text of uploaded resumes, linked to users
CREATE TABLE resumes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    raw_text TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table to store AI structured feedback for each resume
CREATE TABLE analysis_results (
    id SERIAL PRIMARY KEY,
    resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    ats_score INTEGER NOT NULL CHECK (ats_score >= 0 AND ats_score <= 100),
    missing_keywords JSONB DEFAULT NULL,
    suggestions JSONB DEFAULT NULL,
    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
