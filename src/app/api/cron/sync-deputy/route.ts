export const dynamic = "force-dynamic"

import { syncDeputyTimesheets } from "@/lib/deputy/client"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  try {
    const result = await syncDeputyTimesheets()
    return Response.json(result)
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 500 }
    )
  }
}
