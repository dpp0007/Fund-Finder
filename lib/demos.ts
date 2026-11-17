/** Saved example runs (demos/*.json) served as completed runs, so the whole app and API work with no API keys. */
import fs from "fs";
import path from "path";
import type { ResearchRun } from "@/types";

export const DEMOS: Record<string, { file: string; title: string }> = {
  "demo-a": { file: "demo-a-interview-ai-india.json", title: "AI interview automation · pre-seed · India" },
  "demo-b": { file: "demo-b-warehouse-robots-us.json", title: "Warehouse humanoid robots · seed · US" },
  "demo-c": { file: "demo-c-irrigation-india.json", title: "Precision irrigation · seed · India" },
};

export function loadDemoRun(id: string): ResearchRun | undefined {
  const d = DEMOS[id];
  if (!d) return undefined;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), "demos", d.file), "utf8"));
    const at = j.generatedAt ?? new Date().toISOString();
    return {
      id, status: "completed", step: "done", progress: 100,
      input: { description: j.startup.description, stage: j.startup.stage, country: j.startup.country, windowMonths: j.startup.windowMonths ?? 12, targetAmountUsd: j.startup.targetAmountUsd },
      profile: j.startup, logs: [{ at, step: "done", message: "Saved example run (replayed from demos/, no live calls).", level: "info" }],
      deals: j.companies, investors: j.investors, tinysetDatasetId: j.meta?.tinysetDatasetId,
      tinyfishCalls: j.meta?.tinyfishCalls ?? { tinyset: 0, search: 0, fetch: 0, agent: 0 },
      createdAt: at, updatedAt: at, completedAt: at,
    };
  } catch { return undefined; }
}
