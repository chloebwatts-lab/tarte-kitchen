// Enrich maintenance assets with researched warranty terms + error-code
// dictionaries (sourced from official AU manufacturer/distributor pages and
// service manuals, 2026-07-25). Idempotent — keyed by mxId.
// Run: npx tsx --env-file=.env.local scripts/enrich-maintenance.ts
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

type EC = { code: string; meaning: string; action: string }

// ── Error-code dictionaries (per manual family) ─────────────────────────────

const MEIKO_UPSTER: EC[] = [
  { code: "202", meaning: "Boiler not filling with water in time", action: "Check the tap is fully open, hose not kinked, clean the inlet filter. Still failing → call the tech." },
  { code: "201", meaning: "Boiler level not reached on first fill", action: "Same checks as 202: tap, hose, inlet filter." },
  { code: "120", meaning: "Emergency program — no heating or no fresh water", action: "Check water tap. If it stays on, call the tech." },
  { code: "121", meaning: "Hood/door not detected as closed", action: "Close the hood fully. Persists → microswitch, call the tech." },
  { code: "420", meaning: "Rinse aid empty", action: "Refill rinse aid." },
  { code: "520", meaning: "Detergent empty", action: "Refill detergent." },
  { code: "723", meaning: "Regeneration needed (salt)", action: "Add softener salt, run regeneration." },
  { code: "301", meaning: "Tank not filling (rinse cycles exceeded)", action: "Check water pressure, clean inlet valve sieve and rinse jets." },
  { code: "302", meaning: "Tank not draining during self-clean", action: "Check/clean the drain pump area and restart." },
  { code: "205", meaning: "Boiler temperature not reached", action: "Call the tech (heating element / thermal fuse)." },
  { code: "212 / 312", meaning: "Boiler >95° / tank >85° — overtemperature", action: "Switch OFF at the wall and call the tech. Don't keep running it." },
  { code: "210/211/310/311", meaning: "Temperature sensor fault", action: "Call the tech." },
]

const HOBART_3DIGIT = (doorWord: string): EC[] => [
  { code: "032 / 031", meaning: "Water not coming in — supply tap likely closed", action: "Check the water tap/cock is open. That's the fix Oli's photo showed." },
  { code: "018", meaning: "Water level regulation in wash tank", action: "Press the tick to acknowledge — machine pumps out and fixes the level itself." },
  { code: "021 / 022", meaning: "Drain system fault", action: "Clean the drain hose, run pump-out again. Persists → call the tech." },
  { code: "029 / 039", meaning: `Programme aborted — ${doorWord} open`, action: `Close the ${doorWord}.` },
  { code: "035", meaning: "Tank strainer not seated", action: "Refit the tank cover strainer properly." },
  { code: "036", meaning: "Detergent empty", action: "Top up detergent." },
  { code: "037", meaning: "Rinse aid empty", action: "Top up rinse aid." },
  { code: "040", meaning: "Hygiene programme due", action: "Run the hygiene programme." },
  { code: "043 / 044", meaning: "Regeneration salt empty", action: "Refill salt." },
  { code: "003/004/008/009", meaning: "Temperature not reached", action: "Call the tech." },
  { code: "033 / 052", meaning: "Fill/drain system fault", action: "052: turn off water + power, then call the tech." },
]

const HOBART_ECOMAX: EC[] = [
  { code: "17 / 18 / 31", meaning: "Machine can't fill — water supply", action: "Check the tap is open and water is on." },
  { code: "13", meaning: "Tank not filling correctly (pressure sensor)", action: "Drain/pump out the machine and retry. Returns → call the tech." },
  { code: "14", meaning: "Tank not emptying during pump-out", action: "Clean the drain hose, run pump-out again." },
  { code: "28", meaning: "Tank level too low at start", action: "Machine refills itself; if the code stays on, call the tech." },
  { code: "29", meaning: "Water treatment cartridge depleted", action: "Replace the demineralisation cartridge." },
  { code: "SA Lt", meaning: "Regeneration salt low", action: "Refill salt." },
  { code: "01–12", meaning: "Boiler/tank sensor or level faults", action: "Call the tech." },
  { code: "Seeing 'Message number 032'?", meaning: "That's the newer Hobart touch display (PROFI/GC family) — same fault family as Er 17/18/31", action: "032 = water not coming in. Open the water tap, press ✓." },
]

