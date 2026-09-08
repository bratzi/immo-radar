import type { SupabaseClient } from "@supabase/supabase-js";
import { grunderwerbsteuerSatz, bundeslandFuerPlz } from "./grunderwerbsteuer.js";
import { berechneKennzahlen } from "./metrics.js";
import { ermittleJahreskaltmiete } from "./rentEstimate.js";
import { bestimmeMeldeklasse, istHoeher, type Meldeklasse } from "./meldung.js";
import { upsertListingAndVersion, logNotification, hoechsteGemeldeteKlasse } from "./db.js";
import { kartePngFuerPlz } from "./karte.js";
import {
  sendTelegramMessage,
  sendTelegramPhotos,
  sendTelegramDocument,
  formatTopTrefferMessage,
  formatZvgTopTrefferMessage,
  formatPreisaenderungMessage,
  type TelegramConfig,
  type ListingSummary,
} from "./telegram.js";

const MIN_EINHEITEN = 3;
/** Mindestabstand zwischen zwei Telegram-Sendungen, damit der erste Lauf
 *  (alles ist "changed") nicht in ein Rate-Limit laeuft. */
const TELEGRAM_SENDEABSTAND_MS = 500;

function schlafe(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface EinheitenAuswertung {
  ausschliessen: boolean;
  einheitenFuerBerechnung: number;
  dataGaps: string[];
}

export function bewerteEinheiten(units: number | null, unitsConfident: boolean): EinheitenAuswertung {
  if (unitsConfident && units !== null && units < MIN_EINHEITEN) {
    return { ausschliessen: true, einheitenFuerBerechnung: units, dataGaps: [] };
  }
  if (!unitsConfident || units === null) {
    return { ausschliessen: false, einheitenFuerBerechnung: units ?? MIN_EINHEITEN, dataGaps: ["units_unconfirmed"] };
  }
  return { ausschliessen: false, einheitenFuerBerechnung: units, dataGaps: [] };
}

/**
 * Bruttomietrendite, ab der eine GESCHAETZTE Miete nicht mehr glaubwuerdig
 * ist. Im deutschen Wohnbestand gibt es real keine 20% Bruttorendite -- ein
 * hoeherer Wert heisst, dass die Annahme "laesst sich normal vermieten"
 * nicht traegt: bei Zwangsversteigerungen sind das typischerweise
 * unbewohnbare Objekte, Erbbaurechte oder ideelle Anteile. Beispiel aus dem
 * Bestand: 27.000 € fuer 349 m² in Plauen ergab rechnerisch Faktor 1,1.
 */
const MAX_PLAUSIBLE_BRUTTORENDITE = 20;

/**
 * Prueft, ob eine geschaetzte Miete zum Preis passt. Belegte Mieten werden
 * nie angezweifelt -- dort ist eine hohe Rendite eine echte Information.
 */
export function bewerteMietschaetzung(mietQuelle: string, bruttomietrendite: number): string[] {
  if (mietQuelle === "angegeben") return [];
  if (bruttomietrendite <= MAX_PLAUSIBLE_BRUTTORENDITE) return [];
  return ["rent_estimate_unreliable"];
}

/**
 * Gesendet wird nur bei einem echten AUFSTIEG. Damit ist ein Objekt genau
 * einmal je Klasse eine Nachricht wert, und eine Verbesserung
 * (pruefkandidat -> top_treffer) meldet sich erneut.
 */
export function sollGesendetWerden(aktuell: Meldeklasse, bereitsGemeldet: Meldeklasse): boolean {
  return aktuell !== "keine" && istHoeher(aktuell, bereitsGemeldet);
}

export interface PipelineCandidate {
  source: string;
  externalId: string;
  url: string;
  /**
   * Region, auf deren Ergebnisliste das Objekt gefunden wurde. Nur Immowelt
   * setzt das -- ZVG traegt sein Bundesland bereits in der externalId
   * ("sn-40908"), wo `partitionAusExternalId` es liest. null heisst "nicht
   * zuzuordnen" und schuetzt damit vor Loeschung.
   */
  fundort?: string | null;
  title: string;
  priceCents: number;
  livingAreaM2: number | null;
  plotAreaM2: number | null;
  units: number | null;
  unitsConfident: boolean;
  yearBuilt: number | null;
  zipCode: string;
  city: string;
  rentColdMonthly: number | null;
  auctionAt: string | null;
  court: string | null;
  caseNumber: string | null;
  rawNoticeText: string | null;
  /** Luecken, die bereits die Quelle beim Parsen festgestellt hat (z. B.
   *  "location_unconfirmed"). Wird mit den Einheiten-Luecken zusammengefuehrt. */
  sourceDataGaps?: string[];
  /** Oeffentlich abrufbare Objektfotos (Immowelt-CDN) fuer den Bildversand. */
  photoUrls?: string[];
  /** PDF-Anhaenge (ZVG); nur mit Referer auf die Detailseite abrufbar. */
  attachments?: { url: string; filename: string }[];
}

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

/**
 * Laedt eine Mediendatei herunter. `referer` ist fuer zvg-portal.de noetig:
 * ohne passenden Referer liefert die Seite HTTP 200 mit dem Body "error"
 * statt der Datei.
 */
async function ladeDatei(url: string, referer?: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        ...(referer ? { Referer: referer } : {}),
      },
    });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    console.warn(`Download fehlgeschlagen: ${url}`, err);
    return null;
  }
}

function istPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}

/** Verschickt Fotos und PDF-Anhaenge zu einem gemeldeten Objekt. */
async function sendeMedien(
  telegramConfig: TelegramConfig,
  candidate: PipelineCandidate
): Promise<void> {
  const fotos: { bytes: Uint8Array; filename: string }[] = [];

  // Lagekarte zuerst, damit auf einen Blick sichtbar ist, wo das Objekt liegt.
  const karte = kartePngFuerPlz(candidate.zipCode);
  if (karte !== null) fotos.push({ bytes: karte, filename: "lage.png" });

  for (const [i, url] of (candidate.photoUrls ?? []).entries()) {
    const bytes = await ladeDatei(url);
    if (bytes !== null) fotos.push({ bytes, filename: `bild-${i + 1}.jpg` });
  }
  if (fotos.length > 0) {
    await schlafe(TELEGRAM_SENDEABSTAND_MS);
    await sendTelegramPhotos(telegramConfig, fotos, candidate.title);
  }

  for (const anhang of candidate.attachments ?? []) {
    const datei = await ladeDatei(anhang.url, candidate.url);
    if (datei === null || !istPdf(datei)) {
      console.warn(`Anhang ${anhang.url}: keine PDF-Antwort, uebersprungen.`);
      continue;
    }
    await schlafe(TELEGRAM_SENDEABSTAND_MS);
    await sendTelegramDocument(telegramConfig, datei, anhang.filename, anhang.filename);
  }
}

