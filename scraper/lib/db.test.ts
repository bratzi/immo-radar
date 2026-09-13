import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Kennzahlen } from "./metrics.js";
import {
  diffVersion,
  versionInsertZeile,
  listingUpsertZeile,
  versandBeleg,
  logNotification,
  upsertListingOhneBewertung,
  bereitsGemeldeteListingIds,
} from "./db.js";

describe("diffVersion", () => {
  it("meldet changed=true und priceDropped=false für die allererste Version", () => {
    const result = diffVersion({
      previous: null,
      current: { priceCents: 100_000_00, rentColdMonthlyCents: 100_000, units: 3 },
    });
    expect(result.changed).toBe(true);
    expect(result.priceDropped).toBe(false);
  });

  it("meldet changed=false wenn sich nichts geändert hat", () => {
    const werte = { priceCents: 100_000_00, rentColdMonthlyCents: 100_000, units: 3 };
    const result = diffVersion({ previous: werte, current: { ...werte } });
    expect(result.changed).toBe(false);
    expect(result.priceDropped).toBe(false);
  });

  it("erkennt eine Preissenkung", () => {
    const result = diffVersion({
      previous: { priceCents: 200_000_00, rentColdMonthlyCents: 100_000, units: 3 },
      current: { priceCents: 190_000_00, rentColdMonthlyCents: 100_000, units: 3 },
    });
    expect(result.changed).toBe(true);
    expect(result.priceDropped).toBe(true);
  });

  it("erkennt eine Preiserhöhung NICHT als priceDropped", () => {
    const result = diffVersion({
      previous: { priceCents: 190_000_00, rentColdMonthlyCents: 100_000, units: 3 },
      current: { priceCents: 200_000_00, rentColdMonthlyCents: 100_000, units: 3 },
    });
    expect(result.changed).toBe(true);
    expect(result.priceDropped).toBe(false);
  });
});

describe("versionInsertZeile", () => {
  const basis = {
    source: "zvg-portal",
    externalId: "sn-40908",
    url: "https://example.test/x",
    priceCents: 271_000_00,
    rentColdMonthlyCents: null,
    rentSource: "geschaetzt_regional" as const,
    livingAreaM2: 203,
    plotAreaM2: null,
    units: 3,
    unitsConfident: true,
    yearBuilt: 1937,
    zipCode: "04442",
    city: "Zwenkau",
    bundesland: "Sachsen",
    title: "Dreifamilienwohnhaus",
    kennzahlen: { topTreffer: true } as unknown as Kennzahlen,
  };

  it("setzt die optionalen ZVG-Felder auf null, wenn sie fehlen", () => {
    const zeile = versionInsertZeile("listing-1", basis, { changed: true, priceDropped: false });
    expect(zeile.auction_at).toBeNull();
    expect(zeile.court).toBeNull();
    expect(zeile.case_number).toBeNull();
    expect(zeile.raw_notice_text).toBeNull();
    expect(zeile.data_gaps).toEqual([]);
  });

  it("uebernimmt gesetzte ZVG-Felder und data_gaps unveraendert", () => {
    const zeile = versionInsertZeile(
      "listing-1",
      {
        ...basis,
        auctionAt: "2026-09-09T08:00:00.000Z",
        court: "Leipzig in Sachsen",
        caseNumber: "0467 K 0076/2022",
        rawNoticeText: "Beschreibung: ...",
        dataGaps: ["units_unconfirmed"],
      },
      { changed: true, priceDropped: true }
    );
    expect(zeile.auction_at).toBe("2026-09-09T08:00:00.000Z");
    expect(zeile.court).toBe("Leipzig in Sachsen");
    expect(zeile.data_gaps).toEqual(["units_unconfirmed"]);
    expect(zeile.price_dropped).toBe(true);
  });
});

