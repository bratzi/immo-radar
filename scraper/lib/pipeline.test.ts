import { describe, it, expect } from "vitest";
import { FakeDb } from "./fakeDb.js";
import { verarbeiteQuelle, type PipelineDeps } from "./pipeline.js";
import { leeresAngebot, type Angebot } from "./typen.js";
import type { Abrufer, DetailErgebnis, Quelle, SweepErgebnis } from "../scrapers/quelle.js";

const JETZT = new Date("2026-11-11T12:00:00Z");
const abrufer: Abrufer = { hole: async () => ({ status: 200, html: "", url: "" }), warte: async () => {} };

/** Passt in allen Punkten: 1.200 warm, 2 Zi., 50 m2, Balkon, Muenchen. */
function passend(id: string, teil: Partial<Angebot> = {}): Angebot {
  return leeresAngebot({
    quelle: "kleinanzeigen", externalId: id, url: `https://x/${id}`, titel: `Wohnung ${id}`,
    warmmieteCents: 120_000, zimmer: 2, flaecheM2: 50, balkon: "ja", plz: "80331", ...teil,
  });
}

function fakeQuelle(
  sweep: SweepErgebnis | (() => SweepErgebnis),
  details: Record<string, Angebot | null | "gesperrt"> = {},
): Quelle & { detailAufrufe: string[]; sweepAufrufe: number } {
  const q = {
    name: "kleinanzeigen" as const, aktiv: true, detailAufrufe: [] as string[], sweepAufrufe: 0,
    async sweep() { q.sweepAufrufe++; return typeof sweep === "function" ? sweep() : sweep; },
    async ladeDetail(_ab: Abrufer, a: Angebot): Promise<DetailErgebnis> {
      q.detailAufrufe.push(a.externalId);
      const d = details[a.externalId];
      if (d === "gesperrt") return { angebot: a, sperre: "datadome" };
      if (d === undefined) return { angebot: { ...a, detailGeladen: true }, sperre: null };
      return { angebot: d, sperre: null };
    },
  };
  return q;
}

const ok = (angebote: Angebot[], vollstaendig = false): SweepErgebnis => ({ angebote, vollstaendig, status: "ok", hinweis: null });

function aufbau() {
  const db = new FakeDb();
  db.jetzt = () => JETZT;
  const deps: PipelineDeps = { sb: db.alsClient(), sweepBudgetMs: 60_000, maxDetails: 15, jetzt: JETZT };
  return { db, deps };
}

