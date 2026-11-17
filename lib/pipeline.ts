/**
 * Funding Radar pipeline.
 *  1 analyze  Gemini turns the description into a profile + search queries
 *  2 discover TinySet builds a table of recently-funded similar companies (+ Search/Fetch news supplement)
 *  3 score    Gemini rates each company's similarity to the founder's startup
 *  4 verify   Fetch every source page; a deal counts only if the page names the company AND investor
 *  5 rank     deterministic score over verified deals only
 *  6 enrich   Search + Fetch + Gemini for lead partner / cheque / thesis; Agent hunts pitch-intake pages
 */
import { geminiJSON, geminiState, hasGemini } from "./gemini";
import * as tf from "./tinyfish";
import { saveRun } from "./store";
import { investorEvidence } from "./proof";
import { STAGES, buildInvestors, investorKey, monthsAgo, norm, parseStage, splitInvestors, type Enrichment } from "./scoring";
import type { Deal, OutreachRoute, ResearchRun, Stage, StartupProfile } from "@/types";

const TINYSET_MAX_WAIT_MS = Number(process.env.TINYSET_MAX_WAIT_MS || 8 * 60_000);
const TINYSET_ROWS = Number(process.env.TINYSET_ROWS || 40);

type Level = "info" | "warn" | "error";
function log(run: ResearchRun, step: string, message: string, progress?: number, level: Level = "info") {
  run.step = step;
  if (progress !== undefined) run.progress = progress;
  run.logs.push({ at: new Date().toISOString(), step, message, level });
  saveRun(run);
}

const uid = () => Math.random().toString(36).slice(2, 9);
const domain = (u?: string) => {
  try { return new URL(u!).hostname.replace(/^www\./, ""); } catch { return ""; }
};
const okUrl = (u: unknown): string | undefined => {
  if (typeof u !== "string") return undefined;
  try { const x = new URL(u.trim()); return /^https?:$/.test(x.protocol) ? x.toString() : undefined; } catch { return undefined; }
};
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
    })
  );
  return out;
}

/* ---------------- 1. analyze ---------------- */
async function analyze(run: ResearchRun): Promise<StartupProfile> {
  const inp = run.input;
  const today = new Date().toISOString().slice(0, 10);
  const g = await geminiJSON<Partial<StartupProfile>>(`Today is ${today}. A founder describes their startup:
"""${inp.description}"""
Stage given: ${inp.stage ?? "not given"}. Country given: ${inp.country ?? "not given"}.
Return JSON: {"stage":"pre-seed|seed|series-a|series-b+","country":"HQ country of the startup","industry":"specific sector, 2-5 words","businessModel":"e.g. B2B SaaS, hardware+services, marketplace","customer":"who buys it","keywords":["6 concrete product/market keywords"],"searchQueries":["6 diverse news-style queries that would find funding announcements of SIMILAR companies, e.g. 'warehouse humanoid robot startup raises seed'"]}
Use the given stage/country if provided. Do not invent a stage if not stated: infer the most likely.`);
  const words = [...new Set(norm(inp.description).split(" ").filter((w) => w.length > 4))].slice(0, 6);
  const stage = inp.stage ?? parseStage(g?.stage) ?? "seed";
  const country = inp.country ?? g?.country ?? "United States";
  const profile: StartupProfile = {
    ...inp,
    stage,
    country,
    industry: g?.industry || words.slice(0, 3).join(" "),
    businessModel: g?.businessModel || "unspecified",
    customer: g?.customer || "unspecified",
    keywords: g?.keywords?.length ? g.keywords.slice(0, 8) : words,
    searchQueries: g?.searchQueries?.length
      ? g.searchQueries.slice(0, 6)
      : [`${words.slice(0, 4).join(" ")} startup raises ${stage} funding`],
  };
  return profile;
}

