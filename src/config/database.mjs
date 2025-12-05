/**
 * ==============================================================================
 * CONFIGURATION: DATABASE (SQLite)
 * ==============================================================================
 * @fileoverview Manages the SQLite database connection, schema definition, 
 * and initialization logic.
 * * @architecture
 * - Uses 'better-sqlite3' for synchronous, high-performance operations.
 * - Enables Write-Ahead Logging (WAL) for concurrency support.
 * - Handles basic schema migration (legacy detection).
 *
 * @author Sacha Pastor
 * @environment Node.js (ES Modules)
 * ==============================================================================
 */

// --- 1. CORE IMPORTS ---
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// import crypto from 'node:crypto'; // Unused in this specific file, but kept if needed for future extensions.

// --- 2. PATH CONFIGURATION ---

// Resolve current file paths (ESM workaround for __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define Project Root and Data Directory
// Navigate up 2 levels (src/config -> src -> root) to keep /data at the project root.
const ROOT_DIR = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

// Ensure the data directory exists before attempting connection
if (!fs.existsSync(DATA_DIR)) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (err) {
        console.error('CRITICAL: Failed to create data directory.', err);
        process.exit(1);
    }
}

// --- 3. DATABASE INITIALIZATION ---

// Initialize Database connection
// stored in 'data/knowledge.db'
const db = new Database(path.join(DATA_DIR, 'knowledge.db'));

// Performance Tuning: Enable Write-Ahead Logging (WAL)
// This allows simultaneous readers and writers, preventing locking issues in basic multi-user scenarios.
db.pragma('journal_mode = WAL');


// --- 4. SCHEMA DEFINITION ---

/**
 * SQL Schema Definition.
 * Defines the structure for Users, Content, AI interactions, Analytics, and Developer Tools.
 */
const schema = `
  -- ==========================================
  -- A. IDENTITY & AUTHENTICATION
  -- ==========================================
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT, -- Bcrypt hash
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ==========================================
  -- B. USER CONTENT (Files & Metadata)
  -- ==========================================
  
  -- User notes attached to specific file paths
  CREATE TABLE IF NOT EXISTS notes (
    path TEXT,
    user_id INTEGER,
    content TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (path, user_id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  -- Code snippets extracted or saved by users
  CREATE TABLE IF NOT EXISTS snippets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT,
    user_id INTEGER,
    code TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  -- User favorite documents
  CREATE TABLE IF NOT EXISTS favorites (
    path TEXT,
    user_id INTEGER,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (path, user_id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  -- ==========================================
  -- C. AI & RAG SYSTEM
  -- ==========================================

  -- Document Text Cache (Optimizes RAG performance to avoid re-parsing PDFs)
  CREATE TABLE IF NOT EXISTS document_cache (
      path TEXT PRIMARY KEY,
      content TEXT,
      extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Chat History (Contextual per user and document)
  CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
  );
  -- Index for faster retrieval of chat history
  CREATE INDEX IF NOT EXISTS idx_chat_user_path_created ON chat_messages(user_id, path, created_at);

  -- ==========================================
  -- D. ANALYTICS & ACTIVITY TRACKING
  -- ==========================================

  -- Reading sessions (Time spent on PDF viewer)
  CREATE TABLE IF NOT EXISTS reading_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      path TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      FOREIGN KEY(user_id) REFERENCES users(id)
  );

  -- Overall site sessions (Time spent on platform)
  CREATE TABLE IF NOT EXISTS site_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      last_route TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      FOREIGN KEY(user_id) REFERENCES users(id)
  );

  -- ==========================================
  -- E. DEVELOPER TOOLS
  -- ==========================================

  -- API Keys for programmatic access
  CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      key_sha256 TEXT UNIQUE, -- Hashed key (Original is never stored)
      key_prefix TEXT,        -- First 8 chars for UI identification
      label TEXT,
      scopes TEXT DEFAULT 'read:all write:self',
      active INTEGER DEFAULT 1,
      last_used DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
  );

  -- Webhook subscriptions configuration
  CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events TEXT NOT NULL, -- CSV string of subscribed events
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
  );

  -- Webhook delivery queue and history
  CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      event TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      delivered_at DATETIME,
      attempts INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
  );
`;


// --- 5. EXPORTED FUNCTIONS ---

/**
 * Initializes the database tables and performs basic migration checks.
 * * WARNING: The migration logic is destructive for legacy schemas (Version < 1.0).
 * It detects if the 'favorites' table is missing the 'user_id' column.
 * If true, it drops user-related tables to force a schema rebuild.
 */
export function initDB() {
    // 1. Migration Logic (Legacy Detection)
    try {
        // Check schema of an existing table
        const tableInfo = db.prepare('PRAGMA table_info(favorites)').all();
        
        // Detect if we are on the old single-user schema
        const hasUserId = tableInfo.some(col => col.name === 'user_id');
        
        // If table exists but lacks 'user_id', we must migrate
        if (tableInfo.length > 0 && !hasUserId) {
            console.warn('⚠️  [DB INIT] Schema mismatch detected (Legacy Version). Performing destructive migration...');
            
            // Drop tables that require structural changes
            const dropQuery = `
                DROP TABLE IF EXISTS notes; 
                DROP TABLE IF EXISTS snippets; 
                DROP TABLE IF EXISTS favorites; 
                DROP TABLE IF EXISTS users;
            `;
            db.exec(dropQuery);
            console.warn('⚠️  [DB INIT] Legacy tables dropped. Rebuilding schema...');
        }
    } catch (error) {
        console.error('❌ [DB INIT] Migration check failed:', error);
    }

    // 2. Execute Schema Creation
    // This is safe to run every time due to "IF NOT EXISTS" clauses
    db.exec(schema);

    console.log('✅ [DB INIT] Database initialized & Schema verified.');
}

// Export the database instance for use in controllers/services
export default db;