describe("listingUpsertZeile", () => {
  const jetzt = "2026-09-08T10:00:00.000Z";
  const basis = { source: "immowelt", externalId: "abc-123", url: "https://example.invalid/x" };

  it("schreibt den Fundort mit, wenn der Sweep ihn kennt", () => {
    // Der Fundort ist die Voraussetzung dafuer, dass Immowelt spaeter
    // regionsgenau loeschen darf: seine externalId ist eine UUID und verraet
    // den Ort nicht, anders als ZVGs "sn-40908".
    const zeile = listingUpsertZeile({ ...basis, fundort: "he" }, jetzt);
    expect(zeile.fundort).toBe("he");
  });

  it("laesst den Fundort null, wenn die Quelle ihn nicht kennt", () => {
    // null heisst "nicht zuzuordnen" -- und Unzuordenbares ist nie ein Abgang.
    const zeile = listingUpsertZeile(basis, jetzt);
    expect(zeile.fundort).toBeNull();
  });

  it("setzt disappeared_at zurueck, weil das Objekt gerade erfasst wurde", () => {
    const zeile = listingUpsertZeile(basis, jetzt);
    expect(zeile.disappeared_at).toBeNull();
    expect(zeile.last_seen).toBe(jetzt);
    expect(zeile.last_detail_at).toBe(jetzt);
  });
});

/**
 * Warum dieser Test existiert: Abnahmekriterium A-4 verlangt, dass kein
 * Objekt still aus dem Radar faellt. "Preis auf Anfrage" ist bei Immowelt
 * kein Parserfehler, sondern eine Aussage der Quelle -- das Objekt
 * existiert, nur seine Bewertung nicht. Es bekommt deshalb eine
 * listings-Zeile und KEINE listing_versions-Zeile: ein erfundener Preis
 * ginge unmittelbar in den Kaufpreisfaktor ein, und ein nullbarer Preis
 * verlangte eine Migration auf Produktionsdaten.
 */
describe("upsertListingOhneBewertung", () => {
  it("schreibt eine listings-Zeile und keine listing_versions-Zeile", async () => {
    const geschrieben: string[] = [];
    const client = {
      from(tabelle: string) {
        geschrieben.push(tabelle);
        return {
          upsert: () => Promise.resolve({ data: null, error: null }),
        };
      },
    } as unknown as SupabaseClient;

    await upsertListingOhneBewertung(client, {
      source: "immowelt",
      externalId: "abc",
      url: "https://example.invalid/expose/abc",
      fundort: "th",
    });

    expect(geschrieben).toEqual(["listings"]);
    expect(geschrieben).not.toContain("listing_versions");
  });

  it("behauptet keine Detailerfassung -- last_detail_at bleibt leer", async () => {
    // Ein last_detail_at wuerde das Objekt aus `ladeVeralteteExternalIds`
    // heraushalten: es gaelte als frisch im Detail erfasst, obwohl nie eine
    // Detailseite gelesen wurde.
    let zeile: Record<string, unknown> = {};
    const client = {
      from: () => ({
        upsert: (werte: Record<string, unknown>) => {
          zeile = werte;
          return Promise.resolve({ data: null, error: null });
        },
      }),
    } as unknown as SupabaseClient;

    await upsertListingOhneBewertung(client, {
      source: "immowelt",
      externalId: "abc",
      url: "https://example.invalid/expose/abc",
      fundort: null,
    });

    expect(zeile.last_detail_at).toBeNull();
    expect(zeile.disappeared_at).toBeNull();
    expect(zeile.last_seen).toEqual(expect.any(String));
  });
});

/**
 * Der Beleg, der eine `notifications`-Zeile von einer blossen Behauptung
 * unterscheidet: eine Zahl, die nur Telegram vergeben kann, und der Lauf, in
 * dem sie entstand. Ohne `runId` laesst sich Log gegen Datenbank nur ueber
 * sich zufaellig nicht ueberlappende Zeitfenster abgleichen (D-1).
 */
