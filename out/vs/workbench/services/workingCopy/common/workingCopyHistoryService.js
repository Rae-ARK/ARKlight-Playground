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
import { localize } from "../../../../nls.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { WorkingCopyHistoryTracker } from "./workingCopyHistoryTracker.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { MAX_PARALLEL_HISTORY_IO_OPS } from "./workingCopyHistory.js";
import { FileOperationError, FileOperationResult, IFileService } from "../../../../platform/files/common/files.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
import { URI } from "../../../../base/common/uri.js";
import { DeferredPromise, Limiter, RunOnceScheduler } from "../../../../base/common/async.js";
import { dirname, extname, isEqual, joinPath } from "../../../../base/common/resources.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { hash } from "../../../../base/common/hash.js";
import { indexOfPath, randomPath } from "../../../../base/common/extpath.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { SaveSourceRegistry } from "../../../common/editor.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { distinct } from "../../../../base/common/arrays.js";
import { escapeRegExpCharacters } from "../../../../base/common/strings.js";
const _WorkingCopyHistoryModel = class _WorkingCopyHistoryModel {
  constructor(workingCopyResource, historyHome, entryAddedEmitter, entryChangedEmitter, entryReplacedEmitter, entryRemovedEmitter, options, fileService, labelService, logService, configurationService) {
    this.historyHome = historyHome;
    this.entryAddedEmitter = entryAddedEmitter;
    this.entryChangedEmitter = entryChangedEmitter;
    this.entryReplacedEmitter = entryReplacedEmitter;
    this.entryRemovedEmitter = entryRemovedEmitter;
    this.options = options;
    this.fileService = fileService;
    this.labelService = labelService;
    this.logService = logService;
    this.configurationService = configurationService;
    this.entries = [];
    this.whenResolved = void 0;
    this.workingCopyResource = void 0;
    this.workingCopyName = void 0;
    this.historyEntriesFolder = void 0;
    this.historyEntriesListingFile = void 0;
    this.historyEntriesNameMatcher = void 0;
    this.versionId = 0;
    this.storedVersionId = this.versionId;
    this.storeLimiter = new Limiter(1);
    this.setWorkingCopy(workingCopyResource);
  }
  setWorkingCopy(workingCopyResource) {
    this.workingCopyResource = workingCopyResource;
    this.workingCopyName = this.labelService.getUriBasenameLabel(workingCopyResource);
    this.historyEntriesNameMatcher = new RegExp(`[A-Za-z0-9]{4}${escapeRegExpCharacters(extname(workingCopyResource))}`);
    this.historyEntriesFolder = this.toHistoryEntriesFolder(this.historyHome, workingCopyResource);
    this.historyEntriesListingFile = joinPath(this.historyEntriesFolder, _WorkingCopyHistoryModel.ENTRIES_FILE);
    this.entries = [];
    this.whenResolved = void 0;
  }
  toHistoryEntriesFolder(historyHome, workingCopyResource) {
    return joinPath(historyHome, hash(workingCopyResource.toString()).toString(16));
  }
  async addEntry(source = _WorkingCopyHistoryModel.FILE_SAVED_SOURCE, sourceDescription = void 0, timestamp = Date.now(), token) {
    let entryToReplace = void 0;
    const lastEntry = this.entries.at(-1);
    if (lastEntry && lastEntry.source === source) {
      const configuredReplaceInterval = this.configurationService.getValue(_WorkingCopyHistoryModel.SETTINGS.MERGE_PERIOD, { resource: this.workingCopyResource });
      if (timestamp - lastEntry.timestamp <= configuredReplaceInterval * 1e3) {
        entryToReplace = lastEntry;
      }
    }
    let entry;
    if (entryToReplace) {
      entry = await this.doReplaceEntry(entryToReplace, source, sourceDescription, timestamp, token);
    } else {
      entry = await this.doAddEntry(source, sourceDescription, timestamp, token);
    }
    if (this.options.flushOnChange && !token.isCancellationRequested) {
      await this.store(token);
    }
    return entry;
  }
  async doAddEntry(source, sourceDescription = void 0, timestamp, token) {
    const workingCopyResource = assertReturnsDefined(this.workingCopyResource);
    const workingCopyName = assertReturnsDefined(this.workingCopyName);
    const historyEntriesFolder = assertReturnsDefined(this.historyEntriesFolder);
    const id = `${randomPath(void 0, void 0, 4)}${extname(workingCopyResource)}`;
    const location = joinPath(historyEntriesFolder, id);
    await this.fileService.cloneFile(workingCopyResource, location);
    const entry = {
      id,
      workingCopy: { resource: workingCopyResource, name: workingCopyName },
      location,
      timestamp,
      source,
      sourceDescription
    };
    this.entries.push(entry);
    this.versionId++;
    this.entryAddedEmitter.fire({ entry });
    return entry;
  }
  async doReplaceEntry(entry, source, sourceDescription = void 0, timestamp, token) {
    const workingCopyResource = assertReturnsDefined(this.workingCopyResource);
    await this.fileService.cloneFile(workingCopyResource, entry.location);
    entry.source = source;
    entry.sourceDescription = sourceDescription;
    entry.timestamp = timestamp;
    this.versionId++;
    this.entryReplacedEmitter.fire({ entry });
    return entry;
  }
  async removeEntry(entry, token) {
    await this.resolveEntriesOnce();
    if (token.isCancellationRequested) {
      return false;
    }
    const index = this.entries.indexOf(entry);
    if (index === -1) {
      return false;
    }
    await this.deleteEntry(entry);
    this.entries.splice(index, 1);
    this.versionId++;
    this.entryRemovedEmitter.fire({ entry });
    if (this.options.flushOnChange && !token.isCancellationRequested) {
      await this.store(token);
    }
    return true;
  }
  async updateEntry(entry, properties, token) {
    await this.resolveEntriesOnce();
    if (token.isCancellationRequested) {
      return;
    }
    const index = this.entries.indexOf(entry);
    if (index === -1) {
      return;
    }
    entry.source = properties.source;
    this.versionId++;
    this.entryChangedEmitter.fire({ entry });
    if (this.options.flushOnChange && !token.isCancellationRequested) {
      await this.store(token);
    }
  }
  async getEntries() {
    await this.resolveEntriesOnce();
    const configuredMaxEntries = this.configurationService.getValue(_WorkingCopyHistoryModel.SETTINGS.MAX_ENTRIES, { resource: this.workingCopyResource });
    if (this.entries.length > configuredMaxEntries) {
      return this.entries.slice(this.entries.length - configuredMaxEntries);
    }
    return this.entries;
  }
  async hasEntries(skipResolve) {
    if (!skipResolve) {
      await this.resolveEntriesOnce();
    }
    return this.entries.length > 0;
  }
  resolveEntriesOnce() {
    if (!this.whenResolved) {
      this.whenResolved = this.doResolveEntries();
    }
    return this.whenResolved;
  }
  async doResolveEntries() {
    const entries = await this.resolveEntriesFromDisk();
    for (const entry of this.entries) {
      entries.set(entry.id, entry);
    }
    this.entries = Array.from(entries.values()).sort((entryA, entryB) => entryA.timestamp - entryB.timestamp);
  }
  async resolveEntriesFromDisk() {
    const workingCopyResource = assertReturnsDefined(this.workingCopyResource);
    const workingCopyName = assertReturnsDefined(this.workingCopyName);
    const [entryListing, entryStats] = await Promise.all([
      // Resolve entries listing file
      this.readEntriesFile(),
      // Resolve children of history folder
      this.readEntriesFolder()
    ]);
    const entries = /* @__PURE__ */ new Map();
    if (entryStats) {
      for (const entryStat of entryStats) {
        entries.set(entryStat.name, {
          id: entryStat.name,
          workingCopy: { resource: workingCopyResource, name: workingCopyName },
          location: entryStat.resource,
          timestamp: entryStat.mtime,
          source: _WorkingCopyHistoryModel.FILE_SAVED_SOURCE,
          sourceDescription: void 0
        });
      }
    }
    if (entryListing) {
      for (const entry of entryListing.entries) {
        const existingEntry = entries.get(entry.id);
        if (existingEntry) {
          entries.set(entry.id, {
            ...existingEntry,
            timestamp: entry.timestamp,
            source: entry.source ?? existingEntry.source,
            sourceDescription: entry.sourceDescription ?? existingEntry.sourceDescription
          });
        }
      }
    }
    return entries;
  }
  async moveEntries(target, source, token) {
    const timestamp = Date.now();
    const sourceDescription = this.labelService.getUriLabel(assertReturnsDefined(this.workingCopyResource));
    const sourceHistoryEntriesFolder = assertReturnsDefined(this.historyEntriesFolder);
    const targetHistoryEntriesFolder = assertReturnsDefined(target.historyEntriesFolder);
    try {
      for (const entry of this.entries) {
        await this.fileService.move(entry.location, joinPath(targetHistoryEntriesFolder, entry.id), true);
      }
      await this.fileService.del(sourceHistoryEntriesFolder, { recursive: true });
    } catch (error) {
      if (!this.isFileNotFound(error)) {
        try {
          await this.fileService.move(sourceHistoryEntriesFolder, targetHistoryEntriesFolder, true);
        } catch (error2) {
          if (!this.isFileNotFound(error2)) {
            this.traceError(error2);
          }
        }
      }
    }
    const allEntries = distinct([...this.entries, ...target.entries], (entry) => entry.id).sort((entryA, entryB) => entryA.timestamp - entryB.timestamp);
    const targetWorkingCopyResource = assertReturnsDefined(target.workingCopyResource);
    this.setWorkingCopy(targetWorkingCopyResource);
    const targetWorkingCopyName = assertReturnsDefined(target.workingCopyName);
    for (const entry of allEntries) {
      this.entries.push({
        id: entry.id,
        location: joinPath(targetHistoryEntriesFolder, entry.id),
        source: entry.source,
        sourceDescription: entry.sourceDescription,
        timestamp: entry.timestamp,
        workingCopy: {
          resource: targetWorkingCopyResource,
          name: targetWorkingCopyName
        }
      });
    }
    await this.addEntry(source, sourceDescription, timestamp, token);
    await this.store(token);
  }
  async store(token) {
    if (!this.shouldStore()) {
      return;
    }
    await this.storeLimiter.queue(async () => {
      if (token.isCancellationRequested || !this.shouldStore()) {
        return;
      }
      return this.doStore(token);
    });
  }
  shouldStore() {
    return this.storedVersionId !== this.versionId;
  }
  async doStore(token) {
    const historyEntriesFolder = assertReturnsDefined(this.historyEntriesFolder);
    await this.resolveEntriesOnce();
    if (token.isCancellationRequested) {
      return void 0;
    }
    await this.cleanUpEntries();
    const storedVersion = this.versionId;
    if (this.entries.length === 0) {
      try {
        await this.fileService.del(historyEntriesFolder, { recursive: true });
      } catch (error) {
        this.traceError(error);
      }
    } else {
      await this.writeEntriesFile();
    }
    this.storedVersionId = storedVersion;
  }
  async cleanUpEntries() {
    const configuredMaxEntries = this.configurationService.getValue(_WorkingCopyHistoryModel.SETTINGS.MAX_ENTRIES, { resource: this.workingCopyResource });
    if (this.entries.length <= configuredMaxEntries) {
      return;
    }
    const entriesToDelete = this.entries.slice(0, this.entries.length - configuredMaxEntries);
    const entriesToKeep = this.entries.slice(this.entries.length - configuredMaxEntries);
    for (const entryToDelete of entriesToDelete) {
      await this.deleteEntry(entryToDelete);
    }
    this.entries = entriesToKeep;
    for (const entry of entriesToDelete) {
      this.entryRemovedEmitter.fire({ entry });
    }
  }
  async deleteEntry(entry) {
    try {
      await this.fileService.del(entry.location);
    } catch (error) {
      this.traceError(error);
    }
  }
  async writeEntriesFile() {
    const workingCopyResource = assertReturnsDefined(this.workingCopyResource);
    const historyEntriesListingFile = assertReturnsDefined(this.historyEntriesListingFile);
    const serializedModel = {
      version: 1,
      resource: workingCopyResource.toString(),
      entries: this.entries.map((entry) => {
        return {
          id: entry.id,
          source: entry.source !== _WorkingCopyHistoryModel.FILE_SAVED_SOURCE ? entry.source : void 0,
          sourceDescription: entry.sourceDescription,
          timestamp: entry.timestamp
        };
      })
    };
    await this.fileService.writeFile(historyEntriesListingFile, VSBuffer.fromString(JSON.stringify(serializedModel)));
  }
  async readEntriesFile() {
    const historyEntriesListingFile = assertReturnsDefined(this.historyEntriesListingFile);
    let serializedModel = void 0;
    try {
      serializedModel = JSON.parse((await this.fileService.readFile(historyEntriesListingFile)).value.toString());
    } catch (error) {
      if (!this.isFileNotFound(error)) {
        this.traceError(error);
      }
    }
    return serializedModel;
  }
  async readEntriesFolder() {
    const historyEntriesFolder = assertReturnsDefined(this.historyEntriesFolder);
    const historyEntriesNameMatcher = assertReturnsDefined(this.historyEntriesNameMatcher);
    let rawEntries = void 0;
    try {
      rawEntries = (await this.fileService.resolve(historyEntriesFolder, { resolveMetadata: true })).children;
    } catch (error) {
      if (!this.isFileNotFound(error)) {
        this.traceError(error);
      }
    }
    if (!rawEntries) {
      return void 0;
    }
    return rawEntries.filter(
      (entry) => !isEqual(entry.resource, this.historyEntriesListingFile) && // not the listings file
      historyEntriesNameMatcher.test(entry.name)
      // matching our expected file pattern for entries
    );
  }
  isFileNotFound(error) {
    return error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND;
  }
  traceError(error) {
    this.logService.trace("[Working Copy History Service]", error);
  }
};
_WorkingCopyHistoryModel.ENTRIES_FILE = "entries.json";
_WorkingCopyHistoryModel.FILE_SAVED_SOURCE = SaveSourceRegistry.registerSource("default.source", localize("default.source", "File Saved"));
_WorkingCopyHistoryModel.SETTINGS = {
  MAX_ENTRIES: "workbench.localHistory.maxFileEntries",
  MERGE_PERIOD: "workbench.localHistory.mergeWindow"
};
let WorkingCopyHistoryModel = _WorkingCopyHistoryModel;
let WorkingCopyHistoryService = class extends Disposable {
  constructor(fileService, remoteAgentService, environmentService, uriIdentityService, labelService, logService, configurationService) {
    super();
    this.fileService = fileService;
    this.remoteAgentService = remoteAgentService;
    this.environmentService = environmentService;
    this.uriIdentityService = uriIdentityService;
    this.labelService = labelService;
    this.logService = logService;
    this.configurationService = configurationService;
    this._onDidAddEntry = this._register(new Emitter());
    this.onDidAddEntry = this._onDidAddEntry.event;
    this._onDidChangeEntry = this._register(new Emitter());
    this.onDidChangeEntry = this._onDidChangeEntry.event;
    this._onDidReplaceEntry = this._register(new Emitter());
    this.onDidReplaceEntry = this._onDidReplaceEntry.event;
    this._onDidMoveEntries = this._register(new Emitter());
    this.onDidMoveEntries = this._onDidMoveEntries.event;
    this._onDidRemoveEntry = this._register(new Emitter());
    this.onDidRemoveEntry = this._onDidRemoveEntry.event;
    this._onDidRemoveEntries = this._register(new Emitter());
    this.onDidRemoveEntries = this._onDidRemoveEntries.event;
    this.localHistoryHome = new DeferredPromise();
    this.models = new ResourceMap((resource) => this.uriIdentityService.extUri.getComparisonKey(resource));
    this.resolveLocalHistoryHome();
  }
  async resolveLocalHistoryHome() {
    let historyHome = void 0;
    try {
      const remoteEnv = await this.remoteAgentService.getEnvironment();
      if (remoteEnv) {
        historyHome = remoteEnv.localHistoryHome;
      }
    } catch (error) {
      this.logService.trace(error);
    }
    if (!historyHome) {
      historyHome = this.environmentService.localHistoryHome;
    }
    this.localHistoryHome.complete(historyHome);
  }
  async moveEntries(source, target) {
    const limiter = new Limiter(MAX_PARALLEL_HISTORY_IO_OPS);
    const promises = [];
    for (const [resource, model] of this.models) {
      if (!this.uriIdentityService.extUri.isEqualOrParent(resource, source)) {
        continue;
      }
      let targetResource;
      if (this.uriIdentityService.extUri.isEqual(source, resource)) {
        targetResource = target;
      } else {
        const index = indexOfPath(resource.path, source.path);
        targetResource = joinPath(target, resource.path.substr(index + source.path.length + 1));
      }
      let saveSource;
      if (this.uriIdentityService.extUri.isEqual(dirname(resource), dirname(targetResource))) {
        saveSource = WorkingCopyHistoryService.FILE_RENAMED_SOURCE;
      } else {
        saveSource = WorkingCopyHistoryService.FILE_MOVED_SOURCE;
      }
      promises.push(limiter.queue(() => this.doMoveEntries(model, saveSource, resource, targetResource)));
    }
    if (!promises.length) {
      return [];
    }
    const resources = await Promise.all(promises);
    this._onDidMoveEntries.fire();
    return resources;
  }
  async doMoveEntries(source, saveSource, sourceWorkingCopyResource, targetWorkingCopyResource) {
    const target = await this.getModel(targetWorkingCopyResource);
    await source.moveEntries(target, saveSource, CancellationToken.None);
    this.models.delete(sourceWorkingCopyResource);
    this.models.set(targetWorkingCopyResource, source);
    return targetWorkingCopyResource;
  }
  async addEntry({ resource, source, timestamp }, token) {
    if (!this.fileService.hasProvider(resource)) {
      return void 0;
    }
    const model = await this.getModel(resource);
    if (token.isCancellationRequested) {
      return void 0;
    }
    return model.addEntry(source, void 0, timestamp, token);
  }
  async updateEntry(entry, properties, token) {
    const model = await this.getModel(entry.workingCopy.resource);
    if (token.isCancellationRequested) {
      return;
    }
    return model.updateEntry(entry, properties, token);
  }
  async removeEntry(entry, token) {
    const model = await this.getModel(entry.workingCopy.resource);
    if (token.isCancellationRequested) {
      return false;
    }
    return model.removeEntry(entry, token);
  }
  async removeAll(token) {
    const historyHome = await this.localHistoryHome.p;
    if (token.isCancellationRequested) {
      return;
    }
    this.models.clear();
    await this.fileService.del(historyHome, { recursive: true });
    this._onDidRemoveEntries.fire();
  }
  async getEntries(resource, token) {
    const model = await this.getModel(resource);
    if (token.isCancellationRequested) {
      return [];
    }
    const entries = await model.getEntries();
    return entries ?? [];
  }
  async getAll(token) {
    const historyHome = await this.localHistoryHome.p;
    if (token.isCancellationRequested) {
      return [];
    }
    const all = new ResourceMap();
    for (const [resource, model] of this.models) {
      const hasInMemoryEntries = await model.hasEntries(
        true
        /* skip resolving because we resolve below from disk */
      );
      if (hasInMemoryEntries) {
        all.set(resource, true);
      }
    }
    try {
      const resolvedHistoryHome = await this.fileService.resolve(historyHome);
      if (resolvedHistoryHome.children) {
        const limiter = new Limiter(MAX_PARALLEL_HISTORY_IO_OPS);
        const promises = [];
        for (const child of resolvedHistoryHome.children) {
          promises.push(limiter.queue(async () => {
            if (token.isCancellationRequested) {
              return;
            }
            try {
              const serializedModel = JSON.parse((await this.fileService.readFile(joinPath(child.resource, WorkingCopyHistoryModel.ENTRIES_FILE))).value.toString());
              if (serializedModel.entries.length > 0) {
                all.set(URI.parse(serializedModel.resource), true);
              }
            } catch (error) {
            }
          }));
        }
        await Promise.all(promises);
      }
    } catch (error) {
    }
    return Array.from(all.keys());
  }
  async getModel(resource) {
    const historyHome = await this.localHistoryHome.p;
    let model = this.models.get(resource);
    if (!model) {
      model = new WorkingCopyHistoryModel(resource, historyHome, this._onDidAddEntry, this._onDidChangeEntry, this._onDidReplaceEntry, this._onDidRemoveEntry, this.getModelOptions(), this.fileService, this.labelService, this.logService, this.configurationService);
      this.models.set(resource, model);
    }
    return model;
  }
};
WorkingCopyHistoryService.FILE_MOVED_SOURCE = SaveSourceRegistry.registerSource("moved.source", localize("moved.source", "File Moved"));
WorkingCopyHistoryService.FILE_RENAMED_SOURCE = SaveSourceRegistry.registerSource("renamed.source", localize("renamed.source", "File Renamed"));
WorkingCopyHistoryService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IRemoteAgentService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IConfigurationService)
], WorkingCopyHistoryService);
let NativeWorkingCopyHistoryService = class extends WorkingCopyHistoryService {
  constructor(fileService, remoteAgentService, environmentService, uriIdentityService, labelService, lifecycleService, logService, configurationService) {
    super(fileService, remoteAgentService, environmentService, uriIdentityService, labelService, logService, configurationService);
    this.lifecycleService = lifecycleService;
    // 5min
    this.isRemotelyStored = typeof this.environmentService.remoteAuthority === "string";
    this.storeAllCts = this._register(new CancellationTokenSource());
    this.storeAllScheduler = this._register(new RunOnceScheduler(() => this.storeAll(this.storeAllCts.token), NativeWorkingCopyHistoryService.STORE_ALL_INTERVAL));
    this.registerListeners();
  }
  registerListeners() {
    if (!this.isRemotelyStored) {
      this._register(this.lifecycleService.onWillShutdown((e) => this.onWillShutdown(e)));
      this._register(Event.any(this.onDidAddEntry, this.onDidChangeEntry, this.onDidReplaceEntry, this.onDidRemoveEntry)(() => this.onDidChangeModels()));
    }
  }
  getModelOptions() {
    return {
      flushOnChange: this.isRemotelyStored
      /* because the connection might drop anytime */
    };
  }
  onWillShutdown(e) {
    this.storeAllScheduler.dispose();
    this.storeAllCts.dispose(true);
    e.join(this.storeAll(e.token), { id: "join.workingCopyHistory", label: localize("join.workingCopyHistory", "Saving local history") });
  }
  onDidChangeModels() {
    if (!this.storeAllScheduler.isScheduled()) {
      this.storeAllScheduler.schedule();
    }
  }
  async storeAll(token) {
    const limiter = new Limiter(MAX_PARALLEL_HISTORY_IO_OPS);
    const promises = [];
    const models = Array.from(this.models.values());
    for (const model of models) {
      promises.push(limiter.queue(async () => {
        if (token.isCancellationRequested) {
          return;
        }
        try {
          await model.store(token);
        } catch (error) {
          this.logService.trace(error);
        }
      }));
    }
    await Promise.all(promises);
  }
};
NativeWorkingCopyHistoryService.STORE_ALL_INTERVAL = 5 * 60 * 1e3;
NativeWorkingCopyHistoryService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IRemoteAgentService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, ILifecycleService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IConfigurationService)
], NativeWorkingCopyHistoryService);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkingCopyHistoryTracker, LifecyclePhase.Restored);
export {
  NativeWorkingCopyHistoryService,
  WorkingCopyHistoryModel,
  WorkingCopyHistoryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlIaXN0b3J5U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UsIFdpbGxTaHV0ZG93bkV2ZW50IH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgV29ya2luZ0NvcHlIaXN0b3J5VHJhY2tlciB9IGZyb20gJy4vd29ya2luZ0NvcHlIaXN0b3J5VHJhY2tlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSwgSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5RGVzY3JpcHRvciwgSVdvcmtpbmdDb3B5SGlzdG9yeUV2ZW50LCBJV29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSwgTUFYX1BBUkFMTEVMX0hJU1RPUllfSU9fT1BTIH0gZnJvbSAnLi93b3JraW5nQ29weUhpc3RvcnkuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UsIElGaWxlU3RhdFdpdGhNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgTGltaXRlciwgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGV4dG5hbWUsIGlzRXF1YWwsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IGluZGV4T2ZQYXRoLCByYW5kb21QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXh0cGF0aC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgU2F2ZVNvdXJjZSwgU2F2ZVNvdXJjZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcblxuaW50ZXJmYWNlIElTZXJpYWxpemVkV29ya2luZ0NvcHlIaXN0b3J5TW9kZWwge1xuXHRyZWFkb25seSB2ZXJzaW9uOiBudW1iZXI7XG5cdHJlYWRvbmx5IHJlc291cmNlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGVudHJpZXM6IElTZXJpYWxpemVkV29ya2luZ0NvcHlIaXN0b3J5TW9kZWxFbnRyeVtdO1xufVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRXb3JraW5nQ29weUhpc3RvcnlNb2RlbEVudHJ5IHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdGltZXN0YW1wOiBudW1iZXI7XG5cdHJlYWRvbmx5IHNvdXJjZT86IFNhdmVTb3VyY2U7XG5cdHJlYWRvbmx5IHNvdXJjZURlc2NyaXB0aW9uPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JraW5nQ29weUhpc3RvcnlNb2RlbE9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRvIGZsdXNoIHdoZW4gdGhlIG1vZGVsIGNoYW5nZXMuIElmIG5vdFxuXHQgKiBjb25maWd1cmVkLCBgbW9kZWwuc3RvcmUoKWAgaGFzIHRvIGJlIGNhbGxlZFxuXHQgKiBleHBsaWNpdGx5LlxuXHQgKi9cblx0Zmx1c2hPbkNoYW5nZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgRU5UUklFU19GSUxFID0gJ2VudHJpZXMuanNvbic7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRklMRV9TQVZFRF9TT1VSQ0UgPSBTYXZlU291cmNlUmVnaXN0cnkucmVnaXN0ZXJTb3VyY2UoJ2RlZmF1bHQuc291cmNlJywgbG9jYWxpemUoJ2RlZmF1bHQuc291cmNlJywgXCJGaWxlIFNhdmVkXCIpKTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRVRUSU5HUyA9IHtcblx0XHRNQVhfRU5UUklFUzogJ3dvcmtiZW5jaC5sb2NhbEhpc3RvcnkubWF4RmlsZUVudHJpZXMnLFxuXHRcdE1FUkdFX1BFUklPRDogJ3dvcmtiZW5jaC5sb2NhbEhpc3RvcnkubWVyZ2VXaW5kb3cnXG5cdH07XG5cblx0cHJpdmF0ZSBlbnRyaWVzOiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnlbXSA9IFtdO1xuXG5cdHByaXZhdGUgd2hlblJlc29sdmVkOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgd29ya2luZ0NvcHlSZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIHdvcmtpbmdDb3B5TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgaGlzdG9yeUVudHJpZXNGb2xkZXI6IFVSSSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBoaXN0b3J5RW50cmllc0xpc3RpbmdGaWxlOiBVUkkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBoaXN0b3J5RW50cmllc05hbWVNYXRjaGVyOiBSZWdFeHAgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSB2ZXJzaW9uSWQgPSAwO1xuXHRwcml2YXRlIHN0b3JlZFZlcnNpb25JZCA9IHRoaXMudmVyc2lvbklkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RvcmVMaW1pdGVyID0gbmV3IExpbWl0ZXIoMSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0d29ya2luZ0NvcHlSZXNvdXJjZTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaGlzdG9yeUhvbWU6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVudHJ5QWRkZWRFbWl0dGVyOiBFbWl0dGVyPElXb3JraW5nQ29weUhpc3RvcnlFdmVudD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlbnRyeUNoYW5nZWRFbWl0dGVyOiBFbWl0dGVyPElXb3JraW5nQ29weUhpc3RvcnlFdmVudD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlbnRyeVJlcGxhY2VkRW1pdHRlcjogRW1pdHRlcjxJV29ya2luZ0NvcHlIaXN0b3J5RXZlbnQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZW50cnlSZW1vdmVkRW1pdHRlcjogRW1pdHRlcjxJV29ya2luZ0NvcHlIaXN0b3J5RXZlbnQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogSVdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5zZXRXb3JraW5nQ29weSh3b3JraW5nQ29weVJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0V29ya2luZ0NvcHkod29ya2luZ0NvcHlSZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cblx0XHQvLyBVcGRhdGUgd29ya2luZyBjb3B5XG5cdFx0dGhpcy53b3JraW5nQ29weVJlc291cmNlID0gd29ya2luZ0NvcHlSZXNvdXJjZTtcblx0XHR0aGlzLndvcmtpbmdDb3B5TmFtZSA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUJhc2VuYW1lTGFiZWwod29ya2luZ0NvcHlSZXNvdXJjZSk7XG5cblx0XHR0aGlzLmhpc3RvcnlFbnRyaWVzTmFtZU1hdGNoZXIgPSBuZXcgUmVnRXhwKGBbQS1aYS16MC05XXs0fSR7ZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhleHRuYW1lKHdvcmtpbmdDb3B5UmVzb3VyY2UpKX1gKTtcblxuXHRcdC8vIFVwZGF0ZSBsb2NhdGlvbnNcblx0XHR0aGlzLmhpc3RvcnlFbnRyaWVzRm9sZGVyID0gdGhpcy50b0hpc3RvcnlFbnRyaWVzRm9sZGVyKHRoaXMuaGlzdG9yeUhvbWUsIHdvcmtpbmdDb3B5UmVzb3VyY2UpO1xuXHRcdHRoaXMuaGlzdG9yeUVudHJpZXNMaXN0aW5nRmlsZSA9IGpvaW5QYXRoKHRoaXMuaGlzdG9yeUVudHJpZXNGb2xkZXIsIFdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsLkVOVFJJRVNfRklMRSk7XG5cblx0XHQvLyBSZXNldCBlbnRyaWVzIGFuZCByZXNvbHZlZCBjYWNoZVxuXHRcdHRoaXMuZW50cmllcyA9IFtdO1xuXHRcdHRoaXMud2hlblJlc29sdmVkID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0hpc3RvcnlFbnRyaWVzRm9sZGVyKGhpc3RvcnlIb21lOiBVUkksIHdvcmtpbmdDb3B5UmVzb3VyY2U6IFVSSSk6IFVSSSB7XG5cdFx0cmV0dXJuIGpvaW5QYXRoKGhpc3RvcnlIb21lLCBoYXNoKHdvcmtpbmdDb3B5UmVzb3VyY2UudG9TdHJpbmcoKSkudG9TdHJpbmcoMTYpKTtcblx0fVxuXG5cdGFzeW5jIGFkZEVudHJ5KHNvdXJjZSA9IFdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsLkZJTEVfU0FWRURfU09VUkNFLCBzb3VyY2VEZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLCB0aW1lc3RhbXAgPSBEYXRlLm5vdygpLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElXb3JraW5nQ29weUhpc3RvcnlFbnRyeT4ge1xuXHRcdGxldCBlbnRyeVRvUmVwbGFjZTogSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gRmlndXJlIG91dCBpZiB0aGUgbGFzdCBlbnRyeSBzaG91bGQgYmUgcmVwbGFjZWQgYmFzZWRcblx0XHQvLyBvbiBzZXR0aW5ncyB0aGF0IGNhbiBkZWZpbmUgYSBpbnRlcnZhbCBmb3Igd2hlbiBhblxuXHRcdC8vIGVudHJ5IGlzIG5vdCBhZGRlZCBhcyBuZXcgZW50cnkgYnV0IHNob3VsZCByZXBsYWNlLlxuXHRcdC8vIEhvd2V2ZXIsIHdoZW4gc2F2ZSBzb3VyY2UgaXMgZGlmZmVyZW50LCBuZXZlciByZXBsYWNlLlxuXHRcdGNvbnN0IGxhc3RFbnRyeSA9IHRoaXMuZW50cmllcy5hdCgtMSk7XG5cdFx0aWYgKGxhc3RFbnRyeSAmJiBsYXN0RW50cnkuc291cmNlID09PSBzb3VyY2UpIHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRSZXBsYWNlSW50ZXJ2YWwgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oV29ya2luZ0NvcHlIaXN0b3J5TW9kZWwuU0VUVElOR1MuTUVSR0VfUEVSSU9ELCB7IHJlc291cmNlOiB0aGlzLndvcmtpbmdDb3B5UmVzb3VyY2UgfSk7XG5cdFx0XHRpZiAodGltZXN0YW1wIC0gbGFzdEVudHJ5LnRpbWVzdGFtcCA8PSAoY29uZmlndXJlZFJlcGxhY2VJbnRlcnZhbCAqIDEwMDAgLyogY29udmVydCB0byBtaWxsaWVzICovKSkge1xuXHRcdFx0XHRlbnRyeVRvUmVwbGFjZSA9IGxhc3RFbnRyeTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgZW50cnk6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeTtcblxuXHRcdC8vIFJlcGxhY2UgbGFzdGVzdCBlbnRyeSBpbiBoaXN0b3J5XG5cdFx0aWYgKGVudHJ5VG9SZXBsYWNlKSB7XG5cdFx0XHRlbnRyeSA9IGF3YWl0IHRoaXMuZG9SZXBsYWNlRW50cnkoZW50cnlUb1JlcGxhY2UsIHNvdXJjZSwgc291cmNlRGVzY3JpcHRpb24sIHRpbWVzdGFtcCwgdG9rZW4pO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBlbnRyeSB0byBoaXN0b3J5XG5cdFx0ZWxzZSB7XG5cdFx0XHRlbnRyeSA9IGF3YWl0IHRoaXMuZG9BZGRFbnRyeShzb3VyY2UsIHNvdXJjZURlc2NyaXB0aW9uLCB0aW1lc3RhbXAsIHRva2VuKTtcblx0XHR9XG5cblx0XHQvLyBGbHVzaCBub3cgaWYgY29uZmlndXJlZFxuXHRcdGlmICh0aGlzLm9wdGlvbnMuZmx1c2hPbkNoYW5nZSAmJiAhdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuc3RvcmUodG9rZW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbnRyeTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9BZGRFbnRyeShzb3VyY2U6IFNhdmVTb3VyY2UsIHNvdXJjZURlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsIHRpbWVzdGFtcDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElXb3JraW5nQ29weUhpc3RvcnlFbnRyeT4ge1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5UmVzb3VyY2UgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLndvcmtpbmdDb3B5UmVzb3VyY2UpO1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5TmFtZSA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMud29ya2luZ0NvcHlOYW1lKTtcblx0XHRjb25zdCBoaXN0b3J5RW50cmllc0ZvbGRlciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuaGlzdG9yeUVudHJpZXNGb2xkZXIpO1xuXG5cdFx0Ly8gUGVyZm9ybSBhIGZhc3QgY2xvbmUgb3BlcmF0aW9uIHdpdGggbWluaW1hbCBvdmVyaGVhZCB0byBhIG5ldyByYW5kb20gbG9jYXRpb25cblx0XHRjb25zdCBpZCA9IGAke3JhbmRvbVBhdGgodW5kZWZpbmVkLCB1bmRlZmluZWQsIDQpfSR7ZXh0bmFtZSh3b3JraW5nQ29weVJlc291cmNlKX1gO1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gam9pblBhdGgoaGlzdG9yeUVudHJpZXNGb2xkZXIsIGlkKTtcblx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNsb25lRmlsZSh3b3JraW5nQ29weVJlc291cmNlLCBsb2NhdGlvbik7XG5cblx0XHQvLyBBZGQgdG8gbGlzdCBvZiBlbnRyaWVzXG5cdFx0Y29uc3QgZW50cnk6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSA9IHtcblx0XHRcdGlkLFxuXHRcdFx0d29ya2luZ0NvcHk6IHsgcmVzb3VyY2U6IHdvcmtpbmdDb3B5UmVzb3VyY2UsIG5hbWU6IHdvcmtpbmdDb3B5TmFtZSB9LFxuXHRcdFx0bG9jYXRpb24sXG5cdFx0XHR0aW1lc3RhbXAsXG5cdFx0XHRzb3VyY2UsXG5cdFx0XHRzb3VyY2VEZXNjcmlwdGlvblxuXHRcdH07XG5cdFx0dGhpcy5lbnRyaWVzLnB1c2goZW50cnkpO1xuXG5cdFx0Ly8gVXBkYXRlIHZlcnNpb24gSUQgb2YgbW9kZWwgdG8gdXNlIGZvciBzdG9yaW5nIGxhdGVyXG5cdFx0dGhpcy52ZXJzaW9uSWQrKztcblxuXHRcdC8vIEV2ZW50c1xuXHRcdHRoaXMuZW50cnlBZGRlZEVtaXR0ZXIuZmlyZSh7IGVudHJ5IH0pO1xuXG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1JlcGxhY2VFbnRyeShlbnRyeTogSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5LCBzb3VyY2U6IFNhdmVTb3VyY2UsIHNvdXJjZURlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsIHRpbWVzdGFtcDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElXb3JraW5nQ29weUhpc3RvcnlFbnRyeT4ge1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5UmVzb3VyY2UgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLndvcmtpbmdDb3B5UmVzb3VyY2UpO1xuXG5cdFx0Ly8gUGVyZm9ybSBhIGZhc3QgY2xvbmUgb3BlcmF0aW9uIHdpdGggbWluaW1hbCBvdmVyaGVhZCB0byB0aGUgZXhpc3RpbmcgbG9jYXRpb25cblx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNsb25lRmlsZSh3b3JraW5nQ29weVJlc291cmNlLCBlbnRyeS5sb2NhdGlvbik7XG5cblx0XHQvLyBVcGRhdGUgZW50cnlcblx0XHRlbnRyeS5zb3VyY2UgPSBzb3VyY2U7XG5cdFx0ZW50cnkuc291cmNlRGVzY3JpcHRpb24gPSBzb3VyY2VEZXNjcmlwdGlvbjtcblx0XHRlbnRyeS50aW1lc3RhbXAgPSB0aW1lc3RhbXA7XG5cblx0XHQvLyBVcGRhdGUgdmVyc2lvbiBJRCBvZiBtb2RlbCB0byB1c2UgZm9yIHN0b3JpbmcgbGF0ZXJcblx0XHR0aGlzLnZlcnNpb25JZCsrO1xuXG5cdFx0Ly8gRXZlbnRzXG5cdFx0dGhpcy5lbnRyeVJlcGxhY2VkRW1pdHRlci5maXJlKHsgZW50cnkgfSk7XG5cblx0XHRyZXR1cm4gZW50cnk7XG5cdH1cblxuXHRhc3luYyByZW1vdmVFbnRyeShlbnRyeTogSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdC8vIE1ha2Ugc3VyZSB0byBhd2FpdCByZXNvbHZpbmcgd2hlbiByZW1vdmluZyBlbnRyaWVzXG5cdFx0YXdhaXQgdGhpcy5yZXNvbHZlRW50cmllc09uY2UoKTtcblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5lbnRyaWVzLmluZGV4T2YoZW50cnkpO1xuXHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBEZWxldGUgZnJvbSBkaXNrXG5cdFx0YXdhaXQgdGhpcy5kZWxldGVFbnRyeShlbnRyeSk7XG5cblx0XHQvLyBSZW1vdmUgZnJvbSBtb2RlbFxuXHRcdHRoaXMuZW50cmllcy5zcGxpY2UoaW5kZXgsIDEpO1xuXG5cdFx0Ly8gVXBkYXRlIHZlcnNpb24gSUQgb2YgbW9kZWwgdG8gdXNlIGZvciBzdG9yaW5nIGxhdGVyXG5cdFx0dGhpcy52ZXJzaW9uSWQrKztcblxuXHRcdC8vIEV2ZW50c1xuXHRcdHRoaXMuZW50cnlSZW1vdmVkRW1pdHRlci5maXJlKHsgZW50cnkgfSk7XG5cblx0XHQvLyBGbHVzaCBub3cgaWYgY29uZmlndXJlZFxuXHRcdGlmICh0aGlzLm9wdGlvbnMuZmx1c2hPbkNoYW5nZSAmJiAhdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuc3RvcmUodG9rZW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlRW50cnkoZW50cnk6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSwgcHJvcGVydGllczogeyBzb3VyY2U6IFNhdmVTb3VyY2UgfSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gYXdhaXQgcmVzb2x2aW5nIHdoZW4gdXBkYXRpbmcgZW50cmllc1xuXHRcdGF3YWl0IHRoaXMucmVzb2x2ZUVudHJpZXNPbmNlKCk7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbmRleCA9IHRoaXMuZW50cmllcy5pbmRleE9mKGVudHJ5KTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGVudHJ5XG5cdFx0ZW50cnkuc291cmNlID0gcHJvcGVydGllcy5zb3VyY2U7XG5cblx0XHQvLyBVcGRhdGUgdmVyc2lvbiBJRCBvZiBtb2RlbCB0byB1c2UgZm9yIHN0b3JpbmcgbGF0ZXJcblx0XHR0aGlzLnZlcnNpb25JZCsrO1xuXG5cdFx0Ly8gRXZlbnRzXG5cdFx0dGhpcy5lbnRyeUNoYW5nZWRFbWl0dGVyLmZpcmUoeyBlbnRyeSB9KTtcblxuXHRcdC8vIEZsdXNoIG5vdyBpZiBjb25maWd1cmVkXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5mbHVzaE9uQ2hhbmdlICYmICF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5zdG9yZSh0b2tlbik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0RW50cmllcygpOiBQcm9taXNlPHJlYWRvbmx5IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeVtdPiB7XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gYXdhaXQgcmVzb2x2aW5nIHdoZW4gYWxsIGVudHJpZXMgYXJlIGFza2VkIGZvclxuXHRcdGF3YWl0IHRoaXMucmVzb2x2ZUVudHJpZXNPbmNlKCk7XG5cblx0XHQvLyBSZXR1cm4gYXMgbWFueSBlbnRyaWVzIGFzIGNvbmZpZ3VyZWQgYnkgdXNlciBzZXR0aW5nc1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRNYXhFbnRyaWVzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KFdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsLlNFVFRJTkdTLk1BWF9FTlRSSUVTLCB7IHJlc291cmNlOiB0aGlzLndvcmtpbmdDb3B5UmVzb3VyY2UgfSk7XG5cdFx0aWYgKHRoaXMuZW50cmllcy5sZW5ndGggPiBjb25maWd1cmVkTWF4RW50cmllcykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZW50cmllcy5zbGljZSh0aGlzLmVudHJpZXMubGVuZ3RoIC0gY29uZmlndXJlZE1heEVudHJpZXMpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmVudHJpZXM7XG5cdH1cblxuXHRhc3luYyBoYXNFbnRyaWVzKHNraXBSZXNvbHZlOiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gYXdhaXQgcmVzb2x2aW5nIHVubGVzcyBleHBsaWNpdGx5IHNraXBwZWRcblx0XHRpZiAoIXNraXBSZXNvbHZlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJlc29sdmVFbnRyaWVzT25jZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmVudHJpZXMubGVuZ3RoID4gMDtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZUVudHJpZXNPbmNlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy53aGVuUmVzb2x2ZWQpIHtcblx0XHRcdHRoaXMud2hlblJlc29sdmVkID0gdGhpcy5kb1Jlc29sdmVFbnRyaWVzKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMud2hlblJlc29sdmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1Jlc29sdmVFbnRyaWVzKCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gUmVzb2x2ZSBmcm9tIGRpc2tcblx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgdGhpcy5yZXNvbHZlRW50cmllc0Zyb21EaXNrKCk7XG5cblx0XHQvLyBXZSBub3cgbmVlZCB0byBtZXJnZSBvdXIgaW4tbWVtb3J5IGVudHJpZXMgd2l0aCB0aGVcblx0XHQvLyBlbnRyaWVzIHdlIGhhdmUgZm91bmQgb24gZGlzayBiZWNhdXNlIGl0IGlzIHBvc3NpYmxlXG5cdFx0Ly8gdGhhdCBuZXcgZW50cmllcyBoYXZlIGJlZW4gYWRkZWQgYmVmb3JlIHRoZSBlbnRyaWVzXG5cdFx0Ly8gbGlzdGluZyBmaWxlIHdhcyB1cGRhdGVkXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLmVudHJpZXMpIHtcblx0XHRcdGVudHJpZXMuc2V0KGVudHJ5LmlkLCBlbnRyeSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IGFzIGVudHJpZXMsIHNvcnRlZCBieSB0aW1lc3RhbXBcblx0XHR0aGlzLmVudHJpZXMgPSBBcnJheS5mcm9tKGVudHJpZXMudmFsdWVzKCkpLnNvcnQoKGVudHJ5QSwgZW50cnlCKSA9PiBlbnRyeUEudGltZXN0YW1wIC0gZW50cnlCLnRpbWVzdGFtcCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVFbnRyaWVzRnJvbURpc2soKTogUHJvbWlzZTxNYXA8c3RyaW5nIC8qIElEICovLCBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnk+PiB7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlSZXNvdXJjZSA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMud29ya2luZ0NvcHlSZXNvdXJjZSk7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlOYW1lID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy53b3JraW5nQ29weU5hbWUpO1xuXG5cdFx0Y29uc3QgW2VudHJ5TGlzdGluZywgZW50cnlTdGF0c10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cblx0XHRcdC8vIFJlc29sdmUgZW50cmllcyBsaXN0aW5nIGZpbGVcblx0XHRcdHRoaXMucmVhZEVudHJpZXNGaWxlKCksXG5cblx0XHRcdC8vIFJlc29sdmUgY2hpbGRyZW4gb2YgaGlzdG9yeSBmb2xkZXJcblx0XHRcdHRoaXMucmVhZEVudHJpZXNGb2xkZXIoKVxuXHRcdF0pO1xuXG5cdFx0Ly8gQWRkIGZyb20gcmF3IGZvbGRlciBjaGlsZHJlblxuXHRcdGNvbnN0IGVudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5PigpO1xuXHRcdGlmIChlbnRyeVN0YXRzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5U3RhdCBvZiBlbnRyeVN0YXRzKSB7XG5cdFx0XHRcdGVudHJpZXMuc2V0KGVudHJ5U3RhdC5uYW1lLCB7XG5cdFx0XHRcdFx0aWQ6IGVudHJ5U3RhdC5uYW1lLFxuXHRcdFx0XHRcdHdvcmtpbmdDb3B5OiB7IHJlc291cmNlOiB3b3JraW5nQ29weVJlc291cmNlLCBuYW1lOiB3b3JraW5nQ29weU5hbWUgfSxcblx0XHRcdFx0XHRsb2NhdGlvbjogZW50cnlTdGF0LnJlc291cmNlLFxuXHRcdFx0XHRcdHRpbWVzdGFtcDogZW50cnlTdGF0Lm10aW1lLFxuXHRcdFx0XHRcdHNvdXJjZTogV29ya2luZ0NvcHlIaXN0b3J5TW9kZWwuRklMRV9TQVZFRF9TT1VSQ0UsXG5cdFx0XHRcdFx0c291cmNlRGVzY3JpcHRpb246IHVuZGVmaW5lZFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgZnJvbSBsaXN0aW5nICh0byBoYXZlIG1vcmUgc3BlY2lmaWMgbWV0YWRhdGEpXG5cdFx0aWYgKGVudHJ5TGlzdGluZykge1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyeUxpc3RpbmcuZW50cmllcykge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZ0VudHJ5ID0gZW50cmllcy5nZXQoZW50cnkuaWQpO1xuXHRcdFx0XHRpZiAoZXhpc3RpbmdFbnRyeSkge1xuXHRcdFx0XHRcdGVudHJpZXMuc2V0KGVudHJ5LmlkLCB7XG5cdFx0XHRcdFx0XHQuLi5leGlzdGluZ0VudHJ5LFxuXHRcdFx0XHRcdFx0dGltZXN0YW1wOiBlbnRyeS50aW1lc3RhbXAsXG5cdFx0XHRcdFx0XHRzb3VyY2U6IGVudHJ5LnNvdXJjZSA/PyBleGlzdGluZ0VudHJ5LnNvdXJjZSxcblx0XHRcdFx0XHRcdHNvdXJjZURlc2NyaXB0aW9uOiBlbnRyeS5zb3VyY2VEZXNjcmlwdGlvbiA/PyBleGlzdGluZ0VudHJ5LnNvdXJjZURlc2NyaXB0aW9uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZW50cmllcztcblx0fVxuXG5cdGFzeW5jIG1vdmVFbnRyaWVzKHRhcmdldDogV29ya2luZ0NvcHlIaXN0b3J5TW9kZWwsIHNvdXJjZTogU2F2ZVNvdXJjZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGltZXN0YW1wID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCBzb3VyY2VEZXNjcmlwdGlvbiA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMud29ya2luZ0NvcHlSZXNvdXJjZSkpO1xuXG5cdFx0Ly8gTW92ZSBhbGwgZW50cmllcyBpbnRvIHRoZSB0YXJnZXQgZm9sZGVyIHNvIHRoYXQgd2UgcHJlc2VydmVcblx0XHQvLyBhbnkgZXhpc3RpbmcgaGlzdG9yeSBlbnRyaWVzIHRoYXQgbWlnaHQgYWxyZWFkeSBiZSBwcmVzZW50XG5cblx0XHRjb25zdCBzb3VyY2VIaXN0b3J5RW50cmllc0ZvbGRlciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuaGlzdG9yeUVudHJpZXNGb2xkZXIpO1xuXHRcdGNvbnN0IHRhcmdldEhpc3RvcnlFbnRyaWVzRm9sZGVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGFyZ2V0Lmhpc3RvcnlFbnRyaWVzRm9sZGVyKTtcblx0XHR0cnkge1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLmVudHJpZXMpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5tb3ZlKGVudHJ5LmxvY2F0aW9uLCBqb2luUGF0aCh0YXJnZXRIaXN0b3J5RW50cmllc0ZvbGRlciwgZW50cnkuaWQpLCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHNvdXJjZUhpc3RvcnlFbnRyaWVzRm9sZGVyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCF0aGlzLmlzRmlsZU5vdEZvdW5kKGVycm9yKSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIEluIGNhc2Ugb2YgYW4gZXJyb3IgKHVubGVzcyBub3QgZm91bmQpLCBmYWxsYmFjayB0byBtb3ZpbmcgdGhlIGVudGlyZSBmb2xkZXJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLm1vdmUoc291cmNlSGlzdG9yeUVudHJpZXNGb2xkZXIsIHRhcmdldEhpc3RvcnlFbnRyaWVzRm9sZGVyLCB0cnVlKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuaXNGaWxlTm90Rm91bmQoZXJyb3IpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRyYWNlRXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE1lcmdlIG91ciBlbnRyaWVzIHdpdGggdGFyZ2V0IGVudHJpZXMgYmVmb3JlIHVwZGF0aW5nIGFzc29jaWF0ZWQgd29ya2luZyBjb3B5XG5cdFx0Y29uc3QgYWxsRW50cmllcyA9IGRpc3RpbmN0KFsuLi50aGlzLmVudHJpZXMsIC4uLnRhcmdldC5lbnRyaWVzXSwgZW50cnkgPT4gZW50cnkuaWQpLnNvcnQoKGVudHJ5QSwgZW50cnlCKSA9PiBlbnRyeUEudGltZXN0YW1wIC0gZW50cnlCLnRpbWVzdGFtcCk7XG5cblx0XHQvLyBVcGRhdGUgb3VyIGFzc29jaWF0ZWQgd29ya2luZyBjb3B5XG5cdFx0Y29uc3QgdGFyZ2V0V29ya2luZ0NvcHlSZXNvdXJjZSA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRhcmdldC53b3JraW5nQ29weVJlc291cmNlKTtcblx0XHR0aGlzLnNldFdvcmtpbmdDb3B5KHRhcmdldFdvcmtpbmdDb3B5UmVzb3VyY2UpO1xuXG5cdFx0Ly8gUmVzdG9yZSBvdXIgZW50cmllcyBhbmQgZW5zdXJlIGNvcnJlY3QgbWV0YWRhdGFcblx0XHRjb25zdCB0YXJnZXRXb3JraW5nQ29weU5hbWUgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0YXJnZXQud29ya2luZ0NvcHlOYW1lKTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGFsbEVudHJpZXMpIHtcblx0XHRcdHRoaXMuZW50cmllcy5wdXNoKHtcblx0XHRcdFx0aWQ6IGVudHJ5LmlkLFxuXHRcdFx0XHRsb2NhdGlvbjogam9pblBhdGgodGFyZ2V0SGlzdG9yeUVudHJpZXNGb2xkZXIsIGVudHJ5LmlkKSxcblx0XHRcdFx0c291cmNlOiBlbnRyeS5zb3VyY2UsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0aW9uOiBlbnRyeS5zb3VyY2VEZXNjcmlwdGlvbixcblx0XHRcdFx0dGltZXN0YW1wOiBlbnRyeS50aW1lc3RhbXAsXG5cdFx0XHRcdHdvcmtpbmdDb3B5OiB7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHRhcmdldFdvcmtpbmdDb3B5UmVzb3VyY2UsXG5cdFx0XHRcdFx0bmFtZTogdGFyZ2V0V29ya2luZ0NvcHlOYW1lXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBlbnRyeSBmb3IgdGhlIG1vdmVcblx0XHRhd2FpdCB0aGlzLmFkZEVudHJ5KHNvdXJjZSwgc291cmNlRGVzY3JpcHRpb24sIHRpbWVzdGFtcCwgdG9rZW4pO1xuXG5cdFx0Ly8gU3RvcmUgbW9kZWwgYWdhaW4gdG8gdXBkYXRlZCBsb2NhdGlvblxuXHRcdGF3YWl0IHRoaXMuc3RvcmUodG9rZW4pO1xuXHR9XG5cblx0YXN5bmMgc3RvcmUodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnNob3VsZFN0b3JlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVc2UgYSBgTGltaXRlcmAgdG8gcHJldmVudCBtdWx0aXBsZSBgc3RvcmVgIG9wZXJhdGlvbnNcblx0XHQvLyBwb3RlbnRpYWxseSBydW5uaW5nIGF0IHRoZSBzYW1lIHRpbWVcblxuXHRcdGF3YWl0IHRoaXMuc3RvcmVMaW1pdGVyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCAhdGhpcy5zaG91bGRTdG9yZSgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMuZG9TdG9yZSh0b2tlbik7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFN0b3JlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0b3JlZFZlcnNpb25JZCAhPT0gdGhpcy52ZXJzaW9uSWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvU3RvcmUodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGlzdG9yeUVudHJpZXNGb2xkZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmhpc3RvcnlFbnRyaWVzRm9sZGVyKTtcblxuXHRcdC8vIE1ha2Ugc3VyZSB0byBhd2FpdCByZXNvbHZpbmcgd2hlbiBwZXJzaXN0aW5nXG5cdFx0YXdhaXQgdGhpcy5yZXNvbHZlRW50cmllc09uY2UoKTtcblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBDbGVhbnVwIGJhc2VkIG9uIG1heC1lbnRyaWVzIHNldHRpbmdcblx0XHRhd2FpdCB0aGlzLmNsZWFuVXBFbnRyaWVzKCk7XG5cblx0XHQvLyBXaXRob3V0IGVudHJpZXMsIHJlbW92ZSB0aGUgaGlzdG9yeSBmb2xkZXJcblx0XHRjb25zdCBzdG9yZWRWZXJzaW9uID0gdGhpcy52ZXJzaW9uSWQ7XG5cdFx0aWYgKHRoaXMuZW50cmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKGhpc3RvcnlFbnRyaWVzRm9sZGVyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMudHJhY2VFcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2Ugc3RpbGwgaGF2ZSBlbnRyaWVzLCB1cGRhdGUgdGhlIGVudHJpZXMgbWV0YSBmaWxlXG5cdFx0ZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLndyaXRlRW50cmllc0ZpbGUoKTtcblx0XHR9XG5cblx0XHQvLyBNYXJrIGFzIHN0b3JlZCB2ZXJzaW9uXG5cdFx0dGhpcy5zdG9yZWRWZXJzaW9uSWQgPSBzdG9yZWRWZXJzaW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjbGVhblVwRW50cmllcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmVkTWF4RW50cmllcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihXb3JraW5nQ29weUhpc3RvcnlNb2RlbC5TRVRUSU5HUy5NQVhfRU5UUklFUywgeyByZXNvdXJjZTogdGhpcy53b3JraW5nQ29weVJlc291cmNlIH0pO1xuXHRcdGlmICh0aGlzLmVudHJpZXMubGVuZ3RoIDw9IGNvbmZpZ3VyZWRNYXhFbnRyaWVzKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vdGhpbmcgdG8gY2xlYW51cFxuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJpZXNUb0RlbGV0ZSA9IHRoaXMuZW50cmllcy5zbGljZSgwLCB0aGlzLmVudHJpZXMubGVuZ3RoIC0gY29uZmlndXJlZE1heEVudHJpZXMpO1xuXHRcdGNvbnN0IGVudHJpZXNUb0tlZXAgPSB0aGlzLmVudHJpZXMuc2xpY2UodGhpcy5lbnRyaWVzLmxlbmd0aCAtIGNvbmZpZ3VyZWRNYXhFbnRyaWVzKTtcblxuXHRcdC8vIERlbGV0ZSBlbnRyaWVzIGZyb20gZGlzayBhcyBpbnN0cnVjdGVkXG5cdFx0Zm9yIChjb25zdCBlbnRyeVRvRGVsZXRlIG9mIGVudHJpZXNUb0RlbGV0ZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5kZWxldGVFbnRyeShlbnRyeVRvRGVsZXRlKTtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gdXBkYXRlIG91ciBpbi1tZW1vcnkgbW9kZWwgYXMgd2VsbFxuXHRcdC8vIGJlY2F1c2UgaXQgd2lsbCBiZSBwZXJzaXN0ZWQgcmlnaHQgYWZ0ZXJcblx0XHR0aGlzLmVudHJpZXMgPSBlbnRyaWVzVG9LZWVwO1xuXG5cdFx0Ly8gRXZlbnRzXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzVG9EZWxldGUpIHtcblx0XHRcdHRoaXMuZW50cnlSZW1vdmVkRW1pdHRlci5maXJlKHsgZW50cnkgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkZWxldGVFbnRyeShlbnRyeTogSVdvcmtpbmdDb3B5SGlzdG9yeUVudHJ5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKGVudHJ5LmxvY2F0aW9uKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy50cmFjZUVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdyaXRlRW50cmllc0ZpbGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlSZXNvdXJjZSA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMud29ya2luZ0NvcHlSZXNvdXJjZSk7XG5cdFx0Y29uc3QgaGlzdG9yeUVudHJpZXNMaXN0aW5nRmlsZSA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuaGlzdG9yeUVudHJpZXNMaXN0aW5nRmlsZSk7XG5cblx0XHRjb25zdCBzZXJpYWxpemVkTW9kZWw6IElTZXJpYWxpemVkV29ya2luZ0NvcHlIaXN0b3J5TW9kZWwgPSB7XG5cdFx0XHR2ZXJzaW9uOiAxLFxuXHRcdFx0cmVzb3VyY2U6IHdvcmtpbmdDb3B5UmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdGVudHJpZXM6IHRoaXMuZW50cmllcy5tYXAoZW50cnkgPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkOiBlbnRyeS5pZCxcblx0XHRcdFx0XHRzb3VyY2U6IGVudHJ5LnNvdXJjZSAhPT0gV29ya2luZ0NvcHlIaXN0b3J5TW9kZWwuRklMRV9TQVZFRF9TT1VSQ0UgPyBlbnRyeS5zb3VyY2UgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c291cmNlRGVzY3JpcHRpb246IGVudHJ5LnNvdXJjZURlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHRpbWVzdGFtcDogZW50cnkudGltZXN0YW1wXG5cdFx0XHRcdH07XG5cdFx0XHR9KVxuXHRcdH07XG5cblx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShoaXN0b3J5RW50cmllc0xpc3RpbmdGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHNlcmlhbGl6ZWRNb2RlbCkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVhZEVudHJpZXNGaWxlKCk6IFByb21pc2U8SVNlcmlhbGl6ZWRXb3JraW5nQ29weUhpc3RvcnlNb2RlbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGhpc3RvcnlFbnRyaWVzTGlzdGluZ0ZpbGUgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmhpc3RvcnlFbnRyaWVzTGlzdGluZ0ZpbGUpO1xuXG5cdFx0bGV0IHNlcmlhbGl6ZWRNb2RlbDogSVNlcmlhbGl6ZWRXb3JraW5nQ29weUhpc3RvcnlNb2RlbCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0c2VyaWFsaXplZE1vZGVsID0gSlNPTi5wYXJzZSgoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShoaXN0b3J5RW50cmllc0xpc3RpbmdGaWxlKSkudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICghdGhpcy5pc0ZpbGVOb3RGb3VuZChlcnJvcikpIHtcblx0XHRcdFx0dGhpcy50cmFjZUVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gc2VyaWFsaXplZE1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWFkRW50cmllc0ZvbGRlcigpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaGlzdG9yeUVudHJpZXNGb2xkZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmhpc3RvcnlFbnRyaWVzRm9sZGVyKTtcblx0XHRjb25zdCBoaXN0b3J5RW50cmllc05hbWVNYXRjaGVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5oaXN0b3J5RW50cmllc05hbWVNYXRjaGVyKTtcblxuXHRcdGxldCByYXdFbnRyaWVzOiBJRmlsZVN0YXRXaXRoTWV0YWRhdGFbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIFJlc29sdmUgY2hpbGRyZW4gb2YgZm9sZGVyIG9uIGRpc2tcblx0XHR0cnkge1xuXHRcdFx0cmF3RW50cmllcyA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUoaGlzdG9yeUVudHJpZXNGb2xkZXIsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pKS5jaGlsZHJlbjtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCF0aGlzLmlzRmlsZU5vdEZvdW5kKGVycm9yKSkge1xuXHRcdFx0XHR0aGlzLnRyYWNlRXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghcmF3RW50cmllcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBTa2lwIGVudHJpZXMgdGhhdCBkbyBub3Qgc2VlbSB0byBoYXZlIHZhbGlkIGZpbGUgbmFtZVxuXHRcdHJldHVybiByYXdFbnRyaWVzLmZpbHRlcihlbnRyeSA9PlxuXHRcdFx0IWlzRXF1YWwoZW50cnkucmVzb3VyY2UsIHRoaXMuaGlzdG9yeUVudHJpZXNMaXN0aW5nRmlsZSkgJiYgLy8gbm90IHRoZSBsaXN0aW5ncyBmaWxlXG5cdFx0XHRoaXN0b3J5RW50cmllc05hbWVNYXRjaGVyLnRlc3QoZW50cnkubmFtZSlcdFx0XHRcdFx0Ly8gbWF0Y2hpbmcgb3VyIGV4cGVjdGVkIGZpbGUgcGF0dGVybiBmb3IgZW50cmllc1xuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGlzRmlsZU5vdEZvdW5kKGVycm9yOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGVycm9yIGluc3RhbmNlb2YgRmlsZU9wZXJhdGlvbkVycm9yICYmIGVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQ7XG5cdH1cblxuXHRwcml2YXRlIHRyYWNlRXJyb3IoZXJyb3I6IEVycm9yKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbV29ya2luZyBDb3B5IEhpc3RvcnkgU2VydmljZV0nLCBlcnJvcik7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2Uge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEZJTEVfTU9WRURfU09VUkNFID0gU2F2ZVNvdXJjZVJlZ2lzdHJ5LnJlZ2lzdGVyU291cmNlKCdtb3ZlZC5zb3VyY2UnLCBsb2NhbGl6ZSgnbW92ZWQuc291cmNlJywgXCJGaWxlIE1vdmVkXCIpKTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRklMRV9SRU5BTUVEX1NPVVJDRSA9IFNhdmVTb3VyY2VSZWdpc3RyeS5yZWdpc3RlclNvdXJjZSgncmVuYW1lZC5zb3VyY2UnLCBsb2NhbGl6ZSgncmVuYW1lZC5zb3VyY2UnLCBcIkZpbGUgUmVuYW1lZFwiKSk7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZEFkZEVudHJ5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdvcmtpbmdDb3B5SGlzdG9yeUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRBZGRFbnRyeSA9IHRoaXMuX29uRGlkQWRkRW50cnkuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZUVudHJ5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdvcmtpbmdDb3B5SGlzdG9yeUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFbnRyeSA9IHRoaXMuX29uRGlkQ2hhbmdlRW50cnkuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZFJlcGxhY2VFbnRyeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElXb3JraW5nQ29weUhpc3RvcnlFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVwbGFjZUVudHJ5ID0gdGhpcy5fb25EaWRSZXBsYWNlRW50cnkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRNb3ZlRW50cmllcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZE1vdmVFbnRyaWVzID0gdGhpcy5fb25EaWRNb3ZlRW50cmllcy5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkUmVtb3ZlRW50cnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJV29ya2luZ0NvcHlIaXN0b3J5RXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbW92ZUVudHJ5ID0gdGhpcy5fb25EaWRSZW1vdmVFbnRyeS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZUVudHJpZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZW1vdmVFbnRyaWVzID0gdGhpcy5fb25EaWRSZW1vdmVFbnRyaWVzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbG9jYWxIaXN0b3J5SG9tZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8VVJJPigpO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBtb2RlbHMgPSBuZXcgUmVzb3VyY2VNYXA8V29ya2luZ0NvcHlIaXN0b3J5TW9kZWw+KHJlc291cmNlID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5nZXRDb21wYXJpc29uS2V5KHJlc291cmNlKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZXNvbHZlTG9jYWxIaXN0b3J5SG9tZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlTG9jYWxIaXN0b3J5SG9tZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgaGlzdG9yeUhvbWU6IFVSSSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIFByZWZlciBoaXN0b3J5IHRvIGJlIHN0b3JlZCBpbiB0aGUgcmVtb3RlIGlmIHdlIGFyZSBjb25uZWN0ZWQgdG8gYSByZW1vdGVcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVtb3RlRW52ID0gYXdhaXQgdGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKTtcblx0XHRcdGlmIChyZW1vdGVFbnYpIHtcblx0XHRcdFx0aGlzdG9yeUhvbWUgPSByZW1vdGVFbnYubG9jYWxIaXN0b3J5SG9tZTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGVycm9yKTsgLy8gaWdub3JlIGFuZCBmYWxsYmFjayB0byBsb2NhbFxuXHRcdH1cblxuXHRcdC8vIEJ1dCBmYWxsYmFjayB0byBsb2NhbCBpZiB0aGVyZSBpcyBubyByZW1vdGVcblx0XHRpZiAoIWhpc3RvcnlIb21lKSB7XG5cdFx0XHRoaXN0b3J5SG9tZSA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmxvY2FsSGlzdG9yeUhvbWU7XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2NhbEhpc3RvcnlIb21lLmNvbXBsZXRlKGhpc3RvcnlIb21lKTtcblx0fVxuXG5cdGFzeW5jIG1vdmVFbnRyaWVzKHNvdXJjZTogVVJJLCB0YXJnZXQ6IFVSSSk6IFByb21pc2U8VVJJW10+IHtcblx0XHRjb25zdCBsaW1pdGVyID0gbmV3IExpbWl0ZXI8VVJJPihNQVhfUEFSQUxMRUxfSElTVE9SWV9JT19PUFMpO1xuXHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPFVSST5bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBbcmVzb3VyY2UsIG1vZGVsXSBvZiB0aGlzLm1vZGVscykge1xuXHRcdFx0aWYgKCF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHJlc291cmNlLCBzb3VyY2UpKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBtb2RlbCBkb2VzIG5vdCBtYXRjaCBtb3ZlZCByZXNvdXJjZVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBEZXRlcm1pbmUgbmV3IHJlc3VsdGluZyB0YXJnZXQgcmVzb3VyY2Vcblx0XHRcdGxldCB0YXJnZXRSZXNvdXJjZTogVVJJO1xuXHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHNvdXJjZSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRhcmdldFJlc291cmNlID0gdGFyZ2V0OyAvLyBmaWxlIGdvdCBtb3ZlZFxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSBpbmRleE9mUGF0aChyZXNvdXJjZS5wYXRoLCBzb3VyY2UucGF0aCk7XG5cdFx0XHRcdHRhcmdldFJlc291cmNlID0gam9pblBhdGgodGFyZ2V0LCByZXNvdXJjZS5wYXRoLnN1YnN0cihpbmRleCArIHNvdXJjZS5wYXRoLmxlbmd0aCArIDEpKTsgLy8gcGFyZW50IGZvbGRlciBnb3QgbW92ZWRcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmlndXJlIG91dCBzYXZlIHNvdXJjZVxuXHRcdFx0bGV0IHNhdmVTb3VyY2U6IFNhdmVTb3VyY2U7XG5cdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZGlybmFtZShyZXNvdXJjZSksIGRpcm5hbWUodGFyZ2V0UmVzb3VyY2UpKSkge1xuXHRcdFx0XHRzYXZlU291cmNlID0gV29ya2luZ0NvcHlIaXN0b3J5U2VydmljZS5GSUxFX1JFTkFNRURfU09VUkNFO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2F2ZVNvdXJjZSA9IFdvcmtpbmdDb3B5SGlzdG9yeVNlcnZpY2UuRklMRV9NT1ZFRF9TT1VSQ0U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1vdmUgZW50cmllcyB0byB0YXJnZXQgcXVldWVkXG5cdFx0XHRwcm9taXNlcy5wdXNoKGxpbWl0ZXIucXVldWUoKCkgPT4gdGhpcy5kb01vdmVFbnRyaWVzKG1vZGVsLCBzYXZlU291cmNlLCByZXNvdXJjZSwgdGFyZ2V0UmVzb3VyY2UpKSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFwcm9taXNlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBBd2FpdCBtb3ZlIG9wZXJhdGlvbnNcblx0XHRjb25zdCByZXNvdXJjZXMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cblx0XHQvLyBFdmVudHNcblx0XHR0aGlzLl9vbkRpZE1vdmVFbnRyaWVzLmZpcmUoKTtcblxuXHRcdHJldHVybiByZXNvdXJjZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvTW92ZUVudHJpZXMoc291cmNlOiBXb3JraW5nQ29weUhpc3RvcnlNb2RlbCwgc2F2ZVNvdXJjZTogU2F2ZVNvdXJjZSwgc291cmNlV29ya2luZ0NvcHlSZXNvdXJjZTogVVJJLCB0YXJnZXRXb3JraW5nQ29weVJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVSST4ge1xuXG5cdFx0Ly8gTW92ZSB0byB0YXJnZXQgdmlhIG1vZGVsXG5cdFx0Y29uc3QgdGFyZ2V0ID0gYXdhaXQgdGhpcy5nZXRNb2RlbCh0YXJnZXRXb3JraW5nQ29weVJlc291cmNlKTtcblx0XHRhd2FpdCBzb3VyY2UubW92ZUVudHJpZXModGFyZ2V0LCBzYXZlU291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdC8vIFVwZGF0ZSBtb2RlbCBpbiBvdXIgbWFwXG5cdFx0dGhpcy5tb2RlbHMuZGVsZXRlKHNvdXJjZVdvcmtpbmdDb3B5UmVzb3VyY2UpO1xuXHRcdHRoaXMubW9kZWxzLnNldCh0YXJnZXRXb3JraW5nQ29weVJlc291cmNlLCBzb3VyY2UpO1xuXG5cdFx0cmV0dXJuIHRhcmdldFdvcmtpbmdDb3B5UmVzb3VyY2U7XG5cdH1cblxuXHRhc3luYyBhZGRFbnRyeSh7IHJlc291cmNlLCBzb3VyY2UsIHRpbWVzdGFtcCB9OiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnlEZXNjcmlwdG9yLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5maWxlU2VydmljZS5oYXNQcm92aWRlcihyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIHdlIHJlcXVpcmUgdGhlIHdvcmtpbmcgY29weSByZXNvdXJjZSB0byBiZSBmaWxlIHNlcnZpY2UgYWNjZXNzaWJsZVxuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgaGlzdG9yeSBtb2RlbCBmb3Igd29ya2luZyBjb3B5XG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB0aGlzLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIHRvIG1vZGVsXG5cdFx0cmV0dXJuIG1vZGVsLmFkZEVudHJ5KHNvdXJjZSwgdW5kZWZpbmVkLCB0aW1lc3RhbXAsIHRva2VuKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUVudHJ5KGVudHJ5OiBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnksIHByb3BlcnRpZXM6IHsgc291cmNlOiBTYXZlU291cmNlIH0sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gUmVzb2x2ZSBoaXN0b3J5IG1vZGVsIGZvciB3b3JraW5nIGNvcHlcblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMuZ2V0TW9kZWwoZW50cnkud29ya2luZ0NvcHkucmVzb3VyY2UpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlbmFtZSBpbiBtb2RlbFxuXHRcdHJldHVybiBtb2RlbC51cGRhdGVFbnRyeShlbnRyeSwgcHJvcGVydGllcywgdG9rZW4pO1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlRW50cnkoZW50cnk6IElXb3JraW5nQ29weUhpc3RvcnlFbnRyeSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHQvLyBSZXNvbHZlIGhpc3RvcnkgbW9kZWwgZm9yIHdvcmtpbmcgY29weVxuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5nZXRNb2RlbChlbnRyeS53b3JraW5nQ29weS5yZXNvdXJjZSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIGZyb20gbW9kZWxcblx0XHRyZXR1cm4gbW9kZWwucmVtb3ZlRW50cnkoZW50cnksIHRva2VuKTtcblx0fVxuXG5cdGFzeW5jIHJlbW92ZUFsbCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoaXN0b3J5SG9tZSA9IGF3YWl0IHRoaXMubG9jYWxIaXN0b3J5SG9tZS5wO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIG1vZGVsc1xuXHRcdHRoaXMubW9kZWxzLmNsZWFyKCk7XG5cblx0XHQvLyBSZW1vdmUgZnJvbSBkaXNrXG5cdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwoaGlzdG9yeUhvbWUsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXG5cdFx0Ly8gRXZlbnRzXG5cdFx0dGhpcy5fb25EaWRSZW1vdmVFbnRyaWVzLmZpcmUoKTtcblx0fVxuXG5cdGFzeW5jIGdldEVudHJpZXMocmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxyZWFkb25seSBJV29ya2luZ0NvcHlIaXN0b3J5RW50cnlbXT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cmllcyA9IGF3YWl0IG1vZGVsLmdldEVudHJpZXMoKTtcblx0XHRyZXR1cm4gZW50cmllcyA/PyBbXTtcblx0fVxuXG5cdGFzeW5jIGdldEFsbCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IFVSSVtdPiB7XG5cdFx0Y29uc3QgaGlzdG9yeUhvbWUgPSBhd2FpdCB0aGlzLmxvY2FsSGlzdG9yeUhvbWUucDtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBhbGwgPSBuZXcgUmVzb3VyY2VNYXA8dHJ1ZT4oKTtcblxuXHRcdC8vIEZpbGwgaW4gYWxsIGtub3duIG1vZGVsIHJlc291cmNlcyAodGhleSBtaWdodCBub3QgaGF2ZSB5ZXQgcGVyc2lzdGVkIHRvIGRpc2spXG5cdFx0Zm9yIChjb25zdCBbcmVzb3VyY2UsIG1vZGVsXSBvZiB0aGlzLm1vZGVscykge1xuXHRcdFx0Y29uc3QgaGFzSW5NZW1vcnlFbnRyaWVzID0gYXdhaXQgbW9kZWwuaGFzRW50cmllcyh0cnVlIC8qIHNraXAgcmVzb2x2aW5nIGJlY2F1c2Ugd2UgcmVzb2x2ZSBiZWxvdyBmcm9tIGRpc2sgKi8pO1xuXHRcdFx0aWYgKGhhc0luTWVtb3J5RW50cmllcykge1xuXHRcdFx0XHRhbGwuc2V0KHJlc291cmNlLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZXNvbHZlIGFsbCBvdGhlciByZXNvdXJjZXMgYnkgaXRlcmF0aW5nIHRoZSBoaXN0b3J5IGhvbWUgZm9sZGVyXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkSGlzdG9yeUhvbWUgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUoaGlzdG9yeUhvbWUpO1xuXHRcdFx0aWYgKHJlc29sdmVkSGlzdG9yeUhvbWUuY2hpbGRyZW4pIHtcblx0XHRcdFx0Y29uc3QgbGltaXRlciA9IG5ldyBMaW1pdGVyKE1BWF9QQVJBTExFTF9ISVNUT1JZX0lPX09QUyk7XG5cdFx0XHRcdGNvbnN0IHByb21pc2VzID0gW107XG5cblx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiByZXNvbHZlZEhpc3RvcnlIb21lLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0cHJvbWlzZXMucHVzaChsaW1pdGVyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHNlcmlhbGl6ZWRNb2RlbDogSVNlcmlhbGl6ZWRXb3JraW5nQ29weUhpc3RvcnlNb2RlbCA9IEpTT04ucGFyc2UoKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoam9pblBhdGgoY2hpbGQucmVzb3VyY2UsIFdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsLkVOVFJJRVNfRklMRSkpKS52YWx1ZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRcdFx0aWYgKHNlcmlhbGl6ZWRNb2RlbC5lbnRyaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0XHRhbGwuc2V0KFVSSS5wYXJzZShzZXJpYWxpemVkTW9kZWwucmVzb3VyY2UpLCB0cnVlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0Ly8gaWdub3JlIC0gbW9kZWwgbWlnaHQgYmUgbWlzc2luZyBvciBjb3JydXB0LCBidXQgd2UgbmVlZCBpdFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gaWdub3JlIC0gaGlzdG9yeSBtaWdodCBiZSBlbnRpcmVseSBlbXB0eVxuXHRcdH1cblxuXHRcdHJldHVybiBBcnJheS5mcm9tKGFsbC5rZXlzKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRNb2RlbChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxXb3JraW5nQ29weUhpc3RvcnlNb2RlbD4ge1xuXHRcdGNvbnN0IGhpc3RvcnlIb21lID0gYXdhaXQgdGhpcy5sb2NhbEhpc3RvcnlIb21lLnA7XG5cblx0XHRsZXQgbW9kZWwgPSB0aGlzLm1vZGVscy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdG1vZGVsID0gbmV3IFdvcmtpbmdDb3B5SGlzdG9yeU1vZGVsKHJlc291cmNlLCBoaXN0b3J5SG9tZSwgdGhpcy5fb25EaWRBZGRFbnRyeSwgdGhpcy5fb25EaWRDaGFuZ2VFbnRyeSwgdGhpcy5fb25EaWRSZXBsYWNlRW50cnksIHRoaXMuX29uRGlkUmVtb3ZlRW50cnksIHRoaXMuZ2V0TW9kZWxPcHRpb25zKCksIHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMubGFiZWxTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0dGhpcy5tb2RlbHMuc2V0KHJlc291cmNlLCBtb2RlbCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldE1vZGVsT3B0aW9ucygpOiBJV29ya2luZ0NvcHlIaXN0b3J5TW9kZWxPcHRpb25zO1xuXG59XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVXb3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlIGV4dGVuZHMgV29ya2luZ0NvcHlIaXN0b3J5U2VydmljZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU1RPUkVfQUxMX0lOVEVSVkFMID0gNSAqIDYwICogMTAwMDsgLy8gNW1pblxuXG5cdHByaXZhdGUgcmVhZG9ubHkgaXNSZW1vdGVseVN0b3JlZCA9IHR5cGVvZiB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgPT09ICdzdHJpbmcnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RvcmVBbGxDdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgc3RvcmVBbGxTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLnN0b3JlQWxsKHRoaXMuc3RvcmVBbGxDdHMudG9rZW4pLCBOYXRpdmVXb3JraW5nQ29weUhpc3RvcnlTZXJ2aWNlLlNUT1JFX0FMTF9JTlRFUlZBTCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihmaWxlU2VydmljZSwgcmVtb3RlQWdlbnRTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgbGFiZWxTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc1JlbW90ZWx5U3RvcmVkKSB7XG5cblx0XHRcdC8vIExvY2FsOiBwZXJzaXN0IGFsbCBvbiBzaHV0ZG93blxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saWZlY3ljbGVTZXJ2aWNlLm9uV2lsbFNodXRkb3duKGUgPT4gdGhpcy5vbldpbGxTaHV0ZG93bihlKSkpO1xuXG5cdFx0XHQvLyBMb2NhbDogc2NoZWR1bGUgcGVyc2lzdCBvbiBjaGFuZ2Vcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSh0aGlzLm9uRGlkQWRkRW50cnksIHRoaXMub25EaWRDaGFuZ2VFbnRyeSwgdGhpcy5vbkRpZFJlcGxhY2VFbnRyeSwgdGhpcy5vbkRpZFJlbW92ZUVudHJ5KSgoKSA9PiB0aGlzLm9uRGlkQ2hhbmdlTW9kZWxzKCkpKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0TW9kZWxPcHRpb25zKCk6IElXb3JraW5nQ29weUhpc3RvcnlNb2RlbE9wdGlvbnMge1xuXHRcdHJldHVybiB7IGZsdXNoT25DaGFuZ2U6IHRoaXMuaXNSZW1vdGVseVN0b3JlZCAvKiBiZWNhdXNlIHRoZSBjb25uZWN0aW9uIG1pZ2h0IGRyb3AgYW55dGltZSAqLyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBvbldpbGxTaHV0ZG93bihlOiBXaWxsU2h1dGRvd25FdmVudCk6IHZvaWQge1xuXG5cdFx0Ly8gRGlzcG9zZSB0aGUgc2NoZWR1bGVyLi4uXG5cdFx0dGhpcy5zdG9yZUFsbFNjaGVkdWxlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5zdG9yZUFsbEN0cy5kaXNwb3NlKHRydWUpO1xuXG5cdFx0Ly8gLi4uYmVjYXVzZSB3ZSBub3cgZXhwbGljaXRseSBzdG9yZSBhbGwgbW9kZWxzXG5cdFx0ZS5qb2luKHRoaXMuc3RvcmVBbGwoZS50b2tlbiksIHsgaWQ6ICdqb2luLndvcmtpbmdDb3B5SGlzdG9yeScsIGxhYmVsOiBsb2NhbGl6ZSgnam9pbi53b3JraW5nQ29weUhpc3RvcnknLCBcIlNhdmluZyBsb2NhbCBoaXN0b3J5XCIpIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZU1vZGVscygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuc3RvcmVBbGxTY2hlZHVsZXIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0dGhpcy5zdG9yZUFsbFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3RvcmVBbGwodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbGltaXRlciA9IG5ldyBMaW1pdGVyKE1BWF9QQVJBTExFTF9ISVNUT1JZX0lPX09QUyk7XG5cdFx0Y29uc3QgcHJvbWlzZXMgPSBbXTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IEFycmF5LmZyb20odGhpcy5tb2RlbHMudmFsdWVzKCkpO1xuXHRcdGZvciAoY29uc3QgbW9kZWwgb2YgbW9kZWxzKSB7XG5cdFx0XHRwcm9taXNlcy5wdXNoKGxpbWl0ZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IG1vZGVsLnN0b3JlKHRva2VuKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHR9XG59XG5cbi8vIFJlZ2lzdGVyIEhpc3RvcnkgVHJhY2tlclxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFdvcmtpbmdDb3B5SGlzdG9yeVRyYWNrZXIsIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBMEMsY0FBYywyQkFBMkI7QUFDbkYsU0FBUyxtQkFBbUIsc0JBQXlDO0FBQ3JFLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQTZILG1DQUFtQztBQUNoSyxTQUFTLG9CQUFvQixxQkFBcUIsb0JBQTJDO0FBQzdGLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsV0FBVztBQUNwQixTQUFTLGlCQUFpQixTQUFTLHdCQUF3QjtBQUMzRCxTQUFTLFNBQVMsU0FBUyxTQUFTLGdCQUFnQjtBQUNwRCxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLFlBQVk7QUFDckIsU0FBUyxhQUFhLGtCQUFrQjtBQUN4QyxTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBcUIsMEJBQTBCO0FBQy9DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsOEJBQThCO0FBeUJoQyxNQUFNLDJCQUFOLE1BQU0seUJBQXdCO0FBQUEsRUE0QnBDLFlBQ0MscUJBQ2lCLGFBQ0EsbUJBQ0EscUJBQ0Esc0JBQ0EscUJBQ0EsU0FDQSxhQUNBLGNB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
