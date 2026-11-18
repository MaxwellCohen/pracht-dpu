import { use } from "@pracht/core";
import { sleep } from "./sleep";

export type RequestFlags = {
  noJs: boolean;
  path: string;
  /** Per-request promises so Suspense remounts reuse the same `use()` input. */
  resources: Map<string, Promise<void>>;
};

const defaults: RequestFlags = {
  noJs: false,
  path: "/",
  resources: new Map(),
};

let current: RequestFlags = defaults;

/** Server middleware sets this for the request. */
export function setRequestFlags(
  flags: Omit<RequestFlags, "resources"> & {
    resources?: Map<string, Promise<void>>;
  },
): void {
  current = {
    ...flags,
    resources: flags.resources ?? new Map(),
  };
}

export function clearRequestFlags(): void {
  current = defaults;
}

export function getRequestFlags(): RequestFlags {
  return current;
}

/**
 * Suspend for `ms` once per request under `key`, via Pracht/React-style `use()`.
 * That throw-until-settled path is what drives Suspense streaming.
 * On the client, `use(undefined)` is a no-op — the document already resolved.
 */
export function readSleep(key: string, ms: number): void {
  let ready: Promise<void> | undefined;
  if (typeof window === "undefined") {
    const map = getRequestFlags().resources;
    let promise = map.get(key);
    if (!promise) {
      promise = sleep(ms);
      map.set(key, promise);
    }
    ready = promise;
  }
  use(ready);
}

/**
 * Like `readSleep`, but the server-side promise rejects after `ms`, so the
 * already-flushed fallback is handed to the client (`$s?` → `$s!`).
 */
export function readReject(key: string, ms: number): void {
  let ready: Promise<void> | undefined;
  if (typeof window === "undefined") {
    const map = getRequestFlags().resources;
    let promise = map.get(key);
    if (!promise) {
      promise = sleep(ms).then(() => {
        throw new Error(`edge-case: ${key} gave up on the server`);
      });
      promise.catch(() => {});
      map.set(key, promise);
    }
    ready = promise;
  }
  use(ready);
}

const clientResources = new Map<string, Promise<void>>();

/** Suspend only in the browser (once per page load) for `ms`. */
export function readClientSleep(key: string, ms: number): void {
  if (typeof window === "undefined") return;
  let promise = clientResources.get(key);
  if (!promise) {
    promise = sleep(ms);
    clientResources.set(key, promise);
  }
  use(promise);
}

/** Resolves when `readClientSleep(key)` stops suspending. */
export function clientSleepDone(key: string): Promise<void> {
  return clientResources.get(key) ?? Promise.resolve();
}
