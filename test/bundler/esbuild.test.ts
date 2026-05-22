import { describe, it, expect } from "vitest";
import * as esbuild from "esbuild";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, "fixture");
const outFile = path.join(fixtureDir, "dist-esbuild", "bundle.js");

describe("bundler smoke: esbuild", () => {
  it("bundle excludes azure SDK and includes stub marker", async () => {
    const stubFiles = path.resolve(__dirname, "../../dist/files.js");
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await esbuild.build({
      entryPoints: [path.join(fixtureDir, "index.js")],
      bundle: true,
      platform: "node",
      outfile: outFile,
      alias: {
        "@adobe/aio-lib-files": stubFiles,
      },
    });

    const bundle = await fs.readFile(outFile, "utf8");
    expect(bundle).toContain("aio-libs-local stub");
    expect(bundle).not.toMatch(/@azure\/storage-blob/);
  });
});