describe("versandBeleg", () => {
  it("haelt message_id und Lauf-ID fest", () => {
    expect(versandBeleg(4711, "34261364448")).toEqual({
      telegramMessageId: 4711,
      runId: "34261364448",
    });
  });

  it("traegt null statt zu raten, wenn Telegram keine message_id nannte", () => {
    expect(versandBeleg(null, "34261364448")).toMatchObject({ telegramMessageId: null });
  });

  it("traegt null als Lauf-ID ausserhalb von GitHub Actions", () => {
    expect(versandBeleg(4711, undefined)).toMatchObject({ runId: null });
  });
});

/**
 * Die Erfolgszeile im Log behauptet "Telegram gesendet". Sie darf sich nicht
 * darauf stuetzen, dass alle Aufrufer `logNotification` erst nach einem
 * bestaetigten Versand rufen -- das ist heute wahr, steht aber in einer
 * anderen Datei und kann von einem kuenftigen vierten Aufrufer gebrochen
 * werden. Belegt ist der Versand allein durch die von Telegram bestaetigte
 * `message_id` im `detail`. Fehlt sie, gibt es keine Erfolgsmeldung.
 *
 * Das ist dieselbe Regel wie in den Loeschwachen: Ein unbekannter Zustand ist
 * nie "in Ordnung".
 */
describe("logNotification — die Erfolgszeile ruht auf der bestaetigten message_id", () => {
  function protokollAttrappe(): SupabaseClient {
    return {
      from: () => ({ insert: () => Promise.resolve({ error: null }) }),
    } as unknown as SupabaseClient;
  }

  it("schreibt die Erfolgszeile, wenn eine bestaetigte message_id vorliegt", async () => {
    const zeilen: string[] = [];
    const spion = vi.spyOn(console, "log").mockImplementation((...args) => {
      zeilen.push(String(args[0]));
    });

    await logNotification(
      protokollAttrappe(),
      "listing-1",
      "pruefkandidat",
      { telegramMessageId: 4711, runId: "42" },
      "zvg-portal · sn-40908"
    );

    spion.mockRestore();
    expect(zeilen.filter((z) => z.includes("4711"))).toHaveLength(1);
  });

  it("schreibt KEINE Erfolgszeile, wenn die message_id fehlt", async () => {
    const zeilen: string[] = [];
    const spion = vi.spyOn(console, "log").mockImplementation((...args) => {
      zeilen.push(String(args[0]));
    });

    await logNotification(
      protokollAttrappe(),
      "listing-1",
      "pruefkandidat",
      { telegramMessageId: null, runId: "42" },
      "zvg-portal · sn-40908"
    );

    spion.mockRestore();
    // Kein "gesendet" ohne Beleg. Frueher stand hier "message_id=unbekannt",
    // also eine Erfolgsmeldung ohne Erfolg.
    expect(zeilen.filter((z) => z.includes("sn-40908"))).toEqual([]);
  });
});

/**
 * Ein Supabase-Doppel fuer `notifications`, das sich wie PostgREST verhaelt:
 * Es schneidet **still** ab. Keine Fehlermeldung, kein Hinweis -- nur weniger
 * Zeilen, als es gibt. Genau daran ist der Bestandsabgleich schon einmal
 * zerbrochen (A14), und `bereitsGemeldeteListingIds` fragte bis heute ohne
 * jede Obergrenze und ohne Blaetterung.
 *
 * `serverDecke` ist die Zahl, bei der der Server von sich aus abschneidet
 * (PostgREST `max-rows`). Der Fake ehrt zusaetzlich `order`/`gt`/`limit`,
 * damit eine Keyset-Blaetterung ueberhaupt durchkommen kann.
 */
