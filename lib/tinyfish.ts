/**
 * TinyFish client (server-side only). Endpoints verified against docs.tinyfish.ai:
 *  - TinySet   POST/GET agent.tinyfish.ai/v1/datasets
 *  - Search    GET  api.search.tinyfish.ai
 *  - Fetch     POST api.fetch.tinyfish.ai
 *  - Agent     POST agent.tinyfish.ai/v1/automation/run
 * Auth: X-API-Key header.
 */
const KEY = () => process.env.TINYFISH_API_KEY || "";
const AGENT_HOST = (process.env.TINYFISH_BASE_URL || "https://agent.tinyfish.ai").replace(/\/$/, "");

export const hasTinyFish = () => !!KEY();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Failures we had to give up on, so the pipeline can report them instead of silently seeing "no pages". */
export const tfStats = { fetchFailed: 0, searchFailed: 0 };

// Search/Fetch run behind a small gate: parallel runs otherwise trip rate limits / dropped connections.
let inflight = 0;
const waiters: Array<() => void> = [];
async function gated<T>(fn: () => Promise<T>): Promise<T> {
  if (inflight >= 4) await new Promise<void>((r) => waiters.push(r));
  inflight++;
  try { return await fn(); } finally { inflight--; waiters.shift()?.(); }
}

/** One TinyFish call with retries on network errors, 429 and 5xx (backoff, honours Retry-After). */
async function call<T>(url: string, init: RequestInit = {}, timeoutMs = 60_000, retries = 3): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "X-API-Key": KEY(), "Content-Type": "application/json", ...(init.headers || {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (res.ok) return text ? (JSON.parse(text) as T) : ({} as T);
      last = new Error(`TinyFish ${res.status} ${url.split("?")[0]}: ${text.slice(0, 300)}`);
      if (res.status !== 429 && res.status < 500) throw last; // 4xx other than 429: retrying won't help
      await sleep(Math.min(30_000, (Number(res.headers.get("retry-after")) || 2 * (attempt + 1)) * 1000));
    } catch (e) {
      last = e;
      if (e instanceof Error && /^TinyFish 4\d\d/.test(e.message) && !/^TinyFish 429/.test(e.message)) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw last;
}

/* ---------- TinySet ---------- */

export interface DatasetColumn {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "url" | "date";
  is_primary_key: boolean;
  retrieval_hint?: string;
  format?: string;
  examples?: string[];
}
export interface DatasetSpec {
  name: string;
  description: string;
  columns: DatasetColumn[];
}
export interface Dataset {
  id: string;
  status: "empty" | "populating" | "ready" | "failed" | "cancelled";
  row_count: number;
  run: { id: string; status: string; error?: string } | null;
}
export interface DatasetRow {
  _id: string;
  data: Record<string, unknown>;
}

export const createDataset = (spec: DatasetSpec, targetRows: number) =>
  call<Dataset>(`${AGENT_HOST}/v1/datasets`, {
    method: "POST",
    body: JSON.stringify({ spec, target_rows: targetRows }),
  });

export const getDataset = (id: string) => call<Dataset>(`${AGENT_HOST}/v1/datasets/${id}`);

export async function getAllRows(id: string): Promise<DatasetRow[]> {
  const out: DatasetRow[] = [];
  let after: string | undefined;
  for (let i = 0; i < 5; i++) {
    const q = new URLSearchParams({ limit: "500", ...(after ? { after } : {}) });
    const r = await call<{ rows: DatasetRow[]; truncated?: boolean; next_cursor?: string }>(
      `${AGENT_HOST}/v1/datasets/${id}/rows?${q}`
    );
    out.push(...(r.rows || []));
    if (!r.truncated || !r.next_cursor) break;
    after = r.next_cursor;
  }
  return out;
}

/* ---------- Search ---------- */

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  site_name?: string;
  date?: string;
}

export async function search(
  query: string,
  opts: { domainType?: "web" | "news"; afterDate?: string; location?: string } = {}
): Promise<SearchHit[]> {
  const q = new URLSearchParams({ query });
  if (opts.domainType) q.set("domain_type", opts.domainType);
  if (opts.afterDate) q.set("after_date", opts.afterDate);
  if (opts.location) q.set("location", opts.location);
  try {
    const r = await gated(() => call<{ results?: SearchHit[] }>(`https://api.search.tinyfish.ai?${q}`));
    return r.results || [];
  } catch (e) {
    tfStats.searchFailed++;
    throw e;
  }
}

/* ---------- Fetch ---------- */

export interface FetchedPage {
  url: string;
  final_url?: string;
  title?: string;
  text?: string;
  published_date?: string;
}

/** Fetch up to 10 URLs per call; per-URL failures are returned in `errors` and skipped. */
export async function fetchPages(urls: string[]): Promise<FetchedPage[]> {
  const out: FetchedPage[] = [];
  for (let i = 0; i < urls.length; i += 5) {
    try {
      const r = await gated(() =>
        call<{ results?: Array<FetchedPage & { text?: unknown }> }>(
          "https://api.fetch.tinyfish.ai",
          { method: "POST", body: JSON.stringify({ urls: urls.slice(i, i + 5), format: "markdown" }) },
          150_000
        )
      );
      for (const p of r.results || []) if (typeof p.text === "string" && p.text) out.push(p as FetchedPage);
    } catch (e) {
      tfStats.fetchFailed++;
      const c = (e as { cause?: { code?: string } }).cause?.code;
      console.warn("fetch batch failed after retries:", (e as Error).message, c ?? "");
    }
  }
  return out;
}

/* ---------- Agent ---------- */

export async function runAgent<T = unknown>(
  url: string,
  goal: string,
  outputSchema?: object
): Promise<T | null> {
  const r = await call<{ status?: string; result?: T }>(
    `${AGENT_HOST}/v1/automation/run`,
    {
      method: "POST",
      body: JSON.stringify({
        url,
        goal,
        output_schema: outputSchema,
        // no agent_config: custom max_steps needs a beta flag and returns 403 FORBIDDEN on standard accounts
      }),
    },
    170_000,
    0 // never retry an Agent run: a timeout would otherwise repeat a multi-minute browse up to 4 times
  );
  return r.status === "COMPLETED" ? (r.result ?? null) : null;
}
