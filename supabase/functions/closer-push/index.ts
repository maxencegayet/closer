// Closer · fonction « closer-push » (Supabase Edge Function).
// Appelée chaque minute par pg_cron. Envoie :
//   - les rappels des tâches qui ont une heure (le jour J, à l'heure dite, une seule fois) ;
//   - le récap du matin, à l'heure choisie dans les Réglages de Closer.
// GET  -> renvoie la clé publique (et crée les clés au tout premier appel).
// POST {"test": "<endpoint>"} -> envoie une notification d'essai à cet appareil.
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
async function vapid() {
  let { data } = await sb.from("closer_push_config").select("public_key,private_key").eq("id", 1).maybeSingle();
  if (!data) {
    const k = webpush.generateVAPIDKeys();
    await sb.from("closer_push_config").insert({ id: 1, public_key: k.publicKey, private_key: k.privateKey });
    ({ data } = await sb.from("closer_push_config").select("public_key,private_key").eq("id", 1).single());
  }
  webpush.setVapidDetails("mailto:closer.todo.app@gmail.com", data!.public_key, data!.private_key);
  return data!.public_key as string;
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

type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string; tz: string; morning: string | null; last_morning: string | null };
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

  // Notification d'essai pour un appareil déjà abonné
  if (body.test) {
    const { data: s } = await sb.from("closer_push").select("*").eq("endpoint", body.test).maybeSingle();
    if (!s) return json({ ok: false, error: "appareil inconnu" }, 404);
    const ok = await send(s as Sub, { title: "Closer", body: "Les notifications fonctionnent.", tag: "test", url: "./#jour" });
    return json({ ok });
  }

  const { data: subs } = await sb.from("closer_push").select("*");
  const byUser = new Map<string, Sub[]>();
  for (const s of (subs || []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);

  let sent = 0;
  for (const [uid, list] of byUser) {
    const L = local(list[0].tz || "Europe/Paris"), now = mins(L.hm);
    const { data: rows } = await sb.from("closer_items").select("id,data")
      .eq("user_id", uid).eq("deleted", false).eq("data->>kind", "task");
    const open = (rows || []).filter((r) => r.data && !r.data.done);
    const msgs: Msg[] = [];

    // Rappels à l'heure : le jour J, dans l'heure qui suit l'heure prévue (rattrape un appel manqué)
    for (const r of open) {
      const d = r.data;
      if (d.due !== L.date || !isHM(d.time)) continue;
      const late = now - mins(d.time);
      if (late < 0 || late > 60) continue;
      if (!(await claim(uid, r.id, `${d.due} ${d.time}`))) continue;
      const t = String(d.title || "Tâche");
      msgs.push({ title: t.charAt(0).toUpperCase() + t.slice(1), body: `Rappel de ${d.time}${d.cat === "Devoir" && d.subject ? " · " + d.subject : ""}`, tag: "t-" + r.id, url: "./#taches" });
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

    for (const msg of msgs) for (const s of list) if (await send(s, msg)) sent++;
  }

  // Ménage : on ne garde pas l'historique des envois au-delà de 30 jours
  await sb.from("closer_push_sent").delete().lt("sent_at", new Date(Date.now() - 30 * 864e5).toISOString());
  return json({ ok: true, sent });
});
