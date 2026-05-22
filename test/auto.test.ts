import { describe, it, expect, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../dist");

describe("auto entry", () => {
  afterEach(() => {
    delete process.env.__OW_API_KEY;
    vi.resetModules();
    const auto = require(path.join(distDir, "auto.js"));
    auto.resetForce();
  });

  it("uses local stubs without __OW_API_KEY", () => {
    delete process.env.__OW_API_KEY;
    vi.resetModules();
    const auto = require(path.join(distDir, "auto.js"));
    const files = require(path.join(distDir, "files.js"));
    const state = require(path.join(distDir, "state.js"));
    expect(auto.Files.init).toEqual(files.init);
    expect(auto.State.init).toEqual(state.init);
  });

  it("forceLocal overrides runtime env", () => {
    process.env.__OW_API_KEY = "fake-key";
    vi.resetModules();
    const auto = require(path.join(distDir, "auto.js"));
    const files = require(path.join(distDir, "files.js"));
    auto.forceLocal();
    expect(auto.Files.init).toEqual(files.init);
    expect(auto.State.init).toEqual(require(path.join(distDir, "state.js")).init);
  });

  it("forceRuntime then forceLocal still resolves to stubs", () => {
    process.env.__OW_API_KEY = "fake-key";
    vi.resetModules();
    const auto = require(path.join(distDir, "auto.js"));
    const files = require(path.join(distDir, "files.js"));
    auto.forceRuntime();
    auto.forceLocal();
    expect(auto.Files.init).toEqual(files.init);
  });
});
