import nodemailer from 'nodemailer';
import { CONFIG } from './config.js';

const transporter = nodemailer.createTransport({
  service: CONFIG.EMAIL.SERVICE,
  auth: {
    user: CONFIG.EMAIL.USER,
    pass: CONFIG.EMAIL.PASS
  }
});

/**
 * Sends an email notification to the target recipients.
 * @param {Object} mailOptions
 * @param {string} mailOptions.subject 
 * @param {string} mailOptions.htmlContent 
 */
export async function sendEmail({ subject, htmlContent }) {
  try {
    const info = await transporter.sendMail({
      from: `"Lazada Pokemon Bot" <${CONFIG.EMAIL.USER}>`,
      to: CONFIG.EMAIL.RECIPIENT,
      subject: subject,
      html: htmlContent
    });
    console.log(`[Email] Notification sent successfully. Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`[Email Error] Failed to send email: ${error.message}`);
    return false;
  }
}

/**
 * Send Event Comparison Notification Email (New Products, Stock Increases, Highlights)
 */
export async function sendComparisonEventEmail({ newProducts = [], stockIncreases = [], priceHighlights = [], checkoutResults = [] }) {
  let subjectPrefix = '[Lazada Bot - HIGHLIGHT]';
  if (newProducts.length > 0 || stockIncreases.length > 0) {
    subjectPrefix = '🚨 [URGENT ITEM & STOCK ALERT]';
  }

  const subject = `${subjectPrefix} Detected ${newProducts.length} New Item(s), ${stockIncreases.length} Stock Increase(s)`;

  const newProductsHtml = newProducts.length > 0 ? `
    <div style="margin-bottom: 20px; background: #ebf8ff; border-left: 5px solid #3182ce; padding: 15px; border-radius: 4px;">
      <h3 style="margin-top: 0; color: #2b6cb0;">🆕 NEW PRODUCTS DETECTED (${newProducts.length})</h3>
      <ul>
        ${newProducts.map(p => `
          <li>
            <b>${p.title}</b> - Price: <b>${p.price}</b> | Quantity: <b>${p.quantity || p.stockQuantity}</b> | Status: <b>${p.stockStatus}</b> 
            (<a href="${p.url}">View Product</a>)
          </li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  const stockIncreaseHtml = stockIncreases.length > 0 ? `
    <div style="margin-bottom: 20px; background: #feebc8; border-left: 5px solid #dd6b20; padding: 15px; border-radius: 4px;">
      <h3 style="margin-top: 0; color: #c05621;">📈 STOCK INCREASE / BACK IN STOCK (${stockIncreases.length})</h3>
      <ul>
        ${stockIncreases.map(item => `
          <li>
            <b>${item.product.title}</b> - Price: <b>${item.product.price}</b> | Quantity: <b>${item.product.quantity || item.product.stockQuantity}</b> | Reason: <b>${item.reason}</b> 
            (<a href="${item.product.url}">View Product</a>)
          </li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  const priceHighlightsHtml = priceHighlights.length > 0 ? `
    <div style="margin-bottom: 20px; background: #e6fffa; border-left: 5px solid #319795; padding: 15px; border-radius: 4px;">
      <h3 style="margin-top: 0; color: #234e52;">🏷️ PRICE / PROPERTY HIGHLIGHTS (${priceHighlights.length})</h3>
      <ul>
        ${priceHighlights.map(h => `
          <li>
            <b>${h.product.title}</b>: Price changed from <del>${h.oldPrice}</del> to <b>${h.newPrice}</b>
            (<a href="${h.product.url}">View Product</a>)
          </li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  const checkoutHtml = checkoutResults.length > 0 ? `
    <div style="margin-bottom: 20px; background: #d4edda; border-left: 5px solid #28a745; padding: 15px; border-radius: 4px;">
      <h3 style="margin-top: 0; color: #155724;">🛒 AUTO-CHECKOUT & FINAL PAYMENT SUMMARY (${checkoutResults.length})</h3>
      <ul>
        ${checkoutResults.map(res => `
          <li>
            Product: <b>${res.productTitle}</b> | Status: <b style="color: ${res.success ? 'green' : 'red'};">${res.statusText || res.error}</b>
          </li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }
        .container { max-width: 850px; background: #ffffff; margin: 0 auto; padding: 25px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #e9ecef; padding-bottom: 15px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>📊 Lazada Store Change & Event Inspection Report</h2>
        </div>

        ${newProductsHtml}
        ${stockIncreaseHtml}
        ${priceHighlightsHtml}
        ${checkoutHtml}

        <p style="margin-top: 25px; font-size: 12px; color: #a0aec0; text-align: center;">
          Report generated automatically by Lazada Bot at ${new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}
        </p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ subject, htmlContent });
}

/**
 * Send Stock & API Check Summary Email with full table & highlighted in-stock items + Quantity column.
 */
export async function sendStockSummaryEmail(allProducts, inStockProducts, totalPagesChecked) {
  const hasInStock = inStockProducts.length > 0;
  const subjectPrefix = hasInStock ? '🔥 [IN STOCK ALERT]' : '[Lazada Bot]';
  const subject = `${subjectPrefix} Stock Check Completed - ${inStockProducts.length} In-Stock Item(s) Found`;

  const tableRows = allProducts.map((p, index) => {
    const isInStock = p.inStock === true;
    
    const rowStyle = isInStock
      ? 'background-color: #d4edda; border-bottom: 2px solid #28a745;'
      : (index % 2 === 0 ? 'background-color: #ffffff;' : 'background-color: #f8f9fa;');

    const statusBadge = isInStock
      ? `<span style="background-color: #28a745; color: #ffffff; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;">🔥 IN STOCK</span>`
      : `<span style="color: #6c757d; font-size: 12px;">Out of Stock</span>`;

    const titleStyle = isInStock ? 'color: #155724; font-weight: bold;' : 'color: #212529;';
    const priceStyle = isInStock ? 'color: #155724; font-weight: bold;' : 'color: #495057;';

    return `
      <tr style="${rowStyle}">
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center; font-size: 12px; color: #6c757d;">${index + 1}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; ${titleStyle}">${p.title}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: right; ${priceStyle}">${p.price}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center; font-weight: bold;">${p.quantity || p.stockQuantity || 'N/A'}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center;">${statusBadge}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center; font-size: 12px; color: #495057;">${p.soldCount || '0'}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center;"><a href="${p.url}" style="color: #007bff; text-decoration: none; font-weight: bold;">View</a></td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }
        .container { max-width: 900px; background: #ffffff; margin: 0 auto; padding: 25px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #e9ecef; padding-bottom: 15px; margin-bottom: 20px; }
        .header h2 { margin: 0; color: #1a202c; font-size: 22px; }
        .stats-bar { display: flex; gap: 15px; margin-bottom: 20px; background: #edf2f7; padding: 12px; border-radius: 6px; }
        .stat-item { font-size: 14px; color: #4a5568; }
        .stat-item b { color: #2d3748; }
        .highlight-box { background-color: #d4edda; border-left: 4px solid #28a745; padding: 12px; margin-bottom: 20px; border-radius: 4px; color: #155724; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
        th { background-color: #2b6cb0; color: #ffffff; padding: 10px; text-align: left; border: 1px solid #2b6cb0; font-size: 12px; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>📦 Lazada Store Stock & Price Inspection Report</h2>
        </div>

        <div class="stats-bar">
          <div class="stat-item"><b>Pages Scraped:</b> ${totalPagesChecked}</div> |
          <div class="stat-item"><b>Total Items Checked:</b> ${allProducts.length}</div> |
          <div class="stat-item"><b>In-Stock Items:</b> <span style="color: ${hasInStock ? '#28a745' : '#e53e3e'}; font-weight: bold;">${inStockProducts.length}</span></div>
        </div>

        ${hasInStock ? `
          <div class="highlight-box">
            🚨 ALERT: ${inStockProducts.length} item(s) are currently IN STOCK! Check the highlighted green rows below.
          </div>
        ` : ''}

        <table>
          <thead>
            <tr>
              <th style="width: 5%; text-align: center;">#</th>
              <th style="width: 40%;">Product Title</th>
              <th style="width: 10%; text-align: right;">Price</th>
              <th style="width: 12%; text-align: center;">Quantity</th>
              <th style="width: 13%; text-align: center;">Stock Status</th>
              <th style="width: 10%; text-align: center;">Sold</th>
              <th style="width: 10%; text-align: center;">Link</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <p style="margin-top: 25px; font-size: 12px; color: #a0aec0; text-align: center;">
          Report generated automatically at ${new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}
        </p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ subject, htmlContent });
}

/**
 * Send Checkout Success/Attempt Email
 */
export async function sendCheckoutEmail(product, checkoutUrl, status = 'Reached Checkout Page') {
  const subject = `[Lazada Bot - URGENT] Checkout Status: ${status} - ${product.title}`;
  
  const htmlContent = `
    <h2 style="color: #2b6cb0;">🚀 Auto-Checkout Triggered</h2>
    <p>The bot detected stock for the target product and executed checkout sequence!</p>

    <div style="background: #edf2f7; padding: 15px; border-radius: 8px; margin: 15px 0;">
      <p><b>Product Title:</b> ${product.title}</p>
      <p><b>Price:</b> ${product.price}</p>
      <p><b>Quantity Available:</b> ${product.quantity || product.stockQuantity || 'N/A'}</p>
      <p><b>Product URL:</b> <a href="${product.url}">${product.url}</a></p>
      <p><b>Current Page URL:</b> <a href="${checkoutUrl}" target="_blank">${checkoutUrl}</a></p>
      <p><b>Status:</b> <span style="color: green;"><b>${status}</b></span></p>
    </div>

    ${checkoutUrl ? `
      <div style="margin: 25px 0; text-align: center;">
        <a href="${checkoutUrl}" target="_blank" style="background-color: #f57224; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.15);">
          👉 CLICK HERE TO PAY NOW / VIEW ORDER
        </a>
      </div>
    ` : ''}

    <p style="color: #c53030;"><b>Please click the button above or check your Lazada account to complete your payment.</b></p>
  `;

  return await sendEmail({ subject, htmlContent });
}

/**
 * Helper function to categorize errors and return resolution steps (Cara Fixing)
 */
function categorizeError(error) {
  const errString = typeof error === 'string' ? error : (error.message || String(error));
  const errStack = error instanceof Error ? error.stack : '';

  if (errString.includes('BLOCKER_DETECTED') || errString.toLowerCase().includes('captcha') || errString.toLowerCase().includes('punish')) {
    return {
      category: 'CAPTCHA_BLOCKER',
      title: '🚨 CAPTCHA / Anti-Bot Verification Challenge Encountered',
      fixingSteps: [
        'Open your terminal in the project directory.',
        'Run command: <code>npm run refresh-session</code> to launch interactive session refresh.',
        'Complete the slider/CAPTCHA puzzle manually in the browser window.',
        'Once completed, run <code>npm run warm-session</code> to verify session status.'
      ],
      errorMessage: errString,
      stackTrace: errStack
    };
  }

  if (errString.toLowerCase().includes('session') || errString.toLowerCase().includes('auth') || errString.toLowerCase().includes('login') || errString.toLowerCase().includes('401') || errString.toLowerCase().includes('403')) {
    return {
      category: 'SESSION_EXPIRED',
      title: '🔐 Browser Session / Authentication Expired',
      fixingSteps: [
        'Log into Lazada SG in your desktop browser.',
        'Export fresh cookies to <code>cookies.json</code>.',
        'Run command: <code>npm run import-cookies</code> to update session storage.',
        'Run command: <code>npm run refresh-session</code> to warm up the session.'
      ],
      errorMessage: errString,
      stackTrace: errStack
    };
  }

  if (errString.toLowerCase().includes('timeout') || errString.toLowerCase().includes('net::') || errString.toLowerCase().includes('fetch')) {
    return {
      category: 'NETWORK_TIMEOUT',
      title: '🌐 Network Connection / Timeout Error',
      fixingSteps: [
        'Check your local network / internet connection.',
        'Verify if <code>https://www.lazada.sg</code> is accessible from your network.',
        'If using proxy/VPN, check if IP is throttled or blocked by firewall.',
        'The bot will automatically retry on the next CRON schedule.'
      ],
      errorMessage: errString,
      stackTrace: errStack
    };
  }

  if (errString.toLowerCase().includes('checkout') || errString.toLowerCase().includes('buy now')) {
    return {
      category: 'CHECKOUT_FAILED',
      title: '🛒 Auto-Checkout Step Failed',
      fixingSteps: [
        'Inspect product URL to ensure item is still available.',
        'Verify if Lazada changed selector for "Buy Now" button.',
        'Ensure session has a default shipping address and payment method saved.'
      ],
      errorMessage: errString,
      stackTrace: errStack
    };
  }

  return {
    category: 'SYSTEM_ERROR',
    title: '⚠️ Unhandled Scraper / System Error',
    fixingSteps: [
      'Inspect error details and stack trace provided below.',
      'Ensure all dependencies are installed (<code>npm install</code>).',
      'Verify Playwright browser binaries are present (<code>npx playwright install</code>).',
      'Restart continuous runner using <code>npm run start</code>.'
    ],
    errorMessage: errString,
    stackTrace: errStack
  };
}

/**
 * Send Failure Alert Email with Detailed Resolution Steps (Cara Fixing)
 */
export async function sendFailureEmail(error, contextDetails = '') {
  const info = categorizeError(error);
  const subject = `[Lazada Bot - BLOCKER ALERT] ${info.category}: Action Required`;

  const stepsHtml = info.fixingSteps
    .map((step, idx) => `<li style="margin-bottom: 8px;"><b>Step ${idx + 1}:</b> ${step}</li>`)
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }
        .container { max-width: 800px; background: #ffffff; margin: 0 auto; padding: 25px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .alert-header { background-color: #fff5f5; border-left: 6px solid #e53e3e; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
        .alert-title { color: #c53030; margin: 0 0 10px 0; font-size: 18px; }
        .fix-box { background-color: #ebf8ff; border-left: 6px solid #3182ce; padding: 15px; border-radius: 4px; margin: 20px 0; }
        .fix-title { color: #2b6cb0; margin: 0 0 10px 0; font-size: 16px; font-weight: bold; }
        .code-block { background: #2d3748; color: #f7fafc; padding: 12px; border-radius: 6px; font-family: Consolas, monospace; font-size: 13px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="alert-header">
          <h2 class="alert-title">${info.title}</h2>
          <p style="margin: 0; color: #742a2a; font-size: 14px;">
            <b>Error Message:</b> ${info.errorMessage}
          </p>
          ${contextDetails ? `<p style="margin-top: 5px; color: #742a2a; font-size: 13px;"><b>Context:</b> ${contextDetails}</p>` : ''}
        </div>

        <div class="fix-box">
          <div class="fix-title">🛠️ HOW TO FIX THIS ISSUE (CARA FIXING):</div>
          <ol style="margin: 0; padding-left: 20px; color: #2d3748; font-size: 14px;">
            ${stepsHtml}
          </ol>
        </div>

        ${info.stackTrace ? `
          <h4 style="color: #4a5568; margin-bottom: 8px;">Technical Stack Trace:</h4>
          <div class="code-block">${info.stackTrace}</div>
        ` : ''}

        <p style="margin-top: 25px; font-size: 12px; color: #a0aec0; text-align: center;">
          Alert generated automatically by Lazada Bot at ${new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}
        </p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ subject, htmlContent });
}

/**
 * Sends ONE consolidated email containing:
 *   1. Purchase summary for all auto-checkout results (success + failed)
 *   2. Full product inventory table (all scraped products)
 *
 * This is called ONCE per scrape cycle to avoid email spam.
 *
 * @param {Object} params
 * @param {Array<Object>} params.checkoutResults - Array of checkout result objects from processAutoCheckout().
 * @param {Array<Object>} params.allProducts - Complete list of all scraped products.
 * @param {Array<Object>} params.inStockProducts - Filtered list of in-stock products.
 * @param {number} params.totalPagesChecked - Number of API pages scraped.
 * @param {Array<Object>} [params.newProducts=[]] - Newly detected products.
 * @param {Array<Object>} [params.stockIncreases=[]] - Products with stock increases.
 * @param {Array<Object>} [params.priceHighlights=[]] - Products with price changes.
 * @returns {Promise<boolean>} True if email was sent successfully.
 */
export async function sendConsolidatedPurchaseEmail({
  checkoutResults = [],
  allProducts = [],
  inStockProducts = [],
  totalPagesChecked = 0,
  newProducts = [],
  stockIncreases = [],
  priceHighlights = [],
  walletBalanceBefore = null,
  walletBalanceAfter = null,
  skippedProducts = [],
}) {
  const successCount = checkoutResults.filter((r) => r.success && !r.smsVerificationRequired).length;
  const smsCount = checkoutResults.filter((r) => r.smsVerificationRequired).length;
  const failedCount = checkoutResults.filter((r) => !r.success && !r.smsVerificationRequired).length;
  const hasInStock = inStockProducts.length > 0;
  const hasPurchases = checkoutResults.length > 0;

  // ── Build Subject Line ──
  let subjectPrefix;
  if (smsCount > 0) {
    subjectPrefix = '📱 [SMS VERIFICATION REQUIRED]';
  } else if (successCount > 0) {
    subjectPrefix = '🛒✅ [PURCHASE CONFIRMED]';
  } else if (failedCount > 0) {
    subjectPrefix = '🛒⚠️ [PURCHASE ATTEMPTED]';
  } else if (hasInStock) {
    subjectPrefix = '🔥 [IN STOCK ALERT]';
  } else {
    subjectPrefix = '📦 [STOCK CHECK]';
  }
  const subject = `${subjectPrefix} ${successCount + smsCount} Triggered/Purchased, ${inStockProducts.length} In-Stock, ${allProducts.length} Total Items`;

  // ── SECTION 1: Purchase Summary ──
  let purchaseSectionHtml = '';
  if (hasPurchases) {
    const purchaseRows = checkoutResults.map((res, idx) => {
      let statusColor = '#dc3545';
      let statusIcon = '❌';
      let statusLabel = 'FAILED';

      if (res.smsVerificationRequired) {
        statusColor = '#ffc107';
        statusIcon = '📱';
        statusLabel = 'SMS REQUIRED';
      } else if (res.success) {
        statusColor = '#28a745';
        statusIcon = '✅';
        statusLabel = 'PURCHASED';
      }

      const walletInfo = res.walletDecreased
        ? `<br/><small style="color:#6c757d;">Wallet: ${res.walletBalanceBefore} → ${res.walletBalanceAfter} (Deducted: ${res.walletDeductionAmount})</small>`
        : (res.walletSelected ? '<br/><small style="color:#6c757d;">Wallet: Selected (balance change unverified)</small>' : '');

      const payButtonHtml = res.checkoutUrl ? `
        <div style="margin-top: 8px;">
          <a href="${res.checkoutUrl}" target="_blank" style="background-color: #f57224; color: #ffffff; padding: 6px 12px; border-radius: 4px; text-decoration: none; font-weight: bold; font-size: 12px; display: inline-block;">
            👉 CLICK TO PAY / VIEW ORDER
          </a>
        </div>
      ` : '';

      return `
        <tr style="border-bottom: 1px solid #e9ecef;">
          <td style="padding: 12px; text-align: center; font-size: 13px; color: #6c757d;">${idx + 1}</td>
          <td style="padding: 12px; font-weight: bold; color: #1a202c;">
            ${res.productTitle}
            ${payButtonHtml}
          </td>
          <td style="padding: 12px; text-align: right; font-weight: bold;">${res.productPrice || 'N/A'}</td>
          <td style="padding: 12px; text-align: center;">
            <span style="color: ${statusColor}; font-weight: bold;">${statusIcon} ${statusLabel}</span>
            ${walletInfo}
          </td>
          <td style="padding: 12px; font-size: 12px; color: #4a5568;">
            ${res.statusText || res.error || '-'}
            ${res.checkoutUrl ? `<br/><small style="word-break: break-all; color: #3182ce;"><a href="${res.checkoutUrl}" target="_blank">Direct Order Link</a></small>` : ''}
          </td>
        </tr>
      `;
    }).join('');

    purchaseSectionHtml = `
      <div style="margin-bottom: 25px; background: #d4edda; border-left: 6px solid #28a745; padding: 20px; border-radius: 6px;">
        <h3 style="margin-top: 0; color: #155724; font-size: 18px;">🛒 AUTO-PURCHASE SUMMARY (${checkoutResults.length} item(s) attempted)</h3>
        <div style="display: flex; gap: 20px; margin-bottom: 15px;">
          <span style="background: #28a745; color: white; padding: 5px 12px; border-radius: 4px; font-weight: bold;">✅ Success: ${successCount}</span>
          ${smsCount > 0 ? `<span style="background: #ffc107; color: black; padding: 5px 12px; border-radius: 4px; font-weight: bold;">📱 SMS Code Sent: ${smsCount}</span>` : ''}
          <span style="background: ${failedCount > 0 ? '#dc3545' : '#6c757d'}; color: white; padding: 5px 12px; border-radius: 4px; font-weight: bold;">❌ Failed: ${failedCount}</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 4px; overflow: hidden;">
          <thead>
            <tr style="background: #155724; color: white;">
              <th style="padding: 10px; width: 5%; text-align: center;">#</th>
              <th style="padding: 10px; width: 35%;">Product</th>
              <th style="padding: 10px; width: 12%; text-align: right;">Price</th>
              <th style="padding: 10px; width: 20%; text-align: center;">Status</th>
              <th style="padding: 10px; width: 28%;">Details</th>
            </tr>
          </thead>
          <tbody>${purchaseRows}</tbody>
        </table>
      </div>
    `;
  }

  // ── SECTION 1B: Wallet Balance Summary ──
  let walletSectionHtml = '';
  if (walletBalanceBefore !== null) {
    const deducted = walletBalanceAfter !== null ? (walletBalanceBefore - walletBalanceAfter) : 0;
    walletSectionHtml = `
      <div style="margin-bottom: 20px; background: #e8f4fd; border-left: 6px solid #2196F3; padding: 15px; border-radius: 6px;">
        <h3 style="margin-top: 0; color: #1565C0; font-size: 16px;">💰 LAZADA WALLET BALANCE</h3>
        <table style="border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 4px 12px 4px 0; color: #555;">Before Purchases:</td><td style="font-weight: bold;">$${walletBalanceBefore.toFixed(2)}</td></tr>
          ${walletBalanceAfter !== null ? `<tr><td style="padding: 4px 12px 4px 0; color: #555;">After Purchases:</td><td style="font-weight: bold; color: #e53e3e;">$${walletBalanceAfter.toFixed(2)}</td></tr>` : ''}
          ${walletBalanceAfter !== null ? `<tr><td style="padding: 4px 12px 4px 0; color: #555;">Total Deducted:</td><td style="font-weight: bold; color: #28a745;">$${deducted.toFixed(2)}</td></tr>` : ''}
        </table>
      </div>
    `;
  }

  // ── SECTION 1C: Skipped Products (Too Expensive / Budget Exceeded) ──
  let skippedSectionHtml = '';
  if (skippedProducts.length > 0) {
    skippedSectionHtml = `
      <div style="margin-bottom: 20px; background: #fff3cd; border-left: 6px solid #ffc107; padding: 15px; border-radius: 6px;">
        <h3 style="margin-top: 0; color: #856404; font-size: 16px;">⏭️ SKIPPED PRODUCTS — Insufficient Wallet Balance (${skippedProducts.length})</h3>
        <ul style="margin: 0; padding-left: 20px;">
          ${skippedProducts.map((s) => `
            <li style="margin-bottom: 6px;">
              <b>${s.product.title}</b> — Price: <b>${s.product.price}</b> | Reason: <i>${s.reason}</i>
              (<a href="${s.product.url}" style="color: #856404;">View</a>)
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  // ── SECTION 2: Change Detection ──
  let changesSectionHtml = '';

  if (newProducts.length > 0) {
    changesSectionHtml += `
      <div style="margin-bottom: 15px; background: #ebf8ff; border-left: 5px solid #3182ce; padding: 15px; border-radius: 4px;">
        <h4 style="margin-top: 0; color: #2b6cb0;">🆕 NEW PRODUCTS DETECTED (${newProducts.length})</h4>
        <ul style="margin: 0; padding-left: 20px;">
          ${newProducts.map((p) => `
            <li style="margin-bottom: 6px;">
              <b>${p.title}</b> — Price: <b>${p.price}</b> | Qty: <b>${p.quantity || p.stockQuantity}</b> | Status: <b>${p.stockStatus}</b>
              (<a href="${p.url}" style="color: #3182ce;">View</a>)
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  if (stockIncreases.length > 0) {
    changesSectionHtml += `
      <div style="margin-bottom: 15px; background: #feebc8; border-left: 5px solid #dd6b20; padding: 15px; border-radius: 4px;">
        <h4 style="margin-top: 0; color: #c05621;">📈 STOCK INCREASE / BACK IN STOCK (${stockIncreases.length})</h4>
        <ul style="margin: 0; padding-left: 20px;">
          ${stockIncreases.map((item) => `
            <li style="margin-bottom: 6px;">
              <b>${item.product.title}</b> — Price: <b>${item.product.price}</b> | Qty: <b>${item.product.quantity || item.product.stockQuantity}</b> | Reason: <b>${item.reason}</b>
              (<a href="${item.product.url}" style="color: #dd6b20;">View</a>)
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  if (priceHighlights.length > 0) {
    changesSectionHtml += `
      <div style="margin-bottom: 15px; background: #e6fffa; border-left: 5px solid #319795; padding: 15px; border-radius: 4px;">
        <h4 style="margin-top: 0; color: #234e52;">🏷️ PRICE CHANGES (${priceHighlights.length})</h4>
        <ul style="margin: 0; padding-left: 20px;">
          ${priceHighlights.map((h) => `
            <li style="margin-bottom: 6px;">
              <b>${h.product.title}</b>: <del>${h.oldPrice}</del> → <b>${h.newPrice}</b>
              (<a href="${h.product.url}" style="color: #319795;">View</a>)
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  // ── SECTION 3: Full Product Inventory Table ──
  const tableRows = allProducts.map((p, index) => {
    const isInStock = p.inStock === true;
    const rowStyle = isInStock
      ? 'background-color: #d4edda; border-bottom: 2px solid #28a745;'
      : index % 2 === 0
        ? 'background-color: #ffffff;'
        : 'background-color: #f8f9fa;';
    const statusBadge = isInStock
      ? '<span style="background-color: #28a745; color: #ffffff; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;">🔥 IN STOCK</span>'
      : '<span style="color: #6c757d; font-size: 12px;">Out of Stock</span>';
    const titleStyle = isInStock ? 'color: #155724; font-weight: bold;' : 'color: #212529;';
    const priceStyle = isInStock ? 'color: #155724; font-weight: bold;' : 'color: #495057;';

    return `
      <tr style="${rowStyle}">
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center; font-size: 12px; color: #6c757d;">${index + 1}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; ${titleStyle}">${p.title}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: right; ${priceStyle}">${p.price}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center; font-weight: bold;">${p.quantity || p.stockQuantity || 'N/A'}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center;">${statusBadge}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center; font-size: 12px; color: #495057;">${p.soldCount || '0'}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center;"><a href="${p.url}" style="color: #007bff; text-decoration: none; font-weight: bold;">View</a></td>
      </tr>
    `;
  }).join('');

  // ── Assemble Full HTML Email ──
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }
        .container { max-width: 950px; background: #ffffff; margin: 0 auto; padding: 25px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { border-bottom: 3px solid #2b6cb0; padding-bottom: 15px; margin-bottom: 25px; }
        .header h2 { margin: 0; color: #1a202c; font-size: 22px; }
        .stats-bar { display: flex; gap: 15px; margin-bottom: 20px; background: #edf2f7; padding: 12px; border-radius: 6px; flex-wrap: wrap; }
        .stat-item { font-size: 14px; color: #4a5568; }
        .stat-item b { color: #2d3748; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
        th { background-color: #2b6cb0; color: #ffffff; padding: 10px; text-align: left; border: 1px solid #2b6cb0; font-size: 12px; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>📊 Lazada Bot — Consolidated Stock & Purchase Report</h2>
        </div>

        <div class="stats-bar">
          <div class="stat-item"><b>Pages Scraped:</b> ${totalPagesChecked}</div> |
          <div class="stat-item"><b>Total Items:</b> ${allProducts.length}</div> |
          <div class="stat-item"><b>In-Stock:</b> <span style="color: ${hasInStock ? '#28a745' : '#e53e3e'}; font-weight: bold;">${inStockProducts.length}</span></div> |
          <div class="stat-item"><b>Purchased:</b> <span style="color: ${successCount > 0 ? '#28a745' : '#6c757d'}; font-weight: bold;">${successCount}</span></div>
          ${smsCount > 0 ? `| <div class="stat-item"><b>📱 SMS Required:</b> <span style="color: #ffc107; font-weight: bold;">${smsCount}</span></div>` : ''}
        </div>

        ${purchaseSectionHtml}
        ${walletSectionHtml}
        ${skippedSectionHtml}
        ${changesSectionHtml}

        <h3 style="color: #2b6cb0; border-bottom: 2px solid #e9ecef; padding-bottom: 10px;">📦 Full Product Inventory (${allProducts.length} items)</h3>
        ${hasInStock ? `
          <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 12px; margin-bottom: 15px; border-radius: 4px; color: #155724; font-weight: bold;">
            🚨 ALERT: ${inStockProducts.length} item(s) are currently IN STOCK! Check the highlighted green rows below.
          </div>
        ` : ''}
        <table>
          <thead>
            <tr>
              <th style="width: 5%; text-align: center;">#</th>
              <th style="width: 35%;">Product Title</th>
              <th style="width: 10%; text-align: right;">Price</th>
              <th style="width: 12%; text-align: center;">Quantity</th>
              <th style="width: 13%; text-align: center;">Stock Status</th>
              <th style="width: 10%; text-align: center;">Sold</th>
              <th style="width: 10%; text-align: center;">Link</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <p style="margin-top: 25px; font-size: 12px; color: #a0aec0; text-align: center;">
          Report generated automatically by Lazada Bot at ${new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}
        </p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ subject, htmlContent });
}
