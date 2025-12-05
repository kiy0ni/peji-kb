/**
 * ==============================================================================
 * UTILITY: FILE SYSTEM EXPLORER
 * ==============================================================================
 * @fileoverview Helper module to interact with the local file system.
 * It provides functionality to scan directories recursively, build a structured
 * content tree (Folders/PDFs), and generate navigation aids like breadcrumbs.
 *
 * @author Sacha Pastor
 * @environment Node.js (ES Modules)
 * ==============================================================================
 */

// --- 1. CORE IMPORTS ---
import fs from 'node:fs';
import path from 'node:path';

// --- 2. MODULE EXPORTS ---

/**
 * Recursively scans a directory to build a structural tree of folders and PDF files.
 * Ignores hidden files (starting with '.').
 *
 * @param {string} rootAbsolute - The absolute system path to start scanning (e.g., /var/www/courses).
 * @param {string} rootRelative - The relative path identifier (default: 'courses').
 * @returns {Object} An object containing:
 * - tree: The full hierarchical structure (nested objects).
 * - categories: Array of top-level folder names (useful for navigation chips).
 * - flat: A flat array of all PDF files found (useful for search/indexing).
 */
export function scanCourses(rootAbsolute, rootRelative = 'courses') {
  // 1. Safety Check: Ensure the root directory exists before processing
  if (!fs.existsSync(rootAbsolute)) {
    console.warn(`[FileExplorer] Root path does not exist: ${rootAbsolute}`);
    return { tree: null, categories: [], flat: [] };
  }

  const flat = []; // Shared array to collect all file nodes during recursion

  /**
   * Internal recursive function to traverse directories.
   *
   * @param {string} currentAbs - Current absolute path on the OS.
   * @param {string} currentRel - Current relative path (URL-friendly).
   * @param {number} depth - Current nesting depth (0 = root).
   * @returns {Object} The directory node with its children.
   */
  function walk(currentAbs, currentRel, depth = 0) {
    let dirents;

    try {
      dirents = fs.readdirSync(currentAbs, { withFileTypes: true });
    } catch (err) {
      console.error(`[FileExplorer] Error reading directory ${currentAbs}:`, err);
      return {
        name: path.basename(currentAbs),
        path: currentRel,
        depth,
        type: 'directory',
        children: []
      };
    }

    const children = [];

    for (const d of dirents) {
      // SKIP: Hidden files/folders (e.g., .DS_Store, .git)
      if (d.name.startsWith('.')) continue;

      const abs = path.join(currentAbs, d.name);

      // NORMALIZE: Ensure path separators are forward slashes for URL consistency
      const rel = path.join(currentRel, d.name).replace(/\\/g, '/');

      // CASE 1: DIRECTORY
      if (d.isDirectory()) {
        // RECURSION: Dive deeper into sub-directories
        children.push(walk(abs, rel, depth + 1));

        // CASE 2: FILE
      } else if (d.isFile()) {
        // FILTER: Only process PDF files
        const ext = path.extname(d.name).toLowerCase();

        if (ext === '.pdf') {
          // Construct the file node object
          const courseNode = {
            name: d.name.replace(/\.pdf$/i, ''), // Remove extension for display title
            filename: d.name,
            path: rel,
            type: 'file',
            ext: 'pdf',
            // Extract categories from path segments (excluding root and filename)
            categories: rel.split('/').slice(1, -1)
          };

          // Add to lists: 'flat' for search index, 'children' for tree structure
          flat.push(courseNode);
          children.push(courseNode);
        }
      }
    }

    // Return the directory node with sorted children
    return {
      name: path.basename(currentAbs),
      path: currentRel,
      depth,
      type: 'directory',
      // SORT LOGIC: Folders first, then Files alphabetically
      children: children.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
    };
  }

  // 2. Execute Scan
  const tree = walk(rootAbsolute, rootRelative, 0);

  // 3. Post-Processing: Extract top-level categories
  // These are the direct children directories of the root folder (depth 1 in logic, direct children of root)
  const categories = (tree.children || [])
    .filter((c) => c.type === 'directory')
    .map((c) => ({ key: c.name, label: c.name, path: c.path }));

  return { tree, categories, flat };
}

/**
 * Generates a breadcrumb navigation array from a relative file path.
 * This helper transforms a raw path into a structured array for UI breadcrumbs.
 *
 * @param {string} relPath - The relative path (e.g., 'courses/dev/js/async/file.pdf').
 * @returns {Array<{name:string, path:string, isFile:boolean}>} Array of breadcrumb objects.
 */
export function buildBreadcrumbs(relPath) {
  if (!relPath) return [];

  // 1. Normalize path separators (Handle Windows backslashes)
  const safe = relPath.replace(/\\/g, '/');

  // 2. Split into segments and filter empty strings
  const segments = safe.split('/').filter(Boolean);

  // 3. Initialize with the Home/Root link
  const crumbs = [{ name: 'Home', path: '/', isFile: false }];
  let accum = '';

  // 4. Build path cumulatively
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Build cumulative path for the current segment
    // Logic handles the first segment preventing a double slash
    accum = i === 0 ? seg : `${accum}/${seg}`;

    const isLast = i === segments.length - 1;

    // Determine if the current segment is a PDF file
    // Condition: Ends in .pdf AND is the last segment in the path
    const isFile = /\.pdf$/i.test(seg) && isLast;

    // Generate specific URL based on type (Clean URL format)
    // - Files use the reader route: /file/...
    // - Folders use the browser route: /browse/...
    const url = isFile ? `/file/${accum}` : `/browse/${accum}`;

    crumbs.push({
      name: seg,
      path: url,
      isFile
    });
  }

  return crumbs;
}
