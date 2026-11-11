/**
 * Mietwohnungen Muenchen, neueste zuerst. Bewusst ohne Portalfilter in der
 * URL: deren Schreibweise ist nicht belegt, und jedes Feld wird im Code
 * ohnehin erneut geprueft.
 */
export const KLEINANZEIGEN_SUCHE_URL =
  "https://www.kleinanzeigen.de/s-wohnung-mieten/muenchen/sortierung:neuste/c203l6411";

/** URL der n-ten Listenseite (1-basiert). */
export function kleinanzeigenSeitenUrl(n: number): string {
  if (n <= 1) return KLEINANZEIGEN_SUCHE_URL;
  return `https://www.kleinanzeigen.de/s-wohnung-mieten/muenchen/sortierung:neuste/seite:${n}/c203l6411`;
}
