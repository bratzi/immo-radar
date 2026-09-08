import {
  sweepImmowelt,
  IMMOWELT_VERZOEGERUNG_MS,
} from "./scrapers/immowelt/index.js";
import {
  sweepZvgPortal,
  erfasseZvgDetails,
  ZVG_VERZOEGERUNG_MS,
} from "./scrapers/zvg-portal/index.js";
import { processCandidate, type PipelineCandidate } from "./lib/pipeline.js";
import {
  ermittleAbgaenge,
  ermittleRueckkehrer,
  waehleDetailKandidaten,
  budgetiereKandidaten,
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
  speichereRegionsLaeufe,
  ladeSweepHistorie,
} from "./lib/bestandDb.js";
import { hoechsteGemeldeteKlasse, logNotification, versandBeleg } from "./lib/db.js";
import {
  sendTelegramMessage,
  formatAbgangMessage,
  formatSweepWarnungMessage,
  type TelegramConfig,
} from "./lib/telegram.js";
import { sb } from "./lib/supabase.js";
import { werteAusTitelzeile } from "./scrapers/immowelt/titelzeile.js";
import { erstelleMeldebudget, type Meldebudget } from "./lib/meldebudget.js";
import { nurInCiAusfuehren } from "./lib/nurInCi.js";

// Der volle Lauf faehrt einen Browser gegen zwei Portale und ist der Grund,
// warum der Anschluss des Nutzers am 2026-09-08 lahmlag. Er gehoert auf
// GitHubs Rechner (.github/workflows/scrape.yml), nicht auf einen privaten
// Anschluss. Begruendung ausfuehrlich in lib/nurInCi.ts.
nurInCiAusfuehren("npm run scrape");

/** Detailseiten aelter als das werden neu geholt. */
const DETAIL_MAX_ALTER_TAGE = 7;

/**
 * Wanduhr-Budget der Detailerfassung -- pro Quelle, nicht global.
 *
 * Seit die Immowelt-Blaetterung funktioniert, erreicht der Sweep ~35.000
 * Objekte statt ~640. Jede Detailseite kostet mindestens die Drossel der
 * jeweiligen Quelle, ein voller Durchlauf waere also Stunden. Darum bekommt
 * jede Quelle pro Lauf nur eine begrenzte Scheibe Kandidaten; der Rueckstand
 * wird ueber aufeinanderfolgende Laeufe abgetragen.
 *
 * SEIT DEM 2026-09-08 GILT DAS NUR NOCH FUER ZVG. Immowelt hat keine
 * Detailphase mehr: seine /expose/-Seiten antworten von
 * Rechenzentrums-Adressen mit HTTP 403 und DataDome-CAPTCHA, waehrend /suche/
 * im selben Lauf HTTP 200 liefert. Die Bewertung kommt dort jetzt aus der
 * Titelzeile der Ergebniskarte (siehe scrapers/immowelt/titelzeile.ts) und
 * kostet gar kein Budget.
 *
 * Die Scheibengroesse ist DETAIL_BUDGET_MS geteilt durch die Drossel der
 * Quelle -- und die Drosselwerte werden aus den Scraper-Modulen IMPORTIERT,
 * nie hier von Hand wiederholt. Genau diese Dopplung war schon einmal der
 * Fehler: als Immowelt von 1 s auf 5 s hochgedrosselt wurde, blieb die
 * Detailkosten-Konstante bei 1000 ms stehen, und die Detailphase wurde als
 * 12 min budgetiert, lief aber ~60 min.
 *   ZVG: DETAIL_BUDGET_MS / ZVG_VERZOEGERUNG_MS
 *        = 720_000 / 1_000 = 720 Kandidaten  (~12 min)
 *
 * Warum das ernst ist und nicht bloss langsam: Laeuft ein Lauf ueber
 * `timeout-minutes` des GitHub-Actions-Jobs, wird er per SIGKILL beendet --
 * und dieser Kill trifft VOR dem Abgleichs- und Loeschblock am Ende von
 * main(). Markieren, Entmarkieren und harte Loeschung -- der ganze Zweck
 * dieses Branchs -- liefen dann stumm bei jedem Lauf nie.
 *
 * Das schwaecht die Loeschung im Normalfall NICHT. Vollstaendig sein muss der
 * SWEEP, nicht die Detailerfassung -- und der Sweep bleibt vollstaendig. Ein
 * im Sweep gesehenes, aber noch nicht detailliert erfasstes Objekt steht
 * schlicht noch nicht in `listings`; `ermittleAbgaenge` vergleicht nur
 * bekannte Listings gegen das vom Sweep Gesehene, ein nie gespeichertes
 * Objekt kann daher nicht faelschlich als Abgang markiert werden.
 */
