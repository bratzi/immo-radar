/**
 * Sperrerkennung und Pausenregel fuer alle Quellen (Spec 4.11, Nachtrag
 * 2026-11-11 Punkt 2). Reine Funktionen: der Aufrufer reicht Status, HTML und
 * End-URL einer Antwort herein und entscheidet selbst, die Quelle zu stoppen.
 *
 * Eine Sperre wird erkannt, nie umgangen: keine Proxys, kein CAPTCHA-Loeser.
 */

export type Sperre = "http" | "datadome" | "akamai" | "waf" | "captcha";

/** Zufaelliger Abstand je Seitenabruf (4 bis 8 s). */
export const SEITENABSTAND_MIN_MS = 4000;
export const SEITENABSTAND_MAX_MS = 8000;
/** Obergrenzen je Quelle und Lauf. */
export const MAX_LISTENSEITEN = 5;
export const MAX_DETAILSEITEN = 15;

/** Zufallsabstand im Drosselfenster; `zufall` ist fuer Tests austauschbar. */
export function seitenabstandMs(zufall: () => number = Math.random): number {
  return Math.round(SEITENABSTAND_MIN_MS + zufall() * (SEITENABSTAND_MAX_MS - SEITENABSTAND_MIN_MS));
}

const DATADOME = /captcha-delivery\.com|datadome/i;
const AKAMAI = /_sec\/cp_challenge|ak-challenge|<h1>\s*access denied\s*<\/h1>[\s\S]*reference/i;
const WAF = /awswaf|aws-waf-token|request could not be satisfied[\s\S]*cloudfront/i;
const CAPTCHA = /class=["'][^"']*\b(g-recaptcha|h-captcha)\b|recaptcha\/api\.js|hcaptcha\.com\/1\/api\.js|<title>[^<]*captcha[^<]*<\/title>/i;

/**
 * Herstellermerkmale gehen vor dem Statuscode: ein 403 mit DataDome-Skript
 * ist "datadome", ein 403 ohne Merkmal ist "http". 404 ist keine Sperre.
 */
export function erkenneSperre(antwort: { status: number; html: string; url: string }): Sperre | null {
  const { status, html, url } = antwort;
  if (DATADOME.test(url) || DATADOME.test(html)) return "datadome";
  if (AKAMAI.test(html)) return "akamai";
  if (WAF.test(html)) return "waf";
  if (CAPTCHA.test(html)) return "captcha";
  if (status === 401 || status === 403 || status === 429) return "http";
  return null;
}

const STUNDE_MS = 60 * 60 * 1000;

/** Versatz Europe/Berlin gegen UTC in ms zum Zeitpunkt `t`. */
function berlinVersatzMs(t: Date): number {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(t);
  const w = (typ: string) => Number(teile.find((p) => p.type === typ)?.value);
  const alsUtc = Date.UTC(w("year"), w("month") - 1, w("day"), w("hour"), w("minute"), w("second"));
  return alsUtc - Math.floor(t.getTime() / 1000) * 1000;
}

/** Beginn des naechsten Kalendertags in Muenchen, als UTC-Zeitpunkt. */
function naechsterTagBerlin(jetzt: Date): Date {
  const lokal = new Date(jetzt.getTime() + berlinVersatzMs(jetzt));
  const mitternachtAlsUtc = Date.UTC(lokal.getUTCFullYear(), lokal.getUTCMonth(), lokal.getUTCDate() + 1);
  // Versatz am Zielzeitpunkt bestimmen (Zeitumstellung in der Nacht).
  const grob = new Date(mitternachtAlsUtc - berlinVersatzMs(jetzt));
  return new Date(mitternachtAlsUtc - berlinVersatzMs(grob));
}

/**
 * Fruehester naechster Versuch nach `sperrenInFolge` Sperren in Folge:
 * keine Sperre sofort (null), 1 -> 2 h, 2 -> 6 h, ab 3 -> naechster Tag.
 * Die Telegram-Warnung bei der dritten Sperre loest der Aufrufer aus.
 */
export function naechsterVersuch(sperrenInFolge: number, jetzt: Date): Date | null {
  if (sperrenInFolge <= 0) return null;
  if (sperrenInFolge === 1) return new Date(jetzt.getTime() + 2 * STUNDE_MS);
  if (sperrenInFolge === 2) return new Date(jetzt.getTime() + 6 * STUNDE_MS);
  return naechsterTagBerlin(jetzt);
}
