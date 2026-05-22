import * as path from "node:path";
import { pathToFileURL } from "node:url";

/** True when `resolved` is the storage root or a path under it (Windows-safe). */
export function isInsideRoot(resolved: string, root: string): boolean {
  const normalizedRoot = path.resolve(root);
  const normalizedResolved = path.resolve(resolved);
  const relative = path.relative(normalizedRoot, normalizedResolved);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Platform-correct file:// URL for a local filesystem path. */
export function toFileUrl(localPath: string): string {
  return pathToFileURL(path.resolve(localPath)).href;
}
