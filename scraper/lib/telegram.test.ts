import { describe, it, expect, vi, afterEach } from "vitest";
import { teileInMediengruppen, begrenzeBildUrls, MAX_BILDER_JE_OBJEKT, sendTelegramMessage } from "./telegram.js";

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

describe("begrenzeBildUrls", () => {
  it("laedt nicht mehr Bilder, als am Ende verschickt werden koennen", () => {
    // Der Deckel sass bisher NUR im Versand (teileInMediengruppen). Die
    // Ladeschleife kannte ihn nicht und holte bei einem Expose mit 40 Fotos
    // alle 40 vom Immowelt-CDN, um dann 30 zu verschicken.
    const urls = Array.from({ length: 40 }, (_, i) => `https://example.invalid/${i}.jpg`);
    expect(begrenzeBildUrls(urls, 0)).toHaveLength(MAX_BILDER_JE_OBJEKT);
  });

  it("rechnet bereits belegte Plaetze ab", () => {
    // Die Lagekarte steht vor den Fotos in derselben Mediengruppe. Ohne diese
    // Rechnung wuerde das letzte geladene Foto beim Versand wieder verworfen.
    const urls = Array.from({ length: 40 }, (_, i) => `https://example.invalid/${i}.jpg`);
    expect(begrenzeBildUrls(urls, 1)).toHaveLength(MAX_BILDER_JE_OBJEKT - 1);
  });

  it("laesst kurze Listen unveraendert", () => {
    const urls = ["https://example.invalid/a.jpg", "https://example.invalid/b.jpg"];
    expect(begrenzeBildUrls(urls, 1)).toEqual(urls);
  });

  it("gibt nichts zurueck, wenn die Gruppe schon voll ist", () => {
    expect(begrenzeBildUrls(["https://example.invalid/a.jpg"], MAX_BILDER_JE_OBJEKT)).toEqual([]);
  });
});
