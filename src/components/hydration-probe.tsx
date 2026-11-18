import { useEffect, useState } from "preact/hooks";

export type ProbeResult = { label: string; ok: boolean; detail?: string };
export type ProbeRun = () => Promise<ProbeResult[]>;

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolves once the stream has ended (every late chunk script ran) and
 * `extra()` holds. A range the client took over keeps its `$s?` marker, so
 * the marker itself is not a settle signal.
 */
export async function settled(
  extra: () => boolean = () => true,
  timeoutMs = 15000,
) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (
      document.readyState === "complete" &&
      !document.querySelector("template[for]") &&
      extra()
    ) {
      await tick(150);
      return true;
    }
    await tick(50);
  }
  return false;
}

export const $$ = (sel: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(sel));

export function count(
  sel: string,
  expected: number,
  label = `${expected}× ${sel}`,
): ProbeResult {
  const n = $$(sel).length;
  return { label, ok: n === expected, detail: `found ${n}` };
}

/** Clicks `sel` and checks its text changes — catches dead handlers. */
export async function clickChanges(
  sel: string,
  label = `${sel} handler alive`,
): Promise<ProbeResult> {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) return { label, ok: false, detail: "element missing" };
  const before = el.textContent;
  el.click();
  await tick();
  const after = document.querySelector<HTMLElement>(sel)?.textContent;
  return { label, ok: before !== after, detail: `“${before}” → “${after}”` };
}

export function HydrationProbe({
  run,
  atHydration,
}: {
  run: ProbeRun;
  /** Checked synchronously in the hydration effect, before late chunks land. */
  atHydration?: () => ProbeResult[];
}) {
  const [results, setResults] = useState<ProbeResult[] | null>(null);

  useEffect(() => {
    let live = true;
    const hydratedAt = performance.now();
    const streaming = document.readyState === "loading";
    const early = (atHydration?.() ?? []).map((r) => ({
      ...r,
      label: `at hydration: ${r.label}`,
    }));
    run().then(
      (r) => {
        r.unshift(...early);
        const nav = performance.getEntriesByType("navigation")[0] as
          | PerformanceNavigationTiming
          | undefined;
        const end = nav ? Math.round(nav.domInteractive) : "?";
        r.unshift({
          label: "hydrated while the stream was open",
          ok: streaming,
          detail: `hydrated at ${Math.round(hydratedAt)} ms, stream ended at ${end} ms`,
        });
        if (live) setResults(r);
      },
      (e) =>
        live &&
        setResults([{ label: "probe threw", ok: false, detail: String(e) }]),
    );
    return () => {
      live = false;
    };
  }, []);

  const pass = results?.every((r) => r.ok);
  return (
    <div class="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
      <p class="font-semibold">
        Hydration probe:{" "}
        {results == null ? (
          <span class="text-zinc-500">running… (needs JS)</span>
        ) : pass ? (
          <span class="text-emerald-700">PASS</span>
        ) : (
          <span class="text-red-700">FAIL</span>
        )}
      </p>
      {results && (
        <ul class="mt-1 space-y-0.5 font-mono text-xs">
          {results.map((r) => (
            <li
              key={r.label}
              class={r.ok ? "text-emerald-800" : "text-red-700"}
            >
              {r.ok ? "✓" : "✗"} {r.label}
              {r.detail ? (
                <span class="text-zinc-500"> — {r.detail}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
