# Architecture

Single source of truth for **how the pieces fit together**, across both
shells this project ships. Stage status belongs in `ROADMAP.md` (browser)
and `TAURI-ROADMAP.md` (native) — this file doesn't duplicate that, it
explains the shape those stages are filling in.

## Two products, one workbench

This is not one app with an optional backend. It's two products that
happen to share a UI layer:

| | Browser shell (`application` branch) | Native shell (`tauri-port` branch) |
|---|---|---|
| Ships as | a page you point a browser at | an installed binary |
| Runs where | wherever you host `backend/` + serve the compiled workbench | on the user's machine |
| Filesystem owner | `backend/app.py` (Flask), reached over HTTP | the Rust process itself, reached over Tauri IPC |
| Multi-user / remote | yes — that's the point | no — single user, local disk |
| Long-lived processes at runtime | Node (dev server) or any static host + Python | one native binary, nothing else |

Both compile the *same* workbench source (`src/`, `extensions/`) — a
pruned Code-OSS tree. What differs is what sits underneath
`vscode.workspace.fs` for the `arklight://` scheme: an HTTP client
talking to Flask, or (once Stage 2 lands) a thin IPC client talking to
Rust. Everything above that line — editor, tabs, explorer, command
palette, search UI — is identical in both shells, unmodified.

```
                         ┌─────────────────────────────┐
                         │   Workbench (src/, Monaco)   │
                         │  identical in both shells    │
                         └───────────────┬───────────────┘
                                          │ vscode.workspace.fs
                                          │  (arklight:// scheme)
                         ┌───────────────┴───────────────┐
                         │      arklight-fs extension      │
                         │  FileSystemProvider + search    │
                         └───────────────┬───────────────┘
                    ┌─────────────────────┴─────────────────────┐
                    │                                             │
           browser shell: fetch()/SSE                   native shell: invoke()/event
                    │                                             │
        ┌───────────┴───────────┐                     ┌───────────┴───────────┐
        │   backend/app.py       │                     │  src-tauri Rust core   │
        │   Flask, HTTP+SSE       │                     │  #[tauri::command]s    │
        │   over localhost:5000   │                     │  in-process, no HTTP   │
        └───────────┬───────────┘                     └───────────┬───────────┘
                    │ std filesystem calls                        │ std::fs / notify
                    ▼                                              ▼
              WORKSPACE_ROOT on disk                     workspace root on disk
```

## The shared contract: `vscode.FileSystemProvider`

Everything downstream of the workbench is in service of one VS Code
extension API surface — `vscode.FileSystemProvider`, registered for the
custom `arklight://` scheme in `extensions/arklight-fs/src/extension.ts`.
That interface is the real architectural boundary in this project: as
long as *something* implements `stat`, `readDirectory`, `readFile`,
`writeFile`, `delete`, `rename`, `copy`, `createDirectory`, and
`onDidChangeFile`, the workbench above it doesn't know or care whether
the implementation is making `fetch()` calls to Flask or `invoke()`
calls to Rust.

`extensions/arklight-fs/src/arklightPaths.ts` defines the other half of
the contract both shells share: every `arklight:/project/...` URI maps
to a path relative to one workspace root, with `''` meaning the root
itself. That mapping is shell-agnostic and doesn't change between
branches.

## Browser shell: what's actually implemented (`application`)

Concrete today, not aspirational — this is what `backend/app.py` +
`arklightFileSystemProvider.ts` do.

| FileSystemProvider method | HTTP call | Flask handler |
|---|---|---|
| `stat` | `GET /workspace/stat/<path>` | `stat_path` |
| `readDirectory` | `GET /workspace/dir/<path>` | `list_dir` |
| `createDirectory` | `POST /workspace/dir/<path>` | `create_dir` |
| `readFile` | `GET /workspace/file/<path>` | `read_file` |
| `writeFile` | `PUT /workspace/file/<path>` (+ `If-Unmodified-Since-Mtime`) | `write_file` |
| `delete` | `DELETE /workspace/file/<path>` | `delete_file` |
| `rename` | `PATCH /workspace/file/<path>` (`{newPath}`) | `rename_file` |
| `copy` | `POST /workspace/copy` (`{from, to}`) | `copy_path` |
| `onDidChangeFile` | `EventSource` on `GET /workspace/watch` (SSE) | `watch`, fed by a 1s poll-and-diff loop |
| file search | `GET /workspace/files` (full recursive listing, filtered client-side) | `list_files` |
| text search | `GET /workspace/search?q=` | `search` |

