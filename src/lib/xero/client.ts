const XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize"
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token"
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections"
const XERO_PAYROLL_BASE = "https://api.xero.com/payroll.xro/1.0"

export function getXeroRedirectUri(): string {
  return (
    process.env.XERO_REDIRECT_URI ??
    "https://kitchen.tarte.com.au/api/xero/callback"
  )
}

export function getXeroAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.XERO_CLIENT_ID!,
    redirect_uri: getXeroRedirectUri(),
    response_type: "code",
    scope: "payroll.employees payroll.payruns openid profile email offline_access",
    state: "tarte-xero",
  })
  return `${XERO_AUTH_URL}?${params.toString()}`
}

function getXeroCredentials(): string {
  return Buffer.from(
    `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
  ).toString("base64")
}

export async function exchangeXeroCode(code: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${getXeroCredentials()}`,
    },
    body: new URLSearchParams({
      code,
      redirect_uri: getXeroRedirectUri(),
      grant_type: "authorization_code",
    }),
  })
  if (!res.ok) throw new Error(`Xero token exchange failed: ${await res.text()}`)
  return res.json()
}

export async function refreshXeroToken(refreshToken: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${getXeroCredentials()}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`Xero token refresh failed: ${await res.text()}`)
  return res.json()
}

export async function getXeroTenants(accessToken: string): Promise<
  Array<{ tenantId: string; tenantName: string; tenantType: string }>
> {
  const res = await fetch(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Xero connections failed: ${await res.text()}`)
  return res.json()
}

export async function getValidXeroAccessToken(): Promise<{
  accessToken: string
  tenantId: string
}> {
  const { db } = await import("@/lib/db")
  const conn = await (db as any).xeroConnection.findFirst()
  if (!conn) throw new Error("No Xero connection found")

  if (new Date(conn.tokenExpiresAt) > new Date()) {
    return { accessToken: conn.accessToken, tenantId: conn.tenantId }
  }

  // Refresh
  const data = await refreshXeroToken(conn.refreshToken)
  await (db as any).xeroConnection.update({
    where: { id: conn.id },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  })

  return { accessToken: data.access_token, tenantId: conn.tenantId }
}

// ─── Xero Date helper ─────────────────────────────────────────────────────────
// Xero uses /Date(milliseconds+offset)/ format
export function parseXeroDate(xeroDate: string): Date {
  const match = xeroDate.match(/\/Date\((-?\d+)/)
  if (!match) return new Date(xeroDate)
  return new Date(parseInt(match[1]))
}

// ─── Payroll types ─────────────────────────────────────────────────────────────

interface XeroPayslip {
  EmployeeID: string
  GrossEarnings: number
  NetPay: number
  Tax: number
  SuperAmount: number
}

export interface XeroPayRun {
  PayRunID: string
  PayRunPeriodStartDate: string
  PayRunPeriodEndDate: string
  PayRunStatus: string
  PaymentDate: string
  Payslips: XeroPayslip[]
}

export interface ProcessedPayRun {
  payRunId: string
  weekStart: Date
  weekEnd: Date
  paymentDate: Date
  grossWages: number
  superAmount: number
  totalCost: number
  headcount: number
}

export async function getPostedPayRuns(
  accessToken: string,
  tenantId: string,
  fromDate?: Date
): Promise<ProcessedPayRun[]> {
  let url = `${XERO_PAYROLL_BASE}/PayRuns?PayRunStatus=POSTED`
  if (fromDate) {
    const d = fromDate
    url += `&where=PayRunPeriodStartDate >= DateTime(${d.getFullYear()}, ${d.getMonth() + 1}, ${d.getDate()})`
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": tenantId,
      Accept: "application/json",
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Xero PayRuns failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  const payRuns: XeroPayRun[] = data.PayRuns ?? []

  return payRuns.map((run) => {
    const grossWages = run.Payslips.reduce((sum, p) => sum + (p.GrossEarnings ?? 0), 0)
    const superAmount = run.Payslips.reduce((sum, p) => sum + (p.SuperAmount ?? 0), 0)

    return {
      payRunId: run.PayRunID,
      weekStart: parseXeroDate(run.PayRunPeriodStartDate),
      weekEnd: parseXeroDate(run.PayRunPeriodEndDate),
      paymentDate: parseXeroDate(run.PaymentDate),
      grossWages: Math.round(grossWages * 100) / 100,
      superAmount: Math.round(superAmount * 100) / 100,
      totalCost: Math.round((grossWages + superAmount) * 100) / 100,
      headcount: run.Payslips.length,
    }
  })
}
