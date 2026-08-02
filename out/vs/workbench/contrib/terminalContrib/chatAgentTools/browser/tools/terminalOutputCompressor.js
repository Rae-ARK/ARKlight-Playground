import { TerminalToolId } from "../../../../chat/common/tools/terminalToolIds.js";
import { parseCommand, parseCommandHead as _parseCommandHead, segmentHasFlag, segmentHead } from "./terminalCommandParser.js";
import { TerminalOutputCache } from "./terminalOutputCache.js";
function isTerminalInput(input) {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  const terminalInput = input;
  return terminalInput.command === void 0 || typeof terminalInput.command === "string";
}
const parseCommandHead = _parseCommandHead;
function makeMatcher(opts) {
  const allowedSubs = opts.sub === "*" || opts.sub === void 0 ? void 0 : opts.sub === null ? null : typeof opts.sub === "string" ? /* @__PURE__ */ new Set([opts.sub]) : new Set(opts.sub);
  return (input) => {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    for (const seg of parsed.segments) {
      const head = segmentHead(seg);
      if (!head || head.head !== opts.head) {
        continue;
      }
      if (allowedSubs === null) {
        if (head.sub !== void 0) {
          continue;
        }
      } else if (allowedSubs !== void 0) {
        if (head.sub === void 0 || !allowedSubs.has(head.sub)) {
          continue;
        }
      }
      if (opts.flag && !opts.flag(seg)) {
        continue;
      }
      return true;
    }
    return false;
  };
}
const gitDiffFilter = {
  id: "terminal.git-diff",
  toolIds: [TerminalToolId.RunInTerminal],
  matches: (_toolId, input) => makeMatcher({ head: "git", sub: ["diff", "show"] })(input),
  apply(text) {
    const lines = text.split("\n");
    const out = [];
    const KEEP_CONTEXT = 1;
    let contextRun = 0;
    let inBinaryOrLock = false;
    let pendingHunkHeaderIndex = -1;
    let pendingHunkOldStart = 0;
    let pendingHunkNewStart = 0;
    let pendingOldLines = 0;
    let pendingNewLines = 0;
    const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
    const flushHunk = () => {
      if (pendingHunkHeaderIndex < 0) {
        return;
      }
      out[pendingHunkHeaderIndex] = `@@ -${pendingHunkOldStart},${pendingOldLines} +${pendingHunkNewStart},${pendingNewLines} @@`;
      pendingHunkHeaderIndex = -1;
    };
    const flushContextRun = () => {
      const omitted = contextRun - KEEP_CONTEXT;
      if (omitted > 0) {
        out.push(`... ${omitted} unchanged context line${omitted === 1 ? "" : "s"} omitted ...`);
      }
      contextRun = 0;
    };
    for (const line of lines) {
      if (line.startsWith("diff --git")) {
        flushContextRun();
        flushHunk();
        inBinaryOrLock = /package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|\.snap$/.test(line);
        if (inBinaryOrLock) {
          out.push(line);
          out.push("... lockfile/snapshot diff omitted ...");
          continue;
        }
        out.push(line);
        continue;
      }
      if (inBinaryOrLock) {
        continue;
      }
      if (line.startsWith("index ") || line.startsWith("similarity index ") || line.startsWith("dissimilarity index ") || line.startsWith("rename from ") || line.startsWith("rename to ")) {
        continue;
      }
      const hunkMatch = HUNK_RE.exec(line);
      if (hunkMatch) {
        flushContextRun();
        flushHunk();
        pendingHunkOldStart = parseInt(hunkMatch[1], 10);
        pendingHunkNewStart = parseInt(hunkMatch[3], 10);
        pendingOldLines = 0;
        pendingNewLines = 0;
        pendingHunkHeaderIndex = out.length;
        out.push(line);
        continue;
      }
      if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("Binary files ")) {
        flushContextRun();
        flushHunk();
        out.push(line);
        continue;
      }
      if (line.startsWith("+")) {
        flushContextRun();
        out.push(line);
        pendingNewLines++;
        continue;
      }
      if (line.startsWith("-")) {
        flushContextRun();
        out.push(line);
        pendingOldLines++;
        continue;
      }
      if (!line.startsWith(" ")) {
        flushContextRun();
        out.push(line);
        continue;
      }
      contextRun++;
      if (contextRun <= KEEP_CONTEXT) {
        out.push(line);
        pendingOldLines++;
        pendingNewLines++;
      }
    }
    flushContextRun();
    flushHunk();
    const result = out.join("\n");
    return { text: result, compressed: result.length < text.length };
  }
};
const gitLogFilter = {
  id: "terminal.git-log",
  toolIds: [TerminalToolId.RunInTerminal],
  matches: (_toolId, input) => makeMatcher({ head: "git", sub: ["log", "reflog", "shortlog"] })(input),
  apply(text) {
    const lines = text.split("\n");
    const out = [];
    let blankRun = 0;
    for (const line of lines) {
      if (line.trim() === "") {
        blankRun++;
        if (blankRun <= 1) {
          out.push(line);
        }
        continue;
      }
      blankRun = 0;
      out.push(line);
    }
    while (out.length > 0 && out[out.length - 1].trim() === "") {
      out.pop();
    }
    const result = out.join("\n");
    return { text: result, compressed: result.length < text.length };
  }
};
const gitStatusFilter = {
  id: "terminal.git-status",
  toolIds: [TerminalToolId.RunInTerminal],
  matches: (_toolId, input) => makeMatcher({ head: "git", sub: "status" })(input),
  apply(text) {
    const HINT_PATTERNS = [
      /^\s*\(use "git add.*"\s+to.*\)\s*$/,
      /^\s*\(use "git restore.*"\s+to.*\)\s*$/,
      /^\s*\(use "git rm --cached.*"\s+to.*\)\s*$/,
      /^\s*\(use "git push" to publish.*\)\s*$/,
      /^\s*\(commit or discard.*\)\s*$/
    ];
    const lines = text.split("\n");
    const out = [];
    for (const line of lines) {
      if (HINT_PATTERNS.some((re) => re.test(line))) {
        continue;
      }
      out.push(line);
    }
    const result = out.join("\n");
    return { text: result, compressed: result.length < text.length };
  }
};
const lsFilter = {
  id: "terminal.ls",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    for (const seg of parsed.segments) {
      const head = segmentHead(seg);
      if (head?.head !== "ls") {
        continue;
      }
      if (segmentHasFlag(seg, ["l"])) {
        return true;
      }
    }
    return false;
  },
  apply(text) {
    const lines = text.split("\n");
    const out = [];
    const longRe = /^[-dlcbpsDLCBPS][rwx\-tTsS@+.]{9,}\s+\d+\s+\S+\s+\S+\s+\d+\s+\S+\s+\S+\s+\S+\s+(.+)$/;
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      if (line.startsWith("total ")) {
        continue;
      }
      const m = longRe.exec(line);
      if (m) {
        const isDir = line.startsWith("d");
        out.push(isDir ? m[1] + "/" : m[1]);
      } else {
        out.push(line);
      }
    }
    const result = out.join("\n");
    return { text: result, compressed: result.length < text.length };
  }
};
const MAX_LIST_LINES = 200;
function capLines(text, max, label) {
  const lines = text.split("\n");
  if (lines.length <= max + 1) {
    return { text, compressed: false };
  }
  const kept = lines.slice(0, max);
  const omitted = lines.length - max;
  kept.push(`... ${omitted} ${label} lines omitted ...`);
  const result = kept.join("\n");
  return { text: result, compressed: result.length < text.length };
}
const findFilter = {
  id: "terminal.find",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    return parsed.segments.some((seg) => segmentHead(seg)?.head === "find");
  },
  apply: (text) => capLines(text, MAX_LIST_LINES, "find result")
};
const grepFilter = {
  id: "terminal.grep",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    return parsed.segments.some((seg) => {
      const head = segmentHead(seg);
      return head !== void 0 && (head.head === "grep" || head.head === "rg" || head.head === "ack" || head.head === "ag");
    });
  },
  apply: (text) => capLines(text, MAX_LIST_LINES, "matching")
};
const treeFilter = {
  id: "terminal.tree",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    return parsed.segments.some((seg) => segmentHead(seg)?.head === "tree");
  },
  apply: (text) => capLines(text, MAX_LIST_LINES, "tree")
};
function compressTestRunnerOutput(text) {
  const lines = text.split("\n");
  const dropPatterns = [
    /^\s*PASS\s+\S+/,
    /^\s*ok\s+\d+\s+/,
    /^\s*\u2713\s/,
    /^\s*[.sSEFx]{10,}\s*$/,
    /^test\s.+ \.\.\. ok\s*$/,
    /^running \d+ tests?$/i
  ];
  const out = [];
  for (const line of lines) {
    if (dropPatterns.some((re) => re.test(line))) {
      continue;
    }
    out.push(line);
  }
  const result = out.join("\n");
  return { text: result, compressed: result.length < text.length };
}
const testRunnerFilter = {
  id: "terminal.test-runner",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    for (const seg of parsed.segments) {
      const head = segmentHead(seg);
      if (!head) {
        continue;
      }
      if (head.head === "pytest" || head.head === "jest" || head.head === "vitest" || head.head === "playwright" || head.head === "mocha") {
        return true;
      }
      if (head.head === "cargo" && head.sub && /^(test|nextest)$/.test(head.sub)) {
        return true;
      }
      if (head.head === "go" && head.sub === "test") {
        return true;
      }
      if ((head.head === "npm" || head.head === "pnpm" || head.head === "yarn") && head.sub === "test") {
        return true;
      }
      if (head.head === "npx" && head.sub && /^(jest|vitest|playwright|mocha)$/.test(head.sub)) {
        return true;
      }
    }
    return false;
  },
  apply: (text) => compressTestRunnerOutput(text)
};
function compressBuildOutput(text) {
  const dropPatterns = [
    /^\s*Compiling\s+\S+\s+v\S+/,
    /^\s*Downloading\s+\S+/,
    /^\s*Downloaded\s+\S+/,
    /^\s*Updating\s+crates\.io\s+index/,
    /^\s*Finished\s+(dev|release|test)/,
    /^make\[\d+\]: (Entering|Leaving) directory/,
    /^Download(ed|ing) https?:/,
    /^\[INFO\] Downloading from /,
    /^\[INFO\] Downloaded from /,
    /^> Task :/
  ];
  const lines = text.split("\n");
  const out = [];
  for (const line of lines) {
    if (dropPatterns.some((re) => re.test(line))) {
      continue;
    }
    out.push(line);
  }
  const result = out.join("\n");
  return { text: result, compressed: result.length < text.length };
}
const buildToolFilter = {
  id: "terminal.build-tool",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    for (const seg of parsed.segments) {
      const head = segmentHead(seg);
      if (!head) {
        continue;
      }
      if (head.head === "cargo" && head.sub && /^(build|check|clippy)$/.test(head.sub)) {
        return true;
      }
      if (head.head === "go" && (head.sub === "build" || head.sub === "vet")) {
        return true;
      }
      if (head.head === "make" || head.head === "tsc" || head.head === "gradle" || head.head === "mvn") {
        return true;
      }
      if (head.head === "dotnet" && head.sub === "build") {
        return true;
      }
    }
    return false;
  },
  apply: (text) => compressBuildOutput(text)
};
function compressLinterOutput(text) {
  const lines = text.split("\n");
  const dropPatterns = [
    /^\s*Success: no issues found\s*$/i,
    /^\s*All checks passed\.?\s*$/i,
    /^\s*Success:\s*0 errors/i
  ];
  const out = [];
  for (const line of lines) {
    if (dropPatterns.some((re) => re.test(line))) {
      continue;
    }
    out.push(line);
  }
  const result = out.join("\n");
  return { text: result, compressed: result.length < text.length };
}
const linterFilter = {
  id: "terminal.linter",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    for (const seg of parsed.segments) {
      const head = segmentHead(seg);
      if (!head) {
        continue;
      }
      if (head.head === "eslint" || head.head === "ruff" || head.head === "mypy" || head.head === "prettier" || head.head === "rubocop" || head.head === "golangci-lint") {
        return true;
      }
      if (head.head === "cargo" && head.sub === "clippy") {
        return true;
      }
      if (head.head === "npx" && head.sub && /^(eslint|prettier|tsc)$/.test(head.sub)) {
        return true;
      }
    }
    return false;
  },
  apply: (text) => compressLinterOutput(text)
};
const npmInstallFilter = {
  id: "terminal.npm-install",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    for (const seg of parsed.segments) {
      const head = segmentHead(seg);
      if (!head) {
        continue;
      }
      if (head.head === "npm" && head.sub && /^(install|i|ci|add)$/.test(head.sub)) {
        return true;
      }
      if (head.head === "yarn" || head.head === "pnpm") {
        if (head.sub === "install" || head.sub === "add" || head.sub === "i") {
          return true;
        }
        if (head.sub === void 0) {
          return true;
        }
      }
    }
    return false;
  },
  apply(text) {
    const lines = text.split("\n");
    const dropPatterns = [
      /^npm warn deprecated /i,
      /^\s*\[#+>?\s*\] /,
      /^npm http /i,
      /^npm timing /i,
      /^npm sill /i,
      /^npm verb /i,
      /^\s*\d+ packages? are looking for funding/i,
      /run `npm fund`/i,
      /^Run `npm audit/i
    ];
    const out = [];
    for (const line of lines) {
      if (dropPatterns.some((re) => re.test(line))) {
        continue;
      }
      out.push(line);
    }
    const result = out.join("\n");
    return { text: result, compressed: result.length < text.length };
  }
};
const envFilter = {
  id: "terminal.env",
  toolIds: [TerminalToolId.RunInTerminal],
  matches(_toolId, input) {
    if (!isTerminalInput(input)) {
      return false;
    }
    const parsed = parseCommand(input.command);
    if (!parsed) {
      return false;
    }
    for (const seg of parsed.segments) {
      const head = segmentHead(seg);
      if (head?.head === "printenv") {
        return true;
      }
      if (head === void 0 && seg.wrappers.length > 0 && seg.wrappers[seg.wrappers.length - 1] === "env" && seg.tokens.length === 0) {
        return true;
      }
    }
    return false;
  },
  apply(text) {
    const lines = text.split("\n").filter((l) => l.trim() !== "");
    const unique = Array.from(new Set(lines)).sort();
    const result = unique.join("\n");
    return { text: result, compressed: result.length < text.length };
  }
};
function registerTerminalCompressors(compressor) {
  compressor.registerFilter(gitDiffFilter);
  compressor.registerFilter(gitLogFilter);
  compressor.registerFilter(gitStatusFilter);
  compressor.registerFilter(lsFilter);
  compressor.registerFilter(findFilter);
  compressor.registerFilter(grepFilter);
  compressor.registerFilter(treeFilter);
  compressor.registerFilter(testRunnerFilter);
  compressor.registerFilter(buildToolFilter);
  compressor.registerFilter(linterFilter);
  compressor.registerFilter(npmInstallFilter);
  compressor.registerFilter(envFilter);
  compressor.registerCache(new TerminalOutputCache());
}
export {
  buildToolFilter,
  envFilter,
  findFilter,
  gitDiffFilter,
  gitLogFilter,
  gitStatusFilter,
  grepFilter,
  linterFilter,
  lsFilter,
  npmInstallFilter,
  parseCommandHead,
  registerTerminalCompressors,
  testRunnerFilter,
  treeFilter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL3Rlcm1pbmFsT3V0cHV0Q29tcHJlc3Nvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFRlcm1pbmFsVG9vbElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvdGVybWluYWxUb29sSWRzLmpzJztcbmltcG9ydCB7IElUb29sUmVzdWx0Q29tcHJlc3NvciwgSVRvb2xSZXN1bHRGaWx0ZXIsIElUb29sUmVzdWx0RmlsdGVyT3V0cHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvdG9vbFJlc3VsdENvbXByZXNzb3IuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZWdtZW50LCBwYXJzZUNvbW1hbmQsIHBhcnNlQ29tbWFuZEhlYWQgYXMgX3BhcnNlQ29tbWFuZEhlYWQsIHNlZ21lbnRIYXNGbGFnLCBzZWdtZW50SGVhZCB9IGZyb20gJy4vdGVybWluYWxDb21tYW5kUGFyc2VyLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsT3V0cHV0Q2FjaGUgfSBmcm9tICcuL3Rlcm1pbmFsT3V0cHV0Q2FjaGUuanMnO1xuXG4vKipcbiAqIElucHV0IHNoYXBlIHVzZWQgYnkgdGhlIGNvcmUgYHJ1bl9pbl90ZXJtaW5hbGAgdG9vbC4gV2Ugb25seSBkZXBlbmQgb24gdGhlXG4gKiBgY29tbWFuZGAgZmllbGQ7IGV2ZXJ5dGhpbmcgZWxzZSBpcyBpZ25vcmVkLlxuICovXG5pbnRlcmZhY2UgSVRlcm1pbmFsSW5wdXQge1xuXHRjb21tYW5kPzogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBpc1Rlcm1pbmFsSW5wdXQoaW5wdXQ6IHVua25vd24pOiBpbnB1dCBpcyBJVGVybWluYWxJbnB1dCB7XG5cdGlmICh0eXBlb2YgaW5wdXQgIT09ICdvYmplY3QnIHx8IGlucHV0ID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IHRlcm1pbmFsSW5wdXQgPSBpbnB1dCBhcyB7IGNvbW1hbmQ/OiB1bmtub3duIH07XG5cdHJldHVybiB0ZXJtaW5hbElucHV0LmNvbW1hbmQgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdGVybWluYWxJbnB1dC5jb21tYW5kID09PSAnc3RyaW5nJztcbn1cblxuLyoqIEJhY2t3YXJkcy1jb21wYXRpYmxlIHJlLWV4cG9ydCBzbyBleGlzdGluZyB0ZXN0cy9jb25zdW1lcnMga2VlcCB3b3JraW5nLiAqL1xuZXhwb3J0IGNvbnN0IHBhcnNlQ29tbWFuZEhlYWQgPSBfcGFyc2VDb21tYW5kSGVhZDtcblxuLyoqXG4gKiBCdWlsZCBhIGZpbHRlciBtYXRjaGVyIHRoYXQgZmlyZXMgd2hlbiBhbnkgc2VnbWVudCBvZiB0aGUgY29tbWFuZCBsaW5lXG4gKiBoYXMgdGhlIGdpdmVuIGAoaGVhZCwgc3ViKWAgc2hhcGUsIG9wdGlvbmFsbHkgcmVzdHJpY3RlZCBieSBhIGZsYWdcbiAqIHByZWRpY2F0ZS4gYHN1YiA9PT0gJyonYCBtYXRjaGVzIGFueSBzdWJjb21tYW5kOyBgc3ViID09PSBudWxsYCBtYXRjaGVzXG4gKiBjb21tYW5kcyB3aXRoIG5vIHN1YmNvbW1hbmQuXG4gKi9cbmZ1bmN0aW9uIG1ha2VNYXRjaGVyKG9wdHM6IHtcblx0aGVhZDogc3RyaW5nO1xuXHRzdWI/OiBzdHJpbmcgfCByZWFkb25seSBzdHJpbmdbXSB8ICcqJyB8IG51bGw7XG5cdGZsYWc/OiAoc2VnOiBJQ29tbWFuZFNlZ21lbnQpID0+IGJvb2xlYW47XG59KSB7XG5cdGNvbnN0IGFsbG93ZWRTdWJzID0gb3B0cy5zdWIgPT09ICcqJyB8fCBvcHRzLnN1YiA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkXG5cdFx0OiBvcHRzLnN1YiA9PT0gbnVsbCA/IG51bGxcblx0XHRcdDogdHlwZW9mIG9wdHMuc3ViID09PSAnc3RyaW5nJyA/IG5ldyBTZXQoW29wdHMuc3ViXSlcblx0XHRcdFx0OiBuZXcgU2V0KG9wdHMuc3ViKTtcblx0cmV0dXJuIChpbnB1dDogdW5rbm93bik6IGJvb2xlYW4gPT4ge1xuXHRcdGlmICghaXNUZXJtaW5hbElucHV0KGlucHV0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNvbW1hbmQoaW5wdXQuY29tbWFuZCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZWcgb2YgcGFyc2VkLnNlZ21lbnRzKSB7XG5cdFx0XHRjb25zdCBoZWFkID0gc2VnbWVudEhlYWQoc2VnKTtcblx0XHRcdGlmICghaGVhZCB8fCBoZWFkLmhlYWQgIT09IG9wdHMuaGVhZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChhbGxvd2VkU3VicyA9PT0gbnVsbCkge1xuXHRcdFx0XHRpZiAoaGVhZC5zdWIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGFsbG93ZWRTdWJzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aWYgKGhlYWQuc3ViID09PSB1bmRlZmluZWQgfHwgIWFsbG93ZWRTdWJzLmhhcyhoZWFkLnN1YikpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKG9wdHMuZmxhZyAmJiAhb3B0cy5mbGFnKHNlZykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9O1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFZDU1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogQ29tcHJlc3NlcyBgZ2l0IGRpZmZgIC8gYGdpdCBzaG93YCBvdXRwdXQgYnkgcmVkdWNpbmcgY29udGV4dCBsaW5lcyB0byBhXG4gKiB0aWdodGVyIHdpbmRvdyBhbmQgZHJvcHBpbmcgdGhlIGh1Z2Ugbm8tb3AgY2h1bmtzIHRoYXQgZGlmZnMgb2YgZ2VuZXJhdGVkXG4gKiBmaWxlcyAobG9ja2ZpbGVzLCBzbmFwc2hvdHMpIHByb2R1Y2UuXG4gKlxuICogTm90YWJseSB0aGlzIGRvZXMgKipub3QqKiBtYXRjaCBgZ2l0IGRpZmZ0b29sYCwgd2hpY2ggcHJpbnRzIGEgZGlmZmVyZW50XG4gKiBmb3JtYXQgYW5kIHdvdWxkIGJlIGNvcnJ1cHRlZCBieSBodW5rLWhlYWRlciByZXdyaXRpbmcuXG4gKi9cbmV4cG9ydCBjb25zdCBnaXREaWZmRmlsdGVyOiBJVG9vbFJlc3VsdEZpbHRlciA9IHtcblx0aWQ6ICd0ZXJtaW5hbC5naXQtZGlmZicsXG5cdHRvb2xJZHM6IFtUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsXSxcblx0bWF0Y2hlczogKF90b29sSWQsIGlucHV0KSA9PiBtYWtlTWF0Y2hlcih7IGhlYWQ6ICdnaXQnLCBzdWI6IFsnZGlmZicsICdzaG93J10gfSkoaW5wdXQpLFxuXHRhcHBseSh0ZXh0KTogSVRvb2xSZXN1bHRGaWx0ZXJPdXRwdXQge1xuXHRcdGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJyk7XG5cdFx0Y29uc3Qgb3V0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IEtFRVBfQ09OVEVYVCA9IDE7XG5cdFx0bGV0IGNvbnRleHRSdW4gPSAwO1xuXHRcdGxldCBpbkJpbmFyeU9yTG9jayA9IGZhbHNlO1xuXG5cdFx0bGV0IHBlbmRpbmdIdW5rSGVhZGVySW5kZXggPSAtMTtcblx0XHRsZXQgcGVuZGluZ0h1bmtPbGRTdGFydCA9IDA7XG5cdFx0bGV0IHBlbmRpbmdIdW5rTmV3U3RhcnQgPSAwO1xuXHRcdGxldCBwZW5kaW5nT2xkTGluZXMgPSAwO1xuXHRcdGxldCBwZW5kaW5nTmV3TGluZXMgPSAwO1xuXG5cdFx0Y29uc3QgSFVOS19SRSA9IC9eQEAgLShcXGQrKSg/OiwoXFxkKykpPyBcXCsoXFxkKykoPzosKFxcZCspKT8gQEAvO1xuXG5cdFx0Y29uc3QgZmx1c2hIdW5rID0gKCkgPT4ge1xuXHRcdFx0aWYgKHBlbmRpbmdIdW5rSGVhZGVySW5kZXggPCAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdG91dFtwZW5kaW5nSHVua0hlYWRlckluZGV4XSA9IGBAQCAtJHtwZW5kaW5nSHVua09sZFN0YXJ0fSwke3BlbmRpbmdPbGRMaW5lc30gKyR7cGVuZGluZ0h1bmtOZXdTdGFydH0sJHtwZW5kaW5nTmV3TGluZXN9IEBAYDtcblx0XHRcdHBlbmRpbmdIdW5rSGVhZGVySW5kZXggPSAtMTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZmx1c2hDb250ZXh0UnVuID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb21pdHRlZCA9IGNvbnRleHRSdW4gLSBLRUVQX0NPTlRFWFQ7XG5cdFx0XHRpZiAob21pdHRlZCA+IDApIHtcblx0XHRcdFx0b3V0LnB1c2goYC4uLiAke29taXR0ZWR9IHVuY2hhbmdlZCBjb250ZXh0IGxpbmUke29taXR0ZWQgPT09IDEgPyAnJyA6ICdzJ30gb21pdHRlZCAuLi5gKTtcblx0XHRcdH1cblx0XHRcdGNvbnRleHRSdW4gPSAwO1xuXHRcdH07XG5cblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRcdGlmIChsaW5lLnN0YXJ0c1dpdGgoJ2RpZmYgLS1naXQnKSkge1xuXHRcdFx0XHRmbHVzaENvbnRleHRSdW4oKTtcblx0XHRcdFx0Zmx1c2hIdW5rKCk7XG5cdFx0XHRcdGluQmluYXJ5T3JMb2NrID0gL3BhY2thZ2UtbG9ja1xcLmpzb258eWFyblxcLmxvY2t8cG5wbS1sb2NrXFwueWFtbHxidW5cXC5sb2NrYnxcXC5zbmFwJC8udGVzdChsaW5lKTtcblx0XHRcdFx0aWYgKGluQmluYXJ5T3JMb2NrKSB7XG5cdFx0XHRcdFx0b3V0LnB1c2gobGluZSk7XG5cdFx0XHRcdFx0b3V0LnB1c2goJy4uLiBsb2NrZmlsZS9zbmFwc2hvdCBkaWZmIG9taXR0ZWQgLi4uJyk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3V0LnB1c2gobGluZSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGluQmluYXJ5T3JMb2NrKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxpbmUuc3RhcnRzV2l0aCgnaW5kZXggJykgfHwgbGluZS5zdGFydHNXaXRoKCdzaW1pbGFyaXR5IGluZGV4ICcpIHx8XG5cdFx0XHRcdGxpbmUuc3RhcnRzV2l0aCgnZGlzc2ltaWxhcml0eSBpbmRleCAnKSB8fCBsaW5lLnN0YXJ0c1dpdGgoJ3JlbmFtZSBmcm9tICcpIHx8XG5cdFx0XHRcdGxpbmUuc3RhcnRzV2l0aCgncmVuYW1lIHRvICcpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaHVua01hdGNoID0gSFVOS19SRS5leGVjKGxpbmUpO1xuXHRcdFx0aWYgKGh1bmtNYXRjaCkge1xuXHRcdFx0XHRmbHVzaENvbnRleHRSdW4oKTtcblx0XHRcdFx0Zmx1c2hIdW5rKCk7XG5cdFx0XHRcdHBlbmRpbmdIdW5rT2xkU3RhcnQgPSBwYXJzZUludChodW5rTWF0Y2hbMV0sIDEwKTtcblx0XHRcdFx0cGVuZGluZ0h1bmtOZXdTdGFydCA9IHBhcnNlSW50KGh1bmtNYXRjaFszXSwgMTApO1xuXHRcdFx0XHRwZW5kaW5nT2xkTGluZXMgPSAwO1xuXHRcdFx0XHRwZW5kaW5nTmV3TGluZXMgPSAwO1xuXHRcdFx0XHRwZW5kaW5nSHVua0hlYWRlckluZGV4ID0gb3V0Lmxlbmd0aDtcblx0XHRcdFx0b3V0LnB1c2gobGluZSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxpbmUuc3RhcnRzV2l0aCgnKysrICcpIHx8IGxpbmUuc3RhcnRzV2l0aCgnLS0tICcpIHx8IGxpbmUuc3RhcnRzV2l0aCgnQmluYXJ5IGZpbGVzICcpKSB7XG5cdFx0XHRcdGZsdXNoQ29udGV4dFJ1bigpO1xuXHRcdFx0XHRmbHVzaEh1bmsoKTtcblx0XHRcdFx0b3V0LnB1c2gobGluZSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxpbmUuc3RhcnRzV2l0aCgnKycpKSB7XG5cdFx0XHRcdGZsdXNoQ29udGV4dFJ1bigpO1xuXHRcdFx0XHRvdXQucHVzaChsaW5lKTtcblx0XHRcdFx0cGVuZGluZ05ld0xpbmVzKys7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxpbmUuc3RhcnRzV2l0aCgnLScpKSB7XG5cdFx0XHRcdGZsdXNoQ29udGV4dFJ1bigpO1xuXHRcdFx0XHRvdXQucHVzaChsaW5lKTtcblx0XHRcdFx0cGVuZGluZ09sZExpbmVzKys7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFsaW5lLnN0YXJ0c1dpdGgoJyAnKSkge1xuXHRcdFx0XHRmbHVzaENvbnRleHRSdW4oKTtcblx0XHRcdFx0b3V0LnB1c2gobGluZSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29udGV4dFJ1bisrO1xuXHRcdFx0aWYgKGNvbnRleHRSdW4gPD0gS0VFUF9DT05URVhUKSB7XG5cdFx0XHRcdG91dC5wdXNoKGxpbmUpO1xuXHRcdFx0XHRwZW5kaW5nT2xkTGluZXMrKztcblx0XHRcdFx0cGVuZGluZ05ld0xpbmVzKys7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZsdXNoQ29udGV4dFJ1bigpO1xuXHRcdGZsdXNoSHVuaygpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gb3V0LmpvaW4oJ1xcbicpO1xuXHRcdHJldHVybiB7IHRleHQ6IHJlc3VsdCwgY29tcHJlc3NlZDogcmVzdWx0Lmxlbmd0aCA8IHRleHQubGVuZ3RoIH07XG5cdH0sXG59O1xuXG4vKiogVHJpbSBgZ2l0IGxvZ2Agb3V0cHV0OiBjb2xsYXBzZSBtdWx0aXBsZSBibGFuay1saW5lIHJ1bnMuICovXG5leHBvcnQgY29uc3QgZ2l0TG9nRmlsdGVyOiBJVG9vbFJlc3VsdEZpbHRlciA9IHtcblx0aWQ6ICd0ZXJtaW5hbC5naXQtbG9nJyxcblx0dG9vbElkczogW1Rlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWxdLFxuXHRtYXRjaGVzOiAoX3Rvb2xJZCwgaW5wdXQpID0+IG1ha2VNYXRjaGVyKHsgaGVhZDogJ2dpdCcsIHN1YjogWydsb2cnLCAncmVmbG9nJywgJ3Nob3J0bG9nJ10gfSkoaW5wdXQpLFxuXHRhcHBseSh0ZXh0KTogSVRvb2xSZXN1bHRGaWx0ZXJPdXRwdXQge1xuXHRcdGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJyk7XG5cdFx0Y29uc3Qgb3V0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBibGFua1J1biA9IDA7XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHRpZiAobGluZS50cmltKCkgPT09ICcnKSB7XG5cdFx0XHRcdGJsYW5rUnVuKys7XG5cdFx0XHRcdGlmIChibGFua1J1biA8PSAxKSB7XG5cdFx0XHRcdFx0b3V0LnB1c2gobGluZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRibGFua1J1biA9IDA7XG5cdFx0XHRvdXQucHVzaChsaW5lKTtcblx0XHR9XG5cdFx0d2hpbGUgKG91dC5sZW5ndGggPiAwICYmIG91dFtvdXQubGVuZ3RoIC0gMV0udHJpbSgpID09PSAnJykge1xuXHRcdFx0b3V0LnBvcCgpO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBvdXQuam9pbignXFxuJyk7XG5cdFx0cmV0dXJuIHsgdGV4dDogcmVzdWx0LCBjb21wcmVzc2VkOiByZXN1bHQubGVuZ3RoIDwgdGV4dC5sZW5ndGggfTtcblx0fSxcbn07XG5cbi8qKiBEcm9wIHRoZSBsb25nIFwiKHVzZSAuLi4gKVwiIGhpbnQgYmxvY2tzIGluIGBnaXQgc3RhdHVzYC4gKi9cbmV4cG9ydCBjb25zdCBnaXRTdGF0dXNGaWx0ZXI6IElUb29sUmVzdWx0RmlsdGVyID0ge1xuXHRpZDogJ3Rlcm1pbmFsLmdpdC1zdGF0dXMnLFxuXHR0b29sSWRzOiBbVGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbF0sXG5cdG1hdGNoZXM6IChfdG9vbElkLCBpbnB1dCkgPT4gbWFrZU1hdGNoZXIoeyBoZWFkOiAnZ2l0Jywgc3ViOiAnc3RhdHVzJyB9KShpbnB1dCksXG5cdGFwcGx5KHRleHQpOiBJVG9vbFJlc3VsdEZpbHRlck91dHB1dCB7XG5cdFx0Y29uc3QgSElOVF9QQVRURVJOUyA9IFtcblx0XHRcdC9eXFxzKlxcKHVzZSBcImdpdCBhZGQuKlwiXFxzK3RvLipcXClcXHMqJC8sXG5cdFx0XHQvXlxccypcXCh1c2UgXCJnaXQgcmVzdG9yZS4qXCJcXHMrdG8uKlxcKVxccyokLyxcblx0XHRcdC9eXFxzKlxcKHVzZSBcImdpdCBybSAtLWNhY2hlZC4qXCJcXHMrdG8uKlxcKVxccyokLyxcblx0XHRcdC9eXFxzKlxcKHVzZSBcImdpdCBwdXNoXCIgdG8gcHVibGlzaC4qXFwpXFxzKiQvLFxuXHRcdFx0L15cXHMqXFwoY29tbWl0IG9yIGRpc2NhcmQuKlxcKVxccyokLyxcblx0XHRdO1xuXHRcdGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJyk7XG5cdFx0Y29uc3Qgb3V0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdFx0aWYgKEhJTlRfUEFUVEVSTlMuc29tZShyZSA9PiByZS50ZXN0KGxpbmUpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdG91dC5wdXNoKGxpbmUpO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBvdXQuam9pbignXFxuJyk7XG5cdFx0cmV0dXJuIHsgdGV4dDogcmVzdWx0LCBjb21wcmVzc2VkOiByZXN1bHQubGVuZ3RoIDwgdGV4dC5sZW5ndGggfTtcblx0fSxcbn07XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gRmlsZSBvcHNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIENvbXByZXNzZXMgYGxzIC1sYCAvIGBscyAtbGFgIG91dHB1dCBieSBkcm9wcGluZyBwZXJtaXNzaW9uL293bmVyL3NpemVcbiAqIGNvbHVtbnMgYW5kIGtlZXBpbmcgb25seSB0aGUgZW50cnkgbmFtZS4gUGxhaW4gYGxzYCBpcyBhbHJlYWR5IHRlcnNlIGFuZFxuICogcGFzc2VzIHRocm91Z2guXG4gKi9cbmV4cG9ydCBjb25zdCBsc0ZpbHRlcjogSVRvb2xSZXN1bHRGaWx0ZXIgPSB7XG5cdGlkOiAndGVybWluYWwubHMnLFxuXHR0b29sSWRzOiBbVGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbF0sXG5cdG1hdGNoZXMoX3Rvb2xJZCwgaW5wdXQpIHtcblx0XHRpZiAoIWlzVGVybWluYWxJbnB1dChpbnB1dCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDb21tYW5kKGlucHV0LmNvbW1hbmQpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc2VnIG9mIHBhcnNlZC5zZWdtZW50cykge1xuXHRcdFx0Y29uc3QgaGVhZCA9IHNlZ21lbnRIZWFkKHNlZyk7XG5cdFx0XHRpZiAoaGVhZD8uaGVhZCAhPT0gJ2xzJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChzZWdtZW50SGFzRmxhZyhzZWcsIFsnbCddKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9LFxuXHRhcHBseSh0ZXh0KTogSVRvb2xSZXN1bHRGaWx0ZXJPdXRwdXQge1xuXHRcdGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJyk7XG5cdFx0Y29uc3Qgb3V0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGxvbmdSZSA9IC9eWy1kbGNicHNETENCUFNdW3J3eFxcLXRUc1NAKy5dezksfVxccytcXGQrXFxzK1xcUytcXHMrXFxTK1xccytcXGQrXFxzK1xcUytcXHMrXFxTK1xccytcXFMrXFxzKyguKykkLztcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRcdGlmICghbGluZS50cmltKCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAobGluZS5zdGFydHNXaXRoKCd0b3RhbCAnKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG0gPSBsb25nUmUuZXhlYyhsaW5lKTtcblx0XHRcdGlmIChtKSB7XG5cdFx0XHRcdGNvbnN0IGlzRGlyID0gbGluZS5zdGFydHNXaXRoKCdkJyk7XG5cdFx0XHRcdG91dC5wdXNoKGlzRGlyID8gbVsxXSArICcvJyA6IG1bMV0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3V0LnB1c2gobGluZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IG91dC5qb2luKCdcXG4nKTtcblx0XHRyZXR1cm4geyB0ZXh0OiByZXN1bHQsIGNvbXByZXNzZWQ6IHJlc3VsdC5sZW5ndGggPCB0ZXh0Lmxlbmd0aCB9O1xuXHR9LFxufTtcblxuY29uc3QgTUFYX0xJU1RfTElORVMgPSAyMDA7XG5cbmZ1bmN0aW9uIGNhcExpbmVzKHRleHQ6IHN0cmluZywgbWF4OiBudW1iZXIsIGxhYmVsOiBzdHJpbmcpOiBJVG9vbFJlc3VsdEZpbHRlck91dHB1dCB7XG5cdGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJyk7XG5cdGlmIChsaW5lcy5sZW5ndGggPD0gbWF4ICsgMSkge1xuXHRcdHJldHVybiB7IHRleHQsIGNvbXByZXNzZWQ6IGZhbHNlIH07XG5cdH1cblx0Y29uc3Qga2VwdCA9IGxpbmVzLnNsaWNlKDAsIG1heCk7XG5cdGNvbnN0IG9taXR0ZWQgPSBsaW5lcy5sZW5ndGggLSBtYXg7XG5cdGtlcHQucHVzaChgLi4uICR7b21pdHRlZH0gJHtsYWJlbH0gbGluZXMgb21pdHRlZCAuLi5gKTtcblx0Y29uc3QgcmVzdWx0ID0ga2VwdC5qb2luKCdcXG4nKTtcblx0cmV0dXJuIHsgdGV4dDogcmVzdWx0LCBjb21wcmVzc2VkOiByZXN1bHQubGVuZ3RoIDwgdGV4dC5sZW5ndGggfTtcbn1cblxuZXhwb3J0IGNvbnN0IGZpbmRGaWx0ZXI6IElUb29sUmVzdWx0RmlsdGVyID0ge1xuXHRpZDogJ3Rlcm1pbmFsLmZpbmQnLFxuXHR0b29sSWRzOiBbVGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbF0sXG5cdG1hdGNoZXMoX3Rvb2xJZCwgaW5wdXQpIHtcblx0XHRpZiAoIWlzVGVybWluYWxJbnB1dChpbnB1dCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDb21tYW5kKGlucHV0LmNvbW1hbmQpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJzZWQuc2VnbWVudHMuc29tZShzZWcgPT4gc2VnbWVudEhlYWQoc2VnKT8uaGVhZCA9PT0gJ2ZpbmQnKTtcblx0fSxcblx0YXBwbHk6ICh0ZXh0KSA9PiBjYXBMaW5lcyh0ZXh0LCBNQVhfTElTVF9MSU5FUywgJ2ZpbmQgcmVzdWx0JyksXG59O1xuXG5leHBvcnQgY29uc3QgZ3JlcEZpbHRlcjogSVRvb2xSZXN1bHRGaWx0ZXIgPSB7XG5cdGlkOiAndGVybWluYWwuZ3JlcCcsXG5cdHRvb2xJZHM6IFtUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsXSxcblx0bWF0Y2hlcyhfdG9vbElkLCBpbnB1dCkge1xuXHRcdGlmICghaXNUZXJtaW5hbElucHV0KGlucHV0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNvbW1hbmQoaW5wdXQuY29tbWFuZCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHBhcnNlZC5zZWdtZW50cy5zb21lKHNlZyA9PiB7XG5cdFx0XHRjb25zdCBoZWFkID0gc2VnbWVudEhlYWQoc2VnKTtcblx0XHRcdHJldHVybiBoZWFkICE9PSB1bmRlZmluZWQgJiYgKGhlYWQuaGVhZCA9PT0gJ2dyZXAnIHx8IGhlYWQuaGVhZCA9PT0gJ3JnJyB8fCBoZWFkLmhlYWQgPT09ICdhY2snIHx8IGhlYWQuaGVhZCA9PT0gJ2FnJyk7XG5cdFx0fSk7XG5cdH0sXG5cdGFwcGx5OiAodGV4dCkgPT4gY2FwTGluZXModGV4dCwgTUFYX0xJU1RfTElORVMsICdtYXRjaGluZycpLFxufTtcblxuZXhwb3J0IGNvbnN0IHRyZWVGaWx0ZXI6IElUb29sUmVzdWx0RmlsdGVyID0ge1xuXHRpZDogJ3Rlcm1pbmFsLnRyZWUnLFxuXHR0b29sSWRzOiBbVGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbF0sXG5cdG1hdGNoZXMoX3Rvb2xJZCwgaW5wdXQpIHtcblx0XHRpZiAoIWlzVGVybWluYWxJbnB1dChpbnB1dCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDb21tYW5kKGlucHV0LmNvbW1hbmQpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJzZWQuc2VnbWVudHMuc29tZShzZWcgPT4gc2VnbWVudEhlYWQoc2VnKT8uaGVhZCA9PT0gJ3RyZWUnKTtcblx0fSxcblx0YXBwbHk6ICh0ZXh0KSA9PiBjYXBMaW5lcyh0ZXh0LCBNQVhfTElTVF9MSU5FUywgJ3RyZWUnKSxcbn07XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gVGVzdCBydW5uZXJzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gY29tcHJlc3NUZXN0UnVubmVyT3V0cHV0KHRleHQ6IHN0cmluZyk6IElUb29sUmVzdWx0RmlsdGVyT3V0cHV0IHtcblx0Y29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKTtcblx0Y29uc3QgZHJvcFBhdHRlcm5zOiBSZWdFeHBbXSA9IFtcblx0XHQvXlxccypQQVNTXFxzK1xcUysvLFxuXHRcdC9eXFxzKm9rXFxzK1xcZCtcXHMrLyxcblx0XHQvXlxccypcXHUyNzEzXFxzLyxcblx0XHQvXlxccypbLnNTRUZ4XXsxMCx9XFxzKiQvLFxuXHRcdC9edGVzdFxccy4rIFxcLlxcLlxcLiBva1xccyokLyxcblx0XHQvXnJ1bm5pbmcgXFxkKyB0ZXN0cz8kL2ksXG5cdF07XG5cdGNvbnN0IG91dDogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0aWYgKGRyb3BQYXR0ZXJucy5zb21lKHJlID0+IHJlLnRlc3QobGluZSkpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0b3V0LnB1c2gobGluZSk7XG5cdH1cblx0Y29uc3QgcmVzdWx0ID0gb3V0LmpvaW4oJ1xcbicpO1xuXHRyZXR1cm4geyB0ZXh0OiByZXN1bHQsIGNvbXByZXNzZWQ6IHJlc3VsdC5sZW5ndGggPCB0ZXh0Lmxlbmd0aCB9O1xufVxuXG5leHBvcnQgY29uc3QgdGVzdFJ1bm5lckZpbHRlcjogSVRvb2xSZXN1bHRGaWx0ZXIgPSB7XG5cdGlkOiAndGVybWluYWwudGVzdC1ydW5uZXInLFxuXHR0b29sSWRzOiBbVGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbF0sXG5cdG1hdGNoZXMoX3Rvb2xJZCwgaW5wdXQpIHtcblx0XHRpZiAoIWlzVGVybWluYWxJbnB1dChpbnB1dCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDb21tYW5kKGlucHV0LmNvbW1hbmQpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc2VnIG9mIHBhcnNlZC5zZWdtZW50cykge1xuXHRcdFx0Y29uc3QgaGVhZCA9IHNlZ21lbnRIZWFkKHNlZyk7XG5cdFx0XHRpZiAoIWhlYWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaGVhZC5oZWFkID09PSAncHl0ZXN0JyB8fCBoZWFkLmhlYWQgPT09ICdqZXN0JyB8fCBoZWFkLmhlYWQgPT09ICd2aXRlc3QnIHx8IGhlYWQuaGVhZCA9PT0gJ3BsYXl3cmlnaHQnIHx8IGhlYWQuaGVhZCA9PT0gJ21vY2hhJykge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChoZWFkLmhlYWQgPT09ICdjYXJnbycgJiYgaGVhZC5zdWIgJiYgL14odGVzdHxuZXh0ZXN0KSQvLnRlc3QoaGVhZC5zdWIpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhlYWQuaGVhZCA9PT0gJ2dvJyAmJiBoZWFkLnN1YiA9PT0gJ3Rlc3QnKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKChoZWFkLmhlYWQgPT09ICducG0nIHx8IGhlYWQuaGVhZCA9PT0gJ3BucG0nIHx8IGhlYWQuaGVhZCA9PT0gJ3lhcm4nKSAmJiBoZWFkLnN1YiA9PT0gJ3Rlc3QnKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhlYWQuaGVhZCA9PT0gJ25weCcgJiYgaGVhZC5zdWIgJiYgL14oamVzdHx2aXRlc3R8cGxheXdyaWdodHxtb2NoYSkkLy50ZXN0KGhlYWQuc3ViKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9LFxuXHRhcHBseTogKHRleHQpID0+IGNvbXByZXNzVGVzdFJ1bm5lck91dHB1dCh0ZXh0KSxcbn07XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gQnVpbGQgdG9vbHNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBjb21wcmVzc0J1aWxkT3V0cHV0KHRleHQ6IHN0cmluZyk6IElUb29sUmVzdWx0RmlsdGVyT3V0cHV0IHtcblx0Y29uc3QgZHJvcFBhdHRlcm5zOiBSZWdFeHBbXSA9IFtcblx0XHQvXlxccypDb21waWxpbmdcXHMrXFxTK1xccyt2XFxTKy8sXG5cdFx0L15cXHMqRG93bmxvYWRpbmdcXHMrXFxTKy8sXG5cdFx0L15cXHMqRG93bmxvYWRlZFxccytcXFMrLyxcblx0XHQvXlxccypVcGRhdGluZ1xccytjcmF0ZXNcXC5pb1xccytpbmRleC8sXG5cdFx0L15cXHMqRmluaXNoZWRcXHMrKGRldnxyZWxlYXNlfHRlc3QpLyxcblx0XHQvXm1ha2VcXFtcXGQrXFxdOiAoRW50ZXJpbmd8TGVhdmluZykgZGlyZWN0b3J5Lyxcblx0XHQvXkRvd25sb2FkKGVkfGluZykgaHR0cHM/Oi8sXG5cdFx0L15cXFtJTkZPXFxdIERvd25sb2FkaW5nIGZyb20gLyxcblx0XHQvXlxcW0lORk9cXF0gRG93bmxvYWRlZCBmcm9tIC8sXG5cdFx0L14+IFRhc2sgOi8sXG5cdF07XG5cdGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IG91dDogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0aWYgKGRyb3BQYXR0ZXJucy5zb21lKHJlID0+IHJlLnRlc3QobGluZSkpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0b3V0LnB1c2gobGluZSk7XG5cdH1cblx0Y29uc3QgcmVzdWx0ID0gb3V0LmpvaW4oJ1xcbicpO1xuXHRyZXR1cm4geyB0ZXh0OiByZXN1bHQsIGNvbXByZXNzZWQ6IHJlc3VsdC5sZW5ndGggPCB0ZXh0Lmxlbmd0aCB9O1xufVxuXG5leHBvcnQgY29uc3QgYnVpbGRUb29sRmlsdGVyOiBJVG9vbFJlc3VsdEZpbHRlciA9IHtcblx0aWQ6ICd0ZXJtaW5hbC5idWlsZC10b29sJyxcblx0dG9vbElkczogW1Rlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWxdLFxuXHRtYXRjaGVzKF90b29sSWQsIGlucHV0KSB7XG5cdFx0aWYgKCFpc1Rlcm1pbmFsSW5wdXQoaW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ29tbWFuZChpbnB1dC5jb21tYW5kKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHNlZyBvZiBwYXJzZWQuc2VnbWVudHMpIHtcblx0XHRcdGNvbnN0IGhlYWQgPSBzZWdtZW50SGVhZChzZWcpO1xuXHRcdFx0aWYgKCFoZWFkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhlYWQuaGVhZCA9PT0gJ2NhcmdvJyAmJiBoZWFkLnN1YiAmJiAvXihidWlsZHxjaGVja3xjbGlwcHkpJC8udGVzdChoZWFkLnN1YikpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaGVhZC5oZWFkID09PSAnZ28nICYmIChoZWFkLnN1YiA9PT0gJ2J1aWxkJyB8fCBoZWFkLnN1YiA9PT0gJ3ZldCcpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhlYWQuaGVhZCA9PT0gJ21ha2UnIHx8IGhlYWQuaGVhZCA9PT0gJ3RzYycgfHwgaGVhZC5oZWFkID09PSAnZ3JhZGxlJyB8fCBoZWFkLmhlYWQgPT09ICdtdm4nKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhlYWQuaGVhZCA9PT0gJ2RvdG5ldCcgJiYgaGVhZC5zdWIgPT09ICdidWlsZCcpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fSxcblx0YXBwbHk6ICh0ZXh0KSA9PiBjb21wcmVzc0J1aWxkT3V0cHV0KHRleHQpLFxufTtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBMaW50ZXJzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gY29tcHJlc3NMaW50ZXJPdXRwdXQodGV4dDogc3RyaW5nKTogSVRvb2xSZXN1bHRGaWx0ZXJPdXRwdXQge1xuXHRjb25zdCBsaW5lcyA9IHRleHQuc3BsaXQoJ1xcbicpO1xuXHRjb25zdCBkcm9wUGF0dGVybnM6IFJlZ0V4cFtdID0gW1xuXHRcdC9eXFxzKlN1Y2Nlc3M6IG5vIGlzc3VlcyBmb3VuZFxccyokL2ksXG5cdFx0L15cXHMqQWxsIGNoZWNrcyBwYXNzZWRcXC4/XFxzKiQvaSxcblx0XHQvXlxccypTdWNjZXNzOlxccyowIGVycm9ycy9pLFxuXHRdO1xuXHRjb25zdCBvdXQ6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdGlmIChkcm9wUGF0dGVybnMuc29tZShyZSA9PiByZS50ZXN0KGxpbmUpKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdG91dC5wdXNoKGxpbmUpO1xuXHR9XG5cdGNvbnN0IHJlc3VsdCA9IG91dC5qb2luKCdcXG4nKTtcblx0cmV0dXJuIHsgdGV4dDogcmVzdWx0LCBjb21wcmVzc2VkOiByZXN1bHQubGVuZ3RoIDwgdGV4dC5sZW5ndGggfTtcbn1cblxuZXhwb3J0IGNvbnN0IGxpbnRlckZpbHRlcjogSVRvb2xSZXN1bHRGaWx0ZXIgPSB7XG5cdGlkOiAndGVybWluYWwubGludGVyJyxcblx0dG9vbElkczogW1Rlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWxdLFxuXHRtYXRjaGVzKF90b29sSWQsIGlucHV0KSB7XG5cdFx0aWYgKCFpc1Rlcm1pbmFsSW5wdXQoaW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ29tbWFuZChpbnB1dC5jb21tYW5kKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHNlZyBvZiBwYXJzZWQuc2VnbWVudHMpIHtcblx0XHRcdGNvbnN0IGhlYWQgPSBzZWdtZW50SGVhZChzZWcpO1xuXHRcdFx0aWYgKCFoZWFkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhlYWQuaGVhZCA9PT0gJ2VzbGludCcgfHwgaGVhZC5oZWFkID09PSAncnVmZicgfHwgaGVhZC5oZWFkID09PSAnbXlweScgfHwgaGVhZC5oZWFkID09PSAncHJldHRpZXInIHx8IGhlYWQuaGVhZCA9PT0gJ3J1Ym9jb3AnIHx8IGhlYWQuaGVhZCA9PT0gJ2dvbGFuZ2NpLWxpbnQnKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhlYWQuaGVhZCA9PT0gJ2NhcmdvJyAmJiBoZWFkLnN1YiA9PT0gJ2NsaXBweScpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaGVhZC5oZWFkID09PSAnbnB4JyAmJiBoZWFkLnN1YiAmJiAvXihlc2xpbnR8cHJldHRpZXJ8dHNjKSQvLnRlc3QoaGVhZC5zdWIpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH0sXG5cdGFwcGx5OiAodGV4dCkgPT4gY29tcHJlc3NMaW50ZXJPdXRwdXQodGV4dCksXG59O1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFBhY2thZ2UgbWFuYWdlcnNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIENvbXByZXNzZXMgYG5wbSBpbnN0YWxsYCAvIGB5YXJuYCAvIGBwbnBtIGluc3RhbGxgIG91dHB1dCBieSBzdHJpcHBpbmdcbiAqIHByb2dyZXNzIGxpbmVzIGFuZCBhdWRpdCBzdW1tYXJ5IG5vaXNlLCBrZWVwaW5nIHRoZSBwYWNrYWdlIHN1bW1hcnkgcGx1c1xuICogYW55IGVycm9yL3dhcm5pbmcgbGluZXMuXG4gKi9cbmV4cG9ydCBjb25zdCBucG1JbnN0YWxsRmlsdGVyOiBJVG9vbFJlc3VsdEZpbHRlciA9IHtcblx0aWQ6ICd0ZXJtaW5hbC5ucG0taW5zdGFsbCcsXG5cdHRvb2xJZHM6IFtUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsXSxcblx0bWF0Y2hlcyhfdG9vbElkLCBpbnB1dCkge1xuXHRcdGlmICghaXNUZXJtaW5hbElucHV0KGlucHV0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNvbW1hbmQoaW5wdXQuY29tbWFuZCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZWcgb2YgcGFyc2VkLnNlZ21lbnRzKSB7XG5cdFx0XHRjb25zdCBoZWFkID0gc2VnbWVudEhlYWQoc2VnKTtcblx0XHRcdGlmICghaGVhZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChoZWFkLmhlYWQgPT09ICducG0nICYmIGhlYWQuc3ViICYmIC9eKGluc3RhbGx8aXxjaXxhZGQpJC8udGVzdChoZWFkLnN1YikpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaGVhZC5oZWFkID09PSAneWFybicgfHwgaGVhZC5oZWFkID09PSAncG5wbScpIHtcblx0XHRcdFx0aWYgKGhlYWQuc3ViID09PSAnaW5zdGFsbCcgfHwgaGVhZC5zdWIgPT09ICdhZGQnIHx8IGhlYWQuc3ViID09PSAnaScpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaGVhZC5zdWIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdC8vIEJhcmUgYHlhcm5gIC8gYHBucG1gIGlzIGltcGxpY2l0IGluc3RhbGwgaW4gdGhlIHByb2plY3Qgcm9vdC5cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH0sXG5cdGFwcGx5KHRleHQpOiBJVG9vbFJlc3VsdEZpbHRlck91dHB1dCB7XG5cdFx0Y29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKTtcblx0XHRjb25zdCBkcm9wUGF0dGVybnM6IFJlZ0V4cFtdID0gW1xuXHRcdFx0L15ucG0gd2FybiBkZXByZWNhdGVkIC9pLFxuXHRcdFx0L15cXHMqXFxbIys+P1xccypcXF0gLyxcblx0XHRcdC9ebnBtIGh0dHAgL2ksXG5cdFx0XHQvXm5wbSB0aW1pbmcgL2ksXG5cdFx0XHQvXm5wbSBzaWxsIC9pLFxuXHRcdFx0L15ucG0gdmVyYiAvaSxcblx0XHRcdC9eXFxzKlxcZCsgcGFja2FnZXM/IGFyZSBsb29raW5nIGZvciBmdW5kaW5nL2ksXG5cdFx0XHQvcnVuIGBucG0gZnVuZGAvaSxcblx0XHRcdC9eUnVuIGBucG0gYXVkaXQvaSxcblx0XHRdO1xuXHRcdGNvbnN0IG91dDogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRcdGlmIChkcm9wUGF0dGVybnMuc29tZShyZSA9PiByZS50ZXN0KGxpbmUpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdG91dC5wdXNoKGxpbmUpO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBvdXQuam9pbignXFxuJyk7XG5cdFx0cmV0dXJuIHsgdGV4dDogcmVzdWx0LCBjb21wcmVzc2VkOiByZXN1bHQubGVuZ3RoIDwgdGV4dC5sZW5ndGggfTtcblx0fSxcbn07XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gTWlzYyB1dGlsaXRpZXNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKiogU29ydCArIGRlZHVwZSBgZW52YCAvIGBwcmludGVudmAgb3V0cHV0LiAqL1xuZXhwb3J0IGNvbnN0IGVudkZpbHRlcjogSVRvb2xSZXN1bHRGaWx0ZXIgPSB7XG5cdGlkOiAndGVybWluYWwuZW52Jyxcblx0dG9vbElkczogW1Rlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWxdLFxuXHRtYXRjaGVzKF90b29sSWQsIGlucHV0KSB7XG5cdFx0aWYgKCFpc1Rlcm1pbmFsSW5wdXQoaW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ29tbWFuZChpbnB1dC5jb21tYW5kKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBXZSBkb24ndCBnbyB0aHJvdWdoIG1ha2VNYXRjaGVyKCkgaGVyZSBiZWNhdXNlIGBlbnZgIGlzIGFsc28gYVxuXHRcdC8vIHdyYXBwZXIgYW5kIGdldHMgc3RyaXBwZWQgZHVyaW5nIHBhcnNpbmcgXHUyMDE0IG9ubHkgZmlyZSB3aGVuIHRoZXJlJ3Ncblx0XHQvLyBub3RoaW5nIGVsc2UgKGkuZS4gYGVudmAgaXMgaXRzZWxmIHRoZSBwcm9ncmFtKS5cblx0XHRmb3IgKGNvbnN0IHNlZyBvZiBwYXJzZWQuc2VnbWVudHMpIHtcblx0XHRcdGNvbnN0IGhlYWQgPSBzZWdtZW50SGVhZChzZWcpO1xuXHRcdFx0aWYgKGhlYWQ/LmhlYWQgPT09ICdwcmludGVudicpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBBZnRlciB3cmFwcGVyLXN0cmlwcGluZywgYmFyZSBgZW52YCBzdXJ2aXZlcyBvbmx5IHdoZW4gdGhlcmUgd2FzXG5cdFx0XHQvLyBubyBpbm5lciBwcm9ncmFtIChpLmUuIHRoZSB1c2VyIGludm9rZWQgYGVudmAgd2l0aCBubyBhcmdzKS5cblx0XHRcdGlmIChoZWFkID09PSB1bmRlZmluZWQgJiYgc2VnLndyYXBwZXJzLmxlbmd0aCA+IDAgJiYgc2VnLndyYXBwZXJzW3NlZy53cmFwcGVycy5sZW5ndGggLSAxXSA9PT0gJ2VudicgJiYgc2VnLnRva2Vucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fSxcblx0YXBwbHkodGV4dCk6IElUb29sUmVzdWx0RmlsdGVyT3V0cHV0IHtcblx0XHRjb25zdCBsaW5lcyA9IHRleHQuc3BsaXQoJ1xcbicpLmZpbHRlcihsID0+IGwudHJpbSgpICE9PSAnJyk7XG5cdFx0Y29uc3QgdW5pcXVlID0gQXJyYXkuZnJvbShuZXcgU2V0KGxpbmVzKSkuc29ydCgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHVuaXF1ZS5qb2luKCdcXG4nKTtcblx0XHRyZXR1cm4geyB0ZXh0OiByZXN1bHQsIGNvbXByZXNzZWQ6IHJlc3VsdC5sZW5ndGggPCB0ZXh0Lmxlbmd0aCB9O1xuXHR9LFxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyVGVybWluYWxDb21wcmVzc29ycyhjb21wcmVzc29yOiBJVG9vbFJlc3VsdENvbXByZXNzb3IpOiB2b2lkIHtcblx0Ly8gVkNTXG5cdGNvbXByZXNzb3IucmVnaXN0ZXJGaWx0ZXIoZ2l0RGlmZkZpbHRlcik7XG5cdGNvbXByZXNzb3IucmVnaXN0ZXJGaWx0ZXIoZ2l0TG9nRmlsdGVyKTtcblx0Y29tcHJlc3Nvci5yZWdpc3RlckZpbHRlcihnaXRTdGF0dXNGaWx0ZXIpO1xuXHQvLyBGaWxlIG9wc1xuXHRjb21wcmVzc29yLnJlZ2lzdGVyRmlsdGVyKGxzRmlsdGVyKTtcblx0Y29tcHJlc3Nvci5yZWdpc3RlckZpbHRlcihmaW5kRmlsdGVyKTtcblx0Y29tcHJlc3Nvci5yZWdpc3RlckZpbHRlcihncmVwRmlsdGVyKTtcblx0Y29tcHJlc3Nvci5yZWdpc3RlckZpbHRlcih0cmVlRmlsdGVyKTtcblx0Ly8gVGVzdCAvIGJ1aWxkIC8gbGludFxuXHRjb21wcmVzc29yLnJlZ2lzdGVyRmlsdGVyKHRlc3RSdW5uZXJGaWx0ZXIpO1xuXHRjb21wcmVzc29yLnJlZ2lzdGVyRmlsdGVyKGJ1aWxkVG9vbEZpbHRlcik7XG5cdGNvbXByZXNzb3IucmVnaXN0ZXJGaWx0ZXIobGludGVyRmlsdGVyKTtcblx0Ly8gUGFja2FnZSBtYW5hZ2Vyc1xuXHRjb21wcmVzc29yLnJlZ2lzdGVyRmlsdGVyKG5wbUluc3RhbGxGaWx0ZXIpO1xuXHQvLyBNaXNjXG5cdGNvbXByZXNzb3IucmVnaXN0ZXJGaWx0ZXIoZW52RmlsdGVyKTtcblxuXHRjb21wcmVzc29yLnJlZ2lzdGVyQ2FjaGUobmV3IFRlcm1pbmFsT3V0cHV0Q2FjaGUoKSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHNCQUFzQjtBQUUvQixTQUEwQixjQUFjLG9CQUFvQixtQkFBbUIsZ0JBQWdCLG1CQUFtQjtBQUNsSCxTQUFTLDJCQUEyQjtBQVVwQyxTQUFTLGdCQUFnQixPQUF5QztBQUNqRSxNQUFJLE9BQU8sVUFBVSxZQUFZLFVBQVUsTUFBTTtBQUNoRCxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sZ0JBQWdCO0FBQ3RCLFNBQU8sY0FBYyxZQUFZLFVBQWEsT0FBTyxjQUFjLFlBQVk7QUFDaEY7QUFHTyxNQUFNLG1CQUFtQjtBQVFoQyxTQUFTLFlBQVksTUFJbEI7QUFDRixRQUFNLGNBQWMsS0FBSyxRQUFRLE9BQU8sS0FBSyxRQUFRLFNBQVksU0FDOUQsS0FBSyxRQUFRLE9BQU8sT0FDbkIsT0FBTyxLQUFLLFFBQVEsV0FBVyxvQkFBSSxJQUFJLENBQUMsS0FBSyxHQUFHLENB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
