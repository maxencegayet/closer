/* Closer : hors ligne.
   Réseau d'abord (sans cache HTTP) pour toujours avoir la dernière version,
   copie locale en secours quand il n'y a pas de réseau. */
const CACHE = "closer-v24";
const CORE = [
  "./",
  "index.html",
  "css/closer.css",
  "js/base.js",
  "js/vues.js",
  "js/brouillon.js",
  "js/fiche.js",
  "js/actions.js",
  "js/sync.js",
  "js/reglages.js",
  "js/demarrage.js",
  "manifest.webmanifest",
  "fonts/schibsted-grotesk.woff2",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(CORE.map((u) => c.add(new Request(u, { cache: "no-store" })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("closer-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase et le reste : jamais mis en cache

  const nav = req.mode === "navigate";
  // une seule copie par fichier, sans le « ?v=… » de la vérification de version
  const key = nav ? new URL("./", self.location).href : url.origin + url.pathname;

  e.respondWith(
    fetch(req, { cache: "no-store" })
      .then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(key).then((hit) =>
          hit || (nav ? caches.match("index.html", { ignoreSearch: true }) : undefined)
        ).then((hit) => hit || Response.error())
      )
  );
});

/* Notifications : rappels et récap du matin envoyés par la fonction Supabase « closer-push » */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Closer", {
    body: d.body || "",
    tag: d.tag || undefined,
    icon: "icon-192.png",
    badge: "icon-192.png",
    data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  // Closer déjà ouvert : on lui dit quoi montrer (pas de rechargement) ; sinon on l'ouvre sur ce lien
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ("focus" in c) { c.postMessage({ open: new URL(url).hash }); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
