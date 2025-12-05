/**
 * ==============================================================================
 * ROUTE: VIEW CONTROLLER (UI ROUTES)
 * ==============================================================================
 * @fileoverview Defines the routing logic for the server-side rendered UI (HTML).
 * These routes handle the main application navigation, settings forms, and 
 * administration panels.
 * * @security All routes in this file are protected by the 'requireAuth' middleware.
 * @dependencies express, multer (file upload)
 * ==============================================================================
 */

// --- 1. IMPORTS ---
import express from 'express';

// Controllers
import * as viewController from '../controllers/viewController.mjs'; // Renders HTML pages (EJS)
import * as adminController from '../controllers/adminController.mjs'; // Admin logic
import * as apiController from '../controllers/apiController.mjs'; // Handles actions (Keys/Webhooks)

// Middlewares
import { requireAuth, requireAdmin } from '../middlewares/authMiddleware.mjs';
import { upload } from '../middlewares/uploadMiddleware.mjs';

// --- 2. ROUTER INITIALIZATION ---
const router = express.Router();

/**
 * ==============================================================================
 * I. GLOBAL SECURITY MIDDLEWARE
 * ==============================================================================
 * Applied to all routes defined in this file.
 * Ensures that only authenticated users (with active sessions) can access these views.
 * CSRF protection is implicitly handled globally by coreMiddleware.
 */
router.use(requireAuth);


/**
 * ==============================================================================
 * II. CORE USER VIEWS
 * ==============================================================================
 */

// Dashboard / Landing Page
router.get('/', viewController.getDashboard);

// User Profile & Configuration Page
router.get('/settings', viewController.getSettings);


/**
 * ==============================================================================
 * III. EXPLORER SYSTEM (Regex Routing)
 * ==============================================================================
 * Regex is used here to capture arbitrary nested file paths (e.g., /browse/folder/subfolder/...).
 * Standard Express parameters (:param) struggle with slashes in the value.
 */

// Redirect root browse requests to the correct handler
router.get('/browse', viewController.redirectBrowse);

// Browse Categories/Folders
router.get(/^\/browse\/(.*)/, viewController.getBrowse);

// PDF File Viewer (Reader Mode)
router.get(/^\/file\/(.*)/, viewController.getFileViewer);


/**
 * ==============================================================================
 * IV. SETTINGS ACTIONS (Self-Service)
 * ==============================================================================
 * These routes handle Form POST submissions from the Settings page.
 * * NOTE: We utilize 'apiController' here. Although these are UI form submissions,
 * the apiController contains the hybrid logic to perform the operation and then
 * conditionally redirect back to the previous view (if req.session exists).
 */

// API Key Management
router.post('/settings/keys', apiController.createKey);
router.post('/settings/keys/:id/revoke', apiController.revokeKey);

// Webhook Management
router.post('/settings/webhooks', apiController.createWebhook);
router.post('/settings/webhooks/:id/delete', apiController.deleteWebhook);


/**
 * ==============================================================================
 * V. ADMINISTRATION PANEL (Protected)
 * ==============================================================================
 * Routes restricted strictly to users with the 'admin' role.
 */

// A. Admin Dashboard
router.get('/admin', requireAdmin, adminController.getAdminDashboard);

// B. Content Management (File Upload)
// Uses 'upload.single' middleware (Multer) to process the multipart/form-data.
// 'handleUploadError' is attached to catch file size limits or type errors.
router.post('/admin/upload', 
    requireAdmin, 
    upload.single('coursePdf'), 
    adminController.handleUpload, 
    adminController.handleUploadError
);

// C. User Management Actions
// These routes allow admins to manage resources on behalf of other users.

// Manage User API Keys
router.post('/admin/users/:id/keys', requireAdmin, adminController.createUserKey);
router.post('/admin/users/:id/keys/:keyId/revoke', requireAdmin, adminController.revokeUserKey);

// Manage User Webhooks
router.post('/admin/users/:id/webhooks', requireAdmin, adminController.createUserWebhook);
router.post('/admin/users/:id/webhooks/:hookId/delete', requireAdmin, adminController.deleteUserWebhook);

// Critical Action: Delete User Account
router.post('/admin/users/:id/delete', requireAdmin, adminController.deleteUser);


export default router;