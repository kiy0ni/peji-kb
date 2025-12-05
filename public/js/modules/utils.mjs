/**
 * ==============================================================================
 * UTILITY: SHARED HELPER FUNCTIONS
 * ==============================================================================
 * @fileoverview A collection of agnostic utility functions used throughout the
 * client-side application.
 * * @author Sacha Pastor
 * @environment Browser (Client-side JS)
 * ==============================================================================
 */

/**
 * Creates a debounced version of a function.
 * Delays the execution of the function until after 'wait' milliseconds have elapsed
 * since the last time the debounced function was invoked.
 * * Useful for performance optimization on events like window resize or keypress.
 *
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The delay in milliseconds before execution.
 * @returns {Function} A new function that wraps the original with the delay logic.
 */
export function debounce(func, wait) {
  let timeout;

  return function executedFunction(...args) {
    // Define the delayed execution logic
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    // Clear any existing timer to reset the cooldown
    clearTimeout(timeout);

    // Restart the timer
    timeout = setTimeout(later, wait);
  };
}

/**
 * ==============================================================================
 * HTTP UTILITIES
 * ==============================================================================
 */

/**
 * Internal Helper: Retrieves the CSRF token from the DOM.
 * It attempts to find the token in a meta tag first, then falls back to a hidden form input.
 * * @returns {string|null} The CSRF token string if found, otherwise null.
 * @private
 */
function _getCsrfToken() {
  // Attempt 1: Get from <meta name="_csrf" ...> (Standard approach)
  const meta = document.querySelector('meta[name="_csrf"]');
  if (meta) return meta.getAttribute('content'); // Changed to getAttribute for consistency

  // Attempt 2: Get from <input name="_csrf" ...> (Fallback for legacy forms)
  const input = document.querySelector('input[name="_csrf"]');
  if (input) return input.value;

  return null;
}

/**
 * Wrapper to send JSON POST requests via the Fetch API or Beacon API.
 * Automatically handles JSON serialization, Content-Type headers, and CSRF injection.
 *
 * @param {string} url - The endpoint URL.
 * @param {Object} data - The JavaScript object to serialize and send.
 * @param {Object} [options] - Configuration options.
 * @param {boolean} [options.beacon=false] - If true, attempts to use navigator.sendBeacon (ideal for page unload).
 * @param {AbortSignal} [options.signal=null] - Signal object to allow request cancellation.
 * @returns {Promise<Response|void>} The Fetch Promise, or a resolved Promise if Beacon is used.
 */
export function postJSON(url, data, { beacon = false, signal = null } = {}) {
  // 1. BEACON STRATEGY (Analytics / Page Unload)
  // If enabled and supported, send data asynchronously without blocking the thread.
  // This is "fire-and-forget", so we return a resolved promise immediately.
  try {
    if (beacon && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return Promise.resolve();
    }
  } catch (error) {
    // If Beacon fails, fall through to standard Fetch
    console.warn('[Utils] Beacon failed, falling back to Fetch:', error);
  }

  // 2. FETCH STRATEGY (Standard AJAX)

  // Prepare Headers
  const headers = {
    'Content-Type': 'application/json'
  };

  // Inject CSRF Token (Security Requirement)
  const csrfToken = _getCsrfToken();
  if (csrfToken) {
    // NOTE: The server coreMiddleware looks for 'X-CSRF-Token'
    headers['X-CSRF-Token'] = csrfToken;
  } else {
    console.debug('[Utils] Warning: No CSRF token found in DOM.');
  }

  // Execute Request
  return fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(data),

    // CRITICAL: 'same-origin' ensures Session Cookies are sent with the request.
    // Without this, the server won't recognize the user session.
    credentials: 'same-origin',

    // Allow the caller to cancel this request (e.g., if the user navigates away)
    signal: signal
  });
}