function notificationsDoppel(
  zeilen: { id: string; listing_id: string; kind: string }[],
  serverDecke: number
): { client: SupabaseClient; abfragen: () => number } {
  let abfragen = 0;
  const client = {
    from(tabelle: string) {
      if (tabelle !== "notifications") throw new Error(`unerwartete Tabelle ${tabelle}`);
      let treffer = zeilen;
      let nachId: string | null = null;
      let grenze: number | null = null;
      let sortiert = false;
      const bauer: Record<string, unknown> = {
        select: () => bauer,
        in: (_spalte: string, werte: string[]) => {
          const menge = new Set(werte);
          treffer = treffer.filter((z) => menge.has(z.listing_id));
          return bauer;
        },
        order: () => {
          sortiert = true;
          return bauer;
        },
        gt: (_spalte: string, wert: string) => {
          nachId = wert;
          return bauer;
        },
        limit: (n: number) => {
          grenze = n;
          return bauer;
        },
        then: (aufloesen: (a: { data: unknown; error: unknown }) => void) => {
          abfragen += 1;
          let ergebnis = [...treffer];
          if (sortiert) ergebnis.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
          if (nachId !== null) ergebnis = ergebnis.filter((z) => z.id > nachId!);
          const decke = grenze === null ? serverDecke : Math.min(grenze, serverDecke);
          aufloesen({ data: ergebnis.slice(0, decke), error: null });
        },
      };
      return bauer;
    },
  };
  return { client: client as unknown as SupabaseClient, abfragen: () => abfragen };
}

describe("bereitsGemeldeteListingIds", () => {
  it("findet jedes gemeldete Objekt, auch wenn der Server bei 1000 Zeilen abschneidet", async () => {
    // 500 Objekte in EINEM Block, jedes mit drei Meldungen: 1.500 Zeilen.
    // Der Server gibt 1.000 heraus und schweigt ueber den Rest. Ohne
    // Blaetterung fehlen dadurch rund 167 Objekte -- und ein Objekt, das
    // faelschlich als "nie gemeldet" gilt, bekommt nie eine Abgangsmeldung
    // und wird nicht einmal als `verschwiegen` gezaehlt. Es ist fuer immer
    // stumm. Genau der Ausfallmodus, den `3f8c7d8` gerade geschlossen hat.
    const listingIds = Array.from(
      { length: 500 },
      (_, i) => `11111111-0000-0000-0000-${String(i).padStart(12, "0")}`
    );
    const zeilen = listingIds.flatMap((listingId, i) =>
      ["pruefkandidat", "preisaenderung", "pruefkandidat"].map((kind, k) => ({
        id: `22222222-0000-0000-0000-${String(i * 3 + k).padStart(12, "0")}`,
        listing_id: listingId,
        kind,
      }))
    );

    const { client } = notificationsDoppel(zeilen, 1000);
    const gefunden = await bereitsGemeldeteListingIds(client, listingIds);

    expect(gefunden.size).toBe(500);
  });

  it("blaettert nicht endlos, wenn der Block genau auf die Seitengroesse faellt", async () => {
    const listingIds = ["33333333-0000-0000-0000-000000000000"];
    const zeilen = Array.from({ length: 1000 }, (_, i) => ({
      id: `44444444-0000-0000-0000-${String(i).padStart(12, "0")}`,
      listing_id: listingIds[0],
      kind: "pruefkandidat",
    }));

    const { client, abfragen } = notificationsDoppel(zeilen, 1000);
    const gefunden = await bereitsGemeldeteListingIds(client, listingIds);

    expect(gefunden.size).toBe(1);
    // Eine volle Seite, dann eine leere -- mehr darf es nicht brauchen.
    expect(abfragen()).toBe(2);
  });

  it("zaehlt eine reine Preisaenderungsmeldung NICHT als gemeldet", async () => {
    // Festgehalten, weil der Name der Funktion mehr verspricht, als sie
    // prueft: `hoechsteKlasse` kennt nur `pruefkandidat` und `top_treffer`.
    // Ein Objekt, das ausschliesslich wegen einer Preissenkung im Chat
    // stand, gilt hier bewusst als "nie gemeldet".
    const listingId = "55555555-0000-0000-0000-000000000000";
    const { client } = notificationsDoppel(
      [{ id: "66666666-0000-0000-0000-000000000000", listing_id: listingId, kind: "preisaenderung" }],
      1000
    );

    expect((await bereitsGemeldeteListingIds(client, [listingId])).size).toBe(0);
  });
});
