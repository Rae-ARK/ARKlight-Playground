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
import * as DOM from "../../../../../../base/browser/dom.js";
import * as domSanitize from "../../../../../../base/browser/domSanitize.js";
import { renderIcon } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { disposableTimeout, raceCancellation } from "../../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { EditorContextKeys } from "../../../../../../editor/common/editorContextKeys.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { tokenizeToStringSync } from "../../../../../../editor/common/languages/textToHtmlTokenizer.js";
import { localize } from "../../../../../../nls.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { CellEditState, CellFocusMode, CellFoldingState, EXPAND_CELL_INPUT_COMMAND_ID } from "../../notebookBrowser.js";
import { collapsedIcon, expandedIcon } from "../../notebookIcons.js";
import { CellEditorOptions } from "./cellEditorOptions.js";
import { collapsedCellTTPolicy } from "../notebookRenderingCommon.js";
import { WordHighlighterContribution } from "../../../../../../editor/contrib/wordHighlighter/browser/wordHighlighter.js";
let MarkupCell = class extends Disposable {
  constructor(notebookEditor, viewCell, templateData, renderedEditors, accessibilityService, contextKeyService, instantiationService, languageService, configurationService, keybindingService) {
    super();
    this.notebookEditor = notebookEditor;
    this.viewCell = viewCell;
    this.templateData = templateData;
    this.renderedEditors = renderedEditors;
    this.accessibilityService = accessibilityService;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.languageService = languageService;
    this.configurationService = configurationService;
    this.keybindingService = keybindingService;
    this.editor = null;
    this.localDisposables = this._register(new DisposableStore());
    this.focusSwitchDisposable = this._register(new MutableDisposable());
    this.editorDisposables = this._register(new DisposableStore());
    this._isDisposed = false;
    this.constructDOM();
    this.editorPart = templateData.editorPart;
    this.cellEditorOptions = this._register(new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(viewCell.language), this.notebookEditor.notebookOptions, this.configurationService));
    this.cellEditorOptions.setLineNumbers(this.viewCell.lineNumbers);
    this.editorOptions = this.cellEditorOptions.getValue(this.viewCell.internalMetadata, this.viewCell.uri);
    this._register(toDisposable(() => renderedEditors.delete(this.viewCell)));
    this.registerListeners();
    this.templateData.cellParts.scheduleRenderCell(this.viewCell);
    this._register(toDisposable(() => {
      this.templateData.cellParts.unrenderCell(this.viewCell);
    }));
    this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => {
      this.viewUpdate();
    }));
    this.updateForHover();
    this.updateForFocusModeChange();
    this.foldingState = viewCell.foldingState;
    this.layoutFoldingIndicator();
    this.updateFoldingIconShowClass();
    if (this.viewCell.layoutInfo.totalHeight > 0) {
      this.relayoutCell();
    }
    this.viewUpdate();
    this.layoutCellParts();
    this._register(this.viewCell.onDidChangeLayout(() => {
      this.layoutCellParts();
    }));
  }
  layoutCellParts() {
    this.templateData.cellParts.updateInternalLayoutNow(this.viewCell);
  }
  constructDOM() {
    const id = `aria-markup-cell-${this.viewCell.id}`;
    this.markdownAccessibilityContainer = this.templateData.cellContainer;
    this.markdownAccessibilityContainer.id = id;
    this.markdownAccessibilityContainer.style.height = "1px";
    this.markdownAccessibilityContainer.style.overflow = "hidden";
    this.markdownAccessibilityContainer.style.position = "absolute";
    this.markdownAccessibilityContainer.style.top = "100000px";
    this.markdownAccessibilityContainer.style.left = "10000px";
    this.markdownAccessibilityContainer.ariaHidden = "false";
    this.templateData.rootContainer.setAttribute("aria-describedby", id);
    this.templateData.container.classList.toggle("webview-backed-markdown-cell", true);
  }
  registerListeners() {
    this._register(this.viewCell.onDidChangeState((e) => {
      this.templateData.cellParts.updateState(this.viewCell, e);
    }));
    this._register(this.viewCell.model.onDidChangeMetadata(() => {
      this.viewUpdate();
    }));
    this._register(this.viewCell.onDidChangeState((e) => {
      if (e.editStateChanged || e.contentChanged) {
        this.viewUpdate();
      }
      if (e.focusModeChanged) {
        this.updateForFocusModeChange();
      }
      if (e.foldingStateChanged) {
        const foldingState = this.viewCell.foldingState;
        if (foldingState !== this.foldingState) {
          this.foldingState = foldingState;
          this.layoutFoldingIndicator();
        }
      }
      if (e.cellIsHoveredChanged) {
        this.updateForHover();
      }
      if (e.inputCollapsedChanged) {
        this.updateCollapsedState();
        this.viewUpdate();
      }
      if (e.cellLineNumberChanged) {
        this.cellEditorOptions.setLineNumbers(this.viewCell.lineNumbers);
      }
    }));
    this._register(this.notebookEditor.notebookOptions.onDidChangeOptions((e) => {
      if (e.showFoldingControls) {
        this.updateFoldingIconShowClass();
      }
    }));
    this._register(this.viewCell.onDidChangeLayout((e) => {
      const layoutInfo = this.editor?.getLayoutInfo();
      if (e.outerWidth && this.viewCell.getEditState() === CellEditState.Editing && layoutInfo && layoutInfo.width !== this.viewCell.layoutInfo.editorWidth) {
        this.onCellEditorWidthChange();
      }
    }));
    this._register(this.cellEditorOptions.onDidChange(() => this.updateMarkupCellOptions()));
  }
  updateMarkupCellOptions() {
    this.updateEditorOptions(this.cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));
    if (this.editor) {
      this.editor.updateOptions(this.cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));
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
            indentSize: this.cellEditorOptions.indentSize,
            tabSize: this.cellEditorOptions.tabSize,
            insertSpaces: this.cellEditorOptions.insertSpaces
          });
        }
      });
    }
  }
  updateCollapsedState() {
    if (this.viewCell.isInputCollapsed) {
      this.notebookEditor.hideMarkupPreviews([this.viewCell]);
    } else {
      this.notebookEditor.unhideMarkupPreviews([this.viewCell]);
    }
  }
  updateForHover() {
    this.templateData.container.classList.toggle("markdown-cell-hover", this.viewCell.cellIsHovered);
  }
  updateForFocusModeChange() {
    if (this.viewCell.focusMode === CellFocusMode.Editor) {
      this.focusEditorIfNeeded();
    }
    this.templateData.container.classList.toggle("cell-editor-focus", this.viewCell.focusMode === CellFocusMode.Editor);
  }
  dispose() {
    this._isDisposed = true;
    if (this.notebookEditor.getActiveCell() === this.viewCell && this.viewCell.focusMode === CellFocusMode.Editor && (this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body)) {
      this.notebookEditor.focusContainer();
    }
    this.viewCell.detachTextEditor();
    super.dispose();
  }
  updateFoldingIconShowClass() {
    const showFoldingIcon = this.notebookEditor.notebookOptions.getDisplayOptions().showFoldingControls;
    this.templateData.foldingIndicator.classList.remove("mouseover", "always");
    this.templateData.foldingIndicator.classList.add(showFoldingIcon);
  }
  viewUpdate() {
    if (this.viewCell.isInputCollapsed) {
      this.viewUpdateCollapsed();
    } else if (this.viewCell.getEditState() === CellEditState.Editing) {
      this.viewUpdateEditing();
    } else {
      this.viewUpdatePreview();
    }
  }
  viewUpdateCollapsed() {
    DOM.show(this.templateData.cellInputCollapsedContainer);
    DOM.hide(this.editorPart);
    this.templateData.cellInputCollapsedContainer.innerText = "";
    const markdownIcon = DOM.append(this.templateData.cellInputCollapsedContainer, DOM.$("span"));
    markdownIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.markdown));
    const element = DOM.$("div");
    element.classList.add("cell-collapse-preview");
    const richEditorText = this.getRichText(this.viewCell.textBuffer, this.viewCell.language);
    element.innerText = richEditorText;
    element.innerHTML = collapsedCellTTPolicy?.createHTML(richEditorText) ?? richEditorText;
    this.templateData.cellInputCollapsedContainer.appendChild(element);
    const expandIcon = DOM.append(element, DOM.$("span.expandInputIcon"));
    expandIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.more));
    const keybinding = this.keybindingService.lookupKeybinding(EXPAND_CELL_INPUT_COMMAND_ID);
    if (keybinding) {
      element.title = localize("cellExpandInputButtonLabelWithDoubleClick", "Double-click to expand cell input ({0})", keybinding.getLabel());
      expandIcon.title = localize("cellExpandInputButtonLabel", "Expand Cell Input ({0})", keybinding.getLabel());
    }
    this.markdownAccessibilityContainer.ariaHidden = "true";
    this.templateData.container.classList.toggle("input-collapsed", true);
    this.viewCell.renderedMarkdownHeight = 0;
    this.viewCell.layoutChange({});
  }
  getRichText(buffer, language) {
    return tokenizeToStringSync(this.languageService, buffer.getLineContent(1), language);
  }
  viewUpdateEditing() {
    let editorHeight;
    DOM.show(this.editorPart);
    this.markdownAccessibilityContainer.ariaHidden = "true";
    DOM.hide(this.templateData.cellInputCollapsedContainer);
    this.notebookEditor.hideMarkupPreviews([this.viewCell]);
    this.templateData.container.classList.toggle("input-collapsed", false);
    this.templateData.container.classList.toggle("markdown-cell-edit-mode", true);
    if (this.editor && this.editor.hasModel()) {
      editorHeight = this.editor.getContentHeight();
      this.viewCell.attachTextEditor(this.editor);
      this.focusEditorIfNeeded();
      this.bindEditorListeners(this.editor);
      this.editor.layout({
        width: this.viewCell.layoutInfo.editorWidth,
        height: editorHeight
      });
    } else {
      this.editorDisposables.clear();
      const width = this.notebookEditor.notebookOptions.computeMarkdownCellEditorWidth(this.notebookEditor.getLayoutInfo().width);
      const lineNum = this.viewCell.lineCount;
      const lineHeight = this.viewCell.layoutInfo.fontInfo?.lineHeight || 17;
      const editorPadding = this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri);
      editorHeight = Math.max(lineNum, 1) * lineHeight + editorPadding.top + editorPadding.bottom;
      this.templateData.editorContainer.innerText = "";
      const editorContextKeyService = this.contextKeyService.createScoped(this.templateData.editorPart);
      EditorContextKeys.inCompositeEditor.bindTo(editorContextKeyService).set(true);
      const editorInstaService = this.editorDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editorContextKeyService])));
      this.editorDisposables.add(editorContextKeyService);
      this.editor = this.editorDisposables.add(editorInstaService.createInstance(CodeEditorWidget, this.templateData.editorContainer, {
        ...this.editorOptions,
        dimension: {
          width,
          height: editorHeight
        },
        allowVariableLineHeights: false
        // overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode()
      }, {
        contributions: this.notebookEditor.creationOptions.cellEditorContributions
      }));
      this.templateData.currentEditor = this.editor;
      this.editorDisposables.add(this.editor.onDidBlurEditorWidget(() => {
        if (this.editor) {
          WordHighlighterContribution.get(this.editor)?.stopHighlighting();
        }
      }));
      this.editorDisposables.add(this.editor.onDidFocusEditorWidget(() => {
        if (this.editor) {
          WordHighlighterContribution.get(this.editor)?.restoreViewState(true);
        }
      }));
      const cts = new CancellationTokenSource();
      this.editorDisposables.add({ dispose() {
        cts.dispose(true);
      } });
      raceCancellation(this.viewCell.resolveTextModel(), cts.token).then((model) => {
        if (!model) {
          return;
        }
        this.editor.setModel(model);
        model.updateOptions({
          indentSize: this.cellEditorOptions.indentSize,
          tabSize: this.cellEditorOptions.tabSize,
          insertSpaces: this.cellEditorOptions.insertSpaces
        });
        const realContentHeight = this.editor.getContentHeight();
        if (realContentHeight !== editorHeight) {
          this.editor.layout(
            {
              width,
              height: realContentHeight
            }
          );
          editorHeight = realContentHeight;
        }
        this.viewCell.attachTextEditor(this.editor);
        if (this.viewCell.getEditState() === CellEditState.Editing) {
          this.focusEditorIfNeeded();
        }
        this.bindEditorListeners(this.editor);
        this.viewCell.editorHeight = editorHeight;
      });
    }
    this.viewCell.editorHeight = editorHeight;
    this.focusEditorIfNeeded();
    this.renderedEditors.set(this.viewCell, this.editor);
  }
  viewUpdatePreview() {
    this.viewCell.detachTextEditor();
    DOM.hide(this.editorPart);
    DOM.hide(this.templateData.cellInputCollapsedContainer);
    this.markdownAccessibilityContainer.ariaHidden = "false";
    this.templateData.container.classList.toggle("input-collapsed", false);
    this.templateData.container.classList.toggle("markdown-cell-edit-mode", false);
    this.renderedEditors.delete(this.viewCell);
    this.markdownAccessibilityContainer.innerText = "";
    if (this.viewCell.renderedHtml) {
      if (this.accessibilityService.isScreenReaderOptimized()) {
        domSanitize.safeSetInnerHtml(this.markdownAccessibilityContainer, this.viewCell.renderedHtml);
      } else {
        DOM.clearNode(this.markdownAccessibilityContainer);
      }
    }
    this.notebookEditor.createMarkupPreview(this.viewCell);
  }
  focusEditorIfNeeded() {
    if (this.viewCell.focusMode === CellFocusMode.Editor && (this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body)) {
      if (!this.editor) {
        return;
      }
      this.editor.focus();
      const primarySelection = this.editor.getSelection();
      if (!primarySelection) {
        return;
      }
      this.notebookEditor.revealRangeInViewAsync(this.viewCell, primarySelection);
    }
  }
  layoutEditor(dimension) {
    this.editor?.layout(dimension);
  }
  onCellEditorWidthChange() {
    const realContentHeight = this.editor.getContentHeight();
    this.layoutEditor(
      {
        width: this.viewCell.layoutInfo.editorWidth,
        height: realContentHeight
      }
    );
  }
  relayoutCell() {
    this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
    this.layoutFoldingIndicator();
  }
  updateEditorOptions(newValue) {
    this.editorOptions = newValue;
    this.editor?.updateOptions(this.editorOptions);
  }
  layoutFoldingIndicator() {
    switch (this.foldingState) {
      case CellFoldingState.None:
        this.templateData.foldingIndicator.style.display = "none";
        this.templateData.foldingIndicator.innerText = "";
        break;
      case CellFoldingState.Collapsed:
        this.templateData.foldingIndicator.style.display = "";
        DOM.reset(this.templateData.foldingIndicator, renderIcon(collapsedIcon));
        break;
      case CellFoldingState.Expanded:
        this.templateData.foldingIndicator.style.display = "";
        DOM.reset(this.templateData.foldingIndicator, renderIcon(expandedIcon));
        break;
      default:
        break;
    }
  }
  bindEditorListeners(editor) {
    this.localDisposables.clear();
    this.focusSwitchDisposable.clear();
    this.localDisposables.add(editor.onDidContentSizeChange((e) => {
      if (e.contentHeightChanged) {
        this.onCellEditorHeightChange(editor, e.contentHeight);
      }
    }));
    this.localDisposables.add(editor.onDidChangeCursorSelection((e) => {
      if (e.source === "restoreState") {
        return;
      }
      const selections = editor.getSelections();
      if (selections?.length) {
        const contentHeight = editor.getContentHeight();
        const layoutContentHeight = this.viewCell.layoutInfo.editorHeight;
        if (contentHeight !== layoutContentHeight) {
          this.onCellEditorHeightChange(editor, contentHeight);
        }
        const lastSelection = selections[selections.length - 1];
        this.notebookEditor.revealRangeInViewAsync(this.viewCell, lastSelection);
      }
    }));
    const updateFocusMode = () => this.viewCell.focusMode = editor.hasWidgetFocus() ? CellFocusMode.Editor : CellFocusMode.Container;
    this.localDisposables.add(editor.onDidFocusEditorWidget(() => {
      updateFocusMode();
    }));
    this.localDisposables.add(editor.onDidBlurEditorWidget(() => {
      if (this.templateData.container.ownerDocument.activeElement?.contains(this.templateData.container)) {
        this.focusSwitchDisposable.value = disposableTimeout(() => updateFocusMode(), 300);
      } else {
        updateFocusMode();
      }
    }));
    updateFocusMode();
  }
  onCellEditorHeightChange(editor, newHeight) {
    const viewLayout = editor.getLayoutInfo();
    this.viewCell.editorHeight = newHeight;
    editor.layout(
      {
        width: viewLayout.width,
        height: newHeight
      }
    );
  }
};
MarkupCell = __decorateClass([
  __decorateParam(4, IAccessibilityService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, ILanguageService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IKeybindingService)
], MarkupCell);
export {
  MarkupCell
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9jZWxsUGFydHMvbWFya3VwQ2VsbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGRvbVNhbml0aXplIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TYW5pdGl6ZS5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0LCByYWNlQ2FuY2VsbGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IHRva2VuaXplVG9TdHJpbmdTeW5jIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvdGV4dFRvSHRtbFRva2VuaXplci5qcyc7XG5pbXBvcnQgeyBJUmVhZG9ubHlUZXh0QnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFN0YXRlLCBDZWxsRm9jdXNNb2RlLCBDZWxsRm9sZGluZ1N0YXRlLCBFWFBBTkRfQ0VMTF9JTlBVVF9DT01NQU5EX0lELCBJQWN0aXZlTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSwgSUNlbGxWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgY29sbGFwc2VkSWNvbiwgZXhwYW5kZWRJY29uIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tJY29ucy5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4vY2VsbEVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgY29sbGFwc2VkQ2VsbFRUUG9saWN5LCBNYXJrZG93bkNlbGxSZW5kZXJUZW1wbGF0ZSB9IGZyb20gJy4uL25vdGVib29rUmVuZGVyaW5nQ29tbW9uLmpzJztcbmltcG9ydCB7IE1hcmt1cENlbGxWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi92aWV3TW9kZWwvbWFya3VwQ2VsbFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBXb3JkSGlnaGxpZ2h0ZXJDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi93b3JkSGlnaGxpZ2h0ZXIvYnJvd3Nlci93b3JkSGlnaGxpZ2h0ZXIuanMnO1xuXG5leHBvcnQgY2xhc3MgTWFya3VwQ2VsbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgZWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0IHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSBtYXJrZG93bkFjY2Vzc2liaWxpdHlDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBlZGl0b3JQYXJ0OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGxvY2FsRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGZvY3VzU3dpdGNoRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgZm9sZGluZ1N0YXRlOiBDZWxsRm9sZGluZ1N0YXRlO1xuXHRwcml2YXRlIGNlbGxFZGl0b3JPcHRpb25zOiBDZWxsRWRpdG9yT3B0aW9ucztcblx0cHJpdmF0ZSBlZGl0b3JPcHRpb25zOiBJRWRpdG9yT3B0aW9ucztcblx0cHJpdmF0ZSBfaXNEaXNwb3NlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFZGl0b3I6IElBY3RpdmVOb3RlYm9va0VkaXRvckRlbGVnYXRlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlld0NlbGw6IE1hcmt1cENlbGxWaWV3TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0ZW1wbGF0ZURhdGE6IE1hcmtkb3duQ2VsbFJlbmRlclRlbXBsYXRlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVuZGVyZWRFZGl0b3JzOiBNYXA8SUNlbGxWaWV3TW9kZWwsIElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkPixcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY29uc3RydWN0RE9NKCk7XG5cdFx0dGhpcy5lZGl0b3JQYXJ0ID0gdGVtcGxhdGVEYXRhLmVkaXRvclBhcnQ7XG5cdFx0dGhpcy5jZWxsRWRpdG9yT3B0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDZWxsRWRpdG9yT3B0aW9ucyh0aGlzLm5vdGVib29rRWRpdG9yLmdldEJhc2VDZWxsRWRpdG9yT3B0aW9ucyh2aWV3Q2VsbC5sYW5ndWFnZSksIHRoaXMubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0dGhpcy5jZWxsRWRpdG9yT3B0aW9ucy5zZXRMaW5lTnVtYmVycyh0aGlzLnZpZXdDZWxsLmxpbmVOdW1iZXJzKTtcblx0XHR0aGlzLmVkaXRvck9wdGlvbnMgPSB0aGlzLmNlbGxFZGl0b3JPcHRpb25zLmdldFZhbHVlKHRoaXMudmlld0NlbGwuaW50ZXJuYWxNZXRhZGF0YSwgdGhpcy52aWV3Q2VsbC51cmkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHJlbmRlcmVkRWRpdG9ycy5kZWxldGUodGhpcy52aWV3Q2VsbCkpKTtcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cblx0XHQvLyB1cGRhdGUgZm9yIGluaXQgc3RhdGVcblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5jZWxsUGFydHMuc2NoZWR1bGVSZW5kZXJDZWxsKHRoaXMudmlld0NlbGwpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMudGVtcGxhdGVEYXRhLmNlbGxQYXJ0cy51bnJlbmRlckNlbGwodGhpcy52aWV3Q2VsbCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5vbkRpZENoYW5nZVNjcmVlblJlYWRlck9wdGltaXplZCgoKSA9PiB7XG5cdFx0XHR0aGlzLnZpZXdVcGRhdGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZUZvckhvdmVyKCk7XG5cdFx0dGhpcy51cGRhdGVGb3JGb2N1c01vZGVDaGFuZ2UoKTtcblx0XHR0aGlzLmZvbGRpbmdTdGF0ZSA9IHZpZXdDZWxsLmZvbGRpbmdTdGF0ZTtcblx0XHR0aGlzLmxheW91dEZvbGRpbmdJbmRpY2F0b3IoKTtcblx0XHR0aGlzLnVwZGF0ZUZvbGRpbmdJY29uU2hvd0NsYXNzKCk7XG5cblx0XHQvLyB0aGUgbWFya2Rvd24gcHJldmlldydzIGhlaWdodCBtaWdodCBhbHJlYWR5IGJlIHVwZGF0ZWQgYWZ0ZXIgdGhlIHJlbmRlcmVyIGNhbGxzIGBlbGVtZW50LmdldEhlaWdodCgpYFxuXHRcdGlmICh0aGlzLnZpZXdDZWxsLmxheW91dEluZm8udG90YWxIZWlnaHQgPiAwKSB7XG5cdFx0XHR0aGlzLnJlbGF5b3V0Q2VsbCgpO1xuXHRcdH1cblxuXHRcdHRoaXMudmlld1VwZGF0ZSgpO1xuXG5cdFx0dGhpcy5sYXlvdXRDZWxsUGFydHMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdDZWxsLm9uRGlkQ2hhbmdlTGF5b3V0KCgpID0+IHtcblx0XHRcdHRoaXMubGF5b3V0Q2VsbFBhcnRzKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0bGF5b3V0Q2VsbFBhcnRzKCkge1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNlbGxQYXJ0cy51cGRhdGVJbnRlcm5hbExheW91dE5vdyh0aGlzLnZpZXdDZWxsKTtcblx0fVxuXG5cdHByaXZhdGUgY29uc3RydWN0RE9NKCkge1xuXHRcdC8vIENyZWF0ZSBhbiBlbGVtZW50IHRoYXQgaXMgb25seSB1c2VkIHRvIGFubm91bmNlIG1hcmt1cCBjZWxsIGNvbnRlbnQgdG8gc2NyZWVuIHJlYWRlcnNcblx0XHRjb25zdCBpZCA9IGBhcmlhLW1hcmt1cC1jZWxsLSR7dGhpcy52aWV3Q2VsbC5pZH1gO1xuXHRcdHRoaXMubWFya2Rvd25BY2Nlc3NpYmlsaXR5Q29udGFpbmVyID0gdGhpcy50ZW1wbGF0ZURhdGEuY2VsbENvbnRhaW5lcjtcblx0XHR0aGlzLm1hcmtkb3duQWNjZXNzaWJpbGl0eUNvbnRhaW5lci5pZCA9IGlkO1xuXHRcdC8vIEhpZGUgdGhlIGVsZW1lbnQgZnJvbSBub24tc2NyZWVuIHJlYWRlcnNcblx0XHR0aGlzLm1hcmtkb3duQWNjZXNzaWJpbGl0eUNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnMXB4Jztcblx0XHR0aGlzLm1hcmtkb3duQWNjZXNzaWJpbGl0eUNvbnRhaW5lci5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXHRcdHRoaXMubWFya2Rvd25BY2Nlc3NpYmlsaXR5Q29udGFpbmVyLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHR0aGlzLm1hcmtkb3duQWNjZXNzaWJpbGl0eUNvbnRhaW5lci5zdHlsZS50b3AgPSAnMTAwMDAwcHgnO1xuXHRcdHRoaXMubWFya2Rvd25BY2Nlc3NpYmlsaXR5Q29udGFpbmVyLnN0eWxlLmxlZnQgPSAnMTAwMDBweCc7XG5cdFx0dGhpcy5tYXJrZG93bkFjY2Vzc2liaWxpdHlDb250YWluZXIuYXJpYUhpZGRlbiA9ICdmYWxzZSc7XG5cblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5yb290Q29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1kZXNjcmliZWRieScsIGlkKTtcblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnd2Vidmlldy1iYWNrZWQtbWFya2Rvd24tY2VsbCcsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdDZWxsLm9uRGlkQ2hhbmdlU3RhdGUoZSA9PiB7XG5cdFx0XHR0aGlzLnRlbXBsYXRlRGF0YS5jZWxsUGFydHMudXBkYXRlU3RhdGUodGhpcy52aWV3Q2VsbCwgZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3Q2VsbC5tb2RlbC5vbkRpZENoYW5nZU1ldGFkYXRhKCgpID0+IHtcblx0XHRcdHRoaXMudmlld1VwZGF0ZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld0NlbGwub25EaWRDaGFuZ2VTdGF0ZSgoZSkgPT4ge1xuXHRcdFx0aWYgKGUuZWRpdFN0YXRlQ2hhbmdlZCB8fCBlLmNvbnRlbnRDaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMudmlld1VwZGF0ZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5mb2N1c01vZGVDaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRm9yRm9jdXNNb2RlQ2hhbmdlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmZvbGRpbmdTdGF0ZUNoYW5nZWQpIHtcblx0XHRcdFx0Y29uc3QgZm9sZGluZ1N0YXRlID0gdGhpcy52aWV3Q2VsbC5mb2xkaW5nU3RhdGU7XG5cblx0XHRcdFx0aWYgKGZvbGRpbmdTdGF0ZSAhPT0gdGhpcy5mb2xkaW5nU3RhdGUpIHtcblx0XHRcdFx0XHR0aGlzLmZvbGRpbmdTdGF0ZSA9IGZvbGRpbmdTdGF0ZTtcblx0XHRcdFx0XHR0aGlzLmxheW91dEZvbGRpbmdJbmRpY2F0b3IoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5jZWxsSXNIb3ZlcmVkQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUZvckhvdmVyKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmlucHV0Q29sbGFwc2VkQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvbGxhcHNlZFN0YXRlKCk7XG5cdFx0XHRcdHRoaXMudmlld1VwZGF0ZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5jZWxsTGluZU51bWJlckNoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5jZWxsRWRpdG9yT3B0aW9ucy5zZXRMaW5lTnVtYmVycyh0aGlzLnZpZXdDZWxsLmxpbmVOdW1iZXJzKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm5vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucy5vbkRpZENoYW5nZU9wdGlvbnMoZSA9PiB7XG5cdFx0XHRpZiAoZS5zaG93Rm9sZGluZ0NvbnRyb2xzKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRm9sZGluZ0ljb25TaG93Q2xhc3MoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdDZWxsLm9uRGlkQ2hhbmdlTGF5b3V0KChlKSA9PiB7XG5cdFx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5lZGl0b3I/LmdldExheW91dEluZm8oKTtcblx0XHRcdGlmIChlLm91dGVyV2lkdGggJiYgdGhpcy52aWV3Q2VsbC5nZXRFZGl0U3RhdGUoKSA9PT0gQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nICYmIGxheW91dEluZm8gJiYgbGF5b3V0SW5mby53aWR0aCAhPT0gdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLmVkaXRvcldpZHRoKSB7XG5cdFx0XHRcdHRoaXMub25DZWxsRWRpdG9yV2lkdGhDaGFuZ2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNlbGxFZGl0b3JPcHRpb25zLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMudXBkYXRlTWFya3VwQ2VsbE9wdGlvbnMoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVNYXJrdXBDZWxsT3B0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZUVkaXRvck9wdGlvbnModGhpcy5jZWxsRWRpdG9yT3B0aW9ucy5nZXRVcGRhdGVkVmFsdWUodGhpcy52aWV3Q2VsbC5pbnRlcm5hbE1ldGFkYXRhLCB0aGlzLnZpZXdDZWxsLnVyaSkpO1xuXG5cdFx0aWYgKHRoaXMuZWRpdG9yKSB7XG5cdFx0XHR0aGlzLmVkaXRvci51cGRhdGVPcHRpb25zKHRoaXMuY2VsbEVkaXRvck9wdGlvbnMuZ2V0VXBkYXRlZFZhbHVlKHRoaXMudmlld0NlbGwuaW50ZXJuYWxNZXRhZGF0YSwgdGhpcy52aWV3Q2VsbC51cmkpKTtcblxuXHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih7IGRpc3Bvc2UoKSB7IGN0cy5kaXNwb3NlKHRydWUpOyB9IH0pO1xuXHRcdFx0cmFjZUNhbmNlbGxhdGlvbih0aGlzLnZpZXdDZWxsLnJlc29sdmVUZXh0TW9kZWwoKSwgY3RzLnRva2VuKS50aGVuKG1vZGVsID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobW9kZWwpIHtcblx0XHRcdFx0XHRtb2RlbC51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0XHRcdGluZGVudFNpemU6IHRoaXMuY2VsbEVkaXRvck9wdGlvbnMuaW5kZW50U2l6ZSxcblx0XHRcdFx0XHRcdHRhYlNpemU6IHRoaXMuY2VsbEVkaXRvck9wdGlvbnMudGFiU2l6ZSxcblx0XHRcdFx0XHRcdGluc2VydFNwYWNlczogdGhpcy5jZWxsRWRpdG9yT3B0aW9ucy5pbnNlcnRTcGFjZXMsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29sbGFwc2VkU3RhdGUoKSB7XG5cdFx0aWYgKHRoaXMudmlld0NlbGwuaXNJbnB1dENvbGxhcHNlZCkge1xuXHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5oaWRlTWFya3VwUHJldmlld3MoW3RoaXMudmlld0NlbGxdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci51bmhpZGVNYXJrdXBQcmV2aWV3cyhbdGhpcy52aWV3Q2VsbF0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRm9ySG92ZXIoKTogdm9pZCB7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ21hcmtkb3duLWNlbGwtaG92ZXInLCB0aGlzLnZpZXdDZWxsLmNlbGxJc0hvdmVyZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVGb3JGb2N1c01vZGVDaGFuZ2UoKSB7XG5cdFx0aWYgKHRoaXMudmlld0NlbGwuZm9jdXNNb2RlID09PSBDZWxsRm9jdXNNb2RlLkVkaXRvcikge1xuXHRcdFx0dGhpcy5mb2N1c0VkaXRvcklmTmVlZGVkKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NlbGwtZWRpdG9yLWZvY3VzJywgdGhpcy52aWV3Q2VsbC5mb2N1c01vZGUgPT09IENlbGxGb2N1c01vZGUuRWRpdG9yKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cblx0XHQvLyBtb3ZlIGZvY3VzIGJhY2sgdG8gdGhlIGNlbGwgbGlzdCBvdGhlcndpc2UgdGhlIGZvY3VzIGdvZXMgdG8gYm9keVxuXHRcdGlmICh0aGlzLm5vdGVib29rRWRpdG9yLmdldEFjdGl2ZUNlbGwoKSA9PT0gdGhpcy52aWV3Q2VsbCAmJiB0aGlzLnZpZXdDZWxsLmZvY3VzTW9kZSA9PT0gQ2VsbEZvY3VzTW9kZS5FZGl0b3IgJiYgKHRoaXMubm90ZWJvb2tFZGl0b3IuaGFzRWRpdG9yRm9jdXMoKSB8fCB0aGlzLm5vdGVib29rRWRpdG9yLmdldERvbU5vZGUoKS5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0RG9tTm9kZSgpLm93bmVyRG9jdW1lbnQuYm9keSkpIHtcblx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IuZm9jdXNDb250YWluZXIoKTtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdDZWxsLmRldGFjaFRleHRFZGl0b3IoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUZvbGRpbmdJY29uU2hvd0NsYXNzKCkge1xuXHRcdGNvbnN0IHNob3dGb2xkaW5nSWNvbiA9IHRoaXMubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLmdldERpc3BsYXlPcHRpb25zKCkuc2hvd0ZvbGRpbmdDb250cm9scztcblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5mb2xkaW5nSW5kaWNhdG9yLmNsYXNzTGlzdC5yZW1vdmUoJ21vdXNlb3ZlcicsICdhbHdheXMnKTtcblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5mb2xkaW5nSW5kaWNhdG9yLmNsYXNzTGlzdC5hZGQoc2hvd0ZvbGRpbmdJY29uKTtcblx0fVxuXG5cdHByaXZhdGUgdmlld1VwZGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy52aWV3Q2VsbC5pc0lucHV0Q29sbGFwc2VkKSB7XG5cdFx0XHR0aGlzLnZpZXdVcGRhdGVDb2xsYXBzZWQoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMudmlld0NlbGwuZ2V0RWRpdFN0YXRlKCkgPT09IENlbGxFZGl0U3RhdGUuRWRpdGluZykge1xuXHRcdFx0dGhpcy52aWV3VXBkYXRlRWRpdGluZygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnZpZXdVcGRhdGVQcmV2aWV3KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB2aWV3VXBkYXRlQ29sbGFwc2VkKCk6IHZvaWQge1xuXHRcdERPTS5zaG93KHRoaXMudGVtcGxhdGVEYXRhLmNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lcik7XG5cdFx0RE9NLmhpZGUodGhpcy5lZGl0b3JQYXJ0KTtcblxuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lci5pbm5lclRleHQgPSAnJztcblxuXHRcdGNvbnN0IG1hcmtkb3duSWNvbiA9IERPTS5hcHBlbmQodGhpcy50ZW1wbGF0ZURhdGEuY2VsbElucHV0Q29sbGFwc2VkQ29udGFpbmVyLCBET00uJCgnc3BhbicpKTtcblx0XHRtYXJrZG93bkljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLm1hcmtkb3duKSk7XG5cblx0XHRjb25zdCBlbGVtZW50ID0gRE9NLiQoJ2RpdicpO1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2VsbC1jb2xsYXBzZS1wcmV2aWV3Jyk7XG5cdFx0Y29uc3QgcmljaEVkaXRvclRleHQgPSB0aGlzLmdldFJpY2hUZXh0KHRoaXMudmlld0NlbGwudGV4dEJ1ZmZlciwgdGhpcy52aWV3Q2VsbC5sYW5ndWFnZSk7XG5cdFx0ZWxlbWVudC5pbm5lclRleHQgPSByaWNoRWRpdG9yVGV4dDtcblx0XHRlbGVtZW50LmlubmVySFRNTCA9IChjb2xsYXBzZWRDZWxsVFRQb2xpY3k/LmNyZWF0ZUhUTUwocmljaEVkaXRvclRleHQpID8/IHJpY2hFZGl0b3JUZXh0KSBhcyBzdHJpbmc7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY2VsbElucHV0Q29sbGFwc2VkQ29udGFpbmVyLmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgZXhwYW5kSWNvbiA9IERPTS5hcHBlbmQoZWxlbWVudCwgRE9NLiQoJ3NwYW4uZXhwYW5kSW5wdXRJY29uJykpO1xuXHRcdGV4cGFuZEljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLm1vcmUpKTtcblx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEVYUEFORF9DRUxMX0lOUFVUX0NPTU1BTkRfSUQpO1xuXHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRlbGVtZW50LnRpdGxlID0gbG9jYWxpemUoJ2NlbGxFeHBhbmRJbnB1dEJ1dHRvbkxhYmVsV2l0aERvdWJsZUNsaWNrJywgXCJEb3VibGUtY2xpY2sgdG8gZXhwYW5kIGNlbGwgaW5wdXQgKHswfSlcIiwga2V5YmluZGluZy5nZXRMYWJlbCgpKTtcblx0XHRcdGV4cGFuZEljb24udGl0bGUgPSBsb2NhbGl6ZSgnY2VsbEV4cGFuZElucHV0QnV0dG9uTGFiZWwnLCBcIkV4cGFuZCBDZWxsIElucHV0ICh7MH0pXCIsIGtleWJpbmRpbmcuZ2V0TGFiZWwoKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5tYXJrZG93bkFjY2Vzc2liaWxpdHlDb250YWluZXIuYXJpYUhpZGRlbiA9ICd0cnVlJztcblxuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdpbnB1dC1jb2xsYXBzZWQnLCB0cnVlKTtcblx0XHR0aGlzLnZpZXdDZWxsLnJlbmRlcmVkTWFya2Rvd25IZWlnaHQgPSAwO1xuXHRcdHRoaXMudmlld0NlbGwubGF5b3V0Q2hhbmdlKHt9KTtcblx0fVxuXG5cblx0cHJpdmF0ZSBnZXRSaWNoVGV4dChidWZmZXI6IElSZWFkb25seVRleHRCdWZmZXIsIGxhbmd1YWdlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdG9rZW5pemVUb1N0cmluZ1N5bmModGhpcy5sYW5ndWFnZVNlcnZpY2UsIGJ1ZmZlci5nZXRMaW5lQ29udGVudCgxKSwgbGFuZ3VhZ2UpO1xuXHR9XG5cblx0cHJpdmF0ZSB2aWV3VXBkYXRlRWRpdGluZygpOiB2b2lkIHtcblx0XHQvLyBzd2l0Y2ggdG8gZWRpdGluZyBtb2RlXG5cdFx0bGV0IGVkaXRvckhlaWdodDogbnVtYmVyO1xuXG5cdFx0RE9NLnNob3codGhpcy5lZGl0b3JQYXJ0KTtcblx0XHR0aGlzLm1hcmtkb3duQWNjZXNzaWJpbGl0eUNvbnRhaW5lci5hcmlhSGlkZGVuID0gJ3RydWUnO1xuXHRcdERPTS5oaWRlKHRoaXMudGVtcGxhdGVEYXRhLmNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lcik7XG5cblx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmhpZGVNYXJrdXBQcmV2aWV3cyhbdGhpcy52aWV3Q2VsbF0pO1xuXG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2lucHV0LWNvbGxhcHNlZCcsIGZhbHNlKTtcblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnbWFya2Rvd24tY2VsbC1lZGl0LW1vZGUnLCB0cnVlKTtcblxuXHRcdGlmICh0aGlzLmVkaXRvciAmJiB0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRlZGl0b3JIZWlnaHQgPSB0aGlzLmVkaXRvci5nZXRDb250ZW50SGVpZ2h0KCk7XG5cblx0XHRcdC8vIG5vdCBmaXJzdCB0aW1lLCB3ZSBkb24ndCBuZWVkIHRvIGNyZWF0ZSBlZGl0b3Jcblx0XHRcdHRoaXMudmlld0NlbGwuYXR0YWNoVGV4dEVkaXRvcih0aGlzLmVkaXRvcik7XG5cdFx0XHR0aGlzLmZvY3VzRWRpdG9ySWZOZWVkZWQoKTtcblxuXHRcdFx0dGhpcy5iaW5kRWRpdG9yTGlzdGVuZXJzKHRoaXMuZWRpdG9yKTtcblxuXHRcdFx0dGhpcy5lZGl0b3IubGF5b3V0KHtcblx0XHRcdFx0d2lkdGg6IHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5lZGl0b3JXaWR0aCxcblx0XHRcdFx0aGVpZ2h0OiBlZGl0b3JIZWlnaHRcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRjb25zdCB3aWR0aCA9IHRoaXMubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLmNvbXB1dGVNYXJrZG93bkNlbGxFZGl0b3JXaWR0aCh0aGlzLm5vdGVib29rRWRpdG9yLmdldExheW91dEluZm8oKS53aWR0aCk7XG5cdFx0XHRjb25zdCBsaW5lTnVtID0gdGhpcy52aWV3Q2VsbC5saW5lQ291bnQ7XG5cdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy52aWV3Q2VsbC5sYXlvdXRJbmZvLmZvbnRJbmZvPy5saW5lSGVpZ2h0IHx8IDE3O1xuXHRcdFx0Y29uc3QgZWRpdG9yUGFkZGluZyA9IHRoaXMubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLmNvbXB1dGVFZGl0b3JQYWRkaW5nKHRoaXMudmlld0NlbGwuaW50ZXJuYWxNZXRhZGF0YSwgdGhpcy52aWV3Q2VsbC51cmkpO1xuXHRcdFx0ZWRpdG9ySGVpZ2h0ID0gTWF0aC5tYXgobGluZU51bSwgMSkgKiBsaW5lSGVpZ2h0ICsgZWRpdG9yUGFkZGluZy50b3AgKyBlZGl0b3JQYWRkaW5nLmJvdHRvbTtcblxuXHRcdFx0dGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yQ29udGFpbmVyLmlubmVyVGV4dCA9ICcnO1xuXG5cdFx0XHQvLyBjcmVhdGUgYSBzcGVjaWFsIGNvbnRleHQga2V5IHNlcnZpY2UgdGhhdCBzZXQgdGhlIGluQ29tcG9zaXRlRWRpdG9yLWNvbnRleHRrZXlcblx0XHRcdGNvbnN0IGVkaXRvckNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yUGFydCk7XG5cdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5pbkNvbXBvc2l0ZUVkaXRvci5iaW5kVG8oZWRpdG9yQ29udGV4dEtleVNlcnZpY2UpLnNldCh0cnVlKTtcblx0XHRcdGNvbnN0IGVkaXRvckluc3RhU2VydmljZSA9IHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIGVkaXRvckNvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKGVkaXRvckNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdFx0dGhpcy5lZGl0b3IgPSB0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChlZGl0b3JJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUVkaXRvcldpZGdldCwgdGhpcy50ZW1wbGF0ZURhdGEuZWRpdG9yQ29udGFpbmVyLCB7XG5cdFx0XHRcdC4uLnRoaXMuZWRpdG9yT3B0aW9ucyxcblx0XHRcdFx0ZGltZW5zaW9uOiB7XG5cdFx0XHRcdFx0d2lkdGg6IHdpZHRoLFxuXHRcdFx0XHRcdGhlaWdodDogZWRpdG9ySGVpZ2h0XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFsbG93VmFyaWFibGVMaW5lSGVpZ2h0czogZmFsc2UsXG5cdFx0XHRcdC8vIG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0T3ZlcmZsb3dDb250YWluZXJEb21Ob2RlKClcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29udHJpYnV0aW9uczogdGhpcy5ub3RlYm9va0VkaXRvci5jcmVhdGlvbk9wdGlvbnMuY2VsbEVkaXRvckNvbnRyaWJ1dGlvbnNcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMudGVtcGxhdGVEYXRhLmN1cnJlbnRFZGl0b3IgPSB0aGlzLmVkaXRvcjtcblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuZWRpdG9yLm9uRGlkQmx1ckVkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmVkaXRvcikge1xuXHRcdFx0XHRcdFdvcmRIaWdobGlnaHRlckNvbnRyaWJ1dGlvbi5nZXQodGhpcy5lZGl0b3IpPy5zdG9wSGlnaGxpZ2h0aW5nKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuZWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5lZGl0b3IpIHtcblx0XHRcdFx0XHRXb3JkSGlnaGxpZ2h0ZXJDb250cmlidXRpb24uZ2V0KHRoaXMuZWRpdG9yKT8ucmVzdG9yZVZpZXdTdGF0ZSh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZSgpIHsgY3RzLmRpc3Bvc2UodHJ1ZSk7IH0gfSk7XG5cdFx0XHRyYWNlQ2FuY2VsbGF0aW9uKHRoaXMudmlld0NlbGwucmVzb2x2ZVRleHRNb2RlbCgpLCBjdHMudG9rZW4pLnRoZW4obW9kZWwgPT4ge1xuXHRcdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5lZGl0b3IhLnNldE1vZGVsKG1vZGVsKTtcblx0XHRcdFx0bW9kZWwudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdFx0aW5kZW50U2l6ZTogdGhpcy5jZWxsRWRpdG9yT3B0aW9ucy5pbmRlbnRTaXplLFxuXHRcdFx0XHRcdHRhYlNpemU6IHRoaXMuY2VsbEVkaXRvck9wdGlvbnMudGFiU2l6ZSxcblx0XHRcdFx0XHRpbnNlcnRTcGFjZXM6IHRoaXMuY2VsbEVkaXRvck9wdGlvbnMuaW5zZXJ0U3BhY2VzLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCByZWFsQ29udGVudEhlaWdodCA9IHRoaXMuZWRpdG9yIS5nZXRDb250ZW50SGVpZ2h0KCk7XG5cdFx0XHRcdGlmIChyZWFsQ29udGVudEhlaWdodCAhPT0gZWRpdG9ySGVpZ2h0KSB7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3IhLmxheW91dChcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0d2lkdGg6IHdpZHRoLFxuXHRcdFx0XHRcdFx0XHRoZWlnaHQ6IHJlYWxDb250ZW50SGVpZ2h0XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRlZGl0b3JIZWlnaHQgPSByZWFsQ29udGVudEhlaWdodDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMudmlld0NlbGwuYXR0YWNoVGV4dEVkaXRvcih0aGlzLmVkaXRvciEpO1xuXG5cdFx0XHRcdGlmICh0aGlzLnZpZXdDZWxsLmdldEVkaXRTdGF0ZSgpID09PSBDZWxsRWRpdFN0YXRlLkVkaXRpbmcpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzRWRpdG9ySWZOZWVkZWQoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuYmluZEVkaXRvckxpc3RlbmVycyh0aGlzLmVkaXRvciEpO1xuXG5cdFx0XHRcdHRoaXMudmlld0NlbGwuZWRpdG9ySGVpZ2h0ID0gZWRpdG9ySGVpZ2h0O1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3Q2VsbC5lZGl0b3JIZWlnaHQgPSBlZGl0b3JIZWlnaHQ7XG5cdFx0dGhpcy5mb2N1c0VkaXRvcklmTmVlZGVkKCk7XG5cdFx0dGhpcy5yZW5kZXJlZEVkaXRvcnMuc2V0KHRoaXMudmlld0NlbGwsIHRoaXMuZWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgdmlld1VwZGF0ZVByZXZpZXcoKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3Q2VsbC5kZXRhY2hUZXh0RWRpdG9yKCk7XG5cdFx0RE9NLmhpZGUodGhpcy5lZGl0b3JQYXJ0KTtcblx0XHRET00uaGlkZSh0aGlzLnRlbXBsYXRlRGF0YS5jZWxsSW5wdXRDb2xsYXBzZWRDb250YWluZXIpO1xuXHRcdHRoaXMubWFya2Rvd25BY2Nlc3NpYmlsaXR5Q29udGFpbmVyLmFyaWFIaWRkZW4gPSAnZmFsc2UnO1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdpbnB1dC1jb2xsYXBzZWQnLCBmYWxzZSk7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ21hcmtkb3duLWNlbGwtZWRpdC1tb2RlJywgZmFsc2UpO1xuXG5cdFx0dGhpcy5yZW5kZXJlZEVkaXRvcnMuZGVsZXRlKHRoaXMudmlld0NlbGwpO1xuXG5cdFx0dGhpcy5tYXJrZG93bkFjY2Vzc2liaWxpdHlDb250YWluZXIuaW5uZXJUZXh0ID0gJyc7XG5cdFx0aWYgKHRoaXMudmlld0NlbGwucmVuZGVyZWRIdG1sKSB7XG5cdFx0XHRpZiAodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpKSB7XG5cdFx0XHRcdGRvbVNhbml0aXplLnNhZmVTZXRJbm5lckh0bWwodGhpcy5tYXJrZG93bkFjY2Vzc2liaWxpdHlDb250YWluZXIsIHRoaXMudmlld0NlbGwucmVuZGVyZWRIdG1sKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdERPTS5jbGVhck5vZGUodGhpcy5tYXJrZG93bkFjY2Vzc2liaWxpdHlDb250YWluZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMubm90ZWJvb2tFZGl0b3IuY3JlYXRlTWFya3VwUHJldmlldyh0aGlzLnZpZXdDZWxsKTtcblx0fVxuXG5cdHByaXZhdGUgZm9jdXNFZGl0b3JJZk5lZWRlZCgpIHtcblx0XHRpZiAodGhpcy52aWV3Q2VsbC5mb2N1c01vZGUgPT09IENlbGxGb2N1c01vZGUuRWRpdG9yICYmXG5cdFx0XHQodGhpcy5ub3RlYm9va0VkaXRvci5oYXNFZGl0b3JGb2N1cygpIHx8IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0RG9tTm9kZSgpLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXREb21Ob2RlKCkub3duZXJEb2N1bWVudC5ib2R5KVxuXHRcdCkgeyAvLyBEb24ndCBzdGVhbCBmb2N1cyBmcm9tIG90aGVyIHdvcmtiZW5jaCBwYXJ0cywgYnV0IGlmIGJvZHkgaGFzIGZvY3VzLCB3ZSBjYW4gdGFrZSBpdFxuXHRcdFx0aWYgKCF0aGlzLmVkaXRvcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cblx0XHRcdGNvbnN0IHByaW1hcnlTZWxlY3Rpb24gPSB0aGlzLmVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGlmICghcHJpbWFyeVNlbGVjdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IucmV2ZWFsUmFuZ2VJblZpZXdBc3luYyh0aGlzLnZpZXdDZWxsLCBwcmltYXJ5U2VsZWN0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxheW91dEVkaXRvcihkaW1lbnNpb246IERPTS5JRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3I/LmxheW91dChkaW1lbnNpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNlbGxFZGl0b3JXaWR0aENoYW5nZSgpOiB2b2lkIHtcblx0XHRjb25zdCByZWFsQ29udGVudEhlaWdodCA9IHRoaXMuZWRpdG9yIS5nZXRDb250ZW50SGVpZ2h0KCk7XG5cdFx0dGhpcy5sYXlvdXRFZGl0b3IoXG5cdFx0XHR7XG5cdFx0XHRcdHdpZHRoOiB0aGlzLnZpZXdDZWxsLmxheW91dEluZm8uZWRpdG9yV2lkdGgsXG5cdFx0XHRcdGhlaWdodDogcmVhbENvbnRlbnRIZWlnaHRcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Ly8gTEVUIHRoZSBjb250ZW50IHNpemUgb2JzZXJ2ZXIgdG8gaGFuZGxlIGl0XG5cdFx0Ly8gdGhpcy52aWV3Q2VsbC5lZGl0b3JIZWlnaHQgPSByZWFsQ29udGVudEhlaWdodDtcblx0XHQvLyB0aGlzLnJlbGF5b3V0Q2VsbCgpO1xuXHR9XG5cblx0cmVsYXlvdXRDZWxsKCk6IHZvaWQge1xuXHRcdHRoaXMubm90ZWJvb2tFZGl0b3IubGF5b3V0Tm90ZWJvb2tDZWxsKHRoaXMudmlld0NlbGwsIHRoaXMudmlld0NlbGwubGF5b3V0SW5mby50b3RhbEhlaWdodCk7XG5cdFx0dGhpcy5sYXlvdXRGb2xkaW5nSW5kaWNhdG9yKCk7XG5cdH1cblxuXHR1cGRhdGVFZGl0b3JPcHRpb25zKG5ld1ZhbHVlOiBJRWRpdG9yT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yT3B0aW9ucyA9IG5ld1ZhbHVlO1xuXHRcdHRoaXMuZWRpdG9yPy51cGRhdGVPcHRpb25zKHRoaXMuZWRpdG9yT3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGxheW91dEZvbGRpbmdJbmRpY2F0b3IoKSB7XG5cdFx0c3dpdGNoICh0aGlzLmZvbGRpbmdTdGF0ZSkge1xuXHRcdFx0Y2FzZSBDZWxsRm9sZGluZ1N0YXRlLk5vbmU6XG5cdFx0XHRcdHRoaXMudGVtcGxhdGVEYXRhLmZvbGRpbmdJbmRpY2F0b3Iuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0dGhpcy50ZW1wbGF0ZURhdGEuZm9sZGluZ0luZGljYXRvci5pbm5lclRleHQgPSAnJztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENlbGxGb2xkaW5nU3RhdGUuQ29sbGFwc2VkOlxuXHRcdFx0XHR0aGlzLnRlbXBsYXRlRGF0YS5mb2xkaW5nSW5kaWNhdG9yLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0RE9NLnJlc2V0KHRoaXMudGVtcGxhdGVEYXRhLmZvbGRpbmdJbmRpY2F0b3IsIHJlbmRlckljb24oY29sbGFwc2VkSWNvbikpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ2VsbEZvbGRpbmdTdGF0ZS5FeHBhbmRlZDpcblx0XHRcdFx0dGhpcy50ZW1wbGF0ZURhdGEuZm9sZGluZ0luZGljYXRvci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdERPTS5yZXNldCh0aGlzLnRlbXBsYXRlRGF0YS5mb2xkaW5nSW5kaWNhdG9yLCByZW5kZXJJY29uKGV4cGFuZGVkSWNvbikpO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBiaW5kRWRpdG9yTGlzdGVuZXJzKGVkaXRvcjogQ29kZUVkaXRvcldpZGdldCkge1xuXG5cdFx0dGhpcy5sb2NhbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5mb2N1c1N3aXRjaERpc3Bvc2FibGUuY2xlYXIoKTtcblxuXHRcdHRoaXMubG9jYWxEaXNwb3NhYmxlcy5hZGQoZWRpdG9yLm9uRGlkQ29udGVudFNpemVDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5jb250ZW50SGVpZ2h0Q2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLm9uQ2VsbEVkaXRvckhlaWdodENoYW5nZShlZGl0b3IsIGUuY29udGVudEhlaWdodCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5sb2NhbERpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLnNvdXJjZSA9PT0gJ3Jlc3RvcmVTdGF0ZScpIHtcblx0XHRcdFx0Ly8gZG8gbm90IHJldmVhbCB0aGUgY2VsbCBpbnRvIHZpZXcgaWYgdGhpcyBzZWxlY3Rpb24gY2hhbmdlIHdhcyBjYXVzZWQgYnkgcmVzdG9yaW5nIGVkaXRvcnMuLi5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblxuXHRcdFx0aWYgKHNlbGVjdGlvbnM/Lmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gZWRpdG9yLmdldENvbnRlbnRIZWlnaHQoKTtcblx0XHRcdFx0Y29uc3QgbGF5b3V0Q29udGVudEhlaWdodCA9IHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5lZGl0b3JIZWlnaHQ7XG5cblx0XHRcdFx0aWYgKGNvbnRlbnRIZWlnaHQgIT09IGxheW91dENvbnRlbnRIZWlnaHQpIHtcblx0XHRcdFx0XHR0aGlzLm9uQ2VsbEVkaXRvckhlaWdodENoYW5nZShlZGl0b3IsIGNvbnRlbnRIZWlnaHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGxhc3RTZWxlY3Rpb24gPSBzZWxlY3Rpb25zW3NlbGVjdGlvbnMubGVuZ3RoIC0gMV07XG5cdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IucmV2ZWFsUmFuZ2VJblZpZXdBc3luYyh0aGlzLnZpZXdDZWxsLCBsYXN0U2VsZWN0aW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCB1cGRhdGVGb2N1c01vZGUgPSAoKSA9PiB0aGlzLnZpZXdDZWxsLmZvY3VzTW9kZSA9IGVkaXRvci5oYXNXaWRnZXRGb2N1cygpID8gQ2VsbEZvY3VzTW9kZS5FZGl0b3IgOiBDZWxsRm9jdXNNb2RlLkNvbnRhaW5lcjtcblx0XHR0aGlzLmxvY2FsRGlzcG9zYWJsZXMuYWRkKGVkaXRvci5vbkRpZEZvY3VzRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdHVwZGF0ZUZvY3VzTW9kZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMubG9jYWxEaXNwb3NhYmxlcy5hZGQoZWRpdG9yLm9uRGlkQmx1ckVkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHQvLyB0aGlzIGlzIGZvciBhIHNwZWNpYWwgY2FzZTpcblx0XHRcdC8vIHVzZXJzIGNsaWNrIHRoZSBzdGF0dXMgYmFyIGVtcHR5IHNwYWNlLCB3aGljaCB3ZSB3aWxsIHRoZW4gZm9jdXMgdGhlIGVkaXRvclxuXHRcdFx0Ly8gc28gd2UgZG9uJ3Qgd2FudCB0byB1cGRhdGUgdGhlIGZvY3VzIHN0YXRlIHRvbyBlYWdlcmx5XG5cdFx0XHRpZiAodGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudD8uY29udGFpbnModGhpcy50ZW1wbGF0ZURhdGEuY29udGFpbmVyKSkge1xuXHRcdFx0XHR0aGlzLmZvY3VzU3dpdGNoRGlzcG9zYWJsZS52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHVwZGF0ZUZvY3VzTW9kZSgpLCAzMDApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dXBkYXRlRm9jdXNNb2RlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dXBkYXRlRm9jdXNNb2RlKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ2VsbEVkaXRvckhlaWdodENoYW5nZShlZGl0b3I6IENvZGVFZGl0b3JXaWRnZXQsIG5ld0hlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld0xheW91dCA9IGVkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0dGhpcy52aWV3Q2VsbC5lZGl0b3JIZWlnaHQgPSBuZXdIZWlnaHQ7XG5cdFx0ZWRpdG9yLmxheW91dChcblx0XHRcdHtcblx0XHRcdFx0d2lkdGg6IHZpZXdMYXlvdXQud2lkdGgsXG5cdFx0XHRcdGhlaWdodDogbmV3SGVpZ2h0XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxpQkFBaUI7QUFDN0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUIsd0JBQXdCO0FBQ3BELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFlBQVksaUJBQWlCLG1CQUFtQixvQkFBb0I7QUFFN0UsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlLGVBQWUsa0JBQWtCLG9DQUFtRjtBQUM1SSxTQUFTLGVBQWUsb0JBQW9CO0FBQzVDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQXlEO0FBRWxFLFNBQVMsbUNBQW1DO0FBRXJDLElBQU0sYUFBTixjQUF5QixXQUFXO0FBQUEsRUFlMUMsWUFDa0IsZ0JBQ0EsVUFDQSxjQUNBLGlCQUN1QixzQkFDSCxtQkFDRyxzQkFDTCxpQkFDSixzQkFDSCxtQkFDM0I7QUFDRCxVQUFNO0FBWFc7QUFDQTtBQUNBO0FBQ0E7QUFDdUI7QUFDSDtBQUNHO0FB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eUJBQXlCLFFBQVEsRUFBRSxhQUFhO0FBQUEsTUFDdEQ7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssaUJBQWlCLElBQUksT0FBTywyQkFBMkIsQ0FBQyxNQUFNO0FBQ2xFLFVBQUksRUFBRSxXQUFXLGdCQUFnQjtBQUVoQztBQUFBLE1BQ0Q7QUFFQSxZQUFNLGFBQWEsT0FBTyxjQUFjO0FBRXhDLFVBQUksWUFBWSxRQUFRO0FBQ3ZCLGNBQU0sZ0JBQWdCLE9BQU8saUJBQWlCO0FBQzlDLGNBQU0sc0JBQXNCLEtBQUssU0FBUyxXQUFXO0FBRXJELFlBQUksa0JBQWtCLHFCQUFxQjtBQUMxQyxlQUFLLHlCQUF5QixRQUFRLGFBQWE7QUFBQSxRQUNwRDtBQUNBLGNBQU0sZ0JBQWdCLFdBQVcsV0FBVyxTQUFTLENBQUM7QUFDdEQsYUFBSyxlQUFlLHVCQUF1QixLQUFLLFVBQVUsYUFBYTtBQUFBLE1BQ3hFO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLGtCQUFrQixNQUFNLEtBQUssU0FBUyxZQUFZLE9BQU8sZUFBZSxJQUFJLGNBQWMsU0FBUyxjQUFjO0FBQ3ZILFNBQUssaUJBQWlCLElBQUksT0FBTyx1QkFBdUIsTUFBTTtBQUM3RCxzQkFBZ0I7QUFBQSxJQUNqQixDQUFDLENBQUM7QUFFRixTQUFLLGlCQUFpQixJQUFJLE9BQU8sc0JBQXNCLE1BQU07QUFJNUQsVUFBSSxLQUFLLGFBQWEsVUFBVSxjQUFjLGVBQWUsU0FBUyxLQUFLLGFBQWEsU0FBUyxHQUFHO0FBQ25HLGFBQUssc0JBQXNCLFFBQVEsa0JBQWtCLE1BQU0sZ0JBQWdCLEdBQUcsR0FBRztBQUFBLE1BQ2xGLE9BQU87QUFDTix3QkFBZ0I7QUFBQSxNQUNqQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsb0JBQWdCO0FBQUEsRUFDakI7QUFBQSxFQUVRLHlCQUF5QixRQUEwQixXQUF5QjtBQUNuRixVQUFNLGFBQWEsT0FBTyxjQUFjO0FBQ3hDLFNBQUssU0FBUyxlQUFlO0FBQzdCLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxPQUFPLFdBQVc7QUFBQSxRQUNsQixRQUFRO0FBQUEsTUFDVDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUE5ZmEsYUFBTjtBQUFBLEVBb0JKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXpCVTsiLAogICJuYW1lcyI6IFtdCn0K
