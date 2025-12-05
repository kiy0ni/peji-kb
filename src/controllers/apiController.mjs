/**
 * ==============================================================================
 * CONTROLLER: API RESOURCE MANAGEMENT
 * ==============================================================================
 * @fileoverview Handles the RESTful API endpoints for resources like Identity,
 * Content, User Data (Notes, Favorites), Activity Tracking, and Developer Tools.
 *
 * Authentication: Supports hybrid access (Session for UI, API Key for scripts).
 *
 * @author Sacha Pastor
 * @environment Node.js (ES Modules)
 * @dependencies database, fileExplorer, webhookService, authService
 * ==============================================================================
 */

// --- 1. IMPORTS ---
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Internal Modules
import db from '../config/database.mjs';
import { scanCourses } from '../utils/fileExplorer.mjs';
import { dispatchWebhook } from '../services/webhookService.mjs';
import { apiKeysListForUser, insertApiKey } from '../services/authService.mjs';

// --- 2. CONFIGURATION ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

// Allowed Webhook Event Types
const ALLOWED_WEBHOOK_EVENTS = [
  'favorite.added',
  'favorite.removed',
  'note.updated',
  'snippets.updated',
  'reading.started',
  'reading.stopped',
  'site.started',
  'site.stopped'
];

/**
 * ==============================================================================
 * I. HELPER FUNCTIONS
 * ==============================================================================
 */

/**
 * Standardizes API error responses.
 */
function jsonError(res, status, message, code) {
  return res.status(status).json({ error: message, code });
}

/**
 * Resolves the authenticated User ID from either the API Key context or Session.
 */
function getUserId(req) {
  return req.apiUser?.id || req.session?.userId;
}

/**
 * Validates and resolves a file path against the 'courses' directory.
 * Prevents Directory Traversal attacks.
 * @returns {string|null} The absolute path if valid, or null.
 */
function resolveSafePath(relativePath) {
  if (!relativePath || !relativePath.startsWith('courses/')) return null;

  const absolutePath = path.resolve(ROOT_DIR, relativePath);
  const coursesRoot = path.join(ROOT_DIR, 'courses');

  // Security Check: Must start with the approved root path
  if (!absolutePath.startsWith(coursesRoot)) return null;

  return absolutePath;
}

/**
 * Loads the course directory structure.
 */
function loadCoursesData() {
  const coursesRoot = path.join(ROOT_DIR, 'courses');
  return scanCourses(coursesRoot, 'courses');
}

/**
 * ==============================================================================
 * II. IDENTITY RESOURCES
 * ==============================================================================
 */

/**
 * GET /api/v1/me
 * Returns the currently authenticated user details.
 */
export const getMe = (req, res) => {
  // Only available for API Key users currently based on router logic
  res.json({
    user: req.apiUser,
    key: {
      label: req.apiKey.label,
      scopes: req.apiKey.scopes,
      prefix: req.apiKey.key_prefix
    }
  });
};

/**
 * ==============================================================================
 * III. CONTENT & FILES
 * ==============================================================================
 */

/**
 * GET /api/v1/courses
 * Lists all available courses/folders.
 */
export const getCourses = (req, res) => {
  const { categories, flat } = loadCoursesData();
  res.json({ categories, items: flat });
};

/**
 * GET /api/v1/files?path=...
 * Returns metadata (size, date) for a specific file.
 */
export const getFileMetadata = (req, res) => {
  const relativePath = (req.query.path || '').toString();
  const absolutePath = resolveSafePath(relativePath);

  if (!absolutePath) {
    return jsonError(res, 400, 'Invalid path or access denied', 'bad_path');
  }

  if (!fs.existsSync(absolutePath)) {
    return jsonError(res, 404, 'File not found', 'not_found');
  }

  const stat = fs.statSync(absolutePath);
  res.json({
    path: relativePath,
    size: stat.size,
    mtime: stat.mtime.toISOString(),
    isFile: stat.isFile()
  });
};

/**
 * ==============================================================================
 * IV. USER DATA PERSISTENCE (Favorites, Notes, Snippets)
 * ==============================================================================
 */

