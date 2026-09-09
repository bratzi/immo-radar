import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ladeBekannteListings,
  regionsLaufZeile,
  aktualisiereLastSeen,
  markiereVerschwunden,
  hebeVerschwundenAuf,
  loescheAbgelaufene,
  quelleHatLoeschhoheit,
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
  const gefragteQuellen: string[][] = [];
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
          // Bildet den source-Filter der echten Abfrage nach: Zeilen fremder
          // Quellen kommen gar nicht erst zurueck.
          in: (_spalte: string, quellen: string[]) => {
            gefragteQuellen.push([...quellen]);
            const erlaubt = zeilen.filter(
              (z) => (z as { source?: string }).source === undefined ||
                quellen.includes((z as { source: string }).source)
            );
            return {
              not: (_s: string, _p: string, _w: unknown) => ({
                range: (von: number, bis: number) =>
                  Promise.resolve({ data: erlaubt.slice(von, bis + 1), error: null }),
              }),
            };
          },
        }),
      };
    },
  };

  return { client: client as unknown as SupabaseClient, aufrufe, gefragteQuellen };
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

  /**
   * Die dritte der drei Fail-open-Stellen aus dem B-2-Entwurf. `loescheAbgelaufene`
   * filterte NICHT nach `source` und loeschte damit alles, was irgendwo eine
   * abgelaufene Karenz trug. Solange nur ZVG markiert, faellt das nicht auf --
   * gemessen am 2026-09-09 trugen genau 2 Objekte `disappeared_at`, beide von
   * ZVG. Sobald Immowelt regionsgenau markiert (Option 3), loescht dieselbe
   * Funktion die Markierten zwei Tage spaeter hart mit weg. Genau das soll
   * Option 3 aber gerade NICHT tun.
   */
  it("loescht nur Quellen mit Loeschhoheit -- eine Immowelt-Markierung ueberlebt", async () => {
    const alt = new Date("2026-08-01T00:00:00Z").toISOString();
    const { client, aufrufe } = fakeSupabase({
      zeilen: [
        { id: "zvg-1", source: "zvg-portal", disappeared_at: alt, last_seen: alt },
        { id: "iw-1", source: "immowelt", disappeared_at: alt, last_seen: alt },
      ],
    });

    const geloescht = await loescheAbgelaufene(client, new Date("2026-09-08T18:00:00Z"));

    expect(geloescht).toBe(1);
    expect(aufrufe.filter((a) => a.art === "delete").flatMap((a) => a.ids)).toEqual(["zvg-1"]);
  });

  it("fragt ausdruecklich nur die Quellen mit Loeschhoheit ab", async () => {
    // Erlaubnisliste statt Ausschlussliste: Eine neue, unbekannte Quelle wird
    // dadurch nie hart geloescht, bis jemand sie bewusst eintraegt.
    const { client, gefragteQuellen } = fakeSupabase({ zeilen: [] });
    await loescheAbgelaufene(client, new Date("2026-09-08T18:00:00Z"));
    expect(gefragteQuellen).toEqual([["zvg-portal"]]);
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

/**
 * Der Fundort muss MITGELESEN werden, sonst ist er fuer die
 * Abgangsermittlung nicht da: `partitionEinesListings` (bestand.ts)
 * beantwortet damit die Frage, ob ein Sweep ein Objekt ueberhaupt abgedeckt
 * hat. Fehlt die Spalte in der Auswahl, kaeme fuer jedes Immowelt-Objekt
 * wieder null heraus -- Immowelts externalId ist eine nackte UUID und traegt
 * die Region nicht.
 */
function fakeListings(zeilen: unknown[]) {
  const auswahlen: string[] = [];
  const client = {
    from(_tabelle: string) {
      return {
        select: (spalten: string) => {
          auswahlen.push(spalten);
          return {
            eq: (_spalte: string, _wert: unknown) => ({
              range: (von: number, bis: number) =>
                Promise.resolve({ data: zeilen.slice(von, bis + 1), error: null }),
            }),
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, auswahlen };
}

describe("ladeBekannteListings", () => {
  it("liest den gespeicherten Fundort mit", async () => {
    const { client, auswahlen } = fakeListings([
      {
        id: "iw-1",
        external_id: "e71353e6-4ef9-4162-8a4f-e680c3951de4",
        disappeared_at: null,
        fundort: "he",
      },
    ]);

    const bekannte = await ladeBekannteListings(client, "immowelt");

    expect(bekannte).toEqual([
      {
        id: "iw-1",
        externalId: "e71353e6-4ef9-4162-8a4f-e680c3951de4",
        disappearedAt: null,
        fundort: "he",
      },
    ]);
    // Ohne die Spalte in der Auswahl liefert Supabase sie nicht -- der
    // Abgleich saehe dann jedes Objekt als nicht zuzuordnen.
    expect(auswahlen[0]).toContain("fundort");
  });

  it("macht aus einer fehlenden Spalte null, nicht undefined", async () => {
    // Fail-closed und typtreu zugleich: `BekanntesListing.fundort` ist
    // `string | null`. Ein `undefined` kaeme durch die Pruefung
    // `fundort !== null` glatt hindurch und wuerde als Partition
    // zurueckgegeben -- ein gebrochener Vertrag unmittelbar vor einer
    // Loeschwache, und genau die Sorte Ueberraschung, die dieses Projekt
    // teuer bezahlt hat.
    const { client } = fakeListings([
      { id: "zvg-1", external_id: "sn-40908", disappeared_at: null },
    ]);

    const bekannte = await ladeBekannteListings(client, "zvg-portal");

    expect(bekannte[0].fundort).toBeNull();
  });
});

/**
 * Der benannte Begriff hinter der Erlaubnisliste. `ermittleMarkierungen`
 * (lib/bestand.ts) entscheidet an ihm, wieviel Beweislast eine Markierung
 * tragen muss -- deshalb muss die Liste von aussen lesbar sein, ohne dass
 * jemand sie ein zweites Mal abschreibt. Zwei Listen, die auseinanderlaufen,
 * waeren genau die Bauart, die dieses Projekt schon einmal teuer bezahlt hat.
 */
describe("quelleHatLoeschhoheit", () => {
  it("gibt zvg-portal die Loeschhoheit", () => {
    expect(quelleHatLoeschhoheit("zvg-portal")).toBe(true);
  });

  it("gibt immowelt KEINE Loeschhoheit -- Option 3 markiert, sie loescht nicht", () => {
    expect(quelleHatLoeschhoheit("immowelt")).toBe(false);
  });

  it("gibt einer unbekannten Quelle keine Loeschhoheit", () => {
    // Erlaubnisliste, nicht Ausschlussliste.
    expect(quelleHatLoeschhoheit("irgendein-neues-portal")).toBe(false);
  });
});
