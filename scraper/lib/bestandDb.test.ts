import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  regionsLaufZeile,
  aktualisiereLastSeen,
  markiereVerschwunden,
  hebeVerschwundenAuf,
  loescheAbgelaufene,
  ladeLetzteRegionsSweeps,
} from "./bestandDb.js";

/**
 * Warum diese Zeilen in eine EIGENE Tabelle gehen und nicht in `sweep_runs`:
 * `ladeSweepHistorie` filtert dort nur auf `source` und `vollstaendig`.
 * Regionszeilen wuerden in den Median einflieszen und genau die Wache
 * verfaelschen, die vor einer Massenloeschung schuetzt. Eine getrennte
 * Tabelle kann das strukturell nicht.
 */
describe("regionsLaufZeile", () => {
  it("haelt fest, was eine Region geliefert hat", () => {
    const zeile = regionsLaufZeile("immowelt", {
      partition: "he",
      gesehene: 2719,
      gemeldeteTreffer: 2719,
      vollstaendig: true,
    });
    expect(zeile).toMatchObject({
      source: "immowelt",
      partition: "he",
      gesehene_objekte: 2719,
      gemeldete_treffer: 2719,
      vollstaendig: true,
    });
  });

  it("protokolliert eine abgebrochene Region als unvollstaendig", () => {
    // Eine Region, die mit einer Ausnahme endete, darf spaeter nie als
    // Referenzlauf gelten -- sonst waere der Median aus Ausfaellen gebildet.
    const zeile = regionsLaufZeile("immowelt", {
      partition: "nw",
      gesehene: 0,
      gemeldeteTreffer: null,
      vollstaendig: false,
    });
    expect(zeile.vollstaendig).toBe(false);
    expect(zeile.gemeldete_treffer).toBeNull();
    expect(zeile.gesehene_objekte).toBe(0);
  });
});

/**
 * Warum diese Tests existieren: Am 2026-09-08 brach im Lauf 34230052647 der
 * ganze Bestandsabgleich fuer Immowelt mit `Bad Request` ab, weil alle IDs in
 * EINEM `.in("id", ...)` verschickt wurden. Gemessen liegt die Grenze bei der
 * URL-Laenge: 641 IDs ergeben HTTP 200, 642 ergeben HTTP 400, 1500 ergeben
 * HTTP 414. Getroffen hat es ausgerechnet `aktualisiereLastSeen` -- die
 * Wache, die verhindert, dass gesehene Objekte spaeter geloescht werden.
 * Der Bestand waechst; ohne Stueckelung reisst das kuenftig in jedem Lauf.
 */
type InAufruf = { tabelle: string; art: "update" | "delete"; ids: string[] };

function fakeSupabase(optionen: { fehlerBeimAufruf?: number; zeilen?: unknown[] } = {}) {
  const aufrufe: InAufruf[] = [];
  const zeilen = optionen.zeilen ?? [];
  let nummer = 0;

  const antwort = (tabelle: string, art: "update" | "delete") => ({
    in(_spalte: string, ids: string[]) {
      nummer += 1;
      aufrufe.push({ tabelle, art, ids: [...ids] });
      const fehler =
        optionen.fehlerBeimAufruf === nummer ? { message: "Bad Request" } : null;
      return Promise.resolve({ error: fehler });
    },
  });

  const client = {
    from(tabelle: string) {
      return {
        update: (_werte: unknown) => antwort(tabelle, "update"),
        delete: () => antwort(tabelle, "delete"),
        select: (_spalten: string) => ({
          not: (_spalte: string, _pruef: string, _wert: unknown) => ({
            range: (von: number, bis: number) =>
              Promise.resolve({ data: zeilen.slice(von, bis + 1), error: null }),
          }),
        }),
      };
    },
  };

  return { client: client as unknown as SupabaseClient, aufrufe };
}

const ids = (anzahl: number) =>
  Array.from({ length: anzahl }, (_, i) => `id-${i.toString().padStart(5, "0")}`);

const HOECHSTE_BLOCKGROESSE = 500;