const DETAIL_BUDGET_MS = 12 * 60 * 1000;

/**
 * Wie viele Detailkandidaten das Budget zulaesst -- abgeleitet aus der
 * importierten Drossel der Quelle, damit Budget und Drossel nie wieder
 * auseinanderlaufen koennen. Nur noch ZVG hat eine Detailphase.
 */
const DETAIL_MAX_KANDIDATEN: Record<"zvg-portal", number> = {
  "zvg-portal": Math.floor(DETAIL_BUDGET_MS / ZVG_VERZOEGERUNG_MS),
};

/**
 * Hoechstzahl Telegram-Meldungen je Lauf.
 *
 * Seit Immowelt aus der Ergebnisliste bewertet wird, laufen potenziell alle
 * gesehenen Objekte durch die Bewertung -- beim letzten Sweep 3.665 statt der
 * frueheren 144. Guenstige Objekte passieren die Schwellen dabei fast alle:
 * 75.000 € auf 158 m² ergeben bundeslandgenau rund 19.000 € Jahresmiete und
 * damit Kaufpreisfaktor ~4, weit unter der Schwelle von 15. Ohne Deckel waere
 * der erste Lauf Dauerfeuer und liefe bei 500 ms Sendeabstand ins
 * 75-Minuten-Limit des Jobs -- dessen Kill trifft VOR dem Abgleichsblock.
 *
 * Nichts geht verloren: Ohne Zeile in `notifications` gilt ein Objekt im
 * naechsten Lauf weiter als nie gemeldet (siehe lib/meldebudget.ts).
 */
const MAX_MELDUNGEN_JE_LAUF = 25;

/**
 * Hoechstzahl Immowelt-Objekte, die ein Lauf aus der Ergebnisliste bewertet.
 *
 * Nicht die Abrufe sind hier der Engpass -- die Liste ist ohnehin schon
 * geladen --, sondern die Datenbankrunden je Kandidat und die Laufzeit.
 *
 * Was der Rest NICHT tut: sich zuverlaessig ueber Folgelaeufe verteilen. Das
 * stand hier bis zum 2026-09-08 und war gemessen falsch. Die Auswahl streut
 * seit `streueAuswahl` wenigstens ueber alle Regionen statt ein
 * zusammenhaengendes Stueck zu schneiden, aber sie deckt je Lauf 600 von
 * zuletzt 9.329 gesehenen Objekten ab. Wer diesen Deckel anfasst, misst
 * vorher die Laufzeit -- ein Kill durch `timeout-minutes` trifft VOR dem
 * Abgleichs- und Loeschblock.
 */
const MAX_BEWERTUNGEN_IMMOWELT = 600;

const TELEGRAM_SENDEABSTAND_MS = 500;

/**
 * Waehlt die Kandidatenscheibe dieses Laufs und schreibt die Log-Zeile dazu.
 * Auswahl und Meldung stecken in `budgetiereKandidaten` (lib/bestand.ts) --
 * dort sind sie unter Test, hier waren sie es nie.
 */
