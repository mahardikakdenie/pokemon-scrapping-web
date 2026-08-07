import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { CONFIG } from './config.js';
import { importCookiesFromJSON } from './session-utils.js';

// Apply stealth plugin
chromium.use(StealthPlugin());

async function openInteractiveBrowser() {
  console.log('==================================================');
  console.log(' Interactive Session Browser (Lazada SG)');
  console.log('==================================================');
  console.log('[Browser] Injecting cookies from cookies.json...');
  console.log('[Browser] Browser window will stay open until closed manually.');

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
      viewport: null, // Allow browser maximize to control viewport size
      userAgent: CONFIG.USER_AGENT,
      locale: 'en-SG',
      timezoneId: 'Asia/Singapore',
    });

    // Load cookies into session
    const count = await importCookiesFromJSON(context);
    console.log(`[Browser] Injected ${count} cookies.`);

    const page = context.pages()[0] || await context.newPage();

    console.log('[Browser] Navigating to Lazada SG home...');
    await page.goto('https://www.lazada.sg', { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });

    console.log('\n[Browser] Browser window is active. Close the Chromium window to terminate this session.');

    // Wait indefinitely for browser close event to prevent script exit
    await new Promise((resolve) => {
      page.on('close', () => {
        console.log('[Browser] Tab closed by user.');
        resolve();
      });
      context.on('close', () => {
        console.log('[Browser] Browser context closed by user.');
        resolve();
      });
    });

  } catch (error) {
    console.error(`[Browser Error] Encountered exception: ${error.message}`);
  } finally {
    if (context) {
      await context.close().catch(() => {});
      console.log('[Browser] Browser context terminated.');
    }
  }
}

openInteractiveBrowser();
