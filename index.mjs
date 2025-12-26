import { chromium } from "playwright";
import { addFakeTimers } from "./add-fake-timers.mjs";
import { suggestWord } from "./suggest-word.mjs";

async function wait(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 *
 * @param {import('playwright-core').Page} page
 */
async function getPositions(page) {
  const forbidden = await page
    .locator('[data-state="absent"]')
    .elementHandles();

  const absent = await Promise.all(
    forbidden.map((el) => el.getAttribute("data-key"))
  );

  const allRows = await page.locator('[class*="Row-module"]').elementHandles();

  const correct = new Map();
  const present = new Map();

  for (const row of allRows) {
    const tiles = await row.$$('[class*="Tile-module"]');

    for (const [tileIndex, tile] of tiles.entries()) {
      const letter = (await tile.textContent()).toLowerCase();
      const state = await tile.getAttribute("data-state");

      if (state === "empty") {
        break;
      }

      if (state === "correct") {
        const toSet = correct.get(letter) || [];
        toSet.push(tileIndex);
        correct.set(letter, toSet);
      }
      if (
        state === "present" ||
        // this happens when the same letter is already correct somewhere else
        // if we don't add it here, it would retry the same word over and over
        (state === "absent" && !absent.includes(letter))
      ) {
        const toSet = present.get(letter) || [];
        toSet.push(tileIndex);
        present.set(letter, toSet);
      }
    }
  }
  return {
    absent,
    present,
    correct,
  };
}

/**
 *
 * @param {import('playwright-core').Page} page
 */
async function runTries(page, suggestion = "", bannedWords = [], counter = 0) {
  const { absent, correct, present } = await getPositions(page);
  suggestion = suggestion || suggestWord(absent, correct, present, bannedWords);

  await enterWord(page, suggestion);
  const worked = await wordWorked(page);

  if (!worked) {
    await eraseCurrentWord(page);

    bannedWords.push(suggestion);
  } else {
    counter++;
  }
  const hasWon = await checkHasWon(page);
  console.log({ hasWon });

  // todo check if there's no more row to try instead of counting
  if (counter >= 6 || hasWon) {
    return;
  }

  return runTries(page, "", bannedWords, counter);
}

/**
 *
 * @param {import('playwright-core').Page} page
 */
async function enterWord(page, word) {
  await page.keyboard.type(word);
  await page.keyboard.press("Enter");
  await wait(3);
}

/**
 *
 * @param {import('playwright-core').Page} page
 */
async function eraseCurrentWord(page) {
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
}

/**
 *
 * @param {import('playwright-core').Page} page
 */
async function wordWorked(page) {
  const tiles = await page.locator('[class*="Tile-module"]').elementHandles();

  for (const tile of tiles) {
    const state = await tile.getAttribute("data-state");
    if (state === "tbd") {
      return false;
    }
  }

  return true;
}

async function checkHasWon(page) {
  const allRows = await page.locator('[class*="Row-module"]').elementHandles();

  for (const row of allRows) {
    let allCorrect = true;
    const tiles = await row.$$('[class*="Tile-module"]');

    for (const tile of tiles) {
      const state = await tile.getAttribute("data-state");

      if (state !== "correct") {
        allCorrect = false;
        break;
      }
    }

    if (allCorrect && tiles.length === 5) {
      return true;
    }
  }

  return false;
}

export async function solveWordle() {
  const browser = await chromium.launch({ headless: false });

  const context = await browser.newContext(
    process.env.RECORD_VIDEO ? { recordVideo: { dir: "videos/" } } : {}
  );

  let time = new Date().getTime();

  if (process.env.DAYS) {
    time += parseInt(process.env.DAYS, 10) * 86400 * 1000;
  }

  const page = await context.newPage();

  const afterLoad = await addFakeTimers(page, time);

  await page.goto("https://www.nytimes.com/games/wordle/index.html");
  await afterLoad();

  // Click the "Play" or "Continue" button on the welcome screen
  // Using data-testid for more reliable selection
  const playOrContinueButton = page.locator(
    '[data-testid="Play"], [data-testid="Continue"]'
  );
  await playOrContinueButton.click();

  // Wait for the "How to Play" modal and close it (only appears for first-time users)
  const closeButton = page.locator('dialog button[aria-label="Close"]');
  if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeButton.click();
  }

  // todo plan for the game not being won
  await runTries(page, process.env.START_WORD?.toLocaleLowerCase() || "stare");

  if (process.env.COPY_STATS) {
    // Close the stats modal that appears after winning
    await page.locator('button[aria-label="Close"]').click();
    await page.locator('button:has-text("Share")').click({ timeout: 10000 });
  }

  if (process.env.RECORD_VIDEO) {
    await context.close();
    await browser.close();
  }
}
