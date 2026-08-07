import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { CONFIG } from './src/config.js';
import { processAutoCheckout } from './src/checkout.js';
import { importCookiesFromJSON } from './src/session-utils.js';

chromium.use(StealthPlugin());

async function runTestCheckout() {
  console.log('[Test Checkout] Initializing persistent browser session for checkout test...');

  const context = await chromium.launchPersistentContext(CONFIG.SESSION_DIR, {
    headless: false, // Force false to allow the user to visually inspect checkout interactions
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ],
    viewport: CONFIG.VIEWPORT,
    userAgent: CONFIG.USER_AGENT
  });

  await importCookiesFromJSON(context);
  const page = context.pages()[0] || await context.newPage();

  const dummyProduct = {
    title: 'Test Checkout Product Item',
    url: process.argv[2] || CONFIG.TARGET_URL,
    price: 'Rp 100.000'
  };

  console.log(`[Test Checkout] Executing checkout test for URL: ${dummyProduct.url}`);
  const result = await processAutoCheckout(page, dummyProduct, {
    usePoints: CONFIG.USE_LAZADA_POINTS,
    triggerReason: 'Direct Test Script Run'
  });

  console.log('[Test Checkout] Result:', JSON.stringify(result, null, 2));

  await context.close();
  process.exit(0);
}

runTestCheckout().catch(err => {
  console.error('[Test Checkout Error]', err);
  process.exit(1);
});
