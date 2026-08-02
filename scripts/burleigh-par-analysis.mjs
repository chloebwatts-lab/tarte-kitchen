import pg from 'pg';
import fs from 'fs';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s,p)=> (await pool.query(s,p)).rows;
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const median = a => { const s=[...a].sort((x,y)=>x-y); const m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; };
const weekOf = d => { const t=new Date(d); const off=(t.getUTCDay()+6)%7; t.setUTCDate(t.getUTCDate()-off); return t.toISOString().slice(0,10); };
const round = n => n>=20?Math.round(n): n>=5?Math.round(n*2)/2 : Math.round(n*4)/4;

// ---- Baseline: term-time weeks with stable ingestion, Apr27–Jul20 ----
const WIN_START='2026-04-27', WIN_END='2026-07-20';
const HOLIDAY = {
  '2026-05-04':'Labour Day public holiday (+19% rev)',
  '2026-06-29':'Winter school holidays',
  '2026-07-06':'Winter school holidays (peak, +44% rev)',
  '2026-07-13':'Winter school-holiday tail',
};
const isNormal = wk => wk>=WIN_START && wk<=WIN_END && !HOLIDAY[wk];
const NOISE = /freight|delivery fee|delivery charge|standard delivery|payment surcharge|surcharge|delivery order:|^\[invoice\]|rounding|^total\b|^credit|^eft\b|^account/i;

