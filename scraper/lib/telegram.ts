export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/** Zusaetzliche Versuche nach einem Rate-Limit (HTTP 429). */
const MAX_RATE_LIMIT_WIEDERHOLUNGEN = 2;
/** Wartezeit, wenn Telegram keinen Retry-After-Header mitschickt. */
const RATE_LIMIT_STANDARD_WARTEZEIT_MS = 2000;
/** Obergrenze, damit ein absurder Retry-After den Lauf nicht blockiert. */
const RATE_LIMIT_MAX_WARTEZEIT_MS = 30_000;

function schlafe(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wartezeitAusHeader(header: string | null, versuch: number): number {
  const sekunden = header === null ? NaN : Number.parseInt(header, 10);
  const roh = Number.isFinite(sekunden) && sekunden > 0
    ? sekunden * 1000
    : RATE_LIMIT_STANDARD_WARTEZEIT_MS * versuch;
  return Math.min(roh, RATE_LIMIT_MAX_WARTEZEIT_MS);
}

/** Telegram nimmt hoechstens 10 Medien je sendMediaGroup-Aufruf an. */
const MEDIEN_PRO_GRUPPE = 10;
/** Obergrenze je Objekt, damit ein Expose mit 40 Fotos den Chat nicht flutet. */
export const MAX_BILDER_JE_OBJEKT = 30;

/**
 * Schneidet eine Bild-URL-Liste auf das zu, was am Ende auch verschickt wird.
 *
 * WOZU: Der Deckel sass bis zum 2026-09-20 nur im Versand
 * (`teileInMediengruppen`). Die Ladeschleife kannte ihn nicht -- ein Expose
 * mit 40 Fotos wurde vollstaendig vom Immowelt-CDN geholt, um dann 30 Bilder
 * zu verschicken. Zehn Abrufe gegen eine fremde Infrastruktur fuer nichts.
 *
 * Aufgefallen ist das erst, als Immowelt `photoUrls` erstmals wirklich fuellte
 * (Detailphase, BACKLOG B6). Vorher war das Feld in der Produktion tot: ZVG
 * reicht nur `attachments` durch, Immowelt schickte eine feste leere Liste.
 *
 * `belegt` sind die Plaetze, die in derselben Mediengruppe schon vergeben
 * sind -- die Lagekarte steht vor den Fotos. Ohne diese Rechnung wuerde das
 * letzte geladene Foto beim Versand wieder verworfen.
 */
export function begrenzeBildUrls(urls: string[], belegt: number): string[] {
  return urls.slice(0, Math.max(0, MAX_BILDER_JE_OBJEKT - belegt));
}

/** Zerlegt Medien in versandfertige Gruppen (gedeckelt, siehe Konstanten). */
export function teileInMediengruppen<T>(medien: T[]): T[][] {
  const gruppen: T[][] = [];
  for (let i = 0; i < Math.min(medien.length, MAX_BILDER_JE_OBJEKT); i += MEDIEN_PRO_GRUPPE) {
    gruppen.push(medien.slice(i, i + MEDIEN_PRO_GRUPPE));
  }
  return gruppen;
}

async function telegramAufruf(
  config: TelegramConfig,
  methode: string,
  body: BodyInit,
  headers?: HeadersInit
): Promise<void> {
  const url = `https://api.telegram.org/bot${config.botToken}/${methode}`;
  for (let versuch = 1; ; versuch += 1) {
    const res = await fetch(url, { method: "POST", body, headers });
    if (res.ok) return;

    const koerper = await res.text();
    if (res.status === 429 && versuch <= MAX_RATE_LIMIT_WIEDERHOLUNGEN) {
      const wartezeit = wartezeitAusHeader(res.headers.get("retry-after"), versuch);
      console.warn(`Telegram-Rate-Limit (429) bei ${methode}, erneut in ${wartezeit} ms (Versuch ${versuch}).`);
      await schlafe(wartezeit);
      continue;
    }
    throw new Error(`Telegram-${methode} fehlgeschlagen: HTTP ${res.status} ${koerper}`);
  }
}

export interface TelegramFoto {
  bytes: Uint8Array;
  filename: string;
}

/**
 * Verschickt Objektfotos als Alben. Die Bilddaten werden bewusst selbst
 * hochgeladen statt Telegram die URL abrufen zu lassen: Telegrams Abrufer
 * scheitert am Immowelt-CDN mit WEBPAGE_CURL_FAILED (live verifiziert),
 * waehrend derselbe Abruf mit Browser-User-Agent problemlos funktioniert.
 */
export async function sendTelegramPhotos(
  config: TelegramConfig,
  fotos: TelegramFoto[],
  caption?: string
): Promise<void> {
  const gruppen = teileInMediengruppen(fotos);
  for (const [index, gruppe] of gruppen.entries()) {
    const form = new FormData();
    form.append("chat_id", config.chatId);
    const media = gruppe.map((foto, i) => {
      const feld = `foto${i}`;
      const typ = foto.filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      form.append(feld, new Blob([foto.bytes as BlobPart], { type: typ }), foto.filename);
      return {
        type: "photo",
        media: `attach://${feld}`,
        ...(index === 0 && i === 0 && caption ? { caption } : {}),
      };
    });
    form.append("media", JSON.stringify(media));
    await telegramAufruf(config, "sendMediaGroup", form);
  }
}

/** Verschickt eine bereits heruntergeladene Datei (z. B. ein ZVG-PDF) als Dokument. */
export async function sendTelegramDocument(
  config: TelegramConfig,
  datei: Uint8Array,
  dateiname: string,
  caption?: string
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", config.chatId);
  if (caption) form.append("caption", caption);
  form.append("document", new Blob([datei as BlobPart], { type: "application/pdf" }), dateiname);
  await telegramAufruf(config, "sendDocument", form);
}

/**
 * Verschickt eine Nachricht und gibt die `message_id` zurueck, die Telegram
 * bestaetigt hat -- der einzige Beleg, den eine Zeile in `notifications`
 * spaeter noch tragen kann (Abnahmekriterium D-1).
 *
 * Der Rueckgabewert ist `number | null`, nicht `number`: Ein bestaetigter
 * Versand (HTTP 2xx) darf nicht daran scheitern, dass der Antwortrumpf
 * unerwartet aussieht. HTTP 200 heiszt angenommen; die `message_id` ist ein
 * Zusatzbeleg, keine Bedingung.
 */
export async function sendTelegramMessage(
  config: TelegramConfig,
  text: string
): Promise<number | null> {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  for (let versuch = 1; ; versuch += 1) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
    });
    if (res.ok) {
      try {
        const rumpf = (await res.json()) as { result?: { message_id?: number } };
        return rumpf?.result?.message_id ?? null;
      } catch {
        return null;
      }
    }

    const koerper = await res.text();
    if (res.status === 429 && versuch <= MAX_RATE_LIMIT_WIEDERHOLUNGEN) {
      const wartezeit = wartezeitAusHeader(res.headers.get("retry-after"), versuch);
      console.warn(`Telegram-Rate-Limit (429), erneuter Versuch in ${wartezeit} ms (Versuch ${versuch}).`);
      await schlafe(wartezeit);
      continue;
    }
    throw new Error(`Telegram-Versand fehlgeschlagen: HTTP ${res.status} ${koerper}`);
  }
}
