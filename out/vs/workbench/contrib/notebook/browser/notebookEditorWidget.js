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
import "./media/notebook.css";
import "./media/notebookCellChat.css";
import "./media/notebookCellEditorHint.css";
import "./media/notebookCellInsertToolbar.css";
import "./media/notebookCellStatusBar.css";
import "./media/notebookCellTitleToolbar.css";
import "./media/notebookFocusIndicator.css";
import "./media/notebookToolbar.css";
import "./media/notebookDnd.css";
import "./media/notebookFolding.css";
import "./media/notebookCellOutput.css";
import "./media/notebookEditorStickyScroll.css";
import "./media/notebookKernelActionViewItem.css";
import "./media/notebookOutline.css";
import "./media/notebookChatEditController.css";
import "./media/notebookChatEditorOverlay.css";
import * as DOM from "../../../../base/browser/dom.js";
import * as domStylesheets from "../../../../base/browser/domStylesheets.js";
import { OverlayLayoutElement } from "../../../../base/browser/overlayLayoutElement.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { SequencerByKey } from "../../../../base/common/async.js";
import { Color, RGBA } from "../../../../base/common/color.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { combinedDisposable, Disposable, DisposableStore, dispose, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { setTimeout0 } from "../../../../base/common/platform.js";
import { extname, isEqual } from "../../../../base/common/resources.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { FontMeasurements } from "../../../../editor/browser/config/fontMeasurements.js";
import { createBareFontInfoFromRawSettings } from "../../../../editor/common/config/fontInfoFromSettings.js";
import { Range } from "../../../../editor/common/core/range.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import * as nls from "../../../../nls.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IWorkbenchLayoutService, Parts } from "../../../services/layout/browser/layoutService.js";
import { registerZIndex, ZIndex } from "../../../../platform/layout/browser/zIndexRegistry.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { contrastBorder, errorForeground, focusBorder, foreground, listInactiveSelectionBackground, registerColor, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, transparent } from "../../../../platform/theme/common/colorRegistry.js";
import { EDITOR_PANE_BACKGROUND, PANEL_BORDER, SIDE_BAR_BACKGROUND } from "../../../common/theme.js";
import { debugIconStartForeground } from "../../debug/browser/debugColors.js";
import { CellEditState, CellFocusMode, CellRevealRangeType, CellRevealType, RenderOutputType, ScrollToRevealBehavior } from "./notebookBrowser.js";
import { NotebookEditorExtensionsRegistry } from "./notebookEditorExtensions.js";
import { INotebookEditorService } from "./services/notebookEditorService.js";
import { notebookDebug } from "./notebookLogger.js";
import { NotebookLayoutChangedEvent } from "./notebookViewEvents.js";
import { CellContextKeyManager } from "./view/cellParts/cellContextKeys.js";
import { CellDragAndDropController } from "./view/cellParts/cellDnd.js";
import { ListViewInfoAccessor, NotebookCellList, NOTEBOOK_WEBVIEW_BOUNDARY } from "./view/notebookCellList.js";
import { BackLayerWebView } from "./view/renderers/backLayerWebView.js";
import { CodeCellRenderer, MarkupCellRenderer, NotebookCellListDelegate } from "./view/renderers/cellRenderer.js";
import { CodeCellViewModel, outputDisplayLimit } from "./viewModel/codeCellViewModel.js";
import { NotebookEventDispatcher } from "./viewModel/eventDispatcher.js";
import { MarkupCellViewModel } from "./viewModel/markupCellViewModel.js";
import { NotebookViewModel } from "./viewModel/notebookViewModelImpl.js";
import { ViewContext } from "./viewModel/viewContext.js";
import { NotebookEditorWorkbenchToolbar } from "./viewParts/notebookEditorToolbar.js";
import { NotebookEditorContextKeys } from "./viewParts/notebookEditorWidgetContextKeys.js";
import { NotebookOverviewRuler } from "./viewParts/notebookOverviewRuler.js";
import { ListTopCellToolbar } from "./viewParts/notebookTopCellToolbar.js";
import { CellEditType, CellKind, NotebookFindScopeType, RENDERER_NOT_AVAILABLE, SelectionStateType } from "../common/notebookCommon.js";
import { NOTEBOOK_CURSOR_NAVIGATION_MODE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED, NOTEBOOK_OUTPUT_INPUT_FOCUSED } from "../common/notebookContextKeys.js";
import { INotebookExecutionService } from "../common/notebookExecutionService.js";
import { INotebookKernelService } from "../common/notebookKernelService.js";
import { NotebookOptions, OutputInnerContainerTopPadding } from "./notebookOptions.js";
import { cellRangesToIndexes } from "../common/notebookRange.js";
import { INotebookRendererMessagingService } from "../common/notebookRendererMessagingService.js";
import { INotebookService } from "../common/notebookService.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { BaseCellEditorOptions } from "./viewModel/cellEditorOptions.js";
import { FloatingEditorClickMenu } from "../../../browser/codeeditor.js";
import { CellFindMatchModel } from "./contrib/find/findModel.js";
import { INotebookLoggingService } from "../common/notebookLoggingService.js";
import { Schemas } from "../../../../base/common/network.js";
import { DropIntoEditorController } from "../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js";
import { CopyPasteController } from "../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js";
import { NotebookStickyScroll } from "./viewParts/notebookEditorStickyScroll.js";
import { PixelRatio } from "../../../../base/browser/pixelRatio.js";
import { PreventDefaultContextMenuItemsContextKeyName } from "../../webview/browser/webview.contribution.js";
import { NotebookAccessibilityProvider } from "./notebookAccessibilityProvider.js";
import { NotebookHorizontalTracker } from "./viewParts/notebookHorizontalTracker.js";
import { NotebookCellEditorPool } from "./view/notebookCellEditorPool.js";
import { InlineCompletionsController } from "../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js";
import { NotebookCellLayoutManager } from "./notebookCellLayoutManager.js";
import { FloatingEditorToolbar } from "../../../../editor/contrib/floatingMenu/browser/floatingMenu.js";
const $ = DOM.$;
function getDefaultNotebookCreationOptions() {
  const skipContributions = [
    "editor.contrib.review",
    FloatingEditorClickMenu.ID,
    FloatingEditorToolbar.ID,
    "editor.contrib.dirtydiff",
    "editor.contrib.testingOutputPeek",
    "editor.contrib.testingDecorations",
    "store.contrib.stickyScrollController",
    "editor.contrib.findController",
    "editor.contrib.emptyTextEditorHint"
  ];
  const contributions = EditorExtensionsRegistry.getEditorContributions().filter((c) => skipContributions.indexOf(c.id) === -1);
  return {
    menuIds: {
      notebookToolbar: MenuId.NotebookToolbar,
      cellTitleToolbar: MenuId.NotebookCellTitle,
      cellDeleteToolbar: MenuId.NotebookCellDelete,
      cellInsertToolbar: MenuId.NotebookCellBetween,
      cellTopInsertToolbar: MenuId.NotebookCellListTop,
      cellExecuteToolbar: MenuId.NotebookCellExecute,
      cellExecutePrimary: MenuId.NotebookCellExecutePrimary
    },
    cellEditorContributions: contributions
  };
}
let NotebookEditorWidget = class extends Disposable {
  constructor(creationOptions, dimension, instantiationService, editorGroupsService, notebookRendererMessaging, notebookEditorService, notebookKernelService, _notebookService, configurationService, contextKeyService, layoutService, contextMenuService, telemetryService, notebookExecutionService, editorProgressService, logService) {
    super();
    this.creationOptions = creationOptions;
    this.editorGroupsService = editorGroupsService;
    this.notebookRendererMessaging = notebookRendererMessaging;
    this.notebookEditorService = notebookEditorService;
    this.notebookKernelService = notebookKernelService;
    this._notebookService = _notebookService;
    this.configurationService = configurationService;
    this.layoutService = layoutService;
    this.contextMenuService = contextMenuService;
    this.telemetryService = telemetryService;
    this.notebookExecutionService = notebookExecutionService;
    this.editorProgressService = editorProgressService;
    this.logService = logService;
    //#region Eventing
    this._onDidChangeCellState = this._register(new Emitter());
    this.onDidChangeCellState = this._onDidChangeCellState.event;
    this._onDidChangeViewCells = this._register(new Emitter());
    this.onDidChangeViewCells = this._onDidChangeViewCells.event;
    this._onWillChangeModel = this._register(new Emitter());
    this.onWillChangeModel = this._onWillChangeModel.event;
    this._onDidChangeModel = this._register(new Emitter());
    this.onDidChangeModel = this._onDidChangeModel.event;
    this._onDidAttachViewModel = this._register(new Emitter());
    this.onDidAttachViewModel = this._onDidAttachViewModel.event;
    this._onDidChangeOptions = this._register(new Emitter());
    this.onDidChangeOptions = this._onDidChangeOptions.event;
    this._onDidChangeDecorations = this._register(new Emitter());
    this.onDidChangeDecorations = this._onDidChangeDecorations.event;
    this._onDidScroll = this._register(new Emitter());
    this.onDidScroll = this._onDidScroll.event;
    this._onDidChangeLayout = this._register(new Emitter());
    this.onDidChangeLayout = this._onDidChangeLayout.event;
    this._onDidChangeActiveCell = this._register(new Emitter());
    this.onDidChangeActiveCell = this._onDidChangeActiveCell.event;
    this._onDidChangeFocus = this._register(new Emitter());
    this.onDidChangeFocus = this._onDidChangeFocus.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._onDidChangeVisibleRanges = this._register(new Emitter());
    this.onDidChangeVisibleRanges = this._onDidChangeVisibleRanges.event;
    this._onDidFocusEmitter = this._register(new Emitter());
    this.onDidFocusWidget = this._onDidFocusEmitter.event;
    this._onDidBlurEmitter = this._register(new Emitter());
    this.onDidBlurWidget = this._onDidBlurEmitter.event;
    this._onDidChangeActiveEditor = this._register(new Emitter());
    this.onDidChangeActiveEditor = this._onDidChangeActiveEditor.event;
    this._onDidChangeActiveKernel = this._register(new Emitter());
    this.onDidChangeActiveKernel = this._onDidChangeActiveKernel.event;
    this._onMouseUp = this._register(new Emitter());
    this.onMouseUp = this._onMouseUp.event;
    this._onMouseDown = this._register(new Emitter());
    this.onMouseDown = this._onMouseDown.event;
    this._onDidReceiveMessage = this._register(new Emitter());
    this.onDidReceiveMessage = this._onDidReceiveMessage.event;
    this._onDidRenderOutput = this._register(new Emitter());
    this.onDidRenderOutput = this._onDidRenderOutput.event;
    this._onDidRemoveOutput = this._register(new Emitter());
    this.onDidRemoveOutput = this._onDidRemoveOutput.event;
    this._onDidResizeOutputEmitter = this._register(new Emitter());
    this.onDidResizeOutput = this._onDidResizeOutputEmitter.event;
    this._webview = null;
    this._webviewResolvePromise = null;
    this._webviewTransparentCover = null;
    this._listDelegate = null;
    this._dndController = null;
    this._listTopCellToolbar = null;
    this._renderedEditors = /* @__PURE__ */ new Map();
    this._localStore = this._register(new DisposableStore());
    this._localCellStateListeners = [];
    this._contributions = /* @__PURE__ */ new Map();
    this._insetModifyQueueByOutputId = new SequencerByKey();
    this._cellContextKeyManager = null;
    this._uuid = generateUuid();
    this._webviewFocused = false;
    this._isVisible = false;
    this._isDisposed = false;
    this._baseCellEditorOptions = /* @__PURE__ */ new Map();
    this._debugFlag = false;
    this._backgroundMarkdownRenderRunning = false;
    this._lastCellWithEditorFocus = null;
    this._pendingOutputHeightAcks = /* @__PURE__ */ new Map();
    this._dimension = dimension;
    this.isReplHistory = creationOptions.isReplHistory ?? false;
    this._readOnly = creationOptions.isReadOnly ?? false;
    this._overlayLayout = this._register(new OverlayLayoutElement());
    this._overlayContainer = this._overlayLayout.content;
    this.scopedContextKeyService = this._register(contextKeyService.createScoped(this._overlayContainer));
    this.instantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
    this._notebookOptions = creationOptions.options ?? this.instantiationService.createInstance(NotebookOptions, this.creationOptions?.codeWindow ?? mainWindow, this._readOnly, void 0);
    this._register(this._notebookOptions);
    const eventDispatcher = this._register(new NotebookEventDispatcher());
    this._viewContext = new ViewContext(
      this._notebookOptions,
      eventDispatcher,
      (language) => this.getBaseCellEditorOptions(language)
    );
    this._register(this._viewContext.eventDispatcher.onDidChangeLayout(() => {
      this._onDidChangeLayout.fire();
    }));
    this._register(this._viewContext.eventDispatcher.onDidChangeCellState((e) => {
      this._onDidChangeCellState.fire(e);
    }));
    this._register(_notebookService.onDidChangeOutputRenderers(() => {
      this._updateOutputRenderers();
    }));
    this._register(this.instantiationService.createInstance(NotebookEditorContextKeys, this));
    this._register(notebookKernelService.onDidChangeSelectedNotebooks((e) => {
      if (isEqual(e.notebook, this.viewModel?.uri)) {
        this._loadKernelPreloads();
        this._onDidChangeActiveKernel.fire();
      }
    }));
    this._scrollBeyondLastLine = this.configurationService.getValue("editor.scrollBeyondLastLine");
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.scrollBeyondLastLine")) {
        this._scrollBeyondLastLine = this.configurationService.getValue("editor.scrollBeyondLastLine");
        if (this._dimension && this._isVisible) {
          this.layout(this._dimension);
        }
      }
    }));
    this._register(this._notebookOptions.onDidChangeOptions((e) => {
      if (e.cellStatusBarVisibility || e.cellToolbarLocation || e.cellToolbarInteraction) {
        this._updateForNotebookConfiguration();
      }
      if (e.fontFamily) {
        this._generateFontInfo();
      }
      if (e.compactView || e.focusIndicator || e.insertToolbarPosition || e.cellToolbarLocation || e.dragAndDropEnabled || e.fontSize || e.markupFontSize || e.markdownLineHeight || e.fontFamily || e.insertToolbarAlignment || e.outputFontSize || e.outputLineHeight || e.outputFontFamily || e.outputWordWrap || e.outputScrolling || e.outputLinkifyFilePaths || e.minimalError) {
        this._styleElement?.remove();
        this._createLayoutStyles();
        this._webview?.updateOptions({
          ...this.notebookOptions.computeWebviewOptions(),
          fontFamily: this._generateFontFamily()
        });
      }
      if (this._dimension && this._isVisible) {
        this.layout(this._dimension);
      }
    }));
    const container = creationOptions.codeWindow ? this.layoutService.getContainer(creationOptions.codeWindow) : this.layoutService.mainContainer;
    this.notebookEditorService.addNotebookEditor(this);
    const id = generateUuid();
    this._overlayContainer.id = `notebook-${id}`;
    this._overlayContainer.className = "notebookOverlay";
    this._overlayContainer.classList.add("notebook-editor");
    this._overlayContainer.inert = true;
    this._overlayContainer.style.visibility = "hidden";
    container.appendChild(this._overlayLayout.root);
    this._createBody(this._overlayContainer);
    this._generateFontInfo();
    this._isVisible = true;
    this._editorFocus = NOTEBOOK_EDITOR_FOCUSED.bindTo(this.scopedContextKeyService);
    this._outputFocus = NOTEBOOK_OUTPUT_FOCUSED.bindTo(this.scopedContextKeyService);
    this._outputInputFocus = NOTEBOOK_OUTPUT_INPUT_FOCUSED.bindTo(this.scopedContextKeyService);
    this._editorEditable = NOTEBOOK_EDITOR_EDITABLE.bindTo(this.scopedContextKeyService);
    this._cursorNavMode = NOTEBOOK_CURSOR_NAVIGATION_MODE.bindTo(this.scopedContextKeyService);
    new RawContextKey(PreventDefaultContextMenuItemsContextKeyName, false).bindTo(this.scopedContextKeyService).set(true);
    this._editorEditable.set(!creationOptions.isReadOnly);
    let contributions;
    if (Array.isArray(this.creationOptions.contributions)) {
      contributions = this.creationOptions.contributions;
    } else {
      contributions = NotebookEditorExtensionsRegistry.getEditorContributions();
    }
    for (const desc of contributions) {
      let contribution;
      try {
        contribution = this.instantiationService.createInstance(desc.ctor, this);
      } catch (err) {
        onUnexpectedError(err);
      }
      if (contribution) {
        if (!this._contributions.has(desc.id)) {
          this._contributions.set(desc.id, contribution);
        } else {
          contribution.dispose();
          throw new Error(`DUPLICATE notebook editor contribution: '${desc.id}'`);
        }
      }
    }
    this._updateForNotebookConfiguration();
  }
  get isVisible() {
    return this._isVisible;
  }
  get isDisposed() {
    return this._isDisposed;
  }
  set viewModel(newModel) {
    this._onWillChangeModel.fire(this._notebookViewModel?.notebookDocument);
    this._notebookViewModel = newModel;
    this._onDidChangeModel.fire(newModel?.notebookDocument);
  }
  get viewModel() {
    return this._notebookViewModel;
  }
  get textModel() {
    return this._notebookViewModel?.notebookDocument;
  }
  get isReadOnly() {
    return this._notebookViewModel?.options.isReadOnly ?? false;
  }
  get activeCodeEditor() {
    if (this._isDisposed) {
      return;
    }
    const [focused] = this._list.getFocusedElements();
    return this._renderedEditors.get(focused);
  }
  get activeCellAndCodeEditor() {
    if (this._isDisposed) {
      return;
    }
    const [focused] = this._list.getFocusedElements();
    const editor = this._renderedEditors.get(focused);
    if (!editor) {
      return;
    }
    return [focused, editor];
  }
  get codeEditors() {
    return [...this._renderedEditors];
  }
  get visibleRanges() {
    return this._list ? this._list.visibleRanges || [] : [];
  }
  get notebookOptions() {
    return this._notebookOptions;
  }
  _debug(...args) {
    if (!this._debugFlag) {
      return;
    }
    notebookDebug(...args);
  }
  /**
   * EditorId
   */
  getId() {
    return this._uuid;
  }
  getViewModel() {
    return this.viewModel;
  }
  getLength() {
    return this.viewModel?.length ?? 0;
  }
  getSelections() {
    return this.viewModel?.getSelections() ?? [{ start: 0, end: 0 }];
  }
  setSelections(selections) {
    if (!this.viewModel) {
      return;
    }
    const focus = this.viewModel.getFocus();
    this.viewModel.updateSelectionsState({
      kind: SelectionStateType.Index,
      focus,
      selections
    });
  }
  getFocus() {
    return this.viewModel?.getFocus() ?? { start: 0, end: 0 };
  }
  setFocus(focus) {
    if (!this.viewModel) {
      return;
    }
    const selections = this.viewModel.getSelections();
    this.viewModel.updateSelectionsState({
      kind: SelectionStateType.Index,
      focus,
      selections
    });
  }
  getSelectionViewModels() {
    if (!this.viewModel) {
      return [];
    }
    const cellsSet = /* @__PURE__ */ new Set();
    return this.viewModel.getSelections().map((range) => this.viewModel.viewCells.slice(range.start, range.end)).reduce((a, b) => {
      b.forEach((cell) => {
        if (!cellsSet.has(cell.handle)) {
          cellsSet.add(cell.handle);
          a.push(cell);
        }
      });
      return a;
    }, []);
  }
  hasModel() {
    return !!this._notebookViewModel;
  }
  showProgress() {
    this._currentProgress = this.editorProgressService.show(true);
  }
  hideProgress() {
    if (this._currentProgress) {
      this._currentProgress.done();
      this._currentProgress = void 0;
    }
  }
  //#region Editor Core
  getBaseCellEditorOptions(language) {
    const existingOptions = this._baseCellEditorOptions.get(language);
    if (existingOptions) {
      return existingOptions;
    } else {
      const options = new BaseCellEditorOptions(this, this.notebookOptions, this.configurationService, language);
      this._baseCellEditorOptions.set(language, options);
      return options;
    }
  }
  _updateForNotebookConfiguration() {
    if (!this._overlayContainer) {
      return;
    }
    this._overlayContainer.classList.remove("cell-title-toolbar-left");
    this._overlayContainer.classList.remove("cell-title-toolbar-right");
    this._overlayContainer.classList.remove("cell-title-toolbar-hidden");
    const cellToolbarLocation = this._notebookOptions.computeCellToolbarLocation(this.viewModel?.viewType);
    this._overlayContainer.classList.add(`cell-title-toolbar-${cellToolbarLocation}`);
    const cellToolbarInteraction = this._notebookOptions.getDisplayOptions().cellToolbarInteraction;
    let cellToolbarInteractionState = "hover";
    this._overlayContainer.classList.remove("cell-toolbar-hover");
    this._overlayContainer.classList.remove("cell-toolbar-click");
    if (cellToolbarInteraction === "hover" || cellToolbarInteraction === "click") {
      cellToolbarInteractionState = cellToolbarInteraction;
    }
    this._overlayContainer.classList.add(`cell-toolbar-${cellToolbarInteractionState}`);
  }
  _generateFontInfo() {
    const editorOptions = this.configurationService.getValue("editor");
    const targetWindow = DOM.getWindow(this.getDomNode());
    this._fontInfo = FontMeasurements.readFontInfo(targetWindow, createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(targetWindow).value));
  }
  _createBody(parent) {
    this._notebookTopToolbarContainer = document.createElement("div");
    this._notebookTopToolbarContainer.classList.add("notebook-toolbar-container");
    this._notebookTopToolbarContainer.style.display = "none";
    DOM.append(parent, this._notebookTopToolbarContainer);
    this._notebookStickyScrollContainer = document.createElement("div");
    this._notebookStickyScrollContainer.classList.add("notebook-sticky-scroll-container");
    DOM.append(parent, this._notebookStickyScrollContainer);
    this._body = document.createElement("div");
    DOM.append(parent, this._body);
    this._body.classList.add("cell-list-container");
    this._createLayoutStyles();
    this._createCellList();
    this._notebookOverviewRulerContainer = document.createElement("div");
    this._notebookOverviewRulerContainer.classList.add("notebook-overview-ruler-container");
    this._list.scrollableElement.appendChild(this._notebookOverviewRulerContainer);
    this._registerNotebookOverviewRuler();
    this._register(this.instantiationService.createInstance(NotebookHorizontalTracker, this, this._list.scrollableElement));
    this._overflowContainer = document.createElement("div");
    this._overflowContainer.classList.add("notebook-overflow-widget-container", "monaco-editor");
    DOM.append(parent, this._overflowContainer);
  }
  _generateFontFamily() {
    return this._fontInfo?.fontFamily ?? `"SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace`;
  }
  _createLayoutStyles() {
    this._styleElement = domStylesheets.createStyleSheet(this._body);
    const {
      cellRightMargin,
      cellTopMargin,
      cellRunGutter,
      cellBottomMargin,
      codeCellLeftMargin,
      markdownCellGutter,
      markdownCellLeftMargin,
      markdownCellBottomMargin,
      markdownCellTopMargin,
      collapsedIndicatorHeight,
      focusIndicator,
      insertToolbarPosition,
      outputFontSize,
      focusIndicatorLeftMargin,
      focusIndicatorGap
    } = this._notebookOptions.getLayoutConfiguration();
    const {
      insertToolbarAlignment,
      compactView,
      fontSize
    } = this._notebookOptions.getDisplayOptions();
    const getCellEditorContainerLeftMargin = this._notebookOptions.getCellEditorContainerLeftMargin();
    const { bottomToolbarGap, bottomToolbarHeight } = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);
    const styleSheets = [];
    if (!this._fontInfo) {
      this._generateFontInfo();
    }
    const fontFamily = this._generateFontFamily();
    styleSheets.push(`
		.notebook-editor {
			--notebook-cell-output-font-size: ${outputFontSize}px;
			--notebook-cell-input-preview-font-size: ${fontSize}px;
			--notebook-cell-input-preview-font-family: ${fontFamily};
		}
		`);
    if (compactView) {
      styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row div.cell.code { margin-left: ${getCellEditorContainerLeftMargin}px; }`);
    } else {
      styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row div.cell.code { margin-left: ${codeCellLeftMargin}px; }`);
    }
    if (focusIndicator === "border") {
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-top:before,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-bottom:before,
			.monaco-workbench .notebookOverlay .monaco-list .markdown-cell-row .cell-inner-container:before,
			.monaco-workbench .notebookOverlay .monaco-list .markdown-cell-row .cell-inner-container:after {
				content: "";
				position: absolute;
				width: 100%;
				height: 1px;
			}

			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-left:before,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-right:before {
				content: "";
				position: absolute;
				width: 1px;
				height: 100%;
				z-index: 10;
			}

			/* top border */
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-top:before {
				border-top: 1px solid transparent;
			}

			/* left border */
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-left:before {
				border-left: 1px solid transparent;
			}

			/* bottom border */
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-bottom:before {
				border-bottom: 1px solid transparent;
			}

			/* right border */
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-right:before {
				border-right: 1px solid transparent;
			}
			`);
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.code-cell-row.focused .cell-focus-indicator-left:before,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.code-cell-row.focused .cell-focus-indicator-right:before,
			.monaco-workbench .notebookOverlay .monaco-list.selection-multiple .monaco-list-row.code-cell-row.selected .cell-focus-indicator-left:before,
			.monaco-workbench .notebookOverlay .monaco-list.selection-multiple .monaco-list-row.code-cell-row.selected .cell-focus-indicator-right:before {
				top: -${cellTopMargin}px; height: calc(100% + ${cellTopMargin + cellBottomMargin}px)
			}`);
    } else {
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-left .codeOutput-focus-indicator {
				border-left: 3px solid transparent;
				border-radius: 4px;
				width: 0px;
				margin-left: ${focusIndicatorLeftMargin}px;
				border-color: var(--vscode-notebook-inactiveFocusedCellBorder) !important;
			}

			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.focused .cell-focus-indicator-left .codeOutput-focus-indicator-container,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-output-hover .cell-focus-indicator-left .codeOutput-focus-indicator-container,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .markdown-cell-hover .cell-focus-indicator-left .codeOutput-focus-indicator-container,
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row:hover .cell-focus-indicator-left .codeOutput-focus-indicator-container {
				display: block;
			}

			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-left .codeOutput-focus-indicator-container:hover .codeOutput-focus-indicator {
				border-left: 5px solid transparent;
				margin-left: ${focusIndicatorLeftMargin - 1}px;
			}
			`);
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row.focused .cell-inner-container.cell-output-focus .cell-focus-indicator-left .codeOutput-focus-indicator,
			.monaco-workbench .notebookOverlay .monaco-list:focus-within .monaco-list-row.focused .cell-inner-container .cell-focus-indicator-left .codeOutput-focus-indicator {
				border-color: var(--vscode-notebook-focusedCellBorder) !important;
			}

			.monaco-workbench .notebookOverlay .monaco-list .monaco-list-row .cell-inner-container .cell-focus-indicator-left .output-focus-indicator {
				margin-top: ${focusIndicatorGap}px;
			}
			`);
    }
    if (insertToolbarPosition === "betweenCells" || insertToolbarPosition === "both") {
      styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container { display: flex; }`);
      styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .view-zones .cell-list-top-cell-toolbar-container { display: flex; }`);
    } else {
      styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container { display: none; }`);
      styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .view-zones .cell-list-top-cell-toolbar-container { display: none; }`);
    }
    if (insertToolbarAlignment === "left") {
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container .action-item:first-child,
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container .action-item:first-child, .monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container .action-item:first-child {
				margin-right: 0px !important;
			}`);
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container .monaco-toolbar .action-label,
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container .monaco-toolbar .action-label, .monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container .monaco-toolbar .action-label {
				padding: 0px !important;
				justify-content: center;
				border-radius: 4px;
			}`);
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container,
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container, .monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container {
				align-items: flex-start;
				justify-content: left;
				margin: 0 16px 0 ${8 + codeCellLeftMargin}px;
			}`);
      styleSheets.push(`
			.monaco-workbench .notebookOverlay .cell-list-top-cell-toolbar-container,
			.notebookOverlay .cell-bottom-toolbar-container .action-item {
				border: 0px;
			}`);
    }
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .code-cell-row div.cell.code { margin-left: ${getCellEditorContainerLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .view-zones .code-cell-row div.cell.code { margin-left: ${getCellEditorContainerLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .view-zones .code-cell-row div.cell { margin-right: ${cellRightMargin}px; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row div.cell { margin-right: ${cellRightMargin}px; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row > .cell-inner-container { padding-top: ${cellTopMargin}px; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row > .cell-inner-container { padding-bottom: ${markdownCellBottomMargin}px; padding-top: ${markdownCellTopMargin}px; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row > .cell-inner-container.webview-backed-markdown-cell { padding: 0; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .markdown-cell-row > .webview-backed-markdown-cell.markdown-cell-edit-mode .cell.code { padding-bottom: ${markdownCellBottomMargin}px; padding-top: ${markdownCellTopMargin}px; }`);
    styleSheets.push(`.notebookOverlay .output { margin: 0px ${cellRightMargin}px 0px ${getCellEditorContainerLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay .output { width: calc(100% - ${getCellEditorContainerLeftMargin + cellRightMargin}px); }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-comment-container { left: ${getCellEditorContainerLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-comment-container { width: calc(100% - ${getCellEditorContainerLeftMargin + cellRightMargin}px); }`);
    styleSheets.push(`.monaco-workbench .notebookOverlay .output .output-collapse-container .expandButton { left: -${cellRunGutter}px; }`);
    styleSheets.push(`.monaco-workbench .notebookOverlay .output .output-collapse-container .expandButton {
			position: absolute;
			width: ${cellRunGutter}px;
			padding: 6px 0px;
		}`);
    styleSheets.push(`.notebookOverlay .output-show-more-container { margin: 0px ${cellRightMargin}px 0px ${getCellEditorContainerLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay .output-show-more-container { width: calc(100% - ${getCellEditorContainerLeftMargin + cellRightMargin}px); }`);
    styleSheets.push(`.notebookOverlay .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row div.cell.markdown { padding-left: ${cellRunGutter}px; }`);
    styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container .notebook-folding-indicator { left: ${(markdownCellGutter - 20) / 2 + markdownCellLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay > .cell-list-container .notebook-folded-hint { left: ${markdownCellGutter + markdownCellLeftMargin + 8}px; }`);
    styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row :not(.webview-backed-markdown-cell) .cell-focus-indicator-top { height: ${cellTopMargin}px; }`);
    styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-side { bottom: ${bottomToolbarGap}px; }`);
    styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row.code-cell-row .cell-focus-indicator-left { width: ${getCellEditorContainerLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row.markdown-cell-row .cell-focus-indicator-left { width: ${codeCellLeftMargin}px; }`);
    styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator.cell-focus-indicator-right { width: ${cellRightMargin}px; }`);
    styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-focus-indicator-bottom { height: ${cellBottomMargin}px; }`);
    styleSheets.push(`.notebookOverlay .monaco-list .monaco-list-row .cell-shadow-container-bottom { top: ${cellBottomMargin}px; }`);
    styleSheets.push(`
			.notebookOverlay .monaco-list.selection-multiple .monaco-list-row:has(+ .monaco-list-row.selected) .cell-focus-indicator-bottom {
				height: ${bottomToolbarGap + cellBottomMargin}px;
			}
		`);
    styleSheets.push(`
			.notebookOverlay .monaco-list .monaco-list-row.code-cell-row.nb-multiCellHighlight:has(+ .monaco-list-row.nb-multiCellHighlight) .cell-focus-indicator-bottom {
				height: ${bottomToolbarGap + cellBottomMargin}px;
				background-color: var(--vscode-notebook-symbolHighlightBackground) !important;
			}

			.notebookOverlay .monaco-list .monaco-list-row.markdown-cell-row.nb-multiCellHighlight:has(+ .monaco-list-row.nb-multiCellHighlight) .cell-focus-indicator-bottom {
				height: ${bottomToolbarGap + cellBottomMargin - 6}px;
				background-color: var(--vscode-notebook-symbolHighlightBackground) !important;
			}
		`);
    styleSheets.push(`
			.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .input-collapse-container .cell-collapse-preview {
				line-height: ${collapsedIndicatorHeight}px;
			}

			.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .input-collapse-container .cell-collapse-preview .monaco-tokenized-source {
				max-height: ${collapsedIndicatorHeight}px;
			}
		`);
    styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-bottom-toolbar-container .monaco-toolbar { height: ${bottomToolbarHeight}px }`);
    styleSheets.push(`.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .view-zones .cell-list-top-cell-toolbar-container .monaco-toolbar { height: ${bottomToolbarHeight}px }`);
    styleSheets.push(`.monaco-workbench .notebookOverlay.cell-title-toolbar-right > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-title-toolbar {
			right: ${cellRightMargin + 26}px;
		}
		.monaco-workbench .notebookOverlay.cell-title-toolbar-left > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-title-toolbar {
			left: ${getCellEditorContainerLeftMargin + 16}px;
		}
		.monaco-workbench .notebookOverlay.cell-title-toolbar-hidden > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .cell-title-toolbar {
			display: none;
		}`);
    styleSheets.push(`
		.monaco-workbench .notebookOverlay .output > div.foreground.output-inner-container {
			padding: ${OutputInnerContainerTopPadding}px 8px;
		}
		.monaco-workbench .notebookOverlay > .cell-list-container > .monaco-list > .monaco-scrollable-element > .monaco-list-rows > .monaco-list-row .output-collapse-container {
			padding: ${OutputInnerContainerTopPadding}px 8px;
		}
		`);
    styleSheets.push(`
		.monaco-workbench .notebookOverlay .cell-chat-part {
			margin: 0 ${cellRightMargin}px 6px 4px;
		}
		`);
    this._styleElement.textContent = styleSheets.join("\n");
  }
  _createCellList() {
    this._body.classList.add("cell-list-container");
    this._dndController = this._register(new CellDragAndDropController(this, this._body));
    const getScopedContextKeyService = (container) => this._list.contextKeyService.createScoped(container);
    this._editorPool = this._register(this.instantiationService.createInstance(NotebookCellEditorPool, this, getScopedContextKeyService));
    const renderers = [
      this.instantiationService.createInstance(CodeCellRenderer, this, this._renderedEditors, this._editorPool, this._dndController, getScopedContextKeyService),
      this.instantiationService.createInstance(MarkupCellRenderer, this, this._dndController, this._renderedEditors, getScopedContextKeyService)
    ];
    renderers.forEach((renderer) => {
      this._register(renderer);
    });
    this._listDelegate = this.instantiationService.createInstance(NotebookCellListDelegate, DOM.getWindow(this.getDomNode()));
    this._register(this._listDelegate);
    const accessibilityProvider = this.instantiationService.createInstance(NotebookAccessibilityProvider, () => this.viewModel, this.isReplHistory);
    this._register(accessibilityProvider);
    this._list = this.instantiationService.createInstance(
      NotebookCellList,
      "NotebookCellList",
      this._body,
      this._viewContext.notebookOptions,
      this._listDelegate,
      renderers,
      this.scopedContextKeyService,
      {
        setRowLineHeight: false,
        setRowHeight: false,
        supportDynamicHeights: true,
        horizontalScrolling: false,
        keyboardSupport: false,
        mouseSupport: true,
        multipleSelectionSupport: true,
        selectionNavigation: true,
        typeNavigationEnabled: true,
        paddingTop: 0,
        paddingBottom: 0,
        transformOptimization: false,
        //(isMacintosh && isNative) || getTitleBarStyle(this.configurationService, this.environmentService) === 'native',
        initialSize: this._dimension,
        styleController: (_suffix) => {
          return this._list;
        },
        overrideStyles: {
          listBackground: notebookEditorBackground,
          listActiveSelectionBackground: notebookEditorBackground,
          listActiveSelectionForeground: foreground,
          listFocusAndSelectionBackground: notebookEditorBackground,
          listFocusAndSelectionForeground: foreground,
          listFocusBackground: notebookEditorBackground,
          listFocusForeground: foreground,
          listHoverForeground: foreground,
          listHoverBackground: notebookEditorBackground,
          listHoverOutline: focusBorder,
          listFocusOutline: focusBorder,
          listInactiveSelectionBackground: notebookEditorBackground,
          listInactiveSelectionForeground: foreground,
          listInactiveFocusBackground: notebookEditorBackground,
          listInactiveFocusOutline: notebookEditorBackground
        },
        accessibilityProvider
      }
    );
    this._cellLayoutManager = new NotebookCellLayoutManager(this, this._list, this.logService);
    this._dndController.setList(this._list);
    this._register(this._list);
    this._listViewInfoAccessor = new ListViewInfoAccessor(this._list);
    this._register(this._listViewInfoAccessor);
    this._register(combinedDisposable(...renderers));
    this._listTopCellToolbar = this._register(this.instantiationService.createInstance(ListTopCellToolbar, this, this.notebookOptions));
    this._webviewTransparentCover = DOM.append(this._list.rowsContainer, $(".webview-cover"));
    this._webviewTransparentCover.style.display = "none";
    this._register(DOM.addStandardDisposableGenericMouseDownListener(this._overlayContainer, (e) => {
      if (e.target.classList.contains("slider") && this._webviewTransparentCover) {
        this._webviewTransparentCover.style.display = "block";
      }
    }));
    this._register(DOM.addStandardDisposableGenericMouseUpListener(this._overlayContainer, () => {
      if (this._webviewTransparentCover) {
        this._webviewTransparentCover.style.display = "none";
      }
    }));
    this._register(this._list.onMouseDown((e) => {
      if (e.element) {
        this._onMouseDown.fire({ event: e.browserEvent, target: e.element });
      }
    }));
    this._register(this._list.onMouseUp((e) => {
      if (e.element) {
        this._onMouseUp.fire({ event: e.browserEvent, target: e.element });
      }
    }));
    this._register(this._list.onDidChangeFocus((_e) => {
      this._onDidChangeActiveEditor.fire(this);
      this._onDidChangeActiveCell.fire();
      this._onDidChangeFocus.fire();
      this._cursorNavMode.set(false);
    }));
    this._register(this._list.onContextMenu((e) => {
      this.showListContextMenu(e);
    }));
    this._register(this._list.onDidChangeVisibleRanges(() => {
      this._onDidChangeVisibleRanges.fire();
    }));
    this._register(this._list.onDidScroll((e) => {
      if (e.scrollTop !== e.oldScrollTop) {
        this._onDidScroll.fire();
        this.clearActiveCellWidgets();
      }
      if (e.scrollTop === e.oldScrollTop && e.scrollHeightChanged) {
        this._onDidChangeLayout.fire();
      }
    }));
    this._focusTracker = this._register(DOM.trackFocus(this.getDomNode()));
    this._register(this._focusTracker.onDidBlur(() => {
      this._editorFocus.set(false);
      this.viewModel?.setEditorFocus(false);
      this._onDidBlurEmitter.fire();
    }));
    this._register(this._focusTracker.onDidFocus(() => {
      this._editorFocus.set(true);
      this.viewModel?.setEditorFocus(true);
      this._onDidFocusEmitter.fire();
    }));
    this._registerNotebookActionsToolbar();
    this._registerNotebookStickyScroll();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(accessibilityProvider.verbositySettingId)) {
        this._list.ariaLabel = accessibilityProvider?.getWidgetAriaLabel();
      }
    }));
  }
  showListContextMenu(e) {
    this.contextMenuService.showContextMenu({
      menuId: MenuId.NotebookCellTitle,
      menuActionOptions: {
        shouldForwardArgs: true
      },
      contextKeyService: this.scopedContextKeyService,
      getAnchor: () => e.anchor,
      getActionsContext: () => {
        return {
          from: "cellContainer"
        };
      }
    });
  }
  _registerNotebookOverviewRuler() {
    this._notebookOverviewRuler = this._register(this.instantiationService.createInstance(NotebookOverviewRuler, this, this._notebookOverviewRulerContainer));
  }
  _registerNotebookActionsToolbar() {
    this._notebookTopToolbar = this._register(this.instantiationService.createInstance(NotebookEditorWorkbenchToolbar, this, this.scopedContextKeyService, this._notebookOptions, this._notebookTopToolbarContainer));
    this._register(this._notebookTopToolbar.onDidChangeVisibility(() => {
      if (this._dimension && this._isVisible) {
        this.layout(this._dimension);
      }
    }));
  }
  _registerNotebookStickyScroll() {
    this._notebookStickyScroll = this._register(this.instantiationService.createInstance(NotebookStickyScroll, this._notebookStickyScrollContainer, this, this._list, (sizeDelta) => {
      if (this.isDisposed) {
        return;
      }
      if (this._dimension && this._isVisible) {
        if (sizeDelta > 0) {
          this.layout(this._dimension);
          this.setScrollTop(this.scrollTop + sizeDelta);
        } else if (sizeDelta < 0) {
          this.setScrollTop(this.scrollTop + sizeDelta);
          this.layout(this._dimension);
        }
      }
      this._onDidScroll.fire();
    }));
  }
  _updateOutputRenderers() {
    if (!this.viewModel || !this._webview) {
      return;
    }
    this._webview.updateOutputRenderers();
    this.viewModel.viewCells.forEach((cell) => {
      cell.outputsViewModels.forEach((output) => {
        if (output.pickedMimeType?.rendererId === RENDERER_NOT_AVAILABLE) {
          output.resetRenderer();
        }
      });
    });
  }
  getDomNode() {
    return this._overlayContainer;
  }
  getOverflowContainerDomNode() {
    return this._overflowContainer;
  }
  getInnerWebview() {
    return this._webview?.webview;
  }
  setEditorProgressService(editorProgressService) {
    this.editorProgressService = editorProgressService;
  }
  setParentContextKeyService(parentContextKeyService) {
    this.scopedContextKeyService.updateParent(parentContextKeyService);
  }
  async setModel(textModel, viewState, perf, viewType) {
    if (this.viewModel === void 0 || !this.viewModel.equal(textModel)) {
      const oldBottomToolbarDimensions = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);
      this._detachModel();
      await this._attachModel(textModel, viewType ?? textModel.viewType, viewState, perf);
      const newBottomToolbarDimensions = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);
      if (oldBottomToolbarDimensions.bottomToolbarGap !== newBottomToolbarDimensions.bottomToolbarGap || oldBottomToolbarDimensions.bottomToolbarHeight !== newBottomToolbarDimensions.bottomToolbarHeight) {
        this._styleElement?.remove();
        this._createLayoutStyles();
        this._webview?.updateOptions({
          ...this.notebookOptions.computeWebviewOptions(),
          fontFamily: this._generateFontFamily()
        });
      }
      this.telemetryService.publicLog2("notebook/editorOpened", {
        scheme: textModel.uri.scheme,
        ext: extname(textModel.uri),
        viewType: textModel.viewType,
        isRepl: this.isReplHistory
      });
    } else {
      this.restoreListViewState(viewState);
    }
    this._restoreSelectedKernel(viewState);
    this._loadKernelPreloads();
    this._dndController?.clearGlobalDragState();
    this._localStore.add(this._list.onDidChangeFocus(() => {
      this.updateContextKeysOnFocusChange();
    }));
    this.updateContextKeysOnFocusChange();
    this._backgroundMarkdownRendering();
  }
  _backgroundMarkdownRendering() {
    if (this._backgroundMarkdownRenderRunning) {
      return;
    }
    this._backgroundMarkdownRenderRunning = true;
    DOM.runWhenWindowIdle(DOM.getWindow(this.getDomNode()), (deadline) => {
      this._backgroundMarkdownRenderingWithDeadline(deadline);
    });
  }
  _backgroundMarkdownRenderingWithDeadline(deadline) {
    const endTime = Date.now() + deadline.timeRemaining();
    const execute = () => {
      try {
        this._backgroundMarkdownRenderRunning = true;
        if (this._isDisposed) {
          return;
        }
        if (!this.viewModel) {
          return;
        }
        const firstMarkupCell = this.viewModel.viewCells.find((cell) => cell.cellKind === CellKind.Markup && !this._webview?.markupPreviewMapping.has(cell.id) && !this.cellIsHidden(cell));
        if (!firstMarkupCell) {
          return;
        }
        this.createMarkupPreview(firstMarkupCell);
      } finally {
        this._backgroundMarkdownRenderRunning = false;
      }
      if (Date.now() < endTime) {
        setTimeout0(execute);
      } else {
        this._backgroundMarkdownRendering();
      }
    };
    execute();
  }
  updateContextKeysOnFocusChange() {
    if (!this.viewModel) {
      return;
    }
    const focused = this._list.getFocusedElements()[0];
    if (focused) {
      if (!this._cellContextKeyManager) {
        this._cellContextKeyManager = this._localStore.add(this.instantiationService.createInstance(CellContextKeyManager, this, focused));
      }
      this._cellContextKeyManager.updateForElement(focused);
    }
  }
  async setOptions(options) {
    if (options?.isReadOnly !== void 0) {
      this._readOnly = options?.isReadOnly;
    }
    if (!this.viewModel) {
      return;
    }
    this.viewModel.updateOptions({ isReadOnly: this._readOnly });
    this.notebookOptions.updateOptions(this._readOnly);
    const cellOptions = options?.cellOptions ?? this._parseIndexedCellOptions(options);
    if (cellOptions) {
      const cell = this.viewModel.viewCells.find((cell2) => cell2.uri.toString() === cellOptions.resource.toString());
      if (cell) {
        this.focusElement(cell);
        const selection = cellOptions.options?.selection;
        if (selection) {
          cell.updateEditState(CellEditState.Editing, "setOptions");
          cell.focusMode = CellFocusMode.Editor;
          await this.revealRangeInCenterIfOutsideViewportAsync(cell, new Range(selection.startLineNumber, selection.startColumn, selection.endLineNumber || selection.startLineNumber, selection.endColumn || selection.startColumn));
        } else {
          this._list.revealCell(cell, options?.cellRevealType ?? CellRevealType.CenterIfOutsideViewport);
        }
        const editor = this._renderedEditors.get(cell);
        if (editor) {
          if (cellOptions.options?.selection) {
            const { selection: selection2 } = cellOptions.options;
            const editorSelection = new Range(selection2.startLineNumber, selection2.startColumn, selection2.endLineNumber || selection2.startLineNumber, selection2.endColumn || selection2.startColumn);
            editor.setSelection(editorSelection);
            editor.revealPositionInCenterIfOutsideViewport({
              lineNumber: selection2.startLineNumber,
              column: selection2.startColumn
            });
            await this.revealRangeInCenterIfOutsideViewportAsync(cell, editorSelection);
          }
          if (!cellOptions.options?.preserveFocus) {
            editor.focus();
          }
        }
      }
    }
    if (options?.cellSelections) {
      const focusCellIndex = options.cellSelections[0].start;
      const focusedCell = this.viewModel.cellAt(focusCellIndex);
      if (focusedCell) {
        this.viewModel.updateSelectionsState({
          kind: SelectionStateType.Index,
          focus: { start: focusCellIndex, end: focusCellIndex + 1 },
          selections: options.cellSelections
        });
        this.revealInCenterIfOutsideViewport(focusedCell);
      }
    }
    this._updateForOptions();
    this._onDidChangeOptions.fire();
  }
  _parseIndexedCellOptions(options) {
    if (options?.indexedCellOptions) {
      const cell = this.cellAt(options.indexedCellOptions.index);
      if (cell) {
        return {
          resource: cell.uri,
          options: {
            selection: options.indexedCellOptions.selection,
            preserveFocus: false
          }
        };
      }
    }
    return void 0;
  }
  _detachModel() {
    this._localStore.clear();
    dispose(this._localCellStateListeners);
    this._list.detachViewModel();
    this.viewModel?.dispose();
    this.viewModel = void 0;
    this._webview?.dispose();
    this._webview?.element.remove();
    this._webview = null;
    this._list.clear();
  }
  _updateForOptions() {
    if (!this.viewModel) {
      return;
    }
    this._editorEditable.set(!this.viewModel.options.isReadOnly);
    this._overflowContainer.classList.toggle("notebook-editor-editable", !this.viewModel.options.isReadOnly);
    this.getDomNode().classList.toggle("notebook-editor-editable", !this.viewModel.options.isReadOnly);
  }
  async _resolveWebview() {
    if (!this.textModel) {
      return null;
    }
    if (this._webviewResolvePromise) {
      return this._webviewResolvePromise;
    }
    if (!this._webview) {
      this._ensureWebview(this.getId(), this.textModel.viewType, this.textModel.uri);
    }
    this._webviewResolvePromise = (async () => {
      if (!this._webview) {
        throw new Error("Notebook output webview object is not created successfully.");
      }
      await this._webview.createWebview(this.creationOptions.codeWindow ?? mainWindow);
      if (!this._webview.webview) {
        throw new Error("Notebook output webview element was not created successfully.");
      }
      this._localStore.add(this._webview.webview.onDidBlur(() => {
        this._outputFocus.set(false);
        this._webviewFocused = false;
        this.updateEditorFocus();
        this.updateCellFocusMode();
      }));
      this._localStore.add(this._webview.webview.onDidFocus(() => {
        this._outputFocus.set(true);
        this.updateEditorFocus();
        this._webviewFocused = true;
      }));
      this._localStore.add(this._webview.onMessage((e) => {
        this._onDidReceiveMessage.fire(e);
      }));
      return this._webview;
    })();
    return this._webviewResolvePromise;
  }
  _ensureWebview(id, viewType, resource) {
    if (this._webview) {
      return;
    }
    const that = this;
    this._webview = this.instantiationService.createInstance(BackLayerWebView, {
      get creationOptions() {
        return that.creationOptions;
      },
      setScrollTop(scrollTop) {
        that._list.scrollTop = scrollTop;
      },
      triggerScroll(event) {
        that._list.triggerScrollFromMouseWheelEvent(event);
      },
      getCellByInfo: that.getCellByInfo.bind(that),
      getCellById: that._getCellById.bind(that),
      toggleNotebookCellSelection: that._toggleNotebookCellSelection.bind(that),
      focusNotebookCell: that.focusNotebookCell.bind(that),
      focusNextNotebookCell: that.focusNextNotebookCell.bind(that),
      updateOutputHeight: that._updateOutputHeight.bind(that),
      scheduleOutputHeightAck: that._scheduleOutputHeightAck.bind(that),
      updateMarkupCellHeight: that._updateMarkupCellHeight.bind(that),
      setMarkupCellEditState: that._setMarkupCellEditState.bind(that),
      didStartDragMarkupCell: that._didStartDragMarkupCell.bind(that),
      didDragMarkupCell: that._didDragMarkupCell.bind(that),
      didDropMarkupCell: that._didDropMarkupCell.bind(that),
      didEndDragMarkupCell: that._didEndDragMarkupCell.bind(that),
      didResizeOutput: that._didResizeOutput.bind(that),
      updatePerformanceMetadata: that._updatePerformanceMetadata.bind(that),
      didFocusOutputInputChange: that._didFocusOutputInputChange.bind(that)
    }, id, viewType, resource, {
      ...this._notebookOptions.computeWebviewOptions(),
      fontFamily: this._generateFontFamily()
    }, this.notebookRendererMessaging.getScoped(this._uuid));
    this._webview.element.style.width = "100%";
    this._list.attachWebview(this._webview.element);
  }
  async _attachModel(textModel, viewType, viewState, perf) {
    this._ensureWebview(this.getId(), textModel.viewType, textModel.uri);
    this.viewModel = this.instantiationService.createInstance(NotebookViewModel, viewType, textModel, this._viewContext, this.getLayoutInfo(), { isReadOnly: this._readOnly });
    this._viewContext.eventDispatcher.emit([new NotebookLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);
    this.notebookOptions.updateOptions(this._readOnly);
    this._updateForOptions();
    this._updateForNotebookConfiguration();
    {
      this.viewModel.restoreEditorViewState(viewState);
      const contributionsState = viewState?.contributionsState || {};
      for (const [id, contribution] of this._contributions) {
        if (typeof contribution.restoreViewState === "function") {
          contribution.restoreViewState(contributionsState[id]);
        }
      }
    }
    this._localStore.add(this.viewModel.onDidChangeViewCells((e) => {
      this._onDidChangeViewCells.fire(e);
    }));
    this._localStore.add(this.viewModel.onDidChangeSelection(() => {
      this._onDidChangeSelection.fire();
      this.updateSelectedMarkdownPreviews();
    }));
    this._localStore.add(this._list.onWillScroll((e) => {
      if (this._webview?.isResolved()) {
        this._webviewTransparentCover.style.transform = `translateY(${e.scrollTop})`;
      }
    }));
    let hasPendingChangeContentHeight = false;
    const renderScrollHeightDisposable = this._localStore.add(new MutableDisposable());
    this._localStore.add(this._list.onDidChangeContentHeight(() => {
      if (hasPendingChangeContentHeight) {
        return;
      }
      hasPendingChangeContentHeight = true;
      renderScrollHeightDisposable.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.getDomNode()), () => {
        hasPendingChangeContentHeight = false;
        this._updateScrollHeight();
      }, 100);
    }));
    this._localStore.add(this._list.onDidRemoveOutputs((outputs) => {
      outputs.forEach((output) => this.removeInset(output));
    }));
    this._localStore.add(this._list.onDidHideOutputs((outputs) => {
      outputs.forEach((output) => this.hideInset(output));
    }));
    this._localStore.add(this._list.onDidRemoveCellsFromView((cells) => {
      const hiddenCells = [];
      const deletedCells = [];
      for (const cell of cells) {
        if (cell.cellKind === CellKind.Markup) {
          const mdCell = cell;
          if (this.viewModel?.viewCells.find((cell2) => cell2.handle === mdCell.handle)) {
            hiddenCells.push(mdCell);
          } else {
            deletedCells.push(mdCell);
          }
        }
      }
      this.hideMarkupPreviews(hiddenCells);
      this.deleteMarkupPreviews(deletedCells);
    }));
    await this._warmupWithMarkdownRenderer(this.viewModel, viewState, perf);
    perf?.mark("customMarkdownLoaded");
    this._localCellStateListeners = this.viewModel.viewCells.map((cell) => this._bindCellListener(cell));
    this._lastCellWithEditorFocus = this.viewModel.viewCells.find((viewCell) => this.getActiveCell() === viewCell && viewCell.focusMode === CellFocusMode.Editor) ?? null;
    this._localStore.add(this.viewModel.onDidChangeViewCells((e) => {
      if (this._isDisposed) {
        return;
      }
      [...e.splices].reverse().forEach((splice) => {
        const [start, deleted, newCells] = splice;
        const deletedCells = this._localCellStateListeners.splice(start, deleted, ...newCells.map((cell) => this._bindCellListener(cell)));
        dispose(deletedCells);
      });
      if (e.splices.some((s) => s[2].some((cell) => cell.cellKind === CellKind.Markup))) {
        this._backgroundMarkdownRendering();
      }
    }));
    if (this._dimension) {
      this._list.layout(this.getBodyHeight(this._dimension.height), this._dimension.width);
    } else {
      this._list.layout();
    }
    this._dndController?.clearGlobalDragState();
    this.restoreListViewState(viewState);
  }
  _bindCellListener(cell) {
    const store = new DisposableStore();
    store.add(cell.onDidChangeLayout((e) => {
      if (e.totalHeight || e.outerWidth) {
        this.layoutNotebookCell(cell, cell.layoutInfo.totalHeight, e.context);
      }
    }));
    if (cell.cellKind === CellKind.Code) {
      store.add(cell.onDidRemoveOutputs((outputs) => {
        outputs.forEach((output) => this.removeInset(output));
      }));
    }
    store.add(cell.onDidChangeState((e) => {
      if (e.inputCollapsedChanged && cell.isInputCollapsed && cell.cellKind === CellKind.Markup) {
        this.hideMarkupPreviews([cell]);
      }
      if (e.outputCollapsedChanged && cell.isOutputCollapsed && cell.cellKind === CellKind.Code) {
        cell.outputsViewModels.forEach((output) => this.hideInset(output));
      }
      if (e.focusModeChanged) {
        this._validateCellFocusMode(cell);
      }
    }));
    store.add(cell.onCellDecorationsChanged((e) => {
      e.added.forEach((options) => {
        if (options.className) {
          this.deltaCellContainerClassNames(cell.id, [options.className], [], cell.cellKind);
        }
        if (options.outputClassName) {
          this.deltaCellContainerClassNames(cell.id, [options.outputClassName], [], cell.cellKind);
        }
      });
      e.removed.forEach((options) => {
        if (options.className) {
          this.deltaCellContainerClassNames(cell.id, [], [options.className], cell.cellKind);
        }
        if (options.outputClassName) {
          this.deltaCellContainerClassNames(cell.id, [], [options.outputClassName], cell.cellKind);
        }
      });
    }));
    return store;
  }
  _validateCellFocusMode(cell) {
    if (cell.focusMode !== CellFocusMode.Editor) {
      return;
    }
    if (this._lastCellWithEditorFocus && this._lastCellWithEditorFocus !== cell) {
      this._lastCellWithEditorFocus.focusMode = CellFocusMode.Container;
    }
    this._lastCellWithEditorFocus = cell;
  }
  async _warmupWithMarkdownRenderer(viewModel, viewState, perf) {
    this.logService.debug("NotebookEditorWidget", "warmup " + this.viewModel?.uri.toString());
    await this._resolveWebview();
    perf?.mark("webviewCommLoaded");
    this.logService.debug("NotebookEditorWidget", "warmup - webview resolved");
    this._webview.element.style.visibility = "hidden";
    await this._warmupViewportMarkdownCells(viewModel, viewState);
    this.logService.debug("NotebookEditorWidget", "warmup - viewport warmed up");
    this._list.layout(0, 0);
    this._list.attachViewModel(viewModel);
    this._list.scrollTop = viewState?.scrollPosition?.top ?? 0;
    this._debug("finish initial viewport warmup and view state restore.");
    this._webview.element.style.visibility = "visible";
    this.logService.debug("NotebookEditorWidget", "warmup - list view model attached, set to visible");
    this._onDidAttachViewModel.fire();
  }
  async _warmupViewportMarkdownCells(viewModel, viewState) {
    if (viewState && viewState.cellTotalHeights) {
      const totalHeightCache = viewState.cellTotalHeights;
      const scrollTop = viewState.scrollPosition?.top ?? 0;
      const scrollBottom = scrollTop + Math.max(this._dimension?.height ?? 0, 1080);
      let offset = 0;
      const requests = [];
      for (let i = 0; i < viewModel.length; i++) {
        const cell = viewModel.cellAt(i);
        const cellHeight = totalHeightCache[i] ?? 0;
        if (offset + cellHeight < scrollTop) {
          offset += cellHeight;
          continue;
        }
        if (cell.cellKind === CellKind.Markup) {
          requests.push([cell, offset]);
        }
        offset += cellHeight;
        if (offset > scrollBottom) {
          break;
        }
      }
      await this._webview.initializeMarkup(requests.map(([model, offset2]) => this.createMarkupCellInitialization(model, offset2)));
    } else {
      const initRequests = viewModel.viewCells.filter((cell) => cell.cellKind === CellKind.Markup).slice(0, 5).map((cell) => this.createMarkupCellInitialization(cell, -1e4));
      await this._webview.initializeMarkup(initRequests);
      let offset = 0;
      const offsetUpdateRequests = [];
      const scrollBottom = Math.max(this._dimension?.height ?? 0, 1080);
      for (const cell of viewModel.viewCells) {
        if (cell.cellKind === CellKind.Markup) {
          offsetUpdateRequests.push({ id: cell.id, top: offset });
        }
        offset += cell.getHeight(this.getLayoutInfo().fontInfo.lineHeight);
        if (offset > scrollBottom) {
          break;
        }
      }
      this._webview?.updateScrollTops([], offsetUpdateRequests);
    }
  }
  createMarkupCellInitialization(model, offset) {
    return {
      mime: model.mime,
      cellId: model.id,
      cellHandle: model.handle,
      content: model.getText(),
      offset,
      visible: false,
      metadata: model.metadata
    };
  }
  restoreListViewState(viewState) {
    if (!this.viewModel) {
      return;
    }
    if (viewState?.scrollPosition !== void 0) {
      this._list.scrollTop = viewState.scrollPosition.top;
      this._list.scrollLeft = viewState.scrollPosition.left;
    } else {
      this._list.scrollTop = 0;
      this._list.scrollLeft = 0;
    }
    const focusIdx = typeof viewState?.focus === "number" ? viewState.focus : 0;
    if (focusIdx < this.viewModel.length) {
      const element = this.viewModel.cellAt(focusIdx);
      if (element) {
        this.viewModel?.updateSelectionsState({
          kind: SelectionStateType.Handle,
          primary: element.handle,
          selections: [element.handle]
        });
      }
    } else if (this._list.length > 0) {
      this.viewModel.updateSelectionsState({
        kind: SelectionStateType.Index,
        focus: { start: 0, end: 1 },
        selections: [{ start: 0, end: 1 }]
      });
    }
    if (viewState?.editorFocused) {
      const cell = this.viewModel.cellAt(focusIdx);
      if (cell) {
        cell.focusMode = CellFocusMode.Editor;
      }
    }
  }
  _restoreSelectedKernel(viewState) {
    if (viewState?.selectedKernelId && this.textModel) {
      const matching = this.notebookKernelService.getMatchingKernel(this.textModel);
      const kernel = matching.all.find((k) => k.id === viewState.selectedKernelId);
      if (kernel && !matching.selected) {
        this.notebookKernelService.selectKernelForNotebook(kernel, this.textModel);
      }
    }
  }
  getEditorViewState() {
    const state = this.viewModel?.getEditorViewState();
    if (!state) {
      return {
        editingCells: {},
        cellLineNumberStates: {},
        editorViewStates: {},
        collapsedInputCells: {},
        collapsedOutputCells: {}
      };
    }
    if (this._list) {
      state.scrollPosition = { left: this._list.scrollLeft, top: this._list.scrollTop };
      const cellHeights = {};
      for (let i = 0; i < this.viewModel.length; i++) {
        const elm = this.viewModel.cellAt(i);
        cellHeights[i] = elm.layoutInfo.totalHeight;
      }
      state.cellTotalHeights = cellHeights;
      if (this.viewModel) {
        const focusRange = this.viewModel.getFocus();
        const element = this.viewModel.cellAt(focusRange.start);
        if (element) {
          const itemDOM = this._list.domElementOfElement(element);
          const editorFocused = element.getEditState() === CellEditState.Editing && !!(itemDOM && itemDOM.ownerDocument.activeElement && itemDOM.contains(itemDOM.ownerDocument.activeElement));
          state.editorFocused = editorFocused;
          state.focus = focusRange.start;
        }
      }
    }
    const contributionsState = {};
    for (const [id, contribution] of this._contributions) {
      if (typeof contribution.saveViewState === "function") {
        contributionsState[id] = contribution.saveViewState();
      }
    }
    state.contributionsState = contributionsState;
    if (this.textModel?.uri.scheme === Schemas.untitled) {
      state.selectedKernelId = this.activeKernel?.id;
    }
    return state;
  }
  _allowScrollBeyondLastLine() {
    return this._scrollBeyondLastLine && !this.isReplHistory;
  }
  getBodyHeight(dimensionHeight) {
    return Math.max(dimensionHeight - (this._notebookTopToolbar?.useGlobalToolbar ? (
      /** Toolbar height */
      26
    ) : 0), 0);
  }
  layout(dimension, shadowElement, position) {
    if (!shadowElement && !this._shadowElement) {
      this._dimension = dimension;
      return;
    }
    if (dimension.width <= 0 || dimension.height <= 0) {
      this.onWillHide();
      return;
    }
    const whenContainerStylesLoaded = this.layoutService.whenContainerStylesLoaded(DOM.getWindow(this.getDomNode()));
    if (whenContainerStylesLoaded) {
      whenContainerStylesLoaded.then(() => this.layoutNotebook(dimension, shadowElement));
    } else {
      this.layoutNotebook(dimension, shadowElement);
    }
  }
  layoutNotebook(dimension, shadowElement) {
    if (shadowElement) {
      this._shadowElement = shadowElement;
    }
    this._dimension = dimension;
    const newBodyHeight = this.getBodyHeight(dimension.height) - this.getLayoutInfo().stickyHeight;
    DOM.size(this._body, dimension.width, newBodyHeight);
    const newCellListHeight = newBodyHeight;
    if (this._list.getRenderHeight() < newCellListHeight) {
      this._list.updateOptions({ paddingBottom: this._allowScrollBeyondLastLine() ? Math.max(0, newCellListHeight - 50) : 0, paddingTop: 0 });
      this._list.layout(newCellListHeight, dimension.width);
    } else {
      this._list.layout(newCellListHeight, dimension.width);
      this._list.updateOptions({ paddingBottom: this._allowScrollBeyondLastLine() ? Math.max(0, newCellListHeight - 50) : 0, paddingTop: 0 });
    }
    this._overlayContainer.inert = false;
    this.layoutContainerOverShadowElement(shadowElement ?? this._shadowElement);
    if (this._webviewTransparentCover) {
      this._webviewTransparentCover.style.height = `${dimension.height}px`;
      this._webviewTransparentCover.style.width = `${dimension.width}px`;
    }
    this._notebookTopToolbar.layout(this._dimension);
    this._notebookOverviewRuler.layout();
    this._viewContext?.eventDispatcher.emit([new NotebookLayoutChangedEvent({ width: true, fontInfo: true }, this.getLayoutInfo())]);
  }
  layoutContainerOverShadowElement(anchorElement) {
    if (!anchorElement) {
      return;
    }
    const modalEditorContainer = this.editorGroupsService.activeModalEditorPart?.modalElement;
    const isModal = DOM.isHTMLElement(modalEditorContainer) && modalEditorContainer.contains(anchorElement);
    const clippingContainer = isModal ? void 0 : this.layoutService.getContainer(DOM.getWindow(this.getDomNode()), Parts.EDITOR_PART);
    this._overlayContainer.style.visibility = "visible";
    this._overlayLayout.setAnchorElement(anchorElement, { clippingContainer });
    this._overlayLayout.reapplyLayoutStyles();
  }
  //#endregion
  //#region Focus tracker
  focus() {
    this._isVisible = true;
    this._editorFocus.set(true);
    if (this._webviewFocused) {
      this._webview?.focusWebview();
    } else {
      if (this.viewModel) {
        const focusRange = this.viewModel.getFocus();
        const element = this.viewModel.cellAt(focusRange.start);
        if (!this.hasEditorFocus()) {
          this.focusContainer();
          this.updateEditorFocus();
        }
        if (element && element.focusMode === CellFocusMode.Editor) {
          element.updateEditState(CellEditState.Editing, "editorWidget.focus");
          element.focusMode = CellFocusMode.Editor;
          this.focusEditor(element);
          return;
        }
      }
      this._list.domFocus();
    }
    if (this._currentProgress) {
      this.showProgress();
    }
  }
  onShow() {
    this._isVisible = true;
  }
  focusEditor(activeElement) {
    for (const [element, editor] of this._renderedEditors.entries()) {
      if (element === activeElement) {
        editor.focus();
        return;
      }
    }
  }
  focusContainer(clearSelection = false) {
    if (this._webviewFocused) {
      this._webview?.focusWebview();
    } else {
      this._list.focusContainer(clearSelection);
    }
  }
  selectOutputContent(cell) {
    this._webview?.selectOutputContents(cell);
  }
  selectInputContents(cell) {
    this._webview?.selectInputContents(cell);
  }
  onWillHide() {
    this._isVisible = false;
    this._editorFocus.set(false);
    this._overlayContainer.inert = true;
    this._overlayContainer.style.visibility = "hidden";
    this._overlayContainer.style.left = "-50000px";
    this._notebookTopToolbarContainer.style.display = "none";
    this.clearActiveCellWidgets();
  }
  clearActiveCellWidgets() {
    this._renderedEditors.forEach((editor, cell) => {
      if (this.getActiveCell() === cell && editor) {
        SuggestController.get(editor)?.cancelSuggestWidget();
        DropIntoEditorController.get(editor)?.clearWidgets();
        CopyPasteController.get(editor)?.clearWidgets();
      }
    });
    this._renderedEditors.forEach((editor, cell) => {
      const controller = InlineCompletionsController.get(editor);
      if (controller?.model.get()?.inlineEditState.get()) {
        editor.render(true);
      }
    });
  }
  editorHasDomFocus() {
    return DOM.isAncestorOfActiveElement(this.getDomNode());
  }
  updateEditorFocus() {
    this._focusTracker.refreshState();
    const focused = this.editorHasDomFocus();
    this._editorFocus.set(focused);
    this.viewModel?.setEditorFocus(focused);
  }
  updateCellFocusMode() {
    const activeCell = this.getActiveCell();
    if (activeCell?.focusMode === CellFocusMode.Output && !this._webviewFocused) {
      activeCell.focusMode = CellFocusMode.Container;
    }
  }
  hasEditorFocus() {
    this.updateEditorFocus();
    return this.editorHasDomFocus();
  }
  hasWebviewFocus() {
    return this._webviewFocused;
  }
  hasOutputTextSelection() {
    if (!this.hasEditorFocus()) {
      return false;
    }
    const windowSelection = DOM.getWindow(this.getDomNode()).getSelection();
    if (windowSelection?.rangeCount !== 1) {
      return false;
    }
    const activeSelection = windowSelection.getRangeAt(0);
    if (activeSelection.startContainer === activeSelection.endContainer && activeSelection.endOffset - activeSelection.startOffset === 0) {
      return false;
    }
    let container = activeSelection.commonAncestorContainer;
    if (!this._body.contains(container)) {
      return false;
    }
    while (container && container !== this._body) {
      if (container.classList && container.classList.contains("output")) {
        return true;
      }
      container = container.parentNode;
    }
    return false;
  }
  _didFocusOutputInputChange(hasFocus) {
    this._outputInputFocus.set(hasFocus);
  }
  //#endregion
  //#region Editor Features
  focusElement(cell) {
    this.viewModel?.updateSelectionsState({
      kind: SelectionStateType.Handle,
      primary: cell.handle,
      selections: [cell.handle]
    });
  }
  get scrollTop() {
    return this._list.scrollTop;
  }
  get scrollBottom() {
    return this._list.scrollTop + this._list.getRenderHeight();
  }
  getAbsoluteTopOfElement(cell) {
    return this._list.getCellViewScrollTop(cell);
  }
  getAbsoluteBottomOfElement(cell) {
    return this._list.getCellViewScrollBottom(cell);
  }
  getHeightOfElement(cell) {
    return this._list.elementHeight(cell);
  }
  scrollToBottom() {
    this._list.scrollToBottom();
  }
  setScrollTop(scrollTop) {
    this._list.scrollTop = scrollTop;
  }
  revealCellRangeInView(range) {
    return this._list.revealCells(range);
  }
  revealInView(cell) {
    return this._list.revealCell(cell, CellRevealType.Default);
  }
  revealInViewAtTop(cell) {
    this._list.revealCell(cell, CellRevealType.Top);
  }
  revealInCenter(cell) {
    this._list.revealCell(cell, CellRevealType.Center);
  }
  async revealInCenterIfOutsideViewport(cell) {
    await this._list.revealCell(cell, CellRevealType.CenterIfOutsideViewport);
  }
  async revealFirstLineIfOutsideViewport(cell) {
    await this._list.revealCell(cell, CellRevealType.FirstLineIfOutsideViewport);
  }
  async revealLineInViewAsync(cell, line) {
    return this._list.revealRangeInCell(cell, new Range(line, 1, line, 1), CellRevealRangeType.Default);
  }
  async revealLineInCenterAsync(cell, line) {
    return this._list.revealRangeInCell(cell, new Range(line, 1, line, 1), CellRevealRangeType.Center);
  }
  async revealLineInCenterIfOutsideViewportAsync(cell, line) {
    return this._list.revealRangeInCell(cell, new Range(line, 1, line, 1), CellRevealRangeType.CenterIfOutsideViewport);
  }
  async revealRangeInViewAsync(cell, range) {
    return this._list.revealRangeInCell(cell, range, CellRevealRangeType.Default);
  }
  async revealRangeInCenterAsync(cell, range) {
    return this._list.revealRangeInCell(cell, range, CellRevealRangeType.Center);
  }
  async revealRangeInCenterIfOutsideViewportAsync(cell, range) {
    return this._list.revealRangeInCell(cell, range, CellRevealRangeType.CenterIfOutsideViewport);
  }
  revealCellOffsetInCenter(cell, offset) {
    return this._list.revealCellOffsetInCenter(cell, offset);
  }
  revealOffsetInCenterIfOutsideViewport(offset) {
    return this._list.revealOffsetInCenterIfOutsideViewport(offset);
  }
  getViewIndexByModelIndex(index) {
    if (!this._listViewInfoAccessor) {
      return -1;
    }
    const cell = this.viewModel?.viewCells[index];
    if (!cell) {
      return -1;
    }
    return this._listViewInfoAccessor.getViewIndex(cell);
  }
  getViewHeight(cell) {
    if (!this._listViewInfoAccessor) {
      return -1;
    }
    return this._listViewInfoAccessor.getViewHeight(cell);
  }
  getCellRangeFromViewRange(startIndex, endIndex) {
    return this._listViewInfoAccessor.getCellRangeFromViewRange(startIndex, endIndex);
  }
  getCellsInRange(range) {
    return this._listViewInfoAccessor.getCellsInRange(range);
  }
  setCellEditorSelection(cell, range) {
    this._list.setCellEditorSelection(cell, range);
  }
  setHiddenAreas(_ranges) {
    return this._list.setHiddenAreas(_ranges, true);
  }
  getVisibleRangesPlusViewportAboveAndBelow() {
    return this._listViewInfoAccessor.getVisibleRangesPlusViewportAboveAndBelow();
  }
  //#endregion
  //#region Decorations
  deltaCellDecorations(oldDecorations, newDecorations) {
    const ret = this.viewModel?.deltaCellDecorations(oldDecorations, newDecorations) || [];
    this._onDidChangeDecorations.fire();
    return ret;
  }
  deltaCellContainerClassNames(cellId, added, removed, cellkind) {
    if (cellkind === CellKind.Markup) {
      this._webview?.deltaMarkupPreviewClassNames(cellId, added, removed);
    } else {
      this._webview?.deltaCellOutputContainerClassNames(cellId, added, removed);
    }
  }
  changeModelDecorations(callback) {
    return this.viewModel?.changeModelDecorations(callback) || null;
  }
  //#endregion
  //#region View Zones
  changeViewZones(callback) {
    this._list.changeViewZones(callback);
    this._onDidChangeLayout.fire();
  }
  getViewZoneLayoutInfo(id) {
    return this._list.getViewZoneLayoutInfo(id);
  }
  //#endregion
  //#region Overlay
  changeCellOverlays(callback) {
    this._list.changeCellOverlays(callback);
  }
  //#endregion
  //#region Kernel/Execution
  async _loadKernelPreloads() {
    if (!this.hasModel()) {
      return;
    }
    const { selected } = this.notebookKernelService.getMatchingKernel(this.textModel);
    if (!this._webview?.isResolved()) {
      await this._resolveWebview();
    }
    this._webview?.updateKernelPreloads(selected);
  }
  get activeKernel() {
    return this.textModel && this.notebookKernelService.getSelectedOrSuggestedKernel(this.textModel);
  }
  async cancelNotebookCells(cells) {
    if (!this.viewModel || !this.hasModel()) {
      return;
    }
    if (!cells) {
      cells = this.viewModel.viewCells;
    }
    return this.notebookExecutionService.cancelNotebookCellHandles(this.textModel, Array.from(cells).map((cell) => cell.handle));
  }
  async executeNotebookCells(cells) {
    if (!this.viewModel || !this.hasModel()) {
      this.logService.info("notebookEditorWidget", "No NotebookViewModel, cannot execute cells");
      return;
    }
    if (!cells) {
      cells = this.viewModel.viewCells;
    }
    return this.notebookExecutionService.executeNotebookCells(this.textModel, Array.from(cells).map((c) => c.model), this.scopedContextKeyService);
  }
  //#endregion
  async layoutNotebookCell(cell, height, context) {
    return this._cellLayoutManager?.layoutNotebookCell(cell, height);
  }
  getActiveCell() {
    const elements = this._list.getFocusedElements();
    if (elements && elements.length) {
      return elements[0];
    }
    return void 0;
  }
  _toggleNotebookCellSelection(selectedCell, selectFromPrevious) {
    const currentSelections = this._list.getSelectedElements();
    const isSelected = currentSelections.includes(selectedCell);
    const previousSelection = selectFromPrevious ? currentSelections[currentSelections.length - 1] ?? selectedCell : selectedCell;
    const selectedIndex = this._list.getViewIndex(selectedCell);
    const previousIndex = this._list.getViewIndex(previousSelection);
    const cellsInSelectionRange = this.getCellsInViewRange(selectedIndex, previousIndex);
    if (isSelected) {
      this._list.selectElements(currentSelections.filter((current) => !cellsInSelectionRange.includes(current)));
    } else {
      this.focusElement(selectedCell);
      this._list.selectElements([...currentSelections.filter((current) => !cellsInSelectionRange.includes(current)), ...cellsInSelectionRange]);
    }
  }
  getCellsInViewRange(fromInclusive, toInclusive) {
    const selectedCellsInRange = [];
    for (let index = 0; index < this._list.length; ++index) {
      const cell = this._list.element(index);
      if (cell) {
        if (index >= fromInclusive && index <= toInclusive || index >= toInclusive && index <= fromInclusive) {
          selectedCellsInRange.push(cell);
        }
      }
    }
    return selectedCellsInRange;
  }
  async focusNotebookCell(cell, focusItem, options) {
    if (this._isDisposed) {
      return;
    }
    cell.focusedOutputId = void 0;
    if (focusItem === "editor") {
      cell.isInputCollapsed = false;
      this.focusElement(cell);
      this._list.focusView();
      cell.updateEditState(CellEditState.Editing, "focusNotebookCell");
      cell.focusMode = CellFocusMode.Editor;
      if (!options?.skipReveal) {
        if (typeof options?.focusEditorLine === "number") {
          this._cursorNavMode.set(true);
          await this.revealLineInViewAsync(cell, options.focusEditorLine);
          const editor = this._renderedEditors.get(cell);
          const focusEditorLine = options.focusEditorLine;
          editor?.setSelection({
            startLineNumber: focusEditorLine,
            startColumn: 1,
            endLineNumber: focusEditorLine,
            endColumn: 1
          });
        } else {
          const selectionsStartPosition = cell.getSelectionsStartPosition();
          if (selectionsStartPosition?.length) {
            const firstSelectionPosition = selectionsStartPosition[0];
            await this.revealRangeInViewAsync(cell, Range.fromPositions(firstSelectionPosition, firstSelectionPosition));
          } else {
            await this.revealInView(cell);
          }
        }
      }
    } else if (focusItem === "output") {
      this.focusElement(cell);
      if (!this.hasEditorFocus()) {
        this._list.focusView();
      }
      if (!this._webview) {
        return;
      }
      const firstOutputId = cell.outputsViewModels.find((o) => o.model.alternativeOutputId)?.model.alternativeOutputId;
      const focusElementId = options?.outputId ?? firstOutputId ?? cell.id;
      this._webview.focusOutput(focusElementId, options?.altOutputId, options?.outputWebviewFocused || this._webviewFocused);
      cell.updateEditState(CellEditState.Preview, "focusNotebookCell");
      cell.focusMode = CellFocusMode.Output;
      cell.focusedOutputId = options?.outputId;
      this._outputFocus.set(true);
      if (!options?.skipReveal) {
        this.revealInCenterIfOutsideViewport(cell);
      }
    } else {
      const itemDOM = this._list.domElementOfElement(cell);
      if (itemDOM && itemDOM.ownerDocument.activeElement && itemDOM.contains(itemDOM.ownerDocument.activeElement)) {
        itemDOM.ownerDocument.activeElement.blur();
      }
      this._webview?.blurOutput();
      cell.updateEditState(CellEditState.Preview, "focusNotebookCell");
      cell.focusMode = CellFocusMode.Container;
      this.focusElement(cell);
      if (!options?.skipReveal) {
        if (typeof options?.focusEditorLine === "number") {
          this._cursorNavMode.set(true);
          await this.revealInView(cell);
        } else if (options?.revealBehavior === ScrollToRevealBehavior.firstLine) {
          await this.revealFirstLineIfOutsideViewport(cell);
        } else if (options?.revealBehavior === ScrollToRevealBehavior.fullCell) {
          await this.revealInView(cell);
        } else {
          await this.revealInCenterIfOutsideViewport(cell);
        }
      }
      this._list.focusView();
      this.updateEditorFocus();
    }
  }
  async focusNextNotebookCell(cell, focusItem) {
    const idx = this.viewModel?.getCellIndex(cell);
    if (typeof idx !== "number") {
      return;
    }
    const newCell = this.viewModel?.cellAt(idx + 1);
    if (!newCell) {
      return;
    }
    await this.focusNotebookCell(newCell, focusItem);
  }
  //#endregion
  //#region Find
  async _warmupCell(viewCell) {
    if (viewCell.isOutputCollapsed) {
      return;
    }
    const outputs = viewCell.outputsViewModels;
    for (const output of outputs.slice(0, outputDisplayLimit)) {
      const [mimeTypes, pick] = output.resolveMimeTypes(this.textModel, void 0);
      if (!mimeTypes.find((mimeType) => mimeType.isTrusted) || mimeTypes.length === 0) {
        continue;
      }
      const pickedMimeTypeRenderer = mimeTypes[pick];
      if (!pickedMimeTypeRenderer) {
        return;
      }
      const renderer = this._notebookService.getRendererInfo(pickedMimeTypeRenderer.rendererId);
      if (!renderer) {
        return;
      }
      const result = { type: RenderOutputType.Extension, renderer, source: output, mimeType: pickedMimeTypeRenderer.mimeType };
      const inset = this._webview?.insetMapping.get(result.source);
      if (!inset || !inset.initialized) {
        const p = new Promise((resolve) => {
          this._register(Event.any(this.onDidRenderOutput, this.onDidRemoveOutput)((e) => {
            if (e.model === result.source.model) {
              resolve();
            }
          }));
        });
        this.createOutput(viewCell, result, 0, false);
        await p;
      } else {
        this.createOutput(viewCell, result, 0, false);
      }
      return;
    }
  }
  async _warmupAll(includeOutput) {
    if (!this.hasModel() || !this.viewModel) {
      return;
    }
    const cells = this.viewModel.viewCells;
    const requests = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].cellKind === CellKind.Markup && !this._webview.markupPreviewMapping.has(cells[i].id)) {
        requests.push(this.createMarkupPreview(cells[i]));
      }
    }
    if (includeOutput && this._list) {
      for (let i = 0; i < this._list.length; i++) {
        const cell = this._list.element(i);
        if (cell?.cellKind === CellKind.Code) {
          requests.push(this._warmupCell(cell));
        }
      }
    }
    return Promise.all(requests);
  }
  async _warmupSelection(includeOutput, selectedCellRanges) {
    if (!this.hasModel() || !this.viewModel) {
      return;
    }
    const cells = this.viewModel.viewCells;
    const requests = [];
    for (const range of selectedCellRanges) {
      for (let i = range.start; i < range.end; i++) {
        if (cells[i].cellKind === CellKind.Markup && !this._webview.markupPreviewMapping.has(cells[i].id)) {
          requests.push(this.createMarkupPreview(cells[i]));
        }
      }
    }
    if (includeOutput && this._list) {
      for (const range of selectedCellRanges) {
        for (let i = range.start; i < range.end; i++) {
          const cell = this._list.element(i);
          if (cell?.cellKind === CellKind.Code) {
            requests.push(this._warmupCell(cell));
          }
        }
      }
    }
    return Promise.all(requests);
  }
  async find(query, options, token, skipWarmup = false, shouldGetSearchPreviewInfo = false, ownerID) {
    if (!this._notebookViewModel) {
      return [];
    }
    if (!ownerID) {
      ownerID = this.getId();
    }
    const findMatches = this._notebookViewModel.find(query, options).filter((match) => match.length > 0);
    if (!options.includeMarkupPreview && !options.includeOutput || options.findScope?.findScopeType === NotebookFindScopeType.Text) {
      this._webview?.findStop(ownerID);
      return findMatches;
    }
    const matchMap = {};
    findMatches.forEach((match) => {
      matchMap[match.cell.id] = match;
    });
    if (this._webview) {
      const start = Date.now();
      if (options.findScope && options.findScope.findScopeType === NotebookFindScopeType.Cells && options.findScope.selectedCellRanges) {
        await this._warmupSelection(!!options.includeOutput, options.findScope.selectedCellRanges);
      } else {
        await this._warmupAll(!!options.includeOutput);
      }
      const end = Date.now();
      this.logService.debug("Find", `Warmup time: ${end - start}ms`);
      if (token.isCancellationRequested) {
        return [];
      }
      let findIds = [];
      if (options.findScope && options.findScope.findScopeType === NotebookFindScopeType.Cells && options.findScope.selectedCellRanges) {
        const selectedIndexes = cellRangesToIndexes(options.findScope.selectedCellRanges);
        findIds = selectedIndexes.map((index) => this._notebookViewModel?.viewCells[index].id ?? "");
      }
      const webviewMatches = await this._webview.find(query, { caseSensitive: options.caseSensitive, wholeWord: options.wholeWord, includeMarkup: !!options.includeMarkupPreview, includeOutput: !!options.includeOutput, shouldGetSearchPreviewInfo, ownerID, findIds });
      if (token.isCancellationRequested) {
        return [];
      }
      webviewMatches.forEach((match) => {
        const cell = this._notebookViewModel.viewCells.find((cell2) => cell2.id === match.cellId);
        if (!cell) {
          return;
        }
        if (match.type === "preview") {
          if (cell.getEditState() === CellEditState.Preview && !options.includeMarkupPreview) {
            return;
          }
          if (cell.getEditState() === CellEditState.Editing && options.includeMarkupInput) {
            return;
          }
        } else {
          if (!options.includeOutput) {
            return;
          }
        }
        const exisitingMatch = matchMap[match.cellId];
        if (exisitingMatch) {
          exisitingMatch.webviewMatches.push(match);
        } else {
          matchMap[match.cellId] = new CellFindMatchModel(
            this._notebookViewModel.viewCells.find((cell2) => cell2.id === match.cellId),
            this._notebookViewModel.viewCells.findIndex((cell2) => cell2.id === match.cellId),
            [],
            [match]
          );
        }
      });
    }
    const ret = [];
    this._notebookViewModel.viewCells.forEach((cell, index) => {
      if (matchMap[cell.id]) {
        ret.push(new CellFindMatchModel(cell, index, matchMap[cell.id].contentMatches, matchMap[cell.id].webviewMatches));
      }
    });
    return ret;
  }
  async findHighlightCurrent(matchIndex, ownerID) {
    if (!this._webview) {
      return 0;
    }
    return this._webview?.findHighlightCurrent(matchIndex, ownerID ?? this.getId());
  }
  async findUnHighlightCurrent(matchIndex, ownerID) {
    if (!this._webview) {
      return;
    }
    return this._webview?.findUnHighlightCurrent(matchIndex, ownerID ?? this.getId());
  }
  findStop(ownerID) {
    this._webview?.findStop(ownerID ?? this.getId());
  }
  //#endregion
  //#region MISC
  getLayoutInfo() {
    if (!this._list) {
      throw new Error("Editor is not initalized successfully");
    }
    if (!this._fontInfo) {
      this._generateFontInfo();
    }
    let listViewOffset = 0;
    if (this._dimension) {
      listViewOffset = (this._notebookTopToolbar?.useGlobalToolbar ? (
        /** Toolbar height */
        26
      ) : 0) + (this._notebookStickyScroll?.getCurrentStickyHeight() ?? 0);
    }
    return {
      width: this._dimension?.width ?? 0,
      height: this._dimension?.height ?? 0,
      scrollHeight: this._list?.getScrollHeight() ?? 0,
      fontInfo: this._fontInfo,
      stickyHeight: this._notebookStickyScroll?.getCurrentStickyHeight() ?? 0,
      listViewOffsetTop: listViewOffset
    };
  }
  async createMarkupPreview(cell) {
    if (!this._webview) {
      return;
    }
    if (!this._webview.isResolved()) {
      await this._resolveWebview();
    }
    if (!this._webview || !this._list.webviewElement) {
      return;
    }
    if (!this.viewModel || !this._list.viewModel) {
      return;
    }
    if (this.viewModel.getCellIndex(cell) === -1) {
      return;
    }
    if (this.cellIsHidden(cell)) {
      return;
    }
    const webviewTop = parseInt(this._list.webviewElement.domNode.style.top, 10);
    const top = !!webviewTop ? 0 - webviewTop : 0;
    const cellTop = this._list.getCellViewScrollTop(cell);
    await this._webview.showMarkupPreview({
      mime: cell.mime,
      cellHandle: cell.handle,
      cellId: cell.id,
      content: cell.getText(),
      offset: cellTop + top,
      visible: true,
      metadata: cell.metadata
    });
  }
  cellIsHidden(cell) {
    const modelIndex = this.viewModel.getCellIndex(cell);
    const foldedRanges = this.viewModel.getHiddenRanges();
    return foldedRanges.some((range) => modelIndex >= range.start && modelIndex <= range.end);
  }
  async unhideMarkupPreviews(cells) {
    if (!this._webview) {
      return;
    }
    if (!this._webview.isResolved()) {
      await this._resolveWebview();
    }
    await this._webview?.unhideMarkupPreviews(cells.map((cell) => cell.id));
  }
  async hideMarkupPreviews(cells) {
    if (!this._webview || !cells.length) {
      return;
    }
    if (!this._webview.isResolved()) {
      await this._resolveWebview();
    }
    await this._webview?.hideMarkupPreviews(cells.map((cell) => cell.id));
  }
  async deleteMarkupPreviews(cells) {
    if (!this._webview) {
      return;
    }
    if (!this._webview.isResolved()) {
      await this._resolveWebview();
    }
    await this._webview?.deleteMarkupPreviews(cells.map((cell) => cell.id));
  }
  async updateSelectedMarkdownPreviews() {
    if (!this._webview) {
      return;
    }
    if (!this._webview.isResolved()) {
      await this._resolveWebview();
    }
    const selectedCells = this.getSelectionViewModels().map((cell) => cell.id);
    await this._webview?.updateMarkupPreviewSelections(selectedCells.length > 1 ? selectedCells : []);
  }
  async createOutput(cell, output, offset, createWhenIdle) {
    this._insetModifyQueueByOutputId.queue(output.source.model.outputId, async () => {
      if (this._isDisposed || !this._webview) {
        return;
      }
      if (!this._webview.isResolved()) {
        await this._resolveWebview();
      }
      if (!this._webview) {
        return;
      }
      if (!this._list.webviewElement) {
        return;
      }
      if (output.type === RenderOutputType.Extension) {
        this.notebookRendererMessaging.prepare(output.renderer.id);
      }
      const webviewTop = parseInt(this._list.webviewElement.domNode.style.top, 10);
      const top = !!webviewTop ? 0 - webviewTop : 0;
      const cellTop = this._list.getCellViewScrollTop(cell) + top;
      const existingOutput = this._webview.insetMapping.get(output.source);
      if (!existingOutput || !existingOutput.renderer && output.type === RenderOutputType.Extension) {
        if (createWhenIdle) {
          this._webview.requestCreateOutputWhenWebviewIdle({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri, executionId: cell.internalMetadata.executionId }, output, cellTop, offset);
        } else {
          this._webview.createOutput({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri, executionId: cell.internalMetadata.executionId }, output, cellTop, offset);
        }
      } else if (existingOutput.renderer && output.type === RenderOutputType.Extension && existingOutput.renderer.id !== output.renderer.id) {
        this._webview.removeInsets([output.source]);
        this._webview.createOutput({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri }, output, cellTop, offset);
      } else if (existingOutput.versionId !== output.source.model.versionId) {
        this._webview.updateOutput({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri, executionId: cell.internalMetadata.executionId }, output, cellTop, offset);
      } else {
        const outputIndex = cell.outputsViewModels.indexOf(output.source);
        const outputOffset = cell.getOutputOffset(outputIndex);
        this._webview.updateScrollTops([{
          cell,
          output: output.source,
          cellTop,
          outputOffset,
          forceDisplay: !cell.isOutputCollapsed
        }], []);
      }
    });
  }
  async updateOutput(cell, output, offset) {
    this._insetModifyQueueByOutputId.queue(output.source.model.outputId, async () => {
      if (this._isDisposed || !this._webview || cell.isOutputCollapsed) {
        return;
      }
      if (!this._webview.isResolved()) {
        await this._resolveWebview();
      }
      if (!this._webview || !this._list.webviewElement) {
        return;
      }
      if (!this._webview.insetMapping.has(output.source)) {
        return this.createOutput(cell, output, offset, false);
      }
      if (output.type === RenderOutputType.Extension) {
        this.notebookRendererMessaging.prepare(output.renderer.id);
      }
      const webviewTop = parseInt(this._list.webviewElement.domNode.style.top, 10);
      const top = !!webviewTop ? 0 - webviewTop : 0;
      const cellTop = this._list.getCellViewScrollTop(cell) + top;
      this._webview.updateOutput({ cellId: cell.id, cellHandle: cell.handle, cellUri: cell.uri }, output, cellTop, offset);
    });
  }
  async copyOutputImage(cellOutput) {
    this._webview?.copyImage(cellOutput);
  }
  removeInset(output) {
    this._insetModifyQueueByOutputId.queue(output.model.outputId, async () => {
      if (this._isDisposed || !this._webview) {
        return;
      }
      if (this._webview?.isResolved()) {
        this._webview.removeInsets([output]);
      }
      this._onDidRemoveOutput.fire(output);
    });
  }
  hideInset(output) {
    this._insetModifyQueueByOutputId.queue(output.model.outputId, async () => {
      if (this._isDisposed || !this._webview) {
        return;
      }
      if (this._webview?.isResolved()) {
        this._webview.hideInset(output);
      }
    });
  }
  //#region --- webview IPC ----
  postMessage(message) {
    if (this._webview?.isResolved()) {
      this._webview.postKernelMessage(message);
    }
  }
  //#endregion
  addClassName(className) {
    this._overlayContainer.classList.add(className);
  }
  removeClassName(className) {
    this._overlayContainer.classList.remove(className);
  }
  cellAt(index) {
    return this.viewModel?.cellAt(index);
  }
  getCellByInfo(cellInfo) {
    const { cellHandle } = cellInfo;
    return this.viewModel?.viewCells.find((vc) => vc.handle === cellHandle);
  }
  getCellByHandle(handle) {
    return this.viewModel?.getCellByHandle(handle);
  }
  getCellIndex(cell) {
    return this.viewModel?.getCellIndexByHandle(cell.handle);
  }
  getNextVisibleCellIndex(index) {
    return this.viewModel?.getNextVisibleCellIndex(index);
  }
  getPreviousVisibleCellIndex(index) {
    return this.viewModel?.getPreviousVisibleCellIndex(index);
  }
  _updateScrollHeight() {
    if (this._isDisposed || !this._webview?.isResolved()) {
      return;
    }
    if (!this._list.webviewElement) {
      return;
    }
    const scrollHeight = this._list.scrollHeight;
    this._webview.element.style.height = `${scrollHeight + NOTEBOOK_WEBVIEW_BOUNDARY * 2}px`;
    const webviewTop = parseInt(this._list.webviewElement.domNode.style.top, 10);
    const top = !!webviewTop ? 0 - webviewTop : 0;
    const updateItems = [];
    const removedItems = [];
    this._webview?.insetMapping.forEach((value, key) => {
      const cell = this.viewModel?.getCellByHandle(value.cellInfo.cellHandle);
      if (!cell || !(cell instanceof CodeCellViewModel)) {
        return;
      }
      const viewIndex = this._list.getViewIndex(cell);
      if (viewIndex === void 0) {
        return;
      }
      const outputIndex = cell.outputsViewModels.indexOf(key);
      if (outputIndex < 0) {
        removedItems.push(key);
        return;
      }
      const cellTop = this._list.getCellViewScrollTop(cell);
      const outputOffset = cell.getOutputOffset(outputIndex);
      updateItems.push({
        cell,
        output: key,
        cellTop: cellTop + top,
        outputOffset,
        forceDisplay: false
      });
    });
    this._webview.removeInsets(removedItems);
    const markdownUpdateItems = [];
    for (const cellId of this._webview.markupPreviewMapping.keys()) {
      const cell = this.viewModel?.viewCells.find((cell2) => cell2.id === cellId);
      if (cell) {
        const cellTop = this._list.getCellViewScrollTop(cell);
        markdownUpdateItems.push({ id: cellId, top: cellTop + top });
      }
    }
    if (markdownUpdateItems.length || updateItems.length) {
      this._debug("_list.onDidChangeContentHeight/markdown", markdownUpdateItems);
      this._webview?.updateScrollTops(updateItems, markdownUpdateItems);
    }
  }
  //#endregion
  //#region BacklayerWebview delegate
  _updateOutputHeight(cellInfo, output, outputHeight, isInit, source) {
    const cell = this.viewModel?.viewCells.find((vc) => vc.handle === cellInfo.cellHandle);
    if (cell && cell instanceof CodeCellViewModel) {
      const outputIndex = cell.outputsViewModels.indexOf(output);
      if (outputIndex > -1) {
        this._debug("update cell output", cell.handle, outputHeight);
        cell.updateOutputHeight(outputIndex, outputHeight, source);
        this.layoutNotebookCell(cell, cell.layoutInfo.totalHeight);
        if (isInit) {
          this._onDidRenderOutput.fire(output);
        }
      } else {
        this._debug("tried to update cell output that does not exist");
      }
    }
  }
  _scheduleOutputHeightAck(cellInfo, outputId, height) {
    const wasEmpty = this._pendingOutputHeightAcks.size === 0;
    this._pendingOutputHeightAcks.set(outputId, { cellId: cellInfo.cellId, outputId, height });
    if (wasEmpty) {
      DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.getDomNode()), () => {
        this._debug("ack height");
        this._updateScrollHeight();
        this._webview?.ackHeight([...this._pendingOutputHeightAcks.values()]);
        this._pendingOutputHeightAcks.clear();
      }, -1);
    }
  }
  _getCellById(cellId) {
    return this.viewModel?.viewCells.find((vc) => vc.id === cellId);
  }
  _updateMarkupCellHeight(cellId, height, isInit) {
    const cell = this._getCellById(cellId);
    if (cell && cell instanceof MarkupCellViewModel) {
      const { bottomToolbarGap } = this._notebookOptions.computeBottomToolbarDimensions(this.viewModel?.viewType);
      this._debug("updateMarkdownCellHeight", cell.handle, height + bottomToolbarGap, isInit);
      cell.renderedMarkdownHeight = height;
    }
  }
  _setMarkupCellEditState(cellId, editState) {
    const cell = this._getCellById(cellId);
    if (cell instanceof MarkupCellViewModel) {
      this.revealInView(cell);
      cell.updateEditState(editState, "setMarkdownCellEditState");
    }
  }
  _didStartDragMarkupCell(cellId, event) {
    const cell = this._getCellById(cellId);
    if (cell instanceof MarkupCellViewModel) {
      const webviewOffset = this._list.webviewElement ? -parseInt(this._list.webviewElement.domNode.style.top, 10) : 0;
      this._dndController?.startExplicitDrag(cell, event.dragOffsetY - webviewOffset);
    }
  }
  _didDragMarkupCell(cellId, event) {
    const cell = this._getCellById(cellId);
    if (cell instanceof MarkupCellViewModel) {
      const webviewOffset = this._list.webviewElement ? -parseInt(this._list.webviewElement.domNode.style.top, 10) : 0;
      this._dndController?.explicitDrag(cell, event.dragOffsetY - webviewOffset);
    }
  }
  _didDropMarkupCell(cellId, event) {
    const cell = this._getCellById(cellId);
    if (cell instanceof MarkupCellViewModel) {
      const webviewOffset = this._list.webviewElement ? -parseInt(this._list.webviewElement.domNode.style.top, 10) : 0;
      event.dragOffsetY -= webviewOffset;
      this._dndController?.explicitDrop(cell, event);
    }
  }
  _didEndDragMarkupCell(cellId) {
    const cell = this._getCellById(cellId);
    if (cell instanceof MarkupCellViewModel) {
      this._dndController?.endExplicitDrag(cell);
    }
  }
  _didResizeOutput(cellId) {
    const cell = this._getCellById(cellId);
    if (cell) {
      this._onDidResizeOutputEmitter.fire(cell);
    }
  }
  _updatePerformanceMetadata(cellId, executionId, duration, rendererId) {
    if (!this.hasModel()) {
      return;
    }
    const cell = this._getCellById(cellId);
    const cellIndex = !cell ? void 0 : this.getCellIndex(cell);
    if (cell?.internalMetadata.executionId === executionId && cellIndex !== void 0) {
      const renderDurationMap = cell.internalMetadata.renderDuration || {};
      renderDurationMap[rendererId] = (renderDurationMap[rendererId] ?? 0) + duration;
      this.textModel.applyEdits([
        {
          editType: CellEditType.PartialInternalMetadata,
          index: cellIndex,
          internalMetadata: {
            executionId,
            renderDuration: renderDurationMap
          }
        }
      ], true, void 0, () => void 0, void 0, false);
    }
  }
  //#endregion
  //#region Editor Contributions
  getContribution(id) {
    return this._contributions.get(id) || null;
  }
  //#endregion
  dispose() {
    this._isDisposed = true;
    this._webview?.dispose();
    this._webview = null;
    this.notebookEditorService.removeNotebookEditor(this);
    dispose(this._contributions.values());
    this._contributions.clear();
    this._localStore.clear();
    dispose(this._localCellStateListeners);
    this._list.dispose();
    this._cellLayoutManager?.dispose();
    this._listTopCellToolbar?.dispose();
    this._overlayContainer.remove();
    this.viewModel?.dispose();
    this._renderedEditors.clear();
    this._baseCellEditorOptions.forEach((v) => v.dispose());
    this._baseCellEditorOptions.clear();
    this._notebookOverviewRulerContainer.remove();
    super.dispose();
    this._webview = null;
    this._webviewResolvePromise = null;
    this._webviewTransparentCover = null;
    this._dndController = null;
    this._listTopCellToolbar = null;
    this._notebookViewModel = void 0;
    this._cellContextKeyManager = null;
    this._notebookTopToolbar = null;
    this._list = null;
    this._listViewInfoAccessor = null;
    this._listDelegate = null;
  }
  toJSON() {
    return {
      notebookUri: this.viewModel?.uri
    };
  }
};
NotebookEditorWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IEditorGroupsService),
  __decorateParam(4, INotebookRendererMessagingService),
  __decorateParam(5, INotebookEditorService),
  __decorateParam(6, INotebookKernelService),
  __decorateParam(7, INotebookService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IWorkbenchLayoutService),
  __decorateParam(11, IContextMenuService),
  __decorateParam(12, ITelemetryService),
  __decorateParam(13, INotebookExecutionService),
  __decorateParam(14, IEditorProgressService),
  __decorateParam(15, INotebookLoggingService)
], NotebookEditorWidget);
registerZIndex(ZIndex.Base, 5, "notebook-progress-bar");
registerZIndex(ZIndex.Base, 10, "notebook-list-insertion-indicator");
registerZIndex(ZIndex.Base, 20, "notebook-cell-editor-outline");
registerZIndex(ZIndex.Base, 25, "notebook-scrollbar");
registerZIndex(ZIndex.Base, 26, "notebook-cell-status");
registerZIndex(ZIndex.Base, 26, "notebook-folding-indicator");
registerZIndex(ZIndex.Base, 27, "notebook-output");
registerZIndex(ZIndex.Base, 28, "notebook-cell-bottom-toolbar-container");
registerZIndex(ZIndex.Base, 29, "notebook-run-button-container");
registerZIndex(ZIndex.Base, 29, "notebook-input-collapse-condicon");
registerZIndex(ZIndex.Base, 30, "notebook-cell-output-toolbar");
registerZIndex(ZIndex.Sash, 1, "notebook-cell-expand-part-button");
registerZIndex(ZIndex.Sash, 2, "notebook-cell-toolbar");
registerZIndex(ZIndex.Sash, 3, "notebook-cell-toolbar-dropdown-active");
const notebookCellBorder = registerColor("notebook.cellBorderColor", {
  dark: transparent(listInactiveSelectionBackground, 1),
  light: transparent(listInactiveSelectionBackground, 1),
  hcDark: PANEL_BORDER,
  hcLight: PANEL_BORDER
}, nls.localize("notebook.cellBorderColor", "The border color for notebook cells."));
const focusedEditorBorderColor = registerColor("notebook.focusedEditorBorder", focusBorder, nls.localize("notebook.focusedEditorBorder", "The color of the notebook cell editor border."));
const cellStatusIconSuccess = registerColor("notebookStatusSuccessIcon.foreground", debugIconStartForeground, nls.localize("notebookStatusSuccessIcon.foreground", "The error icon color of notebook cells in the cell status bar."));
const runningCellRulerDecorationColor = registerColor("notebookEditorOverviewRuler.runningCellForeground", debugIconStartForeground, nls.localize("notebookEditorOverviewRuler.runningCellForeground", "The color of the running cell decoration in the notebook editor overview ruler."));
const cellStatusIconError = registerColor("notebookStatusErrorIcon.foreground", errorForeground, nls.localize("notebookStatusErrorIcon.foreground", "The error icon color of notebook cells in the cell status bar."));
const cellStatusIconRunning = registerColor("notebookStatusRunningIcon.foreground", foreground, nls.localize("notebookStatusRunningIcon.foreground", "The running icon color of notebook cells in the cell status bar."));
const notebookOutputContainerBorderColor = registerColor("notebook.outputContainerBorderColor", null, nls.localize("notebook.outputContainerBorderColor", "The border color of the notebook output container."));
const notebookOutputContainerColor = registerColor("notebook.outputContainerBackgroundColor", null, nls.localize("notebook.outputContainerBackgroundColor", "The color of the notebook output container background."));
const CELL_TOOLBAR_SEPERATOR = registerColor("notebook.cellToolbarSeparator", {
  dark: Color.fromHex("#808080").transparent(0.35),
  light: Color.fromHex("#808080").transparent(0.35),
  hcDark: contrastBorder,
  hcLight: contrastBorder
}, nls.localize("notebook.cellToolbarSeparator", "The color of the separator in the cell bottom toolbar"));
const focusedCellBackground = registerColor("notebook.focusedCellBackground", null, nls.localize("focusedCellBackground", "The background color of a cell when the cell is focused."));
const selectedCellBackground = registerColor("notebook.selectedCellBackground", {
  dark: listInactiveSelectionBackground,
  light: listInactiveSelectionBackground,
  hcDark: null,
  hcLight: null
}, nls.localize("selectedCellBackground", "The background color of a cell when the cell is selected."));
const cellHoverBackground = registerColor("notebook.cellHoverBackground", {
  dark: transparent(focusedCellBackground, 0.5),
  light: transparent(focusedCellBackground, 0.7),
  hcDark: null,
  hcLight: null
}, nls.localize("notebook.cellHoverBackground", "The background color of a cell when the cell is hovered."));
const selectedCellBorder = registerColor("notebook.selectedCellBorder", {
  dark: notebookCellBorder,
  light: notebookCellBorder,
  hcDark: contrastBorder,
  hcLight: contrastBorder
}, nls.localize("notebook.selectedCellBorder", "The color of the cell's top and bottom border when the cell is selected but not focused."));
const inactiveSelectedCellBorder = registerColor("notebook.inactiveSelectedCellBorder", {
  dark: null,
  light: null,
  hcDark: focusBorder,
  hcLight: focusBorder
}, nls.localize("notebook.inactiveSelectedCellBorder", "The color of the cell's borders when multiple cells are selected."));
const focusedCellBorder = registerColor("notebook.focusedCellBorder", focusBorder, nls.localize("notebook.focusedCellBorder", "The color of the cell's focus indicator borders when the cell is focused."));
const inactiveFocusedCellBorder = registerColor("notebook.inactiveFocusedCellBorder", notebookCellBorder, nls.localize("notebook.inactiveFocusedCellBorder", "The color of the cell's top and bottom border when a cell is focused while the primary focus is outside of the editor."));
const cellStatusBarItemHover = registerColor("notebook.cellStatusBarItemHoverBackground", {
  light: new Color(new RGBA(0, 0, 0, 0.08)),
  dark: new Color(new RGBA(255, 255, 255, 0.15)),
  hcDark: new Color(new RGBA(255, 255, 255, 0.15)),
  hcLight: new Color(new RGBA(0, 0, 0, 0.08))
}, nls.localize("notebook.cellStatusBarItemHoverBackground", "The background color of notebook cell status bar items."));
const cellInsertionIndicator = registerColor("notebook.cellInsertionIndicator", focusBorder, nls.localize("notebook.cellInsertionIndicator", "The color of the notebook cell insertion indicator."));
const listScrollbarSliderBackground = registerColor("notebookScrollbarSlider.background", scrollbarSliderBackground, nls.localize("notebookScrollbarSliderBackground", "Notebook scrollbar slider background color."));
const listScrollbarSliderHoverBackground = registerColor("notebookScrollbarSlider.hoverBackground", scrollbarSliderHoverBackground, nls.localize("notebookScrollbarSliderHoverBackground", "Notebook scrollbar slider background color when hovering."));
const listScrollbarSliderActiveBackground = registerColor("notebookScrollbarSlider.activeBackground", scrollbarSliderActiveBackground, nls.localize("notebookScrollbarSliderActiveBackground", "Notebook scrollbar slider background color when clicked on."));
const cellSymbolHighlight = registerColor("notebook.symbolHighlightBackground", {
  dark: Color.fromHex("#ffffff0b"),
  light: Color.fromHex("#fdff0033"),
  hcDark: null,
  hcLight: null
}, nls.localize("notebook.symbolHighlightBackground", "Background color of highlighted cell"));
const cellEditorBackground = registerColor("notebook.cellEditorBackground", {
  light: SIDE_BAR_BACKGROUND,
  dark: SIDE_BAR_BACKGROUND,
  hcDark: null,
  hcLight: null
}, nls.localize("notebook.cellEditorBackground", "Cell editor background color."));
const notebookEditorBackground = registerColor("notebook.editorBackground", {
  light: EDITOR_PANE_BACKGROUND,
  dark: EDITOR_PANE_BACKGROUND,
  hcDark: null,
  hcLight: null
}, nls.localize("notebook.editorBackground", "Notebook background color."));
export {
  CELL_TOOLBAR_SEPERATOR,
  NotebookEditorWidget,
  cellEditorBackground,
  cellHoverBackground,
  cellInsertionIndicator,
  cellStatusBarItemHover,
  cellStatusIconError,
  cellStatusIconRunning,
  cellStatusIconSuccess,
  cellSymbolHighlight,
  focusedCellBackground,
  focusedCellBorder,
  focusedEditorBorderColor,
  getDefaultNotebookCreationOptions,
  inactiveFocusedCellBorder,
  inactiveSelectedCellBorder,
  listScrollbarSliderActiveBackground,
  listScrollbarSliderBackground,
  listScrollbarSliderHoverBackground,
  notebookCellBorder,
  notebookOutputContainerBorderColor,
  notebookOutputContainerColor,
  runningCellRulerDecorationColor,
  selectedCellBackground,
  selectedCellBorder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tFZGl0b3JXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvbm90ZWJvb2suY3NzJztcbmltcG9ydCAnLi9tZWRpYS9ub3RlYm9va0NlbGxDaGF0LmNzcyc7XG5pbXBvcnQgJy4vbWVkaWEvbm90ZWJvb2tDZWxsRWRpdG9ySGludC5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL25vdGVib29rQ2VsbEluc2VydFRvb2xiYXIuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9ub3RlYm9va0NlbGxTdGF0dXNCYXIuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9ub3RlYm9va0NlbGxUaXRsZVRvb2xiYXIuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9ub3RlYm9va0ZvY3VzSW5kaWNhdG9yLmNzcyc7XG5pbXBvcnQgJy4vbWVkaWEvbm90ZWJvb2tUb29sYmFyLmNzcyc7XG5pbXBvcnQgJy4vbWVkaWEvbm90ZWJvb2tEbmQuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9ub3RlYm9va0ZvbGRpbmcuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9ub3RlYm9va0NlbGxPdXRwdXQuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9ub3RlYm9va0VkaXRvclN0aWNreVNjcm9sbC5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL25vdGVib29rS2VybmVsQWN0aW9uVmlld0l0ZW0uY3NzJztcbmltcG9ydCAnLi9tZWRpYS9ub3RlYm9va091dGxpbmUuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9ub3RlYm9va0NoYXRFZGl0Q29udHJvbGxlci5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL25vdGVib29rQ2hhdEVkaXRvck92ZXJsYXkuY3NzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGRvbVN0eWxlc2hlZXRzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBJTW91c2VXaGVlbEV2ZW50LCBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBPdmVybGF5TGF5b3V0RWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9vdmVybGF5TGF5b3V0RWxlbWVudC5qcyc7XG5pbXBvcnQgeyBJTGlzdENvbnRleHRNZW51RXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IFNlcXVlbmNlckJ5S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29sb3IsIFJHQkEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBzZXRUaW1lb3V0MCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGV4dG5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgRm9udE1lYXN1cmVtZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2NvbmZpZy9mb250TWVhc3VyZW1lbnRzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRm9udEluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBjcmVhdGVCYXJlRm9udEluZm9Gcm9tUmF3U2V0dGluZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9mb250SW5mb0Zyb21TZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IFN1Z2dlc3RDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3RDb250cm9sbGVyLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyWkluZGV4LCBaSW5kZXggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci96SW5kZXhSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLCBJUHJvZ3Jlc3NSdW5uZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBjb250cmFzdEJvcmRlciwgZXJyb3JGb3JlZ3JvdW5kLCBmb2N1c0JvcmRlciwgZm9yZWdyb3VuZCwgbGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCwgcmVnaXN0ZXJDb2xvciwgc2Nyb2xsYmFyU2xpZGVyQWN0aXZlQmFja2dyb3VuZCwgc2Nyb2xsYmFyU2xpZGVyQmFja2dyb3VuZCwgc2Nyb2xsYmFyU2xpZGVySG92ZXJCYWNrZ3JvdW5kLCB0cmFuc3BhcmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEVESVRPUl9QQU5FX0JBQ0tHUk9VTkQsIFBBTkVMX0JPUkRFUiwgU0lERV9CQVJfQkFDS0dST1VORCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBkZWJ1Z0ljb25TdGFydEZvcmVncm91bmQgfSBmcm9tICcuLi8uLi9kZWJ1Zy9icm93c2VyL2RlYnVnQ29sb3JzLmpzJztcbmltcG9ydCB7IENlbGxFZGl0U3RhdGUsIENlbGxGaW5kTWF0Y2hXaXRoSW5kZXgsIENlbGxGb2N1c01vZGUsIENlbGxMYXlvdXRDb250ZXh0LCBDZWxsUmV2ZWFsUmFuZ2VUeXBlLCBDZWxsUmV2ZWFsVHlwZSwgSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUsIElCYXNlQ2VsbEVkaXRvck9wdGlvbnMsIElDZWxsT3V0cHV0Vmlld01vZGVsLCBJQ2VsbFZpZXdNb2RlbCwgSUNvbW1vbkNlbGxJbmZvLCBJRGlzcGxheU91dHB1dExheW91dFVwZGF0ZVJlcXVlc3QsIElGb2N1c05vdGVib29rQ2VsbE9wdGlvbnMsIElJbnNldFJlbmRlck91dHB1dCwgSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VBY2Nlc3NvciwgSU5vdGVib29rQ2VsbE92ZXJsYXlDaGFuZ2VBY2Nlc3NvciwgSU5vdGVib29rRGVsdGFEZWNvcmF0aW9uLCBJTm90ZWJvb2tFZGl0b3IsIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiwgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb24sIElOb3RlYm9va0VkaXRvckNyZWF0aW9uT3B0aW9ucywgSU5vdGVib29rRWRpdG9yRGVsZWdhdGUsIElOb3RlYm9va0VkaXRvck1vdXNlRXZlbnQsIElOb3RlYm9va0VkaXRvck9wdGlvbnMsIElOb3RlYm9va0VkaXRvclZpZXdTdGF0ZSwgSU5vdGVib29rVmlld0NlbGxzVXBkYXRlRXZlbnQsIElOb3RlYm9va1ZpZXdab25lQ2hhbmdlQWNjZXNzb3IsIElOb3RlYm9va1dlYnZpZXdNZXNzYWdlLCBSZW5kZXJPdXRwdXRUeXBlLCBTY3JvbGxUb1JldmVhbEJlaGF2aW9yIH0gZnJvbSAnLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuL25vdGVib29rRWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9ub3RlYm9va0VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbm90ZWJvb2tEZWJ1ZyB9IGZyb20gJy4vbm90ZWJvb2tMb2dnZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tDZWxsU3RhdGVDaGFuZ2VkRXZlbnQsIE5vdGVib29rTGF5b3V0Q2hhbmdlZEV2ZW50LCBOb3RlYm9va0xheW91dEluZm8gfSBmcm9tICcuL25vdGVib29rVmlld0V2ZW50cy5qcyc7XG5pbXBvcnQgeyBDZWxsQ29udGV4dEtleU1hbmFnZXIgfSBmcm9tICcuL3ZpZXcvY2VsbFBhcnRzL2NlbGxDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDZWxsRHJhZ0FuZERyb3BDb250cm9sbGVyIH0gZnJvbSAnLi92aWV3L2NlbGxQYXJ0cy9jZWxsRG5kLmpzJztcbmltcG9ydCB7IExpc3RWaWV3SW5mb0FjY2Vzc29yLCBOb3RlYm9va0NlbGxMaXN0LCBOT1RFQk9PS19XRUJWSUVXX0JPVU5EQVJZIH0gZnJvbSAnLi92aWV3L25vdGVib29rQ2VsbExpc3QuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rQ2VsbExpc3QgfSBmcm9tICcuL3ZpZXcvbm90ZWJvb2tSZW5kZXJpbmdDb21tb24uanMnO1xuaW1wb3J0IHsgQmFja0xheWVyV2ViVmlldyB9IGZyb20gJy4vdmlldy9yZW5kZXJlcnMvYmFja0xheWVyV2ViVmlldy5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbFJlbmRlcmVyLCBNYXJrdXBDZWxsUmVuZGVyZXIsIE5vdGVib29rQ2VsbExpc3REZWxlZ2F0ZSB9IGZyb20gJy4vdmlldy9yZW5kZXJlcnMvY2VsbFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElBY2tPdXRwdXRIZWlnaHQsIElNYXJrdXBDZWxsSW5pdGlhbGl6YXRpb24gfSBmcm9tICcuL3ZpZXcvcmVuZGVyZXJzL3dlYnZpZXdNZXNzYWdlcy5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbFZpZXdNb2RlbCwgb3V0cHV0RGlzcGxheUxpbWl0IH0gZnJvbSAnLi92aWV3TW9kZWwvY29kZUNlbGxWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFdmVudERpc3BhdGNoZXIgfSBmcm9tICcuL3ZpZXdNb2RlbC9ldmVudERpc3BhdGNoZXIuanMnO1xuaW1wb3J0IHsgTWFya3VwQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4vdmlld01vZGVsL21hcmt1cENlbGxWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbFZpZXdNb2RlbCwgTm90ZWJvb2tWaWV3TW9kZWwgfSBmcm9tICcuL3ZpZXdNb2RlbC9ub3RlYm9va1ZpZXdNb2RlbEltcGwuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRleHQgfSBmcm9tICcuL3ZpZXdNb2RlbC92aWV3Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0VkaXRvcldvcmtiZW5jaFRvb2xiYXIgfSBmcm9tICcuL3ZpZXdQYXJ0cy9ub3RlYm9va0VkaXRvclRvb2xiYXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4vdmlld1BhcnRzL25vdGVib29rRWRpdG9yV2lkZ2V0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tPdmVydmlld1J1bGVyIH0gZnJvbSAnLi92aWV3UGFydHMvbm90ZWJvb2tPdmVydmlld1J1bGVyLmpzJztcbmltcG9ydCB7IExpc3RUb3BDZWxsVG9vbGJhciB9IGZyb20gJy4vdmlld1BhcnRzL25vdGVib29rVG9wQ2VsbFRvb2xiYXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRUeXBlLCBDZWxsS2luZCwgSU5vdGVib29rRmluZE9wdGlvbnMsIE5vdGVib29rRmluZFNjb3BlVHlwZSwgUkVOREVSRVJfTk9UX0FWQUlMQUJMRSwgU2VsZWN0aW9uU3RhdGVUeXBlIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0NVUlNPUl9OQVZJR0FUSU9OX01PREUsIE5PVEVCT09LX0VESVRPUl9FRElUQUJMRSwgTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIE5PVEVCT09LX09VVFBVVF9GT0NVU0VELCBOT1RFQk9PS19PVVRQVVRfSU5QVVRfRk9DVVNFRCB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0V4ZWN1dGlvblNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0tlcm5lbFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rT3B0aW9ucywgT3V0cHV0SW5uZXJDb250YWluZXJUb3BQYWRkaW5nIH0gZnJvbSAnLi9ub3RlYm9va09wdGlvbnMuanMnO1xuaW1wb3J0IHsgY2VsbFJhbmdlc1RvSW5kZXhlcywgSUNlbGxSYW5nZSB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va1JhbmdlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1JlbmRlcmVyTWVzc2FnaW5nU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va1JlbmRlcmVyTWVzc2FnaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV2Vidmlld0VsZW1lbnQgfSBmcm9tICcuLi8uLi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rUGVyZk1hcmtzIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rUGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgQmFzZUNlbGxFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi92aWV3TW9kZWwvY2VsbEVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRmxvYXRpbmdFZGl0b3JDbGlja01lbnUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NvZGVlZGl0b3IuanMnO1xuaW1wb3J0IHsgQ2VsbEZpbmRNYXRjaE1vZGVsIH0gZnJvbSAnLi9jb250cmliL2ZpbmQvZmluZE1vZGVsLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rTG9nZ2luZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgRHJvcEludG9FZGl0b3JDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZHJvcE9yUGFzdGVJbnRvL2Jyb3dzZXIvZHJvcEludG9FZGl0b3JDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IENvcHlQYXN0ZUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9kcm9wT3JQYXN0ZUludG8vYnJvd3Nlci9jb3B5UGFzdGVDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IE5vdGVib29rU3RpY2t5U2Nyb2xsIH0gZnJvbSAnLi92aWV3UGFydHMvbm90ZWJvb2tFZGl0b3JTdGlja3lTY3JvbGwuanMnO1xuaW1wb3J0IHsgUGl4ZWxSYXRpbyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9waXhlbFJhdGlvLmpzJztcbmltcG9ydCB7IFByZXZlbnREZWZhdWx0Q29udGV4dE1lbnVJdGVtc0NvbnRleHRLZXlOYW1lIH0gZnJvbSAnLi4vLi4vd2Vidmlldy9icm93c2VyL3dlYnZpZXcuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IE5vdGVib29rQWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi9ub3RlYm9va0FjY2Vzc2liaWxpdHlQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0hvcml6b250YWxUcmFja2VyIH0gZnJvbSAnLi92aWV3UGFydHMvbm90ZWJvb2tIb3Jpem9udGFsVHJhY2tlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxFZGl0b3JQb29sIH0gZnJvbSAnLi92aWV3L25vdGVib29rQ2VsbEVkaXRvclBvb2wuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9jb250cm9sbGVyL2lubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxMYXlvdXRNYW5hZ2VyIH0gZnJvbSAnLi9ub3RlYm9va0NlbGxMYXlvdXRNYW5hZ2VyLmpzJztcbmltcG9ydCB7IEZsb2F0aW5nRWRpdG9yVG9vbGJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Zsb2F0aW5nTWVudS9icm93c2VyL2Zsb2F0aW5nTWVudS5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldERlZmF1bHROb3RlYm9va0NyZWF0aW9uT3B0aW9ucygpOiBJTm90ZWJvb2tFZGl0b3JDcmVhdGlvbk9wdGlvbnMge1xuXHQvLyBXZSBpbmxpbmVkIHRoZSBpZCB0byBhdm9pZCBsb2FkaW5nIGNvbW1lbnQgY29udHJpYiBpbiB0ZXN0c1xuXHRjb25zdCBza2lwQ29udHJpYnV0aW9ucyA9IFtcblx0XHQnZWRpdG9yLmNvbnRyaWIucmV2aWV3Jyxcblx0XHRGbG9hdGluZ0VkaXRvckNsaWNrTWVudS5JRCxcblx0XHRGbG9hdGluZ0VkaXRvclRvb2xiYXIuSUQsXG5cdFx0J2VkaXRvci5jb250cmliLmRpcnR5ZGlmZicsXG5cdFx0J2VkaXRvci5jb250cmliLnRlc3RpbmdPdXRwdXRQZWVrJyxcblx0XHQnZWRpdG9yLmNvbnRyaWIudGVzdGluZ0RlY29yYXRpb25zJyxcblx0XHQnc3RvcmUuY29udHJpYi5zdGlja3lTY3JvbGxDb250cm9sbGVyJyxcblx0XHQnZWRpdG9yLmNvbnRyaWIuZmluZENvbnRyb2xsZXInLFxuXHRcdCdlZGl0b3IuY29udHJpYi5lbXB0eVRleHRFZGl0b3JIaW50J1xuXHRdO1xuXHRjb25zdCBjb250cmlidXRpb25zID0gRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEVkaXRvckNvbnRyaWJ1dGlvbnMoKS5maWx0ZXIoYyA9PiBza2lwQ29udHJpYnV0aW9ucy5pbmRleE9mKGMuaWQpID09PSAtMSk7XG5cblx0cmV0dXJuIHtcblx0XHRtZW51SWRzOiB7XG5cdFx0XHRub3RlYm9va1Rvb2xiYXI6IE1lbnVJZC5Ob3RlYm9va1Rvb2xiYXIsXG5cdFx0XHRjZWxsVGl0bGVUb29sYmFyOiBNZW51SWQuTm90ZWJvb2tDZWxsVGl0bGUsXG5cdFx0XHRjZWxsRGVsZXRlVG9vbGJhcjogTWVudUlkLk5vdGVib29rQ2VsbERlbGV0ZSxcblx0XHRcdGNlbGxJbnNlcnRUb29sYmFyOiBNZW51SWQuTm90ZWJvb2tDZWxsQmV0d2Vlbixcblx0XHRcdGNlbGxUb3BJbnNlcnRUb29sYmFyOiBNZW51SWQuTm90ZWJvb2tDZWxsTGlzdFRvcCxcblx0XHRcdGNlbGxFeGVjdXRlVG9vbGJhcjogTWVudUlkLk5vdGVib29rQ2VsbEV4ZWN1dGUsXG5cdFx0XHRjZWxsRXhlY3V0ZVByaW1hcnk6IE1lbnVJZC5Ob3RlYm9va0NlbGxFeGVjdXRlUHJpbWFyeSxcblx0XHR9LFxuXHRcdGNlbGxFZGl0b3JDb250cmlidXRpb25zOiBjb250cmlidXRpb25zXG5cdH07XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0VkaXRvcldpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSwgSU5vdGVib29rRWRpdG9yIHtcblx0Ly8jcmVnaW9uIEV2ZW50aW5nXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ2VsbFN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Tm90ZWJvb2tDZWxsU3RhdGVDaGFuZ2VkRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNlbGxTdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlQ2VsbFN0YXRlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpZXdDZWxscyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElOb3RlYm9va1ZpZXdDZWxsc1VwZGF0ZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaWV3Q2VsbHM6IEV2ZW50PElOb3RlYm9va1ZpZXdDZWxsc1VwZGF0ZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlVmlld0NlbGxzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxDaGFuZ2VNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE5vdGVib29rVGV4dE1vZGVsIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25XaWxsQ2hhbmdlTW9kZWw6IEV2ZW50PE5vdGVib29rVGV4dE1vZGVsIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uV2lsbENoYW5nZU1vZGVsLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1vZGVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Tm90ZWJvb2tUZXh0TW9kZWwgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1vZGVsOiBFdmVudDxOb3RlYm9va1RleHRNb2RlbCB8IHVuZGVmaW5lZD4gPSB0aGlzLl9vbkRpZENoYW5nZU1vZGVsLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEF0dGFjaFZpZXdNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEF0dGFjaFZpZXdNb2RlbDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZEF0dGFjaFZpZXdNb2RlbC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VPcHRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlT3B0aW9uczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZU9wdGlvbnMuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEZWNvcmF0aW9uczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNjcm9sbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNjcm9sbDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZFNjcm9sbC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMYXlvdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMYXlvdXQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VMYXlvdXQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlQ2VsbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZUNlbGw6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVDZWxsLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRm9jdXM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VGb2N1cy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZWxlY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZWxlY3Rpb246IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmlzaWJsZVJhbmdlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2libGVSYW5nZXM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmxlUmFuZ2VzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvY3VzRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZvY3VzV2lkZ2V0ID0gdGhpcy5fb25EaWRGb2N1c0VtaXR0ZXIuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQmx1ckVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRCbHVyV2lkZ2V0ID0gdGhpcy5fb25EaWRCbHVyRW1pdHRlci5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVFZGl0b3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx0aGlzPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVFZGl0b3I6IEV2ZW50PHRoaXM+ID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVFZGl0b3IuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlS2VybmVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlS2VybmVsOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlS2VybmVsLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1vdXNlVXA6IEVtaXR0ZXI8SU5vdGVib29rRWRpdG9yTW91c2VFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTm90ZWJvb2tFZGl0b3JNb3VzZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25Nb3VzZVVwOiBFdmVudDxJTm90ZWJvb2tFZGl0b3JNb3VzZUV2ZW50PiA9IHRoaXMuX29uTW91c2VVcC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Nb3VzZURvd246IEVtaXR0ZXI8SU5vdGVib29rRWRpdG9yTW91c2VFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTm90ZWJvb2tFZGl0b3JNb3VzZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25Nb3VzZURvd246IEV2ZW50PElOb3RlYm9va0VkaXRvck1vdXNlRXZlbnQ+ID0gdGhpcy5fb25Nb3VzZURvd24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVjZWl2ZU1lc3NhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTm90ZWJvb2tXZWJ2aWV3TWVzc2FnZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVjZWl2ZU1lc3NhZ2U6IEV2ZW50PElOb3RlYm9va1dlYnZpZXdNZXNzYWdlPiA9IHRoaXMuX29uRGlkUmVjZWl2ZU1lc3NhZ2UuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVuZGVyT3V0cHV0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNlbGxPdXRwdXRWaWV3TW9kZWw+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkUmVuZGVyT3V0cHV0ID0gdGhpcy5fb25EaWRSZW5kZXJPdXRwdXQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVtb3ZlT3V0cHV0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNlbGxPdXRwdXRWaWV3TW9kZWw+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkUmVtb3ZlT3V0cHV0ID0gdGhpcy5fb25EaWRSZW1vdmVPdXRwdXQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVzaXplT3V0cHV0RW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDZWxsVmlld01vZGVsPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXNpemVPdXRwdXQgPSB0aGlzLl9vbkRpZFJlc2l6ZU91dHB1dEVtaXR0ZXIuZXZlbnQ7XG5cblx0Ly8jZW5kcmVnaW9uXG5cdHByaXZhdGUgX292ZXJsYXlDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfb3ZlcmxheUxheW91dCE6IE92ZXJsYXlMYXlvdXRFbGVtZW50O1xuXHRwcml2YXRlIF9ub3RlYm9va1RvcFRvb2xiYXJDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfbm90ZWJvb2tUb3BUb29sYmFyITogTm90ZWJvb2tFZGl0b3JXb3JrYmVuY2hUb29sYmFyO1xuXHRwcml2YXRlIF9ub3RlYm9va1N0aWNreVNjcm9sbENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9ub3RlYm9va1N0aWNreVNjcm9sbCE6IE5vdGVib29rU3RpY2t5U2Nyb2xsO1xuXHRwcml2YXRlIF9ub3RlYm9va092ZXJ2aWV3UnVsZXJDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfbm90ZWJvb2tPdmVydmlld1J1bGVyITogTm90ZWJvb2tPdmVydmlld1J1bGVyO1xuXHRwcml2YXRlIF9ib2R5ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3N0eWxlRWxlbWVudCE6IEhUTUxTdHlsZUVsZW1lbnQ7XG5cdHByaXZhdGUgX292ZXJmbG93Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3dlYnZpZXc6IEJhY2tMYXllcldlYlZpZXc8SUNvbW1vbkNlbGxJbmZvPiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF93ZWJ2aWV3UmVzb2x2ZVByb21pc2U6IFByb21pc2U8QmFja0xheWVyV2ViVmlldzxJQ29tbW9uQ2VsbEluZm8+IHwgbnVsbD4gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfd2Vidmlld1RyYW5zcGFyZW50Q292ZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2xpc3REZWxlZ2F0ZTogTm90ZWJvb2tDZWxsTGlzdERlbGVnYXRlIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2xpc3QhOiBJTm90ZWJvb2tDZWxsTGlzdDtcblx0cHJpdmF0ZSBfbGlzdFZpZXdJbmZvQWNjZXNzb3IhOiBMaXN0Vmlld0luZm9BY2Nlc3Nvcjtcblx0cHJpdmF0ZSBfZG5kQ29udHJvbGxlcjogQ2VsbERyYWdBbmREcm9wQ29udHJvbGxlciB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9saXN0VG9wQ2VsbFRvb2xiYXI6IExpc3RUb3BDZWxsVG9vbGJhciB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9yZW5kZXJlZEVkaXRvcnM6IE1hcDxJQ2VsbFZpZXdNb2RlbCwgSUNvZGVFZGl0b3I+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIF9lZGl0b3JQb29sITogTm90ZWJvb2tDZWxsRWRpdG9yUG9vbDtcblx0cHJpdmF0ZSBfdmlld0NvbnRleHQ6IFZpZXdDb250ZXh0O1xuXHRwcml2YXRlIF9ub3RlYm9va1ZpZXdNb2RlbDogTm90ZWJvb2tWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsU3RvcmU6IERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX2xvY2FsQ2VsbFN0YXRlTGlzdGVuZXJzOiBEaXNwb3NhYmxlU3RvcmVbXSA9IFtdO1xuXHRwcml2YXRlIF9mb250SW5mbzogRm9udEluZm8gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RpbWVuc2lvbj86IERPTS5EaW1lbnNpb247XG5cdHByaXZhdGUgX3NoYWRvd0VsZW1lbnQ/OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfY2VsbExheW91dE1hbmFnZXI6IE5vdGVib29rQ2VsbExheW91dE1hbmFnZXIgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yRm9jdXM6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vdXRwdXRGb2N1czogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckVkaXRhYmxlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY3Vyc29yTmF2TW9kZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX291dHB1dElucHV0Rm9jdXM6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvbnRyaWJ1dGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uPigpO1xuXHRwcml2YXRlIF9zY3JvbGxCZXlvbmRMYXN0TGluZTogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5zZXRNb2RpZnlRdWV1ZUJ5T3V0cHV0SWQgPSBuZXcgU2VxdWVuY2VyQnlLZXk8c3RyaW5nPigpO1xuXHRwcml2YXRlIF9jZWxsQ29udGV4dEtleU1hbmFnZXI6IENlbGxDb250ZXh0S2V5TWFuYWdlciB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91dWlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdHByaXZhdGUgX2ZvY3VzVHJhY2tlciE6IERPTS5JRm9jdXNUcmFja2VyO1xuXHRwcml2YXRlIF93ZWJ2aWV3Rm9jdXNlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc1Zpc2libGUgPSBmYWxzZTtcblx0Z2V0IGlzVmlzaWJsZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5faXNWaXNpYmxlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNEaXNwb3NlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGdldCBpc0Rpc3Bvc2VkKCkge1xuXHRcdHJldHVybiB0aGlzLl9pc0Rpc3Bvc2VkO1xuXHR9XG5cblx0c2V0IHZpZXdNb2RlbChuZXdNb2RlbDogTm90ZWJvb2tWaWV3TW9kZWwgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9vbldpbGxDaGFuZ2VNb2RlbC5maXJlKHRoaXMuX25vdGVib29rVmlld01vZGVsPy5ub3RlYm9va0RvY3VtZW50KTtcblx0XHR0aGlzLl9ub3RlYm9va1ZpZXdNb2RlbCA9IG5ld01vZGVsO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZWwuZmlyZShuZXdNb2RlbD8ubm90ZWJvb2tEb2N1bWVudCk7XG5cdH1cblxuXHRnZXQgdmlld01vZGVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9ub3RlYm9va1ZpZXdNb2RlbDtcblx0fVxuXG5cdGdldCB0ZXh0TW9kZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX25vdGVib29rVmlld01vZGVsPy5ub3RlYm9va0RvY3VtZW50O1xuXHR9XG5cblx0Z2V0IGlzUmVhZE9ubHkoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX25vdGVib29rVmlld01vZGVsPy5vcHRpb25zLmlzUmVhZE9ubHkgPz8gZmFsc2U7XG5cdH1cblxuXHRnZXQgYWN0aXZlQ29kZUVkaXRvcigpOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBbZm9jdXNlZF0gPSB0aGlzLl9saXN0LmdldEZvY3VzZWRFbGVtZW50cygpO1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlZEVkaXRvcnMuZ2V0KGZvY3VzZWQpO1xuXHR9XG5cblx0Z2V0IGFjdGl2ZUNlbGxBbmRDb2RlRWRpdG9yKCk6IFtJQ2VsbFZpZXdNb2RlbCwgSUNvZGVFZGl0b3JdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtmb2N1c2VkXSA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXNlZEVsZW1lbnRzKCk7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fcmVuZGVyZWRFZGl0b3JzLmdldChmb2N1c2VkKTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gW2ZvY3VzZWQsIGVkaXRvcl07XG5cdH1cblxuXHRnZXQgY29kZUVkaXRvcnMoKTogW0lDZWxsVmlld01vZGVsLCBJQ29kZUVkaXRvcl1bXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9yZW5kZXJlZEVkaXRvcnNdO1xuXHR9XG5cblx0Z2V0IHZpc2libGVSYW5nZXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3QgPyAodGhpcy5fbGlzdC52aXNpYmxlUmFuZ2VzIHx8IFtdKSA6IFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBfYmFzZUNlbGxFZGl0b3JPcHRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElCYXNlQ2VsbEVkaXRvck9wdGlvbnM+KCk7XG5cblx0cmVhZG9ubHkgaXNSZXBsSGlzdG9yeTogYm9vbGVhbjtcblx0cHJpdmF0ZSBfcmVhZE9ubHk6IGJvb2xlYW47XG5cblx0cHVibGljIHJlYWRvbmx5IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tPcHRpb25zOiBOb3RlYm9va09wdGlvbnM7XG5cblx0cHJpdmF0ZSBfY3VycmVudFByb2dyZXNzOiBJUHJvZ3Jlc3NSdW5uZXIgfCB1bmRlZmluZWQ7XG5cblx0Z2V0IG5vdGVib29rT3B0aW9ucygpIHtcblx0XHRyZXR1cm4gdGhpcy5fbm90ZWJvb2tPcHRpb25zO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY3JlYXRpb25PcHRpb25zOiBJTm90ZWJvb2tFZGl0b3JDcmVhdGlvbk9wdGlvbnMsXG5cdFx0ZGltZW5zaW9uOiBET00uRGltZW5zaW9uIHwgdW5kZWZpbmVkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cHNTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASU5vdGVib29rUmVuZGVyZXJNZXNzYWdpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tSZW5kZXJlck1lc3NhZ2luZzogSU5vdGVib29rUmVuZGVyZXJNZXNzYWdpbmdTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFZGl0b3JTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tLZXJuZWxTZXJ2aWNlOiBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0V4ZWN1dGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va0V4ZWN1dGlvblNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSBlZGl0b3JQcm9ncmVzc1NlcnZpY2U6IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSU5vdGVib29rTG9nZ2luZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cblx0XHR0aGlzLmlzUmVwbEhpc3RvcnkgPSBjcmVhdGlvbk9wdGlvbnMuaXNSZXBsSGlzdG9yeSA/PyBmYWxzZTtcblx0XHR0aGlzLl9yZWFkT25seSA9IGNyZWF0aW9uT3B0aW9ucy5pc1JlYWRPbmx5ID8/IGZhbHNlO1xuXG5cdFx0dGhpcy5fb3ZlcmxheUxheW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBPdmVybGF5TGF5b3V0RWxlbWVudCgpKTtcblx0XHR0aGlzLl9vdmVybGF5Q29udGFpbmVyID0gdGhpcy5fb3ZlcmxheUxheW91dC5jb250ZW50O1xuXHRcdHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcihjb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5fb3ZlcmxheUNvbnRhaW5lcikpO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZV0pKSk7XG5cblx0XHR0aGlzLl9ub3RlYm9va09wdGlvbnMgPSBjcmVhdGlvbk9wdGlvbnMub3B0aW9ucyA/P1xuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va09wdGlvbnMsIHRoaXMuY3JlYXRpb25PcHRpb25zPy5jb2RlV2luZG93ID8/IG1haW5XaW5kb3csIHRoaXMuX3JlYWRPbmx5LCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX25vdGVib29rT3B0aW9ucyk7XG5cdFx0Y29uc3QgZXZlbnREaXNwYXRjaGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE5vdGVib29rRXZlbnREaXNwYXRjaGVyKCkpO1xuXHRcdHRoaXMuX3ZpZXdDb250ZXh0ID0gbmV3IFZpZXdDb250ZXh0KFxuXHRcdFx0dGhpcy5fbm90ZWJvb2tPcHRpb25zLFxuXHRcdFx0ZXZlbnREaXNwYXRjaGVyLFxuXHRcdFx0bGFuZ3VhZ2UgPT4gdGhpcy5nZXRCYXNlQ2VsbEVkaXRvck9wdGlvbnMobGFuZ3VhZ2UpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl92aWV3Q29udGV4dC5ldmVudERpc3BhdGNoZXIub25EaWRDaGFuZ2VMYXlvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMYXlvdXQuZmlyZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl92aWV3Q29udGV4dC5ldmVudERpc3BhdGNoZXIub25EaWRDaGFuZ2VDZWxsU3RhdGUoZSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNlbGxTdGF0ZS5maXJlKGUpO1xuXHRcdH0pKTtcblxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoX25vdGVib29rU2VydmljZS5vbkRpZENoYW5nZU91dHB1dFJlbmRlcmVycygoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVPdXRwdXRSZW5kZXJlcnMoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rRWRpdG9yQ29udGV4dEtleXMsIHRoaXMpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG5vdGVib29rS2VybmVsU2VydmljZS5vbkRpZENoYW5nZVNlbGVjdGVkTm90ZWJvb2tzKGUgPT4ge1xuXHRcdFx0aWYgKGlzRXF1YWwoZS5ub3RlYm9vaywgdGhpcy52aWV3TW9kZWw/LnVyaSkpIHtcblx0XHRcdFx0dGhpcy5fbG9hZEtlcm5lbFByZWxvYWRzKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlS2VybmVsLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zY3JvbGxCZXlvbmRMYXN0TGluZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2VkaXRvci5zY3JvbGxCZXlvbmRMYXN0TGluZScpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLnNjcm9sbEJleW9uZExhc3RMaW5lJykpIHtcblx0XHRcdFx0dGhpcy5fc2Nyb2xsQmV5b25kTGFzdExpbmUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdlZGl0b3Iuc2Nyb2xsQmV5b25kTGFzdExpbmUnKTtcblx0XHRcdFx0aWYgKHRoaXMuX2RpbWVuc2lvbiAmJiB0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLl9kaW1lbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbm90ZWJvb2tPcHRpb25zLm9uRGlkQ2hhbmdlT3B0aW9ucyhlID0+IHtcblx0XHRcdGlmIChlLmNlbGxTdGF0dXNCYXJWaXNpYmlsaXR5IHx8IGUuY2VsbFRvb2xiYXJMb2NhdGlvbiB8fCBlLmNlbGxUb29sYmFySW50ZXJhY3Rpb24pIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlRm9yTm90ZWJvb2tDb25maWd1cmF0aW9uKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmZvbnRGYW1pbHkpIHtcblx0XHRcdFx0dGhpcy5fZ2VuZXJhdGVGb250SW5mbygpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5jb21wYWN0Vmlld1xuXHRcdFx0XHR8fCBlLmZvY3VzSW5kaWNhdG9yXG5cdFx0XHRcdHx8IGUuaW5zZXJ0VG9vbGJhclBvc2l0aW9uXG5cdFx0XHRcdHx8IGUuY2VsbFRvb2xiYXJMb2NhdGlvblxuXHRcdFx0XHR8fCBlLmRyYWdBbmREcm9wRW5hYmxlZFxuXHRcdFx0XHR8fCBlLmZvbnRTaXplXG5cdFx0XHRcdHx8IGUubWFya3VwRm9udFNpemVcblx0XHRcdFx0fHwgZS5tYXJrZG93bkxpbmVIZWlnaHRcblx0XHRcdFx0fHwgZS5mb250RmFtaWx5XG5cdFx0XHRcdHx8IGUuaW5zZXJ0VG9vbGJhckFsaWdubWVudFxuXHRcdFx0XHR8fCBlLm91dHB1dEZvbnRTaXplXG5cdFx0XHRcdHx8IGUub3V0cHV0TGluZUhlaWdodFxuXHRcdFx0XHR8fCBlLm91dHB1dEZvbnRGYW1pbHlcblx0XHRcdFx0fHwgZS5vdXRwdXRXb3JkV3JhcFxuXHRcdFx0XHR8fCBlLm91dHB1dFNjcm9sbGluZ1xuXHRcdFx0XHR8fCBlLm91dHB1dExpbmtpZnlGaWxlUGF0aHNcblx0XHRcdFx0fHwgZS5taW5pbWFsRXJyb3Jcblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLl9zdHlsZUVsZW1lbnQ/LnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVMYXlvdXRTdHlsZXMoKTtcblx0XHRcdFx0dGhpcy5fd2Vidmlldz8udXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdFx0Li4udGhpcy5ub3RlYm9va09wdGlvbnMuY29tcHV0ZVdlYnZpZXdPcHRpb25zKCksXG5cdFx0XHRcdFx0Zm9udEZhbWlseTogdGhpcy5fZ2VuZXJhdGVGb250RmFtaWx5KClcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9kaW1lbnNpb24gJiYgdGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMuX2RpbWVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gY3JlYXRpb25PcHRpb25zLmNvZGVXaW5kb3cgPyB0aGlzLmxheW91dFNlcnZpY2UuZ2V0Q29udGFpbmVyKGNyZWF0aW9uT3B0aW9ucy5jb2RlV2luZG93KSA6IHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyO1xuXG5cdFx0dGhpcy5ub3RlYm9va0VkaXRvclNlcnZpY2UuYWRkTm90ZWJvb2tFZGl0b3IodGhpcyk7XG5cblx0XHRjb25zdCBpZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIuaWQgPSBgbm90ZWJvb2stJHtpZH1gO1xuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIuY2xhc3NOYW1lID0gJ25vdGVib29rT3ZlcmxheSc7XG5cdFx0dGhpcy5fb3ZlcmxheUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdub3RlYm9vay1lZGl0b3InKTtcblx0XHR0aGlzLl9vdmVybGF5Q29udGFpbmVyLmluZXJ0ID0gdHJ1ZTtcblx0XHR0aGlzLl9vdmVybGF5Q29udGFpbmVyLnN0eWxlLnZpc2liaWxpdHkgPSAnaGlkZGVuJztcblxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9vdmVybGF5TGF5b3V0LnJvb3QpO1xuXG5cdFx0dGhpcy5fY3JlYXRlQm9keSh0aGlzLl9vdmVybGF5Q29udGFpbmVyKTtcblx0XHR0aGlzLl9nZW5lcmF0ZUZvbnRJbmZvKCk7XG5cdFx0dGhpcy5faXNWaXNpYmxlID0gdHJ1ZTtcblx0XHR0aGlzLl9lZGl0b3JGb2N1cyA9IE5PVEVCT09LX0VESVRPUl9GT0NVU0VELmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9vdXRwdXRGb2N1cyA9IE5PVEVCT09LX09VVFBVVF9GT0NVU0VELmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9vdXRwdXRJbnB1dEZvY3VzID0gTk9URUJPT0tfT1VUUFVUX0lOUFVUX0ZPQ1VTRUQuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2VkaXRvckVkaXRhYmxlID0gTk9URUJPT0tfRURJVE9SX0VESVRBQkxFLmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jdXJzb3JOYXZNb2RlID0gTk9URUJPT0tfQ1VSU09SX05BVklHQVRJT05fTU9ERS5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Ly8gTmV2ZXIgZGlzcGxheSB0aGUgbmF0aXZlIGN1dC9jb3B5IGNvbnRleHQgbWVudSBpdGVtcyBpbiBub3RlYm9va3Ncblx0XHRuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPihQcmV2ZW50RGVmYXVsdENvbnRleHRNZW51SXRlbXNDb250ZXh0S2V5TmFtZSwgZmFsc2UpLmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cblx0XHR0aGlzLl9lZGl0b3JFZGl0YWJsZS5zZXQoIWNyZWF0aW9uT3B0aW9ucy5pc1JlYWRPbmx5KTtcblxuXHRcdGxldCBjb250cmlidXRpb25zOiBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb25EZXNjcmlwdGlvbltdO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHRoaXMuY3JlYXRpb25PcHRpb25zLmNvbnRyaWJ1dGlvbnMpKSB7XG5cdFx0XHRjb250cmlidXRpb25zID0gdGhpcy5jcmVhdGlvbk9wdGlvbnMuY29udHJpYnV0aW9ucztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udHJpYnV0aW9ucyA9IE5vdGVib29rRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEVkaXRvckNvbnRyaWJ1dGlvbnMoKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBkZXNjIG9mIGNvbnRyaWJ1dGlvbnMpIHtcblx0XHRcdGxldCBjb250cmlidXRpb246IElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnRyaWJ1dGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoZGVzYy5jdG9yLCB0aGlzKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRyaWJ1dGlvbikge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2NvbnRyaWJ1dGlvbnMuaGFzKGRlc2MuaWQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29udHJpYnV0aW9ucy5zZXQoZGVzYy5pZCwgY29udHJpYnV0aW9uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb250cmlidXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRFVQTElDQVRFIG5vdGVib29rIGVkaXRvciBjb250cmlidXRpb246ICcke2Rlc2MuaWR9J2ApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXBkYXRlRm9yTm90ZWJvb2tDb25maWd1cmF0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIF9kZWJ1Z0ZsYWc6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIF9kZWJ1ZyguLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRpZiAoIXRoaXMuX2RlYnVnRmxhZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdG5vdGVib29rRGVidWcoLi4uYXJncyk7XG5cdH1cblxuXHQvKipcblx0ICogRWRpdG9ySWRcblx0ICovXG5cdHB1YmxpYyBnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl91dWlkO1xuXHR9XG5cblx0Z2V0Vmlld01vZGVsKCk6IE5vdGVib29rVmlld01vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWw7XG5cdH1cblxuXHRnZXRMZW5ndGgoKSB7XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsPy5sZW5ndGggPz8gMDtcblx0fVxuXG5cdGdldFNlbGVjdGlvbnMoKSB7XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsPy5nZXRTZWxlY3Rpb25zKCkgPz8gW3sgc3RhcnQ6IDAsIGVuZDogMCB9XTtcblx0fVxuXG5cdHNldFNlbGVjdGlvbnMoc2VsZWN0aW9uczogSUNlbGxSYW5nZVtdKSB7XG5cdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy52aWV3TW9kZWwuZ2V0Rm9jdXMoKTtcblx0XHR0aGlzLnZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoe1xuXHRcdFx0a2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LFxuXHRcdFx0Zm9jdXM6IGZvY3VzLFxuXHRcdFx0c2VsZWN0aW9uczogc2VsZWN0aW9uc1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0Rm9jdXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsPy5nZXRGb2N1cygpID8/IHsgc3RhcnQ6IDAsIGVuZDogMCB9O1xuXHR9XG5cblx0c2V0Rm9jdXMoZm9jdXM6IElDZWxsUmFuZ2UpIHtcblx0XHRpZiAoIXRoaXMudmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHRoaXMudmlld01vZGVsLmdldFNlbGVjdGlvbnMoKTtcblx0XHR0aGlzLnZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoe1xuXHRcdFx0a2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LFxuXHRcdFx0Zm9jdXM6IGZvY3VzLFxuXHRcdFx0c2VsZWN0aW9uczogc2VsZWN0aW9uc1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0U2VsZWN0aW9uVmlld01vZGVscygpOiBJQ2VsbFZpZXdNb2RlbFtdIHtcblx0XHRpZiAoIXRoaXMudmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2VsbHNTZXQgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbC5nZXRTZWxlY3Rpb25zKCkubWFwKHJhbmdlID0+IHRoaXMudmlld01vZGVsIS52aWV3Q2VsbHMuc2xpY2UocmFuZ2Uuc3RhcnQsIHJhbmdlLmVuZCkpLnJlZHVjZSgoYSwgYikgPT4ge1xuXHRcdFx0Yi5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0XHRpZiAoIWNlbGxzU2V0LmhhcyhjZWxsLmhhbmRsZSkpIHtcblx0XHRcdFx0XHRjZWxsc1NldC5hZGQoY2VsbC5oYW5kbGUpO1xuXHRcdFx0XHRcdGEucHVzaChjZWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiBhO1xuXHRcdH0sIFtdIGFzIElDZWxsVmlld01vZGVsW10pO1xuXHR9XG5cblx0aGFzTW9kZWwoKTogdGhpcyBpcyBJQWN0aXZlTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSB7XG5cdFx0cmV0dXJuICEhdGhpcy5fbm90ZWJvb2tWaWV3TW9kZWw7XG5cdH1cblxuXHRzaG93UHJvZ3Jlc3MoKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VycmVudFByb2dyZXNzID0gdGhpcy5lZGl0b3JQcm9ncmVzc1NlcnZpY2Uuc2hvdyh0cnVlKTtcblx0fVxuXG5cdGhpZGVQcm9ncmVzcygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY3VycmVudFByb2dyZXNzKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50UHJvZ3Jlc3MuZG9uZSgpO1xuXHRcdFx0dGhpcy5fY3VycmVudFByb2dyZXNzID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8vI3JlZ2lvbiBFZGl0b3IgQ29yZVxuXG5cdGdldEJhc2VDZWxsRWRpdG9yT3B0aW9ucyhsYW5ndWFnZTogc3RyaW5nKTogSUJhc2VDZWxsRWRpdG9yT3B0aW9ucyB7XG5cdFx0Y29uc3QgZXhpc3RpbmdPcHRpb25zID0gdGhpcy5fYmFzZUNlbGxFZGl0b3JPcHRpb25zLmdldChsYW5ndWFnZSk7XG5cblx0XHRpZiAoZXhpc3RpbmdPcHRpb25zKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3RpbmdPcHRpb25zO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBvcHRpb25zID0gbmV3IEJhc2VDZWxsRWRpdG9yT3B0aW9ucyh0aGlzLCB0aGlzLm5vdGVib29rT3B0aW9ucywgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ3VhZ2UpO1xuXHRcdFx0dGhpcy5fYmFzZUNlbGxFZGl0b3JPcHRpb25zLnNldChsYW5ndWFnZSwgb3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gb3B0aW9ucztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVGb3JOb3RlYm9va0NvbmZpZ3VyYXRpb24oKSB7XG5cdFx0aWYgKCF0aGlzLl9vdmVybGF5Q29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fb3ZlcmxheUNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdjZWxsLXRpdGxlLXRvb2xiYXItbGVmdCcpO1xuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnY2VsbC10aXRsZS10b29sYmFyLXJpZ2h0Jyk7XG5cdFx0dGhpcy5fb3ZlcmxheUNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdjZWxsLXRpdGxlLXRvb2xiYXItaGlkZGVuJyk7XG5cdFx0Y29uc3QgY2VsbFRvb2xiYXJMb2NhdGlvbiA9IHRoaXMuX25vdGVib29rT3B0aW9ucy5jb21wdXRlQ2VsbFRvb2xiYXJMb2NhdGlvbih0aGlzLnZpZXdNb2RlbD8udmlld1R5cGUpO1xuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIuY2xhc3NMaXN0LmFkZChgY2VsbC10aXRsZS10b29sYmFyLSR7Y2VsbFRvb2xiYXJMb2NhdGlvbn1gKTtcblxuXHRcdGNvbnN0IGNlbGxUb29sYmFySW50ZXJhY3Rpb24gPSB0aGlzLl9ub3RlYm9va09wdGlvbnMuZ2V0RGlzcGxheU9wdGlvbnMoKS5jZWxsVG9vbGJhckludGVyYWN0aW9uO1xuXHRcdGxldCBjZWxsVG9vbGJhckludGVyYWN0aW9uU3RhdGUgPSAnaG92ZXInO1xuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnY2VsbC10b29sYmFyLWhvdmVyJyk7XG5cdFx0dGhpcy5fb3ZlcmxheUNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdjZWxsLXRvb2xiYXItY2xpY2snKTtcblxuXHRcdGlmIChjZWxsVG9vbGJhckludGVyYWN0aW9uID09PSAnaG92ZXInIHx8IGNlbGxUb29sYmFySW50ZXJhY3Rpb24gPT09ICdjbGljaycpIHtcblx0XHRcdGNlbGxUb29sYmFySW50ZXJhY3Rpb25TdGF0ZSA9IGNlbGxUb29sYmFySW50ZXJhY3Rpb247XG5cdFx0fVxuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIuY2xhc3NMaXN0LmFkZChgY2VsbC10b29sYmFyLSR7Y2VsbFRvb2xiYXJJbnRlcmFjdGlvblN0YXRlfWApO1xuXG5cdH1cblxuXHRwcml2YXRlIF9nZW5lcmF0ZUZvbnRJbmZvKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvck9wdGlvbnMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElFZGl0b3JPcHRpb25zPignZWRpdG9yJyk7XG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gRE9NLmdldFdpbmRvdyh0aGlzLmdldERvbU5vZGUoKSk7XG5cdFx0dGhpcy5fZm9udEluZm8gPSBGb250TWVhc3VyZW1lbnRzLnJlYWRGb250SW5mbyh0YXJnZXRXaW5kb3csIGNyZWF0ZUJhcmVGb250SW5mb0Zyb21SYXdTZXR0aW5ncyhlZGl0b3JPcHRpb25zLCBQaXhlbFJhdGlvLmdldEluc3RhbmNlKHRhcmdldFdpbmRvdykudmFsdWUpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUJvZHkocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX25vdGVib29rVG9wVG9vbGJhckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX25vdGVib29rVG9wVG9vbGJhckNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdub3RlYm9vay10b29sYmFyLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuX25vdGVib29rVG9wVG9vbGJhckNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdERPTS5hcHBlbmQocGFyZW50LCB0aGlzLl9ub3RlYm9va1RvcFRvb2xiYXJDb250YWluZXIpO1xuXG5cdFx0dGhpcy5fbm90ZWJvb2tTdGlja3lTY3JvbGxDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9ub3RlYm9va1N0aWNreVNjcm9sbENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdub3RlYm9vay1zdGlja3ktc2Nyb2xsLWNvbnRhaW5lcicpO1xuXHRcdERPTS5hcHBlbmQocGFyZW50LCB0aGlzLl9ub3RlYm9va1N0aWNreVNjcm9sbENvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9ib2R5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0RE9NLmFwcGVuZChwYXJlbnQsIHRoaXMuX2JvZHkpO1xuXG5cdFx0dGhpcy5fYm9keS5jbGFzc0xpc3QuYWRkKCdjZWxsLWxpc3QtY29udGFpbmVyJyk7XG5cdFx0dGhpcy5fY3JlYXRlTGF5b3V0U3R5bGVzKCk7XG5cdFx0dGhpcy5fY3JlYXRlQ2VsbExpc3QoKTtcblxuXHRcdHRoaXMuX25vdGVib29rT3ZlcnZpZXdSdWxlckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX25vdGVib29rT3ZlcnZpZXdSdWxlckNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdub3RlYm9vay1vdmVydmlldy1ydWxlci1jb250YWluZXInKTtcblx0XHR0aGlzLl9saXN0LnNjcm9sbGFibGVFbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuX25vdGVib29rT3ZlcnZpZXdSdWxlckNvbnRhaW5lcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXJOb3RlYm9va092ZXJ2aWV3UnVsZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tIb3Jpem9udGFsVHJhY2tlciwgdGhpcywgdGhpcy5fbGlzdC5zY3JvbGxhYmxlRWxlbWVudCkpO1xuXG5cdFx0dGhpcy5fb3ZlcmZsb3dDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9vdmVyZmxvd0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdub3RlYm9vay1vdmVyZmxvdy13aWRnZXQtY29udGFpbmVyJywgJ21vbmFjby1lZGl0b3InKTtcblx0XHRET00uYXBwZW5kKHBhcmVudCwgdGhpcy5fb3ZlcmZsb3dDb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2VuZXJhdGVGb250RmFtaWx5KCkge1xuXHRcdHJldHVybiB0aGlzLl9mb250SW5mbz8uZm9udEZhbWlseSA/PyBgXCJTRiBNb25vXCIsIE1vbmFjbywgTWVubG8sIENvbnNvbGFzLCBcIlVidW50dSBNb25vXCIsIFwiTGliZXJhdGlvbiBNb25vXCIsIFwiRGVqYVZ1IFNhbnMgTW9ub1wiLCBcIkNvdXJpZXIgTmV3XCIsIG1vbm9zcGFjZWA7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVMYXlvdXRTdHlsZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3R5bGVFbGVtZW50ID0gZG9tU3R5bGVzaGVldHMuY3JlYXRlU3R5bGVTaGVldCh0aGlzLl9ib2R5KTtcblx0XHRjb25zdCB7XG5cdFx0XHRjZWxsUmlnaHRNYXJnaW4sXG5cdFx0XHRjZWxsVG9wTWFyZ2luLFxuXHRcdFx0Y2VsbFJ1bkd1dHRlcixcblx0XHRcdGNlbGxCb3R0b21NYXJnaW4sXG5cdFx0XHRjb2RlQ2VsbExlZnRNYXJnaW4sXG5cdFx0XHRtYXJrZG93bkNlbGxHdXR0ZXIsXG5cdFx0XHRtYXJrZG93bkNlbGxMZWZ0TWFyZ2luLFxuXHRcdFx0bWFya2Rvd25DZWxsQm90dG9tTWFyZ2luLFxuXHRcdFx0bWFya2Rvd25DZWxsVG9wTWFyZ2luLFxuXHRcdFx0Y29sbGFwc2VkSW5kaWNhdG9ySGVpZ2h0LFxuXHRcdFx0Zm9jdXNJbmRpY2F0b3IsXG5cdFx0XHRpbnNlcnRUb29sYmFyUG9zaXRpb24sXG5cdFx0XHRvdXRwdXRGb250U2l6ZSxcblx0XHRcdGZvY3VzSW5kaWNhdG9yTGVmdE1hcmdpbixcblx0XHRcdGZvY3VzSW5kaWNhdG9yR2FwXG5cdFx0fSA9IHRoaXMuX25vdGVib29rT3B0aW9ucy5nZXRMYXlvdXRDb25maWd1cmF0aW9uKCk7XG5cblx0XHRjb25zdCB7XG5cdFx0XHRpbnNlcnRUb29sYmFyQWxpZ25tZW50LFxuXHRcdFx0Y29tcGFjdFZpZXcsXG5cdFx0XHRmb250U2l6ZVxuXHRcdH0gPSB0aGlzLl9ub3RlYm9va09wdGlvbnMuZ2V0RGlzcGxheU9wdGlvbnMoKTtcblxuXHRcdGNvbnN0IGdldENlbGxFZGl0b3JDb250YWluZXJMZWZ0TWFyZ2luID0gdGhpcy5fbm90ZWJvb2tPcHRpb25zLmdldENlbGxFZGl0b3JDb250YWluZXJMZWZ0TWFyZ2luKCk7XG5cblx0XHRjb25zdCB7IGJvdHRvbVRvb2xiYXJHYXAsIGJvdHRvbVRvb2xiYXJIZWlnaHQgfSA9IHRoaXMuX25vdGVib29rT3B0aW9ucy5jb21wdXRlQm90dG9tVG9vbGJhckRpbWVuc2lvbnModGhpcy52aWV3TW9kZWw/LnZpZXdUeXBlKTtcblxuXHRcdGNvbnN0IHN0eWxlU2hlZXRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmICghdGhpcy5fZm9udEluZm8pIHtcblx0XHRcdHRoaXMuX2dlbmVyYXRlRm9udEluZm8oKTtcblx0XHR9XG5cblx0XHRjb25zdCBmb250RmFtaWx5ID0gdGhpcy5fZ2VuZXJhdGVGb250RmFtaWx5KCk7XG5cblx0XHRzdHlsZVNoZWV0cy5wdXNoKGBcblx0XHQubm90ZWJvb2stZWRpdG9yIHtcblx0XHRcdC0tbm90ZWJvb2stY2VsbC1vdXRwdXQtZm9udC1zaXplOiAke291dHB1dEZvbnRTaXplfXB4O1xuXHRcdFx0LS1ub3RlYm9vay1jZWxsLWlucHV0LXByZXZpZXctZm9udC1zaXplOiAke2ZvbnRTaXplfXB4O1xuXHRcdFx0LS1ub3RlYm9vay1jZWxsLWlucHV0LXByZXZpZXctZm9udC1mYW1pbHk6ICR7Zm9udEZhbWlseX07XG5cdFx0fVxuXHRcdGApO1xuXG5cdFx0aWYgKGNvbXBhY3RWaWV3KSB7XG5cdFx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tYXJrZG93bi1jZWxsLXJvdyBkaXYuY2VsbC5jb2RlIHsgbWFyZ2luLWxlZnQ6ICR7Z2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW59cHg7IH1gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubWFya2Rvd24tY2VsbC1yb3cgZGl2LmNlbGwuY29kZSB7IG1hcmdpbi1sZWZ0OiAke2NvZGVDZWxsTGVmdE1hcmdpbn1weDsgfWApO1xuXHRcdH1cblxuXHRcdC8vIGZvY3VzIGluZGljYXRvclxuXHRcdGlmIChmb2N1c0luZGljYXRvciA9PT0gJ2JvcmRlcicpIHtcblx0XHRcdHN0eWxlU2hlZXRzLnB1c2goYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdyAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItdG9wOmJlZm9yZSxcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLWJvdHRvbTpiZWZvcmUsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubWFya2Rvd24tY2VsbC1yb3cgLmNlbGwtaW5uZXItY29udGFpbmVyOmJlZm9yZSxcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0IC5tYXJrZG93bi1jZWxsLXJvdyAuY2VsbC1pbm5lci1jb250YWluZXI6YWZ0ZXIge1xuXHRcdFx0XHRjb250ZW50OiBcIlwiO1xuXHRcdFx0XHRwb3NpdGlvbjogYWJzb2x1dGU7XG5cdFx0XHRcdHdpZHRoOiAxMDAlO1xuXHRcdFx0XHRoZWlnaHQ6IDFweDtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdyAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItbGVmdDpiZWZvcmUsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWZvY3VzLWluZGljYXRvci1yaWdodDpiZWZvcmUge1xuXHRcdFx0XHRjb250ZW50OiBcIlwiO1xuXHRcdFx0XHRwb3NpdGlvbjogYWJzb2x1dGU7XG5cdFx0XHRcdHdpZHRoOiAxcHg7XG5cdFx0XHRcdGhlaWdodDogMTAwJTtcblx0XHRcdFx0ei1pbmRleDogMTA7XG5cdFx0XHR9XG5cblx0XHRcdC8qIHRvcCBib3JkZXIgKi9cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLXRvcDpiZWZvcmUge1xuXHRcdFx0XHRib3JkZXItdG9wOiAxcHggc29saWQgdHJhbnNwYXJlbnQ7XG5cdFx0XHR9XG5cblx0XHRcdC8qIGxlZnQgYm9yZGVyICovXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWZvY3VzLWluZGljYXRvci1sZWZ0OmJlZm9yZSB7XG5cdFx0XHRcdGJvcmRlci1sZWZ0OiAxcHggc29saWQgdHJhbnNwYXJlbnQ7XG5cdFx0XHR9XG5cblx0XHRcdC8qIGJvdHRvbSBib3JkZXIgKi9cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLWJvdHRvbTpiZWZvcmUge1xuXHRcdFx0XHRib3JkZXItYm90dG9tOiAxcHggc29saWQgdHJhbnNwYXJlbnQ7XG5cdFx0XHR9XG5cblx0XHRcdC8qIHJpZ2h0IGJvcmRlciAqL1xuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdyAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItcmlnaHQ6YmVmb3JlIHtcblx0XHRcdFx0Ym9yZGVyLXJpZ2h0OiAxcHggc29saWQgdHJhbnNwYXJlbnQ7XG5cdFx0XHR9XG5cdFx0XHRgKTtcblxuXHRcdFx0Ly8gbGVmdCBhbmQgcmlnaHQgYm9yZGVyIG1hcmdpbnNcblx0XHRcdHN0eWxlU2hlZXRzLnB1c2goYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdy5jb2RlLWNlbGwtcm93LmZvY3VzZWQgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLWxlZnQ6YmVmb3JlLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdy5jb2RlLWNlbGwtcm93LmZvY3VzZWQgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLXJpZ2h0OmJlZm9yZSxcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0LnNlbGVjdGlvbi1tdWx0aXBsZSAubW9uYWNvLWxpc3Qtcm93LmNvZGUtY2VsbC1yb3cuc2VsZWN0ZWQgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLWxlZnQ6YmVmb3JlLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3Quc2VsZWN0aW9uLW11bHRpcGxlIC5tb25hY28tbGlzdC1yb3cuY29kZS1jZWxsLXJvdy5zZWxlY3RlZCAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItcmlnaHQ6YmVmb3JlIHtcblx0XHRcdFx0dG9wOiAtJHtjZWxsVG9wTWFyZ2lufXB4OyBoZWlnaHQ6IGNhbGMoMTAwJSArICR7Y2VsbFRvcE1hcmdpbiArIGNlbGxCb3R0b21NYXJnaW59cHgpXG5cdFx0XHR9YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0eWxlU2hlZXRzLnB1c2goYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdyAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItbGVmdCAuY29kZU91dHB1dC1mb2N1cy1pbmRpY2F0b3Ige1xuXHRcdFx0XHRib3JkZXItbGVmdDogM3B4IHNvbGlkIHRyYW5zcGFyZW50O1xuXHRcdFx0XHRib3JkZXItcmFkaXVzOiA0cHg7XG5cdFx0XHRcdHdpZHRoOiAwcHg7XG5cdFx0XHRcdG1hcmdpbi1sZWZ0OiAke2ZvY3VzSW5kaWNhdG9yTGVmdE1hcmdpbn1weDtcblx0XHRcdFx0Ym9yZGVyLWNvbG9yOiB2YXIoLS12c2NvZGUtbm90ZWJvb2staW5hY3RpdmVGb2N1c2VkQ2VsbEJvcmRlcikgIWltcG9ydGFudDtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIC5jZWxsLWZvY3VzLWluZGljYXRvci1sZWZ0IC5jb2RlT3V0cHV0LWZvY3VzLWluZGljYXRvci1jb250YWluZXIsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLW91dHB1dC1ob3ZlciAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItbGVmdCAuY29kZU91dHB1dC1mb2N1cy1pbmRpY2F0b3ItY29udGFpbmVyLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdyAubWFya2Rvd24tY2VsbC1ob3ZlciAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItbGVmdCAuY29kZU91dHB1dC1mb2N1cy1pbmRpY2F0b3ItY29udGFpbmVyLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdzpob3ZlciAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItbGVmdCAuY29kZU91dHB1dC1mb2N1cy1pbmRpY2F0b3ItY29udGFpbmVyIHtcblx0XHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHR9XG5cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLWxlZnQgLmNvZGVPdXRwdXQtZm9jdXMtaW5kaWNhdG9yLWNvbnRhaW5lcjpob3ZlciAuY29kZU91dHB1dC1mb2N1cy1pbmRpY2F0b3Ige1xuXHRcdFx0XHRib3JkZXItbGVmdDogNXB4IHNvbGlkIHRyYW5zcGFyZW50O1xuXHRcdFx0XHRtYXJnaW4tbGVmdDogJHtmb2N1c0luZGljYXRvckxlZnRNYXJnaW4gLSAxfXB4O1xuXHRcdFx0fVxuXHRcdFx0YCk7XG5cblx0XHRcdHN0eWxlU2hlZXRzLnB1c2goYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIC5jZWxsLWlubmVyLWNvbnRhaW5lci5jZWxsLW91dHB1dC1mb2N1cyAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItbGVmdCAuY29kZU91dHB1dC1mb2N1cy1pbmRpY2F0b3IsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdDpmb2N1cy13aXRoaW4gLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIC5jZWxsLWlubmVyLWNvbnRhaW5lciAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItbGVmdCAuY29kZU91dHB1dC1mb2N1cy1pbmRpY2F0b3Ige1xuXHRcdFx0XHRib3JkZXItY29sb3I6IHZhcigtLXZzY29kZS1ub3RlYm9vay1mb2N1c2VkQ2VsbEJvcmRlcikgIWltcG9ydGFudDtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdyAuY2VsbC1pbm5lci1jb250YWluZXIgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLWxlZnQgLm91dHB1dC1mb2N1cy1pbmRpY2F0b3Ige1xuXHRcdFx0XHRtYXJnaW4tdG9wOiAke2ZvY3VzSW5kaWNhdG9yR2FwfXB4O1xuXHRcdFx0fVxuXHRcdFx0YCk7XG5cdFx0fVxuXG5cdFx0Ly8gYmV0d2VlbiBjZWxsIGluc2VydCB0b29sYmFyXG5cdFx0aWYgKGluc2VydFRvb2xiYXJQb3NpdGlvbiA9PT0gJ2JldHdlZW5DZWxscycgfHwgaW5zZXJ0VG9vbGJhclBvc2l0aW9uID09PSAnYm90aCcpIHtcblx0XHRcdHN0eWxlU2hlZXRzLnB1c2goYC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgPiAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWJvdHRvbS10b29sYmFyLWNvbnRhaW5lciB7IGRpc3BsYXk6IGZsZXg7IH1gKTtcblx0XHRcdHN0eWxlU2hlZXRzLnB1c2goYC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgPiAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAudmlldy16b25lcyAuY2VsbC1saXN0LXRvcC1jZWxsLXRvb2xiYXItY29udGFpbmVyIHsgZGlzcGxheTogZmxleDsgfWApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5ID4gLmNlbGwtbGlzdC1jb250YWluZXIgPiAubW9uYWNvLWxpc3QgPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdyAuY2VsbC1ib3R0b20tdG9vbGJhci1jb250YWluZXIgeyBkaXNwbGF5OiBub25lOyB9YCk7XG5cdFx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5ID4gLmNlbGwtbGlzdC1jb250YWluZXIgPiAubW9uYWNvLWxpc3QgPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLnZpZXctem9uZXMgLmNlbGwtbGlzdC10b3AtY2VsbC10b29sYmFyLWNvbnRhaW5lciB7IGRpc3BsYXk6IG5vbmU7IH1gKTtcblx0XHR9XG5cblx0XHRpZiAoaW5zZXJ0VG9vbGJhckFsaWdubWVudCA9PT0gJ2xlZnQnKSB7XG5cdFx0XHRzdHlsZVNoZWV0cy5wdXNoKGBcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLmNlbGwtbGlzdC10b3AtY2VsbC10b29sYmFyLWNvbnRhaW5lciAuYWN0aW9uLWl0ZW06Zmlyc3QtY2hpbGQsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWxpc3QtdG9wLWNlbGwtdG9vbGJhci1jb250YWluZXIgLmFjdGlvbi1pdGVtOmZpcnN0LWNoaWxkLCAubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5ID4gLmNlbGwtbGlzdC1jb250YWluZXIgPiAubW9uYWNvLWxpc3QgPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdyAuY2VsbC1ib3R0b20tdG9vbGJhci1jb250YWluZXIgLmFjdGlvbi1pdGVtOmZpcnN0LWNoaWxkIHtcblx0XHRcdFx0bWFyZ2luLXJpZ2h0OiAwcHggIWltcG9ydGFudDtcblx0XHRcdH1gKTtcblxuXHRcdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWxpc3QtdG9wLWNlbGwtdG9vbGJhci1jb250YWluZXIgLm1vbmFjby10b29sYmFyIC5hY3Rpb24tbGFiZWwsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWxpc3QtdG9wLWNlbGwtdG9vbGJhci1jb250YWluZXIgLm1vbmFjby10b29sYmFyIC5hY3Rpb24tbGFiZWwsIC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgPiAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWJvdHRvbS10b29sYmFyLWNvbnRhaW5lciAubW9uYWNvLXRvb2xiYXIgLmFjdGlvbi1sYWJlbCB7XG5cdFx0XHRcdHBhZGRpbmc6IDBweCAhaW1wb3J0YW50O1xuXHRcdFx0XHRqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcblx0XHRcdFx0Ym9yZGVyLXJhZGl1czogNHB4O1xuXHRcdFx0fWApO1xuXG5cdFx0XHRzdHlsZVNoZWV0cy5wdXNoKGBcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLmNlbGwtbGlzdC10b3AtY2VsbC10b29sYmFyLWNvbnRhaW5lcixcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgLmNlbGwtbGlzdC10b3AtY2VsbC10b29sYmFyLWNvbnRhaW5lciwgLm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSA+IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtYm90dG9tLXRvb2xiYXItY29udGFpbmVyIHtcblx0XHRcdFx0YWxpZ24taXRlbXM6IGZsZXgtc3RhcnQ7XG5cdFx0XHRcdGp1c3RpZnktY29udGVudDogbGVmdDtcblx0XHRcdFx0bWFyZ2luOiAwIDE2cHggMCAkezggKyBjb2RlQ2VsbExlZnRNYXJnaW59cHg7XG5cdFx0XHR9YCk7XG5cblx0XHRcdHN0eWxlU2hlZXRzLnB1c2goYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAuY2VsbC1saXN0LXRvcC1jZWxsLXRvb2xiYXItY29udGFpbmVyLFxuXHRcdFx0Lm5vdGVib29rT3ZlcmxheSAuY2VsbC1ib3R0b20tdG9vbGJhci1jb250YWluZXIgLmFjdGlvbi1pdGVtIHtcblx0XHRcdFx0Ym9yZGVyOiAwcHg7XG5cdFx0XHR9YCk7XG5cdFx0fVxuXG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAuY29kZS1jZWxsLXJvdyBkaXYuY2VsbC5jb2RlIHsgbWFyZ2luLWxlZnQ6ICR7Z2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW59cHg7IH1gKTtcblx0XHQvLyBDaGF0IEVkaXQsIGRlbGV0ZWQgQ2VsbCBPdmVybGF5XG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAudmlldy16b25lcyAuY29kZS1jZWxsLXJvdyBkaXYuY2VsbC5jb2RlIHsgbWFyZ2luLWxlZnQ6ICR7Z2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW59cHg7IH1gKTtcblx0XHQvLyBDaGF0IEVkaXQsIGRlbGV0ZWQgQ2VsbCBPdmVybGF5XG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAudmlldy16b25lcyAuY29kZS1jZWxsLXJvdyBkaXYuY2VsbCB7IG1hcmdpbi1yaWdodDogJHtjZWxsUmlnaHRNYXJnaW59cHg7IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cgZGl2LmNlbGwgeyBtYXJnaW4tcmlnaHQ6ICR7Y2VsbFJpZ2h0TWFyZ2lufXB4OyB9YCk7XG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93ID4gLmNlbGwtaW5uZXItY29udGFpbmVyIHsgcGFkZGluZy10b3A6ICR7Y2VsbFRvcE1hcmdpbn1weDsgfWApO1xuXHRcdHN0eWxlU2hlZXRzLnB1c2goYC5ub3RlYm9va092ZXJsYXkgLmNlbGwtbGlzdC1jb250YWluZXIgPiAubW9uYWNvLWxpc3QgPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1hcmtkb3duLWNlbGwtcm93ID4gLmNlbGwtaW5uZXItY29udGFpbmVyIHsgcGFkZGluZy1ib3R0b206ICR7bWFya2Rvd25DZWxsQm90dG9tTWFyZ2lufXB4OyBwYWRkaW5nLXRvcDogJHttYXJrZG93bkNlbGxUb3BNYXJnaW59cHg7IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tYXJrZG93bi1jZWxsLXJvdyA+IC5jZWxsLWlubmVyLWNvbnRhaW5lci53ZWJ2aWV3LWJhY2tlZC1tYXJrZG93bi1jZWxsIHsgcGFkZGluZzogMDsgfWApO1xuXHRcdHN0eWxlU2hlZXRzLnB1c2goYC5ub3RlYm9va092ZXJsYXkgLmNlbGwtbGlzdC1jb250YWluZXIgPiAubW9uYWNvLWxpc3QgPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1hcmtkb3duLWNlbGwtcm93ID4gLndlYnZpZXctYmFja2VkLW1hcmtkb3duLWNlbGwubWFya2Rvd24tY2VsbC1lZGl0LW1vZGUgLmNlbGwuY29kZSB7IHBhZGRpbmctYm90dG9tOiAke21hcmtkb3duQ2VsbEJvdHRvbU1hcmdpbn1weDsgcGFkZGluZy10b3A6ICR7bWFya2Rvd25DZWxsVG9wTWFyZ2lufXB4OyB9YCk7XG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAub3V0cHV0IHsgbWFyZ2luOiAwcHggJHtjZWxsUmlnaHRNYXJnaW59cHggMHB4ICR7Z2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW59cHg7IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5vdXRwdXQgeyB3aWR0aDogY2FsYygxMDAlIC0gJHtnZXRDZWxsRWRpdG9yQ29udGFpbmVyTGVmdE1hcmdpbiArIGNlbGxSaWdodE1hcmdpbn1weCk7IH1gKTtcblxuXHRcdC8vIGNvbW1lbnRcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtY29tbWVudC1jb250YWluZXIgeyBsZWZ0OiAke2dldENlbGxFZGl0b3JDb250YWluZXJMZWZ0TWFyZ2lufXB4OyB9YCk7XG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWNvbW1lbnQtY29udGFpbmVyIHsgd2lkdGg6IGNhbGMoMTAwJSAtICR7Z2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW4gKyBjZWxsUmlnaHRNYXJnaW59cHgpOyB9YCk7XG5cblx0XHQvLyBvdXRwdXQgY29sbGFwc2UgYnV0dG9uXG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAub3V0cHV0IC5vdXRwdXQtY29sbGFwc2UtY29udGFpbmVyIC5leHBhbmRCdXR0b24geyBsZWZ0OiAtJHtjZWxsUnVuR3V0dGVyfXB4OyB9YCk7XG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAub3V0cHV0IC5vdXRwdXQtY29sbGFwc2UtY29udGFpbmVyIC5leHBhbmRCdXR0b24ge1xuXHRcdFx0cG9zaXRpb246IGFic29sdXRlO1xuXHRcdFx0d2lkdGg6ICR7Y2VsbFJ1bkd1dHRlcn1weDtcblx0XHRcdHBhZGRpbmc6IDZweCAwcHg7XG5cdFx0fWApO1xuXG5cdFx0Ly8gc2hvdyBtb3JlIGNvbnRhaW5lclxuXHRcdHN0eWxlU2hlZXRzLnB1c2goYC5ub3RlYm9va092ZXJsYXkgLm91dHB1dC1zaG93LW1vcmUtY29udGFpbmVyIHsgbWFyZ2luOiAwcHggJHtjZWxsUmlnaHRNYXJnaW59cHggMHB4ICR7Z2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW59cHg7IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5vdXRwdXQtc2hvdy1tb3JlLWNvbnRhaW5lciB7IHdpZHRoOiBjYWxjKDEwMCUgLSAke2dldENlbGxFZGl0b3JDb250YWluZXJMZWZ0TWFyZ2luICsgY2VsbFJpZ2h0TWFyZ2lufXB4KTsgfWApO1xuXG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93IGRpdi5jZWxsLm1hcmtkb3duIHsgcGFkZGluZy1sZWZ0OiAke2NlbGxSdW5HdXR0ZXJ9cHg7IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5ID4gLmNlbGwtbGlzdC1jb250YWluZXIgLm5vdGVib29rLWZvbGRpbmctaW5kaWNhdG9yIHsgbGVmdDogJHsobWFya2Rvd25DZWxsR3V0dGVyIC0gMjApIC8gMiArIG1hcmtkb3duQ2VsbExlZnRNYXJnaW59cHg7IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5ID4gLmNlbGwtbGlzdC1jb250YWluZXIgLm5vdGVib29rLWZvbGRlZC1oaW50IHsgbGVmdDogJHttYXJrZG93bkNlbGxHdXR0ZXIgKyBtYXJrZG93bkNlbGxMZWZ0TWFyZ2luICsgOH1weDsgfWApO1xuXHRcdHN0eWxlU2hlZXRzLnB1c2goYC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cgOm5vdCgud2Vidmlldy1iYWNrZWQtbWFya2Rvd24tY2VsbCkgLmNlbGwtZm9jdXMtaW5kaWNhdG9yLXRvcCB7IGhlaWdodDogJHtjZWxsVG9wTWFyZ2lufXB4OyB9YCk7XG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdyAuY2VsbC1mb2N1cy1pbmRpY2F0b3Itc2lkZSB7IGJvdHRvbTogJHtib3R0b21Ub29sYmFyR2FwfXB4OyB9YCk7XG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdy5jb2RlLWNlbGwtcm93IC5jZWxsLWZvY3VzLWluZGljYXRvci1sZWZ0IHsgd2lkdGg6ICR7Z2V0Q2VsbEVkaXRvckNvbnRhaW5lckxlZnRNYXJnaW59cHg7IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93Lm1hcmtkb3duLWNlbGwtcm93IC5jZWxsLWZvY3VzLWluZGljYXRvci1sZWZ0IHsgd2lkdGg6ICR7Y29kZUNlbGxMZWZ0TWFyZ2lufXB4OyB9YCk7XG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdyAuY2VsbC1mb2N1cy1pbmRpY2F0b3IuY2VsbC1mb2N1cy1pbmRpY2F0b3ItcmlnaHQgeyB3aWR0aDogJHtjZWxsUmlnaHRNYXJnaW59cHg7IH1gKTtcblx0XHRzdHlsZVNoZWV0cy5wdXNoKGAubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWZvY3VzLWluZGljYXRvci1ib3R0b20geyBoZWlnaHQ6ICR7Y2VsbEJvdHRvbU1hcmdpbn1weDsgfWApO1xuXHRcdHN0eWxlU2hlZXRzLnB1c2goYC5ub3RlYm9va092ZXJsYXkgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cgLmNlbGwtc2hhZG93LWNvbnRhaW5lci1ib3R0b20geyB0b3A6ICR7Y2VsbEJvdHRvbU1hcmdpbn1weDsgfWApO1xuXG5cdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0XHQubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdC5zZWxlY3Rpb24tbXVsdGlwbGUgLm1vbmFjby1saXN0LXJvdzpoYXMoKyAubW9uYWNvLWxpc3Qtcm93LnNlbGVjdGVkKSAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItYm90dG9tIHtcblx0XHRcdFx0aGVpZ2h0OiAke2JvdHRvbVRvb2xiYXJHYXAgKyBjZWxsQm90dG9tTWFyZ2lufXB4O1xuXHRcdFx0fVxuXHRcdGApO1xuXG5cdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0XHQubm90ZWJvb2tPdmVybGF5IC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93LmNvZGUtY2VsbC1yb3cubmItbXVsdGlDZWxsSGlnaGxpZ2h0OmhhcygrIC5tb25hY28tbGlzdC1yb3cubmItbXVsdGlDZWxsSGlnaGxpZ2h0KSAuY2VsbC1mb2N1cy1pbmRpY2F0b3ItYm90dG9tIHtcblx0XHRcdFx0aGVpZ2h0OiAke2JvdHRvbVRvb2xiYXJHYXAgKyBjZWxsQm90dG9tTWFyZ2lufXB4O1xuXHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12c2NvZGUtbm90ZWJvb2stc3ltYm9sSGlnaGxpZ2h0QmFja2dyb3VuZCkgIWltcG9ydGFudDtcblx0XHRcdH1cblxuXHRcdFx0Lm5vdGVib29rT3ZlcmxheSAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdy5tYXJrZG93bi1jZWxsLXJvdy5uYi1tdWx0aUNlbGxIaWdobGlnaHQ6aGFzKCsgLm1vbmFjby1saXN0LXJvdy5uYi1tdWx0aUNlbGxIaWdobGlnaHQpIC5jZWxsLWZvY3VzLWluZGljYXRvci1ib3R0b20ge1xuXHRcdFx0XHRoZWlnaHQ6ICR7Ym90dG9tVG9vbGJhckdhcCArIGNlbGxCb3R0b21NYXJnaW4gLSA2fXB4O1xuXHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12c2NvZGUtbm90ZWJvb2stc3ltYm9sSGlnaGxpZ2h0QmFja2dyb3VuZCkgIWltcG9ydGFudDtcblx0XHRcdH1cblx0XHRgKTtcblxuXG5cdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5ID4gLmNlbGwtbGlzdC1jb250YWluZXIgPiAubW9uYWNvLWxpc3QgPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdyAuaW5wdXQtY29sbGFwc2UtY29udGFpbmVyIC5jZWxsLWNvbGxhcHNlLXByZXZpZXcge1xuXHRcdFx0XHRsaW5lLWhlaWdodDogJHtjb2xsYXBzZWRJbmRpY2F0b3JIZWlnaHR9cHg7XG5cdFx0XHR9XG5cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgPiAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93IC5pbnB1dC1jb2xsYXBzZS1jb250YWluZXIgLmNlbGwtY29sbGFwc2UtcHJldmlldyAubW9uYWNvLXRva2VuaXplZC1zb3VyY2Uge1xuXHRcdFx0XHRtYXgtaGVpZ2h0OiAke2NvbGxhcHNlZEluZGljYXRvckhlaWdodH1weDtcblx0XHRcdH1cblx0XHRgKTtcblxuXHRcdHN0eWxlU2hlZXRzLnB1c2goYC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgPiAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLWJvdHRvbS10b29sYmFyLWNvbnRhaW5lciAubW9uYWNvLXRvb2xiYXIgeyBoZWlnaHQ6ICR7Ym90dG9tVG9vbGJhckhlaWdodH1weCB9YCk7XG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSA+IC5jZWxsLWxpc3QtY29udGFpbmVyID4gLm1vbmFjby1saXN0ID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC52aWV3LXpvbmVzIC5jZWxsLWxpc3QtdG9wLWNlbGwtdG9vbGJhci1jb250YWluZXIgLm1vbmFjby10b29sYmFyIHsgaGVpZ2h0OiAke2JvdHRvbVRvb2xiYXJIZWlnaHR9cHggfWApO1xuXG5cdFx0Ly8gY2VsbCB0b29sYmFyXG5cdFx0c3R5bGVTaGVldHMucHVzaChgLm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheS5jZWxsLXRpdGxlLXRvb2xiYXItcmlnaHQgPiAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLXRpdGxlLXRvb2xiYXIge1xuXHRcdFx0cmlnaHQ6ICR7Y2VsbFJpZ2h0TWFyZ2luICsgMjZ9cHg7XG5cdFx0fVxuXHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkuY2VsbC10aXRsZS10b29sYmFyLWxlZnQgPiAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLXRpdGxlLXRvb2xiYXIge1xuXHRcdFx0bGVmdDogJHtnZXRDZWxsRWRpdG9yQ29udGFpbmVyTGVmdE1hcmdpbiArIDE2fXB4O1xuXHRcdH1cblx0XHQubW9uYWNvLXdvcmtiZW5jaCAubm90ZWJvb2tPdmVybGF5LmNlbGwtdGl0bGUtdG9vbGJhci1oaWRkZW4gPiAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93IC5jZWxsLXRpdGxlLXRvb2xiYXIge1xuXHRcdFx0ZGlzcGxheTogbm9uZTtcblx0XHR9YCk7XG5cblx0XHQvLyBjZWxsIG91dHB1dCBpbm5lcnQgY29udGFpbmVyXG5cdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAub3V0cHV0ID4gZGl2LmZvcmVncm91bmQub3V0cHV0LWlubmVyLWNvbnRhaW5lciB7XG5cdFx0XHRwYWRkaW5nOiAke091dHB1dElubmVyQ29udGFpbmVyVG9wUGFkZGluZ31weCA4cHg7XG5cdFx0fVxuXHRcdC5tb25hY28td29ya2JlbmNoIC5ub3RlYm9va092ZXJsYXkgPiAuY2VsbC1saXN0LWNvbnRhaW5lciA+IC5tb25hY28tbGlzdCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93IC5vdXRwdXQtY29sbGFwc2UtY29udGFpbmVyIHtcblx0XHRcdHBhZGRpbmc6ICR7T3V0cHV0SW5uZXJDb250YWluZXJUb3BQYWRkaW5nfXB4IDhweDtcblx0XHR9XG5cdFx0YCk7XG5cblx0XHQvLyBjaGF0XG5cdFx0c3R5bGVTaGVldHMucHVzaChgXG5cdFx0Lm1vbmFjby13b3JrYmVuY2ggLm5vdGVib29rT3ZlcmxheSAuY2VsbC1jaGF0LXBhcnQge1xuXHRcdFx0bWFyZ2luOiAwICR7Y2VsbFJpZ2h0TWFyZ2lufXB4IDZweCA0cHg7XG5cdFx0fVxuXHRcdGApO1xuXG5cdFx0dGhpcy5fc3R5bGVFbGVtZW50LnRleHRDb250ZW50ID0gc3R5bGVTaGVldHMuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVDZWxsTGlzdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9ib2R5LmNsYXNzTGlzdC5hZGQoJ2NlbGwtbGlzdC1jb250YWluZXInKTtcblx0XHR0aGlzLl9kbmRDb250cm9sbGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IENlbGxEcmFnQW5kRHJvcENvbnRyb2xsZXIodGhpcywgdGhpcy5fYm9keSkpO1xuXHRcdGNvbnN0IGdldFNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpID0+IHRoaXMuX2xpc3QuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKGNvbnRhaW5lcik7XG5cdFx0dGhpcy5fZWRpdG9yUG9vbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tDZWxsRWRpdG9yUG9vbCwgdGhpcywgZ2V0U2NvcGVkQ29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRjb25zdCByZW5kZXJlcnMgPSBbXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVDZWxsUmVuZGVyZXIsIHRoaXMsIHRoaXMuX3JlbmRlcmVkRWRpdG9ycywgdGhpcy5fZWRpdG9yUG9vbCwgdGhpcy5fZG5kQ29udHJvbGxlciwgZ2V0U2NvcGVkQ29udGV4dEtleVNlcnZpY2UpLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYXJrdXBDZWxsUmVuZGVyZXIsIHRoaXMsIHRoaXMuX2RuZENvbnRyb2xsZXIsIHRoaXMuX3JlbmRlcmVkRWRpdG9ycywgZ2V0U2NvcGVkQ29udGV4dEtleVNlcnZpY2UpLFxuXHRcdF07XG5cblx0XHRyZW5kZXJlcnMuZm9yRWFjaChyZW5kZXJlciA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZW5kZXJlcik7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9saXN0RGVsZWdhdGUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rQ2VsbExpc3REZWxlZ2F0ZSwgRE9NLmdldFdpbmRvdyh0aGlzLmdldERvbU5vZGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3REZWxlZ2F0ZSk7XG5cblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5UHJvdmlkZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rQWNjZXNzaWJpbGl0eVByb3ZpZGVyLCAoKSA9PiB0aGlzLnZpZXdNb2RlbCwgdGhpcy5pc1JlcGxIaXN0b3J5KTtcblx0XHR0aGlzLl9yZWdpc3RlcihhY2Nlc3NpYmlsaXR5UHJvdmlkZXIpO1xuXG5cdFx0dGhpcy5fbGlzdCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHROb3RlYm9va0NlbGxMaXN0LFxuXHRcdFx0J05vdGVib29rQ2VsbExpc3QnLFxuXHRcdFx0dGhpcy5fYm9keSxcblx0XHRcdHRoaXMuX3ZpZXdDb250ZXh0Lm5vdGVib29rT3B0aW9ucyxcblx0XHRcdHRoaXMuX2xpc3REZWxlZ2F0ZSxcblx0XHRcdHJlbmRlcmVycyxcblx0XHRcdHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHR7XG5cdFx0XHRcdHNldFJvd0xpbmVIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRzZXRSb3dIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRzdXBwb3J0RHluYW1pY0hlaWdodHM6IHRydWUsXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRrZXlib2FyZFN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRtb3VzZVN1cHBvcnQ6IHRydWUsXG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogdHJ1ZSxcblx0XHRcdFx0c2VsZWN0aW9uTmF2aWdhdGlvbjogdHJ1ZSxcblx0XHRcdFx0dHlwZU5hdmlnYXRpb25FbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRwYWRkaW5nVG9wOiAwLFxuXHRcdFx0XHRwYWRkaW5nQm90dG9tOiAwLFxuXHRcdFx0XHR0cmFuc2Zvcm1PcHRpbWl6YXRpb246IGZhbHNlLCAvLyhpc01hY2ludG9zaCAmJiBpc05hdGl2ZSkgfHwgZ2V0VGl0bGVCYXJTdHlsZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSkgPT09ICduYXRpdmUnLFxuXHRcdFx0XHRpbml0aWFsU2l6ZTogdGhpcy5fZGltZW5zaW9uLFxuXHRcdFx0XHRzdHlsZUNvbnRyb2xsZXI6IChfc3VmZml4OiBzdHJpbmcpID0+IHsgcmV0dXJuIHRoaXMuX2xpc3Q7IH0sXG5cdFx0XHRcdG92ZXJyaWRlU3R5bGVzOiB7XG5cdFx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IG5vdGVib29rRWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdFx0XHRsaXN0QWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZDogbm90ZWJvb2tFZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RGb2N1c0FuZFNlbGVjdGlvbkJhY2tncm91bmQ6IG5vdGVib29rRWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdFx0XHRsaXN0Rm9jdXNBbmRTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RGb2N1c0JhY2tncm91bmQ6IG5vdGVib29rRWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdFx0XHRsaXN0Rm9jdXNGb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RIb3ZlckZvcmVncm91bmQ6IGZvcmVncm91bmQsXG5cdFx0XHRcdFx0bGlzdEhvdmVyQmFja2dyb3VuZDogbm90ZWJvb2tFZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RIb3Zlck91dGxpbmU6IGZvY3VzQm9yZGVyLFxuXHRcdFx0XHRcdGxpc3RGb2N1c091dGxpbmU6IGZvY3VzQm9yZGVyLFxuXHRcdFx0XHRcdGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQ6IG5vdGVib29rRWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdFx0XHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RJbmFjdGl2ZUZvY3VzQmFja2dyb3VuZDogbm90ZWJvb2tFZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RJbmFjdGl2ZUZvY3VzT3V0bGluZTogbm90ZWJvb2tFZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXJcblx0XHRcdH0sXG5cdFx0KTtcblx0XHR0aGlzLl9jZWxsTGF5b3V0TWFuYWdlciA9IG5ldyBOb3RlYm9va0NlbGxMYXlvdXRNYW5hZ2VyKHRoaXMsIHRoaXMuX2xpc3QsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0dGhpcy5fZG5kQ29udHJvbGxlci5zZXRMaXN0KHRoaXMuX2xpc3QpO1xuXG5cdFx0Ly8gY3JlYXRlIFdlYnZpZXdcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3QpO1xuXHRcdHRoaXMuX2xpc3RWaWV3SW5mb0FjY2Vzc29yID0gbmV3IExpc3RWaWV3SW5mb0FjY2Vzc29yKHRoaXMuX2xpc3QpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3RWaWV3SW5mb0FjY2Vzc29yKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbWJpbmVkRGlzcG9zYWJsZSguLi5yZW5kZXJlcnMpKTtcblxuXHRcdC8vIHRvcCBjZWxsIHRvb2xiYXJcblx0XHR0aGlzLl9saXN0VG9wQ2VsbFRvb2xiYXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExpc3RUb3BDZWxsVG9vbGJhciwgdGhpcywgdGhpcy5ub3RlYm9va09wdGlvbnMpKTtcblxuXHRcdC8vIHRyYW5zcGFyZW50IGNvdmVyXG5cdFx0dGhpcy5fd2Vidmlld1RyYW5zcGFyZW50Q292ZXIgPSBET00uYXBwZW5kKHRoaXMuX2xpc3Qucm93c0NvbnRhaW5lciwgJCgnLndlYnZpZXctY292ZXInKSk7XG5cdFx0dGhpcy5fd2Vidmlld1RyYW5zcGFyZW50Q292ZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGRTdGFuZGFyZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIodGhpcy5fb3ZlcmxheUNvbnRhaW5lciwgKGU6IFN0YW5kYXJkTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUudGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnc2xpZGVyJykgJiYgdGhpcy5fd2Vidmlld1RyYW5zcGFyZW50Q292ZXIpIHtcblx0XHRcdFx0dGhpcy5fd2Vidmlld1RyYW5zcGFyZW50Q292ZXIuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZVVwTGlzdGVuZXIodGhpcy5fb3ZlcmxheUNvbnRhaW5lciwgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3dlYnZpZXdUcmFuc3BhcmVudENvdmVyKSB7XG5cdFx0XHRcdC8vIG5vIG1hdHRlciB3aGVuXG5cdFx0XHRcdHRoaXMuX3dlYnZpZXdUcmFuc3BhcmVudENvdmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGlzdC5vbk1vdXNlRG93bihlID0+IHtcblx0XHRcdGlmIChlLmVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fb25Nb3VzZURvd24uZmlyZSh7IGV2ZW50OiBlLmJyb3dzZXJFdmVudCwgdGFyZ2V0OiBlLmVsZW1lbnQgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGlzdC5vbk1vdXNlVXAoZSA9PiB7XG5cdFx0XHRpZiAoZS5lbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuX29uTW91c2VVcC5maXJlKHsgZXZlbnQ6IGUuYnJvd3NlckV2ZW50LCB0YXJnZXQ6IGUuZWxlbWVudCB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0Lm9uRGlkQ2hhbmdlRm9jdXMoX2UgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVFZGl0b3IuZmlyZSh0aGlzKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlQ2VsbC5maXJlKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUZvY3VzLmZpcmUoKTtcblx0XHRcdHRoaXMuX2N1cnNvck5hdk1vZGUuc2V0KGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0Lm9uQ29udGV4dE1lbnUoZSA9PiB7XG5cdFx0XHR0aGlzLnNob3dMaXN0Q29udGV4dE1lbnUoZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGlzdC5vbkRpZENoYW5nZVZpc2libGVSYW5nZXMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmxlUmFuZ2VzLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0Lm9uRGlkU2Nyb2xsKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5zY3JvbGxUb3AgIT09IGUub2xkU2Nyb2xsVG9wKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkU2Nyb2xsLmZpcmUoKTtcblx0XHRcdFx0dGhpcy5jbGVhckFjdGl2ZUNlbGxXaWRnZXRzKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLnNjcm9sbFRvcCA9PT0gZS5vbGRTY3JvbGxUb3AgJiYgZS5zY3JvbGxIZWlnaHRDaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTGF5b3V0LmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9mb2N1c1RyYWNrZXIgPSB0aGlzLl9yZWdpc3RlcihET00udHJhY2tGb2N1cyh0aGlzLmdldERvbU5vZGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZWRpdG9yRm9jdXMuc2V0KGZhbHNlKTtcblx0XHRcdHRoaXMudmlld01vZGVsPy5zZXRFZGl0b3JGb2N1cyhmYWxzZSk7XG5cdFx0XHR0aGlzLl9vbkRpZEJsdXJFbWl0dGVyLmZpcmUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZWRpdG9yRm9jdXMuc2V0KHRydWUpO1xuXHRcdFx0dGhpcy52aWV3TW9kZWw/LnNldEVkaXRvckZvY3VzKHRydWUpO1xuXHRcdFx0dGhpcy5fb25EaWRGb2N1c0VtaXR0ZXIuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyTm90ZWJvb2tBY3Rpb25zVG9vbGJhcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyTm90ZWJvb2tTdGlja3lTY3JvbGwoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oYWNjZXNzaWJpbGl0eVByb3ZpZGVyLnZlcmJvc2l0eVNldHRpbmdJZCkpIHtcblx0XHRcdFx0dGhpcy5fbGlzdC5hcmlhTGFiZWwgPSBhY2Nlc3NpYmlsaXR5UHJvdmlkZXI/LmdldFdpZGdldEFyaWFMYWJlbCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd0xpc3RDb250ZXh0TWVudShlOiBJTGlzdENvbnRleHRNZW51RXZlbnQ8Q2VsbFZpZXdNb2RlbD4pIHtcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0bWVudUlkOiBNZW51SWQuTm90ZWJvb2tDZWxsVGl0bGUsXG5cdFx0XHRtZW51QWN0aW9uT3B0aW9uczoge1xuXHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZnJvbTogJ2NlbGxDb250YWluZXInXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlck5vdGVib29rT3ZlcnZpZXdSdWxlcigpIHtcblx0XHR0aGlzLl9ub3RlYm9va092ZXJ2aWV3UnVsZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rT3ZlcnZpZXdSdWxlciwgdGhpcywgdGhpcy5fbm90ZWJvb2tPdmVydmlld1J1bGVyQ29udGFpbmVyKSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlck5vdGVib29rQWN0aW9uc1Rvb2xiYXIoKSB7XG5cdFx0dGhpcy5fbm90ZWJvb2tUb3BUb29sYmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va0VkaXRvcldvcmtiZW5jaFRvb2xiYXIsIHRoaXMsIHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuX25vdGVib29rT3B0aW9ucywgdGhpcy5fbm90ZWJvb2tUb3BUb29sYmFyQ29udGFpbmVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbm90ZWJvb2tUb3BUb29sYmFyLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZGltZW5zaW9uICYmIHRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLl9kaW1lbnNpb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTm90ZWJvb2tTdGlja3lTY3JvbGwoKSB7XG5cdFx0dGhpcy5fbm90ZWJvb2tTdGlja3lTY3JvbGwgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rU3RpY2t5U2Nyb2xsLCB0aGlzLl9ub3RlYm9va1N0aWNreVNjcm9sbENvbnRhaW5lciwgdGhpcywgdGhpcy5fbGlzdCwgKHNpemVEZWx0YSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9kaW1lbnNpb24gJiYgdGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRcdGlmIChzaXplRGVsdGEgPiAwKSB7IC8vIGRlbHRhID4gMCA9PT4gc3RpY2t5IGlzIGdyb3dpbmcsIGNlbGwgbGlzdCBzaHJpbmtpbmdcblx0XHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLl9kaW1lbnNpb24pO1xuXHRcdFx0XHRcdHRoaXMuc2V0U2Nyb2xsVG9wKHRoaXMuc2Nyb2xsVG9wICsgc2l6ZURlbHRhKTtcblx0XHRcdFx0fSBlbHNlIGlmIChzaXplRGVsdGEgPCAwKSB7IC8vIGRlbHRhIDwgMCA9PT4gc3RpY2t5IGlzIHNocmlua2luZywgY2VsbCBsaXN0IGdyb3dpbmdcblx0XHRcdFx0XHR0aGlzLnNldFNjcm9sbFRvcCh0aGlzLnNjcm9sbFRvcCArIHNpemVEZWx0YSk7XG5cdFx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5fZGltZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vbkRpZFNjcm9sbC5maXJlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlT3V0cHV0UmVuZGVyZXJzKCkge1xuXHRcdGlmICghdGhpcy52aWV3TW9kZWwgfHwgIXRoaXMuX3dlYnZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl93ZWJ2aWV3LnVwZGF0ZU91dHB1dFJlbmRlcmVycygpO1xuXHRcdHRoaXMudmlld01vZGVsLnZpZXdDZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0Y2VsbC5vdXRwdXRzVmlld01vZGVscy5mb3JFYWNoKG91dHB1dCA9PiB7XG5cdFx0XHRcdGlmIChvdXRwdXQucGlja2VkTWltZVR5cGU/LnJlbmRlcmVySWQgPT09IFJFTkRFUkVSX05PVF9BVkFJTEFCTEUpIHtcblx0XHRcdFx0XHRvdXRwdXQucmVzZXRSZW5kZXJlcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdGdldERvbU5vZGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX292ZXJsYXlDb250YWluZXI7XG5cdH1cblxuXHRnZXRPdmVyZmxvd0NvbnRhaW5lckRvbU5vZGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX292ZXJmbG93Q29udGFpbmVyO1xuXHR9XG5cblx0Z2V0SW5uZXJXZWJ2aWV3KCk6IElXZWJ2aWV3RWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dlYnZpZXc/LndlYnZpZXc7XG5cdH1cblxuXHRzZXRFZGl0b3JQcm9ncmVzc1NlcnZpY2UoZWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlOiBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3JQcm9ncmVzc1NlcnZpY2UgPSBlZGl0b3JQcm9ncmVzc1NlcnZpY2U7XG5cdH1cblxuXHRzZXRQYXJlbnRDb250ZXh0S2V5U2VydmljZShwYXJlbnRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKTogdm9pZCB7XG5cdFx0dGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZS51cGRhdGVQYXJlbnQocGFyZW50Q29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0YXN5bmMgc2V0TW9kZWwodGV4dE1vZGVsOiBOb3RlYm9va1RleHRNb2RlbCwgdmlld1N0YXRlOiBJTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUgfCB1bmRlZmluZWQsIHBlcmY/OiBOb3RlYm9va1BlcmZNYXJrcywgdmlld1R5cGU/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy52aWV3TW9kZWwgPT09IHVuZGVmaW5lZCB8fCAhdGhpcy52aWV3TW9kZWwuZXF1YWwodGV4dE1vZGVsKSkge1xuXHRcdFx0Y29uc3Qgb2xkQm90dG9tVG9vbGJhckRpbWVuc2lvbnMgPSB0aGlzLl9ub3RlYm9va09wdGlvbnMuY29tcHV0ZUJvdHRvbVRvb2xiYXJEaW1lbnNpb25zKHRoaXMudmlld01vZGVsPy52aWV3VHlwZSk7XG5cdFx0XHR0aGlzLl9kZXRhY2hNb2RlbCgpO1xuXHRcdFx0YXdhaXQgdGhpcy5fYXR0YWNoTW9kZWwodGV4dE1vZGVsLCB2aWV3VHlwZSA/PyB0ZXh0TW9kZWwudmlld1R5cGUsIHZpZXdTdGF0ZSwgcGVyZik7XG5cdFx0XHRjb25zdCBuZXdCb3R0b21Ub29sYmFyRGltZW5zaW9ucyA9IHRoaXMuX25vdGVib29rT3B0aW9ucy5jb21wdXRlQm90dG9tVG9vbGJhckRpbWVuc2lvbnModGhpcy52aWV3TW9kZWw/LnZpZXdUeXBlKTtcblxuXHRcdFx0aWYgKG9sZEJvdHRvbVRvb2xiYXJEaW1lbnNpb25zLmJvdHRvbVRvb2xiYXJHYXAgIT09IG5ld0JvdHRvbVRvb2xiYXJEaW1lbnNpb25zLmJvdHRvbVRvb2xiYXJHYXBcblx0XHRcdFx0fHwgb2xkQm90dG9tVG9vbGJhckRpbWVuc2lvbnMuYm90dG9tVG9vbGJhckhlaWdodCAhPT0gbmV3Qm90dG9tVG9vbGJhckRpbWVuc2lvbnMuYm90dG9tVG9vbGJhckhlaWdodCkge1xuXHRcdFx0XHR0aGlzLl9zdHlsZUVsZW1lbnQ/LnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVMYXlvdXRTdHlsZXMoKTtcblx0XHRcdFx0dGhpcy5fd2Vidmlldz8udXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdFx0Li4udGhpcy5ub3RlYm9va09wdGlvbnMuY29tcHV0ZVdlYnZpZXdPcHRpb25zKCksXG5cdFx0XHRcdFx0Zm9udEZhbWlseTogdGhpcy5fZ2VuZXJhdGVGb250RmFtaWx5KClcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHR0eXBlIFdvcmtiZW5jaE5vdGVib29rT3BlbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRvd25lcjogJ3JlYm9ybml4Jztcblx0XHRcdFx0Y29tbWVudDogJ0lkZW50aWZ5IHRoZSBub3RlYm9vayBlZGl0b3IgdmlldyB0eXBlJztcblx0XHRcdFx0c2NoZW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRmlsZSBzeXN0ZW0gcHJvdmlkZXIgc2NoZW1lIGZvciB0aGUgcmVzb3VyY2UnIH07XG5cdFx0XHRcdGV4dDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0ZpbGUgZXh0ZW5zaW9uIGZvciB0aGUgcmVzb3VyY2UnIH07XG5cdFx0XHRcdHZpZXdUeXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVmlldyB0eXBlIG9mIHRoZSBub3RlYm9vayBlZGl0b3InIH07XG5cdFx0XHRcdGlzUmVwbDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIG5vdGVib29rIGVkaXRvciBpcyB3aXRoaW4gYSBSRVBMIGVkaXRvcicgfTtcblx0XHRcdH07XG5cblx0XHRcdHR5cGUgV29ya2JlbmNoTm90ZWJvb2tPcGVuRXZlbnQgPSB7XG5cdFx0XHRcdHNjaGVtZTogc3RyaW5nO1xuXHRcdFx0XHRleHQ6IHN0cmluZztcblx0XHRcdFx0dmlld1R5cGU6IHN0cmluZztcblx0XHRcdFx0aXNSZXBsOiBib29sZWFuO1xuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoTm90ZWJvb2tPcGVuRXZlbnQsIFdvcmtiZW5jaE5vdGVib29rT3BlbkNsYXNzaWZpY2F0aW9uPignbm90ZWJvb2svZWRpdG9yT3BlbmVkJywge1xuXHRcdFx0XHRzY2hlbWU6IHRleHRNb2RlbC51cmkuc2NoZW1lLFxuXHRcdFx0XHRleHQ6IGV4dG5hbWUodGV4dE1vZGVsLnVyaSksXG5cdFx0XHRcdHZpZXdUeXBlOiB0ZXh0TW9kZWwudmlld1R5cGUsXG5cdFx0XHRcdGlzUmVwbDogdGhpcy5pc1JlcGxIaXN0b3J5XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZXN0b3JlTGlzdFZpZXdTdGF0ZSh2aWV3U3RhdGUpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Jlc3RvcmVTZWxlY3RlZEtlcm5lbCh2aWV3U3RhdGUpO1xuXG5cdFx0Ly8gbG9hZCBwcmVsb2FkcyBmb3IgbWF0Y2hpbmcga2VybmVsXG5cdFx0dGhpcy5fbG9hZEtlcm5lbFByZWxvYWRzKCk7XG5cblx0XHQvLyBjbGVhciBzdGF0ZVxuXHRcdHRoaXMuX2RuZENvbnRyb2xsZXI/LmNsZWFyR2xvYmFsRHJhZ1N0YXRlKCk7XG5cblx0XHR0aGlzLl9sb2NhbFN0b3JlLmFkZCh0aGlzLl9saXN0Lm9uRGlkQ2hhbmdlRm9jdXMoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVDb250ZXh0S2V5c09uRm9jdXNDaGFuZ2UoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZUNvbnRleHRLZXlzT25Gb2N1c0NoYW5nZSgpO1xuXHRcdC8vIHJlbmRlciBtYXJrZG93biB0b3AgZG93biBvbiBpZGxlXG5cdFx0dGhpcy5fYmFja2dyb3VuZE1hcmtkb3duUmVuZGVyaW5nKCk7XG5cdH1cblxuXHRwcml2YXRlIF9iYWNrZ3JvdW5kTWFya2Rvd25SZW5kZXJSdW5uaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX2JhY2tncm91bmRNYXJrZG93blJlbmRlcmluZygpIHtcblx0XHRpZiAodGhpcy5fYmFja2dyb3VuZE1hcmtkb3duUmVuZGVyUnVubmluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2JhY2tncm91bmRNYXJrZG93blJlbmRlclJ1bm5pbmcgPSB0cnVlO1xuXHRcdERPTS5ydW5XaGVuV2luZG93SWRsZShET00uZ2V0V2luZG93KHRoaXMuZ2V0RG9tTm9kZSgpKSwgKGRlYWRsaW5lKSA9PiB7XG5cdFx0XHR0aGlzLl9iYWNrZ3JvdW5kTWFya2Rvd25SZW5kZXJpbmdXaXRoRGVhZGxpbmUoZGVhZGxpbmUpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfYmFja2dyb3VuZE1hcmtkb3duUmVuZGVyaW5nV2l0aERlYWRsaW5lKGRlYWRsaW5lOiBJZGxlRGVhZGxpbmUpIHtcblx0XHRjb25zdCBlbmRUaW1lID0gRGF0ZS5ub3coKSArIGRlYWRsaW5lLnRpbWVSZW1haW5pbmcoKTtcblxuXHRcdGNvbnN0IGV4ZWN1dGUgPSAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9iYWNrZ3JvdW5kTWFya2Rvd25SZW5kZXJSdW5uaW5nID0gdHJ1ZTtcblx0XHRcdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIXRoaXMudmlld01vZGVsKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZmlyc3RNYXJrdXBDZWxsID0gdGhpcy52aWV3TW9kZWwudmlld0NlbGxzLmZpbmQoY2VsbCA9PiBjZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXAgJiYgIXRoaXMuX3dlYnZpZXc/Lm1hcmt1cFByZXZpZXdNYXBwaW5nLmhhcyhjZWxsLmlkKSAmJiAhdGhpcy5jZWxsSXNIaWRkZW4oY2VsbCkpIGFzIE1hcmt1cENlbGxWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICghZmlyc3RNYXJrdXBDZWxsKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5jcmVhdGVNYXJrdXBQcmV2aWV3KGZpcnN0TWFya3VwQ2VsbCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9iYWNrZ3JvdW5kTWFya2Rvd25SZW5kZXJSdW5uaW5nID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChEYXRlLm5vdygpIDwgZW5kVGltZSkge1xuXHRcdFx0XHRzZXRUaW1lb3V0MChleGVjdXRlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2JhY2tncm91bmRNYXJrZG93blJlbmRlcmluZygpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRleGVjdXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbnRleHRLZXlzT25Gb2N1c0NoYW5nZSgpIHtcblx0XHRpZiAoIXRoaXMudmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXNlZEVsZW1lbnRzKClbMF07XG5cdFx0aWYgKGZvY3VzZWQpIHtcblx0XHRcdGlmICghdGhpcy5fY2VsbENvbnRleHRLZXlNYW5hZ2VyKSB7XG5cdFx0XHRcdHRoaXMuX2NlbGxDb250ZXh0S2V5TWFuYWdlciA9IHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2VsbENvbnRleHRLZXlNYW5hZ2VyLCB0aGlzLCBmb2N1c2VkIGFzIENlbGxWaWV3TW9kZWwpKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fY2VsbENvbnRleHRLZXlNYW5hZ2VyLnVwZGF0ZUZvckVsZW1lbnQoZm9jdXNlZCBhcyBDZWxsVmlld01vZGVsKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzZXRPcHRpb25zKG9wdGlvbnM6IElOb3RlYm9va0VkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAob3B0aW9ucz8uaXNSZWFkT25seSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9yZWFkT25seSA9IG9wdGlvbnM/LmlzUmVhZE9ubHk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudmlld01vZGVsLnVwZGF0ZU9wdGlvbnMoeyBpc1JlYWRPbmx5OiB0aGlzLl9yZWFkT25seSB9KTtcblx0XHR0aGlzLm5vdGVib29rT3B0aW9ucy51cGRhdGVPcHRpb25zKHRoaXMuX3JlYWRPbmx5KTtcblxuXHRcdC8vIHJldmVhbCBjZWxsIGlmIGVkaXRvciBvcHRpb25zIHRlbGwgdG8gZG8gc29cblx0XHRjb25zdCBjZWxsT3B0aW9ucyA9IG9wdGlvbnM/LmNlbGxPcHRpb25zID8/IHRoaXMuX3BhcnNlSW5kZXhlZENlbGxPcHRpb25zKG9wdGlvbnMpO1xuXHRcdGlmIChjZWxsT3B0aW9ucykge1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMudmlld01vZGVsLnZpZXdDZWxscy5maW5kKGNlbGwgPT4gY2VsbC51cmkudG9TdHJpbmcoKSA9PT0gY2VsbE9wdGlvbnMucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoY2VsbCkge1xuXHRcdFx0XHR0aGlzLmZvY3VzRWxlbWVudChjZWxsKTtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gY2VsbE9wdGlvbnMub3B0aW9ucz8uc2VsZWN0aW9uO1xuXHRcdFx0XHRpZiAoc2VsZWN0aW9uKSB7XG5cdFx0XHRcdFx0Y2VsbC51cGRhdGVFZGl0U3RhdGUoQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nLCAnc2V0T3B0aW9ucycpO1xuXHRcdFx0XHRcdGNlbGwuZm9jdXNNb2RlID0gQ2VsbEZvY3VzTW9kZS5FZGl0b3I7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZXZlYWxSYW5nZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnRBc3luYyhjZWxsLCBuZXcgUmFuZ2Uoc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgc2VsZWN0aW9uLnN0YXJ0Q29sdW1uLCBzZWxlY3Rpb24uZW5kTGluZU51bWJlciB8fCBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCBzZWxlY3Rpb24uZW5kQ29sdW1uIHx8IHNlbGVjdGlvbi5zdGFydENvbHVtbikpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2xpc3QucmV2ZWFsQ2VsbChjZWxsLCBvcHRpb25zPy5jZWxsUmV2ZWFsVHlwZSA/PyBDZWxsUmV2ZWFsVHlwZS5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9yZW5kZXJlZEVkaXRvcnMuZ2V0KGNlbGwpITtcblx0XHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHRcdGlmIChjZWxsT3B0aW9ucy5vcHRpb25zPy5zZWxlY3Rpb24pIHtcblx0XHRcdFx0XHRcdGNvbnN0IHsgc2VsZWN0aW9uIH0gPSBjZWxsT3B0aW9ucy5vcHRpb25zO1xuXHRcdFx0XHRcdFx0Y29uc3QgZWRpdG9yU2VsZWN0aW9uID0gbmV3IFJhbmdlKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIHNlbGVjdGlvbi5zdGFydENvbHVtbiwgc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgfHwgc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgc2VsZWN0aW9uLmVuZENvbHVtbiB8fCBzZWxlY3Rpb24uc3RhcnRDb2x1bW4pO1xuXHRcdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihlZGl0b3JTZWxlY3Rpb24pO1xuXHRcdFx0XHRcdFx0ZWRpdG9yLnJldmVhbFBvc2l0aW9uSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydCh7XG5cdFx0XHRcdFx0XHRcdGxpbmVOdW1iZXI6IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRcdGNvbHVtbjogc2VsZWN0aW9uLnN0YXJ0Q29sdW1uXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucmV2ZWFsUmFuZ2VJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0QXN5bmMoY2VsbCwgZWRpdG9yU2VsZWN0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFjZWxsT3B0aW9ucy5vcHRpb25zPy5wcmVzZXJ2ZUZvY3VzKSB7XG5cdFx0XHRcdFx0XHRlZGl0b3IuZm9jdXMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBzZWxlY3QgY2VsbHMgaWYgb3B0aW9ucyB0ZWxsIHRvIGRvIHNvXG5cdFx0Ly8gdG9kb0ByZWJvcm5peCBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4MTA4IHN1cHBvcnQgc2VsZWN0aW9ucyBub3QganVzdCBmb2N1c1xuXHRcdC8vIHRvZG9AcmVib3JuaXggc3VwcG9ydCBtdWx0aXBlIHNlbGVjdGlvbnNcblx0XHRpZiAob3B0aW9ucz8uY2VsbFNlbGVjdGlvbnMpIHtcblx0XHRcdGNvbnN0IGZvY3VzQ2VsbEluZGV4ID0gb3B0aW9ucy5jZWxsU2VsZWN0aW9uc1swXS5zdGFydDtcblx0XHRcdGNvbnN0IGZvY3VzZWRDZWxsID0gdGhpcy52aWV3TW9kZWwuY2VsbEF0KGZvY3VzQ2VsbEluZGV4KTtcblx0XHRcdGlmIChmb2N1c2VkQ2VsbCkge1xuXHRcdFx0XHR0aGlzLnZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoe1xuXHRcdFx0XHRcdGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCxcblx0XHRcdFx0XHRmb2N1czogeyBzdGFydDogZm9jdXNDZWxsSW5kZXgsIGVuZDogZm9jdXNDZWxsSW5kZXggKyAxIH0sXG5cdFx0XHRcdFx0c2VsZWN0aW9uczogb3B0aW9ucy5jZWxsU2VsZWN0aW9uc1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5yZXZlYWxJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KGZvY3VzZWRDZWxsKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVGb3JPcHRpb25zKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VPcHRpb25zLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3BhcnNlSW5kZXhlZENlbGxPcHRpb25zKG9wdGlvbnM6IElOb3RlYm9va0VkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAob3B0aW9ucz8uaW5kZXhlZENlbGxPcHRpb25zKSB7XG5cdFx0XHQvLyBjb252ZXJ0IGluZGV4IGJhc2VkIHNlbGVjdGlvbnNcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLmNlbGxBdChvcHRpb25zLmluZGV4ZWRDZWxsT3B0aW9ucy5pbmRleCk7XG5cdFx0XHRpZiAoY2VsbCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJlc291cmNlOiBjZWxsLnVyaSxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRzZWxlY3Rpb246IG9wdGlvbnMuaW5kZXhlZENlbGxPcHRpb25zLnNlbGVjdGlvbixcblx0XHRcdFx0XHRcdHByZXNlcnZlRm9jdXM6IGZhbHNlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9kZXRhY2hNb2RlbCgpIHtcblx0XHR0aGlzLl9sb2NhbFN0b3JlLmNsZWFyKCk7XG5cdFx0ZGlzcG9zZSh0aGlzLl9sb2NhbENlbGxTdGF0ZUxpc3RlbmVycyk7XG5cdFx0dGhpcy5fbGlzdC5kZXRhY2hWaWV3TW9kZWwoKTtcblx0XHR0aGlzLnZpZXdNb2RlbD8uZGlzcG9zZSgpO1xuXHRcdC8vIGF2b2lkIGV2ZW50XG5cdFx0dGhpcy52aWV3TW9kZWwgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fd2Vidmlldz8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3dlYnZpZXc/LmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0dGhpcy5fd2VidmlldyA9IG51bGw7XG5cdFx0dGhpcy5fbGlzdC5jbGVhcigpO1xuXHR9XG5cblxuXHRwcml2YXRlIF91cGRhdGVGb3JPcHRpb25zKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lZGl0b3JFZGl0YWJsZS5zZXQoIXRoaXMudmlld01vZGVsLm9wdGlvbnMuaXNSZWFkT25seSk7XG5cdFx0dGhpcy5fb3ZlcmZsb3dDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnbm90ZWJvb2stZWRpdG9yLWVkaXRhYmxlJywgIXRoaXMudmlld01vZGVsLm9wdGlvbnMuaXNSZWFkT25seSk7XG5cdFx0dGhpcy5nZXREb21Ob2RlKCkuY2xhc3NMaXN0LnRvZ2dsZSgnbm90ZWJvb2stZWRpdG9yLWVkaXRhYmxlJywgIXRoaXMudmlld01vZGVsLm9wdGlvbnMuaXNSZWFkT25seSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlV2VidmlldygpOiBQcm9taXNlPEJhY2tMYXllcldlYlZpZXc8SUNvbW1vbkNlbGxJbmZvPiB8IG51bGw+IHtcblx0XHRpZiAoIXRoaXMudGV4dE1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fd2Vidmlld1Jlc29sdmVQcm9taXNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fd2Vidmlld1Jlc29sdmVQcm9taXNlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fd2Vidmlldykge1xuXHRcdFx0dGhpcy5fZW5zdXJlV2Vidmlldyh0aGlzLmdldElkKCksIHRoaXMudGV4dE1vZGVsLnZpZXdUeXBlLCB0aGlzLnRleHRNb2RlbC51cmkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3dlYnZpZXdSZXNvbHZlUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX3dlYnZpZXcpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOb3RlYm9vayBvdXRwdXQgd2VidmlldyBvYmplY3QgaXMgbm90IGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5LicpO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0aGlzLl93ZWJ2aWV3LmNyZWF0ZVdlYnZpZXcodGhpcy5jcmVhdGlvbk9wdGlvbnMuY29kZVdpbmRvdyA/PyBtYWluV2luZG93KTtcblx0XHRcdGlmICghdGhpcy5fd2Vidmlldy53ZWJ2aWV3KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignTm90ZWJvb2sgb3V0cHV0IHdlYnZpZXcgZWxlbWVudCB3YXMgbm90IGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5LicpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2NhbFN0b3JlLmFkZCh0aGlzLl93ZWJ2aWV3LndlYnZpZXcub25EaWRCbHVyKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fb3V0cHV0Rm9jdXMuc2V0KGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fd2Vidmlld0ZvY3VzZWQgPSBmYWxzZTtcblxuXHRcdFx0XHR0aGlzLnVwZGF0ZUVkaXRvckZvY3VzKCk7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ2VsbEZvY3VzTW9kZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9sb2NhbFN0b3JlLmFkZCh0aGlzLl93ZWJ2aWV3LndlYnZpZXcub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX291dHB1dEZvY3VzLnNldCh0cnVlKTtcblx0XHRcdFx0dGhpcy51cGRhdGVFZGl0b3JGb2N1cygpO1xuXHRcdFx0XHR0aGlzLl93ZWJ2aWV3Rm9jdXNlZCA9IHRydWU7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMuX3dlYnZpZXcub25NZXNzYWdlKGUgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlY2VpdmVNZXNzYWdlLmZpcmUoZSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHJldHVybiB0aGlzLl93ZWJ2aWV3O1xuXHRcdH0pKCk7XG5cblx0XHRyZXR1cm4gdGhpcy5fd2Vidmlld1Jlc29sdmVQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlV2VidmlldyhpZDogc3RyaW5nLCB2aWV3VHlwZTogc3RyaW5nLCByZXNvdXJjZTogVVJJKSB7XG5cdFx0aWYgKHRoaXMuX3dlYnZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdHRoaXMuX3dlYnZpZXcgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJhY2tMYXllcldlYlZpZXcsIHtcblx0XHRcdGdldCBjcmVhdGlvbk9wdGlvbnMoKSB7IHJldHVybiB0aGF0LmNyZWF0aW9uT3B0aW9uczsgfSxcblx0XHRcdHNldFNjcm9sbFRvcChzY3JvbGxUb3A6IG51bWJlcikgeyB0aGF0Ll9saXN0LnNjcm9sbFRvcCA9IHNjcm9sbFRvcDsgfSxcblx0XHRcdHRyaWdnZXJTY3JvbGwoZXZlbnQ6IElNb3VzZVdoZWVsRXZlbnQpIHsgdGhhdC5fbGlzdC50cmlnZ2VyU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChldmVudCk7IH0sXG5cdFx0XHRnZXRDZWxsQnlJbmZvOiB0aGF0LmdldENlbGxCeUluZm8uYmluZCh0aGF0KSxcblx0XHRcdGdldENlbGxCeUlkOiB0aGF0Ll9nZXRDZWxsQnlJZC5iaW5kKHRoYXQpLFxuXHRcdFx0dG9nZ2xlTm90ZWJvb2tDZWxsU2VsZWN0aW9uOiB0aGF0Ll90b2dnbGVOb3RlYm9va0NlbGxTZWxlY3Rpb24uYmluZCh0aGF0KSxcblx0XHRcdGZvY3VzTm90ZWJvb2tDZWxsOiB0aGF0LmZvY3VzTm90ZWJvb2tDZWxsLmJpbmQodGhhdCksXG5cdFx0XHRmb2N1c05leHROb3RlYm9va0NlbGw6IHRoYXQuZm9jdXNOZXh0Tm90ZWJvb2tDZWxsLmJpbmQodGhhdCksXG5cdFx0XHR1cGRhdGVPdXRwdXRIZWlnaHQ6IHRoYXQuX3VwZGF0ZU91dHB1dEhlaWdodC5iaW5kKHRoYXQpLFxuXHRcdFx0c2NoZWR1bGVPdXRwdXRIZWlnaHRBY2s6IHRoYXQuX3NjaGVkdWxlT3V0cHV0SGVpZ2h0QWNrLmJpbmQodGhhdCksXG5cdFx0XHR1cGRhdGVNYXJrdXBDZWxsSGVpZ2h0OiB0aGF0Ll91cGRhdGVNYXJrdXBDZWxsSGVpZ2h0LmJpbmQodGhhdCksXG5cdFx0XHRzZXRNYXJrdXBDZWxsRWRpdFN0YXRlOiB0aGF0Ll9zZXRNYXJrdXBDZWxsRWRpdFN0YXRlLmJpbmQodGhhdCksXG5cdFx0XHRkaWRTdGFydERyYWdNYXJrdXBDZWxsOiB0aGF0Ll9kaWRTdGFydERyYWdNYXJrdXBDZWxsLmJpbmQodGhhdCksXG5cdFx0XHRkaWREcmFnTWFya3VwQ2VsbDogdGhhdC5fZGlkRHJhZ01hcmt1cENlbGwuYmluZCh0aGF0KSxcblx0XHRcdGRpZERyb3BNYXJrdXBDZWxsOiB0aGF0Ll9kaWREcm9wTWFya3VwQ2VsbC5iaW5kKHRoYXQpLFxuXHRcdFx0ZGlkRW5kRHJhZ01hcmt1cENlbGw6IHRoYXQuX2RpZEVuZERyYWdNYXJrdXBDZWxsLmJpbmQodGhhdCksXG5cdFx0XHRkaWRSZXNpemVPdXRwdXQ6IHRoYXQuX2RpZFJlc2l6ZU91dHB1dC5iaW5kKHRoYXQpLFxuXHRcdFx0dXBkYXRlUGVyZm9ybWFuY2VNZXRhZGF0YTogdGhhdC5fdXBkYXRlUGVyZm9ybWFuY2VNZXRhZGF0YS5iaW5kKHRoYXQpLFxuXHRcdFx0ZGlkRm9jdXNPdXRwdXRJbnB1dENoYW5nZTogdGhhdC5fZGlkRm9jdXNPdXRwdXRJbnB1dENoYW5nZS5iaW5kKHRoYXQpLFxuXHRcdH0sIGlkLCB2aWV3VHlwZSwgcmVzb3VyY2UsIHtcblx0XHRcdC4uLnRoaXMuX25vdGVib29rT3B0aW9ucy5jb21wdXRlV2Vidmlld09wdGlvbnMoKSxcblx0XHRcdGZvbnRGYW1pbHk6IHRoaXMuX2dlbmVyYXRlRm9udEZhbWlseSgpXG5cdFx0fSwgdGhpcy5ub3RlYm9va1JlbmRlcmVyTWVzc2FnaW5nLmdldFNjb3BlZCh0aGlzLl91dWlkKSk7XG5cblx0XHR0aGlzLl93ZWJ2aWV3LmVsZW1lbnQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cblx0XHQvLyBhdHRhY2ggdGhlIHdlYnZpZXcgY29udGFpbmVyIHRvIHRoZSBET00gdHJlZSBmaXJzdFxuXHRcdHRoaXMuX2xpc3QuYXR0YWNoV2Vidmlldyh0aGlzLl93ZWJ2aWV3LmVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXR0YWNoTW9kZWwodGV4dE1vZGVsOiBOb3RlYm9va1RleHRNb2RlbCwgdmlld1R5cGU6IHN0cmluZywgdmlld1N0YXRlOiBJTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUgfCB1bmRlZmluZWQsIHBlcmY/OiBOb3RlYm9va1BlcmZNYXJrcykge1xuXHRcdHRoaXMuX2Vuc3VyZVdlYnZpZXcodGhpcy5nZXRJZCgpLCB0ZXh0TW9kZWwudmlld1R5cGUsIHRleHRNb2RlbC51cmkpO1xuXG5cdFx0dGhpcy52aWV3TW9kZWwgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rVmlld01vZGVsLCB2aWV3VHlwZSwgdGV4dE1vZGVsLCB0aGlzLl92aWV3Q29udGV4dCwgdGhpcy5nZXRMYXlvdXRJbmZvKCksIHsgaXNSZWFkT25seTogdGhpcy5fcmVhZE9ubHkgfSk7XG5cdFx0dGhpcy5fdmlld0NvbnRleHQuZXZlbnREaXNwYXRjaGVyLmVtaXQoW25ldyBOb3RlYm9va0xheW91dENoYW5nZWRFdmVudCh7IHdpZHRoOiB0cnVlLCBmb250SW5mbzogdHJ1ZSB9LCB0aGlzLmdldExheW91dEluZm8oKSldKTtcblx0XHR0aGlzLm5vdGVib29rT3B0aW9ucy51cGRhdGVPcHRpb25zKHRoaXMuX3JlYWRPbmx5KTtcblxuXHRcdHRoaXMuX3VwZGF0ZUZvck9wdGlvbnMoKTtcblx0XHR0aGlzLl91cGRhdGVGb3JOb3RlYm9va0NvbmZpZ3VyYXRpb24oKTtcblxuXHRcdC8vIHJlc3RvcmUgdmlldyBzdGF0ZXMsIGluY2x1ZGluZyBjb250cmlidXRpb25zXG5cblx0XHR7XG5cdFx0XHQvLyByZXN0b3JlIHZpZXcgc3RhdGVcblx0XHRcdHRoaXMudmlld01vZGVsLnJlc3RvcmVFZGl0b3JWaWV3U3RhdGUodmlld1N0YXRlKTtcblxuXHRcdFx0Ly8gY29udHJpYnV0aW9uIHN0YXRlIHJlc3RvcmVcblxuXHRcdFx0Y29uc3QgY29udHJpYnV0aW9uc1N0YXRlID0gdmlld1N0YXRlPy5jb250cmlidXRpb25zU3RhdGUgfHwge307XG5cdFx0XHRmb3IgKGNvbnN0IFtpZCwgY29udHJpYnV0aW9uXSBvZiB0aGlzLl9jb250cmlidXRpb25zKSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgY29udHJpYnV0aW9uLnJlc3RvcmVWaWV3U3RhdGUgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0XHRjb250cmlidXRpb24ucmVzdG9yZVZpZXdTdGF0ZShjb250cmlidXRpb25zU3RhdGVbaWRdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMudmlld01vZGVsLm9uRGlkQ2hhbmdlVmlld0NlbGxzKGUgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWaWV3Q2VsbHMuZmlyZShlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9sb2NhbFN0b3JlLmFkZCh0aGlzLnZpZXdNb2RlbC5vbkRpZENoYW5nZVNlbGVjdGlvbigoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKCk7XG5cdFx0XHR0aGlzLnVwZGF0ZVNlbGVjdGVkTWFya2Rvd25QcmV2aWV3cygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMuX2xpc3Qub25XaWxsU2Nyb2xsKGUgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3dlYnZpZXc/LmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0XHR0aGlzLl93ZWJ2aWV3VHJhbnNwYXJlbnRDb3ZlciEuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZVkoJHtlLnNjcm9sbFRvcH0pYDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRsZXQgaGFzUGVuZGluZ0NoYW5nZUNvbnRlbnRIZWlnaHQgPSBmYWxzZTtcblx0XHRjb25zdCByZW5kZXJTY3JvbGxIZWlnaHREaXNwb3NhYmxlID0gdGhpcy5fbG9jYWxTdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMuX2xpc3Qub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KCgpID0+IHtcblx0XHRcdGlmIChoYXNQZW5kaW5nQ2hhbmdlQ29udGVudEhlaWdodCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRoYXNQZW5kaW5nQ2hhbmdlQ29udGVudEhlaWdodCA9IHRydWU7XG5cblx0XHRcdHJlbmRlclNjcm9sbEhlaWdodERpc3Bvc2FibGUudmFsdWUgPSBET00uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShET00uZ2V0V2luZG93KHRoaXMuZ2V0RG9tTm9kZSgpKSwgKCkgPT4ge1xuXHRcdFx0XHRoYXNQZW5kaW5nQ2hhbmdlQ29udGVudEhlaWdodCA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVTY3JvbGxIZWlnaHQoKTtcblx0XHRcdH0sIDEwMCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fbG9jYWxTdG9yZS5hZGQodGhpcy5fbGlzdC5vbkRpZFJlbW92ZU91dHB1dHMob3V0cHV0cyA9PiB7XG5cdFx0XHRvdXRwdXRzLmZvckVhY2gob3V0cHV0ID0+IHRoaXMucmVtb3ZlSW5zZXQob3V0cHV0KSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMuX2xpc3Qub25EaWRIaWRlT3V0cHV0cyhvdXRwdXRzID0+IHtcblx0XHRcdG91dHB1dHMuZm9yRWFjaChvdXRwdXQgPT4gdGhpcy5oaWRlSW5zZXQob3V0cHV0KSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMuX2xpc3Qub25EaWRSZW1vdmVDZWxsc0Zyb21WaWV3KGNlbGxzID0+IHtcblx0XHRcdGNvbnN0IGhpZGRlbkNlbGxzOiBNYXJrdXBDZWxsVmlld01vZGVsW10gPSBbXTtcblx0XHRcdGNvbnN0IGRlbGV0ZWRDZWxsczogTWFya3VwQ2VsbFZpZXdNb2RlbFtdID0gW107XG5cblx0XHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0XHRpZiAoY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWRDZWxsID0gY2VsbCBhcyBNYXJrdXBDZWxsVmlld01vZGVsO1xuXHRcdFx0XHRcdGlmICh0aGlzLnZpZXdNb2RlbD8udmlld0NlbGxzLmZpbmQoY2VsbCA9PiBjZWxsLmhhbmRsZSA9PT0gbWRDZWxsLmhhbmRsZSkpIHtcblx0XHRcdFx0XHRcdC8vIENlbGwgaGFzIGJlZW4gZm9sZGVkIGJ1dCBpcyBzdGlsbCBpbiBtb2RlbFxuXHRcdFx0XHRcdFx0aGlkZGVuQ2VsbHMucHVzaChtZENlbGwpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBDZWxsIHdhcyBkZWxldGVkXG5cdFx0XHRcdFx0XHRkZWxldGVkQ2VsbHMucHVzaChtZENlbGwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmhpZGVNYXJrdXBQcmV2aWV3cyhoaWRkZW5DZWxscyk7XG5cdFx0XHR0aGlzLmRlbGV0ZU1hcmt1cFByZXZpZXdzKGRlbGV0ZWRDZWxscyk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gaW5pdCByZW5kZXJpbmdcblx0XHRhd2FpdCB0aGlzLl93YXJtdXBXaXRoTWFya2Rvd25SZW5kZXJlcih0aGlzLnZpZXdNb2RlbCwgdmlld1N0YXRlLCBwZXJmKTtcblxuXHRcdHBlcmY/Lm1hcmsoJ2N1c3RvbU1hcmtkb3duTG9hZGVkJyk7XG5cblx0XHQvLyBtb2RlbCBhdHRhY2hlZFxuXHRcdHRoaXMuX2xvY2FsQ2VsbFN0YXRlTGlzdGVuZXJzID0gdGhpcy52aWV3TW9kZWwudmlld0NlbGxzLm1hcChjZWxsID0+IHRoaXMuX2JpbmRDZWxsTGlzdGVuZXIoY2VsbCkpO1xuXHRcdHRoaXMuX2xhc3RDZWxsV2l0aEVkaXRvckZvY3VzID0gdGhpcy52aWV3TW9kZWwudmlld0NlbGxzLmZpbmQodmlld0NlbGwgPT4gdGhpcy5nZXRBY3RpdmVDZWxsKCkgPT09IHZpZXdDZWxsICYmIHZpZXdDZWxsLmZvY3VzTW9kZSA9PT0gQ2VsbEZvY3VzTW9kZS5FZGl0b3IpID8/IG51bGw7XG5cblx0XHR0aGlzLl9sb2NhbFN0b3JlLmFkZCh0aGlzLnZpZXdNb2RlbC5vbkRpZENoYW5nZVZpZXdDZWxscygoZSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB1cGRhdGUgY2VsbCBsaXN0ZW5lclxuXHRcdFx0Wy4uLmUuc3BsaWNlc10ucmV2ZXJzZSgpLmZvckVhY2goc3BsaWNlID0+IHtcblx0XHRcdFx0Y29uc3QgW3N0YXJ0LCBkZWxldGVkLCBuZXdDZWxsc10gPSBzcGxpY2U7XG5cdFx0XHRcdGNvbnN0IGRlbGV0ZWRDZWxscyA9IHRoaXMuX2xvY2FsQ2VsbFN0YXRlTGlzdGVuZXJzLnNwbGljZShzdGFydCwgZGVsZXRlZCwgLi4ubmV3Q2VsbHMubWFwKGNlbGwgPT4gdGhpcy5fYmluZENlbGxMaXN0ZW5lcihjZWxsKSkpO1xuXG5cdFx0XHRcdGRpc3Bvc2UoZGVsZXRlZENlbGxzKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoZS5zcGxpY2VzLnNvbWUocyA9PiBzWzJdLnNvbWUoY2VsbCA9PiBjZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXApKSkge1xuXHRcdFx0XHR0aGlzLl9iYWNrZ3JvdW5kTWFya2Rvd25SZW5kZXJpbmcoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAodGhpcy5fZGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLl9saXN0LmxheW91dCh0aGlzLmdldEJvZHlIZWlnaHQodGhpcy5fZGltZW5zaW9uLmhlaWdodCksIHRoaXMuX2RpbWVuc2lvbi53aWR0aCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xpc3QubGF5b3V0KCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZG5kQ29udHJvbGxlcj8uY2xlYXJHbG9iYWxEcmFnU3RhdGUoKTtcblxuXHRcdC8vIHJlc3RvcmUgbGlzdCBzdGF0ZSBhdCBsYXN0LCBpdCBtdXN0IGJlIGFmdGVyIGxpc3QgbGF5b3V0XG5cdFx0dGhpcy5yZXN0b3JlTGlzdFZpZXdTdGF0ZSh2aWV3U3RhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYmluZENlbGxMaXN0ZW5lcihjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0c3RvcmUuYWRkKGNlbGwub25EaWRDaGFuZ2VMYXlvdXQoZSA9PiB7XG5cdFx0XHQvLyBlLnRvdGFsSGVpZ2h0IHdpbGwgYmUgZmFsc2UgaXQncyBub3QgY2hhbmdlZFxuXHRcdFx0aWYgKGUudG90YWxIZWlnaHQgfHwgZS5vdXRlcldpZHRoKSB7XG5cdFx0XHRcdHRoaXMubGF5b3V0Tm90ZWJvb2tDZWxsKGNlbGwsIGNlbGwubGF5b3V0SW5mby50b3RhbEhlaWdodCwgZS5jb250ZXh0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuQ29kZSkge1xuXHRcdFx0c3RvcmUuYWRkKChjZWxsIGFzIENvZGVDZWxsVmlld01vZGVsKS5vbkRpZFJlbW92ZU91dHB1dHMoKG91dHB1dHMpID0+IHtcblx0XHRcdFx0b3V0cHV0cy5mb3JFYWNoKG91dHB1dCA9PiB0aGlzLnJlbW92ZUluc2V0KG91dHB1dCkpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHN0b3JlLmFkZCgoY2VsbCBhcyBDZWxsVmlld01vZGVsKS5vbkRpZENoYW5nZVN0YXRlKGUgPT4ge1xuXHRcdFx0aWYgKGUuaW5wdXRDb2xsYXBzZWRDaGFuZ2VkICYmIGNlbGwuaXNJbnB1dENvbGxhcHNlZCAmJiBjZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXApIHtcblx0XHRcdFx0dGhpcy5oaWRlTWFya3VwUHJldmlld3MoWyhjZWxsIGFzIE1hcmt1cENlbGxWaWV3TW9kZWwpXSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLm91dHB1dENvbGxhcHNlZENoYW5nZWQgJiYgY2VsbC5pc091dHB1dENvbGxhcHNlZCAmJiBjZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5Db2RlKSB7XG5cdFx0XHRcdGNlbGwub3V0cHV0c1ZpZXdNb2RlbHMuZm9yRWFjaChvdXRwdXQgPT4gdGhpcy5oaWRlSW5zZXQob3V0cHV0KSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmZvY3VzTW9kZUNoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5fdmFsaWRhdGVDZWxsRm9jdXNNb2RlKGNlbGwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHN0b3JlLmFkZChjZWxsLm9uQ2VsbERlY29yYXRpb25zQ2hhbmdlZChlID0+IHtcblx0XHRcdGUuYWRkZWQuZm9yRWFjaChvcHRpb25zID0+IHtcblx0XHRcdFx0aWYgKG9wdGlvbnMuY2xhc3NOYW1lKSB7XG5cdFx0XHRcdFx0dGhpcy5kZWx0YUNlbGxDb250YWluZXJDbGFzc05hbWVzKGNlbGwuaWQsIFtvcHRpb25zLmNsYXNzTmFtZV0sIFtdLCBjZWxsLmNlbGxLaW5kKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChvcHRpb25zLm91dHB1dENsYXNzTmFtZSkge1xuXHRcdFx0XHRcdHRoaXMuZGVsdGFDZWxsQ29udGFpbmVyQ2xhc3NOYW1lcyhjZWxsLmlkLCBbb3B0aW9ucy5vdXRwdXRDbGFzc05hbWVdLCBbXSwgY2VsbC5jZWxsS2luZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRlLnJlbW92ZWQuZm9yRWFjaChvcHRpb25zID0+IHtcblx0XHRcdFx0aWYgKG9wdGlvbnMuY2xhc3NOYW1lKSB7XG5cdFx0XHRcdFx0dGhpcy5kZWx0YUNlbGxDb250YWluZXJDbGFzc05hbWVzKGNlbGwuaWQsIFtdLCBbb3B0aW9ucy5jbGFzc05hbWVdLCBjZWxsLmNlbGxLaW5kKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChvcHRpb25zLm91dHB1dENsYXNzTmFtZSkge1xuXHRcdFx0XHRcdHRoaXMuZGVsdGFDZWxsQ29udGFpbmVyQ2xhc3NOYW1lcyhjZWxsLmlkLCBbXSwgW29wdGlvbnMub3V0cHV0Q2xhc3NOYW1lXSwgY2VsbC5jZWxsS2luZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiBzdG9yZTtcblx0fVxuXG5cblx0cHJpdmF0ZSBfbGFzdENlbGxXaXRoRWRpdG9yRm9jdXM6IElDZWxsVmlld01vZGVsIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX3ZhbGlkYXRlQ2VsbEZvY3VzTW9kZShjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdGlmIChjZWxsLmZvY3VzTW9kZSAhPT0gQ2VsbEZvY3VzTW9kZS5FZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbGFzdENlbGxXaXRoRWRpdG9yRm9jdXMgJiYgdGhpcy5fbGFzdENlbGxXaXRoRWRpdG9yRm9jdXMgIT09IGNlbGwpIHtcblx0XHRcdHRoaXMuX2xhc3RDZWxsV2l0aEVkaXRvckZvY3VzLmZvY3VzTW9kZSA9IENlbGxGb2N1c01vZGUuQ29udGFpbmVyO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xhc3RDZWxsV2l0aEVkaXRvckZvY3VzID0gY2VsbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dhcm11cFdpdGhNYXJrZG93blJlbmRlcmVyKHZpZXdNb2RlbDogTm90ZWJvb2tWaWV3TW9kZWwsIHZpZXdTdGF0ZTogSU5vdGVib29rRWRpdG9yVmlld1N0YXRlIHwgdW5kZWZpbmVkLCBwZXJmPzogTm90ZWJvb2tQZXJmTWFya3MpIHtcblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnTm90ZWJvb2tFZGl0b3JXaWRnZXQnLCAnd2FybXVwICcgKyB0aGlzLnZpZXdNb2RlbD8udXJpLnRvU3RyaW5nKCkpO1xuXHRcdGF3YWl0IHRoaXMuX3Jlc29sdmVXZWJ2aWV3KCk7XG5cdFx0cGVyZj8ubWFyaygnd2Vidmlld0NvbW1Mb2FkZWQnKTtcblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnTm90ZWJvb2tFZGl0b3JXaWRnZXQnLCAnd2FybXVwIC0gd2VidmlldyByZXNvbHZlZCcpO1xuXG5cdFx0Ly8gbWFrZSBzdXJlIHRoYXQgdGhlIHdlYnZpZXcgaXMgbm90IHZpc2libGUgb3RoZXJ3aXNlIHVzZXJzIHdpbGwgc2VlIHByZS1yZW5kZXJlZCBtYXJrZG93biBjZWxscyBpbiB3cm9uZyBwb3NpdGlvbiBhcyB0aGUgbGlzdCB2aWV3IGRvZXNuJ3QgaGF2ZSBhIGNvcnJlY3QgYHRvcGAgb2Zmc2V0IHlldFxuXHRcdHRoaXMuX3dlYnZpZXchLmVsZW1lbnQuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nO1xuXHRcdC8vIHdhcm0gdXAgY2FuIHRha2UgYXJvdW5kIDIwMG1zIHRvIGxvYWQgbWFya2Rvd24gbGlicmFyaWVzLCBldGMuXG5cdFx0YXdhaXQgdGhpcy5fd2FybXVwVmlld3BvcnRNYXJrZG93bkNlbGxzKHZpZXdNb2RlbCwgdmlld1N0YXRlKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ05vdGVib29rRWRpdG9yV2lkZ2V0JywgJ3dhcm11cCAtIHZpZXdwb3J0IHdhcm1lZCB1cCcpO1xuXG5cdFx0Ly8gdG9kb0ByZWJvcm5peCBAbWpidnosIGlzIHRoaXMgdG9vIGNvbXBsaWNhdGVkP1xuXG5cdFx0Lyogbm93IHRoZSB3ZWJ2aWV3IGlzIHJlYWR5LCBhbmQgcmVxdWVzdHMgdG8gcmVuZGVyIG1hcmtkb3duIGFyZSBmYXN0IGVub3VnaFxuXHRcdCAqIHdlIGNhbiBzdGFydCByZW5kZXJpbmcgdGhlIGxpc3Qgdmlld1xuXHRcdCAqIHJlbmRlclxuXHRcdCAqICAgLSBtYXJrZG93biBjZWxsIC0+IHJlcXVlc3QgdG8gd2VidmlldyB0byAoMTBtcywgYmFzaWNhbGx5IGp1c3QgbGF0ZW5jeSBiZXR3ZWVuIFVJIGFuZCBpZnJhbWUpXG5cdFx0ICogICAtIGNvZGUgY2VsbCAtPiByZW5kZXIgaW4gcGxhY2Vcblx0XHQgKi9cblx0XHR0aGlzLl9saXN0LmxheW91dCgwLCAwKTtcblx0XHR0aGlzLl9saXN0LmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXG5cdFx0Ly8gbm93IHRoZSBsaXN0IHdpZGdldCBoYXMgYSBjb3JyZWN0IGNvbnRlbnRIZWlnaHQvc2Nyb2xsSGVpZ2h0XG5cdFx0Ly8gc2V0dGluZyBzY3JvbGxUb3Agd2lsbCB3b3JrIHByb3Blcmx5XG5cdFx0Ly8gYWZ0ZXIgc2V0dGluZyBzY3JvbGwgdG9wLCB0aGUgbGlzdCB2aWV3IHdpbGwgdXBkYXRlIGB0b3BgIG9mIHRoZSBzY3JvbGxhYmxlIGVsZW1lbnQsIGUuZy4gYHRvcDogLTU4NHB4YFxuXHRcdHRoaXMuX2xpc3Quc2Nyb2xsVG9wID0gdmlld1N0YXRlPy5zY3JvbGxQb3NpdGlvbj8udG9wID8/IDA7XG5cdFx0dGhpcy5fZGVidWcoJ2ZpbmlzaCBpbml0aWFsIHZpZXdwb3J0IHdhcm11cCBhbmQgdmlldyBzdGF0ZSByZXN0b3JlLicpO1xuXHRcdHRoaXMuX3dlYnZpZXchLmVsZW1lbnQuc3R5bGUudmlzaWJpbGl0eSA9ICd2aXNpYmxlJztcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ05vdGVib29rRWRpdG9yV2lkZ2V0JywgJ3dhcm11cCAtIGxpc3QgdmlldyBtb2RlbCBhdHRhY2hlZCwgc2V0IHRvIHZpc2libGUnKTtcblx0XHR0aGlzLl9vbkRpZEF0dGFjaFZpZXdNb2RlbC5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF93YXJtdXBWaWV3cG9ydE1hcmtkb3duQ2VsbHModmlld01vZGVsOiBOb3RlYm9va1ZpZXdNb2RlbCwgdmlld1N0YXRlOiBJTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodmlld1N0YXRlICYmIHZpZXdTdGF0ZS5jZWxsVG90YWxIZWlnaHRzKSB7XG5cdFx0XHRjb25zdCB0b3RhbEhlaWdodENhY2hlID0gdmlld1N0YXRlLmNlbGxUb3RhbEhlaWdodHM7XG5cdFx0XHRjb25zdCBzY3JvbGxUb3AgPSB2aWV3U3RhdGUuc2Nyb2xsUG9zaXRpb24/LnRvcCA/PyAwO1xuXHRcdFx0Y29uc3Qgc2Nyb2xsQm90dG9tID0gc2Nyb2xsVG9wICsgTWF0aC5tYXgodGhpcy5fZGltZW5zaW9uPy5oZWlnaHQgPz8gMCwgMTA4MCk7XG5cblx0XHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdFx0Y29uc3QgcmVxdWVzdHM6IFtJQ2VsbFZpZXdNb2RlbCwgbnVtYmVyXVtdID0gW107XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdmlld01vZGVsLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB2aWV3TW9kZWwuY2VsbEF0KGkpITtcblx0XHRcdFx0Y29uc3QgY2VsbEhlaWdodCA9IHRvdGFsSGVpZ2h0Q2FjaGVbaV0gPz8gMDtcblxuXHRcdFx0XHRpZiAob2Zmc2V0ICsgY2VsbEhlaWdodCA8IHNjcm9sbFRvcCkge1xuXHRcdFx0XHRcdG9mZnNldCArPSBjZWxsSGVpZ2h0O1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCkge1xuXHRcdFx0XHRcdHJlcXVlc3RzLnB1c2goW2NlbGwsIG9mZnNldF0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0b2Zmc2V0ICs9IGNlbGxIZWlnaHQ7XG5cblx0XHRcdFx0aWYgKG9mZnNldCA+IHNjcm9sbEJvdHRvbSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoaXMuX3dlYnZpZXchLmluaXRpYWxpemVNYXJrdXAocmVxdWVzdHMubWFwKChbbW9kZWwsIG9mZnNldF0pID0+IHRoaXMuY3JlYXRlTWFya3VwQ2VsbEluaXRpYWxpemF0aW9uKG1vZGVsLCBvZmZzZXQpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGluaXRSZXF1ZXN0cyA9IHZpZXdNb2RlbC52aWV3Q2VsbHNcblx0XHRcdFx0LmZpbHRlcihjZWxsID0+IGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cClcblx0XHRcdFx0LnNsaWNlKDAsIDUpXG5cdFx0XHRcdC5tYXAoY2VsbCA9PiB0aGlzLmNyZWF0ZU1hcmt1cENlbGxJbml0aWFsaXphdGlvbihjZWxsLCAtMTAwMDApKTtcblxuXHRcdFx0YXdhaXQgdGhpcy5fd2VidmlldyEuaW5pdGlhbGl6ZU1hcmt1cChpbml0UmVxdWVzdHMpO1xuXG5cdFx0XHQvLyBubyBjYWNoZWQgdmlldyBzdGF0ZSBzbyB3ZSBhcmUgcmVuZGVyaW5nIHRoZSBmaXJzdCB2aWV3cG9ydFxuXHRcdFx0Ly8gYWZ0ZXIgYWJvdmUgYXN5bmMgY2FsbCwgd2UgYWxyZWFkeSBnZXQgaW5pdCBoZWlnaHQgZm9yIG1hcmtkb3duIGNlbGxzLCB3ZSBjYW4gdXBkYXRlIHRoZWlyIG9mZnNldFxuXHRcdFx0bGV0IG9mZnNldCA9IDA7XG5cdFx0XHRjb25zdCBvZmZzZXRVcGRhdGVSZXF1ZXN0czogeyBpZDogc3RyaW5nOyB0b3A6IG51bWJlciB9W10gPSBbXTtcblx0XHRcdGNvbnN0IHNjcm9sbEJvdHRvbSA9IE1hdGgubWF4KHRoaXMuX2RpbWVuc2lvbj8uaGVpZ2h0ID8/IDAsIDEwODApO1xuXHRcdFx0Zm9yIChjb25zdCBjZWxsIG9mIHZpZXdNb2RlbC52aWV3Q2VsbHMpIHtcblx0XHRcdFx0aWYgKGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCkge1xuXHRcdFx0XHRcdG9mZnNldFVwZGF0ZVJlcXVlc3RzLnB1c2goeyBpZDogY2VsbC5pZCwgdG9wOiBvZmZzZXQgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRvZmZzZXQgKz0gY2VsbC5nZXRIZWlnaHQodGhpcy5nZXRMYXlvdXRJbmZvKCkuZm9udEluZm8ubGluZUhlaWdodCk7XG5cblx0XHRcdFx0aWYgKG9mZnNldCA+IHNjcm9sbEJvdHRvbSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3dlYnZpZXc/LnVwZGF0ZVNjcm9sbFRvcHMoW10sIG9mZnNldFVwZGF0ZVJlcXVlc3RzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU1hcmt1cENlbGxJbml0aWFsaXphdGlvbihtb2RlbDogSUNlbGxWaWV3TW9kZWwsIG9mZnNldDogbnVtYmVyKTogSU1hcmt1cENlbGxJbml0aWFsaXphdGlvbiB7XG5cdFx0cmV0dXJuICh7XG5cdFx0XHRtaW1lOiBtb2RlbC5taW1lLFxuXHRcdFx0Y2VsbElkOiBtb2RlbC5pZCxcblx0XHRcdGNlbGxIYW5kbGU6IG1vZGVsLmhhbmRsZSxcblx0XHRcdGNvbnRlbnQ6IG1vZGVsLmdldFRleHQoKSxcblx0XHRcdG9mZnNldDogb2Zmc2V0LFxuXHRcdFx0dmlzaWJsZTogZmFsc2UsXG5cdFx0XHRtZXRhZGF0YTogbW9kZWwubWV0YWRhdGEsXG5cdFx0fSk7XG5cdH1cblxuXHRyZXN0b3JlTGlzdFZpZXdTdGF0ZSh2aWV3U3RhdGU6IElOb3RlYm9va0VkaXRvclZpZXdTdGF0ZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodmlld1N0YXRlPy5zY3JvbGxQb3NpdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9saXN0LnNjcm9sbFRvcCA9IHZpZXdTdGF0ZS5zY3JvbGxQb3NpdGlvbi50b3A7XG5cdFx0XHR0aGlzLl9saXN0LnNjcm9sbExlZnQgPSB2aWV3U3RhdGUuc2Nyb2xsUG9zaXRpb24ubGVmdDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbGlzdC5zY3JvbGxUb3AgPSAwO1xuXHRcdFx0dGhpcy5fbGlzdC5zY3JvbGxMZWZ0ID0gMDtcblx0XHR9XG5cblx0XHRjb25zdCBmb2N1c0lkeCA9IHR5cGVvZiB2aWV3U3RhdGU/LmZvY3VzID09PSAnbnVtYmVyJyA/IHZpZXdTdGF0ZS5mb2N1cyA6IDA7XG5cdFx0aWYgKGZvY3VzSWR4IDwgdGhpcy52aWV3TW9kZWwubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy52aWV3TW9kZWwuY2VsbEF0KGZvY3VzSWR4KTtcblx0XHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMudmlld01vZGVsPy51cGRhdGVTZWxlY3Rpb25zU3RhdGUoe1xuXHRcdFx0XHRcdGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5IYW5kbGUsXG5cdFx0XHRcdFx0cHJpbWFyeTogZWxlbWVudC5oYW5kbGUsXG5cdFx0XHRcdFx0c2VsZWN0aW9uczogW2VsZW1lbnQuaGFuZGxlXVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHRoaXMuX2xpc3QubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy52aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHtcblx0XHRcdFx0a2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LFxuXHRcdFx0XHRmb2N1czogeyBzdGFydDogMCwgZW5kOiAxIH0sXG5cdFx0XHRcdHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICh2aWV3U3RhdGU/LmVkaXRvckZvY3VzZWQpIHtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLnZpZXdNb2RlbC5jZWxsQXQoZm9jdXNJZHgpO1xuXHRcdFx0aWYgKGNlbGwpIHtcblx0XHRcdFx0Y2VsbC5mb2N1c01vZGUgPSBDZWxsRm9jdXNNb2RlLkVkaXRvcjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXN0b3JlU2VsZWN0ZWRLZXJuZWwodmlld1N0YXRlOiBJTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodmlld1N0YXRlPy5zZWxlY3RlZEtlcm5lbElkICYmIHRoaXMudGV4dE1vZGVsKSB7XG5cdFx0XHRjb25zdCBtYXRjaGluZyA9IHRoaXMubm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldE1hdGNoaW5nS2VybmVsKHRoaXMudGV4dE1vZGVsKTtcblx0XHRcdGNvbnN0IGtlcm5lbCA9IG1hdGNoaW5nLmFsbC5maW5kKGsgPT4gay5pZCA9PT0gdmlld1N0YXRlLnNlbGVjdGVkS2VybmVsSWQpO1xuXHRcdFx0Ly8gU2VsZWN0ZWQga2VybmVsIG1heSBoYXZlIGFscmVhZHkgYmVlbiBwaWNrZWQgcHJpb3IgdG8gdGhlIHZpZXcgc3RhdGUgbG9hZGluZ1xuXHRcdFx0Ly8gSWYgc28sIGRvbid0IG92ZXJ3cml0ZSBpdCB3aXRoIHRoZSBzYXZlZCBrZXJuZWwuXG5cdFx0XHRpZiAoa2VybmVsICYmICFtYXRjaGluZy5zZWxlY3RlZCkge1xuXHRcdFx0XHR0aGlzLm5vdGVib29rS2VybmVsU2VydmljZS5zZWxlY3RLZXJuZWxGb3JOb3RlYm9vayhrZXJuZWwsIHRoaXMudGV4dE1vZGVsKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRFZGl0b3JWaWV3U3RhdGUoKTogSU5vdGVib29rRWRpdG9yVmlld1N0YXRlIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMudmlld01vZGVsPy5nZXRFZGl0b3JWaWV3U3RhdGUoKTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRlZGl0aW5nQ2VsbHM6IHt9LFxuXHRcdFx0XHRjZWxsTGluZU51bWJlclN0YXRlczoge30sXG5cdFx0XHRcdGVkaXRvclZpZXdTdGF0ZXM6IHt9LFxuXHRcdFx0XHRjb2xsYXBzZWRJbnB1dENlbGxzOiB7fSxcblx0XHRcdFx0Y29sbGFwc2VkT3V0cHV0Q2VsbHM6IHt9LFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbGlzdCkge1xuXHRcdFx0c3RhdGUuc2Nyb2xsUG9zaXRpb24gPSB7IGxlZnQ6IHRoaXMuX2xpc3Quc2Nyb2xsTGVmdCwgdG9wOiB0aGlzLl9saXN0LnNjcm9sbFRvcCB9O1xuXHRcdFx0Y29uc3QgY2VsbEhlaWdodHM6IHsgW2tleTogbnVtYmVyXTogbnVtYmVyIH0gPSB7fTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy52aWV3TW9kZWwhLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGVsbSA9IHRoaXMudmlld01vZGVsIS5jZWxsQXQoaSkgYXMgQ2VsbFZpZXdNb2RlbDtcblx0XHRcdFx0Y2VsbEhlaWdodHNbaV0gPSBlbG0ubGF5b3V0SW5mby50b3RhbEhlaWdodDtcblx0XHRcdH1cblxuXHRcdFx0c3RhdGUuY2VsbFRvdGFsSGVpZ2h0cyA9IGNlbGxIZWlnaHRzO1xuXG5cdFx0XHRpZiAodGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdFx0Y29uc3QgZm9jdXNSYW5nZSA9IHRoaXMudmlld01vZGVsLmdldEZvY3VzKCk7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLnZpZXdNb2RlbC5jZWxsQXQoZm9jdXNSYW5nZS5zdGFydCk7XG5cdFx0XHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRcdFx0Y29uc3QgaXRlbURPTSA9IHRoaXMuX2xpc3QuZG9tRWxlbWVudE9mRWxlbWVudChlbGVtZW50KTtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JGb2N1c2VkID0gZWxlbWVudC5nZXRFZGl0U3RhdGUoKSA9PT0gQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nICYmICEhKGl0ZW1ET00gJiYgaXRlbURPTS5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgJiYgaXRlbURPTS5jb250YWlucyhpdGVtRE9NLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCkpO1xuXG5cdFx0XHRcdFx0c3RhdGUuZWRpdG9yRm9jdXNlZCA9IGVkaXRvckZvY3VzZWQ7XG5cdFx0XHRcdFx0c3RhdGUuZm9jdXMgPSBmb2N1c1JhbmdlLnN0YXJ0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2F2ZSBjb250cmlidXRpb24gdmlldyBzdGF0ZXNcblx0XHRjb25zdCBjb250cmlidXRpb25zU3RhdGU6IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9ID0ge307XG5cdFx0Zm9yIChjb25zdCBbaWQsIGNvbnRyaWJ1dGlvbl0gb2YgdGhpcy5fY29udHJpYnV0aW9ucykge1xuXHRcdFx0aWYgKHR5cGVvZiBjb250cmlidXRpb24uc2F2ZVZpZXdTdGF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRjb250cmlidXRpb25zU3RhdGVbaWRdID0gY29udHJpYnV0aW9uLnNhdmVWaWV3U3RhdGUoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0c3RhdGUuY29udHJpYnV0aW9uc1N0YXRlID0gY29udHJpYnV0aW9uc1N0YXRlO1xuXHRcdGlmICh0aGlzLnRleHRNb2RlbD8udXJpLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCkge1xuXHRcdFx0c3RhdGUuc2VsZWN0ZWRLZXJuZWxJZCA9IHRoaXMuYWN0aXZlS2VybmVsPy5pZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cblxuXHRwcml2YXRlIF9hbGxvd1Njcm9sbEJleW9uZExhc3RMaW5lKCkge1xuXHRcdHJldHVybiB0aGlzLl9zY3JvbGxCZXlvbmRMYXN0TGluZSAmJiAhdGhpcy5pc1JlcGxIaXN0b3J5O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRCb2R5SGVpZ2h0KGRpbWVuc2lvbkhlaWdodDogbnVtYmVyKSB7XG5cdFx0cmV0dXJuIE1hdGgubWF4KGRpbWVuc2lvbkhlaWdodCAtICh0aGlzLl9ub3RlYm9va1RvcFRvb2xiYXI/LnVzZUdsb2JhbFRvb2xiYXIgPyAvKiogVG9vbGJhciBoZWlnaHQgKi8gMjYgOiAwKSwgMCk7XG5cdH1cblxuXHRsYXlvdXQoZGltZW5zaW9uOiBET00uRGltZW5zaW9uLCBzaGFkb3dFbGVtZW50PzogSFRNTEVsZW1lbnQsIHBvc2l0aW9uPzogRE9NLklEb21Qb3NpdGlvbik6IHZvaWQge1xuXHRcdGlmICghc2hhZG93RWxlbWVudCAmJiAhdGhpcy5fc2hhZG93RWxlbWVudCkge1xuXHRcdFx0dGhpcy5fZGltZW5zaW9uID0gZGltZW5zaW9uO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChkaW1lbnNpb24ud2lkdGggPD0gMCB8fCBkaW1lbnNpb24uaGVpZ2h0IDw9IDApIHtcblx0XHRcdHRoaXMub25XaWxsSGlkZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdoZW5Db250YWluZXJTdHlsZXNMb2FkZWQgPSB0aGlzLmxheW91dFNlcnZpY2Uud2hlbkNvbnRhaW5lclN0eWxlc0xvYWRlZChET00uZ2V0V2luZG93KHRoaXMuZ2V0RG9tTm9kZSgpKSk7XG5cdFx0aWYgKHdoZW5Db250YWluZXJTdHlsZXNMb2FkZWQpIHtcblx0XHRcdC8vIEluIGZsb2F0aW5nIHdpbmRvd3MsIHdlIG5lZWQgdG8gZW5zdXJlIHRoYXQgdGhlXG5cdFx0XHQvLyBjb250YWluZXIgaXMgcmVhZHkgZm9yIHVzIHRvIGNvbXB1dGUgY2VydGFpblxuXHRcdFx0Ly8gbGF5b3V0IHJlbGF0ZWQgcHJvcGVydGllcy5cblx0XHRcdHdoZW5Db250YWluZXJTdHlsZXNMb2FkZWQudGhlbigoKSA9PiB0aGlzLmxheW91dE5vdGVib29rKGRpbWVuc2lvbiwgc2hhZG93RWxlbWVudCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxheW91dE5vdGVib29rKGRpbWVuc2lvbiwgc2hhZG93RWxlbWVudCk7XG5cdFx0fVxuXG5cdH1cblxuXHRwcml2YXRlIGxheW91dE5vdGVib29rKGRpbWVuc2lvbjogRE9NLkRpbWVuc2lvbiwgc2hhZG93RWxlbWVudD86IEhUTUxFbGVtZW50KSB7XG5cdFx0aWYgKHNoYWRvd0VsZW1lbnQpIHtcblx0XHRcdHRoaXMuX3NoYWRvd0VsZW1lbnQgPSBzaGFkb3dFbGVtZW50O1xuXHRcdH1cblxuXHRcdHRoaXMuX2RpbWVuc2lvbiA9IGRpbWVuc2lvbjtcblx0XHRjb25zdCBuZXdCb2R5SGVpZ2h0ID0gdGhpcy5nZXRCb2R5SGVpZ2h0KGRpbWVuc2lvbi5oZWlnaHQpIC0gdGhpcy5nZXRMYXlvdXRJbmZvKCkuc3RpY2t5SGVpZ2h0O1xuXHRcdERPTS5zaXplKHRoaXMuX2JvZHksIGRpbWVuc2lvbi53aWR0aCwgbmV3Qm9keUhlaWdodCk7XG5cblx0XHRjb25zdCBuZXdDZWxsTGlzdEhlaWdodCA9IG5ld0JvZHlIZWlnaHQ7XG5cdFx0aWYgKHRoaXMuX2xpc3QuZ2V0UmVuZGVySGVpZ2h0KCkgPCBuZXdDZWxsTGlzdEhlaWdodCkge1xuXHRcdFx0Ly8gdGhlIG5ldyBkaW1lbnNpb24gaXMgbGFyZ2VyIHRoYW4gdGhlIGxpc3Qgdmlld3BvcnQsIHVwZGF0ZSBpdHMgYWRkaXRpb25hbCBoZWlnaHQgZmlyc3QsIG90aGVyd2lzZSB0aGUgbGlzdCB2aWV3IHdpbGwgbW92ZSBkb3duIGEgYml0IChhcyB0aGUgYHNjcm9sbEJvdHRvbWAgd2lsbCBtb3ZlIGRvd24pXG5cdFx0XHR0aGlzLl9saXN0LnVwZGF0ZU9wdGlvbnMoeyBwYWRkaW5nQm90dG9tOiB0aGlzLl9hbGxvd1Njcm9sbEJleW9uZExhc3RMaW5lKCkgPyBNYXRoLm1heCgwLCAobmV3Q2VsbExpc3RIZWlnaHQgLSA1MCkpIDogMCwgcGFkZGluZ1RvcDogMCB9KTtcblx0XHRcdHRoaXMuX2xpc3QubGF5b3V0KG5ld0NlbGxMaXN0SGVpZ2h0LCBkaW1lbnNpb24ud2lkdGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyB0aGUgbmV3IGRpbWVuc2lvbiBpcyBzbWFsbGVyIHRoYW4gdGhlIGxpc3Qgdmlld3BvcnQsIGlmIHdlIHVwZGF0ZSB0aGUgYWRkaXRpb25hbCBoZWlnaHQsIHRoZSBgc2Nyb2xsQm90dG9tYCB3aWxsIG1vdmUgdXAsIHdoaWNoIG1vdmVzIHRoZSB3aG9sZSBsaXN0IHZpZXcgdXB3YXJkcyBhIGJpdC4gU28gd2UgcnVuIGEgbGF5b3V0IGZpcnN0LlxuXHRcdFx0dGhpcy5fbGlzdC5sYXlvdXQobmV3Q2VsbExpc3RIZWlnaHQsIGRpbWVuc2lvbi53aWR0aCk7XG5cdFx0XHR0aGlzLl9saXN0LnVwZGF0ZU9wdGlvbnMoeyBwYWRkaW5nQm90dG9tOiB0aGlzLl9hbGxvd1Njcm9sbEJleW9uZExhc3RMaW5lKCkgPyBNYXRoLm1heCgwLCAobmV3Q2VsbExpc3RIZWlnaHQgLSA1MCkpIDogMCwgcGFkZGluZ1RvcDogMCB9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9vdmVybGF5Q29udGFpbmVyLmluZXJ0ID0gZmFsc2U7XG5cblx0XHR0aGlzLmxheW91dENvbnRhaW5lck92ZXJTaGFkb3dFbGVtZW50KHNoYWRvd0VsZW1lbnQgPz8gdGhpcy5fc2hhZG93RWxlbWVudCk7XG5cblx0XHRpZiAodGhpcy5fd2Vidmlld1RyYW5zcGFyZW50Q292ZXIpIHtcblx0XHRcdHRoaXMuX3dlYnZpZXdUcmFuc3BhcmVudENvdmVyLnN0eWxlLmhlaWdodCA9IGAke2RpbWVuc2lvbi5oZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy5fd2Vidmlld1RyYW5zcGFyZW50Q292ZXIuc3R5bGUud2lkdGggPSBgJHtkaW1lbnNpb24ud2lkdGh9cHhgO1xuXHRcdH1cblxuXHRcdHRoaXMuX25vdGVib29rVG9wVG9vbGJhci5sYXlvdXQodGhpcy5fZGltZW5zaW9uKTtcblx0XHR0aGlzLl9ub3RlYm9va092ZXJ2aWV3UnVsZXIubGF5b3V0KCk7XG5cblx0XHR0aGlzLl92aWV3Q29udGV4dD8uZXZlbnREaXNwYXRjaGVyLmVtaXQoW25ldyBOb3RlYm9va0xheW91dENoYW5nZWRFdmVudCh7IHdpZHRoOiB0cnVlLCBmb250SW5mbzogdHJ1ZSB9LCB0aGlzLmdldExheW91dEluZm8oKSldKTtcblx0fVxuXG5cdHByaXZhdGUgbGF5b3V0Q29udGFpbmVyT3ZlclNoYWRvd0VsZW1lbnQoYW5jaG9yRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIWFuY2hvckVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RhbEVkaXRvckNvbnRhaW5lciA9IHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5hY3RpdmVNb2RhbEVkaXRvclBhcnQ/Lm1vZGFsRWxlbWVudDtcblx0XHRjb25zdCBpc01vZGFsID0gRE9NLmlzSFRNTEVsZW1lbnQobW9kYWxFZGl0b3JDb250YWluZXIpICYmIG1vZGFsRWRpdG9yQ29udGFpbmVyLmNvbnRhaW5zKGFuY2hvckVsZW1lbnQpO1xuXHRcdGNvbnN0IGNsaXBwaW5nQ29udGFpbmVyID0gaXNNb2RhbCA/IHVuZGVmaW5lZCA6IHRoaXMubGF5b3V0U2VydmljZS5nZXRDb250YWluZXIoRE9NLmdldFdpbmRvdyh0aGlzLmdldERvbU5vZGUoKSksIFBhcnRzLkVESVRPUl9QQVJUKTtcblxuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIuc3R5bGUudmlzaWJpbGl0eSA9ICd2aXNpYmxlJztcblx0XHR0aGlzLl9vdmVybGF5TGF5b3V0LnNldEFuY2hvckVsZW1lbnQoYW5jaG9yRWxlbWVudCwgeyBjbGlwcGluZ0NvbnRhaW5lciB9KTtcblx0XHR0aGlzLl9vdmVybGF5TGF5b3V0LnJlYXBwbHlMYXlvdXRTdHlsZXMoKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBGb2N1cyB0cmFja2VyXG5cdGZvY3VzKCkge1xuXHRcdHRoaXMuX2lzVmlzaWJsZSA9IHRydWU7XG5cdFx0dGhpcy5fZWRpdG9yRm9jdXMuc2V0KHRydWUpO1xuXG5cdFx0aWYgKHRoaXMuX3dlYnZpZXdGb2N1c2VkKSB7XG5cdFx0XHR0aGlzLl93ZWJ2aWV3Py5mb2N1c1dlYnZpZXcoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMudmlld01vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IGZvY3VzUmFuZ2UgPSB0aGlzLnZpZXdNb2RlbC5nZXRGb2N1cygpO1xuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy52aWV3TW9kZWwuY2VsbEF0KGZvY3VzUmFuZ2Uuc3RhcnQpO1xuXG5cdFx0XHRcdC8vIFRoZSBub3RlYm9vayBlZGl0b3IgZG9lc24ndCBoYXZlIGZvY3VzIHlldFxuXHRcdFx0XHRpZiAoIXRoaXMuaGFzRWRpdG9yRm9jdXMoKSkge1xuXHRcdFx0XHRcdHRoaXMuZm9jdXNDb250YWluZXIoKTtcblx0XHRcdFx0XHQvLyB0cmlnZ2VyIGVkaXRvciB0byB1cGRhdGUgYXMgRm9jdXNUcmFja2VyIG1pZ2h0IG5vdCBlbWl0IGZvY3VzIGNoYW5nZSBldmVudFxuXHRcdFx0XHRcdHRoaXMudXBkYXRlRWRpdG9yRm9jdXMoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlbGVtZW50ICYmIGVsZW1lbnQuZm9jdXNNb2RlID09PSBDZWxsRm9jdXNNb2RlLkVkaXRvcikge1xuXHRcdFx0XHRcdGVsZW1lbnQudXBkYXRlRWRpdFN0YXRlKENlbGxFZGl0U3RhdGUuRWRpdGluZywgJ2VkaXRvcldpZGdldC5mb2N1cycpO1xuXHRcdFx0XHRcdGVsZW1lbnQuZm9jdXNNb2RlID0gQ2VsbEZvY3VzTW9kZS5FZGl0b3I7XG5cdFx0XHRcdFx0dGhpcy5mb2N1c0VkaXRvcihlbGVtZW50KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbGlzdC5kb21Gb2N1cygpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jdXJyZW50UHJvZ3Jlc3MpIHtcblx0XHRcdC8vIFRoZSBlZGl0b3IgZm9yY2VzIHByb2dyZXNzIHRvIGhpZGUgd2hlbiBzd2l0Y2hpbmcgZWRpdG9ycy4gU28gaWYgcHJvZ3Jlc3Mgc2hvdWxkIGJlIHZpc2libGUsIGZvcmNlIGl0IHRvIHNob3cgd2hlbiB0aGUgZWRpdG9yIGlzIGZvY3VzZWQuXG5cdFx0XHR0aGlzLnNob3dQcm9ncmVzcygpO1xuXHRcdH1cblx0fVxuXG5cdG9uU2hvdygpIHtcblx0XHR0aGlzLl9pc1Zpc2libGUgPSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBmb2N1c0VkaXRvcihhY3RpdmVFbGVtZW50OiBDZWxsVmlld01vZGVsKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbZWxlbWVudCwgZWRpdG9yXSBvZiB0aGlzLl9yZW5kZXJlZEVkaXRvcnMuZW50cmllcygpKSB7XG5cdFx0XHRpZiAoZWxlbWVudCA9PT0gYWN0aXZlRWxlbWVudCkge1xuXHRcdFx0XHRlZGl0b3IuZm9jdXMoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGZvY3VzQ29udGFpbmVyKGNsZWFyU2VsZWN0aW9uOiBib29sZWFuID0gZmFsc2UpIHtcblx0XHRpZiAodGhpcy5fd2Vidmlld0ZvY3VzZWQpIHtcblx0XHRcdHRoaXMuX3dlYnZpZXc/LmZvY3VzV2VidmlldygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9saXN0LmZvY3VzQ29udGFpbmVyKGNsZWFyU2VsZWN0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRzZWxlY3RPdXRwdXRDb250ZW50KGNlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0dGhpcy5fd2Vidmlldz8uc2VsZWN0T3V0cHV0Q29udGVudHMoY2VsbCk7XG5cdH1cblxuXHRzZWxlY3RJbnB1dENvbnRlbnRzKGNlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0dGhpcy5fd2Vidmlldz8uc2VsZWN0SW5wdXRDb250ZW50cyhjZWxsKTtcblx0fVxuXG5cdG9uV2lsbEhpZGUoKSB7XG5cdFx0dGhpcy5faXNWaXNpYmxlID0gZmFsc2U7XG5cdFx0dGhpcy5fZWRpdG9yRm9jdXMuc2V0KGZhbHNlKTtcblx0XHR0aGlzLl9vdmVybGF5Q29udGFpbmVyLmluZXJ0ID0gdHJ1ZTtcblx0XHR0aGlzLl9vdmVybGF5Q29udGFpbmVyLnN0eWxlLnZpc2liaWxpdHkgPSAnaGlkZGVuJztcblx0XHR0aGlzLl9vdmVybGF5Q29udGFpbmVyLnN0eWxlLmxlZnQgPSAnLTUwMDAwcHgnO1xuXHRcdHRoaXMuX25vdGVib29rVG9wVG9vbGJhckNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuY2xlYXJBY3RpdmVDZWxsV2lkZ2V0cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckFjdGl2ZUNlbGxXaWRnZXRzKCkge1xuXHRcdHRoaXMuX3JlbmRlcmVkRWRpdG9ycy5mb3JFYWNoKChlZGl0b3IsIGNlbGwpID0+IHtcblx0XHRcdGlmICh0aGlzLmdldEFjdGl2ZUNlbGwoKSA9PT0gY2VsbCAmJiBlZGl0b3IpIHtcblx0XHRcdFx0U3VnZ2VzdENvbnRyb2xsZXIuZ2V0KGVkaXRvcik/LmNhbmNlbFN1Z2dlc3RXaWRnZXQoKTtcblx0XHRcdFx0RHJvcEludG9FZGl0b3JDb250cm9sbGVyLmdldChlZGl0b3IpPy5jbGVhcldpZGdldHMoKTtcblx0XHRcdFx0Q29weVBhc3RlQ29udHJvbGxlci5nZXQoZWRpdG9yKT8uY2xlYXJXaWRnZXRzKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZW5kZXJlZEVkaXRvcnMuZm9yRWFjaCgoZWRpdG9yLCBjZWxsKSA9PiB7XG5cdFx0XHRjb25zdCBjb250cm9sbGVyID0gSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdFx0aWYgKGNvbnRyb2xsZXI/Lm1vZGVsLmdldCgpPy5pbmxpbmVFZGl0U3RhdGUuZ2V0KCkpIHtcblx0XHRcdFx0ZWRpdG9yLnJlbmRlcih0cnVlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZWRpdG9ySGFzRG9tRm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIERPTS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHRoaXMuZ2V0RG9tTm9kZSgpKTtcblx0fVxuXG5cdHVwZGF0ZUVkaXRvckZvY3VzKCkge1xuXHRcdC8vIE5vdGUgLSBmb2N1cyBnb2luZyB0byB0aGUgd2VidmlldyB3aWxsIGZpcmUgJ2JsdXInLCBidXQgdGhlIHdlYnZpZXcgZWxlbWVudCB3aWxsIGJlXG5cdFx0Ly8gYSBkZXNjZW5kZW50IG9mIHRoZSBub3RlYm9vayBlZGl0b3Igcm9vdC5cblx0XHR0aGlzLl9mb2N1c1RyYWNrZXIucmVmcmVzaFN0YXRlKCk7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuZWRpdG9ySGFzRG9tRm9jdXMoKTtcblx0XHR0aGlzLl9lZGl0b3JGb2N1cy5zZXQoZm9jdXNlZCk7XG5cdFx0dGhpcy52aWV3TW9kZWw/LnNldEVkaXRvckZvY3VzKGZvY3VzZWQpO1xuXHR9XG5cblx0dXBkYXRlQ2VsbEZvY3VzTW9kZSgpIHtcblx0XHRjb25zdCBhY3RpdmVDZWxsID0gdGhpcy5nZXRBY3RpdmVDZWxsKCk7XG5cblx0XHRpZiAoYWN0aXZlQ2VsbD8uZm9jdXNNb2RlID09PSBDZWxsRm9jdXNNb2RlLk91dHB1dCAmJiAhdGhpcy5fd2Vidmlld0ZvY3VzZWQpIHtcblx0XHRcdC8vIG91dHB1dCBwcmV2aW91c2x5IGhhcyBmb2N1cywgYnV0IG5vdyBpdCdzIGJsdXJyZWQuXG5cdFx0XHRhY3RpdmVDZWxsLmZvY3VzTW9kZSA9IENlbGxGb2N1c01vZGUuQ29udGFpbmVyO1xuXHRcdH1cblx0fVxuXG5cdGhhc0VkaXRvckZvY3VzKCkge1xuXHRcdC8vIF9lZGl0b3JGb2N1cyBpcyBkcml2ZW4gYnkgdGhlIEZvY3VzVHJhY2tlciwgd2hpY2ggaXMgb25seSBndWFyYW50ZWVkIHRvIF9ldmVudHVhbGx5XyBmaXJlIGJsdXIuXG5cdFx0Ly8gSWYgd2UgbmVlZCB0byBrbm93IHdoZXRoZXIgd2UgaGF2ZSBmb2N1cyBhdCB0aGlzIGluc3RhbnQsIHdlIG5lZWQgdG8gY2hlY2sgdGhlIERPTSBtYW51YWxseS5cblx0XHR0aGlzLnVwZGF0ZUVkaXRvckZvY3VzKCk7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9ySGFzRG9tRm9jdXMoKTtcblx0fVxuXG5cdGhhc1dlYnZpZXdGb2N1cygpIHtcblx0XHRyZXR1cm4gdGhpcy5fd2Vidmlld0ZvY3VzZWQ7XG5cdH1cblxuXHRoYXNPdXRwdXRUZXh0U2VsZWN0aW9uKCkge1xuXHRcdGlmICghdGhpcy5oYXNFZGl0b3JGb2N1cygpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2luZG93U2VsZWN0aW9uID0gRE9NLmdldFdpbmRvdyh0aGlzLmdldERvbU5vZGUoKSkuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKHdpbmRvd1NlbGVjdGlvbj8ucmFuZ2VDb3VudCAhPT0gMSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZVNlbGVjdGlvbiA9IHdpbmRvd1NlbGVjdGlvbi5nZXRSYW5nZUF0KDApO1xuXHRcdGlmIChhY3RpdmVTZWxlY3Rpb24uc3RhcnRDb250YWluZXIgPT09IGFjdGl2ZVNlbGVjdGlvbi5lbmRDb250YWluZXIgJiYgYWN0aXZlU2VsZWN0aW9uLmVuZE9mZnNldCAtIGFjdGl2ZVNlbGVjdGlvbi5zdGFydE9mZnNldCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGxldCBjb250YWluZXI6IE5vZGUgfCBudWxsID0gYWN0aXZlU2VsZWN0aW9uLmNvbW1vbkFuY2VzdG9yQ29udGFpbmVyO1xuXG5cdFx0aWYgKCF0aGlzLl9ib2R5LmNvbnRhaW5zKGNvbnRhaW5lcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR3aGlsZSAoY29udGFpbmVyXG5cdFx0XHQmJlxuXHRcdFx0Y29udGFpbmVyICE9PSB0aGlzLl9ib2R5KSB7XG5cdFx0XHRpZiAoKGNvbnRhaW5lciBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0ICYmIChjb250YWluZXIgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdC5jb250YWlucygnb3V0cHV0JykpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnRhaW5lciA9IGNvbnRhaW5lci5wYXJlbnROb2RlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdF9kaWRGb2N1c091dHB1dElucHV0Q2hhbmdlKGhhc0ZvY3VzOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fb3V0cHV0SW5wdXRGb2N1cy5zZXQoaGFzRm9jdXMpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEVkaXRvciBGZWF0dXJlc1xuXG5cdGZvY3VzRWxlbWVudChjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdHRoaXMudmlld01vZGVsPy51cGRhdGVTZWxlY3Rpb25zU3RhdGUoe1xuXHRcdFx0a2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkhhbmRsZSxcblx0XHRcdHByaW1hcnk6IGNlbGwuaGFuZGxlLFxuXHRcdFx0c2VsZWN0aW9uczogW2NlbGwuaGFuZGxlXVxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0IHNjcm9sbFRvcCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbGlzdC5zY3JvbGxUb3A7XG5cdH1cblxuXHRnZXQgc2Nyb2xsQm90dG9tKCkge1xuXHRcdHJldHVybiB0aGlzLl9saXN0LnNjcm9sbFRvcCArIHRoaXMuX2xpc3QuZ2V0UmVuZGVySGVpZ2h0KCk7XG5cdH1cblxuXHRnZXRBYnNvbHV0ZVRvcE9mRWxlbWVudChjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdHJldHVybiB0aGlzLl9saXN0LmdldENlbGxWaWV3U2Nyb2xsVG9wKGNlbGwpO1xuXHR9XG5cblx0Z2V0QWJzb2x1dGVCb3R0b21PZkVsZW1lbnQoY2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHRyZXR1cm4gdGhpcy5fbGlzdC5nZXRDZWxsVmlld1Njcm9sbEJvdHRvbShjZWxsKTtcblx0fVxuXG5cdGdldEhlaWdodE9mRWxlbWVudChjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdHJldHVybiB0aGlzLl9saXN0LmVsZW1lbnRIZWlnaHQoY2VsbCk7XG5cdH1cblxuXHRzY3JvbGxUb0JvdHRvbSgpIHtcblx0XHR0aGlzLl9saXN0LnNjcm9sbFRvQm90dG9tKCk7XG5cdH1cblxuXHRzZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9saXN0LnNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcblx0fVxuXG5cdHJldmVhbENlbGxSYW5nZUluVmlldyhyYW5nZTogSUNlbGxSYW5nZSkge1xuXHRcdHJldHVybiB0aGlzLl9saXN0LnJldmVhbENlbGxzKHJhbmdlKTtcblx0fVxuXG5cdHJldmVhbEluVmlldyhjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdHJldHVybiB0aGlzLl9saXN0LnJldmVhbENlbGwoY2VsbCwgQ2VsbFJldmVhbFR5cGUuRGVmYXVsdCk7XG5cdH1cblxuXHRyZXZlYWxJblZpZXdBdFRvcChjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdHRoaXMuX2xpc3QucmV2ZWFsQ2VsbChjZWxsLCBDZWxsUmV2ZWFsVHlwZS5Ub3ApO1xuXHR9XG5cblx0cmV2ZWFsSW5DZW50ZXIoY2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHR0aGlzLl9saXN0LnJldmVhbENlbGwoY2VsbCwgQ2VsbFJldmVhbFR5cGUuQ2VudGVyKTtcblx0fVxuXG5cdGFzeW5jIHJldmVhbEluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQoY2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHRhd2FpdCB0aGlzLl9saXN0LnJldmVhbENlbGwoY2VsbCwgQ2VsbFJldmVhbFR5cGUuQ2VudGVySWZPdXRzaWRlVmlld3BvcnQpO1xuXHR9XG5cblx0YXN5bmMgcmV2ZWFsRmlyc3RMaW5lSWZPdXRzaWRlVmlld3BvcnQoY2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHRhd2FpdCB0aGlzLl9saXN0LnJldmVhbENlbGwoY2VsbCwgQ2VsbFJldmVhbFR5cGUuRmlyc3RMaW5lSWZPdXRzaWRlVmlld3BvcnQpO1xuXHR9XG5cblx0YXN5bmMgcmV2ZWFsTGluZUluVmlld0FzeW5jKGNlbGw6IElDZWxsVmlld01vZGVsLCBsaW5lOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fbGlzdC5yZXZlYWxSYW5nZUluQ2VsbChjZWxsLCBuZXcgUmFuZ2UobGluZSwgMSwgbGluZSwgMSksIENlbGxSZXZlYWxSYW5nZVR5cGUuRGVmYXVsdCk7XG5cdH1cblxuXHRhc3luYyByZXZlYWxMaW5lSW5DZW50ZXJBc3luYyhjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgbGluZTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3QucmV2ZWFsUmFuZ2VJbkNlbGwoY2VsbCwgbmV3IFJhbmdlKGxpbmUsIDEsIGxpbmUsIDEpLCBDZWxsUmV2ZWFsUmFuZ2VUeXBlLkNlbnRlcik7XG5cdH1cblxuXHRhc3luYyByZXZlYWxMaW5lSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydEFzeW5jKGNlbGw6IElDZWxsVmlld01vZGVsLCBsaW5lOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fbGlzdC5yZXZlYWxSYW5nZUluQ2VsbChjZWxsLCBuZXcgUmFuZ2UobGluZSwgMSwgbGluZSwgMSksIENlbGxSZXZlYWxSYW5nZVR5cGUuQ2VudGVySWZPdXRzaWRlVmlld3BvcnQpO1xuXHR9XG5cblx0YXN5bmMgcmV2ZWFsUmFuZ2VJblZpZXdBc3luYyhjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgcmFuZ2U6IFNlbGVjdGlvbiB8IFJhbmdlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3QucmV2ZWFsUmFuZ2VJbkNlbGwoY2VsbCwgcmFuZ2UsIENlbGxSZXZlYWxSYW5nZVR5cGUuRGVmYXVsdCk7XG5cdH1cblxuXHRhc3luYyByZXZlYWxSYW5nZUluQ2VudGVyQXN5bmMoY2VsbDogSUNlbGxWaWV3TW9kZWwsIHJhbmdlOiBTZWxlY3Rpb24gfCBSYW5nZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9saXN0LnJldmVhbFJhbmdlSW5DZWxsKGNlbGwsIHJhbmdlLCBDZWxsUmV2ZWFsUmFuZ2VUeXBlLkNlbnRlcik7XG5cdH1cblxuXHRhc3luYyByZXZlYWxSYW5nZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnRBc3luYyhjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgcmFuZ2U6IFNlbGVjdGlvbiB8IFJhbmdlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3QucmV2ZWFsUmFuZ2VJbkNlbGwoY2VsbCwgcmFuZ2UsIENlbGxSZXZlYWxSYW5nZVR5cGUuQ2VudGVySWZPdXRzaWRlVmlld3BvcnQpO1xuXHR9XG5cblx0cmV2ZWFsQ2VsbE9mZnNldEluQ2VudGVyKGNlbGw6IElDZWxsVmlld01vZGVsLCBvZmZzZXQ6IG51bWJlcikge1xuXHRcdHJldHVybiB0aGlzLl9saXN0LnJldmVhbENlbGxPZmZzZXRJbkNlbnRlcihjZWxsLCBvZmZzZXQpO1xuXHR9XG5cblx0cmV2ZWFsT2Zmc2V0SW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChvZmZzZXQ6IG51bWJlcikge1xuXHRcdHJldHVybiB0aGlzLl9saXN0LnJldmVhbE9mZnNldEluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQob2Zmc2V0KTtcblx0fVxuXG5cdGdldFZpZXdJbmRleEJ5TW9kZWxJbmRleChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX2xpc3RWaWV3SW5mb0FjY2Vzc29yKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLnZpZXdNb2RlbD8udmlld0NlbGxzW2luZGV4XTtcblx0XHRpZiAoIWNlbGwpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fbGlzdFZpZXdJbmZvQWNjZXNzb3IuZ2V0Vmlld0luZGV4KGNlbGwpO1xuXHR9XG5cblx0Z2V0Vmlld0hlaWdodChjZWxsOiBJQ2VsbFZpZXdNb2RlbCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9saXN0Vmlld0luZm9BY2Nlc3Nvcikge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9saXN0Vmlld0luZm9BY2Nlc3Nvci5nZXRWaWV3SGVpZ2h0KGNlbGwpO1xuXHR9XG5cblx0Z2V0Q2VsbFJhbmdlRnJvbVZpZXdSYW5nZShzdGFydEluZGV4OiBudW1iZXIsIGVuZEluZGV4OiBudW1iZXIpOiBJQ2VsbFJhbmdlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbGlzdFZpZXdJbmZvQWNjZXNzb3IuZ2V0Q2VsbFJhbmdlRnJvbVZpZXdSYW5nZShzdGFydEluZGV4LCBlbmRJbmRleCk7XG5cdH1cblxuXHRnZXRDZWxsc0luUmFuZ2UocmFuZ2U/OiBJQ2VsbFJhbmdlKTogUmVhZG9ubHlBcnJheTxJQ2VsbFZpZXdNb2RlbD4ge1xuXHRcdHJldHVybiB0aGlzLl9saXN0Vmlld0luZm9BY2Nlc3Nvci5nZXRDZWxsc0luUmFuZ2UocmFuZ2UpO1xuXHR9XG5cblx0c2V0Q2VsbEVkaXRvclNlbGVjdGlvbihjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgcmFuZ2U6IFJhbmdlKTogdm9pZCB7XG5cdFx0dGhpcy5fbGlzdC5zZXRDZWxsRWRpdG9yU2VsZWN0aW9uKGNlbGwsIHJhbmdlKTtcblx0fVxuXG5cdHNldEhpZGRlbkFyZWFzKF9yYW5nZXM6IElDZWxsUmFuZ2VbXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9saXN0LnNldEhpZGRlbkFyZWFzKF9yYW5nZXMsIHRydWUpO1xuXHR9XG5cblx0Z2V0VmlzaWJsZVJhbmdlc1BsdXNWaWV3cG9ydEFib3ZlQW5kQmVsb3coKTogSUNlbGxSYW5nZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fbGlzdFZpZXdJbmZvQWNjZXNzb3IuZ2V0VmlzaWJsZVJhbmdlc1BsdXNWaWV3cG9ydEFib3ZlQW5kQmVsb3coKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBEZWNvcmF0aW9uc1xuXG5cdGRlbHRhQ2VsbERlY29yYXRpb25zKG9sZERlY29yYXRpb25zOiBzdHJpbmdbXSwgbmV3RGVjb3JhdGlvbnM6IElOb3RlYm9va0RlbHRhRGVjb3JhdGlvbltdKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHJldCA9IHRoaXMudmlld01vZGVsPy5kZWx0YUNlbGxEZWNvcmF0aW9ucyhvbGREZWNvcmF0aW9ucywgbmV3RGVjb3JhdGlvbnMpIHx8IFtdO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuZmlyZSgpO1xuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHRkZWx0YUNlbGxDb250YWluZXJDbGFzc05hbWVzKGNlbGxJZDogc3RyaW5nLCBhZGRlZDogc3RyaW5nW10sIHJlbW92ZWQ6IHN0cmluZ1tdLCBjZWxsa2luZDogQ2VsbEtpbmQpOiB2b2lkIHtcblx0XHRpZiAoY2VsbGtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCkge1xuXHRcdFx0dGhpcy5fd2Vidmlldz8uZGVsdGFNYXJrdXBQcmV2aWV3Q2xhc3NOYW1lcyhjZWxsSWQsIGFkZGVkLCByZW1vdmVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fd2Vidmlldz8uZGVsdGFDZWxsT3V0cHV0Q29udGFpbmVyQ2xhc3NOYW1lcyhjZWxsSWQsIGFkZGVkLCByZW1vdmVkKTtcblx0XHR9XG5cdH1cblxuXHRjaGFuZ2VNb2RlbERlY29yYXRpb25zPFQ+KGNhbGxiYWNrOiAoY2hhbmdlQWNjZXNzb3I6IElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IpID0+IFQpOiBUIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsPy5jaGFuZ2VNb2RlbERlY29yYXRpb25zPFQ+KGNhbGxiYWNrKSB8fCBudWxsO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFZpZXcgWm9uZXNcblx0Y2hhbmdlVmlld1pvbmVzKGNhbGxiYWNrOiAoYWNjZXNzb3I6IElOb3RlYm9va1ZpZXdab25lQ2hhbmdlQWNjZXNzb3IpID0+IHZvaWQpOiB2b2lkIHtcblx0XHR0aGlzLl9saXN0LmNoYW5nZVZpZXdab25lcyhjYWxsYmFjayk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VMYXlvdXQuZmlyZSgpO1xuXHR9XG5cblx0Z2V0Vmlld1pvbmVMYXlvdXRJbmZvKGlkOiBzdHJpbmcpOiB7IHRvcDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3QuZ2V0Vmlld1pvbmVMYXlvdXRJbmZvKGlkKTtcblx0fVxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gT3ZlcmxheVxuXHRjaGFuZ2VDZWxsT3ZlcmxheXMoY2FsbGJhY2s6IChhY2Nlc3NvcjogSU5vdGVib29rQ2VsbE92ZXJsYXlDaGFuZ2VBY2Nlc3NvcikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRoaXMuX2xpc3QuY2hhbmdlQ2VsbE92ZXJsYXlzKGNhbGxiYWNrKTtcblx0fVxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gS2VybmVsL0V4ZWN1dGlvblxuXG5cdHByaXZhdGUgYXN5bmMgX2xvYWRLZXJuZWxQcmVsb2FkcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB7IHNlbGVjdGVkIH0gPSB0aGlzLm5vdGVib29rS2VybmVsU2VydmljZS5nZXRNYXRjaGluZ0tlcm5lbCh0aGlzLnRleHRNb2RlbCk7XG5cdFx0aWYgKCF0aGlzLl93ZWJ2aWV3Py5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Jlc29sdmVXZWJ2aWV3KCk7XG5cdFx0fVxuXHRcdHRoaXMuX3dlYnZpZXc/LnVwZGF0ZUtlcm5lbFByZWxvYWRzKHNlbGVjdGVkKTtcblx0fVxuXG5cdGdldCBhY3RpdmVLZXJuZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMudGV4dE1vZGVsICYmIHRoaXMubm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldFNlbGVjdGVkT3JTdWdnZXN0ZWRLZXJuZWwodGhpcy50ZXh0TW9kZWwpO1xuXHR9XG5cblx0YXN5bmMgY2FuY2VsTm90ZWJvb2tDZWxscyhjZWxscz86IEl0ZXJhYmxlPElDZWxsVmlld01vZGVsPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy52aWV3TW9kZWwgfHwgIXRoaXMuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWNlbGxzKSB7XG5cdFx0XHRjZWxscyA9IHRoaXMudmlld01vZGVsLnZpZXdDZWxscztcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlLmNhbmNlbE5vdGVib29rQ2VsbEhhbmRsZXModGhpcy50ZXh0TW9kZWwsIEFycmF5LmZyb20oY2VsbHMpLm1hcChjZWxsID0+IGNlbGwuaGFuZGxlKSk7XG5cdH1cblxuXHRhc3luYyBleGVjdXRlTm90ZWJvb2tDZWxscyhjZWxscz86IEl0ZXJhYmxlPElDZWxsVmlld01vZGVsPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy52aWV3TW9kZWwgfHwgIXRoaXMuaGFzTW9kZWwoKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ25vdGVib29rRWRpdG9yV2lkZ2V0JywgJ05vIE5vdGVib29rVmlld01vZGVsLCBjYW5ub3QgZXhlY3V0ZSBjZWxscycpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWNlbGxzKSB7XG5cdFx0XHRjZWxscyA9IHRoaXMudmlld01vZGVsLnZpZXdDZWxscztcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlLmV4ZWN1dGVOb3RlYm9va0NlbGxzKHRoaXMudGV4dE1vZGVsLCBBcnJheS5mcm9tKGNlbGxzKS5tYXAoYyA9PiBjLm1vZGVsKSwgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRhc3luYyBsYXlvdXROb3RlYm9va0NlbGwoY2VsbDogSUNlbGxWaWV3TW9kZWwsIGhlaWdodDogbnVtYmVyLCBjb250ZXh0PzogQ2VsbExheW91dENvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fY2VsbExheW91dE1hbmFnZXI/LmxheW91dE5vdGVib29rQ2VsbChjZWxsLCBoZWlnaHQpO1xuXHR9XG5cblx0Z2V0QWN0aXZlQ2VsbCgpIHtcblx0XHRjb25zdCBlbGVtZW50cyA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXNlZEVsZW1lbnRzKCk7XG5cblx0XHRpZiAoZWxlbWVudHMgJiYgZWxlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudHNbMF07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3RvZ2dsZU5vdGVib29rQ2VsbFNlbGVjdGlvbihzZWxlY3RlZENlbGw6IElDZWxsVmlld01vZGVsLCBzZWxlY3RGcm9tUHJldmlvdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50U2VsZWN0aW9ucyA9IHRoaXMuX2xpc3QuZ2V0U2VsZWN0ZWRFbGVtZW50cygpO1xuXHRcdGNvbnN0IGlzU2VsZWN0ZWQgPSBjdXJyZW50U2VsZWN0aW9ucy5pbmNsdWRlcyhzZWxlY3RlZENlbGwpO1xuXG5cdFx0Y29uc3QgcHJldmlvdXNTZWxlY3Rpb24gPSBzZWxlY3RGcm9tUHJldmlvdXMgPyBjdXJyZW50U2VsZWN0aW9uc1tjdXJyZW50U2VsZWN0aW9ucy5sZW5ndGggLSAxXSA/PyBzZWxlY3RlZENlbGwgOiBzZWxlY3RlZENlbGw7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRJbmRleCA9IHRoaXMuX2xpc3QuZ2V0Vmlld0luZGV4KHNlbGVjdGVkQ2VsbCkhO1xuXHRcdGNvbnN0IHByZXZpb3VzSW5kZXggPSB0aGlzLl9saXN0LmdldFZpZXdJbmRleChwcmV2aW91c1NlbGVjdGlvbikhO1xuXG5cdFx0Y29uc3QgY2VsbHNJblNlbGVjdGlvblJhbmdlID0gdGhpcy5nZXRDZWxsc0luVmlld1JhbmdlKHNlbGVjdGVkSW5kZXgsIHByZXZpb3VzSW5kZXgpO1xuXHRcdGlmIChpc1NlbGVjdGVkKSB7XG5cdFx0XHQvLyBEZXNlbGVjdFxuXHRcdFx0dGhpcy5fbGlzdC5zZWxlY3RFbGVtZW50cyhjdXJyZW50U2VsZWN0aW9ucy5maWx0ZXIoY3VycmVudCA9PiAhY2VsbHNJblNlbGVjdGlvblJhbmdlLmluY2x1ZGVzKGN1cnJlbnQpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEFkZCB0byBzZWxlY3Rpb25cblx0XHRcdHRoaXMuZm9jdXNFbGVtZW50KHNlbGVjdGVkQ2VsbCk7XG5cdFx0XHR0aGlzLl9saXN0LnNlbGVjdEVsZW1lbnRzKFsuLi5jdXJyZW50U2VsZWN0aW9ucy5maWx0ZXIoY3VycmVudCA9PiAhY2VsbHNJblNlbGVjdGlvblJhbmdlLmluY2x1ZGVzKGN1cnJlbnQpKSwgLi4uY2VsbHNJblNlbGVjdGlvblJhbmdlXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRDZWxsc0luVmlld1JhbmdlKGZyb21JbmNsdXNpdmU6IG51bWJlciwgdG9JbmNsdXNpdmU6IG51bWJlcik6IElDZWxsVmlld01vZGVsW10ge1xuXHRcdGNvbnN0IHNlbGVjdGVkQ2VsbHNJblJhbmdlOiBJQ2VsbFZpZXdNb2RlbFtdID0gW107XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHRoaXMuX2xpc3QubGVuZ3RoOyArK2luZGV4KSB7XG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy5fbGlzdC5lbGVtZW50KGluZGV4KTtcblx0XHRcdGlmIChjZWxsKSB7XG5cdFx0XHRcdGlmICgoaW5kZXggPj0gZnJvbUluY2x1c2l2ZSAmJiBpbmRleCA8PSB0b0luY2x1c2l2ZSkgfHwgKGluZGV4ID49IHRvSW5jbHVzaXZlICYmIGluZGV4IDw9IGZyb21JbmNsdXNpdmUpKSB7XG5cdFx0XHRcdFx0c2VsZWN0ZWRDZWxsc0luUmFuZ2UucHVzaChjZWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc2VsZWN0ZWRDZWxsc0luUmFuZ2U7XG5cdH1cblxuXHRhc3luYyBmb2N1c05vdGVib29rQ2VsbChjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgZm9jdXNJdGVtOiAnZWRpdG9yJyB8ICdjb250YWluZXInIHwgJ291dHB1dCcsIG9wdGlvbnM/OiBJRm9jdXNOb3RlYm9va0NlbGxPcHRpb25zKSB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjZWxsLmZvY3VzZWRPdXRwdXRJZCA9IHVuZGVmaW5lZDtcblxuXHRcdGlmIChmb2N1c0l0ZW0gPT09ICdlZGl0b3InKSB7XG5cdFx0XHRjZWxsLmlzSW5wdXRDb2xsYXBzZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuZm9jdXNFbGVtZW50KGNlbGwpO1xuXHRcdFx0dGhpcy5fbGlzdC5mb2N1c1ZpZXcoKTtcblxuXHRcdFx0Y2VsbC51cGRhdGVFZGl0U3RhdGUoQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nLCAnZm9jdXNOb3RlYm9va0NlbGwnKTtcblx0XHRcdGNlbGwuZm9jdXNNb2RlID0gQ2VsbEZvY3VzTW9kZS5FZGl0b3I7XG5cdFx0XHRpZiAoIW9wdGlvbnM/LnNraXBSZXZlYWwpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBvcHRpb25zPy5mb2N1c0VkaXRvckxpbmUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0dGhpcy5fY3Vyc29yTmF2TW9kZS5zZXQodHJ1ZSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZXZlYWxMaW5lSW5WaWV3QXN5bmMoY2VsbCwgb3B0aW9ucy5mb2N1c0VkaXRvckxpbmUpO1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX3JlbmRlcmVkRWRpdG9ycy5nZXQoY2VsbCkhO1xuXHRcdFx0XHRcdGNvbnN0IGZvY3VzRWRpdG9yTGluZSA9IG9wdGlvbnMuZm9jdXNFZGl0b3JMaW5lO1xuXHRcdFx0XHRcdGVkaXRvcj8uc2V0U2VsZWN0aW9uKHtcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogZm9jdXNFZGl0b3JMaW5lLFxuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBmb2N1c0VkaXRvckxpbmUsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IDFcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb25zU3RhcnRQb3NpdGlvbiA9IGNlbGwuZ2V0U2VsZWN0aW9uc1N0YXJ0UG9zaXRpb24oKTtcblx0XHRcdFx0XHRpZiAoc2VsZWN0aW9uc1N0YXJ0UG9zaXRpb24/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZmlyc3RTZWxlY3Rpb25Qb3NpdGlvbiA9IHNlbGVjdGlvbnNTdGFydFBvc2l0aW9uWzBdO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5yZXZlYWxSYW5nZUluVmlld0FzeW5jKGNlbGwsIFJhbmdlLmZyb21Qb3NpdGlvbnMoZmlyc3RTZWxlY3Rpb25Qb3NpdGlvbiwgZmlyc3RTZWxlY3Rpb25Qb3NpdGlvbikpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnJldmVhbEluVmlldyhjZWxsKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fVxuXG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChmb2N1c0l0ZW0gPT09ICdvdXRwdXQnKSB7XG5cdFx0XHR0aGlzLmZvY3VzRWxlbWVudChjZWxsKTtcblxuXHRcdFx0aWYgKCF0aGlzLmhhc0VkaXRvckZvY3VzKCkpIHtcblx0XHRcdFx0dGhpcy5fbGlzdC5mb2N1c1ZpZXcoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLl93ZWJ2aWV3KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmlyc3RPdXRwdXRJZCA9IGNlbGwub3V0cHV0c1ZpZXdNb2RlbHMuZmluZChvID0+IG8ubW9kZWwuYWx0ZXJuYXRpdmVPdXRwdXRJZCk/Lm1vZGVsLmFsdGVybmF0aXZlT3V0cHV0SWQ7XG5cdFx0XHRjb25zdCBmb2N1c0VsZW1lbnRJZCA9IG9wdGlvbnM/Lm91dHB1dElkID8/IGZpcnN0T3V0cHV0SWQgPz8gY2VsbC5pZDtcblx0XHRcdHRoaXMuX3dlYnZpZXcuZm9jdXNPdXRwdXQoZm9jdXNFbGVtZW50SWQsIG9wdGlvbnM/LmFsdE91dHB1dElkLCBvcHRpb25zPy5vdXRwdXRXZWJ2aWV3Rm9jdXNlZCB8fCB0aGlzLl93ZWJ2aWV3Rm9jdXNlZCk7XG5cblx0XHRcdGNlbGwudXBkYXRlRWRpdFN0YXRlKENlbGxFZGl0U3RhdGUuUHJldmlldywgJ2ZvY3VzTm90ZWJvb2tDZWxsJyk7XG5cdFx0XHRjZWxsLmZvY3VzTW9kZSA9IENlbGxGb2N1c01vZGUuT3V0cHV0O1xuXHRcdFx0Y2VsbC5mb2N1c2VkT3V0cHV0SWQgPSBvcHRpb25zPy5vdXRwdXRJZDtcblx0XHRcdHRoaXMuX291dHB1dEZvY3VzLnNldCh0cnVlKTtcblx0XHRcdGlmICghb3B0aW9ucz8uc2tpcFJldmVhbCkge1xuXHRcdFx0XHR0aGlzLnJldmVhbEluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQoY2VsbCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGZvY3VzIGNvbnRhaW5lclxuXHRcdFx0Y29uc3QgaXRlbURPTSA9IHRoaXMuX2xpc3QuZG9tRWxlbWVudE9mRWxlbWVudChjZWxsKTtcblx0XHRcdGlmIChpdGVtRE9NICYmIGl0ZW1ET00ub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50ICYmIGl0ZW1ET00uY29udGFpbnMoaXRlbURPTS5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpKSB7XG5cdFx0XHRcdChpdGVtRE9NLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudCkuYmx1cigpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl93ZWJ2aWV3Py5ibHVyT3V0cHV0KCk7XG5cblx0XHRcdGNlbGwudXBkYXRlRWRpdFN0YXRlKENlbGxFZGl0U3RhdGUuUHJldmlldywgJ2ZvY3VzTm90ZWJvb2tDZWxsJyk7XG5cdFx0XHRjZWxsLmZvY3VzTW9kZSA9IENlbGxGb2N1c01vZGUuQ29udGFpbmVyO1xuXG5cdFx0XHR0aGlzLmZvY3VzRWxlbWVudChjZWxsKTtcblx0XHRcdGlmICghb3B0aW9ucz8uc2tpcFJldmVhbCkge1xuXHRcdFx0XHRpZiAodHlwZW9mIG9wdGlvbnM/LmZvY3VzRWRpdG9yTGluZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHR0aGlzLl9jdXJzb3JOYXZNb2RlLnNldCh0cnVlKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJldmVhbEluVmlldyhjZWxsKTtcblx0XHRcdFx0fSBlbHNlIGlmIChvcHRpb25zPy5yZXZlYWxCZWhhdmlvciA9PT0gU2Nyb2xsVG9SZXZlYWxCZWhhdmlvci5maXJzdExpbmUpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJldmVhbEZpcnN0TGluZUlmT3V0c2lkZVZpZXdwb3J0KGNlbGwpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG9wdGlvbnM/LnJldmVhbEJlaGF2aW9yID09PSBTY3JvbGxUb1JldmVhbEJlaGF2aW9yLmZ1bGxDZWxsKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZXZlYWxJblZpZXcoY2VsbCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZXZlYWxJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KGNlbGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9saXN0LmZvY3VzVmlldygpO1xuXHRcdFx0dGhpcy51cGRhdGVFZGl0b3JGb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGZvY3VzTmV4dE5vdGVib29rQ2VsbChjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgZm9jdXNJdGVtOiAnZWRpdG9yJyB8ICdjb250YWluZXInIHwgJ291dHB1dCcpIHtcblx0XHRjb25zdCBpZHggPSB0aGlzLnZpZXdNb2RlbD8uZ2V0Q2VsbEluZGV4KGNlbGwpO1xuXHRcdGlmICh0eXBlb2YgaWR4ICE9PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld0NlbGwgPSB0aGlzLnZpZXdNb2RlbD8uY2VsbEF0KGlkeCArIDEpO1xuXHRcdGlmICghbmV3Q2VsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuZm9jdXNOb3RlYm9va0NlbGwobmV3Q2VsbCwgZm9jdXNJdGVtKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBGaW5kXG5cblx0cHJpdmF0ZSBhc3luYyBfd2FybXVwQ2VsbCh2aWV3Q2VsbDogQ29kZUNlbGxWaWV3TW9kZWwpIHtcblx0XHRpZiAodmlld0NlbGwuaXNPdXRwdXRDb2xsYXBzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvdXRwdXRzID0gdmlld0NlbGwub3V0cHV0c1ZpZXdNb2RlbHM7XG5cdFx0Zm9yIChjb25zdCBvdXRwdXQgb2Ygb3V0cHV0cy5zbGljZSgwLCBvdXRwdXREaXNwbGF5TGltaXQpKSB7XG5cdFx0XHRjb25zdCBbbWltZVR5cGVzLCBwaWNrXSA9IG91dHB1dC5yZXNvbHZlTWltZVR5cGVzKHRoaXMudGV4dE1vZGVsISwgdW5kZWZpbmVkKTtcblx0XHRcdGlmICghbWltZVR5cGVzLmZpbmQobWltZVR5cGUgPT4gbWltZVR5cGUuaXNUcnVzdGVkKSB8fCBtaW1lVHlwZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwaWNrZWRNaW1lVHlwZVJlbmRlcmVyID0gbWltZVR5cGVzW3BpY2tdO1xuXG5cdFx0XHRpZiAoIXBpY2tlZE1pbWVUeXBlUmVuZGVyZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZW5kZXJlciA9IHRoaXMuX25vdGVib29rU2VydmljZS5nZXRSZW5kZXJlckluZm8ocGlja2VkTWltZVR5cGVSZW5kZXJlci5yZW5kZXJlcklkKTtcblxuXHRcdFx0aWYgKCFyZW5kZXJlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogSUluc2V0UmVuZGVyT3V0cHV0ID0geyB0eXBlOiBSZW5kZXJPdXRwdXRUeXBlLkV4dGVuc2lvbiwgcmVuZGVyZXIsIHNvdXJjZTogb3V0cHV0LCBtaW1lVHlwZTogcGlja2VkTWltZVR5cGVSZW5kZXJlci5taW1lVHlwZSB9O1xuXHRcdFx0Y29uc3QgaW5zZXQgPSB0aGlzLl93ZWJ2aWV3Py5pbnNldE1hcHBpbmcuZ2V0KHJlc3VsdC5zb3VyY2UpO1xuXHRcdFx0aWYgKCFpbnNldCB8fCAhaW5zZXQuaW5pdGlhbGl6ZWQpIHtcblx0XHRcdFx0Y29uc3QgcCA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSh0aGlzLm9uRGlkUmVuZGVyT3V0cHV0LCB0aGlzLm9uRGlkUmVtb3ZlT3V0cHV0KShlID0+IHtcblx0XHRcdFx0XHRcdGlmIChlLm1vZGVsID09PSByZXN1bHQuc291cmNlLm1vZGVsKSB7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLmNyZWF0ZU91dHB1dCh2aWV3Q2VsbCwgcmVzdWx0LCAwLCBmYWxzZSk7XG5cdFx0XHRcdGF3YWl0IHA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyByZXF1ZXN0IHRvIHVwZGF0ZSBpdHMgdmlzaWJpbGl0eVxuXHRcdFx0XHR0aGlzLmNyZWF0ZU91dHB1dCh2aWV3Q2VsbCwgcmVzdWx0LCAwLCBmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dhcm11cEFsbChpbmNsdWRlT3V0cHV0OiBib29sZWFuKSB7XG5cdFx0aWYgKCF0aGlzLmhhc01vZGVsKCkgfHwgIXRoaXMudmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2VsbHMgPSB0aGlzLnZpZXdNb2RlbC52aWV3Q2VsbHM7XG5cdFx0Y29uc3QgcmVxdWVzdHMgPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY2VsbHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChjZWxsc1tpXS5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwICYmICF0aGlzLl93ZWJ2aWV3IS5tYXJrdXBQcmV2aWV3TWFwcGluZy5oYXMoY2VsbHNbaV0uaWQpKSB7XG5cdFx0XHRcdHJlcXVlc3RzLnB1c2godGhpcy5jcmVhdGVNYXJrdXBQcmV2aWV3KGNlbGxzW2ldKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGluY2x1ZGVPdXRwdXQgJiYgdGhpcy5fbGlzdCkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9saXN0Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9saXN0LmVsZW1lbnQoaSk7XG5cblx0XHRcdFx0aWYgKGNlbGw/LmNlbGxLaW5kID09PSBDZWxsS2luZC5Db2RlKSB7XG5cdFx0XHRcdFx0cmVxdWVzdHMucHVzaCh0aGlzLl93YXJtdXBDZWxsKChjZWxsIGFzIENvZGVDZWxsVmlld01vZGVsKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHJlcXVlc3RzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dhcm11cFNlbGVjdGlvbihpbmNsdWRlT3V0cHV0OiBib29sZWFuLCBzZWxlY3RlZENlbGxSYW5nZXM6IElDZWxsUmFuZ2VbXSkge1xuXHRcdGlmICghdGhpcy5oYXNNb2RlbCgpIHx8ICF0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNlbGxzID0gdGhpcy52aWV3TW9kZWwudmlld0NlbGxzO1xuXHRcdGNvbnN0IHJlcXVlc3RzID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIHNlbGVjdGVkQ2VsbFJhbmdlcykge1xuXHRcdFx0Zm9yIChsZXQgaSA9IHJhbmdlLnN0YXJ0OyBpIDwgcmFuZ2UuZW5kOyBpKyspIHtcblx0XHRcdFx0aWYgKGNlbGxzW2ldLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXAgJiYgIXRoaXMuX3dlYnZpZXchLm1hcmt1cFByZXZpZXdNYXBwaW5nLmhhcyhjZWxsc1tpXS5pZCkpIHtcblx0XHRcdFx0XHRyZXF1ZXN0cy5wdXNoKHRoaXMuY3JlYXRlTWFya3VwUHJldmlldyhjZWxsc1tpXSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGluY2x1ZGVPdXRwdXQgJiYgdGhpcy5fbGlzdCkge1xuXHRcdFx0Zm9yIChjb25zdCByYW5nZSBvZiBzZWxlY3RlZENlbGxSYW5nZXMpIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IHJhbmdlLnN0YXJ0OyBpIDwgcmFuZ2UuZW5kOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5fbGlzdC5lbGVtZW50KGkpO1xuXG5cdFx0XHRcdFx0aWYgKGNlbGw/LmNlbGxLaW5kID09PSBDZWxsS2luZC5Db2RlKSB7XG5cdFx0XHRcdFx0XHRyZXF1ZXN0cy5wdXNoKHRoaXMuX3dhcm11cENlbGwoKGNlbGwgYXMgQ29kZUNlbGxWaWV3TW9kZWwpKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHJlcXVlc3RzKTtcblx0fVxuXG5cdGFzeW5jIGZpbmQocXVlcnk6IHN0cmluZywgb3B0aW9uczogSU5vdGVib29rRmluZE9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgc2tpcFdhcm11cDogYm9vbGVhbiA9IGZhbHNlLCBzaG91bGRHZXRTZWFyY2hQcmV2aWV3SW5mbyA9IGZhbHNlLCBvd25lcklEPzogc3RyaW5nKTogUHJvbWlzZTxDZWxsRmluZE1hdGNoV2l0aEluZGV4W10+IHtcblx0XHRpZiAoIXRoaXMuX25vdGVib29rVmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0aWYgKCFvd25lcklEKSB7XG5cdFx0XHRvd25lcklEID0gdGhpcy5nZXRJZCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbmRNYXRjaGVzID0gdGhpcy5fbm90ZWJvb2tWaWV3TW9kZWwuZmluZChxdWVyeSwgb3B0aW9ucykuZmlsdGVyKG1hdGNoID0+IG1hdGNoLmxlbmd0aCA+IDApO1xuXG5cdFx0aWYgKCghb3B0aW9ucy5pbmNsdWRlTWFya3VwUHJldmlldyAmJiAhb3B0aW9ucy5pbmNsdWRlT3V0cHV0KSB8fCBvcHRpb25zLmZpbmRTY29wZT8uZmluZFNjb3BlVHlwZSA9PT0gTm90ZWJvb2tGaW5kU2NvcGVUeXBlLlRleHQpIHtcblx0XHRcdHRoaXMuX3dlYnZpZXc/LmZpbmRTdG9wKG93bmVySUQpO1xuXHRcdFx0cmV0dXJuIGZpbmRNYXRjaGVzO1xuXHRcdH1cblxuXHRcdC8vIHNlYXJjaCBpbiB3ZWJ2aWV3IGVuYWJsZWRcblxuXHRcdGNvbnN0IG1hdGNoTWFwOiB7IFtrZXk6IHN0cmluZ106IENlbGxGaW5kTWF0Y2hXaXRoSW5kZXggfSA9IHt9O1xuXHRcdGZpbmRNYXRjaGVzLmZvckVhY2gobWF0Y2ggPT4ge1xuXHRcdFx0bWF0Y2hNYXBbbWF0Y2guY2VsbC5pZF0gPSBtYXRjaDtcblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLl93ZWJ2aWV3KSB7XG5cdFx0XHQvLyByZXF1ZXN0IGFsbCBvciBzb21lIG91dHB1dHMgdG8gYmUgcmVuZGVyZWRcblx0XHRcdC8vIG1lYXN1cmUgcGVyZlxuXHRcdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdFx0aWYgKG9wdGlvbnMuZmluZFNjb3BlICYmIG9wdGlvbnMuZmluZFNjb3BlLmZpbmRTY29wZVR5cGUgPT09IE5vdGVib29rRmluZFNjb3BlVHlwZS5DZWxscyAmJiBvcHRpb25zLmZpbmRTY29wZS5zZWxlY3RlZENlbGxSYW5nZXMpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fd2FybXVwU2VsZWN0aW9uKCEhb3B0aW9ucy5pbmNsdWRlT3V0cHV0LCBvcHRpb25zLmZpbmRTY29wZS5zZWxlY3RlZENlbGxSYW5nZXMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fd2FybXVwQWxsKCEhb3B0aW9ucy5pbmNsdWRlT3V0cHV0KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVuZCA9IERhdGUubm93KCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ0ZpbmQnLCBgV2FybXVwIHRpbWU6ICR7ZW5kIC0gc3RhcnR9bXNgKTtcblxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGZpbmRJZHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRpZiAob3B0aW9ucy5maW5kU2NvcGUgJiYgb3B0aW9ucy5maW5kU2NvcGUuZmluZFNjb3BlVHlwZSA9PT0gTm90ZWJvb2tGaW5kU2NvcGVUeXBlLkNlbGxzICYmIG9wdGlvbnMuZmluZFNjb3BlLnNlbGVjdGVkQ2VsbFJhbmdlcykge1xuXHRcdFx0XHRjb25zdCBzZWxlY3RlZEluZGV4ZXMgPSBjZWxsUmFuZ2VzVG9JbmRleGVzKG9wdGlvbnMuZmluZFNjb3BlLnNlbGVjdGVkQ2VsbFJhbmdlcyk7XG5cdFx0XHRcdGZpbmRJZHMgPSBzZWxlY3RlZEluZGV4ZXMubWFwPHN0cmluZz4oaW5kZXggPT4gdGhpcy5fbm90ZWJvb2tWaWV3TW9kZWw/LnZpZXdDZWxsc1tpbmRleF0uaWQgPz8gJycpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB3ZWJ2aWV3TWF0Y2hlcyA9IGF3YWl0IHRoaXMuX3dlYnZpZXcuZmluZChxdWVyeSwgeyBjYXNlU2Vuc2l0aXZlOiBvcHRpb25zLmNhc2VTZW5zaXRpdmUsIHdob2xlV29yZDogb3B0aW9ucy53aG9sZVdvcmQsIGluY2x1ZGVNYXJrdXA6ICEhb3B0aW9ucy5pbmNsdWRlTWFya3VwUHJldmlldywgaW5jbHVkZU91dHB1dDogISFvcHRpb25zLmluY2x1ZGVPdXRwdXQsIHNob3VsZEdldFNlYXJjaFByZXZpZXdJbmZvLCBvd25lcklELCBmaW5kSWRzOiBmaW5kSWRzIH0pO1xuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBhdHRhY2ggd2VidmlldyBtYXRjaGVzIHRvIG1vZGVsIGZpbmQgbWF0Y2hlc1xuXHRcdFx0d2Vidmlld01hdGNoZXMuZm9yRWFjaChtYXRjaCA9PiB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9ub3RlYm9va1ZpZXdNb2RlbCEudmlld0NlbGxzLmZpbmQoY2VsbCA9PiBjZWxsLmlkID09PSBtYXRjaC5jZWxsSWQpO1xuXG5cdFx0XHRcdGlmICghY2VsbCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChtYXRjaC50eXBlID09PSAncHJldmlldycpIHtcblx0XHRcdFx0XHQvLyBtYXJrdXAgcHJldmlld1xuXHRcdFx0XHRcdGlmIChjZWxsLmdldEVkaXRTdGF0ZSgpID09PSBDZWxsRWRpdFN0YXRlLlByZXZpZXcgJiYgIW9wdGlvbnMuaW5jbHVkZU1hcmt1cFByZXZpZXcpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoY2VsbC5nZXRFZGl0U3RhdGUoKSA9PT0gQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nICYmIG9wdGlvbnMuaW5jbHVkZU1hcmt1cElucHV0KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmICghb3B0aW9ucy5pbmNsdWRlT3V0cHV0KSB7XG5cdFx0XHRcdFx0XHQvLyBza2lwIG91dHB1dHMgaWYgbm90IGluY2x1ZGVkXG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZXhpc2l0aW5nTWF0Y2ggPSBtYXRjaE1hcFttYXRjaC5jZWxsSWRdO1xuXG5cdFx0XHRcdGlmIChleGlzaXRpbmdNYXRjaCkge1xuXHRcdFx0XHRcdGV4aXNpdGluZ01hdGNoLndlYnZpZXdNYXRjaGVzLnB1c2gobWF0Y2gpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXG5cdFx0XHRcdFx0bWF0Y2hNYXBbbWF0Y2guY2VsbElkXSA9IG5ldyBDZWxsRmluZE1hdGNoTW9kZWwoXG5cdFx0XHRcdFx0XHR0aGlzLl9ub3RlYm9va1ZpZXdNb2RlbCEudmlld0NlbGxzLmZpbmQoY2VsbCA9PiBjZWxsLmlkID09PSBtYXRjaC5jZWxsSWQpISxcblx0XHRcdFx0XHRcdHRoaXMuX25vdGVib29rVmlld01vZGVsIS52aWV3Q2VsbHMuZmluZEluZGV4KGNlbGwgPT4gY2VsbC5pZCA9PT0gbWF0Y2guY2VsbElkKSEsXG5cdFx0XHRcdFx0XHRbXSxcblx0XHRcdFx0XHRcdFttYXRjaF1cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCByZXQ6IENlbGxGaW5kTWF0Y2hXaXRoSW5kZXhbXSA9IFtdO1xuXHRcdHRoaXMuX25vdGVib29rVmlld01vZGVsLnZpZXdDZWxscy5mb3JFYWNoKChjZWxsLCBpbmRleCkgPT4ge1xuXHRcdFx0aWYgKG1hdGNoTWFwW2NlbGwuaWRdKSB7XG5cdFx0XHRcdHJldC5wdXNoKG5ldyBDZWxsRmluZE1hdGNoTW9kZWwoY2VsbCwgaW5kZXgsIG1hdGNoTWFwW2NlbGwuaWRdLmNvbnRlbnRNYXRjaGVzLCBtYXRjaE1hcFtjZWxsLmlkXS53ZWJ2aWV3TWF0Y2hlcykpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdGFzeW5jIGZpbmRIaWdobGlnaHRDdXJyZW50KG1hdGNoSW5kZXg6IG51bWJlciwgb3duZXJJRD86IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0aWYgKCF0aGlzLl93ZWJ2aWV3KSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fd2Vidmlldz8uZmluZEhpZ2hsaWdodEN1cnJlbnQobWF0Y2hJbmRleCwgb3duZXJJRCA/PyB0aGlzLmdldElkKCkpO1xuXHR9XG5cblx0YXN5bmMgZmluZFVuSGlnaGxpZ2h0Q3VycmVudChtYXRjaEluZGV4OiBudW1iZXIsIG93bmVySUQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3dlYnZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fd2Vidmlldz8uZmluZFVuSGlnaGxpZ2h0Q3VycmVudChtYXRjaEluZGV4LCBvd25lcklEID8/IHRoaXMuZ2V0SWQoKSk7XG5cdH1cblxuXHRmaW5kU3RvcChvd25lcklEPzogc3RyaW5nKSB7XG5cdFx0dGhpcy5fd2Vidmlldz8uZmluZFN0b3Aob3duZXJJRCA/PyB0aGlzLmdldElkKCkpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIE1JU0NcblxuXHRnZXRMYXlvdXRJbmZvKCk6IE5vdGVib29rTGF5b3V0SW5mbyB7XG5cdFx0aWYgKCF0aGlzLl9saXN0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0VkaXRvciBpcyBub3QgaW5pdGFsaXplZCBzdWNjZXNzZnVsbHknKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2ZvbnRJbmZvKSB7XG5cdFx0XHR0aGlzLl9nZW5lcmF0ZUZvbnRJbmZvKCk7XG5cdFx0fVxuXG5cdFx0bGV0IGxpc3RWaWV3T2Zmc2V0ID0gMDtcblx0XHRpZiAodGhpcy5fZGltZW5zaW9uKSB7XG5cdFx0XHRsaXN0Vmlld09mZnNldCA9ICh0aGlzLl9ub3RlYm9va1RvcFRvb2xiYXI/LnVzZUdsb2JhbFRvb2xiYXIgPyAvKiogVG9vbGJhciBoZWlnaHQgKi8gMjYgOiAwKSArICh0aGlzLl9ub3RlYm9va1N0aWNreVNjcm9sbD8uZ2V0Q3VycmVudFN0aWNreUhlaWdodCgpID8/IDApO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR3aWR0aDogdGhpcy5fZGltZW5zaW9uPy53aWR0aCA/PyAwLFxuXHRcdFx0aGVpZ2h0OiB0aGlzLl9kaW1lbnNpb24/LmhlaWdodCA/PyAwLFxuXHRcdFx0c2Nyb2xsSGVpZ2h0OiB0aGlzLl9saXN0Py5nZXRTY3JvbGxIZWlnaHQoKSA/PyAwLFxuXHRcdFx0Zm9udEluZm86IHRoaXMuX2ZvbnRJbmZvISxcblx0XHRcdHN0aWNreUhlaWdodDogdGhpcy5fbm90ZWJvb2tTdGlja3lTY3JvbGw/LmdldEN1cnJlbnRTdGlja3lIZWlnaHQoKSA/PyAwLFxuXHRcdFx0bGlzdFZpZXdPZmZzZXRUb3A6IGxpc3RWaWV3T2Zmc2V0XG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZU1hcmt1cFByZXZpZXcoY2VsbDogTWFya3VwQ2VsbFZpZXdNb2RlbCkge1xuXHRcdGlmICghdGhpcy5fd2Vidmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fd2Vidmlldy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Jlc29sdmVXZWJ2aWV3KCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl93ZWJ2aWV3IHx8ICF0aGlzLl9saXN0LndlYnZpZXdFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCB8fCAhdGhpcy5fbGlzdC52aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy52aWV3TW9kZWwuZ2V0Q2VsbEluZGV4KGNlbGwpID09PSAtMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNlbGxJc0hpZGRlbihjZWxsKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdlYnZpZXdUb3AgPSBwYXJzZUludCh0aGlzLl9saXN0LndlYnZpZXdFbGVtZW50LmRvbU5vZGUuc3R5bGUudG9wLCAxMCk7XG5cdFx0Y29uc3QgdG9wID0gISF3ZWJ2aWV3VG9wID8gKDAgLSB3ZWJ2aWV3VG9wKSA6IDA7XG5cblx0XHRjb25zdCBjZWxsVG9wID0gdGhpcy5fbGlzdC5nZXRDZWxsVmlld1Njcm9sbFRvcChjZWxsKTtcblx0XHRhd2FpdCB0aGlzLl93ZWJ2aWV3LnNob3dNYXJrdXBQcmV2aWV3KHtcblx0XHRcdG1pbWU6IGNlbGwubWltZSxcblx0XHRcdGNlbGxIYW5kbGU6IGNlbGwuaGFuZGxlLFxuXHRcdFx0Y2VsbElkOiBjZWxsLmlkLFxuXHRcdFx0Y29udGVudDogY2VsbC5nZXRUZXh0KCksXG5cdFx0XHRvZmZzZXQ6IGNlbGxUb3AgKyB0b3AsXG5cdFx0XHR2aXNpYmxlOiB0cnVlLFxuXHRcdFx0bWV0YWRhdGE6IGNlbGwubWV0YWRhdGEsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNlbGxJc0hpZGRlbihjZWxsOiBJQ2VsbFZpZXdNb2RlbCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG1vZGVsSW5kZXggPSB0aGlzLnZpZXdNb2RlbCEuZ2V0Q2VsbEluZGV4KGNlbGwpO1xuXHRcdGNvbnN0IGZvbGRlZFJhbmdlcyA9IHRoaXMudmlld01vZGVsIS5nZXRIaWRkZW5SYW5nZXMoKTtcblx0XHRyZXR1cm4gZm9sZGVkUmFuZ2VzLnNvbWUocmFuZ2UgPT4gbW9kZWxJbmRleCA+PSByYW5nZS5zdGFydCAmJiBtb2RlbEluZGV4IDw9IHJhbmdlLmVuZCk7XG5cdH1cblxuXHRhc3luYyB1bmhpZGVNYXJrdXBQcmV2aWV3cyhjZWxsczogcmVhZG9ubHkgTWFya3VwQ2VsbFZpZXdNb2RlbFtdKSB7XG5cdFx0aWYgKCF0aGlzLl93ZWJ2aWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl93ZWJ2aWV3LmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZVdlYnZpZXcoKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl93ZWJ2aWV3Py51bmhpZGVNYXJrdXBQcmV2aWV3cyhjZWxscy5tYXAoY2VsbCA9PiBjZWxsLmlkKSk7XG5cdH1cblxuXHRhc3luYyBoaWRlTWFya3VwUHJldmlld3MoY2VsbHM6IHJlYWRvbmx5IE1hcmt1cENlbGxWaWV3TW9kZWxbXSkge1xuXHRcdGlmICghdGhpcy5fd2VidmlldyB8fCAhY2VsbHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl93ZWJ2aWV3LmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZVdlYnZpZXcoKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl93ZWJ2aWV3Py5oaWRlTWFya3VwUHJldmlld3MoY2VsbHMubWFwKGNlbGwgPT4gY2VsbC5pZCkpO1xuXHR9XG5cblx0YXN5bmMgZGVsZXRlTWFya3VwUHJldmlld3MoY2VsbHM6IHJlYWRvbmx5IE1hcmt1cENlbGxWaWV3TW9kZWxbXSkge1xuXHRcdGlmICghdGhpcy5fd2Vidmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fd2Vidmlldy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Jlc29sdmVXZWJ2aWV3KCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fd2Vidmlldz8uZGVsZXRlTWFya3VwUHJldmlld3MoY2VsbHMubWFwKGNlbGwgPT4gY2VsbC5pZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVTZWxlY3RlZE1hcmtkb3duUHJldmlld3MoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl93ZWJ2aWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl93ZWJ2aWV3LmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZVdlYnZpZXcoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3RlZENlbGxzID0gdGhpcy5nZXRTZWxlY3Rpb25WaWV3TW9kZWxzKCkubWFwKGNlbGwgPT4gY2VsbC5pZCk7XG5cblx0XHQvLyBPbmx5IHNob3cgc2VsZWN0aW9uIHdoZW4gdGhlcmUgaXMgbW9yZSB0aGFuIDEgY2VsbCBzZWxlY3RlZFxuXHRcdGF3YWl0IHRoaXMuX3dlYnZpZXc/LnVwZGF0ZU1hcmt1cFByZXZpZXdTZWxlY3Rpb25zKHNlbGVjdGVkQ2VsbHMubGVuZ3RoID4gMSA/IHNlbGVjdGVkQ2VsbHMgOiBbXSk7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVPdXRwdXQoY2VsbDogQ29kZUNlbGxWaWV3TW9kZWwsIG91dHB1dDogSUluc2V0UmVuZGVyT3V0cHV0LCBvZmZzZXQ6IG51bWJlciwgY3JlYXRlV2hlbklkbGU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9pbnNldE1vZGlmeVF1ZXVlQnlPdXRwdXRJZC5xdWV1ZShvdXRwdXQuc291cmNlLm1vZGVsLm91dHB1dElkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCB8fCAhdGhpcy5fd2Vidmlldykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fd2Vidmlldy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZVdlYnZpZXcoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLl93ZWJ2aWV3KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLl9saXN0LndlYnZpZXdFbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG91dHB1dC50eXBlID09PSBSZW5kZXJPdXRwdXRUeXBlLkV4dGVuc2lvbikge1xuXHRcdFx0XHR0aGlzLm5vdGVib29rUmVuZGVyZXJNZXNzYWdpbmcucHJlcGFyZShvdXRwdXQucmVuZGVyZXIuaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB3ZWJ2aWV3VG9wID0gcGFyc2VJbnQodGhpcy5fbGlzdC53ZWJ2aWV3RWxlbWVudC5kb21Ob2RlLnN0eWxlLnRvcCwgMTApO1xuXHRcdFx0Y29uc3QgdG9wID0gISF3ZWJ2aWV3VG9wID8gKDAgLSB3ZWJ2aWV3VG9wKSA6IDA7XG5cblx0XHRcdGNvbnN0IGNlbGxUb3AgPSB0aGlzLl9saXN0LmdldENlbGxWaWV3U2Nyb2xsVG9wKGNlbGwpICsgdG9wO1xuXG5cdFx0XHRjb25zdCBleGlzdGluZ091dHB1dCA9IHRoaXMuX3dlYnZpZXcuaW5zZXRNYXBwaW5nLmdldChvdXRwdXQuc291cmNlKTtcblx0XHRcdGlmICghZXhpc3RpbmdPdXRwdXRcblx0XHRcdFx0fHwgKCFleGlzdGluZ091dHB1dC5yZW5kZXJlciAmJiBvdXRwdXQudHlwZSA9PT0gUmVuZGVyT3V0cHV0VHlwZS5FeHRlbnNpb24pXG5cdFx0XHQpIHtcblx0XHRcdFx0aWYgKGNyZWF0ZVdoZW5JZGxlKSB7XG5cdFx0XHRcdFx0dGhpcy5fd2Vidmlldy5yZXF1ZXN0Q3JlYXRlT3V0cHV0V2hlbldlYnZpZXdJZGxlKHsgY2VsbElkOiBjZWxsLmlkLCBjZWxsSGFuZGxlOiBjZWxsLmhhbmRsZSwgY2VsbFVyaTogY2VsbC51cmksIGV4ZWN1dGlvbklkOiBjZWxsLmludGVybmFsTWV0YWRhdGEuZXhlY3V0aW9uSWQgfSwgb3V0cHV0LCBjZWxsVG9wLCBvZmZzZXQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3dlYnZpZXcuY3JlYXRlT3V0cHV0KHsgY2VsbElkOiBjZWxsLmlkLCBjZWxsSGFuZGxlOiBjZWxsLmhhbmRsZSwgY2VsbFVyaTogY2VsbC51cmksIGV4ZWN1dGlvbklkOiBjZWxsLmludGVybmFsTWV0YWRhdGEuZXhlY3V0aW9uSWQgfSwgb3V0cHV0LCBjZWxsVG9wLCBvZmZzZXQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGV4aXN0aW5nT3V0cHV0LnJlbmRlcmVyXG5cdFx0XHRcdCYmIG91dHB1dC50eXBlID09PSBSZW5kZXJPdXRwdXRUeXBlLkV4dGVuc2lvblxuXHRcdFx0XHQmJiBleGlzdGluZ091dHB1dC5yZW5kZXJlci5pZCAhPT0gb3V0cHV0LnJlbmRlcmVyLmlkKSB7XG5cdFx0XHRcdC8vIHN3aXRjaCBtaW1ldHlwZVxuXHRcdFx0XHR0aGlzLl93ZWJ2aWV3LnJlbW92ZUluc2V0cyhbb3V0cHV0LnNvdXJjZV0pO1xuXHRcdFx0XHR0aGlzLl93ZWJ2aWV3LmNyZWF0ZU91dHB1dCh7IGNlbGxJZDogY2VsbC5pZCwgY2VsbEhhbmRsZTogY2VsbC5oYW5kbGUsIGNlbGxVcmk6IGNlbGwudXJpIH0sIG91dHB1dCwgY2VsbFRvcCwgb2Zmc2V0KTtcblx0XHRcdH0gZWxzZSBpZiAoZXhpc3RpbmdPdXRwdXQudmVyc2lvbklkICE9PSBvdXRwdXQuc291cmNlLm1vZGVsLnZlcnNpb25JZCkge1xuXHRcdFx0XHR0aGlzLl93ZWJ2aWV3LnVwZGF0ZU91dHB1dCh7IGNlbGxJZDogY2VsbC5pZCwgY2VsbEhhbmRsZTogY2VsbC5oYW5kbGUsIGNlbGxVcmk6IGNlbGwudXJpLCBleGVjdXRpb25JZDogY2VsbC5pbnRlcm5hbE1ldGFkYXRhLmV4ZWN1dGlvbklkIH0sIG91dHB1dCwgY2VsbFRvcCwgb2Zmc2V0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG91dHB1dEluZGV4ID0gY2VsbC5vdXRwdXRzVmlld01vZGVscy5pbmRleE9mKG91dHB1dC5zb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBvdXRwdXRPZmZzZXQgPSBjZWxsLmdldE91dHB1dE9mZnNldChvdXRwdXRJbmRleCk7XG5cdFx0XHRcdHRoaXMuX3dlYnZpZXcudXBkYXRlU2Nyb2xsVG9wcyhbe1xuXHRcdFx0XHRcdGNlbGwsXG5cdFx0XHRcdFx0b3V0cHV0OiBvdXRwdXQuc291cmNlLFxuXHRcdFx0XHRcdGNlbGxUb3AsXG5cdFx0XHRcdFx0b3V0cHV0T2Zmc2V0LFxuXHRcdFx0XHRcdGZvcmNlRGlzcGxheTogIWNlbGwuaXNPdXRwdXRDb2xsYXBzZWQsXG5cdFx0XHRcdH1dLCBbXSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVPdXRwdXQoY2VsbDogQ29kZUNlbGxWaWV3TW9kZWwsIG91dHB1dDogSUluc2V0UmVuZGVyT3V0cHV0LCBvZmZzZXQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2luc2V0TW9kaWZ5UXVldWVCeU91dHB1dElkLnF1ZXVlKG91dHB1dC5zb3VyY2UubW9kZWwub3V0cHV0SWQsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkIHx8ICF0aGlzLl93ZWJ2aWV3IHx8IGNlbGwuaXNPdXRwdXRDb2xsYXBzZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX3dlYnZpZXcuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Jlc29sdmVXZWJ2aWV3KCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fd2VidmlldyB8fCAhdGhpcy5fbGlzdC53ZWJ2aWV3RWxlbWVudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fd2Vidmlldy5pbnNldE1hcHBpbmcuaGFzKG91dHB1dC5zb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZU91dHB1dChjZWxsLCBvdXRwdXQsIG9mZnNldCwgZmFsc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob3V0cHV0LnR5cGUgPT09IFJlbmRlck91dHB1dFR5cGUuRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdHRoaXMubm90ZWJvb2tSZW5kZXJlck1lc3NhZ2luZy5wcmVwYXJlKG91dHB1dC5yZW5kZXJlci5pZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdlYnZpZXdUb3AgPSBwYXJzZUludCh0aGlzLl9saXN0LndlYnZpZXdFbGVtZW50LmRvbU5vZGUuc3R5bGUudG9wLCAxMCk7XG5cdFx0XHRjb25zdCB0b3AgPSAhIXdlYnZpZXdUb3AgPyAoMCAtIHdlYnZpZXdUb3ApIDogMDtcblxuXHRcdFx0Y29uc3QgY2VsbFRvcCA9IHRoaXMuX2xpc3QuZ2V0Q2VsbFZpZXdTY3JvbGxUb3AoY2VsbCkgKyB0b3A7XG5cdFx0XHR0aGlzLl93ZWJ2aWV3LnVwZGF0ZU91dHB1dCh7IGNlbGxJZDogY2VsbC5pZCwgY2VsbEhhbmRsZTogY2VsbC5oYW5kbGUsIGNlbGxVcmk6IGNlbGwudXJpIH0sIG91dHB1dCwgY2VsbFRvcCwgb2Zmc2V0KTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGNvcHlPdXRwdXRJbWFnZShjZWxsT3V0cHV0OiBJQ2VsbE91dHB1dFZpZXdNb2RlbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3dlYnZpZXc/LmNvcHlJbWFnZShjZWxsT3V0cHV0KTtcblx0fVxuXG5cdHJlbW92ZUluc2V0KG91dHB1dDogSUNlbGxPdXRwdXRWaWV3TW9kZWwpIHtcblx0XHR0aGlzLl9pbnNldE1vZGlmeVF1ZXVlQnlPdXRwdXRJZC5xdWV1ZShvdXRwdXQubW9kZWwub3V0cHV0SWQsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkIHx8ICF0aGlzLl93ZWJ2aWV3KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX3dlYnZpZXc/LmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0XHR0aGlzLl93ZWJ2aWV3LnJlbW92ZUluc2V0cyhbb3V0cHV0XSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX29uRGlkUmVtb3ZlT3V0cHV0LmZpcmUob3V0cHV0KTtcblx0XHR9KTtcblx0fVxuXG5cdGhpZGVJbnNldChvdXRwdXQ6IElDZWxsT3V0cHV0Vmlld01vZGVsKSB7XG5cdFx0dGhpcy5faW5zZXRNb2RpZnlRdWV1ZUJ5T3V0cHV0SWQucXVldWUob3V0cHV0Lm1vZGVsLm91dHB1dElkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCB8fCAhdGhpcy5fd2Vidmlldykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl93ZWJ2aWV3Py5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdFx0dGhpcy5fd2Vidmlldy5oaWRlSW5zZXQob3V0cHV0KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8vI3JlZ2lvbiAtLS0gd2VidmlldyBJUEMgLS0tLVxuXHRwb3N0TWVzc2FnZShtZXNzYWdlOiB1bmtub3duKSB7XG5cdFx0aWYgKHRoaXMuX3dlYnZpZXc/LmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0dGhpcy5fd2Vidmlldy5wb3N0S2VybmVsTWVzc2FnZShtZXNzYWdlKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRhZGRDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9vdmVybGF5Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoY2xhc3NOYW1lKTtcblx0fVxuXG5cdHJlbW92ZUNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZykge1xuXHRcdHRoaXMuX292ZXJsYXlDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShjbGFzc05hbWUpO1xuXHR9XG5cblx0Y2VsbEF0KGluZGV4OiBudW1iZXIpOiBJQ2VsbFZpZXdNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsPy5jZWxsQXQoaW5kZXgpO1xuXHR9XG5cblx0Z2V0Q2VsbEJ5SW5mbyhjZWxsSW5mbzogSUNvbW1vbkNlbGxJbmZvKTogSUNlbGxWaWV3TW9kZWwge1xuXHRcdGNvbnN0IHsgY2VsbEhhbmRsZSB9ID0gY2VsbEluZm87XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsPy52aWV3Q2VsbHMuZmluZCh2YyA9PiB2Yy5oYW5kbGUgPT09IGNlbGxIYW5kbGUpIGFzIENvZGVDZWxsVmlld01vZGVsO1xuXHR9XG5cblx0Z2V0Q2VsbEJ5SGFuZGxlKGhhbmRsZTogbnVtYmVyKTogSUNlbGxWaWV3TW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbD8uZ2V0Q2VsbEJ5SGFuZGxlKGhhbmRsZSk7XG5cdH1cblxuXHRnZXRDZWxsSW5kZXgoY2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWw/LmdldENlbGxJbmRleEJ5SGFuZGxlKGNlbGwuaGFuZGxlKTtcblx0fVxuXG5cdGdldE5leHRWaXNpYmxlQ2VsbEluZGV4KGluZGV4OiBudW1iZXIpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbD8uZ2V0TmV4dFZpc2libGVDZWxsSW5kZXgoaW5kZXgpO1xuXHR9XG5cblx0Z2V0UHJldmlvdXNWaXNpYmxlQ2VsbEluZGV4KGluZGV4OiBudW1iZXIpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbD8uZ2V0UHJldmlvdXNWaXNpYmxlQ2VsbEluZGV4KGluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVNjcm9sbEhlaWdodCgpIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCB8fCAhdGhpcy5fd2Vidmlldz8uaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9saXN0LndlYnZpZXdFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Nyb2xsSGVpZ2h0ID0gdGhpcy5fbGlzdC5zY3JvbGxIZWlnaHQ7XG5cdFx0dGhpcy5fd2Vidmlldy5lbGVtZW50LnN0eWxlLmhlaWdodCA9IGAke3Njcm9sbEhlaWdodCArIE5PVEVCT09LX1dFQlZJRVdfQk9VTkRBUlkgKiAyfXB4YDtcblxuXHRcdGNvbnN0IHdlYnZpZXdUb3AgPSBwYXJzZUludCh0aGlzLl9saXN0LndlYnZpZXdFbGVtZW50LmRvbU5vZGUuc3R5bGUudG9wLCAxMCk7XG5cdFx0Y29uc3QgdG9wID0gISF3ZWJ2aWV3VG9wID8gKDAgLSB3ZWJ2aWV3VG9wKSA6IDA7XG5cblx0XHRjb25zdCB1cGRhdGVJdGVtczogSURpc3BsYXlPdXRwdXRMYXlvdXRVcGRhdGVSZXF1ZXN0W10gPSBbXTtcblx0XHRjb25zdCByZW1vdmVkSXRlbXM6IElDZWxsT3V0cHV0Vmlld01vZGVsW10gPSBbXTtcblx0XHR0aGlzLl93ZWJ2aWV3Py5pbnNldE1hcHBpbmcuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMudmlld01vZGVsPy5nZXRDZWxsQnlIYW5kbGUodmFsdWUuY2VsbEluZm8uY2VsbEhhbmRsZSk7XG5cdFx0XHRpZiAoIWNlbGwgfHwgIShjZWxsIGluc3RhbmNlb2YgQ29kZUNlbGxWaWV3TW9kZWwpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgdmlld0luZGV4ID0gdGhpcy5fbGlzdC5nZXRWaWV3SW5kZXgoY2VsbCk7XG5cblx0XHRcdGlmICh2aWV3SW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG91dHB1dEluZGV4ID0gY2VsbC5vdXRwdXRzVmlld01vZGVscy5pbmRleE9mKGtleSk7XG5cdFx0XHRpZiAob3V0cHV0SW5kZXggPCAwKSB7XG5cdFx0XHRcdC8vIG91dHB1dCBpcyBhbHJlYWR5IGdvbmVcblx0XHRcdFx0cmVtb3ZlZEl0ZW1zLnB1c2goa2V5KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjZWxsVG9wID0gdGhpcy5fbGlzdC5nZXRDZWxsVmlld1Njcm9sbFRvcChjZWxsKTtcblx0XHRcdGNvbnN0IG91dHB1dE9mZnNldCA9IGNlbGwuZ2V0T3V0cHV0T2Zmc2V0KG91dHB1dEluZGV4KTtcblx0XHRcdHVwZGF0ZUl0ZW1zLnB1c2goe1xuXHRcdFx0XHRjZWxsLFxuXHRcdFx0XHRvdXRwdXQ6IGtleSxcblx0XHRcdFx0Y2VsbFRvcDogY2VsbFRvcCArIHRvcCxcblx0XHRcdFx0b3V0cHV0T2Zmc2V0LFxuXHRcdFx0XHRmb3JjZURpc3BsYXk6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl93ZWJ2aWV3LnJlbW92ZUluc2V0cyhyZW1vdmVkSXRlbXMpO1xuXG5cdFx0Y29uc3QgbWFya2Rvd25VcGRhdGVJdGVtczogeyBpZDogc3RyaW5nOyB0b3A6IG51bWJlciB9W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNlbGxJZCBvZiB0aGlzLl93ZWJ2aWV3Lm1hcmt1cFByZXZpZXdNYXBwaW5nLmtleXMoKSkge1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMudmlld01vZGVsPy52aWV3Q2VsbHMuZmluZChjZWxsID0+IGNlbGwuaWQgPT09IGNlbGxJZCk7XG5cdFx0XHRpZiAoY2VsbCkge1xuXHRcdFx0XHRjb25zdCBjZWxsVG9wID0gdGhpcy5fbGlzdC5nZXRDZWxsVmlld1Njcm9sbFRvcChjZWxsKTtcblx0XHRcdFx0Ly8gbWFya2Rvd25VcGRhdGVJdGVtcy5wdXNoKHsgaWQ6IGNlbGxJZCwgdG9wOiBjZWxsVG9wIH0pO1xuXHRcdFx0XHRtYXJrZG93blVwZGF0ZUl0ZW1zLnB1c2goeyBpZDogY2VsbElkLCB0b3A6IGNlbGxUb3AgKyB0b3AgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG1hcmtkb3duVXBkYXRlSXRlbXMubGVuZ3RoIHx8IHVwZGF0ZUl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fZGVidWcoJ19saXN0Lm9uRGlkQ2hhbmdlQ29udGVudEhlaWdodC9tYXJrZG93bicsIG1hcmtkb3duVXBkYXRlSXRlbXMpO1xuXHRcdFx0dGhpcy5fd2Vidmlldz8udXBkYXRlU2Nyb2xsVG9wcyh1cGRhdGVJdGVtcywgbWFya2Rvd25VcGRhdGVJdGVtcyk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEJhY2tsYXllcldlYnZpZXcgZGVsZWdhdGVcblx0cHJpdmF0ZSBfdXBkYXRlT3V0cHV0SGVpZ2h0KGNlbGxJbmZvOiBJQ29tbW9uQ2VsbEluZm8sIG91dHB1dDogSUNlbGxPdXRwdXRWaWV3TW9kZWwsIG91dHB1dEhlaWdodDogbnVtYmVyLCBpc0luaXQ6IGJvb2xlYW4sIHNvdXJjZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLnZpZXdNb2RlbD8udmlld0NlbGxzLmZpbmQodmMgPT4gdmMuaGFuZGxlID09PSBjZWxsSW5mby5jZWxsSGFuZGxlKTtcblx0XHRpZiAoY2VsbCAmJiBjZWxsIGluc3RhbmNlb2YgQ29kZUNlbGxWaWV3TW9kZWwpIHtcblx0XHRcdGNvbnN0IG91dHB1dEluZGV4ID0gY2VsbC5vdXRwdXRzVmlld01vZGVscy5pbmRleE9mKG91dHB1dCk7XG5cdFx0XHRpZiAob3V0cHV0SW5kZXggPiAtMSkge1xuXHRcdFx0XHR0aGlzLl9kZWJ1ZygndXBkYXRlIGNlbGwgb3V0cHV0JywgY2VsbC5oYW5kbGUsIG91dHB1dEhlaWdodCk7XG5cdFx0XHRcdGNlbGwudXBkYXRlT3V0cHV0SGVpZ2h0KG91dHB1dEluZGV4LCBvdXRwdXRIZWlnaHQsIHNvdXJjZSk7XG5cdFx0XHRcdHRoaXMubGF5b3V0Tm90ZWJvb2tDZWxsKGNlbGwsIGNlbGwubGF5b3V0SW5mby50b3RhbEhlaWdodCk7XG5cblx0XHRcdFx0aWYgKGlzSW5pdCkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkUmVuZGVyT3V0cHV0LmZpcmUob3V0cHV0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZGVidWcoJ3RyaWVkIHRvIHVwZGF0ZSBjZWxsIG91dHB1dCB0aGF0IGRvZXMgbm90IGV4aXN0Jyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ091dHB1dEhlaWdodEFja3MgPSBuZXcgTWFwPC8qIG91dHB1dElkICovIHN0cmluZywgSUFja091dHB1dEhlaWdodD4oKTtcblxuXHRwcml2YXRlIF9zY2hlZHVsZU91dHB1dEhlaWdodEFjayhjZWxsSW5mbzogSUNvbW1vbkNlbGxJbmZvLCBvdXRwdXRJZDogc3RyaW5nLCBoZWlnaHQ6IG51bWJlcikge1xuXHRcdGNvbnN0IHdhc0VtcHR5ID0gdGhpcy5fcGVuZGluZ091dHB1dEhlaWdodEFja3Muc2l6ZSA9PT0gMDtcblx0XHR0aGlzLl9wZW5kaW5nT3V0cHV0SGVpZ2h0QWNrcy5zZXQob3V0cHV0SWQsIHsgY2VsbElkOiBjZWxsSW5mby5jZWxsSWQsIG91dHB1dElkLCBoZWlnaHQgfSk7XG5cblx0XHRpZiAod2FzRW1wdHkpIHtcblx0XHRcdERPTS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKERPTS5nZXRXaW5kb3codGhpcy5nZXREb21Ob2RlKCkpLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2RlYnVnKCdhY2sgaGVpZ2h0Jyk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVNjcm9sbEhlaWdodCgpO1xuXG5cdFx0XHRcdHRoaXMuX3dlYnZpZXc/LmFja0hlaWdodChbLi4udGhpcy5fcGVuZGluZ091dHB1dEhlaWdodEFja3MudmFsdWVzKCldKTtcblxuXHRcdFx0XHR0aGlzLl9wZW5kaW5nT3V0cHV0SGVpZ2h0QWNrcy5jbGVhcigpO1xuXHRcdFx0fSwgLTEpOyAvLyAtMSBwcmlvcml0eSBiZWNhdXNlIHRoaXMgZGVwZW5kcyBvbiBjYWxscyB0byBsYXlvdXROb3RlYm9va0NlbGwsIGFuZCB0aGF0IG1heSBiZSBjYWxsZWQgbXVsdGlwbGUgdGltZXMgYmVmb3JlIHRoaXMgcnVuc1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldENlbGxCeUlkKGNlbGxJZDogc3RyaW5nKTogSUNlbGxWaWV3TW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbD8udmlld0NlbGxzLmZpbmQodmMgPT4gdmMuaWQgPT09IGNlbGxJZCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVNYXJrdXBDZWxsSGVpZ2h0KGNlbGxJZDogc3RyaW5nLCBoZWlnaHQ6IG51bWJlciwgaXNJbml0OiBib29sZWFuKSB7XG5cdFx0Y29uc3QgY2VsbCA9IHRoaXMuX2dldENlbGxCeUlkKGNlbGxJZCk7XG5cdFx0aWYgKGNlbGwgJiYgY2VsbCBpbnN0YW5jZW9mIE1hcmt1cENlbGxWaWV3TW9kZWwpIHtcblx0XHRcdGNvbnN0IHsgYm90dG9tVG9vbGJhckdhcCB9ID0gdGhpcy5fbm90ZWJvb2tPcHRpb25zLmNvbXB1dGVCb3R0b21Ub29sYmFyRGltZW5zaW9ucyh0aGlzLnZpZXdNb2RlbD8udmlld1R5cGUpO1xuXHRcdFx0dGhpcy5fZGVidWcoJ3VwZGF0ZU1hcmtkb3duQ2VsbEhlaWdodCcsIGNlbGwuaGFuZGxlLCBoZWlnaHQgKyBib3R0b21Ub29sYmFyR2FwLCBpc0luaXQpO1xuXHRcdFx0Y2VsbC5yZW5kZXJlZE1hcmtkb3duSGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldE1hcmt1cENlbGxFZGl0U3RhdGUoY2VsbElkOiBzdHJpbmcsIGVkaXRTdGF0ZTogQ2VsbEVkaXRTdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9nZXRDZWxsQnlJZChjZWxsSWQpO1xuXHRcdGlmIChjZWxsIGluc3RhbmNlb2YgTWFya3VwQ2VsbFZpZXdNb2RlbCkge1xuXHRcdFx0dGhpcy5yZXZlYWxJblZpZXcoY2VsbCk7XG5cdFx0XHRjZWxsLnVwZGF0ZUVkaXRTdGF0ZShlZGl0U3RhdGUsICdzZXRNYXJrZG93bkNlbGxFZGl0U3RhdGUnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kaWRTdGFydERyYWdNYXJrdXBDZWxsKGNlbGxJZDogc3RyaW5nLCBldmVudDogeyBkcmFnT2Zmc2V0WTogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHRjb25zdCBjZWxsID0gdGhpcy5fZ2V0Q2VsbEJ5SWQoY2VsbElkKTtcblx0XHRpZiAoY2VsbCBpbnN0YW5jZW9mIE1hcmt1cENlbGxWaWV3TW9kZWwpIHtcblx0XHRcdGNvbnN0IHdlYnZpZXdPZmZzZXQgPSB0aGlzLl9saXN0LndlYnZpZXdFbGVtZW50ID8gLXBhcnNlSW50KHRoaXMuX2xpc3Qud2Vidmlld0VsZW1lbnQuZG9tTm9kZS5zdHlsZS50b3AsIDEwKSA6IDA7XG5cdFx0XHR0aGlzLl9kbmRDb250cm9sbGVyPy5zdGFydEV4cGxpY2l0RHJhZyhjZWxsLCBldmVudC5kcmFnT2Zmc2V0WSAtIHdlYnZpZXdPZmZzZXQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RpZERyYWdNYXJrdXBDZWxsKGNlbGxJZDogc3RyaW5nLCBldmVudDogeyBkcmFnT2Zmc2V0WTogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHRjb25zdCBjZWxsID0gdGhpcy5fZ2V0Q2VsbEJ5SWQoY2VsbElkKTtcblx0XHRpZiAoY2VsbCBpbnN0YW5jZW9mIE1hcmt1cENlbGxWaWV3TW9kZWwpIHtcblx0XHRcdGNvbnN0IHdlYnZpZXdPZmZzZXQgPSB0aGlzLl9saXN0LndlYnZpZXdFbGVtZW50ID8gLXBhcnNlSW50KHRoaXMuX2xpc3Qud2Vidmlld0VsZW1lbnQuZG9tTm9kZS5zdHlsZS50b3AsIDEwKSA6IDA7XG5cdFx0XHR0aGlzLl9kbmRDb250cm9sbGVyPy5leHBsaWNpdERyYWcoY2VsbCwgZXZlbnQuZHJhZ09mZnNldFkgLSB3ZWJ2aWV3T2Zmc2V0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kaWREcm9wTWFya3VwQ2VsbChjZWxsSWQ6IHN0cmluZywgZXZlbnQ6IHsgZHJhZ09mZnNldFk6IG51bWJlcjsgY3RybEtleTogYm9vbGVhbjsgYWx0S2V5OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHRjb25zdCBjZWxsID0gdGhpcy5fZ2V0Q2VsbEJ5SWQoY2VsbElkKTtcblx0XHRpZiAoY2VsbCBpbnN0YW5jZW9mIE1hcmt1cENlbGxWaWV3TW9kZWwpIHtcblx0XHRcdGNvbnN0IHdlYnZpZXdPZmZzZXQgPSB0aGlzLl9saXN0LndlYnZpZXdFbGVtZW50ID8gLXBhcnNlSW50KHRoaXMuX2xpc3Qud2Vidmlld0VsZW1lbnQuZG9tTm9kZS5zdHlsZS50b3AsIDEwKSA6IDA7XG5cdFx0XHRldmVudC5kcmFnT2Zmc2V0WSAtPSB3ZWJ2aWV3T2Zmc2V0O1xuXHRcdFx0dGhpcy5fZG5kQ29udHJvbGxlcj8uZXhwbGljaXREcm9wKGNlbGwsIGV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kaWRFbmREcmFnTWFya3VwQ2VsbChjZWxsSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9nZXRDZWxsQnlJZChjZWxsSWQpO1xuXHRcdGlmIChjZWxsIGluc3RhbmNlb2YgTWFya3VwQ2VsbFZpZXdNb2RlbCkge1xuXHRcdFx0dGhpcy5fZG5kQ29udHJvbGxlcj8uZW5kRXhwbGljaXREcmFnKGNlbGwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RpZFJlc2l6ZU91dHB1dChjZWxsSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9nZXRDZWxsQnlJZChjZWxsSWQpO1xuXHRcdGlmIChjZWxsKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFJlc2l6ZU91dHB1dEVtaXR0ZXIuZmlyZShjZWxsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVQZXJmb3JtYW5jZU1ldGFkYXRhKGNlbGxJZDogc3RyaW5nLCBleGVjdXRpb25JZDogc3RyaW5nLCBkdXJhdGlvbjogbnVtYmVyLCByZW5kZXJlcklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9nZXRDZWxsQnlJZChjZWxsSWQpO1xuXHRcdGNvbnN0IGNlbGxJbmRleCA9ICFjZWxsID8gdW5kZWZpbmVkIDogdGhpcy5nZXRDZWxsSW5kZXgoY2VsbCk7XG5cdFx0aWYgKGNlbGw/LmludGVybmFsTWV0YWRhdGEuZXhlY3V0aW9uSWQgPT09IGV4ZWN1dGlvbklkICYmIGNlbGxJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCByZW5kZXJEdXJhdGlvbk1hcCA9IGNlbGwuaW50ZXJuYWxNZXRhZGF0YS5yZW5kZXJEdXJhdGlvbiB8fCB7fTtcblx0XHRcdHJlbmRlckR1cmF0aW9uTWFwW3JlbmRlcmVySWRdID0gKHJlbmRlckR1cmF0aW9uTWFwW3JlbmRlcmVySWRdID8/IDApICsgZHVyYXRpb247XG5cblx0XHRcdHRoaXMudGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5QYXJ0aWFsSW50ZXJuYWxNZXRhZGF0YSxcblx0XHRcdFx0XHRpbmRleDogY2VsbEluZGV4LFxuXHRcdFx0XHRcdGludGVybmFsTWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdGV4ZWN1dGlvbklkOiBleGVjdXRpb25JZCxcblx0XHRcdFx0XHRcdHJlbmRlckR1cmF0aW9uOiByZW5kZXJEdXJhdGlvbk1hcFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEVkaXRvciBDb250cmlidXRpb25zXG5cdGdldENvbnRyaWJ1dGlvbjxUIGV4dGVuZHMgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uPihpZDogc3RyaW5nKTogVCB7XG5cdFx0cmV0dXJuIDxUPih0aGlzLl9jb250cmlidXRpb25zLmdldChpZCkgfHwgbnVsbCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdC8vIGRpc3Bvc2Ugd2VidmlldyBmaXJzdFxuXHRcdHRoaXMuX3dlYnZpZXc/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl93ZWJ2aWV3ID0gbnVsbDtcblxuXHRcdHRoaXMubm90ZWJvb2tFZGl0b3JTZXJ2aWNlLnJlbW92ZU5vdGVib29rRWRpdG9yKHRoaXMpO1xuXHRcdGRpc3Bvc2UodGhpcy5fY29udHJpYnV0aW9ucy52YWx1ZXMoKSk7XG5cdFx0dGhpcy5fY29udHJpYnV0aW9ucy5jbGVhcigpO1xuXG5cdFx0dGhpcy5fbG9jYWxTdG9yZS5jbGVhcigpO1xuXHRcdGRpc3Bvc2UodGhpcy5fbG9jYWxDZWxsU3RhdGVMaXN0ZW5lcnMpO1xuXHRcdHRoaXMuX2xpc3QuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2NlbGxMYXlvdXRNYW5hZ2VyPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fbGlzdFRvcENlbGxUb29sYmFyPy5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9vdmVybGF5Q29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdHRoaXMudmlld01vZGVsPy5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9yZW5kZXJlZEVkaXRvcnMuY2xlYXIoKTtcblx0XHR0aGlzLl9iYXNlQ2VsbEVkaXRvck9wdGlvbnMuZm9yRWFjaCh2ID0+IHYuZGlzcG9zZSgpKTtcblx0XHR0aGlzLl9iYXNlQ2VsbEVkaXRvck9wdGlvbnMuY2xlYXIoKTtcblxuXHRcdHRoaXMuX25vdGVib29rT3ZlcnZpZXdSdWxlckNvbnRhaW5lci5yZW1vdmUoKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdC8vIHVucmVmXG5cdFx0dGhpcy5fd2VidmlldyA9IG51bGw7XG5cdFx0dGhpcy5fd2Vidmlld1Jlc29sdmVQcm9taXNlID0gbnVsbDtcblx0XHR0aGlzLl93ZWJ2aWV3VHJhbnNwYXJlbnRDb3ZlciA9IG51bGw7XG5cdFx0dGhpcy5fZG5kQ29udHJvbGxlciA9IG51bGw7XG5cdFx0dGhpcy5fbGlzdFRvcENlbGxUb29sYmFyID0gbnVsbDtcblx0XHR0aGlzLl9ub3RlYm9va1ZpZXdNb2RlbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jZWxsQ29udGV4dEtleU1hbmFnZXIgPSBudWxsO1xuXHRcdHRoaXMuX25vdGVib29rVG9wVG9vbGJhciA9IG51bGwhO1xuXHRcdHRoaXMuX2xpc3QgPSBudWxsITtcblx0XHR0aGlzLl9saXN0Vmlld0luZm9BY2Nlc3NvciA9IG51bGwhO1xuXHRcdHRoaXMuX2xpc3REZWxlZ2F0ZSA9IG51bGw7XG5cdH1cblxuXHR0b0pTT04oKTogeyBub3RlYm9va1VyaTogVVJJIHwgdW5kZWZpbmVkIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRub3RlYm9va1VyaTogdGhpcy52aWV3TW9kZWw/LnVyaSxcblx0XHR9O1xuXHR9XG59XG5cbnJlZ2lzdGVyWkluZGV4KFpJbmRleC5CYXNlLCA1LCAnbm90ZWJvb2stcHJvZ3Jlc3MtYmFyJywpO1xucmVnaXN0ZXJaSW5kZXgoWkluZGV4LkJhc2UsIDEwLCAnbm90ZWJvb2stbGlzdC1pbnNlcnRpb24taW5kaWNhdG9yJyk7XG5yZWdpc3RlclpJbmRleChaSW5kZXguQmFzZSwgMjAsICdub3RlYm9vay1jZWxsLWVkaXRvci1vdXRsaW5lJyk7XG5yZWdpc3RlclpJbmRleChaSW5kZXguQmFzZSwgMjUsICdub3RlYm9vay1zY3JvbGxiYXInKTtcbnJlZ2lzdGVyWkluZGV4KFpJbmRleC5CYXNlLCAyNiwgJ25vdGVib29rLWNlbGwtc3RhdHVzJyk7XG5yZWdpc3RlclpJbmRleChaSW5kZXguQmFzZSwgMjYsICdub3RlYm9vay1mb2xkaW5nLWluZGljYXRvcicpO1xucmVnaXN0ZXJaSW5kZXgoWkluZGV4LkJhc2UsIDI3LCAnbm90ZWJvb2stb3V0cHV0Jyk7XG5yZWdpc3RlclpJbmRleChaSW5kZXguQmFzZSwgMjgsICdub3RlYm9vay1jZWxsLWJvdHRvbS10b29sYmFyLWNvbnRhaW5lcicpO1xucmVnaXN0ZXJaSW5kZXgoWkluZGV4LkJhc2UsIDI5LCAnbm90ZWJvb2stcnVuLWJ1dHRvbi1jb250YWluZXInKTtcbnJlZ2lzdGVyWkluZGV4KFpJbmRleC5CYXNlLCAyOSwgJ25vdGVib29rLWlucHV0LWNvbGxhcHNlLWNvbmRpY29uJyk7XG5yZWdpc3RlclpJbmRleChaSW5kZXguQmFzZSwgMzAsICdub3RlYm9vay1jZWxsLW91dHB1dC10b29sYmFyJyk7XG5yZWdpc3RlclpJbmRleChaSW5kZXguU2FzaCwgMSwgJ25vdGVib29rLWNlbGwtZXhwYW5kLXBhcnQtYnV0dG9uJyk7XG5yZWdpc3RlclpJbmRleChaSW5kZXguU2FzaCwgMiwgJ25vdGVib29rLWNlbGwtdG9vbGJhcicpO1xucmVnaXN0ZXJaSW5kZXgoWkluZGV4LlNhc2gsIDMsICdub3RlYm9vay1jZWxsLXRvb2xiYXItZHJvcGRvd24tYWN0aXZlJyk7XG5cbmV4cG9ydCBjb25zdCBub3RlYm9va0NlbGxCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdub3RlYm9vay5jZWxsQm9yZGVyQ29sb3InLCB7XG5cdGRhcms6IHRyYW5zcGFyZW50KGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQsIDEpLFxuXHRsaWdodDogdHJhbnNwYXJlbnQobGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCwgMSksXG5cdGhjRGFyazogUEFORUxfQk9SREVSLFxuXHRoY0xpZ2h0OiBQQU5FTF9CT1JERVJcbn0sIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suY2VsbEJvcmRlckNvbG9yJywgXCJUaGUgYm9yZGVyIGNvbG9yIGZvciBub3RlYm9vayBjZWxscy5cIikpO1xuXG5leHBvcnQgY29uc3QgZm9jdXNlZEVkaXRvckJvcmRlckNvbG9yID0gcmVnaXN0ZXJDb2xvcignbm90ZWJvb2suZm9jdXNlZEVkaXRvckJvcmRlcicsIGZvY3VzQm9yZGVyLCBubHMubG9jYWxpemUoJ25vdGVib29rLmZvY3VzZWRFZGl0b3JCb3JkZXInLCBcIlRoZSBjb2xvciBvZiB0aGUgbm90ZWJvb2sgY2VsbCBlZGl0b3IgYm9yZGVyLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBjZWxsU3RhdHVzSWNvblN1Y2Nlc3MgPSByZWdpc3RlckNvbG9yKCdub3RlYm9va1N0YXR1c1N1Y2Nlc3NJY29uLmZvcmVncm91bmQnLCBkZWJ1Z0ljb25TdGFydEZvcmVncm91bmQsIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2tTdGF0dXNTdWNjZXNzSWNvbi5mb3JlZ3JvdW5kJywgXCJUaGUgZXJyb3IgaWNvbiBjb2xvciBvZiBub3RlYm9vayBjZWxscyBpbiB0aGUgY2VsbCBzdGF0dXMgYmFyLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBydW5uaW5nQ2VsbFJ1bGVyRGVjb3JhdGlvbkNvbG9yID0gcmVnaXN0ZXJDb2xvcignbm90ZWJvb2tFZGl0b3JPdmVydmlld1J1bGVyLnJ1bm5pbmdDZWxsRm9yZWdyb3VuZCcsIGRlYnVnSWNvblN0YXJ0Rm9yZWdyb3VuZCwgbmxzLmxvY2FsaXplKCdub3RlYm9va0VkaXRvck92ZXJ2aWV3UnVsZXIucnVubmluZ0NlbGxGb3JlZ3JvdW5kJywgXCJUaGUgY29sb3Igb2YgdGhlIHJ1bm5pbmcgY2VsbCBkZWNvcmF0aW9uIGluIHRoZSBub3RlYm9vayBlZGl0b3Igb3ZlcnZpZXcgcnVsZXIuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGNlbGxTdGF0dXNJY29uRXJyb3IgPSByZWdpc3RlckNvbG9yKCdub3RlYm9va1N0YXR1c0Vycm9ySWNvbi5mb3JlZ3JvdW5kJywgZXJyb3JGb3JlZ3JvdW5kLCBubHMubG9jYWxpemUoJ25vdGVib29rU3RhdHVzRXJyb3JJY29uLmZvcmVncm91bmQnLCBcIlRoZSBlcnJvciBpY29uIGNvbG9yIG9mIG5vdGVib29rIGNlbGxzIGluIHRoZSBjZWxsIHN0YXR1cyBiYXIuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGNlbGxTdGF0dXNJY29uUnVubmluZyA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rU3RhdHVzUnVubmluZ0ljb24uZm9yZWdyb3VuZCcsIGZvcmVncm91bmQsIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2tTdGF0dXNSdW5uaW5nSWNvbi5mb3JlZ3JvdW5kJywgXCJUaGUgcnVubmluZyBpY29uIGNvbG9yIG9mIG5vdGVib29rIGNlbGxzIGluIHRoZSBjZWxsIHN0YXR1cyBiYXIuXCIpKTtcblxuZXhwb3J0IGNvbnN0IG5vdGVib29rT3V0cHV0Q29udGFpbmVyQm9yZGVyQ29sb3IgPSByZWdpc3RlckNvbG9yKCdub3RlYm9vay5vdXRwdXRDb250YWluZXJCb3JkZXJDb2xvcicsIG51bGwsIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2sub3V0cHV0Q29udGFpbmVyQm9yZGVyQ29sb3InLCBcIlRoZSBib3JkZXIgY29sb3Igb2YgdGhlIG5vdGVib29rIG91dHB1dCBjb250YWluZXIuXCIpKTtcblxuZXhwb3J0IGNvbnN0IG5vdGVib29rT3V0cHV0Q29udGFpbmVyQ29sb3IgPSByZWdpc3RlckNvbG9yKCdub3RlYm9vay5vdXRwdXRDb250YWluZXJCYWNrZ3JvdW5kQ29sb3InLCBudWxsLCBubHMubG9jYWxpemUoJ25vdGVib29rLm91dHB1dENvbnRhaW5lckJhY2tncm91bmRDb2xvcicsIFwiVGhlIGNvbG9yIG9mIHRoZSBub3RlYm9vayBvdXRwdXQgY29udGFpbmVyIGJhY2tncm91bmQuXCIpKTtcblxuLy8gVE9ET0ByZWJvcm5peCBjdXJyZW50bHkgYWxzbyB1c2VkIGZvciB0b29sYmFyIGJvcmRlciwgaWYgd2Uga2VlcCBhbGwgb2YgdGhpcywgcGljayBhIGdlbmVyaWMgbmFtZVxuZXhwb3J0IGNvbnN0IENFTExfVE9PTEJBUl9TRVBFUkFUT1IgPSByZWdpc3RlckNvbG9yKCdub3RlYm9vay5jZWxsVG9vbGJhclNlcGFyYXRvcicsIHtcblx0ZGFyazogQ29sb3IuZnJvbUhleCgnIzgwODA4MCcpLnRyYW5zcGFyZW50KDAuMzUpLFxuXHRsaWdodDogQ29sb3IuZnJvbUhleCgnIzgwODA4MCcpLnRyYW5zcGFyZW50KDAuMzUpLFxuXHRoY0Rhcms6IGNvbnRyYXN0Qm9yZGVyLFxuXHRoY0xpZ2h0OiBjb250cmFzdEJvcmRlclxufSwgbmxzLmxvY2FsaXplKCdub3RlYm9vay5jZWxsVG9vbGJhclNlcGFyYXRvcicsIFwiVGhlIGNvbG9yIG9mIHRoZSBzZXBhcmF0b3IgaW4gdGhlIGNlbGwgYm90dG9tIHRvb2xiYXJcIikpO1xuXG5leHBvcnQgY29uc3QgZm9jdXNlZENlbGxCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignbm90ZWJvb2suZm9jdXNlZENlbGxCYWNrZ3JvdW5kJywgbnVsbCwgbmxzLmxvY2FsaXplKCdmb2N1c2VkQ2VsbEJhY2tncm91bmQnLCBcIlRoZSBiYWNrZ3JvdW5kIGNvbG9yIG9mIGEgY2VsbCB3aGVuIHRoZSBjZWxsIGlzIGZvY3VzZWQuXCIpKTtcblxuZXhwb3J0IGNvbnN0IHNlbGVjdGVkQ2VsbEJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdub3RlYm9vay5zZWxlY3RlZENlbGxCYWNrZ3JvdW5kJywge1xuXHRkYXJrOiBsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kLFxuXHRsaWdodDogbGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCxcblx0aGNEYXJrOiBudWxsLFxuXHRoY0xpZ2h0OiBudWxsXG59LCBubHMubG9jYWxpemUoJ3NlbGVjdGVkQ2VsbEJhY2tncm91bmQnLCBcIlRoZSBiYWNrZ3JvdW5kIGNvbG9yIG9mIGEgY2VsbCB3aGVuIHRoZSBjZWxsIGlzIHNlbGVjdGVkLlwiKSk7XG5cblxuZXhwb3J0IGNvbnN0IGNlbGxIb3ZlckJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdub3RlYm9vay5jZWxsSG92ZXJCYWNrZ3JvdW5kJywge1xuXHRkYXJrOiB0cmFuc3BhcmVudChmb2N1c2VkQ2VsbEJhY2tncm91bmQsIC41KSxcblx0bGlnaHQ6IHRyYW5zcGFyZW50KGZvY3VzZWRDZWxsQmFja2dyb3VuZCwgLjcpLFxuXHRoY0Rhcms6IG51bGwsXG5cdGhjTGlnaHQ6IG51bGxcbn0sIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suY2VsbEhvdmVyQmFja2dyb3VuZCcsIFwiVGhlIGJhY2tncm91bmQgY29sb3Igb2YgYSBjZWxsIHdoZW4gdGhlIGNlbGwgaXMgaG92ZXJlZC5cIikpO1xuXG5leHBvcnQgY29uc3Qgc2VsZWN0ZWRDZWxsQm9yZGVyID0gcmVnaXN0ZXJDb2xvcignbm90ZWJvb2suc2VsZWN0ZWRDZWxsQm9yZGVyJywge1xuXHRkYXJrOiBub3RlYm9va0NlbGxCb3JkZXIsXG5cdGxpZ2h0OiBub3RlYm9va0NlbGxCb3JkZXIsXG5cdGhjRGFyazogY29udHJhc3RCb3JkZXIsXG5cdGhjTGlnaHQ6IGNvbnRyYXN0Qm9yZGVyXG59LCBubHMubG9jYWxpemUoJ25vdGVib29rLnNlbGVjdGVkQ2VsbEJvcmRlcicsIFwiVGhlIGNvbG9yIG9mIHRoZSBjZWxsJ3MgdG9wIGFuZCBib3R0b20gYm9yZGVyIHdoZW4gdGhlIGNlbGwgaXMgc2VsZWN0ZWQgYnV0IG5vdCBmb2N1c2VkLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBpbmFjdGl2ZVNlbGVjdGVkQ2VsbEJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rLmluYWN0aXZlU2VsZWN0ZWRDZWxsQm9yZGVyJywge1xuXHRkYXJrOiBudWxsLFxuXHRsaWdodDogbnVsbCxcblx0aGNEYXJrOiBmb2N1c0JvcmRlcixcblx0aGNMaWdodDogZm9jdXNCb3JkZXJcbn0sIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suaW5hY3RpdmVTZWxlY3RlZENlbGxCb3JkZXInLCBcIlRoZSBjb2xvciBvZiB0aGUgY2VsbCdzIGJvcmRlcnMgd2hlbiBtdWx0aXBsZSBjZWxscyBhcmUgc2VsZWN0ZWQuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGZvY3VzZWRDZWxsQm9yZGVyID0gcmVnaXN0ZXJDb2xvcignbm90ZWJvb2suZm9jdXNlZENlbGxCb3JkZXInLCBmb2N1c0JvcmRlciwgbmxzLmxvY2FsaXplKCdub3RlYm9vay5mb2N1c2VkQ2VsbEJvcmRlcicsIFwiVGhlIGNvbG9yIG9mIHRoZSBjZWxsJ3MgZm9jdXMgaW5kaWNhdG9yIGJvcmRlcnMgd2hlbiB0aGUgY2VsbCBpcyBmb2N1c2VkLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBpbmFjdGl2ZUZvY3VzZWRDZWxsQm9yZGVyID0gcmVnaXN0ZXJDb2xvcignbm90ZWJvb2suaW5hY3RpdmVGb2N1c2VkQ2VsbEJvcmRlcicsIG5vdGVib29rQ2VsbEJvcmRlciwgbmxzLmxvY2FsaXplKCdub3RlYm9vay5pbmFjdGl2ZUZvY3VzZWRDZWxsQm9yZGVyJywgXCJUaGUgY29sb3Igb2YgdGhlIGNlbGwncyB0b3AgYW5kIGJvdHRvbSBib3JkZXIgd2hlbiBhIGNlbGwgaXMgZm9jdXNlZCB3aGlsZSB0aGUgcHJpbWFyeSBmb2N1cyBpcyBvdXRzaWRlIG9mIHRoZSBlZGl0b3IuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGNlbGxTdGF0dXNCYXJJdGVtSG92ZXIgPSByZWdpc3RlckNvbG9yKCdub3RlYm9vay5jZWxsU3RhdHVzQmFySXRlbUhvdmVyQmFja2dyb3VuZCcsIHtcblx0bGlnaHQ6IG5ldyBDb2xvcihuZXcgUkdCQSgwLCAwLCAwLCAwLjA4KSksXG5cdGRhcms6IG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDI1NSwgMjU1LCAwLjE1KSksXG5cdGhjRGFyazogbmV3IENvbG9yKG5ldyBSR0JBKDI1NSwgMjU1LCAyNTUsIDAuMTUpKSxcblx0aGNMaWdodDogbmV3IENvbG9yKG5ldyBSR0JBKDAsIDAsIDAsIDAuMDgpKSxcbn0sIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suY2VsbFN0YXR1c0Jhckl0ZW1Ib3ZlckJhY2tncm91bmQnLCBcIlRoZSBiYWNrZ3JvdW5kIGNvbG9yIG9mIG5vdGVib29rIGNlbGwgc3RhdHVzIGJhciBpdGVtcy5cIikpO1xuXG5leHBvcnQgY29uc3QgY2VsbEluc2VydGlvbkluZGljYXRvciA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rLmNlbGxJbnNlcnRpb25JbmRpY2F0b3InLCBmb2N1c0JvcmRlciwgbmxzLmxvY2FsaXplKCdub3RlYm9vay5jZWxsSW5zZXJ0aW9uSW5kaWNhdG9yJywgXCJUaGUgY29sb3Igb2YgdGhlIG5vdGVib29rIGNlbGwgaW5zZXJ0aW9uIGluZGljYXRvci5cIikpO1xuXG5leHBvcnQgY29uc3QgbGlzdFNjcm9sbGJhclNsaWRlckJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdub3RlYm9va1Njcm9sbGJhclNsaWRlci5iYWNrZ3JvdW5kJywgc2Nyb2xsYmFyU2xpZGVyQmFja2dyb3VuZCwgbmxzLmxvY2FsaXplKCdub3RlYm9va1Njcm9sbGJhclNsaWRlckJhY2tncm91bmQnLCBcIk5vdGVib29rIHNjcm9sbGJhciBzbGlkZXIgYmFja2dyb3VuZCBjb2xvci5cIikpO1xuXG5leHBvcnQgY29uc3QgbGlzdFNjcm9sbGJhclNsaWRlckhvdmVyQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rU2Nyb2xsYmFyU2xpZGVyLmhvdmVyQmFja2dyb3VuZCcsIHNjcm9sbGJhclNsaWRlckhvdmVyQmFja2dyb3VuZCwgbmxzLmxvY2FsaXplKCdub3RlYm9va1Njcm9sbGJhclNsaWRlckhvdmVyQmFja2dyb3VuZCcsIFwiTm90ZWJvb2sgc2Nyb2xsYmFyIHNsaWRlciBiYWNrZ3JvdW5kIGNvbG9yIHdoZW4gaG92ZXJpbmcuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGxpc3RTY3JvbGxiYXJTbGlkZXJBY3RpdmVCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignbm90ZWJvb2tTY3JvbGxiYXJTbGlkZXIuYWN0aXZlQmFja2dyb3VuZCcsIHNjcm9sbGJhclNsaWRlckFjdGl2ZUJhY2tncm91bmQsIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2tTY3JvbGxiYXJTbGlkZXJBY3RpdmVCYWNrZ3JvdW5kJywgXCJOb3RlYm9vayBzY3JvbGxiYXIgc2xpZGVyIGJhY2tncm91bmQgY29sb3Igd2hlbiBjbGlja2VkIG9uLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBjZWxsU3ltYm9sSGlnaGxpZ2h0ID0gcmVnaXN0ZXJDb2xvcignbm90ZWJvb2suc3ltYm9sSGlnaGxpZ2h0QmFja2dyb3VuZCcsIHtcblx0ZGFyazogQ29sb3IuZnJvbUhleCgnI2ZmZmZmZjBiJyksXG5cdGxpZ2h0OiBDb2xvci5mcm9tSGV4KCcjZmRmZjAwMzMnKSxcblx0aGNEYXJrOiBudWxsLFxuXHRoY0xpZ2h0OiBudWxsXG59LCBubHMubG9jYWxpemUoJ25vdGVib29rLnN5bWJvbEhpZ2hsaWdodEJhY2tncm91bmQnLCBcIkJhY2tncm91bmQgY29sb3Igb2YgaGlnaGxpZ2h0ZWQgY2VsbFwiKSk7XG5cbmV4cG9ydCBjb25zdCBjZWxsRWRpdG9yQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rLmNlbGxFZGl0b3JCYWNrZ3JvdW5kJywge1xuXHRsaWdodDogU0lERV9CQVJfQkFDS0dST1VORCxcblx0ZGFyazogU0lERV9CQVJfQkFDS0dST1VORCxcblx0aGNEYXJrOiBudWxsLFxuXHRoY0xpZ2h0OiBudWxsXG59LCBubHMubG9jYWxpemUoJ25vdGVib29rLmNlbGxFZGl0b3JCYWNrZ3JvdW5kJywgXCJDZWxsIGVkaXRvciBiYWNrZ3JvdW5kIGNvbG9yLlwiKSk7XG5cbmNvbnN0IG5vdGVib29rRWRpdG9yQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ25vdGVib29rLmVkaXRvckJhY2tncm91bmQnLCB7XG5cdGxpZ2h0OiBFRElUT1JfUEFORV9CQUNLR1JPVU5ELFxuXHRkYXJrOiBFRElUT1JfUEFORV9CQUNLR1JPVU5ELFxuXHRoY0Rhcms6IG51bGwsXG5cdGhjTGlnaHQ6IG51bGxcbn0sIG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suZWRpdG9yQmFja2dyb3VuZCcsIFwiTm90ZWJvb2sgYmFja2dyb3VuZCBjb2xvci5cIikpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFlBQVksb0JBQW9CO0FBRWhDLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsT0FBTyxZQUFZO0FBQzVCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsb0JBQW9CLFlBQVksaUJBQWlCLFNBQVMseUJBQXlCO0FBQzVGLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsU0FBUyxlQUFlO0FBRWpDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsd0JBQXdCO0FBSWpDLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsYUFBYTtBQUV0QixTQUFTLHlCQUF5QjtBQUNsQyxZQUFZLFNBQVM7QUFDckIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLG9CQUFvQixxQkFBcUI7QUFDL0QsU0FBUywy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
