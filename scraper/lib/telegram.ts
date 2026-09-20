import type { Meldeklasse } from "./meldung.js";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface ListingSummary {
  title: string;
  url: string;
  city: string;
  zipCode: string;
  /** Bundesland, aus dem Fundort bzw. der PLZ abgeleitet. Gehoert in JEDE
   *  Meldung -- ausdrueckliche Anforderung des Nutzers vom 2026-09-08. */
  bundesland?: string | null;
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

/**
 * Eine `listings`-Zeile ohne `listing_versions`-Zeile: Die Quelle hat das
 * Objekt angeboten, aber keinen verwertbaren Kaufpreis genannt. Seit
 * `ea8b731` (Immowelt) und `sdd/zvg-a4` (ZVG) erreichen solche Objekte die
 * Datenbank und fallen nach der `rent_source`-Regel auf S0
 * (Dashboard-Entwurf 3.3).
 *
 * WARUM NICHT `preis_auf_anfrage` UND `preis_unlesbar` GETRENNT: Welcher der
 * beiden Faelle vorliegt, steht NICHT in der Datenbank. Die Unterscheidung
 * trifft `ermittleLueckencodeOhnePreis` aus der Titelzeile der Ergebniskarte
 * und lebt nur in der Log-Zeile des Laufs (A13). Eine Zeile ohne Version
 * traegt sie nicht. Der Export duerfte hier also raten oder schweigen -- und
 * er raet nicht: Der Klartext nennt die gemeinsame Aussage beider Faelle und
 * behauptet keine Ursache.
 *
 * Diese Konstante ist der Code, nicht der Text -- der Text steht wie bei
 * jeder anderen Luecke in DATA_GAP_LABELS.
 */
export const LUECKE_PREIS_FEHLT = "preis_fehlt";

const DATA_GAP_LABELS: Record<string, string> = {
  [LUECKE_PREIS_FEHLT]: "Preis fehlt — die Quelle nennt keinen verwertbaren Kaufpreis",
  units_unconfirmed: "Einheiten nicht bestätigt",
  location_unconfirmed: "Lage (PLZ/Ort) nicht bestätigt",
  rent_estimate_unreliable: "Miete nicht belastbar schätzbar — Faktor und DSCR unsicher",
  // Diese drei fehlten und standen deshalb als roher Maschinencode in der
  // Nachricht -- ausgerechnet in der Zeile, die dem Empfaenger sagen soll,
  // wie belastbar die Zahlen sind. Alle 25 Meldungen des Laufs 34261364448
  // trugen "miete_nur_bundeslandgenau" im Klartext.
  miete_nur_bundeslandgenau: "Miete nur bundeslandweit geschätzt",
  wohnflaeche_fehlt: "Wohnfläche fehlt",
  preis_miete_unvereinbar: "Preis und Miete unvereinbar — eine der beiden Zahlen stimmt nicht",
  // ALTNAME, nicht doppelter Begriff: A9 hat `kaufpreis_unplausibel` in
  // `preis_miete_unvereinbar` umbenannt, weil der alte Name eine Ursache
  // behauptete, die die Messung nicht deckt. Zeilen im Bestand stammen von
  // davor (2 am 2026-09-15, 1 am 2026-09-16). Der Export uebersetzt sie,
  // statt Produktionsdaten zu aendern -- das waere ein Schreibzugriff und
  // loeste nur diese Zeilen, nicht die naechste Umbenennung.
  kaufpreis_unplausibel: "Preis und Miete unvereinbar — eine der beiden Zahlen stimmt nicht",
  // Entsteht nicht in `data_gaps`, sondern in `ranking.ts` (A18-1, geliefert
  // ueber `s0Gruende`): eine Mietquelle ausserhalb der Aufzaehlung aus
  // Entwurf 3.3.
  mietquelle_unbekannt: "Mietquelle unbekannt — die Miete ist nicht einzuordnen",
  plz_fehlt: "PLZ fehlt (Immowelt nennt sie in der Ergebnisliste nicht)",
};

/**
 * Der Klartext-Grund zu einem Lueckencode, oder der rohe Code, wenn keiner
 * hinterlegt ist.
 *
 * EINE Tabelle fuer alle Ausgabewege. Der Snapshot-Export braucht dieselben
 * Texte wie die Telegram-Meldung (Dashboard-Entwurf 3.7 verweist
 * ausdruecklich auf DATA_GAP_LABELS), und eine zweite Tabelle waere genau die
 * Dopplung, an der diese Datei schon einmal auffiel: Drei Codes fehlten hier
 * und standen als roher Maschinencode in der Nachricht -- ausgerechnet in der
 * Zeile, die dem Empfaenger sagen soll, wie belastbar die Zahlen sind.
 */
export function datenlueckeKlartext(code: string): string {
  return DATA_GAP_LABELS[code] ?? code;
}

const MIET_QUELLE_LABELS: Record<string, string> = {
  angegeben: "angegeben",
  geschaetzt_regional: "geschätzt (Region)",
  geschaetzt_bundesweit: "geschätzt (Bundesschnitt)",
  // Der im Betrieb HAEUFIGSTE Wert fehlte hier: alle 42 Treffer des Laufs
  // vom 2026-09-08 trugen "geschaetzt_bundesland", und genau dieser rohe
  // Code stand dann in der Nachricht.
  geschaetzt_bundesland: "geschätzt (Bundesland)",
};

/** Ueberschrift und Zusatzhinweis je Meldeklasse. */
const KLASSEN_KOPF: Record<Exclude<Meldeklasse, "keine">, { titel: string; hinweis: string | null }> = {
  top_treffer: { titel: "🎯 <b>TOP-TREFFER</b>", hinweis: null },
  pruefkandidat: {
    titel: "🔍 <b>PRÜFKANDIDAT</b>",
    hinweis:
      "<i>Faktor und DSCR beruhen auf einer geschätzten Miete — vor einer " +
      "Entscheidung selbst prüfen.</i>",
  },
};

/** Telegram bricht bei rohen <, > oder & im HTML-Modus -- Fremdtext maskieren. */
function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE");
}

