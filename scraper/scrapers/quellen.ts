import type { Quelle } from "./quelle.js";
import { kleinanzeigenQuelle } from "./kleinanzeigen/index.js";
import { immoweltQuelle } from "./immowelt/index.js";
import { immoweltMailQuelle, imapMailQuelle } from "./immowelt/mail.js";
import { immoscoutQuelle } from "./immoscout24/index.js";
import { wgGesuchtQuelle } from "./wg-gesucht/index.js";
import { ohneMaklerQuelle } from "./ohne-makler/index.js";

/** Alle verdrahteten Quellen; `aktiv: false` wird im Lauf uebersprungen. */
// Immowelt kommt ueber Suchauftrag-Mails, sobald die IMAP-Zugangsdaten gesetzt sind.
const imapUser = process.env.IMMOWELT_IMAP_USER, imapPass = process.env.IMMOWELT_IMAP_PASS;
const immowelt = imapUser && imapPass ? immoweltMailQuelle(imapMailQuelle(imapUser, imapPass)) : immoweltQuelle;

export const QUELLEN: Quelle[] = [kleinanzeigenQuelle, immoscoutQuelle, wgGesuchtQuelle, ohneMaklerQuelle, immowelt];

export function waehleQuelle(name: string): Quelle {
  const q = QUELLEN.find((x) => x.name === name);
  if (!q) throw new Error(`Unbekannte Quelle: ${name} (bekannt: ${QUELLEN.map((x) => x.name).join(", ")})`);
  return q;
}
