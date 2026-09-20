/**
 * Ob die Karte auf schmalen Bildschirmen aufgeklappt ist -- und dass die Seite
 * sich das merkt.
 *
 * `localStorage` ist hier NIE verlaesslich: Blockierte Website-Daten, ein
 * privates Fenster oder ein voller Speicher lassen schon den ZUGRIFF auf
 * `window.localStorage` werfen. Deshalb steckt jeder Zugriff in einem
 * `try/catch`, und im Zweifel ist die Karte OFFEN: Eine versteckte Karte ist
 * ein Fehler, den man nicht sieht; eine offene Karte kostet nur Platz.
 */
export const KARTE_OFFEN_SCHLUESSEL = "immo-radar.karte-offen";

export function liesKarteOffen(speicher: Pick<Storage, "getItem"> | null): boolean {
  try {
    return speicher?.getItem(KARTE_OFFEN_SCHLUESSEL) !== "0";
  } catch {
    return true;
  }
}

export function schreibeKarteOffen(
  speicher: Pick<Storage, "setItem"> | null,
  offen: boolean
): void {
  try {
    speicher?.setItem(KARTE_OFFEN_SCHLUESSEL, offen ? "1" : "0");
  } catch {
    // Gesperrt oder voll: dann wird eben nichts gemerkt.
  }
}

/** Der Speicher, oder `null` -- auch dann, wenn schon der Zugriff wirft. */
export function holeSpeicher(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
