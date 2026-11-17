import type { ResearchRun } from "@/types";

const esc = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (cells: unknown[]) => cells.map(esc).join(",");

/** One row per investor; backed companies packed into one cell as "Company [role, stage, $, date] <proof url>". */
export function investorsCsv(run: ResearchRun): string {
  const head = [
    "rank", "investor", "score", "confidence", "why_ranked", "website", "typical_cheque", "stages", "lead_count",
    "lead_partner", "lead_partner_basis", "lead_partner_evidence_url", "outreach_type", "outreach_url", "outreach_detail",
    "similar_companies_backed", "proof_urls",
  ];
  const lines = run.investors.map((i) => {
    const r = i.outreach[0];
    return row([
      i.rank, i.name, i.score, i.confidence, i.whyRanked, i.website, i.typicalCheque, i.stages.join("/"), i.leadCount,
      i.leadPartner?.name, i.leadPartner?.basis, i.leadPartner?.evidenceUrl, r?.type, r?.url, r?.detail,
      i.backed.map((b) => `${b.company} [${b.role}${b.stage ? ", " + b.stage : ""}${b.amountUsd ? ", $" + b.amountUsd : ""}${b.date ? ", " + b.date : ""}]`).join(" ; "),
      i.backed.map((b) => b.proofUrl).join(" ; "),
    ]);
  });
  return [row(head), ...lines].join("\r\n");
}

export function dealsCsv(run: ResearchRun): string {
  const head = ["company", "website", "hq", "stage", "amount_usd", "date", "lead_investor", "investors", "similarity", "verified", "proof_url"];
  const lines = run.deals.map((d) =>
    row([d.company, d.website, d.hq, d.stage, d.amountUsd, d.date, d.leadInvestor, d.investors.join("; "), d.similarity.toFixed(2), d.verified, d.proofUrl ?? d.sourceUrl])
  );
  return [row(head), ...lines].join("\r\n");
}

export function jsonExport(run: ResearchRun) {
  return {
    id: run.id,
    generatedAt: new Date().toISOString(),
    startup: run.profile ?? run.input,
    investors: run.investors,
    companies: run.deals,
    meta: { tinyfishCalls: run.tinyfishCalls, tinysetDatasetId: run.tinysetDatasetId },
  };
}
