# ARKlight backend (stage 3 — wired in)

A small Flask service that exposes a real directory on disk to the
browser workbench via REST. It is what `extensions/arklight-fs`'s
`FileSystemProvider` calls for every `arklight://` filesystem
operation — see the root `README.md` for how the two fit together.

Not included, on purpose: authentication, terminals, a compiler,
Docker, workspace management. Those are separate concerns — bolt
them on independently once this contract is solid (see `ROADMAP.md`).

## Quick start

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
WORKSPACE_ROOT=/path/to/your/project python app.py
```

Server listens on `:5000` by default (override with `PORT`).

## API

| Method | Path                        | Purpose                                          |
|--------|-----------------------------|---------------------------------------------------|
| GET    | `/workspace/files`          | Recursive file/dir listing                         |
| GET    | `/workspace/dir/<path>`     | Single-level directory listing (lazy expand)        |
| POST   | `/workspace/dir/<path>`     | Create directory                                    |
| GET    | `/workspace/stat/<path>`    | Metadata: type, size, mtime, ctime                  |
| GET    | `/workspace/file/<path>`    | Read file content (raw bytes, `X-Mtime` header)     |
| PUT    | `/workspace/file/<path>`    | Write file content (supports optimistic concurrency)|
| POST   | `/workspace/file/<path>`    | Create empty file                                   |
| DELETE | `/workspace/file/<path>`    | Delete file                                         |
| PATCH  | `/workspace/file/<path>`    | Rename/move (JSON body: `{"newPath": ...}`)         |
| POST   | `/workspace/copy`           | Copy file/dir (JSON body: `{"from": ..., "to": ...}`)|
| GET    | `/workspace/search?q=...`   | Naive substring search across files (200-match cap) |
| GET    | `/workspace/search/fuzzy?q=...` | Typo-tolerant path search (bag-of-words + difflib) |
| GET    | `/workspace/explain-error?message=...` | Plain-English translation of a raw error string |
| GET    | `/workspace/search/suggest?q=...` | "Did you mean" + n-gram autocomplete continuation |
| GET    | `/workspace/watch`          | Server-Sent Events stream of file-change events     |
| GET    | `/healthz`                  | Liveness + resolved workspace root + readonly flag  |

All paths are relative to `WORKSPACE_ROOT` and are resolved+checked
to prevent `../` escaping the workspace directory.

**Concurrency:** `PUT` accepts an `If-Unmodified-Since-Mtime` header;
if the file's on-disk mtime no longer matches, the write is rejected
with `412 Conflict` instead of silently clobbering a concurrent edit.

**Watching:** `/workspace/watch` polls the tree every
`ARKLIGHT_WATCH_POLL_INTERVAL` seconds (default 1s) and diffs against
the previous snapshot to synthesize `created`/`changed`/`deleted`
events. This is a placeholder for real filesystem notifications
(inotify/watchdog) — see `ROADMAP.md`.

**Read-only mode:** set `ARKLIGHT_READONLY=1` to 403 all
write/delete/rename/copy requests while still serving reads.

**Stage 5 tooling (`nlp_tools.py`):** the fuzzy/explain-error/suggest
endpoints above are stdlib-only helpers -- `difflib`, `collections`,
`re`, `math`, `random`, `ast` -- no numpy/torch/external model
weights, no network calls. `/workspace/search/suggest` lazily builds
its "did you mean"/autocomplete corpus from this workspace's own
Python docstrings and Markdown files the first time it's called, then
caches it for the life of the process.

## Next steps

See `ROADMAP.md` for the full staged plan. Immediate candidates:

- Auth (even a single shared bearer token) before this is reachable
  from anywhere but localhost.
- Real filesystem-event watching (`watchdog`/inotify) instead of
  polling.
- `.gitignore`-aware listing/search instead of the fixed `NOISE_DIRS`
  set.
