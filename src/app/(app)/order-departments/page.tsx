export const dynamic = "force-dynamic"

import {
  listDeptAssignments,
  listDeptOwners,
} from "@/lib/actions/dept-orders"
import { OrderDepartmentsAdmin } from "@/components/order-departments-admin"

export default async function OrderDepartmentsPage() {
  const [owners, items] = await Promise.all([
    listDeptOwners(),
    listDeptAssignments(),
  ])

  return <OrderDepartmentsAdmin owners={owners} items={items} />
}
