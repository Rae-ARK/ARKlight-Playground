"""
Tests for backend/nlp_tools.py (Stage 5 -- small, dependency-free
tooling). Pure unit tests: no Flask, no filesystem, except for
build_corpus()/extract_docstrings(), which get a tmp dir.

Run from the backend/ directory:
    python -m pytest tests/test_nlp_tools.py -v
"""

import shutil
import tempfile
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from nlp_tools import (  # noqa: E402
    build_corpus,
    build_ngram_model,
    did_you_mean,
    explain_error,
    extract_docstrings,
    fuzzy_search,
    generate_from_model,
    ngram_overlap_score,
    tokenize,
)


class TokenizeTests(unittest.TestCase):
    def test_splits_on_non_alnum(self):
        self.assertEqual(tokenize("workspace/file.py"), ["workspace", "file", "py"])

    def test_splits_camel_case(self):
        self.assertEqual(tokenize("arklightFsProvider"), ["arklight", "fs", "provider"])

    def test_lowercases(self):
        self.assertEqual(tokenize("README.MD"), ["readme", "md"])

    def test_empty_input(self):
        self.assertEqual(tokenize(""), [])
        self.assertEqual(tokenize(None), [])


class FuzzySearchTests(unittest.TestCase):
    def setUp(self):
        self.paths = [
            "src/vs/code/browser/workbench/workbench.ts",
            "extensions/arklight-fs/src/fileSystemProvider.ts",
            "backend/app.py",
            "backend/nlp_tools.py",
            "README.md",
        ]

    def test_exact_token_match_ranks_first(self):
        results = fuzzy_search(self.paths, "workbench", limit=5)
        self.assertTrue(results)
        self.assertEqual(results[0]["path"], "src/vs/code/browser/workbench/workbench.ts")

    def test_typo_still_matches_via_difflib_fallback(self):
        # 'worksapce' (transposed) should still surface workbench-ish /
        # workspace-ish results rather than nothing at all.
        results = fuzzy_search(self.paths, "arklihgt fs", limit=5)
        paths = [r["path"] for r in results]
        self.assertIn("extensions/arklight-fs/src/fileSystemProvider.ts", paths)

    def test_no_query_tokens_returns_empty(self):
        self.assertEqual(fuzzy_search(self.paths, "!!!", limit=5), [])

    def test_empty_paths_returns_empty(self):
        self.assertEqual(fuzzy_search([], "app", limit=5), [])

    def test_respects_limit(self):
        results = fuzzy_search(self.paths, "e", limit=2)
        self.assertLessEqual(len(results), 2)

    def test_scores_are_sorted_descending(self):
        results = fuzzy_search(self.paths, "app backend", limit=10)
        scores = [r["score"] for r in results]
        self.assertEqual(scores, sorted(scores, reverse=True))


class ExplainErrorTests(unittest.TestCase):
    def test_permission_denied_matches_exact_rule(self):
        result = explain_error("OSError: [Errno 13] Permission denied: '/etc/shadow'")
        self.assertEqual(result["rule"], "permission_denied")
        self.assertTrue(result["matched"])

    def test_409_conflict_matches_already_exists_rule(self):
        result = explain_error("409 file already exists")
        self.assertEqual(result["rule"], "already_exists")

    def test_412_matches_stale_write_conflict_rule(self):
        result = explain_error("412 Precondition Failed: file changed on disk since it was last read")
        self.assertEqual(result["rule"], "stale_write_conflict")

    def test_readonly_mode_rule(self):
        result = explain_error("403 backend is running in read-only mode")
        self.assertEqual(result["rule"], "readonly_mode")

    def test_unrecognized_message_with_no_overlap_returns_no_rule(self):
        result = explain_error("xyzzy plugh quux")
        self.assertIsNone(result["rule"])
        self.assertFalse(result["matched"])

    def test_empty_message(self):
        result = explain_error("")
        self.assertIsNone(result["rule"])
        self.assertIn("No error message", result["explanation"])

    def test_fuzzy_fallback_uses_word_overlap_not_exact_pattern(self):
        # Doesn't match any regex exactly, but shares vocabulary with
        # the permission_denied rule's own explanation/suggestion text.
        result = explain_error("permission issue trying to access the file")
        self.assertEqual(result["rule"], "permission_denied")
        self.assertTrue(result.get("best_guess"))
        self.assertFalse(result["matched"])


