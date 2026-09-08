/**
 * Sperre gegen Live-Abrufe vom Rechner des Nutzers.
 *
 * WARUM DIESE DATEI EXISTIERT: Die Pruefskripte fahren einen echten Browser
 * gegen echte Portale. Lokal ausgefuehrt gingen sie ueber den privaten
 * Anschluss des Nutzers -- und haben ihn am 2026-09-08 ZWEIMAL lahmgelegt.
 * Nicht die Datenmenge war schuld, sondern tausende Verbindungen und
 * DNS-Abfragen aus einem Browser mit Fenster: Danach loeste minutenlang gar
 * nichts mehr auf, auch example.com nicht.
 *
 * Beim ersten Mal war es ein bundesweiter Lauf. Beim zweiten Mal waren es
 * sechs einzelne Regionslaeufe kurz hintereinander -- jeder fuer sich
 * regelkonform, in der Summe derselbe Schaden. Eine Regel, die man einhalten
 * kann und trotzdem verletzt, ist keine Regel; deshalb steht hier Code statt
 * eines Kommentars.
 *
 * Live-Pruefungen laufen ueber `.github/workflows/pruefung.yml` auf GitHubs
 * Rechnern. Dort ist `CI=true` gesetzt.
 */

/** Die Umgebungsvariable, die GitHub Actions (und jede uebliche CI) setzt. */
const CI_KENNUNG = "CI";

/**
 * Die ausdrueckliche Freigabe fuer den Ausnahmefall. Bewusst umstaendlich: Wer
 * sie tippt, hat sich entschieden, und der Nutzer hat es angesagt.
 */
const FREIGABE = "ICH_HABE_DEN_ANSCHLUSS_FREIGEGEBEN";

/**
 * Bricht ab, wenn dieses Skript nicht in CI laeuft.
 *
 * @param skriptname Fuer die Fehlermeldung, damit klar ist, was abgebrochen hat.
 */
export function nurInCiAusfuehren(skriptname: string): void {
  if (process.env[CI_KENNUNG] === "true" || process.env[CI_KENNUNG] === "1") return;
  if (process.env[FREIGABE] === "ja") {
    console.warn(
      `${skriptname}: laeuft lokal, weil ${FREIGABE}=ja gesetzt ist. ` +
        `Nach diesem Lauf auswerten, bevor der naechste startet.`
    );
    return;
  }

  console.error(
    `\n${skriptname} ist ein LIVE-Abruf und laeuft nicht lokal.\n\n` +
      `Solche Laeufe haben den Anschluss des Nutzers am 2026-09-08 zweimal\n` +
      `lahmgelegt -- beim zweiten Mal durch mehrere fuer sich harmlose\n` +
      `Einzellaeufe kurz hintereinander.\n\n` +
      `Stattdessen auf GitHubs Rechnern starten:\n\n` +
      `    gh workflow run pruefung.yml -f skript=pruefe-region -f region=hb -f max_seiten=12\n` +
      `    gh run watch\n\n` +
      `Nur wenn der Nutzer es ausdruecklich ansagt, und dann genau EINMAL:\n\n` +
      `    ${FREIGABE}=ja npx tsx scripts/<skript>.mts\n`
  );
  process.exit(1);
}
