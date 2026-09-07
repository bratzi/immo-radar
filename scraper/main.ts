import { sweepImmowelt, erfasseImmoweltDetails } from "./scrapers/immowelt/index.js";
import { sweepZvgPortal, erfasseZvgDetails } from "./scrapers/zvg-portal/index.js";
import { processCandidate, type PipelineCandidate } from "./lib/pipeline.js";
import {
  ermittleAbgaenge,
  ermittleRueckkehrer,
  waehleDetailKandidaten,
  rotiereAuswahl,
  type SweepErgebnis,
} from "./lib/bestand.js";
import { pruefeMengenplausibilitaet } from "./lib/plausibilitaet.js";
import {
  ladeBekannteListings,
  ladeVeralteteExternalIds,
  markiereVerschwunden,
  hebeVerschwundenAuf,
  aktualisiereLastSeen,
  loescheAbgelaufene,
  speichereSweepLauf,
  ladeSweepHistorie,
} from "./lib/bestandDb.js";
import { hoechsteGemeldeteKlasse, logNotification } from "./lib/db.js";
import {
  sendTelegramMessage,
  formatAbgangMessage,
  formatSweepWarnungMessage,
  type TelegramConfig,
} from "./lib/telegram.js";
import { sb } from "./lib/supabase.js";

/** Detailseiten aelter als das werden neu geholt. */
const DETAIL_MAX_ALTER_TAGE = 7;

/**
 * Wanduhr-Budget der Detailerfassung -- pro Quelle, nicht global.
 *
 * Seit die Immowelt-Blaetterung funktioniert, erreicht der Sweep ~35.000
 * Objekte statt ~640. Jede Detailseite kostet mindestens VERZOEGERUNG_MS
 * (1000 ms Drossel), ~35.000 * 1 s waeren also rund 10 Stunden. Der
 * GitHub-Actions-Workflow erlaubt 40 Minuten. Darum bekommt jede Quelle pro
 * Lauf nur eine begrenzte Scheibe von DETAIL_BUDGET_MS / 1000 Kandidaten; der
 * Rueckstand wird ueber aufeinanderfolgende Laeufe abgetragen.
 *
 * Das schwaecht die Loeschung NICHT. Vollstaendig sein muss der SWEEP, nicht
 * die Detailerfassung -- und der Sweep bleibt vollstaendig. Ein im Sweep
 * gesehenes, aber noch nicht detailliert erfasstes Objekt steht schlicht noch
 * nicht in `listings`; `ermittleAbgaenge` vergleicht nur bekannte Listings
 * gegen das vom Sweep Gesehene, ein nie gespeichertes Objekt kann daher nicht
 * faelschlich als Abgang markiert werden.
 */
const DETAIL_BUDGET_MS = 12 * 60 * 1000;

/** Mindestkosten einer Detailseite (VERZOEGERUNG_MS der Scraper). */
const DETAIL_KOSTEN_MS = 1000;

/** Wie viele Detailkandidaten das Budget je Quelle zulaesst. */
const DETAIL_MAX_KANDIDATEN = Math.floor(DETAIL_BUDGET_MS / DETAIL_KOSTEN_MS);

const TELEGRAM_SENDEABSTAND_MS = 500;

/**
 * Waehlt aus den Detailkandidaten einer Quelle die Scheibe fuer diesen Lauf und
 * protokolliert, wie viele auf spaetere Laeufe zurueckgestellt werden -- so ist
 * der Rueckstand im Run-Log Lauf fuer Lauf sichtbar (und sollte schrumpfen).
 */
function budgetiereDetailKandidaten(
  quelle: string,
  kandidaten: string[],
  versatz: number
): string[] {
  const auswahl = rotiereAuswahl(kandidaten, DETAIL_MAX_KANDIDATEN, versatz);
  const zurueckgestellt = kandidaten.length - auswahl.length;
  console.log(
    `${quelle}: ${auswahl.length} Detailseiten in diesem Lauf, ` +
      `RUECKSTAND ${zurueckgestellt} auf spaetere Laeufe zurueckgestellt ` +
      `(von ${kandidaten.length} offenen Kandidaten).`
  );
  return auswahl;
}

