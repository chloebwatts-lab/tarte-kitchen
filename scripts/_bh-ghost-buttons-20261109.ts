/**
 * Beach House (Currumbin Square account) stray till buttons, 9 Nov 2026.
 * Inspect by default; ARCHIVE=1 archives the listed ITEM ids (hidden from POS, reversible in Square Dashboard > Items > Archived).
 * Run on the droplet: set -a; . ./.env; set +a
 *   docker compose run --rm -T -e TOKEN_ENCRYPTION_KEY -e DATABASE_URL -e ARCHIVE -v $PWD/scripts/_bh-ghost-buttons-20261109.ts:/app/scripts/x.ts migrate npx tsx scripts/x.ts
 */
import { db } from "../src/lib/db"
import { decrypt } from "../src/lib/encryption"
const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Square-Version": "2025-07-16", "Content-Type": "application/json" })
const NAMES = ["Oklahoma Burger", "Vege Bagel", "House Potato Hash", "BLT Sandwich", "Cheese Bagel + Soup", "Chopped Wombok Chicken Salad", "Double Smoked Bacon", "Potato Hash", "BLT", "Wombok Chicken Salad", "Hash", "Bacon"]
async function main() {
  const conns = await db.squareConnection.findMany()
  const conn = conns.find((c) => c.merchantId === "MLP8ZN09MYC4A") ?? conns.find((c) => (c.merchantName ?? "").match(/Currumbin|Beach/i))
  if (!conn) throw new Error("Currumbin Square connection not found: " + JSON.stringify(conns.map((c) => [c.merchantId, c.merchantName])))
  const token = decrypt(conn.accessToken)
  console.log("account", conn.merchantId, conn.merchantName, "locations", JSON.stringify(conn.locations))
  const found: any[] = []
  for (const n of NAMES) {
    const r = await (await fetch("https://connect.squareup.com/v2/catalog/search", { method: "POST", headers: H(token), body: JSON.stringify({ object_types: ["ITEM"], include_related_objects: false, query: { exact_query: { attribute_name: "name", attribute_value: n } } }) })).json()
    for (const o of r.objects ?? []) found.push(o)
  }
  const seen = new Set<string>()
  for (const o of found) {
    if (seen.has(o.id)) continue; seen.add(o.id)
    const d = o.item_data
    console.log(JSON.stringify({ id: o.id, name: d.name, archived: d.is_archived ?? false, allLoc: o.present_at_all_locations, locs: o.present_at_location_ids, absent: o.absent_at_location_ids, cat: d.reporting_category?.id, vars: (d.variations ?? []).map((v: any) => [v.item_variation_data?.name, v.item_variation_data?.price_money?.amount, v.present_at_location_ids]), updated: o.updated_at, version: o.version }))
  }
  if (process.env.ARCHIVE) {
    const ids = process.env.ARCHIVE.split(",").map((s) => s.trim()).filter(Boolean)
    for (const id of ids) {
      const o = found.find((x) => x.id === id)
      if (!o) { console.log("skip, not found", id); continue }
      o.item_data.is_archived = true
      const r = await (await fetch("https://connect.squareup.com/v2/catalog/object", { method: "POST", headers: H(token), body: JSON.stringify({ idempotency_key: `archive-${id}-20261109`, object: o }) })).json()
      console.log("ARCHIVED", id, o.item_data.name, r.errors ? JSON.stringify(r.errors) : "ok v" + r.catalog_object?.version + " archived=" + r.catalog_object?.item_data?.is_archived)
    }
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
