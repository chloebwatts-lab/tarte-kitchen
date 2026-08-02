import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })
async function main(){
  const prep = await db.preparation.findFirst({where:{name:"Potato Hash"},select:{id:true,name:true,yieldQuantity:true,yieldUnit:true,costPerServe:true}})
  console.log("Potato Hash prep:",JSON.stringify(prep))
  // qty of Potato Hash used in dishes/preps
  const uses = await db.preparationItem.findMany({where:{subPreparation:{name:"Potato Hash"}},select:{quantity:true,unit:true,preparation:{select:{name:true}}}})
  for(const u of uses) console.log(`  used in prep ${u.preparation.name}: ${u.quantity} ${u.unit}`)
  const duses = await db.dishComponent.findMany({where:{preparation:{name:"Potato Hash"}},select:{quantity:true,unit:true,dish:{select:{name:true}}}})
  for(const u of duses) console.log(`  used in dish ${u.dish.name}: ${u.quantity} ${u.unit}`)
  // the Hash side dish
  const hash = await db.dish.findFirst({where:{name:"Hash"},select:{id:true,name:true,venue:true,sellingPrice:true,components:{select:{id:true}}}})
  console.log("Hash side dish:",JSON.stringify(hash))
  // also Bacon Side
  const bacon = await db.dish.findFirst({where:{name:"Bacon Side"},select:{id:true,name:true,components:{select:{id:true}}}})
  console.log("Bacon Side dish:",JSON.stringify(bacon))
  await db.$disconnect(); await pool.end()
}
main().catch(e=>{console.error(e);process.exit(1)})
