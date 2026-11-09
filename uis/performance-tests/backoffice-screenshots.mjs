// Ad-hoc verification script for the backoffice visual refresh — not part
// of the committed Playwright suite. Logs in with the seeded admin
// account and screenshots a few representative screens at mobile/desktop.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const baseUrl = process.argv[2] ?? "http://localhost:3010";
const outDir = "/tmp/backoffice-screens";
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

const browser = await chromium.launch();

for (const vp of viewports) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  // ── Login screen (unauthenticated) ──────────────────────────────────
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const loginOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await page.screenshot({ path: `${outDir}/${vp.name}-01-login.png`, fullPage: true });

  // Password visibility toggle check
  await page.fill("#login-password", "test1234");
  const typeBefore = await page.getAttribute("#login-password", "type");
  await page.click('button[aria-label="Show password"]');
  const typeAfter = await page.getAttribute("#login-password", "type");
  await page.screenshot({ path: `${outDir}/${vp.name}-02-login-password-visible.png` });

  // Focus-visible check on submit button
  await page.fill("#login-email", "");
  await page.fill("#login-password", "");
  await page.keyboard.press("Tab"); // email
  await page.keyboard.press("Tab"); // password
  await page.keyboard.press("Tab"); // toggle button
  await page.keyboard.press("Tab"); // forgot password link
  await page.keyboard.press("Tab"); // submit button
  await page.screenshot({ path: `${outDir}/${vp.name}-03-login-focus.png` });

  // ── Real login with seeded admin ────────────────────────────────────
  await page.fill("#login-email", "admin@brasaland.com");
  await page.fill("#login-password", "Admin123!");
  await page.click('button:has-text("Sign in")');
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/${vp.name}-04-dashboard.png`, fullPage: true });

  // Mobile nav drawer check
  if (vp.name === "mobile") {
    const menuButton = page.locator('button[aria-label="Open navigation"]');
    if (await menuButton.count()) {
      await menuButton.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${outDir}/${vp.name}-04b-nav-drawer.png` });
      await page.keyboard.press("Escape").catch(() => {});
      await page.locator('button[aria-label="Close navigation"]').first().click().catch(() => {});
      await page.waitForTimeout(200);
    }
  }

  // Incidents (table-heavy)
  await page.goto(`${baseUrl}/incidents`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const incidentsOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await page.screenshot({ path: `${outDir}/${vp.name}-05-incidents.png`, fullPage: true });

  // Inventory
  await page.goto(`${baseUrl}/inventory`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const inventoryOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await page.screenshot({ path: `${outDir}/${vp.name}-06-inventory.png`, fullPage: true });

  // Hiring/new (form-heavy)
  await page.goto(`${baseUrl}/hiring/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/${vp.name}-07-hiring-new.png`, fullPage: true });

  console.log(
    `${vp.name}: loginOverflow=${loginOverflow} incidentsOverflow=${incidentsOverflow} inventoryOverflow=${inventoryOverflow} passwordToggle(${typeBefore}->${typeAfter}) consoleErrors=${consoleErrors.length}`,
  );
  if (consoleErrors.length) console.log("  " + consoleErrors.slice(0, 5).join("\n  "));

  await context.close();
}

await browser.close();
console.log(`Saved to ${outDir}`);
