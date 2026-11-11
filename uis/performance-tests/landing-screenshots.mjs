// Ad-hoc before/after screenshot script for the brasaland-web landing
// redesign — not part of the committed Playwright suite, just a manual
// verification aid. Usage: node landing-screenshots.mjs <prefix> <baseUrl>
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const prefix = process.argv[2] ?? "shot";
const baseUrl = process.argv[3] ?? "http://localhost:3000";
const outDir = "/tmp/brasaland-landing-screens";
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide", width: 1920, height: 1080 },
];

const browser = await chromium.launch();
for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(500);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );

  await page.screenshot({
    path: `${outDir}/${prefix}-${vp.name}-viewport.png`,
  });
  await page.screenshot({
    path: `${outDir}/${prefix}-${vp.name}-full.png`,
    fullPage: true,
  });

  console.log(
    `${vp.name} (${vp.width}x${vp.height}): overflow=${hasHorizontalOverflow} consoleErrors=${errors.length}`,
  );
  if (errors.length) console.log("  " + errors.join("\n  "));

  await page.close();
}
await browser.close();
console.log(`Saved to ${outDir}`);
