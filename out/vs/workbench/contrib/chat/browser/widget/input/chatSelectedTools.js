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
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { derived, ObservableMap } from "../../../../../../base/common/observable.js";
import { isObject } from "../../../../../../base/common/types.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { observableMemento } from "../../../../../../platform/observable/common/observableMemento.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { ChatModeKind } from "../../../common/constants.js";
import { PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { ILanguageModelToolsService, isToolSet, ToolAndToolSetEnablementMap } from "../../../common/tools/languageModelToolsService.js";
import { PromptFileRewriter } from "../../promptSyntax/promptFileRewriter.js";
var ToolEnablementStates;
((ToolEnablementStates2) => {
  function fromMap(map) {
    const toolSets = /* @__PURE__ */ new Map(), tools = /* @__PURE__ */ new Map();
    for (const [entry, enabled] of map) {
      if (isToolSet(entry)) {
        toolSets.set(entry.id, enabled);
      } else {
        tools.set(entry.id, enabled);
      }
    }
    return { toolSets, tools };
  }
  ToolEnablementStates2.fromMap = fromMap;
  function isStoredDataV1(data) {
    return isObject(data) && data.version === void 0 && (data.disabledTools === void 0 || Array.isArray(data.disabledTools)) && (data.disabledToolSets === void 0 || Array.isArray(data.disabledToolSets));
  }
  function isStoredDataV2(data) {
    return isObject(data) && data.version === 2 && Array.isArray(data.toolSetEntries) && Array.isArray(data.toolEntries);
  }
  function fromStorage(storage) {
    try {
      const parsed = JSON.parse(storage);
      if (isStoredDataV2(parsed)) {
        return { toolSets: new Map(parsed.toolSetEntries), tools: new Map(parsed.toolEntries) };
      } else if (isStoredDataV1(parsed)) {
        const toolSetEntries = parsed.disabledToolSets?.map((id) => [id, false]);
        const toolEntries = parsed.disabledTools?.map((id) => [id, false]);
        return { toolSets: new Map(toolSetEntries), tools: new Map(toolEntries) };
      }
    } catch {
    }
    return { toolSets: /* @__PURE__ */ new Map(), tools: /* @__PURE__ */ new Map() };
  }
  ToolEnablementStates2.fromStorage = fromStorage;
  function toStorage(state) {
    const storageData = {
      version: 2,
      toolSetEntries: Array.from(state.toolSets.entries()),
      toolEntries: Array.from(state.tools.entries())
    };
    return JSON.stringify(storageData);
  }
  ToolEnablementStates2.toStorage = toStorage;
})(ToolEnablementStates || (ToolEnablementStates = {}));
var ToolsScope = /* @__PURE__ */ ((ToolsScope2) => {
  ToolsScope2[ToolsScope2["Global"] = 0] = "Global";
  ToolsScope2[ToolsScope2["Session"] = 1] = "Session";
  ToolsScope2[ToolsScope2["Agent"] = 2] = "Agent";
  ToolsScope2[ToolsScope2["Agent_ReadOnly"] = 3] = "Agent_ReadOnly";
  return ToolsScope2;
})(ToolsScope || {});
let ChatSelectedTools = class extends Disposable {
  constructor(_mode, languageModel, _toolsService, _storageService, _instantiationService) {
    super();
    this._mode = _mode;
    this.languageModel = languageModel;
    this._toolsService = _toolsService;
    this._instantiationService = _instantiationService;
    this._sessionStates = new ObservableMap();
    /**
     * All tools and tool sets with their enabled state.
     * Tools are filtered based on the current model context.
     */
    this.entriesMap = derived((r) => {
      const map = /* @__PURE__ */ new Map();
      const lm = this.languageModel.read(r)?.metadata;
      const currentMode = this._mode.read(r);
      let currentMap = this._sessionStates.observable.read(r).get(currentMode.id);
      if (!currentMap && currentMode.kind === ChatModeKind.Agent) {
        const modeTools = currentMode.customTools?.read(r);
        if (modeTools) {
          currentMap = ToolEnablementStates.fromMap(this._toolsService.toToolAndToolSetEnablementMap(modeTools, lm));
        }
      }
      if (!currentMap) {
        currentMap = this._globalState.read(r);
      }
      for (const tool of this._currentTools.read(r)) {
        if (tool.canBeReferencedInPrompt) {
          map.set(tool, currentMap.tools.get(tool.id) !== false);
        }
      }
      for (const toolSet of this._toolsService.getToolSetsForModel(lm, r)) {
        if (toolSet.hiddenInToolsPicker) {
          continue;
        }
        const toolSetEnabled = currentMap.toolSets.get(toolSet.id) !== false;
        map.set(toolSet, toolSetEnabled);
        for (const tool of toolSet.getTools(r)) {
          map.set(tool, toolSetEnabled || currentMap.tools.get(tool.id) === true);
        }
      }
      return ToolAndToolSetEnablementMap.fromMap(map);
    });
    this.userSelectedTools = derived((r) => {
      const result = {};
      const map = this.entriesMap.read(r);
      for (const [item, enabled] of map) {
        if (!isToolSet(item)) {
          result[item.id] = enabled;
        }
      }
      return result;
    });
    const globalStateMemento = observableMemento({
      key: "chat/selectedTools",
      defaultValue: { toolSets: /* @__PURE__ */ new Map(), tools: /* @__PURE__ */ new Map() },
      fromStorage: ToolEnablementStates.fromStorage,
      toStorage: ToolEnablementStates.toStorage
    });
    this._globalState = this._store.add(globalStateMemento(StorageScope.PROFILE, StorageTarget.MACHINE, _storageService));
    this._currentTools = languageModel.map((lm) => _toolsService.observeTools(lm?.metadata)).map((o, r) => o.read(r));
  }
  get entriesScope() {
    const mode = this._mode.get();
    if (this._sessionStates.has(mode.id)) {
      return 1 /* Session */;
    }
    if (mode.kind === ChatModeKind.Agent && mode.customTools?.get() && mode.uri) {
      return mode.source?.storage !== PromptsStorage.extension ? 2 /* Agent */ : 3 /* Agent_ReadOnly */;
    }
    return 0 /* Global */;
  }
  get currentMode() {
    return this._mode.get();
  }
  resetSessionEnablementState() {
    const mode = this._mode.get();
    this._sessionStates.delete(mode.id);
  }
  set(enablementMap, sessionOnly) {
    const mode = this._mode.get();
    if (sessionOnly || this._sessionStates.has(mode.id)) {
      this._sessionStates.set(mode.id, ToolEnablementStates.fromMap(enablementMap));
      return;
    }
    if (mode.kind === ChatModeKind.Agent && mode.customTools?.get() && mode.uri) {
      if (mode.source?.storage !== PromptsStorage.extension) {
        this.updateCustomModeTools(mode.uri.get(), enablementMap);
        return;
      } else {
        this._sessionStates.set(mode.id, ToolEnablementStates.fromMap(enablementMap));
        return;
      }
    }
    this._globalState.set(ToolEnablementStates.fromMap(enablementMap), void 0);
  }
  async updateCustomModeTools(uri, enablementMap) {
    await this._instantiationService.createInstance(PromptFileRewriter).openAndRewriteTools(uri, enablementMap, CancellationToken.None);
  }
};
ChatSelectedTools = __decorateClass([
  __decorateParam(2, ILanguageModelToolsService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IInstantiationService)
], ChatSelectedTools);
export {
  ChatSelectedTools,
  ToolsScope
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdFNlbGVjdGVkVG9vbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIElPYnNlcnZhYmxlLCBPYnNlcnZhYmxlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IE9ic2VydmFibGVNZW1lbnRvLCBvYnNlcnZhYmxlTWVtZW50byB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL29ic2VydmFibGVNZW1lbnRvLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IFVzZXJTZWxlY3RlZFRvb2xzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IFByb21wdHNTdG9yYWdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJVG9vbERhdGEsIGlzVG9vbFNldCwgVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLCBJVG9vbFNldCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdEZpbGVSZXdyaXRlciB9IGZyb20gJy4uLy4uL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlUmV3cml0ZXIuanMnO1xuXG5cbi8vIHRvZG9AY29ubm9yNDMxMi9iaGF2eWF1czogbWFrZSB0b29scyBrZXkgb2ZmIGRpc3BsYXlOYW1lIHNvIG1vZGVsLXNwZWNpZmljIHRvb2xcbi8vIGVuYWJsZW1lbnQgY2FuIHN0aWNrIGJldHdlZW4gbW9kZWxzIHdpdGggZGlmZmVyZW50IHVuZGVybHlpbmcgdG9vbCBkZWZpbml0aW9uc1xudHlwZSBUb29sRW5hYmxlbWVudFN0YXRlcyA9IHtcblx0cmVhZG9ubHkgdG9vbFNldHM6IFJlYWRvbmx5TWFwPHN0cmluZywgYm9vbGVhbj47XG5cdHJlYWRvbmx5IHRvb2xzOiBSZWFkb25seU1hcDxzdHJpbmcsIGJvb2xlYW4+O1xufTtcblxudHlwZSBTdG9yZWREYXRhVjIgPSB7XG5cdHJlYWRvbmx5IHZlcnNpb246IDI7XG5cdHJlYWRvbmx5IHRvb2xTZXRFbnRyaWVzOiBbc3RyaW5nLCBib29sZWFuXVtdO1xuXHRyZWFkb25seSB0b29sRW50cmllczogW3N0cmluZywgYm9vbGVhbl1bXTtcbn07XG5cbnR5cGUgU3RvcmVkRGF0YVYxID0ge1xuXHRyZWFkb25seSB2ZXJzaW9uOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGRpc2FibGVkVG9vbFNldHM/OiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgZGlzYWJsZWRUb29scz86IHN0cmluZ1tdO1xufTtcblxubmFtZXNwYWNlIFRvb2xFbmFibGVtZW50U3RhdGVzIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21NYXAobWFwOiBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXApOiBUb29sRW5hYmxlbWVudFN0YXRlcyB7XG5cdFx0Y29uc3QgdG9vbFNldHM6IE1hcDxzdHJpbmcsIGJvb2xlYW4+ID0gbmV3IE1hcCgpLCB0b29sczogTWFwPHN0cmluZywgYm9vbGVhbj4gPSBuZXcgTWFwKCk7XG5cdFx0Zm9yIChjb25zdCBbZW50cnksIGVuYWJsZWRdIG9mIG1hcCkge1xuXHRcdFx0aWYgKGlzVG9vbFNldChlbnRyeSkpIHtcblx0XHRcdFx0dG9vbFNldHMuc2V0KGVudHJ5LmlkLCBlbmFibGVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRvb2xzLnNldChlbnRyeS5pZCwgZW5hYmxlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IHRvb2xTZXRzLCB0b29scyB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gaXNTdG9yZWREYXRhVjEoZGF0YTogU3RvcmVkRGF0YVYxIHwgU3RvcmVkRGF0YVYyIHwgdW5kZWZpbmVkKTogZGF0YSBpcyBTdG9yZWREYXRhVjEge1xuXHRcdHJldHVybiBpc09iamVjdChkYXRhKSAmJiBkYXRhLnZlcnNpb24gPT09IHVuZGVmaW5lZFxuXHRcdFx0JiYgKGRhdGEuZGlzYWJsZWRUb29scyA9PT0gdW5kZWZpbmVkIHx8IEFycmF5LmlzQXJyYXkoZGF0YS5kaXNhYmxlZFRvb2xzKSlcblx0XHRcdCYmIChkYXRhLmRpc2FibGVkVG9vbFNldHMgPT09IHVuZGVmaW5lZCB8fCBBcnJheS5pc0FycmF5KGRhdGEuZGlzYWJsZWRUb29sU2V0cykpO1xuXHR9XG5cblx0ZnVuY3Rpb24gaXNTdG9yZWREYXRhVjIoZGF0YTogU3RvcmVkRGF0YVYxIHwgU3RvcmVkRGF0YVYyIHwgdW5kZWZpbmVkKTogZGF0YSBpcyBTdG9yZWREYXRhVjIge1xuXHRcdHJldHVybiBpc09iamVjdChkYXRhKSAmJiBkYXRhLnZlcnNpb24gPT09IDIgJiYgQXJyYXkuaXNBcnJheShkYXRhLnRvb2xTZXRFbnRyaWVzKSAmJiBBcnJheS5pc0FycmF5KGRhdGEudG9vbEVudHJpZXMpO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21TdG9yYWdlKHN0b3JhZ2U6IHN0cmluZyk6IFRvb2xFbmFibGVtZW50U3RhdGVzIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShzdG9yYWdlKTtcblx0XHRcdGlmIChpc1N0b3JlZERhdGFWMihwYXJzZWQpKSB7XG5cdFx0XHRcdHJldHVybiB7IHRvb2xTZXRzOiBuZXcgTWFwKHBhcnNlZC50b29sU2V0RW50cmllcyksIHRvb2xzOiBuZXcgTWFwKHBhcnNlZC50b29sRW50cmllcykgfTtcblx0XHRcdH0gZWxzZSBpZiAoaXNTdG9yZWREYXRhVjEocGFyc2VkKSkge1xuXHRcdFx0XHRjb25zdCB0b29sU2V0RW50cmllcyA9IHBhcnNlZC5kaXNhYmxlZFRvb2xTZXRzPy5tYXAoaWQgPT4gW2lkLCBmYWxzZV0gYXMgW3N0cmluZywgYm9vbGVhbl0pO1xuXHRcdFx0XHRjb25zdCB0b29sRW50cmllcyA9IHBhcnNlZC5kaXNhYmxlZFRvb2xzPy5tYXAoaWQgPT4gW2lkLCBmYWxzZV0gYXMgW3N0cmluZywgYm9vbGVhbl0pO1xuXHRcdFx0XHRyZXR1cm4geyB0b29sU2V0czogbmV3IE1hcCh0b29sU2V0RW50cmllcyksIHRvb2xzOiBuZXcgTWFwKHRvb2xFbnRyaWVzKSB9O1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gaWdub3JlXG5cdFx0fVxuXHRcdC8vIGludmFsaWQgZGF0YVxuXHRcdHJldHVybiB7IHRvb2xTZXRzOiBuZXcgTWFwKCksIHRvb2xzOiBuZXcgTWFwKCkgfTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0b1N0b3JhZ2Uoc3RhdGU6IFRvb2xFbmFibGVtZW50U3RhdGVzKTogc3RyaW5nIHtcblx0XHRjb25zdCBzdG9yYWdlRGF0YTogU3RvcmVkRGF0YVYyID0ge1xuXHRcdFx0dmVyc2lvbjogMixcblx0XHRcdHRvb2xTZXRFbnRyaWVzOiBBcnJheS5mcm9tKHN0YXRlLnRvb2xTZXRzLmVudHJpZXMoKSksXG5cdFx0XHR0b29sRW50cmllczogQXJyYXkuZnJvbShzdGF0ZS50b29scy5lbnRyaWVzKCkpXG5cdFx0fTtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoc3RvcmFnZURhdGEpO1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIFRvb2xzU2NvcGUge1xuXHRHbG9iYWwsXG5cdFNlc3Npb24sXG5cdEFnZW50LFxuXHRBZ2VudF9SZWFkT25seSxcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRTZWxlY3RlZFRvb2xzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZ2xvYmFsU3RhdGU6IE9ic2VydmFibGVNZW1lbnRvPFRvb2xFbmFibGVtZW50U3RhdGVzPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uU3RhdGVzID0gbmV3IE9ic2VydmFibGVNYXA8c3RyaW5nLCBUb29sRW5hYmxlbWVudFN0YXRlcyB8IHVuZGVmaW5lZD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudFRvb2xzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJVG9vbERhdGFbXT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZTogSU9ic2VydmFibGU8SUNoYXRNb2RlPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWw6IElPYnNlcnZhYmxlPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZD4sXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBnbG9iYWxTdGF0ZU1lbWVudG8gPSBvYnNlcnZhYmxlTWVtZW50bzxUb29sRW5hYmxlbWVudFN0YXRlcz4oe1xuXHRcdFx0a2V5OiAnY2hhdC9zZWxlY3RlZFRvb2xzJyxcblx0XHRcdGRlZmF1bHRWYWx1ZTogeyB0b29sU2V0czogbmV3IE1hcCgpLCB0b29sczogbmV3IE1hcCgpIH0sXG5cdFx0XHRmcm9tU3RvcmFnZTogVG9vbEVuYWJsZW1lbnRTdGF0ZXMuZnJvbVN0b3JhZ2UsXG5cdFx0XHR0b1N0b3JhZ2U6IFRvb2xFbmFibGVtZW50U3RhdGVzLnRvU3RvcmFnZVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fZ2xvYmFsU3RhdGUgPSB0aGlzLl9zdG9yZS5hZGQoZ2xvYmFsU3RhdGVNZW1lbnRvKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIF9zdG9yYWdlU2VydmljZSkpO1xuXHRcdHRoaXMuX2N1cnJlbnRUb29scyA9IGxhbmd1YWdlTW9kZWwubWFwKGxtID0+XG5cdFx0XHRfdG9vbHNTZXJ2aWNlLm9ic2VydmVUb29scyhsbT8ubWV0YWRhdGEpKS5tYXAoKG8sIHIpID0+IG8ucmVhZChyKSk7XG5cdH1cblxuXHQvKipcblx0ICogQWxsIHRvb2xzIGFuZCB0b29sIHNldHMgd2l0aCB0aGVpciBlbmFibGVkIHN0YXRlLlxuXHQgKiBUb29scyBhcmUgZmlsdGVyZWQgYmFzZWQgb24gdGhlIGN1cnJlbnQgbW9kZWwgY29udGV4dC5cblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBlbnRyaWVzTWFwOiBJT2JzZXJ2YWJsZTxUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXA+ID0gZGVyaXZlZChyID0+IHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTWFwPElUb29sRGF0YSB8IElUb29sU2V0LCBib29sZWFuPigpO1xuXHRcdGNvbnN0IGxtID0gdGhpcy5sYW5ndWFnZU1vZGVsLnJlYWQocik/Lm1ldGFkYXRhO1xuXG5cdFx0Ly8gbG9vayB1cCB0aGUgdG9vbHMgaW4gdGhlIGhpZXJhcmNoeTogc2Vzc2lvbiA+IG1vZGUgPiBnbG9iYWxcblx0XHRjb25zdCBjdXJyZW50TW9kZSA9IHRoaXMuX21vZGUucmVhZChyKTtcblx0XHRsZXQgY3VycmVudE1hcCA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMub2JzZXJ2YWJsZS5yZWFkKHIpLmdldChjdXJyZW50TW9kZS5pZCk7XG5cdFx0aWYgKCFjdXJyZW50TWFwICYmIGN1cnJlbnRNb2RlLmtpbmQgPT09IENoYXRNb2RlS2luZC5BZ2VudCkge1xuXHRcdFx0Y29uc3QgbW9kZVRvb2xzID0gY3VycmVudE1vZGUuY3VzdG9tVG9vbHM/LnJlYWQocik7XG5cdFx0XHRpZiAobW9kZVRvb2xzKSB7XG5cdFx0XHRcdGN1cnJlbnRNYXAgPSBUb29sRW5hYmxlbWVudFN0YXRlcy5mcm9tTWFwKHRoaXMuX3Rvb2xzU2VydmljZS50b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcChtb2RlVG9vbHMsIGxtKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghY3VycmVudE1hcCkge1xuXHRcdFx0Y3VycmVudE1hcCA9IHRoaXMuX2dsb2JhbFN0YXRlLnJlYWQocik7XG5cdFx0fVxuXHRcdC8vIFVzZSBnZXRUb29scyB3aXRoIGNvbnRleHRLZXlTZXJ2aWNlIHRvIGZpbHRlciB0b29scyBieSBjdXJyZW50IG1vZGVsXG5cdFx0Zm9yIChjb25zdCB0b29sIG9mIHRoaXMuX2N1cnJlbnRUb29scy5yZWFkKHIpKSB7XG5cdFx0XHRpZiAodG9vbC5jYW5CZVJlZmVyZW5jZWRJblByb21wdCkge1xuXHRcdFx0XHRtYXAuc2V0KHRvb2wsIGN1cnJlbnRNYXAudG9vbHMuZ2V0KHRvb2wuaWQpICE9PSBmYWxzZSk7IC8vIGlmIHVua25vd24sIGl0J3MgZW5hYmxlZFxuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHRvb2xTZXQgb2YgdGhpcy5fdG9vbHNTZXJ2aWNlLmdldFRvb2xTZXRzRm9yTW9kZWwobG0sIHIpKSB7XG5cdFx0XHQvLyBIaWRkZW4gdG9vbCBzZXRzIChlLmcuIHRoZSBidWlsdC1pbiBjbGllbnQgdG9vbCBzZXRzIHRoYXQgb25seSBleGlzdCB0byBncm91cCB0b29sc1xuXHRcdFx0Ly8gaW4gdGhlIENoYXQgQ3VzdG9taXphdGlvbnMgVUkpIGNhbid0IGJlIHRvZ2dsZWQgaGVyZSBhbmQgYXJlIGlnbm9yZWQgYnkgdGhlIHBpY2tlci5cblx0XHRcdC8vIFRoZWlyIG1lbWJlciB0b29scyBhcmUgYWxyZWFkeSByZXNvbHZlZCBieSB0aGUgbG9vcCBhYm92ZSwgc28gc2tpcCB0aGVtIGVudGlyZWx5IC1cblx0XHRcdC8vIG90aGVyd2lzZSB0aGV5J2Qgb3ZlcnJpZGUgaW5kaXZpZHVhbCB0b29sIHN0YXRlIGFuZCByZS1lbmFibGUgZGlzYWJsZWQgdG9vbHMuXG5cdFx0XHRpZiAodG9vbFNldC5oaWRkZW5JblRvb2xzUGlja2VyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdG9vbFNldEVuYWJsZWQgPSBjdXJyZW50TWFwLnRvb2xTZXRzLmdldCh0b29sU2V0LmlkKSAhPT0gZmFsc2U7IC8vIGlmIHVua25vd24sIGl0J3MgZW5hYmxlZFxuXHRcdFx0bWFwLnNldCh0b29sU2V0LCB0b29sU2V0RW5hYmxlZCk7XG5cdFx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgdG9vbFNldC5nZXRUb29scyhyKSkge1xuXHRcdFx0XHRtYXAuc2V0KHRvb2wsIHRvb2xTZXRFbmFibGVkIHx8IGN1cnJlbnRNYXAudG9vbHMuZ2V0KHRvb2wuaWQpID09PSB0cnVlKTsgLy8gaWYgdW5rbm93biwgdXNlIHRvb2xTZXRFbmFibGVkXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAuZnJvbU1hcChtYXApO1xuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdXNlclNlbGVjdGVkVG9vbHM6IElPYnNlcnZhYmxlPFVzZXJTZWxlY3RlZFRvb2xzPiA9IGRlcml2ZWQociA9PiB7XG5cdFx0Ly8gZXh0cmFjdCBhIG1hcCBvZiB0b29sIGlkc1xuXHRcdGNvbnN0IHJlc3VsdDogVXNlclNlbGVjdGVkVG9vbHMgPSB7fTtcblx0XHRjb25zdCBtYXAgPSB0aGlzLmVudHJpZXNNYXAucmVhZChyKTtcblx0XHRmb3IgKGNvbnN0IFtpdGVtLCBlbmFibGVkXSBvZiBtYXApIHtcblx0XHRcdGlmICghaXNUb29sU2V0KGl0ZW0pKSB7XG5cdFx0XHRcdHJlc3VsdFtpdGVtLmlkXSA9IGVuYWJsZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH0pO1xuXG5cdGdldCBlbnRyaWVzU2NvcGUoKSB7XG5cdFx0Y29uc3QgbW9kZSA9IHRoaXMuX21vZGUuZ2V0KCk7XG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25TdGF0ZXMuaGFzKG1vZGUuaWQpKSB7XG5cdFx0XHRyZXR1cm4gVG9vbHNTY29wZS5TZXNzaW9uO1xuXHRcdH1cblx0XHRpZiAobW9kZS5raW5kID09PSBDaGF0TW9kZUtpbmQuQWdlbnQgJiYgbW9kZS5jdXN0b21Ub29scz8uZ2V0KCkgJiYgbW9kZS51cmkpIHtcblx0XHRcdHJldHVybiBtb2RlLnNvdXJjZT8uc3RvcmFnZSAhPT0gUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uID8gVG9vbHNTY29wZS5BZ2VudCA6IFRvb2xzU2NvcGUuQWdlbnRfUmVhZE9ubHk7XG5cdFx0fVxuXHRcdHJldHVybiBUb29sc1Njb3BlLkdsb2JhbDtcblx0fVxuXG5cdGdldCBjdXJyZW50TW9kZSgpOiBJQ2hhdE1vZGUge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlLmdldCgpO1xuXHR9XG5cblx0cmVzZXRTZXNzaW9uRW5hYmxlbWVudFN0YXRlKCkge1xuXHRcdGNvbnN0IG1vZGUgPSB0aGlzLl9tb2RlLmdldCgpO1xuXHRcdHRoaXMuX3Nlc3Npb25TdGF0ZXMuZGVsZXRlKG1vZGUuaWQpO1xuXHR9XG5cblx0c2V0KGVuYWJsZW1lbnRNYXA6IFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCwgc2Vzc2lvbk9ubHk6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlID0gdGhpcy5fbW9kZS5nZXQoKTtcblx0XHRpZiAoc2Vzc2lvbk9ubHkgfHwgdGhpcy5fc2Vzc2lvblN0YXRlcy5oYXMobW9kZS5pZCkpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdGF0ZXMuc2V0KG1vZGUuaWQsIFRvb2xFbmFibGVtZW50U3RhdGVzLmZyb21NYXAoZW5hYmxlbWVudE1hcCkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAobW9kZS5raW5kID09PSBDaGF0TW9kZUtpbmQuQWdlbnQgJiYgbW9kZS5jdXN0b21Ub29scz8uZ2V0KCkgJiYgbW9kZS51cmkpIHtcblx0XHRcdGlmIChtb2RlLnNvdXJjZT8uc3RvcmFnZSAhPT0gUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdC8vIGFwcGx5IGRpcmVjdGx5IHRvIG1vZGUgZmlsZS5cblx0XHRcdFx0dGhpcy51cGRhdGVDdXN0b21Nb2RlVG9vbHMobW9kZS51cmkuZ2V0KCksIGVuYWJsZW1lbnRNYXApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBjYW4gbm90IHdyaXRlIHRvIGV4dGVuc2lvbnMsIHN0b3JlXG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25TdGF0ZXMuc2V0KG1vZGUuaWQsIFRvb2xFbmFibGVtZW50U3RhdGVzLmZyb21NYXAoZW5hYmxlbWVudE1hcCkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2dsb2JhbFN0YXRlLnNldChUb29sRW5hYmxlbWVudFN0YXRlcy5mcm9tTWFwKGVuYWJsZW1lbnRNYXApLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVDdXN0b21Nb2RlVG9vbHModXJpOiBVUkksIGVuYWJsZW1lbnRNYXA6IFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEZpbGVSZXdyaXRlcikub3BlbkFuZFJld3JpdGVUb29scyh1cmksIGVuYWJsZW1lbnRNYXAsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBc0IscUJBQXFCO0FBQ3BELFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQTRCLHlCQUF5QjtBQUNyRCxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUU3RCxTQUFTLG9CQUFvQjtBQUc3QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDRCQUF1QyxXQUFXLG1DQUE2QztBQUN4RyxTQUFTLDBCQUEwQjtBQXNCbkMsSUFBVTtBQUFBLENBQVYsQ0FBVUEsMEJBQVY7QUFDUSxXQUFTLFFBQVEsS0FBd0Q7QUFDL0UsVUFBTSxXQUFpQyxvQkFBSSxJQUFJLEdBQUcsUUFBOEIsb0JBQUksSUFBSTtBQUN4RixlQUFXLENBQUMsT0FBTyxPQUFPLEtBQUssS0FBSztBQUNuQyxVQUFJLFVBQVUsS0FBSyxHQUFHO0FBQ3JCLGlCQUFTLElBQUksTUFBTSxJQUFJLE9BQU87QUFBQSxNQUMvQixPQUFPO0FBQ04sY0FBTSxJQUFJLE1BQU0sSUFBSSxPQUFPO0FBQUEsTUFDNUI7QUFBQSxJQUNEO0FBQ0EsV0FBTyxFQUFFLFVBQVUsTUFBTTtBQUFBLEVBQzFCO0FBVk8sRUFBQUEsc0JBQVM7QUFZaEIsV0FBUyxlQUFlLE1BQXFFO0FBQzVGLFdBQU8sU0FBUyxJQUFJLEtBQUssS0FBSyxZQUFZLFdBQ3JDLEtBQUssa0JBQWtCLFVBQWEsTUFBTSxRQUFRLEtBQUssYUFBYSxPQUNwRSxLQUFLLHFCQUFxQixVQUFhLE1BQU0sUUFBUSxLQUFLLGdCQUFnQjtBQUFBLEVBQ2hGO0FBRUEsV0FBUyxlQUFlLE1BQXFFO0FBQzVGLFdBQU8sU0FBUyxJQUFJLEtB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
