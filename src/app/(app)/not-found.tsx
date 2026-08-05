import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border-[1.5px] border-border bg-card p-8 text-center">
        <p className="font-serif text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          404
        </p>
        <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That page doesn&apos;t exist, or it may have moved.
        </p>
        <div className="mt-6">
          <Link
            href="/dashboard"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
