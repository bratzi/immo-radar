/**
 * Wohin das Tooltip der Karte kommt -- eine reine Rechnung, damit sie ohne
 * Browser pruefbar ist. Alle Werte sind Bildschirmkoordinaten (Viewport).
 *
 * Bevorzugt ueber dem Anker, mittig; klappt nach unten, wenn oben kein Platz
 * ist; bleibt in jedem Fall im Behaelter.
 */
export interface Rechteck {
  x: number;
  y: number;
  breite: number;
  hoehe: number;
}

export interface Groesse {
  breite: number;
  hoehe: number;
}

export interface TooltipLage {
  links: number;
  oben: number;
  unterhalb: boolean;
}

export function platziereTooltip(
  anker: Rechteck,
  tooltip: Groesse,
  behaelter: Groesse,
  abstand = 8
): TooltipLage {
  const platzOben = anker.y - abstand - tooltip.hoehe;
  const unterhalb = platzOben < 0;
  const gewuenscht = unterhalb ? anker.y + anker.hoehe + abstand : platzOben;
  const oben = Math.min(Math.max(0, gewuenscht), Math.max(0, behaelter.hoehe - tooltip.hoehe));

  const mitte = anker.x + anker.breite / 2 - tooltip.breite / 2;
  const links = Math.min(Math.max(0, mitte), Math.max(0, behaelter.breite - tooltip.breite));

  return { links, oben, unterhalb };
}
