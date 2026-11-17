import { NextRequest, NextResponse } from "next/server";
import { listRuns, newId, saveRun } from "@/lib/store";
import { runPipeline } from "@/lib/pipeline";
import { parseStage } from "@/lib/scoring";
import type { ResearchRun } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/** POST { description, stage?, country?, windowMonths?: 12|18, targetAmountUsd? } -> { id } */
export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (description.length < 10 || description.length > 2000)
    return NextResponse.json({ error: "description must be 10–2000 characters" }, { status: 400 });
  const stage = b.stage ? parseStage(String(b.stage)) : undefined;
  if (b.stage && !stage) return NextResponse.json({ error: "stage must be pre-seed, seed, series-a or series-b+" }, { status: 400 });
  const target = Number(b.targetAmountUsd);

  const now = new Date().toISOString();
  const run: ResearchRun = {
    id: newId(), status: "queued", step: "queued", progress: 0,
    input: {
      description, stage,
      country: typeof b.country === "string" && b.country.trim() ? b.country.trim().slice(0, 60) : undefined,
      windowMonths: Number(b.windowMonths) === 18 ? 18 : 12,
      targetAmountUsd: target > 0 ? target : undefined,
    },
    logs: [], deals: [], investors: [],
    // optional: reuse an already-built TinySet dataset (UUID) instead of paying for a new one
    tinysetDatasetId: typeof b.tinysetDatasetId === "string" && /^[0-9a-f-]{36}$/.test(b.tinysetDatasetId) ? b.tinysetDatasetId : undefined,
    tinyfishCalls: { tinyset: 0, search: 0, fetch: 0, agent: 0 },
    createdAt: now, updatedAt: now,
  };
  saveRun(run);
  void runPipeline(run); // runs in this Node process; poll GET /api/research/:id or stream /events
  return NextResponse.json({ id: run.id, researchId: run.id, status: run.status }, { status: 202 });
}

export async function GET() {
  return NextResponse.json({ runs: listRuns() });
}
