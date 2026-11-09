// Uber Eats Manager signs itself back in (9 Nov 2026).
//
// Uber gives shops no sales API, so Tarte Kitchen reads Uber Eats Manager's
// own JSON endpoints with a browser session, and Uber logs that session out
// about every 30 days. Until now a person had to sign in and paste a new one.
// This job runs on the office Mac three times a day (launchd, see README):
//
//   1. asks Kitchen whether the stored session still works (one live call);
//      if it does, stops;
//   2. otherwise opens the real Google Chrome on this Mac with its own
//      profile (not Chloe's), goes to Uber Eats Manager and signs in as
//      accounts@tarte.com.au. The Uber account has Google connected, and
//      Uber insists on it: after an emailed code it still asks for the
//      Google account. So the profile holds a Google sign-in as accounts@
//      (done once by a person, `--google-setup`) and the job uses
//      "Continue with Google"; the emailed-code route (Kitchen reads the
//      4-digit code from accounts@ mail) is the fallback when Uber asks;
//   3. hands the browser's session for merchants.ubereats.com to Kitchen,
//      which stores it encrypted and loads the last 14 days, exactly as a
//      paste in Settings would.
//
// Everything Kitchen-side goes through ssh to the droplet and curl inside its
// cron container, so Kitchen's secret never lives on this Mac. Codes and
// cookies are never printed or logged. Cloudflare only lets a real, visible
// Chrome through Uber's sign-in, so a window appears for about a minute.
//
//   node login.mjs                 check, sign in only if the session is dead
//   node login.mjs --force         sign in again regardless
//   node login.mjs --google-setup  one-time: opens a plain Chrome window on
//                                  Google's sign-in for a person to sign in as
//                                  accounts@, waits (up to WAIT_MINUTES, default
//                                  480), then signs in to Uber and hands over
//
// Exit 0 = nothing to do or signed in and handed over; 1 = failed (see log).
import { chromium } from "playwright"
import { spawn, spawnSync } from "node:child_process"
import { appendFileSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname } from "node:path"

const HOME = process.env.HOME ?? "/Users/chris"
const KITCHEN_HOST = process.env.KITCHEN_HOST ?? "root@134.199.157.138"
const PROFILE_DIR = process.env.UBER_PROFILE_DIR ?? `${HOME}/C/tarte-loose-ends/uber-login-profile`
const LOG = process.env.UBER_LOGIN_LOG ?? `${HOME}/C/tarte-loose-ends/uber-login.log`
const EMAIL = process.env.UBER_EMAIL ?? "accounts@tarte.com.au"
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const FORCE = process.argv.includes("--force")
const GOOGLE_SETUP = process.argv.includes("--google-setup")
const DEBUG = Boolean(process.env.UBER_LOGIN_DEBUG)
const MANAGER = "https://merchants.ubereats.com/manager/home"

