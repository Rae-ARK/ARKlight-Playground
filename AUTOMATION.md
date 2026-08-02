# Build automation log -- Stage 0 (frontend half)

Living record of the exact commands that got this checkout from a
fresh clone to a booting workbench at `localhost:8080`. Written the
same way ARKlight's own `PROGRESS.md` tracks state: what's done, in
what order, and what each step actually depends on -- update this file
whenever the sequence changes, not just at milestones.

## System dependencies

Needed before `npm install` because several of vscode's native modules
(`node-pty`, `native-keymap`, etc.) compile against system libraries at
install time:

```bash
sudo apt-get update
sudo apt-get install -y libxkbfile-dev libx11-dev libsecret-1-dev libkrb5-dev pkg-config
```

Without these, `npm install` fails on `node-gyp rebuild` with a
`pkg-config` error pointing at whichever library is missing.

## Install and build

```bash
npm install
npm run compile-client   # compiles src/vs/** -- includes workbench.web.main.internal.js
npm run compile-web      # compiles the bundled extensions
```

Two separate tasks on purpose: `compile-web` alone only builds the
`extensions/*` folder. `workbench.web.main.internal.js` -- the file the
browser entry (`src/vs/code/browser/workbench/workbench.ts`) actually
imports -- only gets produced by `compile-client`'s `compile-src` step.
Running `compile-web` alone will boot a blank white page with 404s for
`workbench.web.main.internal.js`/`.css` in the console; that was the
exact failure hit before this was understood.

`compile-client` is the slow one (~3.5-4 min); `compile-web` is fast
(~1 min) since it's extensions only.

## Serve and verify

```bash
./scripts/code-web.sh
```

Prints a local URL (`http://localhost:8080` in practice). Open it and
check for the workbench chrome -- activity bar, empty explorer, editor
area -- not a blank page.

## Console output that's expected and NOT a problem

These appeared during verification and are normal for a plain-HTTP
local dev server with no `workspaceProvider`/`remoteAuthority`
configured:

- `The web worker extension host is started in a same-origin iframe`
- Repeated `Feature Policy: Skipping unsupported feature name "..."`
  lines (usb/hid/cross-origin-isolated/local-network-access)
- `An iframe which has both allow-scripts and allow-same-origin ...`
- `Ignoring fetching additional builtin extensions from gallery as it
  is disabled` -- this one actually confirms the trimmed `product.json`
  (no `extensionsGallery` key) is working as intended.
- `[AgentHost:remote] Disabled via configuration...` /
  `[AccountPolicyGate] apply: state=inactive...` -- informational,
  agent-host/Copilot related, expected with nothing configured.

## Console output that WAS a real problem (fixed, kept for reference)

- `GET .../workbench.web.main.internal.js` -> 404, then
  `NS_ERROR_CORRUPTED_CONTENT` / blocked for disallowed MIME type
  `text/plain`. Root cause: only `compile-web` had been run, not
  `compile-client`. Fixed by running `compile-client` first (see
  above).

## product.json changes from stock Code - OSS

Only branding fields changed -- `nameShort`, `nameLong`,
`applicationName`, `dataFolderName`, `urlProtocol`. No
`extensionsGallery` key is set; stock Code - OSS doesn't set one
either, so Marketplace was already off by default before this repo
existed -- nothing was suppressed that wasn't already absent.

## Branch state (added after Stage 0/pruning)

Pruning per `PRUNE-PLAN.md` is done -- all batches through 7, plus a
themes cut not in the original plan. After the last batch, `main` was
further collapsed to a single commit containing only compiled `out/vs`
output, with the full source tree removed entirely (not just pruned).
That was a deliberate "freeze a working artifact" checkpoint, but it
means `main` can no longer `npm install` / `compile-client` / build
anything -- it's a static snapshot only.

The buildable source tree (everything this file's commands operate on)
was restored on a separate `application` branch, alongside the same
`out/vs`. All further work, including the items below, happens on
`application`. Don't extend `main`.

The Flask backend (`backend/app.py`) exists and is now fully wired
into the workbench: `extensions/arklight-fs` registers a
FileSystemProvider for the `arklight://` scheme backed by the API,
and `src/vs/code/browser/workbench/workbench.ts` defaults to opening
`arklight:/project` when no explicit folder/workspace is configured.
See `backend/README.md` and `ROADMAP.md`.

## Done since this log was written

- [x] `workspaceProvider` pointing at a virtual `arklight:/project`
      folder (Stage 2).
- [x] The bundled web extension (`arklight-fs`) registering a
      FileSystemProvider backed by the Flask backend.
- [x] SSE-based file watching (`GET /workspace/watch`), optimistic-
      concurrency writes (`If-Unmodified-Since-Mtime`), and file/text
      search providers (Stage 3).

**Rebuild reminder:** `out/vs` in this branch was compiled *before*
Stage 2/3, so it does not contain `arklight-fs`. Re-run
`compile-client` + `compile-web` after any change to
`extensions/arklight-fs` or `backend/app.py`'s contract before
trusting a served build.

## Done since this log was written (Stage 4)

- [x] `backend/app.py` refactored to an application-factory pattern
      (`create_app(...)`) — no endpoint behavior changed, but it's now
      possible to spin up isolated instances against a tmp workspace
      with the background watch-poller disabled, instead of every
      import touching disk and spawning a thread.
- [x] `backend/tests/test_app.py` — 36 tests: CRUD lifecycle,
      path-escape rejection, rename/copy edge cases (missing source,
      existing destination), the `412` optimistic-concurrency
      conflict path, and `ARKLIGHT_READONLY` behavior. Run with
      `python -m unittest discover -s tests -v` from `backend/`.
- [x] Fixed a real bug the refactor surfaced: the old module built
      `app = create_app()` at import time, so merely importing
      `app.py` (as the test suite does) created a `./workspace`
      directory and started the watch-poller thread as a side effect.
      App construction now only happens inside `if __name__ ==
      "__main__":`.

## Still open

See `ROADMAP.md` for the current staged plan (Stage 5 onward) --
stdlib-only statistical tooling (fuzzy search, human-readable
errors), backend hardening (auth, real filesystem-event watching),
and editor features (terminal, multi-root workspaces).
