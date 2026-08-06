# Building `app/` — the static workbench bundle

Stage 1 of the Tauri port (`src-tauri/`) does not talk to Node,
Python, or any server at runtime. It loads a plain folder of static
files: `app/`, sitting next to `src-tauri/` at the repo root.
`app/` is **generated, not committed** (it's in `.gitignore` — see
below) — regenerate it whenever you rebase `application` onto a
newer VS Code and want the shell to pick it up.

## Why this and not `out/vs`

`out/vs` (the compiled snapshot on `main`, also present on
`application`) is AMD-module output meant to be served dynamically —
`scripts/code-web.sh` is a small Node dev server that resolves those
modules on request and injects an HTML shell around them. Pointing
Tauri straight at `out/vs` doesn't work; there's no `index.html` in
it (see for yourself: `find out/vs -iname '*.html'` turns up nothing
but editor-internals test fixtures).

The real static target is a separate gulp task, `vscode-web`
(`build/gulpfile.vscode.web.ts`), which esbuild-bundles everything —
workbench chrome, Monaco, the works — into one self-contained folder
with a real `index.html`. That's the artifact this port actually
wants: no loader, no dev server, no Node process needed once it
exists on disk.

## Steps

Run this from the **`application` branch** (needs the full source
tree; `main` won't have it), with a Node toolchain matching
`.nvmrc`:

```bash
git checkout application
npm ci                       # one-time, this is the whole VS Code monorepo -- expect it to take a while and use real disk/RAM
npm run gulp vscode-web      # unminified, faster iteration; use vscode-web-min for a release-sized bundle
```

This produces `../vscode-web/` — a **sibling of the repo root**, not
inside it (that's `gulpfile.vscode.web.ts`'s own `BUILD_ROOT =
path.dirname(REPO_ROOT)`, not a mistake to work around).

Copy it into place for Tauri to find, from the repo root:

```bash
cp -r ../vscode-web ./app
```

Then verify there's actually an entry point:

```bash
ls app/index.html   # if this is missing, check app/'s actual entry filename
                     # and update src-tauri/tauri.conf.json's app.windows[0].url to match
```

`src-tauri/tauri.conf.json` already points `frontendDist` at `../app`
and the window `url` at `index.html` — if the real bundle uses a
different entry filename, that's the one line to fix.

## What you get

An `app/` you can open in a plain browser (`python3 -m http.server`
from inside it, or any static file server) and see the *exact* thing
Tauri will show — that's the fastest way to sanity-check the bundle
before ever touching Rust or `cargo tauri dev`. If it looks right in
a browser tab and wrong in the Tauri window, the bug is in
`tauri.conf.json`, not the bundle.

## `.gitignore`

```
/app/
```

`app/` is a build artifact, and a large one (bundled/minified VS
Code is not small even pruned) — it doesn't belong in git history
any more than `node_modules/` or `out/` do. Regenerate it per
checkout.