const stamp = () => new Date().toLocaleString("sv-SE", { timeZone: "Australia/Brisbane" }).slice(0, 16)
function log(line) {
  mkdirSync(dirname(LOG), { recursive: true })
  appendFileSync(LOG, `${stamp()} ${line}\n`)
  console.log(line)
}
const debug = (line) => { if (DEBUG) console.log(`  ${line}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const hostOf = (page) => { try { return new URL(page.url()).hostname } catch { return "" } }

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

/** Does the job's Chrome profile hold a Google sign-in? (cookie names only; values stay encrypted) */
function profileHasGoogleSession() {
  const db = `${PROFILE_DIR}/Default/Cookies`
  if (!existsSync(db)) return false
  const copy = `${PROFILE_DIR}/.cookies-peek.sqlite`
  try {
    copyFileSync(db, copy)
    const r = spawnSync("sqlite3", ["-readonly", copy, "select count(*) from cookies where host_key like '%.google.com' and name in ('SID','__Secure-1PSID','__Secure-3PSID')"], { encoding: "utf8" })
    return Number((r.stdout ?? "0").trim()) > 0
  } catch { return false } finally { rmSync(copy, { force: true }) }
}

/**
 * One-time, by a person: a plain (not automated) Chrome window on this
 * profile, on Google's sign-in, because Google refuses password sign-ins in
 * an automated browser. Waits until the profile holds a Google session.
 */
async function googleSetup() {
  const waitMinutes = Number(process.env.WAIT_MINUTES ?? 480)
  mkdirSync(PROFILE_DIR, { recursive: true })
  const chrome = spawn(CHROME, [
    `--user-data-dir=${PROFILE_DIR}`, "--no-first-run", "--no-default-browser-check", "--window-size=1000,820", "--window-position=200,100",
    `https://accounts.google.com/ServiceLogin?hl=en&continue=https://myaccount.google.com/&Email=${encodeURIComponent(EMAIL)}`,
  ], { stdio: "ignore", detached: false })
  log(`GOOGLE_SETUP Chrome window open on Google sign-in for ${EMAIL}; waiting up to ${waitMinutes} min for a person to sign in`)
  const deadline = Date.now() + waitMinutes * 60_000
  let signedIn = false
  while (Date.now() < deadline) {
    await sleep(15_000)
    if (chrome.exitCode !== null) { if (profileHasGoogleSession()) { signedIn = true; break } throw new Error("the Google sign-in window was closed before a sign-in finished") }
    if (profileHasGoogleSession()) { signedIn = true; await sleep(20_000); break }
  }
  if (!signedIn) { chrome.kill("SIGTERM"); throw new Error("nobody signed in to Google in the setup window") }
  if (chrome.exitCode === null) {
    chrome.kill("SIGTERM")
    for (let i = 0; i < 20 && chrome.exitCode === null; i++) await sleep(500)
  }
  log("GOOGLE_SETUP done: the job's Chrome profile is signed in to Google")
}

