import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { CONFIG } from './config.js';

// Apply stealth plugin to chromium
chromium.use(StealthPlugin());

/**
 * Opens a visible browser window for manual session warm-up.
 * The user should:
 *   1. Browse the Lazada store page normally
 *   2. Solve any CAPTCHA that appears
 *   3. Close the browser window when done
 *
 * The session (cookies, localStorage) is saved to CONFIG.SESSION_DIR
 * and will be reused by the headless scraper on subsequent runs.
 */
async function warmSession() {
  console.log('==================================================');
  console.log(' Session Warm-Up Mode');
  console.log('==================================================');
  console.log(`Session will be saved to: ${CONFIG.SESSION_DIR}`);
  console.log('');
  console.log('Instructions:');
  console.log('  1. A browser window will open shortly.');
  console.log('  2. Browse the Lazada store page normally.');
  console.log('  3. If a CAPTCHA appears, solve it manually.');
  console.log('  4. Click on 1-2 product pages to establish trust.');
  console.log('  5. Close the browser window when done.');
  console.log('');
  console.log('Starting browser...');

  const context = await chromium.launchPersistentContext(CONFIG.SESSION_DIR, {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--start-maximized'
    ],
    viewport: { width: 1366, height: 768 },
    userAgent: CONFIG.USER_AGENT,
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore'
  });

  const page = context.pages()[0] || await context.newPage();

  // Navigate to the target store page
  await page.goto(CONFIG.TARGET_URL, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });

  console.log('');
  console.log('[Warm-Up] Browser is open. Browse the site, solve any CAPTCHA, then close the browser window.');

  // Wait for the user to close the browser
  await new Promise((resolve) => {
    context.on('close', resolve);
  });

  console.log('[Warm-Up] Session saved successfully. You can now run the scraper with: npm start');
}

warmSession().catch((error) => {
  console.error('[Warm-Up Error]', error.message);
  process.exit(1);
});
