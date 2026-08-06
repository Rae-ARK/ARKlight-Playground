# Tauri port — Roadmap

Companion to the root `ROADMAP.md`, which covers the browser build,
and to `ARCHITECTURE.md`, which covers how the two shells fit
together and lays out the Stage 2 IPC design in full. This file is
the single source of truth for *stage status* on `tauri-port` — for
the shape of Stage 2 itself (command table, error kinds, the
extension reuse-vs-fork question), see `ARCHITECTURE.md` rather than
duplicating it here.

## Why a native shell, and why not yet an FS rewrite

The browser build (`README.md`) is deliberately server-backed: the
workbench runs in any tab, `backend/app.py` runs wherever you point
it, and the two talk over HTTP. That's a real, useful shape for a
hosted/shared IDE, and Tauri doesn't replace it -- it's a different
product (installable, single-user, no separate server process to
run).

Because those are different goals, this port does **not** start by
rewriting `arklight-fs` or `backend/`. Stage 1 proves the workbench
boots inside a native window at all -- the same shape as the very
first Electron shells, which were "point a window at a URL," before
any native IPC existed. Replacing the Flask hop with real Tauri
commands is Stage 2, once Stage 1 is proven boring and reliable.

## Stage 1 — Native shell, static bundle, zero runtime deps (this commit)

**Revised from the first cut of this doc.** The original Stage 1
pointed the window at `localhost:8080` (`scripts/code-web.sh`) with
Flask still running on `:5000` underneath — i.e. Node *and* Python
both resident just to show the workbench chrome. That's the wrong
shape for the actual goal here: a shell light enough for
resource-constrained hardware, where the whole point of leaving
Electron behind is undermined if two interpreters are still running
at all times regardless.

**Goal instead:** `app/` is a self-contained static bundle — real
`index.html`, esbuild-bundled JS/CSS, no AMD loader — produced
*once* from VS Code's own `vscode-web` gulp task (see
`docs/BUILD-WEB-BUNDLE.md` for exactly why `out/vs` alone doesn't
work and where the real static target lives). Tauri serves `app/`
directly. Node is a build-time-only tool now; nothing runs it, or
Python, or Flask, once the app is built.

| What | Where | Status |
|------|-------|--------|
| `src-tauri/` crate scaffold (Cargo.toml, tauri.conf.json, build.rs, main.rs) | `src-tauri/` | Done |
| `docs/BUILD-WEB-BUNDLE.md` — how `app/` gets produced from `application`'s `vscode-web` gulp task | `docs/` | Done |
| `tauri.conf.json` `frontendDist` points at `../app`, window `url` is `index.html` — no `devUrl`, no `beforeDevCommand` | `src-tauri/tauri.conf.json` | Done |
| `app/` generated locally, gitignored | `.gitignore` | Done (bundle itself not yet generated in this sandbox — see note below) |
| Zero custom `#[tauri::command]`s registered — intentional | `src-tauri/src/main.rs` | Done |
| Flask (`backend/app.py`) dependency | — | Removed from Stage 1 entirely |
| Bundling/installers | `src-tauri/tauri.conf.json` (`bundle.active: false`) | Deferred to Stage 5 |

