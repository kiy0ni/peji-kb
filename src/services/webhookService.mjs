/**
 * ==============================================================================
 * SERVICE: WEBHOOK MANAGER
 * ==============================================================================
 * @fileoverview Manages the lifecycle of webhooks: dispatching events to users
 * and handling background retries for failed deliveries.
 *
 * @author Sacha Pastor
 * @environment Node.js
 * ==============================================================================
 */

// --- 1. IMPORTS ---
import crypto from 'node:crypto';
import db from '../config/database.mjs';

// --- 2. CONFIGURATION CONSTANTS ---
const RETRY_INTERVAL_MS = 15_000; // 15 seconds
const MAX_RETRY_ATTEMPTS = 5;
const BATCH_SIZE = 10;

/**
 * Generates a HMAC SHA256 signature to verify payload integrity.
 * Structure: sha256(timestamp + "." + body)
 *
 * @param {string} secret - The shared secret key for the webhook.
 * @param {number} timestamp - The current timestamp (ms).
 * @param {string} body - The raw JSON string body.
 * @returns {string} The hex-encoded signature.
 */
function signWebhook(secret, timestamp, body) {
  const h = crypto.createHmac('sha256', secret);
  h.update(String(timestamp));
  h.update('.');
  h.update(body);
  return h.digest('hex');
}

/**
 * Dispatches a specific event to all active webhooks registered by a user.
 *
 * NOTE: This function uses a "fire-and-forget" strategy. It triggers the HTTP
 * requests asynchronously without waiting for them to complete, ensuring the
 * main application thread remains responsive.
 *
 * @param {number|string} userId - The ID of the user triggering the event.
 * @param {string} event - The name of the event (e.g., 'course.created').
 * @param {Object} payloadObj - The data payload to send.
 */
export async function dispatchWebhook(userId, event, payloadObj) {
  // 1. Prepare Payload
  const payload = JSON.stringify({ event, data: payloadObj });

  // 2. Fetch Active Targets
  const hooks = db.prepare('SELECT * FROM webhooks WHERE user_id = ? AND active = 1').all(userId);

  // 3. Process Dispatch (Fire-and-Forget)
  // We use forEach here specifically to avoid 'await' blocking the loop.
  hooks.forEach(async (hook) => {
    const timestamp = Date.now();
    const signature = signWebhook(hook.secret, timestamp, payload);

    try {
      // A. Attempt Delivery
      await fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Timestamp': String(timestamp),
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event
        },
        body: payload
      });

      // B. Log Success (Delivered immediately)
      db.prepare(
        `
                INSERT INTO webhook_events 
                (user_id, event, payload, created_at, delivered_at, attempts) 
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
            `
      ).run(userId, event, payload);
    } catch (e) {
      // C. Log Failure (To be picked up by the retry worker)
      // Note: 'delivered_at' is left NULL
      db.prepare(
        `
                INSERT INTO webhook_events 
                (user_id, event, payload, created_at, attempts) 
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1)
            `
      ).run(userId, event, payload);
    }
  });
}

/**
 * Starts the background worker process.
 * This worker periodically checks the database for failed webhook attempts
 * and retries them up to a maximum threshold.
 */
export function startWebhookWorker() {
  setInterval(async () => {
    try {
      // 1. Fetch Failed Events
      // Criteria: Not delivered yet, Active webhook, Attempts < Limit
      const query = `
                SELECT 
                    we.id, we.user_id, we.event, we.payload, 
                    w.url, w.secret
                FROM webhook_events we
                JOIN webhooks w ON w.user_id = we.user_id
                WHERE we.delivered_at IS NULL 
                  AND w.active = 1 
                  AND we.attempts < ?
                ORDER BY we.created_at ASC 
                LIMIT ?
            `;

      const undelivered = db.prepare(query).all(MAX_RETRY_ATTEMPTS, BATCH_SIZE);

      // 2. Process Retries
      for (const row of undelivered) {
        const timestamp = Date.now();
        const signature = signWebhook(row.secret, timestamp, row.payload);

        try {
          // A. Retry Delivery
          await fetch(row.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Timestamp': String(timestamp),
              'X-Webhook-Signature': signature,
              'X-Webhook-Event': row.event
            },
            body: row.payload
          });

          // B. Mark as Delivered on Success
          db.prepare(
            `
                        UPDATE webhook_events 
                        SET delivered_at = CURRENT_TIMESTAMP, 
                            attempts = attempts + 1 
                        WHERE id = ?
                    `
          ).run(row.id);
        } catch (err) {
          // C. Increment Attempts on Failure
          // The worker will pick this up again in the next cycle if attempts < MAX
          db.prepare(
            `
                        UPDATE webhook_events 
                        SET attempts = attempts + 1 
                        WHERE id = ?
                    `
          ).run(row.id);
        }
      }
    } catch (workerError) {
      // Prevent worker crash on unexpected DB errors
      console.error('[WebhookWorker] Critical Error:', workerError);
    }
  }, RETRY_INTERVAL_MS);

  console.log(`[System] Webhook background worker started (Interval: ${RETRY_INTERVAL_MS}ms).`);
}
