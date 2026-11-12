/**
 * "Online seit" aus den Angaben der Portale (2026-11-12):
 * ImmoScout24-Liste "vor 8 Stunden", "vor einem Tag", "vor 3 Tagen";
 * WG-Gesucht-Karte "2 T.", "5 Std.", "12 Min." oder ein Datum "06.11.2026".
 * Relative Angaben sind so genau wie ihre Einheit; die Pipeline behaelt
 * deshalb den fruehesten je gesehenen Wert.
 */
const EINHEIT: Record<string, number> = {
  min: 6e4, minute: 6e4, minuten: 6e4,
  std: 36e5, stunde: 36e5, stunden: 36e5,
  t: 864e5, tag: 864e5, tagen: 864e5, tage: 864e5,
  woche: 6048e5, wochen: 6048e5,
};
const ZAHLWORT: Record<string, number> = { einer: 1, einem: 1, ein: 1, eine: 1 };

export function onlineSeitAusText(text: string | null | undefined, jetzt: Date): string | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (/^gerade|^soeben|^jetzt/.test(t)) return jetzt.toISOString();
  const datum = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (datum) {
    // Mitternacht in Berlin; im Winter UTC+1, im Sommer UTC+2.
    const tag = Date.UTC(+datum[3], +datum[2] - 1, +datum[1]);
    const versatz = new Date(tag).toLocaleString("en-US", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false }) === "02" ? 2 : 1;
    return new Date(tag - versatz * 36e5).toISOString();
  }
  const rel = t.match(/^(?:vor\s+)?(\d+|einer|einem|ein|eine)\s+([a-zäöü]+)\.?$/);
  if (!rel) return null;
  const anzahl = /^\d+$/.test(rel[1]) ? Number(rel[1]) : ZAHLWORT[rel[1]];
  const einheit = EINHEIT[rel[2]];
  if (!anzahl && anzahl !== 0 || !einheit) return null;
  return new Date(jetzt.getTime() - anzahl * einheit).toISOString();
}
