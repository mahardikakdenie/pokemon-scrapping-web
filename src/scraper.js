import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import { CONFIG } from './config.js';
import {
  randomDelay,
  simulateMouseMovement,
  humanScroll,
  simulateRandomHover
} from './human-behavior.js';

// ─── Apply Stealth Plugin ──────────────────────────────────────────────────────
chromium.use(StealthPlugin());

// ─── CAPTCHA / Blocker Detection ───────────────────────────────────────────────

/**
 * Checks whether the current page contains CAPTCHA or Anti-Bot verification elements.
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>}
 */
async function detectBlocker(page) {
  // Check DOM selectors for known CAPTCHA/blocker elements
  for (const selector of CONFIG.BLOCKER_SELECTORS) {
    const element = await page.$(selector);
    if (element) {
      const isVisible = await element.isVisible().catch(() => false);
      if (isVisible) return true;
    }
  }

  // Check URL signatures for verification redirects
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

// ─── Product Detail Page Scraping (Single-Tab Reuse) ───────────────────────────

/**
 * Navigates to a product detail page using an existing page (tab reuse),
 * extracts stock information, and retries with exponential backoff if CAPTCHA is detected.
 *
 * @param {import('playwright').Page} page - The shared page instance to reuse
 * @param {string} productUrl - The URL of the product detail page
 * @returns {Promise<{stockStatus: string, stockQuantity: string}>}
 */
async function scrapeProductDetailPage(page, productUrl) {
  let lastError = null;

  for (let attempt = 1; attempt <= CONFIG.MAX_CAPTCHA_RETRIES; attempt++) {
    try {
      console.log(`[Scraper] Visiting detail page (attempt ${attempt}/${CONFIG.MAX_CAPTCHA_RETRIES}): ${productUrl}`);

      // Navigate to the product detail page
      await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });

      // Simulate human behavior: wait, move mouse, scroll a bit
      await randomDelay(2000, 4000);
      await simulateMouseMovement(page);
      await humanScroll(page, 800);
      await randomDelay(1000, 2000);

      // Check for CAPTCHA blocker
      const isBlocked = await detectBlocker(page);
      if (isBlocked) {
        const backoffMs = CONFIG.CAPTCHA_BACKOFF_BASE_MS * Math.pow(CONFIG.CAPTCHA_BACKOFF_MULTIPLIER, attempt - 1);
        console.warn(`[Scraper WARNING] CAPTCHA detected on attempt ${attempt}. Waiting ${backoffMs / 1000}s before retry...`);

        if (attempt < CONFIG.MAX_CAPTCHA_RETRIES) {
          await randomDelay(backoffMs, backoffMs + 5000);
          continue; // Retry
        } else {
          console.warn(`[Scraper WARNING] All ${CONFIG.MAX_CAPTCHA_RETRIES} attempts exhausted for: ${productUrl}`);
          return { stockStatus: 'Blocker Encountered', stockQuantity: 'N/A' };
        }
      }

      // No CAPTCHA detected — extract stock information from the product page DOM
      const stockInfo = await page.evaluate(() => {
        // Common Lazada product detail selectors for quantity & stock status
        const quantityEl = document.querySelector(
          '.quantity-content, .pdp-mod-product-item-quantity, .quantity-selector input, .module_quantity'
        );
        const outOfStockBtn = document.querySelector(
          '.add-to-cart-buy-now-btn .pdp-button_state_disabled, .out-of-stock-btn, button[disabled]'
        );
        const stockTextEl = document.querySelector(
          '.quantity-content-warning, .pdp-seller-stock, .stock-status-text'
        );

        let stockQuantity = 'Available';
        let stockStatus = 'In Stock';

        if (outOfStockBtn) {
          stockStatus = 'Out of Stock';
          stockQuantity = '0';
        } else if (stockTextEl) {
          stockQuantity = stockTextEl.textContent.trim();
        } else if (quantityEl) {
          const val = quantityEl.getAttribute('value') || quantityEl.textContent.trim();
          if (val) stockQuantity = `Qty: ${val}`;
        }

        return { stockStatus, stockQuantity };
      });

      return stockInfo;

    } catch (error) {
      lastError = error;
      console.error(`[Scraper Error] Attempt ${attempt} failed for ${productUrl}: ${error.message}`);

      if (attempt < CONFIG.MAX_CAPTCHA_RETRIES) {
        const backoffMs = CONFIG.CAPTCHA_BACKOFF_BASE_MS * Math.pow(CONFIG.CAPTCHA_BACKOFF_MULTIPLIER, attempt - 1);
        await randomDelay(backoffMs, backoffMs + 3000);
      }
    }
  }

  console.error(`[Scraper Error] All retries exhausted for ${productUrl}:`, lastError?.message);
  return { stockStatus: 'Unknown Error', stockQuantity: 'N/A' };
}