function schlafe(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verarbeitet einen Kandidaten und faengt Fehler ab, damit ein einzelner
 * Ausreisser (DB-Constraint, transienter 5xx, fehlgeschlagener Telegram-
 * Versand) nicht den gesamten Lauf abbricht.
 */
async function verarbeiteKandidatIsoliert(
  telegramConfig: TelegramConfig,
  candidate: PipelineCandidate
): Promise<void> {
  try {
    await processCandidate(sb, telegramConfig, candidate);
  } catch (err) {
    console.error(
      `Kandidat fehlgeschlagen, uebersprungen [${candidate.source} · ${candidate.externalId} · ${candidate.url}]:`,
      err
    );
  }
}

/**
 * Abgleich einer Quelle: Rueckkehrer entmarkieren, Abgaenge markieren und
 * melden. Laeuft nur, wenn das Plausibilitaetstor offen ist.
 */
async function gleicheBestandAb(
  telegramConfig: TelegramConfig,
  sweep: SweepErgebnis
): Promise<void> {
  const bekannte = await ladeBekannteListings(sb, sweep.source);
  const jetzt = new Date();

  // last_seen ZUERST, fuer alles was der Sweep gesehen hat -- auch fuer
  // Objekte ohne neue Detailerfassung. Die Reihenfolge ist Absicht: `last_seen`
  // ist die zweite, unabhaengige Bedingung der harten Loeschung (siehe
  // istHartLoeschbar). Steht sie am Anfang, kann kein Fehler weiter unten in
  // dieser Funktion dazu fuehren, dass ein in DIESEM Lauf gesehenes Objekt
  // spaeter geloescht wird.
  await aktualisiereLastSeen(
    sb,
    bekannte.filter((l) => sweep.gesehene.has(l.externalId)).map((l) => l.id),
    jetzt
  );

  // Rueckkehrer als naechstes: das ist ungefaehrlich und darf auch ohne
  // offenes Plausibilitaetstor passieren.
  const rueckkehrer = ermittleRueckkehrer(sweep, bekannte);
  await hebeVerschwundenAuf(sb, rueckkehrer.map((l) => l.id));
  if (rueckkehrer.length > 0) {
    console.log(`${sweep.source}: ${rueckkehrer.length} Objekte sind zurueck.`);
  }

  const historie = await ladeSweepHistorie(sb, sweep.source);
  const pruefung = pruefeMengenplausibilitaet({
    gesehene: sweep.gesehene.size,
    gemeldeteTreffer: sweep.gemeldeteTreffer,
    historie,
    vollstaendig: sweep.vollstaendig,
  });

  if (!pruefung.loeschenErlaubt) {
    console.warn(`${sweep.source}: Loeschung ausgesetzt — ${pruefung.grund}`);
    await schlafe(TELEGRAM_SENDEABSTAND_MS);
    await sendTelegramMessage(
      telegramConfig,
      formatSweepWarnungMessage(
        sweep.source,
        sweep.gesehene.size,
        pruefung.erwartet,
        pruefung.grund ?? ""
      )
    );
    return;
  }

  const abgaenge = ermittleAbgaenge(sweep, bekannte);
  if (abgaenge.length === 0) return;

  await markiereVerschwunden(sb, abgaenge.map((l) => l.id), jetzt);
  console.log(`${sweep.source}: ${abgaenge.length} Objekte als verschwunden markiert.`);

  // Abgangsmeldung nur fuer Objekte, die es frueher in den Chat geschafft
  // haben. Alles andere waere bei mehreren hundert Objekten Dauerfeuer.
  for (const abgang of abgaenge) {
    try {
      const gemeldet = await hoechsteGemeldeteKlasse(sb, abgang.id);
      if (gemeldet === "keine") continue;
      const { data } = await sb
        .from("listing_versions")
        .select("title, city, zip_code, price_cents, units")
        .eq("listing_id", abgang.id)
        .order("scanned_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) continue;

      await schlafe(TELEGRAM_SENDEABSTAND_MS);
      await sendTelegramMessage(
        telegramConfig,
        formatAbgangMessage({
          title: (data.title as string) ?? "Objekt",
          url: "",
          city: (data.city as string) ?? "",
          zipCode: (data.zip_code as string) ?? "",
          priceCents: Number(data.price_cents),
          units: (data.units as number | null) ?? null,
        })
      );
      await logNotification(sb, abgang.id, "verschwunden", { externalId: abgang.externalId });
    } catch (err) {
      console.error(`Abgangsmeldung fehlgeschlagen [${abgang.externalId}]:`, err);
    }
  }
}

async function main() {
  const REQUIRED_ENV_VARS = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      throw new Error(`Fehlende Umgebungsvariable: ${key}`);
    }
  }

  const telegramConfig = {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  };

  const detailGrenze = new Date(Date.now() - DETAIL_MAX_ALTER_TAGE * 24 * 60 * 60 * 1000);

  // Versatz fuer die Kandidaten-Rotation: Stunden seit Epoche. Kein
  // persistenter Zustand, und der Startpunkt wandert Lauf fuer Lauf durch die
  // Liste, statt immer denselben Kopf zu greifen und den Rest auszuhungern.
  const detailVersatz = Math.floor(Date.now() / 3_600_000);

  // --- Immowelt ---------------------------------------------------------
  console.log("Immowelt: Sweep gestartet...");
  const immowelt = await sweepImmowelt();
  await speichereSweepLauf(sb, immowelt.sweep);

  const immoweltBekannt = new Set(
    (await ladeBekannteListings(sb, "immowelt")).map((l) => l.externalId)
  );
  const immoweltVeraltet = new Set(await ladeVeralteteExternalIds(sb, "immowelt", detailGrenze));
  const immoweltKandidaten = waehleDetailKandidaten(
    [...immowelt.sweep.gesehene],
    immoweltBekannt,
    immoweltVeraltet
  );
  const immoweltAuswahl = budgetiereDetailKandidaten(
    "Immowelt",
    immoweltKandidaten,
    detailVersatz
  );

  for (const objekt of await erfasseImmoweltDetails(immowelt.zusammenfassungen, immoweltAuswahl)) {
    await verarbeiteKandidatIsoliert(telegramConfig, {
      source: "immowelt",
      externalId: objekt.externalId,
      url: objekt.url,
      title: objekt.title,
      priceCents: objekt.priceCents,
      livingAreaM2: objekt.livingAreaM2,
      plotAreaM2: objekt.plotAreaM2,
      units: objekt.units,
      unitsConfident: objekt.unitsConfident,
      yearBuilt: objekt.yearBuilt,
      zipCode: objekt.zipCode,
      city: objekt.city,
      rentColdMonthly: objekt.rentColdMonthly,
      auctionAt: null,
      court: null,
      caseNumber: null,
      rawNoticeText: null,
      photoUrls: objekt.photoUrls,
    });
  }

  // --- ZVG-Portal -------------------------------------------------------
  console.log("ZVG-Portal: Sweep gestartet...");
  const zvg = await sweepZvgPortal();
  await speichereSweepLauf(sb, zvg.sweep);

  const zvgBekannt = new Set(
    (await ladeBekannteListings(sb, "zvg-portal")).map((l) => l.externalId)
  );
  const zvgVeraltet = new Set(await ladeVeralteteExternalIds(sb, "zvg-portal", detailGrenze));
  const zvgKandidaten = waehleDetailKandidaten([...zvg.sweep.gesehene], zvgBekannt, zvgVeraltet);
  const zvgAuswahl = budgetiereDetailKandidaten("ZVG-Portal", zvgKandidaten, detailVersatz);

  for (const termin of await erfasseZvgDetails(zvg.zusammenfassungen, zvgAuswahl)) {
    await verarbeiteKandidatIsoliert(telegramConfig, {
      source: "zvg-portal",
      externalId: termin.externalId,
      url: termin.url,
      title: termin.title,
      priceCents: termin.priceCents,
      livingAreaM2: termin.livingAreaM2,
      plotAreaM2: null,
      units: termin.units,
      unitsConfident: termin.unitsConfident,
      yearBuilt: termin.yearBuilt,
      zipCode: termin.zipCode,
      city: termin.city,
      rentColdMonthly: null,
      auctionAt: termin.auctionAt,
      court: termin.court,
      caseNumber: termin.caseNumber,
      rawNoticeText: termin.rawNoticeText,
      sourceDataGaps: termin.dataGaps,
      attachments: termin.attachments,
    });
  }

  // --- Bestandsfuehrung -------------------------------------------------
  for (const sweep of [immowelt.sweep, zvg.sweep]) {
    try {
      await gleicheBestandAb(telegramConfig, sweep);
    } catch (err) {
      console.error(`Bestandsabgleich fehlgeschlagen [${sweep.source}]:`, err);
    }
  }

  try {
    const geloescht = await loescheAbgelaufene(sb, new Date());
    if (geloescht > 0) console.log(`${geloescht} Objekte nach Ablauf der Karenz geloescht.`);
  } catch (err) {
    console.error("Loeschung fehlgeschlagen:", err);
  }

  console.log("Lauf abgeschlossen.");
}

main().catch((err) => {
  console.error("Pipeline-Fehler:", err);
  process.exitCode = 1;
});
