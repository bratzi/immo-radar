import { describe, it, expect, vi, afterEach } from "vitest";
import { formatTopTrefferMessage, formatPreisaenderungMessage, formatZvgTopTrefferMessage, teileInMediengruppen, formatAbgangMessage, formatSweepWarnungMessage, sendTelegramMessage, datenlueckeKlartext } from "./telegram.js";

const listing = {
  title: "Mehrfamilienhaus zum Kauf",
  url: "https://www.immowelt.de/expose/abc-123",
  city: "Leipzig",
  zipCode: "04109",
  priceCents: 480_000_00,
  units: 3,
};

describe("formatTopTrefferMessage", () => {
  it("enthält Ort, PLZ, Einheiten, Preis, Kennzahlen und Link", () => {
    const text = formatTopTrefferMessage(listing, {
      kaufpreisfaktor: 12.5,
      geschaetzterDscr: 1.45,
      mietQuelle: "angegeben",
    });
    expect(text).toContain("Leipzig");
    expect(text).toContain("04109");
    expect(text).toContain("3 Einheiten");
    expect(text).toContain("480.000");
    expect(text).toContain("12,5");
    expect(text).toContain("1,45");
    expect(text).toContain("https://www.immowelt.de/expose/abc-123");
  });
});

describe("formatTopTrefferMessage mit data_gaps", () => {
  it("hängt eine Warnzeile mit Klartext-Übersetzung an, wenn Angaben fehlen", () => {
    const text = formatTopTrefferMessage(
      { ...listing, dataGaps: ["units_unconfirmed"] },
      { kaufpreisfaktor: 12.5, geschaetzterDscr: 1.45, mietQuelle: "angegeben" }
    );
    expect(text).toContain("Fehlende Angaben: Einheiten nicht bestätigt");
  });

  it("hängt KEINE Warnzeile an, wenn keine Angaben fehlen", () => {
    const text = formatTopTrefferMessage(
      { ...listing, dataGaps: [] },
      { kaufpreisfaktor: 12.5, geschaetzterDscr: 1.45, mietQuelle: "angegeben" }
    );
    expect(text).not.toContain("Fehlende Angaben");
  });

  it("hängt KEINE Warnzeile an, wenn dataGaps ganz fehlt (Rückwärtskompatibilität)", () => {
    const text = formatTopTrefferMessage(listing, {
      kaufpreisfaktor: 12.5,
      geschaetzterDscr: 1.45,
      mietQuelle: "angegeben",
    });
    expect(text).not.toContain("Fehlende Angaben");
  });
});

