// Uber Eats Manager signs itself back in (9 Nov 2026).
//
// Uber gives shops no sales API, so Tarte Kitchen reads Uber Eats Manager's
// own JSON endpoints with a browser session, and Uber logs that session out
// about every 30 days. Until now a person had to sign in and paste a new one.
// This job runs on the office Mac three times a day (launchd, see README):
//
//   1. asks Kitchen whether the stored session still works (one live call);
//      if it does, stops;
//   2. otherwise opens the real Google Chrome on this Mac (its own profile,
//      not Chloe's), goes to Uber Eats Manager, enters accounts@tarte.com.au,
//      chooses "Log in with email", asks Kitchen for the 4-digit code Uber
//      just emailed to accounts@ (Kitchen reads that mailbox already), types
//      it, and waits for Uber Eats Manager to open;
//   3. hands the browser's session for merchants.ubereats.com to Kitchen,
//      which stores it encrypted and loads the last 14 days, exactly as a
//      paste in Settings would.
//
// Everything Kitchen-side goes through ssh to the droplet and curl inside its
// cron container, so Kitchen's secret never lives on this Mac. The code and
// the session cookie are never printed or logged. Cloudflare only lets a real,
// visible Chrome through Uber's sign-in, so a window appears for about a
// minute; that is expected.
//
//   node login.mjs            check, sign in only if the session is dead
//   node login.mjs --force    sign in again regardless
//
// Exit 0 = nothing to do or signed in and handed over; 1 = failed (see log).
import { chromium } from "playwright"
import { spawnSync } from "node:child_process"
import { appendFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

const HOME = process.env.HOME ?? "/Users/chris"
const KITCHEN_HOST = process.env.KITCHEN_HOST ?? "root@134.199.157.138"
const PROFILE_DIR = process.env.UBER_PROFILE_DIR ?? `${HOME}/C/tarte-loose-ends/uber-login-profile`
const LOG = process.env.UBER_LOGIN_LOG ?? `${HOME}/C/tarte-loose-ends/uber-login.log`
const EMAIL = process.env.UBER_EMAIL ?? "accounts@tarte.com.au"
const FORCE = process.argv.includes("--force")
const MANAGER = "https://merchants.ubereats.com/manager/home"

const stamp = () => new Date().toLocaleString("sv-SE", { timeZone: "Australia/Brisbane" }).slice(0, 16)
function log(line) {
  mkdirSync(dirname(LOG), { recursive: true })
  appendFileSync(LOG, `${stamp()} ${line}\n`)
  console.log(line)
}

/** Calls a Kitchen internal route from inside the droplet's cron container (which holds CRON_SECRET). */
function kitchen(path, { method = "GET", body } = {}) {
  const curl = `curl -sS -m 120 -H "Authorization: Bearer $CRON_SECRET" -H "content-type: application/json" -X ${method} ${body ? "--data-binary @-" : ""} "http://kitchen-app:3000${path}"`
  const remote = `cd /root/tarte-kitchen && docker compose exec -T cron sh -c '${curl}'`
  const r = spawnSync("ssh", ["-o", "ConnectTimeout=20", "-o", "BatchMode=yes", KITCHEN_HOST, remote], { input: body ?? "", encoding: "utf8", maxBuffer: 10e6 })
  const err = (r.stderr ?? "").split("\n").filter((l) => l.trim() && !l.includes("WASTAGE_SHEET_ID")).join(" ").slice(0, 200)
  if (r.status !== 0) throw new Error(`Kitchen ${path}: ssh exit ${r.status} ${err}`)
  const text = (r.stdout ?? "").trim()
  try { return JSON.parse(text) } catch { throw new Error(`Kitchen ${path}: not JSON: ${text.slice(0, 200)}`) }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const host = (page) => { try { return new URL(page.url()).hostname } catch { return "" } }

async function main() {
  const status = kitchen("/api/internal/uber-session")
  if (status.alive === true && !FORCE) { log(`OK session alive, last sync ${status.lastSyncAt ?? "never"}`); return 0 }
  if (status.alive === null && !FORCE) { log(`UNKNOWN Kitchen could not reach Uber, not signing in: ${status.lastError ?? ""}`); return 0 }
  log(`${FORCE ? "FORCED" : "DEAD"} session (${status.lastError ?? "no connection"}), signing in as ${EMAIL}`)

  mkdirSync(PROFILE_DIR, { recursive: true })
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome", headless: false, viewport: { width: 960, height: 760 },
    args: ["--window-size=960,760", "--window-position=240,120"], locale: "en-AU", timezoneId: "Australia/Brisbane",
  })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  const text = async (n = 200) => (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, n)
  try {
    await page.goto(MANAGER, { waitUntil: "domcontentloaded", timeout: 60000 })
    for (let i = 0; i < 12 && host(page) !== "merchants.ubereats.com" && !(await page.getByPlaceholder(/phone number or email/i).isVisible().catch(() => false)); i++) await sleep(5000)

    if (host(page) !== "merchants.ubereats.com") {
      const box = page.getByPlaceholder(/phone number or email/i)
      await box.waitFor({ timeout: 20000 })
      await box.fill(EMAIL)
      await page.getByText("Continue", { exact: true }).first().click()
      const withEmail = page.getByText(/log ?in with email/i).first()
      await withEmail.waitFor({ timeout: 30000 })
      const sinceMs = Date.now()
      await withEmail.click()
      await page.getByText(/4-digit code/i).first().waitFor({ timeout: 30000 })

      let code = null
      for (let i = 0; i < 25 && !code; i++) {
        await sleep(6000)
        const r = kitchen(`/api/internal/uber-login-code?since=${sinceMs - 3000}`)
        if (r.found && /^\d{4}$/.test(String(r.code))) code = String(r.code)
      }
      if (!code) throw new Error("no login code arrived in accounts@ within 150 s")
      const field = page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"], input[type="tel"], input[type="number"], input[type="text"]').first()
      await field.waitFor({ timeout: 10000 })
      await field.click()
      await page.keyboard.type(code, { delay: 150 })
      for (let i = 0; i < 8 && host(page) !== "merchants.ubereats.com"; i++) {
        await sleep(5000)
        const t = await text(400)
        if (/invalid|incorrect|expired|too many/i.test(t)) throw new Error(`Uber rejected the code: ${t.slice(0, 160)}`)
        const next = page.getByRole("button", { name: /^next$/i })
        if (await next.isVisible().catch(() => false)) await next.click().catch(() => {})
        const skip = page.getByRole("button", { name: /skip|not now|maybe later/i }).first()
        if (host(page) !== "merchants.ubereats.com" && (await skip.isVisible().catch(() => false))) await skip.click().catch(() => {})
      }
      if (host(page) !== "merchants.ubereats.com") throw new Error(`still not in Uber Eats Manager after the code; page says: ${await text(200)}`)
    }

    await sleep(4000)
    const cookies = await ctx.cookies([MANAGER])
    const header = cookies.map((c) => `${c.name}=${c.value}`).join("; ")
    if (!/(^|;\s*)sid=/.test(header)) throw new Error(`signed in but no sid cookie among ${cookies.length} cookies for Uber Eats Manager`)
    const saved = kitchen("/api/internal/uber-session", { method: "POST", body: JSON.stringify({ cookie: header }) })
    if (!saved.ok) throw new Error(`Kitchen refused the session: ${saved.error}`)
    const summary = (saved.results ?? []).map((r) => `${r.name} ${r.days} days $${Number(r.sales).toFixed(0)} ${r.orders} orders`).join("; ")
    log(`OK signed in and handed to Kitchen. ${summary}${saved.syncError ? ` (first sync failed: ${saved.syncError})` : ""}`)
    return 0
  } catch (err) {
    log(`FAIL ${String(err && err.message ? err.message : err).replace(/\s+/g, " ").slice(0, 300)}`)
    await page.screenshot({ path: `${PROFILE_DIR}/last-failure.png` }).catch(() => {})
    return 1
  } finally {
    await ctx.close().catch(() => {})
  }
}

process.exit(await main().catch((err) => { log(`FAIL ${String(err && err.message ? err.message : err).slice(0, 300)}`); return 1 }))
