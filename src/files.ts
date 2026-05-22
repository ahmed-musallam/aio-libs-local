/* aio-libs-local stub */

import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import mime from "mime-types";
import {
  ERROR_BAD_FILE_NAME,
  ERROR_BAD_FILE_TYPE,
  ERROR_FILE_NOT_EXISTS,
  ERROR_OUT_OF_RANGE,
  throwError,
} from "./errors";
import { isInsideRoot, toFileUrl } from "./path-utils";

export const STUB_MARKER = "aio-libs-local stub";

export interface InitOptions {
  /** Root directory for file storage. Defaults to `.aio-files` in cwd. */
  root?: string;
}

export interface RemoteFileProperties {
  name: string;
  creationTime: Date;
  lastModified: Date;
  contentLength: number;
  contentType: string;
  isDirectory: boolean;
  isPublic: boolean;
  url: string;
  internalUrl: string;
}

export interface Files {
  list(filePath?: string): Promise<RemoteFileProperties[]>;
  read(filePath: string, options?: { position?: number; length?: number }): Promise<Buffer>;
  write(filePath: string, content: string | Buffer | NodeJS.ReadableStream): Promise<number>;
  delete(filePath: string, options?: { progressCallback?: (f: string) => void }): Promise<string[]>;
  copy(
    srcPath: string,
    destPath: string,
    options?: {
      localSrc?: boolean;
      localDest?: boolean;
      noOverwrite?: boolean;
      progressCallback?: (src: string, dest: string) => void;
    },
  ): Promise<Record<string, string>>;
  getProperties(filePath: string): Promise<RemoteFileProperties>;
  generatePresignURL(
    filePath: string,
    options: { expiryInSeconds: number; permissions?: string; urlType?: string },
  ): Promise<string>;
  createReadStream(
    filePath: string,
    options?: { position?: number; length?: number },
  ): Promise<NodeJS.ReadableStream>;
  createWriteStream(filePath: string): Promise<NodeJS.WritableStream>;
  revokeAllPresignURLs(): Promise<void>;
}

const PUBLIC_PREFIX = "public";

function assertNoTraversal(filePath: string): void {
  const segments = filePath.replace(/\\/g, "/").split("/");
  if (segments.some((s) => s === "..")) {
    throwError(ERROR_BAD_FILE_NAME, `path traversal not allowed: ${filePath}`, { filePath });
  }
}

function normalizeRemotePath(filePath: string): string {
  assertNoTraversal(filePath);
  let res = filePath;
  if (!res.startsWith("/")) res = "/" + res;
  res = path.posix.normalize(res);
  while (res.startsWith("/")) res = res.slice(1);
  return res;
}

function isRemoteRoot(filePath: string): boolean {
  return filePath === "";
}

function isRemotePublic(filePath: string): boolean {
  return filePath === PUBLIC_PREFIX || filePath.startsWith(PUBLIC_PREFIX + "/");
}

function isRemoteDirectory(filePath: string): boolean {
  return filePath.endsWith("/") || filePath === "" || filePath === PUBLIC_PREFIX;
}

function throwIfRemoteDirectory(filePath: string, details: unknown): void {
  if (isRemoteDirectory(filePath)) {
    throwError(ERROR_BAD_FILE_TYPE, `${filePath} is a directory but should be a file`, details);
  }
}

class LocalFiles implements Files {
  private root: string;
  private presignUrls = new Set<string>();

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolveLocal(normalizedPath: string): string {
    if (normalizedPath.includes("\0")) {
      throwError(ERROR_BAD_FILE_NAME, `invalid file path: ${normalizedPath}`, {
        filePath: normalizedPath,
      });
    }
    const segments = normalizedPath.split("/").filter(Boolean);
    for (const seg of segments) {
      if (seg === "..") {
        throwError(ERROR_BAD_FILE_NAME, `path traversal not allowed: ${normalizedPath}`, {
          filePath: normalizedPath,
        });
      }
    }
    const local = path.join(this.root, ...segments);
    const resolved = path.resolve(local);
    if (!isInsideRoot(resolved, this.root)) {
      throwError(ERROR_BAD_FILE_NAME, `path escapes storage root: ${normalizedPath}`, {
        filePath: normalizedPath,
      });
    }
    return resolved;
  }

  private fileUrl(normalizedPath: string): string {
    const local = this.resolveLocal(normalizedPath);
    return toFileUrl(local);
  }

