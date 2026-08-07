import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Initialize dotenv to populate process.env from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONFIG = {
  TARGET_URL: process.env.TARGET_URL || 'https://www.lazada.sg/pokemon-store-online-singapore/?spm=a2o42.10453684.0.0.28e55edf7xRX14&q=All-Products&shop_category_ids=762252&from=wangpu&sc=KVUG&search_scenario=store&src=store_sections&hideSectionHeader=true&shopId=2056827',

  // API Parameters
  SHOP_ID: process.env.SHOP_ID !== undefined && process.env.SHOP_ID !== '' ? process.env.SHOP_ID : '',
  SHOP_CATEGORY_ID: process.env.SHOP_CATEGORY_ID !== undefined && process.env.SHOP_CATEGORY_ID !== '' ? process.env.SHOP_CATEGORY_ID : '',
  MAX_API_PAGES: parseInt(process.env.MAX_API_PAGES || '10', 10),

  // Auto Checkout Flags
  AUTO_BUY_ENABLED: process.env.AUTO_BUY_ENABLED !== 'false',
  ALLOW_REPURCHASE_IN_STOCK: process.env.ALLOW_REPURCHASE_IN_STOCK !== 'false',
  USE_LAZADA_POINTS: process.env.USE_LAZADA_POINTS !== 'false',
  PAYMENT_METHOD: (process.env.PAYMENT_METHOD || 'LAZADA_WALLET').toUpperCase(),
  TEST_LIMIT_PRODUCTS: parseInt(process.env.TEST_LIMIT_PRODUCTS || '0', 10),

  // Scheduler / CRON Settings
  CRON_INTERVAL_MINUTES: parseFloat(process.env.CRON_INTERVAL_MINUTES || '2'),

  DATA_DIR: path.join(__dirname, '../data'),
  HISTORY_DIR: path.join(__dirname, '../data/product_history'),
  LAST_HISTORY_FILE: path.join(__dirname, '../data/product_last_history.json'),
  OUTPUT_FILE: path.join(__dirname, '../data/products_history.json'),
  CHANGES_FILE: path.join(__dirname, '../data/price_changes.json'),

  // Email Notification Settings (Nodemailer)
  EMAIL: {
    SERVICE: process.env.EMAIL_SERVICE || 'gmail',
    USER: process.env.EMAIL_USER || '',
    PASS: process.env.EMAIL_PASS || '',
    RECIPIENT: process.env.EMAIL_RECIPIENT || ''
  },

  // Browser Settings
  HEADLESS: process.env.HEADLESS === 'true',
  TIMEOUT: 60000,

  USER_AGENTS: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  ],

  SESSION_DIR: path.join(__dirname, '../.browser-session'),
  SESSION_MAX_AGE_HOURS: 6,

  // Human behavior & retries
  MIN_DELAY: 2000,
  MAX_DELAY: 5000,
  MAX_CAPTCHA_RETRIES: 3,
  CAPTCHA_BACKOFF_BASE_MS: 15000,
  CAPTCHA_BACKOFF_MULTIPLIER: 2,

  VIEWPORTS: [
    { width: 1366, height: 768 }
  ],

  BLOCKER_SELECTORS: [
    '#nc_1_wrapper',
    '.baxia-dialog',
    '#captcha-image',
    '[id*="captcha"]',
    'iframe[src*="captcha"]',
    '.punish-page'
  ]
};

CONFIG.USER_AGENT = CONFIG.USER_AGENTS[0];
CONFIG.VIEWPORT = CONFIG.VIEWPORTS[0];
