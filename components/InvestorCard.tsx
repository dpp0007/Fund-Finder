"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, FileText, Mail, UserRound, Users } from "lucide-react";
import type { InvestorMatch } from "@/types";
import { fmtUsd } from "@/lib/scoring";
import { BREAKDOWN, Bar, Ext, ROUTE_LABEL, host } from "./ui";

const ICON = { application_form: FileText, open_intake: FileText, email: Mail, warm_intro: Users, unknown: Users };
export const hasDirect = (i: InvestorMatch) => i.outreach.some((o) => o.type === "application_form" || o.type === "open_intake");

const tone = (s: number) => (s >= 70 ? "bg-brand" : s >= 45 ? "bg-amber" : "bg-mute/50");

/** Everything about one investor: proof, cheque, partner, outreach, optional score breakdown. */
export function InvestorDetail({ inv, runId, full = false }: { inv: InvestorMatch; runId: string; full?: boolean }) {
  const shown = full ? inv.backed : inv.backed.slice(0, 3);
  return (
    <div className="space-y-5">
      <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm leading-relaxed text-ink/90">
        <span className="font-semibold text-brand-dark">Why #{inv.rank} · </span>{inv.whyRanked}
      </p>

      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <section>
          <h4 className="label">Proof · similar companies they backed</h4>
          <ul className="space-y-2">
            {shown.map((b) => (
              <li key={b.dealId} className="rounded-xl border border-line bg-panel2/60 p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold">{b.company}<span className="ml-1.5 text-xs font-medium text-mute">{b.role === "lead" ? "led the round" : "participated"}</span></span>
                  <span className="text-xs text-mute">{[b.stage, b.amountUsd ? fmtUsd(b.amountUsd) : "", b.date].filter(Boolean).join(" · ")}</span>
                </div>
                {b.similarityReason && <p className="mt-1 text-xs text-mute">{b.similarityReason}</p>}
                {full && b.proofExcerpt && <blockquote className="mt-2 border-l-2 border-brand/40 pl-2.5 text-xs italic text-mute">“{b.proofExcerpt}”</blockquote>}
                <div className="mt-1.5 text-xs"><Ext href={b.proofUrl}>Read the announcement on {host(b.proofUrl)} ↗</Ext></div>
              </li>
            ))}
          </ul>
          {!full && inv.backed.length > 3 && (
            <Link className="mt-2 inline-block text-xs font-medium text-brand" href={`/research/${runId}/investors/${inv.id}`}>+ {inv.backed.length - 3} more with proof →</Link>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h4 className="label">Cheque & stage</h4>
            <p className="text-sm">{inv.typicalCheque}</p>
            {inv.stages.length > 0 && <p className="mt-1 text-xs text-mute">Stages seen: {inv.stages.join(", ")}</p>}
          </div>
          <div>
            <h4 className="label">Lead partner</h4>
            {inv.leadPartner ? (
              <p className="flex items-start gap-2 text-sm"><UserRound className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span><b>{inv.leadPartner.name}</b>{inv.leadPartner.role ? `, ${inv.leadPartner.role}` : ""}{inv.leadPartner.dealCompany ? ` · named on the ${inv.leadPartner.dealCompany} deal` : inv.leadPartner.basis === "team_page" ? " · from their team page, not confirmed as a deal lead" : ""}{" "}
                  {inv.leadPartner.evidenceUrl && <Ext href={inv.leadPartner.evidenceUrl}>source ↗</Ext>}</span></p>
            ) : <p className="text-sm text-mute">Not named in the public sources we read.</p>}
          </div>
          <div>
            <h4 className="label">How to reach them</h4>
            <ul className="space-y-2">
              {inv.outreach.map((r, i) => {
                const I = ICON[r.type];
                return (
                  <li key={i} className="flex gap-2 text-sm"><I className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <span><b>{ROUTE_LABEL[r.type]}</b> — {r.detail} {r.url && <Ext href={r.url}>open ↗</Ext>}
                      {r.source === "agent" && <span className="ml-1.5 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-dark">found by TinyFish Agent</span>}
                      {r.source === "derived" && <span className="ml-1.5 rounded-full bg-panel2 px-2 py-0.5 text-[10px] font-semibold text-mute">suggested, not published</span>}
                    </span></li>
                );
              })}
            </ul>
          </div>
        </section>
      </div>

      {full && (
        <section className="border-t border-line pt-5">
          <h4 className="label">Score breakdown · {inv.score}/100</h4>
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {BREAKDOWN.map(([k, l, max]) => <Bar key={k} label={l} value={inv.breakdown[k]} max={max} />)}
          </div>
          {inv.thesis && <p className="mt-4 text-sm text-mute"><b className="text-ink">Thesis:</b> {inv.thesis}</p>}
        </section>
      )}
    </div>
  );
}

/** Compact, expandable list row. */
export function InvestorRow({ inv, runId, defaultOpen = false }: { inv: InvestorMatch; runId: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const direct = hasDirect(inv);
  const names = inv.backed.slice(0, 2).map((b) => b.company).join(", ");
  return (
    <article className="card overflow-hidden transition-shadow hover:shadow-md">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left sm:gap-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-panel2 text-sm font-bold text-mute">{inv.rank}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-base font-bold">{inv.name}</span>
            {direct && <span className="rounded-full bg-good/10 px-2 py-0.5 text-[11px] font-semibold text-good">Open door</span>}
            {inv.kind === "angel" && <span className="rounded-full bg-amber/10 px-2 py-0.5 text-[11px] font-semibold text-amber">Angel</span>}
            <span title="How much to trust this match" className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${inv.confidence === "high" ? "bg-good/10 text-good" : inv.confidence === "medium" ? "bg-amber/10 text-amber" : "bg-panel2 text-mute"}`}>{inv.confidence} confidence</span>
            {inv.leadCount > 0 && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-dark">Led {inv.leadCount}</span>}
          </span>
          <span className="mt-0.5 block truncate text-sm text-mute">
            {inv.backed.length} similar deal{inv.backed.length === 1 ? "" : "s"} · {names}{inv.backed.length > 2 ? ` +${inv.backed.length - 2}` : ""}
          </span>
        </span>
        <span className="hidden w-44 shrink-0 text-xs text-mute md:block">
          {inv.roundSizeRange ? `Rounds ${inv.roundSizeRange.minUsd === inv.roundSizeRange.maxUsd ? fmtUsd(inv.roundSizeRange.minUsd) : `${fmtUsd(inv.roundSizeRange.minUsd)}–${fmtUsd(inv.roundSizeRange.maxUsd)}`}` : "Round size n/a"}
          <span className="block">{inv.stages.join(" · ") || "stage n/a"}</span>
        </span>
        <span className="w-20 shrink-0 text-right sm:w-28">
          <span className="text-2xl font-extrabold leading-none">{inv.score}</span><span className="text-xs text-mute">/100</span>
          <span className="mt-1.5 block h-1.5 rounded-full bg-line"><span className={`block h-full rounded-full ${tone(inv.score)}`} style={{ width: `${inv.score}%` }} /></span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-mute transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="animate-rise border-t border-line bg-white p-5">
          <InvestorDetail inv={inv} runId={runId} />
          <div className="mt-4 flex items-center gap-4 text-xs">
            <Link href={`/research/${runId}/investors/${inv.id}`} className="font-medium text-brand">Full evidence & score breakdown →</Link>
            {inv.website && <a className="inline-flex items-center gap-1 text-mute hover:text-brand" href={inv.website} target="_blank" rel="noopener noreferrer">{host(inv.website)} <ExternalLink className="h-3 w-3" /></a>}
          </div>
        </div>
      )}
    </article>
  );
}

/** Full-page version used on the investor detail route. */
export default function InvestorCard({ inv, runId }: { inv: InvestorMatch; runId: string; full?: boolean }) {
  return (
    <article className="card p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">{inv.name}</h1>
          <p className="mt-1 text-sm text-mute">
            Rank #{inv.rank} · {inv.backed.length} similar deal{inv.backed.length === 1 ? "" : "s"}
            {inv.website && <> · <a className="text-brand" href={inv.website} target="_blank" rel="noopener noreferrer">{host(inv.website)} ↗</a></>}
          </p>
        </div>
        <div className="text-right"><span className="text-4xl font-extrabold">{inv.score}</span><span className="text-sm text-mute">/100</span></div>
      </div>
      <InvestorDetail inv={inv} runId={runId} full />
    </article>
  );
}
