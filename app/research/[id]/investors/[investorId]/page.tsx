"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRun } from "@/components/useRun";
import InvestorCard from "@/components/InvestorCard";

export default function InvestorPage({ params }: { params: { id: string; investorId: string } }) {
  const { run, error } = useRun(params.id);
  const inv = run?.investors.find((i) => i.id === params.investorId);
  return (
    <main className="mx-auto max-w-4xl px-5 pb-16">
      <Link href={`/research/${params.id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm text-mute hover:text-brand"><ArrowLeft className="h-4 w-4" /> All investors</Link>
      {error && <p className="text-coral">{error}</p>}
      {!run && !error && <p className="text-mute">Loading…</p>}
      {run && !inv && <p className="text-mute">Investor not found in this run.</p>}
      {inv && <InvestorCard inv={inv} runId={params.id} full />}
    </main>
  );
}
