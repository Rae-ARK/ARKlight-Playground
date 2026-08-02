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
    GET    /healthz                        -> liveness
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

WORKSPACE_ROOT = Path(os.environ.get("WORKSPACE_ROOT", "./workspace")).resolve()
WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)

READONLY = os.environ.get("ARKLIGHT_READONLY") == "1"
MAX_READ_BYTES = int(os.environ.get("ARKLIGHT_MAX_READ_BYTES", 20 * 1024 * 1024))
WATCH_POLL_INTERVAL = float(os.environ.get("ARKLIGHT_WATCH_POLL_INTERVAL", "1.0"))

# directories skipped everywhere we walk the tree (listing, search, watch)
NOISE_DIRS = {".git", "node_modules", "__pycache__"}

app = Flask(__name__)
# the workbench runs on a different origin (localhost:PORT vs file/webview);
# X-Mtime has to be explicitly exposed or browser JS can't read it off the response
CORS(app, expose_headers=["X-Mtime"])


@app.errorhandler(HTTPException)
def handle_http_exception(err):
    """Return JSON instead of Flask's default HTML error pages."""
    return jsonify({"error": err.name, "message": err.description}), err.code


def _resolve(relative_path: str) -> Path:
    """
    Resolve a client-supplied relative path against WORKSPACE_ROOT,
    rejecting any attempt to escape the workspace directory.
    """
    candidate = (WORKSPACE_ROOT / relative_path).resolve()
    if WORKSPACE_ROOT not in candidate.parents and candidate != WORKSPACE_ROOT:
        abort(400, description="path escapes workspace root")
    return candidate


def _require_write_access():
    if READONLY:
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


_watch_lock = threading.Lock()
_watch_subscribers = []  # type: list[queue.Queue]


def _walk_snapshot() -> dict:
    """path -> (kind, mtime) for every file/dir under WORKSPACE_ROOT."""
    snapshot = {}
    for root, dirs, files in os.walk(WORKSPACE_ROOT):
        dirs[:] = [d for d in dirs if d not in NOISE_DIRS]
        rel_root = Path(root).relative_to(WORKSPACE_ROOT)
        for d in dirs:
            p = str(rel_root / d) if str(rel_root) != "." else d
            try:
                snapshot[p] = ("directory", (Path(root) / d).stat().st_mtime)
            except OSError:
                continue
        for f in files:
            p = str(rel_root / f) if str(rel_root) != "." else f
            try:
                snapshot[p] = ("file", (Path(root) / f).stat().st_mtime)
            except OSError:
                continue
    return snapshot


def _publish(event: dict) -> None:
    with _watch_lock:
        subscribers = list(_watch_subscribers)
    for q in subscribers:
        q.put(event)


def _watch_poll_loop() -> None:
    """
    Background thread: periodically re-walks WORKSPACE_ROOT and diffs against
    the previous snapshot to synthesize created/changed/deleted events. Simple
    on purpose -- a real filesystem-notification backend (inotify/watchdog)
    is the natural next step once this contract is proven out.
    """
    previous = _walk_snapshot()
    while True:
        time.sleep(WATCH_POLL_INTERVAL)
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


threading.Thread(target=_watch_poll_loop, daemon=True).start()


@app.route("/workspace/watch", methods=["GET"])
def watch():
    """
    Server-Sent Events stream of filesystem change events, polled every
    ARKLIGHT_WATCH_POLL_INTERVAL seconds (default 1s). Each event is a JSON
    object: {"type": "created"|"changed"|"deleted", "path": ..., "kind": "file"|"directory"}.
    """
    client_queue: "queue.Queue[dict]" = queue.Queue()
    with _watch_lock:
        _watch_subscribers.append(client_queue)

    def stream():
        try:
            yield "retry: 2000\n\n"
            while True:
                event = client_queue.get()
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            with _watch_lock:
                if client_queue in _watch_subscribers:
                    _watch_subscribers.remove(client_queue)

    return Response(stream(), mimetype="text/event-stream")


@app.route("/workspace/files", methods=["GET"])
def list_files():
    entries = []
    for root, dirs, files in os.walk(WORKSPACE_ROOT):
        dirs[:] = [d for d in dirs if d not in NOISE_DIRS]
        rel_root = Path(root).relative_to(WORKSPACE_ROOT)
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
    target = _resolve(relative_path)
    if not target.is_dir():
        abort(404, description="directory not found")
    entries = []
    for child in sorted(target.iterdir()):
        if child.name in NOISE_DIRS:
            continue
        rel = str(child.relative_to(WORKSPACE_ROOT))
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
    if size > MAX_READ_BYTES:
        abort(413, description=f"file exceeds {MAX_READ_BYTES} byte read limit")
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
    query = request.args.get("q", "")
    if not query:
        abort(400, description="missing query param 'q'")
    needle = query.lower()
    matches = []
    limit = 200
    for root, dirs, files in os.walk(WORKSPACE_ROOT):
        dirs[:] = [d for d in dirs if d not in NOISE_DIRS]
        for fname in files:
            if len(matches) >= limit:
                break
            fpath = Path(root) / fname
            try:
                if fpath.stat().st_size > MAX_READ_BYTES:
                    continue
                text = fpath.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            rel = str(fpath.relative_to(WORKSPACE_ROOT))
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


@app.route("/healthz", methods=["GET"])
def healthz():
    return jsonify({
        "status": "ok",
        "workspace_root": str(WORKSPACE_ROOT),
        "readonly": READONLY,
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("DEBUG") == "1", threaded=True)