const ESWOOD_SW: EC[] = [
  { code: "Er01", meaning: "Not rinsing correctly", action: "Clean the rinse nozzles, restart. Recurs → call the tech." },
  { code: "Er02", meaning: "No drainage", action: "Check drain pipe for kinks, clean siphon + filters, check overflow pipe removed before draining." },
  { code: "Er03", meaning: "Boiler temp didn't recover in time", action: "Switch off and on, run a new cycle. Recurs → call the tech." },
  { code: "Er04", meaning: "Wash tank not filling", action: "Check tap open, inlet pipes connected, overflow plugged. Switch off/on." },
  { code: "Er05–Er08", meaning: "Temperature probe faults", action: "Switch off, wait a few minutes, restart. Recurs → call the tech." },
  { code: "ErSF", meaning: "Safety cutout tripped (temp/level unsafe)", action: "Call the tech — don't keep restarting it." },
]

// UNOX MIND.Maps generation (all Tarte units). Verified against the official
// MIND.Maps service manual 25/07/26 — the older XVC-era codes (AF05/AF06,
// bare "GAS" prompt) don't exist on this generation.
const UNOX_CODES: EC[] = [
  { code: "AF23 GAS UNIT LOCK", meaning: "No flame / lack of gas — burner locked out", action: "Check the gas cock is open, then press GAS REARM on screen once. If it will NOT relight: close the gas cock, stop using it, call the tech (licensed gas)." },
  { code: "AF01", meaning: "Motors overheated", action: "Turn off, cool 30 min, restart. Comes back → call the tech." },
  { code: "AF02", meaning: "Safety thermostat tripped (oven overheated)", action: "Cool 30 min, restart once. Repeats → call the tech." },
  { code: "AF04", meaning: "Control panel lost contact with power board", action: "Power off at wall 60s, restart. Persists → call the tech." },
  { code: "WF29", meaning: "Gas fumes temperature too high", action: "Stop using it, call the tech." },
  { code: "WF16 / WF27", meaning: "No water reaching the oven", action: "Check water tap and the UNOX.Pure filter cartridge isn't blocked/expired." },
  { code: "WF19", meaning: "Detergent empty (DET&Rinse)", action: "Replace detergent tank, rerun wash." },
  { code: "WC01 / WC05 / WC06", meaning: "Hood warnings: fume probe / fumes too hot / hood lack of power", action: "Check the hood's own power switch and breaker (WC06 = hood has no power). Persists → call the tech." },
  { code: "Internal Error!! FW…", meaning: "Controller crash (seen on our Bakertop 24/07/26)", action: "Power off at the wall 60s. If it repeats, photo the screen and call the tech." },
]

// Electric UNOX units (Bakertop EPLM, XEBPC prover): same AF/WF families but
// no gas ignition/exhaust codes — showing gas advice on an electric oven
// sends staff hunting for a gas cock that doesn't exist.
const UNOX_ELECTRIC_CODES: EC[] = UNOX_CODES.filter(
  (c) => !c.code.includes("GAS") && c.code !== "WF29"
)

const RATIONAL_CODES: EC[] = [
  { code: "Service 11 / 12", meaning: "Water intake / measurement problem", action: "Check the tap is on and inlet hose/filter clear. Cooking still possible; persists → call the tech." },
  { code: "Service 25", meaning: "Not enough water for cleaning (iCare)", action: "Check tap, water filter/pressure, clean the drain sieve. No cooking until cleared." },
  { code: "Service 26 / 27", meaning: "Drain valve stuck", action: "No cooking. Check drain isn't blocked, then call the tech." },
  { code: "Service 28.x", meaning: "Over temperature", action: "Switch off, call the tech." },
  { code: "Service 29", meaning: "Electronics too hot", action: "Check vents/air filter around the unit aren't blocked, cool down. Repeats → call the tech." },
  { code: "Service 10", meaning: "Steam-generator auto-clean not working", action: "Cooking still works — log it and call the tech." },
  { code: "Service 13", meaning: "Steam generator water-level detection fault", action: "Hot-air mode still works. Call the tech." },
  { code: "Service 20.x", meaning: "Temperature probe defective", action: "Call the tech (20.1 = no cooking; 20.8 = hot-air only)." },
  { code: "Service 31.x", meaning: "Core temperature probe defective", action: "Keep cooking without the core probe; call the tech." },
  { code: "Service 34.x", meaning: "Internal communication fault", action: "Power-cycle once; persists → call the tech." },
]

