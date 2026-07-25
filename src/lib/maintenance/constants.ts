/**
 * Maintenance module domain constants.
 *
 * Categories drive three things on the staff fix page:
 *  1. the symptom picker for that machine,
 *  2. the "try this first" quick fixes shown per symptom,
 *  3. which trade contact gets suggested (matched against
 *     MaintenanceContact.specialties).
 *
 * Quick fixes are deliberately conservative: nothing that involves opening
 * panels, touching wiring or gas. Anything beyond a filter clean or a reset
 * belongs to a trade.
 */

export const ASSET_CATEGORIES = [
  "dishwasher",
  "refrigeration",
  "freezer",
  "ice-machine",
  "gas-cooking",
  "fryer",
  "oven",
  "coffee",
  "mixer-blender",
  "other",
] as const

export type AssetCategory = (typeof ASSET_CATEGORIES)[number]

export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  dishwasher: "Dishwasher",
  refrigeration: "Fridge",
  freezer: "Freezer",
  "ice-machine": "Ice machine",
  "gas-cooking": "Gas cooktop / grill",
  fryer: "Fryer",
  oven: "Oven / combi",
  coffee: "Coffee",
  "mixer-blender": "Mixer / blender",
  other: "Other",
}

export interface SymptomDef {
  key: string
  label: string
  /** Marks gas/electrical/fire danger — red banner + "stop using it". */
  safety?: boolean
  quickFixes: string[]
}

const DISHWASHER_SYMPTOMS: SymptomDef[] = [
  {
    key: "not-draining",
    label: "Not draining / water sitting in bottom",
    quickFixes: [
      "Pull out and rinse the filters and the drain strainer — food scraps blocking the drain are the #1 cause.",
      "Check the drain hose behind the machine isn't kinked or squashed.",
      "Turn the machine off and on again to trigger a fresh drain cycle.",
    ],
  },
  {
    key: "leaking",
    label: "Leaking water",
    quickFixes: [
      "Check the door seal for trapped food or damage and wipe it clean.",
      "Make sure the machine is sitting level and baskets aren't blocking the door.",
      "If water is pooling near wiring: turn it OFF at the wall and stop using it.",
    ],
  },
  {
    key: "not-heating",
    label: "Not heating / not sanitising",
    quickFixes: [
      "Confirm the machine had time to heat up (15–20 min from cold).",
      "Check the temperature gauge during a cycle and note the reading for the tech.",
    ],
  },
  {
    key: "not-filling",
    label: "Not filling with water / error code",
    quickFixes: [
      "Check the water tap to the machine is fully open.",
      "Write down the exact error code (e.g. 202) — it tells the tech which part before they arrive.",
      "Power off for 60 seconds, then retry.",
    ],
  },
  {
    key: "cycle-wont-stop",
    label: "Cycle won't stop / timer fault",
    quickFixes: [
      "Power the machine off at the wall for 60 seconds to reset the controller.",
      "If it happens again the same day, log it here and call the tech — repeated timer faults don't self-heal.",
    ],
  },
]

const COLD_SYMPTOMS: SymptomDef[] = [
  {
    key: "not-cooling",
    label: "Not cold enough / temp too high",
    quickFixes: [
      "Check the door closes fully and the seal isn't split or blocked.",
      "Clear vents inside — overfilling blocks airflow and warms the cabinet.",
      "Look/listen at the back: are the fans spinning? Note if not — that's the usual failed part.",
      "Gently vacuum or brush dust off the condenser coils (front or back grille).",
    ],
  },
  {
    key: "too-cold",
    label: "Too cold / freezing product",
    quickFixes: [
      "Check the set temperature hasn't been knocked — reset to the label on the door if there is one.",
      "If turning the dial changes nothing, the thermostat/controller has likely failed (that was the fix both times on the milk fridge).",
    ],
  },
  {
    key: "leaking",
    label: "Leaking water",
    quickFixes: [
      "Check and clear the drain hole inside the cabinet (usually at the back wall) — blocked drains overflow into the cabinet.",
      "Check ice buildup on the back panel; if heavily iced, empty it and let it defrost fully overnight.",
    ],
  },
  {
    key: "not-turning-on",
    label: "Not turning on",
    quickFixes: [
      "Check the plug and the outlet — test the outlet with something else.",
      "Check the switchboard for a tripped breaker before calling anyone.",
    ],
  },
]

const ICE_SYMPTOMS: SymptomDef[] = [
  {
    key: "no-ice",
    label: "Not making ice / making less ice",
    quickFixes: [
      "Check the water tap to the machine is on.",
      "Clean the air filter (front grille slides out on most Hoshizaki/Scotsman units).",
      "Give the condenser coil a brush/vacuum — heat rejection is the usual cause of slow ice.",
      "Spare parts for the Scotsman live in the spare parts box in the big shed at Burleigh.",
    ],
  },
  {
    key: "leaking",
    label: "Leaking water",
    quickFixes: [
      "Check the drain line isn't kinked or blocked.",
      "Check the storage bin drain hole is clear.",
    ],
  },
]

