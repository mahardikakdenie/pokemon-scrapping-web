# Lazada Stock & Price Scraper with Automated Checkout

An automated NodeJS application for tracking product stock and price changes on Lazada Singapore, supporting session management, email notifications, and automated checkout routines.

---

## Table of Contents
- [Prerequisites](#prerequisites)
- [Installation & Quick Start](#installation--quick-start)
- [Environment Variables (.env)](#environment-variables-env)
- [NPM Scripts & Command Reference](#npm-scripts--command-reference)
- [Session Management Workflow](#session-management-workflow)

---

## Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v8.0.0 or higher
- **Browser**: Playwright bundled Chromium browser

---

## Installation & Quick Start

Follow this step-by-step workflow to get the bot up and running quickly for first-time users.

### Step 1: Clone Repository
Navigate to the root project directory:
```bash
cd scrapping-web
```

### Step 2: Install Dependencies
Install all required Node.js libraries and Playwright dependencies:
```bash
npm install
```

### Step 3: Configure Environment
Copy `.env.example` to create your local `.env` configuration file:
```bash
cp .env.example .env
```
*(Optionally open `.env` to customize recipient email or target URL settings).*

### Step 4: Initialize or Refresh Session
- **First-Time Users**: Run the interactive session warm-up command to log in to your Lazada SG account manually:
  ```bash
  npm run warm-session
  ```
- **Session Refresh**: Refresh your existing authentication session:
  ```bash
  npm run refresh
  ```

### Step 5: Start the Bot
Launch the main periodic scraper and automated purchasing engine:
```bash
npm run bot
```
*(Note: You can also use `npm start`).*

---

## Environment Variables (.env)

The application uses environment variables loaded via `dotenv`. Below is a detailed breakdown of all supported environment variables, their necessity, default values, and usage.

### 1. Required / Core Variables

While default fallbacks exist for local testing, setting these core parameters ensures the scraper targets the correct store and category.

| Variable Name | Required? | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `TARGET_URL` | **Recommended** | Official Pokemon SG Store URL | Full target URL of the Lazada SG store page to scrape. |
| `SHOP_ID` | **Recommended** | `2056827` | Lazada internal Shop ID used for API payload filtering. |
| `SHOP_CATEGORY_ID` | **Recommended** | `762252` | Category ID filter for target shop products. |

---

### 2. Optional Variables (With Defaults)

These parameters control operational parameters such as execution frequency, page limits, and browser visibility.

| Variable Name | Required? | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `MAX_API_PAGES` | **Optional** | `10` | Maximum number of pagination pages to fetch from Lazada API. |
| `CRON_INTERVAL_MINUTES` | **Optional** | `2` | Interval frequency (in minutes) for continuous scheduled scraping. |
| `HEADLESS` | **Optional** | `false` | `true` to run Playwright in background (headless), `false` to display GUI browser window. |
| `TEST_LIMIT_PRODUCTS` | **Optional** | `0` | Limit total products evaluated during execution (`0` processes all fetched items). |

---

### 3. Feature-Dependent Variables

#### A. Email Notifications (Nodemailer)
*Required only if email alerting on stock or price changes is desired.*

| Variable Name | Required? | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `EMAIL_SERVICE` | **Conditional** | `gmail` | Email service provider (e.g., `gmail`, `smtp`). |
| `EMAIL_USER` | **Conditional** | `""` | Sender email address (e.g., `your_email@gmail.com`). |
| `EMAIL_PASS` | **Conditional** | `""` | App-specific SMTP password or OAuth credentials. |
| `EMAIL_RECIPIENT` | **Conditional** | `""` | Destination recipient email address(es), separated by commas for multiple recipients. |

#### B. Auto Checkout & Purchase Engine
*Required when automatic order placement is enabled.*

| Variable Name | Required? | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `AUTO_BUY_ENABLED` | **Optional** | `true` | `true` enables auto-checkout routine when in-stock targets are found; `false` disables purchase triggers. |
| `ALLOW_REPURCHASE_IN_STOCK` | **Optional** | `true` | `true` allows re-purchasing items already marked as bought in history logs. |
| `USE_LAZADA_POINTS` | **Optional** | `true` | `true` attempts to apply Lazada Coins/Points discounts during checkout. |
| `PAYMENT_METHOD` | **Optional** | `LAZADA_WALLET` | Selected payment option (e.g., `LAZADA_WALLET`, `PAYNOW_TRANSFER`). |

---

## NPM Scripts & Command Reference

Execute these commands using `npm run <command-name>` or `npm start`.

| Command | Executed Script | Description & Purpose |
| :--- | :--- | :--- |
| `npm run bot` / `npm start` | `node src/index.js` | **Main Runner**: Starts scheduled periodic automated scraping, checks stock changes, sends alerts, and executes checkout routines. |
| `npm run scrape` | `node src/scraper.js` | **Single Scrape Run**: Performs a one-time product scrape and stock check without recurring scheduler loop. |
| `npm run warm-session` | `node src/warm-session.js` | **Session Initializer**: Launches an interactive browser window to manually log in to Lazada and save session cookies/tokens to `.browser-session`. |
| `npm run import-cookies` | `node src/import-cookies.js` | **Cookie Importer**: Imports pre-existing session cookies directly into local session storage. |
| `npm run refresh` / `npm run refresh-session` | `node src/session-refresh.js` | **Session Refresher**: Refreshes current authentication token and browser state to prevent session expiration. |
| `npm run auto-refresh` | `node src/session-scheduler.js` | **Background Session Daemon**: Runs a continuous background timer to automatically refresh session cookies at regular intervals. |
| `npm run open-browser` | `node src/open-session-browser.js` | **Debug Browser**: Opens a GUI browser instance loaded with saved `.browser-session` credentials for manual verification. |
| `npm run session-status` | Inline Node Snippet | **Session Monitor**: Inspects and logs current session status, creation timestamps, and age to terminal. |

---

## Session Management Workflow

To maintain an authenticated session for automated purchasing:
1. Run `npm run warm-session` to log into your Lazada SG account manually.
2. Verify session saved in `.browser-session/`.
3. (Optional) Run `npm run auto-refresh` in a separate terminal window to keep session cookies alive.
4. Launch `npm start` to run scheduled monitoring and auto-checkout.
