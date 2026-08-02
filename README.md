# ARKlight Playground

A pruned fork of [Code - OSS](https://github.com/microsoft/vscode), stripped
down to a browser-only workbench for the ARKlight IDE project. No Electron,
no desktop packaging, no bundled backend, no Microsoft services or
authentication. Just the workbench shell (editor, tabs, explorer, command
palette) meant to be pointed at a custom `FileSystemProvider` backed by
your own server.

## Branches

- **`main`** — frozen. A single commit containing only the compiled
  `out/vs` output from the state after all pruning batches. Not buildable
  from source; this branch exists as a static, working snapshot. Do not
  extend it — branch from `application` instead.
- **`application`** — active development. Full source tree (`src/`,
  `extensions/`, build tooling) restored alongside the same compiled
  `out/vs`, plus ongoing work such as the `backend/` Flask service. This
  is the branch to build from.

## What's been removed

See `PRUNE-PLAN.md` for the batch-by-batch history of what was cut from
the stock `microsoft/vscode` tree (language servers, Copilot, git/auth
extensions, most themes, dev-tooling extensions) and why each cut was
considered safe.

## Building

See `AUTOMATION.md` for the exact command sequence (system deps,
`compile-client` vs `compile-web`, serving with `scripts/code-web.sh`,
and known-expected console output vs. real failures).

**Note:** the `out/vs` compiled snapshot checked into this branch
predates the `arklight-fs` extension (it was built during the Stage 0
prune, before Stage 2/3 landed). If you serve `out/vs` as-is you will
get a stock pruned workbench with no ARKlight filesystem. Run
`compile-client` + `compile-web` yourself to get a build that actually
includes `arklight-fs` — see `AUTOMATION.md`.

## Backend

`backend/` is a Flask service exposing a REST API over a
`WORKSPACE_ROOT` directory on disk — listing, stat, read/write,
create/delete, rename, copy, plain-text search, and an SSE change
stream. It backs the `arklight-fs` extension's `FileSystemProvider`
for the `arklight://` scheme. See `backend/README.md` for the full
endpoint table.

## Workbench integration

`extensions/arklight-fs` registers a `FileSystemProvider` and
file/text search providers for the `arklight://` scheme, backed by
`backend/`. `src/vs/code/browser/workbench/workbench.ts` defaults to
opening the virtual `arklight:/project` folder when no explicit
folder/workspace URI is passed in, so the workbench boots straight
into whatever directory the backend's `WORKSPACE_ROOT` points at.
Configure the backend URL via the `arklight.backendUrl` setting
(default `http://localhost:5000`).

## Status

Done: Stage 0 (verified working browser build), the pruning batches,
Stage 1 (branch split), Stage 2 (`arklight-fs` FileSystemProvider +
`workspaceProvider` wiring), Stage 3 (SSE file watching,
optimistic-concurrency writes, file/text search providers), and
Stage 4 (`backend/app.py` refactored to an application factory,
`backend/tests/` test suite — 36 tests covering CRUD, path-escape
rejection, rename/copy edge cases, optimistic-concurrency conflicts,
and read-only mode).

Not started: Stage 5 onward. See `ROADMAP.md` for what's next,
including a stage on building small, dependency-free
(Python-standard-library-only) statistical helpers — fuzzy
component/file search, human-readable error messages, and some
"old-school chatbot" tricks (Markov chains, bag-of-words, n-gram
models) applied to developer-tooling problems instead of chat.

## License

This is a fork of Code - OSS and remains under the [MIT license](LICENSE.txt).
