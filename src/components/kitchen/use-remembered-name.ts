"use client"

import { useCallback, useSyncExternalStore } from "react"

const KEY = "tk-order-name"
const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}

/**
 * The name the person on this device last ordered under. Staff share iPads,
 * but retyping a name on every one of twenty items is how "who asked for
 * this?" stops being answerable, so it's remembered per device.
 *
 * Server snapshot is empty, so the field hydrates blank and fills in after,
 * no mismatch warning on an input's value.
 */
export function useRememberedName(): [string, (value: string) => void] {
  const name = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(KEY) ?? "",
    () => ""
  )
  const setName = useCallback((value: string) => {
    window.localStorage.setItem(KEY, value)
    for (const cb of [...listeners]) cb()
  }, [])
  return [name, setName]
}
