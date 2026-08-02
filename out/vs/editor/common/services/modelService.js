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
import { Emitter } from "../../../base/common/event.js";
import { StringSHA1 } from "../../../base/common/hash.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { equals } from "../../../base/common/objects.js";
import * as platform from "../../../base/common/platform.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { IUndoRedoService } from "../../../platform/undoRedo/common/undoRedo.js";
import { clampedInt } from "../config/editorOptions.js";
import { EditOperation } from "../core/editOperation.js";
import { EDITOR_MODEL_DEFAULTS } from "../core/misc/textModelDefaults.js";
import { Range } from "../core/range.js";
import { PLAINTEXT_LANGUAGE_ID } from "../languages/modesRegistry.js";
import { DefaultEndOfLine, EndOfLinePreference, EndOfLineSequence } from "../model.js";
import { isEditStackElement } from "../model/editStack.js";
import { TextModel, createTextBuffer } from "../model/textModel.js";
import { EditSources } from "../textModelEditSource.js";
import { ITextResourcePropertiesService } from "./textResourceConfiguration.js";
function MODEL_ID(resource) {
  return resource.toString();
}
class ModelData {
  constructor(model, onWillDispose, onDidChangeLanguage) {
    this.model = model;
    this._modelEventListeners = new DisposableStore();
    this.model = model;
    this._modelEventListeners.add(model.onWillDispose(() => onWillDispose(model)));
    this._modelEventListeners.add(model.onDidChangeLanguage((e) => onDidChangeLanguage(model, e)));
  }
  dispose() {
    this._modelEventListeners.dispose();
  }
}
const DEFAULT_EOL = platform.isLinux || platform.isMacintosh ? DefaultEndOfLine.LF : DefaultEndOfLine.CRLF;
class DisposedModelInfo {
  constructor(uri, initialUndoRedoSnapshot, time, sharesUndoRedoStack, heapSize, sha1, versionId, alternativeVersionId) {
    this.uri = uri;
    this.initialUndoRedoSnapshot = initialUndoRedoSnapshot;
    this.time = time;
    this.sharesUndoRedoStack = sharesUndoRedoStack;
    this.heapSize = heapSize;
    this.sha1 = sha1;
    this.versionId = versionId;
    this.alternativeVersionId = alternativeVersionId;
  }
}
let ModelService = class extends Disposable {
  constructor(_configurationService, _resourcePropertiesService, _undoRedoService, _instantiationService) {
    super();
    this._configurationService = _configurationService;
    this._resourcePropertiesService = _resourcePropertiesService;
    this._undoRedoService = _undoRedoService;
    this._instantiationService = _instantiationService;
    this._onModelAdded = this._register(new Emitter());
    this.onModelAdded = this._onModelAdded.event;
    this._onModelRemoved = this._register(new Emitter());
    this.onModelRemoved = this._onModelRemoved.event;
    this._onModelModeChanged = this._register(new Emitter());
    this.onModelLanguageChanged = this._onModelModeChanged.event;
    this._modelCreationOptionsByLanguageAndResource = /* @__PURE__ */ Object.create(null);
    this._models = {};
    this._disposedModels = /* @__PURE__ */ new Map();
    this._disposedModelsHeapSize = 0;
    this._register(this._configurationService.onDidChangeConfiguration((e) => this._updateModelOptions(e)));
    this._updateModelOptions(void 0);
  }
  static _readModelOptions(config, isForSimpleWidget) {
    let tabSize = EDITOR_MODEL_DEFAULTS.tabSize;
    if (config.editor && typeof config.editor.tabSize !== "undefined") {
      tabSize = clampedInt(config.editor.tabSize, EDITOR_MODEL_DEFAULTS.tabSize, 1, 100);
    }
    let indentSize = "tabSize";
    if (config.editor && typeof config.editor.indentSize !== "undefined" && config.editor.indentSize !== "tabSize") {
      indentSize = clampedInt(config.editor.indentSize, "tabSize", 1, 100);
    }
    let insertSpaces = EDITOR_MODEL_DEFAULTS.insertSpaces;
    if (config.editor && typeof config.editor.insertSpaces !== "undefined") {
      insertSpaces = config.editor.insertSpaces === "false" ? false : Boolean(config.editor.insertSpaces);
    }
    let newDefaultEOL = DEFAULT_EOL;
    const eol = config.eol;
    if (eol === "\r\n") {
      newDefaultEOL = DefaultEndOfLine.CRLF;
    } else if (eol === "\n") {
      newDefaultEOL = DefaultEndOfLine.LF;
    }
    let trimAutoWhitespace = EDITOR_MODEL_DEFAULTS.trimAutoWhitespace;
    if (config.editor && typeof config.editor.trimAutoWhitespace !== "undefined") {
      trimAutoWhitespace = config.editor.trimAutoWhitespace === "false" ? false : Boolean(config.editor.trimAutoWhitespace);
    }
    let detectIndentation = EDITOR_MODEL_DEFAULTS.detectIndentation;
    if (config.editor && typeof config.editor.detectIndentation !== "undefined") {
      detectIndentation = config.editor.detectIndentation === "false" ? false : Boolean(config.editor.detectIndentation);
    }
    let largeFileOptimizations = EDITOR_MODEL_DEFAULTS.largeFileOptimizations;
    if (config.editor && typeof config.editor.largeFileOptimizations !== "undefined") {
      largeFileOptimizations = config.editor.largeFileOptimizations === "false" ? false : Boolean(config.editor.largeFileOptimizations);
    }
    let bracketPairColorizationOptions = EDITOR_MODEL_DEFAULTS.bracketPairColorizationOptions;
    if (config.editor?.bracketPairColorization && typeof config.editor.bracketPairColorization === "object") {
      const bpConfig = config.editor.bracketPairColorization;
      bracketPairColorizationOptions = {
        enabled: !!bpConfig.enabled,
        independentColorPoolPerBracketType: !!bpConfig.independentColorPoolPerBracketType
      };
    }
    return {
      isForSimpleWidget,
      tabSize,
      indentSize,
      insertSpaces,
      detectIndentation,
      defaultEOL: newDefaultEOL,
      trimAutoWhitespace,
      largeFileOptimizations,
      bracketPairColorizationOptions
    };
  }
  _getEOL(resource, language) {
    if (resource) {
      return this._resourcePropertiesService.getEOL(resource, language);
    }
    const eol = this._configurationService.getValue("files.eol", { overrideIdentifier: language });
    if (eol && typeof eol === "string" && eol !== "auto") {
      return eol;
    }
    return platform.OS === platform.OperatingSystem.Linux || platform.OS === platform.OperatingSystem.Macintosh ? "\n" : "\r\n";
  }
  _shouldRestoreUndoStack() {
    const result = this._configurationService.getValue("files.restoreUndoStack");
    if (typeof result === "boolean") {
      return result;
    }
    return true;
  }
  getCreationOptions(languageIdOrSelection, resource, isForSimpleWidget) {
    const language = typeof languageIdOrSelection === "string" ? languageIdOrSelection : languageIdOrSelection.languageId;
    let creationOptions = this._modelCreationOptionsByLanguageAndResource[language + resource];
    if (!creationOptions) {
      const editor = this._configurationService.getValue("editor", { overrideIdentifier: language, resource });
      const eol = this._getEOL(resource, language);
      creationOptions = ModelService._readModelOptions({ editor, eol }, isForSimpleWidget);
      this._modelCreationOptionsByLanguageAndResource[language + resource] = creationOptions;
    }
    return creationOptions;
  }
  _updateModelOptions(e) {
    const oldOptionsByLanguageAndResource = this._modelCreationOptionsByLanguageAndResource;
    this._modelCreationOptionsByLanguageAndResource = /* @__PURE__ */ Object.create(null);
    const keys = Object.keys(this._models);
    for (let i = 0, len = keys.length; i < len; i++) {
      const modelId = keys[i];
      const modelData = this._models[modelId];
      const language = modelData.model.getLanguageId();
      const uri = modelData.model.uri;
      if (e && !e.affectsConfiguration("editor", { overrideIdentifier: language, resource: uri }) && !e.affectsConfiguration("files.eol", { overrideIdentifier: language, resource: uri })) {
        continue;
      }
      const oldOptions = oldOptionsByLanguageAndResource[language + uri];
      const newOptions = this.getCreationOptions(language, uri, modelData.model.isForSimpleWidget);
      ModelService._setModelOptionsForModel(modelData.model, newOptions, oldOptions);
    }
  }
  static _setModelOptionsForModel(model, newOptions, currentOptions) {
    if (currentOptions && currentOptions.defaultEOL !== newOptions.defaultEOL && model.getLineCount() === 1) {
      model.setEOL(newOptions.defaultEOL === DefaultEndOfLine.LF ? EndOfLineSequence.LF : EndOfLineSequence.CRLF);
    }
    if (currentOptions && currentOptions.detectIndentation === newOptions.detectIndentation && currentOptions.insertSpaces === newOptions.insertSpaces && currentOptions.tabSize === newOptions.tabSize && currentOptions.indentSize === newOptions.indentSize && currentOptions.trimAutoWhitespace === newOptions.trimAutoWhitespace && equals(currentOptions.bracketPairColorizationOptions, newOptions.bracketPairColorizationOptions)) {
      return;
    }
    if (newOptions.detectIndentation) {
      model.detectIndentation(newOptions.insertSpaces, newOptions.tabSize);
      model.updateOptions({
        trimAutoWhitespace: newOptions.trimAutoWhitespace,
        bracketColorizationOptions: newOptions.bracketPairColorizationOptions
      });
    } else {
      model.updateOptions({
        insertSpaces: newOptions.insertSpaces,
        tabSize: newOptions.tabSize,
        indentSize: newOptions.indentSize,
        trimAutoWhitespace: newOptions.trimAutoWhitespace,
        bracketColorizationOptions: newOptions.bracketPairColorizationOptions
      });
    }
  }
  // --- begin IModelService
  _insertDisposedModel(disposedModelData) {
    this._disposedModels.set(MODEL_ID(disposedModelData.uri), disposedModelData);
    this._disposedModelsHeapSize += disposedModelData.heapSize;
  }
  _removeDisposedModel(resource) {
    const disposedModelData = this._disposedModels.get(MODEL_ID(resource));
    if (disposedModelData) {
      this._disposedModelsHeapSize -= disposedModelData.heapSize;
    }
    this._disposedModels.delete(MODEL_ID(resource));
    return disposedModelData;
  }
  _ensureDisposedModelsHeapSize(maxModelsHeapSize) {
    if (this._disposedModelsHeapSize > maxModelsHeapSize) {
      const disposedModels = [];
      this._disposedModels.forEach((entry) => {
        if (!entry.sharesUndoRedoStack) {
          disposedModels.push(entry);
        }
      });
      disposedModels.sort((a, b) => a.time - b.time);
      while (disposedModels.length > 0 && this._disposedModelsHeapSize > maxModelsHeapSize) {
        const disposedModel = disposedModels.shift();
        this._removeDisposedModel(disposedModel.uri);
        if (disposedModel.initialUndoRedoSnapshot !== null) {
          this._undoRedoService.restoreSnapshot(disposedModel.initialUndoRedoSnapshot);
        }
      }
    }
  }
  _createModelData(value, languageIdOrSelection, resource, isForSimpleWidget) {
    const options = this.getCreationOptions(languageIdOrSelection, resource, isForSimpleWidget);
    const model = this._instantiationService.createInstance(
      TextModel,
      value,
      languageIdOrSelection,
      options,
      resource
    );
    if (resource && this._disposedModels.has(MODEL_ID(resource))) {
      const disposedModelData = this._removeDisposedModel(resource);
      const elements = this._undoRedoService.getElements(resource);
      const sha1Computer = this._getSHA1Computer();
      const sha1IsEqual = sha1Computer.canComputeSHA1(model) ? sha1Computer.computeSHA1(model) === disposedModelData.sha1 : false;
      if (sha1IsEqual || disposedModelData.sharesUndoRedoStack) {
        for (const element of elements.past) {
          if (isEditStackElement(element) && element.matchesResource(resource)) {
            element.setModel(model);
          }
        }
        for (const element of elements.future) {
          if (isEditStackElement(element) && element.matchesResource(resource)) {
            element.setModel(model);
          }
        }
        this._undoRedoService.setElementsValidFlag(resource, true, (element) => isEditStackElement(element) && element.matchesResource(resource));
        if (sha1IsEqual) {
          model._overwriteVersionId(disposedModelData.versionId);
          model._overwriteAlternativeVersionId(disposedModelData.alternativeVersionId);
          model._overwriteInitialUndoRedoSnapshot(disposedModelData.initialUndoRedoSnapshot);
        }
      } else {
        if (disposedModelData.initialUndoRedoSnapshot !== null) {
          this._undoRedoService.restoreSnapshot(disposedModelData.initialUndoRedoSnapshot);
        }
      }
    }
    const modelId = MODEL_ID(model.uri);
    if (this._models[modelId]) {
      throw new Error("ModelService: Cannot add model because it already exists!");
    }
    const modelData = new ModelData(
      model,
      (model2) => this._onWillDispose(model2),
      (model2, e) => this._onDidChangeLanguage(model2, e)
    );
    this._models[modelId] = modelData;
    return modelData;
  }
  updateModel(model, value, reason = EditSources.unknown({ name: "updateModel" })) {
    const options = this.getCreationOptions(model.getLanguageId(), model.uri, model.isForSimpleWidget);
    const { textBuffer, disposable } = createTextBuffer(value, options.defaultEOL);
    if (model.equalsTextBuffer(textBuffer)) {
      disposable.dispose();
      return;
    }
    model.pushStackElement();
    model.pushEOL(textBuffer.getEOL() === "\r\n" ? EndOfLineSequence.CRLF : EndOfLineSequence.LF);
    model.pushEditOperations(
      [],
      ModelService._computeEdits(model, textBuffer),
      () => [],
      void 0,
      reason
    );
    model.pushStackElement();
    disposable.dispose();
  }
  static _commonPrefix(a, aLen, aDelta, b, bLen, bDelta) {
    const maxResult = Math.min(aLen, bLen);
    let result = 0;
    for (let i = 0; i < maxResult && a.getLineContent(aDelta + i) === b.getLineContent(bDelta + i); i++) {
      result++;
    }
    return result;
  }
  static _commonSuffix(a, aLen, aDelta, b, bLen, bDelta) {
    const maxResult = Math.min(aLen, bLen);
    let result = 0;
    for (let i = 0; i < maxResult && a.getLineContent(aDelta + aLen - i) === b.getLineContent(bDelta + bLen - i); i++) {
      result++;
    }
    return result;
  }
  /**
   * Compute edits to bring `model` to the state of `textSource`.
   */
  static _computeEdits(model, textBuffer) {
    const modelLineCount = model.getLineCount();
    const textBufferLineCount = textBuffer.getLineCount();
    const commonPrefix = this._commonPrefix(model, modelLineCount, 1, textBuffer, textBufferLineCount, 1);
    if (modelLineCount === textBufferLineCount && commonPrefix === modelLineCount) {
      return [];
    }
    const commonSuffix = this._commonSuffix(model, modelLineCount - commonPrefix, commonPrefix, textBuffer, textBufferLineCount - commonPrefix, commonPrefix);
    let oldRange;
    let newRange;
    if (commonSuffix > 0) {
      oldRange = new Range(commonPrefix + 1, 1, modelLineCount - commonSuffix + 1, 1);
      newRange = new Range(commonPrefix + 1, 1, textBufferLineCount - commonSuffix + 1, 1);
    } else if (commonPrefix > 0) {
      oldRange = new Range(commonPrefix, model.getLineMaxColumn(commonPrefix), modelLineCount, model.getLineMaxColumn(modelLineCount));
      newRange = new Range(commonPrefix, 1 + textBuffer.getLineLength(commonPrefix), textBufferLineCount, 1 + textBuffer.getLineLength(textBufferLineCount));
    } else {
      oldRange = new Range(1, 1, modelLineCount, model.getLineMaxColumn(modelLineCount));
      newRange = new Range(1, 1, textBufferLineCount, 1 + textBuffer.getLineLength(textBufferLineCount));
    }
    return [EditOperation.replaceMove(oldRange, textBuffer.getValueInRange(newRange, EndOfLinePreference.TextDefined))];
  }
  createModel(value, languageSelection, resource, isForSimpleWidget = false) {
    let modelData;
    if (languageSelection) {
      modelData = this._createModelData(value, languageSelection, resource, isForSimpleWidget);
    } else {
      modelData = this._createModelData(value, PLAINTEXT_LANGUAGE_ID, resource, isForSimpleWidget);
    }
    this._onModelAdded.fire(modelData.model);
    return modelData.model;
  }
  destroyModel(resource) {
    const modelData = this._models[MODEL_ID(resource)];
    if (!modelData) {
      return;
    }
    modelData.model.dispose();
  }
  getModels() {
    const ret = [];
    const keys = Object.keys(this._models);
    for (let i = 0, len = keys.length; i < len; i++) {
      const modelId = keys[i];
      ret.push(this._models[modelId].model);
    }
    return ret;
  }
  getModel(resource) {
    const modelId = MODEL_ID(resource);
    const modelData = this._models[modelId];
    if (!modelData) {
      return null;
    }
    return modelData.model;
  }
  // --- end IModelService
  _schemaShouldMaintainUndoRedoElements(resource) {
    return resource.scheme === Schemas.file || resource.scheme === Schemas.vscodeRemote || resource.scheme === Schemas.vscodeUserData || resource.scheme === Schemas.vscodeNotebookCell || resource.scheme === "fake-fs";
  }
  _onWillDispose(model) {
    const modelId = MODEL_ID(model.uri);
    const modelData = this._models[modelId];
    const sharesUndoRedoStack = this._undoRedoService.getUriComparisonKey(model.uri) !== model.uri.toString();
    let maintainUndoRedoStack = false;
    let heapSize = 0;
    if (sharesUndoRedoStack || this._shouldRestoreUndoStack() && this._schemaShouldMaintainUndoRedoElements(model.uri)) {
      const elements = this._undoRedoService.getElements(model.uri);
      if (elements.past.length > 0 || elements.future.length > 0) {
        for (const element of elements.past) {
          if (isEditStackElement(element) && element.matchesResource(model.uri)) {
            maintainUndoRedoStack = true;
            heapSize += element.heapSize(model.uri);
            element.setModel(model.uri);
          }
        }
        for (const element of elements.future) {
          if (isEditStackElement(element) && element.matchesResource(model.uri)) {
            maintainUndoRedoStack = true;
            heapSize += element.heapSize(model.uri);
            element.setModel(model.uri);
          }
        }
      }
    }
    const maxMemory = ModelService.MAX_MEMORY_FOR_CLOSED_FILES_UNDO_STACK;
    const sha1Computer = this._getSHA1Computer();
    if (!maintainUndoRedoStack) {
      if (!sharesUndoRedoStack) {
        const initialUndoRedoSnapshot = modelData.model.getInitialUndoRedoSnapshot();
        if (initialUndoRedoSnapshot !== null) {
          this._undoRedoService.restoreSnapshot(initialUndoRedoSnapshot);
        }
      }
    } else if (!sharesUndoRedoStack && (heapSize > maxMemory || !sha1Computer.canComputeSHA1(model))) {
      const initialUndoRedoSnapshot = modelData.model.getInitialUndoRedoSnapshot();
      if (initialUndoRedoSnapshot !== null) {
        this._undoRedoService.restoreSnapshot(initialUndoRedoSnapshot);
      }
    } else {
      this._ensureDisposedModelsHeapSize(maxMemory - heapSize);
      this._undoRedoService.setElementsValidFlag(model.uri, false, (element) => isEditStackElement(element) && element.matchesResource(model.uri));
      this._insertDisposedModel(new DisposedModelInfo(model.uri, modelData.model.getInitialUndoRedoSnapshot(), Date.now(), sharesUndoRedoStack, heapSize, sha1Computer.computeSHA1(model), model.getVersionId(), model.getAlternativeVersionId()));
    }
    delete this._models[modelId];
    modelData.dispose();
    delete this._modelCreationOptionsByLanguageAndResource[model.getLanguageId() + model.uri];
    this._onModelRemoved.fire(model);
  }
  _onDidChangeLanguage(model, e) {
    const oldLanguageId = e.oldLanguage;
    const newLanguageId = model.getLanguageId();
    const oldOptions = this.getCreationOptions(oldLanguageId, model.uri, model.isForSimpleWidget);
    const newOptions = this.getCreationOptions(newLanguageId, model.uri, model.isForSimpleWidget);
    ModelService._setModelOptionsForModel(model, newOptions, oldOptions);
    this._onModelModeChanged.fire({ model, oldLanguageId });
  }
  _getSHA1Computer() {
    return new DefaultModelSHA1Computer();
  }
};
ModelService.MAX_MEMORY_FOR_CLOSED_FILES_UNDO_STACK = 20 * 1024 * 1024;
ModelService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ITextResourcePropertiesService),
  __decorateParam(2, IUndoRedoService),
  __decorateParam(3, IInstantiationService)
], ModelService);
const _DefaultModelSHA1Computer = class _DefaultModelSHA1Computer {
  // takes 200ms to compute a sha1 on a 10MB model on a new machine
  canComputeSHA1(model) {
    return model.getValueLength() <= _DefaultModelSHA1Computer.MAX_MODEL_SIZE;
  }
  computeSHA1(model) {
    const shaComputer = new StringSHA1();
    const snapshot = model.createSnapshot();
    let text;
    while (text = snapshot.read()) {
      shaComputer.update(text);
    }
    return shaComputer.digest();
  }
};
_DefaultModelSHA1Computer.MAX_MODEL_SIZE = 10 * 1024 * 1024;
let DefaultModelSHA1Computer = _DefaultModelSHA1Computer;
export {
  DefaultModelSHA1Computer,
  ModelService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWxTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBTdHJpbmdTSEExIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9TZXJ2aWNlLCBSZXNvdXJjZUVkaXRTdGFja1NuYXBzaG90IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IGNsYW1wZWRJbnQgfSBmcm9tICcuLi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uLCBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFRElUT1JfTU9ERUxfREVGQVVMVFMgfSBmcm9tICcuLi9jb3JlL21pc2MvdGV4dE1vZGVsRGVmYXVsdHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlbGVjdGlvbiB9IGZyb20gJy4uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBQTEFJTlRFWFRfTEFOR1VBR0VfSUQgfSBmcm9tICcuLi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0RW5kT2ZMaW5lLCBFbmRPZkxpbmVQcmVmZXJlbmNlLCBFbmRPZkxpbmVTZXF1ZW5jZSwgSVRleHRCdWZmZXIsIElUZXh0QnVmZmVyRmFjdG9yeSwgSVRleHRNb2RlbCwgSVRleHRNb2RlbENyZWF0aW9uT3B0aW9ucyB9IGZyb20gJy4uL21vZGVsLmpzJztcbmltcG9ydCB7IGlzRWRpdFN0YWNrRWxlbWVudCB9IGZyb20gJy4uL21vZGVsL2VkaXRTdGFjay5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWwsIGNyZWF0ZVRleHRCdWZmZXIgfSBmcm9tICcuLi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgRWRpdFNvdXJjZXMsIFRleHRNb2RlbEVkaXRTb3VyY2UgfSBmcm9tICcuLi90ZXh0TW9kZWxFZGl0U291cmNlLmpzJztcbmltcG9ydCB7IElNb2RlbExhbmd1YWdlQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vdGV4dE1vZGVsRXZlbnRzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSB9IGZyb20gJy4vdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5cbmZ1bmN0aW9uIE1PREVMX0lEKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRyZXR1cm4gcmVzb3VyY2UudG9TdHJpbmcoKTtcbn1cblxuY2xhc3MgTW9kZWxEYXRhIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsRXZlbnRMaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IG1vZGVsOiBUZXh0TW9kZWwsXG5cdFx0b25XaWxsRGlzcG9zZTogKG1vZGVsOiBJVGV4dE1vZGVsKSA9PiB2b2lkLFxuXHRcdG9uRGlkQ2hhbmdlTGFuZ3VhZ2U6IChtb2RlbDogSVRleHRNb2RlbCwgZTogSU1vZGVsTGFuZ3VhZ2VDaGFuZ2VkRXZlbnQpID0+IHZvaWRcblx0KSB7XG5cdFx0dGhpcy5tb2RlbCA9IG1vZGVsO1xuXHRcdHRoaXMuX21vZGVsRXZlbnRMaXN0ZW5lcnMuYWRkKG1vZGVsLm9uV2lsbERpc3Bvc2UoKCkgPT4gb25XaWxsRGlzcG9zZShtb2RlbCkpKTtcblx0XHR0aGlzLl9tb2RlbEV2ZW50TGlzdGVuZXJzLmFkZChtb2RlbC5vbkRpZENoYW5nZUxhbmd1YWdlKChlKSA9PiBvbkRpZENoYW5nZUxhbmd1YWdlKG1vZGVsLCBlKSkpO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxFdmVudExpc3RlbmVycy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElSYXdFZGl0b3JDb25maWcge1xuXHR0YWJTaXplPzogdW5rbm93bjtcblx0aW5kZW50U2l6ZT86IHVua25vd247XG5cdGluc2VydFNwYWNlcz86IHVua25vd247XG5cdGRldGVjdEluZGVudGF0aW9uPzogdW5rbm93bjtcblx0dHJpbUF1dG9XaGl0ZXNwYWNlPzogdW5rbm93bjtcblx0Y3JlYXRpb25PcHRpb25zPzogdW5rbm93bjtcblx0bGFyZ2VGaWxlT3B0aW1pemF0aW9ucz86IHVua25vd247XG5cdGJyYWNrZXRQYWlyQ29sb3JpemF0aW9uPzogdW5rbm93bjtcbn1cblxuaW50ZXJmYWNlIElSYXdDb25maWcge1xuXHRlb2w/OiB1bmtub3duO1xuXHRlZGl0b3I/OiBJUmF3RWRpdG9yQ29uZmlnO1xufVxuXG5jb25zdCBERUZBVUxUX0VPTCA9IChwbGF0Zm9ybS5pc0xpbnV4IHx8IHBsYXRmb3JtLmlzTWFjaW50b3NoKSA/IERlZmF1bHRFbmRPZkxpbmUuTEYgOiBEZWZhdWx0RW5kT2ZMaW5lLkNSTEY7XG5cbmNsYXNzIERpc3Bvc2VkTW9kZWxJbmZvIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHVyaTogVVJJLFxuXHRcdHB1YmxpYyByZWFkb25seSBpbml0aWFsVW5kb1JlZG9TbmFwc2hvdDogUmVzb3VyY2VFZGl0U3RhY2tTbmFwc2hvdCB8IG51bGwsXG5cdFx0cHVibGljIHJlYWRvbmx5IHRpbWU6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgc2hhcmVzVW5kb1JlZG9TdGFjazogYm9vbGVhbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgaGVhcFNpemU6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgc2hhMTogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSB2ZXJzaW9uSWQ6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgYWx0ZXJuYXRpdmVWZXJzaW9uSWQ6IG51bWJlcixcblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vZGVsU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTW9kZWxTZXJ2aWNlIHtcblxuXHRwdWJsaWMgc3RhdGljIE1BWF9NRU1PUllfRk9SX0NMT1NFRF9GSUxFU19VTkRPX1NUQUNLID0gMjAgKiAxMDI0ICogMTAyNDtcblxuXHRwdWJsaWMgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTW9kZWxBZGRlZDogRW1pdHRlcjxJVGV4dE1vZGVsPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXh0TW9kZWw+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Nb2RlbEFkZGVkOiBFdmVudDxJVGV4dE1vZGVsPiA9IHRoaXMuX29uTW9kZWxBZGRlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1vZGVsUmVtb3ZlZDogRW1pdHRlcjxJVGV4dE1vZGVsPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXh0TW9kZWw+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Nb2RlbFJlbW92ZWQ6IEV2ZW50PElUZXh0TW9kZWw+ID0gdGhpcy5fb25Nb2RlbFJlbW92ZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Nb2RlbE1vZGVDaGFuZ2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBtb2RlbDogSVRleHRNb2RlbDsgb2xkTGFuZ3VhZ2VJZDogc3RyaW5nIH0+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Nb2RlbExhbmd1YWdlQ2hhbmdlZCA9IHRoaXMuX29uTW9kZWxNb2RlQ2hhbmdlZC5ldmVudDtcblxuXHRwcml2YXRlIF9tb2RlbENyZWF0aW9uT3B0aW9uc0J5TGFuZ3VhZ2VBbmRSZXNvdXJjZTogeyBbbGFuZ3VhZ2VBbmRSZXNvdXJjZTogc3RyaW5nXTogSVRleHRNb2RlbENyZWF0aW9uT3B0aW9ucyB9O1xuXG5cdC8qKlxuXHQgKiBBbGwgdGhlIG1vZGVscyBrbm93biBpbiB0aGUgc3lzdGVtLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxzOiB7IFttb2RlbElkOiBzdHJpbmddOiBNb2RlbERhdGEgfTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zZWRNb2RlbHM6IE1hcDxzdHJpbmcsIERpc3Bvc2VkTW9kZWxJbmZvPjtcblx0cHJpdmF0ZSBfZGlzcG9zZWRNb2RlbHNIZWFwU2l6ZTogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlUHJvcGVydGllc1NlcnZpY2U6IElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSxcblx0XHRASVVuZG9SZWRvU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91bmRvUmVkb1NlcnZpY2U6IElVbmRvUmVkb1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbW9kZWxDcmVhdGlvbk9wdGlvbnNCeUxhbmd1YWdlQW5kUmVzb3VyY2UgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuX21vZGVscyA9IHt9O1xuXHRcdHRoaXMuX2Rpc3Bvc2VkTW9kZWxzID0gbmV3IE1hcDxzdHJpbmcsIERpc3Bvc2VkTW9kZWxJbmZvPigpO1xuXHRcdHRoaXMuX2Rpc3Bvc2VkTW9kZWxzSGVhcFNpemUgPSAwO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4gdGhpcy5fdXBkYXRlTW9kZWxPcHRpb25zKGUpKSk7XG5cdFx0dGhpcy5fdXBkYXRlTW9kZWxPcHRpb25zKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmVhZE1vZGVsT3B0aW9ucyhjb25maWc6IElSYXdDb25maWcsIGlzRm9yU2ltcGxlV2lkZ2V0OiBib29sZWFuKTogSVRleHRNb2RlbENyZWF0aW9uT3B0aW9ucyB7XG5cdFx0bGV0IHRhYlNpemUgPSBFRElUT1JfTU9ERUxfREVGQVVMVFMudGFiU2l6ZTtcblx0XHRpZiAoY29uZmlnLmVkaXRvciAmJiB0eXBlb2YgY29uZmlnLmVkaXRvci50YWJTaXplICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGFiU2l6ZSA9IGNsYW1wZWRJbnQoY29uZmlnLmVkaXRvci50YWJTaXplLCBFRElUT1JfTU9ERUxfREVGQVVMVFMudGFiU2l6ZSwgMSwgMTAwKTtcblx0XHR9XG5cblx0XHRsZXQgaW5kZW50U2l6ZTogbnVtYmVyIHwgJ3RhYlNpemUnID0gJ3RhYlNpemUnO1xuXHRcdGlmIChjb25maWcuZWRpdG9yICYmIHR5cGVvZiBjb25maWcuZWRpdG9yLmluZGVudFNpemUgIT09ICd1bmRlZmluZWQnICYmIGNvbmZpZy5lZGl0b3IuaW5kZW50U2l6ZSAhPT0gJ3RhYlNpemUnKSB7XG5cdFx0XHRpbmRlbnRTaXplID0gY2xhbXBlZEludChjb25maWcuZWRpdG9yLmluZGVudFNpemUsICd0YWJTaXplJywgMSwgMTAwKTtcblx0XHR9XG5cblx0XHRsZXQgaW5zZXJ0U3BhY2VzID0gRURJVE9SX01PREVMX0RFRkFVTFRTLmluc2VydFNwYWNlcztcblx0XHRpZiAoY29uZmlnLmVkaXRvciAmJiB0eXBlb2YgY29uZmlnLmVkaXRvci5pbnNlcnRTcGFjZXMgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRpbnNlcnRTcGFjZXMgPSAoY29uZmlnLmVkaXRvci5pbnNlcnRTcGFjZXMgPT09ICdmYWxzZScgPyBmYWxzZSA6IEJvb2xlYW4oY29uZmlnLmVkaXRvci5pbnNlcnRTcGFjZXMpKTtcblx0XHR9XG5cblx0XHRsZXQgbmV3RGVmYXVsdEVPTCA9IERFRkFVTFRfRU9MO1xuXHRcdGNvbnN0IGVvbCA9IGNvbmZpZy5lb2w7XG5cdFx0aWYgKGVvbCA9PT0gJ1xcclxcbicpIHtcblx0XHRcdG5ld0RlZmF1bHRFT0wgPSBEZWZhdWx0RW5kT2ZMaW5lLkNSTEY7XG5cdFx0fSBlbHNlIGlmIChlb2wgPT09ICdcXG4nKSB7XG5cdFx0XHRuZXdEZWZhdWx0RU9MID0gRGVmYXVsdEVuZE9mTGluZS5MRjtcblx0XHR9XG5cblx0XHRsZXQgdHJpbUF1dG9XaGl0ZXNwYWNlID0gRURJVE9SX01PREVMX0RFRkFVTFRTLnRyaW1BdXRvV2hpdGVzcGFjZTtcblx0XHRpZiAoY29uZmlnLmVkaXRvciAmJiB0eXBlb2YgY29uZmlnLmVkaXRvci50cmltQXV0b1doaXRlc3BhY2UgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0cmltQXV0b1doaXRlc3BhY2UgPSAoY29uZmlnLmVkaXRvci50cmltQXV0b1doaXRlc3BhY2UgPT09ICdmYWxzZScgPyBmYWxzZSA6IEJvb2xlYW4oY29uZmlnLmVkaXRvci50cmltQXV0b1doaXRlc3BhY2UpKTtcblx0XHR9XG5cblx0XHRsZXQgZGV0ZWN0SW5kZW50YXRpb24gPSBFRElUT1JfTU9ERUxfREVGQVVMVFMuZGV0ZWN0SW5kZW50YXRpb247XG5cdFx0aWYgKGNvbmZpZy5lZGl0b3IgJiYgdHlwZW9mIGNvbmZpZy5lZGl0b3IuZGV0ZWN0SW5kZW50YXRpb24gIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRkZXRlY3RJbmRlbnRhdGlvbiA9IChjb25maWcuZWRpdG9yLmRldGVjdEluZGVudGF0aW9uID09PSAnZmFsc2UnID8gZmFsc2UgOiBCb29sZWFuKGNvbmZpZy5lZGl0b3IuZGV0ZWN0SW5kZW50YXRpb24pKTtcblx0XHR9XG5cblx0XHRsZXQgbGFyZ2VGaWxlT3B0aW1pemF0aW9ucyA9IEVESVRPUl9NT0RFTF9ERUZBVUxUUy5sYXJnZUZpbGVPcHRpbWl6YXRpb25zO1xuXHRcdGlmIChjb25maWcuZWRpdG9yICYmIHR5cGVvZiBjb25maWcuZWRpdG9yLmxhcmdlRmlsZU9wdGltaXphdGlvbnMgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRsYXJnZUZpbGVPcHRpbWl6YXRpb25zID0gKGNvbmZpZy5lZGl0b3IubGFyZ2VGaWxlT3B0aW1pemF0aW9ucyA9PT0gJ2ZhbHNlJyA/IGZhbHNlIDogQm9vbGVhbihjb25maWcuZWRpdG9yLmxhcmdlRmlsZU9wdGltaXphdGlvbnMpKTtcblx0XHR9XG5cdFx0bGV0IGJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucyA9IEVESVRPUl9NT0RFTF9ERUZBVUxUUy5icmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnM7XG5cdFx0aWYgKGNvbmZpZy5lZGl0b3I/LmJyYWNrZXRQYWlyQ29sb3JpemF0aW9uICYmIHR5cGVvZiBjb25maWcuZWRpdG9yLmJyYWNrZXRQYWlyQ29sb3JpemF0aW9uID09PSAnb2JqZWN0Jykge1xuXHRcdFx0Y29uc3QgYnBDb25maWcgPSBjb25maWcuZWRpdG9yLmJyYWNrZXRQYWlyQ29sb3JpemF0aW9uIGFzIHsgZW5hYmxlZD86IHVua25vd247IGluZGVwZW5kZW50Q29sb3JQb29sUGVyQnJhY2tldFR5cGU/OiB1bmtub3duIH07XG5cdFx0XHRicmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnMgPSB7XG5cdFx0XHRcdGVuYWJsZWQ6ICEhYnBDb25maWcuZW5hYmxlZCxcblx0XHRcdFx0aW5kZXBlbmRlbnRDb2xvclBvb2xQZXJCcmFja2V0VHlwZTogISFicENvbmZpZy5pbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpc0ZvclNpbXBsZVdpZGdldDogaXNGb3JTaW1wbGVXaWRnZXQsXG5cdFx0XHR0YWJTaXplOiB0YWJTaXplLFxuXHRcdFx0aW5kZW50U2l6ZTogaW5kZW50U2l6ZSxcblx0XHRcdGluc2VydFNwYWNlczogaW5zZXJ0U3BhY2VzLFxuXHRcdFx0ZGV0ZWN0SW5kZW50YXRpb246IGRldGVjdEluZGVudGF0aW9uLFxuXHRcdFx0ZGVmYXVsdEVPTDogbmV3RGVmYXVsdEVPTCxcblx0XHRcdHRyaW1BdXRvV2hpdGVzcGFjZTogdHJpbUF1dG9XaGl0ZXNwYWNlLFxuXHRcdFx0bGFyZ2VGaWxlT3B0aW1pemF0aW9uczogbGFyZ2VGaWxlT3B0aW1pemF0aW9ucyxcblx0XHRcdGJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9uc1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFT0wocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZS5nZXRFT0wocmVzb3VyY2UsIGxhbmd1YWdlKTtcblx0XHR9XG5cdFx0Y29uc3QgZW9sID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2ZpbGVzLmVvbCcsIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZSB9KTtcblx0XHRpZiAoZW9sICYmIHR5cGVvZiBlb2wgPT09ICdzdHJpbmcnICYmIGVvbCAhPT0gJ2F1dG8nKSB7XG5cdFx0XHRyZXR1cm4gZW9sO1xuXHRcdH1cblx0XHRyZXR1cm4gcGxhdGZvcm0uT1MgPT09IHBsYXRmb3JtLk9wZXJhdGluZ1N5c3RlbS5MaW51eCB8fCBwbGF0Zm9ybS5PUyA9PT0gcGxhdGZvcm0uT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCA/ICdcXG4nIDogJ1xcclxcbic7XG5cdH1cblxuXHRwcml2YXRlIF9zaG91bGRSZXN0b3JlVW5kb1N0YWNrKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdmaWxlcy5yZXN0b3JlVW5kb1N0YWNrJyk7XG5cdFx0aWYgKHR5cGVvZiByZXN1bHQgPT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q3JlYXRpb25PcHRpb25zKGxhbmd1YWdlSWRPclNlbGVjdGlvbjogc3RyaW5nIHwgSUxhbmd1YWdlU2VsZWN0aW9uLCByZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBpc0ZvclNpbXBsZVdpZGdldDogYm9vbGVhbik6IElUZXh0TW9kZWxDcmVhdGlvbk9wdGlvbnMge1xuXHRcdGNvbnN0IGxhbmd1YWdlID0gKHR5cGVvZiBsYW5ndWFnZUlkT3JTZWxlY3Rpb24gPT09ICdzdHJpbmcnID8gbGFuZ3VhZ2VJZE9yU2VsZWN0aW9uIDogbGFuZ3VhZ2VJZE9yU2VsZWN0aW9uLmxhbmd1YWdlSWQpO1xuXHRcdGxldCBjcmVhdGlvbk9wdGlvbnMgPSB0aGlzLl9tb2RlbENyZWF0aW9uT3B0aW9uc0J5TGFuZ3VhZ2VBbmRSZXNvdXJjZVtsYW5ndWFnZSArIHJlc291cmNlXTtcblx0XHRpZiAoIWNyZWF0aW9uT3B0aW9ucykge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVJhd0VkaXRvckNvbmZpZz4oJ2VkaXRvcicsIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZSwgcmVzb3VyY2UgfSk7XG5cdFx0XHRjb25zdCBlb2wgPSB0aGlzLl9nZXRFT0wocmVzb3VyY2UsIGxhbmd1YWdlKTtcblx0XHRcdGNyZWF0aW9uT3B0aW9ucyA9IE1vZGVsU2VydmljZS5fcmVhZE1vZGVsT3B0aW9ucyh7IGVkaXRvciwgZW9sIH0sIGlzRm9yU2ltcGxlV2lkZ2V0KTtcblx0XHRcdHRoaXMuX21vZGVsQ3JlYXRpb25PcHRpb25zQnlMYW5ndWFnZUFuZFJlc291cmNlW2xhbmd1YWdlICsgcmVzb3VyY2VdID0gY3JlYXRpb25PcHRpb25zO1xuXHRcdH1cblx0XHRyZXR1cm4gY3JlYXRpb25PcHRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTW9kZWxPcHRpb25zKGU6IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBvbGRPcHRpb25zQnlMYW5ndWFnZUFuZFJlc291cmNlID0gdGhpcy5fbW9kZWxDcmVhdGlvbk9wdGlvbnNCeUxhbmd1YWdlQW5kUmVzb3VyY2U7XG5cdFx0dGhpcy5fbW9kZWxDcmVhdGlvbk9wdGlvbnNCeUxhbmd1YWdlQW5kUmVzb3VyY2UgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5cdFx0Ly8gVXBkYXRlIG9wdGlvbnMgb24gYWxsIG1vZGVsc1xuXHRcdGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLl9tb2RlbHMpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBrZXlzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBtb2RlbElkID0ga2V5c1tpXTtcblx0XHRcdGNvbnN0IG1vZGVsRGF0YSA9IHRoaXMuX21vZGVsc1ttb2RlbElkXTtcblx0XHRcdGNvbnN0IGxhbmd1YWdlID0gbW9kZWxEYXRhLm1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRcdGNvbnN0IHVyaSA9IG1vZGVsRGF0YS5tb2RlbC51cmk7XG5cblx0XHRcdGlmIChlICYmICFlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3InLCB7IG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UsIHJlc291cmNlOiB1cmkgfSkgJiYgIWUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2ZpbGVzLmVvbCcsIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZSwgcmVzb3VyY2U6IHVyaSB9KSkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gcGVyZjogc2tpcCBpZiB0aGlzIG1vZGVsIGlzIG5vdCBhZmZlY3RlZCBieSBjb25maWd1cmF0aW9uIGNoYW5nZVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvbGRPcHRpb25zID0gb2xkT3B0aW9uc0J5TGFuZ3VhZ2VBbmRSZXNvdXJjZVtsYW5ndWFnZSArIHVyaV07XG5cdFx0XHRjb25zdCBuZXdPcHRpb25zID0gdGhpcy5nZXRDcmVhdGlvbk9wdGlvbnMobGFuZ3VhZ2UsIHVyaSwgbW9kZWxEYXRhLm1vZGVsLmlzRm9yU2ltcGxlV2lkZ2V0KTtcblx0XHRcdE1vZGVsU2VydmljZS5fc2V0TW9kZWxPcHRpb25zRm9yTW9kZWwobW9kZWxEYXRhLm1vZGVsLCBuZXdPcHRpb25zLCBvbGRPcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc2V0TW9kZWxPcHRpb25zRm9yTW9kZWwobW9kZWw6IElUZXh0TW9kZWwsIG5ld09wdGlvbnM6IElUZXh0TW9kZWxDcmVhdGlvbk9wdGlvbnMsIGN1cnJlbnRPcHRpb25zOiBJVGV4dE1vZGVsQ3JlYXRpb25PcHRpb25zKTogdm9pZCB7XG5cdFx0aWYgKGN1cnJlbnRPcHRpb25zICYmIGN1cnJlbnRPcHRpb25zLmRlZmF1bHRFT0wgIT09IG5ld09wdGlvbnMuZGVmYXVsdEVPTCAmJiBtb2RlbC5nZXRMaW5lQ291bnQoKSA9PT0gMSkge1xuXHRcdFx0bW9kZWwuc2V0RU9MKG5ld09wdGlvbnMuZGVmYXVsdEVPTCA9PT0gRGVmYXVsdEVuZE9mTGluZS5MRiA/IEVuZE9mTGluZVNlcXVlbmNlLkxGIDogRW5kT2ZMaW5lU2VxdWVuY2UuQ1JMRik7XG5cdFx0fVxuXG5cdFx0aWYgKGN1cnJlbnRPcHRpb25zXG5cdFx0XHQmJiAoY3VycmVudE9wdGlvbnMuZGV0ZWN0SW5kZW50YXRpb24gPT09IG5ld09wdGlvbnMuZGV0ZWN0SW5kZW50YXRpb24pXG5cdFx0XHQmJiAoY3VycmVudE9wdGlvbnMuaW5zZXJ0U3BhY2VzID09PSBuZXdPcHRpb25zLmluc2VydFNwYWNlcylcblx0XHRcdCYmIChjdXJyZW50T3B0aW9ucy50YWJTaXplID09PSBuZXdPcHRpb25zLnRhYlNpemUpXG5cdFx0XHQmJiAoY3VycmVudE9wdGlvbnMuaW5kZW50U2l6ZSA9PT0gbmV3T3B0aW9ucy5pbmRlbnRTaXplKVxuXHRcdFx0JiYgKGN1cnJlbnRPcHRpb25zLnRyaW1BdXRvV2hpdGVzcGFjZSA9PT0gbmV3T3B0aW9ucy50cmltQXV0b1doaXRlc3BhY2UpXG5cdFx0XHQmJiBlcXVhbHMoY3VycmVudE9wdGlvbnMuYnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zLCBuZXdPcHRpb25zLmJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucylcblx0XHQpIHtcblx0XHRcdC8vIFNhbWUgaW5kZW50IG9wdHMsIG5vIG5lZWQgdG8gdG91Y2ggdGhlIG1vZGVsXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG5ld09wdGlvbnMuZGV0ZWN0SW5kZW50YXRpb24pIHtcblx0XHRcdG1vZGVsLmRldGVjdEluZGVudGF0aW9uKG5ld09wdGlvbnMuaW5zZXJ0U3BhY2VzLCBuZXdPcHRpb25zLnRhYlNpemUpO1xuXHRcdFx0bW9kZWwudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdHRyaW1BdXRvV2hpdGVzcGFjZTogbmV3T3B0aW9ucy50cmltQXV0b1doaXRlc3BhY2UsXG5cdFx0XHRcdGJyYWNrZXRDb2xvcml6YXRpb25PcHRpb25zOiBuZXdPcHRpb25zLmJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9uc1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZGVsLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IG5ld09wdGlvbnMuaW5zZXJ0U3BhY2VzLFxuXHRcdFx0XHR0YWJTaXplOiBuZXdPcHRpb25zLnRhYlNpemUsXG5cdFx0XHRcdGluZGVudFNpemU6IG5ld09wdGlvbnMuaW5kZW50U2l6ZSxcblx0XHRcdFx0dHJpbUF1dG9XaGl0ZXNwYWNlOiBuZXdPcHRpb25zLnRyaW1BdXRvV2hpdGVzcGFjZSxcblx0XHRcdFx0YnJhY2tldENvbG9yaXphdGlvbk9wdGlvbnM6IG5ld09wdGlvbnMuYnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gYmVnaW4gSU1vZGVsU2VydmljZVxuXG5cdHByaXZhdGUgX2luc2VydERpc3Bvc2VkTW9kZWwoZGlzcG9zZWRNb2RlbERhdGE6IERpc3Bvc2VkTW9kZWxJbmZvKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zZWRNb2RlbHMuc2V0KE1PREVMX0lEKGRpc3Bvc2VkTW9kZWxEYXRhLnVyaSksIGRpc3Bvc2VkTW9kZWxEYXRhKTtcblx0XHR0aGlzLl9kaXNwb3NlZE1vZGVsc0hlYXBTaXplICs9IGRpc3Bvc2VkTW9kZWxEYXRhLmhlYXBTaXplO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlRGlzcG9zZWRNb2RlbChyZXNvdXJjZTogVVJJKTogRGlzcG9zZWRNb2RlbEluZm8gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRpc3Bvc2VkTW9kZWxEYXRhID0gdGhpcy5fZGlzcG9zZWRNb2RlbHMuZ2V0KE1PREVMX0lEKHJlc291cmNlKSk7XG5cdFx0aWYgKGRpc3Bvc2VkTW9kZWxEYXRhKSB7XG5cdFx0XHR0aGlzLl9kaXNwb3NlZE1vZGVsc0hlYXBTaXplIC09IGRpc3Bvc2VkTW9kZWxEYXRhLmhlYXBTaXplO1xuXHRcdH1cblx0XHR0aGlzLl9kaXNwb3NlZE1vZGVscy5kZWxldGUoTU9ERUxfSUQocmVzb3VyY2UpKTtcblx0XHRyZXR1cm4gZGlzcG9zZWRNb2RlbERhdGE7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVEaXNwb3NlZE1vZGVsc0hlYXBTaXplKG1heE1vZGVsc0hlYXBTaXplOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWRNb2RlbHNIZWFwU2l6ZSA+IG1heE1vZGVsc0hlYXBTaXplKSB7XG5cdFx0XHQvLyB3ZSBtdXN0IHJlbW92ZSBzb21lIG9sZCB1bmRvIHN0YWNrIGVsZW1lbnRzIHRvIGZyZWUgdXAgc29tZSBtZW1vcnlcblx0XHRcdGNvbnN0IGRpc3Bvc2VkTW9kZWxzOiBEaXNwb3NlZE1vZGVsSW5mb1tdID0gW107XG5cdFx0XHR0aGlzLl9kaXNwb3NlZE1vZGVscy5mb3JFYWNoKGVudHJ5ID0+IHtcblx0XHRcdFx0aWYgKCFlbnRyeS5zaGFyZXNVbmRvUmVkb1N0YWNrKSB7XG5cdFx0XHRcdFx0ZGlzcG9zZWRNb2RlbHMucHVzaChlbnRyeSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0ZGlzcG9zZWRNb2RlbHMuc29ydCgoYSwgYikgPT4gYS50aW1lIC0gYi50aW1lKTtcblx0XHRcdHdoaWxlIChkaXNwb3NlZE1vZGVscy5sZW5ndGggPiAwICYmIHRoaXMuX2Rpc3Bvc2VkTW9kZWxzSGVhcFNpemUgPiBtYXhNb2RlbHNIZWFwU2l6ZSkge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NlZE1vZGVsID0gZGlzcG9zZWRNb2RlbHMuc2hpZnQoKSE7XG5cdFx0XHRcdHRoaXMuX3JlbW92ZURpc3Bvc2VkTW9kZWwoZGlzcG9zZWRNb2RlbC51cmkpO1xuXHRcdFx0XHRpZiAoZGlzcG9zZWRNb2RlbC5pbml0aWFsVW5kb1JlZG9TbmFwc2hvdCAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdHRoaXMuX3VuZG9SZWRvU2VydmljZS5yZXN0b3JlU25hcHNob3QoZGlzcG9zZWRNb2RlbC5pbml0aWFsVW5kb1JlZG9TbmFwc2hvdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVNb2RlbERhdGEodmFsdWU6IHN0cmluZyB8IElUZXh0QnVmZmVyRmFjdG9yeSwgbGFuZ3VhZ2VJZE9yU2VsZWN0aW9uOiBzdHJpbmcgfCBJTGFuZ3VhZ2VTZWxlY3Rpb24sIHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIGlzRm9yU2ltcGxlV2lkZ2V0OiBib29sZWFuKTogTW9kZWxEYXRhIHtcblx0XHQvLyBjcmVhdGUgJiBzYXZlIHRoZSBtb2RlbFxuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLmdldENyZWF0aW9uT3B0aW9ucyhsYW5ndWFnZUlkT3JTZWxlY3Rpb24sIHJlc291cmNlLCBpc0ZvclNpbXBsZVdpZGdldCk7XG5cdFx0Y29uc3QgbW9kZWw6IFRleHRNb2RlbCA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRNb2RlbCxcblx0XHRcdHZhbHVlLFxuXHRcdFx0bGFuZ3VhZ2VJZE9yU2VsZWN0aW9uLFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdHJlc291cmNlXG5cdFx0KTtcblx0XHRpZiAocmVzb3VyY2UgJiYgdGhpcy5fZGlzcG9zZWRNb2RlbHMuaGFzKE1PREVMX0lEKHJlc291cmNlKSkpIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2VkTW9kZWxEYXRhID0gdGhpcy5fcmVtb3ZlRGlzcG9zZWRNb2RlbChyZXNvdXJjZSkhO1xuXHRcdFx0Y29uc3QgZWxlbWVudHMgPSB0aGlzLl91bmRvUmVkb1NlcnZpY2UuZ2V0RWxlbWVudHMocmVzb3VyY2UpO1xuXHRcdFx0Y29uc3Qgc2hhMUNvbXB1dGVyID0gdGhpcy5fZ2V0U0hBMUNvbXB1dGVyKCk7XG5cdFx0XHRjb25zdCBzaGExSXNFcXVhbCA9IChcblx0XHRcdFx0c2hhMUNvbXB1dGVyLmNhbkNvbXB1dGVTSEExKG1vZGVsKVxuXHRcdFx0XHRcdD8gc2hhMUNvbXB1dGVyLmNvbXB1dGVTSEExKG1vZGVsKSA9PT0gZGlzcG9zZWRNb2RlbERhdGEuc2hhMVxuXHRcdFx0XHRcdDogZmFsc2Vcblx0XHRcdCk7XG5cdFx0XHRpZiAoc2hhMUlzRXF1YWwgfHwgZGlzcG9zZWRNb2RlbERhdGEuc2hhcmVzVW5kb1JlZG9TdGFjaykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgZWxlbWVudHMucGFzdCkge1xuXHRcdFx0XHRcdGlmIChpc0VkaXRTdGFja0VsZW1lbnQoZWxlbWVudCkgJiYgZWxlbWVudC5tYXRjaGVzUmVzb3VyY2UocmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRlbGVtZW50LnNldE1vZGVsKG1vZGVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzLmZ1dHVyZSkge1xuXHRcdFx0XHRcdGlmIChpc0VkaXRTdGFja0VsZW1lbnQoZWxlbWVudCkgJiYgZWxlbWVudC5tYXRjaGVzUmVzb3VyY2UocmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRlbGVtZW50LnNldE1vZGVsKG1vZGVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdW5kb1JlZG9TZXJ2aWNlLnNldEVsZW1lbnRzVmFsaWRGbGFnKHJlc291cmNlLCB0cnVlLCAoZWxlbWVudCkgPT4gKGlzRWRpdFN0YWNrRWxlbWVudChlbGVtZW50KSAmJiBlbGVtZW50Lm1hdGNoZXNSZXNvdXJjZShyZXNvdXJjZSkpKTtcblx0XHRcdFx0aWYgKHNoYTFJc0VxdWFsKSB7XG5cdFx0XHRcdFx0bW9kZWwuX292ZXJ3cml0ZVZlcnNpb25JZChkaXNwb3NlZE1vZGVsRGF0YS52ZXJzaW9uSWQpO1xuXHRcdFx0XHRcdG1vZGVsLl9vdmVyd3JpdGVBbHRlcm5hdGl2ZVZlcnNpb25JZChkaXNwb3NlZE1vZGVsRGF0YS5hbHRlcm5hdGl2ZVZlcnNpb25JZCk7XG5cdFx0XHRcdFx0bW9kZWwuX292ZXJ3cml0ZUluaXRpYWxVbmRvUmVkb1NuYXBzaG90KGRpc3Bvc2VkTW9kZWxEYXRhLmluaXRpYWxVbmRvUmVkb1NuYXBzaG90KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGRpc3Bvc2VkTW9kZWxEYXRhLmluaXRpYWxVbmRvUmVkb1NuYXBzaG90ICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0dGhpcy5fdW5kb1JlZG9TZXJ2aWNlLnJlc3RvcmVTbmFwc2hvdChkaXNwb3NlZE1vZGVsRGF0YS5pbml0aWFsVW5kb1JlZG9TbmFwc2hvdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgbW9kZWxJZCA9IE1PREVMX0lEKG1vZGVsLnVyaSk7XG5cblx0XHRpZiAodGhpcy5fbW9kZWxzW21vZGVsSWRdKSB7XG5cdFx0XHQvLyBUaGVyZSBhbHJlYWR5IGV4aXN0cyBhIG1vZGVsIHdpdGggdGhpcyBpZCA9PiB0aGlzIGlzIGEgcHJvZ3JhbW1lciBlcnJvclxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNb2RlbFNlcnZpY2U6IENhbm5vdCBhZGQgbW9kZWwgYmVjYXVzZSBpdCBhbHJlYWR5IGV4aXN0cyEnKTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbERhdGEgPSBuZXcgTW9kZWxEYXRhKFxuXHRcdFx0bW9kZWwsXG5cdFx0XHQobW9kZWwpID0+IHRoaXMuX29uV2lsbERpc3Bvc2UobW9kZWwpLFxuXHRcdFx0KG1vZGVsLCBlKSA9PiB0aGlzLl9vbkRpZENoYW5nZUxhbmd1YWdlKG1vZGVsLCBlKVxuXHRcdCk7XG5cdFx0dGhpcy5fbW9kZWxzW21vZGVsSWRdID0gbW9kZWxEYXRhO1xuXG5cdFx0cmV0dXJuIG1vZGVsRGF0YTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVNb2RlbChtb2RlbDogSVRleHRNb2RlbCwgdmFsdWU6IHN0cmluZyB8IElUZXh0QnVmZmVyRmFjdG9yeSwgcmVhc29uOiBUZXh0TW9kZWxFZGl0U291cmNlID0gRWRpdFNvdXJjZXMudW5rbm93bih7IG5hbWU6ICd1cGRhdGVNb2RlbCcgfSkpOiB2b2lkIHtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5nZXRDcmVhdGlvbk9wdGlvbnMobW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCBtb2RlbC51cmksIG1vZGVsLmlzRm9yU2ltcGxlV2lkZ2V0KTtcblx0XHRjb25zdCB7IHRleHRCdWZmZXIsIGRpc3Bvc2FibGUgfSA9IGNyZWF0ZVRleHRCdWZmZXIodmFsdWUsIG9wdGlvbnMuZGVmYXVsdEVPTCk7XG5cblx0XHQvLyBSZXR1cm4gZWFybHkgaWYgdGhlIHRleHQgaXMgYWxyZWFkeSBzZXQgaW4gdGhhdCBmb3JtXG5cdFx0aWYgKG1vZGVsLmVxdWFsc1RleHRCdWZmZXIodGV4dEJ1ZmZlcikpIHtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBmaW5kIGEgZGlmZiBiZXR3ZWVuIHRoZSB2YWx1ZXMgYW5kIHVwZGF0ZSBtb2RlbFxuXHRcdG1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRtb2RlbC5wdXNoRU9MKHRleHRCdWZmZXIuZ2V0RU9MKCkgPT09ICdcXHJcXG4nID8gRW5kT2ZMaW5lU2VxdWVuY2UuQ1JMRiA6IEVuZE9mTGluZVNlcXVlbmNlLkxGKTtcblx0XHRtb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMoXG5cdFx0XHRbXSxcblx0XHRcdE1vZGVsU2VydmljZS5fY29tcHV0ZUVkaXRzKG1vZGVsLCB0ZXh0QnVmZmVyKSxcblx0XHRcdCgpID0+IFtdLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0cmVhc29uXG5cdFx0KTtcblx0XHRtb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY29tbW9uUHJlZml4KGE6IElUZXh0TW9kZWwsIGFMZW46IG51bWJlciwgYURlbHRhOiBudW1iZXIsIGI6IElUZXh0QnVmZmVyLCBiTGVuOiBudW1iZXIsIGJEZWx0YTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBtYXhSZXN1bHQgPSBNYXRoLm1pbihhTGVuLCBiTGVuKTtcblxuXHRcdGxldCByZXN1bHQgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbWF4UmVzdWx0ICYmIGEuZ2V0TGluZUNvbnRlbnQoYURlbHRhICsgaSkgPT09IGIuZ2V0TGluZUNvbnRlbnQoYkRlbHRhICsgaSk7IGkrKykge1xuXHRcdFx0cmVzdWx0Kys7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY29tbW9uU3VmZml4KGE6IElUZXh0TW9kZWwsIGFMZW46IG51bWJlciwgYURlbHRhOiBudW1iZXIsIGI6IElUZXh0QnVmZmVyLCBiTGVuOiBudW1iZXIsIGJEZWx0YTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBtYXhSZXN1bHQgPSBNYXRoLm1pbihhTGVuLCBiTGVuKTtcblxuXHRcdGxldCByZXN1bHQgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbWF4UmVzdWx0ICYmIGEuZ2V0TGluZUNvbnRlbnQoYURlbHRhICsgYUxlbiAtIGkpID09PSBiLmdldExpbmVDb250ZW50KGJEZWx0YSArIGJMZW4gLSBpKTsgaSsrKSB7XG5cdFx0XHRyZXN1bHQrKztcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlIGVkaXRzIHRvIGJyaW5nIGBtb2RlbGAgdG8gdGhlIHN0YXRlIG9mIGB0ZXh0U291cmNlYC5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgX2NvbXB1dGVFZGl0cyhtb2RlbDogSVRleHRNb2RlbCwgdGV4dEJ1ZmZlcjogSVRleHRCdWZmZXIpOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdIHtcblx0XHRjb25zdCBtb2RlbExpbmVDb3VudCA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IHRleHRCdWZmZXJMaW5lQ291bnQgPSB0ZXh0QnVmZmVyLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IGNvbW1vblByZWZpeCA9IHRoaXMuX2NvbW1vblByZWZpeChtb2RlbCwgbW9kZWxMaW5lQ291bnQsIDEsIHRleHRCdWZmZXIsIHRleHRCdWZmZXJMaW5lQ291bnQsIDEpO1xuXG5cdFx0aWYgKG1vZGVsTGluZUNvdW50ID09PSB0ZXh0QnVmZmVyTGluZUNvdW50ICYmIGNvbW1vblByZWZpeCA9PT0gbW9kZWxMaW5lQ291bnQpIHtcblx0XHRcdC8vIGVxdWFsaXR5IGNhc2Vcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tb25TdWZmaXggPSB0aGlzLl9jb21tb25TdWZmaXgobW9kZWwsIG1vZGVsTGluZUNvdW50IC0gY29tbW9uUHJlZml4LCBjb21tb25QcmVmaXgsIHRleHRCdWZmZXIsIHRleHRCdWZmZXJMaW5lQ291bnQgLSBjb21tb25QcmVmaXgsIGNvbW1vblByZWZpeCk7XG5cblx0XHRsZXQgb2xkUmFuZ2U6IFJhbmdlO1xuXHRcdGxldCBuZXdSYW5nZTogUmFuZ2U7XG5cdFx0aWYgKGNvbW1vblN1ZmZpeCA+IDApIHtcblx0XHRcdG9sZFJhbmdlID0gbmV3IFJhbmdlKGNvbW1vblByZWZpeCArIDEsIDEsIG1vZGVsTGluZUNvdW50IC0gY29tbW9uU3VmZml4ICsgMSwgMSk7XG5cdFx0XHRuZXdSYW5nZSA9IG5ldyBSYW5nZShjb21tb25QcmVmaXggKyAxLCAxLCB0ZXh0QnVmZmVyTGluZUNvdW50IC0gY29tbW9uU3VmZml4ICsgMSwgMSk7XG5cdFx0fSBlbHNlIGlmIChjb21tb25QcmVmaXggPiAwKSB7XG5cdFx0XHRvbGRSYW5nZSA9IG5ldyBSYW5nZShjb21tb25QcmVmaXgsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4oY29tbW9uUHJlZml4KSwgbW9kZWxMaW5lQ291bnQsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obW9kZWxMaW5lQ291bnQpKTtcblx0XHRcdG5ld1JhbmdlID0gbmV3IFJhbmdlKGNvbW1vblByZWZpeCwgMSArIHRleHRCdWZmZXIuZ2V0TGluZUxlbmd0aChjb21tb25QcmVmaXgpLCB0ZXh0QnVmZmVyTGluZUNvdW50LCAxICsgdGV4dEJ1ZmZlci5nZXRMaW5lTGVuZ3RoKHRleHRCdWZmZXJMaW5lQ291bnQpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b2xkUmFuZ2UgPSBuZXcgUmFuZ2UoMSwgMSwgbW9kZWxMaW5lQ291bnQsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obW9kZWxMaW5lQ291bnQpKTtcblx0XHRcdG5ld1JhbmdlID0gbmV3IFJhbmdlKDEsIDEsIHRleHRCdWZmZXJMaW5lQ291bnQsIDEgKyB0ZXh0QnVmZmVyLmdldExpbmVMZW5ndGgodGV4dEJ1ZmZlckxpbmVDb3VudCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBbRWRpdE9wZXJhdGlvbi5yZXBsYWNlTW92ZShvbGRSYW5nZSwgdGV4dEJ1ZmZlci5nZXRWYWx1ZUluUmFuZ2UobmV3UmFuZ2UsIEVuZE9mTGluZVByZWZlcmVuY2UuVGV4dERlZmluZWQpKV07XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlTW9kZWwodmFsdWU6IHN0cmluZyB8IElUZXh0QnVmZmVyRmFjdG9yeSwgbGFuZ3VhZ2VTZWxlY3Rpb246IElMYW5ndWFnZVNlbGVjdGlvbiB8IG51bGwsIHJlc291cmNlPzogVVJJLCBpc0ZvclNpbXBsZVdpZGdldDogYm9vbGVhbiA9IGZhbHNlKTogSVRleHRNb2RlbCB7XG5cdFx0bGV0IG1vZGVsRGF0YTogTW9kZWxEYXRhO1xuXG5cdFx0aWYgKGxhbmd1YWdlU2VsZWN0aW9uKSB7XG5cdFx0XHRtb2RlbERhdGEgPSB0aGlzLl9jcmVhdGVNb2RlbERhdGEodmFsdWUsIGxhbmd1YWdlU2VsZWN0aW9uLCByZXNvdXJjZSwgaXNGb3JTaW1wbGVXaWRnZXQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2RlbERhdGEgPSB0aGlzLl9jcmVhdGVNb2RlbERhdGEodmFsdWUsIFBMQUlOVEVYVF9MQU5HVUFHRV9JRCwgcmVzb3VyY2UsIGlzRm9yU2ltcGxlV2lkZ2V0KTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbk1vZGVsQWRkZWQuZmlyZShtb2RlbERhdGEubW9kZWwpO1xuXG5cdFx0cmV0dXJuIG1vZGVsRGF0YS5tb2RlbDtcblx0fVxuXG5cdHB1YmxpYyBkZXN0cm95TW9kZWwocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdC8vIFdlIG5lZWQgdG8gc3VwcG9ydCB0aGF0IG5vdCBhbGwgbW9kZWxzIGdldCBkaXNwb3NlZCB0aHJvdWdoIHRoaXMgc2VydmljZSAoaS5lLiBtb2RlbC5kaXNwb3NlKCkgc2hvdWxkIHdvcmshKVxuXHRcdGNvbnN0IG1vZGVsRGF0YSA9IHRoaXMuX21vZGVsc1tNT0RFTF9JRChyZXNvdXJjZSldO1xuXHRcdGlmICghbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdG1vZGVsRGF0YS5tb2RlbC5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TW9kZWxzKCk6IElUZXh0TW9kZWxbXSB7XG5cdFx0Y29uc3QgcmV0OiBJVGV4dE1vZGVsW10gPSBbXTtcblxuXHRcdGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLl9tb2RlbHMpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBrZXlzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBtb2RlbElkID0ga2V5c1tpXTtcblx0XHRcdHJldC5wdXNoKHRoaXMuX21vZGVsc1ttb2RlbElkXS5tb2RlbCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdHB1YmxpYyBnZXRNb2RlbChyZXNvdXJjZTogVVJJKTogSVRleHRNb2RlbCB8IG51bGwge1xuXHRcdGNvbnN0IG1vZGVsSWQgPSBNT0RFTF9JRChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgbW9kZWxEYXRhID0gdGhpcy5fbW9kZWxzW21vZGVsSWRdO1xuXHRcdGlmICghbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIG1vZGVsRGF0YS5tb2RlbDtcblx0fVxuXG5cdC8vIC0tLSBlbmQgSU1vZGVsU2VydmljZVxuXG5cdHByb3RlY3RlZCBfc2NoZW1hU2hvdWxkTWFpbnRhaW5VbmRvUmVkb0VsZW1lbnRzKHJlc291cmNlOiBVUkkpIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0cmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLmZpbGVcblx0XHRcdHx8IHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVSZW1vdGVcblx0XHRcdHx8IHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVVc2VyRGF0YVxuXHRcdFx0fHwgcmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbFxuXHRcdFx0fHwgcmVzb3VyY2Uuc2NoZW1lID09PSAnZmFrZS1mcycgLy8gZm9yIHRlc3RzXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX29uV2lsbERpc3Bvc2UobW9kZWw6IElUZXh0TW9kZWwpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbElkID0gTU9ERUxfSUQobW9kZWwudXJpKTtcblx0XHRjb25zdCBtb2RlbERhdGEgPSB0aGlzLl9tb2RlbHNbbW9kZWxJZF07XG5cblx0XHRjb25zdCBzaGFyZXNVbmRvUmVkb1N0YWNrID0gKHRoaXMuX3VuZG9SZWRvU2VydmljZS5nZXRVcmlDb21wYXJpc29uS2V5KG1vZGVsLnVyaSkgIT09IG1vZGVsLnVyaS50b1N0cmluZygpKTtcblx0XHRsZXQgbWFpbnRhaW5VbmRvUmVkb1N0YWNrID0gZmFsc2U7XG5cdFx0bGV0IGhlYXBTaXplID0gMDtcblx0XHRpZiAoc2hhcmVzVW5kb1JlZG9TdGFjayB8fCAodGhpcy5fc2hvdWxkUmVzdG9yZVVuZG9TdGFjaygpICYmIHRoaXMuX3NjaGVtYVNob3VsZE1haW50YWluVW5kb1JlZG9FbGVtZW50cyhtb2RlbC51cmkpKSkge1xuXHRcdFx0Y29uc3QgZWxlbWVudHMgPSB0aGlzLl91bmRvUmVkb1NlcnZpY2UuZ2V0RWxlbWVudHMobW9kZWwudXJpKTtcblx0XHRcdGlmIChlbGVtZW50cy5wYXN0Lmxlbmd0aCA+IDAgfHwgZWxlbWVudHMuZnV0dXJlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzLnBhc3QpIHtcblx0XHRcdFx0XHRpZiAoaXNFZGl0U3RhY2tFbGVtZW50KGVsZW1lbnQpICYmIGVsZW1lbnQubWF0Y2hlc1Jlc291cmNlKG1vZGVsLnVyaSkpIHtcblx0XHRcdFx0XHRcdG1haW50YWluVW5kb1JlZG9TdGFjayA9IHRydWU7XG5cdFx0XHRcdFx0XHRoZWFwU2l6ZSArPSBlbGVtZW50LmhlYXBTaXplKG1vZGVsLnVyaSk7XG5cdFx0XHRcdFx0XHRlbGVtZW50LnNldE1vZGVsKG1vZGVsLnVyaSk7IC8vIHJlbW92ZSByZWZlcmVuY2UgZnJvbSB0ZXh0IGJ1ZmZlciBpbnN0YW5jZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgZWxlbWVudHMuZnV0dXJlKSB7XG5cdFx0XHRcdFx0aWYgKGlzRWRpdFN0YWNrRWxlbWVudChlbGVtZW50KSAmJiBlbGVtZW50Lm1hdGNoZXNSZXNvdXJjZShtb2RlbC51cmkpKSB7XG5cdFx0XHRcdFx0XHRtYWludGFpblVuZG9SZWRvU3RhY2sgPSB0cnVlO1xuXHRcdFx0XHRcdFx0aGVhcFNpemUgKz0gZWxlbWVudC5oZWFwU2l6ZShtb2RlbC51cmkpO1xuXHRcdFx0XHRcdFx0ZWxlbWVudC5zZXRNb2RlbChtb2RlbC51cmkpOyAvLyByZW1vdmUgcmVmZXJlbmNlIGZyb20gdGV4dCBidWZmZXIgaW5zdGFuY2Vcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtYXhNZW1vcnkgPSBNb2RlbFNlcnZpY2UuTUFYX01FTU9SWV9GT1JfQ0xPU0VEX0ZJTEVTX1VORE9fU1RBQ0s7XG5cdFx0Y29uc3Qgc2hhMUNvbXB1dGVyID0gdGhpcy5fZ2V0U0hBMUNvbXB1dGVyKCk7XG5cdFx0aWYgKCFtYWludGFpblVuZG9SZWRvU3RhY2spIHtcblx0XHRcdGlmICghc2hhcmVzVW5kb1JlZG9TdGFjaykge1xuXHRcdFx0XHRjb25zdCBpbml0aWFsVW5kb1JlZG9TbmFwc2hvdCA9IG1vZGVsRGF0YS5tb2RlbC5nZXRJbml0aWFsVW5kb1JlZG9TbmFwc2hvdCgpO1xuXHRcdFx0XHRpZiAoaW5pdGlhbFVuZG9SZWRvU25hcHNob3QgIT09IG51bGwpIHtcblx0XHRcdFx0XHR0aGlzLl91bmRvUmVkb1NlcnZpY2UucmVzdG9yZVNuYXBzaG90KGluaXRpYWxVbmRvUmVkb1NuYXBzaG90KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIXNoYXJlc1VuZG9SZWRvU3RhY2sgJiYgKGhlYXBTaXplID4gbWF4TWVtb3J5IHx8ICFzaGExQ29tcHV0ZXIuY2FuQ29tcHV0ZVNIQTEobW9kZWwpKSkge1xuXHRcdFx0Ly8gdGhlIHVuZG8gc3RhY2sgZm9yIHRoaXMgZmlsZSB3b3VsZCBuZXZlciBmaXQgaW4gdGhlIGNvbmZpZ3VyZWQgbWVtb3J5IG9yIHRoZSBmaWxlIGlzIHZlcnkgbGFyZ2UsIHNvIGRvbid0IGJvdGhlciB3aXRoIGl0LlxuXHRcdFx0Y29uc3QgaW5pdGlhbFVuZG9SZWRvU25hcHNob3QgPSBtb2RlbERhdGEubW9kZWwuZ2V0SW5pdGlhbFVuZG9SZWRvU25hcHNob3QoKTtcblx0XHRcdGlmIChpbml0aWFsVW5kb1JlZG9TbmFwc2hvdCAhPT0gbnVsbCkge1xuXHRcdFx0XHR0aGlzLl91bmRvUmVkb1NlcnZpY2UucmVzdG9yZVNuYXBzaG90KGluaXRpYWxVbmRvUmVkb1NuYXBzaG90KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZW5zdXJlRGlzcG9zZWRNb2RlbHNIZWFwU2l6ZShtYXhNZW1vcnkgLSBoZWFwU2l6ZSk7XG5cdFx0XHQvLyBXZSBvbmx5IGludmFsaWRhdGUgdGhlIGVsZW1lbnRzLCBidXQgdGhleSByZW1haW4gaW4gdGhlIHVuZG8tcmVkbyBzZXJ2aWNlLlxuXHRcdFx0dGhpcy5fdW5kb1JlZG9TZXJ2aWNlLnNldEVsZW1lbnRzVmFsaWRGbGFnKG1vZGVsLnVyaSwgZmFsc2UsIChlbGVtZW50KSA9PiAoaXNFZGl0U3RhY2tFbGVtZW50KGVsZW1lbnQpICYmIGVsZW1lbnQubWF0Y2hlc1Jlc291cmNlKG1vZGVsLnVyaSkpKTtcblx0XHRcdHRoaXMuX2luc2VydERpc3Bvc2VkTW9kZWwobmV3IERpc3Bvc2VkTW9kZWxJbmZvKG1vZGVsLnVyaSwgbW9kZWxEYXRhLm1vZGVsLmdldEluaXRpYWxVbmRvUmVkb1NuYXBzaG90KCksIERhdGUubm93KCksIHNoYXJlc1VuZG9SZWRvU3RhY2ssIGhlYXBTaXplLCBzaGExQ29tcHV0ZXIuY29tcHV0ZVNIQTEobW9kZWwpLCBtb2RlbC5nZXRWZXJzaW9uSWQoKSwgbW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKSkpO1xuXHRcdH1cblxuXHRcdGRlbGV0ZSB0aGlzLl9tb2RlbHNbbW9kZWxJZF07XG5cdFx0bW9kZWxEYXRhLmRpc3Bvc2UoKTtcblxuXHRcdC8vIGNsZWFuIHVwIGNhY2hlXG5cdFx0ZGVsZXRlIHRoaXMuX21vZGVsQ3JlYXRpb25PcHRpb25zQnlMYW5ndWFnZUFuZFJlc291cmNlW21vZGVsLmdldExhbmd1YWdlSWQoKSArIG1vZGVsLnVyaV07XG5cblx0XHR0aGlzLl9vbk1vZGVsUmVtb3ZlZC5maXJlKG1vZGVsKTtcblx0fVxuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlTGFuZ3VhZ2UobW9kZWw6IElUZXh0TW9kZWwsIGU6IElNb2RlbExhbmd1YWdlQ2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgb2xkTGFuZ3VhZ2VJZCA9IGUub2xkTGFuZ3VhZ2U7XG5cdFx0Y29uc3QgbmV3TGFuZ3VhZ2VJZCA9IG1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRjb25zdCBvbGRPcHRpb25zID0gdGhpcy5nZXRDcmVhdGlvbk9wdGlvbnMob2xkTGFuZ3VhZ2VJZCwgbW9kZWwudXJpLCBtb2RlbC5pc0ZvclNpbXBsZVdpZGdldCk7XG5cdFx0Y29uc3QgbmV3T3B0aW9ucyA9IHRoaXMuZ2V0Q3JlYXRpb25PcHRpb25zKG5ld0xhbmd1YWdlSWQsIG1vZGVsLnVyaSwgbW9kZWwuaXNGb3JTaW1wbGVXaWRnZXQpO1xuXHRcdE1vZGVsU2VydmljZS5fc2V0TW9kZWxPcHRpb25zRm9yTW9kZWwobW9kZWwsIG5ld09wdGlvbnMsIG9sZE9wdGlvbnMpO1xuXHRcdHRoaXMuX29uTW9kZWxNb2RlQ2hhbmdlZC5maXJlKHsgbW9kZWwsIG9sZExhbmd1YWdlSWQ6IG9sZExhbmd1YWdlSWQgfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFNIQTFDb21wdXRlcigpOiBJVGV4dE1vZGVsU0hBMUNvbXB1dGVyIHtcblx0XHRyZXR1cm4gbmV3IERlZmF1bHRNb2RlbFNIQTFDb21wdXRlcigpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRleHRNb2RlbFNIQTFDb21wdXRlciB7XG5cdGNhbkNvbXB1dGVTSEExKG1vZGVsOiBJVGV4dE1vZGVsKTogYm9vbGVhbjtcblx0Y29tcHV0ZVNIQTEobW9kZWw6IElUZXh0TW9kZWwpOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBEZWZhdWx0TW9kZWxTSEExQ29tcHV0ZXIgaW1wbGVtZW50cyBJVGV4dE1vZGVsU0hBMUNvbXB1dGVyIHtcblxuXHRwdWJsaWMgc3RhdGljIE1BWF9NT0RFTF9TSVpFID0gMTAgKiAxMDI0ICogMTAyNDsgLy8gdGFrZXMgMjAwbXMgdG8gY29tcHV0ZSBhIHNoYTEgb24gYSAxME1CIG1vZGVsIG9uIGEgbmV3IG1hY2hpbmVcblxuXHRjYW5Db21wdXRlU0hBMShtb2RlbDogSVRleHRNb2RlbCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAobW9kZWwuZ2V0VmFsdWVMZW5ndGgoKSA8PSBEZWZhdWx0TW9kZWxTSEExQ29tcHV0ZXIuTUFYX01PREVMX1NJWkUpO1xuXHR9XG5cblx0Y29tcHV0ZVNIQTEobW9kZWw6IElUZXh0TW9kZWwpOiBzdHJpbmcge1xuXHRcdC8vIGNvbXB1dGUgdGhlIHNoYTFcblx0XHRjb25zdCBzaGFDb21wdXRlciA9IG5ldyBTdHJpbmdTSEExKCk7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBtb2RlbC5jcmVhdGVTbmFwc2hvdCgpO1xuXHRcdGxldCB0ZXh0OiBzdHJpbmcgfCBudWxsO1xuXHRcdHdoaWxlICgodGV4dCA9IHNuYXBzaG90LnJlYWQoKSkpIHtcblx0XHRcdHNoYUNvbXB1dGVyLnVwZGF0ZSh0ZXh0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHNoYUNvbXB1dGVyLmRpZ2VzdCgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjO0FBQ3ZCLFlBQVksY0FBYztBQUUxQixTQUFvQyw2QkFBNkI7QUFDakUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBbUQ7QUFDNUQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxxQkFBMkM7QUFDcEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxhQUFhO0FBRXRCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0JBQWtCLHFCQUFxQix5QkFBaUc7QUFDakosU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxXQUFXLHdCQUF3QjtBQUM1QyxTQUFTLG1CQUF3QztBQUdqRCxTQUFTLHNDQUFzQztBQUUvQyxTQUFTLFNBQVMsVUFBdUI7QUFDeEMsU0FBTyxTQUFTLFNBQVM7QUFDMUI7QUFFQSxNQUFNLFVBQWlDO0FBQUEsRUFJdEMsWUFDaUIsT0FDaEIsZUFDQSxxQkFDQztBQUhlO0FBSGpCLFNBQWlCLHVCQUF1QixJQUFJLGdCQUFnQjtBQU8zRCxTQUFLLFFBQVE7QUFDYixTQUFLLHFCQUFxQixJQUFJLE1BQU0sY0FBYyxNQUFNLGNBQWMsS0FBSyxDQUFDLENBQUM7QUFDN0UsU0FBSyxxQkFBcUIsSUFBSSxNQUFNLG9CQUFvQixD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