describe("formatZvgTopTrefferMessage", () => {
  const zvgListing = {
    title: "Mehrfamilienhaus: Hugo-Haase-Straße 29, 04442 Zwenkau",
    url: "https://www.zvg-portal.de/index.php?button=showZvg&zvg_id=40908&land_abk=sn",
    city: "Zwenkau",
    zipCode: "04442",
    priceCents: 271_000_00,
    units: 3,
    dataGaps: [],
    court: "Leipzig in Sachsen",
    auctionAt: "2026-09-09T08:00:00.000Z",
    caseNumber: "0467 K 0076/2022",
  };

  it("enthält Gericht, Termin (Berlin-Zeit), Aktenzeichen und Verkehrswert", () => {
    const text = formatZvgTopTrefferMessage(zvgListing, {
      kaufpreisfaktor: 8.5,
      geschaetzterDscr: 1.6,
      mietQuelle: "geschaetzt_bundesweit",
    });
    expect(text).toContain("Leipzig in Sachsen");
    expect(text).toContain("0467 K 0076/2022");
    expect(text).toContain("271.000");
    expect(text).toContain("09.09.2026");
    expect(text).toContain("10:00");
  });

  it("verlinkt NICHT direkt auf die zvg-portal.de-Detailseite, da diese ohne eigene Sitzung nur 'error' liefert", () => {
    const text = formatZvgTopTrefferMessage(zvgListing, {
      kaufpreisfaktor: 8.5,
      geschaetzterDscr: 1.6,
      mietQuelle: "geschaetzt_bundesweit",
    });
    expect(text).not.toContain(zvgListing.url);
  });

  it("zeigt den vollstaendigen Inseratstext, damit die Seite gar nicht noetig ist", () => {
    const mitText = {
      ...zvgListing,
      rawNoticeText: [
        "Art der Versteigerung: Zwangsversteigerung zum Zwecke der Aufhebung der Gemeinschaft",
        "Grundbuch: Bergfelde Blatt 2420",
        "Objekt/Lage: Mehrfamilienhaus: Clara-Zetkin-Straße 27, 16562 Hohen Neuendorf",
        "Beschreibung: Grundstück, bebaut mit einem Mehrfamilienhaus (Baujahr um 1904, Wohnfläche 252,34 m²)",
        "Verkehrswert in €: 686.000,00 €",
        "Ort der Versteigerung: Amtsgericht Neuruppin, Karl-Marx-Straße 18a, 16816 Neuruppin, 2. OG, Saal 325",
      ].join("\n"),
    };
    const text = formatZvgTopTrefferMessage(mitText, {
      kaufpreisfaktor: 8.5,
      geschaetzterDscr: 1.6,
      mietQuelle: "geschaetzt_bundesweit",
    });
    expect(text).toContain("Baujahr um 1904");
    expect(text).toContain("Wohnfläche 252,34 m²");
    expect(text).toContain("Saal 325");
    expect(text).toContain("Zwangsversteigerung zum Zwecke der Aufhebung");
  });

  it("haengt einen funktionierenden Google-Maps-Link zur Adresse an", () => {
    const text = formatZvgTopTrefferMessage(zvgListing, {
      kaufpreisfaktor: 8.5,
      geschaetzterDscr: 1.6,
      mietQuelle: "geschaetzt_bundesweit",
    });
    expect(text).toContain("https://www.google.com/maps/search/?api=1&query=");
    expect(text).toContain("Zwenkau");
  });

  it("hängt bei fehlenden Angaben ebenfalls die Warnzeile an", () => {
    const text = formatZvgTopTrefferMessage(
      { ...zvgListing, dataGaps: ["units_unconfirmed"] },
      { kaufpreisfaktor: 8.5, geschaetzterDscr: 1.6, mietQuelle: "geschaetzt_bundesweit" }
    );
    expect(text).toContain("Fehlende Angaben: Einheiten nicht bestätigt");
  });
});

describe("formatPreisaenderungMessage", () => {
  it("enthält alten und neuen Preis sowie den Link", () => {
    const text = formatPreisaenderungMessage(listing, 500_000_00, 480_000_00);
    expect(text).toContain("500.000");
    expect(text).toContain("480.000");
    expect(text).toContain("https://www.immowelt.de/expose/abc-123");
  });

  it("ersetzt eine zvg-portal.de-URL durch den Sucheinstieg statt einen toten Direktlink", () => {
    const zvgListing = { ...listing, url: "https://www.zvg-portal.de/index.php?button=showZvg&zvg_id=40908&land_abk=sn" };
    const text = formatPreisaenderungMessage(zvgListing, 300_000_00, 280_000_00);
    expect(text).not.toContain(zvgListing.url);
    expect(text).toContain("https://www.zvg-portal.de/index.php?button=Termine%20suchen");
  });
});

describe("teileInMediengruppen", () => {
  it("fasst bis zu 10 Bilder in eine Gruppe (Telegram-Grenze)", () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://mms.immowelt.de/${i}.jpg`);
    expect(teileInMediengruppen(urls)).toHaveLength(1);
  });

  it("teilt mehr als 10 Bilder in mehrere Gruppen auf", () => {
    const urls = Array.from({ length: 27 }, (_, i) => `https://mms.immowelt.de/${i}.jpg`);
    const gruppen = teileInMediengruppen(urls);
    expect(gruppen).toHaveLength(3);
    expect(gruppen[0]).toHaveLength(10);
    expect(gruppen[2]).toHaveLength(7);
  });

  it("liefert keine Gruppe bei leerer Liste", () => {
    expect(teileInMediengruppen([])).toEqual([]);
  });

  it("deckelt die Gesamtzahl, damit ein Objekt den Chat nicht flutet", () => {
    const urls = Array.from({ length: 90 }, (_, i) => `https://mms.immowelt.de/${i}.jpg`);
    const gesamt = teileInMediengruppen(urls).flat().length;
    expect(gesamt).toBeLessThanOrEqual(30);
  });
});