const GAS_SYMPTOMS: SymptomDef[] = [
  {
    key: "burner-wont-light",
    label: "Burner won't light / struggles to light",
    quickFixes: [
      "Clean the burner head and igniter — food and water after cleaning are the usual culprits. Dry it fully and retry.",
      "Listen for the clicker: if it clicks but no flame, the jet may be blocked; if no click, the igniter has failed.",
      "If only ONE burner is out it's safe to keep using the others while you log it.",
    ],
  },
  {
    key: "pilot-light",
    label: "Pilot light won't stay on",
    quickFixes: [
      "Relight per the sticker on the machine. If it drops out again straight away, the thermocouple has failed — that's a tech job, log it now.",
    ],
  },
  {
    key: "gas-smell",
    label: "Gas smell / bangs or explosion sounds",
    safety: true,
    quickFixes: [
      "STOP USING THE MACHINE NOW. Turn it off and turn the gas isolation valve off.",
      "Ventilate the area. Do not operate anything that sparks near it.",
      "Tell the manager immediately — this needs a licensed gas fitter before it is used again.",
    ],
  },
  {
    key: "uneven-heat",
    label: "Not heating properly / uneven heat",
    quickFixes: [
      "Check the flame colour — lazy yellow flames mean dirty burners; clean and retry.",
      "Note WHICH section is slow (e.g. 'second fire line') — it tells the tech which valve/jet before they arrive.",
    ],
  },
]

const FRYER_SYMPTOMS: SymptomDef[] = [
  {
    key: "flame-out",
    label: "Flame keeps going out",
    quickFixes: [
      "Check the oil level — low oil trips the safety cutout on most fryers.",
      "Relight per the sticker. If it drops out repeatedly, stop and log it — repeated flame-out is a thermocouple/gas-valve fault.",
    ],
  },
  {
    key: "gas-smell",
    label: "Gas smell / ignition bangs",
    safety: true,
    quickFixes: [
      "STOP USING THE FRYER NOW. Turn it off and close the gas valve.",
      "Ventilate and tell the manager immediately — licensed gas fitter required before reuse.",
    ],
  },
  {
    key: "one-side-dead",
    label: "One side/basket not working",
    quickFixes: [
      "Confirm the working side is safe to keep using and log the dead side now.",
      "Note whether the pilot on the dead side lights at all — it halves the tech's diagnosis time.",
    ],
  },
  {
    key: "slow-recovery",
    label: "Slow to heat / temperature drifting",
    quickFixes: [
      "Check oil age and level first — old or low oil reads exactly like a heating fault.",
      "Verify the thermostat knob setting hasn't been knocked.",
    ],
  },
]

const OVEN_SYMPTOMS: SymptomDef[] = [
  {
    key: "error-code",
    label: "Error code on screen",
    quickFixes: [
      "Write down the EXACT code (photo it) — Unox/Rational codes identify the part.",
      "Power off at the wall for 60 seconds and restart — clears transient errors like 'Gas restart'.",
    ],
  },
  {
    key: "not-heating",
    label: "Not heating / heating slowly",
    quickFixes: [
      "Check the door seal — a torn combi seal dumps heat and steam.",
      "Run a clean cycle if overdue; heavy buildup slows heating and (per the tech) fat buildup near elements is a fire risk.",
    ],
  },
  {
    key: "power",
    label: "Power failure / dead screen",
    quickFixes: [
      "Check the breaker in the switchboard first.",
      "Check the wall isolator switch wasn't knocked off during cleaning.",
    ],
  },
  {
    key: "noisy",
    label: "Fan noisy / motor struggling",
    quickFixes: [
      "Stop using it if it smells hot or electrical.",
      "Log it with a note on when the noise happens (startup vs during cook) — likely capacitors, the CHEFTOP fix was $155 callout + ~$44/capacitor via Dishtec.",
    ],
  },
]

const COFFEE_SYMPTOMS: SymptomDef[] = [
  {
    key: "pressure",
    label: "Pressure / extraction problems",
    quickFixes: [
      "Backflush the group and check the shower screens before anything else.",
      "Check the water filter age — most 'machine problems' are filter or grind problems.",
    ],
  },
  {
    key: "steam",
    label: "Steam wand weak or blocked",
    quickFixes: [
      "Purge the wand and clear the tip holes with the pin tool.",
    ],
  },
  {
    key: "grinder",
    label: "Grinder inconsistent / jammed",
    quickFixes: [
      "Empty the hopper and check for a stone or clump jam.",
      "Purge a few doses after any adjustment before judging it.",
    ],
  },
]

