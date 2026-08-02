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
import { localize } from "../../../../../../nls.js";
import * as DOM from "../../../../../../base/browser/dom.js";
import { raceCancellation } from "../../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { clamp } from "../../../../../../base/common/numbers.js";
import * as strings from "../../../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { EditorOption } from "../../../../../../editor/common/config/editorOptions.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { tokenizeToStringSync } from "../../../../../../editor/common/languages/textToHtmlTokenizer.js";
import { CodeActionController } from "../../../../../../editor/contrib/codeAction/browser/codeActionController.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { INotebookExecutionStateService } from "../../../common/notebookExecutionStateService.js";
import { CellFocusMode, EXPAND_CELL_INPUT_COMMAND_ID } from "../../notebookBrowser.js";
import { outputDisplayLimit } from "../../viewModel/codeCellViewModel.js";
import { collapsedCellTTPolicy } from "../notebookRenderingCommon.js";
import { CellEditorOptions } from "./cellEditorOptions.js";
import { CellOutputContainer } from "./cellOutput.js";
import { CollapsedCodeCellExecutionIcon } from "./codeCellExecutionIcon.js";
import { INotebookLoggingService } from "../../../common/notebookLoggingService.js";
let CodeCell = class extends Disposable {
  constructor(notebookEditor, viewCell, templateData, editorPool, instantiationService, keybindingService, languageService, configurationService, notebookExecutionStateService, notebookLogService) {
    super();
    this.notebookEditor = notebookEditor;
    this.viewCell = viewCell;
    this.templateData = templateData;
    this.editorPool = editorPool;
    this.instantiationService = instantiationService;
    this.keybindingService = keybindingService;
    this.languageService = languageService;
    this.configurationService = configurationService;
    this._isDisposed = false;
    this._useNewApproachForEditorLayout = true;
    this._pointerDownInEditor = false;
    this._pointerDraggingInEditor = false;
    const cellIndex = this.notebookEditor.getCellIndex(this.viewCell);
    const debugPrefix = `[Cell ${cellIndex}]`;
    const debug = this._debug = (output) => {
      notebookLogService.debug("CellLayout", `${debugPrefix} ${output}`);
    };
    this._cellEditorOptions = this._register(new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(viewCell.language), this.notebookEditor.notebookOptions, this.configurationService));
    this._outputContainerRenderer = this.instantiationService.createInstance(CellOutputContainer, notebookEditor, viewCell, templateData, { limit: outputDisplayLimit });
    this.cellParts = this._register(templateData.cellParts.concatContentPart([this._cellEditorOptions, this._outputContainerRenderer], DOM.getWindow(notebookEditor.getDomNode())));
    const initialEditorDimension = { height: this.calculateInitEditorHeight(), width: this.viewCell.layoutInfo.editorWidth };
    this._cellLayout = new CodeCellLayout(this._useNewApproachForEditorLayout, notebookEditor, viewCell, templateData, { debug }, initialEditorDimension);
    this.initializeEditor(initialEditorDimension);
    this._renderedInputCollapseState = false;
    this.registerNotebookEditorListeners();
    this.registerViewCellLayoutChange();
    this.registerCellEditorEventListeners();
    this.registerMouseListener();
    this._register(Event.any(this.viewCell.onDidStartExecution, this.viewCell.onDidStopExecution)((e) => {
      this.cellParts.updateForExecutionState(this.viewCell, e);
    }));
    this._register(this.viewCell.onDidChangeState((e) => {
      this.cellParts.updateState(this.viewCell, e);
      if (e.outputIsHoveredChanged) {
        this.updateForOutputHover();
      }
      if (e.outputIsFocusedChanged) {
        this.updateForOutputFocus();
      }
      if (e.metadataChanged || e.internalMetadataChanged) {
        this.updateEditorOptions();
      }
      if (e.inputCollapsedChanged || e.outputCollapsedChanged) {
        this.viewCell.pauseLayout();
        const updated = this.updateForCollapseState();
        this.viewCell.resumeLayout();
        if (updated) {
          this.relayoutCell();
        }
      }
      if (e.focusModeChanged) {
        this.updateEditorForFocusModeChange(true);
      }
    }));
    this.updateEditorOptions();
    this.updateEditorForFocusModeChange(false);
    this.updateForOutputHover();
    this.updateForOutputFocus();
    this.cellParts.scheduleRenderCell(this.viewCell);
    this._register(toDisposable(() => {
      this.cellParts.unrenderCell(this.viewCell);
    }));
    this.viewCell.editorHeight = initialEditorDimension.height;
    this._outputContainerRenderer.render();
    this._renderedOutputCollapseState = false;
    this.initialViewUpdateExpanded();
    this._register(this.viewCell.onLayoutInfoRead(() => {
      this.cellParts.prepareLayout();
    }));
    const executionItemElement = DOM.append(this.templateData.cellInputCollapsedContainer, DOM.$(".collapsed-execution-icon"));
    this._register(toDisposable(() => {
      executionItemElement.remove();
    }));
    this._collapsedExecutionIcon = this._register(this.instantiationService.createInstance(CollapsedCodeCellExecutionIcon, this.notebookEditor, this.viewCell, executionItemElement));
    this.updateForCollapseState();
    this._register(Event.runAndSubscribe(viewCell.onDidChangeOutputs, this.updateForOutputs.bind(this)));
    this._register(Event.runAndSubscribe(viewCell.onDidChangeLayout, this.updateForLayout.bind(this)));
    this._cellEditorOptions.setLineNumbers(this.viewCell.lineNumbers);
    templateData.editor.updateOptions(this._cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));
  }
  updateCodeCellOptions(templateData) {
    templateData.editor.updateOptions(this._cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));
    const cts = new CancellationTokenSource();
    this._register({ dispose() {
      cts.dispose(true);
    } });
    raceCancellation(this.viewCell.resolveTextModel(), cts.token).then((model) => {
      if (this._isDisposed) {
        return;
      }
      if (model) {
        model.updateOptions({
          indentSize: this._cellEditorOptions.indentSize,
          tabSize: this._cellEditorOptions.tabSize,
          insertSpaces: this._cellEditorOptions.insertSpaces
        });
      }
    });
  }
  updateForLayout() {
    this._pendingLayout?.dispose();
    this._pendingLayout = DOM.modify(DOM.getWindow(this.notebookEditor.getDomNode()), () => {
      this.cellParts.updateInternalLayoutNow(this.viewCell);
    });
  }
  updateForOutputHover() {
    this.templateData.container.classList.toggle("cell-output-hover", this.viewCell.outputIsHovered);
  }
  updateForOutputFocus() {
    this.templateData.container.classList.toggle("cell-output-focus", this.viewCell.outputIsFocused);
  }
  calculateInitEditorHeight() {
    const lineNum = this.viewCell.lineCount;
    const lineHeight = this.viewCell.layoutInfo.fontInfo?.lineHeight || 17;
    const editorPadding = this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri);
    const editorHeight = this.viewCell.layoutInfo.editorHeight === 0 ? lineNum * lineHeight + editorPadding.top + editorPadding.bottom : this.viewCell.layoutInfo.editorHeight;
    return editorHeight;
  }
  initializeEditor(dimension) {
    this._debug(`Initialize Editor ${dimension.height} x ${dimension.width}, Scroll Top = ${this.notebookEditor.scrollTop}`);
    this._cellLayout.layoutEditor("init");
    this.layoutEditor(dimension);
    const cts = new CancellationTokenSource();
    this._register({ dispose() {
      cts.dispose(true);
    } });
    raceCancellation(this.viewCell.resolveTextModel(), cts.token).then((model) => {
      if (this._isDisposed || model?.isDisposed()) {
        return;
      }
      if (model && this.templateData.editor) {
        this._reigsterModelListeners(model);
        this.templateData.editor.setModel(model);
        if (this._isDisposed) {
          return;
        }
        model.updateOptions({
          indentSize: this._cellEditorOptions.indentSize,
          tabSize: this._cellEditorOptions.tabSize,
          insertSpaces: this._cellEditorOptions.insertSpaces
        });
        this.viewCell.attachTextEditor(this.templateData.editor, this.viewCell.layoutInfo.estimatedHasHorizontalScrolling);
        const focusEditorIfNeeded = () => {
          if (this.notebookEditor.getActiveCell() === this.viewCell && this.viewCell.focusMode === CellFocusMode.Editor && (this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body)) {
            this.templateData.editor.focus();
          }
        };
        focusEditorIfNeeded();
        const realContentHeight = this.templateData.editor.getContentHeight();
        if (realContentHeight !== dimension.height) {
          this.onCellEditorHeightChange("onDidResolveTextModel");
        }
        if (this._isDisposed) {
          return;
        }
        focusEditorIfNeeded();
      }
      this._register(this._cellEditorOptions.onDidChange(() => this.updateCodeCellOptions(this.templateData)));
    });
  }
  updateForOutputs() {
    DOM.setVisibility(this.viewCell.outputsViewModels.length > 0, this.templateData.focusSinkElement);
  }
  updateEditorOptions() {
    const editor = this.templateData.editor;
    if (!editor) {
      return;
    }
    const isReadonly = this.notebookEditor.isReadOnly;
    const padding = this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri);
    const options = editor.getOptions();
    if (options.get(EditorOption.readOnly) !== isReadonly || options.get(EditorOption.padding) !== padding) {
      editor.updateOptions({
        readOnly: this.notebookEditor.isReadOnly,
        padding: this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri)
      });
    }
  }
  registerNotebookEditorListeners() {
    this._register(this.notebookEditor.onDidScroll(() => {
      this.adjustEditorPosition();
      this._cellLayout.layoutEditor("nbDidScroll");
    }));
    this._register(this.notebookEditor.onDidChangeLayout(() => {
      this.adjustEditorPosition();
      this.onCellWidthChange("nbLayoutChange");
    }));
  }
  adjustEditorPosition() {
    if (this._useNewApproachForEditorLayout) {
      return;
    }
    const extraOffset = -6 - 1;
    const min = 0;
    const scrollTop = this.notebookEditor.scrollTop;
    const elementTop = this.notebookEditor.getAbsoluteTopOfElement(this.viewCell);
    const diff = scrollTop - elementTop + extraOffset;
    const notebookEditorLayout = this.notebookEditor.getLayoutInfo();
    const editorMaxHeight = notebookEditorLayout.height - notebookEditorLayout.stickyHeight - 26;
    const maxTop = this.viewCell.layoutInfo.editorHeight - editorMaxHeight;
    const top = maxTop > 20 ? clamp(min, diff, maxTop) : min;
    this.templateData.editorPart.style.top = `${top}px`;
    this.templateData.editor.setScrollTop(top);
  }
  registerViewCellLayoutChange() {
    this._register(this.viewCell.onDidChangeLayout((e) => {
      if (e.outerWidth !== void 0) {
        const layoutInfo = this.templateData.editor.getLayoutInfo();
        if (layoutInfo.width !== this.viewCell.layoutInfo.editorWidth) {
          this.onCellWidthChange("viewCellLayoutChange");
          this.adjustEditorPosition();
        }
      }
    }));
  }
  registerCellEditorEventListeners() {
    this._register(this.templateData.editor.onDidContentSizeChange((e) => {
      if (e.contentHeightChanged) {
        if (this.viewCell.layoutInfo.editorHeight !== e.contentHeight) {
          this.onCellEditorHeightChange(`onDidContentSizeChange`);
          this.adjustEditorPosition();
        }
      }
    }));
    if (this._useNewApproachForEditorLayout) {
      this._register(this.templateData.editor.onDidScrollChange((e) => {
        if (this._pointerDownInEditor || this._pointerDraggingInEditor) {
          return;
        }
        if (this._cellLayout.editorVisibility === "Invisible" || !this.templateData.editor.hasTextFocus()) {
          return;
        }
        if (this._cellLayout._lastChangedEditorScrolltop === e.scrollTop || this._cellLayout.isUpdatingLayout) {
          return;
        }
        const scrollTop = this.notebookEditor.scrollTop;
        const diff = e.scrollTop - (this._cellLayout._lastChangedEditorScrolltop ?? 0);
        if (this._cellLayout.editorVisibility === "Full (Small Viewport)" && typeof this._cellLayout._lastChangedEditorScrolltop === "number") {
          this._debug(`Scroll Change (1) = ${e.scrollTop} changed by ${diff} (notebook scrollTop: ${scrollTop}, setEditorScrollTop: ${e.scrollTop})`);
        } else if (this._cellLayout.editorVisibility === "Bottom Clipped" && typeof this._cellLayout._lastChangedEditorScrolltop === "number") {
          this._debug(`Scroll Change (2) = ${e.scrollTop} changed by ${diff} (notebook scrollTop: ${scrollTop}, setNotebookScrollTop: ${scrollTop + e.scrollTop})`);
          this.notebookEditor.setScrollTop(scrollTop + e.scrollTop);
        } else if (this._cellLayout.editorVisibility === "Top Clipped" && typeof this._cellLayout._lastChangedEditorScrolltop === "number") {
          const newScrollTop = scrollTop + diff - 1;
          this._debug(`Scroll Change (3) = ${e.scrollTop} changed by ${diff} (notebook scrollTop: ${scrollTop}, setNotebookScrollTop?: ${newScrollTop})`);
          if (scrollTop !== newScrollTop) {
            this.notebookEditor.setScrollTop(newScrollTop);
          }
        } else {
          this._debug(`Scroll Change (4) = ${e.scrollTop} changed by ${diff} (notebook scrollTop: ${scrollTop})`);
          this._cellLayout._lastChangedEditorScrolltop = void 0;
        }
      }));
    }
    this._register(this.templateData.editor.onDidChangeCursorSelection((e) => {
      if (
        // do not reveal the cell into view if this selection change was caused by restoring editors
        e.source === "restoreState" || e.oldModelVersionId === 0 || !this.templateData.editor.hasTextFocus()
      ) {
        return;
      }
      if ((this._pointerDownInEditor || this._pointerDraggingInEditor) && this._useNewApproachForEditorLayout) {
        return;
      }
      const selections = this.templateData.editor.getSelections();
      if (selections?.length) {
        const contentHeight = this.templateData.editor.getContentHeight();
        const layoutContentHeight = this.viewCell.layoutInfo.editorHeight;
        if (contentHeight !== layoutContentHeight) {
          if (!this._useNewApproachForEditorLayout) {
            this._debug(`onDidChangeCursorSelection`);
            this.onCellEditorHeightChange("onDidChangeCursorSelection");
          }
          if (this._isDisposed) {
            return;
          }
        }
        const lastSelection = selections[selections.length - 1];
        this.notebookEditor.revealRangeInViewAsync(this.viewCell, lastSelection);
      }
    }));
    this._register(this.templateData.editor.onDidBlurEditorWidget(() => {
      CodeActionController.get(this.templateData.editor)?.hideLightBulbWidget();
    }));
  }
  _reigsterModelListeners(model) {
    this._register(model.onDidChangeTokens(() => {
      if (this.viewCell.isInputCollapsed && this._inputCollapseElement) {
        const content = this._getRichTextFromLineTokens(model);
        this._inputCollapseElement.innerHTML = collapsedCellTTPolicy?.createHTML(content) ?? content;
        this._attachInputExpandButton(this._inputCollapseElement);
      }
    }));
  }
  registerMouseListener() {
    const resetPointerState = () => {
      this._pointerDownInEditor = false;
      this._pointerDraggingInEditor = false;
      this._cellLayout.setPointerDown(false);
    };
    this._register(this.templateData.editor.onMouseDown((e) => {
      if (e.event.rightButton) {
        e.event.preventDefault();
      }
      if (this._useNewApproachForEditorLayout) {
        if (e.event.leftButton) {
          this._pointerDownInEditor = true;
          this._pointerDraggingInEditor = false;
          this._cellLayout.setPointerDown(false);
        }
      }
    }));
    if (this._useNewApproachForEditorLayout) {
      this._register(this.templateData.editor.onMouseMove((e) => {
        if (!this._pointerDownInEditor) {
          return;
        }
        if (!e.event.leftButton) {
          resetPointerState();
          return;
        }
        if (!this._pointerDraggingInEditor) {
          this._pointerDraggingInEditor = true;
          this._cellLayout.setPointerDown(true);
        }
      }));
    }
    if (this._useNewApproachForEditorLayout) {
      const win = DOM.getWindow(this.notebookEditor.getDomNode());
      this._register(DOM.addDisposableListener(win, "mouseup", resetPointerState));
      this._register(DOM.addDisposableListener(win, "pointerup", resetPointerState));
      this._register(DOM.addDisposableListener(win, "pointercancel", resetPointerState));
      this._register(DOM.addDisposableListener(win, "blur", resetPointerState));
      this._register(DOM.addDisposableListener(win, "keydown", (e) => {
        if (e.key === "Escape" && (this._pointerDownInEditor || this._pointerDraggingInEditor)) {
          resetPointerState();
        }
      }));
    }
  }
  shouldPreserveEditor() {
    return this.notebookEditor.getActiveCell() === this.viewCell && this.viewCell.focusMode === CellFocusMode.Editor && (this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body);
  }
  updateEditorForFocusModeChange(sync) {
    if (this.shouldPreserveEditor()) {
      if (sync) {
        this.templateData.editor.focus();
      } else {
        this._register(DOM.runAtThisOrScheduleAtNextAnimationFrame(DOM.getWindow(this.templateData.container), () => {
          this.templateData.editor.focus();
        }));
      }
    }
    this.templateData.container.classList.toggle("cell-editor-focus", this.viewCell.focusMode === CellFocusMode.Editor);
    this.templateData.container.classList.toggle("cell-output-focus", this.viewCell.focusMode === CellFocusMode.Output);
  }
  updateForCollapseState() {
    if (this.viewCell.isOutputCollapsed === this._renderedOutputCollapseState && this.viewCell.isInputCollapsed === this._renderedInputCollapseState) {
      return false;
    }
    this.viewCell.layoutChange({ editorHeight: true });
    if (this.viewCell.isInputCollapsed) {
      this._collapseInput();
    } else {
      this._showInput();
    }
    if (this.viewCell.isOutputCollapsed) {
      this._collapseOutput();
    } else {
      this._showOutput(false);
    }
    this.relayoutCell();
    this._renderedOutputCollapseState = this.viewCell.isOutputCollapsed;
    this._renderedInputCollapseState = this.viewCell.isInputCollapsed;
    return true;
  }
  _collapseInput() {
    DOM.hide(this.templateData.editorPart);
    this.templateData.container.classList.toggle("input-collapsed", true);
    this._removeInputCollapsePreview();
    this._collapsedExecutionIcon.setVisibility(true);
    const richEditorText = this.templateData.editor.hasModel() ? this._getRichTextFromLineTokens(this.templateData.editor.getModel()) : this._getRichText(this.viewCell.textBuffer, this.viewCell.language);
    const element = DOM.$("div.cell-collapse-preview");
    element.innerHTML = collapsedCellTTPolicy?.createHTML(richEditorText) ?? richEditorText;
    this._inputCollapseElement = element;
    this.templateData.cellInputCollapsedContainer.appendChild(element);
    this._attachInputExpandButton(element);
    DOM.show(this.templateData.cellInputCollapsedContainer);
  }
  _attachInputExpandButton(element) {
    const expandIcon = DOM.$("span.expandInputIcon");
    const keybinding = this.keybindingService.lookupKeybinding(EXPAND_CELL_INPUT_COMMAND_ID);
    if (keybinding) {
      element.title = localize("cellExpandInputButtonLabelWithDoubleClick", "Double-click to expand cell input ({0})", keybinding.getLabel());
      expandIcon.title = localize("cellExpandInputButtonLabel", "Expand Cell Input ({0})", keybinding.getLabel());
    }
    expandIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.more));
    element.appendChild(expandIcon);
  }
  _showInput() {
    this._collapsedExecutionIcon.setVisibility(false);
    DOM.show(this.templateData.editorPart);
    DOM.hide(this.templateData.cellInputCollapsedContainer);
  }
  _getRichText(buffer, language) {
    return tokenizeToStringSync(this.languageService, buffer.getLineContent(1), language);
  }
  _getRichTextFromLineTokens(model) {
    let result = `<div class="monaco-tokenized-source">`;
    const firstLineTokens = model.tokenization.getLineTokens(1);
    const viewLineTokens = firstLineTokens.inflate();
    const line = model.getLineContent(1);
    let startOffset = 0;
    for (let j = 0, lenJ = viewLineTokens.getCount(); j < lenJ; j++) {
      const type = viewLineTokens.getClassName(j);
      const endIndex = viewLineTokens.getEndOffset(j);
      result += `<span class="${type}">${strings.escape(line.substring(startOffset, endIndex))}</span>`;
      startOffset = endIndex;
    }
    result += `</div>`;
    return result;
  }
  _removeInputCollapsePreview() {
    const children = this.templateData.cellInputCollapsedContainer.children;
    const elements = [];
    for (let i = 0; i < children.length; i++) {
      if (children[i].classList.contains("cell-collapse-preview")) {
        elements.push(children[i]);
      }
    }
    elements.forEach((element) => {
      element.remove();
    });
  }
  _updateOutputInnerContainer(hide) {
    const children = this.templateData.outputContainer.domNode.children;
    for (let i = 0; i < children.length; i++) {
      if (children[i].classList.contains("output-inner-container")) {
        DOM.setVisibility(!hide, children[i]);
      }
    }
  }
  _collapseOutput() {
    this.templateData.container.classList.toggle("output-collapsed", true);
    DOM.show(this.templateData.cellOutputCollapsedContainer);
    this._updateOutputInnerContainer(true);
    this._outputContainerRenderer.viewUpdateHideOuputs();
  }
  _showOutput(initRendering) {
    this.templateData.container.classList.toggle("output-collapsed", false);
    DOM.hide(this.templateData.cellOutputCollapsedContainer);
    this._updateOutputInnerContainer(false);
    this._outputContainerRenderer.viewUpdateShowOutputs(initRendering);
  }
  initialViewUpdateExpanded() {
    this.templateData.container.classList.toggle("input-collapsed", false);
    DOM.show(this.templateData.editorPart);
    DOM.hide(this.templateData.cellInputCollapsedContainer);
    this.templateData.container.classList.toggle("output-collapsed", false);
    this._showOutput(true);
  }
  layoutEditor(dimension) {
    if (this._useNewApproachForEditorLayout) {
      return;
    }
    const editorLayout = this.notebookEditor.getLayoutInfo();
    const maxHeight = Math.min(
      editorLayout.height - editorLayout.stickyHeight - 26,
      dimension.height
    );
    this._debug(`Layout Editor: Width = ${dimension.width}, Height = ${maxHeight} (Requested: ${dimension.height}, Editor Layout Height: ${editorLayout.height}, Sticky: ${editorLayout.stickyHeight})`);
    this.templateData.editor.layout({
      width: dimension.width,
      height: maxHeight
    }, true);
  }
  onCellWidthChange(dbgReasonForChange) {
    this._debug(`Cell Editor Width Change, ${dbgReasonForChange}, Content Height = ${this.templateData.editor.getContentHeight()}`);
    const height = this.templateData.editor.getContentHeight();
    if (this.templateData.editor.hasModel()) {
      this._debug(`**** Updating Cell Editor Height (1), ContentHeight: ${height}, CodeCellLayoutInfo.EditorWidth ${this.viewCell.layoutInfo.editorWidth}, EditorLayoutInfo ${this.templateData.editor.getLayoutInfo().height} ****`);
      this.viewCell.editorHeight = height;
      this.relayoutCell();
      this.layoutEditor(
        {
          width: this.viewCell.layoutInfo.editorWidth,
          height
        }
      );
    } else {
      this._debug(`Cell Editor Width Change without model, return (1), ContentHeight: ${height}, CodeCellLayoutInfo.EditorWidth ${this.viewCell.layoutInfo.editorWidth}, EditorLayoutInfo ${this.templateData.editor.getLayoutInfo().height}`);
    }
    this._cellLayout.layoutEditor(dbgReasonForChange);
  }
  onCellEditorHeightChange(dbgReasonForChange) {
    const height = this.templateData.editor.getContentHeight();
    if (!this.templateData.editor.hasModel()) {
      this._debug(`Cell Editor Height Change without model, return (2), ContentHeight: ${height}, CodeCellLayoutInfo.EditorWidth ${this.viewCell.layoutInfo.editorWidth}, EditorLayoutInfo ${this.templateData.editor.getLayoutInfo()}`);
    }
    this._debug(`Cell Editor Height Change (${dbgReasonForChange}): ${height}`);
    this._debug(`**** Updating Cell Editor Height (2), ContentHeight: ${height}, CodeCellLayoutInfo.EditorWidth ${this.viewCell.layoutInfo.editorWidth}, EditorLayoutInfo ${this.templateData.editor.getLayoutInfo().height} ****`);
    const viewLayout = this.templateData.editor.getLayoutInfo();
    this.viewCell.editorHeight = height;
    this.relayoutCell();
    this.layoutEditor(
      {
        width: viewLayout.width,
        height
      }
    );
    this._cellLayout.layoutEditor(dbgReasonForChange);
  }
  relayoutCell() {
    this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
  }
  dispose() {
    this._isDisposed = true;
    if (this.shouldPreserveEditor()) {
      this.editorPool.preserveFocusedEditor(this.viewCell);
    }
    this.viewCell.detachTextEditor();
    this._removeInputCollapsePreview();
    this._outputContainerRenderer.dispose();
    this._pendingLayout?.dispose();
    super.dispose();
  }
};
CodeCell = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, ILanguageService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, INotebookExecutionStateService),
  __decorateParam(9, INotebookLoggingService)
], CodeCell);
class CodeCellLayout {
  constructor(_enabled, notebookEditor, viewCell, templateData, _logService, _initialEditorDimension) {
    this._enabled = _enabled;
    this.notebookEditor = notebookEditor;
    this.viewCell = viewCell;
    this.templateData = templateData;
    this._logService = _logService;
    this._initialEditorDimension = _initialEditorDimension;
    this._initialized = false;
    this._pointerDown = false;
  }
  get editorVisibility() {
    return this._editorVisibility;
  }
  get isUpdatingLayout() {
    return this._isUpdatingLayout;
  }
  setPointerDown(isDown) {
    this._pointerDown = isDown;
  }
  /**
   * Dynamically lays out the code cell's Monaco editor to simulate a "sticky" run/exec area while
   * constraining the visible editor height to the notebook viewport. It adjusts two things:
   *  - The absolute `top` offset of the editor part inside the cell (so the run / execution order
   *    area remains visible for a limited vertical travel band ~45px).
   *  - The editor's layout height plus the editor's internal scroll position (`editorScrollTop`) to
   *    crop content when the cell is partially visible (top or bottom clipped) or when content is
   *    taller than the viewport.
   *
   * Additional invariants:
   *  - Content height stability: once the layout has been initialized, scroll-driven re-layouts can
   *    observe transient Monaco content heights that reflect the current clipped layout (rather than
   *    the full input height). To keep the notebook list layout stable (avoiding overlapping cells
   *    while navigating/scrolling), we store the actual content height in `_establishedContentHeight`
   *    and reuse it for scroll-driven relayouts. This prevents the editor from shrinking back to its
   *    initial height after content has been added (e.g., pasting text) or when Monaco reports a
   *    transient smaller content height while the cell is clipped.
   *
   *    We refresh `_establishedContentHeight` when the editor's content size changes
   *    (`onDidContentSizeChange`) and also when width/layout changes can affect wrapping-driven height
   *    (`viewCellLayoutChange`/`nbLayoutChange`).
   *  - Pointer-drag gating: while the user is holding the mouse button down in the editor (drag
   *    selection or potential drag selection), we avoid programmatic `editor.setScrollTop(...)` updates
   *    to prevent selection/scroll feedback loops and "stuck selection" behavior.
   *
   * ---------------------------------------------------------------------------
   * SECTION 1. OVERALL NOTEBOOK VIEW (EACH CELL HAS AN 18px GAP ABOVE IT)
   * Legend:
   *   GAP (between cells & before first cell) ............. 18px
   *   CELL PADDING (top & bottom inside cell) ............. 6px
   *   STATUS BAR HEIGHT (typical) ......................... 22px
   *   LINE HEIGHT (logic clamp) ........................... 21px
   *   BORDER/OUTLINE HEIGHT (visual conceal adjustment) ... 1px
   *   EDITOR_HEIGHT (example visible editor) .............. 200px (capped by viewport)
   *   EDITOR_CONTENT_HEIGHT (example full content) ........ 380px (e.g. 50 lines)
   *   extraOffset = -(CELL_PADDING + BORDER_HEIGHT) ....... -7
   *
   *   (The list ensures the editor's laid out height never exceeds viewport height.)
   *
   *   ┌────────────────────────────── Notebook Viewport (scrolling container) ────────────────────────────┐
   *   │ (scrollTop)                                                                                       │
   *   │                                                                                                   │
   *   │  18px GAP (top spacing before first cell)                                                         │
   *   │  ▼                                                                                                │
   *   │  ┌──────── Cell A Outer Container ────────────────────────────────────────────────────────────┐   │
   *   │  │ ▲ 6px top padding                                                                          │   │
   *   │  │ │                                                                                          │   │
   *   │  │ │  ┌─ Execution Order / Run Column (~45px vertical travel band)─┐  ┌─ Editor Part ───────┐ │   │
   *   │  │ │  │ (Run button, execution # label)                            │  │ Visible Lines ...   │ │   │
   *   │  │ │  │                                                            │  │                     │ │   │
   *   │  │ │  │                                                            │  │ EDITOR_HEIGHT=200px │ │   │
   *   │  │ │  │                                                            │  │ (Content=380px)     │ │   │
   *   │  │ │  └────────────────────────────────────────────────────────────┘  └─────────────────────┘ │   │
   *   │  │ │                                                                                          │   │
   *   │  │ │  ┌─ Status Bar (22px) ─────────────────────────────────────────────────────────────────┐ │   │
   *   │  │ │  │ language | indent | selection info | kernel/status bits ...                         │ │   │
   *   │  │ │  └─────────────────────────────────────────────────────────────────────────────────────┘ │   │
   *   │  │ │                                                                                          │   │
   *   │  │ ▼ 6px bottom padding                                                                       │   │
   *   │  └────────────────────────────────────────────────────────────────────────────────────────────┘   │
   *   │  18px GAP                                                                                         │
   *   │  ┌──────── Cell B Outer Container ────────────────────────────────────────────────────────────┐   │
   *   │  │ (same structure as Cell A)                                                                 │   │
   *   │  └────────────────────────────────────────────────────────────────────────────────────────────┘   │
   *   │                                                                                                   │
   *   │ (scrollBottom)                                                                                    │
   *   └───────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * SECTION 2. SINGLE CELL STRUCTURE (VERTICAL LAYERS)
   *
   *   Inter-Cell GAP (18px)
   *   ┌─────────────────────────────── Cell Wrapper (<li>) ──────────────────────────────┐
   *   │ ┌──────────────────────────── .cell-inner-container ───────────────────────────┐ │
   *   │ │ 6px top padding                                                              │ │
   *   │ │                                                                              │ │
   *   │ │ ┌─ Left Gutter (Run / Exec / Focus Border) ─┬──────── Editor Part ─────────┐ │ │
   *   │ │ │  Sticky vertical travel (~45px allowance) │  (Monaco surface)            │ │ │
   *   │ │ │                                         │  Visible height 200px          │ │ │
   *   │ │ │                                         │  Content height 380px          │ │ │
   *   │ │ └─────────────────────────────────────────┴────────────────────────────────┘ │ │
   *   │ │                                                                              │ │
   *   │ │ ┌─ Status Bar (22px) ──────────────────────────────────────────────────────┐ │ │
   *   │ │ │ language | indent | selection | kernel | state                           │ │ │
   *   │ │ └──────────────────────────────────────────────────────────────────────────┘ │ │
   *   │ │ 6px bottom padding                                                           │ │
   *   │ └──────────────────────────────────────────────────────────────────────────────┘ │
   *   │ (Outputs region begins at outputContainerOffset below input area)                │
   *   └──────────────────────────────────────────────────────────────────────────────────┘
   */
  layoutEditor(reason) {
    if (!this._enabled) {
      return;
    }
    const element = this.templateData.editorPart;
    if (this.viewCell.isInputCollapsed) {
      element.style.top = "";
      return;
    }
    const LINE_HEIGHT = this.notebookEditor.getLayoutInfo().fontInfo.lineHeight;
    const CELL_TOP_MARGIN = this.viewCell.layoutInfo.topMargin;
    const CELL_OUTLINE_WIDTH = this.viewCell.layoutInfo.outlineWidth;
    const STATUSBAR_HEIGHT = this.viewCell.layoutInfo.statusBarHeight;
    const editor = this.templateData.editor;
    const editorLayout = this.templateData.editor.getLayoutInfo();
    const editorWidth = this._initialized && (reason === "nbLayoutChange" || reason === "viewCellLayoutChange") ? this.viewCell.layoutInfo.editorWidth : editorLayout.width;
    const editorHeight = this.viewCell.layoutInfo.editorHeight;
    const scrollTop = this.notebookEditor.scrollTop;
    const elementTop = this.notebookEditor.getAbsoluteTopOfElement(this.viewCell);
    const elementBottom = this.notebookEditor.getAbsoluteBottomOfElement(this.viewCell);
    const elementHeight = this.notebookEditor.getHeightOfElement(this.viewCell);
    let editorContentHeight;
    const isInit = !this._initialized && reason === "init";
    if (isInit) {
      editorContentHeight = this._initialEditorDimension.height;
      this._establishedContentHeight = editorContentHeight;
    } else {
      const gotContentHeight = editor.getContentHeight();
      const fallbackEditorContentHeight = gotContentHeight === -1 ? Math.max(editor.getLayoutInfo().height, this._initialEditorDimension.height) : gotContentHeight;
      const shouldRefreshContentHeight = !this._initialized || reason === "onDidContentSizeChange" || reason === "viewCellLayoutChange" || reason === "nbLayoutChange";
      if (shouldRefreshContentHeight) {
        editorContentHeight = fallbackEditorContentHeight;
        this._establishedContentHeight = editorContentHeight;
      } else {
        editorContentHeight = this._establishedContentHeight ?? fallbackEditorContentHeight;
      }
    }
    const editorBottom = elementTop + this.viewCell.layoutInfo.outputContainerOffset;
    const scrollBottom = this.notebookEditor.scrollBottom;
    const viewportHeight = scrollBottom - scrollTop === 0 ? this.notebookEditor.getLayoutInfo().height : scrollBottom - scrollTop;
    const outputContainerOffset = this.viewCell.layoutInfo.outputContainerOffset;
    const scrollDirection = typeof this._previousScrollBottom === "number" ? scrollBottom < this._previousScrollBottom ? "up" : "down" : "down";
    this._previousScrollBottom = scrollBottom;
    let top = Math.max(0, scrollTop - elementTop - CELL_TOP_MARGIN - CELL_OUTLINE_WIDTH);
    const possibleEditorHeight = editorHeight - top;
    if (possibleEditorHeight < LINE_HEIGHT) {
      top = top - (LINE_HEIGHT - possibleEditorHeight) - CELL_OUTLINE_WIDTH;
    }
    let height = editorContentHeight;
    let editorScrollTop = 0;
    if (scrollTop <= elementTop + CELL_TOP_MARGIN) {
      const minimumEditorHeight = LINE_HEIGHT + this.notebookEditor.notebookOptions.getLayoutConfiguration().editorTopPadding;
      if (scrollBottom >= editorBottom) {
        height = clamp(editorContentHeight, minimumEditorHeight, editorContentHeight);
        this._editorVisibility = "Full";
      } else {
        height = clamp(scrollBottom - (elementTop + CELL_TOP_MARGIN) - STATUSBAR_HEIGHT, minimumEditorHeight, editorContentHeight) + 2 * CELL_OUTLINE_WIDTH;
        this._editorVisibility = "Bottom Clipped";
        editorScrollTop = 0;
      }
    } else {
      if (viewportHeight <= editorContentHeight && scrollBottom <= editorBottom) {
        const minimumEditorHeight = LINE_HEIGHT + this.notebookEditor.notebookOptions.getLayoutConfiguration().editorTopPadding;
        height = clamp(viewportHeight - STATUSBAR_HEIGHT, minimumEditorHeight, editorContentHeight - STATUSBAR_HEIGHT) + 2 * CELL_OUTLINE_WIDTH;
        this._editorVisibility = "Full (Small Viewport)";
        editorScrollTop = top;
      } else {
        const minimumEditorHeight = LINE_HEIGHT;
        height = clamp(editorContentHeight - (scrollTop - (elementTop + CELL_TOP_MARGIN)), minimumEditorHeight, editorContentHeight);
        if (scrollTop > editorBottom) {
          this._editorVisibility = "Invisible";
        } else {
          this._editorVisibility = "Top Clipped";
        }
        editorScrollTop = editorContentHeight - height;
      }
    }
    this._logService.debug(`${reason} (${this._editorVisibility}, ${this._initialized})`);
    this._logService.debug(`=> Editor Top = ${top}px (editHeight = ${editorHeight}, editContentHeight: ${editorContentHeight})`);
    this._logService.debug(`=> eleTop = ${elementTop}, eleBottom = ${elementBottom}, eleHeight = ${elementHeight}`);
    this._logService.debug(`=> scrollTop = ${scrollTop}, top = ${top}`);
    this._logService.debug(`=> cellTopMargin = ${CELL_TOP_MARGIN}, cellBottomMargin = ${this.viewCell.layoutInfo.topMargin}, cellOutline = ${CELL_OUTLINE_WIDTH}`);
    this._logService.debug(`=> scrollBottom: ${scrollBottom}, editBottom: ${editorBottom}, viewport: ${viewportHeight}, scroll: ${scrollDirection}, contOffset: ${outputContainerOffset})`);
    this._logService.debug(`=> Editor Height = ${height}px, Width: ${editorWidth}px, Initial Width: ${this._initialEditorDimension.width}, EditorScrollTop = ${editorScrollTop}px, StatusbarHeight = ${STATUSBAR_HEIGHT}, lineHeight = ${this.notebookEditor.getLayoutInfo().fontInfo.lineHeight}`);
    try {
      this._isUpdatingLayout = true;
      element.style.top = `${top}px`;
      editor.layout({
        width: this._initialized ? editorWidth : this._initialEditorDimension.width,
        height
      }, true);
      if (!this._pointerDown && editorScrollTop >= 0) {
        this._lastChangedEditorScrolltop = editorScrollTop;
        editor.setScrollTop(editorScrollTop);
      }
    } finally {
      this._initialized = true;
      this._isUpdatingLayout = false;
      this._logService.debug("Updated Editor Layout");
    }
  }
}
export {
  CodeCell,
  CodeCellLayout
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9jZWxsUGFydHMvY29kZUNlbGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vLyBhbGxvdy1hbnktdW5pY29kZS1jb21tZW50LWZpbGVcblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlLzJkL2RpbWVuc2lvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgdG9rZW5pemVUb1N0cmluZ1N5bmMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy90ZXh0VG9IdG1sVG9rZW5pemVyLmpzJztcbmltcG9ydCB7IElSZWFkb25seVRleHRCdWZmZXIsIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25Db250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi9icm93c2VyL2NvZGVBY3Rpb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDZWxsRm9jdXNNb2RlLCBFWFBBTkRfQ0VMTF9JTlBVVF9DT01NQU5EX0lELCBJQWN0aXZlTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbFZpZXdNb2RlbCwgb3V0cHV0RGlzcGxheUxpbWl0IH0gZnJvbSAnLi4vLi4vdmlld01vZGVsL2NvZGVDZWxsVmlld01vZGVsLmpzJztcbmltcG9ydCB7IENlbGxQYXJ0c0NvbGxlY3Rpb24gfSBmcm9tICcuLi9jZWxsUGFydC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxFZGl0b3JQb29sIH0gZnJvbSAnLi4vbm90ZWJvb2tDZWxsRWRpdG9yUG9vbC5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlLCBjb2xsYXBzZWRDZWxsVFRQb2xpY3kgfSBmcm9tICcuLi9ub3RlYm9va1JlbmRlcmluZ0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4vY2VsbEVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2VsbE91dHB1dENvbnRhaW5lciB9IGZyb20gJy4vY2VsbE91dHB1dC5qcyc7XG5pbXBvcnQgeyBDb2xsYXBzZWRDb2RlQ2VsbEV4ZWN1dGlvbkljb24gfSBmcm9tICcuL2NvZGVDZWxsRXhlY3V0aW9uSWNvbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tMb2dnaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0xvZ2dpbmdTZXJ2aWNlLmpzJztcblxuXG5leHBvcnQgY2xhc3MgQ29kZUNlbGwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfb3V0cHV0Q29udGFpbmVyUmVuZGVyZXI6IENlbGxPdXRwdXRDb250YWluZXI7XG5cdHByaXZhdGUgX2lucHV0Q29sbGFwc2VFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9yZW5kZXJlZElucHV0Q29sbGFwc2VTdGF0ZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVuZGVyZWRPdXRwdXRDb2xsYXBzZVN0YXRlOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2VsbFBhcnRzOiBDZWxsUGFydHNDb2xsZWN0aW9uO1xuXG5cdHByaXZhdGUgX2NvbGxhcHNlZEV4ZWN1dGlvbkljb246IENvbGxhcHNlZENvZGVDZWxsRXhlY3V0aW9uSWNvbjtcblx0cHJpdmF0ZSBfY2VsbEVkaXRvck9wdGlvbnM6IENlbGxFZGl0b3JPcHRpb25zO1xuXHRwcml2YXRlIF91c2VOZXdBcHByb2FjaEZvckVkaXRvckxheW91dCA9IHRydWU7XG5cdHByaXZhdGUgX3BvaW50ZXJEb3duSW5FZGl0b3IgPSBmYWxzZTtcblx0cHJpdmF0ZSBfcG9pbnRlckRyYWdnaW5nSW5FZGl0b3IgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2VsbExheW91dDogQ29kZUNlbGxMYXlvdXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnOiAob3V0cHV0OiBzdHJpbmcpID0+IHZvaWQ7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFZGl0b3I6IElBY3RpdmVOb3RlYm9va0VkaXRvckRlbGVnYXRlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlld0NlbGw6IENvZGVDZWxsVmlld01vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGVtcGxhdGVEYXRhOiBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUG9vbDogTm90ZWJvb2tDZWxsRWRpdG9yUG9vbCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIG5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlIG5vdGVib29rTG9nU2VydmljZTogSU5vdGVib29rTG9nZ2luZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgY2VsbEluZGV4ID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRDZWxsSW5kZXgodGhpcy52aWV3Q2VsbCk7XG5cdFx0Y29uc3QgZGVidWdQcmVmaXggPSBgW0NlbGwgJHtjZWxsSW5kZXh9XWA7XG5cdFx0Y29uc3QgZGVidWcgPSB0aGlzLl9kZWJ1ZyA9IChvdXRwdXQ6IHN0cmluZykgPT4ge1xuXHRcdFx0bm90ZWJvb2tMb2dTZXJ2aWNlLmRlYnVnKCdDZWxsTGF5b3V0JywgYCR7ZGVidWdQcmVmaXh9ICR7b3V0cHV0fWApO1xuXHRcdH07XG5cblx0XHR0aGlzLl9jZWxsRWRpdG9yT3B0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDZWxsRWRpdG9yT3B0aW9ucyh0aGlzLm5vdGVib29rRWRpdG9yLmdldEJhc2VDZWxsRWRpdG9yT3B0aW9ucyh2aWV3Q2VsbC5sYW5ndWFnZSksIHRoaXMubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0dGhpcy5fb3V0cHV0Q29udGFpbmVyUmVuZGVyZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENlbGxPdXRwdXRDb250YWluZXIsIG5vdGVib29rRWRpdG9yLCB2aWV3Q2VsbCwgdGVtcGxhdGVEYXRhLCB7IGxpbWl0OiBvdXRwdXREaXNwbGF5TGltaXQgfSk7XG5cdFx0dGhpcy5jZWxsUGFydHMgPSB0aGlzLl9yZWdpc3Rlcih0ZW1wbGF0ZURhdGEuY2VsbFBhcnRzLmNvbmNhdENvbnRlbnRQYXJ0KFt0aGlzLl9jZWxsRWRpdG9yT3B0aW9ucywgdGhpcy5fb3V0cHV0Q29udGFpbmVyUmVuZGVyZXJdLCBET00uZ2V0V2luZG93KG5vdGVib29rRWRpdG9yLmdldERvbU5vZGUoKSkpKTtcblxuXHRcdGNvbnN0IGluaXRpYWxFZGl0b3JEaW1lbnNpb24gPSB7IGhlaWdodDogdGhpcy5jYWxjdWxhdGVJbml0RWRpdG9ySGVpZ2h0KCksIHdpZHRoOiB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8uZWRpdG9yV2lkdGggfTtcblx0XHR0aGlzLl9jZWxsTGF5b3V0ID0gbmV3IENvZGVDZWxsTGF5b3V0KHRoaXMuX3VzZU5ld0FwcHJvYWNoRm9yRWRpdG9yTGF5b3V0LCBub3RlYm9va0VkaXRvciwgdmlld0NlbGwsIHRlbXBsYXRlRGF0YSwgeyBkZWJ1ZyB9LCBpbml0aWFsRWRpdG9yRGltZW5zaW9uKTtcblx0XHR0aGlzLmluaXRpYWxpemVFZGl0b3IoaW5pdGlhbEVkaXRvckRpbWVuc2lvbik7XG5cdFx0dGhpcy5fcmVuZGVyZWRJbnB1dENvbGxhcHNlU3RhdGUgPSBmYWxzZTsgLy8gZWRpdG9yIGlzIGFsd2F5cyBleHBhbmRlZCBpbml0aWFsbHlcblxuXHRcdHRoaXMucmVnaXN0ZXJOb3RlYm9va0VkaXRvckxpc3RlbmVycygpO1xuXHRcdHRoaXMucmVnaXN0ZXJWaWV3Q2VsbExheW91dENoYW5nZSgpO1xuXHRcdHRoaXMucmVnaXN0ZXJDZWxsRWRpdG9yRXZlbnRMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLnJlZ2lzdGVyTW91c2VMaXN0ZW5lcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KHRoaXMudmlld0NlbGwub25EaWRTdGFydEV4ZWN1dGlvbiwgdGhpcy52aWV3Q2VsbC5vbkRpZFN0b3BFeGVjdXRpb24pKChlKSA9PiB7XG5cdFx0XHR0aGlzLmNlbGxQYXJ0cy51cGRhdGVGb3JFeGVjdXRpb25TdGF0ZSh0aGlzLnZpZXdDZWxsLCBlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdDZWxsLm9uRGlkQ2hhbmdlU3RhdGUoZSA9PiB7XG5cdFx0XHR0aGlzLmNlbGxQYXJ0cy51cGRhdGVTdGF0ZSh0aGlzLnZpZXdDZWxsLCBlKTtcblxuXHRcdFx0aWYgKGUub3V0cHV0SXNIb3ZlcmVkQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUZvck91dHB1dEhvdmVyKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLm91dHB1dElzRm9jdXNlZENoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVGb3JPdXRwdXRGb2N1cygpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5tZXRhZGF0YUNoYW5nZWQgfHwgZS5pbnRlcm5hbE1ldGFkYXRhQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUVkaXRvck9wdGlvbnMoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuaW5wdXRDb2xsYXBzZWRDaGFuZ2VkIHx8IGUub3V0cHV0Q29sbGFwc2VkQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLnZpZXdDZWxsLnBhdXNlTGF5b3V0KCk7XG5cdFx0XHRcdGNvbnN0IHVwZGF0ZWQgPSB0aGlzLnVwZGF0ZUZvckNvbGxhcHNlU3RhdGUoKTtcblx0XHRcdFx0dGhpcy52aWV3Q2VsbC5yZXN1bWVMYXlvdXQoKTtcblx0XHRcdFx0aWYgKHVwZGF0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLnJlbGF5b3V0Q2VsbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmZvY3VzTW9kZUNoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVFZGl0b3JGb3JGb2N1c01vZGVDaGFuZ2UodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy51cGRhdGVFZGl0b3JPcHRpb25zKCk7XG5cdFx0dGhpcy51cGRhdGVFZGl0b3JGb3JGb2N1c01vZGVDaGFuZ2UoZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlRm9yT3V0cHV0SG92ZXIoKTtcblx0XHR0aGlzLnVwZGF0ZUZvck91dHB1dEZvY3VzKCk7XG5cblx0XHR0aGlzLmNlbGxQYXJ0cy5zY2hlZHVsZVJlbmRlckNlbGwodGhpcy52aWV3Q2VsbCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5jZWxsUGFydHMudW5yZW5kZXJDZWxsKHRoaXMudmlld0NlbGwpO1xuXHRcdH0pKTtcblxuXG5cdFx0Ly8gUmVuZGVyIE91dHB1dHNcblx0XHR0aGlzLnZpZXdDZWxsLmVkaXRvckhlaWdodCA9IGluaXRpYWxFZGl0b3JEaW1lbnNpb24uaGVpZ2h0O1xuXHRcdHRoaXMuX291dHB1dENvbnRhaW5lclJlbmRlcmVyLnJlbmRlcigpO1xuXHRcdHRoaXMuX3JlbmRlcmVkT3V0cHV0Q29sbGFwc2VTdGF0ZSA9IGZhbHNlOyAvLyB0aGUgb3V0cHV0IGlzIGFsd2F5cyByZW5kZXJlZCBpbml0aWFsbHlcblx0XHQvLyBOZWVkIHRvIGRvIHRoaXMgYWZ0ZXIgdGhlIGludGlhbCByZW5kZXJPdXRwdXRcblx0XHR0aGlzLmluaXRpYWxWaWV3VXBkYXRlRXhwYW5kZWQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld0NlbGwub25MYXlvdXRJbmZvUmVhZCgoKSA9PiB7XG5cdFx0XHR0aGlzLmNlbGxQYXJ0cy5wcmVwYXJlTGF5b3V0KCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZXhlY3V0aW9uSXRlbUVsZW1lbnQgPSBET00uYXBwZW5kKHRoaXMudGVtcGxhdGVEYXRhLmNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lciwgRE9NLiQoJy5jb2xsYXBzZWQtZXhlY3V0aW9uLWljb24nKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGV4ZWN1dGlvbkl0ZW1FbGVtZW50LnJlbW92ZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9jb2xsYXBzZWRFeGVjdXRpb25JY29uID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2xsYXBzZWRDb2RlQ2VsbEV4ZWN1dGlvbkljb24sIHRoaXMubm90ZWJvb2tFZGl0b3IsIHRoaXMudmlld0NlbGwsIGV4ZWN1dGlvbkl0ZW1FbGVtZW50KSk7XG5cdFx0dGhpcy51cGRhdGVGb3JDb2xsYXBzZVN0YXRlKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUodmlld0NlbGwub25EaWRDaGFuZ2VPdXRwdXRzLCB0aGlzLnVwZGF0ZUZvck91dHB1dHMuYmluZCh0aGlzKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh2aWV3Q2VsbC5vbkRpZENoYW5nZUxheW91dCwgdGhpcy51cGRhdGVGb3JMYXlvdXQuYmluZCh0aGlzKSkpO1xuXG5cdFx0dGhpcy5fY2VsbEVkaXRvck9wdGlvbnMuc2V0TGluZU51bWJlcnModGhpcy52aWV3Q2VsbC5saW5lTnVtYmVycyk7XG5cdFx0dGVtcGxhdGVEYXRhLmVkaXRvci51cGRhdGVPcHRpb25zKHRoaXMuX2NlbGxFZGl0b3JPcHRpb25zLmdldFVwZGF0ZWRWYWx1ZSh0aGlzLnZpZXdDZWxsLmludGVybmFsTWV0YWRhdGEsIHRoaXMudmlld0NlbGwudXJpKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvZGVDZWxsT3B0aW9ucyh0ZW1wbGF0ZURhdGE6IENvZGVDZWxsUmVuZGVyVGVtcGxhdGUpIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWRpdG9yLnVwZGF0ZU9wdGlvbnModGhpcy5fY2VsbEVkaXRvck9wdGlvbnMuZ2V0VXBkYXRlZFZhbHVlKHRoaXMudmlld0NlbGwuaW50ZXJuYWxNZXRhZGF0YSwgdGhpcy52aWV3Q2VsbC51cmkpKTtcblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZSgpIHsgY3RzLmRpc3Bvc2UodHJ1ZSk7IH0gfSk7XG5cdFx0cmFjZUNhbmNlbGxhdGlvbih0aGlzLnZpZXdDZWxsLnJlc29sdmVUZXh0TW9kZWwoKSwgY3RzLnRva2VuKS50aGVuKG1vZGVsID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdG1vZGVsLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRcdGluZGVudFNpemU6IHRoaXMuX2NlbGxFZGl0b3JPcHRpb25zLmluZGVudFNpemUsXG5cdFx0XHRcdFx0dGFiU2l6ZTogdGhpcy5fY2VsbEVkaXRvck9wdGlvbnMudGFiU2l6ZSxcblx0XHRcdFx0XHRpbnNlcnRTcGFjZXM6IHRoaXMuX2NlbGxFZGl0b3JPcHRpb25zLmluc2VydFNwYWNlcyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9wZW5kaW5nTGF5b3V0OiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHVwZGF0ZUZvckxheW91dCgpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nTGF5b3V0Py5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcGVuZGluZ0xheW91dCA9IERPTS5tb2RpZnkoRE9NLmdldFdpbmRvdyh0aGlzLm5vdGVib29rRWRpdG9yLmdldERvbU5vZGUoKSksICgpID0+IHtcblx0XHRcdHRoaXMuY2VsbFBhcnRzLnVwZGF0ZUludGVybmFsTGF5b3V0Tm93KHRoaXMudmlld0NlbGwpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVGb3JPdXRwdXRIb3ZlcigpIHtcblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2VsbC1vdXRwdXQtaG92ZXInLCB0aGlzLnZpZXdDZWxsLm91dHB1dElzSG92ZXJlZCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUZvck91dHB1dEZvY3VzKCkge1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjZWxsLW91dHB1dC1mb2N1cycsIHRoaXMudmlld0NlbGwub3V0cHV0SXNGb2N1c2VkKTtcblx0fVxuXG5cdHByaXZhdGUgY2FsY3VsYXRlSW5pdEVkaXRvckhlaWdodCgpIHtcblx0XHRjb25zdCBsaW5lTnVtID0gdGhpcy52aWV3Q2VsbC5saW5lQ291bnQ7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5mb250SW5mbz8ubGluZUhlaWdodCB8fCAxNztcblx0XHRjb25zdCBlZGl0b3JQYWRkaW5nID0gdGhpcy5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuY29tcHV0ZUVkaXRvclBhZGRpbmcodGhpcy52aWV3Q2VsbC5pbnRlcm5hbE1ldGFkYXRhLCB0aGlzLnZpZXdDZWxsLnVyaSk7XG5cdFx0Y29uc3QgZWRpdG9ySGVpZ2h0ID0gdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLmVkaXRvckhlaWdodCA9PT0gMFxuXHRcdFx0PyBsaW5lTnVtICogbGluZUhlaWdodCArIGVkaXRvclBhZGRpbmcudG9wICsgZWRpdG9yUGFkZGluZy5ib3R0b21cblx0XHRcdDogdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLmVkaXRvckhlaWdodDtcblx0XHRyZXR1cm4gZWRpdG9ySGVpZ2h0O1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplRWRpdG9yKGRpbWVuc2lvbjogSURpbWVuc2lvbikge1xuXHRcdHRoaXMuX2RlYnVnKGBJbml0aWFsaXplIEVkaXRvciAke2RpbWVuc2lvbi5oZWlnaHR9IHggJHtkaW1lbnNpb24ud2lkdGh9LCBTY3JvbGwgVG9wID0gJHt0aGlzLm5vdGVib29rRWRpdG9yLnNjcm9sbFRvcH1gKTtcblx0XHR0aGlzLl9jZWxsTGF5b3V0LmxheW91dEVkaXRvcignaW5pdCcpO1xuXHRcdHRoaXMubGF5b3V0RWRpdG9yKGRpbWVuc2lvbik7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih7IGRpc3Bvc2UoKSB7IGN0cy5kaXNwb3NlKHRydWUpOyB9IH0pO1xuXHRcdHJhY2VDYW5jZWxsYXRpb24odGhpcy52aWV3Q2VsbC5yZXNvbHZlVGV4dE1vZGVsKCksIGN0cy50b2tlbikudGhlbihtb2RlbCA9PiB7XG5cdFx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCB8fCBtb2RlbD8uaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG1vZGVsICYmIHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvcikge1xuXHRcdFx0XHR0aGlzLl9yZWlnc3Rlck1vZGVsTGlzdGVuZXJzKG1vZGVsKTtcblxuXHRcdFx0XHQvLyBzZXQgbW9kZWwgY2FuIHRyaWdnZXIgdmlldyB1cGRhdGUsIHdoaWNoIGNhbiBsZWFkIHRvIGRpc3Bvc2Ugb2YgdGhpcyBjZWxsXG5cdFx0XHRcdHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5zZXRNb2RlbChtb2RlbCk7XG5cblx0XHRcdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRtb2RlbC51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0XHRpbmRlbnRTaXplOiB0aGlzLl9jZWxsRWRpdG9yT3B0aW9ucy5pbmRlbnRTaXplLFxuXHRcdFx0XHRcdHRhYlNpemU6IHRoaXMuX2NlbGxFZGl0b3JPcHRpb25zLnRhYlNpemUsXG5cdFx0XHRcdFx0aW5zZXJ0U3BhY2VzOiB0aGlzLl9jZWxsRWRpdG9yT3B0aW9ucy5pbnNlcnRTcGFjZXMsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLnZpZXdDZWxsLmF0dGFjaFRleHRFZGl0b3IodGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLCB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8uZXN0aW1hdGVkSGFzSG9yaXpvbnRhbFNjcm9sbGluZyk7XG5cdFx0XHRcdGNvbnN0IGZvY3VzRWRpdG9ySWZOZWVkZWQgPSAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5nZXRBY3RpdmVDZWxsKCkgPT09IHRoaXMudmlld0NlbGwgJiZcblx0XHRcdFx0XHRcdHRoaXMudmlld0NlbGwuZm9jdXNNb2RlID09PSBDZWxsRm9jdXNNb2RlLkVkaXRvciAmJlxuXHRcdFx0XHRcdFx0KHRoaXMubm90ZWJvb2tFZGl0b3IuaGFzRWRpdG9yRm9jdXMoKSB8fCB0aGlzLm5vdGVib29rRWRpdG9yLmdldERvbU5vZGUoKS5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0RG9tTm9kZSgpLm93bmVyRG9jdW1lbnQuYm9keSkpIC8vIERvbid0IHN0ZWFsIGZvY3VzIGZyb20gb3RoZXIgd29ya2JlbmNoIHBhcnRzLCBidXQgaWYgYm9keSBoYXMgZm9jdXMsIHdlIGNhbiB0YWtlIGl0XG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRmb2N1c0VkaXRvcklmTmVlZGVkKCk7XG5cblx0XHRcdFx0Y29uc3QgcmVhbENvbnRlbnRIZWlnaHQgPSB0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuZ2V0Q29udGVudEhlaWdodCgpO1xuXHRcdFx0XHRpZiAocmVhbENvbnRlbnRIZWlnaHQgIT09IGRpbWVuc2lvbi5oZWlnaHQpIHtcblx0XHRcdFx0XHR0aGlzLm9uQ2VsbEVkaXRvckhlaWdodENoYW5nZSgnb25EaWRSZXNvbHZlVGV4dE1vZGVsJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvY3VzRWRpdG9ySWZOZWVkZWQoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2VsbEVkaXRvck9wdGlvbnMub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVDb2RlQ2VsbE9wdGlvbnModGhpcy50ZW1wbGF0ZURhdGEpKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUZvck91dHB1dHMoKTogdm9pZCB7XG5cdFx0RE9NLnNldFZpc2liaWxpdHkodGhpcy52aWV3Q2VsbC5vdXRwdXRzVmlld01vZGVscy5sZW5ndGggPiAwLCB0aGlzLnRlbXBsYXRlRGF0YS5mb2N1c1NpbmtFbGVtZW50KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRWRpdG9yT3B0aW9ucygpIHtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3I7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc1JlYWRvbmx5ID0gdGhpcy5ub3RlYm9va0VkaXRvci5pc1JlYWRPbmx5O1xuXHRcdGNvbnN0IHBhZGRpbmcgPSB0aGlzLm5vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucy5jb21wdXRlRWRpdG9yUGFkZGluZyh0aGlzLnZpZXdDZWxsLmludGVybmFsTWV0YWRhdGEsIHRoaXMudmlld0NlbGwudXJpKTtcblx0XHRjb25zdCBvcHRpb25zID0gZWRpdG9yLmdldE9wdGlvbnMoKTtcblx0XHRpZiAob3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnJlYWRPbmx5KSAhPT0gaXNSZWFkb25seSB8fCBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ucGFkZGluZykgIT09IHBhZGRpbmcpIHtcblx0XHRcdGVkaXRvci51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0cmVhZE9ubHk6IHRoaXMubm90ZWJvb2tFZGl0b3IuaXNSZWFkT25seSwgcGFkZGluZzogdGhpcy5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuY29tcHV0ZUVkaXRvclBhZGRpbmcodGhpcy52aWV3Q2VsbC5pbnRlcm5hbE1ldGFkYXRhLCB0aGlzLnZpZXdDZWxsLnVyaSlcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJOb3RlYm9va0VkaXRvckxpc3RlbmVycygpIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm5vdGVib29rRWRpdG9yLm9uRGlkU2Nyb2xsKCgpID0+IHtcblx0XHRcdHRoaXMuYWRqdXN0RWRpdG9yUG9zaXRpb24oKTtcblx0XHRcdHRoaXMuX2NlbGxMYXlvdXQubGF5b3V0RWRpdG9yKCduYkRpZFNjcm9sbCcpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubm90ZWJvb2tFZGl0b3Iub25EaWRDaGFuZ2VMYXlvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5hZGp1c3RFZGl0b3JQb3NpdGlvbigpO1xuXHRcdFx0dGhpcy5vbkNlbGxXaWR0aENoYW5nZSgnbmJMYXlvdXRDaGFuZ2UnKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFkanVzdEVkaXRvclBvc2l0aW9uKCkge1xuXHRcdGlmICh0aGlzLl91c2VOZXdBcHByb2FjaEZvckVkaXRvckxheW91dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBleHRyYU9mZnNldCA9IC02IC8qKiBkaXN0YW5jZSB0byB0aGUgdG9wIG9mIHRoZSBjZWxsIGVkaXRvciwgd2hpY2ggaXMgNnB4IHVuZGVyIHRoZSBmb2N1cyBpbmRpY2F0b3IgKi8gLSAxIC8qKiBib3JkZXIgKi87XG5cdFx0Y29uc3QgbWluID0gMDtcblxuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMubm90ZWJvb2tFZGl0b3Iuc2Nyb2xsVG9wO1xuXHRcdGNvbnN0IGVsZW1lbnRUb3AgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldEFic29sdXRlVG9wT2ZFbGVtZW50KHRoaXMudmlld0NlbGwpO1xuXHRcdGNvbnN0IGRpZmYgPSBzY3JvbGxUb3AgLSBlbGVtZW50VG9wICsgZXh0cmFPZmZzZXQ7XG5cblx0XHRjb25zdCBub3RlYm9va0VkaXRvckxheW91dCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXG5cdFx0Ly8gd2Ugc2hvdWxkIHN0b3AgYWRqdXN0aW5nIHRoZSB0b3Agd2hlbiB1c2VycyBhcmUgdmlld2luZyB0aGUgYm90dG9tIG9mIHRoZSBjZWxsIGVkaXRvclxuXHRcdGNvbnN0IGVkaXRvck1heEhlaWdodCA9IG5vdGVib29rRWRpdG9yTGF5b3V0LmhlaWdodFxuXHRcdFx0LSBub3RlYm9va0VkaXRvckxheW91dC5zdGlja3lIZWlnaHRcblx0XHRcdC0gMjYgLyoqIG5vdGVib29rIHRvb2xiYXIgKi87XG5cblx0XHRjb25zdCBtYXhUb3AgPVxuXHRcdFx0dGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLmVkaXRvckhlaWdodFxuXHRcdFx0Ly8gKyB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8uc3RhdHVzQmFySGVpZ2h0XG5cdFx0XHQtIGVkaXRvck1heEhlaWdodFxuXHRcdFx0O1xuXHRcdGNvbnN0IHRvcCA9IG1heFRvcCA+IDIwID9cblx0XHRcdGNsYW1wKG1pbiwgZGlmZiwgbWF4VG9wKSA6XG5cdFx0XHRtaW47XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yUGFydC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuXHRcdC8vIHNjcm9sbCB0aGUgZWRpdG9yIHdpdGggdG9wXG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLnNldFNjcm9sbFRvcCh0b3ApO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclZpZXdDZWxsTGF5b3V0Q2hhbmdlKCkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld0NlbGwub25EaWRDaGFuZ2VMYXlvdXQoKGUpID0+IHtcblx0XHRcdGlmIChlLm91dGVyV2lkdGggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHRcdFx0aWYgKGxheW91dEluZm8ud2lkdGggIT09IHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5lZGl0b3JXaWR0aCkge1xuXHRcdFx0XHRcdHRoaXMub25DZWxsV2lkdGhDaGFuZ2UoJ3ZpZXdDZWxsTGF5b3V0Q2hhbmdlJyk7XG5cdFx0XHRcdFx0dGhpcy5hZGp1c3RFZGl0b3JQb3NpdGlvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNlbGxFZGl0b3JFdmVudExpc3RlbmVycygpIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3Iub25EaWRDb250ZW50U2l6ZUNoYW5nZSgoZSkgPT4ge1xuXHRcdFx0aWYgKGUuY29udGVudEhlaWdodENoYW5nZWQpIHtcblx0XHRcdFx0aWYgKHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5lZGl0b3JIZWlnaHQgIT09IGUuY29udGVudEhlaWdodCkge1xuXHRcdFx0XHRcdHRoaXMub25DZWxsRWRpdG9ySGVpZ2h0Q2hhbmdlKGBvbkRpZENvbnRlbnRTaXplQ2hhbmdlYCk7XG5cdFx0XHRcdFx0dGhpcy5hZGp1c3RFZGl0b3JQb3NpdGlvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRoaXMuX3VzZU5ld0FwcHJvYWNoRm9yRWRpdG9yTGF5b3V0KSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdC8vIE9wdGlvbiA0OiBHYXRlIHNjcm9sbC1kcml2ZW4gcmVhY3Rpb25zIGR1cmluZyBhY3RpdmUgZHJhZy1zZWxlY3Rpb25cblx0XHRcdFx0aWYgKHRoaXMuX3BvaW50ZXJEb3duSW5FZGl0b3IgfHwgdGhpcy5fcG9pbnRlckRyYWdnaW5nSW5FZGl0b3IpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX2NlbGxMYXlvdXQuZWRpdG9yVmlzaWJpbGl0eSA9PT0gJ0ludmlzaWJsZScgfHwgIXRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5oYXNUZXh0Rm9jdXMoKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5fY2VsbExheW91dC5fbGFzdENoYW5nZWRFZGl0b3JTY3JvbGx0b3AgPT09IGUuc2Nyb2xsVG9wIHx8IHRoaXMuX2NlbGxMYXlvdXQuaXNVcGRhdGluZ0xheW91dCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLm5vdGVib29rRWRpdG9yLnNjcm9sbFRvcDtcblx0XHRcdFx0Y29uc3QgZGlmZiA9IGUuc2Nyb2xsVG9wIC0gKHRoaXMuX2NlbGxMYXlvdXQuX2xhc3RDaGFuZ2VkRWRpdG9yU2Nyb2xsdG9wID8/IDApO1xuXHRcdFx0XHRpZiAodGhpcy5fY2VsbExheW91dC5lZGl0b3JWaXNpYmlsaXR5ID09PSAnRnVsbCAoU21hbGwgVmlld3BvcnQpJyAmJiB0eXBlb2YgdGhpcy5fY2VsbExheW91dC5fbGFzdENoYW5nZWRFZGl0b3JTY3JvbGx0b3AgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0dGhpcy5fZGVidWcoYFNjcm9sbCBDaGFuZ2UgKDEpID0gJHtlLnNjcm9sbFRvcH0gY2hhbmdlZCBieSAke2RpZmZ9IChub3RlYm9vayBzY3JvbGxUb3A6ICR7c2Nyb2xsVG9wfSwgc2V0RWRpdG9yU2Nyb2xsVG9wOiAke2Uuc2Nyb2xsVG9wfSlgKTtcblx0XHRcdFx0XHQvLyB0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3Iuc2V0U2Nyb2xsVG9wKGUuc2Nyb2xsVG9wKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9jZWxsTGF5b3V0LmVkaXRvclZpc2liaWxpdHkgPT09ICdCb3R0b20gQ2xpcHBlZCcgJiYgdHlwZW9mIHRoaXMuX2NlbGxMYXlvdXQuX2xhc3RDaGFuZ2VkRWRpdG9yU2Nyb2xsdG9wID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHRoaXMuX2RlYnVnKGBTY3JvbGwgQ2hhbmdlICgyKSA9ICR7ZS5zY3JvbGxUb3B9IGNoYW5nZWQgYnkgJHtkaWZmfSAobm90ZWJvb2sgc2Nyb2xsVG9wOiAke3Njcm9sbFRvcH0sIHNldE5vdGVib29rU2Nyb2xsVG9wOiAke3Njcm9sbFRvcCArIGUuc2Nyb2xsVG9wfSlgKTtcblx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLnNldFNjcm9sbFRvcChzY3JvbGxUb3AgKyBlLnNjcm9sbFRvcCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fY2VsbExheW91dC5lZGl0b3JWaXNpYmlsaXR5ID09PSAnVG9wIENsaXBwZWQnICYmIHR5cGVvZiB0aGlzLl9jZWxsTGF5b3V0Ll9sYXN0Q2hhbmdlZEVkaXRvclNjcm9sbHRvcCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRjb25zdCBuZXdTY3JvbGxUb3AgPSBzY3JvbGxUb3AgKyBkaWZmIC0gMTtcblx0XHRcdFx0XHR0aGlzLl9kZWJ1ZyhgU2Nyb2xsIENoYW5nZSAoMykgPSAke2Uuc2Nyb2xsVG9wfSBjaGFuZ2VkIGJ5ICR7ZGlmZn0gKG5vdGVib29rIHNjcm9sbFRvcDogJHtzY3JvbGxUb3B9LCBzZXROb3RlYm9va1Njcm9sbFRvcD86ICR7bmV3U2Nyb2xsVG9wfSlgKTtcblx0XHRcdFx0XHRpZiAoc2Nyb2xsVG9wICE9PSBuZXdTY3JvbGxUb3ApIHtcblx0XHRcdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3Iuc2V0U2Nyb2xsVG9wKG5ld1Njcm9sbFRvcCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2RlYnVnKGBTY3JvbGwgQ2hhbmdlICg0KSA9ICR7ZS5zY3JvbGxUb3B9IGNoYW5nZWQgYnkgJHtkaWZmfSAobm90ZWJvb2sgc2Nyb2xsVG9wOiAke3Njcm9sbFRvcH0pYCk7XG5cdFx0XHRcdFx0dGhpcy5fY2VsbExheW91dC5fbGFzdENoYW5nZWRFZGl0b3JTY3JvbGx0b3AgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKGUpID0+IHtcblx0XHRcdGlmIChcblx0XHRcdFx0Ly8gZG8gbm90IHJldmVhbCB0aGUgY2VsbCBpbnRvIHZpZXcgaWYgdGhpcyBzZWxlY3Rpb24gY2hhbmdlIHdhcyBjYXVzZWQgYnkgcmVzdG9yaW5nIGVkaXRvcnNcblx0XHRcdFx0ZS5zb3VyY2UgPT09ICdyZXN0b3JlU3RhdGUnIHx8IGUub2xkTW9kZWxWZXJzaW9uSWQgPT09IDBcblx0XHRcdFx0Ly8gbm9yIGlmIHRoZSB0ZXh0IGVkaXRvciBpcyBub3QgYWN0dWFsbHkgZm9jdXNlZCAoZS5nLiBpbmxpbmUgY2hhdCBpcyBmb2N1c2VkIGFuZCBtb2RpZnlpbmcgdGhlIGNlbGwgY29udGVudClcblx0XHRcdFx0fHwgIXRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5oYXNUZXh0Rm9jdXMoKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3B0aW9uIDM6IEF2b2lkIHJlbGF5b3V0cyBkdXJpbmcgYWN0aXZlIHBvaW50ZXIgZHJhZyB0byBwcmV2ZW50IHN0dWNrIHNlbGVjdGlvbiBtb2RlXG5cdFx0XHRpZiAoKHRoaXMuX3BvaW50ZXJEb3duSW5FZGl0b3IgfHwgdGhpcy5fcG9pbnRlckRyYWdnaW5nSW5FZGl0b3IpICYmIHRoaXMuX3VzZU5ld0FwcHJvYWNoRm9yRWRpdG9yTGF5b3V0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cblx0XHRcdGlmIChzZWxlY3Rpb25zPy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgY29udGVudEhlaWdodCA9IHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5nZXRDb250ZW50SGVpZ2h0KCk7XG5cdFx0XHRcdGNvbnN0IGxheW91dENvbnRlbnRIZWlnaHQgPSB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8uZWRpdG9ySGVpZ2h0O1xuXG5cdFx0XHRcdGlmIChjb250ZW50SGVpZ2h0ICE9PSBsYXlvdXRDb250ZW50SGVpZ2h0KSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl91c2VOZXdBcHByb2FjaEZvckVkaXRvckxheW91dCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZGVidWcoYG9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uYCk7XG5cdFx0XHRcdFx0XHR0aGlzLm9uQ2VsbEVkaXRvckhlaWdodENoYW5nZSgnb25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24nKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBsYXN0U2VsZWN0aW9uID0gc2VsZWN0aW9uc1tzZWxlY3Rpb25zLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLnJldmVhbFJhbmdlSW5WaWV3QXN5bmModGhpcy52aWV3Q2VsbCwgbGFzdFNlbGVjdGlvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLm9uRGlkQmx1ckVkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHRDb2RlQWN0aW9uQ29udHJvbGxlci5nZXQodGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yKT8uaGlkZUxpZ2h0QnVsYldpZGdldCgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlaWdzdGVyTW9kZWxMaXN0ZW5lcnMobW9kZWw6IElUZXh0TW9kZWwpIHtcblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbC5vbkRpZENoYW5nZVRva2VucygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy52aWV3Q2VsbC5pc0lucHV0Q29sbGFwc2VkICYmIHRoaXMuX2lucHV0Q29sbGFwc2VFbGVtZW50KSB7XG5cdFx0XHRcdC8vIGZsdXNoIHRoZSBjb2xsYXBzZWQgaW5wdXQgd2l0aCB0aGUgbGF0ZXN0IHRva2Vuc1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gdGhpcy5fZ2V0UmljaFRleHRGcm9tTGluZVRva2Vucyhtb2RlbCk7XG5cdFx0XHRcdHRoaXMuX2lucHV0Q29sbGFwc2VFbGVtZW50LmlubmVySFRNTCA9IChjb2xsYXBzZWRDZWxsVFRQb2xpY3k/LmNyZWF0ZUhUTUwoY29udGVudCkgPz8gY29udGVudCkgYXMgc3RyaW5nO1xuXHRcdFx0XHR0aGlzLl9hdHRhY2hJbnB1dEV4cGFuZEJ1dHRvbih0aGlzLl9pbnB1dENvbGxhcHNlRWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck1vdXNlTGlzdGVuZXIoKSB7XG5cdFx0Ly8gUG9pbnRlci1zdGF0ZSBoYW5kbGluZyBpbiBub3RlYm9vayBjZWxsIGVkaXRvcnMgaGFzIGEgY291cGxlIG9mIGVhc3ktdG8tcmVncmVzcyBlZGdlIGNhc2VzOlxuXHRcdC8vIDEpIEhvbGRpbmcgdGhlIGxlZnQgbW91c2UgYnV0dG9uIHdoaWxlIHdoZWVsL3RyYWNrcGFkIHNjcm9sbGluZyBzaG91bGQgc2Nyb2xsIGFzIHVzdWFsLlxuXHRcdC8vICAgIFdlIHRoZXJlZm9yZSBvbmx5IHRyZWF0IHRoZSBpbnRlcmFjdGlvbiBhcyBhbiBcImFjdGl2ZSBkcmFnIHNlbGVjdGlvblwiIGFmdGVyIGFjdHVhbCBwb2ludGVyIG1vdmVtZW50LlxuXHRcdC8vIDIpIFwiU3R1Y2sgc2VsZWN0aW9uIG1vZGVcIiBjYW4gb2NjdXIgaWYgd2UgbWlzcyB0aGUgY29ycmVzcG9uZGluZyBtb3VzZXVwIChlLmcuIHJlbGVhc2luZyBvdXRzaWRlIHRoZSB3aW5kb3csXG5cdFx0Ly8gICAgZm9jdXMgbG9zcywgb3IgRVNDIGNhbmNlbGxpbmcgTW9uYWNvIHNlbGVjdGlvbi9kcmFnKS4gV2hlbiB0aGlzIGhhcHBlbnMsIGxlYXZpbmcgYW55IG9mIG91ciBkcmFnL3BvaW50ZXJcblx0XHQvLyAgICBmbGFncyBzZXQgd2lsbCBpbmNvcnJlY3RseSBnYXRlIHNjcm9sbC9sYXlvdXQgc3luY2luZyBhbmQgbWFrZSB0aGUgZWRpdG9yIGZlZWwgc3R1Y2suXG5cdFx0Ly8gICAgVG8gYXZvaWQgdGhhdCwgd2UgcmVzZXQgc3RhdGUgb24gbXVsdGlwbGUgY2FuY2VsbGF0aW9uIHBhdGhzIGFuZCBhbHNvIHNlbGYtaGVhbCBvbiBtb3VzZW1vdmUuXG5cdFx0Y29uc3QgcmVzZXRQb2ludGVyU3RhdGUgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLl9wb2ludGVyRG93bkluRWRpdG9yID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9wb2ludGVyRHJhZ2dpbmdJbkVkaXRvciA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fY2VsbExheW91dC5zZXRQb2ludGVyRG93bihmYWxzZSk7XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5vbk1vdXNlRG93bihlID0+IHtcblx0XHRcdC8vIHByZXZlbnQgZGVmYXVsdCBvbiByaWdodCBtb3VzZSBjbGljaywgb3RoZXJ3aXNlIGl0IHdpbGwgdHJpZ2dlciB1bmV4cGVjdGVkIGZvY3VzIGNoYW5nZXNcblx0XHRcdC8vIHRoZSBjYXRjaCBpcywgaXQgbWVhbnMgd2UgZG9uJ3QgYWxsb3cgY3VzdG9taXphdGlvbiBvZiByaWdodCBidXR0b24gbW91c2UgZG93biBoYW5kbGVycyBvdGhlciB0aGFuIHRoZSBidWlsdCBpbiBvbmVzLlxuXHRcdFx0aWYgKGUuZXZlbnQucmlnaHRCdXR0b24pIHtcblx0XHRcdFx0ZS5ldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fdXNlTmV3QXBwcm9hY2hGb3JFZGl0b3JMYXlvdXQpIHtcblx0XHRcdFx0Ly8gVHJhY2sgcG9pbnRlci1kb3duIGFuZCBwb2ludGVyLWRyYWcgc2VwYXJhdGVseS5cblx0XHRcdFx0Ly8gSG9sZGluZyB0aGUgbGVmdCBidXR0b24gd2hpbGUgd2hlZWwvdHJhY2twYWQgc2Nyb2xsaW5nIHNob3VsZCBiZWhhdmUgbGlrZSBub3JtYWwgc2Nyb2xsaW5nLlxuXHRcdFx0XHRpZiAoZS5ldmVudC5sZWZ0QnV0dG9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fcG9pbnRlckRvd25JbkVkaXRvciA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5fcG9pbnRlckRyYWdnaW5nSW5FZGl0b3IgPSBmYWxzZTtcblx0XHRcdFx0XHR0aGlzLl9jZWxsTGF5b3V0LnNldFBvaW50ZXJEb3duKGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLl91c2VOZXdBcHByb2FjaEZvckVkaXRvckxheW91dCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLm9uTW91c2VNb3ZlKGUgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX3BvaW50ZXJEb3duSW5FZGl0b3IpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTZWxmLWhlYWw6IGlmIHdlIG1pc3NlZCBhIG1vdXNldXAgKGUuZy4gZm9jdXMgbG9zcyksIGNsZWFyIHRoZSBkcmFnIHN0YXRlIGFzIHNvb24gYXMgd2UgY2FuIG9ic2VydmUgaXQuXG5cdFx0XHRcdGlmICghZS5ldmVudC5sZWZ0QnV0dG9uKSB7XG5cdFx0XHRcdFx0cmVzZXRQb2ludGVyU3RhdGUoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIXRoaXMuX3BvaW50ZXJEcmFnZ2luZ0luRWRpdG9yKSB7XG5cdFx0XHRcdFx0Ly8gT25seSBjb25zaWRlciBpdCBhIGRyYWctc2VsZWN0aW9uIG9uY2UgdGhlIHBvaW50ZXIgYWN0dWFsbHkgbW92ZXMgd2l0aCB0aGUgbGVmdCBidXR0b24gZG93bi5cblx0XHRcdFx0XHR0aGlzLl9wb2ludGVyRHJhZ2dpbmdJbkVkaXRvciA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5fY2VsbExheW91dC5zZXRQb2ludGVyRG93bih0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl91c2VOZXdBcHByb2FjaEZvckVkaXRvckxheW91dCkge1xuXHRcdFx0Ly8gRW5zdXJlIHdlIHJlc2V0IHBvaW50ZXItZG93biBldmVuIGlmIG1vdXNldXAgbGFuZHMgb3V0c2lkZSB0aGUgZWRpdG9yXG5cdFx0XHRjb25zdCB3aW4gPSBET00uZ2V0V2luZG93KHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0RG9tTm9kZSgpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIod2luLCAnbW91c2V1cCcsIHJlc2V0UG9pbnRlclN0YXRlKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbiwgJ3BvaW50ZXJ1cCcsIHJlc2V0UG9pbnRlclN0YXRlKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbiwgJ3BvaW50ZXJjYW5jZWwnLCByZXNldFBvaW50ZXJTdGF0ZSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aW4sICdibHVyJywgcmVzZXRQb2ludGVyU3RhdGUpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIod2luLCAna2V5ZG93bicsIGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFc2NhcGUnICYmICh0aGlzLl9wb2ludGVyRG93bkluRWRpdG9yIHx8IHRoaXMuX3BvaW50ZXJEcmFnZ2luZ0luRWRpdG9yKSkge1xuXHRcdFx0XHRcdHJlc2V0UG9pbnRlclN0YXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFByZXNlcnZlRWRpdG9yKCkge1xuXHRcdC8vIFRoZSBET00gZm9jdXMgbmVlZHMgdG8gYmUgYWRqdXN0ZWQ6XG5cdFx0Ly8gd2hlbiBhIGNlbGwgZWRpdG9yIHNob3VsZCBiZSBmb2N1c2VkXG5cdFx0Ly8gdGhlIGRvY3VtZW50IGFjdGl2ZSBlbGVtZW50IGlzIGluc2lkZSB0aGUgbm90ZWJvb2sgZWRpdG9yIG9yIHRoZSBkb2N1bWVudCBib2R5IChjZWxsIGVkaXRvciBiZWluZyBkaXNwb3NlZCBwcmV2aW91c2x5KVxuXHRcdHJldHVybiB0aGlzLm5vdGVib29rRWRpdG9yLmdldEFjdGl2ZUNlbGwoKSA9PT0gdGhpcy52aWV3Q2VsbFxuXHRcdFx0JiYgdGhpcy52aWV3Q2VsbC5mb2N1c01vZGUgPT09IENlbGxGb2N1c01vZGUuRWRpdG9yXG5cdFx0XHQmJiAodGhpcy5ub3RlYm9va0VkaXRvci5oYXNFZGl0b3JGb2N1cygpIHx8IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0RG9tTm9kZSgpLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXREb21Ob2RlKCkub3duZXJEb2N1bWVudC5ib2R5KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRWRpdG9yRm9yRm9jdXNNb2RlQ2hhbmdlKHN5bmM6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5zaG91bGRQcmVzZXJ2ZUVkaXRvcigpKSB7XG5cdFx0XHRpZiAoc3luYykge1xuXHRcdFx0XHR0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuZm9jdXMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5ydW5BdFRoaXNPclNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoRE9NLmdldFdpbmRvdyh0aGlzLnRlbXBsYXRlRGF0YS5jb250YWluZXIpLCAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2VsbC1lZGl0b3ItZm9jdXMnLCB0aGlzLnZpZXdDZWxsLmZvY3VzTW9kZSA9PT0gQ2VsbEZvY3VzTW9kZS5FZGl0b3IpO1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjZWxsLW91dHB1dC1mb2N1cycsIHRoaXMudmlld0NlbGwuZm9jdXNNb2RlID09PSBDZWxsRm9jdXNNb2RlLk91dHB1dCk7XG5cdH1cblx0cHJpdmF0ZSB1cGRhdGVGb3JDb2xsYXBzZVN0YXRlKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLnZpZXdDZWxsLmlzT3V0cHV0Q29sbGFwc2VkID09PSB0aGlzLl9yZW5kZXJlZE91dHB1dENvbGxhcHNlU3RhdGUgJiZcblx0XHRcdHRoaXMudmlld0NlbGwuaXNJbnB1dENvbGxhcHNlZCA9PT0gdGhpcy5fcmVuZGVyZWRJbnB1dENvbGxhcHNlU3RhdGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdDZWxsLmxheW91dENoYW5nZSh7IGVkaXRvckhlaWdodDogdHJ1ZSB9KTtcblxuXHRcdGlmICh0aGlzLnZpZXdDZWxsLmlzSW5wdXRDb2xsYXBzZWQpIHtcblx0XHRcdHRoaXMuX2NvbGxhcHNlSW5wdXQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2hvd0lucHV0KCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudmlld0NlbGwuaXNPdXRwdXRDb2xsYXBzZWQpIHtcblx0XHRcdHRoaXMuX2NvbGxhcHNlT3V0cHV0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Nob3dPdXRwdXQoZmFsc2UpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVsYXlvdXRDZWxsKCk7XG5cblx0XHR0aGlzLl9yZW5kZXJlZE91dHB1dENvbGxhcHNlU3RhdGUgPSB0aGlzLnZpZXdDZWxsLmlzT3V0cHV0Q29sbGFwc2VkO1xuXHRcdHRoaXMuX3JlbmRlcmVkSW5wdXRDb2xsYXBzZVN0YXRlID0gdGhpcy52aWV3Q2VsbC5pc0lucHV0Q29sbGFwc2VkO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9jb2xsYXBzZUlucHV0KCkge1xuXHRcdC8vIGhpZGUgdGhlIGVkaXRvciBhbmQgZXhlY3V0aW9uIGxhYmVsLCBrZWVwIHRoZSBydW4gYnV0dG9uXG5cdFx0RE9NLmhpZGUodGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yUGFydCk7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2lucHV0LWNvbGxhcHNlZCcsIHRydWUpO1xuXG5cdFx0Ly8gcmVtb3ZlIGlucHV0IHByZXZpZXdcblx0XHR0aGlzLl9yZW1vdmVJbnB1dENvbGxhcHNlUHJldmlldygpO1xuXG5cdFx0dGhpcy5fY29sbGFwc2VkRXhlY3V0aW9uSWNvbi5zZXRWaXNpYmlsaXR5KHRydWUpO1xuXG5cdFx0Ly8gdXBkYXRlIHByZXZpZXdcblx0XHRjb25zdCByaWNoRWRpdG9yVGV4dCA9IHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5oYXNNb2RlbCgpID8gdGhpcy5fZ2V0UmljaFRleHRGcm9tTGluZVRva2Vucyh0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuZ2V0TW9kZWwoKSkgOiB0aGlzLl9nZXRSaWNoVGV4dCh0aGlzLnZpZXdDZWxsLnRleHRCdWZmZXIsIHRoaXMudmlld0NlbGwubGFuZ3VhZ2UpO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBET00uJCgnZGl2LmNlbGwtY29sbGFwc2UtcHJldmlldycpO1xuXHRcdGVsZW1lbnQuaW5uZXJIVE1MID0gKGNvbGxhcHNlZENlbGxUVFBvbGljeT8uY3JlYXRlSFRNTChyaWNoRWRpdG9yVGV4dCkgPz8gcmljaEVkaXRvclRleHQpIGFzIHN0cmluZztcblx0XHR0aGlzLl9pbnB1dENvbGxhcHNlRWxlbWVudCA9IGVsZW1lbnQ7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY2VsbElucHV0Q29sbGFwc2VkQ29udGFpbmVyLmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuXHRcdHRoaXMuX2F0dGFjaElucHV0RXhwYW5kQnV0dG9uKGVsZW1lbnQpO1xuXG5cdFx0RE9NLnNob3codGhpcy50ZW1wbGF0ZURhdGEuY2VsbElucHV0Q29sbGFwc2VkQ29udGFpbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgX2F0dGFjaElucHV0RXhwYW5kQnV0dG9uKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29uc3QgZXhwYW5kSWNvbiA9IERPTS4kKCdzcGFuLmV4cGFuZElucHV0SWNvbicpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoRVhQQU5EX0NFTExfSU5QVVRfQ09NTUFORF9JRCk7XG5cdFx0aWYgKGtleWJpbmRpbmcpIHtcblx0XHRcdGVsZW1lbnQudGl0bGUgPSBsb2NhbGl6ZSgnY2VsbEV4cGFuZElucHV0QnV0dG9uTGFiZWxXaXRoRG91YmxlQ2xpY2snLCBcIkRvdWJsZS1jbGljayB0byBleHBhbmQgY2VsbCBpbnB1dCAoezB9KVwiLCBrZXliaW5kaW5nLmdldExhYmVsKCkpO1xuXHRcdFx0ZXhwYW5kSWNvbi50aXRsZSA9IGxvY2FsaXplKCdjZWxsRXhwYW5kSW5wdXRCdXR0b25MYWJlbCcsIFwiRXhwYW5kIENlbGwgSW5wdXQgKHswfSlcIiwga2V5YmluZGluZy5nZXRMYWJlbCgpKTtcblx0XHR9XG5cblx0XHRleHBhbmRJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5tb3JlKSk7XG5cdFx0ZWxlbWVudC5hcHBlbmRDaGlsZChleHBhbmRJY29uKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dJbnB1dCgpIHtcblx0XHR0aGlzLl9jb2xsYXBzZWRFeGVjdXRpb25JY29uLnNldFZpc2liaWxpdHkoZmFsc2UpO1xuXHRcdERPTS5zaG93KHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvclBhcnQpO1xuXHRcdERPTS5oaWRlKHRoaXMudGVtcGxhdGVEYXRhLmNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSaWNoVGV4dChidWZmZXI6IElSZWFkb25seVRleHRCdWZmZXIsIGxhbmd1YWdlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdG9rZW5pemVUb1N0cmluZ1N5bmModGhpcy5sYW5ndWFnZVNlcnZpY2UsIGJ1ZmZlci5nZXRMaW5lQ29udGVudCgxKSwgbGFuZ3VhZ2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmljaFRleHRGcm9tTGluZVRva2Vucyhtb2RlbDogSVRleHRNb2RlbCkge1xuXHRcdGxldCByZXN1bHQgPSBgPGRpdiBjbGFzcz1cIm1vbmFjby10b2tlbml6ZWQtc291cmNlXCI+YDtcblxuXHRcdGNvbnN0IGZpcnN0TGluZVRva2VucyA9IG1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKDEpO1xuXHRcdGNvbnN0IHZpZXdMaW5lVG9rZW5zID0gZmlyc3RMaW5lVG9rZW5zLmluZmxhdGUoKTtcblx0XHRjb25zdCBsaW5lID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoMSk7XG5cdFx0bGV0IHN0YXJ0T2Zmc2V0ID0gMDtcblx0XHRmb3IgKGxldCBqID0gMCwgbGVuSiA9IHZpZXdMaW5lVG9rZW5zLmdldENvdW50KCk7IGogPCBsZW5KOyBqKyspIHtcblx0XHRcdGNvbnN0IHR5cGUgPSB2aWV3TGluZVRva2Vucy5nZXRDbGFzc05hbWUoaik7XG5cdFx0XHRjb25zdCBlbmRJbmRleCA9IHZpZXdMaW5lVG9rZW5zLmdldEVuZE9mZnNldChqKTtcblx0XHRcdHJlc3VsdCArPSBgPHNwYW4gY2xhc3M9XCIke3R5cGV9XCI+JHtzdHJpbmdzLmVzY2FwZShsaW5lLnN1YnN0cmluZyhzdGFydE9mZnNldCwgZW5kSW5kZXgpKX08L3NwYW4+YDtcblx0XHRcdHN0YXJ0T2Zmc2V0ID0gZW5kSW5kZXg7XG5cdFx0fVxuXG5cdFx0cmVzdWx0ICs9IGA8L2Rpdj5gO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVJbnB1dENvbGxhcHNlUHJldmlldygpIHtcblx0XHRjb25zdCBjaGlsZHJlbiA9IHRoaXMudGVtcGxhdGVEYXRhLmNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lci5jaGlsZHJlbjtcblx0XHRjb25zdCBlbGVtZW50cyA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChjaGlsZHJlbltpXS5jbGFzc0xpc3QuY29udGFpbnMoJ2NlbGwtY29sbGFwc2UtcHJldmlldycpKSB7XG5cdFx0XHRcdGVsZW1lbnRzLnB1c2goY2hpbGRyZW5baV0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGVsZW1lbnRzLmZvckVhY2goZWxlbWVudCA9PiB7XG5cdFx0XHRlbGVtZW50LnJlbW92ZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlT3V0cHV0SW5uZXJDb250YWluZXIoaGlkZTogYm9vbGVhbikge1xuXHRcdGNvbnN0IGNoaWxkcmVuID0gdGhpcy50ZW1wbGF0ZURhdGEub3V0cHV0Q29udGFpbmVyLmRvbU5vZGUuY2hpbGRyZW47XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKGNoaWxkcmVuW2ldLmNsYXNzTGlzdC5jb250YWlucygnb3V0cHV0LWlubmVyLWNvbnRhaW5lcicpKSB7XG5cdFx0XHRcdERPTS5zZXRWaXNpYmlsaXR5KCFoaWRlLCBjaGlsZHJlbltpXSBhcyBIVE1MRWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY29sbGFwc2VPdXRwdXQoKSB7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ291dHB1dC1jb2xsYXBzZWQnLCB0cnVlKTtcblx0XHRET00uc2hvdyh0aGlzLnRlbXBsYXRlRGF0YS5jZWxsT3V0cHV0Q29sbGFwc2VkQ29udGFpbmVyKTtcblx0XHR0aGlzLl91cGRhdGVPdXRwdXRJbm5lckNvbnRhaW5lcih0cnVlKTtcblx0XHR0aGlzLl9vdXRwdXRDb250YWluZXJSZW5kZXJlci52aWV3VXBkYXRlSGlkZU91cHV0cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd091dHB1dChpbml0UmVuZGVyaW5nOiBib29sZWFuKSB7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ291dHB1dC1jb2xsYXBzZWQnLCBmYWxzZSk7XG5cdFx0RE9NLmhpZGUodGhpcy50ZW1wbGF0ZURhdGEuY2VsbE91dHB1dENvbGxhcHNlZENvbnRhaW5lcik7XG5cdFx0dGhpcy5fdXBkYXRlT3V0cHV0SW5uZXJDb250YWluZXIoZmFsc2UpO1xuXHRcdHRoaXMuX291dHB1dENvbnRhaW5lclJlbmRlcmVyLnZpZXdVcGRhdGVTaG93T3V0cHV0cyhpbml0UmVuZGVyaW5nKTtcblx0fVxuXG5cdHByaXZhdGUgaW5pdGlhbFZpZXdVcGRhdGVFeHBhbmRlZCgpOiB2b2lkIHtcblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaW5wdXQtY29sbGFwc2VkJywgZmFsc2UpO1xuXHRcdERPTS5zaG93KHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvclBhcnQpO1xuXHRcdERPTS5oaWRlKHRoaXMudGVtcGxhdGVEYXRhLmNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lcik7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ291dHB1dC1jb2xsYXBzZWQnLCBmYWxzZSk7XG5cdFx0dGhpcy5fc2hvd091dHB1dCh0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgbGF5b3V0RWRpdG9yKGRpbWVuc2lvbjogSURpbWVuc2lvbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl91c2VOZXdBcHByb2FjaEZvckVkaXRvckxheW91dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlZGl0b3JMYXlvdXQgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHRjb25zdCBtYXhIZWlnaHQgPSBNYXRoLm1pbihcblx0XHRcdGVkaXRvckxheW91dC5oZWlnaHRcblx0XHRcdC0gZWRpdG9yTGF5b3V0LnN0aWNreUhlaWdodFxuXHRcdFx0LSAyNiAvKiogbm90ZWJvb2sgdG9vbGJhciAqLyxcblx0XHRcdGRpbWVuc2lvbi5oZWlnaHRcblx0XHQpO1xuXHRcdHRoaXMuX2RlYnVnKGBMYXlvdXQgRWRpdG9yOiBXaWR0aCA9ICR7ZGltZW5zaW9uLndpZHRofSwgSGVpZ2h0ID0gJHttYXhIZWlnaHR9IChSZXF1ZXN0ZWQ6ICR7ZGltZW5zaW9uLmhlaWdodH0sIEVkaXRvciBMYXlvdXQgSGVpZ2h0OiAke2VkaXRvckxheW91dC5oZWlnaHR9LCBTdGlja3k6ICR7ZWRpdG9yTGF5b3V0LnN0aWNreUhlaWdodH0pYCk7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLmxheW91dCh7XG5cdFx0XHR3aWR0aDogZGltZW5zaW9uLndpZHRoLFxuXHRcdFx0aGVpZ2h0OiBtYXhIZWlnaHRcblx0XHR9LCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgb25DZWxsV2lkdGhDaGFuZ2UoZGJnUmVhc29uRm9yQ2hhbmdlOiBDZWxsTGF5b3V0Q2hhbmdlUmVhc29uKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVidWcoYENlbGwgRWRpdG9yIFdpZHRoIENoYW5nZSwgJHtkYmdSZWFzb25Gb3JDaGFuZ2V9LCBDb250ZW50IEhlaWdodCA9ICR7dGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLmdldENvbnRlbnRIZWlnaHQoKX1gKTtcblx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuZ2V0Q29udGVudEhlaWdodCgpO1xuXHRcdGlmICh0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0dGhpcy5fZGVidWcoYCoqKiogVXBkYXRpbmcgQ2VsbCBFZGl0b3IgSGVpZ2h0ICgxKSwgQ29udGVudEhlaWdodDogJHtoZWlnaHR9LCBDb2RlQ2VsbExheW91dEluZm8uRWRpdG9yV2lkdGggJHt0aGlzLnZpZXdDZWxsLmxheW91dEluZm8uZWRpdG9yV2lkdGh9LCBFZGl0b3JMYXlvdXRJbmZvICR7dGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLmdldExheW91dEluZm8oKS5oZWlnaHR9ICoqKipgKTtcblx0XHRcdHRoaXMudmlld0NlbGwuZWRpdG9ySGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdFx0dGhpcy5yZWxheW91dENlbGwoKTtcblx0XHRcdHRoaXMubGF5b3V0RWRpdG9yKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0d2lkdGg6IHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5lZGl0b3JXaWR0aCxcblx0XHRcdFx0XHRoZWlnaHRcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZGVidWcoYENlbGwgRWRpdG9yIFdpZHRoIENoYW5nZSB3aXRob3V0IG1vZGVsLCByZXR1cm4gKDEpLCBDb250ZW50SGVpZ2h0OiAke2hlaWdodH0sIENvZGVDZWxsTGF5b3V0SW5mby5FZGl0b3JXaWR0aCAke3RoaXMudmlld0NlbGwubGF5b3V0SW5mby5lZGl0b3JXaWR0aH0sIEVkaXRvckxheW91dEluZm8gJHt0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpLmhlaWdodH1gKTtcblx0XHR9XG5cdFx0dGhpcy5fY2VsbExheW91dC5sYXlvdXRFZGl0b3IoZGJnUmVhc29uRm9yQ2hhbmdlKTtcblx0fVxuXG5cdHByaXZhdGUgb25DZWxsRWRpdG9ySGVpZ2h0Q2hhbmdlKGRiZ1JlYXNvbkZvckNoYW5nZTogQ2VsbExheW91dENoYW5nZVJlYXNvbik6IHZvaWQge1xuXHRcdGNvbnN0IGhlaWdodCA9IHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5nZXRDb250ZW50SGVpZ2h0KCk7XG5cdFx0aWYgKCF0aGlzLnRlbXBsYXRlRGF0YS5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0dGhpcy5fZGVidWcoYENlbGwgRWRpdG9yIEhlaWdodCBDaGFuZ2Ugd2l0aG91dCBtb2RlbCwgcmV0dXJuICgyKSwgQ29udGVudEhlaWdodDogJHtoZWlnaHR9LCBDb2RlQ2VsbExheW91dEluZm8uRWRpdG9yV2lkdGggJHt0aGlzLnZpZXdDZWxsLmxheW91dEluZm8uZWRpdG9yV2lkdGh9LCBFZGl0b3JMYXlvdXRJbmZvICR7dGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yLmdldExheW91dEluZm8oKX1gKTtcblx0XHR9XG5cdFx0dGhpcy5fZGVidWcoYENlbGwgRWRpdG9yIEhlaWdodCBDaGFuZ2UgKCR7ZGJnUmVhc29uRm9yQ2hhbmdlfSk6ICR7aGVpZ2h0fWApO1xuXHRcdHRoaXMuX2RlYnVnKGAqKioqIFVwZGF0aW5nIENlbGwgRWRpdG9yIEhlaWdodCAoMiksIENvbnRlbnRIZWlnaHQ6ICR7aGVpZ2h0fSwgQ29kZUNlbGxMYXlvdXRJbmZvLkVkaXRvcldpZHRoICR7dGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLmVkaXRvcldpZHRofSwgRWRpdG9yTGF5b3V0SW5mbyAke3RoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5nZXRMYXlvdXRJbmZvKCkuaGVpZ2h0fSAqKioqYCk7XG5cdFx0Y29uc3Qgdmlld0xheW91dCA9IHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0dGhpcy52aWV3Q2VsbC5lZGl0b3JIZWlnaHQgPSBoZWlnaHQ7XG5cdFx0dGhpcy5yZWxheW91dENlbGwoKTtcblx0XHR0aGlzLmxheW91dEVkaXRvcihcblx0XHRcdHtcblx0XHRcdFx0d2lkdGg6IHZpZXdMYXlvdXQud2lkdGgsXG5cdFx0XHRcdGhlaWdodFxuXHRcdFx0fVxuXHRcdCk7XG5cdFx0dGhpcy5fY2VsbExheW91dC5sYXlvdXRFZGl0b3IoZGJnUmVhc29uRm9yQ2hhbmdlKTtcblx0fVxuXG5cdHJlbGF5b3V0Q2VsbCgpIHtcblx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmxheW91dE5vdGVib29rQ2VsbCh0aGlzLnZpZXdDZWxsLCB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8udG90YWxIZWlnaHQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblxuXHRcdC8vIG1vdmUgZm9jdXMgYmFjayB0byB0aGUgY2VsbCBsaXN0IG90aGVyd2lzZSB0aGUgZm9jdXMgZ29lcyB0byBib2R5XG5cdFx0aWYgKHRoaXMuc2hvdWxkUHJlc2VydmVFZGl0b3IoKSkge1xuXHRcdFx0Ly8gbm93IHRoZSBmb2N1cyBpcyBvbiB0aGUgbW9uYWNvIGVkaXRvciBmb3IgdGhlIGNlbGwgYnV0IGRldGFjaGVkIGZyb20gdGhlIHJvd3MuXG5cdFx0XHR0aGlzLmVkaXRvclBvb2wucHJlc2VydmVGb2N1c2VkRWRpdG9yKHRoaXMudmlld0NlbGwpO1xuXHRcdH1cblxuXHRcdHRoaXMudmlld0NlbGwuZGV0YWNoVGV4dEVkaXRvcigpO1xuXHRcdHRoaXMuX3JlbW92ZUlucHV0Q29sbGFwc2VQcmV2aWV3KCk7XG5cdFx0dGhpcy5fb3V0cHV0Q29udGFpbmVyUmVuZGVyZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3BlbmRpbmdMYXlvdXQ/LmRpc3Bvc2UoKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG50eXBlIENlbGxMYXlvdXRDaGFuZ2VSZWFzb24gPSAnbmJMYXlvdXRDaGFuZ2UnIHwgJ25iRGlkU2Nyb2xsJyB8ICd2aWV3Q2VsbExheW91dENoYW5nZScgfCAnaW5pdCcgfCAnb25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24nIHwgJ29uRGlkQ29udGVudFNpemVDaGFuZ2UnIHwgJ29uRGlkUmVzb2x2ZVRleHRNb2RlbCc7XG5cbmV4cG9ydCBjbGFzcyBDb2RlQ2VsbExheW91dCB7XG5cdHByaXZhdGUgX2VkaXRvclZpc2liaWxpdHk/OiAnRnVsbCcgfCAnVG9wIENsaXBwZWQnIHwgJ0JvdHRvbSBDbGlwcGVkJyB8ICdGdWxsIChTbWFsbCBWaWV3cG9ydCknIHwgJ0ludmlzaWJsZSc7XG5cdHB1YmxpYyBnZXQgZWRpdG9yVmlzaWJpbGl0eSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yVmlzaWJpbGl0eTtcblx0fVxuXHRwcml2YXRlIF9pc1VwZGF0aW5nTGF5b3V0PzogYm9vbGVhbjtcblx0cHVibGljIGdldCBpc1VwZGF0aW5nTGF5b3V0KCkge1xuXHRcdHJldHVybiB0aGlzLl9pc1VwZGF0aW5nTGF5b3V0O1xuXHR9XG5cdHB1YmxpYyBfcHJldmlvdXNTY3JvbGxCb3R0b20/OiBudW1iZXI7XG5cdHB1YmxpYyBfbGFzdENoYW5nZWRFZGl0b3JTY3JvbGx0b3A/OiBudW1iZXI7XG5cdHByaXZhdGUgX2luaXRpYWxpemVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3BvaW50ZXJEb3duOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2VzdGFibGlzaGVkQ29udGVudEhlaWdodD86IG51bWJlcjtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZW5hYmxlZDogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRWRpdG9yOiBJQWN0aXZlTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZpZXdDZWxsOiBDb2RlQ2VsbFZpZXdNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRlbXBsYXRlRGF0YTogQ29kZUNlbGxSZW5kZXJUZW1wbGF0ZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiB7IGRlYnVnOiAob3V0cHV0OiBzdHJpbmcpID0+IHZvaWQgfSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pbml0aWFsRWRpdG9yRGltZW5zaW9uOiBJRGltZW5zaW9uXG5cdCkge1xuXHR9XG5cblx0cHVibGljIHNldFBvaW50ZXJEb3duKGlzRG93bjogYm9vbGVhbikge1xuXHRcdHRoaXMuX3BvaW50ZXJEb3duID0gaXNEb3duO1xuXHR9XG5cdC8qKlxuXHQgKiBEeW5hbWljYWxseSBsYXlzIG91dCB0aGUgY29kZSBjZWxsJ3MgTW9uYWNvIGVkaXRvciB0byBzaW11bGF0ZSBhIFwic3RpY2t5XCIgcnVuL2V4ZWMgYXJlYSB3aGlsZVxuXHQgKiBjb25zdHJhaW5pbmcgdGhlIHZpc2libGUgZWRpdG9yIGhlaWdodCB0byB0aGUgbm90ZWJvb2sgdmlld3BvcnQuIEl0IGFkanVzdHMgdHdvIHRoaW5nczpcblx0ICogIC0gVGhlIGFic29sdXRlIGB0b3BgIG9mZnNldCBvZiB0aGUgZWRpdG9yIHBhcnQgaW5zaWRlIHRoZSBjZWxsIChzbyB0aGUgcnVuIC8gZXhlY3V0aW9uIG9yZGVyXG5cdCAqICAgIGFyZWEgcmVtYWlucyB2aXNpYmxlIGZvciBhIGxpbWl0ZWQgdmVydGljYWwgdHJhdmVsIGJhbmQgfjQ1cHgpLlxuXHQgKiAgLSBUaGUgZWRpdG9yJ3MgbGF5b3V0IGhlaWdodCBwbHVzIHRoZSBlZGl0b3IncyBpbnRlcm5hbCBzY3JvbGwgcG9zaXRpb24gKGBlZGl0b3JTY3JvbGxUb3BgKSB0b1xuXHQgKiAgICBjcm9wIGNvbnRlbnQgd2hlbiB0aGUgY2VsbCBpcyBwYXJ0aWFsbHkgdmlzaWJsZSAodG9wIG9yIGJvdHRvbSBjbGlwcGVkKSBvciB3aGVuIGNvbnRlbnQgaXNcblx0ICogICAgdGFsbGVyIHRoYW4gdGhlIHZpZXdwb3J0LlxuXHQgKlxuXHQgKiBBZGRpdGlvbmFsIGludmFyaWFudHM6XG5cdCAqICAtIENvbnRlbnQgaGVpZ2h0IHN0YWJpbGl0eTogb25jZSB0aGUgbGF5b3V0IGhhcyBiZWVuIGluaXRpYWxpemVkLCBzY3JvbGwtZHJpdmVuIHJlLWxheW91dHMgY2FuXG5cdCAqICAgIG9ic2VydmUgdHJhbnNpZW50IE1vbmFjbyBjb250ZW50IGhlaWdodHMgdGhhdCByZWZsZWN0IHRoZSBjdXJyZW50IGNsaXBwZWQgbGF5b3V0IChyYXRoZXIgdGhhblxuXHQgKiAgICB0aGUgZnVsbCBpbnB1dCBoZWlnaHQpLiBUbyBrZWVwIHRoZSBub3RlYm9vayBsaXN0IGxheW91dCBzdGFibGUgKGF2b2lkaW5nIG92ZXJsYXBwaW5nIGNlbGxzXG5cdCAqICAgIHdoaWxlIG5hdmlnYXRpbmcvc2Nyb2xsaW5nKSwgd2Ugc3RvcmUgdGhlIGFjdHVhbCBjb250ZW50IGhlaWdodCBpbiBgX2VzdGFibGlzaGVkQ29udGVudEhlaWdodGBcblx0ICogICAgYW5kIHJldXNlIGl0IGZvciBzY3JvbGwtZHJpdmVuIHJlbGF5b3V0cy4gVGhpcyBwcmV2ZW50cyB0aGUgZWRpdG9yIGZyb20gc2hyaW5raW5nIGJhY2sgdG8gaXRzXG5cdCAqICAgIGluaXRpYWwgaGVpZ2h0IGFmdGVyIGNvbnRlbnQgaGFzIGJlZW4gYWRkZWQgKGUuZy4sIHBhc3RpbmcgdGV4dCkgb3Igd2hlbiBNb25hY28gcmVwb3J0cyBhXG5cdCAqICAgIHRyYW5zaWVudCBzbWFsbGVyIGNvbnRlbnQgaGVpZ2h0IHdoaWxlIHRoZSBjZWxsIGlzIGNsaXBwZWQuXG5cdCAqXG5cdCAqICAgIFdlIHJlZnJlc2ggYF9lc3RhYmxpc2hlZENvbnRlbnRIZWlnaHRgIHdoZW4gdGhlIGVkaXRvcidzIGNvbnRlbnQgc2l6ZSBjaGFuZ2VzXG5cdCAqICAgIChgb25EaWRDb250ZW50U2l6ZUNoYW5nZWApIGFuZCBhbHNvIHdoZW4gd2lkdGgvbGF5b3V0IGNoYW5nZXMgY2FuIGFmZmVjdCB3cmFwcGluZy1kcml2ZW4gaGVpZ2h0XG5cdCAqICAgIChgdmlld0NlbGxMYXlvdXRDaGFuZ2VgL2BuYkxheW91dENoYW5nZWApLlxuXHQgKiAgLSBQb2ludGVyLWRyYWcgZ2F0aW5nOiB3aGlsZSB0aGUgdXNlciBpcyBob2xkaW5nIHRoZSBtb3VzZSBidXR0b24gZG93biBpbiB0aGUgZWRpdG9yIChkcmFnXG5cdCAqICAgIHNlbGVjdGlvbiBvciBwb3RlbnRpYWwgZHJhZyBzZWxlY3Rpb24pLCB3ZSBhdm9pZCBwcm9ncmFtbWF0aWMgYGVkaXRvci5zZXRTY3JvbGxUb3AoLi4uKWAgdXBkYXRlc1xuXHQgKiAgICB0byBwcmV2ZW50IHNlbGVjdGlvbi9zY3JvbGwgZmVlZGJhY2sgbG9vcHMgYW5kIFwic3R1Y2sgc2VsZWN0aW9uXCIgYmVoYXZpb3IuXG5cdCAqXG5cdCAqIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHQgKiBTRUNUSU9OIDEuIE9WRVJBTEwgTk9URUJPT0sgVklFVyAoRUFDSCBDRUxMIEhBUyBBTiAxOHB4IEdBUCBBQk9WRSBJVClcblx0ICogTGVnZW5kOlxuXHQgKiAgIEdBUCAoYmV0d2VlbiBjZWxscyAmIGJlZm9yZSBmaXJzdCBjZWxsKSAuLi4uLi4uLi4uLi4uIDE4cHhcblx0ICogICBDRUxMIFBBRERJTkcgKHRvcCAmIGJvdHRvbSBpbnNpZGUgY2VsbCkgLi4uLi4uLi4uLi4uLiA2cHhcblx0ICogICBTVEFUVVMgQkFSIEhFSUdIVCAodHlwaWNhbCkgLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLiAyMnB4XG5cdCAqICAgTElORSBIRUlHSFQgKGxvZ2ljIGNsYW1wKSAuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4gMjFweFxuXHQgKiAgIEJPUkRFUi9PVVRMSU5FIEhFSUdIVCAodmlzdWFsIGNvbmNlYWwgYWRqdXN0bWVudCkgLi4uIDFweFxuXHQgKiAgIEVESVRPUl9IRUlHSFQgKGV4YW1wbGUgdmlzaWJsZSBlZGl0b3IpIC4uLi4uLi4uLi4uLi4uIDIwMHB4IChjYXBwZWQgYnkgdmlld3BvcnQpXG5cdCAqICAgRURJVE9SX0NPTlRFTlRfSEVJR0hUIChleGFtcGxlIGZ1bGwgY29udGVudCkgLi4uLi4uLi4gMzgwcHggKGUuZy4gNTAgbGluZXMpXG5cdCAqICAgZXh0cmFPZmZzZXQgPSAtKENFTExfUEFERElORyArIEJPUkRFUl9IRUlHSFQpIC4uLi4uLi4gLTdcblx0ICpcblx0ICogICAoVGhlIGxpc3QgZW5zdXJlcyB0aGUgZWRpdG9yJ3MgbGFpZCBvdXQgaGVpZ2h0IG5ldmVyIGV4Y2VlZHMgdmlld3BvcnQgaGVpZ2h0Lilcblx0ICpcblx0ICogICBcdTI1MENcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgTm90ZWJvb2sgVmlld3BvcnQgKHNjcm9sbGluZyBjb250YWluZXIpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUxMFxuXHQgKiAgIFx1MjUwMiAoc2Nyb2xsVG9wKSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAgMThweCBHQVAgKHRvcCBzcGFjaW5nIGJlZm9yZSBmaXJzdCBjZWxsKSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAgXHUyNUJDICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICBcdTI1MENcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgQ2VsbCBBIE91dGVyIENvbnRhaW5lciBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MTAgICBcdTI1MDJcblx0ICogICBcdTI1MDIgIFx1MjUwMiBcdTI1QjIgNnB4IHRvcCBwYWRkaW5nICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDIgICBcdTI1MDJcblx0ICogICBcdTI1MDIgIFx1MjUwMiBcdTI1MDIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDIgICBcdTI1MDJcblx0ICogICBcdTI1MDIgIFx1MjUwMiBcdTI1MDIgIFx1MjUwQ1x1MjUwMCBFeGVjdXRpb24gT3JkZXIgLyBSdW4gQ29sdW1uICh+NDVweCB2ZXJ0aWNhbCB0cmF2ZWwgYmFuZClcdTI1MDBcdTI1MTAgIFx1MjUwQ1x1MjUwMCBFZGl0b3IgUGFydCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MTAgXHUyNTAyICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICBcdTI1MDIgXHUyNTAyICBcdTI1MDIgKFJ1biBidXR0b24sIGV4ZWN1dGlvbiAjIGxhYmVsKSAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDIgIFx1MjUwMiBWaXNpYmxlIExpbmVzIC4uLiAgIFx1MjUwMiBcdTI1MDIgICBcdTI1MDJcblx0ICogICBcdTI1MDIgIFx1MjUwMiBcdTI1MDIgIFx1MjUwMiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMiAgXHUyNTAyICAgICAgICAgICAgICAgICAgICAgXHUyNTAyIFx1MjUwMiAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAgXHUyNTAyIFx1MjUwMiAgXHUyNTAyICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyICBcdTI1MDIgRURJVE9SX0hFSUdIVD0yMDBweCBcdTI1MDIgXHUyNTAyICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICBcdTI1MDIgXHUyNTAyICBcdTI1MDIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDIgIFx1MjUwMiAoQ29udGVudD0zODBweCkgICAgIFx1MjUwMiBcdTI1MDIgICBcdTI1MDJcblx0ICogICBcdTI1MDIgIFx1MjUwMiBcdTI1MDIgIFx1MjUxNFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUxOCAgXHUyNTE0XHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTE4IFx1MjUwMiAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAgXHUyNTAyIFx1MjUwMiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMiAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAgXHUyNTAyIFx1MjUwMiAgXHUyNTBDXHUyNTAwIFN0YXR1cyBCYXIgKDIycHgpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUxMCBcdTI1MDIgICBcdTI1MDJcblx0ICogICBcdTI1MDIgIFx1MjUwMiBcdTI1MDIgIFx1MjUwMiBsYW5ndWFnZSB8IGluZGVudCB8IHNlbGVjdGlvbiBpbmZvIHwga2VybmVsL3N0YXR1cyBiaXRzIC4uLiAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDIgXHUyNTAyICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICBcdTI1MDIgXHUyNTAyICBcdTI1MTRcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MTggXHUyNTAyICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICBcdTI1MDIgXHUyNTAyICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICBcdTI1MDIgXHUyNUJDIDZweCBib3R0b20gcGFkZGluZyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyICAgXHUyNTAyXG5cdCAqICAgXHUyNTAyICBcdTI1MTRcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MTggICBcdTI1MDJcblx0ICogICBcdTI1MDIgIDE4cHggR0FQICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDJcblx0ICogICBcdTI1MDIgIFx1MjUwQ1x1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBDZWxsIEIgT3V0ZXIgQ29udGFpbmVyIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUxMCAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAgXHUyNTAyIChzYW1lIHN0cnVjdHVyZSBhcyBDZWxsIEEpICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDIgICBcdTI1MDJcblx0ICogICBcdTI1MDIgIFx1MjUxNFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUxOCAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiAoc2Nyb2xsQm90dG9tKSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMlxuXHQgKiAgIFx1MjUxNFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUxOFxuXHQgKlxuXHQgKiBTRUNUSU9OIDIuIFNJTkdMRSBDRUxMIFNUUlVDVFVSRSAoVkVSVElDQUwgTEFZRVJTKVxuXHQgKlxuXHQgKiAgIEludGVyLUNlbGwgR0FQICgxOHB4KVxuXHQgKiAgIFx1MjUwQ1x1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBDZWxsIFdyYXBwZXIgKDxsaT4pIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUxMFxuXHQgKiAgIFx1MjUwMiBcdTI1MENcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgLmNlbGwtaW5uZXItY29udGFpbmVyIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUxMCBcdTI1MDJcblx0ICogICBcdTI1MDIgXHUyNTAyIDZweCB0b3AgcGFkZGluZyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiBcdTI1MDIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDIgXHUyNTAyXG5cdCAqICAgXHUyNTAyIFx1MjUwMiBcdTI1MENcdTI1MDAgTGVmdCBHdXR0ZXIgKFJ1biAvIEV4ZWMgLyBGb2N1cyBCb3JkZXIpIFx1MjUwMFx1MjUyQ1x1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBFZGl0b3IgUGFydCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MTAgXHUyNTAyIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiBcdTI1MDIgXHUyNTAyICBTdGlja3kgdmVydGljYWwgdHJhdmVsICh+NDVweCBhbGxvd2FuY2UpIFx1MjUwMiAgKE1vbmFjbyBzdXJmYWNlKSAgICAgICAgICAgIFx1MjUwMiBcdTI1MDIgXHUyNTAyXG5cdCAqICAgXHUyNTAyIFx1MjUwMiBcdTI1MDIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMiAgVmlzaWJsZSBoZWlnaHQgMjAwcHggICAgICAgICAgXHUyNTAyIFx1MjUwMiBcdTI1MDJcblx0ICogICBcdTI1MDIgXHUyNTAyIFx1MjUwMiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyICBDb250ZW50IGhlaWdodCAzODBweCAgICAgICAgICBcdTI1MDIgXHUyNTAyIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiBcdTI1MDIgXHUyNTE0XHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTM0XHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTE4IFx1MjUwMiBcdTI1MDJcblx0ICogICBcdTI1MDIgXHUyNTAyICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyNTAyIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiBcdTI1MDIgXHUyNTBDXHUyNTAwIFN0YXR1cyBCYXIgKDIycHgpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUxMCBcdTI1MDIgXHUyNTAyXG5cdCAqICAgXHUyNTAyIFx1MjUwMiBcdTI1MDIgbGFuZ3VhZ2UgfCBpbmRlbnQgfCBzZWxlY3Rpb24gfCBrZXJuZWwgfCBzdGF0ZSAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjUwMiBcdTI1MDIgXHUyNTAyXG5cdCAqICAgXHUyNTAyIFx1MjUwMiBcdTI1MTRcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MTggXHUyNTAyIFx1MjUwMlxuXHQgKiAgIFx1MjUwMiBcdTI1MDIgNnB4IGJvdHRvbSBwYWRkaW5nICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTI1MDIgXHUyNTAyXG5cdCAqICAgXHUyNTAyIFx1MjUxNFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUxOCBcdTI1MDJcblx0ICogICBcdTI1MDIgKE91dHB1dHMgcmVnaW9uIGJlZ2lucyBhdCBvdXRwdXRDb250YWluZXJPZmZzZXQgYmVsb3cgaW5wdXQgYXJlYSkgICAgICAgICAgICAgICAgXHUyNTAyXG5cdCAqICAgXHUyNTE0XHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTE4XG5cdCAqL1xuXHRwdWJsaWMgbGF5b3V0RWRpdG9yKHJlYXNvbjogQ2VsbExheW91dENoYW5nZVJlYXNvbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yUGFydDtcblx0XHRpZiAodGhpcy52aWV3Q2VsbC5pc0lucHV0Q29sbGFwc2VkKSB7XG5cdFx0XHRlbGVtZW50LnN0eWxlLnRvcCA9ICcnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IExJTkVfSEVJR0hUID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRMYXlvdXRJbmZvKCkuZm9udEluZm8ubGluZUhlaWdodDsgLy8gMjE7XG5cdFx0Y29uc3QgQ0VMTF9UT1BfTUFSR0lOID0gdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLnRvcE1hcmdpbjtcblx0XHRjb25zdCBDRUxMX09VVExJTkVfV0lEVEggPSB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8ub3V0bGluZVdpZHRoOyAvLyAxIGV4dHJhIHB4IGZvciBib3JkZXIgKHdlIGRvbid0IHdhbnQgdG8gYmUgYWJsZSB0byBzZWUgdGhlIGNlbGwgYm9yZGVyIHdoZW4gc2Nyb2xsaW5nIHVwKTtcblx0XHRjb25zdCBTVEFUVVNCQVJfSEVJR0hUID0gdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLnN0YXR1c0JhckhlaWdodDtcblxuXG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yO1xuXHRcdGNvbnN0IGVkaXRvckxheW91dCA9IHRoaXMudGVtcGxhdGVEYXRhLmVkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0Ly8gSWYgd2UndmUgYWxyZWFkeSBpbml0aWFsaXplZCBvbmNlLCB3ZSBzaG91bGQgdXNlIHRoZSB2aWV3Q2VsbCBsYXlvdXQgaW5mbyBmb3IgZWRpdG9yIHdpZHRoLlxuXHRcdC8vIEUuZy4gd2hlbiByZXNpemluZyBWUyBDb2RlIHdpbmRvdyBvciBub3RlYm9vayBlZGl0b3IgKGhvcml6b250YWwgc3BhY2UgY2hhbmdlcykuXG5cdFx0Y29uc3QgZWRpdG9yV2lkdGggPSB0aGlzLl9pbml0aWFsaXplZCAmJiAocmVhc29uID09PSAnbmJMYXlvdXRDaGFuZ2UnIHx8IHJlYXNvbiA9PT0gJ3ZpZXdDZWxsTGF5b3V0Q2hhbmdlJykgPyB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8uZWRpdG9yV2lkdGggOiBlZGl0b3JMYXlvdXQud2lkdGg7XG5cdFx0Y29uc3QgZWRpdG9ySGVpZ2h0ID0gdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLmVkaXRvckhlaWdodDtcblx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLm5vdGVib29rRWRpdG9yLnNjcm9sbFRvcDtcblx0XHRjb25zdCBlbGVtZW50VG9wID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRBYnNvbHV0ZVRvcE9mRWxlbWVudCh0aGlzLnZpZXdDZWxsKTtcblx0XHRjb25zdCBlbGVtZW50Qm90dG9tID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRBYnNvbHV0ZUJvdHRvbU9mRWxlbWVudCh0aGlzLnZpZXdDZWxsKTtcblx0XHRjb25zdCBlbGVtZW50SGVpZ2h0ID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRIZWlnaHRPZkVsZW1lbnQodGhpcy52aWV3Q2VsbCk7XG5cdFx0bGV0IGVkaXRvckNvbnRlbnRIZWlnaHQ6IG51bWJlcjtcblx0XHRjb25zdCBpc0luaXQgPSAhdGhpcy5faW5pdGlhbGl6ZWQgJiYgcmVhc29uID09PSAnaW5pdCc7XG5cdFx0aWYgKGlzSW5pdCkge1xuXHRcdFx0Ly8gQ09OVEVOVCBIRUlHSFQgU0VMRUNUSU9OIChJTklUKVxuXHRcdFx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHRcdFx0Ly8gRWRpdG9ycyBhcmUgcG9vbGVkIGFuZCBtYXkgYmUgcmUtYXR0YWNoZWQgdG8gZGlmZmVyZW50IGNlbGxzIGFzIHRoZSB1c2VyIHNjcm9sbHMuXG5cdFx0XHQvLyBBdCB0aGUgbW9tZW50IGEgcG9vbGVkIGVkaXRvciBpcyBmaXJzdCBhdHRhY2hlZCB0byBhIG5ldyBjZWxsLCBNb25hY28gY2FuIHN0aWxsXG5cdFx0XHQvLyByZXBvcnQgdGhlIHByZXZpb3VzIGNlbGwncyBgZ2V0Q29udGVudEhlaWdodCgpYCAoZm9yIGV4YW1wbGUgYSB0YWxsIG11bHRpLWxpbmVcblx0XHRcdC8vIGNlbGwpIGV2ZW4gdGhvdWdoIHRoZSBuZXcgY2VsbCBvbmx5IGNvbnRhaW5zIGEgc2luZ2xlIGxpbmUuIElmIHdlIHRydXN0ZWQgdGhhdFxuXHRcdFx0Ly8gc3RhbGUgdmFsdWUgaGVyZSwgdGhlIHZlcnkgZmlyc3QgbGF5b3V0IG9mIHRoZSBuZXcgY2VsbCB3b3VsZCByZW5kZXIgd2l0aCBhblxuXHRcdFx0Ly8gb3ZlcnNpemVkIGVkaXRvciBhbmQgdmlzdWFsbHkgb3ZlcmxhcCB0aGUgbmV4dCBjZWxsLlxuXHRcdFx0Ly9cblx0XHRcdC8vIFRvIGF2b2lkIHRoaXMsIHRoZSBpbml0aWFsIGxheW91dCBpZ25vcmVzIGBnZXRDb250ZW50SGVpZ2h0KClgIGVudGlyZWx5IGFuZCB1c2VzXG5cdFx0XHQvLyB0aGUgbm90ZWJvb2sncyBvd24gbm90aW9uIG9mIHRoZSBlZGl0b3IgaGVpZ2h0IGZvciB0aGlzIGNlbGxcblx0XHRcdC8vIChgX2luaXRpYWxFZGl0b3JEaW1lbnNpb24uaGVpZ2h0YCkuIFRoaXMgdmFsdWUgaXMgZGVyaXZlZCBmcm9tIHRoZSBjZWxsIG1vZGVsXG5cdFx0XHQvLyAobGluZSBjb3VudCArIHBhZGRpbmcpIGFuZCBpcyBzdGFibGUgYWNyb3NzIGVkaXRvciByZXVzZS4gT25jZSB0aGUgbW9kZWwgaGFzXG5cdFx0XHQvLyBiZWVuIHJlc29sdmVkIGFuZCBNb25hY28gcmVwb3J0cyBhIHJlYWwgY29udGVudCBoZWlnaHQsIHN1YnNlcXVlbnQgbGF5b3V0XG5cdFx0XHQvLyByZWFzb25zIChgb25EaWRDb250ZW50U2l6ZUNoYW5nZWAsIGB2aWV3Q2VsbExheW91dENoYW5nZWAsIGBuYkxheW91dENoYW5nZWApXG5cdFx0XHQvLyB3aWxsIHJlZnJlc2ggYF9lc3RhYmxpc2hlZENvbnRlbnRIZWlnaHRgIGluIHRoZSBub3JtYWwgd2F5LlxuXHRcdFx0ZWRpdG9yQ29udGVudEhlaWdodCA9IHRoaXMuX2luaXRpYWxFZGl0b3JEaW1lbnNpb24uaGVpZ2h0O1xuXHRcdFx0dGhpcy5fZXN0YWJsaXNoZWRDb250ZW50SGVpZ2h0ID0gZWRpdG9yQ29udGVudEhlaWdodDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQ09OVEVOVCBIRUlHSFQgU0VMRUNUSU9OIChOT04tSU5JVClcblx0XHRcdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdFx0XHQvLyBGb3IgYWxsIG5vbi1pbml0IHJlYXNvbnMsIHdlIHJlbHkgb24gTW9uYWNvJ3MgYGdldENvbnRlbnRIZWlnaHQoKWAgdG9nZXRoZXIgd2l0aFxuXHRcdFx0Ly8gYF9lc3RhYmxpc2hlZENvbnRlbnRIZWlnaHRgIHRvIGtlZXAgdGhlIG5vdGVib29rIGxpc3QgbGF5b3V0IHN0YWJsZSB3aGlsZVxuXHRcdFx0Ly8gc2Nyb2xsaW5nIGFuZCByZXNpemluZzpcblx0XHRcdC8vICAtIGBvbkRpZENvbnRlbnRTaXplQ2hhbmdlYCAvIGB2aWV3Q2VsbExheW91dENoYW5nZWAgLyBgbmJMYXlvdXRDaGFuZ2VgIHVwZGF0ZVxuXHRcdFx0Ly8gICAgYF9lc3RhYmxpc2hlZENvbnRlbnRIZWlnaHRgIHRvIHRoZSBsYXRlc3QgZnVsbCBjb250ZW50IGhlaWdodC5cblx0XHRcdC8vICAtIGBuYkRpZFNjcm9sbGAgcmV1c2VzIGBfZXN0YWJsaXNoZWRDb250ZW50SGVpZ2h0YCBzbyB0aGF0IHRyYW5zaWVudCwgc21hbGxlclxuXHRcdFx0Ly8gICAgdmFsdWVzIHJlcG9ydGVkIHdoaWxlIHRoZSBlZGl0b3IgaXRzZWxmIGlzIGNsaXBwZWQgZG8gbm90IHNocmluayB0aGUgcm93XG5cdFx0XHQvLyAgICBoZWlnaHQgKHdoaWNoIHdvdWxkIG90aGVyd2lzZSBjYXVzZSBvdmVybGFwcGluZyBjZWxscykuXG5cdFx0XHRjb25zdCBnb3RDb250ZW50SGVpZ2h0ID0gZWRpdG9yLmdldENvbnRlbnRIZWlnaHQoKTtcblx0XHRcdC8vIElmIHdlJ3ZlIGFscmVhZHkgY2FsY3VsYXRlZCB0aGUgZWRpdG9yIGNvbnRlbnQgaGVpZ2h0IG9uY2UgYmVmb3JlIGFuZCB0aGUgY29udGVudHMgaGF2ZW4ndCBjaGFuZ2VkLCB1c2UgdGhhdC5cblx0XHRcdGNvbnN0IGZhbGxiYWNrRWRpdG9yQ29udGVudEhlaWdodCA9IGdvdENvbnRlbnRIZWlnaHQgPT09IC0xID8gTWF0aC5tYXgoZWRpdG9yLmdldExheW91dEluZm8oKS5oZWlnaHQsIHRoaXMuX2luaXRpYWxFZGl0b3JEaW1lbnNpb24uaGVpZ2h0KSA6IGdvdENvbnRlbnRIZWlnaHQ7XG5cdFx0XHRjb25zdCBzaG91bGRSZWZyZXNoQ29udGVudEhlaWdodCA9ICF0aGlzLl9pbml0aWFsaXplZCB8fCByZWFzb24gPT09ICdvbkRpZENvbnRlbnRTaXplQ2hhbmdlJyB8fCByZWFzb24gPT09ICd2aWV3Q2VsbExheW91dENoYW5nZScgfHwgcmVhc29uID09PSAnbmJMYXlvdXRDaGFuZ2UnO1xuXHRcdFx0aWYgKHNob3VsZFJlZnJlc2hDb250ZW50SGVpZ2h0KSB7XG5cdFx0XHRcdC8vIFVwZGF0ZSB0aGUgZXN0YWJsaXNoZWQgY29udGVudCBoZWlnaHQgd2hlbiBjb250ZW50IGNoYW5nZXMsIGR1cmluZyBpbml0aWFsaXphdGlvbixcblx0XHRcdFx0Ly8gb3Igd2hlbiB3aWR0aC9sYXlvdXQgY2hhbmdlcyBjYW4gYWZmZWN0IHdyYXBwaW5nLWRyaXZlbiBoZWlnaHQuXG5cdFx0XHRcdGVkaXRvckNvbnRlbnRIZWlnaHQgPSBmYWxsYmFja0VkaXRvckNvbnRlbnRIZWlnaHQ7XG5cdFx0XHRcdHRoaXMuX2VzdGFibGlzaGVkQ29udGVudEhlaWdodCA9IGVkaXRvckNvbnRlbnRIZWlnaHQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBSZXVzZSB0aGUgcHJldmlvdXNseSBlc3RhYmxpc2hlZCBjb250ZW50IGhlaWdodCB0byBhdm9pZCB0cmFuc2llbnQgTW9uYWNvIGNvbnRlbnQgaGVpZ2h0IGNoYW5nZXMgZHVyaW5nIHNjcm9sbFxuXHRcdFx0XHRlZGl0b3JDb250ZW50SGVpZ2h0ID0gdGhpcy5fZXN0YWJsaXNoZWRDb250ZW50SGVpZ2h0ID8/IGZhbGxiYWNrRWRpdG9yQ29udGVudEhlaWdodDtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgZWRpdG9yQm90dG9tID0gZWxlbWVudFRvcCArIHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5vdXRwdXRDb250YWluZXJPZmZzZXQ7XG5cdFx0Y29uc3Qgc2Nyb2xsQm90dG9tID0gdGhpcy5ub3RlYm9va0VkaXRvci5zY3JvbGxCb3R0b207XG5cdFx0Ly8gV2hlbiBsb2FkaW5nLCBzY3JvbGxCb3R0b20gLXNjcm9sbFRvcCA9PT0gMDtcblx0XHRjb25zdCB2aWV3cG9ydEhlaWdodCA9IHNjcm9sbEJvdHRvbSAtIHNjcm9sbFRvcCA9PT0gMCA/IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0TGF5b3V0SW5mbygpLmhlaWdodCA6IHNjcm9sbEJvdHRvbSAtIHNjcm9sbFRvcDtcblx0XHRjb25zdCBvdXRwdXRDb250YWluZXJPZmZzZXQgPSB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8ub3V0cHV0Q29udGFpbmVyT2Zmc2V0O1xuXHRcdGNvbnN0IHNjcm9sbERpcmVjdGlvbjogJ2Rvd24nIHwgJ3VwJyA9IHR5cGVvZiB0aGlzLl9wcmV2aW91c1Njcm9sbEJvdHRvbSA9PT0gJ251bWJlcicgPyAoc2Nyb2xsQm90dG9tIDwgdGhpcy5fcHJldmlvdXNTY3JvbGxCb3R0b20gPyAndXAnIDogJ2Rvd24nKSA6ICdkb3duJztcblx0XHR0aGlzLl9wcmV2aW91c1Njcm9sbEJvdHRvbSA9IHNjcm9sbEJvdHRvbTtcblxuXHRcdGxldCB0b3AgPSBNYXRoLm1heCgwLCBzY3JvbGxUb3AgLSBlbGVtZW50VG9wIC0gQ0VMTF9UT1BfTUFSR0lOIC0gQ0VMTF9PVVRMSU5FX1dJRFRIKTtcblx0XHRjb25zdCBwb3NzaWJsZUVkaXRvckhlaWdodCA9IGVkaXRvckhlaWdodCAtIHRvcDtcblx0XHRpZiAocG9zc2libGVFZGl0b3JIZWlnaHQgPCBMSU5FX0hFSUdIVCkge1xuXHRcdFx0dG9wID0gdG9wIC0gKExJTkVfSEVJR0hUIC0gcG9zc2libGVFZGl0b3JIZWlnaHQpIC0gQ0VMTF9PVVRMSU5FX1dJRFRIO1xuXHRcdH1cblxuXHRcdGxldCBoZWlnaHQgPSBlZGl0b3JDb250ZW50SGVpZ2h0O1xuXHRcdGxldCBlZGl0b3JTY3JvbGxUb3AgPSAwO1xuXHRcdGlmIChzY3JvbGxUb3AgPD0gKGVsZW1lbnRUb3AgKyBDRUxMX1RPUF9NQVJHSU4pKSB7XG5cdFx0XHRjb25zdCBtaW5pbXVtRWRpdG9ySGVpZ2h0ID0gTElORV9IRUlHSFQgKyB0aGlzLm5vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucy5nZXRMYXlvdXRDb25maWd1cmF0aW9uKCkuZWRpdG9yVG9wUGFkZGluZztcblx0XHRcdGlmIChzY3JvbGxCb3R0b20gPj0gZWRpdG9yQm90dG9tKSB7XG5cdFx0XHRcdGhlaWdodCA9IGNsYW1wKGVkaXRvckNvbnRlbnRIZWlnaHQsIG1pbmltdW1FZGl0b3JIZWlnaHQsIGVkaXRvckNvbnRlbnRIZWlnaHQpO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JWaXNpYmlsaXR5ID0gJ0Z1bGwnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGVpZ2h0ID0gY2xhbXAoc2Nyb2xsQm90dG9tIC0gKGVsZW1lbnRUb3AgKyBDRUxMX1RPUF9NQVJHSU4pIC0gU1RBVFVTQkFSX0hFSUdIVCwgbWluaW11bUVkaXRvckhlaWdodCwgZWRpdG9yQ29udGVudEhlaWdodCkgKyAoMiAqIENFTExfT1VUTElORV9XSURUSCk7IC8vIFdlIGRvbid0IHdhbnQgYm90dG9tIGJvcmRlciB0byBiZSB2aXNpYmxlLjtcblx0XHRcdFx0dGhpcy5fZWRpdG9yVmlzaWJpbGl0eSA9ICdCb3R0b20gQ2xpcHBlZCc7XG5cdFx0XHRcdGVkaXRvclNjcm9sbFRvcCA9IDA7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh2aWV3cG9ydEhlaWdodCA8PSBlZGl0b3JDb250ZW50SGVpZ2h0ICYmIHNjcm9sbEJvdHRvbSA8PSBlZGl0b3JCb3R0b20pIHtcblx0XHRcdFx0Y29uc3QgbWluaW11bUVkaXRvckhlaWdodCA9IExJTkVfSEVJR0hUICsgdGhpcy5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuZ2V0TGF5b3V0Q29uZmlndXJhdGlvbigpLmVkaXRvclRvcFBhZGRpbmc7XG5cdFx0XHRcdGhlaWdodCA9IGNsYW1wKHZpZXdwb3J0SGVpZ2h0IC0gU1RBVFVTQkFSX0hFSUdIVCwgbWluaW11bUVkaXRvckhlaWdodCwgZWRpdG9yQ29udGVudEhlaWdodCAtIFNUQVRVU0JBUl9IRUlHSFQpICsgKDIgKiBDRUxMX09VVExJTkVfV0lEVEgpOyAvLyBXZSBkb24ndCB3YW50IGJvdHRvbSBib3JkZXIgdG8gYmUgdmlzaWJsZS5cblx0XHRcdFx0dGhpcy5fZWRpdG9yVmlzaWJpbGl0eSA9ICdGdWxsIChTbWFsbCBWaWV3cG9ydCknO1xuXHRcdFx0XHRlZGl0b3JTY3JvbGxUb3AgPSB0b3A7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBtaW5pbXVtRWRpdG9ySGVpZ2h0ID0gTElORV9IRUlHSFQ7XG5cdFx0XHRcdGhlaWdodCA9IGNsYW1wKGVkaXRvckNvbnRlbnRIZWlnaHQgLSAoc2Nyb2xsVG9wIC0gKGVsZW1lbnRUb3AgKyBDRUxMX1RPUF9NQVJHSU4pKSwgbWluaW11bUVkaXRvckhlaWdodCwgZWRpdG9yQ29udGVudEhlaWdodCk7XG5cdFx0XHRcdC8vIENoZWNrIGlmIHRoZSBjZWxsIGlzIHZpc2libGUuXG5cdFx0XHRcdGlmIChzY3JvbGxUb3AgPiBlZGl0b3JCb3R0b20pIHtcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3JWaXNpYmlsaXR5ID0gJ0ludmlzaWJsZSc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yVmlzaWJpbGl0eSA9ICdUb3AgQ2xpcHBlZCc7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWRpdG9yU2Nyb2xsVG9wID0gZWRpdG9yQ29udGVudEhlaWdodCAtIGhlaWdodDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGAke3JlYXNvbn0gKCR7dGhpcy5fZWRpdG9yVmlzaWJpbGl0eX0sICR7dGhpcy5faW5pdGlhbGl6ZWR9KWApO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYD0+IEVkaXRvciBUb3AgPSAke3RvcH1weCAoZWRpdEhlaWdodCA9ICR7ZWRpdG9ySGVpZ2h0fSwgZWRpdENvbnRlbnRIZWlnaHQ6ICR7ZWRpdG9yQ29udGVudEhlaWdodH0pYCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgPT4gZWxlVG9wID0gJHtlbGVtZW50VG9wfSwgZWxlQm90dG9tID0gJHtlbGVtZW50Qm90dG9tfSwgZWxlSGVpZ2h0ID0gJHtlbGVtZW50SGVpZ2h0fWApO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYD0+IHNjcm9sbFRvcCA9ICR7c2Nyb2xsVG9wfSwgdG9wID0gJHt0b3B9YCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgPT4gY2VsbFRvcE1hcmdpbiA9ICR7Q0VMTF9UT1BfTUFSR0lOfSwgY2VsbEJvdHRvbU1hcmdpbiA9ICR7dGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLnRvcE1hcmdpbn0sIGNlbGxPdXRsaW5lID0gJHtDRUxMX09VVExJTkVfV0lEVEh9YCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgPT4gc2Nyb2xsQm90dG9tOiAke3Njcm9sbEJvdHRvbX0sIGVkaXRCb3R0b206ICR7ZWRpdG9yQm90dG9tfSwgdmlld3BvcnQ6ICR7dmlld3BvcnRIZWlnaHR9LCBzY3JvbGw6ICR7c2Nyb2xsRGlyZWN0aW9ufSwgY29udE9mZnNldDogJHtvdXRwdXRDb250YWluZXJPZmZzZXR9KWApO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYD0+IEVkaXRvciBIZWlnaHQgPSAke2hlaWdodH1weCwgV2lkdGg6ICR7ZWRpdG9yV2lkdGh9cHgsIEluaXRpYWwgV2lkdGg6ICR7dGhpcy5faW5pdGlhbEVkaXRvckRpbWVuc2lvbi53aWR0aH0sIEVkaXRvclNjcm9sbFRvcCA9ICR7ZWRpdG9yU2Nyb2xsVG9wfXB4LCBTdGF0dXNiYXJIZWlnaHQgPSAke1NUQVRVU0JBUl9IRUlHSFR9LCBsaW5lSGVpZ2h0ID0gJHt0aGlzLm5vdGVib29rRWRpdG9yLmdldExheW91dEluZm8oKS5mb250SW5mby5saW5lSGVpZ2h0fWApO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2lzVXBkYXRpbmdMYXlvdXQgPSB0cnVlO1xuXHRcdFx0ZWxlbWVudC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuXHRcdFx0ZWRpdG9yLmxheW91dCh7XG5cdFx0XHRcdHdpZHRoOiB0aGlzLl9pbml0aWFsaXplZCA/IGVkaXRvcldpZHRoIDogdGhpcy5faW5pdGlhbEVkaXRvckRpbWVuc2lvbi53aWR0aCxcblx0XHRcdFx0aGVpZ2h0XG5cdFx0XHR9LCB0cnVlKTtcblx0XHRcdC8vIE9wdGlvbiAzOiBBdm9pZCBwcm9ncmFtbWF0aWMgc2Nyb2xsVG9wIGNoYW5nZXMgd2hpbGUgdXNlciBpcyBhY3RpdmVseSBkcmFnZ2luZyBzZWxlY3Rpb25cblx0XHRcdGlmICghdGhpcy5fcG9pbnRlckRvd24gJiYgZWRpdG9yU2Nyb2xsVG9wID49IDApIHtcblx0XHRcdFx0dGhpcy5fbGFzdENoYW5nZWRFZGl0b3JTY3JvbGx0b3AgPSBlZGl0b3JTY3JvbGxUb3A7XG5cdFx0XHRcdGVkaXRvci5zZXRTY3JvbGxUb3AoZWRpdG9yU2Nyb2xsVG9wKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faW5pdGlhbGl6ZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5faXNVcGRhdGluZ0xheW91dCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnVXBkYXRlZCBFZGl0b3IgTGF5b3V0Jyk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU9BLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksU0FBUztBQUNyQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBeUIsb0JBQW9CO0FBQ3RELFNBQVMsYUFBYTtBQUN0QixZQUFZLGFBQWE7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxlQUFlLG9DQUFtRTtBQUMzRixTQUE0QiwwQkFBMEI7QUFHdEQsU0FBaUMsNkJBQTZCO0FBQzlELFNBQVMseUJBQXlCO0FB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
