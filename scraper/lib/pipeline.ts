/**
 * Ein Lauf je Quelle: Pausenregel pruefen, Liste sweepen, Profil pruefen,
 * Details fuer Unklares nachladen, Angebote speichern, Lauf protokollieren.
 *
 * Bewusst OHNE Telegram (Nutzerentscheidung 2026-11-11): Ausgabe sind nur
 * die Tabellen `angebote` und `laeufe` sowie der Snapshot fuers Dashboard.
 * Eine Sperrwarnung steht deshalb als Hinweis im Laufprotokoll.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Angebot, Profilurteil } from "./typen.js";
import { bestimmeWarmmiete } from "./warmmiete.js";
import { pruefeProfil, PROFIL } from "./profil.js";
import { berechnePunkte } from "./reihung.js";
import { ladeBekannte, markiereVerschwunden, speichereAngebote, zuZeile, type Bekannt } from "./angebote.js";
import { ladeLetzteLaeufe, speichereLauf, type LaufZeile } from "./lauf.js";
import { naechsterVersuch } from "../scrapers/sperre.js";
import type { Abrufer, Quelle } from "../scrapers/quelle.js";

export interface PipelineDeps {
  sb: SupabaseClient;
  sweepBudgetMs: number;
  /** Deckel fuer Detailabrufe je Quelle und Lauf. */
  maxDetails: number;
  jetzt: Date;
}

export type Bewertet = Angebot & Profilurteil & { punkte: number };

export interface PipelineErgebnis {
  lauf: LaufZeile;
  angebote: Bewertet[];
  /** Gesetzt, wenn die Quelle wegen vorheriger Sperren pausiert (dann kein Abruf). */
  pausiertBis: string | null;
}

function bewerte(a: Angebot, jetzt: Date): Bewertet {
  const mitWarm = { ...a, ...bestimmeWarmmiete(a) };
  return { ...mitWarm, ...pruefeProfil(mitWarm), punkte: berechnePunkte(mitWarm, jetzt) };
}

/** Detail lohnt, wenn das Urteil offen ist oder nur auf geschaetzter Warmmiete beruht. */
function brauchtDetail(b: Bewertet): boolean {
  if (b.detailGeladen) return false;
  if (b.passt === "unklar") return true;
  // Ein Nein, das allein an der geschaetzten Warmmiete haengt, ist kein Beleg.
  if (b.passt === "nein" && b.warmmieteQuelle === "geschaetzt") {
    const harte = b.gruende.filter((g) => !g.endsWith("_unbekannt"));
    return harte.length === 1 && harte[0] === "warmmiete_zu_hoch";
  }
  return b.passt === "ja" && (b.warmmieteQuelle === "geschaetzt" || b.bildUrls.length === 0);
}

/**
 * Uebernimmt die Daten eines frueher geladenen Exposes, solange die Kaltmiete
 * gleich ist. Sonst wuerde jeder Lauf das Expose verwerfen, und bei mehr
 * Inseraten als Detailbudget fielen passende Wohnungen auf die Schaetzung
 * zurueck (Lauf 43188804756: ImmoScout 18 -> 4 passend).
 */
function mitGespeichertemExpose(a: Angebot, b: Bekannt | undefined): Angebot {
  const e = b?.expose;
  if (!e || a.detailGeladen || e.kaltmieteCents !== a.kaltmieteCents) return a;
  // Gespeichertes fuellt nur Luecken: eine Angabe aus der Liste ist neuer.
  return {
    ...a,
    nebenkostenCents: a.nebenkostenCents ?? e.nebenkostenCents,
    warmmieteCents: a.warmmieteCents ?? (e.warmmieteQuelle === "angegeben" ? e.warmmieteCents : null),
    balkon: a.balkon === "unbekannt" ? (e.balkon as Angebot["balkon"]) : a.balkon,
    balkonBeleg: a.balkonBeleg ?? e.balkonBeleg,
    verfuegbarAb: a.verfuegbarAb ?? e.verfuegbarAb,
    befristet: a.befristet ?? e.befristet,
    kautionCents: a.kautionCents ?? e.kautionCents ?? null,
    // Mehr Bilder aus dem Expose schlagen das Titelbild der Liste.
    bildUrls: (e.bildUrls?.length ?? 0) > a.bildUrls.length ? e.bildUrls! : a.bildUrls,
    detailGeladen: true,
    detailGeladenAm: e.am,
  };
}

/** Relative Angaben ("vor 2 Tagen") wandern mit jedem Lauf; der frueheste Wert gilt. */
function mitFruehestemOnlineSeit(a: Angebot, b: Bekannt | undefined): Angebot {
  const alt = b?.veroeffentlichtAm ?? null;
  if (!alt) return a;
  if (!a.veroeffentlichtAm || new Date(alt).getTime() < new Date(a.veroeffentlichtAm).getTime()) return { ...a, veroeffentlichtAm: alt };
  return a;
}

