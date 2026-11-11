import type { Angebot, Quelle } from "./typen.js";

export function quellenName(q: Quelle): string {
  return { immowelt: "Immowelt", kleinanzeigen: "Kleinanzeigen", "wg-gesucht": "WG-Gesucht", immoscout24: "ImmoScout24" }[q];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function euro(cents: number): string {
  return `${Math.round(cents / 100).toLocaleString("de-DE")} €`;
}
function zahl(n: number, nachkomma = 1): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: nachkomma });
}
function alterText(iso: string | null, jetzt: Date): string | null {
  if (!iso) return null;
  const min = Math.round((jetzt.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 0) return null;
  if (min < 60) return `vor ${min} min`;
  if (min < 48 * 60) return `vor ${Math.round(min / 60)} h`;
  return `vor ${Math.round(min / 1440)} Tagen`;
}

export function formatTrefferMessage(a: Angebot, jetzt: Date): string {
  const ort = a.stadtteil ?? a.plz ?? "München";
  const warm = a.warmmieteCents !== null ? `${euro(a.warmmieteCents)} warm` : "Miete unbekannt";
  const zeile1 = `<b>Treffer · ${esc(ort)} · ${warm}</b>`;
  const teile2: string[] = [];
  if (a.zimmer !== null) teile2.push(`${zahl(a.zimmer)} Zi`);
  if (a.flaecheM2 !== null) teile2.push(`${zahl(a.flaecheM2, 0)} m²`);
  if (a.warmmieteCents !== null && a.flaecheM2) teile2.push(`${zahl(a.warmmieteCents / 100 / a.flaecheM2)} €/m² warm`);
  if (a.balkonBeleg) teile2.push(`Balkon: ${esc(a.balkonBeleg)}`);
  const teile3: string[] = [];
  if (a.verfuegbarAb) teile3.push(`frei ab ${esc(a.verfuegbarAb)}`);
  teile3.push(quellenName(a.quelle));
  const alter = alterText(a.veroeffentlichtAm, jetzt);
  if (alter) teile3.push(alter);
  const zeilen = [zeile1, teile2.join(" · "), teile3.join(" · ")];
  if (a.warmmieteQuelle === "geschaetzt") zeilen.push("Warmmiete geschätzt (Kaltmiete × 1,25)");
  if (a.warmmieteQuelle === "kalt_plus_nk") zeilen.push("Warmmiete = Kaltmiete + Nebenkosten");
  zeilen.push(esc(a.titel), a.url);
  return zeilen.join("\n");
}

export function formatPreissenkungMessage(a: Angebot, vorherCents: number): string {
  const neu = a.warmmieteCents !== null ? euro(a.warmmieteCents) : "?";
  return `Preis gesunken · ${esc(a.stadtteil ?? a.plz ?? "München")}: ${euro(vorherCents)} → ${neu} warm\n${a.url}`;
}
