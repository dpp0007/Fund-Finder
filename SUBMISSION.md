# Funding Radar — submission

## What you built

Funding Radar takes a one-line startup description (plus stage and country) and returns a ranked list of investors to approach, with proof for every match.

1. **Understand** — the description becomes a profile (sector, business model, customer, stage, country) and search queries.
2. **Find similar funded companies** — TinySet builds a table of companies like yours that raised in the last 12 or 18 months: round, size, date, lead, all investors, proof URL. Search adds funding news.
3. **Prove every deal** — every proof URL is fetched. A deal counts only if the page names the company, and names the investor as a proper noun in the same sentence as funding language ("led", "participated"), not in an earlier-round sentence.
4. **Rank** — a 0–100 score from verified deals only: similar deals backed 40, stage fit 20, geography 15, recency 10, round-size fit 10, reachability 5. A relevance gate stops an investor whose closest deal is only adjacent from outranking a close match. Each investor gets a `confidence` (high / medium / low) and a plain-language `whyRanked`.
5. **Make it actionable** — lead partner (named on a deal page, or from the investor's team page and labelled as such), cheque (stated by the investor, otherwise the round sizes they joined), and how to reach them (application form, open intake, email or a warm-intro route; each labelled `agent`, `page` or `derived`).

Output is a UI, a REST API and JSON/CSV exports.

## Where TinyFish is used

| Endpoint | What it does here | Why it matters |
|---|---|---|
| **TinySet** | Builds the core dataset of recently funded similar companies, with a column spec generated from the profile | Works for any startup, not a hardcoded list; every value comes from a real page |
| **Search** | Finds extra funding news, recovers a proof page when a source is dead, finds investor sites, team pages and cheque mentions | Fills the gaps TinySet leaves |
| **Fetch** | Opens every proof URL so a deal is only kept if the page names company and investor | This is the accuracy guarantee |
| **Agent** | Browses top investors' sites for a pitch form or open-intake route | Finds routes that are not in search snippets |

## How to test it

**1. No keys, no wait: three finished runs**
```bash
npm install
npm run dev
```
Open http://localhost:3000 and click one of the three example runs, or call the API:
```bash
curl localhost:3000/api/research/demo-b/investors?limit=5
curl "localhost:3000/api/research/demo-b/export?format=csv"
```
Examples: `demo-a` (AI interviews, pre-seed, India), `demo-b` (warehouse humanoids, seed, US), `demo-c` (precision irrigation, seed, India). Raw files are in `demos/` (JSON, investors CSV, companies CSV).

**2. Audit the evidence yourself**
```bash
npm test                       # proof rule, ranking, export
npm run validate:demos         # every match has a link and a quote naming the investor
npm run validate:demos -- --live   # every proof URL loads
```

**3. Live run on your own startup** (needs `TINYFISH_API_KEY`, optional `GEMINI_API_KEY` in `.env.local`; 5–15 min)
```bash
curl -X POST localhost:3000/api/research -H "Content-Type: application/json" \
  -d '{"description":"Voice AI that automates first-round interviews","stage":"seed","country":"India"}'
curl localhost:3000/api/research/<id>            # status + results
curl "localhost:3000/api/research/<id>/export?format=json"
```
