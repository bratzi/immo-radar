import * as cheerio from "cheerio";

export interface ZvgListSummary {
  externalId: string;
  url: string;
  caseNumber: string;
  court: string;
}

const ZVG_BASE_URL = "https://www.zvg-portal.de/";
const DETAIL_HREF_PATTERN = /zvg_id=(\d+)&land_abk=([a-z]+)/;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function parseZvgResultsPage(html: string): ZvgListSummary[] {
  const $ = cheerio.load(html);
  const zeilen = $('table[border="0"]').first().find("> tbody > tr").toArray();

  const gruppen: (typeof zeilen)[] = [];
  let aktuelleGruppe: typeof zeilen = [];
  for (const zeile of zeilen) {
    const istTrennzeile = $(zeile).find("hr").length > 0;
    if (istTrennzeile) {
      if (aktuelleGruppe.length > 0) gruppen.push(aktuelleGruppe);
      aktuelleGruppe = [];
      continue;
    }
    aktuelleGruppe.push(zeile);
  }
  if (aktuelleGruppe.length > 0) gruppen.push(aktuelleGruppe);

  const ergebnisse: ZvgListSummary[] = [];
  for (const gruppenZeilen of gruppen) {
    const link = $(gruppenZeilen[0]).find('a[aria-label="Zwangsversteigerung Detailansicht"]');
    if (link.length === 0) continue; // abgesagter Termin, keine Detailseite vorhanden

    const href = link.attr("href");
    if (!href) continue;
    const idMatch = href.match(DETAIL_HREF_PATTERN);
    if (!idMatch) continue;
    const [, zvgId, landAbk] = idMatch;

    const caseNumber = normalizeWhitespace(link.text()).replace(/\(Detailansicht\)\s*$/, "").trim();

    let court = "";
    for (const zeile of gruppenZeilen) {
      const tds = $(zeile).find("td");
      if (tds.length < 2) continue;
      if (normalizeWhitespace($(tds[0]).text()) === "Amtsgericht") {
        court = normalizeWhitespace($(tds[1]).text());
        break;
      }
    }

    ergebnisse.push({
      externalId: `${landAbk}-${zvgId}`,
      url: new URL(`index.php?button=showZvg&zvg_id=${zvgId}&land_abk=${landAbk}`, ZVG_BASE_URL).toString(),
      caseNumber,
      court,
    });
  }

  return ergebnisse;
}
