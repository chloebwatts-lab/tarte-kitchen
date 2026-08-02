// One-off: run the real digest aggregator + renderers (no email) to
// verify the new reviews.responseWatch section end-to-end.
import { writeFileSync } from "fs";
import { buildWeeklyDigestSnapshot } from "../src/lib/weekly-digest/aggregator";
import { renderDigestHtml, renderDigestText } from "../src/lib/weekly-digest/html-renderer";

async function main() {
  const snapshot = await buildWeeklyDigestSnapshot();
  console.log("week:", snapshot.weekStart, "->", snapshot.weekEnd);
  console.log(JSON.stringify(snapshot.reviews.responseWatch, null, 2));
  const narrative = {
    headline: "PREVIEW ONLY",
    sectionNotes: { reviews: "Preview note." },
    actionItems: ["Preview action."],
  };
  const html = renderDigestHtml(snapshot, narrative);
  writeFileSync("/tmp/digest-preview.html", html);
  console.log("--- text render (reviews part) ---");
  const text = renderDigestText(snapshot, narrative);
  const idx = text.indexOf("REVIEWS");
  console.log(text.slice(idx, idx + 800));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
