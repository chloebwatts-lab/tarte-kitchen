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
  /** Marks gas/electrical/fire danger, red banner + "stop using it". */
  safety?: boolean
  quickFixes: string[]
}

const DISHWASHER_SYMPTOMS: SymptomDef[] = [
  {
    key: "not-draining",
    label: "Not draining / water sitting in bottom",
    quickFixes: [
      "Pull out and rinse the filters and the drain strainer, food scraps blocking the drain are the #1 cause.",
      "Check the drain hose behind the machine isn't kinked or squashed.",
      "Run the proper drain program, power-cycling doesn't drain it. Hobart hood: pull the standpipe, close the hood, hold the Drain key 3 seconds. Meiko: pull the standpipe, close the hood, press start. Eswood: press CYCLE until 'dr' shows, take out the strainer, unplug the overflow, press START.",
      "Eswood only: it can't drain with the overflow pipe still in, take it out first.",
    ],
  },
  {
    key: "leaking",
    label: "Leaking water",
    quickFixes: [
      "Check the door seal for trapped food or damage and wipe it clean.",
      "Make sure the machine is sitting level and baskets aren't blocking the door or hood from closing fully.",
      "If water is pooling near wiring: turn it OFF at the wall and stop using it.",
    ],
  },
  {
    key: "not-heating",
    label: "Not heating / not sanitising",
    quickFixes: [
      "Confirm the machine had time to heat up (up to 25 min from cold on a cold-water connection).",
      "Hobart hood machines: between racks leave the hood in the stand-by position (lowered, not fully closed) so the tank doesn't cool down.",
      "Check the temperature gauge during a cycle and note the reading for the tech. Eswood: hold CYCLE 5 seconds to show boiler (b) and tank (t) temps.",
      "A red fault bar or ErSF (Eswood) or info 120 (Meiko) means the heating safety has tripped. Stop and log it, don't keep restarting.",
    ],
  },
  {
    key: "not-filling",
    label: "Not filling with water / error code",
    quickFixes: [
      "Check the water tap to the machine is fully open.",
      "Check the hood or door is fully closed and the standpipe, strainer and tank cover screen are all fitted, it won't fill without them.",
      "Check the fill hose behind the machine isn't kinked. Eswood: also check the overflow is plugged into the drain outlet.",
      "Write down the exact error code (e.g. 202), it tells the tech which part before they arrive.",
      "Power off for 60 seconds, then retry.",
    ],
  },
  {
    key: "cycle-wont-stop",
    label: "Cycle won't stop / timer fault",
    quickFixes: [
      "A long cycle is usually the machine holding until the rinse water is hot enough (Hobart Thermostop, Meiko wash extension, Eswood holds until 85°C). Let it finish, especially on back-to-back racks, before calling it a fault.",
      "To stop a cycle: Eswood press START, Meiko press On/Off, Hobart press ON/Escape.",
      "Power the machine off at the wall for 60 seconds to reset the controller.",
      "If it happens again the same day, log it here and call the tech, repeated timer faults don't self-heal.",
    ],
  },
  {
    key: "dirty-results",
    label: "Dishes coming out dirty, greasy, spotty or cloudy",
    quickFixes: [
      "Take out the wash and rinse arms, rinse them under the tap and clear any blocked nozzles (a toothpick is fine), then refit and check they spin freely by hand.",
      "Pull and clean both strainers. If the fine strainer is limed up, soak it in vinegar and brush until the holes are clear.",
      "Check the detergent and rinse aid drums aren't empty and the pickup hoses are sitting in them.",
      "If the tank water is filthy, drain and refill. Use the longer program for heavy soil and pull racks as soon as the cycle ends so they dry.",
      "Don't pre-rinse with foaming hand detergent next to the machine, foam causes poor washing and faults. Glasses that are permanently rough and cloudy are glass corrosion, not a machine fault.",
    ],
  },
  {
    key: "wont-start",
    label: "Won't start / nothing happens",
    quickFixes: [
      "Check the hood or door is fully shut (Hobart shows 'door', Meiko info 121, Eswood 'door').",
      "If the light is flashing it's still filling or heating, wait until it's steady.",
      "Check the wall switch and water tap are on and the tank strainer is fitted, the GC glasswasher won't run without it.",
      "Meiko: start by pressing the start key or pushing the hood rod down.",
      "Check the breaker in the switchboard before calling anyone.",
    ],
  },
]

