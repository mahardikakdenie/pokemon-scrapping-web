import { scrapeLazadaProductsViaAPI } from './scraper.js';
import { processAutoCheckout } from './checkout.js';
import { sendStockSummaryEmail, sendComparisonEventEmail, sendFailureEmail } from './mailer.js';
import { loadLastHistory, saveTimestampedHistory, compareSnapshots, displayProductTable } from './storage.js';
import { CONFIG } from './config.js';

let isRunningTask = false;
let cronTimer = null;

/**
 * Single execution cycle for Lazada scraping, snapshot comparison, and checkout process.
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
    // 1. Load previous product snapshot BEFORE saving new run
    const previousSnapshotMap = loadLastHistory();

    // 2. Execute Multi-page API Scraping
    sessionResult = await scrapeLazadaProductsViaAPI();
    const { pageInstance, contextInstance, products, totalPagesChecked } = sessionResult;

    // 3. Display extracted products in terminal table
    displayProductTable(products);

    // 4. Send standard stock summary report email
    const inStockProducts = products.filter(p => p.inStock === true);
    console.log(`\n[Stock Status] In-Stock Items Found: ${inStockProducts.length} / ${products.length}`);
    console.log('[Email] Sending stock summary report email...');
    await sendStockSummaryEmail(products, inStockProducts, totalPagesChecked);

    // 5. Save timestamped JSON history to data/product_history/{date}_product_history.json
    // and update data/product_last_history.json
    saveTimestampedHistory(products);

    // 6. Compare new run against previous snapshot map
    const comparison = compareSnapshots(previousSnapshotMap, products);
    const checkoutResults = [];

    // 7. Handle Event Triggers (New Products & Stock Increases -> Auto Buy with Lazada Points)
    if (!comparison.isInitialRun) {
      // Trigger A: New Product In Stock -> Auto Buy
      for (const newProd of comparison.newProducts) {
        if (newProd.inStock) {
          console.log(`\n[Auto-Buy Trigger] NEW IN-STOCK PRODUCT DETECTED: "${newProd.title}"`);
          const res = await processAutoCheckout(pageInstance, newProd, {
            usePoints: true,
            triggerReason: 'New Product In-Stock Alert'
          });
          checkoutResults.push({ productTitle: newProd.title, ...res });
        }
      }

      // Trigger B: Stock Increase / Back In Stock -> Auto Buy
      for (const stockItem of comparison.stockIncreases) {
        console.log(`\n[Auto-Buy Trigger] STOCK INCREASE / BACK IN STOCK DETECTED: "${stockItem.product.title}"`);
        const res = await processAutoCheckout(pageInstance, stockItem.product, {
          usePoints: true,
          triggerReason: 'Stock Increase / Back-in-Stock Alert'
        });
        checkoutResults.push({ productTitle: stockItem.product.title, ...res });
      }

      // 8. If any changes or checkout executions occurred, send dedicated comparison event email
      if (comparison.hasChanges || checkoutResults.length > 0) {
        console.log('[Email] Sending comparison event notification email...');
        await sendComparisonEventEmail({
          newProducts: comparison.newProducts,
          stockIncreases: comparison.stockIncreases,
          priceHighlights: comparison.priceHighlights,
          checkoutResults
        });
      }
    } else {
      console.log('[Comparison] Initial run detected. Baseline snapshot created in data/product_last_history.json.');
    }

    // Clean up browser session context for this cycle
    await contextInstance.close().catch(() => {});
    console.log('==================================================');
    console.log('[Task Completed] Cycle completed successfully.');
    console.log('==================================================');

  } catch (error) {
    console.error('\n[Main Error] Execution cycle encountered failure:', error.message || error);
    console.log('[Email] Sending blocker/failure notification with fixing instructions...');
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
  console.log(' Lazada Stock Scraper & Auto-Checkout Daemon');
  console.log('==================================================');
  console.log(` Mode: ${isOnceMode ? 'Single Run (--once)' : `Continuous CRON Schedule (Every ${intervalMinutes} Minute(s))`}`);
  console.log(` Interval: ${intervalMinutes} minute(s) [${intervalMs} ms]`);
  console.log(' Target URL:', CONFIG.TARGET_URL);
  console.log(' Email Recipients:', CONFIG.EMAIL.RECIPIENT);
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
