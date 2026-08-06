import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONFIG = {
  TARGET_URL: 'https://www.lazada.sg/pokemon-store-online-singapore/?spm=a2o42.10453684.0.0.28e55edf7xRX14&q=All-Products&shop_category_ids=762252&from=wangpu&sc=KVUG&search_scenario=store&src=store_sections&hideSectionHeader=true&shopId=2056827',

  // API Parameters
  SHOP_ID: '2056827',
  SHOP_CATEGORY_ID: '762252',
  MAX_API_PAGES: 10,

  // Scheduler / CRON Settings
  CRON_INTERVAL_MINUTES: parseFloat(process.env.CRON_INTERVAL_MINUTES || '2'), // Interval in minutes (1 to 5 minutes)

  DATA_DIR: path.join(__dirname, '../data'),
  HISTORY_DIR: path.join(__dirname, '../data/product_history'),
  LAST_HISTORY_FILE: path.join(__dirname, '../data/product_last_history.json'),
  OUTPUT_FILE: path.join(__dirname, '../data/products_history.json'),
  CHANGES_FILE: path.join(__dirname, '../data/price_changes.json'),

  // Email Notification Settings (Nodemailer)
  EMAIL: {
    SERVICE: 'gmail',
    USER: 'sctechnology100@gmail.com',
    PASS: 'ermzmxxflarrmbbq',
    RECIPIENT: 'dikamahar884@gmail.com, Keithchia1109@gmail.com,agek002@gmail.com'
  },

  // Browser Settings
  HEADLESS: false,
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
