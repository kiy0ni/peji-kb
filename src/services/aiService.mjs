/**
 * ==============================================================================
 * SERVICE: RAG ORCHESTRATOR (Retrieval-Augmented Generation)
 * ==============================================================================
 * @fileoverview Core service responsible for bridging document content with AI.
 * It handles:
 * 1. Context Retrieval (Caching vs. Fresh Extraction).
 * 2. Security Validation (Path traversal protection).
 * 3. Prompt Engineering (Injecting context and history).
 * 4. AI Execution via the AI Manager.
 *
 * @author Sacha Pastor
 * @environment Node.js
 * ==============================================================================
 */

// --- 1. CORE IMPORTS ---
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- 2. MODULE IMPORTS ---
import db from '../config/database.mjs';
import { extractPdfText } from '../utils/pdfHandler.mjs';
import { askAI } from '../utils/aiManager.mjs';

// --- 3. CONFIGURATION CONSTANTS ---

// File system resolution setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

// Limits for context window management to prevent token overflow
const MAX_CONTEXT_CHARS = 15000; // Approx. 3000-4000 tokens
const HISTORY_LIMIT = 6;         // Number of past messages to retain for context

// Default System Prompt (English translation of the original french prompt)
const DEFAULT_SYSTEM_PROMPT = `You are a helpful and concise educational assistant. Answer the user's question using ONLY the following context. If the answer is not in the context, state it clearly.\n\nDOCUMENT CONTEXT:\n{{CONTEXT}}`;

/**
 * Orchestrates the full RAG workflow: Retrieves document context, builds the prompt,
 * and queries the AI model.
 *
 * @param {number} userId - The ID of the user making the request.
 * @param {string} docPath - Relative path to the course file (e.g., 'courses/math/algebra.pdf').
 * @param {string} userContent - The specific question asked by the user.
 * @returns {Promise<string>} The generated text response from the AI.
 * @throws {Error} If the document path is invalid or attempts directory traversal.
 */
export async function generateAIResponse(userId, docPath, userContent) {
    
    // --- STEP 1: CONTEXT RETRIEVAL (CACHE-FIRST STRATEGY) ---
    
    let contextText = '';
    
    // 1.1. Check Database Cache
    const cachedRecord = db.prepare('SELECT content FROM document_cache WHERE path = ?').get(docPath);
    
    if (cachedRecord) {
        console.log(`[RAG Service] Cache hit for: ${docPath}`);
        contextText = cachedRecord.content;
    } else {
        console.log(`[RAG Service] Cache miss. Extracting content for: ${docPath}`);
        
        // 1.2. Resolve and Validate Path (Security Critical)
        const absolutePath = path.resolve(ROOT_DIR, docPath);
        const coursesRoot = path.join(ROOT_DIR, 'courses');
        
        // SECURITY CHECK: Prevent Directory Traversal Attacks
        // Ensures the resolved path is actually inside the intended 'courses' directory.
        if (!absolutePath.startsWith(coursesRoot)) {
            console.error(`[Security Alert] Invalid path access attempt: ${absolutePath}`);
            throw new Error('Invalid document path: Access Denied.');
        }
        
        // 1.3. Extract Text from PDF (Heavy Operation)
        // Uses the utility from pdfHandler.mjs
        contextText = await extractPdfText(absolutePath);
        
        // 1.4. Update Cache
        // Only cache if extraction yielded results to avoid caching empty states.
        if (contextText) {
            db.prepare('INSERT OR REPLACE INTO document_cache (path, content) VALUES (?, ?)').run(docPath, contextText);
        }
    }

    // --- STEP 2: CONTEXT PREPARATION ---

    // Truncate context to stay within LLM token limits (Context Window)
    const safeContext = contextText 
        ? contextText.slice(0, MAX_CONTEXT_CHARS) 
        : 'Content unavailable or empty.';

    // --- STEP 3: CONVERSATION HISTORY (SHORT-TERM MEMORY) ---

    // Fetch the last N messages to allow the AI to understand follow-up questions.
    // We reverse the result because SQL 'DESC' gives newest first, but LLMs need chronological order.
    const history = db.prepare(`
        SELECT role, content 
        FROM chat_messages 
        WHERE user_id = ? AND path = ? 
        ORDER BY created_at DESC 
        LIMIT ?
    `).all(userId, docPath, HISTORY_LIMIT).reverse();
    
    // --- STEP 4: PROMPT ENGINEERING ---

    // Inject the specific document context into the system instructions.
    // Allows environment variable override for prompt tuning without code changes.
    const systemPromptTemplate = process.env.AI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;
    const finalSystemPrompt = systemPromptTemplate.replace('{{CONTEXT}}', safeContext);

    // Construct the final message payload for the AI Manager
    const aiMessages = [
        { role: 'system', content: finalSystemPrompt }, // Instructions + Data
        ...history,                                     // Past conversation
        { role: 'user', content: userContent }          // Current Question
    ];

    // --- STEP 5: AI EXECUTION ---

    // Delegate the actual API call to the agnostic AI Manager
    const aiResponseText = await askAI(aiMessages);

    return aiResponseText;
}