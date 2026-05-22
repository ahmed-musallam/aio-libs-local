import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

type FilesLike = {
  write: (p: string, c: string) => Promise<number>;
  read: (p: string) => Promise<Buffer>;
  list: (p?: string) => Promise<Array<{ name: string; isPublic: boolean; isDirectory: boolean }>>;
  delete: (p: string) => Promise<unknown>;
};

async function stubInit(): Promise<FilesLike> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "parity-files-"));
  const { init } = await import("../../dist/files.js");
  return init({ root: dir });
}

describe("files contract (local stub only)", () => {
  let files: FilesLike;
  const filePath = `parity-${Date.now()}.txt`;

  it("write/read round-trip", async () => {
    files = await stubInit();
    await files.write(filePath, "parity-content");
    const buf = await files.read(filePath);
    expect(buf.toString()).toBe("parity-content");
  });

  it("list file returns array with expected shape", async () => {
    const listing = await files.list(filePath);
    expect(Array.isArray(listing)).toBe(true);
    if (listing.length > 0) {
      expect(listing[0]).toHaveProperty("name");
      expect(listing[0]).toHaveProperty("isDirectory");
      expect(listing[0]).toHaveProperty("isPublic");
    }
  });

  it("cleanup", async () => {
    try {
      await files.delete(filePath);
    } catch {
      /* ignore */
    }
  });
});
