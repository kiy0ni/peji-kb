/**
 * ==============================================================================
 * SERVICE: AUTHENTICATION TOKEN MANAGEMENT
 * ==============================================================================
 * @fileoverview Handles the lifecycle of authentication tokens (API Keys).
 * This module manages generation, hashing (SHA-256), storage, and retrieval
 * of API keys securely.
 *
 * @author Sacha Pastor
 * @environment Node.js
 * ==============================================================================
 */

// --- 1. CORE IMPORTS ---
import crypto from 'node:crypto';
import db from '../config/database.mjs';

// --- 2. MODULE EXPORTS ---

/**
 * Generates a cryptographically secure random API key.
 *
 * @returns {string} A 32-byte hexadecimal string (64 characters).
 */
export function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Attempts to retrieve an API key record by hashing the provided raw key.
 *
 * NOTE: Raw keys are never stored. We hash the input and compare it against
 * the stored SHA-256 hash in the database.
 *
 * @param {string} key - The raw API key provided by the client.
 * @returns {Object|null} The database record if found and active, otherwise null.
 */
export function findKeyRecord(key) {
  // 1. Validation
  if (!key) return null;

  const cleanedKey = String(key).trim();

  try {
    // 2. Hash the input key for lookup
    const hashedKey = crypto.createHash('sha256').update(cleanedKey).digest('hex');

    // 3. Query DB
    const record = db
      .prepare(
        `
            SELECT * FROM api_keys 
            WHERE key_sha256 = ? AND active = 1
        `
      )
      .get(hashedKey);

    return record || null;
  } catch (error) {
    // Suppress errors to prevent information leakage during auth attempts
    return null;
  }
}

/**
 * Creates and persists a new API key for a user.
 *
 * @param {number|string} userId - The ID of the owner.
 * @param {string} [label] - A user-friendly name for the key (e.g., "Development").
 * @param {string} [scopes] - Permission scopes (default: 'read:all write:self').
 * @returns {Object} An object containing the raw 'key' (to show once) and its 'prefix'.
 * @throws {Error} If the database insertion fails.
 */
export function insertApiKey(userId, label, scopes) {
  // 1. Generate Credential
  const rawKey = generateApiKey();

  // 2. Prepare Storage Data
  // - Hash the key for secure storage
  // - Extract the first 8 chars as a prefix for UI identification
  const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, 8);

  try {
    // 3. Persist to Database
    db.prepare(
      `
            INSERT INTO api_keys 
            (user_id, key_sha256, key_prefix, label, scopes, active, created_at) 
            VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        `
    ).run(userId, hashedKey, keyPrefix, label || null, scopes || 'read:all write:self');
  } catch (error) {
    console.error('[ApiKeyService] Insertion failed:', error);
    throw new Error('Failed to insert API key into database.');
  }

  // Return the raw key only once immediately after creation
  return { key: rawKey, prefix: keyPrefix };
}

/**
 * Retrieves the list of API keys associated with a user.
 *
 * NOTE: Includes a dynamic schema check to handle database versions where
 * the 'key_prefix' column might not exist yet (backward compatibility).
 *
 * @param {number|string} userId - The user ID to query.
 * @returns {Array<Object>} List of API key records (excluding sensitive hashes).
 */
export function apiKeysListForUser(userId) {
  try {
    // 1. Introspection: Check if 'key_prefix' column exists in the current schema
    const columns = db.prepare('PRAGMA table_info(api_keys)').all();
    const hasPrefixColumn = columns.some((col) => col.name === 'key_prefix');

    // 2. Construct Query based on Schema Availability
    let query;
    if (hasPrefixColumn) {
      query = `
                SELECT id, label, scopes, active, last_used, created_at, key_prefix 
                FROM api_keys 
                WHERE user_id = ?
            `;
    } else {
      query = `
                SELECT id, label, scopes, active, last_used, created_at 
                FROM api_keys 
                WHERE user_id = ?
            `;
    }

    return db.prepare(query).all(userId);
  } catch (error) {
    // Fallback: Safe default query if introspection fails
    return db
      .prepare(
        `
            SELECT id, label, scopes, active, last_used, created_at 
            FROM api_keys 
            WHERE user_id = ?
        `
      )
      .all(userId);
  }
}
