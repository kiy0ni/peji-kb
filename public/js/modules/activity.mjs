/**
 * ==============================================================================
 * MODULE: ACTIVITY TELEMETRY
 * ==============================================================================
 * @fileoverview Manages user activity tracking (Analytics).
 * It handles the lifecycle of user sessions (Site-wide and Document-specific)
 * by sending 'start', 'ping', and 'stop' signals to the backend API.
 *
 * @author Sacha Pastor
 * @environment Browser (Client-side JS)
 * @dependencies utils.mjs
 * ==============================================================================
 */

// --- 1. IMPORTS ---
import { postJSON } from './utils.mjs';

// --- 2. CONFIGURATION ---
const HEARTBEAT_INTERVAL_MS = 15000; // 15 Seconds

/**
 * ==============================================================================
 * 3. INTERNAL HELPERS
 * ==============================================================================
 */

/**
 * Starts a telemetry session with a heartbeat mechanism.
 * Handles the "Start -> Ping -> Stop" lifecycle.
 *
 * @param {string} endpoint - The API URL to send data to.
 * @param {Object} payload - The data payload (e.g., path or route).
 * @param {boolean} [requireVisibility=false] - If true, pings are only sent when the tab is visible.
 */
function startSessionHeartbeat(endpoint, payload, requireVisibility = false) {
  // 1. SEND START SIGNAL
  // We catch errors silently to avoid disrupting the user experience with console noise
  // for non-critical telemetry failures.
  postJSON(endpoint, { ...payload, action: 'start' }).catch(() => {});

  // 2. START HEARTBEAT (PING)
  const timerId = setInterval(() => {
    // Optimization: For reading sessions, we only count time if the user is actually looking at the tab.
    if (requireVisibility && document.visibilityState !== 'visible') {
      return;
    }
    postJSON(endpoint, { ...payload, action: 'ping' }).catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);

  // 3. DEFINE STOP LOGIC
  const terminateSession = () => {
    // Stop the heartbeat to prevent memory leaks or unnecessary requests
    try {
      clearInterval(timerId);
    } catch (_) {}

    // Send the final 'stop' signal using Beacon API (via utils options)
    // Beacon is critical here ensures the request is sent even if the tab is closing.
    postJSON(endpoint, { ...payload, action: 'stop' }, { beacon: true });
  };

  // 4. BIND TERMINATION EVENTS
  // Trigger stop when the user navigates away or closes the tab
  window.addEventListener('pagehide', terminateSession);

  // Trigger stop when the user switches tabs/minimizes (Strict tracking)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      terminateSession();
    }
  });
}

/**
 * ==============================================================================
 * 4. MODULE INITIALIZATION
 * ==============================================================================
 */

/**
 * Initializes all tracking subsystems.
 * - Global Site Session: Tracks general usage and navigation.
 * - Reading Session: Tracks time spent specifically on document pages.
 */
export function initActivityTracking() {
  // Detect context
  const metaPathInput = document.getElementById('meta-path');
  const isFilePage = !!metaPathInput;

  // --- A. GLOBAL SITE TRACKING ---
  // Tracks which route the user is currently visiting.
  const currentRoute = window.location.pathname + window.location.search;

  startSessionHeartbeat(
    '/api/v1/activity/site',
    { route: currentRoute },
    false // Site tracking continues even in background (until hidden/stopped)
  );

  // --- B. READING SESSION TRACKING ---
  // Only active when the user is viewing a specific file (Reader Mode).
  if (isFilePage && metaPathInput.value) {
    startSessionHeartbeat(
      '/api/v1/activity/reading',
      { path: metaPathInput.value },
      true // Reading tracking requires the tab to be visible (Active reading)
    );
  }
}
