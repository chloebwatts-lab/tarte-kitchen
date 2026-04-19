# Deputy setup — the 60-second path

Two options. Pick **A** unless you have a specific reason not to.

## Option A — Permanent Token (recommended)

No developer portal. No OAuth app registration. No env-var deploy.
Just paste one value from Deputy into Tarte Kitchen.

### 1. Generate the token in Deputy

1. Open your Deputy install (e.g. `https://tarte.au.deputy.com`) and
   sign in as the **owner** account.
2. Click your **avatar** (top-right) → **My Account**.
3. In the sidebar, click **Integrations** (labelled variably as
   **Developer Tools**, **API**, or **Permanent Tokens** depending on
   Deputy version).
4. Click **Create New Permanent Token**.
5. Name it `Tarte Kitchen`. Copy the token Deputy shows — it's only
   shown once.

### 2. Paste it into Tarte Kitchen

1. Visit <https://kitchen.tarte.com.au/settings/integrations>.
2. Scroll to the **Deputy** card.
3. Paste the install URL (e.g. `tarte.au.deputy.com`) and the token.
4. Click **Connect Deputy**. We verify the token by calling Deputy
   before saving — if it's wrong you get a clear error, not a silent
   broken connection.

### 3. Map venues, sync

1. On the now-connected card, click **Refresh from Deputy** → pulls
   the Operational Units.
2. Pick the matching Tarte venue for each in the dropdown.
3. Click **Sync timesheets now** — pulls the last 4 weeks.
4. Head to `/labour`. Done.

After that the hourly cron keeps it fresh.

## Option B — OAuth app (if you need multiple people connecting or token rotation)

1. Register an OAuth app at <https://developer.deputy.com/>.
2. Callback: `https://kitchen.tarte.com.au/api/deputy/callback`
3. Scope: `longlife_refresh_token`
4. Add `DEPUTY_CLIENT_ID` + `DEPUTY_CLIENT_SECRET` to the droplet `.env`.
5. Run `./scripts/deploy.sh`.
6. On the Integrations page, expand the **Advanced** section of the
   Deputy card and click **Connect via OAuth**.

## Troubleshooting

- **"Deputy rejected the token (401)"** — token was copied partially,
  or you pasted the install URL wrong. Regenerate and paste fresh.
- **"Install URL should look like tarte.au.deputy.com"** — we expect
  the format `{install}.{region}.deputy.com` exactly. No https://, no
  trailing slash — the form strips those but double-check.
- **Empty /labour after sync succeeds** — timesheets need to be
  **approved** in Deputy for the dashboard to show them. Unapproved
  rows are still synced but excluded from the labour-% calc.
- **Unmapped location warning** — a Deputy Operational Unit didn't get
  assigned a Tarte venue. Timesheets from unmapped units are skipped.

## What happens automatically after this

- `/api/cron/sync-deputy` runs every hour (scheduled in `vercel.json`).
- `/labour` dashboard recomputes on each visit.
- Weekly labour is still in Xero for payroll — this gives you *daily*
  granularity that Xero can't.

## Next step after Deputy's flowing

I'll add a **Prime Cost panel** on `/labour` that combines food cost +
labour cost as % of revenue, per venue per day, traffic-lit against
the 60% hospo target. Deputy being wired is the prerequisite.
