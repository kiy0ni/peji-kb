/**
 * ==============================================================================
 * MIDDLEWARE: SECURITY HEADERS (CSP & HARDENING)
 * ==============================================================================
 * @fileoverview Configures HTTP response headers to harden application security.
 * It primarily handles Content Security Policy (CSP) via nonces, HSTS, and
 * anti-sniffing measures.
 *
 * @author Sacha Pastor
 * @environment Node.js / Express
 * @dependencies node:crypto
 * ==============================================================================
 */

// --- 1. IMPORTS ---
import crypto from 'node:crypto';

/**
 * Applies security headers to the response.
 * Generates a unique nonce for every request to allow specific inline scripts.
 * * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 */
export const contentSecurityPolicy = (req, res, next) => {
  // ===========================================================================
  // STEP 1: NONCE GENERATION
  // ===========================================================================
  // We generate a cryptographic nonce (number used once) for this specific request.
  // CRITICAL: This must be done even if we don't send the CSP header (e.g., for PDFs),
  // because the EJS view engine expects 'res.locals.scriptNonce' to exist for rendering.
  const scriptNonce = crypto.randomBytes(16).toString('base64');
  res.locals.scriptNonce = scriptNonce;

  // ===========================================================================
  // STEP 2: CONDITIONAL EXCLUSION (PDF / RAW FILES)
  // ===========================================================================
  // Browsers often have issues rendering PDFs inside strict CSP sandboxes.
  // We skip applying security headers for raw files to avoid breaking native viewers.
  if (req.path.endsWith('.pdf') || req.path.startsWith('/raw/')) {
    return next();
  }

  // ===========================================================================
  // STEP 3: CONSTRUCT CONTENT SECURITY POLICY (CSP)
  // ===========================================================================
  // Defines which resources the browser is allowed to load.
  const cspDirectives = [
    "default-src 'self'", // Default: Only allow resources from same origin
    `script-src 'self' 'nonce-${scriptNonce}'`, // Scripts: Allow same origin + our specific nonce
    "style-src 'self' 'unsafe-inline'", // Styles: Allow same origin + inline styles (needed for some UI libs)
    "font-src 'self' data:", // Fonts: Allow same origin + data URIs
    "img-src 'self' data: blob:", // Images: Allow same origin + data URIs + blobs
    "connect-src 'self'", // AJAX/Fetch: Only allow calls to same origin
    "frame-src 'self' blob:", // IFrames: Allow same origin + blobs (for PDF viewer iframe)
    "object-src 'none'", // Plugins: Block Flash/Java applets completely
    "base-uri 'self'", // Base Tag: Restrict <base> to same origin
    "form-action 'self'" // Forms: Only allow form submissions to same origin
  ];

  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

  // ===========================================================================
  // STEP 4: ADDITIONAL SECURITY HEADERS
  // ===========================================================================

  // HTTP Strict Transport Security (HSTS)
  // Tells the browser to ONLY use HTTPS for the next 180 days (max-age=15552000).
  // Only applied in production environment.
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  // X-Frame-Options: SAMEORIGIN
  // Prevents clickjacking attacks by ensuring the site can only be framed by itself.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // X-Content-Type-Options: nosniff
  // Prevents the browser from "sniffing" the content type and executing non-executable files.
  res.setHeader('X-Content-Type-Options', 'nosniff');

  next();
};
