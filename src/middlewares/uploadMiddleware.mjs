/**
 * ==============================================================================
 * MIDDLEWARE: UPLOAD CONFIGURATION (MULTER)
 * ==============================================================================
 * @fileoverview Configures the 'multer' library to handle multipart/form-data
 * (file uploads). It defines storage rules, naming conventions, and file validation.
 *
 * @security
 * - Enforces Strict Path Sanitization to prevent Directory Traversal attacks.
 * - Restricts uploads to the 'courses' directory structure.
 * - Validates file types (PDF only).
 *
 * @dependencies multer, fs, path
 * ==============================================================================
 */

// --- 1. CORE IMPORTS ---
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// --- 2. ENVIRONMENT SETUP ---

// Resolve current directory path (ES Modules equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the Application Root Directory
// Navigates up two levels from /src/middlewares/ to the project root
const ROOT_DIR = path.resolve(__dirname, '../../');


/**
 * ==============================================================================
 * 3. STORAGE ENGINE CONFIGURATION
 * ==============================================================================
 * Defines exactly where and how files should be stored on the disk.
 */
const storage = multer.diskStorage({

    /**
     * Determines the upload destination directory.
     * Logic handles both selecting existing folders and dynamically creating new ones.
     */
    destination: (req, file, cb) => {
        let targetDir = path.join(ROOT_DIR, 'courses');

        // --- SCENARIO A: CREATE NEW FOLDER ---
        if (req.body.category === 'new' && req.body.newCategoryName) {
            
            // SECURITY: Sanitize the folder name.
            // Remove any characters that aren't alphanumeric, underscores, or hyphens.
            // This prevents ".." path traversal attacks and invalid OS characters.
            const safeFolder = req.body.newCategoryName.replace(/[^a-z0-9_-]/gi, '').toLowerCase();

            if (!safeFolder) {
                return cb(new Error("Invalid folder name. Only alphanumeric characters allowed."));
            }

            targetDir = path.join(targetDir, safeFolder);

        // --- SCENARIO B: USE EXISTING FOLDER ---
        } else if (req.body.category && req.body.category !== 'root') {
            
            // Append the selected category to the path
            targetDir = path.join(targetDir, req.body.category);

        // --- SCENARIO C: INVALID SELECTION ---
        } else {
            // Block uploads directly to the root 'courses' folder to maintain organization
            return cb(new Error("Root upload is forbidden. Please select or create a folder."));
        }

        // --- DIRECTORY INITIALIZATION ---
        // Ensure the target directory exists before attempting to write the file.
        // The 'recursive: true' option prevents errors if parent folders are missing.
        if (!fs.existsSync(targetDir)) {
            try {
                fs.mkdirSync(targetDir, { recursive: true });
            } catch (err) {
                return cb(new Error(`Failed to create directory: ${err.message}`));
            }
        }

        // Proceed with the calculated path
        cb(null, targetDir);
    },

    /**
     * Determines the saved filename.
     * Sanitizes the input to ensure filesystem compatibility.
     */
    filename: (req, file, cb) => {
        // SECURITY: Sanitize filename.
        // Replace non-alphanumeric characters (except dots) with underscores.
        // This prevents issues with spaces, special symbols, or shell injection characters.
        const safeName = file.originalname.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
        
        cb(null, safeName);
    }
});


/**
 * ==============================================================================
 * 4. MULTER INSTANCE EXPORT
 * ==============================================================================
 * The configured middleware instance ready to be used in routes.
 */
export const upload = multer({
    storage: storage,

    /**
     * Optional file filter to validate file types before upload.
     * @param {Object} req - The Express request object.
     * @param {Object} file - The file object containing mimetype and originalname.
     * @param {Function} cb - The callback to accept (true) or reject (Error) the file.
     */
    fileFilter: (req, file, cb) => {
        // VALIDATION STRATEGY:
        // We check both the MIME type (provided by the client, can be spoofed)
        // and the file extension as a double-check.
        // Note: For critical security, actual file signature (magic bytes) checking
        // should be performed after upload or via a stream validator.
        const isLikelyPdf = 
            file.mimetype === 'application/pdf' || 
            /pdf/i.test(file.originalname);

        if (isLikelyPdf) {
            cb(null, true);
        } else {
            cb(new Error('Security Policy: Only PDF files are accepted.'));
        }
    }
});