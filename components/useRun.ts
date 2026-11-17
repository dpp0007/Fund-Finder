"use client";
import { useEffect, useState } from "react";
import type { ResearchRun } from "@/types";

/** Live run state via SSE; falls back to polling if the stream drops. */
export function useRun(id: string) {
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let closed = false;
    let es: EventSource | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;

    const pull = async () => {
      const r = await fetch(`/api/research/${id}`, { cache: "no-store" });
      if (r.status === 404) return setError("This research run does not exist (it may have been cleared).");
      const j = (await r.json()) as ResearchRun;
      if (!closed) setRun(j);
      if (j.status === "completed" || j.status === "failed") clearInterval(poll);
    };
    pull().catch(() => setError("Could not load run"));

    es = new EventSource(`/api/research/${id}/events`);
    es.onmessage = (e) => {
      const j = JSON.parse(e.data) as ResearchRun;
      setRun(j);
      if (j.status === "completed" || j.status === "failed") es?.close();
    };
    es.onerror = () => {
      es?.close();
      if (!poll && !closed) poll = setInterval(() => pull().catch(() => {}), 3000);
    };
    return () => { closed = true; es?.close(); clearInterval(poll); };
  }, [id]);

  return { run, error };
}