/** Deutsche Zahl mit Komma statt Punkt als Dezimaltrenner. */
function formatZahl(wert: number, nachkommastellen: number): string {
  return wert.toLocaleString("de-DE", {
    minimumFractionDigits: nachkommastellen,
    maximumFractionDigits: nachkommastellen,
  });
}

/**
 * Haengt die Ortszeile an den Kopfblock -- oder nichts, wenn nichts bekannt
 * ist. Als Suffix statt als eigener Block, damit sie ohne Leerzeile direkt
 * unter dem Titel steht, so wie vorher auch.
 */
function ortSuffix(listing: ListingSummary): string {
  const zeile = ortZeile(listing);
  return zeile === null ? "" : `
${zeile}`;
}

/**
 * Ortszeile. Setzt zusammen, was bekannt ist, und laesst weg, was fehlt --
 * ohne Leerstellen zu hinterlassen. Vorher lautete sie bei jedem
 * Immowelt-Objekt "📍  Jungingen" mit doppeltem Leerzeichen, weil die PLZ
 * unbesehen davorgeklebt wurde.
 */
function ortZeile(listing: ListingSummary): string | null {
  const ort = [listing.zipCode, listing.city].map((t) => (t ?? "").trim()).filter(Boolean).join(" ");
  const teile = [ort, (listing.bundesland ?? "").trim()].filter(Boolean);
  if (teile.length === 0) return null;
  return `📍 ${esc(teile.join(" · "))}`;
}

/**
 * Zeile mit den Datenluecken. Nimmt das ganze Listing statt nur der Codes,
 * weil eine fehlende PLZ keine gespeicherte Luecke ist, sondern hier erst
 * auffaellt -- und sie darf nicht stillschweigend verschwinden.
 */
