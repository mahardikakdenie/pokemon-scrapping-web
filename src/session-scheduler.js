import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { readSessionStatus } from './session-utils.js';
import { CONFIG } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Path to the session-refresh.js script that will be forked as a child process.
 */
const REFRESH_SCRIPT = path.join(__dirname, 'session-refresh.js');

/**
 * Interval between automatic session refresh cycles, in milliseconds.
 * Default: 3 hours (10,800,000 ms).
 * Can be overridden via environment variable SESSION_REFRESH_INTERVAL_HOURS.
 */
const REFRESH_INTERVAL_HOURS = parseFloat(process.env.SESSION_REFRESH_INTERVAL_HOURS || '3');
const REFRESH_INTERVAL_MS = REFRESH_INTERVAL_HOURS * 60 * 60 * 1000;

/**
 * Whether a refresh child process is currently running.
 * Prevents overlapping executions.
 */
let isRefreshing = false;

/**
 * Spawns session-refresh.js as a child process and waits for it to complete.
 * Prevents overlapping executions by checking the `isRefreshing` flag.
 */
function runRefresh() {
  if (isRefreshing) {
    console.log('[Scheduler] A refresh is already in progress. Skipping this cycle.');
    return;
  }

  isRefreshing = true;
  console.log(`\n[Scheduler] Starting session refresh at ${new Date().toISOString()}`);

  const child = fork(REFRESH_SCRIPT, [], {
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    isRefreshing = false;
    if (code === 0) {
      console.log('[Scheduler] Session refresh completed successfully.');
    } else {
      console.warn(`[Scheduler] Session refresh exited with code ${code}.`);
    }
    logNextSchedule();
  });

  child.on('error', (error) => {
    isRefreshing = false;
    console.error(`[Scheduler] Failed to start refresh process: ${error.message}`);
    logNextSchedule();
  });
}

/**
 * Logs the next scheduled refresh time to the console.
 */
function logNextSchedule() {
  const nextTime = new Date(Date.now() + REFRESH_INTERVAL_MS);
  console.log(`[Scheduler] Next refresh scheduled at: ${nextTime.toISOString()} (in ${REFRESH_INTERVAL_HOURS} hours)`);
}

// ─── Entry Point ────────────────────────────────────────────────────────────────

console.log('==================================================');
console.log(' Session Auto-Refresh Scheduler');
console.log('==================================================');
console.log(`  Refresh interval: every ${REFRESH_INTERVAL_HOURS} hour(s)`);
console.log(`  Refresh script: ${REFRESH_SCRIPT}`);
console.log('');

// Check current session status
const currentStatus = readSessionStatus();
if (currentStatus) {
  console.log(`  Last refresh: ${currentStatus.lastRefreshISO}`);
  console.log(`  Last status: ${currentStatus.status}`);
  console.log(`  Last message: ${currentStatus.message}`);
} else {
  console.log('  Last refresh: Never (no session_status.json found)');
}

console.log('');
console.log('[Scheduler] Running initial session refresh now...');

// Run an immediate refresh on startup
runRefresh();

// Schedule periodic refreshes
const intervalId = setInterval(runRefresh, REFRESH_INTERVAL_MS);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Scheduler] Received SIGINT. Shutting down scheduler...');
  clearInterval(intervalId);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Scheduler] Received SIGTERM. Shutting down scheduler...');
  clearInterval(intervalId);
  process.exit(0);
});

console.log('[Scheduler] Scheduler is running. Press Ctrl+C to stop.');
