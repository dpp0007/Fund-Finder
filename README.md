# Funding Radar

> Judges: see [SUBMISSION.md](SUBMISSION.md) for what it is, where TinyFish is used, and how to test it in two minutes (no API keys needed for the saved example runs).

Describe your startup in one line. Funding Radar finds similar companies that raised in the last 12–18 months, reads who backed them, and returns a ranked list of investors — each with a live link and a quoted passage proving a real investment in a similar company.

## Run it

Saved example runs open instantly at `/research/demo-a`, `demo-b`, `demo-c` (also via the API) with no keys. Tests: `npm test`. Demo audit: `npm run validate:demos [-- --live]`.


```bash
npm install
# .env.local
#   TINYFISH_API_KEY=...
#   GEMINI_API_KEY=...        (optional GEMINI_MODEL; falls back across models)
npm run dev
```

A run takes roughly 5–15 minutes because TinySet researches the live web. Open `http://localhost:3000`, or call the API below.

## How TinyFish is used

| API | Role |
|---|---|
| **TinySet** (`/v1/datasets`) | Builds the core table of recently funded similar companies: round, size, date, lead, all investors, proof URL. The column spec and prompt are generated from the startup profile, so it works for any description, and ask only for the founder's stage ±1. |
| **Search** | Finds funding news for extra deals; recovers a proof page when a source URL is dead; finds investor sites and partner mentions. |
| **Fetch** | Opens every proof URL. A deal counts only if the page names the company and the investor in funding language for this round. Also feeds investor pages to the extractor. |
| **Agent** | Browses investor sites for a pitch form or open-intake route. Each route is labelled `agent`, `page` (read from a fetched page) or `derived` (a suggestion, not published). |

Gemini is used to turn the description into a profile and search queries, to rate each company's similarity to yours, and to extract partner / cheque / intake facts from fetched pages. Extracted URLs and partner names must literally appear in the fetched sources.

## Proof rule

An investor is attached to a deal only if the proof page names it (case-sensitive, whole-word) close to funding language such as "led" or "participated", and not in a sentence about an earlier round. Each investor carries its own quoted passage from the page.

## Ranking (0–100, only verified deals count)

similar deals backed 40 (similarity × stage proximity; scaled down for investors with a single deal) · stage fit 20 · geography 15 · recency 10 · round-size fit 10 · reachability 5. Funds are listed before individual angels. Every investor carries a "why ranked" explanation built from its own deals.

## API

| Endpoint | |
|---|---|
| `POST /api/research` | `{ description, stage?, country?, windowMonths?: 12\|18, targetAmountUsd?, tinysetDatasetId? }` → `{ id }` |
| `GET /api/research/:id` | full run: status, profile, logs, companies, ranked investors |
| `GET /api/research/:id/events` | server-sent events of the run as it progresses |
| `GET /api/research/:id/investors` | ranked investors (`?limit=&minScore=`) |
| `GET /api/research/:id/investors/:investorId` | one investor with proof |
| `GET /api/research/:id/companies` | similar companies (`?verified=1`) |
| `GET /api/research/:id/export?format=json\|csv\|companies-csv` | machine-readable export (`&download=1` for a file) |
| `POST /api/research/:id/resume` | re-run a failed run, reusing its TinySet dataset |

Each investor: `name, kind (fund|angel), website, score, breakdown, whyRanked, stages, typicalCheque, leadCount, backed[] (company, stage, amount, date, role, proofUrl, proofExcerpt), leadPartner {name, evidenceUrl}, outreach[] {type, url, detail, source}`.

## Demos

Three different startups, outputs in [`demos/`](demos) (JSON and CSV):

| Demo | Companies (verified) | Rated ≥0.7 | Partners named | Open doors |
|---|---|---|---|---|
| A — AI interview automation for HR teams · pre-seed · India | 39 (37) | 34 | 2 | 2 |
| B — Affordable humanoid warehouse robots · seed · US | 41 (36) | 37 | 7 | 2 |
| C — IoT/satellite precision irrigation for small farms · seed · India | 30 (29) | 8 | 6 | 3 |

"Open door" = an application form or open-intake route. The demos reuse TinySet datasets built earlier (`tinysetDatasetId`) so they could be re-ranked without re-paying for the crawl.

## Known limits

- Many investors have a single verified deal in the window, so ranking leans on lead role, stage, geography and recency. Treat neighbouring ranks as a tie.
- Demo A's dataset holds mostly seed rounds, so only one investor there has a pre-seed deal. New datasets ask for the founder's stage ±1.
- Lead partner = a person named with an explicit affiliation on the proof page, or found by search; it may not be the person who led the round. Most investors have none.
- "Typical cheque" is the range of round sizes an investor joined; its own cheque appears only if its site states it.
- About two thirds of contact routes are `derived` (warm intro via the founders they backed), not a published route.
- Gemini free-tier daily quotas can run out. A run then logs a warning and falls back to keyword matching, with fewer partners and routes. Resume it later.
- Runs are stored as files in `.data/` and execute inside the Node process: fine locally, needs a database and a job queue to deploy serverless. Tests cover the proof rule, ranking and export (`npm test`).
