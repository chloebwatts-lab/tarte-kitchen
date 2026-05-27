// Standalone layout — no TK sidebar. Lives outside the (app) group so
// users with the inbox-playbooks-only password can access this page
// without ever seeing the rest of TK (P&Ls, COGS, etc).

import Link from "next/link"
import { Mail } from "lucide-react"

export default function InboxPlaybooksLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-white">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <Link
              href="/inbox-playbooks"
              className="text-base font-semibold tracking-tight text-stone-900 hover:underline"
            >
              Tarte Inbox
            </Link>
            <p className="text-xs text-stone-500">
              hello@tarte.com.au — agent playbooks
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  )
}
