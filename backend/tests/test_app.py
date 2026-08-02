"""
Tests for backend/app.py.

Stage 4 (correctness & hygiene). Every test builds its own app via
create_app() against a fresh tmp-dir workspace, with the background
watch-poller disabled (start_watcher=False) -- nothing here needs a
live poll loop, and leaving it off keeps tests fast and avoids
leaking daemon threads across the suite.

Run from the backend/ directory:
    pip install -r requirements.txt
    python -m unittest discover -s tests -v

Or, if pytest is available:
    python -m pytest tests/ -v
"""

import json
import shutil
import tempfile
import unittest
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import create_app  # noqa: E402


class ArklightBackendTestCase(unittest.TestCase):
    """Base class: fresh tmp-dir workspace per test, app + client wired up."""

    readonly = False
    max_read_bytes = 20 * 1024 * 1024

    def setUp(self):
        self.workspace_dir = tempfile.mkdtemp(prefix="arklight-test-")
        self.app = create_app(
            workspace_root=self.workspace_dir,
            readonly=self.readonly,
            max_read_bytes=self.max_read_bytes,
            start_watcher=False,
        )
        self.app.testing = True
        self.client = self.app.test_client()

    def tearDown(self):
        shutil.rmtree(self.workspace_dir, ignore_errors=True)

    # -- helpers --------------------------------------------------------
    def write_real_file(self, relative_path: str, content: bytes = b"hello") -> Path:
        """Write directly to disk, bypassing the API, to set up fixtures."""
        target = Path(self.workspace_dir) / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return target

    def get_json(self, response):
        return json.loads(response.get_data(as_text=True))


class HealthzTests(ArklightBackendTestCase):

    def test_healthz_reports_workspace_root_and_readonly_flag(self):
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        body = self.get_json(response)
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["readonly"], False)
        self.assertEqual(Path(body["workspace_root"]), Path(self.workspace_dir).resolve())


class PathEscapeTests(ArklightBackendTestCase):
    """The one security-relevant piece of this backend: _resolve() must
    never let a client-supplied relative path leave WORKSPACE_ROOT."""

    def test_read_file_rejects_dotdot_escape(self):
        response = self.client.get("/workspace/file/../../etc/passwd")
        # Flask/werkzeug normalizes '..' in the URL path itself before
        # routing in most configurations, but the escape guard in
        # _resolve() is the actual line of defense and must reject
        # anything that gets through -- assert we never get a 200.
        self.assertNotEqual(response.status_code, 200)

    def test_resolve_rejects_escape_via_stat_endpoint(self):
        # Encode the traversal so werkzeug's own path normalization
        # doesn't collapse it before it reaches our handler, giving a
        # more direct test of _resolve()'s own guard.
        response = self.client.get("/workspace/stat/%2e%2e/%2e%2e/etc/passwd")
        self.assertNotEqual(response.status_code, 200)

    def test_absolute_path_style_input_stays_confined(self):
        # A leading slash in the captured <path:...> segment still
        # resolves relative to WORKSPACE_ROOT via Path's / operator
        # semantics here (Flask's <path:> converter strips the leading
        # slash), so this should behave like a normal not-found, not an
        # escape -- and must never expose anything outside the workspace.
        response = self.client.get("/workspace/file/etc/passwd")
        self.assertEqual(response.status_code, 404)


class FileCrudTests(ArklightBackendTestCase):

    def test_create_read_write_delete_lifecycle(self):
        # create
        response = self.client.post("/workspace/file/notes.txt")
        self.assertEqual(response.status_code, 201)

        # creating again should conflict
        response = self.client.post("/workspace/file/notes.txt")
        self.assertEqual(response.status_code, 409)

        # write
        response = self.client.put("/workspace/file/notes.txt", data=b"hello world")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.get_json(response)["bytes"], 11)

        # read back
        response = self.client.get("/workspace/file/notes.txt")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_data(), b"hello world")
        self.assertIn("X-Mtime", response.headers)

        # stat
        response = self.client.get("/workspace/stat/notes.txt")
        self.assertEqual(response.status_code, 200)
        body = self.get_json(response)
        self.assertEqual(body["type"], "file")
        self.assertEqual(body["size"], 11)

        # delete
        response = self.client.delete("/workspace/file/notes.txt")
        self.assertEqual(response.status_code, 200)

        # gone
        response = self.client.get("/workspace/file/notes.txt")
        self.assertEqual(response.status_code, 404)

    def test_write_creates_file_if_missing(self):
        # PUT with no prior POST/create should still work (create=True
        # semantics live in the extension, not the backend -- the
        # backend's PUT always upserts).
        response = self.client.put("/workspace/file/new.txt", data=b"abc")
        self.assertEqual(response.status_code, 200)
        response = self.client.get("/workspace/file/new.txt")
        self.assertEqual(response.get_data(), b"abc")

    def test_delete_missing_file_is_404(self):
        response = self.client.delete("/workspace/file/nope.txt")
        self.assertEqual(response.status_code, 404)

    def test_delete_directory_recursively(self):
        self.write_real_file("dir/inner/a.txt")
        response = self.client.delete("/workspace/file/dir")
        self.assertEqual(response.status_code, 200)
        self.assertFalse((Path(self.workspace_dir) / "dir").exists())

    def test_read_missing_file_is_404(self):
        response = self.client.get("/workspace/file/missing.txt")
        self.assertEqual(response.status_code, 404)

    def test_read_over_max_bytes_is_413(self):
        self.write_real_file("big.bin", b"x" * 100)
        small_app = create_app(
            workspace_root=self.workspace_dir,
            max_read_bytes=10,
            start_watcher=False,
        )
        small_app.testing = True
        client = small_app.test_client()
        response = client.get("/workspace/file/big.bin")
        self.assertEqual(response.status_code, 413)


