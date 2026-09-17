// GM desk alerts. Shows the notification and opens the desk when tapped.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()))
self.addEventListener("push", (event) => {
  let data = { title: "Tarte", body: "", url: "/kitchen/gm" }
  try { data = Object.assign(data, event.data ? event.data.json() : {}) } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/apple-touch-icon.png",
      badge: "/icons/apple-touch-icon.png",
      data: { url: data.url },
    })
  )
})
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/kitchen/gm"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus() }
      return self.clients.openWindow(url)
    })
  )
})
