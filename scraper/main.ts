import {
  sweepImmowelt,
  erfasseImmoweltDetails,
  IMMOWELT_VERZOEGERUNG_MS,
} from "./scrapers/immowelt/index.js";
import { fuegeDetailHinzu, kandidatAusDetail } from "./scrapers/immowelt/zusammenfuehren.js";
import type { ImmoweltDetailData } from "./scrapers/immowelt/detail.js";
import type { ImmoweltListSummary } from "./scrapers/immowelt/list.js";
import {
  sweepZvgPortal,
  erfasseZvgDetails,
  fasseZvgDetailsZusammen,
  ZVG_VERZOEGERUNG_MS,
} from "./scrapers/zvg-portal/index.js";
import { processCandidate, type PipelineCandidate } from "./lib/pipeline.js";
import {
  ermittleMarkierungen,
  waehleAbgangsmeldungen,
  MAX_ABGANGSMELDUNGEN_JE_QUELLE_UND_LAUF,
  ermittleRueckkehrer,
  waehleDetailKandidaten,
  budgetiereKandidaten,
  type SweepErgebnis,
} from "./lib/bestand.js";
import { pruefeMengenplausibilitaet } from "./lib/plausibilitaet.js";
import { inBloecken, serialisierer } from "./lib/nebenlaeufig.js";
import {
  ladeBekannteListings,
  ladeVeralteteExternalIds,
  ladeDetailRueckstand,
  quelleHatLoeschhoheit,
  markiereVerschwunden,
  hebeVerschwundenAuf,
  aktualisiereLastSeen,
  loescheAbgelaufene,
  speichereSweepLauf,
  speichereRegionsLaeufe,
  ladeLetzteRegionsSweeps,
  ladeHochwassermarken,
  ladeSweepHistorie,
} from "./lib/bestandDb.js";
import {
  bereitsGemeldeteListingIds,
  logNotification,
  versandBeleg,
  upsertListingOhneBewertung,
} from "./lib/db.js";
import {
  sendTelegramMessage,
  formatAbgangMessage,
  formatSweepWarnungMessage,
  type TelegramConfig,
} from "./lib/telegram.js";
import { sb } from "./lib/supabase.js";
import {
  werteAusTitelzeile,
  fasseOhnePreisZusammen,
  ermittleLueckencodeOhnePreis,
} from "./scrapers/immowelt/titelzeile.js";
import { erzeugeSnapshot } from "./lib/snapshotDb.js";
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
 * seit `streueAuswahl` ueber alle Regionen, statt ein zusammenhaengendes
 * Stueck zu schneiden -- aber was ein Lauf auslaesst, holt kein spaeterer
 * gezielt nach. Wer diesen Deckel anfasst, misst vorher die Laufzeit -- ein
 * Kill durch `timeout-minutes` trifft VOR dem Abgleichs- und Loeschblock.
 *
 * WARUM 3.000 UND NICHT MEHR 600: Zwei Laeufe am 2026-09-21, eine Stunde
 * auseinander und mit praktisch gleicher Last (644 und 645 gesehene
 * Objekte, je 600 ausgewaehlt), messen die Wirkung von `BEWERTUNGSBREITE`:
 *
 *   Lauf 35585454873, nacheinander:  590 Objekte in 5 min 22 s = 0,55 s je Objekt
 *   Lauf 35588951096, nebenlaeufig:  588 Objekte in 1 min 04 s = 0,11 s je Objekt
 *
 * Beide Laeufe: 0 Zeilen `Kandidat fehlgeschlagen`, Meldebudget eingehalten.
 *
 * DAS ZEITBUDGET BLEIBT DAMIT UNVERAENDERT: 3.000 Objekte kosten 3.000 mal
 * 0,11 s, also rund 5,5 min -- genau so viel, wie die Bewertung VOR der
 * Nebenlaeufigkeit fuer 600 Objekte gebraucht hat. Der Deckel steigt um das
 * Fuenffache, ohne dass der Lauf laenger wird als der laengste echte Lauf
 * bisher (50 min gegen `timeout-minutes: 75`). Das ist die Grenze: nicht
 * "so viel wie moeglich", sondern "so viel, wie in die bereits belegte Zeit
 * passt".
 *
 * WAS ER BRINGT: Nicht Laufzeit, sondern wie spaet eine Preissenkung
 * auffaellt. Regionsgenau gemessen (BACKLOG B9, 13,1 Tage Historie), denn
 * das frueher hier stehende Quellenmittel von 8,5 Tagen verdeckt die
 * Spreizung -- die schlechtesten Regionen sind die groessten:
 *
 *   bw 4.920 Objekte: 11,9 Tage -> 2,4    ni 3.105: 11,3 -> 2,3
 *   he 2.573 Objekte: 11,2 Tage -> 2,2    nw 6.995:  8,0 -> 1,6
 *
 * Ein Objekt wird nur neu bewertet, wenn SEINE Region tief gesweept wird
 * und es dabei in die Scheibe faellt. Der Deckel war bis hierher der
 * bindende der beiden Faktoren; ab 3.000 ist es die Regionskadenz.
 *
 * WAS HIER EXTRAPOLIERT IST: Die 0,11 s je Objekt sind an rund 590 Objekten
 * gemessen, nicht an 3.000. Angenommen ist, dass die Kosten je Objekt
 * gleich bleiben -- die Breite bleibt ja 6, nur die Phase dauert laenger.
 * DER NAECHSTE LAUF MIT NORMALER SWEEP-MENGE IST DIE PRUEFUNG DAFUER:
 * Bewertungsdauer gegen ausgewertete Objekte rechnen. Liegt sie deutlich
 * ueber 0,11 s je Objekt, ist Supabase der Engpass und nicht die Rundenzahl.
 *
 * DER RUECKWEG IST DIESE ZAHL: `600` stellt das Verhalten vom 2026-09-21
 * wieder her.
 */