/* ---------------- 2a. TinySet ---------------- */
function cutoffDate(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function datasetSpec(p: StartupProfile, cutoff: string): tf.DatasetSpec {
  return {
    name: `Funded startups like: ${p.industry}`.slice(0, 190),
    description:
      `Startups similar to this one that publicly announced a funding round on or after ${cutoff}: "${p.description.slice(0, 600)}". ` +
      `Sector: ${p.industry}. Business model: ${p.businessModel}. Customer: ${p.customer}. Keywords: ${p.keywords.join(", ")}. ` +
      `Only include ${[STAGES[Math.max(0, STAGES.indexOf(p.stage) - 1)], p.stage, STAGES[Math.min(3, STAGES.indexOf(p.stage) + 1)]].filter((s, i, a) => a.indexOf(s) === i).join(", ")} rounds (later-stage rounds are not useful evidence). ` +
      `Prefer companies in ${p.country}, but include strongly similar companies from anywhere. ` +
      `Only include companies whose round is documented in an article or announcement that names the investors.`,
    columns: [
      { name: "company_name", label: "Company", type: "string", is_primary_key: true, format: "Plain company name" },
      { name: "website", label: "Website", type: "url", is_primary_key: false },
      { name: "what_it_does", label: "What it does", type: "string", is_primary_key: false, format: "One sentence" },
      { name: "hq_country", label: "HQ country", type: "string", is_primary_key: false },
      { name: "round_stage", label: "Round stage", type: "string", is_primary_key: false, format: "One of: pre-seed, seed, series-a, series-b+" },
      { name: "amount_usd", label: "Round size USD", type: "number", is_primary_key: false, retrieval_hint: "Total round size in US dollars as a plain number" },
      { name: "announced_date", label: "Announced", type: "date", is_primary_key: false, retrieval_hint: `Date the round was announced, YYYY-MM-DD; must be on or after ${cutoff}` },
      { name: "lead_investor", label: "Lead investor", type: "string", is_primary_key: false, retrieval_hint: "Firm that led the round, if stated" },
      { name: "all_investors", label: "All investors", type: "string", is_primary_key: false, format: "Comma-separated names of every investor named in the round" },
      { name: "source_url", label: "Proof URL", type: "url", is_primary_key: false, retrieval_hint: "URL of the article or announcement that names the company AND its investors" },
    ],
  };
}

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
// TinySet may rename planned columns (e.g. company_name -> company), so accept aliases.
const ALIASES: Record<string, string[]> = {
  company_name: ["company_name", "company", "name", "startup"],
  website: ["website", "url", "company_website"],
  what_it_does: ["what_it_does", "description", "what_they_do", "product"],
  hq_country: ["hq_country", "country", "hq", "headquarters"],
  round_stage: ["round_stage", "stage", "round", "funding_stage"],
  amount_usd: ["amount_usd", "round_size_usd", "amount", "round_size", "funding_amount_usd"],
  announced_date: ["announced_date", "announced", "date", "announcement_date"],
  lead_investor: ["lead_investor", "lead"],
  all_investors: ["all_investors", "investors", "participating_investors"],
  source_url: ["source_url", "proof_url", "source", "article_url", "announcement_url"],
};
function normalizeRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [canon, names] of Object.entries(ALIASES)) {
    const hit = names.find((n) => raw[n] !== undefined && raw[n] !== null && raw[n] !== "");
    if (hit) out[canon] = raw[hit];
  }
  return out;
}

export function rowToDeal(r: tf.DatasetRow): Deal | null {
  const d = normalizeRow(r.data);
  const company = S(d.company_name);
  if (!company) return null;
  const investors = splitInvestors(d.all_investors);
  const lead = S(d.lead_investor);
  // co-leads arrive as one string ("A, B"): add each as an investor
  for (const l of splitInvestors(lead ?? "").reverse()) if (!investors.some((i) => investorKey(i) === investorKey(l))) investors.unshift(l);
  const amt = Number(d.amount_usd);
  return {
    id: `ts-${r._id}`,
    company,
    website: okUrl(d.website),
    description: S(d.what_it_does),
    hq: S(d.hq_country),
    stage: parseStage(S(d.round_stage)),
    roundLabel: S(d.round_stage),
    amountUsd: amt > 0 ? amt : undefined,
    date: S(d.announced_date)?.slice(0, 10),
    leadInvestor: lead,
    investors,
    sourceUrl: okUrl(d.source_url),
    origin: "tinyset",
    similarity: 0,
    verified: false,
    verifiedInvestors: [],
  };
}