// ─── Comprehensive Anti-Fingerprint Init Script ────────────────────────────────

/**
 * Returns a JavaScript string to inject into every page via addInitScript().
 * This patches multiple browser APIs that anti-bot systems inspect.
 * @returns {string}
 */
function getAntiDetectionScript() {
  return `
    // --- Patch navigator.webdriver ---
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // --- Patch navigator.plugins (headless Chrome has empty plugins array) ---
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
        ];
        plugins.refresh = () => {};
        return plugins;
      }
    });

    // --- Patch navigator.languages ---
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en', 'zh-CN']
    });

    // --- Patch chrome.runtime (missing in headless) ---
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) {
      window.chrome.runtime = {
        connect: () => {},
        sendMessage: () => {}
      };
    }

    // --- Patch permissions query (notifications) ---
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission });
      }
      return originalQuery(parameters);
    };

    // --- Patch WebGL vendor/renderer (headless exposes "Google SwiftShader") ---
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
      if (param === 37445) return 'Intel Inc.';           // UNMASKED_VENDOR_WEBGL
      if (param === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
      return getParameter.call(this, param);
    };
  `;
}

// ─── Main Scraper Function ─────────────────────────────────────────────────────

/**
 * Scrapes product listings from the target Lazada Singapore store URL.
 * Uses stealth plugin, persistent session, human-like behavior, and CAPTCHA retry.
 *
 * @returns {Promise<Array<{id: string, title: string, price: string, originalPrice: string, stockStatus: string, stockQuantity: string, url: string, scrapedAt: string}>>}
 */
