/**
 * Cafe wifi drops mid-tap. A server action that throws on the way out
 * (network gone, deploy in progress) otherwise leaves a spinner running
 * forever and a tick that never saved. `attempt` turns that throw into
 * the same `{ ok: false, error }` shape the actions already return, so
 * every caller shows one honest message instead of nothing.
 */
export const OFFLINE_MESSAGE = "Didn't save. Check the wifi and try again."

export async function attempt<T>(p: Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await p
  } catch {
    return { ok: false, error: OFFLINE_MESSAGE }
  }
}