describe("Nachrichten-Aufbereitung", () => {
  const zvg = {
    title: "Mehrfamilienhaus: Clara-Zetkin-Straße 27, 16562 Hohen Neuendorf, Bergfelde",
    url: "https://www.zvg-portal.de/index.php?button=showZvg&zvg_id=7285&land_abk=br",
    city: "Hohen Neuendorf, Bergfelde",
    zipCode: "16562",
    priceCents: 686_000_00,
    units: null,
    dataGaps: ["units_unconfirmed"],
    court: "Neuruppin in Brandenburg",
    auctionAt: "2026-09-30T07:00:00.000Z",
    caseNumber: "0007 K 0131/2025",
    rawNoticeText: [
      "Art der Versteigerung: Zwangsversteigerung zum Zwecke der Aufhebung der Gemeinschaft",
      "Grundbuch: Bergfelde Blatt 2420",
      "Objekt/Lage: Mehrfamilienhaus: Clara-Zetkin-Straße 27, 16562 Hohen Neuendorf, Bergfelde",
      "Beschreibung: Grundstück, bebaut mit einem Mehrfamilienhaus (Baujahr um 1904, Wohnfläche 252,34 m²)",
      "Ort der Versteigerung: Amtsgericht Neuruppin, Karl-Marx-Straße 18a, 16816 Neuruppin, 2. OG, Saal 325",
    ].join("\n"),
  };
  const kennzahlen = { kaufpreisfaktor: 24.5, geschaetzterDscr: 0.49, mietQuelle: "geschaetzt_bundesweit" };

  it("schreibt Zahlen deutsch mit Komma statt Punkt", () => {
    const text = formatZvgTopTrefferMessage(zvg, kennzahlen);
    expect(text).toContain("24,5");
    expect(text).toContain("0,49");
    expect(text).not.toContain("24.5");
  });

  it("uebersetzt den Mietquellen-Code in Klartext", () => {
    const text = formatZvgTopTrefferMessage(zvg, kennzahlen);
    expect(text).not.toContain("geschaetzt_bundesweit");
    expect(text).toContain("geschätzt");
  });

  it("wiederholt die Adresse nicht doppelt in Titel und Textblock", () => {
    const text = formatZvgTopTrefferMessage(zvg, kennzahlen);
    const treffer = text.split("Clara-Zetkin-Straße 27").length - 1;
    expect(treffer).toBe(1);
  });

  it("versteckt lange URLs hinter benannten Links (HTML-Modus)", () => {
    const text = formatZvgTopTrefferMessage(zvg, kennzahlen);
    expect(text).toContain('<a href="');
    expect(text).toContain("</a>");
  });

  it("maskiert HTML-Sonderzeichen aus Fremdtext, damit Telegram nicht bricht", () => {
    const text = formatZvgTopTrefferMessage(
      { ...zvg, title: "Haus <Test> & Co" },
      kennzahlen
    );
    expect(text).toContain("&lt;Test&gt;");
    expect(text).toContain("&amp;");
  });

  it("gliedert die Nachricht in Bloecke mit Leerzeilen", () => {
    const text = formatZvgTopTrefferMessage(zvg, kennzahlen);
    expect(text).toContain("\n\n");
  });

  it("zeigt den Versteigerungsort weiterhin an", () => {
    const text = formatZvgTopTrefferMessage(zvg, kennzahlen);
    expect(text).toContain("Saal 325");
  });
});

const abgangListing = {
  title: "Mehrfamilienhaus zum Kauf",
  url: "https://www.immowelt.de/expose/abc-123",
  city: "Leipzig",
  zipCode: "04109",
  priceCents: 480_000_00,
  units: 3,
};