const HOSHI_B: EC[] = [
  { code: "1 beep (every 3s)", meaning: "Evaporator too hot", action: "Turn off, let cool, press ALARM RESET on the control board. Recurs → call the tech." },
  { code: "2 beeps", meaning: "Ice not releasing (harvest overran twice)", action: "Check nothing jammed on the evaporator, press ALARM RESET." },
  { code: "3 beeps", meaning: "Freeze cycle overran — usually water starvation or dirty machine", action: "Check water tap + filter, press ALARM RESET." },
  { code: "6 / 7 beeps", meaning: "Supply voltage too low / too high", action: "Call the tech or electrician — don't keep resetting." },
  { code: "POWER OK flashing", meaning: "Bin full", action: "Normal — use ice; restarts itself." },
]

const HOSHI_C: EC[] = [
  { code: "E71 / n70", meaning: "Low water — not filling", action: "Check the water tap, hose and filter, then press RESET." },
  { code: "E60 / E61", meaning: "Freeze / harvest cycle error", action: "Check water supply, press RESET. Recurs → call the tech." },
  { code: "E64", meaning: "Evaporator too hot — shut down", action: "Press RESET; recurs → call the tech." },
  { code: "E46", meaning: "High pressure — condenser can't breathe", action: "Clean the air filter and condenser, clear vents around the machine." },
  { code: "n92", meaning: "Board overheating", action: "Clean the air filter." },
  { code: "E65 / E66", meaning: "Fan / pump locked", action: "Keep vents clear; recurs → call the tech." },
  { code: "n99", meaning: "Maintenance due", action: "Book a service." },
  { code: "FUL", meaning: "Bin full", action: "Normal — use ice." },
]

const MANITOWOC_CODES: EC[] = [
  { code: "Service light FLASHING", meaning: "A safety limit tripped but machine is retrying", action: "Note it and watch; goes solid → call the tech." },
  { code: "Service light SOLID", meaning: "Safety shutdown", action: "Press On/Off to restart once. Stops again → call the tech." },
  { code: "SL1+SL2 both flashing (board)", meaning: "NO WATER sensed", action: "Check the water tap, filter and hose kinks — most common fault." },
  { code: "SL1 (board)", meaning: "Freeze cycle too long — usually dirty condenser", action: "Clean the condenser/air filter, check airflow. Recurs → call the tech." },
  { code: "SL2 (board)", meaning: "Ice not releasing (scale/dirty evaporator)", action: "Run a clean cycle. Recurs → call the tech." },
  { code: "Bin Full blue", meaning: "Bin full", action: "Normal — use ice." },
]

const TURBOAIR_K: EC[] = [
  { code: "C1", meaning: "Not pulling down to temp (30 min compressor run, no cooling)", action: "Clean the condenser filter/dust FIRST, check door seal + airflow. Persists → call the tech." },
  { code: "P0 / P1", meaning: "Cabinet air sensor fault", action: "Restart at the wall once; returns → call the tech." },
  { code: "F1 / rd", meaning: "Defrost overran — heavy ice or heater fault", action: "Check for ice buildup and the door being left ajar. Repeats → call the tech." },
  { code: "d1 / rt", meaning: "Defrost / room sensor fault", action: "Machine keeps cooling — book the tech at next service." },
  { code: "EP", meaning: "Controller memory error", action: "Power-cycle at the wall; returns → call the tech." },
  { code: "(no display, won't restart)", meaning: "4-minute compressor lockout after stopping", action: "Normal — wait 4 minutes after any power blip." },
  { code: "How to read codes", meaning: "Codes are stored, not always shown", action: "Hold ▼+▲ together 5s (shows SL), then press ▼ four times. 'no' = no errors. (Drawer models: same controller family, codes assumed identical.)" },
]

const ROBOTCOUPE_CODES: EC[] = [
  { code: "Stops when hot", meaning: "Thermal cutout — motor overheated", action: "Unplug, cool up to 30 min, restart. No reset button on the MP series — cooling IS the reset." },
  { code: "Stops mid-mix (not hot)", meaning: "Mix too thick — overload", action: "Thin the mix or smaller batches, restart." },
  { code: "CL50 won't start", meaning: "Lid/bowl interlock not engaged", action: "Reseat bowl, close feed head, lock handle firmly, press green button. CL50 breaker reset button is under the base." },
  { code: "Smoke / burning smell / trips power", meaning: "Electrical fault", action: "Unplug and stop using it. Call the tech (or warranty claim — check the banner above)." },
]

