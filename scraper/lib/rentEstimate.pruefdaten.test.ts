/**
 * Haelt die 95 handrecherchierten Werte in REGIONALE_MIETE_PRO_M2 gegen die
 * INKAR-Referenz (Backlog A11 Schritt 3, Abnahme C-1).
 *
 * Die Pruefdatei `mietPruefdaten.generated.json` entsteht mit
 * `npx tsx scripts/erzeuge-mietpruefdaten.mts` und liegt im Repo, damit
 * dieser Test ohne Netz laeuft.
 *
 * DREI WACHEN, damit ein gruener Lauf etwas bedeutet:
 *  1. Eine leere oder referenzlose Pruefdatei faellt durch, statt trivial zu
 *     bestehen.
 *  2. Eine kuenstlich um 30 % verschobene Tabelle MUSS durchfallen -- in
 *     beide Richtungen. Das ist der Beleg, dass der Test ueberhaupt rot
 *     werden kann; die Abnahme verlangt ihn ausdruecklich.
 *  3. Ein Zweisteller, den INKAR kennt und die Tabelle nicht, faellt auf --
 *     ausser den bekannten Grossempfaenger-Postleitzahlen.
 */
import { describe, expect, it } from "vitest";
import pruefdaten from "./mietPruefdaten.generated.json" with { type: "json" };
import { REGIONALE_MIETE_PRO_M2 } from "./rentEstimate.js";

/**
 * Erlaubte Abweichung. Sie deckt dreierlei ab: die ganzzahlige Rundung der
 * INKAR-Schnittstelle (rund ±5,6 % bei 9 €/m²), den Abstand zwischen dem
 * Erhebungsjahr der Referenz und heute, und die Tatsache, dass ein
 * PLZ-Zweisteller mehr umfasst als seine Kernstadt.
 */
const TOLERANZ = 0.25;

/**
 * Zweisteller, die INKAR kennt und die Tabelle bewusst nicht fuehrt.
 * `11` sind die Berliner Grossempfaenger-Postleitzahlen (Bundestag,
 * Behoerden, Grossfirmen) -- dort steht kein Wohnobjekt zum Verkauf.
 */
const OHNE_WOHNOBJEKTE = new Set(["11"]);

interface Abweichung {
  zweisteller: string;
  wert: number;
  referenz: number;
  anteil: number;
}

/**
 * Die eine Stelle, an der verglichen wird. Beide Faelle unten rufen SIE auf,
 * der echte wie der verschobene -- ein nachgebauter Vergleich im Test wuerde
 * nur sich selbst pruefen.
 */
function abweichungen(tabelle: Record<string, number>): Abweichung[] {
  const ergebnis: Abweichung[] = [];
  for (const [zweisteller, wert] of Object.entries(tabelle)) {
    const referenz = pruefdaten.zweisteller[zweisteller as keyof typeof pruefdaten.zweisteller]
      ?.referenz;
    if (referenz === null || referenz === undefined) continue;
    ergebnis.push({ zweisteller, wert, referenz, anteil: (wert - referenz) / referenz });
  }
  return ergebnis;
}

const verschiebe = (tabelle: Record<string, number>, faktor: number): Record<string, number> =>
  Object.fromEntries(Object.entries(tabelle).map(([zs, wert]) => [zs, wert * faktor]));

describe("REGIONALE_MIETE_PRO_M2 gegen INKAR 2113", () => {
  it("die Pruefdatei traegt Referenzen fuer fast alle Werte der Tabelle", () => {
    // Wache: Eine leere Pruefdatei liesse jeden Vergleich unten trivial
    // bestehen, weil ohne Referenz uebersprungen wird.
    const geprueft = abweichungen(REGIONALE_MIETE_PRO_M2);
    expect(Object.keys(REGIONALE_MIETE_PRO_M2).length).toBeGreaterThanOrEqual(95);
    expect(geprueft.length).toBe(Object.keys(REGIONALE_MIETE_PRO_M2).length);
  });

  it("jeder Wert liegt innerhalb von 25 Prozent der Referenz", () => {
    const ausserhalb = abweichungen(REGIONALE_MIETE_PRO_M2).filter(
      (a) => Math.abs(a.anteil) > TOLERANZ,
    );
    const bericht = ausserhalb
      .map(
        (a) =>
          `${a.zweisteller}: Tabelle ${a.wert} gegen INKAR ${a.referenz.toFixed(2)} ` +
          `(${(a.anteil * 100).toFixed(1)} %)`,
      )
      .join("; ");
    expect(bericht).toBe("");
  });

  it("eine um 30 Prozent verschobene Tabelle faellt durch -- in beide Richtungen", () => {
    // Ohne diesen Fall waere nicht belegt, dass der Vergleich oben ueberhaupt
    // rot werden kann. Die Abnahme von A11 verlangt genau ihn.
    for (const faktor of [1.3, 0.7]) {
      const ausserhalb = abweichungen(verschiebe(REGIONALE_MIETE_PRO_M2, faktor)).filter(
        (a) => Math.abs(a.anteil) > TOLERANZ,
      );
      expect(ausserhalb.length).toBeGreaterThan(0);
    }
  });

  it("jeder Zweisteller mit Referenz steht in der Tabelle", () => {
    const fehlend = Object.entries(pruefdaten.zweisteller)
      .filter(([zs, eintrag]) => eintrag.referenz !== null && !OHNE_WOHNOBJEKTE.has(zs))
      .map(([zs]) => zs)
      .filter((zs) => REGIONALE_MIETE_PRO_M2[zs] === undefined);
    expect(fehlend).toEqual([]);
  });
});
