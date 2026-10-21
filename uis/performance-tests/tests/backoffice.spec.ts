import { type Browser, type Page, chromium, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/backoffice-login";
import { config } from "../helpers/config";
import { runLighthouseAudit } from "../helpers/lighthouse-audit";

// Separate debug ports AND separate browser instances for the anonymous
// vs. authenticated sessions. playwright-lighthouse drives Lighthouse
// via the raw CDP port, not the specific Playwright `page` object we
// pass it — with two tabs open on the same port, it latches onto
// whichever tab it discovers first and keeps reusing that one tab for
// every subsequent audit, silently ignoring which `page` we intended.
// One browser (one port, one tab) per identity avoids that ambiguity.
const ANONYMOUS_DEBUG_PORT = 9222;
const AUTHENTICATED_DEBUG_PORT = 9224;

// A logged-in user never actually experiences these pages' first-visit
// render, so they're audited anonymously for a realistic measurement —
// everything else needs the authenticated session.
const PUBLIC_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];

const AUTHENTICATED_ROUTES = [
  "/dashboard",
  "/account/profile",
  "/account/profile/edit",
  "/account/change-password",
  "/hiring",
  "/hiring/new",
  "/incidents",
  "/incidents/new",
  "/inventory",
  "/inventory/orders",
  "/inventory/deliveries/new",
  "/inventory/exits/new",
  "/locations",
  "/loyalty",
  "/orders",
  "/suppliers",
  "/suppliers/new",
];

function slugify(route: string): string {
  return route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");
}

test.describe.serial("backoffice", () => {
  let anonymousBrowser: Browser;
  let anonymousPage: Page;
  let authenticatedBrowser: Browser;
  let authenticatedPage: Page;

  test.beforeAll(async () => {
    anonymousBrowser = await chromium.launch({
      args: [`--remote-debugging-port=${ANONYMOUS_DEBUG_PORT}`],
    });
    anonymousPage = await anonymousBrowser.newPage();

    authenticatedBrowser = await chromium.launch({
      args: [`--remote-debugging-port=${AUTHENTICATED_DEBUG_PORT}`],
    });
    authenticatedPage = await authenticatedBrowser.newPage();
    await loginAsAdmin(authenticatedPage);
  });

  test.afterAll(async () => {
    await anonymousBrowser.close();
    await authenticatedBrowser.close();
  });

  for (const route of PUBLIC_ROUTES) {
    test(`public: ${route}`, async () => {
      await anonymousPage.goto(`${config.backofficeBaseUrl}${route}`);
      await runLighthouseAudit({
        page: anonymousPage,
        port: ANONYMOUS_DEBUG_PORT,
        pageName: `backoffice--${slugify(route)}`,
      });
    });
  }

  for (const route of AUTHENTICATED_ROUTES) {
    test(`authenticated: ${route}`, async () => {
      await authenticatedPage.goto(`${config.backofficeBaseUrl}${route}`);
      await runLighthouseAudit({
        page: authenticatedPage,
        port: AUTHENTICATED_DEBUG_PORT,
        pageName: `backoffice--${slugify(route)}`,
      });
    });
  }
});
