import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bewerteEinheiten, bewerteMietschaetzung, processCandidate, type PipelineCandidate } from "./pipeline.js";

describe("bewerteEinheiten", () => {
  it("schließt eine BESTÄTIGTE Zahl unter der Mindestgrenze aus", () => {
    const ergebnis = bewerteEinheiten(2, true);
    expect(ergebnis.ausschliessen).toBe(true);
  });

  it("schließt eine bestätigte Zahl AB der Mindestgrenze NICHT aus, ohne data_gaps", () => {
    const ergebnis = bewerteEinheiten(5, true);
    expect(ergebnis.ausschliessen).toBe(false);
    expect(ergebnis.einheitenFuerBerechnung).toBe(5);
    expect(ergebnis.dataGaps).toEqual([]);
  });

  it("schließt eine UNBEKANNTE Zahl NICHT aus, setzt die Mindestgrenze als Rechen-Untergrenze und markiert die Lücke", () => {
    const ergebnis = bewerteEinheiten(null, false);
    expect(ergebnis.ausschliessen).toBe(false);
    expect(ergebnis.einheitenFuerBerechnung).toBe(3);
    expect(ergebnis.dataGaps).toEqual(["units_unconfirmed"]);
  });

  it("schließt eine UNBESTÄTIGTE Zahl unter der Mindestgrenze NICHT aus (das ist genau der Fehler, den dieser Fix behebt)", () => {
    const ergebnis = bewerteEinheiten(2, false);
    expect(ergebnis.ausschliessen).toBe(false);
    expect(ergebnis.einheitenFuerBerechnung).toBe(2);
    expect(ergebnis.dataGaps).toEqual(["units_unconfirmed"]);
  });
});

const TELEGRAM_ATTRAPPE = { botToken: "test-token", chatId: "test-chat" };

const BASIS_KANDIDAT: PipelineCandidate = {
  source: "zvg-portal",
  externalId: "sn-40908",
  url: "https://www.zvg-portal.de/index.php?button=showZvg&zvg_id=40908&land_abk=sn",
  title: "Mehrfamilienhaus: Hugo-Haase-Straße 29",
  priceCents: 271_000_00,
  livingAreaM2: 203,
  plotAreaM2: null,
  units: 2,
  unitsConfident: false,
  yearBuilt: 1937,
  zipCode: "",
  city: "",
  rentColdMonthly: null,
  auctionAt: "2026-09-09T08:00:00.000Z",
  court: "Leipzig in Sachsen",
  caseNumber: "0467 K 0076/2022",
  rawNoticeText: "Objekt/Lage: Hugo-Haase-Straße 29",
};

/**
 * Minimaler Supabase-Ersatz: liefert eine feste listing-id und eine
 * Vorgängerversion, die identisch zum Kandidaten ist -- damit gilt
 * changed=false und es wird garantiert kein Telegram-Versand ausgelöst.
 */
function supabaseAttrappe(gesammelteVersionen: Record<string, unknown>[]): SupabaseClient {
  const vorherigeVersion = {
    price_cents: BASIS_KANDIDAT.priceCents,
    rent_cold_monthly_cents: null,
    units: BASIS_KANDIDAT.units,
  };
  return {
    from(tabelle: string) {
      if (tabelle === "listings") {
        return {
          upsert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: "listing-1" }, error: null }),
            }),
          }),
        };
      }
      if (tabelle === "listing_versions") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: vorherigeVersion, error: null }),
                }),
              }),
            }),
          }),
          insert: (zeile: Record<string, unknown>) => {
            gesammelteVersionen.push(zeile);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`Unerwartete Tabelle in der Attrappe: ${tabelle}`);
    },
  } as unknown as SupabaseClient;
}

describe("processCandidate — data_gaps aus Quelle und Einheitenprüfung", () => {
  it("führt sourceDataGaps der Quelle mit den Einheiten-Lücken zusammen", async () => {
    const versionen: Record<string, unknown>[] = [];
    await processCandidate(supabaseAttrappe(versionen), TELEGRAM_ATTRAPPE, {
      ...BASIS_KANDIDAT,
      sourceDataGaps: ["location_unconfirmed"],
    });
    expect(versionen).toHaveLength(1);
    expect(versionen[0].data_gaps).toEqual(["location_unconfirmed", "units_unconfirmed"]);
  });

  it("schreibt ohne sourceDataGaps weiterhin nur die Einheiten-Lücke", async () => {
    const versionen: Record<string, unknown>[] = [];
    await processCandidate(supabaseAttrappe(versionen), TELEGRAM_ATTRAPPE, BASIS_KANDIDAT);
    expect(versionen[0].data_gaps).toEqual(["units_unconfirmed"]);
  });

  it("dedupliziert, wenn die Quelle dieselbe Lücke bereits gemeldet hat", async () => {
    const versionen: Record<string, unknown>[] = [];
    await processCandidate(supabaseAttrappe(versionen), TELEGRAM_ATTRAPPE, {
      ...BASIS_KANDIDAT,
      sourceDataGaps: ["units_unconfirmed"],
    });
    expect(versionen[0].data_gaps).toEqual(["units_unconfirmed"]);
  });
});

describe("bewerteMietschaetzung", () => {
  it("meldet keine Luecke, wenn die Miete angegeben war", () => {
    expect(bewerteMietschaetzung("angegeben", 60)).toEqual([]);
  });

  it("meldet keine Luecke bei plausibler geschaetzter Rendite", () => {
    expect(bewerteMietschaetzung("geschaetzt_regional", 8)).toEqual([]);
    expect(bewerteMietschaetzung("geschaetzt_regional", 19.9)).toEqual([]);
  });

  it("meldet eine Luecke, wenn die geschaetzte Miete eine unmoegliche Rendite ergibt", () => {
    expect(bewerteMietschaetzung("geschaetzt_regional", 90)).toEqual(["rent_estimate_unreliable"]);
    expect(bewerteMietschaetzung("geschaetzt_bundesweit", 25)).toEqual(["rent_estimate_unreliable"]);
  });

  it("meldet auch bei absurder Rendite nichts, wenn die Miete belegt ist", () => {
    expect(bewerteMietschaetzung("angegeben", 200)).toEqual([]);
  });
});

import { sollGesendetWerden } from "./pipeline.js";

describe("sollGesendetWerden", () => {
  it("sendet, wenn ein noch nie gemeldetes Objekt qualifiziert", () => {
    expect(sollGesendetWerden("top_treffer", "keine")).toBe(true);
  });

  it("sendet beim Aufstieg von pruefkandidat auf top_treffer", () => {
    expect(sollGesendetWerden("top_treffer", "pruefkandidat")).toBe(true);
  });

  it("sendet NICHT, wenn die Klasse gleich bleibt", () => {
    expect(sollGesendetWerden("top_treffer", "top_treffer")).toBe(false);
  });

  it("sendet NICHT, wenn das Objekt gar nicht qualifiziert", () => {
    expect(sollGesendetWerden("keine", "keine")).toBe(false);
  });

  it("sendet NICHT beim Abstieg -- eine Rueckstufung ist keine Nachricht wert", () => {
    expect(sollGesendetWerden("pruefkandidat", "top_treffer")).toBe(false);
  });
});
