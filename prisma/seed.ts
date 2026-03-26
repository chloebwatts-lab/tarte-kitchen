// @ts-nocheck
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import "dotenv/config"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("🌱 Seeding Tarte Kitchen database...")

  // Clear existing data
  await prisma.dishComponent.deleteMany()
  await prisma.dish.deleteMany()
  await prisma.preparationItem.deleteMany()
  await prisma.preparation.deleteMany()
  await prisma.supplierPrice.deleteMany()
  await prisma.priceHistory.deleteMany()
  await prisma.ingredient.deleteMany()
  await prisma.supplier.deleteMany()

  // ============================================================
  // SUPPLIERS
  // ============================================================
  const bidfood = await prisma.supplier.create({
    data: { name: "Bidfood", notes: "Major supplier — dry goods, dairy, condiments" },
  })
  const jensens = await prisma.supplier.create({
    data: { name: "Jensens", notes: "Fresh produce, specialty items" },
  })
  const fino = await prisma.supplier.create({
    data: { name: "Fino", notes: "Cheese, deli items, oils" },
  })
  const marrow = await prisma.supplier.create({
    data: { name: "Marrow Meats", notes: "Meat supplier — bacon, beef, poultry" },
  })
  const pacific = await prisma.supplier.create({
    data: { name: "Pacific Wholesale", notes: "Eggs, seafood, dairy, bulk items" },
  })
  const inHouse = await prisma.supplier.create({
    data: { name: "In House", notes: "Made in-house" },
  })
  const other = await prisma.supplier.create({
    data: { name: "Other", notes: "Miscellaneous suppliers" },
  })

  console.log("✅ Suppliers created")

  // ============================================================
  // INGREDIENTS
  // ============================================================
  const baconStreaky = await prisma.ingredient.create({
    data: {
      name: "Bacon Streaky English D/Smoked",
      category: "MEAT",
      baseUnitType: "WEIGHT",
      supplierId: marrow.id,
      purchaseQuantity: 1,
      purchaseUnit: "kg",
      purchasePrice: 18.50,
      baseUnitsPerPurchase: 1000, // 1kg = 1000g
      wastePercentage: 0,
    },
  })

  const beefStriploin = await prisma.ingredient.create({
    data: {
      name: "Beef Prime Striploin Mb3+",
      category: "MEAT",
      baseUnitType: "WEIGHT",
      supplierId: marrow.id,
      purchaseQuantity: 1,
      purchaseUnit: "kg",
      purchasePrice: 33.00,
      baseUnitsPerPurchase: 1000,
      wastePercentage: 38, // significant trim waste
    },
  })

  const eggs = await prisma.ingredient.create({
    data: {
      name: "Eggs Large Free Range",
      category: "EGG",
      baseUnitType: "COUNT",
      supplierId: pacific.id,
      purchaseQuantity: 15,
      purchaseUnit: "dozen",
      purchasePrice: 86.00,
      baseUnitsPerPurchase: 180, // 15 dozen = 180 eggs
      wastePercentage: 0,
    },
  })

  const smokedSalmon = await prisma.ingredient.create({
    data: {
      name: "Smoked Salmon Sliced",
      category: "SEAFOOD",
      baseUnitType: "WEIGHT",
      supplierId: pacific.id,
      purchaseQuantity: 1,
      purchaseUnit: "kg",
      purchasePrice: 42.00,
      baseUnitsPerPurchase: 1000,
      wastePercentage: 0,
    },
  })

  const mayo = await prisma.ingredient.create({
    data: {
      name: "Hellmans Mayonnaise",
      category: "CONDIMENT",
      baseUnitType: "WEIGHT",
      supplierId: bidfood.id,
      purchaseQuantity: 2350,
      purchaseUnit: "g",
      purchasePrice: 12.00,
      baseUnitsPerPurchase: 2350,
      wastePercentage: 0,
    },
  })

  const sourdough = await prisma.ingredient.create({
    data: {
      name: "Sourdough White",
      category: "BREAD",
      baseUnitType: "COUNT",
      supplierId: inHouse.id,
      purchaseQuantity: 1,
      purchaseUnit: "ea",
      purchasePrice: 1.50,
      baseUnitsPerPurchase: 1,
      wastePercentage: 0,
    },
  })

  const bakersFlour = await prisma.ingredient.create({
    data: {
      name: "Bakers Flour",
      category: "FLOUR",
      baseUnitType: "WEIGHT",
      supplierId: bidfood.id,
      purchaseQuantity: 12.5,
      purchaseUnit: "kg",
      purchasePrice: 14.50,
      baseUnitsPerPurchase: 12500, // 12.5kg = 12500g
      wastePercentage: 0,
    },
  })

  const saltedButter = await prisma.ingredient.create({
    data: {
      name: "Salted Butter",
      category: "DAIRY",
      baseUnitType: "WEIGHT",
      supplierId: bidfood.id,
      purchaseQuantity: 1,
      purchaseUnit: "kg",
      purchasePrice: 12.80,
      baseUnitsPerPurchase: 1000,
      wastePercentage: 0,
    },
  })

  const creamThickened = await prisma.ingredient.create({
    data: {
      name: "Cream Thickened",
      category: "DAIRY",
      baseUnitType: "VOLUME",
      supplierId: pacific.id,
      purchaseQuantity: 1,
      purchaseUnit: "l",
      purchasePrice: 6.50,
      baseUnitsPerPurchase: 1000, // 1l = 1000ml
      wastePercentage: 0,
    },
  })

  const halloumi = await prisma.ingredient.create({
    data: {
      name: "Halloumi",
      category: "CHEESE",
      baseUnitType: "WEIGHT",
      supplierId: fino.id,
      purchaseQuantity: 1,
      purchaseUnit: "kg",
      purchasePrice: 22.40,
      baseUnitsPerPurchase: 1000,
      wastePercentage: 0,
    },
  })

  // Additional ingredients for preparations
  const eggYolks = await prisma.ingredient.create({
    data: {
      name: "Egg Yolks",
      category: "EGG",
      baseUnitType: "COUNT",
      supplierId: pacific.id,
      purchaseQuantity: 15,
      purchaseUnit: "dozen",
      purchasePrice: 86.00,
      baseUnitsPerPurchase: 180,
      wastePercentage: 0,
      notes: "Separated from whole eggs",
    },
  })

  const whiteMiso = await prisma.ingredient.create({
    data: {
      name: "White Miso Paste",
      category: "CONDIMENT",
      baseUnitType: "WEIGHT",
      supplierId: bidfood.id,
      purchaseQuantity: 1,
      purchaseUnit: "kg",
      purchasePrice: 18.00,
      baseUnitsPerPurchase: 1000,
      wastePercentage: 0,
    },
  })

  const lemon = await prisma.ingredient.create({
    data: {
      name: "Lemon",
      category: "FRUIT",
      baseUnitType: "COUNT",
      supplierId: jensens.id,
      purchaseQuantity: 1,
      purchaseUnit: "ea",
      purchasePrice: 0.80,
      baseUnitsPerPurchase: 1,
      wastePercentage: 0,
    },
  })

  const chilliFlakes = await prisma.ingredient.create({
    data: {
      name: "Chilli Flakes",
      category: "SPICE",
      baseUnitType: "WEIGHT",
      supplierId: bidfood.id,
      purchaseQuantity: 500,
      purchaseUnit: "g",
      purchasePrice: 8.50,
      baseUnitsPerPurchase: 500,
      wastePercentage: 0,
    },
  })

  const garlic = await prisma.ingredient.create({
    data: {
      name: "Garlic",
      category: "VEGETABLE",
      baseUnitType: "WEIGHT",
      supplierId: jensens.id,
      purchaseQuantity: 1,
      purchaseUnit: "kg",
      purchasePrice: 12.00,
      baseUnitsPerPurchase: 1000,
      wastePercentage: 10,
    },
  })

  const oil = await prisma.ingredient.create({
    data: {
      name: "Olive Oil FINO",
      category: "OIL",
      baseUnitType: "VOLUME",
      supplierId: fino.id,
      purchaseQuantity: 4,
      purchaseUnit: "l",
      purchasePrice: 28.00,
      baseUnitsPerPurchase: 4000,
      wastePercentage: 0,
    },
  })

  const sugar = await prisma.ingredient.create({
    data: {
      name: "Caster Sugar",
      category: "DRY_GOOD",
      baseUnitType: "WEIGHT",
      supplierId: bidfood.id,
      purchaseQuantity: 2,
      purchaseUnit: "kg",
      purchasePrice: 4.50,
      baseUnitsPerPurchase: 2000,
      wastePercentage: 0,
    },
  })

  const vinegarWhite = await prisma.ingredient.create({
    data: {
      name: "White Wine Vinegar",
      category: "VINEGAR",
      baseUnitType: "VOLUME",
      supplierId: bidfood.id,
      purchaseQuantity: 1,
      purchaseUnit: "l",
      purchasePrice: 5.00,
      baseUnitsPerPurchase: 1000,
      wastePercentage: 0,
    },
  })

  const tomato = await prisma.ingredient.create({
    data: {
      name: "Tomato Roma",
      category: "VEGETABLE",
      baseUnitType: "WEIGHT",
      supplierId: jensens.id,
      purchaseQuantity: 1,
      purchaseUnit: "kg",
      purchasePrice: 6.00,
      baseUnitsPerPurchase: 1000,
      wastePercentage: 5,
    },
  })

  const onion = await prisma.ingredient.create({
    data: {
      name: "Brown Onion",
      category: "VEGETABLE",
      baseUnitType: "WEIGHT",
      supplierId: jensens.id,
      purchaseQuantity: 1,
      purchaseUnit: "kg",
      purchasePrice: 3.50,
      baseUnitsPerPurchase: 1000,
      wastePercentage: 10,
    },
  })

  const coriander = await prisma.ingredient.create({
    data: {
      name: "Coriander Fresh",
      category: "HERB",
      baseUnitType: "WEIGHT",
      supplierId: jensens.id,
      purchaseQuantity: 100,
      purchaseUnit: "g",
      purchasePrice: 3.00,
      baseUnitsPerPurchase: 100,
      wastePercentage: 20,
    },
  })

  const lime = await prisma.ingredient.create({
    data: {
      name: "Lime",
      category: "FRUIT",
      baseUnitType: "COUNT",
      supplierId: jensens.id,
      purchaseQuantity: 1,
      purchaseUnit: "ea",
      purchasePrice: 0.60,
      baseUnitsPerPurchase: 1,
      wastePercentage: 0,
    },
  })

  const chilliFresh = await prisma.ingredient.create({
    data: {
      name: "Chilli Fresh Red",
      category: "VEGETABLE",
      baseUnitType: "WEIGHT",
      supplierId: jensens.id,
      purchaseQuantity: 1,
      purchaseUnit: "kg",
      purchasePrice: 18.00,
      baseUnitsPerPurchase: 1000,
      wastePercentage: 5,
    },
  })

  const wholemealFlour = await prisma.ingredient.create({
    data: {
      name: "Wholemeal Flour",
      category: "FLOUR",
      baseUnitType: "WEIGHT",
      supplierId: bidfood.id,
      purchaseQuantity: 12.5,
      purchaseUnit: "kg",
      purchasePrice: 16.00,
      baseUnitsPerPurchase: 12500,
      wastePercentage: 0,
    },
  })

  const yeast = await prisma.ingredient.create({
    data: {
      name: "Dried Yeast",
      category: "DRY_GOOD",
      baseUnitType: "WEIGHT",
      supplierId: bidfood.id,
      purchaseQuantity: 500,
      purchaseUnit: "g",
      purchasePrice: 7.50,
      baseUnitsPerPurchase: 500,
      wastePercentage: 0,
    },
  })

  const salt = await prisma.ingredient.create({
    data: {
      name: "Sea Salt",
      category: "SPICE",
      baseUnitType: "WEIGHT",
      supplierId: bidfood.id,
      purchaseQuantity: 1,
      purchaseUnit: "kg",
      purchasePrice: 3.00,
      baseUnitsPerPurchase: 1000,
      wastePercentage: 0,
    },
  })

  const microHerbs = await prisma.ingredient.create({
    data: {
      name: "Micro Herbs",
      category: "HERB",
      baseUnitType: "WEIGHT",
      supplierId: jensens.id,
      purchaseQuantity: 100,
      purchaseUnit: "g",
      purchasePrice: 12.00,
      baseUnitsPerPurchase: 100,
      wastePercentage: 0,
    },
  })

  const fries = await prisma.ingredient.create({
    data: {
      name: "Fries Frozen",
      category: "FROZEN",
      baseUnitType: "WEIGHT",
      supplierId: bidfood.id,
      purchaseQuantity: 10,
      purchaseUnit: "kg",
      purchasePrice: 22.00,
      baseUnitsPerPurchase: 10000,
      wastePercentage: 0,
    },
  })

  const lettuce = await prisma.ingredient.create({
    data: {
      name: "Lettuce Cos",
      category: "SALAD",
      baseUnitType: "WEIGHT",
      supplierId: jensens.id,
      purchaseQuantity: 1,
      purchaseUnit: "ea",
      purchasePrice: 3.50,
      baseUnitsPerPurchase: 400, // ~400g per head
      wastePercentage: 15,
    },
  })

  const breadSliced = await prisma.ingredient.create({
    data: {
      name: "Sourdough Bread Sliced",
      category: "BREAD",
      baseUnitType: "WEIGHT",
      supplierId: inHouse.id,
      purchaseQuantity: 1,
      purchaseUnit: "kg",
      purchasePrice: 6.00,
      baseUnitsPerPurchase: 1000,
      wastePercentage: 0,
    },
  })

  console.log("✅ Ingredients created")

  // ============================================================
  // PREPARATIONS
  // ============================================================

  // Miso Hollandaise
  const misoHollandaise = await prisma.preparation.create({
    data: {
      name: "Miso Hollandaise",
      category: "SAUCE",
      method: "1. Whisk egg yolks over a bain-marie until thick and pale\n2. Slowly add clarified butter while whisking continuously\n3. Add white miso paste and lemon juice\n4. Season and keep warm",
      yieldQuantity: 750,
      yieldUnit: "g",
      yieldWeightGrams: 750,
      batchCost: 0,
      costPerGram: 0,
      costPerServe: 0,
      items: {
        create: [
          { ingredientId: eggYolks.id, quantity: 8, unit: "ea", sortOrder: 0, lineCost: 0 },
          { ingredientId: saltedButter.id, quantity: 500, unit: "g", sortOrder: 1, lineCost: 0 },
          { ingredientId: whiteMiso.id, quantity: 30, unit: "g", sortOrder: 2, lineCost: 0 },
          { ingredientId: lemon.id, quantity: 2, unit: "ea", sortOrder: 3, lineCost: 0 },
        ],
      },
    },
  })

  // Crispy Chilli
  const crispyChilli = await prisma.preparation.create({
    data: {
      name: "Crispy Chilli",
      category: "SAUCE",
      method: "1. Toast chilli flakes and garlic in oil until crispy\n2. Add sugar and vinegar, cook until syrupy\n3. Cool and store",
      yieldQuantity: 500,
      yieldUnit: "g",
      yieldWeightGrams: 500,
      batchCost: 0,
      costPerGram: 0,
      costPerServe: 0,
      items: {
        create: [
          { ingredientId: chilliFlakes.id, quantity: 100, unit: "g", sortOrder: 0, lineCost: 0 },
          { ingredientId: garlic.id, quantity: 50, unit: "g", sortOrder: 1, lineCost: 0 },
          { ingredientId: oil.id, quantity: 200, unit: "ml", sortOrder: 2, lineCost: 0 },
          { ingredientId: sugar.id, quantity: 80, unit: "g", sortOrder: 3, lineCost: 0 },
          { ingredientId: vinegarWhite.id, quantity: 70, unit: "ml", sortOrder: 4, lineCost: 0 },
        ],
      },
    },
  })

  // Pico de Gallo
  const picoDeGallo = await prisma.preparation.create({
    data: {
      name: "Pico de Gallo",
      category: "SAUCE",
      method: "1. Dice tomato, onion, and chilli finely\n2. Rough chop coriander\n3. Combine with lime juice and salt\n4. Mix well and refrigerate",
      yieldQuantity: 780,
      yieldUnit: "g",
      yieldWeightGrams: 780,
      batchCost: 0,
      costPerGram: 0,
      costPerServe: 0,
      items: {
        create: [
          { ingredientId: tomato.id, quantity: 400, unit: "g", sortOrder: 0, lineCost: 0 },
          { ingredientId: onion.id, quantity: 150, unit: "g", sortOrder: 1, lineCost: 0 },
          { ingredientId: coriander.id, quantity: 30, unit: "g", sortOrder: 2, lineCost: 0 },
          { ingredientId: lime.id, quantity: 3, unit: "ea", sortOrder: 3, lineCost: 0 },
          { ingredientId: chilliFresh.id, quantity: 20, unit: "g", sortOrder: 4, lineCost: 0 },
          { ingredientId: salt.id, quantity: 5, unit: "g", sortOrder: 5, lineCost: 0 },
        ],
      },
    },
  })

  // Wholemeal Crumpets
  const crumpets = await prisma.preparation.create({
    data: {
      name: "Wholemeal Crumpets",
      category: "BREAD",
      method: "1. Mix flour, water, yeast, sugar, and salt\n2. Prove for 1 hour\n3. Cook in crumpet rings on griddle\n4. Cool on wire rack",
      yieldQuantity: 76,
      yieldUnit: "serves",
      yieldWeightGrams: 3800, // 76 serves × 50g each
      batchCost: 0,
      costPerGram: 0,
      costPerServe: 0,
      items: {
        create: [
          { ingredientId: wholemealFlour.id, quantity: 2000, unit: "g", sortOrder: 0, lineCost: 0 },
          { ingredientId: sugar.id, quantity: 40, unit: "g", sortOrder: 1, lineCost: 0 },
          { ingredientId: yeast.id, quantity: 20, unit: "g", sortOrder: 2, lineCost: 0 },
          { ingredientId: salt.id, quantity: 15, unit: "g", sortOrder: 3, lineCost: 0 },
        ],
      },
    },
  })

  // Miso Mayo (for BLT)
  const misoMayo = await prisma.preparation.create({
    data: {
      name: "Miso Mayo",
      category: "SAUCE",
      method: "1. Combine mayo and white miso paste\n2. Mix until smooth\n3. Refrigerate",
      yieldQuantity: 1000,
      yieldUnit: "g",
      yieldWeightGrams: 1000,
      batchCost: 0,
      costPerGram: 0,
      costPerServe: 0,
      items: {
        create: [
          { ingredientId: mayo.id, quantity: 900, unit: "g", sortOrder: 0, lineCost: 0 },
          { ingredientId: whiteMiso.id, quantity: 100, unit: "g", sortOrder: 1, lineCost: 0 },
        ],
      },
    },
  })

  // Bacon Jam (for BLT)
  const baconJam = await prisma.preparation.create({
    data: {
      name: "Bacon Jam",
      category: "PRESERVED",
      method: "1. Slow cook diced bacon with onion until caramelised\n2. Add vinegar and sugar\n3. Cook until jammy consistency\n4. Blend roughly and cool",
      yieldQuantity: 800,
      yieldUnit: "g",
      yieldWeightGrams: 800,
      batchCost: 0,
      costPerGram: 0,
      costPerServe: 0,
      items: {
        create: [
          { ingredientId: baconStreaky.id, quantity: 500, unit: "g", sortOrder: 0, lineCost: 0 },
          { ingredientId: onion.id, quantity: 200, unit: "g", sortOrder: 1, lineCost: 0 },
          { ingredientId: vinegarWhite.id, quantity: 50, unit: "ml", sortOrder: 2, lineCost: 0 },
          { ingredientId: sugar.id, quantity: 50, unit: "g", sortOrder: 3, lineCost: 0 },
        ],
      },
    },
  })

  // Entrecote Sauce (for Steak)
  const entrecoteSauce = await prisma.preparation.create({
    data: {
      name: "Entrecote Sauce",
      category: "SAUCE",
      method: "1. Reduce cream with butter and mustard\n2. Season with salt and pepper\n3. Keep warm",
      yieldQuantity: 600,
      yieldUnit: "g",
      yieldWeightGrams: 600,
      batchCost: 0,
      costPerGram: 0,
      costPerServe: 0,
      items: {
        create: [
          { ingredientId: creamThickened.id, quantity: 400, unit: "ml", sortOrder: 0, lineCost: 0 },
          { ingredientId: saltedButter.id, quantity: 100, unit: "g", sortOrder: 1, lineCost: 0 },
          { ingredientId: salt.id, quantity: 5, unit: "g", sortOrder: 2, lineCost: 0 },
        ],
      },
    },
  })

  // Chimichurri (for Steak)
  const chimichurri = await prisma.preparation.create({
    data: {
      name: "Chimichurri",
      category: "SAUCE",
      method: "1. Finely chop herbs, garlic, and chilli\n2. Combine with oil and vinegar\n3. Season and rest 30 mins before serving",
      yieldQuantity: 400,
      yieldUnit: "g",
      yieldWeightGrams: 400,
      batchCost: 0,
      costPerGram: 0,
      costPerServe: 0,
      items: {
        create: [
          { ingredientId: coriander.id, quantity: 50, unit: "g", sortOrder: 0, lineCost: 0 },
          { ingredientId: garlic.id, quantity: 20, unit: "g", sortOrder: 1, lineCost: 0 },
          { ingredientId: chilliFresh.id, quantity: 10, unit: "g", sortOrder: 2, lineCost: 0 },
          { ingredientId: oil.id, quantity: 200, unit: "ml", sortOrder: 3, lineCost: 0 },
          { ingredientId: vinegarWhite.id, quantity: 50, unit: "ml", sortOrder: 4, lineCost: 0 },
          { ingredientId: salt.id, quantity: 3, unit: "g", sortOrder: 5, lineCost: 0 },
        ],
      },
    },
  })

  console.log("✅ Preparations created")

  // Now recalculate all preparation costs
  const allPreps = await prisma.preparation.findMany({
    include: { items: { include: { ingredient: true, subPreparation: true } } },
  })

  for (const prep of allPreps) {
    let batchCost = 0
    for (const item of prep.items) {
      let lineCost = 0
      if (item.ingredient) {
        const ing = item.ingredient
        const wasteFactor = 1 - Number(ing.wastePercentage) / 100
        const usable = Number(ing.baseUnitsPerPurchase) * wasteFactor
        const cpbu = usable > 0 ? Number(ing.purchasePrice) / usable : 0
        const unitMult: Record<string, number> = { g: 1, kg: 1000, ml: 1, l: 1000, ea: 1, dozen: 12 }
        const baseQty = Number(item.quantity) * (unitMult[item.unit.toLowerCase()] ?? 1)
        lineCost = baseQty * cpbu
      }
      batchCost += lineCost
      await prisma.preparationItem.update({
        where: { id: item.id },
        data: { lineCost: Math.round(lineCost * 10000) / 10000 },
      })
    }

    const yieldGrams = Number(prep.yieldWeightGrams)
    const yieldQty = Number(prep.yieldQuantity)
    const costPerGram = yieldGrams > 0 ? batchCost / yieldGrams : 0
    const costPerServe = yieldQty > 0 ? batchCost / yieldQty : 0

    await prisma.preparation.update({
      where: { id: prep.id },
      data: {
        batchCost: Math.round(batchCost * 100) / 100,
        costPerGram: Math.round(costPerGram * 10000) / 10000,
        costPerServe: Math.round(costPerServe * 100) / 100,
      },
    })

    console.log(`  📊 ${prep.name}: batch $${(Math.round(batchCost * 100) / 100).toFixed(2)}`)
  }

  console.log("✅ Preparation costs calculated")

  // Reload preparations with updated costs for dish calculations
  const updatedPreps = await prisma.preparation.findMany()
  const prepMap = new Map(updatedPreps.map((p) => [p.id, p]))

  // ============================================================
  // DISHES
  // ============================================================

  // Helper to create a dish with auto-calculated costs
  async function createDish(
    name: string,
    menuCategory: string,
    venue: string,
    sellingPrice: number,
    components: Array<{
      ingredientId?: string
      preparationId?: string
      quantity: number
      unit: string
      sortOrder: number
    }>
  ) {
    let totalCost = 0
    const compsWithCost = []

    for (const comp of components) {
      let lineCost = 0

      if (comp.ingredientId) {
        const ing = await prisma.ingredient.findUnique({ where: { id: comp.ingredientId } })
        if (ing) {
          const wasteFactor = 1 - Number(ing.wastePercentage) / 100
          const usable = Number(ing.baseUnitsPerPurchase) * wasteFactor
          const cpbu = usable > 0 ? Number(ing.purchasePrice) / usable : 0
          const unitMult: Record<string, number> = { g: 1, kg: 1000, ml: 1, l: 1000, ea: 1, dozen: 12 }
          const baseQty = comp.quantity * (unitMult[comp.unit.toLowerCase()] ?? 1)
          lineCost = baseQty * cpbu
        }
      } else if (comp.preparationId) {
        const prep = prepMap.get(comp.preparationId)
        if (prep) {
          const batch = Number(prep.batchCost)
          if (comp.unit.toLowerCase() === "serve") {
            const yieldQty = Number(prep.yieldQuantity)
            lineCost = yieldQty > 0 ? (comp.quantity / yieldQty) * batch : 0
          } else {
            const unitMult: Record<string, number> = { g: 1, kg: 1000, ml: 1, l: 1000 }
            const baseQty = comp.quantity * (unitMult[comp.unit.toLowerCase()] ?? 1)
            const yieldGrams = Number(prep.yieldWeightGrams)
            lineCost = yieldGrams > 0 ? (baseQty / yieldGrams) * batch : 0
          }
        }
      }

      lineCost = Math.round(lineCost * 10000) / 10000
      totalCost += lineCost
      compsWithCost.push({ ...comp, lineCost })
    }

    const sellingPriceExGst = sellingPrice / 1.1
    const foodCostPct = sellingPriceExGst > 0 ? (totalCost / sellingPriceExGst) * 100 : 0
    const grossProfit = sellingPriceExGst - totalCost

    const dish = await prisma.dish.create({
      data: {
        name,
        menuCategory: menuCategory as never,
        venue: venue as never,
        sellingPrice,
        sellingPriceExGst: Math.round(sellingPriceExGst * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        foodCostPercentage: Math.round(foodCostPct * 10) / 10,
        grossProfit: Math.round(grossProfit * 100) / 100,
        components: {
          create: compsWithCost.map((c) => ({
            ingredientId: c.ingredientId || undefined,
            preparationId: c.preparationId || undefined,
            quantity: c.quantity,
            unit: c.unit,
            sortOrder: c.sortOrder,
            lineCost: c.lineCost,
          })),
        },
      },
    })

    console.log(`  🍽️  ${name}: $${sellingPrice} | cost $${totalCost.toFixed(2)} | ${foodCostPct.toFixed(1)}%`)
    return dish
  }

  // Crumpet Benny Salmon
  await createDish("Crumpet Benny Salmon", "BREAKFAST", "BOTH", 27.90, [
    { preparationId: crumpets.id, quantity: 2, unit: "serve", sortOrder: 0 },
    { ingredientId: smokedSalmon.id, quantity: 60, unit: "g", sortOrder: 1 },
    { ingredientId: eggs.id, quantity: 2, unit: "ea", sortOrder: 2 },
    { preparationId: misoHollandaise.id, quantity: 40, unit: "g", sortOrder: 3 },
    { ingredientId: microHerbs.id, quantity: 5, unit: "g", sortOrder: 4 },
  ])

  // Steak and Frites
  await createDish("Steak and Frites", "LUNCH", "BOTH", 36.90, [
    { ingredientId: beefStriploin.id, quantity: 180, unit: "g", sortOrder: 0 },
    { ingredientId: fries.id, quantity: 150, unit: "g", sortOrder: 1 },
    { preparationId: entrecoteSauce.id, quantity: 80, unit: "g", sortOrder: 2 },
    { preparationId: chimichurri.id, quantity: 20, unit: "g", sortOrder: 3 },
  ])

  // BLT
  await createDish("BLT", "LUNCH", "BOTH", 25.90, [
    { ingredientId: breadSliced.id, quantity: 200, unit: "g", sortOrder: 0 },
    { ingredientId: saltedButter.id, quantity: 13, unit: "g", sortOrder: 1 },
    { preparationId: misoMayo.id, quantity: 15, unit: "g", sortOrder: 2 },
    { preparationId: baconJam.id, quantity: 30, unit: "g", sortOrder: 3 },
    { ingredientId: baconStreaky.id, quantity: 208, unit: "g", sortOrder: 4 },
    { ingredientId: lettuce.id, quantity: 20, unit: "g", sortOrder: 5 },
    { ingredientId: tomato.id, quantity: 90, unit: "g", sortOrder: 6 },
  ])

  // Halloumi Stack (extra dish)
  await createDish("Halloumi Stack", "BREAKFAST", "BURLEIGH", 24.90, [
    { ingredientId: halloumi.id, quantity: 80, unit: "g", sortOrder: 0 },
    { ingredientId: eggs.id, quantity: 2, unit: "ea", sortOrder: 1 },
    { preparationId: picoDeGallo.id, quantity: 60, unit: "g", sortOrder: 2 },
    { preparationId: crispyChilli.id, quantity: 15, unit: "g", sortOrder: 3 },
    { ingredientId: microHerbs.id, quantity: 3, unit: "g", sortOrder: 4 },
  ])

  console.log("✅ Dishes created")
  console.log("\n🎉 Seed complete!")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