const COLD_SYMPTOMS: SymptomDef[] = [
  {
    key: "not-cooling",
    label: "Not cold enough / temp too high",
    quickFixes: [
      "Check the door closes fully and the seal isn't split or blocked.",
      "Clear vents inside, overfilling blocks airflow and warms the cabinet.",
      "Check the main power switch is actually on and the set temperature hasn't been knocked.",
      "Turbo Air and Skipio undercounters breathe through the FRONT grille: make sure nothing is leaning on or stacked in front of it. Other units need about 100 mm clear behind.",
      "Clean the condenser: on Turbo Air the front grille pulls off without tools and the brush is clipped inside the grille cover. Elsewhere, gently vacuum or brush dust off the coil behind the grille.",
      "Check the fans are spinning (front grille on Turbo Air/Skipio, back on most others). Note Turbo Air stops the inside fan whenever the door is open, so don't judge it with the door held open.",
      "If it's iced up inside, run a manual defrost (or empty it and let it defrost overnight) and log how often it happens.",
      "Note the room temperature if the kitchen is very hot, most units are only rated to about 38 to 43°C ambient.",
    ],
  },
  {
    key: "too-cold",
    label: "Too cold / freezing product",
    quickFixes: [
      "Check the set temperature hasn't been knocked, reset to the label on the door if there is one.",
      "Turbo Air: check the Meat / quick-chill function hasn't been switched on, it runs the compressor flat out for up to 2 hours and drops the cabinet to freezing.",
      "Dough retarder: check which program step it's in, a retard phase is meant to be cold.",
      "If turning the dial changes nothing, the thermostat/controller has likely failed (that was the fix both times on the milk fridge).",
    ],
  },
  {
    key: "leaking",
    label: "Leaking water",
    quickFixes: [
      "Check and clear the drain hole inside the cabinet (usually at the back wall), blocked drains overflow into the cabinet.",
      "Check ice buildup on the back panel; if heavily iced, empty it and let it defrost fully overnight.",
      "Most of our units self-evaporate condensate so there's no pan to empty. If water appears, note whether it was switched off or heavily iced and log it.",
    ],
  },
  {
    key: "not-turning-on",
    label: "Not turning on",
    quickFixes: [
      "Check the plug and the outlet, test the outlet with something else.",
      "Check the power cord along its length for damage, not just the plug.",
      "Check the switchboard for a tripped breaker before calling anyone.",
      "Try connecting it to a different power point/circuit, using an approved extension lead if required.",
    ],
  },
]

const ICE_SYMPTOMS: SymptomDef[] = [
  {
    key: "no-ice",
    label: "Not making ice / making less ice",
    quickFixes: [
      "Check the power is on at the wall and the water tap to the machine is open.",
      "Hoshizaki: check the control switch is on ICE (right). OFF is the middle. WASH (left) is for the service tech only, don't use it.",
      "Make sure the bin isn't full and the bin door or flap closes properly, the machine stops when the bin is full and restarts once ice is used. Manitowoc: press On/Off if the display says it's off.",
      "Clean the air filter (the front grille slides out on most units). Hoshizaki says at least twice a month: vacuum it, or wash in warm water and dry it before refitting.",
      "Give the condenser coil a brush/vacuum, heat rejection is the usual cause of slow ice.",
      "Check the room isn't too hot and nothing is stacked around the machine blocking airflow, output drops fast above 40°C.",
      "If the water filter is overdue, replace it, a blocked filter starves the machine.",
      "Scotsman: a steady BIN FULL light means use some ice. A slow-blinking red CLEAN light with the machine stopped means press CLEAN once to restart freezing.",
      "Spare parts for the Scotsman live in the spare parts box in the big shed at Burleigh.",
    ],
  },
  {
    key: "leaking",
    label: "Leaking water",
    quickFixes: [
      "Check the drain line isn't kinked or blocked.",
      "Check the storage bin drain hole is clear.",
      "Check the machine is sitting level, an out-of-level unit is a listed cause of leaks.",
      "If water pools in the bin and won't drain, turn the machine off, close the water tap and log it.",
    ],
  },
  {
    key: "poor-ice",
    label: "Ice cloudy, soft, small or tastes bad",
    quickFixes: [
      "Replace the water filter if it's overdue, poor filtration is the first cause of soft or cloudy ice.",
      "If it's been more than 6 months since a descale and sanitise clean, book one, a scaled-up machine makes bad ice.",
      "Sanitise the scoop and bin handle daily and the bin weekly, and store nothing but ice in the bin.",
      "Scotsman: a good cube has a 3 mm dimple and a 2 to 3 mm bridge between cubes. If it's way off, note it for the tech, don't adjust it yourself.",
    ],
  },
  {
    key: "stopped",
    label: "Machine stopped / light on or beeping",
    quickFixes: [
      "Read the lights: steady BIN FULL means use ice. Scotsman slow-blinking red CLEAN means press CLEAN once. Hoshizaki beeps and Manitowoc service lights are in the error code list on this page.",
      "Hoshizaki: check nobody started a cleaning cycle by accident (holding the clean button 3 seconds starts one, and all ice must be removed first).",
      "Power off at the wall for 60 seconds, restart, and log it if it stops again.",
    ],
  },
]

