export type Stage = "pre-seed" | "seed" | "series-a" | "series-b+";

export type RunStatus = "queued" | "running" | "completed" | "failed";

export interface StartupInput {
  description: string;
  stage?: Stage;
  country?: string;
  windowMonths: 12 | 18;
  targetAmountUsd?: number;
}

/** What Gemini (or the heuristic fallback) understood about the startup. */
export interface StartupProfile extends StartupInput {
  stage: Stage;
  country: string;
  industry: string;
  businessModel: string;
  customer: string;
  keywords: string[];
  searchQueries: string[];
}

export interface StepLog {
  at: string;
  step: string;
  message: string;
  level: "info" | "warn" | "error";
}

export interface Deal {
  id: string;
  company: string;
  website?: string;
  description?: string;
  hq?: string;
  stage?: Stage;
  roundLabel?: string;
  amountUsd?: number;
  date?: string; // YYYY-MM or YYYY-MM-DD
  leadInvestor?: string;
  investors: string[];
  sourceUrl?: string;
  origin: "tinyset" | "search";
  /** 0..1 similarity to the founder's startup, with a reason. */
  similarity: number;
  similarityReason?: string;
  /** Proof: the source page was fetched and names the company and investor(s). */
  verified: boolean;
  verifiedInvestors: string[];
  proofExcerpt?: string;
  proofUrl?: string;
  /** Per-investor quote from the proof page where that investor is named in this round. */
  evidence?: Record<string, string>;
  /** Individuals named on the proof page with an explicit firm affiliation. */
  people?: Array<{ investor: string; name: string; role?: string }>;
}

export type RouteType = "application_form" | "open_intake" | "email" | "warm_intro" | "unknown";

export interface OutreachRoute {
  type: RouteType;
  url?: string;
  detail: string;
  /** page = read from a fetched page, agent = found by the TinyFish Agent browsing, derived = suggested, not found */
  source?: "page" | "agent" | "derived";
}

export interface BackedCompany {
  dealId: string;
  company: string;
  website?: string;
  stage?: Stage;
  roundLabel?: string;
  amountUsd?: number;
  date?: string;
  role: "lead" | "participant";
  similarity: number;
  similarityReason?: string;
  proofUrl: string;
  proofExcerpt?: string;
}

export interface InvestorMatch {
  id: string;
  rank: number;
  name: string;
  /** "angel" = an individual investing personally; listed after all funds. */
  kind: "fund" | "angel";
  website?: string;
  score: number;
  breakdown: {
    similarDeals: number;
    stageFit: number;
    geoFit: number;
    recency: number;
    chequeFit: number;
    reachability: number;
  };
  whyRanked: string;
  stages: Stage[];
  roundSizeRange?: { minUsd: number; medianUsd: number; maxUsd: number };
  typicalCheque: string;
  leadCount: number;
  backed: BackedCompany[];
  /** deal_page = named on the proof page of a deal; team_page = from the investor's own site (not confirmed as the deal lead) */
  leadPartner?: { name: string; role?: string; evidenceUrl?: string; dealCompany?: string; basis?: "deal_page" | "team_page" };
  outreach: OutreachRoute[];
  thesis?: string;
  /** How much to trust the match: high = a close company at this stage, or a repeated pattern; low = a single adjacent deal. */
  confidence: "high" | "medium" | "low";
  /** Where the cheque figure comes from. */
  chequeBasis: "stated" | "round-sizes" | "unknown";
}

export interface ResearchRun {
  id: string;
  status: RunStatus;
  step: string;
  progress: number; // 0..100
  input: StartupInput;
  profile?: StartupProfile;
  logs: StepLog[];
  deals: Deal[];
  investors: InvestorMatch[];
  tinysetDatasetId?: string;
  tinyfishCalls: { tinyset: number; search: number; fetch: number; agent: number };
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