const MAX_BEWERTUNGEN_IMMOWELT = 3000;

/**
 * Hoechstzahl Immowelt-Detailseiten, die ein Lauf holt.
 *
 * WARUM ES DIESE PHASE GIBT: Sie ist der einzige Weg zu PLZ, Baujahr und
 * Kaltmiete -- die Titelzeile der Ergebnisliste nennt keines davon, und ihr
 * Fehlen ist die Wurzel von 97,4 % ohne PLZ, 0,3 % mit Baujahr und der nur
 * bundeslandgenauen Mietschaetzung (A11).
 *
 * WARUM SIE VOR DEM SWEEP STEHT: Ein Runner, der gerade Hunderte Suchseiten
 * geholt hat, bekommt auf /expose/ nur noch HTTP 403; ein frischer nicht.
 * Gemessen 6 von 10 gegen 0 von 75 (BACKLOG.md B6, Schritt 4). Die
 * Reihenfolge ist deshalb keine Geschmacksfrage, sondern die Bedingung.
 *
 * WARUM NUR 25: Weil die Sperre nicht besiegt, sondern nur umgangen ist --
 * vier von zehn Abrufen scheitern weiterhin. Der Deckel haelt den Preis
 * eines schlechten Tages klein und ist zugleich die laufende Messung.
 *
 * DIE RECHNUNG: Eine Immowelt-Seite kostet gemessen 8,7 bis 11,5 s -- 5 s
 * Drossel plus echte Ladezeit. 25 Abrufe sind damit rund 4 min. Der laengste
 * echte Lauf lag bei 50 min gegen `timeout-minutes: 75`; die Marge sinkt
 * also von 25 auf rund 21 min. Wer diesen Deckel anhebt, rechnet mit 11,5 s
 * je Seite, nicht mit 5 -- und weiss, dass ein Kill VOR dem Abgleichs- und
 * Loeschblock traefe.
 *
 * WAS ER NICHT LEISTET: Aufholen. 25 je Lauf bei real 4,5 Laeufen am Tag
 * sind rund 110 Objekte taeglich gegen einen Bestand von ueber 20.000. Das
 * ist Absicht -- erst messen, dann anheben.
 */
const MAX_DETAILS_IMMOWELT = 25;

const TELEGRAM_SENDEABSTAND_MS = 500;

