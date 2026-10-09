/**
 * Where Kitchen's shift-level labour data (LabourShift rows) comes from.
 *
 *   deputy  Deputy's Roster + Timesheet resources via src/lib/deputy/client.ts
 *           (the original feed; Deputy is being cancelled Oct 2026).
 *   shifts  Tarte Shifts' internal labour feed via src/lib/shifts/labour.ts.
 *
 * Switch with the LABOUR_SOURCE env var (docker-compose maps it; default
 * "deputy" so nothing changes until the cutover session flips it). The
 * Deputy client code stays in place behind this flag: if the Shifts feed is
 * missing or down, the sync falls back to Deputy while a Deputy connection
 * still exists, and otherwise leaves the last synced rows untouched.
 */
export type LabourSource = "deputy" | "shifts"

export function labourSource(env: Record<string, string | undefined> = process.env): LabourSource {
  return (env.LABOUR_SOURCE ?? "").trim().toLowerCase() === "shifts" ? "shifts" : "deputy"
}

/** Human name of the source, for page copy that used to hard-code "Deputy". */
export function labourSourceLabel(source: LabourSource = labourSource()): string {
  return source === "shifts" ? "Tarte Shifts" : "Deputy"
}
