"use strict";

const CACHE_NAME = "primetask-workspace-v1";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.add("/")));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(key => key.startsWith("primetask-workspace-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" ||
      url.origin !== self.location.origin ||
      url.pathname !== "/") return;

  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put("/", copy));
      }
      return response;
    }).catch(async () => {
      return await caches.match("/") || Response.error();
    })
  );
});

self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = {
      body: event.data ? event.data.text() : "You have a new account notification."
    };
  }

  const title = typeof payload.title === "string" && payload.title.trim()
    ? payload.title.slice(0, 120)
    : "PrimeTask Workspace";

  const body = typeof payload.body === "string" && payload.body.trim()
    ? payload.body.slice(0, 240)
    : "You have a new account notification.";

  const target = typeof payload.url === "string" &&
    payload.url.startsWith("/") && !payload.url.startsWith("//")
    ? payload.url
    : "/dashboard/";

  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: payload.notificationId
      ? `ptw-${String(payload.notificationId).slice(0, 100)}`
      : "ptw-account",
    data: { url: target },
    renotify: false
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const target = new URL(
    event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : "/dashboard/",
    self.location.origin
  ).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        await client.navigate(target);
        return client.focus();
      }
    }

    return self.clients.openWindow(target);
  })());
});