const GAS_SYMPTOMS: SymptomDef[] = [
  {
    key: "burner-wont-light",
    label: "Burner won't light / struggles to light",
    quickFixes: [
      "Check the gas is on at the isolation valve first.",
      "Hold the knob pushed in for 10 to 20 seconds after the flame catches (30 seconds on the B+S) before letting go, or the flame-failure valve drops it.",
      "If it doesn't catch, turn the knob OFF, wait 5 minutes, then try again.",
      "Clean the burner head, food and water after cleaning are the usual culprits. Caps, bases and trivets can be washed in hot soapy water once cool, never put burners in the dishwasher or wet them while hot, and don't poke at the jets.",
      "Griddle pilot: if the piezo clicks but nothing lights, log it. If there's no click, the igniter has failed.",
      "If only ONE burner is out the manual says get it serviced before use. It's the manager's call whether the other burners stay in use while it's logged.",
    ],
  },
  {
    key: "pilot-light",
    label: "Pilot light won't stay on",
    quickFixes: [
      "Relight per the sticker and keep the knob or pilot button held 10 to 20 seconds after it lights (B+S: 15 to 30 seconds) so the thermocouple warms up.",
      "If it drops out, turn OFF, wait 5 minutes and do the full relight once more.",
      "Drops out again straight away? The thermocouple has failed, that's a tech job, log it now.",
    ],
  },
  {
    key: "gas-smell",
    label: "Gas smell / bangs or explosion sounds",
    safety: true,
    quickFixes: [
      "STOP USING THE MACHINE NOW. Turn it off and turn the gas isolation valve off.",
      "Ventilate the area. Do not operate anything that sparks near it.",
      "Tell the manager immediately, this needs a licensed gas fitter before it is used again.",
    ],
  },
  {
    key: "uneven-heat",
    label: "Not heating properly / uneven heat",
    quickFixes: [
      "Check the flame colour, lazy yellow flames mean dirty burners; clean and retry.",
      "Empty the spill trays and scrape carbon off the griddle plate, carbonised grease between trivets and plates blocks the heat.",
      "Note WHICH section is slow (e.g. 'second fire line'), it tells the tech which valve/jet before they arrive.",
    ],
  },
  {
    key: "induction",
    label: "Induction hob not heating / beeping / error code",
    quickFixes: [
      "Constant beeping then switch-off means no pan or the wrong pan: use a magnetic steel or cast iron pan at least 12 cm across, centred on the glass. Glass, ceramic, copper, aluminium and round-bottom woks won't work.",
      "E0 = no or wrong pan. E1 = overheated: clear the vent slots, keep 20 cm from walls, let it cool. E2 = pan too hot or empty, take it off and let it cool. E3 = supply voltage, try another power point.",
      "If the buttons do nothing the panel may be locked: press and hold the lock key. The fan running after switch-off is normal while the glass is hot.",
      "Cracked glass: unplug it and stop using it.",
    ],
  },
]