// --- FAVORITES ---

export const getFavorites = (req, res) => {
  const userId = getUserId(req);
  const rows = db
    .prepare(
      `
        SELECT path, title, created_at 
        FROM favorites 
        WHERE user_id = ? 
        ORDER BY created_at DESC
    `
    )
    .all(userId);

  res.json({ items: rows });
};

export const toggleFavorite = (req, res) => {
  const { path: coursePath, title, toggle } = req.body || {};
  const userId = getUserId(req);

  if (!coursePath) return jsonError(res, 400, 'Missing path', 'bad_request');

  try {
    if (toggle === 'add') {
      db.prepare(
        `
                INSERT INTO favorites (path, user_id, title, created_at) 
                VALUES (?, ?, ?, CURRENT_TIMESTAMP) 
                ON CONFLICT(path, user_id) DO NOTHING
            `
      ).run(coursePath, userId, title || null);

      dispatchWebhook(userId, 'favorite.added', { path: coursePath, title });
    } else {
      db.prepare(
        `
                DELETE FROM favorites 
                WHERE path = ? AND user_id = ?
            `
      ).run(coursePath, userId);

      dispatchWebhook(userId, 'favorite.removed', { path: coursePath });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database operation failed' });
  }
};

// --- NOTES & SNIPPETS ---

export const getNotes = (req, res) => {
  const coursePath = req.query.path;
  const userId = getUserId(req);

  const row = db
    .prepare(
      `
        SELECT content, updated_at 
        FROM notes 
        WHERE path = ? AND user_id = ?
    `
    )
    .get(coursePath, userId);

  res.json({
    note: row?.content || '',
    updated_at: row?.updated_at || null
  });
};

export const saveNote = (req, res) => {
  const { path: coursePath, content } = req.body || {};
  const userId = getUserId(req);

  if (!coursePath) return jsonError(res, 400, 'Missing path', 'bad_request');

  try {
    db.prepare(
      `
            INSERT INTO notes (path, user_id, content, updated_at) 
            VALUES (?, ?, ?, CURRENT_TIMESTAMP) 
            ON CONFLICT(path, user_id) 
            DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP
        `
    ).run(coursePath, userId, content || '');

    dispatchWebhook(userId, 'note.updated', { path: coursePath });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Save failed' });
  }
};

export const getSnippets = (req, res) => {
  const coursePath = req.query.path;
  const userId = getUserId(req);

  const rows = db
    .prepare(
      `
        SELECT code, created_at as timestamp 
        FROM snippets 
        WHERE path = ? AND user_id = ? 
        ORDER BY created_at ASC
    `
    )
    .all(coursePath, userId);

  res.json({ items: rows });
};

export const saveSnippets = (req, res) => {
  const { path: coursePath, snippets } = req.body || {};
  const userId = getUserId(req);

  if (!coursePath || !Array.isArray(snippets)) {
    return jsonError(res, 400, 'Invalid data format', 'bad_request');
  }

  try {
    // Transaction: Clear old snippets and insert new ones
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM snippets WHERE path = ? AND user_id = ?').run(coursePath, userId);
      const insert = db.prepare(
        'INSERT INTO snippets (path, user_id, code, created_at) VALUES (?, ?, ?, ?)'
      );

      snippets.forEach((s) => {
        insert.run(coursePath, userId, s.code, s.timestamp || new Date().toISOString());
      });
    });

    transaction();

    dispatchWebhook(userId, 'snippets.updated', { path: coursePath, count: snippets.length });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Save failed' });
  }
};

// --- BULK OPERATIONS ---

export const getCombinedData = (req, res) => {
  const coursePath = req.query.path;
  const userId = getUserId(req); // Note: This route is session-based primarily

  try {
    const noteRow = db
      .prepare('SELECT content FROM notes WHERE path = ? AND user_id = ?')
      .get(coursePath, userId);
    const snippets = db
      .prepare(
        'SELECT code, created_at as timestamp FROM snippets WHERE path = ? AND user_id = ? ORDER BY created_at ASC'
      )
      .all(coursePath, userId);

    res.json({
      note: noteRow ? noteRow.content : '',
      snippets: snippets || []
    });
  } catch (err) {
    res.status(500).json({ error: 'Database Error' });
  }
};

