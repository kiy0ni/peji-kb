/**
 * ==============================================================================
 * CONTROLLER: AUTHENTICATION
 * ==============================================================================
 * @fileoverview Manages the core user authentication flows: Login, Registration, 
 * and Session Termination (Logout).
 * * @author Sacha Pastor
 * @environment Node.js (ES Modules)
 * @dependencies bcryptjs, database
 * ==============================================================================
 */

// --- 1. IMPORTS ---
import bcrypt from 'bcryptjs';
import db from '../config/database.mjs';


/**
 * ==============================================================================
 * I. LOGIN FLOW
 * ==============================================================================
 */

/**
 * Renders the Login page.
 * Handles the retrieval of the CSRF token to inject into the form.
 * * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
export const getLoginPage = (req, res) => {
    // SECURITY: CSRF Token Retrieval
    // Attempts to get the token from the function (csurf middleware) or falls back 
    // to locals if set by a previous middleware.
    const token = typeof req.csrfToken === 'function' 
        ? req.csrfToken() 
        : (res.locals.csrfToken || null);

    res.render('pages/login', { 
        error: null, 
        csrfToken: token 
    });
};

/**
 * Processes the Login form submission.
 * Verifies credentials and initializes the user session.
 * * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
export const postLogin = (req, res) => {
    const { username, password } = req.body;

    // 1. User Retrieval
    // We look up the user by username strictly.
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    // 2. Credential Verification
    // We check if the user exists AND if the provided password matches the stored hash.
    // bcrypt.compareSync handles the timing attack mitigation internally.
    if (user && bcrypt.compareSync(password, user.password)) {
        
        // 3. Session Initialization
        // Store minimal, non-sensitive user data in the session.
        req.session.userId = user.id;
        req.session.user = { 
            id: user.id, 
            username: user.username, 
            role: user.role 
        };
        
        res.redirect('/');
    } else {
        // Auth Failed: Render page again with error message.
        res.render('pages/login', { error: 'Invalid credentials' });
    }
};


/**
 * ==============================================================================
 * II. REGISTRATION FLOW
 * ==============================================================================
 */

/**
 * Renders the Registration page.
 * * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
export const getRegisterPage = (req, res) => {
    const token = typeof req.csrfToken === 'function' 
        ? req.csrfToken() 
        : (res.locals.csrfToken || null);

    res.render('pages/register', { 
        error: null, 
        csrfToken: token 
    });
};

/**
 * Processes the Registration form submission.
 * Creates a new user and handles logic for Admin role promotion.
 * * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
export const postRegister = (req, res) => {
    const { username, password, adminSecret } = req.body;

    // SECURITY: Role Determination Logic
    // 1. Retrieve the master Admin Code from environment variables.
    //    (Ideally, this should be a long, complex string).
    const envAdminCode = process.env.ADMIN_CODE || '';

    // 2. Validate the provided secret against the environment code.
    //    We explicitly check that envAdminCode is not empty to prevent 
    //    accidental admin creation if the env var is missing.
    const role = (
        typeof adminSecret === 'string' && 
        envAdminCode && 
        adminSecret === envAdminCode
    ) ? 'admin' : 'user';

    // 3. Password Hashing
    // Salt rounds set to 10 (Standard industry practice for performance/security balance).
    const hash = bcrypt.hashSync(password, 10);
  
    try {
        // 4. Persistence
        db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
          .run(username, hash, role);
        
        res.redirect('/login');

    } catch (err) {
        // Error Handling
        // Assuming the error is due to the UNIQUE constraint on the 'username' column.
        res.render('pages/register', { error: 'Username already taken' });
    }
};


/**
 * ==============================================================================
 * III. SESSION TERMINATION
 * ==============================================================================
 */

/**
 * Destroys the current user session and redirects to login.
 * * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
export const logout = (req, res) => {
    req.session.destroy();
    res.redirect('/login');
};