const MIXER_SYMPTOMS: SymptomDef[] = [
  {
    key: "wont-start",
    label: "Won't turn on",
    quickFixes: [
      "Check bowl/guard interlocks are fully seated — most mixers refuse to start otherwise.",
      "Try a different outlet before logging it (that ruled the outlet out on the stick blender).",
    ],
  },
  {
    key: "intermittent",
    label: "Cuts out / works inconsistently",
    quickFixes: [
      "Check the cable near the plug and handle for damage.",
      "If it's the Robot Coupe stick blender: it has a 2-year parts+labour warranty (to Aug 2027) — warranty claim it, don't pay a repairer.",
    ],
  },
  {
    key: "mechanical",
    label: "Mechanical fault (belt, rollers, attachment)",
    quickFixes: [
      "Stop using it before it damages itself further and log exactly which part isn't moving.",
    ],
  },
]

const OTHER_SYMPTOMS: SymptomDef[] = [
  {
    key: "broken",
    label: "Something's wrong",
    quickFixes: [
      "Take a photo, note exactly what it's doing (or not doing), and log it below.",
    ],
  },
]

export const CATEGORY_SYMPTOMS: Record<AssetCategory, SymptomDef[]> = {
  dishwasher: DISHWASHER_SYMPTOMS,
  refrigeration: COLD_SYMPTOMS,
  freezer: COLD_SYMPTOMS,
  "ice-machine": ICE_SYMPTOMS,
  "gas-cooking": GAS_SYMPTOMS,
  fryer: FRYER_SYMPTOMS,
  oven: OVEN_SYMPTOMS,
  coffee: COFFEE_SYMPTOMS,
  "mixer-blender": MIXER_SYMPTOMS,
  other: OTHER_SYMPTOMS,
}

/**
 * Which contact specialties are relevant for a category, in order of
 * preference. "warranty" contacts are handled separately: if the asset is
 * still under warranty the warranty provider ALWAYS outranks a paid trade.
 */
export const CATEGORY_SPECIALTIES: Record<AssetCategory, string[]> = {
  dishwasher: ["dishwasher", "general"],
  refrigeration: ["refrigeration", "general"],
  freezer: ["refrigeration", "general"],
  "ice-machine": ["ice-machine", "refrigeration", "general"],
  "gas-cooking": ["gas", "general"],
  fryer: ["gas", "general"],
  oven: ["oven", "gas", "general"],
  coffee: ["coffee", "general"],
  "mixer-blender": ["general"],
  other: ["general"],
}

/** Months of warranty remaining, or null if we can't compute it. */
export function warrantyMonthsLeft(asset: {
  purchaseDate: Date | null
  warrantyMonths: number | null
}): number | null {
  if (!asset.purchaseDate || !asset.warrantyMonths) return null
  const end = new Date(asset.purchaseDate)
  end.setMonth(end.getMonth() + asset.warrantyMonths)
  const msLeft = end.getTime() - Date.now()
  if (msLeft <= 0) return 0
  return Math.ceil(msLeft / (30.44 * 24 * 3600 * 1000))
}

export function warrantyEndDate(asset: {
  purchaseDate: Date | null
  warrantyMonths: number | null
}): Date | null {
  if (!asset.purchaseDate || !asset.warrantyMonths) return null
  const end = new Date(asset.purchaseDate)
  end.setMonth(end.getMonth() + asset.warrantyMonths)
  return end
}

/**
 * Issue classification for repeat-fault detection. First matching class wins.
 * Deliberately coarse: the goal is "3rd leak on this machine", not taxonomy.
 */
export const ISSUE_CLASSES: Array<{ key: string; label: string; test: RegExp }> = [
  { key: "gas-safety", label: "gas safety", test: /gas smell|smell gas|explosion/i },
  { key: "leak", label: "leaking", test: /leak|water on floor|filling up with water|water holding|full of water/i },
  { key: "drain", label: "drainage", test: /drain/i },
  { key: "fill", label: "not filling", test: /not filling|error code 202|won'?t fill|no water/i },
  { key: "ignition", label: "ignition / burner", test: /flame|pilot|ignit|burner|not light|fire line/i },
  { key: "cooling", label: "temperature", test: /not cool|too cold|freez|not cold|temperature|degrees|regulat/i },
  { key: "heating", label: "heating", test: /heat|sanitis|thermostop/i },
  { key: "power", label: "power", test: /power|not turning on|turn on|won'?t start|dead screen|not working consistent/i },
  { key: "cycle", label: "cycle / timer", test: /cycle|timer/i },
  { key: "mechanical", label: "mechanical", test: /capacitor|motor|fan|noisy|noise|belt|roller|treadmill/i },
]

export function classifyIssue(text: string): { key: string; label: string } | null {
  for (const c of ISSUE_CLASSES) if (c.test.test(text)) return { key: c.key, label: c.label }
  return null
}
