/**
 * ==============================================================================
 * KNOWLEDGE BASE SERVER APPLICATION
 * ==============================================================================
 * Primary server entry point and main application orchestrator.
 * This file handles setup, initialization, and delegates logic to dedicated
 * modules (configuration, services, middlewares, routes).
 *
 * @author Sacha Pastor
 * @environment Node.js / Express
 * @version 1.0.0
 * @date 2025-12-05
 * ==============================================================================
 */

// --- SECTION 1: CORE LIBRARY IMPORTS AND ENVIRONMENT SETUP ---

import 'dotenv/config'; // Loads environment variables from the .env file immediately
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- SECTION 2: APPLICATION MODULE IMPORTS ---

// 2.1. CONFIGURATION & SERVICES (Application Foundations)
import { initDB } from './src/config/database.mjs'; // Initializes database connection and runs necessary migrations
import { startWebhookWorker } from './src/services/webhookService.mjs'; // Starts the background worker process for asynchronous webhook processing

// 2.2. GLOBAL MIDDLEWARES (Security, Utilities, and Request Pre-processing)
import { setupCoreMiddlewares } from './src/middlewares/coreMiddleware.mjs'; // Essential Express setup: sessions, body parsers, view engine, static paths
import { contentSecurityPolicy } from './src/middlewares/securityMiddleware.mjs'; // Security headers application (e.g., Content Security Policy)
// NOTE: 'requireAuth' is imported but only used selectively in Section 4.3

// 2.3. ROUTE MODULES (URL Definition)
import authRoutes from './src/routes/authRoutes.mjs'; // Handles Authentication: Login, Registration, Logout
import viewRoutes from './src/routes/viewRoutes.mjs'; // Handles rendering of Main UI Views (e.g., Dashboard, public pages)
import apiRoutes from './src/routes/apiRoutes.mjs'; // Handles General API Endpoints (e.g., /api/v1/data)
import adminRoutes from './src/routes/adminRoutes.mjs'; // Handles Administration/Management API Endpoints

// --- SECTION 3: SYSTEM CONSTANTS & INITIALIZATION ---

// ES module equivalent for resolving __filename and __dirname paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server port: Uses the environment variable PORT, or defaults to 3000
const PORT = process.env.PORT || 3000;

// Initialize the Express Application instance
const app = express();

// --- SECTION 4: APPLICATION INITIALIZATION AND CONFIGURATION ---

/**
 * ## 4.1. Initialization Phase: Database and Background Workers
 * Establishes foundational services needed before the server starts accepting requests.
 */
try {
    // A. Database Connection & Migration
    initDB(); // Connects to the database and ensures schema is up-to-date (creates tables, runs migrations)

    // B. Background Worker Start
    startWebhookWorker(); // Initiates the background process for tasks like processing webhooks asynchronously
} catch (error) {
    // Log error and exit process if critical initialization fails
    console.error('CRITICAL ERROR: Failed to initialize application foundations (DB/Workers).', error);
    process.exit(1);
}

/**
 * ## 4.2. Global Middleware Phase: Essential and Security Configuration
 * Configures application-wide middleware that runs on nearly all incoming requests.
 */

// A. Core Utility Middlewares
setupCoreMiddlewares(app); // Applies essential utilities (session, body parsing, static file serving, view engine setup)

// B. Security Middlewares
app.use(contentSecurityPolicy); // Enforces security policies (e.g., CSP) against common web vulnerabilities

/**
 * ## 4.3. Routing Phase: Defining URL Paths and Logic
 * Registers all route modules in a structured order (e.g., Public -> API -> Authenticated Views -> Fallback).
 */
import { requireAuth } from './src/middlewares/authMiddleware.mjs'; // Import Authentication middleware here as it's used in this section

// 1. Auth Routes (Public access for core authentication flows: /login, /register, /logout)
app.use('/', authRoutes);

// 2. API Routes (RESTful endpoints, usually protected by tokens/API keys)
app.use('/api/v1', apiRoutes);
app.use('/api/v1/admin', adminRoutes);

// 3. View Routes (Main application pages that typically require authentication after login)
app.use('/', viewRoutes);

// 4. Protected Static Files (Serving static assets that should only be accessible to authenticated users)
// The placement here, after the general view/auth routes, ensures 'requireAuth' is available.
// NOTE: Files in the 'courses' directory are served under the '/raw' path *only* if the user is authenticated.
app.use('/raw', requireAuth, express.static(path.join(__dirname, 'courses')));

// 5. Fallback / 404 Handler (Catch-all for any request that did not match a defined route)
app.use((req, res) => {
    // Sets HTTP status to 404 and renders a standard error page
    res.status(404).render('pages/error', {
        title: 'Not Found',
        message: 'The requested page could not be found.',
        breadcrumbs: []
    });
});

// --- SECTION 5: SERVER STARTUP ---

/**
 * ## 5.1. Start Listening
 * Binds the Express application to the specified PORT and logs the successful startup.
 */
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Knowledge Base Server running: http://localhost:${PORT}`);
    });
}

export { app };