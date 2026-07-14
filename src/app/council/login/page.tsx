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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sage-soft">
            <ShieldCheck className="h-6 w-6 text-sage-deep" />
          </div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            Council Inspection Folder
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
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
            className="block w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {hasError && (
            <p className="text-sm text-red-text">Incorrect password.</p>
          )}
          <button
            type="submit"
            className="block w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            Open folder
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          For Gold Coast City Council EHO use. 12-hour session.
        </p>
      </div>
    </div>
  )
}
