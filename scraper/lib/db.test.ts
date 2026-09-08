import { describe, it, expect } from "vitest";
import type { Kennzahlen } from "./metrics.js";
import { diffVersion, versionInsertZeile, listingUpsertZeile } from "./db.js";

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
