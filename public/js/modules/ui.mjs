/**
 * ==============================================================================
 * MODULE: UI & LAYOUT MANAGER
 * ==============================================================================
 * @fileoverview Manages the core user interface interactions, including the
 * file tree sidebar, layout modes (Zen/Standard), tab navigation, and
 * client-side browsing history.
 *
 * @author Sacha Pastor
 * @environment Browser (Client-side JS)
 * ==============================================================================
 */

/**
 * Initializes the Sidebar (File Explorer).
 * Restores the expanded/collapsed state of directories from LocalStorage.
 */
export function initSidebar() {
  const OPEN_DIRS_STORAGE_KEY = 'kb_open_dirs_v1';

  // 1. Retrieve saved state
  // We use a Set for O(1) lookup performance during rendering.
  const openPathsSet = new Set(JSON.parse(localStorage.getItem(OPEN_DIRS_STORAGE_KEY) || '[]'));

  // 2. Iterate over all directory elements
  document.querySelectorAll('.tree-dir').forEach((detailElement) => {
    const path = detailElement.getAttribute('data-path');

    // Restore State: Open if path exists in storage
    if (openPathsSet.has(path)) {
      detailElement.setAttribute('open', '');
    }

    // Event Listener: Persist state changes
    detailElement.addEventListener('toggle', () => {
      if (detailElement.open) {
        openPathsSet.add(path);
      } else {
        openPathsSet.delete(path);
      }

      // Serialize and save back to LocalStorage
      localStorage.setItem(OPEN_DIRS_STORAGE_KEY, JSON.stringify([...openPathsSet]));
    });
  });
}

/**
 * Initializes Global Layout Controls.
 * Handles Zen Mode, Navigation Rail toggling, and the Tools Panel (Mobile/Desktop).
 */
export function initLayout() {
  // DOM Elements
  const btnZen = document.getElementById('btnZen');
  const btnTools = document.getElementById('btnTools');
  const btnToggleNav = document.getElementById('btnToggleNav');
  const appContainer = document.querySelector('.app');
  const toolsPanel = document.getElementById('toolsPanel');

  // --- A. Navigation Rail Toggle ---
  if (btnToggleNav) {
    btnToggleNav.addEventListener('click', () => {
      // Toggles the visibility of the context sidebar (File Tree)
      appContainer.classList.toggle('hide-context');
      btnToggleNav.classList.toggle('active');
    });
  }

  // --- B. Zen Mode Toggle ---
  if (btnZen) {
    btnZen.addEventListener('click', () => {
      appContainer.classList.toggle('zen-mode');
      const icon = btnZen.querySelector('i');

      // Swap icons based on state (Expand vs Compress)
      if (appContainer.classList.contains('zen-mode')) {
        icon.classList.replace('ph-arrows-out-simple', 'ph-arrows-in-simple');
      } else {
        icon.classList.replace('ph-arrows-in-simple', 'ph-arrows-out-simple');
      }
    });
  }

  // --- C. Tools Panel (Notes/AI) ---
  if (btnTools && toolsPanel) {
    const isMobileView = window.innerWidth <= 768;

    // Helper: Cleanly close the tools panel
    const closeToolsPanel = () => {
      toolsPanel.classList.remove('open');
      btnTools.classList.remove('active');
      if (!isMobileView) {
        appContainer.classList.remove('tools-open');
      }
    };

    // Toggle Event
    btnTools.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent document click from immediately closing it

      if (isMobileView) {
        // Mobile Behavior: Overlay
        if (toolsPanel.classList.contains('open')) {
          closeToolsPanel();
        } else {
          toolsPanel.classList.add('open');
          btnTools.classList.add('active');
        }
      } else {
        // Desktop Behavior: Layout Shift
        appContainer.classList.toggle('tools-open');
        btnTools.classList.toggle('active');
      }
    });

    // Click Outside Event (Mobile only)
    // Closes the panel if the user clicks anywhere else on the screen.
    document.addEventListener('click', (e) => {
      if (isMobileView && toolsPanel.classList.contains('open')) {
        const clickedInsidePanel = toolsPanel.contains(e.target);
        const clickedButton = btnTools.contains(e.target);

        if (!clickedInsidePanel && !clickedButton) {
          closeToolsPanel();
        }
      }
    });
  }
}

/**
 * Initializes the Tab System within the Tools Panel.
 * Handles switching between Notes, Snippets, and AI.
 * * @param {Object} easyMDE - The EasyMDE editor instance (optional).
 * Required to refresh CodeMirror layout upon tab switch.
 */
