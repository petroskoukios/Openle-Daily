/* Headless CI runner for the in-browser test suite (tests.html).
 *
 * tests.html loads the real app in an iframe and asserts against its globals,
 * so the tests need a real browser served over http. This script serves the
 * repo, opens tests.html in headless Chromium, waits for the suite to finish,
 * and exits non-zero if anything failed.
 *
 *   npm test        (after: npm install && npx playwright install chromium)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8799;
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/") url = "/index.html";
  const fp = path.join(ROOT, url);
  if (!fp.startsWith(ROOT)) { res.statusCode = 403; res.end("forbidden"); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.statusCode = 404; res.end("not found"); return; }
    res.setHeader("Content-Type", TYPES[path.extname(fp)] || "text/plain");
    res.setHeader("Cache-Control", "no-store");
    res.end(data);
  });
});

const listen = () => new Promise(resolve => server.listen(PORT, "127.0.0.1", resolve));

async function main() {
  await listen();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", msg => { if (msg.type() === "error") console.error("[browser]", msg.text()); });

  let code = 1;
  try {
    await page.goto(`http://127.0.0.1:${PORT}/tests.html`, { waitUntil: "load" });
    // The suite is done once #summary leaves its "pending" state.
    await page.waitForSelector("#summary.good, #summary.bad", { timeout: 60000 });

    const summary = (await page.textContent("#summary"))?.trim() ?? "(no summary)";
    const good = ((await page.getAttribute("#summary", "class")) || "").includes("good");
    const fails = await page.$$eval(".row.fail", rows =>
      rows.map(r => r.innerText.replace(/\s+/g, " ").trim()));

    console.log("\n" + summary);
    if (fails.length) {
      console.log("\nFailures:");
      for (const f of fails) console.log("  ✗ " + f);
    }
    code = good && fails.length === 0 ? 0 : 1;
  } catch (e) {
    console.error("Test run did not complete:", e.message);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(code === 0 ? "\n✓ All tests passed\n" : "\n✗ Tests failed\n");
  process.exit(code);
}

main();
