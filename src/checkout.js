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
            await randomDelay(1500, 3000);
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
 * Attempts to click Place Order / Pay Now button on Lazada Checkout screen to finalize payment.
 * @param {import('playwright').Page} page 
 * @returns {Promise<Object>} { orderPlaced: boolean, finalUrl: string }
 */
async function clickPlaceOrderAndPay(page) {
  console.log('[Checkout] Searching for "Place Order" / "Buat Pesanan" / "Pay Now" payment button...');

  const placeOrderSelectors = [
    'button.btn-place-order',
    '#btn-place-order',
    '.automation-btn-place-order',
    'button:has-text("Place Order")',
    'button:has-text("Buat Pesanan")',
    'button:has-text("Pay Now")',
    'button:has-text("Bayar Sekarang")',
    'button.next-btn-primary:has-text("Place Order")',
    'button.next-btn-primary:has-text("Buat Pesanan")'
  ];

  let orderClicked = false;
  for (const selector of placeOrderSelectors) {
    try {
      const button = await page.$(selector);
      if (button) {
        const isVisible = await button.isVisible().catch(() => false);
        const isDisabled = await button.getAttribute('disabled').catch(() => null);

        if (isVisible && !isDisabled) {
          console.log(`[Checkout] Found active Place Order button via selector: ${selector}. Clicking now...`);
          await button.click();
          orderClicked = true;
          break;
        }
      }
    } catch (e) {
      // Continue checking next selector
    }
  }

  if (!orderClicked) {
    console.warn('[Checkout] Place Order button not found or requires payment method selection.');
    return { orderPlaced: false, finalUrl: page.url() };
  }

  // Wait for redirect to order success / payment confirmation page
  console.log('[Checkout] Waiting for payment confirmation redirect...');
  await page.waitForURL(url => {
    const u = url.toString().toLowerCase();
    return u.includes('success') || u.includes('finish') || u.includes('confirm') || u.includes('thank') || u.includes('payment') || u.includes('order');
  }, { timeout: 45000 }).catch(() => {});

  await randomDelay(3000, 5000);
  const finalUrl = page.url();
  console.log(`[Checkout] Final Browser URL after order submission: ${finalUrl}`);

  return { orderPlaced: true, finalUrl };
}

/**
 * Navigates to product detail page, clicks Buy Now, applies Lazada Points, and completes payment ("Checkout Sampai Bayar").
 * 
 * @param {import('playwright').Page} page 
 * @param {Object} product 
 * @param {Object} options 
 * @param {boolean} options.usePoints
 * @param {string} options.triggerReason
 */
export async function processAutoCheckout(page, product, options = { usePoints: true, triggerReason: 'In-Stock Auto Buy' }) {
  console.log(`\n[Checkout] Processing Full Auto-Checkout for item: "${product.title}"`);
  console.log(`[Checkout] Reason: ${options.triggerReason}`);
  console.log(`[Checkout] Product URL: ${product.url}`);

  try {
    await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await randomDelay(2000, 4000);

    // Step 1: Click "Buy Now" button
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

    // Step 2: Wait for navigation to Checkout page
    console.log('[Checkout] Waiting for navigation to checkout screen...');
    await page.waitForURL(url => url.toString().includes('checkout') || url.toString().includes('buy'), { timeout: 30000 }).catch(() => {});

    await randomDelay(3000, 5000);
    const checkoutUrl = page.url();
    console.log(`[Checkout] Reached Checkout Screen URL: ${checkoutUrl}`);

    // Step 3: Apply Lazada Points if option enabled
    let pointsApplied = false;
    if (options.usePoints) {
      pointsApplied = await applyLazadaPoints(page);
    }

    // Step 4: Finalize Payment ("Checkout Sampai Bayar")
    const { orderPlaced, finalUrl } = await clickPlaceOrderAndPay(page);

    const statusText = orderPlaced
      ? `ORDER PLACED SUCCESSFULLY - Final Payment Submitted ${pointsApplied ? '(Lazada Points Applied)' : ''}`
      : `Reached Checkout Screen ${pointsApplied ? '(Lazada Points Applied)' : ''} - Pending Final Manual Payment Method Selection`;

    // Send Checkout Notification Email
    await sendCheckoutEmail(product, finalUrl, statusText);

    return {
      success: orderPlaced,
      checkoutUrl: finalUrl,
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
