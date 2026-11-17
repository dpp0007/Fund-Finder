import test from "node:test";
import assert from "node:assert/strict";
import { buildInvestors, parseStage, splitInvestors, investorKey } from "../lib/scoring.ts";
import { investorsCsv } from "../lib/export.ts";
import type { Deal, StartupProfile } from "../types/index.ts";

const profile: StartupProfile = {
  description: "x", stage: "seed", country: "United States", windowMonths: 12, industry: "robotics",
  businessModel: "hardware", customer: "warehouses", keywords: [], searchQueries: [],
};
const NOW = new Date("2026-11-01");
const deal = (o: Partial<Deal>): Deal => ({
  id: o.company ?? "d", company: "Co", investors: [], origin: "tinyset", similarity: 0.9, verified: true,
  verifiedInvestors: [], proofUrl: "https://example.com/a", hq: "United States", stage: "seed", amountUsd: 3e6, date: "2026-09-01", ...o,
});

test("parseStage / splitInvestors / investorKey", () => {
  assert.equal(parseStage("Series A"), "series-a");
  assert.equal(parseStage("Pre Seed"), "pre-seed");
  assert.deepEqual(splitInvestors("Base10 Partners, Bonfire Ventures; and Antler"), ["Base10 Partners", "Bonfire Ventures", "Antler"]);
  assert.equal(investorKey("Base10 Partners"), investorKey("Base10"));
});

test("unverified deals never produce investors", () => {
  const out = buildInvestors([deal({ company: "A", verified: false, verifiedInvestors: ["Ghost VC"], proofUrl: undefined })], profile, {}, NOW);
  assert.equal(out.length, 0);
});

test("a close, same-stage, led deal outranks an adjacent, off-stage one", () => {
  const out = buildInvestors(
    [
      deal({ company: "A", verifiedInvestors: ["Close VC"], leadInvestor: "Close VC", similarity: 0.95 }),
      deal({ company: "B", verifiedInvestors: ["Far VC"], similarity: 0.35, stage: "series-b+", amountUsd: 5e7 }),
    ],
    profile, {}, NOW
  );
  assert.equal(out[0].name, "Close VC");
  assert.ok(out[0].score > out[1].score + 15);
  assert.equal(out[0].confidence, "high");
  assert.equal(out[1].confidence, "low");
});

test("relevance gate: an open application form cannot lift an adjacent-only investor above a close one", () => {
  const out = buildInvestors(
    [
      deal({ company: "A", verifiedInvestors: ["Close VC"], similarity: 0.8 }),
      deal({ company: "B", verifiedInvestors: ["Adjacent VC"], similarity: 0.3 }),
    ],
    profile, { [investorKey("Adjacent VC")]: { outreach: [{ type: "application_form", detail: "form" }] } }, NOW
  );
  assert.equal(out[0].name, "Close VC");
});

test("funds are listed before angels", () => {
  const out = buildInvestors(
    [deal({ company: "A", verifiedInvestors: ["Jane Doe", "Fund VC"], similarity: 0.9 })],
    profile, { [investorKey("Jane Doe")]: { kind: "angel" } }, NOW
  );
  assert.deepEqual(out.map((o) => o.kind), ["fund", "angel"]);
});

test("a person named on a deal page is reported as the partner, with its basis", () => {
  const d = deal({ company: "A", verifiedInvestors: ["Fund VC"], people: [{ investor: "Fund VC", name: "Pat Lee", role: "Partner" }] });
  const out = buildInvestors([d], profile, {}, NOW);
  assert.equal(out[0].leadPartner?.name, "Pat Lee");
  assert.equal(out[0].leadPartner?.basis, "deal_page");
});

test("CSV export escapes commas and quotes", () => {
  const out = buildInvestors([deal({ company: 'Acme, "Inc"', verifiedInvestors: ["Fund VC"] })], profile, {}, NOW);
  const csv = investorsCsv({ investors: out, deals: [] } as never);
  assert.ok(csv.includes('Acme, ""Inc""'));
  assert.equal(csv.split("\r\n").length, 2);
});