/** Rang fuer das knappe Detailbudget: passend vor unklar vor knapp zu teuer. */
function detailRang(b: Bewertet): number {
  if (b.passt === "ja") return 0;
  if (b.passt === "unklar") return 1;
  const ueber = b.warmmieteCents === null ? 1 : (b.warmmieteCents - PROFIL.warmmieteMaxCents) / PROFIL.warmmieteMaxCents;
  return 2 + Math.max(0, ueber);
}

/** Wie viele der juengsten Laeufe in Folge gesperrt waren, und wann der letzte war. */
async function sperrStand(deps: PipelineDeps, quelle: Quelle): Promise<{ inFolge: number; letzter: Date | null }> {
  const laeufe = await ladeLetzteLaeufe(deps.sb, quelle.name, 5);
  let inFolge = 0;
  for (const l of laeufe) { if (l.status !== "gesperrt") break; inFolge++; }
  return { inFolge, letzter: laeufe[0] ? new Date(laeufe[0].gestartet_am) : null };
}

export async function verarbeiteQuelle(deps: PipelineDeps, quelle: Quelle, ab: Abrufer): Promise<PipelineErgebnis> {
  const start = Date.now();
  const { jetzt, sb } = deps;
  const stand = await sperrStand(deps, quelle);
  const lauf = (teil: Partial<LaufZeile>): LaufZeile => ({
    quelle: quelle.name, gesehen: 0, passend: 0, unklar: 0, gemeldet: 0,
    vollstaendig: false, status: "ok", dauer_ms: Date.now() - start, hinweis: null, ...teil,
  });

  if (stand.letzter) {
    const frei = naechsterVersuch(stand.inFolge, stand.letzter);
    if (frei && frei > jetzt) {
      return { lauf: lauf({ status: "gesperrt", hinweis: `pausiert bis ${frei.toISOString()}` }), angebote: [], pausiertBis: frei.toISOString() };
    }
  }

  const warnung = (status: LaufZeile["status"], hinweis: string | null) =>
    status === "gesperrt" && stand.inFolge + 1 >= 3
      ? [hinweis, `WARNUNG: ${stand.inFolge + 1} Sperren in Folge`].filter(Boolean).join("; ")
      : hinweis;

  const sweep = await quelle.sweep(ab, deps.sweepBudgetMs);
  if (sweep.status !== "ok") {
    const z = lauf({ status: sweep.status, hinweis: warnung(sweep.status, sweep.hinweis) });
    await speichereLauf(sb, z);
    return { lauf: z, angebote: [], pausiertBis: null };
  }

  const bekannte = await ladeBekannte(sb, quelle.name);
  let status: LaufZeile["status"] = "ok";
  let hinweis = sweep.hinweis;
  const roh = sweep.angebote.map((a) => mitFruehestemOnlineSeit(mitGespeichertemExpose(a, bekannte.get(a.externalId)), bekannte.get(a.externalId)));
  const bewertet: (Bewertet | null)[] = roh.map((a) => bewerte(a, jetzt));
  const kandidaten = bewertet
    .map((b, i) => ({ b: b!, i }))
    .filter(({ b }) => brauchtDetail(b))
    .sort((x, y) => detailRang(x.b) - detailRang(y.b) || x.i - y.i)
    .slice(0, deps.maxDetails);
  for (const { i } of kandidaten) {
    if (status !== "ok") break;
    const d = await quelle.ladeDetail(ab, roh[i]);
    if (d.sperre) {
      status = "gesperrt";
      hinweis = [hinweis, `Detail gesperrt (${d.sperre})`].filter(Boolean).join("; ");
    } else if (d.angebot === null) {
      bewertet[i] = null;
    } else {
      bewertet[i] = bewerte(d.angebot, jetzt);
    }
  }
  const ergebnis = bewertet.filter((b): b is Bewertet => b !== null);

  // Seit 2026-11-12 wird alles Gesehene gespeichert, auch "nein": der Radar
  // filtert selbst und soll das Profil lockern koennen. Gesuch und Tausch
  // (Detail null) fallen oben schon heraus.
  await speichereAngebote(sb, ergebnis.map((b) => zuZeile(b, b, b.punkte, jetzt)));
  if (sweep.vollstaendig && status === "ok") {
    await markiereVerschwunden(sb, quelle.name, new Set(sweep.angebote.map((a) => a.externalId)), jetzt);
  }

  const z = lauf({
    gesehen: sweep.angebote.length,
    passend: ergebnis.filter((b) => b.passt === "ja").length,
    unklar: ergebnis.filter((b) => b.passt === "unklar").length,
    vollstaendig: sweep.vollstaendig, status, hinweis: warnung(status, hinweis),
  });
  await speichereLauf(sb, z);
  return { lauf: z, angebote: ergebnis, pausiertBis: null };
}
