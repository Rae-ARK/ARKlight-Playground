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
import * as DOM from "../../../../base/browser/dom.js";
import { toAction } from "../../../../base/common/actions.js";
import { timeout } from "../../../../base/common/async.js";
import { isWeb } from "../../../../base/common/platform.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { extname, isEqual } from "../../../../base/common/resources.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { localize } from "../../../../nls.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ByteSize, FileOperationResult, IFileService, TooLargeFileOperationError } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { DEFAULT_EDITOR_ASSOCIATION, EditorPaneSelectionChangeReason, EditorPaneSelectionCompareResult, EditorResourceAccessor, createEditorOpenError, createTooLargeFileError, isEditorOpenError } from "../../../common/editor.js";
import { SELECT_KERNEL_ID } from "./controller/coreActions.js";
import { INotebookEditorService } from "./services/notebookEditorService.js";
import { NotebooKernelActionViewItem } from "./viewParts/notebookKernelView.js";
import { CellKind, NOTEBOOK_EDITOR_ID, NotebookWorkingCopyTypeIdentifier } from "../common/notebookCommon.js";
import { NotebookEditorInput } from "../common/notebookEditorInput.js";
import { NotebookPerfMarks } from "../common/notebookPerformance.js";
import { GroupsOrder, IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { InstallRecommendedExtensionAction } from "../../extensions/browser/extensionsActions.js";
import { INotebookService } from "../common/notebookService.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { EnablementState } from "../../../services/extensionManagement/common/extensionManagement.js";
import { IWorkingCopyBackupService } from "../../../services/workingCopy/common/workingCopyBackup.js";
import { streamToBuffer } from "../../../../base/common/buffer.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
const NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY = "NotebookEditorViewState";
const NOTEBOOK_WEB_HOST_OPEN_CONFIRMED_KEY = "notebook.webHost.openConfirmed";
const confirmedWebHostNotebooks = /* @__PURE__ */ new Set();
let NotebookEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, _instantiationService, _storageService, _editorService, _editorGroupService, _notebookWidgetService, _contextKeyService, _fileService, configurationService, _editorProgressService, _notebookService, _extensionsWorkbenchService, _workingCopyBackupService, logService, _preferencesService, _dialogService, _environmentService) {
    super(NotebookEditor.ID, group, telemetryService, themeService, _storageService);
    this._instantiationService = _instantiationService;
    this._storageService = _storageService;
    this._editorService = _editorService;
    this._editorGroupService = _editorGroupService;
    this._notebookWidgetService = _notebookWidgetService;
    this._contextKeyService = _contextKeyService;
    this._fileService = _fileService;
    this._editorProgressService = _editorProgressService;
    this._notebookService = _notebookService;
    this._extensionsWorkbenchService = _extensionsWorkbenchService;
    this._workingCopyBackupService = _workingCopyBackupService;
    this.logService = logService;
    this._preferencesService = _preferencesService;
    this._dialogService = _dialogService;
    this._environmentService = _environmentService;
    this._groupListener = this._register(new DisposableStore());
    this._widgetDisposableStore = this._register(new DisposableStore());
    this._widget = { value: void 0 };
    this._inputListener = this._register(new MutableDisposable());
    // override onDidFocus and onDidBlur to be based on the NotebookEditorWidget element
    this._onDidFocusWidget = this._register(new Emitter());
    this._onDidBlurWidget = this._register(new Emitter());
    this._onDidChangeModel = this._register(new Emitter());
    this.onDidChangeModel = this._onDidChangeModel.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._onDidChangeScroll = this._register(new Emitter());
    this.onDidChangeScroll = this._onDidChangeScroll.event;
    this._editorMemento = this.getEditorMemento(_editorGroupService, configurationService, NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY);
    this._register(this._fileService.onDidChangeFileSystemProviderCapabilities((e) => this._onDidChangeFileSystemProvider(e.scheme)));
    this._register(this._fileService.onDidChangeFileSystemProviderRegistrations((e) => this._onDidChangeFileSystemProvider(e.scheme)));
  }
  get onDidFocus() {
    return this._onDidFocusWidget.event;
  }
  get onDidBlur() {
    return this._onDidBlurWidget.event;
  }
  _onDidChangeFileSystemProvider(scheme) {
    if (this.input instanceof NotebookEditorInput && this.input.resource?.scheme === scheme) {
      this._updateReadonly(this.input);
    }
  }
  _onDidChangeInputCapabilities(input) {
    if (this.input === input) {
      this._updateReadonly(input);
    }
  }
  _updateReadonly(input) {
    this._widget.value?.setOptions({ isReadOnly: !!input.isReadonly() });
  }
  get textModel() {
    return this._widget.value?.textModel;
  }
  get minimumWidth() {
    return 220;
  }
  get maximumWidth() {
    return Number.POSITIVE_INFINITY;
  }
  // these setters need to exist because this extends from EditorPane
  set minimumWidth(value) {
  }
  set maximumWidth(value) {
  }
  //#region Editor Core
  get scopedContextKeyService() {
    return this._widget.value?.scopedContextKeyService;
  }
  createEditor(parent) {
    this._rootElement = DOM.append(parent, DOM.$(".notebook-editor"));
    this._rootElement.id = `notebook-editor-element-${generateUuid()}`;
  }
  getActionViewItem(action, options) {
    if (action.id === SELECT_KERNEL_ID) {
      return this._register(this._instantiationService.createInstance(NotebooKernelActionViewItem, action, this, options));
    }
    return void 0;
  }
  getControl() {
    return this._widget.value;
  }
  setVisible(visible) {
    super.setVisible(visible);
    if (!visible) {
      this._widget.value?.onWillHide();
    }
  }
  setEditorVisible(visible) {
    super.setEditorVisible(visible);
    this._groupListener.clear();
    this._groupListener.add(this.group.onWillCloseEditor((e) => this._saveEditorViewState(e.editor)));
    this._groupListener.add(this.group.onDidModelChange(() => {
      if (this._editorGroupService.activeGroup !== this.group) {
        this._widget?.value?.updateEditorFocus();
      }
    }));
    if (!visible) {
      this._saveEditorViewState(this.input);
      if (this.input && this._widget.value) {
        this._widget.value.onWillHide();
      }
    }
  }
  focus() {
    super.focus();
    this._widget.value?.focus();
  }
  hasFocus() {
    const value = this._widget.value;
    if (!value) {
      return false;
    }
    return !!value && DOM.isAncestorOfActiveElement(value.getDomNode() || DOM.isAncestorOfActiveElement(value.getOverflowContainerDomNode()));
  }
  /**
   * When running serverless on the web (i.e. in the browser with no remote server
   * connected), prompt the user to confirm that they really want to open the notebook.
   * The confirmation is only shown the first time a given notebook is opened in the
   * session (so switching back to an already-open notebook does not re-prompt), and the
   * choice can be remembered for the whole workspace via a "Don't ask again" checkbox.
   */
  async _confirmOpenOnWebHost(input) {
    const isServerlessWeb = isWeb && !this._environmentService.remoteAuthority;
    if (!isServerlessWeb) {
      return;
    }
    if (this._storageService.getBoolean(NOTEBOOK_WEB_HOST_OPEN_CONFIRMED_KEY, StorageScope.WORKSPACE, false)) {
      return;
    }
    const resourceKey = input.resource.toString();
    if (confirmedWebHostNotebooks.has(resourceKey)) {
      return;
    }
    const { confirmed, checkboxChecked } = await this._dialogService.confirm({
      type: "warning",
      message: localize("notebook.webHost.confirm", "Do you trust the authors of this notebook?"),
      detail: localize("notebook.webHost.detail", "Notebooks can run code that has access to your browser session, including any signed-in accounts. Only open notebooks from authors you trust."),
      primaryButton: localize("notebook.webHost.open", "Open Notebook"),
      checkbox: { label: localize("notebook.webHost.remember", "Don't ask me again") }
    });
    if (!confirmed) {
      throw createEditorOpenError(localize("notebook.webHost.declined", "The notebook was not opened because its authors are not trusted."), [
        toAction({
          id: "workbench.notebook.action.openAsText",
          label: localize("notebookOpenAsText", "Open As Text"),
          run: async () => {
            this._editorService.openEditor({ resource: input.resource, options: { override: DEFAULT_EDITOR_ASSOCIATION.id, pinned: true } });
          }
        })
      ], { forceMessage: true });
    }
    confirmedWebHostNotebooks.add(resourceKey);
    if (checkboxChecked) {
      this._storageService.store(NOTEBOOK_WEB_HOST_OPEN_CONFIRMED_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
  }
  async setInput(input, options, context, token, noRetry) {
    await this._confirmOpenOnWebHost(input);
    try {
      let perfMarksCaptured = false;
      const fileOpenMonitor = timeout(1e4);
      fileOpenMonitor.then(() => {
        perfMarksCaptured = true;
        this._handlePerfMark(perf, input);
      });
      const perf = new NotebookPerfMarks();
      perf.mark("startTime");
      this._inputListener.value = input.onDidChangeCapabilities(() => this._onDidChangeInputCapabilities(input));
      this._widgetDisposableStore.clear();
      this._widget.value?.onWillHide();
      this._widget = this._instantiationService.invokeFunction(this._notebookWidgetService.retrieveWidget, this.group.id, input, void 0, this._pagePosition?.dimension, this.window);
      if (this._rootElement && this._widget.value.getDomNode()) {
        this._rootElement.setAttribute("aria-flowto", this._widget.value.getDomNode().id || "");
        DOM.setParentFlowTo(this._widget.value.getDomNode(), this._rootElement);
      }
      this._widgetDisposableStore.add(this._widget.value.onDidChangeModel(() => this._onDidChangeModel.fire()));
      this._widgetDisposableStore.add(this._widget.value.onDidChangeActiveCell(() => this._onDidChangeSelection.fire({ reason: EditorPaneSelectionChangeReason.USER })));
      if (this._pagePosition) {
        this._widget.value.layout(this._pagePosition.dimension, this._rootElement, this._pagePosition.position);
      }
      await super.setInput(input, options, context, token);
      const model = await input.resolve(options, perf);
      perf.mark("inputLoaded");
      if (token.isCancellationRequested) {
        return void 0;
      }
      if (!this._widget.value) {
        if (noRetry) {
          return void 0;
        }
        return this.setInput(input, options, context, token, true);
      }
      if (model === null) {
        const knownProvider = this._notebookService.getViewTypeProvider(input.viewType);
        if (!knownProvider) {
          throw new Error(localize("fail.noEditor", "Cannot open resource with notebook editor type '{0}', please check if you have the right extension installed and enabled.", input.viewType));
        }
        await this._extensionsWorkbenchService.whenInitialized;
        const extensionInfo = this._extensionsWorkbenchService.local.find((e) => e.identifier.id === knownProvider);
        throw createEditorOpenError(new Error(localize("fail.noEditor.extensionMissing", "Cannot open resource with notebook editor type '{0}', please check if you have the right extension installed and enabled.", input.viewType)), [
          toAction({
            id: "workbench.notebook.action.installOrEnableMissing",
            label: extensionInfo ? localize("notebookOpenEnableMissingViewType", "Enable extension for '{0}'", input.viewType) : localize("notebookOpenInstallMissingViewType", "Install extension for '{0}'", input.viewType),
            run: async () => {
              const d = this._notebookService.onAddViewType((viewType) => {
                if (viewType === input.viewType) {
                  this._editorService.openEditor({ resource: input.resource });
                  d.dispose();
                }
              });
              const extensionInfo2 = this._extensionsWorkbenchService.local.find((e) => e.identifier.id === knownProvider);
              try {
                if (extensionInfo2) {
                  await this._extensionsWorkbenchService.setEnablement(extensionInfo2, extensionInfo2.enablementState === EnablementState.DisabledWorkspace ? EnablementState.EnabledWorkspace : EnablementState.EnabledGlobally);
                } else {
                  await this._instantiationService.createInstance(InstallRecommendedExtensionAction, knownProvider).run();
                }
              } catch (ex) {
                this.logService.error(`Failed to install or enable extension ${knownProvider}`, ex);
                d.dispose();
              }
            }
          }),
          toAction({
            id: "workbench.notebook.action.openAsText",
            label: localize("notebookOpenAsText", "Open As Text"),
            run: async () => {
              const backup = await this._workingCopyBackupService.resolve({ resource: input.resource, typeId: NotebookWorkingCopyTypeIdentifier.create(input.viewType) });
              if (backup) {
                const contents = await streamToBuffer(backup.value);
                this._editorService.openEditor({ resource: void 0, contents: contents.toString() });
              } else {
                this._editorService.openEditor({ resource: input.resource, options: { override: DEFAULT_EDITOR_ASSOCIATION.id, pinned: true } });
              }
            }
          })
        ], { allowDialog: true });
      }
      this._widgetDisposableStore.add(model.notebook.onDidChangeContent(() => this._onDidChangeSelection.fire({ reason: EditorPaneSelectionChangeReason.EDIT })));
      const viewState = options?.viewState ?? this._loadNotebookEditorViewState(input);
      this._widget.value.setParentContextKeyService(this._contextKeyService);
      this._widget.value.setEditorProgressService(this._editorProgressService);
      await this._widget.value.setModel(model.notebook, viewState, perf);
      const isReadOnly = !!input.isReadonly();
      await this._widget.value.setOptions({ ...options, isReadOnly });
      this._widgetDisposableStore.add(this._widget.value.onDidFocusWidget(() => this._onDidFocusWidget.fire()));
      this._widgetDisposableStore.add(this._widget.value.onDidBlurWidget(() => this._onDidBlurWidget.fire()));
      this._widgetDisposableStore.add(this._editorGroupService.createEditorDropTarget(this._widget.value.getDomNode(), {
        containsGroup: (group) => this.group.id === group.id
      }));
      this._widgetDisposableStore.add(this._widget.value.onDidScroll(() => {
        this._onDidChangeScroll.fire();
      }));
      perf.mark("editorLoaded");
      fileOpenMonitor.cancel();
      if (perfMarksCaptured) {
        return;
      }
      this._handlePerfMark(perf, input, model.notebook);
      this._onDidChangeControl.fire();
    } catch (e) {
      this.logService.warn("NotebookEditorWidget#setInput failed", e);
      if (isEditorOpenError(e)) {
        throw e;
      }
      if (e.fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
        let message;
        if (e instanceof TooLargeFileOperationError) {
          message = localize("notebookTooLargeForHeapErrorWithSize", "The notebook is not displayed in the notebook editor because it is very large ({0}).", ByteSize.formatSize(e.size));
        } else {
          message = localize("notebookTooLargeForHeapErrorWithoutSize", "The notebook is not displayed in the notebook editor because it is very large.");
        }
        throw createTooLargeFileError(this.group, input, options, message, this._preferencesService);
      }
      const error = createEditorOpenError(e instanceof Error ? e : new Error(e ? e.message : ""), [
        toAction({
          id: "workbench.notebook.action.openInTextEditor",
          label: localize("notebookOpenInTextEditor", "Open in Text Editor"),
          run: async () => {
            const activeEditorPane = this._editorService.activeEditorPane;
            if (!activeEditorPane) {
              return;
            }
            const activeEditorResource = EditorResourceAccessor.getCanonicalUri(activeEditorPane.input);
            if (!activeEditorResource) {
              return;
            }
            if (activeEditorResource.toString() === input.resource?.toString()) {
              return this._editorService.openEditor({
                resource: activeEditorResource,
                options: {
                  override: DEFAULT_EDITOR_ASSOCIATION.id,
                  pinned: true
                  // new file gets pinned by default
                }
              });
            }
            return;
          }
        })
      ], { allowDialog: true });
      throw error;
    }
  }
  _handlePerfMark(perf, input, notebook) {
    const perfMarks = perf.value;
    const startTime = perfMarks["startTime"];
    const extensionActivated = perfMarks["extensionActivated"];
    const inputLoaded = perfMarks["inputLoaded"];
    const webviewCommLoaded = perfMarks["webviewCommLoaded"];
    const customMarkdownLoaded = perfMarks["customMarkdownLoaded"];
    const editorLoaded = perfMarks["editorLoaded"];
    let extensionActivationTimespan = -1;
    let inputLoadingTimespan = -1;
    let webviewCommLoadingTimespan = -1;
    let customMarkdownLoadingTimespan = -1;
    let editorLoadingTimespan = -1;
    if (startTime !== void 0 && extensionActivated !== void 0) {
      extensionActivationTimespan = extensionActivated - startTime;
      if (inputLoaded !== void 0) {
        inputLoadingTimespan = inputLoaded - extensionActivated;
      }
      if (webviewCommLoaded !== void 0) {
        webviewCommLoadingTimespan = webviewCommLoaded - extensionActivated;
      }
      if (customMarkdownLoaded !== void 0) {
        customMarkdownLoadingTimespan = customMarkdownLoaded - startTime;
      }
      if (editorLoaded !== void 0) {
        editorLoadingTimespan = editorLoaded - startTime;
      }
    }
    let codeCellCount = void 0;
    let mdCellCount = void 0;
    let outputCount = void 0;
    let outputBytes = void 0;
    let codeLength = void 0;
    let markdownLength = void 0;
    let notebookStatsLoaded = void 0;
    if (notebook) {
      const stopWatch = new StopWatch();
      for (const cell of notebook.cells) {
        if (cell.cellKind === CellKind.Code) {
          codeCellCount = (codeCellCount || 0) + 1;
          codeLength = (codeLength || 0) + cell.getTextLength();
          outputCount = (outputCount || 0) + cell.outputs.length;
          outputBytes = (outputBytes || 0) + cell.outputs.reduce((prev, cur) => prev + cur.outputs.reduce((size, item) => size + item.data.byteLength, 0), 0);
        } else {
          mdCellCount = (mdCellCount || 0) + 1;
          markdownLength = (codeLength || 0) + cell.getTextLength();
        }
      }
      notebookStatsLoaded = stopWatch.elapsed();
    }
    this.logService.trace(`[NotebookEditor] open notebook perf ${notebook?.uri.toString() ?? ""} - extensionActivation: ${extensionActivationTimespan}, inputLoad: ${inputLoadingTimespan}, webviewComm: ${webviewCommLoadingTimespan}, customMarkdown: ${customMarkdownLoadingTimespan}, editorLoad: ${editorLoadingTimespan}`);
    this.telemetryService.publicLog2("notebook/editorOpenPerf", {
      scheme: input.resource.scheme,
      ext: extname(input.resource),
      viewType: input.viewType,
      extensionActivated: extensionActivationTimespan,
      inputLoaded: inputLoadingTimespan,
      webviewCommLoaded: webviewCommLoadingTimespan,
      customMarkdownLoaded: customMarkdownLoadingTimespan,
      editorLoaded: editorLoadingTimespan,
      codeCellCount,
      mdCellCount,
      outputCount,
      outputBytes,
      codeLength,
      markdownLength,
      notebookStatsLoaded
    });
  }
  clearInput() {
    this._inputListener.clear();
    if (this._widget.value) {
      this._saveEditorViewState(this.input);
      this._widget.value.onWillHide();
    }
    super.clearInput();
  }
  setOptions(options) {
    this._widget.value?.setOptions(options);
    super.setOptions(options);
  }
  saveState() {
    this._saveEditorViewState(this.input);
    super.saveState();
  }
  getViewState() {
    const input = this.input;
    if (!(input instanceof NotebookEditorInput)) {
      return void 0;
    }
    this._saveEditorViewState(input);
    return this._loadNotebookEditorViewState(input);
  }
  getSelection() {
    if (this._widget.value) {
      const activeCell = this._widget.value.getActiveCell();
      if (activeCell) {
        const cellUri = activeCell.uri;
        return new NotebookEditorSelection(cellUri, activeCell.getSelections());
      }
    }
    return void 0;
  }
  getScrollPosition() {
    const widget = this.getControl();
    if (!widget) {
      throw new Error("Notebook widget has not yet been initialized");
    }
    return {
      scrollTop: widget.scrollTop,
      scrollLeft: 0
    };
  }
  setScrollPosition(scrollPosition) {
    const editor = this.getControl();
    if (!editor) {
      throw new Error("Control has not yet been initialized");
    }
    editor.setScrollTop(scrollPosition.scrollTop);
  }
  _saveEditorViewState(input) {
    if (this._widget.value && input instanceof NotebookEditorInput) {
      if (this._widget.value.isDisposed) {
        return;
      }
      const state = this._widget.value.getEditorViewState();
      this._editorMemento.saveEditorState(this.group, input.resource, state);
    }
  }
  _loadNotebookEditorViewState(input) {
    const result = this._editorMemento.loadEditorState(this.group, input.resource);
    if (result) {
      return result;
    }
    for (const group of this._editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
      if (group.activeEditorPane !== this && group.activeEditorPane instanceof NotebookEditor && group.activeEditor?.matches(input)) {
        return group.activeEditorPane._widget.value?.getEditorViewState();
      }
    }
    return;
  }
  layout(dimension, position) {
    this._rootElement.classList.toggle("mid-width", dimension.width < 1e3 && dimension.width >= 600);
    this._rootElement.classList.toggle("narrow-width", dimension.width < 600);
    this._pagePosition = { dimension, position };
    if (!this._widget.value || !(this.input instanceof NotebookEditorInput)) {
      return;
    }
    if (this.input.resource.toString() !== this.textModel?.uri.toString() && this._widget.value?.hasModel()) {
      return;
    }
    if (this.isVisible()) {
      this._widget.value.layout(dimension, this._rootElement, position);
    }
  }
  //#endregion
};
NotebookEditor.ID = NOTEBOOK_EDITOR_ID;
NotebookEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IEditorGroupsService),
  __decorateParam(7, INotebookEditorService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IFileService),
  __decorateParam(10, ITextResourceConfigurationService),
  __decorateParam(11, IEditorProgressService),
  __decorateParam(12, INotebookService),
  __decorateParam(13, IExtensionsWorkbenchService),
  __decorateParam(14, IWorkingCopyBackupService),
  __decorateParam(15, ILogService),
  __decorateParam(16, IPreferencesService),
  __decorateParam(17, IDialogService),
  __decorateParam(18, IWorkbenchEnvironmentService)
], NotebookEditor);
class NotebookEditorSelection {
  constructor(cellUri, selections) {
    this.cellUri = cellUri;
    this.selections = selections;
  }
  compare(other) {
    if (!(other instanceof NotebookEditorSelection)) {
      return EditorPaneSelectionCompareResult.DIFFERENT;
    }
    if (isEqual(this.cellUri, other.cellUri)) {
      return EditorPaneSelectionCompareResult.IDENTICAL;
    }
    return EditorPaneSelectionCompareResult.DIFFERENT;
  }
  restore(options) {
    const notebookOptions = {
      cellOptions: {
        resource: this.cellUri,
        options: {
          selection: this.selections[0]
        }
      }
    };
    Object.assign(notebookOptions, options);
    return notebookOptions;
  }
  log() {
    return this.cellUri.fragment;
  }
}
function isNotebookContainingCellEditor(editor, codeEditor) {
  if (editor?.getId() === NotebookEditor.ID) {
    const notebookWidget = editor.getControl();
    if (notebookWidget) {
      for (const [_, editor2] of notebookWidget.codeEditors) {
        if (editor2 === codeEditor) {
          return true;
        }
      }
    }
  }
  return false;
}
export {
  NotebookEditor,
  isNotebookContainingCellEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGV4dG5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQnl0ZVNpemUsIEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlLCBUb29MYXJnZUZpbGVPcGVyYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04sIEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24sIEVkaXRvclBhbmVTZWxlY3Rpb25Db21wYXJlUmVzdWx0LCBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBJRWRpdG9yTWVtZW50bywgSUVkaXRvck9wZW5Db250ZXh0LCBJRWRpdG9yUGFuZSwgSUVkaXRvclBhbmVTY3JvbGxQb3NpdGlvbiwgSUVkaXRvclBhbmVTZWxlY3Rpb24sIElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQsIElFZGl0b3JQYW5lV2l0aFNjcm9sbGluZywgY3JlYXRlRWRpdG9yT3BlbkVycm9yLCBjcmVhdGVUb29MYXJnZUZpbGVFcnJvciwgaXNFZGl0b3JPcGVuRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTRUxFQ1RfS0VSTkVMX0lEIH0gZnJvbSAnLi9jb250cm9sbGVyL2NvcmVBY3Rpb25zLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvck9wdGlvbnMsIElOb3RlYm9va0VkaXRvclBhbmUsIElOb3RlYm9va0VkaXRvclZpZXdTdGF0ZSB9IGZyb20gJy4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IElCb3Jyb3dWYWx1ZSwgSU5vdGVib29rRWRpdG9yU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvbm90ZWJvb2tFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi9ub3RlYm9va0VkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9vS2VybmVsQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuL3ZpZXdQYXJ0cy9ub3RlYm9va0tlcm5lbFZpZXcuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIE5PVEVCT09LX0VESVRPUl9JRCwgTm90ZWJvb2tXb3JraW5nQ29weVR5cGVJZGVudGlmaWVyIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9ySW5wdXQgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1BlcmZNYXJrcyB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va1BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IEdyb3Vwc09yZGVyLCBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSW5zdGFsbFJlY29tbWVuZGVkRXh0ZW5zaW9uQWN0aW9uIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnNBY3Rpb25zLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRW5hYmxlbWVudFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5QmFja3VwLmpzJztcbmltcG9ydCB7IHN0cmVhbVRvQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5cbmNvbnN0IE5PVEVCT09LX0VESVRPUl9WSUVXX1NUQVRFX1BSRUZFUkVOQ0VfS0VZID0gJ05vdGVib29rRWRpdG9yVmlld1N0YXRlJztcbmNvbnN0IE5PVEVCT09LX1dFQl9IT1NUX09QRU5fQ09ORklSTUVEX0tFWSA9ICdub3RlYm9vay53ZWJIb3N0Lm9wZW5Db25maXJtZWQnO1xuXG4vKipcbiAqIE5vdGVib29rIHJlc291cmNlcyB0aGF0IGhhdmUgYWxyZWFkeSBiZWVuIGNvbmZpcm1lZCBmb3Igb3BlbmluZyBpbiBhIHNlcnZlcmxlc3Mgd2ViXG4gKiBzZXNzaW9uLiBUaGlzIHByZXZlbnRzIHJlLXByb21wdGluZyB3aGVuIHRoZSB1c2VyIHN3aXRjaGVzIGJhY2sgdG8gYW4gYWxyZWFkeS1vcGVuXG4gKiBub3RlYm9vaywgd2hpbGUgc3RpbGwgZ2F0aW5nIHRoZSBmaXJzdCBvcGVuIG9mIGVhY2ggbm90ZWJvb2suXG4gKi9cbmNvbnN0IGNvbmZpcm1lZFdlYkhvc3ROb3RlYm9va3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tFZGl0b3IgZXh0ZW5kcyBFZGl0b3JQYW5lIGltcGxlbWVudHMgSU5vdGVib29rRWRpdG9yUGFuZSwgSUVkaXRvclBhbmVXaXRoU2Nyb2xsaW5nIHtcblx0c3RhdGljIHJlYWRvbmx5IElEOiBzdHJpbmcgPSBOT1RFQk9PS19FRElUT1JfSUQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yTWVtZW50bzogSUVkaXRvck1lbWVudG88SU5vdGVib29rRWRpdG9yVmlld1N0YXRlPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZ3JvdXBMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dpZGdldERpc3Bvc2FibGVTdG9yZTogRGlzcG9zYWJsZVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfd2lkZ2V0OiBJQm9ycm93VmFsdWU8Tm90ZWJvb2tFZGl0b3JXaWRnZXQ+ID0geyB2YWx1ZTogdW5kZWZpbmVkIH07XG5cdHByaXZhdGUgX3Jvb3RFbGVtZW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3BhZ2VQb3NpdGlvbj86IHsgcmVhZG9ubHkgZGltZW5zaW9uOiBET00uRGltZW5zaW9uOyByZWFkb25seSBwb3NpdGlvbjogRE9NLklEb21Qb3NpdGlvbiB9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0TGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Ly8gb3ZlcnJpZGUgb25EaWRGb2N1cyBhbmQgb25EaWRCbHVyIHRvIGJlIGJhc2VkIG9uIHRoZSBOb3RlYm9va0VkaXRvcldpZGdldCBlbGVtZW50XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRm9jdXNXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0b3ZlcnJpZGUgZ2V0IG9uRGlkRm9jdXMoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25EaWRGb2N1c1dpZGdldC5ldmVudDsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEJsdXJXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0b3ZlcnJpZGUgZ2V0IG9uRGlkQmx1cigpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLl9vbkRpZEJsdXJXaWRnZXQuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1vZGVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWw6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VNb2RlbC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VTY3JvbGwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTY3JvbGwgPSB0aGlzLl9vbkRpZENoYW5nZVNjcm9sbC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRncm91cDogSUVkaXRvckdyb3VwLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElOb3RlYm9va0VkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tXaWRnZXRTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclByb2dyZXNzU2VydmljZTogSUVkaXRvclByb2dyZXNzU2VydmljZSxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtpbmdDb3B5QmFja3VwU2VydmljZTogSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihOb3RlYm9va0VkaXRvci5JRCwgZ3JvdXAsIHRlbGVtZXRyeVNlcnZpY2UsIHRoZW1lU2VydmljZSwgX3N0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLl9lZGl0b3JNZW1lbnRvID0gdGhpcy5nZXRFZGl0b3JNZW1lbnRvPElOb3RlYm9va0VkaXRvclZpZXdTdGF0ZT4oX2VkaXRvckdyb3VwU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIE5PVEVCT09LX0VESVRPUl9WSUVXX1NUQVRFX1BSRUZFUkVOQ0VfS0VZKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzKGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXIoZS5zY2hlbWUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zKGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXIoZS5zY2hlbWUpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlcihzY2hlbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlucHV0IGluc3RhbmNlb2YgTm90ZWJvb2tFZGl0b3JJbnB1dCAmJiB0aGlzLmlucHV0LnJlc291cmNlPy5zY2hlbWUgPT09IHNjaGVtZSkge1xuXHRcdFx0dGhpcy5fdXBkYXRlUmVhZG9ubHkodGhpcy5pbnB1dCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VJbnB1dENhcGFiaWxpdGllcyhpbnB1dDogTm90ZWJvb2tFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlucHV0ID09PSBpbnB1dCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlUmVhZG9ubHkoaW5wdXQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVJlYWRvbmx5KGlucHV0OiBOb3RlYm9va0VkaXRvcklucHV0KTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LnZhbHVlPy5zZXRPcHRpb25zKHsgaXNSZWFkT25seTogISFpbnB1dC5pc1JlYWRvbmx5KCkgfSk7XG5cdH1cblxuXHRnZXQgdGV4dE1vZGVsKCk6IE5vdGVib29rVGV4dE1vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0LnZhbHVlPy50ZXh0TW9kZWw7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgbWluaW11bVdpZHRoKCk6IG51bWJlciB7IHJldHVybiAyMjA7IH1cblx0b3ZlcnJpZGUgZ2V0IG1heGltdW1XaWR0aCgpOiBudW1iZXIgeyByZXR1cm4gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZOyB9XG5cblx0Ly8gdGhlc2Ugc2V0dGVycyBuZWVkIHRvIGV4aXN0IGJlY2F1c2UgdGhpcyBleHRlbmRzIGZyb20gRWRpdG9yUGFuZVxuXHRvdmVycmlkZSBzZXQgbWluaW11bVdpZHRoKHZhbHVlOiBudW1iZXIpIHsgLypub29wKi8gfVxuXHRvdmVycmlkZSBzZXQgbWF4aW11bVdpZHRoKHZhbHVlOiBudW1iZXIpIHsgLypub29wKi8gfVxuXG5cdC8vI3JlZ2lvbiBFZGl0b3IgQ29yZVxuXHRvdmVycmlkZSBnZXQgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UoKTogSUNvbnRleHRLZXlTZXJ2aWNlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0LnZhbHVlPy5zY29wZWRDb250ZXh0S2V5U2VydmljZTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVFZGl0b3IocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3RFbGVtZW50ID0gRE9NLmFwcGVuZChwYXJlbnQsIERPTS4kKCcubm90ZWJvb2stZWRpdG9yJykpO1xuXHRcdHRoaXMuX3Jvb3RFbGVtZW50LmlkID0gYG5vdGVib29rLWVkaXRvci1lbGVtZW50LSR7Z2VuZXJhdGVVdWlkKCl9YDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEFjdGlvblZpZXdJdGVtKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyk6IElBY3Rpb25WaWV3SXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGFjdGlvbi5pZCA9PT0gU0VMRUNUX0tFUk5FTF9JRCkge1xuXHRcdFx0Ly8gdGhpcyBpcyBiZWluZyBkaXNwb3NlZCBieSB0aGUgY29uc3VtZXJcblx0XHRcdHJldHVybiB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9vS2VybmVsQWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgdGhpcywgb3B0aW9ucykpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0Q29udHJvbCgpOiBOb3RlYm9va0VkaXRvcldpZGdldCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC52YWx1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHN1cGVyLnNldFZpc2libGUodmlzaWJsZSk7XG5cdFx0aWYgKCF2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl93aWRnZXQudmFsdWU/Lm9uV2lsbEhpZGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlKTtcblx0XHR0aGlzLl9ncm91cExpc3RlbmVyLmNsZWFyKCk7XG5cdFx0dGhpcy5fZ3JvdXBMaXN0ZW5lci5hZGQodGhpcy5ncm91cC5vbldpbGxDbG9zZUVkaXRvcihlID0+IHRoaXMuX3NhdmVFZGl0b3JWaWV3U3RhdGUoZS5lZGl0b3IpKSk7XG5cdFx0dGhpcy5fZ3JvdXBMaXN0ZW5lci5hZGQodGhpcy5ncm91cC5vbkRpZE1vZGVsQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9lZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXAgIT09IHRoaXMuZ3JvdXApIHtcblx0XHRcdFx0dGhpcy5fd2lkZ2V0Py52YWx1ZT8udXBkYXRlRWRpdG9yRm9jdXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoIXZpc2libGUpIHtcblx0XHRcdHRoaXMuX3NhdmVFZGl0b3JWaWV3U3RhdGUodGhpcy5pbnB1dCk7XG5cdFx0XHRpZiAodGhpcy5pbnB1dCAmJiB0aGlzLl93aWRnZXQudmFsdWUpIHtcblx0XHRcdFx0Ly8gdGhlIHdpZGdldCBpcyBub3QgdHJhbnNmZXJlZCB0byBvdGhlciBlZGl0b3IgaW5wdXRzXG5cdFx0XHRcdHRoaXMuX3dpZGdldC52YWx1ZS5vbldpbGxIaWRlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKSB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHR0aGlzLl93aWRnZXQudmFsdWU/LmZvY3VzKCk7XG5cdH1cblxuXHRvdmVycmlkZSBoYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX3dpZGdldC52YWx1ZTtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICEhdmFsdWUgJiYgKERPTS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHZhbHVlLmdldERvbU5vZGUoKSB8fCBET00uaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCh2YWx1ZS5nZXRPdmVyZmxvd0NvbnRhaW5lckRvbU5vZGUoKSkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGVuIHJ1bm5pbmcgc2VydmVybGVzcyBvbiB0aGUgd2ViIChpLmUuIGluIHRoZSBicm93c2VyIHdpdGggbm8gcmVtb3RlIHNlcnZlclxuXHQgKiBjb25uZWN0ZWQpLCBwcm9tcHQgdGhlIHVzZXIgdG8gY29uZmlybSB0aGF0IHRoZXkgcmVhbGx5IHdhbnQgdG8gb3BlbiB0aGUgbm90ZWJvb2suXG5cdCAqIFRoZSBjb25maXJtYXRpb24gaXMgb25seSBzaG93biB0aGUgZmlyc3QgdGltZSBhIGdpdmVuIG5vdGVib29rIGlzIG9wZW5lZCBpbiB0aGVcblx0ICogc2Vzc2lvbiAoc28gc3dpdGNoaW5nIGJhY2sgdG8gYW4gYWxyZWFkeS1vcGVuIG5vdGVib29rIGRvZXMgbm90IHJlLXByb21wdCksIGFuZCB0aGVcblx0ICogY2hvaWNlIGNhbiBiZSByZW1lbWJlcmVkIGZvciB0aGUgd2hvbGUgd29ya3NwYWNlIHZpYSBhIFwiRG9uJ3QgYXNrIGFnYWluXCIgY2hlY2tib3guXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jb25maXJtT3Blbk9uV2ViSG9zdChpbnB1dDogTm90ZWJvb2tFZGl0b3JJbnB1dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGlzU2VydmVybGVzc1dlYiA9IGlzV2ViICYmICF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHRcdGlmICghaXNTZXJ2ZXJsZXNzV2ViKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oTk9URUJPT0tfV0VCX0hPU1RfT1BFTl9DT05GSVJNRURfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBmYWxzZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvdXJjZUtleSA9IGlucHV0LnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0aWYgKGNvbmZpcm1lZFdlYkhvc3ROb3RlYm9va3MuaGFzKHJlc291cmNlS2V5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgY29uZmlybWVkLCBjaGVja2JveENoZWNrZWQgfSA9IGF3YWl0IHRoaXMuX2RpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnbm90ZWJvb2sud2ViSG9zdC5jb25maXJtJywgXCJEbyB5b3UgdHJ1c3QgdGhlIGF1dGhvcnMgb2YgdGhpcyBub3RlYm9vaz9cIiksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdub3RlYm9vay53ZWJIb3N0LmRldGFpbCcsIFwiTm90ZWJvb2tzIGNhbiBydW4gY29kZSB0aGF0IGhhcyBhY2Nlc3MgdG8geW91ciBicm93c2VyIHNlc3Npb24sIGluY2x1ZGluZyBhbnkgc2lnbmVkLWluIGFjY291bnRzLiBPbmx5IG9wZW4gbm90ZWJvb2tzIGZyb20gYXV0aG9ycyB5b3UgdHJ1c3QuXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ25vdGVib29rLndlYkhvc3Qub3BlbicsIFwiT3BlbiBOb3RlYm9va1wiKSxcblx0XHRcdGNoZWNrYm94OiB7IGxhYmVsOiBsb2NhbGl6ZSgnbm90ZWJvb2sud2ViSG9zdC5yZW1lbWJlcicsIFwiRG9uJ3QgYXNrIG1lIGFnYWluXCIpIH1cblx0XHR9KTtcblxuXHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHR0aHJvdyBjcmVhdGVFZGl0b3JPcGVuRXJyb3IobG9jYWxpemUoJ25vdGVib29rLndlYkhvc3QuZGVjbGluZWQnLCBcIlRoZSBub3RlYm9vayB3YXMgbm90IG9wZW5lZCBiZWNhdXNlIGl0cyBhdXRob3JzIGFyZSBub3QgdHJ1c3RlZC5cIiksIFtcblx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLm5vdGVib29rLmFjdGlvbi5vcGVuQXNUZXh0JywgbGFiZWw6IGxvY2FsaXplKCdub3RlYm9va09wZW5Bc1RleHQnLCBcIk9wZW4gQXMgVGV4dFwiKSwgcnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogaW5wdXQucmVzb3VyY2UsIG9wdGlvbnM6IHsgb3ZlcnJpZGU6IERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLmlkLCBwaW5uZWQ6IHRydWUgfSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pXG5cdFx0XHRdLCB7IGZvcmNlTWVzc2FnZTogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHRjb25maXJtZWRXZWJIb3N0Tm90ZWJvb2tzLmFkZChyZXNvdXJjZUtleSk7XG5cblx0XHRpZiAoY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShOT1RFQk9PS19XRUJfSE9TVF9PUEVOX0NPTkZJUk1FRF9LRVksIHRydWUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQoaW5wdXQ6IE5vdGVib29rRWRpdG9ySW5wdXQsIG9wdGlvbnM6IElOb3RlYm9va0VkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBub1JldHJ5PzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2NvbmZpcm1PcGVuT25XZWJIb3N0KGlucHV0KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRsZXQgcGVyZk1hcmtzQ2FwdHVyZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGZpbGVPcGVuTW9uaXRvciA9IHRpbWVvdXQoMTAwMDApO1xuXHRcdFx0ZmlsZU9wZW5Nb25pdG9yLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRwZXJmTWFya3NDYXB0dXJlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZVBlcmZNYXJrKHBlcmYsIGlucHV0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBwZXJmID0gbmV3IE5vdGVib29rUGVyZk1hcmtzKCk7XG5cdFx0XHRwZXJmLm1hcmsoJ3N0YXJ0VGltZScpO1xuXG5cdFx0XHR0aGlzLl9pbnB1dExpc3RlbmVyLnZhbHVlID0gaW5wdXQub25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VJbnB1dENhcGFiaWxpdGllcyhpbnB1dCkpO1xuXG5cdFx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuY2xlYXIoKTtcblxuXHRcdFx0Ly8gdGhlcmUgY3VycmVudGx5IGlzIGEgd2lkZ2V0IHdoaWNoIHdlIHN0aWxsIG93biBzb1xuXHRcdFx0Ly8gd2UgbmVlZCB0byBoaWRlIGl0IGJlZm9yZSBnZXR0aW5nIGEgbmV3IHdpZGdldFxuXHRcdFx0dGhpcy5fd2lkZ2V0LnZhbHVlPy5vbldpbGxIaWRlKCk7XG5cblx0XHRcdHRoaXMuX3dpZGdldCA9IDxJQm9ycm93VmFsdWU8Tm90ZWJvb2tFZGl0b3JXaWRnZXQ+PnRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHRoaXMuX25vdGVib29rV2lkZ2V0U2VydmljZS5yZXRyaWV2ZVdpZGdldCwgdGhpcy5ncm91cC5pZCwgaW5wdXQsIHVuZGVmaW5lZCwgdGhpcy5fcGFnZVBvc2l0aW9uPy5kaW1lbnNpb24sIHRoaXMud2luZG93KTtcblxuXHRcdFx0aWYgKHRoaXMuX3Jvb3RFbGVtZW50ICYmIHRoaXMuX3dpZGdldC52YWx1ZSEuZ2V0RG9tTm9kZSgpKSB7XG5cdFx0XHRcdHRoaXMuX3Jvb3RFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1mbG93dG8nLCB0aGlzLl93aWRnZXQudmFsdWUhLmdldERvbU5vZGUoKS5pZCB8fCAnJyk7XG5cdFx0XHRcdERPTS5zZXRQYXJlbnRGbG93VG8odGhpcy5fd2lkZ2V0LnZhbHVlIS5nZXREb21Ob2RlKCksIHRoaXMuX3Jvb3RFbGVtZW50KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl93aWRnZXQudmFsdWUhLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VNb2RlbC5maXJlKCkpKTtcblx0XHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fd2lkZ2V0LnZhbHVlIS5vbkRpZENoYW5nZUFjdGl2ZUNlbGwoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZmlyZSh7IHJlYXNvbjogRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbi5VU0VSIH0pKSk7XG5cblx0XHRcdGlmICh0aGlzLl9wYWdlUG9zaXRpb24pIHtcblx0XHRcdFx0dGhpcy5fd2lkZ2V0LnZhbHVlIS5sYXlvdXQodGhpcy5fcGFnZVBvc2l0aW9uLmRpbWVuc2lvbiwgdGhpcy5fcm9vdEVsZW1lbnQsIHRoaXMuX3BhZ2VQb3NpdGlvbi5wb3NpdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIG9ubHkgbm93IGBzZXRJbnB1dGAgYW5kIHlpZWxkL2F3YWl0LiB0aGlzIGlzIEFGVEVSIHRoZSBhY3R1YWwgd2lkZ2V0IGlzIHJlYWR5LiBUaGlzIGlzIHZlcnkgaW1wb3J0YW50XG5cdFx0XHQvLyBzbyB0aGF0IG90aGVycyBzeW5jaHJvbm91c2x5IHJlY2VpdmUgYSBub3RlYm9vayBlZGl0b3Igd2l0aCB0aGUgY29ycmVjdCB3aWRnZXQgYmVpbmcgc2V0XG5cdFx0XHRhd2FpdCBzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCBpbnB1dC5yZXNvbHZlKG9wdGlvbnMsIHBlcmYpO1xuXHRcdFx0cGVyZi5tYXJrKCdpbnB1dExvYWRlZCcpO1xuXG5cdFx0XHQvLyBDaGVjayBmb3IgY2FuY2VsbGF0aW9uXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGhlIHdpZGdldCBoYXMgYmVlbiB0YWtlbiBhd2F5IGFnYWluLiBUaGlzIGNhbiBoYXBwZW4gd2hlbiB0aGUgdGFiIGhhcyBiZWVuIGNsb3NlZCB3aGlsZVxuXHRcdFx0Ly8gbG9hZGluZyB3YXMgaW4gcHJvZ3Jlc3MsIGluIHBhcnRpY3VsYXIgd2hlbiBvcGVuIHRoZSBzYW1lIHJlc291cmNlIGFzIGRpZmZlcmVudCB2aWV3IHR5cGUuXG5cdFx0XHQvLyBXaGVuIHRoaXMgaGFwcGVuLCByZXRyeSBvbmNlXG5cdFx0XHRpZiAoIXRoaXMuX3dpZGdldC52YWx1ZSkge1xuXHRcdFx0XHRpZiAobm9SZXRyeSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXMuc2V0SW5wdXQoaW5wdXQsIG9wdGlvbnMsIGNvbnRleHQsIHRva2VuLCB0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG1vZGVsID09PSBudWxsKSB7XG5cdFx0XHRcdGNvbnN0IGtub3duUHJvdmlkZXIgPSB0aGlzLl9ub3RlYm9va1NlcnZpY2UuZ2V0Vmlld1R5cGVQcm92aWRlcihpbnB1dC52aWV3VHlwZSk7XG5cblx0XHRcdFx0aWYgKCFrbm93blByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdmYWlsLm5vRWRpdG9yJywgXCJDYW5ub3Qgb3BlbiByZXNvdXJjZSB3aXRoIG5vdGVib29rIGVkaXRvciB0eXBlICd7MH0nLCBwbGVhc2UgY2hlY2sgaWYgeW91IGhhdmUgdGhlIHJpZ2h0IGV4dGVuc2lvbiBpbnN0YWxsZWQgYW5kIGVuYWJsZWQuXCIsIGlucHV0LnZpZXdUeXBlKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS53aGVuSW5pdGlhbGl6ZWQ7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkluZm8gPSB0aGlzLl9leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbC5maW5kKGUgPT4gZS5pZGVudGlmaWVyLmlkID09PSBrbm93blByb3ZpZGVyKTtcblxuXHRcdFx0XHR0aHJvdyBjcmVhdGVFZGl0b3JPcGVuRXJyb3IobmV3IEVycm9yKGxvY2FsaXplKCdmYWlsLm5vRWRpdG9yLmV4dGVuc2lvbk1pc3NpbmcnLCBcIkNhbm5vdCBvcGVuIHJlc291cmNlIHdpdGggbm90ZWJvb2sgZWRpdG9yIHR5cGUgJ3swfScsIHBsZWFzZSBjaGVjayBpZiB5b3UgaGF2ZSB0aGUgcmlnaHQgZXh0ZW5zaW9uIGluc3RhbGxlZCBhbmQgZW5hYmxlZC5cIiwgaW5wdXQudmlld1R5cGUpKSwgW1xuXHRcdFx0XHRcdHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLm5vdGVib29rLmFjdGlvbi5pbnN0YWxsT3JFbmFibGVNaXNzaW5nJywgbGFiZWw6XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbkluZm9cblx0XHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdub3RlYm9va09wZW5FbmFibGVNaXNzaW5nVmlld1R5cGUnLCBcIkVuYWJsZSBleHRlbnNpb24gZm9yICd7MH0nXCIsIGlucHV0LnZpZXdUeXBlKVxuXHRcdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ25vdGVib29rT3Blbkluc3RhbGxNaXNzaW5nVmlld1R5cGUnLCBcIkluc3RhbGwgZXh0ZW5zaW9uIGZvciAnezB9J1wiLCBpbnB1dC52aWV3VHlwZSlcblx0XHRcdFx0XHRcdCwgcnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGQgPSB0aGlzLl9ub3RlYm9va1NlcnZpY2Uub25BZGRWaWV3VHlwZSh2aWV3VHlwZSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHZpZXdUeXBlID09PSBpbnB1dC52aWV3VHlwZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gc2VyaWFsaXplciBpcyByZWdpc3RlcmVkLCB0cnkgdG8gb3BlbiBhZ2FpblxuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IGlucHV0LnJlc291cmNlIH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0ZC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSW5mbyA9IHRoaXMuX2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbmQoZSA9PiBlLmlkZW50aWZpZXIuaWQgPT09IGtub3duUHJvdmlkZXIpO1xuXG5cdFx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGV4dGVuc2lvbkluZm8pIHtcblx0XHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnNldEVuYWJsZW1lbnQoZXh0ZW5zaW9uSW5mbywgZXh0ZW5zaW9uSW5mby5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSA/IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlIDogRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxSZWNvbW1lbmRlZEV4dGVuc2lvbkFjdGlvbiwga25vd25Qcm92aWRlcikucnVuKCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9IGNhdGNoIChleCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRmFpbGVkIHRvIGluc3RhbGwgb3IgZW5hYmxlIGV4dGVuc2lvbiAke2tub3duUHJvdmlkZXJ9YCwgZXgpO1xuXHRcdFx0XHRcdFx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gubm90ZWJvb2suYWN0aW9uLm9wZW5Bc1RleHQnLCBsYWJlbDogbG9jYWxpemUoJ25vdGVib29rT3BlbkFzVGV4dCcsIFwiT3BlbiBBcyBUZXh0XCIpLCBydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgYmFja3VwID0gYXdhaXQgdGhpcy5fd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLnJlc29sdmUoeyByZXNvdXJjZTogaW5wdXQucmVzb3VyY2UsIHR5cGVJZDogTm90ZWJvb2tXb3JraW5nQ29weVR5cGVJZGVudGlmaWVyLmNyZWF0ZShpbnB1dC52aWV3VHlwZSkgfSk7XG5cdFx0XHRcdFx0XHRcdGlmIChiYWNrdXApIHtcblx0XHRcdFx0XHRcdFx0XHQvLyB3aXRoIGEgYmFja3VwIHByZXNlbnQsIHdlIG11c3QgcmVzb3J0IHRvIG9wZW5pbmcgdGhlIGJhY2t1cCBjb250ZW50c1xuXHRcdFx0XHRcdFx0XHRcdC8vIGFzIHVudGl0bGVkIHRleHQgZmlsZSB0byBub3Qgc2hvdyB0aGUgd3JvbmcgZGF0YSB0byB0aGUgdXNlclxuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgc3RyZWFtVG9CdWZmZXIoYmFja3VwLnZhbHVlKTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdW5kZWZpbmVkLCBjb250ZW50czogY29udGVudHMudG9TdHJpbmcoKSB9KTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHQvLyB3aXRob3V0IGEgYmFja3VwIHByZXNlbnQsIHdlIGNhbiBvcGVuIHRoZSBvcmlnaW5hbCByZXNvdXJjZVxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBpbnB1dC5yZXNvdXJjZSwgb3B0aW9uczogeyBvdmVycmlkZTogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQsIHBpbm5lZDogdHJ1ZSB9IH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0XSwgeyBhbGxvd0RpYWxvZzogdHJ1ZSB9KTtcblxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKG1vZGVsLm5vdGVib29rLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKHsgcmVhc29uOiBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLkVESVQgfSkpKTtcblxuXHRcdFx0Y29uc3Qgdmlld1N0YXRlID0gb3B0aW9ucz8udmlld1N0YXRlID8/IHRoaXMuX2xvYWROb3RlYm9va0VkaXRvclZpZXdTdGF0ZShpbnB1dCk7XG5cblx0XHRcdC8vIFdlIG1pZ2h0IGJlIG1vdmluZyB0aGUgbm90ZWJvb2sgd2lkZ2V0IGJldHdlZW4gZ3JvdXBzLCBhbmQgdGhlc2Ugc2VydmljZXMgYXJlIHRpZWQgdG8gdGhlIGdyb3VwXG5cdFx0XHR0aGlzLl93aWRnZXQudmFsdWUuc2V0UGFyZW50Q29udGV4dEtleVNlcnZpY2UodGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnZhbHVlLnNldEVkaXRvclByb2dyZXNzU2VydmljZSh0aGlzLl9lZGl0b3JQcm9ncmVzc1NlcnZpY2UpO1xuXG5cdFx0XHRhd2FpdCB0aGlzLl93aWRnZXQudmFsdWUuc2V0TW9kZWwobW9kZWwubm90ZWJvb2ssIHZpZXdTdGF0ZSwgcGVyZik7XG5cdFx0XHRjb25zdCBpc1JlYWRPbmx5ID0gISFpbnB1dC5pc1JlYWRvbmx5KCk7XG5cdFx0XHRhd2FpdCB0aGlzLl93aWRnZXQudmFsdWUuc2V0T3B0aW9ucyh7IC4uLm9wdGlvbnMsIGlzUmVhZE9ubHkgfSk7XG5cdFx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX3dpZGdldC52YWx1ZS5vbkRpZEZvY3VzV2lkZ2V0KCgpID0+IHRoaXMuX29uRGlkRm9jdXNXaWRnZXQuZmlyZSgpKSk7XG5cdFx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX3dpZGdldC52YWx1ZS5vbkRpZEJsdXJXaWRnZXQoKCkgPT4gdGhpcy5fb25EaWRCbHVyV2lkZ2V0LmZpcmUoKSkpO1xuXG5cdFx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2VkaXRvckdyb3VwU2VydmljZS5jcmVhdGVFZGl0b3JEcm9wVGFyZ2V0KHRoaXMuX3dpZGdldC52YWx1ZS5nZXREb21Ob2RlKCksIHtcblx0XHRcdFx0Y29udGFpbnNHcm91cDogKGdyb3VwKSA9PiB0aGlzLmdyb3VwLmlkID09PSBncm91cC5pZFxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX3dpZGdldC52YWx1ZS5vbkRpZFNjcm9sbCgoKSA9PiB7IHRoaXMuX29uRGlkQ2hhbmdlU2Nyb2xsLmZpcmUoKTsgfSkpO1xuXG5cdFx0XHRwZXJmLm1hcmsoJ2VkaXRvckxvYWRlZCcpO1xuXG5cdFx0XHRmaWxlT3Blbk1vbml0b3IuY2FuY2VsKCk7XG5cdFx0XHRpZiAocGVyZk1hcmtzQ2FwdHVyZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9oYW5kbGVQZXJmTWFyayhwZXJmLCBpbnB1dCwgbW9kZWwubm90ZWJvb2spO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250cm9sLmZpcmUoKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignTm90ZWJvb2tFZGl0b3JXaWRnZXQjc2V0SW5wdXQgZmFpbGVkJywgZSk7XG5cdFx0XHRpZiAoaXNFZGl0b3JPcGVuRXJyb3IoZSkpIHtcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSGFuZGxlIGNhc2Ugd2hlcmUgYSBmaWxlIGlzIHRvbyBsYXJnZSB0byBvcGVuIHdpdGhvdXQgY29uZmlybWF0aW9uXG5cdFx0XHRpZiAoKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZSkuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1RPT19MQVJHRSkge1xuXHRcdFx0XHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFRvb0xhcmdlRmlsZU9wZXJhdGlvbkVycm9yKSB7XG5cdFx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdub3RlYm9va1Rvb0xhcmdlRm9ySGVhcEVycm9yV2l0aFNpemUnLCBcIlRoZSBub3RlYm9vayBpcyBub3QgZGlzcGxheWVkIGluIHRoZSBub3RlYm9vayBlZGl0b3IgYmVjYXVzZSBpdCBpcyB2ZXJ5IGxhcmdlICh7MH0pLlwiLCBCeXRlU2l6ZS5mb3JtYXRTaXplKGUuc2l6ZSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnbm90ZWJvb2tUb29MYXJnZUZvckhlYXBFcnJvcldpdGhvdXRTaXplJywgXCJUaGUgbm90ZWJvb2sgaXMgbm90IGRpc3BsYXllZCBpbiB0aGUgbm90ZWJvb2sgZWRpdG9yIGJlY2F1c2UgaXQgaXMgdmVyeSBsYXJnZS5cIik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aHJvdyBjcmVhdGVUb29MYXJnZUZpbGVFcnJvcih0aGlzLmdyb3VwLCBpbnB1dCwgb3B0aW9ucywgbWVzc2FnZSwgdGhpcy5fcHJlZmVyZW5jZXNTZXJ2aWNlKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZXJyb3IgPSBjcmVhdGVFZGl0b3JPcGVuRXJyb3IoZSBpbnN0YW5jZW9mIEVycm9yID8gZSA6IG5ldyBFcnJvcigoZSA/IGUubWVzc2FnZSA6ICcnKSksIFtcblx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLm5vdGVib29rLmFjdGlvbi5vcGVuSW5UZXh0RWRpdG9yJywgbGFiZWw6IGxvY2FsaXplKCdub3RlYm9va09wZW5JblRleHRFZGl0b3InLCBcIk9wZW4gaW4gVGV4dCBFZGl0b3JcIiksIHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdFx0XHRcdGlmICghYWN0aXZlRWRpdG9yUGFuZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvclJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCk7XG5cdFx0XHRcdFx0XHRpZiAoIWFjdGl2ZUVkaXRvclJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKGFjdGl2ZUVkaXRvclJlc291cmNlLnRvU3RyaW5nKCkgPT09IGlucHV0LnJlc291cmNlPy50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0XHRcdC8vIFJlcGxhY2UgdGhlIGN1cnJlbnQgZWRpdG9yIHdpdGggdGhlIHRleHQgZWRpdG9yXG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdFx0XHRcdHJlc291cmNlOiBhY3RpdmVFZGl0b3JSZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRvdmVycmlkZTogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRwaW5uZWQ6IHRydWUgLy8gbmV3IGZpbGUgZ2V0cyBwaW5uZWQgYnkgZGVmYXVsdFxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pXG5cdFx0XHRdLCB7IGFsbG93RGlhbG9nOiB0cnVlIH0pO1xuXG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVQZXJmTWFyayhwZXJmOiBOb3RlYm9va1BlcmZNYXJrcywgaW5wdXQ6IE5vdGVib29rRWRpdG9ySW5wdXQsIG5vdGVib29rPzogTm90ZWJvb2tUZXh0TW9kZWwpIHtcblx0XHRjb25zdCBwZXJmTWFya3MgPSBwZXJmLnZhbHVlO1xuXG5cdFx0dHlwZSBXb3JrYmVuY2hOb3RlYm9va09wZW5DbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAncmVib3JuaXgnO1xuXHRcdFx0Y29tbWVudDogJ1RoZSBub3RlYm9vayBmaWxlIG9wZW4gbWV0cmljcy4gVXNlZCB0byBnZXQgYSBiZXR0ZXIgdW5kZXJzdGFuZGluZyBvZiB0aGUgcGVyZm9ybWFuY2Ugb2Ygbm90ZWJvb2sgZmlsZSBvcGVuaW5nJztcblx0XHRcdHNjaGVtZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0ZpbGUgc3lzdGVtIHByb3ZpZGVyIHNjaGVtZSBmb3IgdGhlIG5vdGVib29rIHJlc291cmNlJyB9O1xuXHRcdFx0ZXh0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRmlsZSBleHRlbnNpb24gZm9yIHRoZSBub3RlYm9vayByZXNvdXJjZScgfTtcblx0XHRcdHZpZXdUeXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHZpZXcgdHlwZSBvZiB0aGUgbm90ZWJvb2sgZWRpdG9yJyB9O1xuXHRcdFx0ZXh0ZW5zaW9uQWN0aXZhdGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRXh0ZW5zaW9uIGFjdGl2YXRpb24gdGltZSBmb3IgdGhlIHJlc291cmNlIG9wZW5pbmcnIH07XG5cdFx0XHRpbnB1dExvYWRlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0VkaXRvciBJbnB1dCBsb2FkaW5nIHRpbWUgZm9yIHRoZSByZXNvdXJjZSBvcGVuaW5nJyB9O1xuXHRcdFx0d2Vidmlld0NvbW1Mb2FkZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXZWJ2aWV3IGluaXRpYWxpemF0aW9uIHRpbWUgZm9yIHRoZSByZXNvdXJjZSBvcGVuaW5nJyB9O1xuXHRcdFx0Y3VzdG9tTWFya2Rvd25Mb2FkZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdDdXN0b20gbWFya2Rvd24gbG9hZGluZyB0aW1lIGZvciB0aGUgcmVzb3VyY2Ugb3BlbmluZycgfTtcblx0XHRcdGVkaXRvckxvYWRlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ092ZXJhbGwgZWRpdG9yIGxvYWRpbmcgdGltZSBmb3IgdGhlIHJlc291cmNlIG9wZW5pbmcnIH07XG5cdFx0XHRjb2RlQ2VsbENvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVG90YWwgbnVtYmVyIG9mIGNvZGUgY2VsbCcgfTtcblx0XHRcdG1kQ2VsbENvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVG90YWwgbnVtYmVyIG9mIG1hcmtkb3duIGNlbGwnIH07XG5cdFx0XHRvdXRwdXRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RvdGFsIG51bWJlciBvZiBjZWxsIG91dHB1dHMnIH07XG5cdFx0XHRvdXRwdXRCeXRlczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RvdGFsIG51bWJlciBvZiBieXRlcyBmb3IgYWxsIG91dHB1dHMnIH07XG5cdFx0XHRjb2RlTGVuZ3RoOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnTGVuZ3RoIG9mIHRleHQgaW4gYWxsIGNvZGUgY2VsbHMnIH07XG5cdFx0XHRtYXJrZG93bkxlbmd0aDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0xlbmd0aCBvZiB0ZXh0IGluIGFsbCBtYXJrZG93biBjZWxscycgfTtcblx0XHRcdG5vdGVib29rU3RhdHNMb2FkZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaW1lIGZvciBnZW5lcmF0aW5nIHRoZSBub3RlYm9vayBsZXZlbCBpbmZvcm1hdGlvbiBmb3IgdGVsZW1ldHJ5JyB9O1xuXHRcdH07XG5cblx0XHR0eXBlIFdvcmtiZW5jaE5vdGVib29rT3BlbkV2ZW50ID0ge1xuXHRcdFx0c2NoZW1lOiBzdHJpbmc7XG5cdFx0XHRleHQ6IHN0cmluZztcblx0XHRcdHZpZXdUeXBlOiBzdHJpbmc7XG5cdFx0XHRleHRlbnNpb25BY3RpdmF0ZWQ6IG51bWJlcjtcblx0XHRcdGlucHV0TG9hZGVkOiBudW1iZXI7XG5cdFx0XHR3ZWJ2aWV3Q29tbUxvYWRlZDogbnVtYmVyO1xuXHRcdFx0Y3VzdG9tTWFya2Rvd25Mb2FkZWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdGVkaXRvckxvYWRlZDogbnVtYmVyO1xuXHRcdFx0Y29kZUNlbGxDb3VudDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0bWRDZWxsQ291bnQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdG91dHB1dENvdW50OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHRvdXRwdXRCeXRlczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29kZUxlbmd0aDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0bWFya2Rvd25MZW5ndGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdG5vdGVib29rU3RhdHNMb2FkZWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RhcnRUaW1lID0gcGVyZk1hcmtzWydzdGFydFRpbWUnXTtcblx0XHRjb25zdCBleHRlbnNpb25BY3RpdmF0ZWQgPSBwZXJmTWFya3NbJ2V4dGVuc2lvbkFjdGl2YXRlZCddO1xuXHRcdGNvbnN0IGlucHV0TG9hZGVkID0gcGVyZk1hcmtzWydpbnB1dExvYWRlZCddO1xuXHRcdGNvbnN0IHdlYnZpZXdDb21tTG9hZGVkID0gcGVyZk1hcmtzWyd3ZWJ2aWV3Q29tbUxvYWRlZCddO1xuXHRcdGNvbnN0IGN1c3RvbU1hcmtkb3duTG9hZGVkID0gcGVyZk1hcmtzWydjdXN0b21NYXJrZG93bkxvYWRlZCddO1xuXHRcdGNvbnN0IGVkaXRvckxvYWRlZCA9IHBlcmZNYXJrc1snZWRpdG9yTG9hZGVkJ107XG5cblx0XHRsZXQgZXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzcGFuID0gLTE7XG5cdFx0bGV0IGlucHV0TG9hZGluZ1RpbWVzcGFuID0gLTE7XG5cdFx0bGV0IHdlYnZpZXdDb21tTG9hZGluZ1RpbWVzcGFuID0gLTE7XG5cdFx0bGV0IGN1c3RvbU1hcmtkb3duTG9hZGluZ1RpbWVzcGFuID0gLTE7XG5cdFx0bGV0IGVkaXRvckxvYWRpbmdUaW1lc3BhbiA9IC0xO1xuXG5cdFx0aWYgKHN0YXJ0VGltZSAhPT0gdW5kZWZpbmVkICYmIGV4dGVuc2lvbkFjdGl2YXRlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRleHRlbnNpb25BY3RpdmF0aW9uVGltZXNwYW4gPSBleHRlbnNpb25BY3RpdmF0ZWQgLSBzdGFydFRpbWU7XG5cblx0XHRcdGlmIChpbnB1dExvYWRlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlucHV0TG9hZGluZ1RpbWVzcGFuID0gaW5wdXRMb2FkZWQgLSBleHRlbnNpb25BY3RpdmF0ZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh3ZWJ2aWV3Q29tbUxvYWRlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHdlYnZpZXdDb21tTG9hZGluZ1RpbWVzcGFuID0gd2Vidmlld0NvbW1Mb2FkZWQgLSBleHRlbnNpb25BY3RpdmF0ZWQ7XG5cblx0XHRcdH1cblxuXHRcdFx0aWYgKGN1c3RvbU1hcmtkb3duTG9hZGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y3VzdG9tTWFya2Rvd25Mb2FkaW5nVGltZXNwYW4gPSBjdXN0b21NYXJrZG93bkxvYWRlZCAtIHN0YXJ0VGltZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVkaXRvckxvYWRlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGVkaXRvckxvYWRpbmdUaW1lc3BhbiA9IGVkaXRvckxvYWRlZCAtIHN0YXJ0VGltZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBOb3RlYm9vayBpbmZvcm1hdGlvblxuXHRcdGxldCBjb2RlQ2VsbENvdW50OiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IG1kQ2VsbENvdW50OiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IG91dHB1dENvdW50OiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IG91dHB1dEJ5dGVzOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGNvZGVMZW5ndGg6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgbWFya2Rvd25MZW5ndGg6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgbm90ZWJvb2tTdGF0c0xvYWRlZDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChub3RlYm9vaykge1xuXHRcdFx0Y29uc3Qgc3RvcFdhdGNoID0gbmV3IFN0b3BXYXRjaCgpO1xuXHRcdFx0Zm9yIChjb25zdCBjZWxsIG9mIG5vdGVib29rLmNlbGxzKSB7XG5cdFx0XHRcdGlmIChjZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5Db2RlKSB7XG5cdFx0XHRcdFx0Y29kZUNlbGxDb3VudCA9IChjb2RlQ2VsbENvdW50IHx8IDApICsgMTtcblx0XHRcdFx0XHRjb2RlTGVuZ3RoID0gKGNvZGVMZW5ndGggfHwgMCkgKyBjZWxsLmdldFRleHRMZW5ndGgoKTtcblx0XHRcdFx0XHRvdXRwdXRDb3VudCA9IChvdXRwdXRDb3VudCB8fCAwKSArIGNlbGwub3V0cHV0cy5sZW5ndGg7XG5cdFx0XHRcdFx0b3V0cHV0Qnl0ZXMgPSAob3V0cHV0Qnl0ZXMgfHwgMCkgKyBjZWxsLm91dHB1dHMucmVkdWNlKChwcmV2LCBjdXIpID0+IHByZXYgKyBjdXIub3V0cHV0cy5yZWR1Y2UoKHNpemUsIGl0ZW0pID0+IHNpemUgKyBpdGVtLmRhdGEuYnl0ZUxlbmd0aCwgMCksIDApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG1kQ2VsbENvdW50ID0gKG1kQ2VsbENvdW50IHx8IDApICsgMTtcblx0XHRcdFx0XHRtYXJrZG93bkxlbmd0aCA9IChjb2RlTGVuZ3RoIHx8IDApICsgY2VsbC5nZXRUZXh0TGVuZ3RoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdG5vdGVib29rU3RhdHNMb2FkZWQgPSBzdG9wV2F0Y2guZWxhcHNlZCgpO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW05vdGVib29rRWRpdG9yXSBvcGVuIG5vdGVib29rIHBlcmYgJHtub3RlYm9vaz8udXJpLnRvU3RyaW5nKCkgPz8gJyd9IC0gZXh0ZW5zaW9uQWN0aXZhdGlvbjogJHtleHRlbnNpb25BY3RpdmF0aW9uVGltZXNwYW59LCBpbnB1dExvYWQ6ICR7aW5wdXRMb2FkaW5nVGltZXNwYW59LCB3ZWJ2aWV3Q29tbTogJHt3ZWJ2aWV3Q29tbUxvYWRpbmdUaW1lc3Bhbn0sIGN1c3RvbU1hcmtkb3duOiAke2N1c3RvbU1hcmtkb3duTG9hZGluZ1RpbWVzcGFufSwgZWRpdG9yTG9hZDogJHtlZGl0b3JMb2FkaW5nVGltZXNwYW59YCk7XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hOb3RlYm9va09wZW5FdmVudCwgV29ya2JlbmNoTm90ZWJvb2tPcGVuQ2xhc3NpZmljYXRpb24+KCdub3RlYm9vay9lZGl0b3JPcGVuUGVyZicsIHtcblx0XHRcdHNjaGVtZTogaW5wdXQucmVzb3VyY2Uuc2NoZW1lLFxuXHRcdFx0ZXh0OiBleHRuYW1lKGlucHV0LnJlc291cmNlKSxcblx0XHRcdHZpZXdUeXBlOiBpbnB1dC52aWV3VHlwZSxcblx0XHRcdGV4dGVuc2lvbkFjdGl2YXRlZDogZXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzcGFuLFxuXHRcdFx0aW5wdXRMb2FkZWQ6IGlucHV0TG9hZGluZ1RpbWVzcGFuLFxuXHRcdFx0d2Vidmlld0NvbW1Mb2FkZWQ6IHdlYnZpZXdDb21tTG9hZGluZ1RpbWVzcGFuLFxuXHRcdFx0Y3VzdG9tTWFya2Rvd25Mb2FkZWQ6IGN1c3RvbU1hcmtkb3duTG9hZGluZ1RpbWVzcGFuLFxuXHRcdFx0ZWRpdG9yTG9hZGVkOiBlZGl0b3JMb2FkaW5nVGltZXNwYW4sXG5cdFx0XHRjb2RlQ2VsbENvdW50LFxuXHRcdFx0bWRDZWxsQ291bnQsXG5cdFx0XHRvdXRwdXRDb3VudCxcblx0XHRcdG91dHB1dEJ5dGVzLFxuXHRcdFx0Y29kZUxlbmd0aCxcblx0XHRcdG1hcmtkb3duTGVuZ3RoLFxuXHRcdFx0bm90ZWJvb2tTdGF0c0xvYWRlZFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgY2xlYXJJbnB1dCgpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnB1dExpc3RlbmVyLmNsZWFyKCk7XG5cblx0XHRpZiAodGhpcy5fd2lkZ2V0LnZhbHVlKSB7XG5cdFx0XHR0aGlzLl9zYXZlRWRpdG9yVmlld1N0YXRlKHRoaXMuaW5wdXQpO1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnZhbHVlLm9uV2lsbEhpZGUoKTtcblx0XHR9XG5cdFx0c3VwZXIuY2xlYXJJbnB1dCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0T3B0aW9ucyhvcHRpb25zOiBJTm90ZWJvb2tFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LnZhbHVlPy5zZXRPcHRpb25zKG9wdGlvbnMpO1xuXHRcdHN1cGVyLnNldE9wdGlvbnMob3B0aW9ucyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2F2ZVN0YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NhdmVFZGl0b3JWaWV3U3RhdGUodGhpcy5pbnB1dCk7XG5cdFx0c3VwZXIuc2F2ZVN0YXRlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRWaWV3U3RhdGUoKTogSU5vdGVib29rRWRpdG9yVmlld1N0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpbnB1dCA9IHRoaXMuaW5wdXQ7XG5cdFx0aWYgKCEoaW5wdXQgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvcklucHV0KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLl9zYXZlRWRpdG9yVmlld1N0YXRlKGlucHV0KTtcblx0XHRyZXR1cm4gdGhpcy5fbG9hZE5vdGVib29rRWRpdG9yVmlld1N0YXRlKGlucHV0KTtcblx0fVxuXG5cdGdldFNlbGVjdGlvbigpOiBJRWRpdG9yUGFuZVNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX3dpZGdldC52YWx1ZSkge1xuXHRcdFx0Y29uc3QgYWN0aXZlQ2VsbCA9IHRoaXMuX3dpZGdldC52YWx1ZS5nZXRBY3RpdmVDZWxsKCk7XG5cdFx0XHRpZiAoYWN0aXZlQ2VsbCkge1xuXHRcdFx0XHRjb25zdCBjZWxsVXJpID0gYWN0aXZlQ2VsbC51cmk7XG5cdFx0XHRcdHJldHVybiBuZXcgTm90ZWJvb2tFZGl0b3JTZWxlY3Rpb24oY2VsbFVyaSwgYWN0aXZlQ2VsbC5nZXRTZWxlY3Rpb25zKCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRTY3JvbGxQb3NpdGlvbigpOiBJRWRpdG9yUGFuZVNjcm9sbFBvc2l0aW9uIHtcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmdldENvbnRyb2woKTtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOb3RlYm9vayB3aWRnZXQgaGFzIG5vdCB5ZXQgYmVlbiBpbml0aWFsaXplZCcpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRzY3JvbGxUb3A6IHdpZGdldC5zY3JvbGxUb3AsXG5cdFx0XHRzY3JvbGxMZWZ0OiAwLFxuXHRcdH07XG5cdH1cblxuXHRzZXRTY3JvbGxQb3NpdGlvbihzY3JvbGxQb3NpdGlvbjogSUVkaXRvclBhbmVTY3JvbGxQb3NpdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuZ2V0Q29udHJvbCgpO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvbnRyb2wgaGFzIG5vdCB5ZXQgYmVlbiBpbml0aWFsaXplZCcpO1xuXHRcdH1cblxuXHRcdGVkaXRvci5zZXRTY3JvbGxUb3Aoc2Nyb2xsUG9zaXRpb24uc2Nyb2xsVG9wKTtcblx0fVxuXG5cdHByaXZhdGUgX3NhdmVFZGl0b3JWaWV3U3RhdGUoaW5wdXQ6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dpZGdldC52YWx1ZSAmJiBpbnB1dCBpbnN0YW5jZW9mIE5vdGVib29rRWRpdG9ySW5wdXQpIHtcblx0XHRcdGlmICh0aGlzLl93aWRnZXQudmFsdWUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fd2lkZ2V0LnZhbHVlLmdldEVkaXRvclZpZXdTdGF0ZSgpO1xuXHRcdFx0dGhpcy5fZWRpdG9yTWVtZW50by5zYXZlRWRpdG9yU3RhdGUodGhpcy5ncm91cCwgaW5wdXQucmVzb3VyY2UsIHN0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9sb2FkTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUoaW5wdXQ6IE5vdGVib29rRWRpdG9ySW5wdXQpOiBJTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2VkaXRvck1lbWVudG8ubG9hZEVkaXRvclN0YXRlKHRoaXMuZ3JvdXAsIGlucHV0LnJlc291cmNlKTtcblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHQvLyB3aGVuIHdlIGRvbid0IGhhdmUgYSB2aWV3IHN0YXRlIGZvciB0aGUgZ3JvdXAvaW5wdXQtdHVwbGUgdGhlbiB3ZSB0cnkgdG8gdXNlIGFuIGV4aXN0aW5nXG5cdFx0Ly8gZWRpdG9yIGZvciB0aGUgc2FtZSByZXNvdXJjZS5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuX2VkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpKSB7XG5cdFx0XHRpZiAoZ3JvdXAuYWN0aXZlRWRpdG9yUGFuZSAhPT0gdGhpcyAmJiBncm91cC5hY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgTm90ZWJvb2tFZGl0b3IgJiYgZ3JvdXAuYWN0aXZlRWRpdG9yPy5tYXRjaGVzKGlucHV0KSkge1xuXHRcdFx0XHRyZXR1cm4gZ3JvdXAuYWN0aXZlRWRpdG9yUGFuZS5fd2lkZ2V0LnZhbHVlPy5nZXRFZGl0b3JWaWV3U3RhdGUoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogRE9NLkRpbWVuc2lvbiwgcG9zaXRpb246IERPTS5JRG9tUG9zaXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9yb290RWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdtaWQtd2lkdGgnLCBkaW1lbnNpb24ud2lkdGggPCAxMDAwICYmIGRpbWVuc2lvbi53aWR0aCA+PSA2MDApO1xuXHRcdHRoaXMuX3Jvb3RFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ25hcnJvdy13aWR0aCcsIGRpbWVuc2lvbi53aWR0aCA8IDYwMCk7XG5cdFx0dGhpcy5fcGFnZVBvc2l0aW9uID0geyBkaW1lbnNpb24sIHBvc2l0aW9uIH07XG5cblx0XHRpZiAoIXRoaXMuX3dpZGdldC52YWx1ZSB8fCAhKHRoaXMuaW5wdXQgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvcklucHV0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlucHV0LnJlc291cmNlLnRvU3RyaW5nKCkgIT09IHRoaXMudGV4dE1vZGVsPy51cmkudG9TdHJpbmcoKSAmJiB0aGlzLl93aWRnZXQudmFsdWU/Lmhhc01vZGVsKCkpIHtcblx0XHRcdC8vIGlucHV0IGFuZCB3aWRnZXQgbWlzbWF0Y2hcblx0XHRcdC8vIHRoaXMgaGFwcGVucyB3aGVuXG5cdFx0XHQvLyAxLiBvcGVuIGRvY3VtZW50IEEsIHBpbiB0aGUgZG9jdW1lbnRcblx0XHRcdC8vIDIuIG9wZW4gZG9jdW1lbnQgQlxuXHRcdFx0Ly8gMy4gY2xvc2UgZG9jdW1lbnQgQlxuXHRcdFx0Ly8gNC4gYSBsYXlvdXQgaXMgdHJpZ2dlcmVkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdHRoaXMuX3dpZGdldC52YWx1ZS5sYXlvdXQoZGltZW5zaW9uLCB0aGlzLl9yb290RWxlbWVudCwgcG9zaXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuXG5jbGFzcyBOb3RlYm9va0VkaXRvclNlbGVjdGlvbiBpbXBsZW1lbnRzIElFZGl0b3JQYW5lU2VsZWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNlbGxVcmk6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdXG5cdCkgeyB9XG5cblx0Y29tcGFyZShvdGhlcjogSUVkaXRvclBhbmVTZWxlY3Rpb24pOiBFZGl0b3JQYW5lU2VsZWN0aW9uQ29tcGFyZVJlc3VsdCB7XG5cdFx0aWYgKCEob3RoZXIgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvclNlbGVjdGlvbikpIHtcblx0XHRcdHJldHVybiBFZGl0b3JQYW5lU2VsZWN0aW9uQ29tcGFyZVJlc3VsdC5ESUZGRVJFTlQ7XG5cdFx0fVxuXG5cdFx0aWYgKGlzRXF1YWwodGhpcy5jZWxsVXJpLCBvdGhlci5jZWxsVXJpKSkge1xuXHRcdFx0cmV0dXJuIEVkaXRvclBhbmVTZWxlY3Rpb25Db21wYXJlUmVzdWx0LklERU5USUNBTDtcblx0XHR9XG5cblx0XHRyZXR1cm4gRWRpdG9yUGFuZVNlbGVjdGlvbkNvbXBhcmVSZXN1bHQuRElGRkVSRU5UO1xuXHR9XG5cblx0cmVzdG9yZShvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyk6IElOb3RlYm9va0VkaXRvck9wdGlvbnMge1xuXHRcdGNvbnN0IG5vdGVib29rT3B0aW9uczogSU5vdGVib29rRWRpdG9yT3B0aW9ucyA9IHtcblx0XHRcdGNlbGxPcHRpb25zOiB7XG5cdFx0XHRcdHJlc291cmNlOiB0aGlzLmNlbGxVcmksXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRzZWxlY3Rpb246IHRoaXMuc2VsZWN0aW9uc1swXVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdE9iamVjdC5hc3NpZ24obm90ZWJvb2tPcHRpb25zLCBvcHRpb25zKTtcblxuXHRcdHJldHVybiBub3RlYm9va09wdGlvbnM7XG5cdH1cblxuXHRsb2coKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5jZWxsVXJpLmZyYWdtZW50O1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc05vdGVib29rQ29udGFpbmluZ0NlbGxFZGl0b3IoZWRpdG9yOiBJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZCwgY29kZUVkaXRvcjogSUNvZGVFZGl0b3IpOiBib29sZWFuIHtcblx0aWYgKGVkaXRvcj8uZ2V0SWQoKSA9PT0gTm90ZWJvb2tFZGl0b3IuSUQpIHtcblx0XHRjb25zdCBub3RlYm9va1dpZGdldCA9IGVkaXRvci5nZXRDb250cm9sKCkgYXMgTm90ZWJvb2tFZGl0b3JXaWRnZXQ7XG5cdFx0aWYgKG5vdGVib29rV2lkZ2V0KSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtfLCBlZGl0b3JdIG9mIG5vdGVib29rV2lkZ2V0LmNvZGVFZGl0b3JzKSB7XG5cdFx0XHRcdGlmIChlZGl0b3IgPT09IGNvZGVFZGl0b3IpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUVyQixTQUFrQixnQkFBZ0I7QUFDbEMsU0FBUyxlQUFlO0FBRXhCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsaUJBQWlCLHlCQUF5QjtBQUNuRCxTQUFTLFNBQVMsZUFBZTtBQUVqQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHlDQUF5QztBQUNsRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLFVBQThCLHFCQUFxQixjQUFjLGtDQUFrQztBQUM1RyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQjtBQUU5QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDRCQUE0QixpQ0FBaUMsa0NBQWtDLHdCQUFxTCx1QkFBdUIseUJBQXlCLHlCQUF5QjtBQUV0VyxTQUFTLHdCQUF3QjtBQUVqQyxTQUF1Qiw4QkFBOEI7QUFFckQsU0FBUyxtQ0FBbUM7QUFFNUMsU0FBUyxVQUFVLG9CQUFvQix5Q0FBeUM7QUFDaEYsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUEyQiw0QkFBNEI7QUFDaEUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxpQkFBaUI7QUFHMUIsTUFBTSw0Q0FBNEM7QUFDbEQsTUFBTSx1Q0FBdUM7QUFPN0MsTUFBTSw0QkFBNEIsb0JBQUksSUFBWTtBQUczQyxJQUFNLGlCQUFOLGNBQTZCLFdBQW9FO0FBQUEsRUEyQnZHLFlBQ0MsT0FDbUIsa0JBQ0osY0FDeUIsdUJBQ04saUJBQ0QsZ0JBQ00scUJBQ0Usd0JBQ0osb0JBQ04sY0FDSSxzQkFDTSx3QkFDTixrQkFDVyw2QkFDRiwyQkFDZCxZQUNRLHFCQUNMLGdCQUNjLHFCQUM5QztBQUNELFVBQU0sZUFBZSxJQUFJLE9BQU8sa0JBQWtCLGNBQWMsZUFBZTtBQWpCdkM7QUFDTjtBQUNEO0FBQ007QUFDRTtBQUNKO0FBQ047QUFFVTtBQUNOO0FBQ1c7QUFDRjtBQUNkO0FBQ1E7QUFDTDtBQUNjO0FBMUNoRCxTQUFpQixpQkFBaUIsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFDdEUsU0FBaUIseUJBQTBDLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBQy9GLFNBQVEsVUFBOEMsRUFBRSxPQUFPLE9BQVU7QUFJekUsU0FBaUIsaUJBQWlCLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBR3hFO0FBQUEsU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUV2RSxTQUFpQixtQkFBbUIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBR3RFLFNBQWlCLG9CQUFvQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDdkUsU0FBUyxtQkFBZ0MsS0FBSyxrQkFBa0I7QUFFaEUsU0FBaUIsd0JBQXdCLEtBQUssVUFBVSxJQUFJLFFBQXlDLENBQUM7QUFDdEcsU0FBUyx1QkFBdUIsS0FBSyxzQkFBc0I7QUFFM0QsU0FBbUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUMxRSxTQUFTLG9CQUFvQixLQUFLLG1CQUFtQjtBQXdCcEQsU0FBSyxpQkFBaUIsS0FBSyxpQkFBMkMscUJBQXFCLHNCQUFzQix5Q0FBeUM7QUFFMUosU0FBSyxVQUFVLEtBQUssYUFBYSwwQ0FBMEMsT0FBSyxLQUFLLCtCQUErQixFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQzlILFNBQUssVUFBVSxLQUFLLGFBQWEsMkNBQTJDLE9BQUssS0FBSywrQkFBK0IsRUFBRSxNQUFNLENBQUMsQ0FBQztBQUFBLEVBQ2hJO0FBQUEsRUF2Q0EsSUFBYSxhQUEwQjtBQUFFLFdBQU8sS0FBSyxrQkFBa0I7QUFBQSxFQUFPO0FBQUEsRUFFOUUsSUFBYSxZQUF5QjtBQUFFLFdBQU8sS0FBSyxpQkFBaUI7QUFBQSxFQUFPO0FBQUEsRUF1Q3BFLCtCQUErQixRQUFzQjtBQUM1RCxRQUFJLEtBQUssaUJBQWlCLHVCQUF1QixLQUFLLE1BQU0sVUFBVSxXQUFXLFFBQVE7QUFDeEYsV0FBSyxnQkFBZ0IsS0FBSyxLQUFLO0FBQUEsSUFDaEM7QUFBQSxFQUNEO0FBQUEsRUFFUSw4QkFBOEIsT0FBa0M7QUFDdkUsUUFBSSxLQUFLLFVBQVUsT0FBTztBQUN6QixXQUFLLGdCQUFnQixLQUFLO0FBQUEsSUFDM0I7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQkFBZ0IsT0FBa0M7QUFDekQsU0FBSyxRQUFRLE9BQU8sV0FBVyxFQUFFLFlBQVksQ0FBQyxDQUFDLE1BQU0sV0FBVyxFQUFFLENBQUM7QUFBQSxFQUNwRTtBQUFBLEVBRUEsSUFBSSxZQUEyQztBQUM5QyxXQUFPLEtBQUssUUFBUSxPQUFPO0FBQUEsRUFDNUI7QUFBQSxFQUVBLElBQWEsZUFBdUI7QUFBRSxXQUFPO0FBQUEsRUFBSztBQUFBLEVBQ2xELElBQWEsZUFBdUI7QUFBRSxXQUFPLE9BQU87QUFBQSxFQUFtQjtBQUFBO0FBQUEsRUFHdkUsSUFBYSxhQUFhLE9BQWU7QUFBQSxFQUFXO0FBQUEsRUFDcEQsSUFBYSxhQUFhLE9BQWU7QUFBQSxFQUFXO0FBQUE7QUFBQSxFQUdwRCxJQUFhLDBCQUEwRDtBQUN0RSxXQUFPLEtBQUssUUFBUSxPQUFPO0FBQUEsRUFDNUI7QUFBQSxFQUVVLGFBQWEsUUFBMkI7QUFDakQsU0FBSyxlQUFlLElBQUksT0FBTyxRQUFRLElBQUksRUFBRSxrQkFBa0IsQ0FBQztBQUNoRSxTQUFLLGFBQWEsS0FBSywyQkFBMkIsYUFBYSxDQUFDO0FBQUEsRUFDakU7QUFBQSxFQUVTLGtCQUFrQixRQUFpQixTQUE4RDtBQUN6RyxRQUFJLE9BQU8sT0FBTyxrQkFBa0I7QUFFbkMsYUFBTyxLQUFLLFVBQVUsS0FBSyxzQkFBc0IsZUFBZSw2QkFBNkIsUUFBUSxNQUFNLE9BQU8sQ0FBQztBQUFBLElBQ3BIO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVTLGFBQStDO0FBQ3ZELFdBQU8sS0FBSyxRQUFRO0FBQUEsRUFDckI7QUFBQSxFQUVTLFdBQVcsU0FBd0I7QUFDM0MsVUFBTSxXQUFXLE9BQU87QUFDeEIsUUFBSSxDQUFDLFNBQVM7QUFDYixXQUFLLFFBQVEsT0FBTyxXQUFXO0FBQUEsSUFDaEM7QUFBQSxFQUNEO0FBQUEsRUFFbUIsaUJBQWlCLFNBQXdCO0FBQzNELFVBQU0saUJBQWlCLE9BQU87QUFDOUIsU0FBSyxlQUFlLE1BQU07QUFDMUIsU0FBSyxlQUFlLElBQUksS0FBSyxNQUFNLGtCQUFrQixPQUFLLEtBQUsscUJBQXFCLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDOUYsU0FBSyxlQUFlLElBQUksS0FBSyxNQUFNLGlCQUFpQixNQUFNO0FBQ3pELFVBQUksS0FBSyxvQkFBb0IsZ0JBQWdCLEtBQUssT0FBTztBQUN4RCxhQUFLLFNBQVMsT0FBTyxrQkFBa0I7QUFBQSxNQUN4QztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsUUFBSSxDQUFDLFNBQVM7QUFDYixXQUFLLHFCQUFxQixLQUFLLEtBQUs7QUFDcEMsVUFBSSxLQUFLLFNBQVMsS0FBSyxRQUFRLE9BQU87QUFFckMsYUFBSyxRQUFRLE1BQU0sV0FBVztBQUFBLE1BQy9CO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVTLFFBQVE7QUFDaEIsVUFBTSxNQUFNO0FBQ1osU0FBSyxRQUFRLE9BQU8sTUFBTTtBQUFBLEVBQzNCO0FBQUEsRUFFUyxXQUFvQjtBQUM1QixVQUFNLFFBQVEsS0FBSyxRQUFRO0FBQzNCLFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLENBQUMsQ0FBQyxTQUFVLElBQUksMEJBQTBCLE1BQU0sV0FBVyxLQUFLLElBQUksMEJBQTBCLE1BQU0sNEJBQTRCLENBQUMsQ0FBQztBQUFBLEVBQzFJO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNBLE1BQWMsc0JBQXNCLE9BQTJDO0FBQzlFLFVBQU0sa0JBQWtCLFNBQVMsQ0FBQyxLQUFLLG9CQUFvQjtBQUMzRCxRQUFJLENBQUMsaUJBQWlCO0FBQ3JCO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxnQkFBZ0IsV0FBVyxzQ0FBc0MsYUFBYSxXQUFXLEtBQUssR0FBRztBQUN6RztBQUFBLElBQ0Q7QUFFQSxVQUFNLGNBQWMsTUFBTSxTQUFTLFNBQVM7QUFDNUMsUUFBSSwwQkFBMEIsSUFBSSxXQUFXLEdBQUc7QUFDL0M7QUFBQSxJQUNEO0FBRUEsVUFBTSxFQUFFLFdBQVcsZ0JBQWdCLElBQUksTUFBTSxLQUFLLGVBQWUsUUFBUTtBQUFBLE1BQ3hFLE1BQU07QUFBQSxNQUNOLFNBQVMsU0FBUyw0QkFBNEIsNENBQTRDO0FBQUEsTUFDMUYsUUFBUSxTQUFTLDJCQUEyQiwrSUFBK0k7QUFBQSxNQUMzTCxlQUFlLFNBQVMseUJBQXlCLGVBQWU7QUFBQSxNQUNoRSxVQUFVLEVBQUUsT0FBTyxTQUFTLDZCQUE2QixvQkFBb0IsRUFBRTtBQUFBLElBQ2hGLENBQUM7QUFFRCxRQUFJLENBQUMsV0FBVztBQUNmLFlBQU0sc0JBQXNCLFNBQVMsNkJBQTZCLGtFQUFrRSxHQUFHO0FBQUEsUUFDdEksU0FBUztBQUFBLFVBQ1IsSUFBSTtBQUFBLFVBQXdDLE9BQU8sU0FBUyxzQkFBc0IsY0FBYztBQUFBLFVBQUcsS0FBSyxZQUFZO0FBQ25ILGlCQUFLLGVBQWUsV0FBVyxFQUFFLFVBQVUsTUFBTSxVQUFVLFNBQVMsRUFBRSxVQUFVLDJCQUEyQixJQUFJLFFBQVEsS0FBSyxFQUFFLENBQUM7QUFBQSxVQUNoSTtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0YsR0FBRyxFQUFFLGNBQWMsS0FBSyxDQUFDO0FBQUEsSUFDMUI7QUFFQSw4QkFBMEIsSUFBSSxXQUFXO0FBRXpDLFFBQUksaUJBQWlCO0FBQ3BCLFdBQUssZ0JBQWdCLE1BQU0sc0NBQXNDLE1BQU0sYUFBYSxXQUFXLGNBQWMsT0FBTztBQUFBLElBQ3JIO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBZSxTQUFTLE9BQTRCLFNBQTZDLFNBQTZCLE9BQTBCLFNBQWtDO0FBQ3pMLFVBQU0sS0FBSyxzQkFBc0IsS0FBSztBQUV0QyxRQUFJO0FBQ0gsVUFBSSxvQkFBb0I7QUFDeEIsWUFBTSxrQkFBa0IsUUFBUSxHQUFLO0FBQ3JDLHNCQUFnQixLQUFLLE1BQU07QUFDMUIsNEJBQW9CO0FBQ3BCLGFBQUssZ0JBQWdCLE1BQU0sS0FBSztBQUFBLE1BQ2pDLENBQUM7QUFFRCxZQUFNLE9BQU8sSUFBSSxrQkFBa0I7QUFDbkMsV0FBSyxLQUFLLFdBQVc7QUFFckIsV0FBSyxlQUFlLFFBQVEsTUFBTSx3QkFBd0IsTUFBTSxLQUFLLDhCQUE4QixLQUFLLENBQUM7QUFFekcsV0FBSyx1QkFBdUIsTUFBTTtBQUlsQyxXQUFLLFFBQVEsT0FBTyxXQUFXO0FBRS9CLFdBQUssVUFBOEMsS0FBSyxzQkFBc0IsZUFBZSxLQUFLLHVCQUF1QixnQkFBZ0IsS0FBSyxNQUFNLElBQUksT0FBTyxRQUFXLEtBQUssZUFBZSxXQUFXLEtBQUssTUFBTTtBQUVwTixVQUFJLEtBQUssZ0JBQWdCLEtBQUssUUFBUSxNQUFPLFdBQVcsR0FBRztBQUMxRCxhQUFLLGFBQWEsYUFBYSxlQUFlLEtBQUssUUFBUSxNQUFPLFdBQVcsRUFBRSxNQUFNLEVBQUU7QUFDdkYsWUFBSSxnQkFBZ0IsS0FBSyxRQUFRLE1BQU8sV0FBVyxHQUFHLEtBQUssWUFBWTtBQUFBLE1BQ3hFO0FBRUEsV0FBSyx1QkFBdUIsSUFBSSxLQUFLLFFBQVEsTUFBTyxpQkFBaUIsTUFBTSxLQUFLLGtCQUFrQixLQUFLLENBQUMsQ0FBQztBQUN6RyxXQUFLLHVCQUF1QixJQUFJLEtBQUssUUFBUSxNQUFPLHNCQUFzQixNQUFNLEtBQUssc0JBQXNCLEtBQUssRUFBRSxRQUFRLGdDQUFnQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBRWxLLFVBQUksS0FBSyxlQUFlO0FBQ3ZCLGFBQUssUUFBUSxNQUFPLE9BQU8sS0FBSyxjQUFjLFdBQVcsS0FBSyxjQUFjLEtBQUssY0FBYyxRQUFRO0FBQUEsTUFDeEc7QUFJQSxZQUFNLE1BQU0sU0FBUyxPQUFPLFNBQVMsU0FBUyxLQUFLO0FBQ25ELFlBQU0sUUFBUSxNQUFNLE1BQU0sUUFBUSxTQUFTLElBQUk7QUFDL0MsV0FBSyxLQUFLLGFBQWE7QUFHdkIsVUFBSSxNQUFNLHlCQUF5QjtBQUNsQyxlQUFPO0FBQUEsTUFDUjtBQUtBLFVBQUksQ0FBQyxLQUFLLFFBQVEsT0FBTztBQUN4QixZQUFJLFNBQVM7QUFDWixpQkFBTztBQUFBLFFBQ1I7QUFDQSxlQUFPLEtBQUssU0FBUyxPQUFPLFNBQVMsU0FBUyxPQUFPLElBQUk7QUFBQSxNQUMxRDtBQUVBLFVBQUksVUFBVSxNQUFNO0FBQ25CLGNBQU0sZ0JBQWdCLEtBQUssaUJBQWlCLG9CQUFvQixNQUFNLFFBQVE7QUFFOUUsWUFBSSxDQUFDLGVBQWU7QUFDbkIsZ0JBQU0sSUFBSSxNQUFNLFNBQVMsaUJBQWlCLDZIQUE2SCxNQUFNLFFBQVEsQ0FBQztBQUFBLFFBQ3ZMO0FBRUEsY0FBTSxLQUFLLDRCQUE0QjtBQUN2QyxjQUFNLGdCQUFnQixLQUFLLDRCQUE0QixNQUFNLEtBQUssT0FBSyxFQUFFLFdBQVcsT0FBTyxhQUFhO0FBRXhHLGNBQU0sc0JBQXNCLElBQUksTUFBTSxTQUFTLGtDQUFrQyw2SEFBNkgsTUFBTSxRQUFRLENBQUMsR0FBRztBQUFBLFVBQy9OLFNBQVM7QUFBQSxZQUNSLElBQUk7QUFBQSxZQUFvRCxPQUN2RCxnQkFDRyxTQUFTLHFDQUFxQyw4QkFBOEIsTUFBTSxRQUFRLElBQzFGLFNBQVMsc0NBQXNDLCtCQUErQixNQUFNLFFBQVE7QUFBQSxZQUM5RixLQUFLLFlBQVk7QUFDbEIsb0JBQU0sSUFBSSxLQUFLLGlCQUFpQixjQUFjLGNBQVk7QUFDekQsb0JBQUksYUFBYSxNQUFNLFVBQVU7QUFFaEMsdUJBQUssZUFBZSxXQUFXLEVBQUUsVUFBVSxNQUFNLFNBQVMsQ0FBQztBQUMzRCxvQkFBRSxRQUFRO0FBQUEsZ0JBQ1g7QUFBQSxjQUNELENBQUM7QUFDRCxvQkFBTUEsaUJBQWdCLEtBQUssNEJBQTRCLE1BQU0sS0FBSyxPQUFLLEVBQUUsV0FBVyxPQUFPLGFBQWE7QUFFeEcsa0JBQUk7QUFDSCxvQkFBSUEsZ0JBQWU7QUFDbEIsd0JBQU0sS0FBSyw0QkFBNEIsY0FBY0EsZ0JBQWVBLGVBQWMsb0JBQW9CLGdCQUFnQixvQkFBb0IsZ0JBQWdCLG1CQUFtQixnQkFBZ0IsZUFBZTtBQUFBLGdCQUM3TSxPQUFPO0FBQ04sd0JBQU0sS0FBSyxzQkFBc0IsZUFBZSxtQ0FBbUMsYUFBYSxFQUFFLElBQUk7QUFBQSxnQkFDdkc7QUFBQSxjQUNELFNBQVMsSUFBSTtBQUNaLHFCQUFLLFdBQVcsTUFBTSx5Q0FBeUMsYUFBYSxJQUFJLEVBQUU7QUFDbEYsa0JBQUUsUUFBUTtBQUFBLGNBQ1g7QUFBQSxZQUNEO0FBQUEsVUFDRCxDQUFDO0FBQUEsVUFDRCxTQUFTO0FBQUEsWUFDUixJQUFJO0FBQUEsWUFBd0MsT0FBTyxTQUFTLHNCQUFzQixjQUFjO0FBQUEsWUFBRyxLQUFLLFlBQVk7QUFDbkgsb0JBQU0sU0FBUyxNQUFNLEtBQUssMEJBQTBCLFFBQVEsRUFBRSxVQUFVLE1BQU0sVUFBVSxRQUFRLGtDQUFrQyxPQUFPLE1BQU0sUUFBUSxFQUFFLENBQUM7QUFDMUosa0JBQUksUUFBUTtBQUdYLHNCQUFNLFdBQVcsTUFBTSxlQUFlLE9BQU8sS0FBSztBQUNsRCxxQkFBSyxlQUFlLFdBQVcsRUFBRSxVQUFVLFFBQVcsVUFBVSxTQUFTLFNBQVMsRUFBRSxDQUFDO0FBQUEsY0FDdEYsT0FBTztBQUVOLHFCQUFLLGVBQWUsV0FBVyxFQUFFLFVBQVUsTUFBTSxVQUFVLFNBQVMsRUFBRSxVQUFVLDJCQUEyQixJQUFJLFFBQVEsS0FBSyxFQUFFLENBQUM7QUFBQSxjQUNoSTtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLEdBQUcsRUFBRSxhQUFhLEtBQUssQ0FBQztBQUFBLE1BRXpCO0FBRUEsV0FBSyx1QkFBdUIsSUFBSSxNQUFNLFNBQVMsbUJBQW1CLE1BQU0sS0FBSyxzQkFBc0IsS0FBSyxFQUFFLFFBQVEsZ0NBQWdDLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFFMUosWUFBTSxZQUFZLFNBQVMsYUFBYSxLQUFLLDZCQUE2QixLQUFLO0FBRy9FLFdBQUssUUFBUSxNQUFNLDJCQUEyQixLQUFLLGtCQUFrQjtBQUNyRSxXQUFLLFFBQVEsTUFBTSx5QkFBeUIsS0FBSyxzQkFBc0I7QUFFdkUsWUFBTSxLQUFLLFFBQVEsTUFBTSxTQUFTLE1BQU0sVUFBVSxXQUFXLElBQUk7QUFDakUsWUFBTSxhQUFhLENBQUMsQ0FBQyxNQUFNLFdBQVc7QUFDdEMsWUFBTSxLQUFLLFFBQVEsTUFBTSxXQUFXLEVBQUUsR0FBRyxTQUFTLFdBQVcsQ0FBQztBQUM5RCxXQUFLLHVCQUF1QixJQUFJLEtBQUssUUFBUSxNQUFNLGlCQUFpQixNQUFNLEtBQUssa0JBQWtCLEtBQUssQ0FBQyxDQUFDO0FBQ3hHLFdBQUssdUJBQXVCLElBQUksS0FBSyxRQUFRLE1BQU0sZ0JBQWdCLE1BQU0sS0FBSyxpQkFBaUIsS0FBSyxDQUFDLENBQUM7QUFFdEcsV0FBSyx1QkFBdUIsSUFBSSxLQUFLLG9CQUFvQix1QkFBdUIsS0FBSyxRQUFRLE1BQU0sV0FBVyxHQUFHO0FBQUEsUUFDaEgsZUFBZSxDQUFDLFVBQVUsS0FBSyxNQUFNLE9BQU8sTUFBTTtBQUFBLE1BQ25ELENBQUMsQ0FBQztBQUVGLFdBQUssdUJBQXVCLElBQUksS0FBSyxRQUFRLE1BQU0sWUFBWSxNQUFNO0FBQUUsYUFBSyxtQkFBbUIsS0FBSztBQUFBLE1BQUcsQ0FBQyxDQUFDO0FBRXpHLFdBQUssS0FBSyxjQUFjO0FBRXhCLHNCQUFnQixPQUFPO0FBQ3ZCLFVBQUksbUJBQW1CO0FBQ3RCO0FBQUEsTUFDRDtBQUVBLFdBQUssZ0JBQWdCLE1BQU0sT0FBTyxNQUFNLFFBQVE7QUFDaEQsV0FBSyxvQkFBb0IsS0FBSztBQUFBLElBQy9CLFNBQVMsR0FBRztBQUNYLFdBQUssV0FBVyxLQUFLLHdDQUF3QyxDQUFDO0FBQzlELFVBQUksa0JBQWtCLENBQUMsR0FBRztBQUN6QixjQUFNO0FBQUEsTUFDUDtBQUdBLFVBQXlCLEVBQUcsd0JBQXdCLG9CQUFvQixnQkFBZ0I7QUFDdkYsWUFBSTtBQUNKLFlBQUksYUFBYSw0QkFBNEI7QUFDNUMsb0JBQVUsU0FBUyx3Q0FBd0Msd0ZBQXdGLFNBQVMsV0FBVyxFQUFFLElBQUksQ0FBQztBQUFBLFFBQy9LLE9BQU87QUFDTixvQkFBVSxTQUFTLDJDQUEyQyxnRkFBZ0Y7QUFBQSxRQUMvSTtBQUVBLGNBQU0sd0JBQXdCLEtBQUssT0FBTyxPQUFPLFNBQVMsU0FBUyxLQUFLLG1CQUFtQjtBQUFBLE1BQzVGO0FBRUEsWUFBTSxRQUFRLHNCQUFzQixhQUFhLFFBQVEsSUFBSSxJQUFJLE1BQU8sSUFBSSxFQUFFLFVBQVUsRUFBRyxHQUFHO0FBQUEsUUFDN0YsU0FBUztBQUFBLFVBQ1IsSUFBSTtBQUFBLFVBQThDLE9BQU8sU0FBUyw0QkFBNEIscUJBQXFCO0FBQUEsVUFBRyxLQUFLLFlBQVk7QUFDdEksa0JBQU0sbUJBQW1CLEtBQUssZUFBZTtBQUM3QyxnQkFBSSxDQUFDLGtCQUFrQjtBQUN0QjtBQUFBLFlBQ0Q7QUFFQSxrQkFBTSx1QkFBdUIsdUJBQXVCLGdCQUFnQixpQkFBaUIsS0FBSztBQUMxRixnQkFBSSxDQUFDLHNCQUFzQjtBQUMxQjtBQUFBLFlBQ0Q7QUFFQSxnQkFBSSxxQkFBcUIsU0FBUyxNQUFNLE1BQU0sVUFBVSxTQUFTLEdBQUc7QUFFbkUscUJBQU8sS0FBSyxlQUFlLFdBQVc7QUFBQSxnQkFDckMsVUFBVTtBQUFBLGdCQUNWLFNBQVM7QUFBQSxrQkFDUixVQUFVLDJCQUEyQjtBQUFBLGtCQUNyQyxRQUFRO0FBQUE7QUFBQSxnQkFDVDtBQUFBLGNBQ0QsQ0FBQztBQUFBLFlBQ0Y7QUFFQTtBQUFBLFVBQ0Q7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLEdBQUcsRUFBRSxhQUFhLEtBQUssQ0FBQztBQUV4QixZQUFNO0FBQUEsSUFDUDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGdCQUFnQixNQUF5QixPQUE0QixVQUE4QjtBQUMxRyxVQUFNLFlBQVksS0FBSztBQXdDdkIsVUFBTSxZQUFZLFVBQVUsV0FBVztBQUN2QyxVQUFNLHFCQUFxQixVQUFVLG9CQUFvQjtBQUN6RCxVQUFNLGNBQWMsVUFBVSxhQUFhO0FBQzNDLFVBQU0sb0JBQW9CLFVBQVUsbUJBQW1CO0FBQ3ZELFVBQU0sdUJBQXVCLFVBQVUsc0JBQXNCO0FBQzdELFVBQU0sZUFBZSxVQUFVLGNBQWM7QUFFN0MsUUFBSSw4QkFBOEI7QUFDbEMsUUFBSSx1QkFBdUI7QUFDM0IsUUFBSSw2QkFBNkI7QUFDakMsUUFBSSxnQ0FBZ0M7QUFDcEMsUUFBSSx3QkFBd0I7QUFFNUIsUUFBSSxjQUFjLFVBQWEsdUJBQXVCLFFBQVc7QUFDaEUsb0NBQThCLHFCQUFxQjtBQUVuRCxVQUFJLGdCQUFnQixRQUFXO0FBQzlCLCtCQUF1QixjQUFjO0FBQUEsTUFDdEM7QUFFQSxVQUFJLHNCQUFzQixRQUFXO0FBQ3BDLHFDQUE2QixvQkFBb0I7QUFBQSxNQUVsRDtBQUVBLFVBQUkseUJBQXlCLFFBQVc7QUFDdkMsd0NBQWdDLHVCQUF1QjtBQUFBLE1BQ3hEO0FBRUEsVUFBSSxpQkFBaUIsUUFBVztBQUMvQixnQ0FBd0IsZUFBZTtBQUFBLE1BQ3hDO0FBQUEsSUFDRDtBQUdBLFFBQUksZ0JBQW9DO0FBQ3hDLFFBQUksY0FBa0M7QUFDdEMsUUFBSSxjQUFrQztBQUN0QyxRQUFJLGNBQWtDO0FBQ3RDLFFBQUksYUFBaUM7QUFDckMsUUFBSSxpQkFBcUM7QUFDekMsUUFBSSxzQkFBMEM7QUFDOUMsUUFBSSxVQUFVO0FBQ2IsWUFBTSxZQUFZLElBQUksVUFBVTtBQUNoQyxpQkFBVyxRQUFRLFNBQVMsT0FBTztBQUNsQyxZQUFJLEtBQUssYUFBYSxTQUFTLE1BQU07QUFDcEMsMkJBQWlCLGlCQUFpQixLQUFLO0FBQ3ZDLHdCQUFjLGNBQWMsS0FBSyxLQUFLLGNBQWM7QUFDcEQseUJBQWUsZUFBZSxLQUFLLEtBQUssUUFBUTtBQUNoRCx5QkFBZSxlQUFlLEtBQUssS0FBSyxRQUFRLE9BQU8sQ0FBQyxNQUFNLFFBQVEsT0FBTyxJQUFJLFFBQVEsT0FBTyxDQUFDLE1BQU0sU0FBUyxPQUFPLEtBQUssS0FBSyxZQUFZLENBQUMsR0FBRyxDQUFDO0FBQUEsUUFDbkosT0FBTztBQUNOLHlCQUFlLGVBQWUsS0FBSztBQUNuQyw0QkFBa0IsY0FBYyxLQUFLLEtBQUssY0FBYztBQUFBLFFBQ3pEO0FBQUEsTUFDRDtBQUNBLDRCQUFzQixVQUFVLFFBQVE7QUFBQSxJQUN6QztBQUVBLFNBQUssV0FBVyxNQUFNLHVDQUF1QyxVQUFVLElBQUksU0FBUyxLQUFLLEVBQUUsMkJBQTJCLDJCQUEyQixnQkFBZ0Isb0JBQW9CLGtCQUFrQiwwQkFBMEIscUJBQXFCLDZCQUE2QixpQkFBaUIscUJBQXFCLEVBQUU7QUFFM1QsU0FBSyxpQkFBaUIsV0FBNEUsMkJBQTJCO0FBQUEsTUFDNUgsUUFBUSxNQUFNLFNBQVM7QUFBQSxNQUN2QixLQUFLLFFBQVEsTUFBTSxRQUFRO0FBQUEsTUFDM0IsVUFBVSxNQUFNO0FBQUEsTUFDaEIsb0JBQW9CO0FBQUEsTUFDcEIsYUFBYTtBQUFBLE1BQ2IsbUJBQW1CO0FBQUEsTUFDbkIsc0JBQXNCO0FBQUEsTUFDdEIsY0FBYztBQUFBLE1BQ2Q7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUyxhQUFtQjtBQUMzQixTQUFLLGVBQWUsTUFBTTtBQUUxQixRQUFJLEtBQUssUUFBUSxPQUFPO0FBQ3ZCLFdBQUsscUJBQXFCLEtBQUssS0FBSztBQUNwQyxXQUFLLFFBQVEsTUFBTSxXQUFXO0FBQUEsSUFDL0I7QUFDQSxVQUFNLFdBQVc7QUFBQSxFQUNsQjtBQUFBLEVBRVMsV0FBVyxTQUFtRDtBQUN0RSxTQUFLLFFBQVEsT0FBTyxXQUFXLE9BQU87QUFDdEMsVUFBTSxXQUFXLE9BQU87QUFBQSxFQUN6QjtBQUFBLEVBRW1CLFlBQWtCO0FBQ3BDLFNBQUsscUJBQXFCLEtBQUssS0FBSztBQUNwQyxVQUFNLFVBQVU7QUFBQSxFQUNqQjtBQUFBLEVBRVMsZUFBcUQ7QUFDN0QsVUFBTSxRQUFRLEtBQUs7QUFDbkIsUUFBSSxFQUFFLGlCQUFpQixzQkFBc0I7QUFDNUMsYUFBTztBQUFBLElBQ1I7QUFFQSxTQUFLLHFCQUFxQixLQUFLO0FBQy9CLFdBQU8sS0FBSyw2QkFBNkIsS0FBSztBQUFBLEVBQy9DO0FBQUEsRUFFQSxlQUFpRDtBQUNoRCxRQUFJLEtBQUssUUFBUSxPQUFPO0FBQ3ZCLFlBQU0sYUFBYSxLQUFLLFFBQVEsTUFBTSxjQUFjO0FBQ3BELFVBQUksWUFBWTtBQUNmLGNBQU0sVUFBVSxXQUFXO0FBQzNCLGVBQU8sSUFBSSx3QkFBd0IsU0FBUyxXQUFXLGNBQWMsQ0FBQztBQUFBLE1BQ3ZFO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxvQkFBK0M7QUFDOUMsVUFBTSxTQUFTLEtBQUssV0FBVztBQUMvQixRQUFJLENBQUMsUUFBUTtBQUNaLFlBQU0sSUFBSSxNQUFNLDhDQUE4QztBQUFBLElBQy9EO0FBRUEsV0FBTztBQUFBLE1BQ04sV0FBVyxPQUFPO0FBQUEsTUFDbEIsWUFBWTtBQUFBLElBQ2I7QUFBQSxFQUNEO0FBQUEsRUFFQSxrQkFBa0IsZ0JBQWlEO0FBQ2xFLFVBQU0sU0FBUyxLQUFLLFdBQVc7QUFDL0IsUUFBSSxDQUFDLFFBQVE7QUFDWixZQUFNLElBQUksTUFBTSxzQ0FBc0M7QUFBQSxJQUN2RDtBQUVBLFdBQU8sYUFBYSxlQUFlLFNBQVM7QUFBQSxFQUM3QztBQUFBLEVBRVEscUJBQXFCLE9BQXNDO0FBQ2xFLFFBQUksS0FBSyxRQUFRLFNBQVMsaUJBQWlCLHFCQUFxQjtBQUMvRCxVQUFJLEtBQUssUUFBUSxNQUFNLFlBQVk7QUFDbEM7QUFBQSxNQUNEO0FBRUEsWUFBTSxRQUFRLEtBQUssUUFBUSxNQUFNLG1CQUFtQjtBQUNwRCxXQUFLLGVBQWUsZ0JBQWdCLEtBQUssT0FBTyxNQUFNLFVBQVUsS0FBSztBQUFBLElBQ3RFO0FBQUEsRUFDRDtBQUFBLEVBRVEsNkJBQTZCLE9BQWtFO0FBQ3RHLFVBQU0sU0FBUyxLQUFLLGVBQWUsZ0JBQWdCLEtBQUssT0FBTyxNQUFNLFFBQVE7QUFDN0UsUUFBSSxRQUFRO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFHQSxlQUFXLFNBQVMsS0FBSyxvQkFBb0IsVUFBVSxZQUFZLG9CQUFvQixHQUFHO0FBQ3pGLFVBQUksTUFBTSxxQkFBcUIsUUFBUSxNQUFNLDRCQUE0QixrQkFBa0IsTUFBTSxjQUFjLFFBQVEsS0FBSyxHQUFHO0FBQzlILGVBQU8sTUFBTSxpQkFBaUIsUUFBUSxPQUFPLG1CQUFtQjtBQUFBLE1BQ2pFO0FBQUEsSUFDRDtBQUNBO0FBQUEsRUFDRDtBQUFBLEVBRUEsT0FBTyxXQUEwQixVQUFrQztBQUNsRSxTQUFLLGFBQWEsVUFBVSxPQUFPLGFBQWEsVUFBVSxRQUFRLE9BQVEsVUFBVSxTQUFTLEdBQUc7QUFDaEcsU0FBSyxhQUFhLFVBQVUsT0FBTyxnQkFBZ0IsVUFBVSxRQUFRLEdBQUc7QUFDeEUsU0FBSyxnQkFBZ0IsRUFBRSxXQUFXLFNBQVM7QUFFM0MsUUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLEVBQUUsS0FBSyxpQkFBaUIsc0JBQXNCO0FBQ3hFO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxNQUFNLFNBQVMsU0FBUyxNQUFNLEtBQUssV0FBVyxJQUFJLFNBQVMsS0FBSyxLQUFLLFFBQVEsT0FBTyxTQUFTLEdBQUc7QUFPeEc7QUFBQSxJQUNEO0FBRUEsUUFBSSxLQUFLLFVBQVUsR0FBRztBQUNyQixXQUFLLFFBQVEsTUFBTSxPQUFPLFdBQVcsS0FBSyxjQUFjLFFBQVE7QUFBQSxJQUNqRTtBQUFBLEVBQ0Q7QUFBQTtBQUdEO0FBMW1CYSxlQUNJLEtBQWE7QUFEakIsaUJBQU47QUFBQSxFQTZCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0E5Q1U7QUE0bUJiLE1BQU0sd0JBQXdEO0FBQUEsRUFFN0QsWUFDa0IsU0FDQSxZQUNoQjtBQUZnQjtBQUNBO0FBQUEsRUFDZDtBQUFBLEVBRUosUUFBUSxPQUErRDtBQUN0RSxRQUFJLEVBQUUsaUJBQWlCLDBCQUEwQjtBQUNoRCxhQUFPLGlDQUFpQztBQUFBLElBQ3pDO0FBRUEsUUFBSSxRQUFRLEtBQUssU0FBUyxNQUFNLE9BQU8sR0FBRztBQUN6QyxhQUFPLGlDQUFpQztBQUFBLElBQ3pDO0FBRUEsV0FBTyxpQ0FBaUM7QUFBQSxFQUN6QztBQUFBLEVBRUEsUUFBUSxTQUFpRDtBQUN4RCxVQUFNLGtCQUEwQztBQUFBLE1BQy9DLGFBQWE7QUFBQSxRQUNaLFVBQVUsS0FBSztBQUFBLFFBQ2YsU0FBUztBQUFBLFVBQ1IsV0FBVyxLQUFLLFdBQVcsQ0FBQztBQUFBLFFBQzdCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPLE9BQU8saUJBQWlCLE9BQU87QUFFdEMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWM7QUFDYixXQUFPLEtBQUssUUFBUTtBQUFBLEVBQ3JCO0FBQ0Q7QUFFTyxTQUFTLCtCQUErQixRQUFpQyxZQUFrQztBQUNqSCxNQUFJLFFBQVEsTUFBTSxNQUFNLGVBQWUsSUFBSTtBQUMxQyxVQUFNLGlCQUFpQixPQUFPLFdBQVc7QUFDekMsUUFBSSxnQkFBZ0I7QUFDbkIsaUJBQVcsQ0FBQyxHQUFHQyxPQUFNLEtBQUssZUFBZSxhQUFhO0FBQ3JELFlBQUlBLFlBQVcsWUFBWTtBQUMxQixpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbImV4dGVuc2lvbkluZm8iLCAiZWRpdG9yIl0KfQo=