const FRYER_SYMPTOMS: SymptomDef[] = [
  {
    key: "flame-out",
    label: "Flame keeps going out",
    quickFixes: [
      "Check the oil level first: between the LO and FILL marks when cold, up to the hot mark at temperature. Low oil is a fire risk, not just a nuisance.",
      "Make sure the gas is on at the isolation valve, then relight per the sticker: knob to PILOT, hold it in 10 to 15 seconds after the pilot lights.",
      "Wait about 30 seconds after the pilot is lit before turning the main burner on, the thermopile needs that long to open the main valve.",
      "If it drops out repeatedly, stop and log it, repeated flame-out is a thermocouple/gas-valve fault.",
    ],
  },
  {
    key: "gas-smell",
    label: "Gas smell / ignition bangs",
    safety: true,
    quickFixes: [
      "STOP USING THE FRYER NOW. Turn it off and close the gas valve.",
      "Ventilate and tell the manager immediately, licensed gas fitter required before reuse.",
    ],
  },
  {
    key: "one-side-dead",
    label: "One side/basket not working",
    quickFixes: [
      "Goldstein: each pan has its own pilot. Relight the dead pan's pilot (hold 10 seconds), wait 30 seconds, then turn its valve on.",
      "Confirm the working side is safe to keep using and log the dead side now.",
      "Note whether the pilot on the dead side lights at all, it halves the tech's diagnosis time.",
    ],
  },
  {
    key: "slow-recovery",
    label: "Slow to heat / temperature drifting",
    quickFixes: [
      "Check oil age and level first (LO to FILL marks cold), old or low oil reads exactly like a heating fault.",
      "Verify the thermostat knob setting hasn't been knocked. The main burner won't fire while the oil is already hotter than the setting.",
    ],
  },
  {
    key: "wont-light",
    label: "Won't light at all / seems dead",
    quickFixes: [
      "Our fryers are gas with no plug, so 'dead' means the pilot is out. Check the gas is on at the isolation valve.",
      "The fryer must be full of oil before lighting, with the drain valve closed and its locking slide down.",
      "Knob to PILOT, hold it in 10 to 15 seconds before and after lighting through the viewing hole (Goldstein: hold PILOT and press SPARKER for about 10 seconds). Wait 30 seconds before turning the burner on.",
      "If it fails, turn OFF, wait 5 minutes and repeat once from the top. Still nothing: stop and log it.",
    ],
  },
]

const OVEN_SYMPTOMS: SymptomDef[] = [
  {
    key: "error-code",
    label: "Error code on screen",
    quickFixes: [
      "Write down the EXACT code (photo it): Unox/Rational codes identify the part, and the error code list on this page says what each one means.",
      "Rational: read the 'Cooking possible: Yes/No' line under the Service message. If Yes, keep cooking and log the code. For a gas reset (Service 32.x) tap the green tick in the message, a power-cycle alone doesn't clear a gas lockout.",
      "Unox gas (AF23 / GAS UNIT LOCK): check the gas isolation tap is open, then press GAS REARM or START once to let it retry. Locks out again? Close the gas tap, stop using it and log it.",
      "Unox 'lack of water' warnings (WF16/27/36/37): check the water tap to the oven is fully open before logging it.",
      "Power off at the wall for 60 seconds and restart, clears transient Unox errors. Have the serial number from the rating plate ready when you ring the tech.",
    ],
  },
  {
    key: "not-heating",
    label: "Not heating / heating slowly",
    quickFixes: [
      "Make sure the door is fully closed, the oven stops heating and the fan whenever the door is open.",
      "Preheat before loading, set the manual preheat at least 30°C above the cooking temperature.",
      "Check the door seal, a torn combi seal dumps heat and steam.",
      "Run a clean cycle if overdue; heavy buildup slows heating and (per the tech) fat buildup near elements is a fire risk. Rational: run Cool Down first if the screen says the cabinet is too hot.",
    ],
  },
  {
    key: "power",
    label: "Power failure / dead screen",
    quickFixes: [
      "Check the breaker in the switchboard first.",
      "Check the wall isolator switch wasn't knocked off during cleaning.",
      "Try connecting it to a different power point/circuit, using an approved extension lead if required.",
      "Rational: if power dropped mid clean, do nothing, the iCare cycle resumes itself when power returns.",
    ],
  },
  {
    key: "noisy",
    label: "Fan noisy / motor struggling",
    quickFixes: [
      "Stop using it if it smells hot or electrical.",
      "Log it with a note on when the noise happens (startup vs during cook), likely capacitors, the CHEFTOP fix was $155 callout + ~$44/capacitor via Dishtec.",
    ],
  },
  {
    key: "cleaning-cycle",
    label: "Cleaning cycle won't run or stopped",
    quickFixes: [
      "Unox: pull the drawer under the oven and check the DET&Rinse level. Below MIN, screw in a new bottle (don't squeeze it) and swap it as soon as it's empty.",
      "Keep the door closed, the wash only runs with the door shut. Rational: you can only cancel in the first 30 seconds.",
      "Rational: if the screen says 'Cooking cabinet too hot', run Cool Down first, cleaning won't start above about 50°C. Goggles and gloves for the Active Green tabs.",
    ],
  },
  {
    key: "uneven-cooking",
    label: "Uneven cooking / browning",
    quickFixes: [
      "Spread food evenly on trays with no overlapping or overloading, and space trays evenly over the full cavity height.",
      "Preheat 30°C above target and check the fan speed setting, pulse speeds only run the fan while heating, which changes browning.",
      "Check the door seal and that the door closes fully, a leaking seal cools one side of the cavity.",
    ],
  },
  {
    key: "door-seal",
    label: "Door leaking steam / seal worn",
    quickFixes: [
      "Clean the door gasket daily with lukewarm water, mild detergent and a soft cloth.",
      "Leave the door slightly ajar when the oven is off to preserve the seal.",
      "If the seal is torn or hardened, log it, it's a cheap part but dumps heat and steam until replaced.",
    ],
  },
  {
    key: "prover",
    label: "Prover not holding humidity / heat",
    quickFixes: [
      "Check the water supply to the prover is connected and on, and the removable drain tray is seated and clean.",
      "Check the door closes fully and the seal is clean.",
      "For cleaning, set humidity 0% and 50°C.",
    ],
  },
]

