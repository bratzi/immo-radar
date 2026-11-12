/**
 * Bruch-Erkennung fuer die Routine "Reparatur"
 * (Spec docs/superpowers/specs/2026-11-12-routine-reparatur-design.md).
 * Reine Funktionen ohne Netz; pruefe-brueche.mts liest die Laeufe und fuehrt
 * die geplanten Aktionen mit `gh` aus.
 */

export interface LaufKurz { status: string; gesehen: number; gestartet_am: string }
export type Befund = { quelle: string; art: "bruch" | "sperre" | "erholt"; seit: string };
export interface OffenesIssue { number: number; title: string; labels: string[] }
export type Aktion =
  | { typ: "anlegen"; titel: string; label: "reparatur" | "sperre"; text: string }
  | { typ: "kommentar"; nummer: number; text: string };

/** Bruchverdacht: Fehler, oder ein "ok"-Lauf, der nichts gesehen hat. Sperren zaehlen nicht. */
const kaputt = (l: LaufKurz) => l.status === "fehler" || (l.status === "ok" && l.gesehen === 0);
const gut = (l: LaufKurz) => l.status === "ok" && l.gesehen > 0;

/** `laeufe` neueste zuerst. */
export function bewerteQuelle(quelle: string, laeufe: LaufKurz[]): Befund | null {
  const [a, b, c] = laeufe;
  if (!a) return null;
  if (gut(a)) return b && !gut(b) ? { quelle, art: "erholt", seit: a.gestartet_am } : null;
  if (b && kaputt(a) && kaputt(b)) return { quelle, art: "bruch", seit: b.gestartet_am };
  if (c && [a, b, c].every((l) => l.status === "gesperrt")) return { quelle, art: "sperre", seit: c.gestartet_am };
  return null;
}

export function issueTitel(art: "bruch" | "sperre", quelle: string): string {
  return art === "bruch" ? `Reparatur: ${quelle}` : `Sperre: ${quelle}`;
}

function text(b: Befund): string {
  if (b.art === "bruch") {
    return `Die Quelle **${b.quelle}** liefert seit Lauf ${b.seit} zweimal in Folge nichts ` +
      `(Status \`fehler\` oder 0 gesehen). Vermutlich hat sich die Seite geaendert.\n\n` +
      `Die Routine \`reparatur.yml\` versucht einen Reparatur-PR (kein Merge).`;
  }
  return `Die Quelle **${b.quelle}** ist seit Lauf ${b.seit} dreimal in Folge gesperrt.\n\n` +
    `Gegen Sperren wird nichts umgangen; die Pipeline pausiert die Quelle selbst. Keine Reparatur.`;
}

export function planeAktionen(befunde: Befund[], offen: OffenesIssue[]): Aktion[] {
  const aktionen: Aktion[] = [];
  for (const b of befunde) {
    if (b.art === "erholt") {
      for (const i of offen) {
        if (i.title === issueTitel("bruch", b.quelle) || i.title === issueTitel("sperre", b.quelle)) {
          aktionen.push({ typ: "kommentar", nummer: i.number, text: `${b.quelle} liefert wieder seit Lauf ${b.seit}. Issue bleibt offen; schliessen entscheidet der Nutzer.` });
        }
      }
      continue;
    }
    const titel = issueTitel(b.art, b.quelle);
    if (offen.some((i) => i.title === titel)) continue;
    aktionen.push({ typ: "anlegen", titel, label: b.art === "bruch" ? "reparatur" : "sperre", text: text(b) });
  }
  return aktionen;
}
