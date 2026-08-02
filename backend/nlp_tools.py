"""
Small, dependency-free "developer tooling" helpers (ROADMAP.md Stage 5).

Everything here is built entirely on the Python standard library
(`ast`, `collections`, `difflib`, `math`, `random`, `re`) -- no numpy,
no torch, no external model weights, no network calls. These are the
same category of technique 1990s/2000s-era chatbots and search tools
used before neural nets were practical to run locally: frequency
counting, Markov chains, bag-of-words, edit distance, hand-authored
pattern/response rules. They are framed here as small, auditable
developer-tooling utilities -- not a general chatbot.

Three features, each independently usable and independently tested:

  1. fuzzy_search()        -- typo-tolerant file/path search.
  2. explain_error()       -- plain-English translation of raw
                               backend/filesystem error strings.
  3. build_ngram_model() / -- a tiny order-N Markov model, trained on
     generate_from_model()    nothing fancier than this workspace's own
                               docstrings and Markdown files, used for
                               "did you mean" suggestions and playful
                               autocomplete continuations.

backend/app.py wires these up as new `/workspace/search/fuzzy`,
`/workspace/explain-error`, and `/workspace/search/suggest` endpoints
so any client can call them the same way it calls the existing file
API, rather than baking the logic into a specific extension.
"""

import ast
import difflib
import math
import os
import random
import re
from collections import Counter, defaultdict
from pathlib import Path

# ---------------------------------------------------------------------------
# Shared tokenizer
# ---------------------------------------------------------------------------

_CAMEL_BOUNDARY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
_WORD = re.compile(r"[a-zA-Z0-9]+")


def tokenize(text: str) -> list:
    """
    Split text (a query, a file path, a docstring, ...) into lowercase
    word tokens. Splits camelCase/PascalCase boundaries first so
    `arklightFs` tokenizes the same way `arklight_fs`/`arklight-fs` does.
    """
    if not text:
        return []
    spaced = _CAMEL_BOUNDARY.sub(" ", text)
    return [t.lower() for t in _WORD.findall(spaced)]


# ---------------------------------------------------------------------------
# 1. Fuzzy component/file search
# ---------------------------------------------------------------------------
#
# An inverted-index-flavored bag-of-words score (collections.Counter for
# term frequency) plus a difflib fallback so a single typo'd token still
# contributes to the ranking. No embeddings, no vector DB -- this is
# enough for "find the file I'm thinking of" in a codebase-sized
# workspace, and it runs instantly with zero setup/training step.


def fuzzy_search(paths: list, query: str, limit: int = 20) -> list:
    """
    Rank `paths` (file/dir path strings, workspace-relative) against a
    typo-tolerant `query`. Returns a list of {"path", "score"} dicts,
    highest score first, capped at `limit`.
    """
    query_tokens = tokenize(query)
    if not query_tokens or not paths:
        return []

    query_counts = Counter(query_tokens)
    tokens_by_path = {path: tokenize(path) for path in paths}

    # Vocabulary of every distinct token that appears in any path, used
    # so a mistyped query token (e.g. "worksapce") can still match
    # "workspace" via edit-distance rather than requiring an exact hit.
    all_path_tokens = set()
    for toks in tokens_by_path.values():
        all_path_tokens.update(toks)

    fuzzy_bonus = Counter()
    for qt in query_tokens:
        close = difflib.get_close_matches(qt, all_path_tokens, n=5, cutoff=0.75)
        for match in close:
            # exact hits are already scored via query_counts/overlap;
            # only reward genuinely-different-but-close tokens here.
            if match != qt:
                fuzzy_bonus[match] += 1

    results = []
    for path, toks in tokens_by_path.items():
        path_counts = Counter(toks)
        overlap = sum(min(query_counts[t], path_counts[t]) for t in query_counts)
        bonus = sum(fuzzy_bonus[t] for t in toks)
        similarity = difflib.SequenceMatcher(None, query.lower(), path.lower()).ratio()

        score = (overlap * 3.0) + (bonus * 1.5) + similarity
        if score > 0:
            results.append({"path": path, "score": round(score, 4)})

    results.sort(key=lambda r: (r["score"], r["path"]), reverse=True)
    return results[:limit]


# ---------------------------------------------------------------------------
# 2. Human-readable error translation
# ---------------------------------------------------------------------------
#
# A small table of (regex pattern -> template) rules, the same shape as
# ELIZA's substitution rules, that turns raw backend/filesystem errors
# into a plain-English message with a suggested next action. When a raw
# message doesn't match a rule's pattern exactly, a small
# collections.Counter/math.log-based Naive-Bayes-style classifier picks
# the closest rule using only the rule table's own vocabulary as its
# "training corpus" -- no external corpus needed.