export async function processCandidate(
  supabase: SupabaseClient,
  telegramConfig: TelegramConfig,
  candidate: PipelineCandidate
): Promise<void> {
  const einheiten = bewerteEinheiten(candidate.units, candidate.unitsConfident);
  if (einheiten.ausschliessen) {
    console.log(
      `Übersprungen (Einheiten bestätigt: ${candidate.units}, benötigt >=${MIN_EINHEITEN}): ${candidate.title}`
    );
    return;
  }

  const dataGaps = new Set([...(candidate.sourceDataGaps ?? []), ...einheiten.dataGaps]);

  const miete = ermittleJahreskaltmiete(candidate.rentColdMonthly, candidate.livingAreaM2 ?? 0, candidate.zipCode);
  const satz = grunderwerbsteuerSatz(candidate.zipCode);
  const bundesland = bundeslandFuerPlz(candidate.zipCode);
  const kennzahlen = berechneKennzahlen(
    {
      kaufpreis: candidate.priceCents / 100,
      jahreskaltmiete: miete.jahreskaltmiete,
      einheiten: einheiten.einheitenFuerBerechnung,
      baujahr: candidate.yearBuilt,
      wohnflaecheM2: candidate.livingAreaM2 ?? 0,
    },
    satz
  );

  for (const luecke of bewerteMietschaetzung(miete.quelle, kennzahlen.bruttomietrendite)) {
    dataGaps.add(luecke);
  }

  const diff = await upsertListingAndVersion(supabase, {
    source: candidate.source,
    externalId: candidate.externalId,
    url: candidate.url,
    fundort: candidate.fundort,
    priceCents: candidate.priceCents,
    rentColdMonthlyCents: candidate.rentColdMonthly === null ? null : Math.round(candidate.rentColdMonthly * 100),
    rentSource: miete.quelle,
    livingAreaM2: candidate.livingAreaM2,
    plotAreaM2: candidate.plotAreaM2,
    units: candidate.units,
    unitsConfident: candidate.unitsConfident,
    yearBuilt: candidate.yearBuilt,
    zipCode: candidate.zipCode,
    city: candidate.city,
    bundesland,
    title: candidate.title,
    kennzahlen,
    auctionAt: candidate.auctionAt,
    court: candidate.court,
    caseNumber: candidate.caseNumber,
    rawNoticeText: candidate.rawNoticeText,
    dataGaps: [...dataGaps],
  });

  const listingSummary: ListingSummary = {
    title: candidate.title,
    url: candidate.url,
    city: candidate.city,
    zipCode: candidate.zipCode,
    priceCents: candidate.priceCents,
    units: candidate.units,
    dataGaps: [...dataGaps],
  };

  const klasse = bestimmeMeldeklasse({
    erfuelltSchwellen: kennzahlen.topTreffer,
    mietQuelle: miete.quelle,
    auctionAt: candidate.auctionAt,
    jetzt: new Date(),
  });

  if (klasse !== "keine") {
    const bereitsGemeldet = await hoechsteGemeldeteKlasse(supabase, diff.listingId);
    if (sollGesendetWerden(klasse, bereitsGemeldet)) {
      const kennzahlenSummary = {
        kaufpreisfaktor: kennzahlen.kaufpreisfaktor,
        geschaetzterDscr: kennzahlen.geschaetzterDscr,
        mietQuelle: miete.quelle,
      };
      const text =
        candidate.source === "zvg-portal" && candidate.court && candidate.auctionAt && candidate.caseNumber
          ? formatZvgTopTrefferMessage(
              {
                ...listingSummary,
                court: candidate.court,
                auctionAt: candidate.auctionAt,
                caseNumber: candidate.caseNumber,
                rawNoticeText: candidate.rawNoticeText,
              },
              kennzahlenSummary,
              klasse
            )
          : formatTopTrefferMessage(listingSummary, kennzahlenSummary, klasse);

      // Reihenfolge ist wesentlich: erst senden, dann protokollieren. Wirft
      // der Versand, entsteht KEINE Zeile -- und der naechste Lauf sieht das
      // Objekt weiterhin als "noch nie gemeldet" und holt es nach. Genau das
      // war der Fehler der alten changed-Logik.
      await schlafe(TELEGRAM_SENDEABSTAND_MS);
      await sendTelegramMessage(telegramConfig, text);
      // Medien sind Beiwerk, die notifications-Zeile ist das Hauptbuch.
      // Deshalb faengt dieses try/catch AUSSCHLIESSLICH sendeMedien ab und
      // laesst sendTelegramMessage und logNotification unangetastet: Ein
      // dauerhaft fehlschlagender Anhang (Foto ueber Telegrams Groessenlimit,
      // nicht unterstuetztes Format) darf nicht verhindern, dass der bereits
      // bestaetigte Versand protokolliert wird -- sonst gilt das Objekt auf
      // ewig als "nie gemeldet" und die volle Nachricht geht alle drei
      // Stunden erneut raus.
      try {
        await sendeMedien(telegramConfig, candidate);
      } catch (err) {
        console.warn(
          `Medienversand fehlgeschlagen [${candidate.source} · ${candidate.externalId}], ` +
            `Meldung bleibt gueltig:`,
          err
        );
      }
      await logNotification(supabase, diff.listingId, klasse, {
        ...kennzahlenSummary,
        priceCents: candidate.priceCents,
      });
    }
  }

  if (diff.priceDropped && diff.previousPriceCents !== null) {
    await schlafe(TELEGRAM_SENDEABSTAND_MS);
    await sendTelegramMessage(
      telegramConfig,
      formatPreisaenderungMessage(listingSummary, diff.previousPriceCents, candidate.priceCents)
    );
    await logNotification(supabase, diff.listingId, "preisaenderung", {
      altPreisCents: diff.previousPriceCents,
      neuPreisCents: candidate.priceCents,
    });
  }
}
