import { Suspense } from "@pracht/core";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { CaseCompare } from "../components/case-compare";
import { ExampleShell } from "../components/example-shell";
import {
  $$,
  clickChanges,
  count,
  HydrationProbe,
  type ProbeResult,
  settled,
} from "../components/hydration-probe";
import {
  clientSleepDone,
  readClientSleep,
  readReject,
  readSleep,
} from "../lib/request-flags";

const isServer = typeof window === "undefined";

function Clicker({ id, label }: { id: string; label: string }) {
  const [n, setN] = useState(0);
  return (
    <button
      id={id}
      type="button"
      class="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
      onClick={() => setN((v) => v + 1)}
    >
      {label} · {n}
    </button>
  );
}

function attr(sel: string, name: string, expected: string | null): ProbeResult {
  const value = document.querySelector(sel)?.getAttribute(name) ?? null;
  return {
    label: `${sel} [${name}] = ${expected ?? "(absent)"}`,
    ok: value === expected,
    detail: `got ${value ?? "(absent)"}`,
  };
}

function precedes(a: string, b: string): ProbeResult {
  const ea = document.querySelector(a);
  const eb = document.querySelector(b);
  const ok =
    !!ea &&
    !!eb &&
    !!(ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING);
  return { label: `${a} comes before ${b}`, ok };
}

/* --- Pending range: fallback attributes must not survive adoption --- */

function AttrFallback() {
  return (
    <div
      id="ec-attr"
      data-state="fallback"
      aria-busy="true"
      data-fallback="attr"
      class="rounded bg-zinc-200 p-3 text-zinc-500"
    >
      Loading…
    </div>
  );
}

function DelayedAttr() {
  readSleep("edge-attr", 2500);
  return (
    <div id="ec-attr" data-state="ready" class="rounded bg-emerald-100 p-3">
      <Clicker id="ec-attr-btn" label="Ready" />
    </div>
  );
}

/* --- Pending range: content must not adopt the next sibling --- */

function DelayedSibInner() {
  readSleep("edge-sib", 2500);
  return <Clicker id="ec-sib-inner" label="Inside boundary" />;
}

/* --- Server gave up synchronously: `$s!` from the first flush --- */

function ServerThrows() {
  if (isServer) throw new Error("edge-case: render error on the server");
  return (
    <div id="ec-sync" data-state="client" class="rounded bg-emerald-100 p-3">
      <Clicker id="ec-sync-btn" label="Client rendered" />
    </div>
  );
}

/* --- Server gave up mid-stream: `$s?` rewritten to `$s!` --- */

function RejectsMidStream() {
  readReject("edge-reject", 1500);
  return (
    <div id="ec-reject" data-state="client" class="rounded bg-emerald-100 p-3">
      <Clicker id="ec-reject-btn" label="Client rendered" />
    </div>
  );
}

/* --- Client renders null where the server streams content --- */

function ServerOnlyContent() {
  readSleep("edge-null", 2000);
  if (!isServer) return null;
  return <p data-ec="server-only">Server-only content (should be dropped)</p>;
}

/* --- Nested pending ranges, both interactive --- */

function DelayedInner() {
  readSleep("edge-nest-inner", 3200);
  return (
    <div id="ec-inner" data-state="ready" class="rounded bg-emerald-200 p-2">
      <Clicker id="ec-inner-btn" label="Inner" />
    </div>
  );
}

function DelayedOuter() {
  readSleep("edge-nest-outer", 1400);
  return (
    <div
      id="ec-outer"
      data-state="ready"
      class="flex flex-col gap-2 rounded bg-emerald-100 p-3"
    >
      <Clicker id="ec-outer-btn" label="Outer" />
      <Suspense
        fallback={
          <div
            id="ec-inner"
            data-state="fallback"
            aria-busy="true"
            class="rounded bg-zinc-200 p-2 text-zinc-500"
          >
            Inner loading…
          </div>
        }
      >
        <DelayedInner />
      </Suspense>
    </div>
  );
}

/* --- Many boundaries landing while the client is suspended --- */

const MANY = 400;
const GATE_KEY = "edge-many-gate";
const GATE_MS = 3500;

function ClientGate({ children }: { children: ComponentChildren }) {
  readClientSleep(GATE_KEY, GATE_MS);
  return <>{children}</>;
}