function budgetiereDetailKandidaten(
  quelle: string,
  maxKandidaten: number,
  kandidaten: string[],
  versatz: number
): string[] {
  const { auswahl, meldung } = budgetiereKandidaten(
    quelle,
    maxKandidaten,
    kandidaten,
    versatz
  );
  console.log(meldung);
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
  candidate: PipelineCandidate,
  meldebudget: Meldebudget
): Promise<void> {
  try {
    await processCandidate(sb, telegramConfig, candidate, meldebudget);
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
    // Eine strukturell nur teilweise erfasste Quelle (Immowelt: Ratenlimit
    // erzwingt eine rotierende Scheibe) verfehlt das Plausibilitaetstor JEDEN
    // Lauf -- das ist so gebaut, keine Anomalie. Eine Telegram-Warnung alle
    // drei Stunden waere Dauerfeuer und wuerde den Kanal abstumpfen lassen.
    // Also: eine leise Logzeile, keine Meldung. Geloescht wird ohnehin nicht.
    if (sweep.strukturellTeilweise) {
      console.log(
        `${sweep.source}: Loeschung ausgesetzt (strukturell teilweise, erwartet) — ${pruefung.grund}`
      );
      return;
    }
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
      const abgangMessageId = await sendTelegramMessage(
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
      await logNotification(sb, abgang.id, "verschwunden", {
        externalId: abgang.externalId,
        ...versandBeleg(abgangMessageId, process.env.GITHUB_RUN_ID),
      });
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

  // Ein Budget fuer den GANZEN Lauf, ueber beide Quellen hinweg.
  const meldebudget = erstelleMeldebudget(MAX_MELDUNGEN_JE_LAUF);

  const detailGrenze = new Date(Date.now() - DETAIL_MAX_ALTER_TAGE * 24 * 60 * 60 * 1000);

  // Versatz fuer die Kandidaten-Rotation: Stunden seit Epoche. Kein
  // persistenter Zustand, und der Startpunkt wandert Lauf fuer Lauf durch die
  // Liste, statt immer denselben Kopf zu greifen und den Rest auszuhungern.
  const detailVersatz = Math.floor(Date.now() / 3_600_000);

  // --- Immowelt ---------------------------------------------------------
  console.log("Immowelt: Sweep gestartet...");
  const immowelt = await sweepImmowelt();
  await speichereSweepLauf(sb, immowelt.sweep);
  // Mengenhistorie je Region. Aendert am Loeschverhalten nichts -- sie sammelt
  // die Referenzlaeufe, die eine spaetere regionsgenaue Loeschhoheit braucht.
  await speichereRegionsLaeufe(sb, "immowelt", immowelt.regionLaeufe);

  // Immowelt wird AUS DER ERGEBNISLISTE bewertet, nicht aus Detailseiten.
  //
  // WARUM: Immowelts /expose/-Seiten antworten von Rechenzentrums-Adressen mit
  // HTTP 403 und einem DataDome-CAPTCHA, waehrend /suche/ im selben Lauf und
  // derselben Browser-Sitzung HTTP 200 mit vollstaendiger Seite liefert
  // (gemessen 2026-09-08 auf einem GitHub-Runner, unmittelbar nacheinander).
  // Die frueher hier stehende Detailphase holte 144 Seiten je Lauf und bekam
  // 144-mal 403: zwoelf Minuten Budget fuer nichts, und 144 Anfragen gegen
  // einen Anti-Bot-Schutz, den wir nicht reizen wollen.
  //
  // Die Ergebnisliste traegt alles Noetige in der Titelzeile der Karte, die
  // der Sweep ohnehin schon einsammelt:
  //
  //   "Mehrfamilienhaus zum Kauf - West - 75.000 € - 8 Zimmer, 158,7 m², 184 m² Grundstück"
  //
  // Das kostet keinen einzigen zusaetzlichen Abruf.
  //
  // Was dabei fehlt und bewusst hingenommen wird:
  //  * Die PLZ. Sie steht weder im Seiten-HTML noch im Datenmodell der
  //    Suchseite. Die Miete wird deshalb bundeslandgenau geschaetzt (ueber den
  //    Fundort) und traegt die Datenluecke `miete_nur_bundeslandgenau`.
  //  * Baujahr und Beschreibung.
  //  * Die Einheitenzahl -- die lieferte Immowelt aber auch auf der
  //    Detailseite nie (`units: null` selbst in der Fixture).
  let immoweltBewertet = 0;
  let immoweltOhnePreis = 0;
  // Rotierende Scheibe: nicht alle gesehenen Objekte in einem Lauf bewerten.
  const immoweltAuswahl = new Set(
    budgetiereDetailKandidaten(
      "Immowelt-Bewertung",
      MAX_BEWERTUNGEN_IMMOWELT,
      [...immowelt.zusammenfassungen.keys()],
      detailVersatz
    )
  );
  for (const zusammenfassung of immowelt.zusammenfassungen.values()) {
    if (!immoweltAuswahl.has(zusammenfassung.externalId)) continue;
    const werte = werteAusTitelzeile(zusammenfassung.titleLine);
    // Ohne Preis ist nichts zu rechnen. Ein erfundener Preis waere schlimmer
    // als gar keiner -- er ginge unmittelbar in den Kaufpreisfaktor ein.
    if (werte.preisCents === null) {
      immoweltOhnePreis += 1;
      continue;
    }
    immoweltBewertet += 1;
    await verarbeiteKandidatIsoliert(telegramConfig, {
      source: "immowelt",
      externalId: zusammenfassung.externalId,
      url: zusammenfassung.url,
      fundort: zusammenfassung.fundort,
      title: zusammenfassung.titleLine,
      priceCents: werte.preisCents,
      livingAreaM2: werte.wohnflaecheM2,
      plotAreaM2: werte.grundstueckM2,
      // Die Zimmerzahl ist NICHT die Zahl der Wohneinheiten. Sie hier
      // einzusetzen waere eine stille Erfindung; `bewerteEinheiten` nimmt
      // stattdessen wie bisher den Mindestwert an und markiert das.
      units: null,
      unitsConfident: false,
      yearBuilt: null,
      // Ohne PLZ: die Ortsangabe der Karte ist ein Stadtteilname.
      zipCode: "",
      city: werte.lage ?? "",
      rentColdMonthly: null,
      auctionAt: null,
      court: null,
      caseNumber: null,
      rawNoticeText: null,
      photoUrls: [],
    }, meldebudget);
  }
  console.log(
    `Immowelt: ${immoweltBewertet} von ${immowelt.zusammenfassungen.size} gesehenen Objekten ` +
      `aus der Ergebnisliste bewertet, ${immoweltOhnePreis} ohne Preisangabe uebersprungen.`
  );

  // --- ZVG-Portal -------------------------------------------------------
  console.log("ZVG-Portal: Sweep gestartet...");
  const zvg = await sweepZvgPortal();
  await speichereSweepLauf(sb, zvg.sweep);

  const zvgBekannt = new Set(
    (await ladeBekannteListings(sb, "zvg-portal")).map((l) => l.externalId)
  );
  const zvgVeraltet = new Set(await ladeVeralteteExternalIds(sb, "zvg-portal", detailGrenze));
  const zvgKandidaten = waehleDetailKandidaten([...zvg.sweep.gesehene], zvgBekannt, zvgVeraltet);
  const zvgAuswahl = budgetiereDetailKandidaten(
    "ZVG-Portal",
    DETAIL_MAX_KANDIDATEN["zvg-portal"],
    zvgKandidaten,
    detailVersatz
  );

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
    }, meldebudget);
  }

  // --- Bestandsfuehrung -------------------------------------------------
  console.log(
    `Meldungen: ${meldebudget.verbraucht()} von hoechstens ${MAX_MELDUNGEN_JE_LAUF} gesendet` +
      (meldebudget.zurueckgestellt() > 0
        ? `, ${meldebudget.zurueckgestellt()} wegen des Budgets auf Folgelaeufe zurueckgestellt ` +
          `(sie gelten weiter als nie gemeldet und werden nachgeholt).`
        : ".")
  );

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
