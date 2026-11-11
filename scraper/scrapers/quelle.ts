import type { Angebot, Quelle as QuellenName } from "../lib/typen.js";
import type { Sperre } from "./sperre.js";

/** Eine geladene Seite, wie sie `erkenneSperre` braucht. */
export interface Antwort { status: number; html: string; url: string }

/**
 * Seitenabruf, von Playwright getrennt: die Quelle kennt nur `hole` und
 * `warte`, damit Sweep-Logik und Pipeline ohne Browser testbar sind.
 */
export interface Abrufer {
  hole(url: string): Promise<Antwort>;
  warte(ms: number): Promise<void>;
}

export interface SweepErgebnis {
  angebote: Angebot[];
  /** true nur, wenn das Ende der Trefferliste erreicht wurde. */
  vollstaendig: boolean;
  status: "ok" | "gesperrt" | "fehler";
  hinweis: string | null;
}

/** `angebot: null` heisst ausschliessen (z. B. Gesuch, Tausch). */
export interface DetailErgebnis { angebot: Angebot | null; sperre: Sperre | null }

export interface Quelle {
  name: QuellenName;
  /** Deaktivierte Quellen bleiben verdrahtet, werden aber nicht abgerufen. */
  aktiv: boolean;
  sweep(ab: Abrufer, budgetMs: number): Promise<SweepErgebnis>;
  ladeDetail(ab: Abrufer, a: Angebot): Promise<DetailErgebnis>;
}
