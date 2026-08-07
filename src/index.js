import { scrapeLazadaProductsViaAPI } from './scraper.js';
import { processAutoCheckout, fetchWalletBalanceFromAccountPage, parseProductPriceToNumber } from './checkout.js';
import { sendConsolidatedPurchaseEmail, sendFailureEmail } from './mailer.js';
import { loadLastHistory, saveTimestampedHistory, compareSnapshots, displayProductTable, loadPurchasedProductIds, recordPurchasedProductId } from './storage.js';
import { CONFIG } from './config.js';

let isRunningTask = false;
let cronTimer = null;

/**
 * Single execution cycle for Lazada scraping with smart wallet-aware purchasing.
 *
 * FLOW:
 *   PHASE 1: Load previous snapshot from disk
 *   PHASE 2: Scrape all products via API
 *   PHASE 3: Display products in terminal & save history
 *   PHASE 4: Compare snapshots to find purchase triggers
 *   PHASE 5: CHECK LAZADA WALLET BALANCE (navigate to wallet page)
 *   PHASE 6: CALCULATE which in-stock products can be afforded
 *   PHASE 7: PURCHASE affordable products one-by-one (PDP → Buy → Checkout → Place Order)
 *   PHASE 8: Send exactly ONE consolidated email with results
 */
async function runScrapeCycle() {
  if (isRunningTask) {
    console.log('[Scheduler] Scrape cycle already in progress. Skipping duplicate tick.');
    return;
  }

  isRunningTask = true;
  const startTime = new Date();
  console.log('\n==================================================');
  console.log(`[Task Started] Execution Cycle at ${startTime.toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}`);
  console.log('==================================================');

  let sessionResult = null;

  try {
    // ── PHASE 1: Load previous product snapshot ────────────────────────────
    console.log('\n[Phase 1] Loading previous product snapshot...');
    const previousSnapshotMap = loadLastHistory();

    // ── PHASE 2: Execute multi-page API scraping ───────────────────────────
    console.log('\n[Phase 2] Executing multi-page API scraping...');
    sessionResult = await scrapeLazadaProductsViaAPI();
    const { pageInstance, contextInstance, totalPagesChecked } = sessionResult;
    let products = sessionResult.products;

    // Apply testing limit if configured (slice to cheapest N items)
    if (CONFIG.TEST_LIMIT_PRODUCTS > 0 && products.length > 0) {
      console.log(`\n[Test Mode] Limiting list to the cheapest ${CONFIG.TEST_LIMIT_PRODUCTS} products...`);
      products.sort((a, b) => parseProductPriceToNumber(a.price) - parseProductPriceToNumber(b.price));
      products = products.slice(0, CONFIG.TEST_LIMIT_PRODUCTS);
    }

    // ── PHASE 3: Display products & save history ───────────────────────────
    console.log('\n[Phase 3] Displaying product table and saving history...');
    displayProductTable(products);

    const inStockProducts = products.filter((p) => p.inStock === true);
    console.log(`\n[Stock Status] In-Stock Items Found: ${inStockProducts.length} / ${products.length}`);

    saveTimestampedHistory(products);

    // ── PHASE 4: Compare snapshots to find purchase triggers ───────────────
    console.log('\n[Phase 4] Comparing snapshots for purchase triggers...');
    const comparison = compareSnapshots(previousSnapshotMap, products);
    const checkoutResults = [];
    const skippedProducts = [];
    let walletBalance = null;
    let walletBalanceAfterPurchases = null;

    if (!comparison.isInitialRun && CONFIG.AUTO_BUY_ENABLED) {

      // Collect ALL products that should trigger a purchase
      const purchaseTriggers = [];

      // Trigger A: New in-stock products
      for (const newProd of comparison.newProducts) {
        if (newProd.inStock) {
          purchaseTriggers.push({
            product: newProd,
            reason: 'New Product In-Stock Alert',
          });
        }
      }

      // Trigger B: Stock increase / back-in-stock products
      for (const stockItem of comparison.stockIncreases) {
        purchaseTriggers.push({
          product: stockItem.product,
          reason: 'Stock Increase / Back-in-Stock Alert',
        });
      }

      // Trigger C: Any currently in-stock product that is NOT already in the
      // trigger list from Trigger A or B, and has NOT been purchased/attempted previously.
      // This ensures that products which have been in-stock since previous cycles are
      // still purchased once, without looping continuously.
      const purchasedSet = loadPurchasedProductIds();
      const alreadyTriggeredIds = new Set(purchaseTriggers.map((t) => t.product.id));
      for (const product of inStockProducts) {
        if (!alreadyTriggeredIds.has(product.id) && !purchasedSet.has(product.id)) {
          purchaseTriggers.push({
            product,
            reason: 'In-Stock & Affordable (Wallet Budget Check)',
          });
        }
      }

      console.log(`[Phase 4] Total purchase candidates: ${purchaseTriggers.length} (Trigger A/B: ${alreadyTriggeredIds.size}, Trigger C: ${purchaseTriggers.length - alreadyTriggeredIds.size})`);

      if (purchaseTriggers.length > 0) {
        console.log(`\n[Phase 4] Found ${purchaseTriggers.length} product(s) eligible for auto-purchase.`);

        if (CONFIG.PAYMENT_METHOD === 'LAZADA_WALLET') {
          // ── PHASE 5: CHECK LAZADA WALLET BALANCE ─────────────────────────
          console.log('\n[Phase 5] Checking Lazada Wallet balance before purchasing...');
          walletBalance = await fetchWalletBalanceFromAccountPage(pageInstance);

          if (walletBalance === null) {
            console.log('[Phase 5] ⚠️ WARNING: Could not read wallet balance. Will attempt purchases anyway.');
            console.log('[Phase 5] Products will be processed without budget validation.');

            // If we cannot read the wallet, still attempt all purchases
            for (let i = 0; i < purchaseTriggers.length; i++) {
              const trigger = purchaseTriggers[i];
              console.log(`\n[Auto-Buy] Attempting purchase (no budget check) ${i + 1}/${purchaseTriggers.length}: "${trigger.product.title}"`);
              const res = await processAutoCheckout(pageInstance, trigger.product, {
                useLazadaWallet: CONFIG.USE_LAZADA_POINTS,
                paymentMethod: CONFIG.PAYMENT_METHOD,
                triggerReason: `${trigger.reason} (Item ${i + 1} of ${purchaseTriggers.length})`,
              });
              checkoutResults.push(res);

              if (res.success || res.smsVerificationRequired) {
                // Record to purchased_products.json to prevent duplicate loop attempts
                recordPurchasedProductId(trigger.product.id);
              }
            }

          } else {
            console.log(`\n[Phase 5] ✅ Lazada Wallet Balance: $${walletBalance.toFixed(2)}`);

            // ── PHASE 6: CALCULATE which products can be afforded ────────
            console.log('\n[Phase 6] Calculating budget-aware purchase plan...');

            // Parse prices and sort by price ascending (cheapest first)
            const pricedTriggers = purchaseTriggers.map((trigger) => {
              const numericPrice = parseProductPriceToNumber(trigger.product.price);
              return { ...trigger, numericPrice };
            });

            pricedTriggers.sort((a, b) => a.numericPrice - b.numericPrice);

            let remainingBudget = walletBalance;
            const affordableProducts = [];

            console.log(`\n[Phase 6] ── BUDGET CALCULATION TABLE ──`);
            console.log(`   Wallet Balance: $${walletBalance.toFixed(2)}`);
            console.log(`   ─────────────────────────────────────`);

            for (const trigger of pricedTriggers) {
              const price = trigger.numericPrice;
              const title = trigger.product.title;

              if (price <= 0) {
                console.log(`   ⚠️ "${title}" → Price could not be parsed (${trigger.product.price}). SKIPPING.`);
                skippedProducts.push({
                  product: trigger.product,
                  reason: `Price not parseable: ${trigger.product.price}`,
                });
                continue;
              }

              if (price <= remainingBudget) {
                console.log(`   ✅ "${title}" → $${price.toFixed(2)} ≤ $${remainingBudget.toFixed(2)} remaining → WILL BUY`);
                remainingBudget -= price;
                affordableProducts.push(trigger);
              } else {
                console.log(`   ❌ "${title}" → $${price.toFixed(2)} > $${remainingBudget.toFixed(2)} remaining → TOO EXPENSIVE`);
                skippedProducts.push({
                  product: trigger.product,
                  reason: `Insufficient balance: needs $${price.toFixed(2)}, only $${remainingBudget.toFixed(2)} left`,
                });
              }
            }

            console.log(`   ─────────────────────────────────────`);
            console.log(`   Affordable: ${affordableProducts.length} product(s)`);
            console.log(`   Skipped:    ${skippedProducts.length} product(s)`);
            console.log(`   Remaining:  $${remainingBudget.toFixed(2)} (projected)\n`);

            // ── PHASE 7: PURCHASE affordable products one-by-one ─────────
            if (affordableProducts.length > 0) {
              console.log(`\n[Phase 7] Purchasing ${affordableProducts.length} affordable product(s)...\n`);

              for (let i = 0; i < affordableProducts.length; i++) {
                const trigger = affordableProducts[i];
                console.log(`\n[Phase 7] ── Purchase ${i + 1}/${affordableProducts.length}: "${trigger.product.title}" ──`);

                const res = await processAutoCheckout(pageInstance, trigger.product, {
                  useLazadaWallet: true,
                  paymentMethod: 'LAZADA_WALLET',
                  triggerReason: `${trigger.reason} (Item ${i + 1} of ${affordableProducts.length})`,
                });
                checkoutResults.push(res);

                if (res.success || res.smsVerificationRequired) {
                  // Record to purchased_products.json to prevent duplicate loop attempts
                  recordPurchasedProductId(trigger.product.id);
                }
              }

              // Read final wallet balance after all purchases
              walletBalanceAfterPurchases = await fetchWalletBalanceFromAccountPage(pageInstance);
              if (walletBalanceAfterPurchases !== null) {
                console.log(`\n[Phase 7] Wallet Balance AFTER all purchases: $${walletBalanceAfterPurchases.toFixed(2)}`);
                console.log(`[Phase 7] Total Deducted: $${(walletBalance - walletBalanceAfterPurchases).toFixed(2)}`);
              }
            } else {
              console.log('\n[Phase 7] No affordable products to purchase. Skipping checkout phase.');
            }
          }
        } else {
          // ── ALTERNATIVE MANUAL / COD / BANK TRANSFER PAYMENT FLOW ──
          console.log(`\n[Phase 5-6] Using Alternative Payment Method: ${CONFIG.PAYMENT_METHOD}`);
          console.log('[Phase 5-6] Bypassing Wallet balance check. All in-stock products will be processed for manual payment placement.');

          for (let i = 0; i < purchaseTriggers.length; i++) {
            const trigger = purchaseTriggers[i];
            console.log(`\n[Phase 7] ── Purchase ${i + 1}/${purchaseTriggers.length}: "${trigger.product.title}" (${CONFIG.PAYMENT_METHOD}) ──`);

            const res = await processAutoCheckout(pageInstance, trigger.product, {
              useLazadaWallet: false,
              paymentMethod: CONFIG.PAYMENT_METHOD,
              triggerReason: `${trigger.reason} [${CONFIG.PAYMENT_METHOD}] (Item ${i + 1} of ${purchaseTriggers.length})`,
            });
            checkoutResults.push(res);

            if (res.success || res.smsVerificationRequired) {
              recordPurchasedProductId(trigger.product.id);
            }
          }
        }
      } else {
        console.log('[Phase 4] No purchase triggers detected in this cycle.');
      }

    } else if (comparison.isInitialRun) {
      console.log('[Phase 4] Initial run detected. Baseline snapshot created. Skipping purchases.');
    } else if (!CONFIG.AUTO_BUY_ENABLED) {
      console.log('[Phase 4] Auto-buy is disabled in configuration. Skipping purchases.');
    }

    // ── PHASE 8: Send exactly ONE consolidated email ───────────────────────
    console.log('\n[Phase 8] Sending single consolidated email report...');
    await sendConsolidatedPurchaseEmail({
      checkoutResults,
      allProducts: products,
      inStockProducts,
      totalPagesChecked,
      newProducts: comparison.isInitialRun ? [] : comparison.newProducts,
      stockIncreases: comparison.isInitialRun ? [] : comparison.stockIncreases,
      priceHighlights: comparison.isInitialRun ? [] : comparison.priceHighlights,
      walletBalanceBefore: walletBalance,
      walletBalanceAfter: walletBalanceAfterPurchases,
      skippedProducts,
    });

    // ── Cleanup browser context ────────────────────────────────────────────
    await contextInstance.close().catch(() => {});
    console.log('==================================================');
    console.log('[Task Completed] Cycle completed successfully.');
    console.log('==================================================');

  } catch (error) {
    console.error('\n[Main Error] Execution cycle encountered failure:', error.message || error);
    console.log('[Email] Sending blocker/failure notification...');
    await sendFailureEmail(error);
  } finally {
    isRunningTask = false;
  }
}

