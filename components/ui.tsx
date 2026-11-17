import type { ReactNode } from "react";
import type { RouteType } from "@/types";

export function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r;
  const color = score >= 70 ? "#4f46e5" : score >= 45 ? "#d97706" : "#dc2626";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e6e1d6" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-lg font-bold">{score}</span>
    </div>
  );
}

export const ROUTE_LABEL: Record<RouteType, string> = {
  application_form: "Application form",
  open_intake: "Open intake",
  email: "Email",
  warm_intro: "Warm intro",
  unknown: "Unknown",
};

export function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-mute"><span>{label}</span><span>{value}/{max}</span></div>
      <div className="h-1.5 rounded-full bg-line"><div className="h-full rounded-full bg-brand" style={{ width: `${(value / max) * 100}%` }} /></div>
    </div>
  );
}

export const BREAKDOWN: Array<[keyof import("@/types").InvestorMatch["breakdown"], string, number]> = [
  ["similarDeals", "Similar deals", 40],
  ["stageFit", "Stage fit", 20],
  ["geoFit", "Geography", 15],
  ["recency", "Recency", 10],
  ["chequeFit", "Round-size fit", 10],
  ["reachability", "Reachability", 5],
];

export function Ext({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand">{children}</a>;
}

export const host = (u?: string) => { try { return new URL(u!).hostname.replace(/^www\./, ""); } catch { return u ?? ""; } };
