import path from "node:path";
import type { Page } from "@playwright/test";
import { playAudit } from "playwright-lighthouse";
import { config } from "./config";

export interface LighthouseThresholds {
  performance?: number;
  accessibility?: number;
  "best-practices"?: number;
  seo?: number;
}

// playwright-lighthouse derives which categories to audit from these
// keys (an empty {} makes Lighthouse itself reject the run with
// "onlyCategories cannot be an empty array"), AND it defaults any
// *omitted* threshold to 100 — so every category must be listed
// explicitly even though they all share the same bar.
const DEFAULT_THRESHOLDS: Required<LighthouseThresholds> = {
  performance: 90,
  accessibility: 90,
  "best-practices": 90,
  seo: 90,
};

export interface RunLighthouseAuditOptions {
  page: Page;
  port: number;
  pageName: string;
  /** Defaults to DEFAULT_THRESHOLDS (90 across the board). Pass a
   * different object to override per call site without touching this
   * function. */
  thresholds?: LighthouseThresholds;
}

export async function runLighthouseAudit({
  page,
  port,
  pageName,
  thresholds = DEFAULT_THRESHOLDS,
}: RunLighthouseAuditOptions) {
  return playAudit({
    page,
    port,
    thresholds,
    reports: {
      formats: { html: true, json: true },
      name: pageName,
      directory: path.join(config.reportsDir, "lighthouse"),
    },
  });
}
