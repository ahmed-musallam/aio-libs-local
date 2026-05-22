import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Readable } from "node:stream";
import { ERROR_BAD_FILE_NAME, ERROR_FILE_NOT_EXISTS } from "../src/errors";
import { createRequire } from "node:module";
import { init, STUB_MARKER } from "../dist/files.js";

const require = createRequire(import.meta.url);
const filesMod = require("../dist/files.js");

describe("files stub", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "aio-files-"));
  });

  it("exports init like real lib", () => {
    expect(filesMod.init).toBeDefined();
    expect(filesMod.FilePermissions).toBeDefined();
    expect(filesMod.UrlType).toBeDefined();
  });

  it("contains stub marker for bundler smoke tests", () => {
    expect(STUB_MARKER).toBe("aio-libs-local stub");
  });

  it("write/read string round-trip", async () => {
    const files = await init({ root });
    const n = await files.write("hello.txt", "world");
    expect(n).toBe(5);
    expect((await files.read("hello.txt")).toString()).toBe("world");
  });

  it("write/read Buffer round-trip", async () => {
    const files = await init({ root });
    await files.write("bin.dat", Buffer.from([1, 2, 3]));
    expect([...(await files.read("bin.dat"))]).toEqual([1, 2, 3]);
  });

  it("write/read stream round-trip", async () => {
    const files = await init({ root });
    await files.write("stream.txt", Readable.from(["ab", "cd"]));
    expect((await files.read("stream.txt")).toString()).toBe("abcd");
  });

  it("path traversal rejected", async () => {
    const files = await init({ root });
    await expect(files.read("../../etc/passwd")).rejects.toMatchObject({
      code: ERROR_BAD_FILE_NAME,
    });
  });

  it("delete directory is recursive", async () => {
    const files = await init({ root });
    await files.write("dir/sub/file.txt", "x");
    const deleted = await files.delete("dir/");
    expect(deleted.length).toBeGreaterThan(0);
    expect(await files.list("dir/")).toEqual([]);
  });

  it("list root returns entries", async () => {
    const files = await init({ root });
    await files.write("a.txt", "a");
    await files.write("public/b.txt", "b");
    const listing = await files.list("/");
    const names = listing.map((f) => f.name).sort();
    expect(names).toContain("a.txt");
    expect(names.some((n) => n.startsWith("public"))).toBe(true);
  });

  it("public paths report isPublic true", async () => {
    const files = await init({ root });
    await files.write("public/visible.txt", "hi");
    const props = await files.getProperties("public/visible.txt");
    expect(props.isPublic).toBe(true);
    await files.write("secret.txt", "x");
    expect((await files.getProperties("secret.txt")).isPublic).toBe(false);
  });

  it("generatePresignURL returns file:// path", async () => {
    const files = await init({ root });
    await files.write("private.dat", "secret");
    const url = await files.generatePresignURL("private.dat", { expiryInSeconds: 60 });
    expect(url.startsWith("file://")).toBe(true);
  });

  it("read honors position and length", async () => {
    const files = await init({ root });
    await files.write("slice.txt", "abcdef");
    expect((await files.read("slice.txt", { position: 2, length: 3 })).toString()).toBe("cde");
  });

  it("missing file throws ERROR_FILE_NOT_EXISTS on read", async () => {
    const files = await init({ root });
    await expect(files.read("nope.txt")).rejects.toMatchObject({ code: ERROR_FILE_NOT_EXISTS });
  });
});