  private async propsFromPath(
    normalizedPath: string,
    localPath: string,
  ): Promise<RemoteFileProperties> {
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(localPath);
    } catch (e: any) {
      if (e?.code === "ENOENT") {
        throwError(ERROR_FILE_NOT_EXISTS, `file \`${normalizedPath}\` does not exist`, {
          filePath: normalizedPath,
        });
      }
      throw e;
    }
    const isDirectory = stat.isDirectory();
    const url = this.fileUrl(normalizedPath);
    return {
      name: normalizedPath,
      creationTime: stat.birthtime,
      lastModified: stat.mtime,
      contentLength: isDirectory ? 0 : stat.size,
      contentType: isDirectory
        ? "application/x-directory"
        : mime.lookup(normalizedPath) || "application/octet-stream",
      isDirectory,
      isPublic: isRemotePublic(normalizedPath),
      url,
      internalUrl: url,
    };
  }

  private async collectFiles(normalizedDir: string): Promise<RemoteFileProperties[]> {
    const results: RemoteFileProperties[] = [];
    const localDir = this.resolveLocal(normalizedDir);

    const walk = async (dir: string, prefix: string): Promise<void> => {
      let entries: fs.Dirent[];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch (e: any) {
        if (e?.code === "ENOENT") return;
        throw e;
      }
      for (const ent of entries) {
        const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          const norm = rel + "/";
          results.push(await this.propsFromPath(norm, full));
          await walk(full, rel);
        } else if (ent.isFile()) {
          results.push(await this.propsFromPath(rel, full));
        }
      }
    };

    if (isRemoteRoot(normalizedDir)) {
      await fsp.mkdir(this.root, { recursive: true });
      const top = await fsp.readdir(this.root, { withFileTypes: true });
      for (const ent of top) {
        const full = path.join(this.root, ent.name);
        if (ent.isDirectory()) {
          const remoteName = ent.name === PUBLIC_PREFIX ? PUBLIC_PREFIX : `${ent.name}/`;
          results.push(await this.propsFromPath(remoteName, full));
          await walk(full, ent.name === PUBLIC_PREFIX ? PUBLIC_PREFIX : ent.name);
        } else {
          results.push(await this.propsFromPath(ent.name, full));
        }
      }
      return results;
    }

    await walk(localDir, normalizedDir.replace(/\/$/, ""));
    return results;
  }

  async list(filePath = ""): Promise<RemoteFileProperties[]> {
    const normalized = normalizeRemotePath(filePath);
    if (isRemoteDirectory(normalized)) {
      return this.collectFiles(normalized);
    }
    try {
      const info = await this.getProperties(normalized);
      return [info];
    } catch (e: any) {
      if (e?.code === ERROR_FILE_NOT_EXISTS) return [];
      throw e;
    }
  }

  async read(
    filePath: string,
    options: { position?: number; length?: number } = {},
  ): Promise<Buffer> {
    const normalized = normalizeRemotePath(filePath);
    const details = { filePath, options };
    throwIfRemoteDirectory(normalized, details);
    const local = this.resolveLocal(normalized);
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(local);
    } catch (e: any) {
      if (e?.code === "ENOENT") {
        throwError(ERROR_FILE_NOT_EXISTS, `file \`${normalized}\` does not exist`, details);
      }
      throw e;
    }
    const position = options.position ?? 0;
    if (position > stat.size) {
      throwError(
        ERROR_OUT_OF_RANGE,
        `options.position ${position} out of range for file ${normalized}`,
        details,
      );
    }
    const length = options.length ?? stat.size - position;
    const fd = await fsp.open(local, "r");
    try {
      const buf = Buffer.alloc(Math.min(length, stat.size - position));
      await fd.read(buf, 0, buf.length, position);
      return buf;
    } finally {
      await fd.close();
    }
  }

  async write(filePath: string, content: string | Buffer | NodeJS.ReadableStream): Promise<number> {
    const normalized = normalizeRemotePath(filePath);
    const details = { filePath: normalized };
    throwIfRemoteDirectory(normalized, details);
    const local = this.resolveLocal(normalized);
    await fsp.mkdir(path.dirname(local), { recursive: true });

    if (typeof content === "string") {
      await fsp.writeFile(local, content, "utf8");
      return Buffer.byteLength(content, "utf8");
    }
    if (Buffer.isBuffer(content)) {
      await fsp.writeFile(local, content);
      return content.length;
    }
    const ws = fs.createWriteStream(local);
    await pipeline(content, ws);
    const stat = await fsp.stat(local);
    return stat.size;
  }

  async delete(
    filePath: string,
    options: { progressCallback?: (f: string) => void } = {},
  ): Promise<string[]> {
    const elements = await this.list(filePath);
    const deleted: string[] = [];
    for (const fp of elements) {
      const name = fp.name;
      const local = this.resolveLocal(name);
      await fsp.rm(local, { recursive: true, force: true });
      if (options.progressCallback) options.progressCallback(name);
      deleted.push(name);
    }
    return deleted;
  }

  async getProperties(filePath: string): Promise<RemoteFileProperties> {
    const normalized = normalizeRemotePath(filePath);
    return this.propsFromPath(normalized, this.resolveLocal(normalized));
  }

  async createReadStream(
    filePath: string,
    options: { position?: number; length?: number } = {},
  ): Promise<NodeJS.ReadableStream> {
    const buf = await this.read(filePath, options);
    return Readable.from(buf);
  }

  async createWriteStream(filePath: string): Promise<NodeJS.WritableStream> {
    const normalized = normalizeRemotePath(filePath);
    throwIfRemoteDirectory(normalized, { filePath });
    const local = this.resolveLocal(normalized);
    await fsp.mkdir(path.dirname(local), { recursive: true });
    return fs.createWriteStream(local);
  }

  async copy(
    srcPath: string,
    destPath: string,
    options: {
      localSrc?: boolean;
      localDest?: boolean;
      noOverwrite?: boolean;
      progressCallback?: (src: string, dest: string) => void;
    } = {},
  ): Promise<Record<string, string>> {
    if (options.localSrc && options.localDest) {
      throwError(ERROR_BAD_FILE_TYPE, "local to local copy is not supported", {
        srcPath,
        destPath,
        options,
      });
    }

    const normalizeSrc = (p: string) =>
      options.localSrc ? path.resolve(p) : this.resolveLocal(normalizeRemotePath(p));

    const srcIsDir = options.localSrc
      ? (await fsp.stat(normalizeSrc(srcPath)).catch(() => null))?.isDirectory()
      : isRemoteDirectory(normalizeRemotePath(srcPath));

    const srcFiles: string[] = [];
    if (options.localSrc) {
      const srcLocal = normalizeSrc(srcPath);
      const stat = await fsp.stat(srcLocal).catch((e: any) => {
        if (e?.code === "ENOENT") {
          throwError(ERROR_FILE_NOT_EXISTS, `file \`${srcPath}\` does not exist`, { srcPath });
        }
        throw e;
      });
      if (stat.isFile()) {
        srcFiles.push(srcLocal);
      } else {
        const walk = async (dir: string): Promise<void> => {
          for (const ent of await fsp.readdir(dir, { withFileTypes: true })) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) await walk(full);
            else if (ent.isFile()) srcFiles.push(full);
          }
        };
        await walk(srcLocal);
      }
    } else {
      const listed = await this.list(srcPath);
      if (listed.length === 0) {
        throwError(ERROR_FILE_NOT_EXISTS, `file \`${srcPath}\` does not exist`, { srcPath });
      }
      srcFiles.push(...listed.filter((f) => !f.isDirectory).map((f) => f.name));
    }

    const mapping: Record<string, string> = {};
    const normSrc = options.localSrc ? srcPath : normalizeRemotePath(srcPath);
    const normDest = options.localDest ? destPath : normalizeRemotePath(destPath);

    for (const srcFile of srcFiles) {
      let destFile: string;
      if (options.localSrc) {
        const rel = path.relative(normalizeSrc(srcPath), srcFile);
        const base =
          normDest.endsWith("/") || (srcIsDir && !options.localDest)
            ? path.posix.join(normalizeRemotePath(normDest), rel.split(path.sep).join("/"))
            : normalizeRemotePath(normDest);
        destFile = base;
      } else {
        const rel = path.posix.relative(normSrc.replace(/\/$/, ""), srcFile);
        destFile =
          srcIsDir && !normDest.endsWith("/")
            ? path.posix.join(normDest + "/", rel)
            : srcIsDir
              ? path.posix.join(normDest.endsWith("/") ? normDest : normDest + "/", rel)
              : normDest;
      }

      if (options.noOverwrite) {
        try {
          if (options.localDest) {
            await fsp.access(path.resolve(destFile));
            continue;
          } else {
            await this.getProperties(destFile);
            continue;
          }
        } catch {
          // does not exist — proceed
        }
      }

      if (options.localSrc && !options.localDest) {
        const content = await fsp.readFile(srcFile);
        await this.write(destFile, content);
      } else if (!options.localSrc && options.localDest) {
        const content = await this.read(srcFile);
        await fsp.mkdir(path.dirname(path.resolve(destFile)), { recursive: true });
        await fsp.writeFile(path.resolve(destFile), content);
      } else if (!options.localSrc && !options.localDest) {
        const content = await this.read(srcFile);
        await this.write(destFile, content);
      }

      mapping[srcFile] = destFile;
      if (options.progressCallback) options.progressCallback(srcFile, destFile);
    }

    return mapping;
  }

  async generatePresignURL(
    filePath: string,
    options: { expiryInSeconds: number; permissions?: string; urlType?: string },
  ): Promise<string> {
    const normalized = normalizeRemotePath(filePath);
    throwIfRemoteDirectory(normalized, { filePath, options });
    await this.getProperties(normalized);
    const url = this.fileUrl(normalized);
    this.presignUrls.add(url);
    return url;
  }

  async revokeAllPresignURLs(): Promise<void> {
    this.presignUrls.clear();
  }
}

export async function init(options: InitOptions = {}): Promise<Files> {
  const root = path.resolve(options.root ?? path.join(process.cwd(), ".aio-files"));
  await fsp.mkdir(root, { recursive: true });
  return new LocalFiles(root);
}

export const FilePermissions = { READ: "r", WRITE: "w", DELETE: "d" };
export const UrlType = { external: "external", internal: "internal" };

module.exports = { init, FilePermissions, UrlType, STUB_MARKER };
