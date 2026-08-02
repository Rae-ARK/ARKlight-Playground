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
import { PixelRatio } from "../../../../../../base/browser/pixelRatio.js";
import * as DOM from "../../../../../../base/browser/dom.js";
import { FastDomNode } from "../../../../../../base/browser/fastDomNode.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { createBareFontInfoFromRawSettings } from "../../../../../../editor/common/config/fontInfoFromSettings.js";
import { EditorContextKeys } from "../../../../../../editor/common/editorContextKeys.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../../../editor/common/languages/modesRegistry.js";
import { localize } from "../../../../../../nls.js";
import { IMenuService } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { CellPartsCollection } from "../cellPart.js";
import { CellChatPart } from "../cellParts/chat/cellChatPart.js";
import { CellComments } from "../cellParts/cellComments.js";
import { CellContextKeyPart } from "../cellParts/cellContextKeys.js";
import { CellDecorations } from "../cellParts/cellDecorations.js";
import { CellDragAndDropPart } from "../cellParts/cellDnd.js";
import { CodeCellDragImageRenderer } from "../cellParts/cellDragRenderer.js";
import { CellEditorOptions } from "../cellParts/cellEditorOptions.js";
import { CellExecutionPart } from "../cellParts/cellExecution.js";
import { CellFocusPart } from "../cellParts/cellFocus.js";
import { CellFocusIndicator } from "../cellParts/cellFocusIndicator.js";
import { CellProgressBar } from "../cellParts/cellProgressBar.js";
import { CellEditorStatusBar } from "../cellParts/cellStatusPart.js";
import { BetweenCellToolbar, CellTitleToolbarPart } from "../cellParts/cellToolbars.js";
import { CodeCell } from "../cellParts/codeCell.js";
import { RunToolbar } from "../cellParts/codeCellRunToolbar.js";
import { CollapsedCellInput } from "../cellParts/collapsedCellInput.js";
import { CollapsedCellOutput } from "../cellParts/collapsedCellOutput.js";
import { FoldedCellHint } from "../cellParts/foldedCellHint.js";
import { MarkupCell } from "../cellParts/markupCell.js";
import { CellKind } from "../../../common/notebookCommon.js";
import { INotebookExecutionStateService } from "../../../common/notebookExecutionStateService.js";
const $ = DOM.$;
let NotebookCellListDelegate = class extends Disposable {
  constructor(targetWindow, configurationService) {
    super();
    this.configurationService = configurationService;
    const editorOptions = this.configurationService.getValue("editor");
    this.lineHeight = createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(targetWindow).value).lineHeight;
  }
  getHeight(element) {
    return element.getHeight(this.lineHeight);
  }
  getDynamicHeight(element) {
    return element.getDynamicHeight();
  }
  getTemplateId(element) {
    if (element.cellKind === CellKind.Markup) {
      return MarkupCellRenderer.TEMPLATE_ID;
    } else {
      return CodeCellRenderer.TEMPLATE_ID;
    }
  }
};
NotebookCellListDelegate = __decorateClass([
  __decorateParam(1, IConfigurationService)
], NotebookCellListDelegate);
class AbstractCellRenderer extends Disposable {
  constructor(instantiationService, notebookEditor, contextMenuService, menuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, language, dndController) {
    super();
    this.instantiationService = instantiationService;
    this.notebookEditor = notebookEditor;
    this.contextMenuService = contextMenuService;
    this.menuService = menuService;
    this.keybindingService = keybindingService;
    this.notificationService = notificationService;
    this.contextKeyServiceProvider = contextKeyServiceProvider;
    this.dndController = dndController;
    this.editorOptions = this._register(new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(language), this.notebookEditor.notebookOptions, configurationService));
  }
  dispose() {
    super.dispose();
    this.dndController = void 0;
  }
}
let MarkupCellRenderer = class extends AbstractCellRenderer {
  constructor(notebookEditor, dndController, renderedEditors, contextKeyServiceProvider, configurationService, instantiationService, contextMenuService, menuService, keybindingService, notificationService, notebookExecutionStateService) {
    super(instantiationService, notebookEditor, contextMenuService, menuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, "markdown", dndController);
    this.renderedEditors = renderedEditors;
    this._notebookExecutionStateService = notebookExecutionStateService;
  }
  get templateId() {
    return MarkupCellRenderer.TEMPLATE_ID;
  }
  renderTemplate(rootContainer) {
    rootContainer.classList.add("markdown-cell-row");
    const container = DOM.append(rootContainer, DOM.$(".cell-inner-container"));
    const templateDisposables = new DisposableStore();
    const contextKeyService = templateDisposables.add(this.contextKeyServiceProvider(container));
    const decorationContainer = DOM.append(rootContainer, $(".cell-decoration"));
    const titleToolbarContainer = DOM.append(container, $(".cell-title-toolbar"));
    const focusIndicatorTop = new FastDomNode(DOM.append(container, $(".cell-focus-indicator.cell-focus-indicator-top")));
    const focusIndicatorLeft = new FastDomNode(DOM.append(container, DOM.$(".cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left")));
    const foldingIndicator = DOM.append(focusIndicatorLeft.domNode, DOM.$(".notebook-folding-indicator"));
    const focusIndicatorRight = new FastDomNode(DOM.append(container, DOM.$(".cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-right")));
    const codeInnerContent = DOM.append(container, $(".cell.code"));
    const editorPart = DOM.append(codeInnerContent, $(".cell-editor-part"));
    const cellChatPart = DOM.append(editorPart, $(".cell-chat-part"));
    const cellInputCollapsedContainer = DOM.append(codeInnerContent, $(".input-collapse-container"));
    cellInputCollapsedContainer.style.display = "none";
    const editorContainer = DOM.append(editorPart, $(".cell-editor-container"));
    editorPart.style.display = "none";
    const cellCommentPartContainer = DOM.append(container, $(".cell-comment-container"));
    const innerContent = DOM.append(container, $(".cell.markdown"));
    const bottomCellContainer = DOM.append(container, $(".cell-bottom-toolbar-container"));
    const scopedInstaService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    const rootClassDelegate = {
      toggle: (className, force) => container.classList.toggle(className, force)
    };
    const titleToolbar = templateDisposables.add(scopedInstaService.createInstance(
      CellTitleToolbarPart,
      titleToolbarContainer,
      rootClassDelegate,
      this.notebookEditor.creationOptions.menuIds.cellTitleToolbar,
      this.notebookEditor.creationOptions.menuIds.cellDeleteToolbar,
      this.notebookEditor
    ));
    const focusIndicatorBottom = new FastDomNode(DOM.append(container, $(".cell-focus-indicator.cell-focus-indicator-bottom")));
    const cellParts = new CellPartsCollection(DOM.getWindow(rootContainer), [
      templateDisposables.add(scopedInstaService.createInstance(CellChatPart, this.notebookEditor, cellChatPart)),
      templateDisposables.add(scopedInstaService.createInstance(CellEditorStatusBar, this.notebookEditor, container, editorPart, void 0)),
      templateDisposables.add(new CellFocusIndicator(this.notebookEditor, titleToolbar, focusIndicatorTop, focusIndicatorLeft, focusIndicatorRight, focusIndicatorBottom)),
      templateDisposables.add(new FoldedCellHint(this.notebookEditor, DOM.append(container, $(".notebook-folded-hint")), this._notebookExecutionStateService)),
      templateDisposables.add(new CellDecorations(this.notebookEditor, rootContainer, decorationContainer)),
      templateDisposables.add(scopedInstaService.createInstance(CellComments, this.notebookEditor, cellCommentPartContainer)),
      templateDisposables.add(new CollapsedCellInput(this.notebookEditor, cellInputCollapsedContainer)),
      templateDisposables.add(new CellFocusPart(container, void 0, this.notebookEditor)),
      templateDisposables.add(new CellDragAndDropPart(container)),
      templateDisposables.add(scopedInstaService.createInstance(CellContextKeyPart, this.notebookEditor))
    ], [
      titleToolbar,
      templateDisposables.add(scopedInstaService.createInstance(BetweenCellToolbar, this.notebookEditor, titleToolbarContainer, bottomCellContainer))
    ]);
    templateDisposables.add(cellParts);
    const templateData = {
      rootContainer,
      cellInputCollapsedContainer,
      instantiationService: scopedInstaService,
      container,
      cellContainer: innerContent,
      editorPart,
      editorContainer,
      foldingIndicator,
      templateDisposables,
      elementDisposables: templateDisposables.add(new DisposableStore()),
      cellParts,
      toJSON: () => {
        return {};
      }
    };
    return templateData;
  }
  renderElement(element, index, templateData, details) {
    if (!this.notebookEditor.hasModel()) {
      throw new Error("The notebook editor is not attached with view model yet.");
    }
    templateData.currentRenderedCell = element;
    templateData.currentEditor = void 0;
    templateData.editorPart.style.display = "none";
    templateData.cellContainer.innerText = "";
    if (details?.height === void 0) {
      return;
    }
    templateData.elementDisposables.add(templateData.instantiationService.createInstance(MarkupCell, this.notebookEditor, element, templateData, this.renderedEditors));
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
  disposeElement(_element, _index, templateData) {
    templateData.elementDisposables.clear();
  }
};
MarkupCellRenderer.TEMPLATE_ID = "markdown_cell";
MarkupCellRenderer = __decorateClass([
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IMenuService),
  __decorateParam(8, IKeybindingService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, INotebookExecutionStateService)
], MarkupCellRenderer);
let CodeCellRenderer = class extends AbstractCellRenderer {
  constructor(notebookEditor, renderedEditors, editorPool, dndController, contextKeyServiceProvider, configurationService, contextMenuService, menuService, instantiationService, keybindingService, notificationService) {
    super(instantiationService, notebookEditor, contextMenuService, menuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, PLAINTEXT_LANGUAGE_ID, dndController);
    this.renderedEditors = renderedEditors;
    this.editorPool = editorPool;
  }
  get templateId() {
    return CodeCellRenderer.TEMPLATE_ID;
  }
  renderTemplate(rootContainer) {
    rootContainer.classList.add("code-cell-row");
    const container = DOM.append(rootContainer, DOM.$(".cell-inner-container"));
    const templateDisposables = new DisposableStore();
    const contextKeyService = templateDisposables.add(this.contextKeyServiceProvider(container));
    const decorationContainer = DOM.append(rootContainer, $(".cell-decoration"));
    const focusIndicatorTop = new FastDomNode(DOM.append(container, $(".cell-focus-indicator.cell-focus-indicator-top")));
    const titleToolbarContainer = DOM.append(container, $(".cell-title-toolbar"));
    const focusIndicatorLeft = new FastDomNode(DOM.append(container, DOM.$(".cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left")));
    const cellChatPart = DOM.append(container, $(".cell-chat-part"));
    const cellContainer = DOM.append(container, $(".cell.code"));
    const runButtonContainer = DOM.append(cellContainer, $(".run-button-container"));
    const cellInputCollapsedContainer = DOM.append(cellContainer, $(".input-collapse-container"));
    cellInputCollapsedContainer.style.display = "none";
    const executionOrderLabel = DOM.append(focusIndicatorLeft.domNode, $("div.execution-count-label"));
    executionOrderLabel.title = localize("cellExecutionOrderCountLabel", "Execution Order");
    const editorPart = DOM.append(cellContainer, $(".cell-editor-part"));
    const editorContainer = DOM.append(editorPart, $(".cell-editor-container"));
    const cellCommentPartContainer = DOM.append(container, $(".cell-comment-container"));
    const editorContextKeyService = templateDisposables.add(this.contextKeyServiceProvider(editorPart));
    const editorInstaService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editorContextKeyService])));
    EditorContextKeys.inCompositeEditor.bindTo(editorContextKeyService).set(true);
    const editor = editorInstaService.createInstance(CodeEditorWidget, editorContainer, {
      ...this.editorOptions.getDefaultValue(),
      allowVariableLineHeights: false,
      dimension: {
        width: 0,
        height: 0
      },
      scrollbar: {
        vertical: "hidden",
        horizontal: "auto",
        handleMouseWheel: false,
        useShadows: false
      }
    }, {
      contributions: this.notebookEditor.creationOptions.cellEditorContributions
    });
    templateDisposables.add(editor);
    const outputContainer = new FastDomNode(DOM.append(container, $(".output")));
    const cellOutputCollapsedContainer = DOM.append(outputContainer.domNode, $(".output-collapse-container"));
    const outputShowMoreContainer = new FastDomNode(DOM.append(container, $(".output-show-more-container")));
    const focusIndicatorRight = new FastDomNode(DOM.append(container, DOM.$(".cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-right")));
    const focusSinkElement = DOM.append(container, $(".cell-editor-focus-sink"));
    focusSinkElement.setAttribute("tabindex", "0");
    const bottomCellToolbarContainer = DOM.append(container, $(".cell-bottom-toolbar-container"));
    const focusIndicatorBottom = new FastDomNode(DOM.append(container, $(".cell-focus-indicator.cell-focus-indicator-bottom")));
    const scopedInstaService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    const rootClassDelegate = {
      toggle: (className, force) => container.classList.toggle(className, force)
    };
    const titleToolbar = templateDisposables.add(scopedInstaService.createInstance(
      CellTitleToolbarPart,
      titleToolbarContainer,
      rootClassDelegate,
      this.notebookEditor.creationOptions.menuIds.cellTitleToolbar,
      this.notebookEditor.creationOptions.menuIds.cellDeleteToolbar,
      this.notebookEditor
    ));
    const focusIndicatorPart = templateDisposables.add(new CellFocusIndicator(this.notebookEditor, titleToolbar, focusIndicatorTop, focusIndicatorLeft, focusIndicatorRight, focusIndicatorBottom));
    const contentParts = [
      focusIndicatorPart,
      templateDisposables.add(scopedInstaService.createInstance(CellChatPart, this.notebookEditor, cellChatPart)),
      templateDisposables.add(scopedInstaService.createInstance(CellEditorStatusBar, this.notebookEditor, container, editorPart, editor)),
      templateDisposables.add(scopedInstaService.createInstance(CellProgressBar, editorPart, cellInputCollapsedContainer)),
      templateDisposables.add(new CellDecorations(this.notebookEditor, rootContainer, decorationContainer)),
      templateDisposables.add(scopedInstaService.createInstance(CellComments, this.notebookEditor, cellCommentPartContainer)),
      templateDisposables.add(scopedInstaService.createInstance(CellExecutionPart, this.notebookEditor, executionOrderLabel)),
      templateDisposables.add(scopedInstaService.createInstance(CollapsedCellOutput, this.notebookEditor, cellOutputCollapsedContainer)),
      templateDisposables.add(new CollapsedCellInput(this.notebookEditor, cellInputCollapsedContainer)),
      templateDisposables.add(new CellFocusPart(container, focusSinkElement, this.notebookEditor)),
      templateDisposables.add(new CellDragAndDropPart(container)),
      templateDisposables.add(scopedInstaService.createInstance(CellContextKeyPart, this.notebookEditor))
    ];
    const { cellExecutePrimary, cellExecuteToolbar } = this.notebookEditor.creationOptions.menuIds;
    if (cellExecutePrimary && cellExecuteToolbar) {
      contentParts.push(templateDisposables.add(
        scopedInstaService.createInstance(RunToolbar, this.notebookEditor, contextKeyService, container, runButtonContainer, cellExecutePrimary, cellExecuteToolbar)
      ));
    }
    const cellParts = new CellPartsCollection(DOM.getWindow(rootContainer), contentParts, [
      titleToolbar,
      templateDisposables.add(scopedInstaService.createInstance(BetweenCellToolbar, this.notebookEditor, titleToolbarContainer, bottomCellToolbarContainer))
    ]);
    templateDisposables.add(cellParts);
    const templateData = {
      rootContainer,
      editorPart,
      cellInputCollapsedContainer,
      cellOutputCollapsedContainer,
      instantiationService: scopedInstaService,
      container,
      cellContainer,
      focusSinkElement,
      outputContainer,
      outputShowMoreContainer,
      editor,
      templateDisposables,
      elementDisposables: templateDisposables.add(new DisposableStore()),
      cellParts,
      toJSON: () => {
        return {};
      }
    };
    const dragHandles = [focusIndicatorLeft.domNode, focusIndicatorPart.codeFocusIndicator.domNode, focusIndicatorPart.outputFocusIndicator.domNode];
    this.dndController?.registerDragHandle(templateData, rootContainer, dragHandles, () => new CodeCellDragImageRenderer().getDragImage(templateData, templateData.editor, "code"));
    return templateData;
  }
  renderElement(element, index, templateData, details) {
    if (!this.notebookEditor.hasModel()) {
      throw new Error("The notebook editor is not attached with view model yet.");
    }
    templateData.currentRenderedCell = element;
    if (details?.height === void 0) {
      return;
    }
    templateData.outputContainer.domNode.innerText = "";
    templateData.outputContainer.domNode.appendChild(templateData.cellOutputCollapsedContainer);
    templateData.elementDisposables.add(templateData.instantiationService.createInstance(CodeCell, this.notebookEditor, element, templateData, this.editorPool));
    this.renderedEditors.set(element, templateData.editor);
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
    this.renderedEditors.delete(element);
  }
};
CodeCellRenderer.TEMPLATE_ID = "code_cell";
CodeCellRenderer = __decorateClass([
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IMenuService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, INotificationService)
], CodeCellRenderer);
export {
  CodeCellRenderer,
  MarkupCellRenderer,
  NotebookCellListDelegate
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9yZW5kZXJlcnMvY2VsbFJlbmRlcmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUGl4ZWxSYXRpbyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9waXhlbFJhdGlvLmpzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEZhc3REb21Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zhc3REb21Ob2RlLmpzJztcbmltcG9ydCB7IElMaXN0RWxlbWVudFJlbmRlckRldGFpbHMsIElMaXN0UmVuZGVyZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVCYXJlRm9udEluZm9Gcm9tUmF3U2V0dGluZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9mb250SW5mb0Zyb21TZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlLCBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUNlbGxWaWV3TW9kZWwsIElOb3RlYm9va0VkaXRvckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IENlbGxQYXJ0c0NvbGxlY3Rpb24gfSBmcm9tICcuLi9jZWxsUGFydC5qcyc7XG5pbXBvcnQgeyBDZWxsQ2hhdFBhcnQgfSBmcm9tICcuLi9jZWxsUGFydHMvY2hhdC9jZWxsQ2hhdFBhcnQuanMnO1xuaW1wb3J0IHsgQ2VsbENvbW1lbnRzIH0gZnJvbSAnLi4vY2VsbFBhcnRzL2NlbGxDb21tZW50cy5qcyc7XG5pbXBvcnQgeyBDZWxsQ29udGV4dEtleVBhcnQgfSBmcm9tICcuLi9jZWxsUGFydHMvY2VsbENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENlbGxEZWNvcmF0aW9ucyB9IGZyb20gJy4uL2NlbGxQYXJ0cy9jZWxsRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2VsbERyYWdBbmREcm9wQ29udHJvbGxlciwgQ2VsbERyYWdBbmREcm9wUGFydCB9IGZyb20gJy4uL2NlbGxQYXJ0cy9jZWxsRG5kLmpzJztcbmltcG9ydCB7IENvZGVDZWxsRHJhZ0ltYWdlUmVuZGVyZXIgfSBmcm9tICcuLi9jZWxsUGFydHMvY2VsbERyYWdSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uL2NlbGxQYXJ0cy9jZWxsRWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBDZWxsRXhlY3V0aW9uUGFydCB9IGZyb20gJy4uL2NlbGxQYXJ0cy9jZWxsRXhlY3V0aW9uLmpzJztcbmltcG9ydCB7IENlbGxGb2N1c1BhcnQgfSBmcm9tICcuLi9jZWxsUGFydHMvY2VsbEZvY3VzLmpzJztcbmltcG9ydCB7IENlbGxGb2N1c0luZGljYXRvciB9IGZyb20gJy4uL2NlbGxQYXJ0cy9jZWxsRm9jdXNJbmRpY2F0b3IuanMnO1xuaW1wb3J0IHsgQ2VsbFByb2dyZXNzQmFyIH0gZnJvbSAnLi4vY2VsbFBhcnRzL2NlbGxQcm9ncmVzc0Jhci5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdG9yU3RhdHVzQmFyIH0gZnJvbSAnLi4vY2VsbFBhcnRzL2NlbGxTdGF0dXNQYXJ0LmpzJztcbmltcG9ydCB7IEJldHdlZW5DZWxsVG9vbGJhciwgQ2VsbFRpdGxlVG9vbGJhclBhcnQgfSBmcm9tICcuLi9jZWxsUGFydHMvY2VsbFRvb2xiYXJzLmpzJztcbmltcG9ydCB7IENvZGVDZWxsIH0gZnJvbSAnLi4vY2VsbFBhcnRzL2NvZGVDZWxsLmpzJztcbmltcG9ydCB7IFJ1blRvb2xiYXIgfSBmcm9tICcuLi9jZWxsUGFydHMvY29kZUNlbGxSdW5Ub29sYmFyLmpzJztcbmltcG9ydCB7IENvbGxhcHNlZENlbGxJbnB1dCB9IGZyb20gJy4uL2NlbGxQYXJ0cy9jb2xsYXBzZWRDZWxsSW5wdXQuanMnO1xuaW1wb3J0IHsgQ29sbGFwc2VkQ2VsbE91dHB1dCB9IGZyb20gJy4uL2NlbGxQYXJ0cy9jb2xsYXBzZWRDZWxsT3V0cHV0LmpzJztcbmltcG9ydCB7IEZvbGRlZENlbGxIaW50IH0gZnJvbSAnLi4vY2VsbFBhcnRzL2ZvbGRlZENlbGxIaW50LmpzJztcbmltcG9ydCB7IE1hcmt1cENlbGwgfSBmcm9tICcuLi9jZWxsUGFydHMvbWFya3VwQ2VsbC5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlLCBNYXJrZG93bkNlbGxSZW5kZXJUZW1wbGF0ZSB9IGZyb20gJy4uL25vdGVib29rUmVuZGVyaW5nQ29tbW9uLmpzJztcbmltcG9ydCB7IENvZGVDZWxsVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vdmlld01vZGVsL2NvZGVDZWxsVmlld01vZGVsLmpzJztcbmltcG9ydCB7IE1hcmt1cENlbGxWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi92aWV3TW9kZWwvbWFya3VwQ2VsbFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vdmlld01vZGVsL25vdGVib29rVmlld01vZGVsSW1wbC5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tDZWxsRWRpdG9yUG9vbCB9IGZyb20gJy4uL25vdGVib29rQ2VsbEVkaXRvclBvb2wuanMnO1xuXG5jb25zdCAkID0gRE9NLiQ7XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0NlbGxMaXN0RGVsZWdhdGUgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8Q2VsbFZpZXdNb2RlbD4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IGxpbmVIZWlnaHQ6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0YXJnZXRXaW5kb3c6IFdpbmRvdyxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9ucyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUVkaXRvck9wdGlvbnM+KCdlZGl0b3InKTtcblx0XHR0aGlzLmxpbmVIZWlnaHQgPSBjcmVhdGVCYXJlRm9udEluZm9Gcm9tUmF3U2V0dGluZ3MoZWRpdG9yT3B0aW9ucywgUGl4ZWxSYXRpby5nZXRJbnN0YW5jZSh0YXJnZXRXaW5kb3cpLnZhbHVlKS5saW5lSGVpZ2h0O1xuXHR9XG5cblx0Z2V0SGVpZ2h0KGVsZW1lbnQ6IENlbGxWaWV3TW9kZWwpOiBudW1iZXIge1xuXHRcdHJldHVybiBlbGVtZW50LmdldEhlaWdodCh0aGlzLmxpbmVIZWlnaHQpO1xuXHR9XG5cblx0Z2V0RHluYW1pY0hlaWdodChlbGVtZW50OiBDZWxsVmlld01vZGVsKTogbnVtYmVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVsZW1lbnQuZ2V0RHluYW1pY0hlaWdodCgpO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBDZWxsVmlld01vZGVsKTogc3RyaW5nIHtcblx0XHRpZiAoZWxlbWVudC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwKSB7XG5cdFx0XHRyZXR1cm4gTWFya3VwQ2VsbFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gQ29kZUNlbGxSZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RDZWxsUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IGVkaXRvck9wdGlvbnM6IENlbGxFZGl0b3JPcHRpb25zO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2VQcm92aWRlcjogKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpID0+IElTY29wZWRDb250ZXh0S2V5U2VydmljZSxcblx0XHRsYW5ndWFnZTogc3RyaW5nLFxuXHRcdHByb3RlY3RlZCBkbmRDb250cm9sbGVyOiBDZWxsRHJhZ0FuZERyb3BDb250cm9sbGVyIHwgdW5kZWZpbmVkXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lZGl0b3JPcHRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IENlbGxFZGl0b3JPcHRpb25zKHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0QmFzZUNlbGxFZGl0b3JPcHRpb25zKGxhbmd1YWdlKSwgdGhpcy5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRuZENvbnRyb2xsZXIgPSB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hcmt1cENlbGxSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0Q2VsbFJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxNYXJrdXBDZWxsVmlld01vZGVsLCBNYXJrZG93bkNlbGxSZW5kZXJUZW1wbGF0ZT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnbWFya2Rvd25fY2VsbCc7XG5cblx0cHJpdmF0ZSBfbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0ZG5kQ29udHJvbGxlcjogQ2VsbERyYWdBbmREcm9wQ29udHJvbGxlcixcblx0XHRwcml2YXRlIHJlbmRlcmVkRWRpdG9yczogTWFwPElDZWxsVmlld01vZGVsLCBJQ29kZUVkaXRvcj4sXG5cdFx0Y29udGV4dEtleVNlcnZpY2VQcm92aWRlcjogKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpID0+IElTY29wZWRDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIG5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoaW5zdGFudGlhdGlvblNlcnZpY2UsIG5vdGVib29rRWRpdG9yLCBjb250ZXh0TWVudVNlcnZpY2UsIG1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlUHJvdmlkZXIsICdtYXJrZG93bicsIGRuZENvbnRyb2xsZXIpO1xuXHRcdHRoaXMuX25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlID0gbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2U7XG5cdH1cblxuXHRnZXQgdGVtcGxhdGVJZCgpIHtcblx0XHRyZXR1cm4gTWFya3VwQ2VsbFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUocm9vdENvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBNYXJrZG93bkNlbGxSZW5kZXJUZW1wbGF0ZSB7XG5cdFx0cm9vdENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtYXJrZG93bi1jZWxsLXJvdycpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IERPTS5hcHBlbmQocm9vdENvbnRhaW5lciwgRE9NLiQoJy5jZWxsLWlubmVyLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZVByb3ZpZGVyKGNvbnRhaW5lcikpO1xuXHRcdGNvbnN0IGRlY29yYXRpb25Db250YWluZXIgPSBET00uYXBwZW5kKHJvb3RDb250YWluZXIsICQoJy5jZWxsLWRlY29yYXRpb24nKSk7XG5cdFx0Y29uc3QgdGl0bGVUb29sYmFyQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jZWxsLXRpdGxlLXRvb2xiYXInKSk7XG5cblx0XHRjb25zdCBmb2N1c0luZGljYXRvclRvcCA9IG5ldyBGYXN0RG9tTm9kZShET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNlbGwtZm9jdXMtaW5kaWNhdG9yLmNlbGwtZm9jdXMtaW5kaWNhdG9yLXRvcCcpKSk7XG5cdFx0Y29uc3QgZm9jdXNJbmRpY2F0b3JMZWZ0ID0gbmV3IEZhc3REb21Ob2RlKERPTS5hcHBlbmQoY29udGFpbmVyLCBET00uJCgnLmNlbGwtZm9jdXMtaW5kaWNhdG9yLmNlbGwtZm9jdXMtaW5kaWNhdG9yLXNpZGUuY2VsbC1mb2N1cy1pbmRpY2F0b3ItbGVmdCcpKSk7XG5cdFx0Y29uc3QgZm9sZGluZ0luZGljYXRvciA9IERPTS5hcHBlbmQoZm9jdXNJbmRpY2F0b3JMZWZ0LmRvbU5vZGUsIERPTS4kKCcubm90ZWJvb2stZm9sZGluZy1pbmRpY2F0b3InKSk7XG5cdFx0Y29uc3QgZm9jdXNJbmRpY2F0b3JSaWdodCA9IG5ldyBGYXN0RG9tTm9kZShET00uYXBwZW5kKGNvbnRhaW5lciwgRE9NLiQoJy5jZWxsLWZvY3VzLWluZGljYXRvci5jZWxsLWZvY3VzLWluZGljYXRvci1zaWRlLmNlbGwtZm9jdXMtaW5kaWNhdG9yLXJpZ2h0JykpKTtcblxuXHRcdGNvbnN0IGNvZGVJbm5lckNvbnRlbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNlbGwuY29kZScpKTtcblx0XHRjb25zdCBlZGl0b3JQYXJ0ID0gRE9NLmFwcGVuZChjb2RlSW5uZXJDb250ZW50LCAkKCcuY2VsbC1lZGl0b3ItcGFydCcpKTtcblx0XHRjb25zdCBjZWxsQ2hhdFBhcnQgPSBET00uYXBwZW5kKGVkaXRvclBhcnQsICQoJy5jZWxsLWNoYXQtcGFydCcpKTtcblx0XHRjb25zdCBjZWxsSW5wdXRDb2xsYXBzZWRDb250YWluZXIgPSBET00uYXBwZW5kKGNvZGVJbm5lckNvbnRlbnQsICQoJy5pbnB1dC1jb2xsYXBzZS1jb250YWluZXInKSk7XG5cdFx0Y2VsbElucHV0Q29sbGFwc2VkQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0Y29uc3QgZWRpdG9yQ29udGFpbmVyID0gRE9NLmFwcGVuZChlZGl0b3JQYXJ0LCAkKCcuY2VsbC1lZGl0b3ItY29udGFpbmVyJykpO1xuXHRcdGVkaXRvclBhcnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRjb25zdCBjZWxsQ29tbWVudFBhcnRDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNlbGwtY29tbWVudC1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgaW5uZXJDb250ZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jZWxsLm1hcmtkb3duJykpO1xuXHRcdGNvbnN0IGJvdHRvbUNlbGxDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNlbGwtYm90dG9tLXRvb2xiYXItY29udGFpbmVyJykpO1xuXG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFTZXJ2aWNlID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgY29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdGNvbnN0IHJvb3RDbGFzc0RlbGVnYXRlID0ge1xuXHRcdFx0dG9nZ2xlOiAoY2xhc3NOYW1lOiBzdHJpbmcsIGZvcmNlPzogYm9vbGVhbikgPT4gY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoY2xhc3NOYW1lLCBmb3JjZSlcblx0XHR9O1xuXHRcdGNvbnN0IHRpdGxlVG9vbGJhciA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENlbGxUaXRsZVRvb2xiYXJQYXJ0LFxuXHRcdFx0dGl0bGVUb29sYmFyQ29udGFpbmVyLFxuXHRcdFx0cm9vdENsYXNzRGVsZWdhdGUsXG5cdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmNyZWF0aW9uT3B0aW9ucy5tZW51SWRzLmNlbGxUaXRsZVRvb2xiYXIsXG5cdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmNyZWF0aW9uT3B0aW9ucy5tZW51SWRzLmNlbGxEZWxldGVUb29sYmFyLFxuXHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvcikpO1xuXHRcdGNvbnN0IGZvY3VzSW5kaWNhdG9yQm90dG9tID0gbmV3IEZhc3REb21Ob2RlKERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuY2VsbC1mb2N1cy1pbmRpY2F0b3IuY2VsbC1mb2N1cy1pbmRpY2F0b3ItYm90dG9tJykpKTtcblxuXHRcdGNvbnN0IGNlbGxQYXJ0cyA9IG5ldyBDZWxsUGFydHNDb2xsZWN0aW9uKERPTS5nZXRXaW5kb3cocm9vdENvbnRhaW5lciksIFtcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsQ2hhdFBhcnQsIHRoaXMubm90ZWJvb2tFZGl0b3IsIGNlbGxDaGF0UGFydCkpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENlbGxFZGl0b3JTdGF0dXNCYXIsIHRoaXMubm90ZWJvb2tFZGl0b3IsIGNvbnRhaW5lciwgZWRpdG9yUGFydCwgdW5kZWZpbmVkKSksXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgQ2VsbEZvY3VzSW5kaWNhdG9yKHRoaXMubm90ZWJvb2tFZGl0b3IsIHRpdGxlVG9vbGJhciwgZm9jdXNJbmRpY2F0b3JUb3AsIGZvY3VzSW5kaWNhdG9yTGVmdCwgZm9jdXNJbmRpY2F0b3JSaWdodCwgZm9jdXNJbmRpY2F0b3JCb3R0b20pKSxcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBGb2xkZWRDZWxsSGludCh0aGlzLm5vdGVib29rRWRpdG9yLCBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm5vdGVib29rLWZvbGRlZC1oaW50JykpLCB0aGlzLl9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSkpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IENlbGxEZWNvcmF0aW9ucyh0aGlzLm5vdGVib29rRWRpdG9yLCByb290Q29udGFpbmVyLCBkZWNvcmF0aW9uQ29udGFpbmVyKSksXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2VsbENvbW1lbnRzLCB0aGlzLm5vdGVib29rRWRpdG9yLCBjZWxsQ29tbWVudFBhcnRDb250YWluZXIpKSxcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBDb2xsYXBzZWRDZWxsSW5wdXQodGhpcy5ub3RlYm9va0VkaXRvciwgY2VsbElucHV0Q29sbGFwc2VkQ29udGFpbmVyKSksXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgQ2VsbEZvY3VzUGFydChjb250YWluZXIsIHVuZGVmaW5lZCwgdGhpcy5ub3RlYm9va0VkaXRvcikpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IENlbGxEcmFnQW5kRHJvcFBhcnQoY29udGFpbmVyKSksXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2VsbENvbnRleHRLZXlQYXJ0LCB0aGlzLm5vdGVib29rRWRpdG9yKSksXG5cdFx0XSwgW1xuXHRcdFx0dGl0bGVUb29sYmFyLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJldHdlZW5DZWxsVG9vbGJhciwgdGhpcy5ub3RlYm9va0VkaXRvciwgdGl0bGVUb29sYmFyQ29udGFpbmVyLCBib3R0b21DZWxsQ29udGFpbmVyKSlcblx0XHRdKTtcblxuXHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGNlbGxQYXJ0cyk7XG5cblx0XHRjb25zdCB0ZW1wbGF0ZURhdGE6IE1hcmtkb3duQ2VsbFJlbmRlclRlbXBsYXRlID0ge1xuXHRcdFx0cm9vdENvbnRhaW5lcixcblx0XHRcdGNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lcixcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBzY29wZWRJbnN0YVNlcnZpY2UsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRjZWxsQ29udGFpbmVyOiBpbm5lckNvbnRlbnQsXG5cdFx0XHRlZGl0b3JQYXJ0LFxuXHRcdFx0ZWRpdG9yQ29udGFpbmVyLFxuXHRcdFx0Zm9sZGluZ0luZGljYXRvcixcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXM6IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSksXG5cdFx0XHRjZWxsUGFydHMsXG5cdFx0XHR0b0pTT046ICgpID0+IHsgcmV0dXJuIHt9OyB9XG5cdFx0fTtcblxuXHRcdHJldHVybiB0ZW1wbGF0ZURhdGE7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IE1hcmt1cENlbGxWaWV3TW9kZWwsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogTWFya2Rvd25DZWxsUmVuZGVyVGVtcGxhdGUsIGRldGFpbHM/OiBJTGlzdEVsZW1lbnRSZW5kZXJEZXRhaWxzKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm5vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVGhlIG5vdGVib29rIGVkaXRvciBpcyBub3QgYXR0YWNoZWQgd2l0aCB2aWV3IG1vZGVsIHlldC4nKTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEuY3VycmVudFJlbmRlcmVkQ2VsbCA9IGVsZW1lbnQ7XG5cdFx0dGVtcGxhdGVEYXRhLmN1cnJlbnRFZGl0b3IgPSB1bmRlZmluZWQ7XG5cdFx0dGVtcGxhdGVEYXRhLmVkaXRvclBhcnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0ZW1wbGF0ZURhdGEuY2VsbENvbnRhaW5lci5pbm5lclRleHQgPSAnJztcblxuXHRcdGlmIChkZXRhaWxzPy5oZWlnaHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRlbXBsYXRlRGF0YS5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYXJrdXBDZWxsLCB0aGlzLm5vdGVib29rRWRpdG9yLCBlbGVtZW50LCB0ZW1wbGF0ZURhdGEsIHRoaXMucmVuZGVyZWRFZGl0b3JzKSk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBNYXJrZG93bkNlbGxSZW5kZXJUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KF9lbGVtZW50OiBJQ2VsbFZpZXdNb2RlbCwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogTWFya2Rvd25DZWxsUmVuZGVyVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvZGVDZWxsUmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdENlbGxSZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8Q29kZUNlbGxWaWV3TW9kZWwsIENvZGVDZWxsUmVuZGVyVGVtcGxhdGU+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2NvZGVfY2VsbCc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvckRlbGVnYXRlLFxuXHRcdHByaXZhdGUgcmVuZGVyZWRFZGl0b3JzOiBNYXA8SUNlbGxWaWV3TW9kZWwsIElDb2RlRWRpdG9yPixcblx0XHRwcml2YXRlIGVkaXRvclBvb2w6IE5vdGVib29rQ2VsbEVkaXRvclBvb2wsXG5cdFx0ZG5kQ29udHJvbGxlcjogQ2VsbERyYWdBbmREcm9wQ29udHJvbGxlcixcblx0XHRjb250ZXh0S2V5U2VydmljZVByb3ZpZGVyOiAoY29udGFpbmVyOiBIVE1MRWxlbWVudCkgPT4gSVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihpbnN0YW50aWF0aW9uU2VydmljZSwgbm90ZWJvb2tFZGl0b3IsIGNvbnRleHRNZW51U2VydmljZSwgbWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2VQcm92aWRlciwgUExBSU5URVhUX0xBTkdVQUdFX0lELCBkbmRDb250cm9sbGVyKTtcblx0fVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCkge1xuXHRcdHJldHVybiBDb2RlQ2VsbFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUocm9vdENvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlIHtcblx0XHRyb290Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NvZGUtY2VsbC1yb3cnKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBET00uYXBwZW5kKHJvb3RDb250YWluZXIsIERPTS4kKCcuY2VsbC1pbm5lci1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgdGVtcGxhdGVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2VQcm92aWRlcihjb250YWluZXIpKTtcblx0XHRjb25zdCBkZWNvcmF0aW9uQ29udGFpbmVyID0gRE9NLmFwcGVuZChyb290Q29udGFpbmVyLCAkKCcuY2VsbC1kZWNvcmF0aW9uJykpO1xuXHRcdGNvbnN0IGZvY3VzSW5kaWNhdG9yVG9wID0gbmV3IEZhc3REb21Ob2RlKERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuY2VsbC1mb2N1cy1pbmRpY2F0b3IuY2VsbC1mb2N1cy1pbmRpY2F0b3ItdG9wJykpKTtcblx0XHRjb25zdCB0aXRsZVRvb2xiYXJDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNlbGwtdGl0bGUtdG9vbGJhcicpKTtcblxuXHRcdC8vIFRoaXMgaXMgYWxzbyB0aGUgZHJhZyBoYW5kbGVcblx0XHRjb25zdCBmb2N1c0luZGljYXRvckxlZnQgPSBuZXcgRmFzdERvbU5vZGUoRE9NLmFwcGVuZChjb250YWluZXIsIERPTS4kKCcuY2VsbC1mb2N1cy1pbmRpY2F0b3IuY2VsbC1mb2N1cy1pbmRpY2F0b3Itc2lkZS5jZWxsLWZvY3VzLWluZGljYXRvci1sZWZ0JykpKTtcblx0XHRjb25zdCBjZWxsQ2hhdFBhcnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNlbGwtY2hhdC1wYXJ0JykpO1xuXHRcdGNvbnN0IGNlbGxDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNlbGwuY29kZScpKTtcblx0XHRjb25zdCBydW5CdXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKGNlbGxDb250YWluZXIsICQoJy5ydW4tYnV0dG9uLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBjZWxsSW5wdXRDb2xsYXBzZWRDb250YWluZXIgPSBET00uYXBwZW5kKGNlbGxDb250YWluZXIsICQoJy5pbnB1dC1jb2xsYXBzZS1jb250YWluZXInKSk7XG5cdFx0Y2VsbElucHV0Q29sbGFwc2VkQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0Y29uc3QgZXhlY3V0aW9uT3JkZXJMYWJlbCA9IERPTS5hcHBlbmQoZm9jdXNJbmRpY2F0b3JMZWZ0LmRvbU5vZGUsICQoJ2Rpdi5leGVjdXRpb24tY291bnQtbGFiZWwnKSk7XG5cdFx0ZXhlY3V0aW9uT3JkZXJMYWJlbC50aXRsZSA9IGxvY2FsaXplKCdjZWxsRXhlY3V0aW9uT3JkZXJDb3VudExhYmVsJywgJ0V4ZWN1dGlvbiBPcmRlcicpO1xuXHRcdGNvbnN0IGVkaXRvclBhcnQgPSBET00uYXBwZW5kKGNlbGxDb250YWluZXIsICQoJy5jZWxsLWVkaXRvci1wYXJ0JykpO1xuXHRcdGNvbnN0IGVkaXRvckNvbnRhaW5lciA9IERPTS5hcHBlbmQoZWRpdG9yUGFydCwgJCgnLmNlbGwtZWRpdG9yLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBjZWxsQ29tbWVudFBhcnRDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNlbGwtY29tbWVudC1jb250YWluZXInKSk7XG5cblx0XHQvLyBjcmVhdGUgYSBzcGVjaWFsIGNvbnRleHQga2V5IHNlcnZpY2UgdGhhdCBzZXQgdGhlIGluQ29tcG9zaXRlRWRpdG9yLWNvbnRleHRrZXlcblx0XHRjb25zdCBlZGl0b3JDb250ZXh0S2V5U2VydmljZSA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2VQcm92aWRlcihlZGl0b3JQYXJ0KSk7XG5cdFx0Y29uc3QgZWRpdG9ySW5zdGFTZXJ2aWNlID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgZWRpdG9yQ29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdEVkaXRvckNvbnRleHRLZXlzLmluQ29tcG9zaXRlRWRpdG9yLmJpbmRUbyhlZGl0b3JDb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpO1xuXG5cdFx0Y29uc3QgZWRpdG9yID0gZWRpdG9ySW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVFZGl0b3JXaWRnZXQsIGVkaXRvckNvbnRhaW5lciwge1xuXHRcdFx0Li4udGhpcy5lZGl0b3JPcHRpb25zLmdldERlZmF1bHRWYWx1ZSgpLFxuXHRcdFx0YWxsb3dWYXJpYWJsZUxpbmVIZWlnaHRzOiBmYWxzZSxcblx0XHRcdGRpbWVuc2lvbjoge1xuXHRcdFx0XHR3aWR0aDogMCxcblx0XHRcdFx0aGVpZ2h0OiAwXG5cdFx0XHR9LFxuXHRcdFx0c2Nyb2xsYmFyOiB7XG5cdFx0XHRcdHZlcnRpY2FsOiAnaGlkZGVuJyxcblx0XHRcdFx0aG9yaXpvbnRhbDogJ2F1dG8nLFxuXHRcdFx0XHRoYW5kbGVNb3VzZVdoZWVsOiBmYWxzZSxcblx0XHRcdFx0dXNlU2hhZG93czogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdGNvbnRyaWJ1dGlvbnM6IHRoaXMubm90ZWJvb2tFZGl0b3IuY3JlYXRpb25PcHRpb25zLmNlbGxFZGl0b3JDb250cmlidXRpb25zXG5cdFx0fSk7XG5cblx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChlZGl0b3IpO1xuXG5cdFx0Y29uc3Qgb3V0cHV0Q29udGFpbmVyID0gbmV3IEZhc3REb21Ob2RlKERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcub3V0cHV0JykpKTtcblx0XHRjb25zdCBjZWxsT3V0cHV0Q29sbGFwc2VkQ29udGFpbmVyID0gRE9NLmFwcGVuZChvdXRwdXRDb250YWluZXIuZG9tTm9kZSwgJCgnLm91dHB1dC1jb2xsYXBzZS1jb250YWluZXInKSk7XG5cdFx0Y29uc3Qgb3V0cHV0U2hvd01vcmVDb250YWluZXIgPSBuZXcgRmFzdERvbU5vZGUoRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5vdXRwdXQtc2hvdy1tb3JlLWNvbnRhaW5lcicpKSk7XG5cdFx0Y29uc3QgZm9jdXNJbmRpY2F0b3JSaWdodCA9IG5ldyBGYXN0RG9tTm9kZShET00uYXBwZW5kKGNvbnRhaW5lciwgRE9NLiQoJy5jZWxsLWZvY3VzLWluZGljYXRvci5jZWxsLWZvY3VzLWluZGljYXRvci1zaWRlLmNlbGwtZm9jdXMtaW5kaWNhdG9yLXJpZ2h0JykpKTtcblx0XHRjb25zdCBmb2N1c1NpbmtFbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jZWxsLWVkaXRvci1mb2N1cy1zaW5rJykpO1xuXHRcdGZvY3VzU2lua0VsZW1lbnQuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0Y29uc3QgYm90dG9tQ2VsbFRvb2xiYXJDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNlbGwtYm90dG9tLXRvb2xiYXItY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGZvY3VzSW5kaWNhdG9yQm90dG9tID0gbmV3IEZhc3REb21Ob2RlKERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuY2VsbC1mb2N1cy1pbmRpY2F0b3IuY2VsbC1mb2N1cy1pbmRpY2F0b3ItYm90dG9tJykpKTtcblxuXHRcdGNvbnN0IHNjb3BlZEluc3RhU2VydmljZSA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblx0XHRjb25zdCByb290Q2xhc3NEZWxlZ2F0ZSA9IHtcblx0XHRcdHRvZ2dsZTogKGNsYXNzTmFtZTogc3RyaW5nLCBmb3JjZT86IGJvb2xlYW4pID0+IGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKGNsYXNzTmFtZSwgZm9yY2UpXG5cdFx0fTtcblx0XHRjb25zdCB0aXRsZVRvb2xiYXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDZWxsVGl0bGVUb29sYmFyUGFydCxcblx0XHRcdHRpdGxlVG9vbGJhckNvbnRhaW5lcixcblx0XHRcdHJvb3RDbGFzc0RlbGVnYXRlLFxuXHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5jcmVhdGlvbk9wdGlvbnMubWVudUlkcy5jZWxsVGl0bGVUb29sYmFyLFxuXHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5jcmVhdGlvbk9wdGlvbnMubWVudUlkcy5jZWxsRGVsZXRlVG9vbGJhcixcblx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IpKTtcblxuXHRcdGNvbnN0IGZvY3VzSW5kaWNhdG9yUGFydCA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBDZWxsRm9jdXNJbmRpY2F0b3IodGhpcy5ub3RlYm9va0VkaXRvciwgdGl0bGVUb29sYmFyLCBmb2N1c0luZGljYXRvclRvcCwgZm9jdXNJbmRpY2F0b3JMZWZ0LCBmb2N1c0luZGljYXRvclJpZ2h0LCBmb2N1c0luZGljYXRvckJvdHRvbSkpO1xuXHRcdGNvbnN0IGNvbnRlbnRQYXJ0cyA9IFtcblx0XHRcdGZvY3VzSW5kaWNhdG9yUGFydCxcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsQ2hhdFBhcnQsIHRoaXMubm90ZWJvb2tFZGl0b3IsIGNlbGxDaGF0UGFydCkpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENlbGxFZGl0b3JTdGF0dXNCYXIsIHRoaXMubm90ZWJvb2tFZGl0b3IsIGNvbnRhaW5lciwgZWRpdG9yUGFydCwgZWRpdG9yKSksXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2VsbFByb2dyZXNzQmFyLCBlZGl0b3JQYXJ0LCBjZWxsSW5wdXRDb2xsYXBzZWRDb250YWluZXIpKSxcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBDZWxsRGVjb3JhdGlvbnModGhpcy5ub3RlYm9va0VkaXRvciwgcm9vdENvbnRhaW5lciwgZGVjb3JhdGlvbkNvbnRhaW5lcikpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENlbGxDb21tZW50cywgdGhpcy5ub3RlYm9va0VkaXRvciwgY2VsbENvbW1lbnRQYXJ0Q29udGFpbmVyKSksXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2VsbEV4ZWN1dGlvblBhcnQsIHRoaXMubm90ZWJvb2tFZGl0b3IsIGV4ZWN1dGlvbk9yZGVyTGFiZWwpKSxcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2xsYXBzZWRDZWxsT3V0cHV0LCB0aGlzLm5vdGVib29rRWRpdG9yLCBjZWxsT3V0cHV0Q29sbGFwc2VkQ29udGFpbmVyKSksXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgQ29sbGFwc2VkQ2VsbElucHV0KHRoaXMubm90ZWJvb2tFZGl0b3IsIGNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lcikpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IENlbGxGb2N1c1BhcnQoY29udGFpbmVyLCBmb2N1c1NpbmtFbGVtZW50LCB0aGlzLm5vdGVib29rRWRpdG9yKSksXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgQ2VsbERyYWdBbmREcm9wUGFydChjb250YWluZXIpKSxcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsQ29udGV4dEtleVBhcnQsIHRoaXMubm90ZWJvb2tFZGl0b3IpKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyBjZWxsRXhlY3V0ZVByaW1hcnksIGNlbGxFeGVjdXRlVG9vbGJhciB9ID0gdGhpcy5ub3RlYm9va0VkaXRvci5jcmVhdGlvbk9wdGlvbnMubWVudUlkcztcblx0XHRpZiAoY2VsbEV4ZWN1dGVQcmltYXJ5ICYmIGNlbGxFeGVjdXRlVG9vbGJhcikge1xuXHRcdFx0Y29udGVudFBhcnRzLnB1c2godGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoXG5cdFx0XHRcdHNjb3BlZEluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShSdW5Ub29sYmFyLCB0aGlzLm5vdGVib29rRWRpdG9yLCBjb250ZXh0S2V5U2VydmljZSwgY29udGFpbmVyLCBydW5CdXR0b25Db250YWluZXIsIGNlbGxFeGVjdXRlUHJpbWFyeSwgY2VsbEV4ZWN1dGVUb29sYmFyKVxuXHRcdFx0KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2VsbFBhcnRzID0gbmV3IENlbGxQYXJ0c0NvbGxlY3Rpb24oRE9NLmdldFdpbmRvdyhyb290Q29udGFpbmVyKSwgY29udGVudFBhcnRzLCBbXG5cdFx0XHR0aXRsZVRvb2xiYXIsXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQmV0d2VlbkNlbGxUb29sYmFyLCB0aGlzLm5vdGVib29rRWRpdG9yLCB0aXRsZVRvb2xiYXJDb250YWluZXIsIGJvdHRvbUNlbGxUb29sYmFyQ29udGFpbmVyKSlcblx0XHRdKTtcblxuXHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGNlbGxQYXJ0cyk7XG5cblx0XHRjb25zdCB0ZW1wbGF0ZURhdGE6IENvZGVDZWxsUmVuZGVyVGVtcGxhdGUgPSB7XG5cdFx0XHRyb290Q29udGFpbmVyLFxuXHRcdFx0ZWRpdG9yUGFydCxcblx0XHRcdGNlbGxJbnB1dENvbGxhcHNlZENvbnRhaW5lcixcblx0XHRcdGNlbGxPdXRwdXRDb2xsYXBzZWRDb250YWluZXIsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogc2NvcGVkSW5zdGFTZXJ2aWNlLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0Y2VsbENvbnRhaW5lcixcblx0XHRcdGZvY3VzU2lua0VsZW1lbnQsXG5cdFx0XHRvdXRwdXRDb250YWluZXIsXG5cdFx0XHRvdXRwdXRTaG93TW9yZUNvbnRhaW5lcixcblx0XHRcdGVkaXRvcixcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXM6IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSksXG5cdFx0XHRjZWxsUGFydHMsXG5cdFx0XHR0b0pTT046ICgpID0+IHsgcmV0dXJuIHt9OyB9XG5cdFx0fTtcblxuXHRcdC8vIGZvY3VzSW5kaWNhdG9yTGVmdCBjb3ZlcnMgdGhlIGxlZnQgbWFyZ2luIGFyZWFcblx0XHQvLyBjb2RlL291dHB1dEZvY3VzSW5kaWNhdG9yIG5lZWQgdG8gYmUgcmVnaXN0ZXJlZCBhcyBkcmFnIGhhbmRsZXJzIHNvIHRoZWlyIGNsaWNrIGhhbmRsZXJzIGRvbid0IHRha2Ugb3ZlclxuXHRcdGNvbnN0IGRyYWdIYW5kbGVzID0gW2ZvY3VzSW5kaWNhdG9yTGVmdC5kb21Ob2RlLCBmb2N1c0luZGljYXRvclBhcnQuY29kZUZvY3VzSW5kaWNhdG9yLmRvbU5vZGUsIGZvY3VzSW5kaWNhdG9yUGFydC5vdXRwdXRGb2N1c0luZGljYXRvci5kb21Ob2RlXTtcblx0XHR0aGlzLmRuZENvbnRyb2xsZXI/LnJlZ2lzdGVyRHJhZ0hhbmRsZSh0ZW1wbGF0ZURhdGEsIHJvb3RDb250YWluZXIsIGRyYWdIYW5kbGVzLCAoKSA9PiBuZXcgQ29kZUNlbGxEcmFnSW1hZ2VSZW5kZXJlcigpLmdldERyYWdJbWFnZSh0ZW1wbGF0ZURhdGEsIHRlbXBsYXRlRGF0YS5lZGl0b3IsICdjb2RlJykpO1xuXHRcdHJldHVybiB0ZW1wbGF0ZURhdGE7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IENvZGVDZWxsVmlld01vZGVsLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IENvZGVDZWxsUmVuZGVyVGVtcGxhdGUsIGRldGFpbHM/OiBJTGlzdEVsZW1lbnRSZW5kZXJEZXRhaWxzKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm5vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVGhlIG5vdGVib29rIGVkaXRvciBpcyBub3QgYXR0YWNoZWQgd2l0aCB2aWV3IG1vZGVsIHlldC4nKTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEuY3VycmVudFJlbmRlcmVkQ2VsbCA9IGVsZW1lbnQ7XG5cblx0XHRpZiAoZGV0YWlscz8uaGVpZ2h0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEub3V0cHV0Q29udGFpbmVyLmRvbU5vZGUuaW5uZXJUZXh0ID0gJyc7XG5cdFx0dGVtcGxhdGVEYXRhLm91dHB1dENvbnRhaW5lci5kb21Ob2RlLmFwcGVuZENoaWxkKHRlbXBsYXRlRGF0YS5jZWxsT3V0cHV0Q29sbGFwc2VkQ29udGFpbmVyKTtcblxuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRlbXBsYXRlRGF0YS5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2RlQ2VsbCwgdGhpcy5ub3RlYm9va0VkaXRvciwgZWxlbWVudCwgdGVtcGxhdGVEYXRhLCB0aGlzLmVkaXRvclBvb2wpKTtcblx0XHR0aGlzLnJlbmRlcmVkRWRpdG9ycy5zZXQoZWxlbWVudCwgdGVtcGxhdGVEYXRhLmVkaXRvcik7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBDb2RlQ2VsbFJlbmRlclRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoZWxlbWVudDogSUNlbGxWaWV3TW9kZWwsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogQ29kZUNlbGxSZW5kZXJUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnJlbmRlcmVkRWRpdG9ycy5kZWxldGUoZWxlbWVudCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsWUFB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
