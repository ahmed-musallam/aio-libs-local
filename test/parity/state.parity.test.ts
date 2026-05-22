import { describe, it, expect } from "vitest";

type StateLike = {
  put: (k: string, v: string, o?: { ttl?: number }) => Promise<string>;
  get: (k: string) => Promise<{ value: string; expiration?: string } | undefined>;
  delete: (k: string) => Promise<string | null>;
};

async function stubInit(): Promise<StateLike> {
  const { init } = await import("../../dist/state.js");
  return init({ namespace: `parity-${Date.now()}` });
}

describe("state contract (local stub only)", () => {
  let state: StateLike;
  const key = `parity-key-${Date.now()}`;

  it("put returns key", async () => {
    state = await stubInit();
    expect(await state.put(key, "parity-value", { ttl: 120 })).toBe(key);
  });

  it("get returns object shape with value", async () => {
    const result = await state.get(key);
    expect(result).toBeDefined();
    expect(result!.value).toBe("parity-value");
    expect(result).toHaveProperty("expiration");
  });

  it("delete returns key or null", async () => {
    const del = await state.delete(key);
    expect(del === key || del === null).toBe(true);
  });
});
