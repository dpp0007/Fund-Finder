import { NextResponse } from "next/server";
import { getRun } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Full run state: status, progress, logs, profile, deals, ranked investors. */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const run = getRun(params.id);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(run);
}
