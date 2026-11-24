// Tests de la fonction « closer-ics » (abonnement Calendrier Apple).
// La vraie fonction est chargée telle quelle ; seuls Supabase et l'horloge sont simulés.
// Lancer depuis la racine du dépôt :  deno test --no-check --import-map=tests/push/import_map.json --allow-env tests/push/
import { db, reset } from "./faux-supabase.ts";

const RealDate = Date;
let NOW = RealDate.parse("2026-11-24T10:00:00+01:00");
class FakeDate extends RealDate {
  constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(NOW); }
  static now() { return NOW; }
}
(globalThis as any).Date = FakeDate;

let handler: (r: Request) => Promise<Response>;
Object.defineProperty(Deno, "serve", { value: (h: typeof handler) => { handler = h; return {}; }, configurable: true, writable: true });
Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "cle-serveur-test");
await import("../../supabase/functions/closer-ics/index.ts");

function eq(a: unknown, b: unknown, what: string) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${what}\n  obtenu : ${A}\n  attendu : ${B}`);
}
function ok(c: unknown, what: string) { if (!c) throw new Error(what); }

const KEY = "a".repeat(64), OTHER = "b".repeat(64);
function base() {
  reset();
  db.closer_ics.push({ user_id: "u1", token: KEY }, { user_id: "u2", token: OTHER });
}
let nid = 0;
const item = (data: Record<string, unknown>, user = "u1", deleted = false) => {
  const id = "i" + (++nid);
  db.closer_items.push({ id, user_id: user, deleted, data: { kind: "task", done: false, ...data } });
  return id;
};
const get = (cle: string) => handler(new Request("https://x/closer-ics?cle=" + cle));
async function cal(cle = KEY) {
  const r = await get(cle);
  eq(r.status, 200, "statut");
  return await r.text();
}
// les événements, lignes repliées remises bout à bout
function events(ics: string) {
  const lines = ics.replace(/\r\n /g, "").split("\r\n");
  const out: Record<string, string>[] = [];
  let cur: Record<string, string> | null = null;
  for (const l of lines) {
    if (l === "BEGIN:VEVENT") cur = {};
    else if (l === "END:VEVENT") { out.push(cur!); cur = null; }
    else if (cur) { const i = l.indexOf(":"); cur[l.slice(0, i)] = l.slice(i + 1); }
  }
  return out;
}
const sum = (ics: string) => events(ics).map((e) => e.SUMMARY);

Deno.test("clé absente, mal formée ou inconnue : 404, rien n'est lu", async () => {
  base(); item({ title: "secret", due: "2026-11-24" });
  for (const c of ["", "abc", "z".repeat(64), "c".repeat(64)]) {
    const r = await get(c);
    eq(r.status, 404, "clé « " + c.slice(0, 8) + " »");
    ok(!(await r.text()).includes("secret"), "aucun contenu");
  }
  eq((await handler(new Request("https://x/closer-ics?cle=" + KEY, { method: "POST" }))).status, 405, "POST refusé");
});

Deno.test("un vrai calendrier : en-têtes, nom, fin de ligne CRLF", async () => {
  base(); item({ title: "courses", due: "2026-11-24" });
  const r = await get(KEY);
  ok(r.headers.get("content-type")!.startsWith("text/calendar"), "type text/calendar");
  const t = await r.text();
  ok(t.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"), "début");
  ok(t.endsWith("END:VCALENDAR\r\n"), "fin");
  ok(t.includes("X-WR-CALNAME:Closer"), "nom du calendrier");
  ok(t.includes("BEGIN:VTIMEZONE\r\nTZID:Europe/Paris"), "fuseau de Paris décrit");
  ok(!/[^\r]\n/.test(t), "uniquement des CRLF");
  ok(!t.includes("VALARM"), "pas d'alerte (Closer notifie déjà)");
});

Deno.test("tâche avec heure : 30 min à l'heure de Paris ; sans heure : toute la journée", async () => {
  base();
  const a = item({ title: "appeler la banque", due: "2026-11-24", time: "18:00" });
  item({ title: "rendre le dossier", due: "2026-11-25" });
  item({ title: "tard le soir", due: "2026-11-26", time: "23:45" });
  const e = events(await cal());
  eq(e.map((x) => x.SUMMARY), ["Appeler la banque", "Rendre le dossier", "Tard le soir"], "titres, majuscule, dans l'ordre");
  eq([e[0]["DTSTART;TZID=Europe/Paris"], e[0]["DTEND;TZID=Europe/Paris"]], ["20261124T180000", "20261124T183000"], "18 h – 18 h 30");
  eq([e[1]["DTSTART;VALUE=DATE"], e[1]["DTEND;VALUE=DATE"]], ["20261125", "20261126"], "toute la journée");
  eq(e[2]["DTEND;TZID=Europe/Paris"], "20261127T001500", "passe minuit");
  eq(e[0].UID, a + "@closer", "identifiant stable");
  eq(e[0].URL, "https://maxencegayet.github.io/closer/#ouvrir/" + a, "lien vers la tâche");
});

Deno.test("seulement ses propres tâches datées, pas les supprimées, pas les trop anciennes", async () => {
  base();
  item({ title: "à moi", due: "2026-11-24" });
  item({ title: "sans date", due: "" });
  item({ title: "supprimée", due: "2026-11-24" }, "u1", true);
  item({ title: "autre compte", due: "2026-11-24" }, "u2");
  item({ kind: "daily", title: "habitude", due: "2026-11-24" });
  item({ kind: "note", title: "note", due: "2026-11-24" });
  item({ title: "il y a 14 jours", due: "2026-11-10" });
  item({ title: "il y a 15 jours", due: "2026-11-09" });
  eq(sum(await cal()), ["Il y a 14 jours", "À moi"], "compte 1");
  eq(sum(await cal(OTHER)), ["Autre compte"], "compte 2");
});

Deno.test("tâche faite : gardée avec ✓ ; en retard : à sa date", async () => {
  base();
  item({ title: "lessive", due: "2026-11-23", done: true });
  item({ title: "mail au prof", due: "2026-11-22" });
  eq(sum(await cal()), ["Mail au prof", "✓ Lessive"], "titres");
});

Deno.test("répétitions : règle du calendrier, rien pour une copie faite", async () => {
  base();
  item({ title: "a", due: "2026-11-25", rep: "day" });
  item({ title: "b", due: "2026-11-25", rep: "wdays" });
  item({ title: "c", due: "2026-11-25", rep: "week" });
  item({ title: "d", due: "2026-12-12", rep: "month" });
  item({ title: "e", due: "2026-11-30", rep: "month", repDay: 31 });
  item({ title: "f", due: "2026-10-01", rep: "week" });           // ancienne mais répétée : gardée
  item({ title: "g", due: "2026-11-24", done: true });               // copie faite d'une répétition
  const e = events(await cal()), r = Object.fromEntries(e.map((x) => [x.SUMMARY, x.RRULE || ""]));
  eq(r, {
    F: "FREQ=WEEKLY", "✓ G": "", A: "FREQ=DAILY", B: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", C: "FREQ=WEEKLY",
    E: "FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1", D: "FREQ=MONTHLY;BYMONTHDAY=12",
  }, "règles");
});

Deno.test("texte protégé et lignes repliées à 75 octets", async () => {
  base();
  item({ title: "réviser; chap. 1, 2 \\ 3", due: "2026-11-24", cat: "Devoir", subject: "Finance", note: "Ligne 1\nLigne 2 " + "é".repeat(60) });
  const t = await cal(), enc = new TextEncoder();
  for (const l of t.split("\r\n")) ok(enc.encode(l).length <= 75, "ligne trop longue : " + l);
  const e = events(t)[0];
  eq(e.SUMMARY, "Réviser\\; chap. 1\\, 2 \\\\ 3", "titre protégé");
  ok(e.DESCRIPTION.startsWith("Devoir · Finance\\n\\nLigne 1\\nLigne 2 éé"), "description : matière puis note");
  ok(e.DESCRIPTION.endsWith("é".repeat(10)), "repli sans couper les caractères");
});

Deno.test("fuseau : celui de l'appareil abonné aux notifications", async () => {
  base();
  db.closer_push.push({ endpoint: "e", user_id: "u1", tz: "America/New_York" });
  item({ title: "réunion", due: "2026-11-24", time: "09:00" });
  const t = await cal();
  ok(t.includes("DTSTART;TZID=America/New_York:20261124T090000"), "heure dans le fuseau de l'appareil");
  ok(!t.includes("BEGIN:VTIMEZONE"), "pas de description de Paris");
});

Deno.test("plus de 1000 tâches : toutes lues, page par page", async () => {
  base();
  for (let i = 0; i < 2100; i++) item({ title: "t" + i, due: "2026-12-01" });
  eq(events(await cal()).length, 2100, "nombre d'événements");
});
