# Trimming this checkout down to what ARKlight IDE needs

Ground rule: `src/vs/**` is one TypeScript project. Deleting files inside
it risks dangling imports and a broken compile. Everything in this plan
targets self-contained folders instead (`extensions/*`, `test/`,
`.vscode/extensions/*`, `remote/`, `cli/`) — nothing under `src/`.

Do this in batches, rebuild after each one, and only move to the next
batch once the rebuild is clean. If a batch breaks the build,
`git checkout -- .` to revert that batch and stop there — don't guess
at a fix, come back and figure out why first.

Verify command after every batch:

```bash
npm install
npm run compile-client
npm run compile-web
./scripts/code-web.sh
```

Confirm `localhost:8080` still boots the workbench chrome (activity
bar, empty explorer, editor area) with no new console errors before
committing that batch.

## Batch 1 — zero relevance to ARKlight

```bash
cd extensions
rm -rf copilot git git-base github github-authentication \
       microsoft-authentication debug-auto-launch debug-server-ready \
       grunt gulp jake npm notebook-renderers ipynb terminal-suggest \
       tunnel-forwarding vscode-api-tests vscode-colorize-tests \
       vscode-colorize-perf-tests vscode-test-resolver
cd ..
```

## Batch 2 — language-server extensions (client+server processes)

None of these are needed since ARKlight isn't editing JS/TS/HTML/CSS/
JSON with LSP-backed features -- these are the heaviest of the bunch.

```bash
cd extensions
rm -rf typescript-language-features html-language-features \
       css-language-features json-language-features php-language-features
cd ..
```

## Batch 3 — docs/preview extensions

`mermaid-markdown-features` is the one that was already throwing
`CANNOT use 'legacyToolReferenceFullNames'` in the console log during
Stage 0 verification -- one more reason this batch is safe to cut.

```bash
cd extensions
rm -rf markdown-language-features markdown-math mermaid-markdown-features \
       extension-editing configuration-editing
cd ..
```

## Batch 4 — internal dev-tooling, not part of the shipped product

```bash
rm -rf .vscode/extensions/vscode-extras \
       .vscode/extensions/vscode-pr-pinger \
       .vscode/extensions/vscode-selfhost-import-aid \
       .vscode/extensions/vscode-selfhost-test-provider
rm -rf test
```

## Batch 5 — lower confidence, try last

Not verified the way the batches above were -- these *might* be
referenced by a gulp task even when unused at runtime.

```bash
rm -rf remote
rm -rf cli
```

If this batch breaks `compile-client` or `compile-web`, revert just
this batch (`git checkout -- remote cli`) and leave both in place --
it's not worth chasing further for an MVP.

## Deliberately kept, and why

- `extensions/python` -- syntax highlighting for the files ARKlight
  actually compiles.
- `extensions/theme-defaults` -- need at least one theme; every other
  `theme-*` folder is a fine cut if you want a leaner tree, but costs
  little to leave.
- `extensions/simple-browser` -- genuinely useful later: previewing
  ARKlight's compiled HTML output inline.
- `extensions/media-preview` -- low-cost, useful for previewing image
  assets referenced by a compiled site.

Everything else not named above (other language grammars like `go`,
`rust`, `java`, etc.) is cheap grammar-only weight, not a process or a
server. Remove them if you want minimal footprint; they aren't costing
you the way the language-server extensions or `copilot` were.
