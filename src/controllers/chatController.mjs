/**
 * ==============================================================================
 * CONTROLLER: CHAT & AI INTERACTION
 * ==============================================================================
 * @fileoverview Manages the Retrieval-Augmented Generation (RAG) chat interface.
 * Handles fetching history, posting user messages, invoking the AI service, 
 * and storing the resulting conversation.
 *
 * @author Sacha Pastor
 * @environment Node.js (ES Modules)
 * @dependencies database, aiService (RAG)
 * ==============================================================================
 */

// --- 1. CORE IMPORTS ---
import db from '../config/database.mjs';

// Import the RAG orchestration service
// Note: Ensure this file exists at the specified path.
import { generateAIResponse } from '../services/aiService.mjs'; // Updated path based on previous context (was aiService)


/**
 * ==============================================================================
 * 2. CONTROLLER METHODS
 * ==============================================================================
 */

/**
 * Retrieves the full conversation history for a specific document context.
 * * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {void} Returns JSON { messages: [] }
 */
export const getChatHistory = (req, res) => {
    // 1. Identity Resolution (Hybrid Auth)
    // Supports both Browser Session (req.user) and API Key (req.apiUser).
    const userObj = req.user || req.apiUser;
    
    if (!userObj) {
        return res.status(401).json({ error: 'Unauthorized: No valid user found.' });
    }

    const userId = userObj.id;
    const docPath = req.query.path;
    
    // 2. Input Validation
    if (!docPath) {
        return res.status(400).json({ error: 'Missing required parameter: path' });
    }
    
    try {
        // 3. Data Retrieval
        // Fetch messages strictly for this user and document path.
        // Ordered chronologically (ASC) so the frontend renders them top-to-bottom.
        const rows = db.prepare(`
            SELECT id, user_id, path, role, content, created_at 
            FROM chat_messages 
            WHERE user_id = ? AND path = ? 
            ORDER BY created_at ASC, id ASC
        `).all(userId, docPath);

        res.json({ messages: rows });

    } catch (error) {
        console.error('[ChatController] Get History Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Handles the main Chat RAG loop:
 * 1. Saves User Message.
 * 2. Calls AI Service (with context).
 * 3. Saves Assistant Response.
 * * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {Promise<void>} Returns JSON with the assistant's response.
 */
export const postChat = async (req, res) => {
    // 1. Identity Resolution
    const userObj = req.user || req.apiUser;
    if (!userObj) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = userObj.id;
    const { path: docPath, content } = req.body || {};

    // 2. Input Validation
    if (!docPath || !content) {
        return res.status(400).json({ error: 'Missing required fields: path or content' });
    }

    try {
        // 2.1. Sanitize User Input
        const userMsg = content.trim();
        if (!userMsg) {
            return res.status(400).json({ error: 'Message content cannot be empty' });
        }

        // 3. Persistence: Save User Message
        db.prepare(`
            INSERT INTO chat_messages (user_id, path, role, content) 
            VALUES (?, ?, ?, ?)
        `).run(userId, docPath, 'user', userMsg);

        // 4. AI Processing (RAG Service)
        let aiResponseText;
        
        try {
            // Orchestrate the RAG flow: Context retrieval -> Prompting -> LLM Generation
            aiResponseText = await generateAIResponse(userId, docPath, userMsg);
        } catch (aiError) {
            // Fail Gracefully: Log the error but don't crash the request.
            // Return a fallback message to the user.
            console.error('⚠️ [ChatController] AI Service Failure:', aiError);
            aiResponseText = 'Sorry, the AI service is temporarily unavailable.';
        }

        // Safety check for empty AI response
        if (!aiResponseText) {
            aiResponseText = 'The AI returned no response.';
        }

        // 5. Persistence: Save Assistant Response
        db.prepare(`
            INSERT INTO chat_messages (user_id, path, role, content) 
            VALUES (?, ?, ?, ?)
        `).run(userId, docPath, 'assistant', aiResponseText);

        // 6. Response
        res.status(201).json({ 
            success: true, 
            messages: [{ role: 'assistant', content: aiResponseText }] 
        });

    } catch (error) {
        console.error('[ChatController] Critical Flow Error:', error);
        res.status(500).json({ 
            error: 'Server Logic Error', 
            messages: [{ role: 'assistant', content: 'Critical server error occurred.' }] 
        });
    }
};

/**
 * Clears the conversation history for a specific document context.
 * * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {void} Returns success JSON.
 */
export const deleteChatHistory = (req, res) => {
    // 1. Identity Resolution
    const userObj = req.user || req.apiUser;
    if (!userObj) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = userObj.id;
    const docPath = req.query.path;

    // 2. Input Validation
    if (!docPath) {
        return res.status(400).json({ error: 'Missing parameter: path' });
    }

    try {
        // 3. Execution: Bulk Delete
        const result = db.prepare(`
            DELETE FROM chat_messages 
            WHERE user_id = ? AND path = ?
        `).run(userId, docPath);

        res.json({ success: true, deleted: result.changes });

    } catch (error) {
        console.error('[ChatController] Delete History Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};