/**
 * Push via Gmail: after each run one summary mail to the radar mailbox for
 * flats that match the profile ("ja") and were not reported yet, or whose warm
 * rent dropped below the last reported value. The phone's Gmail app turns the
 * mail into a push notification. "unklar" is left out on purpose: estimated
 * warm rents alone would produce dozens of mails a day.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface MeldeZeile {
  id: string; quelle: string; url: string; titel: string;
  warmmiete_cents: number | null; warmmiete_quelle: string; zimmer: number | null; flaeche_m2: number | null;
  plz: string | null; stadtteil: string | null; nachmieter: boolean;
  gemeldet_am: string | null; letzte_warmmiete_gemeldet_cents: number | null;
}

export interface Mail { betreff: string; text: string }

const QUELLE: Record<string, string> = {
  immoscout24: "ImmoScout24", kleinanzeigen: "Kleinanzeigen", "wg-gesucht": "WG-Gesucht", "ohne-makler": "Ohne-Makler", immowelt: "Immowelt",
};
const euro = (c: number | null) => (c === null ? "?" : `${Math.round(c / 100).toLocaleString("de-DE")} €`);
const zahl = (n: number | null) => (n === null ? "?" : String(n).replace(".", ","));

/** Rows that need a mail now: never reported, or cheaper than last reported. */
export function faelligeMeldungen(zeilen: MeldeZeile[]): { neu: MeldeZeile[]; billiger: MeldeZeile[] } {
  const neu = zeilen.filter((z) => z.gemeldet_am === null);
  const billiger = zeilen.filter((z) => z.gemeldet_am !== null && z.warmmiete_cents !== null
    && z.letzte_warmmiete_gemeldet_cents !== null && z.warmmiete_cents < z.letzte_warmmiete_gemeldet_cents);
  return { neu, billiger };
}

export function baueMail(neu: MeldeZeile[], billiger: MeldeZeile[]): Mail | null {
  if (neu.length + billiger.length === 0) return null;
  const zeile = (z: MeldeZeile, vorher?: number | null) => [
    `${euro(z.warmmiete_cents)} warm${z.warmmiete_quelle === "geschaetzt" ? " (geschätzt)" : ""}${vorher ? ` (vorher ${euro(vorher)})` : ""}`
      + ` · ${zahl(z.zimmer)} Zi. · ${zahl(z.flaeche_m2)} m² · ${z.stadtteil ?? z.plz ?? "Lage ?"}${z.nachmieter ? " · Nachmieter" : ""}`,
    `${z.titel} (${QUELLE[z.quelle] ?? z.quelle})`,
    z.url,
  ].join("\n");
  const teile: string[] = [];
  if (neu.length) teile.push(neu.map((z) => zeile(z)).join("\n\n"));
  if (billiger.length) teile.push("Preis gesenkt:\n\n" + billiger.map((z) => zeile(z, z.letzte_warmmiete_gemeldet_cents)).join("\n\n"));
  const erste = neu[0] ?? billiger[0];
  const betreff = neu.length + billiger.length === 1
    ? `${neu.length ? "Neue Wohnung" : "Preis gesenkt"}: ${euro(erste.warmmiete_cents)}, ${zahl(erste.zimmer)} Zi., ${erste.stadtteil ?? erste.plz ?? ""}`.trim()
    : `${neu.length} neue Wohnung${neu.length === 1 ? "" : "en"}${billiger.length ? `, ${billiger.length} günstiger` : ""}`;
  return { betreff, text: teile.join("\n\n") + "\n\nWohnungsradar München" };
}

export type Sende = (m: Mail) => Promise<void>;

export async function sendeMeldungen(sb: SupabaseClient, sende: Sende, jetzt: Date): Promise<{ neu: number; billiger: number }> {
  const { data, error } = await sb.from("angebote")
    .select("id, quelle, url, titel, warmmiete_cents, warmmiete_quelle, zimmer, flaeche_m2, plz, stadtteil, nachmieter, gemeldet_am, letzte_warmmiete_gemeldet_cents")
    .eq("passt", "ja").is("verschwunden_am", null);
  if (error) throw new Error(`Meldung lesen: ${error.message}`);
  const { neu, billiger } = faelligeMeldungen((data ?? []) as MeldeZeile[]);
  const mail = baueMail(neu, billiger);
  if (!mail) return { neu: 0, billiger: 0 };
  await sende(mail);
  // Mark only after the mail went out, so a failed send is retried next run.
  for (const z of [...neu, ...billiger]) {
    const { error: e } = await sb.from("angebote")
      .update({ gemeldet_am: jetzt.toISOString(), letzte_warmmiete_gemeldet_cents: z.warmmiete_cents }).eq("id", z.id);
    if (e) throw new Error(`Meldung markieren: ${e.message}`);
  }
  return { neu: neu.length, billiger: billiger.length };
}

/** Gmail SMTP with the app password the Immowelt mail reader already uses. */
export async function gmailSender(user: string, pass: string, an: string): Promise<Sende> {
  const { createTransport } = await import("nodemailer");
  const t = createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  return async (m) => { await t.sendMail({ from: `Wohnungsradar <${user}>`, to: an, subject: m.betreff, text: m.text }); };
}