/**
 * Wie viele Immowelt-Objekte gleichzeitig bewertet werden.
 *
 * DAS GEMESSENE PROBLEM: Ein bewertetes Objekt kostete nacheinander rund
 * 0,55 s, und fast alles davon war Warten auf die Datenbank --
 * `upsertListingAndVersion` macht drei Runden nacheinander bei rund 100 ms
 * Umlaufzeit. Auf den damaligen Deckel von 600 gerechnet sind das sechs
 * Minuten, mehr als der Sweep selbst braucht (Lauf 35539155621).
 *
 * WAS DAS KOSTETE, und zwar nicht an Zeit: Bei 600 Bewertungen je Lauf,
 * real 4,5 Laeufen am Tag und ueber 23.000 Objekten im Bestand wurde ein
 * Objekt nur alle 8,5 Tage neu bewertet. So spaet faellt eine Preissenkung
 * auf -- bei einem Werkzeug, dessen Kernversprechen Preissenkungen sind.
 *
 * WAS SIE GEBRACHT HAT: Zwei Laeufe am 2026-09-21 mit praktisch gleicher
 * Last messen den Unterschied als Faktor 5,0 -- 0,55 s je Objekt
 * nacheinander gegen 0,11 s nebenlaeufig, bei 0 Fehlerzeilen. Die
 * Herleitung und was daraus fuer den Deckel folgt, steht bei
 * `MAX_BEWERTUNGEN_IMMOWELT`. Der Gewinn ist dort eingeloest, nicht hier:
 * nicht als kuerzerer Lauf, sondern als fuenffach groessere Scheibe.
 *
 * WARUM 6 UND NICHT 20: Die Gegenseite ist hier die eigene Datenbank, nicht
 * ein fremdes Portal -- es gibt also keine Drossel zu beachten. Aber
 * Supabase deckelt gleichzeitige Anfragen, und ein Lauf, der in sein Limit
 * rennt, ist teurer als einer, der eine Minute laenger braucht. Sechs ist
 * bewusst vorsichtig; wer ihn anhebt, misst vorher die Laufzeit UND die
 * Fehlerzahl im Log. Seit der Deckel bei 3.000 steht, dauert die
 * nebenlaeufige Phase ohnehin laenger -- erst diese Last zeigt, ob Supabase
 * bei Breite 6 noch Luft hat.
 *
 * DER RUECKWEG IST DIESE ZAHL: `1` ergibt exakt das alte Verhalten, Objekt
 * fuer Objekt. Macht Nebenlaeufigkeit im Betrieb Aerger, genuegt diese eine
 * Aenderung -- kein Umbau. Dann aber gehoert `MAX_BEWERTUNGEN_IMMOWELT`
 * mit zurueck auf 600, sonst dauert die Bewertung allein eine halbe Stunde.
 */
const BEWERTUNGSBREITE = 6;

/**
 * Die Warteschlange, durch die JEDE Meldung dieses Laufs geht.
 *
 * Eine einzige fuer den ganzen Lauf, nicht eine je Quelle: Telegrams
 * Sendeabstand und das Meldebudget gelten quellenuebergreifend. Zwei
 * Warteschlangen wuerden beide fuer sich die Reihe halten und trotzdem
 * gleichzeitig senden.
 */
const MELDEREIHE = serialisierer();

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
 * Zaehlt die ohne Preis erfassten Immowelt-Objekte je Lueckencode fuer die
 * Betriebsdaten des Snapshots (Entwurf, Abschnitt 8).
 *
 * Dieselbe Unterscheidung wie `fasseOhnePreisZusammen`, nur als Zahlen statt
 * als Satz -- und ueber DIESELBE Funktion
 * (`ermittleLueckencodeOhnePreis`), damit Logzeile und Snapshot nicht
 * auseinanderlaufen koennen. A13 nennt die getrennte Quote ausdruecklich als
 * Regressionsanzeige: eine steigende `preis_unlesbar`-Quote ist ein Fehler,
 * eine steigende `preis_auf_anfrage`-Quote ist Markt.
 */
function zaehleOhnePreis(
  faelle: { titleLine: string }[]
): { preis_auf_anfrage: number; preis_unlesbar: number } {
  const zaehler = { preis_auf_anfrage: 0, preis_unlesbar: 0 };
  for (const fall of faelle) zaehler[ermittleLueckencodeOhnePreis(fall.titleLine)] += 1;
  return zaehler;
}

/**
 * Verarbeitet einen Kandidaten und faengt Fehler ab, damit ein einzelner
 * Ausreisser (DB-Constraint, transienter 5xx, fehlgeschlagener Telegram-
 * Versand) nicht den gesamten Lauf abbricht.
 */
