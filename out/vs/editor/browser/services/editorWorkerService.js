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
import { timeout } from "../../../base/common/async.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { logOnceWebWorkerWarning } from "../../../base/common/worker/webWorker.js";
import { WebWorkerDescriptor } from "../../../platform/webWorker/browser/webWorkerDescriptor.js";
import { IWebWorkerService } from "../../../platform/webWorker/browser/webWorkerService.js";
import { Range } from "../../common/core/range.js";
import * as languages from "../../common/languages.js";
import { ILanguageConfigurationService } from "../../common/languages/languageConfigurationRegistry.js";
import { EditorWorker } from "../../common/services/editorWebWorker.js";
import { IModelService } from "../../common/services/model.js";
import { ITextResourceConfigurationService } from "../../common/services/textResourceConfiguration.js";
import { isNonEmptyArray } from "../../../base/common/arrays.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { canceled, onUnexpectedError } from "../../../base/common/errors.js";
import { ILanguageFeaturesService } from "../../common/services/languageFeatures.js";
import { MovedText } from "../../common/diff/linesDiffComputer.js";
import { DetailedLineRangeMapping, RangeMapping, LineRangeMapping } from "../../common/diff/rangeMapping.js";
import { LineRange } from "../../common/core/ranges/lineRange.js";
import { mainWindow } from "../../../base/browser/window.js";
import { WindowIntervalTimer } from "../../../base/browser/dom.js";
import { WorkerTextModelSyncClient } from "../../common/services/textModelSync/textModelSync.impl.js";
import { EditorWorkerHost } from "../../common/services/editorWorkerHost.js";
import { StringEdit } from "../../common/core/edits/stringEdit.js";
import { OffsetRange } from "../../common/core/ranges/offsetRange.js";
import { FileAccess } from "../../../base/common/network.js";
import { isCompletionsEnabledWithTextResourceConfig } from "../../common/services/completionsEnablement.js";
const STOP_WORKER_DELTA_TIME_MS = 5 * 60 * 1e3;
function canSyncModel(modelService, resource) {
  const model = modelService.getModel(resource);
  if (!model) {
    return false;
  }
  if (model.isTooLargeForSyncing()) {
    return false;
  }
  return true;
}
let EditorWorkerService = class extends Disposable {
  constructor(modelService, configurationService, logService, _languageConfigurationService, languageFeaturesService, _webWorkerService) {
    super();
    this._languageConfigurationService = _languageConfigurationService;
    this._webWorkerService = _webWorkerService;
    this._modelService = modelService;
    this._workerManager = this._register(new WorkerManager(EditorWorkerService.workerDescriptor, this._modelService, this._webWorkerService));
    this._logService = logService;
    this._register(languageFeaturesService.linkProvider.register({ language: "*", hasAccessToAllModels: true }, {
      provideLinks: async (model, token) => {
        if (!canSyncModel(this._modelService, model.uri)) {
          return Promise.resolve({ links: [] });
        }
        const worker = await this._workerWithResources([model.uri]);
        const links = await worker.$computeLinks(model.uri.toString());
        return links && { links };
      }
    }));
    this._register(languageFeaturesService.completionProvider.register("*", new WordBasedCompletionItemProvider(this._workerManager, configurationService, this._modelService, this._languageConfigurationService, this._logService, languageFeaturesService)));
  }
  canComputeUnicodeHighlights(uri) {
    return canSyncModel(this._modelService, uri);
  }
  async computedUnicodeHighlights(uri, options, range) {
    const worker = await this._workerWithResources([uri]);
    return worker.$computeUnicodeHighlights(uri.toString(), options, range);
  }
  async computeDiff(original, modified, options, algorithm) {
    const worker = await this._workerWithResources(
      [original, modified],
      /* forceLargeModels */
      true
    );
    const result = await worker.$computeDiff(original.toString(), modified.toString(), options, algorithm);
    if (!result) {
      return null;
    }
    const diff = {
      identical: result.identical,
      quitEarly: result.quitEarly,
      changes: toLineRangeMappings(result.changes),
      moves: result.moves.map((m) => new MovedText(
        new LineRangeMapping(new LineRange(m[0], m[1]), new LineRange(m[2], m[3])),
        toLineRangeMappings(m[4])
      ))
    };
    return diff;
    function toLineRangeMappings(changes) {
      return changes.map(
        (c) => new DetailedLineRangeMapping(
          new LineRange(c[0], c[1]),
          new LineRange(c[2], c[3]),
          c[4]?.map(
            (c2) => new RangeMapping(
              new Range(c2[0], c2[1], c2[2], c2[3]),
              new Range(c2[4], c2[5], c2[6], c2[7])
            )
          )
        )
      );
    }
  }
  canComputeDirtyDiff(original, modified) {
    return canSyncModel(this._modelService, original) && canSyncModel(this._modelService, modified);
  }
  async computeDirtyDiff(original, modified, ignoreTrimWhitespace) {
    const worker = await this._workerWithResources([original, modified]);
    return worker.$computeDirtyDiff(original.toString(), modified.toString(), ignoreTrimWhitespace);
  }
  async computeMoreMinimalEdits(resource, edits, pretty = false) {
    if (isNonEmptyArray(edits)) {
      if (!canSyncModel(this._modelService, resource)) {
        return Promise.resolve(edits);
      }
      const sw = StopWatch.create();
      const result = this._workerWithResources([resource]).then((worker) => worker.$computeMoreMinimalEdits(resource.toString(), edits, pretty));
      result.finally(() => this._logService.trace("FORMAT#computeMoreMinimalEdits", resource.toString(true), sw.elapsed()));
      return Promise.race([result, timeout(1e3).then(() => edits)]);
    } else {
      return Promise.resolve(void 0);
    }
  }
  computeHumanReadableDiff(resource, edits) {
    if (isNonEmptyArray(edits)) {
      if (!canSyncModel(this._modelService, resource)) {
        return Promise.resolve(edits);
      }
      const sw = StopWatch.create();
      const opts = { ignoreTrimWhitespace: false, maxComputationTimeMs: 1e3, computeMoves: false };
      const result = this._workerWithResources([resource]).then((worker) => worker.$computeHumanReadableDiff(resource.toString(), edits, opts)).catch((err) => {
        onUnexpectedError(err);
        return this.computeMoreMinimalEdits(resource, edits, true);
      });
      result.finally(() => this._logService.trace("FORMAT#computeHumanReadableDiff", resource.toString(true), sw.elapsed()));
      return result;
    } else {
      return Promise.resolve(void 0);
    }
  }
  async computeStringEditFromDiff(original, modified, options, algorithm) {
    try {
      const worker = await this._workerWithResources([]);
      const edit = await worker.$computeStringDiff(original, modified, options, algorithm);
      return StringEdit.fromJson(edit);
    } catch (e) {
      onUnexpectedError(e);
      return StringEdit.replace(OffsetRange.ofLength(original.length), modified);
    }
  }
  canNavigateValueSet(resource) {
    return canSyncModel(this._modelService, resource);
  }
  async navigateValueSet(resource, range, up) {
    const model = this._modelService.getModel(resource);
    if (!model) {
      return null;
    }
    const wordDefRegExp = this._languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getWordDefinition();
    const wordDef = wordDefRegExp.source;
    const wordDefFlags = wordDefRegExp.flags;
    const worker = await this._workerWithResources([resource]);
    return worker.$navigateValueSet(resource.toString(), range, up, wordDef, wordDefFlags);
  }
  canComputeWordRanges(resource) {
    return canSyncModel(this._modelService, resource);
  }
  async computeWordRanges(resource, range) {
    const model = this._modelService.getModel(resource);
    if (!model) {
      return Promise.resolve(null);
    }
    const wordDefRegExp = this._languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getWordDefinition();
    const wordDef = wordDefRegExp.source;
    const wordDefFlags = wordDefRegExp.flags;
    const worker = await this._workerWithResources([resource]);
    return worker.$computeWordRanges(resource.toString(), range, wordDef, wordDefFlags);
  }
  async findSectionHeaders(uri, options) {
    const worker = await this._workerWithResources([uri]);
    return worker.$findSectionHeaders(uri.toString(), options);
  }
  async computeDefaultDocumentColors(uri) {
    const worker = await this._workerWithResources([uri]);
    return worker.$computeDefaultDocumentColors(uri.toString());
  }
  async _workerWithResources(resources, forceLargeModels = false) {
    const worker = await this._workerManager.withWorker();
    return await worker.workerWithSyncedResources(resources, forceLargeModels);
  }
};
EditorWorkerService.workerDescriptor = new WebWorkerDescriptor({
  esmModuleLocation: () => FileAccess.asBrowserUri("vs/editor/common/services/editorWebWorkerMain.js"),
  esmModuleLocationBundler: () => new URL("../../common/services/editorWebWorkerMain.ts?esm", import.meta.url),
  label: "editorWorkerService"
});
EditorWorkerService = __decorateClass([
  __decorateParam(0, IModelService),
  __decorateParam(1, ITextResourceConfigurationService),
  __decorateParam(2, ILogService),
  __decorateParam(3, ILanguageConfigurationService),
  __decorateParam(4, ILanguageFeaturesService),
  __decorateParam(5, IWebWorkerService)
], EditorWorkerService);
class WordBasedCompletionItemProvider {
  constructor(workerManager, configurationService, modelService, languageConfigurationService, logService, languageFeaturesService) {
    this.languageConfigurationService = languageConfigurationService;
    this.logService = logService;
    this.languageFeaturesService = languageFeaturesService;
    this._debugDisplayName = "wordbasedCompletions";
    this._workerManager = workerManager;
    this._configurationService = configurationService;
    this._modelService = modelService;
  }
  async provideCompletionItems(model, position) {
    const config = this._configurationService.getValue(model.uri, position, "editor");
    if (config.wordBasedSuggestions === "off") {
      return void 0;
    }
    if (config.wordBasedSuggestions === "offWithInlineSuggestions" && this.languageFeaturesService.inlineCompletionsProvider.has(model) && isCompletionsEnabledWithTextResourceConfig(this._configurationService, model.uri, model.getLanguageId())) {
      return void 0;
    }
    const models = [];
    if (config.wordBasedSuggestions === "currentDocument") {
      if (canSyncModel(this._modelService, model.uri)) {
        models.push(model.uri);
      }
    } else {
      for (const candidate of this._modelService.getModels()) {
        if (!canSyncModel(this._modelService, candidate.uri)) {
          continue;
        }
        if (candidate === model) {
          models.unshift(candidate.uri);
        } else if (config.wordBasedSuggestions === "allDocuments" || candidate.getLanguageId() === model.getLanguageId()) {
          models.push(candidate.uri);
        }
      }
    }
    if (models.length === 0) {
      return void 0;
    }
    const wordDefRegExp = this.languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getWordDefinition();
    const word = model.getWordAtPosition(position);
    const replace = !word ? Range.fromPositions(position) : new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
    const insert = replace.setEndPosition(position.lineNumber, position.column);
    this.logService.trace("[WordBasedCompletionItemProvider]", `word: "${word?.word || ""}", wordDef: "${wordDefRegExp}", replace: [${replace.toString()}], insert: [${insert.toString()}]`);
    const client = await this._workerManager.withWorker();
    const data = await client.textualSuggest(models, word?.word, wordDefRegExp);
    if (!data) {
      return void 0;
    }
    return {
      duration: data.duration,
      suggestions: data.words.map((word2) => {
        return {
          kind: languages.CompletionItemKind.Text,
          label: word2,
          insertText: word2,
          range: { insert, replace }
        };
      })
    };
  }
}
let WorkerManager = class extends Disposable {
  constructor(_workerDescriptor, modelService, webWorkerService) {
    super();
    this._workerDescriptor = _workerDescriptor;
    this._modelService = modelService;
    this._webWorkerService = webWorkerService;
    this._editorWorkerClient = null;
    this._lastWorkerUsedTime = (/* @__PURE__ */ new Date()).getTime();
    const stopWorkerInterval = this._register(new WindowIntervalTimer());
    stopWorkerInterval.cancelAndSet(() => this._checkStopIdleWorker(), Math.round(STOP_WORKER_DELTA_TIME_MS / 2), mainWindow);
    this._register(this._modelService.onModelRemoved((_) => this._checkStopEmptyWorker()));
  }
  dispose() {
    if (this._editorWorkerClient) {
      this._editorWorkerClient.dispose();
      this._editorWorkerClient = null;
    }
    super.dispose();
  }
  /**
   * Check if the model service has no more models and stop the worker if that is the case.
   */
  _checkStopEmptyWorker() {
    if (!this._editorWorkerClient) {
      return;
    }
    const models = this._modelService.getModels();
    if (models.length === 0) {
      this._editorWorkerClient.dispose();
      this._editorWorkerClient = null;
    }
  }
  /**
   * Check if the worker has been idle for a while and then stop it.
   */
  _checkStopIdleWorker() {
    if (!this._editorWorkerClient) {
      return;
    }
    const timeSinceLastWorkerUsedTime = (/* @__PURE__ */ new Date()).getTime() - this._lastWorkerUsedTime;
    if (timeSinceLastWorkerUsedTime > STOP_WORKER_DELTA_TIME_MS) {
      this._editorWorkerClient.dispose();
      this._editorWorkerClient = null;
    }
  }
  withWorker() {
    this._lastWorkerUsedTime = (/* @__PURE__ */ new Date()).getTime();
    if (!this._editorWorkerClient) {
      this._editorWorkerClient = new EditorWorkerClient(this._workerDescriptor, false, this._modelService, this._webWorkerService);
    }
    return Promise.resolve(this._editorWorkerClient);
  }
};
WorkerManager = __decorateClass([
  __decorateParam(1, IModelService),
  __decorateParam(2, IWebWorkerService)
], WorkerManager);
class SynchronousWorkerClient {
  constructor(instance) {
    this._instance = instance;
    this.proxy = this._instance;
  }
  dispose() {
    this._instance.dispose();
  }
  setChannel(channel, handler) {
    throw new Error(`Not supported`);
  }
  getChannel(channel) {
    throw new Error(`Not supported`);
  }
}
let EditorWorkerClient = class extends Disposable {
  constructor(_workerDescriptorOrWorker, keepIdleModels, modelService, webWorkerService) {
    super();
    this._workerDescriptorOrWorker = _workerDescriptorOrWorker;
    this._disposed = false;
    this._modelService = modelService;
    this._webWorkerService = webWorkerService;
    this._keepIdleModels = keepIdleModels;
    this._worker = null;
    this._modelManager = null;
  }
  // foreign host request
  fhr(method, args) {
    throw new Error(`Not implemented!`);
  }
  _getOrCreateWorker() {
    if (!this._worker) {
      try {
        this._worker = this._register(this._webWorkerService.createWorkerClient(this._workerDescriptorOrWorker));
        EditorWorkerHost.setChannel(this._worker, this._createEditorWorkerHost());
      } catch (err) {
        logOnceWebWorkerWarning(err);
        this._worker = this._createFallbackLocalWorker();
      }
    }
    return this._worker;
  }
  async _getProxy() {
    try {
      const proxy = this._getOrCreateWorker().proxy;
      await proxy.$ping();
      return proxy;
    } catch (err) {
      logOnceWebWorkerWarning(err);
      this._worker = this._createFallbackLocalWorker();
      return this._worker.proxy;
    }
  }
  _createFallbackLocalWorker() {
    return new SynchronousWorkerClient(new EditorWorker(null));
  }
  _createEditorWorkerHost() {
    return {
      $fhr: (method, args) => this.fhr(method, args)
    };
  }
  _getOrCreateModelManager(proxy) {
    if (!this._modelManager) {
      this._modelManager = this._register(new WorkerTextModelSyncClient(proxy, this._modelService, this._keepIdleModels));
    }
    return this._modelManager;
  }
  async workerWithSyncedResources(resources, forceLargeModels = false) {
    if (this._disposed) {
      return Promise.reject(canceled());
    }
    const proxy = await this._getProxy();
    this._getOrCreateModelManager(proxy).ensureSyncedResources(resources, forceLargeModels);
    return proxy;
  }
  async textualSuggest(resources, leadingWord, wordDefRegExp) {
    const proxy = await this.workerWithSyncedResources(resources);
    const wordDef = wordDefRegExp.source;
    const wordDefFlags = wordDefRegExp.flags;
    return proxy.$textualSuggest(resources.map((r) => r.toString()), leadingWord, wordDef, wordDefFlags);
  }
  dispose() {
    super.dispose();
    this._disposed = true;
  }
};
EditorWorkerClient = __decorateClass([
  __decorateParam(2, IModelService),
  __decorateParam(3, IWebWorkerService)
], EditorWorkerClient);
export {
  EditorWorkerClient,
  EditorWorkerService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2VkaXRvcldvcmtlclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvZ09uY2VXZWJXb3JrZXJXYXJuaW5nLCBJV2ViV29ya2VyQ2xpZW50LCBQcm94aWVkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vd29ya2VyL3dlYldvcmtlci5qcyc7XG5pbXBvcnQgeyBXZWJXb3JrZXJEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd2ViV29ya2VyL2Jyb3dzZXIvd2ViV29ya2VyRGVzY3JpcHRvci5qcyc7XG5pbXBvcnQgeyBJV2ViV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dlYldvcmtlci9icm93c2VyL3dlYldvcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRWRpdG9yV29ya2VyIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL2VkaXRvcldlYldvcmtlci5qcyc7XG5pbXBvcnQgeyBEaWZmQWxnb3JpdGhtTmFtZSwgSUVkaXRvcldvcmtlclNlcnZpY2UsIElMaW5lQ2hhbmdlLCBJVW5pY29kZUhpZ2hsaWdodHNSZXN1bHQgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgaXNOb25FbXB0eUFycmF5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IGNhbmNlbGVkLCBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL3VuaWNvZGVUZXh0TW9kZWxIaWdobGlnaHRlci5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhbmdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2RpZmYvbGVnYWN5TGluZXNEaWZmQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgSURvY3VtZW50RGlmZiwgSURvY3VtZW50RGlmZlByb3ZpZGVyT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9kaWZmL2RvY3VtZW50RGlmZlByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElMaW5lc0RpZmZDb21wdXRlck9wdGlvbnMsIE1vdmVkVGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9kaWZmL2xpbmVzRGlmZkNvbXB1dGVyLmpzJztcbmltcG9ydCB7IERldGFpbGVkTGluZVJhbmdlTWFwcGluZywgUmFuZ2VNYXBwaW5nLCBMaW5lUmFuZ2VNYXBwaW5nIH0gZnJvbSAnLi4vLi4vY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VjdGlvbkhlYWRlciwgRmluZFNlY3Rpb25IZWFkZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL2ZpbmRTZWN0aW9uSGVhZGVycy5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBXaW5kb3dJbnRlcnZhbFRpbWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBXb3JrZXJUZXh0TW9kZWxTeW5jQ2xpZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL3RleHRNb2RlbFN5bmMvdGV4dE1vZGVsU3luYy5pbXBsLmpzJztcbmltcG9ydCB7IEVkaXRvcldvcmtlckhvc3QgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VySG9zdC5qcyc7XG5pbXBvcnQgeyBTdHJpbmdFZGl0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcmUvZWRpdHMvc3RyaW5nRWRpdC5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc0NvbXBsZXRpb25zRW5hYmxlZFdpdGhUZXh0UmVzb3VyY2VDb25maWcgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZXMvY29tcGxldGlvbnNFbmFibGVtZW50LmpzJztcblxuLyoqXG4gKiBTdG9wIHRoZSB3b3JrZXIgaWYgaXQgd2FzIG5vdCBuZWVkZWQgZm9yIDUgbWluLlxuICovXG5jb25zdCBTVE9QX1dPUktFUl9ERUxUQV9USU1FX01TID0gNSAqIDYwICogMTAwMDtcblxuZnVuY3Rpb24gY2FuU3luY01vZGVsKG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSwgcmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRjb25zdCBtb2RlbCA9IG1vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdGlmICghbW9kZWwpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKG1vZGVsLmlzVG9vTGFyZ2VGb3JTeW5jaW5nKCkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBjbGFzcyBFZGl0b3JXb3JrZXJTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JXb3JrZXJTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHdvcmtlckRlc2NyaXB0b3IgPSBuZXcgV2ViV29ya2VyRGVzY3JpcHRvcih7XG5cdFx0ZXNtTW9kdWxlTG9jYXRpb246ICgpID0+IEZpbGVBY2Nlc3MuYXNCcm93c2VyVXJpKCd2cy9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2VkaXRvcldlYldvcmtlck1haW4uanMnKSxcblx0XHRlc21Nb2R1bGVMb2NhdGlvbkJ1bmRsZXI6ICgpID0+IG5ldyBVUkwoJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXZWJXb3JrZXJNYWluLnRzP2VzbScsIGltcG9ydC5tZXRhLnVybCksXG5cdFx0bGFiZWw6ICdlZGl0b3JXb3JrZXJTZXJ2aWNlJ1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtlck1hbmFnZXI6IFdvcmtlck1hbmFnZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTW9kZWxTZXJ2aWNlIG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElXZWJXb3JrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dlYldvcmtlclNlcnZpY2U6IElXZWJXb3JrZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX21vZGVsU2VydmljZSA9IG1vZGVsU2VydmljZTtcblxuXHRcdHRoaXMuX3dvcmtlck1hbmFnZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgV29ya2VyTWFuYWdlcihFZGl0b3JXb3JrZXJTZXJ2aWNlLndvcmtlckRlc2NyaXB0b3IsIHRoaXMuX21vZGVsU2VydmljZSwgdGhpcy5fd2ViV29ya2VyU2VydmljZSkpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UgPSBsb2dTZXJ2aWNlO1xuXG5cdFx0Ly8gcmVnaXN0ZXIgZGVmYXVsdCBsaW5rLXByb3ZpZGVyIGFuZCBkZWZhdWx0IGNvbXBsZXRpb25zLXByb3ZpZGVyXG5cdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UubGlua1Byb3ZpZGVyLnJlZ2lzdGVyKHsgbGFuZ3VhZ2U6ICcqJywgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwge1xuXHRcdFx0cHJvdmlkZUxpbmtzOiBhc3luYyAobW9kZWwsIHRva2VuKSA9PiB7XG5cdFx0XHRcdGlmICghY2FuU3luY01vZGVsKHRoaXMuX21vZGVsU2VydmljZSwgbW9kZWwudXJpKSkge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBsaW5rczogW10gfSk7IC8vIEZpbGUgdG9vIGxhcmdlXG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgd29ya2VyID0gYXdhaXQgdGhpcy5fd29ya2VyV2l0aFJlc291cmNlcyhbbW9kZWwudXJpXSk7XG5cdFx0XHRcdGNvbnN0IGxpbmtzID0gYXdhaXQgd29ya2VyLiRjb21wdXRlTGlua3MobW9kZWwudXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRyZXR1cm4gbGlua3MgJiYgeyBsaW5rcyB9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoJyonLCBuZXcgV29yZEJhc2VkQ29tcGxldGlvbkl0ZW1Qcm92aWRlcih0aGlzLl93b3JrZXJNYW5hZ2VyLCBjb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5fbW9kZWxTZXJ2aWNlLCB0aGlzLl9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSkpKTtcblx0fVxuXG5cblx0cHVibGljIGNhbkNvbXB1dGVVbmljb2RlSGlnaGxpZ2h0cyh1cmk6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBjYW5TeW5jTW9kZWwodGhpcy5fbW9kZWxTZXJ2aWNlLCB1cmkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGNvbXB1dGVkVW5pY29kZUhpZ2hsaWdodHModXJpOiBVUkksIG9wdGlvbnM6IFVuaWNvZGVIaWdobGlnaHRlck9wdGlvbnMsIHJhbmdlPzogSVJhbmdlKTogUHJvbWlzZTxJVW5pY29kZUhpZ2hsaWdodHNSZXN1bHQ+IHtcblx0XHRjb25zdCB3b3JrZXIgPSBhd2FpdCB0aGlzLl93b3JrZXJXaXRoUmVzb3VyY2VzKFt1cmldKTtcblx0XHRyZXR1cm4gd29ya2VyLiRjb21wdXRlVW5pY29kZUhpZ2hsaWdodHModXJpLnRvU3RyaW5nKCksIG9wdGlvbnMsIHJhbmdlKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjb21wdXRlRGlmZihvcmlnaW5hbDogVVJJLCBtb2RpZmllZDogVVJJLCBvcHRpb25zOiBJRG9jdW1lbnREaWZmUHJvdmlkZXJPcHRpb25zLCBhbGdvcml0aG06IERpZmZBbGdvcml0aG1OYW1lKTogUHJvbWlzZTxJRG9jdW1lbnREaWZmIHwgbnVsbD4ge1xuXHRcdGNvbnN0IHdvcmtlciA9IGF3YWl0IHRoaXMuX3dvcmtlcldpdGhSZXNvdXJjZXMoW29yaWdpbmFsLCBtb2RpZmllZF0sIC8qIGZvcmNlTGFyZ2VNb2RlbHMgKi90cnVlKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB3b3JrZXIuJGNvbXB1dGVEaWZmKG9yaWdpbmFsLnRvU3RyaW5nKCksIG1vZGlmaWVkLnRvU3RyaW5nKCksIG9wdGlvbnMsIGFsZ29yaXRobSk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHQvLyBDb252ZXJ0IGZyb20gc3BhY2UgZWZmaWNpZW50IEpTT04gZGF0YSB0byByaWNoIG9iamVjdHMuXG5cdFx0Y29uc3QgZGlmZjogSURvY3VtZW50RGlmZiA9IHtcblx0XHRcdGlkZW50aWNhbDogcmVzdWx0LmlkZW50aWNhbCxcblx0XHRcdHF1aXRFYXJseTogcmVzdWx0LnF1aXRFYXJseSxcblx0XHRcdGNoYW5nZXM6IHRvTGluZVJhbmdlTWFwcGluZ3MocmVzdWx0LmNoYW5nZXMpLFxuXHRcdFx0bW92ZXM6IHJlc3VsdC5tb3Zlcy5tYXAobSA9PiBuZXcgTW92ZWRUZXh0KFxuXHRcdFx0XHRuZXcgTGluZVJhbmdlTWFwcGluZyhuZXcgTGluZVJhbmdlKG1bMF0sIG1bMV0pLCBuZXcgTGluZVJhbmdlKG1bMl0sIG1bM10pKSxcblx0XHRcdFx0dG9MaW5lUmFuZ2VNYXBwaW5ncyhtWzRdKVxuXHRcdFx0KSlcblx0XHR9O1xuXHRcdHJldHVybiBkaWZmO1xuXG5cdFx0ZnVuY3Rpb24gdG9MaW5lUmFuZ2VNYXBwaW5ncyhjaGFuZ2VzOiByZWFkb25seSBJTGluZUNoYW5nZVtdKTogcmVhZG9ubHkgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW10ge1xuXHRcdFx0cmV0dXJuIGNoYW5nZXMubWFwKFxuXHRcdFx0XHQoYykgPT4gbmV3IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyhcblx0XHRcdFx0XHRuZXcgTGluZVJhbmdlKGNbMF0sIGNbMV0pLFxuXHRcdFx0XHRcdG5ldyBMaW5lUmFuZ2UoY1syXSwgY1szXSksXG5cdFx0XHRcdFx0Y1s0XT8ubWFwKFxuXHRcdFx0XHRcdFx0KGMpID0+IG5ldyBSYW5nZU1hcHBpbmcoXG5cdFx0XHRcdFx0XHRcdG5ldyBSYW5nZShjWzBdLCBjWzFdLCBjWzJdLCBjWzNdKSxcblx0XHRcdFx0XHRcdFx0bmV3IFJhbmdlKGNbNF0sIGNbNV0sIGNbNl0sIGNbN10pXG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjYW5Db21wdXRlRGlydHlEaWZmKG9yaWdpbmFsOiBVUkksIG1vZGlmaWVkOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKGNhblN5bmNNb2RlbCh0aGlzLl9tb2RlbFNlcnZpY2UsIG9yaWdpbmFsKSAmJiBjYW5TeW5jTW9kZWwodGhpcy5fbW9kZWxTZXJ2aWNlLCBtb2RpZmllZCkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGNvbXB1dGVEaXJ0eURpZmYob3JpZ2luYWw6IFVSSSwgbW9kaWZpZWQ6IFVSSSwgaWdub3JlVHJpbVdoaXRlc3BhY2U6IGJvb2xlYW4pOiBQcm9taXNlPElDaGFuZ2VbXSB8IG51bGw+IHtcblx0XHRjb25zdCB3b3JrZXIgPSBhd2FpdCB0aGlzLl93b3JrZXJXaXRoUmVzb3VyY2VzKFtvcmlnaW5hbCwgbW9kaWZpZWRdKTtcblx0XHRyZXR1cm4gd29ya2VyLiRjb21wdXRlRGlydHlEaWZmKG9yaWdpbmFsLnRvU3RyaW5nKCksIG1vZGlmaWVkLnRvU3RyaW5nKCksIGlnbm9yZVRyaW1XaGl0ZXNwYWNlKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjb21wdXRlTW9yZU1pbmltYWxFZGl0cyhyZXNvdXJjZTogVVJJLCBlZGl0czogbGFuZ3VhZ2VzLlRleHRFZGl0W10gfCBudWxsIHwgdW5kZWZpbmVkLCBwcmV0dHk6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8bGFuZ3VhZ2VzLlRleHRFZGl0W10gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoaXNOb25FbXB0eUFycmF5KGVkaXRzKSkge1xuXHRcdFx0aWYgKCFjYW5TeW5jTW9kZWwodGhpcy5fbW9kZWxTZXJ2aWNlLCByZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShlZGl0cyk7IC8vIEZpbGUgdG9vIGxhcmdlXG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdyA9IFN0b3BXYXRjaC5jcmVhdGUoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX3dvcmtlcldpdGhSZXNvdXJjZXMoW3Jlc291cmNlXSkudGhlbih3b3JrZXIgPT4gd29ya2VyLiRjb21wdXRlTW9yZU1pbmltYWxFZGl0cyhyZXNvdXJjZS50b1N0cmluZygpLCBlZGl0cywgcHJldHR5KSk7XG5cdFx0XHRyZXN1bHQuZmluYWxseSgoKSA9PiB0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdGT1JNQVQjY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHMnLCByZXNvdXJjZS50b1N0cmluZyh0cnVlKSwgc3cuZWxhcHNlZCgpKSk7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yYWNlKFtyZXN1bHQsIHRpbWVvdXQoMTAwMCkudGhlbigoKSA9PiBlZGl0cyldKTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNvbXB1dGVIdW1hblJlYWRhYmxlRGlmZihyZXNvdXJjZTogVVJJLCBlZGl0czogbGFuZ3VhZ2VzLlRleHRFZGl0W10gfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxsYW5ndWFnZXMuVGV4dEVkaXRbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChpc05vbkVtcHR5QXJyYXkoZWRpdHMpKSB7XG5cdFx0XHRpZiAoIWNhblN5bmNNb2RlbCh0aGlzLl9tb2RlbFNlcnZpY2UsIHJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGVkaXRzKTsgLy8gRmlsZSB0b28gbGFyZ2Vcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN3ID0gU3RvcFdhdGNoLmNyZWF0ZSgpO1xuXHRcdFx0Y29uc3Qgb3B0czogSUxpbmVzRGlmZkNvbXB1dGVyT3B0aW9ucyA9IHsgaWdub3JlVHJpbVdoaXRlc3BhY2U6IGZhbHNlLCBtYXhDb21wdXRhdGlvblRpbWVNczogMTAwMCwgY29tcHV0ZU1vdmVzOiBmYWxzZSB9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gKFxuXHRcdFx0XHR0aGlzLl93b3JrZXJXaXRoUmVzb3VyY2VzKFtyZXNvdXJjZV0pXG5cdFx0XHRcdFx0LnRoZW4od29ya2VyID0+IHdvcmtlci4kY29tcHV0ZUh1bWFuUmVhZGFibGVEaWZmKHJlc291cmNlLnRvU3RyaW5nKCksIGVkaXRzLCBvcHRzKSlcblx0XHRcdFx0XHQuY2F0Y2goKGVycikgPT4ge1xuXHRcdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdFx0XHRcdC8vIEluIGNhc2Ugb2YgYW4gZXhjZXB0aW9uLCBmYWxsIGJhY2sgdG8gY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHNcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmNvbXB1dGVNb3JlTWluaW1hbEVkaXRzKHJlc291cmNlLCBlZGl0cywgdHJ1ZSk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdCk7XG5cdFx0XHRyZXN1bHQuZmluYWxseSgoKSA9PiB0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdGT1JNQVQjY29tcHV0ZUh1bWFuUmVhZGFibGVEaWZmJywgcmVzb3VyY2UudG9TdHJpbmcodHJ1ZSksIHN3LmVsYXBzZWQoKSkpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGNvbXB1dGVTdHJpbmdFZGl0RnJvbURpZmYob3JpZ2luYWw6IHN0cmluZywgbW9kaWZpZWQ6IHN0cmluZywgb3B0aW9uczogeyBtYXhDb21wdXRhdGlvblRpbWVNczogbnVtYmVyIH0sIGFsZ29yaXRobTogRGlmZkFsZ29yaXRobU5hbWUpOiBQcm9taXNlPFN0cmluZ0VkaXQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgd29ya2VyID0gYXdhaXQgdGhpcy5fd29ya2VyV2l0aFJlc291cmNlcyhbXSk7XG5cdFx0XHRjb25zdCBlZGl0ID0gYXdhaXQgd29ya2VyLiRjb21wdXRlU3RyaW5nRGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIG9wdGlvbnMsIGFsZ29yaXRobSk7XG5cdFx0XHRyZXR1cm4gU3RyaW5nRWRpdC5mcm9tSnNvbihlZGl0KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlKTtcblx0XHRcdHJldHVybiBTdHJpbmdFZGl0LnJlcGxhY2UoT2Zmc2V0UmFuZ2Uub2ZMZW5ndGgob3JpZ2luYWwubGVuZ3RoKSwgbW9kaWZpZWQpOyAvLyBhcHByb3hpbWF0aW9uXG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNhbk5hdmlnYXRlVmFsdWVTZXQocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoY2FuU3luY01vZGVsKHRoaXMuX21vZGVsU2VydmljZSwgcmVzb3VyY2UpKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBuYXZpZ2F0ZVZhbHVlU2V0KHJlc291cmNlOiBVUkksIHJhbmdlOiBJUmFuZ2UsIHVwOiBib29sZWFuKTogUHJvbWlzZTxsYW5ndWFnZXMuSUlucGxhY2VSZXBsYWNlU3VwcG9ydFJlc3VsdCB8IG51bGw+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHdvcmREZWZSZWdFeHAgPSB0aGlzLl9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihtb2RlbC5nZXRMYW5ndWFnZUlkKCkpLmdldFdvcmREZWZpbml0aW9uKCk7XG5cdFx0Y29uc3Qgd29yZERlZiA9IHdvcmREZWZSZWdFeHAuc291cmNlO1xuXHRcdGNvbnN0IHdvcmREZWZGbGFncyA9IHdvcmREZWZSZWdFeHAuZmxhZ3M7XG5cdFx0Y29uc3Qgd29ya2VyID0gYXdhaXQgdGhpcy5fd29ya2VyV2l0aFJlc291cmNlcyhbcmVzb3VyY2VdKTtcblx0XHRyZXR1cm4gd29ya2VyLiRuYXZpZ2F0ZVZhbHVlU2V0KHJlc291cmNlLnRvU3RyaW5nKCksIHJhbmdlLCB1cCwgd29yZERlZiwgd29yZERlZkZsYWdzKTtcblx0fVxuXG5cdHB1YmxpYyBjYW5Db21wdXRlV29yZFJhbmdlcyhyZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGNhblN5bmNNb2RlbCh0aGlzLl9tb2RlbFNlcnZpY2UsIHJlc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjb21wdXRlV29yZFJhbmdlcyhyZXNvdXJjZTogVVJJLCByYW5nZTogSVJhbmdlKTogUHJvbWlzZTx7IFt3b3JkOiBzdHJpbmddOiBJUmFuZ2VbXSB9IHwgbnVsbD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdH1cblx0XHRjb25zdCB3b3JkRGVmUmVnRXhwID0gdGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKS5nZXRXb3JkRGVmaW5pdGlvbigpO1xuXHRcdGNvbnN0IHdvcmREZWYgPSB3b3JkRGVmUmVnRXhwLnNvdXJjZTtcblx0XHRjb25zdCB3b3JkRGVmRmxhZ3MgPSB3b3JkRGVmUmVnRXhwLmZsYWdzO1xuXHRcdGNvbnN0IHdvcmtlciA9IGF3YWl0IHRoaXMuX3dvcmtlcldpdGhSZXNvdXJjZXMoW3Jlc291cmNlXSk7XG5cdFx0cmV0dXJuIHdvcmtlci4kY29tcHV0ZVdvcmRSYW5nZXMocmVzb3VyY2UudG9TdHJpbmcoKSwgcmFuZ2UsIHdvcmREZWYsIHdvcmREZWZGbGFncyk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZmluZFNlY3Rpb25IZWFkZXJzKHVyaTogVVJJLCBvcHRpb25zOiBGaW5kU2VjdGlvbkhlYWRlck9wdGlvbnMpOiBQcm9taXNlPFNlY3Rpb25IZWFkZXJbXT4ge1xuXHRcdGNvbnN0IHdvcmtlciA9IGF3YWl0IHRoaXMuX3dvcmtlcldpdGhSZXNvdXJjZXMoW3VyaV0pO1xuXHRcdHJldHVybiB3b3JrZXIuJGZpbmRTZWN0aW9uSGVhZGVycyh1cmkudG9TdHJpbmcoKSwgb3B0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgY29tcHV0ZURlZmF1bHREb2N1bWVudENvbG9ycyh1cmk6IFVSSSk6IFByb21pc2U8bGFuZ3VhZ2VzLklDb2xvckluZm9ybWF0aW9uW10gfCBudWxsPiB7XG5cdFx0Y29uc3Qgd29ya2VyID0gYXdhaXQgdGhpcy5fd29ya2VyV2l0aFJlc291cmNlcyhbdXJpXSk7XG5cdFx0cmV0dXJuIHdvcmtlci4kY29tcHV0ZURlZmF1bHREb2N1bWVudENvbG9ycyh1cmkudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF93b3JrZXJXaXRoUmVzb3VyY2VzKHJlc291cmNlczogVVJJW10sIGZvcmNlTGFyZ2VNb2RlbHM6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8UHJveGllZDxFZGl0b3JXb3JrZXI+PiB7XG5cdFx0Y29uc3Qgd29ya2VyID0gYXdhaXQgdGhpcy5fd29ya2VyTWFuYWdlci53aXRoV29ya2VyKCk7XG5cdFx0cmV0dXJuIGF3YWl0IHdvcmtlci53b3JrZXJXaXRoU3luY2VkUmVzb3VyY2VzKHJlc291cmNlcywgZm9yY2VMYXJnZU1vZGVscyk7XG5cdH1cbn1cblxuY2xhc3MgV29yZEJhc2VkQ29tcGxldGlvbkl0ZW1Qcm92aWRlciBpbXBsZW1lbnRzIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbVByb3ZpZGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93b3JrZXJNYW5hZ2VyOiBXb3JrZXJNYW5hZ2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2U7XG5cblx0cmVhZG9ubHkgX2RlYnVnRGlzcGxheU5hbWUgPSAnd29yZGJhc2VkQ29tcGxldGlvbnMnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHdvcmtlck1hbmFnZXI6IFdvcmtlck1hbmFnZXIsXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fd29ya2VyTWFuYWdlciA9IHdvcmtlck1hbmFnZXI7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UgPSBjb25maWd1cmF0aW9uU2VydmljZTtcblx0XHR0aGlzLl9tb2RlbFNlcnZpY2UgPSBtb2RlbFNlcnZpY2U7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24pOiBQcm9taXNlPGxhbmd1YWdlcy5Db21wbGV0aW9uTGlzdCB8IHVuZGVmaW5lZD4ge1xuXHRcdHR5cGUgV29yZEJhc2VkU3VnZ2VzdGlvbnNDb25maWcgPSB7XG5cdFx0XHR3b3JkQmFzZWRTdWdnZXN0aW9ucz86ICdvZmYnIHwgJ2N1cnJlbnREb2N1bWVudCcgfCAnbWF0Y2hpbmdEb2N1bWVudHMnIHwgJ2FsbERvY3VtZW50cycgfCAnb2ZmV2l0aElubGluZVN1Z2dlc3Rpb25zJztcblx0XHR9O1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFdvcmRCYXNlZFN1Z2dlc3Rpb25zQ29uZmlnPihtb2RlbC51cmksIHBvc2l0aW9uLCAnZWRpdG9yJyk7XG5cdFx0aWYgKGNvbmZpZy53b3JkQmFzZWRTdWdnZXN0aW9ucyA9PT0gJ29mZicpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbmZpZy53b3JkQmFzZWRTdWdnZXN0aW9ucyA9PT0gJ29mZldpdGhJbmxpbmVTdWdnZXN0aW9ucydcblx0XHRcdCYmIHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5saW5lQ29tcGxldGlvbnNQcm92aWRlci5oYXMobW9kZWwpXG5cdFx0XHQmJiBpc0NvbXBsZXRpb25zRW5hYmxlZFdpdGhUZXh0UmVzb3VyY2VDb25maWcodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIG1vZGVsLnVyaSwgbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbHM6IFVSSVtdID0gW107XG5cdFx0aWYgKGNvbmZpZy53b3JkQmFzZWRTdWdnZXN0aW9ucyA9PT0gJ2N1cnJlbnREb2N1bWVudCcpIHtcblx0XHRcdC8vIG9ubHkgY3VycmVudCBmaWxlIGFuZCBvbmx5IGlmIG5vdCB0b28gbGFyZ2Vcblx0XHRcdGlmIChjYW5TeW5jTW9kZWwodGhpcy5fbW9kZWxTZXJ2aWNlLCBtb2RlbC51cmkpKSB7XG5cdFx0XHRcdG1vZGVscy5wdXNoKG1vZGVsLnVyaSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGVpdGhlciBhbGwgZmlsZXMgb3IgZmlsZXMgb2Ygc2FtZSBsYW5ndWFnZVxuXHRcdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVscygpKSB7XG5cdFx0XHRcdGlmICghY2FuU3luY01vZGVsKHRoaXMuX21vZGVsU2VydmljZSwgY2FuZGlkYXRlLnVyaSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY2FuZGlkYXRlID09PSBtb2RlbCkge1xuXHRcdFx0XHRcdG1vZGVscy51bnNoaWZ0KGNhbmRpZGF0ZS51cmkpO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAoY29uZmlnLndvcmRCYXNlZFN1Z2dlc3Rpb25zID09PSAnYWxsRG9jdW1lbnRzJyB8fCBjYW5kaWRhdGUuZ2V0TGFuZ3VhZ2VJZCgpID09PSBtb2RlbC5nZXRMYW5ndWFnZUlkKCkpIHtcblx0XHRcdFx0XHRtb2RlbHMucHVzaChjYW5kaWRhdGUudXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChtb2RlbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBGaWxlIHRvbyBsYXJnZSwgbm8gb3RoZXIgZmlsZXNcblx0XHR9XG5cblx0XHRjb25zdCB3b3JkRGVmUmVnRXhwID0gdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihtb2RlbC5nZXRMYW5ndWFnZUlkKCkpLmdldFdvcmREZWZpbml0aW9uKCk7XG5cdFx0Y29uc3Qgd29yZCA9IG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRjb25zdCByZXBsYWNlID0gIXdvcmQgPyBSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uKSA6IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCB3b3JkLnN0YXJ0Q29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCB3b3JkLmVuZENvbHVtbik7XG5cdFx0Y29uc3QgaW5zZXJ0ID0gcmVwbGFjZS5zZXRFbmRQb3NpdGlvbihwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pO1xuXG5cdFx0Ly8gVHJhY2UgbG9nZ2luZyBhYm91dCB0aGUgd29yZCBhbmQgcmVwbGFjZS9pbnNlcnQgcmFuZ2VzXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbV29yZEJhc2VkQ29tcGxldGlvbkl0ZW1Qcm92aWRlcl0nLCBgd29yZDogXCIke3dvcmQ/LndvcmQgfHwgJyd9XCIsIHdvcmREZWY6IFwiJHt3b3JkRGVmUmVnRXhwfVwiLCByZXBsYWNlOiBbJHtyZXBsYWNlLnRvU3RyaW5nKCl9XSwgaW5zZXJ0OiBbJHtpbnNlcnQudG9TdHJpbmcoKX1dYCk7XG5cblx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCB0aGlzLl93b3JrZXJNYW5hZ2VyLndpdGhXb3JrZXIoKTtcblx0XHRjb25zdCBkYXRhID0gYXdhaXQgY2xpZW50LnRleHR1YWxTdWdnZXN0KG1vZGVscywgd29yZD8ud29yZCwgd29yZERlZlJlZ0V4cCk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRkdXJhdGlvbjogZGF0YS5kdXJhdGlvbixcblx0XHRcdHN1Z2dlc3Rpb25zOiBkYXRhLndvcmRzLm1hcCgod29yZCk6IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbSA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0a2luZDogbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0XHRcdGxhYmVsOiB3b3JkLFxuXHRcdFx0XHRcdGluc2VydFRleHQ6IHdvcmQsXG5cdFx0XHRcdFx0cmFuZ2U6IHsgaW5zZXJ0LCByZXBsYWNlIH1cblx0XHRcdFx0fTtcblx0XHRcdH0pLFxuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgV29ya2VyTWFuYWdlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfd2ViV29ya2VyU2VydmljZTogSVdlYldvcmtlclNlcnZpY2U7XG5cdHByaXZhdGUgX2VkaXRvcldvcmtlckNsaWVudDogRWRpdG9yV29ya2VyQ2xpZW50IHwgbnVsbDtcblx0cHJpdmF0ZSBfbGFzdFdvcmtlclVzZWRUaW1lOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfd29ya2VyRGVzY3JpcHRvcjogV2ViV29ya2VyRGVzY3JpcHRvcixcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElXZWJXb3JrZXJTZXJ2aWNlIHdlYldvcmtlclNlcnZpY2U6IElXZWJXb3JrZXJTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbW9kZWxTZXJ2aWNlID0gbW9kZWxTZXJ2aWNlO1xuXHRcdHRoaXMuX3dlYldvcmtlclNlcnZpY2UgPSB3ZWJXb3JrZXJTZXJ2aWNlO1xuXHRcdHRoaXMuX2VkaXRvcldvcmtlckNsaWVudCA9IG51bGw7XG5cdFx0dGhpcy5fbGFzdFdvcmtlclVzZWRUaW1lID0gKG5ldyBEYXRlKCkpLmdldFRpbWUoKTtcblxuXHRcdGNvbnN0IHN0b3BXb3JrZXJJbnRlcnZhbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBXaW5kb3dJbnRlcnZhbFRpbWVyKCkpO1xuXHRcdHN0b3BXb3JrZXJJbnRlcnZhbC5jYW5jZWxBbmRTZXQoKCkgPT4gdGhpcy5fY2hlY2tTdG9wSWRsZVdvcmtlcigpLCBNYXRoLnJvdW5kKFNUT1BfV09SS0VSX0RFTFRBX1RJTUVfTVMgLyAyKSwgbWFpbldpbmRvdyk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9tb2RlbFNlcnZpY2Uub25Nb2RlbFJlbW92ZWQoXyA9PiB0aGlzLl9jaGVja1N0b3BFbXB0eVdvcmtlcigpKSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZWRpdG9yV29ya2VyQ2xpZW50KSB7XG5cdFx0XHR0aGlzLl9lZGl0b3JXb3JrZXJDbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fZWRpdG9yV29ya2VyQ2xpZW50ID0gbnVsbDtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrIGlmIHRoZSBtb2RlbCBzZXJ2aWNlIGhhcyBubyBtb3JlIG1vZGVscyBhbmQgc3RvcCB0aGUgd29ya2VyIGlmIHRoYXQgaXMgdGhlIGNhc2UuXG5cdCAqL1xuXHRwcml2YXRlIF9jaGVja1N0b3BFbXB0eVdvcmtlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvcldvcmtlckNsaWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVscyA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbHMoKTtcblx0XHRpZiAobW9kZWxzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gVGhlcmUgYXJlIG5vIG1vcmUgbW9kZWxzID0+IG5vdGhpbmcgcG9zc2libGUgZm9yIG1lIHRvIGRvXG5cdFx0XHR0aGlzLl9lZGl0b3JXb3JrZXJDbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fZWRpdG9yV29ya2VyQ2xpZW50ID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ2hlY2sgaWYgdGhlIHdvcmtlciBoYXMgYmVlbiBpZGxlIGZvciBhIHdoaWxlIGFuZCB0aGVuIHN0b3AgaXQuXG5cdCAqL1xuXHRwcml2YXRlIF9jaGVja1N0b3BJZGxlV29ya2VyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yV29ya2VyQ2xpZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGltZVNpbmNlTGFzdFdvcmtlclVzZWRUaW1lID0gKG5ldyBEYXRlKCkpLmdldFRpbWUoKSAtIHRoaXMuX2xhc3RXb3JrZXJVc2VkVGltZTtcblx0XHRpZiAodGltZVNpbmNlTGFzdFdvcmtlclVzZWRUaW1lID4gU1RPUF9XT1JLRVJfREVMVEFfVElNRV9NUykge1xuXHRcdFx0dGhpcy5fZWRpdG9yV29ya2VyQ2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2VkaXRvcldvcmtlckNsaWVudCA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHdpdGhXb3JrZXIoKTogUHJvbWlzZTxFZGl0b3JXb3JrZXJDbGllbnQ+IHtcblx0XHR0aGlzLl9sYXN0V29ya2VyVXNlZFRpbWUgPSAobmV3IERhdGUoKSkuZ2V0VGltZSgpO1xuXHRcdGlmICghdGhpcy5fZWRpdG9yV29ya2VyQ2xpZW50KSB7XG5cdFx0XHR0aGlzLl9lZGl0b3JXb3JrZXJDbGllbnQgPSBuZXcgRWRpdG9yV29ya2VyQ2xpZW50KHRoaXMuX3dvcmtlckRlc2NyaXB0b3IsIGZhbHNlLCB0aGlzLl9tb2RlbFNlcnZpY2UsIHRoaXMuX3dlYldvcmtlclNlcnZpY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuX2VkaXRvcldvcmtlckNsaWVudCk7XG5cdH1cbn1cblxuY2xhc3MgU3luY2hyb25vdXNXb3JrZXJDbGllbnQ8VCBleHRlbmRzIElEaXNwb3NhYmxlPiBpbXBsZW1lbnRzIElXZWJXb3JrZXJDbGllbnQ8VD4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW5jZTogVDtcblx0cHVibGljIHJlYWRvbmx5IHByb3h5OiBQcm94aWVkPFQ+O1xuXG5cdGNvbnN0cnVjdG9yKGluc3RhbmNlOiBUKSB7XG5cdFx0dGhpcy5faW5zdGFuY2UgPSBpbnN0YW5jZTtcblx0XHR0aGlzLnByb3h5ID0gdGhpcy5faW5zdGFuY2UgYXMgUHJveGllZDxUPjtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2luc3RhbmNlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRDaGFubmVsPFQgZXh0ZW5kcyBvYmplY3Q+KGNoYW5uZWw6IHN0cmluZywgaGFuZGxlcjogVCk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcihgTm90IHN1cHBvcnRlZGApO1xuXHR9XG5cblx0cHVibGljIGdldENoYW5uZWw8VCBleHRlbmRzIG9iamVjdD4oY2hhbm5lbDogc3RyaW5nKTogUHJveGllZDxUPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBOb3Qgc3VwcG9ydGVkYCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRWRpdG9yV29ya2VyQ2xpZW50IHtcblx0ZmhyKG1ldGhvZDogc3RyaW5nLCBhcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHVua25vd24+O1xufVxuXG5leHBvcnQgY2xhc3MgRWRpdG9yV29ya2VyQ2xpZW50IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JXb3JrZXJDbGllbnQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfd2ViV29ya2VyU2VydmljZTogSVdlYldvcmtlclNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2tlZXBJZGxlTW9kZWxzOiBib29sZWFuO1xuXHRwcml2YXRlIF93b3JrZXI6IElXZWJXb3JrZXJDbGllbnQ8RWRpdG9yV29ya2VyPiB8IG51bGw7XG5cdHByaXZhdGUgX21vZGVsTWFuYWdlcjogV29ya2VyVGV4dE1vZGVsU3luY0NsaWVudCB8IG51bGw7XG5cdHByaXZhdGUgX2Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfd29ya2VyRGVzY3JpcHRvck9yV29ya2VyOiBXZWJXb3JrZXJEZXNjcmlwdG9yIHwgV29ya2VyIHwgUHJvbWlzZTxXb3JrZXI+LFxuXHRcdGtlZXBJZGxlTW9kZWxzOiBib29sZWFuLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASVdlYldvcmtlclNlcnZpY2Ugd2ViV29ya2VyU2VydmljZTogSVdlYldvcmtlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9tb2RlbFNlcnZpY2UgPSBtb2RlbFNlcnZpY2U7XG5cdFx0dGhpcy5fd2ViV29ya2VyU2VydmljZSA9IHdlYldvcmtlclNlcnZpY2U7XG5cdFx0dGhpcy5fa2VlcElkbGVNb2RlbHMgPSBrZWVwSWRsZU1vZGVscztcblx0XHR0aGlzLl93b3JrZXIgPSBudWxsO1xuXHRcdHRoaXMuX21vZGVsTWFuYWdlciA9IG51bGw7XG5cdH1cblxuXHQvLyBmb3JlaWduIGhvc3QgcmVxdWVzdFxuXHRwdWJsaWMgZmhyKG1ldGhvZDogc3RyaW5nLCBhcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHVua25vd24+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vdCBpbXBsZW1lbnRlZCFgKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE9yQ3JlYXRlV29ya2VyKCk6IElXZWJXb3JrZXJDbGllbnQ8RWRpdG9yV29ya2VyPiB7XG5cdFx0aWYgKCF0aGlzLl93b3JrZXIpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX3dvcmtlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dlYldvcmtlclNlcnZpY2UuY3JlYXRlV29ya2VyQ2xpZW50PEVkaXRvcldvcmtlcj4odGhpcy5fd29ya2VyRGVzY3JpcHRvck9yV29ya2VyKSk7XG5cdFx0XHRcdEVkaXRvcldvcmtlckhvc3Quc2V0Q2hhbm5lbCh0aGlzLl93b3JrZXIsIHRoaXMuX2NyZWF0ZUVkaXRvcldvcmtlckhvc3QoKSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0bG9nT25jZVdlYldvcmtlcldhcm5pbmcoZXJyKTtcblx0XHRcdFx0dGhpcy5fd29ya2VyID0gdGhpcy5fY3JlYXRlRmFsbGJhY2tMb2NhbFdvcmtlcigpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fd29ya2VyO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9nZXRQcm94eSgpOiBQcm9taXNlPFByb3hpZWQ8RWRpdG9yV29ya2VyPj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwcm94eSA9IHRoaXMuX2dldE9yQ3JlYXRlV29ya2VyKCkucHJveHk7XG5cdFx0XHRhd2FpdCBwcm94eS4kcGluZygpO1xuXHRcdFx0cmV0dXJuIHByb3h5O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0bG9nT25jZVdlYldvcmtlcldhcm5pbmcoZXJyKTtcblx0XHRcdHRoaXMuX3dvcmtlciA9IHRoaXMuX2NyZWF0ZUZhbGxiYWNrTG9jYWxXb3JrZXIoKTtcblx0XHRcdHJldHVybiB0aGlzLl93b3JrZXIucHJveHk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlRmFsbGJhY2tMb2NhbFdvcmtlcigpOiBTeW5jaHJvbm91c1dvcmtlckNsaWVudDxFZGl0b3JXb3JrZXI+IHtcblx0XHRyZXR1cm4gbmV3IFN5bmNocm9ub3VzV29ya2VyQ2xpZW50KG5ldyBFZGl0b3JXb3JrZXIobnVsbCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlRWRpdG9yV29ya2VySG9zdCgpOiBFZGl0b3JXb3JrZXJIb3N0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0JGZocjogKG1ldGhvZCwgYXJncykgPT4gdGhpcy5maHIobWV0aG9kLCBhcmdzKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPckNyZWF0ZU1vZGVsTWFuYWdlcihwcm94eTogUHJveGllZDxFZGl0b3JXb3JrZXI+KTogV29ya2VyVGV4dE1vZGVsU3luY0NsaWVudCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbE1hbmFnZXIpIHtcblx0XHRcdHRoaXMuX21vZGVsTWFuYWdlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBXb3JrZXJUZXh0TW9kZWxTeW5jQ2xpZW50KHByb3h5LCB0aGlzLl9tb2RlbFNlcnZpY2UsIHRoaXMuX2tlZXBJZGxlTW9kZWxzKSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbE1hbmFnZXI7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgd29ya2VyV2l0aFN5bmNlZFJlc291cmNlcyhyZXNvdXJjZXM6IFVSSVtdLCBmb3JjZUxhcmdlTW9kZWxzOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFByb3hpZWQ8RWRpdG9yV29ya2VyPj4ge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGNhbmNlbGVkKCkpO1xuXHRcdH1cblx0XHRjb25zdCBwcm94eSA9IGF3YWl0IHRoaXMuX2dldFByb3h5KCk7XG5cdFx0dGhpcy5fZ2V0T3JDcmVhdGVNb2RlbE1hbmFnZXIocHJveHkpLmVuc3VyZVN5bmNlZFJlc291cmNlcyhyZXNvdXJjZXMsIGZvcmNlTGFyZ2VNb2RlbHMpO1xuXHRcdHJldHVybiBwcm94eTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyB0ZXh0dWFsU3VnZ2VzdChyZXNvdXJjZXM6IFVSSVtdLCBsZWFkaW5nV29yZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB3b3JkRGVmUmVnRXhwOiBSZWdFeHApOiBQcm9taXNlPHsgd29yZHM6IHN0cmluZ1tdOyBkdXJhdGlvbjogbnVtYmVyIH0gfCBudWxsPiB7XG5cdFx0Y29uc3QgcHJveHkgPSBhd2FpdCB0aGlzLndvcmtlcldpdGhTeW5jZWRSZXNvdXJjZXMocmVzb3VyY2VzKTtcblx0XHRjb25zdCB3b3JkRGVmID0gd29yZERlZlJlZ0V4cC5zb3VyY2U7XG5cdFx0Y29uc3Qgd29yZERlZkZsYWdzID0gd29yZERlZlJlZ0V4cC5mbGFncztcblx0XHRyZXR1cm4gcHJveHkuJHRleHR1YWxTdWdnZXN0KHJlc291cmNlcy5tYXAociA9PiByLnRvU3RyaW5nKCkpLCBsZWFkaW5nV29yZCwgd29yZERlZiwgd29yZERlZkZsYWdzKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2VkID0gdHJ1ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBK0I7QUFFeEMsU0FBUywrQkFBMEQ7QUFDbkUsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBaUIsYUFBYTtBQUU5QixZQUFZLGVBQWU7QUFDM0IsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxVQUFVLHlCQUF5QjtBQUU1QyxTQUFTLGdDQUFnQztBQUd6QyxTQUFvQyxpQkFBaUI7QUFDckQsU0FBUywwQkFBMEIsY0FBYyx3QkFBd0I7QUFDekUsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUI7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
