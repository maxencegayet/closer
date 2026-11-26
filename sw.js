/* Closer : hors ligne.
   Réseau d'abord (sans cache HTTP) pour toujours avoir la dernière version,
   copie locale en secours quand il n'y a pas de réseau. */
const CACHE = "closer-v52";
const CORE = [
  "./",
  "index.html",
  "css/closer.css",
  "css/univers.css",
  "vendor/supabase-js-2.119.2.js",
  "js/tete.js",
  "js/univers.js",
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
  "apple-touch-icon.png",
  /* matières des univers : liste tenue à jour par outils/univers.py */
  /* matieres:debut */
  "matieres/lavender-clair-bloc.svg",
  "matieres/lavender-clair-carte.svg",
  "matieres/lavender-clair-fond.svg",
  "matieres/lavender-sombre-bloc.svg",
  "matieres/lavender-sombre-carte.svg",
  "matieres/lavender-sombre-fond.svg",
  "matieres/midnight-clair-bloc.svg",
  "matieres/midnight-clair-carte.svg",
  "matieres/midnight-clair-fond.svg",
  "matieres/midnight-sombre-bloc.svg",
  "matieres/midnight-sombre-carte.svg",
  "matieres/midnight-sombre-fond.svg",
  "matieres/nude-clair-bloc.svg",
  "matieres/nude-clair-carte.svg",
  "matieres/nude-clair-fond.svg",
  "matieres/nude-sombre-bloc.svg",
  "matieres/nude-sombre-carte.svg",
  "matieres/nude-sombre-fond.svg",
  "matieres/powder-clair-bloc.svg",
  "matieres/powder-clair-carte.svg",
  "matieres/powder-clair-fond.svg",
  "matieres/powder-sombre-bloc.svg",
  "matieres/powder-sombre-carte.svg",
  "matieres/powder-sombre-fond.svg",
  "matieres/rose-clair-bloc.svg",
  "matieres/rose-clair-carte.svg",
  "matieres/rose-clair-fond.svg",
  "matieres/rose-sombre-bloc.svg",
  "matieres/rose-sombre-carte.svg",
  "matieres/rose-sombre-fond.svg",
  "matieres/sage-clair-bloc.svg",
  "matieres/sage-clair-carte.svg",
  "matieres/sage-clair-fond.svg",
  "matieres/sage-sombre-bloc.svg",
  "matieres/sage-sombre-carte.svg",
  "matieres/sage-sombre-fond.svg"
  /* matieres:fin */
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
  // Closer déjà ouvert : on lui dit quoi montrer (rappel : le Jour ; récap du soir : demain) ; sinon on l'ouvre sur ce lien
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ("focus" in c) { c.postMessage({ open: new URL(url).hash }); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
