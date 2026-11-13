/**
 * Probe fuer den Immowelt-Mailweg: meldet sich per IMAP am Radar-Postfach an
 * und legt die neuesten Immowelt-Mails als HTML unter mail-probe/ ab
 * (Workflow immowelt-mail-probe.yml laedt sie als kurzlebiges Artefakt hoch).
 * Liest nur, markiert nichts als gelesen.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { mkdirSync, writeFileSync } from "node:fs";

const user = process.env.IMMOWELT_IMAP_USER;
const pass = process.env.IMMOWELT_IMAP_PASS;
if (!user || !pass) { console.error("IMMOWELT_IMAP_USER/PASS fehlen"); process.exit(1); }

const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
await client.connect();
console.log("IMAP-Anmeldung ok");
mkdirSync("mail-probe", { recursive: true });
const lock = await client.getMailboxLock("INBOX");
try {
  const uids = (await client.search({ from: "immowelt" }, { uid: true })) || [];
  console.log(`Immowelt-Mails: ${uids.length}`);
  for (const uid of uids.slice(-5)) {
    const m = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!m || !m.source) continue;
    const p = await simpleParser(m.source);
    console.log(`uid ${uid}: ${p.subject} (${p.date?.toISOString()})`);
    writeFileSync(`mail-probe/${uid}.html`, String(p.html || p.textAsHtml || ""));
  }
} finally {
  lock.release();
  await client.logout();
}
