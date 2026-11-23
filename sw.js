/* Closer : hors ligne.
   Réseau d'abord (sans cache HTTP) pour toujours avoir la dernière version,
   copie locale en secours quand il n'y a pas de réseau. */
const CACHE = "closer-v14";
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
