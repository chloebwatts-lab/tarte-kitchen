/**
 * The "Where to order it" sheet, 14 Nov 2026: which supplier each of our
 * biggest buys comes from, per department. This is what the staff were
 * given (PDFs in docs/where-to-order/), what the managers' "Where to order
 * it" page shows, and what the Wednesday check holds the invoices to.
 *
 * Chloe, 23 Nov 2026: "make sure we are doing a weekly audit on a wednesday
 * email to tell me if the staff are ordering from the correct supplier we
 * have told them to order from (also make sure the app is updated)".
 *
 * Changing a supplier: edit the row here (and the order form line in admin),
 * then rebuild the PDFs. The house rules behind the choices are in the notes
 * and in the order-form notes (scripts/order-forms.json).
 *
 * `match` is read against the invoice line description from ANY supplier,
 * so it must name the item, not a brand (Bidfood "GHEE NEW ZEALAND PURE
 * SOUL 10lt" and Provedores "GHEE Bucket 10KG" are both ghee). `not` keeps
 * different items apart (frozen vs fresh berries, flakes vs meal).
 */

export type Dept = "Kitchen" | "Pastry" | "Coffee and bar" | "Front of house"

export const DEPTS: Dept[] = ["Kitchen", "Pastry", "Coffee and bar", "Front of house"]

export const SHEET_DATE = "14 Nov 2026"

export interface SheetRule {
  id: string
  dept: Dept
  section: string
  item: string
  /** Supplier name exactly as invoices carry it (Invoice.supplierName). */
  orderFrom: string
  product: string
  /** Pack price on the sheet, ex GST, gross. */
  price: number
  /** Price per kg / L / each on the sheet, the fallback when we have no recent invoice. */
  per?: { price: number; unit: "kg" | "l" | "ea" }
  /** The dearer supplier the sheet names, and by how much. */
  notFrom?: { supplier: string; dearer: string }
  /** Marked SWITCH on the sheet: staff were told to move this one. */
  switched?: boolean
  note?: string
  /** Invoice description that is this item, any supplier. */
  match: RegExp
  /** Description that makes it a different item. */
  not?: RegExp
  /** A second supplier the sheet allows, and when. */
  alsoOk?: { supplier: string; when: string }[]
  /**
   * At the right supplier, only this product (Philly only, Baking Tec only).
   * `generic` are the plain item words: a description that is nothing but
   * those ("FLOUR PLAIN GLUTEN FREE", a truncated line) names no brand, so
   * it cannot be called the wrong one.
   */
  only?: { match: RegExp; say: string; generic: RegExp }
  /** Shown on the sheet but checked by another row (the vanilla backup). */
  displayOnly?: boolean
  /** Compare a litre with a kilo (ghee: Bidfood 10 L bucket vs Provedores 10 kg). */
  litreIsKilo?: boolean
}

const R = (r: SheetRule) => r

