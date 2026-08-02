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
import { execFile } from "child_process";
import { promisify } from "util";
import { IntervalTimer, SequencerByKey } from "../../../../base/common/async.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { dirname } from "../../../../base/common/path.js";
import { extUriBiasedIgnorePathCase } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../../files/common/files.js";
import { ILogService } from "../../../log/common/log.js";
import { sendEditSourcesDetailsTelemetry } from "../../../telemetry/common/editTelemetry.js";
import { ITelemetryService, TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { AgentSession } from "../../common/agentService.js";
import { IDiffComputeService } from "../../common/diffComputeService.js";
import { createFileEditContentDigest, MAX_EDIT_ATTRIBUTION_FILE_SIZE } from "../../common/fileEditAttribution.js";
const MAX_TOTAL_TRACKED_TEXT = 20 * 1024 * 1024;
const MAX_TRACKED_RESOURCES = 100;
const MAX_INTERVALS_PER_RESOURCE = 1e4;
const MAX_SETTLED_FLUSHES = 1e3;
const MAX_STANDALONE_OWNERSHIP = 1e3;
const MAX_NON_REPOSITORY_DIRECTORIES = 1e3;
const PREPARED_FLUSH_TTL = 5 * 60 * 1e3;
const SETTLED_FLUSH_TTL = 10 * 60 * 1e3;
const STANDALONE_OWNERSHIP_TTL = 10 * 60 * 60 * 1e3;
const NON_REPOSITORY_DIRECTORY_TTL = 10 * 60 * 1e3;
const GIT_STATE_POLL_INTERVAL = 3e4;
const GIT_STATE_TIMEOUT = 1e4;
const execFileAsync = promisify(execFile);
let AgentEditAttributionService = class extends Disposable {
  constructor(_gitStateReader = readGitState, _now = Date.now, _fileService, _diffComputeService, _telemetryService, _logService) {
    super();
    this._gitStateReader = _gitStateReader;
    this._now = _now;
    this._fileService = _fileService;
    this._diffComputeService = _diffComputeService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this._resources = /* @__PURE__ */ new Map();
    this._claimedResources = /* @__PURE__ */ new Set();
    this._recordingEdits = /* @__PURE__ */ new Set();
    this._fileSequencer = new SequencerByKey();
    this._preparedFlushes = /* @__PURE__ */ new Map();
    this._preparingFlushes = /* @__PURE__ */ new Map();
    this._settledFlushes = /* @__PURE__ */ new Map();
    this._standaloneOwnership = /* @__PURE__ */ new Map();
    this._repositories = /* @__PURE__ */ new Map();
    this._nonRepositoryDirectories = /* @__PURE__ */ new Map();
    this._trackedTextLength = 0;
    this._sequence = 0;
    this._generation = 0;
    this._enabled = true;
    this._register(new IntervalTimer()).cancelAndSet(() => {
      void this._flushAll("10hours");
    }, 10 * 60 * 60 * 1e3);
    this._register(new IntervalTimer()).cancelAndSet(() => {
      void this.checkGitState();
    }, GIT_STATE_POLL_INTERVAL);
  }
  setEnabled(enabled) {
    if (!this._enabled || enabled) {
      return;
    }
    this._enabled = false;
    this._generation++;
    this._resources.clear();
    this._claimedResources.clear();
    this._recordingEdits.clear();
    this._preparedFlushes.clear();
    this._preparingFlushes.clear();
    this._settledFlushes.clear();
    this._standaloneOwnership.clear();
    this._repositories.clear();
    this._nonRepositoryDirectories.clear();
    this._trackedTextLength = 0;
  }
  async recordEdit(edit) {
    if (!this._enabled || this._telemetryService.telemetryLevel < TelemetryLevel.USAGE) {
      return void 0;
    }
    if (Math.max(edit.beforeText.length, edit.afterText.length) > MAX_EDIT_ATTRIBUTION_FILE_SIZE) {
      return {
        version: 1,
        editId: generateUuid(),
        sequence: ++this._sequence,
        status: "skipped",
        reason: "fileTooLarge",
        insertedCount: edit.changes.reduce((sum, change) => sum + change.newText.length, 0)
      };
    }
    this._recordingEdits.add(edit);
    try {
      const fileKey = this._filePathKey(edit.filePath);
      return await this._fileSequencer.queue(fileKey, () => this._recordEdit(edit, this._generation, fileKey));
    } finally {
      this._recordingEdits.delete(edit);
    }
  }
  async _recordEdit(edit, generation, fileKey) {
    const key = resourceKey(edit.sessionUri, edit.filePath);
    await this._ensureCapacity(key, edit.afterText.length, generation, fileKey);
    if (!this._isCurrentGeneration(generation)) {
      return void 0;
    }
    let resource = this._resources.get(key);
    const repository = resource?.repositoryRoot ? this._repositories.get(resource.repositoryRoot) : await this._getOrCreateRepository(edit.filePath, generation);
    if (!this._isCurrentGeneration(generation)) {
      return void 0;
    }
    if (!resource) {
      resource = {
        key,
        sessionUri: edit.sessionUri,
        filePath: edit.filePath,
        currentContent: edit.beforeText,
        intervals: [],
        sources: /* @__PURE__ */ new Map(),
        repositoryRoot: repository?.root,
        lastSequence: 0
      };
      this._resources.set(key, resource);
      this._trackedTextLength += edit.beforeText.length;
    } else {
      resource.repositoryRoot = repository?.root;
      this._resources.delete(key);
      this._resources.set(key, resource);
    }
    if (resource.currentContent !== edit.beforeText) {
      const bridge = await this._diffComputeService.computeDiffCounts(resource.currentContent, edit.beforeText);
      if (!this._isCurrentGeneration(generation)) {
        return void 0;
      }
      this._applyChanges(resource, bridge.changes, void 0, edit.beforeText);
    }
    const provider = AgentSession.provider(edit.sessionUri) ?? "unknown";
    const modelSegment = edit.modelId ? `-$modelId:${edit.modelId}` : "";
    const sourceKey = `source:Chat.applyEdits${modelSegment}-$harness:${provider}-$origin:agentHost`;
    let source = resource.sources.get(sourceKey);
    if (!source) {
      source = {
        sourceKey,
        sourceKeyCleaned: `source:Chat.applyEdits-$harness:${provider}-$origin:agentHost`,
        modelId: edit.modelId,
        conversationId: AgentSession.id(edit.sessionUri),
        requestId: edit.turnId,
        harness: provider,
        insertedCount: 0
      };
      resource.sources.set(sourceKey, source);
    }
    this._applyChanges(resource, edit.changes, source, edit.afterText);
    const marker = {
      version: 1,
      editId: generateUuid(),
      sequence: ++this._sequence,
      beforeDigest: createFileEditContentDigest(edit.beforeText),
      afterDigest: createFileEditContentDigest(edit.afterText)
    };
    resource.lastSequence = marker.sequence;
    if (resource.intervals.length > MAX_INTERVALS_PER_RESOURCE) {
      await this._flushStandalone(resource, "closed", generation, true);
      return this._isCurrentGeneration(generation) ? marker : void 0;
    }
    return marker;
  }
  async flushSession(sessionUri) {
    const generation = this._generation;
    if (!this._isCurrentGeneration(generation)) {
      return;
    }
    const resources = Array.from(this._resources.values()).filter((resource) => resource.sessionUri === sessionUri);
    await Promise.allSettled(resources.map((resource) => this._flushStandalone(resource, "closed", generation)));
  }
  async prepareFlush(params) {
    const generation = this._generation;
    if (!this._isCurrentGeneration(generation)) {
      return void 0;
    }
    await this._expireFlushState();
    if (params.isDirty) {
      return void 0;
    }
    const preparing = this._preparingFlushes.get(params.flushToken);
    if (preparing) {
      return preparing;
    }
    const existing = this._preparedFlushes.get(params.flushToken);
    if (existing) {
      return {
        flushToken: existing.token,
        agentModifiedCount: existing.agentModifiedCount,
        lastSequence: existing.lastSequence
      };
    }
    if (this._settledFlushes.has(params.flushToken)) {
      return void 0;
    }
    const prepare = this._prepareFlush(params, generation);
    this._preparingFlushes.set(params.flushToken, prepare);
    try {
      return await prepare;
    } finally {
      if (this._preparingFlushes.get(params.flushToken) === prepare) {
        this._preparingFlushes.delete(params.flushToken);
      }
    }
  }
  async _prepareFlush(params, generation) {
    return this._fileSequencer.queue(this._filePathKey(params.resource.fsPath), () => this._prepareFlushLocked(params, generation));
  }
  async _prepareFlushLocked(params, generation) {
    const standaloneOwnershipKey = this._filePathKey(params.resource.fsPath);
    let standaloneOwnership = this._standaloneOwnership.get(standaloneOwnershipKey);
    if (standaloneOwnership) {
      this._standaloneOwnership.delete(standaloneOwnershipKey);
    }
    const resources = Array.from(this._resources.values()).filter((resource) => extUriBiasedIgnorePathCase.isEqual(URI.file(resource.filePath), params.resource));
    if (resources.length === 0 && !standaloneOwnership) {
      return void 0;
    }
    const preparedResources = [];
    try {
      for (const resource of resources) {
        const prepared2 = await this._prepareResourceNow(resource, params.trigger, params.statsUuid, generation);
        if (!this._isCurrentGeneration(generation)) {
          return void 0;
        }
        if (prepared2) {
          preparedResources.push(prepared2);
        }
      }
    } catch (error) {
      for (const prepared2 of preparedResources) {
        this._restoreResources(prepared2.resources);
      }
      if (standaloneOwnership) {
        this._restoreStandaloneOwnership([[standaloneOwnershipKey, standaloneOwnership]]);
      }
      throw error;
    }
    if (!standaloneOwnership) {
      standaloneOwnership = this._standaloneOwnership.get(standaloneOwnershipKey);
      if (standaloneOwnership) {
        this._standaloneOwnership.delete(standaloneOwnershipKey);
      }
    }
    if (preparedResources.length === 0 && !standaloneOwnership) {
      return void 0;
    }
    const prepared = combinePreparedFlushes(
      preparedResources,
      standaloneOwnershipKey,
      params.trigger,
      params.statsUuid,
      params.flushToken,
      params.languageId,
      standaloneOwnership ? [[standaloneOwnershipKey, standaloneOwnership]] : [],
      this._now()
    );
    if (!this._isCurrentGeneration(generation)) {
      return void 0;
    }
    if (this._settledFlushes.has(params.flushToken)) {
      this._restoreResources(prepared.resources);
      this._restoreStandaloneOwnership(prepared.standaloneOwnership);
      return void 0;
    }
    this._preparedFlushes.set(prepared.token, prepared);
    return {
      flushToken: prepared.token,
      agentModifiedCount: prepared.agentModifiedCount,
      lastSequence: prepared.lastSequence
    };
  }
  async commitFlush(params) {
    if (!this._enabled) {
      return { outcome: "missing", agentModifiedCount: 0 };
    }
    await this._expireFlushState();
    const prepared = this._preparedFlushes.get(params.flushToken);
    if (!prepared) {
      return this._settledFlushes.get(params.flushToken)?.result ?? { outcome: "missing", agentModifiedCount: 0 };
    }
    return this._fileSequencer.queue(prepared.fileKey, async () => this._commitFlushNow(params));
  }
  _commitFlushNow(params) {
    if (!this._enabled) {
      return { outcome: "missing", agentModifiedCount: 0 };
    }
    const prepared = this._preparedFlushes.get(params.flushToken);
    if (!prepared) {
      return this._settledFlushes.get(params.flushToken)?.result ?? { outcome: "missing", agentModifiedCount: 0 };
    }
    this._preparedFlushes.delete(params.flushToken);
    this._releaseResourceClaims(prepared.resources);
    this._emitTelemetry(prepared, params.totalModifiedCount);
    const result = { outcome: "committed", agentModifiedCount: prepared.agentModifiedCount };
    this._recordSettledFlush(params.flushToken, result);
    this._cleanupRepositories(prepared.resources);
    return result;
  }
  async cancelFlush(params) {
    const preparing = this._preparingFlushes.get(params.flushToken);
    if (preparing) {
      try {
        await preparing;
      } catch {
      }
    }
    if (!this._enabled) {
      return { outcome: "missing", agentModifiedCount: 0 };
    }
    await this._expireFlushState();
    const settled = this._settledFlushes.get(params.flushToken);
    if (settled) {
      return settled.result;
    }
    const prepared = this._preparedFlushes.get(params.flushToken);
    if (!prepared) {
      const result = { outcome: "cancelled", agentModifiedCount: 0 };
      this._recordSettledFlush(params.flushToken, result);
      return result;
    }
    return this._fileSequencer.queue(prepared.fileKey, async () => this._cancelFlushNow(params));
  }
  _cancelFlushNow(params) {
    if (!this._enabled) {
      return { outcome: "missing", agentModifiedCount: 0 };
    }
    const settled = this._settledFlushes.get(params.flushToken);
    if (settled) {
      return settled.result;
    }
    const prepared = this._preparedFlushes.get(params.flushToken);
    if (!prepared) {
      const result2 = { outcome: "cancelled", agentModifiedCount: 0 };
      this._recordSettledFlush(params.flushToken, result2);
      return result2;
    }
    this._preparedFlushes.delete(params.flushToken);
    if (prepared.resources.some((resource) => this._resources.has(resource.key))) {
      this._releaseResourceClaims(prepared.resources);
      this._emitTelemetry(prepared, prepared.agentModifiedCount);
      const result2 = { outcome: "committed", agentModifiedCount: prepared.agentModifiedCount };
      this._recordSettledFlush(params.flushToken, result2);
      this._cleanupRepositories(prepared.resources);
      return result2;
    } else {
      this._restoreResources(prepared.resources);
      this._restoreStandaloneOwnership(prepared.standaloneOwnership);
    }
    const result = { outcome: "cancelled", agentModifiedCount: 0 };
    this._recordSettledFlush(params.flushToken, result);
    this._cleanupRepositories(prepared.resources);
    return result;
  }
  async _ensureCapacity(key, nextLength, generation, lockedFileKey) {
    while (this._isCurrentGeneration(generation)) {
      const existing = this._resources.get(key);
      const projectedTextLength = this._trackedTextLength - (existing?.currentContent.length ?? 0) + nextLength;
      if (this._resources.size < MAX_TRACKED_RESOURCES && projectedTextLength <= MAX_TOTAL_TRACKED_TEXT) {
        return;
      }
      const sameFileResource = Array.from(this._resources.values()).find((resource2) => this._filePathKey(resource2.filePath) === lockedFileKey);
      const resource = existing ?? sameFileResource ?? this._resources.values().next().value;
      if (!resource) {
        return;
      }
      await this._flushStandalone(resource, "closed", generation, this._filePathKey(resource.filePath) === lockedFileKey);
    }
  }
  _applyChanges(resource, changes, source, afterText, updateTrackedTextLength = true) {
    const normalizedChanges = validateChanges(resource.currentContent, afterText, changes) ? changes : [createMinimalChange(resource.currentContent, afterText)];
    const intervals = transformIntervals(resource.intervals, normalizedChanges);
    let delta = 0;
    for (const change of normalizedChanges) {
      if (source && change.newText.length > 0) {
        const start = change.startOffset + delta;
        intervals.push({
          start,
          endExclusive: start + change.newText.length,
          sourceKey: source.sourceKey
        });
        source.insertedCount += change.newText.length;
      }
      delta += change.newText.length - (change.endOffsetExclusive - change.startOffset);
    }
    intervals.sort((a, b) => a.start - b.start);
    resource.intervals = mergeIntervals(intervals);
    if (updateTrackedTextLength) {
      this._trackedTextLength += afterText.length - resource.currentContent.length;
    }
    resource.currentContent = afterText;
  }
  async _flushAll(trigger) {
    const generation = this._generation;
    if (!this._isCurrentGeneration(generation)) {
      return;
    }
    await Promise.allSettled(Array.from(this._resources.values(), (resource) => this._flushStandalone(resource, trigger, generation)));
  }
  async checkGitState() {
    const generation = this._generation;
    if (!this._isCurrentGeneration(generation)) {
      return;
    }
    await this._expireFlushState();
    for (const repository of Array.from(this._repositories.values())) {
      let current;
      try {
        current = await this._gitStateReader(repository.root);
      } catch (error) {
        this._logService.warn(`[AgentEditAttributionService] Failed to read Git state for ${repository.root}: ${error}`);
        continue;
      }
      if (!this._isCurrentGeneration(generation)) {
        return;
      }
      if (!current) {
        continue;
      }
      const trigger = current.branch !== repository.branch ? "branchChange" : current.head !== repository.head ? "hashChange" : void 0;
      if (!trigger) {
        continue;
      }
      const resources = Array.from(this._resources.values()).filter((resource) => resource.repositoryRoot === repository.root && !this._isRecordingFile(resource.filePath));
      const results = await Promise.allSettled(resources.map((resource) => this._flushStandalone(resource, trigger, generation)));
      const hasPendingResources = Array.from(this._resources.values()).some((resource) => resource.repositoryRoot === repository.root);
      const hasClaimedResources = Array.from(this._claimedResources).some((resource) => resource.repositoryRoot === repository.root);
      const hasRecordingEdits = Array.from(this._recordingEdits).some((edit) => extUriBiasedIgnorePathCase.isEqualOrParent(URI.file(edit.filePath), URI.file(repository.root)));
      if (this._isCurrentGeneration(generation) && results.every((result) => result.status === "fulfilled") && !hasPendingResources && !hasClaimedResources && !hasRecordingEdits) {
        repository.branch = current.branch;
        repository.head = current.head;
      }
    }
  }
  async _getOrCreateRepository(filePath, generation) {
    const workingDirectory = dirname(filePath);
    const nonRepositoryTimestamp = this._nonRepositoryDirectories.get(workingDirectory);
    if (nonRepositoryTimestamp !== void 0 && nonRepositoryTimestamp >= this._now() - NON_REPOSITORY_DIRECTORY_TTL) {
      return void 0;
    }
    this._nonRepositoryDirectories.delete(workingDirectory);
    const current = await this._gitStateReader(workingDirectory);
    if (!this._isCurrentGeneration(generation)) {
      return void 0;
    }
    if (!current) {
      this._recordNonRepositoryDirectory(workingDirectory);
      return void 0;
    }
    const existing = this._repositories.get(current.root);
    if (existing) {
      return existing;
    }
    this._repositories.set(current.root, current);
    return current;
  }
  async _flushStandalone(resource, trigger, generation, fileLockHeld = false) {
    if (!fileLockHeld) {
      return this._fileSequencer.queue(this._filePathKey(resource.filePath), () => this._flushStandalone(resource, trigger, generation, true));
    }
    const prepared = await this._prepareResourceNow(resource, trigger, generateUuid(), generation);
    if (!prepared || !this._isCurrentGeneration(generation)) {
      return;
    }
    this._preparedFlushes.set(prepared.token, prepared);
    this._commitFlushNow({
      flushToken: prepared.token,
      totalModifiedCount: prepared.agentModifiedCount
    });
    if (this._isCurrentGeneration(generation)) {
      this._recordStandaloneOwnership(resource.filePath, prepared.agentModifiedCount, prepared.lastSequence);
    }
  }
  async _prepareResourceNow(resource, trigger, statsUuid, generation) {
    if (!this._isCurrentGeneration(generation) || this._resources.get(resource.key) !== resource) {
      return void 0;
    }
    this._resources.delete(resource.key);
    this._claimedResources.add(resource);
    this._trackedTextLength -= resource.currentContent.length;
    try {
      const currentContent = await this._readCurrentContent(resource.filePath);
      if (!this._isCurrentGeneration(generation)) {
        return void 0;
      }
      if (currentContent !== resource.currentContent) {
        const diff = await this._diffComputeService.computeDiffCounts(resource.currentContent, currentContent);
        if (!this._isCurrentGeneration(generation)) {
          return void 0;
        }
        this._applyChanges(resource, diff.changes, void 0, currentContent, false);
      }
      const retainedBySource = /* @__PURE__ */ new Map();
      for (const interval of resource.intervals) {
        retainedBySource.set(interval.sourceKey, (retainedBySource.get(interval.sourceKey) ?? 0) + interval.endExclusive - interval.start);
      }
      const prepared = {
        token: generateUuid(),
        fileKey: this._filePathKey(resource.filePath),
        trigger,
        statsUuid,
        languageId: void 0,
        sources: Array.from(resource.sources.values()).toSorted((a, b) => (retainedBySource.get(b.sourceKey) ?? 0) - (retainedBySource.get(a.sourceKey) ?? 0)).slice(0, 30),
        retainedBySource,
        agentModifiedCount: Array.from(retainedBySource.values()).reduce((sum, value) => sum + value, 0),
        lastSequence: resource.lastSequence,
        resources: [resource],
        standaloneOwnership: [],
        timestamp: this._now()
      };
      return prepared;
    } catch (error) {
      if (!this._isCurrentGeneration(generation)) {
        return void 0;
      }
      this._logService.warn(`[AgentEditAttributionService] Failed to flush ${resource.filePath}: ${error}`);
      this._restoreResources([resource]);
      throw error;
    }
  }
  _emitTelemetry(prepared, totalModifiedCount) {
    if (!this._enabled) {
      return;
    }
    for (const source of prepared.sources) {
      const data = {
        mode: "longterm",
        sourceKey: source.sourceKey,
        sourceKeyCleaned: source.sourceKeyCleaned,
        extensionId: void 0,
        extensionVersion: void 0,
        modelId: source.modelId,
        trigger: prepared.trigger,
        languageId: prepared.languageId,
        statsUuid: prepared.statsUuid,
        conversationId: source.conversationId,
        requestId: source.requestId,
        origin: "agentHost",
        harness: source.harness,
        modifiedCount: prepared.retainedBySource.get(source.sourceKey) ?? 0,
        deltaModifiedCount: source.insertedCount,
        totalModifiedCount
      };
      sendEditSourcesDetailsTelemetry(this._telemetryService, data);
      const agentHostTelemetryService = this._telemetryService;
      agentHostTelemetryService.sendGHTelemetryEvent?.("editTelemetry.editSources.details", {
        mode: data.mode,
        sourceKey: data.sourceKey,
        sourceKeyCleaned: data.sourceKeyCleaned,
        extensionId: "",
        extensionVersion: "",
        modelId: data.modelId ?? "",
        trigger: data.trigger,
        languageId: data.languageId ?? "",
        statsUuid: data.statsUuid,
        conversationId: data.conversationId,
        requestId: data.requestId,
        origin: data.origin,
        harness: data.harness
      }, {
        modifiedCount: data.modifiedCount,
        deltaModifiedCount: data.deltaModifiedCount,
        totalModifiedCount: data.totalModifiedCount
      });
    }
  }
  async _readCurrentContent(filePath) {
    try {
      return (await this._fileService.readFile(URI.file(filePath))).value.toString();
    } catch (error) {
      if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
        return "";
      }
      throw error;
    }
  }
  _restoreResources(resources) {
    for (const resource of resources) {
      this._claimedResources.delete(resource);
      if (!this._resources.has(resource.key)) {
        this._resources.set(resource.key, resource);
        this._trackedTextLength += resource.currentContent.length;
      }
    }
  }
  _releaseResourceClaims(resources) {
    for (const resource of resources) {
      this._claimedResources.delete(resource);
    }
  }
  _cleanupRepositories(resources) {
    for (const resource of resources) {
      const repositoryRoot = resource.repositoryRoot;
      if (repositoryRoot && !Array.from(this._resources.values()).some((candidate) => candidate.repositoryRoot === repositoryRoot) && !Array.from(this._claimedResources).some((candidate) => candidate.repositoryRoot === repositoryRoot) && !Array.from(this._recordingEdits).some((edit) => extUriBiasedIgnorePathCase.isEqualOrParent(URI.file(edit.filePath), URI.file(repositoryRoot))) && !Array.from(this._preparedFlushes.values()).some((prepared) => prepared.resources.some((candidate) => candidate.repositoryRoot === repositoryRoot))) {
        this._repositories.delete(repositoryRoot);
      }
      const workingDirectory = dirname(resource.filePath);
      if (!Array.from(this._resources.values()).some((candidate) => dirname(candidate.filePath) === workingDirectory) && !Array.from(this._claimedResources).some((candidate) => dirname(candidate.filePath) === workingDirectory) && !Array.from(this._preparedFlushes.values()).some((prepared) => prepared.resources.some((candidate) => dirname(candidate.filePath) === workingDirectory))) {
        this._nonRepositoryDirectories.delete(workingDirectory);
      }
    }
  }
  _recordNonRepositoryDirectory(workingDirectory) {
    this._nonRepositoryDirectories.delete(workingDirectory);
    this._nonRepositoryDirectories.set(workingDirectory, this._now());
    while (this._nonRepositoryDirectories.size > MAX_NON_REPOSITORY_DIRECTORIES) {
      const oldestDirectory = this._nonRepositoryDirectories.keys().next().value;
      if (oldestDirectory === void 0) {
        break;
      }
      this._nonRepositoryDirectories.delete(oldestDirectory);
    }
  }
  _isCurrentGeneration(generation) {
    return this._enabled && generation === this._generation;
  }
  _recordSettledFlush(flushToken, result) {
    this._settledFlushes.delete(flushToken);
    this._settledFlushes.set(flushToken, { result, timestamp: this._now() });
    while (this._settledFlushes.size > MAX_SETTLED_FLUSHES) {
      const oldestToken = this._settledFlushes.keys().next().value;
      if (oldestToken === void 0) {
        break;
      }
      this._settledFlushes.delete(oldestToken);
    }
  }
  _recordStandaloneOwnership(filePath, agentModifiedCount, lastSequence) {
    const key = this._filePathKey(filePath);
    this._restoreStandaloneOwnership([[key, {
      timestamp: this._now(),
      agentModifiedCount,
      lastSequence
    }]]);
  }
  _restoreStandaloneOwnership(ownership) {
    for (const [key, value] of ownership) {
      const existing = this._standaloneOwnership.get(key);
      this._standaloneOwnership.delete(key);
      this._standaloneOwnership.set(key, {
        timestamp: Math.max(existing?.timestamp ?? 0, value.timestamp),
        agentModifiedCount: (existing?.agentModifiedCount ?? 0) + value.agentModifiedCount,
        lastSequence: Math.max(existing?.lastSequence ?? 0, value.lastSequence)
      });
    }
    while (this._standaloneOwnership.size > MAX_STANDALONE_OWNERSHIP) {
      const oldestKey = this._standaloneOwnership.keys().next().value;
      if (oldestKey === void 0) {
        break;
      }
      this._standaloneOwnership.delete(oldestKey);
    }
  }
  _filePathKey(filePath) {
    return extUriBiasedIgnorePathCase.getComparisonKey(URI.file(filePath));
  }
  _isRecordingFile(filePath) {
    const resource = URI.file(filePath);
    return Array.from(this._recordingEdits).some((edit) => extUriBiasedIgnorePathCase.isEqual(URI.file(edit.filePath), resource));
  }
  async _expireFlushState() {
    const now = this._now();
    const expirations = [];
    for (const [flushToken, prepared] of this._preparedFlushes) {
      if (prepared.timestamp < now - PREPARED_FLUSH_TTL) {
        expirations.push(this._fileSequencer.queue(prepared.fileKey, async () => this._expirePreparedFlush(flushToken, prepared, now)));
      }
    }
    await Promise.allSettled(expirations);
    for (const [flushToken, settled] of this._settledFlushes) {
      if (settled.timestamp < now - SETTLED_FLUSH_TTL) {
        this._settledFlushes.delete(flushToken);
      }
    }
    for (const [resourceKey2, ownership] of this._standaloneOwnership) {
      if (ownership.timestamp < now - STANDALONE_OWNERSHIP_TTL) {
        this._standaloneOwnership.delete(resourceKey2);
      }
    }
  }
  _expirePreparedFlush(flushToken, prepared, now) {
    if (this._preparedFlushes.get(flushToken) !== prepared || prepared.timestamp >= now - PREPARED_FLUSH_TTL) {
      return;
    }
    this._preparedFlushes.delete(flushToken);
    if (prepared.resources.some((resource) => this._resources.has(resource.key))) {
      this._releaseResourceClaims(prepared.resources);
      this._emitTelemetry(prepared, prepared.agentModifiedCount);
      this._recordSettledFlush(flushToken, { outcome: "committed", agentModifiedCount: prepared.agentModifiedCount });
    } else {
      this._restoreResources(prepared.resources);
      this._restoreStandaloneOwnership(prepared.standaloneOwnership);
      this._recordSettledFlush(flushToken, { outcome: "cancelled", agentModifiedCount: 0 });
    }
    this._cleanupRepositories(prepared.resources);
  }
  dispose() {
    void this._flushAll("closed");
    super.dispose();
  }
};
AgentEditAttributionService = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, IDiffComputeService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, ILogService)
], AgentEditAttributionService);
function resourceKey(sessionUri, filePath) {
  return `${sessionUri}\0${filePath}`;
}
function combinePreparedFlushes(flushes, fileKey, trigger, statsUuid, flushToken, languageId, standaloneOwnership, timestamp) {
  const retainedBySource = /* @__PURE__ */ new Map();
  const sources = /* @__PURE__ */ new Map();
  for (const flush of flushes) {
    for (const [sourceKey, retainedCount] of flush.retainedBySource) {
      retainedBySource.set(sourceKey, (retainedBySource.get(sourceKey) ?? 0) + retainedCount);
    }
    for (const source of flush.sources) {
      const existing = sources.get(source.sourceKey);
      if (existing) {
        existing.insertedCount += source.insertedCount;
      } else {
        sources.set(source.sourceKey, { ...source });
      }
    }
  }
  return {
    token: flushToken,
    fileKey,
    trigger,
    statsUuid,
    languageId,
    sources: Array.from(sources.values()).toSorted((a, b) => (retainedBySource.get(b.sourceKey) ?? 0) - (retainedBySource.get(a.sourceKey) ?? 0)).slice(0, 30),
    retainedBySource,
    agentModifiedCount: standaloneOwnership.reduce((sum, [, value]) => sum + value.agentModifiedCount, 0) + Array.from(retainedBySource.values()).reduce((sum, value) => sum + value, 0),
    lastSequence: Math.max(
      0,
      ...flushes.map((flush) => flush.lastSequence),
      ...standaloneOwnership.map(([, value]) => value.lastSequence)
    ),
    resources: flushes.flatMap((flush) => flush.resources),
    standaloneOwnership,
    timestamp
  };
}
function validateChanges(before, after, changes) {
  let result = "";
  let lastOffset = 0;
  for (const change of changes) {
    if (change.startOffset < lastOffset || change.endOffsetExclusive < change.startOffset || change.endOffsetExclusive > before.length) {
      return false;
    }
    result += before.substring(lastOffset, change.startOffset);
    result += change.newText;
    lastOffset = change.endOffsetExclusive;
  }
  return result + before.substring(lastOffset) === after;
}
function createMinimalChange(before, after) {
  let prefixLength = 0;
  while (prefixLength < before.length && prefixLength < after.length && before.charCodeAt(prefixLength) === after.charCodeAt(prefixLength)) {
    prefixLength++;
  }
  let suffixLength = 0;
  while (suffixLength < before.length - prefixLength && suffixLength < after.length - prefixLength && before.charCodeAt(before.length - suffixLength - 1) === after.charCodeAt(after.length - suffixLength - 1)) {
    suffixLength++;
  }
  return {
    startOffset: prefixLength,
    endOffsetExclusive: before.length - suffixLength,
    newText: after.substring(prefixLength, after.length - suffixLength)
  };
}
function transformIntervals(intervals, changes) {
  const result = [];
  for (const interval of intervals) {
    let cursor = interval.start;
    let delta = 0;
    for (const change of changes) {
      if (change.endOffsetExclusive <= cursor) {
        delta += change.newText.length - (change.endOffsetExclusive - change.startOffset);
        continue;
      }
      if (change.startOffset >= interval.endExclusive) {
        break;
      }
      if (cursor < change.startOffset) {
        result.push({
          start: cursor + delta,
          endExclusive: Math.min(interval.endExclusive, change.startOffset) + delta,
          sourceKey: interval.sourceKey
        });
      }
      cursor = Math.max(cursor, change.endOffsetExclusive);
      delta += change.newText.length - (change.endOffsetExclusive - change.startOffset);
    }
    if (cursor < interval.endExclusive) {
      result.push({
        start: cursor + delta,
        endExclusive: interval.endExclusive + delta,
        sourceKey: interval.sourceKey
      });
    }
  }
  return result;
}
function mergeIntervals(intervals) {
  const result = [];
  for (const interval of intervals) {
    if (interval.start === interval.endExclusive) {
      continue;
    }
    const previous = result[result.length - 1];
    if (previous?.sourceKey === interval.sourceKey && previous.endExclusive === interval.start) {
      result[result.length - 1] = {
        start: previous.start,
        endExclusive: interval.endExclusive,
        sourceKey: interval.sourceKey
      };
    } else {
      result.push(interval);
    }
  }
  return result;
}
async function readGitState(workingDirectory) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel", "HEAD", "--abbrev-ref", "HEAD"], {
      cwd: workingDirectory,
      timeout: GIT_STATE_TIMEOUT
    });
    const [root, head, branch] = stdout.trim().split(/\r?\n/);
    if (!root || !head || !branch) {
      return void 0;
    }
    return {
      root,
      head,
      branch: branch === "HEAD" ? "" : branch
    };
  } catch {
    return void 0;
  }
}
export {
  AgentEditAttributionService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3NoYXJlZC9hZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBleGVjRmlsZSB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgcHJvbWlzaWZ5IH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgeyBJbnRlcnZhbFRpbWVyLCBTZXF1ZW5jZXJCeUtleSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlLCB0b0ZpbGVPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBFZGl0VGVsZW1ldHJ5VHJpZ2dlciwgc2VuZEVkaXRTb3VyY2VzRGV0YWlsc1RlbGVtZXRyeSB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vZWRpdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSwgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWZmQ29tcHV0ZVNlcnZpY2UsIElPZmZzZXRFZGl0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2RpZmZDb21wdXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVGaWxlRWRpdENvbnRlbnREaWdlc3QsIElBZ2VudEVkaXRBdHRyaWJ1dGlvbiwgSUFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgSUNhbmNlbEVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zLCBJQ29tbWl0RWRpdEF0dHJpYnV0aW9uRmx1c2hQYXJhbXMsIElFZGl0QXR0cmlidXRpb25GbHVzaFJlc3VsdCwgSUZpbGVFZGl0QXR0cmlidXRpb25NYXJrZXIsIElQcmVwYXJlRWRpdEF0dHJpYnV0aW9uRmx1c2hQYXJhbXMsIElQcmVwYXJlZEVkaXRBdHRyaWJ1dGlvbkZsdXNoLCBNQVhfRURJVF9BVFRSSUJVVElPTl9GSUxFX1NJWkUgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZUVkaXRBdHRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uL2FnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UuanMnO1xuXG5jb25zdCBNQVhfVE9UQUxfVFJBQ0tFRF9URVhUID0gMjAgKiAxMDI0ICogMTAyNDtcbmNvbnN0IE1BWF9UUkFDS0VEX1JFU09VUkNFUyA9IDEwMDtcbmNvbnN0IE1BWF9JTlRFUlZBTFNfUEVSX1JFU09VUkNFID0gMTBfMDAwO1xuY29uc3QgTUFYX1NFVFRMRURfRkxVU0hFUyA9IDFfMDAwO1xuY29uc3QgTUFYX1NUQU5EQUxPTkVfT1dORVJTSElQID0gMV8wMDA7XG5jb25zdCBNQVhfTk9OX1JFUE9TSVRPUllfRElSRUNUT1JJRVMgPSAxXzAwMDtcbmNvbnN0IFBSRVBBUkVEX0ZMVVNIX1RUTCA9IDUgKiA2MCAqIDEwMDA7XG5jb25zdCBTRVRUTEVEX0ZMVVNIX1RUTCA9IDEwICogNjAgKiAxMDAwO1xuY29uc3QgU1RBTkRBTE9ORV9PV05FUlNISVBfVFRMID0gMTAgKiA2MCAqIDYwICogMTAwMDtcbmNvbnN0IE5PTl9SRVBPU0lUT1JZX0RJUkVDVE9SWV9UVEwgPSAxMCAqIDYwICogMTAwMDtcbmNvbnN0IEdJVF9TVEFURV9QT0xMX0lOVEVSVkFMID0gMzBfMDAwO1xuY29uc3QgR0lUX1NUQVRFX1RJTUVPVVQgPSAxMF8wMDA7XG5jb25zdCBleGVjRmlsZUFzeW5jID0gcHJvbWlzaWZ5KGV4ZWNGaWxlKTtcblxuaW50ZXJmYWNlIElBdHRyaWJ1dGVkSW50ZXJ2YWwge1xuXHRyZWFkb25seSBzdGFydDogbnVtYmVyO1xuXHRyZWFkb25seSBlbmRFeGNsdXNpdmU6IG51bWJlcjtcblx0cmVhZG9ubHkgc291cmNlS2V5OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJU291cmNlU3RhdGlzdGljcyB7XG5cdHJlYWRvbmx5IHNvdXJjZUtleTogc3RyaW5nO1xuXHRyZWFkb25seSBzb3VyY2VLZXlDbGVhbmVkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY29udmVyc2F0aW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVxdWVzdElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGhhcm5lc3M6IHN0cmluZztcblx0aW5zZXJ0ZWRDb3VudDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSVN0YW5kYWxvbmVPd25lcnNoaXAge1xuXHRyZWFkb25seSB0aW1lc3RhbXA6IG51bWJlcjtcblx0cmVhZG9ubHkgYWdlbnRNb2RpZmllZENvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxhc3RTZXF1ZW5jZTogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSVRyYWNrZWRSZXNvdXJjZSB7XG5cdHJlYWRvbmx5IGtleTogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uVXJpOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZpbGVQYXRoOiBzdHJpbmc7XG5cdGN1cnJlbnRDb250ZW50OiBzdHJpbmc7XG5cdGludGVydmFsczogSUF0dHJpYnV0ZWRJbnRlcnZhbFtdO1xuXHRyZWFkb25seSBzb3VyY2VzOiBNYXA8c3RyaW5nLCBJU291cmNlU3RhdGlzdGljcz47XG5cdHJlcG9zaXRvcnlSb290OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxhc3RTZXF1ZW5jZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEVkaXRBdHRyaWJ1dGlvbkdpdFN0YXRlIHtcblx0cmVhZG9ubHkgcm9vdDogc3RyaW5nO1xuXHRicmFuY2g6IHN0cmluZztcblx0aGVhZDogc3RyaW5nO1xufVxuXG5leHBvcnQgdHlwZSBBZ2VudEVkaXRBdHRyaWJ1dGlvbkdpdFN0YXRlUmVhZGVyID0gKHdvcmtpbmdEaXJlY3Rvcnk6IHN0cmluZykgPT4gUHJvbWlzZTxJQWdlbnRFZGl0QXR0cmlidXRpb25HaXRTdGF0ZSB8IHVuZGVmaW5lZD47XG5cbmludGVyZmFjZSBJUHJlcGFyZWRGbHVzaCB7XG5cdHJlYWRvbmx5IHRva2VuOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZpbGVLZXk6IHN0cmluZztcblx0cmVhZG9ubHkgdHJpZ2dlcjogRWRpdFRlbGVtZXRyeVRyaWdnZXI7XG5cdHJlYWRvbmx5IHN0YXRzVXVpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYW5ndWFnZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNvdXJjZXM6IHJlYWRvbmx5IElTb3VyY2VTdGF0aXN0aWNzW107XG5cdHJlYWRvbmx5IHJldGFpbmVkQnlTb3VyY2U6IFJlYWRvbmx5TWFwPHN0cmluZywgbnVtYmVyPjtcblx0cmVhZG9ubHkgYWdlbnRNb2RpZmllZENvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxhc3RTZXF1ZW5jZTogbnVtYmVyO1xuXHRyZWFkb25seSByZXNvdXJjZXM6IHJlYWRvbmx5IElUcmFja2VkUmVzb3VyY2VbXTtcblx0cmVhZG9ubHkgc3RhbmRhbG9uZU93bmVyc2hpcDogcmVhZG9ubHkgKHJlYWRvbmx5IFtzdHJpbmcsIElTdGFuZGFsb25lT3duZXJzaGlwXSlbXTtcblx0cmVhZG9ubHkgdGltZXN0YW1wOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlcyA9IG5ldyBNYXA8c3RyaW5nLCBJVHJhY2tlZFJlc291cmNlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbGFpbWVkUmVzb3VyY2VzID0gbmV3IFNldDxJVHJhY2tlZFJlc291cmNlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWNvcmRpbmdFZGl0cyA9IG5ldyBTZXQ8SUFnZW50RWRpdEF0dHJpYnV0aW9uPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlckJ5S2V5PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJlcGFyZWRGbHVzaGVzID0gbmV3IE1hcDxzdHJpbmcsIElQcmVwYXJlZEZsdXNoPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmVwYXJpbmdGbHVzaGVzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8SVByZXBhcmVkRWRpdEF0dHJpYnV0aW9uRmx1c2ggfCB1bmRlZmluZWQ+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXR0bGVkRmx1c2hlcyA9IG5ldyBNYXA8c3RyaW5nLCB7IHJlYWRvbmx5IHJlc3VsdDogSUVkaXRBdHRyaWJ1dGlvbkZsdXNoUmVzdWx0OyByZWFkb25seSB0aW1lc3RhbXA6IG51bWJlciB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGFuZGFsb25lT3duZXJzaGlwID0gbmV3IE1hcDxzdHJpbmcsIElTdGFuZGFsb25lT3duZXJzaGlwPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXBvc2l0b3JpZXMgPSBuZXcgTWFwPHN0cmluZywgSUFnZW50RWRpdEF0dHJpYnV0aW9uR2l0U3RhdGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25vblJlcG9zaXRvcnlEaXJlY3RvcmllcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdHByaXZhdGUgX3RyYWNrZWRUZXh0TGVuZ3RoID0gMDtcblx0cHJpdmF0ZSBfc2VxdWVuY2UgPSAwO1xuXHRwcml2YXRlIF9nZW5lcmF0aW9uID0gMDtcblx0cHJpdmF0ZSBfZW5hYmxlZCA9IHRydWU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2l0U3RhdGVSZWFkZXI6IEFnZW50RWRpdEF0dHJpYnV0aW9uR2l0U3RhdGVSZWFkZXIgPSByZWFkR2l0U3RhdGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbm93OiAoKSA9PiBudW1iZXIgPSBEYXRlLm5vdyxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElEaWZmQ29tcHV0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlmZkNvbXB1dGVTZXJ2aWNlOiBJRGlmZkNvbXB1dGVTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IEludGVydmFsVGltZXIoKSkuY2FuY2VsQW5kU2V0KCgpID0+IHtcblx0XHRcdHZvaWQgdGhpcy5fZmx1c2hBbGwoJzEwaG91cnMnKTtcblx0XHR9LCAxMCAqIDYwICogNjAgKiAxMDAwKTtcblx0XHR0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJ2YWxUaW1lcigpKS5jYW5jZWxBbmRTZXQoKCkgPT4ge1xuXHRcdFx0dm9pZCB0aGlzLmNoZWNrR2l0U3RhdGUoKTtcblx0XHR9LCBHSVRfU1RBVEVfUE9MTF9JTlRFUlZBTCk7XG5cdH1cblxuXHRzZXRFbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VuYWJsZWQgfHwgZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5fZ2VuZXJhdGlvbisrO1xuXHRcdHRoaXMuX3Jlc291cmNlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2NsYWltZWRSZXNvdXJjZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9yZWNvcmRpbmdFZGl0cy5jbGVhcigpO1xuXHRcdHRoaXMuX3ByZXBhcmVkRmx1c2hlcy5jbGVhcigpO1xuXHRcdHRoaXMuX3ByZXBhcmluZ0ZsdXNoZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9zZXR0bGVkRmx1c2hlcy5jbGVhcigpO1xuXHRcdHRoaXMuX3N0YW5kYWxvbmVPd25lcnNoaXAuY2xlYXIoKTtcblx0XHR0aGlzLl9yZXBvc2l0b3JpZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9ub25SZXBvc2l0b3J5RGlyZWN0b3JpZXMuY2xlYXIoKTtcblx0XHR0aGlzLl90cmFja2VkVGV4dExlbmd0aCA9IDA7XG5cdH1cblxuXHRhc3luYyByZWNvcmRFZGl0KGVkaXQ6IElBZ2VudEVkaXRBdHRyaWJ1dGlvbik6IFByb21pc2U8SUZpbGVFZGl0QXR0cmlidXRpb25NYXJrZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoXG5cdFx0XHQhdGhpcy5fZW5hYmxlZCB8fFxuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS50ZWxlbWV0cnlMZXZlbCA8IFRlbGVtZXRyeUxldmVsLlVTQUdFXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoTWF0aC5tYXgoZWRpdC5iZWZvcmVUZXh0Lmxlbmd0aCwgZWRpdC5hZnRlclRleHQubGVuZ3RoKSA+IE1BWF9FRElUX0FUVFJJQlVUSU9OX0ZJTEVfU0laRSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dmVyc2lvbjogMSxcblx0XHRcdFx0ZWRpdElkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0c2VxdWVuY2U6ICsrdGhpcy5fc2VxdWVuY2UsXG5cdFx0XHRcdHN0YXR1czogJ3NraXBwZWQnLFxuXHRcdFx0XHRyZWFzb246ICdmaWxlVG9vTGFyZ2UnLFxuXHRcdFx0XHRpbnNlcnRlZENvdW50OiBlZGl0LmNoYW5nZXMucmVkdWNlKChzdW0sIGNoYW5nZSkgPT4gc3VtICsgY2hhbmdlLm5ld1RleHQubGVuZ3RoLCAwKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVjb3JkaW5nRWRpdHMuYWRkKGVkaXQpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmaWxlS2V5ID0gdGhpcy5fZmlsZVBhdGhLZXkoZWRpdC5maWxlUGF0aCk7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZmlsZVNlcXVlbmNlci5xdWV1ZShmaWxlS2V5LCAoKSA9PiB0aGlzLl9yZWNvcmRFZGl0KGVkaXQsIHRoaXMuX2dlbmVyYXRpb24sIGZpbGVLZXkpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fcmVjb3JkaW5nRWRpdHMuZGVsZXRlKGVkaXQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlY29yZEVkaXQoZWRpdDogSUFnZW50RWRpdEF0dHJpYnV0aW9uLCBnZW5lcmF0aW9uOiBudW1iZXIsIGZpbGVLZXk6IHN0cmluZyk6IFByb21pc2U8SUZpbGVFZGl0QXR0cmlidXRpb25NYXJrZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBrZXkgPSByZXNvdXJjZUtleShlZGl0LnNlc3Npb25VcmksIGVkaXQuZmlsZVBhdGgpO1xuXHRcdGF3YWl0IHRoaXMuX2Vuc3VyZUNhcGFjaXR5KGtleSwgZWRpdC5hZnRlclRleHQubGVuZ3RoLCBnZW5lcmF0aW9uLCBmaWxlS2V5KTtcblx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudEdlbmVyYXRpb24oZ2VuZXJhdGlvbikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCByZXNvdXJjZSA9IHRoaXMuX3Jlc291cmNlcy5nZXQoa2V5KTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gcmVzb3VyY2U/LnJlcG9zaXRvcnlSb290XG5cdFx0XHQ/IHRoaXMuX3JlcG9zaXRvcmllcy5nZXQocmVzb3VyY2UucmVwb3NpdG9yeVJvb3QpXG5cdFx0XHQ6IGF3YWl0IHRoaXMuX2dldE9yQ3JlYXRlUmVwb3NpdG9yeShlZGl0LmZpbGVQYXRoLCBnZW5lcmF0aW9uKTtcblx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudEdlbmVyYXRpb24oZ2VuZXJhdGlvbikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdHJlc291cmNlID0ge1xuXHRcdFx0XHRrZXksXG5cdFx0XHRcdHNlc3Npb25Vcmk6IGVkaXQuc2Vzc2lvblVyaSxcblx0XHRcdFx0ZmlsZVBhdGg6IGVkaXQuZmlsZVBhdGgsXG5cdFx0XHRcdGN1cnJlbnRDb250ZW50OiBlZGl0LmJlZm9yZVRleHQsXG5cdFx0XHRcdGludGVydmFsczogW10sXG5cdFx0XHRcdHNvdXJjZXM6IG5ldyBNYXAoKSxcblx0XHRcdFx0cmVwb3NpdG9yeVJvb3Q6IHJlcG9zaXRvcnk/LnJvb3QsXG5cdFx0XHRcdGxhc3RTZXF1ZW5jZTogMCxcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9yZXNvdXJjZXMuc2V0KGtleSwgcmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5fdHJhY2tlZFRleHRMZW5ndGggKz0gZWRpdC5iZWZvcmVUZXh0Lmxlbmd0aDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzb3VyY2UucmVwb3NpdG9yeVJvb3QgPSByZXBvc2l0b3J5Py5yb290O1xuXHRcdFx0dGhpcy5fcmVzb3VyY2VzLmRlbGV0ZShrZXkpO1xuXHRcdFx0dGhpcy5fcmVzb3VyY2VzLnNldChrZXksIHJlc291cmNlKTtcblx0XHR9XG5cblx0XHRpZiAocmVzb3VyY2UuY3VycmVudENvbnRlbnQgIT09IGVkaXQuYmVmb3JlVGV4dCkge1xuXHRcdFx0Y29uc3QgYnJpZGdlID0gYXdhaXQgdGhpcy5fZGlmZkNvbXB1dGVTZXJ2aWNlLmNvbXB1dGVEaWZmQ291bnRzKHJlc291cmNlLmN1cnJlbnRDb250ZW50LCBlZGl0LmJlZm9yZVRleHQpO1xuXHRcdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hcHBseUNoYW5nZXMocmVzb3VyY2UsIGJyaWRnZS5jaGFuZ2VzLCB1bmRlZmluZWQsIGVkaXQuYmVmb3JlVGV4dCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBBZ2VudFNlc3Npb24ucHJvdmlkZXIoZWRpdC5zZXNzaW9uVXJpKSA/PyAndW5rbm93bic7XG5cdFx0Y29uc3QgbW9kZWxTZWdtZW50ID0gZWRpdC5tb2RlbElkID8gYC0kbW9kZWxJZDoke2VkaXQubW9kZWxJZH1gIDogJyc7XG5cdFx0Y29uc3Qgc291cmNlS2V5ID0gYHNvdXJjZTpDaGF0LmFwcGx5RWRpdHMke21vZGVsU2VnbWVudH0tJGhhcm5lc3M6JHtwcm92aWRlcn0tJG9yaWdpbjphZ2VudEhvc3RgO1xuXHRcdGxldCBzb3VyY2UgPSByZXNvdXJjZS5zb3VyY2VzLmdldChzb3VyY2VLZXkpO1xuXHRcdGlmICghc291cmNlKSB7XG5cdFx0XHRzb3VyY2UgPSB7XG5cdFx0XHRcdHNvdXJjZUtleSxcblx0XHRcdFx0c291cmNlS2V5Q2xlYW5lZDogYHNvdXJjZTpDaGF0LmFwcGx5RWRpdHMtJGhhcm5lc3M6JHtwcm92aWRlcn0tJG9yaWdpbjphZ2VudEhvc3RgLFxuXHRcdFx0XHRtb2RlbElkOiBlZGl0Lm1vZGVsSWQsXG5cdFx0XHRcdGNvbnZlcnNhdGlvbklkOiBBZ2VudFNlc3Npb24uaWQoZWRpdC5zZXNzaW9uVXJpKSxcblx0XHRcdFx0cmVxdWVzdElkOiBlZGl0LnR1cm5JZCxcblx0XHRcdFx0aGFybmVzczogcHJvdmlkZXIsXG5cdFx0XHRcdGluc2VydGVkQ291bnQ6IDAsXG5cdFx0XHR9O1xuXHRcdFx0cmVzb3VyY2Uuc291cmNlcy5zZXQoc291cmNlS2V5LCBzb3VyY2UpO1xuXHRcdH1cblx0XHR0aGlzLl9hcHBseUNoYW5nZXMocmVzb3VyY2UsIGVkaXQuY2hhbmdlcywgc291cmNlLCBlZGl0LmFmdGVyVGV4dCk7XG5cdFx0Y29uc3QgbWFya2VyOiBJRmlsZUVkaXRBdHRyaWJ1dGlvbk1hcmtlciA9IHtcblx0XHRcdHZlcnNpb246IDEsXG5cdFx0XHRlZGl0SWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0c2VxdWVuY2U6ICsrdGhpcy5fc2VxdWVuY2UsXG5cdFx0XHRiZWZvcmVEaWdlc3Q6IGNyZWF0ZUZpbGVFZGl0Q29udGVudERpZ2VzdChlZGl0LmJlZm9yZVRleHQpLFxuXHRcdFx0YWZ0ZXJEaWdlc3Q6IGNyZWF0ZUZpbGVFZGl0Q29udGVudERpZ2VzdChlZGl0LmFmdGVyVGV4dCksXG5cdFx0fTtcblx0XHRyZXNvdXJjZS5sYXN0U2VxdWVuY2UgPSBtYXJrZXIuc2VxdWVuY2U7XG5cdFx0aWYgKHJlc291cmNlLmludGVydmFscy5sZW5ndGggPiBNQVhfSU5URVJWQUxTX1BFUl9SRVNPVVJDRSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZmx1c2hTdGFuZGFsb25lKHJlc291cmNlLCAnY2xvc2VkJywgZ2VuZXJhdGlvbiwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5faXNDdXJyZW50R2VuZXJhdGlvbihnZW5lcmF0aW9uKSA/IG1hcmtlciA6IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWFya2VyO1xuXHR9XG5cblx0YXN5bmMgZmx1c2hTZXNzaW9uKHNlc3Npb25Vcmk6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGdlbmVyYXRpb24gPSB0aGlzLl9nZW5lcmF0aW9uO1xuXHRcdGlmICghdGhpcy5faXNDdXJyZW50R2VuZXJhdGlvbihnZW5lcmF0aW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZXNvdXJjZXMgPSBBcnJheS5mcm9tKHRoaXMuX3Jlc291cmNlcy52YWx1ZXMoKSkuZmlsdGVyKHJlc291cmNlID0+IHJlc291cmNlLnNlc3Npb25VcmkgPT09IHNlc3Npb25VcmkpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChyZXNvdXJjZXMubWFwKHJlc291cmNlID0+IHRoaXMuX2ZsdXNoU3RhbmRhbG9uZShyZXNvdXJjZSwgJ2Nsb3NlZCcsIGdlbmVyYXRpb24pKSk7XG5cdH1cblxuXHRhc3luYyBwcmVwYXJlRmx1c2gocGFyYW1zOiBJUHJlcGFyZUVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zKTogUHJvbWlzZTxJUHJlcGFyZWRFZGl0QXR0cmlidXRpb25GbHVzaCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGdlbmVyYXRpb24gPSB0aGlzLl9nZW5lcmF0aW9uO1xuXHRcdGlmICghdGhpcy5faXNDdXJyZW50R2VuZXJhdGlvbihnZW5lcmF0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZXhwaXJlRmx1c2hTdGF0ZSgpO1xuXHRcdGlmIChwYXJhbXMuaXNEaXJ0eSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcHJlcGFyaW5nID0gdGhpcy5fcHJlcGFyaW5nRmx1c2hlcy5nZXQocGFyYW1zLmZsdXNoVG9rZW4pO1xuXHRcdGlmIChwcmVwYXJpbmcpIHtcblx0XHRcdHJldHVybiBwcmVwYXJpbmc7XG5cdFx0fVxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fcHJlcGFyZWRGbHVzaGVzLmdldChwYXJhbXMuZmx1c2hUb2tlbik7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRmbHVzaFRva2VuOiBleGlzdGluZy50b2tlbixcblx0XHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiBleGlzdGluZy5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGxhc3RTZXF1ZW5jZTogZXhpc3RpbmcubGFzdFNlcXVlbmNlLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3NldHRsZWRGbHVzaGVzLmhhcyhwYXJhbXMuZmx1c2hUb2tlbikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByZXBhcmUgPSB0aGlzLl9wcmVwYXJlRmx1c2gocGFyYW1zLCBnZW5lcmF0aW9uKTtcblx0XHR0aGlzLl9wcmVwYXJpbmdGbHVzaGVzLnNldChwYXJhbXMuZmx1c2hUb2tlbiwgcHJlcGFyZSk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBwcmVwYXJlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAodGhpcy5fcHJlcGFyaW5nRmx1c2hlcy5nZXQocGFyYW1zLmZsdXNoVG9rZW4pID09PSBwcmVwYXJlKSB7XG5cdFx0XHRcdHRoaXMuX3ByZXBhcmluZ0ZsdXNoZXMuZGVsZXRlKHBhcmFtcy5mbHVzaFRva2VuKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wcmVwYXJlRmx1c2gocGFyYW1zOiBJUHJlcGFyZUVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zLCBnZW5lcmF0aW9uOiBudW1iZXIpOiBQcm9taXNlPElQcmVwYXJlZEVkaXRBdHRyaWJ1dGlvbkZsdXNoIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbGVTZXF1ZW5jZXIucXVldWUodGhpcy5fZmlsZVBhdGhLZXkocGFyYW1zLnJlc291cmNlLmZzUGF0aCksICgpID0+IHRoaXMuX3ByZXBhcmVGbHVzaExvY2tlZChwYXJhbXMsIGdlbmVyYXRpb24pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3ByZXBhcmVGbHVzaExvY2tlZChwYXJhbXM6IElQcmVwYXJlRWRpdEF0dHJpYnV0aW9uRmx1c2hQYXJhbXMsIGdlbmVyYXRpb246IG51bWJlcik6IFByb21pc2U8SVByZXBhcmVkRWRpdEF0dHJpYnV0aW9uRmx1c2ggfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzdGFuZGFsb25lT3duZXJzaGlwS2V5ID0gdGhpcy5fZmlsZVBhdGhLZXkocGFyYW1zLnJlc291cmNlLmZzUGF0aCk7XG5cdFx0bGV0IHN0YW5kYWxvbmVPd25lcnNoaXAgPSB0aGlzLl9zdGFuZGFsb25lT3duZXJzaGlwLmdldChzdGFuZGFsb25lT3duZXJzaGlwS2V5KTtcblx0XHRpZiAoc3RhbmRhbG9uZU93bmVyc2hpcCkge1xuXHRcdFx0dGhpcy5fc3RhbmRhbG9uZU93bmVyc2hpcC5kZWxldGUoc3RhbmRhbG9uZU93bmVyc2hpcEtleSk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc291cmNlcyA9IEFycmF5LmZyb20odGhpcy5fcmVzb3VyY2VzLnZhbHVlcygpKS5maWx0ZXIocmVzb3VyY2UgPT4gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChVUkkuZmlsZShyZXNvdXJjZS5maWxlUGF0aCksIHBhcmFtcy5yZXNvdXJjZSkpO1xuXHRcdGlmIChyZXNvdXJjZXMubGVuZ3RoID09PSAwICYmICFzdGFuZGFsb25lT3duZXJzaGlwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwcmVwYXJlZFJlc291cmNlczogSVByZXBhcmVkRmx1c2hbXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHJlc291cmNlcykge1xuXHRcdFx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMuX3ByZXBhcmVSZXNvdXJjZU5vdyhyZXNvdXJjZSwgcGFyYW1zLnRyaWdnZXIsIHBhcmFtcy5zdGF0c1V1aWQsIGdlbmVyYXRpb24pO1xuXHRcdFx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudEdlbmVyYXRpb24oZ2VuZXJhdGlvbikpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwcmVwYXJlZCkge1xuXHRcdFx0XHRcdHByZXBhcmVkUmVzb3VyY2VzLnB1c2gocHJlcGFyZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGZvciAoY29uc3QgcHJlcGFyZWQgb2YgcHJlcGFyZWRSZXNvdXJjZXMpIHtcblx0XHRcdFx0dGhpcy5fcmVzdG9yZVJlc291cmNlcyhwcmVwYXJlZC5yZXNvdXJjZXMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHN0YW5kYWxvbmVPd25lcnNoaXApIHtcblx0XHRcdFx0dGhpcy5fcmVzdG9yZVN0YW5kYWxvbmVPd25lcnNoaXAoW1tzdGFuZGFsb25lT3duZXJzaGlwS2V5LCBzdGFuZGFsb25lT3duZXJzaGlwXV0pO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHRcdGlmICghc3RhbmRhbG9uZU93bmVyc2hpcCkge1xuXHRcdFx0c3RhbmRhbG9uZU93bmVyc2hpcCA9IHRoaXMuX3N0YW5kYWxvbmVPd25lcnNoaXAuZ2V0KHN0YW5kYWxvbmVPd25lcnNoaXBLZXkpO1xuXHRcdFx0aWYgKHN0YW5kYWxvbmVPd25lcnNoaXApIHtcblx0XHRcdFx0dGhpcy5fc3RhbmRhbG9uZU93bmVyc2hpcC5kZWxldGUoc3RhbmRhbG9uZU93bmVyc2hpcEtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChwcmVwYXJlZFJlc291cmNlcy5sZW5ndGggPT09IDAgJiYgIXN0YW5kYWxvbmVPd25lcnNoaXApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByZXBhcmVkID0gY29tYmluZVByZXBhcmVkRmx1c2hlcyhcblx0XHRcdHByZXBhcmVkUmVzb3VyY2VzLFxuXHRcdFx0c3RhbmRhbG9uZU93bmVyc2hpcEtleSxcblx0XHRcdHBhcmFtcy50cmlnZ2VyLFxuXHRcdFx0cGFyYW1zLnN0YXRzVXVpZCxcblx0XHRcdHBhcmFtcy5mbHVzaFRva2VuLFxuXHRcdFx0cGFyYW1zLmxhbmd1YWdlSWQsXG5cdFx0XHRzdGFuZGFsb25lT3duZXJzaGlwID8gW1tzdGFuZGFsb25lT3duZXJzaGlwS2V5LCBzdGFuZGFsb25lT3duZXJzaGlwXV0gOiBbXSxcblx0XHRcdHRoaXMuX25vdygpLFxuXHRcdCk7XG5cdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc2V0dGxlZEZsdXNoZXMuaGFzKHBhcmFtcy5mbHVzaFRva2VuKSkge1xuXHRcdFx0dGhpcy5fcmVzdG9yZVJlc291cmNlcyhwcmVwYXJlZC5yZXNvdXJjZXMpO1xuXHRcdFx0dGhpcy5fcmVzdG9yZVN0YW5kYWxvbmVPd25lcnNoaXAocHJlcGFyZWQuc3RhbmRhbG9uZU93bmVyc2hpcCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9wcmVwYXJlZEZsdXNoZXMuc2V0KHByZXBhcmVkLnRva2VuLCBwcmVwYXJlZCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGZsdXNoVG9rZW46IHByZXBhcmVkLnRva2VuLFxuXHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiBwcmVwYXJlZC5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0XHRsYXN0U2VxdWVuY2U6IHByZXBhcmVkLmxhc3RTZXF1ZW5jZSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgY29tbWl0Rmx1c2gocGFyYW1zOiBJQ29tbWl0RWRpdEF0dHJpYnV0aW9uRmx1c2hQYXJhbXMpOiBQcm9taXNlPElFZGl0QXR0cmlidXRpb25GbHVzaFJlc3VsdD4ge1xuXHRcdGlmICghdGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogJ21pc3NpbmcnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZXhwaXJlRmx1c2hTdGF0ZSgpO1xuXHRcdGNvbnN0IHByZXBhcmVkID0gdGhpcy5fcHJlcGFyZWRGbHVzaGVzLmdldChwYXJhbXMuZmx1c2hUb2tlbik7XG5cdFx0aWYgKCFwcmVwYXJlZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NldHRsZWRGbHVzaGVzLmdldChwYXJhbXMuZmx1c2hUb2tlbik/LnJlc3VsdCA/PyB7IG91dGNvbWU6ICdtaXNzaW5nJywgYWdlbnRNb2RpZmllZENvdW50OiAwIH07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9maWxlU2VxdWVuY2VyLnF1ZXVlKHByZXBhcmVkLmZpbGVLZXksIGFzeW5jICgpID0+IHRoaXMuX2NvbW1pdEZsdXNoTm93KHBhcmFtcykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tbWl0Rmx1c2hOb3cocGFyYW1zOiBJQ29tbWl0RWRpdEF0dHJpYnV0aW9uRmx1c2hQYXJhbXMpOiBJRWRpdEF0dHJpYnV0aW9uRmx1c2hSZXN1bHQge1xuXHRcdGlmICghdGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogJ21pc3NpbmcnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfTtcblx0XHR9XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSB0aGlzLl9wcmVwYXJlZEZsdXNoZXMuZ2V0KHBhcmFtcy5mbHVzaFRva2VuKTtcblx0XHRpZiAoIXByZXBhcmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2V0dGxlZEZsdXNoZXMuZ2V0KHBhcmFtcy5mbHVzaFRva2VuKT8ucmVzdWx0ID8/IHsgb3V0Y29tZTogJ21pc3NpbmcnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfTtcblx0XHR9XG5cdFx0dGhpcy5fcHJlcGFyZWRGbHVzaGVzLmRlbGV0ZShwYXJhbXMuZmx1c2hUb2tlbik7XG5cdFx0dGhpcy5fcmVsZWFzZVJlc291cmNlQ2xhaW1zKHByZXBhcmVkLnJlc291cmNlcyk7XG5cdFx0dGhpcy5fZW1pdFRlbGVtZXRyeShwcmVwYXJlZCwgcGFyYW1zLnRvdGFsTW9kaWZpZWRDb3VudCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0geyBvdXRjb21lOiAnY29tbWl0dGVkJywgYWdlbnRNb2RpZmllZENvdW50OiBwcmVwYXJlZC5hZ2VudE1vZGlmaWVkQ291bnQgfSBhcyBjb25zdDtcblx0XHR0aGlzLl9yZWNvcmRTZXR0bGVkRmx1c2gocGFyYW1zLmZsdXNoVG9rZW4sIHJlc3VsdCk7XG5cdFx0dGhpcy5fY2xlYW51cFJlcG9zaXRvcmllcyhwcmVwYXJlZC5yZXNvdXJjZXMpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBjYW5jZWxGbHVzaChwYXJhbXM6IElDYW5jZWxFZGl0QXR0cmlidXRpb25GbHVzaFBhcmFtcyk6IFByb21pc2U8SUVkaXRBdHRyaWJ1dGlvbkZsdXNoUmVzdWx0PiB7XG5cdFx0Y29uc3QgcHJlcGFyaW5nID0gdGhpcy5fcHJlcGFyaW5nRmx1c2hlcy5nZXQocGFyYW1zLmZsdXNoVG9rZW4pO1xuXHRcdGlmIChwcmVwYXJpbmcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHByZXBhcmluZztcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBUaGUgcHJlcGFyZSBwYXRoIHJlc3RvcmVzIGl0cyBvd24gcmVzb3VyY2VzIGJlZm9yZSByZWplY3RpbmcuXG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuIHsgb3V0Y29tZTogJ21pc3NpbmcnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZXhwaXJlRmx1c2hTdGF0ZSgpO1xuXHRcdGNvbnN0IHNldHRsZWQgPSB0aGlzLl9zZXR0bGVkRmx1c2hlcy5nZXQocGFyYW1zLmZsdXNoVG9rZW4pO1xuXHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRyZXR1cm4gc2V0dGxlZC5yZXN1bHQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByZXBhcmVkID0gdGhpcy5fcHJlcGFyZWRGbHVzaGVzLmdldChwYXJhbXMuZmx1c2hUb2tlbik7XG5cdFx0aWYgKCFwcmVwYXJlZCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0geyBvdXRjb21lOiAnY2FuY2VsbGVkJywgYWdlbnRNb2RpZmllZENvdW50OiAwIH0gYXMgY29uc3Q7XG5cdFx0XHR0aGlzLl9yZWNvcmRTZXR0bGVkRmx1c2gocGFyYW1zLmZsdXNoVG9rZW4sIHJlc3VsdCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZmlsZVNlcXVlbmNlci5xdWV1ZShwcmVwYXJlZC5maWxlS2V5LCBhc3luYyAoKSA9PiB0aGlzLl9jYW5jZWxGbHVzaE5vdyhwYXJhbXMpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbEZsdXNoTm93KHBhcmFtczogSUNhbmNlbEVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zKTogSUVkaXRBdHRyaWJ1dGlvbkZsdXNoUmVzdWx0IHtcblx0XHRpZiAoIXRoaXMuX2VuYWJsZWQpIHtcblx0XHRcdHJldHVybiB7IG91dGNvbWU6ICdtaXNzaW5nJywgYWdlbnRNb2RpZmllZENvdW50OiAwIH07XG5cdFx0fVxuXHRcdGNvbnN0IHNldHRsZWQgPSB0aGlzLl9zZXR0bGVkRmx1c2hlcy5nZXQocGFyYW1zLmZsdXNoVG9rZW4pO1xuXHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRyZXR1cm4gc2V0dGxlZC5yZXN1bHQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByZXBhcmVkID0gdGhpcy5fcHJlcGFyZWRGbHVzaGVzLmdldChwYXJhbXMuZmx1c2hUb2tlbik7XG5cdFx0aWYgKCFwcmVwYXJlZCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0geyBvdXRjb21lOiAnY2FuY2VsbGVkJywgYWdlbnRNb2RpZmllZENvdW50OiAwIH0gYXMgY29uc3Q7XG5cdFx0XHR0aGlzLl9yZWNvcmRTZXR0bGVkRmx1c2gocGFyYW1zLmZsdXNoVG9rZW4sIHJlc3VsdCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHR0aGlzLl9wcmVwYXJlZEZsdXNoZXMuZGVsZXRlKHBhcmFtcy5mbHVzaFRva2VuKTtcblx0XHRpZiAocHJlcGFyZWQucmVzb3VyY2VzLnNvbWUocmVzb3VyY2UgPT4gdGhpcy5fcmVzb3VyY2VzLmhhcyhyZXNvdXJjZS5rZXkpKSkge1xuXHRcdFx0dGhpcy5fcmVsZWFzZVJlc291cmNlQ2xhaW1zKHByZXBhcmVkLnJlc291cmNlcyk7XG5cdFx0XHR0aGlzLl9lbWl0VGVsZW1ldHJ5KHByZXBhcmVkLCBwcmVwYXJlZC5hZ2VudE1vZGlmaWVkQ291bnQpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0geyBvdXRjb21lOiAnY29tbWl0dGVkJywgYWdlbnRNb2RpZmllZENvdW50OiBwcmVwYXJlZC5hZ2VudE1vZGlmaWVkQ291bnQgfSBhcyBjb25zdDtcblx0XHRcdHRoaXMuX3JlY29yZFNldHRsZWRGbHVzaChwYXJhbXMuZmx1c2hUb2tlbiwgcmVzdWx0KTtcblx0XHRcdHRoaXMuX2NsZWFudXBSZXBvc2l0b3JpZXMocHJlcGFyZWQucmVzb3VyY2VzKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Jlc3RvcmVSZXNvdXJjZXMocHJlcGFyZWQucmVzb3VyY2VzKTtcblx0XHRcdHRoaXMuX3Jlc3RvcmVTdGFuZGFsb25lT3duZXJzaGlwKHByZXBhcmVkLnN0YW5kYWxvbmVPd25lcnNoaXApO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSB7IG91dGNvbWU6ICdjYW5jZWxsZWQnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfSBhcyBjb25zdDtcblx0XHR0aGlzLl9yZWNvcmRTZXR0bGVkRmx1c2gocGFyYW1zLmZsdXNoVG9rZW4sIHJlc3VsdCk7XG5cdFx0dGhpcy5fY2xlYW51cFJlcG9zaXRvcmllcyhwcmVwYXJlZC5yZXNvdXJjZXMpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVDYXBhY2l0eShrZXk6IHN0cmluZywgbmV4dExlbmd0aDogbnVtYmVyLCBnZW5lcmF0aW9uOiBudW1iZXIsIGxvY2tlZEZpbGVLZXk6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHdoaWxlICh0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Jlc291cmNlcy5nZXQoa2V5KTtcblx0XHRcdGNvbnN0IHByb2plY3RlZFRleHRMZW5ndGggPSB0aGlzLl90cmFja2VkVGV4dExlbmd0aCAtIChleGlzdGluZz8uY3VycmVudENvbnRlbnQubGVuZ3RoID8/IDApICsgbmV4dExlbmd0aDtcblx0XHRcdGlmICh0aGlzLl9yZXNvdXJjZXMuc2l6ZSA8IE1BWF9UUkFDS0VEX1JFU09VUkNFUyAmJiBwcm9qZWN0ZWRUZXh0TGVuZ3RoIDw9IE1BWF9UT1RBTF9UUkFDS0VEX1RFWFQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2FtZUZpbGVSZXNvdXJjZSA9IEFycmF5LmZyb20odGhpcy5fcmVzb3VyY2VzLnZhbHVlcygpKS5maW5kKHJlc291cmNlID0+IHRoaXMuX2ZpbGVQYXRoS2V5KHJlc291cmNlLmZpbGVQYXRoKSA9PT0gbG9ja2VkRmlsZUtleSk7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IGV4aXN0aW5nID8/IHNhbWVGaWxlUmVzb3VyY2UgPz8gdGhpcy5fcmVzb3VyY2VzLnZhbHVlcygpLm5leHQoKS52YWx1ZTtcblx0XHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5fZmx1c2hTdGFuZGFsb25lKHJlc291cmNlLCAnY2xvc2VkJywgZ2VuZXJhdGlvbiwgdGhpcy5fZmlsZVBhdGhLZXkocmVzb3VyY2UuZmlsZVBhdGgpID09PSBsb2NrZWRGaWxlS2V5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseUNoYW5nZXMocmVzb3VyY2U6IElUcmFja2VkUmVzb3VyY2UsIGNoYW5nZXM6IHJlYWRvbmx5IElPZmZzZXRFZGl0W10sIHNvdXJjZTogSVNvdXJjZVN0YXRpc3RpY3MgfCB1bmRlZmluZWQsIGFmdGVyVGV4dDogc3RyaW5nLCB1cGRhdGVUcmFja2VkVGV4dExlbmd0aCA9IHRydWUpOiB2b2lkIHtcblx0XHRjb25zdCBub3JtYWxpemVkQ2hhbmdlcyA9IHZhbGlkYXRlQ2hhbmdlcyhyZXNvdXJjZS5jdXJyZW50Q29udGVudCwgYWZ0ZXJUZXh0LCBjaGFuZ2VzKVxuXHRcdFx0PyBjaGFuZ2VzXG5cdFx0XHQ6IFtjcmVhdGVNaW5pbWFsQ2hhbmdlKHJlc291cmNlLmN1cnJlbnRDb250ZW50LCBhZnRlclRleHQpXTtcblx0XHRjb25zdCBpbnRlcnZhbHMgPSB0cmFuc2Zvcm1JbnRlcnZhbHMocmVzb3VyY2UuaW50ZXJ2YWxzLCBub3JtYWxpemVkQ2hhbmdlcyk7XG5cdFx0bGV0IGRlbHRhID0gMDtcblx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBub3JtYWxpemVkQ2hhbmdlcykge1xuXHRcdFx0aWYgKHNvdXJjZSAmJiBjaGFuZ2UubmV3VGV4dC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0ID0gY2hhbmdlLnN0YXJ0T2Zmc2V0ICsgZGVsdGE7XG5cdFx0XHRcdGludGVydmFscy5wdXNoKHtcblx0XHRcdFx0XHRzdGFydCxcblx0XHRcdFx0XHRlbmRFeGNsdXNpdmU6IHN0YXJ0ICsgY2hhbmdlLm5ld1RleHQubGVuZ3RoLFxuXHRcdFx0XHRcdHNvdXJjZUtleTogc291cmNlLnNvdXJjZUtleSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNvdXJjZS5pbnNlcnRlZENvdW50ICs9IGNoYW5nZS5uZXdUZXh0Lmxlbmd0aDtcblx0XHRcdH1cblx0XHRcdGRlbHRhICs9IGNoYW5nZS5uZXdUZXh0Lmxlbmd0aCAtIChjaGFuZ2UuZW5kT2Zmc2V0RXhjbHVzaXZlIC0gY2hhbmdlLnN0YXJ0T2Zmc2V0KTtcblx0XHR9XG5cdFx0aW50ZXJ2YWxzLnNvcnQoKGEsIGIpID0+IGEuc3RhcnQgLSBiLnN0YXJ0KTtcblx0XHRyZXNvdXJjZS5pbnRlcnZhbHMgPSBtZXJnZUludGVydmFscyhpbnRlcnZhbHMpO1xuXHRcdGlmICh1cGRhdGVUcmFja2VkVGV4dExlbmd0aCkge1xuXHRcdFx0dGhpcy5fdHJhY2tlZFRleHRMZW5ndGggKz0gYWZ0ZXJUZXh0Lmxlbmd0aCAtIHJlc291cmNlLmN1cnJlbnRDb250ZW50Lmxlbmd0aDtcblx0XHR9XG5cdFx0cmVzb3VyY2UuY3VycmVudENvbnRlbnQgPSBhZnRlclRleHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9mbHVzaEFsbCh0cmlnZ2VyOiBFZGl0VGVsZW1ldHJ5VHJpZ2dlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGdlbmVyYXRpb24gPSB0aGlzLl9nZW5lcmF0aW9uO1xuXHRcdGlmICghdGhpcy5faXNDdXJyZW50R2VuZXJhdGlvbihnZW5lcmF0aW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoQXJyYXkuZnJvbSh0aGlzLl9yZXNvdXJjZXMudmFsdWVzKCksIHJlc291cmNlID0+IHRoaXMuX2ZsdXNoU3RhbmRhbG9uZShyZXNvdXJjZSwgdHJpZ2dlciwgZ2VuZXJhdGlvbikpKTtcblx0fVxuXG5cdGFzeW5jIGNoZWNrR2l0U3RhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ2VuZXJhdGlvbiA9IHRoaXMuX2dlbmVyYXRpb247XG5cdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2V4cGlyZUZsdXNoU3RhdGUoKTtcblx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgQXJyYXkuZnJvbSh0aGlzLl9yZXBvc2l0b3JpZXMudmFsdWVzKCkpKSB7XG5cdFx0XHRsZXQgY3VycmVudDogSUFnZW50RWRpdEF0dHJpYnV0aW9uR2l0U3RhdGUgfCB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjdXJyZW50ID0gYXdhaXQgdGhpcy5fZ2l0U3RhdGVSZWFkZXIocmVwb3NpdG9yeS5yb290KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZV0gRmFpbGVkIHRvIHJlYWQgR2l0IHN0YXRlIGZvciAke3JlcG9zaXRvcnkucm9vdH06ICR7ZXJyb3J9YCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghY3VycmVudCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRyaWdnZXIgPSBjdXJyZW50LmJyYW5jaCAhPT0gcmVwb3NpdG9yeS5icmFuY2hcblx0XHRcdFx0PyAnYnJhbmNoQ2hhbmdlJ1xuXHRcdFx0XHQ6IGN1cnJlbnQuaGVhZCAhPT0gcmVwb3NpdG9yeS5oZWFkXG5cdFx0XHRcdFx0PyAnaGFzaENoYW5nZSdcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGlmICghdHJpZ2dlcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc291cmNlcyA9IEFycmF5LmZyb20odGhpcy5fcmVzb3VyY2VzLnZhbHVlcygpKS5maWx0ZXIocmVzb3VyY2UgPT4gcmVzb3VyY2UucmVwb3NpdG9yeVJvb3QgPT09IHJlcG9zaXRvcnkucm9vdCAmJiAhdGhpcy5faXNSZWNvcmRpbmdGaWxlKHJlc291cmNlLmZpbGVQYXRoKSk7XG5cdFx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHJlc291cmNlcy5tYXAocmVzb3VyY2UgPT4gdGhpcy5fZmx1c2hTdGFuZGFsb25lKHJlc291cmNlLCB0cmlnZ2VyLCBnZW5lcmF0aW9uKSkpO1xuXHRcdFx0Y29uc3QgaGFzUGVuZGluZ1Jlc291cmNlcyA9IEFycmF5LmZyb20odGhpcy5fcmVzb3VyY2VzLnZhbHVlcygpKS5zb21lKHJlc291cmNlID0+IHJlc291cmNlLnJlcG9zaXRvcnlSb290ID09PSByZXBvc2l0b3J5LnJvb3QpO1xuXHRcdFx0Y29uc3QgaGFzQ2xhaW1lZFJlc291cmNlcyA9IEFycmF5LmZyb20odGhpcy5fY2xhaW1lZFJlc291cmNlcykuc29tZShyZXNvdXJjZSA9PiByZXNvdXJjZS5yZXBvc2l0b3J5Um9vdCA9PT0gcmVwb3NpdG9yeS5yb290KTtcblx0XHRcdGNvbnN0IGhhc1JlY29yZGluZ0VkaXRzID0gQXJyYXkuZnJvbSh0aGlzLl9yZWNvcmRpbmdFZGl0cykuc29tZShlZGl0ID0+IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudChVUkkuZmlsZShlZGl0LmZpbGVQYXRoKSwgVVJJLmZpbGUocmVwb3NpdG9yeS5yb290KSkpO1xuXHRcdFx0aWYgKHRoaXMuX2lzQ3VycmVudEdlbmVyYXRpb24oZ2VuZXJhdGlvbikgJiYgcmVzdWx0cy5ldmVyeShyZXN1bHQgPT4gcmVzdWx0LnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcpICYmICFoYXNQZW5kaW5nUmVzb3VyY2VzICYmICFoYXNDbGFpbWVkUmVzb3VyY2VzICYmICFoYXNSZWNvcmRpbmdFZGl0cykge1xuXHRcdFx0XHRyZXBvc2l0b3J5LmJyYW5jaCA9IGN1cnJlbnQuYnJhbmNoO1xuXHRcdFx0XHRyZXBvc2l0b3J5LmhlYWQgPSBjdXJyZW50LmhlYWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0T3JDcmVhdGVSZXBvc2l0b3J5KGZpbGVQYXRoOiBzdHJpbmcsIGdlbmVyYXRpb246IG51bWJlcik6IFByb21pc2U8SUFnZW50RWRpdEF0dHJpYnV0aW9uR2l0U3RhdGUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gZGlybmFtZShmaWxlUGF0aCk7XG5cdFx0Y29uc3Qgbm9uUmVwb3NpdG9yeVRpbWVzdGFtcCA9IHRoaXMuX25vblJlcG9zaXRvcnlEaXJlY3Rvcmllcy5nZXQod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKG5vblJlcG9zaXRvcnlUaW1lc3RhbXAgIT09IHVuZGVmaW5lZCAmJiBub25SZXBvc2l0b3J5VGltZXN0YW1wID49IHRoaXMuX25vdygpIC0gTk9OX1JFUE9TSVRPUllfRElSRUNUT1JZX1RUTCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fbm9uUmVwb3NpdG9yeURpcmVjdG9yaWVzLmRlbGV0ZSh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRjb25zdCBjdXJyZW50ID0gYXdhaXQgdGhpcy5fZ2l0U3RhdGVSZWFkZXIod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIWN1cnJlbnQpIHtcblx0XHRcdHRoaXMuX3JlY29yZE5vblJlcG9zaXRvcnlEaXJlY3Rvcnkod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3JlcG9zaXRvcmllcy5nZXQoY3VycmVudC5yb290KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0dGhpcy5fcmVwb3NpdG9yaWVzLnNldChjdXJyZW50LnJvb3QsIGN1cnJlbnQpO1xuXHRcdHJldHVybiBjdXJyZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmx1c2hTdGFuZGFsb25lKHJlc291cmNlOiBJVHJhY2tlZFJlc291cmNlLCB0cmlnZ2VyOiBFZGl0VGVsZW1ldHJ5VHJpZ2dlciwgZ2VuZXJhdGlvbjogbnVtYmVyLCBmaWxlTG9ja0hlbGQgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghZmlsZUxvY2tIZWxkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZmlsZVNlcXVlbmNlci5xdWV1ZSh0aGlzLl9maWxlUGF0aEtleShyZXNvdXJjZS5maWxlUGF0aCksICgpID0+IHRoaXMuX2ZsdXNoU3RhbmRhbG9uZShyZXNvdXJjZSwgdHJpZ2dlciwgZ2VuZXJhdGlvbiwgdHJ1ZSkpO1xuXHRcdH1cblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRoaXMuX3ByZXBhcmVSZXNvdXJjZU5vdyhyZXNvdXJjZSwgdHJpZ2dlciwgZ2VuZXJhdGVVdWlkKCksIGdlbmVyYXRpb24pO1xuXHRcdGlmICghcHJlcGFyZWQgfHwgIXRoaXMuX2lzQ3VycmVudEdlbmVyYXRpb24oZ2VuZXJhdGlvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcHJlcGFyZWRGbHVzaGVzLnNldChwcmVwYXJlZC50b2tlbiwgcHJlcGFyZWQpO1xuXHRcdHRoaXMuX2NvbW1pdEZsdXNoTm93KHtcblx0XHRcdGZsdXNoVG9rZW46IHByZXBhcmVkLnRva2VuLFxuXHRcdFx0dG90YWxNb2RpZmllZENvdW50OiBwcmVwYXJlZC5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0fSk7XG5cdFx0aWYgKHRoaXMuX2lzQ3VycmVudEdlbmVyYXRpb24oZ2VuZXJhdGlvbikpIHtcblx0XHRcdHRoaXMuX3JlY29yZFN0YW5kYWxvbmVPd25lcnNoaXAocmVzb3VyY2UuZmlsZVBhdGgsIHByZXBhcmVkLmFnZW50TW9kaWZpZWRDb3VudCwgcHJlcGFyZWQubGFzdFNlcXVlbmNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wcmVwYXJlUmVzb3VyY2VOb3cocmVzb3VyY2U6IElUcmFja2VkUmVzb3VyY2UsIHRyaWdnZXI6IEVkaXRUZWxlbWV0cnlUcmlnZ2VyLCBzdGF0c1V1aWQ6IHN0cmluZywgZ2VuZXJhdGlvbjogbnVtYmVyKTogUHJvbWlzZTxJUHJlcGFyZWRGbHVzaCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5faXNDdXJyZW50R2VuZXJhdGlvbihnZW5lcmF0aW9uKSB8fCB0aGlzLl9yZXNvdXJjZXMuZ2V0KHJlc291cmNlLmtleSkgIT09IHJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNvdXJjZXMuZGVsZXRlKHJlc291cmNlLmtleSk7XG5cdFx0dGhpcy5fY2xhaW1lZFJlc291cmNlcy5hZGQocmVzb3VyY2UpO1xuXHRcdHRoaXMuX3RyYWNrZWRUZXh0TGVuZ3RoIC09IHJlc291cmNlLmN1cnJlbnRDb250ZW50Lmxlbmd0aDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY3VycmVudENvbnRlbnQgPSBhd2FpdCB0aGlzLl9yZWFkQ3VycmVudENvbnRlbnQocmVzb3VyY2UuZmlsZVBhdGgpO1xuXHRcdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY3VycmVudENvbnRlbnQgIT09IHJlc291cmNlLmN1cnJlbnRDb250ZW50KSB7XG5cdFx0XHRcdGNvbnN0IGRpZmYgPSBhd2FpdCB0aGlzLl9kaWZmQ29tcHV0ZVNlcnZpY2UuY29tcHV0ZURpZmZDb3VudHMocmVzb3VyY2UuY3VycmVudENvbnRlbnQsIGN1cnJlbnRDb250ZW50KTtcblx0XHRcdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb24pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9hcHBseUNoYW5nZXMocmVzb3VyY2UsIGRpZmYuY2hhbmdlcywgdW5kZWZpbmVkLCBjdXJyZW50Q29udGVudCwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmV0YWluZWRCeVNvdXJjZSA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGludGVydmFsIG9mIHJlc291cmNlLmludGVydmFscykge1xuXHRcdFx0XHRyZXRhaW5lZEJ5U291cmNlLnNldChpbnRlcnZhbC5zb3VyY2VLZXksIChyZXRhaW5lZEJ5U291cmNlLmdldChpbnRlcnZhbC5zb3VyY2VLZXkpID8/IDApICsgaW50ZXJ2YWwuZW5kRXhjbHVzaXZlIC0gaW50ZXJ2YWwuc3RhcnQpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcHJlcGFyZWQ6IElQcmVwYXJlZEZsdXNoID0ge1xuXHRcdFx0XHR0b2tlbjogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdGZpbGVLZXk6IHRoaXMuX2ZpbGVQYXRoS2V5KHJlc291cmNlLmZpbGVQYXRoKSxcblx0XHRcdFx0dHJpZ2dlcixcblx0XHRcdFx0c3RhdHNVdWlkLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNvdXJjZXM6IEFycmF5LmZyb20ocmVzb3VyY2Uuc291cmNlcy52YWx1ZXMoKSlcblx0XHRcdFx0XHQudG9Tb3J0ZWQoKGEsIGIpID0+IChyZXRhaW5lZEJ5U291cmNlLmdldChiLnNvdXJjZUtleSkgPz8gMCkgLSAocmV0YWluZWRCeVNvdXJjZS5nZXQoYS5zb3VyY2VLZXkpID8/IDApKVxuXHRcdFx0XHRcdC5zbGljZSgwLCAzMCksXG5cdFx0XHRcdHJldGFpbmVkQnlTb3VyY2UsXG5cdFx0XHRcdGFnZW50TW9kaWZpZWRDb3VudDogQXJyYXkuZnJvbShyZXRhaW5lZEJ5U291cmNlLnZhbHVlcygpKS5yZWR1Y2UoKHN1bSwgdmFsdWUpID0+IHN1bSArIHZhbHVlLCAwKSxcblx0XHRcdFx0bGFzdFNlcXVlbmNlOiByZXNvdXJjZS5sYXN0U2VxdWVuY2UsXG5cdFx0XHRcdHJlc291cmNlczogW3Jlc291cmNlXSxcblx0XHRcdFx0c3RhbmRhbG9uZU93bmVyc2hpcDogW10sXG5cdFx0XHRcdHRpbWVzdGFtcDogdGhpcy5fbm93KCksXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHByZXBhcmVkO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudEdlbmVyYXRpb24oZ2VuZXJhdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZV0gRmFpbGVkIHRvIGZsdXNoICR7cmVzb3VyY2UuZmlsZVBhdGh9OiAke2Vycm9yfWApO1xuXHRcdFx0dGhpcy5fcmVzdG9yZVJlc291cmNlcyhbcmVzb3VyY2VdKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2VtaXRUZWxlbWV0cnkocHJlcGFyZWQ6IElQcmVwYXJlZEZsdXNoLCB0b3RhbE1vZGlmaWVkQ291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHNvdXJjZSBvZiBwcmVwYXJlZC5zb3VyY2VzKSB7XG5cdFx0XHRjb25zdCBkYXRhID0ge1xuXHRcdFx0XHRtb2RlOiAnbG9uZ3Rlcm0nLFxuXHRcdFx0XHRzb3VyY2VLZXk6IHNvdXJjZS5zb3VyY2VLZXksXG5cdFx0XHRcdHNvdXJjZUtleUNsZWFuZWQ6IHNvdXJjZS5zb3VyY2VLZXlDbGVhbmVkLFxuXHRcdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRleHRlbnNpb25WZXJzaW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1vZGVsSWQ6IHNvdXJjZS5tb2RlbElkLFxuXHRcdFx0XHR0cmlnZ2VyOiBwcmVwYXJlZC50cmlnZ2VyLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiBwcmVwYXJlZC5sYW5ndWFnZUlkLFxuXHRcdFx0XHRzdGF0c1V1aWQ6IHByZXBhcmVkLnN0YXRzVXVpZCxcblx0XHRcdFx0Y29udmVyc2F0aW9uSWQ6IHNvdXJjZS5jb252ZXJzYXRpb25JZCxcblx0XHRcdFx0cmVxdWVzdElkOiBzb3VyY2UucmVxdWVzdElkLFxuXHRcdFx0XHRvcmlnaW46ICdhZ2VudEhvc3QnLFxuXHRcdFx0XHRoYXJuZXNzOiBzb3VyY2UuaGFybmVzcyxcblx0XHRcdFx0bW9kaWZpZWRDb3VudDogcHJlcGFyZWQucmV0YWluZWRCeVNvdXJjZS5nZXQoc291cmNlLnNvdXJjZUtleSkgPz8gMCxcblx0XHRcdFx0ZGVsdGFNb2RpZmllZENvdW50OiBzb3VyY2UuaW5zZXJ0ZWRDb3VudCxcblx0XHRcdFx0dG90YWxNb2RpZmllZENvdW50LFxuXHRcdFx0fSBhcyBjb25zdDtcblx0XHRcdHNlbmRFZGl0U291cmNlc0RldGFpbHNUZWxlbWV0cnkodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwgZGF0YSk7XG5cdFx0XHRjb25zdCBhZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlID0gdGhpcy5fdGVsZW1ldHJ5U2VydmljZSBhcyBQYXJ0aWFsPElBZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlPjtcblx0XHRcdGFnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2Uuc2VuZEdIVGVsZW1ldHJ5RXZlbnQ/LignZWRpdFRlbGVtZXRyeS5lZGl0U291cmNlcy5kZXRhaWxzJywge1xuXHRcdFx0XHRtb2RlOiBkYXRhLm1vZGUsXG5cdFx0XHRcdHNvdXJjZUtleTogZGF0YS5zb3VyY2VLZXksXG5cdFx0XHRcdHNvdXJjZUtleUNsZWFuZWQ6IGRhdGEuc291cmNlS2V5Q2xlYW5lZCxcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6ICcnLFxuXHRcdFx0XHRleHRlbnNpb25WZXJzaW9uOiAnJyxcblx0XHRcdFx0bW9kZWxJZDogZGF0YS5tb2RlbElkID8/ICcnLFxuXHRcdFx0XHR0cmlnZ2VyOiBkYXRhLnRyaWdnZXIsXG5cdFx0XHRcdGxhbmd1YWdlSWQ6IGRhdGEubGFuZ3VhZ2VJZCA/PyAnJyxcblx0XHRcdFx0c3RhdHNVdWlkOiBkYXRhLnN0YXRzVXVpZCxcblx0XHRcdFx0Y29udmVyc2F0aW9uSWQ6IGRhdGEuY29udmVyc2F0aW9uSWQsXG5cdFx0XHRcdHJlcXVlc3RJZDogZGF0YS5yZXF1ZXN0SWQsXG5cdFx0XHRcdG9yaWdpbjogZGF0YS5vcmlnaW4sXG5cdFx0XHRcdGhhcm5lc3M6IGRhdGEuaGFybmVzcyxcblx0XHRcdH0sIHtcblx0XHRcdFx0bW9kaWZpZWRDb3VudDogZGF0YS5tb2RpZmllZENvdW50LFxuXHRcdFx0XHRkZWx0YU1vZGlmaWVkQ291bnQ6IGRhdGEuZGVsdGFNb2RpZmllZENvdW50LFxuXHRcdFx0XHR0b3RhbE1vZGlmaWVkQ291bnQ6IGRhdGEudG90YWxNb2RpZmllZENvdW50LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVhZEN1cnJlbnRDb250ZW50KGZpbGVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5maWxlKGZpbGVQYXRoKSkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdHJldHVybiAnJztcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Jlc3RvcmVSZXNvdXJjZXMocmVzb3VyY2VzOiByZWFkb25seSBJVHJhY2tlZFJlc291cmNlW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHJlc291cmNlcykge1xuXHRcdFx0dGhpcy5fY2xhaW1lZFJlc291cmNlcy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdFx0aWYgKCF0aGlzLl9yZXNvdXJjZXMuaGFzKHJlc291cmNlLmtleSkpIHtcblx0XHRcdFx0dGhpcy5fcmVzb3VyY2VzLnNldChyZXNvdXJjZS5rZXksIHJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5fdHJhY2tlZFRleHRMZW5ndGggKz0gcmVzb3VyY2UuY3VycmVudENvbnRlbnQubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbGVhc2VSZXNvdXJjZUNsYWltcyhyZXNvdXJjZXM6IHJlYWRvbmx5IElUcmFja2VkUmVzb3VyY2VbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgcmVzb3VyY2VzKSB7XG5cdFx0XHR0aGlzLl9jbGFpbWVkUmVzb3VyY2VzLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYW51cFJlcG9zaXRvcmllcyhyZXNvdXJjZXM6IHJlYWRvbmx5IElUcmFja2VkUmVzb3VyY2VbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgcmVzb3VyY2VzKSB7XG5cdFx0XHRjb25zdCByZXBvc2l0b3J5Um9vdCA9IHJlc291cmNlLnJlcG9zaXRvcnlSb290O1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRyZXBvc2l0b3J5Um9vdCAmJlxuXHRcdFx0XHQhQXJyYXkuZnJvbSh0aGlzLl9yZXNvdXJjZXMudmFsdWVzKCkpLnNvbWUoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5yZXBvc2l0b3J5Um9vdCA9PT0gcmVwb3NpdG9yeVJvb3QpICYmXG5cdFx0XHRcdCFBcnJheS5mcm9tKHRoaXMuX2NsYWltZWRSZXNvdXJjZXMpLnNvbWUoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5yZXBvc2l0b3J5Um9vdCA9PT0gcmVwb3NpdG9yeVJvb3QpICYmXG5cdFx0XHRcdCFBcnJheS5mcm9tKHRoaXMuX3JlY29yZGluZ0VkaXRzKS5zb21lKGVkaXQgPT4gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbE9yUGFyZW50KFVSSS5maWxlKGVkaXQuZmlsZVBhdGgpLCBVUkkuZmlsZShyZXBvc2l0b3J5Um9vdCkpKSAmJlxuXHRcdFx0XHQhQXJyYXkuZnJvbSh0aGlzLl9wcmVwYXJlZEZsdXNoZXMudmFsdWVzKCkpLnNvbWUocHJlcGFyZWQgPT4gcHJlcGFyZWQucmVzb3VyY2VzLnNvbWUoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5yZXBvc2l0b3J5Um9vdCA9PT0gcmVwb3NpdG9yeVJvb3QpKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHRoaXMuX3JlcG9zaXRvcmllcy5kZWxldGUocmVwb3NpdG9yeVJvb3QpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IGRpcm5hbWUocmVzb3VyY2UuZmlsZVBhdGgpO1xuXHRcdFx0aWYgKFxuXHRcdFx0XHQhQXJyYXkuZnJvbSh0aGlzLl9yZXNvdXJjZXMudmFsdWVzKCkpLnNvbWUoY2FuZGlkYXRlID0+IGRpcm5hbWUoY2FuZGlkYXRlLmZpbGVQYXRoKSA9PT0gd29ya2luZ0RpcmVjdG9yeSkgJiZcblx0XHRcdFx0IUFycmF5LmZyb20odGhpcy5fY2xhaW1lZFJlc291cmNlcykuc29tZShjYW5kaWRhdGUgPT4gZGlybmFtZShjYW5kaWRhdGUuZmlsZVBhdGgpID09PSB3b3JraW5nRGlyZWN0b3J5KSAmJlxuXHRcdFx0XHQhQXJyYXkuZnJvbSh0aGlzLl9wcmVwYXJlZEZsdXNoZXMudmFsdWVzKCkpLnNvbWUocHJlcGFyZWQgPT4gcHJlcGFyZWQucmVzb3VyY2VzLnNvbWUoY2FuZGlkYXRlID0+IGRpcm5hbWUoY2FuZGlkYXRlLmZpbGVQYXRoKSA9PT0gd29ya2luZ0RpcmVjdG9yeSkpXG5cdFx0XHQpIHtcblx0XHRcdFx0dGhpcy5fbm9uUmVwb3NpdG9yeURpcmVjdG9yaWVzLmRlbGV0ZSh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvcmROb25SZXBvc2l0b3J5RGlyZWN0b3J5KHdvcmtpbmdEaXJlY3Rvcnk6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX25vblJlcG9zaXRvcnlEaXJlY3Rvcmllcy5kZWxldGUod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0dGhpcy5fbm9uUmVwb3NpdG9yeURpcmVjdG9yaWVzLnNldCh3b3JraW5nRGlyZWN0b3J5LCB0aGlzLl9ub3coKSk7XG5cdFx0d2hpbGUgKHRoaXMuX25vblJlcG9zaXRvcnlEaXJlY3Rvcmllcy5zaXplID4gTUFYX05PTl9SRVBPU0lUT1JZX0RJUkVDVE9SSUVTKSB7XG5cdFx0XHRjb25zdCBvbGRlc3REaXJlY3RvcnkgPSB0aGlzLl9ub25SZXBvc2l0b3J5RGlyZWN0b3JpZXMua2V5cygpLm5leHQoKS52YWx1ZTtcblx0XHRcdGlmIChvbGRlc3REaXJlY3RvcnkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHRoaXMuX25vblJlcG9zaXRvcnlEaXJlY3Rvcmllcy5kZWxldGUob2xkZXN0RGlyZWN0b3J5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc0N1cnJlbnRHZW5lcmF0aW9uKGdlbmVyYXRpb246IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9lbmFibGVkICYmIGdlbmVyYXRpb24gPT09IHRoaXMuX2dlbmVyYXRpb247XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvcmRTZXR0bGVkRmx1c2goZmx1c2hUb2tlbjogc3RyaW5nLCByZXN1bHQ6IElFZGl0QXR0cmlidXRpb25GbHVzaFJlc3VsdCk6IHZvaWQge1xuXHRcdHRoaXMuX3NldHRsZWRGbHVzaGVzLmRlbGV0ZShmbHVzaFRva2VuKTtcblx0XHR0aGlzLl9zZXR0bGVkRmx1c2hlcy5zZXQoZmx1c2hUb2tlbiwgeyByZXN1bHQsIHRpbWVzdGFtcDogdGhpcy5fbm93KCkgfSk7XG5cdFx0d2hpbGUgKHRoaXMuX3NldHRsZWRGbHVzaGVzLnNpemUgPiBNQVhfU0VUVExFRF9GTFVTSEVTKSB7XG5cdFx0XHRjb25zdCBvbGRlc3RUb2tlbiA9IHRoaXMuX3NldHRsZWRGbHVzaGVzLmtleXMoKS5uZXh0KCkudmFsdWU7XG5cdFx0XHRpZiAob2xkZXN0VG9rZW4gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NldHRsZWRGbHVzaGVzLmRlbGV0ZShvbGRlc3RUb2tlbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb3JkU3RhbmRhbG9uZU93bmVyc2hpcChmaWxlUGF0aDogc3RyaW5nLCBhZ2VudE1vZGlmaWVkQ291bnQ6IG51bWJlciwgbGFzdFNlcXVlbmNlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9maWxlUGF0aEtleShmaWxlUGF0aCk7XG5cdFx0dGhpcy5fcmVzdG9yZVN0YW5kYWxvbmVPd25lcnNoaXAoW1trZXksIHtcblx0XHRcdHRpbWVzdGFtcDogdGhpcy5fbm93KCksXG5cdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0XHRsYXN0U2VxdWVuY2UsXG5cdFx0fV1dKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc3RvcmVTdGFuZGFsb25lT3duZXJzaGlwKG93bmVyc2hpcDogcmVhZG9ubHkgKHJlYWRvbmx5IFtzdHJpbmcsIElTdGFuZGFsb25lT3duZXJzaGlwXSlbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIG93bmVyc2hpcCkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9zdGFuZGFsb25lT3duZXJzaGlwLmdldChrZXkpO1xuXHRcdFx0dGhpcy5fc3RhbmRhbG9uZU93bmVyc2hpcC5kZWxldGUoa2V5KTtcblx0XHRcdHRoaXMuX3N0YW5kYWxvbmVPd25lcnNoaXAuc2V0KGtleSwge1xuXHRcdFx0XHR0aW1lc3RhbXA6IE1hdGgubWF4KGV4aXN0aW5nPy50aW1lc3RhbXAgPz8gMCwgdmFsdWUudGltZXN0YW1wKSxcblx0XHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiAoZXhpc3Rpbmc/LmFnZW50TW9kaWZpZWRDb3VudCA/PyAwKSArIHZhbHVlLmFnZW50TW9kaWZpZWRDb3VudCxcblx0XHRcdFx0bGFzdFNlcXVlbmNlOiBNYXRoLm1heChleGlzdGluZz8ubGFzdFNlcXVlbmNlID8/IDAsIHZhbHVlLmxhc3RTZXF1ZW5jZSksXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0d2hpbGUgKHRoaXMuX3N0YW5kYWxvbmVPd25lcnNoaXAuc2l6ZSA+IE1BWF9TVEFOREFMT05FX09XTkVSU0hJUCkge1xuXHRcdFx0Y29uc3Qgb2xkZXN0S2V5ID0gdGhpcy5fc3RhbmRhbG9uZU93bmVyc2hpcC5rZXlzKCkubmV4dCgpLnZhbHVlO1xuXHRcdFx0aWYgKG9sZGVzdEtleSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3RhbmRhbG9uZU93bmVyc2hpcC5kZWxldGUob2xkZXN0S2V5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9maWxlUGF0aEtleShmaWxlUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuZ2V0Q29tcGFyaXNvbktleShVUkkuZmlsZShmaWxlUGF0aCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNSZWNvcmRpbmdGaWxlKGZpbGVQYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGZpbGVQYXRoKTtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLl9yZWNvcmRpbmdFZGl0cykuc29tZShlZGl0ID0+IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwoVVJJLmZpbGUoZWRpdC5maWxlUGF0aCksIHJlc291cmNlKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9leHBpcmVGbHVzaFN0YXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5vdyA9IHRoaXMuX25vdygpO1xuXHRcdGNvbnN0IGV4cGlyYXRpb25zOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtmbHVzaFRva2VuLCBwcmVwYXJlZF0gb2YgdGhpcy5fcHJlcGFyZWRGbHVzaGVzKSB7XG5cdFx0XHRpZiAocHJlcGFyZWQudGltZXN0YW1wIDwgbm93IC0gUFJFUEFSRURfRkxVU0hfVFRMKSB7XG5cdFx0XHRcdGV4cGlyYXRpb25zLnB1c2godGhpcy5fZmlsZVNlcXVlbmNlci5xdWV1ZShwcmVwYXJlZC5maWxlS2V5LCBhc3luYyAoKSA9PiB0aGlzLl9leHBpcmVQcmVwYXJlZEZsdXNoKGZsdXNoVG9rZW4sIHByZXBhcmVkLCBub3cpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChleHBpcmF0aW9ucyk7XG5cdFx0Zm9yIChjb25zdCBbZmx1c2hUb2tlbiwgc2V0dGxlZF0gb2YgdGhpcy5fc2V0dGxlZEZsdXNoZXMpIHtcblx0XHRcdGlmIChzZXR0bGVkLnRpbWVzdGFtcCA8IG5vdyAtIFNFVFRMRURfRkxVU0hfVFRMKSB7XG5cdFx0XHRcdHRoaXMuX3NldHRsZWRGbHVzaGVzLmRlbGV0ZShmbHVzaFRva2VuKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbcmVzb3VyY2VLZXksIG93bmVyc2hpcF0gb2YgdGhpcy5fc3RhbmRhbG9uZU93bmVyc2hpcCkge1xuXHRcdFx0aWYgKG93bmVyc2hpcC50aW1lc3RhbXAgPCBub3cgLSBTVEFOREFMT05FX09XTkVSU0hJUF9UVEwpIHtcblx0XHRcdFx0dGhpcy5fc3RhbmRhbG9uZU93bmVyc2hpcC5kZWxldGUocmVzb3VyY2VLZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2V4cGlyZVByZXBhcmVkRmx1c2goZmx1c2hUb2tlbjogc3RyaW5nLCBwcmVwYXJlZDogSVByZXBhcmVkRmx1c2gsIG5vdzogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3ByZXBhcmVkRmx1c2hlcy5nZXQoZmx1c2hUb2tlbikgIT09IHByZXBhcmVkIHx8IHByZXBhcmVkLnRpbWVzdGFtcCA+PSBub3cgLSBQUkVQQVJFRF9GTFVTSF9UVEwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcHJlcGFyZWRGbHVzaGVzLmRlbGV0ZShmbHVzaFRva2VuKTtcblx0XHRpZiAocHJlcGFyZWQucmVzb3VyY2VzLnNvbWUocmVzb3VyY2UgPT4gdGhpcy5fcmVzb3VyY2VzLmhhcyhyZXNvdXJjZS5rZXkpKSkge1xuXHRcdFx0dGhpcy5fcmVsZWFzZVJlc291cmNlQ2xhaW1zKHByZXBhcmVkLnJlc291cmNlcyk7XG5cdFx0XHR0aGlzLl9lbWl0VGVsZW1ldHJ5KHByZXBhcmVkLCBwcmVwYXJlZC5hZ2VudE1vZGlmaWVkQ291bnQpO1xuXHRcdFx0dGhpcy5fcmVjb3JkU2V0dGxlZEZsdXNoKGZsdXNoVG9rZW4sIHsgb3V0Y29tZTogJ2NvbW1pdHRlZCcsIGFnZW50TW9kaWZpZWRDb3VudDogcHJlcGFyZWQuYWdlbnRNb2RpZmllZENvdW50IH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZXN0b3JlUmVzb3VyY2VzKHByZXBhcmVkLnJlc291cmNlcyk7XG5cdFx0XHR0aGlzLl9yZXN0b3JlU3RhbmRhbG9uZU93bmVyc2hpcChwcmVwYXJlZC5zdGFuZGFsb25lT3duZXJzaGlwKTtcblx0XHRcdHRoaXMuX3JlY29yZFNldHRsZWRGbHVzaChmbHVzaFRva2VuLCB7IG91dGNvbWU6ICdjYW5jZWxsZWQnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfSk7XG5cdFx0fVxuXHRcdHRoaXMuX2NsZWFudXBSZXBvc2l0b3JpZXMocHJlcGFyZWQucmVzb3VyY2VzKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dm9pZCB0aGlzLl9mbHVzaEFsbCgnY2xvc2VkJyk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlc291cmNlS2V5KHNlc3Npb25Vcmk6IHN0cmluZywgZmlsZVBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBgJHtzZXNzaW9uVXJpfVxcMCR7ZmlsZVBhdGh9YDtcbn1cblxuZnVuY3Rpb24gY29tYmluZVByZXBhcmVkRmx1c2hlcyhcblx0Zmx1c2hlczogcmVhZG9ubHkgSVByZXBhcmVkRmx1c2hbXSxcblx0ZmlsZUtleTogc3RyaW5nLFxuXHR0cmlnZ2VyOiBFZGl0VGVsZW1ldHJ5VHJpZ2dlcixcblx0c3RhdHNVdWlkOiBzdHJpbmcsXG5cdGZsdXNoVG9rZW46IHN0cmluZyxcblx0bGFuZ3VhZ2VJZDogc3RyaW5nLFxuXHRzdGFuZGFsb25lT3duZXJzaGlwOiByZWFkb25seSAocmVhZG9ubHkgW3N0cmluZywgSVN0YW5kYWxvbmVPd25lcnNoaXBdKVtdLFxuXHR0aW1lc3RhbXA6IG51bWJlcixcbik6IElQcmVwYXJlZEZsdXNoIHtcblx0Y29uc3QgcmV0YWluZWRCeVNvdXJjZSA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdGNvbnN0IHNvdXJjZXMgPSBuZXcgTWFwPHN0cmluZywgSVNvdXJjZVN0YXRpc3RpY3M+KCk7XG5cdGZvciAoY29uc3QgZmx1c2ggb2YgZmx1c2hlcykge1xuXHRcdGZvciAoY29uc3QgW3NvdXJjZUtleSwgcmV0YWluZWRDb3VudF0gb2YgZmx1c2gucmV0YWluZWRCeVNvdXJjZSkge1xuXHRcdFx0cmV0YWluZWRCeVNvdXJjZS5zZXQoc291cmNlS2V5LCAocmV0YWluZWRCeVNvdXJjZS5nZXQoc291cmNlS2V5KSA/PyAwKSArIHJldGFpbmVkQ291bnQpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHNvdXJjZSBvZiBmbHVzaC5zb3VyY2VzKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHNvdXJjZXMuZ2V0KHNvdXJjZS5zb3VyY2VLZXkpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdGV4aXN0aW5nLmluc2VydGVkQ291bnQgKz0gc291cmNlLmluc2VydGVkQ291bnQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzb3VyY2VzLnNldChzb3VyY2Uuc291cmNlS2V5LCB7IC4uLnNvdXJjZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHtcblx0XHR0b2tlbjogZmx1c2hUb2tlbixcblx0XHRmaWxlS2V5LFxuXHRcdHRyaWdnZXIsXG5cdFx0c3RhdHNVdWlkLFxuXHRcdGxhbmd1YWdlSWQsXG5cdFx0c291cmNlczogQXJyYXkuZnJvbShzb3VyY2VzLnZhbHVlcygpKVxuXHRcdFx0LnRvU29ydGVkKChhLCBiKSA9PiAocmV0YWluZWRCeVNvdXJjZS5nZXQoYi5zb3VyY2VLZXkpID8/IDApIC0gKHJldGFpbmVkQnlTb3VyY2UuZ2V0KGEuc291cmNlS2V5KSA/PyAwKSlcblx0XHRcdC5zbGljZSgwLCAzMCksXG5cdFx0cmV0YWluZWRCeVNvdXJjZSxcblx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IHN0YW5kYWxvbmVPd25lcnNoaXAucmVkdWNlKChzdW0sIFssIHZhbHVlXSkgPT4gc3VtICsgdmFsdWUuYWdlbnRNb2RpZmllZENvdW50LCAwKSArIEFycmF5LmZyb20ocmV0YWluZWRCeVNvdXJjZS52YWx1ZXMoKSkucmVkdWNlKChzdW0sIHZhbHVlKSA9PiBzdW0gKyB2YWx1ZSwgMCksXG5cdFx0bGFzdFNlcXVlbmNlOiBNYXRoLm1heChcblx0XHRcdDAsXG5cdFx0XHQuLi5mbHVzaGVzLm1hcChmbHVzaCA9PiBmbHVzaC5sYXN0U2VxdWVuY2UpLFxuXHRcdFx0Li4uc3RhbmRhbG9uZU93bmVyc2hpcC5tYXAoKFssIHZhbHVlXSkgPT4gdmFsdWUubGFzdFNlcXVlbmNlKSxcblx0XHQpLFxuXHRcdHJlc291cmNlczogZmx1c2hlcy5mbGF0TWFwKGZsdXNoID0+IGZsdXNoLnJlc291cmNlcyksXG5cdFx0c3RhbmRhbG9uZU93bmVyc2hpcCxcblx0XHR0aW1lc3RhbXAsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ2hhbmdlcyhiZWZvcmU6IHN0cmluZywgYWZ0ZXI6IHN0cmluZywgY2hhbmdlczogcmVhZG9ubHkgSU9mZnNldEVkaXRbXSk6IGJvb2xlYW4ge1xuXHRsZXQgcmVzdWx0ID0gJyc7XG5cdGxldCBsYXN0T2Zmc2V0ID0gMDtcblx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhbmdlcykge1xuXHRcdGlmIChjaGFuZ2Uuc3RhcnRPZmZzZXQgPCBsYXN0T2Zmc2V0IHx8IGNoYW5nZS5lbmRPZmZzZXRFeGNsdXNpdmUgPCBjaGFuZ2Uuc3RhcnRPZmZzZXQgfHwgY2hhbmdlLmVuZE9mZnNldEV4Y2x1c2l2ZSA+IGJlZm9yZS5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmVzdWx0ICs9IGJlZm9yZS5zdWJzdHJpbmcobGFzdE9mZnNldCwgY2hhbmdlLnN0YXJ0T2Zmc2V0KTtcblx0XHRyZXN1bHQgKz0gY2hhbmdlLm5ld1RleHQ7XG5cdFx0bGFzdE9mZnNldCA9IGNoYW5nZS5lbmRPZmZzZXRFeGNsdXNpdmU7XG5cdH1cblx0cmV0dXJuIHJlc3VsdCArIGJlZm9yZS5zdWJzdHJpbmcobGFzdE9mZnNldCkgPT09IGFmdGVyO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNaW5pbWFsQ2hhbmdlKGJlZm9yZTogc3RyaW5nLCBhZnRlcjogc3RyaW5nKTogSU9mZnNldEVkaXQge1xuXHRsZXQgcHJlZml4TGVuZ3RoID0gMDtcblx0d2hpbGUgKHByZWZpeExlbmd0aCA8IGJlZm9yZS5sZW5ndGggJiYgcHJlZml4TGVuZ3RoIDwgYWZ0ZXIubGVuZ3RoICYmIGJlZm9yZS5jaGFyQ29kZUF0KHByZWZpeExlbmd0aCkgPT09IGFmdGVyLmNoYXJDb2RlQXQocHJlZml4TGVuZ3RoKSkge1xuXHRcdHByZWZpeExlbmd0aCsrO1xuXHR9XG5cdGxldCBzdWZmaXhMZW5ndGggPSAwO1xuXHR3aGlsZSAoXG5cdFx0c3VmZml4TGVuZ3RoIDwgYmVmb3JlLmxlbmd0aCAtIHByZWZpeExlbmd0aCAmJlxuXHRcdHN1ZmZpeExlbmd0aCA8IGFmdGVyLmxlbmd0aCAtIHByZWZpeExlbmd0aCAmJlxuXHRcdGJlZm9yZS5jaGFyQ29kZUF0KGJlZm9yZS5sZW5ndGggLSBzdWZmaXhMZW5ndGggLSAxKSA9PT0gYWZ0ZXIuY2hhckNvZGVBdChhZnRlci5sZW5ndGggLSBzdWZmaXhMZW5ndGggLSAxKVxuXHQpIHtcblx0XHRzdWZmaXhMZW5ndGgrKztcblx0fVxuXHRyZXR1cm4ge1xuXHRcdHN0YXJ0T2Zmc2V0OiBwcmVmaXhMZW5ndGgsXG5cdFx0ZW5kT2Zmc2V0RXhjbHVzaXZlOiBiZWZvcmUubGVuZ3RoIC0gc3VmZml4TGVuZ3RoLFxuXHRcdG5ld1RleHQ6IGFmdGVyLnN1YnN0cmluZyhwcmVmaXhMZW5ndGgsIGFmdGVyLmxlbmd0aCAtIHN1ZmZpeExlbmd0aCksXG5cdH07XG59XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybUludGVydmFscyhpbnRlcnZhbHM6IHJlYWRvbmx5IElBdHRyaWJ1dGVkSW50ZXJ2YWxbXSwgY2hhbmdlczogcmVhZG9ubHkgSU9mZnNldEVkaXRbXSk6IElBdHRyaWJ1dGVkSW50ZXJ2YWxbXSB7XG5cdGNvbnN0IHJlc3VsdDogSUF0dHJpYnV0ZWRJbnRlcnZhbFtdID0gW107XG5cdGZvciAoY29uc3QgaW50ZXJ2YWwgb2YgaW50ZXJ2YWxzKSB7XG5cdFx0bGV0IGN1cnNvciA9IGludGVydmFsLnN0YXJ0O1xuXHRcdGxldCBkZWx0YSA9IDA7XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhbmdlcykge1xuXHRcdFx0aWYgKGNoYW5nZS5lbmRPZmZzZXRFeGNsdXNpdmUgPD0gY3Vyc29yKSB7XG5cdFx0XHRcdGRlbHRhICs9IGNoYW5nZS5uZXdUZXh0Lmxlbmd0aCAtIChjaGFuZ2UuZW5kT2Zmc2V0RXhjbHVzaXZlIC0gY2hhbmdlLnN0YXJ0T2Zmc2V0KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2hhbmdlLnN0YXJ0T2Zmc2V0ID49IGludGVydmFsLmVuZEV4Y2x1c2l2ZSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmIChjdXJzb3IgPCBjaGFuZ2Uuc3RhcnRPZmZzZXQpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdHN0YXJ0OiBjdXJzb3IgKyBkZWx0YSxcblx0XHRcdFx0XHRlbmRFeGNsdXNpdmU6IE1hdGgubWluKGludGVydmFsLmVuZEV4Y2x1c2l2ZSwgY2hhbmdlLnN0YXJ0T2Zmc2V0KSArIGRlbHRhLFxuXHRcdFx0XHRcdHNvdXJjZUtleTogaW50ZXJ2YWwuc291cmNlS2V5LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGN1cnNvciA9IE1hdGgubWF4KGN1cnNvciwgY2hhbmdlLmVuZE9mZnNldEV4Y2x1c2l2ZSk7XG5cdFx0XHRkZWx0YSArPSBjaGFuZ2UubmV3VGV4dC5sZW5ndGggLSAoY2hhbmdlLmVuZE9mZnNldEV4Y2x1c2l2ZSAtIGNoYW5nZS5zdGFydE9mZnNldCk7XG5cdFx0fVxuXHRcdGlmIChjdXJzb3IgPCBpbnRlcnZhbC5lbmRFeGNsdXNpdmUpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0c3RhcnQ6IGN1cnNvciArIGRlbHRhLFxuXHRcdFx0XHRlbmRFeGNsdXNpdmU6IGludGVydmFsLmVuZEV4Y2x1c2l2ZSArIGRlbHRhLFxuXHRcdFx0XHRzb3VyY2VLZXk6IGludGVydmFsLnNvdXJjZUtleSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBtZXJnZUludGVydmFscyhpbnRlcnZhbHM6IHJlYWRvbmx5IElBdHRyaWJ1dGVkSW50ZXJ2YWxbXSk6IElBdHRyaWJ1dGVkSW50ZXJ2YWxbXSB7XG5cdGNvbnN0IHJlc3VsdDogSUF0dHJpYnV0ZWRJbnRlcnZhbFtdID0gW107XG5cdGZvciAoY29uc3QgaW50ZXJ2YWwgb2YgaW50ZXJ2YWxzKSB7XG5cdFx0aWYgKGludGVydmFsLnN0YXJ0ID09PSBpbnRlcnZhbC5lbmRFeGNsdXNpdmUpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBwcmV2aW91cyA9IHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV07XG5cdFx0aWYgKHByZXZpb3VzPy5zb3VyY2VLZXkgPT09IGludGVydmFsLnNvdXJjZUtleSAmJiBwcmV2aW91cy5lbmRFeGNsdXNpdmUgPT09IGludGVydmFsLnN0YXJ0KSB7XG5cdFx0XHRyZXN1bHRbcmVzdWx0Lmxlbmd0aCAtIDFdID0ge1xuXHRcdFx0XHRzdGFydDogcHJldmlvdXMuc3RhcnQsXG5cdFx0XHRcdGVuZEV4Y2x1c2l2ZTogaW50ZXJ2YWwuZW5kRXhjbHVzaXZlLFxuXHRcdFx0XHRzb3VyY2VLZXk6IGludGVydmFsLnNvdXJjZUtleSxcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdC5wdXNoKGludGVydmFsKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVhZEdpdFN0YXRlKHdvcmtpbmdEaXJlY3Rvcnk6IHN0cmluZyk6IFByb21pc2U8SUFnZW50RWRpdEF0dHJpYnV0aW9uR2l0U3RhdGUgfCB1bmRlZmluZWQ+IHtcblx0dHJ5IHtcblx0XHRjb25zdCB7IHN0ZG91dCB9ID0gYXdhaXQgZXhlY0ZpbGVBc3luYygnZ2l0JywgWydyZXYtcGFyc2UnLCAnLS1zaG93LXRvcGxldmVsJywgJ0hFQUQnLCAnLS1hYmJyZXYtcmVmJywgJ0hFQUQnXSwge1xuXHRcdFx0Y3dkOiB3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0dGltZW91dDogR0lUX1NUQVRFX1RJTUVPVVQsXG5cdFx0fSk7XG5cdFx0Y29uc3QgW3Jvb3QsIGhlYWQsIGJyYW5jaF0gPSBzdGRvdXQudHJpbSgpLnNwbGl0KC9cXHI/XFxuLyk7XG5cdFx0aWYgKCFyb290IHx8ICFoZWFkIHx8ICFicmFuY2gpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRyb290LFxuXHRcdFx0aGVhZCxcblx0XHRcdGJyYW5jaDogYnJhbmNoID09PSAnSEVBRCcgPyAnJyA6IGJyYW5jaCxcblx0XHR9O1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZSxzQkFBc0I7QUFDOUMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0NBQWtDO0FBQzNDLFNB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SUFBSSxRQUFRLE9BQU8sa0JBQWtCO0FBQ25ELGVBQVMsT0FBTyxRQUFRLFVBQVUsT0FBTyxxQkFBcUIsT0FBTztBQUFBLElBQ3RFO0FBQ0EsUUFBSSxTQUFTLFNBQVMsY0FBYztBQUNuQyxhQUFPLEtBQUs7QUFBQSxRQUNYLE9BQU8sU0FBUztBQUFBLFFBQ2hCLGNBQWMsU0FBUyxlQUFlO0FBQUEsUUFDdEMsV0FBVyxTQUFTO0FBQUEsTUFDckIsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxlQUFlLFdBQWtFO0FBQ3pGLFFBQU0sU0FBZ0MsQ0FBQztBQUN2QyxhQUFXLFlBQVksV0FBVztBQUNqQyxRQUFJLFNBQVMsVUFBVSxTQUFTLGNBQWM7QUFDN0M7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXLE9BQU8sT0FBTyxTQUFTLENBQUM7QUFDekMsUUFBSSxVQUFVLGNBQWMsU0FBUyxhQUFhLFNBQVMsaUJBQWlCLFNBQVMsT0FBTztBQUMzRixhQUFPLE9BQU8sU0FBUyxDQUFDLElBQUk7QUFBQSxRQUMzQixPQUFPLFNBQVM7QUFBQSxRQUNoQixjQUFjLFNBQVM7QUFBQSxRQUN2QixXQUFXLFNBQVM7QUFBQSxNQUNyQjtBQUFBLElBQ0QsT0FBTztBQUNOLGFBQU8sS0FBSyxRQUFRO0FBQUEsSUFDckI7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBRUEsZUFBZSxhQUFhLGtCQUE4RTtBQUN6RyxNQUFJO0FBQ0gsVUFBTSxFQUFFLE9BQU8sSUFBSSxNQUFNLGNBQWMsT0FBTyxDQUFDLGFBQWEsbUJBQW1CLFFBQVEsZ0JBQWdCLE1BQU0sR0FBRztBQUFBLE1BQy9HLEtBQUs7QUFBQSxNQUNMLFNBQVM7QUFBQSxJQUNWLENBQUM7QUFDRCxVQUFNLENBQUMsTUFBTSxNQUFNLE1BQU0sSUFBSSxPQUFPLEtBQUssRUFBRSxNQUFNLE9BQU87QUFDeEQsUUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUTtBQUM5QixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0EsUUFBUSxXQUFXLFNBQVMsS0FBSztBQUFBLElBQ2xDO0FBQUEsRUFDRCxRQUFRO0FBQ1AsV0FBTztBQUFBLEVBQ1I7QUFDRDsiLAogICJuYW1lcyI6IFsicHJlcGFyZWQiLCAicmVzdWx0IiwgInJlc291cmNlIiwgInJlc291cmNlS2V5Il0KfQo=
