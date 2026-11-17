"use client";
import type { Deal } from "@/types";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/** Animated radar: each discovered company is a blip; verified ones glow green when verified. */
export default function Radar({ deals, active = true, size = 340 }: { deals: Deal[]; active?: boolean; size?: number }) {
  return (
    <div className="relative mx-auto aspect-square w-full" style={{ maxWidth: size }}>
      <div className="radar-grid absolute inset-0 rounded-full border border-brand/30 bg-brand/[0.03]" />
      <div className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(to right, transparent 49.8%, rgba(79,70,229,.12) 50%, transparent 50.2%), linear-gradient(transparent 49.8%, rgba(79,70,229,.12) 50%, transparent 50.2%)" }} />
      {active && (
        <div className="absolute inset-0 animate-sweep rounded-full" style={{ background: "conic-gradient(from 0deg, rgba(79,70,229,0) 0deg, rgba(79,70,229,0) 270deg, rgba(79,70,229,.35) 360deg)" }} />
      )}
      {deals.slice(0, 60).map((d) => {
        const a = hash(d.id + "a") * Math.PI * 2;
        const r = 0.18 + hash(d.id + "r") * 0.75;
        const x = 50 + Math.cos(a) * r * 50, y = 50 + Math.sin(a) * r * 50;
        const color = d.verified ? "#047857" : "#d97706";
        return (
          <span key={d.id} title={d.company} className="absolute -translate-x-1/2 -translate-y-1/2 animate-rise" style={{ left: `${x}%`, top: `${y}%` }}>
            <span className="block h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
            {active && <span className="absolute inset-0 animate-blip rounded-full border" style={{ borderColor: color }} />}
          </span>
        );
      })}
      <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_14px_#4f46e5]" title="You" />
    </div>
  );
}
