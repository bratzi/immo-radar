import { describe, it, expect, vi } from "vitest";
import {
  erstelleMeldebudget,
  mietstufeFuerQuelle,
  KONTINGENT_NUR_LANDESWEIT,
  type Mietstufe,
} from "./meldebudget.js";

describe("erstelleMeldebudget", () => {
  it("laesst bis zum Maximum senden", () => {
    const b = erstelleMeldebudget(2);
    expect(b.darfSenden()).toBe(true);
    b.verbuchen();
    expect(b.darfSenden()).toBe(true);
    b.verbuchen();
    expect(b.darfSenden()).toBe(false);
  });

  it("zaehlt Gesendetes und Zurueckgestelltes getrennt", () => {
    const b = erstelleMeldebudget(1);
    b.verbuchen();
    b.zurueckstellen();
    b.zurueckstellen();
    expect(b.verbraucht()).toBe(1);
    expect(b.zurueckgestellt()).toBe(2);
  });

  it("sendet bei einem Budget von 0 gar nicht", () => {
    expect(erstelleMeldebudget(0).darfSenden()).toBe(false);
  });

  it("verbraucht beim blossen Nachfragen nichts", () => {
    // Sonst wuerde eine Pruefung, die zu keinem Versand fuehrt, das Budget
    // aufzehren -- und die Meldungen blieben aus, ohne dass jemand es merkt.
    const b = erstelleMeldebudget(1);
    b.darfSenden();
    b.darfSenden();
    expect(b.verbraucht()).toBe(0);
    expect(b.darfSenden()).toBe(true);
  });
});

/**
 * Das getrennte Kontingent (Abnahmekriterium D-5).
 *
 * DAS GEMESSENE PROBLEM: Das Budget ist dauerhaft ausgeschoepft -- zuletzt
 * 25 gesendet, 117 zurueckgestellt. Die Kandidatenliste wird von der
 * groebsten Mietstufe beherrscht: "nur landesweit geschaetzt" stellt 339 der
 * 409 Meldekandidaten. Ein Objekt mit BELEGTER oder PLZ-genauer Miete steht
 * damit hinter Dutzenden Schaetzungen an, ueber Wochen hinweg. Falsch war
 * also nicht die Menge, sondern die REIHENFOLGE.
 *
 * Es faellt nichts weg: landesweit geschaetzte Objekte melden weiter, nur
 * nicht mehr vor den besser belegten -- und freie Plaetze fuellen sie am
 * Ende des Laufs auf.
 */
