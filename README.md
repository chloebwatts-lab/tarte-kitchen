# Tarte Kitchen

Recipe costing, daily sales, wastage tracking, and supplier invoice ingest
for Tarte Bakery (Burleigh), Tarte Beach House (Currumbin), and Tarte Tea
Garden (Currumbin).

## Operations

### Deploy a new version to production

On the production droplet, from the repo directory:

```bash
./scripts/deploy.sh
```

That pulls `origin/main`, rebuilds the app image, runs any pending
Prisma migrations, and restarts the app + Caddy. Safe to re-run.

### Enable Gmail invoice scanning

1. Make sure Gmail OAuth env vars are set in `.env` on the droplet:
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_REDIRECT_URI`.
2. Visit **Settings → Integrations → Gmail** and click Connect.
   The OAuth flow stores encrypted tokens in `GmailConnection`.
3. For each supplier whose invoices you want scanned, add the sender
   email. Either edit the supplier in the Suppliers UI (fills the
   `Supplier.email` fallback) or add rows via `SupplierEmail` if a
   supplier sends from multiple addresses.
4. The hourly cron at `/api/cron/check-invoices` then searches Gmail
   for messages `from:(supplier1 OR supplier2 …) has:attachment filename:pdf`
   since the last scan. Matches are parsed by Claude and written to
   the Invoice table.

### Enable Lightspeed end-of-day email ingest

1. Gmail must be connected (see above) on an inbox that receives the
   Lightspeed EOD reports (typically `accounts@tarte.com.au`).
2. Open **Settings → Integrations → Lightspeed**, connect via OAuth,
   then map each Lightspeed location to Tarte Bakery / Beach House /
   Tea Garden.
3. The daily cron at `/api/cron/sync-lightspeed-reports` (08:00 AEST)
   will parse incoming EOD emails and upsert revenue + best-sellers
   per venue. The API-based `/api/cron/sync-sales` runs earlier as a
   fallback.

### Applying migrations manually

If you need to run migrations outside of a deploy:

```bash
docker compose --profile tools run --rm migrate
```

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
