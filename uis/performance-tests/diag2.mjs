import { chromium } from "@playwright/test";
import { playAudit } from "playwright-lighthouse";

const PORT = 9231;
const browser = await chromium.launch({
  args: [`--remote-debugging-port=${PORT}`],
});
const page = await browser.newPage();

await page.goto("http://localhost:3001/login");
await page.locator("#login-email").fill("admin@brasaland.com");
await page.locator("#login-password").fill("Admin123!");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/dashboard");

await page.goto("http://localhost:3001/suppliers");
console.log("before lighthouse, url:", page.url());
const tokenBefore = await page.evaluate(() =>
  window.localStorage.getItem("brasaland_access_token"),
);
console.log("token before lighthouse:", !!tokenBefore);

await playAudit({
  page,
  port: PORT,
  thresholds: {
    performance: 85,
    accessibility: 0,
    "best-practices": 85,
    seo: 85,
  },
  reports: {
    formats: { json: true },
    name: "diag-suppliers",
    directory: "/tmp/diag-reports",
  },
});

console.log("after lighthouse, page.url():", page.url());
const tokenAfter = await page.evaluate(() =>
  window.localStorage.getItem("brasaland_access_token"),
);
console.log("token after lighthouse:", !!tokenAfter);

await browser.close();
