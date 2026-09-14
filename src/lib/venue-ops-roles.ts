/**
 * Who a board task can be handed to. Roles, not people: a task assigned to
 * "Barista" still makes sense after the roster changes, and a role chip is
 * one tap on a phone at 7am where a name is a keyboard. A specific person
 * can still be typed when it genuinely has to be one person.
 */
export const OWNER_ROLES = [
  "Duty manager",
  "Kitchen",
  "Barista",
  "Floor",
  "KP",
  "Maintenance",
] as const

export type OwnerRole = (typeof OWNER_ROLES)[number]

export function isOwnerRole(s: string | null | undefined): s is OwnerRole {
  return !!s && (OWNER_ROLES as readonly string[]).includes(s)
}
