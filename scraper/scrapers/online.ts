import type { Abrufer, OnlineStatus } from "./quelle.js";
import { erkenneSperre } from "./sperre.js";

/**
 * Generic check for an HTML listing page. "weg" only on clear evidence:
 * HTTP 404/410, or a redirect to a page whose address no longer matches the
 * listing (portals send deleted ads to their search page).
 */
export async function pruefeSeite(ab: Abrufer, url: string, bleibt: RegExp, inhalt?: RegExp): Promise<OnlineStatus> {
  const a = await ab.hole(url);
  if (erkenneSperre(a)) return "gesperrt";
  if (a.status === 404 || a.status === 410) return "weg";
  if (a.status !== 200) return "unklar";
  if (!bleibt.test(a.url)) return "weg";
  if (inhalt && !inhalt.test(a.html)) return "unklar";
  return "online";
}
