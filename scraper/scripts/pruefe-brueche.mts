/**
 * Letzter Schritt in scrape.yml: liest die juengsten Laeufe je aktiver Quelle,
 * legt bei Bruch oder Dauersperre ein Issue an bzw. kommentiert die Erholung.
 * Ruft keine Portale ab. Ein Fehler hier wird nur geloggt (Exit 0), damit der
 * Scan nicht rot wird.
 *
 * Issues, die mit GITHUB_TOKEN angelegt werden, starten keine issues-Workflows;
 * deshalb startet dieses Skript reparatur.yml per workflow_dispatch selbst.
 */
import { execFileSync } from "node:child_process";
import { sb } from "../lib/supabase.js";
import { QUELLEN } from "../scrapers/quellen.js";
import { bewerteQuelle, planeAktionen, type Befund, type LaufKurz, type OffenesIssue } from "../lib/brueche.js";

const gh = (args: string[]) => execFileSync("gh", args, { encoding: "utf8" }).trim();

try {
  const befunde: Befund[] = [];
  for (const q of QUELLEN.filter((x) => x.aktiv)) {
    const { data, error } = await sb.from("laeufe").select("status, gesehen, gestartet_am")
      .eq("quelle", q.name).order("gestartet_am", { ascending: false }).limit(3);
    if (error) throw new Error(`laeufe ${q.name}: ${error.message}`);
    const b = bewerteQuelle(q.name, (data ?? []) as LaufKurz[]);
    if (b) befunde.push(b);
  }
  console.log("Befunde:", JSON.stringify(befunde));
  if (befunde.length === 0) process.exit(0);

  const roh = JSON.parse(gh(["issue", "list", "--state", "open", "--limit", "100", "--json", "number,title,labels"])) as
    { number: number; title: string; labels: { name: string }[] }[];
  const offen: OffenesIssue[] = roh.map((i) => ({ number: i.number, title: i.title, labels: i.labels.map((x) => x.name) }));

  for (const a of planeAktionen(befunde, offen)) {
    if (a.typ === "kommentar") {
      gh(["issue", "comment", String(a.nummer), "--body", a.text]);
      console.log(`Kommentar an #${a.nummer}`);
      continue;
    }
    gh(["label", "create", a.label, "--force", "--color", a.label === "reparatur" ? "d73a4a" : "fbca04"]);
    const url = gh(["issue", "create", "--title", a.titel, "--body", a.text, "--label", a.label]);
    const nummer = url.split("/").pop()!;
    console.log(`Issue ${url}`);
    if (a.label === "reparatur") {
      gh(["workflow", "run", "reparatur.yml", "-f", `issue=${nummer}`]);
      console.log(`reparatur.yml fuer #${nummer} gestartet`);
    }
  }
} catch (e) {
  console.error("pruefe-brueche:", e);
}
