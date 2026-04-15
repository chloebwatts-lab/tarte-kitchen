export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { getWasteFormItems } from "@/lib/actions/wastage"
import { StaffWasteForm } from "@/components/staff-waste-form"

export const metadata: Metadata = {
  title: "Log Waste — Tarte Kitchen",
}

export default async function LogWastePage() {
  const items = await getWasteFormItems()
  return <StaffWasteForm items={items} />
}