async function discoverTinySet(run: ResearchRun, p: StartupProfile): Promise<Deal[]> {
  let datasetId = run.tinysetDatasetId; // set when resuming: reuse the paid-for dataset
  if (!datasetId) {
    const ds = await tf.createDataset(datasetSpec(p, cutoffDate(p.windowMonths)), TINYSET_ROWS);
    run.tinyfishCalls.tinyset++;
    run.tinysetDatasetId = datasetId = ds.id;
  }
  log(run, "discover", `TinySet dataset ${datasetId.slice(0, 8)} is researching the live web (typically 5–15 min).`, 15);

  const t0 = Date.now();
  let deals: Deal[] = [];
  let lastCount = -1;
  let errors = 0;
  while (Date.now() - t0 < TINYSET_MAX_WAIT_MS) {
    try {
      const cur = await tf.getDataset(datasetId);
      run.tinyfishCalls.tinyset++;
      const finished = cur.status === "ready" || cur.status === "failed" || cur.status === "cancelled";
      if (cur.row_count !== lastCount || finished) {
        lastCount = cur.row_count;
        const rows = await tf.getAllRows(datasetId);
        deals = rows.map(rowToDeal).filter((d): d is Deal => !!d);
        run.deals = mergeDeals(run.deals.filter((d) => d.origin !== "tinyset"), deals);
        log(run, "discover", `TinySet has found ${deals.length} companies so far…`, Math.min(40, 15 + deals.length));
      }
      errors = 0;
      if (finished) {
        if (cur.status !== "ready") log(run, "discover", `TinySet ended as "${cur.status}" ${cur.run?.error ?? ""}`, undefined, "warn");
        break;
      }
    } catch (e) {
      // transient network/API hiccup: keep polling, give up only after repeated failures
      if (++errors >= 8) throw e;
      console.warn("tinyset poll error", (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, 6000));
  }
  return deals;
}

/* ---------------- 2b. Search + Fetch supplement ---------------- */
interface Extracted {
  source_index: number;
  company?: string; website?: string; description?: string; hq?: string; stage?: string;
  amount_usd?: number; date?: string; lead_investor?: string; investors?: string[];
}

async function discoverSearch(run: ResearchRun, p: StartupProfile): Promise<Deal[]> {
  if (!hasGemini()) { log(run, "discover", "No GEMINI_API_KEY — skipping news supplement.", undefined, "warn"); return []; }
  const after = cutoffDate(p.windowMonths);
  const hits = (
    await pool(p.searchQueries, 3, async (q) => {
      try { run.tinyfishCalls.search++; return await tf.search(q, { domainType: "news", afterDate: after }); } catch { return []; }
    })
  ).flat();
  const urls = [...new Set(hits.map((h) => okUrl(h.url)).filter((u): u is string => !!u))].slice(0, 16);
  log(run, "discover", `Search found ${urls.length} funding articles; fetching…`, 20);
  run.tinyfishCalls.fetch += Math.ceil(urls.length / 10);
  const pages = await tf.fetchPages(urls);
  const out: Deal[] = [];
  const batches: (typeof pages)[] = [];
  for (let i = 0; i < pages.length; i += 3) batches.push(pages.slice(i, i + 3));
  await pool(batches, 3, async (batch) => {
    const r = await geminiJSON<{ deals?: Extracted[] }>(`Extract startup funding rounds ANNOUNCED on or after ${after} from these articles. Only use facts stated in the text; omit unknown fields. Skip rounds from before ${after}.
Return {"deals":[{"source_index":<article number>,"company":"","website":"","description":"one sentence","hq":"country","stage":"pre-seed|seed|series-a|series-b+","amount_usd":number,"date":"YYYY-MM-DD","lead_investor":"","investors":["every named investor"]}]}
${batch.map((pg, i) => `--- ARTICLE ${i} (${pg.url}) ---\n${(pg.text || "").slice(0, 7000)}`).join("\n")}`);
    for (const e of r?.deals || []) {
      const pg = batch[e.source_index];
      if (!e.company || !pg) continue;
      const investors = splitInvestors(e.investors);
      for (const l of splitInvestors(e.lead_investor ?? "").reverse()) if (!investors.some((i) => investorKey(i) === investorKey(l))) investors.unshift(l);
      out.push({
        id: `se-${uid()}`, company: e.company, website: okUrl(e.website), description: e.description, hq: e.hq,
        stage: parseStage(e.stage), roundLabel: e.stage, amountUsd: e.amount_usd && e.amount_usd > 0 ? e.amount_usd : undefined,
        date: e.date, leadInvestor: e.lead_investor, investors, sourceUrl: pg.final_url || pg.url,
        origin: "search", similarity: 0, verified: false, verifiedInvestors: [],
      });
    }
  });
  log(run, "discover", `Extracted ${out.length} funding rounds from news.`, 38);
  return out;
}

// "HeyMilo" and "HeyMilo AI" are one company: drop generic suffix words before comparing.
const companyKey = (s: string) => norm(s).replace(/\b(ai|inc|ltd|llc|corp|labs|technologies|technology|co|hq|app|io)\b/g, " ").replace(/\s+/g, " ").trim() || norm(s);

function mergeDeals(a: Deal[], b: Deal[]): Deal[] {
  const map = new Map<string, Deal>();
  for (const d of [...a, ...b]) {
    const k = companyKey(d.company);
    const ex = map.get(k);
    if (!ex) { map.set(k, { ...d }); continue; }
    ex.investors = splitInvestors([...ex.investors, ...d.investors]);
    ex.website ??= d.website; ex.description ??= d.description; ex.hq ??= d.hq; ex.stage ??= d.stage;
    ex.amountUsd ??= d.amountUsd; ex.date ??= d.date; ex.leadInvestor ??= d.leadInvestor; ex.sourceUrl ??= d.sourceUrl;
  }
  return [...map.values()];
}

/* ---------------- 3. similarity ---------------- */
async function rateSimilarity(run: ResearchRun, p: StartupProfile) {
  const deals = run.deals;
  const prompt = `Founder's startup: "${p.description}" (stage ${p.stage}, ${p.country}; ${p.industry}; ${p.businessModel}; customer: ${p.customer}).
Rate how similar each funded company is to the founder's startup for the purpose of finding investors who back this kind of business: 1 = same product & customer, 0.7 = same problem, different angle, 0.4 = adjacent sector, 0.1 = unrelated. Judge only from the description given.
Return {"ratings":[{"id":"","similarity":0-1,"reason":"<=18 words naming the concrete overlap"}]}
${JSON.stringify(deals.map((d) => ({ id: d.id, company: d.company, description: d.description })))}`;
  // This rating drives the whole ranking, so don't settle for the keyword fallback on the first hiccup:
  // wait out the Gemini circuit-breaker window and try again (3 attempts).
  let g: { ratings?: Array<{ id: string; similarity: number; reason: string }> } | null = null;
  for (let attempt = 0; hasGemini() && !g?.ratings?.length && attempt < 3; attempt++) {
    if (attempt) { log(run, "match", "Gemini busy — retrying the similarity rating…", undefined, "warn"); await new Promise((r) => setTimeout(r, 65_000)); }
    g = await geminiJSON<{ ratings?: Array<{ id: string; similarity: number; reason: string }> }>(prompt);
  }
  const byId = new Map((g?.ratings || []).map((r) => [r.id, r]));
  const kw = new Set([...p.keywords.flatMap((k) => norm(k).split(" ")), ...norm(p.industry).split(" ")].filter((w) => w.length > 3));
  for (const d of deals) {
    const r = byId.get(d.id);
    if (r) { d.similarity = Math.max(0, Math.min(1, Number(r.similarity) || 0)); d.similarityReason = r.reason; }
    else {
      const words = norm(`${d.company} ${d.description ?? ""}`).split(" ");
      const hit = words.filter((w) => kw.has(w)).length;
      d.similarity = Math.min(0.8, hit / Math.max(3, kw.size / 2));
      d.similarityReason = undefined; // heuristic has no real reason; don't show a fake one
    }
  }
}

/* ---------------- 4. verify ---------------- */
const pageText = new Map<string, string>(); // proof url -> text (kept for lead-partner extraction)

function checkDeal(d: Deal, url: string, text: string, published?: string): boolean {
  if (!norm(text).includes(norm(d.company))) return false;
  const evidence: Record<string, string> = {};
  for (const inv of d.investors) {
    const ev = investorEvidence(text, inv);
    if (ev) evidence[inv] = ev;
  }
  const names = Object.keys(evidence);
  if (!names.length) return false;
  const leadKeys = splitInvestors(d.leadInvestor ?? "").map(investorKey);
  const lead = names.find((n) => leadKeys.includes(investorKey(n)));
  d.verifiedInvestors = names;
  d.evidence = evidence;
  d.proofUrl = url;
  d.verified = true;
  d.date ??= published?.slice(0, 10);
  d.proofExcerpt = evidence[lead ?? names[0]];
  pageText.set(url, text);
  return true;
}

/** Named individuals with an explicit firm affiliation on the proof pages we already fetched. */
async function extractPartners(run: ResearchRun) {
  if (!hasGemini()) return;
  const deals = run.deals.filter((d) => d.verified && d.proofUrl && pageText.has(d.proofUrl));
  const urls = [...new Set(deals.map((d) => d.proofUrl!))];
  let found = 0;
  await pool(urls, 2, async (url) => {
    const text = pageText.get(url)!;
    const ds = deals.filter((d) => d.proofUrl === url);
    const names = [...new Set(ds.flatMap((d) => d.verifiedInvestors))];
    const r = await geminiJSON<{ people?: Array<{ investor: string; name: string; role?: string }> }>(
      `From this article, list individuals who work at one of these investors: ${JSON.stringify(names)}. Include only people NAMED in the text with an explicit affiliation (for example "Jane Doe, partner at X" or a quote attributed to her). Return {"people":[{"investor":"<one of the names above>","name":"","role":""}]}. Return an empty list if none.\n---\n${text.slice(0, 9000)}`
    );
    for (const p of r?.people || []) {
      const inv = names.find((n) => investorKey(n) === investorKey(p.investor));
      const at = p.name ? text.indexOf(p.name) : -1;
      if (!inv || at < 0) continue; // the person must literally appear in the text
      const near = text.slice(Math.max(0, at - 500), at + 500).toLowerCase();
      if (!near.includes(investorKey(inv).split(" ")[0])) continue; // ...close to the investor's name
      for (const d of ds) if (d.verifiedInvestors.includes(inv)) { (d.people ??= []).push({ investor: inv, name: p.name, role: p.role }); found++; }
    }
  });
  log(run, "verify", `Named ${found} individual investors/partners from the proof pages.`, 70);
}

async function verify(run: ResearchRun, p: StartupProfile) {
  const cand = run.deals.filter((d) => d.investors.length).sort((a, b) => b.similarity - a.similarity).slice(0, 45);
  const urls = [...new Set(cand.map((d) => d.sourceUrl).filter((u): u is string => !!u))];
  run.tinyfishCalls.fetch += Math.ceil(urls.length / 10);
  const pages = await tf.fetchPages(urls);
  if (urls.length && !pages.length) throw new Error(`TinyFish Fetch returned no pages (${tf.tfStats.fetchFailed} batches failed after retries). Wait a minute and press Resume.`);
  const byUrl = new Map<string, (typeof pages)[number]>();
  pages.forEach((pg) => { byUrl.set(pg.url, pg); if (pg.final_url) byUrl.set(pg.final_url, pg); });
  let ok = 0;
  for (const d of cand) {
    const pg = d.sourceUrl ? byUrl.get(d.sourceUrl) : undefined;
    if (pg?.text && checkDeal(d, pg.final_url || pg.url, pg.text, pg.published_date)) ok++;
  }
  log(run, "verify", `${ok}/${cand.length} deals verified directly from their source page.`, 62);

  // Recovery: dead/mismatched source -> search for a page that does name both.
  const rest = cand.filter((d) => !d.verified && d.similarity >= 0.4).slice(0, 14);
  await pool(rest, 4, async (d) => {
    try {
      run.tinyfishCalls.search++;
      const hits = await tf.search(`"${d.company}" raises funding ${d.investors.slice(0, 2).join(" ")}`, { domainType: "news" });
      const u = hits.map((h) => okUrl(h.url)).filter((x): x is string => !!x).slice(0, 3);
      run.tinyfishCalls.fetch++;
      for (const pg of await tf.fetchPages(u)) if (pg.text && checkDeal(d, pg.final_url || pg.url, pg.text, pg.published_date)) { ok++; break; }
    } catch { /* leave unverified */ }
  });
  log(run, "verify", `After recovery search: ${ok} verified deals.`, 68);

  // Enforce window: drop verified deals older than the lookback (+1 month grace).
  for (const d of run.deals) {
    const m = monthsAgo(d.date);
    if (d.verified && m !== undefined && m > p.windowMonths + 1) { d.verified = false; d.proofExcerpt = undefined; d.proofUrl = undefined; }
  }
}

/* ---------------- 6. enrich ---------------- */
interface Enriched {
  website?: string; thesis?: string; cheque_stated?: string;
  lead_partner?: { name?: string; role?: string; evidence_url?: string; company?: string; basis?: string };
  routes?: Array<{ type?: string; url?: string; detail?: string }>;
}
const ROUTE_TYPES = ["application_form", "open_intake", "email", "warm_intro"];

async function enrichInvestor(run: ResearchRun, name: string, deals: Deal[]): Promise<Enrichment> {
  const key = investorKey(name);
  let hits: tf.SearchHit[] = [];
  let webHits: tf.SearchHit[] = [];
  try {
    run.tinyfishCalls.search += 3;
    const [a, b, c] = await Promise.all([
      tf.search(`${name} venture capital firm pitch submit startup`),
      tf.search(`${name} partner led investment ${deals[0]?.company ?? ""} ${deals[1]?.company ?? ""}`, { domainType: "news" }),
      tf.search(`${name} team partners cheque size ticket size invests`),
    ]);
    webHits = [...a, ...c];
    hits = [...a, ...b, ...c];
  } catch { /* continue with deal text only */ }
  // Website without Gemini, so the Agent can still browse it when Gemini is out of quota:
  // first non-aggregator web result whose title or domain names the investor.
  const AGGREGATOR = /(linkedin|twitter|x\.com|facebook|instagram|crunchbase|pitchbook|wikipedia|techcrunch|medium|youtube|tracxn|cbinsights|dealroom|f6s|angel\.co|reddit)/i;
  const guess = webHits.find((h) => !AGGREGATOR.test(domain(h.url)) && norm(`${h.title} ${domain(h.url)}`).includes(key.split(" ")[0]));
  const guessedWebsite = guess ? okUrl(new URL(guess.url).origin) : undefined;
  const siteHits = hits.filter((h) => norm(h.site_name || domain(h.url)).includes(key.split(" ")[0])).slice(0, 3);
  const fetchUrls = [...new Set([...siteHits.map((h) => h.url), ...hits.slice(0, 3).map((h) => h.url)])].map(okUrl).filter((u): u is string => !!u).slice(0, 4);
  run.tinyfishCalls.fetch++;
  const pages = fetchUrls.length ? await tf.fetchPages(fetchUrls) : [];
  const sources = [
    ...pages.map((pg) => ({ url: pg.final_url || pg.url, text: (pg.text || "").slice(0, 5000) })),
    ...deals.slice(0, 2).filter((d) => d.proofUrl && pageText.has(d.proofUrl)).map((d) => ({ url: d.proofUrl!, text: pageText.get(d.proofUrl!)!.slice(0, 5000) })),
  ];
  const snippets = hits.slice(0, 8).map((h) => `${h.url} — ${h.title}: ${h.snippet}`);
  const g = await geminiJSON<Enriched>(`Investor: "${name}". It backed: ${deals.slice(0, 4).map((d) => d.company).join(", ")}.
Using ONLY the sources below, return {"website":"investor's own site","thesis":"<=25 words","cheque_stated":"cheque/ticket size the investor states about itself, e.g. '$500K–$2M', else null","lead_partner":{"name":"individual partner named as leading or joining one of the deals above; if none is named, the partner on the investor's own team page whose focus fits the deals above","role":"","evidence_url":"one of the source URLs naming them","company":"deal company or null","basis":"deal_page if a source ties them to one of the deals, else team_page"} or null,"routes":[{"type":"application_form|open_intake|email|warm_intro","url":"","detail":"how a founder reaches them, as the source states it"}]}
Never guess a person or contact detail that is not in the sources. evidence_url and route urls must be URLs that appear below.
${sources.map((s) => `--- SOURCE ${s.url} ---\n${s.text}`).join("\n")}
--- SEARCH SNIPPETS ---\n${snippets.join("\n")}`);

  const allowed = new Set([...sources.map((s) => s.url), ...hits.map((h) => h.url)]);
  const enr: Enrichment = { website: okUrl(g?.website) ?? guessedWebsite ?? okUrl(siteHits[0]?.url), thesis: S(g?.thesis), chequeStated: S(g?.cheque_stated) };
  const lp = g?.lead_partner;
  const evText = lp?.evidence_url ? (sources.find((s) => s.url === lp.evidence_url)?.text ?? "") : "";
  // the person must literally appear in the cited source, so a name can never be invented
  if (lp?.name && lp.evidence_url && allowed.has(lp.evidence_url) && evText.includes(lp.name)) {
    const basis = lp.basis === "deal_page" ? "deal_page" : "team_page";
    enr.leadPartner = { name: lp.name, role: lp.role, evidenceUrl: lp.evidence_url, dealCompany: basis === "deal_page" ? lp.company : undefined, basis };
  }
  enr.outreach = (g?.routes || [])
    .filter((r) => r.type && ROUTE_TYPES.includes(r.type) && (!r.url || allowed.has(r.url) || r.type === "email"))
    .map((r) => ({ type: r.type as OutreachRoute["type"], url: okUrl(r.url), detail: r.detail || "", source: "page" as const }));
  void key;
  return enr;
}

async function agentIntake(run: ResearchRun, site: string): Promise<OutreachRoute | null> {
  try {
    run.tinyfishCalls.agent++;
    const r = await tf.runAgent<{ found?: boolean; type?: string; url?: string; email?: string; detail?: string }>(
      site,
      "Find how a startup founder can pitch this investor: an application / pitch submission form, a stated open-intake email, or a statement that they only accept warm intros. Look at the homepage, a Contact / Pitch / Apply / Submit page. Report only what the site shows.",
      {
        type: "object",
        properties: {
          found: { type: "boolean" },
          type: { type: "string", enum: ["application_form", "open_intake", "email", "warm_intro"] },
          url: { type: "string" }, email: { type: "string" }, detail: { type: "string" },
        },
        required: ["found"],
      }
    );
    if (!r?.found || !r.type || !ROUTE_TYPES.includes(r.type)) return null;
    return { type: r.type as OutreachRoute["type"], url: okUrl(r.url) ?? site, detail: r.detail || r.email || "Found by browsing the investor's site", source: "agent" };
  } catch (e) {
    console.warn("agent failed", (e as Error).message);
    return null;
  }
}

/* ---------------- investor kind: fund vs individual angel ---------------- */
const FIRM_WORDS = /\b(capital|ventures?|partners?|vc|funds?|labs?|group|holdings|investments?|studio|accelerator|club|combinator|techstars|antler|equity|angels?|syndicate|foundation|office|bank|corp|inc|ltd|llc|fund|catalyst|growth)\b/i;
async function classifyInvestors(names: string[]): Promise<Record<string, "fund" | "angel">> {
  const heuristic = (n: string): "fund" | "angel" =>
    !FIRM_WORDS.test(n) && /^[A-Z][a-z'.-]+(\s[A-Z][a-z'.-]+|\s[A-Z]\.?|\sIII|\sJr\.?){1,2}$/.test(n.trim()) ? "angel" : "fund";
  const out: Record<string, "fund" | "angel"> = Object.fromEntries(names.map((n) => [n, heuristic(n)]));
  const g = await geminiJSON<{ kinds?: Array<{ name: string; kind: string }> }>(
    `Classify each investor name as "fund" (venture firm, accelerator, corporate investor, syndicate, institution, any organisation) or "angel" (an individual person investing personally). Return {"kinds":[{"name":"","kind":"fund|angel"}]}.\n${JSON.stringify(names)}`
  );
  for (const k of g?.kinds || []) if (k.name in out && (k.kind === "fund" || k.kind === "angel")) out[k.name] = k.kind;
  return out;
}

