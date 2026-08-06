import { CONFIG } from './config.js';

// ─── Session Personality ────────────────────────────────────────────────────────
// Each scraper session generates a random "personality" that determines
// overall speed and behavior tendencies. This prevents sessions from
// having identical cadence, which anti-bot systems can fingerprint.

const SESSION_PERSONALITY = {
  speedMultiplier: 0.8 + Math.random() * 0.8,   // 0.8x to 1.6x speed variation
  scrollStyle: Math.random() > 0.5 ? 'smooth' : 'chunky',
  isPatientReader: Math.random() > 0.6,          // 40% chance of being a slow, careful reader
  distractionFrequency: Math.random() * 0.3,     // 0% to 30% chance of random distraction per action
};

console.log(`[HumanBehavior] Session personality: speed=${SESSION_PERSONALITY.speedMultiplier.toFixed(2)}, scroll=${SESSION_PERSONALITY.scrollStyle}, patient=${SESSION_PERSONALITY.isPatientReader}`);

// ─── Core Timing Utilities ──────────────────────────────────────────────────────

/**
 * Pauses execution for a random duration between min and max milliseconds,
 * adjusted by the session personality speed multiplier.
 *
 * @param {number} min - Minimum delay in milliseconds
 * @param {number} max - Maximum delay in milliseconds
 * @returns {Promise<void>}
 */
export function randomDelay(min = CONFIG.MIN_DELAY, max = CONFIG.MAX_DELAY) {
  const base = Math.floor(Math.random() * (max - min + 1)) + min;
  const adjusted = Math.floor(base * SESSION_PERSONALITY.speedMultiplier);
  return new Promise((resolve) => setTimeout(resolve, adjusted));
}

/**
 * Introduces a "reading pause" — a longer, variable delay that simulates a human
 * stopping to read content on the page. Occasionally includes an extra-long
 * "distraction" pause (checking phone, etc.).
 *
 * @returns {Promise<void>}
 */
export async function readingPause() {
  const basePause = SESSION_PERSONALITY.isPatientReader
    ? Math.floor(Math.random() * 4000) + 3000   // 3-7 seconds for patient readers
    : Math.floor(Math.random() * 2000) + 1500;  // 1.5-3.5 seconds for fast readers

  await new Promise((resolve) => setTimeout(resolve, basePause));

  // 15% chance of an extra "distraction" pause (2-8 seconds)
  if (Math.random() < 0.15) {
    const distractionTime = Math.floor(Math.random() * 6000) + 2000;
    console.log(`[HumanBehavior] Distraction pause: ${(distractionTime / 1000).toFixed(1)}s`);
    await new Promise((resolve) => setTimeout(resolve, distractionTime));
  }
}

// ─── Bézier Curve Mouse Movement ────────────────────────────────────────────────

/**
 * Calculates a point on a cubic Bézier curve at parameter t.
 *
 * @param {number} t - Parameter from 0 to 1
 * @param {number} p0 - Start point
 * @param {number} p1 - Control point 1
 * @param {number} p2 - Control point 2
 * @param {number} p3 - End point
 * @returns {number}
 */
function bezierPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * Moves the mouse cursor along a natural-looking Bézier curve path from the
 * current position to the target position. The curve uses randomized control
 * points to create organic, non-linear trajectories that closely match real
 * human hand movements. Includes variable speed (slow start, fast middle,
 * slow end) to simulate motor control.
 *
 * @param {import('playwright').Page} page
 * @param {number} targetX - Destination X coordinate
 * @param {number} targetY - Destination Y coordinate
 * @param {number} [steps=25] - Number of intermediate points along the curve
 * @returns {Promise<void>}
 */
export async function bezierMouseMove(page, targetX, targetY, steps = 25) {
  const viewport = page.viewportSize();
  if (!viewport) return;

  // Current mouse position (approximate from center if unknown)
  const startX = Math.floor(Math.random() * viewport.width * 0.4) + viewport.width * 0.3;
  const startY = Math.floor(Math.random() * viewport.height * 0.3) + viewport.height * 0.2;

  // Randomized control points for organic curve shape
  const cp1x = startX + (targetX - startX) * (0.2 + Math.random() * 0.3);
  const cp1y = startY + (Math.random() - 0.5) * 200;
  const cp2x = startX + (targetX - startX) * (0.5 + Math.random() * 0.3);
  const cp2y = targetY + (Math.random() - 0.5) * 150;

  // Move along the Bézier curve with variable speed
  const numSteps = steps + Math.floor(Math.random() * 10);
  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps;
    // Ease-in-out timing for natural acceleration/deceleration
    const easedT = t < 0.5
      ? 2 * t * t
      : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const x = Math.round(bezierPoint(easedT, startX, cp1x, cp2x, targetX));
    const y = Math.round(bezierPoint(easedT, startY, cp1y, cp2y, targetY));

    await page.mouse.move(x, y);

    // Variable delay between steps (faster in middle, slower at edges)
    const stepDelay = Math.floor(Math.random() * 8) + 2;
    await new Promise((resolve) => setTimeout(resolve, stepDelay));
  }
}