const LM_LINEA_PB: EC[] = [
  { code: "Autofill Failed", meaning: "Boiler didn't fill in time — machine shuts down for safety", action: "Check the water tap + filter system, press ON/OFF to reset. Repeats → call the tech." },
  { code: "… Is Not Heating", meaning: "A boiler didn't reach temperature in time", action: "Power-cycle once; repeats → call the tech (element/relay)." },
  { code: "… Overheated", meaning: "Boiler over max temperature", action: "Stop using that boiler and call the tech." },
  { code: "… Probe Failed", meaning: "Temperature probe fault", action: "Call the tech." },
  { code: "Flow Meter No Pulse", meaning: "No water moving through a group", action: "Loosen the grind/dose first and retry — usually coffee, not machine. Still alarming → call the tech." },
]

const SCOTSMAN_NOTE: EC[] = [
  { code: "NOTE", meaning: "NB193 is the storage BIN — no codes of its own", action: "The codes live on the ice-maker HEAD on top. Read that model plate and tell Chloe so we add the right code table. Spare parts in the big shed box." },
]

// ── Warranty terms per brand (AU, researched 2026-07-25) ────────────────────
// Format: brand line to place into warrantyNotes; months only where the term
// is confident AND a purchaseDate exists on the row (else notes-only).

const W = {
  meiko: "Meiko AU: 24mo P&L (register within 90 days). Warranty/service 1300 562 500.",
  hobart: "Hobart AU: 12mo P&L from invoice. Service 1800 462 278.",
  eswood: "Eswood (Middleby AU): 24mo P&L for units supplied from Mar 2024 (12mo earlier). Service 1800 013 123.",
  unox: "UNOX AU: 12mo standard; extends to 24mo labour + 48mo parts if the oven is registered/connected (LONG.Life4). UNOX Australia 03 9876 0803.",
  rational: "Rational AU: 24mo P&L from install. 03 8369 4600.",
  turboair: "Turbo Air AU: 36mo warranty. Turbo Air Australia 1300 820 006 (they service direct, not Comcater).",
  atosa: "Atosa (Simco AU): 24mo P&L + years 3–4 parts-only. 1300 883 888. NOTE: claims need invoice + proof of 6-monthly servicing.",
  skipio: "Skipio AU: 24mo P&L. Service 02 8798 5283 / service@skipio-australia.com.",
  thermaster: "Thermaster (F.E.D.): 24mo P&L (+24mo parts-only if registered within 7 days of delivery). 1300 659 409.",
  bromic: "Bromic: 24mo P&L. 1300 276 642. Claim within 7 days of finding the fault.",
  williams: "Williams AU: 24mo P&L. Warranty dept 03 8787 4747 (have model + serial ready).",
  anvil: "Anvil (via International Catering Equipment): 12mo standard (some lines 24mo parts/12 labour). ICE 02 8372 0800, claims via their online form.",
  bonvue: "Bonvue (F.E.D.): 24mo P&L (+24 parts with product registration). 1300 659 409.",
  hoshizaki: "Hoshizaki AU: 36mo P&L on KM machines (+6mo if registered within 30 days; compressor parts to 5yr). 1300 551 361.",
  scotsman: "Scotsman (via Moffat): 24mo P&L for orders from Sep 2024. Moffat 24hr service 1300 264 217.",
  manitowoc: "Manitowoc (AJ Baker & Sons, AU importer): ~36mo P&L per manufacturer terms — confirm on claim. 1800 423 626.",
  kirby: "Kirby (cool room components): 12mo on parts. Gold Coast branches: Southport 07 5591 8188, Burleigh Heads 07 5593 6027.",
  everlasting: "Everlasting (via All Food Equipment): 12mo P&L onsite. 02 8372 0800.",
  bs: "B+S: K+ range 18mo P&L IF warranty activation form lodged (12mo otherwise). B+S service 03 9469 4754. Bought via CKC — call CKC first (they arranged Compliant Gas under warranty).",
  moffat: "Moffat: 24mo P&L for orders from Sep 2024. 1300 264 217.",
  fastfri: "Fastfri (Moffat brand): 24mo P&L for orders from Sep 2024. Moffat 1300 264 217.",
  apuro: "Apuro (Nisbets house brand): 24mo for units bought after Aug 2023. Nisbets 1300 225 960.",
  rapid: "Rapid (B+S Black range): 24mo P&L with activation (12 otherwise). B+S 03 9469 4754.",
  robotcoupe: "Robot Coupe AU: 24mo P&L (wear parts excluded). 02 9478 0300 — lodge claims via the robotcoupe.au web form.",
  lamarzocco: "La Marzocco AU: commercial term not published — call Brewtech (LM's official 24/7 aftersales) 1300 757 802 or LM AU 03 8413 4777 to confirm.",
  roband: "Roband AU: 12mo P&L back-to-base. 1800 268 848. Roband must authorise BEFORE any repair.",
  rondo: "RONDO (serviced by Moffat in AU): 24mo for orders from Sep 2024 — this 2018 unit is out of warranty. Moffat 1300 264 217.",
  mecnosud: "Mecnosud (via ICE): ~24mo on mixers, model-dependent. ICE 02 8372 0800.",
  dyson: "Dyson: 2-year guarantee (not 3) — and commercial/cafe use of a domestic V8 may be excluded. 1800 239 766.",
}

