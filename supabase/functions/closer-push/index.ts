// Closer · fonction « closer-push » (Supabase Edge Function).
// Appelée chaque minute par pg_cron. Envoie :
//   - les rappels des tâches qui ont une heure (le jour J, à l'heure dite, une seule fois) ;
//   - les rappels des habitudes qui ont une heure (chaque jour où elles ne sont pas encore faites) ;
//   - le récap du matin et le récap du soir (ce qui est prévu demain), aux heures choisies dans les Réglages de Closer.
// GET  -> renvoie la clé publique (et crée les clés au tout premier appel).
// POST {"test": "<endpoint>"} + jeton de l'utilisateur connecté -> notification d'essai à SON appareil.
// POST (pg_cron) + en-tête x-closer-cron = closer_push_config.cron_key -> envoi des rappels.
// Sécurité (26 nov.) : l'adresse de la fonction est publique ; sans la clé du cron, personne ne peut lancer
// les envois, et l'essai n'est possible que pour un appareil du compte connecté.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

// Clé serveur fournie automatiquement par Supabase (ancien ou nouveau format de clés)
function serverKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return (keys.default || Object.values(keys)[0]) as string;
  } catch { return ""; }
}
const sb = createClient(Deno.env.get("SUPABASE_URL")!, serverKey());
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Clés VAPID : créées une fois, rangées dans closer_push_config (illisible depuis les téléphones).
let CRON_KEY = "";   // clé partagée avec pg_cron (supabase/securite.sql), lue avec les clés VAPID
async function vapid() {
  let { data } = await sb.from("closer_push_config").select("public_key,private_key,cron_key").eq("id", 1).maybeSingle();
  if (!data) {
    const k = webpush.generateVAPIDKeys();
    await sb.from("closer_push_config").insert({ id: 1, public_key: k.publicKey, private_key: k.privateKey });
    ({ data } = await sb.from("closer_push_config").select("public_key,private_key,cron_key").eq("id", 1).single());
  }
  CRON_KEY = (data as { cron_key?: string }).cron_key || "";
  webpush.setVapidDetails("mailto:closer.todo.app@gmail.com", data!.public_key, data!.private_key);
  return data!.public_key as string;
}
// comparaison en temps constant (ne laisse pas deviner la clé caractère par caractère)
function same(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Date et heure locales d'un fuseau : { date: "2026-11-24", hm: "08:05" }
function local(tz: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date());
  } catch { return local("Europe/Paris"); }
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hm: `${g("hour")}:${g("minute")}` };
}
const mins = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
const isHM = (s: unknown) => typeof s === "string" && /^\d\d:\d\d$/.test(s);
// lundi de la semaine d'une date « AAAA-MM-JJ »
function monday(date: string) {
  const d = new Date(date + "T12:00:00Z"), k = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - k);
  return d.toISOString().slice(0, 10);
}

type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string; tz: string; morning: string | null; last_morning: string | null; evening?: string | null };
// lendemain d'une date « AAAA-MM-JJ »
function nextDay(date: string) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
// habitudes « certains jours » : d.days = jours prévus (1 = lundi … 7 = dimanche) ; absent = chaque jour
const isoDow = (date: string) => ((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7) + 1;
const hasDays = (d: { days?: unknown }) => Array.isArray(d.days) && d.days.length > 0 && d.days.length < 7;
const habDue = (d: { days?: number[] }, date: string) => !hasDays(d) || d.days!.includes(isoDow(date));
function prevDue(d: { days?: number[] }, date: string) {
  let x = date;
  for (let i = 0; i < 7; i++) { const t = new Date(x + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() - 1); x = t.toISOString().slice(0, 10); if (habDue(d, x)) return x; }
  return x;
}
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const short = (s: string) => (s.length > 28 ? s.slice(0, 27).trimEnd() + "…" : s);
type Msg = { title: string; body: string; tag: string; url: string };

async function send(sub: Sub, m: Msg) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(m), { TTL: 3600, urgency: "high" });
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) await sb.from("closer_push").delete().eq("endpoint", sub.endpoint); // appareil désabonné
    console.error("envoi", code, (e as Error).message);
    return false;
  }
}

