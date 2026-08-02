# ARKlight Playground — Roadmap

This is the single source of truth for "what's done" vs. "what's
next." `README.md`, `AUTOMATION.md`, and `backend/README.md` should
stay short and point here rather than duplicating stage status —
that duplication is exactly what went stale before this file existed.

## Done

| Stage | What | Where |
|-------|------|-------|
| 0 | Verified working browser build (`compile-client` + `compile-web` + `code-web.sh` booting a real workbench chrome) | `AUTOMATION.md` |
| 0 | Pruning batches 1–7 (language servers, Copilot, git/auth extensions, most themes, dev-tooling) | `PRUNE-PLAN.md` |
| 1 | Branch split: `main` frozen as a static compiled snapshot, `application` as the buildable source tree | `README.md` |
| 2 | `backend/app.py` — Flask REST API over `WORKSPACE_ROOT` (list, stat, read, write, create, delete) | `backend/` |
| 2 | `extensions/arklight-fs` — `FileSystemProvider` for the `arklight://` scheme, calling the backend | `extensions/arklight-fs/` |
| 2 | `workspaceProvider` in `src/vs/code/browser/workbench/workbench.ts` defaults to `arklight:/project` | `workbench.ts` |
| 3 | Backend: non-recursive dir listing, rename, copy, plain-text search, JSON error bodies, `ARKLIGHT_READONLY` mode | `backend/app.py` |
| 3 | Backend: SSE `/workspace/watch` change stream, optimistic-concurrency writes (`If-Unmodified-Since-Mtime` / `412`) | `backend/app.py` |
| 3 | Extension: file/text search providers, `watch()` wired to the SSE stream, mtime cache for concurrency headers | `extensions/arklight-fs/src/` |
| 4 | `backend/app.py` refactored to an application-factory (`create_app(...)`); no endpoint behavior changed | `backend/app.py` |
| 4 | `backend/tests/test_app.py` — 36 tests (CRUD, path-escape rejection, rename/copy edge cases, `412` conflicts, readonly mode) | `backend/tests/` |
| 4 | Fixed import-time side effect: `app.py` used to create `./workspace` and start the watch-poller just by being imported | `backend/app.py` |
| 5 | `backend/nlp_tools.py` — stdlib-only fuzzy path search (`collections.Counter` + `difflib`), a regex rule table + Naive-Bayes-style fallback for error translation, and a tiny n-gram/Markov model for "did you mean"/autocomplete, trained on this workspace's own docstrings + Markdown | `backend/nlp_tools.py` |
| 5 | New endpoints: `GET /workspace/search/fuzzy`, `GET /workspace/explain-error`, `GET /workspace/search/suggest` | `backend/app.py` |
| 5 | `backend/tests/test_nlp_tools.py` — 30 tests covering tokenizer, fuzzy ranking, error-rule matching + fallback classifier, n-gram model, corpus building | `backend/tests/test_nlp_tools.py` |
| 5 | `backend/tests/test_app.py` — 12 new tests for the three endpoints above (400s, typo-tolerance, empty-workspace edge case) | `backend/tests/test_app.py` |

## Not started

### Stage 4 remainder — not covered by the backend test suite

Two items from the original Stage 4 scope are still open; they were
deferred rather than dropped:

- [ ] Rebuild `out/vs` so the committed snapshot matches source, or
      stop committing a compiled snapshot on `application` at all and
      only freeze one on `main`.
- [ ] Smoke test for `extensions/arklight-fs` against a running
      `backend/app.py`. Deferred because it needs the real VS Code
      extension-host test harness (`@vscode/test-web` or similar) —
      the provider is typed against `vscode.Uri`/`vscode.FileSystemError`,
      which aren't available as a plain Node import the way Flask's
      test client is for the backend.

### Stage 5 remainder — not yet done

Core Stage 5 tooling landed (see Done, above). Two things from the
original scope are still open:

- [ ] `/workspace/search` ranking boost: score candidate lines by
      n-gram overlap with the query (`nlp_tools.ngram_overlap_score`
      already exists and is unit-tested) on top of the existing plain
      substring match. Left out of the endpoint itself for now to
      avoid changing `/workspace/search`'s existing response
      ordering/behavior without a client that actually needs it.
- [ ] Extend the fuzzy-search index to (optionally) cover exported
      symbol names, not just file/dir paths — needs a lightweight way
      to extract symbols without a full language server (see the
      Backlog item below, which is the same underlying need).
- [ ] Commit-message corpus for the n-gram model (`git log`) in
      addition to docstrings + Markdown — skipped because
      `WORKSPACE_ROOT` isn't guaranteed to be a git repo, and
      shelling out to git from the backend felt like scope creep for
      a "small, dependency-free tooling" stage.

### Stage 6 — Backend hardening

- [ ] Token-based auth (shared bearer token via env var, minimum bar)
      before this is ever reachable from outside localhost.
- [ ] Replace poll-based `/workspace/watch` with real filesystem
      notifications (`watchdog` / inotify) — the current 1s re-walk
      is fine for a small workspace, not for a large one.
- [ ] `.gitignore`-aware listing/search instead of the fixed
      `NOISE_DIRS` set (`.git`, `node_modules`, `__pycache__`).
- [ ] Rate limiting / basic abuse protection on write endpoints.

### Stage 7 — Editor experience

- [ ] Terminal integration — a PTY bridge, the natural next "extend
      from here" the backend docstring already gestures at.
- [ ] Diagnostics passthrough or a minimal language server, since the
      language-server extensions were pruned in Stage 0.
- [ ] Multi-root workspace support (multiple `WORKSPACE_ROOT`s / multiple
      `arklight://` mounts) instead of one global root.

### Stage 8 — Deployment

- [ ] Dockerfile + compose serving the backend and the compiled
      workbench together.
- [ ] Optional persistent auth/user layer if this becomes multi-user.
- [ ] Deployment docs (env vars, reverse-proxy notes for the SSE
      endpoint specifically — some proxies buffer SSE by default and
      need `proxy_buffering off` / equivalent).

## Backlog — unstaged ideas

Candidates worth revisiting once the stages above are further along;
not yet assigned a stage because they need more thought about
scope or aren't blocking anything else:

- **Command-palette-style fuzzy jump-to-file**, reusing the Stage 5
  fuzzy-search index instead of building a second one.
- **Workspace symbol index** (function/class names, not just file
  names) — a natural extension of the Stage 5 inverted index once
  there's a lightweight way to extract symbols without a full
  language server.
- **Offline search-query autocomplete** in the command palette,
  reusing the Stage 5 n-gram model instead of a network call.
- **Structured backend audit log** (who/what/when for every write) —
  cheap to add once Stage 6 auth exists, useful even for a single
  user as an undo-adjacent safety net.
- **Read-only "review" mode surfaced in the UI**, not just enforced
  server-side (`ARKLIGHT_READONLY` currently just 403s; the workbench
  doesn't yet reflect that state visually).