// normalise a description to a comparable token set
const PACK = /\b\d+(?:\.\d+)?\s*(?:kg|kgs|g|gr|gm|gms|grams|ml|mls|l|lt|ltr|litre|litres|oz|ea|pk|pkt|pkts|pack|packs|ct|ctn|cs|case|dozen|doz|slv|sleeve|tub|tubs|btl|pat|pats|inn|bag|bags|box|boxes|carton|cartons|roll|rolls|tray|trays|bun|bunch|pun|punnet)\b/g;
function tokens(desc){
  return desc.toLowerCase()
    .replace(/\[[^\]]*\]/g,' ')
    .replace(/\([^)]*\)/g,' ')
    .replace(/\d+(?:\.\d+)?\s*["']/g,' ')
    .replace(PACK,' ')
    .replace(/\b\d+(?:\.\d+)?\b/g,' ')
    .replace(/[^a-z ]/g,' ')
    .split(/\s+/).filter(w=>w.length>1);
}

const rows = await q(`
  SELECT i."supplierName" supplier, i."invoiceDate"::text idate, i.id invid,
         li.description descr, li.quantity::float qty, li.unit,
         li."ingredientId" ingid, ing.name ingname, li."unitPrice"::float up
  FROM "InvoiceLineItem" li JOIN "Invoice" i ON i.id=li."invoiceId"
  LEFT JOIN "Ingredient" ing ON ing.id=li."ingredientId"
  WHERE i.venue='BURLEIGH' AND i.status IN ('EXTRACTED','MATCHED','APPROVED')
    AND i."invoiceDate" IS NOT NULL AND li.quantity IS NOT NULL AND li.quantity>0`);

const normalWeeks = [...new Set(rows.map(r=>weekOf(r.idate)).filter(isNormal))].sort();
const N = normalWeeks.length;
const kept = rows.filter(r=>isNormal(weekOf(r.idate)) && !NOISE.test(r.descr));

// build variant map per supplier
const perSupplier = {};
for (const r of kept){ (perSupplier[r.supplier] ||= new Map()); const m=perSupplier[r.supplier];
  if(!m.has(r.descr)) m.set(r.descr,{descr:r.descr,tok:new Set(tokens(r.descr)),ings:new Set(),rows:[]});
  const v=m.get(r.descr); if(r.ingid)v.ings.add(r.ingid); v.rows.push(r);
}
const setSubset=(a,b)=>{ if(!a.size||a.size>b.size)return false; for(const x of a) if(!b.has(x))return false; return true; };

// union-find subset/ingredient merge within a supplier
const groups=[];
for (const [supplier,m] of Object.entries(perSupplier)){
  const vs=[...m.values()];
  const parent=vs.map((_,i)=>i);
  const find=x=>parent[x]===x?x:(parent[x]=find(parent[x]));
  const uni=(a,b)=>{parent[find(a)]=find(b);};
  for(let i=0;i<vs.length;i++)for(let j=0;j<vs.length;j++){ if(i===j)continue;
    const shareIng=[...vs[i].ings].some(x=>vs[j].ings.has(x));
    if(shareIng || setSubset(vs[i].tok,vs[j].tok)) uni(i,j);
  }
  const byRoot={}; vs.forEach((v,i)=>{(byRoot[find(i)] ||= []).push(v);});
  for(const grp of Object.values(byRoot)) groups.push({supplier,variants:grp});
}

const results=[];
for(const g of groups){
  const allRows=g.variants.flatMap(v=>v.rows);
  const nameCount={}; for(const v of g.variants) nameCount[v.descr]=(nameCount[v.descr]||0)+v.rows.length;
  const canonical=Object.entries(nameCount).sort((a,b)=> b[1]-a[1] || a[0].length-b[0].length)[0][0];
  const ing = allRows.find(r=>r.ingname)?.ingname || null;
  const unit=(()=>{const c={};for(const r of allRows) if(r.unit)c[r.unit]=(c[r.unit]||0)+1;return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;})();
  const weekQty={}, dow={};
  for(const r of allRows){ const wk=weekOf(r.idate); weekQty[wk]=(weekQty[wk]||0)+r.qty;
    const d=DOW[new Date(r.idate).getUTCDay()]; dow[d]=(dow[d]||0)+1; }
  const weeksSeen=Object.keys(weekQty).length;
  const seen=normalWeeks.filter(w=>weekQty[w]).map(w=>weekQty[w]);
  const weeklyMean=normalWeeks.reduce((a,w)=>a+(weekQty[w]||0),0)/N;
  const dowSorted=Object.entries(dow).sort((a,b)=>b[1]-a[1]);
  const conf = weeksSeen/N>=0.7?'HIGH':weeksSeen/N>=0.4?'MED':'LOW';
  results.push({
    supplier:g.supplier, product:canonical, ingredient:ing, unit,
    variants:g.variants.length>1?g.variants.map(v=>v.descr):undefined,
    weeksSeen, coverage:+(weeksSeen/N).toFixed(2), confidence:conf,
    weeklyTypical:round(median(seen)), weeklyMean:+weeklyMean.toFixed(1),
    perDelivery:round(median(allRows.map(r=>r.qty))), deliveriesPerWeek:+(allRows.length/N).toFixed(2),
    orderDays:dowSorted.map(([d,c])=>({day:d,n:c})), primaryDay:dowSorted[0]?.[0]||null,
    weekByWeek:Object.fromEntries(normalWeeks.map(w=>[w,+(weekQty[w]||0).toFixed(1)])),
  });
}
results.sort((a,b)=>a.supplier.localeCompare(b.supplier)|| (b.weeklyMean-a.weeklyMean));

const supDow={};
for(const r of results) for(const o of r.orderDays){ (supDow[r.supplier] ||= {})[o.day]=(supDow[r.supplier]?.[o.day]||0)+o.n; }
const supProfile={};
for(const [s,d] of Object.entries(supDow)){ const tot=Object.values(d).reduce((a,b)=>a+b,0)||1;
  supProfile[s]=Object.entries(d).sort((a,b)=>b[1]-a[1]).map(([day,n])=>({day,n,pct:Math.round(n/tot*100)})); }

fs.writeFileSync('scripts/burleigh-order-pars.json', JSON.stringify({
  generated:'2026-07-27', venue:'BURLEIGH',
  method:'Weekly totals summed per normal week; product variants merged by shared ingredient-id or token-subset; weeklyTypical = median weekly total across weeks the line is ordered.',
  baseline:{window:[WIN_START,WIN_END], normalWeeks, count:N, avgWeeklyRevenueExGst:94062},
  holidayUplift:{schoolHolidays:'+30% to +44%', publicHolidayLongWeekend:'+19%', apply:'×1.35 school hols, ×1.2 PH long weekend'},
  excludedWeeks:HOLIDAY, supplierDeliveryDays:supProfile, productLines:results
},null,2));

const tiers=results.reduce((a,r)=>{a[r.confidence]=(a[r.confidence]||0)+1;return a;},{});
console.log(`Normal weeks (${N}): ${normalWeeks.join(', ')}`);
console.log(`Product lines after merge: ${results.length}  tiers:`,tiers);
const show=re=>results.filter(r=>re.test(r.product)&&r.supplier==='Bidfood')
  .forEach(r=>console.log(`  ${r.product.slice(0,42).padEnd(42)} wk≈${r.weeklyTypical} ${r.unit}  (${r.perDelivery}/del ×${r.deliveriesPerWeek.toFixed(1)}wk, merged ${r.variants?.length||1} variants)`));
console.log('\nSALMON:'); show(/salmon/i);
console.log('SALTED BUTTER:'); show(/butter salted|salted butter/i);
console.log('PHILADELPHIA:'); show(/philadel/i);
console.log('TORTILLA:'); show(/tortilla/i);
await pool.end();
