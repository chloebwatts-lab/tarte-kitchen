/**
 * Only ever bounce back into our own app after a login or deed step, never
 * to a pasted URL.
 *
 * "/" alone is not enough: browsers read "/\evil.example" as "//evil.example"
 * and leave the site, and a scheme hidden behind whitespace or control
 * characters does the same. So the path must start with exactly one "/",
 * followed by something that is not another slash or backslash, and carry
 * nothing outside printable ASCII.
 */
export function safeNext(raw: string | null | undefined, fallback: string): string {
  const s = (raw ?? "").trim()
  if (!s.startsWith("/")) return fallback
  if (/^\/[\/\\]/.test(s)) return fallback
  if (/[\\\u0000-\u001f\u007f]/.test(s)) return fallback
  if (/^\/\S*:/.test(s.split(/[?#]/)[0])) return fallback
  return s
}