function ManyCell({ i }: { i: number }) {
  readSleep(`edge-many:${i}`, 500 + ((i * 37) % 2000));
  const [on, setOn] = useState(false);
  return (
    <button
      id={`ec-cell-${i}`}
      type="button"
      data-cell="ready"
      class={`h-3 rounded-sm ${on ? "bg-zinc-900" : "bg-emerald-400"}`}
      aria-label={`cell ${i} ${on ? "on" : "off"}`}
      onClick={() => setOn((v) => !v)}
    >
      <span class="sr-only">{on ? "on" : "off"}</span>
    </button>
  );
}

function ManyGrid({ fill }: { fill?: boolean }) {
  return (
    <div class="grid grid-cols-20 gap-0.5">
      {Array.from({ length: MANY }, (_, i) =>
        fill ? (
          <div key={i} class="h-3 rounded-sm bg-emerald-400" />
        ) : (
          <Suspense
            key={i}
            fallback={
              <span data-cell="fallback" class="h-3 rounded-sm bg-zinc-200" />
            }
          >
            <ManyCell i={i} />
          </Suspense>
        ),
      )}
    </div>
  );
}

let longTaskMs = 0;
if (!isServer && "PerformanceObserver" in window) {
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTaskMs += e.duration;
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // longtask timing unsupported
  }
}

const POPCORN_KERNELS = [
  { id: 0, delayMs: 420 },
  { id: 1, delayMs: 1680 },
  { id: 2, delayMs: 780 },
  { id: 3, delayMs: 2100 },
  { id: 4, delayMs: 1100 },
  { id: 5, delayMs: 540 },
  { id: 6, delayMs: 1900 },
  { id: 7, delayMs: 1320 },
  { id: 8, delayMs: 2260 },
  { id: 9, delayMs: 860 },
  { id: 10, delayMs: 1480 },
  { id: 11, delayMs: 640 },
  { id: 12, delayMs: 1980 },
  { id: 13, delayMs: 980 },
  { id: 14, delayMs: 1200 },
  { id: 15, delayMs: 1540 },
] as const;

function KernelFallback() {
  return <div class="h-10 animate-pulse rounded bg-zinc-200" />;
}

function KernelDone({ id }: { id: number }) {
  return (
    <div class="flex h-10 items-center justify-center rounded bg-emerald-200 text-xs font-bold text-emerald-950">
      {id}
    </div>
  );
}

function DelayedKernel({ id, delayMs }: { id: number; delayMs: number }) {
  readSleep(`edge-kernel:${id}`, delayMs);
  return <KernelDone id={id} />;
}

function DelayedHtml() {
  readSleep("edge-html", 600);
  return <p>Done — declarative DPU worked</p>;
}

function DelayedCircle() {
  readSleep("edge-svg", 800);
  return (
    <circle
      cx="80"
      cy="55"
      r="24"
      fill="tomato"
      stroke="white"
      stroke-width="2"
    />
  );
}

function DelayedMath() {
  readSleep("edge-math", 800);
  return (
    <>
      <mi>x</mi>
      <mo>+</mo>
      <mn>1</mn>
    </>
  );
}

function DelayedStyled() {
  readSleep("edge-style", 900);
  return (
    <>
      <style data-precedence="demo-stream">
        {`.dpu-edge-style { color: tomato; font-weight: 700; }`}
      </style>
      <p class="dpu-edge-style">Styled hello</p>
    </>
  );
}

function SvgStage({ children }: { children: ComponentChildren }) {
  return (
    <div class="relative h-[100px] w-[160px] overflow-hidden rounded-lg border-2 border-dashed border-zinc-300 text-zinc-700">
      <svg
        width="160"
        height="100"
        viewBox="0 0 160 100"
        class="block h-full w-full"
      >
        {children}
      </svg>
    </div>
  );
}

export function head() {
  return { title: "Edge cases · Suspense streaming" };
}

