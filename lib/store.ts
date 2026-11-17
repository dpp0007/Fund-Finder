/**
 * File-backed run store (.data/runs/<id>.json). Shared by every route and survives
 * dev-server reloads. ponytail: single-node only; swap for Supabase/Postgres to deploy serverless.
 */
import fs from "fs";
import path from "path";
import type { ResearchRun } from "@/types";
import { loadDemoRun } from "./demos";

const DIR = path.join(process.cwd(), ".data", "runs");
const g = globalThis as unknown as { __runs?: Map<string, ResearchRun> };
const cache = (g.__runs ??= new Map());

const ID_RE = /^[a-z0-9]{6,32}$/;

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function saveRun(run: ResearchRun): void {
  run.updatedAt = new Date().toISOString();
  cache.set(run.id, run);
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, `${run.id}.json`), JSON.stringify(run));
  } catch (e) {
    console.error("saveRun failed", e);
  }
}

export function getRun(id: string): ResearchRun | undefined {
  if (/^demo-[a-c]$/.test(id)) return loadDemoRun(id);
  if (!ID_RE.test(id)) return undefined;
  const hit = cache.get(id);
  if (hit) return hit;
  try {
    const run = JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), "utf8")) as ResearchRun;
    // A run left "running" by a dead process can never finish.
    if (run.status === "running" || run.status === "queued") {
      run.status = "failed";
      run.error = "Run was interrupted (server restarted).";
    }
    cache.set(id, run);
    return run;
  } catch {
    return undefined;
  }
}

export function listRuns(): Array<Pick<ResearchRun, "id" | "status" | "input" | "createdAt">> {
  try {
    return fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => getRun(f.replace(".json", "")))
      .filter((r): r is ResearchRun => !!r)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12)
      .map(({ id, status, input, createdAt }) => ({ id, status, input, createdAt }));
  } catch {
    return [];
  }
}
