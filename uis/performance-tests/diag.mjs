import { chromium } from "@playwright/test";

const browser = await chromium.launch({ args: ["--remote-debugging-port=9230"] });
const page = await browser.newPage();

await page.goto("http://localhost:3001/login");
await page.locator("#login-email").fill("admin@brasaland.com");
await page.locator("#login-password").fill("Admin123!");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/dashboard");
console.log("after login, url:", page.url());

const token1 = await page.evaluate(() => window.localStorage.getItem("brasaland_access_token"));
console.log("token present after login:", !!token1, token1 ? token1.slice(0, 20) : null);

// Now do a FRESH full navigation (like our test does) to another protected route
await page.goto("http://localhost:3001/suppliers");
console.log("after goto /suppliers, url:", page.url());

const token2 = await page.evaluate(() => window.localStorage.getItem("brasaland_access_token"));
console.log("token present after goto /suppliers:", !!token2);

await browser.close();
