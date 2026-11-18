import { Suspense } from "@pracht/core";
import { readSleep } from "../lib/request-flags";
import { CounterButton } from "./streamed-counter";

function StreamProbeFallback() {
  return (
    <div class="animate-pulse rounded-md border border-dashed border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
      Streaming… waiting for the Suspense boundary to resolve. A{" "}
      <code class="text-xs">&lt;template for&gt;</code> chunk (Declarative
      Partial Updates) replaces this when it arrives.
    </div>
  );
}

function StreamProbeResult() {
  readSleep("stream-probe", 10);
  return (
    <div class="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-950">
      <span class="font-bold">Stream resolved</span> — later HTML chunk replaced
      the loading fallback.
      <div>
        <CounterButton />
      </div>
    </div>
  );
}

/** Live probe: shell fallback first, then streamed resolved UI. */
export function DpuSupportBanner() {
  return (
    <Suspense fallback={<StreamProbeFallback />}>
      <StreamProbeResult />
    </Suspense>
  );
}
