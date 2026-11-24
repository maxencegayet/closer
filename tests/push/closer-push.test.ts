// Tests ciblés de la fonction « closer-push » (rappels, habitudes, récap du matin).
// La vraie fonction est chargée telle quelle ; seuls Supabase, web-push et l'horloge sont simulés.
// Lancer depuis la racine du dépôt :  deno test --import-map=tests/push/import_map.json --allow-env tests/push/
import { db, reset } from "./faux-supabase.ts";
import { fail, sent } from "./faux-webpush.ts";

// --- horloge réglable : new Date() et Date.now() renvoient NOW ---
const RealDate = Date;
let NOW = 0;
class FakeDate extends RealDate {
  constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(NOW); }
  static now() { return NOW; }
}
(globalThis as any).Date = FakeDate;
// heure de Paris (UTC+1 en novembre) -> instant
const at = (local: string) => { NOW = RealDate.parse(local + ":00+01:00"); };

// --- récupérer le gestionnaire sans démarrer de serveur ---
let handler: (r: Request) => Promise<Response>;
Object.defineProperty(Deno, "serve", { value: (h: typeof handler) => { handler = h; return {}; }, configurable: true, writable: true });
Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "cle-serveur-test");
await import("../../supabase/functions/closer-push/index.ts");

const cron = () => handler(new Request("https://x/closer-push", { method: "POST" }));
const post = (b: unknown) => handler(new Request("https://x/closer-push", { method: "POST", body: JSON.stringify(b) }));