/**
 * Performs a full human-like mouse movement sequence: moves to a random visible
 * area on the page using Bézier curves. Optionally hovers briefly before
 * continuing. This replaces the old linear simulateMouseMovement function.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<void>}
 */
export async function simulateMouseMovement(page) {
  const viewport = page.viewportSize();
  if (!viewport) return;

  // Pick a random target within the visible content area
  const targetX = Math.floor(Math.random() * (viewport.width * 0.7)) + viewport.width * 0.1;
  const targetY = Math.floor(Math.random() * (viewport.height * 0.5)) + viewport.height * 0.15;

  await bezierMouseMove(page, targetX, targetY);

  // Brief hover pause after arriving (humans pause after moving cursor)
  await randomDelay(150, 500);
}

// ─── Realistic Scrolling ────────────────────────────────────────────────────────

/**
 * Performs human-like scrolling behavior on the page. Unlike simple constant-speed
 * scrolling, this function simulates realistic patterns:
 * - Variable scroll distances per step (some big, some small)
 * - Occasional pauses to "read" content
 * - Sometimes scrolls back up slightly (re-reading)
 * - Speed varies throughout the scroll
 *
 * @param {import('playwright').Page} page
 * @param {number} maxScrollDistance - Maximum total pixels to scroll down
 * @returns {Promise<void>}
 */
export async function humanScroll(page, maxScrollDistance = 3500) {
  const scrollStyle = SESSION_PERSONALITY.scrollStyle;

  await page.evaluate(async ({ maxDist, style }) => {
    await new Promise((resolve) => {
      let totalScrolled = 0;
      let stepCount = 0;

      const performStep = () => {
        stepCount++;

        // Determine scroll distance for this step
        let distance;
        if (style === 'chunky') {
          // Chunky: larger jumps with longer pauses (trackpad flick style)
          distance = Math.floor(Math.random() * 350) + 200;
        } else {
          // Smooth: smaller increments (mouse wheel style)
          distance = Math.floor(Math.random() * 150) + 60;
        }

        // 8% chance of a small back-scroll (re-reading something)
        if (Math.random() < 0.08 && totalScrolled > 300) {
          const backAmount = Math.floor(Math.random() * 120) + 40;
          window.scrollBy(0, -backAmount);
          totalScrolled -= backAmount;
        }

        window.scrollBy(0, distance);
        totalScrolled += distance;

        // Check if we should stop
        if (totalScrolled >= maxDist || totalScrolled >= document.body.scrollHeight) {
          resolve();
          return;
        }

        // Variable delay between scroll steps
        let delay;
        if (style === 'chunky') {
          delay = Math.floor(Math.random() * 600) + 300;
        } else {
          delay = Math.floor(Math.random() * 200) + 80;
        }

        // Every 4-7 steps, take a "reading pause" (longer delay)
        const readingInterval = Math.floor(Math.random() * 4) + 4;
        if (stepCount % readingInterval === 0) {
          delay += Math.floor(Math.random() * 2000) + 800;
        }

        setTimeout(performStep, delay);
      };

      // Initial short delay before starting to scroll
      setTimeout(performStep, Math.floor(Math.random() * 500) + 200);
    });
  }, { maxDist: maxScrollDistance, style: scrollStyle });
}

// ─── Random Element Interaction ─────────────────────────────────────────────────

/**
 * Simulates hovering over random visible elements on the page. A real user's
 * cursor naturally passes over links, images, and buttons as they browse.
 * This function picks 1-3 random interactive elements and hovers over them
 * using Bézier curve mouse movement.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<void>}
 */
