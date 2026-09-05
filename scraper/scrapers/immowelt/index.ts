import { parseImmoweltListPage, istMehrfamilienhausKandidat } from "./list.js";
import { parseImmoweltDetailPage, type ImmoweltDetailData } from "./detail.js";

const SEARCH_URL = "https://www.immowelt.de/suche/kaufen/haus/deutschland/ad02de1";
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  "Accept-Language": "de-DE,de;q=0.9",
};
const VERZOEGERUNG_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeImmowelt(): Promise<ImmoweltDetailData[]> {
  const listRes = await fetch(SEARCH_URL, { headers: BROWSER_HEADERS });
  if (!listRes.ok) {
    throw new Error(`Immowelt-Ergebnisliste: HTTP ${listRes.status}`);
  }
  const listHtml = await listRes.text();
  const kandidaten = parseImmoweltListPage(listHtml).filter((c) =>
    istMehrfamilienhausKandidat(c.titleLine)
  );

  const ergebnisse: ImmoweltDetailData[] = [];
  for (const kandidat of kandidaten) {
    await sleep(VERZOEGERUNG_MS);
    let detailRes: Response;
    try {
      detailRes = await fetch(kandidat.url, {
        headers: { ...BROWSER_HEADERS, Referer: SEARCH_URL },
      });
    } catch (err) {
      console.warn(`Immowelt-Detailseite ${kandidat.url}: Netzwerkfehler, übersprungen`, err);
      continue;
    }
    if (!detailRes.ok) {
      console.warn(`Immowelt-Detailseite ${kandidat.url}: HTTP ${detailRes.status}, übersprungen`);
      continue;
    }
    try {
      const detailHtml = await detailRes.text();
      ergebnisse.push(
        parseImmoweltDetailPage(detailHtml, { externalId: kandidat.externalId, url: kandidat.url })
      );
    } catch (err) {
      console.warn(`Immowelt-Detailseite ${kandidat.url}: Parse-Fehler, übersprungen`, err);
    }
  }
  return ergebnisse;
}