describe("Meldeklasse in der Ueberschrift", () => {
  it("beschriftet einen top_treffer als TOP-TREFFER", () => {
    const text = formatTopTrefferMessage(
      abgangListing,
      { kaufpreisfaktor: 12.5, geschaetzterDscr: 1.45, mietQuelle: "angegeben" },
      "top_treffer"
    );
    expect(text).toContain("TOP-TREFFER");
    expect(text).not.toContain("PRÜFKANDIDAT");
  });

  it("beschriftet einen pruefkandidat als PRUEFKANDIDAT und nennt den Grund", () => {
    const text = formatTopTrefferMessage(
      abgangListing,
      { kaufpreisfaktor: 12.5, geschaetzterDscr: 1.45, mietQuelle: "geschaetzt_regional" },
      "pruefkandidat"
    );
    expect(text).toContain("PRÜFKANDIDAT");
    expect(text).toContain("geschätzten Miete");
  });

  it("beschriftet auch die ZVG-Variante nach Klasse", () => {
    const text = formatZvgTopTrefferMessage(
      {
        ...abgangListing,
        url: "https://www.zvg-portal.de/index.php?button=showZvg&zvg_id=40908&land_abk=sn",
        court: "Leipzig in Sachsen",
        auctionAt: "2026-09-09T08:00:00.000Z",
        caseNumber: "0467 K 0076/2022",
      },
      { kaufpreisfaktor: 8.5, geschaetzterDscr: 1.6, mietQuelle: "geschaetzt_bundesweit" },
      "pruefkandidat"
    );
    expect(text).toContain("PRÜFKANDIDAT");
    expect(text).toContain("Zwangsversteigerung");
  });
});

describe("formatAbgangMessage", () => {
  it("nennt Titel, Ort und den Grund des Abgangs", () => {
    const text = formatAbgangMessage(abgangListing);
    expect(text).toContain("NICHT MEHR VERFÜGBAR");
    expect(text).toContain("Mehrfamilienhaus zum Kauf");
    expect(text).toContain("04109 Leipzig");
  });

  it("maskiert HTML-Sonderzeichen im Titel", () => {
    const text = formatAbgangMessage({ ...abgangListing, title: "Haus <Sonder> & Co" });
    expect(text).toContain("&lt;Sonder&gt;");
    expect(text).toContain("&amp;");
  });
});

describe("formatSweepWarnungMessage", () => {
  it("nennt Quelle, gesehene und erwartete Menge sowie den Grund", () => {
    const text = formatSweepWarnungMessage(
      "zvg-portal",
      370,
      500,
      "Menge weicht um 26 % vom Median 500 der letzten Läufe ab."
    );
    expect(text).toContain("zvg-portal");
    expect(text).toContain("370");
    expect(text).toContain("500");
    expect(text).toContain("Löschung ausgesetzt");
  });

  it("kommt ohne Erwartungswert aus, wenn noch keine Historie vorliegt", () => {
    const text = formatSweepWarnungMessage(
      "immowelt",
      12,
      null,
      "Erst 1 von 3 nötigen Referenzläufen vorhanden."
    );
    expect(text).toContain("Referenzläufen");
    expect(text).not.toContain("null");
  });
});

/**
 * Alle 25 Meldungen des Laufs 34261364448 (2026-09-08) trugen
 * mietQuelle "geschaetzt_bundesland" und die Luecke
 * "miete_nur_bundeslandgenau". Fuer beide fehlte die Uebersetzung, also
 * stand der rohe Maschinencode in der Nachricht -- genau in der Zeile, die
 * dem Empfaenger sagen soll, wie belastbar die Miete ist.
 */
describe("Klartext fuer die Codes, die im Betrieb wirklich vorkommen", () => {
  const k = { kaufpreisfaktor: 9.3, geschaetzterDscr: 1.3, mietQuelle: "geschaetzt_bundesland" };

  it("uebersetzt die Mietquelle geschaetzt_bundesland", () => {
    const text = formatTopTrefferMessage(listing, k, "pruefkandidat");
    expect(text).not.toContain("geschaetzt_bundesland");
    expect(text).toContain("Miete geschätzt (Bundesland)");
  });

  it("uebersetzt miete_nur_bundeslandgenau", () => {
    const text = formatTopTrefferMessage(
      { ...listing, dataGaps: ["miete_nur_bundeslandgenau"] },
      k,
      "pruefkandidat"
    );
    expect(text).not.toContain("miete_nur_bundeslandgenau");
    expect(text).toContain("Miete nur bundeslandweit geschätzt");
  });

  it("uebersetzt wohnflaeche_fehlt", () => {
    const text = formatTopTrefferMessage({ ...listing, dataGaps: ["wohnflaeche_fehlt"] }, k);
    expect(text).not.toContain("wohnflaeche_fehlt");
    expect(text).toContain("Wohnfläche fehlt");
  });

  it("uebersetzt preis_miete_unvereinbar", () => {
    const text = formatTopTrefferMessage({ ...listing, dataGaps: ["preis_miete_unvereinbar"] }, k);
    expect(text).not.toContain("preis_miete_unvereinbar");
    expect(text).toContain("Preis und Miete unvereinbar");
  });
});

