/**
 * ==============================================================================
 * MIDDLEWARE: AUTHENTICATION & SECURITY
 * ==============================================================================
 * @fileoverview Centralizes security logic for the application.
 * It handles:
 * 1. Rate Limiting (Brute-force protection).
 * 2. API Key Validation (Programmatic access).
 * 3. Session Verification (Browser access).
 * 4. Role-based Access Control (RBAC).
 *
 * @author Sacha Pastor
 * @environment Node.js
 * @dependencies database, apiKeyService
 * ==============================================================================
 */

// --- 1. IMPORTS ---
import db from '../config/database.mjs';

// NOTE: Ensure this path points to where 'findKeyRecord' is actually defined
import { findKeyRecord } from '../services/authService.mjs';

/**
 * ==============================================================================
 * I. RATE LIMITING ENGINE (IN-MEMORY)
 * ==============================================================================
 * Simple sliding window implementation to prevent abuse.
 * RELAXED CONFIGURATION: Adjusted for easier usage in production without aggressive blocking.
 */

const rateBuckets = new Map();

// Default configuration: 300 requests per minute (High tolerance)
const GLOBAL_LIMIT = { windowMs: 60_000, max: 300 };

/**
 * Identifies the client to apply limits to.
 * Priority: Session ID > API Key > IP Address.
 * @param {Object} req - Express request object.
 * @returns {string} Unique identifier key.
 */
function bucketKeyFromReq(req) {
  if (req.session?.userId) return `sess:${req.session.userId}`;

  const apiKey = req.header('X-API-Key');
  if (apiKey) return `key:${apiKey}`;

  return `ip:${req.ip}`;
}

/**
 * Core logic to check if a client has exceeded their quota.
 * * @param {string} key - Unique client identifier.
 * @param {Object} options - Limit configuration (windowMs, max).
 * @returns {Object} Status object { limited, remaining, resetMs, current }.
 */
function checkRateLimit(key, options = {}) {
  const now = Date.now();
  const windowMs = options.windowMs || GLOBAL_LIMIT.windowMs;
  // Use specific limit if provided, otherwise fallback to global
  const max = options.max || GLOBAL_LIMIT.max;

  // Retrieve or initialize bucket
  const bucket = rateBuckets.get(key) || { start: now, count: 0 };

  // Reset bucket if the time window has elapsed
  if (now - bucket.start > windowMs) {
    bucket.start = now;
    bucket.count = 0;
  }

  // Increment counter
  bucket.count += 1;
  rateBuckets.set(key, bucket);

  // Calculate status
  const remaining = Math.max(max - bucket.count, 0);
  const resetTime = Math.ceil((bucket.start + windowMs - now) / 1000);

  return {
    limited: bucket.count > max,
    remaining,
    resetMs: resetTime,
    current: bucket.count // Exposed for debug/logging
  };
}

/**
 * Express Middleware Factory for Rate Limiting.
 * Applies limits based on the route and client identity.
 * * @param {Object} options - { windowMs: number, max: number }
 */
export function rateLimit(options = {}) {
  return (req, res, next) => {
    const baseKey = bucketKeyFromReq(req);
    // Namespace the key by path to verify limits per route (e.g., separate counters for login vs register)
    const specificKey = `${baseKey}:${req.path}`;

    const rl = checkRateLimit(specificKey, options);
    const limitUsed = options.max || GLOBAL_LIMIT.max;

    // Standard Rate Limit Headers
    res.setHeader('X-RateLimit-Limit', String(limitUsed));
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
    res.setHeader('X-RateLimit-Reset', String(rl.resetMs));

    if (rl.limited) {
      // AUDIT LOG: Crucial for security monitoring
      console.warn(`[RATE LIMIT] ⛔ BLOCKED: ${specificKey} (Count: ${rl.current}/${limitUsed})`);

      // JSON Response for APIs / AJAX
      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(429).json({ error: `Too many requests. Try again in ${rl.resetMs}s.` });
      }

      // HTML Response for Browsers
      return res.status(429).render('pages/error', {
        title: 'Too Many Requests',
        message: `Please try again in ${rl.resetMs} seconds.`,
        breadcrumbs: [],
        showTree: false
      });
    }

    next();
  };
}

