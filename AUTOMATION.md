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

## Still open (not yet done as of this log)

- [ ] `workspaceProvider` pointing at a virtual `arklight:/project`
      folder (Stage 2 of the staged plan, not started).
- [ ] The bundled web extension registering a FileSystemProvider
      backed by the Flask backend (also Stage 2).
- [ ] Pruning per `PRUNE-PLAN.md` -- do this after Stage 0 is
      committed as a known-good baseline, one batch at a time, with a
      rebuild-and-verify after each batch.
