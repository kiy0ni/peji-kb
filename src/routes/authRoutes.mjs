/**
 * ==============================================================================
 * ROUTE: AUTHENTICATION
 * ==============================================================================
 * @fileoverview Defines the public routes for user authentication flows.
 * Handles Login, Registration, and Logout processes.
 * * @security Critical routes (Login/Register) are protected by Rate Limiters
 * to prevent brute-force attacks.
 * @dependencies express, authController, authMiddleware
 * ==============================================================================
 */

// --- 1. IMPORTS ---
import express from 'express';

// Controllers
import * as authController from '../controllers/authController.mjs';

// Middlewares (Security)
import { loginLimiter, registerLimiter } from '../middlewares/authMiddleware.mjs';

// --- 2. ROUTER INITIALIZATION ---
const router = express.Router();

/**
 * ==============================================================================
 * I. LOGIN ROUTES (Session Initialization)
 * ==============================================================================
 */

// GET: Render the Login Page
router.get('/login', authController.getLoginPage);

// POST: Process Login Credentials
// Security: Uses 'loginLimiter' to mitigate password guessing attacks.
router.post('/login', loginLimiter, authController.postLogin);


/**
 * ==============================================================================
 * II. REGISTRATION ROUTES (Account Creation)
 * ==============================================================================
 */

// GET: Render the Registration Page
router.get('/register', authController.getRegisterPage);

// POST: Process New Account Creation
// Security: Protected against brute-force registration bots.
// (Limit configured in authMiddleware, typically ~3 attempts/min).
router.post('/register', registerLimiter, authController.postRegister);


/**
 * ==============================================================================
 * III. LOGOUT ROUTES (Session Termination)
 * ==============================================================================
 */

// GET: Destroy Session and Redirect
router.get('/logout', authController.logout);


export default router;