#!/usr/bin/env python3
"""First-pass allergen classifier for empty-allergen ingredients.
Outputs /tmp/allergen-proposals.json with proposed allergens + confidence.
FSANZ set tracked by the app: MILK EGG FISH SHELLFISH CRUSTACEAN MOLLUSC
TREE_NUT PEANUT WHEAT GLUTEN SOY SESAME LUPIN SULPHITE.
Confidence: 'high' = safe to infer from name; 'search' = branded/compound,
needs a label/web check before trusting."""
import json, re

d = json.load(open("/tmp/ingredients.json"))
empty = [x for x in d if not x["allergens"]]

def has(name, *subs):
    n = name.lower()
    return any(s in n for s in subs)

def hasw(name, *words):
    """Whole-word match (avoids butter->butternut, oat->goat, bun->bunch)."""
    n = name.lower()
    return any(re.search(r"\b" + re.escape(w) + r"\b", n) for w in words)

# --- branded / compound items that need a real label check (web search) ---
SEARCH = {
    # sauces / condiments / pastes
    "bbq sauce", "hp sauce", "franks hot sauce", "hangover sauce", "sambal oelek",
    "harrissa", "harissa", "tamarind paste", "ketjap manis (sweet soy)", "sriracha sauce",
    "gochujang paste", "tabasco", "worcestershire sauce", "shrimp paste", "liquid smoke (wrights)",
    "demi glaze basic brown gf (maggi)", "vegetable stock - real campbells", "sauce red hot original buffalo wings",
    "chimichurri - bought in", "guacamole", "hommus dip (fresh)", "tapenade", "miso mayo",
    "hellmans mayonnaise", "whole egg mayonnaise", "vincotto", "isomalt", "xantana",
    "ketjap manis", "mirin", "mirin cooking wine kikkoman", "old bay seasoning",
    "curry powder", "garam masala", "italian herb mix", "togarashi", "togorashi",
    "bagel seasoning", "muesli tarte", "pancake mix dry - bidfood", "pancake mix buttermilk",
    "milo", "malt milk powder", "nutella chocolate hazelnut spread",
    # branded chocolate / patisserie (lecithin/may-contain)
    "chocolate dark calypso compound nestle", "chocolate powder", "chocolate sorbet",
    "chocolate veliche belgian dark choc emotion", "cocoa powder, veliche", "veilche cocoa powder",
    "veliche chocolate batons", "chocolate patissier milk choc 34.6%",
    "chocolate buttons white nestle", "chocolate lindt piccoli white 2.5kg",
    "veliche belgian white choc", "fondant soft white", "irca chococream pistachio 15%",
    "hazelnut praline", "flan gel neutral fruit glaze", "fresh as raspberry - freeze dried",
    # processed / cured meats (may contain soy, gluten, sulphites, nuts)
    "mortadella", "guanciale", "jamon de serano", "suckling pig whole",
    # alcohol that may carry gluten/other
    "macadamia liqueur (mac by brookie's)", "mr black coffee liqueur",
    "st germain elderflower liqueur", "aperol", "pernod", "triple sec - vok",
    "demi glaze", "agave syrup senor maguey organic", "herradura agave nectar",
    "hot honey", "acai mix scoopable - amazonia", "acai blend - wastage allowance",
    "roti canai bread", "milk bun (breadtop)", "croissant - mini (bridor)",
    "butter puff roll - careme", "butter sheet, tourage french",
    "almond milk - uht barista", "oat milk - uht barista", "ice cream vanilla supreme",
    "creme fraiche provedores", "bread improver", "puffed grain", "toasted rice powder",
    "old bay", "nutritional yeast", "yeast - dry instant",
}

