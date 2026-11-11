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
import { pruefeProfil } from "./profil.js";
import { berechnePunkte } from "./reihung.js";
import { ladeBekannte, markiereVerschwunden, speichereAngebote, zuZeile } from "./angebote.js";
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
  return b.passt === "ja" && (b.warmmieteQuelle === "geschaetzt" || b.bildUrls.length === 0);
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
  let details = 0;
  const ergebnis: Bewertet[] = [];
  for (const roh of sweep.angebote) {
    let b = bewerte(roh, jetzt);
    if (status === "ok" && details < deps.maxDetails && brauchtDetail(b)) {
      details++;
      const d = await quelle.ladeDetail(ab, roh);
      if (d.sperre) {
        status = "gesperrt";
        hinweis = [hinweis, `Detail gesperrt (${d.sperre})`].filter(Boolean).join("; ");
      } else if (d.angebot === null) {
        continue;
      } else {
        b = bewerte(d.angebot, jetzt);
      }
    }
    ergebnis.push(b);
  }

  const zuSpeichern = ergebnis.filter((b) => b.passt !== "nein" || bekannte.has(b.externalId));
  await speichereAngebote(sb, zuSpeichern.map((b) => zuZeile(b, b, b.punkte, jetzt)));
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