**How to run it** (needs a Rust toolchain + Tauri's platform deps —
see `AUTOMATION.md` for the OS package list, and
https://tauri.app/start/prerequisites/ for Tauri's own):

```bash
# one-time: produce app/ (see docs/BUILD-WEB-BUNDLE.md for the full explanation)
git checkout application
npm ci && npm run gulp vscode-web
cp -r ../vscode-web ./app
git checkout tauri-port    # app/ is gitignored, carries over on the filesystem

# then, every time after:
cargo install tauri-cli --version "^2"
cd src-tauri && cargo tauri dev
```

If that window shows the workbench chrome with no workspace open
(same as `vscode.dev` with no folder passed in) — no Flask process,
no Node process, no Python process running anywhere — Stage 1 is
done. There is nothing else to verify; that is the entire scope on
purpose.

**Note on this commit specifically:** the sandbox this was built in
has Node but no Rust toolchain and no display server, so the
`vscode-web` gulp task and the actual `cargo tauri dev` launch
haven't been run/verified end-to-end yet. The config is correct
against what the gulp task documents it produces, but "correct on
paper" and "confirmed working" are different claims — first person
to run the steps above should confirm the entry-point filename
(`app/index.html`) matches what `vscode-web` actually names it, and
update `tauri.conf.json`'s `url` field if not.

**Explicitly not in Stage 1:** filesystem access from Rust, any
replacement for `backend/app.py` (it's not even running), a real app
icon, a working `tauri build` installer, window menus/native chrome
beyond Tauri's defaults, auto-update, anything OS-specific, compiler
integration.

## Stage 2 — Real files, no Flask at all

Design is now specified in full in `ARCHITECTURE.md` (command table,
error-kind enum, mtime-conflict semantics, watcher approach) — this
list tracks build/implementation status against that spec, not the
design itself.

- [ ] **Resolve the extension reuse-vs-fork question first.**
      `ARCHITECTURE.md`'s "Open question Stage 2 has to resolve"
      section lays out both paths (fork `arklight-fs` into a
      Tauri-specific sibling extension vs. a standalone
      `workspaceProvider`-level hook against `app/`'s bundled entry
      point) and their tradeoffs. Nothing below should start until
      one is picked — it changes where the TS file in the next item
      actually lives and how it's built.
- [ ] `#[tauri::command]` fs backend (`fs_stat`, `fs_list_dir`,
      `fs_create_dir`, `fs_read_file`, `fs_write_file`, `fs_delete`,
      `fs_rename`, `fs_copy`, `fs_list_all`, `fs_search_text`)
      operating directly on disk via `std::fs`, plus a shared
      `FsError` enum (`FileNotFound`/`FileExists`/`NoPermissions`/
      `Conflict`/`Invalid`/`Unavailable`) and path-escape resolution
      equivalent to Flask's `_resolve()`. Field names/units for stat
      data (`path`/`type`/`size`/`mtime`/`ctime`, mtime as
      seconds-since-epoch float) intentionally match the Flask
      contract — see `ARCHITECTURE.md`'s command table.
- [ ] A `FileSystemProvider` for the `arklight://` scheme that calls
      `window.__TAURI__.core.invoke(...)` instead of `fetch()`, with
      `toFileSystemError()`-equivalent mapping from `FsError.kind`
      instead of HTTP status. Where it lives depends on the item
      above.
- [ ] Native file-change events: a `notify`-backed watcher emitting
      `arklight://fs-change` via `app.emit(...)`, with the JS side
      `listen()`-ing instead of holding an `EventSource`. Real
      inotify/FSEvents/ReadDirectoryChangesW under the hood, not the
      Flask backend's 1s poll-and-diff loop — a genuine latency/cost
      improvement, not just a transport swap.
- [ ] `backend/app.py` stays exactly as-is for anyone who still wants
      the browser-hosted build (`application` branch) — this port
      doesn't touch or deprecate it, it just doesn't depend on it.
- [ ] Explicitly deferred out of Stage 2: the Stage 5 NLP helpers
      (`/workspace/search/fuzzy`, `/workspace/explain-error`,
      `/workspace/search/suggest` in `backend/nlp_tools.py`) are not
      being ported yet. They're stdlib-only conveniences, not part of
      the core `FileSystemProvider` contract — still available on the
      browser build in the meantime.

## Stage 3 — Compiler integration

- [ ] Shell out to the `arklight` CLI (`arklight build`) from Rust
      via `std::process::Command`, with the ARKlight compiler
      checked out alongside this project — first pass, no native
      reimplementation, just proving the round-trip (edit in
      workbench -> `arklight build` -> preview output) works.
- [ ] Live-preview pane for `arklight build` output.
- [ ] `.ark` pack/unpack surfaced in the UI, not just the CLI.

## Stage 4 — Native affordances

- [ ] Native "Open Folder" dialog (Tauri's dialog plugin) instead of
      a hardcoded `WORKSPACE_ROOT`, since a desktop app has no reason
      to fix that at process-start time.
- [ ] Recent-workspaces list persisted via Tauri's store plugin.
- [ ] Native menu bar / window chrome pass, once there's a reason to
      deviate from Tauri's defaults.

## Stage 5 — Packaging

- [ ] Flip `bundle.active: true`, real app icons per-platform,
      `cargo tauri build` producing installers (`.dmg`/`.msi`/`.AppImage`).
- [ ] CI job alongside the existing `product-build*` pipelines,
      scoped to this branch only until Stage 2+3 are proven.
- [ ] Code signing / notarization — deferred until there's an actual
      release to sign.

## Non-goals for this port

Same spirit as the root `ROADMAP.md`'s "not included, on purpose"
list: no bundled compiler integration, no auth/user system, no
terminal/PTY bridge. Those are tracked (or not) on their own terms
in the root roadmap and apply equally regardless of which shell
loads the workbench.
