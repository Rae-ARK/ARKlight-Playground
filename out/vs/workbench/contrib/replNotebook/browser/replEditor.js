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
import "./media/interactive.css";
import * as DOM from "../../../../base/browser/dom.js";
import * as domStylesheets from "../../../../base/browser/domStylesheets.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { EditorPaneSelectionChangeReason } from "../../../common/editor.js";
import { getSimpleEditorOptions } from "../../codeEditor/browser/simpleEditorOptions.js";
import { NotebookEditorExtensionsRegistry } from "../../notebook/browser/notebookEditorExtensions.js";
import { INotebookEditorService } from "../../notebook/browser/services/notebookEditorService.js";
import { getDefaultNotebookCreationOptions, NotebookEditorWidget } from "../../notebook/browser/notebookEditorWidget.js";
import { GroupsOrder, IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { ExecutionStateCellStatusBarContrib, TimerCellStatusBarContrib } from "../../notebook/browser/contrib/cellStatusBar/executionStatusBarItemController.js";
import { INotebookKernelService } from "../../notebook/common/notebookKernelService.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ReplEditorSettings, INTERACTIVE_INPUT_CURSOR_BOUNDARY } from "../../interactive/browser/interactiveCommon.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { NotebookOptions } from "../../notebook/browser/notebookOptions.js";
import { ToolBar } from "../../../../base/browser/ui/toolbar/toolbar.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { createActionViewItem, getActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { SelectionClipboardContributionID } from "../../codeEditor/browser/selectionClipboard.js";
import { ContextMenuController } from "../../../../editor/contrib/contextmenu/browser/contextmenu.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { MarkerController } from "../../../../editor/contrib/gotoError/browser/gotoError.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { TextEditorSelectionSource } from "../../../../platform/editor/common/editor.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../notebook/common/notebookExecutionStateService.js";
import { NOTEBOOK_KERNEL } from "../../notebook/common/notebookContextKeys.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { isEqual } from "../../../../base/common/resources.js";
import { NotebookFindContrib } from "../../notebook/browser/contrib/find/notebookFindWidget.js";
import { REPL_EDITOR_ID } from "../../notebook/common/notebookCommon.js";
import "./interactiveEditor.css";
import { deepClone } from "../../../../base/common/objects.js";
import { GlyphHoverController } from "../../../../editor/contrib/hover/browser/glyphHoverController.js";
import { ContentHoverController } from "../../../../editor/contrib/hover/browser/contentHoverController.js";
import { ReplEditorInput } from "./replEditorInput.js";
import { ReplInputHintContentWidget } from "../../interactive/browser/replInputHintContentWidget.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { localize } from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
const INTERACTIVE_EDITOR_VIEW_STATE_PREFERENCE_KEY = "InteractiveEditorViewState";
const INPUT_CELL_VERTICAL_PADDING = 8;
const INPUT_CELL_HORIZONTAL_PADDING_RIGHT = 10;
const INPUT_EDITOR_PADDING = 8;
let ReplEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, instantiationService, notebookWidgetService, contextKeyService, notebookKernelService, languageService, keybindingService, configurationService, menuService, contextMenuService, editorGroupService, textResourceConfigurationService, notebookExecutionStateService, extensionService, _accessibilityService) {
    super(
      REPL_EDITOR_ID,
      group,
      telemetryService,
      themeService,
      storageService
    );
    this._accessibilityService = _accessibilityService;
    this._notebookWidget = { value: void 0 };
    this._widgetDisposableStore = this._register(new DisposableStore());
    this._groupListener = this._register(new MutableDisposable());
    this._onDidFocusWidget = this._register(new Emitter());
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._onDidChangeScroll = this._register(new Emitter());
    this.onDidChangeScroll = this._onDidChangeScroll.event;
    this._notebookWidgetService = notebookWidgetService;
    this._configurationService = configurationService;
    this._notebookKernelService = notebookKernelService;
    this._languageService = languageService;
    this._keybindingService = keybindingService;
    this._menuService = menuService;
    this._contextMenuService = contextMenuService;
    this._editorGroupService = editorGroupService;
    this._extensionService = extensionService;
    this._rootElement = DOM.$(".interactive-editor");
    this._contextKeyService = this._register(contextKeyService.createScoped(this._rootElement));
    this._contextKeyService.createKey("isCompositeNotebook", true);
    this._instantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService])));
    this._editorOptions = this._computeEditorOptions();
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor") || e.affectsConfiguration("notebook")) {
        this._editorOptions = this._computeEditorOptions();
      }
    }));
    this._notebookOptions = instantiationService.createInstance(NotebookOptions, this.window, true, { cellToolbarInteraction: "hover", globalToolbar: true, stickyScrollEnabled: false, dragAndDropEnabled: false, disableRulers: true });
    this._editorMemento = this.getEditorMemento(editorGroupService, textResourceConfigurationService, INTERACTIVE_EDITOR_VIEW_STATE_PREFERENCE_KEY);
    this._register(this._keybindingService.onDidUpdateKeybindings(this._updateInputHint, this));
    this._register(notebookExecutionStateService.onDidChangeExecution((e) => {
      if (e.type === NotebookExecutionType.cell && isEqual(e.notebook, this._notebookWidget.value?.viewModel?.notebookDocument.uri)) {
        const cell = this._notebookWidget.value?.getCellByHandle(e.cellHandle);
        if (cell && e.changed?.state) {
          this._scrollIfNecessary(cell);
        }
      }
    }));
  }
  get onDidFocus() {
    return this._onDidFocusWidget.event;
  }
  get inputCellContainerHeight() {
    return 19 + 2 + INPUT_CELL_VERTICAL_PADDING * 2 + INPUT_EDITOR_PADDING * 2;
  }
  get inputCellEditorHeight() {
    return 19 + INPUT_EDITOR_PADDING * 2;
  }
  createEditor(parent) {
    DOM.append(parent, this._rootElement);
    this._rootElement.style.position = "relative";
    this._notebookEditorContainer = DOM.append(this._rootElement, DOM.$(".notebook-editor-container"));
    this._inputCellContainer = DOM.append(this._rootElement, DOM.$(".input-cell-container"));
    this._inputCellContainer.style.position = "absolute";
    this._inputCellContainer.style.height = `${this.inputCellContainerHeight}px`;
    this._inputFocusIndicator = DOM.append(this._inputCellContainer, DOM.$(".input-focus-indicator"));
    this._inputRunButtonContainer = DOM.append(this._inputCellContainer, DOM.$(".run-button-container"));
    this._setupRunButtonToolbar(this._inputRunButtonContainer);
    this._inputEditorContainer = DOM.append(this._inputCellContainer, DOM.$(".input-editor-container"));
    this._createLayoutStyles();
  }
  _setupRunButtonToolbar(runButtonContainer) {
    const menu = this._register(this._menuService.createMenu(MenuId.ReplInputExecute, this._contextKeyService));
    this._runbuttonToolbar = this._register(new ToolBar(runButtonContainer, this._contextMenuService, {
      getKeyBinding: (action) => this._keybindingService.lookupKeybinding(action.id),
      actionViewItemProvider: (action, options) => {
        return createActionViewItem(this._instantiationService, action, options);
      },
      renderDropdownAsChildElement: true
    }));
    const { primary, secondary } = getActionBarActions(menu.getActions({ shouldForwardArgs: true }));
    this._runbuttonToolbar.setActions([...primary, ...secondary]);
  }
  _createLayoutStyles() {
    this._styleElement = domStylesheets.createStyleSheet(this._rootElement);
    const styleSheets = [];
    const {
      codeCellLeftMargin,
      cellRunGutter
    } = this._notebookOptions.getLayoutConfiguration();
    const {
      focusIndicator
    } = this._notebookOptions.getDisplayOptions();
    const leftMargin = this._notebookOptions.getCellEditorContainerLeftMargin();
    styleSheets.push(`
			.interactive-editor .input-cell-container {
				padding: ${INPUT_CELL_VERTICAL_PADDING}px ${INPUT_CELL_HORIZONTAL_PADDING_RIGHT}px ${INPUT_CELL_VERTICAL_PADDING}px ${leftMargin}px;
			}
		`);
    if (focusIndicator === "gutter") {
      styleSheets.push(`
				.interactive-editor .input-cell-container:focus-within .input-focus-indicator::before {
					border-color: var(--vscode-notebook-focusedCellBorder) !important;
				}
				.interactive-editor .input-focus-indicator::before {
					border-color: var(--vscode-notebook-inactiveFocusedCellBorder) !important;
				}
				.interactive-editor .input-cell-container .input-focus-indicator {
					display: block;
					top: ${INPUT_CELL_VERTICAL_PADDING}px;
				}
				.interactive-editor .input-cell-container {
					border-top: 1px solid var(--vscode-notebook-inactiveFocusedCellBorder);
				}
			`);
    } else {
      styleSheets.push(`
				.interactive-editor .input-cell-container {
					border-top: 1px solid var(--vscode-notebook-inactiveFocusedCellBorder);
				}
				.interactive-editor .input-cell-container .input-focus-indicator {
					display: none;
				}
			`);
    }
    styleSheets.push(`
			.interactive-editor .input-cell-container .run-button-container {
				width: ${cellRunGutter}px;
				left: ${codeCellLeftMargin}px;
				margin-top: ${INPUT_EDITOR_PADDING - 2}px;
			}
		`);
    this._styleElement.textContent = styleSheets.join("\n");
  }
  _computeEditorOptions() {
    let overrideIdentifier = void 0;
    if (this._codeEditorWidget) {
      overrideIdentifier = this._codeEditorWidget.getModel()?.getLanguageId();
    }
    const editorOptions = deepClone(this._configurationService.getValue("editor", { overrideIdentifier }));
    const editorOptionsOverride = getSimpleEditorOptions(this._configurationService);
    const computed = Object.freeze({
      ...editorOptions,
      ...editorOptionsOverride,
      ...{
        ariaLabel: localize("replEditorInput", "REPL Input"),
        glyphMargin: true,
        padding: {
          top: INPUT_EDITOR_PADDING,
          bottom: INPUT_EDITOR_PADDING
        },
        hover: {
          enabled: "on"
        },
        rulers: []
      }
    });
    return computed;
  }
  saveState() {
    this._saveEditorViewState(this.input);
    super.saveState();
  }
  getViewState() {
    const input = this.input;
    if (!(input instanceof ReplEditorInput)) {
      return void 0;
    }
    this._saveEditorViewState(input);
    return this._loadNotebookEditorViewState(input);
  }
  _saveEditorViewState(input) {
    if (this._notebookWidget.value && input instanceof ReplEditorInput) {
      if (this._notebookWidget.value.isDisposed) {
        return;
      }
      const state = this._notebookWidget.value.getEditorViewState();
      const editorState = this._codeEditorWidget.saveViewState();
      this._editorMemento.saveEditorState(this.group, input.resource, {
        notebook: state,
        input: editorState
      });
    }
  }
  _loadNotebookEditorViewState(input) {
    const result = this._editorMemento.loadEditorState(this.group, input.resource);
    if (result) {
      return result;
    }
    for (const group of this._editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
      if (group.activeEditorPane !== this && group.activeEditorPane === this && group.activeEditor?.matches(input)) {
        const notebook = this._notebookWidget.value?.getEditorViewState();
        const input2 = this._codeEditorWidget.saveViewState();
        return {
          notebook,
          input: input2
        };
      }
    }
    return;
  }
  async setInput(input, options, context, token) {
    this._notebookWidget.value?.onWillHide();
    this._codeEditorWidget?.dispose();
    this._widgetDisposableStore.clear();
    this._notebookWidget = this._instantiationService.invokeFunction(this._notebookWidgetService.retrieveWidget, this.group.id, input, {
      isReplHistory: true,
      isReadOnly: true,
      contributions: NotebookEditorExtensionsRegistry.getSomeEditorContributions([
        ExecutionStateCellStatusBarContrib.id,
        TimerCellStatusBarContrib.id,
        NotebookFindContrib.id
      ]),
      menuIds: {
        notebookToolbar: MenuId.InteractiveToolbar,
        cellTitleToolbar: MenuId.InteractiveCellTitle,
        cellDeleteToolbar: MenuId.InteractiveCellDelete,
        cellInsertToolbar: MenuId.NotebookCellBetween,
        cellTopInsertToolbar: MenuId.NotebookCellListTop,
        cellExecuteToolbar: MenuId.InteractiveCellExecute,
        cellExecutePrimary: void 0
      },
      cellEditorContributions: EditorExtensionsRegistry.getSomeEditorContributions([
        SelectionClipboardContributionID,
        ContextMenuController.ID,
        ContentHoverController.ID,
        GlyphHoverController.ID,
        MarkerController.ID
      ]),
      options: this._notebookOptions,
      codeWindow: this.window
    }, void 0, this.window);
    const skipContributions = [
      "workbench.notebook.cellToolbar",
      "editor.contrib.inlineCompletionsController"
    ];
    const inputContributions = getDefaultNotebookCreationOptions().cellEditorContributions?.filter((c) => skipContributions.indexOf(c.id) === -1);
    this._codeEditorWidget = this._instantiationService.createInstance(CodeEditorWidget, this._inputEditorContainer, this._editorOptions, {
      ...{
        isSimpleWidget: false,
        contributions: inputContributions
      }
    });
    if (this._lastLayoutDimensions) {
      this._notebookEditorContainer.style.height = `${this._lastLayoutDimensions.dimension.height - this.inputCellContainerHeight}px`;
      this._notebookWidget.value.layout(new DOM.Dimension(this._lastLayoutDimensions.dimension.width, this._lastLayoutDimensions.dimension.height - this.inputCellContainerHeight), this._notebookEditorContainer);
      const leftMargin = this._notebookOptions.getCellEditorContainerLeftMargin();
      const maxHeight = Math.min(this._lastLayoutDimensions.dimension.height / 2, this.inputCellEditorHeight);
      this._codeEditorWidget.layout(this._validateDimension(this._lastLayoutDimensions.dimension.width - leftMargin - INPUT_CELL_HORIZONTAL_PADDING_RIGHT, maxHeight));
      this._inputFocusIndicator.style.height = `${this.inputCellEditorHeight}px`;
      this._inputCellContainer.style.top = `${this._lastLayoutDimensions.dimension.height - this.inputCellContainerHeight}px`;
      this._inputCellContainer.style.width = `${this._lastLayoutDimensions.dimension.width}px`;
    }
    await super.setInput(input, options, context, token);
    const model = await input.resolve();
    if (this._runbuttonToolbar) {
      this._runbuttonToolbar.context = input.resource;
    }
    if (model === null) {
      throw new Error("The REPL model could not be resolved");
    }
    this._notebookWidget.value?.setParentContextKeyService(this._contextKeyService);
    const viewState = options?.viewState ?? this._loadNotebookEditorViewState(input);
    await this._extensionService.whenInstalledExtensionsRegistered();
    await this._notebookWidget.value.setModel(model.notebook, viewState?.notebook, void 0, "repl");
    model.notebook.setCellCollapseDefault(this._notebookOptions.getCellCollapseDefault());
    this._notebookWidget.value.setOptions({
      isReadOnly: true
    });
    this._widgetDisposableStore.add(this._notebookWidget.value.onDidResizeOutput((cvm) => {
      this._scrollIfNecessary(cvm);
    }));
    this._widgetDisposableStore.add(this._notebookWidget.value.onDidFocusWidget(() => this._onDidFocusWidget.fire()));
    this._widgetDisposableStore.add(this._notebookOptions.onDidChangeOptions((e) => {
      if (e.compactView || e.focusIndicator) {
        this._styleElement?.remove();
        this._createLayoutStyles();
      }
      if (this._lastLayoutDimensions && this.isVisible()) {
        this.layout(this._lastLayoutDimensions.dimension, this._lastLayoutDimensions.position);
      }
      if (e.interactiveWindowCollapseCodeCells) {
        model.notebook.setCellCollapseDefault(this._notebookOptions.getCellCollapseDefault());
      }
    }));
    const editorModel = await input.resolveInput(model.notebook);
    this._codeEditorWidget.setModel(editorModel);
    if (viewState?.input) {
      this._codeEditorWidget.restoreViewState(viewState.input);
    }
    this._editorOptions = this._computeEditorOptions();
    this._codeEditorWidget.updateOptions(this._editorOptions);
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidFocusEditorWidget(() => this._onDidFocusWidget.fire()));
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidContentSizeChange((e) => {
      if (!e.contentHeightChanged) {
        return;
      }
      if (this._lastLayoutDimensions) {
        this._layoutWidgets(this._lastLayoutDimensions.dimension, this._lastLayoutDimensions.position);
      }
    }));
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidChangeCursorPosition((e) => this._onDidChangeSelection.fire({ reason: this._toEditorPaneSelectionChangeReason(e) })));
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidChangeModelContent(() => this._onDidChangeSelection.fire({ reason: EditorPaneSelectionChangeReason.EDIT })));
    this._widgetDisposableStore.add(this._notebookKernelService.onDidChangeNotebookAffinity(this._syncWithKernel, this));
    this._widgetDisposableStore.add(this._notebookKernelService.onDidChangeSelectedNotebooks(this._syncWithKernel, this));
    this._widgetDisposableStore.add(this.themeService.onDidColorThemeChange(() => {
      if (this.isVisible()) {
        this._updateInputHint();
      }
    }));
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidChangeModelContent(() => {
      if (this.isVisible()) {
        this._updateInputHint();
      }
    }));
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidChangeModelDecorations(() => {
      if (this.isVisible()) {
        this._updateInputHint();
      }
    }));
    const cursorAtBoundaryContext = INTERACTIVE_INPUT_CURSOR_BOUNDARY.bindTo(this._contextKeyService);
    if (input.resource && input.historyService.has(input.resource)) {
      cursorAtBoundaryContext.set("top");
    } else {
      cursorAtBoundaryContext.set("none");
    }
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidChangeCursorPosition(({ position }) => {
      const viewModel = this._codeEditorWidget._getViewModel();
      const lastLineNumber = viewModel.getLineCount();
      const lastLineCol = viewModel.getLineLength(lastLineNumber) + 1;
      const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
      const firstLine = viewPosition.lineNumber === 1 && viewPosition.column === 1;
      const lastLine = viewPosition.lineNumber === lastLineNumber && viewPosition.column === lastLineCol;
      if (firstLine) {
        if (lastLine) {
          cursorAtBoundaryContext.set("both");
        } else {
          cursorAtBoundaryContext.set("top");
        }
      } else {
        if (lastLine) {
          cursorAtBoundaryContext.set("bottom");
        } else {
          cursorAtBoundaryContext.set("none");
        }
      }
    }));
    this._widgetDisposableStore.add(editorModel.onDidChangeContent(() => {
      const value = editorModel.getValue();
      if (this.input?.resource && value !== "") {
        const historyService = this.input.historyService;
        if (!historyService.matchesCurrent(this.input.resource, value)) {
          historyService.replaceLast(this.input.resource, value);
        }
      }
    }));
    this._widgetDisposableStore.add(this._notebookWidget.value.onDidScroll(() => this._onDidChangeScroll.fire()));
    this._widgetDisposableStore.add(this._notebookWidget.value.onDidChangeViewCells(this.handleViewCellChange, this));
    this._updateInputHint();
    this._syncWithKernel();
  }
  handleViewCellChange(e) {
    const notebookWidget = this._notebookWidget.value;
    if (!notebookWidget) {
      return;
    }
    for (const splice of e.splices) {
      const [_start, _delete, addedCells] = splice;
      if (addedCells.length) {
        const viewModel = notebookWidget.viewModel;
        if (viewModel) {
          this.handleAppend(notebookWidget, viewModel);
          break;
        }
      }
    }
  }
  handleAppend(notebookWidget, viewModel) {
    this._notebookWidgetService.updateReplContextKey(viewModel.notebookDocument.uri.toString());
    const navigateToCell = this._configurationService.getValue("accessibility.replEditor.autoFocusReplExecution");
    if (this._accessibilityService.isScreenReaderOptimized()) {
      if (navigateToCell === "lastExecution") {
        setTimeout(() => {
          const lastCellIndex = viewModel.length - 1;
          if (lastCellIndex >= 0) {
            const cell = viewModel.viewCells[lastCellIndex];
            notebookWidget.focusNotebookCell(cell, "container");
          }
        }, 0);
      } else if (navigateToCell === "input") {
        this._codeEditorWidget.focus();
      }
    }
  }
  setOptions(options) {
    this._notebookWidget.value?.setOptions(options);
    super.setOptions(options);
  }
  _toEditorPaneSelectionChangeReason(e) {
    switch (e.source) {
      case TextEditorSelectionSource.PROGRAMMATIC:
        return EditorPaneSelectionChangeReason.PROGRAMMATIC;
      case TextEditorSelectionSource.NAVIGATION:
        return EditorPaneSelectionChangeReason.NAVIGATION;
      case TextEditorSelectionSource.JUMP:
        return EditorPaneSelectionChangeReason.JUMP;
      default:
        return EditorPaneSelectionChangeReason.USER;
    }
  }
  _cellAtBottom(cell) {
    const visibleRanges = this._notebookWidget.value?.visibleRanges || [];
    const cellIndex = this._notebookWidget.value?.getCellIndex(cell);
    if (cellIndex === Math.max(...visibleRanges.map((range) => range.end - 1))) {
      return true;
    }
    return false;
  }
  _scrollIfNecessary(cvm) {
    const index = this._notebookWidget.value.getCellIndex(cvm);
    if (index === this._notebookWidget.value.getLength() - 1) {
      if (this._configurationService.getValue(ReplEditorSettings.interactiveWindowAlwaysScrollOnNewCell) || this._cellAtBottom(cvm)) {
        this._notebookWidget.value.scrollToBottom();
      }
    }
  }
  _syncWithKernel() {
    const notebook = this._notebookWidget.value?.textModel;
    const textModel = this._codeEditorWidget.getModel();
    if (notebook && textModel) {
      const info = this._notebookKernelService.getMatchingKernel(notebook);
      const selectedOrSuggested = info.selected ?? (info.suggestions.length === 1 ? info.suggestions[0] : void 0) ?? (info.all.length === 1 ? info.all[0] : void 0);
      if (selectedOrSuggested) {
        const language = selectedOrSuggested.supportedLanguages[0];
        if (language && language !== "plaintext") {
          const newMode = this._languageService.createById(language).languageId;
          textModel.setLanguage(newMode);
        }
        NOTEBOOK_KERNEL.bindTo(this._contextKeyService).set(selectedOrSuggested.id);
      }
    }
  }
  layout(dimension, position) {
    this._rootElement.classList.toggle("mid-width", dimension.width < 1e3 && dimension.width >= 600);
    this._rootElement.classList.toggle("narrow-width", dimension.width < 600);
    const editorHeightChanged = dimension.height !== this._lastLayoutDimensions?.dimension.height;
    this._lastLayoutDimensions = { dimension, position };
    if (!this._notebookWidget.value) {
      return;
    }
    if (editorHeightChanged && this._codeEditorWidget) {
      SuggestController.get(this._codeEditorWidget)?.cancelSuggestWidget();
    }
    this._notebookEditorContainer.style.height = `${this._lastLayoutDimensions.dimension.height - this.inputCellContainerHeight}px`;
    this._layoutWidgets(dimension, position);
  }
  _layoutWidgets(dimension, position) {
    const contentHeight = this._codeEditorWidget.hasModel() ? this._codeEditorWidget.getContentHeight() : this.inputCellEditorHeight;
    const maxHeight = Math.min(dimension.height / 2, contentHeight);
    const leftMargin = this._notebookOptions.getCellEditorContainerLeftMargin();
    const inputCellContainerHeight = maxHeight + INPUT_CELL_VERTICAL_PADDING * 2;
    this._notebookEditorContainer.style.height = `${dimension.height - inputCellContainerHeight}px`;
    this._notebookWidget.value.layout(dimension.with(dimension.width, dimension.height - inputCellContainerHeight), this._notebookEditorContainer, position);
    this._codeEditorWidget.layout(this._validateDimension(dimension.width - leftMargin - INPUT_CELL_HORIZONTAL_PADDING_RIGHT, maxHeight));
    this._inputFocusIndicator.style.height = `${contentHeight}px`;
    this._inputCellContainer.style.top = `${dimension.height - inputCellContainerHeight}px`;
    this._inputCellContainer.style.width = `${dimension.width}px`;
  }
  _validateDimension(width, height) {
    return new DOM.Dimension(Math.max(0, width), Math.max(0, height));
  }
  _hasConflictingDecoration() {
    return Boolean(this._codeEditorWidget.getLineDecorations(1)?.find(
      (d) => d.options.beforeContentClassName || d.options.afterContentClassName || d.options.before?.content || d.options.after?.content
    ));
  }
  _updateInputHint() {
    if (!this._codeEditorWidget) {
      return;
    }
    const shouldHide = !this._codeEditorWidget.hasModel() || this._configurationService.getValue(ReplEditorSettings.showExecutionHint) === false || this._codeEditorWidget.getModel().getValueLength() !== 0 || this._hasConflictingDecoration();
    if (!this._hintElement && !shouldHide) {
      this._hintElement = this._instantiationService.createInstance(ReplInputHintContentWidget, this._codeEditorWidget);
    } else if (this._hintElement && shouldHide) {
      this._hintElement.dispose();
      this._hintElement = void 0;
    }
  }
  getScrollPosition() {
    return {
      scrollTop: this._notebookWidget.value?.scrollTop ?? 0,
      scrollLeft: 0
    };
  }
  setScrollPosition(position) {
    this._notebookWidget.value?.setScrollTop(position.scrollTop);
  }
  focus() {
    super.focus();
    this._notebookWidget.value?.onShow();
    this._codeEditorWidget.focus();
  }
  focusHistory() {
    this._notebookWidget.value.focus();
  }
  setEditorVisible(visible) {
    super.setEditorVisible(visible);
    this._groupListener.value = this.group.onWillCloseEditor((e) => this._saveEditorViewState(e.editor));
    if (!visible) {
      this._saveEditorViewState(this.input);
      if (this.input && this._notebookWidget.value) {
        this._notebookWidget.value.onWillHide();
      }
    }
    this._updateInputHint();
  }
  clearInput() {
    if (this._notebookWidget.value) {
      this._saveEditorViewState(this.input);
      this._notebookWidget.value.onWillHide();
    }
    this._codeEditorWidget?.dispose();
    this._notebookWidget = { value: void 0 };
    this._widgetDisposableStore.clear();
    super.clearInput();
  }
  getControl() {
    return {
      notebookEditor: this._notebookWidget.value,
      activeCodeEditor: this.getActiveCodeEditor(),
      onDidChangeActiveEditor: Event.None
    };
  }
  getActiveCodeEditor() {
    if (!this._codeEditorWidget) {
      return void 0;
    }
    return this._codeEditorWidget.hasWidgetFocus() || !this._notebookWidget.value?.activeCodeEditor ? this._codeEditorWidget : this._notebookWidget.value.activeCodeEditor;
  }
};
ReplEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, INotebookEditorService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, INotebookKernelService),
  __decorateParam(8, ILanguageService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IMenuService),
  __decorateParam(12, IContextMenuService),
  __decorateParam(13, IEditorGroupsService),
  __decorateParam(14, ITextResourceConfigurationService),
  __decorateParam(15, INotebookExecutionStateService),
  __decorateParam(16, IExtensionService),
  __decorateParam(17, IAccessibilityService)
], ReplEditor);
function isReplEditorControl(control) {
  const candidate = control;
  return candidate?.activeCodeEditor instanceof CodeEditorWidget && candidate?.notebookEditor instanceof NotebookEditorWidget;
}
export {
  ReplEditor,
  isReplEditorControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3JlcGxOb3RlYm9vay9icm93c2VyL3JlcGxFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvaW50ZXJhY3RpdmUuY3NzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGRvbVN0eWxlc2hlZXRzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JWaWV3U3RhdGUsIElDb21wb3NpdGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFuZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLCBJRWRpdG9yTWVtZW50bywgSUVkaXRvck9wZW5Db250ZXh0LCBJRWRpdG9yUGFuZVNjcm9sbFBvc2l0aW9uLCBJRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZUV2ZW50LCBJRWRpdG9yUGFuZVdpdGhTY3JvbGxpbmcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGdldFNpbXBsZUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvc2ltcGxlRWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2VsbFZpZXdNb2RlbCwgSU5vdGVib29rRWRpdG9yT3B0aW9ucywgSU5vdGVib29rRWRpdG9yVmlld1N0YXRlLCBJTm90ZWJvb2tWaWV3Q2VsbHNVcGRhdGVFdmVudCB9IGZyb20gJy4uLy4uL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUJvcnJvd1ZhbHVlLCBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9zZXJ2aWNlcy9ub3RlYm9va0VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdE5vdGVib29rQ3JlYXRpb25PcHRpb25zLCBOb3RlYm9va0VkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgR3JvdXBzT3JkZXIsIElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXhlY3V0aW9uU3RhdGVDZWxsU3RhdHVzQmFyQ29udHJpYiwgVGltZXJDZWxsU3RhdHVzQmFyQ29udHJpYiB9IGZyb20gJy4uLy4uL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9jZWxsU3RhdHVzQmFyL2V4ZWN1dGlvblN0YXR1c0Jhckl0ZW1Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0tlcm5lbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBSZXBsRWRpdG9yU2V0dGluZ3MsIElOVEVSQUNUSVZFX0lOUFVUX0NVUlNPUl9CT1VOREFSWSB9IGZyb20gJy4uLy4uL2ludGVyYWN0aXZlL2Jyb3dzZXIvaW50ZXJhY3RpdmVDb21tb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va09wdGlvbnMgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Rvb2xiYXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb25WaWV3SXRlbSwgZ2V0QWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbkNsaXBib2FyZENvbnRyaWJ1dGlvbklEIH0gZnJvbSAnLi4vLi4vY29kZUVkaXRvci9icm93c2VyL3NlbGVjdGlvbkNsaXBib2FyZC5qcyc7XG5pbXBvcnQgeyBDb250ZXh0TWVudUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb250ZXh0bWVudS9icm93c2VyL2NvbnRleHRtZW51LmpzJztcbmltcG9ydCB7IFN1Z2dlc3RDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3RDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IE1hcmtlckNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9nb3RvRXJyb3IvYnJvd3Nlci9nb3RvRXJyb3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvck9wdGlvbnMsIFRleHRFZGl0b3JTZWxlY3Rpb25Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsIE5vdGVib29rRXhlY3V0aW9uVHlwZSB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19LRVJORUwgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ3Vyc29yUG9zaXRpb25DaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2N1cnNvckV2ZW50cy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0ZpbmRDb250cmliIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9jb250cmliL2ZpbmQvbm90ZWJvb2tGaW5kV2lkZ2V0LmpzJztcbmltcG9ydCB7IFJFUExfRURJVE9SX0lEIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCAnLi9pbnRlcmFjdGl2ZUVkaXRvci5jc3MnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IGRlZXBDbG9uZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgR2x5cGhIb3ZlckNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9ob3Zlci9icm93c2VyL2dseXBoSG92ZXJDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IENvbnRlbnRIb3ZlckNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9ob3Zlci9icm93c2VyL2NvbnRlbnRIb3ZlckNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgUmVwbEVkaXRvcklucHV0IH0gZnJvbSAnLi9yZXBsRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgUmVwbElucHV0SGludENvbnRlbnRXaWRnZXQgfSBmcm9tICcuLi8uLi9pbnRlcmFjdGl2ZS9icm93c2VyL3JlcGxJbnB1dEhpbnRDb250ZW50V2lkZ2V0LmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE5vdGVib29rVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci92aWV3TW9kZWwvbm90ZWJvb2tWaWV3TW9kZWxJbXBsLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuXG5jb25zdCBJTlRFUkFDVElWRV9FRElUT1JfVklFV19TVEFURV9QUkVGRVJFTkNFX0tFWSA9ICdJbnRlcmFjdGl2ZUVkaXRvclZpZXdTdGF0ZSc7XG5cbmNvbnN0IElOUFVUX0NFTExfVkVSVElDQUxfUEFERElORyA9IDg7XG5jb25zdCBJTlBVVF9DRUxMX0hPUklaT05UQUxfUEFERElOR19SSUdIVCA9IDEwO1xuY29uc3QgSU5QVVRfRURJVE9SX1BBRERJTkcgPSA4O1xuXG5leHBvcnQgaW50ZXJmYWNlIEludGVyYWN0aXZlRWRpdG9yVmlld1N0YXRlIHtcblx0cmVhZG9ubHkgbm90ZWJvb2s/OiBJTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGU7XG5cdHJlYWRvbmx5IGlucHV0PzogSUNvZGVFZGl0b3JWaWV3U3RhdGUgfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEludGVyYWN0aXZlRWRpdG9yT3B0aW9ucyBleHRlbmRzIElUZXh0RWRpdG9yT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHZpZXdTdGF0ZT86IEludGVyYWN0aXZlRWRpdG9yVmlld1N0YXRlO1xufVxuXG5leHBvcnQgY2xhc3MgUmVwbEVkaXRvciBleHRlbmRzIEVkaXRvclBhbmUgaW1wbGVtZW50cyBJRWRpdG9yUGFuZVdpdGhTY3JvbGxpbmcge1xuXHRwcml2YXRlIF9yb290RWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9zdHlsZUVsZW1lbnQhOiBIVE1MU3R5bGVFbGVtZW50O1xuXHRwcml2YXRlIF9ub3RlYm9va0VkaXRvckNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9ub3RlYm9va1dpZGdldDogSUJvcnJvd1ZhbHVlPE5vdGVib29rRWRpdG9yV2lkZ2V0PiA9IHsgdmFsdWU6IHVuZGVmaW5lZCB9O1xuXHRwcml2YXRlIF9pbnB1dENlbGxDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfaW5wdXRGb2N1c0luZGljYXRvciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9pbnB1dFJ1bkJ1dHRvbkNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9pbnB1dEVkaXRvckNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9jb2RlRWRpdG9yV2lkZ2V0ITogQ29kZUVkaXRvcldpZGdldDtcblx0cHJpdmF0ZSBfbm90ZWJvb2tXaWRnZXRTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlO1xuXHRwcml2YXRlIF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRwcml2YXRlIF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2U7XG5cdHByaXZhdGUgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdHByaXZhdGUgX25vdGVib29rS2VybmVsU2VydmljZTogSU5vdGVib29rS2VybmVsU2VydmljZTtcblx0cHJpdmF0ZSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZTtcblx0cHJpdmF0ZSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZTtcblx0cHJpdmF0ZSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlO1xuXHRwcml2YXRlIF9lZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlO1xuXHRwcml2YXRlIF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfd2lkZ2V0RGlzcG9zYWJsZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9sYXN0TGF5b3V0RGltZW5zaW9ucz86IHsgcmVhZG9ubHkgZGltZW5zaW9uOiBET00uRGltZW5zaW9uOyByZWFkb25seSBwb3NpdGlvbjogRE9NLklEb21Qb3NpdGlvbiB9O1xuXHRwcml2YXRlIF9lZGl0b3JPcHRpb25zOiBJRWRpdG9yT3B0aW9ucztcblx0cHJpdmF0ZSBfbm90ZWJvb2tPcHRpb25zOiBOb3RlYm9va09wdGlvbnM7XG5cdHByaXZhdGUgX2VkaXRvck1lbWVudG86IElFZGl0b3JNZW1lbnRvPEludGVyYWN0aXZlRWRpdG9yVmlld1N0YXRlPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZ3JvdXBMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBfcnVuYnV0dG9uVG9vbGJhcjogVG9vbEJhciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaGludEVsZW1lbnQ6IFJlcGxJbnB1dEhpbnRDb250ZW50V2lkZ2V0IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX29uRGlkRm9jdXNXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0b3ZlcnJpZGUgZ2V0IG9uRGlkRm9jdXMoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25EaWRGb2N1c1dpZGdldC5ldmVudDsgfVxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmV2ZW50O1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZVNjcm9sbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNjcm9sbCA9IHRoaXMuX29uRGlkQ2hhbmdlU2Nyb2xsLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIG5vdGVib29rV2lkZ2V0U2VydmljZTogSU5vdGVib29rRWRpdG9yU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0tlcm5lbFNlcnZpY2Ugbm90ZWJvb2tLZXJuZWxTZXJ2aWNlOiBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2Ugbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0UkVQTF9FRElUT1JfSUQsXG5cdFx0XHRncm91cCxcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHR0aGVtZVNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZVxuXHRcdCk7XG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXRTZXJ2aWNlID0gbm90ZWJvb2tXaWRnZXRTZXJ2aWNlO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0dGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlID0gbm90ZWJvb2tLZXJuZWxTZXJ2aWNlO1xuXHRcdHRoaXMuX2xhbmd1YWdlU2VydmljZSA9IGxhbmd1YWdlU2VydmljZTtcblx0XHR0aGlzLl9rZXliaW5kaW5nU2VydmljZSA9IGtleWJpbmRpbmdTZXJ2aWNlO1xuXHRcdHRoaXMuX21lbnVTZXJ2aWNlID0gbWVudVNlcnZpY2U7XG5cdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlID0gY29udGV4dE1lbnVTZXJ2aWNlO1xuXHRcdHRoaXMuX2VkaXRvckdyb3VwU2VydmljZSA9IGVkaXRvckdyb3VwU2VydmljZTtcblx0XHR0aGlzLl9leHRlbnNpb25TZXJ2aWNlID0gZXh0ZW5zaW9uU2VydmljZTtcblxuXHRcdHRoaXMuX3Jvb3RFbGVtZW50ID0gRE9NLiQoJy5pbnRlcmFjdGl2ZS1lZGl0b3InKTtcblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLl9yb290RWxlbWVudCkpO1xuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleSgnaXNDb21wb3NpdGVOb3RlYm9vaycsIHRydWUpO1xuXHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblxuXHRcdHRoaXMuX2VkaXRvck9wdGlvbnMgPSB0aGlzLl9jb21wdXRlRWRpdG9yT3B0aW9ucygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3InKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdub3RlYm9vaycpKSB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvck9wdGlvbnMgPSB0aGlzLl9jb21wdXRlRWRpdG9yT3B0aW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9ub3RlYm9va09wdGlvbnMgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va09wdGlvbnMsIHRoaXMud2luZG93LCB0cnVlLCB7IGNlbGxUb29sYmFySW50ZXJhY3Rpb246ICdob3ZlcicsIGdsb2JhbFRvb2xiYXI6IHRydWUsIHN0aWNreVNjcm9sbEVuYWJsZWQ6IGZhbHNlLCBkcmFnQW5kRHJvcEVuYWJsZWQ6IGZhbHNlLCBkaXNhYmxlUnVsZXJzOiB0cnVlIH0pO1xuXHRcdHRoaXMuX2VkaXRvck1lbWVudG8gPSB0aGlzLmdldEVkaXRvck1lbWVudG88SW50ZXJhY3RpdmVFZGl0b3JWaWV3U3RhdGU+KGVkaXRvckdyb3VwU2VydmljZSwgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsIElOVEVSQUNUSVZFX0VESVRPUl9WSUVXX1NUQVRFX1BSRUZFUkVOQ0VfS0VZKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLm9uRGlkVXBkYXRlS2V5YmluZGluZ3ModGhpcy5fdXBkYXRlSW5wdXRIaW50LCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2Uub25EaWRDaGFuZ2VFeGVjdXRpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLnR5cGUgPT09IE5vdGVib29rRXhlY3V0aW9uVHlwZS5jZWxsICYmIGlzRXF1YWwoZS5ub3RlYm9vaywgdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/LnZpZXdNb2RlbD8ubm90ZWJvb2tEb2N1bWVudC51cmkpKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8uZ2V0Q2VsbEJ5SGFuZGxlKGUuY2VsbEhhbmRsZSk7XG5cdFx0XHRcdGlmIChjZWxsICYmIGUuY2hhbmdlZD8uc3RhdGUpIHtcblx0XHRcdFx0XHR0aGlzLl9zY3JvbGxJZk5lY2Vzc2FyeShjZWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGlucHV0Q2VsbENvbnRhaW5lckhlaWdodCgpIHtcblx0XHRyZXR1cm4gMTkgKyAyICsgSU5QVVRfQ0VMTF9WRVJUSUNBTF9QQURESU5HICogMiArIElOUFVUX0VESVRPUl9QQURESU5HICogMjtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGlucHV0Q2VsbEVkaXRvckhlaWdodCgpIHtcblx0XHRyZXR1cm4gMTkgKyBJTlBVVF9FRElUT1JfUEFERElORyAqIDI7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRET00uYXBwZW5kKHBhcmVudCwgdGhpcy5fcm9vdEVsZW1lbnQpO1xuXHRcdHRoaXMuX3Jvb3RFbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblx0XHR0aGlzLl9ub3RlYm9va0VkaXRvckNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5fcm9vdEVsZW1lbnQsIERPTS4kKCcubm90ZWJvb2stZWRpdG9yLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLl9pbnB1dENlbGxDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuX3Jvb3RFbGVtZW50LCBET00uJCgnLmlucHV0LWNlbGwtY29udGFpbmVyJykpO1xuXHRcdHRoaXMuX2lucHV0Q2VsbENvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0dGhpcy5faW5wdXRDZWxsQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3RoaXMuaW5wdXRDZWxsQ29udGFpbmVySGVpZ2h0fXB4YDtcblx0XHR0aGlzLl9pbnB1dEZvY3VzSW5kaWNhdG9yID0gRE9NLmFwcGVuZCh0aGlzLl9pbnB1dENlbGxDb250YWluZXIsIERPTS4kKCcuaW5wdXQtZm9jdXMtaW5kaWNhdG9yJykpO1xuXHRcdHRoaXMuX2lucHV0UnVuQnV0dG9uQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLl9pbnB1dENlbGxDb250YWluZXIsIERPTS4kKCcucnVuLWJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0dGhpcy5fc2V0dXBSdW5CdXR0b25Ub29sYmFyKHRoaXMuX2lucHV0UnVuQnV0dG9uQ29udGFpbmVyKTtcblx0XHR0aGlzLl9pbnB1dEVkaXRvckNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5faW5wdXRDZWxsQ29udGFpbmVyLCBET00uJCgnLmlucHV0LWVkaXRvci1jb250YWluZXInKSk7XG5cdFx0dGhpcy5fY3JlYXRlTGF5b3V0U3R5bGVzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXR1cFJ1bkJ1dHRvblRvb2xiYXIocnVuQnV0dG9uQ29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5SZXBsSW5wdXRFeGVjdXRlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdHRoaXMuX3J1bmJ1dHRvblRvb2xiYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVG9vbEJhcihydW5CdXR0b25Db250YWluZXIsIHRoaXMuX2NvbnRleHRNZW51U2VydmljZSwge1xuXHRcdFx0Z2V0S2V5QmluZGluZzogYWN0aW9uID0+IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZUFjdGlvblZpZXdJdGVtKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHRcdHJlbmRlckRyb3Bkb3duQXNDaGlsZEVsZW1lbnQ6IHRydWVcblx0XHR9KSk7XG5cblx0XHRjb25zdCB7IHByaW1hcnksIHNlY29uZGFyeSB9ID0gZ2V0QWN0aW9uQmFyQWN0aW9ucyhtZW51LmdldEFjdGlvbnMoeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KSk7XG5cdFx0dGhpcy5fcnVuYnV0dG9uVG9vbGJhci5zZXRBY3Rpb25zKFsuLi5wcmltYXJ5LCAuLi5zZWNvbmRhcnldKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUxheW91dFN0eWxlcygpOiB2b2lkIHtcblx0XHR0aGlzLl9zdHlsZUVsZW1lbnQgPSBkb21TdHlsZXNoZWV0cy5jcmVhdGVTdHlsZVNoZWV0KHRoaXMuX3Jvb3RFbGVtZW50KTtcblx0XHRjb25zdCBzdHlsZVNoZWV0czogc3RyaW5nW10gPSBbXTtcblxuXHRcdGNvbnN0IHtcblx0XHRcdGNvZGVDZWxsTGVmdE1hcmdpbixcblx0XHRcdGNlbGxSdW5HdXR0ZXJcblx0XHR9ID0gdGhpcy5fbm90ZWJvb2tPcHRpb25zLmdldExheW91dENvbmZpZ3VyYXRpb24oKTtcblx0XHRjb25zdCB7XG5cdFx0XHRmb2N1c0luZGljYXRvclxuXHRcdH0gPSB0aGlzLl9ub3RlYm9va09wdGlvbnMuZ2V0RGlzcGxheU9wdGlvbnMoKTtcblx0XHRjb25zdCBsZWZ0TWFyZ2luID0gdGhpcy5fbm90ZWJvb2tPcHRpb25zLmdldENlbGxFZGl0b3JDb250YWluZXJMZWZ0TWFyZ2luKCk7XG5cblx0XHRzdHlsZVNoZWV0cy5wdXNoKGBcblx0XHRcdC5pbnRlcmFjdGl2ZS1lZGl0b3IgLmlucHV0LWNlbGwtY29udGFpbmVyIHtcblx0XHRcdFx0cGFkZGluZzogJHtJTlBVVF9DRUxMX1ZFUlRJQ0FMX1BBRERJTkd9cHggJHtJTlBVVF9DRUxMX0hPUklaT05UQUxfUEFERElOR19SSUdIVH1weCAke0lOUFVUX0NFTExfVkVSVElDQUxfUEFERElOR31weCAke2xlZnRNYXJnaW59cHg7XG5cdFx0XHR9XG5cdFx0YCk7XG5cdFx0aWYgKGZvY3VzSW5kaWNhdG9yID09PSAnZ3V0dGVyJykge1xuXHRcdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0XHRcdC5pbnRlcmFjdGl2ZS1lZGl0b3IgLmlucHV0LWNlbGwtY29udGFpbmVyOmZvY3VzLXdpdGhpbiAuaW5wdXQtZm9jdXMtaW5kaWNhdG9yOjpiZWZvcmUge1xuXHRcdFx0XHRcdGJvcmRlci1jb2xvcjogdmFyKC0tdnNjb2RlLW5vdGVib29rLWZvY3VzZWRDZWxsQm9yZGVyKSAhaW1wb3J0YW50O1xuXHRcdFx0XHR9XG5cdFx0XHRcdC5pbnRlcmFjdGl2ZS1lZGl0b3IgLmlucHV0LWZvY3VzLWluZGljYXRvcjo6YmVmb3JlIHtcblx0XHRcdFx0XHRib3JkZXItY29sb3I6IHZhcigtLXZzY29kZS1ub3RlYm9vay1pbmFjdGl2ZUZvY3VzZWRDZWxsQm9yZGVyKSAhaW1wb3J0YW50O1xuXHRcdFx0XHR9XG5cdFx0XHRcdC5pbnRlcmFjdGl2ZS1lZGl0b3IgLmlucHV0LWNlbGwtY29udGFpbmVyIC5pbnB1dC1mb2N1cy1pbmRpY2F0b3Ige1xuXHRcdFx0XHRcdGRpc3BsYXk6IGJsb2NrO1xuXHRcdFx0XHRcdHRvcDogJHtJTlBVVF9DRUxMX1ZFUlRJQ0FMX1BBRERJTkd9cHg7XG5cdFx0XHRcdH1cblx0XHRcdFx0LmludGVyYWN0aXZlLWVkaXRvciAuaW5wdXQtY2VsbC1jb250YWluZXIge1xuXHRcdFx0XHRcdGJvcmRlci10b3A6IDFweCBzb2xpZCB2YXIoLS12c2NvZGUtbm90ZWJvb2staW5hY3RpdmVGb2N1c2VkQ2VsbEJvcmRlcik7XG5cdFx0XHRcdH1cblx0XHRcdGApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBib3JkZXJcblx0XHRcdHN0eWxlU2hlZXRzLnB1c2goYFxuXHRcdFx0XHQuaW50ZXJhY3RpdmUtZWRpdG9yIC5pbnB1dC1jZWxsLWNvbnRhaW5lciB7XG5cdFx0XHRcdFx0Ym9yZGVyLXRvcDogMXB4IHNvbGlkIHZhcigtLXZzY29kZS1ub3RlYm9vay1pbmFjdGl2ZUZvY3VzZWRDZWxsQm9yZGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQuaW50ZXJhY3RpdmUtZWRpdG9yIC5pbnB1dC1jZWxsLWNvbnRhaW5lciAuaW5wdXQtZm9jdXMtaW5kaWNhdG9yIHtcblx0XHRcdFx0XHRkaXNwbGF5OiBub25lO1xuXHRcdFx0XHR9XG5cdFx0XHRgKTtcblx0XHR9XG5cblx0XHRzdHlsZVNoZWV0cy5wdXNoKGBcblx0XHRcdC5pbnRlcmFjdGl2ZS1lZGl0b3IgLmlucHV0LWNlbGwtY29udGFpbmVyIC5ydW4tYnV0dG9uLWNvbnRhaW5lciB7XG5cdFx0XHRcdHdpZHRoOiAke2NlbGxSdW5HdXR0ZXJ9cHg7XG5cdFx0XHRcdGxlZnQ6ICR7Y29kZUNlbGxMZWZ0TWFyZ2lufXB4O1xuXHRcdFx0XHRtYXJnaW4tdG9wOiAke0lOUFVUX0VESVRPUl9QQURESU5HIC0gMn1weDtcblx0XHRcdH1cblx0XHRgKTtcblxuXHRcdHRoaXMuX3N0eWxlRWxlbWVudC50ZXh0Q29udGVudCA9IHN0eWxlU2hlZXRzLmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZUVkaXRvck9wdGlvbnMoKTogSUVkaXRvck9wdGlvbnMge1xuXHRcdGxldCBvdmVycmlkZUlkZW50aWZpZXI6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5fY29kZUVkaXRvcldpZGdldCkge1xuXHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyID0gdGhpcy5fY29kZUVkaXRvcldpZGdldC5nZXRNb2RlbCgpPy5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGVkaXRvck9wdGlvbnMgPSBkZWVwQ2xvbmUodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUVkaXRvck9wdGlvbnM+KCdlZGl0b3InLCB7IG92ZXJyaWRlSWRlbnRpZmllciB9KSk7XG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9uc092ZXJyaWRlID0gZ2V0U2ltcGxlRWRpdG9yT3B0aW9ucyh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgY29tcHV0ZWQgPSBPYmplY3QuZnJlZXplKHtcblx0XHRcdC4uLmVkaXRvck9wdGlvbnMsXG5cdFx0XHQuLi5lZGl0b3JPcHRpb25zT3ZlcnJpZGUsXG5cdFx0XHQuLi57XG5cdFx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ3JlcGxFZGl0b3JJbnB1dCcsIFwiUkVQTCBJbnB1dFwiKSxcblx0XHRcdFx0Z2x5cGhNYXJnaW46IHRydWUsXG5cdFx0XHRcdHBhZGRpbmc6IHtcblx0XHRcdFx0XHR0b3A6IElOUFVUX0VESVRPUl9QQURESU5HLFxuXHRcdFx0XHRcdGJvdHRvbTogSU5QVVRfRURJVE9SX1BBRERJTkdcblx0XHRcdFx0fSxcblx0XHRcdFx0aG92ZXI6IHtcblx0XHRcdFx0XHRlbmFibGVkOiAnb24nIGFzIGNvbnN0XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJ1bGVyczogW11cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiBjb21wdXRlZDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2F2ZUVkaXRvclZpZXdTdGF0ZSh0aGlzLmlucHV0KTtcblx0XHRzdXBlci5zYXZlU3RhdGUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFZpZXdTdGF0ZSgpOiBJbnRlcmFjdGl2ZUVkaXRvclZpZXdTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaW5wdXQgPSB0aGlzLmlucHV0O1xuXHRcdGlmICghKGlucHV0IGluc3RhbmNlb2YgUmVwbEVkaXRvcklucHV0KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLl9zYXZlRWRpdG9yVmlld1N0YXRlKGlucHV0KTtcblx0XHRyZXR1cm4gdGhpcy5fbG9hZE5vdGVib29rRWRpdG9yVmlld1N0YXRlKGlucHV0KTtcblx0fVxuXG5cdHByaXZhdGUgX3NhdmVFZGl0b3JWaWV3U3RhdGUoaW5wdXQ6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlICYmIGlucHV0IGluc3RhbmNlb2YgUmVwbEVkaXRvcklucHV0KSB7XG5cdFx0XHRpZiAodGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUuZ2V0RWRpdG9yVmlld1N0YXRlKCk7XG5cdFx0XHRjb25zdCBlZGl0b3JTdGF0ZSA9IHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuc2F2ZVZpZXdTdGF0ZSgpO1xuXHRcdFx0dGhpcy5fZWRpdG9yTWVtZW50by5zYXZlRWRpdG9yU3RhdGUodGhpcy5ncm91cCwgaW5wdXQucmVzb3VyY2UsIHtcblx0XHRcdFx0bm90ZWJvb2s6IHN0YXRlLFxuXHRcdFx0XHRpbnB1dDogZWRpdG9yU3RhdGVcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xvYWROb3RlYm9va0VkaXRvclZpZXdTdGF0ZShpbnB1dDogUmVwbEVkaXRvcklucHV0KTogSW50ZXJhY3RpdmVFZGl0b3JWaWV3U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2VkaXRvck1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRoaXMuZ3JvdXAsIGlucHV0LnJlc291cmNlKTtcblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHQvLyB3aGVuIHdlIGRvbid0IGhhdmUgYSB2aWV3IHN0YXRlIGZvciB0aGUgZ3JvdXAvaW5wdXQtdHVwbGUgdGhlbiB3ZSB0cnkgdG8gdXNlIGFuIGV4aXN0aW5nXG5cdFx0Ly8gZWRpdG9yIGZvciB0aGUgc2FtZSByZXNvdXJjZS5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuX2VkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpKSB7XG5cdFx0XHRpZiAoZ3JvdXAuYWN0aXZlRWRpdG9yUGFuZSAhPT0gdGhpcyAmJiBncm91cC5hY3RpdmVFZGl0b3JQYW5lID09PSB0aGlzICYmIGdyb3VwLmFjdGl2ZUVkaXRvcj8ubWF0Y2hlcyhpbnB1dCkpIHtcblx0XHRcdFx0Y29uc3Qgbm90ZWJvb2sgPSB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8uZ2V0RWRpdG9yVmlld1N0YXRlKCk7XG5cdFx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy5fY29kZUVkaXRvcldpZGdldC5zYXZlVmlld1N0YXRlKCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bm90ZWJvb2ssXG5cdFx0XHRcdFx0aW5wdXRcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQoaW5wdXQ6IFJlcGxFZGl0b3JJbnB1dCwgb3B0aW9uczogSW50ZXJhY3RpdmVFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIHRoZXJlIGN1cnJlbnRseSBpcyBhIHdpZGdldCB3aGljaCB3ZSBzdGlsbCBvd24gc29cblx0XHQvLyB3ZSBuZWVkIHRvIGhpZGUgaXQgYmVmb3JlIGdldHRpbmcgYSBuZXcgd2lkZ2V0XG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/Lm9uV2lsbEhpZGUoKTtcblxuXHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQ/LmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5jbGVhcigpO1xuXG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQgPSA8SUJvcnJvd1ZhbHVlPE5vdGVib29rRWRpdG9yV2lkZ2V0Pj50aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbih0aGlzLl9ub3RlYm9va1dpZGdldFNlcnZpY2UucmV0cmlldmVXaWRnZXQsIHRoaXMuZ3JvdXAuaWQsIGlucHV0LCB7XG5cdFx0XHRpc1JlcGxIaXN0b3J5OiB0cnVlLFxuXHRcdFx0aXNSZWFkT25seTogdHJ1ZSxcblx0XHRcdGNvbnRyaWJ1dGlvbnM6IE5vdGVib29rRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldFNvbWVFZGl0b3JDb250cmlidXRpb25zKFtcblx0XHRcdFx0RXhlY3V0aW9uU3RhdGVDZWxsU3RhdHVzQmFyQ29udHJpYi5pZCxcblx0XHRcdFx0VGltZXJDZWxsU3RhdHVzQmFyQ29udHJpYi5pZCxcblx0XHRcdFx0Tm90ZWJvb2tGaW5kQ29udHJpYi5pZFxuXHRcdFx0XSksXG5cdFx0XHRtZW51SWRzOiB7XG5cdFx0XHRcdG5vdGVib29rVG9vbGJhcjogTWVudUlkLkludGVyYWN0aXZlVG9vbGJhcixcblx0XHRcdFx0Y2VsbFRpdGxlVG9vbGJhcjogTWVudUlkLkludGVyYWN0aXZlQ2VsbFRpdGxlLFxuXHRcdFx0XHRjZWxsRGVsZXRlVG9vbGJhcjogTWVudUlkLkludGVyYWN0aXZlQ2VsbERlbGV0ZSxcblx0XHRcdFx0Y2VsbEluc2VydFRvb2xiYXI6IE1lbnVJZC5Ob3RlYm9va0NlbGxCZXR3ZWVuLFxuXHRcdFx0XHRjZWxsVG9wSW5zZXJ0VG9vbGJhcjogTWVudUlkLk5vdGVib29rQ2VsbExpc3RUb3AsXG5cdFx0XHRcdGNlbGxFeGVjdXRlVG9vbGJhcjogTWVudUlkLkludGVyYWN0aXZlQ2VsbEV4ZWN1dGUsXG5cdFx0XHRcdGNlbGxFeGVjdXRlUHJpbWFyeTogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdFx0Y2VsbEVkaXRvckNvbnRyaWJ1dGlvbnM6IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRTb21lRWRpdG9yQ29udHJpYnV0aW9ucyhbXG5cdFx0XHRcdFNlbGVjdGlvbkNsaXBib2FyZENvbnRyaWJ1dGlvbklELFxuXHRcdFx0XHRDb250ZXh0TWVudUNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdENvbnRlbnRIb3ZlckNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdEdseXBoSG92ZXJDb250cm9sbGVyLklELFxuXHRcdFx0XHRNYXJrZXJDb250cm9sbGVyLklEXG5cdFx0XHRdKSxcblx0XHRcdG9wdGlvbnM6IHRoaXMuX25vdGVib29rT3B0aW9ucyxcblx0XHRcdGNvZGVXaW5kb3c6IHRoaXMud2luZG93XG5cdFx0fSwgdW5kZWZpbmVkLCB0aGlzLndpbmRvdyk7XG5cblx0XHRjb25zdCBza2lwQ29udHJpYnV0aW9ucyA9IFtcblx0XHRcdCd3b3JrYmVuY2gubm90ZWJvb2suY2VsbFRvb2xiYXInLFxuXHRcdFx0J2VkaXRvci5jb250cmliLmlubGluZUNvbXBsZXRpb25zQ29udHJvbGxlcidcblx0XHRdO1xuXG5cdFx0Y29uc3QgaW5wdXRDb250cmlidXRpb25zID0gZ2V0RGVmYXVsdE5vdGVib29rQ3JlYXRpb25PcHRpb25zKCkuY2VsbEVkaXRvckNvbnRyaWJ1dGlvbnM/LmZpbHRlcihjID0+IHNraXBDb250cmlidXRpb25zLmluZGV4T2YoYy5pZCkgPT09IC0xKTtcblx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUVkaXRvcldpZGdldCwgdGhpcy5faW5wdXRFZGl0b3JDb250YWluZXIsIHRoaXMuX2VkaXRvck9wdGlvbnMsIHtcblx0XHRcdC4uLntcblx0XHRcdFx0aXNTaW1wbGVXaWRnZXQ6IGZhbHNlLFxuXHRcdFx0XHRjb250cmlidXRpb25zOiBpbnB1dENvbnRyaWJ1dGlvbnMsXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAodGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMpIHtcblx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3RoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLmRpbWVuc2lvbi5oZWlnaHQgLSB0aGlzLmlucHV0Q2VsbENvbnRhaW5lckhlaWdodH1weGA7XG5cdFx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSEubGF5b3V0KG5ldyBET00uRGltZW5zaW9uKHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLmRpbWVuc2lvbi53aWR0aCwgdGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMuZGltZW5zaW9uLmhlaWdodCAtIHRoaXMuaW5wdXRDZWxsQ29udGFpbmVySGVpZ2h0KSwgdGhpcy5fbm90ZWJvb2tFZGl0b3JDb250YWluZXIpO1xuXHRcdFx0Y29uc3QgbGVmdE1hcmdpbiA9IHRoaXMuX25vdGVib29rT3B0aW9ucy5nZXRDZWxsRWRpdG9yQ29udGFpbmVyTGVmdE1hcmdpbigpO1xuXHRcdFx0Y29uc3QgbWF4SGVpZ2h0ID0gTWF0aC5taW4odGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMuZGltZW5zaW9uLmhlaWdodCAvIDIsIHRoaXMuaW5wdXRDZWxsRWRpdG9ySGVpZ2h0KTtcblx0XHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQubGF5b3V0KHRoaXMuX3ZhbGlkYXRlRGltZW5zaW9uKHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLmRpbWVuc2lvbi53aWR0aCAtIGxlZnRNYXJnaW4gLSBJTlBVVF9DRUxMX0hPUklaT05UQUxfUEFERElOR19SSUdIVCwgbWF4SGVpZ2h0KSk7XG5cdFx0XHR0aGlzLl9pbnB1dEZvY3VzSW5kaWNhdG9yLnN0eWxlLmhlaWdodCA9IGAke3RoaXMuaW5wdXRDZWxsRWRpdG9ySGVpZ2h0fXB4YDtcblx0XHRcdHRoaXMuX2lucHV0Q2VsbENvbnRhaW5lci5zdHlsZS50b3AgPSBgJHt0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucy5kaW1lbnNpb24uaGVpZ2h0IC0gdGhpcy5pbnB1dENlbGxDb250YWluZXJIZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy5faW5wdXRDZWxsQ29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7dGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMuZGltZW5zaW9uLndpZHRofXB4YDtcblx0XHR9XG5cblx0XHRhd2FpdCBzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgaW5wdXQucmVzb2x2ZSgpO1xuXHRcdGlmICh0aGlzLl9ydW5idXR0b25Ub29sYmFyKSB7XG5cdFx0XHR0aGlzLl9ydW5idXR0b25Ub29sYmFyLmNvbnRleHQgPSBpbnB1dC5yZXNvdXJjZTtcblx0XHR9XG5cblx0XHRpZiAobW9kZWwgPT09IG51bGwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVGhlIFJFUEwgbW9kZWwgY291bGQgbm90IGJlIHJlc29sdmVkJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/LnNldFBhcmVudENvbnRleHRLZXlTZXJ2aWNlKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHZpZXdTdGF0ZSA9IG9wdGlvbnM/LnZpZXdTdGF0ZSA/PyB0aGlzLl9sb2FkTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUoaW5wdXQpO1xuXHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0YXdhaXQgdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUhLnNldE1vZGVsKG1vZGVsLm5vdGVib29rLCB2aWV3U3RhdGU/Lm5vdGVib29rLCB1bmRlZmluZWQsICdyZXBsJyk7XG5cdFx0bW9kZWwubm90ZWJvb2suc2V0Q2VsbENvbGxhcHNlRGVmYXVsdCh0aGlzLl9ub3RlYm9va09wdGlvbnMuZ2V0Q2VsbENvbGxhcHNlRGVmYXVsdCgpKTtcblx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSEuc2V0T3B0aW9ucyh7XG5cdFx0XHRpc1JlYWRPbmx5OiB0cnVlXG5cdFx0fSk7XG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSEub25EaWRSZXNpemVPdXRwdXQoKGN2bSkgPT4ge1xuXHRcdFx0dGhpcy5fc2Nyb2xsSWZOZWNlc3NhcnkoY3ZtKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSEub25EaWRGb2N1c1dpZGdldCgoKSA9PiB0aGlzLl9vbkRpZEZvY3VzV2lkZ2V0LmZpcmUoKSkpO1xuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fbm90ZWJvb2tPcHRpb25zLm9uRGlkQ2hhbmdlT3B0aW9ucyhlID0+IHtcblx0XHRcdGlmIChlLmNvbXBhY3RWaWV3IHx8IGUuZm9jdXNJbmRpY2F0b3IpIHtcblx0XHRcdFx0Ly8gdXBkYXRlIHRoZSBzdHlsaW5nXG5cdFx0XHRcdHRoaXMuX3N0eWxlRWxlbWVudD8ucmVtb3ZlKCk7XG5cdFx0XHRcdHRoaXMuX2NyZWF0ZUxheW91dFN0eWxlcygpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMgJiYgdGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucy5kaW1lbnNpb24sIHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLnBvc2l0aW9uKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuaW50ZXJhY3RpdmVXaW5kb3dDb2xsYXBzZUNvZGVDZWxscykge1xuXHRcdFx0XHRtb2RlbC5ub3RlYm9vay5zZXRDZWxsQ29sbGFwc2VEZWZhdWx0KHRoaXMuX25vdGVib29rT3B0aW9ucy5nZXRDZWxsQ29sbGFwc2VEZWZhdWx0KCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGVkaXRvck1vZGVsID0gYXdhaXQgaW5wdXQucmVzb2x2ZUlucHV0KG1vZGVsLm5vdGVib29rKTtcblx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LnNldE1vZGVsKGVkaXRvck1vZGVsKTtcblx0XHRpZiAodmlld1N0YXRlPy5pbnB1dCkge1xuXHRcdFx0dGhpcy5fY29kZUVkaXRvcldpZGdldC5yZXN0b3JlVmlld1N0YXRlKHZpZXdTdGF0ZS5pbnB1dCk7XG5cdFx0fVxuXHRcdHRoaXMuX2VkaXRvck9wdGlvbnMgPSB0aGlzLl9jb21wdXRlRWRpdG9yT3B0aW9ucygpO1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQudXBkYXRlT3B0aW9ucyh0aGlzLl9lZGl0b3JPcHRpb25zKTtcblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fY29kZUVkaXRvcldpZGdldC5vbkRpZEZvY3VzRWRpdG9yV2lkZ2V0KCgpID0+IHRoaXMuX29uRGlkRm9jdXNXaWRnZXQuZmlyZSgpKSk7XG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Lm9uRGlkQ29udGVudFNpemVDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoIWUuY29udGVudEhlaWdodENoYW5nZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMpIHtcblx0XHRcdFx0dGhpcy5fbGF5b3V0V2lkZ2V0cyh0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucy5kaW1lbnNpb24sIHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLnBvc2l0aW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbihlID0+IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoeyByZWFzb246IHRoaXMuX3RvRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbihlKSB9KSkpO1xuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fY29kZUVkaXRvcldpZGdldC5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKHsgcmVhc29uOiBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLkVESVQgfSkpKTtcblxuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2Uub25EaWRDaGFuZ2VOb3RlYm9va0FmZmluaXR5KHRoaXMuX3N5bmNXaXRoS2VybmVsLCB0aGlzKSk7XG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2Uub25EaWRDaGFuZ2VTZWxlY3RlZE5vdGVib29rcyh0aGlzLl9zeW5jV2l0aEtlcm5lbCwgdGhpcykpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlSW5wdXRIaW50KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Lm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUlucHV0SGludCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fY29kZUVkaXRvcldpZGdldC5vbkRpZENoYW5nZU1vZGVsRGVjb3JhdGlvbnMoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlSW5wdXRIaW50KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY3Vyc29yQXRCb3VuZGFyeUNvbnRleHQgPSBJTlRFUkFDVElWRV9JTlBVVF9DVVJTT1JfQk9VTkRBUlkuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAoaW5wdXQucmVzb3VyY2UgJiYgaW5wdXQuaGlzdG9yeVNlcnZpY2UuaGFzKGlucHV0LnJlc291cmNlKSkge1xuXHRcdFx0Y3Vyc29yQXRCb3VuZGFyeUNvbnRleHQuc2V0KCd0b3AnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y3Vyc29yQXRCb3VuZGFyeUNvbnRleHQuc2V0KCdub25lJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Lm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24oKHsgcG9zaXRpb24gfSkgPT4ge1xuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5fY29kZUVkaXRvcldpZGdldC5fZ2V0Vmlld01vZGVsKCkhO1xuXHRcdFx0Y29uc3QgbGFzdExpbmVOdW1iZXIgPSB2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRjb25zdCBsYXN0TGluZUNvbCA9IHZpZXdNb2RlbC5nZXRMaW5lTGVuZ3RoKGxhc3RMaW5lTnVtYmVyKSArIDE7XG5cdFx0XHRjb25zdCB2aWV3UG9zaXRpb24gPSB2aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRjb25zdCBmaXJzdExpbmUgPSB2aWV3UG9zaXRpb24ubGluZU51bWJlciA9PT0gMSAmJiB2aWV3UG9zaXRpb24uY29sdW1uID09PSAxO1xuXHRcdFx0Y29uc3QgbGFzdExpbmUgPSB2aWV3UG9zaXRpb24ubGluZU51bWJlciA9PT0gbGFzdExpbmVOdW1iZXIgJiYgdmlld1Bvc2l0aW9uLmNvbHVtbiA9PT0gbGFzdExpbmVDb2w7XG5cblx0XHRcdGlmIChmaXJzdExpbmUpIHtcblx0XHRcdFx0aWYgKGxhc3RMaW5lKSB7XG5cdFx0XHRcdFx0Y3Vyc29yQXRCb3VuZGFyeUNvbnRleHQuc2V0KCdib3RoJyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y3Vyc29yQXRCb3VuZGFyeUNvbnRleHQuc2V0KCd0b3AnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGxhc3RMaW5lKSB7XG5cdFx0XHRcdFx0Y3Vyc29yQXRCb3VuZGFyeUNvbnRleHQuc2V0KCdib3R0b20nKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjdXJzb3JBdEJvdW5kYXJ5Q29udGV4dC5zZXQoJ25vbmUnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQoZWRpdG9yTW9kZWwub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gZWRpdG9yTW9kZWwuZ2V0VmFsdWUoKTtcblx0XHRcdGlmICh0aGlzLmlucHV0Py5yZXNvdXJjZSAmJiB2YWx1ZSAhPT0gJycpIHtcblx0XHRcdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSAodGhpcy5pbnB1dCBhcyBSZXBsRWRpdG9ySW5wdXQpLmhpc3RvcnlTZXJ2aWNlO1xuXHRcdFx0XHRpZiAoIWhpc3RvcnlTZXJ2aWNlLm1hdGNoZXNDdXJyZW50KHRoaXMuaW5wdXQucmVzb3VyY2UsIHZhbHVlKSkge1xuXHRcdFx0XHRcdGhpc3RvcnlTZXJ2aWNlLnJlcGxhY2VMYXN0KHRoaXMuaW5wdXQucmVzb3VyY2UsIHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUhLm9uRGlkU2Nyb2xsKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlU2Nyb2xsLmZpcmUoKSkpO1xuXG5cblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5vbkRpZENoYW5nZVZpZXdDZWxscyh0aGlzLmhhbmRsZVZpZXdDZWxsQ2hhbmdlLCB0aGlzKSk7XG5cblx0XHR0aGlzLl91cGRhdGVJbnB1dEhpbnQoKTtcblx0XHR0aGlzLl9zeW5jV2l0aEtlcm5lbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVWaWV3Q2VsbENoYW5nZShlOiBJTm90ZWJvb2tWaWV3Q2VsbHNVcGRhdGVFdmVudCkge1xuXHRcdGNvbnN0IG5vdGVib29rV2lkZ2V0ID0gdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU7XG5cdFx0aWYgKCFub3RlYm9va1dpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc3BsaWNlIG9mIGUuc3BsaWNlcykge1xuXHRcdFx0Y29uc3QgW19zdGFydCwgX2RlbGV0ZSwgYWRkZWRDZWxsc10gPSBzcGxpY2U7XG5cdFx0XHRpZiAoYWRkZWRDZWxscy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3Qgdmlld01vZGVsID0gbm90ZWJvb2tXaWRnZXQudmlld01vZGVsO1xuXHRcdFx0XHRpZiAodmlld01vZGVsKSB7XG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVBcHBlbmQobm90ZWJvb2tXaWRnZXQsIHZpZXdNb2RlbCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUFwcGVuZChub3RlYm9va1dpZGdldDogTm90ZWJvb2tFZGl0b3JXaWRnZXQsIHZpZXdNb2RlbDogTm90ZWJvb2tWaWV3TW9kZWwpIHtcblx0XHR0aGlzLl9ub3RlYm9va1dpZGdldFNlcnZpY2UudXBkYXRlUmVwbENvbnRleHRLZXkodmlld01vZGVsLm5vdGVib29rRG9jdW1lbnQudXJpLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IG5hdmlnYXRlVG9DZWxsID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2FjY2Vzc2liaWxpdHkucmVwbEVkaXRvci5hdXRvRm9jdXNSZXBsRXhlY3V0aW9uJyk7XG5cdFx0aWYgKHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpIHtcblx0XHRcdGlmIChuYXZpZ2F0ZVRvQ2VsbCA9PT0gJ2xhc3RFeGVjdXRpb24nKSB7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGxhc3RDZWxsSW5kZXggPSB2aWV3TW9kZWwubGVuZ3RoIC0gMTtcblx0XHRcdFx0XHRpZiAobGFzdENlbGxJbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjZWxsID0gdmlld01vZGVsLnZpZXdDZWxsc1tsYXN0Q2VsbEluZGV4XTtcblx0XHRcdFx0XHRcdG5vdGVib29rV2lkZ2V0LmZvY3VzTm90ZWJvb2tDZWxsKGNlbGwsICdjb250YWluZXInKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIDApO1xuXHRcdFx0fSBlbHNlIGlmIChuYXZpZ2F0ZVRvQ2VsbCA9PT0gJ2lucHV0Jykge1xuXHRcdFx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc2V0T3B0aW9ucyhvcHRpb25zOiBJTm90ZWJvb2tFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/LnNldE9wdGlvbnMob3B0aW9ucyk7XG5cdFx0c3VwZXIuc2V0T3B0aW9ucyhvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX3RvRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbihlOiBJQ3Vyc29yUG9zaXRpb25DaGFuZ2VkRXZlbnQpOiBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uIHtcblx0XHRzd2l0Y2ggKGUuc291cmNlKSB7XG5cdFx0XHRjYXNlIFRleHRFZGl0b3JTZWxlY3Rpb25Tb3VyY2UuUFJPR1JBTU1BVElDOiByZXR1cm4gRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbi5QUk9HUkFNTUFUSUM7XG5cdFx0XHRjYXNlIFRleHRFZGl0b3JTZWxlY3Rpb25Tb3VyY2UuTkFWSUdBVElPTjogcmV0dXJuIEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24uTkFWSUdBVElPTjtcblx0XHRcdGNhc2UgVGV4dEVkaXRvclNlbGVjdGlvblNvdXJjZS5KVU1QOiByZXR1cm4gRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbi5KVU1QO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24uVVNFUjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jZWxsQXRCb3R0b20oY2VsbDogSUNlbGxWaWV3TW9kZWwpOiBib29sZWFuIHtcblx0XHRjb25zdCB2aXNpYmxlUmFuZ2VzID0gdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/LnZpc2libGVSYW5nZXMgfHwgW107XG5cdFx0Y29uc3QgY2VsbEluZGV4ID0gdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/LmdldENlbGxJbmRleChjZWxsKTtcblx0XHRpZiAoY2VsbEluZGV4ID09PSBNYXRoLm1heCguLi52aXNpYmxlUmFuZ2VzLm1hcChyYW5nZSA9PiByYW5nZS5lbmQgLSAxKSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9zY3JvbGxJZk5lY2Vzc2FyeShjdm06IElDZWxsVmlld01vZGVsKSB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSEuZ2V0Q2VsbEluZGV4KGN2bSk7XG5cdFx0aWYgKGluZGV4ID09PSB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSEuZ2V0TGVuZ3RoKCkgLSAxKSB7XG5cdFx0XHQvLyBJZiB3ZSdyZSBhbHJlYWR5IGF0IHRoZSBib3R0b20gb3IgYXV0byBzY3JvbGwgaXMgZW5hYmxlZCwgc2Nyb2xsIHRvIHRoZSBib3R0b21cblx0XHRcdGlmICh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZXBsRWRpdG9yU2V0dGluZ3MuaW50ZXJhY3RpdmVXaW5kb3dBbHdheXNTY3JvbGxPbk5ld0NlbGwpIHx8IHRoaXMuX2NlbGxBdEJvdHRvbShjdm0pKSB7XG5cdFx0XHRcdHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5zY3JvbGxUb0JvdHRvbSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N5bmNXaXRoS2VybmVsKCkge1xuXHRcdGNvbnN0IG5vdGVib29rID0gdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/LnRleHRNb2RlbDtcblx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LmdldE1vZGVsKCk7XG5cblx0XHRpZiAobm90ZWJvb2sgJiYgdGV4dE1vZGVsKSB7XG5cdFx0XHRjb25zdCBpbmZvID0gdGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldE1hdGNoaW5nS2VybmVsKG5vdGVib29rKTtcblx0XHRcdGNvbnN0IHNlbGVjdGVkT3JTdWdnZXN0ZWQgPSBpbmZvLnNlbGVjdGVkXG5cdFx0XHRcdD8/IChpbmZvLnN1Z2dlc3Rpb25zLmxlbmd0aCA9PT0gMSA/IGluZm8uc3VnZ2VzdGlvbnNbMF0gOiB1bmRlZmluZWQpXG5cdFx0XHRcdD8/IChpbmZvLmFsbC5sZW5ndGggPT09IDEgPyBpbmZvLmFsbFswXSA6IHVuZGVmaW5lZCk7XG5cblx0XHRcdGlmIChzZWxlY3RlZE9yU3VnZ2VzdGVkKSB7XG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlID0gc2VsZWN0ZWRPclN1Z2dlc3RlZC5zdXBwb3J0ZWRMYW5ndWFnZXNbMF07XG5cdFx0XHRcdC8vIEFsbCBrZXJuZWxzIHdpbGwgaW5pdGlhbGx5IGxpc3QgcGxhaW50ZXh0IGFzIHRoZSBzdXBwb3J0ZWQgbGFuZ3VhZ2UgYmVmb3JlIHRoZXkgcHJvcGVybHkgaW5pdGlhbGl6ZWQuXG5cdFx0XHRcdGlmIChsYW5ndWFnZSAmJiBsYW5ndWFnZSAhPT0gJ3BsYWludGV4dCcpIHtcblx0XHRcdFx0XHRjb25zdCBuZXdNb2RlID0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQobGFuZ3VhZ2UpLmxhbmd1YWdlSWQ7XG5cdFx0XHRcdFx0dGV4dE1vZGVsLnNldExhbmd1YWdlKG5ld01vZGUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Tk9URUJPT0tfS0VSTkVMLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSkuc2V0KHNlbGVjdGVkT3JTdWdnZXN0ZWQuaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERPTS5EaW1lbnNpb24sIHBvc2l0aW9uOiBET00uSURvbVBvc2l0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fcm9vdEVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnbWlkLXdpZHRoJywgZGltZW5zaW9uLndpZHRoIDwgMTAwMCAmJiBkaW1lbnNpb24ud2lkdGggPj0gNjAwKTtcblx0XHR0aGlzLl9yb290RWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCduYXJyb3ctd2lkdGgnLCBkaW1lbnNpb24ud2lkdGggPCA2MDApO1xuXHRcdGNvbnN0IGVkaXRvckhlaWdodENoYW5nZWQgPSBkaW1lbnNpb24uaGVpZ2h0ICE9PSB0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucz8uZGltZW5zaW9uLmhlaWdodDtcblx0XHR0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucyA9IHsgZGltZW5zaW9uLCBwb3NpdGlvbiB9O1xuXG5cdFx0aWYgKCF0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlZGl0b3JIZWlnaHRDaGFuZ2VkICYmIHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQpIHtcblx0XHRcdFN1Z2dlc3RDb250cm9sbGVyLmdldCh0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0KT8uY2FuY2VsU3VnZ2VzdFdpZGdldCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX25vdGVib29rRWRpdG9yQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3RoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLmRpbWVuc2lvbi5oZWlnaHQgLSB0aGlzLmlucHV0Q2VsbENvbnRhaW5lckhlaWdodH1weGA7XG5cdFx0dGhpcy5fbGF5b3V0V2lkZ2V0cyhkaW1lbnNpb24sIHBvc2l0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX2xheW91dFdpZGdldHMoZGltZW5zaW9uOiBET00uRGltZW5zaW9uLCBwb3NpdGlvbjogRE9NLklEb21Qb3NpdGlvbikge1xuXHRcdGNvbnN0IGNvbnRlbnRIZWlnaHQgPSB0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Lmhhc01vZGVsKCkgPyB0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LmdldENvbnRlbnRIZWlnaHQoKSA6IHRoaXMuaW5wdXRDZWxsRWRpdG9ySGVpZ2h0O1xuXHRcdGNvbnN0IG1heEhlaWdodCA9IE1hdGgubWluKGRpbWVuc2lvbi5oZWlnaHQgLyAyLCBjb250ZW50SGVpZ2h0KTtcblx0XHRjb25zdCBsZWZ0TWFyZ2luID0gdGhpcy5fbm90ZWJvb2tPcHRpb25zLmdldENlbGxFZGl0b3JDb250YWluZXJMZWZ0TWFyZ2luKCk7XG5cblx0XHRjb25zdCBpbnB1dENlbGxDb250YWluZXJIZWlnaHQgPSBtYXhIZWlnaHQgKyBJTlBVVF9DRUxMX1ZFUlRJQ0FMX1BBRERJTkcgKiAyO1xuXHRcdHRoaXMuX25vdGVib29rRWRpdG9yQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2RpbWVuc2lvbi5oZWlnaHQgLSBpbnB1dENlbGxDb250YWluZXJIZWlnaHR9cHhgO1xuXG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUhLmxheW91dChkaW1lbnNpb24ud2l0aChkaW1lbnNpb24ud2lkdGgsIGRpbWVuc2lvbi5oZWlnaHQgLSBpbnB1dENlbGxDb250YWluZXJIZWlnaHQpLCB0aGlzLl9ub3RlYm9va0VkaXRvckNvbnRhaW5lciwgcG9zaXRpb24pO1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQubGF5b3V0KHRoaXMuX3ZhbGlkYXRlRGltZW5zaW9uKGRpbWVuc2lvbi53aWR0aCAtIGxlZnRNYXJnaW4gLSBJTlBVVF9DRUxMX0hPUklaT05UQUxfUEFERElOR19SSUdIVCwgbWF4SGVpZ2h0KSk7XG5cdFx0dGhpcy5faW5wdXRGb2N1c0luZGljYXRvci5zdHlsZS5oZWlnaHQgPSBgJHtjb250ZW50SGVpZ2h0fXB4YDtcblx0XHR0aGlzLl9pbnB1dENlbGxDb250YWluZXIuc3R5bGUudG9wID0gYCR7ZGltZW5zaW9uLmhlaWdodCAtIGlucHV0Q2VsbENvbnRhaW5lckhlaWdodH1weGA7XG5cdFx0dGhpcy5faW5wdXRDZWxsQ29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7ZGltZW5zaW9uLndpZHRofXB4YDtcblx0fVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlRGltZW5zaW9uKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKSB7XG5cdFx0cmV0dXJuIG5ldyBET00uRGltZW5zaW9uKE1hdGgubWF4KDAsIHdpZHRoKSwgTWF0aC5tYXgoMCwgaGVpZ2h0KSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNDb25mbGljdGluZ0RlY29yYXRpb24oKSB7XG5cdFx0cmV0dXJuIEJvb2xlYW4odGhpcy5fY29kZUVkaXRvcldpZGdldC5nZXRMaW5lRGVjb3JhdGlvbnMoMSk/LmZpbmQoKGQpID0+XG5cdFx0XHRkLm9wdGlvbnMuYmVmb3JlQ29udGVudENsYXNzTmFtZVxuXHRcdFx0fHwgZC5vcHRpb25zLmFmdGVyQ29udGVudENsYXNzTmFtZVxuXHRcdFx0fHwgZC5vcHRpb25zLmJlZm9yZT8uY29udGVudFxuXHRcdFx0fHwgZC5vcHRpb25zLmFmdGVyPy5jb250ZW50XG5cdFx0KSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVJbnB1dEhpbnQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2hvdWxkSGlkZSA9XG5cdFx0XHQhdGhpcy5fY29kZUVkaXRvcldpZGdldC5oYXNNb2RlbCgpIHx8XG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZXBsRWRpdG9yU2V0dGluZ3Muc2hvd0V4ZWN1dGlvbkhpbnQpID09PSBmYWxzZSB8fFxuXHRcdFx0dGhpcy5fY29kZUVkaXRvcldpZGdldC5nZXRNb2RlbCgpIS5nZXRWYWx1ZUxlbmd0aCgpICE9PSAwIHx8XG5cdFx0XHR0aGlzLl9oYXNDb25mbGljdGluZ0RlY29yYXRpb24oKTtcblxuXHRcdGlmICghdGhpcy5faGludEVsZW1lbnQgJiYgIXNob3VsZEhpZGUpIHtcblx0XHRcdHRoaXMuX2hpbnRFbGVtZW50ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVwbElucHV0SGludENvbnRlbnRXaWRnZXQsIHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faGludEVsZW1lbnQgJiYgc2hvdWxkSGlkZSkge1xuXHRcdFx0dGhpcy5faGludEVsZW1lbnQuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5faGludEVsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0Z2V0U2Nyb2xsUG9zaXRpb24oKTogSUVkaXRvclBhbmVTY3JvbGxQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNjcm9sbFRvcDogdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/LnNjcm9sbFRvcCA/PyAwLFxuXHRcdFx0c2Nyb2xsTGVmdDogMFxuXHRcdH07XG5cdH1cblxuXHRzZXRTY3JvbGxQb3NpdGlvbihwb3NpdGlvbjogSUVkaXRvclBhbmVTY3JvbGxQb3NpdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlPy5zZXRTY3JvbGxUb3AocG9zaXRpb24uc2Nyb2xsVG9wKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCkge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cblx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8ub25TaG93KCk7XG5cdFx0dGhpcy5fY29kZUVkaXRvcldpZGdldC5mb2N1cygpO1xuXHR9XG5cblx0Zm9jdXNIaXN0b3J5KCkge1xuXHRcdHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5mb2N1cygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNldEVkaXRvclZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHN1cGVyLnNldEVkaXRvclZpc2libGUodmlzaWJsZSk7XG5cdFx0dGhpcy5fZ3JvdXBMaXN0ZW5lci52YWx1ZSA9IHRoaXMuZ3JvdXAub25XaWxsQ2xvc2VFZGl0b3IoZSA9PiB0aGlzLl9zYXZlRWRpdG9yVmlld1N0YXRlKGUuZWRpdG9yKSk7XG5cblx0XHRpZiAoIXZpc2libGUpIHtcblx0XHRcdHRoaXMuX3NhdmVFZGl0b3JWaWV3U3RhdGUodGhpcy5pbnB1dCk7XG5cdFx0XHRpZiAodGhpcy5pbnB1dCAmJiB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSkge1xuXHRcdFx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZS5vbldpbGxIaWRlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXBkYXRlSW5wdXRIaW50KCk7XG5cdH1cblxuXHRvdmVycmlkZSBjbGVhcklucHV0KCkge1xuXHRcdGlmICh0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSkge1xuXHRcdFx0dGhpcy5fc2F2ZUVkaXRvclZpZXdTdGF0ZSh0aGlzLmlucHV0KTtcblx0XHRcdHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlLm9uV2lsbEhpZGUoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Py5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9ub3RlYm9va1dpZGdldCA9IHsgdmFsdWU6IHVuZGVmaW5lZCB9O1xuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5jbGVhcigpO1xuXG5cdFx0c3VwZXIuY2xlYXJJbnB1dCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0Q29udHJvbCgpOiBSZXBsRWRpdG9yQ29udHJvbCAmIElDb21wb3NpdGVDb2RlRWRpdG9yIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bm90ZWJvb2tFZGl0b3I6IHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlLFxuXHRcdFx0YWN0aXZlQ29kZUVkaXRvcjogdGhpcy5nZXRBY3RpdmVDb2RlRWRpdG9yKCksXG5cdFx0XHRvbkRpZENoYW5nZUFjdGl2ZUVkaXRvcjogRXZlbnQuTm9uZVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGl2ZUNvZGVFZGl0b3IoKSB7XG5cdFx0aWYgKCF0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY29kZUVkaXRvcldpZGdldC5oYXNXaWRnZXRGb2N1cygpIHx8ICF0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8uYWN0aXZlQ29kZUVkaXRvciA/XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0IDpcblx0XHRcdHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlLmFjdGl2ZUNvZGVFZGl0b3I7XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgUmVwbEVkaXRvckNvbnRyb2wgPSB7IGFjdGl2ZUNvZGVFZGl0b3I6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkOyBub3RlYm9va0VkaXRvcjogTm90ZWJvb2tFZGl0b3JXaWRnZXQgfCB1bmRlZmluZWQgfTtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzUmVwbEVkaXRvckNvbnRyb2woY29udHJvbDogdW5rbm93bik6IGNvbnRyb2wgaXMgUmVwbEVkaXRvckNvbnRyb2wge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBjb250cm9sIGFzIFJlcGxFZGl0b3JDb250cm9sO1xuXHRyZXR1cm4gY2FuZGlkYXRlPy5hY3RpdmVDb2RlRWRpdG9yIGluc3RhbmNlb2YgQ29kZUVkaXRvcldpZGdldCAmJiBjYW5kaWRhdGU/Lm5vdGVib29rRWRpdG9yIGluc3RhbmNlb2YgTm90ZWJvb2tFZGl0b3JXaWRnZXQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsWUFBWSxvQkFBb0I7QUFFaEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxpQkFBaUIseUJBQXlCO0FBQ25ELFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMs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QU8sTUFBTTtBQUFBLEVBQ25DO0FBQUEsRUFFbUIsaUJBQWlCLFNBQXdCO0FBQzNELFVBQU0saUJBQWlCLE9BQU87QUFDOUIsU0FBSyxlQUFlLFFBQVEsS0FBSyxNQUFNLGtCQUFrQixPQUFLLEtBQUsscUJBQXFCLEVBQUUsTUFBTSxDQUFDO0FBRWpHLFFBQUksQ0FBQyxTQUFTO0FBQ2IsV0FBSyxxQkFBcUIsS0FBSyxLQUFLO0FBQ3BDLFVBQUksS0FBSyxTQUFTLEtBQUssZ0JBQWdCLE9BQU87QUFDN0MsYUFBSyxnQkFBZ0IsTUFBTSxXQUFXO0FBQUEsTUFDdkM7QUFBQSxJQUNEO0FBRUEsU0FBSyxpQkFBaUI7QUFBQSxFQUN2QjtBQUFBLEVBRVMsYUFBYTtBQUNyQixRQUFJLEtBQUssZ0JBQWdCLE9BQU87QUFDL0IsV0FBSyxxQkFBcUIsS0FBSyxLQUFLO0FBQ3BDLFdBQUssZ0JBQWdCLE1BQU0sV0FBVztBQUFBLElBQ3ZDO0FBRUEsU0FBSyxtQkFBbUIsUUFBUTtBQUVoQyxTQUFLLGtCQUFrQixFQUFFLE9BQU8sT0FBVTtBQUMxQyxTQUFLLHVCQUF1QixNQUFNO0FBRWxDLFVBQU0sV0FBVztBQUFBLEVBQ2xCO0FBQUEsRUFFUyxhQUF1RDtBQUMvRCxXQUFPO0FBQUEsTUFDTixnQkFBZ0IsS0FBSyxnQkFBZ0I7QUFBQSxNQUNyQyxrQkFBa0IsS0FBSyxvQkFBb0I7QUFBQSxNQUMzQyx5QkFBeUIsTUFBTTtBQUFBLElBQ2hDO0FBQUEsRUFDRDtBQUFBLEVBRVEsc0JBQXNCO0FBQzdCLFFBQUksQ0FBQyxLQUFLLG1CQUFtQjtBQUM1QixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sS0FBSyxrQkFBa0IsZUFBZSxLQUFLLENBQUMsS0FBSyxnQkFBZ0IsT0FBTyxtQkFDOUUsS0FBSyxvQkFDTCxLQUFLLGdCQUFnQixNQUFNO0FBQUEsRUFDN0I7QUFDRDtBQTdxQmEsYUFBTjtBQUFBLEVBdUNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdkRVO0FBaXJCTixTQUFTLG9CQUFvQixTQUFnRDtBQUNuRixRQUFNLFlBQVk7QUFDbEIsU0FBTyxXQUFXLDRCQUE0QixvQkFBb0IsV0FBVywwQkFBMEI7QUFDeEc7IiwKICAibmFtZXMiOiBbImlucHV0Il0KfQo=
