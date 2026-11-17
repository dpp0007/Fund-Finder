/**
 * Investor ranking. Pure functions: deals in -> ranked investors out.
 * Every investor is built ONLY from verified deals (source page names company + investor).
 */
import type { BackedCompany, Deal, InvestorMatch, OutreachRoute, Stage, StartupProfile } from "@/types";

export const STAGES: Stage[] = ["pre-seed", "seed", "series-a", "series-b+"];
const DEFAULT_TARGET: Record<Stage, number> = {
  "pre-seed": 750_000,
  seed: 2_500_000,
  "series-a": 12_000_000,
  "series-b+": 40_000_000,
};

export function parseStage(s?: string): Stage | undefined {
  if (!s) return undefined;
  const t = s.toLowerCase().replace(/[\s_]+/g, "-");
  if (/pre-?seed|angel|grant|idea/.test(t)) return "pre-seed";
  if (/series-?a|^a$/.test(t)) return "series-a";
  if (/series-?[b-z]|growth|late/.test(t)) return "series-b+";
  if (/seed/.test(t)) return "seed";
  return undefined;
}

const SUFFIX = /\b(capital|ventures?|partners?|vc|funds?|management|group|llc|inc|ltd|lp|investments?|the|holdings|fund)\b/g;
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const investorKey = (s: string) => {
  const core = norm(s).replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
  return core.length >= 3 ? core : norm(s);
};

export function splitInvestors(raw: unknown): string[] {
  // Split every element too: an array entry like "Base10 Partners, Bonfire Ventures" is two investors.
  const list = (Array.isArray(raw) ? raw.map(String) : [String(raw ?? "")]).flatMap((s) => s.split(/[,;|\n]| and (?=[A-Z])/));
  const seen = new Set<string>();
  return list
    .map((s) => s.trim().replace(/^and\s+/i, ""))
    .filter((s) => s.length > 1 && s.length < 80 && !/^(n\/a|none|unknown|undisclosed|null)$/i.test(s))
    .filter((s) => (seen.has(investorKey(s)) ? false : (seen.add(investorKey(s)), true)));
}

export function monthsAgo(date?: string, now = new Date()): number | undefined {
  if (!date) return undefined;
  const d = new Date(date.length === 7 ? `${date}-15` : date);
  if (isNaN(d.getTime())) return undefined;
  return (now.getTime() - d.getTime()) / (30.44 * 86400_000);
}

