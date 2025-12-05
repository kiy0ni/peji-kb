/**
 * ==============================================================================
 * CLIENT APPLICATION ENTRY POINT
 * ==============================================================================
 * @fileoverview Main orchestrator for the client-side JavaScript bundle.
 * It is responsible for importing feature modules and initializing them in the
 * correct order once the DOM is fully loaded.
 *
 * @architecture Modular ESM (ES Modules)
 * @author Sacha Pastor
 * ==============================================================================
 */

// --- 1. MODULE IMPORTS ---

// Telemetry & Analytics
import { initActivityTracking } from './modules/activity.mjs';

// User Interface & Layout Management
import { initSidebar, initLayout, initTabs, initHistory } from './modules/ui.mjs';

// Core Functionality (Markdown Editor)
import { initEditor } from './modules/editor.mjs';

// Data Synchronization (Notes, Favorites)
import { initDataManager } from './modules/data.mjs';

// AI Integration (RAG Chat)
import { initChat } from './modules/chat.mjs';


// --- 2. DEBUGGING ---
// Log initialization start for debugging purposes
console.debug('[Client] Bootstrapping Application (Modular ESM)...');


// --- 3. INITIALIZATION SEQUENCE ---

/**
 * Main execution block.
 * Waits for the DOM to be ready before attaching listeners and starting services.
 */
document.addEventListener('DOMContentLoaded', () => {

    // ==========================================================================
    // PHASE 1: UI & NAVIGATION LAYOUT
    // ==========================================================================
    // Sets up the visual framework, sidebar toggles, and navigation history.
    initSidebar();
    initLayout();
    initHistory();

    // ==========================================================================
    // PHASE 2: CORE COMPONENTS (EDITOR)
    // ==========================================================================
    // Initializes the EasyMDE Markdown editor.
    // NOTE: Returns null if we are not on a 'Reader' page (file view).
    const easyMDE = initEditor();

    // ==========================================================================
    // PHASE 3: INTERACTIVE TOOLS
    // ==========================================================================
    // 3.1. Tab System
    // Handles switching between Notes, Snippets, and AI Chat.
    // Pass 'easyMDE' so the editor can refresh its layout when its tab becomes active.
    initTabs(easyMDE);

    // 3.2. Data Manager
    // Handles fetching and saving user notes, snippets, and favorite status.
    initDataManager(easyMDE);

    // 3.3. AI Chat System
    // Initializes the RAG (Retrieval-Augmented Generation) chat interface.
    initChat();

    // ==========================================================================
    // PHASE 4: BACKGROUND SERVICES
    // ==========================================================================
    // Starts telemetry to track reading time and site activity.
    initActivityTracking();

    console.debug('[Client] Application Ready.');
});