/**
 * Immowelt-Objekte haben seit dem Listen-Umbau grundsaetzlich keine PLZ --
 * die Ergebnisliste nennt keine. Die Ortszeile lautete deshalb in jeder
 * dieser Meldungen "📍  Jungingen" mit doppeltem Leerzeichen.
 */
describe("Ortszeile ohne PLZ", () => {
  const k = { kaufpreisfaktor: 9.3, geschaetzterDscr: 1.3, mietQuelle: "angegeben" };

  it("setzt kein fuehrendes Leerzeichen, wenn die PLZ fehlt", () => {
    const text = formatTopTrefferMessage({ ...listing, zipCode: "" }, k);
    expect(text).toContain("📍 Leipzig");
    expect(text).not.toContain("📍  ");
  });

  it("laesst die Ortszeile ganz weg, wenn weder PLZ noch Ort bekannt sind", () => {
    const text = formatTopTrefferMessage({ ...listing, zipCode: "", city: "" }, k);
    expect(text).not.toContain("📍");
  });

  it("gibt bei der Abgangsmeldung ebenfalls kein doppeltes Leerzeichen aus", () => {
    const text = formatAbgangMessage({ ...listing, zipCode: "" });
    expect(text).toContain("📍 Leipzig");
    expect(text).not.toContain("📍  ");
  });
});

describe("Kartenlink", () => {
  const k = { kaufpreisfaktor: 9.3, geschaetzterDscr: 1.3, mietQuelle: "angegeben" };

  it("laesst den Kartenlink weg, wenn es gar keine Adresse gibt", () => {
    const text = formatTopTrefferMessage({ ...listing, zipCode: "", city: "" }, k);
    expect(text).not.toContain("google.com/maps");
    expect(text).toContain("🔗 Zum Inserat");
  });
});

/**
 * Anforderung des Nutzers vom 2026-09-08: "bei allen immer Postleitzahl und
 * Bundesland mit angeben" -- fuer Pruefkandidat wie Top-Treffer.
 *
 * Gemessen ist die PLZ dabei fuer Immowelt strukturell nicht verfuegbar
 * (157 von 1862 Objekten, und die stammen alle aus dem alten Detailpfad).
 * Das Bundesland dagegen ist ueberall da. Es darf deshalb nicht still
 * fehlen, und eine fehlende PLZ muss sichtbar bleiben statt weggelassen zu
 * werden.
 */
describe("Bundesland und PLZ in jeder Meldung", () => {
  const k = { kaufpreisfaktor: 9.3, geschaetzterDscr: 1.3, mietQuelle: "angegeben" };

  it("nennt das Bundesland beim Top-Treffer", () => {
    const text = formatTopTrefferMessage({ ...listing, bundesland: "Sachsen" }, k);
    expect(text).toContain("Sachsen");
  });

  it("nennt das Bundesland beim Pruefkandidaten", () => {
    const text = formatTopTrefferMessage({ ...listing, bundesland: "Sachsen" }, k, "pruefkandidat");
    expect(text).toContain("Sachsen");
  });

  it("macht eine fehlende PLZ sichtbar, statt sie zu verschweigen", () => {
    const text = formatTopTrefferMessage(
      { ...listing, zipCode: "", bundesland: "Baden-Württemberg" },
      k
    );
    expect(text).toContain("PLZ fehlt");
  });

  it("meldet keine fehlende PLZ, wenn eine da ist", () => {
    const text = formatTopTrefferMessage({ ...listing, bundesland: "Sachsen" }, k);
    expect(text).not.toContain("PLZ fehlt");
  });
});

