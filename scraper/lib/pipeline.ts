import type { SupabaseClient } from "@supabase/supabase-js";
import {
  grunderwerbsteuerSatz,
  grunderwerbsteuerSatzFuerBundesland,
  bundeslandFuerPlz,
} from "./grunderwerbsteuer.js";
import { berechneKennzahlen, MIN_PLAUSIBLER_KAUFPREISFAKTOR } from "./metrics.js";
import { ermittleJahreskaltmiete, bundeslandFuerRegionscode } from "./rentEstimate.js";
import { bestimmeMeldeklasse, istHoeher, type Meldeklasse } from "./meldung.js";
import { upsertListingAndVersion, logNotification, hoechsteGemeldeteKlasse, versandBeleg } from "./db.js";
import { kartePngFuerPlz } from "./karte.js";
import type { Meldebudget } from "./meldebudget.js";
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
  const luecken: string[] = [];

  // Bundeslandgenau heisst: ueber ganz Nordrhein-Westfalen derselbe Mietwert,
  // von Duesseldorf bis zum laendlichen Kreis. Nicht falsch, aber deutlich
  // groeber als die PLZ-Schaetzung -- und das muss dranstehen, sonst rankt
  // das Dashboard spaeter Nichtwissen wie Wissen.
  if (mietQuelle === "geschaetzt_bundesland") luecken.push("miete_nur_bundeslandgenau");

  if (mietQuelle !== "angegeben" && bruttomietrendite > MAX_PLAUSIBLE_BRUTTORENDITE) {
    luecken.push("rent_estimate_unreliable");
  }
  return luecken;
}

/**
 * Haelt fest, dass Kaufpreis und Miete in keinem moeglichen Verhaeltnis
 * zueinander stehen.
 *
 * DER NAME SAGT BEWUSST NICHT, WELCHE SEITE FALSCH IST. Das laesst sich hier
 * nicht entscheiden, und die erste Fassung hiess `kaufpreis_unplausibel` --
 * eine Behauptung, die die Messung nicht deckt. Gemessen am 2026-09-08 traf
 * die Luecke zwei Objekte in Baden-Wuerttemberg (124.000 € auf 300 m²,
 * 595.000 € auf 2.062 m²); beide tragen `miete_nur_bundeslandgenau`, ihre
 * Miete stammt also aus einer Handtabelle ueber ein ganzes Bundesland. Der
 * Preis kann stimmen und die Schaetzung daneben liegen.
 *
 * `berechneKennzahlen` verweigert solchen Objekten bereits die Schwellen.
 * Ohne diese Luecke waere das unsichtbar: Das Objekt saehe aus wie geprueft
 * und durchgefallen. Dieselbe Unterscheidung wie bei `wohnflaeche_fehlt`.
 *
 * Die Schwelle kommt aus metrics.ts und wird hier NICHT wiederholt -- eine
 * zweite Kopie derselben Zahl war in diesem Projekt schon einmal der Fehler.
 */
export function bewertePreisplausibilitaet(kaufpreisfaktor: number): string[] {
  return kaufpreisfaktor < MIN_PLAUSIBLER_KAUFPREISFAKTOR ? ["preis_miete_unvereinbar"] : [];
}

/**
 * Haelt fest, dass ein Objekt ohne Wohnflaeche NICHT BEURTEILBAR ist.
 *
 * WARUM DAS NOETIG IST: `ermittleJahreskaltmiete` rechnet ohne Flaeche mit
 * 0 m², was eine Jahresmiete von 0 und damit eine Bruttorendite von 0 ergibt.
 * Das Objekt faellt durch alle Schwellen und sieht am Ende aus wie geprueft
 * und schlecht -- dabei fehlt schlicht die Grundlage. `bewerteMietschaetzung`
 * faengt das nicht ab: die schlaegt nur bei einer zu HOHEN Rendite an, nie bei
 * null.
 *
 * Gemessen am Bestand (2026-09-08): 210 der 400 zuletzt erfassten Versionen
 * haben keine Wohnflaeche, weit ueberwiegend ZVG. Diese Luecke macht den
 * Unterschied zwischen "geprueft und schlecht" und "nicht beurteilbar"
 * sichtbar -- fuer das Dashboard ist das der entscheidende Unterschied.
 *
 * Am Meldeverhalten aendert sie nichts; die Schwellen schliessen solche
 * Objekte ohnehin aus.
 */
