import { NextRequest, NextResponse } from "next/server";
import { getRun } from "@/lib/store";
import { dealsCsv, investorsCsv, jsonExport } from "@/lib/export";

export const dynamic = "force-dynamic";

/** ?format=json (default) | csv (ranked investors) | companies-csv */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const run = getRun(params.id);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const format = req.nextUrl.searchParams.get("format") || "json";
  const dl = req.nextUrl.searchParams.get("download") === "1";
  const file = (body: string, type: string, ext: string) =>
    new NextResponse(body, {
      headers: {
        "Content-Type": `${type}; charset=utf-8`,
        ...(dl ? { "Content-Disposition": `attachment; filename="funding-radar-${run.id}.${ext}"` } : {}),
      },
    });
  if (format === "json") return file(JSON.stringify(jsonExport(run), null, 2), "application/json", "json");
  if (format === "csv") return file(investorsCsv(run), "text/csv", "csv");
  if (format === "companies-csv") return file(dealsCsv(run), "text/csv", "companies.csv");
  return NextResponse.json({ error: "format must be json, csv or companies-csv" }, { status: 400 });
}
