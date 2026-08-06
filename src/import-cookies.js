import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { CONFIG } from './config.js';
import { importCookiesFromJSON, writeSessionStatus } from './session-utils.js';

// Apply stealth plugin
chromium.use(StealthPlugin());

/**
 * CLI runner script to inject cookies.json into the persistent browser context.
 */
async function runImport() {
  console.log('==================================================');
  console.log(' Importing cookies.json into Browser Session');
  console.log('==================================================');

  let context;
  try {
    context = await chromium.launchPersistentContext(CONFIG.SESSION_DIR, {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
      ],
      viewport: CONFIG.VIEWPORT,
      userAgent: CONFIG.USER_AGENT,
      locale: 'en-SG',
      timezoneId: 'Asia/Singapore',
    });

    const count = await importCookiesFromJSON(context);

    if (count > 0) {
      const page = context.pages()[0] || await context.newPage();
      console.log('[Import] Navigating to Lazada to verify authenticated session...');
      await page.goto(CONFIG.TARGET_URL, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
      
      writeSessionStatus('success', `Imported ${count} cookies from cookies.json`);
      console.log('[Import] Cookie injection complete and verified.');
    } else {
      console.error('[Import ERROR] No valid cookies were injected.');
      writeSessionStatus('error', 'Cookie import failed: no valid cookies found in cookies.json');
    }
  } catch (err) {
    console.error(`[Import ERROR] ${err.message}`);
    writeSessionStatus('error', `Cookie import failed: ${err.message}`);
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

runImport();