// Marque un envoi ; renvoie false s'il avait déjà été fait (deux appels simultanés n'envoient qu'une fois).
async function claim(user_id: string, item_id: string, slot: string) {
  const { error } = await sb.from("closer_push_sent").insert({ user_id, item_id, slot });
  return !error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const publicKey = await vapid();
  if (req.method === "GET") return json({ publicKey });

  let body: { test?: string } = {};
  try { body = await req.json(); } catch { /* appel du cron : corps vide */ }

  // Notification d'essai : seulement pour un appareil du compte connecté (jeton de session vérifié)
  if (body.test) {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: who } = jwt ? await sb.auth.getUser(jwt) : { data: null };
    const uid = who?.user?.id;
    if (!uid) return json({ ok: false, error: "connexion requise" }, 401);
    const { data: s } = await sb.from("closer_push").select("*").eq("endpoint", body.test).eq("user_id", uid).maybeSingle();
    if (!s) return json({ ok: false, error: "appareil inconnu" }, 404);
    const ok = await send(s as Sub, { title: "Closer", body: "Les notifications fonctionnent.", tag: "test", url: "./#jour" });
    return json({ ok });
  }

  // Envoi des rappels : réservé à pg_cron, qui présente la clé partagée
  if (CRON_KEY && !same(req.headers.get("x-closer-cron") || "", CRON_KEY)) return json({ ok: false, error: "refusé" }, 401);

  const { data: subs } = await sb.from("closer_push").select("*");
  const byUser = new Map<string, Sub[]>();
  for (const s of (subs || []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);

  let sent = 0;
  for (const [uid, list] of byUser) {
    const L = local(list[0].tz || "Europe/Paris"), now = mins(L.hm);
    const { data: rows } = await sb.from("closer_items").select("id,data")
      .eq("user_id", uid).eq("deleted", false).in("data->>kind", ["task", "daily", "weekly"]);
    const all = (rows || []).filter((r) => r.data);
    const open = all.filter((r) => r.data.kind === "task" && !r.data.done);
    const habits = all.filter((r) => r.data.kind === "daily" || r.data.kind === "weekly");
    const msgs: Msg[] = [];

    // Rappels à l'heure : le jour J, dans l'heure qui suit l'heure prévue (rattrape un appel manqué)
    for (const r of open) {
      const d = r.data;
      if (d.due !== L.date || !isHM(d.time)) continue;
      const late = now - mins(d.time);
      if (late < 0 || late > 60) continue;
      if (!(await claim(uid, r.id, `${d.due} ${d.time}`))) continue;
      const t = String(d.title || "Tâche");
      msgs.push({ title: t.charAt(0).toUpperCase() + t.slice(1), body: `Rappel de ${d.time}${d.cat === "Devoir" && d.subject ? " · " + d.subject : ""}`, tag: "t-" + r.id, url: "./#ouvrir/" + encodeURIComponent(r.id) });
    }

    // Rappels des habitudes : chaque jour à l'heure dite, tant que ce n'est pas fait
    const mon = monday(L.date);
    for (const r of habits) {
      const d = r.data;
      if (!isHM(d.time)) continue;
      const late = now - mins(d.time);
      if (late < 0 || late > 60) continue;
      const dones: string[] = Array.isArray(d.dones) ? d.dones : [];
      let body = "À faire aujourd'hui";
      if (d.kind === "daily") {
        if (!habDue(d, L.date)) continue; // pas prévue aujourd'hui
        if (d.lastDone === L.date || dones.includes(L.date)) continue;
        // la série ne compte que si la dernière fois était le jour prévu précédent
        if ((d.streak || 0) > 1 && d.lastDone === prevDue(d, L.date)) body = hasDays(d) ? `Garde ta série : ${d.streak} fois de suite` : `Garde ta série de ${d.streak} jours`;
      } else {
        if (dones.includes(L.date)) continue;
        const n = dones.filter((x) => x >= mon && x <= L.date).length, target = d.target || 1;
        if (n >= target) continue;
        body = `${n} sur ${target} cette semaine`;
      }
      if (!(await claim(uid, r.id, `${L.date} ${d.time}`))) continue;
      const t = String(d.title || "Habitude");
      msgs.push({ title: t.charAt(0).toUpperCase() + t.slice(1), body, tag: "h-" + r.id, url: "./#ouvrir/" + encodeURIComponent(r.id) });
    }

    // Récap du matin : une fois par jour, à l'heure choisie (ou jusqu'à 2 h après)
    const m = list.find((s) => isHM(s.morning))?.morning;
    if (m && now >= mins(m) && now - mins(m) <= 120 && list.every((s) => s.last_morning !== L.date)) {
      await sb.from("closer_push").update({ last_morning: L.date }).eq("user_id", uid);
      const today = open.filter((r) => r.data.due === L.date).length;
      const late = open.filter((r) => typeof r.data.due === "string" && r.data.due && r.data.due < L.date).length;
      if ((today || late) && (await claim(uid, "matin", L.date))) {
        const parts: string[] = [];
        if (today) parts.push(`${today} ${today > 1 ? "tâches" : "tâche"} pour aujourd'hui`);
        if (late) parts.push(`${late} en retard`);
        msgs.push({ title: "Ta journée", body: parts.join(" et ") + ".", tag: "matin", url: "./#jour" });
      }
    }

    // Récap du soir : ce qui est prévu demain, une fois par soir, à l'heure choisie (ou jusqu'à 2 h après).
    // (colonne « evening » : si elle n'existe pas encore dans la base, il n'y a simplement pas de récap du soir)
    const ev = list.find((s) => isHM(s.evening))?.evening;
    if (ev && now >= mins(ev) && now - mins(ev) <= 120) {
      const tmw = nextDay(L.date);
      const next = open.filter((r) => r.data.due === tmw)
        .sort((a, b) => (b.data.prio ? 1 : 0) - (a.data.prio ? 1 : 0) || String(a.data.time || "99").localeCompare(String(b.data.time || "99")));
      if (next.length && (await claim(uid, "soir", L.date))) {
        const names = next.slice(0, 3).map((r) => short(capFirst(String(r.data.title || "Tâche"))));
        const rest = next.length - names.length;
        const list2 = rest > 0 ? names.join(", ") + ` et ${rest} ${rest > 1 ? "autres" : "autre"}` : names.length > 1 ? names.slice(0, -1).join(", ") + " et " + names[names.length - 1] : names[0];
        msgs.push({ title: next.length > 1 ? `Demain : ${next.length} tâches` : "Demain : 1 tâche", body: list2 + ".", tag: "soir", url: "./#jour/" + tmw });
      }
    }

    for (const msg of msgs) for (const s of list) if (await send(s, msg)) sent++;
  }

  // Ménage : on ne garde pas l'historique des envois au-delà de 30 jours
  await sb.from("closer_push_sent").delete().lt("sent_at", new Date(Date.now() - 30 * 864e5).toISOString());
  return json({ ok: true, sent });
});
