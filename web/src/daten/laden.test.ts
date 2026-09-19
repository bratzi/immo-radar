import { describe, expect, it } from "vitest";
import { MELDE_ABSTAND_MS, erwarteteBytes, gueltigesZiel, sollMelden } from "./laden.ts";

describe("erwarteteBytes -- gegen welche Zahl darf der Fortschritt gemessen werden?", () => {
  it("nimmt Content-Length, wenn die Antwort unkomprimiert kommt", () => {
    expect(erwarteteBytes(new Headers({ "content-length": "24705879" }))).toBe(24705879);
  });

  it("nimmt sie NICHT, wenn die Antwort komprimiert ist: gelesen werden dekomprimierte Bytes", () => {
    // Der gemessene Fehler: "23.5 von 3.2 MB". Content-Length ist die Groesse auf der
    // Leitung, getReader() liefert die dekomprimierte.
    for (const kodierung of ["gzip", "br", "deflate", "zstd", "GZIP"]) {
      expect(
        erwarteteBytes(new Headers({ "content-length": "3300000", "content-encoding": kodierung }))
      ).toBeNull();
    }
  });

  it("behandelt 'identity' wie keine Kodierung", () => {
    expect(
      erwarteteBytes(new Headers({ "content-length": "1000", "content-encoding": "identity" }))
    ).toBe(1000);
  });

  it("meldet 'unbekannt', wenn der Kopf fehlt oder Unsinn enthaelt", () => {
    expect(erwarteteBytes(new Headers())).toBeNull();
    expect(erwarteteBytes(new Headers({ "content-length": "abc" }))).toBeNull();
    expect(erwarteteBytes(new Headers({ "content-length": "0" }))).toBeNull();
  });
});

describe("gueltigesZiel -- nie ein Ziel melden, das schon ueberschritten ist", () => {
  it("behaelt das Ziel, solange nicht mehr gelesen ist als erwartet", () => {
    expect(gueltigesZiel(1000, 0)).toBe(1000);
    expect(gueltigesZiel(1000, 1000)).toBe(1000);
  });

  it("gibt das Ziel auf, sobald mehr gelesen wurde -- dann stimmte der Massstab nicht", () => {
    expect(gueltigesZiel(1000, 1001)).toBeNull();
  });

  it("erfindet keins", () => {
    expect(gueltigesZiel(null, 500)).toBeNull();
  });
});

describe("sollMelden -- ein React-Update je Netzwerk-Paket war zu viel", () => {
  it("laesst die erste Meldung immer durch", () => {
    expect(sollMelden(null, 0)).toBe(true);
  });

  it("haelt Meldungen innerhalb des Abstands zurueck", () => {
    expect(sollMelden(1000, 1000 + MELDE_ABSTAND_MS - 1)).toBe(false);
  });

  it("laesst sie nach dem Abstand wieder durch", () => {
    expect(sollMelden(1000, 1000 + MELDE_ABSTAND_MS)).toBe(true);
  });
});
