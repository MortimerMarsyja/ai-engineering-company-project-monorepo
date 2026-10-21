import type { Page } from "@playwright/test";
import { config } from "./config";

/** Logs in through the real UI (not an API shortcut) so the authenticated
 * page/context this returns has the same localStorage JWT a real staff
 * session would — see uis/backoffice/app/login/page.tsx for the form this
 * mirrors. */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto(`${config.backofficeBaseUrl}/login`);
  await page.locator("#login-email").fill(config.adminEmail);
  await page.locator("#login-password").fill(config.adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}