const usd = (n: number) =>
  n >= 1e9 ? `$${+(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;
export const fmtUsd = usd;

const sameGeo = (a?: string, b?: string) => {
  if (!a || !b) return undefined;
  const x = norm(a), y = norm(b);
  const alias = (s: string) => s.replace(/\b(usa|us|united states of america|u s|america)\b/g, "united states").replace(/\b(uk|england|great britain)\b/g, "united kingdom");
  const [p, q] = [alias(x), alias(y)];
  return p.includes(q) || q.includes(p);
};

const ROUTE_RANK: Record<string, number> = { application_form: 5, open_intake: 5, email: 3, warm_intro: 2, unknown: 0 };

export interface Enrichment {
  kind?: "fund" | "angel";
  website?: string;
  thesis?: string;
  chequeStated?: string;
  leadPartner?: InvestorMatch["leadPartner"];
  outreach?: OutreachRoute[];
}

export function buildInvestors(
  deals: Deal[],
  profile: StartupProfile,
  enrich: Record<string, Enrichment> = {},
  now = new Date()
): InvestorMatch[] {
  const groups = new Map<string, { names: Map<string, number>; items: BackedCompany[]; deals: Deal[] }>();

  for (const d of deals) {
    if (!d.verified || !d.proofUrl) continue;
    const leadKeys = splitInvestors(d.leadInvestor ?? "").map(investorKey); // co-leads: each one led
    for (const inv of d.verifiedInvestors) {
      const k = investorKey(inv);
      const g = groups.get(k) ?? { names: new Map<string, number>(), items: [] as BackedCompany[], deals: [] as Deal[] };
      g.names.set(inv, (g.names.get(inv) ?? 0) + 1);
      g.items.push({
        dealId: d.id,
        company: d.company,
        website: d.website,
        stage: d.stage,
        roundLabel: d.roundLabel,
        amountUsd: d.amountUsd,
        date: d.date,
        role: leadKeys.includes(k) ? "lead" : "participant",
        similarity: d.similarity,
        similarityReason: d.similarityReason,
        proofUrl: d.proofUrl,
        proofExcerpt: d.evidence?.[inv] ?? d.proofExcerpt,
      });
      g.deals.push(d);
      groups.set(k, g);
    }
  }

  const target = profile.targetAmountUsd ?? DEFAULT_TARGET[profile.stage];
  const si = STAGES.indexOf(profile.stage);

  const out: InvestorMatch[] = [];
  groups.forEach((g, key) => {
    const name = [...g.names.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
    const backed = g.items.sort((a, b) => b.similarity - a.similarity);
    const e = enrich[key] ?? {};
    // Partner named on a proof page (prefer the deals this investor led), unless enrichment found one with its own source.
    const partnerFromDeals: InvestorMatch["leadPartner"] = [...g.deals]
      .sort((a, b) => Number(splitInvestors(b.leadInvestor ?? "").map(investorKey).includes(key)) - Number(splitInvestors(a.leadInvestor ?? "").map(investorKey).includes(key)))
      .flatMap((d) => (d.people ?? []).filter((p) => investorKey(p.investor) === key).map((p) => ({ name: p.name, role: p.role, evidenceUrl: d.proofUrl, dealCompany: d.company, basis: "deal_page" as const })))[0];

    // 1. similar deals (40): noisy-OR over similarity x stage proximity, leads count fully, participants at 0.75.
    // A $40M Series A is weak evidence for a pre-seed founder however similar the company is.
    const stageFactor = (st?: Stage) => {
      if (!st) return 0.5;
      const d = Math.abs(STAGES.indexOf(st) - si);
      return d === 0 ? 1 : d === 1 ? 0.6 : d === 2 ? 0.25 : 0.1;
    };
    const miss = backed.reduce((p, b) => p * (1 - 0.8 * b.similarity * stageFactor(b.stage) * (b.role === "lead" ? 1 : 0.75)), 1);
    // Evidence-depth damping: one deal is a coincidence, three is a pattern.
    const depth = Math.min(1, 0.45 + 0.275 * (backed.length - 1));
    const similarDeals = 40 * (1 - miss) * depth;

    // weights so highly similar deals drive the fit sub-scores
    const w = backed.map((b) => b.similarity + 0.05);
    const wsum = w.reduce((a, b) => a + b, 0);
    const wavg = (f: (b: BackedCompany, d: Deal) => number) =>
      backed.reduce((acc, b, i) => acc + w[i] * f(b, g.deals.find((d) => d.id === b.dealId)!), 0) / wsum;

    // 2. stage fit (20)
    const stageFit =
      20 *
      wavg((b) => {
        const i = b.stage ? STAGES.indexOf(b.stage) : -1;
        return i < 0 ? 0.3 : i === si ? 1 : Math.abs(i - si) === 1 ? 0.5 : 0;
      });

    // 3. geography (15)
    const geoFit =
      15 *
      wavg((_, d) => {
        const m = sameGeo(d.hq, profile.country);
        return m === undefined ? 0.3 : m ? 1 : 0.1;
      });

    // 4. recency (10)
    const recency =
      10 *
      wavg((b) => {
        const m = monthsAgo(b.date, now);
        return m === undefined ? 0.4 : Math.max(0, 1 - m / (profile.windowMonths + 6));
      });

    // 5. cheque fit (10): founder's target vs rounds this investor joins
    const amounts = backed.map((b) => b.amountUsd).filter((n): n is number => !!n && n > 0).sort((a, b) => a - b);
    let chequeFit = 4;
    let roundSizeRange: InvestorMatch["roundSizeRange"];
    if (amounts.length) {
      const min = amounts[0], max = amounts[amounts.length - 1], median = amounts[Math.floor(amounts.length / 2)];
      roundSizeRange = { minUsd: min, medianUsd: median, maxUsd: max };
      const lo = min * 0.6, hi = max * 1.6;
      chequeFit = target >= lo && target <= hi ? 10 : 10 * Math.max(0, 1 - Math.abs(Math.log(target / (target < lo ? lo : hi))) / Math.log(4));
    }

    // 6. reachability (5)
    const outreach = e.outreach ?? [];
    const reachability = Math.max(0, ...outreach.map((r) => ROUTE_RANK[r.type] ?? 0));

    const breakdown = {
      similarDeals: r1(similarDeals),
      stageFit: r1(stageFit),
      geoFit: r1(geoFit),
      recency: r1(recency),
      chequeFit: r1(chequeFit),
      reachability,
    };
    // Relevance gate: an investor whose closest deal is only adjacent (<0.5) must not outrank a close match
    // just because of stage/geo/reach points.
    const bestSim = Math.max(...backed.map((b) => b.similarity));
    const gate = bestSim >= 0.6 ? 1 : bestSim >= 0.5 ? 0.9 : bestSim >= 0.35 ? 0.75 : 0.6;
    const score = Math.round(Object.values(breakdown).reduce((a, b) => a + b, 0) * gate);
    const stageMatch = backed.some((b) => b.stage === profile.stage || (b.stage && Math.abs(STAGES.indexOf(b.stage) - si) === 1));
    const confidence: InvestorMatch["confidence"] =
      bestSim >= 0.7 && stageMatch && (backed.length >= 2 || backed.some((b) => b.role === "lead")) ? "high"
      : bestSim >= 0.5 && stageMatch ? "medium" : "low";

    const stages = [...new Set(backed.map((b) => b.stage).filter((s): s is Stage => !!s))].sort(
      (a, b) => STAGES.indexOf(a) - STAGES.indexOf(b)
    );
    const leadCount = backed.filter((b) => b.role === "lead").length;

    const typicalCheque = e.chequeStated
      ? `${e.chequeStated} (stated by the investor)`
      : roundSizeRange
        ? `Joins ${roundSizeRange.minUsd === roundSizeRange.maxUsd ? usd(roundSizeRange.minUsd) : `${usd(roundSizeRange.minUsd)}–${usd(roundSizeRange.maxUsd)}`} rounds; own cheque not disclosed`
        : "Not disclosed";

    out.push({
      id: key.replace(/\s+/g, "-"),
      rank: 0,
      name,
      kind: e.kind ?? "fund",
      website: e.website,
      score,
      breakdown,
      whyRanked: explain(name, backed, breakdown, profile, stages, leadCount),
      stages,
      roundSizeRange,
      typicalCheque,
      chequeBasis: e.chequeStated ? "stated" : roundSizeRange ? "round-sizes" : "unknown",
      confidence,
      leadCount,
      backed,
      leadPartner: partnerFromDeals ?? e.leadPartner, // a person named on a deal page beats a team-page guess
      outreach,
      thesis: e.thesis,
    });
  });

  // Funds first (a founder can pitch a firm; angels need a personal intro), then by score.
  out.sort((a, b) => Number(a.kind === "angel") - Number(b.kind === "angel") || b.score - a.score || b.backed.length - a.backed.length);
  out.forEach((o, i) => (o.rank = i + 1));
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function explain(
  name: string,
  backed: BackedCompany[],
  b: InvestorMatch["breakdown"],
  p: StartupProfile,
  stages: Stage[],
  leads: number
): string {
  const top = backed.slice(0, 2).map((x) => `${x.company}${x.stage ? ` (${x.stage}${x.amountUsd ? `, ${usd(x.amountUsd)}` : ""})` : ""}`);
  const parts = [
    `Backed ${backed.length} verified compan${backed.length === 1 ? "y" : "ies"} like yours in the last ${p.windowMonths} months${leads ? `, leading ${leads}` : ""} — closest: ${top.join(" and ")}.`,
  ];
  if (backed[0]?.similarityReason) parts.push(`${backed[0].company} is close to you: ${backed[0].similarityReason.replace(/[.\s]*$/, ".")}`);
  parts.push(
    stages.includes(p.stage)
      ? `Already invests at ${p.stage}.`
      : stages.length
        ? `Invests at ${stages.join("/")}, not directly ${p.stage}, so stage fit is partial.`
        : "Stage of its deals is undisclosed."
  );
  if (b.geoFit >= 10) parts.push(`Deals concentrate in ${p.country}.`);
  if (b.reachability === 0) parts.push("No public intake route found — needs a warm intro.");
  return parts.join(" ");
}
