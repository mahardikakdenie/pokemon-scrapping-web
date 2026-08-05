import { scrapeLazadaProducts } from './scraper.js';
import { saveAndCompare, displayProductTable } from './storage.js';

async function main() {
  console.log('==================================================');
  console.log(' Starting Lazada Price & Stock Scraper Task');
  console.log('==================================================');
  const startTime = Date.now();

  try {
    const products = await scrapeLazadaProducts();
    
    // Display extracted price & stock in terminal table format
    displayProductTable(products);

    // Save and compare product history
    const result = saveAndCompare(products);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n==================================================');
    console.log('Task completed successfully.');
    console.log(`- Execution Time: ${duration}s`);
    console.log(`- Processed Items: ${result.total}`);
    console.log(`- Changes Detected: ${result.changesCount}`);
    console.log('==================================================');

  } catch (error) {
    if (error.message.includes('BLOCKER_DETECTED')) {
      console.warn('\n[Main WARNING] Task paused: CAPTCHA / anti-bot challenge encountered.');
      console.warn('[Main WARNING] Please wait or run the script again later when rate limit resets.');
    } else {
      console.error('\n[Main ERROR] Task execution failed:', error.message);
    }
    process.exit(1);
  }
}

main();
