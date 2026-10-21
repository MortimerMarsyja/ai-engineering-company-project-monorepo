import { chromium, test } from "@playwright/test";
import { config } from "../helpers/config";
import { runLighthouseAudit } from "../helpers/lighthouse-audit";

const DEBUG_PORT = 9223;

test("brasaland-web home page", async () => {
  const browser = await chromium.launch({
    args: [`--remote-debugging-port=${DEBUG_PORT}`],
  });
  try {
    const page = await browser.newPage();
    await page.goto(config.webBaseUrl);
    await runLighthouseAudit({
      page,
      port: DEBUG_PORT,
      pageName: "brasaland-web--home",
    });
  } finally {
    await browser.close();
  }
});
