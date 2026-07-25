// Seed the maintenance module with the full MaintainX migration:
// 70 assets, 34 work orders (with comment history), trade contacts.
// Idempotent: assets upsert on mxId/slug, issues on legacyRef, contacts on name.
//
// Run vs prod:  npx tsx --env-file=.env.local scripts/seed-maintenance.ts
// Source docs:  docs/maintenance/maintainx-*.md (scraped 2026-07-25)
import "dotenv/config"
import { PrismaClient, Venue } from "../src/generated/prisma"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

// @db.Date columns keep the UTC calendar date — seed as UTC midnight so the
// stored date matches the invoice date instead of slipping back a day.
const d = (s: string) => new Date(s + "T00:00:00Z")
const ts = (s: string) => new Date(s.replace(" ", "T") + ":00+10:00")

// ── Contacts ────────────────────────────────────────────────────────────────
const CONTACTS: Array<{
  name: string
  company?: string
  phone?: string
  email?: string
  specialties: string[]
  notes?: string
  sortOrder: number
}> = [
  {
    name: "Commercial Kitchen Company",
    company: "Commercial Kitchen Company (Molendinar)",
    phone: "1300 252 000",
    email: "accounts@commercialkitchencompany.com.au",
    specialties: ["warranty", "supplier"],
    notes:
      "Main equipment supplier — CALL FIRST for anything they supplied that's under warranty. Sales GC: Peter Watson 0419 757 247. Sales Bris: Eric Allinson 0414 612 876 (sold the Scotsman ice machine). They arrange warranty techs (Compliant Gas, Fridgitech etc).",
    sortOrder: 0,
  },
  {
    name: "Dishtec",
    specialties: ["dishwasher", "ice-machine", "gas", "general"],
    notes:
      "Fixed: gas burners (Mar 26), Goldstein fryer (Mar 26), CHEFTOP capacitors (Mar 26, $155 callout + ~$44/capacitor). Installed the Scotsman ice machine Feb 26. Phone TBC — ask Georgia.",
    sortOrder: 1,
  },
  {
    name: "Chris — Optimize",
    company: "Optimize",
    specialties: ["oven", "dishwasher", "gas", "general"],
    notes:
      "Unox combi specialist. Fixed Unox 'Gas restart' fault, Meiko error 202 (new part), condemned the old Cookrite grill (fat-buildup fire risk). Phone TBC — ask Georgia.",
    sortOrder: 2,
  },
  {
    name: "Josh — Cooltech",
    company: "Cooltech",
    specialties: ["refrigeration", "ice-machine"],
    notes:
      "Refrigeration. Fixed: milk fridge thermostat (Sep 25), walk-in cool room fan (Dec 25), Hoshizaki condenser (Nov 25). Phone TBC — ask Georgia.",
    sortOrder: 3,
  },
  {
    name: "Ben — Thermal Solutions",
    company: "Thermal Solutions",
    phone: "0401 739 106",
    specialties: ["refrigeration"],
    notes: "Did the Atosa counter-fridge warranty repair (Oct 25) — parts direct from Atosa.",
    sortOrder: 4,
  },
  {
    name: "Fridgitech",
    specialties: ["refrigeration"],
    notes: "Service tech for the Dough-Retarder warranty claim (May 26), arranged via CKC.",
    sortOrder: 5,
  },
  {
    name: "Compliant Gas",
    specialties: ["gas"],
    notes: "B+S warranty servicer (via CKC) — attended the griddle 3×, fitted new pilot light Mar 26.",
    sortOrder: 6,
  },
]

// ── Assets ──────────────────────────────────────────────────────────────────
type AssetSeed = {
  mxId: string
  name: string
  venue: Venue
  location: string
  category: string
  aliases?: string[]
  manufacturer?: string
  model?: string
  serial?: string
  year?: string
  purchaseDate?: string
  purchasePriceCents?: number
  supplier?: string
  warrantyMonths?: number
  warrantyProvider?: string
  warrantyNotes?: string
  notes?: string
  retired?: string // note; presence = RETIRED
}

const B = "BURLEIGH" as Venue
const C = "BEACH_HOUSE" as Venue

