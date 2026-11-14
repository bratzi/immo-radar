/**
 * Deposit in cents from a listing's text: an amount ("3.072,00 €", "3240,00")
 * or a multiple of the cold rent ("3 Kaltmieten", "3 MM", a bare "3").
 */
export function kautionCents(text: string | null | undefined, kaltCents: number | null): number | null {
  if (!text) return null;
  const t = text.trim();
  const vielfach = t.match(/^(\d)(?:[.,]0+)?\s*(?:x|-fache)?\s*(?:kaltmiete|nettokaltmiete|monatsmiete|mm|monatskaltmiete)?n?\b/i);
  if (vielfach && kaltCents !== null && (/miete|mm\b|x/i.test(t) || /^\d$/.test(t))) return Number(vielfach[1]) * kaltCents;
  const roh = t.match(/\d[\d.]*(?:,\d+)?/)?.[0];
  if (!roh) return null;
  const euro = Number(roh.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(euro) && euro >= 50 ? Math.round(euro * 100) : null;
}
