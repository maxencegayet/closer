// Closer · fonction « closer-ics » (Supabase Edge Function).
// Donne les tâches d'un compte au format calendrier (.ics), pour s'y abonner depuis
// Calendrier Apple (ou tout autre calendrier qui accepte un lien d'abonnement).
//   GET ?cle=<clé secrète>  -> le calendrier « Closer »
// La clé remplace la connexion (l'app Calendrier ne sait pas se connecter à un compte) :
// elle est créée par closer_ics_token() (supabase/calendrier.sql) et se change depuis les Réglages de Closer.
// À déployer avec « Verify JWT » désactivé : Calendrier n'envoie aucun jeton.
//
// Ce qui va dans le calendrier :
//   - chaque tâche datée, des 14 derniers jours à plus tard ;
//   - avec une heure (« Rappel à ») : un événement de 30 min ; sans heure : un événement « toute la journée » ;
//   - une tâche répétée : un seul événement avec sa règle de répétition (à partir de sa prochaine date) ;
//   - une tâche faite reste, avec « ✓ » devant le titre.
// Pas d'alerte dans les événements : Closer envoie déjà ses propres notifications.
import { createClient } from "npm:@supabase/supabase-js@2";

function serverKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return (keys.default || Object.values(keys)[0]) as string;
  } catch { return ""; }
}
const sb = createClient(Deno.env.get("SUPABASE_URL")!, serverKey());
const APP = Deno.env.get("CLOSER_APP_URL") || "https://maxencegayet.github.io/closer/";
const PAST_DAYS = 14, DURATION = 30, PAGE = 1000;

type Task = {
  kind: string; title?: string; due?: string; time?: string; done?: boolean; rep?: string; repDay?: number;
  cat?: string; subject?: string; note?: string;
};
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d\d-\d\d$/.test(s);
const isHM = (s: unknown): s is string => typeof s === "string" && /^\d\d:\d\d$/.test(s);

// date du jour dans un fuseau « AAAA-MM-JJ »
function todayIn(tz: string) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  catch { return todayIn("Europe/Paris"); }
}
function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// « 2026-11-24 » + « 18:00 » + 30 min -> « 20261124T183000 » (heure locale, sans fuseau)
function stamp(date: string, hm?: string, plus = 0) {
  if (!hm) return date.replace(/-/g, "");
  const t = new Date(`${date}T${hm}:00Z`);
  t.setUTCMinutes(t.getUTCMinutes() + plus);
  return t.toISOString().slice(0, 19).replace(/[-:]/g, "");
}
const utcStamp = (d: Date) => d.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";

// Texte d'un champ : \ ; , et retours à la ligne protégés (RFC 5545, 3.3.11)
const txt = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Lignes de 75 octets au plus, la suite commence par une espace (sans couper un caractère)
function fold(line: string) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "", n = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; n = 0; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

// Répétition de Closer -> règle du calendrier
function rrule(d: Task) {
  if (d.rep === "day") return "FREQ=DAILY";
  if (d.rep === "wdays") return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
  if (d.rep === "week") return "FREQ=WEEKLY";
  if (d.rep === "month") {
    const day = d.repDay || +d.due!.slice(8, 10);
    // le 31 (ou le 29, le 30) : dernier jour du mois quand le mois est plus court, comme dans Closer
    if (day <= 28) return "FREQ=MONTHLY;BYMONTHDAY=" + day;
    const days = []; for (let i = 28; i <= day; i++) days.push(i);
    return "FREQ=MONTHLY;BYMONTHDAY=" + days.join(",") + ";BYSETPOS=-1";
  }
  return "";
}

// Heure d'hiver et d'été de Paris (pour que les répétitions gardent la même heure toute l'année)
const VTZ_PARIS = [
  "BEGIN:VTIMEZONE", "TZID:Europe/Paris",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];

export function buildIcs(rows: { id: string; data: Task }[], tz: string, today: string, now = new Date()) {
  const from = addDays(today, -PAST_DAYS);
  const L = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Closer//Calendrier//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Closer", "X-WR-CALDESC:Tes tâches Closer", "X-WR-TIMEZONE:" + tz, "X-APPLE-CALENDAR-COLOR:#0A9A56",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
  ];
  if (tz === "Europe/Paris") L.push(...VTZ_PARIS);
  const st = utcStamp(now);
  const tasks = rows.filter((r) => r.data && r.data.kind === "task" && isDate(r.data.due))
    .sort((a, b) => a.data.due!.localeCompare(b.data.due!) || String(a.data.time || "").localeCompare(String(b.data.time || "")));
  for (const { id, data: d } of tasks) {
    const rule = !d.done ? rrule(d) : "";
    if (!rule && d.due! < from) continue;                       // trop ancienne
    const title = cap(String(d.title || "Tâche").trim() || "Tâche");
    const ev = ["BEGIN:VEVENT", "UID:" + id + "@closer", "DTSTAMP:" + st, "SUMMARY:" + txt((d.done ? "✓ " : "") + title)];
    if (isHM(d.time)) {
      const z = tz === "Europe/Paris" ? ";TZID=Europe/Paris" : ";TZID=" + tz;
      ev.push("DTSTART" + z + ":" + stamp(d.due!, d.time), "DTEND" + z + ":" + stamp(d.due!, d.time, DURATION));
    } else {
      ev.push("DTSTART;VALUE=DATE:" + stamp(d.due!), "DTEND;VALUE=DATE:" + stamp(addDays(d.due!, 1)));
    }
    if (rule) ev.push("RRULE:" + rule);
    const desc = [d.cat === "Devoir" && d.subject ? "Devoir · " + d.subject : d.cat || "", d.note ? String(d.note) : ""].filter(Boolean).join("\n\n");
    if (desc) ev.push("DESCRIPTION:" + txt(desc));
    ev.push("URL:" + APP + "#ouvrir/" + encodeURIComponent(id), "TRANSP:TRANSPARENT", "END:VEVENT");
    L.push(...ev);
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

const plain = (s: string, status: number) =>
  new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return plain("Méthode non prise en charge", 405);
  const cle = new URL(req.url).searchParams.get("cle") || "";
  if (!/^[0-9a-f]{64}$/.test(cle)) return plain("Lien de calendrier inconnu ou remplacé. Crée un nouveau lien dans les Réglages de Closer.", 404);
  const { data: k } = await sb.from("closer_ics").select("user_id").eq("token", cle).maybeSingle();
  if (!k) return plain("Lien de calendrier inconnu ou remplacé. Crée un nouveau lien dans les Réglages de Closer.", 404);
  const uid = k.user_id as string;

  // fuseau : celui de l'appareil abonné aux notifications, sinon Paris
  const { data: subs } = await sb.from("closer_push").select("tz").eq("user_id", uid);
  const tz = ((subs || [])[0]?.tz as string) || "Europe/Paris";

  // toutes les tâches du compte, par pages de 1000
  const rows: { id: string; data: Task }[] = [];
  for (let a = 0; ; a += PAGE) {
    const { data, error } = await sb.from("closer_items").select("id,data")
      .eq("user_id", uid).eq("deleted", false).eq("data->>kind", "task").range(a, a + PAGE - 1);
    if (error) { console.error("lecture", error.message); return plain("Calendrier indisponible pour le moment.", 503); }
    rows.push(...((data || []) as { id: string; data: Task }[]));
    if (!data || data.length < PAGE) break;
  }

  const body = buildIcs(rows, tz, todayIn(tz));
  return new Response(req.method === "HEAD" ? null : body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="closer.ics"',
      "Cache-Control": "no-cache",
    },
  });
});
