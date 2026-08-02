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

## Backend

`backend/` is a minimal Flask service exposing a REST API
(`/workspace/files`, `/workspace/file/<path>`) for reading and writing
real files on disk. It's not wired into the workbench yet — that's the
next step, replacing the default local `FileSystemProvider` with one
that calls this API. See `backend/README.md`.

## Status

Stage 0 (verified working browser build) and the pruning batches are
done. Stage 2 — a custom `FileSystemProvider` in the workbench source
talking to `backend/`, and a `workspaceProvider` pointing at a virtual
`arklight:/project` — has not started yet. See the "Still open" section
of `AUTOMATION.md`.

## License

This is a fork of Code - OSS and remains under the [MIT license](LICENSE.txt).
