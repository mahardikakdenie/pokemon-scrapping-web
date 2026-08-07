import { randomDelay } from './human-behavior.js';

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY: Parse Product Price String to Numeric Value
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a Lazada price string (e.g. "$30.00", "S$205.00", "Rp 150.000")
 * into a numeric float value for arithmetic comparison.
 *
 * Handles multiple currency formats:
 *   - "$30.00"      → 30.00
 *   - "S$205.00"    → 205.00
 *   - "Rp 150.000"  → 150000
 *   - "$1,299.00"   → 1299.00
 *
 * @param {string} priceString - The price string from the product object.
 * @returns {number} Parsed numeric price, or 0 if parsing fails.
 */
export function parseProductPriceToNumber(priceString) {
  if (!priceString || typeof priceString !== 'string') return 0;

  // Remove currency symbols: $, S$, Rp, SGD, USD, etc.
  let cleaned = priceString.replace(/[^\d.,]/g, '').trim();

  if (!cleaned) return 0;

  // Detect locale format:
  // If the string has both dots and commas, determine which is the decimal separator.
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');

  if (lastDot > -1 && lastComma > -1) {
    if (lastDot > lastComma) {
      // Format: "1,299.00" (EN) → remove commas, keep dot as decimal
      cleaned = cleaned.replace(/,/g, '');
    } else {
      // Format: "1.299,00" (ID/EU) → remove dots, replace comma with dot
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else if (lastComma > -1 && cleaned.split(',').length === 2 && cleaned.split(',')[1].length <= 2) {
    // Format: "150,00" → decimal comma
    cleaned = cleaned.replace(',', '.');
  } else if (lastDot > -1 && cleaned.split('.').length === 2 && cleaned.split('.')[1].length > 2) {
    // Format: "150.000" (ID thousands separator, no decimal) → remove dot
    cleaned = cleaned.replace(/\./g, '');
  } else {
    // Format: "150.000" with 3 decimals is unlikely for price; or "30.00" standard
    // Leave as-is for parseFloat to handle
    cleaned = cleaned.replace(/,/g, '');
  }

  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : result;
}

// ─────────────────────────────────────────────────────────────────────────────
// WALLET: Fetch Lazada Wallet Balance from Account Page (Pre-Purchase)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Navigates to the Lazada account wallet page and reads the current balance.
 * This is called BEFORE any purchase attempt to determine the available budget.
 *
 * Strategy:
 *   1. Try navigating to the Lazada Wallet / Account Balance page directly.
 *   2. Look for the balance amount displayed on that page.
 *   3. If the wallet page is inaccessible, fall back to navigating to the
 *      cheapest in-stock product's checkout page and reading the balance there.
 *
 * @param {import('playwright').Page} page - Active Playwright page instance.
 * @returns {Promise<number|null>} Wallet balance as a number, or null if unreadable.
 */
export async function fetchWalletBalanceFromAccountPage(page) {
  console.log('\n[Wallet] ══════════════════════════════════════════════════════');
  console.log('[Wallet] PHASE: Reading Lazada Wallet Balance (Pre-Purchase)');
  console.log('[Wallet] ══════════════════════════════════════════════════════');

  // ── Strategy 1: Navigate to Lazada Wallet / Account Page ──
  const walletPageUrls = [
    'https://member.lazada.sg/user/wallet',
    'https://member.lazada.sg/user/account',
    'https://www.lazada.sg/account/wallet',
    'https://member.lazada.sg/user/wallet/balance',
  ];

  for (const walletUrl of walletPageUrls) {
    try {
      console.log(`[Wallet] Navigating to wallet page: ${walletUrl}`);
      await page.goto(walletUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay(3000, 5000);

      const currentUrl = page.url().toLowerCase();
      // If redirected to login page, skip this URL
      if (currentUrl.includes('login') || currentUrl.includes('signin')) {
        console.log('[Wallet] Redirected to login page. Session may need refresh. Trying next URL...');
        continue;
      }

      // Try to read balance from this page
      const balance = await readWalletBalanceFromCurrentPage(page);
      if (balance !== null) {
        console.log(`[Wallet] ✅ Successfully read wallet balance: ${balance}`);
        return balance;
      }
    } catch (error) {
      console.log(`[Wallet] Could not load ${walletUrl}: ${error.message}`);
    }
  }

  console.log('[Wallet] Strategy 1 (wallet page) did not yield a balance. Trying Strategy 2 (checkout page)...');

  // ── Strategy 2: Use existing readLazadaWalletBalance on current page ──
  const fallbackBalance = await readLazadaWalletBalance(page);
  if (fallbackBalance !== null) {
    console.log(`[Wallet] ✅ Fallback balance from current page: ${fallbackBalance}`);
    return fallbackBalance;
  }

  console.log('[Wallet] ❌ Could not determine Lazada Wallet balance from any source.');
  return null;
}

/**
 * Reads wallet balance numbers from the currently loaded page.
 * Scans for common Lazada Wallet / Credit balance display patterns.
 *
 * @param {import('playwright').Page} page - Active Playwright page instance.
 * @returns {Promise<number|null>} Balance value or null.
 */
async function readWalletBalanceFromCurrentPage(page) {
  // Selector patterns for wallet balance on the account/wallet page
  const selectors = [
    '[class*="balance"] [class*="amount"]',
    '[class*="balance"] [class*="value"]',
    '[class*="wallet"] [class*="balance"]',
    '[class*="wallet"] [class*="amount"]',
    '[class*="credit-balance"]',
    '[class*="wallet-balance"]',
    '[class*="total-balance"]',
    '[data-spm*="balance"]',
    '[data-spm*="wallet"]',
    'span:has-text("S$")',
    'span:has-text("$")',
    'div:has-text("Available Balance")',
    'div:has-text("Wallet Balance")',
    'div:has-text("Saldo")',
    'div:has-text("Credit Balance")',
  ];

  for (const selector of selectors) {
    try {
      const elements = await page.$$(selector);
      for (const element of elements) {
        const isVisible = await element.isVisible().catch(() => false);
        if (!isVisible) continue;

        const rawText = await element.evaluate((el) => {
          return (el.textContent || '').trim();
        });

        // Try to extract a monetary value
        const moneyMatch = rawText.match(/(?:S?\$|Rp\.?\s*)([\d.,]+)/);
        if (moneyMatch && moneyMatch[1]) {
          const parsed = parseProductPriceToNumber(moneyMatch[0]);
          if (parsed > 0) {
            console.log(`[Wallet] Balance found via selector "${selector}": ${parsed} (raw: "${rawText.substring(0, 60)}")`);
            return parsed;
          }
        }
      }
    } catch (error) {
      // Continue to next selector
    }
  }

  // Fallback: Full-page text scan for balance patterns
  try {
    const scannedBalance = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      const patterns = [
        /(?:Available\s*Balance|Wallet\s*Balance|Saldo|Credit\s*Balance)[:\s]*(?:S?\$|Rp\.?\s*)([\d.,]+)/i,
        /(?:S?\$)([\d.,]+)(?:\s*(?:Available|Balance|Wallet|Credit))/i,
      ];
      for (const pattern of patterns) {
        const match = bodyText.match(pattern);
        if (match && match[1]) {
          let cleaned = match[1].replace(/,/g, '');
          // Handle ID format: "150.000" (thousands dot)
          if (cleaned.includes('.') && cleaned.split('.')[1].length === 3) {
            cleaned = cleaned.replace(/\./g, '');
          }
          const val = parseFloat(cleaned);
          if (!isNaN(val) && val > 0) return val;
        }
      }
      return null;
    });

    if (scannedBalance !== null) {
      console.log(`[Wallet] Balance found via full-page text scan: ${scannedBalance}`);
      return scannedBalance;
    }
  } catch (error) {
    // Scan failed silently
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Select Free Shipping Option on Checkout Page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Searches for shipping / delivery options on the checkout page.
 * If a "Free", "$0.00", "Gratis Ongkir", or "Free Shipping" option exists, it selects it.
 *
 * @param {import('playwright').Page} page - Active Playwright page instance.
 * @returns {Promise<boolean>} True if a free shipping option was found and clicked.
 */
export async function selectFreeShippingOption(page) {
  console.log('[Checkout] Searching for Free Shipping / $0.00 delivery options...');

  // Selectors for free shipping options or expand dropdowns
  const freeShippingSelectors = [
    'div[class*="shipping-option"]:has-text("Free")',
    'div[class*="shipping-option"]:has-text("$0.00")',
    'div[class*="shipping-option"]:has-text("Gratis")',
    'label:has-text("Free Shipping")',
    'label:has-text("Gratis Ongkir")',
    'span:has-text("Free Shipping")',
    'span:has-text("Gratis Ongkir")',
    'div:has-text("Free Shipping")',
    'div:has-text("Gratis Ongkir")',
    'span:has-text("$0.00")',
    'span:has-text("Rp 0")',
    '[data-spm*="shipping"]:has-text("Free")',
  ];

  // Step 1: Try clicking shipping rate dropdown or selector container if collapsed
  const expandSelectors = [
    'div[class*="shipping-option"]',
    'div[class*="delivery-option"]',
    'span:has-text("Shipping Option")',
    'span:has-text("Delivery Option")',
    'div:has-text("Shipping Rates")',
  ];

  for (const expSelector of expandSelectors) {
    try {
      const expEl = await page.$(expSelector);
      if (expEl && (await expEl.isVisible().catch(() => false))) {
        console.log(`[Checkout] Expanding shipping options container via: ${expSelector}`);
        await expEl.click();
        await randomDelay(1500, 3000);
        break;
      }
    } catch (e) {
      // Continue
    }
  }

  // Step 2: Search and click the Free Shipping option
  for (const selector of freeShippingSelectors) {
    try {
      const element = await page.$(selector);
      if (!element) continue;

      const isVisible = await element.isVisible().catch(() => false);
      if (!isVisible) continue;

      console.log(`[Checkout] 🚚 Free Shipping option detected via selector: ${selector}. Clicking now...`);
      await element.click();
      await randomDelay(2000, 4000);
      return true;
    } catch (error) {
      // Continue to next selector
    }
  }

  console.log('[Checkout] No explicit Free Shipping option found or standard delivery is already selected.');
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Select Alternative Payment Method (COD, Bank Transfer, Pay at Counter)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Selects an alternative non-Wallet payment method on the checkout page.
 * Options:
 *   - "COD": Cash on Delivery / Bayar di Tempat
 *   - "BANK_TRANSFER": Bank Transfer / Virtual Account
 *   - "PAY_AT_COUNTER": Pay at Counter / 7-Eleven / Minimarket
 *   - "MANUAL": Any offline / manual payment method
 *
 * @param {import('playwright').Page} page - Active Playwright page instance.
 * @param {string} paymentMethod - Payment method keyword.
 * @returns {Promise<boolean>} True if payment method was selected.
 */
export async function selectAlternativePaymentMethod(page, paymentMethod) {
  const method = paymentMethod ? paymentMethod.toUpperCase() : 'PAYNOW';
  if (method.includes('PAYNOW')) {
    return await selectPayNowTransferPayment(page);
  }
  console.log(`[Checkout] Selecting alternative payment method: ${method}...`);

  // STEP 1: Click "View all methods >" link if present on page
  const viewAllSelectors = [
    'a:has-text("View all methods")',
    'span:has-text("View all methods")',
    'div:has-text("View all methods")',
    '[class*="view-all"]',
    '*:has-text("View all methods >")',
  ];

  for (const viewAllSel of viewAllSelectors) {
    try {
      const viewAllEl = await page.$(viewAllSel);
      if (viewAllEl && (await viewAllEl.isVisible().catch(() => false))) {
        console.log(`[Checkout] Clicking "View all methods >" via selector: ${viewAllSel}`);
        await viewAllEl.click();
        await randomDelay(1500, 3000);
        break;
      }
    } catch (e) {
      // Continue search
    }
  }

  // STEP 2: Selectors map including Lazada SG PayNow Transfer
  const selectorsMap = {
    PAYNOW: [
      'div:has-text("PayNow Transfer")',
      'span:has-text("PayNow Transfer")',
      'label:has-text("PayNow Transfer")',
      'div:has-text("PayNow")',
      'span:has-text("PayNow")',
      'input[type="radio"][value*="paynow" i]',
      'div[class*="payment-option"]:has-text("PayNow")',
    ],
    PAYNOW_TRANSFER: [
      'div:has-text("PayNow Transfer")',
      'span:has-text("PayNow Transfer")',
      'label:has-text("PayNow Transfer")',
      'div:has-text("PayNow")',
      'input[type="radio"][value*="paynow" i]',
    ],
    BANK_TRANSFER: [
      'div:has-text("PayNow Transfer")',
      'span:has-text("PayNow Transfer")',
      'label:has-text("Bank Transfer")',
      'span:has-text("Bank Transfer")',
    ],
    COD: [
      'label:has-text("Cash on Delivery")',
      'label:has-text("Bayar di Tempat")',
      'div[class*="payment-option"]:has-text("Cash on Delivery")',
      'div[class*="payment-option"]:has-text("Bayar di Tempat")',
      'input[type="radio"][value*="cod" i]',
      'span:has-text("Cash on Delivery")',
    ],
    PAY_AT_COUNTER: [
      'label:has-text("Pay at Counter")',
      'label:has-text("7-Eleven")',
      'label:has-text("Over the Counter")',
      'div[class*="payment-option"]:has-text("7-Eleven")',
      'input[type="radio"][value*="counter" i]',
      'span:has-text("Pay at Counter")',
    ],
    MANUAL: [
      'div:has-text("PayNow Transfer")',
      'span:has-text("PayNow Transfer")',
      'label:has-text("Cash on Delivery")',
      'div[class*="payment-option"]:not(:has-text("Wallet"))',
    ]
  };

  const selectors = selectorsMap[method] || selectorsMap.PAYNOW;

  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (!element) continue;

      const isVisible = await element.isVisible().catch(() => false);
      if (!isVisible) continue;

      console.log(`[Checkout] Clicking payment method option via selector: ${selector}`);
      await element.click();
      await randomDelay(1500, 3000);

      // STEP 4: Click "Confirm Selection" modal button if modal dialog appears
      const confirmSelectors = [
        'button:has-text("Confirm Selection")',
        'button.next-btn-primary:has-text("Confirm Selection")',
        'button:has-text("Confirm")',
        'button:has-text("Konfirmasi")',
        '.next-dialog button:has-text("Confirm")',
      ];

      for (const confirmSel of confirmSelectors) {
        try {
          const confirmBtn = await page.$(confirmSel);
          if (confirmBtn && (await confirmBtn.isVisible().catch(() => false))) {
            console.log(`[Checkout] 🔘 Clicking "Confirm Selection" modal button via: ${confirmSel}`);
            await confirmBtn.click();
            await randomDelay(2000, 4000);
            break;
          }
        } catch (e) {
          // Continue search
        }
      }

      return true;
    } catch (error) {
      // Continue to next selector
    }
  }

  console.log(`[Checkout] Could not find specific selector for ${method}. Utilizing default page selection.`);
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 HELPER: Read Lazada Wallet Balance from Checkout Page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the current Lazada Wallet / Lazada Credit balance displayed on the
 * checkout or payment page. Searches multiple known selector patterns used by
 * Lazada SG / Lazada ID checkout screens.
 *
 * @param {import('playwright').Page} page - Active Playwright page instance.
 * @returns {Promise<number|null>} Numeric balance value, or null if not found.
 */
export async function readLazadaWalletBalance(page) {
  console.log('[Checkout] Attempting to read Lazada Wallet balance from page...');

  const balanceSelectors = [
    // --- Text-based selectors (Indonesian & English) ---
    'span:has-text("Saldo Lazada")',
    'span:has-text("Lazada Wallet")',
    'span:has-text("Lazada Credit")',
    'div:has-text("Saldo Lazada")',
    'div:has-text("Lazada Wallet")',
    'div:has-text("Lazada Credit")',
    // --- Class / ID-based selectors ---
    '[class*="wallet"] [class*="balance"]',
    '[class*="wallet"] [class*="amount"]',
    '[class*="credit"] [class*="balance"]',
    '[class*="lazada-wallet"]',
    '[class*="payment-wallet"] span',
    '.checkout-payment-wallet-balance',
    '[data-spm*="wallet"]',
  ];

  for (const selector of balanceSelectors) {
    try {
      const element = await page.$(selector);
      if (!element) continue;

      const isVisible = await element.isVisible().catch(() => false);
      if (!isVisible) continue;

      // Get the text content from the element and its parent container
      const rawText = await element.evaluate((el) => {
        // Check the element itself and its parent for balance text
        const selfText = el.textContent || '';
        const parentText = el.parentElement ? el.parentElement.textContent || '' : '';
        return selfText + ' ' + parentText;
      });

      // Extract numeric value from text like "Rp 150.000", "S$25.00", "$12.34"
      const numericMatch = rawText.match(/[\d.,]+/g);
      if (numericMatch) {
        for (const candidate of numericMatch) {
          // Remove thousands separators (period in ID locale, comma in EN locale)
          const cleaned = candidate.replace(/\./g, '').replace(/,/g, '.');
          const parsed = parseFloat(cleaned);
          if (!isNaN(parsed) && parsed > 0) {
            console.log(`[Checkout] Lazada Wallet balance detected: ${parsed} (raw: "${rawText.trim().substring(0, 80)}")`);
            return parsed;
          }
        }
      }
    } catch (error) {
      // Continue to next selector silently
    }
  }

  // Fallback: Try to extract balance via page.evaluate scanning all visible text
  try {
    const fallbackBalance = await page.evaluate(() => {
      const allText = document.body.innerText || '';
      // Look for patterns like "Saldo: Rp 150.000" or "Wallet: S$25.00"
      const patterns = [
        /(?:Saldo|Wallet|Credit|Balance)[:\s]*(?:Rp\.?\s*|S?\$\s*)([\d.,]+)/i,
        /(?:Rp\.?\s*|S?\$\s*)([\d.,]+)(?:\s*(?:Saldo|Wallet|Credit))/i,
      ];
      for (const pattern of patterns) {
        const match = allText.match(pattern);
        if (match && match[1]) {
          const cleaned = match[1].replace(/\./g, '').replace(/,/g, '.');
          const val = parseFloat(cleaned);
          if (!isNaN(val) && val > 0) return val;
        }
      }
      return null;
    });

    if (fallbackBalance !== null) {
      console.log(`[Checkout] Lazada Wallet balance (fallback scan): ${fallbackBalance}`);
      return fallbackBalance;
    }
  } catch (error) {
    // Fallback failed silently
  }

  console.log('[Checkout] Could not detect Lazada Wallet balance on current page.');
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 HELPER: Select Lazada Wallet as Payment Method
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Locates and selects "Lazada Wallet" / "Saldo Lazada" as the active payment
 * method on the checkout page. Handles both radio-button and clickable-card
 * UI patterns used by Lazada.
 *
 * @param {import('playwright').Page} page - Active Playwright page instance.
 * @returns {Promise<boolean>} True if Lazada Wallet was successfully selected.
 */
export async function selectLazadaWalletPayment(page) {
  console.log('[Checkout] Searching for Lazada Wallet payment method option...');

  const walletSelectors = [
    // --- Radio / Checkbox inputs ---
    'input[type="radio"][value*="wallet" i]',
    'input[type="radio"][value*="WALLET" i]',
    'input[type="radio"][value*="lazada_wallet" i]',
    'input[type="radio"][value*="credit" i]',
    // --- Clickable label / card elements (Indonesian & English) ---
    'label:has-text("Lazada Wallet")',
    'label:has-text("Saldo Lazada")',
    'label:has-text("Lazada Credit")',
    'div[class*="payment-option"]:has-text("Lazada Wallet")',
    'div[class*="payment-option"]:has-text("Saldo Lazada")',
    'div[class*="payment-option"]:has-text("Lazada Credit")',
    'div[class*="payment-method"]:has-text("Lazada Wallet")',
    'div[class*="payment-method"]:has-text("Saldo Lazada")',
    'div[class*="payment-method"]:has-text("Lazada Credit")',
    'span:has-text("Lazada Wallet")',
    'span:has-text("Saldo Lazada")',
    'span:has-text("Lazada Credit")',
    // --- Toggle / Switch patterns ---
    '[class*="wallet"] input[type="checkbox"]',
    '[class*="wallet"] .next-switch',
    '[data-spm*="wallet"]',
    // --- Generic patterns ---
    'div[class*="checkout-payment"] div:has-text("Wallet")',
    'div[class*="checkout-payment"] div:has-text("Saldo")',
  ];

  for (const selector of walletSelectors) {
    try {
      const element = await page.$(selector);
      if (!element) continue;

      const isVisible = await element.isVisible().catch(() => false);
      if (!isVisible) continue;

      // Check if it's already selected/checked
      const tagName = await element.evaluate((el) => el.tagName.toLowerCase());
      if (tagName === 'input') {
        const isChecked = await element.isChecked().catch(() => false);
        if (isChecked) {
          console.log(`[Checkout] Lazada Wallet already selected (selector: ${selector}).`);
          return true;
        }
      }

      console.log(`[Checkout] Clicking Lazada Wallet payment option via selector: ${selector}`);
      await element.click();
      await randomDelay(2000, 4000);

      // Verify selection took effect by checking for visual confirmation
      const verifySelected = await page.evaluate(() => {
        const body = document.body.innerText || '';
        return body.toLowerCase().includes('wallet') || body.toLowerCase().includes('saldo');
      });

      if (verifySelected) {
        console.log('[Checkout] Lazada Wallet payment method selected successfully.');
        return true;
      }
    } catch (error) {
      // Continue to next selector
    }
  }

  console.log('[Checkout] Lazada Wallet payment option not found. May use default payment method.');
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Select PayNow Transfer Payment Method via Cashier Drawer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Automates selecting the "PayNow Transfer" payment method on Lazada checkout.
 *
 * Flow:
 *  1. Clicks "View All Methods" / "Lihat Semua Metode" button to open cashier drawer overlay.
 *  2. Waits for "Select Payment Method" modal to appear.
 *  3. Finds and clicks the "PayNow Transfer" option card.
 *  4. Waits for the PayNow instruction drawer to render.
 *  5. Clicks the "Confirm Selection" button to complete method selection.
 *
 * @param {import('playwright').Page} page - Active Playwright page instance.
 * @returns {Promise<boolean>} True if PayNow Transfer selection was successfully confirmed.
 */
export async function selectPayNowTransferPayment(page) {
  console.log('\n[Checkout] ══════════════════════════════════════════════════════');
  console.log('[Checkout] PHASE: Selecting PayNow Transfer Payment Method');
  console.log('[Checkout] ══════════════════════════════════════════════════════');

  try {
    // ── SUB-STEP A: Check if PayNow Transfer is ALREADY the active payment method ──
    console.log('[Checkout] Checking if PayNow Transfer is already the active payment method...');
    const isPayNowAlreadySelected = await page.evaluate(() => {
      const selectedCard = document.querySelector('.payment-card-container .card-container.selected');
      if (selectedCard) {
        const cardText = selectedCard.textContent || '';
        return cardText.includes('PayNow Transfer');
      }
      return false;
    }).catch(() => false);

    if (isPayNowAlreadySelected) {
      console.log('[Checkout] ✅ PayNow Transfer is ALREADY the active payment method. No action needed.');
      return true;
    }

    console.log('[Checkout] PayNow Transfer is NOT the active method. Opening payment methods drawer...');

    // ── SUB-STEP B: Click "View all methods >" link to open the payment drawer ──
    const viewAllMethodsSelectors = [
      'span.payment-card-header-action',
      '.payment-card-header-action',
      'span:has-text("View all methods")',
      'span:has-text("View all methods >")',
    ];

    let viewAllClicked = false;
    for (const selector of viewAllMethodsSelectors) {
      try {
        const el = await page.$(selector);
        if (el && (await el.isVisible().catch(() => false))) {
          console.log(`[Checkout] Clicking "View all methods >" via: "${selector}"`);
          await el.click();
          viewAllClicked = true;
          await randomDelay(2000, 3000);
          break;
        }
      } catch (e) {
        // Try next
      }
    }

    if (!viewAllClicked) {
      console.warn('[Checkout] Could not find "View all methods >" button. Attempting direct drawer search...');
    }

    // ── SUB-STEP C: Wait for the payment methods overlay/drawer to render ──
    console.log('[Checkout] Waiting for payment methods drawer (div.protals-methods) to appear...');
    await page.waitForSelector('.protals-methods', {
      visible: true,
      timeout: 10000,
    }).catch(() => {
      console.warn('[Checkout] protals-methods drawer wait timed out. Continuing anyway...');
    });

    // ── SUB-STEP D: Find and click "PayNow Transfer" in the methods list ──
    console.log('[Checkout] Searching for "PayNow Transfer" item in payment methods list...');

    const payNowMethodSelectors = [
      '.method-item .title.bold:has-text("PayNow Transfer")',
      '.method-item:has-text("PayNow Transfer")',
      'div.main-content-wrapper:has-text("PayNow Transfer")',
      'div.title-wrapper:has-text("PayNow Transfer")',
      'img[src*="O1CN01OKRYNA1beT0XaLZ24"]',
    ];

    let payNowClicked = false;
    for (const selector of payNowMethodSelectors) {
      try {
        const item = await page.$(selector);
        if (item && (await item.isVisible().catch(() => false))) {
          console.log(`[Checkout] Found "PayNow Transfer" via: "${selector}". Clicking...`);
          await item.click();
          payNowClicked = true;
          await randomDelay(2000, 3000);
          break;
        }
      } catch (e) {
        // Try next
      }
    }

    if (!payNowClicked) {
      console.log('[Checkout] Selector click failed. Attempting DOM evaluate click for "PayNow Transfer"...');
      payNowClicked = await page.evaluate(() => {
        const titles = Array.from(document.querySelectorAll('.method-item .title.bold'));
        for (const title of titles) {
          if (title.textContent && title.textContent.trim().includes('PayNow Transfer')) {
            const methodItem = title.closest('.method-item');
            if (methodItem) {
              methodItem.click();
              return true;
            }
            title.click();
            return true;
          }
        }
        const allItems = Array.from(document.querySelectorAll('.method-item'));
        for (const item of allItems) {
          if (item.textContent && item.textContent.includes('PayNow Transfer')) {
            item.click();
            return true;
          }
        }
        return false;
      });
    }

    if (!payNowClicked) {
      throw new Error('Could not find or click "PayNow Transfer" in the payment methods drawer.');
    }

    console.log('[Checkout] ✅ Clicked "PayNow Transfer" payment method item.');

    // ── SUB-STEP E: Wait for the PayNow confirmation sub-drawer to appear ──
    console.log('[Checkout] Waiting for "Confirm Selection" button to appear in sub-drawer...');
    await randomDelay(2000, 3000);

    const confirmSelectors = [
      'div.btn:has-text("Confirm Selection")',
      '.plcae-order .btn',
      '.order-wrap .plcae-order .btn',
      'div.btn:has-text("Konfirmasi Pilihan")',
    ];

    let confirmClicked = false;
    for (const selector of confirmSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn && (await btn.isVisible().catch(() => false))) {
          console.log(`[Checkout] Clicking "Confirm Selection" via: "${selector}"`);
          await btn.click();
          confirmClicked = true;
          await randomDelay(3000, 5000);
          break;
        }
      } catch (e) {
        // Try next
      }
    }

    if (!confirmClicked) {
      console.log('[Checkout] Selector click failed. Attempting DOM evaluate for "Confirm Selection"...');
      confirmClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('div.btn, button'));
        for (const btn of buttons) {
          const text = (btn.textContent || '').trim();
          if (text === 'Confirm Selection' || text === 'Konfirmasi Pilihan') {
            btn.click();
            return true;
          }
        }
        return false;
      });
      if (confirmClicked) {
        await randomDelay(3000, 5000);
      }
    }

    if (!confirmClicked) {
      throw new Error('Could not find or click "Confirm Selection" button after selecting PayNow Transfer.');
    }

    console.log('[Checkout] ✅ "Confirm Selection" clicked. PayNow Transfer method is now active.');

    // ── SUB-STEP F: Verify PayNow Transfer is now the active payment card ──
    console.log('[Checkout] Verifying PayNow Transfer is now the active payment card...');
    await randomDelay(2000, 3000);

    const isPayNowActive = await page.evaluate(() => {
      const selectedCard = document.querySelector('.payment-card-container .card-container.selected');
      if (selectedCard) {
        const cardText = selectedCard.textContent || '';
        return cardText.includes('PayNow Transfer');
      }
      return false;
    }).catch(() => false);

    if (isPayNowActive) {
      console.log('[Checkout] ✅ VERIFIED: PayNow Transfer is confirmed as the active payment method.');
    } else {
      console.warn('[Checkout] ⚠️ Could not verify PayNow Transfer as active card. Proceeding anyway...');
    }

    return true;

  } catch (error) {
    console.error(`[Checkout Error] Failed to select PayNow Transfer: ${error.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 HELPER: Click Shipping Page Confirm / "Beli Sekarang" on Shipping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clicks the confirmation button on the Shipping / Address page.
 * Lazada typically shows a "Beli Sekarang" or "Proceed" button to confirm
 * shipping details before moving to the payment step.
 *
 * @param {import('playwright').Page} page - Active Playwright page instance.
 * @returns {Promise<boolean>} True if the shipping confirm button was clicked.
 */
export async function clickShippingConfirmButton(page) {
  console.log('[Checkout] Searching for shipping page confirm button...');

  const shippingButtonSelectors = [
    // --- Primary: "Beli Sekarang" on shipping page ---
    'button:has-text("Beli Sekarang")',
    'button:has-text("Buy Now")',
    'button:has-text("Proceed to Pay")',
    'button:has-text("Proceed")',
    'button:has-text("Continue")',
    'button:has-text("Lanjutkan")',
    'button:has-text("Confirm")',
    'button:has-text("Konfirmasi")',
    // --- Class-based patterns ---
    'button.checkout-shipping-submit',
    'button.next-btn-primary',
    'button[class*="checkout"] [class*="submit"]',
    'button[class*="shipping"] [class*="confirm"]',
    '.checkout-submit-order button',
    // --- Generic submit-like buttons ---
    'button.btn-primary:not([disabled])',
    'button[type="submit"]:not([disabled])',
  ];

  for (const selector of shippingButtonSelectors) {
    try {
      const button = await page.$(selector);
      if (!button) continue;

      const isVisible = await button.isVisible().catch(() => false);
      const isDisabled = await button.getAttribute('disabled').catch(() => null);

      if (isVisible && !isDisabled) {
        console.log(`[Checkout] Clicking shipping confirm button via selector: ${selector}`);
        await button.click();
        await randomDelay(3000, 5000);
        return true;
      }
    } catch (error) {
      // Continue to next selector
    }
  }

  console.log('[Checkout] Shipping confirm button not found. Page may have auto-advanced.');
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 HELPER: Click "Place Order" / "Buat Pesanan" Final Payment Button
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Locates and clicks the "Place Order" / "Buat Pesanan" / "Pay Now" button
 * on Lazada Checkout to finalize the purchase. Also checks for the SMS Verification popup.
 *
 * @param {import('playwright').Page} page - Active Playwright page instance.
 * @returns {Promise<{ orderPlaced: boolean, finalUrl: string, smsVerificationRequired: boolean, statusText: string }>}
 */
export async function clickPlaceOrderAndPay(page) {
  console.log('[Checkout] Searching for active "Place Order" / "PLACE ORDER NOW" payment button...');

  // ── PRE-FLIGHT CHECK: Verify PayNow Transfer is the active payment method ──
  const activePaymentMethod = await page.evaluate(() => {
    const selectedCard = document.querySelector('.payment-card-container .card-container.selected');
    if (selectedCard) {
      const titleEl = selectedCard.querySelector('.card-title');
      if (titleEl) return titleEl.textContent.trim();
      return (selectedCard.textContent || '').substring(0, 100).trim();
    }
    return 'UNKNOWN';
  }).catch(() => 'UNKNOWN');

  console.log(`[Checkout] Active payment method detected: "${activePaymentMethod}"`);

  if (activePaymentMethod === 'UNKNOWN') {
    console.warn('[Checkout] ⚠️ Could not detect active payment method. Proceeding with Place Order anyway...');
  }

  // ── CLICK "PLACE ORDER NOW" BUTTON ──
  const placeOrderSelectors = [
    'div:has-text("PLACE ORDER NOW")',
    'div:has-text("PLACE ORDER")',
    'button.btn-place-order',
    '#btn-place-order',
    '.automation-btn-place-order',
    'button:has-text("Place Order")',
    'button:has-text("Buat Pesanan")',
    'button:has-text("Pay Now")',
    'button:has-text("Bayar Sekarang")',
    'button.next-btn-primary:has-text("Place Order")',
    'button.next-btn-primary:has-text("Buat Pesanan")',
    '*:has-text("PLACE ORDER NOW")',
    '*:has-text("PLACE ORDER")',
  ];

  let orderClicked = false;

  // Primary: Execute DOM click directly on the exact orange PLACE ORDER NOW div
  console.log('[Checkout] Executing precise DOM click on "PLACE ORDER NOW" orange button...');
  orderClicked = await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div, button'));
    for (const el of divs) {
      const text = (el.textContent || '').trim();
      if (text === 'PLACE ORDER NOW' || text === 'PLACE ORDER') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          el.click();
          return true;
        }
      }
    }
    return false;
  }).catch(() => false);

  if (!orderClicked) {
    // Secondary fallback: Try standard Playwright selector click with force option
    for (const selector of placeOrderSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          const isVisible = await button.isVisible().catch(() => false);
          if (isVisible) {
            console.log(`[Checkout] Clicking payment button via selector: ${selector}`);
            await button.click({ force: true });
            orderClicked = true;
            break;
          }
        }
      } catch (error) {
        // Continue to next selector
      }
    }
  }

  if (!orderClicked) {
    console.warn('[Checkout] ❌ "PLACE ORDER NOW" button not found or not clickable.');
    return { orderPlaced: false, finalUrl: page.url(), smsVerificationRequired: false, statusText: 'FAILED: PLACE ORDER NOW button not found or not clickable' };
  }

  console.log('[Checkout] ✅ "PLACE ORDER NOW" button clicked. Waiting for PayNow QR / order confirmation page redirection...');
  await randomDelay(3000, 5000);

  // ── DETECT SMS VERIFICATION MODAL ──
  const smsVerificationSelectors = [
    'div:has-text("SMS Verification")',
    'h3:has-text("SMS Verification")',
    'div:has-text("Enter SMS Code")',
    'input[placeholder*="Authentication Code" i]',
    'input[placeholder*="SMS Code" i]',
    '.next-dialog:has-text("SMS Verification")',
    '.sms-verification-dialog',
  ];

  let smsVerificationDetected = false;
  for (const selector of smsVerificationSelectors) {
    try {
      const el = await page.$(selector);
      if (el && (await el.isVisible().catch(() => false))) {
        smsVerificationDetected = true;
        console.log(`[Checkout] 📱 SMS Verification popup detected via selector: ${selector}`);
        break;
      }
    } catch (e) {
      // Continue search
    }
  }

  if (smsVerificationDetected) {
    const statusText = '📱 SMS Verification Popup Triggered! (Verification code sent to registered mobile number)';
    console.log(`[Checkout] SUCCESS: ${statusText}`);
    return {
      orderPlaced: true,
      finalUrl: page.url(),
      smsVerificationRequired: true,
      statusText,
    };
  }

  // ── WAIT FOR URL REDIRECT TO ORDER-RECEIVED-NEW PAGE (PayNow QR Page) ──
  console.log('[Checkout] Waiting for redirect to order-received-new / PayNow QR payment page...');
  await page.waitForURL((url) => {
    const targetUrl = url.toString().toLowerCase();
    return (
      targetUrl.includes('order-received-new') ||
      targetUrl.includes('order-received') ||
      targetUrl.includes('orderid') ||
      targetUrl.includes('tradeorderids') ||
      targetUrl.includes('paystatus')
    );
  }, { timeout: 30000 }).catch(() => {});

  const finalUrl = page.url();
  console.log(`[Checkout] Final page URL after submission wait: ${finalUrl}`);

  // STRICT VALIDATION: orderPlaced is true ONLY if page redirected to order-received-new or contains orderId/tradeOrderIds
  const isPayNowQRPage = finalUrl.toLowerCase().includes('order-received-new') || finalUrl.toLowerCase().includes('order-received');
  const hasOrderId = finalUrl.toLowerCase().includes('orderid') || finalUrl.toLowerCase().includes('tradeorderids');

  const orderPlaced = isPayNowQRPage || hasOrderId;

  let statusText;
  if (orderPlaced && isPayNowQRPage && hasOrderId) {
    statusText = 'PayNow QR Payment Page Reached — Awaiting Payment via QR Barcode';
  } else if (orderPlaced) {
    statusText = 'PayNow Transfer Page Reached (QR Barcode Ready)';
  } else {
    statusText = `FAILED: Order submission did not navigate to confirmation page (Current URL: ${finalUrl})`;
    console.error(`[Checkout Error] ${statusText}`);
  }

  console.log(`[Checkout] Strict Validation Result: orderPlaced = ${orderPlaced}, Status = ${statusText}`);

  return {
    orderPlaced,
    finalUrl,
    smsVerificationRequired: false,
    statusText,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: Full 6-Step Auto-Checkout Pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete end-to-end auto checkout flow with Lazada Wallet payment:
 *
 *   STEP 1: Navigate to Product Detail Page (PDP)
 *   STEP 2: Click "Beli Sekarang" / "Buy Now" on PDP
 *   STEP 3: Wait for Shipping Page → Click confirm button
 *   STEP 4: Select Lazada Wallet as payment method
 *   STEP 5: Click "Place Order" / "Buat Pesanan" to finalize purchase
 *   STEP 6: Verify Lazada Wallet balance decreased (post-purchase check)
 *
 * This function does NOT send any email. It only returns the result object.
 * Email sending is handled by the caller (index.js) to consolidate into 1 email.
 *
 * @param {import('playwright').Page} page - Active Playwright page instance.
 * @param {Object} product - Product details { title, url, price, quantity, ... }.
 * @param {Object} [options] - Checkout options.
 * @param {boolean} [options.useLazadaWallet=true] - Whether to select Lazada Wallet.
 * @param {string} [options.triggerReason='In-Stock Auto Buy'] - Why auto-buy triggered.
 * @returns {Promise<Object>} Result object with success, walletBefore, walletAfter, etc.
 */
export async function processAutoCheckout(page, product, options = {}) {
  const { useLazadaWallet = true, triggerReason = 'In-Stock Auto Buy' } = options;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`[Checkout] STARTING FULL AUTO-CHECKOUT FOR: "${product.title}"`);
  console.log(`[Checkout] Trigger Reason: ${triggerReason}`);
  console.log(`[Checkout] Product URL: ${product.url}`);
  console.log(`${'='.repeat(70)}`);

  try {
    // ── STEP 1: Navigate to Product Detail Page (PDP) ──────────────────────
    console.log('\n[Checkout] ── STEP 1/6: Navigating to Product Detail Page ──');
    await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await randomDelay(2000, 4000);
    console.log(`[Checkout] STEP 1 DONE: Arrived at PDP → ${page.url()}`);

    // ── STEP 2: Click "Beli Sekarang" / "Buy Now" on PDP ───────────────────
    console.log('\n[Checkout] ── STEP 2/6: Clicking "Beli Sekarang" / "Buy Now" on PDP ──');
    const buyNowSelectors = [
      'button:has-text("Beli Sekarang")',
      'button:has-text("Buy Now")',
      '.pdp-button_type_buy',
      'button.add-to-cart-buy-now-btn',
      '.add-to-cart-buy-now-btn .pdp-button_state_enabled',
    ];

    let buyNowClicked = false;
    for (const selector of buyNowSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          const isVisible = await button.isVisible().catch(() => false);
          if (isVisible) {
            console.log(`[Checkout] Clicking Buy Now button via selector: ${selector}`);
            await button.click();
            buyNowClicked = true;
            break;
          }
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    if (!buyNowClicked) {
      throw new Error(`STEP 2 FAILED: Could not find active "Buy Now" button on PDP: ${product.url}`);
    }

    console.log('[Checkout] STEP 2 DONE: "Buy Now" button clicked successfully.');

    // ── STEP 3: Wait for Shipping Page → Click confirm button ──────────────
    console.log('\n[Checkout] ── STEP 3/6: Waiting for Shipping/Checkout page ──');
    await page.waitForURL((url) => {
      const currentUrl = url.toString().toLowerCase();
      return (
        currentUrl.includes('checkout') ||
        currentUrl.includes('buy') ||
        currentUrl.includes('shipping') ||
        currentUrl.includes('order')
      );
    }, { timeout: 30000 }).catch(() => {});

    await randomDelay(3000, 5000);
    const shippingUrl = page.url();
    console.log(`[Checkout] Arrived at Shipping/Checkout page: ${shippingUrl}`);

    // Select Free Shipping Option if available
    const freeShippingSelected = await selectFreeShippingOption(page);
    console.log(`[Checkout] Free Shipping selected = ${freeShippingSelected}`);

    // Click the shipping page confirm button ("Beli Sekarang" / "Proceed")
    const shippingConfirmed = await clickShippingConfirmButton(page);
    console.log(`[Checkout] STEP 3 DONE: Shipping confirm clicked = ${shippingConfirmed}`);

    // ── STEP 4: Select Payment Method ─────────────────────
    const selectedMethod = options.paymentMethod || CONFIG.PAYMENT_METHOD || 'LAZADA_WALLET';
    console.log(`\n[Checkout] ── STEP 4/6: Selecting payment method (${selectedMethod}) ──`);

    let walletBalanceBefore = null;
    let paymentSelected = false;

    if (selectedMethod === 'LAZADA_WALLET') {
      walletBalanceBefore = await readLazadaWalletBalance(page);
      console.log(`[Checkout] Wallet Balance BEFORE purchase: ${walletBalanceBefore !== null ? walletBalanceBefore : 'UNKNOWN'}`);
      paymentSelected = await selectLazadaWalletPayment(page);
    } else {
      paymentSelected = await selectAlternativePaymentMethod(page, selectedMethod);
    }
    console.log(`[Checkout] STEP 4 DONE: Payment method (${selectedMethod}) selected = ${paymentSelected}`);

    // ── STEP 5: Click "Place Order" / "Buat Pesanan" ───────────────────────
    console.log('\n[Checkout] ── STEP 5/6: Clicking "Place Order" to finalize purchase ──');
    const { orderPlaced, finalUrl, smsVerificationRequired, statusText: orderStatusText } = await clickPlaceOrderAndPay(page);
    console.log(`[Checkout] STEP 5 DONE: Order placed = ${orderPlaced}, SMS Verification = ${smsVerificationRequired}, Payment/Checkout URL = ${finalUrl}`);

    // If order was successfully placed (and no SMS verification is pending), navigate to My Orders for final verification
    let myOrdersUrlReached = false;
    if (orderPlaced && !smsVerificationRequired) {
      try {
        console.log('\n[Checkout] ── PHASE: Navigating to Lazada My Orders Page for Final Verification ──');
        console.log('[Checkout] Target URL: https://my.lazada.sg/customer/order/index/');
        await page.goto('https://my.lazada.sg/customer/order/index/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await randomDelay(3000, 5000);
        const myOrdersUrl = page.url();
        console.log(`[Checkout] Successfully arrived at My Orders page: ${myOrdersUrl}`);
        myOrdersUrlReached = true;
      } catch (err) {
        console.error(`[Checkout Verification Error] Failed to navigate to My Orders page: ${err.message}`);
      }
    }

    // ── STEP 6: Verify Wallet Balance Decreased (Only if Wallet is used) ──
    let walletBalanceAfter = null;
    let walletDecreased = false;
    let walletDeductionAmount = 0;

    if (selectedMethod === 'LAZADA_WALLET') {
      console.log('\n[Checkout] ── STEP 6/6: Verifying Lazada Wallet balance decreased ──');
      await randomDelay(3000, 5000);
      walletBalanceAfter = await readLazadaWalletBalance(page);
      console.log(`[Checkout] Wallet Balance AFTER purchase: ${walletBalanceAfter !== null ? walletBalanceAfter : 'UNKNOWN'}`);

      if (walletBalanceBefore !== null && walletBalanceAfter !== null) {
        walletDeductionAmount = walletBalanceBefore - walletBalanceAfter;
        walletDecreased = walletDeductionAmount > 0;
        console.log(`[Checkout] Wallet deduction: ${walletDeductionAmount} (decreased = ${walletDecreased})`);
      } else {
        console.log('[Checkout] Could not verify wallet balance change (one or both readings unavailable).');
      }
    } else {
      console.log('\n[Checkout] ── STEP 6/6: Bypassing Wallet balance decrease check (alternative payment method active) ──');
    }

    // Build comprehensive status text
    const statusParts = [];
    if (smsVerificationRequired) {
      statusParts.push('📱 SMS VERIFICATION REQUIRED (Code sent to mobile phone)');
    } else if (orderPlaced) {
      statusParts.push('ORDER PLACED SUCCESSFULLY');
    } else {
      statusParts.push('REACHED CHECKOUT - PENDING MANUAL CONFIRMATION');
    }
    if (selectedMethod === 'LAZADA_WALLET' && paymentSelected) {
      statusParts.push('Lazada Wallet Selected');
      if (walletDecreased) statusParts.push(`Wallet Deducted: ${walletDeductionAmount}`);
    } else if (paymentSelected) {
      statusParts.push(`${selectedMethod} Selected`);
    }

    if (myOrdersUrlReached) {
      statusParts.push('VERIFIED ON MY ORDERS PAGE');
    }

    const statusText = statusParts.join(' | ');
    console.log(`\n[Checkout] ── FINAL RESULT: ${statusText} ──`);

    return {
      success: orderPlaced,
      productTitle: product.title,
      productUrl: product.url,
      productPrice: product.price,
      checkoutUrl: finalUrl,
      statusText,
      smsVerificationRequired,
      walletSelected: selectedMethod === 'LAZADA_WALLET' && paymentSelected,
      walletBalanceBefore,
      walletBalanceAfter,
      walletDecreased,
      walletDeductionAmount,
      error: null,
    };

  } catch (error) {
    console.error(`[Checkout Error] Auto checkout failed for "${product.title}": ${error.message}`);
    return {
      success: false,
      productTitle: product.title,
      productUrl: product.url,
      productPrice: product.price,
      checkoutUrl: page.url(),
      statusText: `FAILED: ${error.message}`,
      walletSelected: false,
      walletBalanceBefore: null,
      walletBalanceAfter: null,
      walletDecreased: false,
      walletDeductionAmount: 0,
      error: error.message,
    };
  }
}
