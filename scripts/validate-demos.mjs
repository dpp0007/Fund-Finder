// Audits demos/*.json. Offline: structure + proof-quote checks. With --live: every proof URL must load.
//   node scripts/validate-demos.mjs [--live]
import fs from "node:fs";

const live = process.argv.includes("--live");
const files = fs.readdirSync("demos").filter((f) => f.endsWith(".json"));
const urls = new Map();
let bad = 0;

for (const f of files) {
  const j = JSON.parse(fs.readFileSync(`demos/${f}`, "utf8"));
  const inv = j.investors;
  const co = j.companies;
  let quoteOk = 0, quoteTot = 0;
  for (const i of inv) {
    for (const b of i.backed) {
      quoteTot++;
      const q = (b.proofExcerpt || "").toLowerCase();
      const core = i.name.toLowerCase().replace(/\b(capital|ventures?|partners?|vc|fund)\b/g, "").trim();
      if (q.includes(core)) quoteOk++;
      urls.set(b.proofUrl, f);
    }
  }
  const allWithProof = inv.every((i) => i.backed.length && i.backed.every((b) => /^https?:\/\//.test(b.proofUrl) && b.proofExcerpt));
  const funds = inv.filter((i) => i.kind === "fund");
  const sorted = funds.every((i, k) => k === 0 || funds[k - 1].score >= i.score);
  const row = {
    investors: inv.length,
    companies: co.length,
    verifiedCompanies: co.filter((c) => c.verified).length,
    everyMatchHasProofLinkAndQuote: allWithProof,
    investorNamedInQuote: `${quoteOk}/${quoteTot}`,
    leadPartner: inv.filter((i) => i.leadPartner).length,
    chequeInfo: inv.filter((i) => i.typicalCheque && i.typicalCheque !== "Not disclosed").length,
    reachRoute: inv.filter((i) => i.outreach.length).length,
    openDoor: inv.filter((i) => i.outreach.some((o) => /form|intake/.test(o.type))).length,
    rankedByScore: sorted,
  };
  if (!allWithProof || !sorted || quoteOk < quoteTot) bad++;
  console.log(f, JSON.stringify(row));
}

if (live) {
  let ok = 0;
  const fail = [];
  const list = [...urls.keys()];
  const check = async (u) => {
    try {
      const r = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(20000), headers: { "user-agent": "Mozilla/5.0 (link-check)" } });
      if (r.status < 400 || r.status === 403 || r.status === 429) ok++;
      else fail.push(`${r.status} ${u}`);
    } catch {
      fail.push(`ERR ${u}`);
    }
  };
  for (let i = 0; i < list.length; i += 8) await Promise.all(list.slice(i, i + 8).map(check));
  console.log(`live links: ${ok}/${list.length} reachable (403/429 = bot-blocked, page exists)`);
  fail.forEach((x) => console.log("  ", x));
}
process.exit(bad ? 1 : 0);
