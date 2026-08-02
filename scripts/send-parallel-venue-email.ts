/**
 * One-off: send the venue-identification request to Parallel Roasters
 * from accounts@ via the app's Gmail connection (Chris asked to send,
 * 2026-07-14). Mirrors the draft created in the mailbox.
 */
import { sendHtmlEmail } from "../src/lib/gmail/send"

const text = `Hi team,

Quick favour on the invoicing side. We run two venues:

- Tarte Bakery, Burleigh Heads
- Tarte Beach House, Currumbin

At the moment your invoices come through without saying which venue the coffee went to, so we have to guess when allocating the spend. Could you please add the venue name to each invoice (or invoice the two venues separately if that is easier at your end)?

Same email address for everything, nothing else changes.

Thanks very much,
Tarte Accounts
accounts@tarte.com.au`

const html = text
  .split("\n\n")
  .map((p) =>
    p.startsWith("- ")
      ? `<ul>${p.split("\n").map((l) => `<li>${l.replace(/^- /, "")}</li>`).join("")}</ul>`
      : `<p>${p.replace(/\n/g, "<br>")}</p>`
  )
  .join("")

async function main() {
  await sendHtmlEmail({
    to: "accounts@parallelroasters.com",
    subject: "Invoices: can you note which venue each one is for?",
    text,
    html,
  })
  console.log("SENT to accounts@parallelroasters.com")
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
