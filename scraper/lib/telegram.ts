export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface ListingSummary {
  title: string;
  url: string;
  city: string;
  zipCode: string;
  priceCents: number;
  units: number | null;
  dataGaps?: string[];
}

export interface ZvgListingSummary extends ListingSummary {
  court: string;
  auctionAt: string;
  caseNumber: string;
  /** Vollstaendige amtliche Bekanntmachung, damit die Nachricht ohne Seitenbesuch reicht. */
  rawNoticeText?: string | null;
}

export interface KennzahlenSummary {
  kaufpreisfaktor: number;
  geschaetzterDscr: number;
  mietQuelle: string;
}

const DATA_GAP_LABELS: Record<string, string> = {
  units_unconfirmed: "Einheiten nicht bestätigt",
  location_unconfirmed: "Lage (PLZ/Ort) nicht bestätigt",
};

function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE");
}

function formatDataGapsLine(dataGaps: string[] | undefined): string | null {
  if (!dataGaps || dataGaps.length === 0) return null;
  const texte = dataGaps.map((code) => DATA_GAP_LABELS[code] ?? code);
  return `⚠️ Fehlende Angaben: ${texte.join(", ")}`;
}

function formatBerlinDatumzeit(isoDatum: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDatum));
}

/**
 * zvg-portal.de prueft den Referer serverseitig: jede Detail-/Anhang-Seite
 * liefert HTTP 200 mit dem woertlichen Body "error", wenn die Anfrage nicht
 * von der eigenen Suchseite kommt (verifiziert per direktem Fetch, mit und
 * ohne Referer). Es gibt keinen Permalink/Share-Mechanismus auf der Seite --
 * ein an den Nutzer verschickter Direktlink kann daher NIE funktionieren,
 * unabhaengig vom Code hier. Einzig die Sucheinstiegsseite laedt kalt.
 */
const ZVG_SUCHE_URL = "https://www.zvg-portal.de/index.php?button=Termine%20suchen";

/** Zeilen der amtlichen Bekanntmachung, die in der Nachricht schon oben stehen. */
const NOTICE_REDUNDANTE_ZEILEN = /^(Verkehrswert in €|Termin|GeoServer|Exposee|Amtliche Bekanntmachung \(PDF\)):/;

/**
 * Gibt die amtliche Bekanntmachung als Nachrichten-Block zurueck: alles, was
 * der Nutzer sonst auf der (nicht verlinkbaren) Detailseite lesen wuerde --
 * Grundbuch, Objekt/Lage, Beschreibung, Ort der Versteigerung.
 */
function formatNoticeBlock(rawNoticeText: string | null | undefined): string | null {
  if (!rawNoticeText) return null;
  const zeilen = rawNoticeText
    .split("\n")
    .map((z) => z.trim())
    .filter((z) => z.length > 0 && !NOTICE_REDUNDANTE_ZEILEN.test(z));
  if (zeilen.length === 0) return null;
  return `📄 Aus der amtlichen Bekanntmachung:\n${zeilen.join("\n")}`;
}

/** Karten-Link zur Adresse -- funktioniert im Gegensatz zum zvg-portal-Direktlink. */
function formatKartenLink(listing: ListingSummary): string {
  const adresse = `${listing.zipCode} ${listing.city}`.trim();
  return `🗺️ Karte: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
}

function formatListingLink(url: string): string {
  if (url.includes("zvg-portal.de")) {
    return `🔎 Original-Bekanntmachung: auf ${ZVG_SUCHE_URL} nach dem Aktenzeichen suchen (die Seite sperrt Direktlinks von aussen).`;
  }
  return url;
}

export function formatTopTrefferMessage(listing: ListingSummary, k: KennzahlenSummary): string {
  return [
    `🎯 Top-Treffer: ${listing.title}`,
    `${listing.zipCode} ${listing.city} · ${listing.units ?? "?"} Einheiten · ${formatEuro(listing.priceCents)} €`,
    `Kaufpreisfaktor ${k.kaufpreisfaktor.toFixed(1)} · geschätzter DSCR ${k.geschaetzterDscr.toFixed(2)} · Miete: ${k.mietQuelle}`,
    formatDataGapsLine(listing.dataGaps),
    formatListingLink(listing.url),
  ]
    .filter((zeile): zeile is string => zeile !== null)
    .join("\n");
}

export function formatZvgTopTrefferMessage(listing: ZvgListingSummary, k: KennzahlenSummary): string {
  return [
    `🎯 Top-Treffer (Zwangsversteigerung): ${listing.title}`,
    `${listing.zipCode} ${listing.city} · ${listing.units ?? "?"} Einheiten · Verkehrswert ${formatEuro(listing.priceCents)} €`,
    `Amtsgericht ${listing.court} · Az. ${listing.caseNumber}`,
    `Termin: ${formatBerlinDatumzeit(listing.auctionAt)} Uhr`,
    `Kaufpreisfaktor ${k.kaufpreisfaktor.toFixed(1)} · geschätzter DSCR ${k.geschaetzterDscr.toFixed(2)} · Miete: ${k.mietQuelle}`,
    formatDataGapsLine(listing.dataGaps),
    formatNoticeBlock(listing.rawNoticeText),
    formatKartenLink(listing),
    formatListingLink(listing.url),
  ]
    .filter((zeile): zeile is string => zeile !== null)
    .join("\n");
}

export function formatPreisaenderungMessage(
  listing: ListingSummary,
  altPreisCents: number,
  neuPreisCents: number
): string {
  return [
    `💶 Preisänderung: ${listing.title}`,
    `${listing.zipCode} ${listing.city}`,
    `${formatEuro(altPreisCents)} € → ${formatEuro(neuPreisCents)} €`,
    formatDataGapsLine(listing.dataGaps),
    formatListingLink(listing.url),
  ]
    .filter((zeile): zeile is string => zeile !== null)
    .join("\n");
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
const MAX_BILDER_JE_OBJEKT = 30;

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
      form.append(feld, new Blob([foto.bytes as BlobPart], { type: "image/jpeg" }), foto.filename);
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

export async function sendTelegramMessage(config: TelegramConfig, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  for (let versuch = 1; ; versuch += 1) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text }),
    });
    if (res.ok) return;

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
