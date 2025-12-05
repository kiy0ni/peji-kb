/**
 * ==============================================================================
 * CONTROLLER: VIEW ORCHESTRATOR
 * ==============================================================================
 * @fileoverview Handles the rendering of server-side HTML pages (EJS views).
 * It acts as the bridge between the file system, the database, and the frontend UI.
 *
 * @author Sacha Pastor
 * @environment Node.js (ES Modules)
 * @dependencies db, fileExplorer, authService
 * ==============================================================================
 */

// --- 1. CORE IMPORTS ---
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- 2. INTERNAL MODULE IMPORTS ---
import db from '../config/database.mjs';
import { scanCourses, buildBreadcrumbs } from '../utils/fileExplorer.mjs';
import { apiKeysListForUser } from '../services/authService.mjs';

// --- 3. CONFIGURATION & CONSTANTS ---

// Path resolution setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

// UI Constants for visual consistency
const CARD_COLORS = ['lavender', 'rose', 'mint', 'sky'];
const SUGGESTED_CARDS_LIMIT = 6;
const STATS_HISTORY_DAYS = 30;

/**
 * ==============================================================================
 * I. HELPER FUNCTIONS (INTERNAL UTILITIES)
 * ==============================================================================
 */

/**
 * Formats a duration in seconds into a human-readable string (e.g., "2h 15m").
 * @param {number} secs - Duration in seconds.
 * @returns {string} Formatted string.
 */
function formatDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `${secs}s`;
}

/**
 * Wrapper to scan the standard 'courses' directory.
 * @returns {Object} The scanned tree structure and flat file list.
 */
function loadCoursesData() {
  const coursesRoot = path.join(ROOT_DIR, 'courses');
  return scanCourses(coursesRoot, 'courses');
}

/**
 * Determines the relevant subtree to display in the sidebar based on the current path.
 *
 * @param {Object} tree - The full file system tree.
 * @param {string} safePath - The current navigation path (e.g., 'courses/math/algebra').
 * @returns {Object} { sidebarTree, contextTitle } - The subset of the tree to render.
 */
function getContextTree(tree, safePath) {
  let sidebarTree = tree;
  let contextTitle = 'Explorer';

  // Split path to find the top-level category
  const parts = safePath.split('/');

  // Logic: If we are deep inside a category (depth >= 2),
  // focus the sidebar on that specific category node.
  if (parts.length >= 2) {
    const rootCatName = parts[1];
    const foundNode = tree.children.find((c) => c.name === rootCatName);

    if (foundNode) {
      sidebarTree = foundNode;
      contextTitle = foundNode.name;
    }
  }
  return { sidebarTree, contextTitle };
}

/**
 * ==============================================================================
 * II. CONTROLLER METHODS
 * ==============================================================================
 */

/**
 * Renders the main Dashboard (Landing Page).
 * Aggregates user statistics, recent activity, and suggested content.
 */
export const getDashboard = (req, res) => {
  // 1. Load Content Data
  const { categories: topCategories, flat } = loadCoursesData();

  // 2. Fetch User Favorites
  const favorites = db
    .prepare(
      `
        SELECT * FROM favorites 
        WHERE user_id = ? 
        ORDER BY created_at DESC
    `
    )
    .all(req.session.userId);

  // 3. Generate Suggested Cards (Top N from flat list)
  // Maps file data to UI card objects with rotating colors.
  const derivedCards = flat.slice(0, SUGGESTED_CARDS_LIMIT).map((c, idx) => ({
    id: idx + 1,
    title: c.name,
    category: c.categories.join(' · ') || 'general',
    tone: CARD_COLORS[idx % CARD_COLORS.length],
    type: 'course',
    path: c.path
  }));

  // 4. Calculate User Statistics (Last 30 Days)
  const userId = req.session.userId;

  // A. Count unique courses accessed
  const coursesReadRow = db
    .prepare(
      `
        SELECT COUNT(DISTINCT path) AS cnt 
        FROM reading_sessions 
        WHERE user_id = ? 
          AND started_at >= datetime('now', '-' || ? || ' days')
    `
    )
    .get(userId, STATS_HISTORY_DAYS);

  const coursesRead = coursesReadRow?.cnt || 0;

  // B. Calculate total active reading time (in seconds)
  // Note: Uses Julian days difference * 86400 to get seconds from timestamps
  const readSecRow = db
    .prepare(
      `
        SELECT COALESCE(ROUND(SUM(
            (julianday(COALESCE(ended_at, CURRENT_TIMESTAMP)) - julianday(started_at)) * 86400
        )), 0) AS secs 
        FROM reading_sessions 
        WHERE user_id = ? 
          AND started_at >= datetime('now', '-' || ? || ' days')
    `
    )
    .get(userId, STATS_HISTORY_DAYS);

  const readingSeconds = readSecRow?.secs || 0;

  // C. Calculate total site session time (in seconds)
  const siteSecRow = db
    .prepare(
      `
        SELECT COALESCE(ROUND(SUM(
            (julianday(COALESCE(ended_at, CURRENT_TIMESTAMP)) - julianday(started_at)) * 86400
        )), 0) AS secs 
        FROM site_sessions 
        WHERE user_id = ? 
          AND started_at >= datetime('now', '-' || ? || ' days')
    `
    )
    .get(userId, STATS_HISTORY_DAYS);

  const siteSeconds = siteSecRow?.secs || 0;

  // D. Compute Productivity Score
  // Ratio of Reading Time vs Total Site Time.
  // Defaults to 100% if reading exists but site time logs are pending/syncing.
  const productivity =
    siteSeconds > 0
      ? Math.min(100, Math.round((readingSeconds / siteSeconds) * 100))
      : readingSeconds > 0
        ? 100
        : 0;

  // 5. Render View
  res.render('layout', {
    page: 'pages/index',
    title: 'Knowledge Base',
    categories: topCategories,
    cards: derivedCards,
    breadcrumbs: [],
    showTree: false,
    favorites,
    stats: {
      coursesRead,
      readingTimeLabel: formatDuration(readingSeconds),
      productivity
    }
  });
};

