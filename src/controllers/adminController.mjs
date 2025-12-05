/**
 * ==============================================================================
 * CONTROLLER: ADMINISTRATION
 * ==============================================================================
 * @fileoverview Manages administrative tasks including the dashboard view,
 * file uploads, and user management (API keys, webhooks, account deletion).
 *
 * @author Sacha Pastor
 * @environment Node.js (ES Modules)
 * @dependencies database, fileExplorer, authService, file-type, multer
 * ==============================================================================
 */

// --- 1. CORE IMPORTS ---
import path from 'node:path';
import fs from 'node:fs'; // Added missing import for file cleanup
import { fileURLToPath } from 'node:url';

// --- 2. LIBRARY IMPORTS ---
import { fileTypeFromFile } from 'file-type';

// --- 3. INTERNAL IMPORTS ---
import db from '../config/database.mjs';
import { scanCourses } from '../utils/fileExplorer.mjs';
import { apiKeysListForUser, insertApiKey } from '../services/authService.mjs';

// --- 4. CONFIGURATION ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

const ALLOWED_WEBHOOK_EVENTS = [
    'favorite.added', 'favorite.removed',
    'note.updated', 'snippets.updated',
    'reading.started', 'reading.stopped',
    'site.started', 'site.stopped'
];

// --- 5. HELPER FUNCTIONS ---

/**
 * Loads the course directory structure for the category selector.
 */
function loadCoursesData() {
    const coursesRoot = path.join(ROOT_DIR, 'courses');
    return scanCourses(coursesRoot, 'courses');
}


/**
 * ==============================================================================
 * I. DASHBOARD RENDERING
 * ==============================================================================
 */

/**
 * Renders the main Admin Panel UI.
 * Aggregates all necessary data: categories, user list, and details for a selected user.
 */
export const getAdminDashboard = (req, res) => {
    // 1. Load Content Data (for Uploads)
    const { categories } = loadCoursesData();
    
    // 2. Parse Feedback Messages (Query Params)
    const error = req.query.error === 'upload_failed' ? "Error during upload." : null;
    const success = req.query.success === 'true' ? "Course added successfully!" : null;

    // 3. User Management Data
    const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id ASC').all();
    
    // Determine which user is selected for detailed view (default to first user or 0)
    const selId = Number(req.query.userId || users[0]?.id || 0);
    
    // Fetch specific user details if ID is valid
    const selectedUser = selId 
        ? db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(selId) 
        : null;

    // Fetch related resources for the selected user
    const userKeys = selectedUser ? apiKeysListForUser(selectedUser.id) : [];
    const userWebhooks = selectedUser ? db.prepare('SELECT id, url, events, active, created_at FROM webhooks WHERE user_id = ?').all(selectedUser.id) : [];

    // 4. Render View
    res.render('layout', {
        page: 'pages/admin', 
        title: 'Admin Panel', 
        categories,
        breadcrumbs: [{ name: 'Settings', path: '/settings' }, { name: 'Admin', path: '/admin' }],
        showTree: false, 
        isReaderMode: false, 
        error, 
        success,
        users,
        selectedUser,
        userKeys,
        userWebhooks
    });
};


/**
 * ==============================================================================
 * II. CONTENT MANAGEMENT (UPLOADS)
 * ==============================================================================
 */

/**
 * Processes the uploaded PDF file.
 * Performs deep content validation to ensure the file is a valid PDF.
 */
export const handleUpload = (req, res) => {
    try {
        const uploaded = req.file;
        
        // 1. Basic check: Did multer receive a file?
        if (!uploaded) return res.redirect('/admin?error=upload_failed');
        
        const fpath = uploaded.path;

        // 2. Deep Content Validation (Magic Bytes)
        // We use 'file-type' to check the actual binary signature, not just the extension.
        return fileTypeFromFile(fpath).then(ft => {
            const isPdf = ft && ft.mime === 'application/pdf';
            
            if (!isPdf) {
                // Security: Immediately remove invalid files to keep the server clean.
                try { fs.unlinkSync(fpath); } catch (e) { /* Ignore cleanup errors */ }
                return res.redirect('/admin?error=upload_failed');
            }
            
            // Success
            res.redirect('/admin?success=true');
        }).catch(() => {
            // Fallback for validation errors
            res.redirect('/admin?error=upload_failed');
        });

    } catch (err) {
        res.redirect('/admin?error=upload_failed');
    }
};

/**
 * Middleware to handle Multer errors (e.g., file too large, wrong type).
 */
export const handleUploadError = (err, req, res, next) => {
    // Log the error internally if needed, then redirect user
    res.redirect(`/admin?error=upload_failed`);
};


/**
 * ==============================================================================
 * III. USER RESOURCE MANAGEMENT (API KEYS & WEBHOOKS)
 * ==============================================================================
 * Note: These methods handle both API responses (JSON) and Form responses (Redirect),
 * allowing them to be used by the Admin UI or external Admin scripts.
 */

