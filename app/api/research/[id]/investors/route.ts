import { NextRequest, NextResponse } from "next/server";
import { getRun } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Ranked investors. ?limit=N&minScore=N */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const run = getRun(params.id);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const q = req.nextUrl.searchParams;
  const min = Number(q.get("minScore")) || 0;
  const limit = Number(q.get("limit")) || 100;
  const investors = run.investors.filter((i) => i.score >= min).slice(0, limit);
  return NextResponse.json({ status: run.status, total: investors.length, investors });
}
