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
import { renderMarkdown } from "../../../../../../base/browser/markdownRenderer.js";
import { Action } from "../../../../../../base/common/actions.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../../../base/common/marshallingIds.js";
import * as nls from "../../../../../../nls.js";
import { getActionBarActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { WorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { IMenuService, MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../../../platform/quickinput/common/quickInput.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { IExtensionsWorkbenchService } from "../../../../extensions/common/extensions.js";
import { JUPYTER_EXTENSION_ID, RenderOutputType } from "../../notebookBrowser.js";
import { mimetypeIcon } from "../../notebookIcons.js";
import { CellContentPart } from "../cellPart.js";
import { CellUri, NotebookCellExecutionState, RENDERER_NOT_AVAILABLE } from "../../../common/notebookCommon.js";
import { isTextStreamMime } from "../../../../../../base/common/mime.js";
import { INotebookExecutionStateService } from "../../../common/notebookExecutionStateService.js";
import { INotebookService } from "../../../common/notebookService.js";
import { COPY_OUTPUT_COMMAND_ID } from "../../controller/cellOutputActions.js";
import { autorun, observableValue } from "../../../../../../base/common/observable.js";
import { NOTEBOOK_CELL_HAS_HIDDEN_OUTPUTS, NOTEBOOK_CELL_IS_FIRST_OUTPUT, NOTEBOOK_CELL_OUTPUT_MIMETYPE } from "../../../common/notebookContextKeys.js";
import { TEXT_BASED_MIMETYPES } from "../../viewModel/cellOutputTextHelper.js";
let CellOutputElement = class extends Disposable {
  constructor(notebookEditor, viewCell, cellOutputContainer, outputContainer, output, notebookService, quickInputService, parentContextKeyService, menuService, extensionsWorkbenchService, instantiationService) {
    super();
    this.notebookEditor = notebookEditor;
    this.viewCell = viewCell;
    this.cellOutputContainer = cellOutputContainer;
    this.outputContainer = outputContainer;
    this.output = output;
    this.notebookService = notebookService;
    this.quickInputService = quickInputService;
    this.menuService = menuService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.instantiationService = instantiationService;
    this.toolbarDisposables = this._register(new DisposableStore());
    this.toolbarAttached = false;
    this._outputHeightTimer = null;
    this.contextKeyService = parentContextKeyService;
    this._register(this.output.model.onDidChangeData(() => {
      this.rerender();
    }));
    this._register(this.output.onDidResetRenderer(() => {
      this.rerender();
    }));
  }
  detach() {
    this.renderedOutputContainer?.remove();
    let count = 0;
    if (this.innerContainer) {
      for (let i = 0; i < this.innerContainer.childNodes.length; i++) {
        if (this.innerContainer.childNodes[i].className === "rendered-output") {
          count++;
        }
        if (count > 1) {
          break;
        }
      }
      if (count === 0) {
        this.innerContainer.remove();
      }
    }
    this.notebookEditor.removeInset(this.output);
  }
  updateDOMTop(top) {
    if (this.innerContainer) {
      this.innerContainer.style.top = `${top}px`;
    }
  }
  rerender() {
    if (this.notebookEditor.hasModel() && this.innerContainer && this.renderResult && this.renderResult.type === RenderOutputType.Extension) {
      const [mimeTypes, pick] = this.output.resolveMimeTypes(this.notebookEditor.textModel, this.notebookEditor.activeKernel?.preloadProvides);
      const pickedMimeType = mimeTypes[pick];
      if (pickedMimeType.mimeType === this.renderResult.mimeType && pickedMimeType.rendererId === this.renderResult.renderer.id) {
        const index = this.viewCell.outputsViewModels.indexOf(this.output);
        this.notebookEditor.updateOutput(this.viewCell, this.renderResult, this.viewCell.getOutputOffset(index));
        return;
      }
    }
    if (!this.innerContainer) {
      const currOutputIndex = this.cellOutputContainer.renderedOutputEntries.findIndex((entry) => entry.element === this);
      const previousSibling = currOutputIndex > 0 && !!this.cellOutputContainer.renderedOutputEntries[currOutputIndex - 1].element.innerContainer?.parentElement ? this.cellOutputContainer.renderedOutputEntries[currOutputIndex - 1].element.innerContainer : void 0;
      this.render(previousSibling);
    } else {
      const nextElement = this.innerContainer.nextElementSibling;
      this.toolbarDisposables.clear();
      const element = this.innerContainer;
      if (element) {
        element.remove();
        this.notebookEditor.removeInset(this.output);
      }
      this.render(nextElement);
    }
    this._relayoutCell();
  }
  // insert after previousSibling
  _generateInnerOutputContainer(previousSibling, pickedMimeTypeRenderer) {
    this.innerContainer = DOM.$(".output-inner-container");
    if (previousSibling && previousSibling.nextElementSibling) {
      this.outputContainer.domNode.insertBefore(this.innerContainer, previousSibling.nextElementSibling);
    } else {
      this.outputContainer.domNode.appendChild(this.innerContainer);
    }
    this.innerContainer.setAttribute("output-mime-type", pickedMimeTypeRenderer.mimeType);
    return this.innerContainer;
  }
  render(previousSibling) {
    const index = this.viewCell.outputsViewModels.indexOf(this.output);
    if (this.viewCell.isOutputCollapsed || !this.notebookEditor.hasModel()) {
      this.cellOutputContainer.flagAsStale();
      return void 0;
    }
    const notebookUri = CellUri.parse(this.viewCell.uri)?.notebook;
    if (!notebookUri) {
      return void 0;
    }
    const notebookTextModel = this.notebookEditor.textModel;
    const [mimeTypes, pick] = this.output.resolveMimeTypes(notebookTextModel, this.notebookEditor.activeKernel?.preloadProvides);
    const currentMimeType = mimeTypes[pick];
    if (!mimeTypes.find((mimeType) => mimeType.isTrusted) || mimeTypes.length === 0) {
      this.viewCell.updateOutputHeight(index, 0, "CellOutputElement#noMimeType");
      return void 0;
    }
    const selectedPresentation = mimeTypes[pick];
    let renderer = this.notebookService.getRendererInfo(selectedPresentation.rendererId);
    if (!renderer && selectedPresentation.mimeType.indexOf("text/") > -1) {
      renderer = this.notebookService.getRendererInfo("vscode.builtin-renderer");
    }
    const innerContainer = this._generateInnerOutputContainer(previousSibling, selectedPresentation);
    if (index === 0 || this.output.visible.get()) {
      this._attachToolbar(innerContainer, notebookTextModel, this.notebookEditor.activeKernel, index, currentMimeType, mimeTypes);
    } else {
      this._register(autorun((reader) => {
        const visible = reader.readObservable(this.output.visible);
        if (visible && !this.toolbarAttached) {
          this._attachToolbar(innerContainer, notebookTextModel, this.notebookEditor.activeKernel, index, currentMimeType, mimeTypes);
        } else if (!visible) {
          this.toolbarDisposables.clear();
        }
        this.cellOutputContainer.checkForHiddenOutputs();
      }));
      this.cellOutputContainer.hasHiddenOutputs.set(true, void 0);
    }
    this.renderedOutputContainer = DOM.append(innerContainer, DOM.$(".rendered-output"));
    this.renderResult = renderer ? { type: RenderOutputType.Extension, renderer, source: this.output, mimeType: selectedPresentation.mimeType } : this._renderMissingRenderer(this.output, selectedPresentation.mimeType);
    this.output.pickedMimeType = selectedPresentation;
    if (!this.renderResult) {
      this.viewCell.updateOutputHeight(index, 0, "CellOutputElement#renderResultUndefined");
      return void 0;
    }
    this.notebookEditor.createOutput(this.viewCell, this.renderResult, this.viewCell.getOutputOffset(index), false);
    innerContainer.classList.add("background");
    return { initRenderIsSynchronous: false };
  }
  _renderMissingRenderer(viewModel, preferredMimeType) {
    if (!viewModel.model.outputs.length) {
      return this._renderMessage(viewModel, nls.localize("empty", "Cell has no output"));
    }
    if (!preferredMimeType) {
      const mimeTypes = viewModel.model.outputs.map((op) => op.mime);
      const mimeTypesMessage = mimeTypes.join(", ");
      return this._renderMessage(viewModel, nls.localize("noRenderer.2", "No renderer could be found for output. It has the following mimetypes: {0}", mimeTypesMessage));
    }
    return this._renderSearchForMimetype(viewModel, preferredMimeType);
  }
  _renderSearchForMimetype(viewModel, mimeType) {
    const query = `@tag:notebookRenderer ${mimeType}`;
    const p = DOM.$("p", void 0, `No renderer could be found for mimetype "${mimeType}", but one might be available on the Marketplace.`);
    const a = DOM.$("a", { href: `command:workbench.extensions.search?%22${query}%22`, class: "monaco-button monaco-text-button", tabindex: 0, role: "button", style: "padding: 8px; text-decoration: none; color: rgb(255, 255, 255); background-color: rgb(14, 99, 156); max-width: 200px;" }, `Search Marketplace`);
    return {
      type: RenderOutputType.Html,
      source: viewModel,
      htmlContent: p.outerHTML + a.outerHTML
    };
  }
  _renderMessage(viewModel, message) {
    const el = DOM.$("p", void 0, message);
    return { type: RenderOutputType.Html, source: viewModel, htmlContent: el.outerHTML };
  }
  shouldEnableCopy(mimeTypes) {
    if (!mimeTypes.find((mimeType) => TEXT_BASED_MIMETYPES.indexOf(mimeType.mimeType) || mimeType.mimeType.startsWith("image/"))) {
      return false;
    }
    if (isTextStreamMime(mimeTypes[0].mimeType)) {
      const cellViewModel = this.output.cellViewModel;
      const index = cellViewModel.outputsViewModels.indexOf(this.output);
      if (index > 0) {
        const previousOutput = cellViewModel.model.outputs[index - 1];
        return !isTextStreamMime(previousOutput.outputs[0].mime);
      }
    }
    return true;
  }
  async _attachToolbar(outputItemDiv, notebookTextModel, kernel, index, currentMimeType, mimeTypes) {
    const hasMultipleMimeTypes = mimeTypes.filter((mimeType) => mimeType.isTrusted).length > 1;
    const isCopyEnabled = this.shouldEnableCopy(mimeTypes);
    if (index > 0 && !hasMultipleMimeTypes && !isCopyEnabled) {
      return;
    }
    if (!this.notebookEditor.hasModel()) {
      return;
    }
    outputItemDiv.style.position = "relative";
    const mimeTypePicker = DOM.$(".cell-output-toolbar");
    outputItemDiv.appendChild(mimeTypePicker);
    const toolbar = this.toolbarDisposables.add(this.instantiationService.createInstance(WorkbenchToolBar, mimeTypePicker, {
      renderDropdownAsChildElement: false
    }));
    toolbar.context = {
      ui: true,
      cell: this.output.cellViewModel,
      outputViewModel: this.output,
      notebookEditor: this.notebookEditor,
      $mid: MarshalledId.NotebookCellActionContext
    };
    const pickAction = this.toolbarDisposables.add(new Action(
      "notebook.output.pickMimetype",
      nls.localize("pickMimeType", "Change Presentation"),
      ThemeIcon.asClassName(mimetypeIcon),
      void 0,
      async (_context) => this._pickActiveMimeTypeRenderer(outputItemDiv, notebookTextModel, kernel, this.output)
    ));
    const menuContextKeyService = this.toolbarDisposables.add(this.contextKeyService.createScoped(outputItemDiv));
    const hasHiddenOutputs = NOTEBOOK_CELL_HAS_HIDDEN_OUTPUTS.bindTo(menuContextKeyService);
    const isFirstCellOutput = NOTEBOOK_CELL_IS_FIRST_OUTPUT.bindTo(menuContextKeyService);
    const cellOutputMimetype = NOTEBOOK_CELL_OUTPUT_MIMETYPE.bindTo(menuContextKeyService);
    isFirstCellOutput.set(index === 0);
    cellOutputMimetype.set(currentMimeType.mimeType);
    this.toolbarDisposables.add(autorun((r) => {
      hasHiddenOutputs.set(this.cellOutputContainer.hasHiddenOutputs.read(r));
    }));
    const menu = this.toolbarDisposables.add(this.menuService.createMenu(MenuId.NotebookOutputToolbar, menuContextKeyService));
    const updateMenuToolbar = () => {
      let { secondary } = getActionBarActions(menu.getActions({ shouldForwardArgs: true }), () => false);
      if (!isCopyEnabled) {
        secondary = secondary.filter((action) => action.id !== COPY_OUTPUT_COMMAND_ID);
      }
      if (hasMultipleMimeTypes) {
        secondary = [pickAction, ...secondary];
      }
      toolbar.setActions([], secondary);
    };
    updateMenuToolbar();
    this.toolbarDisposables.add(menu.onDidChange(updateMenuToolbar));
  }
  async _pickActiveMimeTypeRenderer(outputItemDiv, notebookTextModel, kernel, viewModel) {
    const [mimeTypes, currIndex] = viewModel.resolveMimeTypes(notebookTextModel, kernel?.preloadProvides);
    const items = [];
    const unsupportedItems = [];
    mimeTypes.forEach((mimeType2, index) => {
      if (mimeType2.isTrusted) {
        const arr = mimeType2.rendererId === RENDERER_NOT_AVAILABLE ? unsupportedItems : items;
        arr.push({
          label: mimeType2.mimeType,
          id: mimeType2.mimeType,
          index,
          picked: index === currIndex,
          detail: this._generateRendererInfo(mimeType2.rendererId),
          description: index === currIndex ? nls.localize("curruentActiveMimeType", "Currently Active") : void 0
        });
      }
    });
    if (unsupportedItems.some((m) => JUPYTER_RENDERER_MIMETYPES.includes(m.id))) {
      unsupportedItems.push({
        label: nls.localize("installJupyterPrompt", "Install additional renderers from the marketplace"),
        id: "installRenderers",
        index: mimeTypes.length
      });
    }
    const disposables = new DisposableStore();
    const picker = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
    picker.items = [
      ...items,
      { type: "separator" },
      ...unsupportedItems
    ];
    picker.activeItems = items.filter((item) => !!item.picked);
    picker.placeholder = items.length !== mimeTypes.length ? nls.localize("promptChooseMimeTypeInSecure.placeHolder", "Select mimetype to render for current output") : nls.localize("promptChooseMimeType.placeHolder", "Select mimetype to render for current output");
    const pick = await new Promise((resolve) => {
      disposables.add(picker.onDidAccept(() => {
        resolve(picker.selectedItems.length === 1 ? picker.selectedItems[0] : void 0);
        disposables.dispose();
      }));
      picker.show();
    });
    if (pick === void 0 || pick.index === currIndex) {
      return;
    }
    if (pick.id === "installRenderers") {
      this._showJupyterExtension();
      return;
    }
    const nextElement = outputItemDiv.nextElementSibling;
    this.toolbarDisposables.clear();
    const element = this.innerContainer;
    if (element) {
      element.remove();
      this.notebookEditor.removeInset(viewModel);
    }
    viewModel.pickedMimeType = mimeTypes[pick.index];
    this.viewCell.updateOutputMinHeight(this.viewCell.layoutInfo.outputTotalHeight);
    const { mimeType, rendererId } = mimeTypes[pick.index];
    this.notebookService.updateMimePreferredRenderer(notebookTextModel.viewType, mimeType, rendererId, mimeTypes.map((m) => m.mimeType));
    this.render(nextElement);
    this._validateFinalOutputHeight(false);
    this._relayoutCell();
  }
  async _showJupyterExtension() {
    await this.extensionsWorkbenchService.openSearch(`@id:${JUPYTER_EXTENSION_ID}`);
  }
  _generateRendererInfo(renderId) {
    const renderInfo = this.notebookService.getRendererInfo(renderId);
    if (renderInfo) {
      const displayName = renderInfo.displayName !== "" ? renderInfo.displayName : renderInfo.id;
      return `${displayName} (${renderInfo.extensionId.value})`;
    }
    return nls.localize("unavailableRenderInfo", "renderer not available");
  }
  _validateFinalOutputHeight(synchronous) {
    if (this._outputHeightTimer !== null) {
      clearTimeout(this._outputHeightTimer);
    }
    if (synchronous) {
      this.viewCell.unlockOutputHeight();
    } else {
      this._outputHeightTimer = setTimeout(() => {
        this.viewCell.unlockOutputHeight();
      }, 1e3);
    }
  }
  _relayoutCell() {
    this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
  }
  dispose() {
    if (this._outputHeightTimer) {
      this.viewCell.unlockOutputHeight();
      clearTimeout(this._outputHeightTimer);
    }
    super.dispose();
  }
};
CellOutputElement = __decorateClass([
  __decorateParam(5, INotebookService),
  __decorateParam(6, IQuickInputService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IExtensionsWorkbenchService),
  __decorateParam(10, IInstantiationService)
], CellOutputElement);
class OutputEntryViewHandler {
  constructor(model, element) {
    this.model = model;
    this.element = element;
  }
}
var CellOutputUpdateContext = /* @__PURE__ */ ((CellOutputUpdateContext2) => {
  CellOutputUpdateContext2[CellOutputUpdateContext2["Execution"] = 1] = "Execution";
  CellOutputUpdateContext2[CellOutputUpdateContext2["Other"] = 2] = "Other";
  return CellOutputUpdateContext2;
})(CellOutputUpdateContext || {});
let CellOutputContainer = class extends CellContentPart {
  constructor(notebookEditor, viewCell, templateData, options, openerService, _notebookExecutionStateService, instantiationService) {
    super();
    this.notebookEditor = notebookEditor;
    this.viewCell = viewCell;
    this.templateData = templateData;
    this.options = options;
    this.openerService = openerService;
    this._notebookExecutionStateService = _notebookExecutionStateService;
    this.instantiationService = instantiationService;
    this._outputEntries = [];
    this._hasStaleOutputs = false;
    this.hasHiddenOutputs = observableValue("hasHiddenOutputs", false);
    this._outputHeightTimer = null;
    this._register(viewCell.onDidStartExecution(() => {
      viewCell.updateOutputMinHeight(viewCell.layoutInfo.outputTotalHeight);
    }));
    this._register(viewCell.onDidStopExecution(() => {
      this._validateFinalOutputHeight(false);
    }));
    this._register(viewCell.onDidChangeOutputs((splice) => {
      const executionState = this._notebookExecutionStateService.getCellExecution(viewCell.uri);
      const context = executionState ? 1 /* Execution */ : 2 /* Other */;
      this._updateOutputs(splice, context);
    }));
    this._register(viewCell.onDidChangeLayout(() => {
      this.updateInternalLayoutNow(viewCell);
    }));
  }
  checkForHiddenOutputs() {
    if (this._outputEntries.find((entry) => {
      return !entry.model.visible.get();
    })) {
      this.hasHiddenOutputs.set(true, void 0);
    } else {
      this.hasHiddenOutputs.set(false, void 0);
    }
  }
  get renderedOutputEntries() {
    return this._outputEntries;
  }
  updateInternalLayoutNow(viewCell) {
    this.templateData.outputContainer.setTop(viewCell.layoutInfo.outputContainerOffset);
    this.templateData.outputShowMoreContainer.setTop(viewCell.layoutInfo.outputShowMoreContainerOffset);
    this._outputEntries.forEach((entry) => {
      const index = this.viewCell.outputsViewModels.indexOf(entry.model);
      if (index >= 0) {
        const top = this.viewCell.getOutputOffsetInContainer(index);
        entry.element.updateDOMTop(top);
      }
    });
  }
  render() {
    try {
      this._doRender();
    } finally {
      this._relayoutCell();
    }
  }
  /**
   * Notify that an output may have been swapped out without the model getting rendered.
   */
  flagAsStale() {
    this._hasStaleOutputs = true;
  }
  _doRender() {
    if (this.viewCell.outputsViewModels.length > 0) {
      if (this.viewCell.layoutInfo.outputTotalHeight !== 0) {
        this.viewCell.updateOutputMinHeight(this.viewCell.layoutInfo.outputTotalHeight);
      }
      DOM.show(this.templateData.outputContainer.domNode);
      for (let index = 0; index < Math.min(this.options.limit, this.viewCell.outputsViewModels.length); index++) {
        const currOutput = this.viewCell.outputsViewModels[index];
        const entry = this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this, this.templateData.outputContainer, currOutput);
        this._outputEntries.push(new OutputEntryViewHandler(currOutput, entry));
        entry.render(void 0);
      }
      if (this.viewCell.outputsViewModels.length > this.options.limit) {
        DOM.show(this.templateData.outputShowMoreContainer.domNode);
        this.viewCell.updateOutputShowMoreContainerHeight(46);
      }
      this._validateFinalOutputHeight(false);
    } else {
      DOM.hide(this.templateData.outputContainer.domNode);
    }
    this.templateData.outputShowMoreContainer.domNode.innerText = "";
    if (this.viewCell.outputsViewModels.length > this.options.limit) {
      this.templateData.outputShowMoreContainer.domNode.appendChild(this._generateShowMoreElement(this.templateData.templateDisposables));
    } else {
      DOM.hide(this.templateData.outputShowMoreContainer.domNode);
      this.viewCell.updateOutputShowMoreContainerHeight(0);
    }
  }
  viewUpdateShowOutputs(initRendering) {
    if (this._hasStaleOutputs) {
      this._hasStaleOutputs = false;
      this._outputEntries.forEach((entry) => {
        entry.element.rerender();
      });
    }
    for (let index = 0; index < this._outputEntries.length; index++) {
      const viewHandler = this._outputEntries[index];
      const outputEntry = viewHandler.element;
      if (outputEntry.renderResult) {
        this.notebookEditor.createOutput(this.viewCell, outputEntry.renderResult, this.viewCell.getOutputOffset(index), false);
      } else {
        outputEntry.render(void 0);
      }
    }
    this._relayoutCell();
  }
  viewUpdateHideOuputs() {
    for (let index = 0; index < this._outputEntries.length; index++) {
      this.notebookEditor.hideInset(this._outputEntries[index].model);
    }
  }
  _validateFinalOutputHeight(synchronous) {
    if (this._outputHeightTimer !== null) {
      clearTimeout(this._outputHeightTimer);
    }
    const executionState = this._notebookExecutionStateService.getCellExecution(this.viewCell.uri);
    if (synchronous) {
      this.viewCell.unlockOutputHeight();
    } else if (executionState?.state !== NotebookCellExecutionState.Executing) {
      this._outputHeightTimer = setTimeout(() => {
        this.viewCell.unlockOutputHeight();
      }, 200);
    }
  }
  _updateOutputs(splice, context = 2 /* Other */) {
    const previousOutputHeight = this.viewCell.layoutInfo.outputTotalHeight;
    this.viewCell.updateOutputMinHeight(previousOutputHeight);
    if (this.viewCell.outputsViewModels.length) {
      DOM.show(this.templateData.outputContainer.domNode);
    } else {
      DOM.hide(this.templateData.outputContainer.domNode);
    }
    this.viewCell.spliceOutputHeights(splice.start, splice.deleteCount, splice.newOutputs.map((_) => 0));
    this._renderNow(splice, context);
  }
  _renderNow(splice, context) {
    if (splice.start >= this.options.limit) {
      return;
    }
    const firstGroupEntries = this._outputEntries.slice(0, splice.start);
    const deletedEntries = this._outputEntries.slice(splice.start, splice.start + splice.deleteCount);
    const secondGroupEntries = this._outputEntries.slice(splice.start + splice.deleteCount);
    let newlyInserted = this.viewCell.outputsViewModels.slice(splice.start, splice.start + splice.newOutputs.length);
    if (firstGroupEntries.length + newlyInserted.length + secondGroupEntries.length > this.options.limit) {
      if (firstGroupEntries.length + newlyInserted.length > this.options.limit) {
        [...deletedEntries, ...secondGroupEntries].forEach((entry) => {
          entry.element.detach();
          entry.element.dispose();
        });
        newlyInserted = newlyInserted.slice(0, this.options.limit - firstGroupEntries.length);
        const newlyInsertedEntries = newlyInserted.map((insert) => {
          return new OutputEntryViewHandler(insert, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this, this.templateData.outputContainer, insert));
        });
        this._outputEntries = [...firstGroupEntries, ...newlyInsertedEntries];
        for (let i = firstGroupEntries.length; i < this._outputEntries.length; i++) {
          this._outputEntries[i].element.render(void 0);
        }
      } else {
        const elementsPushedOutOfView = secondGroupEntries.slice(this.options.limit - firstGroupEntries.length - newlyInserted.length);
        [...deletedEntries, ...elementsPushedOutOfView].forEach((entry) => {
          entry.element.detach();
          entry.element.dispose();
        });
        const reRenderRightBoundary = firstGroupEntries.length + newlyInserted.length;
        const newlyInsertedEntries = newlyInserted.map((insert) => {
          return new OutputEntryViewHandler(insert, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this, this.templateData.outputContainer, insert));
        });
        this._outputEntries = [...firstGroupEntries, ...newlyInsertedEntries, ...secondGroupEntries.slice(0, this.options.limit - firstGroupEntries.length - newlyInserted.length)];
        for (let i = firstGroupEntries.length; i < reRenderRightBoundary; i++) {
          const previousSibling = i - 1 >= 0 && this._outputEntries[i - 1] && !!this._outputEntries[i - 1].element.innerContainer?.parentElement ? this._outputEntries[i - 1].element.innerContainer : void 0;
          this._outputEntries[i].element.render(previousSibling);
        }
      }
    } else {
      deletedEntries.forEach((entry) => {
        entry.element.detach();
        entry.element.dispose();
      });
      const reRenderRightBoundary = firstGroupEntries.length + newlyInserted.length;
      const newlyInsertedEntries = newlyInserted.map((insert) => {
        return new OutputEntryViewHandler(insert, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this, this.templateData.outputContainer, insert));
      });
      let outputsNewlyAvailable = [];
      if (firstGroupEntries.length + newlyInsertedEntries.length + secondGroupEntries.length < this.viewCell.outputsViewModels.length) {
        const last = Math.min(this.options.limit, this.viewCell.outputsViewModels.length);
        outputsNewlyAvailable = this.viewCell.outputsViewModels.slice(firstGroupEntries.length + newlyInsertedEntries.length + secondGroupEntries.length, last).map((output) => {
          return new OutputEntryViewHandler(output, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this, this.templateData.outputContainer, output));
        });
      }
      this._outputEntries = [...firstGroupEntries, ...newlyInsertedEntries, ...secondGroupEntries, ...outputsNewlyAvailable];
      for (let i = firstGroupEntries.length; i < reRenderRightBoundary; i++) {
        const previousSibling = i - 1 >= 0 && this._outputEntries[i - 1] && !!this._outputEntries[i - 1].element.innerContainer?.parentElement ? this._outputEntries[i - 1].element.innerContainer : void 0;
        this._outputEntries[i].element.render(previousSibling);
      }
      for (let i = 0; i < outputsNewlyAvailable.length; i++) {
        this._outputEntries[firstGroupEntries.length + newlyInserted.length + secondGroupEntries.length + i].element.render(void 0);
      }
    }
    if (this.viewCell.outputsViewModels.length > this.options.limit) {
      DOM.show(this.templateData.outputShowMoreContainer.domNode);
      if (!this.templateData.outputShowMoreContainer.domNode.hasChildNodes()) {
        this.templateData.outputShowMoreContainer.domNode.appendChild(this._generateShowMoreElement(this.templateData.templateDisposables));
      }
      this.viewCell.updateOutputShowMoreContainerHeight(46);
    } else {
      DOM.hide(this.templateData.outputShowMoreContainer.domNode);
    }
    this._relayoutCell();
    this._validateFinalOutputHeight(context === 2 /* Other */ && this.viewCell.outputsViewModels.length === 0);
  }
  _generateShowMoreElement(disposables) {
    const md = {
      value: `There are more than ${this.options.limit} outputs, [show more (open the raw output data in a text editor) ...](command:workbench.action.openLargeOutput)`,
      isTrusted: true,
      supportThemeIcons: true
    };
    const rendered = disposables.add(renderMarkdown(md, {
      actionHandler: (content) => {
        if (content === "command:workbench.action.openLargeOutput") {
          this.openerService.open(CellUri.generateCellOutputUriWithId(this.notebookEditor.textModel.uri));
        }
      }
    }));
    rendered.element.classList.add("output-show-more");
    return rendered.element;
  }
  _relayoutCell() {
    this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
  }
  dispose() {
    this.viewCell.updateOutputMinHeight(0);
    if (this._outputHeightTimer) {
      clearTimeout(this._outputHeightTimer);
    }
    this._outputEntries.forEach((entry) => {
      entry.element.dispose();
    });
    super.dispose();
  }
};
CellOutputContainer = __decorateClass([
  __decorateParam(4, IOpenerService),
  __decorateParam(5, INotebookExecutionStateService),
  __decorateParam(6, IInstantiationService)
], CellOutputContainer);
const JUPYTER_RENDERER_MIMETYPES = [
  "application/geo+json",
  "application/vdom.v1+json",
  "application/vnd.dataresource+json",
  "application/vnd.plotly.v1+json",
  "application/vnd.vega.v2+json",
  "application/vnd.vega.v3+json",
  "application/vnd.vega.v4+json",
  "application/vnd.vega.v5+json",
  "application/vnd.vegalite.v1+json",
  "application/vnd.vegalite.v2+json",
  "application/vnd.vegalite.v3+json",
  "application/vnd.vegalite.v4+json",
  "application/x-nteract-model-debug+json",
  "image/svg+xml",
  "text/latex",
  "text/vnd.plotly.v1+html",
  "application/vnd.jupyter.widget-view+json",
  "application/vnd.code.notebook.error"
];
export {
  CellOutputContainer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9jZWxsUGFydHMvY2VsbE91dHB1dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEZhc3REb21Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zhc3REb21Ob2RlLmpzJztcbmltcG9ydCB7IHJlbmRlck1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNlbGxPdXRwdXRWaWV3TW9kZWwsIElDZWxsVmlld01vZGVsLCBJSW5zZXRSZW5kZXJPdXRwdXQsIElOb3RlYm9va0VkaXRvckRlbGVnYXRlLCBKVVBZVEVSX0VYVEVOU0lPTl9JRCwgUmVuZGVyT3V0cHV0VHlwZSB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBtaW1ldHlwZUljb24gfSBmcm9tICcuLi8uLi9ub3RlYm9va0ljb25zLmpzJztcbmltcG9ydCB7IENlbGxDb250ZW50UGFydCB9IGZyb20gJy4uL2NlbGxQYXJ0LmpzJztcbmltcG9ydCB7IENvZGVDZWxsUmVuZGVyVGVtcGxhdGUgfSBmcm9tICcuLi9ub3RlYm9va1JlbmRlcmluZ0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4uLy4uL3ZpZXdNb2RlbC9jb2RlQ2VsbFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1RleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va1RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsVXJpLCBJT3JkZXJlZE1pbWVUeXBlLCBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZSwgTm90ZWJvb2tDZWxsT3V0cHV0c1NwbGljZSwgUkVOREVSRVJfTk9UX0FWQUlMQUJMRSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBpc1RleHRTdHJlYW1NaW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rS2VybmVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rS2VybmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDT1BZX09VVFBVVF9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vY29udHJvbGxlci9jZWxsT3V0cHV0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0NFTExfSEFTX0hJRERFTl9PVVRQVVRTLCBOT1RFQk9PS19DRUxMX0lTX0ZJUlNUX09VVFBVVCwgTk9URUJPT0tfQ0VMTF9PVVRQVVRfTUlNRVRZUEUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBURVhUX0JBU0VEX01JTUVUWVBFUyB9IGZyb20gJy4uLy4uL3ZpZXdNb2RlbC9jZWxsT3V0cHV0VGV4dEhlbHBlci5qcyc7XG5cbmludGVyZmFjZSBJTWltZVR5cGVSZW5kZXJlciBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0aW5kZXg6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElSZW5kZXJSZXN1bHQge1xuXHRpbml0UmVuZGVySXNTeW5jaHJvbm91czogZmFsc2U7XG59XG5cbi8vIERPTSBzdHJ1Y3R1cmVcbi8vXG4vLyAgI291dHB1dFxuLy8gIHxcbi8vICB8ICAjb3V0cHV0LWlubmVyLWNvbnRhaW5lclxuLy8gIHwgICAgICAgICAgICAgICAgICAgICAgICB8ICAjY2VsbC1vdXRwdXQtdG9vbGJhclxuLy8gIHwgICAgICAgICAgICAgICAgICAgICAgICB8ICAjb3V0cHV0LWVsZW1lbnRcbi8vICB8ICAgICAgICAgICAgICAgICAgICAgICAgfCAgI291dHB1dC1lbGVtZW50XG4vLyAgfCAgICAgICAgICAgICAgICAgICAgICAgIHwgICNvdXRwdXQtZWxlbWVudFxuLy8gIHwgICNvdXRwdXQtaW5uZXItY29udGFpbmVyXG4vLyAgfCAgICAgICAgICAgICAgICAgICAgICAgIHwgICNjZWxsLW91dHB1dC10b29sYmFyXG4vLyAgfCAgICAgICAgICAgICAgICAgICAgICAgIHwgICNvdXRwdXQtZWxlbWVudFxuLy8gIHwgICNvdXRwdXQtaW5uZXItY29udGFpbmVyXG4vLyAgfCAgICAgICAgICAgICAgICAgICAgICAgIHwgICNjZWxsLW91dHB1dC10b29sYmFyXG4vLyAgfCAgICAgICAgICAgICAgICAgICAgICAgIHwgICNvdXRwdXQtZWxlbWVudFxuY2xhc3MgQ2VsbE91dHB1dEVsZW1lbnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSB0b29sYmFyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGlubmVyQ29udGFpbmVyPzogSFRNTEVsZW1lbnQ7XG5cdHJlbmRlcmVkT3V0cHV0Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHJlbmRlclJlc3VsdD86IElJbnNldFJlbmRlck91dHB1dDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgdG9vbGJhckF0dGFjaGVkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0cHJpdmF0ZSB2aWV3Q2VsbDogQ29kZUNlbGxWaWV3TW9kZWwsXG5cdFx0cHJpdmF0ZSBjZWxsT3V0cHV0Q29udGFpbmVyOiBDZWxsT3V0cHV0Q29udGFpbmVyLFxuXHRcdHByaXZhdGUgb3V0cHV0Q29udGFpbmVyOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4sXG5cdFx0cmVhZG9ubHkgb3V0cHV0OiBJQ2VsbE91dHB1dFZpZXdNb2RlbCxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHBhcmVudENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlID0gcGFyZW50Q29udGV4dEtleVNlcnZpY2U7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm91dHB1dC5tb2RlbC5vbkRpZENoYW5nZURhdGEoKCkgPT4ge1xuXHRcdFx0dGhpcy5yZXJlbmRlcigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub3V0cHV0Lm9uRGlkUmVzZXRSZW5kZXJlcigoKSA9PiB7XG5cdFx0XHR0aGlzLnJlcmVuZGVyKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGV0YWNoKCkge1xuXHRcdHRoaXMucmVuZGVyZWRPdXRwdXRDb250YWluZXI/LnJlbW92ZSgpO1xuXG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRpZiAodGhpcy5pbm5lckNvbnRhaW5lcikge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmlubmVyQ29udGFpbmVyLmNoaWxkTm9kZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKCh0aGlzLmlubmVyQ29udGFpbmVyLmNoaWxkTm9kZXNbaV0gYXMgSFRNTEVsZW1lbnQpLmNsYXNzTmFtZSA9PT0gJ3JlbmRlcmVkLW91dHB1dCcpIHtcblx0XHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNvdW50ID4gMSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb3VudCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLmlubmVyQ29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMubm90ZWJvb2tFZGl0b3IucmVtb3ZlSW5zZXQodGhpcy5vdXRwdXQpO1xuXHR9XG5cblx0dXBkYXRlRE9NVG9wKHRvcDogbnVtYmVyKSB7XG5cdFx0aWYgKHRoaXMuaW5uZXJDb250YWluZXIpIHtcblx0XHRcdHRoaXMuaW5uZXJDb250YWluZXIuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0XHR9XG5cdH1cblxuXHRyZXJlbmRlcigpIHtcblx0XHRpZiAoXG5cdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmhhc01vZGVsKCkgJiZcblx0XHRcdHRoaXMuaW5uZXJDb250YWluZXIgJiZcblx0XHRcdHRoaXMucmVuZGVyUmVzdWx0ICYmXG5cdFx0XHR0aGlzLnJlbmRlclJlc3VsdC50eXBlID09PSBSZW5kZXJPdXRwdXRUeXBlLkV4dGVuc2lvblxuXHRcdCkge1xuXHRcdFx0Ly8gT3V0cHV0IHJlbmRlcmVkIGJ5IGV4dGVuc2lvbiByZW5kZXJlciBnb3QgYW4gdXBkYXRlXG5cdFx0XHRjb25zdCBbbWltZVR5cGVzLCBwaWNrXSA9IHRoaXMub3V0cHV0LnJlc29sdmVNaW1lVHlwZXModGhpcy5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWwsIHRoaXMubm90ZWJvb2tFZGl0b3IuYWN0aXZlS2VybmVsPy5wcmVsb2FkUHJvdmlkZXMpO1xuXHRcdFx0Y29uc3QgcGlja2VkTWltZVR5cGUgPSBtaW1lVHlwZXNbcGlja107XG5cdFx0XHRpZiAocGlja2VkTWltZVR5cGUubWltZVR5cGUgPT09IHRoaXMucmVuZGVyUmVzdWx0Lm1pbWVUeXBlICYmIHBpY2tlZE1pbWVUeXBlLnJlbmRlcmVySWQgPT09IHRoaXMucmVuZGVyUmVzdWx0LnJlbmRlcmVyLmlkKSB7XG5cdFx0XHRcdC8vIFNhbWUgbWltZXR5cGUsIHNhbWUgcmVuZGVyZXIsIGNhbGwgdGhlIGV4dGVuc2lvbiByZW5kZXJlciB0byB1cGRhdGVcblx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLnZpZXdDZWxsLm91dHB1dHNWaWV3TW9kZWxzLmluZGV4T2YodGhpcy5vdXRwdXQpO1xuXHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLnVwZGF0ZU91dHB1dCh0aGlzLnZpZXdDZWxsLCB0aGlzLnJlbmRlclJlc3VsdCwgdGhpcy52aWV3Q2VsbC5nZXRPdXRwdXRPZmZzZXQoaW5kZXgpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5pbm5lckNvbnRhaW5lcikge1xuXHRcdFx0Ly8gaW5pdCByZW5kZXJpbmcgZGlkbid0IGhhcHBlblxuXHRcdFx0Y29uc3QgY3Vyck91dHB1dEluZGV4ID0gdGhpcy5jZWxsT3V0cHV0Q29udGFpbmVyLnJlbmRlcmVkT3V0cHV0RW50cmllcy5maW5kSW5kZXgoZW50cnkgPT4gZW50cnkuZWxlbWVudCA9PT0gdGhpcyk7XG5cdFx0XHRjb25zdCBwcmV2aW91c1NpYmxpbmcgPSBjdXJyT3V0cHV0SW5kZXggPiAwICYmICEhKHRoaXMuY2VsbE91dHB1dENvbnRhaW5lci5yZW5kZXJlZE91dHB1dEVudHJpZXNbY3Vyck91dHB1dEluZGV4IC0gMV0uZWxlbWVudC5pbm5lckNvbnRhaW5lcj8ucGFyZW50RWxlbWVudClcblx0XHRcdFx0PyB0aGlzLmNlbGxPdXRwdXRDb250YWluZXIucmVuZGVyZWRPdXRwdXRFbnRyaWVzW2N1cnJPdXRwdXRJbmRleCAtIDFdLmVsZW1lbnQuaW5uZXJDb250YWluZXJcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnJlbmRlcihwcmV2aW91c1NpYmxpbmcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBBbm90aGVyIG1pbWV0eXBlIG9yIHJlbmRlcmVyIGlzIHBpY2tlZCwgd2UgbmVlZCB0byBjbGVhciB0aGUgY3VycmVudCBvdXRwdXQgYW5kIHJlLXJlbmRlclxuXHRcdFx0Y29uc3QgbmV4dEVsZW1lbnQgPSB0aGlzLmlubmVyQ29udGFpbmVyLm5leHRFbGVtZW50U2libGluZztcblx0XHRcdHRoaXMudG9vbGJhckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5pbm5lckNvbnRhaW5lcjtcblx0XHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRcdGVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IucmVtb3ZlSW5zZXQodGhpcy5vdXRwdXQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlbmRlcihuZXh0RWxlbWVudCBhcyBIVE1MRWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVsYXlvdXRDZWxsKCk7XG5cdH1cblxuXHQvLyBpbnNlcnQgYWZ0ZXIgcHJldmlvdXNTaWJsaW5nXG5cdHByaXZhdGUgX2dlbmVyYXRlSW5uZXJPdXRwdXRDb250YWluZXIocHJldmlvdXNTaWJsaW5nOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCwgcGlja2VkTWltZVR5cGVSZW5kZXJlcjogSU9yZGVyZWRNaW1lVHlwZSkge1xuXHRcdHRoaXMuaW5uZXJDb250YWluZXIgPSBET00uJCgnLm91dHB1dC1pbm5lci1jb250YWluZXInKTtcblxuXHRcdGlmIChwcmV2aW91c1NpYmxpbmcgJiYgcHJldmlvdXNTaWJsaW5nLm5leHRFbGVtZW50U2libGluZykge1xuXHRcdFx0dGhpcy5vdXRwdXRDb250YWluZXIuZG9tTm9kZS5pbnNlcnRCZWZvcmUodGhpcy5pbm5lckNvbnRhaW5lciwgcHJldmlvdXNTaWJsaW5nLm5leHRFbGVtZW50U2libGluZyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMub3V0cHV0Q29udGFpbmVyLmRvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5pbm5lckNvbnRhaW5lcik7XG5cdFx0fVxuXG5cdFx0dGhpcy5pbm5lckNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ291dHB1dC1taW1lLXR5cGUnLCBwaWNrZWRNaW1lVHlwZVJlbmRlcmVyLm1pbWVUeXBlKTtcblx0XHRyZXR1cm4gdGhpcy5pbm5lckNvbnRhaW5lcjtcblx0fVxuXG5cdHJlbmRlcihwcmV2aW91c1NpYmxpbmc6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkKTogSVJlbmRlclJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLnZpZXdDZWxsLm91dHB1dHNWaWV3TW9kZWxzLmluZGV4T2YodGhpcy5vdXRwdXQpO1xuXG5cdFx0aWYgKHRoaXMudmlld0NlbGwuaXNPdXRwdXRDb2xsYXBzZWQgfHwgIXRoaXMubm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0dGhpcy5jZWxsT3V0cHV0Q29udGFpbmVyLmZsYWdBc1N0YWxlKCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vdGVib29rVXJpID0gQ2VsbFVyaS5wYXJzZSh0aGlzLnZpZXdDZWxsLnVyaSk/Lm5vdGVib29rO1xuXHRcdGlmICghbm90ZWJvb2tVcmkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm90ZWJvb2tUZXh0TW9kZWwgPSB0aGlzLm5vdGVib29rRWRpdG9yLnRleHRNb2RlbDtcblxuXHRcdGNvbnN0IFttaW1lVHlwZXMsIHBpY2tdID0gdGhpcy5vdXRwdXQucmVzb2x2ZU1pbWVUeXBlcyhub3RlYm9va1RleHRNb2RlbCwgdGhpcy5ub3RlYm9va0VkaXRvci5hY3RpdmVLZXJuZWw/LnByZWxvYWRQcm92aWRlcyk7XG5cdFx0Y29uc3QgY3VycmVudE1pbWVUeXBlID0gbWltZVR5cGVzW3BpY2tdO1xuXHRcdGlmICghbWltZVR5cGVzLmZpbmQobWltZVR5cGUgPT4gbWltZVR5cGUuaXNUcnVzdGVkKSB8fCBtaW1lVHlwZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLnZpZXdDZWxsLnVwZGF0ZU91dHB1dEhlaWdodChpbmRleCwgMCwgJ0NlbGxPdXRwdXRFbGVtZW50I25vTWltZVR5cGUnKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0ZWRQcmVzZW50YXRpb24gPSBtaW1lVHlwZXNbcGlja107XG5cdFx0bGV0IHJlbmRlcmVyID0gdGhpcy5ub3RlYm9va1NlcnZpY2UuZ2V0UmVuZGVyZXJJbmZvKHNlbGVjdGVkUHJlc2VudGF0aW9uLnJlbmRlcmVySWQpO1xuXHRcdGlmICghcmVuZGVyZXIgJiYgc2VsZWN0ZWRQcmVzZW50YXRpb24ubWltZVR5cGUuaW5kZXhPZigndGV4dC8nKSA+IC0xKSB7XG5cdFx0XHRyZW5kZXJlciA9IHRoaXMubm90ZWJvb2tTZXJ2aWNlLmdldFJlbmRlcmVySW5mbygndnNjb2RlLmJ1aWx0aW4tcmVuZGVyZXInKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbm5lckNvbnRhaW5lciA9IHRoaXMuX2dlbmVyYXRlSW5uZXJPdXRwdXRDb250YWluZXIocHJldmlvdXNTaWJsaW5nLCBzZWxlY3RlZFByZXNlbnRhdGlvbik7XG5cdFx0aWYgKGluZGV4ID09PSAwIHx8IHRoaXMub3V0cHV0LnZpc2libGUuZ2V0KCkpIHtcblx0XHRcdHRoaXMuX2F0dGFjaFRvb2xiYXIoaW5uZXJDb250YWluZXIsIG5vdGVib29rVGV4dE1vZGVsLCB0aGlzLm5vdGVib29rRWRpdG9yLmFjdGl2ZUtlcm5lbCwgaW5kZXgsIGN1cnJlbnRNaW1lVHlwZSwgbWltZVR5cGVzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bigocmVhZGVyKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHZpc2libGUgPSByZWFkZXIucmVhZE9ic2VydmFibGUodGhpcy5vdXRwdXQudmlzaWJsZSk7XG5cdFx0XHRcdGlmICh2aXNpYmxlICYmICF0aGlzLnRvb2xiYXJBdHRhY2hlZCkge1xuXHRcdFx0XHRcdHRoaXMuX2F0dGFjaFRvb2xiYXIoaW5uZXJDb250YWluZXIsIG5vdGVib29rVGV4dE1vZGVsLCB0aGlzLm5vdGVib29rRWRpdG9yLmFjdGl2ZUtlcm5lbCwgaW5kZXgsIGN1cnJlbnRNaW1lVHlwZSwgbWltZVR5cGVzKTtcblx0XHRcdFx0fSBlbHNlIGlmICghdmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMudG9vbGJhckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5jZWxsT3V0cHV0Q29udGFpbmVyLmNoZWNrRm9ySGlkZGVuT3V0cHV0cygpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5jZWxsT3V0cHV0Q29udGFpbmVyLmhhc0hpZGRlbk91dHB1dHMuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJlZE91dHB1dENvbnRhaW5lciA9IERPTS5hcHBlbmQoaW5uZXJDb250YWluZXIsIERPTS4kKCcucmVuZGVyZWQtb3V0cHV0JykpO1xuXG5cblx0XHR0aGlzLnJlbmRlclJlc3VsdCA9IHJlbmRlcmVyXG5cdFx0XHQ/IHsgdHlwZTogUmVuZGVyT3V0cHV0VHlwZS5FeHRlbnNpb24sIHJlbmRlcmVyLCBzb3VyY2U6IHRoaXMub3V0cHV0LCBtaW1lVHlwZTogc2VsZWN0ZWRQcmVzZW50YXRpb24ubWltZVR5cGUgfVxuXHRcdFx0OiB0aGlzLl9yZW5kZXJNaXNzaW5nUmVuZGVyZXIodGhpcy5vdXRwdXQsIHNlbGVjdGVkUHJlc2VudGF0aW9uLm1pbWVUeXBlKTtcblxuXHRcdHRoaXMub3V0cHV0LnBpY2tlZE1pbWVUeXBlID0gc2VsZWN0ZWRQcmVzZW50YXRpb247XG5cblx0XHRpZiAoIXRoaXMucmVuZGVyUmVzdWx0KSB7XG5cdFx0XHR0aGlzLnZpZXdDZWxsLnVwZGF0ZU91dHB1dEhlaWdodChpbmRleCwgMCwgJ0NlbGxPdXRwdXRFbGVtZW50I3JlbmRlclJlc3VsdFVuZGVmaW5lZCcpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmNyZWF0ZU91dHB1dCh0aGlzLnZpZXdDZWxsLCB0aGlzLnJlbmRlclJlc3VsdCwgdGhpcy52aWV3Q2VsbC5nZXRPdXRwdXRPZmZzZXQoaW5kZXgpLCBmYWxzZSk7XG5cdFx0aW5uZXJDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYmFja2dyb3VuZCcpO1xuXG5cdFx0cmV0dXJuIHsgaW5pdFJlbmRlcklzU3luY2hyb25vdXM6IGZhbHNlIH07XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJNaXNzaW5nUmVuZGVyZXIodmlld01vZGVsOiBJQ2VsbE91dHB1dFZpZXdNb2RlbCwgcHJlZmVycmVkTWltZVR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElJbnNldFJlbmRlck91dHB1dCB7XG5cdFx0aWYgKCF2aWV3TW9kZWwubW9kZWwub3V0cHV0cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZW5kZXJNZXNzYWdlKHZpZXdNb2RlbCwgbmxzLmxvY2FsaXplKCdlbXB0eScsIFwiQ2VsbCBoYXMgbm8gb3V0cHV0XCIpKTtcblx0XHR9XG5cblx0XHRpZiAoIXByZWZlcnJlZE1pbWVUeXBlKSB7XG5cdFx0XHRjb25zdCBtaW1lVHlwZXMgPSB2aWV3TW9kZWwubW9kZWwub3V0cHV0cy5tYXAob3AgPT4gb3AubWltZSk7XG5cdFx0XHRjb25zdCBtaW1lVHlwZXNNZXNzYWdlID0gbWltZVR5cGVzLmpvaW4oJywgJyk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyTWVzc2FnZSh2aWV3TW9kZWwsIG5scy5sb2NhbGl6ZSgnbm9SZW5kZXJlci4yJywgXCJObyByZW5kZXJlciBjb3VsZCBiZSBmb3VuZCBmb3Igb3V0cHV0LiBJdCBoYXMgdGhlIGZvbGxvd2luZyBtaW1ldHlwZXM6IHswfVwiLCBtaW1lVHlwZXNNZXNzYWdlKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlclNlYXJjaEZvck1pbWV0eXBlKHZpZXdNb2RlbCwgcHJlZmVycmVkTWltZVR5cGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyU2VhcmNoRm9yTWltZXR5cGUodmlld01vZGVsOiBJQ2VsbE91dHB1dFZpZXdNb2RlbCwgbWltZVR5cGU6IHN0cmluZyk6IElJbnNldFJlbmRlck91dHB1dCB7XG5cdFx0Y29uc3QgcXVlcnkgPSBgQHRhZzpub3RlYm9va1JlbmRlcmVyICR7bWltZVR5cGV9YDtcblxuXHRcdGNvbnN0IHAgPSBET00uJCgncCcsIHVuZGVmaW5lZCwgYE5vIHJlbmRlcmVyIGNvdWxkIGJlIGZvdW5kIGZvciBtaW1ldHlwZSBcIiR7bWltZVR5cGV9XCIsIGJ1dCBvbmUgbWlnaHQgYmUgYXZhaWxhYmxlIG9uIHRoZSBNYXJrZXRwbGFjZS5gKTtcblx0XHRjb25zdCBhID0gRE9NLiQoJ2EnLCB7IGhyZWY6IGBjb21tYW5kOndvcmtiZW5jaC5leHRlbnNpb25zLnNlYXJjaD8lMjIke3F1ZXJ5fSUyMmAsIGNsYXNzOiAnbW9uYWNvLWJ1dHRvbiBtb25hY28tdGV4dC1idXR0b24nLCB0YWJpbmRleDogMCwgcm9sZTogJ2J1dHRvbicsIHN0eWxlOiAncGFkZGluZzogOHB4OyB0ZXh0LWRlY29yYXRpb246IG5vbmU7IGNvbG9yOiByZ2IoMjU1LCAyNTUsIDI1NSk7IGJhY2tncm91bmQtY29sb3I6IHJnYigxNCwgOTksIDE1Nik7IG1heC13aWR0aDogMjAwcHg7JyB9LCBgU2VhcmNoIE1hcmtldHBsYWNlYCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogUmVuZGVyT3V0cHV0VHlwZS5IdG1sLFxuXHRcdFx0c291cmNlOiB2aWV3TW9kZWwsXG5cdFx0XHRodG1sQ29udGVudDogcC5vdXRlckhUTUwgKyBhLm91dGVySFRNTFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJNZXNzYWdlKHZpZXdNb2RlbDogSUNlbGxPdXRwdXRWaWV3TW9kZWwsIG1lc3NhZ2U6IHN0cmluZyk6IElJbnNldFJlbmRlck91dHB1dCB7XG5cdFx0Y29uc3QgZWwgPSBET00uJCgncCcsIHVuZGVmaW5lZCwgbWVzc2FnZSk7XG5cdFx0cmV0dXJuIHsgdHlwZTogUmVuZGVyT3V0cHV0VHlwZS5IdG1sLCBzb3VyY2U6IHZpZXdNb2RlbCwgaHRtbENvbnRlbnQ6IGVsLm91dGVySFRNTCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRFbmFibGVDb3B5KG1pbWVUeXBlczogcmVhZG9ubHkgSU9yZGVyZWRNaW1lVHlwZVtdKSB7XG5cdFx0aWYgKCFtaW1lVHlwZXMuZmluZChtaW1lVHlwZSA9PiBURVhUX0JBU0VEX01JTUVUWVBFUy5pbmRleE9mKG1pbWVUeXBlLm1pbWVUeXBlKSB8fCBtaW1lVHlwZS5taW1lVHlwZS5zdGFydHNXaXRoKCdpbWFnZS8nKSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoaXNUZXh0U3RyZWFtTWltZShtaW1lVHlwZXNbMF0ubWltZVR5cGUpKSB7XG5cdFx0XHRjb25zdCBjZWxsVmlld01vZGVsID0gdGhpcy5vdXRwdXQuY2VsbFZpZXdNb2RlbCBhcyBJQ2VsbFZpZXdNb2RlbDtcblx0XHRcdGNvbnN0IGluZGV4ID0gY2VsbFZpZXdNb2RlbC5vdXRwdXRzVmlld01vZGVscy5pbmRleE9mKHRoaXMub3V0cHV0KTtcblx0XHRcdGlmIChpbmRleCA+IDApIHtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXNPdXRwdXQgPSBjZWxsVmlld01vZGVsLm1vZGVsLm91dHB1dHNbaW5kZXggLSAxXTtcblx0XHRcdFx0Ly8gaWYgdGhlIHByZXZpb3VzIG91dHB1dCB3YXMgYWxzbyBhIHN0cmVhbSwgdGhlIGNvcHkgY29tbWFuZCB3aWxsIGJlIGluIHRoYXQgb3V0cHV0IGluc3RlYWRcblx0XHRcdFx0cmV0dXJuICFpc1RleHRTdHJlYW1NaW1lKHByZXZpb3VzT3V0cHV0Lm91dHB1dHNbMF0ubWltZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hdHRhY2hUb29sYmFyKG91dHB1dEl0ZW1EaXY6IEhUTUxFbGVtZW50LCBub3RlYm9va1RleHRNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsIGtlcm5lbDogSU5vdGVib29rS2VybmVsIHwgdW5kZWZpbmVkLCBpbmRleDogbnVtYmVyLCBjdXJyZW50TWltZVR5cGU6IElPcmRlcmVkTWltZVR5cGUsIG1pbWVUeXBlczogcmVhZG9ubHkgSU9yZGVyZWRNaW1lVHlwZVtdKSB7XG5cdFx0Y29uc3QgaGFzTXVsdGlwbGVNaW1lVHlwZXMgPSBtaW1lVHlwZXMuZmlsdGVyKG1pbWVUeXBlID0+IG1pbWVUeXBlLmlzVHJ1c3RlZCkubGVuZ3RoID4gMTtcblx0XHRjb25zdCBpc0NvcHlFbmFibGVkID0gdGhpcy5zaG91bGRFbmFibGVDb3B5KG1pbWVUeXBlcyk7XG5cdFx0aWYgKGluZGV4ID4gMCAmJiAhaGFzTXVsdGlwbGVNaW1lVHlwZXMgJiYgIWlzQ29weUVuYWJsZWQpIHtcblx0XHRcdC8vIG5vdGhpbmcgdG8gcHV0IGluIHRoZSB0b29sYmFyXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLm5vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRvdXRwdXRJdGVtRGl2LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblx0XHRjb25zdCBtaW1lVHlwZVBpY2tlciA9IERPTS4kKCcuY2VsbC1vdXRwdXQtdG9vbGJhcicpO1xuXG5cdFx0b3V0cHV0SXRlbURpdi5hcHBlbmRDaGlsZChtaW1lVHlwZVBpY2tlcik7XG5cblx0XHRjb25zdCB0b29sYmFyID0gdGhpcy50b29sYmFyRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoVG9vbEJhciwgbWltZVR5cGVQaWNrZXIsIHtcblx0XHRcdHJlbmRlckRyb3Bkb3duQXNDaGlsZEVsZW1lbnQ6IGZhbHNlXG5cdFx0fSkpO1xuXHRcdHRvb2xiYXIuY29udGV4dCA9IHtcblx0XHRcdHVpOiB0cnVlLFxuXHRcdFx0Y2VsbDogdGhpcy5vdXRwdXQuY2VsbFZpZXdNb2RlbCBhcyBJQ2VsbFZpZXdNb2RlbCxcblx0XHRcdG91dHB1dFZpZXdNb2RlbDogdGhpcy5vdXRwdXQsXG5cdFx0XHRub3RlYm9va0VkaXRvcjogdGhpcy5ub3RlYm9va0VkaXRvcixcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5Ob3RlYm9va0NlbGxBY3Rpb25Db250ZXh0XG5cdFx0fTtcblxuXHRcdC8vIFRPRE86IFRoaXMgY291bGQgcHJvYmFibHkgYmUgYSByZWFsIHJlZ2lzdGVyZWQgYWN0aW9uLCBidXQgaXQgaGFzIHRvIHRhbGsgdG8gdGhpcyBvdXRwdXQgZWxlbWVudFxuXHRcdGNvbnN0IHBpY2tBY3Rpb24gPSB0aGlzLnRvb2xiYXJEaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbignbm90ZWJvb2sub3V0cHV0LnBpY2tNaW1ldHlwZScsIG5scy5sb2NhbGl6ZSgncGlja01pbWVUeXBlJywgXCJDaGFuZ2UgUHJlc2VudGF0aW9uXCIpLCBUaGVtZUljb24uYXNDbGFzc05hbWUobWltZXR5cGVJY29uKSwgdW5kZWZpbmVkLFxuXHRcdFx0YXN5bmMgX2NvbnRleHQgPT4gdGhpcy5fcGlja0FjdGl2ZU1pbWVUeXBlUmVuZGVyZXIob3V0cHV0SXRlbURpdiwgbm90ZWJvb2tUZXh0TW9kZWwsIGtlcm5lbCwgdGhpcy5vdXRwdXQpKSk7XG5cblx0XHRjb25zdCBtZW51Q29udGV4dEtleVNlcnZpY2UgPSB0aGlzLnRvb2xiYXJEaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQob3V0cHV0SXRlbURpdikpO1xuXHRcdGNvbnN0IGhhc0hpZGRlbk91dHB1dHMgPSBOT1RFQk9PS19DRUxMX0hBU19ISURERU5fT1VUUFVUUy5iaW5kVG8obWVudUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBpc0ZpcnN0Q2VsbE91dHB1dCA9IE5PVEVCT09LX0NFTExfSVNfRklSU1RfT1VUUFVULmJpbmRUbyhtZW51Q29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGNlbGxPdXRwdXRNaW1ldHlwZSA9IE5PVEVCT09LX0NFTExfT1VUUFVUX01JTUVUWVBFLmJpbmRUbyhtZW51Q29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlzRmlyc3RDZWxsT3V0cHV0LnNldChpbmRleCA9PT0gMCk7XG5cdFx0Y2VsbE91dHB1dE1pbWV0eXBlLnNldChjdXJyZW50TWltZVR5cGUubWltZVR5cGUpO1xuXHRcdHRoaXMudG9vbGJhckRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKChyKSA9PiB7IGhhc0hpZGRlbk91dHB1dHMuc2V0KHRoaXMuY2VsbE91dHB1dENvbnRhaW5lci5oYXNIaWRkZW5PdXRwdXRzLnJlYWQocikpOyB9KSk7XG5cdFx0Y29uc3QgbWVudSA9IHRoaXMudG9vbGJhckRpc3Bvc2FibGVzLmFkZCh0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLk5vdGVib29rT3V0cHV0VG9vbGJhciwgbWVudUNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCB1cGRhdGVNZW51VG9vbGJhciA9ICgpID0+IHtcblx0XHRcdGxldCB7IHNlY29uZGFyeSB9ID0gZ2V0QWN0aW9uQmFyQWN0aW9ucyhtZW51IS5nZXRBY3Rpb25zKHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSksICgpID0+IGZhbHNlKTtcblx0XHRcdGlmICghaXNDb3B5RW5hYmxlZCkge1xuXHRcdFx0XHRzZWNvbmRhcnkgPSBzZWNvbmRhcnkuZmlsdGVyKChhY3Rpb24pID0+IGFjdGlvbi5pZCAhPT0gQ09QWV9PVVRQVVRfQ09NTUFORF9JRCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaGFzTXVsdGlwbGVNaW1lVHlwZXMpIHtcblx0XHRcdFx0c2Vjb25kYXJ5ID0gW3BpY2tBY3Rpb24sIC4uLnNlY29uZGFyeV07XG5cdFx0XHR9XG5cblx0XHRcdHRvb2xiYXIuc2V0QWN0aW9ucyhbXSwgc2Vjb25kYXJ5KTtcblx0XHR9O1xuXHRcdHVwZGF0ZU1lbnVUb29sYmFyKCk7XG5cdFx0dGhpcy50b29sYmFyRGlzcG9zYWJsZXMuYWRkKG1lbnUub25EaWRDaGFuZ2UodXBkYXRlTWVudVRvb2xiYXIpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3BpY2tBY3RpdmVNaW1lVHlwZVJlbmRlcmVyKG91dHB1dEl0ZW1EaXY6IEhUTUxFbGVtZW50LCBub3RlYm9va1RleHRNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsIGtlcm5lbDogSU5vdGVib29rS2VybmVsIHwgdW5kZWZpbmVkLCB2aWV3TW9kZWw6IElDZWxsT3V0cHV0Vmlld01vZGVsKSB7XG5cdFx0Y29uc3QgW21pbWVUeXBlcywgY3VyckluZGV4XSA9IHZpZXdNb2RlbC5yZXNvbHZlTWltZVR5cGVzKG5vdGVib29rVGV4dE1vZGVsLCBrZXJuZWw/LnByZWxvYWRQcm92aWRlcyk7XG5cblx0XHRjb25zdCBpdGVtczogSU1pbWVUeXBlUmVuZGVyZXJbXSA9IFtdO1xuXHRcdGNvbnN0IHVuc3VwcG9ydGVkSXRlbXM6IElNaW1lVHlwZVJlbmRlcmVyW10gPSBbXTtcblx0XHRtaW1lVHlwZXMuZm9yRWFjaCgobWltZVR5cGUsIGluZGV4KSA9PiB7XG5cdFx0XHRpZiAobWltZVR5cGUuaXNUcnVzdGVkKSB7XG5cdFx0XHRcdGNvbnN0IGFyciA9IG1pbWVUeXBlLnJlbmRlcmVySWQgPT09IFJFTkRFUkVSX05PVF9BVkFJTEFCTEUgP1xuXHRcdFx0XHRcdHVuc3VwcG9ydGVkSXRlbXMgOlxuXHRcdFx0XHRcdGl0ZW1zO1xuXHRcdFx0XHRhcnIucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IG1pbWVUeXBlLm1pbWVUeXBlLFxuXHRcdFx0XHRcdGlkOiBtaW1lVHlwZS5taW1lVHlwZSxcblx0XHRcdFx0XHRpbmRleDogaW5kZXgsXG5cdFx0XHRcdFx0cGlja2VkOiBpbmRleCA9PT0gY3VyckluZGV4LFxuXHRcdFx0XHRcdGRldGFpbDogdGhpcy5fZ2VuZXJhdGVSZW5kZXJlckluZm8obWltZVR5cGUucmVuZGVyZXJJZCksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGluZGV4ID09PSBjdXJySW5kZXggPyBubHMubG9jYWxpemUoJ2N1cnJ1ZW50QWN0aXZlTWltZVR5cGUnLCBcIkN1cnJlbnRseSBBY3RpdmVcIikgOiB1bmRlZmluZWRcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAodW5zdXBwb3J0ZWRJdGVtcy5zb21lKG0gPT4gSlVQWVRFUl9SRU5ERVJFUl9NSU1FVFlQRVMuaW5jbHVkZXMobS5pZCEpKSkge1xuXHRcdFx0dW5zdXBwb3J0ZWRJdGVtcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnaW5zdGFsbEp1cHl0ZXJQcm9tcHQnLCBcIkluc3RhbGwgYWRkaXRpb25hbCByZW5kZXJlcnMgZnJvbSB0aGUgbWFya2V0cGxhY2VcIiksXG5cdFx0XHRcdGlkOiAnaW5zdGFsbFJlbmRlcmVycycsXG5cdFx0XHRcdGluZGV4OiBtaW1lVHlwZXMubGVuZ3RoXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwaWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2soeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pKTtcblx0XHRwaWNrZXIuaXRlbXMgPSBbXG5cdFx0XHQuLi5pdGVtcyxcblx0XHRcdHsgdHlwZTogJ3NlcGFyYXRvcicgfSxcblx0XHRcdC4uLnVuc3VwcG9ydGVkSXRlbXNcblx0XHRdO1xuXHRcdHBpY2tlci5hY3RpdmVJdGVtcyA9IGl0ZW1zLmZpbHRlcihpdGVtID0+ICEhaXRlbS5waWNrZWQpO1xuXHRcdHBpY2tlci5wbGFjZWhvbGRlciA9IGl0ZW1zLmxlbmd0aCAhPT0gbWltZVR5cGVzLmxlbmd0aFxuXHRcdFx0PyBubHMubG9jYWxpemUoJ3Byb21wdENob29zZU1pbWVUeXBlSW5TZWN1cmUucGxhY2VIb2xkZXInLCBcIlNlbGVjdCBtaW1ldHlwZSB0byByZW5kZXIgZm9yIGN1cnJlbnQgb3V0cHV0XCIpXG5cdFx0XHQ6IG5scy5sb2NhbGl6ZSgncHJvbXB0Q2hvb3NlTWltZVR5cGUucGxhY2VIb2xkZXInLCBcIlNlbGVjdCBtaW1ldHlwZSB0byByZW5kZXIgZm9yIGN1cnJlbnQgb3V0cHV0XCIpO1xuXG5cdFx0Y29uc3QgcGljayA9IGF3YWl0IG5ldyBQcm9taXNlPElNaW1lVHlwZVJlbmRlcmVyIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHBpY2tlci5zZWxlY3RlZEl0ZW1zLmxlbmd0aCA9PT0gMSA/IChwaWNrZXIuc2VsZWN0ZWRJdGVtc1swXSBhcyBJTWltZVR5cGVSZW5kZXJlcikgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRwaWNrZXIuc2hvdygpO1xuXHRcdH0pO1xuXG5cdFx0aWYgKHBpY2sgPT09IHVuZGVmaW5lZCB8fCBwaWNrLmluZGV4ID09PSBjdXJySW5kZXgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocGljay5pZCA9PT0gJ2luc3RhbGxSZW5kZXJlcnMnKSB7XG5cdFx0XHR0aGlzLl9zaG93SnVweXRlckV4dGVuc2lvbigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHVzZXIgY2hvb3NlcyBhbm90aGVyIG1pbWV0eXBlXG5cdFx0Y29uc3QgbmV4dEVsZW1lbnQgPSBvdXRwdXRJdGVtRGl2Lm5leHRFbGVtZW50U2libGluZztcblx0XHR0aGlzLnRvb2xiYXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLmlubmVyQ29udGFpbmVyO1xuXHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRlbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5yZW1vdmVJbnNldCh2aWV3TW9kZWwpO1xuXHRcdH1cblxuXHRcdHZpZXdNb2RlbC5waWNrZWRNaW1lVHlwZSA9IG1pbWVUeXBlc1twaWNrLmluZGV4XTtcblx0XHR0aGlzLnZpZXdDZWxsLnVwZGF0ZU91dHB1dE1pbkhlaWdodCh0aGlzLnZpZXdDZWxsLmxheW91dEluZm8ub3V0cHV0VG90YWxIZWlnaHQpO1xuXG5cdFx0Y29uc3QgeyBtaW1lVHlwZSwgcmVuZGVyZXJJZCB9ID0gbWltZVR5cGVzW3BpY2suaW5kZXhdO1xuXHRcdHRoaXMubm90ZWJvb2tTZXJ2aWNlLnVwZGF0ZU1pbWVQcmVmZXJyZWRSZW5kZXJlcihub3RlYm9va1RleHRNb2RlbC52aWV3VHlwZSwgbWltZVR5cGUsIHJlbmRlcmVySWQsIG1pbWVUeXBlcy5tYXAobSA9PiBtLm1pbWVUeXBlKSk7XG5cdFx0dGhpcy5yZW5kZXIobmV4dEVsZW1lbnQgYXMgSFRNTEVsZW1lbnQpO1xuXHRcdHRoaXMuX3ZhbGlkYXRlRmluYWxPdXRwdXRIZWlnaHQoZmFsc2UpO1xuXHRcdHRoaXMuX3JlbGF5b3V0Q2VsbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2hvd0p1cHl0ZXJFeHRlbnNpb24oKSB7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGBAaWQ6JHtKVVBZVEVSX0VYVEVOU0lPTl9JRH1gKTtcblx0fVxuXG5cdHByaXZhdGUgX2dlbmVyYXRlUmVuZGVyZXJJbmZvKHJlbmRlcklkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHJlbmRlckluZm8gPSB0aGlzLm5vdGVib29rU2VydmljZS5nZXRSZW5kZXJlckluZm8ocmVuZGVySWQpO1xuXG5cdFx0aWYgKHJlbmRlckluZm8pIHtcblx0XHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gcmVuZGVySW5mby5kaXNwbGF5TmFtZSAhPT0gJycgPyByZW5kZXJJbmZvLmRpc3BsYXlOYW1lIDogcmVuZGVySW5mby5pZDtcblx0XHRcdHJldHVybiBgJHtkaXNwbGF5TmFtZX0gKCR7cmVuZGVySW5mby5leHRlbnNpb25JZC52YWx1ZX0pYDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCd1bmF2YWlsYWJsZVJlbmRlckluZm8nLCBcInJlbmRlcmVyIG5vdCBhdmFpbGFibGVcIik7XG5cdH1cblxuXHRwcml2YXRlIF9vdXRwdXRIZWlnaHRUaW1lcjogVGltZW91dCB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgX3ZhbGlkYXRlRmluYWxPdXRwdXRIZWlnaHQoc3luY2hyb25vdXM6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5fb3V0cHV0SGVpZ2h0VGltZXIgIT09IG51bGwpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9vdXRwdXRIZWlnaHRUaW1lcik7XG5cdFx0fVxuXG5cdFx0aWYgKHN5bmNocm9ub3VzKSB7XG5cdFx0XHR0aGlzLnZpZXdDZWxsLnVubG9ja091dHB1dEhlaWdodCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vdXRwdXRIZWlnaHRUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnZpZXdDZWxsLnVubG9ja091dHB1dEhlaWdodCgpO1xuXHRcdFx0fSwgMTAwMCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVsYXlvdXRDZWxsKCkge1xuXHRcdHRoaXMubm90ZWJvb2tFZGl0b3IubGF5b3V0Tm90ZWJvb2tDZWxsKHRoaXMudmlld0NlbGwsIHRoaXMudmlld0NlbGwubGF5b3V0SW5mby50b3RhbEhlaWdodCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdGlmICh0aGlzLl9vdXRwdXRIZWlnaHRUaW1lcikge1xuXHRcdFx0dGhpcy52aWV3Q2VsbC51bmxvY2tPdXRwdXRIZWlnaHQoKTtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9vdXRwdXRIZWlnaHRUaW1lcik7XG5cdFx0fVxuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIE91dHB1dEVudHJ5Vmlld0hhbmRsZXIge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBtb2RlbDogSUNlbGxPdXRwdXRWaWV3TW9kZWwsXG5cdFx0cmVhZG9ubHkgZWxlbWVudDogQ2VsbE91dHB1dEVsZW1lbnRcblx0KSB7XG5cblx0fVxufVxuXG5jb25zdCBlbnVtIENlbGxPdXRwdXRVcGRhdGVDb250ZXh0IHtcblx0RXhlY3V0aW9uID0gMSxcblx0T3RoZXIgPSAyXG59XG5cbmV4cG9ydCBjbGFzcyBDZWxsT3V0cHV0Q29udGFpbmVyIGV4dGVuZHMgQ2VsbENvbnRlbnRQYXJ0IHtcblx0cHJpdmF0ZSBfb3V0cHV0RW50cmllczogT3V0cHV0RW50cnlWaWV3SGFuZGxlcltdID0gW107XG5cdHByaXZhdGUgX2hhc1N0YWxlT3V0cHV0czogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGhhc0hpZGRlbk91dHB1dHMgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ2hhc0hpZGRlbk91dHB1dHMnLCBmYWxzZSk7XG5cdGNoZWNrRm9ySGlkZGVuT3V0cHV0cygpIHtcblx0XHRpZiAodGhpcy5fb3V0cHV0RW50cmllcy5maW5kKGVudHJ5ID0+IHsgcmV0dXJuICFlbnRyeS5tb2RlbC52aXNpYmxlLmdldCgpOyB9KSkge1xuXHRcdFx0dGhpcy5oYXNIaWRkZW5PdXRwdXRzLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmhhc0hpZGRlbk91dHB1dHMuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdGdldCByZW5kZXJlZE91dHB1dEVudHJpZXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX291dHB1dEVudHJpZXM7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSxcblx0XHRwcml2YXRlIHZpZXdDZWxsOiBDb2RlQ2VsbFZpZXdNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRlbXBsYXRlRGF0YTogQ29kZUNlbGxSZW5kZXJUZW1wbGF0ZSxcblx0XHRwcml2YXRlIG9wdGlvbnM6IHsgbGltaXQ6IG51bWJlciB9LFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodmlld0NlbGwub25EaWRTdGFydEV4ZWN1dGlvbigoKSA9PiB7XG5cdFx0XHR2aWV3Q2VsbC51cGRhdGVPdXRwdXRNaW5IZWlnaHQodmlld0NlbGwubGF5b3V0SW5mby5vdXRwdXRUb3RhbEhlaWdodCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodmlld0NlbGwub25EaWRTdG9wRXhlY3V0aW9uKCgpID0+IHtcblx0XHRcdHRoaXMuX3ZhbGlkYXRlRmluYWxPdXRwdXRIZWlnaHQoZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHZpZXdDZWxsLm9uRGlkQ2hhbmdlT3V0cHV0cyhzcGxpY2UgPT4ge1xuXHRcdFx0Y29uc3QgZXhlY3V0aW9uU3RhdGUgPSB0aGlzLl9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5nZXRDZWxsRXhlY3V0aW9uKHZpZXdDZWxsLnVyaSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gZXhlY3V0aW9uU3RhdGUgPyBDZWxsT3V0cHV0VXBkYXRlQ29udGV4dC5FeGVjdXRpb24gOiBDZWxsT3V0cHV0VXBkYXRlQ29udGV4dC5PdGhlcjtcblx0XHRcdHRoaXMuX3VwZGF0ZU91dHB1dHMoc3BsaWNlLCBjb250ZXh0KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih2aWV3Q2VsbC5vbkRpZENoYW5nZUxheW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZUludGVybmFsTGF5b3V0Tm93KHZpZXdDZWxsKTtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVJbnRlcm5hbExheW91dE5vdyh2aWV3Q2VsbDogQ29kZUNlbGxWaWV3TW9kZWwpIHtcblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRDb250YWluZXIuc2V0VG9wKHZpZXdDZWxsLmxheW91dEluZm8ub3V0cHV0Q29udGFpbmVyT2Zmc2V0KTtcblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRTaG93TW9yZUNvbnRhaW5lci5zZXRUb3Aodmlld0NlbGwubGF5b3V0SW5mby5vdXRwdXRTaG93TW9yZUNvbnRhaW5lck9mZnNldCk7XG5cblx0XHR0aGlzLl9vdXRwdXRFbnRyaWVzLmZvckVhY2goZW50cnkgPT4ge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLnZpZXdDZWxsLm91dHB1dHNWaWV3TW9kZWxzLmluZGV4T2YoZW50cnkubW9kZWwpO1xuXHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0Y29uc3QgdG9wID0gdGhpcy52aWV3Q2VsbC5nZXRPdXRwdXRPZmZzZXRJbkNvbnRhaW5lcihpbmRleCk7XG5cdFx0XHRcdGVudHJ5LmVsZW1lbnQudXBkYXRlRE9NVG9wKHRvcCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRyZW5kZXIoKSB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2RvUmVuZGVyKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdC8vIFRPRE9AcmVib3JuaXgsIHRoaXMgaXMgcHJvYmFibHkgbm90IG5lY2Vzc2FyeSBhdCBhbGwgYXMgY2VsbCBsYXlvdXQgY2hhbmdlIHdvdWxkIHNlbmQgdGhlIHVwZGF0ZSByZXF1ZXN0LlxuXHRcdFx0dGhpcy5fcmVsYXlvdXRDZWxsKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE5vdGlmeSB0aGF0IGFuIG91dHB1dCBtYXkgaGF2ZSBiZWVuIHN3YXBwZWQgb3V0IHdpdGhvdXQgdGhlIG1vZGVsIGdldHRpbmcgcmVuZGVyZWQuXG5cdCAqL1xuXHRmbGFnQXNTdGFsZSgpIHtcblx0XHR0aGlzLl9oYXNTdGFsZU91dHB1dHMgPSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9SZW5kZXIoKSB7XG5cdFx0aWYgKHRoaXMudmlld0NlbGwub3V0cHV0c1ZpZXdNb2RlbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5vdXRwdXRUb3RhbEhlaWdodCAhPT0gMCkge1xuXHRcdFx0XHR0aGlzLnZpZXdDZWxsLnVwZGF0ZU91dHB1dE1pbkhlaWdodCh0aGlzLnZpZXdDZWxsLmxheW91dEluZm8ub3V0cHV0VG90YWxIZWlnaHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRET00uc2hvdyh0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRDb250YWluZXIuZG9tTm9kZSk7XG5cdFx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgTWF0aC5taW4odGhpcy5vcHRpb25zLmxpbWl0LCB0aGlzLnZpZXdDZWxsLm91dHB1dHNWaWV3TW9kZWxzLmxlbmd0aCk7IGluZGV4KyspIHtcblx0XHRcdFx0Y29uc3QgY3Vyck91dHB1dCA9IHRoaXMudmlld0NlbGwub3V0cHV0c1ZpZXdNb2RlbHNbaW5kZXhdO1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2VsbE91dHB1dEVsZW1lbnQsIHRoaXMubm90ZWJvb2tFZGl0b3IsIHRoaXMudmlld0NlbGwsIHRoaXMsIHRoaXMudGVtcGxhdGVEYXRhLm91dHB1dENvbnRhaW5lciwgY3Vyck91dHB1dCk7XG5cdFx0XHRcdHRoaXMuX291dHB1dEVudHJpZXMucHVzaChuZXcgT3V0cHV0RW50cnlWaWV3SGFuZGxlcihjdXJyT3V0cHV0LCBlbnRyeSkpO1xuXHRcdFx0XHRlbnRyeS5yZW5kZXIodW5kZWZpbmVkKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMudmlld0NlbGwub3V0cHV0c1ZpZXdNb2RlbHMubGVuZ3RoID4gdGhpcy5vcHRpb25zLmxpbWl0KSB7XG5cdFx0XHRcdERPTS5zaG93KHRoaXMudGVtcGxhdGVEYXRhLm91dHB1dFNob3dNb3JlQ29udGFpbmVyLmRvbU5vZGUpO1xuXHRcdFx0XHR0aGlzLnZpZXdDZWxsLnVwZGF0ZU91dHB1dFNob3dNb3JlQ29udGFpbmVySGVpZ2h0KDQ2KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fdmFsaWRhdGVGaW5hbE91dHB1dEhlaWdodChmYWxzZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIG5vb3Bcblx0XHRcdERPTS5oaWRlKHRoaXMudGVtcGxhdGVEYXRhLm91dHB1dENvbnRhaW5lci5kb21Ob2RlKTtcblx0XHR9XG5cblx0XHR0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRTaG93TW9yZUNvbnRhaW5lci5kb21Ob2RlLmlubmVyVGV4dCA9ICcnO1xuXHRcdGlmICh0aGlzLnZpZXdDZWxsLm91dHB1dHNWaWV3TW9kZWxzLmxlbmd0aCA+IHRoaXMub3B0aW9ucy5saW1pdCkge1xuXHRcdFx0dGhpcy50ZW1wbGF0ZURhdGEub3V0cHV0U2hvd01vcmVDb250YWluZXIuZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9nZW5lcmF0ZVNob3dNb3JlRWxlbWVudCh0aGlzLnRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdERPTS5oaWRlKHRoaXMudGVtcGxhdGVEYXRhLm91dHB1dFNob3dNb3JlQ29udGFpbmVyLmRvbU5vZGUpO1xuXHRcdFx0dGhpcy52aWV3Q2VsbC51cGRhdGVPdXRwdXRTaG93TW9yZUNvbnRhaW5lckhlaWdodCgwKTtcblx0XHR9XG5cdH1cblxuXHR2aWV3VXBkYXRlU2hvd091dHB1dHMoaW5pdFJlbmRlcmluZzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9oYXNTdGFsZU91dHB1dHMpIHtcblx0XHRcdHRoaXMuX2hhc1N0YWxlT3V0cHV0cyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fb3V0cHV0RW50cmllcy5mb3JFYWNoKGVudHJ5ID0+IHtcblx0XHRcdFx0ZW50cnkuZWxlbWVudC5yZXJlbmRlcigpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHRoaXMuX291dHB1dEVudHJpZXMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCB2aWV3SGFuZGxlciA9IHRoaXMuX291dHB1dEVudHJpZXNbaW5kZXhdO1xuXHRcdFx0Y29uc3Qgb3V0cHV0RW50cnkgPSB2aWV3SGFuZGxlci5lbGVtZW50O1xuXHRcdFx0aWYgKG91dHB1dEVudHJ5LnJlbmRlclJlc3VsdCkge1xuXHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmNyZWF0ZU91dHB1dCh0aGlzLnZpZXdDZWxsLCBvdXRwdXRFbnRyeS5yZW5kZXJSZXN1bHQgYXMgSUluc2V0UmVuZGVyT3V0cHV0LCB0aGlzLnZpZXdDZWxsLmdldE91dHB1dE9mZnNldChpbmRleCksIGZhbHNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dHB1dEVudHJ5LnJlbmRlcih1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3JlbGF5b3V0Q2VsbCgpO1xuXHR9XG5cblx0dmlld1VwZGF0ZUhpZGVPdXB1dHMoKTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHRoaXMuX291dHB1dEVudHJpZXMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmhpZGVJbnNldCh0aGlzLl9vdXRwdXRFbnRyaWVzW2luZGV4XS5tb2RlbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb3V0cHV0SGVpZ2h0VGltZXI6IFRpbWVvdXQgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIF92YWxpZGF0ZUZpbmFsT3V0cHV0SGVpZ2h0KHN5bmNocm9ub3VzOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX291dHB1dEhlaWdodFRpbWVyICE9PSBudWxsKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fb3V0cHV0SGVpZ2h0VGltZXIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4ZWN1dGlvblN0YXRlID0gdGhpcy5fbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuZ2V0Q2VsbEV4ZWN1dGlvbih0aGlzLnZpZXdDZWxsLnVyaSk7XG5cblx0XHRpZiAoc3luY2hyb25vdXMpIHtcblx0XHRcdHRoaXMudmlld0NlbGwudW5sb2NrT3V0cHV0SGVpZ2h0KCk7XG5cdFx0fSBlbHNlIGlmIChleGVjdXRpb25TdGF0ZT8uc3RhdGUgIT09IE5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlLkV4ZWN1dGluZykge1xuXHRcdFx0dGhpcy5fb3V0cHV0SGVpZ2h0VGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy52aWV3Q2VsbC51bmxvY2tPdXRwdXRIZWlnaHQoKTtcblx0XHRcdH0sIDIwMCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlT3V0cHV0cyhzcGxpY2U6IE5vdGVib29rQ2VsbE91dHB1dHNTcGxpY2UsIGNvbnRleHQ6IENlbGxPdXRwdXRVcGRhdGVDb250ZXh0ID0gQ2VsbE91dHB1dFVwZGF0ZUNvbnRleHQuT3RoZXIpIHtcblx0XHRjb25zdCBwcmV2aW91c091dHB1dEhlaWdodCA9IHRoaXMudmlld0NlbGwubGF5b3V0SW5mby5vdXRwdXRUb3RhbEhlaWdodDtcblxuXHRcdC8vIGZvciBjZWxsIG91dHB1dCB1cGRhdGUsIHdlIG1ha2Ugc3VyZSB0aGUgY2VsbCBkb2VzIG5vdCBzaHJpbmsgYmVmb3JlIHRoZSBuZXcgb3V0cHV0cyBhcmUgcmVuZGVyZWQuXG5cdFx0dGhpcy52aWV3Q2VsbC51cGRhdGVPdXRwdXRNaW5IZWlnaHQocHJldmlvdXNPdXRwdXRIZWlnaHQpO1xuXG5cdFx0aWYgKHRoaXMudmlld0NlbGwub3V0cHV0c1ZpZXdNb2RlbHMubGVuZ3RoKSB7XG5cdFx0XHRET00uc2hvdyh0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRDb250YWluZXIuZG9tTm9kZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdERPTS5oaWRlKHRoaXMudGVtcGxhdGVEYXRhLm91dHB1dENvbnRhaW5lci5kb21Ob2RlKTtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdDZWxsLnNwbGljZU91dHB1dEhlaWdodHMoc3BsaWNlLnN0YXJ0LCBzcGxpY2UuZGVsZXRlQ291bnQsIHNwbGljZS5uZXdPdXRwdXRzLm1hcChfID0+IDApKTtcblx0XHR0aGlzLl9yZW5kZXJOb3coc3BsaWNlLCBjb250ZXh0KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlck5vdyhzcGxpY2U6IE5vdGVib29rQ2VsbE91dHB1dHNTcGxpY2UsIGNvbnRleHQ6IENlbGxPdXRwdXRVcGRhdGVDb250ZXh0KSB7XG5cdFx0aWYgKHNwbGljZS5zdGFydCA+PSB0aGlzLm9wdGlvbnMubGltaXQpIHtcblx0XHRcdC8vIHNwbGljZSBpdGVtcyBvdXQgb2YgbGltaXRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaXJzdEdyb3VwRW50cmllcyA9IHRoaXMuX291dHB1dEVudHJpZXMuc2xpY2UoMCwgc3BsaWNlLnN0YXJ0KTtcblx0XHRjb25zdCBkZWxldGVkRW50cmllcyA9IHRoaXMuX291dHB1dEVudHJpZXMuc2xpY2Uoc3BsaWNlLnN0YXJ0LCBzcGxpY2Uuc3RhcnQgKyBzcGxpY2UuZGVsZXRlQ291bnQpO1xuXHRcdGNvbnN0IHNlY29uZEdyb3VwRW50cmllcyA9IHRoaXMuX291dHB1dEVudHJpZXMuc2xpY2Uoc3BsaWNlLnN0YXJ0ICsgc3BsaWNlLmRlbGV0ZUNvdW50KTtcblx0XHRsZXQgbmV3bHlJbnNlcnRlZCA9IHRoaXMudmlld0NlbGwub3V0cHV0c1ZpZXdNb2RlbHMuc2xpY2Uoc3BsaWNlLnN0YXJ0LCBzcGxpY2Uuc3RhcnQgKyBzcGxpY2UubmV3T3V0cHV0cy5sZW5ndGgpO1xuXG5cdFx0Ly8gWy4uLmZpcnN0R3JvdXAsIC4uLmRlbGV0ZWRFbnRyaWVzLCAuLi5zZWNvbmRHcm91cEVudHJpZXNdICBbLi4ucmVzdEluTW9kZWxdXG5cdFx0Ly8gWy4uLmZpcnN0R3JvdXAsIC4uLm5ld2x5SW5zZXJ0ZWQsIC4uLnNlY29uZEdyb3VwRW50cmllcywgcmVzdEluTW9kZWxdXG5cdFx0aWYgKGZpcnN0R3JvdXBFbnRyaWVzLmxlbmd0aCArIG5ld2x5SW5zZXJ0ZWQubGVuZ3RoICsgc2Vjb25kR3JvdXBFbnRyaWVzLmxlbmd0aCA+IHRoaXMub3B0aW9ucy5saW1pdCkge1xuXHRcdFx0Ly8gZXhjZWVkcyBsaW1pdCBhZ2FpblxuXHRcdFx0aWYgKGZpcnN0R3JvdXBFbnRyaWVzLmxlbmd0aCArIG5ld2x5SW5zZXJ0ZWQubGVuZ3RoID4gdGhpcy5vcHRpb25zLmxpbWl0KSB7XG5cdFx0XHRcdFsuLi5kZWxldGVkRW50cmllcywgLi4uc2Vjb25kR3JvdXBFbnRyaWVzXS5mb3JFYWNoKGVudHJ5ID0+IHtcblx0XHRcdFx0XHRlbnRyeS5lbGVtZW50LmRldGFjaCgpO1xuXHRcdFx0XHRcdGVudHJ5LmVsZW1lbnQuZGlzcG9zZSgpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRuZXdseUluc2VydGVkID0gbmV3bHlJbnNlcnRlZC5zbGljZSgwLCB0aGlzLm9wdGlvbnMubGltaXQgLSBmaXJzdEdyb3VwRW50cmllcy5sZW5ndGgpO1xuXHRcdFx0XHRjb25zdCBuZXdseUluc2VydGVkRW50cmllcyA9IG5ld2x5SW5zZXJ0ZWQubWFwKGluc2VydCA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBPdXRwdXRFbnRyeVZpZXdIYW5kbGVyKGluc2VydCwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsT3V0cHV0RWxlbWVudCwgdGhpcy5ub3RlYm9va0VkaXRvciwgdGhpcy52aWV3Q2VsbCwgdGhpcywgdGhpcy50ZW1wbGF0ZURhdGEub3V0cHV0Q29udGFpbmVyLCBpbnNlcnQpKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGhpcy5fb3V0cHV0RW50cmllcyA9IFsuLi5maXJzdEdyb3VwRW50cmllcywgLi4ubmV3bHlJbnNlcnRlZEVudHJpZXNdO1xuXG5cdFx0XHRcdC8vIHJlbmRlciBuZXdseSBpbnNlcnRlZCBvdXRwdXRzXG5cdFx0XHRcdGZvciAobGV0IGkgPSBmaXJzdEdyb3VwRW50cmllcy5sZW5ndGg7IGkgPCB0aGlzLl9vdXRwdXRFbnRyaWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0dGhpcy5fb3V0cHV0RW50cmllc1tpXS5lbGVtZW50LnJlbmRlcih1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBwYXJ0IG9mIHNlY29uZEdyb3VwRW50cmllcyBhcmUgcHVzaGVkIG91dCBvZiB2aWV3XG5cdFx0XHRcdC8vIG5vdyB3ZSBoYXZlIHRvIGJlIGNyZWF0aXZlIGFzIHNlY29uZEdyb3VwRW50cmllcyBtaWdodCBub3QgdXNlIGRlZGljYXRlZCBjb250YWluZXJzXG5cdFx0XHRcdGNvbnN0IGVsZW1lbnRzUHVzaGVkT3V0T2ZWaWV3ID0gc2Vjb25kR3JvdXBFbnRyaWVzLnNsaWNlKHRoaXMub3B0aW9ucy5saW1pdCAtIGZpcnN0R3JvdXBFbnRyaWVzLmxlbmd0aCAtIG5ld2x5SW5zZXJ0ZWQubGVuZ3RoKTtcblx0XHRcdFx0Wy4uLmRlbGV0ZWRFbnRyaWVzLCAuLi5lbGVtZW50c1B1c2hlZE91dE9mVmlld10uZm9yRWFjaChlbnRyeSA9PiB7XG5cdFx0XHRcdFx0ZW50cnkuZWxlbWVudC5kZXRhY2goKTtcblx0XHRcdFx0XHRlbnRyeS5lbGVtZW50LmRpc3Bvc2UoKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gZXhjbHVzaXZlXG5cdFx0XHRcdGNvbnN0IHJlUmVuZGVyUmlnaHRCb3VuZGFyeSA9IGZpcnN0R3JvdXBFbnRyaWVzLmxlbmd0aCArIG5ld2x5SW5zZXJ0ZWQubGVuZ3RoO1xuXG5cdFx0XHRcdGNvbnN0IG5ld2x5SW5zZXJ0ZWRFbnRyaWVzID0gbmV3bHlJbnNlcnRlZC5tYXAoaW5zZXJ0ID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IE91dHB1dEVudHJ5Vmlld0hhbmRsZXIoaW5zZXJ0LCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENlbGxPdXRwdXRFbGVtZW50LCB0aGlzLm5vdGVib29rRWRpdG9yLCB0aGlzLnZpZXdDZWxsLCB0aGlzLCB0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRDb250YWluZXIsIGluc2VydCkpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0aGlzLl9vdXRwdXRFbnRyaWVzID0gWy4uLmZpcnN0R3JvdXBFbnRyaWVzLCAuLi5uZXdseUluc2VydGVkRW50cmllcywgLi4uc2Vjb25kR3JvdXBFbnRyaWVzLnNsaWNlKDAsIHRoaXMub3B0aW9ucy5saW1pdCAtIGZpcnN0R3JvdXBFbnRyaWVzLmxlbmd0aCAtIG5ld2x5SW5zZXJ0ZWQubGVuZ3RoKV07XG5cblx0XHRcdFx0Zm9yIChsZXQgaSA9IGZpcnN0R3JvdXBFbnRyaWVzLmxlbmd0aDsgaSA8IHJlUmVuZGVyUmlnaHRCb3VuZGFyeTsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJldmlvdXNTaWJsaW5nID0gaSAtIDEgPj0gMCAmJiB0aGlzLl9vdXRwdXRFbnRyaWVzW2kgLSAxXSAmJiAhISh0aGlzLl9vdXRwdXRFbnRyaWVzW2kgLSAxXS5lbGVtZW50LmlubmVyQ29udGFpbmVyPy5wYXJlbnRFbGVtZW50KSA/IHRoaXMuX291dHB1dEVudHJpZXNbaSAtIDFdLmVsZW1lbnQuaW5uZXJDb250YWluZXIgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fb3V0cHV0RW50cmllc1tpXS5lbGVtZW50LnJlbmRlcihwcmV2aW91c1NpYmxpbmcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGFmdGVyIHNwbGljZSwgaXQgZG9lc24ndCBleGNlZWRcblx0XHRcdGRlbGV0ZWRFbnRyaWVzLmZvckVhY2goZW50cnkgPT4ge1xuXHRcdFx0XHRlbnRyeS5lbGVtZW50LmRldGFjaCgpO1xuXHRcdFx0XHRlbnRyeS5lbGVtZW50LmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZVJlbmRlclJpZ2h0Qm91bmRhcnkgPSBmaXJzdEdyb3VwRW50cmllcy5sZW5ndGggKyBuZXdseUluc2VydGVkLmxlbmd0aDtcblxuXHRcdFx0Y29uc3QgbmV3bHlJbnNlcnRlZEVudHJpZXMgPSBuZXdseUluc2VydGVkLm1hcChpbnNlcnQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gbmV3IE91dHB1dEVudHJ5Vmlld0hhbmRsZXIoaW5zZXJ0LCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENlbGxPdXRwdXRFbGVtZW50LCB0aGlzLm5vdGVib29rRWRpdG9yLCB0aGlzLnZpZXdDZWxsLCB0aGlzLCB0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRDb250YWluZXIsIGluc2VydCkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGxldCBvdXRwdXRzTmV3bHlBdmFpbGFibGU6IE91dHB1dEVudHJ5Vmlld0hhbmRsZXJbXSA9IFtdO1xuXG5cdFx0XHRpZiAoZmlyc3RHcm91cEVudHJpZXMubGVuZ3RoICsgbmV3bHlJbnNlcnRlZEVudHJpZXMubGVuZ3RoICsgc2Vjb25kR3JvdXBFbnRyaWVzLmxlbmd0aCA8IHRoaXMudmlld0NlbGwub3V0cHV0c1ZpZXdNb2RlbHMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGxhc3QgPSBNYXRoLm1pbih0aGlzLm9wdGlvbnMubGltaXQsIHRoaXMudmlld0NlbGwub3V0cHV0c1ZpZXdNb2RlbHMubGVuZ3RoKTtcblx0XHRcdFx0b3V0cHV0c05ld2x5QXZhaWxhYmxlID0gdGhpcy52aWV3Q2VsbC5vdXRwdXRzVmlld01vZGVscy5zbGljZShmaXJzdEdyb3VwRW50cmllcy5sZW5ndGggKyBuZXdseUluc2VydGVkRW50cmllcy5sZW5ndGggKyBzZWNvbmRHcm91cEVudHJpZXMubGVuZ3RoLCBsYXN0KS5tYXAob3V0cHV0ID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IE91dHB1dEVudHJ5Vmlld0hhbmRsZXIob3V0cHV0LCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENlbGxPdXRwdXRFbGVtZW50LCB0aGlzLm5vdGVib29rRWRpdG9yLCB0aGlzLnZpZXdDZWxsLCB0aGlzLCB0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRDb250YWluZXIsIG91dHB1dCkpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb3V0cHV0RW50cmllcyA9IFsuLi5maXJzdEdyb3VwRW50cmllcywgLi4ubmV3bHlJbnNlcnRlZEVudHJpZXMsIC4uLnNlY29uZEdyb3VwRW50cmllcywgLi4ub3V0cHV0c05ld2x5QXZhaWxhYmxlXTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IGZpcnN0R3JvdXBFbnRyaWVzLmxlbmd0aDsgaSA8IHJlUmVuZGVyUmlnaHRCb3VuZGFyeTsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzU2libGluZyA9IGkgLSAxID49IDAgJiYgdGhpcy5fb3V0cHV0RW50cmllc1tpIC0gMV0gJiYgISEodGhpcy5fb3V0cHV0RW50cmllc1tpIC0gMV0uZWxlbWVudC5pbm5lckNvbnRhaW5lcj8ucGFyZW50RWxlbWVudCkgPyB0aGlzLl9vdXRwdXRFbnRyaWVzW2kgLSAxXS5lbGVtZW50LmlubmVyQ29udGFpbmVyIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9vdXRwdXRFbnRyaWVzW2ldLmVsZW1lbnQucmVuZGVyKHByZXZpb3VzU2libGluZyk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgb3V0cHV0c05ld2x5QXZhaWxhYmxlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHRoaXMuX291dHB1dEVudHJpZXNbZmlyc3RHcm91cEVudHJpZXMubGVuZ3RoICsgbmV3bHlJbnNlcnRlZC5sZW5ndGggKyBzZWNvbmRHcm91cEVudHJpZXMubGVuZ3RoICsgaV0uZWxlbWVudC5yZW5kZXIodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy52aWV3Q2VsbC5vdXRwdXRzVmlld01vZGVscy5sZW5ndGggPiB0aGlzLm9wdGlvbnMubGltaXQpIHtcblx0XHRcdERPTS5zaG93KHRoaXMudGVtcGxhdGVEYXRhLm91dHB1dFNob3dNb3JlQ29udGFpbmVyLmRvbU5vZGUpO1xuXHRcdFx0aWYgKCF0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRTaG93TW9yZUNvbnRhaW5lci5kb21Ob2RlLmhhc0NoaWxkTm9kZXMoKSkge1xuXHRcdFx0XHR0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRTaG93TW9yZUNvbnRhaW5lci5kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2dlbmVyYXRlU2hvd01vcmVFbGVtZW50KHRoaXMudGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMpKTtcblx0XHRcdH1cblx0XHRcdHRoaXMudmlld0NlbGwudXBkYXRlT3V0cHV0U2hvd01vcmVDb250YWluZXJIZWlnaHQoNDYpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRET00uaGlkZSh0aGlzLnRlbXBsYXRlRGF0YS5vdXRwdXRTaG93TW9yZUNvbnRhaW5lci5kb21Ob2RlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWxheW91dENlbGwoKTtcblx0XHQvLyBpZiBpdCdzIGNsZWFyaW5nIGFsbCBvdXRwdXRzLCBvciBvdXRwdXRzIGFyZSBhbGwgcmVuZGVyZWQgc3luY2hyb25vdXNseVxuXHRcdC8vIHNocmluayBpbW1lZGlhdGVseSBhcyB0aGUgZmluYWwgb3V0cHV0IGhlaWdodCB3aWxsIGJlIHplcm8uXG5cdFx0Ly8gaWYgaXQncyByZXJ1biwgdGhlbiB0aGUgb3V0cHV0IGNsZWFyaW5nIG1pZ2h0IGJlIHRlbXBvcmFyeSwgc28gd2UgZG9uJ3Qgc2hyaW5rIGltbWVkaWF0ZWx5XG5cdFx0dGhpcy5fdmFsaWRhdGVGaW5hbE91dHB1dEhlaWdodChjb250ZXh0ID09PSBDZWxsT3V0cHV0VXBkYXRlQ29udGV4dC5PdGhlciAmJiB0aGlzLnZpZXdDZWxsLm91dHB1dHNWaWV3TW9kZWxzLmxlbmd0aCA9PT0gMCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZW5lcmF0ZVNob3dNb3JlRWxlbWVudChkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IG1kOiBJTWFya2Rvd25TdHJpbmcgPSB7XG5cdFx0XHR2YWx1ZTogYFRoZXJlIGFyZSBtb3JlIHRoYW4gJHt0aGlzLm9wdGlvbnMubGltaXR9IG91dHB1dHMsIFtzaG93IG1vcmUgKG9wZW4gdGhlIHJhdyBvdXRwdXQgZGF0YSBpbiBhIHRleHQgZWRpdG9yKSAuLi5dKGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuTGFyZ2VPdXRwdXQpYCxcblx0XHRcdGlzVHJ1c3RlZDogdHJ1ZSxcblx0XHRcdHN1cHBvcnRUaGVtZUljb25zOiB0cnVlXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlbmRlcmVkID0gZGlzcG9zYWJsZXMuYWRkKHJlbmRlck1hcmtkb3duKG1kLCB7XG5cdFx0XHRhY3Rpb25IYW5kbGVyOiAoY29udGVudCkgPT4ge1xuXHRcdFx0XHRpZiAoY29udGVudCA9PT0gJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuTGFyZ2VPdXRwdXQnKSB7XG5cdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oQ2VsbFVyaS5nZW5lcmF0ZUNlbGxPdXRwdXRVcmlXaXRoSWQodGhpcy5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWwhLnVyaSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdHJlbmRlcmVkLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnb3V0cHV0LXNob3ctbW9yZScpO1xuXHRcdHJldHVybiByZW5kZXJlZC5lbGVtZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVsYXlvdXRDZWxsKCkge1xuXHRcdHRoaXMubm90ZWJvb2tFZGl0b3IubGF5b3V0Tm90ZWJvb2tDZWxsKHRoaXMudmlld0NlbGwsIHRoaXMudmlld0NlbGwubGF5b3V0SW5mby50b3RhbEhlaWdodCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMudmlld0NlbGwudXBkYXRlT3V0cHV0TWluSGVpZ2h0KDApO1xuXG5cdFx0aWYgKHRoaXMuX291dHB1dEhlaWdodFRpbWVyKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fb3V0cHV0SGVpZ2h0VGltZXIpO1xuXHRcdH1cblxuXHRcdHRoaXMuX291dHB1dEVudHJpZXMuZm9yRWFjaChlbnRyeSA9PiB7XG5cdFx0XHRlbnRyeS5lbGVtZW50LmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jb25zdCBKVVBZVEVSX1JFTkRFUkVSX01JTUVUWVBFUyA9IFtcblx0J2FwcGxpY2F0aW9uL2dlbytqc29uJyxcblx0J2FwcGxpY2F0aW9uL3Zkb20udjEranNvbicsXG5cdCdhcHBsaWNhdGlvbi92bmQuZGF0YXJlc291cmNlK2pzb24nLFxuXHQnYXBwbGljYXRpb24vdm5kLnBsb3RseS52MStqc29uJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC52ZWdhLnYyK2pzb24nLFxuXHQnYXBwbGljYXRpb24vdm5kLnZlZ2EudjMranNvbicsXG5cdCdhcHBsaWNhdGlvbi92bmQudmVnYS52NCtqc29uJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC52ZWdhLnY1K2pzb24nLFxuXHQnYXBwbGljYXRpb24vdm5kLnZlZ2FsaXRlLnYxK2pzb24nLFxuXHQnYXBwbGljYXRpb24vdm5kLnZlZ2FsaXRlLnYyK2pzb24nLFxuXHQnYXBwbGljYXRpb24vdm5kLnZlZ2FsaXRlLnYzK2pzb24nLFxuXHQnYXBwbGljYXRpb24vdm5kLnZlZ2FsaXRlLnY0K2pzb24nLFxuXHQnYXBwbGljYXRpb24veC1udGVyYWN0LW1vZGVsLWRlYnVnK2pzb24nLFxuXHQnaW1hZ2Uvc3ZnK3htbCcsXG5cdCd0ZXh0L2xhdGV4Jyxcblx0J3RleHQvdm5kLnBsb3RseS52MStodG1sJyxcblx0J2FwcGxpY2F0aW9uL3ZuZC5qdXB5dGVyLndpZGdldC12aWV3K2pzb24nLFxuXHQnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suZXJyb3InXG5dO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFFckIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxjQUFjO0FBRXZCLFNBQVMsWUFBWSx1QkFBdUI7QUFD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
