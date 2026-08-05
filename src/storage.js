import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.js';

/**
 * Ensures data directory exists
 */
function ensureDataDirExists() {
  if (!fs.existsSync(CONFIG.DATA_DIR)) {
    fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
  }
}

/**
 * Loads existing saved product history
 * @returns {Record<string, any>}
 */
export function loadPreviousData() {
  ensureDataDirExists();
  if (fs.existsSync(CONFIG.OUTPUT_FILE)) {
    try {
      const raw = fs.readFileSync(CONFIG.OUTPUT_FILE, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[Storage] Could not parse existing history file, starting fresh.');
    }
  }
  return {};
}

/**
 * Displays scraped products in a clean, formatted terminal console table
 * @param {Array<any>} products 
 */
export function displayProductTable(products) {
  if (!products || products.length === 0) {
    console.log('\n[Display] No product data available to display.');
    return;
  }

  console.log('\n================================ SCRAPED PRODUCT PRICE & STOCK TABLE ================================');
  const tableData = products.map((item, idx) => ({
    '#': idx + 1,
    'Product Title': item.title.length > 45 ? item.title.substring(0, 42) + '...' : item.title,
    'Price': item.price,
    'Original Price': item.originalPrice !== item.price ? item.originalPrice : '-',
    'Stock Status': item.stockStatus,
    'Stock Detail': item.stockQuantity || '-'
  }));

  console.table(tableData);
  console.log('====================================================================================================\n');
}

/**
 * Saves updated product data and detects price/stock changes
 * @param {Array<any>} latestProducts 
 */
export function saveAndCompare(latestProducts) {
  ensureDataDirExists();
  const previousData = loadPreviousData();
  const currentData = {};
  const changes = [];

  for (const item of latestProducts) {
    const prevItem = previousData[item.id];
    currentData[item.id] = item;

    if (prevItem) {
      const priceChanged = prevItem.price !== item.price;
      const stockChanged = prevItem.stockStatus !== item.stockStatus || prevItem.stockQuantity !== item.stockQuantity;

      if (priceChanged || stockChanged) {
        changes.push({
          id: item.id,
          title: item.title,
          oldPrice: prevItem.price,
          newPrice: item.price,
          oldStockState: `${prevItem.stockStatus} (${prevItem.stockQuantity || 'N/A'})`,
          newStockState: `${item.stockStatus} (${item.stockQuantity || 'N/A'})`,
          timestamp: item.scrapedAt
        });
      }
    }
  }

  // Save current dataset snapshot
  fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(currentData, null, 2), 'utf-8');
  console.log(`[Storage] Saved updated dataset (${latestProducts.length} items) to ${CONFIG.OUTPUT_FILE}`);

  // Save change logs if changes were detected
  if (changes.length > 0) {
    let existingChanges = [];
    if (fs.existsSync(CONFIG.CHANGES_FILE)) {
      try {
        existingChanges = JSON.parse(fs.readFileSync(CONFIG.CHANGES_FILE, 'utf-8'));
      } catch (e) {}
    }
    const updatedChanges = [...existingChanges, ...changes];
    fs.writeFileSync(CONFIG.CHANGES_FILE, JSON.stringify(updatedChanges, null, 2), 'utf-8');
    console.log(`[Storage] Detected ${changes.length} price/stock change(s). Updated ${CONFIG.CHANGES_FILE}`);
  } else {
    console.log('[Storage] No price or stock changes detected compared to previous run.');
  }

  return { total: latestProducts.length, changesCount: changes.length };
}
