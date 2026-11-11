import type { Quelle } from "./quelle.js";
import { kleinanzeigenQuelle } from "./kleinanzeigen/index.js";
import { immoweltQuelle } from "./immowelt/index.js";
import { immoscoutQuelle } from "./immoscout24/index.js";
import { wgGesuchtQuelle } from "./wg-gesucht/index.js";

/** Alle verdrahteten Quellen; `aktiv: false` wird im Lauf uebersprungen. */
export const QUELLEN: Quelle[] = [kleinanzeigenQuelle, immoscoutQuelle, wgGesuchtQuelle, immoweltQuelle];

export function waehleQuelle(name: string): Quelle {
  const q = QUELLEN.find((x) => x.name === name);
  if (!q) throw new Error(`Unbekannte Quelle: ${name} (bekannt: ${QUELLEN.map((x) => x.name).join(", ")})`);
  return q;
}
