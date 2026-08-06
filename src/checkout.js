import { randomDelay } from './human-behavior.js';
import { sendCheckoutEmail, sendFailureEmail } from './mailer.js';

/**
 * Attempts to locate and enable Lazada Coins / Points discount toggle switch on checkout page.
 * @param {import('playwright').Page} page 
 * @returns {Promise<boolean>} Whether points were enabled
 */
async function applyLazadaPoints(page) {
  console.log('[Checkout] Searching for Lazada Coins / Points discount toggle on checkout page...');
  
  const pointsSelectors = [
    '#coins_switch',
    '.coins-toggle input[type="checkbox"]',
    '.laz-coins-switch',
    '[class*="coins"] input[type="checkbox"]',
    '[class*="coin"] .next-switch',
    'span:has-text("Redeem Coins")',
    'span:has-text("Gunakan Koin")'
  ];

  for (const selector of pointsSelectors) {
    try {
      const toggle = await page.$(selector);
      if (toggle) {
        const isVisible = await toggle.isVisible().catch(() => false);
        if (isVisible) {
          const isChecked = await toggle.isChecked().catch(() => false);
          if (!isChecked) {
            console.log(`[Checkout] Enabling Lazada Coins / Points toggle using selector: ${selector}`);
            await toggle.click();
            await randomDelay(1000, 2000);
            return true;
          } else {
            console.log(`[Checkout] Lazada Coins / Points already enabled.`);
            return true;
          }
        }
      }
    } catch (e) {
      // Continue searching next selector
    }
  }

  console.log('[Checkout] Lazada Coins / Points toggle not detected or not applicable for this item.');
  return false;
}

/**
 * Navigates to product detail page, clicks Buy Now, applies Lazada Points, and reaches checkout.
 * 
 * @param {import('playwright').Page} page 
 * @param {Object} product 
 * @param {Object} options 
 * @param {boolean} options.usePoints
 * @param {string} options.triggerReason
 */
export async function processAutoCheckout(page, product, options = { usePoints: true, triggerReason: 'In-Stock Auto Buy' }) {
  console.log(`\n[Checkout] Processing Auto-Checkout for item: "${product.title}"`);
  console.log(`[Checkout] Reason: ${options.triggerReason}`);
  console.log(`[Checkout] Product URL: ${product.url}`);

  try {
    await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await randomDelay(2000, 4000);

    // Click "Buy Now" button
    const buyNowSelectors = [
      '.pdp-button_type_buy',
      'button.add-to-cart-buy-now-btn',
      '.add-to-cart-buy-now-btn .pdp-button_state_enabled',
      'button:has-text("Buy Now")',
      'button:has-text("Beli Sekarang")'
    ];

    let clicked = false;
    for (const selector of buyNowSelectors) {
      const button = await page.$(selector);
      if (button) {
        const isVisible = await button.isVisible().catch(() => false);
        if (isVisible) {
          console.log(`[Checkout] Found Buy Now button via selector: ${selector}`);
          await button.click();
          clicked = true;
          break;
        }
      }
    }

    if (!clicked) {
      throw new Error(`Could not locate active Buy Now button on page: ${product.url}`);
    }

    // Wait for navigation to Checkout page
    console.log('[Checkout] Waiting for navigation to checkout screen...');
    await page.waitForURL(url => url.toString().includes('checkout') || url.toString().includes('buy'), { timeout: 30000 }).catch(() => {});

    await randomDelay(3000, 5000);
    const currentUrl = page.url();
    console.log(`[Checkout] Current browser URL: ${currentUrl}`);

    // Apply Lazada Points if option enabled
    let pointsApplied = false;
    if (options.usePoints) {
      pointsApplied = await applyLazadaPoints(page);
    }

    const reachedCheckout = currentUrl.includes('checkout') || currentUrl.includes('buy');
    const statusText = reachedCheckout
      ? `Reached Checkout Page Successfully ${pointsApplied ? '(Lazada Points Applied)' : ''}`
      : 'Buy Now Clicked (Pending Checkout Redirect)';

    // Send Checkout Notification Email
    await sendCheckoutEmail(product, currentUrl, statusText);

    return {
      success: true,
      checkoutUrl: currentUrl,
      statusText,
      pointsApplied
    };

  } catch (error) {
    console.error(`[Checkout Error] Failed auto checkout for "${product.title}": ${error.message}`);
    await sendFailureEmail(`Auto-checkout failed for item: ${product.title}`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
