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
}

export interface KennzahlenSummary {
  kaufpreisfaktor: number;
  geschaetzterDscr: number;
  mietQuelle: string;
}

function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE");
}

export function formatTopTrefferMessage(listing: ListingSummary, k: KennzahlenSummary): string {
  return [
    `🎯 Top-Treffer: ${listing.title}`,
    `${listing.zipCode} ${listing.city} · ${listing.units ?? "?"} Einheiten · ${formatEuro(listing.priceCents)} €`,
    `Kaufpreisfaktor ${k.kaufpreisfaktor.toFixed(1)} · geschätzter DSCR ${k.geschaetzterDscr.toFixed(2)} · Miete: ${k.mietQuelle}`,
    listing.url,
  ].join("\n");
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
    listing.url,
  ].join("\n");
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
