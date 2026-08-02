import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const r = await pool.query(`
    WITH w AS (
      SELECT "weekStartWed"::date wk, "revenueExGst"::float rev, "totalCogs"::float cogs
      FROM "WeeklyCogs" WHERE venue='BEACH_HOUSE' AND "weekStartWed" >= '2026-06-03'
    )
    SELECT w.wk::text week, w.rev, w.cogs,
      (SELECT COALESCE(SUM(COALESCE(i.subtotal, i.total)),0) FROM "Invoice" i
        WHERE i.venue IN ('BEACH_HOUSE','TEA_GARDEN')
          AND i.status NOT IN ('ERROR','STATEMENT','DUPLICATE')
          AND i."invoiceDate" >= (w.wk - 1) + time '14:00' AND i."invoiceDate" < (w.wk + 6) + time '14:00')::float AS invoiced_exgst
    FROM w ORDER BY w.wk`);
  for (const x of r.rows) {
    console.log(`${x.week}  rev ${x.rev.toFixed(0)}  Louise COGS ${x.cogs.toFixed(0)} (${(x.cogs/x.rev*100).toFixed(1)}%)  invoices dated in wk ${x.invoiced_exgst.toFixed(0)} (${(x.invoiced_exgst/x.rev*100).toFixed(1)}%)  diff ${(x.invoiced_exgst-x.cogs).toFixed(0)}`);
  }
  const tot = r.rows.reduce((s:any,x:any)=>({rev:s.rev+x.rev,c:s.c+x.cogs,i:s.i+x.invoiced_exgst}),{rev:0,c:0,i:0});
  console.log(`\nTOTAL ${r.rows.length} wks: rev ${tot.rev.toFixed(0)} | Louise ${tot.c.toFixed(0)} (${(tot.c/tot.rev*100).toFixed(1)}%) | invoices ${tot.i.toFixed(0)} (${(tot.i/tot.rev*100).toFixed(1)}%)`);
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
