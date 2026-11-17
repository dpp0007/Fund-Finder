// Re-ranks the saved demo runs with the current scoring code (deterministic, no network).
// Usage: node scripts/rescore-demos.ts
import fs from "node:fs";
import { buildInvestors, investorKey, type Enrichment } from "../lib/scoring.ts";
import { investorsCsv, dealsCsv } from "../lib/export.ts";

for (const f of fs.readdirSync("demos").filter((x) => x.endsWith(".json"))) {
  const p = `demos/${f}`;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const enrich: Record<string, Enrichment> = {};
  for (const i of j.investors) {
    const stated = /^(.*) \(stated by the investor\)$/.exec(i.typicalCheque)?.[1];
    enrich[investorKey(i.name)] = {
      kind: i.kind, website: i.website, thesis: i.thesis, chequeStated: stated,
      leadPartner: i.leadPartner && { basis: "deal_page", ...i.leadPartner }, outreach: i.outreach,
    };
  }
  j.investors = buildInvestors(j.companies, j.startup, enrich, new Date(j.generatedAt)).slice(0, 25);
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
  const run = { investors: j.investors, deals: j.companies } as never;
  fs.writeFileSync(p.replace(/\.json$/, ".csv"), investorsCsv(run));
  fs.writeFileSync(p.replace(/\.json$/, ".companies.csv"), dealsCsv(run));
  console.log(f, "->", j.investors.slice(0, 5).map((i: { name: string; score: number; confidence: string }) => `${i.name} ${i.score} ${i.confidence}`).join(" | "));
}
