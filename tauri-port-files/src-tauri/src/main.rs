// Stage 1: the dumbest thing that could work — revised.
//
// Earlier version of this file pointed the window at localhost:8080
// (scripts/code-web.sh) plus a separately-running Flask backend on
// :5000. That meant Node *and* Python had to be resident processes
// just to look at the workbench chrome, which is the opposite of
// what this port is for.
//
// This version has no runtime dependency on either. `app/` (see
// docs/BUILD-WEB-BUNDLE.md) is a self-contained static bundle --
// index.html plus esbuild-bundled JS/CSS, produced once from the
// `application` branch via `npm run gulp vscode-web`. Tauri serves
// it directly (see tauri.conf.json's frontendDist); there is no
// server process, dev or otherwise, at runtime.
//
// Still zero #[tauri::command]s. Opening this window gets you the
// workbench chrome with no workspace open -- same as vscode.dev with
// no folder -- which is the entire scope of Stage 1. Real files
// (a Rust fs backend, arklight-fs rewired to call it, an actual
// compiler invocation) are Stage 2+. See docs/TAURI-ROADMAP.md.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running arklight-playground tauri application");
}