/**
 * Warum diese Tests existieren: Bis hierhin pruefte keine einzige Testzeile
 * im Projekt den Versand selbst -- kein Test enthielt das Wort `fetch`. Die
 * Garantie "eine Zeile in `notifications` heiszt, Telegram hat angenommen"
 * hing damit allein an der Reihenfolge zweier Anweisungen und an einem
 * Kommentar. Wer `if (res.ok)` streicht, bekaeme eine gruene Suite.
 * Abnahmekriterium D-1.
 */
describe("sendTelegramMessage", () => {
  const config = { botToken: "test-token", chatId: "42" };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const antwort = (
    status: number,
    koerper: unknown,
    kopfzeilen: Record<string, string> = {}
  ) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => kopfzeilen[name.toLowerCase()] ?? null },
    json: async () => {
      if (typeof koerper === "string") throw new SyntaxError("kein JSON");
      return koerper;
    },
    text: async () => (typeof koerper === "string" ? koerper : JSON.stringify(koerper)),
  });

  it("gibt die message_id zurueck, die Telegram bestaetigt hat", async () => {
    // Das ist der eigentliche Beleg: eine Zahl, die nur Telegram vergeben
    // kann. Ohne sie steht in der notifications-Zeile nichts, was die
    // Zustellung beweist.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => antwort(200, { ok: true, result: { message_id: 4711 } }))
    );

    await expect(sendTelegramMessage(config, "Hallo")).resolves.toBe(4711);
  });

  it("wirft bei HTTP 403, damit keine Zeile entsteht", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => antwort(403, { ok: false, error_code: 403, description: "bot blocked" }))
    );

    await expect(sendTelegramMessage(config, "Hallo")).rejects.toThrow("HTTP 403");
  });

  it("wiederholt bei 429 und gibt danach die message_id zurueck", async () => {
    vi.useFakeTimers();
    const abrufe = vi
      .fn()
      .mockResolvedValueOnce(antwort(429, { ok: false }, { "retry-after": "1" }))
      .mockResolvedValueOnce(antwort(429, { ok: false }, { "retry-after": "1" }))
      .mockResolvedValueOnce(antwort(200, { ok: true, result: { message_id: 815 } }));
    vi.stubGlobal("fetch", abrufe);

    const lauf = sendTelegramMessage(config, "Hallo");
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(lauf).resolves.toBe(815);
    expect(abrufe).toHaveBeenCalledTimes(3);
  });

  it("wirft, wenn 429 nicht aufhoert", async () => {
    vi.useFakeTimers();
    const abrufe = vi.fn(async () => antwort(429, { ok: false }, { "retry-after": "1" }));
    vi.stubGlobal("fetch", abrufe);

    const lauf = sendTelegramMessage(config, "Hallo");
    const erwartung = expect(lauf).rejects.toThrow("HTTP 429");
    await vi.advanceTimersByTimeAsync(10_000);

    await erwartung;
    expect(abrufe).toHaveBeenCalledTimes(3);
  });

  it("gibt null zurueck, wenn eine bestaetigte Antwort keinen lesbaren Rumpf hat", async () => {
    // Ein bestaetigter Versand darf nicht daran scheitern, dass der Rumpf
    // unerwartet aussieht. HTTP 200 heiszt angenommen -- die message_id ist
    // ein Zusatzbeleg, keine Bedingung.
    vi.stubGlobal("fetch", vi.fn(async () => antwort(200, "kein-json")));

    await expect(sendTelegramMessage(config, "Hallo")).resolves.toBeNull();
  });
});

describe("Altcodes tragen denselben Klartext wie ihr heutiger Name (A18-2)", () => {
  it("uebersetzt kaufpreis_unplausibel wie preis_miete_unvereinbar", () => {
    // 2 Objekte im Bestand (Messung 2026-09-15) tragen den Namen von vor der
    // A9-Umbenennung. Der Export uebersetzt, statt die Daten anzufassen.
    expect(datenlueckeKlartext("kaufpreis_unplausibel")).toBe(
      datenlueckeKlartext("preis_miete_unvereinbar")
    );
  });

  it("beschriftet mietquelle_unbekannt", () => {
    expect(datenlueckeKlartext("mietquelle_unbekannt")).not.toBe("mietquelle_unbekannt");
  });
});