async function verarbeiteKandidatIsoliert(
  telegramConfig: TelegramConfig,
  candidate: PipelineCandidate,
  meldebudget: Meldebudget,
  /**
   * Warteschlange fuer den Meldeteil. Nur noetig, wenn mehrere Kandidaten
   * gleichzeitig laufen -- siehe `MELDEREIHE` und `BEWERTUNGSBREITE`.
   */
  serialisiere?: <T>(aufgabe: () => Promise<T>) => Promise<T>
): Promise<void> {
  try {
    await processCandidate(sb, telegramConfig, candidate, meldebudget, serialisiere);
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

  // Wieviel Beweislast eine Markierung traegt, haengt an genau einer Frage:
  // Darf diese Quelle hart loeschen? Wo ja, ist die Markierung der erste
  // Schritt der Loeschung und traegt deren volle Beweislast. Wo nein, ist sie
  // ein reversibler Endzustand und der Regionsbeweis genuegt. Geurteilt wird
  // in `ermittleMarkierungen`; hier wird nur weitergereicht.
  const befugnis = {
    hatLoeschhoheit: quelleHatLoeschhoheit(sweep.source),
    quellenPruefungBestanden: pruefung.loeschenErlaubt,
  };

  if (!pruefung.loeschenErlaubt) {
    // Eine strukturell nur teilweise erfasste Quelle (Immowelt: Ratenlimit
    // erzwingt eine rotierende Scheibe) verfehlt das Plausibilitaetstor JEDEN
    // Lauf -- das ist so gebaut, keine Anomalie. Eine Telegram-Warnung alle
    // drei Stunden waere Dauerfeuer und wuerde den Kanal abstumpfen lassen.
    // Also: eine leise Logzeile, keine Meldung.
    if (sweep.strukturellTeilweise) {
      console.log(
        `${sweep.source}: Loeschung ausgesetzt (strukturell teilweise, erwartet) — ${pruefung.grund}`
      );
    } else {
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
    }
    // Nur eine Quelle MIT Loeschhoheit bricht hier ab. Fuer sie waere die
    // Markierung der Beginn einer Loeschung, die diese Pruefung gerade
    // untersagt hat. Ohne Loeschhoheit laeuft es weiter -- das Tor misst bei
    // einer rotierend erfassten Quelle ohnehin nur die Rotation und waere
    // dort ein permanentes Nein, also nie eine Markierung (Kriterium B-2).
    if (befugnis.hatLoeschhoheit) return;
  }

  const abgaenge = ermittleMarkierungen(sweep, bekannte, befugnis);
  if (abgaenge.length === 0) return;

  await markiereVerschwunden(sb, abgaenge.map((l) => l.id), jetzt);
  console.log(`${sweep.source}: ${abgaenge.length} Objekte als verschwunden markiert.`);

  // Abgangsmeldung nur fuer Objekte, die es frueher in den Chat geschafft
  // haben. Alles andere waere bei mehreren hundert Objekten Dauerfeuer --
  // und weil auch das noch zu viele sein koennen, deckelt
  // `waehleAbgangsmeldungen` die Zahl zusaetzlich (siehe dort).
  const gemeldeteIds = await bereitsGemeldeteListingIds(sb, abgaenge.map((l) => l.id));
  const { melden, verschwiegen } = waehleAbgangsmeldungen(abgaenge, (id) => gemeldeteIds.has(id));
  if (verschwiegen > 0) {
    console.log(
      `${sweep.source}: ${verschwiegen} weitere meldefaehige Abgaenge sind markiert, aber nicht ` +
        `gemeldet (Deckel ${MAX_ABGANGSMELDUNGEN_JE_QUELLE_UND_LAUF} je Quelle). Sie stehen mit ` +
        `disappeared_at im Bestand.`
    );
  }
  for (const abgang of melden) {
    try {
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
      await logNotification(
        sb,
        abgang.id,
        "verschwunden",
        {
          externalId: abgang.externalId,
          ...versandBeleg(abgangMessageId, process.env.GITHUB_RUN_ID),
        },
        `${sweep.source} · ${abgang.externalId}`
      );
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

  // --- Immowelt: Detailphase ZUERST -------------------------------------
  //
  // DIE REIHENFOLGE IST DER GANZE PUNKT. Immowelts /expose/-Seiten antworten
  // einem Runner, der gerade Hunderte Suchseiten geholt hat, mit HTTP 403 --
  // einem frischen Runner dagegen nicht. Gemessen am 2026-09-20/21:
  //
  //   frischer Runner (Diagnose, ~6 Abrufe):   6 von 10 mit HTTP 200
  //   nach vollem Sweep (drei Produktionslaeufe): 0 von 75
  //
  // Nicht die Uhrzeit (beide Diagnosen lagen zwischen Produktionslaeufen),
  // nicht die URL-Form (am Log als identisch belegt), nicht die Detailphase
  // selbst (der Einbruch begann vor ihrem Einhaengen) -- sondern der Ruf der
  // Adresse, den der Sweep verbraucht. Deshalb steht dieser Block VOR
  // `sweepImmowelt` und nicht dahinter. Wer ihn verschiebt, macht ihn
  // wirkungslos; die Herleitung steht in BACKLOG.md B6, Schritt 4.
  //
  // Die Kandidaten kommen aus `listings`, nicht aus dem Sweep: Zu diesem
  // Zeitpunkt gibt es noch keinen, und der Rueckstand liegt ohnehin im
  // Altbestand -- ueber 20.000 Objekte ohne PLZ, Baujahr und Kaltmiete.
  const immoweltDetails = new Map<string, ImmoweltDetailData>();
  const immoweltDetailFundort = new Map<string, string | null>();
  const detailRueckstand = await ladeDetailRueckstand(sb, "immowelt", detailGrenze);
  const detailZiele = budgetiereDetailKandidaten(
    "Immowelt-Detail",
    MAX_DETAILS_IMMOWELT,
    detailRueckstand.map((z) => z.externalId),
    detailVersatz
  );
  if (detailZiele.length > 0) {
    // `erfasseImmoweltDetails` erwartet die Zusammenfassungen eines Sweeps.
    // Hier gibt es keinen -- gebraucht werden daraus nur `externalId` und
    // `url`, und beide stehen im Bestand. Die Titelzeile bleibt leer, weil
    // es keine gibt; die Detailseite traegt ohnehin alles.
    const ausBestand = new Map<string, ImmoweltListSummary>();
    for (const zeile of detailRueckstand) {
      ausBestand.set(zeile.externalId, {
        externalId: zeile.externalId,
        url: zeile.url,
        titleLine: "",
        fundort: zeile.fundort,
      });
      immoweltDetailFundort.set(zeile.externalId, zeile.fundort);
    }
    // Gekapselt wie jeder Abschnitt, der ein fremdes Portal anfasst: Bricht
    // die Detailphase im Ganzen weg -- Browserstart, Consent, Aufwaermseite
    // --, ist das ein Verlust an Feldern, kein Grund, den Lauf abzubrechen.
    // Ungekapselt risse sie beide Sweeps, den Bestandsabgleich und den
    // Loeschblock mit sich; deren Ausfall waere um ein Vielfaches teurer.
    try {
      const erfasst = await erfasseImmoweltDetails(ausBestand, detailZiele);
      for (const detail of erfasst) immoweltDetails.set(detail.externalId, detail);
    } catch (err) {
      console.error("Immowelt-Detailphase fehlgeschlagen, Lauf geht ohne sie weiter:", err);
    }
    // DIESE ZAHL IST DIE MESSUNG. Steht dort 0, sagen die Zeilen darueber
    // (`beurteileDetailAntwort`), ob eine Sperre oder eine
    // Strukturaenderung geantwortet hat -- das eine verlangt Drosselung, das
    // andere den Parser. Vor jedem Anheben von MAX_DETAILS_IMMOWELT: lesen.
    console.log(
      `Immowelt-Detail: ${immoweltDetails.size} von ${detailZiele.length} ` +
        `Detailseiten gelesen (Rueckstand insgesamt ${detailRueckstand.length}).`
    );
  }

  // --- Immowelt: Sweep --------------------------------------------------
  // Wo der letzte Lauf aufgehoert hat. Der Sweep setzt dort fort, statt seinen
  // Startpunkt aus der Wanduhr zu ziehen -- der billigste Hebel gegen die
  // langsame Abdeckung (5,7 statt 13,1 Tage, ohne einen zusaetzlichen Abruf;
  // Herleitung bei `sweepStartVersatz`). Scheitert die Abfrage, liefert sie
  // null und der Sweep faellt auf das alte Uhr-Verhalten zurueck.
  const letzteRegionsSweeps = await ladeLetzteRegionsSweeps(sb, "immowelt");
  // Der zweite Vollstaendigkeitsmassstab (A16), fuer die vier Regionen, die
  // ihre Trefferzahl nie nennen. EIGENE Abfrage, sortiert nach Menge statt
  // nach Zeit -- ein Zeitfenster waere als Massstab durchgefallen, siehe
  // `ladeHochwassermarken`.
  const hochwassermarken = await ladeHochwassermarken(sb, "immowelt");
  console.log("Immowelt: Sweep gestartet...");
  const immowelt = await sweepImmowelt(letzteRegionsSweeps, hochwassermarken);
  await speichereSweepLauf(sb, immowelt.sweep);
  // Mengenhistorie je Region. Aendert am Loeschverhalten nichts -- sie sammelt
  // die Referenzlaeufe, die eine spaetere regionsgenaue Loeschhoheit braucht.
  await speichereRegionsLaeufe(sb, "immowelt", immowelt.regionLaeufe);

  // Immowelt wird AUS DER ERGEBNISLISTE bewertet -- und fuer eine kleine
  // Scheibe zusaetzlich aus der Detailseite.
  //
  // DIE ERGEBNISLISTE traegt das Meiste in der Titelzeile der Karte, die der
  // Sweep ohnehin schon einsammelt:
  //
  //   "Mehrfamilienhaus zum Kauf - West - 75.000 € - 8 Zimmer, 158,7 m², 184 m² Grundstück"
  //
  // Das kostet keinen einzigen zusaetzlichen Abruf. Drei Dinge stehen dort
  // aber nicht, und genau sie fehlten deshalb im ganzen Bestand:
  //  * Die PLZ -- sie steht weder im Seiten-HTML noch im Datenmodell der
  //    Suchseite. Ohne sie wird die Miete nur bundeslandgenau geschaetzt und
  //    traegt die Datenluecke `miete_nur_bundeslandgenau` (A11).
  //  * Das Baujahr.
  //  * Die Kaltmiete.
  //
  // DIE DETAILPHASE lief bereits, ganz zu Anfang dieses Laufs -- vor dem
  // Sweep, weil ihre Abrufe nur auf einem unverbrauchten Runner durchkommen.
  // Was sie geholt hat, liegt in `immoweltDetails` und legt sich hier ueber
  // die Titelzeile. Die meisten ihrer Objekte stehen aber gar nicht in
  // dieser Ergebnisliste; die holt der Block hinter der Schleife ab.
  let immoweltBewertet = 0;
  const immoweltOhnePreis: { fundort: string | null; titleLine: string }[] = [];
  // Rotierende Scheibe: nicht alle gesehenen Objekte in einem Lauf bewerten.
  const immoweltAuswahl = new Set(
    budgetiereDetailKandidaten(
      "Immowelt-Bewertung",
      MAX_BEWERTUNGEN_IMMOWELT,
      [...immowelt.zusammenfassungen.keys()],
      detailVersatz
    )
  );

  // NEBENLAEUFIG, mit EINER Ausnahme: Der Meldeteil laeuft durch
  // `MELDEREIHE` und damit weiterhin streng nacheinander. Alles davor --
  // rechnen und schreiben -- ist reines Warten auf die Datenbank und
  // kostet nebeneinander nicht mehr als hintereinander. Begruendung und
  // Rueckweg stehen bei `BEWERTUNGSBREITE`.
  const zuBewerten = [...immowelt.zusammenfassungen.values()].filter((z) =>
    immoweltAuswahl.has(z.externalId)
  );
  await inBloecken(zuBewerten, BEWERTUNGSBREITE, async (zusammenfassung) => {
    // Die Detailseite legt sich ueber die Titelzeile; wo sie schweigt, bleibt
    // die Titelzeile stehen (scrapers/immowelt/zusammenfuehren.ts).
    const werte = fuegeDetailHinzu(
      werteAusTitelzeile(zusammenfassung.titleLine),
      immoweltDetails.get(zusammenfassung.externalId)
    );
    // Ohne Preis ist nichts zu rechnen. Ein erfundener Preis waere schlimmer
    // als gar keiner -- er ginge unmittelbar in den Kaufpreisfaktor ein.
    if (werte.preisCents === null) {
      immoweltOhnePreis.push({
        fundort: zusammenfassung.fundort ?? null,
        titleLine: zusammenfassung.titleLine,
      });
      // Die Titelzeile MUSS ins Protokoll: Der `continue` unten schreibt
      // nichts, das Objekt ist nach dem Lauf sonst nirgends mehr auffindbar
      // (Abnahmekriterium A-4). Erst diese Zeile trennt "die Quelle nennt
      // keinen Preis" von "der Parser hat versagt" -- ohne sie bleibt die
      // Klassifikation eine Vermutung, und genau daran hat sich dieses
      // Projekt bei A6 schon einmal verrannt.
      console.log(
        `Immowelt ohne Preis [${zusammenfassung.fundort ?? "ohne Fundort"}]: ` +
          JSON.stringify(zusammenfassung.titleLine)
      );
      // Gekapselt wie jeder andere Schreibvorgang je Objekt
      // (`verarbeiteKandidatIsoliert`, und die Abgangsschleife weiter oben):
      // Ein voruebergehender Datenbankfehler beim *unwichtigsten* Schreiben
      // des Laufs -- einem Objekt, das nicht einmal bewertet werden kann --
      // darf nicht den ganzen Lauf abbrechen. Ungekapselt riss er den
      // ZVG-Sweep, den Bestandsabgleich und jede Meldung mit sich und
      // verletzte damit A-1 ("laeuft ohne Ausnahme durch") an genau der
      // Stelle, die A-4 schliessen soll.
      try {
        await upsertListingOhneBewertung(sb, {
          source: "immowelt",
          externalId: zusammenfassung.externalId,
          url: zusammenfassung.url,
          fundort: zusammenfassung.fundort ?? null,
          // Seit es wieder eine Detailphase gibt, ist das nicht mehr pauschal
          // false: Wurde die Seite gelesen und nennt trotzdem keinen Preis,
          // ist das eine Aussage der Quelle und soll `last_detail_at` setzen.
          detailGelesen: werte.detailGelesen,
        });
      } catch (err) {
        console.error(
          `Zeile ohne Bewertung fehlgeschlagen [immowelt · ${zusammenfassung.externalId}]:`,
          err
        );
      }
      return;
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
      // Einheiten, Baujahr, PLZ und Kaltmiete kann nur die Detailseite
      // liefern -- ohne sie stehen hier weiterhin null bzw. "". Die
      // Zimmerzahl der Titelzeile ist NICHT die Zahl der Wohneinheiten und
      // wird deshalb nirgends dafuer eingesetzt.
      units: werte.einheiten,
      unitsConfident: werte.einheitenSicher,
      yearBuilt: werte.baujahr,
      // Mit PLZ faellt die Datenluecke `miete_nur_bundeslandgenau`; ohne sie
      // ist die Ortsangabe der Karte ein Stadtteilname.
      zipCode: werte.plz,
      city: werte.ort,
      rentColdMonthly: werte.kaltmiete,
      auctionAt: null,
      court: null,
      caseNumber: null,
      rawNoticeText: null,
      photoUrls: werte.fotoUrls,
    }, meldebudget, MELDEREIHE);
  });
  console.log(
    `Immowelt: ${immoweltBewertet} von ${immowelt.zusammenfassungen.size} gesehenen Objekten ` +
      `aus der Ergebnisliste bewertet, ${fasseOhnePreisZusammen(immoweltOhnePreis)}`
  );

  // Im Detail erfasst, aber vom Sweep dieses Laufs NICHT gesehen.
  //
  // Der Normalfall, nicht die Ausnahme: Die Detailscheibe waehlt aus dem
  // Altbestand ueber alle 16 Regionen, der Sweep deckt in einem Lauf eine
  // einzige ab. Ohne diesen Block waeren fast alle Detailabrufe umsonst --
  // die Bewertungsschleife oben erreicht nur, was auch in der Ergebnisliste
  // stand.
  let nurAusDetail = 0;
  for (const detail of immoweltDetails.values()) {
    if (immowelt.zusammenfassungen.has(detail.externalId)) continue;
    nurAusDetail += 1;
    await verarbeiteKandidatIsoliert(
      telegramConfig,
      kandidatAusDetail(detail, immoweltDetailFundort.get(detail.externalId) ?? null),
      meldebudget,
      MELDEREIHE
    );
  }
  if (immoweltDetails.size > 0) {
    console.log(
      `Immowelt-Detail: ${nurAusDetail} von ${immoweltDetails.size} erfassten Objekten ` +
        `standen nicht in der Ergebnisliste dieses Laufs und wurden einzeln geschrieben.`
    );
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
  const zvgAuswahl = budgetiereDetailKandidaten(
    "ZVG-Portal",
    DETAIL_MAX_KANDIDATEN["zvg-portal"],
    zvgKandidaten,
    detailVersatz
  );

  const zvgDetails = await erfasseZvgDetails(zvg.zusammenfassungen, zvgAuswahl);
  for (const termin of zvgDetails.termine) {
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
      // ZVG kommt ausschliesslich ueber die Detailseite an ein Objekt. Ohne
      // diesen Schalter bliebe `last_detail_at` seit B8-1 leer, und
      // `ladeVeralteteExternalIds` holte dieselben Termine in JEDEM Lauf
      // erneut -- ein stehender Rueckstand, nur teurer.
      detailGelesen: true,
    }, meldebudget, MELDEREIHE);
  }
  // Die Bekanntmachung wurde gelesen, sie nennt nur keinen verwertbaren
  // Verkehrswert (A-4, Aufgabe 2 -- Gegenstueck zum Immowelt-Fall oben).
  // `fundort` bleibt null wie bei jeder ZVG-Zeile; die Partition liest ZVG
  // ohnehin aus der externalId (`partitionEinesListings` faellt auf
  // `partitionAusExternalId` zurueck, `sn-40908` -> `sn`). Die Zeile unterliegt
  // damit derselben Abgangs- und Loeschwache wie jedes andere ZVG-Objekt,
  // NICHT einer schwaecheren: nach dem Delisting kann sie regulaer Abgang
  // werden und nach KARENZ_TAGE hart geloescht werden.
  for (const zusammenfassung of zvgDetails.ohneVerkehrswert) {
    // Gekapselt wie der Immowelt-Fall oben: Ein voruebergehender
    // Datenbankfehler beim unwichtigsten Schreibvorgang des Laufs darf den
    // Lauf nicht abbrechen (A-1).
    try {
      await upsertListingOhneBewertung(sb, {
        source: "zvg-portal",
        externalId: zusammenfassung.externalId,
        url: zusammenfassung.url,
        fundort: null,
        detailGelesen: true,
      });
    } catch (err) {
      console.error(
        `Zeile ohne Bewertung fehlgeschlagen [zvg-portal · ${zusammenfassung.externalId}]:`,
        err
      );
    }
  }
  console.log(fasseZvgDetailsZusammen(zvgDetails));

  // Jetzt steht fest, wie viele besser belegte Kandidaten es in diesem Lauf
  // gab: freie Plaetze gehen an die zurueckgestellten, nur landesweit
  // geschaetzten Meldungen. Sonst verfiele Durchsatz (lib/meldebudget.ts).
  await meldebudget.holeNach();

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

  // --- Snapshot-Export --------------------------------------------------
  //
  // GANZ AM ENDE und AUSSCHLIESSLICH LESEND (Dashboard-Entwurf, Abschnitt 9,
  // Schritt 3). Zuletzt, weil der Snapshot den Zustand NACH Abgleich und
  // Loeschung zeigen soll -- ein vorher erzeugter Snapshot zeigte Objekte als
  // verfuegbar, die dieser Lauf gerade als abgaengig markiert hat.
  //
  // Gekapselt wie jeder andere Randschritt: Der Export ist ein Nebenprodukt.
  // Scheitert er, ist der Lauf trotzdem erfolgreich gewesen -- alles
  // Wesentliche steht bereits in der Datenbank.
  try {
    const ergebnis = await erzeugeSnapshot(
      sb,
      { id: process.env.GITHUB_RUN_ID ?? null, beendetAm: new Date().toISOString() },
      {
        // Laufkennwerte, die in KEINER Tabelle stehen (Abschnitt 8). Nur
        // dieser Lauf kennt sie, deshalb werden sie hier hereingereicht --
        // ein Export ohne Lauf schreibt an ihrer Stelle `null` und nicht 0.
        //
        // Gezaehlt wird, was `ermittleLueckencodeOhnePreis` aus der
        // Titelzeile entscheidet, also der Immowelt-Fall. Die ZVG-Zeilen
        // ohne Verkehrswert bleiben bewusst draussen: Die beiden Codes
        // stammen aus A13s Titelzeilen-Unterscheidung, und welchem von
        // beiden eine gelesene, aber wertlose ZVG-Bekanntmachung entspraeche,
        // ist nicht entschieden. Sie hier einem der beiden zuzuschlagen waere
        // geraten.
        uebersprungeneJeLauf: zaehleOhnePreis(immoweltOhnePreis),
        meldebudget: {
          gesendet: meldebudget.verbraucht(),
          hoechstens: MAX_MELDUNGEN_JE_LAUF,
          zurueckgestellt: meldebudget.zurueckgestellt(),
        },
      },
      new Date()
    );
    console.log(
      `Snapshot geschrieben: ${ergebnis.pfad} — ${ergebnis.objekte} Objekte, ` +
        `${(ergebnis.bytes / 1_048_576).toFixed(2)} MB (${ergebnis.bytes} Bytes).`
    );
  } catch (err) {
    console.error("Snapshot-Export fehlgeschlagen:", err);
  }

  console.log("Lauf abgeschlossen.");
}

main().catch((err) => {
  console.error("Pipeline-Fehler:", err);
  process.exitCode = 1;
});
