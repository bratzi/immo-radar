export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface ListingSummary {
  title: string;
  url: string;
  city: string;
  zipCode: string;
  priceCents: number;
  units: number | null;
  dataGaps?: string[];
}

export interface ZvgListingSummary extends ListingSummary {
  court: string;
  auctionAt: string;
  caseNumber: string;
}

export interface KennzahlenSummary {
  kaufpreisfaktor: number;
  geschaetzterDscr: number;
  mietQuelle: string;
}

const DATA_GAP_LABELS: Record<string, string> = {
  units_unconfirmed: "Einheiten nicht bestätigt",
};

function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE");
}

function formatDataGapsLine(dataGaps: string[] | undefined): string | null {
  if (!dataGaps || dataGaps.length === 0) return null;
  const texte = dataGaps.map((code) => DATA_GAP_LABELS[code] ?? code);
  return `⚠️ Fehlende Angaben: ${texte.join(", ")}`;
}

function formatBerlinDatumzeit(isoDatum: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDatum));
}

export function formatTopTrefferMessage(listing: ListingSummary, k: KennzahlenSummary): string {
  return [
    `🎯 Top-Treffer: ${listing.title}`,
    `${listing.zipCode} ${listing.city} · ${listing.units ?? "?"} Einheiten · ${formatEuro(listing.priceCents)} €`,
    `Kaufpreisfaktor ${k.kaufpreisfaktor.toFixed(1)} · geschätzter DSCR ${k.geschaetzterDscr.toFixed(2)} · Miete: ${k.mietQuelle}`,
    formatDataGapsLine(listing.dataGaps),
    listing.url,
  ]
    .filter((zeile): zeile is string => zeile !== null)
    .join("\n");
}

export function formatZvgTopTrefferMessage(listing: ZvgListingSummary, k: KennzahlenSummary): string {
  return [
    `🎯 Top-Treffer (Zwangsversteigerung): ${listing.title}`,
    `${listing.zipCode} ${listing.city} · ${listing.units ?? "?"} Einheiten · Verkehrswert ${formatEuro(listing.priceCents)} €`,
    `Amtsgericht ${listing.court} · Az. ${listing.caseNumber}`,
    `Termin: ${formatBerlinDatumzeit(listing.auctionAt)} Uhr`,
    `Kaufpreisfaktor ${k.kaufpreisfaktor.toFixed(1)} · geschätzter DSCR ${k.geschaetzterDscr.toFixed(2)} · Miete: ${k.mietQuelle}`,
    formatDataGapsLine(listing.dataGaps),
    listing.url,
  ]
    .filter((zeile): zeile is string => zeile !== null)
    .join("\n");
}

export function formatPreisaenderungMessage(
  listing: ListingSummary,
  altPreisCents: number,
  neuPreisCents: number
): string {
  return [
    `💶 Preisänderung: ${listing.title}`,
    `${listing.zipCode} ${listing.city}`,
    `${formatEuro(altPreisCents)} € → ${formatEuro(neuPreisCents)} €`,
    formatDataGapsLine(listing.dataGaps),
    listing.url,
  ]
    .filter((zeile): zeile is string => zeile !== null)
    .join("\n");
}

export async function sendTelegramMessage(config: TelegramConfig, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: config.chatId, text }),
  });
  if (!res.ok) {
    throw new Error(`Telegram-Versand fehlgeschlagen: HTTP ${res.status} ${await res.text()}`);
  }
}
