/**
 * Lightspeed back-office login for the iPads, shown on the printer
 * troubleshooter to managers only (Chloe, 12 Oct 2026). Lives in a module
 * that only server code imports, so it never ships in a client bundle; the
 * page passes it down as a prop, or null for anyone below Manager.
 *
 * Until 12 Oct 2026 it was hard-coded in the client component and readable
 * by every staff sign-in (and in the static JS chunk), so the password
 * should be rotated in Lightspeed.
 */
export interface PrinterLogin {
  username: string
  password: string
}

export const LIGHTSPEED_IPAD_LOGIN: PrinterLogin = {
  username: "Georgiafarquhar@gmail.com",
  password: "0400Jessie123!",
}
