import { redirect } from "next/navigation"

// The staff tools hub is the main landing (Chloe, 2026-08-05). Admin lives
// at /dashboard directly, still behind basic auth.
export default function Home() {
  redirect("/staffaccess")
}