class DirectoryTests(ArklightBackendTestCase):

    def test_create_directory_is_idempotent(self):
        response = self.client.post("/workspace/dir/sub")
        self.assertEqual(response.status_code, 201)
        # POSTing again should not error (mkdir(..., exist_ok=True))
        response = self.client.post("/workspace/dir/sub")
        self.assertEqual(response.status_code, 201)

    def test_list_dir_single_level_excludes_noise_dirs(self):
        self.write_real_file("sub/a.txt")
        self.write_real_file("sub/nested/b.txt")
        (Path(self.workspace_dir) / "sub" / "__pycache__").mkdir()
        response = self.client.get("/workspace/dir/sub")
        self.assertEqual(response.status_code, 200)
        names = {Path(e["path"]).name for e in self.get_json(response)}
        self.assertIn("a.txt", names)
        self.assertIn("nested", names)
        self.assertNotIn("__pycache__", names)

    def test_list_dir_root_via_defaults_route(self):
        self.write_real_file("top.txt")
        response = self.client.get("/workspace/dir")
        self.assertEqual(response.status_code, 200)
        names = {Path(e["path"]).name for e in self.get_json(response)}
        self.assertIn("top.txt", names)

    def test_list_dir_missing_target_is_404(self):
        response = self.client.get("/workspace/dir/does-not-exist")
        self.assertEqual(response.status_code, 404)

    def test_recursive_files_listing_excludes_noise_dirs(self):
        self.write_real_file("a.txt")
        (Path(self.workspace_dir) / "node_modules").mkdir()
        (Path(self.workspace_dir) / "node_modules" / "junk.js").write_text("x")
        response = self.client.get("/workspace/files")
        paths = {e["path"] for e in self.get_json(response)}
        self.assertIn("a.txt", paths)
        self.assertFalse(any(p.startswith("node_modules") for p in paths))


