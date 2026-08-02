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
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { EditorPaneSelectionChangeReason } from "../../../common/editor.js";
import { getSimpleEditorOptions } from "../../codeEditor/browser/simpleEditorOptions.js";
import { InteractiveEditorInput } from "./interactiveEditorInput.js";
import { NotebookEditorExtensionsRegistry } from "../../notebook/browser/notebookEditorExtensions.js";
import { INotebookEditorService } from "../../notebook/browser/services/notebookEditorService.js";
import { GroupsOrder, IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { ExecutionStateCellStatusBarContrib, TimerCellStatusBarContrib } from "../../notebook/browser/contrib/cellStatusBar/executionStatusBarItemController.js";
import { INotebookKernelService } from "../../notebook/common/notebookKernelService.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ReplEditorSettings, INTERACTIVE_INPUT_CURSOR_BOUNDARY } from "./interactiveCommon.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { NotebookOptions } from "../../notebook/browser/notebookOptions.js";
import { ToolBar } from "../../../../base/browser/ui/toolbar/toolbar.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { createActionViewItem, getActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { ParameterHintsController } from "../../../../editor/contrib/parameterHints/browser/parameterHints.js";
import { MenuPreventer } from "../../codeEditor/browser/menuPreventer.js";
import { SelectionClipboardContributionID } from "../../codeEditor/browser/selectionClipboard.js";
import { ContextMenuController } from "../../../../editor/contrib/contextmenu/browser/contextmenu.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { SnippetController2 } from "../../../../editor/contrib/snippet/browser/snippetController2.js";
import { TabCompletionController } from "../../snippets/browser/tabCompletion.js";
import { MarkerController } from "../../../../editor/contrib/gotoError/browser/gotoError.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { TextEditorSelectionSource } from "../../../../platform/editor/common/editor.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../notebook/common/notebookExecutionStateService.js";
import { NOTEBOOK_KERNEL } from "../../notebook/common/notebookContextKeys.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { isEqual } from "../../../../base/common/resources.js";
import { NotebookFindContrib } from "../../notebook/browser/contrib/find/notebookFindWidget.js";
import { INTERACTIVE_WINDOW_EDITOR_ID } from "../../notebook/common/notebookCommon.js";
import "./interactiveEditor.css";
import { deepClone } from "../../../../base/common/objects.js";
import { ContentHoverController } from "../../../../editor/contrib/hover/browser/contentHoverController.js";
import { GlyphHoverController } from "../../../../editor/contrib/hover/browser/glyphHoverController.js";
import { ReplInputHintContentWidget } from "./replInputHintContentWidget.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { INLINE_CHAT_ID } from "../../inlineChat/common/inlineChat.js";
const DECORATION_KEY = "interactiveInputDecoration";
const INTERACTIVE_EDITOR_VIEW_STATE_PREFERENCE_KEY = "InteractiveEditorViewState";
const INPUT_CELL_VERTICAL_PADDING = 8;
const INPUT_CELL_HORIZONTAL_PADDING_RIGHT = 10;
const INPUT_EDITOR_PADDING = 8;
let InteractiveEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, instantiationService, notebookWidgetService, contextKeyService, codeEditorService, notebookKernelService, languageService, keybindingService, configurationService, menuService, contextMenuService, editorGroupService, textResourceConfigurationService, notebookExecutionStateService, extensionService) {
    super(
      INTERACTIVE_WINDOW_EDITOR_ID,
      group,
      telemetryService,
      themeService,
      storageService
    );
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
    this._notebookExecutionStateService = notebookExecutionStateService;
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
    this._register(codeEditorService.registerDecorationType("interactive-decoration", DECORATION_KEY, {}));
    this._register(this._keybindingService.onDidUpdateKeybindings(this._updateInputHint, this));
    this._register(this._notebookExecutionStateService.onDidChangeExecution((e) => {
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
    const menu = this._register(this._menuService.createMenu(MenuId.InteractiveInputExecute, this._contextKeyService));
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
    if (!(input instanceof InteractiveEditorInput)) {
      return void 0;
    }
    this._saveEditorViewState(input);
    return this._loadNotebookEditorViewState(input);
  }
  _saveEditorViewState(input) {
    if (this._notebookWidget.value && input instanceof InteractiveEditorInput) {
      if (this._notebookWidget.value.isDisposed) {
        return;
      }
      const state = this._notebookWidget.value.getEditorViewState();
      const editorState = this._codeEditorWidget.saveViewState();
      this._editorMemento.saveEditorState(this.group, input.notebookEditorInput.resource, {
        notebook: state,
        input: editorState
      });
    }
  }
  _loadNotebookEditorViewState(input) {
    const result = this._editorMemento.loadEditorState(this.group, input.notebookEditorInput.resource);
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
    const notebookInput = input.notebookEditorInput;
    this._notebookWidget.value?.onWillHide();
    this._codeEditorWidget?.dispose();
    this._widgetDisposableStore.clear();
    this._notebookWidget = this._instantiationService.invokeFunction(this._notebookWidgetService.retrieveWidget, this.group.id, notebookInput, {
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
    this._codeEditorWidget = this._instantiationService.createInstance(CodeEditorWidget, this._inputEditorContainer, this._editorOptions, {
      ...{
        isSimpleWidget: false,
        contributions: EditorExtensionsRegistry.getSomeEditorContributions([
          MenuPreventer.ID,
          SelectionClipboardContributionID,
          ContextMenuController.ID,
          SuggestController.ID,
          ParameterHintsController.ID,
          SnippetController2.ID,
          TabCompletionController.ID,
          ContentHoverController.ID,
          GlyphHoverController.ID,
          MarkerController.ID,
          INLINE_CHAT_ID
        ])
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
      throw new Error("The Interactive Window model could not be resolved");
    }
    this._notebookWidget.value?.setParentContextKeyService(this._contextKeyService);
    const viewState = options?.viewState ?? this._loadNotebookEditorViewState(input);
    await this._extensionService.whenInstalledExtensionsRegistered();
    await this._notebookWidget.value.setModel(model.notebook, viewState?.notebook);
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
    const languageId = this._notebookWidget.value?.activeKernel?.supportedLanguages[0] ?? input.language ?? PLAINTEXT_LANGUAGE_ID;
    const editorModel = await input.resolveInput(languageId);
    editorModel.setLanguage(languageId);
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
    this._widgetDisposableStore.add(this._codeEditorWidget.onDidChangeModel(() => {
      this._updateInputHint();
    }));
    this._widgetDisposableStore.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ReplEditorSettings.showExecutionHint)) {
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
      if (this.input?.resource) {
        const historyService = this.input.historyService;
        if (!historyService.matchesCurrent(this.input.resource, value)) {
          historyService.replaceLast(this.input.resource, value);
        }
      }
    }));
    this._widgetDisposableStore.add(this._notebookWidget.value.onDidScroll(() => this._onDidChangeScroll.fire()));
    this._syncWithKernel();
    this._updateInputHint();
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
      activeCodeEditor: this._codeEditorWidget,
      onDidChangeActiveEditor: Event.None
    };
  }
};
InteractiveEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, INotebookEditorService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, ICodeEditorService),
  __decorateParam(8, INotebookKernelService),
  __decorateParam(9, ILanguageService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IMenuService),
  __decorateParam(13, IContextMenuService),
  __decorateParam(14, IEditorGroupsService),
  __decorateParam(15, ITextResourceConfigurationService),
  __decorateParam(16, INotebookExecutionStateService),
  __decorateParam(17, IExtensionService)
], InteractiveEditor);
export {
  InteractiveEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ludGVyYWN0aXZlL2Jyb3dzZXIvaW50ZXJhY3RpdmVFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvaW50ZXJhY3RpdmUuY3NzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGRvbVN0eWxlc2hlZXRzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JWaWV3U3RhdGUsIElDb21wb3NpdGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFuZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLCBJRWRpdG9yTWVtZW50bywgSUVkaXRvck9wZW5Db250ZXh0LCBJRWRpdG9yUGFuZVNjcm9sbFBvc2l0aW9uLCBJRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZUV2ZW50LCBJRWRpdG9yUGFuZVdpdGhTY3JvbGxpbmcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGdldFNpbXBsZUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvc2ltcGxlRWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJbnRlcmFjdGl2ZUVkaXRvcklucHV0IH0gZnJvbSAnLi9pbnRlcmFjdGl2ZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElDZWxsVmlld01vZGVsLCBJTm90ZWJvb2tFZGl0b3JPcHRpb25zLCBJTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0VkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tFZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElCb3Jyb3dWYWx1ZSwgSU5vdGVib29rRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL25vdGVib29rL2Jyb3dzZXIvc2VydmljZXMvbm90ZWJvb2tFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0VkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBHcm91cHNPcmRlciwgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeGVjdXRpb25TdGF0ZUNlbGxTdGF0dXNCYXJDb250cmliLCBUaW1lckNlbGxTdGF0dXNCYXJDb250cmliIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9jb250cmliL2NlbGxTdGF0dXNCYXIvZXhlY3V0aW9uU3RhdHVzQmFySXRlbUNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rS2VybmVsU2VydmljZSB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgUmVwbEVkaXRvclNldHRpbmdzLCBJTlRFUkFDVElWRV9JTlBVVF9DVVJTT1JfQk9VTkRBUlkgfSBmcm9tICcuL2ludGVyYWN0aXZlQ29tbW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tPcHRpb25zIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va09wdGlvbnMuanMnO1xuaW1wb3J0IHsgVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b29sYmFyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0sIGdldEFjdGlvbkJhckFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBQYXJhbWV0ZXJIaW50c0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9wYXJhbWV0ZXJIaW50cy9icm93c2VyL3BhcmFtZXRlckhpbnRzLmpzJztcbmltcG9ydCB7IE1lbnVQcmV2ZW50ZXIgfSBmcm9tICcuLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvbWVudVByZXZlbnRlci5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb25DbGlwYm9hcmRDb250cmlidXRpb25JRCB9IGZyb20gJy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9zZWxlY3Rpb25DbGlwYm9hcmQuanMnO1xuaW1wb3J0IHsgQ29udGV4dE1lbnVDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29udGV4dG1lbnUvYnJvd3Nlci9jb250ZXh0bWVudS5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0Q29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0Q29udHJvbGxlcjIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldENvbnRyb2xsZXIyLmpzJztcbmltcG9ydCB7IFRhYkNvbXBsZXRpb25Db250cm9sbGVyIH0gZnJvbSAnLi4vLi4vc25pcHBldHMvYnJvd3Nlci90YWJDb21wbGV0aW9uLmpzJztcbmltcG9ydCB7IE1hcmtlckNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9nb3RvRXJyb3IvYnJvd3Nlci9nb3RvRXJyb3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvck9wdGlvbnMsIFRleHRFZGl0b3JTZWxlY3Rpb25Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsIE5vdGVib29rRXhlY3V0aW9uVHlwZSB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19LRVJORUwgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ3Vyc29yUG9zaXRpb25DaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2N1cnNvckV2ZW50cy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0ZpbmRDb250cmliIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9jb250cmliL2ZpbmQvbm90ZWJvb2tGaW5kV2lkZ2V0LmpzJztcbmltcG9ydCB7IElOVEVSQUNUSVZFX1dJTkRPV19FRElUT1JfSUQgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0ICcuL2ludGVyYWN0aXZlRWRpdG9yLmNzcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgZGVlcENsb25lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBDb250ZW50SG92ZXJDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaG92ZXIvYnJvd3Nlci9jb250ZW50SG92ZXJDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IEdseXBoSG92ZXJDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaG92ZXIvYnJvd3Nlci9nbHlwaEhvdmVyQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBSZXBsSW5wdXRIaW50Q29udGVudFdpZGdldCB9IGZyb20gJy4vcmVwbElucHV0SGludENvbnRlbnRXaWRnZXQuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTkxJTkVfQ0hBVF9JRCB9IGZyb20gJy4uLy4uL2lubGluZUNoYXQvY29tbW9uL2lubGluZUNoYXQuanMnO1xuaW1wb3J0IHsgUmVwbEVkaXRvckNvbnRyb2wgfSBmcm9tICcuLi8uLi9yZXBsTm90ZWJvb2svYnJvd3Nlci9yZXBsRWRpdG9yLmpzJztcblxuY29uc3QgREVDT1JBVElPTl9LRVkgPSAnaW50ZXJhY3RpdmVJbnB1dERlY29yYXRpb24nO1xuY29uc3QgSU5URVJBQ1RJVkVfRURJVE9SX1ZJRVdfU1RBVEVfUFJFRkVSRU5DRV9LRVkgPSAnSW50ZXJhY3RpdmVFZGl0b3JWaWV3U3RhdGUnO1xuXG5jb25zdCBJTlBVVF9DRUxMX1ZFUlRJQ0FMX1BBRERJTkcgPSA4O1xuY29uc3QgSU5QVVRfQ0VMTF9IT1JJWk9OVEFMX1BBRERJTkdfUklHSFQgPSAxMDtcbmNvbnN0IElOUFVUX0VESVRPUl9QQURESU5HID0gODtcblxuXG5leHBvcnQgaW50ZXJmYWNlIEludGVyYWN0aXZlRWRpdG9yVmlld1N0YXRlIHtcblx0cmVhZG9ubHkgbm90ZWJvb2s/OiBJTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGU7XG5cdHJlYWRvbmx5IGlucHV0PzogSUNvZGVFZGl0b3JWaWV3U3RhdGUgfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEludGVyYWN0aXZlRWRpdG9yT3B0aW9ucyBleHRlbmRzIElUZXh0RWRpdG9yT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHZpZXdTdGF0ZT86IEludGVyYWN0aXZlRWRpdG9yVmlld1N0YXRlO1xufVxuXG5leHBvcnQgY2xhc3MgSW50ZXJhY3RpdmVFZGl0b3IgZXh0ZW5kcyBFZGl0b3JQYW5lIGltcGxlbWVudHMgSUVkaXRvclBhbmVXaXRoU2Nyb2xsaW5nIHtcblx0cHJpdmF0ZSBfcm9vdEVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfc3R5bGVFbGVtZW50ITogSFRNTFN0eWxlRWxlbWVudDtcblx0cHJpdmF0ZSBfbm90ZWJvb2tFZGl0b3JDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfbm90ZWJvb2tXaWRnZXQ6IElCb3Jyb3dWYWx1ZTxOb3RlYm9va0VkaXRvcldpZGdldD4gPSB7IHZhbHVlOiB1bmRlZmluZWQgfTtcblx0cHJpdmF0ZSBfaW5wdXRDZWxsQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2lucHV0Rm9jdXNJbmRpY2F0b3IhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfaW5wdXRSdW5CdXR0b25Db250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfaW5wdXRFZGl0b3JDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfY29kZUVkaXRvcldpZGdldCE6IENvZGVFZGl0b3JXaWRnZXQ7XG5cdHByaXZhdGUgX25vdGVib29rV2lkZ2V0U2VydmljZTogSU5vdGVib29rRWRpdG9yU2VydmljZTtcblx0cHJpdmF0ZSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0cHJpdmF0ZSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlO1xuXHRwcml2YXRlIF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRwcml2YXRlIF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRwcml2YXRlIF9ub3RlYm9va0tlcm5lbFNlcnZpY2U6IElOb3RlYm9va0tlcm5lbFNlcnZpY2U7XG5cdHByaXZhdGUgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2U7XG5cdHByaXZhdGUgX21lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2U7XG5cdHByaXZhdGUgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZTtcblx0cHJpdmF0ZSBfZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZTtcblx0cHJpdmF0ZSBfbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZTtcblx0cHJpdmF0ZSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dpZGdldERpc3Bvc2FibGVTdG9yZTogRGlzcG9zYWJsZVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfbGFzdExheW91dERpbWVuc2lvbnM/OiB7IHJlYWRvbmx5IGRpbWVuc2lvbjogRE9NLkRpbWVuc2lvbjsgcmVhZG9ubHkgcG9zaXRpb246IERPTS5JRG9tUG9zaXRpb24gfTtcblx0cHJpdmF0ZSBfZWRpdG9yT3B0aW9uczogSUVkaXRvck9wdGlvbnM7XG5cdHByaXZhdGUgX25vdGVib29rT3B0aW9uczogTm90ZWJvb2tPcHRpb25zO1xuXHRwcml2YXRlIF9lZGl0b3JNZW1lbnRvOiBJRWRpdG9yTWVtZW50bzxJbnRlcmFjdGl2ZUVkaXRvclZpZXdTdGF0ZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dyb3VwTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgX3J1bmJ1dHRvblRvb2xiYXI6IFRvb2xCYXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2hpbnRFbGVtZW50OiBSZXBsSW5wdXRIaW50Q29udGVudFdpZGdldCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9vbkRpZEZvY3VzV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdG92ZXJyaWRlIGdldCBvbkRpZEZvY3VzKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkRm9jdXNXaWRnZXQuZXZlbnQ7IH1cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VTZWxlY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZWxlY3Rpb24gPSB0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5ldmVudDtcblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VTY3JvbGwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTY3JvbGwgPSB0aGlzLl9vbkRpZENoYW5nZVNjcm9sbC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRncm91cDogSUVkaXRvckdyb3VwLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU5vdGVib29rRWRpdG9yU2VydmljZSBub3RlYm9va1dpZGdldFNlcnZpY2U6IElOb3RlYm9va0VkaXRvclNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASU5vdGVib29rS2VybmVsU2VydmljZSBub3RlYm9va0tlcm5lbFNlcnZpY2U6IElOb3RlYm9va0tlcm5lbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSBub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRJTlRFUkFDVElWRV9XSU5ET1dfRURJVE9SX0lELFxuXHRcdFx0Z3JvdXAsXG5cdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0dGhlbWVTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2Vcblx0XHQpO1xuXHRcdHRoaXMuX25vdGVib29rV2lkZ2V0U2VydmljZSA9IG5vdGVib29rV2lkZ2V0U2VydmljZTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZSA9IG5vdGVib29rS2VybmVsU2VydmljZTtcblx0XHR0aGlzLl9sYW5ndWFnZVNlcnZpY2UgPSBsYW5ndWFnZVNlcnZpY2U7XG5cdFx0dGhpcy5fa2V5YmluZGluZ1NlcnZpY2UgPSBrZXliaW5kaW5nU2VydmljZTtcblx0XHR0aGlzLl9tZW51U2VydmljZSA9IG1lbnVTZXJ2aWNlO1xuXHRcdHRoaXMuX2NvbnRleHRNZW51U2VydmljZSA9IGNvbnRleHRNZW51U2VydmljZTtcblx0XHR0aGlzLl9lZGl0b3JHcm91cFNlcnZpY2UgPSBlZGl0b3JHcm91cFNlcnZpY2U7XG5cdFx0dGhpcy5fbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgPSBub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZTtcblx0XHR0aGlzLl9leHRlbnNpb25TZXJ2aWNlID0gZXh0ZW5zaW9uU2VydmljZTtcblxuXHRcdHRoaXMuX3Jvb3RFbGVtZW50ID0gRE9NLiQoJy5pbnRlcmFjdGl2ZS1lZGl0b3InKTtcblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLl9yb290RWxlbWVudCkpO1xuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleSgnaXNDb21wb3NpdGVOb3RlYm9vaycsIHRydWUpO1xuXHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblxuXHRcdHRoaXMuX2VkaXRvck9wdGlvbnMgPSB0aGlzLl9jb21wdXRlRWRpdG9yT3B0aW9ucygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3InKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdub3RlYm9vaycpKSB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvck9wdGlvbnMgPSB0aGlzLl9jb21wdXRlRWRpdG9yT3B0aW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9ub3RlYm9va09wdGlvbnMgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va09wdGlvbnMsIHRoaXMud2luZG93LCB0cnVlLCB7IGNlbGxUb29sYmFySW50ZXJhY3Rpb246ICdob3ZlcicsIGdsb2JhbFRvb2xiYXI6IHRydWUsIHN0aWNreVNjcm9sbEVuYWJsZWQ6IGZhbHNlLCBkcmFnQW5kRHJvcEVuYWJsZWQ6IGZhbHNlLCBkaXNhYmxlUnVsZXJzOiB0cnVlIH0pO1xuXHRcdHRoaXMuX2VkaXRvck1lbWVudG8gPSB0aGlzLmdldEVkaXRvck1lbWVudG88SW50ZXJhY3RpdmVFZGl0b3JWaWV3U3RhdGU+KGVkaXRvckdyb3VwU2VydmljZSwgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsIElOVEVSQUNUSVZFX0VESVRPUl9WSUVXX1NUQVRFX1BSRUZFUkVOQ0VfS0VZKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvZGVFZGl0b3JTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvblR5cGUoJ2ludGVyYWN0aXZlLWRlY29yYXRpb24nLCBERUNPUkFUSU9OX0tFWSwge30pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9rZXliaW5kaW5nU2VydmljZS5vbkRpZFVwZGF0ZUtleWJpbmRpbmdzKHRoaXMuX3VwZGF0ZUlucHV0SGludCwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLm9uRGlkQ2hhbmdlRXhlY3V0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS50eXBlID09PSBOb3RlYm9va0V4ZWN1dGlvblR5cGUuY2VsbCAmJiBpc0VxdWFsKGUubm90ZWJvb2ssIHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlPy52aWV3TW9kZWw/Lm5vdGVib29rRG9jdW1lbnQudXJpKSkge1xuXHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/LmdldENlbGxCeUhhbmRsZShlLmNlbGxIYW5kbGUpO1xuXHRcdFx0XHRpZiAoY2VsbCAmJiBlLmNoYW5nZWQ/LnN0YXRlKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2Nyb2xsSWZOZWNlc3NhcnkoY2VsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBpbnB1dENlbGxDb250YWluZXJIZWlnaHQoKSB7XG5cdFx0cmV0dXJuIDE5ICsgMiArIElOUFVUX0NFTExfVkVSVElDQUxfUEFERElORyAqIDIgKyBJTlBVVF9FRElUT1JfUEFERElORyAqIDI7XG5cdH1cblxuXHRwcml2YXRlIGdldCBpbnB1dENlbGxFZGl0b3JIZWlnaHQoKSB7XG5cdFx0cmV0dXJuIDE5ICsgSU5QVVRfRURJVE9SX1BBRERJTkcgKiAyO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUVkaXRvcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0RE9NLmFwcGVuZChwYXJlbnQsIHRoaXMuX3Jvb3RFbGVtZW50KTtcblx0XHR0aGlzLl9yb290RWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3JDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuX3Jvb3RFbGVtZW50LCBET00uJCgnLm5vdGVib29rLWVkaXRvci1jb250YWluZXInKSk7XG5cdFx0dGhpcy5faW5wdXRDZWxsQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLl9yb290RWxlbWVudCwgRE9NLiQoJy5pbnB1dC1jZWxsLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLl9pbnB1dENlbGxDb250YWluZXIuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdHRoaXMuX2lucHV0Q2VsbENvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHt0aGlzLmlucHV0Q2VsbENvbnRhaW5lckhlaWdodH1weGA7XG5cdFx0dGhpcy5faW5wdXRGb2N1c0luZGljYXRvciA9IERPTS5hcHBlbmQodGhpcy5faW5wdXRDZWxsQ29udGFpbmVyLCBET00uJCgnLmlucHV0LWZvY3VzLWluZGljYXRvcicpKTtcblx0XHR0aGlzLl9pbnB1dFJ1bkJ1dHRvbkNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5faW5wdXRDZWxsQ29udGFpbmVyLCBET00uJCgnLnJ1bi1idXR0b24tY29udGFpbmVyJykpO1xuXHRcdHRoaXMuX3NldHVwUnVuQnV0dG9uVG9vbGJhcih0aGlzLl9pbnB1dFJ1bkJ1dHRvbkNvbnRhaW5lcik7XG5cdFx0dGhpcy5faW5wdXRFZGl0b3JDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuX2lucHV0Q2VsbENvbnRhaW5lciwgRE9NLiQoJy5pbnB1dC1lZGl0b3ItY29udGFpbmVyJykpO1xuXHRcdHRoaXMuX2NyZWF0ZUxheW91dFN0eWxlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0dXBSdW5CdXR0b25Ub29sYmFyKHJ1bkJ1dHRvbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHRjb25zdCBtZW51ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fbWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuSW50ZXJhY3RpdmVJbnB1dEV4ZWN1dGUsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fcnVuYnV0dG9uVG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUb29sQmFyKHJ1bkJ1dHRvbkNvbnRhaW5lciwgdGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLCB7XG5cdFx0XHRnZXRLZXlCaW5kaW5nOiBhY3Rpb24gPT4gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQpLFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0odGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0cmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudDogdHJ1ZVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHsgcHJpbWFyeSwgc2Vjb25kYXJ5IH0gPSBnZXRBY3Rpb25CYXJBY3Rpb25zKG1lbnUuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pKTtcblx0XHR0aGlzLl9ydW5idXR0b25Ub29sYmFyLnNldEFjdGlvbnMoWy4uLnByaW1hcnksIC4uLnNlY29uZGFyeV0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlTGF5b3V0U3R5bGVzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0eWxlRWxlbWVudCA9IGRvbVN0eWxlc2hlZXRzLmNyZWF0ZVN0eWxlU2hlZXQodGhpcy5fcm9vdEVsZW1lbnQpO1xuXHRcdGNvbnN0IHN0eWxlU2hlZXRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Y29uc3Qge1xuXHRcdFx0Y29kZUNlbGxMZWZ0TWFyZ2luLFxuXHRcdFx0Y2VsbFJ1bkd1dHRlclxuXHRcdH0gPSB0aGlzLl9ub3RlYm9va09wdGlvbnMuZ2V0TGF5b3V0Q29uZmlndXJhdGlvbigpO1xuXHRcdGNvbnN0IHtcblx0XHRcdGZvY3VzSW5kaWNhdG9yXG5cdFx0fSA9IHRoaXMuX25vdGVib29rT3B0aW9ucy5nZXREaXNwbGF5T3B0aW9ucygpO1xuXHRcdGNvbnN0IGxlZnRNYXJnaW4gPSB0aGlzLl9ub3RlYm9va09wdGlvbnMuZ2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW4oKTtcblxuXHRcdHN0eWxlU2hlZXRzLnB1c2goYFxuXHRcdFx0LmludGVyYWN0aXZlLWVkaXRvciAuaW5wdXQtY2VsbC1jb250YWluZXIge1xuXHRcdFx0XHRwYWRkaW5nOiAke0lOUFVUX0NFTExfVkVSVElDQUxfUEFERElOR31weCAke0lOUFVUX0NFTExfSE9SSVpPTlRBTF9QQURESU5HX1JJR0hUfXB4ICR7SU5QVVRfQ0VMTF9WRVJUSUNBTF9QQURESU5HfXB4ICR7bGVmdE1hcmdpbn1weDtcblx0XHRcdH1cblx0XHRgKTtcblx0XHRpZiAoZm9jdXNJbmRpY2F0b3IgPT09ICdndXR0ZXInKSB7XG5cdFx0XHRzdHlsZVNoZWV0cy5wdXNoKGBcblx0XHRcdFx0LmludGVyYWN0aXZlLWVkaXRvciAuaW5wdXQtY2VsbC1jb250YWluZXI6Zm9jdXMtd2l0aGluIC5pbnB1dC1mb2N1cy1pbmRpY2F0b3I6OmJlZm9yZSB7XG5cdFx0XHRcdFx0Ym9yZGVyLWNvbG9yOiB2YXIoLS12c2NvZGUtbm90ZWJvb2stZm9jdXNlZENlbGxCb3JkZXIpICFpbXBvcnRhbnQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0LmludGVyYWN0aXZlLWVkaXRvciAuaW5wdXQtZm9jdXMtaW5kaWNhdG9yOjpiZWZvcmUge1xuXHRcdFx0XHRcdGJvcmRlci1jb2xvcjogdmFyKC0tdnNjb2RlLW5vdGVib29rLWluYWN0aXZlRm9jdXNlZENlbGxCb3JkZXIpICFpbXBvcnRhbnQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0LmludGVyYWN0aXZlLWVkaXRvciAuaW5wdXQtY2VsbC1jb250YWluZXIgLmlucHV0LWZvY3VzLWluZGljYXRvciB7XG5cdFx0XHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHRcdFx0dG9wOiAke0lOUFVUX0NFTExfVkVSVElDQUxfUEFERElOR31weDtcblx0XHRcdFx0fVxuXHRcdFx0XHQuaW50ZXJhY3RpdmUtZWRpdG9yIC5pbnB1dC1jZWxsLWNvbnRhaW5lciB7XG5cdFx0XHRcdFx0Ym9yZGVyLXRvcDogMXB4IHNvbGlkIHZhcigtLXZzY29kZS1ub3RlYm9vay1pbmFjdGl2ZUZvY3VzZWRDZWxsQm9yZGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGJvcmRlclxuXHRcdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0XHRcdC5pbnRlcmFjdGl2ZS1lZGl0b3IgLmlucHV0LWNlbGwtY29udGFpbmVyIHtcblx0XHRcdFx0XHRib3JkZXItdG9wOiAxcHggc29saWQgdmFyKC0tdnNjb2RlLW5vdGVib29rLWluYWN0aXZlRm9jdXNlZENlbGxCb3JkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC5pbnRlcmFjdGl2ZS1lZGl0b3IgLmlucHV0LWNlbGwtY29udGFpbmVyIC5pbnB1dC1mb2N1cy1pbmRpY2F0b3Ige1xuXHRcdFx0XHRcdGRpc3BsYXk6IG5vbmU7XG5cdFx0XHRcdH1cblx0XHRcdGApO1xuXHRcdH1cblxuXHRcdHN0eWxlU2hlZXRzLnB1c2goYFxuXHRcdFx0LmludGVyYWN0aXZlLWVkaXRvciAuaW5wdXQtY2VsbC1jb250YWluZXIgLnJ1bi1idXR0b24tY29udGFpbmVyIHtcblx0XHRcdFx0d2lkdGg6ICR7Y2VsbFJ1bkd1dHRlcn1weDtcblx0XHRcdFx0bGVmdDogJHtjb2RlQ2VsbExlZnRNYXJnaW59cHg7XG5cdFx0XHRcdG1hcmdpbi10b3A6ICR7SU5QVVRfRURJVE9SX1BBRERJTkcgLSAyfXB4O1xuXHRcdFx0fVxuXHRcdGApO1xuXG5cdFx0dGhpcy5fc3R5bGVFbGVtZW50LnRleHRDb250ZW50ID0gc3R5bGVTaGVldHMuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlRWRpdG9yT3B0aW9ucygpOiBJRWRpdG9yT3B0aW9ucyB7XG5cdFx0bGV0IG92ZXJyaWRlSWRlbnRpZmllcjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0KSB7XG5cdFx0XHRvdmVycmlkZUlkZW50aWZpZXIgPSB0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LmdldE1vZGVsKCk/LmdldExhbmd1YWdlSWQoKTtcblx0XHR9XG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9ucyA9IGRlZXBDbG9uZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRWRpdG9yT3B0aW9ucz4oJ2VkaXRvcicsIHsgb3ZlcnJpZGVJZGVudGlmaWVyIH0pKTtcblx0XHRjb25zdCBlZGl0b3JPcHRpb25zT3ZlcnJpZGUgPSBnZXRTaW1wbGVFZGl0b3JPcHRpb25zKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjb21wdXRlZCA9IE9iamVjdC5mcmVlemUoe1xuXHRcdFx0Li4uZWRpdG9yT3B0aW9ucyxcblx0XHRcdC4uLmVkaXRvck9wdGlvbnNPdmVycmlkZSxcblx0XHRcdC4uLntcblx0XHRcdFx0Z2x5cGhNYXJnaW46IHRydWUsXG5cdFx0XHRcdHBhZGRpbmc6IHtcblx0XHRcdFx0XHR0b3A6IElOUFVUX0VESVRPUl9QQURESU5HLFxuXHRcdFx0XHRcdGJvdHRvbTogSU5QVVRfRURJVE9SX1BBRERJTkdcblx0XHRcdFx0fSxcblx0XHRcdFx0aG92ZXI6IHtcblx0XHRcdFx0XHRlbmFibGVkOiAnb24nIGFzIGNvbnN0XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJ1bGVyczogW11cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiBjb21wdXRlZDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2F2ZUVkaXRvclZpZXdTdGF0ZSh0aGlzLmlucHV0KTtcblx0XHRzdXBlci5zYXZlU3RhdGUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFZpZXdTdGF0ZSgpOiBJbnRlcmFjdGl2ZUVkaXRvclZpZXdTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaW5wdXQgPSB0aGlzLmlucHV0O1xuXHRcdGlmICghKGlucHV0IGluc3RhbmNlb2YgSW50ZXJhY3RpdmVFZGl0b3JJbnB1dCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2F2ZUVkaXRvclZpZXdTdGF0ZShpbnB1dCk7XG5cdFx0cmV0dXJuIHRoaXMuX2xvYWROb3RlYm9va0VkaXRvclZpZXdTdGF0ZShpbnB1dCk7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlRWRpdG9yVmlld1N0YXRlKGlucHV0OiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSAmJiBpbnB1dCBpbnN0YW5jZW9mIEludGVyYWN0aXZlRWRpdG9ySW5wdXQpIHtcblx0XHRcdGlmICh0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZS5nZXRFZGl0b3JWaWV3U3RhdGUoKTtcblx0XHRcdGNvbnN0IGVkaXRvclN0YXRlID0gdGhpcy5fY29kZUVkaXRvcldpZGdldC5zYXZlVmlld1N0YXRlKCk7XG5cdFx0XHR0aGlzLl9lZGl0b3JNZW1lbnRvLnNhdmVFZGl0b3JTdGF0ZSh0aGlzLmdyb3VwLCBpbnB1dC5ub3RlYm9va0VkaXRvcklucHV0LnJlc291cmNlLCB7XG5cdFx0XHRcdG5vdGVib29rOiBzdGF0ZSxcblx0XHRcdFx0aW5wdXQ6IGVkaXRvclN0YXRlXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9sb2FkTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUoaW5wdXQ6IEludGVyYWN0aXZlRWRpdG9ySW5wdXQpOiBJbnRlcmFjdGl2ZUVkaXRvclZpZXdTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fZWRpdG9yTWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGhpcy5ncm91cCwgaW5wdXQubm90ZWJvb2tFZGl0b3JJbnB1dC5yZXNvdXJjZSk7XG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Ly8gd2hlbiB3ZSBkb24ndCBoYXZlIGEgdmlldyBzdGF0ZSBmb3IgdGhlIGdyb3VwL2lucHV0LXR1cGxlIHRoZW4gd2UgdHJ5IHRvIHVzZSBhbiBleGlzdGluZ1xuXHRcdC8vIGVkaXRvciBmb3IgdGhlIHNhbWUgcmVzb3VyY2UuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLl9lZGl0b3JHcm91cFNlcnZpY2UuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKSkge1xuXHRcdFx0aWYgKGdyb3VwLmFjdGl2ZUVkaXRvclBhbmUgIT09IHRoaXMgJiYgZ3JvdXAuYWN0aXZlRWRpdG9yUGFuZSA9PT0gdGhpcyAmJiBncm91cC5hY3RpdmVFZGl0b3I/Lm1hdGNoZXMoaW5wdXQpKSB7XG5cdFx0XHRcdGNvbnN0IG5vdGVib29rID0gdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/LmdldEVkaXRvclZpZXdTdGF0ZSgpO1xuXHRcdFx0XHRjb25zdCBpbnB1dCA9IHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuc2F2ZVZpZXdTdGF0ZSgpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG5vdGVib29rLFxuXHRcdFx0XHRcdGlucHV0XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNldElucHV0KGlucHV0OiBJbnRlcmFjdGl2ZUVkaXRvcklucHV0LCBvcHRpb25zOiBJbnRlcmFjdGl2ZUVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgbm90ZWJvb2tJbnB1dCA9IGlucHV0Lm5vdGVib29rRWRpdG9ySW5wdXQ7XG5cblx0XHQvLyB0aGVyZSBjdXJyZW50bHkgaXMgYSB3aWRnZXQgd2hpY2ggd2Ugc3RpbGwgb3duIHNvXG5cdFx0Ly8gd2UgbmVlZCB0byBoaWRlIGl0IGJlZm9yZSBnZXR0aW5nIGEgbmV3IHdpZGdldFxuXHRcdHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlPy5vbldpbGxIaWRlKCk7XG5cblx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Py5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuY2xlYXIoKTtcblxuXHRcdHRoaXMuX25vdGVib29rV2lkZ2V0ID0gPElCb3Jyb3dWYWx1ZTxOb3RlYm9va0VkaXRvcldpZGdldD4+dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24odGhpcy5fbm90ZWJvb2tXaWRnZXRTZXJ2aWNlLnJldHJpZXZlV2lkZ2V0LCB0aGlzLmdyb3VwLmlkLCBub3RlYm9va0lucHV0LCB7XG5cdFx0XHRpc1JlcGxIaXN0b3J5OiB0cnVlLFxuXHRcdFx0aXNSZWFkT25seTogdHJ1ZSxcblx0XHRcdGNvbnRyaWJ1dGlvbnM6IE5vdGVib29rRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldFNvbWVFZGl0b3JDb250cmlidXRpb25zKFtcblx0XHRcdFx0RXhlY3V0aW9uU3RhdGVDZWxsU3RhdHVzQmFyQ29udHJpYi5pZCxcblx0XHRcdFx0VGltZXJDZWxsU3RhdHVzQmFyQ29udHJpYi5pZCxcblx0XHRcdFx0Tm90ZWJvb2tGaW5kQ29udHJpYi5pZFxuXHRcdFx0XSksXG5cdFx0XHRtZW51SWRzOiB7XG5cdFx0XHRcdG5vdGVib29rVG9vbGJhcjogTWVudUlkLkludGVyYWN0aXZlVG9vbGJhcixcblx0XHRcdFx0Y2VsbFRpdGxlVG9vbGJhcjogTWVudUlkLkludGVyYWN0aXZlQ2VsbFRpdGxlLFxuXHRcdFx0XHRjZWxsRGVsZXRlVG9vbGJhcjogTWVudUlkLkludGVyYWN0aXZlQ2VsbERlbGV0ZSxcblx0XHRcdFx0Y2VsbEluc2VydFRvb2xiYXI6IE1lbnVJZC5Ob3RlYm9va0NlbGxCZXR3ZWVuLFxuXHRcdFx0XHRjZWxsVG9wSW5zZXJ0VG9vbGJhcjogTWVudUlkLk5vdGVib29rQ2VsbExpc3RUb3AsXG5cdFx0XHRcdGNlbGxFeGVjdXRlVG9vbGJhcjogTWVudUlkLkludGVyYWN0aXZlQ2VsbEV4ZWN1dGUsXG5cdFx0XHRcdGNlbGxFeGVjdXRlUHJpbWFyeTogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdFx0Y2VsbEVkaXRvckNvbnRyaWJ1dGlvbnM6IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRTb21lRWRpdG9yQ29udHJpYnV0aW9ucyhbXG5cdFx0XHRcdFNlbGVjdGlvbkNsaXBib2FyZENvbnRyaWJ1dGlvbklELFxuXHRcdFx0XHRDb250ZXh0TWVudUNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdENvbnRlbnRIb3ZlckNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdEdseXBoSG92ZXJDb250cm9sbGVyLklELFxuXHRcdFx0XHRNYXJrZXJDb250cm9sbGVyLklEXG5cdFx0XHRdKSxcblx0XHRcdG9wdGlvbnM6IHRoaXMuX25vdGVib29rT3B0aW9ucyxcblx0XHRcdGNvZGVXaW5kb3c6IHRoaXMud2luZG93XG5cdFx0fSwgdW5kZWZpbmVkLCB0aGlzLndpbmRvdyk7XG5cblx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUVkaXRvcldpZGdldCwgdGhpcy5faW5wdXRFZGl0b3JDb250YWluZXIsIHRoaXMuX2VkaXRvck9wdGlvbnMsIHtcblx0XHRcdC4uLntcblx0XHRcdFx0aXNTaW1wbGVXaWRnZXQ6IGZhbHNlLFxuXHRcdFx0XHRjb250cmlidXRpb25zOiBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0U29tZUVkaXRvckNvbnRyaWJ1dGlvbnMoW1xuXHRcdFx0XHRcdE1lbnVQcmV2ZW50ZXIuSUQsXG5cdFx0XHRcdFx0U2VsZWN0aW9uQ2xpcGJvYXJkQ29udHJpYnV0aW9uSUQsXG5cdFx0XHRcdFx0Q29udGV4dE1lbnVDb250cm9sbGVyLklELFxuXHRcdFx0XHRcdFN1Z2dlc3RDb250cm9sbGVyLklELFxuXHRcdFx0XHRcdFBhcmFtZXRlckhpbnRzQ29udHJvbGxlci5JRCxcblx0XHRcdFx0XHRTbmlwcGV0Q29udHJvbGxlcjIuSUQsXG5cdFx0XHRcdFx0VGFiQ29tcGxldGlvbkNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdFx0Q29udGVudEhvdmVyQ29udHJvbGxlci5JRCxcblx0XHRcdFx0XHRHbHlwaEhvdmVyQ29udHJvbGxlci5JRCxcblx0XHRcdFx0XHRNYXJrZXJDb250cm9sbGVyLklELFxuXHRcdFx0XHRcdElOTElORV9DSEFUX0lELFxuXHRcdFx0XHRdKVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zKSB7XG5cdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvckNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHt0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucy5kaW1lbnNpb24uaGVpZ2h0IC0gdGhpcy5pbnB1dENlbGxDb250YWluZXJIZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUhLmxheW91dChuZXcgRE9NLkRpbWVuc2lvbih0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucy5kaW1lbnNpb24ud2lkdGgsIHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLmRpbWVuc2lvbi5oZWlnaHQgLSB0aGlzLmlucHV0Q2VsbENvbnRhaW5lckhlaWdodCksIHRoaXMuX25vdGVib29rRWRpdG9yQ29udGFpbmVyKTtcblx0XHRcdGNvbnN0IGxlZnRNYXJnaW4gPSB0aGlzLl9ub3RlYm9va09wdGlvbnMuZ2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW4oKTtcblx0XHRcdGNvbnN0IG1heEhlaWdodCA9IE1hdGgubWluKHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLmRpbWVuc2lvbi5oZWlnaHQgLyAyLCB0aGlzLmlucHV0Q2VsbEVkaXRvckhlaWdodCk7XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LmxheW91dCh0aGlzLl92YWxpZGF0ZURpbWVuc2lvbih0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucy5kaW1lbnNpb24ud2lkdGggLSBsZWZ0TWFyZ2luIC0gSU5QVVRfQ0VMTF9IT1JJWk9OVEFMX1BBRERJTkdfUklHSFQsIG1heEhlaWdodCkpO1xuXHRcdFx0dGhpcy5faW5wdXRGb2N1c0luZGljYXRvci5zdHlsZS5oZWlnaHQgPSBgJHt0aGlzLmlucHV0Q2VsbEVkaXRvckhlaWdodH1weGA7XG5cdFx0XHR0aGlzLl9pbnB1dENlbGxDb250YWluZXIuc3R5bGUudG9wID0gYCR7dGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMuZGltZW5zaW9uLmhlaWdodCAtIHRoaXMuaW5wdXRDZWxsQ29udGFpbmVySGVpZ2h0fXB4YDtcblx0XHRcdHRoaXMuX2lucHV0Q2VsbENvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3RoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLmRpbWVuc2lvbi53aWR0aH1weGA7XG5cdFx0fVxuXG5cdFx0YXdhaXQgc3VwZXIuc2V0SW5wdXQoaW5wdXQsIG9wdGlvbnMsIGNvbnRleHQsIHRva2VuKTtcblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IGlucHV0LnJlc29sdmUoKTtcblx0XHRpZiAodGhpcy5fcnVuYnV0dG9uVG9vbGJhcikge1xuXHRcdFx0dGhpcy5fcnVuYnV0dG9uVG9vbGJhci5jb250ZXh0ID0gaW5wdXQucmVzb3VyY2U7XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsID09PSBudWxsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RoZSBJbnRlcmFjdGl2ZSBXaW5kb3cgbW9kZWwgY291bGQgbm90IGJlIHJlc29sdmVkJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/LnNldFBhcmVudENvbnRleHRLZXlTZXJ2aWNlKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHZpZXdTdGF0ZSA9IG9wdGlvbnM/LnZpZXdTdGF0ZSA/PyB0aGlzLl9sb2FkTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUoaW5wdXQpO1xuXHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0YXdhaXQgdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUhLnNldE1vZGVsKG1vZGVsLm5vdGVib29rLCB2aWV3U3RhdGU/Lm5vdGVib29rKTtcblx0XHRtb2RlbC5ub3RlYm9vay5zZXRDZWxsQ29sbGFwc2VEZWZhdWx0KHRoaXMuX25vdGVib29rT3B0aW9ucy5nZXRDZWxsQ29sbGFwc2VEZWZhdWx0KCkpO1xuXHRcdHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5zZXRPcHRpb25zKHtcblx0XHRcdGlzUmVhZE9ubHk6IHRydWVcblx0XHR9KTtcblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5vbkRpZFJlc2l6ZU91dHB1dCgoY3ZtKSA9PiB7XG5cdFx0XHR0aGlzLl9zY3JvbGxJZk5lY2Vzc2FyeShjdm0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5vbkRpZEZvY3VzV2lkZ2V0KCgpID0+IHRoaXMuX29uRGlkRm9jdXNXaWRnZXQuZmlyZSgpKSk7XG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9ub3RlYm9va09wdGlvbnMub25EaWRDaGFuZ2VPcHRpb25zKGUgPT4ge1xuXHRcdFx0aWYgKGUuY29tcGFjdFZpZXcgfHwgZS5mb2N1c0luZGljYXRvcikge1xuXHRcdFx0XHQvLyB1cGRhdGUgdGhlIHN0eWxpbmdcblx0XHRcdFx0dGhpcy5fc3R5bGVFbGVtZW50Py5yZW1vdmUoKTtcblx0XHRcdFx0dGhpcy5fY3JlYXRlTGF5b3V0U3R5bGVzKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucyAmJiB0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zLmRpbWVuc2lvbiwgdGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMucG9zaXRpb24pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5pbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzKSB7XG5cdFx0XHRcdG1vZGVsLm5vdGVib29rLnNldENlbGxDb2xsYXBzZURlZmF1bHQodGhpcy5fbm90ZWJvb2tPcHRpb25zLmdldENlbGxDb2xsYXBzZURlZmF1bHQoKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlPy5hY3RpdmVLZXJuZWw/LnN1cHBvcnRlZExhbmd1YWdlc1swXSA/PyBpbnB1dC5sYW5ndWFnZSA/PyBQTEFJTlRFWFRfTEFOR1VBR0VfSUQ7XG5cdFx0Y29uc3QgZWRpdG9yTW9kZWwgPSBhd2FpdCBpbnB1dC5yZXNvbHZlSW5wdXQobGFuZ3VhZ2VJZCk7XG5cdFx0ZWRpdG9yTW9kZWwuc2V0TGFuZ3VhZ2UobGFuZ3VhZ2VJZCk7XG5cdFx0dGhpcy5fY29kZUVkaXRvcldpZGdldC5zZXRNb2RlbChlZGl0b3JNb2RlbCk7XG5cdFx0aWYgKHZpZXdTdGF0ZT8uaW5wdXQpIHtcblx0XHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQucmVzdG9yZVZpZXdTdGF0ZSh2aWV3U3RhdGUuaW5wdXQpO1xuXHRcdH1cblx0XHR0aGlzLl9lZGl0b3JPcHRpb25zID0gdGhpcy5fY29tcHV0ZUVkaXRvck9wdGlvbnMoKTtcblx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LnVwZGF0ZU9wdGlvbnModGhpcy5fZWRpdG9yT3B0aW9ucyk7XG5cblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQub25EaWRGb2N1c0VkaXRvcldpZGdldCgoKSA9PiB0aGlzLl9vbkRpZEZvY3VzV2lkZ2V0LmZpcmUoKSkpO1xuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fY29kZUVkaXRvcldpZGdldC5vbkRpZENvbnRlbnRTaXplQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKCFlLmNvbnRlbnRIZWlnaHRDaGFuZ2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zKSB7XG5cdFx0XHRcdHRoaXMuX2xheW91dFdpZGdldHModGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMuZGltZW5zaW9uLCB0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucy5wb3NpdGlvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Lm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24oZSA9PiB0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKHsgcmVhc29uOiB0aGlzLl90b0VkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24oZSkgfSkpKTtcblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZmlyZSh7IHJlYXNvbjogRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbi5FRElUIH0pKSk7XG5cblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlTm90ZWJvb2tBZmZpbml0eSh0aGlzLl9zeW5jV2l0aEtlcm5lbCwgdGhpcykpO1xuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlU2VsZWN0ZWROb3RlYm9va3ModGhpcy5fc3luY1dpdGhLZXJuZWwsIHRoaXMpKTtcblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUlucHV0SGludCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fY29kZUVkaXRvcldpZGdldC5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVJbnB1dEhpbnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQub25EaWRDaGFuZ2VNb2RlbERlY29yYXRpb25zKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUlucHV0SGludCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fY29kZUVkaXRvcldpZGdldC5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZUlucHV0SGludCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oUmVwbEVkaXRvclNldHRpbmdzLnNob3dFeGVjdXRpb25IaW50KSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVJbnB1dEhpbnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBjdXJzb3JBdEJvdW5kYXJ5Q29udGV4dCA9IElOVEVSQUNUSVZFX0lOUFVUX0NVUlNPUl9CT1VOREFSWS5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlmIChpbnB1dC5yZXNvdXJjZSAmJiBpbnB1dC5oaXN0b3J5U2VydmljZS5oYXMoaW5wdXQucmVzb3VyY2UpKSB7XG5cdFx0XHRjdXJzb3JBdEJvdW5kYXJ5Q29udGV4dC5zZXQoJ3RvcCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjdXJzb3JBdEJvdW5kYXJ5Q29udGV4dC5zZXQoJ25vbmUnKTtcblx0XHR9XG5cblx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoeyBwb3NpdGlvbiB9KSA9PiB7XG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Ll9nZXRWaWV3TW9kZWwoKSE7XG5cdFx0XHRjb25zdCBsYXN0TGluZU51bWJlciA9IHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRcdGNvbnN0IGxhc3RMaW5lQ29sID0gdmlld01vZGVsLmdldExpbmVMZW5ndGgobGFzdExpbmVOdW1iZXIpICsgMTtcblx0XHRcdGNvbnN0IHZpZXdQb3NpdGlvbiA9IHZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRcdGNvbnN0IGZpcnN0TGluZSA9IHZpZXdQb3NpdGlvbi5saW5lTnVtYmVyID09PSAxICYmIHZpZXdQb3NpdGlvbi5jb2x1bW4gPT09IDE7XG5cdFx0XHRjb25zdCBsYXN0TGluZSA9IHZpZXdQb3NpdGlvbi5saW5lTnVtYmVyID09PSBsYXN0TGluZU51bWJlciAmJiB2aWV3UG9zaXRpb24uY29sdW1uID09PSBsYXN0TGluZUNvbDtcblxuXHRcdFx0aWYgKGZpcnN0TGluZSkge1xuXHRcdFx0XHRpZiAobGFzdExpbmUpIHtcblx0XHRcdFx0XHRjdXJzb3JBdEJvdW5kYXJ5Q29udGV4dC5zZXQoJ2JvdGgnKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjdXJzb3JBdEJvdW5kYXJ5Q29udGV4dC5zZXQoJ3RvcCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAobGFzdExpbmUpIHtcblx0XHRcdFx0XHRjdXJzb3JBdEJvdW5kYXJ5Q29udGV4dC5zZXQoJ2JvdHRvbScpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGN1cnNvckF0Qm91bmRhcnlDb250ZXh0LnNldCgnbm9uZScpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZChlZGl0b3JNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBlZGl0b3JNb2RlbC5nZXRWYWx1ZSgpO1xuXHRcdFx0aWYgKHRoaXMuaW5wdXQ/LnJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gKHRoaXMuaW5wdXQgYXMgSW50ZXJhY3RpdmVFZGl0b3JJbnB1dCkuaGlzdG9yeVNlcnZpY2U7XG5cdFx0XHRcdGlmICghaGlzdG9yeVNlcnZpY2UubWF0Y2hlc0N1cnJlbnQodGhpcy5pbnB1dC5yZXNvdXJjZSwgdmFsdWUpKSB7XG5cdFx0XHRcdFx0aGlzdG9yeVNlcnZpY2UucmVwbGFjZUxhc3QodGhpcy5pbnB1dC5yZXNvdXJjZSwgdmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSEub25EaWRTY3JvbGwoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VTY3JvbGwuZmlyZSgpKSk7XG5cblx0XHR0aGlzLl9zeW5jV2l0aEtlcm5lbCgpO1xuXG5cdFx0dGhpcy5fdXBkYXRlSW5wdXRIaW50KCk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRPcHRpb25zKG9wdGlvbnM6IElOb3RlYm9va0VkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8uc2V0T3B0aW9ucyhvcHRpb25zKTtcblx0XHRzdXBlci5zZXRPcHRpb25zKG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9FZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uKGU6IElDdXJzb3JQb3NpdGlvbkNoYW5nZWRFdmVudCk6IEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24ge1xuXHRcdHN3aXRjaCAoZS5zb3VyY2UpIHtcblx0XHRcdGNhc2UgVGV4dEVkaXRvclNlbGVjdGlvblNvdXJjZS5QUk9HUkFNTUFUSUM6IHJldHVybiBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLlBST0dSQU1NQVRJQztcblx0XHRcdGNhc2UgVGV4dEVkaXRvclNlbGVjdGlvblNvdXJjZS5OQVZJR0FUSU9OOiByZXR1cm4gRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbi5OQVZJR0FUSU9OO1xuXHRcdFx0Y2FzZSBUZXh0RWRpdG9yU2VsZWN0aW9uU291cmNlLkpVTVA6IHJldHVybiBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLkpVTVA7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbi5VU0VSO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NlbGxBdEJvdHRvbShjZWxsOiBJQ2VsbFZpZXdNb2RlbCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHZpc2libGVSYW5nZXMgPSB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8udmlzaWJsZVJhbmdlcyB8fCBbXTtcblx0XHRjb25zdCBjZWxsSW5kZXggPSB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8uZ2V0Q2VsbEluZGV4KGNlbGwpO1xuXHRcdGlmIChjZWxsSW5kZXggPT09IE1hdGgubWF4KC4uLnZpc2libGVSYW5nZXMubWFwKHJhbmdlID0+IHJhbmdlLmVuZCAtIDEpKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX3Njcm9sbElmTmVjZXNzYXJ5KGN2bTogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5nZXRDZWxsSW5kZXgoY3ZtKTtcblx0XHRpZiAoaW5kZXggPT09IHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlIS5nZXRMZW5ndGgoKSAtIDEpIHtcblx0XHRcdC8vIElmIHdlJ3JlIGFscmVhZHkgYXQgdGhlIGJvdHRvbSBvciBhdXRvIHNjcm9sbCBpcyBlbmFibGVkLCBzY3JvbGwgdG8gdGhlIGJvdHRvbVxuXHRcdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlcGxFZGl0b3JTZXR0aW5ncy5pbnRlcmFjdGl2ZVdpbmRvd0Fsd2F5c1Njcm9sbE9uTmV3Q2VsbCkgfHwgdGhpcy5fY2VsbEF0Qm90dG9tKGN2bSkpIHtcblx0XHRcdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUhLnNjcm9sbFRvQm90dG9tKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3luY1dpdGhLZXJuZWwoKSB7XG5cdFx0Y29uc3Qgbm90ZWJvb2sgPSB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8udGV4dE1vZGVsO1xuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuZ2V0TW9kZWwoKTtcblxuXHRcdGlmIChub3RlYm9vayAmJiB0ZXh0TW9kZWwpIHtcblx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2UuZ2V0TWF0Y2hpbmdLZXJuZWwobm90ZWJvb2spO1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRPclN1Z2dlc3RlZCA9IGluZm8uc2VsZWN0ZWRcblx0XHRcdFx0Pz8gKGluZm8uc3VnZ2VzdGlvbnMubGVuZ3RoID09PSAxID8gaW5mby5zdWdnZXN0aW9uc1swXSA6IHVuZGVmaW5lZClcblx0XHRcdFx0Pz8gKGluZm8uYWxsLmxlbmd0aCA9PT0gMSA/IGluZm8uYWxsWzBdIDogdW5kZWZpbmVkKTtcblxuXHRcdFx0aWYgKHNlbGVjdGVkT3JTdWdnZXN0ZWQpIHtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2UgPSBzZWxlY3RlZE9yU3VnZ2VzdGVkLnN1cHBvcnRlZExhbmd1YWdlc1swXTtcblx0XHRcdFx0Ly8gQWxsIGtlcm5lbHMgd2lsbCBpbml0aWFsbHkgbGlzdCBwbGFpbnRleHQgYXMgdGhlIHN1cHBvcnRlZCBsYW5ndWFnZSBiZWZvcmUgdGhleSBwcm9wZXJseSBpbml0aWFsaXplZC5cblx0XHRcdFx0aWYgKGxhbmd1YWdlICYmIGxhbmd1YWdlICE9PSAncGxhaW50ZXh0Jykge1xuXHRcdFx0XHRcdGNvbnN0IG5ld01vZGUgPSB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZChsYW5ndWFnZSkubGFuZ3VhZ2VJZDtcblx0XHRcdFx0XHR0ZXh0TW9kZWwuc2V0TGFuZ3VhZ2UobmV3TW9kZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHROT1RFQk9PS19LRVJORUwuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKS5zZXQoc2VsZWN0ZWRPclN1Z2dlc3RlZC5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogRE9NLkRpbWVuc2lvbiwgcG9zaXRpb246IERPTS5JRG9tUG9zaXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9yb290RWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdtaWQtd2lkdGgnLCBkaW1lbnNpb24ud2lkdGggPCAxMDAwICYmIGRpbWVuc2lvbi53aWR0aCA+PSA2MDApO1xuXHRcdHRoaXMuX3Jvb3RFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ25hcnJvdy13aWR0aCcsIGRpbWVuc2lvbi53aWR0aCA8IDYwMCk7XG5cdFx0Y29uc3QgZWRpdG9ySGVpZ2h0Q2hhbmdlZCA9IGRpbWVuc2lvbi5oZWlnaHQgIT09IHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zPy5kaW1lbnNpb24uaGVpZ2h0O1xuXHRcdHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zID0geyBkaW1lbnNpb24sIHBvc2l0aW9uIH07XG5cblx0XHRpZiAoIXRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvckhlaWdodENoYW5nZWQgJiYgdGhpcy5fY29kZUVkaXRvcldpZGdldCkge1xuXHRcdFx0U3VnZ2VzdENvbnRyb2xsZXIuZ2V0KHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQpPy5jYW5jZWxTdWdnZXN0V2lkZ2V0KCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3JDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7dGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMuZGltZW5zaW9uLmhlaWdodCAtIHRoaXMuaW5wdXRDZWxsQ29udGFpbmVySGVpZ2h0fXB4YDtcblx0XHR0aGlzLl9sYXlvdXRXaWRnZXRzKGRpbWVuc2lvbiwgcG9zaXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0V2lkZ2V0cyhkaW1lbnNpb246IERPTS5EaW1lbnNpb24sIHBvc2l0aW9uOiBET00uSURvbVBvc2l0aW9uKSB7XG5cdFx0Y29uc3QgY29udGVudEhlaWdodCA9IHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuaGFzTW9kZWwoKSA/IHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQuZ2V0Q29udGVudEhlaWdodCgpIDogdGhpcy5pbnB1dENlbGxFZGl0b3JIZWlnaHQ7XG5cdFx0Y29uc3QgbWF4SGVpZ2h0ID0gTWF0aC5taW4oZGltZW5zaW9uLmhlaWdodCAvIDIsIGNvbnRlbnRIZWlnaHQpO1xuXHRcdGNvbnN0IGxlZnRNYXJnaW4gPSB0aGlzLl9ub3RlYm9va09wdGlvbnMuZ2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW4oKTtcblxuXHRcdGNvbnN0IGlucHV0Q2VsbENvbnRhaW5lckhlaWdodCA9IG1heEhlaWdodCArIElOUFVUX0NFTExfVkVSVElDQUxfUEFERElORyAqIDI7XG5cdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3JDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7ZGltZW5zaW9uLmhlaWdodCAtIGlucHV0Q2VsbENvbnRhaW5lckhlaWdodH1weGA7XG5cblx0XHR0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZSEubGF5b3V0KGRpbWVuc2lvbi53aXRoKGRpbWVuc2lvbi53aWR0aCwgZGltZW5zaW9uLmhlaWdodCAtIGlucHV0Q2VsbENvbnRhaW5lckhlaWdodCksIHRoaXMuX25vdGVib29rRWRpdG9yQ29udGFpbmVyLCBwb3NpdGlvbik7XG5cdFx0dGhpcy5fY29kZUVkaXRvcldpZGdldC5sYXlvdXQodGhpcy5fdmFsaWRhdGVEaW1lbnNpb24oZGltZW5zaW9uLndpZHRoIC0gbGVmdE1hcmdpbiAtIElOUFVUX0NFTExfSE9SSVpPTlRBTF9QQURESU5HX1JJR0hULCBtYXhIZWlnaHQpKTtcblx0XHR0aGlzLl9pbnB1dEZvY3VzSW5kaWNhdG9yLnN0eWxlLmhlaWdodCA9IGAke2NvbnRlbnRIZWlnaHR9cHhgO1xuXHRcdHRoaXMuX2lucHV0Q2VsbENvbnRhaW5lci5zdHlsZS50b3AgPSBgJHtkaW1lbnNpb24uaGVpZ2h0IC0gaW5wdXRDZWxsQ29udGFpbmVySGVpZ2h0fXB4YDtcblx0XHR0aGlzLl9pbnB1dENlbGxDb250YWluZXIuc3R5bGUud2lkdGggPSBgJHtkaW1lbnNpb24ud2lkdGh9cHhgO1xuXHR9XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVEaW1lbnNpb24od2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcblx0XHRyZXR1cm4gbmV3IERPTS5EaW1lbnNpb24oTWF0aC5tYXgoMCwgd2lkdGgpLCBNYXRoLm1heCgwLCBoZWlnaHQpKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhc0NvbmZsaWN0aW5nRGVjb3JhdGlvbigpIHtcblx0XHRyZXR1cm4gQm9vbGVhbih0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LmdldExpbmVEZWNvcmF0aW9ucygxKT8uZmluZCgoZCkgPT5cblx0XHRcdGQub3B0aW9ucy5iZWZvcmVDb250ZW50Q2xhc3NOYW1lXG5cdFx0XHR8fCBkLm9wdGlvbnMuYWZ0ZXJDb250ZW50Q2xhc3NOYW1lXG5cdFx0XHR8fCBkLm9wdGlvbnMuYmVmb3JlPy5jb250ZW50XG5cdFx0XHR8fCBkLm9wdGlvbnMuYWZ0ZXI/LmNvbnRlbnRcblx0XHQpKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUlucHV0SGludCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvZGVFZGl0b3JXaWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzaG91bGRIaWRlID1cblx0XHRcdCF0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0Lmhhc01vZGVsKCkgfHxcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlcGxFZGl0b3JTZXR0aW5ncy5zaG93RXhlY3V0aW9uSGludCkgPT09IGZhbHNlIHx8XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LmdldE1vZGVsKCkhLmdldFZhbHVlTGVuZ3RoKCkgIT09IDAgfHxcblx0XHRcdHRoaXMuX2hhc0NvbmZsaWN0aW5nRGVjb3JhdGlvbigpO1xuXG5cdFx0aWYgKCF0aGlzLl9oaW50RWxlbWVudCAmJiAhc2hvdWxkSGlkZSkge1xuXHRcdFx0dGhpcy5faGludEVsZW1lbnQgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXBsSW5wdXRIaW50Q29udGVudFdpZGdldCwgdGhpcy5fY29kZUVkaXRvcldpZGdldCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9oaW50RWxlbWVudCAmJiBzaG91bGRIaWRlKSB7XG5cdFx0XHR0aGlzLl9oaW50RWxlbWVudC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9oaW50RWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRnZXRTY3JvbGxQb3NpdGlvbigpOiBJRWRpdG9yUGFuZVNjcm9sbFBvc2l0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Nyb2xsVG9wOiB0aGlzLl9ub3RlYm9va1dpZGdldC52YWx1ZT8uc2Nyb2xsVG9wID8/IDAsXG5cdFx0XHRzY3JvbGxMZWZ0OiAwXG5cdFx0fTtcblx0fVxuXG5cdHNldFNjcm9sbFBvc2l0aW9uKHBvc2l0aW9uOiBJRWRpdG9yUGFuZVNjcm9sbFBvc2l0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWU/LnNldFNjcm9sbFRvcChwb3NpdGlvbi5zY3JvbGxUb3ApO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKSB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblxuXHRcdHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlPy5vblNob3coKTtcblx0XHR0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LmZvY3VzKCk7XG5cdH1cblxuXHRmb2N1c0hpc3RvcnkoKSB7XG5cdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUhLmZvY3VzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlKTtcblx0XHR0aGlzLl9ncm91cExpc3RlbmVyLnZhbHVlID0gdGhpcy5ncm91cC5vbldpbGxDbG9zZUVkaXRvcihlID0+IHRoaXMuX3NhdmVFZGl0b3JWaWV3U3RhdGUoZS5lZGl0b3IpKTtcblxuXHRcdGlmICghdmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fc2F2ZUVkaXRvclZpZXdTdGF0ZSh0aGlzLmlucHV0KTtcblx0XHRcdGlmICh0aGlzLmlucHV0ICYmIHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlLm9uV2lsbEhpZGUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVJbnB1dEhpbnQoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNsZWFySW5wdXQoKSB7XG5cdFx0aWYgKHRoaXMuX25vdGVib29rV2lkZ2V0LnZhbHVlKSB7XG5cdFx0XHR0aGlzLl9zYXZlRWRpdG9yVmlld1N0YXRlKHRoaXMuaW5wdXQpO1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUub25XaWxsSGlkZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvZGVFZGl0b3JXaWRnZXQ/LmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuX25vdGVib29rV2lkZ2V0ID0geyB2YWx1ZTogdW5kZWZpbmVkIH07XG5cdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmNsZWFyKCk7XG5cblx0XHRzdXBlci5jbGVhcklucHV0KCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRDb250cm9sKCk6IFJlcGxFZGl0b3JDb250cm9sICYgSUNvbXBvc2l0ZUNvZGVFZGl0b3Ige1xuXHRcdHJldHVybiB7XG5cdFx0XHRub3RlYm9va0VkaXRvcjogdGhpcy5fbm90ZWJvb2tXaWRnZXQudmFsdWUsXG5cdFx0XHRhY3RpdmVDb2RlRWRpdG9yOiB0aGlzLl9jb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdFx0b25EaWRDaGFuZ2VBY3RpdmVFZGl0b3I6IEV2ZW50Lk5vbmVcblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsWUFBWSxvQkFBb0I7QUFFaEMsU0FBUyxTQUFTLGFB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