export const SHEET: SheetRule[] = [
  // ─── Kitchen ──────────────────────────────────────────────────────
  R({ id: "sourdough-grain-sliced", dept: "Kitchen", section: "Bread and pastries", item: "Sourdough - Grain Sliced", orderFrom: "Pixel Bread", product: "Grain Sourdough 1400g - Sliced 20mm", price: 10.9, per: { price: 9.08, unit: "kg" }, match: /\bgrain\b.*sourdough|sourdough.*\bgrain\b/i }),
  R({ id: "sourdough-white", dept: "Kitchen", section: "Bread and pastries", item: "Sourdough - White", orderFrom: "Pixel Bread", product: "White Sourdough 1400g", price: 9.4, per: { price: 7.83, unit: "kg" }, match: /\bwhite\b.*sourdough|sourdough.*\bwhite\b/i, not: /slic|\bgrain\b/i }),
  R({ id: "sourdough-white-sliced", dept: "Kitchen", section: "Bread and pastries", item: "Sourdough - White (sliced)", orderFrom: "Pixel Bread", product: "White Sourdough 1400g - Sliced 20mm", price: 9.4, per: { price: 7.83, unit: "kg" }, match: /(\bwhite\b.*sourdough|sourdough.*\bwhite\b).*slic/i, not: /\bgrain\b/i }),
  R({ id: "cheese-burger-slices", dept: "Kitchen", section: "Dairy and eggs", item: "Cheese - Slices Burger Hi Melt", orderFrom: "Bidfood", product: "Cheese Slices Burger HI Melt 96'S Pure Dairy 2.27kg", price: 27.79, per: { price: 11.75, unit: "kg" }, match: /hi[\s-]?melt|cheese.*slices?.*burger|burger.*cheese.*slice/i }),
  R({ id: "cheese-red-leicester", dept: "Kitchen", section: "Dairy and eggs", item: "Cheese Red Leicester Slice 1.5", orderFrom: "Son Of A Bunn", product: "Cheese Red Leighster Slice 1.5", price: 28.9, per: { price: 19.28, unit: "kg" }, match: /red\s+lei(c|gh)e?ster/i }),
  R({ id: "cheese-tasty-shredded", dept: "Kitchen", section: "Dairy and eggs", item: "Cheese Tasty Shredded", orderFrom: "The Provedores", product: "Cheese Shredded Tasty 2kg (6)", price: 27.8, per: { price: 13.9, unit: "kg" }, match: /tasty.*shred|shred.*tasty/i }),
  R({ id: "cream-cheese", dept: "Kitchen", section: "Dairy and eggs", item: "Cream cheese (Philadelphia)", orderFrom: "Bidfood", product: "Philadelphia cream cheese 2kg block", price: 34.63, per: { price: 17.32, unit: "kg" }, note: "Philly only, never Express or another brand. Spreadable tubs ($21.88) for bagel service only.", match: /cream\s*cheese|cheese\s*cream|philadelphia|\bphilly\b/i, not: /frosting|icing|sauce|dip\b/i, only: { match: /philadelphia|\bphilly\b/i, say: "not Philly", generic: /\b(cheese|cream|block)\b/gi } }),
  R({ id: "creme-fraiche", dept: "Kitchen", section: "Dairy and eggs", item: "Creme fraiche", orderFrom: "The Provedores", product: "Creme Fraiche Tatua 500g", price: 11.2, per: { price: 22.4, unit: "kg" }, note: "Chefs' call (5 Oct): Provedores, even though Bidfood is about 1% cheaper after rebate.", match: /cr[eè]me\s*fra[iî]che/i }),
  R({ id: "ghee", dept: "Kitchen", section: "Dairy and eggs", item: "Ghee", orderFrom: "The Provedores", product: "Ghee Bucket 10KG", price: 149.5, per: { price: 14.95, unit: "kg" }, notFrom: { supplier: "Bidfood", dearer: "+4%" }, switched: true, litreIsKilo: true, match: /\bghee\b/i }),
  R({ id: "haloumi", dept: "Kitchen", section: "Dairy and eggs", item: "Haloumi Cheese", orderFrom: "Gold Coast Premium Foods", product: "Haloumi Cheese", price: 20, per: { price: 20, unit: "kg" }, match: /hal+oum?i/i }),
  R({ id: "buttermilk", dept: "Kitchen", section: "Dairy and eggs", item: "Milk Buttermilk", orderFrom: "Bidfood", product: "Milk Buttermilk Dairy Farm 600ml", price: 3.95, per: { price: 6.32, unit: "l" }, match: /buttermilk/i, not: /pancake|\bmix\b|powder/i }),
  R({ id: "butter-salted", dept: "Kitchen", section: "Dairy and eggs", item: "Salted butter", orderFrom: "Bidfood", product: "Butter Salted Yarde Farm 500gr", price: 8.78, per: { price: 16.86, unit: "kg" }, match: /\bbutter\b.*\bsalted\b|\bsalted\b.*\bbutter\b/i, not: /unsalted|peanut|sheet|tourage|caramel|popcorn/i }),
  R({ id: "butter-unsalted", dept: "Kitchen", section: "Dairy and eggs", item: "Unsalted butter", orderFrom: "Fermex", product: "Butter Unsalted NZ 25KG", price: 295, per: { price: 11.8, unit: "kg" }, match: /\bbutter\b.*\bunsalted\b|\bunsalted\b.*\bbutter\b/i, not: /sheet|tourage|peanut/i }),
  R({ id: "bacon-streaky", dept: "Kitchen", section: "Meat and seafood", item: "Bacon Streaky English D/Smoked", orderFrom: "Son Of A Bunn", product: "Bacon Streaky Eng D/Smoked", price: 15.5, per: { price: 15.5, unit: "kg" }, match: /bacon.*streaky|streaky.*bacon/i }),
  R({ id: "chicken-breast", dept: "Kitchen", section: "Meat and seafood", item: "Chicken breast", orderFrom: "Son Of A Bunn", product: "Chicken Breast", price: 11, per: { price: 11, unit: "kg" }, notFrom: { supplier: "Marrow Meats", dearer: "+14%" }, switched: true, match: /chicken.{0,15}breast/i, not: /schnitz|crumb|smoked|tenders\b|nugget|kiev/i }),
  R({ id: "crab-spanner", dept: "Kitchen", section: "Meat and seafood", item: "Crab Meat - Spanner", orderFrom: "Bidfood", product: "Crab Meat Spanner Ckd (A) Ocean Paci 500gr", price: 53.58, per: { price: 102.87, unit: "kg" }, match: /spanner/i, alsoOk: [{ supplier: "The Fish Factory", when: "fresh crab is Chloe's quality call (13 Nov 2026)" }] }),
  R({ id: "smoked-salmon", dept: "Kitchen", section: "Meat and seafood", item: "Smoked Salmon - Sliced Atlantic", orderFrom: "Bidfood", product: "Smoked Salmon Sliced Atlantic (I)", price: 35.54, per: { price: 34.12, unit: "kg" }, match: /smoked\s+salmon/i, not: /hot[\s-]*smoked/i }),
  R({ id: "avocado", dept: "Kitchen", section: "Fruit and veg", item: "Avocado", orderFrom: "Jensens", product: "Avocados", price: 51.2, match: /avocado/i, not: /\boil\b|frozen|pulp|guac|smash|iqf/i }),
  R({ id: "blueberry-fresh", dept: "Kitchen", section: "Fruit and veg", item: "Blueberry", orderFrom: "Jensens", product: "Berries - Blueberry", price: 53.85, match: /blueberr/i, not: /iqf|frozen|freeze|dried|muffin|jam|puree|syrup|speedy/i }),
  R({ id: "cucumber", dept: "Kitchen", section: "Fruit and veg", item: "Cucumber - Continental Lg", orderFrom: "Jensens", product: "Cucumbers - Continental", price: 24.85, notFrom: { supplier: "Coastal Fresh", dearer: "+11%" }, switched: true, match: /cucumber/i, not: /lebanese|\bqukes?\b|baby|pickle|sliced|slices/i }),
  R({ id: "micro-herbs", dept: "Kitchen", section: "Fruit and veg", item: "Micro Herbs Loose", orderFrom: "Pacific Wholesale", product: "Micro Herb Loose Pnt (75GRMS)", price: 10.69, per: { price: 142.53, unit: "kg" }, match: /micro\s*herbs?\b.*\b(loose|mix)/i }),
  R({ id: "raspberry-fresh", dept: "Kitchen", section: "Fruit and veg", item: "Raspberry", orderFrom: "Jensens", product: "Berries - Raspberry", price: 69.85, match: /raspberr/i, not: /iqf|frozen|freeze|dried|puree|jam|coulis|speedy|ground value|syrup|crumb|powder/i }),
  R({ id: "strawberry-large", dept: "Kitchen", section: "Fruit and veg", item: "Strawberry - Large", orderFrom: "Jensens", product: "Berries - Strawberry Extra Large", price: 69.85, match: /strawberr/i, not: /iqf|frozen|freeze|dried|puree|jam|speedy|syrup|powder|topping/i }),
  R({ id: "tomato-medley", dept: "Kitchen", section: "Fruit and veg", item: "Tomatoes - medley", orderFrom: "Jensens", product: "Tomatoes - Medley Cherry", price: 49.6, match: /medley/i }),
  R({ id: "watercress", dept: "Kitchen", section: "Fruit and veg", item: "Watercress", orderFrom: "Pacific Wholesale", product: "Herb - Watercress", price: 1.9, match: /watercress/i }),
  R({ id: "watermelon", dept: "Kitchen", section: "Fruit and veg", item: "Watermelon - Seedless", orderFrom: "Pacific Wholesale", product: "Watermelon Seedless KG", price: 1.9, per: { price: 1.9, unit: "kg" }, match: /watermelon/i, not: /juice|syrup/i }),
  R({ id: "mayo-kewpie", dept: "Kitchen", section: "Pantry", item: "Mayonnaise Kewpie", orderFrom: "Bidfood", product: "Mayonnaise Kewpie 1kg", price: 11.6, per: { price: 11.14, unit: "kg" }, notFrom: { supplier: "The Provedores", dearer: "+22%" }, switched: true, match: /kewpie/i }),
  R({ id: "olive-oil-ev", dept: "Kitchen", section: "Oils and vinegars", item: "Olive oil extra virgin", orderFrom: "Bidfood", product: "Oil Olive Extra Virgin Sandhurst 4lt", price: 50.79, per: { price: 12.19, unit: "l" }, match: /olive.*extra\s*virgin|extra\s*virgin.*olive|\bevoo\b/i, not: /truffle|spray|infused|chilli|garlic/i }),
  R({ id: "acai", dept: "Kitchen", section: "Frozen", item: "Acai Mix Scoopable - Amazonia", orderFrom: "Bidfood", product: "Acai Mix Scoopable Amazonia 10kg", price: 115.31, per: { price: 11.07, unit: "kg" }, match: /\bacai\b|a[cç]a[ií]/i, not: /powder|bowl\b/i }),
  R({ id: "chips-stealth", dept: "Kitchen", section: "Frozen", item: "Chips 6x6mm Stealth Skin On", orderFrom: "Bidfood", product: "Chips 6X6MM Stealth Skin ON", price: 45, per: { price: 4.32, unit: "kg" }, match: /stealth|chips?\s*6\s*x\s*6/i }),

  // ─── Pastry ───────────────────────────────────────────────────────
  R({ id: "croissant", dept: "Pastry", section: "Bread and pastries", item: "Croissant", orderFrom: "Eustralis", product: "Bridor Croissant Large 70g", price: 65.15, match: /croissant/i, not: /mini|\b30\s?g\b|\b25\s?g\b|almond|pain|chocolat|dough|ham|cheese/i }),
  R({ id: "croissant-mini", dept: "Pastry", section: "Bread and pastries", item: "Croissant - Mini (Bridor)", orderFrom: "Eustralis", product: "Bridor Access Croissant Mini 30g", price: 91.55, match: /croissant.*(mini|\b30\s?g\b)|mini.*croissant/i }),
  R({ id: "ricotta-basket", dept: "Pastry", section: "Dairy and eggs", item: "Cheese Ricotta basket", orderFrom: "Bidfood", product: "Cheese Ricotta Basket Fresco 1kg", price: 11.9, per: { price: 11.42, unit: "kg" }, match: /ricotta/i }),
  R({ id: "condensed-milk", dept: "Pastry", section: "Dairy and eggs", item: "Condensed milk", orderFrom: "The Provedores", product: "Milk Sweetened Condensed 1.2kg tub", price: 13.55, per: { price: 11.29, unit: "kg" }, note: "Dulce de leche only: Bidfood Nestle 395g cans ($4.16).", match: /condensed/i, alsoOk: [{ supplier: "Bidfood", when: "cans for dulce de leche; Chloe 14 Nov: we use both for different reasons" }] }),
  R({ id: "cream-thickened", dept: "Pastry", section: "Dairy and eggs", item: "Cream - thickened", orderFrom: "The Provedores", product: "Cream Thickened 5L (3)", price: 37.8, per: { price: 7.56, unit: "l" }, match: /\bcream\b.*thicken|thicken.*\bcream\b/i }),
  R({ id: "tourage-butter-sheets", dept: "Pastry", section: "Dairy and eggs", item: "Tourage French Butter Sheets", orderFrom: "Fermex", product: "Tourage (french) Butter Sheets 10x1KG", price: 159, per: { price: 15.9, unit: "kg" }, match: /tourage|butter\s*sheet/i }),
  R({ id: "sea-salt-flakes", dept: "Pastry", section: "Spices and salt", item: "Sea salt flakes", orderFrom: "Fermex", product: "Maldon Sea Salt Flakes 1.4kg", price: 33.1, per: { price: 23.64, unit: "kg" }, notFrom: { supplier: "Bidfood", dearer: "+10%" }, switched: true, note: "Chef-approved swap from Bidfood Cornish.", match: /maldon|\bsalt\b.*\bflake|\bflake.*\bsalt\b/i, not: /chilli|smoked|pepper/i }),
  R({ id: "bakers-flour", dept: "Pastry", section: "Baking", item: "Bakers Flour", orderFrom: "Fermex", product: "Bakers Flour Manildra 12.5KG Bag", price: 15.1, per: { price: 1.21, unit: "kg" }, match: /bakers?'?\s*flour|flour.*\bbakers?\b/i, not: /euro|type\s*55/i }),
  R({ id: "arrowroot-biscuits", dept: "Pastry", section: "Baking", item: "Biscuits Arrowroot", orderFrom: "Bidfood", product: "Biscuits Arrowroot Egg Dairy Gluten Free Leda 8x205gr", price: 19.44, per: { price: 11.38, unit: "kg" }, match: /arrowroot/i }),
  R({ id: "brown-sugar", dept: "Pastry", section: "Baking", item: "Brown sugar", orderFrom: "The Provedores", product: "Sugar Brown 15kg", price: 36.3, per: { price: 2.42, unit: "kg" }, match: /brown\s*sugar|sugar\s*brown/i, alsoOk: [{ supplier: "Fermex", when: "Fermex Bundaberg 15kg invoiced $32.55, about 10% under Provedores (23 Nov 2026)" }] }),
  R({ id: "caster-sugar", dept: "Pastry", section: "Baking", item: "Caster Sugar", orderFrom: "Bidfood", product: "Sugar Caster Bundaberg 25kg", price: 40.9, per: { price: 1.57, unit: "kg" }, notFrom: { supplier: "Fermex", dearer: "+15 to 27%" }, switched: true, match: /cast[eo]r/i, not: /oil|\bbeans?\b/i }),
  R({ id: "flour-euro-55", dept: "Pastry", section: "Baking", item: "Flour Euro Type 55", orderFrom: "Fermex", product: "Flour Euro Type 55 Laucke 12.5KG", price: 20.3, per: { price: 1.62, unit: "kg" }, match: /type\s*55|euro.*flour|flour.*euro/i }),
  R({ id: "fondant", dept: "Pastry", section: "Baking", item: "Fondant Soft White", orderFrom: "Fermex", product: "Fondant Soft White Bakels 15kg", price: 68.25, per: { price: 4.55, unit: "kg" }, notFrom: { supplier: "Bidfood", dearer: "+13%" }, switched: true, match: /fondant/i }),
  R({ id: "flour-gluten-free", dept: "Pastry", section: "Baking", item: "Gluten free flour", orderFrom: "Bidfood", product: "Flour Plain Gluten Free Baking Tec 10kg", price: 59.43, per: { price: 5.71, unit: "kg" }, note: "Jess: the only gluten free flour that works for pastry.", match: /gluten\s*free.*flour|flour.*gluten\s*free/i, not: /self\s*rais|cornflour|maize/i, only: { match: /baking\s*tec/i, say: "not Baking Tec (Jess: the only one that works)", generic: /\b(flour|plain|gluten|free)\b/gi } }),
  R({ id: "flour-plain", dept: "Pastry", section: "Baking", item: "Plain flour", orderFrom: "Fermex", product: "Flour Plain White Manildra 12.5KG", price: 14.75, match: /\bplain\b.*\bflour\b|\bflour\b.*\bplain\b/i, not: /gluten|self\s*rais|wholemeal|wholewheat/i }),
  R({ id: "flour-self-raising", dept: "Pastry", section: "Baking", item: "Self raising flour", orderFrom: "Bidfood", product: "Flour Self Raising Gem Of The 12.5kg", price: 17.47, match: /self\s*rais/i, not: /gluten/i }),
  R({ id: "vanilla-paste", dept: "Pastry", section: "Baking", item: "Vanilla bean paste", orderFrom: "Fermex", product: "Flavormaster Vanilla Bean Paste 1KG", price: 53.5, per: { price: 53.5, unit: "kg" }, notFrom: { supplier: "Bidfood", dearer: "+69%" }, switched: true, note: "If Fermex is out: Eustralis Prova 500g. Never Bidfood Queen.", match: /vanilla.*paste|paste.*vanilla/i, alsoOk: [{ supplier: "Eustralis", when: "Prova backup, only when Fermex is out" }] }),
  R({ id: "vanilla-paste-backup", dept: "Pastry", section: "Baking", item: "Vanilla paste, backup (Prova)", orderFrom: "Eustralis", product: "Prova Bourbon Vanilla Paste with Seeds 500g", price: 25.9, per: { price: 51.8, unit: "kg" }, note: "Only when Fermex is out of stock.", match: /prova/i, displayOnly: true }),
  R({ id: "almond-flakes", dept: "Pastry", section: "Nuts and chocolate", item: "Almond Flakes / Sliced Blanched", orderFrom: "Fermex", product: "Almond Flakes / Sliced Blanched 8KG", price: 145, per: { price: 18.12, unit: "kg" }, match: /almond.*(flake|slice)|(flake|slice).*almond/i }),
  R({ id: "almond-meal", dept: "Pastry", section: "Nuts and chocolate", item: "Almond meal", orderFrom: "Fermex", product: "Almond Blanched Meal 10KG", price: 145, per: { price: 14.5, unit: "kg" }, match: /almond.*meal|meal.*almond/i }),
  R({ id: "almonds-raw", dept: "Pastry", section: "Nuts and chocolate", item: "Almonds Raw Kernels", orderFrom: "Bidfood", product: "Almonds Raw Kernels Caterers C 1kg", price: 20.68, per: { price: 19.85, unit: "kg" }, match: /almonds?\b.*(kernel|raw|whole)|(kernel|raw|whole).*almonds?\b/i, not: /meal|flake|slice|milk|butter|paste|croissant|essence|extract/i }),
  R({ id: "white-choc-drops", dept: "Pastry", section: "Nuts and chocolate", item: "Chocolate Picolli White Drops 2.5kg", orderFrom: "The Provedores", product: "Chocolate Picolli White Drops 2.5kg (4)", price: 81, per: { price: 32.4, unit: "kg" }, match: /picolli|white.*choc.*drop|choc.*white.*drop/i }),
  R({ id: "irca-pistachio", dept: "Pastry", section: "Nuts and chocolate", item: "Irca Chococream Pistachio 15%", orderFrom: "Fermex", product: "Irca Chococream Pistachio 15% 5KG", price: 114.5, per: { price: 22.9, unit: "kg" }, match: /chococream/i }),
  R({ id: "nutella", dept: "Pastry", section: "Nuts and chocolate", item: "Nutella Chocolate Hazelnut Spread", orderFrom: "Bidfood", product: "Spread Chocolate Hazelnut Nutella 3kg", price: 46, per: { price: 14.72, unit: "kg" }, notFrom: { supplier: "Fermex", dearer: "+12%" }, match: /nutella/i }),
  R({ id: "pistachio-kernels", dept: "Pastry", section: "Nuts and chocolate", item: "Pistachio Kernels 3kg", orderFrom: "Fermex", product: "Pistachio Kernels 3KG", price: 165, per: { price: 55, unit: "kg" }, notFrom: { supplier: "Bidfood", dearer: "+36%" }, switched: true, match: /pistachio/i, not: /chococream|paste|cream|spread|praline|gelato|flavou?r|croissant|slivered|ground|meal/i }),

  // ─── Coffee and bar ───────────────────────────────────────────────
  R({ id: "milk-bun", dept: "Coffee and bar", section: "Bread and pastries", item: "Milk Bun (BreadTop)", orderFrom: "Pixel Bread", product: "Milk Bun", price: 1.3, match: /milk\s*bun/i }),
  R({ id: "franks-red-hot", dept: "Coffee and bar", section: "Pantry", item: "Sauce Red Hot Original Buffalo Wings", orderFrom: "Bidfood", product: "Sauce Red Hot Original Buffalo Wings Franks 3.78lt", price: 40, per: { price: 10.16, unit: "l" }, match: /red\s*hot|frank'?s/i }),
  R({ id: "almond-milk-barista", dept: "Coffee and bar", section: "Drinks", item: "Almond Milk - UHT Barista", orderFrom: "The Provedores", product: "Milk Tadc Barista Almond UHT 1L x 12", price: 34.75, per: { price: 2.9, unit: "l" }, match: /almond.*milk|milk.*almond/i, not: /croissant|cake|biscuit|meal/i }),
  R({ id: "lemon-juice", dept: "Coffee and bar", section: "Drinks", item: "Lemon juice premium Only Juice", orderFrom: "The Provedores", product: "Juice Lemon 2L (6)", price: 7.6, per: { price: 3.8, unit: "l" }, notFrom: { supplier: "Bidfood", dearer: "+18%" }, switched: true, match: /juice.*\blemon\b|\blemon\b.*juice/i, not: /\blime\b|orange|apple|pineapple|cordial|lemonade/i }),
  R({ id: "lime-juice", dept: "Coffee and bar", section: "Drinks", item: "Lime Juice", orderFrom: "The Provedores", product: "Juice Lime 2L (6)", price: 16.35, per: { price: 7.5, unit: "l" }, notFrom: { supplier: "Bidfood", dearer: "+23 to 32%" }, switched: true, match: /juice.*\blime\b|\blime\b.*juice/i, not: /\blemon\b|cordial|soda|mineral/i }),
  R({ id: "matcha", dept: "Coffee and bar", section: "Drinks", item: "Matcha Latte Powder", orderFrom: "The Provedores", product: "Matcha Premium Latte Powder 500gm (10)", price: 50, per: { price: 100, unit: "kg" }, match: /matcha/i }),
  R({ id: "milk-lactose-free", dept: "Coffee and bar", section: "Drinks", item: "Milk - Lactose Free", orderFrom: "EasyVend", product: "2L Lactose Free Full Cream Milk (dark Purple)", price: 4.99, per: { price: 2.5, unit: "l" }, match: /lactose\s*free/i, not: /cream\b(?!.*milk)|yogh?urt|cheese|butter/i }),
  R({ id: "mineral-water-sparkling", dept: "Coffee and bar", section: "Drinks", item: "Mineral Water Sparkling Glass", orderFrom: "Bidfood", product: "Mineral Water Sparkling Glass Santa Vittoria 24x500ml", price: 40.28, per: { price: 3.22, unit: "l" }, match: /mineral\s*water.*sparkling|sparkling.*mineral\s*water|santa\s*vitt/i }),
  R({ id: "oat-milk-barista", dept: "Coffee and bar", section: "Drinks", item: "Oat Milk - UHT Barista", orderFrom: "The Provedores", product: "Milk Tadc Barista Oat UHT 1L x 12", price: 33.35, per: { price: 2.78, unit: "l" }, match: /\boat\b.*(milk|barista)|(milk|barista).*\boat\b/i }),
  R({ id: "soy-milk", dept: "Coffee and bar", section: "Drinks", item: "Soy milk", orderFrom: "The Provedores", product: "Milk Soy Bonsoy 1L x 6", price: 19.8, per: { price: 3.3, unit: "l" }, match: /\bsoy\b.*milk|milk.*\bsoy\b|bonsoy/i }),
  R({ id: "spring-water", dept: "Coffee and bar", section: "Drinks", item: "Spring Water Square Bottle", orderFrom: "Bidfood", product: "Spring Water Square Bottle NU Pure 24x600ml", price: 14.71, per: { price: 0.98, unit: "l" }, match: /spring\s*water/i }),
  R({ id: "tequila-el-jimador", dept: "Coffee and bar", section: "Drinks", item: "Tequila - El Jimador Blanco", orderFrom: "Bidfood", product: "El Jimador Blanco Tequila 38%", price: 53.33, per: { price: 89.23, unit: "l" }, match: /jimador/i }),

  // ─── Front of house ───────────────────────────────────────────────
  R({ id: "tortilla", dept: "Front of house", section: "Bread and pastries", item: "Flour Tortilla", orderFrom: "Bidfood", product: "Tortillas Flour 10\" Caterers C 12's", price: 4.22, match: /tortilla/i, not: /chips?\b|corn/i }),
  R({ id: "banana-iqf", dept: "Front of house", section: "Frozen", item: "Banana", orderFrom: "Bidfood", product: "Banana Chunks IQF Entyce 4x2.5kg", price: 30.72, per: { price: 2.95, unit: "kg" }, match: /banana.*(chunk|iqf|frozen)|(iqf|frozen).*banana/i, not: /slic|bread|chip/i }),
  R({ id: "banana-sliced-iqf", dept: "Front of house", section: "Frozen", item: "Banana (sliced)", orderFrom: "Bidfood", product: "Banana Sliced IQF Speedy Berry 1kg", price: 5.8, per: { price: 5.57, unit: "kg" }, match: /banana.*slic.*(iqf|frozen)|banana.*(iqf|frozen).*slic/i, alsoOk: [{ supplier: "Fermex", when: "Fermex 10kg bulk bag is cheaper per kg when the freezer has room" }] }),
  R({ id: "blueberry-iqf", dept: "Front of house", section: "Frozen", item: "Blueberry (IQF)", orderFrom: "Bidfood", product: "Blueberries IQF Caterers C 1kg", price: 10.03, per: { price: 10.03, unit: "kg" }, match: /blueberr.*(iqf|frozen)|(iqf|frozen).*blueberr/i, not: /freeze|dried/i }),
  R({ id: "raspberry-iqf", dept: "Front of house", section: "Frozen", item: "Raspberry (IQF)", orderFrom: "Fermex", product: "Raspberry Frozen IQF 1kg", price: 13.6, per: { price: 13.6, unit: "kg" }, notFrom: { supplier: "Bidfood", dearer: "+25%" }, switched: true, match: /raspberr.*(iqf|frozen|speedy|ground value)|(iqf|frozen).*raspberr/i, not: /freeze|dried/i }),
  R({ id: "strawberry-iqf", dept: "Front of house", section: "Frozen", item: "Strawberry - XL (IQF)", orderFrom: "Fermex", product: "Strawberry IQF 1kg", price: 7.4, per: { price: 7.4, unit: "kg" }, notFrom: { supplier: "Bidfood", dearer: "+8%" }, switched: true, match: /strawberr.*(iqf|frozen)|(iqf|frozen).*strawberr/i, not: /freeze|dried/i }),
  R({ id: "clingwrap", dept: "Front of house", section: "Packaging and cleaning", item: "Clingwrap Dispenser", orderFrom: "Bidfood", product: "Clingwrap Dispenser Caterers C 600mx45cm", price: 24.3, match: /cling\s*(wrap|film)/i }),
  R({ id: "cup-clear-16oz", dept: "Front of house", section: "Packaging and cleaning", item: "Cup Clear 16oz 500ml Green Stripe BetaEco RPET", orderFrom: "The Provedores", product: "Cup Clear 16oz 500ml Green Stripe BetaEco RPET x 1000", price: 98.65, per: { price: 0.097, unit: "ea" }, notFrom: { supplier: "Bidfood", dearer: "+96%" }, switched: true, match: /\bcups?\b.*(16\s*oz|500\s*ml)|(16\s*oz|500\s*ml).*\bcups?\b/i, not: /paper|hot|lid|coffee|soup|container|bowl/i }),
  R({ id: "cup-paper-8oz", dept: "Front of house", section: "Packaging and cleaning", item: "Cups Paper 237ml 8oz Single Wall White", orderFrom: "Bidfood", product: "Cups Paper 237ML 8OZ 90MM Single Wall White Caterers C 50's", price: 4.49, match: /\bcups?\b.*(8\s*oz|237\s*ml)|(8\s*oz|237\s*ml).*\bcups?\b/i, not: /\blid|\b(12|16)\s*oz|plastic|clear|double|sauce|portion/i }),
  R({ id: "lids-dome", dept: "Front of house", section: "Packaging and cleaning", item: "Lids Dome With Hole To Suit 300/700ml Cups", orderFrom: "Bidfood", product: "Lids Dome With Hole To Suit 300/700ML Cups PLA Biopak 100's", price: 8.2, match: /\blids?\b.*\bdome\b|\bdome\b.*\blids?\b/i }),
  R({ id: "napkin-dinner", dept: "Front of house", section: "Packaging and cleaning", item: "Napkin Dinner White GT Fold", orderFrom: "The Provedores", product: "Napkin Dinner White GT Fold 2 Ply 100's (10)", price: 2.8, match: /napkin.*dinner|dinner.*napkin/i }),
  R({ id: "paper-towel-hand", dept: "Front of house", section: "Packaging and cleaning", item: "Paper Towel Hand Ultraslim Luxury 24x23cm", orderFrom: "Bidfood", product: "Paper Towel Hand Ultraslim Luxury 24X23CM Indulgence 2400's", price: 48.84, match: /towel.*ultra\s*slim.*(hand|luxury|24\s*x\s*23)|towel.*hand.*ultra\s*slim/i, not: /multifold|\bh4\b/i }),
  R({ id: "paper-towel-multifold", dept: "Front of house", section: "Packaging and cleaning", item: "Paper Towel Ultraslim Multifold Advanced H4", orderFrom: "Bidfood", product: "Paper Towel Ultraslim Multifold Advanced H4 Tork 20x150's", price: 60.84, match: /towel.*(multifold|\bh4\b)/i }),
  R({ id: "tray-1-kraft", dept: "Front of house", section: "Packaging and cleaning", item: "Tray #1 BetaBoard Kraft", orderFrom: "The Provedores", product: "Tray #1 BetaBoard Kraft x 500", price: 48.1, match: /\btray\s*#?\s*1\b/i }),
  R({ id: "tray-3-kraft", dept: "Front of house", section: "Packaging and cleaning", item: "Tray #3 BetaBoard Kraft", orderFrom: "The Provedores", product: "Tray #3 BetaBoard Kraft x 240", price: 27, match: /\btray\s*#?\s*3\b/i }),
]

/** Supplier names that are the same business on our invoices. */
export const SUPPLIER_ALIASES: Record<string, string> = {
  "Pixel Bakehouse": "Pixel Bread",
}

export const canonicalSupplier = (name: string): string => SUPPLIER_ALIASES[name] ?? name

/** The sheet row an invoice line is, or null. First match wins. */
export function ruleFor(description: string, rules: SheetRule[] = SHEET): SheetRule | null {
  for (const r of rules) {
    if (r.displayOnly) continue
    if (!r.match.test(description)) continue
    if (r.not && r.not.test(description)) continue
    return r
  }
  return null
}

/** What the managers' page needs, no regexes (plain data for the client). */
export interface SheetRow {
  id: string
  dept: Dept
  section: string
  item: string
  orderFrom: string
  product: string
  price: number
  per: SheetRule["per"] | null
  notFrom: SheetRule["notFrom"] | null
  switched: boolean
  note: string | null
}

export function sheetRows(rules: SheetRule[] = SHEET): SheetRow[] {
  return rules.map((r) => ({
    id: r.id,
    dept: r.dept,
    section: r.section,
    item: r.item,
    orderFrom: r.orderFrom,
    product: r.product,
    price: r.price,
    per: r.per ?? null,
    notFrom: r.notFrom ?? null,
    switched: !!r.switched,
    note: r.note ?? null,
  }))
}