export function initTabs(easyMDE) {
  const tabs = document.querySelectorAll('.tools-tab');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      // 1. Reset active state on all tabs
      tabs.forEach((t) => t.classList.remove('active'));
      document
        .querySelectorAll('.tools-content > div')
        .forEach((div) => div.classList.remove('active'));

      // 2. Activate clicked tab
      tab.classList.add('active');
      const targetId = `tab-${tab.dataset.tab}`;
      const targetContent = document.getElementById(targetId);

      if (targetContent) {
        targetContent.classList.add('active');
      }

      // 3. Editor Refresh Fix
      // CodeMirror often renders incorrectly if initialized in a hidden container.
      // We force a refresh when the "Notes" tab becomes visible.
      if (targetId === 'tab-notes' && easyMDE) {
        setTimeout(() => {
          easyMDE.codemirror.refresh();
        }, 10);
      }
    });
  });
}

/**
 * Initializes Client-Side History.
 * - If on a File Page: Saves the current document to LocalStorage.
 * - If on Dashboard: Reads LocalStorage and renders the "Continue Reading" widget.
 */
export function initHistory() {
  // Check for metadata embedded in the DOM (present only on File views)
  const metaPathInput = document.getElementById('meta-path');
  const metaTitleInput = document.getElementById('meta-title');

  const currentPath = metaPathInput?.value;
  const currentTitle = metaTitleInput?.value;
  const HISTORY_STORAGE_KEY = 'kb_history_v1';
  const MAX_HISTORY_ITEMS = 8;

  // --- CASE A: WRITE HISTORY (On File Page) ---
  if (currentPath) {
    let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');

    // Remove existing entry for this path to avoid duplicates
    history = history.filter((h) => h.path !== currentPath);

    // Add new entry to the top
    history.unshift({
      title: currentTitle,
      path: currentPath,
      // Assign a random visual tone for the UI card
      tone: ['lavender', 'rose', 'mint', 'sky'][Math.floor(Math.random() * 4)],
      timestamp: Date.now()
    });

    // Enforce limit
    if (history.length > MAX_HISTORY_ITEMS) {
      history.pop();
    }

    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }

  // --- CASE B: READ HISTORY (On Dashboard) ---
  else {
    const historyGrid = document.getElementById('historyGrid');
    const historySection = document.getElementById('historySection');

    if (historyGrid) {
      const history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');

      if (history.length > 0) {
        // Show the section
        historySection.style.display = 'block';

        // Render Cards HTML
        historyGrid.innerHTML = history
          .map(
            (item) => `
                    <a href="/file/${item.path}" class="kb-card-wrapper history-card">
                      <article class="kb-card tone-${item.tone}" style="height: 160px;">
                        
                        <div class="kb-card__visual" style="padding: 12px;">
                           <div class="kb-card__tags">
                             <span class="badge soft">Resume</span>
                           </div>
                        </div>
                        
                        <div class="kb-card__content" style="padding: 12px;">
                          <h3 class="kb-card__title" style="font-size: 14px;">${item.title}</h3>
                          
                          <footer class="kb-card__footer" style="padding-top: 6px;">
                             <div class="meta-item" style="font-size: 10px;">
                                <i class="ph-bold ph-clock-counter-clockwise"></i> Recent
                             </div>
                          </footer>
                        </div>

                      </article>
                    </a>
                `
          )
          .join('');

        // --- History Toggle Logic (View/Hide) ---
        // Find any link that looks like a history toggle (by text content)
        const historyToggles = Array.from(document.querySelectorAll('a.section-link')).filter((a) =>
          /history/i.test(a.textContent || '')
        );

        const applyToggleState = (isOpen) => {
          if (!historySection) return;

          historyGrid.style.display = isOpen ? '' : 'none';

          historyToggles.forEach((btn) => {
            btn.setAttribute('aria-expanded', String(isOpen));
            btn.textContent = isOpen ? 'Hide History' : 'View History';
          });
        };

        // Default: Open
        applyToggleState(true);

        // Attach click listeners
        historyToggles.forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const isOpen = historyGrid.style.display !== 'none';
            applyToggleState(!isOpen);
          });
        });
      }
    }
  }
}

/**
 * Initializes the resizable handle logic for the Tools Panel (Desktop only).
 * - Aborts execution on mobile devices (viewport <= 768px) to prevent layout conflicts.
 * - Manages mouse drag events to dynamically update the `--tools-width` CSS variable.
 * - Enforces min/max width constraints and prevents text selection during resizing.
 */
export function initResizer() {
  if (window.innerWidth <= 768) return;

  const handle = document.getElementById('resizerHandle');
  const body = document.body;

  if (!handle) return;

  let isResizing = false;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;

    e.preventDefault();

    handle.classList.add('is-resizing');
    body.classList.add('is-resizing');

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
  });

  function handleMouseMove(e) {
    if (!isResizing) return;

    const newWidth = window.innerWidth - e.clientX;

    if (newWidth > 250 && newWidth < 800) {
      document.documentElement.style.setProperty('--tools-width', `${newWidth}px`);
    }
  }

  function stopResize() {
    isResizing = false;
    handle.classList.remove('is-resizing');
    body.classList.remove('is-resizing');
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResize);
  }
}