Notable properties of this implementation, since they set the bar
Stage 2 has to clear or consciously drop:

- **Optimistic concurrency.** `writeFile` sends the last-known mtime as
  `If-Unmodified-Since-Mtime`; Flask 412s if the on-disk mtime has since
  moved, and the provider surfaces that as a plain `Error` (there's no
  `vscode.FileSystemError` code for "conflict").
- **Path-escape rejection.** Flask's `_resolve()` resolves every
  client-supplied relative path against `WORKSPACE_ROOT` and 400s
  anything that resolves outside it.
- **Change events are polled, not pushed.** `_watch_poll_loop` re-walks
  the whole tree every `ARKLIGHT_WATCH_POLL_INTERVAL` seconds (default
  1s) and diffs against the previous snapshot — a placeholder, not real
  inotify/FSEvents.
- **One shared watch connection.** The backend exposes a single
  workspace-wide SSE stream; the provider doesn't do per-uri or
  recursive filtering, it just re-emits everything server-side and lets
  the workbench filter.
- **Read-only mode, size caps, error-JSON-not-HTML** are backend-level
  policy (`ARKLIGHT_READONLY`, `ARKLIGHT_MAX_READ_BYTES`), invisible to
  the provider except as ordinary HTTP status codes.

## Native shell: where it stands (`tauri-port`)

**Stage 1 (done):** `src-tauri/` boots a Tauri window pointed at a
self-contained static bundle (`app/` — see `BUILD-WEB-BUNDLE.md`).
Zero `#[tauri::command]`s are registered. No Flask, no Node, no Python
process runs. The window shows workbench chrome with no workspace
open — same as `vscode.dev` with no folder. That's the entire scope;
there is no filesystem story yet at all.

**Stage 2 (next, not started): design.** This is the part this doc
exists to pin down before code gets written. The target is a Rust
implementation of the same contract, called over Tauri's IPC instead
of HTTP, with no server process and no REST envelope in between.

```
extensions/arklight-fs (or a Tauri-specific sibling)
        │
        │  window.__TAURI__.core.invoke('fs_<verb>', {...})
        ▼
#[tauri::command] fn fs_<verb>(...) -> Result<T, FsError>
        │
        │  std::fs, resolved + escape-checked against workspace_root
        ▼
      disk
```

Planned command surface, mapped 1:1 against the Flask endpoints above
so the port is mechanical rather than a redesign:

| FileSystemProvider method | Tauri command (planned) | Flask equivalent |
|---|---|---|
| `stat` | `fs_stat(path)` | `GET /workspace/stat/<path>` |
| `readDirectory` | `fs_list_dir(path)` | `GET /workspace/dir/<path>` |
| `createDirectory` | `fs_create_dir(path)` | `POST /workspace/dir/<path>` |
| `readFile` | `fs_read_file(path)` | `GET /workspace/file/<path>` |
| `writeFile` | `fs_write_file(path, content, if_unmodified_since_mtime?)` | `PUT /workspace/file/<path>` |
| `delete` | `fs_delete(path, recursive)` | `DELETE /workspace/file/<path>` |
| `rename` | `fs_rename(from, to, overwrite)` | `PATCH /workspace/file/<path>` |
| `copy` | `fs_copy(from, to, overwrite)` | `POST /workspace/copy` |
| `onDidChangeFile` | Tauri `app.emit("arklight://fs-change", ...)`, JS side `listen()`s | SSE `GET /workspace/watch` |
| file search | `fs_list_all()` | `GET /workspace/files` |
| text search | `fs_search_text(query)` | `GET /workspace/search` |

Design decisions this table already bakes in, so Stage 2 doesn't
re-litigate them mid-implementation:

