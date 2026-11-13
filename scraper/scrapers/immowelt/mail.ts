/**
 * Immowelt ueber Suchauftrag-Mails (statt der Webseite, die CI per DataDome
 * sperrt). Der Lauf liest per IMAP die Immowelt-Mails der letzten Tage aus dem
 * Radar-Postfach (Secrets IMMOWELT_IMAP_USER/PASS), liest die Trefferkarten
 * und loest deren Klick-Links (click.by.immowelt.de, 302) zur Expose-ID auf.
 * Dabei wird immowelt.de selbst nicht aufgerufen.
 *
 * Kartenaufbau (Bestaetigungsmail 2026-11-13): je Karte Links mit
 * name="...price|title|criteria|location|button"; der Preis ist die Kaltmiete.
 */
import * as cheerio from "cheerio";
import { leeresAngebot, type Angebot } from "../../lib/typen.js";
import type { Quelle, SweepErgebnis } from "../quelle.js";

export interface MailKarte {
  klickUrl: string; preisCents: number | null; titel: string;
  zimmer: number | null; flaecheM2: number | null; plz: string | null; stadtteil: string | null;
}

const zahl = (s: string | undefined) => (s ? Number(s.replace(/\./g, "").replace(",", ".")) : null);

export function parseImmoweltMail(html: string): MailKarte[] {
  const $ = cheerio.load(html);
  const text = (el: cheerio.Cheerio<never>) => el.text().replace(/ /g, " ").replace(/\s+/g, " ").trim();
  const karten: MailKarte[] = [];
  $('a[name$="price"]').each((_, a) => {
    // Die Karte ist die naechste Tabelle, die auch Titel und Ort enthaelt.
    let box = $(a).closest("table");
    while (box.length && !box.find('a[name$="location"]').length) box = box.parent().closest("table");
    if (!box.length) return;
    const preis = text($(a) as never).match(/([\d.]+(?:,\d+)?)\s*€/);
    const kriterien = text(box.find('a[name$="criteria"]').first() as never);
    const ort = text(box.find('a[name$="location"]').first() as never);
    const ortTreffer = ort.match(/^(.*?),.*\((\d{5})\)/);
    karten.push({
      klickUrl: String($(a).attr("href") ?? ""),
      preisCents: preis ? Math.round(zahl(preis[1])! * 100) : null,
      titel: text(box.find('a[name$="title"]').first() as never),
      zimmer: zahl(kriterien.match(/([\d,]+)\s*Zimmer/)?.[1]),
      flaecheM2: zahl(kriterien.match(/([\d.,]+)\s*m²/)?.[1]),
      plz: ortTreffer?.[2] ?? ort.match(/\((\d{5})\)/)?.[1] ?? null,
      stadtteil: ortTreffer?.[1]?.trim() || null,
    });
  });
  return karten.filter((k) => k.klickUrl);
}

export function expose(url: string): { id: string; url: string } | null {
  const m = url.match(/^https:\/\/www\.immowelt\.de\/expose\/([A-Za-z0-9-]+)/);
  return m ? { id: m[1], url: `https://www.immowelt.de/expose/${m[1]}` } : null;
}

export interface MailQuelle {
  /** HTML der Immowelt-Mails der letzten Tage. */
  mails(): Promise<string[]>;
  /** Ziel einer Weiterleitung oder null. */
  folgeLink(url: string): Promise<string | null>;
}

export function immoweltMailQuelle(m: MailQuelle): Quelle {
  async function sweep(_ab: unknown, budgetMs: number): Promise<SweepErgebnis> {
    const ende = Date.now() + budgetMs;
    let mails: string[];
    try { mails = await m.mails(); } catch (e) { return { angebote: [], vollstaendig: false, status: "fehler", hinweis: `IMAP: ${(e as Error).message}` }; }
    const gesehen = new Map<string, Angebot>();
    const bekannt = new Set<string>();
    let offen = 0;
    for (const k of mails.flatMap(parseImmoweltMail)) {
      if (bekannt.has(k.klickUrl)) continue;
      bekannt.add(k.klickUrl);
      if (Date.now() >= ende) { offen++; continue; }
      const ziel = await m.folgeLink(k.klickUrl).catch(() => null);
      const ex = ziel ? expose(ziel) : null;
      if (!ex) { offen++; continue; }
      if (gesehen.has(ex.id)) continue;
      gesehen.set(ex.id, leeresAngebot({
        quelle: "immowelt", externalId: ex.id, url: ex.url, titel: k.titel || "Wohnung zur Miete",
        kaltmieteCents: k.preisCents, zimmer: k.zimmer, flaecheM2: k.flaecheM2, plz: k.plz, stadtteil: k.stadtteil,
      }));
    }
    // Mails zeigen nur neue Treffer: nie vollstaendig, also markiert der Lauf nichts als verschwunden.
    return { angebote: [...gesehen.values()], vollstaendig: false, status: "ok", hinweis: offen ? `${offen} Links nicht aufgeloest` : null };
  }
  return { name: "immowelt", aktiv: true, sweep, ladeDetail: async (_ab, a) => ({ angebot: a, sperre: null }) };
}

/** Echte Anbindung: Gmail per IMAP, Weiterleitung ohne Folgen (nur Location lesen). */
export function imapMailQuelle(user: string, pass: string, tage = 3): MailQuelle {
  return {
    async mails() {
      const { ImapFlow } = await import("imapflow");
      const { simpleParser } = await import("mailparser");
      const c = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
      await c.connect();
      const lock = await c.getMailboxLock("INBOX");
      try {
        const seit = new Date(Date.now() - tage * 864e5);
        const uids = (await c.search({ from: "immowelt", since: seit }, { uid: true })) || [];
        const html: string[] = [];
        for (const uid of uids) {
          const msg = await c.fetchOne(String(uid), { source: true }, { uid: true });
          if (msg && msg.source) html.push(String((await simpleParser(msg.source)).html || ""));
        }
        return html;
      } finally { lock.release(); await c.logout(); }
    },
    async folgeLink(url) {
      if (!url.startsWith("https://click.by.immowelt.de/")) return expose(url)?.url ?? null;
      const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      return r.headers.get("location");
    },
  };
}
