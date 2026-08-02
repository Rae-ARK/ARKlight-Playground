"""
ARKlight backend — workspace file API.

Exposes just enough REST surface for a browser-based Code OSS workbench
FileSystemProvider to list, stat, read, write, rename, copy, and search
files against a real directory on disk. Intentionally small: no auth,
no terminals, no compiler integration. Extend from here.

Run:
    pip install -r requirements.txt
    WORKSPACE_ROOT=/path/to/project python app.py

Env vars:
    WORKSPACE_ROOT      root directory this API serves (default ./workspace)
    PORT                default 5000
    DEBUG               set to "1" for Flask debug mode
    ARKLIGHT_READONLY   set to "1" to disable all write/delete/rename/copy
    ARKLIGHT_MAX_READ_BYTES  max file size servable by GET (default 20MB)
    ARKLIGHT_WATCH_POLL_INTERVAL  seconds between /workspace/watch polls (default 1.0)

Endpoints:
    GET    /workspace/files                -> full recursive file/dir listing
    GET    /workspace/dir/<path>           -> single-level directory children
    POST   /workspace/dir/<path>           -> create directory
    GET    /workspace/stat/<path>          -> metadata (type, size, mtime)
    GET    /workspace/file/<path>          -> read file content
    PUT    /workspace/file/<path>          -> write file content
    POST   /workspace/file/<path>          -> create empty file
    DELETE /workspace/file/<path>          -> delete file
    PATCH  /workspace/file/<path>          -> rename/move (JSON: {"newPath": ...})
    POST   /workspace/copy                 -> copy file/dir (JSON: {"from": ..., "to": ...})
    GET    /workspace/search?q=...         -> text search across files
    GET    /workspace/search/fuzzy?q=...   -> typo-tolerant path search (Stage 5)
    GET    /workspace/explain-error?message=... -> plain-English error translation (Stage 5)
    GET    /workspace/search/suggest?q=... -> "did you mean" + n-gram autocomplete (Stage 5)
    GET    /workspace/watch                -> SSE stream of file-change events
    GET    /healthz                        -> liveness

Structure note (Stage 5):
    /workspace/search/fuzzy, /workspace/explain-error, and
    /workspace/search/suggest are stdlib-only (no numpy/torch/external
    model weights) helpers implemented in nlp_tools.py -- see
    ROADMAP.md for scope and nlp_tools.py's module docstring for how
    each one works.

Structure note (Stage 4):
    Everything lives behind create_app() now (an application-factory,
    standard Flask practice) instead of module-level globals. This is
    what lets tests/test_app.py spin up isolated instances against a
    tmp_path workspace, in read-only or read-write mode, with the
    background watch-poller optionally disabled, without needing to
    reload the module or touch a real directory. `python app.py` still
    behaves exactly as before -- create_app() with no arguments reads
    the same env vars the old module-level code did.
"""

import json
import os
import queue
import shutil
import threading
import time
from pathlib import Path

from flask import Flask, jsonify, request, abort, Response
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from nlp_tools import (
    build_corpus,
    build_ngram_model,
    did_you_mean,
    explain_error,
    fuzzy_search,
    generate_from_model,
    tokenize,
)

# directories skipped everywhere we walk the tree (listing, search, watch)
NOISE_DIRS = {".git", "node_modules", "__pycache__"}


