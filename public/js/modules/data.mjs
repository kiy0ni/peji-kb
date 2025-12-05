/**
 * ==============================================================================
 * MODULE: DATA MANAGER
 * ==============================================================================
 * @fileoverview Manages the synchronization of user data (Notes, Snippets, Favorites)
 * between the client and the backend API. It handles state management,
 * UI rendering for snippets, and debounced auto-saving.
 *
 * @author Sacha Pastor
 * @environment Browser (Client-side JS)
 * @dependencies utils.mjs
 * ==============================================================================
 */

// --- 1. IMPORTS ---
import { debounce, postJSON } from './utils.mjs';

// --- 2. STATE & CONFIGURATION ---

// Centralized state object acting as the Single Source of Truth for this module
let currentData = { 
    note: '', 
    snippets: [] 
};

// Retrieve context metadata injected into the DOM (usually hidden inputs)
const metaPath = document.getElementById('meta-path')?.value;
const metaTitle = document.getElementById('meta-title')?.value;

// DOM Element References
const domElements = {
    saveStatus: document.getElementById('saveStatus'),
    snippetList: document.getElementById('snippetList'),
    btnAddSnippet: document.getElementById('btnAddSnippet'),
    newSnippetCode: document.getElementById('newSnippetCode'),
    btnFav: document.getElementById('btnFav')
};


/**
 * ==============================================================================
 * 3. HELPER FUNCTIONS (Internal Logic)
 * ==============================================================================
 */

/**
 * Renders the list of code snippets into the DOM.
 * * Security Note: We manually replace '<' with '&lt;' to prevent basic XSS 
 * when rendering raw code blocks.
 */
function renderSnippets() {
    if (!domElements.snippetList) return;

    // Map state to HTML strings
    const htmlContent = currentData.snippets.map((snip, idx) => `
        <div class="snippet-card">
            <div class="snippet-actions">
                <button class="btn-action-snip" 
                        onclick="navigator.clipboard.writeText(this.parentElement.nextElementSibling.innerText)" 
                        title="Copy to Clipboard">
                    <i class="ph ph-copy"></i>
                </button>
                
                <button class="btn-action-snip btn-delete" 
                        onclick="window.deleteSnippet(${idx})" 
                        title="Delete Snippet">
                    <i class="ph ph-trash"></i>
                </button>
            </div>
            
            <pre class="snippet-code">${snip.code.replace(/</g, '&lt;')}</pre>
        </div>
    `).join('');

    domElements.snippetList.innerHTML = htmlContent;
}

/**
 * Persists the current state (Notes + Snippets) to the backend.
 * This function is typically debounced to avoid flooding the server.
 */
async function saveData() {
    if (!metaPath) return;

    // UI Feedback: Saving started
    if (domElements.saveStatus) {
        domElements.saveStatus.innerText = 'Saving...';
    }
    
    try {
        // API Call: POST /api/v1/data
        await postJSON('/api/v1/data', { 
            path: metaPath, 
            data: currentData 
        });

        // UI Feedback: Saving success
        if (domElements.saveStatus) {
            domElements.saveStatus.innerText = 'Saved';
            // Reset status after 2 seconds
            setTimeout(() => {
                if (domElements.saveStatus) domElements.saveStatus.innerText = 'Ready';
            }, 2000);
        }
    } catch (error) {
        // UI Feedback: Saving failed
        if (domElements.saveStatus) {
            domElements.saveStatus.innerText = 'Error!';
        }
        console.error("[DataManager] Save failed:", error);
    }
}


/**
 * ==============================================================================
 * 4. MODULE EXPORT (Initialization)
 * ==============================================================================
 */

/**
 * Initializes the Data Manager module.
 * Loads initial data, binds editor events, and sets up interaction listeners.
 *
 * @param {Object} easyMDE - The initialized EasyMDE editor instance.
 */
export async function initDataManager(easyMDE) {
    // Guard Clause: Exit if no document path is defined (e.g., Dashboard view)
    if (!metaPath) return;

    // --- STEP 1: LOAD INITIAL DATA ---
    try {
        // Fetch data from API
        const res = await fetch(`/api/v1/data?path=${encodeURIComponent(metaPath)}`);
        
        // Security Check: Validate HTTP response
        if (!res.ok) {
            throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
        }
        
        // Parse and Hydrate State
        const data = await res.json();
        currentData = data;
        
        // Update UI Components
        if (easyMDE) {
            easyMDE.value(data.note || '');
        }
        renderSnippets();

    } catch (error) { 
        console.error('[DataManager] Error loading initial data:', error);
        // Note: In a production app, we might want to show a toast notification here.
    }

    // --- STEP 2: BIND EDITOR AUTO-SAVE ---
    if (easyMDE) {
        // create a debounced version of the save function (1 second delay)
        const debouncedSave = debounce(saveData, 1000);

        easyMDE.codemirror.on("change", () => {
            // Sync editor content to state
            currentData.note = easyMDE.value();
            
            // Visual feedback
            if (domElements.saveStatus) {
                domElements.saveStatus.innerText = '...';
            }
            
            // Trigger save
            debouncedSave();
        });
    }

    // --- STEP 3: BIND SNIPPETS LOGIC ---
    
    // Expose delete function globally for inline HTML onclick handlers
    // Note: This pattern assumes single-page functionality or careful naming.
    window.deleteSnippet = function(index) {
        if (confirm("Are you sure you want to delete this snippet?")) {
            // Remove item from state
            currentData.snippets.splice(index, 1);
            
            // Update UI and Persist
            renderSnippets();
            saveData();
        }
    };

    // Bind Add Button
    if (domElements.btnAddSnippet) {
        domElements.btnAddSnippet.addEventListener('click', () => {
            const code = domElements.newSnippetCode.value;
            
            // Validate input
            if (!code.trim()) return;

            // Update State
            currentData.snippets.push({ 
                code, 
                timestamp: Date.now() 
            });

            // Reset Input & Update UI
            domElements.newSnippetCode.value = '';
            renderSnippets();
            saveData();
        });
    }

    // --- STEP 4: BIND FAVORITES LOGIC ---
    if (domElements.btnFav) {
        domElements.btnFav.addEventListener('click', async () => {
            // Determine action based on current state
            // The class 'is-fav' acts as the boolean flag for the UI
            const isAdding = !domElements.btnFav.classList.contains('is-fav');
            
            // Optimistic UI Update
            domElements.btnFav.classList.toggle('is-fav');
            const icon = domElements.btnFav.querySelector('i');
            
            // Toggle icon style (Filled star vs Outline star)
            // 'ph' class usually denotes outline/regular weight in Phosphor icons
            if (isAdding) {
                icon.classList.remove('ph'); // Make filled (CSS handled)
            } else {
                icon.classList.add('ph');    // Make outline
            }

            try {
                // API Sync
                await postJSON('/api/v1/favorites', { 
                    path: metaPath, 
                    title: metaTitle, 
                    toggle: isAdding ? 'add' : 'remove' 
                });
            } catch (error) { 
                console.error('[DataManager] Favorite sync error:', error);
                // Note: Ideally, revert the UI change here if the API call fails
            }
        });
    }
}