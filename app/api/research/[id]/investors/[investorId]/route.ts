import { NextResponse } from "next/server";
import { getRun } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string; investorId: string } }) {
  const inv = getRun(params.id)?.investors.find((i) => i.id === params.investorId);
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(inv);
}
