import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Kennzahlen } from "./metrics.js";
import {
  diffVersion,
  versionInsertZeile,
  listingUpsertZeile,
  versandBeleg,
  logNotification,
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
