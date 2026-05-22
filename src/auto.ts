/* aio-libs-local stub */

import type * as RealFiles from "@adobe/aio-lib-files";
import type * as RealState from "@adobe/aio-lib-state";

let forceMode: "local" | "runtime" | null = null;

export function forceLocal(): void {
  forceMode = "local";
}

export function forceRuntime(): void {
  forceMode = "runtime";
}

export function resetForce(): void {
  forceMode = null;
}

function inRuntime(): boolean {
  if (forceMode === "local") return false;
  if (forceMode === "runtime") return true;
  return !!process.env.__OW_API_KEY;
}

/**
 * Runtime-switching entry point. Suitable for plain Node environments
 * (scripts, tests without a bundler, REPLs).
 *
 * WARNING: For bundled apps (webpack, Vite, esbuild), prefer build-time
 * aliasing — see README "Bundler integration".
 */
function loadFiles(): typeof RealFiles {
  return inRuntime() ? require("@adobe/aio-lib-files") : require("./files");
}

function loadState(): typeof RealState {
  return inRuntime() ? require("@adobe/aio-lib-state") : require("./state");
}

/** Lazy proxy so forceLocal/forceRuntime apply on each access */
export const Files = new Proxy({} as typeof RealFiles, {
  get(_target, prop) {
    return loadFiles()[prop as keyof typeof RealFiles];
  },
});

export const State = new Proxy({} as typeof RealState, {
  get(_target, prop) {
    return loadState()[prop as keyof typeof RealState];
  },
});

module.exports = { Files, State, forceLocal, forceRuntime, resetForce };
