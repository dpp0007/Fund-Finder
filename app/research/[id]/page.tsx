"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Download, Loader2, Search, ShieldCheck } from "lucide-react";
import { useRun } from "@/components/useRun";
import Radar from "@/components/Radar";
import { InvestorRow, hasDirect } from "@/components/InvestorCard";
import { Ext, host } from "@/components/ui";
import { fmtUsd } from "@/lib/scoring";

const STEPS: Array<[string, string]> = [
  ["analyze", "Understand your startup"],
  ["discover", "TinySet scans the live web"],
  ["match", "Rate similarity"],
  ["verify", "Open every proof page"],
  ["rank", "Rank investors"],
  ["enrich", "Find partners & intake routes"],
];

type Sort = "score" | "deals" | "recent";

export default function ResearchPage({ params }: { params: { id: string } }) {
  const { run, error } = useRun(params.id);
  const [tab, setTab] = useState<"investors" | "companies" | "method">("investors");
  const [q, setQ] = useState("");
  const [direct, setDirect] = useState(false);
  const [led, setLed] = useState(false);
  const [multi, setMulti] = useState(false);
  const [firms, setFirms] = useState(false);
  const [sort, setSort] = useState<Sort>("score");

  const list = useMemo(() => {
    if (!run) return [];
    let l = run.investors.filter((i) =>
      (!q || i.name.toLowerCase().includes(q.toLowerCase()) || i.backed.some((b) => b.company.toLowerCase().includes(q.toLowerCase()))) &&
      (!direct || hasDirect(i)) && (!led || i.leadCount > 0) && (!multi || i.backed.length >= 2) && (!firms || i.kind !== "angel"));
    if (sort === "deals") l = [...l].sort((a, b) => b.backed.length - a.backed.length || b.score - a.score);
    if (sort === "recent") l = [...l].sort((a, b) => (b.backed[0]?.date ?? "").localeCompare(a.backed[0]?.date ?? ""));
    return l;
  }, [run, q, direct, led, multi, firms, sort]);

  if (error) return <main className="mx-auto max-w-3xl px-5 py-20 text-center text-coral">{error}</main>;
  if (!run) return <main className="mx-auto max-w-3xl px-5 py-20 text-center text-mute"><Loader2 className="mx-auto mb-3 animate-spin" />Loading…</main>;

  const done = run.status === "completed";
  const failed = run.status === "failed";
  const p = run.profile;
  const activeIdx = Math.max(0, STEPS.findIndex(([k]) => k === run.step));
  const verified = run.deals.filter((d) => d.verified).length;
  const openDoors = run.investors.filter(hasDirect).length;
  const chips = [p?.stage ?? run.input.stage, p?.country ?? run.input.country, `${run.input.windowMonths}-month window`, p?.industry, p?.businessModel && p.businessModel !== "unspecified" ? p.businessModel : ""].filter(Boolean);

  const Toggle = ({ on, set, children }: { on: boolean; set: (v: boolean) => void; children: React.ReactNode }) => (
    <button onClick={() => set(!on)} aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${on ? "border-brand bg-brand text-white" : "border-line bg-white text-mute hover:border-brand hover:text-brand"}`}>{children}</button>
  );

  return (
    <main className="mx-auto max-w-5xl px-5 pb-16">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-mute">Investor shortlist for</p>
        <h1 className="mt-1 max-w-3xl text-xl font-bold leading-snug sm:text-2xl">{run.input.description}</h1>
        <div className="mt-3 flex flex-wrap gap-1.5">{chips.map((t) => <span key={String(t)} className="chip">{t}</span>)}</div>
      </div>

      {failed && (
        <div className="card border-coral/40 p-6">
          <h2 className="text-lg font-bold text-coral">The run stopped</h2>
          <p className="mt-1 text-sm text-mute">{run.error}</p>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" onClick={() => fetch(`/api/research/${run.id}/resume`, { method: "POST" }).then(() => location.reload())}>Resume (reuses paid dataset)</button>
            <Link href="/" className="btn-ghost">New search</Link>
          </div>
        </div>
      )}

      {!done && !failed && (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="card p-5">
            <Radar deals={run.deals} />
            <div className="mt-4 flex justify-center gap-4 text-xs text-mute">
              <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-good" />verified</span>
              <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber" />candidate</span>
            </div>
            <div className="mt-5 h-1.5 rounded-full bg-line"><div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${run.progress}%` }} /></div>
            <ol className="mt-5 space-y-2.5">
              {STEPS.map(([k, label], i) => (
                <li key={k} className={`flex items-center gap-2.5 text-sm ${i > activeIdx ? "text-mute/60" : i === activeIdx ? "font-semibold text-ink" : "text-mute"}`}>
                  {i < activeIdx ? <Check className="h-4 w-4 text-good" /> : i === activeIdx ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : <span className="h-4 w-4 rounded-full border border-line" />}
                  {label}
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-6">
            <div className="card p-5">
              <h2 className="label">Companies found so far · {run.deals.length}</h2>
              {run.deals.length === 0 && <p className="text-sm text-mute">TinySet is researching the live web. First companies usually appear within a few minutes — this is a real crawl, not a cache.</p>}
              <ul className="grid gap-2 sm:grid-cols-2">
                {run.deals.slice(0, 12).map((d) => (
                  <li key={d.id} className="animate-rise rounded-xl border border-line bg-panel2/60 p-2.5 text-sm">
                    <div className="flex justify-between gap-2"><b className="truncate">{d.company}</b>{d.verified && <ShieldCheck className="h-4 w-4 shrink-0 text-good" />}</div>
                    <p className="truncate text-xs text-mute">{[d.stage, d.amountUsd ? fmtUsd(d.amountUsd) : "", d.hq].filter(Boolean).join(" · ")}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card max-h-64 overflow-auto p-5 font-mono text-xs">
              <h2 className="label">Live log</h2>
              {[...run.logs].reverse().map((l, i) => (
                <p key={i} className={l.level === "error" ? "text-coral" : l.level === "warn" ? "text-amber" : "text-mute"}>
                  <span className="text-brand/70">{new Date(l.at).toLocaleTimeString()}</span> {l.message}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {done && (
        <>
          <div className="card mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-4">
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              {[[run.investors.length, "investors ranked"], [openDoors, "with an open door"], [verified, "verified deals"], [run.deals.length, "similar companies"]].map(([n, l]) => (
                <div key={String(l)}><span className="text-xl font-extrabold text-brand">{n}</span> <span className="text-mute">{l}</span></div>
              ))}
            </div>
            <div className="flex gap-2">
              <a className="btn-ghost !py-2" href={`/api/research/${run.id}/export?format=csv&download=1`}><Download className="h-4 w-4" /> CSV</a>
              <a className="btn-ghost !py-2" href={`/api/research/${run.id}/export?format=json&download=1`}><Download className="h-4 w-4" /> JSON</a>
            </div>
          </div>

          <div role="tablist" className="mb-5 inline-flex gap-1 rounded-xl border border-line bg-white p-1">
            {(["investors", "companies", "method"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize ${tab === t ? "bg-brand text-white" : "text-mute hover:text-ink"}`}>{t}</button>
            ))}
          </div>

          {tab === "investors" && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search investor or portfolio company" className="field !pl-9" />
                </div>
                <Toggle on={direct} set={setDirect}>Open door</Toggle>
                <Toggle on={led} set={setLed}>Led a deal</Toggle>
                <Toggle on={multi} set={setMulti}>2+ similar deals</Toggle>
                <Toggle on={firms} set={setFirms}>Firms only</Toggle>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="field !w-auto" aria-label="Sort">
                  <option value="score">Best fit</option><option value="deals">Most deals</option><option value="recent">Most recent</option>
                </select>
              </div>
              <div className="space-y-3">
                {list.map((inv, i) => <InvestorRow key={inv.id} inv={inv} runId={run.id} defaultOpen={i === 0 && !q && !direct && !led && !multi} />)}
                {list.length === 0 && <p className="card p-8 text-center text-sm text-mute">No investors match these filters.</p>}
              </div>
              <p className="mt-4 text-xs text-mute">Ranked by how many verified deals in companies like yours they did, how well stage, geography, recency and round size match, and whether there is a way in.</p>
            </>
          )}

          {tab === "companies" && (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-mute">
                  <tr>{["Company", "Round", "Date", "Investors", "Similar", "Proof"].map((h) => <th key={h} className="p-3 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {run.deals.map((d) => (
                    <tr key={d.id} className="border-b border-line/60 align-top">
                      <td className="p-3"><b>{d.company}</b><div className="max-w-[240px] text-xs text-mute">{d.description}</div></td>
                      <td className="whitespace-nowrap p-3">{[d.stage, d.amountUsd ? fmtUsd(d.amountUsd) : ""].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="whitespace-nowrap p-3">{d.date ?? "—"}</td>
                      <td className="p-3 text-xs">{d.investors.join(", ")}</td>
                      <td className="p-3">{Math.round(d.similarity * 100)}%</td>
                      <td className="p-3 text-xs">{d.verified && d.proofUrl ? <Ext href={d.proofUrl}>{host(d.proofUrl)} ↗</Ext> : <span className="text-amber">unverified</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "method" && (
            <div className="card space-y-4 p-6 text-sm leading-relaxed text-ink/80">
              <p><b className="text-ink">TinySet</b> builds a table of recently funded companies similar to yours (company, round, size, date, lead, all investors, proof URL) from the live web — dataset <code className="text-brand">{run.tinysetDatasetId}</code>.</p>
              <p><b className="text-ink">Search + Fetch</b> add funding news, then re-open every proof URL. A deal only counts if the page names both the company and the investor.</p>
              <p><b className="text-ink">Agent</b> browses top investors’ sites for pitch forms and intake routes ({run.tinyfishCalls.agent} agent runs).</p>
              <p><b className="text-ink">Ranking</b> (0–100): similar deals backed 40 (scaled down for investors with only one deal) · stage fit 20 · geography 15 · recency 10 · round-size fit 10 · reachability 5. Only verified deals feed the score, so a famous firm with no comparable deals ranks low.</p>
              <p className="text-mute">API calls: {JSON.stringify(run.tinyfishCalls)}</p>
              <Link href="/" className="btn-ghost">Run another startup</Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}
