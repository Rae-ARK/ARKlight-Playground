var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { disposableTimeout, RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { basename, isAbsolute } from "../../../../base/common/path.js";
import { isDefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import {
  ILanguageModelToolsService,
  ToolDataSource
} from "../../chat/common/tools/languageModelToolsService.js";
import { TestId } from "./testId.js";
import { getTotalCoveragePercent } from "./testCoverage.js";
import { collectTestStateCounts, getTestProgressText } from "./testingProgressMessages.js";
import { isFailedState } from "./testingStates.js";
import { ITestResultService } from "./testResultService.js";
import { ITestService, testsInFile, waitForTestToBeIdle } from "./testService.js";
import { DetailType, TestItemExpandState, TestMessageType, TestResultState, TestRunProfileBitset } from "./testTypes.js";
import { Position } from "../../../../editor/common/core/position.js";
import { ITestProfileService } from "./testProfileService.js";
let TestingChatAgentToolContribution = class extends Disposable {
  constructor(instantiationService, toolsService) {
    super();
    const runTestsTool = instantiationService.createInstance(RunTestTool);
    this._register(toolsService.registerTool(RunTestTool.DEFINITION, runTestsTool));
    this._register(toolsService.executeToolSet.addTool(RunTestTool.DEFINITION));
    const testFailureTool = instantiationService.createInstance(TestFailureTool);
    this._register(toolsService.registerTool(TestFailureTool.DEFINITION, testFailureTool));
    this._register(toolsService.executeToolSet.addTool(TestFailureTool.DEFINITION));
  }
};
TestingChatAgentToolContribution.ID = "workbench.contrib.testing.chatAgentTool";
TestingChatAgentToolContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ILanguageModelToolsService)
], TestingChatAgentToolContribution);
let RunTestTool = class {
  constructor(_testService, _uriIdentityService, _workspaceContextService, _testResultService, _testProfileService) {
    this._testService = _testService;
    this._uriIdentityService = _uriIdentityService;
    this._workspaceContextService = _workspaceContextService;
    this._testResultService = _testResultService;
    this._testProfileService = _testProfileService;
  }
  async invoke(invocation, countTokens, progress, token) {
    const params = invocation.parameters;
    const mode = params.mode === "coverage" ? "coverage" : "run";
    let group = mode === "coverage" ? TestRunProfileBitset.Coverage : TestRunProfileBitset.Run;
    const coverageFiles = mode === "coverage" ? params.coverageFiles && params.coverageFiles.length ? params.coverageFiles : void 0 : void 0;
    const testFiles = await this._getFileTestsToRun(params, progress);
    const testCases = await this._getTestCasesToRun(params, testFiles, progress);
    if (!testCases.length) {
      return {
        content: [{ kind: "text", value: "No tests found in the files. Ensure the correct absolute paths are passed to the tool." }],
        toolResultError: localize("runTestTool.noTests", "No tests found in the files")
      };
    }
    progress.report({ message: localize("runTestTool.invoke.progress", "Starting test run...") });
    if (group === TestRunProfileBitset.Coverage) {
      if (!testCases.some((tc) => this._testProfileService.capabilitiesForTest(tc.item) & TestRunProfileBitset.Coverage)) {
        group = TestRunProfileBitset.Run;
      }
    }
    const result = await this._captureTestResult(testCases, group, token);
    if (!result) {
      return {
        content: [{ kind: "text", value: "No test run was started. Instruct the user to ensure their test runner is correctly configured" }],
        toolResultError: localize("runTestTool.noRunStarted", "No test run was started. This may be an issue with your test runner or extension.")
      };
    }
    await this._monitorRunProgress(result, progress, token);
    if (token.isCancellationRequested) {
      this._testService.cancelTestRun(result.id);
      return {
        content: [{ kind: "text", value: localize("runTestTool.invoke.cancelled", "Test run was cancelled.") }],
        toolResultMessage: localize("runTestTool.invoke.cancelled", "Test run was cancelled.")
      };
    }
    const summary = await buildTestRunSummary(result, mode, coverageFiles);
    const content = [{ kind: "text", value: summary }];
    return {
      content,
      toolResultMessage: getTestProgressText(collectTestStateCounts(false, [result]))
    };
  }
  /** Updates the UI progress as the test runs, resolving when the run is finished. */
  async _monitorRunProgress(result, progress, token) {
    const store = new DisposableStore();
    const update = () => {
      const counts = collectTestStateCounts(!result.completedAt, [result]);
      const text = getTestProgressText(counts);
      progress.report({ message: text, progress: counts.runSoFar / counts.totalWillBeRun });
    };
    const throttler = store.add(new RunOnceScheduler(update, 500));
    return new Promise((resolve) => {
      store.add(result.onChange(() => {
        if (!throttler.isScheduled) {
          throttler.schedule();
        }
      }));
      store.add(token.onCancellationRequested(() => {
        this._testService.cancelTestRun(result.id);
        resolve();
      }));
      store.add(result.onComplete(() => {
        update();
        resolve();
      }));
    }).finally(() => store.dispose());
  }
  /**
   * Captures the test result. This is a little tricky because some extensions
   * trigger an 'out of bound' test run, so we actually wait for the first
   * test run to come in that contains one or more tasks and treat that as the
   * one we're looking for.
   */
  async _captureTestResult(testCases, group, token) {
    const store = new DisposableStore();
    const onDidTimeout = store.add(new Emitter());
    return new Promise((resolve) => {
      store.add(onDidTimeout.event(() => {
        resolve(void 0);
      }));
      store.add(this._testResultService.onResultsChanged((ev) => {
        if ("started" in ev) {
          store.add(ev.started.onNewTask(() => {
            store.dispose();
            resolve(ev.started);
          }));
        }
      }));
      this._testService.runTests({
        group,
        tests: testCases,
        preserveFocus: true
      }, token).then(() => {
        if (!store.isDisposed) {
          store.add(disposableTimeout(() => onDidTimeout.fire(), 5e3));
        }
      });
    }).finally(() => store.dispose());
  }
  /** Filters the test files to individual test cases based on the provided parameters. */
  async _getTestCasesToRun(params, tests, progress) {
    if (!params.testNames?.length) {
      return tests;
    }
    progress.report({ message: localize("runTestTool.invoke.filterProgress", "Filtering tests...") });
    const testNames = params.testNames.map((t) => t.toLowerCase().trim());
    const filtered = [];
    const doFilter = async (test) => {
      const name = test.item.label.toLowerCase().trim();
      if (testNames.some((tn) => name.includes(tn))) {
        filtered.push(test);
        return;
      }
      if (test.expand === TestItemExpandState.Expandable) {
        await this._testService.collection.expand(test.item.extId, 1);
      }
      await waitForTestToBeIdle(this._testService, test);
      await Promise.all([...test.children].map(async (id) => {
        const item = this._testService.collection.getNodeById(id);
        if (item) {
          await doFilter(item);
        }
      }));
    };
    await Promise.all(tests.map(doFilter));
    return filtered;
  }
  /** Gets the file tests to run based on the provided parameters. */
  async _getFileTestsToRun(params, progress) {
    if (!params.files?.length) {
      return [...this._testService.collection.rootItems];
    }
    progress.report({ message: localize("runTestTool.invoke.filesProgress", "Discovering tests...") });
    const firstWorkspaceFolder = this._workspaceContextService.getWorkspace().folders.at(0)?.uri;
    const uris = params.files.map((f) => {
      if (isAbsolute(f)) {
        return URI.file(f);
      } else if (firstWorkspaceFolder) {
        return URI.joinPath(firstWorkspaceFolder, f);
      } else {
        return void 0;
      }
    }).filter(isDefined);
    const tests = [];
    for (const uri of uris) {
      for await (const files of testsInFile(this._testService, this._uriIdentityService, uri, void 0, false)) {
        for (const file of files) {
          tests.push(file);
        }
      }
    }
    return tests;
  }
  prepareToolInvocation(context, token) {
    const params = context.parameters;
    const title = localize("runTestTool.confirm.title", "Allow test run?");
    const inFiles = params.files?.map((f) => "`" + basename(f) + "`");
    return Promise.resolve({
      invocationMessage: localize("runTestTool.confirm.invocation", "Running tests..."),
      confirmationMessages: {
        title,
        message: inFiles?.length ? new MarkdownString().appendMarkdown(localize("runTestTool.confirm.message", "The model wants to run tests in {0}.", inFiles.join(", "))) : localize("runTestTool.confirm.all", "The model wants to run all tests."),
        allowAutoConfirm: true
      }
    });
  }
};
RunTestTool.ID = "runTests";
RunTestTool.DEFINITION = {
  id: RunTestTool.ID,
  toolReferenceName: "runTests",
  legacyToolReferenceFullNames: ["runTests"],
  displayName: "Run tests",
  modelDescription: 'Runs unit tests in files. Use this tool if the user asks to run tests or when you want to validate changes using unit tests, and prefer using this tool instead of the terminal tool. When possible, always try to provide `files` paths containing the relevant unit tests in order to avoid unnecessarily long test runs. This tool outputs detailed information about the results of the test run. Set mode="coverage" to also collect coverage and optionally provide coverageFiles for focused reporting.',
  icon: Codicon.beaker,
  inputSchema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        description: "Absolute paths to the test files to run. If not provided, all test files will be run."
      },
      testNames: {
        type: "array",
        items: { type: "string" },
        description: "An array of test names to run. Depending on the context, test names defined in code may be strings or the names of functions or classes containing the test cases. If not provided, all tests in the files will be run."
      },
      mode: {
        type: "string",
        enum: ["run", "coverage"],
        description: 'Execution mode: "run" (default) runs tests normally, "coverage" collects coverage.'
      },
      coverageFiles: {
        type: "array",
        items: { type: "string" },
        description: 'When mode="coverage": absolute file paths to include detailed coverage info for. If not provided, a file-level summary of all files with incomplete coverage is shown.'
      }
    }
  },
  userDescription: localize("runTestTool.userDescription", "Run unit tests (optionally with coverage)"),
  source: ToolDataSource.Internal,
  tags: [
    "vscode_editing_with_tests",
    "enable_other_tool_copilot_readFile",
    "enable_other_tool_copilot_listDirectory",
    "enable_other_tool_copilot_findFiles",
    "enable_other_tool_copilot_runTests",
    "enable_other_tool_copilot_runTestsWithCoverage",
    "enable_other_tool_testFailure"
  ]
};
RunTestTool = __decorateClass([
  __decorateParam(0, ITestService),
  __decorateParam(1, IUriIdentityService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, ITestResultService),
  __decorateParam(4, ITestProfileService)
], RunTestTool);
let TestFailureTool = class {
  constructor(_testResultService) {
    this._testResultService = _testResultService;
  }
  async invoke(invocation, countTokens, progress, token) {
    const result = this._testResultService.results.find((r) => r.tasks.length > 0);
    if (!result) {
      return {
        content: [{ kind: "text", value: "No test failures were found yet, call the runTests tool to run tests and find failures." }]
      };
    }
    const details = await getFailureDetails(result);
    return {
      content: [{ kind: "text", value: details }]
    };
  }
  prepareToolInvocation(context, token) {
    return Promise.resolve({
      invocationMessage: localize("testFailureTool.invocation", "Finding test failures"),
      pastTenseMessage: localize("testFailureTool.pastTense", "Found test failures")
    });
  }
};
TestFailureTool.ID = "testFailure";
TestFailureTool.DEFINITION = {
  id: TestFailureTool.ID,
  toolReferenceName: "testFailure",
  legacyToolReferenceFullNames: ["copilot_testFailure"],
  displayName: localize("testFailureTool.displayName", "Test failures"),
  modelDescription: "Includes test failure information in the prompt. Use this tool to get the details of test failures from the most recent test run. If there are no failures yet, suggest running tests first.",
  icon: Codicon.beaker,
  inputSchema: {
    type: "object",
    properties: {}
  },
  userDescription: localize("testFailureTool.userDescription", "Include test failure information"),
  source: ToolDataSource.Internal,
  tags: [
    "vscode_editing_with_tests",
    "enable_other_tool_copilot_readFile",
    "enable_other_tool_copilot_listDirectory",
    "enable_other_tool_copilot_findFiles",
    "enable_other_tool_copilot_runTests"
  ]
};
TestFailureTool = __decorateClass([
  __decorateParam(0, ITestResultService)
], TestFailureTool);
async function buildTestRunSummary(result, mode, coverageFiles) {
  const failures = result.counts[TestResultState.Errored] + result.counts[TestResultState.Failed];
  let str = `<summary passed=${result.counts[TestResultState.Passed]} failed=${failures} />
`;
  if (failures !== 0) {
    str += await getFailureDetails(result);
  }
  if (mode === "coverage") {
    str += await getCoverageSummary(result, coverageFiles);
  }
  return str;
}
async function getCoverageSummary(result, coverageFiles) {
  let str = "";
  for (const task of result.tasks) {
    const coverage = task.coverage.get();
    if (!coverage) {
      continue;
    }
    if (!coverageFiles || !coverageFiles.length) {
      str += getOverallCoverageSummary(coverage);
      continue;
    }
    const normalized = coverageFiles.map((file) => URI.file(file).fsPath);
    const coveredFilesMap = /* @__PURE__ */ new Map();
    for (const file of coverage.getAllFiles().values()) {
      coveredFilesMap.set(file.uri.fsPath, file);
    }
    for (const path of normalized) {
      const file = coveredFilesMap.get(path);
      if (!file) {
        continue;
      }
      str += await getFileCoverageDetails(file, path);
    }
  }
  return str;
}
function getOverallCoverageSummary(coverage) {
  const files = [...coverage.getAllFiles().values()].map((f) => ({ path: f.uri.fsPath, pct: getTotalCoveragePercent(f.statement, f.branch, f.declaration) * 100 })).filter((f) => f.pct < 100).sort((a, b) => a.pct - b.pct);
  if (!files.length) {
    return "<coverageSummary>All files have 100% coverage.</coverageSummary>\n";
  }
  let str = "<coverageSummary>\n";
  for (const f of files) {
    str += `<file path="${f.path}" percent=${f.pct.toFixed(1)} />
`;
  }
  str += "</coverageSummary>\n";
  return str;
}
async function getFileCoverageDetails(file, path) {
  const pct = getTotalCoveragePercent(file.statement, file.branch, file.declaration) * 100;
  let str = `<coverage path="${path}" percent=${pct.toFixed(1)} statements=${file.statement.covered}/${file.statement.total}`;
  if (file.branch) {
    str += ` branches=${file.branch.covered}/${file.branch.total}`;
  }
  if (file.declaration) {
    str += ` declarations=${file.declaration.covered}/${file.declaration.total}`;
  }
  str += ">\n";
  try {
    const details = await file.details();
    const uncoveredDeclarations = [];
    const uncoveredBranches = [];
    const uncoveredLines = [];
    for (const detail of details) {
      if (detail.type === DetailType.Declaration) {
        if (!detail.count) {
          const line = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.startLineNumber;
          uncoveredDeclarations.push({ name: detail.name, line });
        }
      } else {
        if (!detail.count) {
          const startLine = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.startLineNumber;
          const endLine = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.endLineNumber;
          uncoveredLines.push([startLine, endLine]);
        }
        if (detail.branches) {
          for (const branch of detail.branches) {
            if (!branch.count) {
              let line;
              if (branch.location) {
                line = Position.isIPosition(branch.location) ? branch.location.lineNumber : branch.location.startLineNumber;
              } else {
                line = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.startLineNumber;
              }
              uncoveredBranches.push({ line, label: branch.label });
            }
          }
        }
      }
    }
    if (uncoveredDeclarations.length) {
      str += "uncovered functions: " + uncoveredDeclarations.map((d) => `${d.name}(L${d.line})`).join(", ") + "\n";
    }
    if (uncoveredBranches.length) {
      str += "uncovered branches: " + uncoveredBranches.map((b) => b.label ? `L${b.line}(${b.label})` : `L${b.line}`).join(", ") + "\n";
    }
    if (uncoveredLines.length) {
      str += "uncovered lines: " + mergeLineRanges(uncoveredLines) + "\n";
    }
  } catch {
  }
  str += "</coverage>\n";
  return str;
}
function mergeLineRanges(ranges) {
  if (!ranges.length) {
    return "";
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    const [start, end] = ranges[i];
    if (start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged.map(([s, e]) => s === e ? `${s}` : `${s}-${e}`).join(", ");
}
async function getFailureDetails(result) {
  let str = "";
  let hadMessages = false;
  for (const failure of result.tests) {
    if (!isFailedState(failure.ownComputedState)) {
      continue;
    }
    const [, ...testPath] = TestId.split(failure.item.extId);
    const testName = testPath.pop();
    str += `<testFailure name=${JSON.stringify(testName)} path=${JSON.stringify(testPath.join(" > "))}>
`;
    for (const task of failure.tasks) {
      for (const message of task.messages.filter((m) => m.type === TestMessageType.Error)) {
        hadMessages = true;
        if (message.expected !== void 0 && message.actual !== void 0) {
          str += `<expectedOutput>
${message.expected}
</expectedOutput>
`;
          str += `<actualOutput>
${message.actual}
</actualOutput>
`;
        } else {
          const messageText = typeof message.message === "string" ? message.message : message.message.value;
          str += `<message>
${messageText}
</message>
`;
        }
        if (message.stackTrace && message.stackTrace.length > 0) {
          for (const frame of message.stackTrace.slice(0, 10)) {
            if (frame.uri && frame.position) {
              str += `<stackFrame path="${frame.uri.fsPath}" line="${frame.position.lineNumber}" col="${frame.position.column}" />
`;
            } else if (frame.uri) {
              str += `<stackFrame path="${frame.uri.fsPath}">${frame.label}</stackFrame>
`;
            } else {
              str += `<stackFrame>${frame.label}</stackFrame>
`;
            }
          }
        }
        if (message.location) {
          str += `<location path="${message.location.uri.fsPath}" line="${message.location.range.startLineNumber}" col="${message.location.range.startColumn}" />
`;
        }
      }
    }
    str += `</testFailure>
`;
  }
  if (!hadMessages) {
    const output = result.tasks.map((t) => t.output.getRange(0, t.output.length).toString().trim()).join("\n");
    if (output) {
      str += `<output>
${output}
</output>
`;
    }
  }
  return str;
}
export {
  RunTestTool,
  TestFailureTool,
  TestingChatAgentToolContribution,
  buildTestRunSummary,
  getCoverageSummary,
  getFailureDetails,
  getFileCoverageDetails,
  getOverallCoverageSummary,
  mergeLineRanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RpbmdDaGF0QWdlbnRUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQsIFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBpc0Fic29sdXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQsIE11dGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQge1xuXHRDb3VudFRva2Vuc0NhbGxiYWNrLFxuXHRJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0SVByZXBhcmVkVG9vbEludm9jYXRpb24sXG5cdElUb29sRGF0YSxcblx0SVRvb2xJbXBsLFxuXHRJVG9vbEludm9jYXRpb24sXG5cdElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCxcblx0SVRvb2xSZXN1bHQsXG5cdFRvb2xEYXRhU291cmNlLFxuXHRUb29sUHJvZ3Jlc3MsXG59IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdElkIH0gZnJvbSAnLi90ZXN0SWQuanMnO1xuaW1wb3J0IHsgRmlsZUNvdmVyYWdlLCBUZXN0Q292ZXJhZ2UsIGdldFRvdGFsQ292ZXJhZ2VQZXJjZW50IH0gZnJvbSAnLi90ZXN0Q292ZXJhZ2UuanMnO1xuaW1wb3J0IHsgY29sbGVjdFRlc3RTdGF0ZUNvdW50cywgZ2V0VGVzdFByb2dyZXNzVGV4dCB9IGZyb20gJy4vdGVzdGluZ1Byb2dyZXNzTWVzc2FnZXMuanMnO1xuaW1wb3J0IHsgaXNGYWlsZWRTdGF0ZSB9IGZyb20gJy4vdGVzdGluZ1N0YXRlcy5qcyc7XG5pbXBvcnQgeyBJVGVzdFJlc3VsdCwgTGl2ZVRlc3RSZXN1bHQgfSBmcm9tICcuL3Rlc3RSZXN1bHQuanMnO1xuaW1wb3J0IHsgSVRlc3RSZXN1bHRTZXJ2aWNlIH0gZnJvbSAnLi90ZXN0UmVzdWx0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVzdFNlcnZpY2UsIHRlc3RzSW5GaWxlLCB3YWl0Rm9yVGVzdFRvQmVJZGxlIH0gZnJvbSAnLi90ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBEZXRhaWxUeXBlLCBJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbSwgVGVzdEl0ZW1FeHBhbmRTdGF0ZSwgVGVzdE1lc3NhZ2VUeXBlLCBUZXN0UmVzdWx0U3RhdGUsIFRlc3RSdW5Qcm9maWxlQml0c2V0IH0gZnJvbSAnLi90ZXN0VHlwZXMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVRlc3RQcm9maWxlU2VydmljZSB9IGZyb20gJy4vdGVzdFByb2ZpbGVTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIFRlc3RpbmdDaGF0QWdlbnRUb29sQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnRlc3RpbmcuY2hhdEFnZW50VG9vbCc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB0b29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IHJ1blRlc3RzVG9vbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJ1blRlc3RUb29sKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sKFJ1blRlc3RUb29sLkRFRklOSVRJT04sIHJ1blRlc3RzVG9vbCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvb2xzU2VydmljZS5leGVjdXRlVG9vbFNldC5hZGRUb29sKFJ1blRlc3RUb29sLkRFRklOSVRJT04pKTtcblxuXHRcdGNvbnN0IHRlc3RGYWlsdXJlVG9vbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RGYWlsdXJlVG9vbCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbChUZXN0RmFpbHVyZVRvb2wuREVGSU5JVElPTiwgdGVzdEZhaWx1cmVUb29sKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9vbHNTZXJ2aWNlLmV4ZWN1dGVUb29sU2V0LmFkZFRvb2woVGVzdEZhaWx1cmVUb29sLkRFRklOSVRJT04pKTtcblx0fVxufVxuXG50eXBlIE1vZGUgPSAncnVuJyB8ICdjb3ZlcmFnZSc7XG5cbmludGVyZmFjZSBJUnVuVGVzdFRvb2xQYXJhbXMge1xuXHRmaWxlcz86IHN0cmluZ1tdO1xuXHR0ZXN0TmFtZXM/OiBzdHJpbmdbXTtcblx0LyoqIEZpbGUgcGF0aHMgdG8gcmV0dXJuIGNvdmVyYWdlIGluZm8gZm9yIChvbmx5IHVzZWQgd2hlbiBtb2RlID09PSAnY292ZXJhZ2UnKSAqL1xuXHRjb3ZlcmFnZUZpbGVzPzogc3RyaW5nW107XG5cdG1vZGU/OiBNb2RlO1xufVxuXG5leHBvcnQgY2xhc3MgUnVuVGVzdFRvb2wgaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ3J1blRlc3RzJztcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBERUZJTklUSU9OOiBJVG9vbERhdGEgPSB7XG5cdFx0aWQ6IHRoaXMuSUQsXG5cdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdydW5UZXN0cycsXG5cdFx0bGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogWydydW5UZXN0cyddLFxuXHRcdGRpc3BsYXlOYW1lOiAnUnVuIHRlc3RzJyxcblx0XHRtb2RlbERlc2NyaXB0aW9uOiAnUnVucyB1bml0IHRlc3RzIGluIGZpbGVzLiBVc2UgdGhpcyB0b29sIGlmIHRoZSB1c2VyIGFza3MgdG8gcnVuIHRlc3RzIG9yIHdoZW4geW91IHdhbnQgdG8gdmFsaWRhdGUgY2hhbmdlcyB1c2luZyB1bml0IHRlc3RzLCBhbmQgcHJlZmVyIHVzaW5nIHRoaXMgdG9vbCBpbnN0ZWFkIG9mIHRoZSB0ZXJtaW5hbCB0b29sLiBXaGVuIHBvc3NpYmxlLCBhbHdheXMgdHJ5IHRvIHByb3ZpZGUgYGZpbGVzYCBwYXRocyBjb250YWluaW5nIHRoZSByZWxldmFudCB1bml0IHRlc3RzIGluIG9yZGVyIHRvIGF2b2lkIHVubmVjZXNzYXJpbHkgbG9uZyB0ZXN0IHJ1bnMuIFRoaXMgdG9vbCBvdXRwdXRzIGRldGFpbGVkIGluZm9ybWF0aW9uIGFib3V0IHRoZSByZXN1bHRzIG9mIHRoZSB0ZXN0IHJ1bi4gU2V0IG1vZGU9XCJjb3ZlcmFnZVwiIHRvIGFsc28gY29sbGVjdCBjb3ZlcmFnZSBhbmQgb3B0aW9uYWxseSBwcm92aWRlIGNvdmVyYWdlRmlsZXMgZm9yIGZvY3VzZWQgcmVwb3J0aW5nLicsXG5cdFx0aWNvbjogQ29kaWNvbi5iZWFrZXIsXG5cdFx0aW5wdXRTY2hlbWE6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRmaWxlczoge1xuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0Fic29sdXRlIHBhdGhzIHRvIHRoZSB0ZXN0IGZpbGVzIHRvIHJ1bi4gSWYgbm90IHByb3ZpZGVkLCBhbGwgdGVzdCBmaWxlcyB3aWxsIGJlIHJ1bi4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0ZXN0TmFtZXM6IHtcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdBbiBhcnJheSBvZiB0ZXN0IG5hbWVzIHRvIHJ1bi4gRGVwZW5kaW5nIG9uIHRoZSBjb250ZXh0LCB0ZXN0IG5hbWVzIGRlZmluZWQgaW4gY29kZSBtYXkgYmUgc3RyaW5ncyBvciB0aGUgbmFtZXMgb2YgZnVuY3Rpb25zIG9yIGNsYXNzZXMgY29udGFpbmluZyB0aGUgdGVzdCBjYXNlcy4gSWYgbm90IHByb3ZpZGVkLCBhbGwgdGVzdHMgaW4gdGhlIGZpbGVzIHdpbGwgYmUgcnVuLicsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1vZGU6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ3J1bicsICdjb3ZlcmFnZSddLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRXhlY3V0aW9uIG1vZGU6IFwicnVuXCIgKGRlZmF1bHQpIHJ1bnMgdGVzdHMgbm9ybWFsbHksIFwiY292ZXJhZ2VcIiBjb2xsZWN0cyBjb3ZlcmFnZS4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb3ZlcmFnZUZpbGVzOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnV2hlbiBtb2RlPVwiY292ZXJhZ2VcIjogYWJzb2x1dGUgZmlsZSBwYXRocyB0byBpbmNsdWRlIGRldGFpbGVkIGNvdmVyYWdlIGluZm8gZm9yLiBJZiBub3QgcHJvdmlkZWQsIGEgZmlsZS1sZXZlbCBzdW1tYXJ5IG9mIGFsbCBmaWxlcyB3aXRoIGluY29tcGxldGUgY292ZXJhZ2UgaXMgc2hvd24uJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncnVuVGVzdFRvb2wudXNlckRlc2NyaXB0aW9uJywgJ1J1biB1bml0IHRlc3RzIChvcHRpb25hbGx5IHdpdGggY292ZXJhZ2UpJyksXG5cdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR0YWdzOiBbXG5cdFx0XHQndnNjb2RlX2VkaXRpbmdfd2l0aF90ZXN0cycsXG5cdFx0XHQnZW5hYmxlX290aGVyX3Rvb2xfY29waWxvdF9yZWFkRmlsZScsXG5cdFx0XHQnZW5hYmxlX290aGVyX3Rvb2xfY29waWxvdF9saXN0RGlyZWN0b3J5Jyxcblx0XHRcdCdlbmFibGVfb3RoZXJfdG9vbF9jb3BpbG90X2ZpbmRGaWxlcycsXG5cdFx0XHQnZW5hYmxlX290aGVyX3Rvb2xfY29waWxvdF9ydW5UZXN0cycsXG5cdFx0XHQnZW5hYmxlX290aGVyX3Rvb2xfY29waWxvdF9ydW5UZXN0c1dpdGhDb3ZlcmFnZScsXG5cdFx0XHQnZW5hYmxlX290aGVyX3Rvb2xfdGVzdEZhaWx1cmUnLFxuXHRcdF0sXG5cdH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXN0U2VydmljZTogSVRlc3RTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElUZXN0UmVzdWx0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXN0UmVzdWx0U2VydmljZTogSVRlc3RSZXN1bHRTZXJ2aWNlLFxuXHRcdEBJVGVzdFByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlc3RQcm9maWxlU2VydmljZTogSVRlc3RQcm9maWxlU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBpbnZva2UoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBjb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IHBhcmFtczogSVJ1blRlc3RUb29sUGFyYW1zID0gaW52b2NhdGlvbi5wYXJhbWV0ZXJzO1xuXHRcdGNvbnN0IG1vZGU6IE1vZGUgPSAocGFyYW1zLm1vZGUgPT09ICdjb3ZlcmFnZScgPyAnY292ZXJhZ2UnIDogJ3J1bicpO1xuXHRcdGxldCBncm91cCA9IChtb2RlID09PSAnY292ZXJhZ2UnID8gVGVzdFJ1blByb2ZpbGVCaXRzZXQuQ292ZXJhZ2UgOiBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4pO1xuXHRcdGNvbnN0IGNvdmVyYWdlRmlsZXMgPSAobW9kZSA9PT0gJ2NvdmVyYWdlJyA/IChwYXJhbXMuY292ZXJhZ2VGaWxlcyAmJiBwYXJhbXMuY292ZXJhZ2VGaWxlcy5sZW5ndGggPyBwYXJhbXMuY292ZXJhZ2VGaWxlcyA6IHVuZGVmaW5lZCkgOiB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgdGVzdEZpbGVzID0gYXdhaXQgdGhpcy5fZ2V0RmlsZVRlc3RzVG9SdW4ocGFyYW1zLCBwcm9ncmVzcyk7XG5cdFx0Y29uc3QgdGVzdENhc2VzID0gYXdhaXQgdGhpcy5fZ2V0VGVzdENhc2VzVG9SdW4ocGFyYW1zLCB0ZXN0RmlsZXMsIHByb2dyZXNzKTtcblx0XHRpZiAoIXRlc3RDYXNlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdObyB0ZXN0cyBmb3VuZCBpbiB0aGUgZmlsZXMuIEVuc3VyZSB0aGUgY29ycmVjdCBhYnNvbHV0ZSBwYXRocyBhcmUgcGFzc2VkIHRvIHRoZSB0b29sLicgfV0sXG5cdFx0XHRcdHRvb2xSZXN1bHRFcnJvcjogbG9jYWxpemUoJ3J1blRlc3RUb29sLm5vVGVzdHMnLCAnTm8gdGVzdHMgZm91bmQgaW4gdGhlIGZpbGVzJyksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGxvY2FsaXplKCdydW5UZXN0VG9vbC5pbnZva2UucHJvZ3Jlc3MnLCAnU3RhcnRpbmcgdGVzdCBydW4uLi4nKSB9KTtcblxuXHRcdC8vIElmIHRoZSBtb2RlbCBhc2tzIGZvciBjb3ZlcmFnZSBidXQgdGhlIHRlc3QgcHJvdmlkZXIgZG9lc24ndCBzdXBwb3J0IGl0LCB1c2Ugbm9ybWFsICdydW4nIG1vZGVcblx0XHRpZiAoZ3JvdXAgPT09IFRlc3RSdW5Qcm9maWxlQml0c2V0LkNvdmVyYWdlKSB7XG5cdFx0XHRpZiAoIXRlc3RDYXNlcy5zb21lKHRjID0+IHRoaXMuX3Rlc3RQcm9maWxlU2VydmljZS5jYXBhYmlsaXRpZXNGb3JUZXN0KHRjLml0ZW0pICYgVGVzdFJ1blByb2ZpbGVCaXRzZXQuQ292ZXJhZ2UpKSB7XG5cdFx0XHRcdGdyb3VwID0gVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2NhcHR1cmVUZXN0UmVzdWx0KHRlc3RDYXNlcywgZ3JvdXAsIHRva2VuKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ05vIHRlc3QgcnVuIHdhcyBzdGFydGVkLiBJbnN0cnVjdCB0aGUgdXNlciB0byBlbnN1cmUgdGhlaXIgdGVzdCBydW5uZXIgaXMgY29ycmVjdGx5IGNvbmZpZ3VyZWQnIH1dLFxuXHRcdFx0XHR0b29sUmVzdWx0RXJyb3I6IGxvY2FsaXplKCdydW5UZXN0VG9vbC5ub1J1blN0YXJ0ZWQnLCAnTm8gdGVzdCBydW4gd2FzIHN0YXJ0ZWQuIFRoaXMgbWF5IGJlIGFuIGlzc3VlIHdpdGggeW91ciB0ZXN0IHJ1bm5lciBvciBleHRlbnNpb24uJyksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX21vbml0b3JSdW5Qcm9ncmVzcyhyZXN1bHQsIHByb2dyZXNzLCB0b2tlbik7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRoaXMuX3Rlc3RTZXJ2aWNlLmNhbmNlbFRlc3RSdW4ocmVzdWx0LmlkKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IGxvY2FsaXplKCdydW5UZXN0VG9vbC5pbnZva2UuY2FuY2VsbGVkJywgJ1Rlc3QgcnVuIHdhcyBjYW5jZWxsZWQuJykgfV0sXG5cdFx0XHRcdHRvb2xSZXN1bHRNZXNzYWdlOiBsb2NhbGl6ZSgncnVuVGVzdFRvb2wuaW52b2tlLmNhbmNlbGxlZCcsICdUZXN0IHJ1biB3YXMgY2FuY2VsbGVkLicpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBzdW1tYXJ5ID0gYXdhaXQgYnVpbGRUZXN0UnVuU3VtbWFyeShyZXN1bHQsIG1vZGUsIGNvdmVyYWdlRmlsZXMpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBzdW1tYXJ5IH0gYXMgY29uc3RdO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IGNvbnRlbnQgYXMgTXV0YWJsZTxJVG9vbFJlc3VsdFsnY29udGVudCddPixcblx0XHRcdHRvb2xSZXN1bHRNZXNzYWdlOiBnZXRUZXN0UHJvZ3Jlc3NUZXh0KGNvbGxlY3RUZXN0U3RhdGVDb3VudHMoZmFsc2UsIFtyZXN1bHRdKSksXG5cdFx0fTtcblx0fVxuXG5cdC8qKiBVcGRhdGVzIHRoZSBVSSBwcm9ncmVzcyBhcyB0aGUgdGVzdCBydW5zLCByZXNvbHZpbmcgd2hlbiB0aGUgcnVuIGlzIGZpbmlzaGVkLiAqL1xuXHRwcml2YXRlIGFzeW5jIF9tb25pdG9yUnVuUHJvZ3Jlc3MocmVzdWx0OiBMaXZlVGVzdFJlc3VsdCwgcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCB1cGRhdGUgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb3VudHMgPSBjb2xsZWN0VGVzdFN0YXRlQ291bnRzKCFyZXN1bHQuY29tcGxldGVkQXQsIFtyZXN1bHRdKTtcblx0XHRcdGNvbnN0IHRleHQgPSBnZXRUZXN0UHJvZ3Jlc3NUZXh0KGNvdW50cyk7XG5cdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiB0ZXh0LCBwcm9ncmVzczogY291bnRzLnJ1blNvRmFyIC8gY291bnRzLnRvdGFsV2lsbEJlUnVuIH0pO1xuXHRcdH07XG5cblx0XHRjb25zdCB0aHJvdHRsZXIgPSBzdG9yZS5hZGQobmV3IFJ1bk9uY2VTY2hlZHVsZXIodXBkYXRlLCA1MDApKTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdHN0b3JlLmFkZChyZXN1bHQub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRocm90dGxlci5pc1NjaGVkdWxlZCkge1xuXHRcdFx0XHRcdHRocm90dGxlci5zY2hlZHVsZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Rlc3RTZXJ2aWNlLmNhbmNlbFRlc3RSdW4ocmVzdWx0LmlkKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRzdG9yZS5hZGQocmVzdWx0Lm9uQ29tcGxldGUoKCkgPT4ge1xuXHRcdFx0XHR1cGRhdGUoKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4gc3RvcmUuZGlzcG9zZSgpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYXB0dXJlcyB0aGUgdGVzdCByZXN1bHQuIFRoaXMgaXMgYSBsaXR0bGUgdHJpY2t5IGJlY2F1c2Ugc29tZSBleHRlbnNpb25zXG5cdCAqIHRyaWdnZXIgYW4gJ291dCBvZiBib3VuZCcgdGVzdCBydW4sIHNvIHdlIGFjdHVhbGx5IHdhaXQgZm9yIHRoZSBmaXJzdFxuXHQgKiB0ZXN0IHJ1biB0byBjb21lIGluIHRoYXQgY29udGFpbnMgb25lIG9yIG1vcmUgdGFza3MgYW5kIHRyZWF0IHRoYXQgYXMgdGhlXG5cdCAqIG9uZSB3ZSdyZSBsb29raW5nIGZvci5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2NhcHR1cmVUZXN0UmVzdWx0KHRlc3RDYXNlczogSW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW1bXSwgZ3JvdXA6IFRlc3RSdW5Qcm9maWxlQml0c2V0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPExpdmVUZXN0UmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgb25EaWRUaW1lb3V0ID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPExpdmVUZXN0UmVzdWx0IHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdHN0b3JlLmFkZChvbkRpZFRpbWVvdXQuZXZlbnQoKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHN0b3JlLmFkZCh0aGlzLl90ZXN0UmVzdWx0U2VydmljZS5vblJlc3VsdHNDaGFuZ2VkKGV2ID0+IHtcblx0XHRcdFx0aWYgKCdzdGFydGVkJyBpbiBldikge1xuXHRcdFx0XHRcdHN0b3JlLmFkZChldi5zdGFydGVkLm9uTmV3VGFzaygoKSA9PiB7XG5cdFx0XHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKGV2LnN0YXJ0ZWQpO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl90ZXN0U2VydmljZS5ydW5UZXN0cyh7XG5cdFx0XHRcdGdyb3VwLFxuXHRcdFx0XHR0ZXN0czogdGVzdENhc2VzLFxuXHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiB0cnVlLFxuXHRcdFx0fSwgdG9rZW4pLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXN0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRzdG9yZS5hZGQoZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4gb25EaWRUaW1lb3V0LmZpcmUoKSwgNV8wMDApKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSkuZmluYWxseSgoKSA9PiBzdG9yZS5kaXNwb3NlKCkpO1xuXHR9XG5cblx0LyoqIEZpbHRlcnMgdGhlIHRlc3QgZmlsZXMgdG8gaW5kaXZpZHVhbCB0ZXN0IGNhc2VzIGJhc2VkIG9uIHRoZSBwcm92aWRlZCBwYXJhbWV0ZXJzLiAqL1xuXHRwcml2YXRlIGFzeW5jIF9nZXRUZXN0Q2FzZXNUb1J1bihwYXJhbXM6IElSdW5UZXN0VG9vbFBhcmFtcywgdGVzdHM6IEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtW10sIHByb2dyZXNzOiBUb29sUHJvZ3Jlc3MpOiBQcm9taXNlPEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtW10+IHtcblx0XHRpZiAoIXBhcmFtcy50ZXN0TmFtZXM/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHRlc3RzO1xuXHRcdH1cblxuXHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGxvY2FsaXplKCdydW5UZXN0VG9vbC5pbnZva2UuZmlsdGVyUHJvZ3Jlc3MnLCAnRmlsdGVyaW5nIHRlc3RzLi4uJykgfSk7XG5cblx0XHRjb25zdCB0ZXN0TmFtZXMgPSBwYXJhbXMudGVzdE5hbWVzLm1hcCh0ID0+IHQudG9Mb3dlckNhc2UoKS50cmltKCkpO1xuXHRcdGNvbnN0IGZpbHRlcmVkOiBJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbVtdID0gW107XG5cdFx0Y29uc3QgZG9GaWx0ZXIgPSBhc3luYyAodGVzdDogSW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW0pID0+IHtcblx0XHRcdGNvbnN0IG5hbWUgPSB0ZXN0Lml0ZW0ubGFiZWwudG9Mb3dlckNhc2UoKS50cmltKCk7XG5cdFx0XHRpZiAodGVzdE5hbWVzLnNvbWUodG4gPT4gbmFtZS5pbmNsdWRlcyh0bikpKSB7XG5cdFx0XHRcdGZpbHRlcmVkLnB1c2godGVzdCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRlc3QuZXhwYW5kID09PSBUZXN0SXRlbUV4cGFuZFN0YXRlLkV4cGFuZGFibGUpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fdGVzdFNlcnZpY2UuY29sbGVjdGlvbi5leHBhbmQodGVzdC5pdGVtLmV4dElkLCAxKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHdhaXRGb3JUZXN0VG9CZUlkbGUodGhpcy5fdGVzdFNlcnZpY2UsIHRlc3QpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoWy4uLnRlc3QuY2hpbGRyZW5dLm1hcChhc3luYyBpZCA9PiB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl90ZXN0U2VydmljZS5jb2xsZWN0aW9uLmdldE5vZGVCeUlkKGlkKTtcblx0XHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0XHRhd2FpdCBkb0ZpbHRlcihpdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH07XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbCh0ZXN0cy5tYXAoZG9GaWx0ZXIpKTtcblx0XHRyZXR1cm4gZmlsdGVyZWQ7XG5cdH1cblxuXHQvKiogR2V0cyB0aGUgZmlsZSB0ZXN0cyB0byBydW4gYmFzZWQgb24gdGhlIHByb3ZpZGVkIHBhcmFtZXRlcnMuICovXG5cdHByaXZhdGUgYXN5bmMgX2dldEZpbGVUZXN0c1RvUnVuKHBhcmFtczogSVJ1blRlc3RUb29sUGFyYW1zLCBwcm9ncmVzczogVG9vbFByb2dyZXNzKTogUHJvbWlzZTxJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbVtdPiB7XG5cdFx0aWYgKCFwYXJhbXMuZmlsZXM/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFsuLi50aGlzLl90ZXN0U2VydmljZS5jb2xsZWN0aW9uLnJvb3RJdGVtc107XG5cdFx0fVxuXG5cdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbG9jYWxpemUoJ3J1blRlc3RUb29sLmludm9rZS5maWxlc1Byb2dyZXNzJywgJ0Rpc2NvdmVyaW5nIHRlc3RzLi4uJykgfSk7XG5cblx0XHRjb25zdCBmaXJzdFdvcmtzcGFjZUZvbGRlciA9IHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMuYXQoMCk/LnVyaTtcblx0XHRjb25zdCB1cmlzID0gcGFyYW1zLmZpbGVzLm1hcChmID0+IHtcblx0XHRcdGlmIChpc0Fic29sdXRlKGYpKSB7XG5cdFx0XHRcdHJldHVybiBVUkkuZmlsZShmKTtcblx0XHRcdH0gZWxzZSBpZiAoZmlyc3RXb3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdFx0cmV0dXJuIFVSSS5qb2luUGF0aChmaXJzdFdvcmtzcGFjZUZvbGRlciwgZik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pLmZpbHRlcihpc0RlZmluZWQpO1xuXG5cdFx0Y29uc3QgdGVzdHM6IEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHVyaSBvZiB1cmlzKSB7XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGZpbGVzIG9mIHRlc3RzSW5GaWxlKHRoaXMuX3Rlc3RTZXJ2aWNlLCB0aGlzLl91cmlJZGVudGl0eVNlcnZpY2UsIHVyaSwgdW5kZWZpbmVkLCBmYWxzZSkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG5cdFx0XHRcdFx0dGVzdHMucHVzaChmaWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0ZXN0cztcblx0fVxuXG5cdHByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwYXJhbXM6IElSdW5UZXN0VG9vbFBhcmFtcyA9IGNvbnRleHQucGFyYW1ldGVycztcblx0XHRjb25zdCB0aXRsZSA9IGxvY2FsaXplKCdydW5UZXN0VG9vbC5jb25maXJtLnRpdGxlJywgJ0FsbG93IHRlc3QgcnVuPycpO1xuXHRcdGNvbnN0IGluRmlsZXMgPSBwYXJhbXMuZmlsZXM/Lm1hcCgoZjogc3RyaW5nKSA9PiAnYCcgKyBiYXNlbmFtZShmKSArICdgJyk7XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgncnVuVGVzdFRvb2wuY29uZmlybS5pbnZvY2F0aW9uJywgJ1J1bm5pbmcgdGVzdHMuLi4nKSxcblx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB7XG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRtZXNzYWdlOiBpbkZpbGVzPy5sZW5ndGhcblx0XHRcdFx0XHQ/IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdydW5UZXN0VG9vbC5jb25maXJtLm1lc3NhZ2UnLCAnVGhlIG1vZGVsIHdhbnRzIHRvIHJ1biB0ZXN0cyBpbiB7MH0uJywgaW5GaWxlcy5qb2luKCcsICcpKSlcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdydW5UZXN0VG9vbC5jb25maXJtLmFsbCcsICdUaGUgbW9kZWwgd2FudHMgdG8gcnVuIGFsbCB0ZXN0cy4nKSxcblx0XHRcdFx0YWxsb3dBdXRvQ29uZmlybTogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RGYWlsdXJlVG9vbCBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAndGVzdEZhaWx1cmUnO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IERFRklOSVRJT046IElUb29sRGF0YSA9IHtcblx0XHRpZDogdGhpcy5JRCxcblx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3Rlc3RGYWlsdXJlJyxcblx0XHRsZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzOiBbJ2NvcGlsb3RfdGVzdEZhaWx1cmUnXSxcblx0XHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3Rlc3RGYWlsdXJlVG9vbC5kaXNwbGF5TmFtZScsICdUZXN0IGZhaWx1cmVzJyksXG5cdFx0bW9kZWxEZXNjcmlwdGlvbjogJ0luY2x1ZGVzIHRlc3QgZmFpbHVyZSBpbmZvcm1hdGlvbiBpbiB0aGUgcHJvbXB0LiBVc2UgdGhpcyB0b29sIHRvIGdldCB0aGUgZGV0YWlscyBvZiB0ZXN0IGZhaWx1cmVzIGZyb20gdGhlIG1vc3QgcmVjZW50IHRlc3QgcnVuLiBJZiB0aGVyZSBhcmUgbm8gZmFpbHVyZXMgeWV0LCBzdWdnZXN0IHJ1bm5pbmcgdGVzdHMgZmlyc3QuJyxcblx0XHRpY29uOiBDb2RpY29uLmJlYWtlcixcblx0XHRpbnB1dFNjaGVtYToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7fSxcblx0XHR9LFxuXHRcdHVzZXJEZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3RGYWlsdXJlVG9vbC51c2VyRGVzY3JpcHRpb24nLCAnSW5jbHVkZSB0ZXN0IGZhaWx1cmUgaW5mb3JtYXRpb24nKSxcblx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdHRhZ3M6IFtcblx0XHRcdCd2c2NvZGVfZWRpdGluZ193aXRoX3Rlc3RzJyxcblx0XHRcdCdlbmFibGVfb3RoZXJfdG9vbF9jb3BpbG90X3JlYWRGaWxlJyxcblx0XHRcdCdlbmFibGVfb3RoZXJfdG9vbF9jb3BpbG90X2xpc3REaXJlY3RvcnknLFxuXHRcdFx0J2VuYWJsZV9vdGhlcl90b29sX2NvcGlsb3RfZmluZEZpbGVzJyxcblx0XHRcdCdlbmFibGVfb3RoZXJfdG9vbF9jb3BpbG90X3J1blRlc3RzJyxcblx0XHRdLFxuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGVzdFJlc3VsdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVzdFJlc3VsdFNlcnZpY2U6IElUZXN0UmVzdWx0U2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBpbnZva2UoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBjb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX3Rlc3RSZXN1bHRTZXJ2aWNlLnJlc3VsdHMuZmluZChyID0+IHIudGFza3MubGVuZ3RoID4gMCk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdObyB0ZXN0IGZhaWx1cmVzIHdlcmUgZm91bmQgeWV0LCBjYWxsIHRoZSBydW5UZXN0cyB0b29sIHRvIHJ1biB0ZXN0cyBhbmQgZmluZCBmYWlsdXJlcy4nIH1dLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBkZXRhaWxzID0gYXdhaXQgZ2V0RmFpbHVyZURldGFpbHMocmVzdWx0KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogZGV0YWlscyB9XSxcblx0XHR9O1xuXHR9XG5cblx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCd0ZXN0RmFpbHVyZVRvb2wuaW52b2NhdGlvbicsICdGaW5kaW5nIHRlc3QgZmFpbHVyZXMnKSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGxvY2FsaXplKCd0ZXN0RmFpbHVyZVRvb2wucGFzdFRlbnNlJywgJ0ZvdW5kIHRlc3QgZmFpbHVyZXMnKSxcblx0XHR9KTtcblx0fVxufVxuXG4vKiogQnVpbGRzIHRoZSBmdWxsIHN1bW1hcnkgc3RyaW5nIGZvciBhIGNvbXBsZXRlZCB0ZXN0IHJ1bi4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBidWlsZFRlc3RSdW5TdW1tYXJ5KHJlc3VsdDogTGl2ZVRlc3RSZXN1bHQsIG1vZGU6IE1vZGUsIGNvdmVyYWdlRmlsZXM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0Y29uc3QgZmFpbHVyZXMgPSByZXN1bHQuY291bnRzW1Rlc3RSZXN1bHRTdGF0ZS5FcnJvcmVkXSArIHJlc3VsdC5jb3VudHNbVGVzdFJlc3VsdFN0YXRlLkZhaWxlZF07XG5cdGxldCBzdHIgPSBgPHN1bW1hcnkgcGFzc2VkPSR7cmVzdWx0LmNvdW50c1tUZXN0UmVzdWx0U3RhdGUuUGFzc2VkXX0gZmFpbGVkPSR7ZmFpbHVyZXN9IC8+XFxuYDtcblx0aWYgKGZhaWx1cmVzICE9PSAwKSB7XG5cdFx0c3RyICs9IGF3YWl0IGdldEZhaWx1cmVEZXRhaWxzKHJlc3VsdCk7XG5cdH1cblx0aWYgKG1vZGUgPT09ICdjb3ZlcmFnZScpIHtcblx0XHRzdHIgKz0gYXdhaXQgZ2V0Q292ZXJhZ2VTdW1tYXJ5KHJlc3VsdCwgY292ZXJhZ2VGaWxlcyk7XG5cdH1cblx0cmV0dXJuIHN0cjtcbn1cblxuLyoqIEdldHMgYSBjb3ZlcmFnZSBzdW1tYXJ5IGZyb20gYSB0ZXN0IHJlc3VsdCwgZWl0aGVyIG92ZXJhbGwgb3IgcGVyLWZpbGUuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Q292ZXJhZ2VTdW1tYXJ5KHJlc3VsdDogTGl2ZVRlc3RSZXN1bHQsIGNvdmVyYWdlRmlsZXM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0bGV0IHN0ciA9ICcnO1xuXHRmb3IgKGNvbnN0IHRhc2sgb2YgcmVzdWx0LnRhc2tzKSB7XG5cdFx0Y29uc3QgY292ZXJhZ2UgPSB0YXNrLmNvdmVyYWdlLmdldCgpO1xuXHRcdGlmICghY292ZXJhZ2UpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmICghY292ZXJhZ2VGaWxlcyB8fCAhY292ZXJhZ2VGaWxlcy5sZW5ndGgpIHtcblx0XHRcdHN0ciArPSBnZXRPdmVyYWxsQ292ZXJhZ2VTdW1tYXJ5KGNvdmVyYWdlKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBjb3ZlcmFnZUZpbGVzLm1hcChmaWxlID0+IFVSSS5maWxlKGZpbGUpLmZzUGF0aCk7XG5cdFx0Y29uc3QgY292ZXJlZEZpbGVzTWFwID0gbmV3IE1hcDxzdHJpbmcsIEZpbGVDb3ZlcmFnZT4oKTtcblx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgY292ZXJhZ2UuZ2V0QWxsRmlsZXMoKS52YWx1ZXMoKSkge1xuXHRcdFx0Y292ZXJlZEZpbGVzTWFwLnNldChmaWxlLnVyaS5mc1BhdGgsIGZpbGUpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcGF0aCBvZiBub3JtYWxpemVkKSB7XG5cdFx0XHRjb25zdCBmaWxlID0gY292ZXJlZEZpbGVzTWFwLmdldChwYXRoKTtcblx0XHRcdGlmICghZmlsZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHN0ciArPSBhd2FpdCBnZXRGaWxlQ292ZXJhZ2VEZXRhaWxzKGZpbGUsIHBhdGgpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gc3RyO1xufVxuXG4vKiogR2V0cyBhIGZpbGUtbGV2ZWwgY292ZXJhZ2Ugb3ZlcnZpZXcgc29ydGVkIGJ5IGxvd2VzdCBjb3ZlcmFnZSBmaXJzdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRPdmVyYWxsQ292ZXJhZ2VTdW1tYXJ5KGNvdmVyYWdlOiBUZXN0Q292ZXJhZ2UpOiBzdHJpbmcge1xuXHRjb25zdCBmaWxlcyA9IFsuLi5jb3ZlcmFnZS5nZXRBbGxGaWxlcygpLnZhbHVlcygpXVxuXHRcdC5tYXAoZiA9PiAoeyBwYXRoOiBmLnVyaS5mc1BhdGgsIHBjdDogZ2V0VG90YWxDb3ZlcmFnZVBlcmNlbnQoZi5zdGF0ZW1lbnQsIGYuYnJhbmNoLCBmLmRlY2xhcmF0aW9uKSAqIDEwMCB9KSlcblx0XHQuZmlsdGVyKGYgPT4gZi5wY3QgPCAxMDApXG5cdFx0LnNvcnQoKGEsIGIpID0+IGEucGN0IC0gYi5wY3QpO1xuXG5cdGlmICghZmlsZXMubGVuZ3RoKSB7XG5cdFx0cmV0dXJuICc8Y292ZXJhZ2VTdW1tYXJ5PkFsbCBmaWxlcyBoYXZlIDEwMCUgY292ZXJhZ2UuPC9jb3ZlcmFnZVN1bW1hcnk+XFxuJztcblx0fVxuXG5cdGxldCBzdHIgPSAnPGNvdmVyYWdlU3VtbWFyeT5cXG4nO1xuXHRmb3IgKGNvbnN0IGYgb2YgZmlsZXMpIHtcblx0XHRzdHIgKz0gYDxmaWxlIHBhdGg9XCIke2YucGF0aH1cIiBwZXJjZW50PSR7Zi5wY3QudG9GaXhlZCgxKX0gLz5cXG5gO1xuXHR9XG5cdHN0ciArPSAnPC9jb3ZlcmFnZVN1bW1hcnk+XFxuJztcblx0cmV0dXJuIHN0cjtcbn1cblxuLyoqIEdldHMgZGV0YWlsZWQgY292ZXJhZ2UgaW5mb3JtYXRpb24gZm9yIGEgc2luZ2xlIGZpbGUgaW5jbHVkaW5nIHVuY292ZXJlZCBpdGVtcy4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRGaWxlQ292ZXJhZ2VEZXRhaWxzKGZpbGU6IEZpbGVDb3ZlcmFnZSwgcGF0aDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0Y29uc3QgcGN0ID0gZ2V0VG90YWxDb3ZlcmFnZVBlcmNlbnQoZmlsZS5zdGF0ZW1lbnQsIGZpbGUuYnJhbmNoLCBmaWxlLmRlY2xhcmF0aW9uKSAqIDEwMDtcblx0bGV0IHN0ciA9IGA8Y292ZXJhZ2UgcGF0aD1cIiR7cGF0aH1cIiBwZXJjZW50PSR7cGN0LnRvRml4ZWQoMSl9IHN0YXRlbWVudHM9JHtmaWxlLnN0YXRlbWVudC5jb3ZlcmVkfS8ke2ZpbGUuc3RhdGVtZW50LnRvdGFsfWA7XG5cdGlmIChmaWxlLmJyYW5jaCkge1xuXHRcdHN0ciArPSBgIGJyYW5jaGVzPSR7ZmlsZS5icmFuY2guY292ZXJlZH0vJHtmaWxlLmJyYW5jaC50b3RhbH1gO1xuXHR9XG5cdGlmIChmaWxlLmRlY2xhcmF0aW9uKSB7XG5cdFx0c3RyICs9IGAgZGVjbGFyYXRpb25zPSR7ZmlsZS5kZWNsYXJhdGlvbi5jb3ZlcmVkfS8ke2ZpbGUuZGVjbGFyYXRpb24udG90YWx9YDtcblx0fVxuXHRzdHIgKz0gJz5cXG4nO1xuXG5cdHRyeSB7XG5cdFx0Y29uc3QgZGV0YWlscyA9IGF3YWl0IGZpbGUuZGV0YWlscygpO1xuXG5cdFx0Y29uc3QgdW5jb3ZlcmVkRGVjbGFyYXRpb25zOiB7IG5hbWU6IHN0cmluZzsgbGluZTogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHVuY292ZXJlZEJyYW5jaGVzOiB7IGxpbmU6IG51bWJlcjsgbGFiZWw/OiBzdHJpbmcgfVtdID0gW107XG5cdFx0Y29uc3QgdW5jb3ZlcmVkTGluZXM6IFtudW1iZXIsIG51bWJlcl1bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBkZXRhaWwgb2YgZGV0YWlscykge1xuXHRcdFx0aWYgKGRldGFpbC50eXBlID09PSBEZXRhaWxUeXBlLkRlY2xhcmF0aW9uKSB7XG5cdFx0XHRcdGlmICghZGV0YWlsLmNvdW50KSB7XG5cdFx0XHRcdFx0Y29uc3QgbGluZSA9IFBvc2l0aW9uLmlzSVBvc2l0aW9uKGRldGFpbC5sb2NhdGlvbikgPyBkZXRhaWwubG9jYXRpb24ubGluZU51bWJlciA6IGRldGFpbC5sb2NhdGlvbi5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0dW5jb3ZlcmVkRGVjbGFyYXRpb25zLnB1c2goeyBuYW1lOiBkZXRhaWwubmFtZSwgbGluZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKCFkZXRhaWwuY291bnQpIHtcblx0XHRcdFx0XHRjb25zdCBzdGFydExpbmUgPSBQb3NpdGlvbi5pc0lQb3NpdGlvbihkZXRhaWwubG9jYXRpb24pID8gZGV0YWlsLmxvY2F0aW9uLmxpbmVOdW1iZXIgOiBkZXRhaWwubG9jYXRpb24uc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRcdGNvbnN0IGVuZExpbmUgPSBQb3NpdGlvbi5pc0lQb3NpdGlvbihkZXRhaWwubG9jYXRpb24pID8gZGV0YWlsLmxvY2F0aW9uLmxpbmVOdW1iZXIgOiBkZXRhaWwubG9jYXRpb24uZW5kTGluZU51bWJlcjtcblx0XHRcdFx0XHR1bmNvdmVyZWRMaW5lcy5wdXNoKFtzdGFydExpbmUsIGVuZExpbmVdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZGV0YWlsLmJyYW5jaGVzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBicmFuY2ggb2YgZGV0YWlsLmJyYW5jaGVzKSB7XG5cdFx0XHRcdFx0XHRpZiAoIWJyYW5jaC5jb3VudCkge1xuXHRcdFx0XHRcdFx0XHRsZXQgbGluZTogbnVtYmVyO1xuXHRcdFx0XHRcdFx0XHRpZiAoYnJhbmNoLmxvY2F0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdFx0bGluZSA9IFBvc2l0aW9uLmlzSVBvc2l0aW9uKGJyYW5jaC5sb2NhdGlvbikgPyBicmFuY2gubG9jYXRpb24ubGluZU51bWJlciA6IGJyYW5jaC5sb2NhdGlvbi5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0bGluZSA9IFBvc2l0aW9uLmlzSVBvc2l0aW9uKGRldGFpbC5sb2NhdGlvbikgPyBkZXRhaWwubG9jYXRpb24ubGluZU51bWJlciA6IGRldGFpbC5sb2NhdGlvbi5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0dW5jb3ZlcmVkQnJhbmNoZXMucHVzaCh7IGxpbmUsIGxhYmVsOiBicmFuY2gubGFiZWwgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHVuY292ZXJlZERlY2xhcmF0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHN0ciArPSAndW5jb3ZlcmVkIGZ1bmN0aW9uczogJyArIHVuY292ZXJlZERlY2xhcmF0aW9ucy5tYXAoZCA9PiBgJHtkLm5hbWV9KEwke2QubGluZX0pYCkuam9pbignLCAnKSArICdcXG4nO1xuXHRcdH1cblx0XHRpZiAodW5jb3ZlcmVkQnJhbmNoZXMubGVuZ3RoKSB7XG5cdFx0XHRzdHIgKz0gJ3VuY292ZXJlZCBicmFuY2hlczogJyArIHVuY292ZXJlZEJyYW5jaGVzLm1hcChiID0+IGIubGFiZWwgPyBgTCR7Yi5saW5lfSgke2IubGFiZWx9KWAgOiBgTCR7Yi5saW5lfWApLmpvaW4oJywgJykgKyAnXFxuJztcblx0XHR9XG5cdFx0aWYgKHVuY292ZXJlZExpbmVzLmxlbmd0aCkge1xuXHRcdFx0c3RyICs9ICd1bmNvdmVyZWQgbGluZXM6ICcgKyBtZXJnZUxpbmVSYW5nZXModW5jb3ZlcmVkTGluZXMpICsgJ1xcbic7XG5cdFx0fVxuXHR9IGNhdGNoIHsgLyogaWdub3JlIC0gZGV0YWlscyBub3QgYXZhaWxhYmxlICovIH1cblxuXHRzdHIgKz0gJzwvY292ZXJhZ2U+XFxuJztcblx0cmV0dXJuIHN0cjtcbn1cblxuLyoqIE1lcmdlcyBvdmVybGFwcGluZy9jb250aWd1b3VzIGxpbmUgcmFuZ2VzIGFuZCBmb3JtYXRzIHRoZW0gY29tcGFjdGx5LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1lcmdlTGluZVJhbmdlcyhyYW5nZXM6IFtudW1iZXIsIG51bWJlcl1bXSk6IHN0cmluZyB7XG5cdGlmICghcmFuZ2VzLmxlbmd0aCkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRyYW5nZXMuc29ydCgoYSwgYikgPT4gYVswXSAtIGJbMF0pO1xuXHRjb25zdCBtZXJnZWQ6IFtudW1iZXIsIG51bWJlcl1bXSA9IFtyYW5nZXNbMF1dO1xuXHRmb3IgKGxldCBpID0gMTsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGxhc3QgPSBtZXJnZWRbbWVyZ2VkLmxlbmd0aCAtIDFdO1xuXHRcdGNvbnN0IFtzdGFydCwgZW5kXSA9IHJhbmdlc1tpXTtcblx0XHRpZiAoc3RhcnQgPD0gbGFzdFsxXSArIDEpIHtcblx0XHRcdGxhc3RbMV0gPSBNYXRoLm1heChsYXN0WzFdLCBlbmQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZXJnZWQucHVzaChbc3RhcnQsIGVuZF0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gbWVyZ2VkLm1hcCgoW3MsIGVdKSA9PiBzID09PSBlID8gYCR7c31gIDogYCR7c30tJHtlfWApLmpvaW4oJywgJyk7XG59XG5cbi8qKiBGb3JtYXRzIGZhaWx1cmUgZGV0YWlscyBmcm9tIGEgdGVzdCByZXN1bHQgaW50byBhbiBYTUwtbGlrZSBzdHJpbmcuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0RmFpbHVyZURldGFpbHMocmVzdWx0OiBJVGVzdFJlc3VsdCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdGxldCBzdHIgPSAnJztcblx0bGV0IGhhZE1lc3NhZ2VzID0gZmFsc2U7XG5cdGZvciAoY29uc3QgZmFpbHVyZSBvZiByZXN1bHQudGVzdHMpIHtcblx0XHRpZiAoIWlzRmFpbGVkU3RhdGUoZmFpbHVyZS5vd25Db21wdXRlZFN0YXRlKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgWywgLi4udGVzdFBhdGhdID0gVGVzdElkLnNwbGl0KGZhaWx1cmUuaXRlbS5leHRJZCk7XG5cdFx0Y29uc3QgdGVzdE5hbWUgPSB0ZXN0UGF0aC5wb3AoKTtcblx0XHRzdHIgKz0gYDx0ZXN0RmFpbHVyZSBuYW1lPSR7SlNPTi5zdHJpbmdpZnkodGVzdE5hbWUpfSBwYXRoPSR7SlNPTi5zdHJpbmdpZnkodGVzdFBhdGguam9pbignID4gJykpfT5cXG5gO1xuXHRcdGZvciAoY29uc3QgdGFzayBvZiBmYWlsdXJlLnRhc2tzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgdGFzay5tZXNzYWdlcy5maWx0ZXIobSA9PiBtLnR5cGUgPT09IFRlc3RNZXNzYWdlVHlwZS5FcnJvcikpIHtcblx0XHRcdFx0aGFkTWVzc2FnZXMgPSB0cnVlO1xuXG5cdFx0XHRcdGlmIChtZXNzYWdlLmV4cGVjdGVkICE9PSB1bmRlZmluZWQgJiYgbWVzc2FnZS5hY3R1YWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHN0ciArPSBgPGV4cGVjdGVkT3V0cHV0PlxcbiR7bWVzc2FnZS5leHBlY3RlZH1cXG48L2V4cGVjdGVkT3V0cHV0PlxcbmA7XG5cdFx0XHRcdFx0c3RyICs9IGA8YWN0dWFsT3V0cHV0PlxcbiR7bWVzc2FnZS5hY3R1YWx9XFxuPC9hY3R1YWxPdXRwdXQ+XFxuYDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBtZXNzYWdlVGV4dCA9IHR5cGVvZiBtZXNzYWdlLm1lc3NhZ2UgPT09ICdzdHJpbmcnID8gbWVzc2FnZS5tZXNzYWdlIDogbWVzc2FnZS5tZXNzYWdlLnZhbHVlO1xuXHRcdFx0XHRcdHN0ciArPSBgPG1lc3NhZ2U+XFxuJHttZXNzYWdlVGV4dH1cXG48L21lc3NhZ2U+XFxuYDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChtZXNzYWdlLnN0YWNrVHJhY2UgJiYgbWVzc2FnZS5zdGFja1RyYWNlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGZyYW1lIG9mIG1lc3NhZ2Uuc3RhY2tUcmFjZS5zbGljZSgwLCAxMCkpIHtcblx0XHRcdFx0XHRcdGlmIChmcmFtZS51cmkgJiYgZnJhbWUucG9zaXRpb24pIHtcblx0XHRcdFx0XHRcdFx0c3RyICs9IGA8c3RhY2tGcmFtZSBwYXRoPVwiJHtmcmFtZS51cmkuZnNQYXRofVwiIGxpbmU9XCIke2ZyYW1lLnBvc2l0aW9uLmxpbmVOdW1iZXJ9XCIgY29sPVwiJHtmcmFtZS5wb3NpdGlvbi5jb2x1bW59XCIgLz5cXG5gO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChmcmFtZS51cmkpIHtcblx0XHRcdFx0XHRcdFx0c3RyICs9IGA8c3RhY2tGcmFtZSBwYXRoPVwiJHtmcmFtZS51cmkuZnNQYXRofVwiPiR7ZnJhbWUubGFiZWx9PC9zdGFja0ZyYW1lPlxcbmA7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzdHIgKz0gYDxzdGFja0ZyYW1lPiR7ZnJhbWUubGFiZWx9PC9zdGFja0ZyYW1lPlxcbmA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG1lc3NhZ2UubG9jYXRpb24pIHtcblx0XHRcdFx0XHRzdHIgKz0gYDxsb2NhdGlvbiBwYXRoPVwiJHttZXNzYWdlLmxvY2F0aW9uLnVyaS5mc1BhdGh9XCIgbGluZT1cIiR7bWVzc2FnZS5sb2NhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXJ9XCIgY29sPVwiJHttZXNzYWdlLmxvY2F0aW9uLnJhbmdlLnN0YXJ0Q29sdW1ufVwiIC8+XFxuYDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHN0ciArPSBgPC90ZXN0RmFpbHVyZT5cXG5gO1xuXHR9XG5cblx0aWYgKCFoYWRNZXNzYWdlcykge1xuXHRcdGNvbnN0IG91dHB1dCA9IHJlc3VsdC50YXNrcy5tYXAodCA9PiB0Lm91dHB1dC5nZXRSYW5nZSgwLCB0Lm91dHB1dC5sZW5ndGgpLnRvU3RyaW5nKCkudHJpbSgpKS5qb2luKCdcXG4nKTtcblx0XHRpZiAob3V0cHV0KSB7XG5cdFx0XHRzdHIgKz0gYDxvdXRwdXQ+XFxuJHtvdXRwdXR9XFxuPC9vdXRwdXQ+XFxuYDtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gc3RyO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG1CQUFtQix3QkFBd0I7QUFFcEQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsVUFBVSxrQkFBa0I7QUFDckMsU0FBUyxpQkFBMEI7QUFDbkMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0NBQWdDO0FBRXpDO0FBQUEsRUFFQztBQUFBLEVBT0E7QUFBQSxPQUVNO0FBQ1AsU0FBUyxjQUFj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