export async function simulateRandomHover(page) {
  try {
    const elements = await page.$$('a, img, button, [class*="card"], [class*="product"]');
    if (elements.length === 0) return;

    // Pick 1-3 random elements to hover over
    const hoverCount = Math.min(elements.length, Math.floor(Math.random() * 3) + 1);

    for (let i = 0; i < hoverCount; i++) {
      const randomIndex = Math.floor(Math.random() * elements.length);
      const element = elements[randomIndex];

      try {
        const box = await element.boundingBox();
        if (!box) continue;

        // Move to element center with slight random offset (humans don't aim perfectly)
        const offsetX = (Math.random() - 0.5) * box.width * 0.3;
        const offsetY = (Math.random() - 0.5) * box.height * 0.3;
        await bezierMouseMove(page, box.x + box.width / 2 + offsetX, box.y + box.height / 2 + offsetY);

        // Hover duration varies
        await randomDelay(200, 900);
      } catch {
        // Element may have been removed from DOM or is not visible, skip silently
      }
    }
  } catch {
    // Page structure may have changed, skip silently
  }
}

// ─── Random "Noise" Actions ─────────────────────────────────────────────────────

/**
 * Performs random "noise" actions that real humans do unconsciously:
 * - Random mouse wiggles (fidgeting)
 * - Pressing Escape or Tab keys occasionally
 * - Moving cursor to random empty space
 *
 * This adds entropy to the browsing pattern, making it harder for anti-bot
 * systems to identify scripted behavior.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<void>}
 */
export async function performNoiseAction(page) {
  // Only perform noise based on personality's distraction frequency
  if (Math.random() > SESSION_PERSONALITY.distractionFrequency + 0.1) return;

  const viewport = page.viewportSize();
  if (!viewport) return;

  const action = Math.floor(Math.random() * 4);

  try {
    switch (action) {
      case 0:
        // Mouse wiggle: small random movements in a tight area (fidgeting)
        for (let i = 0; i < 3; i++) {
          const wiggleX = Math.floor(Math.random() * viewport.width * 0.6) + 100;
          const wiggleY = Math.floor(Math.random() * viewport.height * 0.4) + 100;
          await page.mouse.move(
            wiggleX + Math.floor(Math.random() * 20) - 10,
            wiggleY + Math.floor(Math.random() * 20) - 10,
            { steps: 3 }
          );
          await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 100) + 50));
        }
        break;

      case 1:
        // Press Escape key (closing an imaginary popup)
        await page.keyboard.press('Escape');
        await randomDelay(300, 700);
        break;

      case 2:
        // Move cursor to the page margins (looking at something else)
        await bezierMouseMove(page, viewport.width - 30, Math.floor(Math.random() * viewport.height));
        await randomDelay(500, 1500);
        break;

      case 3:
        // Tiny scroll up then back down (oops, overscrolled)
        await page.evaluate(() => {
          window.scrollBy(0, -50);
        });
        await randomDelay(300, 600);
        await page.evaluate(() => {
          window.scrollBy(0, 60);
        });
        break;
    }
  } catch {
    // Noise actions are optional; failures are silently ignored
  }
}

// ─── Compound Behavior Sequences ────────────────────────────────────────────────

/**
 * Executes a full "human browsing" sequence suitable for when the bot lands on
 * a new page. Combines multiple behaviors in a natural order:
 * 1. Initial pause (page loading, eyes adjusting)
 * 2. Mouse movement to content area
 * 3. Reading pause
 * 4. Gradual scrolling with intermittent pauses
 * 5. Random hover interactions
 * 6. Optional noise action
 *
 * @param {import('playwright').Page} page
 * @param {object} [options]
 * @param {number} [options.scrollDistance=2000] - Max scroll distance in pixels
 * @param {boolean} [options.interactWithElements=true] - Whether to hover over elements
 * @returns {Promise<void>}
 */
export async function simulatePageBrowsing(page, options = {}) {
  const { scrollDistance = 2000, interactWithElements = true } = options;

  // Step 1: Initial orientation pause (looking at the page)
  await randomDelay(1500, 3500);

  // Step 2: Move cursor toward content area
  await simulateMouseMovement(page);

  // Step 3: Reading pause (scanning page header / hero content)
  await readingPause();

  // Step 4: Scroll down gradually
  await humanScroll(page, scrollDistance);

  // Step 5: Hover over some elements
  if (interactWithElements) {
    await simulateRandomHover(page);
  }

  // Step 6: Another reading moment
  await readingPause();

  // Step 7: Random noise action
  await performNoiseAction(page);
}
