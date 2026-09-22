import { describe, it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bewerteEinheiten, bewerteMietschaetzung, processCandidate, type PipelineCandidate,
  bewerteFlaechenangabe,
  bewertePreisplausibilitaet,
} from "./pipeline.js";
import { erstelleMeldebudget } from "./meldebudget.js";

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

describe("bewerteFlaechenangabe", () => {
  it("meldet eine Luecke, wenn keine Wohnflaeche vorliegt", () => {
    // Ohne Flaeche rechnet ermittleJahreskaltmiete mit 0 m² -> Miete 0 ->
    // Bruttorendite 0. Das Objekt sieht dann aus wie geprueft und schlecht,
    // obwohl es schlicht nicht beurteilbar ist. Gemessen am Bestand
    // (2026-09-08): 210 von 400 neuesten Versionen trifft das.
    expect(bewerteFlaechenangabe(null)).toEqual(["wohnflaeche_fehlt"]);
  });

  it("meldet eine Luecke auch bei 0 m²", () => {
    expect(bewerteFlaechenangabe(0)).toEqual(["wohnflaeche_fehlt"]);
  });

  it("meldet nichts, wenn eine Flaeche vorliegt", () => {
    expect(bewerteFlaechenangabe(291)).toEqual([]);
  });
});

describe("bewerteMietschaetzung -- bundeslandgenaue Miete", () => {
  it("weist die groebere Schaetzung ausdruecklich aus", () => {
    // Immowelt-Ergebnislisten nennen keine PLZ. Ein so bewertetes Objekt ist
    // nicht falsch, aber ungenauer -- und das muss dranstehen, sonst rankt das
    // Dashboard spaeter Nichtwissen wie Wissen.
    expect(bewerteMietschaetzung("geschaetzt_bundesland", 6)).toContain("miete_nur_bundeslandgenau");
  });

  it("meldet die Luecke nicht bei PLZ-genauer Schaetzung", () => {
    expect(bewerteMietschaetzung("geschaetzt_regional", 6)).not.toContain("miete_nur_bundeslandgenau");
  });

  it("meldet zusaetzlich Unglaubwuerdigkeit bei absurder Rendite", () => {
    const luecken = bewerteMietschaetzung("geschaetzt_bundesland", 45);
    expect(luecken).toContain("miete_nur_bundeslandgenau");
    expect(luecken).toContain("rent_estimate_unreliable");
  });
});

describe("bewertePreisplausibilitaet", () => {
  it("haelt einen unmoeglich niedrigen Kaufpreisfaktor als Luecke fest", () => {
    // listing 2f41102f, gemeldet am 2026-09-07: 2.840 € fuer 198,8 m²,
    // Kaufpreisfaktor 0,175. Ohne diese Luecke faellt so ein Objekt nur
    // lautlos durch die Schwellen -- und niemand sieht, dass die ZAHL kaputt
    // ist und nicht das Angebot schlecht.
    expect(bewertePreisplausibilitaet(0.175)).toEqual(["preis_miete_unvereinbar"]);
  });

  it("laesst einen echten Kaufpreisfaktor unangetastet", () => {
    expect(bewertePreisplausibilitaet(8)).toEqual([]);
    expect(bewertePreisplausibilitaet(22)).toEqual([]);
  });
});

/**
 * Die Reihenfolge "erst senden, dann protokollieren" ist die ganze Grundlage
 * dafuer, dass eine Zeile in `notifications` eine Zustellung belegt statt sie
 * zu behaupten (Abnahmekriterium D-1). Bis hierhin hing sie an zwei
 * Anweisungen und einem Kommentar: Wer `logNotification` vorzieht oder
 * `if (res.ok)` streicht, haette eine gruene Suite bekommen.
 *
 * Diese Tests stubben ausschliesslich `fetch` -- die Telegram-Schicht, die
 * Pipeline und `logNotification` laufen echt.
 */
