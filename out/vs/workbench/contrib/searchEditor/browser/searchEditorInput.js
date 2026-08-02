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
import "./media/searchEditor.css";
import { Emitter } from "../../../../base/common/event.js";
import { basename } from "../../../../base/common/path.js";
import { extname, isEqual, joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { TrackedRangeStickiness } from "../../../../editor/common/model.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { localize } from "../../../../nls.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { EditorResourceAccessor, EditorInputCapabilities } from "../../../common/editor.js";
import { Memento } from "../../../common/memento.js";
import { SearchEditorFindMatchClass, SearchEditorInputTypeId, SearchEditorScheme, SearchEditorWorkingCopyTypeId } from "./constants.js";
import { SearchEditorModel, searchEditorModelFactory } from "./searchEditorModel.js";
import { defaultSearchConfig, parseSavedSearchEditor, serializeSearchConfiguration } from "./searchEditorSerialization.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { IWorkingCopyService } from "../../../services/workingCopy/common/workingCopyService.js";
import { WorkingCopyCapabilities } from "../../../services/workingCopy/common/workingCopy.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { bufferToReadable, VSBuffer } from "../../../../base/common/buffer.js";
import { EditorInput } from "../../../common/editor/editorInput.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
const SEARCH_EDITOR_EXT = ".code-search";
const SearchEditorIcon = registerIcon("search-editor-label-icon", Codicon.search, localize("searchEditorLabelIcon", "Icon of the search editor label."));
let SearchEditorInput = class extends EditorInput {
  constructor(modelUri, backingUri, modelService, textFileService, fileDialogService, instantiationService, workingCopyService, telemetryService, pathService, storageService) {
    super();
    this.modelUri = modelUri;
    this.backingUri = backingUri;
    this.modelService = modelService;
    this.textFileService = textFileService;
    this.fileDialogService = fileDialogService;
    this.instantiationService = instantiationService;
    this.workingCopyService = workingCopyService;
    this.telemetryService = telemetryService;
    this.pathService = pathService;
    this.dirty = false;
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this._onDidSave = this._register(new Emitter());
    this.onDidSave = this._onDidSave.event;
    this.oldDecorationsIDs = [];
    this.model = instantiationService.createInstance(SearchEditorModel, modelUri);
    if (this.modelUri.scheme !== SearchEditorScheme) {
      throw Error("SearchEditorInput must be invoked with a SearchEditorScheme uri");
    }
    this.memento = new Memento(SearchEditorInput.ID, storageService);
    this._register(storageService.onWillSaveState(() => this.memento.saveMemento()));
    const input = this;
    const workingCopyAdapter = new class {
      constructor() {
        this.typeId = SearchEditorWorkingCopyTypeId;
        this.resource = input.modelUri;
        this.capabilities = input.hasCapability(EditorInputCapabilities.Untitled) ? WorkingCopyCapabilities.Untitled : WorkingCopyCapabilities.None;
        this.onDidChangeDirty = input.onDidChangeDirty;
        this.onDidChangeContent = input.onDidChangeContent;
        this.onDidSave = input.onDidSave;
      }
      get name() {
        return input.getName();
      }
      isDirty() {
        return input.isDirty();
      }
      isModified() {
        return input.isDirty();
      }
      backup(token) {
        return input.backup(token);
      }
      save(options) {
        return input.save(0, options).then((editor) => !!editor);
      }
      revert(options) {
        return input.revert(0, options);
      }
    }();
    this._register(this.workingCopyService.registerWorkingCopy(workingCopyAdapter));
  }
  get typeId() {
    return SearchEditorInput.ID;
  }
  get editorId() {
    return this.typeId;
  }
  getIcon() {
    return SearchEditorIcon;
  }
  get capabilities() {
    let capabilities = EditorInputCapabilities.None;
    if (!this.backingUri) {
      capabilities |= EditorInputCapabilities.Untitled;
    }
    return capabilities;
  }
  get resource() {
    return this.backingUri || this.modelUri;
  }
  async save(group, options) {
    if ((await this.resolveModels()).resultsModel.isDisposed()) {
      return;
    }
    if (this.backingUri) {
      await this.textFileService.write(this.backingUri, await this.serializeForDisk(), options);
      this.setDirty(false);
      this._onDidSave.fire({ reason: options?.reason, source: options?.source });
      return this;
    } else {
      return this.saveAs(group, options);
    }
  }
  tryReadConfigSync() {
    return this._cachedConfigurationModel?.config;
  }
  async serializeForDisk() {
    const { configurationModel, resultsModel } = await this.resolveModels();
    return serializeSearchConfiguration(configurationModel.config) + "\n" + resultsModel.getValue();
  }
  registerConfigChangeListeners(model) {
    this.configChangeListenerDisposable?.dispose();
    if (!this.isDisposed()) {
      this.configChangeListenerDisposable = model.onConfigDidUpdate(() => {
        if (this.lastLabel !== this.getName()) {
          this._onDidChangeLabel.fire();
          this.lastLabel = this.getName();
        }
        this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE).searchConfig = model.config;
      });
      this._register(this.configChangeListenerDisposable);
    }
  }
  async resolveModels() {
    return this.model.resolve().then((data) => {
      this._cachedResultsModel = data.resultsModel;
      this._cachedConfigurationModel = data.configurationModel;
      if (this.lastLabel !== this.getName()) {
        this._onDidChangeLabel.fire();
        this.lastLabel = this.getName();
      }
      this.registerConfigChangeListeners(data.configurationModel);
      return data;
    });
  }
  async saveAs(group, options) {
    const path = await this.fileDialogService.pickFileToSave(await this.suggestFileName(), options?.availableFileSystems);
    if (path) {
      this.telemetryService.publicLog2("searchEditor/saveSearchResults");
      const toWrite = await this.serializeForDisk();
      if (await this.textFileService.create([{ resource: path, value: toWrite, options: { overwrite: true } }])) {
        this.setDirty(false);
        if (!isEqual(path, this.modelUri)) {
          const input = this.instantiationService.invokeFunction(getOrMakeSearchEditorInput, { fileUri: path, from: "existingFile" });
          input.setMatchRanges(this.getMatchRanges());
          return input;
        }
        return this;
      }
    }
    return void 0;
  }
  getName(maxLength = 12) {
    const trimToMax = (label) => label.length < maxLength ? label : `${label.slice(0, maxLength - 3)}...`;
    if (this.backingUri) {
      const originalURI = EditorResourceAccessor.getOriginalUri(this);
      return localize("searchTitle.withQuery", "Search: {0}", basename((originalURI ?? this.backingUri).path, SEARCH_EDITOR_EXT));
    }
    const query = this._cachedConfigurationModel?.config?.query?.trim();
    if (query) {
      return localize("searchTitle.withQuery", "Search: {0}", trimToMax(query));
    }
    return localize("searchTitle", "Search");
  }
  setDirty(dirty) {
    const wasDirty = this.dirty;
    this.dirty = dirty;
    if (wasDirty !== dirty) {
      this._onDidChangeDirty.fire();
    }
  }
  isDirty() {
    return this.dirty;
  }
  async rename(group, target) {
    if (extname(target) === SEARCH_EDITOR_EXT) {
      return {
        editor: this.instantiationService.invokeFunction(getOrMakeSearchEditorInput, { from: "existingFile", fileUri: target })
      };
    }
    return void 0;
  }
  dispose() {
    this.modelService.destroyModel(this.modelUri);
    super.dispose();
  }
  matches(other) {
    if (super.matches(other)) {
      return true;
    }
    if (other instanceof SearchEditorInput) {
      return !!(other.modelUri.fragment && other.modelUri.fragment === this.modelUri.fragment) || !!(other.backingUri && isEqual(other.backingUri, this.backingUri));
    }
    return false;
  }
  getMatchRanges() {
    return (this._cachedResultsModel?.getAllDecorations() ?? []).filter((decoration) => decoration.options.className === SearchEditorFindMatchClass).filter(({ range }) => !(range.startColumn === 1 && range.endColumn === 1)).map(({ range }) => range);
  }
  async setMatchRanges(ranges) {
    this.oldDecorationsIDs = (await this.resolveModels()).resultsModel.deltaDecorations(this.oldDecorationsIDs, ranges.map((range) => ({ range, options: { description: "search-editor-find-match", className: SearchEditorFindMatchClass, stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } })));
  }
  async revert(group, options) {
    if (options?.soft) {
      this.setDirty(false);
      return;
    }
    if (this.backingUri) {
      const { config, text } = await this.instantiationService.invokeFunction(parseSavedSearchEditor, this.backingUri);
      const { resultsModel, configurationModel } = await this.resolveModels();
      resultsModel.setValue(text);
      configurationModel.updateConfig(config);
    } else {
      (await this.resolveModels()).resultsModel.setValue("");
    }
    super.revert(group, options);
    this.setDirty(false);
  }
  async backup(token) {
    const contents = await this.serializeForDisk();
    if (token.isCancellationRequested) {
      return {};
    }
    return {
      content: bufferToReadable(VSBuffer.fromString(contents))
    };
  }
  async suggestFileName() {
    const query = (await this.resolveModels()).configurationModel.config.query;
    const searchFileName = (query.replace(/[^\w \-_]+/g, "_") || "Search") + SEARCH_EDITOR_EXT;
    return joinPath(await this.fileDialogService.defaultFilePath(this.pathService.defaultUriScheme), searchFileName);
  }
  toUntyped() {
    if (this.hasCapability(EditorInputCapabilities.Untitled)) {
      return void 0;
    }
    return {
      resource: this.resource,
      options: {
        override: SearchEditorInput.ID
      }
    };
  }
  copy() {
    const newModelUri = URI.from({ scheme: SearchEditorScheme, fragment: `${Math.random()}` });
    const config = this._cachedConfigurationModel?.config ?? {};
    const results = this._cachedResultsModel?.getValue() ?? "";
    return this.instantiationService.invokeFunction(
      getOrMakeSearchEditorInput,
      // eslint-disable-next-line local/code-no-any-casts
      { from: "rawData", config, resultsContents: results, modelUri: newModelUri }
      // modelUri is not in the type, but we handle it below
    );
  }
};
SearchEditorInput.ID = SearchEditorInputTypeId;
SearchEditorInput = __decorateClass([
  __decorateParam(2, IModelService),
  __decorateParam(3, ITextFileService),
  __decorateParam(4, IFileDialogService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IWorkingCopyService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IPathService),
  __decorateParam(9, IStorageService)
], SearchEditorInput);
const getOrMakeSearchEditorInput = (accessor, existingData) => {
  const storageService = accessor.get(IStorageService);
  const configurationService = accessor.get(IConfigurationService);
  const instantiationService = accessor.get(IInstantiationService);
  let modelUri;
  if (existingData.from === "model") {
    modelUri = existingData.modelUri;
  } else if (existingData.from === "rawData" && existingData.modelUri) {
    modelUri = existingData.modelUri;
  } else {
    modelUri = URI.from({ scheme: SearchEditorScheme, fragment: `${Math.random()}` });
  }
  if (!searchEditorModelFactory.models.has(modelUri)) {
    if (existingData.from === "existingFile") {
      instantiationService.invokeFunction((accessor2) => searchEditorModelFactory.initializeModelFromExistingFile(accessor2, modelUri, existingData.fileUri));
    } else {
      const searchEditorSettings = configurationService.getValue("search").searchEditor;
      const reuseOldSettings = searchEditorSettings.reusePriorSearchConfiguration;
      const defaultNumberOfContextLines = searchEditorSettings.defaultNumberOfContextLines;
      const priorConfig = reuseOldSettings ? new Memento(SearchEditorInput.ID, storageService).getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE).searchConfig ?? {} : {};
      const defaultConfig = defaultSearchConfig();
      const config = { ...defaultConfig, ...priorConfig, ...existingData.config };
      if (defaultNumberOfContextLines !== null && defaultNumberOfContextLines !== void 0) {
        config.contextLines = existingData?.config?.contextLines ?? defaultNumberOfContextLines;
      }
      if (existingData.from === "rawData") {
        if (existingData.resultsContents) {
          config.contextLines = 0;
        }
        instantiationService.invokeFunction((accessor2) => searchEditorModelFactory.initializeModelFromRawData(accessor2, modelUri, config, existingData.resultsContents));
      } else {
        instantiationService.invokeFunction((accessor2) => searchEditorModelFactory.initializeModelFromExistingModel(accessor2, modelUri, config));
      }
    }
  }
  return instantiationService.createInstance(
    SearchEditorInput,
    modelUri,
    existingData.from === "existingFile" ? existingData.fileUri : existingData.from === "model" ? existingData.backupOf : void 0
  );
};
export {
  SEARCH_EDITOR_EXT,
  SearchEditorInput,
  getOrMakeSearchEditorInput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaEVkaXRvci9icm93c2VyL3NlYXJjaEVkaXRvcklucHV0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3NlYXJjaEVkaXRvci5jc3MnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZXh0bmFtZSwgaXNFcXVhbCwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBHcm91cElkZW50aWZpZXIsIElSZXZlcnRPcHRpb25zLCBJU2F2ZU9wdGlvbnMsIEVkaXRvclJlc291cmNlQWNjZXNzb3IsIElNb3ZlUmVzdWx0LCBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgSVVudHlwZWRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgTWVtZW50byB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tZW1lbnRvLmpzJztcbmltcG9ydCB7IFNlYXJjaEVkaXRvckZpbmRNYXRjaENsYXNzLCBTZWFyY2hFZGl0b3JJbnB1dFR5cGVJZCwgU2VhcmNoRWRpdG9yU2NoZW1lLCBTZWFyY2hFZGl0b3JXb3JraW5nQ29weVR5cGVJZCwgU2VhcmNoQ29uZmlndXJhdGlvbiB9IGZyb20gJy4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IFNlYXJjaENvbmZpZ3VyYXRpb25Nb2RlbCwgU2VhcmNoRWRpdG9yTW9kZWwsIHNlYXJjaEVkaXRvck1vZGVsRmFjdG9yeSB9IGZyb20gJy4vc2VhcmNoRWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgZGVmYXVsdFNlYXJjaENvbmZpZywgcGFyc2VTYXZlZFNlYXJjaEVkaXRvciwgc2VyaWFsaXplU2VhcmNoQ29uZmlndXJhdGlvbiB9IGZyb20gJy4vc2VhcmNoRWRpdG9yU2VyaWFsaXphdGlvbi5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTYXZlT3B0aW9ucywgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5LCBJV29ya2luZ0NvcHlCYWNrdXAsIElXb3JraW5nQ29weVNhdmVFdmVudCwgV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU2VhcmNoQ29tcGxldGUsIElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IGJ1ZmZlclRvUmVhZGFibGUsIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5cbmV4cG9ydCBjb25zdCBTRUFSQ0hfRURJVE9SX0VYVCA9ICcuY29kZS1zZWFyY2gnO1xuXG5jb25zdCBTZWFyY2hFZGl0b3JJY29uID0gcmVnaXN0ZXJJY29uKCdzZWFyY2gtZWRpdG9yLWxhYmVsLWljb24nLCBDb2RpY29uLnNlYXJjaCwgbG9jYWxpemUoJ3NlYXJjaEVkaXRvckxhYmVsSWNvbicsICdJY29uIG9mIHRoZSBzZWFyY2ggZWRpdG9yIGxhYmVsLicpKTtcblxuZXhwb3J0IGNsYXNzIFNlYXJjaEVkaXRvcklucHV0IGV4dGVuZHMgRWRpdG9ySW5wdXQge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9IFNlYXJjaEVkaXRvcklucHV0VHlwZUlkO1xuXG5cdG92ZXJyaWRlIGdldCB0eXBlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gU2VhcmNoRWRpdG9ySW5wdXQuSUQ7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgZWRpdG9ySWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy50eXBlSWQ7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRJY29uKCk6IFRoZW1lSWNvbiB7XG5cdFx0cmV0dXJuIFNlYXJjaEVkaXRvckljb247XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgY2FwYWJpbGl0aWVzKCk6IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzIHtcblx0XHRsZXQgY2FwYWJpbGl0aWVzID0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuTm9uZTtcblx0XHRpZiAoIXRoaXMuYmFja2luZ1VyaSkge1xuXHRcdFx0Y2FwYWJpbGl0aWVzIHw9IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlVudGl0bGVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBjYXBhYmlsaXRpZXM7XG5cdH1cblxuXHRwcml2YXRlIG1lbWVudG86IE1lbWVudG88eyBzZWFyY2hDb25maWc6IFNlYXJjaENvbmZpZ3VyYXRpb24gfT47XG5cblx0cHJpdmF0ZSBkaXJ0eTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgbGFzdExhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb250ZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTYXZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdvcmtpbmdDb3B5U2F2ZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTYXZlOiBFdmVudDxJV29ya2luZ0NvcHlTYXZlRXZlbnQ+ID0gdGhpcy5fb25EaWRTYXZlLmV2ZW50O1xuXG5cdHByaXZhdGUgb2xkRGVjb3JhdGlvbnNJRHM6IHN0cmluZ1tdID0gW107XG5cblx0Z2V0IHJlc291cmNlKCkge1xuXHRcdHJldHVybiB0aGlzLmJhY2tpbmdVcmkgfHwgdGhpcy5tb2RlbFVyaTtcblx0fVxuXG5cdHB1YmxpYyBvbmdvaW5nU2VhcmNoT3BlcmF0aW9uOiBQcm9taXNlPElTZWFyY2hDb21wbGV0ZT4gfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIG1vZGVsOiBTZWFyY2hFZGl0b3JNb2RlbDtcblx0cHJpdmF0ZSBfY2FjaGVkUmVzdWx0c01vZGVsOiBJVGV4dE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jYWNoZWRDb25maWd1cmF0aW9uTW9kZWw6IFNlYXJjaENvbmZpZ3VyYXRpb25Nb2RlbCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbW9kZWxVcmk6IFVSSSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYmFja2luZ1VyaTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weVNlcnZpY2U6IElXb3JraW5nQ29weVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5tb2RlbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaEVkaXRvck1vZGVsLCBtb2RlbFVyaSk7XG5cblx0XHRpZiAodGhpcy5tb2RlbFVyaS5zY2hlbWUgIT09IFNlYXJjaEVkaXRvclNjaGVtZSkge1xuXHRcdFx0dGhyb3cgRXJyb3IoJ1NlYXJjaEVkaXRvcklucHV0IG11c3QgYmUgaW52b2tlZCB3aXRoIGEgU2VhcmNoRWRpdG9yU2NoZW1lIHVyaScpO1xuXHRcdH1cblxuXHRcdHRoaXMubWVtZW50byA9IG5ldyBNZW1lbnRvKFNlYXJjaEVkaXRvcklucHV0LklELCBzdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKCgpID0+IHRoaXMubWVtZW50by5zYXZlTWVtZW50bygpKSk7XG5cblx0XHRjb25zdCBpbnB1dCA9IHRoaXM7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlBZGFwdGVyID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSVdvcmtpbmdDb3B5IHtcblx0XHRcdHJlYWRvbmx5IHR5cGVJZCA9IFNlYXJjaEVkaXRvcldvcmtpbmdDb3B5VHlwZUlkO1xuXHRcdFx0cmVhZG9ubHkgcmVzb3VyY2UgPSBpbnB1dC5tb2RlbFVyaTtcblx0XHRcdGdldCBuYW1lKCkgeyByZXR1cm4gaW5wdXQuZ2V0TmFtZSgpOyB9XG5cdFx0XHRyZWFkb25seSBjYXBhYmlsaXRpZXMgPSBpbnB1dC5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlVudGl0bGVkKSA/IFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzLlVudGl0bGVkIDogV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMuTm9uZTtcblx0XHRcdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGlydHkgPSBpbnB1dC5vbkRpZENoYW5nZURpcnR5O1xuXHRcdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50ID0gaW5wdXQub25EaWRDaGFuZ2VDb250ZW50O1xuXHRcdFx0cmVhZG9ubHkgb25EaWRTYXZlID0gaW5wdXQub25EaWRTYXZlO1xuXHRcdFx0aXNEaXJ0eSgpOiBib29sZWFuIHsgcmV0dXJuIGlucHV0LmlzRGlydHkoKTsgfVxuXHRcdFx0aXNNb2RpZmllZCgpOiBib29sZWFuIHsgcmV0dXJuIGlucHV0LmlzRGlydHkoKTsgfVxuXHRcdFx0YmFja3VwKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVdvcmtpbmdDb3B5QmFja3VwPiB7IHJldHVybiBpbnB1dC5iYWNrdXAodG9rZW4pOyB9XG5cdFx0XHRzYXZlKG9wdGlvbnM/OiBJU2F2ZU9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIGlucHV0LnNhdmUoMCwgb3B0aW9ucykudGhlbihlZGl0b3IgPT4gISFlZGl0b3IpOyB9XG5cdFx0XHRyZXZlcnQob3B0aW9ucz86IElSZXZlcnRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiBpbnB1dC5yZXZlcnQoMCwgb3B0aW9ucyk7IH1cblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3JraW5nQ29weVNlcnZpY2UucmVnaXN0ZXJXb3JraW5nQ29weSh3b3JraW5nQ29weUFkYXB0ZXIpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNhdmUoZ3JvdXA6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElUZXh0RmlsZVNhdmVPcHRpb25zKTogUHJvbWlzZTxFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICgoKGF3YWl0IHRoaXMucmVzb2x2ZU1vZGVscygpKS5yZXN1bHRzTW9kZWwpLmlzRGlzcG9zZWQoKSkgeyByZXR1cm47IH1cblxuXHRcdGlmICh0aGlzLmJhY2tpbmdVcmkpIHtcblx0XHRcdGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLndyaXRlKHRoaXMuYmFja2luZ1VyaSwgYXdhaXQgdGhpcy5zZXJpYWxpemVGb3JEaXNrKCksIG9wdGlvbnMpO1xuXHRcdFx0dGhpcy5zZXREaXJ0eShmYWxzZSk7XG5cdFx0XHR0aGlzLl9vbkRpZFNhdmUuZmlyZSh7IHJlYXNvbjogb3B0aW9ucz8ucmVhc29uLCBzb3VyY2U6IG9wdGlvbnM/LnNvdXJjZSB9KTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zYXZlQXMoZ3JvdXAsIG9wdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB0cnlSZWFkQ29uZmlnU3luYygpOiBTZWFyY2hDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY2FjaGVkQ29uZmlndXJhdGlvbk1vZGVsPy5jb25maWc7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNlcmlhbGl6ZUZvckRpc2soKSB7XG5cdFx0Y29uc3QgeyBjb25maWd1cmF0aW9uTW9kZWwsIHJlc3VsdHNNb2RlbCB9ID0gYXdhaXQgdGhpcy5yZXNvbHZlTW9kZWxzKCk7XG5cdFx0cmV0dXJuIHNlcmlhbGl6ZVNlYXJjaENvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbk1vZGVsLmNvbmZpZykgKyAnXFxuJyArIHJlc3VsdHNNb2RlbC5nZXRWYWx1ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb25maWdDaGFuZ2VMaXN0ZW5lckRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlZ2lzdGVyQ29uZmlnQ2hhbmdlTGlzdGVuZXJzKG1vZGVsOiBTZWFyY2hDb25maWd1cmF0aW9uTW9kZWwpIHtcblx0XHR0aGlzLmNvbmZpZ0NoYW5nZUxpc3RlbmVyRGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdGlmICghdGhpcy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHRoaXMuY29uZmlnQ2hhbmdlTGlzdGVuZXJEaXNwb3NhYmxlID0gbW9kZWwub25Db25maWdEaWRVcGRhdGUoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5sYXN0TGFiZWwgIT09IHRoaXMuZ2V0TmFtZSgpKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMYWJlbC5maXJlKCk7XG5cdFx0XHRcdFx0dGhpcy5sYXN0TGFiZWwgPSB0aGlzLmdldE5hbWUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLm1lbWVudG8uZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpLnNlYXJjaENvbmZpZyA9IG1vZGVsLmNvbmZpZztcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWdDaGFuZ2VMaXN0ZW5lckRpc3Bvc2FibGUpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc29sdmVNb2RlbHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwucmVzb2x2ZSgpLnRoZW4oZGF0YSA9PiB7XG5cdFx0XHR0aGlzLl9jYWNoZWRSZXN1bHRzTW9kZWwgPSBkYXRhLnJlc3VsdHNNb2RlbDtcblx0XHRcdHRoaXMuX2NhY2hlZENvbmZpZ3VyYXRpb25Nb2RlbCA9IGRhdGEuY29uZmlndXJhdGlvbk1vZGVsO1xuXHRcdFx0aWYgKHRoaXMubGFzdExhYmVsICE9PSB0aGlzLmdldE5hbWUoKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxhYmVsLmZpcmUoKTtcblx0XHRcdFx0dGhpcy5sYXN0TGFiZWwgPSB0aGlzLmdldE5hbWUoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMucmVnaXN0ZXJDb25maWdDaGFuZ2VMaXN0ZW5lcnMoZGF0YS5jb25maWd1cmF0aW9uTW9kZWwpO1xuXHRcdFx0cmV0dXJuIGRhdGE7XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzYXZlQXMoZ3JvdXA6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElUZXh0RmlsZVNhdmVPcHRpb25zKTogUHJvbWlzZTxFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBhdGggPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnBpY2tGaWxlVG9TYXZlKGF3YWl0IHRoaXMuc3VnZ2VzdEZpbGVOYW1lKCksIG9wdGlvbnM/LmF2YWlsYWJsZUZpbGVTeXN0ZW1zKTtcblx0XHRpZiAocGF0aCkge1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8XG5cdFx0XHRcdHt9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3duZXI6ICdyb2Jsb3VyZW5zJztcblx0XHRcdFx0XHRjb21tZW50OiAnRmlyZWQgd2hlbiBhIHNlYXJjaCBlZGl0b3IgaXMgc2F2ZWQnO1xuXHRcdFx0XHR9PlxuXHRcdFx0XHQoJ3NlYXJjaEVkaXRvci9zYXZlU2VhcmNoUmVzdWx0cycpO1xuXHRcdFx0Y29uc3QgdG9Xcml0ZSA9IGF3YWl0IHRoaXMuc2VyaWFsaXplRm9yRGlzaygpO1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLmNyZWF0ZShbeyByZXNvdXJjZTogcGF0aCwgdmFsdWU6IHRvV3JpdGUsIG9wdGlvbnM6IHsgb3ZlcndyaXRlOiB0cnVlIH0gfV0pKSB7XG5cdFx0XHRcdHRoaXMuc2V0RGlydHkoZmFsc2UpO1xuXHRcdFx0XHRpZiAoIWlzRXF1YWwocGF0aCwgdGhpcy5tb2RlbFVyaSkpIHtcblx0XHRcdFx0XHRjb25zdCBpbnB1dCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0T3JNYWtlU2VhcmNoRWRpdG9ySW5wdXQsIHsgZmlsZVVyaTogcGF0aCwgZnJvbTogJ2V4aXN0aW5nRmlsZScgfSk7XG5cdFx0XHRcdFx0aW5wdXQuc2V0TWF0Y2hSYW5nZXModGhpcy5nZXRNYXRjaFJhbmdlcygpKTtcblx0XHRcdFx0XHRyZXR1cm4gaW5wdXQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBnZXROYW1lKG1heExlbmd0aCA9IDEyKTogc3RyaW5nIHtcblx0XHRjb25zdCB0cmltVG9NYXggPSAobGFiZWw6IHN0cmluZykgPT4gKGxhYmVsLmxlbmd0aCA8IG1heExlbmd0aCA/IGxhYmVsIDogYCR7bGFiZWwuc2xpY2UoMCwgbWF4TGVuZ3RoIC0gMyl9Li4uYCk7XG5cblx0XHRpZiAodGhpcy5iYWNraW5nVXJpKSB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFVSSSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkodGhpcyk7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NlYXJjaFRpdGxlLndpdGhRdWVyeScsIFwiU2VhcmNoOiB7MH1cIiwgYmFzZW5hbWUoKG9yaWdpbmFsVVJJID8/IHRoaXMuYmFja2luZ1VyaSkucGF0aCwgU0VBUkNIX0VESVRPUl9FWFQpKTtcblx0XHR9XG5cblx0XHRjb25zdCBxdWVyeSA9IHRoaXMuX2NhY2hlZENvbmZpZ3VyYXRpb25Nb2RlbD8uY29uZmlnPy5xdWVyeT8udHJpbSgpO1xuXHRcdGlmIChxdWVyeSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzZWFyY2hUaXRsZS53aXRoUXVlcnknLCBcIlNlYXJjaDogezB9XCIsIHRyaW1Ub01heChxdWVyeSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gbG9jYWxpemUoJ3NlYXJjaFRpdGxlJywgXCJTZWFyY2hcIik7XG5cdH1cblxuXHRzZXREaXJ0eShkaXJ0eTogYm9vbGVhbikge1xuXHRcdGNvbnN0IHdhc0RpcnR5ID0gdGhpcy5kaXJ0eTtcblx0XHR0aGlzLmRpcnR5ID0gZGlydHk7XG5cdFx0aWYgKHdhc0RpcnR5ICE9PSBkaXJ0eSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgaXNEaXJ0eSgpIHtcblx0XHRyZXR1cm4gdGhpcy5kaXJ0eTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlbmFtZShncm91cDogR3JvdXBJZGVudGlmaWVyLCB0YXJnZXQ6IFVSSSk6IFByb21pc2U8SU1vdmVSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoZXh0bmFtZSh0YXJnZXQpID09PSBTRUFSQ0hfRURJVE9SX0VYVCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZWRpdG9yOiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGdldE9yTWFrZVNlYXJjaEVkaXRvcklucHV0LCB7IGZyb206ICdleGlzdGluZ0ZpbGUnLCBmaWxlVXJpOiB0YXJnZXQgfSlcblx0XHRcdH07XG5cdFx0fVxuXHRcdC8vIElnbm9yZSBtb3ZlIGlmIGVkaXRvciB3YXMgcmVuYW1lZCB0byBhIGRpZmZlcmVudCBmaWxlIGV4dGVuc2lvblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMubW9kZWxTZXJ2aWNlLmRlc3Ryb3lNb2RlbCh0aGlzLm1vZGVsVXJpKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBtYXRjaGVzKG90aGVyOiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRpZiAoc3VwZXIubWF0Y2hlcyhvdGhlcikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChvdGhlciBpbnN0YW5jZW9mIFNlYXJjaEVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4gISEob3RoZXIubW9kZWxVcmkuZnJhZ21lbnQgJiYgb3RoZXIubW9kZWxVcmkuZnJhZ21lbnQgPT09IHRoaXMubW9kZWxVcmkuZnJhZ21lbnQpIHx8ICEhKG90aGVyLmJhY2tpbmdVcmkgJiYgaXNFcXVhbChvdGhlci5iYWNraW5nVXJpLCB0aGlzLmJhY2tpbmdVcmkpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Z2V0TWF0Y2hSYW5nZXMoKTogUmFuZ2VbXSB7XG5cdFx0cmV0dXJuICh0aGlzLl9jYWNoZWRSZXN1bHRzTW9kZWw/LmdldEFsbERlY29yYXRpb25zKCkgPz8gW10pXG5cdFx0XHQuZmlsdGVyKGRlY29yYXRpb24gPT4gZGVjb3JhdGlvbi5vcHRpb25zLmNsYXNzTmFtZSA9PT0gU2VhcmNoRWRpdG9yRmluZE1hdGNoQ2xhc3MpXG5cdFx0XHQuZmlsdGVyKCh7IHJhbmdlIH0pID0+ICEocmFuZ2Uuc3RhcnRDb2x1bW4gPT09IDEgJiYgcmFuZ2UuZW5kQ29sdW1uID09PSAxKSlcblx0XHRcdC5tYXAoKHsgcmFuZ2UgfSkgPT4gcmFuZ2UpO1xuXHR9XG5cblx0YXN5bmMgc2V0TWF0Y2hSYW5nZXMocmFuZ2VzOiBSYW5nZVtdKSB7XG5cdFx0dGhpcy5vbGREZWNvcmF0aW9uc0lEcyA9IChhd2FpdCB0aGlzLnJlc29sdmVNb2RlbHMoKSkucmVzdWx0c01vZGVsLmRlbHRhRGVjb3JhdGlvbnModGhpcy5vbGREZWNvcmF0aW9uc0lEcywgcmFuZ2VzLm1hcChyYW5nZSA9PlxuXHRcdFx0KHsgcmFuZ2UsIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICdzZWFyY2gtZWRpdG9yLWZpbmQtbWF0Y2gnLCBjbGFzc05hbWU6IFNlYXJjaEVkaXRvckZpbmRNYXRjaENsYXNzLCBzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyB9IH0pKSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZXZlcnQoZ3JvdXA6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElSZXZlcnRPcHRpb25zKSB7XG5cdFx0aWYgKG9wdGlvbnM/LnNvZnQpIHtcblx0XHRcdHRoaXMuc2V0RGlydHkoZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmJhY2tpbmdVcmkpIHtcblx0XHRcdGNvbnN0IHsgY29uZmlnLCB0ZXh0IH0gPSBhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHBhcnNlU2F2ZWRTZWFyY2hFZGl0b3IsIHRoaXMuYmFja2luZ1VyaSk7XG5cdFx0XHRjb25zdCB7IHJlc3VsdHNNb2RlbCwgY29uZmlndXJhdGlvbk1vZGVsIH0gPSBhd2FpdCB0aGlzLnJlc29sdmVNb2RlbHMoKTtcblx0XHRcdHJlc3VsdHNNb2RlbC5zZXRWYWx1ZSh0ZXh0KTtcblx0XHRcdGNvbmZpZ3VyYXRpb25Nb2RlbC51cGRhdGVDb25maWcoY29uZmlnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0KGF3YWl0IHRoaXMucmVzb2x2ZU1vZGVscygpKS5yZXN1bHRzTW9kZWwuc2V0VmFsdWUoJycpO1xuXHRcdH1cblx0XHRzdXBlci5yZXZlcnQoZ3JvdXAsIG9wdGlvbnMpO1xuXHRcdHRoaXMuc2V0RGlydHkoZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBiYWNrdXAodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJV29ya2luZ0NvcHlCYWNrdXA+IHtcblx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMuc2VyaWFsaXplRm9yRGlzaygpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudHMpKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN1Z2dlc3RGaWxlTmFtZSgpOiBQcm9taXNlPFVSST4ge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gKGF3YWl0IHRoaXMucmVzb2x2ZU1vZGVscygpKS5jb25maWd1cmF0aW9uTW9kZWwuY29uZmlnLnF1ZXJ5O1xuXHRcdGNvbnN0IHNlYXJjaEZpbGVOYW1lID0gKHF1ZXJ5LnJlcGxhY2UoL1teXFx3IFxcLV9dKy9nLCAnXycpIHx8ICdTZWFyY2gnKSArIFNFQVJDSF9FRElUT1JfRVhUO1xuXHRcdHJldHVybiBqb2luUGF0aChhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLmRlZmF1bHRGaWxlUGF0aCh0aGlzLnBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWUpLCBzZWFyY2hGaWxlTmFtZSk7XG5cdH1cblxuXHRvdmVycmlkZSB0b1VudHlwZWQoKTogSVJlc291cmNlRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvdXJjZTogdGhpcy5yZXNvdXJjZSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0b3ZlcnJpZGU6IFNlYXJjaEVkaXRvcklucHV0LklEXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGNvcHkoKTogRWRpdG9ySW5wdXQge1xuXHRcdC8vIEdlbmVyYXRlIGEgbmV3IG1vZGVsVXJpIGZvciB0aGUgc3BsaXQgZWRpdG9yXG5cdFx0Y29uc3QgbmV3TW9kZWxVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2VhcmNoRWRpdG9yU2NoZW1lLCBmcmFnbWVudDogYCR7TWF0aC5yYW5kb20oKX1gIH0pO1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2NhY2hlZENvbmZpZ3VyYXRpb25Nb2RlbD8uY29uZmlnID8/IHt9O1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB0aGlzLl9jYWNoZWRSZXN1bHRzTW9kZWw/LmdldFZhbHVlKCkgPz8gJyc7XG5cdFx0Ly8gVXNlIHRoZSAncmF3RGF0YScgdmFyaWFudCBhbmQgcGFzcyBtb2RlbFVyaVxuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKFxuXHRcdFx0Z2V0T3JNYWtlU2VhcmNoRWRpdG9ySW5wdXQsXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHsgZnJvbTogJ3Jhd0RhdGEnLCBjb25maWcsIHJlc3VsdHNDb250ZW50czogcmVzdWx0cywgbW9kZWxVcmk6IG5ld01vZGVsVXJpIH0gYXMgYW55IC8vIG1vZGVsVXJpIGlzIG5vdCBpbiB0aGUgdHlwZSwgYnV0IHdlIGhhbmRsZSBpdCBiZWxvd1xuXHRcdCk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGdldE9yTWFrZVNlYXJjaEVkaXRvcklucHV0ID0gKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0ZXhpc3RpbmdEYXRhOiAoXG5cdFx0fCB7IGZyb206ICdtb2RlbCc7IGNvbmZpZz86IFBhcnRpYWw8U2VhcmNoQ29uZmlndXJhdGlvbj47IG1vZGVsVXJpOiBVUkk7IGJhY2t1cE9mPzogVVJJIH1cblx0XHR8IHsgZnJvbTogJ3Jhd0RhdGEnOyByZXN1bHRzQ29udGVudHM6IHN0cmluZyB8IHVuZGVmaW5lZDsgY29uZmlnOiBQYXJ0aWFsPFNlYXJjaENvbmZpZ3VyYXRpb24+OyBtb2RlbFVyaT86IFVSSSB9XG5cdFx0fCB7IGZyb206ICdleGlzdGluZ0ZpbGUnOyBmaWxlVXJpOiBVUkkgfSlcbik6IFNlYXJjaEVkaXRvcklucHV0ID0+IHtcblxuXHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdGxldCBtb2RlbFVyaTogVVJJO1xuXHRpZiAoZXhpc3RpbmdEYXRhLmZyb20gPT09ICdtb2RlbCcpIHtcblx0XHRtb2RlbFVyaSA9IGV4aXN0aW5nRGF0YS5tb2RlbFVyaTtcblx0fSBlbHNlIGlmIChleGlzdGluZ0RhdGEuZnJvbSA9PT0gJ3Jhd0RhdGEnICYmIGV4aXN0aW5nRGF0YS5tb2RlbFVyaSkge1xuXHRcdG1vZGVsVXJpID0gZXhpc3RpbmdEYXRhLm1vZGVsVXJpO1xuXHR9IGVsc2Uge1xuXHRcdG1vZGVsVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNlYXJjaEVkaXRvclNjaGVtZSwgZnJhZ21lbnQ6IGAke01hdGgucmFuZG9tKCl9YCB9KTtcblx0fVxuXG5cdGlmICghc2VhcmNoRWRpdG9yTW9kZWxGYWN0b3J5Lm1vZGVscy5oYXMobW9kZWxVcmkpKSB7XG5cdFx0aWYgKGV4aXN0aW5nRGF0YS5mcm9tID09PSAnZXhpc3RpbmdGaWxlJykge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gc2VhcmNoRWRpdG9yTW9kZWxGYWN0b3J5LmluaXRpYWxpemVNb2RlbEZyb21FeGlzdGluZ0ZpbGUoYWNjZXNzb3IsIG1vZGVsVXJpLCBleGlzdGluZ0RhdGEuZmlsZVVyaSkpO1xuXHRcdH0gZWxzZSB7XG5cblx0XHRcdGNvbnN0IHNlYXJjaEVkaXRvclNldHRpbmdzID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzPignc2VhcmNoJykuc2VhcmNoRWRpdG9yO1xuXG5cdFx0XHRjb25zdCByZXVzZU9sZFNldHRpbmdzID0gc2VhcmNoRWRpdG9yU2V0dGluZ3MucmV1c2VQcmlvclNlYXJjaENvbmZpZ3VyYXRpb247XG5cdFx0XHRjb25zdCBkZWZhdWx0TnVtYmVyT2ZDb250ZXh0TGluZXMgPSBzZWFyY2hFZGl0b3JTZXR0aW5ncy5kZWZhdWx0TnVtYmVyT2ZDb250ZXh0TGluZXM7XG5cblx0XHRcdGNvbnN0IHByaW9yQ29uZmlnID0gcmV1c2VPbGRTZXR0aW5ncyA/IG5ldyBNZW1lbnRvPHsgc2VhcmNoQ29uZmlnPzogU2VhcmNoQ29uZmlndXJhdGlvbiB9PihTZWFyY2hFZGl0b3JJbnB1dC5JRCwgc3RvcmFnZVNlcnZpY2UpLmdldE1lbWVudG8oU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKS5zZWFyY2hDb25maWcgPz8ge30gOiB7fTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDb25maWcgPSBkZWZhdWx0U2VhcmNoQ29uZmlnKCk7XG5cblx0XHRcdGNvbnN0IGNvbmZpZyA9IHsgLi4uZGVmYXVsdENvbmZpZywgLi4ucHJpb3JDb25maWcsIC4uLmV4aXN0aW5nRGF0YS5jb25maWcgfTtcblxuXHRcdFx0aWYgKGRlZmF1bHROdW1iZXJPZkNvbnRleHRMaW5lcyAhPT0gbnVsbCAmJiBkZWZhdWx0TnVtYmVyT2ZDb250ZXh0TGluZXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25maWcuY29udGV4dExpbmVzID0gZXhpc3RpbmdEYXRhPy5jb25maWc/LmNvbnRleHRMaW5lcyA/PyBkZWZhdWx0TnVtYmVyT2ZDb250ZXh0TGluZXM7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXhpc3RpbmdEYXRhLmZyb20gPT09ICdyYXdEYXRhJykge1xuXHRcdFx0XHRpZiAoZXhpc3RpbmdEYXRhLnJlc3VsdHNDb250ZW50cykge1xuXHRcdFx0XHRcdGNvbmZpZy5jb250ZXh0TGluZXMgPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHNlYXJjaEVkaXRvck1vZGVsRmFjdG9yeS5pbml0aWFsaXplTW9kZWxGcm9tUmF3RGF0YShhY2Nlc3NvciwgbW9kZWxVcmksIGNvbmZpZywgZXhpc3RpbmdEYXRhLnJlc3VsdHNDb250ZW50cykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gc2VhcmNoRWRpdG9yTW9kZWxGYWN0b3J5LmluaXRpYWxpemVNb2RlbEZyb21FeGlzdGluZ01vZGVsKGFjY2Vzc29yLCBtb2RlbFVyaSwgY29uZmlnKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRTZWFyY2hFZGl0b3JJbnB1dCxcblx0XHRtb2RlbFVyaSxcblx0XHRleGlzdGluZ0RhdGEuZnJvbSA9PT0gJ2V4aXN0aW5nRmlsZSdcblx0XHRcdD8gZXhpc3RpbmdEYXRhLmZpbGVVcmlcblx0XHRcdDogZXhpc3RpbmdEYXRhLmZyb20gPT09ICdtb2RlbCdcblx0XHRcdFx0PyBleGlzdGluZ0RhdGEuYmFja3VwT2Zcblx0XHRcdFx0OiB1bmRlZmluZWQpO1xufTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLFNBQVMsZ0JBQWdCO0FBQzNDLFNBQVMsV0FBVztBQUVwQixTQUFxQiw4QkFBOEI7QUFDbkQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBd0Qsd0JBQXFDLCtCQUFvRDtBQUNqSixT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
