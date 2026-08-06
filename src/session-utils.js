import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Absolute path to the session status tracking file.
 * This file records when the session was last refreshed and its current state.
 */
const SESSION_STATUS_FILE = path.join(__dirname, '../data/session_status.json');

/**
 * Reads the current session status from disk.
 * Returns null if the file does not exist or cannot be parsed.
 *
 * @returns {{ lastRefreshISO: string, lastRefreshMs: number, status: string, message: string } | null}
 */
export function readSessionStatus() {
  try {
    if (fs.existsSync(SESSION_STATUS_FILE)) {
      const raw = fs.readFileSync(SESSION_STATUS_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {
    // File is corrupted or unreadable; treat as no status
  }
  return null;
}

/**
 * Writes session status metadata to disk.
 * Creates the parent directory if it does not exist.
 *
 * @param {'success' | 'captcha_detected' | 'error'} status - The outcome of the refresh attempt
 * @param {string} message - A human-readable description of what happened
 */
export function writeSessionStatus(status, message) {
  const dir = path.dirname(SESSION_STATUS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const data = {
    lastRefreshISO: new Date().toISOString(),
    lastRefreshMs: Date.now(),
    status,
    message,
  };

  fs.writeFileSync(SESSION_STATUS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Calculates how many hours have elapsed since the last successful session refresh.
 * Returns Infinity if no previous session status exists or if the last status was not 'success'.
 *
 * @returns {number} Hours since last successful refresh
 */
export function getSessionAgeHours() {
  const status = readSessionStatus();
  if (!status || status.status !== 'success') {
    return Infinity;
  }
  const elapsedMs = Date.now() - status.lastRefreshMs;
  return elapsedMs / (1000 * 60 * 60);
}

/**
 * Sanitizes and loads cookies from JSON file into a Playwright BrowserContext.
 * Handles format conversion from Chrome/Firefox cookie exports to Playwright schema.
 *
 * @param {import('playwright').BrowserContext} context - Active Playwright context
 * @param {string} [filePath] - Optional custom path to cookies JSON file
 * @returns {Promise<number>} Count of successfully injected cookies
 */
export async function importCookiesFromJSON(context, filePath) {
  const defaultPath = path.join(__dirname, '../cookies.json');
  const targetPath = filePath || defaultPath;

  if (!fs.existsSync(targetPath)) {
    console.warn(`[Cookie Import] File not found at: ${targetPath}`);
    return 0;
  }

  const rawData = fs.readFileSync(targetPath, 'utf-8');
  const rawCookies = JSON.parse(rawData);

  if (!Array.isArray(rawCookies) || rawCookies.length === 0) {
    console.warn('[Cookie Import] Cookie JSON file is empty or invalid array format.');
    return 0;
  }

  const sanitizedCookies = rawCookies.map((cookie) => {
    const sanitized = {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
    };

    // Map expirationDate (seconds) to Playwright expires field
    if (cookie.expirationDate && typeof cookie.expirationDate === 'number') {
      sanitized.expires = Math.floor(cookie.expirationDate);
    } else if (cookie.expires && typeof cookie.expires === 'number') {
      sanitized.expires = Math.floor(cookie.expires);
    }

    // Map SameSite attribute to Playwright allowed enum values ('Strict' | 'Lax' | 'None')
    if (cookie.sameSite) {
      const lower = String(cookie.sameSite).toLowerCase();
      if (lower === 'no_restriction' || lower === 'none') {
        sanitized.sameSite = 'None';
      } else if (lower === 'lax') {
        sanitized.sameSite = 'Lax';
      } else if (lower === 'strict') {
        sanitized.sameSite = 'Strict';
      }
    }

    return sanitized;
  });

  await context.addCookies(sanitizedCookies);
  console.log(`[Cookie Import] Successfully injected ${sanitizedCookies.length} cookies into browser context.`);
  return sanitizedCookies.length;
}

