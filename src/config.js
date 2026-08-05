import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONFIG = {
  TARGET_URL: 'https://www.lazada.sg/pokemon-store-online-singapore/?spm=a2o42.10453684.0.0.28e55edf7xRX14&q=All-Products&shop_category_ids=762252&from=wangpu&sc=KVUG&search_scenario=store&src=store_sections&hideSectionHeader=true&shopId=2056827',
  DATA_DIR: path.join(__dirname, '../data'),
  OUTPUT_FILE: path.join(__dirname, '../data/products_history.json'),
  CHANGES_FILE: path.join(__dirname, '../data/price_changes.json'),

  // ---------- Browser Settings ----------
  HEADLESS: true,
  TIMEOUT: 45000,
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',

  // ---------- Persistent Session ----------
  // Directory to store browser profile (cookies, localStorage, etc.)
  SESSION_DIR: path.join(__dirname, '../.browser-session'),

  // ---------- Politeness & Human-Like Timing ----------
  MIN_DELAY: 3000,
  MAX_DELAY: 6000,
  // Extra delay between detail page visits (ms)
  PAGE_VISIT_MIN_DELAY: 4000,
  PAGE_VISIT_MAX_DELAY: 8000,

  // ---------- CAPTCHA Retry Settings ----------
  MAX_CAPTCHA_RETRIES: 3,
  CAPTCHA_BACKOFF_BASE_MS: 15000, // 15 seconds base wait on CAPTCHA detection
  CAPTCHA_BACKOFF_MULTIPLIER: 2, // exponential backoff multiplier

  // ---------- DOM Selectors for Anti-Bot Detection ----------
  BLOCKER_SELECTORS: [
    '#nc_1_wrapper',
    '.baxia-dialog',
    '#captcha-image',
    '[id*="captcha"]',
    'iframe[src*="captcha"]',
    '.punish-page',
    '.J_MIDDLEWARE_FRAME_WIDGET',
    '#nocaptcha',
    '.nc-container',
    '.login-container .baxia-dialog'
  ]
};