export function Component() {
  return (
    <ExampleShell
      title="Edge cases"
      description="Popcorning, HTML, SVG, MathML, and style completions through DPU, and hydration of ranges that are still pending. Left column is the live stream; right column is the settled target."
    >
      <CaseCompare
        title="Popcorning"
        why="Sixteen sibling boundaries with staggered delays. Completions should arrive independently — kernels pop in out of source order, not as one swap."
        expected="All 16 cells filled, labeled 0–15. They appear one-by-one as each delay resolves."
        badge="warn"
        badgeLabel="Out of order"
        streamed={
          <div class="grid grid-cols-4 gap-1.5">
            {POPCORN_KERNELS.map((kernel) => (
              <Suspense key={kernel.id} fallback={<KernelFallback />}>
                <DelayedKernel id={kernel.id} delayMs={kernel.delayMs} />
              </Suspense>
            ))}
          </div>
        }
        result={
          <div class="grid grid-cols-4 gap-1.5">
            {POPCORN_KERNELS.map((kernel) => (
              <KernelDone key={kernel.id} id={kernel.id} />
            ))}
          </div>
        }
      />

      <CaseCompare
        title="HTML — baseline"
        why="A pending HTML shell, then a completion that swaps fallback for template content. This is the baseline that should succeed."
        expected='Fallback removed. Visible text is “Done — declarative DPU worked”.'
        badge="ok"
        badgeLabel="Should work"
        streamed={
          <Suspense fallback={<p>Loading…</p>}>
            <DelayedHtml />
          </Suspense>
        }
        result={<p>Done — declarative DPU worked</p>}
      />

      <CaseCompare
        title="SVG — namespace"
        why="The boundary sits inside <svg>. <template for> content is HTML-namespaced, so preact-render-to-string re-parses revealed nodes inside <svg> to give the <circle> the SVG namespace."
        expected="A tomato circle paints in the dashed frame (real SVG circle, svg namespace)."
        badge="ok"
        badgeLabel="Should work"
        streamed={
          <SvgStage>
            <Suspense
              fallback={
                <text x="8" y="20" font-size="12">
                  Loading…
                </text>
              }
            >
              <DelayedCircle />
            </Suspense>
          </SvgStage>
        }
        result={
          <SvgStage>
            <circle
              cx="80"
              cy="55"
              r="24"
              fill="tomato"
              stroke="white"
              stroke-width="2"
            />
          </SvgStage>
        }
      />

      <CaseCompare
        title="MathML — namespace"
        why="Same namespace issue inside <math>: revealed <mi>/<mo>/<mn> are re-parsed so they keep the MathML namespace."
        expected="The formula renders as x + 1 using MathML, not as unmatched HTML text."
        badge="ok"
        badgeLabel="Should work"
        streamed={
          <math display="block">
            <Suspense fallback={<mtext>Loading…</mtext>}>
              <DelayedMath />
            </Suspense>
          </math>
        }
        result={
          <math display="block">
            <mi>x</mi>
            <mo>+</mo>
            <mn>1</mn>
          </math>
        }
      />

      <CaseCompare
        title="Styles — hoist"
        why="Declarative completion only moves nodes. It does not run completeBoundaryWithStyles, so <style> may stay inline instead of hoisting to <head>."
        expected="“Styled hello” is tomato and bold. Ideally the <style> is in <head>, not left in the boundary."
        badge="warn"
        badgeLabel="May fail"
        streamed={
          <Suspense fallback={<p>Loading…</p>}>
            <DelayedStyled />
          </Suspense>
        }
        result={<p class="font-bold text-[tomato]">Styled hello</p>}
      />

      <h2 class="mt-6 text-xl font-bold tracking-tight">
        Hydrating a pending range{" "}
        <span class="text-sm font-normal text-zinc-500">
          preact#5360 · preact-render-to-string#496
        </span>
      </h2>
      <p class="text-sm text-zinc-600">
        The client hydrates before these boundaries finish streaming, so it
        meets a fallback (<code>$s?</code>) or an abandoned range (
        <code>$s!</code>). Each case runs a probe after the stream ends: no
        duplicated ids, no fallback attributes left behind, handlers alive.
      </p>

      <CaseCompare
        title="Pending range — fallback attributes"
        why="Fallback and content share a tag and id but differ in data-state, aria-busy and data-fallback. Hydration used to adopt the fallback element and keep its attributes."
        expected="One #ec-attr with data-state=ready, no aria-busy/data-fallback, button counts clicks."
        badge="warn"
        badgeLabel="preact#5360"
        streamed={
          <Suspense fallback={<AttrFallback />}>
            <DelayedAttr />
          </Suspense>
        }
        result={
          <div class="rounded bg-emerald-100 p-3">
            <Clicker id="ec-attr-result" label="Ready" />
          </div>
        }
        probe={
          <HydrationProbe
            atHydration={() => [
              count("#ec-attr", 1),
              attr("#ec-attr", "data-state", "ready"),
              attr("#ec-attr", "data-fallback", null),
            ]}
            run={async () => {
              await settled();
              return [
                count("#ec-attr", 1),
                attr("#ec-attr", "data-state", "ready"),
                attr("#ec-attr", "aria-busy", null),
                attr("#ec-attr", "data-fallback", null),
                count("#ec-attr-btn", 1),
                await clickChanges("#ec-attr-btn"),
              ];
            }}
          />
        }
      />

      <CaseCompare
        title="Pending range — next sibling"
        why="The fallback is a <span>, the content a <button>, and a <button> sibling follows the boundary. Hydration used to walk past the range and adopt the sibling."
        expected="Both buttons exist once, in source order, and each counts its own clicks."
        badge="warn"
        badgeLabel="preact#5360"
        streamed={
          <div class="flex flex-wrap items-center gap-2">
            <Suspense fallback={<span class="text-zinc-500">Loading…</span>}>
              <DelayedSibInner />
            </Suspense>
            <Clicker id="ec-sib-after" label="Sibling after" />
          </div>
        }
        result={
          <div class="flex flex-wrap gap-2">
            <Clicker id="ec-sib-inner-result" label="Inside boundary" />
            <Clicker id="ec-sib-after-result" label="Sibling after" />
          </div>
        }
        probe={
          <HydrationProbe
            atHydration={() => [
              count("#ec-sib-inner", 1),
              count("#ec-sib-after", 1),
            ]}
            run={async () => {
              await settled();
              return [
                count("#ec-sib-inner", 1),
                count("#ec-sib-after", 1),
                precedes("#ec-sib-inner", "#ec-sib-after"),
                await clickChanges("#ec-sib-inner"),
                await clickChanges("#ec-sib-after"),
              ];
            }}
          />
        }
      />

      <CaseCompare
        title="Server gave up — render error ($s!)"
        why="The child throws while rendering on the server, so the first flush already marks the range $s! with the fallback in it. The client renders the real content there."
        expected="Fallback replaced by the client content; one #ec-sync with data-state=client; button works."
        badge="warn"
        badgeLabel="$s!"
        streamed={
          <Suspense
            fallback={
              <div
                id="ec-sync"
                data-state="fallback"
                aria-busy="true"
                class="rounded bg-zinc-200 p-3 text-zinc-500"
              >
                Server gave up…
              </div>
            }
          >
            <ServerThrows />
          </Suspense>
        }
        result={
          <div class="rounded bg-emerald-100 p-3">
            <Clicker id="ec-sync-result" label="Client rendered" />
          </div>
        }
        probe={
          <HydrationProbe
            run={async () => {
              await settled();
              return [
                count("#ec-sync", 1),
                attr("#ec-sync", "data-state", "client"),
                attr("#ec-sync", "aria-busy", null),
                await clickChanges("#ec-sync-btn"),
              ];
            }}
          />
        }
      />

      <CaseCompare
        title="Server gave up — rejected mid-stream"
        why="The server suspends, flushes $s? with the fallback, then the promise rejects and a script rewrites the marker to $s!. No late chunk ever arrives."
        expected="Client content replaces the fallback; one #ec-reject with data-state=client; button works."
        badge="warn"
        badgeLabel="$s? → $s!"
        streamed={
          <Suspense
            fallback={
              <div
                id="ec-reject"
                data-state="fallback"
                aria-busy="true"
                class="rounded bg-zinc-200 p-3 text-zinc-500"
              >
                Loading (will fail on server)…
              </div>
            }
          >
            <RejectsMidStream />
          </Suspense>
        }
        result={
          <div class="rounded bg-emerald-100 p-3">
            <Clicker id="ec-reject-result" label="Client rendered" />
          </div>
        }
        probe={
          <HydrationProbe
            run={async () => {
              await settled();
              return [
                count("#ec-reject", 1),
                attr("#ec-reject", "data-state", "client"),
                attr("#ec-reject", "aria-busy", null),
                await clickChanges("#ec-reject-btn"),
              ];
            }}
          />
        }
      />

      <CaseCompare
        title="Client renders null"
        why="The server streams content into the boundary, but the client's content is null. The late chunk must be dropped, not inserted without handlers."
        expected="Nothing visible: neither the fallback nor the server-only paragraph remains."
        badge="warn"
        badgeLabel="rts#496"
        streamed={
          <Suspense
            fallback={
              <p data-ec="null-fallback" class="text-zinc-500">
                Loading…
              </p>
            }
          >
            <ServerOnlyContent />
          </Suspense>
        }
        result={<p class="text-sm text-zinc-400 italic">(empty)</p>}
        probe={
          <HydrationProbe
            run={async () => {
              await settled();
              return [
                count('[data-ec="server-only"]', 0),
                count('[data-ec="null-fallback"]', 0),
              ];
            }}
          />
        }
      />

      <CaseCompare
        title="Nested pending ranges"
        why="An inner boundary whose fallback shares id with its content sits inside an outer pending boundary. Each child may only adopt from its own range."
        expected="One #ec-outer and one #ec-inner, both data-state=ready; both buttons work."
        badge="warn"
        badgeLabel="preact#5360"
        streamed={
          <Suspense
            fallback={
              <div
                id="ec-outer"
                data-state="fallback"
                aria-busy="true"
                class="rounded bg-zinc-200 p-3 text-zinc-500"
              >
                Outer loading…
              </div>
            }
          >
            <DelayedOuter />
          </Suspense>
        }
        result={
          <div class="flex flex-col gap-2 rounded bg-emerald-100 p-3">
            <Clicker id="ec-outer-result" label="Outer" />
            <div class="rounded bg-emerald-200 p-2">
              <Clicker id="ec-inner-result" label="Inner" />
            </div>
          </div>
        }
        probe={
          <HydrationProbe
            run={async () => {
              await settled();
              return [
                count("#ec-outer", 1),
                count("#ec-inner", 1),
                attr("#ec-outer", "data-state", "ready"),
                attr("#ec-inner", "data-state", "ready"),
                attr("#ec-inner", "aria-busy", null),
                await clickChanges("#ec-outer-btn"),
                await clickChanges("#ec-inner-btn"),
              ];
            }}
          />
        }
      />

      <CaseCompare
        title={`${MANY} boundaries, client suspended`}
        why={`The client suspends for ${GATE_MS / 1000}s while hydrating, so all ${MANY} late chunks land in server-owned ranges and the init script patches them. It used to walk the client vnode tree per chunk (quadratic); now it checks the <?start> marker.`}
        expected={`All ${MANY} cells green, no fallback cells, cells toggle on click once the client wakes up. Long-task time stays low.`}
        badge="warn"
        badgeLabel="rts#496"
        streamed={
          <Suspense fallback={<p class="text-zinc-500">Client waking up…</p>}>
            <ClientGate>
              <ManyGrid />
            </ClientGate>
          </Suspense>
        }
        result={<ManyGrid fill />}
        probe={
          <HydrationProbe
            run={async () => {
              const t0 = performance.now();
              await clientSleepDone(GATE_KEY);
              await settled(() => $$('[data-cell="ready"]').length === MANY);
              const ids = $$('[data-cell="ready"]').map((e) => e.id);
              return [
                count('[data-cell="ready"]', MANY),
                count('[data-cell="fallback"]', 0),
                {
                  label: "no duplicated cell ids",
                  ok: new Set(ids).size === ids.length,
                  detail: `${ids.length} ids, ${new Set(ids).size} unique`,
                },
                await clickChanges("#ec-cell-0", "first cell handler alive"),
                await clickChanges(
                  `#ec-cell-${MANY - 1}`,
                  "last cell handler alive",
                ),
                {
                  label: "long-task time during load (info)",
                  ok: true,
                  detail: `${Math.round(longTaskMs)} ms total; settled ${Math.round(performance.now() - t0)} ms after probe start`,
                },
              ];
            }}
          />
        }
      />
    </ExampleShell>
  );
}
