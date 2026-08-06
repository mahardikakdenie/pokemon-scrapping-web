import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.js';

/**
 * Ensures required data and product_history directories exist.
 */
export function ensureDataDirsExist() {
  if (!fs.existsSync(CONFIG.DATA_DIR)) {
    fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG.HISTORY_DIR)) {
    fs.mkdirSync(CONFIG.HISTORY_DIR, { recursive: true });
  }
}

/**
 * Loads previous product snapshot from product_last_history.json
 * @returns {Record<string, any>}
 */
export function loadLastHistory() {
  ensureDataDirsExist();
  if (fs.existsSync(CONFIG.LAST_HISTORY_FILE)) {
    try {
      const raw = fs.readFileSync(CONFIG.LAST_HISTORY_FILE, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[Storage] Could not parse product_last_history.json. Starting fresh.');
    }
  }
  return {};
}

/**
 * Saves timestamped JSON file to data/product_history/{file_date}_product_history.json
 * and updates data/product_last_history.json snapshot.
 * 
 * @param {Array<any>} latestProducts 
 * @returns {string} Saved timestamped filepath
 */
export function saveTimestampedHistory(latestProducts) {
  ensureDataDirsExist();

  const now = new Date();
  const dateStr = now.toISOString().replace(/T/, '_').replace(/:/g, '-').replace(/\..+/, '');
  const fileName = `${dateStr}_product_history.json`;
  const filePath = path.join(CONFIG.HISTORY_DIR, fileName);

  fs.writeFileSync(filePath, JSON.stringify(latestProducts, null, 2), 'utf-8');
  console.log(`[Storage] Saved timestamped history: ${filePath}`);

  const currentMap = {};
  for (const item of latestProducts) {
    currentMap[item.id] = item;
  }

  fs.writeFileSync(CONFIG.LAST_HISTORY_FILE, JSON.stringify(currentMap, null, 2), 'utf-8');
  console.log(`[Storage] Updated snapshot file: ${CONFIG.LAST_HISTORY_FILE}`);

  return filePath;
}

/**
 * Compares current product list against last history snapshot map.
 * Categorizes events into newProducts, stockIncreases, and priceHighlights.
 * 
 * @param {Record<string, any>} previousMap 
 * @param {Array<any>} currentProducts 
 * @returns {Object} { newProducts, stockIncreases, priceHighlights, hasChanges }
 */
export function compareSnapshots(previousMap, currentProducts) {
  const newProducts = [];
  const stockIncreases = [];
  const priceHighlights = [];

  const isInitialRun = !previousMap || Object.keys(previousMap).length === 0;

  for (const item of currentProducts) {
    const prevItem = previousMap[item.id];

    if (!prevItem) {
      if (!isInitialRun) {
        newProducts.push(item);
      }
    } else {
      const prevInStock = prevItem.inStock === true;
      const currInStock = item.inStock === true;

      if (!prevInStock && currInStock) {
        stockIncreases.push({
          product: item,
          reason: 'Back in Stock (Out of Stock -> In Stock)'
        });
      }

      if (prevItem.price !== item.price) {
        priceHighlights.push({
          product: item,
          oldPrice: prevItem.price,
          newPrice: item.price,
          changeType: 'PRICE_CHANGE'
        });
      }
    }
  }

  const hasChanges = newProducts.length > 0 || stockIncreases.length > 0 || priceHighlights.length > 0;

  console.log(`[Comparison] Changes summary -> New: ${newProducts.length}, Stock Increased: ${stockIncreases.length}, Highlights: ${priceHighlights.length}`);

  return {
    newProducts,
    stockIncreases,
    priceHighlights,
    hasChanges,
    isInitialRun
  };
}

/**
 * Displays scraped products in console table with Quantity column
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
    'Quantity': item.quantity || item.stockQuantity || 'N/A',
    'Sold Count': item.soldCount || '-'
  }));

  console.table(tableData);
  console.log('====================================================================================================\n');
}
