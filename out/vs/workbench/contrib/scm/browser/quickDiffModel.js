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
import { ResourceMap } from "../../../../base/common/map.js";
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { EncodingMode, isTextFileEditorModel, ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { Disposable, DisposableMap, DisposableStore, ReferenceCollection } from "../../../../base/common/lifecycle.js";
import { IEditorWorkerService } from "../../../../editor/common/services/editorWorker.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { shouldSynchronizeModel } from "../../../../editor/common/model.js";
import { compareChanges, getModifiedEndLineNumber, IQuickDiffService } from "../common/quickDiff.js";
import { ThrottledDelayer } from "../../../../base/common/async.js";
import { ISCMService } from "../common/scm.js";
import { sortedDiff, equals } from "../../../../base/common/arrays.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { DiffState } from "../../../../editor/browser/widget/diffEditor/diffEditorViewModel.js";
import { toLineChanges } from "../../../../editor/browser/widget/diffEditor/diffEditorWidget.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IChatEditingService, ModifiedFileEntryState } from "../../chat/common/editing/chatEditingService.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { autorun } from "../../../../base/common/observable.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
const IQuickDiffModelService = createDecorator("IQuickDiffModelService");
const decoratorQuickDiffModelOptions = {
  algorithm: "advanced",
  maxComputationTimeMs: 1e3
};
let QuickDiffModelReferenceCollection = class extends ReferenceCollection {
  constructor(_instantiationService) {
    super();
    this._instantiationService = _instantiationService;
  }
  createReferencedObject(_key, textFileModel, options) {
    return this._instantiationService.createInstance(QuickDiffModel, textFileModel, options);
  }
  destroyReferencedObject(_key, object) {
    object.dispose();
  }
};
QuickDiffModelReferenceCollection = __decorateClass([
  __decorateParam(0, IInstantiationService)
], QuickDiffModelReferenceCollection);
let QuickDiffModelService = class {
  constructor(instantiationService, textFileService, uriIdentityService) {
    this.instantiationService = instantiationService;
    this.textFileService = textFileService;
    this.uriIdentityService = uriIdentityService;
    this._references = this.instantiationService.createInstance(QuickDiffModelReferenceCollection);
  }
  createQuickDiffModelReference(resource, options = decoratorQuickDiffModelOptions) {
    const textFileModel = this.textFileService.files.get(resource);
    if (!textFileModel?.isResolved()) {
      return void 0;
    }
    resource = this.uriIdentityService.asCanonicalUri(resource).with({ query: JSON.stringify(options) });
    return this._references.acquire(resource.toString(), textFileModel, options);
  }
};
QuickDiffModelService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ITextFileService),
  __decorateParam(2, IUriIdentityService)
], QuickDiffModelService);
let QuickDiffModel = class extends Disposable {
  constructor(textFileModel, options, scmService, quickDiffService, editorWorkerService, configurationService, textModelResolverService, _chatEditingService, progressService, environmentService) {
    super();
    this.options = options;
    this.scmService = scmService;
    this.quickDiffService = quickDiffService;
    this.editorWorkerService = editorWorkerService;
    this.configurationService = configurationService;
    this.textModelResolverService = textModelResolverService;
    this._chatEditingService = _chatEditingService;
    this.progressService = progressService;
    this.environmentService = environmentService;
    this._originalEditorModels = new ResourceMap();
    this._originalEditorModelsDisposables = this._register(new DisposableStore());
    this._disposed = false;
    this._quickDiffs = [];
    this._diffDelayer = this._register(new ThrottledDelayer(200));
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._allChanges = [];
    this._changes = [];
    this._changesVersionId = 0;
    /**
     * Map of quick diff name to the index of the change in `this.changes`
     */
    this._quickDiffChanges = /* @__PURE__ */ new Map();
    this._repositoryDisposables = new DisposableMap();
    this._model = textFileModel;
    this._changesVersionId = textFileModel.textEditorModel.getVersionId();
    this._register(textFileModel.textEditorModel.onDidChangeContent(() => this.triggerDiff()));
    this._register(
      Event.filter(
        configurationService.onDidChangeConfiguration,
        (e) => e.affectsConfiguration("scm.diffDecorationsIgnoreTrimWhitespace") || e.affectsConfiguration("diffEditor.ignoreTrimWhitespace")
      )(this.triggerDiff, this)
    );
    this._register(scmService.onDidAddRepository(this.onDidAddRepository, this));
    for (const r of scmService.repositories) {
      this.onDidAddRepository(r);
    }
    this._register(this._model.onDidChangeEncoding(() => {
      this._diffDelayer.cancel();
      this._quickDiffs = [];
      this._originalEditorModels.clear();
      this._quickDiffsPromise = void 0;
      this.setChanges([], [], /* @__PURE__ */ new Map(), this._model.textEditorModel.getVersionId());
      this.triggerDiff();
    }));
    this._register(this.quickDiffService.onDidChangeQuickDiffProviders(() => this.triggerDiff()));
    this._register(autorun((reader) => {
      for (const session of this._chatEditingService.editingSessionsObs.read(reader)) {
        reader.store.add(autorun((r) => {
          for (const entry of session.entries.read(r)) {
            entry.state.read(r);
          }
          this.triggerDiff();
        }));
      }
    }));
    this.triggerDiff();
  }
  get originalTextModels() {
    return Iterable.map(this._originalEditorModels.values(), (editorModel) => editorModel.textEditorModel);
  }
  get allChanges() {
    return this._allChanges;
  }
  get changes() {
    return this._changes;
  }
  /**
   * The version id of the modified text model that {@link changes} were
   * computed against. Matches {@link ITextModel.getVersionId}.
   */
  get changesVersionId() {
    return this._changesVersionId;
  }
  get quickDiffChanges() {
    return this._quickDiffChanges;
  }
  get quickDiffs() {
    return this._quickDiffs;
  }
  getQuickDiffResults() {
    return this._quickDiffs.map((quickDiff) => {
      const changes = this.allChanges.filter((change) => change.providerId === quickDiff.id);
      return {
        providerId: quickDiff.id,
        providerKind: quickDiff.kind,
        original: quickDiff.originalResource,
        modified: this._model.resource,
        changes: changes.map((change) => change.change),
        changes2: changes.map((change) => change.change2)
      };
    });
  }
  getDiffEditorModel(originalUri) {
    const editorModel = this._originalEditorModels.get(originalUri);
    return editorModel ? {
      modified: this._model.textEditorModel,
      original: editorModel.textEditorModel
    } : void 0;
  }
  onDidAddRepository(repository) {
    const disposables = new DisposableStore();
    disposables.add(repository.provider.onDidChangeResources(this.triggerDiff, this));
    const onDidRemoveRepository = Event.filter(this.scmService.onDidRemoveRepository, (r) => r === repository);
    disposables.add(onDidRemoveRepository(() => this._repositoryDisposables.deleteAndDispose(repository)));
    this._repositoryDisposables.set(repository, disposables);
    this.triggerDiff();
  }
  triggerDiff() {
    if (!this._diffDelayer) {
      return;
    }
    this._diffDelayer.trigger(async () => {
      const result = await this.diff();
      const editorModels = Array.from(this._originalEditorModels.values());
      if (!result || this._disposed || this._model.isDisposed() || editorModels.some((editorModel) => editorModel.isDisposed())) {
        return;
      }
      this.setChanges(result.allChanges, result.changes, result.mapChanges, result.versionId);
    }).catch((err) => onUnexpectedError(err));
  }
  setChanges(allChanges, changes, mapChanges, versionId) {
    const diff = sortedDiff(this.changes, changes, (a, b) => compareChanges(a.change, b.change));
    this._allChanges = allChanges;
    this._changes = changes;
    this._quickDiffChanges = mapChanges;
    this._changesVersionId = versionId;
    this._onDidChange.fire({ changes, diff });
  }
  diff() {
    const location = this.environmentService.isSessionsWindow ? ProgressLocation.Window : ProgressLocation.Scm;
    return this.progressService.withProgress({ location, delay: 250 }, async () => {
      const versionId = this._model.textEditorModel.getVersionId();
      const originalURIs = await this.getQuickDiffsPromise();
      if (this._disposed || this._model.isDisposed() || originalURIs.length === 0) {
        return Promise.resolve({ allChanges: [], changes: [], mapChanges: /* @__PURE__ */ new Map(), versionId });
      }
      const quickDiffs = originalURIs.filter((quickDiff) => this.editorWorkerService.canComputeDirtyDiff(quickDiff.originalResource, this._model.resource));
      if (quickDiffs.length === 0) {
        return Promise.resolve({ allChanges: [], changes: [], mapChanges: /* @__PURE__ */ new Map(), versionId });
      }
      const quickDiffPrimary = quickDiffs.find((quickDiff) => quickDiff.kind === "primary");
      const ignoreTrimWhitespaceSetting = this.configurationService.getValue("scm.diffDecorationsIgnoreTrimWhitespace");
      const ignoreTrimWhitespace = ignoreTrimWhitespaceSetting === "inherit" ? this.configurationService.getValue("diffEditor.ignoreTrimWhitespace") : ignoreTrimWhitespaceSetting !== "false";
      const diffs = [];
      const secondaryDiffs = [];
      for (const quickDiff of quickDiffs) {
        const diff = await this._diff(quickDiff.originalResource, this._model.resource, ignoreTrimWhitespace);
        if (diff.changes && diff.changes2 && diff.changes.length === diff.changes2.length) {
          for (let index = 0; index < diff.changes.length; index++) {
            const change2 = diff.changes2[index];
            if (quickDiffPrimary && quickDiff.kind === "secondary") {
              const primaryQuickDiffChange = diffs.find((d) => d.change2.modified.equals(change2.modified) && d.change2.original.length === change2.original.length);
              if (primaryQuickDiffChange) {
                const primaryModel = this._originalEditorModels.get(quickDiffPrimary.originalResource)?.textEditorModel;
                const primaryContent = primaryModel?.getValueInRange(primaryQuickDiffChange.change2.toRangeMapping().originalRange);
                const secondaryModel = this._originalEditorModels.get(quickDiff.originalResource)?.textEditorModel;
                const secondaryContent = secondaryModel?.getValueInRange(change2.toRangeMapping().originalRange);
                if (primaryContent === secondaryContent) {
                  secondaryDiffs.push({
                    providerId: quickDiff.id,
                    original: quickDiff.originalResource,
                    modified: this._model.resource,
                    change: diff.changes[index],
                    change2: diff.changes2[index]
                  });
                  continue;
                }
              }
            }
            diffs.push({
              providerId: quickDiff.id,
              original: quickDiff.originalResource,
              modified: this._model.resource,
              change: diff.changes[index],
              change2: diff.changes2[index]
            });
          }
        }
      }
      const diffsSorted = diffs.sort((a, b) => compareChanges(a.change, b.change));
      const allDiffsSorted = [...diffs, ...secondaryDiffs].sort((a, b) => compareChanges(a.change, b.change));
      const map = /* @__PURE__ */ new Map();
      for (let i = 0; i < diffsSorted.length; i++) {
        const providerId = diffsSorted[i].providerId;
        if (!map.has(providerId)) {
          map.set(providerId, []);
        }
        map.get(providerId).push(i);
      }
      return { allChanges: allDiffsSorted, changes: diffsSorted, mapChanges: map, versionId };
    });
  }
  async _diff(original, modified, ignoreTrimWhitespace) {
    const maxComputationTimeMs = this.options.maxComputationTimeMs ?? Number.MAX_SAFE_INTEGER;
    const result = await this.editorWorkerService.computeDiff(original, modified, {
      computeMoves: false,
      ignoreTrimWhitespace,
      maxComputationTimeMs
    }, this.options.algorithm);
    return { changes: result ? toLineChanges(DiffState.fromDiffResult(result)) : null, changes2: result?.changes ?? null };
  }
  getQuickDiffsPromise() {
    if (this._quickDiffsPromise) {
      return this._quickDiffsPromise;
    }
    this._quickDiffsPromise = this.getOriginalResource().then(async (quickDiffs) => {
      if (this._disposed) {
        return [];
      }
      if (quickDiffs.length === 0) {
        this._quickDiffs = [];
        this._originalEditorModels.clear();
        return [];
      }
      if (equals(this._quickDiffs, quickDiffs, (a, b) => a.id === b.id && a.originalResource.toString() === b.originalResource.toString() && this.quickDiffService.isQuickDiffProviderVisible(a.id) === this.quickDiffService.isQuickDiffProviderVisible(b.id))) {
        return quickDiffs;
      }
      this._quickDiffs = quickDiffs;
      this._originalEditorModels.clear();
      this._originalEditorModelsDisposables.clear();
      return (await Promise.all(quickDiffs.map(async (quickDiff) => {
        try {
          const ref = await this.textModelResolverService.createModelReference(quickDiff.originalResource);
          if (this._disposed) {
            ref.dispose();
            return [];
          }
          this._originalEditorModels.set(quickDiff.originalResource, ref.object);
          if (isTextFileEditorModel(ref.object) && !ref.object.isDirty()) {
            const encoding = this._model.getEncoding();
            if (encoding) {
              ref.object.setEncoding(encoding, EncodingMode.Decode);
            }
          }
          this._originalEditorModelsDisposables.add(ref);
          this._originalEditorModelsDisposables.add(ref.object.textEditorModel.onDidChangeContent(() => this.triggerDiff()));
          return quickDiff;
        } catch (error) {
          return [];
        }
      }))).flat();
    });
    return this._quickDiffsPromise.finally(() => {
      this._quickDiffsPromise = void 0;
    });
  }
  async getOriginalResource() {
    if (this._disposed) {
      return Promise.resolve([]);
    }
    const uri = this._model.resource;
    const isBeingModifiedByChatEdits = this._chatEditingService.editingSessionsObs.get().some((session) => session.getEntry(uri)?.state.get() === ModifiedFileEntryState.Modified);
    if (isBeingModifiedByChatEdits) {
      return Promise.resolve([]);
    }
    const isSynchronized = this._model.textEditorModel ? shouldSynchronizeModel(this._model.textEditorModel) : void 0;
    return this.quickDiffService.getQuickDiffs(uri, this._model.getLanguageId(), isSynchronized);
  }
  findNextClosestChange(lineNumber, inclusive = true, providerId) {
    const visibleQuickDiffIds = new Set(this.quickDiffs.filter((quickDiff) => this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id)).map((quickDiff) => quickDiff.id));
    for (let i = 0; i < this.changes.length; i++) {
      if (providerId && this.changes[i].providerId !== providerId) {
        continue;
      }
      if (!visibleQuickDiffIds.has(this.changes[i].providerId)) {
        continue;
      }
      const change = this.changes[i].change;
      if (inclusive) {
        if (getModifiedEndLineNumber(change) >= lineNumber) {
          return i;
        }
      } else {
        if (change.modifiedStartLineNumber > lineNumber) {
          return i;
        }
      }
    }
    return 0;
  }
  findPreviousClosestChange(lineNumber, inclusive = true, providerId) {
    const visibleQuickDiffIds = new Set(this.quickDiffs.filter((quickDiff) => this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id)).map((quickDiff) => quickDiff.id));
    for (let i = this.changes.length - 1; i >= 0; i--) {
      if (providerId && this.changes[i].providerId !== providerId) {
        continue;
      }
      if (!visibleQuickDiffIds.has(this.changes[i].providerId)) {
        continue;
      }
      const change = this.changes[i].change;
      if (inclusive) {
        if (change.modifiedStartLineNumber <= lineNumber) {
          return i;
        }
      } else {
        if (getModifiedEndLineNumber(change) < lineNumber) {
          return i;
        }
      }
    }
    return this.changes.length - 1;
  }
  dispose() {
    this._disposed = true;
    this._quickDiffs = [];
    this._diffDelayer.cancel();
    this._originalEditorModels.clear();
    this._repositoryDisposables.dispose();
    super.dispose();
  }
};
QuickDiffModel = __decorateClass([
  __decorateParam(2, ISCMService),
  __decorateParam(3, IQuickDiffService),
  __decorateParam(4, IEditorWorkerService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ITextModelService),
  __decorateParam(7, IChatEditingService),
  __decorateParam(8, IProgressService),
  __decorateParam(9, IWorkbenchEnvironmentService)
], QuickDiffModel);
export {
  IQuickDiffModelService,
  QuickDiffModel,
  QuickDiffModelService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9icm93c2VyL3F1aWNrRGlmZk1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEVuY29kaW5nTW9kZSwgSVJlc29sdmVkVGV4dEZpbGVFZGl0b3JNb2RlbCwgaXNUZXh0RmlsZUVkaXRvck1vZGVsLCBJVGV4dEZpbGVFZGl0b3JNb2RlbCwgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJUmVmZXJlbmNlLCBSZWZlcmVuY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IERpZmZBbGdvcml0aG1OYW1lLCBJRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvbGVnYWN5TGluZXNEaWZmQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwsIHNob3VsZFN5bmNocm9uaXplTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGNvbXBhcmVDaGFuZ2VzLCBnZXRNb2RpZmllZEVuZExpbmVOdW1iZXIsIElRdWlja0RpZmZTZXJ2aWNlLCBRdWlja0RpZmYsIFF1aWNrRGlmZkNoYW5nZSwgUXVpY2tEaWZmUmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3F1aWNrRGlmZi5qcyc7XG5pbXBvcnQgeyBUaHJvdHRsZWREZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVNDTVJlcG9zaXRvcnksIElTQ01TZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3NjbS5qcyc7XG5pbXBvcnQgeyBzb3J0ZWREaWZmLCBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBJU3BsaWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2VxdWVuY2UuanMnO1xuaW1wb3J0IHsgRGlmZlN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvZGlmZkVkaXRvclZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyB0b0xpbmVDaGFuZ2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvZGlmZkVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBMaW5lUmFuZ2VNYXBwaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9kaWZmL3JhbmdlTWFwcGluZy5qcyc7XG5pbXBvcnQgeyBJRGlmZkVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElDaGF0RWRpdGluZ1NlcnZpY2UsIE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IElRdWlja0RpZmZNb2RlbFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVF1aWNrRGlmZk1vZGVsU2VydmljZT4oJ0lRdWlja0RpZmZNb2RlbFNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBRdWlja0RpZmZNb2RlbE9wdGlvbnMge1xuXHRyZWFkb25seSBhbGdvcml0aG06IERpZmZBbGdvcml0aG1OYW1lO1xuXHRyZWFkb25seSBtYXhDb21wdXRhdGlvblRpbWVNcz86IG51bWJlcjtcbn1cblxuY29uc3QgZGVjb3JhdG9yUXVpY2tEaWZmTW9kZWxPcHRpb25zOiBRdWlja0RpZmZNb2RlbE9wdGlvbnMgPSB7XG5cdGFsZ29yaXRobTogJ2FkdmFuY2VkJyxcblx0bWF4Q29tcHV0YXRpb25UaW1lTXM6IDEwMDBcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVF1aWNrRGlmZk1vZGVsU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmV0dXJucyBgdW5kZWZpbmVkYCBpZiB0aGUgZWRpdG9yIG1vZGVsIGlzIG5vdCByZXNvbHZlZC5cblx0ICogTW9kZWwgcmVmcmVuY2UgaGFzIHRvIGJlIGRpc3Bvc2VkIG9uY2Ugbm90IG5lZWRlZCBhbnltb3JlLlxuXHQgKiBAcGFyYW0gcmVzb3VyY2Vcblx0ICogQHBhcmFtIG9wdGlvbnNcblx0ICovXG5cdGNyZWF0ZVF1aWNrRGlmZk1vZGVsUmVmZXJlbmNlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBRdWlja0RpZmZNb2RlbE9wdGlvbnMpOiBJUmVmZXJlbmNlPFF1aWNrRGlmZk1vZGVsPiB8IHVuZGVmaW5lZDtcbn1cblxuY2xhc3MgUXVpY2tEaWZmTW9kZWxSZWZlcmVuY2VDb2xsZWN0aW9uIGV4dGVuZHMgUmVmZXJlbmNlQ29sbGVjdGlvbjxRdWlja0RpZmZNb2RlbD4ge1xuXHRjb25zdHJ1Y3RvcihASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZVJlZmVyZW5jZWRPYmplY3QoX2tleTogc3RyaW5nLCB0ZXh0RmlsZU1vZGVsOiBJUmVzb2x2ZWRUZXh0RmlsZUVkaXRvck1vZGVsLCBvcHRpb25zOiBRdWlja0RpZmZNb2RlbE9wdGlvbnMpOiBRdWlja0RpZmZNb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1aWNrRGlmZk1vZGVsLCB0ZXh0RmlsZU1vZGVsLCBvcHRpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBkZXN0cm95UmVmZXJlbmNlZE9iamVjdChfa2V5OiBzdHJpbmcsIG9iamVjdDogUXVpY2tEaWZmTW9kZWwpOiB2b2lkIHtcblx0XHRvYmplY3QuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBRdWlja0RpZmZNb2RlbFNlcnZpY2UgaW1wbGVtZW50cyBJUXVpY2tEaWZmTW9kZWxTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZmVyZW5jZXM6IFF1aWNrRGlmZk1vZGVsUmVmZXJlbmNlQ29sbGVjdGlvbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9yZWZlcmVuY2VzID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShRdWlja0RpZmZNb2RlbFJlZmVyZW5jZUNvbGxlY3Rpb24pO1xuXHR9XG5cblx0Y3JlYXRlUXVpY2tEaWZmTW9kZWxSZWZlcmVuY2UocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogUXVpY2tEaWZmTW9kZWxPcHRpb25zID0gZGVjb3JhdG9yUXVpY2tEaWZmTW9kZWxPcHRpb25zKTogSVJlZmVyZW5jZTxRdWlja0RpZmZNb2RlbD4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHRleHRGaWxlTW9kZWwgPSB0aGlzLnRleHRGaWxlU2VydmljZS5maWxlcy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICghdGV4dEZpbGVNb2RlbD8uaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJlc291cmNlID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuYXNDYW5vbmljYWxVcmkocmVzb3VyY2UpLndpdGgoeyBxdWVyeTogSlNPTi5zdHJpbmdpZnkob3B0aW9ucykgfSk7XG5cdFx0cmV0dXJuIHRoaXMuX3JlZmVyZW5jZXMuYWNxdWlyZShyZXNvdXJjZS50b1N0cmluZygpLCB0ZXh0RmlsZU1vZGVsLCBvcHRpb25zKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUXVpY2tEaWZmTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSVJlc29sdmVkVGV4dEZpbGVFZGl0b3JNb2RlbDtcblx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWxFZGl0b3JNb2RlbHMgPSBuZXcgUmVzb3VyY2VNYXA8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbEVkaXRvck1vZGVsc0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0Z2V0IG9yaWdpbmFsVGV4dE1vZGVscygpOiBJdGVyYWJsZTxJVGV4dE1vZGVsPiB7XG5cdFx0cmV0dXJuIEl0ZXJhYmxlLm1hcCh0aGlzLl9vcmlnaW5hbEVkaXRvck1vZGVscy52YWx1ZXMoKSwgZWRpdG9yTW9kZWwgPT4gZWRpdG9yTW9kZWwudGV4dEVkaXRvck1vZGVsKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VkID0gZmFsc2U7XG5cdHByaXZhdGUgX3F1aWNrRGlmZnM6IFF1aWNrRGlmZltdID0gW107XG5cdHByaXZhdGUgX3F1aWNrRGlmZnNQcm9taXNlPzogUHJvbWlzZTxRdWlja0RpZmZbXT47XG5cdHByaXZhdGUgX2RpZmZEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlZERlbGF5ZXI8dm9pZD4oMjAwKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGNoYW5nZXM6IFF1aWNrRGlmZkNoYW5nZVtdOyBkaWZmOiBJU3BsaWNlPFF1aWNrRGlmZkNoYW5nZT5bXSB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHsgY2hhbmdlczogUXVpY2tEaWZmQ2hhbmdlW107IGRpZmY6IElTcGxpY2U8UXVpY2tEaWZmQ2hhbmdlPltdIH0+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfYWxsQ2hhbmdlczogUXVpY2tEaWZmQ2hhbmdlW10gPSBbXTtcblx0Z2V0IGFsbENoYW5nZXMoKTogUXVpY2tEaWZmQ2hhbmdlW10geyByZXR1cm4gdGhpcy5fYWxsQ2hhbmdlczsgfVxuXG5cdHByaXZhdGUgX2NoYW5nZXM6IFF1aWNrRGlmZkNoYW5nZVtdID0gW107XG5cdGdldCBjaGFuZ2VzKCk6IFF1aWNrRGlmZkNoYW5nZVtdIHsgcmV0dXJuIHRoaXMuX2NoYW5nZXM7IH1cblxuXHRwcml2YXRlIF9jaGFuZ2VzVmVyc2lvbklkOiBudW1iZXIgPSAwO1xuXHQvKipcblx0ICogVGhlIHZlcnNpb24gaWQgb2YgdGhlIG1vZGlmaWVkIHRleHQgbW9kZWwgdGhhdCB7QGxpbmsgY2hhbmdlc30gd2VyZVxuXHQgKiBjb21wdXRlZCBhZ2FpbnN0LiBNYXRjaGVzIHtAbGluayBJVGV4dE1vZGVsLmdldFZlcnNpb25JZH0uXG5cdCAqL1xuXHRnZXQgY2hhbmdlc1ZlcnNpb25JZCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fY2hhbmdlc1ZlcnNpb25JZDsgfVxuXG5cdC8qKlxuXHQgKiBNYXAgb2YgcXVpY2sgZGlmZiBuYW1lIHRvIHRoZSBpbmRleCBvZiB0aGUgY2hhbmdlIGluIGB0aGlzLmNoYW5nZXNgXG5cdCAqL1xuXHRwcml2YXRlIF9xdWlja0RpZmZDaGFuZ2VzOiBNYXA8c3RyaW5nLCBudW1iZXJbXT4gPSBuZXcgTWFwKCk7XG5cdGdldCBxdWlja0RpZmZDaGFuZ2VzKCk6IE1hcDxzdHJpbmcsIG51bWJlcltdPiB7IHJldHVybiB0aGlzLl9xdWlja0RpZmZDaGFuZ2VzOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVwb3NpdG9yeURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVNYXA8SVNDTVJlcG9zaXRvcnk+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dGV4dEZpbGVNb2RlbDogSVJlc29sdmVkVGV4dEZpbGVFZGl0b3JNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IFF1aWNrRGlmZk1vZGVsT3B0aW9ucyxcblx0XHRASVNDTVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzY21TZXJ2aWNlOiBJU0NNU2VydmljZSxcblx0XHRASVF1aWNrRGlmZlNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0RpZmZTZXJ2aWNlOiBJUXVpY2tEaWZmU2VydmljZSxcblx0XHRASUVkaXRvcldvcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JXb3JrZXJTZXJ2aWNlOiBJRWRpdG9yV29ya2VyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVkaXRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRFZGl0aW5nU2VydmljZTogSUNoYXRFZGl0aW5nU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX21vZGVsID0gdGV4dEZpbGVNb2RlbDtcblx0XHR0aGlzLl9jaGFuZ2VzVmVyc2lvbklkID0gdGV4dEZpbGVNb2RlbC50ZXh0RWRpdG9yTW9kZWwuZ2V0VmVyc2lvbklkKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0ZXh0RmlsZU1vZGVsLnRleHRFZGl0b3JNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4gdGhpcy50cmlnZ2VyRGlmZigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRFdmVudC5maWx0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLFxuXHRcdFx0XHRlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3NjbS5kaWZmRGVjb3JhdGlvbnNJZ25vcmVUcmltV2hpdGVzcGFjZScpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2RpZmZFZGl0b3IuaWdub3JlVHJpbVdoaXRlc3BhY2UnKVxuXHRcdFx0KSh0aGlzLnRyaWdnZXJEaWZmLCB0aGlzKVxuXHRcdCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2NtU2VydmljZS5vbkRpZEFkZFJlcG9zaXRvcnkodGhpcy5vbkRpZEFkZFJlcG9zaXRvcnksIHRoaXMpKTtcblx0XHRmb3IgKGNvbnN0IHIgb2Ygc2NtU2VydmljZS5yZXBvc2l0b3JpZXMpIHtcblx0XHRcdHRoaXMub25EaWRBZGRSZXBvc2l0b3J5KHIpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21vZGVsLm9uRGlkQ2hhbmdlRW5jb2RpbmcoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZGlmZkRlbGF5ZXIuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl9xdWlja0RpZmZzID0gW107XG5cdFx0XHR0aGlzLl9vcmlnaW5hbEVkaXRvck1vZGVscy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fcXVpY2tEaWZmc1Byb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnNldENoYW5nZXMoW10sIFtdLCBuZXcgTWFwKCksIHRoaXMuX21vZGVsLnRleHRFZGl0b3JNb2RlbC5nZXRWZXJzaW9uSWQoKSk7XG5cdFx0XHR0aGlzLnRyaWdnZXJEaWZmKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5xdWlja0RpZmZTZXJ2aWNlLm9uRGlkQ2hhbmdlUXVpY2tEaWZmUHJvdmlkZXJzKCgpID0+IHRoaXMudHJpZ2dlckRpZmYoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX2NoYXRFZGl0aW5nU2VydmljZS5lZGl0aW5nU2Vzc2lvbnNPYnMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHNlc3Npb24uZW50cmllcy5yZWFkKHIpKSB7XG5cdFx0XHRcdFx0XHRlbnRyeS5zdGF0ZS5yZWFkKHIpOyAvLyBzaWduYWxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy50cmlnZ2VyRGlmZigpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy50cmlnZ2VyRGlmZigpO1xuXHR9XG5cblx0Z2V0IHF1aWNrRGlmZnMoKTogcmVhZG9ubHkgUXVpY2tEaWZmW10ge1xuXHRcdHJldHVybiB0aGlzLl9xdWlja0RpZmZzO1xuXHR9XG5cblx0cHVibGljIGdldFF1aWNrRGlmZlJlc3VsdHMoKTogUXVpY2tEaWZmUmVzdWx0W10ge1xuXHRcdHJldHVybiB0aGlzLl9xdWlja0RpZmZzLm1hcChxdWlja0RpZmYgPT4ge1xuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IHRoaXMuYWxsQ2hhbmdlc1xuXHRcdFx0XHQuZmlsdGVyKGNoYW5nZSA9PiBjaGFuZ2UucHJvdmlkZXJJZCA9PT0gcXVpY2tEaWZmLmlkKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cHJvdmlkZXJJZDogcXVpY2tEaWZmLmlkLFxuXHRcdFx0XHRwcm92aWRlcktpbmQ6IHF1aWNrRGlmZi5raW5kLFxuXHRcdFx0XHRvcmlnaW5hbDogcXVpY2tEaWZmLm9yaWdpbmFsUmVzb3VyY2UsXG5cdFx0XHRcdG1vZGlmaWVkOiB0aGlzLl9tb2RlbC5yZXNvdXJjZSxcblx0XHRcdFx0Y2hhbmdlczogY2hhbmdlcy5tYXAoY2hhbmdlID0+IGNoYW5nZS5jaGFuZ2UpLFxuXHRcdFx0XHRjaGFuZ2VzMjogY2hhbmdlcy5tYXAoY2hhbmdlID0+IGNoYW5nZS5jaGFuZ2UyKVxuXHRcdFx0fSBzYXRpc2ZpZXMgUXVpY2tEaWZmUmVzdWx0O1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldERpZmZFZGl0b3JNb2RlbChvcmlnaW5hbFVyaTogVVJJKTogSURpZmZFZGl0b3JNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZWRpdG9yTW9kZWwgPSB0aGlzLl9vcmlnaW5hbEVkaXRvck1vZGVscy5nZXQob3JpZ2luYWxVcmkpO1xuXHRcdHJldHVybiBlZGl0b3JNb2RlbCA/XG5cdFx0XHR7XG5cdFx0XHRcdG1vZGlmaWVkOiB0aGlzLl9tb2RlbC50ZXh0RWRpdG9yTW9kZWwsXG5cdFx0XHRcdG9yaWdpbmFsOiBlZGl0b3JNb2RlbC50ZXh0RWRpdG9yTW9kZWxcblx0XHRcdH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQWRkUmVwb3NpdG9yeShyZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSk6IHZvaWQge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlcG9zaXRvcnkucHJvdmlkZXIub25EaWRDaGFuZ2VSZXNvdXJjZXModGhpcy50cmlnZ2VyRGlmZiwgdGhpcykpO1xuXG5cdFx0Y29uc3Qgb25EaWRSZW1vdmVSZXBvc2l0b3J5ID0gRXZlbnQuZmlsdGVyKHRoaXMuc2NtU2VydmljZS5vbkRpZFJlbW92ZVJlcG9zaXRvcnksIHIgPT4gciA9PT0gcmVwb3NpdG9yeSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG9uRGlkUmVtb3ZlUmVwb3NpdG9yeSgoKSA9PiB0aGlzLl9yZXBvc2l0b3J5RGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZShyZXBvc2l0b3J5KSkpO1xuXG5cdFx0dGhpcy5fcmVwb3NpdG9yeURpc3Bvc2FibGVzLnNldChyZXBvc2l0b3J5LCBkaXNwb3NhYmxlcyk7XG5cblx0XHR0aGlzLnRyaWdnZXJEaWZmKCk7XG5cdH1cblxuXHRwcml2YXRlIHRyaWdnZXJEaWZmKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZGlmZkRlbGF5ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9kaWZmRGVsYXllclxuXHRcdFx0LnRyaWdnZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQ6IHsgYWxsQ2hhbmdlczogUXVpY2tEaWZmQ2hhbmdlW107IGNoYW5nZXM6IFF1aWNrRGlmZkNoYW5nZVtdOyBtYXBDaGFuZ2VzOiBNYXA8c3RyaW5nLCBudW1iZXJbXT47IHZlcnNpb25JZDogbnVtYmVyIH0gfCBudWxsID0gYXdhaXQgdGhpcy5kaWZmKCk7XG5cblx0XHRcdFx0Y29uc3QgZWRpdG9yTW9kZWxzID0gQXJyYXkuZnJvbSh0aGlzLl9vcmlnaW5hbEVkaXRvck1vZGVscy52YWx1ZXMoKSk7XG5cdFx0XHRcdGlmICghcmVzdWx0IHx8IHRoaXMuX2Rpc3Bvc2VkIHx8IHRoaXMuX21vZGVsLmlzRGlzcG9zZWQoKSB8fCBlZGl0b3JNb2RlbHMuc29tZShlZGl0b3JNb2RlbCA9PiBlZGl0b3JNb2RlbC5pc0Rpc3Bvc2VkKCkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBkaXNwb3NlZFxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5zZXRDaGFuZ2VzKHJlc3VsdC5hbGxDaGFuZ2VzLCByZXN1bHQuY2hhbmdlcywgcmVzdWx0Lm1hcENoYW5nZXMsIHJlc3VsdC52ZXJzaW9uSWQpO1xuXHRcdFx0fSlcblx0XHRcdC5jYXRjaChlcnIgPT4gb25VbmV4cGVjdGVkRXJyb3IoZXJyKSk7XG5cdH1cblxuXHRwcml2YXRlIHNldENoYW5nZXMoYWxsQ2hhbmdlczogUXVpY2tEaWZmQ2hhbmdlW10sIGNoYW5nZXM6IFF1aWNrRGlmZkNoYW5nZVtdLCBtYXBDaGFuZ2VzOiBNYXA8c3RyaW5nLCBudW1iZXJbXT4sIHZlcnNpb25JZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgZGlmZiA9IHNvcnRlZERpZmYodGhpcy5jaGFuZ2VzLCBjaGFuZ2VzLCAoYSwgYikgPT4gY29tcGFyZUNoYW5nZXMoYS5jaGFuZ2UsIGIuY2hhbmdlKSk7XG5cdFx0dGhpcy5fYWxsQ2hhbmdlcyA9IGFsbENoYW5nZXM7XG5cdFx0dGhpcy5fY2hhbmdlcyA9IGNoYW5nZXM7XG5cdFx0dGhpcy5fcXVpY2tEaWZmQ2hhbmdlcyA9IG1hcENoYW5nZXM7XG5cdFx0dGhpcy5fY2hhbmdlc1ZlcnNpb25JZCA9IHZlcnNpb25JZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgY2hhbmdlcywgZGlmZiB9KTtcblx0fVxuXG5cdHByaXZhdGUgZGlmZigpOiBQcm9taXNlPHsgYWxsQ2hhbmdlczogUXVpY2tEaWZmQ2hhbmdlW107IGNoYW5nZXM6IFF1aWNrRGlmZkNoYW5nZVtdOyBtYXBDaGFuZ2VzOiBNYXA8c3RyaW5nLCBudW1iZXJbXT47IHZlcnNpb25JZDogbnVtYmVyIH0gfCBudWxsPiB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93ID8gUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3cgOiBQcm9ncmVzc0xvY2F0aW9uLlNjbTtcblx0XHRyZXR1cm4gdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb24sIGRlbGF5OiAyNTAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmVyc2lvbklkID0gdGhpcy5fbW9kZWwudGV4dEVkaXRvck1vZGVsLmdldFZlcnNpb25JZCgpO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxVUklzID0gYXdhaXQgdGhpcy5nZXRRdWlja0RpZmZzUHJvbWlzZSgpO1xuXHRcdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkIHx8IHRoaXMuX21vZGVsLmlzRGlzcG9zZWQoKSB8fCAob3JpZ2luYWxVUklzLmxlbmd0aCA9PT0gMCkpIHtcblx0XHRcdFx0Ly8gRGlzcG9zZWRcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IGFsbENoYW5nZXM6IFtdLCBjaGFuZ2VzOiBbXSwgbWFwQ2hhbmdlczogbmV3IE1hcCgpLCB2ZXJzaW9uSWQgfSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHF1aWNrRGlmZnMgPSBvcmlnaW5hbFVSSXNcblx0XHRcdFx0LmZpbHRlcihxdWlja0RpZmYgPT4gdGhpcy5lZGl0b3JXb3JrZXJTZXJ2aWNlLmNhbkNvbXB1dGVEaXJ0eURpZmYocXVpY2tEaWZmLm9yaWdpbmFsUmVzb3VyY2UsIHRoaXMuX21vZGVsLnJlc291cmNlKSk7XG5cdFx0XHRpZiAocXVpY2tEaWZmcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Ly8gQWxsIGZpbGVzIGFyZSB0b28gbGFyZ2Vcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IGFsbENoYW5nZXM6IFtdLCBjaGFuZ2VzOiBbXSwgbWFwQ2hhbmdlczogbmV3IE1hcCgpLCB2ZXJzaW9uSWQgfSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHF1aWNrRGlmZlByaW1hcnkgPSBxdWlja0RpZmZzLmZpbmQocXVpY2tEaWZmID0+IHF1aWNrRGlmZi5raW5kID09PSAncHJpbWFyeScpO1xuXG5cdFx0XHRjb25zdCBpZ25vcmVUcmltV2hpdGVzcGFjZVNldHRpbmcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCd0cnVlJyB8ICdmYWxzZScgfCAnaW5oZXJpdCc+KCdzY20uZGlmZkRlY29yYXRpb25zSWdub3JlVHJpbVdoaXRlc3BhY2UnKTtcblx0XHRcdGNvbnN0IGlnbm9yZVRyaW1XaGl0ZXNwYWNlID0gaWdub3JlVHJpbVdoaXRlc3BhY2VTZXR0aW5nID09PSAnaW5oZXJpdCdcblx0XHRcdFx0PyB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdkaWZmRWRpdG9yLmlnbm9yZVRyaW1XaGl0ZXNwYWNlJylcblx0XHRcdFx0OiBpZ25vcmVUcmltV2hpdGVzcGFjZVNldHRpbmcgIT09ICdmYWxzZSc7XG5cblx0XHRcdGNvbnN0IGRpZmZzOiBRdWlja0RpZmZDaGFuZ2VbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2Vjb25kYXJ5RGlmZnM6IFF1aWNrRGlmZkNoYW5nZVtdID0gW107XG5cblx0XHRcdGZvciAoY29uc3QgcXVpY2tEaWZmIG9mIHF1aWNrRGlmZnMpIHtcblx0XHRcdFx0Y29uc3QgZGlmZiA9IGF3YWl0IHRoaXMuX2RpZmYocXVpY2tEaWZmLm9yaWdpbmFsUmVzb3VyY2UsIHRoaXMuX21vZGVsLnJlc291cmNlLCBpZ25vcmVUcmltV2hpdGVzcGFjZSk7XG5cdFx0XHRcdGlmIChkaWZmLmNoYW5nZXMgJiYgZGlmZi5jaGFuZ2VzMiAmJiBkaWZmLmNoYW5nZXMubGVuZ3RoID09PSBkaWZmLmNoYW5nZXMyLmxlbmd0aCkge1xuXHRcdFx0XHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBkaWZmLmNoYW5nZXMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjaGFuZ2UyID0gZGlmZi5jaGFuZ2VzMltpbmRleF07XG5cblx0XHRcdFx0XHRcdC8vIFRoZSBzZWNvbmRhcnkgZGlmZnMgYXJlIGNvbXBsaW1lbnRhcnkgdG8gdGhlIHByaW1hcnkgZGlmZnMsIGFuZFxuXHRcdFx0XHRcdFx0Ly8gdGhleSBjYW4gb3ZlcmxhcC4gV2UgbmVlZCB0byByZW1vdmUgdGhlIHNlY29uZGFyeSBxdWljayBkaWZmcyB0aGF0XG5cdFx0XHRcdFx0XHQvLyBvdmVybGFwIGZvciB0aGUgVUksIGJ1dCB3ZSBuZWVkIHRvIGV4cG9zZSBhbGwgZGlmZnMgdGhyb3VnaCB0aGUgQVBJLlxuXHRcdFx0XHRcdFx0aWYgKHF1aWNrRGlmZlByaW1hcnkgJiYgcXVpY2tEaWZmLmtpbmQgPT09ICdzZWNvbmRhcnknKSB7XG5cdFx0XHRcdFx0XHRcdC8vIENoZWNrIHdoZXRoZXIgdGhlOlxuXHRcdFx0XHRcdFx0XHQvLyAxLiB0aGUgbW9kaWZpZWQgbGluZSByYW5nZSBpcyBlcXVhbFxuXHRcdFx0XHRcdFx0XHQvLyAyLiB0aGUgb3JpZ2luYWwgbGluZSByYW5nZSBsZW5ndGggaXMgZXF1YWxcblx0XHRcdFx0XHRcdFx0Y29uc3QgcHJpbWFyeVF1aWNrRGlmZkNoYW5nZSA9IGRpZmZzXG5cdFx0XHRcdFx0XHRcdFx0LmZpbmQoZCA9PiBkLmNoYW5nZTIubW9kaWZpZWQuZXF1YWxzKGNoYW5nZTIubW9kaWZpZWQpICYmXG5cdFx0XHRcdFx0XHRcdFx0XHRkLmNoYW5nZTIub3JpZ2luYWwubGVuZ3RoID09PSBjaGFuZ2UyLm9yaWdpbmFsLmxlbmd0aCk7XG5cblx0XHRcdFx0XHRcdFx0aWYgKHByaW1hcnlRdWlja0RpZmZDaGFuZ2UpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBDaGVjayB3aGV0aGVyIHRoZSBvcmlnaW5hbCBjb250ZW50IG1hdGNoZXNcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBwcmltYXJ5TW9kZWwgPSB0aGlzLl9vcmlnaW5hbEVkaXRvck1vZGVscy5nZXQocXVpY2tEaWZmUHJpbWFyeS5vcmlnaW5hbFJlc291cmNlKT8udGV4dEVkaXRvck1vZGVsO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHByaW1hcnlDb250ZW50ID0gcHJpbWFyeU1vZGVsPy5nZXRWYWx1ZUluUmFuZ2UocHJpbWFyeVF1aWNrRGlmZkNoYW5nZS5jaGFuZ2UyLnRvUmFuZ2VNYXBwaW5nKCkub3JpZ2luYWxSYW5nZSk7XG5cblx0XHRcdFx0XHRcdFx0XHRjb25zdCBzZWNvbmRhcnlNb2RlbCA9IHRoaXMuX29yaWdpbmFsRWRpdG9yTW9kZWxzLmdldChxdWlja0RpZmYub3JpZ2luYWxSZXNvdXJjZSk/LnRleHRFZGl0b3JNb2RlbDtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBzZWNvbmRhcnlDb250ZW50ID0gc2Vjb25kYXJ5TW9kZWw/LmdldFZhbHVlSW5SYW5nZShjaGFuZ2UyLnRvUmFuZ2VNYXBwaW5nKCkub3JpZ2luYWxSYW5nZSk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHByaW1hcnlDb250ZW50ID09PSBzZWNvbmRhcnlDb250ZW50KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRzZWNvbmRhcnlEaWZmcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cHJvdmlkZXJJZDogcXVpY2tEaWZmLmlkLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRvcmlnaW5hbDogcXVpY2tEaWZmLm9yaWdpbmFsUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG1vZGlmaWVkOiB0aGlzLl9tb2RlbC5yZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y2hhbmdlOiBkaWZmLmNoYW5nZXNbaW5kZXhdLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjaGFuZ2UyOiBkaWZmLmNoYW5nZXMyW2luZGV4XVxuXHRcdFx0XHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRkaWZmcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cHJvdmlkZXJJZDogcXVpY2tEaWZmLmlkLFxuXHRcdFx0XHRcdFx0XHRvcmlnaW5hbDogcXVpY2tEaWZmLm9yaWdpbmFsUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdG1vZGlmaWVkOiB0aGlzLl9tb2RlbC5yZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0Y2hhbmdlOiBkaWZmLmNoYW5nZXNbaW5kZXhdLFxuXHRcdFx0XHRcdFx0XHRjaGFuZ2UyOiBkaWZmLmNoYW5nZXMyW2luZGV4XVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRpZmZzU29ydGVkID0gZGlmZnMuc29ydCgoYSwgYikgPT4gY29tcGFyZUNoYW5nZXMoYS5jaGFuZ2UsIGIuY2hhbmdlKSk7XG5cdFx0XHRjb25zdCBhbGxEaWZmc1NvcnRlZCA9IFsuLi5kaWZmcywgLi4uc2Vjb25kYXJ5RGlmZnNdLnNvcnQoKGEsIGIpID0+IGNvbXBhcmVDaGFuZ2VzKGEuY2hhbmdlLCBiLmNoYW5nZSkpO1xuXG5cdFx0XHRjb25zdCBtYXA6IE1hcDxzdHJpbmcsIG51bWJlcltdPiA9IG5ldyBNYXAoKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZGlmZnNTb3J0ZWQubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgcHJvdmlkZXJJZCA9IGRpZmZzU29ydGVkW2ldLnByb3ZpZGVySWQ7XG5cdFx0XHRcdGlmICghbWFwLmhhcyhwcm92aWRlcklkKSkge1xuXHRcdFx0XHRcdG1hcC5zZXQocHJvdmlkZXJJZCwgW10pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1hcC5nZXQocHJvdmlkZXJJZCkhLnB1c2goaSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IGFsbENoYW5nZXM6IGFsbERpZmZzU29ydGVkLCBjaGFuZ2VzOiBkaWZmc1NvcnRlZCwgbWFwQ2hhbmdlczogbWFwLCB2ZXJzaW9uSWQgfTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RpZmYob3JpZ2luYWw6IFVSSSwgbW9kaWZpZWQ6IFVSSSwgaWdub3JlVHJpbVdoaXRlc3BhY2U6IGJvb2xlYW4pOiBQcm9taXNlPHsgY2hhbmdlczogcmVhZG9ubHkgSUNoYW5nZVtdIHwgbnVsbDsgY2hhbmdlczI6IHJlYWRvbmx5IExpbmVSYW5nZU1hcHBpbmdbXSB8IG51bGwgfT4ge1xuXHRcdGNvbnN0IG1heENvbXB1dGF0aW9uVGltZU1zID0gdGhpcy5vcHRpb25zLm1heENvbXB1dGF0aW9uVGltZU1zID8/IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5lZGl0b3JXb3JrZXJTZXJ2aWNlLmNvbXB1dGVEaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwge1xuXHRcdFx0Y29tcHV0ZU1vdmVzOiBmYWxzZSwgaWdub3JlVHJpbVdoaXRlc3BhY2UsIG1heENvbXB1dGF0aW9uVGltZU1zXG5cdFx0fSwgdGhpcy5vcHRpb25zLmFsZ29yaXRobSk7XG5cblx0XHRyZXR1cm4geyBjaGFuZ2VzOiByZXN1bHQgPyB0b0xpbmVDaGFuZ2VzKERpZmZTdGF0ZS5mcm9tRGlmZlJlc3VsdChyZXN1bHQpKSA6IG51bGwsIGNoYW5nZXMyOiByZXN1bHQ/LmNoYW5nZXMgPz8gbnVsbCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRRdWlja0RpZmZzUHJvbWlzZSgpOiBQcm9taXNlPFF1aWNrRGlmZltdPiB7XG5cdFx0aWYgKHRoaXMuX3F1aWNrRGlmZnNQcm9taXNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcXVpY2tEaWZmc1Byb21pc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcXVpY2tEaWZmc1Byb21pc2UgPSB0aGlzLmdldE9yaWdpbmFsUmVzb3VyY2UoKS50aGVuKGFzeW5jIChxdWlja0RpZmZzKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHsgLy8gZGlzcG9zZWRcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocXVpY2tEaWZmcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5fcXVpY2tEaWZmcyA9IFtdO1xuXHRcdFx0XHR0aGlzLl9vcmlnaW5hbEVkaXRvck1vZGVscy5jbGVhcigpO1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlcXVhbHModGhpcy5fcXVpY2tEaWZmcywgcXVpY2tEaWZmcywgKGEsIGIpID0+XG5cdFx0XHRcdGEuaWQgPT09IGIuaWQgJiZcblx0XHRcdFx0YS5vcmlnaW5hbFJlc291cmNlLnRvU3RyaW5nKCkgPT09IGIub3JpZ2luYWxSZXNvdXJjZS50b1N0cmluZygpICYmXG5cdFx0XHRcdHRoaXMucXVpY2tEaWZmU2VydmljZS5pc1F1aWNrRGlmZlByb3ZpZGVyVmlzaWJsZShhLmlkKSA9PT0gdGhpcy5xdWlja0RpZmZTZXJ2aWNlLmlzUXVpY2tEaWZmUHJvdmlkZXJWaXNpYmxlKGIuaWQpKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybiBxdWlja0RpZmZzO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9xdWlja0RpZmZzID0gcXVpY2tEaWZmcztcblxuXHRcdFx0dGhpcy5fb3JpZ2luYWxFZGl0b3JNb2RlbHMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX29yaWdpbmFsRWRpdG9yTW9kZWxzRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHJldHVybiAoYXdhaXQgUHJvbWlzZS5hbGwocXVpY2tEaWZmcy5tYXAoYXN5bmMgKHF1aWNrRGlmZikgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMudGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHF1aWNrRGlmZi5vcmlnaW5hbFJlc291cmNlKTtcblx0XHRcdFx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHsgLy8gZGlzcG9zZWRcblx0XHRcdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5fb3JpZ2luYWxFZGl0b3JNb2RlbHMuc2V0KHF1aWNrRGlmZi5vcmlnaW5hbFJlc291cmNlLCByZWYub2JqZWN0KTtcblxuXHRcdFx0XHRcdGlmIChpc1RleHRGaWxlRWRpdG9yTW9kZWwocmVmLm9iamVjdCkgJiYgIXJlZi5vYmplY3QuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlbmNvZGluZyA9IHRoaXMuX21vZGVsLmdldEVuY29kaW5nKCk7XG5cblx0XHRcdFx0XHRcdGlmIChlbmNvZGluZykge1xuXHRcdFx0XHRcdFx0XHQocmVmLm9iamVjdCBhcyBJVGV4dEZpbGVFZGl0b3JNb2RlbCkuc2V0RW5jb2RpbmcoZW5jb2RpbmcsIEVuY29kaW5nTW9kZS5EZWNvZGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX29yaWdpbmFsRWRpdG9yTW9kZWxzRGlzcG9zYWJsZXMuYWRkKHJlZik7XG5cdFx0XHRcdFx0dGhpcy5fb3JpZ2luYWxFZGl0b3JNb2RlbHNEaXNwb3NhYmxlcy5hZGQocmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHRoaXMudHJpZ2dlckRpZmYoKSkpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHF1aWNrRGlmZjtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107IC8vIHBvc3NpYmx5IGludmFsaWQgcmVmZXJlbmNlXG5cdFx0XHRcdH1cblx0XHRcdH0pKSkuZmxhdCgpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRoaXMuX3F1aWNrRGlmZnNQcm9taXNlLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcXVpY2tEaWZmc1Byb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldE9yaWdpbmFsUmVzb3VyY2UoKTogUHJvbWlzZTxRdWlja0RpZmZbXT4ge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0fVxuXHRcdGNvbnN0IHVyaSA9IHRoaXMuX21vZGVsLnJlc291cmNlO1xuXG5cdFx0Ly8gZGlzYWJsZSBkaXJ0eSBkaWZmIHdoZW4gZG9pbmcgY2hhdCBlZGl0c1xuXHRcdGNvbnN0IGlzQmVpbmdNb2RpZmllZEJ5Q2hhdEVkaXRzID0gdGhpcy5fY2hhdEVkaXRpbmdTZXJ2aWNlLmVkaXRpbmdTZXNzaW9uc09icy5nZXQoKVxuXHRcdFx0LnNvbWUoc2Vzc2lvbiA9PiBzZXNzaW9uLmdldEVudHJ5KHVyaSk/LnN0YXRlLmdldCgpID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKTtcblx0XHRpZiAoaXNCZWluZ01vZGlmaWVkQnlDaGF0RWRpdHMpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzU3luY2hyb25pemVkID0gdGhpcy5fbW9kZWwudGV4dEVkaXRvck1vZGVsID8gc2hvdWxkU3luY2hyb25pemVNb2RlbCh0aGlzLl9tb2RlbC50ZXh0RWRpdG9yTW9kZWwpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiB0aGlzLnF1aWNrRGlmZlNlcnZpY2UuZ2V0UXVpY2tEaWZmcyh1cmksIHRoaXMuX21vZGVsLmdldExhbmd1YWdlSWQoKSwgaXNTeW5jaHJvbml6ZWQpO1xuXHR9XG5cblx0ZmluZE5leHRDbG9zZXN0Q2hhbmdlKGxpbmVOdW1iZXI6IG51bWJlciwgaW5jbHVzaXZlID0gdHJ1ZSwgcHJvdmlkZXJJZD86IHN0cmluZyk6IG51bWJlciB7XG5cdFx0Y29uc3QgdmlzaWJsZVF1aWNrRGlmZklkcyA9IG5ldyBTZXQodGhpcy5xdWlja0RpZmZzXG5cdFx0XHQuZmlsdGVyKHF1aWNrRGlmZiA9PiB0aGlzLnF1aWNrRGlmZlNlcnZpY2UuaXNRdWlja0RpZmZQcm92aWRlclZpc2libGUocXVpY2tEaWZmLmlkKSlcblx0XHRcdC5tYXAocXVpY2tEaWZmID0+IHF1aWNrRGlmZi5pZCkpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmNoYW5nZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChwcm92aWRlcklkICYmIHRoaXMuY2hhbmdlc1tpXS5wcm92aWRlcklkICE9PSBwcm92aWRlcklkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTa2lwIHF1aWNrIGRpZmZzIHRoYXQgYXJlIG5vdCB2aXNpYmxlXG5cdFx0XHRpZiAoIXZpc2libGVRdWlja0RpZmZJZHMuaGFzKHRoaXMuY2hhbmdlc1tpXS5wcm92aWRlcklkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2hhbmdlID0gdGhpcy5jaGFuZ2VzW2ldLmNoYW5nZTtcblxuXHRcdFx0aWYgKGluY2x1c2l2ZSkge1xuXHRcdFx0XHRpZiAoZ2V0TW9kaWZpZWRFbmRMaW5lTnVtYmVyKGNoYW5nZSkgPj0gbGluZU51bWJlcikge1xuXHRcdFx0XHRcdHJldHVybiBpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoY2hhbmdlLm1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyID4gbGluZU51bWJlcikge1xuXHRcdFx0XHRcdHJldHVybiBpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRmaW5kUHJldmlvdXNDbG9zZXN0Q2hhbmdlKGxpbmVOdW1iZXI6IG51bWJlciwgaW5jbHVzaXZlID0gdHJ1ZSwgcHJvdmlkZXJJZD86IHN0cmluZyk6IG51bWJlciB7XG5cdFx0Y29uc3QgdmlzaWJsZVF1aWNrRGlmZklkcyA9IG5ldyBTZXQodGhpcy5xdWlja0RpZmZzXG5cdFx0XHQuZmlsdGVyKHF1aWNrRGlmZiA9PiB0aGlzLnF1aWNrRGlmZlNlcnZpY2UuaXNRdWlja0RpZmZQcm92aWRlclZpc2libGUocXVpY2tEaWZmLmlkKSlcblx0XHRcdC5tYXAocXVpY2tEaWZmID0+IHF1aWNrRGlmZi5pZCkpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuY2hhbmdlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0aWYgKHByb3ZpZGVySWQgJiYgdGhpcy5jaGFuZ2VzW2ldLnByb3ZpZGVySWQgIT09IHByb3ZpZGVySWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNraXAgcXVpY2sgZGlmZnMgdGhhdCBhcmUgbm90IHZpc2libGVcblx0XHRcdGlmICghdmlzaWJsZVF1aWNrRGlmZklkcy5oYXModGhpcy5jaGFuZ2VzW2ldLnByb3ZpZGVySWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjaGFuZ2UgPSB0aGlzLmNoYW5nZXNbaV0uY2hhbmdlO1xuXG5cdFx0XHRpZiAoaW5jbHVzaXZlKSB7XG5cdFx0XHRcdGlmIChjaGFuZ2UubW9kaWZpZWRTdGFydExpbmVOdW1iZXIgPD0gbGluZU51bWJlcikge1xuXHRcdFx0XHRcdHJldHVybiBpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoZ2V0TW9kaWZpZWRFbmRMaW5lTnVtYmVyKGNoYW5nZSkgPCBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jaGFuZ2VzLmxlbmd0aCAtIDE7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2VkID0gdHJ1ZTtcblxuXHRcdHRoaXMuX3F1aWNrRGlmZnMgPSBbXTtcblx0XHR0aGlzLl9kaWZmRGVsYXllci5jYW5jZWwoKTtcblx0XHR0aGlzLl9vcmlnaW5hbEVkaXRvck1vZGVscy5jbGVhcigpO1xuXHRcdHRoaXMuX3JlcG9zaXRvcnlEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxpQkFBaUIsNkJBQTZCO0FBQ3ZELFNBQVMsY0FBNEMsdUJBQTZDLHdCQUF3QjtBQUMxSCxTQUFTLFlBQVksZUFBZSxpQkFBNkIsMkJBQTJCO0FBQzVGLFNBQTRCLDRCQUE0QjtBQUN4RCxTQUFTLDJCQUEyQjtBQUdwQyxTQUFtQyx5QkFBeUI7QUFDNUQsU0FBcUIsOEJBQThCO0FBQ25ELFNBQVMsZ0JBQWdCLDBCQUEwQix5QkFBc0U7QUFDekgsU0FBUyx3QkFBd0I7QUFDakMsU0FBeUIsbUJBQW1CO0FB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