/**
 * ==============================================================================
 * II. PRE-CONFIGURED LIMITERS
 * ==============================================================================
 */

// Login: Very relaxed limit (100 attempts/min) to avoid accidental lockouts
export const loginLimiter = rateLimit({ windowMs: 60_000, max: 100 });

// Register: Relaxed limit (100 creations/min)
export const registerLimiter = rateLimit({ windowMs: 60_000, max: 100 });

// Chat/AI: High throughput (200 requests/30s) for fluid conversation
export const chatLimiter = rateLimit({ windowMs: 30_000, max: 200 });

/**
 * ==============================================================================
 * III. AUTHENTICATION MIDDLEWARES
 * ==============================================================================
 */

/**
 * Middleware: API Key Authorization.
 * Validates 'X-API-Key' header, checks permissions (scopes), and enforcing specific API limits.
 * Supports a "Session Fallback" where logged-in browsers bypass the key check.
 * * @param {Array<string>} scopesNeeded - List of required scopes (e.g., ['read:all', 'admin:all']).
 */
export function requireApiKey(scopesNeeded = []) {
  return (req, res, next) => {
    // 1. Session Fallback (Hybrid Auth)
    // If user is logged in via browser, they implicitly have permissions (depending on logic).
    if (req.session && req.session.userId) {
      req.apiUser = { id: req.session.userId };
      return next();
    }

    // 2. Extract Key
    const apiKey = req.header('X-API-Key');
    const rec = findKeyRecord(apiKey);

    // 3. Validate Key Existence
    if (!rec) {
      return res.status(401).json({ error: 'Unauthorized', code: 'invalid_api_key' });
    }

    // 4. Hydrate User Context
    req.apiUser = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(rec.user_id);
    req.apiKey = rec;

    // 5. Secondary Rate Limit (Key-based)
    // Relaxed limit of 1000 req/min per API Key
    const rl = checkRateLimit(`key:${apiKey}`, { max: 1000, windowMs: 60000 });
    if (rl.limited) {
      return res.status(429).json({ error: 'Rate limit exceeded for this API Key' });
    }

    // 6. Scope & Role Validation
    const scopes = (rec.scopes || '').split(/\s+/);

    // Special Case: Admin-only routes
    if (scopesNeeded.includes('admin:all')) {
      if (req.apiUser.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Admin role required' });
      }
    }

    // General Case: Check if key possesses all required scopes
    const ok = scopesNeeded.every((s) => scopes.includes(s));
    if (!ok) {
      return res.status(403).json({ error: 'Forbidden', code: 'insufficient_scope' });
    }

    // 7. Update Usage Statistics (Fire-and-forget)
    try {
      db.prepare('UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = ?').run(rec.id);
    } catch (e) {
      // Ignore DB write errors to avoid blocking the request
    }

    next();
  };
}

/**
 * Middleware: Require Browser Session.
 * Redirects unauthenticated users to the login page.
 */
export const requireAuth = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
};

/**
 * Middleware: Require Administrator Role.
 * Protects sensitive UI routes. Renders a 403 error page if unauthorized.
 */
export const requireAdmin = (req, res, next) => {
  // 1. Ensure Logged In
  if (!req.session.userId) return res.redirect('/login');

  // 2. Verify Role
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);

  if (user && user.role === 'admin') {
    next();
  } else {
    // Render user-friendly access denied page
    res.status(403).render('pages/error', {
      title: 'Access Denied',
      message: 'This area is restricted to administrators.',
      showTree: false,
      breadcrumbs: []
    });
  }
};
