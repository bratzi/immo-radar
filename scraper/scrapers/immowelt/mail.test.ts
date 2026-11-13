import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseImmoweltMail, expose, immoweltMailQuelle, type MailQuelle } from "./mail.js";

const html = readFileSync(new URL("../../test/fixtures/immowelt-mail/bestaetigung.html", import.meta.url), "utf8");

describe("parseImmoweltMail", () => {
  it("liest die fuenf Trefferkarten der Bestaetigungsmail", () => {
    const k = parseImmoweltMail(html);
    expect(k).toHaveLength(5);
    expect(k[0]).toMatchObject({ preisCents: 85_000, titel: "Wohnung zur Miete", zimmer: 1, flaecheM2: 30, plz: "80797", stadtteil: "Schwabing-West" });
    expect(k[0].klickUrl.startsWith("https://click.by.immowelt.de/")).toBe(true);
    expect(k[3].titel).toBe("Wohnung zur Miete auf Zeit");
  });

  it("Mail ohne Karten ergibt eine leere Liste", () => {
    expect(parseImmoweltMail("<html><body>Hallo</body></html>")).toEqual([]);
  });
});

describe("expose", () => {
  it("liest die Expose-ID aus der Weiterleitung", () => {
    expect(expose("https://www.immowelt.de/expose/08b977b0-7083-42af-af56-5debbd489e46?utm=x")).toEqual({
      id: "08b977b0-7083-42af-af56-5debbd489e46", url: "https://www.immowelt.de/expose/08b977b0-7083-42af-af56-5debbd489e46",
    });
    expect(expose("https://www.immowelt.de/suche")).toBeNull();
  });
});

describe("immoweltMailQuelle.sweep", () => {
  it("macht aus Mailkarten Angebote mit Kaltmiete; nicht aufloesbare Links werden uebersprungen", async () => {
    const quelle: MailQuelle = {
      mails: async () => [html],
      folgeLink: async (u) => (u.endsWith("nKg") ? "https://www.immowelt.de/expose/aaaa-1111" : null),
    };
    const q = immoweltMailQuelle(quelle);
    const e = await q.sweep({} as never, 10_000);
    expect(e.status).toBe("ok");
    expect(e.vollstaendig).toBe(false);
    expect(e.angebote).toHaveLength(1);
    expect(e.angebote[0]).toMatchObject({ quelle: "immowelt", externalId: "aaaa-1111", kaltmieteCents: 85_000, zimmer: 1, flaecheM2: 30, plz: "80797" });
  });

  it("IMAP-Fehler ergibt Status fehler", async () => {
    const q = immoweltMailQuelle({ mails: async () => { throw new Error("auth"); }, folgeLink: async () => null });
    expect((await q.sweep({} as never, 10_000)).status).toBe("fehler");
  });
});