ERROR_RULES = [
    {
        "name": "permission_denied",
        "pattern": re.compile(r"errno\s*13|permission denied", re.IGNORECASE),
        "explanation": "The backend doesn't have permission to access this file or directory.",
        "suggestion": "Check the file's owner/permissions on disk, or run the backend as a user with access.",
    },
    {
        "name": "not_found",
        "pattern": re.compile(r"errno\s*2\b|no such file or directory|\b404\b|not found", re.IGNORECASE),
        "explanation": "The file or directory doesn't exist at that path.",
        "suggestion": "Double-check the path for typos, or refresh the file tree -- it may have been moved or deleted.",
    },
    {
        "name": "already_exists",
        "pattern": re.compile(r"\b409\b|already exists", re.IGNORECASE),
        "explanation": "Something already exists at the destination path.",
        "suggestion": "Choose a different name, or delete/rename the existing file first.",
    },
    {
        "name": "stale_write_conflict",
        "pattern": re.compile(r"\b412\b|changed on disk|concurrency conflict|precondition failed", re.IGNORECASE),
        "explanation": "The file changed on disk since it was last read, so the write was rejected instead of silently overwriting it.",
        "suggestion": "Reload the file to see the latest version, then reapply your edit.",
    },
    {
        "name": "readonly_mode",
        "pattern": re.compile(r"\b403\b|read-?only mode|forbidden", re.IGNORECASE),
        "explanation": "The backend is running in read-only mode, so write operations are blocked.",
        "suggestion": "Restart the backend without ARKLIGHT_READONLY=1 if you need to make changes.",
    },
    {
        "name": "path_escape",
        "pattern": re.compile(r"escapes workspace root|path traversal", re.IGNORECASE),
        "explanation": "That path points outside the workspace root, so it was rejected.",
        "suggestion": "Use a path relative to the workspace root -- avoid '..' segments that climb above it.",
    },
    {
        "name": "read_size_limit",
        "pattern": re.compile(r"exceeds.*byte read limit|\b413\b|payload too large", re.IGNORECASE),
        "explanation": "The file is larger than this backend is currently configured to serve in one request.",
        "suggestion": "Raise ARKLIGHT_MAX_READ_BYTES, or access the file another way.",
    },
    {
        "name": "disk_full",
        "pattern": re.compile(r"errno\s*28|no space left on device", re.IGNORECASE),
        "explanation": "The disk backing the workspace is out of space.",
        "suggestion": "Free up disk space on the machine running the backend, then retry.",
    },
    {
        "name": "bad_request_body",
        "pattern": re.compile(r"\b400\b|bad request|must include", re.IGNORECASE),
        "explanation": "The request was missing something the backend needed (a required field, a query param, ...).",
        "suggestion": "Check the request body/params against the endpoint's documented shape.",
    },
]

# Vocabulary for the fallback classifier is built lazily (once) from the
# rule table's own name/explanation/suggestion text -- this *is* the
# training corpus, per Stage 5's scope.
_rule_vocab_cache = None


def _rule_vocabularies():
    global _rule_vocab_cache
    if _rule_vocab_cache is None:
        _rule_vocab_cache = [
            (rule, Counter(tokenize(" ".join([rule["name"], rule["explanation"], rule["suggestion"]]))))
            for rule in ERROR_RULES
        ]
    return _rule_vocab_cache


def _classify_by_word_overlap(message: str):
    """
    Naive-Bayes-flavored fallback: score `message`'s tokens against each
    rule's own vocabulary (Laplace-smoothed log-probabilities) and
    return the best-scoring rule, but only if at least one token
    actually overlaps -- otherwise there's nothing meaningful to guess.
    """
    tokens = tokenize(message)
    if not tokens:
        return None

    vocabularies = _rule_vocabularies()
    vocab_size = len({t for _, counter in vocabularies for t in counter}) or 1

    best_rule, best_score, best_overlap = None, float("-inf"), 0
    for rule, counter in vocabularies:
        total = sum(counter.values())
        overlap = sum(1 for t in tokens if t in counter)
        score = 0.0
        for t in tokens:
            score += math.log((counter.get(t, 0) + 1) / (total + vocab_size))
        if overlap > 0 and score > best_score:
            best_rule, best_score, best_overlap = rule, score, overlap

    return best_rule if best_overlap > 0 else None


def explain_error(message: str) -> dict:
    """
    Translate a raw error string (an exception message, an HTTP status
    description, a stringified backend JSON error, ...) into a plain-
    English explanation plus a suggested next action.
    """
    if not message:
        return {
            "message": message,
            "explanation": "No error message provided.",
            "suggestion": "",
            "rule": None,
            "matched": False,
        }

    for rule in ERROR_RULES:
        if rule["pattern"].search(message):
            return {
                "message": message,
                "explanation": rule["explanation"],
                "suggestion": rule["suggestion"],
                "rule": rule["name"],
                "matched": True,
            }

    guess = _classify_by_word_overlap(message)
    if guess is not None:
        return {
            "message": message,
            "explanation": guess["explanation"],
            "suggestion": guess["suggestion"],
            "rule": guess["name"],
            "matched": False,
            "best_guess": True,
        }

    return {
        "message": message,
        "explanation": "Unrecognized error -- no matching rule.",
        "suggestion": "Check the raw message for details, or extend ERROR_RULES in nlp_tools.py.",
        "rule": None,
        "matched": False,
    }