type Enrich = {
  mx: string
  months?: number
  provider?: string
  note: string
  codes?: EC[]
}

const ENRICH: Enrich[] = [
  // Burleigh
  { mx: "12364499", note: W.bs, codes: [] },
  { mx: "14216601", months: 18, provider: "Commercial Kitchen Company", note: W.bs },
  { mx: "16020641", months: 24, provider: "Nisbets", note: W.apuro },
  { mx: "10918379", note: W.rapid },
  { mx: "11226081", note: W.hobart, codes: HOBART_3DIGIT("hood") },
  { mx: "15105288", note: W.atosa },
  { mx: "12364497", note: W.atosa },
  { mx: "12513033", months: 36, provider: "Turbo Air Australia / CKC", note: W.turboair, codes: TURBOAIR_K },
  { mx: "12198267", months: 24, provider: "Robot Coupe", note: W.robotcoupe, codes: ROBOTCOUPE_CODES },
  { mx: "10855666", note: W.meiko + " (This 2002 unit is long out of warranty.)", codes: MEIKO_UPSTER },
  { mx: "10869644", note: W.unox, codes: UNOX_CODES },
  { mx: "10869248", note: W.unox, codes: UNOX_CODES },
  { mx: "10869929", note: W.skipio, codes: TURBOAIR_K },
  { mx: "10918419", note: W.hoshizaki, codes: HOSHI_B },
  { mx: "10918412", note: W.bromic },
  { mx: "10869942", note: W.lamarzocco },
  { mx: "10869242", note: W.unox, codes: UNOX_ELECTRIC_CODES },
  { mx: "10869251", note: W.unox, codes: UNOX_ELECTRIC_CODES },
  { mx: "11225929", note: W.rational, codes: RATIONAL_CODES },
  { mx: "13350850", months: 12, provider: "Commercial Kitchen Company", note: W.everlasting + " Warranty runs to ~Oct 2026 from the Oct 2025 delivery." },
  { mx: "10918374", note: W.turboair, codes: TURBOAIR_K },
  { mx: "16020636", months: 24, provider: "Nisbets", note: W.apuro },
  { mx: "10918459", note: W.rondo },
  { mx: "10918455", note: W.mecnosud },
  { mx: "10918448", note: W.turboair, codes: TURBOAIR_K },
  { mx: "18832956", months: 24, provider: "Commercial Kitchen Company / Moffat", note: W.moffat },
  { mx: "11272721", note: "Goldstein (Middleby AU): 24mo P&L from Mar 2024 supply (12 earlier). 1800 013 123." },
  { mx: "10918489", note: W.eswood, codes: ESWOOD_SW },
  { mx: "14054217", note: W.kirby },
  { mx: "11225933", note: W.turboair, codes: TURBOAIR_K },
  { mx: "11272673", note: W.thermaster },
  { mx: "13538084", months: 36, provider: "Commercial Kitchen Company / Turbo Air", note: W.turboair, codes: TURBOAIR_K },
  { mx: "16206403", months: 24, provider: "Robot Coupe", note: W.robotcoupe },
  { mx: "11272683", note: W.skipio, codes: TURBOAIR_K },
  { mx: "17390804", months: 12, provider: "Commercial Kitchen Company / ICE", note: W.anvil },
  { mx: "12364502", note: W.roband },
  { mx: "16739966", months: 24, provider: "Dyson / Big W", note: W.dyson },
  { mx: "15556242", months: 24, provider: "Commercial Kitchen Company / Moffat", note: W.scotsman, codes: SCOTSMAN_NOTE },
  { mx: "12412010", note: W.hoshizaki, codes: HOSHI_B },
  { mx: "15560022", months: 24, provider: "Commercial Kitchen Company / F.E.D.", note: W.thermaster },
  { mx: "10870489", note: W.atosa },
  { mx: "10771714", note: W.meiko, codes: MEIKO_UPSTER },
  { mx: "10854601", note: W.anvil },
  { mx: "13063780", note: W.robotcoupe, codes: ROBOTCOUPE_CODES },
  // Currumbin
  { mx: "15846846", months: 24, provider: "Commercial Kitchen Company / Moffat", note: W.fastfri },
  { mx: "12093837", note: W.turboair, codes: TURBOAIR_K },
  { mx: "11527110", months: 12, provider: "Commercial Kitchen Company / Hobart", note: W.hobart + " ⚠ 12mo from 31/07/25 — warranty ends ~31 JULY 2026. Any niggles: claim NOW.", codes: HOBART_ECOMAX },
  { mx: "11225443", note: W.roband },
  { mx: "11527098", note: W.williams },
  { mx: "11527097", note: W.williams },
  { mx: "11527095", note: W.hobart, codes: HOBART_3DIGIT("door") },
  { mx: "11527094", note: W.manitowoc, codes: MANITOWOC_CODES },
  { mx: "11527060", note: W.lamarzocco, codes: LM_LINEA_PB },
  { mx: "11527062", note: "Markibar: via the coffee supplier — ask your roaster who services it, or Brewtech 1300 757 802." },
  { mx: "11527065", note: W.skipio, codes: TURBOAIR_K },
  { mx: "11527076", note: W.hoshizaki, codes: HOSHI_C },
  { mx: "12093895", note: W.turboair, codes: TURBOAIR_K },
  { mx: "12093878", note: W.turboair, codes: TURBOAIR_K },
  { mx: "11224846", note: W.meiko, codes: MEIKO_UPSTER },
  { mx: "11527049", note: W.bonvue },
  { mx: "11527026", note: W.hoshizaki, codes: HOSHI_C },
  { mx: "11527023", note: W.skipio, codes: TURBOAIR_K },
  { mx: "NEW-REST-FRYER-R", provider: "Commercial Kitchen Company", note: "Confirm model from CKC invoice 116355/01 — if Fastfri/Moffat: 24mo P&L, Moffat 1300 264 217." },
]

