import { NextRequest, NextResponse } from "next/server";
import { getRun } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Similar funded companies. ?verified=1 only returns deals with a confirmed source page. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const run = getRun(params.id);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const only = req.nextUrl.searchParams.get("verified") === "1";
  const companies = run.deals.filter((d) => !only || d.verified);
  return NextResponse.json({ total: companies.length, companies });
}
