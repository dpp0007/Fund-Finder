import { getRun } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/** Server-Sent Events: emits the run whenever it changes, then closes when finished. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!getRun(params.id)) return new Response("Not found", { status: 404 });
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stream = new ReadableStream({
    start(ctrl) {
      let last = "";
      const stop = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try { ctrl.close(); } catch { /* already closed */ }
      };
      const tick = () => {
        if (closed) return;
        const run = getRun(params.id);
        if (!run) return stop();
        try {
          if (run.updatedAt !== last) {
            last = run.updatedAt;
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify(run)}\n\n`));
          } else ctrl.enqueue(enc.encode(`: ping\n\n`));
        } catch { return stop(); } // client went away
        if (run.status === "completed" || run.status === "failed") stop();
      };
      tick();
      if (!closed) timer = setInterval(tick, 1500);
      req.signal.addEventListener("abort", stop);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