- **Same field names and semantics for stat data** (`path`, `type`,
  `size`, `mtime`, `ctime` as seconds-since-epoch floats) as the Flask
  contract. That's what lets `arklightFileSystemProvider.ts`'s
  millisecond math (`Math.round(entry.mtime * 1000)`) carry over
  unchanged — only the transport call changes, not the shape of the
  data flowing through it.
- **Optimistic concurrency carries over as a plain optional argument**
  (`if_unmodified_since_mtime`) instead of an HTTP header, returning a
  `Conflict` error kind with the current on-disk mtime attached — same
  information Flask's 412 body carries, no HTTP status code to
  shoehorn it into.
- **Errors become a small Rust enum, not HTTP status codes** —
  `FileNotFound` / `FileExists` / `NoPermissions` / `Conflict` /
  `Invalid` / `Unavailable`, chosen to match what
  `toFileSystemError()` already switches on client-side, so that
  function's *shape* survives the port even though it stops parsing
  HTTP responses.
- **Watching becomes push, not poll.** Rust gets to use a real
  filesystem-notification crate (`notify`, backed by inotify/FSEvents/
  ReadDirectoryChangesW depending on OS) instead of the Flask
  placeholder's re-walk-and-diff loop. This is a real behavioral
  upgrade, not just a transport swap — cheaper and lower-latency.
- **No HTTP envelope at all** — no JSON error bodies, no CORS, no
  `X-Mtime` header, no localhost port to bind or firewall around. IPC
  argument/return types replace all of it.

## Open question Stage 2 has to resolve, not just implement

The Tauri roadmap already flags this and it's still unresolved: **does
the JS side reuse/fork `extensions/arklight-fs`, or get written
standalone against the lean `app/` bundle?**

- `extensions/arklight-fs` as it exists targets `application`'s full
  source-tree build pipeline (its own `esbuild.mts`, `tsconfig.json`,
  packaged as a VS Code extension with an `activate()` entry point).
- `app/` (the Tauri branch's frontend) is `vscode-web`'s single
  esbuild-bundled static output — workbench chrome and Monaco squashed
  into one folder, *not* built through the same extension-host
  pipeline `arklight-fs` assumes.

Two ways this resolves, and this doc is where the decision should get
recorded once made (not silently in a commit message):

1. **Fork it** — a new `extensions/arklight-fs-tauri/` with the same
   `FileSystemProvider`/`FileSearchProvider2`/`TextSearchProvider2`
   shape, transport swapped to `invoke()`/`listen()`, built and bundled
   into `app/` as part of the `vscode-web` gulp task (requires
   confirming that task can bundle a built-in web extension the way it
   bundles the workbench itself).
2. **Standalone** — skip the extension-host contract entirely and
   register a `workspaceProvider`-level filesystem hook directly
   against whatever `app/`'s bundled entry point exposes, closer to
   how `workbench.ts`'s `arklight:/project` default-open already
   reaches past the extension layer in spirit.

Path 1 keeps parity with the browser shell's architecture (same
provider interface, same search-provider registration, easiest to
diff against `arklight-fs` when one changes) at the cost of pulling
the full extension build pipeline into a project whose whole premise
is a lean static bundle. Path 2 keeps Stage 1's "no dependency on the
`application` branch's heavy build tooling beyond a one-time `app/`
export" property, at the cost of not being a real VS Code
`FileSystemProvider` anymore — losing built-in dirty-diff, undo/save
integration, and conflict UX the extension API gives for free.

No code should assume an answer to this until it's picked — Stage 2's
first concrete step is closing this question, not writing Rust.

## Compiler integration (Stage 3, both shells eventually)

Out of scope for this doc's revision, flagged for completeness: once
Stage 2 lands, both shells eventually shell out to the `arklight` CLI
(`arklight build`) to round-trip edits into a live-preview pane — see
`TAURI-ROADMAP.md` Stage 3. The browser shell would do this from
`backend/app.py` via `subprocess`; the native shell from Rust via
`std::process::Command`. Neither is implemented yet in either shell.

## Non-goals (both shells)

No auth/user system, no terminal/PTY bridge, no bundled compiler
runtime baked into either process. These are tracked (or deliberately
not tracked) in `ROADMAP.md` and `TAURI-ROADMAP.md` and apply
regardless of which shell is loading the workbench.
