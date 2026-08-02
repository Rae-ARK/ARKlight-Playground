# Stage 5 tooling: `nlp_tools.py`

This is the reference doc for the three small, dependency-free helpers
added in Stage 5 (see `ROADMAP.md`). `backend/README.md` covers these
in one line each, in context with the rest of the API; this file goes
deeper on how each one works, how to extend it, and what it
deliberately doesn't do.

## Scope, in one paragraph

Everything in `nlp_tools.py` is built on the Python standard library —
`ast`, `collections`, `difflib`, `math`, `random`, `re` — and nothing
else. No numpy, no torch, no external model weights, no network calls,
no training step you have to run before it works. These are the same
category of technique 1990s/2000s-era chatbots and search tools used
before neural nets were practical to run locally: frequency counting,
Markov chains, bag-of-words, edit distance, hand-authored
pattern/response rules. They're framed here as small, auditable
developer-tooling utilities — not an attempt at a real assistant.

## The three features

### 1. Fuzzy path search — `fuzzy_search()`

**Endpoint:** `GET /workspace/search/fuzzy?q=<query>&limit=<n>` (default `limit=20`)

Ranks file/directory *paths* (not file contents — that's still
`/workspace/search`) against a typo-tolerant query. For each candidate
path:

1. Tokenize both the query and the path (splits on non-alphanumeric
   characters *and* camelCase boundaries, so `arklightFs`,
   `arklight-fs`, and `arklight_fs` all tokenize to `["arklight",
   "fs"]`).
2. Score a bag-of-words overlap: `min(query_count[t], path_count[t])`
   summed over shared tokens, via `collections.Counter`.
3. Add a difflib bonus: `difflib.get_close_matches()` finds path
   tokens that are *close but not identical* to a query token (cutoff
   `0.75`), so a single typo doesn't zero out the match.
4. Add `difflib.SequenceMatcher.ratio()` between the full query and
   path strings as a tie-breaker for whole-string similarity.
5. Combine as `overlap * 3.0 + bonus * 1.5 + similarity`, sort
   descending, cap at `limit`.

```bash
curl 'http://localhost:5000/workspace/search/fuzzy?q=worksapce&limit=5'
```

```json
{
  "query": "worksapce",
  "matches": [
    {"path": "src/workspaceProvider.ts", "score": 1.9848},
    {"path": "README.md", "score": 0.3333}
  ]
}
```

No index is persisted — paths are walked fresh on every call (same
`NOISE_DIRS`-filtered walk the other listing endpoints use), which is
fine for a workspace-sized tree and keeps this endpoint stateless.

### 2. Error translation — `explain_error()`

**Endpoint:** `GET /workspace/explain-error?message=<raw error string>`

`ERROR_RULES` in `nlp_tools.py` is a small ordered list of
`{name, pattern, explanation, suggestion}` dicts — the same shape as
ELIZA's substitution rules. Each `pattern` is a compiled case-
insensitive regex matched against the raw message with `.search()`,
first match wins:

| Rule | Matches | Example trigger |
|---|---|---|
| `permission_denied` | `errno 13`, "permission denied" | `OSError: [Errno 13] Permission denied` |
| `not_found` | `errno 2`, "no such file...", `404` | a 404 from `/workspace/stat/<path>` |
| `already_exists` | `409`, "already exists" | `POST /workspace/file/<path>` on an existing file |
| `stale_write_conflict` | `412`, "changed on disk" | a rejected `PUT` (`If-Unmodified-Since-Mtime` mismatch) |
| `readonly_mode` | `403`, "read-only mode" | any write while `ARKLIGHT_READONLY=1` |
| `path_escape` | "escapes workspace root" | a `../` traversal attempt |
| `read_size_limit` | `413`, "byte read limit" | a file over `ARKLIGHT_MAX_READ_BYTES` |
| `disk_full` | `errno 28`, "no space left" | disk-full `OSError` on write |
| `bad_request_body` | `400`, "must include" | a malformed rename/copy request body |

