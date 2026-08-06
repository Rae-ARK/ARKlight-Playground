# ARKlight IDE — Bare-Bones MVP Plan

Living plan for the smallest thing that proves "Code OSS web workbench
+ Flask + arklight compiler" actually works end to end. Each stage has
a Definition of Done. Do not start a stage until the previous one's DoD
is checked off — the whole point of staging this is to find out where
it breaks before sinking time into the next layer.

## Scope freeze

**In:**
- Single user, single project, local machine only. No auth, no
  accounts, no multi-tenancy.
- One virtual workspace folder (`arklight:/project`) backed entirely
  by the Flask process — nothing touches the real filesystem except
  Flask itself.
- Editing `.py` site files, triggering a build, seeing the compiled
  output (or the compile error).
- Text editor, file explorer, command to run `arklight build`, a way
  to view the result.

**Out (for MVP — revisit later, not now):**
- Terminal, tasks, debugger.
- Extension Marketplace / extension gallery.
- User data sync, telemetry, secret storage, update checks,
  authentication providers, tunneling.
- `pack` / `unpack` / `.ark` bundles, PWA mode, `arklight new` scaffold
  templates.
- Multi-file drag/drop, multi-root workspaces, anything resembling
  workspace trust prompts.

If a stage tempts you to build one of the "Out" items to make
something else feel nicer, don't. Note it and move on.

---

## Stage 0 — Confirm the two halves independently

**Goal:** no integration yet. Prove each half works alone.

- [ ] `arklight` installs (`pip install -e .`) and `arklight build
      site.py -o ARK` works from a plain terminal on a throwaway
      example site.
- [ ] Trimmed `product.json` (no `extensionsGallery` key) + the stock
      `workbench.web.main.ts` boots in a browser with **no**
      `workspaceProvider` supplied at all — confirms the empty-window
      fallback (`UNKNOWN_EMPTY_WINDOW_WORKSPACE`) actually renders and
      nothing throws.

**DoD:** a compiled site sitting on disk from the CLI, and a blank
Code OSS shell loading in a tab, on the same day, with zero wiring
between them yet.

---

## Stage 1 — Flask backend: the entire contract, nothing else

**Goal:** every file operation and every compiler action the frontend
will ever call, callable directly with `curl` first — before any
browser code exists.

Wraps the compiler's existing entry points directly rather than
re-implementing anything:
- `arklight.compiler.pipeline.build(entry, output)` → `BuildResult`
  (raises `CompileError` on failure)
- later, if/when `pack`/`unpack` come back into scope:
  `arklight.packer.bundle.pack` / `unpack` (raise `PackError`)

Project state for the MVP is just a directory on disk that Flask
owns (e.g. a temp dir per run) — no database, no session model.

Endpoints:
- `GET  /api/files` — list of paths in the project dir
- `GET  /api/file/<path>` — file contents
- `PUT  /api/file/<path>` — overwrite file contents
- `POST /api/build` — runs `build()` against the project's entry file,
  returns either the list of written paths + a preview URL, or the
  `CompileError` message with whatever position/line info it carries

**DoD:** you can `curl` your way through writing a small site,
building it, and fetching the resulting HTML, without a browser
involved.

---

## Stage 2 — The virtual filesystem, wired to Stage 1

**Goal:** the workbench reads and writes real files through Flask.

- [ ] `workspaceProvider` supplied at construction, pointing at
      `arklight:/project` (a `IFolderToOpen`, not a real disk path).
- [ ] One bundled web extension — no Marketplace involved, it ships
      with the app — whose `browser` entry point calls
      `vscode.workspace.registerFileSystemProvider('arklight', ...)`.
      Its `readFile`/`writeFile`/`readDirectory` are `fetch()` calls
      against the Stage 1 endpoints.

**DoD:** open the app, the explorer shows the project's real files
(served by Flask), you can open one, edit it, save it, and confirm
via `curl` on the backend that the bytes on disk actually changed.

---

## Stage 3 — One command: Build

**Goal:** the only "IDE feature" this MVP needs.

- [ ] Same extension registers one command, `arklight.build`, that
      POSTs to `/api/build`.
- [ ] Success → open the returned preview HTML (a Webview pointed at
      a Flask-served static route is enough; no need for a real
      dev-server proxy yet).
- [ ] Failure → surface `CompileError`'s message as a VS Code error
      notification. No custom diagnostics/squiggles yet — that's a
      later nicety, not MVP.
- [ ] Wire this to a keybinding or a single button in the UI (a
      status bar item is the least amount of new UI to build).

**DoD:** edit a site file, save, hit Build, see either the rendered
page or a legible error, with no other panel, view, or menu in the
product doing anything.

---

## Stage 4 — Call it done, then decide what's next

At this point you have: edit → save → build → see result, running
entirely on Code OSS's web workbench plus one small extension plus
one small Flask app, with everything in the "Out" list still absent
and un-missed.

Only after this loop is genuinely solid should any "Out" item get
promoted back into scope — and each one should get argued for on its
own, the same way this MVP was: what's the smallest version, what's
the Definition of Done, what does it cost if it's wrong.
