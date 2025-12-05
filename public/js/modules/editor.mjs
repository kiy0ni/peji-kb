/**
 * ==============================================================================
 * MODULE: MARKDOWN EDITOR
 * ==============================================================================
 * @fileoverview Manages the initialization and configuration of the client-side
 * WYSIWYG Markdown editor (EasyMDE).
 *
 * @author Sacha Pastor
 * @environment Browser (Client-side JS)
 * @dependencies EasyMDE (Global or Imported)
 * ==============================================================================
 */

/**
 * Configuration for the Editor Toolbar.
 * Defines the buttons, their associated actions, and the custom icons (Phosphor).
 * Organized by groups: Formatting | Lists | Utilities.
 * @constant {Array<Object|string>}
 */
const TOOLBAR_CONFIG = [
    // --- Group 1: Text Formatting ---
    {
        name: "bold",
        action: EasyMDE.toggleBold,
        className: "ph ph-text-bolder",
        title: "Bold"
    },
    {
        name: "italic",
        action: EasyMDE.toggleItalic,
        className: "ph ph-text-italic",
        title: "Italic"
    },
    {
        name: "heading",
        action: EasyMDE.toggleHeadingSmaller,
        className: "ph ph-text-h",
        title: "Heading"
    },
    "|", // Separator

    // --- Group 2: Lists & Quotes ---
    {
        name: "quote",
        action: EasyMDE.toggleBlockquote,
        className: "ph ph-quotes",
        title: "Blockquote"
    },
    {
        name: "unordered-list",
        action: EasyMDE.toggleUnorderedList,
        className: "ph ph-list-bullets",
        title: "Bulleted List"
    },
    {
        name: "ordered-list",
        action: EasyMDE.toggleOrderedList,
        className: "ph ph-list-numbers",
        title: "Numbered List"
    },
    "|", // Separator

    // --- Group 3: Utilities ---
    {
        name: "link",
        action: EasyMDE.drawLink,
        className: "ph ph-link-simple",
        title: "Insert Link"
    },
    {
        name: "preview",
        action: EasyMDE.togglePreview,
        className: "no-disable ph ph-eye",
        title: "Preview"
    }
];

/**
 * Initializes the Markdown Editor on the target text area.
 * Checks if the DOM element exists before attempting initialization to avoid errors
 * on pages where the editor is not required.
 *
 * @returns {EasyMDE|null} The initialized editor instance, or null if the target element is missing.
 */
export function initEditor() {
    // 1. Target Element Retrieval
    const noteInputElement = document.getElementById('noteInput');

    // 2. Guard Clause: Exit if element does not exist
    if (!noteInputElement) {
        return null;
    }

    // 3. Editor Initialization
    return new EasyMDE({
        element: noteInputElement,
        placeholder: "Write your notes here... (Markdown supported)",
        minHeight: "100%",

        // Behavior Configuration
        spellChecker: false, // Disabled to prevent browser conflict or performance issues
        status: false,       // Hides the bottom status bar (word count, cursor pos)

        // Asset Configuration
        // We disable auto-download because we use local Phosphor icons instead of FontAwesome
        autoDownloadFontAwesome: false,

        // UI Configuration
        toolbar: TOOLBAR_CONFIG
    });
}