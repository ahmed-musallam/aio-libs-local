/* aio-libs-local stub */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { AioLibError, ERROR_BAD_REQUEST, ERROR_PAYLOAD_TOO_LARGE, throwError } from "./errors";

export const MAX_TTL = 2592000; // 30 days per local stub spec
const DEFAULT_TTL = 86400;
const MAX_VALUE_BYTES = 1024 * 1024; // 1MB
const KEY_REGEX = /^[a-zA-Z0-9_\-.]{1,1024}$/;
const MATCH_REGEX = /^[a-zA-Z0-9_\-.]{1,1024}$|^[a-zA-Z0-9_\-.]{0,1023}\*$/;

export interface InitOptions {
  /** Persist state to a directory on disk. If omitted, state is in-memory. */
  persist?: string;
  /** Namespace prefix for keys (for parity testing). Optional. */
  namespace?: string;
}

export interface PutOptions {
  /** TTL in seconds. Default 86400 (24h). Max 2592000 (30d). -1 = no expiry. */
  ttl?: number;
}

export interface StateValue {
  value: any;
  expiration?: string;
}

export interface State {
  get(key: string): Promise<StateValue | undefined>;
  put(key: string, value: any, options?: PutOptions): Promise<string>;
  delete(key: string): Promise<string | null>;
  deleteAll(options: { match: string }): Promise<{ keys: number }>;
  any(options?: { match?: string }): Promise<boolean>;
  stats(options?: {
    match?: string;
  }): Promise<{ keys: number; bytesKeys: number; bytesValues: number }>;
  list(options?: { match?: string; countHint?: number }): AsyncGenerator<{ keys: string[] }>;
}

type Entry = { value: any; expiresAt: number | null };

const stores = new Map<string, Map<string, Entry>>();

function storeKey(options: InitOptions): string {
  return options.persist ?? options.namespace ?? "__memory__";
}

function getStore(options: InitOptions): Map<string, Entry> {
  const key = storeKey(options);
  if (!stores.has(key)) stores.set(key, new Map());
  return stores.get(key)!;
}

function namespacedKey(key: string, options: InitOptions): string {
  return options.namespace ? `${options.namespace}:${key}` : key;
}

function validateKey(key: string): void {
  if (!KEY_REGEX.test(key)) {
    throwError(ERROR_BAD_REQUEST, `invalid key: ${key}`, { key });
  }
}

function validateMatch(match: string): void {
  if (!MATCH_REGEX.test(match)) {
    throwError(ERROR_BAD_REQUEST, `invalid match pattern: ${match}`, { match });
  }
}

function validateTtl(ttl: number): void {
  if (ttl === -1) return;
  if (ttl < 0) {
    throwError(ERROR_BAD_REQUEST, "ttl must be -1 (no expiry) or a non-negative number", { ttl });
  }
  if (ttl > MAX_TTL) {
    throwError(ERROR_BAD_REQUEST, `ttl must be <= ${MAX_TTL} seconds (30 days)`, { ttl });
  }
}

function validateValue(value: any): void {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > MAX_VALUE_BYTES) {
    throw new AioLibError(ERROR_PAYLOAD_TOO_LARGE, "key, value or request payload is too large", {
      bytes,
      max: MAX_VALUE_BYTES,
    });
  }
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesPattern(key: string, pattern?: string): boolean {
  if (!pattern) return true;
  validateMatch(pattern);
  return globToRegExp(pattern).test(key);
}

function isExpired(entry: Entry): boolean {
  return entry.expiresAt !== null && entry.expiresAt < Date.now();
}

