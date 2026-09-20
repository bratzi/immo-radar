/**
 * Wann ein Ereignis ein Tooltip oeffnen darf -- eine reine Entscheidung,
 * damit sie ohne Browser pruefbar ist.
 *
 * Zwei Faelle sind ausdruecklich KEIN Hover, obwohl der Browser dieselben
 * Ereignisse schickt:
 *
 *   Fingertipp  Ein Tipp ist ein Klick. Ein Tooltip, das dabei aufblitzt und
 *               sofort wieder verschwindet, ist Rauschen.
 *   Klickfokus  Ein Klick setzt Fokus. Ohne diese Pruefung bliebe nach jedem
 *               Klick auf eine Kachel ein Tooltip stehen, obwohl der Zeiger
 *               laengst weg ist. Nur echter Tastaturfokus zaehlt.
 */
export type TooltipAusloeser =
  | { art: "zeiger"; zeigerArt: string }
  | { art: "fokus"; fokusSichtbar: boolean };

export function oeffnetTooltip(ausloeser: TooltipAusloeser): boolean {
  if (ausloeser.art === "zeiger") return ausloeser.zeigerArt !== "touch";
  return ausloeser.fokusSichtbar;
}