const ASSETS: AssetSeed[] = [
  // ─ Burleigh · Main Kitchen
  { mxId: "12364499", name: "4-burner gas cooktop — Main Kitchen", venue: B, location: "Main Kitchen", category: "gas-cooking", aliases: ["4x top gas burner", "stove"], manufacturer: "B+S", model: "KBT-SB4-NAT", serial: "KBT-2103" },
  { mxId: "14216601", name: "B+S 1200mm griddle — Main Kitchen", venue: B, location: "Main Kitchen", category: "gas-cooking", aliases: ["grill", "flat top", "hotplate"], manufacturer: "B+S", model: "KGRP-12", serial: "KGRP-1011", year: "2025", purchaseDate: "2025-12-09", supplier: "Commercial Kitchen Company", warrantyMonths: 24, warrantyProvider: "Commercial Kitchen Company", warrantyNotes: "Confirmed under warranty Feb–Mar 2026 (Compliant Gas attended 3×, new pilot light fitted ~13/03/26). Replaced the condemned Cookrite grill." },
  { mxId: "16020641", name: "Apuro induction hob — Main Kitchen", venue: B, location: "Main Kitchen", category: "gas-cooking", aliases: ["induction cooker"], manufacturer: "Apuro", model: "DF825-A", serial: "DF825AN01111024000469", purchaseDate: "2026-03-24", supplier: "Nisbets", warrantyProvider: "Nisbets", notes: "Twin of the pastry unit — serials differ, check the back before booking service (…469 = Main Kitchen)." },
  { mxId: "10918379", name: "Deep fryer — Main Kitchen", venue: B, location: "Main Kitchen", category: "fryer", aliases: ["rapid fryer"], manufacturer: "Rapid", model: "RF-400", serial: "RF-496B", year: "Oct 2024" },
  { mxId: "11226081", name: "Hobart dishwasher — Main Kitchen", venue: B, location: "Main Kitchen", category: "dishwasher", manufacturer: "Hobart", model: "AMX-90B", serial: "867229193", year: "2024" },
  { mxId: "15105288", name: "Atosa 2-door sandwich fridge — Main Kitchen", venue: B, location: "Main Kitchen", category: "refrigeration", aliases: ["sandwich bar fridge"], manufacturer: "Atosa", serial: "MSF8303AAU1CP14004" },
  { mxId: "12364497", name: "Atosa counter fridge (under pass) — Main Kitchen", venue: B, location: "Main Kitchen", category: "refrigeration", aliases: ["prep fridge under pass"], manufacturer: "Atosa", model: "MSF8303GR", serial: "MSF8303AAU1CNB7009", notes: "Sep 2025 warranty repair by Ben (Thermal Solutions) — fans/part from Atosa." },
  { mxId: "12513033", name: "Turbo Air open-top fridge — Main Kitchen", venue: B, location: "Main Kitchen", category: "refrigeration", manufacturer: "Turbo Air", model: "KHR15-2-N", serial: "H2KH152K4008", purchaseDate: "2025-09-08", supplier: "Commercial Kitchen Company", warrantyProvider: "Commercial Kitchen Company", warrantyNotes: "Was under warranty Feb 2026 (leak fixed via CKC)." },
  { mxId: "12198267", name: "Robot Coupe stick blender MP550", venue: B, location: "Main Kitchen", category: "mixer-blender", aliases: ["ultra stick blender", "bamix"], manufacturer: "Robot Coupe", model: "MP550 ULTRA", serial: "R7562350601", purchaseDate: "2025-08-22", warrantyMonths: 24, warrantyProvider: "Robot Coupe", warrantyNotes: "2yr parts + labour to 22/08/2027 — WARRANTY CLAIM, never pay a repairer." },
  // ─ Burleigh · Takeaway
  { mxId: "10855666", name: "Meiko dishwasher — Takeaway", venue: B, location: "Takeaway", category: "dishwasher", aliases: ["takeaway dishwasher"], manufacturer: "Meiko", model: "UPster H 500", serial: "SN20054895", year: "2002/04 (per plate)", notes: "5 leak work orders since 2025, two still open. If the plate year is right it's 24 years old — replace-vs-repair conversation due." },
  { mxId: "10869644", name: "Unox CHEFTOP oven — Takeaway", venue: B, location: "Takeaway", category: "oven", aliases: ["cheftop"], manufacturer: "UNOX", model: "XEVC-1011-GPRM", serial: "2022D0043854", notes: "Mar 2026: capacitors replaced by Dishtec ($155 callout + $44/capacitor). Outside warranty." },
  { mxId: "10869248", name: "Unox chef top (small) — Takeaway", venue: B, location: "Takeaway", category: "oven", manufacturer: "UNOX", model: "XEVC-0511-GPRM", serial: "2020D0025527", notes: "'Gas restart' fault fixed by Chris (Optimize) Feb 2026." },
  { mxId: "10869929", name: "Skipio freezer — Takeaway kitchen", venue: B, location: "Takeaway", category: "freezer", manufacturer: "Skipio", model: "SUF15-2" },
  { mxId: "10918419", name: "Hoshizaki ice maker — Takeaway", venue: B, location: "Takeaway", category: "ice-machine", manufacturer: "Hoshizaki", model: "KM-40B", serial: "L02562C" },
  { mxId: "10918412", name: "Bromic milk fridge — Takeaway", venue: B, location: "Takeaway", category: "refrigeration", aliases: ["back bar cooler TA"], manufacturer: "BROMIC", model: "BB0200GD-NR", serial: "200900390106800020B2A35422" },
  { mxId: "10869942", name: "La Marzocco coffee machine — Takeaway", venue: B, location: "Takeaway", category: "coffee", manufacturer: "La Marzocco", model: "Linea 2AV", serial: "ST009335" },
  // ─ Burleigh · Main pastry
  { mxId: "10869242", name: "Unox Bakertop main pastry oven + prover", venue: B, location: "Main pastry", category: "oven", aliases: ["main pastry oven", "bakertop"], manufacturer: "UNOX", model: "XEBC-10EU-EPLM.0 (Bakertop MIND.Maps PLUS, ELECTRIC)", serial: "2023E0047375", year: "2023", notes: "Chloe 25/07/26: electric, purchased 2023 — old MX record (gas 2019 SN 2019H0063160) was wrong. Check UNOX LONG.Life registration for extended parts warranty (UNOX AU 03 9876 0803)." },
  { mxId: "10869251", name: "Unox pastry prover (under Bakertop)", venue: B, location: "Main pastry", category: "oven", manufacturer: "UNOX", model: "XEBPC-08EU-B", serial: "2020A0006263", year: "2020" },
  { mxId: "11225929", name: "Rational iCombi Pro — Main pastry", venue: B, location: "Main pastry", category: "oven", aliases: ["rational", "combi"], manufacturer: "Rational", model: "iCombi Pro LM100DG", serial: "G11SJ24073150153", year: "2024" },
  { mxId: "13350850", name: "Everlasting dough retarder — Main pastry", venue: B, location: "Main pastry", category: "refrigeration", aliases: ["retarder", "pastry proofer"], manufacturer: "EVERLASTING", serial: "149557", purchaseDate: "2025-10-23", supplier: "Commercial Kitchen Company", warrantyProvider: "Commercial Kitchen Company", warrantyNotes: "Warranty claim May 2026 (leak): no fault found, cleaned out, report sent to manufacturer. If it leaks again call CKC straight away." },
  { mxId: "10918374", name: "Turbo Air freezer — Main pastry", venue: B, location: "Main pastry", category: "freezer", manufacturer: "Turbo Air", model: "KUF18-3-N" },
  { mxId: "10918484", name: "Plantation pastry mixer", venue: B, location: "Main pastry", category: "mixer-blender", aliases: ["big mixer"], model: "PMA1040", serial: "T0122040170", year: "2022/04" },
  { mxId: "16020636", name: "Apuro induction hob — Pastry", venue: B, location: "Main pastry", category: "gas-cooking", manufacturer: "Apuro", model: "DF825-A", serial: "DF825AN01111024000461", purchaseDate: "2026-03-24", supplier: "Nisbets", warrantyProvider: "Nisbets", notes: "Was filed under Currumbin in MaintainX — Chloe confirmed 25/07/26 it lives at Burleigh pastry. Serial …461." },
  // ─ Burleigh · Pastry prep room (takeaway)
  { mxId: "10918459", name: "RONDO lamination machine", venue: B, location: "Pastry prep room", category: "mixer-blender", aliases: ["laminator", "sheeter"], manufacturer: "RONDO", serial: "D8607478", year: "2018" },
  { mxId: "10918455", name: "Mecnosud mixer — cold pastry room", venue: B, location: "Pastry prep room", category: "mixer-blender", manufacturer: "MECNOSUD", model: "PK44Ad", serial: "2203431", year: "2022" },
  { mxId: "10918448", name: "Turbo Air freezer — Pastry prep room", venue: B, location: "Pastry prep room", category: "freezer", manufacturer: "Turbo Air", model: "KUF18-3-N" },
  // ─ Burleigh · Market Kitchen
  { mxId: "18832956", name: "Moffat Cobra 4-burner cooktop — Market Kitchen", venue: B, location: "Market Kitchen", category: "gas-cooking", aliases: ["market stove"], manufacturer: "Moffat", model: "Cobra C6D-NAT", serial: "2406295-Z1", purchaseDate: "2026-07-03", supplier: "Commercial Kitchen Company", warrantyProvider: "Commercial Kitchen Company", notes: "Replaced the failed Trueheat cooktop July 2026." },
  { mxId: "11272721", name: "Goldstein deep fryer — Market Kitchen", venue: B, location: "Market Kitchen", category: "fryer", aliases: ["market fryer"], manufacturer: "Goldstein", model: "VFGTL", serial: "108029N", notes: "Pilot light (Aug 25) and right-side (Mar 26, Dishtec) repairs done." },
  { mxId: "10918489", name: "Eswood Smartwash 500 — Market", venue: B, location: "Market Kitchen", category: "dishwasher", aliases: ["small market dishwasher"], manufacturer: "ESWOOD", model: "SMARTWASH 500", serial: "3224610", year: "2024" },
  { mxId: "14054217", name: "Walk-in cool room (Smart Cellar) — Market", venue: B, location: "Market Kitchen", category: "refrigeration", aliases: ["cool room", "walk in"], manufacturer: "KIRBY", notes: "New left-side fan fitted by Josh (Cooltech) Dec 2025." },
  { mxId: "11225933", name: "Turbo Air freezer — Market (frozen fruit)", venue: B, location: "Market Kitchen", category: "freezer", manufacturer: "Turbo Air", model: "KUF18-3-N" },
  // ─ Burleigh · Juice bar
  { mxId: "11272673", name: "Thermaster back bar cooler — Juice bar", venue: B, location: "Juice bar", category: "refrigeration", aliases: ["alcohol fridge"], manufacturer: "Thermaster", model: "LG-330HC", notes: "Two new fans fitted Sep 2025." },
  { mxId: "13538084", name: "Turbo Air 3-drawer prep chiller — Juice bar", venue: B, location: "Juice bar", category: "refrigeration", aliases: ["fruit fridge"], manufacturer: "Turbo Air", model: "KHR18-3-N", serial: "H2KH183K8007", purchaseDate: "2025-11-04", supplier: "Commercial Kitchen Company", warrantyMonths: 36, warrantyProvider: "Commercial Kitchen Company", warrantyNotes: "3-year warranty to Nov 2028 — call CKC, don't pay a trade." },
  { mxId: "16206403", name: "Robot Coupe J100 juicer — Juice bar", venue: B, location: "Juice bar", category: "mixer-blender", aliases: ["market juicer"], manufacturer: "Robot Coupe", model: "J100 ULTRA", serial: "S7132116502", purchaseDate: "2026-04-02", warrantyProvider: "Robot Coupe", warrantyNotes: "Robot Coupe standard is 2yr parts+labour — confirm on the paperwork." },
  { mxId: "11272683", name: "Skipio freezer — Juice bar prep", venue: B, location: "Juice bar", category: "freezer", manufacturer: "Skipio", model: "SUF18-3D-6", serial: "SF186DH2002" },
  // ─ Burleigh · Front of House
  { mxId: "17390804", name: "Anvil cake display fridge — FOH", venue: B, location: "Front of House", category: "refrigeration", aliases: ["cake showcase", "display fridge"], manufacturer: "Anvil", serial: "KL24276AX2409B1741", purchaseDate: "2026-06-04", supplier: "Commercial Kitchen Company", warrantyProvider: "Commercial Kitchen Company" },
  { mxId: "12364502", name: "Roband pie warmer — FOH", venue: B, location: "Front of House", category: "other", manufacturer: "Roband", model: "PM50L", serial: "1950" },
  { mxId: "16739966", name: "Dyson V8 vacuum — FOH", venue: B, location: "Front of House", category: "other", aliases: ["vacuum"], purchaseDate: "2026-04-26", supplier: "Big W", warrantyMonths: 36, warrantyProvider: "Dyson / Big W", warrantyNotes: "3yr warranty per listing — keep the Big W order confirmation." },
  // ─ Burleigh · site-wide / outside
  { mxId: "15556242", name: "Scotsman ice machine (main)", venue: B, location: "Outside / back", category: "ice-machine", aliases: ["big ice machine"], manufacturer: "Scotsman", model: "NB193 (175kg/24h half dice)", serial: "2504222700673", year: "2025", purchaseDate: "2026-02-25", supplier: "Commercial Kitchen Company", warrantyProvider: "Commercial Kitchen Company", notes: "Installed 25/02/26 by Dishtec. Bought via Eric @ CKC. SPARE PARTS in the spare parts box, big shed." },
  { mxId: "12412010", name: "Hoshizaki ice machine — coffee", venue: B, location: "Outside / back", category: "ice-machine", manufacturer: "Hoshizaki", model: "KM-55B", serial: "J00936H" },
  { mxId: "15560022", name: "Thermaster milk fridge — main barista", venue: B, location: "Front of House", category: "refrigeration", manufacturer: "Thermaster", model: "LG-208HC", serial: "208HC2025817016", purchaseDate: "2026-02-26", supplier: "Commercial Kitchen Company", warrantyProvider: "Commercial Kitchen Company" },
  { mxId: "10870489", name: "Atosa milk fridge — outside", venue: B, location: "Outside / back", category: "refrigeration", manufacturer: "Atosa", model: "P1000WB", notes: "New control panel + thermostat (Josh, Cooltech) Sep 2025." },
  { mxId: "10771714", name: "Meiko dishwasher — Burleigh cafe", venue: B, location: "Front of House", category: "dishwasher", manufacturer: "Meiko", notes: "First-ever work order (Jun 2025, $500). Possibly the same machine as another entry — verify on site." },
  { mxId: "10854601", name: "Anvil retail drinks fridge", venue: B, location: "Front of House", category: "refrigeration", manufacturer: "Anvil" },
  { mxId: "13063780", name: "Robot Coupe CL50", venue: B, location: "Main Kitchen", category: "mixer-blender", aliases: ["veg prep"], manufacturer: "Robot Coupe", model: "CL50", serial: "S4502120802", year: "2025" },
  { mxId: "15050194", name: "Ryobi cordless blower kit", venue: B, location: "Outside / back", category: "other" },
  // ─ Burleigh · retired
  { mxId: "12364498", name: "Cookrite 1200mm hotplate (REMOVED)", venue: B, location: "Main Kitchen", category: "gas-cooking", manufacturer: "Cookrite", model: "AT80G12G-F-NG", retired: "Removed 9/12/2025 — condemned by Chris (Optimize): unrepairable, fat-buildup fire risk. Replaced by B+S griddle." },
  { mxId: "11272727", name: "Trueheat gas cooktop — Market (REMOVED)", venue: B, location: "Market Kitchen", category: "gas-cooking", manufacturer: "True heat", model: "RCT6-4", serial: "2203TT6023", retired: "Removed July 2026 after repeated burner failures. Replaced by Moffat Cobra." },
  { mxId: "13950224", name: "Hoshizaki ice machine (REMOVED)", venue: B, location: "Outside / back", category: "ice-machine", retired: "Removed 25/02/2026, replaced by Scotsman NB193." },
  { mxId: "12695390", name: "Counter-top fridge (REMOVED)", venue: B, location: "Main Kitchen", category: "refrigeration", retired: "Removed Feb 2026." },
  { mxId: "12693576", name: "Inomak fridge (REMOVED)", venue: B, location: "Main Kitchen", category: "refrigeration", manufacturer: "INOMAK", model: "PNN29/AUS", serial: "1550937", retired: "Died Sep 2025, decommissioned when new Atosa larder fridge arrived." },
  { mxId: "10918401", name: "Atosa salad prep fridge (REMOVED)", venue: B, location: "Main Kitchen", category: "refrigeration", manufacturer: "Atosa", model: "MSF8303", serial: "MSF8303AAU100321050500Z90004", retired: "Removed Feb 2026." },
  // ─ Currumbin (Beach House) · Restaurant
  { mxId: "12093819", name: "Fastfri fryer (right side) — Restaurant (REPLACED)", venue: C, location: "Restaurant", category: "fryer", manufacturer: "Fastfri", model: "FF18", serial: "2307322", retired: "Replaced with a new unit ~Jul 2026 after gas ignition bangs + gas smell (WO #27). Came with the previous business." },
  { mxId: "NEW-REST-FRYER-R", name: "Restaurant fryer (right side) — NEW", venue: C, location: "Restaurant", category: "fryer", aliases: ["new fryer"], supplier: "Commercial Kitchen Company", warrantyProvider: "Commercial Kitchen Company", notes: "Replacement for the Fastfri that had gas faults. Model/serial/purchase date TBC — likely CKC invoice 116355/01 (6 Jul 2026); confirm and fill in." },
  { mxId: "15846846", name: "Fastfri fryer (left side) — Restaurant", venue: C, location: "Restaurant", category: "fryer", manufacturer: "Fastfri", model: "FF18", serial: "2414540", year: "2025", purchaseDate: "2025-09-01", purchasePriceCents: 240000, supplier: "Commercial Kitchen Company", warrantyProvider: "Commercial Kitchen Company", notes: "LPG unit." },
  { mxId: "12093837", name: "Turbo Air prep fridge — Restaurant", venue: C, location: "Restaurant", category: "refrigeration", manufacturer: "Turbo Air", model: "KUR18-3-N" },
  { mxId: "11527110", name: "Hobart dishwasher — Restaurant", venue: C, location: "Restaurant", category: "dishwasher", aliases: ["BH rest dishwasher"], manufacturer: "Hobart", model: "ECOMAX+ H615-90D", serial: "867431817", year: "2025", purchaseDate: "2025-07-31", purchasePriceCents: 675000, supplier: "Commercial Kitchen Company", warrantyProvider: "Commercial Kitchen Company", warrantyNotes: "$6,750 Jul 2025 — check CKC warranty term (likely 2yr → Jul 2027)." },
  { mxId: "11225443", name: "Roband press toaster — Restaurant", venue: C, location: "Restaurant", category: "other", manufacturer: "Roband", model: "GSA810S", serial: "16027", year: "2023" },
  { mxId: "10899825", name: "Walk-in freezer — Restaurant", venue: C, location: "Restaurant", category: "freezer", aliases: ["walk in"] },
  { mxId: "12093708", name: "Trueheat fryer — Restaurant (REMOVED)", venue: C, location: "Restaurant", category: "fryer", manufacturer: "True heat", model: "RCF4", serial: "2109TF4019", retired: "Retired Mar 2026 after repeated flame-out." },
  // ─ Currumbin · Restaurant Bar
  { mxId: "11527098", name: "Williams wine fridge (left) — Restaurant Bar", venue: C, location: "Restaurant Bar", category: "refrigeration", manufacturer: "Williams", model: "HBS2UGDCB-B0R", serial: "80615", notes: "Boronia Star 2-door." },
  { mxId: "11527097", name: "Williams wine fridge (right) — Restaurant Bar", venue: C, location: "Restaurant Bar", category: "refrigeration", manufacturer: "Williams", model: "HBS2UGDCB-B00", serial: "80381", notes: "Boronia Star, R134A. Was mis-named a second 'left side' in MaintainX — renamed right on import; verify position on site." },
  { mxId: "11527095", name: "Hobart dishwasher — Restaurant Bar", venue: C, location: "Restaurant Bar", category: "dishwasher", aliases: ["glass washer"], manufacturer: "Hobart", model: "GC-90B", serial: "866123442", year: "2022" },
  { mxId: "11527094", name: "Manitowoc ice machine — Restaurant Bar", venue: C, location: "Restaurant Bar", category: "ice-machine", manufacturer: "Manitowoc", model: "UY0310A-251Z", serial: "310399904" },
  // ─ Currumbin · Cafe
  { mxId: "11527060", name: "La Marzocco Linea PB 3AV — Cafe", venue: C, location: "Cafe", category: "coffee", aliases: ["coffee machine"], manufacturer: "La Marzocco", model: "Linea PB 3AV", year: "11/24" },
  { mxId: "11527062", name: "Markibar Izaga grinder — Cafe", venue: C, location: "Cafe", category: "coffee", aliases: ["grinder"], manufacturer: "Markibar", model: "Izaga 91G401120", serial: "G4010670", year: "2024" },
  { mxId: "11527065", name: "Skipio milk fridge — Cafe coffee station", venue: C, location: "Cafe", category: "refrigeration", manufacturer: "Skipio", model: "SUR15-2", year: "2024" },
  { mxId: "11527076", name: "Hoshizaki ice machine — Cafe (under coffee)", venue: C, location: "Cafe", category: "ice-machine", manufacturer: "Hoshizaki", model: "KM-60C-HC", serial: "M10384L" },
  { mxId: "12093895", name: "Turbo Air prep fridge — Cafe kitchen", venue: C, location: "Cafe", category: "refrigeration", manufacturer: "Turbo Air", model: "KUR18-2D-4-N" },
  { mxId: "12093878", name: "Turbo Air 4-drawer prep fridge — Cafe", venue: C, location: "Cafe", category: "refrigeration", manufacturer: "Turbo Air", model: "KUR18-2D-4-N" },
  { mxId: "11224846", name: "Meiko dishwasher — Cafe", venue: C, location: "Cafe", category: "dishwasher", manufacturer: "Meiko", model: "UPster H 500", serial: "SN20057873", year: "2022", notes: "Heating element fault Jul 2025; timer fault open since Mar 2026." },
  // ─ Currumbin · Cafe Juice Bar
  { mxId: "11527049", name: "Bonvue fridge — Cafe Juice Bar", venue: C, location: "Cafe Juice Bar", category: "refrigeration", manufacturer: "BONVUE", model: "TSB1555", serial: "23041237" },
  { mxId: "11527026", name: "Hoshizaki ice machine — Juice room", venue: C, location: "Cafe Juice Bar", category: "ice-machine", manufacturer: "Hoshizaki", model: "KM-60C-HC", serial: "M10383L" },
  { mxId: "11527023", name: "Skipio fruit freezer — Cafe Juice Bar", venue: C, location: "Cafe Juice Bar", category: "freezer", manufacturer: "Skipio", model: "SUF18-3D-6" },
]

