import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { CONFIG } from './config.js';
import { writeSessionStatus, importCookiesFromJSON } from './session-utils.js';
import {
  randomDelay,
  readingPause,
  simulateMouseMovement,
  humanScroll,
  simulateRandomHover,
  performNoiseAction,
  simulatePageBrowsing,
  bezierMouseMove,
} from './human-behavior.js';

// Apply stealth plugin
chromium.use(StealthPlugin());

// ─── CAPTCHA Detection (duplicated from scraper.js to keep this file standalone) ─

/**
 * Checks whether the current page contains CAPTCHA or anti-bot verification elements.
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>}
 */
async function detectBlocker(page) {
  for (const selector of CONFIG.BLOCKER_SELECTORS) {
    const element = await page.$(selector);
    if (element) {
      const isVisible = await element.isVisible().catch(() => false);
      if (isVisible) return true;
    }
  }

  const currentUrl = page.url();
  if (
    currentUrl.includes('punish') ||
    currentUrl.includes('captcha') ||
    currentUrl.includes('x5step') ||
    currentUrl.includes('sec.taobao') ||
    currentUrl.includes('login')
  ) {
    return true;
  }

  return false;
}

// ─── Main Session Refresh Logic ─────────────────────────────────────────────────

/**
 * Performs a single session refresh cycle:
 * 1. Opens persistent browser context (headless: false, visible to user)
 * 2. Navigates to the Lazada store catalog page
 * 3. Simulates human-like browsing (scroll, hover, read)
 * 4. Clicks a random product link to visit a detail page
 * 5. Navigates back to catalog
 * 6. Checks for CAPTCHA at each stage
 * 7. Writes session status to data/session_status.json
 * 8. Closes the browser
 */
async function refreshSession() {
  console.log('==================================================');
  console.log(' Automatic Session Refresh');
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('==================================================');

  let context;

  try {
    // Step 1: Launch persistent browser context (visible window)
    console.log('[Refresh] Launching browser with saved session...');
    context = await chromium.launchPersistentContext(CONFIG.SESSION_DIR, {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--start-maximized',
      ],
      viewport: CONFIG.VIEWPORT,
      userAgent: CONFIG.USER_AGENT,
      locale: 'en-SG',
      timezoneId: 'Asia/Singapore',
    });

    // Inject cookies from cookies.json automatically before page navigation
    console.log('[Refresh] Injecting session cookies from cookies.json...');
    await importCookiesFromJSON(context);

    const page = context.pages()[0] || await context.newPage();

    // Step 2: Navigate to the store catalog page
    console.log('[Refresh] Navigating to Lazada store catalog...');
    await page.goto(CONFIG.TARGET_URL, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.TIMEOUT,
    });

    // Step 3: Simulate human browsing on the catalog page
    console.log('[Refresh] Simulating human browsing on catalog...');
    await simulatePageBrowsing(page, { scrollDistance: 2500, interactWithElements: true });

    // Step 4: Check for CAPTCHA on catalog page
    const catalogBlocked = await detectBlocker(page);
    if (catalogBlocked) {
      console.warn('[Refresh WARNING] CAPTCHA detected on catalog page!');
      console.warn('[Refresh WARNING] Please solve it manually in the browser window.');
      console.warn('[Refresh WARNING] Waiting 90 seconds for manual resolution...');

      // Wait 90 seconds for user to solve CAPTCHA manually
      await new Promise((resolve) => setTimeout(resolve, 90000));

      // Re-check after waiting
      const stillBlocked = await detectBlocker(page);
      if (stillBlocked) {
        console.error('[Refresh ERROR] CAPTCHA still present after wait period.');
        writeSessionStatus('captcha_detected', 'CAPTCHA was detected and not resolved within timeout.');
        return;
      }
    }

    // Step 5: Find and click a random product link
    console.log('[Refresh] Looking for a product link to click...');
    const productLinks = await page.$$('a[href*="/i"][href*=".html"], a[href*="lazada.sg/products"]');

    if (productLinks.length > 0) {
      const randomIndex = Math.floor(Math.random() * Math.min(productLinks.length, 10));
      const link = productLinks[randomIndex];
      const box = await link.boundingBox();

      if (box) {
        // Move to the link with human-like Bézier curve
        await bezierMouseMove(page, box.x + box.width / 2, box.y + box.height / 2);
        await randomDelay(500, 1200);

        // Click the product link
        console.log('[Refresh] Clicking on a product page...');
        await link.click();
        await page.waitForLoadState('domcontentloaded', { timeout: CONFIG.TIMEOUT }).catch(() => {});

        // Simulate browsing on the product detail page
        await simulatePageBrowsing(page, { scrollDistance: 1200, interactWithElements: true });

        // Check for CAPTCHA on product page
        const productBlocked = await detectBlocker(page);
        if (productBlocked) {
          console.warn('[Refresh WARNING] CAPTCHA detected on product page.');
          writeSessionStatus('captcha_detected', 'CAPTCHA detected on product detail page during refresh.');
          return;
        }

        // Navigate back to catalog
        console.log('[Refresh] Navigating back to catalog...');
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT }).catch(() => {});
        await randomDelay(2000, 4000);
      }
    } else {
      console.log('[Refresh] No product links found. Continuing with catalog-only refresh.');
    }

    // Step 6: Final human-like actions before closing
    await simulateMouseMovement(page);
    await readingPause();
    await performNoiseAction(page);

    // Step 7: Record successful refresh
    console.log('[Refresh] Session refreshed successfully.');
    writeSessionStatus('success', 'Session cookies refreshed via automated browsing.');

  } catch (error) {
    console.error(`[Refresh ERROR] ${error.message}`);
    writeSessionStatus('error', `Refresh failed: ${error.message}`);
  } finally {
    // Step 8: Close the browser
    if (context) {
      await context.close().catch(() => {});
    }
    console.log('[Refresh] Browser closed.');
  }
}

// ─── Entry Point ────────────────────────────────────────────────────────────────

refreshSession().then(() => {
  console.log('[Refresh] Process completed.');
  process.exit(0);
}).catch((error) => {
  console.error('[Refresh] Fatal error:', error.message);
  process.exit(1);
});
