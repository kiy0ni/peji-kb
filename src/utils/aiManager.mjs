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
 * Dispatches the request to the specific internal adapter based on the provided configuration.
 *
 * @param {Array<Object>} messages - Conversation history in standard format: [{role: 'user', content: '...'}].
 * @param {Object} config - The AI configuration object { provider, model, apiUrl, apiKey }.
 * @returns {Promise<string>} The textual content of the AI's response.
 * @throws {Error} If the configured provider is not supported.
 */
export async function askAI(messages, config) {
  // 1. Configuration: Load provider from config object or default to 'ollama'
  const provider = config.provider || 'ollama';
  const model = config.model || 'mistral';

  console.log(`[AI MANAGER] Dispatching request to provider: ${provider} (Model: ${model})...`);

  // 2. Dispatch Strategy (Adapter Pattern)
  switch (provider) {
    case 'ollama':
      return await _callOllama(messages, config);

    case 'openai':
      return await _callOpenAI(messages, config);

    // Future Implementations:
    // case 'gemini': return await _callGemini(messages, config);

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
 * @param {Object} config - Configuration containing apiUrl and model.
 * @returns {Promise<string>} The AI response text or a user-friendly error message.
 * @private
 */
async function _callOllama(messages, config) {
  // Configuration: Default to localhost standard port if not specified
  const url = config.apiUrl || 'http://127.0.0.1:11434/api/chat';
  const model = config.model || 'mistral';

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
      throw new Error(
        `Ollama API responded with status: ${response.statusText} (${response.status})`
      );
    }

    // 4. Parse Response
    const data = await response.json();

    // Return only the content string to maintain the agnostic interface contract
    return data.message.content;
  } catch (error) {
    // Log the technical error for server-side debugging
    console.error('[AI ADAPTER] Ollama Connection Error:', error);

    // Return a safe, user-facing error message (Fail Gracefully)
    return '⚠️ Error: Unable to reach local AI service. Please verify that Ollama is running.';
  }
}

/**
 * Adapter for OpenAI (Cloud LLM).
 * Handles interactions with the standard OpenAI Chat Completion API.
 *
 * @param {Array<Object>} messages - The conversation history.
 * @param {Object} config - Configuration containing apiKey and model.
 * @returns {Promise<string>} The AI response text.
 * @private
 */
async function _callOpenAI(messages, config) {
  if (!config.apiKey) {
    throw new Error('OpenAI Provider requires an API Key.');
  }

  const url = 'https://api.openai.com/v1/chat/completions';
  const model = config.model || 'gpt-3.5-turbo';

  try {
    // 1. Construct the Payload
    const payload = {
      model: model,
      messages: messages,
      temperature: 0.7
    };

    // 2. Execute API Call
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(payload)
    });

    // 3. Error Handling
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        `OpenAI API Error: ${errData.error?.message || response.statusText} (${response.status})`
      );
    }

    // 4. Parse Response
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('[AI ADAPTER] OpenAI Connection Error:', error);
    return `⚠️ Error connecting to OpenAI: ${error.message}`;
  }
}