describe("verarbeiteQuelle", () => {
  it("passendes Angebot wird mit passt=ja gespeichert, Lauf ok protokolliert", async () => {
    const { db, deps } = aufbau();
    const e = await verarbeiteQuelle(deps, fakeQuelle(ok([passend("a")])), abrufer);
    expect(db.tabelle("angebote")).toHaveLength(1);
    expect(db.tabelle("angebote")[0]).toMatchObject({ external_id: "a", passt: "ja" });
    expect(e.lauf).toMatchObject({ quelle: "kleinanzeigen", gesehen: 1, passend: 1, unklar: 0, gemeldet: 0, status: "ok" });
    expect(db.tabelle("laeufe")).toHaveLength(1);
  });

  it("unklares Angebot (Balkon unbekannt) laedt Detail und wird danach ja", async () => {
    const { db, deps } = aufbau();
    const liste = passend("b", { balkon: "unbekannt" });
    const q = fakeQuelle(ok([liste]), { b: { ...liste, balkon: "ja", balkonBeleg: "Balkon", detailGeladen: true } });
    const e = await verarbeiteQuelle(deps, q, abrufer);
    expect(q.detailAufrufe).toEqual(["b"]);
    expect(db.tabelle("angebote")[0]).toMatchObject({ passt: "ja", balkon: "ja" });
    expect(e.lauf.passend).toBe(1);
  });

  it("Kaltmiete-Angebot ohne Warmmiete: Detail wird geladen, nicht auf Schaetzung vertraut", async () => {
    const { deps } = aufbau();
    const liste = passend("c", { warmmieteCents: null, kaltmieteCents: 90_000 });
    const q = fakeQuelle(ok([liste]), { c: { ...liste, warmmieteCents: 140_000, detailGeladen: true } });
    const e = await verarbeiteQuelle(deps, q, abrufer);
    expect(q.detailAufrufe).toEqual(["c"]);
    expect(e.angebote[0]).toMatchObject({ warmmieteCents: 140_000, passt: "nein" });
  });

  it("zu teuer (ohne Detailbedarf) wird nicht gespeichert und nicht nachgeladen", async () => {
    const { db, deps } = aufbau();
    const q = fakeQuelle(ok([passend("d", { warmmieteCents: 200_000 })]));
    await verarbeiteQuelle(deps, q, abrufer);
    expect(q.detailAufrufe).toEqual([]);
    expect(db.tabelle("angebote")).toHaveLength(0);
  });

  it("bekanntes Angebot, das jetzt nein ist, wird aktualisiert gespeichert", async () => {
    const { db, deps } = aufbau();
    await verarbeiteQuelle(deps, fakeQuelle(ok([passend("e")])), abrufer);
    await verarbeiteQuelle(deps, fakeQuelle(ok([passend("e", { warmmieteCents: 200_000 })])), abrufer);
    expect(db.tabelle("angebote")).toHaveLength(1);
    expect(db.tabelle("angebote")[0]).toMatchObject({ passt: "nein", warmmiete_cents: 200_000 });
  });

  it("Detail liefert null (Gesuch/Tausch): Angebot wird verworfen", async () => {
    const { db, deps } = aufbau();
    await verarbeiteQuelle(deps, fakeQuelle(ok([passend("f", { balkon: "unbekannt" })]), { f: null }), abrufer);
    expect(db.tabelle("angebote")).toHaveLength(0);
  });

  it("gesperrte Quelle: Lauf gesperrt, nichts gespeichert", async () => {
    const { db, deps } = aufbau();
    const e = await verarbeiteQuelle(deps, fakeQuelle({ angebote: [], vollstaendig: false, status: "gesperrt", hinweis: "datadome" }), abrufer);
    expect(e.lauf.status).toBe("gesperrt");
    expect(db.tabelle("angebote")).toHaveLength(0);
    expect(db.tabelle("laeufe")).toHaveLength(1);
  });

  it("Sperre beim Detail stoppt weitere Details; bisher Gesehenes wird gespeichert", async () => {
    const { db, deps } = aufbau();
    const q = fakeQuelle(ok([passend("g1", { balkon: "unbekannt" }), passend("g2", { balkon: "unbekannt" })]), { g1: "gesperrt" });
    const e = await verarbeiteQuelle(deps, q, abrufer);
    expect(q.detailAufrufe).toEqual(["g1"]);
    expect(e.lauf.status).toBe("gesperrt");
    expect(db.tabelle("angebote").map((z) => z.passt)).toEqual(["unklar", "unklar"]);
  });

  it("hoechstens maxDetails Detailabrufe je Lauf", async () => {
    const { deps } = aufbau();
    const liste = ["h1", "h2", "h3"].map((id) => passend(id, { balkon: "unbekannt" }));
    const q = fakeQuelle(ok(liste));
    await verarbeiteQuelle({ ...deps, maxDetails: 2 }, q, abrufer);
    expect(q.detailAufrufe).toEqual(["h1", "h2"]);
  });

  it("unvollstaendiger Sweep markiert nichts als verschwunden, vollstaendiger schon", async () => {
    const { db, deps } = aufbau();
    await verarbeiteQuelle(deps, fakeQuelle(ok([passend("i1"), passend("i2")])), abrufer);
    await verarbeiteQuelle(deps, fakeQuelle(ok([passend("i1")], false)), abrufer);
    expect(db.tabelle("angebote").find((z) => z.external_id === "i2")!.verschwunden_am ?? null).toBeNull();
    await verarbeiteQuelle(deps, fakeQuelle(ok([passend("i1")], true)), abrufer);
    expect(db.tabelle("angebote").find((z) => z.external_id === "i2")!.verschwunden_am).toBe(JETZT.toISOString());
  });

  it("nach einer Sperre vor 1 h: Pause, kein Abruf, kein Laufeintrag", async () => {
    const { db, deps } = aufbau();
    db.tabelle("laeufe").push({ quelle: "kleinanzeigen", status: "gesperrt", gestartet_am: new Date(JETZT.getTime() - 3600_000).toISOString() });
    const q = fakeQuelle(ok([passend("j")]));
    const e = await verarbeiteQuelle(deps, q, abrufer);
    expect(q.sweepAufrufe).toBe(0);
    expect(e.pausiertBis).toBe(new Date(JETZT.getTime() + 3600_000).toISOString());
    expect(db.tabelle("laeufe")).toHaveLength(1);
  });

  it("nach Ablauf der Pause wird wieder abgerufen", async () => {
    const { db, deps } = aufbau();
    db.tabelle("laeufe").push({ quelle: "kleinanzeigen", status: "gesperrt", gestartet_am: new Date(JETZT.getTime() - 3 * 3600_000).toISOString() });
    const q = fakeQuelle(ok([passend("k")]));
    const e = await verarbeiteQuelle(deps, q, abrufer);
    expect(q.sweepAufrufe).toBe(1);
    expect(e.pausiertBis).toBeNull();
  });

  it("dritte Sperre in Folge: Warnhinweis im Laufprotokoll (kein Telegram)", async () => {
    const { db, deps } = aufbau();
    for (const h of [30, 20]) db.tabelle("laeufe").push({ quelle: "kleinanzeigen", status: "gesperrt", gestartet_am: new Date(JETZT.getTime() - h * 3600_000).toISOString() });
    const e = await verarbeiteQuelle(deps, fakeQuelle({ angebote: [], vollstaendig: false, status: "gesperrt", hinweis: "datadome" }), abrufer);
    expect(e.lauf.hinweis).toMatch(/WARNUNG: 3 Sperren in Folge/);
  });
});
