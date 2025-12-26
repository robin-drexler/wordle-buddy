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

  console.log(
    `\n🎯 Attempt ${counter + 1}/6: Trying "${suggestion.toUpperCase()}"`
  );

  await enterWord(page, suggestion);
  const worked = await wordWorked(page);

  if (!worked) {
    console.log(`   ❌ "${suggestion.toUpperCase()}" is not a valid word`);
    await eraseCurrentWord(page);
    bannedWords.push(suggestion);
  } else {
    counter++;
    const result = await getLastRowResult(page, counter);
    console.log(`   ${result}`);
  }

  const hasWon = await checkHasWon(page);

  if (hasWon) {
    console.log(
      `\n🎉 Solved in ${counter} ${counter === 1 ? "try" : "tries"}!`
    );
    return;
  }

  // todo check if there's no more row to try instead of counting
  if (counter >= 6) {
    console.log(`\n😔 Failed to solve the puzzle`);
    return;
  }

  return runTries(page, "", bannedWords, counter);
}

/**
 * Get a visual representation of the last guess result
 * @param {import('playwright-core').Page} page
 * @param {number} rowNumber
 */
async function getLastRowResult(page, rowNumber) {
  const allRows = await page.locator('[class*="Row-module"]').elementHandles();
  const row = allRows[rowNumber - 1];
  const tiles = await row.$$('[class*="Tile-module"]');

  let result = "";
  for (const tile of tiles) {
    const state = await tile.getAttribute("data-state");
    if (state === "correct") {
      result += "🟩";
    } else if (state === "present") {
      result += "🟨";
    } else {
      result += "⬛";
    }
  }
  return result;
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

  console.log("🔤 Wordle Buddy starting...");
  if (process.env.DAYS) {
    const days = parseInt(process.env.DAYS, 10);
    console.log(
      `📅 Playing Wordle from ${
        days > 0 ? days + " days in the future" : Math.abs(days) + " days ago"
      }`
    );
  }

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
  const startWord = process.env.START_WORD?.toLocaleLowerCase() || "stare";
  console.log(`\n🚀 Starting word: "${startWord.toUpperCase()}"`);
  await runTries(page, startWord);

  if (process.env.COPY_STATS) {
    // Close the stats modal that appears after winning
    await page.locator('button[aria-label="Close"]').click();
    await page.locator('button:has-text("Share")').click({ timeout: 10000 });
    console.log("\n📋 Stats copied to clipboard!");
  }

  if (process.env.RECORD_VIDEO) {
    await context.close();
    await browser.close();
  }
}
