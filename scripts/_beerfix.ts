import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
const COMMIT = process.argv.includes("--commit")
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })
async function main(){
  const beers = await db.ingredient.findMany({ where: { OR: ["corona","great northern","stone","pacific ale"," ale","lager","peroni","beer"].map(k=>({name:{contains:k,mode:"insensitive" as const}})) }, select:{id:true,name:true,category:true,allergens:true}})
  for(const b of beers){
    // Stone & Wood Pacific Ale uses wheat; others barley lager -> gluten only
    const isWheat = /pacific ale/i.test(b.name)
    const want = isWheat ? ["WHEAT","GLUTEN"] : ["GLUTEN"]
    const cur = b.allergens.join(",")||"(empty)"
    console.log(`${b.name} [${b.category}] ${cur} -> ${want.join(",")}`)
    if(COMMIT) await db.ingredient.update({where:{id:b.id},data:{allergens:want as any}})
  }
  console.log(COMMIT?"COMMITTED":"(dry run)")
  await db.$disconnect(); await pool.end()
}
main().catch(e=>{console.error(e);process.exit(1)})
