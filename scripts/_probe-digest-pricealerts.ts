// One-off: verify the v2 supplier price section end-to-end.
// 1. computePriceAlerts() — now also writes weeklyImpactDollars.
// 2. buildWeeklyDigestSnapshot() — priceSpikes now reads OPEN PriceAlerts.
// 3. Render HTML + text previews (no email).
import { writeFileSync } from "fs";
import { computePriceAlerts } from "../src/lib/price-alerts/compute";
import { buildWeeklyDigestSnapshot } from "../src/lib/weekly-digest/aggregator";
import { renderDigestHtml, renderDigestText } from "../src/lib/weekly-digest/html-renderer";

async function main() {
  const res = await computePriceAlerts();
  console.log("computePriceAlerts:", JSON.stringify(res));

  const snapshot = await buildWeeklyDigestSnapshot();
  console.log("week:", snapshot.weekStart, "->", snapshot.weekEnd);
  console.log(JSON.stringify(snapshot.priceSpikes, null, 2));

  const narrative = {
    headline: "PREVIEW ONLY",
    sectionNotes: { prices: "Preview note." },
    actionItems: ["Preview action."],
  };
  const html = renderDigestHtml(snapshot, narrative);
  const out = "/private/tmp/claude-501/-Users-chris-C/1689f457-1f90-45f0-babc-677833e7462e/scratchpad/digest-preview-v2.html";
  writeFileSync(out, html);
  console.log("html written:", out);

  const text = renderDigestText(snapshot, narrative);
  const idx = text.indexOf("SUPPLIER PRICE CHANGES");
  console.log("--- text render (prices part) ---");
  console.log(idx >= 0 ? text.slice(idx, idx + 1200) : "(no prices section — 0 open alerts)");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
