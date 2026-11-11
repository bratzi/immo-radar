/**
 * Spielt schema.sql ueber die Supabase-Management-API ein. Laeuft NUR in CI
 * (.github/workflows/reset-datenbank.yml): Schreibzugriffe auf die
 * Live-Datenbank sind lokal gesperrt.
 */
import { readFileSync } from "node:fs";
import { nurInCiAusfuehren } from "../lib/nurInCi.js";

nurInCiAusfuehren("reset-datenbank");

const pat = process.env.SUPABASE_MANAGEMENT_PAT;
const url = process.env.SUPABASE_URL;
if (!pat || !url) throw new Error("SUPABASE_MANAGEMENT_PAT und SUPABASE_URL noetig");
const ref = new URL(url).hostname.split(".")[0];
const sql = readFileSync(new URL("../../schema.sql", import.meta.url), "utf-8");

const antwort = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
if (!antwort.ok) throw new Error(`Management-API ${antwort.status}: ${await antwort.text()}`);
console.log("Schema eingespielt.");
