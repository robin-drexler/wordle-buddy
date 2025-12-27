import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { findUp } from "find-up";

// @ts-ignore
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 *
 * @param {import('playwright-core').Page} page
 * @param {number} time
 */
export async function addFakeTimers(page, time) {
  const nodeModules = await findUp("node_modules", {
    cwd: __dirname,
    type: "directory",
  });
  console.log(resolve(nodeModules, "sinon", "pkg", "sinon.js"));

  await page.addInitScript({
    path: resolve(nodeModules, "sinon", "pkg", "sinon.js"),
  });

  await page.addInitScript((time) => {
    // @ts-ignore
    // Only fake Date, not timers - this prevents issues with NYT's analytics
    window.__clock = sinon.useFakeTimers({
      now: time,
      toFake: ["Date"],
    });
  }, time);

  return async function afterLoad() {
    await page.evaluate(() => {
      // @ts-ignore
      if (window.__clock) {
        window.__clock.restore();
      }
    });
  };
}
