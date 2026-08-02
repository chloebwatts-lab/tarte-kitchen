import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
const COMMIT = process.argv.includes("--commit")
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })
async function main(){
  const dishId="side_hash_01"
  const prep = await db.preparation.findFirst({where:{name:"Potato Hash"},select:{id:true,costPerServe:true}})
  if(!prep){console.log("no prep");return}
  // guard: don't double-add
  const existing = await db.dishComponent.findFirst({where:{dishId,preparationId:prep.id}})
  if(existing){console.log("already linked, nothing to do");}
  else{
    console.log(`link Hash side -> Potato Hash @ 1 serve, lineCost ${prep.costPerServe}`)
    if(COMMIT){
      await db.dishComponent.create({data:{dishId,preparationId:prep.id,quantity:1,unit:"serve",lineCost:prep.costPerServe ?? undefined}})
      console.log("CREATED component")
    }
  }
  console.log(COMMIT?"COMMITTED":"(dry run)")
  await db.$disconnect(); await pool.end()
}
main().catch(e=>{console.error(e);process.exit(1)})
