import * as cheerio from "cheerio";

export interface ImmoweltListSummary {
  externalId: string;
  url: string;
  titleLine: string;
  /**
   * Region, auf deren Ergebnisliste dieses Objekt stand (Bundeslandkuerzel,
   * z. B. "he"), oder null, wenn der Aufrufer sie nicht mitgegeben hat.
   *
   * WARUM: Immowelts externalId ist eine UUID und verraet den Fundort nicht --
   * anders als ZVGs "sn-40908", aus dem `partitionAusExternalId` das
   * Bundesland liest. Ohne diese Angabe kann Immowelt nie regionsgenau
   * loeschen, weil sich nicht sagen laesst, welcher Sweep ein Objekt
   * ueberhaupt abgedeckt hat.
   */
  fundort: string | null;
}

const MFH_TYPE_PATTERN = /^(Mehrfamilienhaus|Zinshaus|Wohn- und Geschäftshaus)/i;

/**
 * @param fundort Region, deren Ergebnisliste hier geparst wird. Wird jedem
 *                Treffer aufgepraegt; siehe `ImmoweltListSummary.fundort`.
 */
export function parseImmoweltListPage(
  html: string,
  fundort: string | null = null
): ImmoweltListSummary[] {
  const $ = cheerio.load(html);
  const results: ImmoweltListSummary[] = [];

  $('a[data-testid="card-mfe-covering-link-testid"]').each((_, el) => {
    const href = $(el).attr("href");
    const title = $(el).attr("title");
    if (!href || !title) return;
    const idMatch = href.match(/\/expose\/([a-f0-9-]+)/i);
    if (!idMatch) return;
    results.push({ externalId: idMatch[1], url: href, titleLine: title, fundort });
  });

  return results;
}

export function istMehrfamilienhausKandidat(titleLine: string): boolean {
  return MFH_TYPE_PATTERN.test(titleLine);
}
