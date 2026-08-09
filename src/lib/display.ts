/**
 * Display helpers for staff-facing names.
 *
 * Checklist templates are stored with a fully-qualified name like
 * "Cafe Kitchen — Daily Clean" so they read unambiguously in the admin
 * area and in exports. On kitchen screens the surrounding page already
 * says which section you are in, so the prefix just makes the useful
 * words wrap on phones.
 */
export function stripContextPrefix(name: string, context?: string | null): string {
  let out = name
  if (context) {
    const esc = context.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    out = out.replace(new RegExp(`^${esc}\\s*[-–—:·]\\s*`, "i"), "")
  }
  // House style: no em dashes in anything staff or customers read.
  return out.replace(/\s*—\s*/g, " - ")
}
