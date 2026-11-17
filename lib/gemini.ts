/**
 * Minimal Gemini JSON-mode client (REST, no SDK). Key: GEMINI_API_KEY or GOOGLE_API_KEY.
 * - at most 2 calls in flight
 * - 429 per-day / 404: model is skipped for the rest of the process
 * - 429 per-minute with a short retry hint: wait once; anything slower or 503 (overloaded): next model
 * - each call has a total time budget, and once every model is exhausted a short circuit-breaker makes
 *   queued calls fail fast, so a quota-starved key degrades a run instead of stalling it for hours
 */
const key = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
export const hasGemini = () => !!key();

const MODELS = () => [
  ...(process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []),
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];
const dead = new Set<string>();
const MAX_INFLIGHT = 2;
const CALL_BUDGET_MS = 90_000;
const BREAKER_MS = 60_000;
let breakerUntil = 0;
let inflight = 0;
const waiters: Array<() => void> = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (inflight >= MAX_INFLIGHT) await new Promise<void>((r) => waiters.push(r));
  inflight++;
  try { return await fn(); } finally { inflight--; waiters.shift()?.(); }
}

/** Counts calls that returned nothing because Gemini was exhausted, so the pipeline can tell the user. */
export const geminiState = { exhausted: 0 };

export function geminiJSON<T>(prompt: string): Promise<T | null> {
  if (!hasGemini()) return Promise.resolve(null);
  return slot(async () => {
    const t0 = Date.now();
    if (Date.now() < breakerUntil) { geminiState.exhausted++; return null; }
    for (const model of MODELS()) {
      if (dead.has(model)) continue;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (Date.now() - t0 > CALL_BUDGET_MS) break;
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
            }),
            signal: AbortSignal.timeout(45_000),
          });
          if (res.status === 404) { dead.add(model); break; }
          if (res.status === 429 || res.status === 503) {
            const body = await res.text();
            if (res.status === 429 && /PerDay|per day/i.test(body)) { dead.add(model); break; }
            const hint = Number(body.match(/retry in ([\d.]+)s/i)?.[1]);
            if (res.status === 429 && hint > 0 && hint <= 20 && attempt === 0) { await sleep(hint * 1000 + 500); continue; }
            if (res.status === 503 && attempt === 0) { await sleep(2500); continue; }
            break; // overloaded or slow quota window: try the next model
          }
          if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
          const data = await res.json();
          const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
          return JSON.parse(text.replace(/^```json\s*|```\s*$/g, "")) as T;
        } catch (e) {
          const msg = (e as Error).message;
          console.warn(`gemini ${model} failed (attempt ${attempt + 1}):`, msg);
          if (attempt === 0 && /fetch failed|aborted|timeout|terminated|ECONN|socket/i.test(msg)) { await sleep(1500); continue; }
          break;
        }
      }
    }
    geminiState.exhausted++;
    breakerUntil = Date.now() + BREAKER_MS;
    return null;
  });
}