/** "Continue with Google" opens a Google window; pick the accounts@ account in it. */
async function continueWithGoogle(ctx, page) {
  const button = page.getByRole("button", { name: /continue with google/i }).first()
  await button.waitFor({ timeout: 15_000 })
  const popupPromise = ctx.waitForEvent("page", { timeout: 20_000 }).catch(() => null)
  await button.click()
  const popup = await popupPromise
  if (!popup) { debug("no Google window opened"); return }
  try {
    await popup.waitForLoadState("domcontentloaded").catch(() => {})
    for (let i = 0; i < 12 && !popup.isClosed(); i++) {
      await sleep(2500)
      const t = (await popup.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ")
      debug(`google window: ${t.slice(0, 160)}`)
      if (/not secure|couldn.t sign you in/i.test(t)) throw new Error("Google refused the automated browser; run --google-setup again")
      const account = popup.getByText(EMAIL, { exact: false }).first()
      if (await account.isVisible().catch(() => false)) { await account.click().catch(() => {}); continue }
      const cont = popup.getByRole("button", { name: /^(continue|allow|confirm)$/i }).first()
      if (await cont.isVisible().catch(() => false)) { await cont.click().catch(() => {}); continue }
    }
  } finally {
    if (!popup.isClosed()) await popup.waitForEvent("close", { timeout: 15_000 }).catch(() => {})
  }
}

/** Uber's "Log in with email": asks Kitchen for the 4-digit code Uber just emailed, types it. */
async function emailCode(page) {
  const withEmail = page.getByText(/log ?in with email/i).first()
  await withEmail.waitFor({ timeout: 20_000 })
  const sinceMs = Date.now()
  await withEmail.click()
  await page.getByText(/4-digit code/i).first().waitFor({ timeout: 30_000 })
  let code = null
  for (let i = 0; i < 25 && !code; i++) {
    await sleep(6000)
    const r = kitchen(`/api/internal/uber-login-code?since=${sinceMs - 3000}`)
    if (r.found && /^\d{4}$/.test(String(r.code))) code = String(r.code)
  }
  if (!code) throw new Error("no login code arrived in accounts@ within 150 s")
  const field = page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"], input[type="tel"], input[type="number"], input[type="text"]').first()
  await field.waitFor({ timeout: 10_000 })
  await field.click()
  await page.keyboard.type(code, { delay: 150 })
  await sleep(4000)
}

async function signIn(ctx, page) {
  const text = async (n = 300) => (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, n)
  await page.goto(MANAGER, { waitUntil: "domcontentloaded", timeout: 60_000 })
  for (let i = 0; i < 12 && hostOf(page) !== "merchants.ubereats.com" && !(await page.getByPlaceholder(/phone number or email/i).isVisible().catch(() => false)); i++) await sleep(5000)
  if (hostOf(page) === "merchants.ubereats.com") { debug("profile still signed in to Uber"); return }

  const googleReady = profileHasGoogleSession()
  debug(`Google session in profile: ${googleReady}`)
  const box = page.getByPlaceholder(/phone number or email/i)
  await box.waitFor({ timeout: 20_000 })
  await box.fill(EMAIL)
  await page.getByText("Continue", { exact: true }).first().click()
  await page.getByText(/welcome back/i).first().waitFor({ timeout: 30_000 })

  // Uber's order of preference for this account: Google first (the connected
  // social account), the emailed code only if Uber still asks for it.
  for (let step = 0; step < 4 && hostOf(page) !== "merchants.ubereats.com"; step++) {
    const t = await text(400)
    debug(`step ${step}: ${hostOf(page)} ${t.slice(0, 200)}`)
    if (/invalid|incorrect|expired|too many/i.test(t)) throw new Error(`Uber rejected the sign-in: ${t.slice(0, 160)}`)
    const hasGoogle = await page.getByRole("button", { name: /continue with google/i }).first().isVisible().catch(() => false)
    const hasEmail = await page.getByText(/log ?in with email/i).first().isVisible().catch(() => false)
    if (hasGoogle && googleReady) await continueWithGoogle(ctx, page)
    else if (hasEmail) await emailCode(page)
    else if (hasGoogle) throw new Error("Uber wants the connected Google account and the job's Chrome profile is not signed in to Google: run `node login.mjs --google-setup` once")
    else {
      const next = page.getByRole("button", { name: /^(next|skip|not now|maybe later)$/i }).first()
      if (await next.isVisible().catch(() => false)) await next.click().catch(() => {})
    }
    for (let i = 0; i < 6 && hostOf(page) !== "merchants.ubereats.com"; i++) await sleep(3000)
  }
  if (hostOf(page) !== "merchants.ubereats.com") throw new Error(`still not in Uber Eats Manager; page says: ${await text(200)}`)
}

async function main() {
  if (GOOGLE_SETUP) await googleSetup()
  else {
    const status = kitchen("/api/internal/uber-session")
    if (status.alive === true && !FORCE) { log(`OK session alive, last sync ${status.lastSyncAt ?? "never"}`); return 0 }
    if (status.alive === null && !FORCE) { log(`UNKNOWN Kitchen could not reach Uber, not signing in: ${status.lastError ?? ""}`); return 0 }
    log(`${FORCE ? "FORCED" : "DEAD"} session (${status.lastError ?? "no connection"}), signing in as ${EMAIL}`)
  }

  mkdirSync(PROFILE_DIR, { recursive: true })
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome", headless: false, viewport: null,
    // The real keychain, so cookies from the plain-Chrome Google setup and
    // from these automated runs are one profile (Playwright's default mock
    // keychain would make them unreadable to each other).
    ignoreDefaultArgs: ["--use-mock-keychain", "--enable-automation"],
    args: ["--window-size=960,760", "--window-position=240,120", "--no-first-run", "--no-default-browser-check"],
    locale: "en-AU", timezoneId: "Australia/Brisbane",
  })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  try {
    await signIn(ctx, page)
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
