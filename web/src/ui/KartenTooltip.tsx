/**
 * Das Tooltip der Karte -- sofort, gestaltet, an die Form geheftet.
 *
 * Ersetzt das verzoegerte, unformatierte Browser-Tooltip. Es ist rein optisch
 * (`aria-hidden`): Den Namen fuer Screenreader traegt `aria-label` an der
 * Form, sonst wuerde alles doppelt vorgelesen.
 *
 * Die Platzierung rechnet `platziereTooltip` (rein, getestet). Hier wird nur
 * gemessen und gesetzt -- in einem Layout-Effekt, also vor dem ersten Bild;
 * bis dahin ist das Tooltip unsichtbar, damit es nie an der falschen Stelle
 * aufblitzt.
 *
 * Dass der Layout-Effekt Zustand setzt, ist hier bewusst: Die eigene Groesse
 * ist erst nach dem Einhaengen messbar, und ein `useEffect` liefe zu spaet --
 * das Tooltip stuende ein Bild lang an der falschen Stelle.
 *
 * Es gibt KEINE Animation, also auch nichts, was `prefers-reduced-motion`
 * abschalten muesste -- das ist Absicht: Ein Tooltip, das einblendet, ist
 * nicht mehr sofort.
 *
 * GEMESSEN statt geglaubt (2026-09-20, 1440x900): Der Plan erwartete, dass
 * das Tooltip an der OBERSTEN Kachel (SH) nach unten klappt. Tat es nicht --
 * und das ist richtig so: Die Karte beginnt weit unten im Fenster, SH lag bei
 * y=440..463, ueber der Kachel waren also 440 px frei; das Tooltip stand bei
 * y=299,6. Erst als SH an den oberen Rand gescrollt war (y=-75), klappte es
 * nach unten (Tooltip y=10,0). Die Regel ist "klappen, wenn oben kein Platz
 * ist", nicht "klappen, wenn die Kachel die oberste ist".
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { TooltipText } from "../logik/kartentexte.ts";
import { platziereTooltip, type Rechteck, type TooltipLage } from "../logik/tooltipPosition.ts";

export interface TooltipZiel {
  anker: Rechteck;
  text: TooltipText;
}

export function KartenTooltip({ ziel }: { ziel: TooltipZiel }) {
  const huelle = useRef<HTMLDivElement>(null);
  const [lage, setLage] = useState<TooltipLage | null>(null);

  useLayoutEffect(() => {
    const element = huelle.current;
    if (element === null) return;
    setLage(
      platziereTooltip(
        ziel.anker,
        { breite: element.offsetWidth, hoehe: element.offsetHeight },
        { breite: document.documentElement.clientWidth, hoehe: window.innerHeight }
      )
    );
  }, [ziel]);

  return (
    <div
      ref={huelle}
      className="kartentooltip"
      aria-hidden="true"
      style={lage === null ? { visibility: "hidden" } : { left: lage.links, top: lage.oben }}
    >
      <b className="kartentooltip__titel">{ziel.text.titel}</b>
      {ziel.text.zeilen.map((zeile) => (
        <span key={zeile} className="kartentooltip__zeile">
          {zeile}
        </span>
      ))}
      <em className="kartentooltip__hinweis">{ziel.text.hinweis}</em>
    </div>
  );
}
