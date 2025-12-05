/**
 * ==============================================================================
 * AI MANAGER (ADAPTER PATTERN)
 * ==============================================================================
 * @fileoverview Centralized interface for Large Language Model (LLM) interactions.
 *
 * This module implements the Adapter Pattern to decouple the application logic
 * from specific AI providers. The rest of the application remains agnostic
 * to whether the underlying provider is Ollama, OpenAI, or Gemini.
 *
 * @author Sacha Pastor
 * @environment Node.js (Fetch API available in Node 18+)
 * ==============================================================================
 */

// import fetch from 'node-fetch'; // Uncomment if using Node.js < 18

/**
 * Main entry point to query the configured AI provider.
 * Dispatches the request to the specific internal adapter based on environment variables.
 *
 * @param {Array<Object>} messages - Conversation history in standard format: [{role: 'user', content: '...'}].
 * @returns {Promise<string>} The textual content of the AI's response.
 * @throws {Error} If the configured provider is not supported.
 */
export async function askAI(messages) {
    // 1. Configuration: Load provider and model from environment or defaults
    const provider = process.env.AI_PROVIDER || 'ollama';
    const model = process.env.AI_MODEL || 'mistral';

    console.log(`[AI MANAGER] Dispatching request to provider: ${provider} (Model: ${model})...`);

    // 2. Dispatch Strategy (Adapter Pattern)
    switch (provider) {
        case 'ollama':
            return await _callOllama(messages, model);
            
        // Future Implementations:
        // case 'openai': return await _callOpenAI(messages, model);
        // case 'gemini': return await _callGemini(messages, model);

        default:
            throw new Error(`[AI MANAGER] Unsupported AI Provider: ${provider}`);
    }
}

/**
 * ==============================================================================
 * INTERNAL ADAPTERS
 * ==============================================================================
 */

/**
 * Adapter for Ollama (Self-Hosted LLM).
 * Handles the specific API signature and error management for local Ollama instances.
 *
 * @param {Array<Object>} messages - The conversation history.
 * @param {string} model - The specific model tag to use (e.g., 'mistral', 'llama3').
 * @returns {Promise<string>} The AI response text or a user-friendly error message.
 * @private
 */
async function _callOllama(messages, model) {
    // Configuration: Default to localhost standard port if not specified
    const url = process.env.AI_API_URL || 'http://127.0.0.1:11434/api/chat';
    
    try {
        // 1. Construct the Payload
        // We disable streaming ('stream: false') to simplify the response handling for V1.
        const payload = {
            model: model,
            messages: messages,
            stream: false
        };

        // 2. Execute API Call
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(payload)
        });

        // 3. Network/Protocol Error Handling
        if (!response.ok) {
            throw new Error(`Ollama API responded with status: ${response.statusText} (${response.status})`);
        }

        // 4. Parse Response
        const data = await response.json();
        
        // Return only the content string to maintain the agnostic interface contract
        return data.message.content;

    } catch (error) {
        // Log the technical error for server-side debugging
        console.error('[AI ADAPTER] Ollama Connection Error:', error);
        
        // Return a safe, user-facing error message (Fail Gracefully)
        return "⚠️ Error: Unable to reach local AI service. Please verify that Ollama is running.";
    }
}