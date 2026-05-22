import { describe, it, expect } from "vitest";
import { build } from "vite";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, "fixture");
const outFile = path.join(fixtureDir, "dist-vite", "bundle.js");

describe("bundler smoke: vite", () => {
  it("bundle excludes azure SDK and includes stub marker", async () => {
    await build({
      configFile: path.join(fixtureDir, "vite.config.mjs"),
      root: fixtureDir,
    });

    const bundle = await fs.readFile(outFile, "utf8");
    expect(bundle).toContain("aio-libs-local stub");
    expect(bundle).not.toMatch(/@azure\/storage-blob/);
  });
});
