/**
 * Virtualisierung (N5: "Lange Listen werden virtualisiert").
 *
 * Selbst geschrieben statt als Abhaengigkeit geholt, und das ist eine
 * bewusste Wahl: Alle Zeilen dieser Oberflaeche sind gleich hoch, und fuer
 * feste Zeilenhoehen ist die ganze Rechnung ein Dutzend Zeilen. Eine
 * Bibliothek (`@tanstack/react-virtual` o. ae.) koennte zusaetzlich variable
 * Hoehen messen -- die gibt es hier nicht. Der Auftrag verlangt eine kurze,
 * begruendete Abhaengigkeitsliste; das hier ist die Begruendung, sie kurz
 * zu halten.
 *
 * DIE ZEILENHOEHE GEHOERT DEM JAVASCRIPT, nicht dem Stylesheet: Sie geht in
 * die Rechnung ein, und zwei Stellen mit derselben Zahl waeren genau der
 * Fehler, den dieses Projekt an anderer Stelle schon teuer bezahlt hat. Die
 * Komponente setzt sie als CSS-Variable am Behaelter, das Stylesheet liest
 * sie von dort.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Wie viele Zeilen ober- und unterhalb des Sichtfensters mitgezeichnet werden. */
const VORRAT = 6;

export const ZEILENHOEHE_BREIT = 64;
export const ZEILENHOEHE_SCHMAL = 104;
const SCHMAL_AB = "(max-width: 960px)";

/** Ein Objekt fuer alle Zeilen -- ein Literal in der Schleife waere je Bild und Zeile ein neues. */
const DURCHSICHTIG = { display: "contents" } as const;

/**
 * Die Zeilenhoehe des aktuellen Fensters. Bei schmalen Fenstern wird die
 * Zeile zweizeilig (Sache oben, Band und Zahlen darunter) und damit hoeher.
 */
export function useZeilenhoehe(): number {
  const [schmal, setSchmal] = useState(
    () => typeof window !== "undefined" && window.matchMedia(SCHMAL_AB).matches
  );

  useEffect(() => {
    const abfrage = window.matchMedia(SCHMAL_AB);
    const beiAenderung = (ereignis: MediaQueryListEvent) => setSchmal(ereignis.matches);
    abfrage.addEventListener("change", beiAenderung);
    setSchmal(abfrage.matches);
    return () => abfrage.removeEventListener("change", beiAenderung);
  }, []);

  return schmal ? ZEILENHOEHE_SCHMAL : ZEILENHOEHE_BREIT;
}

interface Eigenschaften<T> {
  eintraege: readonly T[];
  zeilenhoehe: number;
  /** Hoehe, ab der die Liste selbst blaettert statt die Seite zu verlaengern. */
  maxHoehe: number;
  schluessel: (eintrag: T, index: number) => string;
  zeichne: (eintrag: T, index: number, oben: number) => ReactNode;
}

export function VirtuelleListe<T>({
  eintraege,
  zeilenhoehe,
  maxHoehe,
  schluessel,
  zeichne,
}: Eigenschaften<T>) {
  const behaelter = useRef<HTMLDivElement>(null);
  const [oben, setOben] = useState(0);
  const [sichtHoehe, setSichtHoehe] = useState(maxHoehe);

  const gesamtHoehe = eintraege.length * zeilenhoehe;
  const hoehe = Math.min(maxHoehe, Math.max(zeilenhoehe, gesamtHoehe));

  // Nach jeder Aenderung der Menge zurueck an den Anfang: Sonst steht die
  // Liste nach einem Filterwechsel mitten im Nichts, und der Nutzer sieht
  // eine leere Flaeche, obwohl es Treffer gibt.
  useLayoutEffect(() => {
    if (behaelter.current !== null) behaelter.current.scrollTop = 0;
    setOben(0);
  }, [eintraege]);

  useLayoutEffect(() => {
    const element = behaelter.current;
    if (element === null) return;
    const messen = () => setSichtHoehe(element.clientHeight);
    messen();
    if (typeof ResizeObserver === "undefined") return;
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(element);
    return () => beobachter.disconnect();
  }, []);

  const ersteSichtbare = Math.max(0, Math.floor(oben / zeilenhoehe) - VORRAT);
  const anzahlSichtbar = Math.ceil(sichtHoehe / zeilenhoehe) + VORRAT * 2;
  const letzteSichtbare = Math.min(eintraege.length, ersteSichtbare + anzahlSichtbar);

  const gezeichnet: ReactNode[] = [];
  for (let i = ersteSichtbare; i < letzteSichtbare; i += 1) {
    const eintrag = eintraege[i];
    if (eintrag === undefined) continue;
    gezeichnet.push(
      <div key={schluessel(eintrag, i)} style={DURCHSICHTIG}>
        {zeichne(eintrag, i, i * zeilenhoehe)}
      </div>
    );
  }

  return (
    <div
      className="liste"
      ref={behaelter}
      style={{ height: `${hoehe}px`, ["--zeile-hoehe" as string]: `${zeilenhoehe}px` }}
      onScroll={(ereignis) => setOben(ereignis.currentTarget.scrollTop)}
    >
      <div className="liste__fuellung" style={{ height: `${gesamtHoehe}px` }}>
        {gezeichnet}
      </div>
    </div>
  );
}