// --- API KEYS ---

/**
 * GET: Retrieve keys for a specific user ID.
 */
export const getUserKeys = (req, res) => {
    const rows = apiKeysListForUser(req.params.id);
    res.json({ items: rows });
};

/**
 * POST: Generate a new API key for a user.
 */
export const createUserKey = (req, res) => {
    const { label, scopes } = req.body || {};
    
    // Create key via auth service
    const { key } = insertApiKey(req.params.id, label, scopes);
    
    // Response Strategy: JSON for AJAX/API, Redirect for standard Form Submit
    if (req.xhr || req.headers.accept?.includes('json')) {
        return res.json({ key });
    }
    
    res.redirect(`/admin?userId=${req.params.id}`);
};

/**
 * POST: Revoke a specific API key.
 */
export const revokeUserKey = (req, res) => {
    try {
        db.prepare('UPDATE api_keys SET active = 0 WHERE id = ? AND user_id = ?')
          .run(req.params.keyId, req.params.id);
    } catch (e) { /* Ignore errors (idempotent) */ }
    
    if (req.xhr || req.headers.accept?.includes('json')) {
        return res.json({ success: true });
    }
    res.redirect(`/admin?userId=${req.params.id}`);
};


// --- WEBHOOKS ---

/**
 * GET: Retrieve webhooks for a specific user ID.
 */
export const getUserWebhooks = (req, res) => {
    const rows = db.prepare('SELECT id, url, events, active, created_at FROM webhooks WHERE user_id = ?')
        .all(req.params.id);
    res.json({ items: rows });
};

/**
 * POST: Create a new webhook subscription for a user.
 */
export const createUserWebhook = (req, res) => {
    const { url, secret, events } = req.body || {};
    const userId = req.params.id;

    // 1. URL Validation
    try {
        const u = new URL(url);
        const isHttps = u.protocol === 'https:';
        const isProd = process.env.NODE_ENV === 'production';
        
        // Enforce HTTPS in production
        if (!isHttps && isProd) return res.redirect(`/admin?userId=${userId}`);
        // Allow only http/https protocols
        if (!['http:', 'https:'].includes(u.protocol)) return res.redirect(`/admin?userId=${userId}`);
    } catch { 
        return res.redirect(`/admin?userId=${userId}`); 
    }
    
    // 2. Event Validation
    const inputEvents = Array.isArray(events) ? events : String(events).split(',');
    // Filter out any invalid event strings
    const validEvents = inputEvents
        .map(e => e.trim())
        .filter(e => ALLOWED_WEBHOOK_EVENTS.includes(e));
    
    if (!validEvents.length) return res.redirect(`/admin?userId=${userId}`);
    
    // 3. Persistence
    try {
        db.prepare(`
            INSERT INTO webhooks (user_id, url, secret, events, active, created_at) 
            VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        `).run(userId, url, secret, validEvents.join(','));
    } catch (e) { /* Ignore constraint errors */ }
    
    if (req.xhr || req.headers.accept?.includes('json')) {
        return res.json({ success: true });
    }
    res.redirect(`/admin?userId=${userId}`);
};

/**
 * DELETE: Remove a webhook.
 */
export const deleteUserWebhook = (req, res) => {
    try {
        db.prepare('DELETE FROM webhooks WHERE id = ? AND user_id = ?')
          .run(req.params.hookId, req.params.id);
    } catch (e) { /* Ignore errors */ }
    
    if (req.xhr || req.headers.accept?.includes('json')) {
        return res.json({ success: true });
    }
    res.redirect(`/admin?userId=${req.params.id}`);
};


/**
 * ==============================================================================
 * IV. ACCOUNT MANAGEMENT
 * ==============================================================================
 */

/**
 * POST: Permanently delete a user and all associated data.
 * Uses a database transaction to ensure atomicity.
 */
export const deleteUser = (req, res) => {
    const userId = Number(req.params.id);
    
    try {
        db.exec('BEGIN'); // Start Transaction

        // 1. Delete Dependencies (Cascading Delete Logic)
        const tables = [
            'api_keys', 
            'webhooks', 
            'webhook_events', 
            'favorites', 
            'notes', 
            'snippets', 
            'reading_sessions', 
            'site_sessions',
            'chat_messages' // Ensure chat history is wiped
        ];

        tables.forEach(table => {
            db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
        });
        
        // 2. Delete User Record
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        
        db.exec('COMMIT'); // Commit Transaction

    } catch (e) {
        console.error(`[AdminController] Delete user failed for ID ${userId}:`, e);
        try { db.exec('ROLLBACK'); } catch {} // Rollback on failure
    }
    
    if (req.xhr || req.headers.accept?.includes('json')) {
        return res.json({ success: true });
    }
    res.redirect('/admin');
};