// Faux client Supabase : des tables en mémoire et juste ce que closer-push utilise
// (select / insert / update / delete, eq / in / lt, single / maybeSingle).
type Row = Record<string, any>;
export const db: Record<string, Row[]> = { closer_push: [], closer_push_sent: [], closer_push_config: [], closer_items: [] };
export function reset() { for (const k in db) db[k] = []; }

const col = (r: Row, c: string) => c.startsWith("data->>") ? r.data?.[c.slice(7)] : r[c];

class Query {
  op = "select"; val: any = null; f: ((r: Row) => boolean)[] = []; one = ""; picked = false;
  constructor(public t: string) {}
  select(_c?: string) { if (!this.picked) this.op = "select"; return this; }
  insert(v: Row) { this.op = "insert"; this.val = v; this.picked = true; return this; }
  update(v: Row) { this.op = "update"; this.val = v; this.picked = true; return this; }
  delete() { this.op = "delete"; this.picked = true; return this; }
  eq(c: string, v: any) { this.f.push((r) => col(r, c) === v); return this; }
  in(c: string, v: any[]) { this.f.push((r) => v.includes(col(r, c))); return this; }
  lt(c: string, v: any) { this.f.push((r) => col(r, c) < v); return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  single() { this.one = "single"; return this; }
  run() {
    const T = db[this.t], hit = (r: Row) => this.f.every((g) => g(r));
    if (this.op === "insert") {
      const row = { sent_at: new Date().toISOString(), ...this.val };
      // clé unique de closer_push_sent : un même rappel ne s'enregistre qu'une fois
      if (this.t === "closer_push_sent" && T.some((r) => r.user_id === row.user_id && r.item_id === row.item_id && r.slot === row.slot))
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      T.push(row); return { data: null, error: null };
    }
    if (this.op === "update") { T.filter(hit).forEach((r) => Object.assign(r, this.val)); return { data: null, error: null }; }
    if (this.op === "delete") { db[this.t] = T.filter((r) => !hit(r)); return { data: null, error: null }; }
    const rows = structuredClone(T.filter(hit));
    if (this.one) return rows.length ? { data: rows[0], error: null } : { data: null, error: this.one === "single" ? { message: "aucune ligne" } : null };
    return { data: rows, error: null };
  }
  then(ok: (v: any) => any, ko?: (e: any) => any) { try { return Promise.resolve(this.run()).then(ok, ko); } catch (e) { return Promise.reject(e).then(ok, ko); } }
}
export function createClient(_url: string, _key: string) { return { from: (t: string) => new Query(t) }; }