# ---------------------------------------------------------------------------
# 3. Old-school "chatbot" tricks, repurposed for dev tooling
# ---------------------------------------------------------------------------
#
# A tiny n-gram/Markov model (collections.defaultdict(list) +
# random.choice), trained on nothing fancier than this workspace's own
# docstrings and Markdown files, used for search-query autocomplete /
# "did you mean" suggestions and an n-gram-overlap ranking boost --
# explicitly scoped as a nostalgia-flavored utility layer, not an
# attempt at a real assistant.


def build_ngram_model(text: str, n: int = 2) -> dict:
    """
    Build an order-`n` Markov model mapping an n-token key to the list
    of tokens observed to follow it in `text`. An empty/too-short text
    yields an empty model.
    """
    tokens = tokenize(text)
    model = defaultdict(list)
    for i in range(len(tokens) - n):
        key = tuple(tokens[i : i + n])
        model[key].append(tokens[i + n])
    return model


def generate_from_model(model: dict, max_tokens: int = 12, seed=None) -> str:
    """
    Walk `model` with random.choice() at each step to produce a short,
    inspectable continuation. Returns "" if the model has no data.
    """
    if not model:
        return ""
    n = len(next(iter(model)))
    keys = list(model.keys())
    key = seed if (seed is not None and seed in model) else random.choice(keys)

    result = list(key)
    for _ in range(max(0, max_tokens - len(key))):
        choices = model.get(key)
        if not choices:
            break
        result.append(random.choice(choices))
        key = tuple(result[-n:])
    return " ".join(result)


def did_you_mean(query: str, vocabulary, limit: int = 5, cutoff: float = 0.6) -> list:
    """
    difflib.get_close_matches() per query token against `vocabulary`
    (an iterable of known words), returning up to `limit` de-duplicated
    suggestions that aren't just the token itself.
    """
    tokens = tokenize(query)
    vocabulary = list(vocabulary)
    if not tokens or not vocabulary:
        return []

    seen, suggestions = set(), []
    for t in tokens:
        for match in difflib.get_close_matches(t, vocabulary, n=limit, cutoff=cutoff):
            if match != t and match not in seen:
                seen.add(match)
                suggestions.append(match)
    return suggestions[:limit]


def _ngrams(tokens: list, n: int = 2) -> set:
    if len(tokens) < n:
        return set(tokens)
    return {tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1)}


def ngram_overlap_score(query: str, text: str, n: int = 2) -> float:
    """
    Score how much `text` (e.g. a candidate search-result line) overlaps
    with `query` in n-gram space, as a ranking boost on top of a plain
    substring match. Returns 0.0..1.0 (fraction of query n-grams found
    in text).
    """
    q_tokens, t_tokens = tokenize(query), tokenize(text)
    if not q_tokens or not t_tokens:
        return 0.0
    q_grams, t_grams = _ngrams(q_tokens, n), _ngrams(t_tokens, n)
    if not q_grams:
        return 0.0
    return len(q_grams & t_grams) / len(q_grams)


# ---------------------------------------------------------------------------
# Corpus building: docstrings + Markdown, from a real directory on disk
# ---------------------------------------------------------------------------


def extract_docstrings(py_source: str) -> list:
    """Module/function/class docstrings from a Python source string, via `ast` (no execution)."""
    try:
        tree = ast.parse(py_source)
    except (SyntaxError, ValueError):
        return []

    docs = []
    module_doc = ast.get_docstring(tree)
    if module_doc:
        docs.append(module_doc)
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            doc = ast.get_docstring(node)
            if doc:
                docs.append(doc)
    return docs


def build_corpus(
    root: "str | Path",
    noise_dirs=frozenset(),
    max_files: int = 300,
    max_file_bytes: int = 200_000,
) -> str:
    """
    Walk `root` collecting Python docstrings and Markdown/plain-text
    content into one training corpus for build_ngram_model(). Bounded by
    `max_files`/`max_file_bytes` so this stays cheap even on a large
    workspace -- this is a small dev-tooling nicety, not a full index.
    """
    root = Path(root)
    parts, seen = [], 0

    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in noise_dirs]
        for fname in sorted(files):
            if seen >= max_files:
                return "\n".join(parts)
            fpath = Path(dirpath) / fname
            try:
                if fpath.stat().st_size > max_file_bytes:
                    continue
                if fname.endswith(".py"):
                    parts.extend(extract_docstrings(fpath.read_text(encoding="utf-8")))
                    seen += 1
                elif fname.lower().endswith((".md", ".txt")):
                    parts.append(fpath.read_text(encoding="utf-8"))
                    seen += 1
            except (OSError, UnicodeDecodeError):
                continue

    return "\n".join(parts)
