/**
 * ==============================================================================
 * MODULE: AI CHAT CLIENT
 * ==============================================================================
 * @fileoverview Manages the client-side logic for the Retrieval-Augmented Generation (RAG)
 * chat interface. It handles message rendering, input sanitization, API communication,
 * and conversation lifecycle management.
 *
 * @author Sacha Pastor
 * @environment Browser (Client-side JS)
 * @dependencies utils.mjs
 * ==============================================================================
 */

// --- 1. IMPORTS ---
import { postJSON } from './utils.mjs';

/**
 * Initializes the AI Chat subsystem.
 * Locates the chat container and binds necessary event listeners.
 */
export function initChat() {
    
    // ==========================================================================
    // 1. DOM ELEMENTS & STATE INITIALIZATION
    // ==========================================================================
    
    // Context Metadata
    const metaPath = document.getElementById('meta-path')?.value;
    const chatContainer = document.getElementById('tab-ai');
    
    // Guard Clause: Exit if the chat interface or file path is missing
    if (!chatContainer || !metaPath) return;

    // UI Elements
    const dom = {
        history: document.getElementById('chatHistory'),
        input: document.getElementById('chatInput'),
        sendBtn: document.getElementById('chatSend'),
        resetBtn: document.getElementById('chatReset'),
        loadingIndicator: document.getElementById('chatLoading')
    };

    // State Management
    // Prevents double submission while the AI is processing
    let isProcessing = false;
    
    // AbortController to handle request cancellation (e.g., page navigation)
    let abortController = null;


    // ==========================================================================
    // 2. HELPER FUNCTIONS (UTILITIES)
    // ==========================================================================

    /**
     * Sanitizes strings to prevent XSS (Cross-Site Scripting) attacks.
     * Replaces dangerous characters with HTML entities.
     * @param {string} str - The raw input string.
     * @returns {string} The escaped safe string.
     */
    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Scrolls the chat history container to the bottom.
     * Used when new messages are added or when loading completes.
     */
    function scrollHistoryToEnd() {
        if (!dom.history) return;
        dom.history.scrollTop = dom.history.scrollHeight;
    }

    /**
     * Toggles the UI loading state.
     * Disables inputs to prevent user interference during processing.
     * @param {boolean} isLoading - True to show loader and lock UI, False to unlock.
     */
    function setLoading(isLoading) {
        if (!dom.loadingIndicator) return;
        
        // Toggle visibility immediately (no delay)
        dom.loadingIndicator.hidden = !isLoading;
        
        if (isLoading) {
            isProcessing = true;
            scrollHistoryToEnd();
            
            // Disable interaction
            if (dom.input) dom.input.disabled = true;
            if (dom.sendBtn) dom.sendBtn.disabled = true;
        } else {
            isProcessing = false;
            
            // Re-enable interaction
            if (dom.input) {
                dom.input.disabled = false;
                dom.input.focus();
            }
            if (dom.sendBtn) dom.sendBtn.disabled = false;
        }
    }


    // ==========================================================================
    // 3. RENDERING LOGIC
    // ==========================================================================

    /**
     * Renders a single chat message into the DOM.
     * Handles code block formatting via triple backticks (```).
     * @param {Object} message - The message object.
     * @param {string} message.role - 'user' or 'assistant'.
     * @param {string} message.content - The text content.
     */
    function renderMessage({ role, content }) {
        // Remove "Empty State" placeholder if it exists
        const emptyState = dom.history.querySelector('.chat-empty-state');
        if (emptyState) emptyState.remove();

        // Create Container
        const item = document.createElement('div');
        item.className = `chat-msg ${role === 'user' ? 'is-user' : 'is-assistant'}`;
        
        // Create Bubble
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        
        // Content Parsing Strategy:
        // 1. Split content by code blocks (``` ... ```)
        // 2. Escape normal text and convert newlines to <br>
        // 3. Escape code block content and wrap in <pre><code>
        const original = String(content);
        const parts = original.split(/```([\s\S]*?)```/g);
        
        let htmlBuffer = '';
        
        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 0) {
                // Segment is Normal Text
                htmlBuffer += escapeHTML(parts[i]).replace(/\n/g, '<br>');
            } else {
                // Segment is Code
                htmlBuffer += `<pre><code>${escapeHTML(parts[i])}</code></pre>`;
            }
        }

        bubble.innerHTML = htmlBuffer;
        item.appendChild(bubble);
        dom.history.appendChild(item);
    }


    // ==========================================================================
    // 4. API INTERACTIONS
    // ==========================================================================

    /**
     * Fetches the existing chat history from the server.
     * Populates the chat window or shows an empty state.
     */
    async function loadChat() {
        try {
            const res = await fetch(`/api/v1/chat?path=${encodeURIComponent(metaPath)}`);
            const data = await res.json();
            
            // Clear current view
            dom.history.innerHTML = ''; 
            
            if (data.messages && data.messages.length > 0) {
                data.messages.forEach(m => renderMessage(m));
            } else {
                 // Render Empty State
                 dom.history.innerHTML = `
                    <div class="chat-empty-state">
                        <i class="ph ph-robot" style="font-size: 24px; color: var(--text-light); margin-bottom: 8px;"></i>
                        <p style="font-size: 13px; color: var(--text-muted);">Chat about this document.</p>
                    </div>`;
            }
            scrollHistoryToEnd();
        } catch (error) { 
            console.error('[Chat] Load Error:', error); 
        }
    }

    /**
     * Sends the user's message to the backend API.
     * Handles the AbortController for request cancellation.
     */
    async function sendChatMessage() {
        const text = dom.input.value.trim();
        
        // Block if empty or already sending
        if (!text || isProcessing) return; 

        // 1. Optimistic UI Update: Show user message immediately
        renderMessage({ role: 'user', content: text });
        dom.input.value = '';
        dom.input.style.height = 'auto'; // Reset textarea height
        scrollHistoryToEnd();

        // 2. Lock UI & Show Loader
        setLoading(true);

        // 3. Request Management
        // Cancel any pending previous request to ensure clean state
        if (abortController) abortController.abort();
        abortController = new AbortController();

        try {
            // API Call
            const res = await postJSON('/api/v1/chat', 
                { path: metaPath, content: text },
                { signal: abortController.signal } // Pass abort signal
            );
            
            const data = await res.json();
            
            // 4. Unlock UI BEFORE rendering response for perceived performance
            setLoading(false);

            if (data.success && data.messages) {
                // Render assistant responses
                data.messages
                    .filter(m => m.role === 'assistant')
                    .forEach(m => renderMessage(m));
            } else {
                renderMessage({ role: 'assistant', content: 'Error: Unable to retrieve a response.' });
            }

        } catch (error) {
            // Error Handling
            
            // Ignore AbortError (User navigated away or cancelled)
            if (error.name === 'AbortError') return;

            console.error('[Chat] Send Error:', error);
            
            // Ensure UI is unlocked even on error
            setLoading(false); 
            renderMessage({ role: 'assistant', content: 'Network error.' });

        } finally {
            // Cleanup
            abortController = null;
            scrollHistoryToEnd();
        }
    }


    // ==========================================================================
    // 5. EVENT LISTENERS
    // ==========================================================================

    // Initialize: Load History
    loadChat();

    // A. Lifecycle: Abort requests on page unload
    window.addEventListener('beforeunload', () => {
        if (abortController) {
            abortController.abort();
        }
    });

    // B. Interaction: Send Button
    if (dom.sendBtn) {
        dom.sendBtn.addEventListener('click', sendChatMessage);
    }
    
    // C. Interaction: Input Area
    if (dom.input) {
        // Auto-resize textarea
        dom.input.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });

        // Enter key to send (Shift+Enter for new line)
        dom.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }

    // D. Interaction: Reset Conversation
    if (dom.resetBtn) {
        dom.resetBtn.addEventListener('click', async () => {
            if (!confirm('Reset conversation?')) return;
            
            try {
                const res = await fetch(`/api/v1/chat?path=${encodeURIComponent(metaPath)}`, { method: 'DELETE' });
                const data = await res.json();
                
                if (data.success) {
                    // Restore Empty State
                    dom.history.innerHTML = `
                        <div class="chat-empty-state">
                            <i class="ph ph-robot" style="font-size: 24px; color: var(--text-light); margin-bottom: 8px;"></i>
                            <p style="font-size: 13px; color: var(--text-muted);">Chat about this document.</p>
                        </div>`;
                    setLoading(false);
                }
            } catch (error) { 
                console.error('[Chat] Reset Error:', error); 
            }
        });
    }
}