const COFFEE_SYMPTOMS: SymptomDef[] = [
  {
    key: "pressure",
    label: "Pressure / extraction problems",
    quickFixes: [
      "Check the water tap under the bench is open and the main switch is on position 1/ON, that's what starts the autofill and pump.",
      "From cold, let the machine fully warm up before judging pressure. On first start, run water through each group for a couple of minutes to purge air.",
      "Read the brew pressure gauge while a shot runs, it should sit at about 9 bar. Note the actual number for the tech.",
      "Backflush the group and check the shower screens before anything else.",
      "Check the water filter age, most 'machine problems' are filter or grind problems.",
    ],
  },
  {
    key: "steam",
    label: "Steam wand weak or blocked",
    quickFixes: [
      "Purge the wand and clear the tip holes with the pin tool.",
      "If steam is weak on BOTH wands, check the steam boiler pressure gauge and that the machine has had time to heat. One blocked wand points to the tip, both weak points to the boiler.",
      "Wipe and purge the wand straight after every use so milk doesn't bake into the tip holes.",
    ],
  },
  {
    key: "grinder",
    label: "Grinder inconsistent / jammed",
    quickFixes: [
      "Empty the hopper and check for a stone or clump jam. If the motor runs but nothing comes out, check the hopper gate is open and the beans aren't bridged.",
      "Display on but the motor won't start? It has probably overheated, leave it to cool and the thermal protector resets itself.",
      "Purge a few doses after any adjustment before judging it.",
      "Grinding very slowly on the normal setting means the burrs are worn, log it, don't force the grind finer.",
      "Unplug before cleaning the hopper or burr chamber. Damp cloth only on the outside, no detergents, alcohol or solvents.",
    ],
  },
  {
    key: "no-heat",
    label: "Won't heat / no pressure on the gauge / won't fill",
    quickFixes: [
      "Check the main switch is on 1/ON and the water tap under the bench is open, the boiler must finish autofilling before the elements will heat.",
      "Allow the full warm-up time from cold before judging it.",
      "Power off for 60 seconds and on again once, then note what the gauges read. If it still won't fill or heat, log it.",
    ],
  },
]