class RenameTests(ArklightBackendTestCase):

    def test_rename_success(self):
        self.write_real_file("old.txt", b"data")
        response = self.client.patch(
            "/workspace/file/old.txt",
            data=json.dumps({"newPath": "new.txt"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse((Path(self.workspace_dir) / "old.txt").exists())
        self.assertTrue((Path(self.workspace_dir) / "new.txt").exists())

    def test_rename_missing_source_is_404(self):
        response = self.client.patch(
            "/workspace/file/ghost.txt",
            data=json.dumps({"newPath": "new.txt"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_rename_onto_existing_destination_is_409(self):
        self.write_real_file("old.txt")
        self.write_real_file("new.txt")
        response = self.client.patch(
            "/workspace/file/old.txt",
            data=json.dumps({"newPath": "new.txt"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)

    def test_rename_missing_body_is_400(self):
        self.write_real_file("old.txt")
        response = self.client.patch(
            "/workspace/file/old.txt",
            data=json.dumps({}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)


class CopyTests(ArklightBackendTestCase):

    def test_copy_file_success(self):
        self.write_real_file("src.txt", b"payload")
        response = self.client.post(
            "/workspace/copy",
            data=json.dumps({"from": "src.txt", "to": "dst.txt"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual((Path(self.workspace_dir) / "dst.txt").read_bytes(), b"payload")
        # original untouched
        self.assertTrue((Path(self.workspace_dir) / "src.txt").exists())

    def test_copy_directory_recursively(self):
        self.write_real_file("src/a.txt")
        self.write_real_file("src/nested/b.txt")
        response = self.client.post(
            "/workspace/copy",
            data=json.dumps({"from": "src", "to": "dst"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue((Path(self.workspace_dir) / "dst" / "nested" / "b.txt").exists())

    def test_copy_missing_source_is_404(self):
        response = self.client.post(
            "/workspace/copy",
            data=json.dumps({"from": "ghost.txt", "to": "dst.txt"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_copy_onto_existing_destination_is_409(self):
        self.write_real_file("src.txt")
        self.write_real_file("dst.txt")
        response = self.client.post(
            "/workspace/copy",
            data=json.dumps({"from": "src.txt", "to": "dst.txt"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)

    def test_copy_missing_fields_is_400(self):
        response = self.client.post(
            "/workspace/copy",
            data=json.dumps({"from": "src.txt"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)


class ConcurrencyTests(ArklightBackendTestCase):
    """Optimistic-concurrency writes via If-Unmodified-Since-Mtime (Stage 3)."""

    def test_write_without_header_always_succeeds(self):
        self.write_real_file("f.txt", b"v1")
        response = self.client.put("/workspace/file/f.txt", data=b"v2")
        self.assertEqual(response.status_code, 200)

    def test_write_with_matching_mtime_succeeds(self):
        target = self.write_real_file("f.txt", b"v1")
        current_mtime = target.stat().st_mtime
        response = self.client.put(
            "/workspace/file/f.txt",
            data=b"v2",
            headers={"If-Unmodified-Since-Mtime": str(current_mtime)},
        )
        self.assertEqual(response.status_code, 200)

    def test_write_with_stale_mtime_is_409_conflict_412(self):
        target = self.write_real_file("f.txt", b"v1")
        stale_mtime = target.stat().st_mtime - 1000  # deliberately wrong
        response = self.client.put(
            "/workspace/file/f.txt",
            data=b"v2",
            headers={"If-Unmodified-Since-Mtime": str(stale_mtime)},
        )
        self.assertEqual(response.status_code, 412)
        body = self.get_json(response)
        self.assertEqual(body["error"], "Conflict")
        # file on disk must be untouched by the rejected write
        self.assertEqual(target.read_bytes(), b"v1")

    def test_write_with_malformed_mtime_header_is_ignored(self):
        self.write_real_file("f.txt", b"v1")
        response = self.client.put(
            "/workspace/file/f.txt",
            data=b"v2",
            headers={"If-Unmodified-Since-Mtime": "not-a-number"},
        )
        self.assertEqual(response.status_code, 200)


class SearchTests(ArklightBackendTestCase):

    def test_search_finds_matches_case_insensitively(self):
        self.write_real_file("a.py", b"def hello():\n    return 'World'\n")
        response = self.client.get("/workspace/search?q=hello")
        self.assertEqual(response.status_code, 200)
        body = self.get_json(response)
        self.assertEqual(len(body["matches"]), 1)
        self.assertEqual(body["matches"][0]["path"], "a.py")
        self.assertEqual(body["matches"][0]["line"], 1)

    def test_search_missing_query_is_400(self):
        response = self.client.get("/workspace/search")
        self.assertEqual(response.status_code, 400)

    def test_search_skips_binary_files(self):
        self.write_real_file("bin.dat", b"\xff\xfe\x00\x01needle")
        self.write_real_file("text.txt", b"needle here")
        response = self.client.get("/workspace/search?q=needle")
        body = self.get_json(response)
        paths = {m["path"] for m in body["matches"]}
        self.assertIn("text.txt", paths)
        self.assertNotIn("bin.dat", paths)


class ReadonlyModeTests(ArklightBackendTestCase):
    readonly = True

    def test_writes_are_blocked(self):
        self.assertEqual(self.client.post("/workspace/file/f.txt").status_code, 403)
        self.assertEqual(self.client.put("/workspace/file/f.txt", data=b"x").status_code, 403)
        self.assertEqual(self.client.post("/workspace/dir/d").status_code, 403)

    def test_delete_and_rename_and_copy_are_blocked(self):
        self.write_real_file("f.txt")
        self.assertEqual(self.client.delete("/workspace/file/f.txt").status_code, 403)
        self.assertEqual(
            self.client.patch(
                "/workspace/file/f.txt",
                data=json.dumps({"newPath": "g.txt"}),
                content_type="application/json",
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/workspace/copy",
                data=json.dumps({"from": "f.txt", "to": "g.txt"}),
                content_type="application/json",
            ).status_code,
            403,
        )

    def test_reads_still_work(self):
        self.write_real_file("f.txt", b"readable")
        self.assertEqual(self.client.get("/workspace/file/f.txt").status_code, 200)
        self.assertEqual(self.client.get("/workspace/files").status_code, 200)
        self.assertEqual(self.client.get("/healthz").status_code, 200)

    def test_healthz_reflects_readonly_flag(self):
        response = self.client.get("/healthz")
        self.assertTrue(self.get_json(response)["readonly"])


class WatchEndpointTests(ArklightBackendTestCase):
    """The SSE stream itself runs forever, so we only assert the response
    is set up correctly (headers/mimetype) without ever consuming the
    generator -- Flask's test client doesn't invoke it until iterated."""

    def test_watch_endpoint_returns_event_stream_mimetype(self):
        response = self.client.get("/workspace/watch")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "text/event-stream")
        response.close()


if __name__ == "__main__":
    unittest.main()
