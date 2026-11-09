// accounts@ Sent-copy tidy, by hand (rule 5: no profit or earnings mail left
// in the shared mailbox). Uses the Kitchen Gmail connection, trash only.
//
// Run on the droplet from /root/tarte-kitchen (same env line as
// send-with-attachments.ts):
//   npx tsx scripts/tidy-sent.ts --scopes            # does the token have gmail.modify?
//   npx tsx scripts/tidy-sent.ts --id <gmailMsgId>   # trash one Sent copy (subject must be on the list)
//   npx tsx scripts/tidy-sent.ts --sweep --dry-run   # list what the weekly sweep would trash
//   npx tsx scripts/tidy-sent.ts --sweep [--days 30] # trash them
// --dry-run works with --id too. Scheduled tasks that fall back to the
// claude.ai Gmail connector pass the connector's message id to --id.
import "dotenv/config"
import { gmailTokenScopes, sweepPrivateSent, trashPrivateSentCopy } from "../src/lib/gmail/sent-tidy"

async function main() {
  const argv = process.argv.slice(2)
  const has = (f: string) => argv.includes(f)
  const val = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
  const dryRun = has("--dry-run") ? true : undefined

  if (has("--scopes")) {
    const scopes = await gmailTokenScopes()
    console.log(JSON.stringify({ scopes, canTrash: scopes.includes("https://www.googleapis.com/auth/gmail.modify") }))
    return
  }
  const id = val("--id")
  if (id) {
    const r = await trashPrivateSentCopy({ id, via: val("--via") ?? "cli", dryRun })
    console.log(JSON.stringify(r))
    if (r.action === "failed") process.exit(1)
    return
  }
  if (has("--sweep")) {
    const days = Number(val("--days"))
    const s = await sweepPrivateSent({ dryRun, newerThanDays: Number.isFinite(days) && days > 0 ? days : undefined })
    console.log(JSON.stringify(s, null, 2))
    return
  }
  throw new Error("usage: --scopes | --id <gmailMessageId> [--dry-run] | --sweep [--dry-run] [--days N]")
}
main().catch((e) => { console.error(e); process.exit(1) })