export async function scrapeLazadaProducts() {
  console.log('[Scraper] Initializing stealth browser session...');

  // Determine whether to use persistent context (if session directory exists)
  const sessionExists = fs.existsSync(CONFIG.SESSION_DIR);
  if (sessionExists) {
    console.log(`[Scraper] Reusing saved browser session from: ${CONFIG.SESSION_DIR}`);
  } else {
    console.log('[Scraper] No saved session found. Starting fresh. Consider running: npm run warm-session');
  }

  // Launch persistent context with stealth evasion
  const context = await chromium.launchPersistentContext(CONFIG.SESSION_DIR, {
    headless: CONFIG.HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
      '--disable-features=BlockInsecurePrivateNetworkRequests'
    ],
    viewport: { width: 1366, height: 768 },
    userAgent: CONFIG.USER_AGENT,
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore',
    ignoreHTTPSErrors: true
  });

  // Inject comprehensive anti-fingerprint script into all pages
  await context.addInitScript(getAntiDetectionScript());

  const page = context.pages()[0] || await context.newPage();

  try {
    // ─── Step 1: Navigate to the store catalog page ─────────────────────
    console.log(`[Scraper] Navigating to store catalog: ${CONFIG.TARGET_URL}`);
    await page.goto(CONFIG.TARGET_URL, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });

    // Simulate human behavior on catalog page
    await randomDelay(3000, 5000);
    await simulateMouseMovement(page);
    await randomDelay(1000, 2000);

    // ─── Step 2: Detect CAPTCHA on main catalog page ────────────────────
    const isBlocked = await detectBlocker(page);
    if (isBlocked) {
      console.warn('====================================================');
      console.warn('[Scraper WARNING] CAPTCHA / Anti-Bot Blocker Detected on catalog page!');
      console.warn('[Scraper WARNING] Run "npm run warm-session" to solve CAPTCHA manually first.');
      console.warn('====================================================');
      throw new Error('BLOCKER_DETECTED: CAPTCHA page encountered during navigation.');
    }

    // ─── Step 3: Human-like scrolling to trigger lazy-loaded products ───
    console.log('[Scraper] Performing human-like scroll to load products...');
    await humanScroll(page, 3500);
    await randomDelay(2000, 3000);
    await simulateRandomHover(page);
    await randomDelay(1000, 2000);

    // ─── Step 4: Extract product catalog ────────────────────────────────
    console.log('[Scraper] Extracting product catalog items...');
    const rawProducts = await page.evaluate(() => {
      const items = [];
      const cards = document.querySelectorAll(
        'div.Bm3ON, [data-qa-locator="product-item"], .HpScContainer .card-jss, .jss_card, div[data-tracking="product-card"]'
      );

      cards.forEach((card, index) => {
        const titleEl = card.querySelector('.RfADt, a[title], .jss_title, [data-qa-locator="product-item-title"], .card-title');
        const priceEl = card.querySelector('.ooOxS, .price, .jss_price, [data-qa-locator="product-item-price"], .space-first');
        const originalPriceEl = card.querySelector('.y3KeL, .original-price, .jss_original_price, .del');
        const linkEl = card.querySelector('a[href]');

        const title = titleEl ? titleEl.textContent.trim() : `Product ${index + 1}`;
        const price = priceEl ? priceEl.textContent.trim() : 'N/A';
        const originalPrice = originalPriceEl ? originalPriceEl.textContent.trim() : price;
        const rawLink = linkEl ? linkEl.getAttribute('href') : '';
        const fullUrl = rawLink.startsWith('http') ? rawLink : `https:${rawLink}`;
        const id = btoa(unescape(encodeURIComponent(title))).substring(0, 16);

        items.push({
          id,
          title,
          price,
          originalPrice,
          url: fullUrl,
          scrapedAt: new Date().toISOString()
        });
      });

      return items;
    });

    console.log(`[Scraper] Found ${rawProducts.length} catalog items. Starting detail page visits...`);

    // ─── Step 5: Visit each product detail page (single-tab reuse) ──────
    const detailedProducts = [];

    // Open a dedicated detail page (reuse this single tab for all products)
    const detailPage = await context.newPage();
    await context.addInitScript(getAntiDetectionScript());

    for (let i = 0; i < rawProducts.length; i++) {
      const item = rawProducts[i];
      console.log(`[Scraper] Processing product [${i + 1}/${rawProducts.length}]: ${item.title}`);

      let stockDetails = { stockStatus: 'In Stock', stockQuantity: 'Available' };

      if (item.url && item.url.startsWith('http')) {
        stockDetails = await scrapeProductDetailPage(detailPage, item.url);

        // Human-like delay between product page visits
        await randomDelay(CONFIG.PAGE_VISIT_MIN_DELAY, CONFIG.PAGE_VISIT_MAX_DELAY);
      }

      detailedProducts.push({
        ...item,
        stockStatus: stockDetails.stockStatus,
        stockQuantity: stockDetails.stockQuantity
      });
    }

    // Close the detail page tab
    await detailPage.close().catch(() => {});

    console.log(`[Scraper] Completed detail page visits for ${detailedProducts.length} product(s).`);
    return detailedProducts;

  } catch (error) {
    if (error.message.includes('BLOCKER_DETECTED')) {
      console.error('[Scraper Error] Session aborted due to anti-bot challenge.');
    } else {
      console.error('[Scraper Error] Runtime error:', error.message);
    }
    throw error;
  } finally {
    await context.close().catch(() => {});
    console.log('[Scraper] Browser session closed cleanly.');
  }
}