export const saveCombinedData = (req, res) => {
  const { path: coursePath, data } = req.body;
  const userId = getUserId(req);

  const saveTransaction = db.transaction((cPath, d) => {
    // Save Note
    if (d.note !== undefined) {
      db.prepare(
        `
                INSERT INTO notes (path, user_id, content, updated_at) 
                VALUES (?, ?, ?, CURRENT_TIMESTAMP) 
                ON CONFLICT(path, user_id) 
                DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP
            `
      ).run(cPath, userId, d.note);
    }
    // Save Snippets
    if (d.snippets) {
      db.prepare('DELETE FROM snippets WHERE path = ? AND user_id = ?').run(cPath, userId);
      const insert = db.prepare(
        'INSERT INTO snippets (path, user_id, code, created_at) VALUES (?, ?, ?, ?)'
      );
      d.snippets.forEach((s) =>
        insert.run(cPath, userId, s.code, s.timestamp || new Date().toISOString())
      );
    }
  });

  try {
    saveTransaction(coursePath, data);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Bulk save failed' });
  }
};

/**
 * ==============================================================================
 * V. ACTIVITY TRACKING
 * ==============================================================================
 */

export const trackReading = (req, res) => {
  const { action, path: coursePath } = req.body || {};
  const userId = getUserId(req);

  if (!userId || !coursePath) return jsonError(res, 400, 'Bad Request', 'bad_request');

  try {
    if (action === 'start') {
      // Close any open sessions first
      db.prepare(
        `
                UPDATE reading_sessions SET ended_at = CURRENT_TIMESTAMP 
                WHERE user_id = ? AND path = ? AND ended_at IS NULL
            `
      ).run(userId, coursePath);

      // Start new session
      db.prepare(
        `
                INSERT INTO reading_sessions (user_id, path, started_at) 
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `
      ).run(userId, coursePath);

      dispatchWebhook(userId, 'reading.started', { path: coursePath });
    } else if (action === 'ping' || action === 'stop') {
      // Find active session
      const row = db
        .prepare(
          `
                SELECT id FROM reading_sessions 
                WHERE user_id = ? AND path = ? AND ended_at IS NULL 
                ORDER BY started_at DESC LIMIT 1
            `
        )
        .get(userId, coursePath);

      if (row?.id) {
        // Update 'ended_at' to essentially "keep alive" the session until truly stopped
        db.prepare(`UPDATE reading_sessions SET ended_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
          row.id
        );

        if (action === 'stop') dispatchWebhook(userId, 'reading.stopped', { path: coursePath });
      } else if (action === 'ping') {
        // Auto-heal: If no session found during ping, create one
        db.prepare(
          `
                    INSERT INTO reading_sessions (user_id, path, started_at, ended_at) 
                    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `
        ).run(userId, coursePath);
      }
    } else {
      return jsonError(res, 400, 'Invalid action', 'bad_action');
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
};

export const trackSite = (req, res) => {
  const { action, route } = req.body || {};
  const userId = getUserId(req);

  try {
    if (action === 'start') {
      db.prepare(
        `UPDATE site_sessions SET ended_at = CURRENT_TIMESTAMP WHERE user_id = ? AND ended_at IS NULL`
      ).run(userId);
      db.prepare(
        `INSERT INTO site_sessions (user_id, last_route, started_at) VALUES (?, ?, CURRENT_TIMESTAMP)`
      ).run(userId, route || null);
      dispatchWebhook(userId, 'site.started', { route });
    } else if (action === 'ping' || action === 'stop') {
      const row = db
        .prepare(
          `SELECT id FROM site_sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`
        )
        .get(userId);

      if (row?.id) {
        db.prepare(
          `
                    UPDATE site_sessions 
                    SET ended_at = CURRENT_TIMESTAMP, last_route = COALESCE(?, last_route) 
                    WHERE id = ?
                `
        ).run(route || null, row.id);

        if (action === 'stop') dispatchWebhook(userId, 'site.stopped', { route });
      } else if (action === 'ping') {
        db.prepare(
          `
                    INSERT INTO site_sessions (user_id, last_route, started_at, ended_at) 
                    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `
        ).run(userId, route || null);
      }
    } else {
      return jsonError(res, 400, 'Invalid action', 'bad_action');
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
};

/**
 * ==============================================================================
 * VI. DEVELOPER TOOLS (Self-Service)
 * ==============================================================================
 */

// --- WEBHOOKS ---

export const getWebhooks = (req, res) => {
  const userId = getUserId(req);
  const rows = db
    .prepare('SELECT id, url, events, active, created_at FROM webhooks WHERE user_id = ?')
    .all(userId);
  res.json({ items: rows });
};

export const createWebhook = (req, res) => {
  const { url, secret, events } = req.body || {};
  const userId = getUserId(req);
  const isBrowserRequest = !!req.session; // Used to decide between redirect vs JSON response

  // 1. Basic Validation
  if (!url || !secret || !events) {
    return isBrowserRequest
      ? res.redirect('/settings')
      : jsonError(res, 400, 'Missing required fields', 'bad_request');
  }

  // 2. URL Validation
  try {
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const isProd = process.env.NODE_ENV === 'production';

    // Strict HTTPS requirement in production
    if (!isHttps && isProd) {
      return isBrowserRequest
        ? res.redirect('/settings')
        : jsonError(res, 400, 'HTTPS is required in production', 'insecure_url');
    }
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
  } catch {
    return isBrowserRequest
      ? res.redirect('/settings')
      : jsonError(res, 400, 'Invalid URL format', 'bad_url');
  }

  // 3. Event Validation
  const eventList = Array.isArray(events) ? events : String(events).split(',');
  const normalizedEvents = eventList.map((e) => e.trim()).filter(Boolean);

  // For API requests, fail if any event is invalid
  if (!isBrowserRequest && !normalizedEvents.every((e) => ALLOWED_WEBHOOK_EVENTS.includes(e))) {
    return jsonError(res, 400, 'Contains invalid event types', 'bad_events');
  }

  // For UI requests, filter out invalid ones silently
  const validEvents = normalizedEvents.filter((e) => ALLOWED_WEBHOOK_EVENTS.includes(e));
  if (isBrowserRequest && !validEvents.length) return res.redirect('/settings');

  // 4. Persistence
  db.prepare(
    `
        INSERT INTO webhooks (user_id, url, secret, events, active, created_at) 
        VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `
  ).run(userId, url, secret, validEvents.join(','));

  if (isBrowserRequest) res.redirect('/settings');
  else res.json({ success: true });
};

export const deleteWebhook = (req, res) => {
  const userId = getUserId(req);
  const id = req.params.id;

  db.prepare('DELETE FROM webhooks WHERE id = ? AND user_id = ?').run(id, userId);

  if (req.session) res.redirect('/settings');
  else res.json({ success: true });
};

// --- API KEYS ---

export const getKeys = (req, res) => {
  const userId = getUserId(req);
  const rows = apiKeysListForUser(userId);
  res.json({ items: rows });
};

export const createKey = (req, res) => {
  const { label, scopes } = req.body || {};
  const userId = getUserId(req);

  const { key, prefix } = insertApiKey(userId, label, scopes);

  if (req.session) {
    // Flash key to session for one-time display in UI
    req.session.lastCreatedKey = key;
    res.redirect('/settings');
  } else {
    res.json({
      key,
      label: label || null,
      scopes: scopes || 'read:all write:self',
      prefix
    });
  }
};

export const revokeKey = (req, res) => {
  const userId = getUserId(req);
  const id = req.params.id;

  // Soft delete (active = 0)
  db.prepare('UPDATE api_keys SET active = 0 WHERE id = ? AND user_id = ?').run(id, userId);

  if (req.session) res.redirect('/settings');
  else res.json({ success: true });
};
