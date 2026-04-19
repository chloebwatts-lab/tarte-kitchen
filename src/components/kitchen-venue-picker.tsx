import Link from "next/link"
import { SINGLE_VENUES, VENUE_LABEL } from "@/lib/venues"

export function KitchenVenuePicker() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-6">
      <div className="text-center">
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Kitchen iPad
        </div>
        <h1 className="mt-1 text-3xl font-bold">Select venue</h1>
      </div>
      <div className="grid w-full max-w-xl gap-3">
        {SINGLE_VENUES.map((v) => (
          <Link
            key={v}
            href={`/kitchen?venue=${v}`}
            className="rounded-2xl border-2 border-gray-200 bg-white p-6 text-lg font-semibold transition active:scale-[0.99] hover:border-gray-900 hover:bg-gray-900 hover:text-white"
          >
            {VENUE_LABEL[v]}
          </Link>
        ))}
      </div>
      <p className="max-w-md text-center text-xs text-muted-foreground">
        Once picked, the iPad stays on this venue until you tap &ldquo;Change
        venue&rdquo; on the home screen.
      </p>
    </div>
  )
}
