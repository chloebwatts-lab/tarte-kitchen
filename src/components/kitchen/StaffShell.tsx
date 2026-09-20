import { getPerson } from "@/lib/person-session"
import { IDLE_MINUTES } from "@/lib/person-auth"
import { StaffShellClient } from "@/components/kitchen/StaffShellClient"

/**
 * Wraps every staff page for a signed-in person: their name watermarked
 * across the screen, a view beacon, auto sign-out and a Sign out chip.
 * Office sessions (Chloe, the meeting deck) get none of it.
 */
export async function StaffShell() {
  const person = await getPerson()
  if (!person) return null
  return <StaffShellClient name={person.name} idleMinutes={IDLE_MINUTES} />
}