/**
 * Main entrypoint starting continuous CRON schedule loop.
 */
async function main() {
  const isOnceMode = process.argv.includes('--once');
  const intervalMinutes = Math.max(1, Math.min(5, CONFIG.CRON_INTERVAL_MINUTES || 2));
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log('==================================================');
  console.log(' Lazada Stock Scraper & Smart Auto-Checkout Daemon');
  console.log('==================================================');
  console.log(` Mode: ${isOnceMode ? 'Single Run (--once)' : `Continuous CRON Schedule (Every ${intervalMinutes} Minute(s))`}`);
  console.log(` Interval: ${intervalMinutes} minute(s) [${intervalMs} ms]`);
  console.log(' Target URL:', CONFIG.TARGET_URL);
  console.log(' Email Recipients:', CONFIG.EMAIL.RECIPIENT);
  console.log(' Auto-Buy:', CONFIG.AUTO_BUY_ENABLED ? 'ENABLED' : 'DISABLED');
  console.log(' History Dir:', CONFIG.HISTORY_DIR);
  console.log('==================================================\n');

  // Run initial cycle immediately
  await runScrapeCycle();

  if (isOnceMode) {
    console.log('[Runner] Single run mode completed. Exiting.');
    process.exit(0);
  }

  // Setup continuous loop schedule
  console.log(`\n[Scheduler] Scheduling next execution cycle in ${intervalMinutes} minute(s)...`);
  cronTimer = setInterval(async () => {
    await runScrapeCycle();
    console.log(`\n[Scheduler] Waiting ${intervalMinutes} minute(s) for next scheduled cycle...`);
  }, intervalMs);

  // Handle graceful shutdown
  const shutdownHandler = (signal) => {
    console.log(`\n[Scheduler] Received ${signal}. Shutting down continuous daemon...`);
    if (cronTimer) clearInterval(cronTimer);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdownHandler('SIGINT'));
  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
}

main();
