import { NextResponse } from "next/server";
import { getRun, saveRun } from "@/lib/store";
import { runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const active = (globalThis as unknown as { __active?: Set<string> });
const running = (active.__active ??= new Set());

/** Re-run a failed/interrupted run. Reuses its TinySet dataset, so no new dataset is billed. */
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const run = getRun(params.id);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.status === "completed") return NextResponse.json({ error: "Run already completed" }, { status: 409 });
  if (running.has(run.id)) return NextResponse.json({ error: "Already running" }, { status: 409 });
  run.status = "queued";
  run.error = undefined;
  run.progress = 5;
  saveRun(run);
  running.add(run.id);
  void runPipeline(run).finally(() => running.delete(run.id));
  return NextResponse.json({ id: run.id, status: "running" }, { status: 202 });
}
