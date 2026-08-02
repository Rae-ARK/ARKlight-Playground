const DEFAULT_LARGE_OUTPUT_THRESHOLD = 3e4;
const DEFAULT_SHELL_GREP_LARGE_OUTPUT_THRESHOLD = 3e4;
const DEFAULT_MIN_SAVED_CHARS = 0;
function compact(command, output, options) {
  const opts = options ?? {};
  const largeOutputThreshold = opts.largeOutputThreshold ?? DEFAULT_LARGE_OUTPUT_THRESHOLD;
  const shellGrepLargeOutputThreshold = opts.shellGrepLargeOutputThreshold ?? DEFAULT_SHELL_GREP_LARGE_OUTPUT_THRESHOLD;
  const minimumSavedChars = opts.minSavedChars ?? DEFAULT_MIN_SAVED_CHARS;
  const classification = classifyCommandResult(command);
  const preview = previewShellOutputCompaction(
    command,
    output,
    largeOutputThreshold,
    shellGrepLargeOutputThreshold,
    minimumSavedChars
  );
  return buildReport(command, classification, output, preview);
}
function classifyCommand(command) {
  const result = classifyCommandResult(command);
  return {
    commandKinds: result.commandKinds.slice(),
    isSourceReadCommand: result.isSourceReadCommand,
    runsGoTest: result.runsGoTest,
    mentionsSavedToolOutput: result.mentionsSavedToolOutput
  };
}
const textEncoder = new TextEncoder();
function byteLength(value) {
  return textEncoder.encode(value).length;
}
function countLines(text) {
  if (text.length === 0) {
    return 0;
  }
  let count = text.split("\n").length;
  if (text.endsWith("\n")) {
    count -= 1;
  }
  return count;
}
function countsOf(text) {
  return {
    chars: text.length,
    bytes: byteLength(text),
    lines: countLines(text)
  };
}
function minusCounts(self, other) {
  return {
    chars: saturatingSub(self.chars, other.chars),
    bytes: saturatingSub(self.bytes, other.bytes),
    lines: saturatingSub(self.lines, other.lines)
  };
}
function reductionOf(saved, original) {
  return {
    charsPct: pct(saved.chars, original.chars),
    bytesPct: pct(saved.bytes, original.bytes),
    linesPct: pct(saved.lines, original.lines)
  };
}
function pct(part, whole) {
  if (whole === 0) {
    return 0;
  }
  return part / whole * 100;
}
function buildReport(command, classification, original, preview) {
  const compactedText = preview ? preview.output : original;
  const originalCounts = countsOf(original);
  const compactedCounts = countsOf(compactedText);
  const saved = minusCounts(originalCounts, compactedCounts);
  const reduction = reductionOf(saved, originalCounts);
  return {
    command,
    applied: preview !== void 0,
    lossless: preview === void 0 ? true : preview.lossless,
    commandKinds: classification.commandKinds.slice(),
    isSourceReadCommand: classification.isSourceReadCommand,
    runsGoTest: classification.runsGoTest,
    mentionsSavedToolOutput: classification.mentionsSavedToolOutput,
    original: originalCounts,
    compacted: compactedCounts,
    saved,
    reduction,
    compactedOutput: compactedText
  };
}
const COMPACTED_REFERENCE_OVERHEAD_BUDGET = 512;
const COMMON_PREFIX_DISPLAY_WIDTH = 120;
const EXTENSION_SUMMARY_INLINE_WIDTH = 160;
const GO_RUNTIME_PANIC_MIN_GOROUTINES = 8;
const CARGO_PROGRESS_PREFIXES = [
  "Updating ",
  "Downloading ",
  "Downloaded ",
  "Compiling ",
  "Checking ",
  "Fresh ",
  "Locking ",
  "Adding ",
  "Building "
];
const COMMAND_COMPACTOR_ORDER = [
  "apt",
  "npm",
  "npm-pack",
  "yarn-berry",
  "pnpm",
  "composer",
  "poetry",
  "pip",
  "uv",
  "maven",
  "dotnet",
  "python-build",
  "go",
  "unittest",
  "js-test",
  "cargo",
  "node",
  "pytest",
  "git",
  "git-clean",
  "nx",
  "python-build-ext",
  "django-test",
  "golangci-lint",
  "clang-format-linter",
  "gradle",
  "cmake",
  "make",
  "shell-grep",
  "python-script"
];
const BENIGN_SEGMENT = { benign: true };
function compactSegment(kind) {
  return { benign: false, kind };
}
function segmentsEqual(a, b) {
  if (a.benign || b.benign) {
    return a.benign === b.benign;
  }
  return a.kind === b.kind;
}
function jsStringLen(value) {
  return value.length;
}
function sliceJsUnits(text, start, len) {
  if (len === 0) {
    return "";
  }
  return text.slice(start, start + len);
}
function splitWhitespace(value) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? [] : trimmed.split(/\s+/);
}
function saturatingSub(a, b) {
  return a > b ? a - b : 0;
}
function arraySliceEqual(arr, aStart, bStart, len) {
  for (let k = 0; k < len; k++) {
    if (arr[aStart + k] !== arr[bStart + k]) {
      return false;
    }
  }
  return true;
}
function isAsciiDigit(ch) {
  return ch >= "0" && ch <= "9";
}
function isAsciiAlphabetic(ch) {
  return ch >= "A" && ch <= "Z" || ch >= "a" && ch <= "z";
}
function trimStartMatchesChars(value, chars) {
  let i = 0;
  while (i < value.length && chars.includes(value[i])) {
    i += 1;
  }
  return value.slice(i);
}
function regexReplaceAll(pattern, input, replacement) {
  return input.replace(new RegExp(pattern, "g"), replacement);
}
function regexTest(pattern, input) {
  return regexTestWithFlags(pattern, input, "");
}
function regexTestWithFlags(pattern, input, flags) {
  return new RegExp(pattern, flags).test(input);
}
function regexFind(pattern, input) {
  const match = new RegExp(pattern).exec(input);
  return match ? match.index : void 0;
}
function regexCaptureFirst(pattern, input) {
  const match = new RegExp(pattern).exec(input);
  if (match && match[1] !== void 0) {
    return match[1];
  }
  return void 0;
}
function regexFindAll(pattern, input) {
  const regex = new RegExp(pattern, "g");
  const matches = [];
  let match;
  while ((match = regex.exec(input)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length });
    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }
  return matches;
}
function unchanged(output) {
  return { output, lossless: true };
}
function lossy(output) {
  return { output, lossless: false };
}
function indexAll(items) {
  return items.map((item, index) => ({ index, item }));
}
function joinedLineBytes(lines) {
  let total = 0;
  for (const line of lines) {
    total += byteLength(line);
  }
  return total + saturatingSub(lines.length, 1);
}
function shouldSkipToolOutputCompaction(lines, output, minLines) {
  return lines.length < minLines || lines.length > 2e5 || jsStringLen(output) < 1500 || lines.some((line) => line.startsWith("Error:") || line.startsWith("rg: ") || line.startsWith("grep: "));
}
function fitsLargeOutputThreshold(output, largeOutputThreshold) {
  return byteLength(output) <= largeOutputThreshold;
}
function compactedBodyBudget(largeOutputThreshold) {
  return Math.max(256, saturatingSub(largeOutputThreshold, COMPACTED_REFERENCE_OVERHEAD_BUDGET));
}
function totalGroupItems(groups) {
  let total = 0;
  for (const [, items] of groups) {
    total += items.length;
  }
  return total;
}
function truncateInlineText(text, maxLength) {
  const normalized = normalizeInlineWhitespace(text);
  const normalizedLen = jsStringLen(normalized);
  if (normalizedLen <= maxLength) {
    return normalized;
  }
  const suffix = `... [+${normalizedLen - maxLength} chars]`;
  return `${sliceJsUnits(normalized, 0, saturatingSub(maxLength, suffix.length))}${suffix}`;
}
function excerptInlineText(text, maxLength) {
  const normalized = normalizeInlineWhitespace(text);
  const normalizedLen = jsStringLen(normalized);
  if (normalizedLen <= maxLength) {
    return normalized;
  }
  const markerIndex = highSignalTextIndex(normalized);
  if (markerIndex !== void 0) {
    return excerptAroundIndex(normalized, maxLength, markerIndex);
  }
  const separator = ` ... [+${normalizedLen - maxLength} chars] ... `;
  const available = saturatingSub(maxLength, separator.length);
  const headLength = Math.ceil(available / 2);
  const tailLength = Math.floor(available / 2);
  return `${sliceJsUnits(normalized, 0, headLength)}${separator}${sliceJsUnits(normalized, saturatingSub(normalizedLen, tailLength), tailLength)}`;
}
function normalizeInlineWhitespace(text) {
  return splitWhitespace(text).join(" ");
}
function highSignalTextIndex(text) {
  return regexFind(
    String.raw`\b(?:HF_TOKEN|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|SECRET|TOKEN|FINAL_EXIT|RESULT|BEST|Accuracy|Model size|AssertionError|FAIL|ERROR|Rank)\b|hf_[A-Za-z0-9_]+|u=a1[A-Za-z0-9_-]+|https?://`,
    text
  );
}
function excerptAroundIndex(text, maxLength, index) {
  const prefix = index > 0 ? "... " : "";
  const textLen = jsStringLen(text);
  const indexUnits = index;
  const suffix = indexUnits + maxLength < textLen ? " ..." : "";
  const available = saturatingSub(maxLength, prefix.length + suffix.length);
  const start = Math.min(saturatingSub(indexUnits, Math.floor(available / 2)), saturatingSub(textLen, available));
  return `${prefix}${sliceJsUnits(text, start, available)}${suffix}`;
}
function truncatePathMiddle(inputPath, maxLength) {
  if (jsStringLen(inputPath) <= maxLength) {
    return inputPath;
  }
  const ellipsis = "...";
  const minTruncateWithEllipsisLength = ellipsis.length + 2;
  const minMiddleTruncateLength = minTruncateWithEllipsisLength * 2;
  if (maxLength <= minTruncateWithEllipsisLength) {
    return sliceJsUnits(inputPath, 0, maxLength);
  }
  if (maxLength < minMiddleTruncateLength) {
    return `${sliceJsUnits(inputPath, 0, maxLength - ellipsis.length)}${ellipsis}`;
  }
  const separator = inputPath.includes("\\") && !inputPath.includes("/") ? "\\" : "/";
  const [root, segments] = getPathPartsForMiddleTruncation(inputPath, separator);
  const minSegmentsForMiddleTruncation = root.length === 0 ? 3 : 2;
  if (segments.length < minSegmentsForMiddleTruncation) {
    return `${sliceJsUnits(inputPath, 0, maxLength - ellipsis.length)}${ellipsis}`;
  }
  const lastSegment = segments.length > 0 ? segments[segments.length - 1] : "";
  const preservedSegmentCount = root.length === 0 ? 1 : 0;
  const minResult = root.length === 0 ? `${segments[0]}${separator}${ellipsis}${separator}${lastSegment}` : `${root}${ellipsis}${separator}${lastSegment}`;
  if (jsStringLen(minResult) > maxLength) {
    return `${sliceJsUnits(inputPath, 0, maxLength - ellipsis.length)}${ellipsis}`;
  }
  let result = minResult;
  const middleSegments = segments.slice(preservedSegmentCount, segments.length - 1);
  for (let i = 0; i < middleSegments.length; i++) {
    const preservedSegments = segments.slice(0, preservedSegmentCount + i + 1);
    const prefix = root.length === 0 ? preservedSegments.join(separator) : `${root}${preservedSegments.join(separator)}`;
    const candidate = `${prefix}${separator}${ellipsis}${separator}${lastSegment}`;
    if (jsStringLen(candidate) <= maxLength) {
      result = candidate;
    } else {
      break;
    }
  }
  return result;
}
function getPathPartsForMiddleTruncation(inputPath, separator) {
  if (inputPath.length >= 2 && isAsciiAlphabetic(inputPath[0]) && inputPath[1] === ":") {
    let end = 2;
    while (end < inputPath.length && (inputPath[end] === "/" || inputPath[end] === "\\")) {
      end += 1;
    }
    const root = end > 2 ? `${inputPath.slice(0, 2)}${separator}` : inputPath.slice(0, 2);
    return [root, splitPathSegments(inputPath.slice(end))];
  }
  if (inputPath.startsWith("\\\\") || inputPath.startsWith("//")) {
    const uncSegments = splitPathSegments(trimStartMatchesChars(inputPath, ["\\", "/"]));
    if (uncSegments.length >= 2) {
      return [
        `${separator}${separator}${uncSegments[0]}${separator}${uncSegments[1]}${separator}`,
        uncSegments.slice(2)
      ];
    }
  }
  if (inputPath.startsWith("\\") || inputPath.startsWith("/")) {
    return [separator, splitPathSegments(trimStartMatchesChars(inputPath, ["\\", "/"]))];
  }
  return ["", splitPathSegments(inputPath)];
}
function splitPathSegments(inputPath) {
  return inputPath.split(/[\\/]/).filter((part) => part.length > 0);
}
function naturalCmp(a, b) {
  const aChars = Array.from(a);
  const bChars = Array.from(b);
  let ai = 0;
  let bi = 0;
  for (; ; ) {
    const ac = ai < aChars.length ? aChars[ai] : void 0;
    const bc = bi < bChars.length ? bChars[bi] : void 0;
    if (ac === void 0 && bc === void 0) {
      return 0;
    }
    if (ac === void 0) {
      return -1;
    }
    if (bc === void 0) {
      return 1;
    }
    if (isAsciiDigit(ac) && isAsciiDigit(bc)) {
      let aNumber = "";
      while (ai < aChars.length && isAsciiDigit(aChars[ai])) {
        aNumber += aChars[ai];
        ai += 1;
      }
      let bNumber = "";
      while (bi < bChars.length && isAsciiDigit(bChars[bi])) {
        bNumber += bChars[bi];
        bi += 1;
      }
      const aTrimmed = aNumber.replace(/^0+/, "");
      const bTrimmed = bNumber.replace(/^0+/, "");
      let ord = compareNumber(aTrimmed.length, bTrimmed.length);
      if (ord === 0) {
        ord = compareString(aTrimmed, bTrimmed);
      }
      if (ord === 0) {
        ord = compareNumber(aNumber.length, bNumber.length);
      }
      if (ord !== 0) {
        return ord;
      }
    } else {
      ai += 1;
      bi += 1;
      const ord = compareCodePoint(ac, bc);
      if (ord !== 0) {
        return ord;
      }
    }
  }
}
function compareNumber(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function compareString(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function compareCodePoint(a, b) {
  const ac = a.codePointAt(0) ?? 0;
  const bc = b.codePointAt(0) ?? 0;
  return compareNumber(ac, bc);
}
function classifyCommandResult(command) {
  return {
    commandKinds: classifyCommandKinds(command),
    isSourceReadCommand: isShellSourceReadCommand(command),
    runsGoTest: commandRunsGoTest(command),
    mentionsSavedToolOutput: commandMentionsSavedToolOutput(command)
  };
}
function previewShellOutputCompaction(command, original, largeOutputThreshold, shellGrepLargeOutputThreshold, minimumSavedChars) {
  const classification = classifyCommandResult(command);
  const hasGoRuntimePanic = looksLikeGoRuntimePanic(original);
  const hasNpmPackOutput = looksLikeNpmPackOutput(original);
  const hasJestRunsOutput = hasJestRunsProgress(original);
  const hasDocusaurusOutput = hasDocusaurusProgress(original);
  const hasSphinxProgressOutput = hasSphinxProgress(original);
  const hasGoPassingTestOutput = classification.runsGoTest && hasPassingGoTestOutput(original);
  const hasNeedrestartNoopOutput = hasNeedrestartNoopSummary(original);
  const canCompactSourceReadProgress = hasGoPassingTestOutput && !classification.mentionsSavedToolOutput;
  if (classification.commandKinds.length === 0 && !hasGoRuntimePanic && !hasNpmPackOutput && !hasJestRunsOutput && !hasGoPassingTestOutput && !hasNeedrestartNoopOutput && !hasDocusaurusOutput && !hasSphinxProgressOutput) {
    return void 0;
  }
  if (classification.commandKinds.length === 0 && classification.isSourceReadCommand && !canCompactSourceReadProgress) {
    return void 0;
  }
  const result = compactShellOutput(
    classification.commandKinds,
    original,
    hasGoPassingTestOutput,
    shellGrepLargeOutputThreshold
  ) ?? { output: original, lossless: true };
  const savedChars = saturatingSub(jsStringLen(original), jsStringLen(result.output));
  const originalWouldSpill = !fitsLargeOutputThreshold(original, largeOutputThreshold);
  const savedBytes = saturatingSub(byteLength(original), byteLength(result.output));
  if (savedChars < minimumSavedChars && !(originalWouldSpill && savedBytes > 0)) {
    return void 0;
  }
  return {
    output: result.output,
    savedChars,
    lossless: result.lossless
  };
}
function compactToolOutput(kind, output, largeOutputThreshold) {
  const result = kind === "grep-content" ? compactGrepContentOutput(output, largeOutputThreshold) : kind === "grep-count" ? compactGrepCountOutput(output) : kind === "grep-paths" ? compactPathListOutput(output, "grep-paths", largeOutputThreshold) : compactPathListOutput(output, "glob", largeOutputThreshold);
  if (result.output === output) {
    return void 0;
  }
  return result;
}
function classifyCommandKinds(command) {
  const heredocStrippedCommand = stripHeredocBodies(command);
  if (heredocStrippedCommand === void 0) {
    return [];
  }
  const lineContinuedCommand = regexReplaceAll(String.raw`\s*\\\r?\n\s*`, heredocStrippedCommand.command, " ");
  const commandWithoutAllowedDescriptorRedirects = regexReplaceAll(String.raw`\s+[12]>&[12]\b`, lineContinuedCommand, "");
  const commandWithSafeSubstitutions = replaceSafeCommandSubstitutions(commandWithoutAllowedDescriptorRedirects);
  const safetyCommand = stripQuotedText(commandWithSafeSubstitutions);
  const hasNewline = regexTest(String.raw`\r?\n`, safetyCommand);
  if (regexTest("[;`<>]", safetyCommand) || regexTest(String.raw`(^|[^&])&($|[^&])`, safetyCommand) || safetyCommand.includes("$(")) {
    return [];
  }
  const segments = splitCommandSegments(lineContinuedCommand);
  const segmentKinds = segments.map((segment, index) => classifyCommandSegmentOrPipeline(segment, heredocStrippedCommand.heredocStdinSegmentIndexes.has(index)));
  if (segmentKinds.some((kind) => kind === void 0)) {
    return [];
  }
  const resolvedKinds = segmentKinds;
  if (hasNewline && !hasErrexitBeforeFirstCommand(segments, resolvedKinds)) {
    return [];
  }
  const result = [];
  for (const kind of resolvedKinds) {
    if (!kind.benign) {
      result.push(kind.kind);
    }
  }
  return result;
}
function isShellSourceReadCommand(command) {
  const heredocStrippedCommand = stripHeredocBodies(command);
  if (heredocStrippedCommand === void 0) {
    return true;
  }
  const lineContinuedCommand = regexReplaceAll(String.raw`\s*\\\r?\n\s*`, heredocStrippedCommand.command, " ");
  return splitCommandSegments(lineContinuedCommand).some((segment) => splitUnquotedPipes(segment).some((part) => isSourceReadSegment(part)));
}
function isSourceReadSegment(segment) {
  const normalized = normalizeSegment(segment);
  const withoutEnv = stripSafeCommandWrappers(stripEnvironmentAssignmentPrefix(normalized));
  return regexTest(String.raw`^(?:cat|sed|head|tail|less|more|bat|nl|awk|grep|egrep|fgrep|rg)(?:\s|$)`, withoutEnv);
}
function classifyCommandSegmentOrPipeline(segment, isHeredocStdinSegment) {
  const parts = splitUnquotedPipes(segment);
  if (parts.length === 1) {
    return classifyCommandSegment(parts[0], isHeredocStdinSegment);
  }
  if (parts.length < 2) {
    return void 0;
  }
  const headKind = classifyCommandSegment(parts[0], isHeredocStdinSegment);
  if (headKind === void 0) {
    return void 0;
  }
  if (segmentsEqual(headKind, BENIGN_SEGMENT)) {
    return void 0;
  }
  if (segmentsEqual(headKind, compactSegment("shell-grep"))) {
    return void 0;
  }
  if (parts.slice(1).every((part) => isBenignPipelineTail(part))) {
    return headKind;
  }
  return void 0;
}
function classifyCommandSegment(segment, isHeredocStdinSegment) {
  const normalized = normalizeSegment(segment);
  if (normalized.length === 0 || normalized === "true" || normalized === ":" || isBenignGofmtWriteCommand(normalized) || isBenignTarballCleanupCommand(normalized) || isBenignPythonBuildCleanupCommand(normalized) || normalized.startsWith("#") || regexTest(String.raw`^cd(?:\s+(?:"[^"]*"|'[^']*'|[^\s]+))?$`, normalized) || isBenignSetupCommand(normalized) || regexTest(
    String.raw`^set\s+(?:[-+A-Za-z]+|-o\s+[A-Za-z][A-Za-z0-9_-]*|[A-Za-z][A-Za-z0-9_-]*)(?:\s+(?:[-+A-Za-z]+|-o\s+[A-Za-z][A-Za-z0-9_-]*|[A-Za-z][A-Za-z0-9_-]*))*$`,
    normalized
  )) {
    return BENIGN_SEGMENT;
  }
  if (isAssignmentList(normalized) || normalized.startsWith("export ") && isAssignmentList(normalized.slice("export ".length))) {
    return BENIGN_SEGMENT;
  }
  const withoutEnv = stripSafeCommandWrappers(stripEnvironmentAssignmentPrefix(normalized));
  let kind;
  if (isAptCommand(withoutEnv)) {
    kind = "apt";
  } else if (isPnpmInstallCommand(withoutEnv)) {
    kind = "pnpm";
  } else if (regexTest(String.raw`^npm\s+pack\b`, withoutEnv)) {
    kind = "npm-pack";
  } else if (isYarnBerryCommand(withoutEnv)) {
    kind = "yarn-berry";
  } else if (regexTest(String.raw`^(?:npm\s+(?:ci|install)|yarn\s+install)\b`, withoutEnv)) {
    kind = "npm";
  } else if (isPipInstallCommand(withoutEnv)) {
    kind = "pip";
  } else if (regexTest(String.raw`^composer\s+(?:install|update|require|remove)\b`, withoutEnv)) {
    kind = "composer";
  } else if (regexTest(String.raw`^poetry\s+(?:install|update|add|remove)\b`, withoutEnv)) {
    kind = "poetry";
  } else if (isUvCommand(withoutEnv)) {
    kind = "uv";
  } else if (isBenignVersionCommand(withoutEnv)) {
    return BENIGN_SEGMENT;
  } else if (isGoCommand(withoutEnv)) {
    kind = "go";
  } else if (isJsTestCommand(withoutEnv)) {
    kind = "js-test";
  } else if (regexTest(String.raw`^cargo\s+(?:build|check|test|clippy|doc|fetch)\b`, withoutEnv)) {
    kind = "cargo";
  } else if (regexTest(String.raw`^(?:node|npx|npm\s+exec|pnpm\s+exec|yarn\s+node)\b`, withoutEnv)) {
    kind = "node";
  } else if (isNxCommand(withoutEnv)) {
    kind = "nx";
  } else if (isPytestCommand(withoutEnv)) {
    kind = "pytest";
  } else if (isPythonUnittestCommand(withoutEnv)) {
    kind = "unittest";
  } else if (isPythonBuildCommand(withoutEnv)) {
    kind = "python-build";
  } else if (isBenignGitCommand(withoutEnv)) {
    return BENIGN_SEGMENT;
  } else if (isGitProgressCommand(withoutEnv)) {
    kind = "git";
  } else if (isGitCleanOrResetCommand(withoutEnv)) {
    kind = "git-clean";
  } else if (regexTest(String.raw`^git\s+(?:checkout|switch)\b`, withoutEnv)) {
    kind = "git";
  } else if (isPythonBuildExtCommand(withoutEnv)) {
    kind = "python-build-ext";
  } else if (isDjangoTestCommand(withoutEnv)) {
    kind = "django-test";
  } else if (isGolangciLintCommand(withoutEnv)) {
    kind = "golangci-lint";
  } else if (isClangFormatLinterCommand(withoutEnv)) {
    kind = "clang-format-linter";
  } else if (isGradleCommand(withoutEnv)) {
    kind = "gradle";
  } else if (isCmakeConfigureCommand(withoutEnv)) {
    kind = "cmake";
  } else if (isMavenCommand(withoutEnv)) {
    kind = "maven";
  } else if (isDotnetCommand(withoutEnv)) {
    kind = "dotnet";
  } else if (isSafeShellGrepCommand(withoutEnv)) {
    kind = "shell-grep";
  } else if (regexTest(String.raw`^(?:g?make|ninja)\b`, withoutEnv) || regexTest(String.raw`^\./configure\b`, withoutEnv) || regexTest(String.raw`^cmake\s+--build\b`, withoutEnv)) {
    kind = "make";
  } else if (isPythonScriptCommand(withoutEnv, isHeredocStdinSegment)) {
    kind = "python-script";
  } else {
    return void 0;
  }
  return compactSegment(kind);
}
function splitUnquotedPipes(segment) {
  const parts = [];
  let start = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle && !isEscapedByOddBackslashes(segment, i)) {
      inDouble = !inDouble;
    } else if (ch === "|" && !inSingle && !inDouble) {
      pushTrimmedPart(parts, segment.slice(start, i));
      start = i + 1;
    }
  }
  pushTrimmedPart(parts, segment.slice(start));
  return parts;
}
function pushTrimmedPart(parts, part) {
  const trimmed = part.trim();
  if (trimmed.length !== 0) {
    parts.push(trimmed);
  }
}
function isBenignPipelineTail(segment) {
  const normalized = normalizeSegment(segment);
  return normalized === "cat" || regexTest(String.raw`^tee(?:\s+-a)?\s+(?:"[^"]*"|'[^']*'|\S+)$`, normalized) || regexTest(
    String.raw`^(?:head|tail)(?:\s+(?:-[nc]\s*)?[+-]?\d+|\s+-[nc]\s+[+-]?\d+)?$`,
    normalized
  ) || regexTest(
    String.raw`^sed\s+-n\s+(?:"\d+(?:,\d+)?p"|'[\d]+(?:,\d+)?p')$`,
    normalized
  ) || isSafeStreamingGrepTail(normalized) || isSafeStreamingFlagOnlyTail(normalized);
}
function stripPrefix(value, prefix) {
  return value.startsWith(prefix) ? value.slice(prefix.length) : void 0;
}
function stripSuffix(value, suffix) {
  return value.endsWith(suffix) ? value.slice(0, value.length - suffix.length) : void 0;
}
function splitOnce(value, separator) {
  const index = value.indexOf(separator);
  if (index === -1) {
    return void 0;
  }
  return [value.slice(0, index), value.slice(index + separator.length)];
}
function rsplitOnce(value, separator) {
  const index = value.lastIndexOf(separator);
  if (index === -1) {
    return void 0;
  }
  return [value.slice(0, index), value.slice(index + separator.length)];
}
function asciiLowercase(value) {
  let result = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    result += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : value[i];
  }
  return result;
}
function parseUsize(value) {
  if (!/^\+?\d+$/.test(value)) {
    return void 0;
  }
  return Number(value);
}
function isAptCommand(segment) {
  const withoutSudo = stripPrefix(segment, "sudo ") ?? segment;
  const args = stripPrefix(withoutSudo, "apt-get ") ?? stripPrefix(withoutSudo, "apt ");
  if (args === void 0) {
    return false;
  }
  const tokens = splitWhitespace(args);
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === "-o" || token === "--option" || token === "-c" || token === "--config-file") {
      i += 2;
      continue;
    }
    if (token.startsWith("-")) {
      i += 1;
      continue;
    }
    return token === "update" || token === "install";
  }
  return false;
}
function isPnpmInstallCommand(segment) {
  const tokens = splitWhitespace(segment);
  if (tokens[0] !== "pnpm") {
    return false;
  }
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (["--filter", "-F", "--prefix", "-C", "--dir", "--loglevel", "--reporter", "--package-import-method", "--workspace-concurrency"].includes(token)) {
      index += 2;
      continue;
    }
    if (["--recursive", "-r", "--workspace-root", "-w", "--silent", "-s", "--use-stderr", "--color", "--no-color"].includes(token) || regexTest(String.raw`^(?:--filter|--prefix|--dir|--loglevel|--reporter|--package-import-method|--workspace-concurrency|-F|-C)=`, token)) {
      index += 1;
      continue;
    }
    break;
  }
  return tokens[index] === "install" || tokens[index] === "i";
}
function isGitProgressCommand(segment) {
  const tokens = splitWhitespace(segment);
  const index = gitSubcommandIndex(tokens);
  if (index === void 0) {
    return false;
  }
  const subcommand = tokens[index];
  return subcommand === "clone" || subcommand === "fetch" || subcommand === "pull" || subcommand === "submodule" && tokens[index + 1] === "update";
}
function isGitCleanOrResetCommand(segment) {
  const tokens = splitWhitespace(segment);
  const index = gitSubcommandIndex(tokens);
  if (index === void 0) {
    return false;
  }
  const subcommand = tokens[index];
  const args = tokens.slice(index + 1);
  if (subcommand === "reset") {
    return args.includes("--hard");
  }
  return subcommand === "clean" && args.some((arg) => isGitCleanForceOption(arg));
}
function isGitCleanForceOption(arg) {
  return arg === "--force" || regexTest(String.raw`^-[A-Za-z]+$`, arg) && arg.includes("f");
}
function isBenignGitCommand(segment) {
  const tokens = splitWhitespace(segment);
  const index = gitSubcommandIndex(tokens);
  if (index === void 0) {
    return false;
  }
  const subcommand = tokens[index];
  const args = tokens.slice(index + 1);
  if (subcommand === "status") {
    return args.every((arg) => arg === "--short" || arg === "-s" || arg === "--porcelain" || arg.startsWith("--untracked-files"));
  }
  if (subcommand === "diff") {
    const hasSummaryOutput = args.some((arg) => ["--stat", "--shortstat", "--numstat", "--name-only", "--name-status", "--summary", "--compact-summary"].includes(arg));
    return hasSummaryOutput && !args.some((arg) => arg === "-p" || arg === "-u" || arg === "--patch" || arg.startsWith("--patch-") || arg.startsWith("--word-diff") || arg.startsWith("--color-words"));
  }
  return subcommand === "rev-parse" && args.every((arg) => arg === "--show-toplevel" || arg === "--show-prefix");
}
function gitSubcommandIndex(tokens) {
  if (tokens[0] !== "git") {
    return void 0;
  }
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "-C" || token === "--git-dir" || token === "--work-tree") {
      index += 2;
      continue;
    }
    if (token.startsWith("-c")) {
      index += token === "-c" ? 2 : 1;
      continue;
    }
    if (token.startsWith("--")) {
      index += 1;
      continue;
    }
    break;
  }
  return index < tokens.length ? index : void 0;
}
function isJsTestCommand(segment) {
  return !regexTest(
    String.raw`(?:^|\s)(?:-w|--watch(?:[=\s]|$)|--watchAll(?:[=\s]|$)|--watch-all(?:[=\s]|$)|--watch-files(?:[=\s]|$))`,
    segment
  ) && regexTest(
    String.raw`^(?:npx\s+|(?:npm|pnpm|yarn)\s+exec\s+)?(?:vitest|jest|mocha|tap)(?:\s|$)`,
    segment
  );
}
function isYarnBerryCommand(segment) {
  return regexTest(
    String.raw`^(?:yarn|corepack\s+yarn)\s+(?:install|add|workspaces|run\s+install)\b`,
    segment
  ) || regexTest(
    String.raw`^node\s+(?:\./)?script/yarn\.js\s+(?:install|add)\b`,
    segment
  );
}
function isNxCommand(segment) {
  return regexTest(
    String.raw`^(?:nx|(?:yarn|pnpm)\s+(?:nx|release:build|typescript|test:ts|lint))\b`,
    segment
  );
}
function isDjangoTestCommand(segment) {
  const pythonWithOptions = pythonWithOptionsPattern();
  return regexTest(
    String.raw`^${pythonWithOptions}\s+(?:(?:\./)?(?:tests/)?runtests\.py|manage\.py\s+test|-m\s+django\s+test)\b`,
    segment
  ) || regexTest(String.raw`^django-admin\s+test\b`, segment);
}
function isGolangciLintCommand(segment) {
  return regexTest(String.raw`^(?:[A-Za-z0-9_./+-]+/)?golangci-lint\s+run\b`, segment) || regexTest(
    String.raw`^go\s+run\s+github\.com/golangci/golangci-lint/cmd/golangci-lint(?:@\S+)?\s+run\b`,
    segment
  );
}
function isClangFormatLinterCommand(segment) {
  return regexTest(
    String.raw`^${pythonWithOptionsPattern()}\s+\S*tools/linter/adapters/clangformat_linter\.py\b`,
    segment
  );
}
function isGradleCommand(segment) {
  return regexTest(
    String.raw`^(?:(?:\./|/\S+/)?gradlew?|\$GRADLE|\$\{GRADLE\})(?:\s|$)`,
    segment
  );
}
function isCmakeConfigureCommand(segment) {
  return regexTest(String.raw`^cmake(?:\s|$)`, segment) && !splitWhitespace(segment).some((token) => regexTest(String.raw`^(?:--build|--install|-E|-P|--version|-N|-h|--help(?:-.+)?)$`, token));
}
function isMavenCommand(segment) {
  return regexTest(String.raw`^(?:(?:\./)?mvnw?|mvn)(?:\s|$)`, segment);
}
function isDotnetCommand(segment) {
  return regexTest(String.raw`^dotnet\s+(?:build|test|restore|publish|pack)(?:\s|$)`, segment);
}
function isUvCommand(segment) {
  return regexTest(
    String.raw`^(?:uv|(?:python|python3(?:\.\d+)?)\s+-m\s+uv)\s+(?:sync|pip\s+(?:install|sync|compile)|venv|add|lock|run)\b`,
    segment
  );
}
function isPipInstallCommand(segment) {
  return regexTest(
    String.raw`^(?:(?:${pythonExecutablePattern()})\s+-m\s+pip|pip|pip3)\s+install\b`,
    segment
  );
}
function isGoCommand(segment) {
  return regexTest(
    String.raw`^(?:go|/(?:\S+/)*go)\s+(?:test|build|install|get|mod\s+(?:tidy|download|verify|graph)|work\s+sync)\b`,
    segment
  );
}
function isPytestCommand(segment) {
  return regexTest(
    String.raw`^(?:(?:${pythonWithOptionsPattern()})\s+-m\s+pytest|(?:(?:[A-Za-z0-9_./+-]+/)?pytest))(?:\s|$)`,
    segment
  );
}
function isPythonUnittestCommand(segment) {
  return regexTest(String.raw`^${pythonWithOptionsPattern()}\s+-m\s+unittest\b`, segment);
}
function isPythonBuildCommand(segment) {
  return regexTest(String.raw`^${pythonWithOptionsPattern()}\s+-m\s+build(?:\s|$)`, segment);
}
function isPythonBuildExtCommand(segment) {
  return regexTest(String.raw`^${pythonExecutablePattern()}\s+setup\.py\s+build_ext\b`, segment);
}
function isPythonScriptCommand(segment, isHeredocStdinSegment) {
  return isHeredocStdinPythonCommand(segment, isHeredocStdinSegment) || regexTest(
    String.raw`^${pythonWithOptionsPattern()}\s+(?:-c\s+(?:"[^"]*"|'[^']*'|\S+)|(?:"[^"]+\.py"|'[^']+\.py'|[^\s-]\S*\.py))(?:\s|$)`,
    segment
  );
}
function isHeredocStdinPythonCommand(segment, isHeredocStdinSegment) {
  return isHeredocStdinSegment && regexTest(String.raw`^${pythonExecutablePattern()}\s+-$`, segment);
}
function isBenignSetupCommand(segment) {
  return isSourceActivateCommand(segment) || isBenignPythonVenvCommand(segment) || regexTest(
    String.raw`^mkdir\s+-p\s+(?:"[^"]*"|'[^']*'|[^\s]+)(?:\s+(?:"[^"]*"|'[^']*'|[^\s]+))*$`,
    segment
  ) || regexTest(String.raw`^umask\s+[0-7]{3,4}$`, segment) || regexTest(
    String.raw`^unset\s+[A-Za-z_][A-Za-z0-9_]*(?:\s+[A-Za-z_][A-Za-z0-9_]*)*$`,
    segment
  ) || segment === "hash -r" || isBenignCorepackYarnSetupCommand(segment) || isLiteralSeparatorCommand(segment);
}
function isSourceActivateCommand(segment) {
  return regexTest(
    String.raw`^(?:source|\.)\s+(?:"[^"]*(?:^|/)activate"|'[^']*(?:^|/)activate'|\S*(?:^|/)activate)$`,
    segment
  );
}
function isBenignCorepackYarnSetupCommand(segment) {
  return regexTest(String.raw`^corepack\s+(?:enable|prepare\s+yarn@\S+\s+--activate)$`, segment);
}
function isBenignPythonVenvCommand(segment) {
  return regexTest(String.raw`^${pythonExecutablePattern()}\s+-m\s+venv(?:\s+\S+)+$`, segment) && !regexTest(String.raw`\s(?:--help|-h)(?:\s|$)`, segment);
}
function isBenignGofmtWriteCommand(segment) {
  return regexTest(
    String.raw`^gofmt\s+-w(?:\s+(?:"[^"-][^"]*"|'[^'-][^']*'|[^-\s]\S*))+$`,
    segment
  );
}
function isBenignTarballCleanupCommand(segment) {
  return regexTest(
    String.raw`^rm\s+-f\s+(?:"[^"]+\.tgz"|'[^']+\.tgz'|\S+\.tgz)$`,
    segment
  );
}
function isBenignPythonBuildCleanupCommand(segment) {
  return regexTest(String.raw`^rm\s+-rf\s+dist\s+build\s+\*\.egg-info$`, segment);
}
function isBenignVersionCommand(segment) {
  return regexTest(String.raw`^/\S+\s+(?:--version|-version|version)$`, segment);
}
function isAssignmentList(segment) {
  return regexTest(
    String.raw`^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+))(?:\s+[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+))*$`,
    segment
  );
}
function stripEnvironmentAssignmentPrefix(segment) {
  return regexReplaceAll(
    String.raw`^([A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)+`,
    segment,
    ""
  );
}
function stripSafeCommandWrappers(segment) {
  let current = segment;
  for (let iteration = 0; iteration < 3; iteration++) {
    const before = current;
    current = stripEnvironmentAssignmentPrefix(regexReplaceAll(
      String.raw`^timeout\s+\d+(?:[smhd])?\s+`,
      current,
      ""
    ));
    current = stripEnvironmentAssignmentPrefix(regexReplaceAll(
      String.raw`^env(?:\s+[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+))+\s+`,
      current,
      ""
    ));
    if (current === before) {
      return current;
    }
  }
  return current;
}
function isLiteralSeparatorCommand(segment) {
  return regexTest(
    String.raw`^echo(?:\s+-n)?(?:\s+(?:"[\s#=_.:/*+\-[\]]{1,19}"|'[\s#=_.:/*+\-[\]]{1,19}'))+$`,
    segment
  ) || regexTest(
    String.raw`^printf\s+(?:"(?:[\s#=_.:/*+\-[\]]|\\n|\\t){1,19}"|'(?:[\s#=_.:/*+\-[\]]|\\n|\\t){1,19}')$`,
    segment
  );
}
function isSafeShellGrepCommand(segment) {
  const tokens = splitWhitespace(segment);
  const command = tokens[0];
  if (command === void 0) {
    return false;
  }
  if (!(command === "rg" || command === "grep" || command === "egrep" || command === "fgrep")) {
    return false;
  }
  const args = tokens.slice(1);
  let patternCount = 0;
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--") {
      return i < args.length - 1 && !args.slice(i + 1).some((a) => isSavedToolOutputPath(a));
    }
    if (arg === "-e" || arg === "--regexp") {
      i += 1;
      if (i >= args.length) {
        return false;
      }
      patternCount += 1;
      if (patternCount > 1) {
        return false;
      }
      i += 1;
      continue;
    }
    if (arg.startsWith("-e") && arg.length > 2 || arg.startsWith("--regexp=")) {
      patternCount += 1;
      if (patternCount > 1) {
        return false;
      }
      i += 1;
      continue;
    }
    if (isShellGrepFlagWithValue(arg)) {
      i += 1;
      if (i >= args.length) {
        return false;
      }
      i += 1;
      continue;
    }
    if (regexTest(String.raw`^(?:--glob|--include|--exclude|--exclude-dir)=`, arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      if (isUnsafeShellGrepFlag(arg) || !isSafeShellGrepFlag(command, arg)) {
        return false;
      }
      i += 1;
      continue;
    }
    if (isSavedToolOutputPath(arg)) {
      return false;
    }
    if (patternCount === 0) {
      patternCount += 1;
    }
    i += 1;
  }
  return patternCount === 1;
}
function isShellGrepFlagWithValue(arg) {
  return arg === "-g" || arg === "--glob" || arg === "--include" || arg === "--exclude" || arg === "--exclude-dir";
}
function isSafeShellGrepFlag(command, arg) {
  return (command === "rg" ? regexTest(String.raw`^-[nHiwxEFP]+$`, arg) : regexTest(String.raw`^-[nHiwxErRFP]+$`, arg)) || regexTest(
    String.raw`^(?:--line-number|--with-filename|--no-heading|--ignore-case|--word-regexp|--line-regexp|--recursive|--extended-regexp|--fixed-strings|--perl-regexp|--color=never)$`,
    arg
  );
}
function isUnsafeShellGrepFlag(arg) {
  return arg === "-f" || arg === "--file" || arg.startsWith("--file=") || regexTest(
    String.raw`^(?:--json|--vimgrep|--files|--type-list|--heading|--no-line-number|--no-filename|--count|--count-matches|--files-with(?:out)?-matches|--only-matching|--quiet|--null|--null-data|--text|--binary|--context|--before-context|--after-context|--invert-match|--passthru|--replace|--line-buffered|--color=always)$`,
    arg
  ) || regexTest(String.raw`^-[^-]*[A-CLlcoqvZ0]`, arg);
}
function isSafeStreamingGrepTail(segment) {
  const argsText = stripPrefix(segment, "grep ") ?? stripPrefix(segment, "egrep ") ?? stripPrefix(segment, "fgrep ");
  if (argsText === void 0) {
    return false;
  }
  const args = splitWhitespace(argsText);
  let patternCount = 0;
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--") {
      return i === args.length - 1;
    }
    if (arg === "-e" || arg === "--regexp") {
      i += 1;
      if (i >= args.length) {
        return false;
      }
      patternCount += 1;
      i += 1;
      continue;
    }
    if (arg.startsWith("-e") && arg.length > 2 || arg.startsWith("--regexp=")) {
      patternCount += 1;
      i += 1;
      continue;
    }
    if (arg === "-f" || arg === "--file" || arg.startsWith("--file=") || regexTest(String.raw`^-[^-]*[cCfFPRrLlmoq]`, arg) || regexTest(
      String.raw`^(?:--(?:count|fixed-strings|perl-regexp|recursive|dereference-recursive|files-with-matches|files-without-match|only-matching|quiet|include|exclude|exclude-dir)|--(?:include|exclude|exclude-dir)=)`,
      arg
    )) {
      return false;
    }
    if (arg.startsWith("-")) {
      i += 1;
      continue;
    }
    patternCount += 1;
    if (patternCount > 1) {
      return false;
    }
    i += 1;
  }
  return patternCount === 1;
}
function isSafeStreamingFlagOnlyTail(segment) {
  const tokens = splitWhitespace(segment);
  const command = tokens[0];
  if (command === void 0) {
    return false;
  }
  if (!(command === "wc" || command === "sort" || command === "uniq" || command === "cut")) {
    return false;
  }
  const args = tokens.slice(1);
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--") {
      return i === args.length - 1;
    }
    if (command === "sort" && (arg === "-o" || arg === "--output" || arg.startsWith("--output="))) {
      return false;
    }
    if (command === "cut" && (arg === "-d" || arg === "-f" || arg === "-c" || arg === "-b")) {
      i += 1;
      if (i >= args.length) {
        return false;
      }
      i += 1;
      continue;
    }
    if (!arg.startsWith("-")) {
      return false;
    }
    i += 1;
  }
  return true;
}
function isSavedToolOutputPath(arg) {
  return regexTest(
    String.raw`(?:^|/)(?:\d+-copilot-tool-output-|copilot-tool-output(?:-original)?-|original-output-\d+-)`,
    arg
  );
}
function normalizeSegment(segment) {
  const trimmed = segment.trim();
  const withoutRedirects = regexReplaceAll(String.raw`\s+(?:2>&1|1>&2)\b`, trimmed, "");
  return regexReplaceAll(String.raw`\s+`, withoutRedirects, " ");
}
function replaceSafeCommandSubstitutions(command) {
  if (!regexTest(String.raw`\btools/linter/adapters/clangformat_linter\.py\b`, command)) {
    return command;
  }
  return regexReplaceAll(
    `\\$\\(\\s*git\\s+--no-pager\\s+ls-files(?:\\s+(?:"[^"\`$()]*"|'[^'\`$()]*'|[^'"\`()$;&<>|\\s]+))*\\s*\\)`,
    command,
    "__SAFE_GIT_LS_FILES__"
  );
}
function splitCommandSegments(command) {
  const segments = [];
  let start = 0;
  let inSingle = false;
  let inDouble = false;
  let idx = 0;
  while (idx < command.length) {
    const ch = command[idx];
    const next = idx + 1 < command.length ? command[idx + 1] : void 0;
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle && !isEscapedByOddBackslashes(command, idx)) {
      inDouble = !inDouble;
    } else if (!inSingle && !inDouble && (ch === "&" && next === "&" || ch === "|" && next === "|")) {
      pushCommandSegment(segments, command.slice(start, idx));
      start = idx + 2;
      idx += 1;
    } else if (!inSingle && !inDouble && (ch === "\n" || ch === "\r")) {
      pushCommandSegment(segments, command.slice(start, idx));
      let nextStart = idx + 1;
      if (ch === "\r" && next === "\n") {
        idx += 1;
        nextStart += 1;
      }
      start = nextStart;
    }
    idx += 1;
  }
  pushCommandSegment(segments, command.slice(start));
  return segments;
}
function pushCommandSegment(segments, segment) {
  const trimmed = segment.trim();
  if (trimmed.length !== 0) {
    segments.push(trimmed);
  }
}
function stripQuotedText(command) {
  let stripped = "";
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      stripped += ch;
    } else if (ch === '"' && !inSingle && !isEscapedByOddBackslashes(command, i)) {
      inDouble = !inDouble;
      stripped += ch;
    } else if (inSingle) {
      stripped += " ";
    } else if (inDouble) {
      stripped += ch === "$" || ch === "(" || ch === "`" ? ch : " ";
    } else {
      stripped += ch;
    }
  }
  return stripped;
}
function isEscapedByOddBackslashes(text, index) {
  let count = 0;
  let i = index;
  while (i > 0) {
    i -= 1;
    if (text[i] === "\\") {
      count += 1;
    } else {
      break;
    }
  }
  return count % 2 === 1;
}
function isWhitespaceChar(ch) {
  return /\s/.test(ch);
}
function startsWithWhitespace(line) {
  return line.length > 0 && isWhitespaceChar(line[0]);
}
function stripHeredocBodies(command) {
  const lines = command.split("\n").map((line) => stripSuffix(line, "\r") ?? line);
  const stripped = [];
  const heredocStdinSegmentIndexes = /* @__PURE__ */ new Set();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const heredoc = parseHeredocOpener(line);
    if (heredoc === void 0) {
      stripped.push(line);
      i += 1;
      continue;
    }
    const commandBeforeHeredoc = lastChainSegment(heredoc.prefix);
    if (regexTest(
      String.raw`^${pythonExecutablePattern()}\s+-$`,
      normalizeSegment(commandBeforeHeredoc)
    )) {
      let commandThroughHeredocOpener = stripped.join("\n");
      if (commandThroughHeredocOpener.length !== 0) {
        commandThroughHeredocOpener += "\n";
      }
      commandThroughHeredocOpener += heredoc.prefix;
      heredocStdinSegmentIndexes.add(
        saturatingSub(splitCommandSegments(commandThroughHeredocOpener).length, 1)
      );
    }
    stripped.push(`${heredoc.prefix} ${heredoc.suffix}`.trimEnd());
    i += 1;
    while (i < lines.length && lines[i].trim() !== heredoc.delimiter) {
      i += 1;
    }
    if (i >= lines.length) {
      return void 0;
    }
    i += 1;
  }
  return {
    command: stripped.join("\n"),
    heredocStdinSegmentIndexes
  };
}
function parseHeredocOpener(line) {
  let inSingle = false;
  let inDouble = false;
  let index = 0;
  while (index + 1 < line.length) {
    const ch = line[index];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      index += 1;
      continue;
    }
    if (ch === '"' && !inSingle && !isEscapedByOddBackslashes(line, index)) {
      inDouble = !inDouble;
      index += 1;
      continue;
    }
    if (!inSingle && !inDouble && ch === "#" && (index === 0 || isWhitespaceChar(line[index - 1]))) {
      return void 0;
    }
    if (inSingle || inDouble || ch !== "<" || line[index + 1] !== "<") {
      index += 1;
      continue;
    }
    let cursor = index + 2;
    if (line[cursor] === "-") {
      cursor += 1;
    }
    while (cursor < line.length && isWhitespaceChar(line[cursor])) {
      cursor += 1;
    }
    let delimiter = "";
    const quote = cursor < line.length ? line[cursor] : void 0;
    if (quote === "'" || quote === '"') {
      cursor += 1;
      const start = cursor;
      while (cursor < line.length && line[cursor] !== quote) {
        cursor += 1;
      }
      if (cursor >= line.length) {
        return void 0;
      }
      delimiter += line.slice(start, cursor);
      cursor += 1;
    } else {
      const start = cursor;
      while (cursor < line.length && !isWhitespaceChar(line[cursor])) {
        cursor += 1;
      }
      delimiter += line.slice(start, cursor);
    }
    if (!regexTest(String.raw`^[A-Za-z_][A-Za-z0-9_]*$`, delimiter)) {
      return void 0;
    }
    return {
      prefix: line.slice(0, index),
      suffix: line.slice(cursor),
      delimiter
    };
  }
  return void 0;
}
function lastChainSegment(commandPrefix) {
  const parts = commandPrefix.split(new RegExp(String.raw`\s*(?:&&|\|\||;)\s*`));
  const last = parts.length > 0 ? parts[parts.length - 1] : commandPrefix;
  return last.trim();
}
function hasErrexitBeforeFirstCommand(segments, segmentKinds) {
  let firstNonBenign = segmentKinds.findIndex((kind) => !segmentsEqual(kind, BENIGN_SEGMENT));
  if (firstNonBenign === -1) {
    firstNonBenign = segmentKinds.length;
  }
  return segments.slice(0, firstNonBenign).some((segment) => isSetECommand(segment));
}
function isSetECommand(segment) {
  const normalized = normalizeSegment(segment);
  return regexTest(
    String.raw`^set\s+-(?=[A-Za-z]*e)[A-Za-z]+(?:\s+[-+A-Za-z]+)*$`,
    normalized
  ) || regexTest(String.raw`\s-o\s+errexit\b`, normalized);
}
function commandRunsGoTest(command) {
  return regexTest(
    String.raw`(?:^|[\s;&|(])go\s+test(?:\s|$)`,
    stripQuotedText(command)
  );
}
function commandMentionsSavedToolOutput(command) {
  return splitWhitespace(command).some((token) => isSavedToolOutputPath(token));
}
function looksLikeNpmPackOutput(output) {
  return output.includes("npm notice Tarball Contents") && output.includes("npm notice Tarball Details");
}
function hasDocusaurusProgress(output) {
  return output.split("\n").some((line) => regexTest(String.raw`^\s*\u25CF\s+Client\s+`, line)) && output.split("\n").some((line) => regexTest(String.raw`^\s*[\u25CF\u25EF]\s+Server(?:\s+|$)`, line));
}
function hasPassingGoTestOutput(output) {
  return !hasGoTestFailureOutput(output) && output.split("\n").some((line) => isGoModuleDownloadChatterLine(line));
}
function hasGoTestFailureOutput(output) {
  return regexTest(
    String.raw`(?:^|\n)(?:--- FAIL:|FAIL(?:\s|$)|panic:|fatal error:|\s*Error Trace:|\S+\.go:\d+:|# \S+|diff \S+|--- (?!PASS:)|\+\+\+ |@@ |.*\[(?:build|setup) failed\])`,
    output
  );
}
function pythonExecutablePattern() {
  return String.raw`(?:(?:[A-Za-z0-9_./+-]+/)?(?:python|python3(?:\.\d+)?))`;
}
function pythonWithOptionsPattern() {
  return String.raw`${pythonExecutablePattern()}(?:\s+(?:-[BEsStuUvVqQ]|-W\S+|-X\s+\S+))*`;
}
function compactShellOutput(commandKinds, output, compactGoPassingTestOutput, shellGrepLargeOutputThreshold) {
  const state = { output, lossless: true };
  applyStringCompactor(state, compactCarriageReturnProgress);
  applyStringCompactor(state, compactNeedrestartNoopProgress);
  applyStringCompactor(state, compactGoRuntimePanicDump);
  if (compactGoPassingTestOutput && !commandKinds.includes("go")) {
    applyStringCompactor(state, compactGoOutput);
  }
  applyStringCompactor(state, compactJestRunsProgress);
  applyStringCompactor(state, compactDocusaurusProgress);
  applyStringCompactor(state, compactSphinxProgressFallback);
  if (!commandKinds.includes("npm-pack")) {
    applyStringCompactor(state, compactNpmPackOutput);
  }
  for (const kind of COMMAND_COMPACTOR_ORDER.filter((candidate) => commandKinds.includes(candidate))) {
    const result = compactCommandEntry(kind, state.output, shellGrepLargeOutputThreshold);
    state.output = result.output;
    state.lossless = state.lossless && result.lossless;
  }
  if (state.output === output) {
    return void 0;
  }
  return {
    output: state.output,
    lossless: state.lossless
  };
}
function applyStringCompactor(state, compact2) {
  const next = compact2(state.output);
  if (next !== state.output) {
    state.lossless = false;
  }
  state.output = next;
}
function compactCommandEntry(kind, output, shellGrepLargeOutputThreshold) {
  if (kind === "shell-grep") {
    return compactToolOutput(
      "grep-content",
      output,
      shellGrepLargeOutputThreshold
    ) ?? unchanged(output);
  }
  const original = output;
  let result;
  switch (kind) {
    case "pip": {
      let next = applyPythonBuildNoise(output);
      next = compactGitProgress(next);
      next = compactPackageManagerOperations(next);
      next = compactPythonNinjaBuildProgress(next);
      result = compactPipInstallProgress(next);
      break;
    }
    case "python-build": {
      let next = applyPythonBuildNoise(output);
      next = compactGitProgress(next);
      next = compactSetuptoolsFileStagingRuns(next);
      next = compactPythonNinjaBuildProgress(next);
      result = compactPipInstallProgress(next);
      break;
    }
    case "pytest": {
      let next = compactPythonEcosystemNoise(output);
      next = compactPytestProgress(next);
      next = compactPytestFailureBlocks(next);
      next = compactPytestWarningsSummary(next);
      next = compactPytestSessionMetadata(next);
      next = compactSphinxProgress(next);
      result = compactRepeatedDiagnosticBlocks(next);
      break;
    }
    case "python-build-ext": {
      let next = applyPythonBuildNoise(output);
      next = compactPythonNinjaBuildProgress(next);
      next = compactPythonBuildExtProgress(next);
      next = compactSphinxProgress(next);
      result = compactRepeatedDiagnosticBlocks(next);
      break;
    }
    case "django-test": {
      let next = compactPythonEcosystemNoise(output);
      next = compactDjangoTestBoilerplate(next);
      next = compactDjangoTestProgress(next);
      next = compactPytestWarningsSummary(next);
      next = compactSphinxProgress(next);
      result = compactRepeatedDiagnosticBlocks(next);
      break;
    }
    case "python-script": {
      let next = applyPythonBuildNoise(output);
      next = compactSphinxProgress(next);
      result = compactRepeatedDiagnosticBlocks(next);
      break;
    }
    case "apt":
      result = compactAptOutput(output);
      break;
    case "npm":
      result = compactNpmOutput(output);
      break;
    case "npm-pack":
      result = compactNpmPackOutput(output);
      break;
    case "yarn-berry":
      result = compactYarnBerryOutput(output);
      break;
    case "pnpm":
      result = compactPnpmOutput(output);
      break;
    case "composer":
    case "poetry":
      result = compactPackageManagerOperations(output);
      break;
    case "uv":
      result = compactUvProgress(compactPackageManagerOperations(output));
      break;
    case "maven":
      result = compactMavenOutput(output);
      break;
    case "dotnet":
      result = compactDotnetTimingProgress(output);
      break;
    case "go":
      result = compactGoCommandOutput(output);
      break;
    case "unittest":
      result = compactUnittestOutput(output);
      break;
    case "js-test":
      result = compactJsTestOutput(output);
      break;
    case "cargo":
      result = compactCargoProgress(output);
      break;
    case "node":
      result = compactRepeatedNodeWarnings(output);
      break;
    case "git":
      result = compactGitProgress(output);
      break;
    case "git-clean":
      result = compactGitCleanRemovingRuns(output);
      break;
    case "nx":
      result = compactNxLernaFrameProgress(output);
      break;
    case "golangci-lint":
      result = compactGolangciLintOutput(output, false);
      break;
    case "clang-format-linter":
      result = compactClangFormatLinterOutput(output);
      break;
    case "gradle":
      result = compactGradleOutput(output);
      break;
    case "cmake":
      result = compactCmakeConfigureProbeRuns(output);
      break;
    case "make":
      result = compactMakeOutput(output);
      break;
    default:
      result = output;
      break;
  }
  return stringCompactionResult(original, result);
}
function stringCompactionResult(original, output) {
  const lossless = output === original;
  return { output, lossless };
}
function applyPythonBuildNoise(output) {
  let next = compactSetuptoolsDeprecationBlocks(output);
  next = compactCythonPerformanceHints(next);
  next = compactCompilerWarningRuns(next);
  next = compactPythonEcosystemNoise(next);
  return compactNumpyDistutilsProbes(next);
}
function compactGoCommandOutput(output) {
  return compactRepeatedDiagnosticBlocks(compactGoOutput(output));
}
function compactMavenOutput(output) {
  return compactMavenInfoBoilerplate(compactMavenPassingTests(
    compactMavenDependencyTransfer(output)
  ));
}
function compactPythonEcosystemNoise(output) {
  return omitNonDiagnosticLines(
    output,
    "python ecosystem noise",
    isPythonEcosystemNoiseLine
  );
}
function compactPipInstallProgress(output) {
  return omitNonDiagnosticLines(output, "pip install progress", isPipInstallProgressLine);
}
function compactPythonNinjaBuildProgress(output) {
  return omitNonDiagnosticLines(
    output,
    "python ninja build progress",
    isPythonNinjaBuildProgressLine
  );
}
function compactPythonBuildExtProgress(output) {
  return omitNonDiagnosticLines(
    output,
    "python build_ext progress",
    isPythonBuildExtProgressLine
  );
}
function compactSphinxProgressFallback(output) {
  if (hasSphinxProgress(output)) {
    return compactSphinxProgress(output);
  }
  return output;
}
function compactPytestSessionMetadata(output) {
  return omitNonDiagnosticLines(
    output,
    "pytest session metadata",
    isPytestSessionMetadataLine
  );
}
function compactDjangoTestBoilerplate(output) {
  return omitNonDiagnosticLines(output, "django test boilerplate", isDjangoTestBoilerplateLine);
}
function compactDjangoTestProgress(output) {
  return omitNonDiagnosticLines(output, "django test progress", isDjangoTestProgressLine);
}
function compactClangFormatLinterOutput(output) {
  return omitNonDiagnosticLines(output, "clang-format debug", isClangFormatDebugLine);
}
function compactDotnetTimingProgress(output) {
  const compacted = [];
  const bufferedProgress = [];
  const timing = { count: 0 };
  for (const line of output.split("\n")) {
    if (line.trim().length === 0 || isDotnetStandaloneTimingLine(line)) {
      bufferedProgress.push(line);
      if (isDotnetStandaloneTimingLine(line)) {
        timing.count += 1;
      }
      continue;
    }
    flushDotnetTimingProgress(compacted, bufferedProgress, timing);
    compacted.push(line);
  }
  flushDotnetTimingProgress(compacted, bufferedProgress, timing);
  return compacted.join("\n");
}
function flushDotnetTimingProgress(compacted, bufferedProgress, timing) {
  if (timing.count >= 3) {
    compacted.push(`[dotnet timing progress: omitted ${timing.count} timing line(s)]`);
  } else {
    for (const line of bufferedProgress) {
      compacted.push(line);
    }
  }
  bufferedProgress.length = 0;
  timing.count = 0;
}
function isDotnetStandaloneTimingLine(line) {
  return regexTest(String.raw`^\s*\(\d+(?:\.\d+)?s\)\s*$`, line);
}
function compactGitCleanRemovingRuns(output) {
  return collapseContiguousRuns(output, isGitCleanRemovingLine, 16, (block) => {
    const keptStart = block.slice(0, Math.min(5, block.length));
    const keptEndStart = saturatingSub(block.length, 5);
    const keptEnd = block.slice(keptEndStart);
    const omitted = saturatingSub(block.length, keptStart.length + keptEnd.length);
    if (omitted === 0) {
      return void 0;
    }
    const lines = [...keptStart];
    lines.push(`[git clean: omitted ${omitted} Removing line(s)]`);
    lines.push(...keptEnd);
    return lines.join("\n");
  });
}
function isGitCleanRemovingLine(line) {
  return regexTest(String.raw`^Removing \S+`, line);
}
function collapseContiguousRuns(output, isMember, minRun, summarize) {
  const lines = output.split("\n");
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    if (!isMember(lines[i])) {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    const start = i;
    while (i < lines.length && isMember(lines[i])) {
      i += 1;
    }
    const block = lines.slice(start, i);
    const summary = block.length >= minRun ? summarize(block) : void 0;
    if (summary !== void 0) {
      compacted.push(summary);
    } else {
      compacted.push(...block);
    }
  }
  return compacted.join("\n");
}
function collapseRunsWithExamples(output, isMember, example, summarize) {
  return collapseContiguousRuns(output, isMember, 5, (block) => {
    const examples = [];
    for (const line of block) {
      const ex = example(line);
      if (ex !== void 0) {
        examples.push(ex);
      }
    }
    if (examples.length !== block.length) {
      return void 0;
    }
    return summarize(
      block.length,
      summarizeWithMore(uniqueStrings(examples), 10)
    );
  });
}
function compactRepeatedNodeWarnings(output) {
  const seen = [];
  return omitMatchingLines(
    output,
    "node warnings",
    (line) => {
      const key = getNodeWarningKey(line);
      if (key === void 0) {
        return false;
      }
      if (seen.includes(key)) {
        return true;
      }
      seen.push(key);
      return false;
    },
    "repeated warning"
  );
}
function getNodeWarningKey(line) {
  if (regexTest(
    String.raw`^\(node:\d+\) (?:\[[A-Z0-9_-]+\] )?(?:ExperimentalWarning|DeprecationWarning|Warning): `,
    line
  )) {
    return regexReplaceAll(String.raw`^\(node:\d+\)`, line, "(node)");
  }
  if (line.startsWith("(Use `node --trace-warnings") || line.startsWith("(Use `node --trace-deprecation")) {
    return line;
  }
  return void 0;
}
function omitMatchingLines(output, label, shouldOmit, summarySuffix) {
  const compacted = [];
  const omitted = { count: 0 };
  for (const line of output.split("\n")) {
    if (shouldOmit(line)) {
      omitted.count += 1;
    } else {
      flushOmittedLines(compacted, label, omitted, summarySuffix);
      compacted.push(line);
    }
  }
  flushOmittedLines(compacted, label, omitted, summarySuffix);
  return compacted.join("\n");
}
function omitNonDiagnosticLines(output, label, shouldOmit) {
  return omitMatchingLines(output, label, shouldOmit, "non-diagnostic");
}
function flushOmittedLines(compacted, label, omitted, summarySuffix) {
  if (omitted.count > 0) {
    compacted.push(`[${label}: omitted ${omitted.count} ${summarySuffix} line(s)]`);
    omitted.count = 0;
  }
}
function compactPackageManagerOperations(output) {
  if (!hasPackageManagerOperations(output)) {
    return output;
  }
  return collapseRunsWithExamples(
    output,
    isPackageManagerOperationLine,
    packageManagerOperationExample,
    (len, examples) => `[package operations: omitted ${len} row(s); examples: ${examples}]`
  );
}
function hasPackageManagerOperations(output) {
  const hasMarker = output.includes("Installing dependencies from lock file") || output.includes("Lock file operations:") || output.includes("Package operations:") || output.includes("Writing lock file") || output.includes("Generating autoload files") || output.includes("Lock file is up to date");
  return hasMarker && output.split("\n").some((line) => isPackageManagerOperationLine(line));
}
function isPackageManagerOperationLine(line) {
  if (regexTestWithFlags(String.raw`(?:Failed|Error|Exception|Traceback|fatal)`, line, "i")) {
    return false;
  }
  return parsePackageManagerOperation(line) !== void 0;
}
function packageManagerOperationExample(line) {
  const parsed = parsePackageManagerOperation(line);
  if (parsed === void 0) {
    return void 0;
  }
  return parsed.version !== void 0 ? `${parsed.pkg} (${parsed.version})` : parsed.pkg;
}
function parsePackageManagerOperation(line) {
  const restAfterDash = stripPrefix(line, "  - ");
  if (restAfterDash === void 0) {
    return void 0;
  }
  const operationSplit = splitOnce(restAfterDash, " ");
  if (operationSplit === void 0) {
    return void 0;
  }
  const operation = operationSplit[0];
  let rest = operationSplit[1];
  if (!["Installing", "Locking", "Updating", "Removing", "Downloading"].includes(operation)) {
    return void 0;
  }
  const packageSplit = splitOnce(rest, " ");
  let pkg;
  if (packageSplit === void 0) {
    pkg = rest;
    rest = "";
  } else {
    pkg = packageSplit[0];
    rest = packageSplit[1];
  }
  if (pkg.length === 0) {
    return void 0;
  }
  if (rest.length === 0) {
    return { operation, pkg, version: void 0 };
  }
  const afterOpen = stripPrefix(rest, "(");
  if (afterOpen !== void 0) {
    const closeSplit = splitOnce(afterOpen, ")");
    if (closeSplit !== void 0) {
      const version = closeSplit[0];
      const afterClose = closeSplit[1];
      if (afterClose.length === 0 || afterClose.startsWith(": ")) {
        return { operation, pkg, version };
      }
    }
  }
  if (rest.startsWith(": ")) {
    return { operation, pkg, version: void 0 };
  }
  return void 0;
}
function uniqueStrings(items) {
  const unique = [];
  for (const item of items) {
    if (!unique.includes(item)) {
      unique.push(item);
    }
  }
  return unique;
}
function summarizeWithMore(items, maxItems) {
  const shown = items.slice(0, maxItems);
  const omitted = saturatingSub(items.length, shown.length);
  if (omitted > 0) {
    return `${shown.join(", ")}, ... +${omitted} more`;
  }
  return shown.join(", ");
}
function compactNpmPackOutput(output) {
  if (!looksLikeNpmPackOutput(output)) {
    return output;
  }
  const compacted = [];
  let inTarballContents = false;
  const omittedFileRows = { count: 0 };
  for (const line of output.split("\n")) {
    const normalizedLine = stripNpmSpinnerPrefix(line);
    if (normalizedLine === "npm notice Tarball Contents") {
      inTarballContents = true;
      compacted.push(line);
      continue;
    }
    if (normalizedLine === "npm notice Tarball Details") {
      flushNpmPackOmitted(compacted, omittedFileRows);
      inTarballContents = false;
      compacted.push(line);
      continue;
    }
    if (inTarballContents && isNpmPackFileListingLine(normalizedLine)) {
      omittedFileRows.count += 1;
      continue;
    }
    compacted.push(line);
  }
  flushNpmPackOmitted(compacted, omittedFileRows);
  return compacted.join("\n");
}
function flushNpmPackOmitted(compacted, omittedFileRows) {
  if (omittedFileRows.count > 0) {
    compacted.push(`[npm pack tarball contents: omitted ${omittedFileRows.count} file listing line(s)]`);
    omittedFileRows.count = 0;
  }
}
function isNpmPackFileListingLine(line) {
  const rest0 = stripPrefix(line, "npm notice ");
  if (rest0 === void 0) {
    return false;
  }
  let numberEnd = rest0.length;
  for (let i = 0; i < rest0.length; i++) {
    const ch = rest0[i];
    if (!isAsciiDigit(ch) && ch !== ".") {
      numberEnd = i;
      break;
    }
  }
  if (numberEnd === 0 || !isDecimalNumber(rest0.slice(0, numberEnd))) {
    return false;
  }
  const rest = rest0.slice(numberEnd).trimStart();
  return ["B", "kB", "MB", "GB"].some((unit) => {
    const value = stripPrefix(rest, unit);
    return value !== void 0 && value.startsWith(" ");
  });
}
function stripNpmSpinnerPrefix(line) {
  const trimmed = trimStartMatchesChars(line, ["|", "/", "-"]);
  if (trimmed.startsWith("npm notice ")) {
    return trimmed;
  }
  return line;
}
function isDecimalNumber(value) {
  if (value.length === 0) {
    return false;
  }
  let hasDigit = false;
  let dotCount = 0;
  for (const ch of value) {
    if (isAsciiDigit(ch)) {
      hasDigit = true;
    } else if (ch === ".") {
      dotCount += 1;
    } else {
      return false;
    }
  }
  return dotCount <= 1 && hasDigit;
}
function compactGoOutput(output) {
  const compacted = [];
  const downloadCount = { count: 0 };
  for (const line of output.split("\n")) {
    if (isGoModuleDownloadChatterLine(line)) {
      downloadCount.count += 1;
    } else {
      flushGoDownloads(compacted, downloadCount);
      compacted.push(line);
    }
  }
  flushGoDownloads(compacted, downloadCount);
  return compacted.join("\n");
}
function flushGoDownloads(compacted, downloadCount) {
  if (downloadCount.count > 0) {
    compacted.push(`[go test: omitted ${downloadCount.count} dependency download line(s)]`);
    downloadCount.count = 0;
  }
}
function isGoModuleDownloadChatterLine(line) {
  if (isDiagnosticLine(line)) {
    return false;
  }
  return line.startsWith("go: downloading ") || line.startsWith("go: finding module for package ") || line.startsWith("go: extracting ") || line.startsWith("go: found ") && line.includes(" in ");
}
function compactRepeatedDiagnosticBlocks(output) {
  const lines = output.split("\n");
  const diagnosticLines = lines.map((line) => isDiagnosticLine(line));
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    const repeatedBlock = findRepeatedDiagnosticBlock(lines, diagnosticLines, i);
    if (repeatedBlock === void 0) {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    compacted.push(...lines.slice(i, i + repeatedBlock.lineCount));
    compacted.push(
      `[repeated diagnostic block: previous ${repeatedBlock.lineCount} line(s) repeated ${repeatedBlock.repetitions} more time(s)]`
    );
    i += repeatedBlock.lineCount * (repeatedBlock.repetitions + 1);
  }
  return compacted.join("\n");
}
function findRepeatedDiagnosticBlock(lines, diagnosticLines, start) {
  for (let lineCount = 6; lineCount >= 2; lineCount--) {
    if (start + lineCount * 2 > lines.length) {
      continue;
    }
    if (!diagnosticLines.slice(start, start + lineCount).some((isDiagnostic) => isDiagnostic)) {
      continue;
    }
    let repetitions = 0;
    while (start + (repetitions + 2) * lineCount <= lines.length) {
      const offset = start + (repetitions + 1) * lineCount;
      if (!arraySliceEqual(lines, start, offset, lineCount)) {
        break;
      }
      repetitions += 1;
    }
    if (repetitions > 0) {
      return { lineCount, repetitions };
    }
  }
  return void 0;
}
function isDiagnosticLine(line) {
  return regexTestWithFlags(
    String.raw`(?:\u2715|\u2717|\u00D7)|\b(?:error|warning|warn|fatal|failed|failure|traceback|exception|panic|assertion|aborted|abort trap|segmentation fault|core dumped)\b|npm ERR!|^E:|^W:|^FAIL\b`,
    line,
    "i"
  );
}
function compactCargoProgress(output) {
  if (!hasCargoProgressOutput(output)) {
    return output;
  }
  return omitMatchingLines(output, "cargo progress", isCargoProgressLine, "progress");
}
function hasCargoProgressOutput(output) {
  return !hasCargoFailure(output) && hasCargoTerminalSummary(output) && hasCargoProgressEvidence(output);
}
function hasCargoProgressEvidence(output) {
  return output.split("\n").some((line) => {
    const trimmed = line.trimStart();
    return CARGO_PROGRESS_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
  });
}
function isCargoProgressLine(line) {
  if (isDiagnosticLine(line)) {
    return false;
  }
  const trimmed = line.trimStart();
  return CARGO_PROGRESS_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}
function hasCargoFailure(output) {
  return output.split("\n").some((line) => {
    const trimmed = line.trimStart();
    return trimmed.startsWith("error:") || trimmed.startsWith("error[") || trimmed.startsWith("test result: FAILED") || trimmed.startsWith("failures:");
  });
}
function hasCargoTerminalSummary(output) {
  return output.split("\n").some((line) => {
    const trimmed = line.trimStart();
    return trimmed.startsWith("Finished ") && trimmed.includes(" target(s) in") || trimmed.startsWith("test result: ok.");
  });
}
function compactUnittestOutput(output) {
  if (hasPassingUnittestSummary(output)) {
    return omitNonDiagnosticLines(
      output,
      "unittest progress",
      isUnittestSuccessProgressLine
    );
  }
  return output;
}
function hasPassingUnittestSummary(output) {
  return regexTest(
    String.raw`(?:^|\n)Ran \d+ tests? in \d+(?:\.\d+)?s\s*(?:\n|$)`,
    output
  ) && regexTest(String.raw`(?:^|\n)OK(?:\s+\([^)]+\))?\s*(?:\n|$)`, output) && !regexTestWithFlags(
    String.raw`(?:^|\n)(?:FAILED|ERROR|FAIL):|\b(?:failures?|errors?)=\d*[1-9]\d*`,
    output,
    "i"
  );
}
function isUnittestSuccessProgressLine(line) {
  if (isDiagnosticLine(line)) {
    return false;
  }
  const allDashes = [...line].every((ch) => ch === "-") && byteLength(line) >= 20;
  const allProgressChars = line.length > 0 && [...line].every((ch) => ".sSxXuUbB".includes(ch));
  const testLine = regexTest(String.raw`^test_\S+ \([^)]+\) \.\.\. ok$`, line);
  return allDashes || allProgressChars || testLine;
}
function isClangFormatDebugLine(line) {
  return regexTest(String.raw`^<Thread_\d+:DEBUG> (?:\$ .+|took \d+ms)$`, line);
}
function compactCmakeConfigureProbeRuns(output) {
  return collapseContiguousRuns(
    output,
    isCmakeConfigureProbeLine,
    8,
    (block) => `[cmake configure: omitted ${block.length} status probe line(s)]`
  );
}
function isCmakeConfigureProbeLine(line) {
  if (!line.startsWith("-- ") || regexTest(
    String.raw`^-- (?:Configuring done|Generating done|Build files have been written to:)`,
    line
  )) {
    return false;
  }
  return regexTest(String.raw`^-- Performing Test \S+(?: - Success)?$`, line) || isCmakeLookingForProbeLine(line) || regexTest(String.raw`^-- Detecting .+(?: - done)?$`, line) || regexTest(String.raw`^-- Check(?:ing)? .+(?: - done)?$`, line) || regexTest(
    String.raw`^-- Check for working \S+ compiler: .+(?: - (?:skipped|works))?$`,
    line
  );
}
function isCmakeLookingForProbeLine(line) {
  return !line.endsWith(" - not found") && regexTest(String.raw`^-- Looking for .+(?: - found)?$`, line);
}
function compactMavenDependencyTransfer(output) {
  if (!hasMavenDependencyTransfer(output)) {
    return output;
  }
  return collapseRunsWithExamples(
    output,
    isMavenDependencyTransferLine,
    mavenDependencyTransferExample,
    (len, examples) => `[maven dependency transfer: omitted ${len} row(s); examples: ${examples}]`
  );
}
function compactMavenPassingTests(output) {
  if (!hasMavenPassingTests(output)) {
    return output;
  }
  return collapseRunsWithExamples(
    output,
    isMavenPassingTestLine,
    mavenPassingTestExample,
    (len, examples) => `[maven test summary: omitted ${len} passing class row(s); examples: ${examples}]`
  );
}
function compactMavenInfoBoilerplate(output) {
  if (!hasMavenInfoBoilerplate(output)) {
    return output;
  }
  return omitMatchingLines(
    output,
    "maven boilerplate",
    isMavenInfoBoilerplateLine,
    "boilerplate"
  );
}
function hasMavenDependencyTransfer(output) {
  return isMavenOutput(output) && output.split("\n").some((line) => line.startsWith("[INFO] Downloading from ") || line.startsWith("[INFO] Downloaded from "));
}
function hasMavenPassingTests(output) {
  return isMavenOutput(output) && output.split("\n").some((line) => line.startsWith("[INFO] Tests run: ") && line.includes(", Failures: 0, Errors: 0, Skipped: "));
}
function hasMavenInfoBoilerplate(output) {
  return isMavenOutput(output) && output.split("\n").some((line) => isMavenInfoBoilerplateLine(line));
}
function isMavenOutput(output) {
  return output.split("\n").some((line) => line.startsWith("[INFO] Scanning for projects...") || line.startsWith("[INFO] BUILD SUCCESS") || line.startsWith("[INFO] BUILD FAILURE") || line.startsWith("[INFO] Reactor Build Order:") || line.startsWith("[INFO] Total time:"));
}
function isMavenDependencyTransferLine(line) {
  return regexTest(
    String.raw`^\[INFO\] (?:Downloading|Downloaded) from \S+: https?://\S+(?: \([^)]+\))?$`,
    line
  );
}
function mavenDependencyTransferExample(line) {
  const split = rsplitOnce(line, " (");
  const withoutSize = split !== void 0 ? split[0] : line;
  const parts = withoutSize.split("/");
  if (parts.length < 3) {
    return void 0;
  }
  const version = parts[parts.length - 2];
  const name = parts[parts.length - 3];
  return `${name} ${version}`;
}
function isMavenPassingTestLine(line) {
  return regexTest(
    String.raw`^\[INFO\] Tests run: \d+, Failures: 0, Errors: 0, Skipped: \d+, Time elapsed: \S+\s+s(?:\s+(?:--|-)\s+in\s+\S+)?$`,
    line
  );
}
function mavenPassingTestExample(line) {
  return regexCaptureFirst(String.raw`\s(?:--|-)\s+in\s+(\S+)$`, line) ?? "summary";
}
function isMavenInfoBoilerplateLine(line) {
  const trimmed = line.trimEnd();
  return trimmed === "[INFO]" || regexTest(String.raw`^\[INFO\] -{20,}\s*$`, trimmed) || regexTest(String.raw`^\[INFO\] -{20,}\[\s*\S+\s*\]-{20,}\s*$`, trimmed) || regexTest(String.raw`^\[INFO\] -{2,}<\s*[^>\n]+\s*>-{2,}\s*$`, trimmed) || regexTest(String.raw`^\[INFO\] Building .+ \[\d+/\d+\]\s*$`, trimmed) || regexTest(
    String.raw`^\[INFO\] --- \S+(?::\S+)+ (?:\([^)]+\) )?@ \S+ ---\s*$`,
    trimmed
  );
}
function compactGolangciLintOutput(output, requireMarker) {
  if (requireMarker && !hasGolangciLintMarker(output)) {
    return output;
  }
  return omitNonDiagnosticLines(
    output,
    "golangci-lint progress",
    isGolangciLintOmittableLine
  );
}
function hasGolangciLintMarker(output) {
  return output.split("\n").some((line) => regexTest(
    String.raw`^(?:go run github\.com/golangci/golangci-lint/cmd/golangci-lint(?:@\S+)?|(?:[A-Za-z0-9_./+-]+/)?golangci-lint)\s+run\b`,
    line
  )) || (output.includes("level=info") || output.includes("INFO")) && output.split("\n").some((line) => regexTest(String.raw`^(?:level=info\b|INFO\b)`, line)) && output.split("\n").some((line) => hasGolangciLintSafeInfoPrefix(line));
}
function isGolangciLintOmittableLine(line) {
  if (isDiagnosticLine(line)) {
    return false;
  }
  return isGoModuleDownloadChatterLine(line) || regexTest(String.raw`^(?:level=info\b|INFO\b)`, line) && hasGolangciLintSafeInfoPrefix(line);
}
function hasGolangciLintSafeInfoPrefix(line) {
  return regexTest(
    String.raw`\[(?:config_reader|lintersdb|loader|runner|linters_context|filename_unadjuster|uniq_by_line|source_code)\b`,
    line
  );
}
function compactGitProgress(output) {
  const lines = output.split("\n").map((line) => compactGitProgressLine(line));
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const progressKey = getGitProgressLineKey(line.output);
    if (progressKey === void 0) {
      pushCompactedLine(compacted, line);
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < lines.length && getGitProgressLineKey(lines[j].output) === progressKey) {
      j += 1;
    }
    const omittedLines = j - i - 1;
    if (omittedLines > 0) {
      compacted.push(`[git progress: omitted ${omittedLines} earlier ${progressKey} line(s)]`);
      compacted.push(lines[j - 1].output);
    } else {
      pushCompactedLine(compacted, line);
    }
    i = j;
  }
  return compacted.join("\n");
}
function unchangedLine(line) {
  return { output: line, omittedFrames: 0 };
}
function pushCompactedLine(compacted, line) {
  if (line.omittedFrames > 0) {
    compacted.push(`[git progress: omitted ${line.omittedFrames} earlier frame(s)]`);
  }
  compacted.push(line.output);
}
function compactGitProgressLine(line) {
  return compactProgressPatternsUnlessDiagnostic(
    line,
    [
      String.raw`(?:remote: )?(?:Enumerating|Counting|Compressing) objects:\s+\d+%[^)]*\(\d+/\d+\)(?:, done\.)?`,
      String.raw`(?:remote: )?Receiving objects:\s+\d+%[^)]*\(\d+/\d+\)(?:, [^)]*)?`,
      String.raw`(?:remote: )?Resolving deltas:\s+\d+%[^)]*\(\d+/\d+\)(?:, done\.)?`,
      String.raw`(?:remote: )?Writing objects:\s+\d+%[^)]*\(\d+/\d+\)(?:, [^)]*)?`
    ]
  );
}
function compactProgressPatternsUnlessDiagnostic(line, patterns) {
  if (isDiagnosticLine(line)) {
    return unchangedLine(line);
  }
  return compactProgressPatterns(line, patterns);
}
function compactProgressPatterns(line, patterns) {
  let output = line;
  let omittedFrames = 0;
  for (const pattern of patterns) {
    const result = compactRepeatedProgressFrames(output, pattern);
    output = result.output;
    omittedFrames += result.omittedFrames;
  }
  return { output, omittedFrames };
}
function compactRepeatedProgressFrames(line, pattern) {
  const matches = regexFindAll(pattern, line);
  if (matches.length <= 1) {
    return unchangedLine(line);
  }
  const first = matches[0];
  const last = matches[matches.length - 1];
  const output = line.slice(0, first.start) + line.slice(last.start, last.end) + line.slice(last.end);
  return { output, omittedFrames: matches.length - 1 };
}
function getGitProgressLineKey(line) {
  if (isDiagnosticLine(line)) {
    return void 0;
  }
  const stripped = stripPrefix(line, "remote:");
  const normalized = stripped !== void 0 ? stripped.trimStart() : line;
  const split = splitOnce(normalized, ":");
  if (split === void 0) {
    return void 0;
  }
  const key = split[0];
  const rest = split[1];
  if (![
    "Enumerating objects",
    "Counting objects",
    "Compressing objects",
    "Receiving objects",
    "Writing objects",
    "Resolving deltas"
  ].includes(key)) {
    return void 0;
  }
  if (regexTest(String.raw`^\s+\d+%`, rest)) {
    return key;
  }
  return void 0;
}
function compactJsTestOutput(output) {
  let compacted = compactRepeatedNodeWarnings(output);
  compacted = compactJestRunsProgress(compacted);
  if (hasPassingJsTestSummary(compacted)) {
    compacted = omitNonDiagnosticLines(compacted, "js test progress", isJsTestProgressLine);
  }
  return compacted;
}
function compactJestRunsProgress(output) {
  if (!hasJestRunsProgress(output)) {
    return output;
  }
  return omitMatchingLines(
    output,
    "jest runs progress",
    isJestRunsProgressLine,
    "progress"
  );
}
function hasPassingJsTestSummary(output) {
  if (regexTest(String.raw`(?:^|\n)\s*(?:FAIL|\u2717|\u00D7|\u2716)\s`, output) || regexTestWithFlags(String.raw`\b[1-9]\d*\s+failed\b`, output, "i") || regexTest(String.raw`(?:^|\n)\s*\d+\s+failing\b`, output) || regexTest(String.raw`(?:^|\n)\s*not\s+ok\s+\d+\b`, output) || regexTest(String.raw`(?:^|\n)#\s+fail\s+[1-9]\d*\b`, output) || regexTest(String.raw`(?:^|\n)\s*Bail out!`, output) || regexTest(String.raw`(?:^|\n).*ERR!`, output)) {
    return false;
  }
  return regexTestWithFlags(
    String.raw`(?:^|\n)\s*(?:Test Files|Tests?:|Test Suites:)\s+\d+\s+passed\b`,
    output,
    "i"
  ) || regexTest(String.raw`(?:^|\n)\s+\d+\s+passing\b`, output) || regexTest(String.raw`(?:^|\n)#\s+ok\b`, output) || regexTest(String.raw`(?:^|\n)#\s+pass\s+[1-9]\d*\b`, output);
}
function hasJestRunsProgress(output) {
  return output.split("\n").some((line) => regexTest(String.raw`^\s*RUNS\s+\S`, line)) && hasJestSummaryMarker(output);
}
function hasJestSummaryMarker(output) {
  return output.split("\n").some((line) => line.startsWith("Test Suites:") || line.startsWith("Tests:") || line.startsWith("Snapshots:") || line.startsWith("Ran all test suites"));
}
function isJestRunsProgressLine(line) {
  return regexTest(String.raw`^\s*RUNS\s+\S`, line);
}
function isJsTestProgressLine(line) {
  return !isDiagnosticLine(line) && (regexTest(String.raw`^\s*RUN\s+v?\d+\.\d+\.\d+`, line) || regexTest(String.raw`^\s*(?:\u2713|\u2714|\u221A)\s+.+(?:\s+\d+ms|\s+\(\d+(?:ms|s)\))$`, line) || regexTest(String.raw`^\s*PASS\s+.+$`, line) || regexTest(String.raw`^\s*ok\s+\d+\b`, line) || regexTest(String.raw`^[.]+(?:\s+\[\s*\d+%\])?\s*$`, line));
}
function compactGradleOutput(output) {
  const compacted = compactIntralineProgress(
    output,
    "gradle rich-console progress",
    compactGradleProgressFrames
  );
  return omitNonDiagnosticLines(compacted, "gradle boilerplate", isGradleBoilerplateLine);
}
function compactIntralineProgress(output, label, compactLine) {
  let omittedFrames = 0;
  const compacted = output.split("\n").map((line) => {
    const result = compactLine(line);
    omittedFrames += result.omittedFrames;
    return result.output;
  }).join("\n");
  if (omittedFrames === 0) {
    return output;
  }
  return `[${label}: omitted ${omittedFrames} earlier frame(s)]
${compacted}`;
}
function compactGradleProgressFrames(line) {
  if (isDiagnosticLine(line)) {
    return unchangedLine(line);
  }
  const matches = regexFindAll(
    String.raw`(?:<[-=]+>|\u2502[^\u2502\n]+\u2502)\s+\d+%\s+(?:INITIALIZING|CONFIGURING|EXECUTING|WAITING)\s+\[[^\]\n]+\]`,
    line
  );
  if (matches.length <= 1) {
    return unchangedLine(line);
  }
  let output = "";
  let cursor = 0;
  let omittedFrames = 0;
  let start = 0;
  while (start < matches.length) {
    let end = start;
    while (end + 1 < matches.length && isGradleProgressFrameSeparator(line, matches[end], matches[end + 1])) {
      end += 1;
    }
    const startRange = matches[start];
    const endRange = matches[end];
    if (end > start) {
      output += line.slice(cursor, startRange.start);
      output += line.slice(endRange.start, endRange.end);
      omittedFrames += end - start;
    } else {
      output += line.slice(cursor, endRange.end);
    }
    cursor = endRange.end;
    start = end + 1;
  }
  output += line.slice(cursor);
  return { output, omittedFrames };
}
function isGradleProgressFrameSeparator(line, previous, next) {
  const separator = line.slice(previous.end, next.start);
  if (separator.length === 0) {
    return true;
  }
  for (let i = 0; i < separator.length; i += 6) {
    if (separator.slice(i, i + 6) !== "> IDLE") {
      return false;
    }
  }
  return true;
}
function isGradleBoilerplateLine(line) {
  return line.startsWith("Consider enabling configuration cache to speed up this build: https://docs.gradle.org/") && line.endsWith("/userguide/configuration_cache_enabling.html") || line === "> Run with --stacktrace option to get the stack trace." || line === "> Run with --info or --debug option to get more log output." || line === "> Run with --scan to get full insights from a Build Scan (powered by Develocity)." || line === "> Get more help at https://help.gradle.org.";
}
function compactUvProgress(output) {
  if (!(hasUvSummaryMarker(output) && output.split("\n").some((line) => isUvProgressLine(line)))) {
    return output;
  }
  const compacted = collapseContiguousRuns(output, isUvProgressLine, 4, (block) => {
    const examples = [];
    for (const line of block) {
      const example = uvProgressExample(line);
      if (example !== void 0) {
        examples.push(example);
      }
    }
    if (examples.length !== block.length) {
      return void 0;
    }
    const activityList = [];
    for (const line of block) {
      const activity = uvProgressActivity(line);
      if (activity !== void 0) {
        activityList.push(activity);
      }
    }
    const activities = uniqueStrings(activityList);
    const activitySummary = activities.length === 0 ? "" : `; active: ${summarizeWithMore(activities, 5)}`;
    return `[uv progress: omitted ${block.length} row(s); examples: ${summarizeWithMore(uniqueStrings(examples), 10)}${activitySummary}]`;
  });
  return compacted.replace(/\n+$/, "");
}
function hasUvSummaryMarker(output) {
  return output.split("\n").some((line) => line.startsWith("Using CPython ") && line.includes(" interpreter at:") || regexTest(String.raw`^(?:Resolved|Prepared|Installed|Audited) \d+ packages? in \S+`, line));
}
function isUvProgressLine(line) {
  const normalized = stripAnsi(line).trim();
  if (isDiagnosticLine(normalized)) {
    return false;
  }
  return regexTest(
    String.raw`^[\u2801-\u28FF]\s+(?:Resolving dependencies|Preparing packages|Installing packages|Building|Downloading)\b`,
    normalized
  ) || regexTest(
    String.raw`^[A-Za-z0-9_.-]+\s+-{10,}\s+\d+(?:\.\d+)?\s*(?:B|KiB|MiB|GiB|KB|MB|GB)/\d+(?:\.\d+)?\s*(?:B|KiB|MiB|GiB|KB|MB|GB)(?:\s+.+)?$`,
    normalized
  );
}
function uvProgressExample(line) {
  const normalized = stripAnsi(line).trim();
  const pkg = regexCaptureFirst(String.raw`^([A-Za-z0-9_.-]+)\s+-{10,}`, normalized);
  if (pkg !== void 0) {
    return pkg;
  }
  const firstCodePoint = normalized.codePointAt(0);
  if (firstCodePoint === void 0) {
    return void 0;
  }
  const firstChar = String.fromCodePoint(firstCodePoint);
  if (!(firstChar >= "\u2801" && firstChar <= "\u28FF")) {
    return void 0;
  }
  const withoutSpinner = normalized.slice(firstChar.length).trimStart();
  const dotsIndex = withoutSpinner.indexOf("...");
  const spacesIndex = withoutSpinner.indexOf("  ");
  const candidates = [dotsIndex, spacesIndex].filter((index) => index !== -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : withoutSpinner.length;
  return withoutSpinner.slice(0, end).trim();
}
function uvProgressActivity(line) {
  return regexCaptureFirst(
    String.raw`\s{2,}((?:Building|Downloading|Installing) .+)$`,
    stripAnsi(line).trim()
  );
}
function stripAnsi(text) {
  let output = "";
  const chars = Array.from(text);
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    i += 1;
    if (ch !== "\x1B" || chars[i] !== "[") {
      output += ch;
      continue;
    }
    i += 1;
    while (i < chars.length) {
      const next = chars[i];
      i += 1;
      if (next >= "@" && next <= "~") {
        break;
      }
    }
  }
  return output;
}
function compactNxLernaFrameProgress(output) {
  if (!hasNxLernaFrameProgress(output)) {
    return output;
  }
  const canOmitStaticTaskTable = output.split("\n").some((line) => regexTest(String.raw`^\s*NX\s+Successfully ran target\b`, line));
  const compacted = [];
  const omitted = { count: 0 };
  for (const line of output.split("\n")) {
    if (isNxLernaFrameNoiseLine(line, canOmitStaticTaskTable)) {
      omitted.count += 1;
      continue;
    }
    if (line.trim().length === 0 && omitted.count > 0) {
      continue;
    }
    flushNxLernaOmitted(compacted, omitted);
    compacted.push(line);
  }
  flushNxLernaOmitted(compacted, omitted);
  return compacted.join("\n");
}
function flushNxLernaOmitted(compacted, omitted) {
  if (omitted.count > 0) {
    compacted.push(`[nx frame progress: omitted ${omitted.count} frame line(s)]`);
    omitted.count = 0;
  }
}
function isNxLernaFrameNoiseLine(line, canOmitStaticTaskTable) {
  return regexTest(String.raw`^\u2014{20,}$`, line) || regexTest(
    String.raw`^\s*(?:NX|Lerna \(powered by Nx\))\s+Running target \S+ for \d+ projects?$`,
    line
  ) || regexTest(
    String.raw`^\s*NX\s+Running \d+ \S+ tasks\.\.\.\s+Cache\s+Duration$`,
    line
  ) || canOmitStaticTaskTable && regexTest(
    String.raw`^\s*NX\s+Running \d+ \S+ tasks\.\.\.\s+Cache\s+Duration\s+.+$`,
    line
  ) || regexTest(
    String.raw`^\s+\u2192\s+Executing \d+/\d+ remaining tasks(?: in parallel)?\.\.\.$`,
    line
  ) || regexTest(
    String.raw`^\s+[\u280B\u2819\u2839\u2838\u283C\u2834\u2826\u2827\u2807\u280F]\s+(?:nx run \S+|@[\w.-]+/[\w.-]+:\S+)$`,
    line
  );
}
function hasNxLernaFrameProgress(output) {
  return output.includes("NX   Running target") || output.includes("Lerna (powered by Nx)") || output.split("\n").some((line) => regexTest(String.raw`^\s*NX\s+Running \d+ \S+ tasks\.\.\.\s+Cache\s+Duration`, line));
}
function compactPnpmOutput(output) {
  let compacted = compactRepeatedNodeWarnings(output);
  compacted = compactPackageManagerOperations(compacted);
  return compactPnpmInstallProgress(compacted);
}
function compactPnpmInstallProgress(output) {
  const lines = output.split("\n");
  const lastProgressIndexes = /* @__PURE__ */ new Map();
  const lastDownloadIndexes = /* @__PURE__ */ new Map();
  const lastWarningCounterIndexes = /* @__PURE__ */ new Map();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (isPnpmProgressLine(line)) {
      lastProgressIndexes.set(pnpmWorkspacePrefix(line), index);
    }
    const packageName = pnpmDownloadPackage(line);
    if (packageName !== void 0) {
      lastDownloadIndexes.set(packageName, index);
    }
    if (isPnpmWarningCounterLine(line)) {
      lastWarningCounterIndexes.set(pnpmWorkspacePrefix(line), index);
    }
  }
  const compacted = [];
  const omittedProgress = { count: 0 };
  const omittedWarningCounters = { count: 0 };
  const omittedDownloads = /* @__PURE__ */ new Map();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const packageBarSize = pnpmPackageBarSize(index >= 1 ? lines[index - 1] : void 0, line);
    if (packageBarSize !== void 0) {
      compacted.push(`[pnpm install package bar: omitted ${packageBarSize} plus character(s)]`);
      continue;
    }
    const progressPrefix = pnpmWorkspacePrefix(line);
    if (isPnpmProgressLine(line) && lastProgressIndexes.get(progressPrefix) !== index) {
      omittedProgress.count += 1;
      continue;
    }
    const packageName = pnpmDownloadPackage(line);
    if (packageName !== void 0 && lastDownloadIndexes.get(packageName) !== index) {
      omittedDownloads.set(packageName, (omittedDownloads.get(packageName) ?? 0) + 1);
      continue;
    }
    const warningPrefix = pnpmWorkspacePrefix(line);
    if (isPnpmWarningCounterLine(line) && lastWarningCounterIndexes.get(warningPrefix) !== index) {
      omittedWarningCounters.count += 1;
      continue;
    }
    if (isPnpmProgressLine(line)) {
      flushPnpmProgress(compacted, omittedProgress);
    } else if (packageName !== void 0) {
      flushPnpmDownload(compacted, omittedDownloads, packageName);
    } else if (isPnpmWarningCounterLine(line)) {
      flushPnpmWarningCounters(compacted, omittedWarningCounters);
    }
    compacted.push(line);
  }
  return compacted.join("\n");
}
function flushPnpmProgress(compacted, omittedProgress) {
  if (omittedProgress.count > 0) {
    compacted.push(`[pnpm install progress: omitted ${omittedProgress.count} earlier progress line(s)]`);
    omittedProgress.count = 0;
  }
}
function flushPnpmWarningCounters(compacted, omittedWarningCounters) {
  if (omittedWarningCounters.count > 0) {
    compacted.push(`[pnpm install warning counter: omitted ${omittedWarningCounters.count} earlier counter line(s)]`);
    omittedWarningCounters.count = 0;
  }
}
function flushPnpmDownload(compacted, omittedDownloads, packageName) {
  const omitted = omittedDownloads.get(packageName) ?? 0;
  omittedDownloads.delete(packageName);
  if (omitted > 0) {
    compacted.push(`[pnpm install downloads: omitted ${omitted} earlier frame(s) for ${packageName}]`);
  }
}
function isPnpmProgressLine(line) {
  const rest = stripPnpmWorkspacePrefix(line);
  return regexTest(
    String.raw`^Progress: resolved \d+, reused \d+, downloaded \d+, added \d+(?:, done)?$`,
    rest
  );
}
function pnpmDownloadPackage(line) {
  const stripped = stripPnpmWorkspacePrefix(line);
  const rest = stripPrefix(stripped, "Downloading ");
  if (rest === void 0) {
    return void 0;
  }
  const split = splitOnce(rest, ": ");
  if (split === void 0) {
    return void 0;
  }
  const [pkg, sizes] = split;
  if (regexTest(
    String.raw`^\d+(?:\.\d+)? (?:B|kB|MB|GB)/\d+(?:\.\d+)? (?:B|kB|MB|GB)(?:, done)?$`,
    sizes
  )) {
    return pkg;
  }
  return void 0;
}
function isPnpmWarningCounterLine(line) {
  return regexTest(
    String.raw`^\s*WARN\s+\d+ other warnings$`,
    stripPnpmWorkspacePrefix(line)
  );
}
function pnpmPackageBarSize(previousLine, line) {
  if (previousLine === void 0) {
    return void 0;
  }
  const countText = stripPrefix(previousLine, "Packages: +");
  if (countText === void 0) {
    return void 0;
  }
  const count = parseUsize(countText);
  if (count === void 0) {
    return void 0;
  }
  if (line.length > 0 && [...line].every((ch) => ch === "+") && line.length === count) {
    return count;
  }
  return void 0;
}
function pnpmWorkspacePrefix(line) {
  const end = pnpmWorkspacePrefixEnd(line);
  return end !== void 0 ? line.slice(0, end) : "";
}
function stripPnpmWorkspacePrefix(line) {
  const end = pnpmWorkspacePrefixEnd(line);
  return end !== void 0 ? line.slice(end) : line;
}
function pnpmWorkspacePrefixEnd(line) {
  const index = line.indexOf("|");
  if (index === -1) {
    return void 0;
  }
  if (index === 0) {
    return void 0;
  }
  let end = index + 1;
  for (const ch of line.slice(end)) {
    if (!isWhitespaceChar(ch)) {
      break;
    }
    end += ch.length;
  }
  return end;
}
function compactNpmOutput(output) {
  let compacted = compactRepeatedNodeWarnings(output);
  compacted = compactPackageManagerOperations(compacted);
  compacted = compactIntralineProgress(
    compacted,
    "yarn1 install intraline progress",
    compactYarn1ProgressFrames
  );
  return omitNonDiagnosticLines(
    compacted,
    "npm install progress",
    isNpmInstallProgressLine
  );
}
function compactYarn1ProgressFrames(line) {
  return compactProgressPatternsUnlessDiagnostic(line, [String.raw`\[[#-]+\] \d+/\d+`]);
}
function isNpmInstallProgressLine(line) {
  if (isDiagnosticLine(line)) {
    return false;
  }
  const lower = asciiLowercase(line);
  if (regexTest(String.raw`^npm (?:notice|http|timing|info|verb|silly)\b`, lower)) {
    return true;
  }
  if (regexTestWithFlags(
    String.raw`^(?:reify|idealTree|fetchMetadata|extract|rollbackFailedOptional)[:\s]`,
    line,
    "i"
  )) {
    return true;
  }
  const chars = Array.from(line);
  const first = chars[0];
  const second = chars[1];
  return first !== void 0 && first >= "\u2801" && first <= "\u28FF" && second !== void 0 && isWhitespaceChar(second);
}
function compactYarnBerryOutput(output) {
  let compacted = compactYarnBerryProgress(output);
  compacted = compactRepeatedNodeWarnings(compacted);
  compacted = compactPackageManagerOperations(compacted);
  return compactIntralineProgress(
    compacted,
    "yarn1 install intraline progress",
    compactYarn1ProgressFrames
  );
}
function compactYarnBerryProgress(output) {
  if (!hasYarnBerryCompletedOutput(output)) {
    return output;
  }
  return omitMatchingLines(
    output,
    "yarn berry progress",
    isYarnBerryProgressLine,
    "progress"
  );
}
function hasYarnBerryCompletedOutput(output) {
  return output.includes("\u27A4 YN0000:") && output.split("\n").some((line) => line.startsWith("\u27A4 YN0000: \xB7 Done in ") || line.startsWith("\u27A4 YN0000: \xB7 Done with warnings in "));
}
function isYarnBerryProgressLine(line) {
  return line.startsWith("\u27A4 YN0000:") && !line.startsWith("\u27A4 YN0000: \xB7 Done in ") && !line.startsWith("\u27A4 YN0000: \xB7 Done with warnings in ");
}
function compactMakeOutput(output) {
  let compacted = compactIntralineProgress(
    output,
    "ninja build intraline progress",
    compactNinjaProgressFrames
  );
  compacted = compactMakeProgress(compacted);
  compacted = compactGolangciLintOutput(compacted, true);
  return omitNonDiagnosticLines(
    compacted,
    "go module download",
    isGoModuleDownloadChatterLine
  );
}
function compactNinjaProgressFrames(line) {
  return compactProgressPatternsUnlessDiagnostic(
    line,
    [
      String.raw`\[\s*\d+/\d+\]\s+(?:(?:Building|Linking)\s+(?:C|CXX|CUDA|ASM|OBJC|OBJCXX)\s+(?:object|executable|static library|shared library|module)|Generating|Copying|Processing|Re-running CMake|Scanning dependencies of target|Automatic\s+(?:MOC|UIC|RCC))\b[^[]*`
    ]
  );
}
function compactMakeProgress(output) {
  const lines = output.split("\n");
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    const key = getMakeProgressKey(lines[i]);
    if (key === void 0) {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < lines.length && getMakeProgressKey(lines[j]) === key) {
      j += 1;
    }
    const count = j - i;
    if (count >= 4) {
      compacted.push(lines[i]);
      compacted.push(`[make progress: omitted ${count - 1} more ${key} line(s)]`);
    } else {
      for (let k = i; k < j; k++) {
        compacted.push(lines[k]);
      }
    }
    i = j;
  }
  return compacted.join("\n");
}
function getMakeProgressKey(line) {
  if (isDiagnosticLine(line)) {
    return void 0;
  }
  const trimmed = line.trim();
  const kind = regexCaptureFirst(String.raw`^\[(Compiling|Linking) .+\]$`, trimmed);
  if (kind !== void 0) {
    return asciiLowercase(kind);
  }
  const rule = splitMakeRuleLine(trimmed);
  if (rule !== void 0) {
    const [ruleName, target] = rule;
    const suffix = regexCaptureFirst(String.raw`(\.[A-Za-z0-9_.-]+)$`, target) ?? "";
    return `${ruleName} ${directoryGlob(target, suffix)}`;
  }
  const preprocessing = regexCaptureFirst(String.raw`^Preprocessing\s+(.+\.vp)$`, trimmed);
  if (preprocessing !== void 0) {
    return `Preprocessing ${directoryGlob(preprocessing, ".vp")}`;
  }
  if (regexTest(
    String.raw`^(?:gcc|g\+\+|cc|c\+\+|clang|clang\+\+|[A-Za-z0-9_-]+-gcc|[A-Za-z0-9_-]+-g\+\+)\b.*\s-c\s`,
    trimmed
  )) {
    return "compile command";
  }
  if (regexTest(
    String.raw`^make(?:\[\d+\])?: (?:Entering|Leaving) directory `,
    trimmed
  )) {
    return "make directory";
  }
  return void 0;
}
function splitMakeRuleLine(line) {
  const rules = [
    "HOSTCC",
    "MKLIB",
    "MKEXE",
    "MKDLL",
    "OCAMLC",
    "OCAMLOPT",
    "COQC",
    "COQDEP",
    "COQCHK",
    "COQDOC",
    "LINK",
    "CXX",
    "CPP",
    "CC",
    "AR",
    "AS",
    "LD",
    "GEN"
  ];
  for (const rule of rules) {
    const target = stripPrefix(line, `${rule} `);
    if (target !== void 0) {
      return [rule, target];
    }
  }
  return void 0;
}
function directoryGlob(target, suffix) {
  const slash = target.lastIndexOf("/");
  if (slash !== -1) {
    return `${target.slice(0, slash)}/*${suffix}`;
  }
  return `*${suffix}`;
}
function compactAptOutput(output) {
  let compacted = compactIntralineProgress(
    output,
    "apt intraline progress",
    compactAptProgressFrames
  );
  compacted = compactNeedrestartNoopProgress(compacted);
  compacted = compactPackageManagerOperations(compacted);
  compacted = compactAptDpkgLifecycleBlocks(compacted);
  return omitNonDiagnosticLines(compacted, "apt progress", isAptProgressLine);
}
function compactAptProgressFrames(line) {
  if (isDiagnosticLine(line)) {
    return unchangedLine(line);
  }
  const result = compactProgressPatterns(
    line,
    [
      String.raw`Reading package lists\.\.\. \d+%`,
      String.raw`Building dependency tree\.\.\. \d+%`,
      String.raw`Reading state information\.\.\. \d+%`,
      String.raw`\(Reading database \.\.\. \d+%`
    ]
  );
  const spinnerResult = removeProgressMatches(
    result.output,
    String.raw`\d+% \[(?:Working|Waiting for headers|Connecting to [^\]]+|Connected to [^\]]+)\]\s*`
  );
  return {
    output: spinnerResult.output,
    omittedFrames: result.omittedFrames + spinnerResult.omittedFrames
  };
}
function removeProgressMatches(line, pattern) {
  const matches = regexFindAll(pattern, line);
  if (matches.length === 0) {
    return unchangedLine(line);
  }
  let output = "";
  let cursor = 0;
  for (const match of matches) {
    output += line.slice(cursor, match.start);
    cursor = match.end;
  }
  output += line.slice(cursor);
  return { output, omittedFrames: matches.length };
}
function compactNeedrestartNoopProgress(output) {
  if (!hasNeedrestartNoopSummary(output) || hasNeedrestartActionableState(output)) {
    return output;
  }
  let omittedFrames = 0;
  const compacted = output.split("\n").map((line) => {
    const result = compactNeedrestartProgressLine(line);
    omittedFrames += result.omittedFrames;
    return result.output;
  }).join("\n");
  if (omittedFrames > 0) {
    return `[needrestart progress: omitted ${omittedFrames} no-op scanning frame(s)]
${compacted}`;
  }
  return output;
}
function hasNeedrestartNoopSummary(output) {
  return output.split("\n").some(isNeedrestartNoopSummaryLine);
}
function isNeedrestartNoopSummaryLine(line) {
  switch (line.trim()) {
    case "Running kernel seems to be up-to-date.":
    case "The processor microcode seems to be up-to-date.":
    case "No services need to be restarted.":
    case "No containers need to be restarted.":
    case "No user sessions are running outdated binaries.":
    case "No VM guests are running outdated hypervisor (qemu) binaries on this host.":
      return true;
    default:
      return false;
  }
}
function hasNeedrestartActionableState(output) {
  return output.split("\n").some((line) => {
    const trimmed = line.trim();
    return !isNeedrestartNoopSummaryLine(trimmed) && regexTestWithFlags(
      String.raw`\b(?:pending|reboot|required|restart-needed|NEEDRESTART-|Outdated Libraries|Services to be restarted|Containers to be restarted|User sessions running outdated|VM guests are running outdated|need restarting)\b`,
      trimmed,
      "i"
    );
  });
}
function compactNeedrestartProgressLine(line) {
  if (!line.includes("Scanning ")) {
    return unchangedLine(line);
  }
  const result = removeProgressMatches(
    line,
    String.raw`Scanning (?:processes|processor microcode|linux images)\.\.\. \[[^\]\n]*\]\s*`
  );
  return {
    output: result.output.trim().length === 0 ? "[needrestart progress]" : result.output,
    omittedFrames: result.omittedFrames
  };
}
function compactAptDpkgLifecycleBlocks(output) {
  return collapseContiguousRuns(output, isAptDpkgLifecycleLine, 4, (block) => {
    const packages = [];
    let triggerCount = 0;
    for (const line of block) {
      const parsed = parseAptPackageLifecycleLine(line);
      if (parsed !== void 0) {
        const [name, version] = parsed;
        const existing = packages.find((candidate) => candidate[0] === name);
        if (existing !== void 0) {
          existing[1] = version;
        } else {
          packages.push([name, version]);
        }
      } else if (line.startsWith("Processing triggers for ")) {
        triggerCount += 1;
      }
    }
    if (packages.length === 0) {
      return void 0;
    }
    const packageSummary = summarizePackages(packages);
    const triggerSummary = triggerCount > 0 ? `; ${triggerCount} trigger line(s)` : "";
    return `[apt packages: installed ${packages.length} package(s): ${packageSummary}; omitted ${block.length} dpkg lifecycle line(s)${triggerSummary}]`;
  });
}
function isAptDpkgLifecycleLine(line) {
  return !isDiagnosticLine(line) && (line.startsWith("Selecting previously unselected package ") || line.startsWith("Preparing to unpack ") || line.startsWith("Unpacking ") || line.startsWith("Setting up ") || line.startsWith("Processing triggers for ") || regexTest(String.raw`^running python (?:pre-|post-)?rtupdate hooks for `, line) || regexTest(
    String.raw`^\(Reading database \.\.\. \d+ files and directories currently installed\.\)$`,
    line
  ));
}
function parseAptPackageLifecycleLine(line) {
  const selecting = stripPrefix(line, "Selecting previously unselected package ");
  if (selecting !== void 0) {
    const name = stripSuffix(selecting, ".");
    if (name !== void 0) {
      return [name, void 0];
    }
  }
  const unpackingOrSetting = stripPrefix(line, "Unpacking ") ?? stripPrefix(line, "Setting up ");
  if (unpackingOrSetting !== void 0) {
    const nameSplit = splitOnce(unpackingOrSetting, " (");
    if (nameSplit !== void 0) {
      const versionSplit = splitOnce(nameSplit[1], ")");
      if (versionSplit !== void 0) {
        return [nameSplit[0], versionSplit[0]];
      }
    }
  }
  const preparing = stripPrefix(line, "Preparing to unpack ");
  if (preparing !== void 0) {
    const debSplit = splitOnce(preparing, " ");
    if (debSplit !== void 0) {
      const debSegments = debSplit[0].split("/");
      const fileName = debSegments[debSegments.length - 1];
      const nameSplit = splitOnce(fileName, "_");
      if (nameSplit !== void 0) {
        const versionSplit = rsplitOnce(nameSplit[1], "_");
        if (versionSplit !== void 0) {
          return [nameSplit[0], versionSplit[0]];
        }
      }
    }
  }
  return void 0;
}
function summarizePackages(packages) {
  return summarizeWithMore(
    packages.map(([name, version]) => version !== void 0 ? `${name} (${version})` : name),
    18
  );
}
function isAptProgressLine(line) {
  return !isDiagnosticLine(line) && (regexTest(String.raw`^\d+% \[`, line) || regexTest(String.raw`\b(?:Hit|Get|Ign):\d+ `, line) || line.includes("Reading package lists...") || line.includes("Building dependency tree...") || line.includes("Reading state information...") || line.startsWith("Selecting previously unselected package ") || line.startsWith("Preparing to unpack ") || line.startsWith("Unpacking ") || line.startsWith("Setting up ") || line.startsWith("Processing triggers for ") || line.startsWith("Fetched ") || line.startsWith("Need to get ") || line.startsWith("After this operation ") || line.startsWith("debconf: ") || line.startsWith("(Reading database "));
}
function isPythonEcosystemNoiseLine(line) {
  return line.startsWith(`WARNING: Running pip as the 'root' user can result in broken permissions`) || line.startsWith("It is recommended to use a virtual environment instead: ") || line.includes("DeprecationWarning: The distutils package is deprecated") || line.includes("SetuptoolsDeprecationWarning:") || line.includes("`numpy.distutils` is deprecated since NumPy 1.23.0") || line.startsWith("Partial import of sklearn during the build process.") || line.startsWith("Matplotlib is not built with the correct FreeType version");
}
function compactSetuptoolsDeprecationBlocks(output) {
  if (!output.includes("SetuptoolsDeprecationWarning") && !output.includes("EasyInstallDeprecationWarning") && !output.includes("DeprecationWarning:")) {
    return output;
  }
  const lines = output.split("\n");
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    if (!isSetuptoolsDeprecationHeader(lines[i])) {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    const start = i;
    i += 1;
    let seenSentinel = false;
    while (i < lines.length && i - start < 30) {
      const line = lines[i];
      if (isStrictCompilerDiagnosticLine(line) || isUnsafeCompactionContextLine(line)) {
        break;
      }
      if (regexTest(String.raw`^\s*!!\s*$`, line)) {
        if (seenSentinel) {
          i += 1;
          break;
        }
        seenSentinel = true;
        i += 1;
        continue;
      }
      if (line.trim().length === 0 && i + 1 < lines.length && regexTest(String.raw`^\S`, lines[i + 1]) && !isSetuptoolsBannerLine(lines[i + 1])) {
        break;
      }
      if (!isSetuptoolsBannerLine(line) && regexTest(String.raw`^\S`, line)) {
        break;
      }
      i += 1;
    }
    const block = lines.slice(start, i);
    if (block.length >= 3 && !block.slice(1).some((line) => isUnsafeCompactionContextLine(line))) {
      compacted.push(`[setuptools deprecation: ${setuptoolsWarningName(block[0])}; omitted ${block.length - 1} banner line(s)]`);
    } else {
      for (const line of block) {
        compacted.push(line);
      }
    }
  }
  return compacted.join("\n");
}
function isSetuptoolsDeprecationHeader(line) {
  return line.includes("SetuptoolsDeprecationWarning:") || line.includes("EasyInstallDeprecationWarning:") || line.includes("DeprecationWarning:");
}
function setuptoolsWarningName(line) {
  return regexCaptureFirst(
    String.raw`([A-Za-z_][A-Za-z0-9_]*DeprecationWarning|DeprecationWarning):`,
    line
  ) ?? "deprecation warning";
}
function isSetuptoolsBannerLine(line) {
  return line.trim().length === 0 || startsWithWhitespace(line) || regexTest(String.raw`^\s*[-!*]{3,}\s*$`, line) || isSetuptoolsDeprecationHeader(line);
}
function compactCythonPerformanceHints(output) {
  if (!output.includes("performance hint:")) {
    return output;
  }
  const lines = output.split("\n");
  const compacted = [];
  let omitted = 0;
  let keptFirstInRun = false;
  const flush = () => {
    if (omitted > 0) {
      compacted.push(`[cython performance hints: omitted ${omitted} hint block(s)]`);
      omitted = 0;
    }
    keptFirstInRun = false;
  };
  let i = 0;
  while (i < lines.length) {
    if (!isCythonPerformanceHintHeader(lines[i])) {
      flush();
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    const start = i;
    i += 1;
    let hasUnsafeContext = false;
    while (i < lines.length && i - start < 12) {
      const line = lines[i];
      if (isCythonPerformanceHintHeader(line) || isStrictCompilerDiagnosticLine(line) || isUnsafeCompactionContextLine(line)) {
        hasUnsafeContext = isUnsafeCompactionContextLine(line);
        if (hasUnsafeContext) {
          i += 1;
        }
        break;
      }
      if (line.trim().length === 0 && i + 1 < lines.length && !startsWithWhitespace(lines[i + 1])) {
        i += 1;
        break;
      }
      if (!startsWithWhitespace(line) && !line.startsWith("Possible solutions:")) {
        break;
      }
      i += 1;
    }
    const block = lines.slice(start, i);
    if (hasUnsafeContext) {
      flush();
      for (const line of block) {
        compacted.push(line);
      }
    } else if (!keptFirstInRun) {
      for (const line of block) {
        compacted.push(line);
      }
      keptFirstInRun = true;
    } else {
      omitted += 1;
    }
  }
  flush();
  return compacted.join("\n");
}
function isCythonPerformanceHintHeader(line) {
  return regexTest(String.raw`^\S+\.pyx:\d+:\d+:\s+performance hint: `, line);
}
function compactCompilerWarningRuns(output) {
  if (!regexTest(
    String.raw`(?:^|\n)(?:\S+:\d+(?::\d+)?:\s*(?:warning|(?:fatal\s+)?error):|\S+:\s*internal compiler error:|error: command .+ failed\b)`,
    output
  )) {
    return output;
  }
  const inputErrorCount = countCompilerErrorLines(output);
  const lines = output.split("\n");
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    const run = collectCompilerDiagnosticRun(lines, i);
    if (run === void 0) {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    if (run.blocks.length < 4) {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    if (run.hasError) {
      for (let k = i; k < run.end; k++) {
        compacted.push(lines[k]);
      }
      i = run.end;
      continue;
    }
    for (const block of run.blocks.slice(0, 2)) {
      compacted.push(...block.lines);
    }
    compacted.push(`[compiler warnings: omitted ${run.blocks.length - 3} warning block(s)]`);
    compacted.push(...run.blocks[run.blocks.length - 1].lines);
    i = run.end;
  }
  const compactedOutput = compacted.join("\n");
  if (countCompilerErrorLines(compactedOutput) === inputErrorCount) {
    return compactedOutput;
  }
  return output;
}
function collectCompilerDiagnosticRun(lines, start) {
  const blocks = [];
  let i = start;
  let hasError = false;
  while (i < lines.length) {
    const kind = compilerDiagnosticKind(lines[i]);
    if (kind === void 0) {
      break;
    }
    const blockStart = i;
    i += 1;
    let contextLines = 0;
    while (i < lines.length && contextLines < 4 && compilerDiagnosticKind(lines[i]) === void 0 && lines[i].trim().length !== 0) {
      if (isDiagnosticLine(lines[i]) || isCompilerContextErrorLine(lines[i])) {
        hasError = true;
        break;
      }
      i += 1;
      contextLines += 1;
    }
    blocks.push({ lines: lines.slice(blockStart, i), kind });
    hasError = hasError || kind === "error";
    if (i < lines.length && lines[i].trim().length === 0) {
      break;
    }
  }
  if (blocks.length === 0) {
    return void 0;
  }
  return { blocks, end: i, hasError };
}
function compilerDiagnosticKind(line) {
  if (isCompilerErrorLine(line)) {
    return "error";
  }
  if (regexTest(String.raw`^\S+:\d+(?::\d+)?:\s*warning:\s`, line)) {
    return "warning";
  }
  return void 0;
}
function isStrictCompilerDiagnosticLine(line) {
  return compilerDiagnosticKind(line) !== void 0 || regexTest(String.raw`^\S+:\d+(?::\d+)?:\s*note:\s`, line);
}
function isCompilerErrorLine(line) {
  return regexTest(String.raw`^\S+:\d+(?::\d+)?:\s*(?:fatal\s+)?error:\s`, line) || regexTest(String.raw`^\S+:\s*internal compiler error:\s`, line) || regexTest(String.raw`^error: command .+ failed\b`, line);
}
function isCompilerContextErrorLine(line) {
  return regexTestWithFlags(String.raw`^(?:fatal error|error):\s`, line, "i") || line.startsWith("Traceback (most recent call last):");
}
function isUnsafeCompactionContextLine(line) {
  return isCompilerContextErrorLine(line.trimStart());
}
function countCompilerErrorLines(output) {
  return output.split("\n").filter((line) => isCompilerErrorLine(line) || isUnsafeCompactionContextLine(line)).length;
}
function isPipInstallProgressLine(line) {
  return isPipRootUserWarning(line) || !isDiagnosticLine(line) && (line.startsWith("Looking in indexes: ") || line.startsWith("Looking in links: ") || line.startsWith("Collecting ") || line.startsWith("Requirement already satisfied: ") || line.startsWith("Discarding http://") || line.startsWith("Discarding https://") || line.startsWith("Downloading http://") || line.startsWith("Downloading https://") || line.startsWith("  Downloading ") || line.startsWith("  Using cached ") || line.startsWith("  Getting requirements to build wheel ") || line.startsWith("  Installing build dependencies ") || line.startsWith("  Preparing metadata ") || line.startsWith("Building wheels for collected packages: ") || line.startsWith("  Building wheel for ") || line.startsWith("  Created wheel for ") || line.startsWith("  Stored in directory: ") || line.startsWith("Installing collected packages: ") || line.startsWith("Successfully installed ") || line.startsWith("Obtaining ") || line.startsWith("[notice] A new release of pip is available: ") || line.startsWith("[notice] To update, run: ") || regexTest(
    String.raw`^\s+[\u2501\u2578\u257A ]*[\u2501\u2578\u257A][\u2501\u2578\u257A ]*\d+(?:\.\d+)?(?:\s*[KMG]?B)?[/ ]`,
    line
  ));
}
function isPipRootUserWarning(line) {
  return line.startsWith(`WARNING: Running pip as the 'root' user can result in broken permissions`) || line.startsWith("It is recommended to use a virtual environment instead: ");
}
function isPythonNinjaBuildProgressLine(line) {
  return regexTest(
    String.raw`^\[\s*\d+/\d+\]\s+Compiling (?:C|C\+\+|Cython) source \S+\.(?:c|cc|cpp|cxx|pyx)$`,
    line
  ) || regexTest(
    String.raw`^\[\s*\d+/\d+\]\s+Generating \S+ with a custom command$`,
    line
  );
}
function isPythonBuildExtProgressLine(line) {
  return !isDiagnosticLine(line) && (regexTest(
    String.raw`^running (?:bdist_wheel|build|build_py|build_ext|egg_info|install(?:_lib|_egg_info|_scripts|_headers)?|sdist|check)\b`,
    line
  ) || regexTest(String.raw`^building '.+' extension$`, line) || line.startsWith("creating build") || line.startsWith("compile options: ") || line.startsWith("extra options: ") || regexTest(String.raw`^copying .+ -> `, line) || regexTest(String.raw`^writing .+\.egg-info/`, line) || line.startsWith("reading manifest file ") || regexTest(
    String.raw`^(?:gcc|g\+\+|cc|c\+\+|clang|clang\+\+)\b.*\s(?:-c|-shared)\s`,
    line
  ) || regexTest(
    String.raw`^Compiling \S+\.pyx because (?:it changed|it depends on )`,
    line
  ) || regexTest(String.raw`^\[\s*\d+/\d+\]\s+Cythonizing \S+\.pyx`, line));
}
function compactSetuptoolsFileStagingRuns(output) {
  return collapseContiguousRuns(output, isSetuptoolsFileStagingLine, 5, (block) => {
    const operations = uniqueStrings(
      block.map((line) => splitWhitespace(line)[0] ?? "staging")
    );
    return `[setuptools file staging: omitted ${block.length} ${operations.join("/")} line(s)]`;
  });
}
function isSetuptoolsFileStagingLine(line) {
  return regexTest(String.raw`^copying .+ -> .+$`, line) || regexTest(String.raw`^creating (?:build\b|[^/\s]+\.egg-info\b).*$`, line) || regexTest(
    String.raw`^creating [A-Za-z0-9_.+-]+-[A-Za-z0-9_.+-]+/[\w./+-]+$`,
    line
  ) || regexTest(String.raw`^adding (?:license file )?(?:'[^']+'|"[^"]+")$`, line) || regexTest(String.raw`^writing .+\.egg-info/.+$`, line) || regexTest(String.raw`^writing manifest file ['"].+['"]$`, line) || regexTest(String.raw`^reading manifest (?:file|template) ['"].+['"]$`, line);
}
function compactNumpyDistutilsProbes(output) {
  if (!output.includes("INFO: ")) {
    return output;
  }
  return collapseContiguousRuns(output, isNumpyDistutilsProbeLine, 4, (block) => `[numpy.distutils probes: omitted ${block.length} BLAS/LAPACK probe line(s)]`);
}
function isNumpyDistutilsProbeLine(line) {
  return !isDiagnosticLine(line) && line.startsWith("INFO: ") && regexTest(
    String.raw`(?:_info:|NOT AVAILABLE|libraries .* not found|Setting PTATLAS|customize |compile options:|extra options:)`,
    line
  );
}
function compactSphinxProgress(output) {
  if (!output.includes("reading sources... [") && !output.includes("writing output... [")) {
    return output;
  }
  return compactIntralineProgress(output, "sphinx progress", compactSphinxProgressLine);
}
function compactSphinxProgressLine(line) {
  if (!line.includes("reading sources... [") && !line.includes("writing output... [")) {
    return unchangedLine(line);
  }
  return compactProgressPatternsUnlessDiagnostic(
    line,
    [
      String.raw`reading sources\.\.\. \[\s*\d+%\]\s+\S+\s*`,
      String.raw`writing output\.\.\. \[\s*\d+%\]\s+\S+\s*`
    ]
  );
}
function hasSphinxProgress(output) {
  return hasSphinxOutputMarker(output) && (output.includes("reading sources... [") || output.includes("writing output... ["));
}
function hasSphinxOutputMarker(output) {
  return output.split("\n").some((line) => line.startsWith("Running Sphinx v") || line.startsWith("Sphinx v") || line.startsWith("loading pickled environment...") || line.startsWith("build succeeded") || line.startsWith("build finished with problems") || line.startsWith("The HTML pages are in "));
}
function compactDocusaurusProgress(output) {
  if (!hasDocusaurusProgress(output)) {
    return output;
  }
  return omitMatchingLines(
    output,
    "docusaurus progress",
    (line) => regexTest(String.raw`^\s*[\u25CF\u25EF]\s+(?:Client|Server)(?:\s+|$)`, line),
    "progress"
  );
}
function compactCarriageReturnProgress(output) {
  if (!output.includes("\r")) {
    return output;
  }
  return output.split("\n").map((line) => {
    const parts = line.split("\r");
    for (let idx = parts.length - 1; idx >= 0; idx--) {
      if (parts[idx].length !== 0) {
        return parts[idx];
      }
    }
    return "";
  }).join("\n");
}
function looksLikeGoRuntimePanic(output) {
  if (jsStringLen(output) < 4 * 1024 || !regexTest(
    String.raw`(?:^|\n)(?:fatal error: |runtime stack:|SIGSEGV|SIGABRT|SIGBUS)`,
    output
  )) {
    return false;
  }
  let count = 0;
  for (const line of output.split("\n")) {
    if (isGoRuntimeGoroutineHeader(line)) {
      count += 1;
      if (count === GO_RUNTIME_PANIC_MIN_GOROUTINES) {
        return true;
      }
    }
  }
  return false;
}
function compactGoRuntimePanicDump(output) {
  if (!looksLikeGoRuntimePanic(output)) {
    return output;
  }
  const lines = output.split("\n");
  const firstHeader = lines.findIndex((line) => isGoRuntimeGoroutineHeader(line));
  if (firstHeader === -1) {
    return output;
  }
  const blocks = collectGoGoroutineBlocks(lines, firstHeader);
  if (blocks.length < GO_RUNTIME_PANIC_MIN_GOROUTINES) {
    return output;
  }
  const compacted = lines.slice(0, firstHeader);
  for (let k = blocks[0].start; k < blocks[0].end; k++) {
    compacted.push(lines[k]);
  }
  let omittedFrameLines = 0;
  const remainingBlocks = [];
  for (const block of blocks.slice(1)) {
    const originalBlock = lines.slice(block.start, block.end);
    const compactedBlock = compactGoGoroutineBlock(originalBlock);
    omittedFrameLines += saturatingSub(originalBlock.length, compactedBlock.length);
    remainingBlocks.push(compactedBlock);
  }
  const groupedBlocks = groupRepeatedGoGoroutineBlocks(remainingBlocks);
  if (omittedFrameLines === 0 && groupedBlocks.omittedBlocks === 0) {
    return output;
  }
  const summary = [];
  if (omittedFrameLines > 0) {
    summary.push(`${blocks.length - 1} goroutine block(s) below were condensed; ${omittedFrameLines} frame line(s) omitted`);
  }
  if (groupedBlocks.omittedBlocks > 0) {
    summary.push(`${groupedBlocks.omittedBlocks} repeated goroutine block(s) grouped`);
  }
  compacted.push(`[go runtime panic: ${summary.join("; ")}]`);
  for (const block of groupedBlocks.blocks) {
    compacted.push(...block);
  }
  return compacted.join("\n");
}
function collectGoGoroutineBlocks(lines, firstHeader) {
  const blocks = [];
  let start = firstHeader;
  for (let i = firstHeader + 1; i < lines.length; i++) {
    if (isGoRuntimeGoroutineHeader(lines[i])) {
      blocks.push({ start, end: i });
      start = i;
    }
  }
  blocks.push({ start, end: lines.length });
  return blocks;
}
function compactGoGoroutineBlock(block) {
  const footerStart = findGoGoroutineFooterStart(block);
  const stack = block.slice(0, footerStart);
  const footer = block.slice(footerStart);
  if (stack.length <= 4) {
    return [...stack, ...footer];
  }
  let createdByIndex;
  for (let idx = stack.length - 1; idx >= 0; idx--) {
    if (stack[idx].startsWith("created by ")) {
      createdByIndex = idx;
      break;
    }
  }
  const kept = stack.slice(0, Math.min(3, stack.length));
  if (createdByIndex !== void 0 && createdByIndex >= kept.length) {
    kept.push(...stack.slice(createdByIndex));
  }
  kept.push(...footer);
  return kept;
}
function groupRepeatedGoGoroutineBlocks(blocks) {
  const signatures = blocks.map((block) => goGoroutineSignature(block));
  const counts = /* @__PURE__ */ new Map();
  for (const signature of signatures) {
    if (signature !== void 0) {
      counts.set(signature.key, (counts.get(signature.key) ?? 0) + 1);
    }
  }
  const grouped = [];
  const seen = [];
  let omittedBlocks = 0;
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const signature = signatures[index];
    if (signature === void 0) {
      grouped.push([...block]);
      continue;
    }
    if ((counts.get(signature.key) ?? 0) < 3) {
      grouped.push([...block]);
      continue;
    }
    if (seen.includes(signature.key)) {
      omittedBlocks += 1;
      continue;
    }
    seen.push(signature.key);
    grouped.push([...block]);
    grouped.push([
      `[go runtime panic: omitted ${(counts.get(signature.key) ?? 1) - 1} similar goroutine block(s): state=${signature.state}, top=${signature.top}${signature.location.length === 0 ? "" : " at "}${signature.location}, created by=${signature.createdBy}]`,
      ""
    ]);
  }
  return { blocks: grouped, omittedBlocks };
}
function goGoroutineSignature(block) {
  if (findGoGoroutineFooterStart(block) < block.length) {
    return void 0;
  }
  const first = block[0];
  if (first === void 0) {
    return void 0;
  }
  const state = regexCaptureFirst(String.raw`\[([^\]]+)\]:$`, first);
  if (state === void 0) {
    return void 0;
  }
  let topIndex;
  for (let index = 0; index < block.length; index++) {
    const line = block[index];
    if (index > 0 && line.length !== 0 && !line.startsWith("	") && !line.startsWith("created by ")) {
      topIndex = index;
      break;
    }
  }
  if (topIndex === void 0) {
    return void 0;
  }
  const top = goFunctionName(block[topIndex]);
  if (top === void 0) {
    return void 0;
  }
  const location = goFileLocation(topIndex + 1 < block.length ? block[topIndex + 1] : void 0);
  const createdByLine = block.find((line) => line.startsWith("created by "));
  const createdBy = (createdByLine !== void 0 ? goCreatedByFunction(createdByLine) : void 0) ?? "<none>";
  return {
    key: `${state}\0${top}\0${location}\0${createdBy}`,
    state,
    top,
    location,
    createdBy
  };
}
function goFunctionName(line) {
  return regexCaptureFirst(String.raw`^([^\s(]+)(?:\(|$)`, line);
}
function goFileLocation(line) {
  if (line === void 0) {
    return "";
  }
  return regexCaptureFirst(String.raw`([^/\s]+\.[A-Za-z0-9]+:\d+)`, line) ?? "";
}
function goCreatedByFunction(line) {
  return regexCaptureFirst(String.raw`^created by (.+?)(?: in goroutine \d+)?$`, line);
}
function findGoGoroutineFooterStart(block) {
  for (let i = 1; i < block.length; i++) {
    if (!isGoGoroutineStackLine(block[i])) {
      return i;
    }
  }
  return block.length;
}
function isGoGoroutineStackLine(line) {
  return line.length === 0 || line.startsWith("	") || line.startsWith("created by ") || regexTest(String.raw`^\S.*\)$`, line);
}
function isGoRuntimeGoroutineHeader(line) {
  return regexTest(
    String.raw`^goroutine \d+(?: gp=\S+)?(?: m=\S+)?(?: mp=\S+)? \[[^\]]+\]:$`,
    line
  );
}
function isDjangoTestBoilerplateLine(line) {
  return !isDiagnosticLine(line) && (line.startsWith("Testing against Django installed in ") || regexTest(String.raw`^Found \d+ test(?:\(s\)|s)?\.$`, line) || line.startsWith("Creating test database for alias ") || line.startsWith("Destroying test database for alias ") || line.startsWith("Skipping setup of unused database") || line.startsWith("System check identified no issues") || line.startsWith("Operations to perform:") || line.startsWith("Apply all migrations:") || regexTest(String.raw`^ {2}Applying \S+\.\S+\.\.\. OK$`, line) || regexTest(String.raw`^test_\S+ \([^)]+\) \.\.\. ok$`, line));
}
function isDjangoTestProgressLine(line) {
  return !isDiagnosticLine(line) && (line.includes(".") || line.includes("s") || line.includes("x") || line.includes("X")) && regexTest(String.raw`^[.sxXEF]+(?:\s+\[\s*\d+%\])?$`, line);
}
function isPytestSessionMetadataLine(line) {
  return !isDiagnosticLine(line) && (regexTestWithFlags(String.raw`^=+\s*test session starts\s*=+$`, line, "i") || regexTest(String.raw`^platform .*\bpytest-.*\bpluggy-`, line) || regexTest(String.raw`^(?:cachedir|rootdir|configfile|plugins): `, line) || line.startsWith("collecting ...") || regexTest(String.raw`^collected \d+ items?`, line));
}
function compactPytestProgress(output) {
  if (hasPytestTerminalSummary(output)) {
    return omitPytestProgressLines(output, isPytestProgressLine);
  }
  if (hasStrictPytestPassedProgressRun(output) && !hasPytestProgressFallbackPoison(output)) {
    return omitPytestProgressLines(output, isStrictPytestPassedProgressLine);
  }
  return output;
}
function omitPytestProgressLines(output, shouldOmit) {
  const compacted = [];
  const omittedLines = [];
  for (const line of output.split("\n")) {
    if (shouldOmit(line)) {
      omittedLines.push(line);
    } else {
      flushPytestProgressLines(compacted, omittedLines);
      compacted.push(line);
    }
  }
  flushPytestProgressLines(compacted, omittedLines);
  return compacted.join("\n");
}
function flushPytestProgressLines(compacted, omittedLines) {
  if (omittedLines.length === 0) {
    return;
  }
  const summary = omittedLines.every((line) => isStrictPytestPassedProgressLine(line)) ? `[pytest progress: omitted ${omittedLines.length} PASSED test result line(s)]` : `[pytest progress: omitted ${omittedLines.length} non-diagnostic line(s)]`;
  compacted.push(summary);
  omittedLines.length = 0;
}
function isPytestProgressLine(line) {
  return !isDiagnosticLine(line) && (regexTest(String.raw`^[-=]{20,}$`, line) || regexTest(String.raw`^[.sxX]+(?:\s+\[\s*\d+%\])?\s*$`, line) || regexTest(
    String.raw`^\S+\.py::\S+\s+(?:PASSED|SKIPPED|XFAIL)\s+\[\s*\d+%\]$`,
    line
  ));
}
function hasPytestProgressFallbackPoison(output) {
  return regexTest(
    String.raw`(?:^|\n)(?:\S+\.py::\S+\s+(?:FAILED|ERROR)\s+\[\s*\d+%\]|(?:FAIL|ERROR|INTERNALERROR)\b)|Traceback \(most recent call last\):`,
    output
  ) || hasHardCrashLine(output);
}
function hasHardCrashLine(output) {
  return regexTestWithFlags(
    String.raw`(?:Fatal Python error:|Aborted|Abort trap|core dumped|segmentation fault)`,
    output,
    "i"
  );
}
function hasStrictPytestPassedProgressRun(output) {
  let runLength = 0;
  for (const line of output.split("\n")) {
    if (isStrictPytestPassedProgressLine(line)) {
      runLength += 1;
      if (runLength >= 5) {
        return true;
      }
    } else {
      runLength = 0;
    }
  }
  return false;
}
function isStrictPytestPassedProgressLine(line) {
  return !isDiagnosticLine(line) && regexTest(String.raw`^\S+\.py::\S+\s+PASSED\s+\[\s*\d+%\]$`, line);
}
function hasPytestTerminalSummary(output) {
  return regexTestWithFlags(
    String.raw`(?:^|\n)(?:=+\s*)?[^=\n]*(?:passed|failed|errors?|warnings?|skipped|xfailed|xpassed)[^=\n]*\bin \d+(?:\.\d+)?s\s*(?:=+)?\s*(?:\n|$)`,
    output,
    "i"
  );
}
function compactPytestFailureBlocks(output) {
  if (!hasPytestTerminalSummary(output)) {
    return output;
  }
  const shortSummaryLines = countPytestShortSummaryLines(output);
  const sectionHeaders = countPytestSectionHeaders(output);
  const lines = output.split("\n");
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    const section = pytestSectionName(lines[i]);
    if (section !== "FAILURES" && section !== "ERRORS") {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    compacted.push(lines[i]);
    const start = i + 1;
    let end = start;
    while (end < lines.length && !isPytestSectionHeader(lines[end])) {
      end += 1;
    }
    compacted.push(...compactPytestFailureRegion(
      lines.slice(start, end),
      asciiLowercase(section ?? "")
    ));
    i = end;
  }
  const result = compacted.join("\n");
  if (countPytestShortSummaryLines(result) === shortSummaryLines && countPytestSectionHeaders(result) === sectionHeaders) {
    return result;
  }
  return output;
}
function compactPytestFailureRegion(lines, label) {
  const entries = [];
  const groups = /* @__PURE__ */ new Map();
  let i = 0;
  while (i < lines.length) {
    const name = parsePytestFailureBlockHeader(lines[i]);
    if (name === void 0) {
      entries.push({ type: "line", line: lines[i] });
      i += 1;
      continue;
    }
    const header = lines[i];
    i += 1;
    const bodyStart = i;
    while (i < lines.length && parsePytestFailureBlockHeader(lines[i]) === void 0 && !isPytestSectionHeader(lines[i])) {
      i += 1;
    }
    const body = lines.slice(bodyStart, i);
    const key = pytestFailureBlockKey(body);
    const block = { header, name, body, key };
    if (key !== void 0) {
      const list = groups.get(key);
      if (list !== void 0) {
        list.push(block);
      } else {
        groups.set(key, [block]);
      }
    }
    entries.push({ type: "block", block });
  }
  const emittedGroups = [];
  const compacted = [];
  for (const entry of entries) {
    if (entry.type === "line") {
      compacted.push(entry.line);
      continue;
    }
    const block = entry.block;
    const group = block.key !== void 0 ? groups.get(block.key) : void 0;
    const alreadyEmitted = block.key !== void 0 && emittedGroups.includes(block.key);
    if (block.key === void 0 || group === void 0 || group.length < 2 || alreadyEmitted) {
      if (block.key === void 0 || group === void 0 || group.length < 2) {
        compacted.push(block.header);
        compacted.push(...block.body);
      }
      continue;
    }
    emittedGroups.push(block.key);
    const first = group[0];
    compacted.push(first.header);
    compacted.push(...first.body);
    const duplicates = group.slice(1);
    compacted.push(`[pytest ${label}: ${duplicates.length} duplicate traceback block(s) match ${first.name}; also: ${summarizeWithMore(duplicates.map((duplicate) => duplicate.name), 8)}]`);
  }
  return compacted;
}
function parsePytestFailureBlockHeader(line) {
  return regexCaptureFirst(String.raw`^_{3,}\s+(.+?)\s+_{3,}\s*$`, line);
}
function pytestFailureBlockKey(body) {
  if (body.length < 3 || body.some((line) => isPytestSummaryLine(line))) {
    return void 0;
  }
  const normalized = body.map((line) => normalizePytestFailureLine(line)).filter((line) => line.trim().length !== 0).join("\n");
  if (normalized.split("\n").length >= 3) {
    return normalized;
  }
  return void 0;
}
function normalizePytestFailureLine(line) {
  const stripped = stripAnsi(line);
  return stripped.replace(new RegExp(String.raw`^\[gw\d+\]\s*`), "");
}
function isPytestSummaryLine(line) {
  return regexTest(String.raw`^(?:FAILED|ERROR)\s+\S`, line);
}
function countPytestShortSummaryLines(output) {
  return output.split("\n").filter((line) => isPytestSummaryLine(line)).length;
}
function countPytestSectionHeaders(output) {
  return output.split("\n").filter((line) => isPytestSectionHeader(line)).length;
}
function isPytestSectionHeader(line) {
  return pytestSectionName(line) !== void 0 || regexTest(String.raw`^=+\s+.*\bin \d+(?:\.\d+)?s\b.*\s*=+\s*$`, line);
}
function pytestSectionName(line) {
  const name = regexCaptureFirst(String.raw`^=+\s+([A-Za-z][A-Za-z ]+)\s+=+\s*$`, line);
  return name !== void 0 ? name.trim() : void 0;
}
function compactPytestWarningsSummary(output) {
  const lines = output.split("\n");
  const compacted = [];
  let i = 0;
  while (i < lines.length) {
    if (!regexTestWithFlags(String.raw`^=+\s*warnings summary\s*=+$`, lines[i], "i")) {
      compacted.push(lines[i]);
      i += 1;
      continue;
    }
    compacted.push(lines[i]);
    let j = i + 1;
    while (j < lines.length && !regexTest(String.raw`^=+\s+.+\s+=+$`, lines[j])) {
      j += 1;
    }
    compacted.push(...compactPytestWarningsSummaryRegion(lines.slice(i + 1, j)));
    i = j;
  }
  return compacted.join("\n");
}
function compactPytestWarningsSummaryRegion(lines) {
  const entries = [];
  const groups = /* @__PURE__ */ new Map();
  let i = 0;
  while (i < lines.length) {
    if (!isPytestWarningTestIdLine(lines[i])) {
      entries.push({ type: "line", line: lines[i] });
      i += 1;
      continue;
    }
    const testIds = [];
    while (i < lines.length && isPytestWarningTestIdLine(lines[i])) {
      testIds.push(lines[i]);
      i += 1;
    }
    const body = [];
    while (i < lines.length && !isPytestWarningTestIdLine(lines[i]) && !lines[i].startsWith("-- Docs: ")) {
      body.push(lines[i]);
      i += 1;
    }
    const parsed = parsePytestWarningBody(body);
    const block = {
      testIds,
      body,
      key: parsed?.key,
      warningClass: parsed?.warningClass,
      message: parsed?.message
    };
    if (block.key !== void 0) {
      const list = groups.get(block.key);
      if (list !== void 0) {
        list.push(block);
      } else {
        groups.set(block.key, [block]);
      }
    }
    entries.push({ type: "block", block });
  }
  const emittedGroups = [];
  const compacted = [];
  for (const entry of entries) {
    if (entry.type === "line") {
      compacted.push(entry.line);
      continue;
    }
    const block = entry.block;
    const group = block.key !== void 0 ? groups.get(block.key) : void 0;
    const shouldGroup = group !== void 0 && (group.length > 1 || group[0].testIds.length > 1);
    const alreadyEmitted = block.key !== void 0 && emittedGroups.includes(block.key);
    if (!shouldGroup || block.key === void 0 || alreadyEmitted) {
      if (!shouldGroup) {
        compacted.push(...formatPytestWarningBlock(block));
      }
      continue;
    }
    if (group === void 0) {
      continue;
    }
    emittedGroups.push(block.key);
    const totalTestIds = group.reduce((sum, item) => sum + item.testIds.length, 0);
    compacted.push(group[0].testIds[0]);
    if (totalTestIds > 1) {
      compacted.push(`[pytest warnings summary: ${totalTestIds} test id line(s) share ${block.warningClass ?? "warning"}: ${block.message ?? ""}]`);
    }
    compacted.push(...group[0].body);
    const duplicateBodies = group.length - 1;
    if (duplicateBodies > 0) {
      const locations = [];
      for (const item of group) {
        const location = parsePytestWarningLocation(item.body);
        if (location !== void 0 && !locations.includes(location)) {
          locations.push(location);
        }
      }
      const locationSummary = locations.length > 1 ? ` from ${locations.length} location(s)` : "";
      compacted.push(`[pytest warnings summary: omitted ${duplicateBodies} duplicate warning block(s)${locationSummary}]`);
    }
  }
  return compacted;
}
function formatPytestWarningBlock(block) {
  if (block.testIds.length <= 1) {
    return [...block.testIds, ...block.body];
  }
  const lines = [block.testIds[0]];
  lines.push(`[pytest warnings summary: omitted ${block.testIds.length - 1} test id line(s)]`);
  lines.push(...block.body);
  return lines;
}
function parsePytestWarningBody(body) {
  const regex = new RegExp(String.raw`^\s+.+?:\d+:\s+([A-Za-z_][A-Za-z0-9_.]*Warning):\s+(.+)$`);
  for (const line of body) {
    const captures = regex.exec(line);
    if (captures === null) {
      continue;
    }
    const warningClass = captures[1];
    const messageRaw = captures[2];
    if (warningClass === void 0 || messageRaw === void 0) {
      return void 0;
    }
    const message = normalizePytestWarningMessage(messageRaw);
    return {
      key: `${warningClass}\0${message}`,
      warningClass,
      message
    };
  }
  return void 0;
}
function parsePytestWarningLocation(body) {
  for (const line of body) {
    const location = regexCaptureFirst(
      String.raw`^\s+(.+?:\d+):\s+[A-Za-z_][A-Za-z0-9_.]*Warning:\s+.+$`,
      line
    );
    if (location !== void 0) {
      return location;
    }
  }
  return void 0;
}
function normalizePytestWarningMessage(message) {
  return splitWhitespace(message).join(" ");
}
function isPytestWarningTestIdLine(line) {
  const trimmed = line.trimEnd();
  return line === trimmed && (!trimmed.includes(" ") && (trimmed.includes(".py::") || regexTest(String.raw`^\S+\.py:\d+$`, trimmed)) || regexTest(String.raw`^\S+\.py:\s+\d+ warnings?$`, trimmed));
}
function compactGrepContentOutput(output, largeOutputThreshold) {
  const lines = splitToolOutputLines(output);
  if (shouldSkipToolOutputCompaction(lines, output, 8)) {
    return unchanged(output);
  }
  const grepLines = lines.filter((line) => line !== "--");
  const parsedMatches = [];
  for (const line of grepLines) {
    const parsed = parseGrepContentLine(line);
    if (parsed !== void 0) {
      parsedMatches.push(parsed);
    }
  }
  if (parsedMatches.length < 8 || parsedMatches.length < 20 && jsStringLen(output) < 4e3) {
    return unchanged(output);
  }
  if (parsedMatches.length !== grepLines.length && (fitsLargeOutputThreshold(output, largeOutputThreshold) || parsedMatches.length / grepLines.length < 0.6)) {
    return unchanged(output);
  }
  const sortedGroups = grepContentGroups(parsedMatches);
  const commonPrefix = commonDirectoryPrefix(parsedMatches.map((m) => m.path));
  const bodyBudget = compactedBodyBudget(largeOutputThreshold);
  const lossless = renderGrepContentGroups(sortedGroups, commonPrefix, sortedGroups.length, indexAll);
  if (byteLength(lossless) >= byteLength(output) && fitsLargeOutputThreshold(output, largeOutputThreshold)) {
    return unchanged(output);
  }
  if (fitsLargeOutputThreshold(lossless, largeOutputThreshold)) {
    return { output: lossless, lossless: true };
  }
  const aggressive = renderGrepContentGroups(sortedGroups, commonPrefix, 12, selectHeadTailToShow);
  if (fitsLargeOutputThreshold(aggressive, bodyBudget)) {
    return lossy(aggressive);
  }
  const fallback = renderBudgetedGrepContentGroups(sortedGroups, commonPrefix, largeOutputThreshold);
  if (byteLength(fallback) < byteLength(aggressive)) {
    return lossy(fallback);
  }
  return lossy(aggressive);
}
function grepContentGroups(matches) {
  const groups = /* @__PURE__ */ new Map();
  for (const m of matches) {
    const list = groups.get(m.path);
    if (list !== void 0) {
      list.push(m);
    } else {
      groups.set(m.path, [m]);
    }
  }
  return [...groups.entries()];
}
function renderGrepContentGroups(sortedGroups, commonPrefix, maxGroups, selectMatches) {
  const totalMatches = totalGroupItems(sortedGroups);
  const compacted = [];
  compacted.push(`[grep content: ${totalMatches} matches across ${sortedGroups.length} file(s)${commonPrefix.length === 0 ? "" : ` under ${commonPrefix}`}]`);
  for (const [filePath, fileMatches] of sortedGroups.slice(0, maxGroups)) {
    const displayPath = displayPathUnderPrefix(filePath, commonPrefix);
    if (fileMatches.length === 1) {
      compacted.push(`${displayPath}:${formatGrepMatch(fileMatches[0])}`);
      continue;
    }
    compacted.push("");
    compacted.push(`${displayPath} (${fileMatches.length} match(es)):`);
    const shown = selectMatches(fileMatches);
    let previousIndex;
    for (const { item: m, index } of shown) {
      if (previousIndex !== void 0 && index > previousIndex + 1) {
        compacted.push(`  ... ${index - previousIndex - 1} more match(es) omitted in this file`);
      }
      compacted.push(`  ${formatGrepMatch(m)}`);
      previousIndex = index;
    }
    const omittedAfterLast = previousIndex !== void 0 ? saturatingSub(fileMatches.length, previousIndex + 1) : fileMatches.length;
    if (omittedAfterLast > 0) {
      compacted.push(`  ... ${omittedAfterLast} more match(es) omitted in this file`);
    }
  }
  if (sortedGroups.length > maxGroups) {
    const omittedMatches = totalGroupItems(sortedGroups.slice(maxGroups));
    compacted.push("");
    compacted.push(`[omitted ${omittedMatches} match(es) in ${sortedGroups.length - maxGroups} file(s); see original output for full results]`);
  }
  return compacted.join("\n");
}
function parseGrepContentLine(line) {
  const numbered = parseNumberedGrepContentLine(line);
  if (numbered !== void 0) {
    return numbered;
  }
  const separatorIndex = line.indexOf(":");
  if (separatorIndex < 0) {
    return void 0;
  }
  if (separatorIndex === 0 || separatorIndex === line.length - 1) {
    return void 0;
  }
  const path = line.slice(0, separatorIndex);
  if (!looksLikeGrepPath(path)) {
    return void 0;
  }
  return {
    path: normalizeDisplayPathSeparators(path),
    lineNumber: void 0,
    separator: ":",
    text: line.slice(separatorIndex + 1)
  };
}
function parseNumberedGrepContentLine(line) {
  const bytes = new TextEncoder().encode(line);
  const decoder = new TextDecoder();
  const sliceStr = (start, end) => decoder.decode(bytes.subarray(start, end));
  const isAsciiDigitByte = (byte) => byte >= 48 && byte <= 57;
  const colon = 58;
  const dash = 45;
  const upperBound = saturatingSub(bytes.length, 2);
  for (let i = 1; i < upperBound; i++) {
    const pathSeparator = bytes[i];
    if (pathSeparator !== colon && pathSeparator !== dash) {
      continue;
    }
    const numberStart = i + 1;
    let numberEnd = numberStart;
    while (numberEnd < bytes.length && isAsciiDigitByte(bytes[numberEnd])) {
      numberEnd += 1;
    }
    if (numberEnd === numberStart) {
      continue;
    }
    if (numberEnd >= bytes.length) {
      return void 0;
    }
    const separator = bytes[numberEnd];
    if (separator !== colon && separator !== dash) {
      continue;
    }
    const path = sliceStr(0, i);
    if (!looksLikeGrepPath(path)) {
      continue;
    }
    return {
      path: normalizeDisplayPathSeparators(path),
      lineNumber: sliceStr(numberStart, numberEnd),
      separator: String.fromCharCode(separator),
      text: sliceStr(numberEnd + 1, bytes.length)
    };
  }
  return void 0;
}
function looksLikeGrepPath(path) {
  return path.includes("/") || path.includes("\\") || regexTest(String.raw`\.[A-Za-z0-9_-]+$`, path);
}
function renderBudgetedGrepContentGroups(sortedGroups, commonPrefix, largeOutputThreshold) {
  const budget = compactedBodyBudget(largeOutputThreshold);
  let smallest = renderBudgetedGrepContentGroupsWithLimit(sortedGroups, commonPrefix, 1, 1);
  for (const maxGroups of [10, 8, 6, 4, 2, 1]) {
    for (const maxMatchesPerGroup of [12, 6, 3, 1]) {
      const candidate = renderBudgetedGrepContentGroupsWithLimit(
        sortedGroups,
        commonPrefix,
        maxGroups,
        maxMatchesPerGroup
      );
      if (fitsLargeOutputThreshold(candidate, budget)) {
        return candidate;
      }
      smallest = candidate;
    }
  }
  return smallest;
}
function renderBudgetedGrepContentGroupsWithLimit(sortedGroups, commonPrefix, maxGroups, maxMatchesPerGroup) {
  const totalMatches = totalGroupItems(sortedGroups);
  const compacted = [];
  compacted.push(`[grep content: ${totalMatches} matches across ${sortedGroups.length} file(s)${commonPrefix.length === 0 ? "" : ` under ${truncatePathMiddle(commonPrefix, COMMON_PREFIX_DISPLAY_WIDTH)}`}; compact summary]`);
  for (const [filePath, fileMatches] of sortedGroups.slice(0, maxGroups)) {
    compacted.push(formatBudgetedGrepGroup(filePath, fileMatches, commonPrefix, maxMatchesPerGroup));
  }
  if (sortedGroups.length > maxGroups) {
    const omittedMatches = totalGroupItems(sortedGroups.slice(maxGroups));
    compacted.push(`[omitted ${omittedMatches} match(es) in ${sortedGroups.length - maxGroups} file(s)]`);
  }
  const extensionSummary = summarizeExtensions(sortedGroups.map(([filePath]) => filePath));
  if (extensionSummary.length !== 0) {
    compacted.push(`[extensions: ${truncateInlineText(extensionSummary, EXTENSION_SUMMARY_INLINE_WIDTH)}]`);
  }
  return compacted.join("\n");
}
function formatBudgetedGrepGroup(filePath, fileMatches, commonPrefix, maxMatches) {
  const displayPath = truncatePathMiddle(displayPathUnderPrefix(filePath, commonPrefix), 140);
  const shown = selectEvenlySpacedGrepMatches(fileMatches, maxMatches);
  const lines = [`${displayPath} (${fileMatches.length} match(es)):`];
  for (const { item: m } of shown) {
    lines.push(`  ${excerptInlineText(formatGrepMatch(m), 180)}`);
  }
  if (fileMatches.length > shown.length) {
    lines.push(`  ... ${fileMatches.length - shown.length} more match(es) omitted in this file`);
  }
  return lines.join("\n");
}
function selectEvenlySpacedGrepMatches(matches, maxMatches) {
  if (matches.length <= maxMatches) {
    return indexAll(matches);
  }
  if (maxMatches <= 1) {
    return [{ item: matches[0], index: 0 }];
  }
  const selected = [];
  const seen = [];
  for (let i = 0; i < maxMatches; i++) {
    const index = Math.round(i * (matches.length - 1) / (maxMatches - 1));
    if (!seen.includes(index)) {
      seen.push(index);
      selected.push({ index, item: matches[index] });
    }
  }
  return selected;
}
function formatGrepMatch(m) {
  if (m.lineNumber !== void 0) {
    return `${m.lineNumber}${m.separator} ${m.text}`;
  }
  return ` ${m.text}`;
}
function compactGrepCountOutput(output) {
  const TOP_COUNT_ROWS = 20;
  const lines = splitToolOutputLines(output);
  if (shouldSkipToolOutputCompaction(lines, output, 30)) {
    return unchanged(output);
  }
  const parsedCounts = [];
  for (const line of lines) {
    const parsed = parseGrepCountLine(line);
    if (parsed !== void 0) {
      parsedCounts.push(parsed);
    }
  }
  if (parsedCounts.length < 30 || parsedCounts.length / lines.length < 0.8) {
    return unchanged(output);
  }
  let totalMatches = 0;
  for (const m of parsedCounts) {
    totalMatches += m.count;
  }
  const sortedCounts = [...parsedCounts];
  sortedCounts.sort((a, b) => b.count - a.count || compareStrings(a.path, b.path));
  const compacted = [`[grep count: ${totalMatches} match(es) across ${parsedCounts.length} file(s) with matches]`];
  compacted.push("");
  compacted.push("Top files by match count:");
  for (const m of sortedCounts.slice(0, TOP_COUNT_ROWS)) {
    compacted.push(`  ${String(m.count).padStart(6)}  ${m.path}`);
  }
  if (sortedCounts.length > TOP_COUNT_ROWS) {
    compacted.push(`  ... ${sortedCounts.length - TOP_COUNT_ROWS} more file(s) omitted`);
  }
  const directoryCounts = summarizeCountDirectories(parsedCounts);
  if (directoryCounts.length !== 0) {
    compacted.push("");
    compacted.push("Top directories by match count:");
    for (const summary of directoryCounts.slice(0, TOP_COUNT_ROWS)) {
      compacted.push(`  ${String(summary.count).padStart(6)} in ${summary.files} file(s)  ${summary.directory}`);
    }
    if (directoryCounts.length > TOP_COUNT_ROWS) {
      const omittedDirectories = directoryCounts.length - TOP_COUNT_ROWS;
      compacted.push(`  ... ${omittedDirectories} more director${omittedDirectories === 1 ? "y" : "ies"} omitted`);
    }
  }
  const extensionSummary = summarizeExtensions(parsedCounts.map((m) => m.path));
  if (extensionSummary.length !== 0) {
    compacted.push("");
    compacted.push(`[extensions: ${extensionSummary}]`);
  }
  return lossy(compacted.join("\n"));
}
function parseGrepCountLine(line) {
  const split = rsplitOnce(line, ":");
  if (split === void 0) {
    return void 0;
  }
  const [path, count] = split;
  if (path.length === 0) {
    return void 0;
  }
  const parsed = parseUsize(count);
  if (parsed === void 0) {
    return void 0;
  }
  return { path, count: parsed };
}
function summarizeCountDirectories(counts) {
  const directories = /* @__PURE__ */ new Map();
  for (const m of counts) {
    const directory = directoryOfPath(m.path);
    let entry = directories.get(directory);
    if (entry === void 0) {
      entry = { directory, count: 0, files: 0 };
      directories.set(directory, entry);
    }
    entry.count += m.count;
    entry.files += 1;
  }
  const values = [...directories.values()];
  values.sort((a, b) => b.count - a.count || b.files - a.files || compareStrings(a.directory, b.directory));
  return values;
}
function compactPathListOutput(output, label, largeOutputThreshold) {
  const paths = splitToolOutputLines(output).map((line) => normalizeDisplayPathSeparators(line));
  if (shouldSkipToolOutputCompaction(paths, output, 25)) {
    return unchanged(output);
  }
  const commonPrefix = commonDirectoryPrefix(paths);
  const groups = /* @__PURE__ */ new Map();
  for (const filePath of paths) {
    const groupPath = pathListGroupPath(filePath, commonPrefix);
    const list = groups.get(groupPath);
    if (list !== void 0) {
      list.push(filePath);
    } else {
      groups.set(groupPath, [filePath]);
    }
  }
  const sortedGroups = [...groups.entries()];
  sortedGroups.sort((a, b) => b[1].length - a[1].length || compareStrings(a[0], b[0]));
  const bodyBudget = compactedBodyBudget(largeOutputThreshold);
  const primary = renderPathListGroups(
    paths,
    label,
    commonPrefix,
    sortedGroups,
    sortedGroups.length,
    false
  );
  if (byteLength(primary) >= byteLength(output) && fitsLargeOutputThreshold(output, largeOutputThreshold)) {
    return unchanged(output);
  }
  if (fitsLargeOutputThreshold(primary, bodyBudget)) {
    return { output: primary, lossless: true };
  }
  return lossy(renderBudgetedFlatPathList(
    paths,
    label,
    commonPrefix,
    largeOutputThreshold
  ));
}
function renderPathListGroups(paths, label, commonPrefix, sortedGroups, maxGroups, compactSelection) {
  const compacted = [`[${label}: ${paths.length} path(s)${commonPrefix.length === 0 ? "" : ` under ${commonPrefix}`}; grouped by directory]`];
  for (const [groupPath, groupPaths] of sortedGroups.slice(0, maxGroups)) {
    const sortedGroupPaths = [...groupPaths];
    sortedGroupPaths.sort((a, b) => naturalCmp(a, b));
    compacted.push("");
    compacted.push(`${groupPath}/ (${groupPaths.length} path(s))`);
    const shown = compactSelection ? selectHeadTailToShow(sortedGroupPaths) : indexAll(sortedGroupPaths);
    let previousIndex;
    for (const { item: filePath, index } of shown) {
      if (previousIndex !== void 0 && index > previousIndex + 1) {
        compacted.push(`  ... ${index - previousIndex - 1} more path(s) in this group`);
      }
      compacted.push(`  ${displayPathInPathListGroup(filePath, groupPath)}`);
      previousIndex = index;
    }
    const omittedAfterLast = previousIndex !== void 0 ? saturatingSub(groupPaths.length, previousIndex + 1) : groupPaths.length;
    if (omittedAfterLast > 0) {
      compacted.push(`  ... ${omittedAfterLast} more path(s) in this group`);
    }
  }
  if (sortedGroups.length > maxGroups) {
    const omittedPaths = totalGroupItems(sortedGroups.slice(maxGroups));
    compacted.push("");
    compacted.push(`[omitted ${omittedPaths} path(s) in ${sortedGroups.length - maxGroups} smaller group(s)]`);
  }
  const extensionSummary = summarizeExtensions(paths);
  if (extensionSummary.length !== 0) {
    compacted.push("");
    compacted.push(`[extensions: ${extensionSummary}]`);
  }
  return compacted.join("\n");
}
function selectHeadTailToShow(items) {
  if (items.length <= 40) {
    return indexAll(items);
  }
  const indexes = [];
  for (let i = 0; i < 12; i++) {
    indexes.push(i);
  }
  for (let i = items.length - 12; i < items.length; i++) {
    indexes.push(i);
  }
  return indexes.map((index) => ({ index, item: items[index] }));
}
function renderBudgetedFlatPathList(paths, label, commonPrefix, largeOutputThreshold) {
  const sortedPaths = sortPathsForConcretePreview(paths);
  const extensionSummary = summarizeExtensions(paths);
  const budget = compactedBodyBudget(largeOutputThreshold);
  const selected = [];
  const lines = [`[${label}: ${paths.length} path(s)${commonPrefix.length === 0 ? "" : ` under ${truncatePathMiddle(commonPrefix, COMMON_PREFIX_DISPLAY_WIDTH)}`}; concrete paths]`];
  let selectedBytes = joinedLineBytes(lines);
  for (const filePath of sortedPaths) {
    let displayPath = displayPathUnderPrefix(filePath, commonPrefix);
    const suffixLines = pathListSuffixLines(selected.length + 1, paths.length, extensionSummary);
    const suffixBytes = joinedLineBytes(suffixLines);
    const separatorBytes = suffixBytes > 0 || lines.length !== 0 ? 1 : 0;
    const nextBytes = selectedBytes + 1 + byteLength(displayPath);
    if (nextBytes + separatorBytes + suffixBytes > budget) {
      if (selected.length !== 0) {
        break;
      }
      if (selectedBytes > budget) {
        break;
      }
      let available = budget - selectedBytes;
      if (separatorBytes > available) {
        break;
      }
      available -= separatorBytes;
      if (suffixBytes > available) {
        break;
      }
      available -= suffixBytes;
      if (available === 0) {
        break;
      }
      displayPath = truncatePathMiddle(displayPath, available);
      if (selectedBytes + 1 + byteLength(displayPath) + separatorBytes + suffixBytes > budget) {
        break;
      }
    }
    selectedBytes += 1 + byteLength(displayPath);
    selected.push(displayPath);
  }
  lines.push(...selected);
  lines.push(...pathListSuffixLines(selected.length, paths.length, extensionSummary));
  return lines.join("\n");
}
function pathListSuffixLines(selectedCount, pathCount, extensionSummary) {
  const lines = [];
  if (selectedCount < pathCount) {
    lines.push(`[omitted ${pathCount - selectedCount} path(s); see original output for full results]`);
  }
  if (extensionSummary.length !== 0) {
    lines.push(`[extensions: ${truncateInlineText(extensionSummary, EXTENSION_SUMMARY_INLINE_WIDTH)}]`);
  }
  return lines;
}
function sortPathsForConcretePreview(paths) {
  const extensionCounts = /* @__PURE__ */ new Map();
  for (const filePath of paths) {
    const extension = pathExtension(filePath);
    extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1);
  }
  const sorted = [...paths];
  sorted.sort((a, b) => {
    const countA = extensionCounts.get(pathExtension(a)) ?? 0;
    const countB = extensionCounts.get(pathExtension(b)) ?? 0;
    return countA - countB || naturalCmp(a, b);
  });
  return sorted;
}
function displayPathInPathListGroup(filePath, groupPath) {
  if (groupPath === ".") {
    return filePath;
  }
  const prefix = groupPath.endsWith("/") ? groupPath : `${groupPath}/`;
  return stripPrefix(filePath, prefix) ?? filePath;
}
function pathListGroupPath(filePath, commonPrefix) {
  const relative = commonPrefix.length === 0 ? filePath : trimStartMatchesChars(filePath.slice(commonPrefix.length), ["/"]);
  if (relative.length === 0 || !relative.includes("/")) {
    return joinDisplayPath(commonPrefix, ".");
  }
  const segments = trimStartMatchesChars(relative, ["/"]).split("/");
  const firstSegment = segments.length > 0 ? segments[0] : "";
  const segment = firstSegment.length === 0 ? "." : firstSegment;
  return joinDisplayPath(commonPrefix, segment);
}
function commonDirectoryPrefix(paths) {
  if (paths.length === 0) {
    return "";
  }
  const directories = paths.map((filePath) => {
    const index = filePath.lastIndexOf("/");
    return index > 0 ? filePath.slice(0, index) : "";
  });
  const firstParts = directories[0].split("/");
  let prefixLength = firstParts.length;
  for (const directory of directories.slice(1)) {
    const parts = directory.split("/");
    let i = 0;
    while (i < prefixLength && i < parts.length && firstParts[i] === parts[i]) {
      i += 1;
    }
    prefixLength = i;
  }
  return firstParts.slice(0, prefixLength).join("/");
}
function directoryOfPath(filePath) {
  const normalized = normalizeDisplayPathSeparators(filePath);
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : ".";
}
function splitToolOutputLines(output) {
  if (output.length === 0) {
    return [];
  }
  const pieces = [];
  let start = 0;
  for (let i = 0; i < output.length; i++) {
    if (output[i] === "\n") {
      pieces.push(output.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < output.length) {
    pieces.push(output.slice(start));
  }
  const result = [];
  for (const piece of pieces) {
    let line = piece;
    if (line.endsWith("\r\n")) {
      line = line.slice(0, line.length - 2);
    } else if (line.endsWith("\n")) {
      line = line.slice(0, line.length - 1);
    }
    if (line.length !== 0) {
      result.push(line);
    }
  }
  return result;
}
function joinDisplayPath(prefix, child) {
  if (prefix.length === 0 || child === ".") {
    return prefix.length === 0 ? child : prefix;
  }
  return `${prefix.replace(/\/+$/, "")}/${child}`;
}
function normalizeDisplayPathSeparators(filePath) {
  return filePath.replaceAll("\\", "/");
}
function displayPathUnderPrefix(filePath, commonPrefix) {
  const normalized = normalizeDisplayPathSeparators(filePath);
  if (commonPrefix.length === 0) {
    return normalized;
  }
  const relative = trimStartMatchesChars(normalized.slice(commonPrefix.length), ["/"]);
  return relative.length === 0 ? "." : relative;
}
function summarizeExtensions(paths) {
  const counts = [];
  for (const filePath of paths) {
    const extension = pathExtension(filePath);
    const existing = counts.find((candidate) => candidate.extension === extension);
    if (existing !== void 0) {
      existing.count += 1;
    } else {
      counts.push({ extension, count: 1 });
    }
  }
  counts.sort((a, b) => b.count - a.count);
  return counts.slice(0, 8).map((entry) => `${entry.extension}=${entry.count}`).join(", ");
}
function pathExtension(filePath) {
  const pathOnly = filePath.split("::")[0];
  const slashSegments = pathOnly.split("/");
  const basename = slashSegments[slashSegments.length - 1];
  const index = basename.lastIndexOf(".");
  if (index < 0) {
    return "[no extension]";
  }
  if (index === 0 || index === basename.length - 1) {
    return "[no extension]";
  }
  return basename.slice(index);
}
function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
export {
  classifyCommand,
  compact,
  compactShellOutput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL2NvbnNvbGVDb21wYWN0b3IvY29uc29sZUNvbXBhY3Rvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8vIFNoZWxsLW91dHB1dCBjb21wYWN0b3IuIENsYXNzaWZpZXMgc2hlbGwgY29tbWFuZHMgYW5kIHN0cmlwcyBub24tZGlhZ25vc3RpY1xuLy8gbm9pc2UgZnJvbSB0aGVpciBvdXRwdXQuIFRoaXMgaXMgYSBmYWl0aGZ1bCBUeXBlU2NyaXB0IHBvcnQgb2YgdGhlIG9yaWdpbmFsXG4vLyBSdXN0IGltcGxlbWVudGF0aW9uIChsaWIucnMsIHJlcG9ydC5ycywgc2hlbGxfb3V0cHV0X2NvbXBhY3Rvci5ycykuXG5cbi8vI3JlZ2lvbiBQdWJsaWMgQVBJIHR5cGVzXG5cbi8qKiBDaGFyYWN0ZXIgKFVURi0xNiBjb2RlIHVuaXRzKSwgYnl0ZSAoVVRGLTgpLCBhbmQgbGluZSBjb3VudHMgZm9yIG9uZSB0ZXh0LiAqL1xuZXhwb3J0IGludGVyZmFjZSBDb3VudHMge1xuXHQvKiogVVRGLTE2IGNvZGUgdW5pdHMsIG1hdGNoaW5nIEphdmFTY3JpcHQgYFN0cmluZy5sZW5ndGhgIHNlbWFudGljcy4gKi9cblx0cmVhZG9ubHkgY2hhcnM6IG51bWJlcjtcblx0LyoqIFVURi04IGJ5dGUgbGVuZ3RoLiAqL1xuXHRyZWFkb25seSBieXRlczogbnVtYmVyO1xuXHRyZWFkb25seSBsaW5lczogbnVtYmVyO1xufVxuXG4vKiogUGVyY2VudGFnZSBvZiBlYWNoIGNvdW50IHJlbW92ZWQgYnkgY29tcGFjdGlvbiAoMC0xMDApLiAqL1xuZXhwb3J0IGludGVyZmFjZSBSZWR1Y3Rpb24ge1xuXHRyZWFkb25seSBjaGFyc1BjdDogbnVtYmVyO1xuXHRyZWFkb25seSBieXRlc1BjdDogbnVtYmVyO1xuXHRyZWFkb25seSBsaW5lc1BjdDogbnVtYmVyO1xufVxuXG4vKiogSG93IGEgY29tbWFuZCBzdHJpbmcgd2FzIGNsYXNzaWZpZWQsIHdpdGhvdXQgcnVubmluZyBjb21wYWN0aW9uLiAqL1xuZXhwb3J0IGludGVyZmFjZSBDb21tYW5kQ2xhc3NpZmljYXRpb24ge1xuXHQvKiogQ29tcGFjdG9yIHRhZ3MgdGhhdCBtYXRjaGVkLCBlLmcuIGBbXCJucG1cIl1gLCBgW1wiY2FyZ29cIl1gLCBgW1wic2hlbGwtZ3JlcFwiXWAuICovXG5cdHJlYWRvbmx5IGNvbW1hbmRLaW5kczogc3RyaW5nW107XG5cdHJlYWRvbmx5IGlzU291cmNlUmVhZENvbW1hbmQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJ1bnNHb1Rlc3Q6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1lbnRpb25zU2F2ZWRUb29sT3V0cHV0OiBib29sZWFuO1xufVxuXG4vKipcbiAqIFRoZSBmdWxsIGNvbXBhY3Rpb24gcmVwb3J0OiBzdGF0aXN0aWNzIGFib3V0IHdoYXQgd2FzIHJlbW92ZWQsIHBsdXMgdGhlXG4gKiBjb21wYWN0ZWQgdGV4dCBpdHNlbGYuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgUmVwb3J0IHtcblx0cmVhZG9ubHkgY29tbWFuZDogc3RyaW5nO1xuXHQvKiogV2hldGhlciBjb21wYWN0aW9uIGFjdHVhbGx5IGNoYW5nZWQgdGhlIG91dHB1dC4gKi9cblx0cmVhZG9ubHkgYXBwbGllZDogYm9vbGVhbjtcblx0LyoqIFdoZXRoZXIgdGhlIGNvbXBhY3Rpb24gcHJlc2VydmVkIGFsbCBpbmZvcm1hdGlvbiAobm8gZGF0YSBkcm9wcGVkKS4gKi9cblx0cmVhZG9ubHkgbG9zc2xlc3M6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvbW1hbmRLaW5kczogc3RyaW5nW107XG5cdHJlYWRvbmx5IGlzU291cmNlUmVhZENvbW1hbmQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJ1bnNHb1Rlc3Q6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1lbnRpb25zU2F2ZWRUb29sT3V0cHV0OiBib29sZWFuO1xuXHRyZWFkb25seSBvcmlnaW5hbDogQ291bnRzO1xuXHRyZWFkb25seSBjb21wYWN0ZWQ6IENvdW50cztcblx0cmVhZG9ubHkgc2F2ZWQ6IENvdW50cztcblx0cmVhZG9ubHkgcmVkdWN0aW9uOiBSZWR1Y3Rpb247XG5cdC8qKiBUaGUgY29tcGFjdGVkIG91dHB1dCB0ZXh0LiBFcXVhbHMgdGhlIGlucHV0IGBvdXRwdXRgIHdoZW4gYGFwcGxpZWRgIGlzIGZhbHNlLiAqL1xuXHRyZWFkb25seSBjb21wYWN0ZWRPdXRwdXQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBUdW5pbmcga25vYnMgZm9yIGBjb21wYWN0YC4gRXZlcnkgZmllbGQgaXMgb3B0aW9uYWw7IG9taXR0ZWQgZmllbGRzIHVzZSB0aGVcbiAqIGRvY3VtZW50ZWQgZGVmYXVsdHMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ29tcGFjdE9wdGlvbnMge1xuXHQvKiogQnl0ZSB0aHJlc2hvbGQgYWJvdmUgd2hpY2ggb3V0cHV0IGlzIHRyZWF0ZWQgYXMgXCJsYXJnZVwiLiBEZWZhdWx0IDMwMDAwLiAqL1xuXHRyZWFkb25seSBsYXJnZU91dHB1dFRocmVzaG9sZD86IG51bWJlcjtcblx0LyoqIEJ5dGUgdGhyZXNob2xkIHVzZWQgc3BlY2lmaWNhbGx5IGZvciBzaGVsbCBgZ3JlcGAvYHJnYCBvdXRwdXQuIERlZmF1bHQgMzAwMDAuICovXG5cdHJlYWRvbmx5IHNoZWxsR3JlcExhcmdlT3V0cHV0VGhyZXNob2xkPzogbnVtYmVyO1xuXHQvKiogTWluaW11bSBzYXZlZCBjaGFycyAoVVRGLTE2IHVuaXRzKSBiZWZvcmUgY29tcGFjdGlvbiBpcyBhcHBsaWVkLiBEZWZhdWx0IDAuICovXG5cdHJlYWRvbmx5IG1pblNhdmVkQ2hhcnM/OiBudW1iZXI7XG59XG5cbi8vI2VuZHJlZ2lvblxuXG5jb25zdCBERUZBVUxUX0xBUkdFX09VVFBVVF9USFJFU0hPTEQgPSAzMF8wMDA7XG5jb25zdCBERUZBVUxUX1NIRUxMX0dSRVBfTEFSR0VfT1VUUFVUX1RIUkVTSE9MRCA9IDMwXzAwMDtcbmNvbnN0IERFRkFVTFRfTUlOX1NBVkVEX0NIQVJTID0gMDtcblxuLyoqXG4gKiBDb21wYWN0IHRoZSByYXcgb3V0cHV0IG9mIGEgc2hlbGwgY29tbWFuZCBhbmQgcmVwb3J0IGhvdyBtdWNoIHdhcyBzYXZlZC5cbiAqXG4gKiBDbGFzc2lmaWVzIGBjb21tYW5kYCwgY29tcGFjdHMgYG91dHB1dGAgYWNjb3JkaW5nbHksIGFuZCByZXR1cm5zIHRoZVxuICogc3RhdGlzdGljcyBwbHVzIHRoZSBjb21wYWN0ZWQgdGV4dC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXBhY3QoY29tbWFuZDogc3RyaW5nLCBvdXRwdXQ6IHN0cmluZywgb3B0aW9ucz86IENvbXBhY3RPcHRpb25zIHwgbnVsbCk6IFJlcG9ydCB7XG5cdGNvbnN0IG9wdHMgPSBvcHRpb25zID8/IHt9O1xuXHRjb25zdCBsYXJnZU91dHB1dFRocmVzaG9sZCA9IG9wdHMubGFyZ2VPdXRwdXRUaHJlc2hvbGQgPz8gREVGQVVMVF9MQVJHRV9PVVRQVVRfVEhSRVNIT0xEO1xuXHRjb25zdCBzaGVsbEdyZXBMYXJnZU91dHB1dFRocmVzaG9sZCA9IG9wdHMuc2hlbGxHcmVwTGFyZ2VPdXRwdXRUaHJlc2hvbGQgPz8gREVGQVVMVF9TSEVMTF9HUkVQX0xBUkdFX09VVFBVVF9USFJFU0hPTEQ7XG5cdGNvbnN0IG1pbmltdW1TYXZlZENoYXJzID0gb3B0cy5taW5TYXZlZENoYXJzID8/IERFRkFVTFRfTUlOX1NBVkVEX0NIQVJTO1xuXG5cdGNvbnN0IGNsYXNzaWZpY2F0aW9uID0gY2xhc3NpZnlDb21tYW5kUmVzdWx0KGNvbW1hbmQpO1xuXHRjb25zdCBwcmV2aWV3ID0gcHJldmlld1NoZWxsT3V0cHV0Q29tcGFjdGlvbihcblx0XHRjb21tYW5kLFxuXHRcdG91dHB1dCxcblx0XHRsYXJnZU91dHB1dFRocmVzaG9sZCxcblx0XHRzaGVsbEdyZXBMYXJnZU91dHB1dFRocmVzaG9sZCxcblx0XHRtaW5pbXVtU2F2ZWRDaGFycyxcblx0KTtcblx0cmV0dXJuIGJ1aWxkUmVwb3J0KGNvbW1hbmQsIGNsYXNzaWZpY2F0aW9uLCBvdXRwdXQsIHByZXZpZXcpO1xufVxuXG4vKiogQ2xhc3NpZnkgYSBzaGVsbCBjb21tYW5kIHdpdGhvdXQgY29tcGFjdGluZyBhbnkgb3V0cHV0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsYXNzaWZ5Q29tbWFuZChjb21tYW5kOiBzdHJpbmcpOiBDb21tYW5kQ2xhc3NpZmljYXRpb24ge1xuXHRjb25zdCByZXN1bHQgPSBjbGFzc2lmeUNvbW1hbmRSZXN1bHQoY29tbWFuZCk7XG5cdHJldHVybiB7XG5cdFx0Y29tbWFuZEtpbmRzOiByZXN1bHQuY29tbWFuZEtpbmRzLnNsaWNlKCksXG5cdFx0aXNTb3VyY2VSZWFkQ29tbWFuZDogcmVzdWx0LmlzU291cmNlUmVhZENvbW1hbmQsXG5cdFx0cnVuc0dvVGVzdDogcmVzdWx0LnJ1bnNHb1Rlc3QsXG5cdFx0bWVudGlvbnNTYXZlZFRvb2xPdXRwdXQ6IHJlc3VsdC5tZW50aW9uc1NhdmVkVG9vbE91dHB1dCxcblx0fTtcbn1cblxuLy8jcmVnaW9uIHJlcG9ydC5yc1xuXG5jb25zdCB0ZXh0RW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpO1xuXG5mdW5jdGlvbiBieXRlTGVuZ3RoKHZhbHVlOiBzdHJpbmcpOiBudW1iZXIge1xuXHRyZXR1cm4gdGV4dEVuY29kZXIuZW5jb2RlKHZhbHVlKS5sZW5ndGg7XG59XG5cbi8qKiBOdW1iZXIgb2YgbGluZXMgdXNpbmcgUnVzdCBgc3RyOjpsaW5lcygpYCBzZW1hbnRpY3MgKGVtcHR5IHN0cmluZyA9IDApLiAqL1xuZnVuY3Rpb24gY291bnRMaW5lcyh0ZXh0OiBzdHJpbmcpOiBudW1iZXIge1xuXHRpZiAodGV4dC5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gMDtcblx0fVxuXHRsZXQgY291bnQgPSB0ZXh0LnNwbGl0KCdcXG4nKS5sZW5ndGg7XG5cdGlmICh0ZXh0LmVuZHNXaXRoKCdcXG4nKSkge1xuXHRcdGNvdW50IC09IDE7XG5cdH1cblx0cmV0dXJuIGNvdW50O1xufVxuXG5mdW5jdGlvbiBjb3VudHNPZih0ZXh0OiBzdHJpbmcpOiBDb3VudHMge1xuXHRyZXR1cm4ge1xuXHRcdGNoYXJzOiB0ZXh0Lmxlbmd0aCxcblx0XHRieXRlczogYnl0ZUxlbmd0aCh0ZXh0KSxcblx0XHRsaW5lczogY291bnRMaW5lcyh0ZXh0KSxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWludXNDb3VudHMoc2VsZjogQ291bnRzLCBvdGhlcjogQ291bnRzKTogQ291bnRzIHtcblx0cmV0dXJuIHtcblx0XHRjaGFyczogc2F0dXJhdGluZ1N1YihzZWxmLmNoYXJzLCBvdGhlci5jaGFycyksXG5cdFx0Ynl0ZXM6IHNhdHVyYXRpbmdTdWIoc2VsZi5ieXRlcywgb3RoZXIuYnl0ZXMpLFxuXHRcdGxpbmVzOiBzYXR1cmF0aW5nU3ViKHNlbGYubGluZXMsIG90aGVyLmxpbmVzKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gcmVkdWN0aW9uT2Yoc2F2ZWQ6IENvdW50cywgb3JpZ2luYWw6IENvdW50cyk6IFJlZHVjdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0Y2hhcnNQY3Q6IHBjdChzYXZlZC5jaGFycywgb3JpZ2luYWwuY2hhcnMpLFxuXHRcdGJ5dGVzUGN0OiBwY3Qoc2F2ZWQuYnl0ZXMsIG9yaWdpbmFsLmJ5dGVzKSxcblx0XHRsaW5lc1BjdDogcGN0KHNhdmVkLmxpbmVzLCBvcmlnaW5hbC5saW5lcyksXG5cdH07XG59XG5cbmZ1bmN0aW9uIHBjdChwYXJ0OiBudW1iZXIsIHdob2xlOiBudW1iZXIpOiBudW1iZXIge1xuXHRpZiAod2hvbGUgPT09IDApIHtcblx0XHRyZXR1cm4gMDtcblx0fVxuXHRyZXR1cm4gKHBhcnQgLyB3aG9sZSkgKiAxMDA7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkUmVwb3J0KFxuXHRjb21tYW5kOiBzdHJpbmcsXG5cdGNsYXNzaWZpY2F0aW9uOiBDb21tYW5kQ2xhc3NpZmljYXRpb24sXG5cdG9yaWdpbmFsOiBzdHJpbmcsXG5cdHByZXZpZXc6IFNoZWxsT3V0cHV0UHJldmlld1Jlc3VsdCB8IHVuZGVmaW5lZCxcbik6IFJlcG9ydCB7XG5cdGNvbnN0IGNvbXBhY3RlZFRleHQgPSBwcmV2aWV3ID8gcHJldmlldy5vdXRwdXQgOiBvcmlnaW5hbDtcblxuXHRjb25zdCBvcmlnaW5hbENvdW50cyA9IGNvdW50c09mKG9yaWdpbmFsKTtcblx0Y29uc3QgY29tcGFjdGVkQ291bnRzID0gY291bnRzT2YoY29tcGFjdGVkVGV4dCk7XG5cdGNvbnN0IHNhdmVkID0gbWludXNDb3VudHMob3JpZ2luYWxDb3VudHMsIGNvbXBhY3RlZENvdW50cyk7XG5cdGNvbnN0IHJlZHVjdGlvbiA9IHJlZHVjdGlvbk9mKHNhdmVkLCBvcmlnaW5hbENvdW50cyk7XG5cblx0cmV0dXJuIHtcblx0XHRjb21tYW5kLFxuXHRcdGFwcGxpZWQ6IHByZXZpZXcgIT09IHVuZGVmaW5lZCxcblx0XHRsb3NzbGVzczogcHJldmlldyA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IHByZXZpZXcubG9zc2xlc3MsXG5cdFx0Y29tbWFuZEtpbmRzOiBjbGFzc2lmaWNhdGlvbi5jb21tYW5kS2luZHMuc2xpY2UoKSxcblx0XHRpc1NvdXJjZVJlYWRDb21tYW5kOiBjbGFzc2lmaWNhdGlvbi5pc1NvdXJjZVJlYWRDb21tYW5kLFxuXHRcdHJ1bnNHb1Rlc3Q6IGNsYXNzaWZpY2F0aW9uLnJ1bnNHb1Rlc3QsXG5cdFx0bWVudGlvbnNTYXZlZFRvb2xPdXRwdXQ6IGNsYXNzaWZpY2F0aW9uLm1lbnRpb25zU2F2ZWRUb29sT3V0cHV0LFxuXHRcdG9yaWdpbmFsOiBvcmlnaW5hbENvdW50cyxcblx0XHRjb21wYWN0ZWQ6IGNvbXBhY3RlZENvdW50cyxcblx0XHRzYXZlZCxcblx0XHRyZWR1Y3Rpb24sXG5cdFx0Y29tcGFjdGVkT3V0cHV0OiBjb21wYWN0ZWRUZXh0LFxuXHR9O1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHNoZWxsX291dHB1dF9jb21wYWN0b3IucnMgXHUyMDE0IGNvbnN0YW50cyBhbmQgdHlwZXNcblxuY29uc3QgQ09NUEFDVEVEX1JFRkVSRU5DRV9PVkVSSEVBRF9CVURHRVQgPSA1MTI7XG5jb25zdCBDT01NT05fUFJFRklYX0RJU1BMQVlfV0lEVEggPSAxMjA7XG5jb25zdCBFWFRFTlNJT05fU1VNTUFSWV9JTkxJTkVfV0lEVEggPSAxNjA7XG5jb25zdCBHT19SVU5USU1FX1BBTklDX01JTl9HT1JPVVRJTkVTID0gODtcbmNvbnN0IENBUkdPX1BST0dSRVNTX1BSRUZJWEVTOiByZWFkb25seSBzdHJpbmdbXSA9IFtcblx0J1VwZGF0aW5nICcsXG5cdCdEb3dubG9hZGluZyAnLFxuXHQnRG93bmxvYWRlZCAnLFxuXHQnQ29tcGlsaW5nICcsXG5cdCdDaGVja2luZyAnLFxuXHQnRnJlc2ggJyxcblx0J0xvY2tpbmcgJyxcblx0J0FkZGluZyAnLFxuXHQnQnVpbGRpbmcgJyxcbl07XG5jb25zdCBDT01NQU5EX0NPTVBBQ1RPUl9PUkRFUjogcmVhZG9ubHkgc3RyaW5nW10gPSBbXG5cdCdhcHQnLFxuXHQnbnBtJyxcblx0J25wbS1wYWNrJyxcblx0J3lhcm4tYmVycnknLFxuXHQncG5wbScsXG5cdCdjb21wb3NlcicsXG5cdCdwb2V0cnknLFxuXHQncGlwJyxcblx0J3V2Jyxcblx0J21hdmVuJyxcblx0J2RvdG5ldCcsXG5cdCdweXRob24tYnVpbGQnLFxuXHQnZ28nLFxuXHQndW5pdHRlc3QnLFxuXHQnanMtdGVzdCcsXG5cdCdjYXJnbycsXG5cdCdub2RlJyxcblx0J3B5dGVzdCcsXG5cdCdnaXQnLFxuXHQnZ2l0LWNsZWFuJyxcblx0J254Jyxcblx0J3B5dGhvbi1idWlsZC1leHQnLFxuXHQnZGphbmdvLXRlc3QnLFxuXHQnZ29sYW5nY2ktbGludCcsXG5cdCdjbGFuZy1mb3JtYXQtbGludGVyJyxcblx0J2dyYWRsZScsXG5cdCdjbWFrZScsXG5cdCdtYWtlJyxcblx0J3NoZWxsLWdyZXAnLFxuXHQncHl0aG9uLXNjcmlwdCcsXG5dO1xuXG50eXBlIFRvb2xPdXRwdXRDb21wYWN0aW9uS2luZCA9ICdncmVwLWNvbnRlbnQnIHwgJ2dyZXAtcGF0aHMnIHwgJ2dyZXAtY291bnQnIHwgJ2dsb2InO1xuXG5pbnRlcmZhY2UgVG9vbENvbXBhY3Rpb25SZXN1bHQge1xuXHRvdXRwdXQ6IHN0cmluZztcblx0bG9zc2xlc3M6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBDb21tYW5kQ2xhc3NpZmljYXRpb25SZXN1bHQge1xuXHRjb21tYW5kS2luZHM6IHN0cmluZ1tdO1xuXHRpc1NvdXJjZVJlYWRDb21tYW5kOiBib29sZWFuO1xuXHRydW5zR29UZXN0OiBib29sZWFuO1xuXHRtZW50aW9uc1NhdmVkVG9vbE91dHB1dDogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIFNoZWxsT3V0cHV0UHJldmlld1Jlc3VsdCB7XG5cdG91dHB1dDogc3RyaW5nO1xuXHRzYXZlZENoYXJzOiBudW1iZXI7XG5cdGxvc3NsZXNzOiBib29sZWFuO1xufVxuXG4vKiogRGlzY3JpbWluYXRlZCB1bmlvbiBtaXJyb3JpbmcgUnVzdCBgQ2xhc3NpZmllZENvbW1hbmRTZWdtZW50YC4gKi9cbnR5cGUgQ2xhc3NpZmllZENvbW1hbmRTZWdtZW50ID0geyByZWFkb25seSBiZW5pZ246IHRydWUgfSB8IHsgcmVhZG9ubHkgYmVuaWduOiBmYWxzZTsgcmVhZG9ubHkga2luZDogc3RyaW5nIH07XG5cbmNvbnN0IEJFTklHTl9TRUdNRU5UOiBDbGFzc2lmaWVkQ29tbWFuZFNlZ21lbnQgPSB7IGJlbmlnbjogdHJ1ZSB9O1xuXG5mdW5jdGlvbiBjb21wYWN0U2VnbWVudChraW5kOiBzdHJpbmcpOiBDbGFzc2lmaWVkQ29tbWFuZFNlZ21lbnQge1xuXHRyZXR1cm4geyBiZW5pZ246IGZhbHNlLCBraW5kIH07XG59XG5cbmZ1bmN0aW9uIHNlZ21lbnRzRXF1YWwoYTogQ2xhc3NpZmllZENvbW1hbmRTZWdtZW50LCBiOiBDbGFzc2lmaWVkQ29tbWFuZFNlZ21lbnQpOiBib29sZWFuIHtcblx0aWYgKGEuYmVuaWduIHx8IGIuYmVuaWduKSB7XG5cdFx0cmV0dXJuIGEuYmVuaWduID09PSBiLmJlbmlnbjtcblx0fVxuXHRyZXR1cm4gYS5raW5kID09PSBiLmtpbmQ7XG59XG5cbmludGVyZmFjZSBIZXJlZG9jU3RyaXBwZWRDb21tYW5kIHtcblx0Y29tbWFuZDogc3RyaW5nO1xuXHRoZXJlZG9jU3RkaW5TZWdtZW50SW5kZXhlczogU2V0PG51bWJlcj47XG59XG5cbmludGVyZmFjZSBIZXJlZG9jT3BlbmVyIHtcblx0cHJlZml4OiBzdHJpbmc7XG5cdHN1ZmZpeDogc3RyaW5nO1xuXHRkZWxpbWl0ZXI6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEluZGV4ZWQ8VD4ge1xuXHRpbmRleDogbnVtYmVyO1xuXHRpdGVtOiBUO1xufVxuXG5pbnRlcmZhY2UgUGFja2FnZU1hbmFnZXJPcGVyYXRpb24ge1xuXHRvcGVyYXRpb246IHN0cmluZztcblx0cGtnOiBzdHJpbmc7XG5cdHZlcnNpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBQcmltaXRpdmUgaGVscGVyc1xuXG4vKiogTGVuZ3RoIGluIFVURi0xNiBjb2RlIHVuaXRzLCBtYXRjaGluZyBKYXZhU2NyaXB0IGBTdHJpbmcubGVuZ3RoYC4gKi9cbmZ1bmN0aW9uIGpzU3RyaW5nTGVuKHZhbHVlOiBzdHJpbmcpOiBudW1iZXIge1xuXHRyZXR1cm4gdmFsdWUubGVuZ3RoO1xufVxuXG4vKipcbiAqIFNsaWNlIGJ5IFVURi0xNiBjb2RlIHVuaXRzIChKYXZhU2NyaXB0IG5hdGl2ZSBzdHJpbmcgc2VtYW50aWNzKS4gTWlycm9ycyB0aGVcbiAqIFJ1c3QgYHNsaWNlX2pzX3VuaXRzYCBoZWxwZXIsIHdoaWNoIGVtdWxhdGVkIEpTIHNsaWNpbmcuXG4gKi9cbmZ1bmN0aW9uIHNsaWNlSnNVbml0cyh0ZXh0OiBzdHJpbmcsIHN0YXJ0OiBudW1iZXIsIGxlbjogbnVtYmVyKTogc3RyaW5nIHtcblx0aWYgKGxlbiA9PT0gMCkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRyZXR1cm4gdGV4dC5zbGljZShzdGFydCwgc3RhcnQgKyBsZW4pO1xufVxuXG4vKiogUnVzdCBgc3RyOjpzcGxpdF93aGl0ZXNwYWNlYDogc3BsaXQgb24gcnVucyBvZiB3aGl0ZXNwYWNlLCBkcm9wcGluZyBlbXB0aWVzLiAqL1xuZnVuY3Rpb24gc3BsaXRXaGl0ZXNwYWNlKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IHRyaW1tZWQgPSB2YWx1ZS50cmltKCk7XG5cdHJldHVybiB0cmltbWVkLmxlbmd0aCA9PT0gMCA/IFtdIDogdHJpbW1lZC5zcGxpdCgvXFxzKy8pO1xufVxuXG5mdW5jdGlvbiBzYXR1cmF0aW5nU3ViKGE6IG51bWJlciwgYjogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIGEgPiBiID8gYSAtIGIgOiAwO1xufVxuXG4vKiogQ29tcGFyZSB0d28gZXF1YWwtbGVuZ3RoIHdpbmRvd3Mgb2YgYW4gYXJyYXkgZm9yIGVsZW1lbnQgZXF1YWxpdHkuICovXG5mdW5jdGlvbiBhcnJheVNsaWNlRXF1YWwoYXJyOiBzdHJpbmdbXSwgYVN0YXJ0OiBudW1iZXIsIGJTdGFydDogbnVtYmVyLCBsZW46IG51bWJlcik6IGJvb2xlYW4ge1xuXHRmb3IgKGxldCBrID0gMDsgayA8IGxlbjsgaysrKSB7XG5cdFx0aWYgKGFyclthU3RhcnQgKyBrXSAhPT0gYXJyW2JTdGFydCArIGtdKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc0FzY2lpRGlnaXQoY2g6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gY2ggPj0gJzAnICYmIGNoIDw9ICc5Jztcbn1cblxuZnVuY3Rpb24gaXNBc2NpaUFscGhhYmV0aWMoY2g6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKGNoID49ICdBJyAmJiBjaCA8PSAnWicpIHx8IChjaCA+PSAnYScgJiYgY2ggPD0gJ3onKTtcbn1cblxuLyoqIFJlbW92ZSBhbGwgbGVhZGluZyBjaGFyYWN0ZXJzIHRoYXQgYXBwZWFyIGluIGBjaGFyc2AuICovXG5mdW5jdGlvbiB0cmltU3RhcnRNYXRjaGVzQ2hhcnModmFsdWU6IHN0cmluZywgY2hhcnM6IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IHZhbHVlLmxlbmd0aCAmJiBjaGFycy5pbmNsdWRlcyh2YWx1ZVtpXSkpIHtcblx0XHRpICs9IDE7XG5cdH1cblx0cmV0dXJuIHZhbHVlLnNsaWNlKGkpO1xufVxuXG5mdW5jdGlvbiByZWdleFJlcGxhY2VBbGwocGF0dGVybjogc3RyaW5nLCBpbnB1dDogc3RyaW5nLCByZXBsYWNlbWVudDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGlucHV0LnJlcGxhY2UobmV3IFJlZ0V4cChwYXR0ZXJuLCAnZycpLCByZXBsYWNlbWVudCk7XG59XG5cbmZ1bmN0aW9uIHJlZ2V4VGVzdChwYXR0ZXJuOiBzdHJpbmcsIGlucHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdFdpdGhGbGFncyhwYXR0ZXJuLCBpbnB1dCwgJycpO1xufVxuXG5mdW5jdGlvbiByZWdleFRlc3RXaXRoRmxhZ3MocGF0dGVybjogc3RyaW5nLCBpbnB1dDogc3RyaW5nLCBmbGFnczogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBuZXcgUmVnRXhwKHBhdHRlcm4sIGZsYWdzKS50ZXN0KGlucHV0KTtcbn1cblxuZnVuY3Rpb24gcmVnZXhGaW5kKHBhdHRlcm46IHN0cmluZywgaW5wdXQ6IHN0cmluZyk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1hdGNoID0gbmV3IFJlZ0V4cChwYXR0ZXJuKS5leGVjKGlucHV0KTtcblx0cmV0dXJuIG1hdGNoID8gbWF0Y2guaW5kZXggOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHJlZ2V4Q2FwdHVyZUZpcnN0KHBhdHRlcm46IHN0cmluZywgaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1hdGNoID0gbmV3IFJlZ0V4cChwYXR0ZXJuKS5leGVjKGlucHV0KTtcblx0aWYgKG1hdGNoICYmIG1hdGNoWzFdICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gbWF0Y2hbMV07XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqIFJ1c3QgYFJlZ2V4OjpmaW5kX2l0ZXJgOiByZXR1cm5zIHRoZSBjb2RlLXVuaXQgcmFuZ2VzIG9mIGV2ZXJ5IG5vbi1vdmVybGFwcGluZyBtYXRjaC4gKi9cbmZ1bmN0aW9uIHJlZ2V4RmluZEFsbChwYXR0ZXJuOiBzdHJpbmcsIGlucHV0OiBzdHJpbmcpOiB7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH1bXSB7XG5cdGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXR0ZXJuLCAnZycpO1xuXHRjb25zdCBtYXRjaGVzOiB7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH1bXSA9IFtdO1xuXHRsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdHdoaWxlICgobWF0Y2ggPSByZWdleC5leGVjKGlucHV0KSkgIT09IG51bGwpIHtcblx0XHRtYXRjaGVzLnB1c2goeyBzdGFydDogbWF0Y2guaW5kZXgsIGVuZDogbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGggfSk7XG5cdFx0aWYgKG1hdGNoWzBdLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmVnZXgubGFzdEluZGV4ICs9IDE7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBtYXRjaGVzO1xufVxuXG5mdW5jdGlvbiB1bmNoYW5nZWQob3V0cHV0OiBzdHJpbmcpOiBUb29sQ29tcGFjdGlvblJlc3VsdCB7XG5cdHJldHVybiB7IG91dHB1dCwgbG9zc2xlc3M6IHRydWUgfTtcbn1cblxuZnVuY3Rpb24gbG9zc3kob3V0cHV0OiBzdHJpbmcpOiBUb29sQ29tcGFjdGlvblJlc3VsdCB7XG5cdHJldHVybiB7IG91dHB1dCwgbG9zc2xlc3M6IGZhbHNlIH07XG59XG5cbmZ1bmN0aW9uIGluZGV4QWxsPFQ+KGl0ZW1zOiByZWFkb25seSBUW10pOiBJbmRleGVkPFQ+W10ge1xuXHRyZXR1cm4gaXRlbXMubWFwKChpdGVtLCBpbmRleCkgPT4gKHsgaW5kZXgsIGl0ZW0gfSkpO1xufVxuXG5mdW5jdGlvbiBqb2luZWRMaW5lQnl0ZXMobGluZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogbnVtYmVyIHtcblx0bGV0IHRvdGFsID0gMDtcblx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0dG90YWwgKz0gYnl0ZUxlbmd0aChsaW5lKTtcblx0fVxuXHRyZXR1cm4gdG90YWwgKyBzYXR1cmF0aW5nU3ViKGxpbmVzLmxlbmd0aCwgMSk7XG59XG5cbmZ1bmN0aW9uIHNob3VsZFNraXBUb29sT3V0cHV0Q29tcGFjdGlvbihsaW5lczogcmVhZG9ubHkgc3RyaW5nW10sIG91dHB1dDogc3RyaW5nLCBtaW5MaW5lczogbnVtYmVyKTogYm9vbGVhbiB7XG5cdHJldHVybiBsaW5lcy5sZW5ndGggPCBtaW5MaW5lc1xuXHRcdHx8IGxpbmVzLmxlbmd0aCA+IDIwMF8wMDBcblx0XHR8fCBqc1N0cmluZ0xlbihvdXRwdXQpIDwgMTUwMFxuXHRcdHx8IGxpbmVzLnNvbWUobGluZSA9PiBsaW5lLnN0YXJ0c1dpdGgoJ0Vycm9yOicpIHx8IGxpbmUuc3RhcnRzV2l0aCgncmc6ICcpIHx8IGxpbmUuc3RhcnRzV2l0aCgnZ3JlcDogJykpO1xufVxuXG5mdW5jdGlvbiBmaXRzTGFyZ2VPdXRwdXRUaHJlc2hvbGQob3V0cHV0OiBzdHJpbmcsIGxhcmdlT3V0cHV0VGhyZXNob2xkOiBudW1iZXIpOiBib29sZWFuIHtcblx0cmV0dXJuIGJ5dGVMZW5ndGgob3V0cHV0KSA8PSBsYXJnZU91dHB1dFRocmVzaG9sZDtcbn1cblxuZnVuY3Rpb24gY29tcGFjdGVkQm9keUJ1ZGdldChsYXJnZU91dHB1dFRocmVzaG9sZDogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIE1hdGgubWF4KDI1Niwgc2F0dXJhdGluZ1N1YihsYXJnZU91dHB1dFRocmVzaG9sZCwgQ09NUEFDVEVEX1JFRkVSRU5DRV9PVkVSSEVBRF9CVURHRVQpKTtcbn1cblxuZnVuY3Rpb24gdG90YWxHcm91cEl0ZW1zPFQ+KGdyb3VwczogUmVhZG9ubHlBcnJheTxyZWFkb25seSBbc3RyaW5nLCBUW11dPik6IG51bWJlciB7XG5cdGxldCB0b3RhbCA9IDA7XG5cdGZvciAoY29uc3QgWywgaXRlbXNdIG9mIGdyb3Vwcykge1xuXHRcdHRvdGFsICs9IGl0ZW1zLmxlbmd0aDtcblx0fVxuXHRyZXR1cm4gdG90YWw7XG59XG5cbmZ1bmN0aW9uIHRydW5jYXRlSW5saW5lVGV4dCh0ZXh0OiBzdHJpbmcsIG1heExlbmd0aDogbnVtYmVyKTogc3RyaW5nIHtcblx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUlubGluZVdoaXRlc3BhY2UodGV4dCk7XG5cdGNvbnN0IG5vcm1hbGl6ZWRMZW4gPSBqc1N0cmluZ0xlbihub3JtYWxpemVkKTtcblx0aWYgKG5vcm1hbGl6ZWRMZW4gPD0gbWF4TGVuZ3RoKSB7XG5cdFx0cmV0dXJuIG5vcm1hbGl6ZWQ7XG5cdH1cblx0Y29uc3Qgc3VmZml4ID0gYC4uLiBbKyR7bm9ybWFsaXplZExlbiAtIG1heExlbmd0aH0gY2hhcnNdYDtcblx0cmV0dXJuIGAke3NsaWNlSnNVbml0cyhub3JtYWxpemVkLCAwLCBzYXR1cmF0aW5nU3ViKG1heExlbmd0aCwgc3VmZml4Lmxlbmd0aCkpfSR7c3VmZml4fWA7XG59XG5cbmZ1bmN0aW9uIGV4Y2VycHRJbmxpbmVUZXh0KHRleHQ6IHN0cmluZywgbWF4TGVuZ3RoOiBudW1iZXIpOiBzdHJpbmcge1xuXHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplSW5saW5lV2hpdGVzcGFjZSh0ZXh0KTtcblx0Y29uc3Qgbm9ybWFsaXplZExlbiA9IGpzU3RyaW5nTGVuKG5vcm1hbGl6ZWQpO1xuXHRpZiAobm9ybWFsaXplZExlbiA8PSBtYXhMZW5ndGgpIHtcblx0XHRyZXR1cm4gbm9ybWFsaXplZDtcblx0fVxuXHRjb25zdCBtYXJrZXJJbmRleCA9IGhpZ2hTaWduYWxUZXh0SW5kZXgobm9ybWFsaXplZCk7XG5cdGlmIChtYXJrZXJJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGV4Y2VycHRBcm91bmRJbmRleChub3JtYWxpemVkLCBtYXhMZW5ndGgsIG1hcmtlckluZGV4KTtcblx0fVxuXHRjb25zdCBzZXBhcmF0b3IgPSBgIC4uLiBbKyR7bm9ybWFsaXplZExlbiAtIG1heExlbmd0aH0gY2hhcnNdIC4uLiBgO1xuXHRjb25zdCBhdmFpbGFibGUgPSBzYXR1cmF0aW5nU3ViKG1heExlbmd0aCwgc2VwYXJhdG9yLmxlbmd0aCk7XG5cdGNvbnN0IGhlYWRMZW5ndGggPSBNYXRoLmNlaWwoYXZhaWxhYmxlIC8gMik7XG5cdGNvbnN0IHRhaWxMZW5ndGggPSBNYXRoLmZsb29yKGF2YWlsYWJsZSAvIDIpO1xuXHRyZXR1cm4gYCR7c2xpY2VKc1VuaXRzKG5vcm1hbGl6ZWQsIDAsIGhlYWRMZW5ndGgpfSR7c2VwYXJhdG9yfSR7c2xpY2VKc1VuaXRzKG5vcm1hbGl6ZWQsIHNhdHVyYXRpbmdTdWIobm9ybWFsaXplZExlbiwgdGFpbExlbmd0aCksIHRhaWxMZW5ndGgpfWA7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZUlubGluZVdoaXRlc3BhY2UodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIHNwbGl0V2hpdGVzcGFjZSh0ZXh0KS5qb2luKCcgJyk7XG59XG5cbmZ1bmN0aW9uIGhpZ2hTaWduYWxUZXh0SW5kZXgodGV4dDogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHJlZ2V4RmluZChcblx0XHRTdHJpbmcucmF3YFxcYig/OkhGX1RPS0VOfEFXU19BQ0NFU1NfS0VZX0lEfEFXU19TRUNSRVRfQUNDRVNTX0tFWXxTRUNSRVR8VE9LRU58RklOQUxfRVhJVHxSRVNVTFR8QkVTVHxBY2N1cmFjeXxNb2RlbCBzaXplfEFzc2VydGlvbkVycm9yfEZBSUx8RVJST1J8UmFuaylcXGJ8aGZfW0EtWmEtejAtOV9dK3x1PWExW0EtWmEtejAtOV8tXSt8aHR0cHM/Oi8vYCxcblx0XHR0ZXh0LFxuXHQpO1xufVxuXG5mdW5jdGlvbiBleGNlcnB0QXJvdW5kSW5kZXgodGV4dDogc3RyaW5nLCBtYXhMZW5ndGg6IG51bWJlciwgaW5kZXg6IG51bWJlcik6IHN0cmluZyB7XG5cdGNvbnN0IHByZWZpeCA9IGluZGV4ID4gMCA/ICcuLi4gJyA6ICcnO1xuXHRjb25zdCB0ZXh0TGVuID0ganNTdHJpbmdMZW4odGV4dCk7XG5cdC8vIGBpbmRleGAgaXMgYSBVVEYtMTYgb2Zmc2V0IChKUyByZWdleCBtYXRjaCBpbmRleCksIHdoaWNoIGVxdWFscyB0aGUgUnVzdFxuXHQvLyBganNfc3RyaW5nX2xlbigmdGV4dFsuLmJ5dGVfaW5kZXhdKWAgdmFsdWUuXG5cdGNvbnN0IGluZGV4VW5pdHMgPSBpbmRleDtcblx0Y29uc3Qgc3VmZml4ID0gaW5kZXhVbml0cyArIG1heExlbmd0aCA8IHRleHRMZW4gPyAnIC4uLicgOiAnJztcblx0Y29uc3QgYXZhaWxhYmxlID0gc2F0dXJhdGluZ1N1YihtYXhMZW5ndGgsIHByZWZpeC5sZW5ndGggKyBzdWZmaXgubGVuZ3RoKTtcblx0Y29uc3Qgc3RhcnQgPSBNYXRoLm1pbihzYXR1cmF0aW5nU3ViKGluZGV4VW5pdHMsIE1hdGguZmxvb3IoYXZhaWxhYmxlIC8gMikpLCBzYXR1cmF0aW5nU3ViKHRleHRMZW4sIGF2YWlsYWJsZSkpO1xuXHRyZXR1cm4gYCR7cHJlZml4fSR7c2xpY2VKc1VuaXRzKHRleHQsIHN0YXJ0LCBhdmFpbGFibGUpfSR7c3VmZml4fWA7XG59XG5cbmZ1bmN0aW9uIHRydW5jYXRlUGF0aE1pZGRsZShpbnB1dFBhdGg6IHN0cmluZywgbWF4TGVuZ3RoOiBudW1iZXIpOiBzdHJpbmcge1xuXHRpZiAoanNTdHJpbmdMZW4oaW5wdXRQYXRoKSA8PSBtYXhMZW5ndGgpIHtcblx0XHRyZXR1cm4gaW5wdXRQYXRoO1xuXHR9XG5cblx0Y29uc3QgZWxsaXBzaXMgPSAnLi4uJztcblx0Y29uc3QgbWluVHJ1bmNhdGVXaXRoRWxsaXBzaXNMZW5ndGggPSBlbGxpcHNpcy5sZW5ndGggKyAyO1xuXHRjb25zdCBtaW5NaWRkbGVUcnVuY2F0ZUxlbmd0aCA9IG1pblRydW5jYXRlV2l0aEVsbGlwc2lzTGVuZ3RoICogMjtcblxuXHRpZiAobWF4TGVuZ3RoIDw9IG1pblRydW5jYXRlV2l0aEVsbGlwc2lzTGVuZ3RoKSB7XG5cdFx0cmV0dXJuIHNsaWNlSnNVbml0cyhpbnB1dFBhdGgsIDAsIG1heExlbmd0aCk7XG5cdH1cblxuXHRpZiAobWF4TGVuZ3RoIDwgbWluTWlkZGxlVHJ1bmNhdGVMZW5ndGgpIHtcblx0XHRyZXR1cm4gYCR7c2xpY2VKc1VuaXRzKGlucHV0UGF0aCwgMCwgbWF4TGVuZ3RoIC0gZWxsaXBzaXMubGVuZ3RoKX0ke2VsbGlwc2lzfWA7XG5cdH1cblxuXHRjb25zdCBzZXBhcmF0b3IgPSBpbnB1dFBhdGguaW5jbHVkZXMoJ1xcXFwnKSAmJiAhaW5wdXRQYXRoLmluY2x1ZGVzKCcvJykgPyAnXFxcXCcgOiAnLyc7XG5cdGNvbnN0IFtyb290LCBzZWdtZW50c10gPSBnZXRQYXRoUGFydHNGb3JNaWRkbGVUcnVuY2F0aW9uKGlucHV0UGF0aCwgc2VwYXJhdG9yKTtcblx0Y29uc3QgbWluU2VnbWVudHNGb3JNaWRkbGVUcnVuY2F0aW9uID0gcm9vdC5sZW5ndGggPT09IDAgPyAzIDogMjtcblx0aWYgKHNlZ21lbnRzLmxlbmd0aCA8IG1pblNlZ21lbnRzRm9yTWlkZGxlVHJ1bmNhdGlvbikge1xuXHRcdHJldHVybiBgJHtzbGljZUpzVW5pdHMoaW5wdXRQYXRoLCAwLCBtYXhMZW5ndGggLSBlbGxpcHNpcy5sZW5ndGgpfSR7ZWxsaXBzaXN9YDtcblx0fVxuXG5cdGNvbnN0IGxhc3RTZWdtZW50ID0gc2VnbWVudHMubGVuZ3RoID4gMCA/IHNlZ21lbnRzW3NlZ21lbnRzLmxlbmd0aCAtIDFdIDogJyc7XG5cdGNvbnN0IHByZXNlcnZlZFNlZ21lbnRDb3VudCA9IHJvb3QubGVuZ3RoID09PSAwID8gMSA6IDA7XG5cdGNvbnN0IG1pblJlc3VsdCA9IHJvb3QubGVuZ3RoID09PSAwXG5cdFx0PyBgJHtzZWdtZW50c1swXX0ke3NlcGFyYXRvcn0ke2VsbGlwc2lzfSR7c2VwYXJhdG9yfSR7bGFzdFNlZ21lbnR9YFxuXHRcdDogYCR7cm9vdH0ke2VsbGlwc2lzfSR7c2VwYXJhdG9yfSR7bGFzdFNlZ21lbnR9YDtcblxuXHRpZiAoanNTdHJpbmdMZW4obWluUmVzdWx0KSA+IG1heExlbmd0aCkge1xuXHRcdHJldHVybiBgJHtzbGljZUpzVW5pdHMoaW5wdXRQYXRoLCAwLCBtYXhMZW5ndGggLSBlbGxpcHNpcy5sZW5ndGgpfSR7ZWxsaXBzaXN9YDtcblx0fVxuXG5cdGxldCByZXN1bHQgPSBtaW5SZXN1bHQ7XG5cdGNvbnN0IG1pZGRsZVNlZ21lbnRzID0gc2VnbWVudHMuc2xpY2UocHJlc2VydmVkU2VnbWVudENvdW50LCBzZWdtZW50cy5sZW5ndGggLSAxKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtaWRkbGVTZWdtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IHByZXNlcnZlZFNlZ21lbnRzID0gc2VnbWVudHMuc2xpY2UoMCwgcHJlc2VydmVkU2VnbWVudENvdW50ICsgaSArIDEpO1xuXHRcdGNvbnN0IHByZWZpeCA9IHJvb3QubGVuZ3RoID09PSAwXG5cdFx0XHQ/IHByZXNlcnZlZFNlZ21lbnRzLmpvaW4oc2VwYXJhdG9yKVxuXHRcdFx0OiBgJHtyb290fSR7cHJlc2VydmVkU2VnbWVudHMuam9pbihzZXBhcmF0b3IpfWA7XG5cdFx0Y29uc3QgY2FuZGlkYXRlID0gYCR7cHJlZml4fSR7c2VwYXJhdG9yfSR7ZWxsaXBzaXN9JHtzZXBhcmF0b3J9JHtsYXN0U2VnbWVudH1gO1xuXHRcdGlmIChqc1N0cmluZ0xlbihjYW5kaWRhdGUpIDw9IG1heExlbmd0aCkge1xuXHRcdFx0cmVzdWx0ID0gY2FuZGlkYXRlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBnZXRQYXRoUGFydHNGb3JNaWRkbGVUcnVuY2F0aW9uKGlucHV0UGF0aDogc3RyaW5nLCBzZXBhcmF0b3I6IHN0cmluZyk6IFtzdHJpbmcsIHN0cmluZ1tdXSB7XG5cdGlmIChpbnB1dFBhdGgubGVuZ3RoID49IDIgJiYgaXNBc2NpaUFscGhhYmV0aWMoaW5wdXRQYXRoWzBdKSAmJiBpbnB1dFBhdGhbMV0gPT09ICc6Jykge1xuXHRcdGxldCBlbmQgPSAyO1xuXHRcdHdoaWxlIChlbmQgPCBpbnB1dFBhdGgubGVuZ3RoICYmIChpbnB1dFBhdGhbZW5kXSA9PT0gJy8nIHx8IGlucHV0UGF0aFtlbmRdID09PSAnXFxcXCcpKSB7XG5cdFx0XHRlbmQgKz0gMTtcblx0XHR9XG5cdFx0Y29uc3Qgcm9vdCA9IGVuZCA+IDIgPyBgJHtpbnB1dFBhdGguc2xpY2UoMCwgMil9JHtzZXBhcmF0b3J9YCA6IGlucHV0UGF0aC5zbGljZSgwLCAyKTtcblx0XHRyZXR1cm4gW3Jvb3QsIHNwbGl0UGF0aFNlZ21lbnRzKGlucHV0UGF0aC5zbGljZShlbmQpKV07XG5cdH1cblxuXHRpZiAoaW5wdXRQYXRoLnN0YXJ0c1dpdGgoJ1xcXFxcXFxcJykgfHwgaW5wdXRQYXRoLnN0YXJ0c1dpdGgoJy8vJykpIHtcblx0XHRjb25zdCB1bmNTZWdtZW50cyA9IHNwbGl0UGF0aFNlZ21lbnRzKHRyaW1TdGFydE1hdGNoZXNDaGFycyhpbnB1dFBhdGgsIFsnXFxcXCcsICcvJ10pKTtcblx0XHRpZiAodW5jU2VnbWVudHMubGVuZ3RoID49IDIpIHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdGAke3NlcGFyYXRvcn0ke3NlcGFyYXRvcn0ke3VuY1NlZ21lbnRzWzBdfSR7c2VwYXJhdG9yfSR7dW5jU2VnbWVudHNbMV19JHtzZXBhcmF0b3J9YCxcblx0XHRcdFx0dW5jU2VnbWVudHMuc2xpY2UoMiksXG5cdFx0XHRdO1xuXHRcdH1cblx0fVxuXG5cdGlmIChpbnB1dFBhdGguc3RhcnRzV2l0aCgnXFxcXCcpIHx8IGlucHV0UGF0aC5zdGFydHNXaXRoKCcvJykpIHtcblx0XHRyZXR1cm4gW3NlcGFyYXRvciwgc3BsaXRQYXRoU2VnbWVudHModHJpbVN0YXJ0TWF0Y2hlc0NoYXJzKGlucHV0UGF0aCwgWydcXFxcJywgJy8nXSkpXTtcblx0fVxuXHRyZXR1cm4gWycnLCBzcGxpdFBhdGhTZWdtZW50cyhpbnB1dFBhdGgpXTtcbn1cblxuZnVuY3Rpb24gc3BsaXRQYXRoU2VnbWVudHMoaW5wdXRQYXRoOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdHJldHVybiBpbnB1dFBhdGguc3BsaXQoL1tcXFxcL10vKS5maWx0ZXIocGFydCA9PiBwYXJ0Lmxlbmd0aCA+IDApO1xufVxuXG5mdW5jdGlvbiBuYXR1cmFsQ21wKGE6IHN0cmluZywgYjogc3RyaW5nKTogbnVtYmVyIHtcblx0Y29uc3QgYUNoYXJzID0gQXJyYXkuZnJvbShhKTtcblx0Y29uc3QgYkNoYXJzID0gQXJyYXkuZnJvbShiKTtcblx0bGV0IGFpID0gMDtcblx0bGV0IGJpID0gMDtcblx0Zm9yICg7IDspIHtcblx0XHRjb25zdCBhYyA9IGFpIDwgYUNoYXJzLmxlbmd0aCA/IGFDaGFyc1thaV0gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYmMgPSBiaSA8IGJDaGFycy5sZW5ndGggPyBiQ2hhcnNbYmldIDogdW5kZWZpbmVkO1xuXHRcdGlmIChhYyA9PT0gdW5kZWZpbmVkICYmIGJjID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRpZiAoYWMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRpZiAoYmMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHRcdGlmIChpc0FzY2lpRGlnaXQoYWMpICYmIGlzQXNjaWlEaWdpdChiYykpIHtcblx0XHRcdGxldCBhTnVtYmVyID0gJyc7XG5cdFx0XHR3aGlsZSAoYWkgPCBhQ2hhcnMubGVuZ3RoICYmIGlzQXNjaWlEaWdpdChhQ2hhcnNbYWldKSkge1xuXHRcdFx0XHRhTnVtYmVyICs9IGFDaGFyc1thaV07XG5cdFx0XHRcdGFpICs9IDE7XG5cdFx0XHR9XG5cdFx0XHRsZXQgYk51bWJlciA9ICcnO1xuXHRcdFx0d2hpbGUgKGJpIDwgYkNoYXJzLmxlbmd0aCAmJiBpc0FzY2lpRGlnaXQoYkNoYXJzW2JpXSkpIHtcblx0XHRcdFx0Yk51bWJlciArPSBiQ2hhcnNbYmldO1xuXHRcdFx0XHRiaSArPSAxO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYVRyaW1tZWQgPSBhTnVtYmVyLnJlcGxhY2UoL14wKy8sICcnKTtcblx0XHRcdGNvbnN0IGJUcmltbWVkID0gYk51bWJlci5yZXBsYWNlKC9eMCsvLCAnJyk7XG5cdFx0XHRsZXQgb3JkID0gY29tcGFyZU51bWJlcihhVHJpbW1lZC5sZW5ndGgsIGJUcmltbWVkLmxlbmd0aCk7XG5cdFx0XHRpZiAob3JkID09PSAwKSB7XG5cdFx0XHRcdG9yZCA9IGNvbXBhcmVTdHJpbmcoYVRyaW1tZWQsIGJUcmltbWVkKTtcblx0XHRcdH1cblx0XHRcdGlmIChvcmQgPT09IDApIHtcblx0XHRcdFx0b3JkID0gY29tcGFyZU51bWJlcihhTnVtYmVyLmxlbmd0aCwgYk51bWJlci5sZW5ndGgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG9yZCAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gb3JkO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRhaSArPSAxO1xuXHRcdFx0YmkgKz0gMTtcblx0XHRcdGNvbnN0IG9yZCA9IGNvbXBhcmVDb2RlUG9pbnQoYWMsIGJjKTtcblx0XHRcdGlmIChvcmQgIT09IDApIHtcblx0XHRcdFx0cmV0dXJuIG9yZDtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gY29tcGFyZU51bWJlcihhOiBudW1iZXIsIGI6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiBhIDwgYiA/IC0xIDogYSA+IGIgPyAxIDogMDtcbn1cblxuZnVuY3Rpb24gY29tcGFyZVN0cmluZyhhOiBzdHJpbmcsIGI6IHN0cmluZyk6IG51bWJlciB7XG5cdHJldHVybiBhIDwgYiA/IC0xIDogYSA+IGIgPyAxIDogMDtcbn1cblxuZnVuY3Rpb24gY29tcGFyZUNvZGVQb2ludChhOiBzdHJpbmcsIGI6IHN0cmluZyk6IG51bWJlciB7XG5cdGNvbnN0IGFjID0gYS5jb2RlUG9pbnRBdCgwKSA/PyAwO1xuXHRjb25zdCBiYyA9IGIuY29kZVBvaW50QXQoMCkgPz8gMDtcblx0cmV0dXJuIGNvbXBhcmVOdW1iZXIoYWMsIGJjKTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBzaGVsbF9vdXRwdXRfY29tcGFjdG9yLnJzIFx1MjAxNCBjbGFzc2lmaWNhdGlvblxuXG5mdW5jdGlvbiBjbGFzc2lmeUNvbW1hbmRSZXN1bHQoY29tbWFuZDogc3RyaW5nKTogQ29tbWFuZENsYXNzaWZpY2F0aW9uUmVzdWx0IHtcblx0cmV0dXJuIHtcblx0XHRjb21tYW5kS2luZHM6IGNsYXNzaWZ5Q29tbWFuZEtpbmRzKGNvbW1hbmQpLFxuXHRcdGlzU291cmNlUmVhZENvbW1hbmQ6IGlzU2hlbGxTb3VyY2VSZWFkQ29tbWFuZChjb21tYW5kKSxcblx0XHRydW5zR29UZXN0OiBjb21tYW5kUnVuc0dvVGVzdChjb21tYW5kKSxcblx0XHRtZW50aW9uc1NhdmVkVG9vbE91dHB1dDogY29tbWFuZE1lbnRpb25zU2F2ZWRUb29sT3V0cHV0KGNvbW1hbmQpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBwcmV2aWV3U2hlbGxPdXRwdXRDb21wYWN0aW9uKFxuXHRjb21tYW5kOiBzdHJpbmcsXG5cdG9yaWdpbmFsOiBzdHJpbmcsXG5cdGxhcmdlT3V0cHV0VGhyZXNob2xkOiBudW1iZXIsXG5cdHNoZWxsR3JlcExhcmdlT3V0cHV0VGhyZXNob2xkOiBudW1iZXIsXG5cdG1pbmltdW1TYXZlZENoYXJzOiBudW1iZXIsXG4pOiBTaGVsbE91dHB1dFByZXZpZXdSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRjb25zdCBjbGFzc2lmaWNhdGlvbiA9IGNsYXNzaWZ5Q29tbWFuZFJlc3VsdChjb21tYW5kKTtcblx0Y29uc3QgaGFzR29SdW50aW1lUGFuaWMgPSBsb29rc0xpa2VHb1J1bnRpbWVQYW5pYyhvcmlnaW5hbCk7XG5cdGNvbnN0IGhhc05wbVBhY2tPdXRwdXQgPSBsb29rc0xpa2VOcG1QYWNrT3V0cHV0KG9yaWdpbmFsKTtcblx0Y29uc3QgaGFzSmVzdFJ1bnNPdXRwdXQgPSBoYXNKZXN0UnVuc1Byb2dyZXNzKG9yaWdpbmFsKTtcblx0Y29uc3QgaGFzRG9jdXNhdXJ1c091dHB1dCA9IGhhc0RvY3VzYXVydXNQcm9ncmVzcyhvcmlnaW5hbCk7XG5cdGNvbnN0IGhhc1NwaGlueFByb2dyZXNzT3V0cHV0ID0gaGFzU3BoaW54UHJvZ3Jlc3Mob3JpZ2luYWwpO1xuXHRjb25zdCBoYXNHb1Bhc3NpbmdUZXN0T3V0cHV0ID0gY2xhc3NpZmljYXRpb24ucnVuc0dvVGVzdCAmJiBoYXNQYXNzaW5nR29UZXN0T3V0cHV0KG9yaWdpbmFsKTtcblx0Y29uc3QgaGFzTmVlZHJlc3RhcnROb29wT3V0cHV0ID0gaGFzTmVlZHJlc3RhcnROb29wU3VtbWFyeShvcmlnaW5hbCk7XG5cdGNvbnN0IGNhbkNvbXBhY3RTb3VyY2VSZWFkUHJvZ3Jlc3MgPSBoYXNHb1Bhc3NpbmdUZXN0T3V0cHV0ICYmICFjbGFzc2lmaWNhdGlvbi5tZW50aW9uc1NhdmVkVG9vbE91dHB1dDtcblxuXHRpZiAoY2xhc3NpZmljYXRpb24uY29tbWFuZEtpbmRzLmxlbmd0aCA9PT0gMFxuXHRcdCYmICFoYXNHb1J1bnRpbWVQYW5pY1xuXHRcdCYmICFoYXNOcG1QYWNrT3V0cHV0XG5cdFx0JiYgIWhhc0plc3RSdW5zT3V0cHV0XG5cdFx0JiYgIWhhc0dvUGFzc2luZ1Rlc3RPdXRwdXRcblx0XHQmJiAhaGFzTmVlZHJlc3RhcnROb29wT3V0cHV0XG5cdFx0JiYgIWhhc0RvY3VzYXVydXNPdXRwdXRcblx0XHQmJiAhaGFzU3BoaW54UHJvZ3Jlc3NPdXRwdXRcblx0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoY2xhc3NpZmljYXRpb24uY29tbWFuZEtpbmRzLmxlbmd0aCA9PT0gMFxuXHRcdCYmIGNsYXNzaWZpY2F0aW9uLmlzU291cmNlUmVhZENvbW1hbmRcblx0XHQmJiAhY2FuQ29tcGFjdFNvdXJjZVJlYWRQcm9ncmVzc1xuXHQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgcmVzdWx0ID0gY29tcGFjdFNoZWxsT3V0cHV0KFxuXHRcdGNsYXNzaWZpY2F0aW9uLmNvbW1hbmRLaW5kcyxcblx0XHRvcmlnaW5hbCxcblx0XHRoYXNHb1Bhc3NpbmdUZXN0T3V0cHV0LFxuXHRcdHNoZWxsR3JlcExhcmdlT3V0cHV0VGhyZXNob2xkLFxuXHQpID8/IHsgb3V0cHV0OiBvcmlnaW5hbCwgbG9zc2xlc3M6IHRydWUgfTtcblxuXHRjb25zdCBzYXZlZENoYXJzID0gc2F0dXJhdGluZ1N1Yihqc1N0cmluZ0xlbihvcmlnaW5hbCksIGpzU3RyaW5nTGVuKHJlc3VsdC5vdXRwdXQpKTtcblx0Y29uc3Qgb3JpZ2luYWxXb3VsZFNwaWxsID0gIWZpdHNMYXJnZU91dHB1dFRocmVzaG9sZChvcmlnaW5hbCwgbGFyZ2VPdXRwdXRUaHJlc2hvbGQpO1xuXHRjb25zdCBzYXZlZEJ5dGVzID0gc2F0dXJhdGluZ1N1YihieXRlTGVuZ3RoKG9yaWdpbmFsKSwgYnl0ZUxlbmd0aChyZXN1bHQub3V0cHV0KSk7XG5cdGlmIChzYXZlZENoYXJzIDwgbWluaW11bVNhdmVkQ2hhcnMgJiYgIShvcmlnaW5hbFdvdWxkU3BpbGwgJiYgc2F2ZWRCeXRlcyA+IDApKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0b3V0cHV0OiByZXN1bHQub3V0cHV0LFxuXHRcdHNhdmVkQ2hhcnMsXG5cdFx0bG9zc2xlc3M6IHJlc3VsdC5sb3NzbGVzcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdFRvb2xPdXRwdXQoXG5cdGtpbmQ6IFRvb2xPdXRwdXRDb21wYWN0aW9uS2luZCxcblx0b3V0cHV0OiBzdHJpbmcsXG5cdGxhcmdlT3V0cHV0VGhyZXNob2xkOiBudW1iZXIsXG4pOiBUb29sQ29tcGFjdGlvblJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHJlc3VsdCA9IGtpbmQgPT09ICdncmVwLWNvbnRlbnQnXG5cdFx0PyBjb21wYWN0R3JlcENvbnRlbnRPdXRwdXQob3V0cHV0LCBsYXJnZU91dHB1dFRocmVzaG9sZClcblx0XHQ6IGtpbmQgPT09ICdncmVwLWNvdW50J1xuXHRcdFx0PyBjb21wYWN0R3JlcENvdW50T3V0cHV0KG91dHB1dClcblx0XHRcdDoga2luZCA9PT0gJ2dyZXAtcGF0aHMnXG5cdFx0XHRcdD8gY29tcGFjdFBhdGhMaXN0T3V0cHV0KG91dHB1dCwgJ2dyZXAtcGF0aHMnLCBsYXJnZU91dHB1dFRocmVzaG9sZClcblx0XHRcdFx0OiBjb21wYWN0UGF0aExpc3RPdXRwdXQob3V0cHV0LCAnZ2xvYicsIGxhcmdlT3V0cHV0VGhyZXNob2xkKTtcblxuXHRpZiAocmVzdWx0Lm91dHB1dCA9PT0gb3V0cHV0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBjbGFzc2lmeUNvbW1hbmRLaW5kcyhjb21tYW5kOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGhlcmVkb2NTdHJpcHBlZENvbW1hbmQgPSBzdHJpcEhlcmVkb2NCb2RpZXMoY29tbWFuZCk7XG5cdGlmIChoZXJlZG9jU3RyaXBwZWRDb21tYW5kID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0Y29uc3QgbGluZUNvbnRpbnVlZENvbW1hbmQgPSByZWdleFJlcGxhY2VBbGwoU3RyaW5nLnJhd2BcXHMqXFxcXFxccj9cXG5cXHMqYCwgaGVyZWRvY1N0cmlwcGVkQ29tbWFuZC5jb21tYW5kLCAnICcpO1xuXHRjb25zdCBjb21tYW5kV2l0aG91dEFsbG93ZWREZXNjcmlwdG9yUmVkaXJlY3RzID0gcmVnZXhSZXBsYWNlQWxsKFN0cmluZy5yYXdgXFxzK1sxMl0+JlsxMl1cXGJgLCBsaW5lQ29udGludWVkQ29tbWFuZCwgJycpO1xuXHRjb25zdCBjb21tYW5kV2l0aFNhZmVTdWJzdGl0dXRpb25zID0gcmVwbGFjZVNhZmVDb21tYW5kU3Vic3RpdHV0aW9ucyhjb21tYW5kV2l0aG91dEFsbG93ZWREZXNjcmlwdG9yUmVkaXJlY3RzKTtcblx0Y29uc3Qgc2FmZXR5Q29tbWFuZCA9IHN0cmlwUXVvdGVkVGV4dChjb21tYW5kV2l0aFNhZmVTdWJzdGl0dXRpb25zKTtcblx0Y29uc3QgaGFzTmV3bGluZSA9IHJlZ2V4VGVzdChTdHJpbmcucmF3YFxccj9cXG5gLCBzYWZldHlDb21tYW5kKTtcblx0aWYgKHJlZ2V4VGVzdCgnWztgPD5dJywgc2FmZXR5Q29tbWFuZClcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2AoXnxbXiZdKSYoJHxbXiZdKWAsIHNhZmV0eUNvbW1hbmQpXG5cdFx0fHwgc2FmZXR5Q29tbWFuZC5pbmNsdWRlcygnJCgnKVxuXHQpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBzZWdtZW50cyA9IHNwbGl0Q29tbWFuZFNlZ21lbnRzKGxpbmVDb250aW51ZWRDb21tYW5kKTtcblx0Y29uc3Qgc2VnbWVudEtpbmRzOiAoQ2xhc3NpZmllZENvbW1hbmRTZWdtZW50IHwgdW5kZWZpbmVkKVtdID0gc2VnbWVudHMubWFwKChzZWdtZW50LCBpbmRleCkgPT5cblx0XHRjbGFzc2lmeUNvbW1hbmRTZWdtZW50T3JQaXBlbGluZShzZWdtZW50LCBoZXJlZG9jU3RyaXBwZWRDb21tYW5kLmhlcmVkb2NTdGRpblNlZ21lbnRJbmRleGVzLmhhcyhpbmRleCkpKTtcblx0aWYgKHNlZ21lbnRLaW5kcy5zb21lKGtpbmQgPT4ga2luZCA9PT0gdW5kZWZpbmVkKSkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRjb25zdCByZXNvbHZlZEtpbmRzID0gc2VnbWVudEtpbmRzIGFzIENsYXNzaWZpZWRDb21tYW5kU2VnbWVudFtdO1xuXHRpZiAoaGFzTmV3bGluZSAmJiAhaGFzRXJyZXhpdEJlZm9yZUZpcnN0Q29tbWFuZChzZWdtZW50cywgcmVzb2x2ZWRLaW5kcykpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3Qga2luZCBvZiByZXNvbHZlZEtpbmRzKSB7XG5cdFx0aWYgKCFraW5kLmJlbmlnbikge1xuXHRcdFx0cmVzdWx0LnB1c2goa2luZC5raW5kKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gaXNTaGVsbFNvdXJjZVJlYWRDb21tYW5kKGNvbW1hbmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCBoZXJlZG9jU3RyaXBwZWRDb21tYW5kID0gc3RyaXBIZXJlZG9jQm9kaWVzKGNvbW1hbmQpO1xuXHRpZiAoaGVyZWRvY1N0cmlwcGVkQ29tbWFuZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRjb25zdCBsaW5lQ29udGludWVkQ29tbWFuZCA9IHJlZ2V4UmVwbGFjZUFsbChTdHJpbmcucmF3YFxccypcXFxcXFxyP1xcblxccypgLCBoZXJlZG9jU3RyaXBwZWRDb21tYW5kLmNvbW1hbmQsICcgJyk7XG5cdHJldHVybiBzcGxpdENvbW1hbmRTZWdtZW50cyhsaW5lQ29udGludWVkQ29tbWFuZCkuc29tZShzZWdtZW50ID0+XG5cdFx0c3BsaXRVbnF1b3RlZFBpcGVzKHNlZ21lbnQpLnNvbWUocGFydCA9PiBpc1NvdXJjZVJlYWRTZWdtZW50KHBhcnQpKSk7XG59XG5cbmZ1bmN0aW9uIGlzU291cmNlUmVhZFNlZ21lbnQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVTZWdtZW50KHNlZ21lbnQpO1xuXHRjb25zdCB3aXRob3V0RW52ID0gc3RyaXBTYWZlQ29tbWFuZFdyYXBwZXJzKHN0cmlwRW52aXJvbm1lbnRBc3NpZ25tZW50UHJlZml4KG5vcm1hbGl6ZWQpKTtcblx0cmV0dXJuIHJlZ2V4VGVzdChTdHJpbmcucmF3YF4oPzpjYXR8c2VkfGhlYWR8dGFpbHxsZXNzfG1vcmV8YmF0fG5sfGF3a3xncmVwfGVncmVwfGZncmVwfHJnKSg/Olxcc3wkKWAsIHdpdGhvdXRFbnYpO1xufVxuXG5mdW5jdGlvbiBjbGFzc2lmeUNvbW1hbmRTZWdtZW50T3JQaXBlbGluZShcblx0c2VnbWVudDogc3RyaW5nLFxuXHRpc0hlcmVkb2NTdGRpblNlZ21lbnQ6IGJvb2xlYW4sXG4pOiBDbGFzc2lmaWVkQ29tbWFuZFNlZ21lbnQgfCB1bmRlZmluZWQge1xuXHRjb25zdCBwYXJ0cyA9IHNwbGl0VW5xdW90ZWRQaXBlcyhzZWdtZW50KTtcblx0aWYgKHBhcnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdHJldHVybiBjbGFzc2lmeUNvbW1hbmRTZWdtZW50KHBhcnRzWzBdLCBpc0hlcmVkb2NTdGRpblNlZ21lbnQpO1xuXHR9XG5cdGlmIChwYXJ0cy5sZW5ndGggPCAyKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IGhlYWRLaW5kID0gY2xhc3NpZnlDb21tYW5kU2VnbWVudChwYXJ0c1swXSwgaXNIZXJlZG9jU3RkaW5TZWdtZW50KTtcblx0aWYgKGhlYWRLaW5kID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChzZWdtZW50c0VxdWFsKGhlYWRLaW5kLCBCRU5JR05fU0VHTUVOVCkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChzZWdtZW50c0VxdWFsKGhlYWRLaW5kLCBjb21wYWN0U2VnbWVudCgnc2hlbGwtZ3JlcCcpKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHBhcnRzLnNsaWNlKDEpLmV2ZXJ5KHBhcnQgPT4gaXNCZW5pZ25QaXBlbGluZVRhaWwocGFydCkpKSB7XG5cdFx0cmV0dXJuIGhlYWRLaW5kO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGNsYXNzaWZ5Q29tbWFuZFNlZ21lbnQoXG5cdHNlZ21lbnQ6IHN0cmluZyxcblx0aXNIZXJlZG9jU3RkaW5TZWdtZW50OiBib29sZWFuLFxuKTogQ2xhc3NpZmllZENvbW1hbmRTZWdtZW50IHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVNlZ21lbnQoc2VnbWVudCk7XG5cdGlmIChub3JtYWxpemVkLmxlbmd0aCA9PT0gMFxuXHRcdHx8IG5vcm1hbGl6ZWQgPT09ICd0cnVlJ1xuXHRcdHx8IG5vcm1hbGl6ZWQgPT09ICc6J1xuXHRcdHx8IGlzQmVuaWduR29mbXRXcml0ZUNvbW1hbmQobm9ybWFsaXplZClcblx0XHR8fCBpc0JlbmlnblRhcmJhbGxDbGVhbnVwQ29tbWFuZChub3JtYWxpemVkKVxuXHRcdHx8IGlzQmVuaWduUHl0aG9uQnVpbGRDbGVhbnVwQ29tbWFuZChub3JtYWxpemVkKVxuXHRcdHx8IG5vcm1hbGl6ZWQuc3RhcnRzV2l0aCgnIycpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXmNkKD86XFxzKyg/OlwiW15cIl0qXCJ8J1teJ10qJ3xbXlxcc10rKSk/JGAsIG5vcm1hbGl6ZWQpXG5cdFx0fHwgaXNCZW5pZ25TZXR1cENvbW1hbmQobm9ybWFsaXplZClcblx0XHR8fCByZWdleFRlc3QoXG5cdFx0XHRTdHJpbmcucmF3YF5zZXRcXHMrKD86Wy0rQS1aYS16XSt8LW9cXHMrW0EtWmEtel1bQS1aYS16MC05Xy1dKnxbQS1aYS16XVtBLVphLXowLTlfLV0qKSg/OlxccysoPzpbLStBLVphLXpdK3wtb1xccytbQS1aYS16XVtBLVphLXowLTlfLV0qfFtBLVphLXpdW0EtWmEtejAtOV8tXSopKSokYCxcblx0XHRcdG5vcm1hbGl6ZWQsXG5cdFx0KVxuXHQpIHtcblx0XHRyZXR1cm4gQkVOSUdOX1NFR01FTlQ7XG5cdH1cblx0aWYgKGlzQXNzaWdubWVudExpc3Qobm9ybWFsaXplZClcblx0XHR8fCAobm9ybWFsaXplZC5zdGFydHNXaXRoKCdleHBvcnQgJykgJiYgaXNBc3NpZ25tZW50TGlzdChub3JtYWxpemVkLnNsaWNlKCdleHBvcnQgJy5sZW5ndGgpKSlcblx0KSB7XG5cdFx0cmV0dXJuIEJFTklHTl9TRUdNRU5UO1xuXHR9XG5cblx0Y29uc3Qgd2l0aG91dEVudiA9IHN0cmlwU2FmZUNvbW1hbmRXcmFwcGVycyhzdHJpcEVudmlyb25tZW50QXNzaWdubWVudFByZWZpeChub3JtYWxpemVkKSk7XG5cdGxldCBraW5kOiBzdHJpbmc7XG5cdGlmIChpc0FwdENvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ2FwdCc7XG5cdH0gZWxzZSBpZiAoaXNQbnBtSW5zdGFsbENvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ3BucG0nO1xuXHR9IGVsc2UgaWYgKHJlZ2V4VGVzdChTdHJpbmcucmF3YF5ucG1cXHMrcGFja1xcYmAsIHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICducG0tcGFjayc7XG5cdH0gZWxzZSBpZiAoaXNZYXJuQmVycnlDb21tYW5kKHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICd5YXJuLWJlcnJ5Jztcblx0fSBlbHNlIGlmIChyZWdleFRlc3QoU3RyaW5nLnJhd2BeKD86bnBtXFxzKyg/OmNpfGluc3RhbGwpfHlhcm5cXHMraW5zdGFsbClcXGJgLCB3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAnbnBtJztcblx0fSBlbHNlIGlmIChpc1BpcEluc3RhbGxDb21tYW5kKHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICdwaXAnO1xuXHR9IGVsc2UgaWYgKHJlZ2V4VGVzdChTdHJpbmcucmF3YF5jb21wb3NlclxccysoPzppbnN0YWxsfHVwZGF0ZXxyZXF1aXJlfHJlbW92ZSlcXGJgLCB3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAnY29tcG9zZXInO1xuXHR9IGVsc2UgaWYgKHJlZ2V4VGVzdChTdHJpbmcucmF3YF5wb2V0cnlcXHMrKD86aW5zdGFsbHx1cGRhdGV8YWRkfHJlbW92ZSlcXGJgLCB3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAncG9ldHJ5Jztcblx0fSBlbHNlIGlmIChpc1V2Q29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAndXYnO1xuXHR9IGVsc2UgaWYgKGlzQmVuaWduVmVyc2lvbkNvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRyZXR1cm4gQkVOSUdOX1NFR01FTlQ7XG5cdH0gZWxzZSBpZiAoaXNHb0NvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ2dvJztcblx0fSBlbHNlIGlmIChpc0pzVGVzdENvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ2pzLXRlc3QnO1xuXHR9IGVsc2UgaWYgKHJlZ2V4VGVzdChTdHJpbmcucmF3YF5jYXJnb1xccysoPzpidWlsZHxjaGVja3x0ZXN0fGNsaXBweXxkb2N8ZmV0Y2gpXFxiYCwgd2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ2NhcmdvJztcblx0fSBlbHNlIGlmIChyZWdleFRlc3QoU3RyaW5nLnJhd2BeKD86bm9kZXxucHh8bnBtXFxzK2V4ZWN8cG5wbVxccytleGVjfHlhcm5cXHMrbm9kZSlcXGJgLCB3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAnbm9kZSc7XG5cdH0gZWxzZSBpZiAoaXNOeENvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ254Jztcblx0fSBlbHNlIGlmIChpc1B5dGVzdENvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ3B5dGVzdCc7XG5cdH0gZWxzZSBpZiAoaXNQeXRob25Vbml0dGVzdENvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ3VuaXR0ZXN0Jztcblx0fSBlbHNlIGlmIChpc1B5dGhvbkJ1aWxkQ29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAncHl0aG9uLWJ1aWxkJztcblx0fSBlbHNlIGlmIChpc0JlbmlnbkdpdENvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRyZXR1cm4gQkVOSUdOX1NFR01FTlQ7XG5cdH0gZWxzZSBpZiAoaXNHaXRQcm9ncmVzc0NvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ2dpdCc7XG5cdH0gZWxzZSBpZiAoaXNHaXRDbGVhbk9yUmVzZXRDb21tYW5kKHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICdnaXQtY2xlYW4nO1xuXHR9IGVsc2UgaWYgKHJlZ2V4VGVzdChTdHJpbmcucmF3YF5naXRcXHMrKD86Y2hlY2tvdXR8c3dpdGNoKVxcYmAsIHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICdnaXQnO1xuXHR9IGVsc2UgaWYgKGlzUHl0aG9uQnVpbGRFeHRDb21tYW5kKHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICdweXRob24tYnVpbGQtZXh0Jztcblx0fSBlbHNlIGlmIChpc0RqYW5nb1Rlc3RDb21tYW5kKHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICdkamFuZ28tdGVzdCc7XG5cdH0gZWxzZSBpZiAoaXNHb2xhbmdjaUxpbnRDb21tYW5kKHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICdnb2xhbmdjaS1saW50Jztcblx0fSBlbHNlIGlmIChpc0NsYW5nRm9ybWF0TGludGVyQ29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAnY2xhbmctZm9ybWF0LWxpbnRlcic7XG5cdH0gZWxzZSBpZiAoaXNHcmFkbGVDb21tYW5kKHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICdncmFkbGUnO1xuXHR9IGVsc2UgaWYgKGlzQ21ha2VDb25maWd1cmVDb21tYW5kKHdpdGhvdXRFbnYpKSB7XG5cdFx0a2luZCA9ICdjbWFrZSc7XG5cdH0gZWxzZSBpZiAoaXNNYXZlbkNvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ21hdmVuJztcblx0fSBlbHNlIGlmIChpc0RvdG5ldENvbW1hbmQod2l0aG91dEVudikpIHtcblx0XHRraW5kID0gJ2RvdG5ldCc7XG5cdH0gZWxzZSBpZiAoaXNTYWZlU2hlbGxHcmVwQ29tbWFuZCh3aXRob3V0RW52KSkge1xuXHRcdGtpbmQgPSAnc2hlbGwtZ3JlcCc7XG5cdH0gZWxzZSBpZiAocmVnZXhUZXN0KFN0cmluZy5yYXdgXig/Omc/bWFrZXxuaW5qYSlcXGJgLCB3aXRob3V0RW52KVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXC4vY29uZmlndXJlXFxiYCwgd2l0aG91dEVudilcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeY21ha2VcXHMrLS1idWlsZFxcYmAsIHdpdGhvdXRFbnYpXG5cdCkge1xuXHRcdGtpbmQgPSAnbWFrZSc7XG5cdH0gZWxzZSBpZiAoaXNQeXRob25TY3JpcHRDb21tYW5kKHdpdGhvdXRFbnYsIGlzSGVyZWRvY1N0ZGluU2VnbWVudCkpIHtcblx0XHRraW5kID0gJ3B5dGhvbi1zY3JpcHQnO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIGNvbXBhY3RTZWdtZW50KGtpbmQpO1xufVxuXG5mdW5jdGlvbiBzcGxpdFVucXVvdGVkUGlwZXMoc2VnbWVudDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcblx0bGV0IHN0YXJ0ID0gMDtcblx0bGV0IGluU2luZ2xlID0gZmFsc2U7XG5cdGxldCBpbkRvdWJsZSA9IGZhbHNlO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IHNlZ21lbnQubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBjaCA9IHNlZ21lbnRbaV07XG5cdFx0aWYgKGNoID09PSAnXFwnJyAmJiAhaW5Eb3VibGUpIHtcblx0XHRcdGluU2luZ2xlID0gIWluU2luZ2xlO1xuXHRcdH0gZWxzZSBpZiAoY2ggPT09ICdcIicgJiYgIWluU2luZ2xlICYmICFpc0VzY2FwZWRCeU9kZEJhY2tzbGFzaGVzKHNlZ21lbnQsIGkpKSB7XG5cdFx0XHRpbkRvdWJsZSA9ICFpbkRvdWJsZTtcblx0XHR9IGVsc2UgaWYgKGNoID09PSAnfCcgJiYgIWluU2luZ2xlICYmICFpbkRvdWJsZSkge1xuXHRcdFx0cHVzaFRyaW1tZWRQYXJ0KHBhcnRzLCBzZWdtZW50LnNsaWNlKHN0YXJ0LCBpKSk7XG5cdFx0XHRzdGFydCA9IGkgKyAxO1xuXHRcdH1cblx0fVxuXHRwdXNoVHJpbW1lZFBhcnQocGFydHMsIHNlZ21lbnQuc2xpY2Uoc3RhcnQpKTtcblx0cmV0dXJuIHBhcnRzO1xufVxuXG5mdW5jdGlvbiBwdXNoVHJpbW1lZFBhcnQocGFydHM6IHN0cmluZ1tdLCBwYXJ0OiBzdHJpbmcpOiB2b2lkIHtcblx0Y29uc3QgdHJpbW1lZCA9IHBhcnQudHJpbSgpO1xuXHRpZiAodHJpbW1lZC5sZW5ndGggIT09IDApIHtcblx0XHRwYXJ0cy5wdXNoKHRyaW1tZWQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzQmVuaWduUGlwZWxpbmVUYWlsKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplU2VnbWVudChzZWdtZW50KTtcblx0cmV0dXJuIG5vcm1hbGl6ZWQgPT09ICdjYXQnXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXnRlZSg/OlxccystYSk/XFxzKyg/OlwiW15cIl0qXCJ8J1teJ10qJ3xcXFMrKSRgLCBub3JtYWxpemVkKVxuXHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXig/OmhlYWR8dGFpbCkoPzpcXHMrKD86LVtuY11cXHMqKT9bKy1dP1xcZCt8XFxzKy1bbmNdXFxzK1srLV0/XFxkKyk/JGAsXG5cdFx0XHRub3JtYWxpemVkLFxuXHRcdClcblx0XHR8fCByZWdleFRlc3QoXG5cdFx0XHRTdHJpbmcucmF3YF5zZWRcXHMrLW5cXHMrKD86XCJcXGQrKD86LFxcZCspP3BcInwnW1xcZF0rKD86LFxcZCspP3AnKSRgLFxuXHRcdFx0bm9ybWFsaXplZCxcblx0XHQpXG5cdFx0fHwgaXNTYWZlU3RyZWFtaW5nR3JlcFRhaWwobm9ybWFsaXplZClcblx0XHR8fCBpc1NhZmVTdHJlYW1pbmdGbGFnT25seVRhaWwobm9ybWFsaXplZCk7XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gc2hlbGxfb3V0cHV0X2NvbXBhY3Rvci5ycyBcdTIwMTQgY29tbWFuZCBkZXRlY3RvcnNcblxuLyoqIFJ1c3QgYHN0cjo6c3RyaXBfcHJlZml4YDogcmV0dXJucyB0aGUgcmVtYWluZGVyIGlmIGB2YWx1ZWAgc3RhcnRzIHdpdGggYHByZWZpeGAuICovXG5mdW5jdGlvbiBzdHJpcFByZWZpeCh2YWx1ZTogc3RyaW5nLCBwcmVmaXg6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB2YWx1ZS5zdGFydHNXaXRoKHByZWZpeCkgPyB2YWx1ZS5zbGljZShwcmVmaXgubGVuZ3RoKSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqIFJ1c3QgYHN0cjo6c3RyaXBfc3VmZml4YDogcmV0dXJucyB0aGUgbGVhZGluZyBwYXJ0IGlmIGB2YWx1ZWAgZW5kcyB3aXRoIGBzdWZmaXhgLiAqL1xuZnVuY3Rpb24gc3RyaXBTdWZmaXgodmFsdWU6IHN0cmluZywgc3VmZml4OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gdmFsdWUuZW5kc1dpdGgoc3VmZml4KSA/IHZhbHVlLnNsaWNlKDAsIHZhbHVlLmxlbmd0aCAtIHN1ZmZpeC5sZW5ndGgpIDogdW5kZWZpbmVkO1xufVxuXG4vKiogUnVzdCBgc3RyOjpzcGxpdF9vbmNlYDogc3BsaXRzIGF0IHRoZSBmaXJzdCBgc2VwYXJhdG9yYCBvY2N1cnJlbmNlLiAqL1xuZnVuY3Rpb24gc3BsaXRPbmNlKHZhbHVlOiBzdHJpbmcsIHNlcGFyYXRvcjogc3RyaW5nKTogW3N0cmluZywgc3RyaW5nXSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGluZGV4ID0gdmFsdWUuaW5kZXhPZihzZXBhcmF0b3IpO1xuXHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gW3ZhbHVlLnNsaWNlKDAsIGluZGV4KSwgdmFsdWUuc2xpY2UoaW5kZXggKyBzZXBhcmF0b3IubGVuZ3RoKV07XG59XG5cbi8qKiBSdXN0IGBzdHI6OnJzcGxpdF9vbmNlYDogc3BsaXRzIGF0IHRoZSBsYXN0IGBzZXBhcmF0b3JgIG9jY3VycmVuY2UuICovXG5mdW5jdGlvbiByc3BsaXRPbmNlKHZhbHVlOiBzdHJpbmcsIHNlcGFyYXRvcjogc3RyaW5nKTogW3N0cmluZywgc3RyaW5nXSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGluZGV4ID0gdmFsdWUubGFzdEluZGV4T2Yoc2VwYXJhdG9yKTtcblx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIFt2YWx1ZS5zbGljZSgwLCBpbmRleCksIHZhbHVlLnNsaWNlKGluZGV4ICsgc2VwYXJhdG9yLmxlbmd0aCldO1xufVxuXG4vKiogUnVzdCBgc3RyOjp0b19hc2NpaV9sb3dlcmNhc2VgOiBsb3dlcmNhc2VzIG9ubHkgQVNDSUkgQS1aLCBsZWF2aW5nIG90aGVyIGNoYXJhY3RlcnMgdW5jaGFuZ2VkLiAqL1xuZnVuY3Rpb24gYXNjaWlMb3dlcmNhc2UodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGxldCByZXN1bHQgPSAnJztcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGNvZGUgPSB2YWx1ZS5jaGFyQ29kZUF0KGkpO1xuXHRcdHJlc3VsdCArPSBjb2RlID49IDY1ICYmIGNvZGUgPD0gOTAgPyBTdHJpbmcuZnJvbUNoYXJDb2RlKGNvZGUgKyAzMikgOiB2YWx1ZVtpXTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKiogUnVzdCBgc3RyOjpwYXJzZTo6PHVzaXplPigpYDogcGFyc2VzIGFuIG9wdGlvbmFsIGArYCBzaWduIGZvbGxvd2VkIGJ5IEFTQ0lJIGRpZ2l0cy4gKi9cbmZ1bmN0aW9uIHBhcnNlVXNpemUodmFsdWU6IHN0cmluZyk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGlmICghL15cXCs/XFxkKyQvLnRlc3QodmFsdWUpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gTnVtYmVyKHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gaXNBcHRDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCB3aXRob3V0U3VkbyA9IHN0cmlwUHJlZml4KHNlZ21lbnQsICdzdWRvICcpID8/IHNlZ21lbnQ7XG5cdGNvbnN0IGFyZ3MgPSBzdHJpcFByZWZpeCh3aXRob3V0U3VkbywgJ2FwdC1nZXQgJykgPz8gc3RyaXBQcmVmaXgod2l0aG91dFN1ZG8sICdhcHQgJyk7XG5cdGlmIChhcmdzID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgdG9rZW5zID0gc3BsaXRXaGl0ZXNwYWNlKGFyZ3MpO1xuXHRsZXQgaSA9IDA7XG5cdHdoaWxlIChpIDwgdG9rZW5zLmxlbmd0aCkge1xuXHRcdGNvbnN0IHRva2VuID0gdG9rZW5zW2ldO1xuXHRcdGlmICh0b2tlbiA9PT0gJy1vJyB8fCB0b2tlbiA9PT0gJy0tb3B0aW9uJyB8fCB0b2tlbiA9PT0gJy1jJyB8fCB0b2tlbiA9PT0gJy0tY29uZmlnLWZpbGUnKSB7XG5cdFx0XHRpICs9IDI7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKHRva2VuLnN0YXJ0c1dpdGgoJy0nKSkge1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdHJldHVybiB0b2tlbiA9PT0gJ3VwZGF0ZScgfHwgdG9rZW4gPT09ICdpbnN0YWxsJztcblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGlzUG5wbUluc3RhbGxDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCB0b2tlbnMgPSBzcGxpdFdoaXRlc3BhY2Uoc2VnbWVudCk7XG5cdGlmICh0b2tlbnNbMF0gIT09ICdwbnBtJykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRsZXQgaW5kZXggPSAxO1xuXHR3aGlsZSAoaW5kZXggPCB0b2tlbnMubGVuZ3RoKSB7XG5cdFx0Y29uc3QgdG9rZW4gPSB0b2tlbnNbaW5kZXhdO1xuXHRcdGlmIChbJy0tZmlsdGVyJywgJy1GJywgJy0tcHJlZml4JywgJy1DJywgJy0tZGlyJywgJy0tbG9nbGV2ZWwnLCAnLS1yZXBvcnRlcicsICctLXBhY2thZ2UtaW1wb3J0LW1ldGhvZCcsICctLXdvcmtzcGFjZS1jb25jdXJyZW5jeSddLmluY2x1ZGVzKHRva2VuKSkge1xuXHRcdFx0aW5kZXggKz0gMjtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoWyctLXJlY3Vyc2l2ZScsICctcicsICctLXdvcmtzcGFjZS1yb290JywgJy13JywgJy0tc2lsZW50JywgJy1zJywgJy0tdXNlLXN0ZGVycicsICctLWNvbG9yJywgJy0tbm8tY29sb3InXS5pbmNsdWRlcyh0b2tlbilcblx0XHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF4oPzotLWZpbHRlcnwtLXByZWZpeHwtLWRpcnwtLWxvZ2xldmVsfC0tcmVwb3J0ZXJ8LS1wYWNrYWdlLWltcG9ydC1tZXRob2R8LS13b3Jrc3BhY2UtY29uY3VycmVuY3l8LUZ8LUMpPWAsIHRva2VuKVxuXHRcdCkge1xuXHRcdFx0aW5kZXggKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRicmVhaztcblx0fVxuXHRyZXR1cm4gdG9rZW5zW2luZGV4XSA9PT0gJ2luc3RhbGwnIHx8IHRva2Vuc1tpbmRleF0gPT09ICdpJztcbn1cblxuZnVuY3Rpb24gaXNHaXRQcm9ncmVzc0NvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IHRva2VucyA9IHNwbGl0V2hpdGVzcGFjZShzZWdtZW50KTtcblx0Y29uc3QgaW5kZXggPSBnaXRTdWJjb21tYW5kSW5kZXgodG9rZW5zKTtcblx0aWYgKGluZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3Qgc3ViY29tbWFuZCA9IHRva2Vuc1tpbmRleF07XG5cdHJldHVybiBzdWJjb21tYW5kID09PSAnY2xvbmUnIHx8IHN1YmNvbW1hbmQgPT09ICdmZXRjaCcgfHwgc3ViY29tbWFuZCA9PT0gJ3B1bGwnXG5cdFx0fHwgKHN1YmNvbW1hbmQgPT09ICdzdWJtb2R1bGUnICYmIHRva2Vuc1tpbmRleCArIDFdID09PSAndXBkYXRlJyk7XG59XG5cbmZ1bmN0aW9uIGlzR2l0Q2xlYW5PclJlc2V0Q29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgdG9rZW5zID0gc3BsaXRXaGl0ZXNwYWNlKHNlZ21lbnQpO1xuXHRjb25zdCBpbmRleCA9IGdpdFN1YmNvbW1hbmRJbmRleCh0b2tlbnMpO1xuXHRpZiAoaW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBzdWJjb21tYW5kID0gdG9rZW5zW2luZGV4XTtcblx0Y29uc3QgYXJncyA9IHRva2Vucy5zbGljZShpbmRleCArIDEpO1xuXHRpZiAoc3ViY29tbWFuZCA9PT0gJ3Jlc2V0Jykge1xuXHRcdHJldHVybiBhcmdzLmluY2x1ZGVzKCctLWhhcmQnKTtcblx0fVxuXHRyZXR1cm4gc3ViY29tbWFuZCA9PT0gJ2NsZWFuJyAmJiBhcmdzLnNvbWUoYXJnID0+IGlzR2l0Q2xlYW5Gb3JjZU9wdGlvbihhcmcpKTtcbn1cblxuZnVuY3Rpb24gaXNHaXRDbGVhbkZvcmNlT3B0aW9uKGFyZzogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBhcmcgPT09ICctLWZvcmNlJyB8fCAocmVnZXhUZXN0KFN0cmluZy5yYXdgXi1bQS1aYS16XSskYCwgYXJnKSAmJiBhcmcuaW5jbHVkZXMoJ2YnKSk7XG59XG5cbmZ1bmN0aW9uIGlzQmVuaWduR2l0Q29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgdG9rZW5zID0gc3BsaXRXaGl0ZXNwYWNlKHNlZ21lbnQpO1xuXHRjb25zdCBpbmRleCA9IGdpdFN1YmNvbW1hbmRJbmRleCh0b2tlbnMpO1xuXHRpZiAoaW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBzdWJjb21tYW5kID0gdG9rZW5zW2luZGV4XTtcblx0Y29uc3QgYXJncyA9IHRva2Vucy5zbGljZShpbmRleCArIDEpO1xuXHRpZiAoc3ViY29tbWFuZCA9PT0gJ3N0YXR1cycpIHtcblx0XHRyZXR1cm4gYXJncy5ldmVyeShhcmcgPT5cblx0XHRcdGFyZyA9PT0gJy0tc2hvcnQnIHx8IGFyZyA9PT0gJy1zJyB8fCBhcmcgPT09ICctLXBvcmNlbGFpbicgfHwgYXJnLnN0YXJ0c1dpdGgoJy0tdW50cmFja2VkLWZpbGVzJykpO1xuXHR9XG5cdGlmIChzdWJjb21tYW5kID09PSAnZGlmZicpIHtcblx0XHRjb25zdCBoYXNTdW1tYXJ5T3V0cHV0ID0gYXJncy5zb21lKGFyZyA9PlxuXHRcdFx0WyctLXN0YXQnLCAnLS1zaG9ydHN0YXQnLCAnLS1udW1zdGF0JywgJy0tbmFtZS1vbmx5JywgJy0tbmFtZS1zdGF0dXMnLCAnLS1zdW1tYXJ5JywgJy0tY29tcGFjdC1zdW1tYXJ5J10uaW5jbHVkZXMoYXJnKSk7XG5cdFx0cmV0dXJuIGhhc1N1bW1hcnlPdXRwdXRcblx0XHRcdCYmICFhcmdzLnNvbWUoYXJnID0+XG5cdFx0XHRcdGFyZyA9PT0gJy1wJyB8fCBhcmcgPT09ICctdScgfHwgYXJnID09PSAnLS1wYXRjaCdcblx0XHRcdFx0fHwgYXJnLnN0YXJ0c1dpdGgoJy0tcGF0Y2gtJylcblx0XHRcdFx0fHwgYXJnLnN0YXJ0c1dpdGgoJy0td29yZC1kaWZmJylcblx0XHRcdFx0fHwgYXJnLnN0YXJ0c1dpdGgoJy0tY29sb3Itd29yZHMnKSk7XG5cdH1cblx0cmV0dXJuIHN1YmNvbW1hbmQgPT09ICdyZXYtcGFyc2UnXG5cdFx0JiYgYXJncy5ldmVyeShhcmcgPT4gYXJnID09PSAnLS1zaG93LXRvcGxldmVsJyB8fCBhcmcgPT09ICctLXNob3ctcHJlZml4Jyk7XG59XG5cbmZ1bmN0aW9uIGdpdFN1YmNvbW1hbmRJbmRleCh0b2tlbnM6IHN0cmluZ1tdKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0aWYgKHRva2Vuc1swXSAhPT0gJ2dpdCcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGxldCBpbmRleCA9IDE7XG5cdHdoaWxlIChpbmRleCA8IHRva2Vucy5sZW5ndGgpIHtcblx0XHRjb25zdCB0b2tlbiA9IHRva2Vuc1tpbmRleF07XG5cdFx0aWYgKHRva2VuID09PSAnLUMnIHx8IHRva2VuID09PSAnLS1naXQtZGlyJyB8fCB0b2tlbiA9PT0gJy0td29yay10cmVlJykge1xuXHRcdFx0aW5kZXggKz0gMjtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uc3RhcnRzV2l0aCgnLWMnKSkge1xuXHRcdFx0aW5kZXggKz0gdG9rZW4gPT09ICctYycgPyAyIDogMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uc3RhcnRzV2l0aCgnLS0nKSkge1xuXHRcdFx0aW5kZXggKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRicmVhaztcblx0fVxuXHRyZXR1cm4gaW5kZXggPCB0b2tlbnMubGVuZ3RoID8gaW5kZXggOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGlzSnNUZXN0Q29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuICFyZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2AoPzpefFxccykoPzotd3wtLXdhdGNoKD86Wz1cXHNdfCQpfC0td2F0Y2hBbGwoPzpbPVxcc118JCl8LS13YXRjaC1hbGwoPzpbPVxcc118JCl8LS13YXRjaC1maWxlcyg/Ols9XFxzXXwkKSlgLFxuXHRcdHNlZ21lbnQsXG5cdCkgJiYgcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXig/Om5weFxccyt8KD86bnBtfHBucG18eWFybilcXHMrZXhlY1xccyspPyg/OnZpdGVzdHxqZXN0fG1vY2hhfHRhcCkoPzpcXHN8JClgLFxuXHRcdHNlZ21lbnQsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGlzWWFybkJlcnJ5Q29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF4oPzp5YXJufGNvcmVwYWNrXFxzK3lhcm4pXFxzKyg/Omluc3RhbGx8YWRkfHdvcmtzcGFjZXN8cnVuXFxzK2luc3RhbGwpXFxiYCxcblx0XHRzZWdtZW50LFxuXHQpIHx8IHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF5ub2RlXFxzKyg/OlxcLi8pP3NjcmlwdC95YXJuXFwuanNcXHMrKD86aW5zdGFsbHxhZGQpXFxiYCxcblx0XHRzZWdtZW50LFxuXHQpO1xufVxuXG5mdW5jdGlvbiBpc054Q29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF4oPzpueHwoPzp5YXJufHBucG0pXFxzKyg/Om54fHJlbGVhc2U6YnVpbGR8dHlwZXNjcmlwdHx0ZXN0OnRzfGxpbnQpKVxcYmAsXG5cdFx0c2VnbWVudCxcblx0KTtcbn1cblxuZnVuY3Rpb24gaXNEamFuZ29UZXN0Q29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgcHl0aG9uV2l0aE9wdGlvbnMgPSBweXRob25XaXRoT3B0aW9uc1BhdHRlcm4oKTtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF4ke3B5dGhvbldpdGhPcHRpb25zfVxccysoPzooPzpcXC4vKT8oPzp0ZXN0cy8pP3J1bnRlc3RzXFwucHl8bWFuYWdlXFwucHlcXHMrdGVzdHwtbVxccytkamFuZ29cXHMrdGVzdClcXGJgLFxuXHRcdHNlZ21lbnQsXG5cdCkgfHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXmRqYW5nby1hZG1pblxccyt0ZXN0XFxiYCwgc2VnbWVudCk7XG59XG5cbmZ1bmN0aW9uIGlzR29sYW5nY2lMaW50Q29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChTdHJpbmcucmF3YF4oPzpbQS1aYS16MC05Xy4vKy1dKy8pP2dvbGFuZ2NpLWxpbnRcXHMrcnVuXFxiYCwgc2VnbWVudClcblx0XHR8fCByZWdleFRlc3QoXG5cdFx0XHRTdHJpbmcucmF3YF5nb1xccytydW5cXHMrZ2l0aHViXFwuY29tL2dvbGFuZ2NpL2dvbGFuZ2NpLWxpbnQvY21kL2dvbGFuZ2NpLWxpbnQoPzpAXFxTKyk/XFxzK3J1blxcYmAsXG5cdFx0XHRzZWdtZW50LFxuXHRcdCk7XG59XG5cbmZ1bmN0aW9uIGlzQ2xhbmdGb3JtYXRMaW50ZXJDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXiR7cHl0aG9uV2l0aE9wdGlvbnNQYXR0ZXJuKCl9XFxzK1xcUyp0b29scy9saW50ZXIvYWRhcHRlcnMvY2xhbmdmb3JtYXRfbGludGVyXFwucHlcXGJgLFxuXHRcdHNlZ21lbnQsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGlzR3JhZGxlQ29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF4oPzooPzpcXC4vfC9cXFMrLyk/Z3JhZGxldz98XFwkR1JBRExFfFxcJFxce0dSQURMRVxcfSkoPzpcXHN8JClgLFxuXHRcdHNlZ21lbnQsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGlzQ21ha2VDb25maWd1cmVDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXmNtYWtlKD86XFxzfCQpYCwgc2VnbWVudClcblx0XHQmJiAhc3BsaXRXaGl0ZXNwYWNlKHNlZ21lbnQpLnNvbWUodG9rZW4gPT5cblx0XHRcdHJlZ2V4VGVzdChTdHJpbmcucmF3YF4oPzotLWJ1aWxkfC0taW5zdGFsbHwtRXwtUHwtLXZlcnNpb258LU58LWh8LS1oZWxwKD86LS4rKT8pJGAsIHRva2VuKSk7XG59XG5cbmZ1bmN0aW9uIGlzTWF2ZW5Db21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXig/Oig/OlxcLi8pP212bnc/fG12bikoPzpcXHN8JClgLCBzZWdtZW50KTtcbn1cblxuZnVuY3Rpb24gaXNEb3RuZXRDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXmRvdG5ldFxccysoPzpidWlsZHx0ZXN0fHJlc3RvcmV8cHVibGlzaHxwYWNrKSg/Olxcc3wkKWAsIHNlZ21lbnQpO1xufVxuXG5mdW5jdGlvbiBpc1V2Q29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF4oPzp1dnwoPzpweXRob258cHl0aG9uMyg/OlxcLlxcZCspPylcXHMrLW1cXHMrdXYpXFxzKyg/OnN5bmN8cGlwXFxzKyg/Omluc3RhbGx8c3luY3xjb21waWxlKXx2ZW52fGFkZHxsb2NrfHJ1bilcXGJgLFxuXHRcdHNlZ21lbnQsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGlzUGlwSW5zdGFsbENvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BeKD86KD86JHtweXRob25FeGVjdXRhYmxlUGF0dGVybigpfSlcXHMrLW1cXHMrcGlwfHBpcHxwaXAzKVxccytpbnN0YWxsXFxiYCxcblx0XHRzZWdtZW50LFxuXHQpO1xufVxuXG5mdW5jdGlvbiBpc0dvQ29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF4oPzpnb3wvKD86XFxTKy8pKmdvKVxccysoPzp0ZXN0fGJ1aWxkfGluc3RhbGx8Z2V0fG1vZFxccysoPzp0aWR5fGRvd25sb2FkfHZlcmlmeXxncmFwaCl8d29ya1xccytzeW5jKVxcYmAsXG5cdFx0c2VnbWVudCxcblx0KTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBzaGVsbF9vdXRwdXRfY29tcGFjdG9yLnJzIFx1MjAxNCBweXRob24gZGV0ZWN0b3JzLCBncmVwIHNhZmV0eSwgc2VnbWVudGF0aW9uXG5cbmZ1bmN0aW9uIGlzUHl0ZXN0Q29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF4oPzooPzoke3B5dGhvbldpdGhPcHRpb25zUGF0dGVybigpfSlcXHMrLW1cXHMrcHl0ZXN0fCg/Oig/OltBLVphLXowLTlfLi8rLV0rLyk/cHl0ZXN0KSkoPzpcXHN8JClgLFxuXHRcdHNlZ21lbnQsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGlzUHl0aG9uVW5pdHRlc3RDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXiR7cHl0aG9uV2l0aE9wdGlvbnNQYXR0ZXJuKCl9XFxzKy1tXFxzK3VuaXR0ZXN0XFxiYCwgc2VnbWVudCk7XG59XG5cbmZ1bmN0aW9uIGlzUHl0aG9uQnVpbGRDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXiR7cHl0aG9uV2l0aE9wdGlvbnNQYXR0ZXJuKCl9XFxzKy1tXFxzK2J1aWxkKD86XFxzfCQpYCwgc2VnbWVudCk7XG59XG5cbmZ1bmN0aW9uIGlzUHl0aG9uQnVpbGRFeHRDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXiR7cHl0aG9uRXhlY3V0YWJsZVBhdHRlcm4oKX1cXHMrc2V0dXBcXC5weVxccytidWlsZF9leHRcXGJgLCBzZWdtZW50KTtcbn1cblxuZnVuY3Rpb24gaXNQeXRob25TY3JpcHRDb21tYW5kKHNlZ21lbnQ6IHN0cmluZywgaXNIZXJlZG9jU3RkaW5TZWdtZW50OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdHJldHVybiBpc0hlcmVkb2NTdGRpblB5dGhvbkNvbW1hbmQoc2VnbWVudCwgaXNIZXJlZG9jU3RkaW5TZWdtZW50KVxuXHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXiR7cHl0aG9uV2l0aE9wdGlvbnNQYXR0ZXJuKCl9XFxzKyg/Oi1jXFxzKyg/OlwiW15cIl0qXCJ8J1teJ10qJ3xcXFMrKXwoPzpcIlteXCJdK1xcLnB5XCJ8J1teJ10rXFwucHknfFteXFxzLV1cXFMqXFwucHkpKSg/Olxcc3wkKWAsXG5cdFx0XHRzZWdtZW50LFxuXHRcdCk7XG59XG5cbmZ1bmN0aW9uIGlzSGVyZWRvY1N0ZGluUHl0aG9uQ29tbWFuZChzZWdtZW50OiBzdHJpbmcsIGlzSGVyZWRvY1N0ZGluU2VnbWVudDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNIZXJlZG9jU3RkaW5TZWdtZW50XG5cdFx0JiYgcmVnZXhUZXN0KFN0cmluZy5yYXdgXiR7cHl0aG9uRXhlY3V0YWJsZVBhdHRlcm4oKX1cXHMrLSRgLCBzZWdtZW50KTtcbn1cblxuZnVuY3Rpb24gaXNCZW5pZ25TZXR1cENvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBpc1NvdXJjZUFjdGl2YXRlQ29tbWFuZChzZWdtZW50KVxuXHRcdHx8IGlzQmVuaWduUHl0aG9uVmVudkNvbW1hbmQoc2VnbWVudClcblx0XHR8fCByZWdleFRlc3QoXG5cdFx0XHRTdHJpbmcucmF3YF5ta2RpclxccystcFxccysoPzpcIlteXCJdKlwifCdbXiddKid8W15cXHNdKykoPzpcXHMrKD86XCJbXlwiXSpcInwnW14nXSonfFteXFxzXSspKSokYCxcblx0XHRcdHNlZ21lbnQsXG5cdFx0KVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF51bWFza1xccytbMC03XXszLDR9JGAsIHNlZ21lbnQpXG5cdFx0fHwgcmVnZXhUZXN0KFxuXHRcdFx0U3RyaW5nLnJhd2BedW5zZXRcXHMrW0EtWmEtel9dW0EtWmEtejAtOV9dKig/OlxccytbQS1aYS16X11bQS1aYS16MC05X10qKSokYCxcblx0XHRcdHNlZ21lbnQsXG5cdFx0KVxuXHRcdHx8IHNlZ21lbnQgPT09ICdoYXNoIC1yJ1xuXHRcdHx8IGlzQmVuaWduQ29yZXBhY2tZYXJuU2V0dXBDb21tYW5kKHNlZ21lbnQpXG5cdFx0fHwgaXNMaXRlcmFsU2VwYXJhdG9yQ29tbWFuZChzZWdtZW50KTtcbn1cblxuZnVuY3Rpb24gaXNTb3VyY2VBY3RpdmF0ZUNvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BeKD86c291cmNlfFxcLilcXHMrKD86XCJbXlwiXSooPzpefC8pYWN0aXZhdGVcInwnW14nXSooPzpefC8pYWN0aXZhdGUnfFxcUyooPzpefC8pYWN0aXZhdGUpJGAsXG5cdFx0c2VnbWVudCxcblx0KTtcbn1cblxuZnVuY3Rpb24gaXNCZW5pZ25Db3JlcGFja1lhcm5TZXR1cENvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2BeY29yZXBhY2tcXHMrKD86ZW5hYmxlfHByZXBhcmVcXHMreWFybkBcXFMrXFxzKy0tYWN0aXZhdGUpJGAsIHNlZ21lbnQpO1xufVxuXG5mdW5jdGlvbiBpc0JlbmlnblB5dGhvblZlbnZDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXiR7cHl0aG9uRXhlY3V0YWJsZVBhdHRlcm4oKX1cXHMrLW1cXHMrdmVudig/OlxccytcXFMrKSskYCwgc2VnbWVudClcblx0XHQmJiAhcmVnZXhUZXN0KFN0cmluZy5yYXdgXFxzKD86LS1oZWxwfC1oKSg/Olxcc3wkKWAsIHNlZ21lbnQpO1xufVxuXG5mdW5jdGlvbiBpc0JlbmlnbkdvZm10V3JpdGVDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXmdvZm10XFxzKy13KD86XFxzKyg/OlwiW15cIi1dW15cIl0qXCJ8J1teJy1dW14nXSonfFteLVxcc11cXFMqKSkrJGAsXG5cdFx0c2VnbWVudCxcblx0KTtcbn1cblxuZnVuY3Rpb24gaXNCZW5pZ25UYXJiYWxsQ2xlYW51cENvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2Becm1cXHMrLWZcXHMrKD86XCJbXlwiXStcXC50Z3pcInwnW14nXStcXC50Z3onfFxcUytcXC50Z3opJGAsXG5cdFx0c2VnbWVudCxcblx0KTtcbn1cblxuZnVuY3Rpb24gaXNCZW5pZ25QeXRob25CdWlsZENsZWFudXBDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXnJtXFxzKy1yZlxccytkaXN0XFxzK2J1aWxkXFxzK1xcKlxcLmVnZy1pbmZvJGAsIHNlZ21lbnQpO1xufVxuXG5mdW5jdGlvbiBpc0JlbmlnblZlcnNpb25Db21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXi9cXFMrXFxzKyg/Oi0tdmVyc2lvbnwtdmVyc2lvbnx2ZXJzaW9uKSRgLCBzZWdtZW50KTtcbn1cblxuZnVuY3Rpb24gaXNBc3NpZ25tZW50TGlzdChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF4oPzpbQS1aYS16X11bQS1aYS16MC05X10qPSg/OlwiW15cIl0qXCJ8J1teJ10qJ3xbXlxcc10rKSkoPzpcXHMrW0EtWmEtel9dW0EtWmEtejAtOV9dKj0oPzpcIlteXCJdKlwifCdbXiddKid8W15cXHNdKykpKiRgLFxuXHRcdHNlZ21lbnQsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIHN0cmlwRW52aXJvbm1lbnRBc3NpZ25tZW50UHJlZml4KHNlZ21lbnQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiByZWdleFJlcGxhY2VBbGwoXG5cdFx0U3RyaW5nLnJhd2BeKFtBLVphLXpfXVtBLVphLXowLTlfXSo9KD86XCJbXlwiXSpcInwnW14nXSonfFxcUyspXFxzKykrYCxcblx0XHRzZWdtZW50LFxuXHRcdCcnLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBzdHJpcFNhZmVDb21tYW5kV3JhcHBlcnMoc2VnbWVudDogc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IGN1cnJlbnQgPSBzZWdtZW50O1xuXHRmb3IgKGxldCBpdGVyYXRpb24gPSAwOyBpdGVyYXRpb24gPCAzOyBpdGVyYXRpb24rKykge1xuXHRcdGNvbnN0IGJlZm9yZSA9IGN1cnJlbnQ7XG5cdFx0Y3VycmVudCA9IHN0cmlwRW52aXJvbm1lbnRBc3NpZ25tZW50UHJlZml4KHJlZ2V4UmVwbGFjZUFsbChcblx0XHRcdFN0cmluZy5yYXdgXnRpbWVvdXRcXHMrXFxkKyg/OltzbWhkXSk/XFxzK2AsXG5cdFx0XHRjdXJyZW50LFxuXHRcdFx0JycsXG5cdFx0KSk7XG5cdFx0Y3VycmVudCA9IHN0cmlwRW52aXJvbm1lbnRBc3NpZ25tZW50UHJlZml4KHJlZ2V4UmVwbGFjZUFsbChcblx0XHRcdFN0cmluZy5yYXdgXmVudig/OlxccytbQS1aYS16X11bQS1aYS16MC05X10qPSg/OlwiW15cIl0qXCJ8J1teJ10qJ3xcXFMrKSkrXFxzK2AsXG5cdFx0XHRjdXJyZW50LFxuXHRcdFx0JycsXG5cdFx0KSk7XG5cdFx0aWYgKGN1cnJlbnQgPT09IGJlZm9yZSkge1xuXHRcdFx0cmV0dXJuIGN1cnJlbnQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBjdXJyZW50O1xufVxuXG5mdW5jdGlvbiBpc0xpdGVyYWxTZXBhcmF0b3JDb21tYW5kKHNlZ21lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXmVjaG8oPzpcXHMrLW4pPyg/OlxccysoPzpcIltcXHMjPV8uOi8qK1xcLVtcXF1dezEsMTl9XCJ8J1tcXHMjPV8uOi8qK1xcLVtcXF1dezEsMTl9JykpKyRgLFxuXHRcdHNlZ21lbnQsXG5cdCkgfHwgcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXnByaW50ZlxccysoPzpcIig/OltcXHMjPV8uOi8qK1xcLVtcXF1dfFxcXFxufFxcXFx0KXsxLDE5fVwifCcoPzpbXFxzIz1fLjovKitcXC1bXFxdXXxcXFxcbnxcXFxcdCl7MSwxOX0nKSRgLFxuXHRcdHNlZ21lbnQsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGlzU2FmZVNoZWxsR3JlcENvbW1hbmQoc2VnbWVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IHRva2VucyA9IHNwbGl0V2hpdGVzcGFjZShzZWdtZW50KTtcblx0Y29uc3QgY29tbWFuZCA9IHRva2Vuc1swXTtcblx0aWYgKGNvbW1hbmQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoIShjb21tYW5kID09PSAncmcnIHx8IGNvbW1hbmQgPT09ICdncmVwJyB8fCBjb21tYW5kID09PSAnZWdyZXAnIHx8IGNvbW1hbmQgPT09ICdmZ3JlcCcpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y29uc3QgYXJncyA9IHRva2Vucy5zbGljZSgxKTtcblx0bGV0IHBhdHRlcm5Db3VudCA9IDA7XG5cdGxldCBpID0gMDtcblx0d2hpbGUgKGkgPCBhcmdzLmxlbmd0aCkge1xuXHRcdGNvbnN0IGFyZyA9IGFyZ3NbaV07XG5cdFx0aWYgKGFyZyA9PT0gJy0tJykge1xuXHRcdFx0cmV0dXJuIGkgPCBhcmdzLmxlbmd0aCAtIDFcblx0XHRcdFx0JiYgIWFyZ3Muc2xpY2UoaSArIDEpLnNvbWUoYSA9PiBpc1NhdmVkVG9vbE91dHB1dFBhdGgoYSkpO1xuXHRcdH1cblx0XHRpZiAoYXJnID09PSAnLWUnIHx8IGFyZyA9PT0gJy0tcmVnZXhwJykge1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0aWYgKGkgPj0gYXJncy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cGF0dGVybkNvdW50ICs9IDE7XG5cdFx0XHRpZiAocGF0dGVybkNvdW50ID4gMSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKChhcmcuc3RhcnRzV2l0aCgnLWUnKSAmJiBhcmcubGVuZ3RoID4gMikgfHwgYXJnLnN0YXJ0c1dpdGgoJy0tcmVnZXhwPScpKSB7XG5cdFx0XHRwYXR0ZXJuQ291bnQgKz0gMTtcblx0XHRcdGlmIChwYXR0ZXJuQ291bnQgPiAxKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoaXNTaGVsbEdyZXBGbGFnV2l0aFZhbHVlKGFyZykpIHtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGlmIChpID49IGFyZ3MubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAocmVnZXhUZXN0KFN0cmluZy5yYXdgXig/Oi0tZ2xvYnwtLWluY2x1ZGV8LS1leGNsdWRlfC0tZXhjbHVkZS1kaXIpPWAsIGFyZykpIHtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoYXJnLnN0YXJ0c1dpdGgoJy0nKSkge1xuXHRcdFx0aWYgKGlzVW5zYWZlU2hlbGxHcmVwRmxhZyhhcmcpIHx8ICFpc1NhZmVTaGVsbEdyZXBGbGFnKGNvbW1hbmQsIGFyZykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aSArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChpc1NhdmVkVG9vbE91dHB1dFBhdGgoYXJnKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAocGF0dGVybkNvdW50ID09PSAwKSB7XG5cdFx0XHRwYXR0ZXJuQ291bnQgKz0gMTtcblx0XHR9XG5cdFx0aSArPSAxO1xuXHR9XG5cdHJldHVybiBwYXR0ZXJuQ291bnQgPT09IDE7XG59XG5cbmZ1bmN0aW9uIGlzU2hlbGxHcmVwRmxhZ1dpdGhWYWx1ZShhcmc6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYXJnID09PSAnLWcnIHx8IGFyZyA9PT0gJy0tZ2xvYicgfHwgYXJnID09PSAnLS1pbmNsdWRlJyB8fCBhcmcgPT09ICctLWV4Y2x1ZGUnIHx8IGFyZyA9PT0gJy0tZXhjbHVkZS1kaXInO1xufVxuXG5mdW5jdGlvbiBpc1NhZmVTaGVsbEdyZXBGbGFnKGNvbW1hbmQ6IHN0cmluZywgYXJnOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIChjb21tYW5kID09PSAncmcnXG5cdFx0PyByZWdleFRlc3QoU3RyaW5nLnJhd2BeLVtuSGl3eEVGUF0rJGAsIGFyZylcblx0XHQ6IHJlZ2V4VGVzdChTdHJpbmcucmF3YF4tW25IaXd4RXJSRlBdKyRgLCBhcmcpKVxuXHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXig/Oi0tbGluZS1udW1iZXJ8LS13aXRoLWZpbGVuYW1lfC0tbm8taGVhZGluZ3wtLWlnbm9yZS1jYXNlfC0td29yZC1yZWdleHB8LS1saW5lLXJlZ2V4cHwtLXJlY3Vyc2l2ZXwtLWV4dGVuZGVkLXJlZ2V4cHwtLWZpeGVkLXN0cmluZ3N8LS1wZXJsLXJlZ2V4cHwtLWNvbG9yPW5ldmVyKSRgLFxuXHRcdFx0YXJnLFxuXHRcdCk7XG59XG5cbmZ1bmN0aW9uIGlzVW5zYWZlU2hlbGxHcmVwRmxhZyhhcmc6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYXJnID09PSAnLWYnXG5cdFx0fHwgYXJnID09PSAnLS1maWxlJ1xuXHRcdHx8IGFyZy5zdGFydHNXaXRoKCctLWZpbGU9Jylcblx0XHR8fCByZWdleFRlc3QoXG5cdFx0XHRTdHJpbmcucmF3YF4oPzotLWpzb258LS12aW1ncmVwfC0tZmlsZXN8LS10eXBlLWxpc3R8LS1oZWFkaW5nfC0tbm8tbGluZS1udW1iZXJ8LS1uby1maWxlbmFtZXwtLWNvdW50fC0tY291bnQtbWF0Y2hlc3wtLWZpbGVzLXdpdGgoPzpvdXQpPy1tYXRjaGVzfC0tb25seS1tYXRjaGluZ3wtLXF1aWV0fC0tbnVsbHwtLW51bGwtZGF0YXwtLXRleHR8LS1iaW5hcnl8LS1jb250ZXh0fC0tYmVmb3JlLWNvbnRleHR8LS1hZnRlci1jb250ZXh0fC0taW52ZXJ0LW1hdGNofC0tcGFzc3RocnV8LS1yZXBsYWNlfC0tbGluZS1idWZmZXJlZHwtLWNvbG9yPWFsd2F5cykkYCxcblx0XHRcdGFyZyxcblx0XHQpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXi1bXi1dKltBLUNMbGNvcXZaMF1gLCBhcmcpO1xufVxuXG5mdW5jdGlvbiBpc1NhZmVTdHJlYW1pbmdHcmVwVGFpbChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgYXJnc1RleHQgPSBzdHJpcFByZWZpeChzZWdtZW50LCAnZ3JlcCAnKSA/PyBzdHJpcFByZWZpeChzZWdtZW50LCAnZWdyZXAgJykgPz8gc3RyaXBQcmVmaXgoc2VnbWVudCwgJ2ZncmVwICcpO1xuXHRpZiAoYXJnc1RleHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBhcmdzID0gc3BsaXRXaGl0ZXNwYWNlKGFyZ3NUZXh0KTtcblx0bGV0IHBhdHRlcm5Db3VudCA9IDA7XG5cdGxldCBpID0gMDtcblx0d2hpbGUgKGkgPCBhcmdzLmxlbmd0aCkge1xuXHRcdGNvbnN0IGFyZyA9IGFyZ3NbaV07XG5cdFx0aWYgKGFyZyA9PT0gJy0tJykge1xuXHRcdFx0cmV0dXJuIGkgPT09IGFyZ3MubGVuZ3RoIC0gMTtcblx0XHR9XG5cdFx0aWYgKGFyZyA9PT0gJy1lJyB8fCBhcmcgPT09ICctLXJlZ2V4cCcpIHtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGlmIChpID49IGFyZ3MubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHBhdHRlcm5Db3VudCArPSAxO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmICgoYXJnLnN0YXJ0c1dpdGgoJy1lJykgJiYgYXJnLmxlbmd0aCA+IDIpIHx8IGFyZy5zdGFydHNXaXRoKCctLXJlZ2V4cD0nKSkge1xuXHRcdFx0cGF0dGVybkNvdW50ICs9IDE7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKGFyZyA9PT0gJy1mJ1xuXHRcdFx0fHwgYXJnID09PSAnLS1maWxlJ1xuXHRcdFx0fHwgYXJnLnN0YXJ0c1dpdGgoJy0tZmlsZT0nKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXi1bXi1dKltjQ2ZGUFJyTGxtb3FdYCwgYXJnKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFxuXHRcdFx0XHRTdHJpbmcucmF3YF4oPzotLSg/OmNvdW50fGZpeGVkLXN0cmluZ3N8cGVybC1yZWdleHB8cmVjdXJzaXZlfGRlcmVmZXJlbmNlLXJlY3Vyc2l2ZXxmaWxlcy13aXRoLW1hdGNoZXN8ZmlsZXMtd2l0aG91dC1tYXRjaHxvbmx5LW1hdGNoaW5nfHF1aWV0fGluY2x1ZGV8ZXhjbHVkZXxleGNsdWRlLWRpcil8LS0oPzppbmNsdWRlfGV4Y2x1ZGV8ZXhjbHVkZS1kaXIpPSlgLFxuXHRcdFx0XHRhcmcsXG5cdFx0XHQpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChhcmcuc3RhcnRzV2l0aCgnLScpKSB7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0cGF0dGVybkNvdW50ICs9IDE7XG5cdFx0aWYgKHBhdHRlcm5Db3VudCA+IDEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aSArPSAxO1xuXHR9XG5cdHJldHVybiBwYXR0ZXJuQ291bnQgPT09IDE7XG59XG5cbmZ1bmN0aW9uIGlzU2FmZVN0cmVhbWluZ0ZsYWdPbmx5VGFpbChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgdG9rZW5zID0gc3BsaXRXaGl0ZXNwYWNlKHNlZ21lbnQpO1xuXHRjb25zdCBjb21tYW5kID0gdG9rZW5zWzBdO1xuXHRpZiAoY29tbWFuZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICghKGNvbW1hbmQgPT09ICd3YycgfHwgY29tbWFuZCA9PT0gJ3NvcnQnIHx8IGNvbW1hbmQgPT09ICd1bmlxJyB8fCBjb21tYW5kID09PSAnY3V0JykpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgYXJncyA9IHRva2Vucy5zbGljZSgxKTtcblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IGFyZ3MubGVuZ3RoKSB7XG5cdFx0Y29uc3QgYXJnID0gYXJnc1tpXTtcblx0XHRpZiAoYXJnID09PSAnLS0nKSB7XG5cdFx0XHRyZXR1cm4gaSA9PT0gYXJncy5sZW5ndGggLSAxO1xuXHRcdH1cblx0XHRpZiAoY29tbWFuZCA9PT0gJ3NvcnQnICYmIChhcmcgPT09ICctbycgfHwgYXJnID09PSAnLS1vdXRwdXQnIHx8IGFyZy5zdGFydHNXaXRoKCctLW91dHB1dD0nKSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGNvbW1hbmQgPT09ICdjdXQnICYmIChhcmcgPT09ICctZCcgfHwgYXJnID09PSAnLWYnIHx8IGFyZyA9PT0gJy1jJyB8fCBhcmcgPT09ICctYicpKSB7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRpZiAoaSA+PSBhcmdzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKCFhcmcuc3RhcnRzV2l0aCgnLScpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGkgKz0gMTtcblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaXNTYXZlZFRvb2xPdXRwdXRQYXRoKGFyZzogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2AoPzpefC8pKD86XFxkKy1jb3BpbG90LXRvb2wtb3V0cHV0LXxjb3BpbG90LXRvb2wtb3V0cHV0KD86LW9yaWdpbmFsKT8tfG9yaWdpbmFsLW91dHB1dC1cXGQrLSlgLFxuXHRcdGFyZyxcblx0KTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplU2VnbWVudChzZWdtZW50OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCB0cmltbWVkID0gc2VnbWVudC50cmltKCk7XG5cdGNvbnN0IHdpdGhvdXRSZWRpcmVjdHMgPSByZWdleFJlcGxhY2VBbGwoU3RyaW5nLnJhd2BcXHMrKD86Mj4mMXwxPiYyKVxcYmAsIHRyaW1tZWQsICcnKTtcblx0cmV0dXJuIHJlZ2V4UmVwbGFjZUFsbChTdHJpbmcucmF3YFxccytgLCB3aXRob3V0UmVkaXJlY3RzLCAnICcpO1xufVxuXG5mdW5jdGlvbiByZXBsYWNlU2FmZUNvbW1hbmRTdWJzdGl0dXRpb25zKGNvbW1hbmQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghcmVnZXhUZXN0KFN0cmluZy5yYXdgXFxidG9vbHMvbGludGVyL2FkYXB0ZXJzL2NsYW5nZm9ybWF0X2xpbnRlclxcLnB5XFxiYCwgY29tbWFuZCkpIHtcblx0XHRyZXR1cm4gY29tbWFuZDtcblx0fVxuXHRyZXR1cm4gcmVnZXhSZXBsYWNlQWxsKFxuXHRcdCdcXFxcJFxcXFwoXFxcXHMqZ2l0XFxcXHMrLS1uby1wYWdlclxcXFxzK2xzLWZpbGVzKD86XFxcXHMrKD86XCJbXlwiYCQoKV0qXCJ8XFwnW15cXCdgJCgpXSpcXCd8W15cXCdcImAoKSQ7Jjw+fFxcXFxzXSspKSpcXFxccypcXFxcKScsXG5cdFx0Y29tbWFuZCxcblx0XHQnX19TQUZFX0dJVF9MU19GSUxFU19fJyxcblx0KTtcbn1cblxuZnVuY3Rpb24gc3BsaXRDb21tYW5kU2VnbWVudHMoY29tbWFuZDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRjb25zdCBzZWdtZW50czogc3RyaW5nW10gPSBbXTtcblx0bGV0IHN0YXJ0ID0gMDtcblx0bGV0IGluU2luZ2xlID0gZmFsc2U7XG5cdGxldCBpbkRvdWJsZSA9IGZhbHNlO1xuXHRsZXQgaWR4ID0gMDtcblx0d2hpbGUgKGlkeCA8IGNvbW1hbmQubGVuZ3RoKSB7XG5cdFx0Y29uc3QgY2ggPSBjb21tYW5kW2lkeF07XG5cdFx0Y29uc3QgbmV4dCA9IGlkeCArIDEgPCBjb21tYW5kLmxlbmd0aCA/IGNvbW1hbmRbaWR4ICsgMV0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGNoID09PSAnXFwnJyAmJiAhaW5Eb3VibGUpIHtcblx0XHRcdGluU2luZ2xlID0gIWluU2luZ2xlO1xuXHRcdH0gZWxzZSBpZiAoY2ggPT09ICdcIicgJiYgIWluU2luZ2xlICYmICFpc0VzY2FwZWRCeU9kZEJhY2tzbGFzaGVzKGNvbW1hbmQsIGlkeCkpIHtcblx0XHRcdGluRG91YmxlID0gIWluRG91YmxlO1xuXHRcdH0gZWxzZSBpZiAoIWluU2luZ2xlICYmICFpbkRvdWJsZVxuXHRcdFx0JiYgKChjaCA9PT0gJyYnICYmIG5leHQgPT09ICcmJykgfHwgKGNoID09PSAnfCcgJiYgbmV4dCA9PT0gJ3wnKSlcblx0XHQpIHtcblx0XHRcdHB1c2hDb21tYW5kU2VnbWVudChzZWdtZW50cywgY29tbWFuZC5zbGljZShzdGFydCwgaWR4KSk7XG5cdFx0XHRzdGFydCA9IGlkeCArIDI7XG5cdFx0XHRpZHggKz0gMTtcblx0XHR9IGVsc2UgaWYgKCFpblNpbmdsZSAmJiAhaW5Eb3VibGUgJiYgKGNoID09PSAnXFxuJyB8fCBjaCA9PT0gJ1xccicpKSB7XG5cdFx0XHRwdXNoQ29tbWFuZFNlZ21lbnQoc2VnbWVudHMsIGNvbW1hbmQuc2xpY2Uoc3RhcnQsIGlkeCkpO1xuXHRcdFx0bGV0IG5leHRTdGFydCA9IGlkeCArIDE7XG5cdFx0XHRpZiAoY2ggPT09ICdcXHInICYmIG5leHQgPT09ICdcXG4nKSB7XG5cdFx0XHRcdGlkeCArPSAxO1xuXHRcdFx0XHRuZXh0U3RhcnQgKz0gMTtcblx0XHRcdH1cblx0XHRcdHN0YXJ0ID0gbmV4dFN0YXJ0O1xuXHRcdH1cblx0XHRpZHggKz0gMTtcblx0fVxuXHRwdXNoQ29tbWFuZFNlZ21lbnQoc2VnbWVudHMsIGNvbW1hbmQuc2xpY2Uoc3RhcnQpKTtcblx0cmV0dXJuIHNlZ21lbnRzO1xufVxuXG5mdW5jdGlvbiBwdXNoQ29tbWFuZFNlZ21lbnQoc2VnbWVudHM6IHN0cmluZ1tdLCBzZWdtZW50OiBzdHJpbmcpOiB2b2lkIHtcblx0Y29uc3QgdHJpbW1lZCA9IHNlZ21lbnQudHJpbSgpO1xuXHRpZiAodHJpbW1lZC5sZW5ndGggIT09IDApIHtcblx0XHRzZWdtZW50cy5wdXNoKHRyaW1tZWQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHN0cmlwUXVvdGVkVGV4dChjb21tYW5kOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgc3RyaXBwZWQgPSAnJztcblx0bGV0IGluU2luZ2xlID0gZmFsc2U7XG5cdGxldCBpbkRvdWJsZSA9IGZhbHNlO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGNvbW1hbmQubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBjaCA9IGNvbW1hbmRbaV07XG5cdFx0aWYgKGNoID09PSAnXFwnJyAmJiAhaW5Eb3VibGUpIHtcblx0XHRcdGluU2luZ2xlID0gIWluU2luZ2xlO1xuXHRcdFx0c3RyaXBwZWQgKz0gY2g7XG5cdFx0fSBlbHNlIGlmIChjaCA9PT0gJ1wiJyAmJiAhaW5TaW5nbGUgJiYgIWlzRXNjYXBlZEJ5T2RkQmFja3NsYXNoZXMoY29tbWFuZCwgaSkpIHtcblx0XHRcdGluRG91YmxlID0gIWluRG91YmxlO1xuXHRcdFx0c3RyaXBwZWQgKz0gY2g7XG5cdFx0fSBlbHNlIGlmIChpblNpbmdsZSkge1xuXHRcdFx0c3RyaXBwZWQgKz0gJyAnO1xuXHRcdH0gZWxzZSBpZiAoaW5Eb3VibGUpIHtcblx0XHRcdHN0cmlwcGVkICs9IChjaCA9PT0gJyQnIHx8IGNoID09PSAnKCcgfHwgY2ggPT09ICdgJykgPyBjaCA6ICcgJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3RyaXBwZWQgKz0gY2g7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBzdHJpcHBlZDtcbn1cblxuZnVuY3Rpb24gaXNFc2NhcGVkQnlPZGRCYWNrc2xhc2hlcyh0ZXh0OiBzdHJpbmcsIGluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcblx0bGV0IGNvdW50ID0gMDtcblx0bGV0IGkgPSBpbmRleDtcblx0d2hpbGUgKGkgPiAwKSB7XG5cdFx0aSAtPSAxO1xuXHRcdGlmICh0ZXh0W2ldID09PSAnXFxcXCcpIHtcblx0XHRcdGNvdW50ICs9IDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gY291bnQgJSAyID09PSAxO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHNoZWxsX291dHB1dF9jb21wYWN0b3IucnMgXHUyMDE0IGhlcmVkb2MgcGFyc2luZywgZXJyZXhpdCwgb3V0cHV0IGRldGVjdG9ycywgcHl0aG9uIHBhdHRlcm5zXG5cbmZ1bmN0aW9uIGlzV2hpdGVzcGFjZUNoYXIoY2g6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gL1xccy8udGVzdChjaCk7XG59XG5cbi8qKiBSdXN0IGBzdHI6OnN0YXJ0c193aXRoKGNoYXI6OmlzX3doaXRlc3BhY2UpYDogdHJ1ZSB3aGVuIHRoZSBmaXJzdCBjaGFyYWN0ZXIgaXMgd2hpdGVzcGFjZS4gKi9cbmZ1bmN0aW9uIHN0YXJ0c1dpdGhXaGl0ZXNwYWNlKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gbGluZS5sZW5ndGggPiAwICYmIGlzV2hpdGVzcGFjZUNoYXIobGluZVswXSk7XG59XG5cbmZ1bmN0aW9uIHN0cmlwSGVyZWRvY0JvZGllcyhjb21tYW5kOiBzdHJpbmcpOiBIZXJlZG9jU3RyaXBwZWRDb21tYW5kIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbGluZXMgPSBjb21tYW5kLnNwbGl0KCdcXG4nKS5tYXAobGluZSA9PiBzdHJpcFN1ZmZpeChsaW5lLCAnXFxyJykgPz8gbGluZSk7XG5cdGNvbnN0IHN0cmlwcGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBoZXJlZG9jU3RkaW5TZWdtZW50SW5kZXhlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRsZXQgaSA9IDA7XG5cdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoKSB7XG5cdFx0Y29uc3QgbGluZSA9IGxpbmVzW2ldO1xuXHRcdGNvbnN0IGhlcmVkb2MgPSBwYXJzZUhlcmVkb2NPcGVuZXIobGluZSk7XG5cdFx0aWYgKGhlcmVkb2MgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c3RyaXBwZWQucHVzaChsaW5lKTtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmRCZWZvcmVIZXJlZG9jID0gbGFzdENoYWluU2VnbWVudChoZXJlZG9jLnByZWZpeCk7XG5cdFx0aWYgKHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXiR7cHl0aG9uRXhlY3V0YWJsZVBhdHRlcm4oKX1cXHMrLSRgLFxuXHRcdFx0bm9ybWFsaXplU2VnbWVudChjb21tYW5kQmVmb3JlSGVyZWRvYyksXG5cdFx0KSkge1xuXHRcdFx0bGV0IGNvbW1hbmRUaHJvdWdoSGVyZWRvY09wZW5lciA9IHN0cmlwcGVkLmpvaW4oJ1xcbicpO1xuXHRcdFx0aWYgKGNvbW1hbmRUaHJvdWdoSGVyZWRvY09wZW5lci5sZW5ndGggIT09IDApIHtcblx0XHRcdFx0Y29tbWFuZFRocm91Z2hIZXJlZG9jT3BlbmVyICs9ICdcXG4nO1xuXHRcdFx0fVxuXHRcdFx0Y29tbWFuZFRocm91Z2hIZXJlZG9jT3BlbmVyICs9IGhlcmVkb2MucHJlZml4O1xuXHRcdFx0aGVyZWRvY1N0ZGluU2VnbWVudEluZGV4ZXMuYWRkKFxuXHRcdFx0XHRzYXR1cmF0aW5nU3ViKHNwbGl0Q29tbWFuZFNlZ21lbnRzKGNvbW1hbmRUaHJvdWdoSGVyZWRvY09wZW5lcikubGVuZ3RoLCAxKSxcblx0XHRcdCk7XG5cdFx0fVxuXHRcdHN0cmlwcGVkLnB1c2goYCR7aGVyZWRvYy5wcmVmaXh9ICR7aGVyZWRvYy5zdWZmaXh9YC50cmltRW5kKCkpO1xuXHRcdGkgKz0gMTtcblx0XHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCAmJiBsaW5lc1tpXS50cmltKCkgIT09IGhlcmVkb2MuZGVsaW1pdGVyKSB7XG5cdFx0XHRpICs9IDE7XG5cdFx0fVxuXHRcdGlmIChpID49IGxpbmVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aSArPSAxO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0Y29tbWFuZDogc3RyaXBwZWQuam9pbignXFxuJyksXG5cdFx0aGVyZWRvY1N0ZGluU2VnbWVudEluZGV4ZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHBhcnNlSGVyZWRvY09wZW5lcihsaW5lOiBzdHJpbmcpOiBIZXJlZG9jT3BlbmVyIHwgdW5kZWZpbmVkIHtcblx0bGV0IGluU2luZ2xlID0gZmFsc2U7XG5cdGxldCBpbkRvdWJsZSA9IGZhbHNlO1xuXHRsZXQgaW5kZXggPSAwO1xuXHR3aGlsZSAoaW5kZXggKyAxIDwgbGluZS5sZW5ndGgpIHtcblx0XHRjb25zdCBjaCA9IGxpbmVbaW5kZXhdO1xuXHRcdGlmIChjaCA9PT0gJ1xcJycgJiYgIWluRG91YmxlKSB7XG5cdFx0XHRpblNpbmdsZSA9ICFpblNpbmdsZTtcblx0XHRcdGluZGV4ICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKGNoID09PSAnXCInICYmICFpblNpbmdsZSAmJiAhaXNFc2NhcGVkQnlPZGRCYWNrc2xhc2hlcyhsaW5lLCBpbmRleCkpIHtcblx0XHRcdGluRG91YmxlID0gIWluRG91YmxlO1xuXHRcdFx0aW5kZXggKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoIWluU2luZ2xlICYmICFpbkRvdWJsZSAmJiBjaCA9PT0gJyMnXG5cdFx0XHQmJiAoaW5kZXggPT09IDAgfHwgaXNXaGl0ZXNwYWNlQ2hhcihsaW5lW2luZGV4IC0gMV0pKVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGluU2luZ2xlIHx8IGluRG91YmxlIHx8IGNoICE9PSAnPCcgfHwgbGluZVtpbmRleCArIDFdICE9PSAnPCcpIHtcblx0XHRcdGluZGV4ICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRsZXQgY3Vyc29yID0gaW5kZXggKyAyO1xuXHRcdGlmIChsaW5lW2N1cnNvcl0gPT09ICctJykge1xuXHRcdFx0Y3Vyc29yICs9IDE7XG5cdFx0fVxuXHRcdHdoaWxlIChjdXJzb3IgPCBsaW5lLmxlbmd0aCAmJiBpc1doaXRlc3BhY2VDaGFyKGxpbmVbY3Vyc29yXSkpIHtcblx0XHRcdGN1cnNvciArPSAxO1xuXHRcdH1cblxuXHRcdGxldCBkZWxpbWl0ZXIgPSAnJztcblx0XHRjb25zdCBxdW90ZSA9IGN1cnNvciA8IGxpbmUubGVuZ3RoID8gbGluZVtjdXJzb3JdIDogdW5kZWZpbmVkO1xuXHRcdGlmIChxdW90ZSA9PT0gJ1xcJycgfHwgcXVvdGUgPT09ICdcIicpIHtcblx0XHRcdGN1cnNvciArPSAxO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBjdXJzb3I7XG5cdFx0XHR3aGlsZSAoY3Vyc29yIDwgbGluZS5sZW5ndGggJiYgbGluZVtjdXJzb3JdICE9PSBxdW90ZSkge1xuXHRcdFx0XHRjdXJzb3IgKz0gMTtcblx0XHRcdH1cblx0XHRcdGlmIChjdXJzb3IgPj0gbGluZS5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGRlbGltaXRlciArPSBsaW5lLnNsaWNlKHN0YXJ0LCBjdXJzb3IpO1xuXHRcdFx0Y3Vyc29yICs9IDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gY3Vyc29yO1xuXHRcdFx0d2hpbGUgKGN1cnNvciA8IGxpbmUubGVuZ3RoICYmICFpc1doaXRlc3BhY2VDaGFyKGxpbmVbY3Vyc29yXSkpIHtcblx0XHRcdFx0Y3Vyc29yICs9IDE7XG5cdFx0XHR9XG5cdFx0XHRkZWxpbWl0ZXIgKz0gbGluZS5zbGljZShzdGFydCwgY3Vyc29yKTtcblx0XHR9XG5cblx0XHRpZiAoIXJlZ2V4VGVzdChTdHJpbmcucmF3YF5bQS1aYS16X11bQS1aYS16MC05X10qJGAsIGRlbGltaXRlcikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRwcmVmaXg6IGxpbmUuc2xpY2UoMCwgaW5kZXgpLFxuXHRcdFx0c3VmZml4OiBsaW5lLnNsaWNlKGN1cnNvciksXG5cdFx0XHRkZWxpbWl0ZXIsXG5cdFx0fTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBsYXN0Q2hhaW5TZWdtZW50KGNvbW1hbmRQcmVmaXg6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHBhcnRzID0gY29tbWFuZFByZWZpeC5zcGxpdChuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxzKig/OiYmfFxcfFxcfHw7KVxccypgKSk7XG5cdGNvbnN0IGxhc3QgPSBwYXJ0cy5sZW5ndGggPiAwID8gcGFydHNbcGFydHMubGVuZ3RoIC0gMV0gOiBjb21tYW5kUHJlZml4O1xuXHRyZXR1cm4gbGFzdC50cmltKCk7XG59XG5cbmZ1bmN0aW9uIGhhc0VycmV4aXRCZWZvcmVGaXJzdENvbW1hbmQoXG5cdHNlZ21lbnRzOiBzdHJpbmdbXSxcblx0c2VnbWVudEtpbmRzOiBDbGFzc2lmaWVkQ29tbWFuZFNlZ21lbnRbXSxcbik6IGJvb2xlYW4ge1xuXHRsZXQgZmlyc3ROb25CZW5pZ24gPSBzZWdtZW50S2luZHMuZmluZEluZGV4KGtpbmQgPT4gIXNlZ21lbnRzRXF1YWwoa2luZCwgQkVOSUdOX1NFR01FTlQpKTtcblx0aWYgKGZpcnN0Tm9uQmVuaWduID09PSAtMSkge1xuXHRcdGZpcnN0Tm9uQmVuaWduID0gc2VnbWVudEtpbmRzLmxlbmd0aDtcblx0fVxuXHRyZXR1cm4gc2VnbWVudHMuc2xpY2UoMCwgZmlyc3ROb25CZW5pZ24pLnNvbWUoc2VnbWVudCA9PiBpc1NldEVDb21tYW5kKHNlZ21lbnQpKTtcbn1cblxuZnVuY3Rpb24gaXNTZXRFQ29tbWFuZChzZWdtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVNlZ21lbnQoc2VnbWVudCk7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2Bec2V0XFxzKy0oPz1bQS1aYS16XSplKVtBLVphLXpdKyg/OlxccytbLStBLVphLXpdKykqJGAsXG5cdFx0bm9ybWFsaXplZCxcblx0KSB8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BcXHMtb1xccytlcnJleGl0XFxiYCwgbm9ybWFsaXplZCk7XG59XG5cbmZ1bmN0aW9uIGNvbW1hbmRSdW5zR29UZXN0KGNvbW1hbmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgKD86XnxbXFxzOyZ8KF0pZ29cXHMrdGVzdCg/Olxcc3wkKWAsXG5cdFx0c3RyaXBRdW90ZWRUZXh0KGNvbW1hbmQpLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBjb21tYW5kTWVudGlvbnNTYXZlZFRvb2xPdXRwdXQoY29tbWFuZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBzcGxpdFdoaXRlc3BhY2UoY29tbWFuZCkuc29tZSh0b2tlbiA9PiBpc1NhdmVkVG9vbE91dHB1dFBhdGgodG9rZW4pKTtcbn1cblxuZnVuY3Rpb24gbG9va3NMaWtlTnBtUGFja091dHB1dChvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gb3V0cHV0LmluY2x1ZGVzKCducG0gbm90aWNlIFRhcmJhbGwgQ29udGVudHMnKSAmJiBvdXRwdXQuaW5jbHVkZXMoJ25wbSBub3RpY2UgVGFyYmFsbCBEZXRhaWxzJyk7XG59XG5cbmZ1bmN0aW9uIGhhc0RvY3VzYXVydXNQcm9ncmVzcyhvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gb3V0cHV0LnNwbGl0KCdcXG4nKS5zb21lKGxpbmUgPT4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxccypcXHUyNUNGXFxzK0NsaWVudFxccytgLCBsaW5lKSlcblx0XHQmJiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PiByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxzKltcXHUyNUNGXFx1MjVFRl1cXHMrU2VydmVyKD86XFxzK3wkKWAsIGxpbmUpKTtcbn1cblxuZnVuY3Rpb24gaGFzUGFzc2luZ0dvVGVzdE91dHB1dChvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIWhhc0dvVGVzdEZhaWx1cmVPdXRwdXQob3V0cHV0KVxuXHRcdCYmIG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+IGlzR29Nb2R1bGVEb3dubG9hZENoYXR0ZXJMaW5lKGxpbmUpKTtcbn1cblxuZnVuY3Rpb24gaGFzR29UZXN0RmFpbHVyZU91dHB1dChvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgKD86XnxcXG4pKD86LS0tIEZBSUw6fEZBSUwoPzpcXHN8JCl8cGFuaWM6fGZhdGFsIGVycm9yOnxcXHMqRXJyb3IgVHJhY2U6fFxcUytcXC5nbzpcXGQrOnwjIFxcUyt8ZGlmZiBcXFMrfC0tLSAoPyFQQVNTOil8XFwrXFwrXFwrIHxAQCB8LipcXFsoPzpidWlsZHxzZXR1cCkgZmFpbGVkXFxdKWAsXG5cdFx0b3V0cHV0LFxuXHQpO1xufVxuXG5mdW5jdGlvbiBweXRob25FeGVjdXRhYmxlUGF0dGVybigpOiBzdHJpbmcge1xuXHRyZXR1cm4gU3RyaW5nLnJhd2AoPzooPzpbQS1aYS16MC05Xy4vKy1dKy8pPyg/OnB5dGhvbnxweXRob24zKD86XFwuXFxkKyk/KSlgO1xufVxuXG5mdW5jdGlvbiBweXRob25XaXRoT3B0aW9uc1BhdHRlcm4oKTogc3RyaW5nIHtcblx0cmV0dXJuIFN0cmluZy5yYXdgJHtweXRob25FeGVjdXRhYmxlUGF0dGVybigpfSg/OlxccysoPzotW0JFc1N0dVV2VnFRXXwtV1xcUyt8LVhcXHMrXFxTKykpKmA7XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gc2hlbGxfb3V0cHV0X2NvbXBhY3Rvci5ycyBcdTIwMTQgb3JjaGVzdHJhdGlvblxuXG5pbnRlcmZhY2UgQ29tcGFjdGlvblN0YXRlIHtcblx0b3V0cHV0OiBzdHJpbmc7XG5cdGxvc3NsZXNzOiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29tcGFjdFNoZWxsT3V0cHV0KFxuXHRjb21tYW5kS2luZHM6IHN0cmluZ1tdLFxuXHRvdXRwdXQ6IHN0cmluZyxcblx0Y29tcGFjdEdvUGFzc2luZ1Rlc3RPdXRwdXQ6IGJvb2xlYW4sXG5cdHNoZWxsR3JlcExhcmdlT3V0cHV0VGhyZXNob2xkOiBudW1iZXIsXG4pOiBUb29sQ29tcGFjdGlvblJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHN0YXRlOiBDb21wYWN0aW9uU3RhdGUgPSB7IG91dHB1dCwgbG9zc2xlc3M6IHRydWUgfTtcblx0YXBwbHlTdHJpbmdDb21wYWN0b3Ioc3RhdGUsIGNvbXBhY3RDYXJyaWFnZVJldHVyblByb2dyZXNzKTtcblx0YXBwbHlTdHJpbmdDb21wYWN0b3Ioc3RhdGUsIGNvbXBhY3ROZWVkcmVzdGFydE5vb3BQcm9ncmVzcyk7XG5cdGFwcGx5U3RyaW5nQ29tcGFjdG9yKHN0YXRlLCBjb21wYWN0R29SdW50aW1lUGFuaWNEdW1wKTtcblx0aWYgKGNvbXBhY3RHb1Bhc3NpbmdUZXN0T3V0cHV0ICYmICFjb21tYW5kS2luZHMuaW5jbHVkZXMoJ2dvJykpIHtcblx0XHRhcHBseVN0cmluZ0NvbXBhY3RvcihzdGF0ZSwgY29tcGFjdEdvT3V0cHV0KTtcblx0fVxuXHRhcHBseVN0cmluZ0NvbXBhY3RvcihzdGF0ZSwgY29tcGFjdEplc3RSdW5zUHJvZ3Jlc3MpO1xuXHRhcHBseVN0cmluZ0NvbXBhY3RvcihzdGF0ZSwgY29tcGFjdERvY3VzYXVydXNQcm9ncmVzcyk7XG5cdGFwcGx5U3RyaW5nQ29tcGFjdG9yKHN0YXRlLCBjb21wYWN0U3BoaW54UHJvZ3Jlc3NGYWxsYmFjayk7XG5cdGlmICghY29tbWFuZEtpbmRzLmluY2x1ZGVzKCducG0tcGFjaycpKSB7XG5cdFx0YXBwbHlTdHJpbmdDb21wYWN0b3Ioc3RhdGUsIGNvbXBhY3ROcG1QYWNrT3V0cHV0KTtcblx0fVxuXHRmb3IgKGNvbnN0IGtpbmQgb2YgQ09NTUFORF9DT01QQUNUT1JfT1JERVIuZmlsdGVyKGNhbmRpZGF0ZSA9PiBjb21tYW5kS2luZHMuaW5jbHVkZXMoY2FuZGlkYXRlKSkpIHtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wYWN0Q29tbWFuZEVudHJ5KGtpbmQsIHN0YXRlLm91dHB1dCwgc2hlbGxHcmVwTGFyZ2VPdXRwdXRUaHJlc2hvbGQpO1xuXHRcdHN0YXRlLm91dHB1dCA9IHJlc3VsdC5vdXRwdXQ7XG5cdFx0c3RhdGUubG9zc2xlc3MgPSBzdGF0ZS5sb3NzbGVzcyAmJiByZXN1bHQubG9zc2xlc3M7XG5cdH1cblxuXHRpZiAoc3RhdGUub3V0cHV0ID09PSBvdXRwdXQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0b3V0cHV0OiBzdGF0ZS5vdXRwdXQsXG5cdFx0bG9zc2xlc3M6IHN0YXRlLmxvc3NsZXNzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBhcHBseVN0cmluZ0NvbXBhY3RvcihzdGF0ZTogQ29tcGFjdGlvblN0YXRlLCBjb21wYWN0OiAob3V0cHV0OiBzdHJpbmcpID0+IHN0cmluZyk6IHZvaWQge1xuXHRjb25zdCBuZXh0ID0gY29tcGFjdChzdGF0ZS5vdXRwdXQpO1xuXHRpZiAobmV4dCAhPT0gc3RhdGUub3V0cHV0KSB7XG5cdFx0c3RhdGUubG9zc2xlc3MgPSBmYWxzZTtcblx0fVxuXHRzdGF0ZS5vdXRwdXQgPSBuZXh0O1xufVxuXG5mdW5jdGlvbiBjb21wYWN0Q29tbWFuZEVudHJ5KFxuXHRraW5kOiBzdHJpbmcsXG5cdG91dHB1dDogc3RyaW5nLFxuXHRzaGVsbEdyZXBMYXJnZU91dHB1dFRocmVzaG9sZDogbnVtYmVyLFxuKTogVG9vbENvbXBhY3Rpb25SZXN1bHQge1xuXHRpZiAoa2luZCA9PT0gJ3NoZWxsLWdyZXAnKSB7XG5cdFx0cmV0dXJuIGNvbXBhY3RUb29sT3V0cHV0KFxuXHRcdFx0J2dyZXAtY29udGVudCcsXG5cdFx0XHRvdXRwdXQsXG5cdFx0XHRzaGVsbEdyZXBMYXJnZU91dHB1dFRocmVzaG9sZCxcblx0XHQpID8/IHVuY2hhbmdlZChvdXRwdXQpO1xuXHR9XG5cblx0Y29uc3Qgb3JpZ2luYWwgPSBvdXRwdXQ7XG5cdGxldCByZXN1bHQ6IHN0cmluZztcblx0c3dpdGNoIChraW5kKSB7XG5cdFx0Y2FzZSAncGlwJzoge1xuXHRcdFx0bGV0IG5leHQgPSBhcHBseVB5dGhvbkJ1aWxkTm9pc2Uob3V0cHV0KTtcblx0XHRcdG5leHQgPSBjb21wYWN0R2l0UHJvZ3Jlc3MobmV4dCk7XG5cdFx0XHRuZXh0ID0gY29tcGFjdFBhY2thZ2VNYW5hZ2VyT3BlcmF0aW9ucyhuZXh0KTtcblx0XHRcdG5leHQgPSBjb21wYWN0UHl0aG9uTmluamFCdWlsZFByb2dyZXNzKG5leHQpO1xuXHRcdFx0cmVzdWx0ID0gY29tcGFjdFBpcEluc3RhbGxQcm9ncmVzcyhuZXh0KTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRjYXNlICdweXRob24tYnVpbGQnOiB7XG5cdFx0XHRsZXQgbmV4dCA9IGFwcGx5UHl0aG9uQnVpbGROb2lzZShvdXRwdXQpO1xuXHRcdFx0bmV4dCA9IGNvbXBhY3RHaXRQcm9ncmVzcyhuZXh0KTtcblx0XHRcdG5leHQgPSBjb21wYWN0U2V0dXB0b29sc0ZpbGVTdGFnaW5nUnVucyhuZXh0KTtcblx0XHRcdG5leHQgPSBjb21wYWN0UHl0aG9uTmluamFCdWlsZFByb2dyZXNzKG5leHQpO1xuXHRcdFx0cmVzdWx0ID0gY29tcGFjdFBpcEluc3RhbGxQcm9ncmVzcyhuZXh0KTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRjYXNlICdweXRlc3QnOiB7XG5cdFx0XHRsZXQgbmV4dCA9IGNvbXBhY3RQeXRob25FY29zeXN0ZW1Ob2lzZShvdXRwdXQpO1xuXHRcdFx0bmV4dCA9IGNvbXBhY3RQeXRlc3RQcm9ncmVzcyhuZXh0KTtcblx0XHRcdG5leHQgPSBjb21wYWN0UHl0ZXN0RmFpbHVyZUJsb2NrcyhuZXh0KTtcblx0XHRcdG5leHQgPSBjb21wYWN0UHl0ZXN0V2FybmluZ3NTdW1tYXJ5KG5leHQpO1xuXHRcdFx0bmV4dCA9IGNvbXBhY3RQeXRlc3RTZXNzaW9uTWV0YWRhdGEobmV4dCk7XG5cdFx0XHRuZXh0ID0gY29tcGFjdFNwaGlueFByb2dyZXNzKG5leHQpO1xuXHRcdFx0cmVzdWx0ID0gY29tcGFjdFJlcGVhdGVkRGlhZ25vc3RpY0Jsb2NrcyhuZXh0KTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRjYXNlICdweXRob24tYnVpbGQtZXh0Jzoge1xuXHRcdFx0bGV0IG5leHQgPSBhcHBseVB5dGhvbkJ1aWxkTm9pc2Uob3V0cHV0KTtcblx0XHRcdG5leHQgPSBjb21wYWN0UHl0aG9uTmluamFCdWlsZFByb2dyZXNzKG5leHQpO1xuXHRcdFx0bmV4dCA9IGNvbXBhY3RQeXRob25CdWlsZEV4dFByb2dyZXNzKG5leHQpO1xuXHRcdFx0bmV4dCA9IGNvbXBhY3RTcGhpbnhQcm9ncmVzcyhuZXh0KTtcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3RSZXBlYXRlZERpYWdub3N0aWNCbG9ja3MobmV4dCk7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0Y2FzZSAnZGphbmdvLXRlc3QnOiB7XG5cdFx0XHRsZXQgbmV4dCA9IGNvbXBhY3RQeXRob25FY29zeXN0ZW1Ob2lzZShvdXRwdXQpO1xuXHRcdFx0bmV4dCA9IGNvbXBhY3REamFuZ29UZXN0Qm9pbGVycGxhdGUobmV4dCk7XG5cdFx0XHRuZXh0ID0gY29tcGFjdERqYW5nb1Rlc3RQcm9ncmVzcyhuZXh0KTtcblx0XHRcdG5leHQgPSBjb21wYWN0UHl0ZXN0V2FybmluZ3NTdW1tYXJ5KG5leHQpO1xuXHRcdFx0bmV4dCA9IGNvbXBhY3RTcGhpbnhQcm9ncmVzcyhuZXh0KTtcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3RSZXBlYXRlZERpYWdub3N0aWNCbG9ja3MobmV4dCk7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0Y2FzZSAncHl0aG9uLXNjcmlwdCc6IHtcblx0XHRcdGxldCBuZXh0ID0gYXBwbHlQeXRob25CdWlsZE5vaXNlKG91dHB1dCk7XG5cdFx0XHRuZXh0ID0gY29tcGFjdFNwaGlueFByb2dyZXNzKG5leHQpO1xuXHRcdFx0cmVzdWx0ID0gY29tcGFjdFJlcGVhdGVkRGlhZ25vc3RpY0Jsb2NrcyhuZXh0KTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRjYXNlICdhcHQnOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdEFwdE91dHB1dChvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnbnBtJzpcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3ROcG1PdXRwdXQob3V0cHV0KTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ25wbS1wYWNrJzpcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3ROcG1QYWNrT3V0cHV0KG91dHB1dCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICd5YXJuLWJlcnJ5Jzpcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3RZYXJuQmVycnlPdXRwdXQob3V0cHV0KTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ3BucG0nOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdFBucG1PdXRwdXQob3V0cHV0KTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2NvbXBvc2VyJzpcblx0XHRjYXNlICdwb2V0cnknOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdFBhY2thZ2VNYW5hZ2VyT3BlcmF0aW9ucyhvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAndXYnOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdFV2UHJvZ3Jlc3MoY29tcGFjdFBhY2thZ2VNYW5hZ2VyT3BlcmF0aW9ucyhvdXRwdXQpKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ21hdmVuJzpcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3RNYXZlbk91dHB1dChvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnZG90bmV0Jzpcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3REb3RuZXRUaW1pbmdQcm9ncmVzcyhvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnZ28nOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdEdvQ29tbWFuZE91dHB1dChvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAndW5pdHRlc3QnOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdFVuaXR0ZXN0T3V0cHV0KG91dHB1dCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdqcy10ZXN0Jzpcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3RKc1Rlc3RPdXRwdXQob3V0cHV0KTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2NhcmdvJzpcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3RDYXJnb1Byb2dyZXNzKG91dHB1dCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdub2RlJzpcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3RSZXBlYXRlZE5vZGVXYXJuaW5ncyhvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnZ2l0Jzpcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3RHaXRQcm9ncmVzcyhvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnZ2l0LWNsZWFuJzpcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3RHaXRDbGVhblJlbW92aW5nUnVucyhvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnbngnOlxuXHRcdFx0cmVzdWx0ID0gY29tcGFjdE54TGVybmFGcmFtZVByb2dyZXNzKG91dHB1dCk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdnb2xhbmdjaS1saW50Jzpcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3RHb2xhbmdjaUxpbnRPdXRwdXQob3V0cHV0LCBmYWxzZSk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlICdjbGFuZy1mb3JtYXQtbGludGVyJzpcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3RDbGFuZ0Zvcm1hdExpbnRlck91dHB1dChvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnZ3JhZGxlJzpcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3RHcmFkbGVPdXRwdXQob3V0cHV0KTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ2NtYWtlJzpcblx0XHRcdHJlc3VsdCA9IGNvbXBhY3RDbWFrZUNvbmZpZ3VyZVByb2JlUnVucyhvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnbWFrZSc6XG5cdFx0XHRyZXN1bHQgPSBjb21wYWN0TWFrZU91dHB1dChvdXRwdXQpO1xuXHRcdFx0YnJlYWs7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJlc3VsdCA9IG91dHB1dDtcblx0XHRcdGJyZWFrO1xuXHR9XG5cdHJldHVybiBzdHJpbmdDb21wYWN0aW9uUmVzdWx0KG9yaWdpbmFsLCByZXN1bHQpO1xufVxuXG5mdW5jdGlvbiBzdHJpbmdDb21wYWN0aW9uUmVzdWx0KG9yaWdpbmFsOiBzdHJpbmcsIG91dHB1dDogc3RyaW5nKTogVG9vbENvbXBhY3Rpb25SZXN1bHQge1xuXHRjb25zdCBsb3NzbGVzcyA9IG91dHB1dCA9PT0gb3JpZ2luYWw7XG5cdHJldHVybiB7IG91dHB1dCwgbG9zc2xlc3MgfTtcbn1cblxuZnVuY3Rpb24gYXBwbHlQeXRob25CdWlsZE5vaXNlKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IG5leHQgPSBjb21wYWN0U2V0dXB0b29sc0RlcHJlY2F0aW9uQmxvY2tzKG91dHB1dCk7XG5cdG5leHQgPSBjb21wYWN0Q3l0aG9uUGVyZm9ybWFuY2VIaW50cyhuZXh0KTtcblx0bmV4dCA9IGNvbXBhY3RDb21waWxlcldhcm5pbmdSdW5zKG5leHQpO1xuXHRuZXh0ID0gY29tcGFjdFB5dGhvbkVjb3N5c3RlbU5vaXNlKG5leHQpO1xuXHRyZXR1cm4gY29tcGFjdE51bXB5RGlzdHV0aWxzUHJvYmVzKG5leHQpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0R29Db21tYW5kT3V0cHV0KG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGNvbXBhY3RSZXBlYXRlZERpYWdub3N0aWNCbG9ja3MoY29tcGFjdEdvT3V0cHV0KG91dHB1dCkpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0TWF2ZW5PdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gY29tcGFjdE1hdmVuSW5mb0JvaWxlcnBsYXRlKGNvbXBhY3RNYXZlblBhc3NpbmdUZXN0cyhcblx0XHRjb21wYWN0TWF2ZW5EZXBlbmRlbmN5VHJhbnNmZXIob3V0cHV0KSxcblx0KSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RQeXRob25FY29zeXN0ZW1Ob2lzZShvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBvbWl0Tm9uRGlhZ25vc3RpY0xpbmVzKFxuXHRcdG91dHB1dCxcblx0XHQncHl0aG9uIGVjb3N5c3RlbSBub2lzZScsXG5cdFx0aXNQeXRob25FY29zeXN0ZW1Ob2lzZUxpbmUsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RQaXBJbnN0YWxsUHJvZ3Jlc3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gb21pdE5vbkRpYWdub3N0aWNMaW5lcyhvdXRwdXQsICdwaXAgaW5zdGFsbCBwcm9ncmVzcycsIGlzUGlwSW5zdGFsbFByb2dyZXNzTGluZSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RQeXRob25OaW5qYUJ1aWxkUHJvZ3Jlc3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gb21pdE5vbkRpYWdub3N0aWNMaW5lcyhcblx0XHRvdXRwdXQsXG5cdFx0J3B5dGhvbiBuaW5qYSBidWlsZCBwcm9ncmVzcycsXG5cdFx0aXNQeXRob25OaW5qYUJ1aWxkUHJvZ3Jlc3NMaW5lLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0UHl0aG9uQnVpbGRFeHRQcm9ncmVzcyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBvbWl0Tm9uRGlhZ25vc3RpY0xpbmVzKFxuXHRcdG91dHB1dCxcblx0XHQncHl0aG9uIGJ1aWxkX2V4dCBwcm9ncmVzcycsXG5cdFx0aXNQeXRob25CdWlsZEV4dFByb2dyZXNzTGluZSxcblx0KTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdFNwaGlueFByb2dyZXNzRmFsbGJhY2sob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoaGFzU3BoaW54UHJvZ3Jlc3Mob3V0cHV0KSkge1xuXHRcdHJldHVybiBjb21wYWN0U3BoaW54UHJvZ3Jlc3Mob3V0cHV0KTtcblx0fVxuXHRyZXR1cm4gb3V0cHV0O1xufVxuXG5mdW5jdGlvbiBjb21wYWN0UHl0ZXN0U2Vzc2lvbk1ldGFkYXRhKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIG9taXROb25EaWFnbm9zdGljTGluZXMoXG5cdFx0b3V0cHV0LFxuXHRcdCdweXRlc3Qgc2Vzc2lvbiBtZXRhZGF0YScsXG5cdFx0aXNQeXRlc3RTZXNzaW9uTWV0YWRhdGFMaW5lLFxuXHQpO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHNoZWxsX291dHB1dF9jb21wYWN0b3IucnMgXHUyMDE0IHJ1biBjb2xsYXBzaW5nLCBwYWNrYWdlIG1hbmFnZXIgb3BlcmF0aW9uc1xuXG5mdW5jdGlvbiBjb21wYWN0RGphbmdvVGVzdEJvaWxlcnBsYXRlKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIG9taXROb25EaWFnbm9zdGljTGluZXMob3V0cHV0LCAnZGphbmdvIHRlc3QgYm9pbGVycGxhdGUnLCBpc0RqYW5nb1Rlc3RCb2lsZXJwbGF0ZUxpbmUpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0RGphbmdvVGVzdFByb2dyZXNzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIG9taXROb25EaWFnbm9zdGljTGluZXMob3V0cHV0LCAnZGphbmdvIHRlc3QgcHJvZ3Jlc3MnLCBpc0RqYW5nb1Rlc3RQcm9ncmVzc0xpbmUpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0Q2xhbmdGb3JtYXRMaW50ZXJPdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gb21pdE5vbkRpYWdub3N0aWNMaW5lcyhvdXRwdXQsICdjbGFuZy1mb3JtYXQgZGVidWcnLCBpc0NsYW5nRm9ybWF0RGVidWdMaW5lKTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdERvdG5ldFRpbWluZ1Byb2dyZXNzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBidWZmZXJlZFByb2dyZXNzOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCB0aW1pbmcgPSB7IGNvdW50OiAwIH07XG5cblx0Zm9yIChjb25zdCBsaW5lIG9mIG91dHB1dC5zcGxpdCgnXFxuJykpIHtcblx0XHRpZiAobGluZS50cmltKCkubGVuZ3RoID09PSAwIHx8IGlzRG90bmV0U3RhbmRhbG9uZVRpbWluZ0xpbmUobGluZSkpIHtcblx0XHRcdGJ1ZmZlcmVkUHJvZ3Jlc3MucHVzaChsaW5lKTtcblx0XHRcdGlmIChpc0RvdG5ldFN0YW5kYWxvbmVUaW1pbmdMaW5lKGxpbmUpKSB7XG5cdFx0XHRcdHRpbWluZy5jb3VudCArPSAxO1xuXHRcdFx0fVxuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Zmx1c2hEb3RuZXRUaW1pbmdQcm9ncmVzcyhjb21wYWN0ZWQsIGJ1ZmZlcmVkUHJvZ3Jlc3MsIHRpbWluZyk7XG5cdFx0Y29tcGFjdGVkLnB1c2gobGluZSk7XG5cdH1cblxuXHRmbHVzaERvdG5ldFRpbWluZ1Byb2dyZXNzKGNvbXBhY3RlZCwgYnVmZmVyZWRQcm9ncmVzcywgdGltaW5nKTtcblx0cmV0dXJuIGNvbXBhY3RlZC5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gZmx1c2hEb3RuZXRUaW1pbmdQcm9ncmVzcyhcblx0Y29tcGFjdGVkOiBzdHJpbmdbXSxcblx0YnVmZmVyZWRQcm9ncmVzczogc3RyaW5nW10sXG5cdHRpbWluZzogeyBjb3VudDogbnVtYmVyIH0sXG4pOiB2b2lkIHtcblx0aWYgKHRpbWluZy5jb3VudCA+PSAzKSB7XG5cdFx0Y29tcGFjdGVkLnB1c2goYFtkb3RuZXQgdGltaW5nIHByb2dyZXNzOiBvbWl0dGVkICR7dGltaW5nLmNvdW50fSB0aW1pbmcgbGluZShzKV1gKTtcblx0fSBlbHNlIHtcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgYnVmZmVyZWRQcm9ncmVzcykge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2gobGluZSk7XG5cdFx0fVxuXHR9XG5cdGJ1ZmZlcmVkUHJvZ3Jlc3MubGVuZ3RoID0gMDtcblx0dGltaW5nLmNvdW50ID0gMDtcbn1cblxuZnVuY3Rpb24gaXNEb3RuZXRTdGFuZGFsb25lVGltaW5nTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXHMqXFwoXFxkKyg/OlxcLlxcZCspP3NcXClcXHMqJGAsIGxpbmUpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0R2l0Q2xlYW5SZW1vdmluZ1J1bnMob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gY29sbGFwc2VDb250aWd1b3VzUnVucyhvdXRwdXQsIGlzR2l0Q2xlYW5SZW1vdmluZ0xpbmUsIDE2LCBibG9jayA9PiB7XG5cdFx0Y29uc3Qga2VwdFN0YXJ0ID0gYmxvY2suc2xpY2UoMCwgTWF0aC5taW4oNSwgYmxvY2subGVuZ3RoKSk7XG5cdFx0Y29uc3Qga2VwdEVuZFN0YXJ0ID0gc2F0dXJhdGluZ1N1YihibG9jay5sZW5ndGgsIDUpO1xuXHRcdGNvbnN0IGtlcHRFbmQgPSBibG9jay5zbGljZShrZXB0RW5kU3RhcnQpO1xuXHRcdGNvbnN0IG9taXR0ZWQgPSBzYXR1cmF0aW5nU3ViKGJsb2NrLmxlbmd0aCwga2VwdFN0YXJ0Lmxlbmd0aCArIGtlcHRFbmQubGVuZ3RoKTtcblx0XHRpZiAob21pdHRlZCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gWy4uLmtlcHRTdGFydF07XG5cdFx0bGluZXMucHVzaChgW2dpdCBjbGVhbjogb21pdHRlZCAke29taXR0ZWR9IFJlbW92aW5nIGxpbmUocyldYCk7XG5cdFx0bGluZXMucHVzaCguLi5rZXB0RW5kKTtcblx0XHRyZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBpc0dpdENsZWFuUmVtb3ZpbmdMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXlJlbW92aW5nIFxcUytgLCBsaW5lKTtcbn1cblxuZnVuY3Rpb24gY29sbGFwc2VDb250aWd1b3VzUnVucyhcblx0b3V0cHV0OiBzdHJpbmcsXG5cdGlzTWVtYmVyOiAobGluZTogc3RyaW5nKSA9PiBib29sZWFuLFxuXHRtaW5SdW46IG51bWJlcixcblx0c3VtbWFyaXplOiAoYmxvY2s6IHN0cmluZ1tdKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQsXG4pOiBzdHJpbmcge1xuXHRjb25zdCBsaW5lcyA9IG91dHB1dC5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IGNvbXBhY3RlZDogc3RyaW5nW10gPSBbXTtcblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCkge1xuXHRcdGlmICghaXNNZW1iZXIobGluZXNbaV0pKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChsaW5lc1tpXSk7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydCA9IGk7XG5cdFx0d2hpbGUgKGkgPCBsaW5lcy5sZW5ndGggJiYgaXNNZW1iZXIobGluZXNbaV0pKSB7XG5cdFx0XHRpICs9IDE7XG5cdFx0fVxuXHRcdGNvbnN0IGJsb2NrID0gbGluZXMuc2xpY2Uoc3RhcnQsIGkpO1xuXHRcdGNvbnN0IHN1bW1hcnkgPSBibG9jay5sZW5ndGggPj0gbWluUnVuID8gc3VtbWFyaXplKGJsb2NrKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoc3VtbWFyeSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChzdW1tYXJ5KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2goLi4uYmxvY2spO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBjb2xsYXBzZVJ1bnNXaXRoRXhhbXBsZXMoXG5cdG91dHB1dDogc3RyaW5nLFxuXHRpc01lbWJlcjogKGxpbmU6IHN0cmluZykgPT4gYm9vbGVhbixcblx0ZXhhbXBsZTogKGxpbmU6IHN0cmluZykgPT4gc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRzdW1tYXJpemU6IChjb3VudDogbnVtYmVyLCBleGFtcGxlczogc3RyaW5nKSA9PiBzdHJpbmcsXG4pOiBzdHJpbmcge1xuXHRyZXR1cm4gY29sbGFwc2VDb250aWd1b3VzUnVucyhvdXRwdXQsIGlzTWVtYmVyLCA1LCBibG9jayA9PiB7XG5cdFx0Y29uc3QgZXhhbXBsZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGJsb2NrKSB7XG5cdFx0XHRjb25zdCBleCA9IGV4YW1wbGUobGluZSk7XG5cdFx0XHRpZiAoZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRleGFtcGxlcy5wdXNoKGV4KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGV4YW1wbGVzLmxlbmd0aCAhPT0gYmxvY2subGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gc3VtbWFyaXplKFxuXHRcdFx0YmxvY2subGVuZ3RoLFxuXHRcdFx0c3VtbWFyaXplV2l0aE1vcmUodW5pcXVlU3RyaW5ncyhleGFtcGxlcyksIDEwKSxcblx0XHQpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdFJlcGVhdGVkTm9kZVdhcm5pbmdzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3Qgc2Vlbjogc3RyaW5nW10gPSBbXTtcblx0cmV0dXJuIG9taXRNYXRjaGluZ0xpbmVzKFxuXHRcdG91dHB1dCxcblx0XHQnbm9kZSB3YXJuaW5ncycsXG5cdFx0bGluZSA9PiB7XG5cdFx0XHRjb25zdCBrZXkgPSBnZXROb2RlV2FybmluZ0tleShsaW5lKTtcblx0XHRcdGlmIChrZXkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2Vlbi5pbmNsdWRlcyhrZXkpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0c2Vlbi5wdXNoKGtleSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSxcblx0XHQncmVwZWF0ZWQgd2FybmluZycsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGdldE5vZGVXYXJuaW5nS2V5KGxpbmU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmIChyZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BeXFwobm9kZTpcXGQrXFwpICg/OlxcW1tBLVowLTlfLV0rXFxdICk/KD86RXhwZXJpbWVudGFsV2FybmluZ3xEZXByZWNhdGlvbldhcm5pbmd8V2FybmluZyk6IGAsXG5cdFx0bGluZSxcblx0KSkge1xuXHRcdHJldHVybiByZWdleFJlcGxhY2VBbGwoU3RyaW5nLnJhd2BeXFwobm9kZTpcXGQrXFwpYCwgbGluZSwgJyhub2RlKScpO1xuXHR9XG5cblx0aWYgKGxpbmUuc3RhcnRzV2l0aCgnKFVzZSBgbm9kZSAtLXRyYWNlLXdhcm5pbmdzJylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJyhVc2UgYG5vZGUgLS10cmFjZS1kZXByZWNhdGlvbicpXG5cdCkge1xuXHRcdHJldHVybiBsaW5lO1xuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gb21pdE1hdGNoaW5nTGluZXMoXG5cdG91dHB1dDogc3RyaW5nLFxuXHRsYWJlbDogc3RyaW5nLFxuXHRzaG91bGRPbWl0OiAobGluZTogc3RyaW5nKSA9PiBib29sZWFuLFxuXHRzdW1tYXJ5U3VmZml4OiBzdHJpbmcsXG4pOiBzdHJpbmcge1xuXHRjb25zdCBjb21wYWN0ZWQ6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IG9taXR0ZWQgPSB7IGNvdW50OiAwIH07XG5cblx0Zm9yIChjb25zdCBsaW5lIG9mIG91dHB1dC5zcGxpdCgnXFxuJykpIHtcblx0XHRpZiAoc2hvdWxkT21pdChsaW5lKSkge1xuXHRcdFx0b21pdHRlZC5jb3VudCArPSAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmbHVzaE9taXR0ZWRMaW5lcyhjb21wYWN0ZWQsIGxhYmVsLCBvbWl0dGVkLCBzdW1tYXJ5U3VmZml4KTtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmUpO1xuXHRcdH1cblx0fVxuXHRmbHVzaE9taXR0ZWRMaW5lcyhjb21wYWN0ZWQsIGxhYmVsLCBvbWl0dGVkLCBzdW1tYXJ5U3VmZml4KTtcblx0cmV0dXJuIGNvbXBhY3RlZC5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gb21pdE5vbkRpYWdub3N0aWNMaW5lcyhcblx0b3V0cHV0OiBzdHJpbmcsXG5cdGxhYmVsOiBzdHJpbmcsXG5cdHNob3VsZE9taXQ6IChsaW5lOiBzdHJpbmcpID0+IGJvb2xlYW4sXG4pOiBzdHJpbmcge1xuXHRyZXR1cm4gb21pdE1hdGNoaW5nTGluZXMob3V0cHV0LCBsYWJlbCwgc2hvdWxkT21pdCwgJ25vbi1kaWFnbm9zdGljJyk7XG59XG5cbmZ1bmN0aW9uIGZsdXNoT21pdHRlZExpbmVzKFxuXHRjb21wYWN0ZWQ6IHN0cmluZ1tdLFxuXHRsYWJlbDogc3RyaW5nLFxuXHRvbWl0dGVkOiB7IGNvdW50OiBudW1iZXIgfSxcblx0c3VtbWFyeVN1ZmZpeDogc3RyaW5nLFxuKTogdm9pZCB7XG5cdGlmIChvbWl0dGVkLmNvdW50ID4gMCkge1xuXHRcdGNvbXBhY3RlZC5wdXNoKGBbJHtsYWJlbH06IG9taXR0ZWQgJHtvbWl0dGVkLmNvdW50fSAke3N1bW1hcnlTdWZmaXh9IGxpbmUocyldYCk7XG5cdFx0b21pdHRlZC5jb3VudCA9IDA7XG5cdH1cbn1cblxuZnVuY3Rpb24gY29tcGFjdFBhY2thZ2VNYW5hZ2VyT3BlcmF0aW9ucyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghaGFzUGFja2FnZU1hbmFnZXJPcGVyYXRpb25zKG91dHB1dCkpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cdHJldHVybiBjb2xsYXBzZVJ1bnNXaXRoRXhhbXBsZXMoXG5cdFx0b3V0cHV0LFxuXHRcdGlzUGFja2FnZU1hbmFnZXJPcGVyYXRpb25MaW5lLFxuXHRcdHBhY2thZ2VNYW5hZ2VyT3BlcmF0aW9uRXhhbXBsZSxcblx0XHQobGVuLCBleGFtcGxlcykgPT4gYFtwYWNrYWdlIG9wZXJhdGlvbnM6IG9taXR0ZWQgJHtsZW59IHJvdyhzKTsgZXhhbXBsZXM6ICR7ZXhhbXBsZXN9XWAsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGhhc1BhY2thZ2VNYW5hZ2VyT3BlcmF0aW9ucyhvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCBoYXNNYXJrZXIgPSBvdXRwdXQuaW5jbHVkZXMoJ0luc3RhbGxpbmcgZGVwZW5kZW5jaWVzIGZyb20gbG9jayBmaWxlJylcblx0XHR8fCBvdXRwdXQuaW5jbHVkZXMoJ0xvY2sgZmlsZSBvcGVyYXRpb25zOicpXG5cdFx0fHwgb3V0cHV0LmluY2x1ZGVzKCdQYWNrYWdlIG9wZXJhdGlvbnM6Jylcblx0XHR8fCBvdXRwdXQuaW5jbHVkZXMoJ1dyaXRpbmcgbG9jayBmaWxlJylcblx0XHR8fCBvdXRwdXQuaW5jbHVkZXMoJ0dlbmVyYXRpbmcgYXV0b2xvYWQgZmlsZXMnKVxuXHRcdHx8IG91dHB1dC5pbmNsdWRlcygnTG9jayBmaWxlIGlzIHVwIHRvIGRhdGUnKTtcblx0cmV0dXJuIGhhc01hcmtlciAmJiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PiBpc1BhY2thZ2VNYW5hZ2VyT3BlcmF0aW9uTGluZShsaW5lKSk7XG59XG5cbmZ1bmN0aW9uIGlzUGFja2FnZU1hbmFnZXJPcGVyYXRpb25MaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAocmVnZXhUZXN0V2l0aEZsYWdzKFN0cmluZy5yYXdgKD86RmFpbGVkfEVycm9yfEV4Y2VwdGlvbnxUcmFjZWJhY2t8ZmF0YWwpYCwgbGluZSwgJ2knKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gcGFyc2VQYWNrYWdlTWFuYWdlck9wZXJhdGlvbihsaW5lKSAhPT0gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBwYWNrYWdlTWFuYWdlck9wZXJhdGlvbkV4YW1wbGUobGluZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcGFyc2VkID0gcGFyc2VQYWNrYWdlTWFuYWdlck9wZXJhdGlvbihsaW5lKTtcblx0aWYgKHBhcnNlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gcGFyc2VkLnZlcnNpb24gIT09IHVuZGVmaW5lZCA/IGAke3BhcnNlZC5wa2d9ICgke3BhcnNlZC52ZXJzaW9ufSlgIDogcGFyc2VkLnBrZztcbn1cblxuZnVuY3Rpb24gcGFyc2VQYWNrYWdlTWFuYWdlck9wZXJhdGlvbihsaW5lOiBzdHJpbmcpOiBQYWNrYWdlTWFuYWdlck9wZXJhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHJlc3RBZnRlckRhc2ggPSBzdHJpcFByZWZpeChsaW5lLCAnICAtICcpO1xuXHRpZiAocmVzdEFmdGVyRGFzaCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBvcGVyYXRpb25TcGxpdCA9IHNwbGl0T25jZShyZXN0QWZ0ZXJEYXNoLCAnICcpO1xuXHRpZiAob3BlcmF0aW9uU3BsaXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgb3BlcmF0aW9uID0gb3BlcmF0aW9uU3BsaXRbMF07XG5cdGxldCByZXN0ID0gb3BlcmF0aW9uU3BsaXRbMV07XG5cdGlmICghWydJbnN0YWxsaW5nJywgJ0xvY2tpbmcnLCAnVXBkYXRpbmcnLCAnUmVtb3ZpbmcnLCAnRG93bmxvYWRpbmcnXS5pbmNsdWRlcyhvcGVyYXRpb24pKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBwYWNrYWdlU3BsaXQgPSBzcGxpdE9uY2UocmVzdCwgJyAnKTtcblx0bGV0IHBrZzogc3RyaW5nO1xuXHRpZiAocGFja2FnZVNwbGl0ID09PSB1bmRlZmluZWQpIHtcblx0XHRwa2cgPSByZXN0O1xuXHRcdHJlc3QgPSAnJztcblx0fSBlbHNlIHtcblx0XHRwa2cgPSBwYWNrYWdlU3BsaXRbMF07XG5cdFx0cmVzdCA9IHBhY2thZ2VTcGxpdFsxXTtcblx0fVxuXHRpZiAocGtnLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHJlc3QubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHsgb3BlcmF0aW9uLCBwa2csIHZlcnNpb246IHVuZGVmaW5lZCB9O1xuXHR9XG5cdGNvbnN0IGFmdGVyT3BlbiA9IHN0cmlwUHJlZml4KHJlc3QsICcoJyk7XG5cdGlmIChhZnRlck9wZW4gIT09IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IGNsb3NlU3BsaXQgPSBzcGxpdE9uY2UoYWZ0ZXJPcGVuLCAnKScpO1xuXHRcdGlmIChjbG9zZVNwbGl0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHZlcnNpb24gPSBjbG9zZVNwbGl0WzBdO1xuXHRcdFx0Y29uc3QgYWZ0ZXJDbG9zZSA9IGNsb3NlU3BsaXRbMV07XG5cdFx0XHRpZiAoYWZ0ZXJDbG9zZS5sZW5ndGggPT09IDAgfHwgYWZ0ZXJDbG9zZS5zdGFydHNXaXRoKCc6ICcpKSB7XG5cdFx0XHRcdHJldHVybiB7IG9wZXJhdGlvbiwgcGtnLCB2ZXJzaW9uIH07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGlmIChyZXN0LnN0YXJ0c1dpdGgoJzogJykpIHtcblx0XHRyZXR1cm4geyBvcGVyYXRpb24sIHBrZywgdmVyc2lvbjogdW5kZWZpbmVkIH07XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gdW5pcXVlU3RyaW5ncyhpdGVtczogc3RyaW5nW10pOiBzdHJpbmdbXSB7XG5cdGNvbnN0IHVuaXF1ZTogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0aWYgKCF1bmlxdWUuaW5jbHVkZXMoaXRlbSkpIHtcblx0XHRcdHVuaXF1ZS5wdXNoKGl0ZW0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5pcXVlO1xufVxuXG5mdW5jdGlvbiBzdW1tYXJpemVXaXRoTW9yZShpdGVtczogc3RyaW5nW10sIG1heEl0ZW1zOiBudW1iZXIpOiBzdHJpbmcge1xuXHRjb25zdCBzaG93biA9IGl0ZW1zLnNsaWNlKDAsIG1heEl0ZW1zKTtcblx0Y29uc3Qgb21pdHRlZCA9IHNhdHVyYXRpbmdTdWIoaXRlbXMubGVuZ3RoLCBzaG93bi5sZW5ndGgpO1xuXHRpZiAob21pdHRlZCA+IDApIHtcblx0XHRyZXR1cm4gYCR7c2hvd24uam9pbignLCAnKX0sIC4uLiArJHtvbWl0dGVkfSBtb3JlYDtcblx0fVxuXHRyZXR1cm4gc2hvd24uam9pbignLCAnKTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBzaGVsbF9vdXRwdXRfY29tcGFjdG9yLnJzIFx1MjAxNCBucG0tcGFjaywgZ28sIGRpYWdub3N0aWNzLCBjYXJnbywgdW5pdHRlc3QsIGNtYWtlXG5cbmZ1bmN0aW9uIGNvbXBhY3ROcG1QYWNrT3V0cHV0KG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFsb29rc0xpa2VOcG1QYWNrT3V0cHV0KG91dHB1dCkpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgaW5UYXJiYWxsQ29udGVudHMgPSBmYWxzZTtcblx0Y29uc3Qgb21pdHRlZEZpbGVSb3dzID0geyBjb3VudDogMCB9O1xuXG5cdGZvciAoY29uc3QgbGluZSBvZiBvdXRwdXQuc3BsaXQoJ1xcbicpKSB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZExpbmUgPSBzdHJpcE5wbVNwaW5uZXJQcmVmaXgobGluZSk7XG5cdFx0aWYgKG5vcm1hbGl6ZWRMaW5lID09PSAnbnBtIG5vdGljZSBUYXJiYWxsIENvbnRlbnRzJykge1xuXHRcdFx0aW5UYXJiYWxsQ29udGVudHMgPSB0cnVlO1xuXHRcdFx0Y29tcGFjdGVkLnB1c2gobGluZSk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKG5vcm1hbGl6ZWRMaW5lID09PSAnbnBtIG5vdGljZSBUYXJiYWxsIERldGFpbHMnKSB7XG5cdFx0XHRmbHVzaE5wbVBhY2tPbWl0dGVkKGNvbXBhY3RlZCwgb21pdHRlZEZpbGVSb3dzKTtcblx0XHRcdGluVGFyYmFsbENvbnRlbnRzID0gZmFsc2U7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChsaW5lKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoaW5UYXJiYWxsQ29udGVudHMgJiYgaXNOcG1QYWNrRmlsZUxpc3RpbmdMaW5lKG5vcm1hbGl6ZWRMaW5lKSkge1xuXHRcdFx0b21pdHRlZEZpbGVSb3dzLmNvdW50ICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb21wYWN0ZWQucHVzaChsaW5lKTtcblx0fVxuXHRmbHVzaE5wbVBhY2tPbWl0dGVkKGNvbXBhY3RlZCwgb21pdHRlZEZpbGVSb3dzKTtcblx0cmV0dXJuIGNvbXBhY3RlZC5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gZmx1c2hOcG1QYWNrT21pdHRlZChjb21wYWN0ZWQ6IHN0cmluZ1tdLCBvbWl0dGVkRmlsZVJvd3M6IHsgY291bnQ6IG51bWJlciB9KTogdm9pZCB7XG5cdGlmIChvbWl0dGVkRmlsZVJvd3MuY291bnQgPiAwKSB7XG5cdFx0Y29tcGFjdGVkLnB1c2goYFtucG0gcGFjayB0YXJiYWxsIGNvbnRlbnRzOiBvbWl0dGVkICR7b21pdHRlZEZpbGVSb3dzLmNvdW50fSBmaWxlIGxpc3RpbmcgbGluZShzKV1gKTtcblx0XHRvbWl0dGVkRmlsZVJvd3MuY291bnQgPSAwO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzTnBtUGFja0ZpbGVMaXN0aW5nTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgcmVzdDAgPSBzdHJpcFByZWZpeChsaW5lLCAnbnBtIG5vdGljZSAnKTtcblx0aWYgKHJlc3QwID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0bGV0IG51bWJlckVuZCA9IHJlc3QwLmxlbmd0aDtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZXN0MC5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGNoID0gcmVzdDBbaV07XG5cdFx0aWYgKCFpc0FzY2lpRGlnaXQoY2gpICYmIGNoICE9PSAnLicpIHtcblx0XHRcdG51bWJlckVuZCA9IGk7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblx0aWYgKG51bWJlckVuZCA9PT0gMCB8fCAhaXNEZWNpbWFsTnVtYmVyKHJlc3QwLnNsaWNlKDAsIG51bWJlckVuZCkpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IHJlc3QgPSByZXN0MC5zbGljZShudW1iZXJFbmQpLnRyaW1TdGFydCgpO1xuXHRyZXR1cm4gWydCJywgJ2tCJywgJ01CJywgJ0dCJ10uc29tZSh1bml0ID0+IHtcblx0XHRjb25zdCB2YWx1ZSA9IHN0cmlwUHJlZml4KHJlc3QsIHVuaXQpO1xuXHRcdHJldHVybiB2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlLnN0YXJ0c1dpdGgoJyAnKTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHN0cmlwTnBtU3Bpbm5lclByZWZpeChsaW5lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCB0cmltbWVkID0gdHJpbVN0YXJ0TWF0Y2hlc0NoYXJzKGxpbmUsIFsnfCcsICcvJywgJy0nXSk7XG5cdGlmICh0cmltbWVkLnN0YXJ0c1dpdGgoJ25wbSBub3RpY2UgJykpIHtcblx0XHRyZXR1cm4gdHJpbW1lZDtcblx0fVxuXHRyZXR1cm4gbGluZTtcbn1cblxuZnVuY3Rpb24gaXNEZWNpbWFsTnVtYmVyKHZhbHVlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRsZXQgaGFzRGlnaXQgPSBmYWxzZTtcblx0bGV0IGRvdENvdW50ID0gMDtcblx0Zm9yIChjb25zdCBjaCBvZiB2YWx1ZSkge1xuXHRcdGlmIChpc0FzY2lpRGlnaXQoY2gpKSB7XG5cdFx0XHRoYXNEaWdpdCA9IHRydWU7XG5cdFx0fSBlbHNlIGlmIChjaCA9PT0gJy4nKSB7XG5cdFx0XHRkb3RDb3VudCArPSAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBkb3RDb3VudCA8PSAxICYmIGhhc0RpZ2l0O1xufVxuXG5mdW5jdGlvbiBjb21wYWN0R29PdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBjb21wYWN0ZWQ6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IGRvd25sb2FkQ291bnQgPSB7IGNvdW50OiAwIH07XG5cblx0Zm9yIChjb25zdCBsaW5lIG9mIG91dHB1dC5zcGxpdCgnXFxuJykpIHtcblx0XHRpZiAoaXNHb01vZHVsZURvd25sb2FkQ2hhdHRlckxpbmUobGluZSkpIHtcblx0XHRcdGRvd25sb2FkQ291bnQuY291bnQgKz0gMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zmx1c2hHb0Rvd25sb2Fkcyhjb21wYWN0ZWQsIGRvd25sb2FkQ291bnQpO1xuXHRcdFx0Y29tcGFjdGVkLnB1c2gobGluZSk7XG5cdFx0fVxuXHR9XG5cdGZsdXNoR29Eb3dubG9hZHMoY29tcGFjdGVkLCBkb3dubG9hZENvdW50KTtcblx0cmV0dXJuIGNvbXBhY3RlZC5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gZmx1c2hHb0Rvd25sb2Fkcyhjb21wYWN0ZWQ6IHN0cmluZ1tdLCBkb3dubG9hZENvdW50OiB7IGNvdW50OiBudW1iZXIgfSk6IHZvaWQge1xuXHRpZiAoZG93bmxvYWRDb3VudC5jb3VudCA+IDApIHtcblx0XHRjb21wYWN0ZWQucHVzaChgW2dvIHRlc3Q6IG9taXR0ZWQgJHtkb3dubG9hZENvdW50LmNvdW50fSBkZXBlbmRlbmN5IGRvd25sb2FkIGxpbmUocyldYCk7XG5cdFx0ZG93bmxvYWRDb3VudC5jb3VudCA9IDA7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNHb01vZHVsZURvd25sb2FkQ2hhdHRlckxpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChpc0RpYWdub3N0aWNMaW5lKGxpbmUpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiBsaW5lLnN0YXJ0c1dpdGgoJ2dvOiBkb3dubG9hZGluZyAnKVxuXHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnZ286IGZpbmRpbmcgbW9kdWxlIGZvciBwYWNrYWdlICcpXG5cdFx0fHwgbGluZS5zdGFydHNXaXRoKCdnbzogZXh0cmFjdGluZyAnKVxuXHRcdHx8IChsaW5lLnN0YXJ0c1dpdGgoJ2dvOiBmb3VuZCAnKSAmJiBsaW5lLmluY2x1ZGVzKCcgaW4gJykpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0UmVwZWF0ZWREaWFnbm9zdGljQmxvY2tzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgbGluZXMgPSBvdXRwdXQuc3BsaXQoJ1xcbicpO1xuXHRjb25zdCBkaWFnbm9zdGljTGluZXMgPSBsaW5lcy5tYXAobGluZSA9PiBpc0RpYWdub3N0aWNMaW5lKGxpbmUpKTtcblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgaSA9IDA7XG5cdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoKSB7XG5cdFx0Y29uc3QgcmVwZWF0ZWRCbG9jayA9IGZpbmRSZXBlYXRlZERpYWdub3N0aWNCbG9jayhsaW5lcywgZGlhZ25vc3RpY0xpbmVzLCBpKTtcblx0XHRpZiAocmVwZWF0ZWRCbG9jayA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChsaW5lc1tpXSk7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb21wYWN0ZWQucHVzaCguLi5saW5lcy5zbGljZShpLCBpICsgcmVwZWF0ZWRCbG9jay5saW5lQ291bnQpKTtcblx0XHRjb21wYWN0ZWQucHVzaChcblx0XHRcdGBbcmVwZWF0ZWQgZGlhZ25vc3RpYyBibG9jazogcHJldmlvdXMgJHtyZXBlYXRlZEJsb2NrLmxpbmVDb3VudH0gbGluZShzKSByZXBlYXRlZCAke3JlcGVhdGVkQmxvY2sucmVwZXRpdGlvbnN9IG1vcmUgdGltZShzKV1gLFxuXHRcdCk7XG5cdFx0aSArPSByZXBlYXRlZEJsb2NrLmxpbmVDb3VudCAqIChyZXBlYXRlZEJsb2NrLnJlcGV0aXRpb25zICsgMSk7XG5cdH1cblx0cmV0dXJuIGNvbXBhY3RlZC5qb2luKCdcXG4nKTtcbn1cblxuaW50ZXJmYWNlIFJlcGVhdGVkRGlhZ25vc3RpY0Jsb2NrIHtcblx0bGluZUNvdW50OiBudW1iZXI7XG5cdHJlcGV0aXRpb25zOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGZpbmRSZXBlYXRlZERpYWdub3N0aWNCbG9jayhcblx0bGluZXM6IHN0cmluZ1tdLFxuXHRkaWFnbm9zdGljTGluZXM6IGJvb2xlYW5bXSxcblx0c3RhcnQ6IG51bWJlcixcbik6IFJlcGVhdGVkRGlhZ25vc3RpY0Jsb2NrIHwgdW5kZWZpbmVkIHtcblx0Zm9yIChsZXQgbGluZUNvdW50ID0gNjsgbGluZUNvdW50ID49IDI7IGxpbmVDb3VudC0tKSB7XG5cdFx0aWYgKHN0YXJ0ICsgbGluZUNvdW50ICogMiA+IGxpbmVzLmxlbmd0aCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKCFkaWFnbm9zdGljTGluZXMuc2xpY2Uoc3RhcnQsIHN0YXJ0ICsgbGluZUNvdW50KS5zb21lKGlzRGlhZ25vc3RpYyA9PiBpc0RpYWdub3N0aWMpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRsZXQgcmVwZXRpdGlvbnMgPSAwO1xuXHRcdHdoaWxlIChzdGFydCArIChyZXBldGl0aW9ucyArIDIpICogbGluZUNvdW50IDw9IGxpbmVzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3Qgb2Zmc2V0ID0gc3RhcnQgKyAocmVwZXRpdGlvbnMgKyAxKSAqIGxpbmVDb3VudDtcblx0XHRcdGlmICghYXJyYXlTbGljZUVxdWFsKGxpbmVzLCBzdGFydCwgb2Zmc2V0LCBsaW5lQ291bnQpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0cmVwZXRpdGlvbnMgKz0gMTtcblx0XHR9XG5cblx0XHRpZiAocmVwZXRpdGlvbnMgPiAwKSB7XG5cdFx0XHRyZXR1cm4geyBsaW5lQ291bnQsIHJlcGV0aXRpb25zIH07XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGlzRGlhZ25vc3RpY0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3RXaXRoRmxhZ3MoXG5cdFx0U3RyaW5nLnJhd2AoPzpcXHUyNzE1fFxcdTI3MTd8XFx1MDBENyl8XFxiKD86ZXJyb3J8d2FybmluZ3x3YXJufGZhdGFsfGZhaWxlZHxmYWlsdXJlfHRyYWNlYmFja3xleGNlcHRpb258cGFuaWN8YXNzZXJ0aW9ufGFib3J0ZWR8YWJvcnQgdHJhcHxzZWdtZW50YXRpb24gZmF1bHR8Y29yZSBkdW1wZWQpXFxifG5wbSBFUlIhfF5FOnxeVzp8XkZBSUxcXGJgLFxuXHRcdGxpbmUsXG5cdFx0J2knLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0Q2FyZ29Qcm9ncmVzcyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghaGFzQ2FyZ29Qcm9ncmVzc091dHB1dChvdXRwdXQpKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXHRyZXR1cm4gb21pdE1hdGNoaW5nTGluZXMob3V0cHV0LCAnY2FyZ28gcHJvZ3Jlc3MnLCBpc0NhcmdvUHJvZ3Jlc3NMaW5lLCAncHJvZ3Jlc3MnKTtcbn1cblxuZnVuY3Rpb24gaGFzQ2FyZ29Qcm9ncmVzc091dHB1dChvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIWhhc0NhcmdvRmFpbHVyZShvdXRwdXQpXG5cdFx0JiYgaGFzQ2FyZ29UZXJtaW5hbFN1bW1hcnkob3V0cHV0KVxuXHRcdCYmIGhhc0NhcmdvUHJvZ3Jlc3NFdmlkZW5jZShvdXRwdXQpO1xufVxuXG5mdW5jdGlvbiBoYXNDYXJnb1Byb2dyZXNzRXZpZGVuY2Uob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+IHtcblx0XHRjb25zdCB0cmltbWVkID0gbGluZS50cmltU3RhcnQoKTtcblx0XHRyZXR1cm4gQ0FSR09fUFJPR1JFU1NfUFJFRklYRVMuc29tZShwcmVmaXggPT4gdHJpbW1lZC5zdGFydHNXaXRoKHByZWZpeCkpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gaXNDYXJnb1Byb2dyZXNzTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKGlzRGlhZ25vc3RpY0xpbmUobGluZSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgdHJpbW1lZCA9IGxpbmUudHJpbVN0YXJ0KCk7XG5cdHJldHVybiBDQVJHT19QUk9HUkVTU19QUkVGSVhFUy5zb21lKHByZWZpeCA9PiB0cmltbWVkLnN0YXJ0c1dpdGgocHJlZml4KSk7XG59XG5cbmZ1bmN0aW9uIGhhc0NhcmdvRmFpbHVyZShvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gb3V0cHV0LnNwbGl0KCdcXG4nKS5zb21lKGxpbmUgPT4ge1xuXHRcdGNvbnN0IHRyaW1tZWQgPSBsaW5lLnRyaW1TdGFydCgpO1xuXHRcdHJldHVybiB0cmltbWVkLnN0YXJ0c1dpdGgoJ2Vycm9yOicpXG5cdFx0XHR8fCB0cmltbWVkLnN0YXJ0c1dpdGgoJ2Vycm9yWycpXG5cdFx0XHR8fCB0cmltbWVkLnN0YXJ0c1dpdGgoJ3Rlc3QgcmVzdWx0OiBGQUlMRUQnKVxuXHRcdFx0fHwgdHJpbW1lZC5zdGFydHNXaXRoKCdmYWlsdXJlczonKTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGhhc0NhcmdvVGVybWluYWxTdW1tYXJ5KG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PiB7XG5cdFx0Y29uc3QgdHJpbW1lZCA9IGxpbmUudHJpbVN0YXJ0KCk7XG5cdFx0cmV0dXJuICh0cmltbWVkLnN0YXJ0c1dpdGgoJ0ZpbmlzaGVkICcpICYmIHRyaW1tZWQuaW5jbHVkZXMoJyB0YXJnZXQocykgaW4nKSlcblx0XHRcdHx8IHRyaW1tZWQuc3RhcnRzV2l0aCgndGVzdCByZXN1bHQ6IG9rLicpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdFVuaXR0ZXN0T3V0cHV0KG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKGhhc1Bhc3NpbmdVbml0dGVzdFN1bW1hcnkob3V0cHV0KSkge1xuXHRcdHJldHVybiBvbWl0Tm9uRGlhZ25vc3RpY0xpbmVzKFxuXHRcdFx0b3V0cHV0LFxuXHRcdFx0J3VuaXR0ZXN0IHByb2dyZXNzJyxcblx0XHRcdGlzVW5pdHRlc3RTdWNjZXNzUHJvZ3Jlc3NMaW5lLFxuXHRcdCk7XG5cdH1cblx0cmV0dXJuIG91dHB1dDtcbn1cblxuZnVuY3Rpb24gaGFzUGFzc2luZ1VuaXR0ZXN0U3VtbWFyeShvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgKD86XnxcXG4pUmFuIFxcZCsgdGVzdHM/IGluIFxcZCsoPzpcXC5cXGQrKT9zXFxzKig/OlxcbnwkKWAsXG5cdFx0b3V0cHV0LFxuXHQpICYmIHJlZ2V4VGVzdChTdHJpbmcucmF3YCg/Ol58XFxuKU9LKD86XFxzK1xcKFteKV0rXFwpKT9cXHMqKD86XFxufCQpYCwgb3V0cHV0KVxuXHRcdCYmICFyZWdleFRlc3RXaXRoRmxhZ3MoXG5cdFx0XHRTdHJpbmcucmF3YCg/Ol58XFxuKSg/OkZBSUxFRHxFUlJPUnxGQUlMKTp8XFxiKD86ZmFpbHVyZXM/fGVycm9ycz8pPVxcZCpbMS05XVxcZCpgLFxuXHRcdFx0b3V0cHV0LFxuXHRcdFx0J2knLFxuXHRcdCk7XG59XG5cbmZ1bmN0aW9uIGlzVW5pdHRlc3RTdWNjZXNzUHJvZ3Jlc3NMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoaXNEaWFnbm9zdGljTGluZShsaW5lKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBhbGxEYXNoZXMgPSBbLi4ubGluZV0uZXZlcnkoY2ggPT4gY2ggPT09ICctJykgJiYgYnl0ZUxlbmd0aChsaW5lKSA+PSAyMDtcblx0Y29uc3QgYWxsUHJvZ3Jlc3NDaGFycyA9IGxpbmUubGVuZ3RoID4gMCAmJiBbLi4ubGluZV0uZXZlcnkoY2ggPT4gJy5zU3hYdVViQicuaW5jbHVkZXMoY2gpKTtcblx0Y29uc3QgdGVzdExpbmUgPSByZWdleFRlc3QoU3RyaW5nLnJhd2BedGVzdF9cXFMrIFxcKFteKV0rXFwpIFxcLlxcLlxcLiBvayRgLCBsaW5lKTtcblx0cmV0dXJuIGFsbERhc2hlcyB8fCBhbGxQcm9ncmVzc0NoYXJzIHx8IHRlc3RMaW5lO1xufVxuXG5mdW5jdGlvbiBpc0NsYW5nRm9ybWF0RGVidWdMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXjxUaHJlYWRfXFxkKzpERUJVRz4gKD86XFwkIC4rfHRvb2sgXFxkK21zKSRgLCBsaW5lKTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdENtYWtlQ29uZmlndXJlUHJvYmVSdW5zKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGNvbGxhcHNlQ29udGlndW91c1J1bnMob3V0cHV0LCBpc0NtYWtlQ29uZmlndXJlUHJvYmVMaW5lLCA4LCBibG9jayA9PlxuXHRcdGBbY21ha2UgY29uZmlndXJlOiBvbWl0dGVkICR7YmxvY2subGVuZ3RofSBzdGF0dXMgcHJvYmUgbGluZShzKV1gLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBpc0NtYWtlQ29uZmlndXJlUHJvYmVMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoIWxpbmUuc3RhcnRzV2l0aCgnLS0gJylcblx0XHR8fCByZWdleFRlc3QoXG5cdFx0XHRTdHJpbmcucmF3YF4tLSAoPzpDb25maWd1cmluZyBkb25lfEdlbmVyYXRpbmcgZG9uZXxCdWlsZCBmaWxlcyBoYXZlIGJlZW4gd3JpdHRlbiB0bzopYCxcblx0XHRcdGxpbmUsXG5cdFx0KVxuXHQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXi0tIFBlcmZvcm1pbmcgVGVzdCBcXFMrKD86IC0gU3VjY2Vzcyk/JGAsIGxpbmUpXG5cdFx0fHwgaXNDbWFrZUxvb2tpbmdGb3JQcm9iZUxpbmUobGluZSlcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeLS0gRGV0ZWN0aW5nIC4rKD86IC0gZG9uZSk/JGAsIGxpbmUpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXi0tIENoZWNrKD86aW5nKT8gLisoPzogLSBkb25lKT8kYCwgbGluZSlcblx0XHR8fCByZWdleFRlc3QoXG5cdFx0XHRTdHJpbmcucmF3YF4tLSBDaGVjayBmb3Igd29ya2luZyBcXFMrIGNvbXBpbGVyOiAuKyg/OiAtICg/OnNraXBwZWR8d29ya3MpKT8kYCxcblx0XHRcdGxpbmUsXG5cdFx0KTtcbn1cblxuZnVuY3Rpb24gaXNDbWFrZUxvb2tpbmdGb3JQcm9iZUxpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAhbGluZS5lbmRzV2l0aCgnIC0gbm90IGZvdW5kJykgJiYgcmVnZXhUZXN0KFN0cmluZy5yYXdgXi0tIExvb2tpbmcgZm9yIC4rKD86IC0gZm91bmQpPyRgLCBsaW5lKTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBzaGVsbF9vdXRwdXRfY29tcGFjdG9yLnJzIFx1MjAxNCBtYXZlbiwgZ29sYW5nY2ktbGludCwgZ2l0IHByb2dyZXNzLCBqcy10ZXN0XG5cbmZ1bmN0aW9uIGNvbXBhY3RNYXZlbkRlcGVuZGVuY3lUcmFuc2ZlcihvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghaGFzTWF2ZW5EZXBlbmRlbmN5VHJhbnNmZXIob3V0cHV0KSkge1xuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblx0cmV0dXJuIGNvbGxhcHNlUnVuc1dpdGhFeGFtcGxlcyhcblx0XHRvdXRwdXQsXG5cdFx0aXNNYXZlbkRlcGVuZGVuY3lUcmFuc2ZlckxpbmUsXG5cdFx0bWF2ZW5EZXBlbmRlbmN5VHJhbnNmZXJFeGFtcGxlLFxuXHRcdChsZW4sIGV4YW1wbGVzKSA9PiBgW21hdmVuIGRlcGVuZGVuY3kgdHJhbnNmZXI6IG9taXR0ZWQgJHtsZW59IHJvdyhzKTsgZXhhbXBsZXM6ICR7ZXhhbXBsZXN9XWAsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RNYXZlblBhc3NpbmdUZXN0cyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghaGFzTWF2ZW5QYXNzaW5nVGVzdHMob3V0cHV0KSkge1xuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblx0cmV0dXJuIGNvbGxhcHNlUnVuc1dpdGhFeGFtcGxlcyhcblx0XHRvdXRwdXQsXG5cdFx0aXNNYXZlblBhc3NpbmdUZXN0TGluZSxcblx0XHRtYXZlblBhc3NpbmdUZXN0RXhhbXBsZSxcblx0XHQobGVuLCBleGFtcGxlcykgPT4gYFttYXZlbiB0ZXN0IHN1bW1hcnk6IG9taXR0ZWQgJHtsZW59IHBhc3NpbmcgY2xhc3Mgcm93KHMpOyBleGFtcGxlczogJHtleGFtcGxlc31dYCxcblx0KTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdE1hdmVuSW5mb0JvaWxlcnBsYXRlKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFoYXNNYXZlbkluZm9Cb2lsZXJwbGF0ZShvdXRwdXQpKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXHRyZXR1cm4gb21pdE1hdGNoaW5nTGluZXMoXG5cdFx0b3V0cHV0LFxuXHRcdCdtYXZlbiBib2lsZXJwbGF0ZScsXG5cdFx0aXNNYXZlbkluZm9Cb2lsZXJwbGF0ZUxpbmUsXG5cdFx0J2JvaWxlcnBsYXRlJyxcblx0KTtcbn1cblxuZnVuY3Rpb24gaGFzTWF2ZW5EZXBlbmRlbmN5VHJhbnNmZXIob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzTWF2ZW5PdXRwdXQob3V0cHV0KVxuXHRcdCYmIG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+XG5cdFx0XHRsaW5lLnN0YXJ0c1dpdGgoJ1tJTkZPXSBEb3dubG9hZGluZyBmcm9tICcpIHx8IGxpbmUuc3RhcnRzV2l0aCgnW0lORk9dIERvd25sb2FkZWQgZnJvbSAnKSk7XG59XG5cbmZ1bmN0aW9uIGhhc01hdmVuUGFzc2luZ1Rlc3RzKG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBpc01hdmVuT3V0cHV0KG91dHB1dClcblx0XHQmJiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PlxuXHRcdFx0bGluZS5zdGFydHNXaXRoKCdbSU5GT10gVGVzdHMgcnVuOiAnKSAmJiBsaW5lLmluY2x1ZGVzKCcsIEZhaWx1cmVzOiAwLCBFcnJvcnM6IDAsIFNraXBwZWQ6ICcpKTtcbn1cblxuZnVuY3Rpb24gaGFzTWF2ZW5JbmZvQm9pbGVycGxhdGUob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzTWF2ZW5PdXRwdXQob3V0cHV0KSAmJiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PiBpc01hdmVuSW5mb0JvaWxlcnBsYXRlTGluZShsaW5lKSk7XG59XG5cbmZ1bmN0aW9uIGlzTWF2ZW5PdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+XG5cdFx0bGluZS5zdGFydHNXaXRoKCdbSU5GT10gU2Nhbm5pbmcgZm9yIHByb2plY3RzLi4uJylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1tJTkZPXSBCVUlMRCBTVUNDRVNTJylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1tJTkZPXSBCVUlMRCBGQUlMVVJFJylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1tJTkZPXSBSZWFjdG9yIEJ1aWxkIE9yZGVyOicpXG5cdFx0fHwgbGluZS5zdGFydHNXaXRoKCdbSU5GT10gVG90YWwgdGltZTonKSk7XG59XG5cbmZ1bmN0aW9uIGlzTWF2ZW5EZXBlbmRlbmN5VHJhbnNmZXJMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXlxcW0lORk9cXF0gKD86RG93bmxvYWRpbmd8RG93bmxvYWRlZCkgZnJvbSBcXFMrOiBodHRwcz86Ly9cXFMrKD86IFxcKFteKV0rXFwpKT8kYCxcblx0XHRsaW5lLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBtYXZlbkRlcGVuZGVuY3lUcmFuc2ZlckV4YW1wbGUobGluZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgc3BsaXQgPSByc3BsaXRPbmNlKGxpbmUsICcgKCcpO1xuXHRjb25zdCB3aXRob3V0U2l6ZSA9IHNwbGl0ICE9PSB1bmRlZmluZWQgPyBzcGxpdFswXSA6IGxpbmU7XG5cdGNvbnN0IHBhcnRzID0gd2l0aG91dFNpemUuc3BsaXQoJy8nKTtcblx0aWYgKHBhcnRzLmxlbmd0aCA8IDMpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHZlcnNpb24gPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAyXTtcblx0Y29uc3QgbmFtZSA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDNdO1xuXHRyZXR1cm4gYCR7bmFtZX0gJHt2ZXJzaW9ufWA7XG59XG5cbmZ1bmN0aW9uIGlzTWF2ZW5QYXNzaW5nVGVzdExpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BeXFxbSU5GT1xcXSBUZXN0cyBydW46IFxcZCssIEZhaWx1cmVzOiAwLCBFcnJvcnM6IDAsIFNraXBwZWQ6IFxcZCssIFRpbWUgZWxhcHNlZDogXFxTK1xccytzKD86XFxzKyg/Oi0tfC0pXFxzK2luXFxzK1xcUyspPyRgLFxuXHRcdGxpbmUsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIG1hdmVuUGFzc2luZ1Rlc3RFeGFtcGxlKGxpbmU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiByZWdleENhcHR1cmVGaXJzdChTdHJpbmcucmF3YFxccyg/Oi0tfC0pXFxzK2luXFxzKyhcXFMrKSRgLCBsaW5lKSA/PyAnc3VtbWFyeSc7XG59XG5cbmZ1bmN0aW9uIGlzTWF2ZW5JbmZvQm9pbGVycGxhdGVMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCB0cmltbWVkID0gbGluZS50cmltRW5kKCk7XG5cdHJldHVybiB0cmltbWVkID09PSAnW0lORk9dJ1xuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXFtJTkZPXFxdIC17MjAsfVxccyokYCwgdHJpbW1lZClcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxbSU5GT1xcXSAtezIwLH1cXFtcXHMqXFxTK1xccypcXF0tezIwLH1cXHMqJGAsIHRyaW1tZWQpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxcW0lORk9cXF0gLXsyLH08XFxzKltePlxcbl0rXFxzKj4tezIsfVxccyokYCwgdHJpbW1lZClcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxbSU5GT1xcXSBCdWlsZGluZyAuKyBcXFtcXGQrL1xcZCtcXF1cXHMqJGAsIHRyaW1tZWQpXG5cdFx0fHwgcmVnZXhUZXN0KFxuXHRcdFx0U3RyaW5nLnJhd2BeXFxbSU5GT1xcXSAtLS0gXFxTKyg/OjpcXFMrKSsgKD86XFwoW14pXStcXCkgKT9AIFxcUysgLS0tXFxzKiRgLFxuXHRcdFx0dHJpbW1lZCxcblx0XHQpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0R29sYW5nY2lMaW50T3V0cHV0KG91dHB1dDogc3RyaW5nLCByZXF1aXJlTWFya2VyOiBib29sZWFuKTogc3RyaW5nIHtcblx0aWYgKHJlcXVpcmVNYXJrZXIgJiYgIWhhc0dvbGFuZ2NpTGludE1hcmtlcihvdXRwdXQpKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXHRyZXR1cm4gb21pdE5vbkRpYWdub3N0aWNMaW5lcyhcblx0XHRvdXRwdXQsXG5cdFx0J2dvbGFuZ2NpLWxpbnQgcHJvZ3Jlc3MnLFxuXHRcdGlzR29sYW5nY2lMaW50T21pdHRhYmxlTGluZSxcblx0KTtcbn1cblxuZnVuY3Rpb24gaGFzR29sYW5nY2lMaW50TWFya2VyKG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PlxuXHRcdHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXig/OmdvIHJ1biBnaXRodWJcXC5jb20vZ29sYW5nY2kvZ29sYW5nY2ktbGludC9jbWQvZ29sYW5nY2ktbGludCg/OkBcXFMrKT98KD86W0EtWmEtejAtOV8uLystXSsvKT9nb2xhbmdjaS1saW50KVxccytydW5cXGJgLFxuXHRcdFx0bGluZSxcblx0XHQpKVxuXHRcdHx8ICgob3V0cHV0LmluY2x1ZGVzKCdsZXZlbD1pbmZvJykgfHwgb3V0cHV0LmluY2x1ZGVzKCdJTkZPJykpXG5cdFx0XHQmJiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PiByZWdleFRlc3QoU3RyaW5nLnJhd2BeKD86bGV2ZWw9aW5mb1xcYnxJTkZPXFxiKWAsIGxpbmUpKVxuXHRcdFx0JiYgb3V0cHV0LnNwbGl0KCdcXG4nKS5zb21lKGxpbmUgPT4gaGFzR29sYW5nY2lMaW50U2FmZUluZm9QcmVmaXgobGluZSkpKTtcbn1cblxuZnVuY3Rpb24gaXNHb2xhbmdjaUxpbnRPbWl0dGFibGVMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoaXNEaWFnbm9zdGljTGluZShsaW5lKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gaXNHb01vZHVsZURvd25sb2FkQ2hhdHRlckxpbmUobGluZSlcblx0XHR8fCAocmVnZXhUZXN0KFN0cmluZy5yYXdgXig/OmxldmVsPWluZm9cXGJ8SU5GT1xcYilgLCBsaW5lKSAmJiBoYXNHb2xhbmdjaUxpbnRTYWZlSW5mb1ByZWZpeChsaW5lKSk7XG59XG5cbmZ1bmN0aW9uIGhhc0dvbGFuZ2NpTGludFNhZmVJbmZvUHJlZml4KGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXFxbKD86Y29uZmlnX3JlYWRlcnxsaW50ZXJzZGJ8bG9hZGVyfHJ1bm5lcnxsaW50ZXJzX2NvbnRleHR8ZmlsZW5hbWVfdW5hZGp1c3Rlcnx1bmlxX2J5X2xpbmV8c291cmNlX2NvZGUpXFxiYCxcblx0XHRsaW5lLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0R2l0UHJvZ3Jlc3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBsaW5lcyA9IG91dHB1dC5zcGxpdCgnXFxuJykubWFwKGxpbmUgPT4gY29tcGFjdEdpdFByb2dyZXNzTGluZShsaW5lKSk7XG5cdGNvbnN0IGNvbXBhY3RlZDogc3RyaW5nW10gPSBbXTtcblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCkge1xuXHRcdGNvbnN0IGxpbmUgPSBsaW5lc1tpXTtcblx0XHRjb25zdCBwcm9ncmVzc0tleSA9IGdldEdpdFByb2dyZXNzTGluZUtleShsaW5lLm91dHB1dCk7XG5cdFx0aWYgKHByb2dyZXNzS2V5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHB1c2hDb21wYWN0ZWRMaW5lKGNvbXBhY3RlZCwgbGluZSk7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRsZXQgaiA9IGkgKyAxO1xuXHRcdHdoaWxlIChqIDwgbGluZXMubGVuZ3RoICYmIGdldEdpdFByb2dyZXNzTGluZUtleShsaW5lc1tqXS5vdXRwdXQpID09PSBwcm9ncmVzc0tleSkge1xuXHRcdFx0aiArPSAxO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9taXR0ZWRMaW5lcyA9IGogLSBpIC0gMTtcblx0XHRpZiAob21pdHRlZExpbmVzID4gMCkge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2goYFtnaXQgcHJvZ3Jlc3M6IG9taXR0ZWQgJHtvbWl0dGVkTGluZXN9IGVhcmxpZXIgJHtwcm9ncmVzc0tleX0gbGluZShzKV1gKTtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmVzW2ogLSAxXS5vdXRwdXQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwdXNoQ29tcGFjdGVkTGluZShjb21wYWN0ZWQsIGxpbmUpO1xuXHRcdH1cblx0XHRpID0gajtcblx0fVxuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5pbnRlcmZhY2UgQ29tcGFjdGVkTGluZSB7XG5cdG91dHB1dDogc3RyaW5nO1xuXHRvbWl0dGVkRnJhbWVzOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIHVuY2hhbmdlZExpbmUobGluZTogc3RyaW5nKTogQ29tcGFjdGVkTGluZSB7XG5cdHJldHVybiB7IG91dHB1dDogbGluZSwgb21pdHRlZEZyYW1lczogMCB9O1xufVxuXG5mdW5jdGlvbiBwdXNoQ29tcGFjdGVkTGluZShjb21wYWN0ZWQ6IHN0cmluZ1tdLCBsaW5lOiBDb21wYWN0ZWRMaW5lKTogdm9pZCB7XG5cdGlmIChsaW5lLm9taXR0ZWRGcmFtZXMgPiAwKSB7XG5cdFx0Y29tcGFjdGVkLnB1c2goYFtnaXQgcHJvZ3Jlc3M6IG9taXR0ZWQgJHtsaW5lLm9taXR0ZWRGcmFtZXN9IGVhcmxpZXIgZnJhbWUocyldYCk7XG5cdH1cblx0Y29tcGFjdGVkLnB1c2gobGluZS5vdXRwdXQpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0R2l0UHJvZ3Jlc3NMaW5lKGxpbmU6IHN0cmluZyk6IENvbXBhY3RlZExpbmUge1xuXHRyZXR1cm4gY29tcGFjdFByb2dyZXNzUGF0dGVybnNVbmxlc3NEaWFnbm9zdGljKFxuXHRcdGxpbmUsXG5cdFx0W1xuXHRcdFx0U3RyaW5nLnJhd2AoPzpyZW1vdGU6ICk/KD86RW51bWVyYXRpbmd8Q291bnRpbmd8Q29tcHJlc3NpbmcpIG9iamVjdHM6XFxzK1xcZCslW14pXSpcXChcXGQrL1xcZCtcXCkoPzosIGRvbmVcXC4pP2AsXG5cdFx0XHRTdHJpbmcucmF3YCg/OnJlbW90ZTogKT9SZWNlaXZpbmcgb2JqZWN0czpcXHMrXFxkKyVbXildKlxcKFxcZCsvXFxkK1xcKSg/OiwgW14pXSopP2AsXG5cdFx0XHRTdHJpbmcucmF3YCg/OnJlbW90ZTogKT9SZXNvbHZpbmcgZGVsdGFzOlxccytcXGQrJVteKV0qXFwoXFxkKy9cXGQrXFwpKD86LCBkb25lXFwuKT9gLFxuXHRcdFx0U3RyaW5nLnJhd2AoPzpyZW1vdGU6ICk/V3JpdGluZyBvYmplY3RzOlxccytcXGQrJVteKV0qXFwoXFxkKy9cXGQrXFwpKD86LCBbXildKik/YCxcblx0XHRdLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0UHJvZ3Jlc3NQYXR0ZXJuc1VubGVzc0RpYWdub3N0aWMobGluZTogc3RyaW5nLCBwYXR0ZXJuczogc3RyaW5nW10pOiBDb21wYWN0ZWRMaW5lIHtcblx0aWYgKGlzRGlhZ25vc3RpY0xpbmUobGluZSkpIHtcblx0XHRyZXR1cm4gdW5jaGFuZ2VkTGluZShsaW5lKTtcblx0fVxuXHRyZXR1cm4gY29tcGFjdFByb2dyZXNzUGF0dGVybnMobGluZSwgcGF0dGVybnMpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0UHJvZ3Jlc3NQYXR0ZXJucyhsaW5lOiBzdHJpbmcsIHBhdHRlcm5zOiBzdHJpbmdbXSk6IENvbXBhY3RlZExpbmUge1xuXHRsZXQgb3V0cHV0ID0gbGluZTtcblx0bGV0IG9taXR0ZWRGcmFtZXMgPSAwO1xuXHRmb3IgKGNvbnN0IHBhdHRlcm4gb2YgcGF0dGVybnMpIHtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wYWN0UmVwZWF0ZWRQcm9ncmVzc0ZyYW1lcyhvdXRwdXQsIHBhdHRlcm4pO1xuXHRcdG91dHB1dCA9IHJlc3VsdC5vdXRwdXQ7XG5cdFx0b21pdHRlZEZyYW1lcyArPSByZXN1bHQub21pdHRlZEZyYW1lcztcblx0fVxuXHRyZXR1cm4geyBvdXRwdXQsIG9taXR0ZWRGcmFtZXMgfTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdFJlcGVhdGVkUHJvZ3Jlc3NGcmFtZXMobGluZTogc3RyaW5nLCBwYXR0ZXJuOiBzdHJpbmcpOiBDb21wYWN0ZWRMaW5lIHtcblx0Y29uc3QgbWF0Y2hlcyA9IHJlZ2V4RmluZEFsbChwYXR0ZXJuLCBsaW5lKTtcblx0aWYgKG1hdGNoZXMubGVuZ3RoIDw9IDEpIHtcblx0XHRyZXR1cm4gdW5jaGFuZ2VkTGluZShsaW5lKTtcblx0fVxuXG5cdGNvbnN0IGZpcnN0ID0gbWF0Y2hlc1swXTtcblx0Y29uc3QgbGFzdCA9IG1hdGNoZXNbbWF0Y2hlcy5sZW5ndGggLSAxXTtcblx0Y29uc3Qgb3V0cHV0ID0gbGluZS5zbGljZSgwLCBmaXJzdC5zdGFydCkgKyBsaW5lLnNsaWNlKGxhc3Quc3RhcnQsIGxhc3QuZW5kKSArIGxpbmUuc2xpY2UobGFzdC5lbmQpO1xuXHRyZXR1cm4geyBvdXRwdXQsIG9taXR0ZWRGcmFtZXM6IG1hdGNoZXMubGVuZ3RoIC0gMSB9O1xufVxuXG5mdW5jdGlvbiBnZXRHaXRQcm9ncmVzc0xpbmVLZXkobGluZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKGlzRGlhZ25vc3RpY0xpbmUobGluZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHN0cmlwcGVkID0gc3RyaXBQcmVmaXgobGluZSwgJ3JlbW90ZTonKTtcblx0Y29uc3Qgbm9ybWFsaXplZCA9IHN0cmlwcGVkICE9PSB1bmRlZmluZWQgPyBzdHJpcHBlZC50cmltU3RhcnQoKSA6IGxpbmU7XG5cdGNvbnN0IHNwbGl0ID0gc3BsaXRPbmNlKG5vcm1hbGl6ZWQsICc6Jyk7XG5cdGlmIChzcGxpdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBrZXkgPSBzcGxpdFswXTtcblx0Y29uc3QgcmVzdCA9IHNwbGl0WzFdO1xuXHRpZiAoIVtcblx0XHQnRW51bWVyYXRpbmcgb2JqZWN0cycsXG5cdFx0J0NvdW50aW5nIG9iamVjdHMnLFxuXHRcdCdDb21wcmVzc2luZyBvYmplY3RzJyxcblx0XHQnUmVjZWl2aW5nIG9iamVjdHMnLFxuXHRcdCdXcml0aW5nIG9iamVjdHMnLFxuXHRcdCdSZXNvbHZpbmcgZGVsdGFzJyxcblx0XS5pbmNsdWRlcyhrZXkpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAocmVnZXhUZXN0KFN0cmluZy5yYXdgXlxccytcXGQrJWAsIHJlc3QpKSB7XG5cdFx0cmV0dXJuIGtleTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0SnNUZXN0T3V0cHV0KG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IGNvbXBhY3RlZCA9IGNvbXBhY3RSZXBlYXRlZE5vZGVXYXJuaW5ncyhvdXRwdXQpO1xuXHRjb21wYWN0ZWQgPSBjb21wYWN0SmVzdFJ1bnNQcm9ncmVzcyhjb21wYWN0ZWQpO1xuXHRpZiAoaGFzUGFzc2luZ0pzVGVzdFN1bW1hcnkoY29tcGFjdGVkKSkge1xuXHRcdGNvbXBhY3RlZCA9IG9taXROb25EaWFnbm9zdGljTGluZXMoY29tcGFjdGVkLCAnanMgdGVzdCBwcm9ncmVzcycsIGlzSnNUZXN0UHJvZ3Jlc3NMaW5lKTtcblx0fVxuXHRyZXR1cm4gY29tcGFjdGVkO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0SmVzdFJ1bnNQcm9ncmVzcyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghaGFzSmVzdFJ1bnNQcm9ncmVzcyhvdXRwdXQpKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXHRyZXR1cm4gb21pdE1hdGNoaW5nTGluZXMoXG5cdFx0b3V0cHV0LFxuXHRcdCdqZXN0IHJ1bnMgcHJvZ3Jlc3MnLFxuXHRcdGlzSmVzdFJ1bnNQcm9ncmVzc0xpbmUsXG5cdFx0J3Byb2dyZXNzJyxcblx0KTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbmZ1bmN0aW9uIGhhc1Bhc3NpbmdKc1Rlc3RTdW1tYXJ5KG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChyZWdleFRlc3QoU3RyaW5nLnJhd2AoPzpefFxcbilcXHMqKD86RkFJTHxcXHUyNzE3fFxcdTAwRDd8XFx1MjcxNilcXHNgLCBvdXRwdXQpXG5cdFx0fHwgcmVnZXhUZXN0V2l0aEZsYWdzKFN0cmluZy5yYXdgXFxiWzEtOV1cXGQqXFxzK2ZhaWxlZFxcYmAsIG91dHB1dCwgJ2knKVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YCg/Ol58XFxuKVxccypcXGQrXFxzK2ZhaWxpbmdcXGJgLCBvdXRwdXQpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgKD86XnxcXG4pXFxzKm5vdFxccytva1xccytcXGQrXFxiYCwgb3V0cHV0KVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YCg/Ol58XFxuKSNcXHMrZmFpbFxccytbMS05XVxcZCpcXGJgLCBvdXRwdXQpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgKD86XnxcXG4pXFxzKkJhaWwgb3V0IWAsIG91dHB1dClcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2AoPzpefFxcbikuKkVSUiFgLCBvdXRwdXQpXG5cdCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gcmVnZXhUZXN0V2l0aEZsYWdzKFxuXHRcdFN0cmluZy5yYXdgKD86XnxcXG4pXFxzKig/OlRlc3QgRmlsZXN8VGVzdHM/OnxUZXN0IFN1aXRlczopXFxzK1xcZCtcXHMrcGFzc2VkXFxiYCxcblx0XHRvdXRwdXQsXG5cdFx0J2knLFxuXHQpIHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YCg/Ol58XFxuKVxccytcXGQrXFxzK3Bhc3NpbmdcXGJgLCBvdXRwdXQpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgKD86XnxcXG4pI1xccytva1xcYmAsIG91dHB1dClcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2AoPzpefFxcbikjXFxzK3Bhc3NcXHMrWzEtOV1cXGQqXFxiYCwgb3V0cHV0KTtcbn1cblxuZnVuY3Rpb24gaGFzSmVzdFJ1bnNQcm9ncmVzcyhvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gb3V0cHV0LnNwbGl0KCdcXG4nKS5zb21lKGxpbmUgPT4gcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxccypSVU5TXFxzK1xcU2AsIGxpbmUpKVxuXHRcdCYmIGhhc0plc3RTdW1tYXJ5TWFya2VyKG91dHB1dCk7XG59XG5cbmZ1bmN0aW9uIGhhc0plc3RTdW1tYXJ5TWFya2VyKG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PlxuXHRcdGxpbmUuc3RhcnRzV2l0aCgnVGVzdCBTdWl0ZXM6Jylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1Rlc3RzOicpXG5cdFx0fHwgbGluZS5zdGFydHNXaXRoKCdTbmFwc2hvdHM6Jylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1JhbiBhbGwgdGVzdCBzdWl0ZXMnKSk7XG59XG5cbmZ1bmN0aW9uIGlzSmVzdFJ1bnNQcm9ncmVzc0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxzKlJVTlNcXHMrXFxTYCwgbGluZSk7XG59XG5cbmZ1bmN0aW9uIGlzSnNUZXN0UHJvZ3Jlc3NMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIWlzRGlhZ25vc3RpY0xpbmUobGluZSlcblx0XHQmJiAocmVnZXhUZXN0KFN0cmluZy5yYXdgXlxccypSVU5cXHMrdj9cXGQrXFwuXFxkK1xcLlxcZCtgLCBsaW5lKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxccyooPzpcXHUyNzEzfFxcdTI3MTR8XFx1MjIxQSlcXHMrLisoPzpcXHMrXFxkK21zfFxccytcXChcXGQrKD86bXN8cylcXCkpJGAsIGxpbmUpXG5cdFx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxzKlBBU1NcXHMrLiskYCwgbGluZSlcblx0XHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXHMqb2tcXHMrXFxkK1xcYmAsIGxpbmUpXG5cdFx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeWy5dKyg/OlxccytcXFtcXHMqXFxkKyVcXF0pP1xccyokYCwgbGluZSkpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0R3JhZGxlT3V0cHV0KG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgY29tcGFjdGVkID0gY29tcGFjdEludHJhbGluZVByb2dyZXNzKFxuXHRcdG91dHB1dCxcblx0XHQnZ3JhZGxlIHJpY2gtY29uc29sZSBwcm9ncmVzcycsXG5cdFx0Y29tcGFjdEdyYWRsZVByb2dyZXNzRnJhbWVzLFxuXHQpO1xuXHRyZXR1cm4gb21pdE5vbkRpYWdub3N0aWNMaW5lcyhjb21wYWN0ZWQsICdncmFkbGUgYm9pbGVycGxhdGUnLCBpc0dyYWRsZUJvaWxlcnBsYXRlTGluZSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RJbnRyYWxpbmVQcm9ncmVzcyhcblx0b3V0cHV0OiBzdHJpbmcsXG5cdGxhYmVsOiBzdHJpbmcsXG5cdGNvbXBhY3RMaW5lOiAobGluZTogc3RyaW5nKSA9PiBDb21wYWN0ZWRMaW5lLFxuKTogc3RyaW5nIHtcblx0bGV0IG9taXR0ZWRGcmFtZXMgPSAwO1xuXHRjb25zdCBjb21wYWN0ZWQgPSBvdXRwdXRcblx0XHQuc3BsaXQoJ1xcbicpXG5cdFx0Lm1hcChsaW5lID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXBhY3RMaW5lKGxpbmUpO1xuXHRcdFx0b21pdHRlZEZyYW1lcyArPSByZXN1bHQub21pdHRlZEZyYW1lcztcblx0XHRcdHJldHVybiByZXN1bHQub3V0cHV0O1xuXHRcdH0pXG5cdFx0LmpvaW4oJ1xcbicpO1xuXHRpZiAob21pdHRlZEZyYW1lcyA9PT0gMCkge1xuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblx0cmV0dXJuIGBbJHtsYWJlbH06IG9taXR0ZWQgJHtvbWl0dGVkRnJhbWVzfSBlYXJsaWVyIGZyYW1lKHMpXVxcbiR7Y29tcGFjdGVkfWA7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RHcmFkbGVQcm9ncmVzc0ZyYW1lcyhsaW5lOiBzdHJpbmcpOiBDb21wYWN0ZWRMaW5lIHtcblx0aWYgKGlzRGlhZ25vc3RpY0xpbmUobGluZSkpIHtcblx0XHRyZXR1cm4gdW5jaGFuZ2VkTGluZShsaW5lKTtcblx0fVxuXG5cdGNvbnN0IG1hdGNoZXMgPSByZWdleEZpbmRBbGwoXG5cdFx0U3RyaW5nLnJhd2AoPzo8Wy09XSs+fFxcdTI1MDJbXlxcdTI1MDJcXG5dK1xcdTI1MDIpXFxzK1xcZCslXFxzKyg/OklOSVRJQUxJWklOR3xDT05GSUdVUklOR3xFWEVDVVRJTkd8V0FJVElORylcXHMrXFxbW15cXF1cXG5dK1xcXWAsXG5cdFx0bGluZSxcblx0KTtcblx0aWYgKG1hdGNoZXMubGVuZ3RoIDw9IDEpIHtcblx0XHRyZXR1cm4gdW5jaGFuZ2VkTGluZShsaW5lKTtcblx0fVxuXG5cdGxldCBvdXRwdXQgPSAnJztcblx0bGV0IGN1cnNvciA9IDA7XG5cdGxldCBvbWl0dGVkRnJhbWVzID0gMDtcblx0bGV0IHN0YXJ0ID0gMDtcblx0d2hpbGUgKHN0YXJ0IDwgbWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRsZXQgZW5kID0gc3RhcnQ7XG5cdFx0d2hpbGUgKGVuZCArIDEgPCBtYXRjaGVzLmxlbmd0aFxuXHRcdFx0JiYgaXNHcmFkbGVQcm9ncmVzc0ZyYW1lU2VwYXJhdG9yKGxpbmUsIG1hdGNoZXNbZW5kXSwgbWF0Y2hlc1tlbmQgKyAxXSlcblx0XHQpIHtcblx0XHRcdGVuZCArPSAxO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0UmFuZ2UgPSBtYXRjaGVzW3N0YXJ0XTtcblx0XHRjb25zdCBlbmRSYW5nZSA9IG1hdGNoZXNbZW5kXTtcblx0XHRpZiAoZW5kID4gc3RhcnQpIHtcblx0XHRcdG91dHB1dCArPSBsaW5lLnNsaWNlKGN1cnNvciwgc3RhcnRSYW5nZS5zdGFydCk7XG5cdFx0XHRvdXRwdXQgKz0gbGluZS5zbGljZShlbmRSYW5nZS5zdGFydCwgZW5kUmFuZ2UuZW5kKTtcblx0XHRcdG9taXR0ZWRGcmFtZXMgKz0gZW5kIC0gc3RhcnQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG91dHB1dCArPSBsaW5lLnNsaWNlKGN1cnNvciwgZW5kUmFuZ2UuZW5kKTtcblx0XHR9XG5cdFx0Y3Vyc29yID0gZW5kUmFuZ2UuZW5kO1xuXHRcdHN0YXJ0ID0gZW5kICsgMTtcblx0fVxuXHRvdXRwdXQgKz0gbGluZS5zbGljZShjdXJzb3IpO1xuXHRyZXR1cm4geyBvdXRwdXQsIG9taXR0ZWRGcmFtZXMgfTtcbn1cblxuZnVuY3Rpb24gaXNHcmFkbGVQcm9ncmVzc0ZyYW1lU2VwYXJhdG9yKFxuXHRsaW5lOiBzdHJpbmcsXG5cdHByZXZpb3VzOiB7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH0sXG5cdG5leHQ6IHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXIgfSxcbik6IGJvb2xlYW4ge1xuXHRjb25zdCBzZXBhcmF0b3IgPSBsaW5lLnNsaWNlKHByZXZpb3VzLmVuZCwgbmV4dC5zdGFydCk7XG5cdGlmIChzZXBhcmF0b3IubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzZXBhcmF0b3IubGVuZ3RoOyBpICs9IDYpIHtcblx0XHRpZiAoc2VwYXJhdG9yLnNsaWNlKGksIGkgKyA2KSAhPT0gJz4gSURMRScpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzR3JhZGxlQm9pbGVycGxhdGVMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKGxpbmUuc3RhcnRzV2l0aCgnQ29uc2lkZXIgZW5hYmxpbmcgY29uZmlndXJhdGlvbiBjYWNoZSB0byBzcGVlZCB1cCB0aGlzIGJ1aWxkOiBodHRwczovL2RvY3MuZ3JhZGxlLm9yZy8nKVxuXHRcdCYmIGxpbmUuZW5kc1dpdGgoJy91c2VyZ3VpZGUvY29uZmlndXJhdGlvbl9jYWNoZV9lbmFibGluZy5odG1sJykpXG5cdFx0fHwgbGluZSA9PT0gJz4gUnVuIHdpdGggLS1zdGFja3RyYWNlIG9wdGlvbiB0byBnZXQgdGhlIHN0YWNrIHRyYWNlLidcblx0XHR8fCBsaW5lID09PSAnPiBSdW4gd2l0aCAtLWluZm8gb3IgLS1kZWJ1ZyBvcHRpb24gdG8gZ2V0IG1vcmUgbG9nIG91dHB1dC4nXG5cdFx0fHwgbGluZSA9PT0gJz4gUnVuIHdpdGggLS1zY2FuIHRvIGdldCBmdWxsIGluc2lnaHRzIGZyb20gYSBCdWlsZCBTY2FuIChwb3dlcmVkIGJ5IERldmVsb2NpdHkpLidcblx0XHR8fCBsaW5lID09PSAnPiBHZXQgbW9yZSBoZWxwIGF0IGh0dHBzOi8vaGVscC5ncmFkbGUub3JnLic7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RVdlByb2dyZXNzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCEoaGFzVXZTdW1tYXJ5TWFya2VyKG91dHB1dCkgJiYgb3V0cHV0LnNwbGl0KCdcXG4nKS5zb21lKGxpbmUgPT4gaXNVdlByb2dyZXNzTGluZShsaW5lKSkpKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXHRjb25zdCBjb21wYWN0ZWQgPSBjb2xsYXBzZUNvbnRpZ3VvdXNSdW5zKG91dHB1dCwgaXNVdlByb2dyZXNzTGluZSwgNCwgYmxvY2sgPT4ge1xuXHRcdGNvbnN0IGV4YW1wbGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBibG9jaykge1xuXHRcdFx0Y29uc3QgZXhhbXBsZSA9IHV2UHJvZ3Jlc3NFeGFtcGxlKGxpbmUpO1xuXHRcdFx0aWYgKGV4YW1wbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRleGFtcGxlcy5wdXNoKGV4YW1wbGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZXhhbXBsZXMubGVuZ3RoICE9PSBibG9jay5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2aXR5TGlzdDogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgYmxvY2spIHtcblx0XHRcdGNvbnN0IGFjdGl2aXR5ID0gdXZQcm9ncmVzc0FjdGl2aXR5KGxpbmUpO1xuXHRcdFx0aWYgKGFjdGl2aXR5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YWN0aXZpdHlMaXN0LnB1c2goYWN0aXZpdHkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBhY3Rpdml0aWVzID0gdW5pcXVlU3RyaW5ncyhhY3Rpdml0eUxpc3QpO1xuXHRcdGNvbnN0IGFjdGl2aXR5U3VtbWFyeSA9IGFjdGl2aXRpZXMubGVuZ3RoID09PSAwXG5cdFx0XHQ/ICcnXG5cdFx0XHQ6IGA7IGFjdGl2ZTogJHtzdW1tYXJpemVXaXRoTW9yZShhY3Rpdml0aWVzLCA1KX1gO1xuXHRcdHJldHVybiBgW3V2IHByb2dyZXNzOiBvbWl0dGVkICR7YmxvY2subGVuZ3RofSByb3cocyk7IGV4YW1wbGVzOiAke3N1bW1hcml6ZVdpdGhNb3JlKHVuaXF1ZVN0cmluZ3MoZXhhbXBsZXMpLCAxMCl9JHthY3Rpdml0eVN1bW1hcnl9XWA7XG5cdH0pO1xuXHRyZXR1cm4gY29tcGFjdGVkLnJlcGxhY2UoL1xcbiskLywgJycpO1xufVxuXG5mdW5jdGlvbiBoYXNVdlN1bW1hcnlNYXJrZXIob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+XG5cdFx0KGxpbmUuc3RhcnRzV2l0aCgnVXNpbmcgQ1B5dGhvbiAnKSAmJiBsaW5lLmluY2x1ZGVzKCcgaW50ZXJwcmV0ZXIgYXQ6JykpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXig/OlJlc29sdmVkfFByZXBhcmVkfEluc3RhbGxlZHxBdWRpdGVkKSBcXGQrIHBhY2thZ2VzPyBpbiBcXFMrYCwgbGluZSkpO1xufVxuXG5mdW5jdGlvbiBpc1V2UHJvZ3Jlc3NMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCBub3JtYWxpemVkID0gc3RyaXBBbnNpKGxpbmUpLnRyaW0oKTtcblx0aWYgKGlzRGlhZ25vc3RpY0xpbmUobm9ybWFsaXplZCkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF5bXFx1MjgwMS1cXHUyOEZGXVxccysoPzpSZXNvbHZpbmcgZGVwZW5kZW5jaWVzfFByZXBhcmluZyBwYWNrYWdlc3xJbnN0YWxsaW5nIHBhY2thZ2VzfEJ1aWxkaW5nfERvd25sb2FkaW5nKVxcYmAsXG5cdFx0bm9ybWFsaXplZCxcblx0KSB8fCByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BeW0EtWmEtejAtOV8uLV0rXFxzKy17MTAsfVxccytcXGQrKD86XFwuXFxkKyk/XFxzKig/OkJ8S2lCfE1pQnxHaUJ8S0J8TUJ8R0IpL1xcZCsoPzpcXC5cXGQrKT9cXHMqKD86QnxLaUJ8TWlCfEdpQnxLQnxNQnxHQikoPzpcXHMrLispPyRgLFxuXHRcdG5vcm1hbGl6ZWQsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIHV2UHJvZ3Jlc3NFeGFtcGxlKGxpbmU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG5vcm1hbGl6ZWQgPSBzdHJpcEFuc2kobGluZSkudHJpbSgpO1xuXHRjb25zdCBwa2cgPSByZWdleENhcHR1cmVGaXJzdChTdHJpbmcucmF3YF4oW0EtWmEtejAtOV8uLV0rKVxccystezEwLH1gLCBub3JtYWxpemVkKTtcblx0aWYgKHBrZyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHBrZztcblx0fVxuXHRjb25zdCBmaXJzdENvZGVQb2ludCA9IG5vcm1hbGl6ZWQuY29kZVBvaW50QXQoMCk7XG5cdGlmIChmaXJzdENvZGVQb2ludCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBmaXJzdENoYXIgPSBTdHJpbmcuZnJvbUNvZGVQb2ludChmaXJzdENvZGVQb2ludCk7XG5cdGlmICghKGZpcnN0Q2hhciA+PSAnXFx1MjgwMScgJiYgZmlyc3RDaGFyIDw9ICdcXHUyOEZGJykpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHdpdGhvdXRTcGlubmVyID0gbm9ybWFsaXplZC5zbGljZShmaXJzdENoYXIubGVuZ3RoKS50cmltU3RhcnQoKTtcblx0Y29uc3QgZG90c0luZGV4ID0gd2l0aG91dFNwaW5uZXIuaW5kZXhPZignLi4uJyk7XG5cdGNvbnN0IHNwYWNlc0luZGV4ID0gd2l0aG91dFNwaW5uZXIuaW5kZXhPZignICAnKTtcblx0Y29uc3QgY2FuZGlkYXRlcyA9IFtkb3RzSW5kZXgsIHNwYWNlc0luZGV4XS5maWx0ZXIoaW5kZXggPT4gaW5kZXggIT09IC0xKTtcblx0Y29uc3QgZW5kID0gY2FuZGlkYXRlcy5sZW5ndGggPiAwID8gTWF0aC5taW4oLi4uY2FuZGlkYXRlcykgOiB3aXRob3V0U3Bpbm5lci5sZW5ndGg7XG5cdHJldHVybiB3aXRob3V0U3Bpbm5lci5zbGljZSgwLCBlbmQpLnRyaW0oKTtcbn1cblxuZnVuY3Rpb24gdXZQcm9ncmVzc0FjdGl2aXR5KGxpbmU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiByZWdleENhcHR1cmVGaXJzdChcblx0XHRTdHJpbmcucmF3YFxcc3syLH0oKD86QnVpbGRpbmd8RG93bmxvYWRpbmd8SW5zdGFsbGluZykgLispJGAsXG5cdFx0c3RyaXBBbnNpKGxpbmUpLnRyaW0oKSxcblx0KTtcbn1cblxuZnVuY3Rpb24gc3RyaXBBbnNpKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGxldCBvdXRwdXQgPSAnJztcblx0Y29uc3QgY2hhcnMgPSBBcnJheS5mcm9tKHRleHQpO1xuXHRsZXQgaSA9IDA7XG5cdHdoaWxlIChpIDwgY2hhcnMubGVuZ3RoKSB7XG5cdFx0Y29uc3QgY2ggPSBjaGFyc1tpXTtcblx0XHRpICs9IDE7XG5cdFx0aWYgKGNoICE9PSAnXFx4MWInIHx8IGNoYXJzW2ldICE9PSAnWycpIHtcblx0XHRcdG91dHB1dCArPSBjaDtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpICs9IDE7XG5cdFx0d2hpbGUgKGkgPCBjaGFycy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG5leHQgPSBjaGFyc1tpXTtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGlmIChuZXh0ID49ICdAJyAmJiBuZXh0IDw9ICd+Jykge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIG91dHB1dDtcbn1cblxuZnVuY3Rpb24gY29tcGFjdE54TGVybmFGcmFtZVByb2dyZXNzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFoYXNOeExlcm5hRnJhbWVQcm9ncmVzcyhvdXRwdXQpKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXHRjb25zdCBjYW5PbWl0U3RhdGljVGFza1RhYmxlID0gb3V0cHV0LnNwbGl0KCdcXG4nKS5zb21lKGxpbmUgPT5cblx0XHRyZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxzKk5YXFxzK1N1Y2Nlc3NmdWxseSByYW4gdGFyZ2V0XFxiYCwgbGluZSkpO1xuXG5cdGNvbnN0IGNvbXBhY3RlZDogc3RyaW5nW10gPSBbXTtcblx0Y29uc3Qgb21pdHRlZCA9IHsgY291bnQ6IDAgfTtcblx0Zm9yIChjb25zdCBsaW5lIG9mIG91dHB1dC5zcGxpdCgnXFxuJykpIHtcblx0XHRpZiAoaXNOeExlcm5hRnJhbWVOb2lzZUxpbmUobGluZSwgY2FuT21pdFN0YXRpY1Rhc2tUYWJsZSkpIHtcblx0XHRcdG9taXR0ZWQuY291bnQgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAobGluZS50cmltKCkubGVuZ3RoID09PSAwICYmIG9taXR0ZWQuY291bnQgPiAwKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Zmx1c2hOeExlcm5hT21pdHRlZChjb21wYWN0ZWQsIG9taXR0ZWQpO1xuXHRcdGNvbXBhY3RlZC5wdXNoKGxpbmUpO1xuXHR9XG5cdGZsdXNoTnhMZXJuYU9taXR0ZWQoY29tcGFjdGVkLCBvbWl0dGVkKTtcblx0cmV0dXJuIGNvbXBhY3RlZC5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gZmx1c2hOeExlcm5hT21pdHRlZChjb21wYWN0ZWQ6IHN0cmluZ1tdLCBvbWl0dGVkOiB7IGNvdW50OiBudW1iZXIgfSk6IHZvaWQge1xuXHRpZiAob21pdHRlZC5jb3VudCA+IDApIHtcblx0XHRjb21wYWN0ZWQucHVzaChgW254IGZyYW1lIHByb2dyZXNzOiBvbWl0dGVkICR7b21pdHRlZC5jb3VudH0gZnJhbWUgbGluZShzKV1gKTtcblx0XHRvbWl0dGVkLmNvdW50ID0gMDtcblx0fVxufVxuXG5mdW5jdGlvbiBpc054TGVybmFGcmFtZU5vaXNlTGluZShsaW5lOiBzdHJpbmcsIGNhbk9taXRTdGF0aWNUYXNrVGFibGU6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXHUyMDE0ezIwLH0kYCwgbGluZSlcblx0XHR8fCByZWdleFRlc3QoXG5cdFx0XHRTdHJpbmcucmF3YF5cXHMqKD86Tlh8TGVybmEgXFwocG93ZXJlZCBieSBOeFxcKSlcXHMrUnVubmluZyB0YXJnZXQgXFxTKyBmb3IgXFxkKyBwcm9qZWN0cz8kYCxcblx0XHRcdGxpbmUsXG5cdFx0KVxuXHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXlxccypOWFxccytSdW5uaW5nIFxcZCsgXFxTKyB0YXNrc1xcLlxcLlxcLlxccytDYWNoZVxccytEdXJhdGlvbiRgLFxuXHRcdFx0bGluZSxcblx0XHQpXG5cdFx0fHwgKGNhbk9taXRTdGF0aWNUYXNrVGFibGVcblx0XHRcdCYmIHJlZ2V4VGVzdChcblx0XHRcdFx0U3RyaW5nLnJhd2BeXFxzKk5YXFxzK1J1bm5pbmcgXFxkKyBcXFMrIHRhc2tzXFwuXFwuXFwuXFxzK0NhY2hlXFxzK0R1cmF0aW9uXFxzKy4rJGAsXG5cdFx0XHRcdGxpbmUsXG5cdFx0XHQpKVxuXHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXlxccytcXHUyMTkyXFxzK0V4ZWN1dGluZyBcXGQrL1xcZCsgcmVtYWluaW5nIHRhc2tzKD86IGluIHBhcmFsbGVsKT9cXC5cXC5cXC4kYCxcblx0XHRcdGxpbmUsXG5cdFx0KVxuXHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFN0cmluZy5yYXdgXlxccytbXFx1MjgwQlxcdTI4MTlcXHUyODM5XFx1MjgzOFxcdTI4M0NcXHUyODM0XFx1MjgyNlxcdTI4MjdcXHUyODA3XFx1MjgwRl1cXHMrKD86bnggcnVuIFxcUyt8QFtcXHcuLV0rL1tcXHcuLV0rOlxcUyspJGAsXG5cdFx0XHRsaW5lLFxuXHRcdCk7XG59XG5cbmZ1bmN0aW9uIGhhc054TGVybmFGcmFtZVByb2dyZXNzKG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBvdXRwdXQuaW5jbHVkZXMoJ05YICAgUnVubmluZyB0YXJnZXQnKVxuXHRcdHx8IG91dHB1dC5pbmNsdWRlcygnTGVybmEgKHBvd2VyZWQgYnkgTngpJylcblx0XHR8fCBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PlxuXHRcdFx0cmVnZXhUZXN0KFN0cmluZy5yYXdgXlxccypOWFxccytSdW5uaW5nIFxcZCsgXFxTKyB0YXNrc1xcLlxcLlxcLlxccytDYWNoZVxccytEdXJhdGlvbmAsIGxpbmUpKTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdFBucG1PdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgY29tcGFjdGVkID0gY29tcGFjdFJlcGVhdGVkTm9kZVdhcm5pbmdzKG91dHB1dCk7XG5cdGNvbXBhY3RlZCA9IGNvbXBhY3RQYWNrYWdlTWFuYWdlck9wZXJhdGlvbnMoY29tcGFjdGVkKTtcblx0cmV0dXJuIGNvbXBhY3RQbnBtSW5zdGFsbFByb2dyZXNzKGNvbXBhY3RlZCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RQbnBtSW5zdGFsbFByb2dyZXNzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgbGluZXMgPSBvdXRwdXQuc3BsaXQoJ1xcbicpO1xuXHRjb25zdCBsYXN0UHJvZ3Jlc3NJbmRleGVzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0Y29uc3QgbGFzdERvd25sb2FkSW5kZXhlcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdGNvbnN0IGxhc3RXYXJuaW5nQ291bnRlckluZGV4ZXMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG5cdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBsaW5lcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRjb25zdCBsaW5lID0gbGluZXNbaW5kZXhdO1xuXHRcdGlmIChpc1BucG1Qcm9ncmVzc0xpbmUobGluZSkpIHtcblx0XHRcdGxhc3RQcm9ncmVzc0luZGV4ZXMuc2V0KHBucG1Xb3Jrc3BhY2VQcmVmaXgobGluZSksIGluZGV4KTtcblx0XHR9XG5cdFx0Y29uc3QgcGFja2FnZU5hbWUgPSBwbnBtRG93bmxvYWRQYWNrYWdlKGxpbmUpO1xuXHRcdGlmIChwYWNrYWdlTmFtZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRsYXN0RG93bmxvYWRJbmRleGVzLnNldChwYWNrYWdlTmFtZSwgaW5kZXgpO1xuXHRcdH1cblx0XHRpZiAoaXNQbnBtV2FybmluZ0NvdW50ZXJMaW5lKGxpbmUpKSB7XG5cdFx0XHRsYXN0V2FybmluZ0NvdW50ZXJJbmRleGVzLnNldChwbnBtV29ya3NwYWNlUHJlZml4KGxpbmUpLCBpbmRleCk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBvbWl0dGVkUHJvZ3Jlc3MgPSB7IGNvdW50OiAwIH07XG5cdGNvbnN0IG9taXR0ZWRXYXJuaW5nQ291bnRlcnMgPSB7IGNvdW50OiAwIH07XG5cdGNvbnN0IG9taXR0ZWREb3dubG9hZHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG5cdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBsaW5lcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRjb25zdCBsaW5lID0gbGluZXNbaW5kZXhdO1xuXHRcdGNvbnN0IHBhY2thZ2VCYXJTaXplID0gcG5wbVBhY2thZ2VCYXJTaXplKGluZGV4ID49IDEgPyBsaW5lc1tpbmRleCAtIDFdIDogdW5kZWZpbmVkLCBsaW5lKTtcblx0XHRpZiAocGFja2FnZUJhclNpemUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2goYFtwbnBtIGluc3RhbGwgcGFja2FnZSBiYXI6IG9taXR0ZWQgJHtwYWNrYWdlQmFyU2l6ZX0gcGx1cyBjaGFyYWN0ZXIocyldYCk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9ncmVzc1ByZWZpeCA9IHBucG1Xb3Jrc3BhY2VQcmVmaXgobGluZSk7XG5cdFx0aWYgKGlzUG5wbVByb2dyZXNzTGluZShsaW5lKVxuXHRcdFx0JiYgbGFzdFByb2dyZXNzSW5kZXhlcy5nZXQocHJvZ3Jlc3NQcmVmaXgpICE9PSBpbmRleFxuXHRcdCkge1xuXHRcdFx0b21pdHRlZFByb2dyZXNzLmNvdW50ICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCBwYWNrYWdlTmFtZSA9IHBucG1Eb3dubG9hZFBhY2thZ2UobGluZSk7XG5cdFx0aWYgKHBhY2thZ2VOYW1lICE9PSB1bmRlZmluZWRcblx0XHRcdCYmIGxhc3REb3dubG9hZEluZGV4ZXMuZ2V0KHBhY2thZ2VOYW1lKSAhPT0gaW5kZXhcblx0XHQpIHtcblx0XHRcdG9taXR0ZWREb3dubG9hZHMuc2V0KHBhY2thZ2VOYW1lLCAob21pdHRlZERvd25sb2Fkcy5nZXQocGFja2FnZU5hbWUpID8/IDApICsgMSk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCB3YXJuaW5nUHJlZml4ID0gcG5wbVdvcmtzcGFjZVByZWZpeChsaW5lKTtcblx0XHRpZiAoaXNQbnBtV2FybmluZ0NvdW50ZXJMaW5lKGxpbmUpXG5cdFx0XHQmJiBsYXN0V2FybmluZ0NvdW50ZXJJbmRleGVzLmdldCh3YXJuaW5nUHJlZml4KSAhPT0gaW5kZXhcblx0XHQpIHtcblx0XHRcdG9taXR0ZWRXYXJuaW5nQ291bnRlcnMuY291bnQgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmIChpc1BucG1Qcm9ncmVzc0xpbmUobGluZSkpIHtcblx0XHRcdGZsdXNoUG5wbVByb2dyZXNzKGNvbXBhY3RlZCwgb21pdHRlZFByb2dyZXNzKTtcblx0XHR9IGVsc2UgaWYgKHBhY2thZ2VOYW1lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGZsdXNoUG5wbURvd25sb2FkKGNvbXBhY3RlZCwgb21pdHRlZERvd25sb2FkcywgcGFja2FnZU5hbWUpO1xuXHRcdH0gZWxzZSBpZiAoaXNQbnBtV2FybmluZ0NvdW50ZXJMaW5lKGxpbmUpKSB7XG5cdFx0XHRmbHVzaFBucG1XYXJuaW5nQ291bnRlcnMoY29tcGFjdGVkLCBvbWl0dGVkV2FybmluZ0NvdW50ZXJzKTtcblx0XHR9XG5cdFx0Y29tcGFjdGVkLnB1c2gobGluZSk7XG5cdH1cblxuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBmbHVzaFBucG1Qcm9ncmVzcyhjb21wYWN0ZWQ6IHN0cmluZ1tdLCBvbWl0dGVkUHJvZ3Jlc3M6IHsgY291bnQ6IG51bWJlciB9KTogdm9pZCB7XG5cdGlmIChvbWl0dGVkUHJvZ3Jlc3MuY291bnQgPiAwKSB7XG5cdFx0Y29tcGFjdGVkLnB1c2goYFtwbnBtIGluc3RhbGwgcHJvZ3Jlc3M6IG9taXR0ZWQgJHtvbWl0dGVkUHJvZ3Jlc3MuY291bnR9IGVhcmxpZXIgcHJvZ3Jlc3MgbGluZShzKV1gKTtcblx0XHRvbWl0dGVkUHJvZ3Jlc3MuY291bnQgPSAwO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZsdXNoUG5wbVdhcm5pbmdDb3VudGVycyhjb21wYWN0ZWQ6IHN0cmluZ1tdLCBvbWl0dGVkV2FybmluZ0NvdW50ZXJzOiB7IGNvdW50OiBudW1iZXIgfSk6IHZvaWQge1xuXHRpZiAob21pdHRlZFdhcm5pbmdDb3VudGVycy5jb3VudCA+IDApIHtcblx0XHRjb21wYWN0ZWQucHVzaChgW3BucG0gaW5zdGFsbCB3YXJuaW5nIGNvdW50ZXI6IG9taXR0ZWQgJHtvbWl0dGVkV2FybmluZ0NvdW50ZXJzLmNvdW50fSBlYXJsaWVyIGNvdW50ZXIgbGluZShzKV1gKTtcblx0XHRvbWl0dGVkV2FybmluZ0NvdW50ZXJzLmNvdW50ID0gMDtcblx0fVxufVxuXG5mdW5jdGlvbiBmbHVzaFBucG1Eb3dubG9hZChcblx0Y29tcGFjdGVkOiBzdHJpbmdbXSxcblx0b21pdHRlZERvd25sb2FkczogTWFwPHN0cmluZywgbnVtYmVyPixcblx0cGFja2FnZU5hbWU6IHN0cmluZyxcbik6IHZvaWQge1xuXHRjb25zdCBvbWl0dGVkID0gb21pdHRlZERvd25sb2Fkcy5nZXQocGFja2FnZU5hbWUpID8/IDA7XG5cdG9taXR0ZWREb3dubG9hZHMuZGVsZXRlKHBhY2thZ2VOYW1lKTtcblx0aWYgKG9taXR0ZWQgPiAwKSB7XG5cdFx0Y29tcGFjdGVkLnB1c2goYFtwbnBtIGluc3RhbGwgZG93bmxvYWRzOiBvbWl0dGVkICR7b21pdHRlZH0gZWFybGllciBmcmFtZShzKSBmb3IgJHtwYWNrYWdlTmFtZX1dYCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNQbnBtUHJvZ3Jlc3NMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCByZXN0ID0gc3RyaXBQbnBtV29ya3NwYWNlUHJlZml4KGxpbmUpO1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXlByb2dyZXNzOiByZXNvbHZlZCBcXGQrLCByZXVzZWQgXFxkKywgZG93bmxvYWRlZCBcXGQrLCBhZGRlZCBcXGQrKD86LCBkb25lKT8kYCxcblx0XHRyZXN0LFxuXHQpO1xufVxuXG5mdW5jdGlvbiBwbnBtRG93bmxvYWRQYWNrYWdlKGxpbmU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHN0cmlwcGVkID0gc3RyaXBQbnBtV29ya3NwYWNlUHJlZml4KGxpbmUpO1xuXHRjb25zdCByZXN0ID0gc3RyaXBQcmVmaXgoc3RyaXBwZWQsICdEb3dubG9hZGluZyAnKTtcblx0aWYgKHJlc3QgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgc3BsaXQgPSBzcGxpdE9uY2UocmVzdCwgJzogJyk7XG5cdGlmIChzcGxpdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBbcGtnLCBzaXplc10gPSBzcGxpdDtcblx0aWYgKHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF5cXGQrKD86XFwuXFxkKyk/ICg/OkJ8a0J8TUJ8R0IpL1xcZCsoPzpcXC5cXGQrKT8gKD86QnxrQnxNQnxHQikoPzosIGRvbmUpPyRgLFxuXHRcdHNpemVzLFxuXHQpKSB7XG5cdFx0cmV0dXJuIHBrZztcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBpc1BucG1XYXJuaW5nQ291bnRlckxpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoXG5cdFx0U3RyaW5nLnJhd2BeXFxzKldBUk5cXHMrXFxkKyBvdGhlciB3YXJuaW5ncyRgLFxuXHRcdHN0cmlwUG5wbVdvcmtzcGFjZVByZWZpeChsaW5lKSxcblx0KTtcbn1cblxuZnVuY3Rpb24gcG5wbVBhY2thZ2VCYXJTaXplKHByZXZpb3VzTGluZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBsaW5lOiBzdHJpbmcpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRpZiAocHJldmlvdXNMaW5lID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGNvdW50VGV4dCA9IHN0cmlwUHJlZml4KHByZXZpb3VzTGluZSwgJ1BhY2thZ2VzOiArJyk7XG5cdGlmIChjb3VudFRleHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgY291bnQgPSBwYXJzZVVzaXplKGNvdW50VGV4dCk7XG5cdGlmIChjb3VudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAobGluZS5sZW5ndGggPiAwICYmIFsuLi5saW5lXS5ldmVyeShjaCA9PiBjaCA9PT0gJysnKSAmJiBsaW5lLmxlbmd0aCA9PT0gY291bnQpIHtcblx0XHRyZXR1cm4gY291bnQ7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gcG5wbVdvcmtzcGFjZVByZWZpeChsaW5lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBlbmQgPSBwbnBtV29ya3NwYWNlUHJlZml4RW5kKGxpbmUpO1xuXHRyZXR1cm4gZW5kICE9PSB1bmRlZmluZWQgPyBsaW5lLnNsaWNlKDAsIGVuZCkgOiAnJztcbn1cblxuZnVuY3Rpb24gc3RyaXBQbnBtV29ya3NwYWNlUHJlZml4KGxpbmU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IGVuZCA9IHBucG1Xb3Jrc3BhY2VQcmVmaXhFbmQobGluZSk7XG5cdHJldHVybiBlbmQgIT09IHVuZGVmaW5lZCA/IGxpbmUuc2xpY2UoZW5kKSA6IGxpbmU7XG59XG5cbmZ1bmN0aW9uIHBucG1Xb3Jrc3BhY2VQcmVmaXhFbmQobGluZTogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgaW5kZXggPSBsaW5lLmluZGV4T2YoJ3wnKTtcblx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKGluZGV4ID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRsZXQgZW5kID0gaW5kZXggKyAxO1xuXHRmb3IgKGNvbnN0IGNoIG9mIGxpbmUuc2xpY2UoZW5kKSkge1xuXHRcdGlmICghaXNXaGl0ZXNwYWNlQ2hhcihjaCkpIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRlbmQgKz0gY2gubGVuZ3RoO1xuXHR9XG5cdHJldHVybiBlbmQ7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3ROcG1PdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgY29tcGFjdGVkID0gY29tcGFjdFJlcGVhdGVkTm9kZVdhcm5pbmdzKG91dHB1dCk7XG5cdGNvbXBhY3RlZCA9IGNvbXBhY3RQYWNrYWdlTWFuYWdlck9wZXJhdGlvbnMoY29tcGFjdGVkKTtcblx0Y29tcGFjdGVkID0gY29tcGFjdEludHJhbGluZVByb2dyZXNzKFxuXHRcdGNvbXBhY3RlZCxcblx0XHQneWFybjEgaW5zdGFsbCBpbnRyYWxpbmUgcHJvZ3Jlc3MnLFxuXHRcdGNvbXBhY3RZYXJuMVByb2dyZXNzRnJhbWVzLFxuXHQpO1xuXHRyZXR1cm4gb21pdE5vbkRpYWdub3N0aWNMaW5lcyhcblx0XHRjb21wYWN0ZWQsXG5cdFx0J25wbSBpbnN0YWxsIHByb2dyZXNzJyxcblx0XHRpc05wbUluc3RhbGxQcm9ncmVzc0xpbmUsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RZYXJuMVByb2dyZXNzRnJhbWVzKGxpbmU6IHN0cmluZyk6IENvbXBhY3RlZExpbmUge1xuXHRyZXR1cm4gY29tcGFjdFByb2dyZXNzUGF0dGVybnNVbmxlc3NEaWFnbm9zdGljKGxpbmUsIFtTdHJpbmcucmF3YFxcW1sjLV0rXFxdIFxcZCsvXFxkK2BdKTtcbn1cblxuZnVuY3Rpb24gaXNOcG1JbnN0YWxsUHJvZ3Jlc3NMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoaXNEaWFnbm9zdGljTGluZShsaW5lKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBsb3dlciA9IGFzY2lpTG93ZXJjYXNlKGxpbmUpO1xuXHRpZiAocmVnZXhUZXN0KFN0cmluZy5yYXdgXm5wbSAoPzpub3RpY2V8aHR0cHx0aW1pbmd8aW5mb3x2ZXJifHNpbGx5KVxcYmAsIGxvd2VyKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlmIChyZWdleFRlc3RXaXRoRmxhZ3MoXG5cdFx0U3RyaW5nLnJhd2BeKD86cmVpZnl8aWRlYWxUcmVlfGZldGNoTWV0YWRhdGF8ZXh0cmFjdHxyb2xsYmFja0ZhaWxlZE9wdGlvbmFsKVs6XFxzXWAsXG5cdFx0bGluZSxcblx0XHQnaScsXG5cdCkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRjb25zdCBjaGFycyA9IEFycmF5LmZyb20obGluZSk7XG5cdGNvbnN0IGZpcnN0ID0gY2hhcnNbMF07XG5cdGNvbnN0IHNlY29uZCA9IGNoYXJzWzFdO1xuXHRyZXR1cm4gZmlyc3QgIT09IHVuZGVmaW5lZCAmJiBmaXJzdCA+PSAnXFx1MjgwMScgJiYgZmlyc3QgPD0gJ1xcdTI4RkYnXG5cdFx0JiYgc2Vjb25kICE9PSB1bmRlZmluZWQgJiYgaXNXaGl0ZXNwYWNlQ2hhcihzZWNvbmQpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0WWFybkJlcnJ5T3V0cHV0KG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IGNvbXBhY3RlZCA9IGNvbXBhY3RZYXJuQmVycnlQcm9ncmVzcyhvdXRwdXQpO1xuXHRjb21wYWN0ZWQgPSBjb21wYWN0UmVwZWF0ZWROb2RlV2FybmluZ3MoY29tcGFjdGVkKTtcblx0Y29tcGFjdGVkID0gY29tcGFjdFBhY2thZ2VNYW5hZ2VyT3BlcmF0aW9ucyhjb21wYWN0ZWQpO1xuXHRyZXR1cm4gY29tcGFjdEludHJhbGluZVByb2dyZXNzKFxuXHRcdGNvbXBhY3RlZCxcblx0XHQneWFybjEgaW5zdGFsbCBpbnRyYWxpbmUgcHJvZ3Jlc3MnLFxuXHRcdGNvbXBhY3RZYXJuMVByb2dyZXNzRnJhbWVzLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0WWFybkJlcnJ5UHJvZ3Jlc3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIWhhc1lhcm5CZXJyeUNvbXBsZXRlZE91dHB1dChvdXRwdXQpKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXHRyZXR1cm4gb21pdE1hdGNoaW5nTGluZXMoXG5cdFx0b3V0cHV0LFxuXHRcdCd5YXJuIGJlcnJ5IHByb2dyZXNzJyxcblx0XHRpc1lhcm5CZXJyeVByb2dyZXNzTGluZSxcblx0XHQncHJvZ3Jlc3MnLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBoYXNZYXJuQmVycnlDb21wbGV0ZWRPdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIG91dHB1dC5pbmNsdWRlcygnXFx1MjdBNCBZTjAwMDA6Jylcblx0XHQmJiBvdXRwdXQuc3BsaXQoJ1xcbicpLnNvbWUobGluZSA9PlxuXHRcdFx0bGluZS5zdGFydHNXaXRoKCdcXHUyN0E0IFlOMDAwMDogXFx1MDBCNyBEb25lIGluICcpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1xcdTI3QTQgWU4wMDAwOiBcXHUwMEI3IERvbmUgd2l0aCB3YXJuaW5ncyBpbiAnKSk7XG59XG5cbmZ1bmN0aW9uIGlzWWFybkJlcnJ5UHJvZ3Jlc3NMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gbGluZS5zdGFydHNXaXRoKCdcXHUyN0E0IFlOMDAwMDonKVxuXHRcdCYmICFsaW5lLnN0YXJ0c1dpdGgoJ1xcdTI3QTQgWU4wMDAwOiBcXHUwMEI3IERvbmUgaW4gJylcblx0XHQmJiAhbGluZS5zdGFydHNXaXRoKCdcXHUyN0E0IFlOMDAwMDogXFx1MDBCNyBEb25lIHdpdGggd2FybmluZ3MgaW4gJyk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RNYWtlT3V0cHV0KG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IGNvbXBhY3RlZCA9IGNvbXBhY3RJbnRyYWxpbmVQcm9ncmVzcyhcblx0XHRvdXRwdXQsXG5cdFx0J25pbmphIGJ1aWxkIGludHJhbGluZSBwcm9ncmVzcycsXG5cdFx0Y29tcGFjdE5pbmphUHJvZ3Jlc3NGcmFtZXMsXG5cdCk7XG5cdGNvbXBhY3RlZCA9IGNvbXBhY3RNYWtlUHJvZ3Jlc3MoY29tcGFjdGVkKTtcblx0Y29tcGFjdGVkID0gY29tcGFjdEdvbGFuZ2NpTGludE91dHB1dChjb21wYWN0ZWQsIHRydWUpO1xuXHRyZXR1cm4gb21pdE5vbkRpYWdub3N0aWNMaW5lcyhcblx0XHRjb21wYWN0ZWQsXG5cdFx0J2dvIG1vZHVsZSBkb3dubG9hZCcsXG5cdFx0aXNHb01vZHVsZURvd25sb2FkQ2hhdHRlckxpbmUsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3ROaW5qYVByb2dyZXNzRnJhbWVzKGxpbmU6IHN0cmluZyk6IENvbXBhY3RlZExpbmUge1xuXHRyZXR1cm4gY29tcGFjdFByb2dyZXNzUGF0dGVybnNVbmxlc3NEaWFnbm9zdGljKFxuXHRcdGxpbmUsXG5cdFx0W1xuXHRcdFx0U3RyaW5nLnJhd2BcXFtcXHMqXFxkKy9cXGQrXFxdXFxzKyg/Oig/OkJ1aWxkaW5nfExpbmtpbmcpXFxzKyg/OkN8Q1hYfENVREF8QVNNfE9CSkN8T0JKQ1hYKVxccysoPzpvYmplY3R8ZXhlY3V0YWJsZXxzdGF0aWMgbGlicmFyeXxzaGFyZWQgbGlicmFyeXxtb2R1bGUpfEdlbmVyYXRpbmd8Q29weWluZ3xQcm9jZXNzaW5nfFJlLXJ1bm5pbmcgQ01ha2V8U2Nhbm5pbmcgZGVwZW5kZW5jaWVzIG9mIHRhcmdldHxBdXRvbWF0aWNcXHMrKD86TU9DfFVJQ3xSQ0MpKVxcYlteW10qYCxcblx0XHRdLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0TWFrZVByb2dyZXNzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgbGluZXMgPSBvdXRwdXQuc3BsaXQoJ1xcbicpO1xuXHRjb25zdCBjb21wYWN0ZWQ6IHN0cmluZ1tdID0gW107XG5cdGxldCBpID0gMDtcblx0d2hpbGUgKGkgPCBsaW5lcy5sZW5ndGgpIHtcblx0XHRjb25zdCBrZXkgPSBnZXRNYWtlUHJvZ3Jlc3NLZXkobGluZXNbaV0pO1xuXHRcdGlmIChrZXkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2gobGluZXNbaV0pO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0bGV0IGogPSBpICsgMTtcblx0XHR3aGlsZSAoaiA8IGxpbmVzLmxlbmd0aCAmJiBnZXRNYWtlUHJvZ3Jlc3NLZXkobGluZXNbal0pID09PSBrZXkpIHtcblx0XHRcdGogKz0gMTtcblx0XHR9XG5cblx0XHRjb25zdCBjb3VudCA9IGogLSBpO1xuXHRcdGlmIChjb3VudCA+PSA0KSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChsaW5lc1tpXSk7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChgW21ha2UgcHJvZ3Jlc3M6IG9taXR0ZWQgJHtjb3VudCAtIDF9IG1vcmUgJHtrZXl9IGxpbmUocyldYCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZvciAobGV0IGsgPSBpOyBrIDwgajsgaysrKSB7XG5cdFx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmVzW2tdKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aSA9IGo7XG5cdH1cblx0cmV0dXJuIGNvbXBhY3RlZC5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gZ2V0TWFrZVByb2dyZXNzS2V5KGxpbmU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmIChpc0RpYWdub3N0aWNMaW5lKGxpbmUpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB0cmltbWVkID0gbGluZS50cmltKCk7XG5cdGNvbnN0IGtpbmQgPSByZWdleENhcHR1cmVGaXJzdChTdHJpbmcucmF3YF5cXFsoQ29tcGlsaW5nfExpbmtpbmcpIC4rXFxdJGAsIHRyaW1tZWQpO1xuXHRpZiAoa2luZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGFzY2lpTG93ZXJjYXNlKGtpbmQpO1xuXHR9XG5cblx0Y29uc3QgcnVsZSA9IHNwbGl0TWFrZVJ1bGVMaW5lKHRyaW1tZWQpO1xuXHRpZiAocnVsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgW3J1bGVOYW1lLCB0YXJnZXRdID0gcnVsZTtcblx0XHRjb25zdCBzdWZmaXggPSByZWdleENhcHR1cmVGaXJzdChTdHJpbmcucmF3YChcXC5bQS1aYS16MC05Xy4tXSspJGAsIHRhcmdldCkgPz8gJyc7XG5cdFx0cmV0dXJuIGAke3J1bGVOYW1lfSAke2RpcmVjdG9yeUdsb2IodGFyZ2V0LCBzdWZmaXgpfWA7XG5cdH1cblx0Y29uc3QgcHJlcHJvY2Vzc2luZyA9IHJlZ2V4Q2FwdHVyZUZpcnN0KFN0cmluZy5yYXdgXlByZXByb2Nlc3NpbmdcXHMrKC4rXFwudnApJGAsIHRyaW1tZWQpO1xuXHRpZiAocHJlcHJvY2Vzc2luZyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGBQcmVwcm9jZXNzaW5nICR7ZGlyZWN0b3J5R2xvYihwcmVwcm9jZXNzaW5nLCAnLnZwJyl9YDtcblx0fVxuXHRpZiAocmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXig/OmdjY3xnXFwrXFwrfGNjfGNcXCtcXCt8Y2xhbmd8Y2xhbmdcXCtcXCt8W0EtWmEtejAtOV8tXSstZ2NjfFtBLVphLXowLTlfLV0rLWdcXCtcXCspXFxiLipcXHMtY1xcc2AsXG5cdFx0dHJpbW1lZCxcblx0KSkge1xuXHRcdHJldHVybiAnY29tcGlsZSBjb21tYW5kJztcblx0fVxuXHRpZiAocmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXm1ha2UoPzpcXFtcXGQrXFxdKT86ICg/OkVudGVyaW5nfExlYXZpbmcpIGRpcmVjdG9yeSBgLFxuXHRcdHRyaW1tZWQsXG5cdCkpIHtcblx0XHRyZXR1cm4gJ21ha2UgZGlyZWN0b3J5Jztcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBzcGxpdE1ha2VSdWxlTGluZShsaW5lOiBzdHJpbmcpOiBbc3RyaW5nLCBzdHJpbmddIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcnVsZXMgPSBbXG5cdFx0J0hPU1RDQycsICdNS0xJQicsICdNS0VYRScsICdNS0RMTCcsICdPQ0FNTEMnLCAnT0NBTUxPUFQnLCAnQ09RQycsICdDT1FERVAnLCAnQ09RQ0hLJyxcblx0XHQnQ09RRE9DJywgJ0xJTksnLCAnQ1hYJywgJ0NQUCcsICdDQycsICdBUicsICdBUycsICdMRCcsICdHRU4nLFxuXHRdO1xuXHRmb3IgKGNvbnN0IHJ1bGUgb2YgcnVsZXMpIHtcblx0XHRjb25zdCB0YXJnZXQgPSBzdHJpcFByZWZpeChsaW5lLCBgJHtydWxlfSBgKTtcblx0XHRpZiAodGFyZ2V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBbcnVsZSwgdGFyZ2V0XTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZGlyZWN0b3J5R2xvYih0YXJnZXQ6IHN0cmluZywgc3VmZml4OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBzbGFzaCA9IHRhcmdldC5sYXN0SW5kZXhPZignLycpO1xuXHRpZiAoc2xhc2ggIT09IC0xKSB7XG5cdFx0cmV0dXJuIGAke3RhcmdldC5zbGljZSgwLCBzbGFzaCl9Lyoke3N1ZmZpeH1gO1xuXHR9XG5cdHJldHVybiBgKiR7c3VmZml4fWA7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RBcHRPdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgY29tcGFjdGVkID0gY29tcGFjdEludHJhbGluZVByb2dyZXNzKFxuXHRcdG91dHB1dCxcblx0XHQnYXB0IGludHJhbGluZSBwcm9ncmVzcycsXG5cdFx0Y29tcGFjdEFwdFByb2dyZXNzRnJhbWVzLFxuXHQpO1xuXHRjb21wYWN0ZWQgPSBjb21wYWN0TmVlZHJlc3RhcnROb29wUHJvZ3Jlc3MoY29tcGFjdGVkKTtcblx0Y29tcGFjdGVkID0gY29tcGFjdFBhY2thZ2VNYW5hZ2VyT3BlcmF0aW9ucyhjb21wYWN0ZWQpO1xuXHRjb21wYWN0ZWQgPSBjb21wYWN0QXB0RHBrZ0xpZmVjeWNsZUJsb2Nrcyhjb21wYWN0ZWQpO1xuXHRyZXR1cm4gb21pdE5vbkRpYWdub3N0aWNMaW5lcyhjb21wYWN0ZWQsICdhcHQgcHJvZ3Jlc3MnLCBpc0FwdFByb2dyZXNzTGluZSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RBcHRQcm9ncmVzc0ZyYW1lcyhsaW5lOiBzdHJpbmcpOiBDb21wYWN0ZWRMaW5lIHtcblx0aWYgKGlzRGlhZ25vc3RpY0xpbmUobGluZSkpIHtcblx0XHRyZXR1cm4gdW5jaGFuZ2VkTGluZShsaW5lKTtcblx0fVxuXG5cdGNvbnN0IHJlc3VsdCA9IGNvbXBhY3RQcm9ncmVzc1BhdHRlcm5zKFxuXHRcdGxpbmUsXG5cdFx0W1xuXHRcdFx0U3RyaW5nLnJhd2BSZWFkaW5nIHBhY2thZ2UgbGlzdHNcXC5cXC5cXC4gXFxkKyVgLFxuXHRcdFx0U3RyaW5nLnJhd2BCdWlsZGluZyBkZXBlbmRlbmN5IHRyZWVcXC5cXC5cXC4gXFxkKyVgLFxuXHRcdFx0U3RyaW5nLnJhd2BSZWFkaW5nIHN0YXRlIGluZm9ybWF0aW9uXFwuXFwuXFwuIFxcZCslYCxcblx0XHRcdFN0cmluZy5yYXdgXFwoUmVhZGluZyBkYXRhYmFzZSBcXC5cXC5cXC4gXFxkKyVgLFxuXHRcdF0sXG5cdCk7XG5cdGNvbnN0IHNwaW5uZXJSZXN1bHQgPSByZW1vdmVQcm9ncmVzc01hdGNoZXMoXG5cdFx0cmVzdWx0Lm91dHB1dCxcblx0XHRTdHJpbmcucmF3YFxcZCslIFxcWyg/Oldvcmtpbmd8V2FpdGluZyBmb3IgaGVhZGVyc3xDb25uZWN0aW5nIHRvIFteXFxdXSt8Q29ubmVjdGVkIHRvIFteXFxdXSspXFxdXFxzKmAsXG5cdCk7XG5cdHJldHVybiB7XG5cdFx0b3V0cHV0OiBzcGlubmVyUmVzdWx0Lm91dHB1dCxcblx0XHRvbWl0dGVkRnJhbWVzOiByZXN1bHQub21pdHRlZEZyYW1lcyArIHNwaW5uZXJSZXN1bHQub21pdHRlZEZyYW1lcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlUHJvZ3Jlc3NNYXRjaGVzKGxpbmU6IHN0cmluZywgcGF0dGVybjogc3RyaW5nKTogQ29tcGFjdGVkTGluZSB7XG5cdGNvbnN0IG1hdGNoZXMgPSByZWdleEZpbmRBbGwocGF0dGVybiwgbGluZSk7XG5cdGlmIChtYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmNoYW5nZWRMaW5lKGxpbmUpO1xuXHR9XG5cdGxldCBvdXRwdXQgPSAnJztcblx0bGV0IGN1cnNvciA9IDA7XG5cdGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xuXHRcdG91dHB1dCArPSBsaW5lLnNsaWNlKGN1cnNvciwgbWF0Y2guc3RhcnQpO1xuXHRcdGN1cnNvciA9IG1hdGNoLmVuZDtcblx0fVxuXHRvdXRwdXQgKz0gbGluZS5zbGljZShjdXJzb3IpO1xuXHRyZXR1cm4geyBvdXRwdXQsIG9taXR0ZWRGcmFtZXM6IG1hdGNoZXMubGVuZ3RoIH07XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3ROZWVkcmVzdGFydE5vb3BQcm9ncmVzcyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghaGFzTmVlZHJlc3RhcnROb29wU3VtbWFyeShvdXRwdXQpIHx8IGhhc05lZWRyZXN0YXJ0QWN0aW9uYWJsZVN0YXRlKG91dHB1dCkpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cblx0bGV0IG9taXR0ZWRGcmFtZXMgPSAwO1xuXHRjb25zdCBjb21wYWN0ZWQgPSBvdXRwdXRcblx0XHQuc3BsaXQoJ1xcbicpXG5cdFx0Lm1hcChsaW5lID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXBhY3ROZWVkcmVzdGFydFByb2dyZXNzTGluZShsaW5lKTtcblx0XHRcdG9taXR0ZWRGcmFtZXMgKz0gcmVzdWx0Lm9taXR0ZWRGcmFtZXM7XG5cdFx0XHRyZXR1cm4gcmVzdWx0Lm91dHB1dDtcblx0XHR9KVxuXHRcdC5qb2luKCdcXG4nKTtcblxuXHRpZiAob21pdHRlZEZyYW1lcyA+IDApIHtcblx0XHRyZXR1cm4gYFtuZWVkcmVzdGFydCBwcm9ncmVzczogb21pdHRlZCAke29taXR0ZWRGcmFtZXN9IG5vLW9wIHNjYW5uaW5nIGZyYW1lKHMpXVxcbiR7Y29tcGFjdGVkfWA7XG5cdH1cblx0cmV0dXJuIG91dHB1dDtcbn1cblxuZnVuY3Rpb24gaGFzTmVlZHJlc3RhcnROb29wU3VtbWFyeShvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gb3V0cHV0LnNwbGl0KCdcXG4nKS5zb21lKGlzTmVlZHJlc3RhcnROb29wU3VtbWFyeUxpbmUpO1xufVxuXG5mdW5jdGlvbiBpc05lZWRyZXN0YXJ0Tm9vcFN1bW1hcnlMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRzd2l0Y2ggKGxpbmUudHJpbSgpKSB7XG5cdFx0Y2FzZSAnUnVubmluZyBrZXJuZWwgc2VlbXMgdG8gYmUgdXAtdG8tZGF0ZS4nOlxuXHRcdGNhc2UgJ1RoZSBwcm9jZXNzb3IgbWljcm9jb2RlIHNlZW1zIHRvIGJlIHVwLXRvLWRhdGUuJzpcblx0XHRjYXNlICdObyBzZXJ2aWNlcyBuZWVkIHRvIGJlIHJlc3RhcnRlZC4nOlxuXHRcdGNhc2UgJ05vIGNvbnRhaW5lcnMgbmVlZCB0byBiZSByZXN0YXJ0ZWQuJzpcblx0XHRjYXNlICdObyB1c2VyIHNlc3Npb25zIGFyZSBydW5uaW5nIG91dGRhdGVkIGJpbmFyaWVzLic6XG5cdFx0Y2FzZSAnTm8gVk0gZ3Vlc3RzIGFyZSBydW5uaW5nIG91dGRhdGVkIGh5cGVydmlzb3IgKHFlbXUpIGJpbmFyaWVzIG9uIHRoaXMgaG9zdC4nOlxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5mdW5jdGlvbiBoYXNOZWVkcmVzdGFydEFjdGlvbmFibGVTdGF0ZShvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gb3V0cHV0LnNwbGl0KCdcXG4nKS5zb21lKGxpbmUgPT4ge1xuXHRcdGNvbnN0IHRyaW1tZWQgPSBsaW5lLnRyaW0oKTtcblx0XHRyZXR1cm4gIWlzTmVlZHJlc3RhcnROb29wU3VtbWFyeUxpbmUodHJpbW1lZClcblx0XHRcdCYmIHJlZ2V4VGVzdFdpdGhGbGFncyhcblx0XHRcdFx0U3RyaW5nLnJhd2BcXGIoPzpwZW5kaW5nfHJlYm9vdHxyZXF1aXJlZHxyZXN0YXJ0LW5lZWRlZHxORUVEUkVTVEFSVC18T3V0ZGF0ZWQgTGlicmFyaWVzfFNlcnZpY2VzIHRvIGJlIHJlc3RhcnRlZHxDb250YWluZXJzIHRvIGJlIHJlc3RhcnRlZHxVc2VyIHNlc3Npb25zIHJ1bm5pbmcgb3V0ZGF0ZWR8Vk0gZ3Vlc3RzIGFyZSBydW5uaW5nIG91dGRhdGVkfG5lZWQgcmVzdGFydGluZylcXGJgLFxuXHRcdFx0XHR0cmltbWVkLFxuXHRcdFx0XHQnaScsXG5cdFx0XHQpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdE5lZWRyZXN0YXJ0UHJvZ3Jlc3NMaW5lKGxpbmU6IHN0cmluZyk6IENvbXBhY3RlZExpbmUge1xuXHRpZiAoIWxpbmUuaW5jbHVkZXMoJ1NjYW5uaW5nICcpKSB7XG5cdFx0cmV0dXJuIHVuY2hhbmdlZExpbmUobGluZSk7XG5cdH1cblx0Y29uc3QgcmVzdWx0ID0gcmVtb3ZlUHJvZ3Jlc3NNYXRjaGVzKFxuXHRcdGxpbmUsXG5cdFx0U3RyaW5nLnJhd2BTY2FubmluZyAoPzpwcm9jZXNzZXN8cHJvY2Vzc29yIG1pY3JvY29kZXxsaW51eCBpbWFnZXMpXFwuXFwuXFwuIFxcW1teXFxdXFxuXSpcXF1cXHMqYCxcblx0KTtcblx0cmV0dXJuIHtcblx0XHRvdXRwdXQ6IHJlc3VsdC5vdXRwdXQudHJpbSgpLmxlbmd0aCA9PT0gMCA/ICdbbmVlZHJlc3RhcnQgcHJvZ3Jlc3NdJyA6IHJlc3VsdC5vdXRwdXQsXG5cdFx0b21pdHRlZEZyYW1lczogcmVzdWx0Lm9taXR0ZWRGcmFtZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RBcHREcGtnTGlmZWN5Y2xlQmxvY2tzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGNvbGxhcHNlQ29udGlndW91c1J1bnMob3V0cHV0LCBpc0FwdERwa2dMaWZlY3ljbGVMaW5lLCA0LCBibG9jayA9PiB7XG5cdFx0Y29uc3QgcGFja2FnZXM6IFtzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZF1bXSA9IFtdO1xuXHRcdGxldCB0cmlnZ2VyQ291bnQgPSAwO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBibG9jaykge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VBcHRQYWNrYWdlTGlmZWN5Y2xlTGluZShsaW5lKTtcblx0XHRcdGlmIChwYXJzZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBbbmFtZSwgdmVyc2lvbl0gPSBwYXJzZWQ7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gcGFja2FnZXMuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlWzBdID09PSBuYW1lKTtcblx0XHRcdFx0aWYgKGV4aXN0aW5nICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRleGlzdGluZ1sxXSA9IHZlcnNpb247XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cGFja2FnZXMucHVzaChbbmFtZSwgdmVyc2lvbl0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmUuc3RhcnRzV2l0aCgnUHJvY2Vzc2luZyB0cmlnZ2VycyBmb3IgJykpIHtcblx0XHRcdFx0dHJpZ2dlckNvdW50ICs9IDE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHBhY2thZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcGFja2FnZVN1bW1hcnkgPSBzdW1tYXJpemVQYWNrYWdlcyhwYWNrYWdlcyk7XG5cdFx0Y29uc3QgdHJpZ2dlclN1bW1hcnkgPSB0cmlnZ2VyQ291bnQgPiAwID8gYDsgJHt0cmlnZ2VyQ291bnR9IHRyaWdnZXIgbGluZShzKWAgOiAnJztcblx0XHRyZXR1cm4gYFthcHQgcGFja2FnZXM6IGluc3RhbGxlZCAke3BhY2thZ2VzLmxlbmd0aH0gcGFja2FnZShzKTogJHtwYWNrYWdlU3VtbWFyeX07IG9taXR0ZWQgJHtibG9jay5sZW5ndGh9IGRwa2cgbGlmZWN5Y2xlIGxpbmUocykke3RyaWdnZXJTdW1tYXJ5fV1gO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gaXNBcHREcGtnTGlmZWN5Y2xlTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuICFpc0RpYWdub3N0aWNMaW5lKGxpbmUpXG5cdFx0JiYgKGxpbmUuc3RhcnRzV2l0aCgnU2VsZWN0aW5nIHByZXZpb3VzbHkgdW5zZWxlY3RlZCBwYWNrYWdlICcpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1ByZXBhcmluZyB0byB1bnBhY2sgJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnVW5wYWNraW5nICcpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1NldHRpbmcgdXAgJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnUHJvY2Vzc2luZyB0cmlnZ2VycyBmb3IgJylcblx0XHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5ydW5uaW5nIHB5dGhvbiAoPzpwcmUtfHBvc3QtKT9ydHVwZGF0ZSBob29rcyBmb3IgYCwgbGluZSlcblx0XHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFx0U3RyaW5nLnJhd2BeXFwoUmVhZGluZyBkYXRhYmFzZSBcXC5cXC5cXC4gXFxkKyBmaWxlcyBhbmQgZGlyZWN0b3JpZXMgY3VycmVudGx5IGluc3RhbGxlZFxcLlxcKSRgLFxuXHRcdFx0XHRsaW5lLFxuXHRcdFx0KSk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlQXB0UGFja2FnZUxpZmVjeWNsZUxpbmUobGluZTogc3RyaW5nKTogW3N0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkXSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHNlbGVjdGluZyA9IHN0cmlwUHJlZml4KGxpbmUsICdTZWxlY3RpbmcgcHJldmlvdXNseSB1bnNlbGVjdGVkIHBhY2thZ2UgJyk7XG5cdGlmIChzZWxlY3RpbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IG5hbWUgPSBzdHJpcFN1ZmZpeChzZWxlY3RpbmcsICcuJyk7XG5cdFx0aWYgKG5hbWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIFtuYW1lLCB1bmRlZmluZWRdO1xuXHRcdH1cblx0fVxuXHRjb25zdCB1bnBhY2tpbmdPclNldHRpbmcgPSBzdHJpcFByZWZpeChsaW5lLCAnVW5wYWNraW5nICcpID8/IHN0cmlwUHJlZml4KGxpbmUsICdTZXR0aW5nIHVwICcpO1xuXHRpZiAodW5wYWNraW5nT3JTZXR0aW5nICE9PSB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBuYW1lU3BsaXQgPSBzcGxpdE9uY2UodW5wYWNraW5nT3JTZXR0aW5nLCAnICgnKTtcblx0XHRpZiAobmFtZVNwbGl0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHZlcnNpb25TcGxpdCA9IHNwbGl0T25jZShuYW1lU3BsaXRbMV0sICcpJyk7XG5cdFx0XHRpZiAodmVyc2lvblNwbGl0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIFtuYW1lU3BsaXRbMF0sIHZlcnNpb25TcGxpdFswXV07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGNvbnN0IHByZXBhcmluZyA9IHN0cmlwUHJlZml4KGxpbmUsICdQcmVwYXJpbmcgdG8gdW5wYWNrICcpO1xuXHRpZiAocHJlcGFyaW5nICE9PSB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBkZWJTcGxpdCA9IHNwbGl0T25jZShwcmVwYXJpbmcsICcgJyk7XG5cdFx0aWYgKGRlYlNwbGl0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IGRlYlNlZ21lbnRzID0gZGViU3BsaXRbMF0uc3BsaXQoJy8nKTtcblx0XHRcdGNvbnN0IGZpbGVOYW1lID0gZGViU2VnbWVudHNbZGViU2VnbWVudHMubGVuZ3RoIC0gMV07XG5cdFx0XHRjb25zdCBuYW1lU3BsaXQgPSBzcGxpdE9uY2UoZmlsZU5hbWUsICdfJyk7XG5cdFx0XHRpZiAobmFtZVNwbGl0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgdmVyc2lvblNwbGl0ID0gcnNwbGl0T25jZShuYW1lU3BsaXRbMV0sICdfJyk7XG5cdFx0XHRcdGlmICh2ZXJzaW9uU3BsaXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiBbbmFtZVNwbGl0WzBdLCB2ZXJzaW9uU3BsaXRbMF1dO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHN1bW1hcml6ZVBhY2thZ2VzKHBhY2thZ2VzOiByZWFkb25seSBbc3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWRdW10pOiBzdHJpbmcge1xuXHRyZXR1cm4gc3VtbWFyaXplV2l0aE1vcmUoXG5cdFx0cGFja2FnZXMubWFwKChbbmFtZSwgdmVyc2lvbl0pID0+IHZlcnNpb24gIT09IHVuZGVmaW5lZCA/IGAke25hbWV9ICgke3ZlcnNpb259KWAgOiBuYW1lKSxcblx0XHQxOCxcblx0KTtcbn1cblxuZnVuY3Rpb24gaXNBcHRQcm9ncmVzc0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAhaXNEaWFnbm9zdGljTGluZShsaW5lKVxuXHRcdCYmIChyZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxkKyUgXFxbYCwgbGluZSlcblx0XHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YFxcYig/OkhpdHxHZXR8SWduKTpcXGQrIGAsIGxpbmUpXG5cdFx0XHR8fCBsaW5lLmluY2x1ZGVzKCdSZWFkaW5nIHBhY2thZ2UgbGlzdHMuLi4nKVxuXHRcdFx0fHwgbGluZS5pbmNsdWRlcygnQnVpbGRpbmcgZGVwZW5kZW5jeSB0cmVlLi4uJylcblx0XHRcdHx8IGxpbmUuaW5jbHVkZXMoJ1JlYWRpbmcgc3RhdGUgaW5mb3JtYXRpb24uLi4nKVxuXHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdTZWxlY3RpbmcgcHJldmlvdXNseSB1bnNlbGVjdGVkIHBhY2thZ2UgJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnUHJlcGFyaW5nIHRvIHVucGFjayAnKVxuXHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdVbnBhY2tpbmcgJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnU2V0dGluZyB1cCAnKVxuXHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdQcm9jZXNzaW5nIHRyaWdnZXJzIGZvciAnKVxuXHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdGZXRjaGVkICcpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ05lZWQgdG8gZ2V0ICcpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ0FmdGVyIHRoaXMgb3BlcmF0aW9uICcpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ2RlYmNvbmY6ICcpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJyhSZWFkaW5nIGRhdGFiYXNlICcpKTtcbn1cblxuZnVuY3Rpb24gaXNQeXRob25FY29zeXN0ZW1Ob2lzZUxpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBsaW5lLnN0YXJ0c1dpdGgoYFdBUk5JTkc6IFJ1bm5pbmcgcGlwIGFzIHRoZSAncm9vdCcgdXNlciBjYW4gcmVzdWx0IGluIGJyb2tlbiBwZXJtaXNzaW9uc2ApXG5cdFx0fHwgbGluZS5zdGFydHNXaXRoKCdJdCBpcyByZWNvbW1lbmRlZCB0byB1c2UgYSB2aXJ0dWFsIGVudmlyb25tZW50IGluc3RlYWQ6ICcpXG5cdFx0fHwgbGluZS5pbmNsdWRlcygnRGVwcmVjYXRpb25XYXJuaW5nOiBUaGUgZGlzdHV0aWxzIHBhY2thZ2UgaXMgZGVwcmVjYXRlZCcpXG5cdFx0fHwgbGluZS5pbmNsdWRlcygnU2V0dXB0b29sc0RlcHJlY2F0aW9uV2FybmluZzonKVxuXHRcdHx8IGxpbmUuaW5jbHVkZXMoJ2BudW1weS5kaXN0dXRpbHNgIGlzIGRlcHJlY2F0ZWQgc2luY2UgTnVtUHkgMS4yMy4wJylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1BhcnRpYWwgaW1wb3J0IG9mIHNrbGVhcm4gZHVyaW5nIHRoZSBidWlsZCBwcm9jZXNzLicpXG5cdFx0fHwgbGluZS5zdGFydHNXaXRoKCdNYXRwbG90bGliIGlzIG5vdCBidWlsdCB3aXRoIHRoZSBjb3JyZWN0IEZyZWVUeXBlIHZlcnNpb24nKTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdFNldHVwdG9vbHNEZXByZWNhdGlvbkJsb2NrcyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghb3V0cHV0LmluY2x1ZGVzKCdTZXR1cHRvb2xzRGVwcmVjYXRpb25XYXJuaW5nJylcblx0XHQmJiAhb3V0cHV0LmluY2x1ZGVzKCdFYXN5SW5zdGFsbERlcHJlY2F0aW9uV2FybmluZycpXG5cdFx0JiYgIW91dHB1dC5pbmNsdWRlcygnRGVwcmVjYXRpb25XYXJuaW5nOicpXG5cdCkge1xuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHRjb25zdCBsaW5lcyA9IG91dHB1dC5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IGNvbXBhY3RlZDogc3RyaW5nW10gPSBbXTtcblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCkge1xuXHRcdGlmICghaXNTZXR1cHRvb2xzRGVwcmVjYXRpb25IZWFkZXIobGluZXNbaV0pKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChsaW5lc1tpXSk7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydCA9IGk7XG5cdFx0aSArPSAxO1xuXHRcdGxldCBzZWVuU2VudGluZWwgPSBmYWxzZTtcblx0XHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCAmJiBpIC0gc3RhcnQgPCAzMCkge1xuXHRcdFx0Y29uc3QgbGluZSA9IGxpbmVzW2ldO1xuXHRcdFx0aWYgKGlzU3RyaWN0Q29tcGlsZXJEaWFnbm9zdGljTGluZShsaW5lKSB8fCBpc1Vuc2FmZUNvbXBhY3Rpb25Db250ZXh0TGluZShsaW5lKSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmIChyZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxzKiEhXFxzKiRgLCBsaW5lKSkge1xuXHRcdFx0XHRpZiAoc2VlblNlbnRpbmVsKSB7XG5cdFx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlZW5TZW50aW5lbCA9IHRydWU7XG5cdFx0XHRcdGkgKz0gMTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAobGluZS50cmltKCkubGVuZ3RoID09PSAwXG5cdFx0XHRcdCYmIGkgKyAxIDwgbGluZXMubGVuZ3RoXG5cdFx0XHRcdCYmIHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXFNgLCBsaW5lc1tpICsgMV0pXG5cdFx0XHRcdCYmICFpc1NldHVwdG9vbHNCYW5uZXJMaW5lKGxpbmVzW2kgKyAxXSlcblx0XHRcdCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmICghaXNTZXR1cHRvb2xzQmFubmVyTGluZShsaW5lKSAmJiByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxTYCwgbGluZSkpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpICs9IDE7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmxvY2sgPSBsaW5lcy5zbGljZShzdGFydCwgaSk7XG5cdFx0aWYgKGJsb2NrLmxlbmd0aCA+PSAzXG5cdFx0XHQmJiAhYmxvY2suc2xpY2UoMSkuc29tZShsaW5lID0+IGlzVW5zYWZlQ29tcGFjdGlvbkNvbnRleHRMaW5lKGxpbmUpKVxuXHRcdCkge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2goYFtzZXR1cHRvb2xzIGRlcHJlY2F0aW9uOiAke3NldHVwdG9vbHNXYXJuaW5nTmFtZShibG9ja1swXSl9OyBvbWl0dGVkICR7YmxvY2subGVuZ3RoIC0gMX0gYmFubmVyIGxpbmUocyldYCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZvciAoY29uc3QgbGluZSBvZiBibG9jaykge1xuXHRcdFx0XHRjb21wYWN0ZWQucHVzaChsaW5lKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIGNvbXBhY3RlZC5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gaXNTZXR1cHRvb2xzRGVwcmVjYXRpb25IZWFkZXIobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBsaW5lLmluY2x1ZGVzKCdTZXR1cHRvb2xzRGVwcmVjYXRpb25XYXJuaW5nOicpXG5cdFx0fHwgbGluZS5pbmNsdWRlcygnRWFzeUluc3RhbGxEZXByZWNhdGlvbldhcm5pbmc6Jylcblx0XHR8fCBsaW5lLmluY2x1ZGVzKCdEZXByZWNhdGlvbldhcm5pbmc6Jyk7XG59XG5cbmZ1bmN0aW9uIHNldHVwdG9vbHNXYXJuaW5nTmFtZShsaW5lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gcmVnZXhDYXB0dXJlRmlyc3QoXG5cdFx0U3RyaW5nLnJhd2AoW0EtWmEtel9dW0EtWmEtejAtOV9dKkRlcHJlY2F0aW9uV2FybmluZ3xEZXByZWNhdGlvbldhcm5pbmcpOmAsXG5cdFx0bGluZSxcblx0KSA/PyAnZGVwcmVjYXRpb24gd2FybmluZyc7XG59XG5cbmZ1bmN0aW9uIGlzU2V0dXB0b29sc0Jhbm5lckxpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBsaW5lLnRyaW0oKS5sZW5ndGggPT09IDBcblx0XHR8fCBzdGFydHNXaXRoV2hpdGVzcGFjZShsaW5lKVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXHMqWy0hKl17Myx9XFxzKiRgLCBsaW5lKVxuXHRcdHx8IGlzU2V0dXB0b29sc0RlcHJlY2F0aW9uSGVhZGVyKGxpbmUpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0Q3l0aG9uUGVyZm9ybWFuY2VIaW50cyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghb3V0cHV0LmluY2x1ZGVzKCdwZXJmb3JtYW5jZSBoaW50OicpKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdGNvbnN0IGxpbmVzID0gb3V0cHV0LnNwbGl0KCdcXG4nKTtcblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgb21pdHRlZCA9IDA7XG5cdGxldCBrZXB0Rmlyc3RJblJ1biA9IGZhbHNlO1xuXHRjb25zdCBmbHVzaCA9ICgpID0+IHtcblx0XHRpZiAob21pdHRlZCA+IDApIHtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGBbY3l0aG9uIHBlcmZvcm1hbmNlIGhpbnRzOiBvbWl0dGVkICR7b21pdHRlZH0gaGludCBibG9jayhzKV1gKTtcblx0XHRcdG9taXR0ZWQgPSAwO1xuXHRcdH1cblx0XHRrZXB0Rmlyc3RJblJ1biA9IGZhbHNlO1xuXHR9O1xuXG5cdGxldCBpID0gMDtcblx0d2hpbGUgKGkgPCBsaW5lcy5sZW5ndGgpIHtcblx0XHRpZiAoIWlzQ3l0aG9uUGVyZm9ybWFuY2VIaW50SGVhZGVyKGxpbmVzW2ldKSkge1xuXHRcdFx0Zmx1c2goKTtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmVzW2ldKTtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0ID0gaTtcblx0XHRpICs9IDE7XG5cdFx0bGV0IGhhc1Vuc2FmZUNvbnRleHQgPSBmYWxzZTtcblx0XHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCAmJiBpIC0gc3RhcnQgPCAxMikge1xuXHRcdFx0Y29uc3QgbGluZSA9IGxpbmVzW2ldO1xuXHRcdFx0aWYgKGlzQ3l0aG9uUGVyZm9ybWFuY2VIaW50SGVhZGVyKGxpbmUpXG5cdFx0XHRcdHx8IGlzU3RyaWN0Q29tcGlsZXJEaWFnbm9zdGljTGluZShsaW5lKVxuXHRcdFx0XHR8fCBpc1Vuc2FmZUNvbXBhY3Rpb25Db250ZXh0TGluZShsaW5lKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGhhc1Vuc2FmZUNvbnRleHQgPSBpc1Vuc2FmZUNvbXBhY3Rpb25Db250ZXh0TGluZShsaW5lKTtcblx0XHRcdFx0aWYgKGhhc1Vuc2FmZUNvbnRleHQpIHtcblx0XHRcdFx0XHRpICs9IDE7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAobGluZS50cmltKCkubGVuZ3RoID09PSAwXG5cdFx0XHRcdCYmIGkgKyAxIDwgbGluZXMubGVuZ3RoXG5cdFx0XHRcdCYmICFzdGFydHNXaXRoV2hpdGVzcGFjZShsaW5lc1tpICsgMV0pXG5cdFx0XHQpIHtcblx0XHRcdFx0aSArPSAxO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmICghc3RhcnRzV2l0aFdoaXRlc3BhY2UobGluZSkgJiYgIWxpbmUuc3RhcnRzV2l0aCgnUG9zc2libGUgc29sdXRpb25zOicpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aSArPSAxO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJsb2NrID0gbGluZXMuc2xpY2Uoc3RhcnQsIGkpO1xuXHRcdGlmIChoYXNVbnNhZmVDb250ZXh0KSB7XG5cdFx0XHRmbHVzaCgpO1xuXHRcdFx0Zm9yIChjb25zdCBsaW5lIG9mIGJsb2NrKSB7XG5cdFx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIWtlcHRGaXJzdEluUnVuKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgYmxvY2spIHtcblx0XHRcdFx0Y29tcGFjdGVkLnB1c2gobGluZSk7XG5cdFx0XHR9XG5cdFx0XHRrZXB0Rmlyc3RJblJ1biA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG9taXR0ZWQgKz0gMTtcblx0XHR9XG5cdH1cblx0Zmx1c2goKTtcblx0cmV0dXJuIGNvbXBhY3RlZC5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gaXNDeXRob25QZXJmb3JtYW5jZUhpbnRIZWFkZXIobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxTK1xcLnB5eDpcXGQrOlxcZCs6XFxzK3BlcmZvcm1hbmNlIGhpbnQ6IGAsIGxpbmUpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0Q29tcGlsZXJXYXJuaW5nUnVucyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgKD86XnxcXG4pKD86XFxTKzpcXGQrKD86OlxcZCspPzpcXHMqKD86d2FybmluZ3woPzpmYXRhbFxccyspP2Vycm9yKTp8XFxTKzpcXHMqaW50ZXJuYWwgY29tcGlsZXIgZXJyb3I6fGVycm9yOiBjb21tYW5kIC4rIGZhaWxlZFxcYilgLFxuXHRcdG91dHB1dCxcblx0KSkge1xuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHRjb25zdCBpbnB1dEVycm9yQ291bnQgPSBjb3VudENvbXBpbGVyRXJyb3JMaW5lcyhvdXRwdXQpO1xuXHRjb25zdCBsaW5lcyA9IG91dHB1dC5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IGNvbXBhY3RlZDogc3RyaW5nW10gPSBbXTtcblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCkge1xuXHRcdGNvbnN0IHJ1biA9IGNvbGxlY3RDb21waWxlckRpYWdub3N0aWNSdW4obGluZXMsIGkpO1xuXHRcdGlmIChydW4gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2gobGluZXNbaV0pO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChydW4uYmxvY2tzLmxlbmd0aCA8IDQpIHtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmVzW2ldKTtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAocnVuLmhhc0Vycm9yKSB7XG5cdFx0XHRmb3IgKGxldCBrID0gaTsgayA8IHJ1bi5lbmQ7IGsrKykge1xuXHRcdFx0XHRjb21wYWN0ZWQucHVzaChsaW5lc1trXSk7XG5cdFx0XHR9XG5cdFx0XHRpID0gcnVuLmVuZDtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgYmxvY2sgb2YgcnVuLmJsb2Nrcy5zbGljZSgwLCAyKSkge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2goLi4uYmxvY2subGluZXMpO1xuXHRcdH1cblx0XHRjb21wYWN0ZWQucHVzaChgW2NvbXBpbGVyIHdhcm5pbmdzOiBvbWl0dGVkICR7cnVuLmJsb2Nrcy5sZW5ndGggLSAzfSB3YXJuaW5nIGJsb2NrKHMpXWApO1xuXHRcdGNvbXBhY3RlZC5wdXNoKC4uLnJ1bi5ibG9ja3NbcnVuLmJsb2Nrcy5sZW5ndGggLSAxXS5saW5lcyk7XG5cdFx0aSA9IHJ1bi5lbmQ7XG5cdH1cblxuXHRjb25zdCBjb21wYWN0ZWRPdXRwdXQgPSBjb21wYWN0ZWQuam9pbignXFxuJyk7XG5cdGlmIChjb3VudENvbXBpbGVyRXJyb3JMaW5lcyhjb21wYWN0ZWRPdXRwdXQpID09PSBpbnB1dEVycm9yQ291bnQpIHtcblx0XHRyZXR1cm4gY29tcGFjdGVkT3V0cHV0O1xuXHR9XG5cdHJldHVybiBvdXRwdXQ7XG59XG5cbmludGVyZmFjZSBDb21waWxlckRpYWdub3N0aWNCbG9jayB7XG5cdGxpbmVzOiBzdHJpbmdbXTtcblx0a2luZDogJ3dhcm5pbmcnIHwgJ2Vycm9yJztcbn1cblxuaW50ZXJmYWNlIENvbXBpbGVyRGlhZ25vc3RpY1J1biB7XG5cdGJsb2NrczogQ29tcGlsZXJEaWFnbm9zdGljQmxvY2tbXTtcblx0ZW5kOiBudW1iZXI7XG5cdGhhc0Vycm9yOiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBjb2xsZWN0Q29tcGlsZXJEaWFnbm9zdGljUnVuKGxpbmVzOiByZWFkb25seSBzdHJpbmdbXSwgc3RhcnQ6IG51bWJlcik6IENvbXBpbGVyRGlhZ25vc3RpY1J1biB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGJsb2NrczogQ29tcGlsZXJEaWFnbm9zdGljQmxvY2tbXSA9IFtdO1xuXHRsZXQgaSA9IHN0YXJ0O1xuXHRsZXQgaGFzRXJyb3IgPSBmYWxzZTtcblx0d2hpbGUgKGkgPCBsaW5lcy5sZW5ndGgpIHtcblx0XHRjb25zdCBraW5kID0gY29tcGlsZXJEaWFnbm9zdGljS2luZChsaW5lc1tpXSk7XG5cdFx0aWYgKGtpbmQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmxvY2tTdGFydCA9IGk7XG5cdFx0aSArPSAxO1xuXHRcdGxldCBjb250ZXh0TGluZXMgPSAwO1xuXHRcdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoXG5cdFx0XHQmJiBjb250ZXh0TGluZXMgPCA0XG5cdFx0XHQmJiBjb21waWxlckRpYWdub3N0aWNLaW5kKGxpbmVzW2ldKSA9PT0gdW5kZWZpbmVkXG5cdFx0XHQmJiBsaW5lc1tpXS50cmltKCkubGVuZ3RoICE9PSAwXG5cdFx0KSB7XG5cdFx0XHRpZiAoaXNEaWFnbm9zdGljTGluZShsaW5lc1tpXSkgfHwgaXNDb21waWxlckNvbnRleHRFcnJvckxpbmUobGluZXNbaV0pKSB7XG5cdFx0XHRcdGhhc0Vycm9yID0gdHJ1ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250ZXh0TGluZXMgKz0gMTtcblx0XHR9XG5cdFx0YmxvY2tzLnB1c2goeyBsaW5lczogbGluZXMuc2xpY2UoYmxvY2tTdGFydCwgaSksIGtpbmQgfSk7XG5cdFx0aGFzRXJyb3IgPSBoYXNFcnJvciB8fCBraW5kID09PSAnZXJyb3InO1xuXHRcdGlmIChpIDwgbGluZXMubGVuZ3RoICYmIGxpbmVzW2ldLnRyaW0oKS5sZW5ndGggPT09IDApIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXHRpZiAoYmxvY2tzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHsgYmxvY2tzLCBlbmQ6IGksIGhhc0Vycm9yIH07XG59XG5cbmZ1bmN0aW9uIGNvbXBpbGVyRGlhZ25vc3RpY0tpbmQobGluZTogc3RyaW5nKTogJ3dhcm5pbmcnIHwgJ2Vycm9yJyB8IHVuZGVmaW5lZCB7XG5cdGlmIChpc0NvbXBpbGVyRXJyb3JMaW5lKGxpbmUpKSB7XG5cdFx0cmV0dXJuICdlcnJvcic7XG5cdH1cblx0aWYgKHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXFMrOlxcZCsoPzo6XFxkKyk/Olxccyp3YXJuaW5nOlxcc2AsIGxpbmUpKSB7XG5cdFx0cmV0dXJuICd3YXJuaW5nJztcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBpc1N0cmljdENvbXBpbGVyRGlhZ25vc3RpY0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBjb21waWxlckRpYWdub3N0aWNLaW5kKGxpbmUpICE9PSB1bmRlZmluZWRcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxTKzpcXGQrKD86OlxcZCspPzpcXHMqbm90ZTpcXHNgLCBsaW5lKTtcbn1cblxuZnVuY3Rpb24gaXNDb21waWxlckVycm9yTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXFMrOlxcZCsoPzo6XFxkKyk/OlxccyooPzpmYXRhbFxccyspP2Vycm9yOlxcc2AsIGxpbmUpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxcUys6XFxzKmludGVybmFsIGNvbXBpbGVyIGVycm9yOlxcc2AsIGxpbmUpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXmVycm9yOiBjb21tYW5kIC4rIGZhaWxlZFxcYmAsIGxpbmUpO1xufVxuXG5mdW5jdGlvbiBpc0NvbXBpbGVyQ29udGV4dEVycm9yTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdFdpdGhGbGFncyhTdHJpbmcucmF3YF4oPzpmYXRhbCBlcnJvcnxlcnJvcik6XFxzYCwgbGluZSwgJ2knKVxuXHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnVHJhY2ViYWNrIChtb3N0IHJlY2VudCBjYWxsIGxhc3QpOicpO1xufVxuXG5mdW5jdGlvbiBpc1Vuc2FmZUNvbXBhY3Rpb25Db250ZXh0TGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzQ29tcGlsZXJDb250ZXh0RXJyb3JMaW5lKGxpbmUudHJpbVN0YXJ0KCkpO1xufVxuXG5mdW5jdGlvbiBjb3VudENvbXBpbGVyRXJyb3JMaW5lcyhvdXRwdXQ6IHN0cmluZyk6IG51bWJlciB7XG5cdHJldHVybiBvdXRwdXQuc3BsaXQoJ1xcbicpLmZpbHRlcihsaW5lID0+XG5cdFx0aXNDb21waWxlckVycm9yTGluZShsaW5lKSB8fCBpc1Vuc2FmZUNvbXBhY3Rpb25Db250ZXh0TGluZShsaW5lKSkubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiBpc1BpcEluc3RhbGxQcm9ncmVzc0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBpc1BpcFJvb3RVc2VyV2FybmluZyhsaW5lKVxuXHRcdHx8ICghaXNEaWFnbm9zdGljTGluZShsaW5lKVxuXHRcdFx0JiYgKGxpbmUuc3RhcnRzV2l0aCgnTG9va2luZyBpbiBpbmRleGVzOiAnKVxuXHRcdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ0xvb2tpbmcgaW4gbGlua3M6ICcpXG5cdFx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnQ29sbGVjdGluZyAnKVxuXHRcdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1JlcXVpcmVtZW50IGFscmVhZHkgc2F0aXNmaWVkOiAnKVxuXHRcdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ0Rpc2NhcmRpbmcgaHR0cDovLycpXG5cdFx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnRGlzY2FyZGluZyBodHRwczovLycpXG5cdFx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnRG93bmxvYWRpbmcgaHR0cDovLycpXG5cdFx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnRG93bmxvYWRpbmcgaHR0cHM6Ly8nKVxuXHRcdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJyAgRG93bmxvYWRpbmcgJylcblx0XHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCcgIFVzaW5nIGNhY2hlZCAnKVxuXHRcdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJyAgR2V0dGluZyByZXF1aXJlbWVudHMgdG8gYnVpbGQgd2hlZWwgJylcblx0XHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCcgIEluc3RhbGxpbmcgYnVpbGQgZGVwZW5kZW5jaWVzICcpXG5cdFx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnICBQcmVwYXJpbmcgbWV0YWRhdGEgJylcblx0XHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdCdWlsZGluZyB3aGVlbHMgZm9yIGNvbGxlY3RlZCBwYWNrYWdlczogJylcblx0XHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCcgIEJ1aWxkaW5nIHdoZWVsIGZvciAnKVxuXHRcdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJyAgQ3JlYXRlZCB3aGVlbCBmb3IgJylcblx0XHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCcgIFN0b3JlZCBpbiBkaXJlY3Rvcnk6ICcpXG5cdFx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnSW5zdGFsbGluZyBjb2xsZWN0ZWQgcGFja2FnZXM6ICcpXG5cdFx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnU3VjY2Vzc2Z1bGx5IGluc3RhbGxlZCAnKVxuXHRcdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ09idGFpbmluZyAnKVxuXHRcdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1tub3RpY2VdIEEgbmV3IHJlbGVhc2Ugb2YgcGlwIGlzIGF2YWlsYWJsZTogJylcblx0XHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdbbm90aWNlXSBUbyB1cGRhdGUsIHJ1bjogJylcblx0XHRcdFx0fHwgcmVnZXhUZXN0KFxuXHRcdFx0XHRcdFN0cmluZy5yYXdgXlxccytbXFx1MjUwMVxcdTI1NzhcXHUyNTdBIF0qW1xcdTI1MDFcXHUyNTc4XFx1MjU3QV1bXFx1MjUwMVxcdTI1NzhcXHUyNTdBIF0qXFxkKyg/OlxcLlxcZCspPyg/OlxccypbS01HXT9CKT9bLyBdYCxcblx0XHRcdFx0XHRsaW5lLFxuXHRcdFx0XHQpKSk7XG59XG5cbmZ1bmN0aW9uIGlzUGlwUm9vdFVzZXJXYXJuaW5nKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gbGluZS5zdGFydHNXaXRoKGBXQVJOSU5HOiBSdW5uaW5nIHBpcCBhcyB0aGUgJ3Jvb3QnIHVzZXIgY2FuIHJlc3VsdCBpbiBicm9rZW4gcGVybWlzc2lvbnNgKVxuXHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnSXQgaXMgcmVjb21tZW5kZWQgdG8gdXNlIGEgdmlydHVhbCBlbnZpcm9ubWVudCBpbnN0ZWFkOiAnKTtcbn1cblxuZnVuY3Rpb24gaXNQeXRob25OaW5qYUJ1aWxkUHJvZ3Jlc3NMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0KFxuXHRcdFN0cmluZy5yYXdgXlxcW1xccypcXGQrL1xcZCtcXF1cXHMrQ29tcGlsaW5nICg/OkN8Q1xcK1xcK3xDeXRob24pIHNvdXJjZSBcXFMrXFwuKD86Y3xjY3xjcHB8Y3h4fHB5eCkkYCxcblx0XHRsaW5lLFxuXHQpIHx8IHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF5cXFtcXHMqXFxkKy9cXGQrXFxdXFxzK0dlbmVyYXRpbmcgXFxTKyB3aXRoIGEgY3VzdG9tIGNvbW1hbmQkYCxcblx0XHRsaW5lLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBpc1B5dGhvbkJ1aWxkRXh0UHJvZ3Jlc3NMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIWlzRGlhZ25vc3RpY0xpbmUobGluZSlcblx0XHQmJiAocmVnZXhUZXN0KFxuXHRcdFx0U3RyaW5nLnJhd2BecnVubmluZyAoPzpiZGlzdF93aGVlbHxidWlsZHxidWlsZF9weXxidWlsZF9leHR8ZWdnX2luZm98aW5zdGFsbCg/Ol9saWJ8X2VnZ19pbmZvfF9zY3JpcHRzfF9oZWFkZXJzKT98c2Rpc3R8Y2hlY2spXFxiYCxcblx0XHRcdGxpbmUsXG5cdFx0KSB8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeYnVpbGRpbmcgJy4rJyBleHRlbnNpb24kYCwgbGluZSlcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnY3JlYXRpbmcgYnVpbGQnKVxuXHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdjb21waWxlIG9wdGlvbnM6ICcpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ2V4dHJhIG9wdGlvbnM6ICcpXG5cdFx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeY29weWluZyAuKyAtPiBgLCBsaW5lKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXndyaXRpbmcgLitcXC5lZ2ctaW5mby9gLCBsaW5lKVxuXHRcdFx0fHwgbGluZS5zdGFydHNXaXRoKCdyZWFkaW5nIG1hbmlmZXN0IGZpbGUgJylcblx0XHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFx0U3RyaW5nLnJhd2BeKD86Z2NjfGdcXCtcXCt8Y2N8Y1xcK1xcK3xjbGFuZ3xjbGFuZ1xcK1xcKylcXGIuKlxccyg/Oi1jfC1zaGFyZWQpXFxzYCxcblx0XHRcdFx0bGluZSxcblx0XHRcdClcblx0XHRcdHx8IHJlZ2V4VGVzdChcblx0XHRcdFx0U3RyaW5nLnJhd2BeQ29tcGlsaW5nIFxcUytcXC5weXggYmVjYXVzZSAoPzppdCBjaGFuZ2VkfGl0IGRlcGVuZHMgb24gKWAsXG5cdFx0XHRcdGxpbmUsXG5cdFx0XHQpXG5cdFx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxbXFxzKlxcZCsvXFxkK1xcXVxccytDeXRob25pemluZyBcXFMrXFwucHl4YCwgbGluZSkpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0U2V0dXB0b29sc0ZpbGVTdGFnaW5nUnVucyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBjb2xsYXBzZUNvbnRpZ3VvdXNSdW5zKG91dHB1dCwgaXNTZXR1cHRvb2xzRmlsZVN0YWdpbmdMaW5lLCA1LCBibG9jayA9PiB7XG5cdFx0Y29uc3Qgb3BlcmF0aW9ucyA9IHVuaXF1ZVN0cmluZ3MoXG5cdFx0XHRibG9jay5tYXAobGluZSA9PiBzcGxpdFdoaXRlc3BhY2UobGluZSlbMF0gPz8gJ3N0YWdpbmcnKSxcblx0XHQpO1xuXHRcdHJldHVybiBgW3NldHVwdG9vbHMgZmlsZSBzdGFnaW5nOiBvbWl0dGVkICR7YmxvY2subGVuZ3RofSAke29wZXJhdGlvbnMuam9pbignLycpfSBsaW5lKHMpXWA7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBpc1NldHVwdG9vbHNGaWxlU3RhZ2luZ0xpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3QoU3RyaW5nLnJhd2BeY29weWluZyAuKyAtPiAuKyRgLCBsaW5lKVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5jcmVhdGluZyAoPzpidWlsZFxcYnxbXi9cXHNdK1xcLmVnZy1pbmZvXFxiKS4qJGAsIGxpbmUpXG5cdFx0fHwgcmVnZXhUZXN0KFxuXHRcdFx0U3RyaW5nLnJhd2BeY3JlYXRpbmcgW0EtWmEtejAtOV8uKy1dKy1bQS1aYS16MC05Xy4rLV0rL1tcXHcuLystXSskYCxcblx0XHRcdGxpbmUsXG5cdFx0KVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5hZGRpbmcgKD86bGljZW5zZSBmaWxlICk/KD86J1teJ10rJ3xcIlteXCJdK1wiKSRgLCBsaW5lKVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF53cml0aW5nIC4rXFwuZWdnLWluZm8vLiskYCwgbGluZSlcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2Bed3JpdGluZyBtYW5pZmVzdCBmaWxlIFsnXCJdLitbJ1wiXSRgLCBsaW5lKVxuXHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5yZWFkaW5nIG1hbmlmZXN0ICg/OmZpbGV8dGVtcGxhdGUpIFsnXCJdLitbJ1wiXSRgLCBsaW5lKTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdE51bXB5RGlzdHV0aWxzUHJvYmVzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFvdXRwdXQuaW5jbHVkZXMoJ0lORk86ICcpKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXHRyZXR1cm4gY29sbGFwc2VDb250aWd1b3VzUnVucyhvdXRwdXQsIGlzTnVtcHlEaXN0dXRpbHNQcm9iZUxpbmUsIDQsIGJsb2NrID0+XG5cdFx0YFtudW1weS5kaXN0dXRpbHMgcHJvYmVzOiBvbWl0dGVkICR7YmxvY2subGVuZ3RofSBCTEFTL0xBUEFDSyBwcm9iZSBsaW5lKHMpXWApO1xufVxuXG5mdW5jdGlvbiBpc051bXB5RGlzdHV0aWxzUHJvYmVMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIWlzRGlhZ25vc3RpY0xpbmUobGluZSlcblx0XHQmJiBsaW5lLnN0YXJ0c1dpdGgoJ0lORk86ICcpXG5cdFx0JiYgcmVnZXhUZXN0KFxuXHRcdFx0U3RyaW5nLnJhd2AoPzpfaW5mbzp8Tk9UIEFWQUlMQUJMRXxsaWJyYXJpZXMgLiogbm90IGZvdW5kfFNldHRpbmcgUFRBVExBU3xjdXN0b21pemUgfGNvbXBpbGUgb3B0aW9uczp8ZXh0cmEgb3B0aW9uczopYCxcblx0XHRcdGxpbmUsXG5cdFx0KTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdFNwaGlueFByb2dyZXNzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFvdXRwdXQuaW5jbHVkZXMoJ3JlYWRpbmcgc291cmNlcy4uLiBbJykgJiYgIW91dHB1dC5pbmNsdWRlcygnd3JpdGluZyBvdXRwdXQuLi4gWycpKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXHRyZXR1cm4gY29tcGFjdEludHJhbGluZVByb2dyZXNzKG91dHB1dCwgJ3NwaGlueCBwcm9ncmVzcycsIGNvbXBhY3RTcGhpbnhQcm9ncmVzc0xpbmUpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0U3BoaW54UHJvZ3Jlc3NMaW5lKGxpbmU6IHN0cmluZyk6IENvbXBhY3RlZExpbmUge1xuXHRpZiAoIWxpbmUuaW5jbHVkZXMoJ3JlYWRpbmcgc291cmNlcy4uLiBbJykgJiYgIWxpbmUuaW5jbHVkZXMoJ3dyaXRpbmcgb3V0cHV0Li4uIFsnKSkge1xuXHRcdHJldHVybiB1bmNoYW5nZWRMaW5lKGxpbmUpO1xuXHR9XG5cdHJldHVybiBjb21wYWN0UHJvZ3Jlc3NQYXR0ZXJuc1VubGVzc0RpYWdub3N0aWMoXG5cdFx0bGluZSxcblx0XHRbXG5cdFx0XHRTdHJpbmcucmF3YHJlYWRpbmcgc291cmNlc1xcLlxcLlxcLiBcXFtcXHMqXFxkKyVcXF1cXHMrXFxTK1xccypgLFxuXHRcdFx0U3RyaW5nLnJhd2B3cml0aW5nIG91dHB1dFxcLlxcLlxcLiBcXFtcXHMqXFxkKyVcXF1cXHMrXFxTK1xccypgLFxuXHRcdF0sXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGhhc1NwaGlueFByb2dyZXNzKG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBoYXNTcGhpbnhPdXRwdXRNYXJrZXIob3V0cHV0KVxuXHRcdCYmIChvdXRwdXQuaW5jbHVkZXMoJ3JlYWRpbmcgc291cmNlcy4uLiBbJykgfHwgb3V0cHV0LmluY2x1ZGVzKCd3cml0aW5nIG91dHB1dC4uLiBbJykpO1xufVxuXG5mdW5jdGlvbiBoYXNTcGhpbnhPdXRwdXRNYXJrZXIob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIG91dHB1dC5zcGxpdCgnXFxuJykuc29tZShsaW5lID0+XG5cdFx0bGluZS5zdGFydHNXaXRoKCdSdW5uaW5nIFNwaGlueCB2Jylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1NwaGlueCB2Jylcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ2xvYWRpbmcgcGlja2xlZCBlbnZpcm9ubWVudC4uLicpXG5cdFx0fHwgbGluZS5zdGFydHNXaXRoKCdidWlsZCBzdWNjZWVkZWQnKVxuXHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnYnVpbGQgZmluaXNoZWQgd2l0aCBwcm9ibGVtcycpXG5cdFx0fHwgbGluZS5zdGFydHNXaXRoKCdUaGUgSFRNTCBwYWdlcyBhcmUgaW4gJykpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0RG9jdXNhdXJ1c1Byb2dyZXNzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFoYXNEb2N1c2F1cnVzUHJvZ3Jlc3Mob3V0cHV0KSkge1xuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblx0cmV0dXJuIG9taXRNYXRjaGluZ0xpbmVzKFxuXHRcdG91dHB1dCxcblx0XHQnZG9jdXNhdXJ1cyBwcm9ncmVzcycsXG5cdFx0bGluZSA9PiByZWdleFRlc3QoU3RyaW5nLnJhd2BeXFxzKltcXHUyNUNGXFx1MjVFRl1cXHMrKD86Q2xpZW50fFNlcnZlcikoPzpcXHMrfCQpYCwgbGluZSksXG5cdFx0J3Byb2dyZXNzJyxcblx0KTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdENhcnJpYWdlUmV0dXJuUHJvZ3Jlc3Mob3V0cHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIW91dHB1dC5pbmNsdWRlcygnXFxyJykpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cdHJldHVybiBvdXRwdXRcblx0XHQuc3BsaXQoJ1xcbicpXG5cdFx0Lm1hcChsaW5lID0+IHtcblx0XHRcdGNvbnN0IHBhcnRzID0gbGluZS5zcGxpdCgnXFxyJyk7XG5cdFx0XHRmb3IgKGxldCBpZHggPSBwYXJ0cy5sZW5ndGggLSAxOyBpZHggPj0gMDsgaWR4LS0pIHtcblx0XHRcdFx0aWYgKHBhcnRzW2lkeF0ubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHBhcnRzW2lkeF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiAnJztcblx0XHR9KVxuXHRcdC5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gbG9va3NMaWtlR29SdW50aW1lUGFuaWMob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKGpzU3RyaW5nTGVuKG91dHB1dCkgPCA0ICogMTAyNFxuXHRcdHx8ICFyZWdleFRlc3QoXG5cdFx0XHRTdHJpbmcucmF3YCg/Ol58XFxuKSg/OmZhdGFsIGVycm9yOiB8cnVudGltZSBzdGFjazp8U0lHU0VHVnxTSUdBQlJUfFNJR0JVUylgLFxuXHRcdFx0b3V0cHV0LFxuXHRcdClcblx0KSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0bGV0IGNvdW50ID0gMDtcblx0Zm9yIChjb25zdCBsaW5lIG9mIG91dHB1dC5zcGxpdCgnXFxuJykpIHtcblx0XHRpZiAoaXNHb1J1bnRpbWVHb3JvdXRpbmVIZWFkZXIobGluZSkpIHtcblx0XHRcdGNvdW50ICs9IDE7XG5cdFx0XHRpZiAoY291bnQgPT09IEdPX1JVTlRJTUVfUEFOSUNfTUlOX0dPUk9VVElORVMpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdEdvUnVudGltZVBhbmljRHVtcChvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghbG9va3NMaWtlR29SdW50aW1lUGFuaWMob3V0cHV0KSkge1xuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHRjb25zdCBsaW5lcyA9IG91dHB1dC5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IGZpcnN0SGVhZGVyID0gbGluZXMuZmluZEluZGV4KGxpbmUgPT4gaXNHb1J1bnRpbWVHb3JvdXRpbmVIZWFkZXIobGluZSkpO1xuXHRpZiAoZmlyc3RIZWFkZXIgPT09IC0xKSB7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdGNvbnN0IGJsb2NrcyA9IGNvbGxlY3RHb0dvcm91dGluZUJsb2NrcyhsaW5lcywgZmlyc3RIZWFkZXIpO1xuXHRpZiAoYmxvY2tzLmxlbmd0aCA8IEdPX1JVTlRJTUVfUEFOSUNfTUlOX0dPUk9VVElORVMpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IGxpbmVzLnNsaWNlKDAsIGZpcnN0SGVhZGVyKTtcblx0Zm9yIChsZXQgayA9IGJsb2Nrc1swXS5zdGFydDsgayA8IGJsb2Nrc1swXS5lbmQ7IGsrKykge1xuXHRcdGNvbXBhY3RlZC5wdXNoKGxpbmVzW2tdKTtcblx0fVxuXHRsZXQgb21pdHRlZEZyYW1lTGluZXMgPSAwO1xuXHRjb25zdCByZW1haW5pbmdCbG9ja3M6IHN0cmluZ1tdW10gPSBbXTtcblx0Zm9yIChjb25zdCBibG9jayBvZiBibG9ja3Muc2xpY2UoMSkpIHtcblx0XHRjb25zdCBvcmlnaW5hbEJsb2NrID0gbGluZXMuc2xpY2UoYmxvY2suc3RhcnQsIGJsb2NrLmVuZCk7XG5cdFx0Y29uc3QgY29tcGFjdGVkQmxvY2sgPSBjb21wYWN0R29Hb3JvdXRpbmVCbG9jayhvcmlnaW5hbEJsb2NrKTtcblx0XHRvbWl0dGVkRnJhbWVMaW5lcyArPSBzYXR1cmF0aW5nU3ViKG9yaWdpbmFsQmxvY2subGVuZ3RoLCBjb21wYWN0ZWRCbG9jay5sZW5ndGgpO1xuXHRcdHJlbWFpbmluZ0Jsb2Nrcy5wdXNoKGNvbXBhY3RlZEJsb2NrKTtcblx0fVxuXG5cdGNvbnN0IGdyb3VwZWRCbG9ja3MgPSBncm91cFJlcGVhdGVkR29Hb3JvdXRpbmVCbG9ja3MocmVtYWluaW5nQmxvY2tzKTtcblx0aWYgKG9taXR0ZWRGcmFtZUxpbmVzID09PSAwICYmIGdyb3VwZWRCbG9ja3Mub21pdHRlZEJsb2NrcyA9PT0gMCkge1xuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHRjb25zdCBzdW1tYXJ5OiBzdHJpbmdbXSA9IFtdO1xuXHRpZiAob21pdHRlZEZyYW1lTGluZXMgPiAwKSB7XG5cdFx0c3VtbWFyeS5wdXNoKGAke2Jsb2Nrcy5sZW5ndGggLSAxfSBnb3JvdXRpbmUgYmxvY2socykgYmVsb3cgd2VyZSBjb25kZW5zZWQ7ICR7b21pdHRlZEZyYW1lTGluZXN9IGZyYW1lIGxpbmUocykgb21pdHRlZGApO1xuXHR9XG5cdGlmIChncm91cGVkQmxvY2tzLm9taXR0ZWRCbG9ja3MgPiAwKSB7XG5cdFx0c3VtbWFyeS5wdXNoKGAke2dyb3VwZWRCbG9ja3Mub21pdHRlZEJsb2Nrc30gcmVwZWF0ZWQgZ29yb3V0aW5lIGJsb2NrKHMpIGdyb3VwZWRgKTtcblx0fVxuXHRjb21wYWN0ZWQucHVzaChgW2dvIHJ1bnRpbWUgcGFuaWM6ICR7c3VtbWFyeS5qb2luKCc7ICcpfV1gKTtcblx0Zm9yIChjb25zdCBibG9jayBvZiBncm91cGVkQmxvY2tzLmJsb2Nrcykge1xuXHRcdGNvbXBhY3RlZC5wdXNoKC4uLmJsb2NrKTtcblx0fVxuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5pbnRlcmZhY2UgR29CbG9ja1JhbmdlIHtcblx0c3RhcnQ6IG51bWJlcjtcblx0ZW5kOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGNvbGxlY3RHb0dvcm91dGluZUJsb2NrcyhsaW5lczogcmVhZG9ubHkgc3RyaW5nW10sIGZpcnN0SGVhZGVyOiBudW1iZXIpOiBHb0Jsb2NrUmFuZ2VbXSB7XG5cdGNvbnN0IGJsb2NrczogR29CbG9ja1JhbmdlW10gPSBbXTtcblx0bGV0IHN0YXJ0ID0gZmlyc3RIZWFkZXI7XG5cdGZvciAobGV0IGkgPSBmaXJzdEhlYWRlciArIDE7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuXHRcdGlmIChpc0dvUnVudGltZUdvcm91dGluZUhlYWRlcihsaW5lc1tpXSkpIHtcblx0XHRcdGJsb2Nrcy5wdXNoKHsgc3RhcnQsIGVuZDogaSB9KTtcblx0XHRcdHN0YXJ0ID0gaTtcblx0XHR9XG5cdH1cblx0YmxvY2tzLnB1c2goeyBzdGFydCwgZW5kOiBsaW5lcy5sZW5ndGggfSk7XG5cdHJldHVybiBibG9ja3M7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RHb0dvcm91dGluZUJsb2NrKGJsb2NrOiByZWFkb25seSBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcblx0Y29uc3QgZm9vdGVyU3RhcnQgPSBmaW5kR29Hb3JvdXRpbmVGb290ZXJTdGFydChibG9jayk7XG5cdGNvbnN0IHN0YWNrID0gYmxvY2suc2xpY2UoMCwgZm9vdGVyU3RhcnQpO1xuXHRjb25zdCBmb290ZXIgPSBibG9jay5zbGljZShmb290ZXJTdGFydCk7XG5cdGlmIChzdGFjay5sZW5ndGggPD0gNCkge1xuXHRcdHJldHVybiBbLi4uc3RhY2ssIC4uLmZvb3Rlcl07XG5cdH1cblxuXHRsZXQgY3JlYXRlZEJ5SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0Zm9yIChsZXQgaWR4ID0gc3RhY2subGVuZ3RoIC0gMTsgaWR4ID49IDA7IGlkeC0tKSB7XG5cdFx0aWYgKHN0YWNrW2lkeF0uc3RhcnRzV2l0aCgnY3JlYXRlZCBieSAnKSkge1xuXHRcdFx0Y3JlYXRlZEJ5SW5kZXggPSBpZHg7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblx0Y29uc3Qga2VwdCA9IHN0YWNrLnNsaWNlKDAsIE1hdGgubWluKDMsIHN0YWNrLmxlbmd0aCkpO1xuXHRpZiAoY3JlYXRlZEJ5SW5kZXggIT09IHVuZGVmaW5lZCAmJiBjcmVhdGVkQnlJbmRleCA+PSBrZXB0Lmxlbmd0aCkge1xuXHRcdGtlcHQucHVzaCguLi5zdGFjay5zbGljZShjcmVhdGVkQnlJbmRleCkpO1xuXHR9XG5cdGtlcHQucHVzaCguLi5mb290ZXIpO1xuXHRyZXR1cm4ga2VwdDtcbn1cblxuaW50ZXJmYWNlIEdyb3VwZWRHb0Jsb2NrcyB7XG5cdGJsb2Nrczogc3RyaW5nW11bXTtcblx0b21pdHRlZEJsb2NrczogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBncm91cFJlcGVhdGVkR29Hb3JvdXRpbmVCbG9ja3MoYmxvY2tzOiByZWFkb25seSBzdHJpbmdbXVtdKTogR3JvdXBlZEdvQmxvY2tzIHtcblx0Y29uc3Qgc2lnbmF0dXJlcyA9IGJsb2Nrcy5tYXAoYmxvY2sgPT4gZ29Hb3JvdXRpbmVTaWduYXR1cmUoYmxvY2spKTtcblx0Y29uc3QgY291bnRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0Zm9yIChjb25zdCBzaWduYXR1cmUgb2Ygc2lnbmF0dXJlcykge1xuXHRcdGlmIChzaWduYXR1cmUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y291bnRzLnNldChzaWduYXR1cmUua2V5LCAoY291bnRzLmdldChzaWduYXR1cmUua2V5KSA/PyAwKSArIDEpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGdyb3VwZWQ6IHN0cmluZ1tdW10gPSBbXTtcblx0Y29uc3Qgc2Vlbjogc3RyaW5nW10gPSBbXTtcblx0bGV0IG9taXR0ZWRCbG9ja3MgPSAwO1xuXHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYmxvY2tzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdGNvbnN0IGJsb2NrID0gYmxvY2tzW2luZGV4XTtcblx0XHRjb25zdCBzaWduYXR1cmUgPSBzaWduYXR1cmVzW2luZGV4XTtcblx0XHRpZiAoc2lnbmF0dXJlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGdyb3VwZWQucHVzaChbLi4uYmxvY2tdKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoKGNvdW50cy5nZXQoc2lnbmF0dXJlLmtleSkgPz8gMCkgPCAzKSB7XG5cdFx0XHRncm91cGVkLnB1c2goWy4uLmJsb2NrXSk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKHNlZW4uaW5jbHVkZXMoc2lnbmF0dXJlLmtleSkpIHtcblx0XHRcdG9taXR0ZWRCbG9ja3MgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdHNlZW4ucHVzaChzaWduYXR1cmUua2V5KTtcblx0XHRncm91cGVkLnB1c2goWy4uLmJsb2NrXSk7XG5cdFx0Z3JvdXBlZC5wdXNoKFtcblx0XHRcdGBbZ28gcnVudGltZSBwYW5pYzogb21pdHRlZCAkeyhjb3VudHMuZ2V0KHNpZ25hdHVyZS5rZXkpID8/IDEpIC0gMX0gc2ltaWxhciBnb3JvdXRpbmUgYmxvY2socyk6IHN0YXRlPSR7c2lnbmF0dXJlLnN0YXRlfSwgdG9wPSR7c2lnbmF0dXJlLnRvcH0ke3NpZ25hdHVyZS5sb2NhdGlvbi5sZW5ndGggPT09IDAgPyAnJyA6ICcgYXQgJ30ke3NpZ25hdHVyZS5sb2NhdGlvbn0sIGNyZWF0ZWQgYnk9JHtzaWduYXR1cmUuY3JlYXRlZEJ5fV1gLFxuXHRcdFx0JycsXG5cdFx0XSk7XG5cdH1cblxuXHRyZXR1cm4geyBibG9ja3M6IGdyb3VwZWQsIG9taXR0ZWRCbG9ja3MgfTtcbn1cblxuaW50ZXJmYWNlIEdvR29yb3V0aW5lU2lnbmF0dXJlIHtcblx0a2V5OiBzdHJpbmc7XG5cdHN0YXRlOiBzdHJpbmc7XG5cdHRvcDogc3RyaW5nO1xuXHRsb2NhdGlvbjogc3RyaW5nO1xuXHRjcmVhdGVkQnk6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZ29Hb3JvdXRpbmVTaWduYXR1cmUoYmxvY2s6IHJlYWRvbmx5IHN0cmluZ1tdKTogR29Hb3JvdXRpbmVTaWduYXR1cmUgfCB1bmRlZmluZWQge1xuXHRpZiAoZmluZEdvR29yb3V0aW5lRm9vdGVyU3RhcnQoYmxvY2spIDwgYmxvY2subGVuZ3RoKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IGZpcnN0ID0gYmxvY2tbMF07XG5cdGlmIChmaXJzdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBzdGF0ZSA9IHJlZ2V4Q2FwdHVyZUZpcnN0KFN0cmluZy5yYXdgXFxbKFteXFxdXSspXFxdOiRgLCBmaXJzdCk7XG5cdGlmIChzdGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRsZXQgdG9wSW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGJsb2NrLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdGNvbnN0IGxpbmUgPSBibG9ja1tpbmRleF07XG5cdFx0aWYgKGluZGV4ID4gMCAmJiBsaW5lLmxlbmd0aCAhPT0gMCAmJiAhbGluZS5zdGFydHNXaXRoKCdcXHQnKSAmJiAhbGluZS5zdGFydHNXaXRoKCdjcmVhdGVkIGJ5ICcpKSB7XG5cdFx0XHR0b3BJbmRleCA9IGluZGV4O1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cdGlmICh0b3BJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB0b3AgPSBnb0Z1bmN0aW9uTmFtZShibG9ja1t0b3BJbmRleF0pO1xuXHRpZiAodG9wID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGxvY2F0aW9uID0gZ29GaWxlTG9jYXRpb24odG9wSW5kZXggKyAxIDwgYmxvY2subGVuZ3RoID8gYmxvY2tbdG9wSW5kZXggKyAxXSA6IHVuZGVmaW5lZCk7XG5cdGNvbnN0IGNyZWF0ZWRCeUxpbmUgPSBibG9jay5maW5kKGxpbmUgPT4gbGluZS5zdGFydHNXaXRoKCdjcmVhdGVkIGJ5ICcpKTtcblx0Y29uc3QgY3JlYXRlZEJ5ID0gKGNyZWF0ZWRCeUxpbmUgIT09IHVuZGVmaW5lZCA/IGdvQ3JlYXRlZEJ5RnVuY3Rpb24oY3JlYXRlZEJ5TGluZSkgOiB1bmRlZmluZWQpID8/ICc8bm9uZT4nO1xuXHRyZXR1cm4ge1xuXHRcdGtleTogYCR7c3RhdGV9XFwwJHt0b3B9XFwwJHtsb2NhdGlvbn1cXDAke2NyZWF0ZWRCeX1gLFxuXHRcdHN0YXRlLFxuXHRcdHRvcCxcblx0XHRsb2NhdGlvbixcblx0XHRjcmVhdGVkQnksXG5cdH07XG59XG5cbmZ1bmN0aW9uIGdvRnVuY3Rpb25OYW1lKGxpbmU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiByZWdleENhcHR1cmVGaXJzdChTdHJpbmcucmF3YF4oW15cXHMoXSspKD86XFwofCQpYCwgbGluZSk7XG59XG5cbmZ1bmN0aW9uIGdvRmlsZUxvY2F0aW9uKGxpbmU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdGlmIChsaW5lID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0cmV0dXJuIHJlZ2V4Q2FwdHVyZUZpcnN0KFN0cmluZy5yYXdgKFteL1xcc10rXFwuW0EtWmEtejAtOV0rOlxcZCspYCwgbGluZSkgPz8gJyc7XG59XG5cbmZ1bmN0aW9uIGdvQ3JlYXRlZEJ5RnVuY3Rpb24obGluZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHJlZ2V4Q2FwdHVyZUZpcnN0KFN0cmluZy5yYXdgXmNyZWF0ZWQgYnkgKC4rPykoPzogaW4gZ29yb3V0aW5lIFxcZCspPyRgLCBsaW5lKTtcbn1cblxuZnVuY3Rpb24gZmluZEdvR29yb3V0aW5lRm9vdGVyU3RhcnQoYmxvY2s6IHJlYWRvbmx5IHN0cmluZ1tdKTogbnVtYmVyIHtcblx0Zm9yIChsZXQgaSA9IDE7IGkgPCBibG9jay5sZW5ndGg7IGkrKykge1xuXHRcdGlmICghaXNHb0dvcm91dGluZVN0YWNrTGluZShibG9ja1tpXSkpIHtcblx0XHRcdHJldHVybiBpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gYmxvY2subGVuZ3RoO1xufVxuXG5mdW5jdGlvbiBpc0dvR29yb3V0aW5lU3RhY2tMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gbGluZS5sZW5ndGggPT09IDBcblx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ1xcdCcpXG5cdFx0fHwgbGluZS5zdGFydHNXaXRoKCdjcmVhdGVkIGJ5ICcpXG5cdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxcUy4qXFwpJGAsIGxpbmUpO1xufVxuXG5mdW5jdGlvbiBpc0dvUnVudGltZUdvcm91dGluZUhlYWRlcihsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YF5nb3JvdXRpbmUgXFxkKyg/OiBncD1cXFMrKT8oPzogbT1cXFMrKT8oPzogbXA9XFxTKyk/IFxcW1teXFxdXStcXF06JGAsXG5cdFx0bGluZSxcblx0KTtcbn1cblxuZnVuY3Rpb24gaXNEamFuZ29UZXN0Qm9pbGVycGxhdGVMaW5lKGxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIWlzRGlhZ25vc3RpY0xpbmUobGluZSlcblx0XHQmJiAobGluZS5zdGFydHNXaXRoKCdUZXN0aW5nIGFnYWluc3QgRGphbmdvIGluc3RhbGxlZCBpbiAnKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXkZvdW5kIFxcZCsgdGVzdCg/OlxcKHNcXCl8cyk/XFwuJGAsIGxpbmUpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ0NyZWF0aW5nIHRlc3QgZGF0YWJhc2UgZm9yIGFsaWFzICcpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ0Rlc3Ryb3lpbmcgdGVzdCBkYXRhYmFzZSBmb3IgYWxpYXMgJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnU2tpcHBpbmcgc2V0dXAgb2YgdW51c2VkIGRhdGFiYXNlJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnU3lzdGVtIGNoZWNrIGlkZW50aWZpZWQgbm8gaXNzdWVzJylcblx0XHRcdHx8IGxpbmUuc3RhcnRzV2l0aCgnT3BlcmF0aW9ucyB0byBwZXJmb3JtOicpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ0FwcGx5IGFsbCBtaWdyYXRpb25zOicpXG5cdFx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BeIHsyfUFwcGx5aW5nIFxcUytcXC5cXFMrXFwuXFwuXFwuIE9LJGAsIGxpbmUpXG5cdFx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BedGVzdF9cXFMrIFxcKFteKV0rXFwpIFxcLlxcLlxcLiBvayRgLCBsaW5lKSk7XG59XG5cbmZ1bmN0aW9uIGlzRGphbmdvVGVzdFByb2dyZXNzTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuICFpc0RpYWdub3N0aWNMaW5lKGxpbmUpXG5cdFx0JiYgKGxpbmUuaW5jbHVkZXMoJy4nKSB8fCBsaW5lLmluY2x1ZGVzKCdzJykgfHwgbGluZS5pbmNsdWRlcygneCcpIHx8IGxpbmUuaW5jbHVkZXMoJ1gnKSlcblx0XHQmJiByZWdleFRlc3QoU3RyaW5nLnJhd2BeWy5zeFhFRl0rKD86XFxzK1xcW1xccypcXGQrJVxcXSk/JGAsIGxpbmUpO1xufVxuXG5mdW5jdGlvbiBpc1B5dGVzdFNlc3Npb25NZXRhZGF0YUxpbmUobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAhaXNEaWFnbm9zdGljTGluZShsaW5lKVxuXHRcdCYmIChyZWdleFRlc3RXaXRoRmxhZ3MoU3RyaW5nLnJhd2BePStcXHMqdGVzdCBzZXNzaW9uIHN0YXJ0c1xccyo9KyRgLCBsaW5lLCAnaScpXG5cdFx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BecGxhdGZvcm0gLipcXGJweXRlc3QtLipcXGJwbHVnZ3ktYCwgbGluZSlcblx0XHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF4oPzpjYWNoZWRpcnxyb290ZGlyfGNvbmZpZ2ZpbGV8cGx1Z2lucyk6IGAsIGxpbmUpXG5cdFx0XHR8fCBsaW5lLnN0YXJ0c1dpdGgoJ2NvbGxlY3RpbmcgLi4uJylcblx0XHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5jb2xsZWN0ZWQgXFxkKyBpdGVtcz9gLCBsaW5lKSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhY3RQeXRlc3RQcm9ncmVzcyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmIChoYXNQeXRlc3RUZXJtaW5hbFN1bW1hcnkob3V0cHV0KSkge1xuXHRcdHJldHVybiBvbWl0UHl0ZXN0UHJvZ3Jlc3NMaW5lcyhvdXRwdXQsIGlzUHl0ZXN0UHJvZ3Jlc3NMaW5lKTtcblx0fVxuXHRpZiAoaGFzU3RyaWN0UHl0ZXN0UGFzc2VkUHJvZ3Jlc3NSdW4ob3V0cHV0KSAmJiAhaGFzUHl0ZXN0UHJvZ3Jlc3NGYWxsYmFja1BvaXNvbihvdXRwdXQpKSB7XG5cdFx0cmV0dXJuIG9taXRQeXRlc3RQcm9ncmVzc0xpbmVzKG91dHB1dCwgaXNTdHJpY3RQeXRlc3RQYXNzZWRQcm9ncmVzc0xpbmUpO1xuXHR9XG5cdHJldHVybiBvdXRwdXQ7XG59XG5cbmZ1bmN0aW9uIG9taXRQeXRlc3RQcm9ncmVzc0xpbmVzKG91dHB1dDogc3RyaW5nLCBzaG91bGRPbWl0OiAobGluZTogc3RyaW5nKSA9PiBib29sZWFuKTogc3RyaW5nIHtcblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBvbWl0dGVkTGluZXM6IHN0cmluZ1tdID0gW107XG5cblx0Zm9yIChjb25zdCBsaW5lIG9mIG91dHB1dC5zcGxpdCgnXFxuJykpIHtcblx0XHRpZiAoc2hvdWxkT21pdChsaW5lKSkge1xuXHRcdFx0b21pdHRlZExpbmVzLnB1c2gobGluZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZsdXNoUHl0ZXN0UHJvZ3Jlc3NMaW5lcyhjb21wYWN0ZWQsIG9taXR0ZWRMaW5lcyk7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChsaW5lKTtcblx0XHR9XG5cdH1cblx0Zmx1c2hQeXRlc3RQcm9ncmVzc0xpbmVzKGNvbXBhY3RlZCwgb21pdHRlZExpbmVzKTtcblx0cmV0dXJuIGNvbXBhY3RlZC5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gZmx1c2hQeXRlc3RQcm9ncmVzc0xpbmVzKGNvbXBhY3RlZDogc3RyaW5nW10sIG9taXR0ZWRMaW5lczogc3RyaW5nW10pOiB2b2lkIHtcblx0aWYgKG9taXR0ZWRMaW5lcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3Qgc3VtbWFyeSA9IG9taXR0ZWRMaW5lcy5ldmVyeShsaW5lID0+IGlzU3RyaWN0UHl0ZXN0UGFzc2VkUHJvZ3Jlc3NMaW5lKGxpbmUpKVxuXHRcdD8gYFtweXRlc3QgcHJvZ3Jlc3M6IG9taXR0ZWQgJHtvbWl0dGVkTGluZXMubGVuZ3RofSBQQVNTRUQgdGVzdCByZXN1bHQgbGluZShzKV1gXG5cdFx0OiBgW3B5dGVzdCBwcm9ncmVzczogb21pdHRlZCAke29taXR0ZWRMaW5lcy5sZW5ndGh9IG5vbi1kaWFnbm9zdGljIGxpbmUocyldYDtcblx0Y29tcGFjdGVkLnB1c2goc3VtbWFyeSk7XG5cdG9taXR0ZWRMaW5lcy5sZW5ndGggPSAwO1xufVxuXG5mdW5jdGlvbiBpc1B5dGVzdFByb2dyZXNzTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuICFpc0RpYWdub3N0aWNMaW5lKGxpbmUpXG5cdFx0JiYgKHJlZ2V4VGVzdChTdHJpbmcucmF3YF5bLT1dezIwLH0kYCwgbGluZSlcblx0XHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5bLnN4WF0rKD86XFxzK1xcW1xccypcXGQrJVxcXSk/XFxzKiRgLCBsaW5lKVxuXHRcdFx0fHwgcmVnZXhUZXN0KFxuXHRcdFx0XHRTdHJpbmcucmF3YF5cXFMrXFwucHk6OlxcUytcXHMrKD86UEFTU0VEfFNLSVBQRUR8WEZBSUwpXFxzK1xcW1xccypcXGQrJVxcXSRgLFxuXHRcdFx0XHRsaW5lLFxuXHRcdFx0KSk7XG59XG5cbmZ1bmN0aW9uIGhhc1B5dGVzdFByb2dyZXNzRmFsbGJhY2tQb2lzb24ob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChcblx0XHRTdHJpbmcucmF3YCg/Ol58XFxuKSg/OlxcUytcXC5weTo6XFxTK1xccysoPzpGQUlMRUR8RVJST1IpXFxzK1xcW1xccypcXGQrJVxcXXwoPzpGQUlMfEVSUk9SfElOVEVSTkFMRVJST1IpXFxiKXxUcmFjZWJhY2sgXFwobW9zdCByZWNlbnQgY2FsbCBsYXN0XFwpOmAsXG5cdFx0b3V0cHV0LFxuXHQpIHx8IGhhc0hhcmRDcmFzaExpbmUob3V0cHV0KTtcbn1cblxuZnVuY3Rpb24gaGFzSGFyZENyYXNoTGluZShvdXRwdXQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVnZXhUZXN0V2l0aEZsYWdzKFxuXHRcdFN0cmluZy5yYXdgKD86RmF0YWwgUHl0aG9uIGVycm9yOnxBYm9ydGVkfEFib3J0IHRyYXB8Y29yZSBkdW1wZWR8c2VnbWVudGF0aW9uIGZhdWx0KWAsXG5cdFx0b3V0cHV0LFxuXHRcdCdpJyxcblx0KTtcbn1cblxuZnVuY3Rpb24gaGFzU3RyaWN0UHl0ZXN0UGFzc2VkUHJvZ3Jlc3NSdW4ob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0bGV0IHJ1bkxlbmd0aCA9IDA7XG5cdGZvciAoY29uc3QgbGluZSBvZiBvdXRwdXQuc3BsaXQoJ1xcbicpKSB7XG5cdFx0aWYgKGlzU3RyaWN0UHl0ZXN0UGFzc2VkUHJvZ3Jlc3NMaW5lKGxpbmUpKSB7XG5cdFx0XHRydW5MZW5ndGggKz0gMTtcblx0XHRcdGlmIChydW5MZW5ndGggPj0gNSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cnVuTGVuZ3RoID0gMDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBpc1N0cmljdFB5dGVzdFBhc3NlZFByb2dyZXNzTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuICFpc0RpYWdub3N0aWNMaW5lKGxpbmUpICYmIHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXFMrXFwucHk6OlxcUytcXHMrUEFTU0VEXFxzK1xcW1xccypcXGQrJVxcXSRgLCBsaW5lKTtcbn1cblxuZnVuY3Rpb24gaGFzUHl0ZXN0VGVybWluYWxTdW1tYXJ5KG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiByZWdleFRlc3RXaXRoRmxhZ3MoXG5cdFx0U3RyaW5nLnJhd2AoPzpefFxcbikoPzo9K1xccyopP1tePVxcbl0qKD86cGFzc2VkfGZhaWxlZHxlcnJvcnM/fHdhcm5pbmdzP3xza2lwcGVkfHhmYWlsZWR8eHBhc3NlZClbXj1cXG5dKlxcYmluIFxcZCsoPzpcXC5cXGQrKT9zXFxzKig/Oj0rKT9cXHMqKD86XFxufCQpYCxcblx0XHRvdXRwdXQsXG5cdFx0J2knLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0UHl0ZXN0RmFpbHVyZUJsb2NrcyhvdXRwdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghaGFzUHl0ZXN0VGVybWluYWxTdW1tYXJ5KG91dHB1dCkpIHtcblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cblx0Y29uc3Qgc2hvcnRTdW1tYXJ5TGluZXMgPSBjb3VudFB5dGVzdFNob3J0U3VtbWFyeUxpbmVzKG91dHB1dCk7XG5cdGNvbnN0IHNlY3Rpb25IZWFkZXJzID0gY291bnRQeXRlc3RTZWN0aW9uSGVhZGVycyhvdXRwdXQpO1xuXHRjb25zdCBsaW5lcyA9IG91dHB1dC5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IGNvbXBhY3RlZDogc3RyaW5nW10gPSBbXTtcblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCkge1xuXHRcdGNvbnN0IHNlY3Rpb24gPSBweXRlc3RTZWN0aW9uTmFtZShsaW5lc1tpXSk7XG5cdFx0aWYgKHNlY3Rpb24gIT09ICdGQUlMVVJFUycgJiYgc2VjdGlvbiAhPT0gJ0VSUk9SUycpIHtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGxpbmVzW2ldKTtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbXBhY3RlZC5wdXNoKGxpbmVzW2ldKTtcblx0XHRjb25zdCBzdGFydCA9IGkgKyAxO1xuXHRcdGxldCBlbmQgPSBzdGFydDtcblx0XHR3aGlsZSAoZW5kIDwgbGluZXMubGVuZ3RoICYmICFpc1B5dGVzdFNlY3Rpb25IZWFkZXIobGluZXNbZW5kXSkpIHtcblx0XHRcdGVuZCArPSAxO1xuXHRcdH1cblx0XHRjb21wYWN0ZWQucHVzaCguLi5jb21wYWN0UHl0ZXN0RmFpbHVyZVJlZ2lvbihcblx0XHRcdGxpbmVzLnNsaWNlKHN0YXJ0LCBlbmQpLFxuXHRcdFx0YXNjaWlMb3dlcmNhc2Uoc2VjdGlvbiA/PyAnJyksXG5cdFx0KSk7XG5cdFx0aSA9IGVuZDtcblx0fVxuXG5cdGNvbnN0IHJlc3VsdCA9IGNvbXBhY3RlZC5qb2luKCdcXG4nKTtcblx0aWYgKGNvdW50UHl0ZXN0U2hvcnRTdW1tYXJ5TGluZXMocmVzdWx0KSA9PT0gc2hvcnRTdW1tYXJ5TGluZXNcblx0XHQmJiBjb3VudFB5dGVzdFNlY3Rpb25IZWFkZXJzKHJlc3VsdCkgPT09IHNlY3Rpb25IZWFkZXJzXG5cdCkge1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblx0cmV0dXJuIG91dHB1dDtcbn1cblxuaW50ZXJmYWNlIFB5dGVzdEZhaWx1cmVCbG9jayB7XG5cdGhlYWRlcjogc3RyaW5nO1xuXHRuYW1lOiBzdHJpbmc7XG5cdGJvZHk6IHN0cmluZ1tdO1xuXHRrZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxudHlwZSBQeXRlc3RGYWlsdXJlRW50cnkgPVxuXHR8IHsgdHlwZTogJ2xpbmUnOyBsaW5lOiBzdHJpbmcgfVxuXHR8IHsgdHlwZTogJ2Jsb2NrJzsgYmxvY2s6IFB5dGVzdEZhaWx1cmVCbG9jayB9O1xuXG5mdW5jdGlvbiBjb21wYWN0UHl0ZXN0RmFpbHVyZVJlZ2lvbihsaW5lczogcmVhZG9ubHkgc3RyaW5nW10sIGxhYmVsOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGVudHJpZXM6IFB5dGVzdEZhaWx1cmVFbnRyeVtdID0gW107XG5cdGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBQeXRlc3RGYWlsdXJlQmxvY2tbXT4oKTtcblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCkge1xuXHRcdGNvbnN0IG5hbWUgPSBwYXJzZVB5dGVzdEZhaWx1cmVCbG9ja0hlYWRlcihsaW5lc1tpXSk7XG5cdFx0aWYgKG5hbWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZW50cmllcy5wdXNoKHsgdHlwZTogJ2xpbmUnLCBsaW5lOiBsaW5lc1tpXSB9KTtcblx0XHRcdGkgKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlciA9IGxpbmVzW2ldO1xuXHRcdGkgKz0gMTtcblx0XHRjb25zdCBib2R5U3RhcnQgPSBpO1xuXHRcdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoXG5cdFx0XHQmJiBwYXJzZVB5dGVzdEZhaWx1cmVCbG9ja0hlYWRlcihsaW5lc1tpXSkgPT09IHVuZGVmaW5lZFxuXHRcdFx0JiYgIWlzUHl0ZXN0U2VjdGlvbkhlYWRlcihsaW5lc1tpXSlcblx0XHQpIHtcblx0XHRcdGkgKz0gMTtcblx0XHR9XG5cdFx0Y29uc3QgYm9keSA9IGxpbmVzLnNsaWNlKGJvZHlTdGFydCwgaSk7XG5cdFx0Y29uc3Qga2V5ID0gcHl0ZXN0RmFpbHVyZUJsb2NrS2V5KGJvZHkpO1xuXHRcdGNvbnN0IGJsb2NrOiBQeXRlc3RGYWlsdXJlQmxvY2sgPSB7IGhlYWRlciwgbmFtZSwgYm9keSwga2V5IH07XG5cdFx0aWYgKGtleSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBsaXN0ID0gZ3JvdXBzLmdldChrZXkpO1xuXHRcdFx0aWYgKGxpc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRsaXN0LnB1c2goYmxvY2spO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z3JvdXBzLnNldChrZXksIFtibG9ja10pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRlbnRyaWVzLnB1c2goeyB0eXBlOiAnYmxvY2snLCBibG9jayB9KTtcblx0fVxuXG5cdGNvbnN0IGVtaXR0ZWRHcm91cHM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IGNvbXBhY3RlZDogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0aWYgKGVudHJ5LnR5cGUgPT09ICdsaW5lJykge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2goZW50cnkubGluZSk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgYmxvY2sgPSBlbnRyeS5ibG9jaztcblx0XHRjb25zdCBncm91cCA9IGJsb2NrLmtleSAhPT0gdW5kZWZpbmVkID8gZ3JvdXBzLmdldChibG9jay5rZXkpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFscmVhZHlFbWl0dGVkID0gYmxvY2sua2V5ICE9PSB1bmRlZmluZWQgJiYgZW1pdHRlZEdyb3Vwcy5pbmNsdWRlcyhibG9jay5rZXkpO1xuXHRcdGlmIChibG9jay5rZXkgPT09IHVuZGVmaW5lZCB8fCBncm91cCA9PT0gdW5kZWZpbmVkIHx8IGdyb3VwLmxlbmd0aCA8IDIgfHwgYWxyZWFkeUVtaXR0ZWQpIHtcblx0XHRcdGlmIChibG9jay5rZXkgPT09IHVuZGVmaW5lZCB8fCBncm91cCA9PT0gdW5kZWZpbmVkIHx8IGdyb3VwLmxlbmd0aCA8IDIpIHtcblx0XHRcdFx0Y29tcGFjdGVkLnB1c2goYmxvY2suaGVhZGVyKTtcblx0XHRcdFx0Y29tcGFjdGVkLnB1c2goLi4uYmxvY2suYm9keSk7XG5cdFx0XHR9XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRlbWl0dGVkR3JvdXBzLnB1c2goYmxvY2sua2V5KTtcblx0XHRjb25zdCBmaXJzdCA9IGdyb3VwWzBdO1xuXHRcdGNvbXBhY3RlZC5wdXNoKGZpcnN0LmhlYWRlcik7XG5cdFx0Y29tcGFjdGVkLnB1c2goLi4uZmlyc3QuYm9keSk7XG5cdFx0Y29uc3QgZHVwbGljYXRlcyA9IGdyb3VwLnNsaWNlKDEpO1xuXHRcdGNvbXBhY3RlZC5wdXNoKGBbcHl0ZXN0ICR7bGFiZWx9OiAke2R1cGxpY2F0ZXMubGVuZ3RofSBkdXBsaWNhdGUgdHJhY2ViYWNrIGJsb2NrKHMpIG1hdGNoICR7Zmlyc3QubmFtZX07IGFsc286ICR7c3VtbWFyaXplV2l0aE1vcmUoZHVwbGljYXRlcy5tYXAoZHVwbGljYXRlID0+IGR1cGxpY2F0ZS5uYW1lKSwgOCl9XWApO1xuXHR9XG5cdHJldHVybiBjb21wYWN0ZWQ7XG59XG5cbmZ1bmN0aW9uIHBhcnNlUHl0ZXN0RmFpbHVyZUJsb2NrSGVhZGVyKGxpbmU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiByZWdleENhcHR1cmVGaXJzdChTdHJpbmcucmF3YF5fezMsfVxccysoLis/KVxccytfezMsfVxccyokYCwgbGluZSk7XG59XG5cbmZ1bmN0aW9uIHB5dGVzdEZhaWx1cmVCbG9ja0tleShib2R5OiByZWFkb25seSBzdHJpbmdbXSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmIChib2R5Lmxlbmd0aCA8IDMgfHwgYm9keS5zb21lKGxpbmUgPT4gaXNQeXRlc3RTdW1tYXJ5TGluZShsaW5lKSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IG5vcm1hbGl6ZWQgPSBib2R5XG5cdFx0Lm1hcChsaW5lID0+IG5vcm1hbGl6ZVB5dGVzdEZhaWx1cmVMaW5lKGxpbmUpKVxuXHRcdC5maWx0ZXIobGluZSA9PiBsaW5lLnRyaW0oKS5sZW5ndGggIT09IDApXG5cdFx0LmpvaW4oJ1xcbicpO1xuXHRpZiAobm9ybWFsaXplZC5zcGxpdCgnXFxuJykubGVuZ3RoID49IDMpIHtcblx0XHRyZXR1cm4gbm9ybWFsaXplZDtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVQeXRlc3RGYWlsdXJlTGluZShsaW5lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBzdHJpcHBlZCA9IHN0cmlwQW5zaShsaW5lKTtcblx0cmV0dXJuIHN0cmlwcGVkLnJlcGxhY2UobmV3IFJlZ0V4cChTdHJpbmcucmF3YF5cXFtnd1xcZCtcXF1cXHMqYCksICcnKTtcbn1cblxuZnVuY3Rpb24gaXNQeXRlc3RTdW1tYXJ5TGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlZ2V4VGVzdChTdHJpbmcucmF3YF4oPzpGQUlMRUR8RVJST1IpXFxzK1xcU2AsIGxpbmUpO1xufVxuXG5mdW5jdGlvbiBjb3VudFB5dGVzdFNob3J0U3VtbWFyeUxpbmVzKG91dHB1dDogc3RyaW5nKTogbnVtYmVyIHtcblx0cmV0dXJuIG91dHB1dC5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gaXNQeXRlc3RTdW1tYXJ5TGluZShsaW5lKSkubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiBjb3VudFB5dGVzdFNlY3Rpb25IZWFkZXJzKG91dHB1dDogc3RyaW5nKTogbnVtYmVyIHtcblx0cmV0dXJuIG91dHB1dC5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gaXNQeXRlc3RTZWN0aW9uSGVhZGVyKGxpbmUpKS5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIGlzUHl0ZXN0U2VjdGlvbkhlYWRlcihsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHB5dGVzdFNlY3Rpb25OYW1lKGxpbmUpICE9PSB1bmRlZmluZWRcblx0XHR8fCByZWdleFRlc3QoU3RyaW5nLnJhd2BePStcXHMrLipcXGJpbiBcXGQrKD86XFwuXFxkKyk/c1xcYi4qXFxzKj0rXFxzKiRgLCBsaW5lKTtcbn1cblxuZnVuY3Rpb24gcHl0ZXN0U2VjdGlvbk5hbWUobGluZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbmFtZSA9IHJlZ2V4Q2FwdHVyZUZpcnN0KFN0cmluZy5yYXdgXj0rXFxzKyhbQS1aYS16XVtBLVphLXogXSspXFxzKz0rXFxzKiRgLCBsaW5lKTtcblx0cmV0dXJuIG5hbWUgIT09IHVuZGVmaW5lZCA/IG5hbWUudHJpbSgpIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBjb21wYWN0UHl0ZXN0V2FybmluZ3NTdW1tYXJ5KG91dHB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgbGluZXMgPSBvdXRwdXQuc3BsaXQoJ1xcbicpO1xuXHRjb25zdCBjb21wYWN0ZWQ6IHN0cmluZ1tdID0gW107XG5cdGxldCBpID0gMDtcblx0d2hpbGUgKGkgPCBsaW5lcy5sZW5ndGgpIHtcblx0XHRpZiAoIXJlZ2V4VGVzdFdpdGhGbGFncyhTdHJpbmcucmF3YF49K1xccyp3YXJuaW5ncyBzdW1tYXJ5XFxzKj0rJGAsIGxpbmVzW2ldLCAnaScpKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChsaW5lc1tpXSk7XG5cdFx0XHRpICs9IDE7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb21wYWN0ZWQucHVzaChsaW5lc1tpXSk7XG5cdFx0bGV0IGogPSBpICsgMTtcblx0XHR3aGlsZSAoaiA8IGxpbmVzLmxlbmd0aCAmJiAhcmVnZXhUZXN0KFN0cmluZy5yYXdgXj0rXFxzKy4rXFxzKz0rJGAsIGxpbmVzW2pdKSkge1xuXHRcdFx0aiArPSAxO1xuXHRcdH1cblx0XHRjb21wYWN0ZWQucHVzaCguLi5jb21wYWN0UHl0ZXN0V2FybmluZ3NTdW1tYXJ5UmVnaW9uKGxpbmVzLnNsaWNlKGkgKyAxLCBqKSkpO1xuXHRcdGkgPSBqO1xuXHR9XG5cdHJldHVybiBjb21wYWN0ZWQuam9pbignXFxuJyk7XG59XG5cbmludGVyZmFjZSBQeXRlc3RXYXJuaW5nQmxvY2sge1xuXHR0ZXN0SWRzOiBzdHJpbmdbXTtcblx0Ym9keTogc3RyaW5nW107XG5cdGtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR3YXJuaW5nQ2xhc3M6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG50eXBlIFB5dGVzdFdhcm5pbmdFbnRyeSA9XG5cdHwgeyB0eXBlOiAnbGluZSc7IGxpbmU6IHN0cmluZyB9XG5cdHwgeyB0eXBlOiAnYmxvY2snOyBibG9jazogUHl0ZXN0V2FybmluZ0Jsb2NrIH07XG5cbmZ1bmN0aW9uIGNvbXBhY3RQeXRlc3RXYXJuaW5nc1N1bW1hcnlSZWdpb24obGluZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nW10ge1xuXHRjb25zdCBlbnRyaWVzOiBQeXRlc3RXYXJuaW5nRW50cnlbXSA9IFtdO1xuXHRjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgUHl0ZXN0V2FybmluZ0Jsb2NrW10+KCk7XG5cdGxldCBpID0gMDtcblx0d2hpbGUgKGkgPCBsaW5lcy5sZW5ndGgpIHtcblx0XHRpZiAoIWlzUHl0ZXN0V2FybmluZ1Rlc3RJZExpbmUobGluZXNbaV0pKSB7XG5cdFx0XHRlbnRyaWVzLnB1c2goeyB0eXBlOiAnbGluZScsIGxpbmU6IGxpbmVzW2ldIH0pO1xuXHRcdFx0aSArPSAxO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGVzdElkczogc3RyaW5nW10gPSBbXTtcblx0XHR3aGlsZSAoaSA8IGxpbmVzLmxlbmd0aCAmJiBpc1B5dGVzdFdhcm5pbmdUZXN0SWRMaW5lKGxpbmVzW2ldKSkge1xuXHRcdFx0dGVzdElkcy5wdXNoKGxpbmVzW2ldKTtcblx0XHRcdGkgKz0gMTtcblx0XHR9XG5cblx0XHRjb25zdCBib2R5OiBzdHJpbmdbXSA9IFtdO1xuXHRcdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoXG5cdFx0XHQmJiAhaXNQeXRlc3RXYXJuaW5nVGVzdElkTGluZShsaW5lc1tpXSlcblx0XHRcdCYmICFsaW5lc1tpXS5zdGFydHNXaXRoKCctLSBEb2NzOiAnKVxuXHRcdCkge1xuXHRcdFx0Ym9keS5wdXNoKGxpbmVzW2ldKTtcblx0XHRcdGkgKz0gMTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZVB5dGVzdFdhcm5pbmdCb2R5KGJvZHkpO1xuXHRcdGNvbnN0IGJsb2NrOiBQeXRlc3RXYXJuaW5nQmxvY2sgPSB7XG5cdFx0XHR0ZXN0SWRzLFxuXHRcdFx0Ym9keSxcblx0XHRcdGtleTogcGFyc2VkPy5rZXksXG5cdFx0XHR3YXJuaW5nQ2xhc3M6IHBhcnNlZD8ud2FybmluZ0NsYXNzLFxuXHRcdFx0bWVzc2FnZTogcGFyc2VkPy5tZXNzYWdlLFxuXHRcdH07XG5cdFx0aWYgKGJsb2NrLmtleSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBsaXN0ID0gZ3JvdXBzLmdldChibG9jay5rZXkpO1xuXHRcdFx0aWYgKGxpc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRsaXN0LnB1c2goYmxvY2spO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z3JvdXBzLnNldChibG9jay5rZXksIFtibG9ja10pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRlbnRyaWVzLnB1c2goeyB0eXBlOiAnYmxvY2snLCBibG9jayB9KTtcblx0fVxuXG5cdGNvbnN0IGVtaXR0ZWRHcm91cHM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IGNvbXBhY3RlZDogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0aWYgKGVudHJ5LnR5cGUgPT09ICdsaW5lJykge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2goZW50cnkubGluZSk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgYmxvY2sgPSBlbnRyeS5ibG9jaztcblx0XHRjb25zdCBncm91cCA9IGJsb2NrLmtleSAhPT0gdW5kZWZpbmVkID8gZ3JvdXBzLmdldChibG9jay5rZXkpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHNob3VsZEdyb3VwID0gZ3JvdXAgIT09IHVuZGVmaW5lZCAmJiAoZ3JvdXAubGVuZ3RoID4gMSB8fCBncm91cFswXS50ZXN0SWRzLmxlbmd0aCA+IDEpO1xuXHRcdGNvbnN0IGFscmVhZHlFbWl0dGVkID0gYmxvY2sua2V5ICE9PSB1bmRlZmluZWQgJiYgZW1pdHRlZEdyb3Vwcy5pbmNsdWRlcyhibG9jay5rZXkpO1xuXHRcdGlmICghc2hvdWxkR3JvdXAgfHwgYmxvY2sua2V5ID09PSB1bmRlZmluZWQgfHwgYWxyZWFkeUVtaXR0ZWQpIHtcblx0XHRcdGlmICghc2hvdWxkR3JvdXApIHtcblx0XHRcdFx0Y29tcGFjdGVkLnB1c2goLi4uZm9ybWF0UHl0ZXN0V2FybmluZ0Jsb2NrKGJsb2NrKSk7XG5cdFx0XHR9XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKGdyb3VwID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGVtaXR0ZWRHcm91cHMucHVzaChibG9jay5rZXkpO1xuXHRcdGNvbnN0IHRvdGFsVGVzdElkcyA9IGdyb3VwLnJlZHVjZSgoc3VtLCBpdGVtKSA9PiBzdW0gKyBpdGVtLnRlc3RJZHMubGVuZ3RoLCAwKTtcblx0XHRjb21wYWN0ZWQucHVzaChncm91cFswXS50ZXN0SWRzWzBdKTtcblx0XHRpZiAodG90YWxUZXN0SWRzID4gMSkge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2goYFtweXRlc3Qgd2FybmluZ3Mgc3VtbWFyeTogJHt0b3RhbFRlc3RJZHN9IHRlc3QgaWQgbGluZShzKSBzaGFyZSAke2Jsb2NrLndhcm5pbmdDbGFzcyA/PyAnd2FybmluZyd9OiAke2Jsb2NrLm1lc3NhZ2UgPz8gJyd9XWApO1xuXHRcdH1cblx0XHRjb21wYWN0ZWQucHVzaCguLi5ncm91cFswXS5ib2R5KTtcblx0XHRjb25zdCBkdXBsaWNhdGVCb2RpZXMgPSBncm91cC5sZW5ndGggLSAxO1xuXHRcdGlmIChkdXBsaWNhdGVCb2RpZXMgPiAwKSB7XG5cdFx0XHRjb25zdCBsb2NhdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZ3JvdXApIHtcblx0XHRcdFx0Y29uc3QgbG9jYXRpb24gPSBwYXJzZVB5dGVzdFdhcm5pbmdMb2NhdGlvbihpdGVtLmJvZHkpO1xuXHRcdFx0XHRpZiAobG9jYXRpb24gIT09IHVuZGVmaW5lZCAmJiAhbG9jYXRpb25zLmluY2x1ZGVzKGxvY2F0aW9uKSkge1xuXHRcdFx0XHRcdGxvY2F0aW9ucy5wdXNoKGxvY2F0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbG9jYXRpb25TdW1tYXJ5ID0gbG9jYXRpb25zLmxlbmd0aCA+IDEgPyBgIGZyb20gJHtsb2NhdGlvbnMubGVuZ3RofSBsb2NhdGlvbihzKWAgOiAnJztcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGBbcHl0ZXN0IHdhcm5pbmdzIHN1bW1hcnk6IG9taXR0ZWQgJHtkdXBsaWNhdGVCb2RpZXN9IGR1cGxpY2F0ZSB3YXJuaW5nIGJsb2NrKHMpJHtsb2NhdGlvblN1bW1hcnl9XWApO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gY29tcGFjdGVkO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRQeXRlc3RXYXJuaW5nQmxvY2soYmxvY2s6IFB5dGVzdFdhcm5pbmdCbG9jayk6IHN0cmluZ1tdIHtcblx0aWYgKGJsb2NrLnRlc3RJZHMubGVuZ3RoIDw9IDEpIHtcblx0XHRyZXR1cm4gWy4uLmJsb2NrLnRlc3RJZHMsIC4uLmJsb2NrLmJvZHldO1xuXHR9XG5cdGNvbnN0IGxpbmVzID0gW2Jsb2NrLnRlc3RJZHNbMF1dO1xuXHRsaW5lcy5wdXNoKGBbcHl0ZXN0IHdhcm5pbmdzIHN1bW1hcnk6IG9taXR0ZWQgJHtibG9jay50ZXN0SWRzLmxlbmd0aCAtIDF9IHRlc3QgaWQgbGluZShzKV1gKTtcblx0bGluZXMucHVzaCguLi5ibG9jay5ib2R5KTtcblx0cmV0dXJuIGxpbmVzO1xufVxuXG5pbnRlcmZhY2UgUGFyc2VkUHl0ZXN0V2FybmluZ0JvZHkge1xuXHRrZXk6IHN0cmluZztcblx0d2FybmluZ0NsYXNzOiBzdHJpbmc7XG5cdG1lc3NhZ2U6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gcGFyc2VQeXRlc3RXYXJuaW5nQm9keShib2R5OiByZWFkb25seSBzdHJpbmdbXSk6IFBhcnNlZFB5dGVzdFdhcm5pbmdCb2R5IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXlxccysuKz86XFxkKzpcXHMrKFtBLVphLXpfXVtBLVphLXowLTlfLl0qV2FybmluZyk6XFxzKyguKykkYCk7XG5cdGZvciAoY29uc3QgbGluZSBvZiBib2R5KSB7XG5cdFx0Y29uc3QgY2FwdHVyZXMgPSByZWdleC5leGVjKGxpbmUpO1xuXHRcdGlmIChjYXB0dXJlcyA9PT0gbnVsbCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IHdhcm5pbmdDbGFzcyA9IGNhcHR1cmVzWzFdO1xuXHRcdGNvbnN0IG1lc3NhZ2VSYXcgPSBjYXB0dXJlc1syXTtcblx0XHRpZiAod2FybmluZ0NsYXNzID09PSB1bmRlZmluZWQgfHwgbWVzc2FnZVJhdyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBtZXNzYWdlID0gbm9ybWFsaXplUHl0ZXN0V2FybmluZ01lc3NhZ2UobWVzc2FnZVJhdyk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtleTogYCR7d2FybmluZ0NsYXNzfVxcMCR7bWVzc2FnZX1gLFxuXHRcdFx0d2FybmluZ0NsYXNzLFxuXHRcdFx0bWVzc2FnZSxcblx0XHR9O1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHBhcnNlUHl0ZXN0V2FybmluZ0xvY2F0aW9uKGJvZHk6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Zm9yIChjb25zdCBsaW5lIG9mIGJvZHkpIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IHJlZ2V4Q2FwdHVyZUZpcnN0KFxuXHRcdFx0U3RyaW5nLnJhd2BeXFxzKyguKz86XFxkKyk6XFxzK1tBLVphLXpfXVtBLVphLXowLTlfLl0qV2FybmluZzpcXHMrLiskYCxcblx0XHRcdGxpbmUsXG5cdFx0KTtcblx0XHRpZiAobG9jYXRpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGxvY2F0aW9uO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVQeXRlc3RXYXJuaW5nTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gc3BsaXRXaGl0ZXNwYWNlKG1lc3NhZ2UpLmpvaW4oJyAnKTtcbn1cblxuZnVuY3Rpb24gaXNQeXRlc3RXYXJuaW5nVGVzdElkTGluZShsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgdHJpbW1lZCA9IGxpbmUudHJpbUVuZCgpO1xuXHRyZXR1cm4gbGluZSA9PT0gdHJpbW1lZFxuXHRcdCYmICgoIXRyaW1tZWQuaW5jbHVkZXMoJyAnKVxuXHRcdFx0JiYgKHRyaW1tZWQuaW5jbHVkZXMoJy5weTo6JykgfHwgcmVnZXhUZXN0KFN0cmluZy5yYXdgXlxcUytcXC5weTpcXGQrJGAsIHRyaW1tZWQpKSlcblx0XHRcdHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YF5cXFMrXFwucHk6XFxzK1xcZCsgd2FybmluZ3M/JGAsIHRyaW1tZWQpKTtcbn1cblxuZnVuY3Rpb24gY29tcGFjdEdyZXBDb250ZW50T3V0cHV0KG91dHB1dDogc3RyaW5nLCBsYXJnZU91dHB1dFRocmVzaG9sZDogbnVtYmVyKTogVG9vbENvbXBhY3Rpb25SZXN1bHQge1xuXHRjb25zdCBsaW5lcyA9IHNwbGl0VG9vbE91dHB1dExpbmVzKG91dHB1dCk7XG5cdGlmIChzaG91bGRTa2lwVG9vbE91dHB1dENvbXBhY3Rpb24obGluZXMsIG91dHB1dCwgOCkpIHtcblx0XHRyZXR1cm4gdW5jaGFuZ2VkKG91dHB1dCk7XG5cdH1cblxuXHRjb25zdCBncmVwTGluZXMgPSBsaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lICE9PSAnLS0nKTtcblx0Y29uc3QgcGFyc2VkTWF0Y2hlczogR3JlcENvbnRlbnRNYXRjaFtdID0gW107XG5cdGZvciAoY29uc3QgbGluZSBvZiBncmVwTGluZXMpIHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUdyZXBDb250ZW50TGluZShsaW5lKTtcblx0XHRpZiAocGFyc2VkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHBhcnNlZE1hdGNoZXMucHVzaChwYXJzZWQpO1xuXHRcdH1cblx0fVxuXHRpZiAocGFyc2VkTWF0Y2hlcy5sZW5ndGggPCA4IHx8IChwYXJzZWRNYXRjaGVzLmxlbmd0aCA8IDIwICYmIGpzU3RyaW5nTGVuKG91dHB1dCkgPCA0MDAwKSkge1xuXHRcdHJldHVybiB1bmNoYW5nZWQob3V0cHV0KTtcblx0fVxuXHRpZiAocGFyc2VkTWF0Y2hlcy5sZW5ndGggIT09IGdyZXBMaW5lcy5sZW5ndGhcblx0XHQmJiAoZml0c0xhcmdlT3V0cHV0VGhyZXNob2xkKG91dHB1dCwgbGFyZ2VPdXRwdXRUaHJlc2hvbGQpXG5cdFx0XHR8fCAocGFyc2VkTWF0Y2hlcy5sZW5ndGggLyBncmVwTGluZXMubGVuZ3RoKSA8IDAuNilcblx0KSB7XG5cdFx0cmV0dXJuIHVuY2hhbmdlZChvdXRwdXQpO1xuXHR9XG5cblx0Y29uc3Qgc29ydGVkR3JvdXBzID0gZ3JlcENvbnRlbnRHcm91cHMocGFyc2VkTWF0Y2hlcyk7XG5cdGNvbnN0IGNvbW1vblByZWZpeCA9IGNvbW1vbkRpcmVjdG9yeVByZWZpeChwYXJzZWRNYXRjaGVzLm1hcChtID0+IG0ucGF0aCkpO1xuXHRjb25zdCBib2R5QnVkZ2V0ID0gY29tcGFjdGVkQm9keUJ1ZGdldChsYXJnZU91dHB1dFRocmVzaG9sZCk7XG5cdGNvbnN0IGxvc3NsZXNzID0gcmVuZGVyR3JlcENvbnRlbnRHcm91cHMoc29ydGVkR3JvdXBzLCBjb21tb25QcmVmaXgsIHNvcnRlZEdyb3Vwcy5sZW5ndGgsIGluZGV4QWxsKTtcblxuXHRpZiAoYnl0ZUxlbmd0aChsb3NzbGVzcykgPj0gYnl0ZUxlbmd0aChvdXRwdXQpICYmIGZpdHNMYXJnZU91dHB1dFRocmVzaG9sZChvdXRwdXQsIGxhcmdlT3V0cHV0VGhyZXNob2xkKSkge1xuXHRcdHJldHVybiB1bmNoYW5nZWQob3V0cHV0KTtcblx0fVxuXHRpZiAoZml0c0xhcmdlT3V0cHV0VGhyZXNob2xkKGxvc3NsZXNzLCBsYXJnZU91dHB1dFRocmVzaG9sZCkpIHtcblx0XHRyZXR1cm4geyBvdXRwdXQ6IGxvc3NsZXNzLCBsb3NzbGVzczogdHJ1ZSB9O1xuXHR9XG5cblx0Y29uc3QgYWdncmVzc2l2ZSA9IHJlbmRlckdyZXBDb250ZW50R3JvdXBzKHNvcnRlZEdyb3VwcywgY29tbW9uUHJlZml4LCAxMiwgc2VsZWN0SGVhZFRhaWxUb1Nob3cpO1xuXHRpZiAoZml0c0xhcmdlT3V0cHV0VGhyZXNob2xkKGFnZ3Jlc3NpdmUsIGJvZHlCdWRnZXQpKSB7XG5cdFx0cmV0dXJuIGxvc3N5KGFnZ3Jlc3NpdmUpO1xuXHR9XG5cblx0Y29uc3QgZmFsbGJhY2sgPSByZW5kZXJCdWRnZXRlZEdyZXBDb250ZW50R3JvdXBzKHNvcnRlZEdyb3VwcywgY29tbW9uUHJlZml4LCBsYXJnZU91dHB1dFRocmVzaG9sZCk7XG5cdGlmIChieXRlTGVuZ3RoKGZhbGxiYWNrKSA8IGJ5dGVMZW5ndGgoYWdncmVzc2l2ZSkpIHtcblx0XHRyZXR1cm4gbG9zc3koZmFsbGJhY2spO1xuXHR9XG5cdHJldHVybiBsb3NzeShhZ2dyZXNzaXZlKTtcbn1cblxuZnVuY3Rpb24gZ3JlcENvbnRlbnRHcm91cHMobWF0Y2hlczogcmVhZG9ubHkgR3JlcENvbnRlbnRNYXRjaFtdKTogW3N0cmluZywgR3JlcENvbnRlbnRNYXRjaFtdXVtdIHtcblx0Y29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIEdyZXBDb250ZW50TWF0Y2hbXT4oKTtcblx0Zm9yIChjb25zdCBtIG9mIG1hdGNoZXMpIHtcblx0XHRjb25zdCBsaXN0ID0gZ3JvdXBzLmdldChtLnBhdGgpO1xuXHRcdGlmIChsaXN0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGxpc3QucHVzaChtKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Z3JvdXBzLnNldChtLnBhdGgsIFttXSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBbLi4uZ3JvdXBzLmVudHJpZXMoKV07XG59XG5cbnR5cGUgU2VsZWN0R3JlcE1hdGNoZXMgPSAobWF0Y2hlczogcmVhZG9ubHkgR3JlcENvbnRlbnRNYXRjaFtdKSA9PiBJbmRleGVkPEdyZXBDb250ZW50TWF0Y2g+W107XG5cbmZ1bmN0aW9uIHJlbmRlckdyZXBDb250ZW50R3JvdXBzKFxuXHRzb3J0ZWRHcm91cHM6IHJlYWRvbmx5IFtzdHJpbmcsIEdyZXBDb250ZW50TWF0Y2hbXV1bXSxcblx0Y29tbW9uUHJlZml4OiBzdHJpbmcsXG5cdG1heEdyb3VwczogbnVtYmVyLFxuXHRzZWxlY3RNYXRjaGVzOiBTZWxlY3RHcmVwTWF0Y2hlcyxcbik6IHN0cmluZyB7XG5cdGNvbnN0IHRvdGFsTWF0Y2hlcyA9IHRvdGFsR3JvdXBJdGVtcyhzb3J0ZWRHcm91cHMpO1xuXHRjb25zdCBjb21wYWN0ZWQ6IHN0cmluZ1tdID0gW107XG5cdGNvbXBhY3RlZC5wdXNoKGBbZ3JlcCBjb250ZW50OiAke3RvdGFsTWF0Y2hlc30gbWF0Y2hlcyBhY3Jvc3MgJHtzb3J0ZWRHcm91cHMubGVuZ3RofSBmaWxlKHMpJHtjb21tb25QcmVmaXgubGVuZ3RoID09PSAwID8gJycgOiBgIHVuZGVyICR7Y29tbW9uUHJlZml4fWB9XWApO1xuXHRmb3IgKGNvbnN0IFtmaWxlUGF0aCwgZmlsZU1hdGNoZXNdIG9mIHNvcnRlZEdyb3Vwcy5zbGljZSgwLCBtYXhHcm91cHMpKSB7XG5cdFx0Y29uc3QgZGlzcGxheVBhdGggPSBkaXNwbGF5UGF0aFVuZGVyUHJlZml4KGZpbGVQYXRoLCBjb21tb25QcmVmaXgpO1xuXHRcdGlmIChmaWxlTWF0Y2hlcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdGNvbXBhY3RlZC5wdXNoKGAke2Rpc3BsYXlQYXRofToke2Zvcm1hdEdyZXBNYXRjaChmaWxlTWF0Y2hlc1swXSl9YCk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29tcGFjdGVkLnB1c2goJycpO1xuXHRcdGNvbXBhY3RlZC5wdXNoKGAke2Rpc3BsYXlQYXRofSAoJHtmaWxlTWF0Y2hlcy5sZW5ndGh9IG1hdGNoKGVzKSk6YCk7XG5cdFx0Y29uc3Qgc2hvd24gPSBzZWxlY3RNYXRjaGVzKGZpbGVNYXRjaGVzKTtcblx0XHRsZXQgcHJldmlvdXNJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgeyBpdGVtOiBtLCBpbmRleCB9IG9mIHNob3duKSB7XG5cdFx0XHRpZiAocHJldmlvdXNJbmRleCAhPT0gdW5kZWZpbmVkICYmIGluZGV4ID4gcHJldmlvdXNJbmRleCArIDEpIHtcblx0XHRcdFx0Y29tcGFjdGVkLnB1c2goYCAgLi4uICR7aW5kZXggLSBwcmV2aW91c0luZGV4IC0gMX0gbW9yZSBtYXRjaChlcykgb21pdHRlZCBpbiB0aGlzIGZpbGVgKTtcblx0XHRcdH1cblx0XHRcdGNvbXBhY3RlZC5wdXNoKGAgICR7Zm9ybWF0R3JlcE1hdGNoKG0pfWApO1xuXHRcdFx0cHJldmlvdXNJbmRleCA9IGluZGV4O1xuXHRcdH1cblx0XHRjb25zdCBvbWl0dGVkQWZ0ZXJMYXN0ID0gcHJldmlvdXNJbmRleCAhPT0gdW5kZWZpbmVkXG5cdFx0XHQ/IHNhdHVyYXRpbmdTdWIoZmlsZU1hdGNoZXMubGVuZ3RoLCBwcmV2aW91c0luZGV4ICsgMSlcblx0XHRcdDogZmlsZU1hdGNoZXMubGVuZ3RoO1xuXHRcdGlmIChvbWl0dGVkQWZ0ZXJMYXN0ID4gMCkge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2goYCAgLi4uICR7b21pdHRlZEFmdGVyTGFzdH0gbW9yZSBtYXRjaChlcykgb21pdHRlZCBpbiB0aGlzIGZpbGVgKTtcblx0XHR9XG5cdH1cblx0aWYgKHNvcnRlZEdyb3Vwcy5sZW5ndGggPiBtYXhHcm91cHMpIHtcblx0XHRjb25zdCBvbWl0dGVkTWF0Y2hlcyA9IHRvdGFsR3JvdXBJdGVtcyhzb3J0ZWRHcm91cHMuc2xpY2UobWF4R3JvdXBzKSk7XG5cdFx0Y29tcGFjdGVkLnB1c2goJycpO1xuXHRcdGNvbXBhY3RlZC5wdXNoKGBbb21pdHRlZCAke29taXR0ZWRNYXRjaGVzfSBtYXRjaChlcykgaW4gJHtzb3J0ZWRHcm91cHMubGVuZ3RoIC0gbWF4R3JvdXBzfSBmaWxlKHMpOyBzZWUgb3JpZ2luYWwgb3V0cHV0IGZvciBmdWxsIHJlc3VsdHNdYCk7XG5cdH1cblxuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5pbnRlcmZhY2UgR3JlcENvbnRlbnRNYXRjaCB7XG5cdHBhdGg6IHN0cmluZztcblx0bGluZU51bWJlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRzZXBhcmF0b3I6IHN0cmluZztcblx0dGV4dDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBwYXJzZUdyZXBDb250ZW50TGluZShsaW5lOiBzdHJpbmcpOiBHcmVwQ29udGVudE1hdGNoIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbnVtYmVyZWQgPSBwYXJzZU51bWJlcmVkR3JlcENvbnRlbnRMaW5lKGxpbmUpO1xuXHRpZiAobnVtYmVyZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBudW1iZXJlZDtcblx0fVxuXG5cdGNvbnN0IHNlcGFyYXRvckluZGV4ID0gbGluZS5pbmRleE9mKCc6Jyk7XG5cdGlmIChzZXBhcmF0b3JJbmRleCA8IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChzZXBhcmF0b3JJbmRleCA9PT0gMCB8fCBzZXBhcmF0b3JJbmRleCA9PT0gbGluZS5sZW5ndGggLSAxKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBwYXRoID0gbGluZS5zbGljZSgwLCBzZXBhcmF0b3JJbmRleCk7XG5cdGlmICghbG9va3NMaWtlR3JlcFBhdGgocGF0aCkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRwYXRoOiBub3JtYWxpemVEaXNwbGF5UGF0aFNlcGFyYXRvcnMocGF0aCksXG5cdFx0bGluZU51bWJlcjogdW5kZWZpbmVkLFxuXHRcdHNlcGFyYXRvcjogJzonLFxuXHRcdHRleHQ6IGxpbmUuc2xpY2Uoc2VwYXJhdG9ySW5kZXggKyAxKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gcGFyc2VOdW1iZXJlZEdyZXBDb250ZW50TGluZShsaW5lOiBzdHJpbmcpOiBHcmVwQ29udGVudE1hdGNoIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgYnl0ZXMgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUobGluZSk7XG5cdGNvbnN0IGRlY29kZXIgPSBuZXcgVGV4dERlY29kZXIoKTtcblx0Y29uc3Qgc2xpY2VTdHIgPSAoc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIpOiBzdHJpbmcgPT4gZGVjb2Rlci5kZWNvZGUoYnl0ZXMuc3ViYXJyYXkoc3RhcnQsIGVuZCkpO1xuXHRjb25zdCBpc0FzY2lpRGlnaXRCeXRlID0gKGJ5dGU6IG51bWJlcik6IGJvb2xlYW4gPT4gYnl0ZSA+PSAweDMwICYmIGJ5dGUgPD0gMHgzOTtcblx0Y29uc3QgY29sb24gPSAweDNBO1xuXHRjb25zdCBkYXNoID0gMHgyRDtcblx0Y29uc3QgdXBwZXJCb3VuZCA9IHNhdHVyYXRpbmdTdWIoYnl0ZXMubGVuZ3RoLCAyKTtcblx0Zm9yIChsZXQgaSA9IDE7IGkgPCB1cHBlckJvdW5kOyBpKyspIHtcblx0XHRjb25zdCBwYXRoU2VwYXJhdG9yID0gYnl0ZXNbaV07XG5cdFx0aWYgKHBhdGhTZXBhcmF0b3IgIT09IGNvbG9uICYmIHBhdGhTZXBhcmF0b3IgIT09IGRhc2gpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBudW1iZXJTdGFydCA9IGkgKyAxO1xuXHRcdGxldCBudW1iZXJFbmQgPSBudW1iZXJTdGFydDtcblx0XHR3aGlsZSAobnVtYmVyRW5kIDwgYnl0ZXMubGVuZ3RoICYmIGlzQXNjaWlEaWdpdEJ5dGUoYnl0ZXNbbnVtYmVyRW5kXSkpIHtcblx0XHRcdG51bWJlckVuZCArPSAxO1xuXHRcdH1cblx0XHRpZiAobnVtYmVyRW5kID09PSBudW1iZXJTdGFydCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChudW1iZXJFbmQgPj0gYnl0ZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZXBhcmF0b3IgPSBieXRlc1tudW1iZXJFbmRdO1xuXHRcdGlmIChzZXBhcmF0b3IgIT09IGNvbG9uICYmIHNlcGFyYXRvciAhPT0gZGFzaCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IHBhdGggPSBzbGljZVN0cigwLCBpKTtcblx0XHRpZiAoIWxvb2tzTGlrZUdyZXBQYXRoKHBhdGgpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHBhdGg6IG5vcm1hbGl6ZURpc3BsYXlQYXRoU2VwYXJhdG9ycyhwYXRoKSxcblx0XHRcdGxpbmVOdW1iZXI6IHNsaWNlU3RyKG51bWJlclN0YXJ0LCBudW1iZXJFbmQpLFxuXHRcdFx0c2VwYXJhdG9yOiBTdHJpbmcuZnJvbUNoYXJDb2RlKHNlcGFyYXRvciksXG5cdFx0XHR0ZXh0OiBzbGljZVN0cihudW1iZXJFbmQgKyAxLCBieXRlcy5sZW5ndGgpLFxuXHRcdH07XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gbG9va3NMaWtlR3JlcFBhdGgocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBwYXRoLmluY2x1ZGVzKCcvJykgfHwgcGF0aC5pbmNsdWRlcygnXFxcXCcpIHx8IHJlZ2V4VGVzdChTdHJpbmcucmF3YFxcLltBLVphLXowLTlfLV0rJGAsIHBhdGgpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJCdWRnZXRlZEdyZXBDb250ZW50R3JvdXBzKFxuXHRzb3J0ZWRHcm91cHM6IHJlYWRvbmx5IFtzdHJpbmcsIEdyZXBDb250ZW50TWF0Y2hbXV1bXSxcblx0Y29tbW9uUHJlZml4OiBzdHJpbmcsXG5cdGxhcmdlT3V0cHV0VGhyZXNob2xkOiBudW1iZXIsXG4pOiBzdHJpbmcge1xuXHRjb25zdCBidWRnZXQgPSBjb21wYWN0ZWRCb2R5QnVkZ2V0KGxhcmdlT3V0cHV0VGhyZXNob2xkKTtcblx0bGV0IHNtYWxsZXN0ID0gcmVuZGVyQnVkZ2V0ZWRHcmVwQ29udGVudEdyb3Vwc1dpdGhMaW1pdChzb3J0ZWRHcm91cHMsIGNvbW1vblByZWZpeCwgMSwgMSk7XG5cdGZvciAoY29uc3QgbWF4R3JvdXBzIG9mIFsxMCwgOCwgNiwgNCwgMiwgMV0pIHtcblx0XHRmb3IgKGNvbnN0IG1heE1hdGNoZXNQZXJHcm91cCBvZiBbMTIsIDYsIDMsIDFdKSB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGUgPSByZW5kZXJCdWRnZXRlZEdyZXBDb250ZW50R3JvdXBzV2l0aExpbWl0KFxuXHRcdFx0XHRzb3J0ZWRHcm91cHMsXG5cdFx0XHRcdGNvbW1vblByZWZpeCxcblx0XHRcdFx0bWF4R3JvdXBzLFxuXHRcdFx0XHRtYXhNYXRjaGVzUGVyR3JvdXAsXG5cdFx0XHQpO1xuXHRcdFx0aWYgKGZpdHNMYXJnZU91dHB1dFRocmVzaG9sZChjYW5kaWRhdGUsIGJ1ZGdldCkpIHtcblx0XHRcdFx0cmV0dXJuIGNhbmRpZGF0ZTtcblx0XHRcdH1cblx0XHRcdHNtYWxsZXN0ID0gY2FuZGlkYXRlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gc21hbGxlc3Q7XG59XG5cbmZ1bmN0aW9uIHJlbmRlckJ1ZGdldGVkR3JlcENvbnRlbnRHcm91cHNXaXRoTGltaXQoXG5cdHNvcnRlZEdyb3VwczogcmVhZG9ubHkgW3N0cmluZywgR3JlcENvbnRlbnRNYXRjaFtdXVtdLFxuXHRjb21tb25QcmVmaXg6IHN0cmluZyxcblx0bWF4R3JvdXBzOiBudW1iZXIsXG5cdG1heE1hdGNoZXNQZXJHcm91cDogbnVtYmVyLFxuKTogc3RyaW5nIHtcblx0Y29uc3QgdG90YWxNYXRjaGVzID0gdG90YWxHcm91cEl0ZW1zKHNvcnRlZEdyb3Vwcyk7XG5cdGNvbnN0IGNvbXBhY3RlZDogc3RyaW5nW10gPSBbXTtcblx0Y29tcGFjdGVkLnB1c2goYFtncmVwIGNvbnRlbnQ6ICR7dG90YWxNYXRjaGVzfSBtYXRjaGVzIGFjcm9zcyAke3NvcnRlZEdyb3Vwcy5sZW5ndGh9IGZpbGUocykke2NvbW1vblByZWZpeC5sZW5ndGggPT09IDAgPyAnJyA6IGAgdW5kZXIgJHt0cnVuY2F0ZVBhdGhNaWRkbGUoY29tbW9uUHJlZml4LCBDT01NT05fUFJFRklYX0RJU1BMQVlfV0lEVEgpfWB9OyBjb21wYWN0IHN1bW1hcnldYCk7XG5cdGZvciAoY29uc3QgW2ZpbGVQYXRoLCBmaWxlTWF0Y2hlc10gb2Ygc29ydGVkR3JvdXBzLnNsaWNlKDAsIG1heEdyb3VwcykpIHtcblx0XHRjb21wYWN0ZWQucHVzaChmb3JtYXRCdWRnZXRlZEdyZXBHcm91cChmaWxlUGF0aCwgZmlsZU1hdGNoZXMsIGNvbW1vblByZWZpeCwgbWF4TWF0Y2hlc1Blckdyb3VwKSk7XG5cdH1cblx0aWYgKHNvcnRlZEdyb3Vwcy5sZW5ndGggPiBtYXhHcm91cHMpIHtcblx0XHRjb25zdCBvbWl0dGVkTWF0Y2hlcyA9IHRvdGFsR3JvdXBJdGVtcyhzb3J0ZWRHcm91cHMuc2xpY2UobWF4R3JvdXBzKSk7XG5cdFx0Y29tcGFjdGVkLnB1c2goYFtvbWl0dGVkICR7b21pdHRlZE1hdGNoZXN9IG1hdGNoKGVzKSBpbiAke3NvcnRlZEdyb3Vwcy5sZW5ndGggLSBtYXhHcm91cHN9IGZpbGUocyldYCk7XG5cdH1cblxuXHRjb25zdCBleHRlbnNpb25TdW1tYXJ5ID0gc3VtbWFyaXplRXh0ZW5zaW9ucyhzb3J0ZWRHcm91cHMubWFwKChbZmlsZVBhdGhdKSA9PiBmaWxlUGF0aCkpO1xuXHRpZiAoZXh0ZW5zaW9uU3VtbWFyeS5sZW5ndGggIT09IDApIHtcblx0XHRjb21wYWN0ZWQucHVzaChgW2V4dGVuc2lvbnM6ICR7dHJ1bmNhdGVJbmxpbmVUZXh0KGV4dGVuc2lvblN1bW1hcnksIEVYVEVOU0lPTl9TVU1NQVJZX0lOTElORV9XSURUSCl9XWApO1xuXHR9XG5cblx0cmV0dXJuIGNvbXBhY3RlZC5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gZm9ybWF0QnVkZ2V0ZWRHcmVwR3JvdXAoXG5cdGZpbGVQYXRoOiBzdHJpbmcsXG5cdGZpbGVNYXRjaGVzOiByZWFkb25seSBHcmVwQ29udGVudE1hdGNoW10sXG5cdGNvbW1vblByZWZpeDogc3RyaW5nLFxuXHRtYXhNYXRjaGVzOiBudW1iZXIsXG4pOiBzdHJpbmcge1xuXHRjb25zdCBkaXNwbGF5UGF0aCA9IHRydW5jYXRlUGF0aE1pZGRsZShkaXNwbGF5UGF0aFVuZGVyUHJlZml4KGZpbGVQYXRoLCBjb21tb25QcmVmaXgpLCAxNDApO1xuXHRjb25zdCBzaG93biA9IHNlbGVjdEV2ZW5seVNwYWNlZEdyZXBNYXRjaGVzKGZpbGVNYXRjaGVzLCBtYXhNYXRjaGVzKTtcblx0Y29uc3QgbGluZXMgPSBbYCR7ZGlzcGxheVBhdGh9ICgke2ZpbGVNYXRjaGVzLmxlbmd0aH0gbWF0Y2goZXMpKTpgXTtcblx0Zm9yIChjb25zdCB7IGl0ZW06IG0gfSBvZiBzaG93bikge1xuXHRcdGxpbmVzLnB1c2goYCAgJHtleGNlcnB0SW5saW5lVGV4dChmb3JtYXRHcmVwTWF0Y2gobSksIDE4MCl9YCk7XG5cdH1cblx0aWYgKGZpbGVNYXRjaGVzLmxlbmd0aCA+IHNob3duLmxlbmd0aCkge1xuXHRcdGxpbmVzLnB1c2goYCAgLi4uICR7ZmlsZU1hdGNoZXMubGVuZ3RoIC0gc2hvd24ubGVuZ3RofSBtb3JlIG1hdGNoKGVzKSBvbWl0dGVkIGluIHRoaXMgZmlsZWApO1xuXHR9XG5cdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gc2VsZWN0RXZlbmx5U3BhY2VkR3JlcE1hdGNoZXMoXG5cdG1hdGNoZXM6IHJlYWRvbmx5IEdyZXBDb250ZW50TWF0Y2hbXSxcblx0bWF4TWF0Y2hlczogbnVtYmVyLFxuKTogSW5kZXhlZDxHcmVwQ29udGVudE1hdGNoPltdIHtcblx0aWYgKG1hdGNoZXMubGVuZ3RoIDw9IG1heE1hdGNoZXMpIHtcblx0XHRyZXR1cm4gaW5kZXhBbGwobWF0Y2hlcyk7XG5cdH1cblx0aWYgKG1heE1hdGNoZXMgPD0gMSkge1xuXHRcdHJldHVybiBbeyBpdGVtOiBtYXRjaGVzWzBdLCBpbmRleDogMCB9XTtcblx0fVxuXHRjb25zdCBzZWxlY3RlZDogSW5kZXhlZDxHcmVwQ29udGVudE1hdGNoPltdID0gW107XG5cdGNvbnN0IHNlZW46IG51bWJlcltdID0gW107XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbWF4TWF0Y2hlczsgaSsrKSB7XG5cdFx0Y29uc3QgaW5kZXggPSBNYXRoLnJvdW5kKChpICogKG1hdGNoZXMubGVuZ3RoIC0gMSkpIC8gKG1heE1hdGNoZXMgLSAxKSk7XG5cdFx0aWYgKCFzZWVuLmluY2x1ZGVzKGluZGV4KSkge1xuXHRcdFx0c2Vlbi5wdXNoKGluZGV4KTtcblx0XHRcdHNlbGVjdGVkLnB1c2goeyBpbmRleCwgaXRlbTogbWF0Y2hlc1tpbmRleF0gfSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBzZWxlY3RlZDtcbn1cblxuZnVuY3Rpb24gZm9ybWF0R3JlcE1hdGNoKG06IEdyZXBDb250ZW50TWF0Y2gpOiBzdHJpbmcge1xuXHRpZiAobS5saW5lTnVtYmVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gYCR7bS5saW5lTnVtYmVyfSR7bS5zZXBhcmF0b3J9ICR7bS50ZXh0fWA7XG5cdH1cblx0cmV0dXJuIGAgJHttLnRleHR9YDtcbn1cblxuZnVuY3Rpb24gY29tcGFjdEdyZXBDb3VudE91dHB1dChvdXRwdXQ6IHN0cmluZyk6IFRvb2xDb21wYWN0aW9uUmVzdWx0IHtcblx0Y29uc3QgVE9QX0NPVU5UX1JPV1MgPSAyMDtcblxuXHRjb25zdCBsaW5lcyA9IHNwbGl0VG9vbE91dHB1dExpbmVzKG91dHB1dCk7XG5cdGlmIChzaG91bGRTa2lwVG9vbE91dHB1dENvbXBhY3Rpb24obGluZXMsIG91dHB1dCwgMzApKSB7XG5cdFx0cmV0dXJuIHVuY2hhbmdlZChvdXRwdXQpO1xuXHR9XG5cblx0Y29uc3QgcGFyc2VkQ291bnRzOiBHcmVwQ291bnRNYXRjaFtdID0gW107XG5cdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlR3JlcENvdW50TGluZShsaW5lKTtcblx0XHRpZiAocGFyc2VkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHBhcnNlZENvdW50cy5wdXNoKHBhcnNlZCk7XG5cdFx0fVxuXHR9XG5cdGlmIChwYXJzZWRDb3VudHMubGVuZ3RoIDwgMzAgfHwgKHBhcnNlZENvdW50cy5sZW5ndGggLyBsaW5lcy5sZW5ndGgpIDwgMC44KSB7XG5cdFx0cmV0dXJuIHVuY2hhbmdlZChvdXRwdXQpO1xuXHR9XG5cblx0bGV0IHRvdGFsTWF0Y2hlcyA9IDA7XG5cdGZvciAoY29uc3QgbSBvZiBwYXJzZWRDb3VudHMpIHtcblx0XHR0b3RhbE1hdGNoZXMgKz0gbS5jb3VudDtcblx0fVxuXHRjb25zdCBzb3J0ZWRDb3VudHMgPSBbLi4ucGFyc2VkQ291bnRzXTtcblx0c29ydGVkQ291bnRzLnNvcnQoKGEsIGIpID0+IChiLmNvdW50IC0gYS5jb3VudCkgfHwgY29tcGFyZVN0cmluZ3MoYS5wYXRoLCBiLnBhdGgpKTtcblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtgW2dyZXAgY291bnQ6ICR7dG90YWxNYXRjaGVzfSBtYXRjaChlcykgYWNyb3NzICR7cGFyc2VkQ291bnRzLmxlbmd0aH0gZmlsZShzKSB3aXRoIG1hdGNoZXNdYF07XG5cblx0Y29tcGFjdGVkLnB1c2goJycpO1xuXHRjb21wYWN0ZWQucHVzaCgnVG9wIGZpbGVzIGJ5IG1hdGNoIGNvdW50OicpO1xuXHRmb3IgKGNvbnN0IG0gb2Ygc29ydGVkQ291bnRzLnNsaWNlKDAsIFRPUF9DT1VOVF9ST1dTKSkge1xuXHRcdGNvbXBhY3RlZC5wdXNoKGAgICR7U3RyaW5nKG0uY291bnQpLnBhZFN0YXJ0KDYpfSAgJHttLnBhdGh9YCk7XG5cdH1cblx0aWYgKHNvcnRlZENvdW50cy5sZW5ndGggPiBUT1BfQ09VTlRfUk9XUykge1xuXHRcdGNvbXBhY3RlZC5wdXNoKGAgIC4uLiAke3NvcnRlZENvdW50cy5sZW5ndGggLSBUT1BfQ09VTlRfUk9XU30gbW9yZSBmaWxlKHMpIG9taXR0ZWRgKTtcblx0fVxuXG5cdGNvbnN0IGRpcmVjdG9yeUNvdW50cyA9IHN1bW1hcml6ZUNvdW50RGlyZWN0b3JpZXMocGFyc2VkQ291bnRzKTtcblx0aWYgKGRpcmVjdG9yeUNvdW50cy5sZW5ndGggIT09IDApIHtcblx0XHRjb21wYWN0ZWQucHVzaCgnJyk7XG5cdFx0Y29tcGFjdGVkLnB1c2goJ1RvcCBkaXJlY3RvcmllcyBieSBtYXRjaCBjb3VudDonKTtcblx0XHRmb3IgKGNvbnN0IHN1bW1hcnkgb2YgZGlyZWN0b3J5Q291bnRzLnNsaWNlKDAsIFRPUF9DT1VOVF9ST1dTKSkge1xuXHRcdFx0Y29tcGFjdGVkLnB1c2goYCAgJHtTdHJpbmcoc3VtbWFyeS5jb3VudCkucGFkU3RhcnQoNil9IGluICR7c3VtbWFyeS5maWxlc30gZmlsZShzKSAgJHtzdW1tYXJ5LmRpcmVjdG9yeX1gKTtcblx0XHR9XG5cdFx0aWYgKGRpcmVjdG9yeUNvdW50cy5sZW5ndGggPiBUT1BfQ09VTlRfUk9XUykge1xuXHRcdFx0Y29uc3Qgb21pdHRlZERpcmVjdG9yaWVzID0gZGlyZWN0b3J5Q291bnRzLmxlbmd0aCAtIFRPUF9DT1VOVF9ST1dTO1xuXHRcdFx0Y29tcGFjdGVkLnB1c2goYCAgLi4uICR7b21pdHRlZERpcmVjdG9yaWVzfSBtb3JlIGRpcmVjdG9yJHtvbWl0dGVkRGlyZWN0b3JpZXMgPT09IDEgPyAneScgOiAnaWVzJ30gb21pdHRlZGApO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGV4dGVuc2lvblN1bW1hcnkgPSBzdW1tYXJpemVFeHRlbnNpb25zKHBhcnNlZENvdW50cy5tYXAobSA9PiBtLnBhdGgpKTtcblx0aWYgKGV4dGVuc2lvblN1bW1hcnkubGVuZ3RoICE9PSAwKSB7XG5cdFx0Y29tcGFjdGVkLnB1c2goJycpO1xuXHRcdGNvbXBhY3RlZC5wdXNoKGBbZXh0ZW5zaW9uczogJHtleHRlbnNpb25TdW1tYXJ5fV1gKTtcblx0fVxuXG5cdHJldHVybiBsb3NzeShjb21wYWN0ZWQuam9pbignXFxuJykpO1xufVxuXG5pbnRlcmZhY2UgR3JlcENvdW50TWF0Y2gge1xuXHRwYXRoOiBzdHJpbmc7XG5cdGNvdW50OiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIHBhcnNlR3JlcENvdW50TGluZShsaW5lOiBzdHJpbmcpOiBHcmVwQ291bnRNYXRjaCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHNwbGl0ID0gcnNwbGl0T25jZShsaW5lLCAnOicpO1xuXHRpZiAoc3BsaXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgW3BhdGgsIGNvdW50XSA9IHNwbGl0O1xuXHRpZiAocGF0aC5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHBhcnNlZCA9IHBhcnNlVXNpemUoY291bnQpO1xuXHRpZiAocGFyc2VkID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7IHBhdGgsIGNvdW50OiBwYXJzZWQgfTtcbn1cblxuaW50ZXJmYWNlIERpcmVjdG9yeUNvdW50IHtcblx0ZGlyZWN0b3J5OiBzdHJpbmc7XG5cdGNvdW50OiBudW1iZXI7XG5cdGZpbGVzOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIHN1bW1hcml6ZUNvdW50RGlyZWN0b3JpZXMoY291bnRzOiByZWFkb25seSBHcmVwQ291bnRNYXRjaFtdKTogRGlyZWN0b3J5Q291bnRbXSB7XG5cdGNvbnN0IGRpcmVjdG9yaWVzID0gbmV3IE1hcDxzdHJpbmcsIERpcmVjdG9yeUNvdW50PigpO1xuXHRmb3IgKGNvbnN0IG0gb2YgY291bnRzKSB7XG5cdFx0Y29uc3QgZGlyZWN0b3J5ID0gZGlyZWN0b3J5T2ZQYXRoKG0ucGF0aCk7XG5cdFx0bGV0IGVudHJ5ID0gZGlyZWN0b3JpZXMuZ2V0KGRpcmVjdG9yeSk7XG5cdFx0aWYgKGVudHJ5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGVudHJ5ID0geyBkaXJlY3RvcnksIGNvdW50OiAwLCBmaWxlczogMCB9O1xuXHRcdFx0ZGlyZWN0b3JpZXMuc2V0KGRpcmVjdG9yeSwgZW50cnkpO1xuXHRcdH1cblx0XHRlbnRyeS5jb3VudCArPSBtLmNvdW50O1xuXHRcdGVudHJ5LmZpbGVzICs9IDE7XG5cdH1cblx0Y29uc3QgdmFsdWVzID0gWy4uLmRpcmVjdG9yaWVzLnZhbHVlcygpXTtcblx0dmFsdWVzLnNvcnQoKGEsIGIpID0+IChiLmNvdW50IC0gYS5jb3VudCkgfHwgKGIuZmlsZXMgLSBhLmZpbGVzKSB8fCBjb21wYXJlU3RyaW5ncyhhLmRpcmVjdG9yeSwgYi5kaXJlY3RvcnkpKTtcblx0cmV0dXJuIHZhbHVlcztcbn1cblxuZnVuY3Rpb24gY29tcGFjdFBhdGhMaXN0T3V0cHV0KFxuXHRvdXRwdXQ6IHN0cmluZyxcblx0bGFiZWw6IHN0cmluZyxcblx0bGFyZ2VPdXRwdXRUaHJlc2hvbGQ6IG51bWJlcixcbik6IFRvb2xDb21wYWN0aW9uUmVzdWx0IHtcblx0Y29uc3QgcGF0aHMgPSBzcGxpdFRvb2xPdXRwdXRMaW5lcyhvdXRwdXQpLm1hcChsaW5lID0+IG5vcm1hbGl6ZURpc3BsYXlQYXRoU2VwYXJhdG9ycyhsaW5lKSk7XG5cdGlmIChzaG91bGRTa2lwVG9vbE91dHB1dENvbXBhY3Rpb24ocGF0aHMsIG91dHB1dCwgMjUpKSB7XG5cdFx0cmV0dXJuIHVuY2hhbmdlZChvdXRwdXQpO1xuXHR9XG5cblx0Y29uc3QgY29tbW9uUHJlZml4ID0gY29tbW9uRGlyZWN0b3J5UHJlZml4KHBhdGhzKTtcblx0Y29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZ1tdPigpO1xuXHRmb3IgKGNvbnN0IGZpbGVQYXRoIG9mIHBhdGhzKSB7XG5cdFx0Y29uc3QgZ3JvdXBQYXRoID0gcGF0aExpc3RHcm91cFBhdGgoZmlsZVBhdGgsIGNvbW1vblByZWZpeCk7XG5cdFx0Y29uc3QgbGlzdCA9IGdyb3Vwcy5nZXQoZ3JvdXBQYXRoKTtcblx0XHRpZiAobGlzdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRsaXN0LnB1c2goZmlsZVBhdGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRncm91cHMuc2V0KGdyb3VwUGF0aCwgW2ZpbGVQYXRoXSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3Qgc29ydGVkR3JvdXBzID0gWy4uLmdyb3Vwcy5lbnRyaWVzKCldO1xuXHRzb3J0ZWRHcm91cHMuc29ydCgoYSwgYikgPT4gKGJbMV0ubGVuZ3RoIC0gYVsxXS5sZW5ndGgpIHx8IGNvbXBhcmVTdHJpbmdzKGFbMF0sIGJbMF0pKTtcblx0Y29uc3QgYm9keUJ1ZGdldCA9IGNvbXBhY3RlZEJvZHlCdWRnZXQobGFyZ2VPdXRwdXRUaHJlc2hvbGQpO1xuXHRjb25zdCBwcmltYXJ5ID0gcmVuZGVyUGF0aExpc3RHcm91cHMoXG5cdFx0cGF0aHMsXG5cdFx0bGFiZWwsXG5cdFx0Y29tbW9uUHJlZml4LFxuXHRcdHNvcnRlZEdyb3Vwcyxcblx0XHRzb3J0ZWRHcm91cHMubGVuZ3RoLFxuXHRcdGZhbHNlLFxuXHQpO1xuXHRpZiAoYnl0ZUxlbmd0aChwcmltYXJ5KSA+PSBieXRlTGVuZ3RoKG91dHB1dCkgJiYgZml0c0xhcmdlT3V0cHV0VGhyZXNob2xkKG91dHB1dCwgbGFyZ2VPdXRwdXRUaHJlc2hvbGQpKSB7XG5cdFx0cmV0dXJuIHVuY2hhbmdlZChvdXRwdXQpO1xuXHR9XG5cdGlmIChmaXRzTGFyZ2VPdXRwdXRUaHJlc2hvbGQocHJpbWFyeSwgYm9keUJ1ZGdldCkpIHtcblx0XHRyZXR1cm4geyBvdXRwdXQ6IHByaW1hcnksIGxvc3NsZXNzOiB0cnVlIH07XG5cdH1cblxuXHRyZXR1cm4gbG9zc3kocmVuZGVyQnVkZ2V0ZWRGbGF0UGF0aExpc3QoXG5cdFx0cGF0aHMsXG5cdFx0bGFiZWwsXG5cdFx0Y29tbW9uUHJlZml4LFxuXHRcdGxhcmdlT3V0cHV0VGhyZXNob2xkLFxuXHQpKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyUGF0aExpc3RHcm91cHMoXG5cdHBhdGhzOiByZWFkb25seSBzdHJpbmdbXSxcblx0bGFiZWw6IHN0cmluZyxcblx0Y29tbW9uUHJlZml4OiBzdHJpbmcsXG5cdHNvcnRlZEdyb3VwczogcmVhZG9ubHkgW3N0cmluZywgc3RyaW5nW11dW10sXG5cdG1heEdyb3VwczogbnVtYmVyLFxuXHRjb21wYWN0U2VsZWN0aW9uOiBib29sZWFuLFxuKTogc3RyaW5nIHtcblx0Y29uc3QgY29tcGFjdGVkOiBzdHJpbmdbXSA9IFtgWyR7bGFiZWx9OiAke3BhdGhzLmxlbmd0aH0gcGF0aChzKSR7Y29tbW9uUHJlZml4Lmxlbmd0aCA9PT0gMCA/ICcnIDogYCB1bmRlciAke2NvbW1vblByZWZpeH1gfTsgZ3JvdXBlZCBieSBkaXJlY3RvcnldYF07XG5cdGZvciAoY29uc3QgW2dyb3VwUGF0aCwgZ3JvdXBQYXRoc10gb2Ygc29ydGVkR3JvdXBzLnNsaWNlKDAsIG1heEdyb3VwcykpIHtcblx0XHRjb25zdCBzb3J0ZWRHcm91cFBhdGhzID0gWy4uLmdyb3VwUGF0aHNdO1xuXHRcdHNvcnRlZEdyb3VwUGF0aHMuc29ydCgoYSwgYikgPT4gbmF0dXJhbENtcChhLCBiKSk7XG5cdFx0Y29tcGFjdGVkLnB1c2goJycpO1xuXHRcdGNvbXBhY3RlZC5wdXNoKGAke2dyb3VwUGF0aH0vICgke2dyb3VwUGF0aHMubGVuZ3RofSBwYXRoKHMpKWApO1xuXHRcdGNvbnN0IHNob3duID0gY29tcGFjdFNlbGVjdGlvbiA/IHNlbGVjdEhlYWRUYWlsVG9TaG93KHNvcnRlZEdyb3VwUGF0aHMpIDogaW5kZXhBbGwoc29ydGVkR3JvdXBQYXRocyk7XG5cdFx0bGV0IHByZXZpb3VzSW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IHsgaXRlbTogZmlsZVBhdGgsIGluZGV4IH0gb2Ygc2hvd24pIHtcblx0XHRcdGlmIChwcmV2aW91c0luZGV4ICE9PSB1bmRlZmluZWQgJiYgaW5kZXggPiBwcmV2aW91c0luZGV4ICsgMSkge1xuXHRcdFx0XHRjb21wYWN0ZWQucHVzaChgICAuLi4gJHtpbmRleCAtIHByZXZpb3VzSW5kZXggLSAxfSBtb3JlIHBhdGgocykgaW4gdGhpcyBncm91cGApO1xuXHRcdFx0fVxuXHRcdFx0Y29tcGFjdGVkLnB1c2goYCAgJHtkaXNwbGF5UGF0aEluUGF0aExpc3RHcm91cChmaWxlUGF0aCwgZ3JvdXBQYXRoKX1gKTtcblx0XHRcdHByZXZpb3VzSW5kZXggPSBpbmRleDtcblx0XHR9XG5cdFx0Y29uc3Qgb21pdHRlZEFmdGVyTGFzdCA9IHByZXZpb3VzSW5kZXggIT09IHVuZGVmaW5lZFxuXHRcdFx0PyBzYXR1cmF0aW5nU3ViKGdyb3VwUGF0aHMubGVuZ3RoLCBwcmV2aW91c0luZGV4ICsgMSlcblx0XHRcdDogZ3JvdXBQYXRocy5sZW5ndGg7XG5cdFx0aWYgKG9taXR0ZWRBZnRlckxhc3QgPiAwKSB7XG5cdFx0XHRjb21wYWN0ZWQucHVzaChgICAuLi4gJHtvbWl0dGVkQWZ0ZXJMYXN0fSBtb3JlIHBhdGgocykgaW4gdGhpcyBncm91cGApO1xuXHRcdH1cblx0fVxuXHRpZiAoc29ydGVkR3JvdXBzLmxlbmd0aCA+IG1heEdyb3Vwcykge1xuXHRcdGNvbnN0IG9taXR0ZWRQYXRocyA9IHRvdGFsR3JvdXBJdGVtcyhzb3J0ZWRHcm91cHMuc2xpY2UobWF4R3JvdXBzKSk7XG5cdFx0Y29tcGFjdGVkLnB1c2goJycpO1xuXHRcdGNvbXBhY3RlZC5wdXNoKGBbb21pdHRlZCAke29taXR0ZWRQYXRoc30gcGF0aChzKSBpbiAke3NvcnRlZEdyb3Vwcy5sZW5ndGggLSBtYXhHcm91cHN9IHNtYWxsZXIgZ3JvdXAocyldYCk7XG5cdH1cblxuXHRjb25zdCBleHRlbnNpb25TdW1tYXJ5ID0gc3VtbWFyaXplRXh0ZW5zaW9ucyhwYXRocyk7XG5cdGlmIChleHRlbnNpb25TdW1tYXJ5Lmxlbmd0aCAhPT0gMCkge1xuXHRcdGNvbXBhY3RlZC5wdXNoKCcnKTtcblx0XHRjb21wYWN0ZWQucHVzaChgW2V4dGVuc2lvbnM6ICR7ZXh0ZW5zaW9uU3VtbWFyeX1dYCk7XG5cdH1cblxuXHRyZXR1cm4gY29tcGFjdGVkLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBzZWxlY3RIZWFkVGFpbFRvU2hvdzxUPihpdGVtczogcmVhZG9ubHkgVFtdKTogSW5kZXhlZDxUPltdIHtcblx0aWYgKGl0ZW1zLmxlbmd0aCA8PSA0MCkge1xuXHRcdHJldHVybiBpbmRleEFsbChpdGVtcyk7XG5cdH1cblx0Y29uc3QgaW5kZXhlczogbnVtYmVyW10gPSBbXTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMjsgaSsrKSB7XG5cdFx0aW5kZXhlcy5wdXNoKGkpO1xuXHR9XG5cdGZvciAobGV0IGkgPSBpdGVtcy5sZW5ndGggLSAxMjsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0aW5kZXhlcy5wdXNoKGkpO1xuXHR9XG5cdHJldHVybiBpbmRleGVzLm1hcChpbmRleCA9PiAoeyBpbmRleCwgaXRlbTogaXRlbXNbaW5kZXhdIH0pKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyQnVkZ2V0ZWRGbGF0UGF0aExpc3QoXG5cdHBhdGhzOiByZWFkb25seSBzdHJpbmdbXSxcblx0bGFiZWw6IHN0cmluZyxcblx0Y29tbW9uUHJlZml4OiBzdHJpbmcsXG5cdGxhcmdlT3V0cHV0VGhyZXNob2xkOiBudW1iZXIsXG4pOiBzdHJpbmcge1xuXHRjb25zdCBzb3J0ZWRQYXRocyA9IHNvcnRQYXRoc0ZvckNvbmNyZXRlUHJldmlldyhwYXRocyk7XG5cdGNvbnN0IGV4dGVuc2lvblN1bW1hcnkgPSBzdW1tYXJpemVFeHRlbnNpb25zKHBhdGhzKTtcblx0Y29uc3QgYnVkZ2V0ID0gY29tcGFjdGVkQm9keUJ1ZGdldChsYXJnZU91dHB1dFRocmVzaG9sZCk7XG5cdGNvbnN0IHNlbGVjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBsaW5lcyA9IFtgWyR7bGFiZWx9OiAke3BhdGhzLmxlbmd0aH0gcGF0aChzKSR7Y29tbW9uUHJlZml4Lmxlbmd0aCA9PT0gMCA/ICcnIDogYCB1bmRlciAke3RydW5jYXRlUGF0aE1pZGRsZShjb21tb25QcmVmaXgsIENPTU1PTl9QUkVGSVhfRElTUExBWV9XSURUSCl9YH07IGNvbmNyZXRlIHBhdGhzXWBdO1xuXHRsZXQgc2VsZWN0ZWRCeXRlcyA9IGpvaW5lZExpbmVCeXRlcyhsaW5lcyk7XG5cblx0Zm9yIChjb25zdCBmaWxlUGF0aCBvZiBzb3J0ZWRQYXRocykge1xuXHRcdGxldCBkaXNwbGF5UGF0aCA9IGRpc3BsYXlQYXRoVW5kZXJQcmVmaXgoZmlsZVBhdGgsIGNvbW1vblByZWZpeCk7XG5cdFx0Y29uc3Qgc3VmZml4TGluZXMgPSBwYXRoTGlzdFN1ZmZpeExpbmVzKHNlbGVjdGVkLmxlbmd0aCArIDEsIHBhdGhzLmxlbmd0aCwgZXh0ZW5zaW9uU3VtbWFyeSk7XG5cdFx0Y29uc3Qgc3VmZml4Qnl0ZXMgPSBqb2luZWRMaW5lQnl0ZXMoc3VmZml4TGluZXMpO1xuXHRcdGNvbnN0IHNlcGFyYXRvckJ5dGVzID0gKHN1ZmZpeEJ5dGVzID4gMCB8fCBsaW5lcy5sZW5ndGggIT09IDApID8gMSA6IDA7XG5cdFx0Y29uc3QgbmV4dEJ5dGVzID0gc2VsZWN0ZWRCeXRlcyArIDEgKyBieXRlTGVuZ3RoKGRpc3BsYXlQYXRoKTtcblx0XHRpZiAobmV4dEJ5dGVzICsgc2VwYXJhdG9yQnl0ZXMgKyBzdWZmaXhCeXRlcyA+IGJ1ZGdldCkge1xuXHRcdFx0aWYgKHNlbGVjdGVkLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmIChzZWxlY3RlZEJ5dGVzID4gYnVkZ2V0KSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGF2YWlsYWJsZSA9IGJ1ZGdldCAtIHNlbGVjdGVkQnl0ZXM7XG5cdFx0XHRpZiAoc2VwYXJhdG9yQnl0ZXMgPiBhdmFpbGFibGUpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRhdmFpbGFibGUgLT0gc2VwYXJhdG9yQnl0ZXM7XG5cdFx0XHRpZiAoc3VmZml4Qnl0ZXMgPiBhdmFpbGFibGUpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRhdmFpbGFibGUgLT0gc3VmZml4Qnl0ZXM7XG5cdFx0XHRpZiAoYXZhaWxhYmxlID09PSAwKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0ZGlzcGxheVBhdGggPSB0cnVuY2F0ZVBhdGhNaWRkbGUoZGlzcGxheVBhdGgsIGF2YWlsYWJsZSk7XG5cdFx0XHRpZiAoc2VsZWN0ZWRCeXRlcyArIDEgKyBieXRlTGVuZ3RoKGRpc3BsYXlQYXRoKSArIHNlcGFyYXRvckJ5dGVzICsgc3VmZml4Qnl0ZXMgPiBidWRnZXQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHNlbGVjdGVkQnl0ZXMgKz0gMSArIGJ5dGVMZW5ndGgoZGlzcGxheVBhdGgpO1xuXHRcdHNlbGVjdGVkLnB1c2goZGlzcGxheVBhdGgpO1xuXHR9XG5cblx0bGluZXMucHVzaCguLi5zZWxlY3RlZCk7XG5cdGxpbmVzLnB1c2goLi4ucGF0aExpc3RTdWZmaXhMaW5lcyhzZWxlY3RlZC5sZW5ndGgsIHBhdGhzLmxlbmd0aCwgZXh0ZW5zaW9uU3VtbWFyeSkpO1xuXHRyZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIHBhdGhMaXN0U3VmZml4TGluZXMoXG5cdHNlbGVjdGVkQ291bnQ6IG51bWJlcixcblx0cGF0aENvdW50OiBudW1iZXIsXG5cdGV4dGVuc2lvblN1bW1hcnk6IHN0cmluZyxcbik6IHN0cmluZ1tdIHtcblx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdGlmIChzZWxlY3RlZENvdW50IDwgcGF0aENvdW50KSB7XG5cdFx0bGluZXMucHVzaChgW29taXR0ZWQgJHtwYXRoQ291bnQgLSBzZWxlY3RlZENvdW50fSBwYXRoKHMpOyBzZWUgb3JpZ2luYWwgb3V0cHV0IGZvciBmdWxsIHJlc3VsdHNdYCk7XG5cdH1cblx0aWYgKGV4dGVuc2lvblN1bW1hcnkubGVuZ3RoICE9PSAwKSB7XG5cdFx0bGluZXMucHVzaChgW2V4dGVuc2lvbnM6ICR7dHJ1bmNhdGVJbmxpbmVUZXh0KGV4dGVuc2lvblN1bW1hcnksIEVYVEVOU0lPTl9TVU1NQVJZX0lOTElORV9XSURUSCl9XWApO1xuXHR9XG5cdHJldHVybiBsaW5lcztcbn1cblxuZnVuY3Rpb24gc29ydFBhdGhzRm9yQ29uY3JldGVQcmV2aWV3KHBhdGhzOiByZWFkb25seSBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcblx0Y29uc3QgZXh0ZW5zaW9uQ291bnRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0Zm9yIChjb25zdCBmaWxlUGF0aCBvZiBwYXRocykge1xuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IHBhdGhFeHRlbnNpb24oZmlsZVBhdGgpO1xuXHRcdGV4dGVuc2lvbkNvdW50cy5zZXQoZXh0ZW5zaW9uLCAoZXh0ZW5zaW9uQ291bnRzLmdldChleHRlbnNpb24pID8/IDApICsgMSk7XG5cdH1cblx0Y29uc3Qgc29ydGVkID0gWy4uLnBhdGhzXTtcblx0c29ydGVkLnNvcnQoKGEsIGIpID0+IHtcblx0XHRjb25zdCBjb3VudEEgPSBleHRlbnNpb25Db3VudHMuZ2V0KHBhdGhFeHRlbnNpb24oYSkpID8/IDA7XG5cdFx0Y29uc3QgY291bnRCID0gZXh0ZW5zaW9uQ291bnRzLmdldChwYXRoRXh0ZW5zaW9uKGIpKSA/PyAwO1xuXHRcdHJldHVybiAoY291bnRBIC0gY291bnRCKSB8fCBuYXR1cmFsQ21wKGEsIGIpO1xuXHR9KTtcblx0cmV0dXJuIHNvcnRlZDtcbn1cblxuZnVuY3Rpb24gZGlzcGxheVBhdGhJblBhdGhMaXN0R3JvdXAoZmlsZVBhdGg6IHN0cmluZywgZ3JvdXBQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoZ3JvdXBQYXRoID09PSAnLicpIHtcblx0XHRyZXR1cm4gZmlsZVBhdGg7XG5cdH1cblx0Y29uc3QgcHJlZml4ID0gZ3JvdXBQYXRoLmVuZHNXaXRoKCcvJykgPyBncm91cFBhdGggOiBgJHtncm91cFBhdGh9L2A7XG5cdHJldHVybiBzdHJpcFByZWZpeChmaWxlUGF0aCwgcHJlZml4KSA/PyBmaWxlUGF0aDtcbn1cblxuZnVuY3Rpb24gcGF0aExpc3RHcm91cFBhdGgoZmlsZVBhdGg6IHN0cmluZywgY29tbW9uUHJlZml4OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCByZWxhdGl2ZSA9IGNvbW1vblByZWZpeC5sZW5ndGggPT09IDBcblx0XHQ/IGZpbGVQYXRoXG5cdFx0OiB0cmltU3RhcnRNYXRjaGVzQ2hhcnMoZmlsZVBhdGguc2xpY2UoY29tbW9uUHJlZml4Lmxlbmd0aCksIFsnLyddKTtcblx0aWYgKHJlbGF0aXZlLmxlbmd0aCA9PT0gMCB8fCAhcmVsYXRpdmUuaW5jbHVkZXMoJy8nKSkge1xuXHRcdHJldHVybiBqb2luRGlzcGxheVBhdGgoY29tbW9uUHJlZml4LCAnLicpO1xuXHR9XG5cdGNvbnN0IHNlZ21lbnRzID0gdHJpbVN0YXJ0TWF0Y2hlc0NoYXJzKHJlbGF0aXZlLCBbJy8nXSkuc3BsaXQoJy8nKTtcblx0Y29uc3QgZmlyc3RTZWdtZW50ID0gc2VnbWVudHMubGVuZ3RoID4gMCA/IHNlZ21lbnRzWzBdIDogJyc7XG5cdGNvbnN0IHNlZ21lbnQgPSBmaXJzdFNlZ21lbnQubGVuZ3RoID09PSAwID8gJy4nIDogZmlyc3RTZWdtZW50O1xuXHRyZXR1cm4gam9pbkRpc3BsYXlQYXRoKGNvbW1vblByZWZpeCwgc2VnbWVudCk7XG59XG5cbmZ1bmN0aW9uIGNvbW1vbkRpcmVjdG9yeVByZWZpeChwYXRoczogcmVhZG9ubHkgc3RyaW5nW10pOiBzdHJpbmcge1xuXHRpZiAocGF0aHMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cdGNvbnN0IGRpcmVjdG9yaWVzID0gcGF0aHMubWFwKGZpbGVQYXRoID0+IHtcblx0XHRjb25zdCBpbmRleCA9IGZpbGVQYXRoLmxhc3RJbmRleE9mKCcvJyk7XG5cdFx0cmV0dXJuIGluZGV4ID4gMCA/IGZpbGVQYXRoLnNsaWNlKDAsIGluZGV4KSA6ICcnO1xuXHR9KTtcblx0Y29uc3QgZmlyc3RQYXJ0cyA9IGRpcmVjdG9yaWVzWzBdLnNwbGl0KCcvJyk7XG5cdGxldCBwcmVmaXhMZW5ndGggPSBmaXJzdFBhcnRzLmxlbmd0aDtcblx0Zm9yIChjb25zdCBkaXJlY3Rvcnkgb2YgZGlyZWN0b3JpZXMuc2xpY2UoMSkpIHtcblx0XHRjb25zdCBwYXJ0cyA9IGRpcmVjdG9yeS5zcGxpdCgnLycpO1xuXHRcdGxldCBpID0gMDtcblx0XHR3aGlsZSAoaSA8IHByZWZpeExlbmd0aCAmJiBpIDwgcGFydHMubGVuZ3RoICYmIGZpcnN0UGFydHNbaV0gPT09IHBhcnRzW2ldKSB7XG5cdFx0XHRpICs9IDE7XG5cdFx0fVxuXHRcdHByZWZpeExlbmd0aCA9IGk7XG5cdH1cblx0cmV0dXJuIGZpcnN0UGFydHMuc2xpY2UoMCwgcHJlZml4TGVuZ3RoKS5qb2luKCcvJyk7XG59XG5cbmZ1bmN0aW9uIGRpcmVjdG9yeU9mUGF0aChmaWxlUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZURpc3BsYXlQYXRoU2VwYXJhdG9ycyhmaWxlUGF0aCk7XG5cdGNvbnN0IGluZGV4ID0gbm9ybWFsaXplZC5sYXN0SW5kZXhPZignLycpO1xuXHRyZXR1cm4gaW5kZXggPiAwID8gbm9ybWFsaXplZC5zbGljZSgwLCBpbmRleCkgOiAnLic7XG59XG5cbmZ1bmN0aW9uIHNwbGl0VG9vbE91dHB1dExpbmVzKG91dHB1dDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRpZiAob3V0cHV0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRjb25zdCBwaWVjZXM6IHN0cmluZ1tdID0gW107XG5cdGxldCBzdGFydCA9IDA7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgb3V0cHV0Lmxlbmd0aDsgaSsrKSB7XG5cdFx0aWYgKG91dHB1dFtpXSA9PT0gJ1xcbicpIHtcblx0XHRcdHBpZWNlcy5wdXNoKG91dHB1dC5zbGljZShzdGFydCwgaSArIDEpKTtcblx0XHRcdHN0YXJ0ID0gaSArIDE7XG5cdFx0fVxuXHR9XG5cdGlmIChzdGFydCA8IG91dHB1dC5sZW5ndGgpIHtcblx0XHRwaWVjZXMucHVzaChvdXRwdXQuc2xpY2Uoc3RhcnQpKTtcblx0fVxuXG5cdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBwaWVjZSBvZiBwaWVjZXMpIHtcblx0XHRsZXQgbGluZSA9IHBpZWNlO1xuXHRcdGlmIChsaW5lLmVuZHNXaXRoKCdcXHJcXG4nKSkge1xuXHRcdFx0bGluZSA9IGxpbmUuc2xpY2UoMCwgbGluZS5sZW5ndGggLSAyKTtcblx0XHR9IGVsc2UgaWYgKGxpbmUuZW5kc1dpdGgoJ1xcbicpKSB7XG5cdFx0XHRsaW5lID0gbGluZS5zbGljZSgwLCBsaW5lLmxlbmd0aCAtIDEpO1xuXHRcdH1cblx0XHRpZiAobGluZS5sZW5ndGggIT09IDApIHtcblx0XHRcdHJlc3VsdC5wdXNoKGxpbmUpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBqb2luRGlzcGxheVBhdGgocHJlZml4OiBzdHJpbmcsIGNoaWxkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAocHJlZml4Lmxlbmd0aCA9PT0gMCB8fCBjaGlsZCA9PT0gJy4nKSB7XG5cdFx0cmV0dXJuIHByZWZpeC5sZW5ndGggPT09IDAgPyBjaGlsZCA6IHByZWZpeDtcblx0fVxuXHRyZXR1cm4gYCR7cHJlZml4LnJlcGxhY2UoL1xcLyskLywgJycpfS8ke2NoaWxkfWA7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZURpc3BsYXlQYXRoU2VwYXJhdG9ycyhmaWxlUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGZpbGVQYXRoLnJlcGxhY2VBbGwoJ1xcXFwnLCAnLycpO1xufVxuXG5mdW5jdGlvbiBkaXNwbGF5UGF0aFVuZGVyUHJlZml4KGZpbGVQYXRoOiBzdHJpbmcsIGNvbW1vblByZWZpeDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZURpc3BsYXlQYXRoU2VwYXJhdG9ycyhmaWxlUGF0aCk7XG5cdGlmIChjb21tb25QcmVmaXgubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIG5vcm1hbGl6ZWQ7XG5cdH1cblx0Y29uc3QgcmVsYXRpdmUgPSB0cmltU3RhcnRNYXRjaGVzQ2hhcnMobm9ybWFsaXplZC5zbGljZShjb21tb25QcmVmaXgubGVuZ3RoKSwgWycvJ10pO1xuXHRyZXR1cm4gcmVsYXRpdmUubGVuZ3RoID09PSAwID8gJy4nIDogcmVsYXRpdmU7XG59XG5cbmZ1bmN0aW9uIHN1bW1hcml6ZUV4dGVuc2lvbnMocGF0aHM6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0Y29uc3QgY291bnRzOiB7IGV4dGVuc2lvbjogc3RyaW5nOyBjb3VudDogbnVtYmVyIH1bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGZpbGVQYXRoIG9mIHBhdGhzKSB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gcGF0aEV4dGVuc2lvbihmaWxlUGF0aCk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBjb3VudHMuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmV4dGVuc2lvbiA9PT0gZXh0ZW5zaW9uKTtcblx0XHRpZiAoZXhpc3RpbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZXhpc3RpbmcuY291bnQgKz0gMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y291bnRzLnB1c2goeyBleHRlbnNpb24sIGNvdW50OiAxIH0pO1xuXHRcdH1cblx0fVxuXHRjb3VudHMuc29ydCgoYSwgYikgPT4gYi5jb3VudCAtIGEuY291bnQpO1xuXHRyZXR1cm4gY291bnRzLnNsaWNlKDAsIDgpLm1hcChlbnRyeSA9PiBgJHtlbnRyeS5leHRlbnNpb259PSR7ZW50cnkuY291bnR9YCkuam9pbignLCAnKTtcbn1cblxuZnVuY3Rpb24gcGF0aEV4dGVuc2lvbihmaWxlUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgcGF0aE9ubHkgPSBmaWxlUGF0aC5zcGxpdCgnOjonKVswXTtcblx0Y29uc3Qgc2xhc2hTZWdtZW50cyA9IHBhdGhPbmx5LnNwbGl0KCcvJyk7XG5cdGNvbnN0IGJhc2VuYW1lID0gc2xhc2hTZWdtZW50c1tzbGFzaFNlZ21lbnRzLmxlbmd0aCAtIDFdO1xuXHRjb25zdCBpbmRleCA9IGJhc2VuYW1lLmxhc3RJbmRleE9mKCcuJyk7XG5cdGlmIChpbmRleCA8IDApIHtcblx0XHRyZXR1cm4gJ1tubyBleHRlbnNpb25dJztcblx0fVxuXHRpZiAoaW5kZXggPT09IDAgfHwgaW5kZXggPT09IGJhc2VuYW1lLmxlbmd0aCAtIDEpIHtcblx0XHRyZXR1cm4gJ1tubyBleHRlbnNpb25dJztcblx0fVxuXHRyZXR1cm4gYmFzZW5hbWUuc2xpY2UoaW5kZXgpO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlU3RyaW5ncyhhOiBzdHJpbmcsIGI6IHN0cmluZyk6IG51bWJlciB7XG5cdHJldHVybiBhIDwgYiA/IC0xIDogYSA+IGIgPyAxIDogMDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQXlFQSxNQUFNLGlDQUFpQztBQUN2QyxNQUFNLDRDQUE0QztBQUNsRCxNQUFNLDBCQUEwQjtBQVF6QixTQUFTLFFBQVEsU0FBaUIsUUFBZ0IsU0FBeUM7QUFDakcsUUFBTSxPQUFPLFdBQVcsQ0FBQztBQUN6QixRQUFNLHVCQUF1QixLQUFLLHdCQUF3QjtBQUMxRCxRQUFNLGdDQUFnQyxLQUFLLGlDQUFpQztBQUM1RSxRQUFNLG9CQUFvQixLQUFLLGlCQUFpQjtBQUVoRCxRQUFNLGlCQUFpQixzQkFBc0IsT0FBTztBQUNwRCxRQUFNLFVBQVU7QUFBQSxJQUNmO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Q7QUFDQSxTQUFPLFlBQVksU0FBUyxnQkFBZ0IsUUFBUSxPQUFPO0FBQzVEO0FBR08sU0FBUyxnQkFBZ0IsU0FBd0M7QUFDdkUsUUFBTSxTQUFTLHNCQUFzQixPQUFPO0FBQzVDLFNBQU87QUFBQSxJQUNOLGNBQWMsT0FBTyxhQUFhLE1BQU07QUFBQSxJQUN4QyxxQkFBcUIsT0FBTztBQUFBLElBQzVCLFlBQVksT0FBTztBQUFBLElBQ25CLHlCQUF5QixPQUFPO0FBQUEsRUFDakM7QUFDRDtBQUlBLE1BQU0sY0FBYyxJQUFJLFlBQVk7QUFFcEMsU0FBUyxXQUFXLE9BQXVCO0FBQzFDLFNBQU8sWUFBWSxPQUFPLEtBQUssRUFBRTtBQUNsQztBQUdBLFNBQVMsV0FBVyxNQUFzQjtBQUN6QyxNQUFJLEtBQUss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