function entryToStateValue(entry: Entry): StateValue {
  return {
    value: entry.value,
    expiration: entry.expiresAt === null ? undefined : new Date(entry.expiresAt).toISOString(),
  };
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

async function loadFromDisk(persistDir: string, store: Map<string, Entry>): Promise<void> {
  const filePath = path.join(persistDir, "state.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw) as Record<string, Entry>;
    store.clear();
    for (const [k, v] of Object.entries(data)) {
      store.set(k, v);
    }
  } catch (e: any) {
    if (e?.code !== "ENOENT") throw e;
  }
}

async function saveToDisk(persistDir: string, store: Map<string, Entry>): Promise<void> {
  await fs.mkdir(persistDir, { recursive: true });
  const filePath = path.join(persistDir, "state.json");
  const obj: Record<string, Entry> = {};
  for (const [k, v] of store.entries()) {
    obj[k] = v;
  }
  await fs.writeFile(filePath, JSON.stringify(obj), "utf8");
}

export async function init(initOptions: InitOptions = {}): Promise<State> {
  const store = getStore(initOptions);

  if (initOptions.persist) {
    await loadFromDisk(initOptions.persist, store);
  }

  const persist = initOptions.persist
    ? debounce(() => {
        void saveToDisk(initOptions.persist!, store);
      }, 100)
    : () => {};

  const resolveKey = (key: string) => namespacedKey(key, initOptions);
  const toLogicalKey = (storedKey: string) =>
    initOptions.namespace ? storedKey.slice(initOptions.namespace.length + 1) : storedKey;

  return {
    async get(key) {
      validateKey(key);
      const nk = resolveKey(key);
      const entry = store.get(nk);
      if (!entry) return undefined;
      if (isExpired(entry)) {
        store.delete(nk);
        persist();
        return undefined;
      }
      return entryToStateValue(entry);
    },

    async put(key, value, opts = {}) {
      validateKey(key);
      validateValue(value);
      let ttl = opts.ttl ?? DEFAULT_TTL;
      if (ttl === 0) ttl = DEFAULT_TTL;
      validateTtl(ttl);
      const expiresAt = ttl === -1 ? null : Date.now() + ttl * 1000;
      const nk = resolveKey(key);
      store.set(nk, { value, expiresAt });
      persist();
      return key;
    },

    async delete(key) {
      validateKey(key);
      const nk = resolveKey(key);
      if (!store.has(nk)) return null;
      store.delete(nk);
      persist();
      return key;
    },

    async deleteAll(options) {
      if (!options?.match) {
        throwError(ERROR_BAD_REQUEST, "deleteAll requires { match } option", { options });
      }
      validateMatch(options.match);
      let count = 0;
      for (const [k, entry] of Array.from(store.entries())) {
        const logicalKey = toLogicalKey(k);
        if (matchesPattern(logicalKey, options.match) && !isExpired(entry)) {
          store.delete(k);
          count++;
        }
      }
      persist();
      return { keys: count };
    },

    async any(options = {}) {
      for (const [k, entry] of store.entries()) {
        const logicalKey = toLogicalKey(k);
        if (matchesPattern(logicalKey, options.match) && !isExpired(entry)) {
          return true;
        }
      }
      return false;
    },

    async stats(options = {}) {
      let keys = 0;
      let bytesKeys = 0;
      let bytesValues = 0;
      for (const [k, entry] of store.entries()) {
        const logicalKey = toLogicalKey(k);
        if (!matchesPattern(logicalKey, options.match) || isExpired(entry)) continue;
        keys++;
        bytesKeys += Buffer.byteLength(logicalKey, "utf8");
        const serialized =
          typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value);
        bytesValues += Buffer.byteLength(serialized, "utf8");
      }
      return { keys, bytesKeys, bytesValues };
    },

    list(options = {}) {
      return (async function* () {
        const keys: string[] = [];
        for (const [k, entry] of store.entries()) {
          const logicalKey = toLogicalKey(k);
          if (matchesPattern(logicalKey, options.match) && !isExpired(entry)) {
            keys.push(logicalKey);
          }
        }
        yield { keys };
      })();
    },
  };
}

// CommonJS export shape matching @adobe/aio-lib-state
module.exports = { init, MAX_TTL };
