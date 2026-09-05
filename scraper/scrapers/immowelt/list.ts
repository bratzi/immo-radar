import * as cheerio from "cheerio";

export interface ImmoweltListSummary {
  externalId: string;
  url: string;
  titleLine: string;
}

const MFH_TYPE_PATTERN = /^(Mehrfamilienhaus|Zinshaus|Wohn- und Geschäftshaus)/i;

export function parseImmoweltListPage(html: string): ImmoweltListSummary[] {
  const $ = cheerio.load(html);
  const results: ImmoweltListSummary[] = [];

  $('a[data-testid="card-mfe-covering-link-testid"]').each((_, el) => {
    const href = $(el).attr("href");
    const title = $(el).attr("title");
    if (!href || !title) return;
    const idMatch = href.match(/\/expose\/([a-f0-9-]+)/i);
    if (!idMatch) return;
    results.push({ externalId: idMatch[1], url: href, titleLine: title });
  });

  return results;
}

export function istMehrfamilienhausKandidat(titleLine: string): boolean {
  return MFH_TYPE_PATTERN.test(titleLine);
}
