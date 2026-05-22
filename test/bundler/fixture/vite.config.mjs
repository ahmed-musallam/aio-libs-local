import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const stubFiles = path.resolve(dir, "../../../dist/files.js");

export default {
  build: {
    emptyOutDir: true,
    outDir: "dist-vite",
    lib: {
      entry: path.join(dir, "index.js"),
      formats: ["cjs"],
      fileName: "bundle",
    },
    rollupOptions: {
      external: (id) => {
        if (id === "@adobe/aio-lib-files" || id.includes("aio-libs-local")) return false;
        return false;
      },
    },
  },
  resolve: {
    alias: {
      "@adobe/aio-lib-files": stubFiles,
    },
  },
};