// ── Issues (MaintainX work orders #1–#34) ───────────────────────────────────
type IssueSeed = {
  ref: string // "#34"
  mx?: string // asset mxId
  venue: Venue
  title: string
  description?: string
  open?: boolean
  safety?: boolean
  priority?: "LOW" | "MEDIUM" | "HIGH"
  reportedBy?: string
  created: string // "2026-05-20 11:50"
  fixedAt?: string
  fixedBy?: string
  fixSummary?: string
  costCents?: number
  warranty?: boolean
  contact?: string // contact name
  events?: Array<{ at: string; author: string; body: string }>
}

const ISSUES: IssueSeed[] = [
  { ref: "#1", mx: "10771714", venue: B, title: "Won't heat to temperature", reportedBy: "Chloe", created: "2025-06-11 12:41", fixedAt: "2025-06-25 10:53", fixedBy: "Chloe", costCents: 50000, fixSummary: "Serviced + deep clean & check procedure run. $500." },
  { ref: "#2", mx: "11224846", venue: C, title: "Heating element faulty", description: "Not heating properly, not filling with water properly, does not run properly", priority: "HIGH", reportedBy: "Thais Tavares da Silva", created: "2025-07-17 09:15", fixedAt: "2025-07-21 12:44", fixedBy: "Thais Tavares da Silva" },
  { ref: "#3", venue: B, title: "Robot Coupe hand blender stopped working", description: "Doesn't turn on; tested in different power outlets.", priority: "HIGH", reportedBy: "Jose Rincon", created: "2025-07-31 07:45", fixedAt: "2025-08-27 12:32", fixedBy: "Chloe" },
  { ref: "#4", mx: "11272721", venue: B, title: "New pilot light", description: "Pilot light in market fryer not staying on", priority: "HIGH", reportedBy: "Georgia Farquhar", created: "2025-08-19 08:14", fixedAt: "2025-09-29 17:33", fixedBy: "Georgia Farquhar", fixSummary: "New pilot light fitted." },
  { ref: "#5", mx: "11272727", venue: B, title: "Back right gas stove top not working", reportedBy: "Georgia Farquhar", priority: "MEDIUM", created: "2025-08-19 08:18", fixedAt: "2025-09-29 17:32", fixedBy: "Georgia Farquhar" },
  { ref: "#6", mx: "12093708", venue: C, title: "Flame turning off at all times on fryer", priority: "HIGH", reportedBy: "Thais Tavares da Silva", created: "2025-08-21 11:04", fixedAt: "2025-09-21 14:30", fixedBy: "Chloe" },
  { ref: "#7", mx: "10870489", venue: B, title: "Freezing milk — too cold", description: "Staying in minuses, not responding to the dial", priority: "HIGH", reportedBy: "Georgia Farquhar", created: "2025-08-31 13:10", fixedAt: "2025-09-10 08:41", fixedBy: "Georgia Farquhar", fixSummary: "New control panel, then new thermostat — Josh (Cooltech) 4/09/25.", contact: "Josh — Cooltech", events: [ { at: "2025-09-04 12:49", author: "Georgia Farquhar", body: "Fixed. New control panel" }, { at: "2025-09-10 08:43", author: "Georgia Farquhar", body: "New thermostat. Josh Cooltech. 4/09/25" } ] },
  { ref: "#8", mx: "10870489", venue: B, title: "Potential new controller", description: "Sitting 5° under set temperature, freezing milk", priority: "MEDIUM", reportedBy: "Georgia Farquhar", created: "2025-09-04 06:39", fixedAt: "2025-09-10 08:43", fixedBy: "Georgia Farquhar", fixSummary: "See #7 — controller + thermostat replaced." },
  { ref: "#9", mx: "11272673", venue: B, title: "Not cooling correctly", description: "Fans in the back not spinning", priority: "LOW", reportedBy: "Georgia Farquhar", created: "2025-09-04 06:42", fixedAt: "2025-09-23 14:48", fixedBy: "Georgia Farquhar", fixSummary: "Two new fans ordered 4/9, fitted mid-Sep.", events: [ { at: "2025-09-04 12:50", author: "Georgia Farquhar", body: "Waiting on two new fans ordered 4/9 for fix mid next week." } ] },
  { ref: "#10", mx: "12364497", venue: B, title: "Fridge not cooling, fans not working", priority: "MEDIUM", reportedBy: "Georgia Farquhar", created: "2025-09-17 07:05", fixedAt: "2025-10-21 07:46", fixedBy: "Georgia Farquhar", warranty: true, contact: "Ben — Thermal Solutions", fixSummary: "Warranty repair — Ben (Thermal Solutions, 0401 739 106) fitted part from Atosa.", events: [ { at: "2025-09-21 14:33", author: "Chloe", body: "Warranty lodged. Awaiting fix" }, { at: "2025-10-07 08:59", author: "Georgia Farquhar", body: "Ben from Thermal Solutions waiting on specific part to come from ATOSA to fix end of week. Ben 0401739106" } ] },
  { ref: "#11", mx: "12693576", venue: B, title: "Not turning on", priority: "MEDIUM", reportedBy: "Georgia Farquhar", created: "2025-09-17 07:06", fixedAt: "2025-09-29 17:33", fixedBy: "Georgia Farquhar", fixSummary: "Not repaired — decommissioned; larder fridge moved here when new Atosa arrived.", events: [ { at: "2025-09-21 14:32", author: "Chloe", body: "Larder fridge being moved here when new larder fridge (Atosa) arrives in a week" } ] },
  { ref: "#12", venue: B, title: "Juice bar fridge sitting on 20°", description: "Turbo air refrigerator, Juice bar (asset since replaced by the 3-drawer chiller)", priority: "MEDIUM", reportedBy: "Georgia Farquhar", created: "2025-09-18 10:06", fixedAt: "2025-11-04 09:39", fixedBy: "Georgia Farquhar", fixSummary: "Unit replaced — new Turbo Air 3-drawer chiller delivered 4/11/25." },
  { ref: "#13", mx: "10855666", venue: B, title: "Error code 202 — not filling with water", priority: "HIGH", reportedBy: "Georgia Farquhar", created: "2025-10-08 14:10", fixedAt: "2025-10-08 14:10", fixedBy: "Georgia Farquhar", contact: "Chris — Optimize", fixSummary: "Optimize came and put a new part." },
  { ref: "#14", mx: "10918459", venue: B, title: "One side not pushing out dough — needs service", description: "Treadmill not working. Wanted before busy period.", priority: "LOW", reportedBy: "Georgia Farquhar", created: "2025-10-09 09:13", fixedAt: "2025-11-25 14:36", fixedBy: "Georgia Farquhar" },
  { ref: "#15", mx: "10869248", venue: B, title: "'Gas restart' error — gas connection not working", priority: "LOW", reportedBy: "Georgia Farquhar", created: "2025-10-14 12:33", fixedAt: "2026-02-03 12:09", fixedBy: "Georgia Farquhar", contact: "Chris — Optimize", fixSummary: "Chris from Optimize called out." },
  { ref: "#16", mx: "12364498", venue: B, title: "Right side of grill continues to turn off", description: "Chris from Optimize came twice. Grill crooked, uneven, unrepairable, poor-quality brand — needs replacing. HEAVY fat buildup inside; if it touches the elements it can cause a kitchen fire (he has seen it happen).", priority: "HIGH", reportedBy: "Georgia Farquhar", created: "2025-11-06 00:00", fixedAt: "2026-02-23 00:00", fixedBy: "Georgia Farquhar", contact: "Chris — Optimize", fixSummary: "Condemned — replaced with new B+S griddle 9/12/2025." },
  { ref: "#17", mx: "13950224", venue: B, title: "Cooltech maintenance — condenser", description: "Restore thermal rejection to condensing coil. JOSH COOLTECH", reportedBy: "Georgia Farquhar", created: "2025-11-25 14:34", fixedAt: "2026-01-02 09:06", fixedBy: "Georgia Farquhar", contact: "Josh — Cooltech" },
  { ref: "#18", mx: "10855666", venue: B, title: "Fix leaks", description: "Leaking at bottom of appliance", priority: "LOW", reportedBy: "Georgia Farquhar", created: "2025-12-02 10:34", fixedAt: "2026-01-02 09:06", fixedBy: "Georgia Farquhar" },
  { ref: "#19", mx: "14054217", venue: B, title: "Cool room not cooling — new fan", description: "Left side fan was not moving.", priority: "LOW", reportedBy: "Georgia Farquhar", created: "2025-12-08 18:01", fixedAt: "2026-01-02 09:06", fixedBy: "Georgia Farquhar", contact: "Josh — Cooltech", fixSummary: "Josh from Cooltech fitted a new fan." },
  { ref: "#20", mx: "14216601", venue: B, title: "Second fire line on the grill not heating properly", description: "Taking 40+ minutes. Called CKC 2/02 — under warranty.", priority: "LOW", reportedBy: "Georgia Farquhar", created: "2026-02-02 12:30", fixedAt: "2026-03-24 08:54", fixedBy: "Georgia Farquhar", warranty: true, contact: "Compliant Gas", fixSummary: "Compliant Gas attended 3× under warranty; new pilot light fitted ~13/03/26.", events: [ { at: "2026-03-24 08:54", author: "Georgia Farquhar", body: "Had been seen to 3 times by Compliant Gas for under-warranty job. New pilot light fitted on second-from-left knob. Around 13/03/26" } ] },
  { ref: "#21", mx: "12513033", venue: B, title: "Leaking water", description: "Bottom of fridge full of water. Still under warranty — calling Commercial Kitchen.", reportedBy: "Georgia Farquhar", created: "2026-02-03 12:52", fixedAt: "2026-03-10 16:43", fixedBy: "Georgia Farquhar", warranty: true, fixSummary: "Fixed under warranty via CKC.", events: [ { at: "2026-02-23 08:02", author: "Georgia Farquhar", body: "Waiting on invoice for service" } ] },
  { ref: "#22", mx: "12364499", venue: B, title: "Back right burner not working", priority: "MEDIUM", reportedBy: "Georgia Farquhar", created: "2026-02-22 16:02", fixedAt: "2026-03-10 16:43", fixedBy: "Georgia Farquhar", contact: "Dishtec", fixSummary: "Dishtec fixed 3/3/26." },
  { ref: "#23", mx: "11272721", venue: B, title: "Right side of fryer not working", reportedBy: "Georgia Farquhar", created: "2026-02-23 07:44", fixedAt: "2026-03-10 16:43", fixedBy: "Georgia Farquhar", contact: "Dishtec", fixSummary: "Dishtec fixed 3/3/26." },
  { ref: "#24", mx: "10869644", venue: B, title: "Fan motor — new capacitors", description: "Motor working too hard. Outside warranty. Quote: $155 general check +GST; capacitors ~$44 ea (2–3), ~1h.", priority: "HIGH", reportedBy: "Georgia Farquhar", created: "2026-03-10 10:34", fixedAt: "2026-03-10 16:42", fixedBy: "Georgia Farquhar", contact: "Dishtec", fixSummary: "Dishtec replaced capacitors 10/03/2026." },
  { ref: "#25", mx: "12198267", venue: B, title: "Not working consistently (Jess)", description: "Not turning on consistently. NOTE: under Robot Coupe warranty to 22/08/2027 — warranty claim, do not pay a repairer.", open: true, reportedBy: "Shawna", created: "2026-03-14 13:49" },
  { ref: "#26", mx: "11224846", venue: C, title: "Faulty timer? Wash cycle doesn't stop", open: true, reportedBy: "Shawna", created: "2026-03-14 13:52" },
  { ref: "#27", mx: "12093819", venue: C, title: "Starter flame / gas igniting explosion sound and gas smell", open: false, safety: true, reportedBy: "Shawna", created: "2026-03-15 08:31", fixedAt: "2026-07-25 09:00", fixedBy: "Chloe", fixSummary: "Fryer replaced with a new unit (per Chloe 25/07/26). Old unit retired." },
  { ref: "#28", mx: "10855666", venue: B, title: "Leaking from bottom of appliance", reportedBy: "Georgia Farquhar", created: "2026-03-24 08:57", fixedAt: "2026-03-24 08:57", fixedBy: "Georgia Farquhar" },
  { ref: "#29", mx: "10855666", venue: B, title: "Leaking into bottom of appliance — water around wires", description: "Lots of water holding in the bottom around wires. Causing lots of water on floor.", open: true, reportedBy: "Georgia Farquhar", created: "2026-03-24 08:58" },
  { ref: "#30", mx: "10855666", venue: B, title: "Leaking internal — bottom filling with water where electrical is", description: "Large water leaks on flow throughout the day. Dishtec to see to it.", open: true, reportedBy: "Georgia Farquhar", created: "2026-03-26 14:21", contact: "Dishtec" },
  { ref: "#31", mx: "11272727", venue: B, title: "3 burners not working, 1 struggling", description: "Dishtec to see to.", reportedBy: "Georgia Farquhar", created: "2026-03-26 14:22", fixedAt: "2026-05-20 11:49", fixedBy: "Georgia Farquhar", fixSummary: "Unit ultimately removed July 2026, replaced by Moffat Cobra cooktop." },
  { ref: "#32", mx: "12364499", venue: B, title: "Bottom left gas burner struggles to get on", reportedBy: "Georgia Farquhar", created: "2026-04-21 11:43", fixedAt: "2026-05-20 11:49", fixedBy: "Georgia Farquhar" },
  { ref: "#33", mx: "13350850", venue: B, title: "Power failure", reportedBy: "Georgia Farquhar", created: "2026-04-27 12:00", fixedAt: "2026-04-28 15:56", fixedBy: "Georgia Farquhar" },
  { ref: "#34", mx: "13350850", venue: B, title: "Warranty claim — leaking water at back of appliance", reportedBy: "Georgia Farquhar", created: "2026-05-20 11:50", fixedAt: "2026-05-20 14:30", fixedBy: "Georgia Farquhar", warranty: true, contact: "Fridgitech", fixSummary: "CKC sent Fridgitech tech: no fault found, cleaned out, report sent to manufacturer. If it recurs, call CKC straight away.", events: [ { at: "2026-05-20 14:30", author: "Georgia Farquhar", body: "Commercial kitchen sent worker in. Couldn't find a fault, gave it a good clean out. They have sent report on to company and manufacturer. If it happens again call straight away." }, { at: "2026-05-20 15:24", author: "Georgia Farquhar", body: "Service guy from Fridgitech" } ] },
]

