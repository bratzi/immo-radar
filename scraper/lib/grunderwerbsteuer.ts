import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const plzBundesland: Record<string, string> = JSON.parse(
  readFileSync(path.join(__dirname, "plzBundesland.generated.json"), "utf-8")
);

const SATZ_JE_BUNDESLAND: Record<string, number> = {
  "Bayern": 3.5,
  "Baden-Württemberg": 5.0,
  "Niedersachsen": 5.0,
  "Rheinland-Pfalz": 5.0,
  "Sachsen-Anhalt": 5.0,
  "Thüringen": 5.0,
  "Bremen": 5.5,
  "Hamburg": 5.5,
  "Sachsen": 5.5,
  "Berlin": 6.0,
  "Hessen": 6.0,
  "Mecklenburg-Vorpommern": 6.0,
  "Brandenburg": 6.5,
  "Nordrhein-Westfalen": 6.5,
  "Saarland": 6.5,
  "Schleswig-Holstein": 6.5,
};

export const BUNDESWEITER_GRUNDERWERBSTEUER_DURCHSCHNITT = 5.6;

export function grunderwerbsteuerSatz(plz: string): number {
  const bundesland = plzBundesland[plz];
  if (!bundesland) return BUNDESWEITER_GRUNDERWERBSTEUER_DURCHSCHNITT;
  return SATZ_JE_BUNDESLAND[bundesland] ?? BUNDESWEITER_GRUNDERWERBSTEUER_DURCHSCHNITT;
}
