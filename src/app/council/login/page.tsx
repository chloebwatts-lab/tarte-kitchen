import { ShieldCheck } from "lucide-react"
import { submitCouncilPassword } from "./actions"

export const dynamic = "force-dynamic"

export default async function CouncilLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const hasError = sp.error === "1"

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <ShieldCheck className="h-6 w-6 text-emerald-700" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            Council Inspection Folder
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Tarte Kitchen — enter password to continue
          </p>
        </div>

        <form action={submitCouncilPassword} className="space-y-3">
          <input
            type="password"
            name="password"
            autoFocus
            required
            placeholder="Password"
            className="block w-full rounded-md border border-stone-300 px-3 py-2 text-base shadow-sm placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
          {hasError && (
            <p className="text-sm text-rose-600">Incorrect password.</p>
          )}
          <button
            type="submit"
            className="block w-full rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
          >
            Open folder
          </button>
        </form>

        <p className="text-center text-xs text-stone-400">
          For Gold Coast City Council EHO use. 12-hour session.
        </p>
      </div>
    </div>
  )
}