function eq(a: unknown, b: unknown, what: string) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${what}\n  obtenu : ${A}\n  attendu : ${B}`);
}
// remet tout à zéro : un utilisateur, un iPhone abonné, l'heure du matin choisie
function base(opts: { morning?: string | null; tz?: string; devices?: number } = {}) {
  reset(); sent.length = 0; for (const k in fail) delete fail[k];
  for (let i = 1; i <= (opts.devices || 1); i++)
    db.closer_push.push({ endpoint: "https://push/" + i, user_id: "u1", p256dh: "p", auth: "a", tz: opts.tz || "Europe/Paris", morning: opts.morning === undefined ? null : opts.morning, last_morning: null });
}
let nid = 0;
const item = (data: Record<string, unknown>, user = "u1", deleted = false) =>
  db.closer_items.push({ id: "i" + (++nid), user_id: user, deleted, data });
const titles = () => sent.map((s) => s.msg.title + " | " + s.msg.body);

Deno.test("GET : renvoie la clé publique, créée une seule fois", async () => {
  base(); at("2026-11-24T10:00");
  const a = await (await handler(new Request("https://x", { method: "GET" }))).json();
  const b = await (await handler(new Request("https://x", { method: "GET" }))).json();
  eq(typeof a.publicKey, "string", "clé publique");
  eq(b.publicKey, a.publicKey, "même clé au deuxième appel");
  eq(db.closer_push_config.length, 1, "une seule paire de clés");
});

Deno.test("rappel de tâche : à l'heure dite, une seule fois", async () => {
  base(); at("2026-11-24T08:00");
  item({ kind: "task", title: "appeler la banque", due: "2026-11-24", time: "08:00", done: false });
  await cron();
  eq(titles(), ["Appeler la banque | Rappel de 08:00"], "premier passage");
  at("2026-11-24T08:01"); await cron();
  eq(sent.length, 1, "pas de deuxième envoi la minute suivante");
  eq(sent[0].msg.url, "./#taches", "la notification ouvre Tâches");
});

Deno.test("rappel de tâche : rattrapé jusqu'à 1 h après, jamais avant ni plus tard", async () => {
  for (const [now, n] of [["07:59", 0], ["08:45", 1], ["09:01", 0]] as const) {
    base(); at("2026-11-24T" + now);
    item({ kind: "task", title: "courses", due: "2026-11-24", time: "08:00", done: false });
    await cron();
    eq(sent.length, n, "à " + now);
  }
});

Deno.test("rappel de tâche : rien pour une tâche faite, supprimée, d'un autre jour, sans heure ou d'un autre compte", async () => {
  base(); at("2026-11-24T08:00");
  item({ kind: "task", title: "faite", due: "2026-11-24", time: "08:00", done: true });
  item({ kind: "task", title: "supprimée", due: "2026-11-24", time: "08:00", done: false }, "u1", true);
  item({ kind: "task", title: "demain", due: "2026-11-25", time: "08:00", done: false });
  item({ kind: "task", title: "sans heure", due: "2026-11-24", done: false });
  item({ kind: "task", title: "heure mal écrite", due: "2026-11-24", time: "8h", done: false });
  item({ kind: "task", title: "autre compte", due: "2026-11-24", time: "08:00", done: false }, "u2");
  await cron();
  eq(sent.length, 0, "aucun envoi");
});

Deno.test("rappel de devoir : la matière est ajoutée", async () => {
  base(); at("2026-11-24T14:00");
  item({ kind: "task", title: "exercices", cat: "Devoir", subject: "Maths", due: "2026-11-24", time: "14:00", done: false });
  await cron();
  eq(titles(), ["Exercices | Rappel de 14:00 · Maths"], "corps du message");
});

Deno.test("habitude du jour : rappel si pas faite, avec la série en cours", async () => {
  base(); at("2026-11-24T18:00");
  item({ kind: "daily", title: "muscu", time: "18:00", lastDone: "2026-11-23", streak: 5, dones: ["2026-11-23"] });
  item({ kind: "daily", title: "lire", time: "18:00", lastDone: "2026-11-24", streak: 2, dones: ["2026-11-24"] });
  item({ kind: "daily", title: "eau", time: "18:00" });
  await cron();
  eq(titles().sort(), ["Eau | À faire aujourd'hui", "Muscu | Garde ta série de 5 jours"], "seules les habitudes pas faites");
  eq(sent[0].msg.url, "./#jour", "la notification ouvre le Jour");
  at("2026-11-24T18:30"); await cron();
  eq(sent.length, 2, "une fois par jour");
  at("2026-11-25T18:00"); await cron();
  eq(sent.length, 5, "et le lendemain, les trois (aucune encore faite)");
});

Deno.test("habitude de la semaine : rappel tant que l'objectif n'est pas atteint (semaine du lundi)", async () => {
  base(); at("2026-11-26T18:00"); // jeudi ; la semaine commence le lundi 23
  item({ kind: "weekly", title: "tennis", time: "18:00", target: 1, dones: ["2026-11-24"] });
  item({ kind: "weekly", title: "muscu", time: "18:00", target: 3, dones: ["2026-11-22", "2026-11-24"] });
  item({ kind: "weekly", title: "piscine", time: "18:00", target: 2, dones: ["2026-11-26"] });
  await cron();
  eq(titles(), ["Muscu | 1 sur 3 cette semaine"], "dimanche 22 ne compte pas ; déjà fait aujourd'hui : pas de rappel");
});

Deno.test("récap du matin : chiffres du jour et retards, une fois par jour", async () => {
  base({ morning: "08:00" }); at("2026-11-24T08:05");
  item({ kind: "task", title: "a", due: "2026-11-24", done: false });
  item({ kind: "task", title: "b", due: "2026-11-24", done: false });
  item({ kind: "task", title: "c", due: "2026-11-21", done: false });
  item({ kind: "task", title: "d", due: "2026-11-24", done: true });
  item({ kind: "task", title: "e", due: "", done: false });
  await cron();
  eq(titles(), ["Ta journée | 2 tâches pour aujourd'hui et 1 en retard."], "texte du récap");
  eq(db.closer_push[0].last_morning, "2026-11-24", "jour noté");
  at("2026-11-24T09:00"); await cron();
  eq(sent.length, 1, "pas de deuxième récap");
});

Deno.test("récap du matin : rien à dire, rien d'envoyé ; trop tard, rien non plus", async () => {
  base({ morning: "08:00" }); at("2026-11-24T08:00");
  item({ kind: "task", title: "demain", due: "2026-11-25", done: false });
  await cron();
  eq(sent.length, 0, "journée vide : pas de récap");
  base({ morning: "08:00" }); at("2026-11-24T10:01");
  item({ kind: "task", title: "a", due: "2026-11-24", done: false });
  await cron();
  eq(sent.length, 0, "plus de 2 h après l'heure choisie");
  base({ morning: null }); at("2026-11-24T08:00");
  item({ kind: "task", title: "a", due: "2026-11-24", done: false });
  await cron();
  eq(sent.length, 0, "récap désactivé");
});

Deno.test("fuseau horaire de l'appareil respecté", async () => {
  base({ tz: "America/New_York" }); at("2026-11-24T14:00"); // 8 h à New York
  item({ kind: "task", title: "réveil", due: "2026-11-24", time: "08:00", done: false });
  await cron();
  eq(sent.length, 1, "8 h à New York = 14 h à Paris");
});

Deno.test("plusieurs appareils : chacun reçoit le rappel ; un appareil désabonné est retiré", async () => {
  base({ devices: 2 }); at("2026-11-24T08:00");
  fail["https://push/2"] = 410;
  item({ kind: "task", title: "x", due: "2026-11-24", time: "08:00", done: false });
  const r = await (await cron()).json();
  eq(sent.map((s) => s.endpoint), ["https://push/1"], "envoyé au premier");
  eq(r.sent, 1, "compte des envois");
  eq(db.closer_push.map((s) => s.endpoint), ["https://push/1"], "le second (410) est retiré");
});

Deno.test("notification d'essai : appareil connu ou inconnu", async () => {
  base(); at("2026-11-24T08:00");
  const ok = await post({ test: "https://push/1" });
  eq([ok.status, (await ok.json()).ok, sent[0]?.msg.tag], [200, true, "test"], "appareil connu");
  const ko = await post({ test: "https://push/inconnu" });
  eq(ko.status, 404, "appareil inconnu");
});

Deno.test("ménage : les envois de plus de 30 jours sont effacés", async () => {
  base(); at("2026-11-24T08:00");
  db.closer_push_sent.push({ user_id: "u1", item_id: "vieux", slot: "s", sent_at: "2026-10-01T08:00:00.000Z" });
  db.closer_push_sent.push({ user_id: "u1", item_id: "récent", slot: "s", sent_at: "2026-11-20T08:00:00.000Z" });
  await cron();
  eq(db.closer_push_sent.map((r) => r.item_id), ["récent"], "seul le récent reste");
});