class NgramModelTests(unittest.TestCase):
    def test_build_model_from_short_text(self):
        model = build_ngram_model("the quick brown fox jumps over the lazy dog", n=2)
        self.assertIn(("the", "quick"), model)
        self.assertEqual(model[("the", "quick")], ["brown"])

    def test_empty_text_yields_empty_model(self):
        self.assertEqual(build_ngram_model("", n=2), {})

    def test_generate_from_model_produces_known_tokens_only(self):
        text = "alpha beta gamma beta gamma delta gamma delta alpha"
        model = build_ngram_model(text, n=2)
        vocab = set(tokenize(text))
        output = generate_from_model(model, max_tokens=8)
        for tok in output.split():
            self.assertIn(tok, vocab)

    def test_generate_from_empty_model_is_empty_string(self):
        self.assertEqual(generate_from_model({}), "")

    def test_did_you_mean_suggests_close_vocabulary_word(self):
        vocab = ["workspace", "workbench", "extension", "provider"]
        suggestions = did_you_mean("worksapce", vocab, limit=3)
        self.assertIn("workspace", suggestions)

    def test_did_you_mean_empty_vocab(self):
        self.assertEqual(did_you_mean("anything", [], limit=3), [])

    def test_ngram_overlap_score_range_and_self_match(self):
        score = ngram_overlap_score("read the file", "please read the file now", n=2)
        self.assertGreater(score, 0.0)
        self.assertLessEqual(score, 1.0)

    def test_ngram_overlap_score_zero_for_disjoint_text(self):
        score = ngram_overlap_score("completely unrelated query", "totally different content", n=2)
        self.assertEqual(score, 0.0)


class CorpusBuildingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="arklight-nlp-test-")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_extract_docstrings_from_module_function_and_class(self):
        source = '''
"""Module docstring."""


def foo():
    """Function docstring."""
    return 1


class Bar:
    """Class docstring."""

    def method(self):
        """Method docstring."""
        pass
'''
        docs = extract_docstrings(source)
        self.assertEqual(
            set(docs),
            {
                "Module docstring.",
                "Function docstring.",
                "Class docstring.",
                "Method docstring.",
            },
        )

    def test_extract_docstrings_handles_syntax_error_gracefully(self):
        self.assertEqual(extract_docstrings("def broken(:\n"), [])

    def test_build_corpus_collects_docstrings_and_markdown(self):
        (Path(self.tmp) / "mod.py").write_text('"""A helper module for testing."""\n')
        (Path(self.tmp) / "README.md").write_text("# Demo\nSome markdown content.\n")
        (Path(self.tmp) / "ignored.bin").write_bytes(b"\x00\x01\x02binary")

        corpus = build_corpus(self.tmp, noise_dirs=set())
        self.assertIn("A helper module for testing.", corpus)
        self.assertIn("Some markdown content.", corpus)

    def test_build_corpus_skips_noise_dirs(self):
        noisy = Path(self.tmp) / "node_modules"
        noisy.mkdir()
        (noisy / "pkg.py").write_text('"""Should not be indexed."""\n')

        corpus = build_corpus(self.tmp, noise_dirs={"node_modules"})
        self.assertNotIn("Should not be indexed.", corpus)

    def test_build_corpus_empty_directory_returns_empty_string(self):
        self.assertEqual(build_corpus(self.tmp, noise_dirs=set()), "")


if __name__ == "__main__":
    unittest.main()
