/**
 * ==============================================================================
 * ROUTE: ADMIN API ENDPOINTS
 * ==============================================================================
 * @fileoverview Defines the RESTful API routes for administrative tasks.
 * unlike the UI routes, these endpoints are strictly designed for programmatic
 * access via API Keys with high-level privileges.
 *
 * @security CRITICAL: All routes require an API Key with 'admin:all' scope.
 * @dependencies express, adminController, authMiddleware
 * ==============================================================================
 */

// --- 1. IMPORTS ---
import express from 'express';

// Controllers
import * as adminController from '../controllers/adminController.mjs';

// Middlewares
import { requireApiKey } from '../middlewares/authMiddleware.mjs';

// --- 2. ROUTER INITIALIZATION ---
const router = express.Router();


/**
 * ==============================================================================
 * I. GLOBAL SECURITY MIDDLEWARE
 * ==============================================================================
 * Enforce strict authorization for all routes in this file.
 * Only API keys specifically granted the 'admin:all' scope are permitted to
 * access these endpoints.
 */
router.use(requireApiKey(['admin:all']));


/**
 * ==============================================================================
 * II. USER API KEY MANAGEMENT
 * ==============================================================================
 * Allows administrators to audit, create, or revoke API keys on behalf of users.
 */

// GET: Retrieve list of keys for a specific user
// NOTE: Uses 'getUserKeys' (returns JSON) instead of dashboard renderers.
router.get('/users/:id/keys', adminController.getUserKeys);

// POST: Generate a new API key for a specific user
router.post('/users/:id/keys', adminController.createUserKey);

// POST: Revoke a specific key
router.post('/users/:id/keys/:keyId/revoke', adminController.revokeUserKey);


/**
 * ==============================================================================
 * III. USER WEBHOOK MANAGEMENT
 * ==============================================================================
 * Allows administrators to manage event subscriptions for users.
 */

// GET: Retrieve list of webhooks for a specific user
router.get('/users/:id/webhooks', adminController.getUserWebhooks);

// POST: Create a new webhook subscription
router.post('/users/:id/webhooks', adminController.createUserWebhook);

// DELETE: Remove a webhook subscription
router.delete('/users/:id/webhooks/:hookId', adminController.deleteUserWebhook);


/**
 * ==============================================================================
 * IV. USER LIFECYCLE MANAGEMENT
 * ==============================================================================
 */

// POST: Permanently delete a user account and associated data
// CAUTION: This action is destructive and typically irreversible.
router.post('/users/:id/delete', adminController.deleteUser);


export default router;