/* ---------------- main ---------------- */
export async function runPipeline(run: ResearchRun): Promise<void> {
  try {
    run.status = "running";
    const startExhausted = geminiState.exhausted;
    run.deals = [];
    run.investors = [];
    if (!tf.hasTinyFish()) throw new Error("TINYFISH_API_KEY is not set in .env.local");
    if (!hasGemini()) log(run, "analyze", "GEMINI_API_KEY not set — using keyword heuristics (weaker matching, no news supplement, no partner extraction).", 2, "warn");

    log(run, "analyze", "Understanding your startup…", 3);
    const profile = await analyze(run);
    run.profile = profile;
    log(run, "analyze", `Sector: ${profile.industry} · ${profile.stage} · ${profile.country}`, 10);

    log(run, "discover", "Asking TinySet to build a dataset of similar funded companies…", 12);
    const [tsDeals, seDeals] = await Promise.all([
      discoverTinySet(run, profile).catch((e) => { log(run, "discover", `TinySet failed: ${(e as Error).message}`, undefined, "error"); return [] as Deal[]; }),
      discoverSearch(run, profile).catch((e) => { log(run, "discover", `Search supplement failed: ${(e as Error).message}`, undefined, "warn"); return [] as Deal[]; }),
    ]);
    run.deals = mergeDeals(tsDeals, seDeals);
    if (!run.deals.length) throw new Error("No funded companies were found. Try a more descriptive one-liner.");
    log(run, "discover", `${run.deals.length} candidate funded companies.`, 45);

    log(run, "match", "Rating how similar each company is to yours…", 48);
    await rateSimilarity(run, profile);
    run.deals.sort((a, b) => b.similarity - a.similarity);
    const keep = run.deals.filter((d) => d.similarity >= 0.25);
    run.deals = keep.length >= 10 ? keep : run.deals.slice(0, 15);
    saveRun(run);

    log(run, "verify", "Opening every source page to confirm the investment…", 55);
    await verify(run, profile);
    await extractPartners(run);
    run.deals = run.deals.filter((d) => d.verified || d.similarity >= 0.4);
    const verified = run.deals.filter((d) => d.verified).length;
    log(run, "verify", `${verified} verified investments across ${run.deals.length} similar companies.`, 70);
    if (!verified) throw new Error("Found companies but could not verify any investment from a live source page.");

    log(run, "rank", "Ranking investors by the deals they actually did…", 72);
    const enrich: Record<string, Enrichment> = {};
    const kinds = await classifyInvestors([...new Set(run.deals.filter((d) => d.verified).flatMap((d) => d.verifiedInvestors))]);
    for (const [name, kind] of Object.entries(kinds)) enrich[investorKey(name)] = { kind };
    let investors = buildInvestors(run.deals, profile, enrich).slice(0, 25); // funds first, angels after

    log(run, "enrich", `Researching partners and intake routes for the top ${Math.min(15, investors.length)} investors…`, 76);
    await pool(investors.filter((i) => i.kind === "fund").slice(0, 15), 4, async (inv) => {
      const deals = run.deals.filter((d) => d.verified && d.verifiedInvestors.some((v) => investorKey(v) === investorKey(inv.name)));
      try { const k = investorKey(inv.name); enrich[k] = { ...enrich[k], ...(await enrichInvestor(run, inv.name, deals)) }; } catch (e) { console.warn("enrich", (e as Error).message); }
    });
    log(run, "enrich", "Browsing top investors' sites for pitch-intake routes…", 88);
    await pool(investors.filter((i) => i.kind === "fund").slice(0, 8), 3, async (inv) => {
      const k = investorKey(inv.name);
      const e = (enrich[k] ??= {});
      const hasRoute = (e.outreach || []).some((r) => r.type === "application_form" || r.type === "open_intake");
      if (!hasRoute && e.website) {
        const r = await agentIntake(run, e.website);
        if (r) e.outreach = [r, ...(e.outreach || [])];
      }
    });
    // Always give a route: warm intro via the founders they backed (derived, not invented).
    for (const inv of investors.slice(0, 20)) {
      const e = (enrich[investorKey(inv.name)] ??= {});
      if (!(e.outreach || []).length) {
        e.outreach = [{ type: "warm_intro", detail: `No public intake found. Ask the founders of ${inv.backed.slice(0, 3).map((b) => b.company).join(", ")} for an introduction.`, source: "derived" }];
      }
    }
    investors = buildInvestors(run.deals, profile, enrich).slice(0, 25);
    run.investors = investors;
    if (geminiState.exhausted > startExhausted)
      log(run, "enrich", "Gemini quota/rate limit was hit during this run — some similarity ratings, partner names or intake routes may be missing. Resume later for a fuller result.", undefined, "warn");
    run.status = "completed";
    run.completedAt = new Date().toISOString();
    log(run, "done", `Done — ${investors.length} ranked investors, every one backed by a live source.`, 100);
  } catch (e) {
    run.status = "failed";
    run.error = (e as Error).message;
    log(run, "failed", run.error, undefined, "error");
  }
}

export type { Stage };
