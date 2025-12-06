/**
 * ==============================================================================
 * ROUTE: API V1 ENDPOINTS
 * ==============================================================================
 * @fileoverview Defines the RESTful API endpoints for data access and operations.
 *
 * Authentication Strategy: HYBRID
 * These routes support dual access patterns:
 * 1. Browser: Uses standard Session cookies (req.session).
 * 2. Headless/Scripts: Uses API Keys (x-api-key header).
 *
 * @dependencies express, apiController, chatController, authMiddleware
 * ==============================================================================
 */

// --- 1. IMPORTS ---
import express from 'express';

// Controllers
import * as apiController from '../controllers/apiController.mjs';
import * as chatController from '../controllers/chatController.mjs';

// Middlewares
import { requireApiKey, chatLimiter } from '../middlewares/authMiddleware.mjs';

// --- 2. ROUTER INITIALIZATION ---
const router = express.Router();

/**
 * ==============================================================================
 * I. SECURITY MIDDLEWARE (Hybrid Authentication)
 * ==============================================================================
 */

/**
 * Defensive Hybrid Middleware.
 * dynamically determines the authentication method based on the request context.
 *
 * @param {Array<string>} scopes - Required permissions (e.g., ['read:all', 'write:self']).
 * @returns {Function} Express middleware function.
 */
const requireSessionOrKey = (scopes) => {
  return (req, res, next) => {
    // STRATEGY 1: BROWSER SESSION
    // If a valid session exists (user logged in via UI), pass through immediately.
    if (req.session && req.session.user) {
      req.user = req.session.user; // Standardize user object
      return next();
    }

    // STRATEGY 2: API KEY (External Scripts/Tools)
    // Check for headers to avoid crashing 'requireApiKey' if headers are missing.
    const authHeader = req.headers.authorization || req.headers['x-api-key'];

    if (!authHeader) {
      // Case: No Session AND No API Key -> Clean Rejection (Avoids 500 errors)
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Please log in or provide an API Key.'
      });
    }

    // Delegate validation to the dedicated API Key middleware
    // This validates the key against the DB and checks scopes.
    return requireApiKey(scopes)(req, res, next);
  };
};

/**
 * ==============================================================================
 * II. IDENTITY & CONTEXT
 * ==============================================================================
 */
router.get('/me', requireSessionOrKey(['read:all']), apiController.getMe);

/**
 * ==============================================================================
 * III. CONTENT DISCOVERY
 * ==============================================================================
 */
router.get('/courses', requireSessionOrKey(['read:all']), apiController.getCourses);
router.get('/files', requireSessionOrKey(['read:all']), apiController.getFileMetadata);

/**
 * ==============================================================================
 * IV. USER DATA PERSISTENCE
 * ==============================================================================
 * Endpoints for saving and retrieving user-specific data.
 */

// A. Personal Notes
router.get('/notes', requireSessionOrKey(['read:all']), apiController.getNotes);
router.post('/notes', requireSessionOrKey(['write:self']), apiController.saveNote);

// B. Code Snippets
router.get('/snippets', requireSessionOrKey(['read:all']), apiController.getSnippets);
router.post('/snippets', requireSessionOrKey(['write:self']), apiController.saveSnippets);

// C. Combined Data (Bulk Load/Save)
router.get('/data', requireSessionOrKey(['read:all']), apiController.getCombinedData);
router.post('/data', requireSessionOrKey(['write:self']), apiController.saveCombinedData);

// D. Favorites Management
router.get('/favorites', requireSessionOrKey(['read:all']), apiController.getFavorites);
router.post('/favorites', requireSessionOrKey(['write:self']), apiController.toggleFavorite);

/**
 * ==============================================================================
 * V. AI CHAT SYSTEM (RAG)
 * ==============================================================================
 * Protected by Rate Limiting to prevent LLM abuse.
 * Order: RateLimit -> Auth Check -> Controller.
 */
router.get('/chat', chatLimiter, requireSessionOrKey(['read:all']), chatController.getChatHistory);

router.post('/chat', chatLimiter, requireSessionOrKey(['write:self']), chatController.postChat);

router.delete(
  '/chat',
  chatLimiter,
  requireSessionOrKey(['write:self']),
  chatController.deleteChatHistory
);

/**
 * ==============================================================================
 * VI. ANALYTICS & ACTIVITY TRACKING
 * ==============================================================================
 */
router.post('/activity/reading', requireSessionOrKey(['write:self']), apiController.trackReading);
router.post('/activity/site', requireSessionOrKey(['write:self']), apiController.trackSite);

/**
 * ==============================================================================
 * VII. DEVELOPER SELF-SERVICE MANAGEMENT
 * ==============================================================================
 * CRUD operations for managing API Keys and Webhooks.
 */

// A. Webhooks
router.get('/webhooks', requireSessionOrKey(['read:all']), apiController.getWebhooks);
router.post('/webhooks', requireSessionOrKey(['write:self']), apiController.createWebhook);
router.delete('/webhooks/:id', requireSessionOrKey(['write:self']), apiController.deleteWebhook);

// B. API Keys
router.get('/keys', requireSessionOrKey(['read:all']), apiController.getKeys);
router.post('/keys', requireSessionOrKey(['write:self']), apiController.createKey);
router.post('/keys/:id/revoke', requireSessionOrKey(['write:self']), apiController.revokeKey);

/**
 * ==============================================================================
 * VIII. AI CONFIGURATION (BYOK)
 * ==============================================================================
 * Endpoints for managing user-specific AI provider settings.
 */
router.get('/config/ai', requireSessionOrKey(['read:all']), apiController.getAIConfig);
router.post('/config/ai', requireSessionOrKey(['write:self']), apiController.saveAIConfig);

export default router;
