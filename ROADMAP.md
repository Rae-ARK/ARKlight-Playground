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

## Not started

### Stage 4 — Correctness & hygiene

The prerequisite for everything below: right now `out/vs` (the
compiled snapshot committed alongside source on `application`) predates
Stage 2/3, so a naive "just serve `out/vs`" misses the whole ARKlight
filesystem layer. This stage is bookkeeping, not features:

- [ ] Rebuild `out/vs` so the committed snapshot matches source, or
      stop committing a compiled snapshot on `application` at all and
      only freeze one on `main`.
- [ ] Test suite for `backend/app.py`: path-escape rejection, the
      `412` conflict path, rename/copy edge cases (missing source,
      existing destination), `ARKLIGHT_READONLY` behavior.
- [ ] Smoke test for `extensions/arklight-fs` against a running
      `backend/app.py` (spin up Flask, exercise the provider).

### Stage 5 — Small, dependency-free tooling (stdlib-only statistics, not ML)

Goal: a handful of small, auditable helpers built entirely on the
Python standard library (`difflib`, `collections`, `re`, `math`,
`random`, `string`) — no numpy, no torch, no external model weights.
These are the same category of technique 1990s/2000s-era chatbots and
search tools used before neural nets were practical to run locally:
frequency counting, Markov chains, bag-of-words, edit distance,
hand-authored pattern/response rules. Framed here as small developer-
tooling utilities, not a general chatbot.

- [ ] **Fuzzy component/file search.** An inverted index over file
      names, paths, and (optionally) exported symbol names, built
      with `collections.Counter` for term frequency and
      `difflib.get_close_matches` / `difflib.SequenceMatcher` for
      typo-tolerant ranking. No embeddings, no vector DB — a bag-of-
      words score plus edit-distance fallback is enough for "find
      the file I'm thinking of" in a codebase-sized workspace, and it
      runs instantly with zero setup.
- [ ] **Human-readable error translation.** A small table of
      `(regex pattern -> template)` rules — the same shape as
      ELIZA's substitution rules — that turns raw backend/filesystem
      errors (`OSError: [Errno 13] Permission denied`, the backend's
      `409 file already exists`, a `412` concurrency conflict) into a
      plain-English terminal message with a suggested next action.
      A small `collections.Counter`/`math.log`-based Naive-Bayes-style
      classifier (word counts, no external corpus needed beyond the
      rule table itself) can pick the right template when a raw
      message doesn't match a rule exactly.
- [ ] **Old-school "chatbot" tricks, repurposed for dev tooling.**
      A tiny n-gram/Markov model (`collections.defaultdict(list)` +
      `random.choice`) trained on nothing fancier than this repo's
      own docstrings, commit messages, and README content, used for:
      - Search-query autocomplete / "did you mean" suggestions,
        instead of chit-chat generation.
      - A `/workspace/search` ranking boost: score candidate lines by
        n-gram overlap with the query, on top of the existing plain
        substring match.
      Explicitly scoped as a nostalgia-flavored utility layer, not an
      attempt at a real assistant — the value is that it's fast,
      dependency-free, fully inspectable, and works offline.
- [ ] Expose these as new backend endpoints (e.g.
      `GET /workspace/search/fuzzy?q=...`,
      `GET /workspace/explain-error?code=...`) so the extension (or
      any other client) can call them the same way it calls the
      existing file API, rather than baking the logic into the
      extension itself.

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