/**
 * Redirects the root /browse URL to the default 'courses' container.
 */
export const redirectBrowse = (req, res) => res.redirect('/browse/courses');

/**
 * Renders the File Browser / Catalog view.
 * Handles navigation through folders and listing of available courses.
 */
export const getBrowse = (req, res) => {
  // 1. Path Sanitization
  // Use regex routing parameter [0] or default to 'courses'
  const safePath = req.params[0] ? decodeURIComponent(req.params[0]) : 'courses';

  // Security: Prevent directory traversal attacks
  if (safePath.includes('..')) return res.redirect('/browse/courses');

  // 2. Data Retrieval
  const { tree, categories, flat } = loadCoursesData();

  // Filter files to only show those belonging to the current path prefix
  const filteredFiles = flat.filter((c) => c.path.startsWith(safePath));

  // Determine Sidebar Context
  const { sidebarTree, contextTitle } = getContextTree(tree, safePath);

  const favorites = db
    .prepare(
      `
        SELECT * FROM favorites 
        WHERE user_id = ? 
        ORDER BY created_at DESC
    `
    )
    .all(req.session.userId);

  // 3. Prepare Card Models
  const cards = filteredFiles.map((c, idx) => ({
    title: c.name,
    category: c.categories.join(' · ') || 'general',
    tone: CARD_COLORS[idx % CARD_COLORS.length],
    type: 'course',
    path: c.path
  }));

  // 4. Render View
  res.render('layout', {
    page: 'pages/browse',
    title: safePath === 'courses' ? 'All courses' : safePath.split('/').pop(),
    categories,
    cards,
    breadcrumbs: buildBreadcrumbs(safePath),
    showTree: true,
    tree: sidebarTree,
    contextTitle,
    favorites
  });
};

/**
 * Renders the PDF Viewer (Reader Mode).
 * Validates access to specific files and serves the reader interface.
 */
export const getFileViewer = (req, res) => {
  // 1. Path Validation
  const safeRel = req.params[0] ? decodeURIComponent(req.params[0]) : null;

  // Security: Ensure path is valid and strictly within 'courses/'
  if (!safeRel || !safeRel.startsWith('courses/')) {
    return res.redirect('/');
  }

  // 2. Context Retrieval
  const { tree } = loadCoursesData();
  const { sidebarTree, contextTitle } = getContextTree(tree, safeRel);

  // Construct the Raw URL for the static file middleware
  // Removes 'courses' prefix to match the mount point of static assets if needed
  const rawUrl = '/raw' + safeRel.substring('courses'.length);

  // 3. User State (Favorites)
  const userId = req.session.userId;

  // Check if THIS file is favorited
  const favEntry = db
    .prepare('SELECT path FROM favorites WHERE path = ? AND user_id = ?')
    .get(safeRel, userId);

  // Get list of all favorites for the sidebar
  const favorites = db
    .prepare('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId);

  // 4. Render View
  res.render('layout', {
    page: 'pages/file',
    title: path.basename(safeRel, '.pdf'),
    filePath: safeRel,
    rawUrl,
    breadcrumbs: buildBreadcrumbs(safeRel),
    showTree: true,
    tree: sidebarTree,
    contextTitle,
    isReaderMode: true,
    isFav: !!favEntry,
    favorites
  });
};

/**
 * Renders the User Settings page.
 * Manages display of API keys and Webhook configurations.
 */
export const getSettings = (req, res) => {
  // 1. Flash Message Handling (One-time read)
  // Checks if a new API key was just created (stored in session temporarily)
  const lastCreatedKey = req.session.lastCreatedKey || null;
  req.session.lastCreatedKey = null; // Clear immediately after reading

  // 2. Render View
  res.render('layout', {
    page: 'pages/settings',
    title: 'Settings',
    breadcrumbs: [{ name: 'Settings', path: '/settings' }],
    showTree: false,
    isReaderMode: false,
    // Fetch list of active keys via service
    apiKeys: apiKeysListForUser(req.session.userId),
    // Fetch webhooks directly
    webhooks: db
      .prepare('SELECT id, url, events, active, created_at FROM webhooks WHERE user_id = ?')
      .all(req.session.userId),
    lastCreatedKey
  });
};