def classify(name):
    n = name.lower().strip()
    a = set()
    reasons = []

    # explicit gluten-free overrides -> no gluten/wheat
    gf = "gluten free" in n or "gluten-free" in n or n.startswith("gf ") or " gf" in n

    # dairy / milk
    dairy_free = "dairy free" in n or "dairy-free" in n
    if not dairy_free and has(n, "butter", "cream", "milk", "cheese", "mozzarella", "parmesan",
            "buttermilk", "creme fraiche", "ricotta", "yoghurt", "yogurt", "mascarpone", "ghee", "custard"):
        # almond milk / oat milk are NOT dairy milk
        if "almond milk" in n: a.add("TREE_NUT")
        elif "oat milk" in n: a.add("GLUTEN")
        elif "coconut cream" in n or "coconut milk" in n: pass
        elif "cocoa butter" in n: pass  # cocoa butter has no milk
        elif "butternut" in n: pass     # butternut pumpkin, not butter
        elif "butter bean" in n or "broad bean" in n: pass
        else:
            a.add("MILK"); reasons.append("dairy")
    if "malt milk" in n: a.update({"MILK", "GLUTEN"})

    # egg
    if hasw(n, "egg", "mayonnaise", "mayo", "aioli"):
        if "eggplant" not in n: a.add("EGG"); reasons.append("egg")

    # nuts
    if has(n, "almond", "hazelnut", "macadamia", "pistachio", "walnut", "pecan",
            "cashew", "praline", "frangipane", "marzipan", "nutella", "brazil nut", "pine nut"):
        a.add("TREE_NUT"); reasons.append("tree nut")
    if "peanut" in n: a.add("PEANUT")

    # wheat / gluten (breads, flour, pastry) — whole-word to avoid pita->pepitas, bun->bunch
    if (has(n, "flour", "bread", "bagel", "brioche", "sourdough", "croissant", "pastry",
            "tortilla", "crouton", "panko", "breadcrumb", "pancake", "couscous", "semolina",
            "danish", "muffin", "biscuit", "cookie", "cracker", "baguette", "focaccia", "pretzel")
        or hasw(n, "roti", "scotch loaf", "loaf", "bun", "pasta", "puff", "pita")):
        if gf or "gluten free" in n or "rice flour" in n:
            pass
        else:
            a.update({"WHEAT", "GLUTEN"}); reasons.append("wheat/gluten")
    if hasw(n, "rye"): a.add("GLUTEN")
    if hasw(n, "oat", "oats", "muesli") and "oat milk" not in n:
        a.add("GLUTEN"); reasons.append("oats (AU declares gluten)")
    if hasw(n, "barley", "malt"): a.add("GLUTEN")

    # soy
    if has(n, "soy", "soya", "edamame", "tofu", "miso", "tempeh", "ketjap", "tamari"):
        a.add("SOY"); reasons.append("soy")

    # sesame
    if has(n, "sesame", "tahini", "hummus", "hommus", "halva", "gomashio"):
        a.add("SESAME"); reasons.append("sesame")

    # fish / seafood
    if has(n, "anchov", "fish", "salmon", "tuna", "cod", "barramundi", "snapper", "sardine",
            "mackerel", "trout", "worcestershire"):
        a.add("FISH")
    if has(n, "prawn", "shrimp", "crab", "lobster", "crayfish"): a.add("CRUSTACEAN")
    if has(n, "mussel", "clam", "scallop", "squid", "calamari", "octopus") or \
            (hasw(n, "oyster") and "mushroom" not in n):  # oyster mushroom is a fungus
        a.add("MOLLUSC")

    # sulphites: dried fruit, wine/wine-vinegar
    if has(n, "dried", "dry apricot", "dry figs", "sultana", "saltana", "currant", "raisin",
            "cranberries dried", "apricot") and has(n, "apricot", "fig", "sultana", "saltana",
            "currant", "raisin", "cranberr", "dried"):
        if has(n, "apricot", "fig", "sultana", "saltana", "currant", "raisin", "cranberr"):
            a.add("SULPHITE"); reasons.append("dried fruit")
    if has(n, "wine", "balsamic") and "vinegar" in n: a.add("SULPHITE")

    # oils
    if "sesame oil" in n: a.add("SESAME")

    conf = "search" if n in SEARCH else "high"
    # if a high-confidence item still got NOTHING and isn't obviously plain produce,
    # leave it as 'high / none' (most produce/herbs/spices/spirits are genuinely none)
    return sorted(a), conf, ";".join(reasons)

out = []
for x in empty:
    allergens, conf, why = classify(x["name"])
    out.append({
        "id": x["id"], "name": x["name"], "category": x["category"], "uses": x["uses"],
        "proposed": allergens, "confidence": conf, "reason": why,
    })

json.dump(out, open("/tmp/allergen-proposals.json", "w"), indent=2)

# summary
hi = [o for o in out if o["confidence"] == "high"]
srch = [o for o in out if o["confidence"] == "search"]
hi_with = [o for o in hi if o["proposed"]]
hi_none = [o for o in hi if not o["proposed"]]
print(f"empty ingredients: {len(out)}")
print(f"  high-confidence WITH allergens : {len(hi_with)}")
print(f"  high-confidence NONE (produce/herbs/spirits/etc): {len(hi_none)}")
print(f"  NEEDS SEARCH (branded/compound) : {len(srch)}")
print()
print("=== NEEDS SEARCH list ===")
for o in sorted(srch, key=lambda z: z["name"]):
    print(f"  {o['name']}  [{o['category']}, used {o['uses']}x]  guess: {','.join(o['proposed']) or '?'}")