describe("processCandidate — Reihenfolge von Versand und Protokoll", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Wie die Attrappe oben, aber mit abweichender Vorgaengerversion (also
   *  changed=true) und mit `notifications`, damit wirklich gesendet wird. */
  function meldeAttrappe(protokoll: Record<string, unknown>[]): SupabaseClient {
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
                    maybeSingle: () =>
                      Promise.resolve({
                        // Anderer, aber NIEDRIGERER Preis: changed=true und
                        // priceDropped=false. Sonst laeuft der Test ueber die
                        // Preisaenderungs-Meldung und prueft den falschen
                        // Aufrufort -- genau das ist beim ersten Entwurf
                        // passiert und erst durch die Sabotageprobe aufgefallen.
                        data: { price_cents: 100_000_00, rent_cold_monthly_cents: null, units: 2 },
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
            insert: () => Promise.resolve({ error: null }),
          };
        }
        if (tabelle === "notifications") {
          return {
            select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
            insert: (zeile: Record<string, unknown>) => {
              protokoll.push(zeile);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`Unerwartete Tabelle in der Attrappe: ${tabelle}`);
      },
    } as unknown as SupabaseClient;
  }

  const telegramAntwort = (status: number, koerper: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => koerper,
    text: async () => JSON.stringify(koerper),
  });

  /**
   * Preis so, dass Kaufpreisfaktor und DSCR die Schwellen passieren -- sonst
   * ist die Meldeklasse "keine" und es wird gar nicht gesendet.
   *
   * Und der Termin MUSS in der Zukunft liegen, relativ zur echten Uhr:
   * `bestimmeMeldeklasse` gibt bei einem gelaufenen Termin "keine" zurueck,
   * und `processCandidate` liest `jetzt` aus `new Date()`. Der feste Termin
   * aus BASIS_KANDIDAT (2026-09-09T08:00Z) lief am 2026-09-09 um 08:00 UTC
   * ab -- beide Tests dieser Gruppe wurden an diesem Vormittag rot, ohne dass
   * jemand Produktionscode angefasst hatte. Ein Test, der am Kalender haengt,
   * meldet einen Fehler, den es nicht gibt, und verdeckt den, den es gibt.
   */
  /**
   * DIE PLZ IST PFLICHT, seit die Meldesperre ab PLZ-Stufe gilt (2026-09-22).
   * Ohne sie schaetzt `ermittleJahreskaltmiete` nur bundeslandgenau, und
   * `bestimmeMeldeklasse` gibt dann "keine" zurueck -- diese vier Tests
   * pruefen die Reihenfolge von Versand und Protokoll und wuerden sonst
   * gruen sein, ohne je gesendet zu haben.
   */
  const MELDEWUERDIG: PipelineCandidate = {
    ...BASIS_KANDIDAT,
    priceCents: 150_000_00,
    zipCode: "04103",
    auctionAt: new Date(Date.now() + 30 * 24 * 3_600_000).toISOString(),
  };

  it("schreibt KEINE Zeile, wenn Telegram den Versand ablehnt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => telegramAntwort(403, { ok: false, description: "bot blocked" }))
    );
    const protokoll: Record<string, unknown>[] = [];

    await expect(
      processCandidate(meldeAttrappe(protokoll), TELEGRAM_ATTRAPPE, MELDEWUERDIG)
    ).rejects.toThrow("HTTP 403");

    // Kein Protokoll ohne Zustellung: sonst gaelte das Objekt als gemeldet
    // und der naechste Lauf holte es nie nach.
    expect(protokoll).toEqual([]);
  });

  it("legt die bestaetigte message_id in die Zeile, wenn der Versand glueckt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => telegramAntwort(200, { ok: true, result: { message_id: 4711 } }))
    );
    const protokoll: Record<string, unknown>[] = [];

    await processCandidate(meldeAttrappe(protokoll), TELEGRAM_ATTRAPPE, MELDEWUERDIG);

    expect(protokoll).toHaveLength(1);
    expect(protokoll[0].kind).toBe("pruefkandidat");
    expect(protokoll[0].detail).toMatchObject({ telegramMessageId: 4711 });
  });

  /**
   * Bis hierhin sah man im Actions-Log nur die Schlusszeile ueber die Anzahl
   * gesendeter Meldungen -- bricht ein Lauf mittendrin ab, ist nicht
   * erkennbar, welche Meldungen noch durchgingen. Die Erfolgszeile muss die
   * message_id, die Meldeklasse und eine Kennung des Objekts tragen, damit
   * sie sich im Log einer Telegram-Nachricht zuordnen laesst.
   */
  it("schreibt eine Erfolgszeile ins Log, wenn der Versand glueckt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => telegramAntwort(200, { ok: true, result: { message_id: 4711 } }))
    );
    const protokoll: Record<string, unknown>[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await processCandidate(meldeAttrappe(protokoll), TELEGRAM_ATTRAPPE, MELDEWUERDIG);

    const erfolgszeilen = logSpy.mock.calls
      .map((args) => String(args[0]))
      .filter((zeile) => zeile.includes("4711"));
    expect(erfolgszeilen).toHaveLength(1);
    expect(erfolgszeilen[0]).toContain("pruefkandidat");
    expect(erfolgszeilen[0]).toContain(MELDEWUERDIG.externalId);

    logSpy.mockRestore();
  });

  it("schreibt KEINE Erfolgszeile ins Log, wenn Telegram den Versand ablehnt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => telegramAntwort(403, { ok: false, description: "bot blocked" }))
    );
    const protokoll: Record<string, unknown>[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      processCandidate(meldeAttrappe(protokoll), TELEGRAM_ATTRAPPE, MELDEWUERDIG)
    ).rejects.toThrow("HTTP 403");

    expect(logSpy.mock.calls.some((args) => String(args[0]).includes(MELDEWUERDIG.externalId))).toBe(
      false
    );

    logSpy.mockRestore();
  });

  /**
   * Die beiden Kandidaten unterscheiden sich NUR im Ortsbezug:
   *  - ohne PLZ, aber mit Fundort "sn" -> MietQuelle geschaetzt_bundesland
   *  - mit PLZ 04103                   -> MietQuelle geschaetzt_regional
   */
  const NUR_LANDESWEIT: PipelineCandidate = { ...MELDEWUERDIG, fundort: "sn", zipCode: "" };
  const PLZ_GENAU: PipelineCandidate = { ...MELDEWUERDIG, externalId: "sn-40909" };

  /**
   * DIE MELDESPERRE AB PLZ-STUFE, am Aufrufort geprueft (2026-09-22).
   *
   * Bis zu diesem Tag stand hier das Gegenteil: eine nur landesweit
   * geschaetzte Meldung wurde ZURUECKGESTELLT und am Laufende nachgeholt
   * (Kontingent `KONTINGENT_NUR_LANDESWEIT`). Der Nutzer hat entschieden,
   * dass diese Stufe gar nicht mehr verschickt wird -- ein einziger
   * Mietwert fuer ein ganzes Bundesland traegt keine Nachricht. Damit ist
   * die Drosselung nicht mehr die Wache, sondern `bestimmeMeldeklasse`.
   *
   * Das Budget ist hier bewusst WEIT OFFEN. Bliebe die Meldung nur wegen
   * eines knappen Budgets aus, wuerde der Test die Sperre gar nicht pruefen.
   */
  it("verschickt eine nur landesweit geschaetzte Meldung ueberhaupt nicht", async () => {
    const fetchSpy = vi.fn(async () =>
      telegramAntwort(200, { ok: true, result: { message_id: 4711 } })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const budget = erstelleMeldebudget(5, 5);
    const protokoll: Record<string, unknown>[] = [];

    await processCandidate(meldeAttrappe(protokoll), TELEGRAM_ATTRAPPE, NUR_LANDESWEIT, budget);

    expect(protokoll).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    // Nicht zurueckgestellt, sondern verworfen: nichts wartet auf ein
    // Nachholen am Laufende.
    expect(budget.zurueckgestellt()).toBe(0);
    expect(budget.verbraucht()).toBe(0);

    await budget.holeNach();
    expect(protokoll).toEqual([]);
  });

  it("verschickt eine PLZ-genau geschaetzte Meldung weiterhin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => telegramAntwort(200, { ok: true, result: { message_id: 4712 } }))
    );
    const budget = erstelleMeldebudget(5, 5);
    const protokoll: Record<string, unknown>[] = [];

    await processCandidate(meldeAttrappe(protokoll), TELEGRAM_ATTRAPPE, PLZ_GENAU, budget);

    expect(protokoll).toHaveLength(1);
    expect(protokoll[0].kind).toBe("pruefkandidat");
    expect(budget.verbraucht()).toBe(1);
  });
});