def create_app(
    workspace_root: "str | Path | None" = None,
    readonly: "bool | None" = None,
    max_read_bytes: "int | None" = None,
    watch_poll_interval: "float | None" = None,
    start_watcher: bool = True,
) -> Flask:
    """
    Build a configured Flask app instance.

    All arguments default to the same environment variables the module
    used to read at import time; passing them explicitly (as the test
    suite does) overrides the environment for that instance only, and
    never touches process-wide state.
    """
    root = Path(
        workspace_root
        if workspace_root is not None
        else os.environ.get("WORKSPACE_ROOT", "./workspace")
    ).resolve()
    root.mkdir(parents=True, exist_ok=True)

    config_readonly = (
        readonly if readonly is not None else os.environ.get("ARKLIGHT_READONLY") == "1"
    )
    config_max_read_bytes = (
        max_read_bytes
        if max_read_bytes is not None
        else int(os.environ.get("ARKLIGHT_MAX_READ_BYTES", 20 * 1024 * 1024))
    )
    config_watch_poll_interval = (
        watch_poll_interval
        if watch_poll_interval is not None
        else float(os.environ.get("ARKLIGHT_WATCH_POLL_INTERVAL", "1.0"))
    )

    app = Flask(__name__)
    # the workbench runs on a different origin (localhost:PORT vs file/webview);
    # X-Mtime has to be explicitly exposed or browser JS can't read it off the response
    CORS(app, expose_headers=["X-Mtime"])

    app.config["WORKSPACE_ROOT"] = root
    app.config["READONLY"] = config_readonly
    app.config["MAX_READ_BYTES"] = config_max_read_bytes
    app.config["WATCH_POLL_INTERVAL"] = config_watch_poll_interval

    @app.errorhandler(HTTPException)
    def handle_http_exception(err):
        """Return JSON instead of Flask's default HTML error pages."""
        return jsonify({"error": err.name, "message": err.description}), err.code

    def _resolve(relative_path: str) -> Path:
        """
        Resolve a client-supplied relative path against WORKSPACE_ROOT,
        rejecting any attempt to escape the workspace directory.
        """
        ws_root = app.config["WORKSPACE_ROOT"]
        candidate = (ws_root / relative_path).resolve()
        if ws_root not in candidate.parents and candidate != ws_root:
            abort(400, description="path escapes workspace root")
        return candidate

    def _require_write_access():
        if app.config["READONLY"]:
            abort(403, description="backend is running in read-only mode")

    def _stat_entry(path: Path, rel: str) -> dict:
        st = path.stat()
        return {
            "path": rel,
            "type": "directory" if path.is_dir() else "file",
            "size": st.st_size,
            "mtime": st.st_mtime,
            "ctime": st.st_ctime,
        }

    watch_lock = threading.Lock()
    watch_subscribers = []  # type: list[queue.Queue]

    # Stage 5: lazily-built, per-app-instance cache for the n-gram/
    # "did you mean" corpus. Built once on first use from this app's own
    # WORKSPACE_ROOT (docstrings + Markdown), not at import/creation
    # time, since walking the tree is real (if bounded) I/O work that a
    # bare `create_app()` shouldn't do just to exist.
    suggest_lock = threading.Lock()
    suggest_cache = {"corpus": None, "model": None, "vocab": None}

    def _get_suggest_corpus():
        with suggest_lock:
            if suggest_cache["corpus"] is None:
                corpus = build_corpus(app.config["WORKSPACE_ROOT"], noise_dirs=NOISE_DIRS)
                suggest_cache["corpus"] = corpus
                suggest_cache["model"] = build_ngram_model(corpus, n=2) if corpus else {}
                suggest_cache["vocab"] = sorted(set(tokenize(corpus)))
            return suggest_cache["model"], suggest_cache["vocab"]

    def _walk_snapshot() -> dict:
        """path -> (kind, mtime) for every file/dir under WORKSPACE_ROOT."""
        ws_root = app.config["WORKSPACE_ROOT"]
        snapshot = {}
        for root_dir, dirs, files in os.walk(ws_root):
            dirs[:] = [d for d in dirs if d not in NOISE_DIRS]
            rel_root = Path(root_dir).relative_to(ws_root)
            for d in dirs:
                p = str(rel_root / d) if str(rel_root) != "." else d
                try:
                    snapshot[p] = ("directory", (Path(root_dir) / d).stat().st_mtime)
                except OSError:
                    continue
            for f in files:
                p = str(rel_root / f) if str(rel_root) != "." else f
                try:
                    snapshot[p] = ("file", (Path(root_dir) / f).stat().st_mtime)
                except OSError:
                    continue
        return snapshot

    def _publish(event: dict) -> None:
        with watch_lock:
            subscribers = list(watch_subscribers)
        for q in subscribers:
            q.put(event)

    def _watch_poll_loop() -> None:
        """
        Background thread: periodically re-walks WORKSPACE_ROOT and diffs against
        the previous snapshot to synthesize created/changed/deleted events. Simple
        on purpose -- a real filesystem-notification backend (inotify/watchdog)
        is the natural next step once this contract is proven out (see ROADMAP.md).
        """
        previous = _walk_snapshot()
        while True:
            time.sleep(app.config["WATCH_POLL_INTERVAL"])
            try:
                current = _walk_snapshot()
            except OSError:
                continue

            for path, (kind, mtime) in current.items():
                if path not in previous:
                    _publish({"type": "created", "path": path, "kind": kind})
                elif previous[path][1] != mtime:
                    _publish({"type": "changed", "path": path, "kind": kind})
            for path, (kind, _mtime) in previous.items():
                if path not in current:
                    _publish({"type": "deleted", "path": path, "kind": kind})

            previous = current

    @app.route("/workspace/watch", methods=["GET"])
    def watch():
        """
        Server-Sent Events stream of filesystem change events, polled every
        WATCH_POLL_INTERVAL seconds (default 1s). Each event is a JSON
        object: {"type": "created"|"changed"|"deleted", "path": ..., "kind": "file"|"directory"}.
        """
        client_queue: "queue.Queue[dict]" = queue.Queue()
        with watch_lock:
            watch_subscribers.append(client_queue)

        def stream():
            try:
                yield "retry: 2000\n\n"
                while True:
                    event = client_queue.get()
                    yield f"data: {json.dumps(event)}\n\n"
            finally:
                with watch_lock:
                    if client_queue in watch_subscribers:
                        watch_subscribers.remove(client_queue)

        return Response(stream(), mimetype="text/event-stream")

    @app.route("/workspace/files", methods=["GET"])
    def list_files():
        ws_root = app.config["WORKSPACE_ROOT"]
        entries = []
        for root_dir, dirs, files in os.walk(ws_root):
            dirs[:] = [d for d in dirs if d not in NOISE_DIRS]
            rel_root = Path(root_dir).relative_to(ws_root)
            for d in dirs:
                p = str(rel_root / d) if str(rel_root) != "." else d
                entries.append({"path": p, "type": "directory"})
            for f in files:
                p = str(rel_root / f) if str(rel_root) != "." else f
                entries.append({"path": p, "type": "file"})
        return jsonify(entries)

    @app.route("/workspace/dir/<path:relative_path>", methods=["GET"], strict_slashes=False)
    @app.route("/workspace/dir", methods=["GET"], defaults={"relative_path": ""}, strict_slashes=False)
    def list_dir(relative_path):
        """
        Single-level listing of one directory's immediate children. This is
        what a lazily-expanding file explorer should call instead of
        /workspace/files, which walks the entire tree every time.
        """
        ws_root = app.config["WORKSPACE_ROOT"]
        target = _resolve(relative_path)
        if not target.is_dir():
            abort(404, description="directory not found")
        entries = []
        for child in sorted(target.iterdir()):
            if child.name in NOISE_DIRS:
                continue
            rel = str(child.relative_to(ws_root))
            entries.append(_stat_entry(child, rel))
        return jsonify(entries)

    @app.route("/workspace/dir/<path:relative_path>", methods=["POST"])
    def create_dir(relative_path):
        _require_write_access()
        target = _resolve(relative_path)
        target.mkdir(parents=True, exist_ok=True)
        return jsonify({"path": relative_path, "status": "created"}), 201

    @app.route("/workspace/stat/<path:relative_path>", methods=["GET"])
    def stat_path(relative_path):
        target = _resolve(relative_path)
        if not target.exists():
            abort(404, description="path not found")
        return jsonify(_stat_entry(target, relative_path))

    @app.route("/workspace/file/<path:relative_path>", methods=["GET"])
    def read_file(relative_path):
        target = _resolve(relative_path)
        if not target.is_file():
            abort(404, description="file not found")
        size = target.stat().st_size
        max_bytes = app.config["MAX_READ_BYTES"]
        if size > max_bytes:
            abort(413, description=f"file exceeds {max_bytes} byte read limit")
        # Always return raw bytes with a best-guess content type. Deciding
        # text-vs-binary client-side (as the previous version did server-side
        # by attempting a UTF-8 decode) is more predictable for a
        # FileSystemProvider, which always wants a Uint8Array anyway.
        response = Response(target.read_bytes(), mimetype="application/octet-stream")
        response.headers["X-Mtime"] = str(target.stat().st_mtime)
        return response

    @app.route("/workspace/file/<path:relative_path>", methods=["PUT"])
    def write_file(relative_path):
        _require_write_access()
        target = _resolve(relative_path)

        # Optimistic concurrency: a client that previously read/stat'd this file
        # can send back the mtime it saw. If the file has since changed on disk,
        # reject the write instead of silently clobbering someone else's edit.
        expected_mtime_header = request.headers.get("If-Unmodified-Since-Mtime")
        if expected_mtime_header is not None and target.exists():
            try:
                expected_mtime = float(expected_mtime_header)
            except ValueError:
                expected_mtime = None
            if expected_mtime is not None and abs(target.stat().st_mtime - expected_mtime) > 1e-6:
                return jsonify({
                    "error": "Conflict",
                    "message": "file changed on disk since it was last read",
                    "currentMtime": target.stat().st_mtime,
                }), 412

        target.parent.mkdir(parents=True, exist_ok=True)
        body = request.get_data()
        target.write_bytes(body)
        return jsonify({
            "path": relative_path,
            "status": "written",
            "bytes": len(body),
            "mtime": target.stat().st_mtime,
        })

    @app.route("/workspace/file/<path:relative_path>", methods=["POST"])
    def create_file(relative_path):
        _require_write_access()
        target = _resolve(relative_path)
        if target.exists():
            abort(409, description="file already exists")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.touch()
        return jsonify({"path": relative_path, "status": "created"}), 201

    @app.route("/workspace/file/<path:relative_path>", methods=["DELETE"])
    def delete_file(relative_path):
        _require_write_access()
        target = _resolve(relative_path)
        if not target.exists():
            abort(404, description="file not found")
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
        return jsonify({"path": relative_path, "status": "deleted"})

    @app.route("/workspace/file/<path:relative_path>", methods=["PATCH"])
    def rename_file(relative_path):
        """Rename or move a file/directory. Body: {"newPath": "relative/path"}"""
        _require_write_access()
        source = _resolve(relative_path)
        if not source.exists():
            abort(404, description="source not found")
        payload = request.get_json(silent=True) or {}
        new_rel = payload.get("newPath")
        if not new_rel:
            abort(400, description="body must include 'newPath'")
        dest = _resolve(new_rel)
        if dest.exists():
            abort(409, description="destination already exists")
        dest.parent.mkdir(parents=True, exist_ok=True)
        source.rename(dest)
        return jsonify({"from": relative_path, "to": new_rel, "status": "renamed"})

    @app.route("/workspace/copy", methods=["POST"])
    def copy_path():
        """Copy a file or directory. Body: {"from": "relative/path", "to": "relative/path"}"""
        _require_write_access()
        payload = request.get_json(silent=True) or {}
        from_rel = payload.get("from")
        to_rel = payload.get("to")
        if not from_rel or not to_rel:
            abort(400, description="body must include 'from' and 'to'")
        source = _resolve(from_rel)
        dest = _resolve(to_rel)
        if not source.exists():
            abort(404, description="source not found")
        if dest.exists():
            abort(409, description="destination already exists")
        dest.parent.mkdir(parents=True, exist_ok=True)
        if source.is_dir():
            shutil.copytree(source, dest)
        else:
            shutil.copy2(source, dest)
        return jsonify({"from": from_rel, "to": to_rel, "status": "copied"}), 201

    @app.route("/workspace/search", methods=["GET"])
    def search():
        """
        Naive text search across files under WORKSPACE_ROOT. Query param
        'q' is matched as a plain substring per line, case-insensitive.
        Returns at most 200 matches; skips files over MAX_READ_BYTES and
        anything that doesn't decode as UTF-8 (binary files).
        """
        ws_root = app.config["WORKSPACE_ROOT"]
        max_bytes = app.config["MAX_READ_BYTES"]
        query = request.args.get("q", "")
        if not query:
            abort(400, description="missing query param 'q'")
        needle = query.lower()
        matches = []
        limit = 200
        for root_dir, dirs, files in os.walk(ws_root):
            dirs[:] = [d for d in dirs if d not in NOISE_DIRS]
            for fname in files:
                if len(matches) >= limit:
                    break
                fpath = Path(root_dir) / fname
                try:
                    if fpath.stat().st_size > max_bytes:
                        continue
                    text = fpath.read_text(encoding="utf-8")
                except (UnicodeDecodeError, OSError):
                    continue
                rel = str(fpath.relative_to(ws_root))
                for lineno, line in enumerate(text.splitlines(), start=1):
                    column = line.lower().find(needle)
                    if column != -1:
                        matches.append({
                            "path": rel,
                            "line": lineno,
                            "column": column,
                            "text": line[:300],
                        })
                        if len(matches) >= limit:
                            break
            if len(matches) >= limit:
                break
        return jsonify({"query": query, "matches": matches, "truncated": len(matches) >= limit})

    @app.route("/workspace/search/fuzzy", methods=["GET"])
    def search_fuzzy():
        """
        Typo-tolerant search over file/directory paths (not file
        *contents* -- see /workspace/search for that). Scores a
        collections.Counter bag-of-words overlap plus a difflib
        near-miss bonus and whole-string similarity; no embeddings, no
        external index. See ROADMAP.md Stage 5 and nlp_tools.py.
        """
        query = request.args.get("q", "")
        if not query:
            abort(400, description="missing query param 'q'")
        try:
            limit = int(request.args.get("limit", 20))
        except ValueError:
            abort(400, description="'limit' must be an integer")

        ws_root = app.config["WORKSPACE_ROOT"]
        paths = []
        for root_dir, dirs, files in os.walk(ws_root):
            dirs[:] = [d for d in dirs if d not in NOISE_DIRS]
            rel_root = Path(root_dir).relative_to(ws_root)
            for name in dirs + files:
                paths.append(str(rel_root / name) if str(rel_root) != "." else name)

        matches = fuzzy_search(paths, query, limit=limit)
        return jsonify({"query": query, "matches": matches})

    @app.route("/workspace/explain-error", methods=["GET"])
    def explain_error_endpoint():
        """
        Translates a raw backend/filesystem error string (query param
        'message') into a plain-English explanation and a suggested
        next action, via a small (regex pattern -> template) rule table
        with a Naive-Bayes-style fallback for near-misses. See
        ROADMAP.md Stage 5 and nlp_tools.py's ERROR_RULES.
        """
        message = request.args.get("message", "")
        if not message:
            abort(400, description="missing query param 'message'")
        return jsonify(explain_error(message))

    @app.route("/workspace/search/suggest", methods=["GET"])
    def search_suggest():
        """
        'Did you mean' suggestions (difflib.get_close_matches against a
        vocabulary) plus a playful n-gram continuation from a tiny
        Markov model -- both trained on nothing fancier than this
        workspace's own docstrings and Markdown files. Explicitly scoped
        as a nostalgia-flavored autocomplete utility, not a real
        assistant. See ROADMAP.md Stage 5 and nlp_tools.py.
        """
        query = request.args.get("q", "")
        if not query:
            abort(400, description="missing query param 'q'")
        try:
            limit = int(request.args.get("limit", 5))
        except ValueError:
            abort(400, description="'limit' must be an integer")

        model, vocab = _get_suggest_corpus()
        suggestions = did_you_mean(query, vocab, limit=limit)
        completion = generate_from_model(model, max_tokens=10) if model else ""
        return jsonify({
            "query": query,
            "did_you_mean": suggestions,
            "completion": completion,
        })

    @app.route("/healthz", methods=["GET"])
    def healthz():
        return jsonify({
            "status": "ok",
            "workspace_root": str(app.config["WORKSPACE_ROOT"]),
            "readonly": app.config["READONLY"],
        })

    if start_watcher:
        threading.Thread(target=_watch_poll_loop, daemon=True).start()

    return app


if __name__ == "__main__":
    # Built here, not at module level: constructing the app touches disk
    # (WORKSPACE_ROOT.mkdir) and spawns the watch-poller thread, both of
    # which are real side effects that a module import -- e.g.
    # `from app import create_app` in tests/test_app.py -- should never
    # trigger just by importing the file.
    app = create_app()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("DEBUG") == "1", threaded=True)
