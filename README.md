# @musallam/aio-libs-local

Local and in-memory stand-ins for [`@adobe/aio-lib-files`](https://github.com/adobe/aio-lib-files) and [`@adobe/aio-lib-state`](https://github.com/adobe/aio-lib-state), so App Builder code can run outside Adobe I/O Runtime (local dev, unit tests, CI) without changing call sites.

## Install

```bash
pnpm add -D @musallam/aio-libs-local
```

npm and yarn work too:

```bash
npm i -D @musallam/aio-libs-local
# yarn add -D @musallam/aio-libs-local
```

Peer dependencies on the real Adobe libs are optional — you only need them when running against Runtime or parity tests.

## Quick start (recommended): build-time aliasing

Keep imports as `@adobe/aio-lib-files` and `@adobe/aio-lib-state`; configure your bundler or test runner to swap them for this package locally. This avoids pulling `@azure/storage-blob` into local bundles.

### Webpack (`aio app build`)

```js
// webpack.config.js
const isLocal = process.env.TARGET === "local";

module.exports = {
  resolve: {
    alias: isLocal
      ? {
          "@adobe/aio-lib-files": "@musallam/aio-libs-local/files",
          "@adobe/aio-lib-state": "@musallam/aio-libs-local/state",
        }
      : {},
  },
};
```

### Vite

```js
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias:
      mode === "development"
        ? {
            "@adobe/aio-lib-files": "@musallam/aio-libs-local/files",
            "@adobe/aio-lib-state": "@musallam/aio-libs-local/state",
          }
        : {},
  },
}));
```

### Vitest

```js
// vitest.config.ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
  resolve: {
    alias: {
      "@adobe/aio-lib-files": path.resolve("node_modules/@musallam/aio-libs-local/dist/files.js"),
      "@adobe/aio-lib-state": path.resolve("node_modules/@musallam/aio-libs-local/dist/state.js"),
    },
  },
});
```

## Quick start (no bundler): `/auto` entry point

For plain Node scripts, REPLs, or `ts-node` without a bundler:

```js
const { Files, State } = require("@musallam/aio-libs-local/auto");

const files = await Files.init();
const state = await State.init();
```

Detection uses `process.env.__OW_API_KEY` as the Runtime signal. Unset it in `.env.local` to force stubs. Use `forceLocal()` / `forceRuntime()` from the auto module to override in tests.

**Do not use `/auto` under webpack, Vite, or esbuild** — the bundler will include both implementations.

## Explicit imports

```js
const filesLib = process.env.__OW_API_KEY
  ? require("@adobe/aio-lib-files")
  : require("@musallam/aio-libs-local/files");

const stateLib = process.env.__OW_API_KEY
  ? require("@adobe/aio-lib-state")
  : require("@musallam/aio-libs-local/state");
```

## Local persistence

**State** — optional disk backing:

```js
const state = await require("@musallam/aio-libs-local/state").init({
  persist: "./.aio-state",
});
```

**Files** — filesystem root (default: `.aio-files/` in cwd):

```js
const files = await require("@musallam/aio-libs-local/files").init({
  root: "./.aio-files",
});
```

Paths under `public/` are treated as publicly accessible, matching the real Files lib.

## Fidelity gaps

| Area                  | Real lib         | This stub                                   |
| --------------------- | ---------------- | ------------------------------------------- |
| Presigned URLs        | Azure SAS URLs   | `file://` absolute paths                    |
| State TTL max         | 365 days         | 30 days (configurable via `MAX_TTL`)        |
| State infinite TTL    | Not supported    | `ttl: -1` supported locally                 |
| Consistency           | Eventual (cloud) | Immediate (memory/disk)                     |
| Multi-tenant / region | Yes              | No                                          |
| Error messages        | Adobe SDK format | Same `code` values; message text may differ |
| Rate limiting         | Yes              | No                                          |

## Development

This repo uses **pnpm**, [Oxlint](https://oxc.rs/docs/guide/usage/linter.html), and [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html). Git hooks (via [Husky](https://typicode.github.io/husky/)) run lint-staged on commit and [Commitlint](https://commitlint.js.org/) on commit messages (Conventional Commits).

```bash
pnpm install          # installs deps and sets up git hooks (prepare → husky)
pnpm run lint         # oxlint
pnpm run fmt          # format in place
pnpm run fmt:check    # CI-style format check
```

## Testing

This package uses [Vitest](https://vitest.dev/). Development uses **pnpm** (`pnpm install` once in the repo root).

All tests run **offline** against the local stubs only — they never connect to Azure Blob Storage or OpenWhisk / Adobe State, even if you have cloud credentials in your environment.

```bash
pnpm test              # full suite (unit, contract, bundler smoke)
pnpm run test:unit     # unit + contract tests (no bundler smoke)
pnpm run test:bundler  # Vite + esbuild alias smoke tests
pnpm run test:watch    # watch mode
```

npm equivalents: `npm test`, `npm run test:unit`, etc.

## Releasing

Releases are automated with [semantic-release](https://semantic-release.gitbook.io/) on every push to `main` / `master` (same pattern as [adobe-firefly-sdk](https://github.com/ahmed-musallam/adobe-firefly-client); see [.github/workflows/release.yml](.github/workflows/release.yml) and [.releaserc.json](.releaserc.json)).

1. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.) — enforced by commitlint.
2. Merge to `main`; the Release workflow runs build, format check, lint, tests, then:
   - Bumps `package.json` and commits `CHANGELOG.md`
   - Creates a [GitHub Release](https://github.com/ahmed-musallam/aio-libs-local/releases)
   - Publishes `@musallam/aio-libs-local` to npm with [provenance](https://docs.npmjs.com/generating-provenance-statements) via trusted publishing (OIDC)

### npm trusted publishing (required — no `NPM_TOKEN`)

Same setup as other `@musallam` packages: configure [trusted publishing](https://docs.npmjs.com/trusted-publishers) on the **`@musallam`** npm org (or user). Do **not** add `NPM_TOKEN` to GitHub — it overrides OIDC.

| Field             | Value                           |
| ----------------- | ------------------------------- |
| Provider          | GitHub Actions                  |
| Repository        | `ahmed-musallam/aio-libs-local` |
| Workflow filename | `release.yml`                   |
| Environment       | _(empty)_                       |

If this repo is new, an org-level publisher (already used for `@musallam/ffs-*` packages) is enough. Otherwise add the table above for this repository. Do **not** set `registry-url` on `setup-node` in the release workflow.

## License

Apache-2.0
