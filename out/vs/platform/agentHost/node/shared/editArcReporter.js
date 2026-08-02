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
import { SequencerByKey, TimeoutTimer } from "../../../../base/common/async.js";
import { EditArcTracker } from "../../../../base/common/editArcTracker.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { extUriBiasedIgnorePathCase } from "../../../../base/common/resources.js";
import { dirname, extname } from "../../../../base/common/path.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { URI } from "../../../../base/common/uri.js";
import { FileChangeType, FileOperationResult, IFileService, toFileOperationResult } from "../../../files/common/files.js";
import { createDecorator } from "../../../instantiation/common/instantiation.js";
import { ILogService } from "../../../log/common/log.js";
import { ITelemetryService, TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { AgentSession } from "../../common/agentService.js";
import { IAgentHostGitService } from "../../common/agentHostGitService.js";
import { AgentHostEditTelemetryEnabledConfigKey, platformRootSchema } from "../../common/agentHostSchema.js";
import { IDiffComputeService } from "../../common/diffComputeService.js";
import { isAhpChatChannel, isSubagentChatUri, isSubagentSession, parseRequiredSessionUriFromChatUri } from "../../common/state/sessionState.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { isAgentHostTelemetryService } from "../agentHostTelemetryService.js";
const IEditArcReporterService = createDecorator("editArcReporterService");
class NullEditArcReporterService {
  async reportEdit(_params) {
  }
}
const SAMPLE_SCHEDULE_MS = [0, 6e4, 3e5];
const MAX_TRACKED_FILE_SIZE_CHARS = 5 * 1024 * 1024;
const MAX_REPORTERS_PER_RESOURCE = 20;
const MAX_REPORTERS_HOST_WIDE = 200;
const MAX_RETAINED_CHARACTERS_HOST_WIDE = 100 * 1024 * 1024;
let EditArcReporterService = class extends Disposable {
  constructor(_sampleScheduleMs = SAMPLE_SCHEDULE_MS, _fileService, _diffComputeService, _gitService, _configurationService, _logService, _telemetryService) {
    super();
    this._sampleScheduleMs = _sampleScheduleMs;
    this._fileService = _fileService;
    this._diffComputeService = _diffComputeService;
    this._gitService = _gitService;
    this._configurationService = _configurationService;
    this._logService = _logService;
    this._telemetryService = _telemetryService;
    this._resourceSequencer = new SequencerByKey();
    this._resources = this._register(new DisposableMap());
    this._reporterCount = 0;
    this._retainedCharacters = 0;
    this._register(this._configurationService.onDidRootConfigChange(() => {
      if (!this._isEnabled()) {
        this._disposeAllReporters("configuration disabled");
      }
    }));
  }
  async reportEdit(params) {
    const resource = URI.file(params.filePath);
    const key = extUriBiasedIgnorePathCase.getComparisonKey(resource);
    await this._resourceSequencer.queue(key, async () => {
      if (!this._isEnabled()) {
        this._logService.trace(`[EditArcReporter] Skipping ${params.filePath}: telemetry is disabled`);
        return;
      }
      if (extname(params.filePath).toLowerCase() === ".ipynb") {
        this._logService.trace(`[EditArcReporter] Skipping notebook: ${params.filePath}`);
        return;
      }
      const retainedCharacters = params.beforeText.length + params.afterText.length;
      if (Math.max(params.beforeText.length, params.afterText.length) > MAX_TRACKED_FILE_SIZE_CHARS) {
        this._logService.warn(`[EditArcReporter] Skipping oversized file: ${params.filePath}`);
        return;
      }
      let state = this._resources.get(key);
      if (state) {
        if (!await this._applyCompletedEdit(state, params)) {
          return;
        }
        if (!this._isEnabled() || this._resources.get(key) !== state) {
          return;
        }
      }
      if (state && state.reporters.size >= MAX_REPORTERS_PER_RESOURCE) {
        this._logService.warn(`[EditArcReporter] Skipping edit: per-resource reporter limit reached for ${params.filePath}`);
        return;
      }
      if (this._reporterCount >= MAX_REPORTERS_HOST_WIDE || this._retainedCharacters + retainedCharacters > MAX_RETAINED_CHARACTERS_HOST_WIDE) {
        this._logService.warn(`[EditArcReporter] Skipping edit: host reporter memory limit reached`);
        return;
      }
      state ??= this._createResourceState(key, resource, params.afterText);
      const resourceState = state;
      const reporter = new EditArcReporter(params, this._sampleScheduleMs, resourceState.gitWorkingDirectory, this._gitService, this._telemetryService, this._logService, (timeDelayMs) => this.reconcileAndSample(resourceState, reporter, timeDelayMs), () => {
        resourceState.reporters.delete(reporter);
        this._reporterCount--;
        this._retainedCharacters -= retainedCharacters;
        if (!resourceState.isDisposing && resourceState.reporters.size === 0) {
          this._resources.deleteAndDispose(key);
        }
      });
      resourceState.reporters.add(reporter);
      this._reporterCount++;
      this._retainedCharacters += retainedCharacters;
    });
  }
  _createResourceState(key, resource, logicalText) {
    const store = new DisposableStore();
    const fileDirectory = URI.file(dirname(resource.fsPath));
    const state = {
      resource,
      gitWorkingDirectory: this._gitService.getRepositoryRoot(fileDirectory).then((repositoryRoot) => repositoryRoot ?? fileDirectory),
      logicalText,
      reporters: /* @__PURE__ */ new Set(),
      isDisposing: false,
      dispose: () => {
        state.isDisposing = true;
        store.dispose();
      }
    };
    store.add(toDisposable(() => {
      for (const reporter of [...state.reporters]) {
        reporter.dispose();
      }
    }));
    try {
      const watcher = store.add(this._fileService.createWatcher(URI.file(dirname(resource.fsPath)), { recursive: false, excludes: [] }));
      store.add(watcher.onDidChange((event) => {
        if (event.contains(resource, FileChangeType.ADDED, FileChangeType.UPDATED, FileChangeType.DELETED)) {
          this._resourceSequencer.queue(key, async () => {
            try {
              await this._reconcileFromDisk(state, false);
            } catch (error) {
              this._logService.warn(`[EditArcReporter] Watcher reconciliation failed for ${resource.fsPath}`, error);
            }
          });
        }
      }));
    } catch (error) {
      this._logService.warn(`[EditArcReporter] Failed to watch ${resource.fsPath}; delayed samples will use forced reconciliation`, error);
    }
    this._resources.set(key, state);
    return state;
  }
  async _applyCompletedEdit(state, params) {
    if (state.logicalText === params.afterText) {
      return true;
    }
    if (state.logicalText === params.beforeText) {
      await this._applyEdit(state, params.initialEdit, params.afterText);
      return true;
    }
    const detailed = await this._diffComputeService.computeDetailedDiff(state.logicalText, params.afterText);
    if (detailed.hitTimeout) {
      this._logService.warn(`[EditArcReporter] Could not update older reporters before ${params.toolCallId}: detailed diff timed out`);
      return false;
    }
    await this._applyEdit(state, { replacements: detailed.replacements }, params.afterText);
    return true;
  }
  async _reconcileFromDisk(state, sample) {
    let currentText;
    try {
      currentText = (await this._fileService.readFile(state.resource)).value.toString();
    } catch (error) {
      if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
        currentText = "";
      } else {
        this._logService.warn(`[EditArcReporter] Failed to read ${state.resource.fsPath}${sample ? " before sample" : ""}`, error);
        return false;
      }
    }
    if (currentText === state.logicalText) {
      return true;
    }
    const detailed = await this._diffComputeService.computeDetailedDiff(state.logicalText, currentText);
    if (detailed.hitTimeout) {
      this._logService.warn(`[EditArcReporter] Detailed diff timed out for ${state.resource.fsPath}`);
      return false;
    }
    await this._applyEdit(state, { replacements: detailed.replacements }, currentText);
    return true;
  }
  async _applyEdit(state, edit, afterText) {
    for (const reporter of state.reporters) {
      reporter.handleEdit(edit);
    }
    state.logicalText = afterText;
  }
  _isEnabled() {
    return this._telemetryService.telemetryLevel >= TelemetryLevel.USAGE && this._configurationService.getRootValue(platformRootSchema, AgentHostEditTelemetryEnabledConfigKey) !== false;
  }
  _disposeAllReporters(reason) {
    if (this._reporterCount > 0) {
      this._logService.info(`[EditArcReporter] Disposing ${this._reporterCount} active reporters: ${reason}`);
    }
    this._resources.clearAndDisposeAll();
    this._reporterCount = 0;
    this._retainedCharacters = 0;
  }
  async reconcileAndSample(state, reporter, timeDelayMs) {
    const key = extUriBiasedIgnorePathCase.getComparisonKey(state.resource);
    await this._resourceSequencer.queue(key, async () => {
      if (!this._isEnabled()) {
        reporter.dispose();
        return;
      }
      if (timeDelayMs !== 0 && !await this._reconcileFromDisk(state, true)) {
        return;
      }
      await reporter.emit(timeDelayMs);
    });
  }
};
EditArcReporterService = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, IDiffComputeService),
  __decorateParam(3, IAgentHostGitService),
  __decorateParam(4, IAgentConfigurationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, ITelemetryService)
], EditArcReporterService);
class EditArcReporter extends Disposable {
  constructor(_params, _sampleScheduleMs, _gitWorkingDirectory, _gitService, _telemetryService, _logService, _sample, onDispose) {
    super();
    this._params = _params;
    this._sampleScheduleMs = _sampleScheduleMs;
    this._gitWorkingDirectory = _gitWorkingDirectory;
    this._gitService = _gitService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this._sample = _sample;
    this._uniqueEditId = generateUuid();
    this._sampleIndex = 0;
    this._tracker = new EditArcTracker(_params.beforeText, _params.initialEdit);
    this._initialBranch = this._getCurrentBranchName();
    this._register(toDisposable(onDispose));
    this._scheduleNext();
  }
  handleEdit(edit) {
    this._tracker.handleEdits(edit);
  }
  _scheduleNext() {
    if (this._store.isDisposed) {
      return;
    }
    if (this._sampleIndex >= this._sampleScheduleMs.length) {
      this.dispose();
      return;
    }
    const delay = Math.max(0, this._params.completionTime + this._sampleScheduleMs[this._sampleIndex] - Date.now());
    const timer = this._register(new TimeoutTimer());
    timer.setIfNotSet(async () => {
      const timeDelayMs = this._sampleScheduleMs[this._sampleIndex++];
      try {
        await this._sample(timeDelayMs);
      } catch (error) {
        this._logService.warn(`[EditArcReporter] Failed to sample ${this._params.filePath} after ${timeDelayMs}ms`, error);
      } finally {
        this._scheduleNext();
      }
    }, delay);
  }
  async emit(timeDelayMs) {
    const sessionUri = isAhpChatChannel(this._params.sessionUri) ? parseRequiredSessionUriFromChatUri(this._params.sessionUri) : this._params.sessionUri;
    const provider = AgentSession.provider(sessionUri) ?? "unknown";
    const originalLineCounts = new EditArcTracker(this._params.beforeText, this._params.initialEdit).getLineCountInfo();
    const currentLineCounts = this._tracker.getLineCountInfo();
    const event = {
      sourceKeyCleaned: "source:Chat.applyEdits",
      extensionId: void 0,
      extensionVersion: void 0,
      opportunityId: void 0,
      editSessionId: AgentSession.id(sessionUri),
      requestId: this._params.turnId,
      modelId: this._params.modelId,
      languageId: void 0,
      mode: this._params.mode,
      uniqueEditId: this._uniqueEditId,
      provider,
      agentSessionId: AgentSession.id(sessionUri),
      isSubagentSession: isSubagentChatUri(this._params.sessionUri) || isSubagentSession(sessionUri) ? "true" : "false",
      didBranchChange: await this._initialBranch === await this._getCurrentBranchName() ? 0 : 1,
      timeDelayMs,
      originalCharCount: this._tracker.getOriginalCharacterCount(),
      originalLineCount: originalLineCounts.insertedLineCounts,
      originalDeletedLineCount: originalLineCounts.deletedLineCounts,
      arc: this._tracker.getAcceptedRestrainedCharactersCount(),
      currentLineCount: currentLineCounts.insertedLineCounts,
      currentDeletedLineCount: currentLineCounts.deletedLineCounts
    };
    this._telemetryService.publicLog2("editTelemetry.reportEditArc", event);
    if (provider === "copilotcli" && isAgentHostTelemetryService(this._telemetryService)) {
      const { didBranchChange, timeDelayMs: delay, originalCharCount, originalLineCount, originalDeletedLineCount, arc, currentLineCount, currentDeletedLineCount, ...properties } = event;
      const telemetry = this._telemetryService;
      telemetry.sendGHTelemetryEvent("vscode.editTelemetry.reportEditArc", withoutUndefined(properties), {
        didBranchChange,
        timeDelayMs: delay,
        originalCharCount,
        originalLineCount,
        originalDeletedLineCount,
        arc,
        currentLineCount,
        currentDeletedLineCount
      });
    }
    if (timeDelayMs === this._sampleScheduleMs.at(-1)) {
      this.dispose();
    }
  }
  async _getCurrentBranchName() {
    const workingDirectory = await this._gitWorkingDirectory;
    return this._gitService.getCurrentBranchName?.(workingDirectory) ?? this._gitService.getCurrentBranch(workingDirectory);
  }
}
function withoutUndefined(values) {
  const result = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== void 0) {
      result[key] = value;
    }
  }
  return result;
}
export {
  EditArcReporterService,
  IEditArcReporterService,
  NullEditArcReporterService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3NoYXJlZC9lZGl0QXJjUmVwb3J0ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTZXF1ZW5jZXJCeUtleSwgVGltZW91dFRpbWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRWRpdEFyY1RyYWNrZXIsIElBcmNUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2VkaXRBcmNUcmFja2VyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBleHRuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlVHlwZSwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlLCB0b0ZpbGVPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElFZGl0QXJjVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24sIElFZGl0QXJjVGVsZW1ldHJ5RXZlbnQgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL2VkaXRBcmNUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEVkaXRUZWxlbWV0cnlFbmFibGVkQ29uZmlnS2V5LCBwbGF0Zm9ybVJvb3RTY2hlbWEgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IElEaWZmQ29tcHV0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZGlmZkNvbXB1dGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzQWhwQ2hhdENoYW5uZWwsIGlzU3ViYWdlbnRDaGF0VXJpLCBpc1N1YmFnZW50U2Vzc2lvbiwgcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlLCBpc0FnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi9hZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRWRpdEFyY1JlcG9ydGVyTGF1bmNoUGFyYW1zIHtcblx0cmVhZG9ubHkgc2Vzc2lvblVyaTogc3RyaW5nO1xuXHRyZWFkb25seSB0dXJuSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdG9vbENhbGxJZDogc3RyaW5nO1xuXHRyZWFkb25seSBmaWxlUGF0aDogc3RyaW5nO1xuXHRyZWFkb25seSBiZWZvcmVUZXh0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFmdGVyVGV4dDogc3RyaW5nO1xuXHRyZWFkb25seSBpbml0aWFsRWRpdDogSUFyY1RleHRFZGl0O1xuXHRyZWFkb25seSBtb2RlbElkPzogc3RyaW5nO1xuXHRyZWFkb25seSB0b29sTmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgbW9kZT86IHN0cmluZztcblx0cmVhZG9ubHkgY29tcGxldGlvblRpbWU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IElFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlPignZWRpdEFyY1JlcG9ydGVyU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZXBvcnRFZGl0KHBhcmFtczogSUVkaXRBcmNSZXBvcnRlckxhdW5jaFBhcmFtcyk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBjbGFzcyBOdWxsRWRpdEFyY1JlcG9ydGVyU2VydmljZSBpbXBsZW1lbnRzIElFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRhc3luYyByZXBvcnRFZGl0KF9wYXJhbXM6IElFZGl0QXJjUmVwb3J0ZXJMYXVuY2hQYXJhbXMpOiBQcm9taXNlPHZvaWQ+IHsgfVxufVxuXG5pbnRlcmZhY2UgSVJlc291cmNlU3RhdGUgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGdpdFdvcmtpbmdEaXJlY3Rvcnk6IFByb21pc2U8VVJJPjtcblx0cmVhZG9ubHkgcmVwb3J0ZXJzOiBTZXQ8RWRpdEFyY1JlcG9ydGVyPjtcblx0bG9naWNhbFRleHQ6IHN0cmluZztcblx0aXNEaXNwb3Npbmc6IGJvb2xlYW47XG59XG5cbmNvbnN0IFNBTVBMRV9TQ0hFRFVMRV9NUyA9IFswLCA2MF8wMDAsIDMwMF8wMDBdO1xuY29uc3QgTUFYX1RSQUNLRURfRklMRV9TSVpFX0NIQVJTID0gNSAqIDEwMjQgKiAxMDI0O1xuY29uc3QgTUFYX1JFUE9SVEVSU19QRVJfUkVTT1VSQ0UgPSAyMDtcbmNvbnN0IE1BWF9SRVBPUlRFUlNfSE9TVF9XSURFID0gMjAwO1xuY29uc3QgTUFYX1JFVEFJTkVEX0NIQVJBQ1RFUlNfSE9TVF9XSURFID0gMTAwICogMTAyNCAqIDEwMjQ7XG5cbmV4cG9ydCBjbGFzcyBFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2VTZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyQnlLZXk8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElSZXNvdXJjZVN0YXRlPigpKTtcblx0cHJpdmF0ZSBfcmVwb3J0ZXJDb3VudCA9IDA7XG5cdHByaXZhdGUgX3JldGFpbmVkQ2hhcmFjdGVycyA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2FtcGxlU2NoZWR1bGVNczogcmVhZG9ubHkgbnVtYmVyW10gPSBTQU1QTEVfU0NIRURVTEVfTVMsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRGlmZkNvbXB1dGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RpZmZDb21wdXRlU2VydmljZTogSURpZmZDb21wdXRlU2VydmljZSxcblx0XHRASUFnZW50SG9zdEdpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UsXG5cdFx0QElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkUm9vdENvbmZpZ0NoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VBbGxSZXBvcnRlcnMoJ2NvbmZpZ3VyYXRpb24gZGlzYWJsZWQnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyByZXBvcnRFZGl0KHBhcmFtczogSUVkaXRBcmNSZXBvcnRlckxhdW5jaFBhcmFtcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUocGFyYW1zLmZpbGVQYXRoKTtcblx0XHRjb25zdCBrZXkgPSBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5nZXRDb21wYXJpc29uS2V5KHJlc291cmNlKTtcblx0XHRhd2FpdCB0aGlzLl9yZXNvdXJjZVNlcXVlbmNlci5xdWV1ZShrZXksIGFzeW5jICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5faXNFbmFibGVkKCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0VkaXRBcmNSZXBvcnRlcl0gU2tpcHBpbmcgJHtwYXJhbXMuZmlsZVBhdGh9OiB0ZWxlbWV0cnkgaXMgZGlzYWJsZWRgKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dG5hbWUocGFyYW1zLmZpbGVQYXRoKS50b0xvd2VyQ2FzZSgpID09PSAnLmlweW5iJykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbRWRpdEFyY1JlcG9ydGVyXSBTa2lwcGluZyBub3RlYm9vazogJHtwYXJhbXMuZmlsZVBhdGh9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJldGFpbmVkQ2hhcmFjdGVycyA9IHBhcmFtcy5iZWZvcmVUZXh0Lmxlbmd0aCArIHBhcmFtcy5hZnRlclRleHQubGVuZ3RoO1xuXHRcdFx0aWYgKE1hdGgubWF4KHBhcmFtcy5iZWZvcmVUZXh0Lmxlbmd0aCwgcGFyYW1zLmFmdGVyVGV4dC5sZW5ndGgpID4gTUFYX1RSQUNLRURfRklMRV9TSVpFX0NIQVJTKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0VkaXRBcmNSZXBvcnRlcl0gU2tpcHBpbmcgb3ZlcnNpemVkIGZpbGU6ICR7cGFyYW1zLmZpbGVQYXRofWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCBzdGF0ZSA9IHRoaXMuX3Jlc291cmNlcy5nZXQoa2V5KTtcblx0XHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0XHRpZiAoIWF3YWl0IHRoaXMuX2FwcGx5Q29tcGxldGVkRWRpdChzdGF0ZSwgcGFyYW1zKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXRoaXMuX2lzRW5hYmxlZCgpIHx8IHRoaXMuX3Jlc291cmNlcy5nZXQoa2V5KSAhPT0gc3RhdGUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHN0YXRlICYmIHN0YXRlLnJlcG9ydGVycy5zaXplID49IE1BWF9SRVBPUlRFUlNfUEVSX1JFU09VUkNFKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0VkaXRBcmNSZXBvcnRlcl0gU2tpcHBpbmcgZWRpdDogcGVyLXJlc291cmNlIHJlcG9ydGVyIGxpbWl0IHJlYWNoZWQgZm9yICR7cGFyYW1zLmZpbGVQYXRofWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fcmVwb3J0ZXJDb3VudCA+PSBNQVhfUkVQT1JURVJTX0hPU1RfV0lERSB8fCB0aGlzLl9yZXRhaW5lZENoYXJhY3RlcnMgKyByZXRhaW5lZENoYXJhY3RlcnMgPiBNQVhfUkVUQUlORURfQ0hBUkFDVEVSU19IT1NUX1dJREUpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbRWRpdEFyY1JlcG9ydGVyXSBTa2lwcGluZyBlZGl0OiBob3N0IHJlcG9ydGVyIG1lbW9yeSBsaW1pdCByZWFjaGVkYCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0c3RhdGUgPz89IHRoaXMuX2NyZWF0ZVJlc291cmNlU3RhdGUoa2V5LCByZXNvdXJjZSwgcGFyYW1zLmFmdGVyVGV4dCk7XG5cdFx0XHRjb25zdCByZXNvdXJjZVN0YXRlID0gc3RhdGU7XG5cdFx0XHRjb25zdCByZXBvcnRlcjogRWRpdEFyY1JlcG9ydGVyID0gbmV3IEVkaXRBcmNSZXBvcnRlcihwYXJhbXMsIHRoaXMuX3NhbXBsZVNjaGVkdWxlTXMsIHJlc291cmNlU3RhdGUuZ2l0V29ya2luZ0RpcmVjdG9yeSwgdGhpcy5fZ2l0U2VydmljZSwgdGhpcy5fdGVsZW1ldHJ5U2VydmljZSwgdGhpcy5fbG9nU2VydmljZSwgKHRpbWVEZWxheU1zKTogUHJvbWlzZTx2b2lkPiA9PiB0aGlzLnJlY29uY2lsZUFuZFNhbXBsZShyZXNvdXJjZVN0YXRlLCByZXBvcnRlciwgdGltZURlbGF5TXMpLCAoKSA9PiB7XG5cdFx0XHRcdHJlc291cmNlU3RhdGUucmVwb3J0ZXJzLmRlbGV0ZShyZXBvcnRlcik7XG5cdFx0XHRcdHRoaXMuX3JlcG9ydGVyQ291bnQtLTtcblx0XHRcdFx0dGhpcy5fcmV0YWluZWRDaGFyYWN0ZXJzIC09IHJldGFpbmVkQ2hhcmFjdGVycztcblx0XHRcdFx0aWYgKCFyZXNvdXJjZVN0YXRlLmlzRGlzcG9zaW5nICYmIHJlc291cmNlU3RhdGUucmVwb3J0ZXJzLnNpemUgPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9yZXNvdXJjZXMuZGVsZXRlQW5kRGlzcG9zZShrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHJlc291cmNlU3RhdGUucmVwb3J0ZXJzLmFkZChyZXBvcnRlcik7XG5cdFx0XHR0aGlzLl9yZXBvcnRlckNvdW50Kys7XG5cdFx0XHR0aGlzLl9yZXRhaW5lZENoYXJhY3RlcnMgKz0gcmV0YWluZWRDaGFyYWN0ZXJzO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlUmVzb3VyY2VTdGF0ZShrZXk6IHN0cmluZywgcmVzb3VyY2U6IFVSSSwgbG9naWNhbFRleHQ6IHN0cmluZyk6IElSZXNvdXJjZVN0YXRlIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBmaWxlRGlyZWN0b3J5ID0gVVJJLmZpbGUoZGlybmFtZShyZXNvdXJjZS5mc1BhdGgpKTtcblx0XHRjb25zdCBzdGF0ZTogSVJlc291cmNlU3RhdGUgPSB7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdGdpdFdvcmtpbmdEaXJlY3Rvcnk6IHRoaXMuX2dpdFNlcnZpY2UuZ2V0UmVwb3NpdG9yeVJvb3QoZmlsZURpcmVjdG9yeSkudGhlbihyZXBvc2l0b3J5Um9vdCA9PiByZXBvc2l0b3J5Um9vdCA/PyBmaWxlRGlyZWN0b3J5KSxcblx0XHRcdGxvZ2ljYWxUZXh0LFxuXHRcdFx0cmVwb3J0ZXJzOiBuZXcgU2V0KCksXG5cdFx0XHRpc0Rpc3Bvc2luZzogZmFsc2UsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHN0YXRlLmlzRGlzcG9zaW5nID0gdHJ1ZTtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCByZXBvcnRlciBvZiBbLi4uc3RhdGUucmVwb3J0ZXJzXSkge1xuXHRcdFx0XHRyZXBvcnRlci5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB3YXRjaGVyID0gc3RvcmUuYWRkKHRoaXMuX2ZpbGVTZXJ2aWNlLmNyZWF0ZVdhdGNoZXIoVVJJLmZpbGUoZGlybmFtZShyZXNvdXJjZS5mc1BhdGgpKSwgeyByZWN1cnNpdmU6IGZhbHNlLCBleGNsdWRlczogW10gfSkpO1xuXHRcdFx0c3RvcmUuYWRkKHdhdGNoZXIub25EaWRDaGFuZ2UoZXZlbnQgPT4ge1xuXHRcdFx0XHRpZiAoZXZlbnQuY29udGFpbnMocmVzb3VyY2UsIEZpbGVDaGFuZ2VUeXBlLkFEREVELCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVELCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSkge1xuXHRcdFx0XHRcdHRoaXMuX3Jlc291cmNlU2VxdWVuY2VyLnF1ZXVlKGtleSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fcmVjb25jaWxlRnJvbURpc2soc3RhdGUsIGZhbHNlKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0VkaXRBcmNSZXBvcnRlcl0gV2F0Y2hlciByZWNvbmNpbGlhdGlvbiBmYWlsZWQgZm9yICR7cmVzb3VyY2UuZnNQYXRofWAsIGVycm9yKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtFZGl0QXJjUmVwb3J0ZXJdIEZhaWxlZCB0byB3YXRjaCAke3Jlc291cmNlLmZzUGF0aH07IGRlbGF5ZWQgc2FtcGxlcyB3aWxsIHVzZSBmb3JjZWQgcmVjb25jaWxpYXRpb25gLCBlcnJvcik7XG5cdFx0fVxuXHRcdHRoaXMuX3Jlc291cmNlcy5zZXQoa2V5LCBzdGF0ZSk7XG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXBwbHlDb21wbGV0ZWRFZGl0KHN0YXRlOiBJUmVzb3VyY2VTdGF0ZSwgcGFyYW1zOiBJRWRpdEFyY1JlcG9ydGVyTGF1bmNoUGFyYW1zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHN0YXRlLmxvZ2ljYWxUZXh0ID09PSBwYXJhbXMuYWZ0ZXJUZXh0KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHN0YXRlLmxvZ2ljYWxUZXh0ID09PSBwYXJhbXMuYmVmb3JlVGV4dCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fYXBwbHlFZGl0KHN0YXRlLCBwYXJhbXMuaW5pdGlhbEVkaXQsIHBhcmFtcy5hZnRlclRleHQpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGV0YWlsZWQgPSBhd2FpdCB0aGlzLl9kaWZmQ29tcHV0ZVNlcnZpY2UuY29tcHV0ZURldGFpbGVkRGlmZihzdGF0ZS5sb2dpY2FsVGV4dCwgcGFyYW1zLmFmdGVyVGV4dCk7XG5cdFx0aWYgKGRldGFpbGVkLmhpdFRpbWVvdXQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0VkaXRBcmNSZXBvcnRlcl0gQ291bGQgbm90IHVwZGF0ZSBvbGRlciByZXBvcnRlcnMgYmVmb3JlICR7cGFyYW1zLnRvb2xDYWxsSWR9OiBkZXRhaWxlZCBkaWZmIHRpbWVkIG91dGApO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9hcHBseUVkaXQoc3RhdGUsIHsgcmVwbGFjZW1lbnRzOiBkZXRhaWxlZC5yZXBsYWNlbWVudHMgfSwgcGFyYW1zLmFmdGVyVGV4dCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWNvbmNpbGVGcm9tRGlzayhzdGF0ZTogSVJlc291cmNlU3RhdGUsIHNhbXBsZTogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGxldCBjdXJyZW50VGV4dDogc3RyaW5nO1xuXHRcdHRyeSB7XG5cdFx0XHRjdXJyZW50VGV4dCA9IChhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShzdGF0ZS5yZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdGN1cnJlbnRUZXh0ID0gJyc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtFZGl0QXJjUmVwb3J0ZXJdIEZhaWxlZCB0byByZWFkICR7c3RhdGUucmVzb3VyY2UuZnNQYXRofSR7c2FtcGxlID8gJyBiZWZvcmUgc2FtcGxlJyA6ICcnfWAsIGVycm9yKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY3VycmVudFRleHQgPT09IHN0YXRlLmxvZ2ljYWxUZXh0KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBkZXRhaWxlZCA9IGF3YWl0IHRoaXMuX2RpZmZDb21wdXRlU2VydmljZS5jb21wdXRlRGV0YWlsZWREaWZmKHN0YXRlLmxvZ2ljYWxUZXh0LCBjdXJyZW50VGV4dCk7XG5cdFx0aWYgKGRldGFpbGVkLmhpdFRpbWVvdXQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0VkaXRBcmNSZXBvcnRlcl0gRGV0YWlsZWQgZGlmZiB0aW1lZCBvdXQgZm9yICR7c3RhdGUucmVzb3VyY2UuZnNQYXRofWApO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9hcHBseUVkaXQoc3RhdGUsIHsgcmVwbGFjZW1lbnRzOiBkZXRhaWxlZC5yZXBsYWNlbWVudHMgfSwgY3VycmVudFRleHQpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXBwbHlFZGl0KHN0YXRlOiBJUmVzb3VyY2VTdGF0ZSwgZWRpdDogSUFyY1RleHRFZGl0LCBhZnRlclRleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3QgcmVwb3J0ZXIgb2Ygc3RhdGUucmVwb3J0ZXJzKSB7XG5cdFx0XHRyZXBvcnRlci5oYW5kbGVFZGl0KGVkaXQpO1xuXHRcdH1cblx0XHRzdGF0ZS5sb2dpY2FsVGV4dCA9IGFmdGVyVGV4dDtcblx0fVxuXG5cdHByaXZhdGUgX2lzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdGVsZW1ldHJ5U2VydmljZS50ZWxlbWV0cnlMZXZlbCA+PSBUZWxlbWV0cnlMZXZlbC5VU0FHRVxuXHRcdFx0JiYgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKHBsYXRmb3JtUm9vdFNjaGVtYSwgQWdlbnRIb3N0RWRpdFRlbGVtZXRyeUVuYWJsZWRDb25maWdLZXkpICE9PSBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VBbGxSZXBvcnRlcnMocmVhc29uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcmVwb3J0ZXJDb3VudCA+IDApIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0VkaXRBcmNSZXBvcnRlcl0gRGlzcG9zaW5nICR7dGhpcy5fcmVwb3J0ZXJDb3VudH0gYWN0aXZlIHJlcG9ydGVyczogJHtyZWFzb259YCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Jlc291cmNlcy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0XHR0aGlzLl9yZXBvcnRlckNvdW50ID0gMDtcblx0XHR0aGlzLl9yZXRhaW5lZENoYXJhY3RlcnMgPSAwO1xuXHR9XG5cblx0YXN5bmMgcmVjb25jaWxlQW5kU2FtcGxlKHN0YXRlOiBJUmVzb3VyY2VTdGF0ZSwgcmVwb3J0ZXI6IEVkaXRBcmNSZXBvcnRlciwgdGltZURlbGF5TXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGtleSA9IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmdldENvbXBhcmlzb25LZXkoc3RhdGUucmVzb3VyY2UpO1xuXHRcdGF3YWl0IHRoaXMuX3Jlc291cmNlU2VxdWVuY2VyLnF1ZXVlKGtleSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRyZXBvcnRlci5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aW1lRGVsYXlNcyAhPT0gMCAmJiAhYXdhaXQgdGhpcy5fcmVjb25jaWxlRnJvbURpc2soc3RhdGUsIHRydWUpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHJlcG9ydGVyLmVtaXQodGltZURlbGF5TXMpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIEVkaXRBcmNSZXBvcnRlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFja2VyOiBFZGl0QXJjVHJhY2tlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfdW5pcXVlRWRpdElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luaXRpYWxCcmFuY2g6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSBfc2FtcGxlSW5kZXggPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BhcmFtczogSUVkaXRBcmNSZXBvcnRlckxhdW5jaFBhcmFtcyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zYW1wbGVTY2hlZHVsZU1zOiByZWFkb25seSBudW1iZXJbXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9naXRXb3JraW5nRGlyZWN0b3J5OiBQcm9taXNlPFVSST4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2FtcGxlOiAodGltZURlbGF5TXM6IG51bWJlcikgPT4gUHJvbWlzZTx2b2lkPixcblx0XHRvbkRpc3Bvc2U6ICgpID0+IHZvaWQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fdHJhY2tlciA9IG5ldyBFZGl0QXJjVHJhY2tlcihfcGFyYW1zLmJlZm9yZVRleHQsIF9wYXJhbXMuaW5pdGlhbEVkaXQpO1xuXHRcdHRoaXMuX2luaXRpYWxCcmFuY2ggPSB0aGlzLl9nZXRDdXJyZW50QnJhbmNoTmFtZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZShvbkRpc3Bvc2UpKTtcblx0XHR0aGlzLl9zY2hlZHVsZU5leHQoKTtcblx0fVxuXG5cdGhhbmRsZUVkaXQoZWRpdDogSUFyY1RleHRFZGl0KTogdm9pZCB7XG5cdFx0dGhpcy5fdHJhY2tlci5oYW5kbGVFZGl0cyhlZGl0KTtcblx0fVxuXG5cdHByaXZhdGUgX3NjaGVkdWxlTmV4dCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc2FtcGxlSW5kZXggPj0gdGhpcy5fc2FtcGxlU2NoZWR1bGVNcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkZWxheSA9IE1hdGgubWF4KDAsIHRoaXMuX3BhcmFtcy5jb21wbGV0aW9uVGltZSArIHRoaXMuX3NhbXBsZVNjaGVkdWxlTXNbdGhpcy5fc2FtcGxlSW5kZXhdIC0gRGF0ZS5ub3coKSk7XG5cdFx0Y29uc3QgdGltZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGltZW91dFRpbWVyKCkpO1xuXHRcdHRpbWVyLnNldElmTm90U2V0KGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRpbWVEZWxheU1zID0gdGhpcy5fc2FtcGxlU2NoZWR1bGVNc1t0aGlzLl9zYW1wbGVJbmRleCsrXTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3NhbXBsZSh0aW1lRGVsYXlNcyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtFZGl0QXJjUmVwb3J0ZXJdIEZhaWxlZCB0byBzYW1wbGUgJHt0aGlzLl9wYXJhbXMuZmlsZVBhdGh9IGFmdGVyICR7dGltZURlbGF5TXN9bXNgLCBlcnJvcik7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9zY2hlZHVsZU5leHQoKTtcblx0XHRcdH1cblx0XHR9LCBkZWxheSk7XG5cdH1cblxuXHRhc3luYyBlbWl0KHRpbWVEZWxheU1zOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gaXNBaHBDaGF0Q2hhbm5lbCh0aGlzLl9wYXJhbXMuc2Vzc2lvblVyaSkgPyBwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKHRoaXMuX3BhcmFtcy5zZXNzaW9uVXJpKSA6IHRoaXMuX3BhcmFtcy5zZXNzaW9uVXJpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gQWdlbnRTZXNzaW9uLnByb3ZpZGVyKHNlc3Npb25VcmkpID8/ICd1bmtub3duJztcblx0XHRjb25zdCBvcmlnaW5hbExpbmVDb3VudHMgPSBuZXcgRWRpdEFyY1RyYWNrZXIodGhpcy5fcGFyYW1zLmJlZm9yZVRleHQsIHRoaXMuX3BhcmFtcy5pbml0aWFsRWRpdCkuZ2V0TGluZUNvdW50SW5mbygpO1xuXHRcdGNvbnN0IGN1cnJlbnRMaW5lQ291bnRzID0gdGhpcy5fdHJhY2tlci5nZXRMaW5lQ291bnRJbmZvKCk7XG5cdFx0Y29uc3QgZXZlbnQ6IElFZGl0QXJjVGVsZW1ldHJ5RXZlbnQgPSB7XG5cdFx0XHRzb3VyY2VLZXlDbGVhbmVkOiAnc291cmNlOkNoYXQuYXBwbHlFZGl0cycsXG5cdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogdW5kZWZpbmVkLFxuXHRcdFx0b3Bwb3J0dW5pdHlJZDogdW5kZWZpbmVkLFxuXHRcdFx0ZWRpdFNlc3Npb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb25VcmkpLFxuXHRcdFx0cmVxdWVzdElkOiB0aGlzLl9wYXJhbXMudHVybklkLFxuXHRcdFx0bW9kZWxJZDogdGhpcy5fcGFyYW1zLm1vZGVsSWQsXG5cdFx0XHRsYW5ndWFnZUlkOiB1bmRlZmluZWQsXG5cdFx0XHRtb2RlOiB0aGlzLl9wYXJhbXMubW9kZSxcblx0XHRcdHVuaXF1ZUVkaXRJZDogdGhpcy5fdW5pcXVlRWRpdElkLFxuXHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRhZ2VudFNlc3Npb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb25VcmkpLFxuXHRcdFx0aXNTdWJhZ2VudFNlc3Npb246IGlzU3ViYWdlbnRDaGF0VXJpKHRoaXMuX3BhcmFtcy5zZXNzaW9uVXJpKSB8fCBpc1N1YmFnZW50U2Vzc2lvbihzZXNzaW9uVXJpKSA/ICd0cnVlJyA6ICdmYWxzZScsXG5cdFx0XHRkaWRCcmFuY2hDaGFuZ2U6IGF3YWl0IHRoaXMuX2luaXRpYWxCcmFuY2ggPT09IGF3YWl0IHRoaXMuX2dldEN1cnJlbnRCcmFuY2hOYW1lKCkgPyAwIDogMSxcblx0XHRcdHRpbWVEZWxheU1zLFxuXHRcdFx0b3JpZ2luYWxDaGFyQ291bnQ6IHRoaXMuX3RyYWNrZXIuZ2V0T3JpZ2luYWxDaGFyYWN0ZXJDb3VudCgpLFxuXHRcdFx0b3JpZ2luYWxMaW5lQ291bnQ6IG9yaWdpbmFsTGluZUNvdW50cy5pbnNlcnRlZExpbmVDb3VudHMsXG5cdFx0XHRvcmlnaW5hbERlbGV0ZWRMaW5lQ291bnQ6IG9yaWdpbmFsTGluZUNvdW50cy5kZWxldGVkTGluZUNvdW50cyxcblx0XHRcdGFyYzogdGhpcy5fdHJhY2tlci5nZXRBY2NlcHRlZFJlc3RyYWluZWRDaGFyYWN0ZXJzQ291bnQoKSxcblx0XHRcdGN1cnJlbnRMaW5lQ291bnQ6IGN1cnJlbnRMaW5lQ291bnRzLmluc2VydGVkTGluZUNvdW50cyxcblx0XHRcdGN1cnJlbnREZWxldGVkTGluZUNvdW50OiBjdXJyZW50TGluZUNvdW50cy5kZWxldGVkTGluZUNvdW50cyxcblx0XHR9O1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJRWRpdEFyY1RlbGVtZXRyeUV2ZW50LCBJRWRpdEFyY1RlbGVtZXRyeUNsYXNzaWZpY2F0aW9uPignZWRpdFRlbGVtZXRyeS5yZXBvcnRFZGl0QXJjJywgZXZlbnQpO1xuXHRcdGlmIChwcm92aWRlciA9PT0gJ2NvcGlsb3RjbGknICYmIGlzQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlKSkge1xuXHRcdFx0Y29uc3QgeyBkaWRCcmFuY2hDaGFuZ2UsIHRpbWVEZWxheU1zOiBkZWxheSwgb3JpZ2luYWxDaGFyQ291bnQsIG9yaWdpbmFsTGluZUNvdW50LCBvcmlnaW5hbERlbGV0ZWRMaW5lQ291bnQsIGFyYywgY3VycmVudExpbmVDb3VudCwgY3VycmVudERlbGV0ZWRMaW5lQ291bnQsIC4uLnByb3BlcnRpZXMgfSA9IGV2ZW50O1xuXHRcdFx0Y29uc3QgdGVsZW1ldHJ5ID0gdGhpcy5fdGVsZW1ldHJ5U2VydmljZSBhcyBJQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZTtcblx0XHRcdHRlbGVtZXRyeS5zZW5kR0hUZWxlbWV0cnlFdmVudCgndnNjb2RlLmVkaXRUZWxlbWV0cnkucmVwb3J0RWRpdEFyYycsIHdpdGhvdXRVbmRlZmluZWQocHJvcGVydGllcyksIHtcblx0XHRcdFx0ZGlkQnJhbmNoQ2hhbmdlLFxuXHRcdFx0XHR0aW1lRGVsYXlNczogZGVsYXksXG5cdFx0XHRcdG9yaWdpbmFsQ2hhckNvdW50LFxuXHRcdFx0XHRvcmlnaW5hbExpbmVDb3VudCxcblx0XHRcdFx0b3JpZ2luYWxEZWxldGVkTGluZUNvdW50LFxuXHRcdFx0XHRhcmMsXG5cdFx0XHRcdGN1cnJlbnRMaW5lQ291bnQsXG5cdFx0XHRcdGN1cnJlbnREZWxldGVkTGluZUNvdW50LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGlmICh0aW1lRGVsYXlNcyA9PT0gdGhpcy5fc2FtcGxlU2NoZWR1bGVNcy5hdCgtMSkpIHtcblx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldEN1cnJlbnRCcmFuY2hOYW1lKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IGF3YWl0IHRoaXMuX2dpdFdvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0cmV0dXJuIHRoaXMuX2dpdFNlcnZpY2UuZ2V0Q3VycmVudEJyYW5jaE5hbWU/Lih3b3JraW5nRGlyZWN0b3J5KSA/PyB0aGlzLl9naXRTZXJ2aWNlLmdldEN1cnJlbnRCcmFuY2god29ya2luZ0RpcmVjdG9yeSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gd2l0aG91dFVuZGVmaW5lZCh2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4pOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcblx0Y29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG5cdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHZhbHVlcykpIHtcblx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0W2tleV0gPSB2YWx1ZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0Isb0JBQW9CO0FBQzdDLFNBQVMsc0JBQW9DO0FBQzdDLFNBQVMsWUFBWSxlQUFlLGlCQUE4QixvQkFBb0I7QUFDdEYsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxTQUFTLGVBQWU7QUFDakMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCLHFCQUFx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QSxNQUNuQjtBQUFBLE1BQ0EsZ0JBQWdCLGFBQWEsR0FBRyxVQUFVO0FBQUEsTUFDMUMsbUJBQW1CLGtCQUFrQixLQUFLLFFBQVEsVUFBVSxLQUFLLGtCQUFrQixVQUFVLElBQUksU0FBUztBQUFBLE1BQzFHLGlCQUFpQixNQUFNLEtBQUssbUJBQW1CLE1BQU0sS0FBSyxzQkFBc0IsSUFBSSxJQUFJO0FBQUEsTUFDeEY7QUFBQSxNQUNBLG1CQUFtQixLQUFLLFNBQVMsMEJBQTBCO0FBQUEsTUFDM0QsbUJBQW1CLG1CQUFtQjtBQUFBLE1BQ3RDLDBCQUEwQixtQkFBbUI7QUFBQSxNQUM3QyxLQUFLLEtBQUssU0FBUyxxQ0FBcUM7QUFBQSxNQUN4RCxrQkFBa0Isa0JBQWtCO0FBQUEsTUFDcEMseUJBQXlCLGtCQUFrQjtBQUFBLElBQzVDO0FBQ0EsU0FBSyxrQkFBa0IsV0FBb0UsK0JBQStCLEtBQUs7QUFDL0gsUUFBSSxhQUFhLGdCQUFnQiw0QkFBNEIsS0FBSyxpQkFBaUIsR0FBRztBQUNyRixZQUFNLEVBQUUsaUJBQWlCLGFBQWEsT0FBTyxtQkFBbUIsbUJBQW1CLDBCQUEwQixLQUFLLGtCQUFrQix5QkFBeUIsR0FBRyxXQUFXLElBQUk7QUFDL0ssWUFBTSxZQUFZLEtBQUs7QUFDdkIsZ0JBQVUscUJBQXFCLHNDQUFzQyxpQkFBaUIsVUFBVSxHQUFHO0FBQUEsUUFDbEc7QUFBQSxRQUNBLGFBQWE7QUFBQSxRQUNiO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQ0EsUUFBSSxnQkFBZ0IsS0FBSyxrQkFBa0IsR0FBRyxFQUFFLEdBQUc7QUFDbEQsV0FBSyxRQUFRO0FBQUEsSUFDZDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsd0JBQXFEO0FBQ2xFLFVBQU0sbUJBQW1CLE1BQU0sS0FBSztBQUNwQyxXQUFPLEtBQUssWUFBWSx1QkFBdUIsZ0JBQWdCLEtBQUssS0FBSyxZQUFZLGlCQUFpQixnQkFBZ0I7QUFBQSxFQUN2SDtBQUNEO0FBRUEsU0FBUyxpQkFBaUIsUUFBb0U7QUFDN0YsUUFBTSxTQUFpQyxDQUFDO0FBQ3hDLGFBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxPQUFPLFFBQVEsTUFBTSxHQUFHO0FBQ2xELFFBQUksVUFBVSxRQUFXO0FBQ3hCLGFBQU8sR0FBRyxJQUFJO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbXQp9Cg==
