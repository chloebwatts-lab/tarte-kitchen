import { redirect } from "next/navigation"

// Old address of the PIN reminder. One flow now: the setup link.
export default function PinRedirect() {
  redirect("/staff-login/start")
}