function formatDataGapsLine(listing: ListingSummary): string | null {
  const codes = [...(listing.dataGaps ?? [])];
  if (!(listing.zipCode ?? "").trim()) codes.push("plz_fehlt");
  if (codes.length === 0) return null;
  const texte = codes.map(datenlueckeKlartext);
  return `⚠️ <i>Fehlende Angaben: ${esc(texte.join(", "))}</i>`;
}

/** Kennzahlen-Block: Preis, Faktor, DSCR, Einheiten, Mietgrundlage. */
function formatKennzahlenBlock(
  listing: ListingSummary,
  k: KennzahlenSummary,
  preisLabel: string
): string {
  const mietQuelle = MIET_QUELLE_LABELS[k.mietQuelle] ?? k.mietQuelle;
  return [
    `💰 <b>${preisLabel} ${formatEuro(listing.priceCents)} €</b>`,
    `📊 Faktor ${formatZahl(k.kaufpreisfaktor, 1)} · DSCR ${formatZahl(k.geschaetzterDscr, 2)}`,
    `🔑 ${listing.units === null ? "Einheiten unbekannt" : `${listing.units} Einheiten`} · Miete ${esc(mietQuelle)}`,
  ].join("\n");
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

/**
 * Zeilen der amtlichen Bekanntmachung, die schon oben in der Nachricht
 * stehen (Preis, Termin) oder als Anhang mitgeschickt werden.
 */
const NOTICE_REDUNDANTE_ZEILEN =
  /^(Verkehrswert in €|Termin|GeoServer|Exposee|Objekt\/Lage|Anhang \(PDF\)|Amtliche Bekanntmachung \(PDF\)):/;

/** Feld-Label der Bekanntmachung -> Symbol fuer die Nachricht. */
const NOTICE_SYMBOLE: Record<string, string> = {
  "Art der Versteigerung": "⚖️",
  Grundbuch: "📕",
  Beschreibung: "🏗",
  "Ort der Versteigerung": "📍",
};

/**
 * Gibt die amtliche Bekanntmachung als Nachrichten-Block zurueck: alles, was
 * der Nutzer sonst auf der (nicht verlinkbaren) Detailseite lesen wuerde.
 * Bereits weiter oben gezeigte Felder werden ausgelassen.
 */
function formatNoticeBlock(rawNoticeText: string | null | undefined): string | null {
  if (!rawNoticeText) return null;
  const zeilen = rawNoticeText
    .split("\n")
    .map((z) => z.trim())
    .filter((z) => z.length > 0 && !NOTICE_REDUNDANTE_ZEILEN.test(z))
    .map((zeile) => {
      const treffer = zeile.match(/^([^:]+):\s*(.*)$/);
      if (!treffer) return esc(zeile);
      const [, label, wert] = treffer;
      const symbol = NOTICE_SYMBOLE[label] ?? "•";
      return `${symbol} <b>${esc(label)}</b>\n${esc(wert)}`;
    });
  if (zeilen.length === 0) return null;
  return zeilen.join("\n\n");
}

/** Karten-Link zur Adresse -- funktioniert im Gegensatz zum zvg-portal-Direktlink. */
function kartenLink(listing: ListingSummary): string | null {
  // Ohne Adresse kein Kartenlink. Vorher entstand eine Google-Maps-Suche auf
  // den leeren String -- ein Link, der garantiert nichts findet.
  const adresse = [listing.zipCode, listing.city, listing.bundesland]
    .map((t) => (t ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (adresse === "") return null;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
  return `<a href="${url}">🗺 Karte</a>`;
}

/** Fusszeile mit den anklickbaren Links. */
function formatLinkZeile(listing: ListingSummary): string {
  const karte = kartenLink(listing);
  const links = karte === null ? [] : [karte];
  if (listing.url.includes("zvg-portal.de")) {
    links.push(`<a href="${ZVG_SUCHE_URL}">🔎 ZVG-Suche</a>`);
  } else {
    links.push(`<a href="${esc(listing.url)}">🔗 Zum Inserat</a>`);
  }
  return links.join("  ·  ");
}

/** Fuegt Bloecke mit Leerzeilen zusammen, leere Bloecke fallen weg. */
function baueNachricht(bloecke: (string | null)[]): string {
  return bloecke.filter((b): b is string => b !== null && b.length > 0).join("\n\n");
}

export function formatTopTrefferMessage(
  listing: ListingSummary,
  k: KennzahlenSummary,
  klasse: Exclude<Meldeklasse, "keine"> = "top_treffer"
): string {
  const kopf = KLASSEN_KOPF[klasse];
  return baueNachricht([
    `${kopf.titel}
🏠 ${esc(listing.title)}${ortSuffix(listing)}`,
    formatKennzahlenBlock(listing, k, "Kaufpreis"),
    kopf.hinweis,
    formatDataGapsLine(listing),
    formatLinkZeile(listing),
  ]);
}

export function formatZvgTopTrefferMessage(
  listing: ZvgListingSummary,
  k: KennzahlenSummary,
  klasse: Exclude<Meldeklasse, "keine"> = "top_treffer"
): string {
  const kopf = KLASSEN_KOPF[klasse];
  return baueNachricht([
    `${kopf.titel} · Zwangsversteigerung
🏠 ${esc(listing.title)}`,
    formatKennzahlenBlock(listing, k, "Verkehrswert"),
    [
      `📅 <b>Termin</b> ${formatBerlinDatumzeit(listing.auctionAt)} Uhr`,
      `⚖️ Amtsgericht ${esc(listing.court)}`,
      `📋 Az. ${esc(listing.caseNumber)}`,
    ].join("\n"),
    kopf.hinweis,
    formatDataGapsLine(listing),
    formatNoticeBlock(listing.rawNoticeText),
    formatLinkZeile(listing),
  ]);
}

export function formatPreisaenderungMessage(
  listing: ListingSummary,
  altPreisCents: number,
  neuPreisCents: number
): string {
  return baueNachricht([
    `💶 <b>PREISÄNDERUNG</b>
🏠 ${esc(listing.title)}${ortSuffix(listing)}`,
    `<s>${formatEuro(altPreisCents)} €</s>  →  <b>${formatEuro(neuPreisCents)} €</b>`,
    formatDataGapsLine(listing),
    formatLinkZeile(listing),
  ]);
}

/**
 * Abgangsmeldung. Geht ausschliesslich an Objekte, die frueher als
 * Top-Treffer oder Pruefkandidat gemeldet wurden -- bei mehreren hundert
 * Objekten je Lauf waere alles andere Dauerfeuer.
 */
export function formatAbgangMessage(listing: ListingSummary): string {
  return baueNachricht([
    `❌ <b>NICHT MEHR VERFÜGBAR</b>
🏠 ${esc(listing.title)}${ortSuffix(listing)}`,
    `<i>Das Objekt ist aus dem Angebot verschwunden — vermutlich verkauft, ` +
      `versteigert oder zurückgezogen. Es wird nach 2 Tagen aus dem Bestand ` +
      `entfernt.</i>`,
  ]);
}

/**
 * Warnung, wenn eine Quelle durch das Plausibilitaetstor faellt. Haengt an
 * keinem Objekt und wird deshalb NICHT in notifications protokolliert --
 * dort ist listing_id `not null`. Ihr dauerhafter Niederschlag ist die
 * sweep_runs-Zeile.
 */
export function formatSweepWarnungMessage(
  source: string,
  gesehene: number,
  erwartet: number | null,
  grund: string
): string {
  const mengenZeile =
    erwartet === null
      ? `Eingesammelt: <b>${gesehene}</b> Objekte.`
      : `Eingesammelt: <b>${gesehene}</b> Objekte, erwartet wären ~<b>${erwartet}</b>.`;
  return baueNachricht([
    `⚠️ <b>SWEEP UNPLAUSIBEL · ${esc(source)}</b>`,
    mengenZeile,
    esc(grund),
    `<i>Löschung ausgesetzt — der Bestand bleibt unangetastet.</i>`,
  ]);
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