describe("Stueckelung der .in()-Listen", () => {
  const faelle = [
    {
      name: "aktualisiereLastSeen",
      ruf: (client: SupabaseClient, liste: string[]) =>
        aktualisiereLastSeen(client, liste, new Date("2026-09-08T18:00:00Z")),
    },
    {
      name: "markiereVerschwunden",
      ruf: (client: SupabaseClient, liste: string[]) =>
        markiereVerschwunden(client, liste, new Date("2026-09-08T18:00:00Z")),
    },
    {
      name: "hebeVerschwundenAuf",
      ruf: (client: SupabaseClient, liste: string[]) => hebeVerschwundenAuf(client, liste),
    },
  ];

  for (const fall of faelle) {
    it(`${fall.name} verschickt 1200 IDs in Bloecken statt in einer Anfrage`, async () => {
      const { client, aufrufe } = fakeSupabase();
      const liste = ids(1200);

      await fall.ruf(client, liste);

      const groessen = aufrufe.map((aufruf) => aufruf.ids.length);
      expect(Math.max(...groessen)).toBeLessThanOrEqual(HOECHSTE_BLOCKGROESSE);
      // Keine ID darf dabei verlorengehen oder doppelt gehen.
      expect(aufrufe.flatMap((aufruf) => aufruf.ids)).toEqual(liste);
    });
  }

  it("wirft, wenn ein spaeterer Block scheitert -- der Abgleich gilt dann als gescheitert", async () => {
    // Fail-closed: Ein Teilerfolg darf nie als Erfolg durchgehen, sonst
    // gelten gesehene Objekte als nicht gesehen und werden loeschbar.
    const { client, aufrufe } = fakeSupabase({ fehlerBeimAufruf: 2 });

    await expect(
      aktualisiereLastSeen(client, ids(1200), new Date("2026-09-08T18:00:00Z"))
    ).rejects.toMatchObject({ message: "Bad Request" });

    expect(aufrufe.length).toBe(2);
  });

  it("loescheAbgelaufene loescht 1200 faellige Objekte in Bloecken", async () => {
    const alt = new Date("2026-08-01T00:00:00Z").toISOString();
    const { client, aufrufe } = fakeSupabase({
      zeilen: ids(1200).map((id) => ({ id, disappeared_at: alt, last_seen: alt })),
    });

    const geloescht = await loescheAbgelaufene(client, new Date("2026-09-08T18:00:00Z"));

    expect(geloescht).toBe(1200);
    const loeschAufrufe = aufrufe.filter((aufruf) => aufruf.art === "delete");
    expect(Math.max(...loeschAufrufe.map((aufruf) => aufruf.ids.length))).toBeLessThanOrEqual(
      HOECHSTE_BLOCKGROESSE
    );
  });

  it("schickt bei leerer Liste gar keine Anfrage", async () => {
    const { client, aufrufe } = fakeSupabase();
    await aktualisiereLastSeen(client, [], new Date("2026-09-08T18:00:00Z"));
    expect(aufrufe).toEqual([]);
  });
});

/**
 * Der Startindex der Regionsrotation kommt seit 2026-09-09 aus dieser
 * Abfrage statt aus der Wanduhr (siehe `sweepStartVersatz` in `bestand.ts`).
 * Entscheidend ist die Fehlerbehandlung: Ein `null` bedeutet "nicht gelesen"
 * und laesst den Aufrufer auf die Uhr zurueckfallen. Eine leere Map dagegen
 * bedeutet "noch nie gesweept" und startet an der ersten Region. Wer beides
 * verwechselt, friert die Abdeckung bei der ersten Region ein, sobald die
 * Abfrage einmal scheitert.
 */
function fakeRegionsHistorie(optionen: { zeilen?: unknown[]; fehler?: boolean } = {}) {
  const abfragen: { tabelle: string; source: unknown }[] = [];
  const client = {
    from(tabelle: string) {
      return {
        select: (_spalten: string) => ({
          eq: (_spalte: string, wert: unknown) => {
            abfragen.push({ tabelle, source: wert });
            return {
              order: (_spalte2: string, _opt: unknown) => ({
                limit: (_n: number) =>
                  Promise.resolve({
                    data: optionen.fehler === true ? null : (optionen.zeilen ?? []),
                    error: optionen.fehler === true ? { message: "Bad Request" } : null,
                  }),
              }),
            };
          },
        }),
      };
    },
  };
  return { client: client as unknown as SupabaseClient, abfragen };
}

describe("ladeLetzteRegionsSweeps", () => {
  it("liefert je Region den juengsten Sweep-Zeitpunkt", async () => {
    const { client, abfragen } = fakeRegionsHistorie({
      zeilen: [
        { partition: "by", started_at: "2026-09-09T09:00:00Z" },
        { partition: "nw", started_at: "2026-09-09T06:00:00Z" },
        { partition: "nw", started_at: "2026-09-07T06:00:00Z" },
      ],
    });

    const historie = await ladeLetzteRegionsSweeps(client, "immowelt");

    expect(historie).not.toBeNull();
    expect(historie!.get("nw")).toBe(Date.parse("2026-09-09T06:00:00Z"));
    expect(historie!.get("by")).toBe(Date.parse("2026-09-09T09:00:00Z"));
    expect(abfragen).toEqual([{ tabelle: "sweep_region_runs", source: "immowelt" }]);
  });

  it("liefert eine leere Map, wenn noch nie gesweept wurde", async () => {
    const { client } = fakeRegionsHistorie({ zeilen: [] });
    const historie = await ladeLetzteRegionsSweeps(client, "immowelt");
    expect(historie).toEqual(new Map());
  });

  it("liefert null, wenn die Abfrage scheitert -- nicht eine leere Map", async () => {
    const { client } = fakeRegionsHistorie({ fehler: true });
    expect(await ladeLetzteRegionsSweeps(client, "immowelt")).toBeNull();
  });
});