describe("Meldebudget mit getrenntem Kontingent", () => {
  it("ordnet jede Mietquelle der richtigen Stufe zu", () => {
    // Die Zuordnung haengt an der MietQuelle aus rentEstimate.ts, NICHT an
    // der abgeleiteten Datenluecke `miete_nur_bundeslandgenau`: die entsteht
    // erst in bewerteMietschaetzung und liegt dort in einem Topf mit den
    // Luecken, die die Quelle selbst beisteuert (sourceDataGaps).
    expect(mietstufeFuerQuelle("angegeben")).toBe("belegt_oder_plz_genau");
    expect(mietstufeFuerQuelle("geschaetzt_regional")).toBe("belegt_oder_plz_genau");
    expect(mietstufeFuerQuelle("geschaetzt_bundesland")).toBe("nur_landesweit");
    // Der Bundesschnitt ist noch groeber als das Bundesland und gehoert
    // erst recht nicht vor eine belegte Miete.
    expect(mietstufeFuerQuelle("geschaetzt_bundesweit")).toBe("nur_landesweit");
  });

  it("haelt die Plaetze jenseits des Kontingents fuer besser belegte Mieten frei", () => {
    const b = erstelleMeldebudget(25, 5);
    for (let i = 0; i < 5; i++) {
      expect(b.darfSenden("nur_landesweit")).toBe(true);
      b.verbuchen("nur_landesweit");
    }
    expect(b.darfSenden("nur_landesweit")).toBe(false);
    // ... und genau diese Plaetze stehen den besser belegten noch offen.
    expect(b.darfSenden("belegt_oder_plz_genau")).toBe(true);
  });

  it("laesst besser belegte Meldungen das ganze Budget nutzen", () => {
    // Sind weniger als 5 landesweite da, verfaellt deren Kontingent nicht:
    // die uebrigen duerfen bis zum Maximum senden.
    const b = erstelleMeldebudget(25, 5);
    for (let i = 0; i < 25; i++) {
      expect(b.darfSenden("belegt_oder_plz_genau")).toBe(true);
      b.verbuchen("belegt_oder_plz_genau");
    }
    expect(b.darfSenden("belegt_oder_plz_genau")).toBe(false);
    expect(b.verbraucht()).toBe(25);
  });

  it("verbraucht beim Nachfragen nach der landesweiten Stufe nichts", () => {
    const b = erstelleMeldebudget(25, 1);
    b.darfSenden("nur_landesweit");
    b.darfSenden("nur_landesweit");
    expect(b.verbraucht()).toBe(0);
    expect(b.darfSenden("nur_landesweit")).toBe(true);
  });

  it("fuellt freie Plaetze am Ende des Laufs mit zurueckgestellten landesweiten auf", async () => {
    // KEIN PLATZ DARF VERFALLEN. Kommen in einem Lauf nur 3 gut belegte
    // Kandidaten, blieben sonst 17 der 25 Plaetze leer -- der Durchsatz
    // saenke, und der Rueckstand von 117 wuechse weiter.
    const b = erstelleMeldebudget(25, 5);
    const gesendet: string[] = [];

    for (let i = 0; i < 3; i++) {
      expect(b.darfSenden("belegt_oder_plz_genau")).toBe(true);
      b.verbuchen("belegt_oder_plz_genau");
      gesendet.push(`belegt-${i}`);
    }
    for (let i = 0; i < 30; i++) {
      if (b.darfSenden("nur_landesweit")) {
        b.verbuchen("nur_landesweit");
        gesendet.push(`landesweit-${i}`);
      } else {
        b.zurueckstellen(async () => {
          gesendet.push(`landesweit-${i}`);
          b.verbuchen("nur_landesweit");
        });
      }
    }

    // Vor dem Nachholen: nur das Kontingent ist raus.
    expect(b.verbraucht()).toBe(8);

    await b.holeNach();

    // Die Gesamtzahl bleibt 25 -- nicht mehr, aber eben auch nicht weniger.
    expect(b.verbraucht()).toBe(25);
    expect(gesendet).toHaveLength(25);
    // Reihenfolge innerhalb der Gruppe bleibt: erst die belegten, dann die
    // landesweiten in der Reihenfolge, in der sie aufliefen.
    expect(gesendet.slice(0, 3)).toEqual(["belegt-0", "belegt-1", "belegt-2"]);
    expect(gesendet.slice(3, 9)).toEqual([
      "landesweit-0",
      "landesweit-1",
      "landesweit-2",
      "landesweit-3",
      "landesweit-4",
      "landesweit-5",
    ]);
    // 33 angeboten (3 belegt, 30 landesweit), 25 gesendet: 8 bleiben
    // zurueckgestellt und werden im naechsten Lauf nachgeholt.
    expect(b.zurueckgestellt()).toBe(8);
  });

  it("holt nichts nach, wenn das Gesamtbudget aufgebraucht ist", async () => {
    const b = erstelleMeldebudget(2, 0);
    b.verbuchen("belegt_oder_plz_genau");
    b.verbuchen("belegt_oder_plz_genau");
    const gesendet: string[] = [];
    b.zurueckstellen(async () => {
      gesendet.push("landesweit");
      b.verbuchen("nur_landesweit");
    });

    await b.holeNach();

    expect(gesendet).toEqual([]);
    expect(b.verbraucht()).toBe(2);
    expect(b.zurueckgestellt()).toBe(1);
  });

  it("laesst den Lauf weiterlaufen, wenn eine Nachholung scheitert", async () => {
    // Ein einzelner fehlgeschlagener Versand darf weder den Rest der
    // Nachholliste verschlucken noch main() vor dem Bestandsabgleich
    // abbrechen -- dessen Kill traefe Markieren und Loeschen mit.
    const b = erstelleMeldebudget(25, 0);
    const gesendet: string[] = [];
    b.zurueckstellen(async () => {
      throw new Error("Telegram HTTP 403");
    });
    b.zurueckstellen(async () => {
      gesendet.push("zweite");
      b.verbuchen("nur_landesweit");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await b.holeNach();

    expect(gesendet).toEqual(["zweite"]);
    expect(b.verbraucht()).toBe(1);
    // Die gescheiterte gilt weiter als zurueckgestellt -- ohne Zeile in
    // `notifications` holt der naechste Lauf sie nach.
    expect(b.zurueckgestellt()).toBe(1);
    warnSpy.mockRestore();
  });

  it("verhaelt sich mit Kontingent gleich Maximum exakt wie das Budget davor", async () => {
    // DIE SICHERHEITSLEINE. Entscheidet der Nutzer anders, wird das
    // Kontingent auf das Maximum gesetzt und der alte Zustand ist ohne
    // Rueckstand wiederhergestellt. Verglichen wird gegen eine Nachbildung
    // des Standes vor dieser Aenderung: gesendet, solange gesendet < max.
    const folge: Mietstufe[] = Array.from({ length: 60 }, (_, i) =>
      i % 3 === 0 ? "belegt_oder_plz_genau" : "nur_landesweit"
    );

    let altGesendet = 0;
    let altVerschoben = 0;
    const altEntscheidungen: boolean[] = [];
    for (let i = 0; i < folge.length; i++) {
      if (altGesendet < 25) {
        altEntscheidungen.push(true);
        altGesendet += 1;
      } else {
        altEntscheidungen.push(false);
        altVerschoben += 1;
      }
    }

    const neu = erstelleMeldebudget(25, 25);
    const neuEntscheidungen: boolean[] = [];
    const nachgeholt: number[] = [];
    folge.forEach((stufe, i) => {
      if (neu.darfSenden(stufe)) {
        neuEntscheidungen.push(true);
        neu.verbuchen(stufe);
      } else {
        neuEntscheidungen.push(false);
        neu.zurueckstellen(async () => {
          nachgeholt.push(i);
          neu.verbuchen(stufe);
        });
      }
    });
    await neu.holeNach();

    expect(neuEntscheidungen).toEqual(altEntscheidungen);
    expect(neu.verbraucht()).toBe(altGesendet);
    expect(neu.zurueckgestellt()).toBe(altVerschoben);
    // Nachgeholt wird nichts: ein aufgebrauchtes Gesamtbudget laesst keinen
    // Platz frei, den ein Nachzuegler fuellen koennte.
    expect(nachgeholt).toEqual([]);
  });

  it("nutzt ohne ausdrueckliches Kontingent die benannte Konstante", () => {
    const b = erstelleMeldebudget(25);
    for (let i = 0; i < KONTINGENT_NUR_LANDESWEIT; i++) b.verbuchen("nur_landesweit");
    expect(b.darfSenden("nur_landesweit")).toBe(false);
    expect(b.darfSenden("belegt_oder_plz_genau")).toBe(true);
  });
});
