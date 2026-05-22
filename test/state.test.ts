import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ERROR_BAD_REQUEST, ERROR_PAYLOAD_TOO_LARGE } from "../src/errors";
import { init, MAX_TTL } from "../dist/state.js";

const require = createRequire(import.meta.url);
const stateMod = require("../dist/state.js");

describe("state stub", () => {
  it("exports init and MAX_TTL like real lib", () => {
    expect(Object.keys(stateMod).sort()).toEqual(["MAX_TTL", "init"].sort());
    expect(stateMod.MAX_TTL).toBe(MAX_TTL);
  });

  it("get returns { value, expiration } not raw value", async () => {
    const state = await init({ namespace: `get-shape-${Date.now()}` });
    await state.put("mykey", "hello", { ttl: 3600 });
    const result = await state.get("mykey");
    expect(result).toEqual(expect.objectContaining({ value: "hello" }));
    expect(result?.expiration).toBeDefined();
    expect(typeof result?.expiration).toBe("string");
  });

  it("TTL 0 defaults to 24h", async () => {
    const state = await init({ namespace: `ttl0-${Date.now()}` });
    await state.put("ttl0", "v", { ttl: 0 });
    const r = await state.get("ttl0");
    expect(r?.expiration).toBeDefined();
    const exp = new Date(r!.expiration!).getTime();
    expect(exp).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
  });

  it("TTL -1 means no expiry", async () => {
    const state = await init({ namespace: `forever-${Date.now()}` });
    await state.put("forever", "v", { ttl: -1 });
    const r = await state.get("forever");
    expect(r?.expiration).toBeUndefined();
  });

  it("TTL > 30d rejects", async () => {
    const state = await init({ namespace: `ttl-max-${Date.now()}` });
    await expect(state.put("x", "v", { ttl: MAX_TTL + 1 })).rejects.toMatchObject({
      code: ERROR_BAD_REQUEST,
    });
  });

  it("negative TTL other than -1 rejects", async () => {
    const state = await init({ namespace: `ttl-neg-${Date.now()}` });
    await expect(state.put("x", "v", { ttl: -2 })).rejects.toMatchObject({
      code: ERROR_BAD_REQUEST,
    });
  });

  it("value at exactly 1MB accepted", async () => {
    const state = await init({ namespace: `mb-ok-${Date.now()}` });
    const value = "x".repeat(1024 * 1024);
    await expect(state.put("big", value)).resolves.toBe("big");
  });

  it("value at 1MB+1 rejects", async () => {
    const state = await init({ namespace: `mb-fail-${Date.now()}` });
    const value = "x".repeat(1024 * 1024 + 1);
    await expect(state.put("toobig", value)).rejects.toMatchObject({
      code: ERROR_PAYLOAD_TOO_LARGE,
    });
  });

  it("expired key returns undefined and is purged", async () => {
    const state = await init({ namespace: `exp-${Date.now()}` });
    await state.put("short", "v", { ttl: 1 });
    await new Promise((r) => setTimeout(r, 1100));
    expect(await state.get("short")).toBeUndefined();
    expect(await state.any({ match: "short" })).toBe(false);
  });

  it("invalid key rejected", async () => {
    const state = await init({ namespace: `bad-key-${Date.now()}` });
    await expect(state.put("../evil", "v")).rejects.toMatchObject({ code: ERROR_BAD_REQUEST });
  });

  it("deleteAll requires match", async () => {
    const state = await init({ namespace: `delall-${Date.now()}` });
    await expect(state.deleteAll({} as { match: string })).rejects.toMatchObject({
      code: ERROR_BAD_REQUEST,
    });
  });

  it("list is async generator", async () => {
    const state = await init({ namespace: `list-test-${Date.now()}` });
    await state.put("a", "1");
    await state.put("b", "2");
    const pages: string[][] = [];
    for await (const page of state.list({ match: "*" })) {
      pages.push(page.keys);
    }
    expect(pages.flat().sort()).toEqual(["a", "b"]);
  });

  it("persistence survives init cycle", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aio-state-"));
    const s1 = await init({ persist: dir });
    await s1.put("persisted", "data", { ttl: -1 });
    const s2 = await init({ persist: dir });
    expect((await s2.get("persisted"))?.value).toBe("data");
  });
});