async function main() {
  let updated = 0
  for (const e of ENRICH) {
    const asset = await db.maintenanceAsset.findFirst({ where: { mxId: e.mx } })
    if (!asset) { console.warn("missing mxId", e.mx); continue }
    // Idempotent append: segments are " · "-joined; only add what's missing.
    const segments = (asset.warrantyNotes ?? "").split(" · ").filter(Boolean)
    if (!segments.includes(e.note)) segments.push(e.note)
    const notes = segments.filter((v, i, a) => a.indexOf(v) === i).join(" · ")
    await db.maintenanceAsset.update({
      where: { id: asset.id },
      data: {
        warrantyNotes: notes,
        ...(e.months && asset.purchaseDate ? { warrantyMonths: e.months } : {}),
        ...(e.provider && !asset.warrantyProvider ? { warrantyProvider: e.provider } : {}),
        ...(e.codes !== undefined ? { errorCodes: e.codes as object[] } : {}),
      },
    })
    updated++
  }
  // Correct earlier assumptions where research says otherwise
  const dyson = await db.maintenanceAsset.findFirst({ where: { mxId: "16739966" } })
  if (dyson) await db.maintenanceAsset.update({ where: { id: dyson.id }, data: { warrantyMonths: 24 } })
  const griddle = await db.maintenanceAsset.findFirst({ where: { mxId: "14216601" } })
  if (griddle) await db.maintenanceAsset.update({ where: { id: griddle.id }, data: { warrantyMonths: 18 } })
  console.log(`Enriched ${updated} assets`)
  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