async function main() {
  console.log("Seeding contacts...")
  const contactByName = new Map<string, string>()
  for (const c of CONTACTS) {
    const existing = await db.maintenanceContact.findFirst({ where: { name: c.name } })
    const row = existing
      ? await db.maintenanceContact.update({ where: { id: existing.id }, data: c })
      : await db.maintenanceContact.create({ data: c })
    contactByName.set(c.name, row.id)
  }

  console.log("Seeding assets...")
  let bSeq = 0
  let cSeq = 0
  const assetByMx = new Map<string, string>()
  for (const a of ASSETS) {
    const seq = a.venue === "BURLEIGH" ? ++bSeq : ++cSeq
    const slug = `${a.venue === "BURLEIGH" ? "B" : "C"}${String(seq).padStart(2, "0")}`
    const data = {
      venue: a.venue,
      location: a.location,
      name: a.name,
      aliases: a.aliases ?? [],
      category: a.category,
      manufacturer: a.manufacturer ?? null,
      model: a.model ?? null,
      serial: a.serial ?? null,
      year: a.year ?? null,
      purchaseDate: a.purchaseDate ? d(a.purchaseDate) : null,
      purchasePriceCents: a.purchasePriceCents ?? null,
      supplier: a.supplier ?? null,
      warrantyMonths: a.warrantyMonths ?? null,
      warrantyProvider: a.warrantyProvider ?? null,
      warrantyNotes: a.warrantyNotes ?? null,
      notes: a.retired ? [a.retired, a.notes].filter(Boolean).join(" ") : a.notes ?? null,
      status: (a.retired ? "RETIRED" : "ACTIVE") as "RETIRED" | "ACTIVE",
      retiredAt: a.retired ? new Date() : null,
      mxId: a.mxId,
    }
    const existing = await db.maintenanceAsset.findFirst({ where: { mxId: a.mxId } })
    const row = existing
      ? await db.maintenanceAsset.update({ where: { id: existing.id }, data })
      : await db.maintenanceAsset.create({ data: { ...data, slug } })
    assetByMx.set(a.mxId, row.id)
  }

  console.log("Seeding issues...")
  for (const i of ISSUES) {
    const data = {
      assetId: i.mx ? assetByMx.get(i.mx) ?? null : null,
      venue: i.venue,
      title: i.title,
      description: i.description ?? null,
      status: (i.open ? "OPEN" : "FIXED") as "OPEN" | "FIXED",
      priority: i.priority ?? null,
      isSafety: i.safety ?? false,
      reportedBy: i.reportedBy ?? null,
      contactId: i.contact ? contactByName.get(i.contact) ?? null : null,
      fixSummary: i.fixSummary ?? null,
      fixedBy: i.fixedBy ?? null,
      fixedAt: i.fixedAt ? ts(i.fixedAt) : null,
      costCents: i.costCents ?? null,
      wasWarranty: i.warranty ?? false,
      legacyRef: i.ref,
    }
    const existing = await db.maintenanceIssue.findFirst({ where: { legacyRef: i.ref } })
    const row = existing
      ? await db.maintenanceIssue.update({ where: { id: existing.id }, data })
      : await db.maintenanceIssue.create({ data: { ...data, createdAt: ts(i.created) } })
    if (!existing && i.events) {
      for (const e of i.events) {
        await db.maintenanceIssueEvent.create({
          data: { issueId: row.id, body: e.body, author: e.author, createdAt: ts(e.at) },
        })
      }
    }
  }

  const counts = {
    contacts: await db.maintenanceContact.count(),
    assets: await db.maintenanceAsset.count(),
    issues: await db.maintenanceIssue.count(),
    events: await db.maintenanceIssueEvent.count(),
  }
  console.log("Done:", counts)
  await db.$disconnect()
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
