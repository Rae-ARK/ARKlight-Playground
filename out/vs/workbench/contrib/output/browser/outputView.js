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
import "./output.css";
import * as nls from "../../../../nls.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IContextKeyService, ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { AbstractTextResourceEditor } from "../../../browser/parts/editor/textResourceEditor.js";
import { OUTPUT_VIEW_ID, CONTEXT_IN_OUTPUT, CONTEXT_OUTPUT_SCROLL_LOCK, IOutputService, OUTPUT_FILTER_FOCUS_CONTEXT, HIDE_CATEGORY_FILTER_CONTEXT } from "../../../services/output/common/output.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { CursorChangeReason } from "../../../../editor/common/cursorEvents.js";
import { FilterViewPane } from "../../../browser/parts/views/viewPane.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { TextResourceEditorInput } from "../../../common/editor/textResourceEditorInput.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Dimension } from "../../../../base/browser/dom.js";
import { createCancelablePromise } from "../../../../base/common/async.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ResourceContextKey } from "../../../common/contextkeys.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { computeEditorAriaLabel } from "../../../browser/editor.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { localize } from "../../../../nls.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { LogLevel } from "../../../../platform/log/common/log.js";
import { EditorExtensionsRegistry, EditorContributionInstantiation } from "../../../../editor/browser/editorExtensions.js";
import { Range } from "../../../../editor/common/core/range.js";
import { FindDecorations } from "../../../../editor/contrib/find/browser/findDecorations.js";
import { Memento } from "../../../common/memento.js";
import { Markers } from "../../markers/common/markers.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { viewFilterSubmenu } from "../../../browser/parts/views/viewFilter.js";
import { escapeRegExpCharacters } from "../../../../base/common/strings.js";
let OutputViewPane = class extends FilterViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, outputService, storageService) {
    const memento = new Memento(Markers.MARKERS_VIEW_STORAGE_ID, storageService);
    const viewState = memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
    super({
      ...options,
      filterOptions: {
        placeholder: localize("outputView.filter.placeholder", "Filter (e.g. text, !excludeText, text1,text2)"),
        focusContextKey: OUTPUT_FILTER_FOCUS_CONTEXT.key,
        text: viewState.filter || "",
        history: []
      }
    }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.outputService = outputService;
    this.editorPromise = null;
    this.memento = memento;
    this.panelState = viewState;
    const filters = outputService.filters;
    filters.text = this.panelState.filter || "";
    filters.trace = this.panelState.showTrace ?? true;
    filters.debug = this.panelState.showDebug ?? true;
    filters.info = this.panelState.showInfo ?? true;
    filters.warning = this.panelState.showWarning ?? true;
    filters.error = this.panelState.showError ?? true;
    filters.categories = this.panelState.categories ?? "";
    this.scrollLockContextKey = CONTEXT_OUTPUT_SCROLL_LOCK.bindTo(this.contextKeyService);
    const editorInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
    this.editor = this._register(editorInstantiationService.createInstance(OutputEditor));
    this._register(this.editor.onTitleAreaUpdate(() => {
      this.updateTitle(this.editor.getTitle());
      this.updateActions();
    }));
    this._register(this.onDidChangeBodyVisibility(() => this.onDidChangeVisibility(this.isBodyVisible())));
    this._register(this.filterWidget.onDidChangeFilterText((text) => outputService.filters.text = text));
    this.checkMoreFilters();
    this._register(outputService.filters.onDidChange(() => this.checkMoreFilters()));
  }
  get scrollLock() {
    return !!this.scrollLockContextKey.get();
  }
  set scrollLock(scrollLock) {
    this.scrollLockContextKey.set(scrollLock);
  }
  showChannel(channel, preserveFocus) {
    if (this.channelId !== channel.id) {
      this.setInput(channel);
    }
    if (!preserveFocus) {
      this.focus();
    }
  }
  focus() {
    super.focus();
    this.editorPromise?.then(() => this.editor.focus());
  }
  clearFilterText() {
    this.filterWidget.setFilterText("");
  }
  renderBody(container) {
    super.renderBody(container);
    this.editor.create(container);
    container.classList.add("output-view");
    const codeEditor = this.editor.getControl();
    codeEditor.setAriaOptions({ role: "document", activeDescendant: void 0 });
    this._register(codeEditor.onDidChangeModelContent(() => {
      if (!this.scrollLock) {
        this.editor.revealLastLine();
      }
    }));
    this._register(codeEditor.onDidChangeCursorPosition((e) => {
      if (e.reason !== CursorChangeReason.Explicit) {
        return;
      }
      if (!this.configurationService.getValue("output.smartScroll.enabled")) {
        return;
      }
      const model = codeEditor.getModel();
      if (model) {
        const newPositionLine = e.position.lineNumber;
        const lastLine = model.getLineCount();
        this.scrollLock = lastLine !== newPositionLine;
      }
    }));
  }
  layoutBodyContent(height, width) {
    this.editor.layout(new Dimension(width, height));
  }
  onDidChangeVisibility(visible) {
    this.editor.setVisible(visible);
    if (!visible) {
      this.clearInput();
    }
  }
  setInput(channel) {
    this.channelId = channel.id;
    this.checkMoreFilters();
    const input = this.createInput(channel);
    if (!this.editor.input || !input.matches(this.editor.input)) {
      this.editorPromise?.cancel();
      this.editorPromise = createCancelablePromise((token) => this.editor.setInput(input, { preserveFocus: true }, /* @__PURE__ */ Object.create(null), token));
    }
  }
  checkMoreFilters() {
    const filters = this.outputService.filters;
    this.filterWidget.checkMoreFilters(!filters.trace || !filters.debug || !filters.info || !filters.warning || !filters.error || !!this.channelId && filters.categories.includes(`,${this.channelId}:`));
  }
  clearInput() {
    this.channelId = void 0;
    this.editor.clearInput();
    this.editorPromise = null;
  }
  createInput(channel) {
    return this.instantiationService.createInstance(TextResourceEditorInput, channel.uri, nls.localize("output model title", "{0} - Output", channel.label), nls.localize("channel", "Output channel for '{0}'", channel.label), void 0, void 0);
  }
  saveState() {
    const filters = this.outputService.filters;
    this.panelState.filter = filters.text;
    this.panelState.showTrace = filters.trace;
    this.panelState.showDebug = filters.debug;
    this.panelState.showInfo = filters.info;
    this.panelState.showWarning = filters.warning;
    this.panelState.showError = filters.error;
    this.panelState.categories = filters.categories;
    this.memento.saveMemento();
    super.saveState();
  }
};
OutputViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IOutputService),
  __decorateParam(11, IStorageService)
], OutputViewPane);
let OutputEditor = class extends AbstractTextResourceEditor {
  constructor(telemetryService, instantiationService, storageService, configurationService, textResourceConfigurationService, themeService, editorGroupService, editorService, fileService) {
    super(OUTPUT_VIEW_ID, editorGroupService.activeGroup, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorGroupService, editorService, fileService);
    this.configurationService = configurationService;
    this.resourceContext = this._register(instantiationService.createInstance(ResourceContextKey));
  }
  getId() {
    return OUTPUT_VIEW_ID;
  }
  getTitle() {
    return nls.localize("output", "Output");
  }
  getConfigurationOverrides(configuration) {
    const options = super.getConfigurationOverrides(configuration);
    options.wordWrap = "on";
    options.lineNumbers = "off";
    options.glyphMargin = false;
    options.lineDecorationsWidth = 20;
    options.rulers = [];
    options.folding = false;
    options.scrollBeyondLastLine = false;
    options.renderLineHighlight = "none";
    options.minimap = { enabled: false };
    options.renderValidationDecorations = "editable";
    options.colorDecorators = false;
    options.padding = void 0;
    options.readOnly = true;
    options.domReadOnly = true;
    options.roundedSelection = false;
    options.unicodeHighlight = {
      nonBasicASCII: false,
      invisibleCharacters: false,
      ambiguousCharacters: false
    };
    const outputConfig = this.configurationService.getValue("[Log]");
    if (outputConfig) {
      if (outputConfig["editor.minimap.enabled"]) {
        options.minimap = { enabled: true };
      }
      if (outputConfig["editor.wordWrap"]) {
        options.wordWrap = outputConfig["editor.wordWrap"];
      }
    }
    return options;
  }
  getAriaLabel() {
    return this.input ? this.input.getAriaLabel() : nls.localize("outputViewAriaLabel", "Output panel");
  }
  computeAriaLabel() {
    return this.input ? computeEditorAriaLabel(this.input, void 0, void 0, this.editorGroupService.count) : this.getAriaLabel();
  }
  async setInput(input, options, context, token) {
    const focus = !(options && options.preserveFocus);
    if (this.input && input.matches(this.input)) {
      return;
    }
    if (this.input) {
      this.input.dispose();
    }
    await super.setInput(input, options, context, token);
    this.resourceContext.set(input.resource);
    if (focus) {
      this.focus();
    }
    this.revealLastLine();
  }
  clearInput() {
    if (this.input) {
      this.input.dispose();
    }
    super.clearInput();
    this.resourceContext.reset();
  }
  createEditor(parent) {
    parent.setAttribute("role", "document");
    super.createEditor(parent);
    const scopedContextKeyService = this.scopedContextKeyService;
    if (scopedContextKeyService) {
      CONTEXT_IN_OUTPUT.bindTo(scopedContextKeyService).set(true);
    }
  }
  _getContributions() {
    return [
      ...EditorExtensionsRegistry.getEditorContributions(),
      {
        id: FilterController.ID,
        ctor: FilterController,
        instantiation: EditorContributionInstantiation.Eager
      }
    ];
  }
  getCodeEditorWidgetOptions() {
    return { contributions: this._getContributions() };
  }
};
OutputEditor = __decorateClass([
  __decorateParam(0, ITelemetryService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ITextResourceConfigurationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IEditorGroupsService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IFileService)
], OutputEditor);
let FilterController = class extends Disposable {
  constructor(editor, outputService) {
    super();
    this.editor = editor;
    this.outputService = outputService;
    this.modelDisposables = this._register(new DisposableStore());
    this.hiddenAreas = [];
    this.categories = /* @__PURE__ */ new Map();
    this.decorationsCollection = editor.createDecorationsCollection();
    this._register(editor.onDidChangeModel(() => this.onDidChangeModel()));
    this._register(this.outputService.filters.onDidChange(() => editor.hasModel() && this.filter(editor.getModel())));
  }
  onDidChangeModel() {
    this.modelDisposables.clear();
    this.hiddenAreas = [];
    this.categories.clear();
    if (!this.editor.hasModel()) {
      return;
    }
    const model = this.editor.getModel();
    this.filter(model);
    const computeEndLineNumber = () => {
      const endLineNumber2 = model.getLineCount();
      return endLineNumber2 > 1 && model.getLineMaxColumn(endLineNumber2) === 1 ? endLineNumber2 - 1 : endLineNumber2;
    };
    let endLineNumber = computeEndLineNumber();
    this.modelDisposables.add(model.onDidChangeContent((e) => {
      if (e.changes.every((e2) => e2.range.startLineNumber > endLineNumber)) {
        this.filterIncremental(model, endLineNumber + 1);
      } else {
        this.filter(model);
      }
      endLineNumber = computeEndLineNumber();
    }));
  }
  filter(model) {
    this.hiddenAreas = [];
    this.decorationsCollection.clear();
    this.filterIncremental(model, 1);
  }
  filterIncremental(model, fromLineNumber) {
    const { findMatches, hiddenAreas, categories: sources } = this.compute(model, fromLineNumber);
    this.hiddenAreas.push(...hiddenAreas);
    this.editor.setHiddenAreas(this.hiddenAreas, this);
    if (findMatches.length) {
      this.decorationsCollection.append(findMatches);
    }
    if (sources.size) {
      const that = this;
      for (const [categoryFilter, categoryName] of sources) {
        if (this.categories.has(categoryFilter)) {
          continue;
        }
        this.categories.set(categoryFilter, categoryName);
        this.modelDisposables.add(registerAction2(class extends Action2 {
          constructor() {
            super({
              id: `workbench.actions.${OUTPUT_VIEW_ID}.toggle.${categoryFilter}`,
              title: categoryName,
              toggled: ContextKeyExpr.regex(HIDE_CATEGORY_FILTER_CONTEXT.key, new RegExp(`.*,${escapeRegExpCharacters(categoryFilter)},.*`)).negate(),
              menu: {
                id: viewFilterSubmenu,
                group: "1_category_filter",
                when: ContextKeyExpr.and(ContextKeyExpr.equals("view", OUTPUT_VIEW_ID))
              }
            });
          }
          async run() {
            that.outputService.filters.toggleCategory(categoryFilter);
          }
        }));
      }
    }
  }
  shouldShowLine(model, range, positive, negative) {
    const matches = [];
    if (negative.length > 0) {
      for (const pattern of negative) {
        const negativeMatches = model.findMatches(pattern, range, false, false, null, false);
        if (negativeMatches.length > 0) {
          return { show: false, matches: [] };
        }
      }
    }
    if (positive.length > 0) {
      let hasPositiveMatch = false;
      for (const pattern of positive) {
        const positiveMatches = model.findMatches(pattern, range, false, false, null, false);
        if (positiveMatches.length > 0) {
          hasPositiveMatch = true;
          for (const match of positiveMatches) {
            matches.push({ range: match.range, options: FindDecorations._FIND_MATCH_DECORATION });
          }
        }
      }
      return { show: hasPositiveMatch, matches };
    }
    return { show: true, matches };
  }
  compute(model, fromLineNumber) {
    const filters = this.outputService.filters;
    const activeChannel = this.outputService.getActiveChannel();
    const findMatches = [];
    const hiddenAreas = [];
    const categories = /* @__PURE__ */ new Map();
    const logEntries = activeChannel?.getLogEntries();
    if (activeChannel && logEntries?.length) {
      const hasLogLevelFilter = !filters.trace || !filters.debug || !filters.info || !filters.warning || !filters.error;
      const fromLogLevelEntryIndex = logEntries.findIndex((entry) => fromLineNumber >= entry.range.startLineNumber && fromLineNumber <= entry.range.endLineNumber);
      if (fromLogLevelEntryIndex === -1) {
        return { findMatches, hiddenAreas, categories };
      }
      for (let i = fromLogLevelEntryIndex; i < logEntries.length; i++) {
        const entry = logEntries[i];
        if (entry.category) {
          categories.set(`${activeChannel.id}:${entry.category}`, entry.category);
        }
        if (hasLogLevelFilter && !this.shouldShowLogLevel(entry, filters)) {
          hiddenAreas.push(entry.range);
          continue;
        }
        if (!this.shouldShowCategory(activeChannel.id, entry, filters)) {
          hiddenAreas.push(entry.range);
          continue;
        }
        if (filters.includePatterns.length > 0 || filters.excludePatterns.length > 0) {
          const result = this.shouldShowLine(model, entry.range, filters.includePatterns, filters.excludePatterns);
          if (result.show) {
            findMatches.push(...result.matches);
          } else {
            hiddenAreas.push(entry.range);
          }
        }
      }
      return { findMatches, hiddenAreas, categories };
    }
    if (filters.includePatterns.length === 0 && filters.excludePatterns.length === 0) {
      return { findMatches, hiddenAreas, categories };
    }
    const lineCount = model.getLineCount();
    for (let lineNumber = fromLineNumber; lineNumber <= lineCount; lineNumber++) {
      const lineRange = new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber));
      const result = this.shouldShowLine(model, lineRange, filters.includePatterns, filters.excludePatterns);
      if (result.show) {
        findMatches.push(...result.matches);
      } else {
        hiddenAreas.push(lineRange);
      }
    }
    return { findMatches, hiddenAreas, categories };
  }
  shouldShowLogLevel(entry, filters) {
    switch (entry.logLevel) {
      case LogLevel.Trace:
        return filters.trace;
      case LogLevel.Debug:
        return filters.debug;
      case LogLevel.Info:
        return filters.info;
      case LogLevel.Warning:
        return filters.warning;
      case LogLevel.Error:
        return filters.error;
    }
    return true;
  }
  shouldShowCategory(activeChannelId, entry, filters) {
    if (!entry.category) {
      return true;
    }
    return !filters.hasCategory(`${activeChannelId}:${entry.category}`);
  }
};
FilterController.ID = "output.editor.contrib.filterController";
FilterController = __decorateClass([
  __decorateParam(1, IOutputService)
], FilterController);
export {
  FilterController,
  OutputEditor,
  OutputViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL291dHB1dC9icm93c2VyL291dHB1dFZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0ICcuL291dHB1dC5jc3MnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgYXMgSUNvZGVFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIElDb250ZXh0S2V5LCBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wZW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFRleHRSZXNvdXJjZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL3RleHRSZXNvdXJjZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBPVVRQVVRfVklFV19JRCwgQ09OVEVYVF9JTl9PVVRQVVQsIElPdXRwdXRDaGFubmVsLCBDT05URVhUX09VVFBVVF9TQ1JPTExfTE9DSywgSU91dHB1dFNlcnZpY2UsIElPdXRwdXRWaWV3RmlsdGVycywgT1VUUFVUX0ZJTFRFUl9GT0NVU19DT05URVhULCBJTG9nRW50cnksIEhJREVfQ0FURUdPUllfRklMVEVSX0NPTlRFWFQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEN1cnNvckNoYW5nZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCB7IElWaWV3UGFuZU9wdGlvbnMsIEZpbHRlclZpZXdQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgVGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3RleHRSZXNvdXJjZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci90ZXh0RWRpdG9yLmpzJztcbmltcG9ydCB7IGNvbXB1dGVFZGl0b3JBcmlhTGFiZWwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb24sIEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbiwgRWRpdG9yQ29udHJpYnV0aW9uQ3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29udHJpYnV0aW9uLCBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBGaW5kRGVjb3JhdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9maW5kL2Jyb3dzZXIvZmluZERlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IE1lbWVudG8gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbWVtZW50by5qcyc7XG5pbXBvcnQgeyBNYXJrZXJzIH0gZnJvbSAnLi4vLi4vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IHZpZXdGaWx0ZXJTdWJtZW51IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3RmlsdGVyLmpzJztcbmltcG9ydCB7IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcblxuaW50ZXJmYWNlIElPdXRwdXRWaWV3U3RhdGUge1xuXHRmaWx0ZXI/OiBzdHJpbmc7XG5cdHNob3dUcmFjZT86IGJvb2xlYW47XG5cdHNob3dEZWJ1Zz86IGJvb2xlYW47XG5cdHNob3dJbmZvPzogYm9vbGVhbjtcblx0c2hvd1dhcm5pbmc/OiBib29sZWFuO1xuXHRzaG93RXJyb3I/OiBib29sZWFuO1xuXHRjYXRlZ29yaWVzPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgT3V0cHV0Vmlld1BhbmUgZXh0ZW5kcyBGaWx0ZXJWaWV3UGFuZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IE91dHB1dEVkaXRvcjtcblx0cHJpdmF0ZSBjaGFubmVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBlZGl0b3JQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPiB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc2Nyb2xsTG9ja0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRnZXQgc2Nyb2xsTG9jaygpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy5zY3JvbGxMb2NrQ29udGV4dEtleS5nZXQoKTsgfVxuXHRzZXQgc2Nyb2xsTG9jayhzY3JvbGxMb2NrOiBib29sZWFuKSB7IHRoaXMuc2Nyb2xsTG9ja0NvbnRleHRLZXkuc2V0KHNjcm9sbExvY2spOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBtZW1lbnRvOiBNZW1lbnRvPElPdXRwdXRWaWV3U3RhdGU+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHBhbmVsU3RhdGU6IElPdXRwdXRWaWV3U3RhdGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdQYW5lT3B0aW9ucyxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU91dHB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvdXRwdXRTZXJ2aWNlOiBJT3V0cHV0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IG1lbWVudG8gPSBuZXcgTWVtZW50bzxJT3V0cHV0Vmlld1N0YXRlPihNYXJrZXJzLk1BUktFUlNfVklFV19TVE9SQUdFX0lELCBzdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gbWVtZW50by5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0c3VwZXIoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdGZpbHRlck9wdGlvbnM6IHtcblx0XHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdvdXRwdXRWaWV3LmZpbHRlci5wbGFjZWhvbGRlcicsIFwiRmlsdGVyIChlLmcuIHRleHQsICFleGNsdWRlVGV4dCwgdGV4dDEsdGV4dDIpXCIpLFxuXHRcdFx0XHRmb2N1c0NvbnRleHRLZXk6IE9VVFBVVF9GSUxURVJfRk9DVVNfQ09OVEVYVC5rZXksXG5cdFx0XHRcdHRleHQ6IHZpZXdTdGF0ZS5maWx0ZXIgfHwgJycsXG5cdFx0XHRcdGhpc3Rvcnk6IFtdXG5cdFx0XHR9XG5cdFx0fSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cdFx0dGhpcy5tZW1lbnRvID0gbWVtZW50bztcblx0XHR0aGlzLnBhbmVsU3RhdGUgPSB2aWV3U3RhdGU7XG5cblx0XHRjb25zdCBmaWx0ZXJzID0gb3V0cHV0U2VydmljZS5maWx0ZXJzO1xuXHRcdGZpbHRlcnMudGV4dCA9IHRoaXMucGFuZWxTdGF0ZS5maWx0ZXIgfHwgJyc7XG5cdFx0ZmlsdGVycy50cmFjZSA9IHRoaXMucGFuZWxTdGF0ZS5zaG93VHJhY2UgPz8gdHJ1ZTtcblx0XHRmaWx0ZXJzLmRlYnVnID0gdGhpcy5wYW5lbFN0YXRlLnNob3dEZWJ1ZyA/PyB0cnVlO1xuXHRcdGZpbHRlcnMuaW5mbyA9IHRoaXMucGFuZWxTdGF0ZS5zaG93SW5mbyA/PyB0cnVlO1xuXHRcdGZpbHRlcnMud2FybmluZyA9IHRoaXMucGFuZWxTdGF0ZS5zaG93V2FybmluZyA/PyB0cnVlO1xuXHRcdGZpbHRlcnMuZXJyb3IgPSB0aGlzLnBhbmVsU3RhdGUuc2hvd0Vycm9yID8/IHRydWU7XG5cdFx0ZmlsdGVycy5jYXRlZ29yaWVzID0gdGhpcy5wYW5lbFN0YXRlLmNhdGVnb3JpZXMgPz8gJyc7XG5cblx0XHR0aGlzLnNjcm9sbExvY2tDb250ZXh0S2V5ID0gQ09OVEVYVF9PVVRQVVRfU0NST0xMX0xPQ0suYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZWRpdG9ySW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0dGhpcy5lZGl0b3IgPSB0aGlzLl9yZWdpc3RlcihlZGl0b3JJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShPdXRwdXRFZGl0b3IpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vblRpdGxlQXJlYVVwZGF0ZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRpdGxlKHRoaXMuZWRpdG9yLmdldFRpdGxlKCkpO1xuXHRcdFx0dGhpcy51cGRhdGVBY3Rpb25zKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSgoKSA9PiB0aGlzLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eSh0aGlzLmlzQm9keVZpc2libGUoKSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbHRlcldpZGdldC5vbkRpZENoYW5nZUZpbHRlclRleHQodGV4dCA9PiBvdXRwdXRTZXJ2aWNlLmZpbHRlcnMudGV4dCA9IHRleHQpKTtcblxuXHRcdHRoaXMuY2hlY2tNb3JlRmlsdGVycygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG91dHB1dFNlcnZpY2UuZmlsdGVycy5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLmNoZWNrTW9yZUZpbHRlcnMoKSkpO1xuXHR9XG5cblx0c2hvd0NoYW5uZWwoY2hhbm5lbDogSU91dHB1dENoYW5uZWwsIHByZXNlcnZlRm9jdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jaGFubmVsSWQgIT09IGNoYW5uZWwuaWQpIHtcblx0XHRcdHRoaXMuc2V0SW5wdXQoY2hhbm5lbCk7XG5cdFx0fVxuXHRcdGlmICghcHJlc2VydmVGb2N1cykge1xuXHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0dGhpcy5lZGl0b3JQcm9taXNlPy50aGVuKCgpID0+IHRoaXMuZWRpdG9yLmZvY3VzKCkpO1xuXHR9XG5cblx0cHVibGljIGNsZWFyRmlsdGVyVGV4dCgpOiB2b2lkIHtcblx0XHR0aGlzLmZpbHRlcldpZGdldC5zZXRGaWx0ZXJUZXh0KCcnKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cdFx0dGhpcy5lZGl0b3IuY3JlYXRlKGNvbnRhaW5lcik7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ291dHB1dC12aWV3Jyk7XG5cdFx0Y29uc3QgY29kZUVkaXRvciA9IDxJQ29kZUVkaXRvcj50aGlzLmVkaXRvci5nZXRDb250cm9sKCk7XG5cdFx0Y29kZUVkaXRvci5zZXRBcmlhT3B0aW9ucyh7IHJvbGU6ICdkb2N1bWVudCcsIGFjdGl2ZURlc2NlbmRhbnQ6IHVuZGVmaW5lZCB9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb2RlRWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5zY3JvbGxMb2NrKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLnJldmVhbExhc3RMaW5lKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvZGVFZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoZSkgPT4ge1xuXHRcdFx0aWYgKGUucmVhc29uICE9PSBDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ291dHB1dC5zbWFydFNjcm9sbC5lbmFibGVkJykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGNvZGVFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRjb25zdCBuZXdQb3NpdGlvbkxpbmUgPSBlLnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRcdGNvbnN0IGxhc3RMaW5lID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRcdHRoaXMuc2Nyb2xsTG9jayA9IGxhc3RMaW5lICE9PSBuZXdQb3NpdGlvbkxpbmU7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGxheW91dEJvZHlDb250ZW50KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3IubGF5b3V0KG5ldyBEaW1lbnNpb24od2lkdGgsIGhlaWdodCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVZpc2liaWxpdHkodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yLnNldFZpc2libGUodmlzaWJsZSk7XG5cdFx0aWYgKCF2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLmNsZWFySW5wdXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldElucHV0KGNoYW5uZWw6IElPdXRwdXRDaGFubmVsKTogdm9pZCB7XG5cdFx0dGhpcy5jaGFubmVsSWQgPSBjaGFubmVsLmlkO1xuXHRcdHRoaXMuY2hlY2tNb3JlRmlsdGVycygpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSB0aGlzLmNyZWF0ZUlucHV0KGNoYW5uZWwpO1xuXHRcdGlmICghdGhpcy5lZGl0b3IuaW5wdXQgfHwgIWlucHV0Lm1hdGNoZXModGhpcy5lZGl0b3IuaW5wdXQpKSB7XG5cdFx0XHR0aGlzLmVkaXRvclByb21pc2U/LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5lZGl0b3JQcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4gdGhpcy5lZGl0b3Iuc2V0SW5wdXQoaW5wdXQsIHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9LCBPYmplY3QuY3JlYXRlKG51bGwpLCB0b2tlbikpO1xuXHRcdH1cblxuXHR9XG5cblx0cHJpdmF0ZSBjaGVja01vcmVGaWx0ZXJzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGZpbHRlcnMgPSB0aGlzLm91dHB1dFNlcnZpY2UuZmlsdGVycztcblx0XHR0aGlzLmZpbHRlcldpZGdldC5jaGVja01vcmVGaWx0ZXJzKCFmaWx0ZXJzLnRyYWNlIHx8ICFmaWx0ZXJzLmRlYnVnIHx8ICFmaWx0ZXJzLmluZm8gfHwgIWZpbHRlcnMud2FybmluZyB8fCAhZmlsdGVycy5lcnJvciB8fCAoISF0aGlzLmNoYW5uZWxJZCAmJiBmaWx0ZXJzLmNhdGVnb3JpZXMuaW5jbHVkZXMoYCwke3RoaXMuY2hhbm5lbElkfTpgKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcklucHV0KCk6IHZvaWQge1xuXHRcdHRoaXMuY2hhbm5lbElkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuZWRpdG9yLmNsZWFySW5wdXQoKTtcblx0XHR0aGlzLmVkaXRvclByb21pc2UgPSBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVJbnB1dChjaGFubmVsOiBJT3V0cHV0Q2hhbm5lbCk6IFRleHRSZXNvdXJjZUVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCwgY2hhbm5lbC51cmksIG5scy5sb2NhbGl6ZSgnb3V0cHV0IG1vZGVsIHRpdGxlJywgXCJ7MH0gLSBPdXRwdXRcIiwgY2hhbm5lbC5sYWJlbCksIG5scy5sb2NhbGl6ZSgnY2hhbm5lbCcsIFwiT3V0cHV0IGNoYW5uZWwgZm9yICd7MH0nXCIsIGNoYW5uZWwubGFiZWwpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRvdmVycmlkZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgZmlsdGVycyA9IHRoaXMub3V0cHV0U2VydmljZS5maWx0ZXJzO1xuXHRcdHRoaXMucGFuZWxTdGF0ZS5maWx0ZXIgPSBmaWx0ZXJzLnRleHQ7XG5cdFx0dGhpcy5wYW5lbFN0YXRlLnNob3dUcmFjZSA9IGZpbHRlcnMudHJhY2U7XG5cdFx0dGhpcy5wYW5lbFN0YXRlLnNob3dEZWJ1ZyA9IGZpbHRlcnMuZGVidWc7XG5cdFx0dGhpcy5wYW5lbFN0YXRlLnNob3dJbmZvID0gZmlsdGVycy5pbmZvO1xuXHRcdHRoaXMucGFuZWxTdGF0ZS5zaG93V2FybmluZyA9IGZpbHRlcnMud2FybmluZztcblx0XHR0aGlzLnBhbmVsU3RhdGUuc2hvd0Vycm9yID0gZmlsdGVycy5lcnJvcjtcblx0XHR0aGlzLnBhbmVsU3RhdGUuY2F0ZWdvcmllcyA9IGZpbHRlcnMuY2F0ZWdvcmllcztcblxuXHRcdHRoaXMubWVtZW50by5zYXZlTWVtZW50bygpO1xuXHRcdHN1cGVyLnNhdmVTdGF0ZSgpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIE91dHB1dEVkaXRvciBleHRlbmRzIEFic3RyYWN0VGV4dFJlc291cmNlRWRpdG9yIHtcblx0cHJpdmF0ZSByZWFkb25seSByZXNvdXJjZUNvbnRleHQ6IFJlc291cmNlQ29udGV4dEtleTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoT1VUUFVUX1ZJRVdfSUQsIGVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cCAvKiB0aGlzIGlzIG5vdCBjb3JyZWN0IGJ1dCBwcmFnbWF0aWMgKi8sIHRlbGVtZXRyeVNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsIHRoZW1lU2VydmljZSwgZWRpdG9yR3JvdXBTZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cblx0XHR0aGlzLnJlc291cmNlQ29udGV4dCA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlQ29udGV4dEtleSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gT1VUUFVUX1ZJRVdfSUQ7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRUaXRsZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ291dHB1dCcsIFwiT3V0cHV0XCIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldENvbmZpZ3VyYXRpb25PdmVycmlkZXMoY29uZmlndXJhdGlvbjogSUVkaXRvckNvbmZpZ3VyYXRpb24pOiBJQ29kZUVkaXRvck9wdGlvbnMge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBzdXBlci5nZXRDb25maWd1cmF0aW9uT3ZlcnJpZGVzKGNvbmZpZ3VyYXRpb24pO1xuXHRcdG9wdGlvbnMud29yZFdyYXAgPSAnb24nO1x0XHRcdFx0Ly8gYWxsIG91dHB1dCBlZGl0b3JzIHdyYXBcblx0XHRvcHRpb25zLmxpbmVOdW1iZXJzID0gJ29mZic7XHRcdFx0Ly8gYWxsIG91dHB1dCBlZGl0b3JzIGhpZGUgbGluZSBudW1iZXJzXG5cdFx0b3B0aW9ucy5nbHlwaE1hcmdpbiA9IGZhbHNlO1xuXHRcdG9wdGlvbnMubGluZURlY29yYXRpb25zV2lkdGggPSAyMDtcblx0XHRvcHRpb25zLnJ1bGVycyA9IFtdO1xuXHRcdG9wdGlvbnMuZm9sZGluZyA9IGZhbHNlO1xuXHRcdG9wdGlvbnMuc2Nyb2xsQmV5b25kTGFzdExpbmUgPSBmYWxzZTtcblx0XHRvcHRpb25zLnJlbmRlckxpbmVIaWdobGlnaHQgPSAnbm9uZSc7XG5cdFx0b3B0aW9ucy5taW5pbWFwID0geyBlbmFibGVkOiBmYWxzZSB9O1xuXHRcdG9wdGlvbnMucmVuZGVyVmFsaWRhdGlvbkRlY29yYXRpb25zID0gJ2VkaXRhYmxlJztcblx0XHRvcHRpb25zLmNvbG9yRGVjb3JhdG9ycyA9IGZhbHNlO1xuXHRcdG9wdGlvbnMucGFkZGluZyA9IHVuZGVmaW5lZDtcblx0XHRvcHRpb25zLnJlYWRPbmx5ID0gdHJ1ZTtcblx0XHRvcHRpb25zLmRvbVJlYWRPbmx5ID0gdHJ1ZTtcblx0XHRvcHRpb25zLnJvdW5kZWRTZWxlY3Rpb24gPSBmYWxzZTtcblx0XHRvcHRpb25zLnVuaWNvZGVIaWdobGlnaHQgPSB7XG5cdFx0XHRub25CYXNpY0FTQ0lJOiBmYWxzZSxcblx0XHRcdGludmlzaWJsZUNoYXJhY3RlcnM6IGZhbHNlLFxuXHRcdFx0YW1iaWd1b3VzQ2hhcmFjdGVyczogZmFsc2UsXG5cdFx0fTtcblxuXHRcdGNvbnN0IG91dHB1dENvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyAnZWRpdG9yLm1pbmltYXAuZW5hYmxlZCc/OiBib29sZWFuOyAnZWRpdG9yLndvcmRXcmFwJz86ICdvZmYnIHwgJ29uJyB8ICd3b3JkV3JhcENvbHVtbicgfCAnYm91bmRlZCcgfT4oJ1tMb2ddJyk7XG5cdFx0aWYgKG91dHB1dENvbmZpZykge1xuXHRcdFx0aWYgKG91dHB1dENvbmZpZ1snZWRpdG9yLm1pbmltYXAuZW5hYmxlZCddKSB7XG5cdFx0XHRcdG9wdGlvbnMubWluaW1hcCA9IHsgZW5hYmxlZDogdHJ1ZSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKG91dHB1dENvbmZpZ1snZWRpdG9yLndvcmRXcmFwJ10pIHtcblx0XHRcdFx0b3B0aW9ucy53b3JkV3JhcCA9IG91dHB1dENvbmZpZ1snZWRpdG9yLndvcmRXcmFwJ107XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG9wdGlvbnM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQgPyB0aGlzLmlucHV0LmdldEFyaWFMYWJlbCgpIDogbmxzLmxvY2FsaXplKCdvdXRwdXRWaWV3QXJpYUxhYmVsJywgXCJPdXRwdXQgcGFuZWxcIik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY29tcHV0ZUFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmlucHV0ID8gY29tcHV0ZUVkaXRvckFyaWFMYWJlbCh0aGlzLmlucHV0LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuY291bnQpIDogdGhpcy5nZXRBcmlhTGFiZWwoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNldElucHV0KGlucHV0OiBUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCwgb3B0aW9uczogSVRleHRFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZvY3VzID0gIShvcHRpb25zICYmIG9wdGlvbnMucHJlc2VydmVGb2N1cyk7XG5cdFx0aWYgKHRoaXMuaW5wdXQgJiYgaW5wdXQubWF0Y2hlcyh0aGlzLmlucHV0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlucHV0KSB7XG5cdFx0XHQvLyBEaXNwb3NlIHByZXZpb3VzIGlucHV0IChPdXRwdXQgcGFuZWwgaXMgbm90IGEgd29ya2JlbmNoIGVkaXRvcilcblx0XHRcdHRoaXMuaW5wdXQuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRhd2FpdCBzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXG5cdFx0dGhpcy5yZXNvdXJjZUNvbnRleHQuc2V0KGlucHV0LnJlc291cmNlKTtcblxuXHRcdGlmIChmb2N1cykge1xuXHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdH1cblx0XHR0aGlzLnJldmVhbExhc3RMaW5lKCk7XG5cdH1cblxuXHRvdmVycmlkZSBjbGVhcklucHV0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlucHV0KSB7XG5cdFx0XHQvLyBEaXNwb3NlIGN1cnJlbnQgaW5wdXQgKE91dHB1dCBwYW5lbCBpcyBub3QgYSB3b3JrYmVuY2ggZWRpdG9yKVxuXHRcdFx0dGhpcy5pbnB1dC5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHN1cGVyLmNsZWFySW5wdXQoKTtcblxuXHRcdHRoaXMucmVzb3VyY2VDb250ZXh0LnJlc2V0KCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblxuXHRcdHBhcmVudC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZG9jdW1lbnQnKTtcblxuXHRcdHN1cGVyLmNyZWF0ZUVkaXRvcihwYXJlbnQpO1xuXG5cdFx0Y29uc3Qgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlO1xuXHRcdGlmIChzY29wZWRDb250ZXh0S2V5U2VydmljZSkge1xuXHRcdFx0Q09OVEVYVF9JTl9PVVRQVVQuYmluZFRvKHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29udHJpYnV0aW9ucygpOiBJRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb25bXSB7XG5cdFx0cmV0dXJuIFtcblx0XHRcdC4uLkVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRFZGl0b3JDb250cmlidXRpb25zKCksXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBGaWx0ZXJDb250cm9sbGVyLklELFxuXHRcdFx0XHRjdG9yOiBGaWx0ZXJDb250cm9sbGVyIGFzIEVkaXRvckNvbnRyaWJ1dGlvbkN0b3IsXG5cdFx0XHRcdGluc3RhbnRpYXRpb246IEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uRWFnZXJcblx0XHRcdH1cblx0XHRdO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldENvZGVFZGl0b3JXaWRnZXRPcHRpb25zKCk6IElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyB7XG5cdFx0cmV0dXJuIHsgY29udHJpYnV0aW9uczogdGhpcy5fZ2V0Q29udHJpYnV0aW9ucygpIH07XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgRmlsdGVyQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ291dHB1dC5lZGl0b3IuY29udHJpYi5maWx0ZXJDb250cm9sbGVyJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgaGlkZGVuQXJlYXM6IFJhbmdlW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBjYXRlZ29yaWVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBkZWNvcmF0aW9uc0NvbGxlY3Rpb246IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJT3V0cHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG91dHB1dFNlcnZpY2U6IElPdXRwdXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZGVjb3JhdGlvbnNDb2xsZWN0aW9uID0gZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHRoaXMub25EaWRDaGFuZ2VNb2RlbCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vdXRwdXRTZXJ2aWNlLmZpbHRlcnMub25EaWRDaGFuZ2UoKCkgPT4gZWRpdG9yLmhhc01vZGVsKCkgJiYgdGhpcy5maWx0ZXIoZWRpdG9yLmdldE1vZGVsKCkpKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlTW9kZWwoKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5oaWRkZW5BcmVhcyA9IFtdO1xuXHRcdHRoaXMuY2F0ZWdvcmllcy5jbGVhcigpO1xuXG5cdFx0aWYgKCF0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdHRoaXMuZmlsdGVyKG1vZGVsKTtcblxuXHRcdGNvbnN0IGNvbXB1dGVFbmRMaW5lTnVtYmVyID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdFx0cmV0dXJuIGVuZExpbmVOdW1iZXIgPiAxICYmIG1vZGVsLmdldExpbmVNYXhDb2x1bW4oZW5kTGluZU51bWJlcikgPT09IDEgPyBlbmRMaW5lTnVtYmVyIC0gMSA6IGVuZExpbmVOdW1iZXI7XG5cdFx0fTtcblxuXHRcdGxldCBlbmRMaW5lTnVtYmVyID0gY29tcHV0ZUVuZExpbmVOdW1iZXIoKTtcblxuXHRcdHRoaXMubW9kZWxEaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRDaGFuZ2VDb250ZW50KGUgPT4ge1xuXHRcdFx0aWYgKGUuY2hhbmdlcy5ldmVyeShlID0+IGUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gZW5kTGluZU51bWJlcikpIHtcblx0XHRcdFx0dGhpcy5maWx0ZXJJbmNyZW1lbnRhbChtb2RlbCwgZW5kTGluZU51bWJlciArIDEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5maWx0ZXIobW9kZWwpO1xuXHRcdFx0fVxuXHRcdFx0ZW5kTGluZU51bWJlciA9IGNvbXB1dGVFbmRMaW5lTnVtYmVyKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXIobW9kZWw6IElUZXh0TW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLmhpZGRlbkFyZWFzID0gW107XG5cdFx0dGhpcy5kZWNvcmF0aW9uc0NvbGxlY3Rpb24uY2xlYXIoKTtcblx0XHR0aGlzLmZpbHRlckluY3JlbWVudGFsKG1vZGVsLCAxKTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVySW5jcmVtZW50YWwobW9kZWw6IElUZXh0TW9kZWwsIGZyb21MaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCB7IGZpbmRNYXRjaGVzLCBoaWRkZW5BcmVhcywgY2F0ZWdvcmllczogc291cmNlcyB9ID0gdGhpcy5jb21wdXRlKG1vZGVsLCBmcm9tTGluZU51bWJlcik7XG5cdFx0dGhpcy5oaWRkZW5BcmVhcy5wdXNoKC4uLmhpZGRlbkFyZWFzKTtcblx0XHR0aGlzLmVkaXRvci5zZXRIaWRkZW5BcmVhcyh0aGlzLmhpZGRlbkFyZWFzLCB0aGlzKTtcblx0XHRpZiAoZmluZE1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmRlY29yYXRpb25zQ29sbGVjdGlvbi5hcHBlbmQoZmluZE1hdGNoZXMpO1xuXHRcdH1cblx0XHRpZiAoc291cmNlcy5zaXplKSB7XG5cdFx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRcdGZvciAoY29uc3QgW2NhdGVnb3J5RmlsdGVyLCBjYXRlZ29yeU5hbWVdIG9mIHNvdXJjZXMpIHtcblx0XHRcdFx0aWYgKHRoaXMuY2F0ZWdvcmllcy5oYXMoY2F0ZWdvcnlGaWx0ZXIpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5jYXRlZ29yaWVzLnNldChjYXRlZ29yeUZpbHRlciwgY2F0ZWdvcnlOYW1lKTtcblx0XHRcdFx0dGhpcy5tb2RlbERpc3Bvc2FibGVzLmFkZChyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9ucy4ke09VVFBVVF9WSUVXX0lEfS50b2dnbGUuJHtjYXRlZ29yeUZpbHRlcn1gLFxuXHRcdFx0XHRcdFx0XHR0aXRsZTogY2F0ZWdvcnlOYW1lLFxuXHRcdFx0XHRcdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5yZWdleChISURFX0NBVEVHT1JZX0ZJTFRFUl9DT05URVhULmtleSwgbmV3IFJlZ0V4cChgLiosJHtlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKGNhdGVnb3J5RmlsdGVyKX0sLipgKSkubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogdmlld0ZpbHRlclN1Ym1lbnUsXG5cdFx0XHRcdFx0XHRcdFx0Z3JvdXA6ICcxX2NhdGVnb3J5X2ZpbHRlcicsXG5cdFx0XHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIE9VVFBVVF9WSUVXX0lEKSksXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdFx0XHR0aGF0Lm91dHB1dFNlcnZpY2UuZmlsdGVycy50b2dnbGVDYXRlZ29yeShjYXRlZ29yeUZpbHRlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRTaG93TGluZShtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlLCBwb3NpdGl2ZTogc3RyaW5nW10sIG5lZ2F0aXZlOiBzdHJpbmdbXSk6IHsgc2hvdzogYm9vbGVhbjsgbWF0Y2hlczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gfSB7XG5cdFx0Y29uc3QgbWF0Y2hlczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblxuXHRcdC8vIENoZWNrIG5lZ2F0aXZlIGZpbHRlcnMgZmlyc3QgLSBpZiBhbnkgbWF0Y2gsIGhpZGUgdGhlIGxpbmVcblx0XHRpZiAobmVnYXRpdmUubGVuZ3RoID4gMCkge1xuXHRcdFx0Zm9yIChjb25zdCBwYXR0ZXJuIG9mIG5lZ2F0aXZlKSB7XG5cdFx0XHRcdGNvbnN0IG5lZ2F0aXZlTWF0Y2hlcyA9IG1vZGVsLmZpbmRNYXRjaGVzKHBhdHRlcm4sIHJhbmdlLCBmYWxzZSwgZmFsc2UsIG51bGwsIGZhbHNlKTtcblx0XHRcdFx0aWYgKG5lZ2F0aXZlTWF0Y2hlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgc2hvdzogZmFsc2UsIG1hdGNoZXM6IFtdIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiB0aGVyZSBhcmUgcG9zaXRpdmUgZmlsdGVycywgYXQgbGVhc3Qgb25lIG11c3QgbWF0Y2hcblx0XHRpZiAocG9zaXRpdmUubGVuZ3RoID4gMCkge1xuXHRcdFx0bGV0IGhhc1Bvc2l0aXZlTWF0Y2ggPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3QgcGF0dGVybiBvZiBwb3NpdGl2ZSkge1xuXHRcdFx0XHRjb25zdCBwb3NpdGl2ZU1hdGNoZXMgPSBtb2RlbC5maW5kTWF0Y2hlcyhwYXR0ZXJuLCByYW5nZSwgZmFsc2UsIGZhbHNlLCBudWxsLCBmYWxzZSk7XG5cdFx0XHRcdGlmIChwb3NpdGl2ZU1hdGNoZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGhhc1Bvc2l0aXZlTWF0Y2ggPSB0cnVlO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgbWF0Y2ggb2YgcG9zaXRpdmVNYXRjaGVzKSB7XG5cdFx0XHRcdFx0XHRtYXRjaGVzLnB1c2goeyByYW5nZTogbWF0Y2gucmFuZ2UsIG9wdGlvbnM6IEZpbmREZWNvcmF0aW9ucy5fRklORF9NQVRDSF9ERUNPUkFUSU9OIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgc2hvdzogaGFzUG9zaXRpdmVNYXRjaCwgbWF0Y2hlcyB9O1xuXHRcdH1cblxuXHRcdC8vIE5vIHBvc2l0aXZlIGZpbHRlcnMgbWVhbnMgc2hvdyBldmVyeXRoaW5nICh0aGF0IHBhc3NlZCBuZWdhdGl2ZSBmaWx0ZXJzKVxuXHRcdHJldHVybiB7IHNob3c6IHRydWUsIG1hdGNoZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZShtb2RlbDogSVRleHRNb2RlbCwgZnJvbUxpbmVOdW1iZXI6IG51bWJlcik6IHsgZmluZE1hdGNoZXM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdOyBoaWRkZW5BcmVhczogUmFuZ2VbXTsgY2F0ZWdvcmllczogTWFwPHN0cmluZywgc3RyaW5nPiB9IHtcblx0XHRjb25zdCBmaWx0ZXJzID0gdGhpcy5vdXRwdXRTZXJ2aWNlLmZpbHRlcnM7XG5cdFx0Y29uc3QgYWN0aXZlQ2hhbm5lbCA9IHRoaXMub3V0cHV0U2VydmljZS5nZXRBY3RpdmVDaGFubmVsKCk7XG5cdFx0Y29uc3QgZmluZE1hdGNoZXM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0Y29uc3QgaGlkZGVuQXJlYXM6IFJhbmdlW10gPSBbXTtcblx0XHRjb25zdCBjYXRlZ29yaWVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHRcdGNvbnN0IGxvZ0VudHJpZXMgPSBhY3RpdmVDaGFubmVsPy5nZXRMb2dFbnRyaWVzKCk7XG5cdFx0aWYgKGFjdGl2ZUNoYW5uZWwgJiYgbG9nRW50cmllcz8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBoYXNMb2dMZXZlbEZpbHRlciA9ICFmaWx0ZXJzLnRyYWNlIHx8ICFmaWx0ZXJzLmRlYnVnIHx8ICFmaWx0ZXJzLmluZm8gfHwgIWZpbHRlcnMud2FybmluZyB8fCAhZmlsdGVycy5lcnJvcjtcblxuXHRcdFx0Y29uc3QgZnJvbUxvZ0xldmVsRW50cnlJbmRleCA9IGxvZ0VudHJpZXMuZmluZEluZGV4KGVudHJ5ID0+IGZyb21MaW5lTnVtYmVyID49IGVudHJ5LnJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiBmcm9tTGluZU51bWJlciA8PSBlbnRyeS5yYW5nZS5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdGlmIChmcm9tTG9nTGV2ZWxFbnRyeUluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRyZXR1cm4geyBmaW5kTWF0Y2hlcywgaGlkZGVuQXJlYXMsIGNhdGVnb3JpZXMgfTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChsZXQgaSA9IGZyb21Mb2dMZXZlbEVudHJ5SW5kZXg7IGkgPCBsb2dFbnRyaWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gbG9nRW50cmllc1tpXTtcblx0XHRcdFx0aWYgKGVudHJ5LmNhdGVnb3J5KSB7XG5cdFx0XHRcdFx0Y2F0ZWdvcmllcy5zZXQoYCR7YWN0aXZlQ2hhbm5lbC5pZH06JHtlbnRyeS5jYXRlZ29yeX1gLCBlbnRyeS5jYXRlZ29yeSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGhhc0xvZ0xldmVsRmlsdGVyICYmICF0aGlzLnNob3VsZFNob3dMb2dMZXZlbChlbnRyeSwgZmlsdGVycykpIHtcblx0XHRcdFx0XHRoaWRkZW5BcmVhcy5wdXNoKGVudHJ5LnJhbmdlKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXRoaXMuc2hvdWxkU2hvd0NhdGVnb3J5KGFjdGl2ZUNoYW5uZWwuaWQsIGVudHJ5LCBmaWx0ZXJzKSkge1xuXHRcdFx0XHRcdGhpZGRlbkFyZWFzLnB1c2goZW50cnkucmFuZ2UpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmaWx0ZXJzLmluY2x1ZGVQYXR0ZXJucy5sZW5ndGggPiAwIHx8IGZpbHRlcnMuZXhjbHVkZVBhdHRlcm5zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnNob3VsZFNob3dMaW5lKG1vZGVsLCBlbnRyeS5yYW5nZSwgZmlsdGVycy5pbmNsdWRlUGF0dGVybnMsIGZpbHRlcnMuZXhjbHVkZVBhdHRlcm5zKTtcblx0XHRcdFx0XHRpZiAocmVzdWx0LnNob3cpIHtcblx0XHRcdFx0XHRcdGZpbmRNYXRjaGVzLnB1c2goLi4ucmVzdWx0Lm1hdGNoZXMpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRoaWRkZW5BcmVhcy5wdXNoKGVudHJ5LnJhbmdlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGZpbmRNYXRjaGVzLCBoaWRkZW5BcmVhcywgY2F0ZWdvcmllcyB9O1xuXHRcdH1cblxuXHRcdGlmIChmaWx0ZXJzLmluY2x1ZGVQYXR0ZXJucy5sZW5ndGggPT09IDAgJiYgZmlsdGVycy5leGNsdWRlUGF0dGVybnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4geyBmaW5kTWF0Y2hlcywgaGlkZGVuQXJlYXMsIGNhdGVnb3JpZXMgfTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gZnJvbUxpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gbGluZUNvdW50OyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGNvbnN0IGxpbmVSYW5nZSA9IG5ldyBSYW5nZShsaW5lTnVtYmVyLCAxLCBsaW5lTnVtYmVyLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuc2hvdWxkU2hvd0xpbmUobW9kZWwsIGxpbmVSYW5nZSwgZmlsdGVycy5pbmNsdWRlUGF0dGVybnMsIGZpbHRlcnMuZXhjbHVkZVBhdHRlcm5zKTtcblx0XHRcdGlmIChyZXN1bHQuc2hvdykge1xuXHRcdFx0XHRmaW5kTWF0Y2hlcy5wdXNoKC4uLnJlc3VsdC5tYXRjaGVzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhpZGRlbkFyZWFzLnB1c2gobGluZVJhbmdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgZmluZE1hdGNoZXMsIGhpZGRlbkFyZWFzLCBjYXRlZ29yaWVzIH07XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFNob3dMb2dMZXZlbChlbnRyeTogSUxvZ0VudHJ5LCBmaWx0ZXJzOiBJT3V0cHV0Vmlld0ZpbHRlcnMpOiBib29sZWFuIHtcblx0XHRzd2l0Y2ggKGVudHJ5LmxvZ0xldmVsKSB7XG5cdFx0XHRjYXNlIExvZ0xldmVsLlRyYWNlOlxuXHRcdFx0XHRyZXR1cm4gZmlsdGVycy50cmFjZTtcblx0XHRcdGNhc2UgTG9nTGV2ZWwuRGVidWc6XG5cdFx0XHRcdHJldHVybiBmaWx0ZXJzLmRlYnVnO1xuXHRcdFx0Y2FzZSBMb2dMZXZlbC5JbmZvOlxuXHRcdFx0XHRyZXR1cm4gZmlsdGVycy5pbmZvO1xuXHRcdFx0Y2FzZSBMb2dMZXZlbC5XYXJuaW5nOlxuXHRcdFx0XHRyZXR1cm4gZmlsdGVycy53YXJuaW5nO1xuXHRcdFx0Y2FzZSBMb2dMZXZlbC5FcnJvcjpcblx0XHRcdFx0cmV0dXJuIGZpbHRlcnMuZXJyb3I7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRTaG93Q2F0ZWdvcnkoYWN0aXZlQ2hhbm5lbElkOiBzdHJpbmcsIGVudHJ5OiBJTG9nRW50cnksIGZpbHRlcnM6IElPdXRwdXRWaWV3RmlsdGVycyk6IGJvb2xlYW4ge1xuXHRcdGlmICghZW50cnkuY2F0ZWdvcnkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gIWZpbHRlcnMuaGFzQ2F0ZWdvcnkoYCR7YWN0aXZlQ2hhbm5lbElkfToke2VudHJ5LmNhdGVnb3J5fWApO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUlBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFHckIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7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
