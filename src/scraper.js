import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import { CONFIG } from './config.js';
import { randomDelay } from './human-behavior.js';
import { importCookiesFromJSON } from './session-utils.js';

// Apply Stealth Plugin
chromium.use(StealthPlugin());

/**
 * Checks whether the current page contains CAPTCHA or Anti-Bot verification elements.
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
    currentUrl.includes('sec.taobao')
  ) {
    return true;
  }

  return false;
}

/**
 * Fetches all store products across all paginated pages using Lazada's network API (`ajax=true`).
 */
export async function scrapeLazadaProductsViaAPI() {
  console.log('[Scraper] Launching persistent browser context for API scraping...');

  const context = await chromium.launchPersistentContext(CONFIG.SESSION_DIR, {
    headless: CONFIG.HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security'
    ],
    viewport: CONFIG.VIEWPORT,
    userAgent: CONFIG.USER_AGENT,
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore',
    ignoreHTTPSErrors: true
  });

  // Inject cookies from cookies.json automatically on startup
  console.log('[Scraper] Automatically injecting session cookies...');
  await importCookiesFromJSON(context);

  const page = context.pages()[0] || await context.newPage();
  const allProducts = [];
  let currentPage = 1;
  let hasMorePages = true;

  try {
    // Step 1: Warmup session cookies by navigating to the main target store URL
    console.log(`[Scraper] Navigating to target store URL: ${CONFIG.TARGET_URL}`);
    await page.goto(CONFIG.TARGET_URL, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });

    // Step 2: Verify no CAPTCHA blocker on initial page load
    const isBlocked = await detectBlocker(page);
    if (isBlocked) {
      throw new Error('BLOCKER_DETECTED: CAPTCHA / Anti-Bot challenge encountered on store page.');
    }

    await randomDelay(2000, 4000);

    // Step 3: Fetch API paginated items in-browser
    while (hasMorePages && currentPage <= CONFIG.MAX_API_PAGES) {
      const apiUrl = `https://www.lazada.sg/pokemon-store-online-singapore/?ajax=true&from=wangpu&hideSectionHeader=true&isFirstRequest=${currentPage === 1}&page=${currentPage}&q=All-Products&sc=KVUG&search_scenario=store&service=store_sections&shopId=${CONFIG.SHOP_ID}&shop_category_ids=${CONFIG.SHOP_CATEGORY_ID}&src=store_sections`;

      console.log(`[Scraper] Fetching API page ${currentPage}: ${apiUrl}`);

      const apiData = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url, {
            headers: {
              'Accept': 'application/json, text/plain, */*',
              'X-Requested-With': 'XMLHttpRequest'
            }
          });
          if (!res.ok) return null;
          return await res.json();
        } catch (err) {
          return null;
        }
      }, apiUrl);

      if (!apiData || !apiData.mods || !apiData.mods.listItems || apiData.mods.listItems.length === 0) {
        console.log(`[Scraper] No products found on API page ${currentPage}. Ending pagination.`);
        hasMorePages = false;
        break;
      }

      const rawItems = apiData.mods.listItems;
      console.log(`[Scraper] Retrieved ${rawItems.length} products from API page ${currentPage}.`);

      for (const item of rawItems) {
        const fullUrl = item.itemUrl.startsWith('http') ? item.itemUrl : `https:${item.itemUrl}`;
        const isInStock = item.inStock === true;

        allProducts.push({
          id: item.itemId || item.nid || `prod-${allProducts.length + 1}`,
          title: item.name,
          price: item.priceShow || `$${item.price}`,
          originalPrice: item.originalPriceShow || item.priceShow || `$${item.price}`,
          stockStatus: isInStock ? 'In Stock' : 'Out of Stock',
          stockQuantity: isInStock ? 'Available' : '0',
          inStock: isInStock,
          url: fullUrl,
          imageUrl: item.image,
          soldCount: item.itemSoldCntShow || '0 sold',
          scrapedAt: new Date().toISOString()
        });
      }

      currentPage++;
      await randomDelay(CONFIG.MIN_DELAY, CONFIG.MAX_DELAY);
    }

    console.log(`[Scraper] Completed API checking across ${currentPage - 1} page(s). Total products found: ${allProducts.length}`);

    return {
      pageInstance: page,
      contextInstance: context,
      products: allProducts,
      totalPagesChecked: currentPage - 1
    };

  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}
