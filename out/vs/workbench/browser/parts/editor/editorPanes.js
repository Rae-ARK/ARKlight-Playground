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
import { localize } from "../../../../nls.js";
import { Emitter } from "../../../../base/common/event.js";
import Severity from "../../../../base/common/severity.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { EditorExtensions, EditorInputCapabilities, isEditorOpenError } from "../../../common/editor.js";
import { Dimension, show, hide, isAncestor, getActiveElement, getWindowById, isEditableElement, $ } from "../../../../base/browser/dom.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IEditorProgressService, LongRunningOperation } from "../../../../platform/progress/common/progress.js";
import { DEFAULT_EDITOR_MIN_DIMENSIONS, DEFAULT_EDITOR_MAX_DIMENSIONS } from "./editor.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { ErrorPlaceholderEditor, WorkspaceTrustRequiredPlaceholderEditor } from "./editorPlaceholder.js";
import { EditorOpenSource } from "../../../../platform/editor/common/editor.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IHostService } from "../../../services/host/browser/host.js";
let EditorPanes = class extends Disposable {
  constructor(editorGroupParent, editorPanesParent, groupView, layoutService, instantiationService, editorProgressService, workspaceTrustService, logService, dialogService, hostService) {
    super();
    this.editorGroupParent = editorGroupParent;
    this.editorPanesParent = editorPanesParent;
    this.groupView = groupView;
    this.layoutService = layoutService;
    this.instantiationService = instantiationService;
    this.workspaceTrustService = workspaceTrustService;
    this.logService = logService;
    this.dialogService = dialogService;
    this.hostService = hostService;
    //#region Events
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidChangeSizeConstraints = this._register(new Emitter());
    this.onDidChangeSizeConstraints = this._onDidChangeSizeConstraints.event;
    this._activeEditorPane = null;
    this.editorPanes = [];
    this.mapEditorPaneToPendingSetInput = /* @__PURE__ */ new Map();
    this.activeEditorPaneDisposables = this._register(new DisposableStore());
    this.editorPanesRegistry = Registry.as(EditorExtensions.EditorPane);
    this.editorOperation = this._register(new LongRunningOperation(editorProgressService));
    this.registerListeners();
  }
  //#endregion
  get minimumWidth() {
    return this._activeEditorPane?.minimumWidth ?? DEFAULT_EDITOR_MIN_DIMENSIONS.width;
  }
  get minimumHeight() {
    return this._activeEditorPane?.minimumHeight ?? DEFAULT_EDITOR_MIN_DIMENSIONS.height;
  }
  get maximumWidth() {
    return this._activeEditorPane?.maximumWidth ?? DEFAULT_EDITOR_MAX_DIMENSIONS.width;
  }
  get maximumHeight() {
    return this._activeEditorPane?.maximumHeight ?? DEFAULT_EDITOR_MAX_DIMENSIONS.height;
  }
  get activeEditorPane() {
    return this._activeEditorPane;
  }
  registerListeners() {
    this._register(this.workspaceTrustService.onDidChangeTrust(() => this.onDidChangeWorkspaceTrust()));
  }
  onDidChangeWorkspaceTrust() {
    const editor = this._activeEditorPane?.input;
    const options = this._activeEditorPane?.options;
    if (editor?.hasCapability(EditorInputCapabilities.RequiresTrust)) {
      this.groupView.openEditor(editor, options);
    }
  }
  async openEditor(editor, options, internalOptions, context = /* @__PURE__ */ Object.create(null)) {
    try {
      return await this.doOpenEditor(this.getEditorPaneDescriptor(editor), editor, options, internalOptions, context);
    } catch (error) {
      if (options?.ignoreError) {
        return { error };
      }
      return this.doShowError(error, editor, options, internalOptions, context);
    }
  }
  async doShowError(error, editor, options, internalOptions, context) {
    this.logService.error(error);
    let errorHandled = false;
    if (options?.source === EditorOpenSource.USER && (!isEditorOpenError(error) || error.allowDialog)) {
      errorHandled = await this.doShowErrorDialog(error, editor);
    }
    if (errorHandled) {
      return { error };
    }
    const editorPlaceholderOptions = { ...options };
    if (!isCancellationError(error)) {
      editorPlaceholderOptions.error = error;
    }
    return {
      ...await this.doOpenEditor(ErrorPlaceholderEditor.DESCRIPTOR, editor, editorPlaceholderOptions, internalOptions, context),
      error
    };
  }
  async doShowErrorDialog(error, editor) {
    let severity = Severity.Error;
    let message = void 0;
    let detail = toErrorMessage(error);
    let errorActions = void 0;
    if (isEditorOpenError(error)) {
      errorActions = error.actions;
      severity = error.forceSeverity ?? Severity.Error;
      if (error.forceMessage) {
        message = error.message;
        detail = void 0;
      }
    }
    if (!message) {
      message = localize("editorOpenErrorDialog", "Unable to open '{0}'", editor.getName());
    }
    const buttons = [];
    if (errorActions && errorActions.length > 0) {
      for (const errorAction of errorActions) {
        buttons.push({
          label: errorAction.label,
          run: () => errorAction
        });
      }
    } else {
      buttons.push({
        label: localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK"),
        run: () => void 0
      });
    }
    let cancelButton = void 0;
    if (buttons.length === 1) {
      cancelButton = {
        run: () => {
          errorHandled = true;
          return void 0;
        }
      };
    }
    let errorHandled = false;
    const { result } = await this.dialogService.prompt({
      type: severity,
      message,
      detail,
      buttons,
      cancelButton
    });
    if (result) {
      const errorActionResult = result.run();
      if (errorActionResult instanceof Promise) {
        errorActionResult.catch((error2) => this.dialogService.error(toErrorMessage(error2)));
      }
      errorHandled = true;
    }
    return errorHandled;
  }
  async doOpenEditor(descriptor, editor, options, internalOptions, context = /* @__PURE__ */ Object.create(null)) {
    const pane = this.doShowEditorPane(descriptor);
    const activeElement = getActiveElement();
    const { changed, cancelled } = await this.doSetInput(pane, editor, options, context);
    if (!cancelled) {
      const focus = !options?.preserveFocus;
      if (focus && this.shouldRestoreFocus(activeElement)) {
        pane.focus();
      } else if (!internalOptions?.preserveWindowOrder) {
        this.hostService.moveTop(getWindowById(this.groupView.windowId, true).window);
      }
    }
    return { pane, changed, cancelled };
  }
  shouldRestoreFocus(expectedActiveElement) {
    if (!this.layoutService.isRestored()) {
      return true;
    }
    if (!expectedActiveElement) {
      return true;
    }
    const activeElement = getActiveElement();
    if (!activeElement || activeElement === expectedActiveElement.ownerDocument.body) {
      return true;
    }
    const same = expectedActiveElement === activeElement;
    if (same) {
      return true;
    }
    if (!isEditableElement(activeElement)) {
      return true;
    }
    if (isAncestor(activeElement, this.editorGroupParent)) {
      return true;
    }
    return false;
  }
  getEditorPaneDescriptor(editor) {
    if (editor.hasCapability(EditorInputCapabilities.RequiresTrust) && !this.workspaceTrustService.isWorkspaceTrusted()) {
      return WorkspaceTrustRequiredPlaceholderEditor.DESCRIPTOR;
    }
    return assertReturnsDefined(this.editorPanesRegistry.getEditorPane(editor));
  }
  doShowEditorPane(descriptor) {
    if (this._activeEditorPane && descriptor.describes(this._activeEditorPane)) {
      return this._activeEditorPane;
    }
    this.doHideActiveEditorPane();
    const editorPane = this.doCreateEditorPane(descriptor);
    this.doSetActiveEditorPane(editorPane);
    const container = assertReturnsDefined(editorPane.getContainer());
    this.editorPanesParent.appendChild(container);
    show(container);
    editorPane.setVisible(true);
    if (this.pagePosition) {
      editorPane.layout(new Dimension(this.pagePosition.width, this.pagePosition.height), { top: this.pagePosition.top, left: this.pagePosition.left });
    }
    if (this.boundarySashes) {
      editorPane.setBoundarySashes(this.boundarySashes);
    }
    return editorPane;
  }
  doCreateEditorPane(descriptor) {
    const editorPane = this.doInstantiateEditorPane(descriptor);
    if (!editorPane.getContainer()) {
      const editorPaneContainer = $(".editor-instance");
      this.editorPanesParent.appendChild(editorPaneContainer);
      try {
        editorPane.create(editorPaneContainer);
      } catch (error) {
        editorPaneContainer.remove();
        hide(editorPaneContainer);
        throw error;
      }
    }
    return editorPane;
  }
  doInstantiateEditorPane(descriptor) {
    const existingEditorPane = this.editorPanes.find((editorPane2) => descriptor.describes(editorPane2));
    if (existingEditorPane) {
      return existingEditorPane;
    }
    const editorPane = this._register(descriptor.instantiate(this.instantiationService, this.groupView));
    this.editorPanes.push(editorPane);
    return editorPane;
  }
  doSetActiveEditorPane(editorPane) {
    this._activeEditorPane = editorPane;
    this.activeEditorPaneDisposables.clear();
    if (editorPane) {
      this.activeEditorPaneDisposables.add(editorPane.onDidChangeSizeConstraints((e) => this._onDidChangeSizeConstraints.fire(e)));
      this.activeEditorPaneDisposables.add(editorPane.onDidFocus(() => this._onDidFocus.fire()));
    }
    this._onDidChangeSizeConstraints.fire(void 0);
  }
  async doSetInput(editorPane, editor, options, context) {
    let inputMatches = editorPane.input?.matches(editor);
    if (inputMatches && !options?.forceReload) {
      if (this.mapEditorPaneToPendingSetInput.has(editorPane)) {
        await this.mapEditorPaneToPendingSetInput.get(editorPane);
      }
      inputMatches = editorPane.input?.matches(editor);
      if (inputMatches) {
        editorPane.setOptions(options);
      }
      return { changed: false, cancelled: !inputMatches };
    }
    const operation = this.editorOperation.start(this.layoutService.isRestored() ? 800 : 3200);
    let cancelled = false;
    try {
      editorPane.clearInput();
      const pendingSetInput = editorPane.setInput(editor, options, context, operation.token);
      this.mapEditorPaneToPendingSetInput.set(editorPane, pendingSetInput);
      await pendingSetInput;
      if (!operation.isCurrent()) {
        cancelled = true;
      }
    } catch (error) {
      if (!operation.isCurrent()) {
        cancelled = true;
      } else {
        throw error;
      }
    } finally {
      if (operation.isCurrent()) {
        this.mapEditorPaneToPendingSetInput.delete(editorPane);
      }
      operation.stop();
    }
    return { changed: !inputMatches, cancelled };
  }
  doHideActiveEditorPane() {
    if (!this._activeEditorPane) {
      return;
    }
    this.editorOperation.stop();
    this.safeRun(() => this._activeEditorPane?.clearInput());
    this.safeRun(() => this._activeEditorPane?.setVisible(false));
    this.mapEditorPaneToPendingSetInput.delete(this._activeEditorPane);
    const editorPaneContainer = this._activeEditorPane.getContainer();
    if (editorPaneContainer) {
      editorPaneContainer.remove();
      hide(editorPaneContainer);
    }
    this.doSetActiveEditorPane(null);
  }
  closeEditor(editor) {
    if (this._activeEditorPane?.input && editor.matches(this._activeEditorPane.input)) {
      this.doHideActiveEditorPane();
    }
  }
  setVisible(visible) {
    this.safeRun(() => this._activeEditorPane?.setVisible(visible));
  }
  layout(pagePosition) {
    this.pagePosition = pagePosition;
    this.safeRun(() => this._activeEditorPane?.layout(new Dimension(pagePosition.width, pagePosition.height), pagePosition));
  }
  setBoundarySashes(sashes) {
    this.boundarySashes = sashes;
    this.safeRun(() => this._activeEditorPane?.setBoundarySashes(sashes));
  }
  safeRun(fn) {
    try {
      fn();
    } catch (error) {
      this.logService.error(error);
    }
  }
};
EditorPanes = __decorateClass([
  __decorateParam(3, IWorkbenchLayoutService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IEditorProgressService),
  __decorateParam(6, IWorkspaceTrustManagementService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IHostService)
], EditorPanes);
export {
  EditorPanes
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnMsIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBJRWRpdG9yT3BlbkNvbnRleHQsIElWaXNpYmxlRWRpdG9yUGFuZSwgaXNFZGl0b3JPcGVuRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBEaW1lbnNpb24sIHNob3csIGhpZGUsIElEb21Ob2RlUGFnZVBvc2l0aW9uLCBpc0FuY2VzdG9yLCBnZXRBY3RpdmVFbGVtZW50LCBnZXRXaW5kb3dCeUlkLCBpc0VkaXRhYmxlRWxlbWVudCwgJCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUVkaXRvclBhbmVSZWdpc3RyeSwgSUVkaXRvclBhbmVEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vZWRpdG9yLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclByb2dyZXNzU2VydmljZSwgTG9uZ1J1bm5pbmdPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwVmlldywgREVGQVVMVF9FRElUT1JfTUlOX0RJTUVOU0lPTlMsIERFRkFVTFRfRURJVE9SX01BWF9ESU1FTlNJT05TLCBJSW50ZXJuYWxFZGl0b3JPcGVuT3B0aW9ucyB9IGZyb20gJy4vZWRpdG9yLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IEVycm9yUGxhY2Vob2xkZXJFZGl0b3IsIElFcnJvckVkaXRvclBsYWNlaG9sZGVyT3B0aW9ucywgV29ya3NwYWNlVHJ1c3RSZXF1aXJlZFBsYWNlaG9sZGVyRWRpdG9yIH0gZnJvbSAnLi9lZGl0b3JQbGFjZWhvbGRlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcGVuU291cmNlLCBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSwgSVByb21wdEJ1dHRvbiwgSVByb21wdENhbmNlbEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUJvdW5kYXJ5U2FzaGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU9wZW5FZGl0b3JSZXN1bHQge1xuXG5cdC8qKlxuXHQgKiBUaGUgZWRpdG9yIHBhbmUgdXNlZCBmb3Igb3BlbmluZy4gVGhpcyBjYW4gYmUgYSBnZW5lcmljXG5cdCAqIHBsYWNlaG9sZGVyIGluIGNlcnRhaW4gY2FzZXMsIGUuZy4gd2hlbiB3b3Jrc3BhY2UgdHJ1c3Rcblx0ICogaXMgcmVxdWlyZWQsIG9yIGFuIGVkaXRvciBmYWlscyB0byByZXN0b3JlLlxuXHQgKlxuXHQgKiBXaWxsIGJlIGB1bmRlZmluZWRgIGlmIGFuIGVycm9yIG9jY3VycmVkIHdoaWxlIHRyeWluZyB0b1xuXHQgKiBvcGVuIHRoZSBlZGl0b3IgYW5kIGluIGNhc2VzIHdoZXJlIG5vIHBsYWNlaG9sZGVyIGlzIGJlaW5nXG5cdCAqIHVzZWQuXG5cdCAqL1xuXHRyZWFkb25seSBwYW5lPzogRWRpdG9yUGFuZTtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgZWRpdG9yIGNoYW5nZWQgYXMgYSByZXN1bHQgb2Ygb3BlbmluZy5cblx0ICovXG5cdHJlYWRvbmx5IGNoYW5nZWQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaGlzIHByb3BlcnR5IGlzIHNldCB3aGVuIGFuIGVkaXRvciBmYWlscyB0byByZXN0b3JlIGFuZFxuXHQgKiBpcyBzaG93biB3aXRoIGEgZ2VuZXJpYyBwbGFjZSBob2xkZXIuIEl0IGFsbG93cyBjYWxsZXJzXG5cdCAqIHRvIHN0aWxsIHByZXNlbnQgdGhlIGVycm9yIHRvIHRoZSB1c2VyIGluIHRoYXQgY2FzZS5cblx0ICovXG5cdHJlYWRvbmx5IGVycm9yPzogRXJyb3I7XG5cblx0LyoqXG5cdCAqIFRoaXMgcHJvcGVydHkgaW5kaWNhdGVzIHdoZXRoZXIgdGhlIG9wZW4gZWRpdG9yIG9wZXJhdGlvbiB3YXNcblx0ICogY2FuY2VsbGVkIG9yIG5vdC4gVGhlIG9wZXJhdGlvbiBtYXkgaGF2ZSBiZWVuIGNhbmNlbGxlZFxuXHQgKiBpbiBjYXNlIGFub3RoZXIgZWRpdG9yIG9wZW4gb3BlcmF0aW9uIHdhcyB0cmlnZ2VyZWQgcmlnaHRcblx0ICogYWZ0ZXIgY2FuY2VsbGluZyB0aGlzIG9uZSBvdXQuXG5cdCAqL1xuXHRyZWFkb25seSBjYW5jZWxsZWQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgRWRpdG9yUGFuZXMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHQvLyNyZWdpb24gRXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGb2N1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZvY3VzID0gdGhpcy5fb25EaWRGb2N1cy5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVNpemVDb25zdHJhaW50cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2l6ZUNvbnN0cmFpbnRzID0gdGhpcy5fb25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMuZXZlbnQ7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Z2V0IG1pbmltdW1XaWR0aCgpIHsgcmV0dXJuIHRoaXMuX2FjdGl2ZUVkaXRvclBhbmU/Lm1pbmltdW1XaWR0aCA/PyBERUZBVUxUX0VESVRPUl9NSU5fRElNRU5TSU9OUy53aWR0aDsgfVxuXHRnZXQgbWluaW11bUhlaWdodCgpIHsgcmV0dXJuIHRoaXMuX2FjdGl2ZUVkaXRvclBhbmU/Lm1pbmltdW1IZWlnaHQgPz8gREVGQVVMVF9FRElUT1JfTUlOX0RJTUVOU0lPTlMuaGVpZ2h0OyB9XG5cdGdldCBtYXhpbXVtV2lkdGgoKSB7IHJldHVybiB0aGlzLl9hY3RpdmVFZGl0b3JQYW5lPy5tYXhpbXVtV2lkdGggPz8gREVGQVVMVF9FRElUT1JfTUFYX0RJTUVOU0lPTlMud2lkdGg7IH1cblx0Z2V0IG1heGltdW1IZWlnaHQoKSB7IHJldHVybiB0aGlzLl9hY3RpdmVFZGl0b3JQYW5lPy5tYXhpbXVtSGVpZ2h0ID8/IERFRkFVTFRfRURJVE9SX01BWF9ESU1FTlNJT05TLmhlaWdodDsgfVxuXG5cdHByaXZhdGUgX2FjdGl2ZUVkaXRvclBhbmU6IEVkaXRvclBhbmUgfCBudWxsID0gbnVsbDtcblx0Z2V0IGFjdGl2ZUVkaXRvclBhbmUoKTogSVZpc2libGVFZGl0b3JQYW5lIHwgbnVsbCB7IHJldHVybiB0aGlzLl9hY3RpdmVFZGl0b3JQYW5lIGFzIElWaXNpYmxlRWRpdG9yUGFuZSB8IG51bGw7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvclBhbmVzOiBFZGl0b3JQYW5lW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBtYXBFZGl0b3JQYW5lVG9QZW5kaW5nU2V0SW5wdXQgPSBuZXcgTWFwPEVkaXRvclBhbmUsIFByb21pc2U8dm9pZD4+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVFZGl0b3JQYW5lRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgcGFnZVBvc2l0aW9uOiBJRG9tTm9kZVBhZ2VQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBib3VuZGFyeVNhc2hlczogSUJvdW5kYXJ5U2FzaGVzIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yT3BlcmF0aW9uOiBMb25nUnVubmluZ09wZXJhdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JQYW5lc1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3VwUGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvclBhbmVzUGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGdyb3VwVmlldzogSUVkaXRvckdyb3VwVmlldyxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclByb2dyZXNzU2VydmljZSBlZGl0b3JQcm9ncmVzc1NlcnZpY2U6IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lZGl0b3JPcGVyYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgTG9uZ1J1bm5pbmdPcGVyYXRpb24oZWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlKSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlVHJ1c3RTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3QoKCkgPT4gdGhpcy5vbkRpZENoYW5nZVdvcmtzcGFjZVRydXN0KCkpKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VXb3Jrc3BhY2VUcnVzdCgpIHtcblxuXHRcdC8vIElmIHRoZSBhY3RpdmUgZWRpdG9yIHBhbmUgcmVxdWlyZXMgd29ya3NwYWNlIHRydXN0XG5cdFx0Ly8gd2UgbmVlZCB0byByZS1vcGVuIGl0IGFueXRpbWUgdHJ1c3QgY2hhbmdlcyB0b1xuXHRcdC8vIGFjY291bnQgZm9yIGl0LlxuXHRcdC8vIEZvciB0aGF0IHdlIGV4cGxpY2l0bHkgY2FsbCBpbnRvIHRoZSBncm91cC12aWV3XG5cdFx0Ly8gdG8gaGFuZGxlIGVycm9ycyBwcm9wZXJseS5cblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9hY3RpdmVFZGl0b3JQYW5lPy5pbnB1dDtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fYWN0aXZlRWRpdG9yUGFuZT8ub3B0aW9ucztcblx0XHRpZiAoZWRpdG9yPy5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlJlcXVpcmVzVHJ1c3QpKSB7XG5cdFx0XHR0aGlzLmdyb3VwVmlldy5vcGVuRWRpdG9yKGVkaXRvciwgb3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgb3BlbkVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0LCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgaW50ZXJuYWxPcHRpb25zOiBJSW50ZXJuYWxFZGl0b3JPcGVuT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0ID0gT2JqZWN0LmNyZWF0ZShudWxsKSk6IFByb21pc2U8SU9wZW5FZGl0b3JSZXN1bHQ+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuZG9PcGVuRWRpdG9yKHRoaXMuZ2V0RWRpdG9yUGFuZURlc2NyaXB0b3IoZWRpdG9yKSwgZWRpdG9yLCBvcHRpb25zLCBpbnRlcm5hbE9wdGlvbnMsIGNvbnRleHQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdC8vIEZpcnN0IGNoZWNrIGlmIGNhbGxlciBpbnN0cnVjdGVkIHVzIHRvIGlnbm9yZSBlcnJvciBoYW5kbGluZ1xuXHRcdFx0aWYgKG9wdGlvbnM/Lmlnbm9yZUVycm9yKSB7XG5cdFx0XHRcdHJldHVybiB7IGVycm9yIH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIEluIGNhc2Ugb2YgYW4gZXJyb3Igd2hlbiBvcGVuaW5nIGFuIGVkaXRvciwgd2Ugc3RpbGwgd2FudCB0byBzaG93XG5cdFx0XHQvLyBhbiBlZGl0b3IgaW4gdGhlIGRlc2lyZWQgbG9jYXRpb24gdG8gcHJlc2VydmUgdGhlIHVzZXIgaW50ZW50IGFuZFxuXHRcdFx0Ly8gdmlldyBzdGF0ZSAoZS5nLiB3aGVuIHJlc3RvcmluZykuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gRm9yIHRoYXQgcmVhc29uIHdlIGhhdmUgcGxhY2UgaG9sZGVyIGVkaXRvcnMgdGhhdCBjYW4gY29udmV5IGFcblx0XHRcdC8vIG1lc3NhZ2Ugd2l0aCBhY3Rpb25zIHRoZSB1c2VyIGNhbiBjbGljayBvbi5cblxuXHRcdFx0cmV0dXJuIHRoaXMuZG9TaG93RXJyb3IoZXJyb3IsIGVkaXRvciwgb3B0aW9ucywgaW50ZXJuYWxPcHRpb25zLCBjb250ZXh0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvU2hvd0Vycm9yKGVycm9yOiBFcnJvciwgZWRpdG9yOiBFZGl0b3JJbnB1dCwgb3B0aW9uczogSUVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGludGVybmFsT3B0aW9uczogSUludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ/OiBJRWRpdG9yT3BlbkNvbnRleHQpOiBQcm9taXNlPElPcGVuRWRpdG9yUmVzdWx0PiB7XG5cblx0XHQvLyBBbHdheXMgbG9nIHRoZSBlcnJvciB0byBmaWd1cmUgb3V0IHdoYXQgaXMgZ29pbmcgb25cblx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXG5cdFx0Ly8gU2hvdyBhcyBtb2RhbCBkaWFsb2cgd2hlbiBleHBsaWNpdCB1c2VyIGFjdGlvbiB1bmxlc3MgZGlzYWJsZWRcblx0XHRsZXQgZXJyb3JIYW5kbGVkID0gZmFsc2U7XG5cdFx0aWYgKG9wdGlvbnM/LnNvdXJjZSA9PT0gRWRpdG9yT3BlblNvdXJjZS5VU0VSICYmICghaXNFZGl0b3JPcGVuRXJyb3IoZXJyb3IpIHx8IGVycm9yLmFsbG93RGlhbG9nKSkge1xuXHRcdFx0ZXJyb3JIYW5kbGVkID0gYXdhaXQgdGhpcy5kb1Nob3dFcnJvckRpYWxvZyhlcnJvciwgZWRpdG9yKTtcblx0XHR9XG5cblx0XHQvLyBSZXR1cm4gZWFybHkgaWYgdGhlIHVzZXIgZGVhbHQgd2l0aCB0aGUgZXJyb3IgYWxyZWFkeVxuXHRcdGlmIChlcnJvckhhbmRsZWQpIHtcblx0XHRcdHJldHVybiB7IGVycm9yIH07XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyBhcyBlZGl0b3IgcGxhY2Vob2xkZXI6IHBhc3Mgb3ZlciB0aGUgZXJyb3IgdG8gZGlzcGxheVxuXHRcdGNvbnN0IGVkaXRvclBsYWNlaG9sZGVyT3B0aW9uczogSUVycm9yRWRpdG9yUGxhY2Vob2xkZXJPcHRpb25zID0geyAuLi5vcHRpb25zIH07XG5cdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0ZWRpdG9yUGxhY2Vob2xkZXJPcHRpb25zLmVycm9yID0gZXJyb3I7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLihhd2FpdCB0aGlzLmRvT3BlbkVkaXRvcihFcnJvclBsYWNlaG9sZGVyRWRpdG9yLkRFU0NSSVBUT1IsIGVkaXRvciwgZWRpdG9yUGxhY2Vob2xkZXJPcHRpb25zLCBpbnRlcm5hbE9wdGlvbnMsIGNvbnRleHQpKSxcblx0XHRcdGVycm9yXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TaG93RXJyb3JEaWFsb2coZXJyb3I6IEVycm9yLCBlZGl0b3I6IEVkaXRvcklucHV0KTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0bGV0IHNldmVyaXR5ID0gU2V2ZXJpdHkuRXJyb3I7XG5cdFx0bGV0IG1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgZGV0YWlsOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB0b0Vycm9yTWVzc2FnZShlcnJvcik7XG5cdFx0bGV0IGVycm9yQWN0aW9uczogcmVhZG9ubHkgSUFjdGlvbltdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGlzRWRpdG9yT3BlbkVycm9yKGVycm9yKSkge1xuXHRcdFx0ZXJyb3JBY3Rpb25zID0gZXJyb3IuYWN0aW9ucztcblx0XHRcdHNldmVyaXR5ID0gZXJyb3IuZm9yY2VTZXZlcml0eSA/PyBTZXZlcml0eS5FcnJvcjtcblx0XHRcdGlmIChlcnJvci5mb3JjZU1lc3NhZ2UpIHtcblx0XHRcdFx0bWVzc2FnZSA9IGVycm9yLm1lc3NhZ2U7XG5cdFx0XHRcdGRldGFpbCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIW1lc3NhZ2UpIHtcblx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnZWRpdG9yT3BlbkVycm9yRGlhbG9nJywgXCJVbmFibGUgdG8gb3BlbiAnezB9J1wiLCBlZGl0b3IuZ2V0TmFtZSgpKTtcblx0XHR9XG5cblx0XHRjb25zdCBidXR0b25zOiBJUHJvbXB0QnV0dG9uPElBY3Rpb24gfCB1bmRlZmluZWQ+W10gPSBbXTtcblx0XHRpZiAoZXJyb3JBY3Rpb25zICYmIGVycm9yQWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVycm9yQWN0aW9uIG9mIGVycm9yQWN0aW9ucykge1xuXHRcdFx0XHRidXR0b25zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBlcnJvckFjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRydW46ICgpID0+IGVycm9yQWN0aW9uXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRidXR0b25zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdvaycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk9LXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0bGV0IGNhbmNlbEJ1dHRvbjogSVByb21wdENhbmNlbEJ1dHRvbjx1bmRlZmluZWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChidXR0b25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y2FuY2VsQnV0dG9uID0ge1xuXHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRlcnJvckhhbmRsZWQgPSB0cnVlOyAvLyB0cmVhdCBjYW5jZWwgYXMgaGFuZGxlZCBhbmQgZG8gbm90IHNob3cgcGxhY2Vob2xkZXJcblxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0bGV0IGVycm9ySGFuZGxlZCA9IGZhbHNlOyAgLy8gYnkgZGVmYXVsdCwgc2hvdyBwbGFjZWhvbGRlclxuXG5cdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0dHlwZTogc2V2ZXJpdHksXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0ZGV0YWlsLFxuXHRcdFx0YnV0dG9ucyxcblx0XHRcdGNhbmNlbEJ1dHRvblxuXHRcdH0pO1xuXG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0Y29uc3QgZXJyb3JBY3Rpb25SZXN1bHQgPSByZXN1bHQucnVuKCk7XG5cdFx0XHRpZiAoZXJyb3JBY3Rpb25SZXN1bHQgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG5cdFx0XHRcdGVycm9yQWN0aW9uUmVzdWx0LmNhdGNoKGVycm9yID0+IHRoaXMuZGlhbG9nU2VydmljZS5lcnJvcih0b0Vycm9yTWVzc2FnZShlcnJvcikpKTtcblx0XHRcdH1cblxuXHRcdFx0ZXJyb3JIYW5kbGVkID0gdHJ1ZTsgLy8gdHJlYXQgY3VzdG9tIGVycm9yIGFjdGlvbiBhcyBoYW5kbGVkIGFuZCBkbyBub3Qgc2hvdyBwbGFjZWhvbGRlclxuXHRcdH1cblxuXHRcdHJldHVybiBlcnJvckhhbmRsZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvT3BlbkVkaXRvcihkZXNjcmlwdG9yOiBJRWRpdG9yUGFuZURlc2NyaXB0b3IsIGVkaXRvcjogRWRpdG9ySW5wdXQsIG9wdGlvbnM6IElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBpbnRlcm5hbE9wdGlvbnM6IElJbnRlcm5hbEVkaXRvck9wZW5PcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQgPSBPYmplY3QuY3JlYXRlKG51bGwpKTogUHJvbWlzZTxJT3BlbkVkaXRvclJlc3VsdD4ge1xuXG5cdFx0Ly8gRWRpdG9yIHBhbmVcblx0XHRjb25zdCBwYW5lID0gdGhpcy5kb1Nob3dFZGl0b3JQYW5lKGRlc2NyaXB0b3IpO1xuXG5cdFx0Ly8gUmVtZW1iZXIgY3VycmVudCBhY3RpdmUgZWxlbWVudCBmb3IgZGVjaWRpbmcgdG8gcmVzdG9yZSBmb2N1cyBsYXRlclxuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBnZXRBY3RpdmVFbGVtZW50KCk7XG5cblx0XHQvLyBBcHBseSBpbnB1dCB0byBwYW5lXG5cdFx0Y29uc3QgeyBjaGFuZ2VkLCBjYW5jZWxsZWQgfSA9IGF3YWl0IHRoaXMuZG9TZXRJbnB1dChwYW5lLCBlZGl0b3IsIG9wdGlvbnMsIGNvbnRleHQpO1xuXG5cdFx0Ly8gTWFrZSBzdXJlIHRvIHBhc3MgZm9jdXMgdG8gdGhlIHBhbmUgb3Igb3RoZXJ3aXNlXG5cdFx0Ly8gbWFrZSBzdXJlIHRoYXQgdGhlIHBhbmUgd2luZG93IGlzIHZpc2libGUgdW5sZXNzXG5cdFx0Ly8gdGhpcyBoYXMgYmVlbiBleHBsaWNpdGx5IGRpc2FibGVkLlxuXHRcdGlmICghY2FuY2VsbGVkKSB7XG5cdFx0XHRjb25zdCBmb2N1cyA9ICFvcHRpb25zPy5wcmVzZXJ2ZUZvY3VzO1xuXHRcdFx0aWYgKGZvY3VzICYmIHRoaXMuc2hvdWxkUmVzdG9yZUZvY3VzKGFjdGl2ZUVsZW1lbnQpKSB7XG5cdFx0XHRcdHBhbmUuZm9jdXMoKTtcblx0XHRcdH0gZWxzZSBpZiAoIWludGVybmFsT3B0aW9ucz8ucHJlc2VydmVXaW5kb3dPcmRlcikge1xuXHRcdFx0XHR0aGlzLmhvc3RTZXJ2aWNlLm1vdmVUb3AoZ2V0V2luZG93QnlJZCh0aGlzLmdyb3VwVmlldy53aW5kb3dJZCwgdHJ1ZSkud2luZG93KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBwYW5lLCBjaGFuZ2VkLCBjYW5jZWxsZWQgfTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkUmVzdG9yZUZvY3VzKGV4cGVjdGVkQWN0aXZlRWxlbWVudDogRWxlbWVudCB8IG51bGwpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMubGF5b3V0U2VydmljZS5pc1Jlc3RvcmVkKCkpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyByZXN0b3JlIGZvY3VzIGlmIHdlIGFyZSBub3QgcmVzdG9yZWQgeWV0IG9uIHN0YXJ0dXBcblx0XHR9XG5cblx0XHRpZiAoIWV4cGVjdGVkQWN0aXZlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIHJlc3RvcmUgZm9jdXMgaWYgbm90aGluZyB3YXMgZm9jdXNlZFxuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBnZXRBY3RpdmVFbGVtZW50KCk7XG5cdFx0aWYgKCFhY3RpdmVFbGVtZW50IHx8IGFjdGl2ZUVsZW1lbnQgPT09IGV4cGVjdGVkQWN0aXZlRWxlbWVudC5vd25lckRvY3VtZW50LmJvZHkpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyByZXN0b3JlIGZvY3VzIGlmIG5vdGhpbmcgaXMgZm9jdXNlZCBjdXJyZW50bHlcblx0XHR9XG5cblx0XHRjb25zdCBzYW1lID0gZXhwZWN0ZWRBY3RpdmVFbGVtZW50ID09PSBhY3RpdmVFbGVtZW50O1xuXHRcdGlmIChzYW1lKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gcmVzdG9yZSBmb2N1cyBpZiBzYW1lIGVsZW1lbnQgaXMgc3RpbGwgYWN0aXZlXG5cdFx0fVxuXG5cdFx0aWYgKCFpc0VkaXRhYmxlRWxlbWVudChhY3RpdmVFbGVtZW50KSkge1xuXG5cdFx0XHQvLyBUaGlzIGlzIHRvIGF2b2lkIHJlZ3Jlc3Npb25zIGZyb20gbm90IHJlc3RvcmluZyBmb2N1cyBhcyB3ZSB1c2VkIHRvOlxuXHRcdFx0Ly8gT25seSBhbGxvdyBhIGRpZmZlcmVudCBpbnB1dCBlbGVtZW50IChvciB0ZXh0YXJlYSkgdG8gcmVtYWluIGZvY3VzZWRcblx0XHRcdC8vIGJ1dCBub3Qgb3RoZXIgZWxlbWVudHMgdGhhdCBkbyBub3QgYWNjZXB0IHRleHQgaW5wdXQuXG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChpc0FuY2VzdG9yKGFjdGl2ZUVsZW1lbnQsIHRoaXMuZWRpdG9yR3JvdXBQYXJlbnQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gcmVzdG9yZSBmb2N1cyBpZiBhY3RpdmUgZWxlbWVudCBpcyBzdGlsbCBpbnNpZGUgb3VyIGVkaXRvciBncm91cFxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTsgLy8gZG8gbm90IHJlc3RvcmUgZm9jdXNcblx0fVxuXG5cdHByaXZhdGUgZ2V0RWRpdG9yUGFuZURlc2NyaXB0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IElFZGl0b3JQYW5lRGVzY3JpcHRvciB7XG5cdFx0aWYgKGVkaXRvci5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlJlcXVpcmVzVHJ1c3QpICYmICF0aGlzLndvcmtzcGFjZVRydXN0U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSkge1xuXHRcdFx0Ly8gV29ya3NwYWNlIHRydXN0OiBpZiBhbiBlZGl0b3Igc2lnbmFscyBpdCBuZWVkcyB3b3Jrc3BhY2UgdHJ1c3Rcblx0XHRcdC8vIGJ1dCB0aGUgY3VycmVudCB3b3Jrc3BhY2UgaXMgdW50cnVzdGVkLCB3ZSBmYWxsYmFjayB0byBhIGdlbmVyaWNcblx0XHRcdC8vIGVkaXRvciBkZXNjcmlwdG9yIHRvIGluZGljYXRlIHRoaXMgYW4gZG8gTk9UIGxvYWQgdGhlIHJlZ2lzdGVyZWRcblx0XHRcdC8vIGVkaXRvci5cblx0XHRcdHJldHVybiBXb3Jrc3BhY2VUcnVzdFJlcXVpcmVkUGxhY2Vob2xkZXJFZGl0b3IuREVTQ1JJUFRPUjtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5lZGl0b3JQYW5lc1JlZ2lzdHJ5LmdldEVkaXRvclBhbmUoZWRpdG9yKSk7XG5cdH1cblxuXHRwcml2YXRlIGRvU2hvd0VkaXRvclBhbmUoZGVzY3JpcHRvcjogSUVkaXRvclBhbmVEZXNjcmlwdG9yKTogRWRpdG9yUGFuZSB7XG5cblx0XHQvLyBSZXR1cm4gZWFybHkgaWYgdGhlIGN1cnJlbnRseSBhY3RpdmUgZWRpdG9yIHBhbmUgY2FuIGhhbmRsZSB0aGUgaW5wdXRcblx0XHRpZiAodGhpcy5fYWN0aXZlRWRpdG9yUGFuZSAmJiBkZXNjcmlwdG9yLmRlc2NyaWJlcyh0aGlzLl9hY3RpdmVFZGl0b3JQYW5lKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZUVkaXRvclBhbmU7XG5cdFx0fVxuXG5cdFx0Ly8gSGlkZSBhY3RpdmUgb25lIGZpcnN0XG5cdFx0dGhpcy5kb0hpZGVBY3RpdmVFZGl0b3JQYW5lKCk7XG5cblx0XHQvLyBDcmVhdGUgZWRpdG9yIHBhbmVcblx0XHRjb25zdCBlZGl0b3JQYW5lID0gdGhpcy5kb0NyZWF0ZUVkaXRvclBhbmUoZGVzY3JpcHRvcik7XG5cblx0XHQvLyBTZXQgZWRpdG9yIGFzIGFjdGl2ZVxuXHRcdHRoaXMuZG9TZXRBY3RpdmVFZGl0b3JQYW5lKGVkaXRvclBhbmUpO1xuXG5cdFx0Ly8gU2hvdyBlZGl0b3Jcblx0XHRjb25zdCBjb250YWluZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChlZGl0b3JQYW5lLmdldENvbnRhaW5lcigpKTtcblx0XHR0aGlzLmVkaXRvclBhbmVzUGFyZW50LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0c2hvdyhjb250YWluZXIpO1xuXG5cdFx0Ly8gSW5kaWNhdGUgdG8gZWRpdG9yIHRoYXQgaXQgaXMgbm93IHZpc2libGVcblx0XHRlZGl0b3JQYW5lLnNldFZpc2libGUodHJ1ZSk7XG5cblx0XHQvLyBMYXlvdXRcblx0XHRpZiAodGhpcy5wYWdlUG9zaXRpb24pIHtcblx0XHRcdGVkaXRvclBhbmUubGF5b3V0KG5ldyBEaW1lbnNpb24odGhpcy5wYWdlUG9zaXRpb24ud2lkdGgsIHRoaXMucGFnZVBvc2l0aW9uLmhlaWdodCksIHsgdG9wOiB0aGlzLnBhZ2VQb3NpdGlvbi50b3AsIGxlZnQ6IHRoaXMucGFnZVBvc2l0aW9uLmxlZnQgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gQm91bmRhcnkgc2FzaGVzXG5cdFx0aWYgKHRoaXMuYm91bmRhcnlTYXNoZXMpIHtcblx0XHRcdGVkaXRvclBhbmUuc2V0Qm91bmRhcnlTYXNoZXModGhpcy5ib3VuZGFyeVNhc2hlcyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVkaXRvclBhbmU7XG5cdH1cblxuXHRwcml2YXRlIGRvQ3JlYXRlRWRpdG9yUGFuZShkZXNjcmlwdG9yOiBJRWRpdG9yUGFuZURlc2NyaXB0b3IpOiBFZGl0b3JQYW5lIHtcblxuXHRcdC8vIEluc3RhbnRpYXRlIGVkaXRvclxuXHRcdGNvbnN0IGVkaXRvclBhbmUgPSB0aGlzLmRvSW5zdGFudGlhdGVFZGl0b3JQYW5lKGRlc2NyaXB0b3IpO1xuXG5cdFx0Ly8gQ3JlYXRlIGVkaXRvciBjb250YWluZXIgYXMgbmVlZGVkXG5cdFx0aWYgKCFlZGl0b3JQYW5lLmdldENvbnRhaW5lcigpKSB7XG5cdFx0XHRjb25zdCBlZGl0b3JQYW5lQ29udGFpbmVyID0gJCgnLmVkaXRvci1pbnN0YW5jZScpO1xuXG5cdFx0XHQvLyBJdCBpcyBjcnVpY2lhbCB0byBhcHBlbmQgdGhlIGNvbnRhaW5lciB0byBpdHMgcGFyZW50IGJlZm9yZVxuXHRcdFx0Ly8gcGFzc2luZyBvbiB0byB0aGUgY3JlYXRlKCkgbWV0aG9kIG9mIHRoZSBwYW5lIHNvIHRoYXQgdGhlXG5cdFx0XHQvLyByaWdodCBgd2luZG93YCBjYW4gYmUgZGV0ZXJtaW5lZCBpbiBmbG9hdGluZyB3aW5kb3cgY2FzZXMuXG5cdFx0XHR0aGlzLmVkaXRvclBhbmVzUGFyZW50LmFwcGVuZENoaWxkKGVkaXRvclBhbmVDb250YWluZXIpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRlZGl0b3JQYW5lLmNyZWF0ZShlZGl0b3JQYW5lQ29udGFpbmVyKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdFx0Ly8gQXQgdGhpcyBwb2ludCB0aGUgZWRpdG9yIHBhbmUgY29udGFpbmVyIGlzIG5vdCBoZWFsdGh5XG5cdFx0XHRcdC8vIGFuZCBhcyBzdWNoLCB3ZSByZW1vdmUgaXQgZnJvbSB0aGUgcGFuZSBwYXJlbnQgYW5kIGhpZGVcblx0XHRcdFx0Ly8gaXQgc28gdGhhdCB3ZSBoYXZlIGEgY2hhbmNlIHRvIHNob3cgYW4gZXJyb3IgcGxhY2Vob2xkZXIuXG5cdFx0XHRcdC8vIE5vdCBkb2luZyBzbyB3b3VsZCByZXN1bHQgaW4gbXVsdGlwbGUgYC5lZGl0b3ItaW5zdGFuY2VgXG5cdFx0XHRcdC8vIGxpbmdlcmluZyBhcm91bmQgaW4gdGhlIERPTS5cblxuXHRcdFx0XHRlZGl0b3JQYW5lQ29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdFx0XHRoaWRlKGVkaXRvclBhbmVDb250YWluZXIpO1xuXG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0b3JQYW5lO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0luc3RhbnRpYXRlRWRpdG9yUGFuZShkZXNjcmlwdG9yOiBJRWRpdG9yUGFuZURlc2NyaXB0b3IpOiBFZGl0b3JQYW5lIHtcblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiBhbHJlYWR5IGluc3RhbnRpYXRlZFxuXHRcdGNvbnN0IGV4aXN0aW5nRWRpdG9yUGFuZSA9IHRoaXMuZWRpdG9yUGFuZXMuZmluZChlZGl0b3JQYW5lID0+IGRlc2NyaXB0b3IuZGVzY3JpYmVzKGVkaXRvclBhbmUpKTtcblx0XHRpZiAoZXhpc3RpbmdFZGl0b3JQYW5lKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3RpbmdFZGl0b3JQYW5lO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBpbnN0YW50aWF0ZSBuZXdcblx0XHRjb25zdCBlZGl0b3JQYW5lID0gdGhpcy5fcmVnaXN0ZXIoZGVzY3JpcHRvci5pbnN0YW50aWF0ZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLmdyb3VwVmlldykpO1xuXHRcdHRoaXMuZWRpdG9yUGFuZXMucHVzaChlZGl0b3JQYW5lKTtcblxuXHRcdHJldHVybiBlZGl0b3JQYW5lO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1NldEFjdGl2ZUVkaXRvclBhbmUoZWRpdG9yUGFuZTogRWRpdG9yUGFuZSB8IG51bGwpIHtcblx0XHR0aGlzLl9hY3RpdmVFZGl0b3JQYW5lID0gZWRpdG9yUGFuZTtcblxuXHRcdC8vIENsZWFyIG91dCBwcmV2aW91cyBhY3RpdmUgZWRpdG9yIHBhbmUgbGlzdGVuZXJzXG5cdFx0dGhpcy5hY3RpdmVFZGl0b3JQYW5lRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdC8vIExpc3RlbiB0byBlZGl0b3IgcGFuZSBjaGFuZ2VzXG5cdFx0aWYgKGVkaXRvclBhbmUpIHtcblx0XHRcdHRoaXMuYWN0aXZlRWRpdG9yUGFuZURpc3Bvc2FibGVzLmFkZChlZGl0b3JQYW5lLm9uRGlkQ2hhbmdlU2l6ZUNvbnN0cmFpbnRzKGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMuZmlyZShlKSkpO1xuXHRcdFx0dGhpcy5hY3RpdmVFZGl0b3JQYW5lRGlzcG9zYWJsZXMuYWRkKGVkaXRvclBhbmUub25EaWRGb2N1cygoKSA9PiB0aGlzLl9vbkRpZEZvY3VzLmZpcmUoKSkpO1xuXHRcdH1cblxuXHRcdC8vIEluZGljYXRlIHRoYXQgc2l6ZSBjb25zdHJhaW50cyBjb3VsZCBoYXZlIGNoYW5nZWQgZHVlIHRvIG5ldyBlZGl0b3Jcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNpemVDb25zdHJhaW50cy5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvU2V0SW5wdXQoZWRpdG9yUGFuZTogRWRpdG9yUGFuZSwgZWRpdG9yOiBFZGl0b3JJbnB1dCwgb3B0aW9uczogSUVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCk6IFByb21pc2U8eyBjaGFuZ2VkOiBib29sZWFuOyBjYW5jZWxsZWQ6IGJvb2xlYW4gfT4ge1xuXG5cdFx0Ly8gSWYgdGhlIGlucHV0IGRpZCBub3QgY2hhbmdlLCByZXR1cm4gZWFybHkgYW5kIG9ubHlcblx0XHQvLyBhcHBseSB0aGUgb3B0aW9ucyB1bmxlc3MgdGhlIG9wdGlvbnMgaW5zdHJ1Y3QgdXMgdG9cblx0XHQvLyBmb3JjZSBvcGVuIGl0IGV2ZW4gaWYgaXQgaXMgdGhlIHNhbWVcblx0XHRsZXQgaW5wdXRNYXRjaGVzID0gZWRpdG9yUGFuZS5pbnB1dD8ubWF0Y2hlcyhlZGl0b3IpO1xuXHRcdGlmIChpbnB1dE1hdGNoZXMgJiYgIW9wdGlvbnM/LmZvcmNlUmVsb2FkKSB7XG5cblx0XHRcdC8vIFdlIGhhdmUgdG8gYXdhaXQgYSBwZW5kaW5nIGBzZXRJbnB1dCgpYCBjYWxsIGZvciB0aGlzXG5cdFx0XHQvLyBwYW5lIGJlZm9yZSB3ZSBjYW4gY2FsbCBpbnRvIGBzZXRPcHRpb25zKClgLCBvdGhlcndpc2Vcblx0XHRcdC8vIHdlIHJpc2sgY2FsbGluZyB3aGVuIHRoZSBpbnB1dCBpcyBub3QgeWV0IGZ1bGx5IGFwcGxpZWQuXG5cdFx0XHRpZiAodGhpcy5tYXBFZGl0b3JQYW5lVG9QZW5kaW5nU2V0SW5wdXQuaGFzKGVkaXRvclBhbmUpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMubWFwRWRpdG9yUGFuZVRvUGVuZGluZ1NldElucHV0LmdldChlZGl0b3JQYW5lKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQXQgdGhpcyBwb2ludCwgdGhlIGlucHV0IG1pZ2h0IGhhdmUgY2hhbmdlZCwgc28gd2UgY2hlY2sgYWdhaW5cblx0XHRcdGlucHV0TWF0Y2hlcyA9IGVkaXRvclBhbmUuaW5wdXQ/Lm1hdGNoZXMoZWRpdG9yKTtcblx0XHRcdGlmIChpbnB1dE1hdGNoZXMpIHtcblx0XHRcdFx0ZWRpdG9yUGFuZS5zZXRPcHRpb25zKG9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyBjaGFuZ2VkOiBmYWxzZSwgY2FuY2VsbGVkOiAhaW5wdXRNYXRjaGVzIH07XG5cdFx0fVxuXG5cdFx0Ly8gU3RhcnQgYSBuZXcgZWRpdG9yIGlucHV0IG9wZXJhdGlvbiB0byByZXBvcnQgcHJvZ3Jlc3Ncblx0XHQvLyBhbmQgdG8gc3VwcG9ydCBjYW5jZWxsYXRpb24uIEFueSBuZXcgb3BlcmF0aW9uIHRoYXQgaXNcblx0XHQvLyBzdGFydGVkIHdpbGwgY2FuY2VsIHRoZSBwcmV2aW91cyBvbmUuXG5cdFx0Y29uc3Qgb3BlcmF0aW9uID0gdGhpcy5lZGl0b3JPcGVyYXRpb24uc3RhcnQodGhpcy5sYXlvdXRTZXJ2aWNlLmlzUmVzdG9yZWQoKSA/IDgwMCA6IDMyMDApO1xuXG5cdFx0bGV0IGNhbmNlbGxlZCA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cblx0XHRcdC8vIENsZWFyIHRoZSBjdXJyZW50IGlucHV0IGJlZm9yZSBzZXR0aW5nIG5ldyBpbnB1dFxuXHRcdFx0Ly8gVGhpcyBlbnN1cmVzIHRoYXQgYSBzbG93IGxvYWRpbmcgaW5wdXQgd2lsbCBub3Rcblx0XHRcdC8vIGJlIHZpc2libGUgZm9yIHRoZSBkdXJhdGlvbiBvZiB0aGUgbmV3IGlucHV0IHRvXG5cdFx0XHQvLyBsb2FkIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzQ2OTcpXG5cdFx0XHRlZGl0b3JQYW5lLmNsZWFySW5wdXQoKTtcblxuXHRcdFx0Ly8gU2V0IHRoZSBpbnB1dCB0byB0aGUgZWRpdG9yIHBhbmUgYW5kIGtlZXAgdHJhY2sgb2YgaXRcblx0XHRcdGNvbnN0IHBlbmRpbmdTZXRJbnB1dCA9IGVkaXRvclBhbmUuc2V0SW5wdXQoZWRpdG9yLCBvcHRpb25zLCBjb250ZXh0LCBvcGVyYXRpb24udG9rZW4pO1xuXHRcdFx0dGhpcy5tYXBFZGl0b3JQYW5lVG9QZW5kaW5nU2V0SW5wdXQuc2V0KGVkaXRvclBhbmUsIHBlbmRpbmdTZXRJbnB1dCk7XG5cdFx0XHRhd2FpdCBwZW5kaW5nU2V0SW5wdXQ7XG5cblx0XHRcdGlmICghb3BlcmF0aW9uLmlzQ3VycmVudCgpKSB7XG5cdFx0XHRcdGNhbmNlbGxlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICghb3BlcmF0aW9uLmlzQ3VycmVudCgpKSB7XG5cdFx0XHRcdGNhbmNlbGxlZCA9IHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKG9wZXJhdGlvbi5pc0N1cnJlbnQoKSkge1xuXHRcdFx0XHR0aGlzLm1hcEVkaXRvclBhbmVUb1BlbmRpbmdTZXRJbnB1dC5kZWxldGUoZWRpdG9yUGFuZSk7XG5cdFx0XHR9XG5cdFx0XHRvcGVyYXRpb24uc3RvcCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGNoYW5nZWQ6ICFpbnB1dE1hdGNoZXMsIGNhbmNlbGxlZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBkb0hpZGVBY3RpdmVFZGl0b3JQYW5lKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYWN0aXZlRWRpdG9yUGFuZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFN0b3AgYW55IHJ1bm5pbmcgb3BlcmF0aW9uXG5cdFx0dGhpcy5lZGl0b3JPcGVyYXRpb24uc3RvcCgpO1xuXG5cdFx0Ly8gSW5kaWNhdGUgdG8gZWRpdG9yIHBhbmUgYmVmb3JlIHJlbW92aW5nIHRoZSBlZGl0b3IgZnJvbVxuXHRcdC8vIHRoZSBET00gdG8gZ2l2ZSBhIGNoYW5jZSB0byBwZXJzaXN0IGNlcnRhaW4gc3RhdGUgdGhhdFxuXHRcdC8vIG1pZ2h0IGRlcGVuZCBvbiBzdGlsbCBiZWluZyB0aGUgYWN0aXZlIERPTSBlbGVtZW50LlxuXHRcdHRoaXMuc2FmZVJ1bigoKSA9PiB0aGlzLl9hY3RpdmVFZGl0b3JQYW5lPy5jbGVhcklucHV0KCkpO1xuXHRcdHRoaXMuc2FmZVJ1bigoKSA9PiB0aGlzLl9hY3RpdmVFZGl0b3JQYW5lPy5zZXRWaXNpYmxlKGZhbHNlKSk7XG5cblx0XHQvLyBDbGVhciBhbnkgcGVuZGluZyBzZXRJbnB1dCBwcm9taXNlXG5cdFx0dGhpcy5tYXBFZGl0b3JQYW5lVG9QZW5kaW5nU2V0SW5wdXQuZGVsZXRlKHRoaXMuX2FjdGl2ZUVkaXRvclBhbmUpO1xuXG5cdFx0Ly8gUmVtb3ZlIGVkaXRvciBwYW5lIGZyb20gcGFyZW50XG5cdFx0Y29uc3QgZWRpdG9yUGFuZUNvbnRhaW5lciA9IHRoaXMuX2FjdGl2ZUVkaXRvclBhbmUuZ2V0Q29udGFpbmVyKCk7XG5cdFx0aWYgKGVkaXRvclBhbmVDb250YWluZXIpIHtcblx0XHRcdGVkaXRvclBhbmVDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHRoaWRlKGVkaXRvclBhbmVDb250YWluZXIpO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIGFjdGl2ZSBlZGl0b3IgcGFuZVxuXHRcdHRoaXMuZG9TZXRBY3RpdmVFZGl0b3JQYW5lKG51bGwpO1xuXHR9XG5cblx0Y2xvc2VFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9hY3RpdmVFZGl0b3JQYW5lPy5pbnB1dCAmJiBlZGl0b3IubWF0Y2hlcyh0aGlzLl9hY3RpdmVFZGl0b3JQYW5lLmlucHV0KSkge1xuXHRcdFx0dGhpcy5kb0hpZGVBY3RpdmVFZGl0b3JQYW5lKCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zYWZlUnVuKCgpID0+IHRoaXMuX2FjdGl2ZUVkaXRvclBhbmU/LnNldFZpc2libGUodmlzaWJsZSkpO1xuXHR9XG5cblx0bGF5b3V0KHBhZ2VQb3NpdGlvbjogSURvbU5vZGVQYWdlUG9zaXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLnBhZ2VQb3NpdGlvbiA9IHBhZ2VQb3NpdGlvbjtcblxuXHRcdHRoaXMuc2FmZVJ1bigoKSA9PiB0aGlzLl9hY3RpdmVFZGl0b3JQYW5lPy5sYXlvdXQobmV3IERpbWVuc2lvbihwYWdlUG9zaXRpb24ud2lkdGgsIHBhZ2VQb3NpdGlvbi5oZWlnaHQpLCBwYWdlUG9zaXRpb24pKTtcblx0fVxuXG5cdHNldEJvdW5kYXJ5U2FzaGVzKHNhc2hlczogSUJvdW5kYXJ5U2FzaGVzKTogdm9pZCB7XG5cdFx0dGhpcy5ib3VuZGFyeVNhc2hlcyA9IHNhc2hlcztcblxuXHRcdHRoaXMuc2FmZVJ1bigoKSA9PiB0aGlzLl9hY3RpdmVFZGl0b3JQYW5lPy5zZXRCb3VuZGFyeVNhc2hlcyhzYXNoZXMpKTtcblx0fVxuXG5cdHByaXZhdGUgc2FmZVJ1bihmbjogKCkgPT4gdm9pZCk6IHZvaWQge1xuXG5cdFx0Ly8gV2UgZGVsZWdhdGUgbWFueSBjYWxscyB0byB0aGUgYWN0aXZlIGVkaXRvciBwYW5lIHdoaWNoXG5cdFx0Ly8gY2FuIGJlIGFueSBraW5kIG9mIGVkaXRvci4gV2UgbXVzdCBlbnN1cmUgdGhhdCBvdXIgY2FsbHNcblx0XHQvLyBkbyBub3QgdGhyb3csIGZvciBleGFtcGxlIGluIGBsYXlvdXQoKWAgYmVjYXVzZSB0aGF0IGNhblxuXHRcdC8vIG1lc3Mgd2l0aCB0aGUgZ3JpZCBsYXlvdXQuXG5cblx0XHR0cnkge1xuXHRcdFx0Zm4oKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxlQUFlO0FBQ3hCLE9BQU8sY0FBYztBQUNyQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsa0JBQWtCLHlCQUFpRSx5QkFBeUI7QUFFckgsU0FBUyxXQUFXLE1BQU0sTUFBNEIsWUFBWSxrQkFBa0IsZUFBZSxtQkFBbUIsU0FBUztBQUMvSCxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLCtCQUErQjtBQUV4QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUF3Qiw0QkFBNEI7QUFDN0QsU0FBMkIsK0JBQStCLHFDQUFpRTtBQUMzSCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLHdCQUF3RCwrQ0FBK0M7QUFDaEgsU0FBUyx3QkFBd0M7QUFDakQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBMEQ7QUFFbkUsU0FBUyxvQkFBb0I7QUFvQ3RCLElBQU0sY0FBTixjQUEwQixXQUFXO0FBQUEsRUErQjNDLFlBQ2tCLG1CQUNBLG1CQUNBLFdBQ3lCLGVBQ0Ysc0JBQ2hCLHVCQUMyQix1QkFDckIsWUFDRyxlQUNGLGFBQzlCO0FBQ0QsVUFBTTtBQVhXO0FBQ0E7QUFDQTtBQUN5QjtBQUNGO0FBRVc7QUFDckI7QUFDRztBQUNGO0FBckNoQztBQUFBLFNBQWlCLGNBQWMsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ2pFLFNBQVMsYUFBYSxLQUFLLFlBQVk7QUFFdkMsU0FBUSw4QkFB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
