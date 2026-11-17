"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import type { ResearchRun, Stage } from "@/types";
import Radar from "@/components/Radar";

const STAGES: Array<{ v: Stage; l: string }> = [
  { v: "pre-seed", l: "Pre-seed" }, { v: "seed", l: "Seed" }, { v: "series-a", l: "Series A" }, { v: "series-b+", l: "Series B+" },
];
const COUNTRIES = ["United States", "India", "United Kingdom", "Germany", "France", "Singapore", "Canada", "Brazil", "Nigeria", "Japan", "Australia", "UAE"];

const EXAMPLES: Array<{ tag: string; description: string; stage: Stage; country: string }> = [
  { tag: "Interview AI · India", description: "AI-powered interview automation platform that helps mid-market HR teams screen and shortlist candidates", stage: "pre-seed", country: "India" },
  { tag: "Warehouse robots · US", description: "Affordable humanoid robots that pick and pack in industrial warehouses", stage: "seed", country: "United States" },
  { tag: "Smart irrigation · India", description: "IoT and satellite-driven precision irrigation for small farms that cuts water use and raises yield", stage: "seed", country: "India" },
];

export default function Home() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<Stage>("seed");
  const [country, setCountry] = useState("United States");
  const [windowMonths, setWindow] = useState<12 | 18>(12);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<Array<Pick<ResearchRun, "id" | "status" | "input" | "createdAt">>>([]);

  useEffect(() => {
    fetch("/api/research").then((r) => r.json()).then((j) => setRecent(j.runs || [])).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (description.trim().length < 10) return setError("Describe what your startup does in a sentence.");
    setBusy(true);
    try {
      const r = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, stage, country, windowMonths, targetAmountUsd: target ? Number(target) : undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not start");
      router.push(`/research/${j.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-6 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
      <section>
        <p className="chip mb-5 text-brand">Investor discovery, from the deals they actually did</p>
        <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
          Who would <span className="text-brand">actually</span> fund you?
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-mute">
          Describe your startup in one line. We find companies like it that raised in the last 12–18 months, read who backed them,
          and hand you a ranked list — with a live link proving every match.
        </p>

        <form onSubmit={submit} className="card mt-8 space-y-5 p-5">
          <div>
            <label className="label" htmlFor="d">Your startup, in one line</label>
            <textarea id="d" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600}
              placeholder="e.g. Voice AI that automates first-round interviews for HR teams" className="field resize-none text-base" />
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((x) => (
                <button type="button" key={x.tag} className="chip transition hover:border-brand/60 hover:text-brand"
                  onClick={() => { setDescription(x.description); setStage(x.stage); setCountry(x.country); }}>
                  ✦ {x.tag}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="label">Stage</span>
            <div className="grid grid-cols-4 gap-2">
              {STAGES.map((s) => (
                <button type="button" key={s.v} onClick={() => setStage(s.v)} aria-pressed={stage === s.v}
                  className={`rounded-xl border px-2 py-2 text-sm font-medium transition ${stage === s.v ? "border-brand bg-brand/10 text-brand" : "border-line text-mute hover:text-brand"}`}>
                  {s.l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="c">Country</label>
              <input id="c" list="countries" value={country} onChange={(e) => setCountry(e.target.value)} className="field" />
              <datalist id="countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <span className="label">Look back</span>
              <div className="grid grid-cols-2 gap-2">
                {[12, 18].map((m) => (
                  <button type="button" key={m} onClick={() => setWindow(m as 12 | 18)}
                    className={`rounded-xl border py-2.5 text-sm font-medium ${windowMonths === m ? "border-brand bg-brand/10 text-brand" : "border-line text-mute"}`}>{m} mo</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="t">Raising (USD, optional)</label>
              <input id="t" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} placeholder="1000000" className="field" />
            </div>
          </div>

          {error && <p role="alert" className="rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
          <button disabled={busy} className="btn-primary w-full py-3 text-base">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Launching radar…</> : <>Find my investors <ArrowRight className="h-4 w-4" /></>}
          </button>
          <p className="text-center text-xs text-mute">A live run takes roughly 5–15 minutes — TinySet is reading the real web, not a cache.</p>
        </form>
      </section>

      <aside className="space-y-8">
        <Radar deals={[]} />
        <div className="grid grid-cols-3 gap-3 text-center text-xs text-mute">
          {[["1", "Describe"], ["2", "Radar sweeps live sources"], ["3", "Ranked, proven investors"]].map(([n, t]) => (
            <div key={n} className="card p-3"><div className="text-xl font-bold text-brand">{n}</div>{t}</div>
          ))}
        </div>
        <div className="card p-4">
          <h2 className="label">See a finished run now (no API keys, no wait)</h2>
          <ul className="space-y-2">
            {[["demo-a", "AI interview automation · pre-seed · India"], ["demo-b", "Warehouse humanoid robots · seed · US"], ["demo-c", "Precision irrigation · seed · India"]].map(([id, t]) => (
              <li key={id}><Link href={`/research/${id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-panel2"><span>{t}</span><span className="chip text-brand">open</span></Link></li>
            ))}
          </ul>
        </div>
        {recent.length > 0 && (
          <div className="card p-4">
            <h2 className="label">Recent runs</h2>
            <ul className="space-y-2">
              {recent.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <Link href={`/research/${r.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-panel2">
                    <span className="line-clamp-1">{r.input.description}</span>
                    <span className={`chip ${r.status === "completed" ? "text-brand" : r.status === "failed" ? "text-coral" : "text-amber"}`}>{r.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </main>
  );
}
