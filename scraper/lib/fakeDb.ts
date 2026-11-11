/**
 * In-Memory-Ersatz fuer den Supabase-Client: gerade genug Query-Kette
 * (select/eq/is/in/order/limit/single, upsert/update/insert) fuer
 * angebote.ts, lauf.ts und snapshot.ts. Fuer den Pipeline-Test und das
 * Pruefskript (das nie in die echte Datenbank schreibt).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Zeile = Record<string, unknown>;
type Ergebnis = { data: unknown; error: { message: string } | null };

class Abfrage implements PromiseLike<Ergebnis> {
  private filter: ((z: Zeile) => boolean)[] = [];
  private art: "select" | "update" | "upsert" | "insert" = "select";
  private nutzlast: Zeile | Zeile[] | null = null;
  private konflikt: string[] = [];
  private einzeln = false;
  private sortierung: { feld: string; auf: boolean } | null = null;
  private grenze: number | null = null;

  constructor(private db: FakeDb, private tabelle: string) {}

  select(_spalten?: string) { return this; }
  eq(feld: string, wert: unknown) { this.filter.push((z) => z[feld] === wert); return this; }
  is(feld: string, wert: unknown) { this.filter.push((z) => (z[feld] ?? null) === wert); return this; }
  in(feld: string, werte: unknown[]) { this.filter.push((z) => werte.includes(z[feld])); return this; }
  order(feld: string, opt?: { ascending?: boolean }) { this.sortierung = { feld, auf: opt?.ascending ?? true }; return this; }
  limit(n: number) { this.grenze = n; return this; }
  single() { this.einzeln = true; return this; }
  update(werte: Zeile) { this.art = "update"; this.nutzlast = werte; return this; }
  insert(werte: Zeile | Zeile[]) { this.art = "insert"; this.nutzlast = werte; return this; }
  upsert(werte: Zeile | Zeile[], opt?: { onConflict?: string }) {
    this.art = "upsert"; this.nutzlast = werte; this.konflikt = (opt?.onConflict ?? "id").split(","); return this;
  }

  private ausfuehren(): Ergebnis {
    const zeilen = this.db.tabelle(this.tabelle);
    const passt = (z: Zeile) => this.filter.every((f) => f(z));
    if (this.art === "insert" || this.art === "upsert") {
      const liste = Array.isArray(this.nutzlast) ? this.nutzlast : [this.nutzlast!];
      for (const neu of liste) {
        const alt = this.art === "upsert" ? zeilen.find((z) => this.konflikt.every((k) => z[k] === neu[k])) : undefined;
        if (alt) Object.assign(alt, neu);
        else zeilen.push({ id: this.db.neueId(), gestartet_am: this.db.jetzt().toISOString(), ...neu });
      }
      return { data: null, error: null };
    }
    if (this.art === "update") {
      for (const z of zeilen.filter(passt)) Object.assign(z, this.nutzlast);
      return { data: null, error: null };
    }
    let treffer = zeilen.filter(passt).map((z) => ({ ...z }));
    if (this.sortierung) {
      const { feld, auf } = this.sortierung;
      treffer.sort((a, b) => (String(a[feld]) < String(b[feld]) ? -1 : String(a[feld]) > String(b[feld]) ? 1 : 0) * (auf ? 1 : -1));
    }
    if (this.grenze !== null) treffer = treffer.slice(0, this.grenze);
    if (this.einzeln) return treffer.length === 1 ? { data: treffer[0], error: null } : { data: null, error: { message: `${treffer.length} Zeilen` } };
    return { data: treffer, error: null };
  }

  then<A = Ergebnis, B = never>(ok?: ((v: Ergebnis) => A | PromiseLike<A>) | null, fehler?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.ausfuehren()).then(ok, fehler);
  }
}

export class FakeDb {
  private tabellen = new Map<string, Zeile[]>();
  private zaehler = 0;
  /** Zeitquelle fuer Standardspalten (gestartet_am); in Tests austauschbar. */
  jetzt: () => Date = () => new Date();

  tabelle(name: string): Zeile[] {
    if (!this.tabellen.has(name)) this.tabellen.set(name, []);
    return this.tabellen.get(name)!;
  }
  neueId(): string { return `id-${++this.zaehler}`; }
  from(tabelle: string) { return new Abfrage(this, tabelle); }
  /** Als SupabaseClient ausgeben; nur die oben gebauten Methoden existieren. */
  alsClient(): SupabaseClient { return this as unknown as SupabaseClient; }
}
