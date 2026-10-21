import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const reportsDir = process.env.REPORTS_DIR ?? "reports";
const lighthouseDir = join(reportsDir, "lighthouse");

const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

function scoreFor(categories, key) {
  const score = categories?.[key]?.score;
  return typeof score === "number" ? Math.round(score * 100) : null;
}

function cell(score) {
  if (score === null) return "<td>—</td>";
  const color = score >= 90 ? "#0cce6b" : score >= 50 ? "#ffa400" : "#ff4e42";
  return `<td style="color:${color};font-weight:600">${score}</td>`;
}

// Audits worth surfacing as "improvement recommendations": they have a
// numeric/metricSavings score below perfect and aren't purely
// informative (manual checks, N/A audits, and already-passing audits
// are noise here).
const SKIP_DISPLAY_MODES = new Set(["notApplicable", "manual", "informative"]);

function escapeHtml(str) {
  return str.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Audit descriptions are Lighthouse's own markdown-lite: `[text](url)`
// links and backtick code spans. Convert just those two forms to HTML.
function renderDescription(description) {
  return escapeHtml(description)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function topRecommendations(audits, limit = 5) {
  return Object.values(audits)
    .filter((a) => typeof a.score === "number" && a.score < 1 && !SKIP_DISPLAY_MODES.has(a.scoreDisplayMode))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

function recommendationsList(audits) {
  const recs = topRecommendations(audits);
  if (recs.length === 0) return "<p>No notable improvement opportunities — all audits passed.</p>";
  return `<ul>
      ${recs
        .map(
          (a) => `<li>
        <strong>${escapeHtml(a.title)}</strong>${a.displayValue ? ` — ${escapeHtml(a.displayValue)}` : ""}
        <div class="audit-desc">${renderDescription(a.description ?? "")}</div>
      </li>`
        )
        .join("\n")}
    </ul>`;
}

const jsonFiles = readdirSync(lighthouseDir).filter((f) => f.endsWith(".json"));

if (jsonFiles.length === 0) {
  console.error(`No Lighthouse JSON reports found in ${lighthouseDir}. Run "pnpm test" first.`);
  process.exit(1);
}

const rows = jsonFiles
  .sort()
  .map((file) => {
    const data = JSON.parse(readFileSync(join(lighthouseDir, file), "utf-8"));
    const pageName = file.replace(/\.json$/, "");
    const htmlFile = `${pageName}.html`;
    const scores = CATEGORIES.map((key) => scoreFor(data.categories, key));

    return `<tr>
      <td>${pageName}</td>
      ${scores.map(cell).join("\n      ")}
      <td><a href="lighthouse/${htmlFile}">Full report</a></td>
    </tr>
    <tr>
      <td colspan="${CATEGORIES.length + 2}" style="padding:0;border-bottom:1px solid #e0e0e0;">
        <details>
          <summary style="cursor:pointer;padding:0.5rem 0.75rem;color:#555;">Top improvement opportunities</summary>
          <div style="padding:0 0.75rem 0.75rem 1.5rem;">${recommendationsList(data.audits)}</div>
        </details>
      </td>
    </tr>`;
  })
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Lighthouse performance report</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #e0e0e0; }
    th { background: #f5f5f5; }
    caption { text-align: left; margin-bottom: 1rem; font-size: 0.9rem; color: #555; }
    details summary::-webkit-details-marker { color: #555; }
    .audit-desc { color: #555; font-size: 0.85rem; margin-top: 0.15rem; }
    .audit-desc a { color: #1a73e8; }
    .audit-desc code { background: #f0f0f0; padding: 0 0.25rem; border-radius: 3px; }
    ul { margin: 0.25rem 0; padding-left: 1.25rem; }
    li { margin-bottom: 0.5rem; }
  </style>
</head>
<body>
  <h1>Lighthouse performance report</h1>
  <table>
    <caption>Generated ${new Date().toISOString()} — ${jsonFiles.length} page(s) audited.</caption>
    <thead>
      <tr>
        <th>Page</th>
        <th>Performance</th>
        <th>Accessibility</th>
        <th>Best Practices</th>
        <th>SEO</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>
`;

writeFileSync(join(reportsDir, "index.html"), html);
console.log(`Report written to ${join(reportsDir, "index.html")} (${jsonFiles.length} pages).`);