If nothing matches exactly, `_classify_by_word_overlap()` falls back
to a Naive-Bayes-flavored guess: it tokenizes the rule's own
`name + explanation + suggestion` text as that rule's "training
corpus" (no external corpus, per Stage 5's scope), computes a
Laplace-smoothed log-probability for the message's tokens against each
rule's vocabulary, and returns the best-scoring rule — but only if at
least one token actually overlaps, so an unrelated message correctly
comes back with no guess rather than a random rule.

```bash
curl 'http://localhost:5000/workspace/explain-error?message=something+weird+with+permission+stuff'
```

```json
{
  "message": "something weird with permission stuff",
  "explanation": "The backend doesn't have permission to access this file or directory.",
  "suggestion": "Check the file's owner/permissions on disk, or run the backend as a user with access.",
  "rule": "permission_denied",
  "matched": false,
  "best_guess": true
}
```

`matched: true` means an exact regex hit; `best_guess: true` (with
`matched: false`) means the fallback classifier picked it. A response
with `"rule": null` means neither found anything — the endpoint always
returns `200` either way; there's no error-in-explaining-an-error path.

**Adding a rule:** append a dict to `ERROR_RULES` with `name`,
`pattern` (a compiled `re` pattern), `explanation`, and `suggestion`.
No other wiring needed — the fallback classifier's vocabulary is
rebuilt lazily from whatever's in the list.

### 3. "Did you mean" + autocomplete — n-gram model

**Endpoint:** `GET /workspace/search/suggest?q=<query>&limit=<n>` (default `limit=5`)

Two independent stdlib tricks, both trained on the same small corpus:

- **`did_you_mean()`** — `difflib.get_close_matches()` per query token
  against a vocabulary, returning close-but-different words.
- **`build_ngram_model()` / `generate_from_model()`** — an order-2
  Markov model (`collections.defaultdict(list)` mapping a 2-token key
  to the tokens observed to follow it) walked with `random.choice()`
  to produce a short, fully-inspectable continuation.

**Where the corpus comes from:** `build_corpus()` walks the *current
workspace's* own tree (respecting the standard `NOISE_DIRS` filter),
pulling:
- Every docstring from every `.py` file, extracted via `ast.parse()` +
  `ast.get_docstring()` — not regex, so it can't be fooled by a
  triple-quoted string that isn't actually a docstring.
- The raw text of every `.md`/`.txt` file.

capped at 300 files / 200KB per file so this stays cheap even on a
larger tree. The result is cached per backend process the first time
`/workspace/search/suggest` is called (not built at startup — building
it is real, if bounded, I/O work that a bare `create_app()` shouldn't
do just to exist).

```bash
curl 'http://localhost:5000/workspace/search/suggest?q=worksapce'
```

```json
{
  "query": "worksapce",
  "did_you_mean": ["workspace"],
  "completion": "workbench provides the workspace root for the workbench provides the"
}
```

On a workspace with no `.py`/`.md`/`.txt` content to learn from, both
fields degrade gracefully to `[]` / `""` rather than erroring.

## What this deliberately doesn't do

Straight from `ROADMAP.md`'s Stage 5 remainder:

- `/workspace/search`'s existing substring-match ranking is
  **unchanged**. `ngram_overlap_score()` exists and is unit-tested,
  but isn't wired into that endpoint yet — doing so would change its
  response ordering, and there's no client depending on the boost yet.
- The fuzzy index only covers file/dir **paths**, not exported symbol
  names (functions, classes). That needs a lightweight symbol
  extractor and is tracked as its own backlog item.
- The n-gram corpus is docstrings + Markdown only — no `git log`.
  `WORKSPACE_ROOT` isn't guaranteed to be a git repository, and
  shelling out to git felt like scope creep for a stage explicitly
  scoped to "small, dependency-free tooling."

## Testing

- `backend/tests/test_nlp_tools.py` — pure unit tests against
  `nlp_tools.py` directly (tokenizer, fuzzy ranking, rule matching +
  fallback classifier, n-gram model, corpus building). No Flask, no
  network.
- `backend/tests/test_app.py` — endpoint-level tests (400s on missing
  params, typo-tolerance end-to-end, the empty-workspace edge case for
  `/workspace/search/suggest`).

```bash
cd backend
python -m pytest tests/test_nlp_tools.py tests/test_app.py -v
```
