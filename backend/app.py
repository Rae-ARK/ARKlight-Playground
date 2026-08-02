"""
ARKlight backend — minimal workspace file API.

Exposes just enough REST surface for a browser-based Code OSS workbench
FileSystemProvider to list, read, and write files against a real
directory on disk. Intentionally small: no auth, no terminals, no
compiler integration. Extend from here.

Run:
    pip install -r requirements.txt
    WORKSPACE_ROOT=/path/to/project python app.py

Endpoints:
    GET  /workspace/files            -> recursive file/dir listing
    GET  /workspace/file/<path>      -> read file content
    PUT  /workspace/file/<path>      -> write file content
    POST /workspace/file/<path>      -> create empty file
    DELETE /workspace/file/<path>    -> delete file
    POST /workspace/dir/<path>       -> create directory
"""

import os
from pathlib import Path

from flask import Flask, jsonify, request, abort, Response
from flask_cors import CORS

WORKSPACE_ROOT = Path(os.environ.get("WORKSPACE_ROOT", "./workspace")).resolve()
WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
CORS(app)  # the workbench runs on a different origin (localhost:PORT vs file/webview)


def _resolve(relative_path: str) -> Path:
    """
    Resolve a client-supplied relative path against WORKSPACE_ROOT,
    rejecting any attempt to escape the workspace directory.
    """
    candidate = (WORKSPACE_ROOT / relative_path).resolve()
    if WORKSPACE_ROOT not in candidate.parents and candidate != WORKSPACE_ROOT:
        abort(400, description="path escapes workspace root")
    return candidate


@app.route("/workspace/files", methods=["GET"])
def list_files():
    entries = []
    for root, dirs, files in os.walk(WORKSPACE_ROOT):
        # skip common noise directories
        dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "__pycache__")]
        rel_root = Path(root).relative_to(WORKSPACE_ROOT)
        for d in dirs:
            p = str(rel_root / d) if str(rel_root) != "." else d
            entries.append({"path": p, "type": "directory"})
        for f in files:
            p = str(rel_root / f) if str(rel_root) != "." else f
            entries.append({"path": p, "type": "file"})
    return jsonify(entries)


@app.route("/workspace/file/<path:relative_path>", methods=["GET"])
def read_file(relative_path):
    target = _resolve(relative_path)
    if not target.is_file():
        abort(404, description="file not found")
    try:
        return Response(target.read_text(encoding="utf-8"), mimetype="text/plain")
    except UnicodeDecodeError:
        # binary file — return raw bytes
        return Response(target.read_bytes(), mimetype="application/octet-stream")


@app.route("/workspace/file/<path:relative_path>", methods=["PUT"])
def write_file(relative_path):
    target = _resolve(relative_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    body = request.get_data()
    target.write_bytes(body)
    return jsonify({"path": relative_path, "status": "written", "bytes": len(body)})


@app.route("/workspace/file/<path:relative_path>", methods=["POST"])
def create_file(relative_path):
    target = _resolve(relative_path)
    if target.exists():
        abort(409, description="file already exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.touch()
    return jsonify({"path": relative_path, "status": "created"}), 201


@app.route("/workspace/file/<path:relative_path>", methods=["DELETE"])
def delete_file(relative_path):
    target = _resolve(relative_path)
    if not target.exists():
        abort(404, description="file not found")
    target.unlink()
    return jsonify({"path": relative_path, "status": "deleted"})


@app.route("/workspace/dir/<path:relative_path>", methods=["POST"])
def create_dir(relative_path):
    target = _resolve(relative_path)
    target.mkdir(parents=True, exist_ok=True)
    return jsonify({"path": relative_path, "status": "created"}), 201


@app.route("/healthz", methods=["GET"])
def healthz():
    return jsonify({"status": "ok", "workspace_root": str(WORKSPACE_ROOT)})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("DEBUG") == "1")