const MIXER_SYMPTOMS: SymptomDef[] = [
  {
    key: "wont-start",
    label: "Won't turn on",
    quickFixes: [
      "Check bowl/guard interlocks are fully seated, most mixers refuse to start otherwise. Robot Coupe CL50: close the feed head, lock the handle, then press the green button. J100 juicer: lid on and safety arm locked down, basket hub notch lined up with the pin.",
      "If it stopped after hard use it has probably tripped on overload: let it cool completely, then press the reset button underneath the base (CL50 and J100). The MP550 stick blender resets itself after up to 30 minutes.",
      "RONDO sheeter: if the screen is blank, check the plug and that the main switch on the base is at I. Screen on but won't run: close both safety guards (the screen shows which is open), make sure it's in production mode, then press the black start button. It never restarts by itself after a guard trip.",
      "Try a different outlet before logging it (that ruled the outlet out on the stick blender).",
    ],
  },
  {
    key: "intermittent",
    label: "Cuts out / works inconsistently",
    quickFixes: [
      "Check the cable near the plug and handle for damage.",
      "Repeated thermal trips mean it's being overloaded: thin the mix or use smaller batches and let it cool fully between batches.",
      "RONDO: starting and stopping repeatedly means a guard is sitting just off its switch, reseat the guards fully. If it persists log it, staff must not adjust the limit switches.",
      "J100 juicer: if it starts vibrating, switch off and empty the basket, uneven pulp unbalances it. CL50: if it jams, press off straight away and clear the disc before restarting.",
      "If it's the Robot Coupe stick blender: it has a 2-year parts+labour warranty (to Aug 2027), warranty claim it, don't pay a repairer.",
    ],
  },
  {
    key: "mechanical",
    label: "Mechanical fault (belt, rollers, attachment)",
    quickFixes: [
      "Stop using it before it damages itself further and log exactly which part isn't moving.",
      "RONDO: belts running to one side or looping while the rollers turn is belt tension. Re-tension with the belt quick-release per the manual and watch the tracking for a few minutes.",
      "RONDO: a dirty drive roller causes slipping, clean it (damp brush and soapy water) before assuming a fault. Dough splitting or feeding under the scraper means the scraper is fitted wrongly or blunt, refit or replace it, never run without scrapers.",
      "RONDO: motor runs but rollers/belts don't move? Stop and call service, that's the ribbed drive belt.",
    ],
  },
]

const OTHER_SYMPTOMS: SymptomDef[] = [
  {
    key: "broken",
    label: "Something's wrong",
    quickFixes: [
      "Check it's plugged in and switched on, the outlet works with something else, and the thermostat or dial isn't at 0/OFF or loose.",
      "Take a photo, note exactly what it's doing (or not doing), and log it below.",
    ],
  },
  {
    key: "warmer-not-heating",
    label: "Pie warmer / press toaster not heating",
    quickFixes: [
      "Check it's plugged in and switched on, the outlet works, and the thermostat isn't at 0/OFF or loose.",
      "Pie warmer: the amber light cycling on and off is normal, green means power only. Pre-heat 20 minutes on max then turn back to about 85 to 100°C, and don't run it without the crumb tray.",
      "Press toaster: allow about 15 minutes pre-heat. The amber lights only glow while heating and go out at set temperature, that's not a fault. Wipe and oil the plates before cooking, keep the lid closed when idle, never set above 240°C on non-stick plates.",
    ],
  },
  {
    key: "vacuum",
    label: "Vacuum pulsing or no suction",
    quickFixes: [
      "Check the wand, cleaner head and bin inlet for blockages, and make sure the bin inlet flap moves freely.",
      "Wash both filters in warm water without detergent (tap the pre-filter out upside down first) and let them dry 24 to 48 hours before refitting.",
      "If it still won't start, charge it fully before assuming a fault.",
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
  const end = warrantyEndDate(asset)
  if (!end) return null
  const msLeft = end.getTime() - Date.now()
  if (msLeft <= 0) return 0
  return Math.ceil(msLeft / (30.44 * 24 * 3600 * 1000))
}

export function warrantyEndDate(asset: {
  purchaseDate: Date | null
  warrantyMonths: number | null
}): Date | null {
  if (!asset.purchaseDate || !asset.warrantyMonths) return null
  const start = new Date(asset.purchaseDate)
  const end = new Date(start)
  // setMonth overflows: 31 Aug + 6 months lands on 3 Mar. Clamp to the last
  // day of the target month so cover never shows as live after it lapsed.
  end.setDate(1)
  end.setMonth(start.getMonth() + asset.warrantyMonths)
  const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
  end.setDate(Math.min(start.getDate(), lastDay))
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