export function bewerteFlaechenangabe(livingAreaM2: number | null): string[] {
  return livingAreaM2 !== null && livingAreaM2 > 0 ? [] : ["wohnflaeche_fehlt"];
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
  candidate: PipelineCandidate,
  /**
   * Obergrenze fuer Meldungen dieses Laufs. Fehlt sie, wird ungebremst
   * gesendet -- das ist nur fuer Tests gedacht, der Produktivlauf reicht immer
   * eines herein.
   */
  meldebudget?: Meldebudget
): Promise<void> {
  const einheiten = bewerteEinheiten(candidate.units, candidate.unitsConfident);
  if (einheiten.ausschliessen) {
    console.log(
      `Übersprungen (Einheiten bestätigt: ${candidate.units}, benötigt >=${MIN_EINHEITEN}): ${candidate.title}`
    );
    return;
  }

  const dataGaps = new Set([...(candidate.sourceDataGaps ?? []), ...einheiten.dataGaps]);

  // Das Bundesland kommt aus der PLZ, wenn es eine gibt -- sonst aus dem
  // Fundort. Immowelt-Objekte aus der Ergebnisliste haben keine PLZ (die steht
  // dort nirgends, und die Detailseite ist von Rechenzentrums-Adressen
  // gesperrt), wohl aber die Region, in deren Liste sie standen.
  const bundesland =
    bundeslandFuerPlz(candidate.zipCode) ??
    (candidate.fundort === undefined || candidate.fundort === null
      ? null
      : bundeslandFuerRegionscode(candidate.fundort));

  const miete = ermittleJahreskaltmiete(
    candidate.rentColdMonthly,
    candidate.livingAreaM2 ?? 0,
    candidate.zipCode,
    bundesland
  );
  // Ohne PLZ ueber das Bundesland gehen statt auf den Bundesschnitt zu
  // fallen -- der Steuersatz haengt ohnehin nur am Land.
  const satz =
    candidate.zipCode === "" || bundeslandFuerPlz(candidate.zipCode) === null
      ? grunderwerbsteuerSatzFuerBundesland(bundesland)
      : grunderwerbsteuerSatz(candidate.zipCode);
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
  for (const luecke of bewerteFlaechenangabe(candidate.livingAreaM2)) {
    dataGaps.add(luecke);
  }
  for (const luecke of bewertePreisplausibilitaet(kennzahlen.kaufpreisfaktor)) {
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
    // Das Bundesland gehoert in JEDE Meldung -- Anforderung des Nutzers vom
    // 2026-09-08. Es ist die einzige Ortsangabe, die bei Immowelt
    // zuverlaessig da ist: von 1.862 Objekten haben 1.862 ein Bundesland,
    // aber nur 157 eine PLZ, und die stammen alle aus dem alten Detailpfad.
    bundesland,
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
    const meldenNoetig = sollGesendetWerden(klasse, bereitsGemeldet);
    // Budgetwache VOR dem Versand. Ist das Budget des Laufs aufgebraucht, wird
    // NICHT gesendet und AUCH NICHT protokolliert -- ohne Zeile in
    // `notifications` gilt das Objekt im naechsten Lauf weiter als nie gemeldet
    // und wird nachgeholt. Die Meldung ist verschoben, nicht verworfen
    // (Begruendung ausfuehrlich in lib/meldebudget.ts).
    //
    // KEIN vorzeitiges `return` an dieser Stelle: die Preisaenderungs-Meldung
    // weiter unten haengt nicht an der Meldeklasse und muesste sonst
    // mitausfallen.
    if (meldenNoetig && meldebudget !== undefined && !meldebudget.darfSenden()) {
      meldebudget.zurueckstellen();
    } else if (meldenNoetig) {
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
      const messageId = await sendTelegramMessage(telegramConfig, text);
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
        ...versandBeleg(messageId, process.env.GITHUB_RUN_ID),
      });
      meldebudget?.verbuchen();
    }
  }

  // Auch die Preisaenderung ist eine Telegram-Nachricht und zaehlt gegen
  // dasselbe Budget.
  if (diff.priceDropped && diff.previousPriceCents !== null) {
    if (meldebudget !== undefined && !meldebudget.darfSenden()) {
      meldebudget.zurueckstellen();
      return;
    }
    await schlafe(TELEGRAM_SENDEABSTAND_MS);
    const preisMessageId = await sendTelegramMessage(
      telegramConfig,
      formatPreisaenderungMessage(listingSummary, diff.previousPriceCents, candidate.priceCents)
    );
    await logNotification(supabase, diff.listingId, "preisaenderung", {
      altPreisCents: diff.previousPriceCents,
      neuPreisCents: candidate.priceCents,
      ...versandBeleg(preisMessageId, process.env.GITHUB_RUN_ID),
    });
    meldebudget?.verbuchen();
  }
}
