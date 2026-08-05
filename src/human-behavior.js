import { CONFIG } from './config.js';

/**
 * Pauses execution for a random duration between min and max milliseconds.
 * @param {number} min - Minimum delay in milliseconds
 * @param {number} max - Maximum delay in milliseconds
 * @returns {Promise<void>}
 */
export function randomDelay(min = CONFIG.MIN_DELAY, max = CONFIG.MAX_DELAY) {
  const duration = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, duration));
}

/**
 * Moves the mouse cursor to a random position on the page, simulating human-like
 * mouse movement with intermediate steps to avoid teleportation detection.
 * @param {import('playwright').Page} page
 * @returns {Promise<void>}
 */
export async function simulateMouseMovement(page) {
  const viewportSize = page.viewportSize();
  if (!viewportSize) return;

  const targetX = Math.floor(Math.random() * viewportSize.width * 0.8) + 50;
  const targetY = Math.floor(Math.random() * viewportSize.height * 0.6) + 50;

  // Move in 3-5 intermediate steps to simulate natural cursor path
  const steps = Math.floor(Math.random() * 3) + 3;
  await page.mouse.move(targetX, targetY, { steps });

  // Small pause after movement (humans don't move and click instantly)
  await randomDelay(200, 600);
}

/**
 * Scrolls the page gradually in a human-like pattern (variable speed, occasional pauses).
 * @param {import('playwright').Page} page
 * @param {number} maxScrollDistance - Maximum pixels to scroll down
 * @returns {Promise<void>}
 */
export async function humanScroll(page, maxScrollDistance = 3500) {
  await page.evaluate(async (maxDist) => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const scroll = () => {
        // Variable scroll distance (humans don't scroll at constant speed)
        const distance = Math.floor(Math.random() * 200) + 150;
        // Variable delay (humans pause at different intervals)
        const delay = Math.floor(Math.random() * 250) + 100;

        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= document.body.scrollHeight || totalHeight > maxDist) {
          resolve();
        } else {
          setTimeout(scroll, delay);
        }
      };
      scroll();
    });
  }, maxScrollDistance);
}

/**
 * Simulates hovering over random elements on the page to appear human-like.
 * @param {import('playwright').Page} page
 * @returns {Promise<void>}
 */
export async function simulateRandomHover(page) {
  try {
    // Find some visible elements to hover over
    const elements = await page.$$('a, img, button, [class*="card"]');
    if (elements.length === 0) return;

    // Pick 1-2 random elements to hover
    const hoverCount = Math.min(elements.length, Math.floor(Math.random() * 2) + 1);
    for (let i = 0; i < hoverCount; i++) {
      const randomIndex = Math.floor(Math.random() * elements.length);
      const element = elements[randomIndex];
      try {
        await element.hover({ timeout: 2000 });
        await randomDelay(300, 800);
      } catch {
        // Element might have been removed from DOM, skip silently
      }
    }
  } catch {
    // Page structure might have changed, skip silently
  }
}
