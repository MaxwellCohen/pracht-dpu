/**
 * pracht 0.20 loads the client entry as a plain `type="module"` script, which
 * waits for the whole document — i.e. the end of the stream. Import the same
 * entry (deduped by the module map) as soon as `#pracht-state` is parsed so
 * hydration meets boundaries that are still pending. `?late-hydrate` opts out.
 */
const EARLY_HYDRATE = `(function f(){if(/[?&]late-hydrate/.test(location.search))return;var s=document.getElementById("pracht-state"),l=document.querySelector('link[rel="modulepreload"]');if(!s||!l)return setTimeout(f,5);import(l.href)})()`;

export function EarlyHydrate() {
  return <script dangerouslySetInnerHTML={{ __html: EARLY_HYDRATE }} />;
}
