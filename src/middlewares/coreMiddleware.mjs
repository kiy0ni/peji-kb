/**
 * ==============================================================================
 * MIDDLEWARE: CORE APPLICATION SETUP
 * ==============================================================================
 * @fileoverview Configures the global middleware stack for the Express application.
 * This includes session management, body parsing, static file serving,
 * view engine configuration, and CSRF protection logic.
 *
 * @author Sacha Pastor
 * @environment Node.js / Express
 * @dependencies express-session, csurf, cookie-parser
 * ==============================================================================
 */

// --- 1. CORE IMPORTS ---
import express from 'express';
import session from 'express-session';
import csrf from 'csurf';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- 2. ENVIRONMENT SETUP ---

// Resolve paths relative to the project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

/**
 * Initializes and applies all core middlewares to the Express app.
 * * @param {import('express').Application} app - The Express application instance.
 */
export function setupCoreMiddlewares(app) {
  // ===========================================================================
  // SECTION 1: SESSION MANAGEMENT
  // ===========================================================================
  // Configures the HTTP session storage.
  // SECURITY NOTE: In production, ensure 'secure: true' is active (requires HTTPS).
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'dev_secret_key', // Fallback for dev only
      resave: false, // Do not save session if unmodified
      saveUninitialized: false, // Do not create session until something is stored
      cookie: {
        httpOnly: true, // Prevent XSS access to cookies
        secure: process.env.NODE_ENV === 'production', // Send only over HTTPS in prod
        sameSite: 'lax', // CSRF mitigation
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
      }
    })
  );

  // ===========================================================================
  // SECTION 2: VIEW ENGINE & STATIC ASSETS
  // ===========================================================================

  // Configure EJS as the template engine
  app.set('view engine', 'ejs');
  app.set('views', path.join(ROOT_DIR, 'src/views'));

  // Serve public static files (CSS, JS, Fonts)
  app.use('/public', express.static(path.join(ROOT_DIR, 'public')));

  // ===========================================================================
  // SECTION 3: REQUEST PARSING & SANITIZATION
  // ===========================================================================

  // A. Parse JSON payloads
  app.use(express.json());

  // B. Security: Malformed JSON Handler
  // Detects and blocks invalid JSON to prevent stack trace leakage or crashes.
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      console.error(`[SECURITY] Bad JSON received from ${req.ip}`);
      return res.status(400).json({ error: 'Bad JSON format' });
    }
    next();
  });

  // C. Parse URL-encoded payloads (Form submissions)
  app.use(express.urlencoded({ extended: true }));

  // D. Parse Cookies
  app.use(cookieParser());

  // ===========================================================================
  // SECTION 4: UTILITIES & HELPERS
  // ===========================================================================

  // A. Method Override Support
  // HTML forms only support GET and POST. This middleware allows simulating
  // DELETE/PUT methods via a hidden field '_method' or a query parameter.
  app.use((req, res, next) => {
    if (
      req.method === 'POST' &&
      (req.query?._method === 'DELETE' || req.body?._method === 'DELETE')
    ) {
      req.method = 'DELETE';
    }
    next();
  });

  // B. Global View Variables (Locals)
  // Injects common data into every EJS view (User object, Paths, App Name).
  app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.currentPath = req.query.path || req.query.p || req.path;
    res.locals.appName = process.env.APP_NAME || 'Knowledge Base';
    next();
  });

  // ===========================================================================
  // SECTION 5: CSRF PROTECTION (Cross-Site Request Forgery)
  // ===========================================================================

  // A. Configuration
  // Defines where to look for the token and cookie security settings.
  const csrfProtection = csrf({
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    },
    value: (req) => {
      // Check body, query, and headers for the token
      try {
        return (
          req.body?._csrf ||
          req.query?._csrf ||
          req.get?.('X-CSRF-Token') ||
          req.get?.('x-csrf-token') ||
          undefined
        );
      } catch (e) {
        return undefined;
      }
    }
  });

  // B. Application Logic (Conditional Exclusion)
  // API endpoints and Webhooks are stateless (use API Keys/Signatures),
  // so they do not require session-based CSRF protection.
  app.use((req, res, next) => {
    const pathToCheck = req.originalUrl || req.path;
    const isApi = pathToCheck.startsWith('/api') || pathToCheck.startsWith('/webhook');

    if (isApi) {
      return next(); // Skip CSRF for APIs
    }

    return csrfProtection(req, res, next); // Enforce CSRF for UI
  });

  // C. Token Injection
  // Makes the CSRF token available to EJS views as 'csrfToken'.
  app.use((req, res, next) => {
    const pathToCheck = req.originalUrl || req.path;

    // Only generate tokens for UI routes
    if (!(pathToCheck.startsWith('/api') || pathToCheck.startsWith('/webhook'))) {
      try {
        res.locals.csrfToken = typeof req.csrfToken === 'function' ? req.csrfToken() : null;
      } catch {
        res.locals.csrfToken = null;
      }
    } else {
      res.locals.csrfToken = null;
    }
    next();
  });

  // D. Error Handling (Specific to CSRF)
  // Catches 'EBADCSRFTOKEN' errors and renders a user-friendly message
  // instead of crashing or showing a generic 403.
  app.use((err, req, res, next) => {
    if (err && err.code === 'EBADCSRFTOKEN') {
      // Attempt to regenerate a token if possible for the error page
      let token = null;
      try {
        token = typeof req.csrfToken === 'function' ? req.csrfToken() : null;
      } catch {}

      // If request expects HTML (Browser), show the form again with error
      if (req.accepts('html')) {
        const view = req.path.includes('register') ? 'pages/register' : 'pages/login';
        return res.status(403).render(view, {
          error: 'Security check failed (CSRF). Please try again.',
          csrfToken: token
        });
      }

      // If request expects JSON (Client-side JS), return JSON error
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    // Pass other errors to the global error handler
    next(err);
  });

  // Store the protection middleware reference in 'app' for potential manual usage
  app.set('csrfProtection', csrfProtection);
}
