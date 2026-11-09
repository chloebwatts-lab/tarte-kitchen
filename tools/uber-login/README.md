# Uber Eats Manager self-sign-in (office Mac)

Uber gives shops no sales API. Kitchen reads Uber Eats Manager's own JSON
endpoints with a browser session, and Uber logs that session out about every
30 days. This job puts the session back without anyone signing in or pasting.

What runs, three times a day (07:10, 12:10, 17:10 Brisbane, launchd):

1. `GET /api/internal/uber-session` on Kitchen: is the stored session alive?
   Yes: stop. (Most runs end here in a few seconds.)
2. No: open the real Google Chrome on this Mac with its own profile
   (`~/C/tarte-loose-ends/uber-login-profile`), go to Uber Eats Manager,
   enter accounts@tarte.com.au, choose "Log in with email".
3. `GET /api/internal/uber-login-code?since=...`: Kitchen reads the 4-digit
   code Uber just emailed to accounts@ (same Gmail connection as invoices).
   The job types it. A window is visible for about a minute; Cloudflare only
   lets a real visible Chrome through Uber's sign-in, headless is blocked.
4. `POST /api/internal/uber-session {cookie}`: Kitchen stores the session
   encrypted and loads the last 14 days, exactly as a paste in Settings >
   Integrations would. The usual 30-minute cron then carries on.

Kitchen is reached over ssh to the droplet and curl inside its cron container,
so `CRON_SECRET` never lives on this Mac. The code and the cookie are never
printed or logged. Log: `~/C/tarte-loose-ends/uber-login.log`
(`OK session alive` / `OK signed in` / `FAIL ...`); a failure also leaves
`uber-login-profile/last-failure.png`.

Install or update: `./install.sh`. Run now: `node login.mjs` (or `--force`
to sign in again even if the session is alive). Needs the Mac on and awake
at some point in the day; a missed time runs at the next wake.

If Uber changes its sign-in page the job fails and the Settings card shows
"Sign-in overdue" after 36 hours; the paste route in Settings still works as
a fallback.
