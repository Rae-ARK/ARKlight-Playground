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
import { coalesce } from "../../../../base/common/arrays.js";
import { createCancelablePromise, DeferredPromise, raceCancellation } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { createStringDataTransferItem, matchesMimeType, UriList, VSDataTransfer } from "../../../../base/common/dataTransfer.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { HierarchicalKind } from "../../../../base/common/hierarchicalKind.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Mimes } from "../../../../base/common/mime.js";
import { upcast } from "../../../../base/common/types.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IBulkEditService } from "../../../browser/services/bulkEditService.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Handler } from "../../../common/editorCommon.js";
import { DocumentPasteTriggerKind } from "../../../common/languages.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from "../../editorState/browser/editorState.js";
import { InlineProgressManager } from "../../inlineProgress/browser/inlineProgress.js";
import { MessageController } from "../../message/browser/messageController.js";
import { DefaultTextPasteOrDropEditProvider } from "./defaultProviders.js";
import { createCombinedWorkspaceEdit, sortEditsByYieldTo } from "./edit.js";
import { PostEditWidgetManager } from "./postEditWidget.js";
const changePasteTypeCommandId = "editor.changePasteType";
const pasteAsPreferenceConfig = "editor.pasteAs.preferences";
const pasteWidgetVisibleCtx = new RawContextKey("pasteWidgetVisible", false, localize("pasteWidgetVisible", "Whether the paste widget is showing"));
const vscodeClipboardMime = "application/vnd.code.copymetadata";
let CopyPasteController = class extends Disposable {
  constructor(editor, instantiationService, _logService, _bulkEditService, _clipboardService, _commandService, _configService, _languageFeaturesService, _quickInputService, _progressService) {
    super();
    this._logService = _logService;
    this._bulkEditService = _bulkEditService;
    this._clipboardService = _clipboardService;
    this._commandService = _commandService;
    this._configService = _configService;
    this._languageFeaturesService = _languageFeaturesService;
    this._quickInputService = _quickInputService;
    this._progressService = _progressService;
    this._editor = editor;
    this._register(editor.onWillCopy((e) => this.handleCopy(e)));
    this._register(editor.onWillCut((e) => this.handleCopy(e)));
    this._register(editor.onWillPaste((e) => this.handlePaste(e)));
    this._pasteProgressManager = this._register(new InlineProgressManager("pasteIntoEditor", editor, instantiationService));
    this._postPasteWidgetManager = this._register(instantiationService.createInstance(
      PostEditWidgetManager,
      "pasteIntoEditor",
      editor,
      pasteWidgetVisibleCtx,
      { id: changePasteTypeCommandId, label: localize("postPasteWidgetTitle", "Show paste options...") },
      () => CopyPasteController._configureDefaultAction ? [CopyPasteController._configureDefaultAction] : []
    ));
  }
  static get(editor) {
    return editor.getContribution(CopyPasteController.ID);
  }
  static setConfigureDefaultAction(action) {
    CopyPasteController._configureDefaultAction = action;
  }
  changePasteType() {
    this._postPasteWidgetManager.tryShowSelector();
  }
  async pasteAs(preferred) {
    this._logService.trace("CopyPasteController.pasteAs");
    this._editor.focus();
    try {
      this._logService.trace("Before calling editor.action.clipboardPasteAction");
      this._pasteAsActionContext = { preferred };
      await this._commandService.executeCommand("editor.action.clipboardPasteAction");
    } finally {
      this._pasteAsActionContext = void 0;
    }
  }
  clearWidgets() {
    this._postPasteWidgetManager.clear();
  }
  isPasteAsEnabled() {
    return this._editor.getOption(EditorOption.pasteAs).enabled;
  }
  async finishedPaste() {
    await this._currentPasteOperation;
  }
  handleCopy(e) {
    this._logService.trace("CopyPasteController#handleCopy");
    if (!this._editor.hasTextFocus()) {
      return;
    }
    this._clipboardService.clearInternalState?.();
    if (!this.isPasteAsEnabled()) {
      return;
    }
    const model = this._editor.getModel();
    const viewModel = this._editor._getViewModel();
    const selections = this._editor.getSelections();
    if (!model || !viewModel || !selections?.length) {
      return;
    }
    const defaultPastePayload = {
      multicursorText: e.dataToCopy.multicursorText ?? null,
      pasteOnNewLine: e.dataToCopy.isFromEmptySelection,
      mode: null
    };
    const providers = this._languageFeaturesService.documentPasteEditProvider.ordered(model).filter((x) => !!x.prepareDocumentPaste);
    if (!providers.length) {
      this.setCopyMetadata(e.clipboardData, { defaultPastePayload });
      return;
    }
    const dataTransfer = new VSDataTransfer();
    const providerCopyMimeTypes = providers.flatMap((x) => x.copyMimeTypes ?? []);
    const handle = generateUuid();
    this.setCopyMetadata(e.clipboardData, {
      id: handle,
      providerCopyMimeTypes,
      defaultPastePayload
    });
    const operations = providers.map((provider) => {
      return {
        providerMimeTypes: provider.copyMimeTypes,
        operation: createCancelablePromise((token) => provider.prepareDocumentPaste(model, e.dataToCopy.sourceRanges, dataTransfer, token).catch((err) => {
          console.error(err);
          return void 0;
        }))
      };
    });
    CopyPasteController._currentCopyOperation?.operations.forEach((entry) => entry.operation.cancel());
    CopyPasteController._currentCopyOperation = { handle, operations };
  }
  async handlePaste(e) {
    this._logService.trace("CopyPasteController#handlePaste for id : ", e.metadata?.id);
    if (!this._editor.hasTextFocus()) {
      return;
    }
    const dataTransfer = e.toExternalVSDataTransfer();
    if (!dataTransfer) {
      return;
    }
    dataTransfer.delete(vscodeClipboardMime);
    MessageController.get(this._editor)?.closeMessage();
    this._currentPasteOperation?.cancel();
    this._currentPasteOperation = void 0;
    const model = this._editor.getModel();
    const selections = this._editor.getSelections();
    if (!selections?.length || !model) {
      return;
    }
    if (this._editor.getOption(EditorOption.readOnly) || !this.isPasteAsEnabled() && !this._pasteAsActionContext) {
      return;
    }
    const metadata = this.fetchCopyMetadata(e);
    this._logService.trace("CopyPasteController#handlePaste with metadata : ", metadata?.id, " and text.length : ", e.clipboardData.getData("text/plain").length);
    const fileTypes = Array.from(e.clipboardData.files).map((file) => file.type);
    const allPotentialMimeTypes = [
      ...e.clipboardData.types,
      ...fileTypes,
      ...metadata?.providerCopyMimeTypes ?? [],
      // TODO: always adds `uri-list` because this get set if there are resources in the system clipboard.
      // However we can only check the system clipboard async. For this early check, just add it in.
      // We filter providers again once we have the final dataTransfer we will use.
      Mimes.uriList
    ];
    const allProviders = this._languageFeaturesService.documentPasteEditProvider.ordered(model).filter((provider) => {
      const preference = this._pasteAsActionContext?.preferred;
      if (preference) {
        if (!this.providerMatchesPreference(provider, preference)) {
          return false;
        }
      }
      return provider.pasteMimeTypes?.some((type) => matchesMimeType(type, allPotentialMimeTypes));
    });
    if (!allProviders.length) {
      if (this._pasteAsActionContext?.preferred) {
        this.showPasteAsNoEditMessage(selections, this._pasteAsActionContext.preferred);
        e.setHandled();
      }
      return;
    }
    e.setHandled();
    if (this._pasteAsActionContext) {
      this.showPasteAsPick(this._pasteAsActionContext.preferred, allProviders, selections, dataTransfer, metadata);
    } else {
      this.doPasteInline(allProviders, selections, dataTransfer, metadata, e.browserEvent);
    }
  }
  showPasteAsNoEditMessage(selections, preference) {
    const kindLabel = "only" in preference ? preference.only.value : "preferences" in preference ? preference.preferences.length ? preference.preferences.map((preference2) => preference2.value).join(", ") : localize("noPreferences", "empty") : preference.providerId;
    MessageController.get(this._editor)?.showMessage(localize("pasteAsError", "No paste edits for '{0}' found", kindLabel), selections[0].getStartPosition());
  }
  doPasteInline(allProviders, selections, dataTransfer, metadata, clipboardEvent) {
    this._logService.trace("CopyPasteController#doPasteInline");
    const editor = this._editor;
    if (!editor.hasModel()) {
      return;
    }
    const editorStateCts = new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection, void 0);
    const p = createCancelablePromise(async (pToken) => {
      const editor2 = this._editor;
      if (!editor2.hasModel()) {
        return;
      }
      const model = editor2.getModel();
      const disposables = new DisposableStore();
      const cts = disposables.add(new CancellationTokenSource(pToken));
      disposables.add(editorStateCts.token.onCancellationRequested(() => cts.cancel()));
      const token = cts.token;
      try {
        await this.mergeInDataFromCopy(allProviders, dataTransfer, metadata, token);
        if (token.isCancellationRequested) {
          return;
        }
        const supportedProviders = allProviders.filter((provider) => this.isSupportedPasteProvider(provider, dataTransfer));
        if (!supportedProviders.length || supportedProviders.length === 1 && supportedProviders[0] instanceof DefaultTextPasteOrDropEditProvider) {
          return this.applyDefaultPasteHandler(dataTransfer, metadata, token, clipboardEvent);
        }
        const context = {
          triggerKind: DocumentPasteTriggerKind.Automatic
        };
        const editSession = await this.getPasteEdits(supportedProviders, dataTransfer, model, selections, context, token);
        disposables.add(editSession);
        if (token.isCancellationRequested) {
          return;
        }
        if (editSession.edits.length === 1 && editSession.edits[0].provider instanceof DefaultTextPasteOrDropEditProvider) {
          return this.applyDefaultPasteHandler(dataTransfer, metadata, token, clipboardEvent);
        }
        if (editSession.edits.length) {
          const canShowWidget = editor2.getOption(EditorOption.pasteAs).showPasteSelector === "afterPaste";
          return this._postPasteWidgetManager.applyEditAndShowIfNeeded(selections, { activeEditIndex: this.getInitialActiveEditIndex(model, editSession.edits), allEdits: editSession.edits }, canShowWidget, async (edit, resolveToken) => {
            if (!edit.provider.resolveDocumentPasteEdit) {
              return edit;
            }
            const resolveP = edit.provider.resolveDocumentPasteEdit(edit, resolveToken);
            const showP = new DeferredPromise();
            const resolved = await this._pasteProgressManager.showWhile(selections[0].getEndPosition(), localize("resolveProcess", "Resolving paste edit for '{0}'. Click to cancel", edit.title), raceCancellation(Promise.race([showP.p, resolveP]), resolveToken), {
              cancel: () => showP.cancel()
            }, 0);
            if (resolved) {
              edit.insertText = resolved.insertText;
              edit.additionalEdit = resolved.additionalEdit;
            }
            return edit;
          }, token);
        }
        await this.applyDefaultPasteHandler(dataTransfer, metadata, token, clipboardEvent);
      } finally {
        disposables.dispose();
        if (this._currentPasteOperation === p) {
          this._currentPasteOperation = void 0;
        }
      }
    });
    this._pasteProgressManager.showWhile(selections[0].getEndPosition(), localize("pasteIntoEditorProgress", "Running paste handlers. Click to cancel and do basic paste"), p, {
      cancel: async () => {
        p.cancel();
        if (editorStateCts.token.isCancellationRequested) {
          return;
        }
        await this.applyDefaultPasteHandler(dataTransfer, metadata, editorStateCts.token, clipboardEvent);
      }
    }).finally(() => {
      editorStateCts.dispose();
    });
    this._currentPasteOperation = p;
  }
  showPasteAsPick(preference, allProviders, selections, dataTransfer, metadata) {
    this._logService.trace("CopyPasteController#showPasteAsPick");
    const p = createCancelablePromise(async (token) => {
      const editor = this._editor;
      if (!editor.hasModel()) {
        return;
      }
      const model = editor.getModel();
      const disposables = new DisposableStore();
      const tokenSource = disposables.add(new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection, void 0, token));
      try {
        await this.mergeInDataFromCopy(allProviders, dataTransfer, metadata, tokenSource.token);
        if (tokenSource.token.isCancellationRequested) {
          return;
        }
        let supportedProviders = allProviders.filter((provider) => this.isSupportedPasteProvider(provider, dataTransfer, preference));
        if (preference) {
          supportedProviders = supportedProviders.filter((provider) => this.providerMatchesPreference(provider, preference));
        }
        const context = {
          triggerKind: DocumentPasteTriggerKind.PasteAs,
          only: preference && "only" in preference ? preference.only : void 0
        };
        let editSession = disposables.add(await this.getPasteEdits(supportedProviders, dataTransfer, model, selections, context, tokenSource.token));
        if (tokenSource.token.isCancellationRequested) {
          return;
        }
        if (preference) {
          editSession = {
            edits: editSession.edits.filter((edit) => {
              if ("only" in preference) {
                return preference.only.contains(edit.kind);
              } else if ("preferences" in preference) {
                return preference.preferences.some((preference2) => preference2.contains(edit.kind));
              } else {
                return preference.providerId === edit.provider.id;
              }
            }),
            dispose: editSession.dispose
          };
        }
        if (!editSession.edits.length) {
          if (preference) {
            this.showPasteAsNoEditMessage(selections, preference);
          }
          return;
        }
        let pickedEdit;
        if (preference) {
          pickedEdit = editSession.edits.at(0);
        } else {
          const configureDefaultItem = {
            id: "editor.pasteAs.default",
            label: localize("pasteAsDefault", "Configure default paste action"),
            edit: void 0
          };
          const selected = await this._quickInputService.pick(
            [
              ...editSession.edits.map((edit) => ({
                label: edit.title,
                description: edit.kind?.value,
                edit
              })),
              ...CopyPasteController._configureDefaultAction ? [
                upcast({ type: "separator" }),
                {
                  label: CopyPasteController._configureDefaultAction.label,
                  edit: void 0
                }
              ] : []
            ],
            {
              placeHolder: localize("pasteAsPickerPlaceholder", "Select Paste Action")
            }
          );
          if (selected === configureDefaultItem) {
            CopyPasteController._configureDefaultAction?.run();
            return;
          }
          pickedEdit = selected?.edit;
        }
        if (!pickedEdit) {
          return;
        }
        const combinedWorkspaceEdit = createCombinedWorkspaceEdit(model.uri, selections, pickedEdit);
        await this._bulkEditService.apply(combinedWorkspaceEdit, { editor: this._editor });
      } finally {
        disposables.dispose();
        if (this._currentPasteOperation === p) {
          this._currentPasteOperation = void 0;
        }
      }
    });
    this._progressService.withProgress({
      location: ProgressLocation.Window,
      title: localize("pasteAsProgress", "Running paste handlers")
    }, () => p);
  }
  setCopyMetadata(clipboardData, metadata) {
    this._logService.trace("CopyPasteController#setCopyMetadata new id : ", metadata.id);
    clipboardData.setData(vscodeClipboardMime, JSON.stringify(metadata));
  }
  fetchCopyMetadata(e) {
    this._logService.trace("CopyPasteController#fetchCopyMetadata");
    const rawMetadata = e.clipboardData.getData(vscodeClipboardMime);
    if (rawMetadata) {
      try {
        return JSON.parse(rawMetadata);
      } catch {
        return void 0;
      }
    }
    if (e.metadata) {
      return {
        defaultPastePayload: {
          mode: e.metadata.mode,
          multicursorText: e.metadata.multicursorText ?? null,
          pasteOnNewLine: !!e.metadata.isFromEmptySelection
        }
      };
    }
    return void 0;
  }
  async mergeInDataFromCopy(allProviders, dataTransfer, metadata, token) {
    this._logService.trace("CopyPasteController#mergeInDataFromCopy with metadata : ", metadata?.id);
    if (metadata?.id && CopyPasteController._currentCopyOperation?.handle === metadata.id) {
      const toResolve = CopyPasteController._currentCopyOperation.operations.filter((op) => allProviders.some((provider) => provider.pasteMimeTypes.some((type) => matchesMimeType(type, op.providerMimeTypes)))).map((op) => op.operation);
      const toMergeResults = await Promise.all(toResolve);
      if (token.isCancellationRequested) {
        return;
      }
      for (const toMergeData of toMergeResults.reverse()) {
        if (toMergeData) {
          for (const [key, value] of toMergeData) {
            dataTransfer.replace(key, value);
          }
        }
      }
    }
    if (!dataTransfer.has(Mimes.uriList)) {
      const resources = await this._clipboardService.readResources();
      if (token.isCancellationRequested) {
        return;
      }
      if (resources.length) {
        dataTransfer.append(Mimes.uriList, createStringDataTransferItem(UriList.create(resources)));
      }
    }
  }
  async getPasteEdits(providers, dataTransfer, model, selections, context, token) {
    const disposables = new DisposableStore();
    const results = await raceCancellation(
      Promise.all(providers.map(async (provider) => {
        try {
          const edits2 = await provider.provideDocumentPasteEdits?.(model, selections, dataTransfer, context, token);
          if (edits2) {
            disposables.add(edits2);
          }
          return edits2?.edits?.map((edit) => ({ ...edit, provider }));
        } catch (err) {
          if (!isCancellationError(err)) {
            console.error(err);
          }
          return void 0;
        }
      })),
      token
    );
    const edits = coalesce(results ?? []).flat().filter((edit) => {
      return !context.only || context.only.contains(edit.kind);
    });
    return {
      edits: sortEditsByYieldTo(edits),
      dispose: () => disposables.dispose()
    };
  }
  async applyDefaultPasteHandler(dataTransfer, metadata, token, clipboardEvent) {
    const textDataTransfer = dataTransfer.get(Mimes.text) ?? dataTransfer.get("text");
    const text = await textDataTransfer?.asString() ?? "";
    if (token.isCancellationRequested) {
      return;
    }
    const payload = {
      clipboardEvent,
      text,
      pasteOnNewLine: metadata?.defaultPastePayload.pasteOnNewLine ?? false,
      multicursorText: metadata?.defaultPastePayload.multicursorText ?? null,
      mode: null
    };
    this._logService.trace("CopyPasteController#applyDefaultPasteHandler for id : ", metadata?.id);
    this._editor.trigger("keyboard", Handler.Paste, payload);
  }
  /**
   * Filter out providers if they:
   * - Don't handle any of the data transfer types we have
   * - Don't match the preferred paste kind
   */
  isSupportedPasteProvider(provider, dataTransfer, preference) {
    if (!provider.pasteMimeTypes?.some((type) => dataTransfer.matches(type))) {
      return false;
    }
    return !preference || this.providerMatchesPreference(provider, preference);
  }
  providerMatchesPreference(provider, preference) {
    if ("only" in preference) {
      return provider.providedPasteEditKinds.some((providedKind) => preference.only.contains(providedKind));
    } else if ("preferences" in preference) {
      return provider.providedPasteEditKinds.some((providedKind) => preference.preferences.some((preferredKind) => preferredKind.contains(providedKind)));
    } else {
      return provider.id === preference.providerId;
    }
  }
  getInitialActiveEditIndex(model, edits) {
    const preferredProviders = this._configService.getValue(pasteAsPreferenceConfig, { resource: model.uri });
    for (const config of Array.isArray(preferredProviders) ? preferredProviders : []) {
      const desiredKind = new HierarchicalKind(config);
      const editIndex = edits.findIndex((edit) => desiredKind.contains(edit.kind));
      if (editIndex >= 0) {
        return editIndex;
      }
    }
    return 0;
  }
};
CopyPasteController.ID = "editor.contrib.copyPasteActionController";
CopyPasteController = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IBulkEditService),
  __decorateParam(4, IClipboardService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, ILanguageFeaturesService),
  __decorateParam(8, IQuickInputService),
  __decorateParam(9, IProgressService)
], CopyPasteController);
export {
  CopyPasteController,
  changePasteTypeCommandId,
  pasteAsPreferenceConfig,
  pasteWidgetVisibleCtx
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL2NvcHlQYXN0ZUNvbnRyb2xsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIERlZmVycmVkUHJvbWlzZSwgcmFjZUNhbmNlbGxhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTdHJpbmdEYXRhVHJhbnNmZXJJdGVtLCBJUmVhZG9ubHlWU0RhdGFUcmFuc2ZlciwgbWF0Y2hlc01pbWVUeXBlLCBVcmlMaXN0LCBWU0RhdGFUcmFuc2ZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGFUcmFuc2Zlci5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEhpZXJhcmNoaWNhbEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oaWVyYXJjaGljYWxLaW5kLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNaW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgdXBjYXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkQ29weUV2ZW50LCBJQ2xpcGJvYXJkUGFzdGVFdmVudCwgSVdyaXRhYmxlQ2xpcGJvYXJkRGF0YSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY29udHJvbGxlci9lZGl0Q29udGV4dC9jbGlwYm9hcmRVdGlscy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgUGFzdGVQYXlsb2FkIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElCdWxrRWRpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IEhhbmRsZXIsIElFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IERvY3VtZW50UGFzdGVDb250ZXh0LCBEb2N1bWVudFBhc3RlRWRpdCwgRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlciwgRG9jdW1lbnRQYXN0ZVRyaWdnZXJLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JTdGF0ZUZsYWcsIEVkaXRvclN0YXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi9lZGl0b3JTdGF0ZS9icm93c2VyL2VkaXRvclN0YXRlLmpzJztcbmltcG9ydCB7IElubGluZVByb2dyZXNzTWFuYWdlciB9IGZyb20gJy4uLy4uL2lubGluZVByb2dyZXNzL2Jyb3dzZXIvaW5saW5lUHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi9tZXNzYWdlL2Jyb3dzZXIvbWVzc2FnZUNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgUHJlZmVycmVkUGFzdGVDb25maWd1cmF0aW9uIH0gZnJvbSAnLi9jb3B5UGFzdGVDb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgRGVmYXVsdFRleHRQYXN0ZU9yRHJvcEVkaXRQcm92aWRlciB9IGZyb20gJy4vZGVmYXVsdFByb3ZpZGVycy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb21iaW5lZFdvcmtzcGFjZUVkaXQsIHNvcnRFZGl0c0J5WWllbGRUbyB9IGZyb20gJy4vZWRpdC5qcyc7XG5pbXBvcnQgeyBQb3N0RWRpdFdpZGdldE1hbmFnZXIgfSBmcm9tICcuL3Bvc3RFZGl0V2lkZ2V0LmpzJztcblxuZXhwb3J0IGNvbnN0IGNoYW5nZVBhc3RlVHlwZUNvbW1hbmRJZCA9ICdlZGl0b3IuY2hhbmdlUGFzdGVUeXBlJztcblxuZXhwb3J0IGNvbnN0IHBhc3RlQXNQcmVmZXJlbmNlQ29uZmlnID0gJ2VkaXRvci5wYXN0ZUFzLnByZWZlcmVuY2VzJztcblxuZXhwb3J0IGNvbnN0IHBhc3RlV2lkZ2V0VmlzaWJsZUN0eCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdwYXN0ZVdpZGdldFZpc2libGUnLCBmYWxzZSwgbG9jYWxpemUoJ3Bhc3RlV2lkZ2V0VmlzaWJsZScsIFwiV2hldGhlciB0aGUgcGFzdGUgd2lkZ2V0IGlzIHNob3dpbmdcIikpO1xuXG5jb25zdCB2c2NvZGVDbGlwYm9hcmRNaW1lID0gJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLmNvcHltZXRhZGF0YSc7XG5cbmludGVyZmFjZSBDb3B5TWV0YWRhdGEge1xuXHRyZWFkb25seSBpZD86IHN0cmluZztcblx0cmVhZG9ubHkgcHJvdmlkZXJDb3B5TWltZVR5cGVzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cblx0cmVhZG9ubHkgZGVmYXVsdFBhc3RlUGF5bG9hZDogT21pdDxQYXN0ZVBheWxvYWQsICd0ZXh0Jz47XG59XG5cbnR5cGUgUGFzdGVFZGl0V2l0aFByb3ZpZGVyID0gRG9jdW1lbnRQYXN0ZUVkaXQgJiB7XG5cdHByb3ZpZGVyOiBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyO1xufTtcblxuXG5pbnRlcmZhY2UgRG9jdW1lbnRQYXN0ZVdpdGhQcm92aWRlckVkaXRzU2Vzc2lvbiB7XG5cdGVkaXRzOiByZWFkb25seSBQYXN0ZUVkaXRXaXRoUHJvdmlkZXJbXTtcblx0ZGlzcG9zZSgpOiB2b2lkO1xufVxuXG5leHBvcnQgdHlwZSBQYXN0ZVByZWZlcmVuY2UgPVxuXHR8IHsgcmVhZG9ubHkgb25seTogSGllcmFyY2hpY2FsS2luZCB9XG5cdHwgeyByZWFkb25seSBwcmVmZXJlbmNlczogcmVhZG9ubHkgSGllcmFyY2hpY2FsS2luZFtdIH1cblx0fCB7IHJlYWRvbmx5IHByb3ZpZGVySWQ6IHN0cmluZyB9IC8vIE9ubHkgdXNlZCBpbnRlcm5hbGx5XG5cdDtcblxuaW50ZXJmYWNlIENvcHlPcGVyYXRpb24ge1xuXHRyZWFkb25seSBwcm92aWRlck1pbWVUeXBlczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IG9wZXJhdGlvbjogQ2FuY2VsYWJsZVByb21pc2U8SVJlYWRvbmx5VlNEYXRhVHJhbnNmZXIgfCB1bmRlZmluZWQ+O1xufVxuXG5leHBvcnQgY2xhc3MgQ29weVBhc3RlQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLmNvcHlQYXN0ZUFjdGlvbkNvbnRyb2xsZXInO1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiBDb3B5UGFzdGVDb250cm9sbGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248Q29weVBhc3RlQ29udHJvbGxlcj4oQ29weVBhc3RlQ29udHJvbGxlci5JRCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHNldENvbmZpZ3VyZURlZmF1bHRBY3Rpb24oYWN0aW9uOiBJQWN0aW9uKSB7XG5cdFx0Q29weVBhc3RlQ29udHJvbGxlci5fY29uZmlndXJlRGVmYXVsdEFjdGlvbiA9IGFjdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jb25maWd1cmVEZWZhdWx0QWN0aW9uPzogSUFjdGlvbjtcblxuXHQvKipcblx0ICogR2xvYmFsIHRyYWNraW5nIHRoZSBsYXN0IGNvcHkgb3BlcmF0aW9uLlxuXHQgKlxuXHQgKiBUaGlzIGlzIHNoYXJlZCBhY3Jvc3MgYWxsIGVkaXRvcnMgc28gdGhhdCB5b3UgY2FuIGNvcHkgYW5kIHBhc3RlIGJldHdlZW4gZ3JvdXBzLlxuXHQgKlxuXHQgKiBUT0RPOiBmaWd1cmUgb3V0IGhvdyB0byBtYWtlIHRoaXMgd29yayB3aXRoIG11bHRpcGxlIHdpbmRvd3Ncblx0ICovXG5cdHByaXZhdGUgc3RhdGljIF9jdXJyZW50Q29weU9wZXJhdGlvbj86IHtcblx0XHRyZWFkb25seSBoYW5kbGU6IHN0cmluZztcblx0XHRyZWFkb25seSBvcGVyYXRpb25zOiBSZWFkb25seUFycmF5PENvcHlPcGVyYXRpb24+O1xuXHR9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3I7XG5cblx0cHJpdmF0ZSBfY3VycmVudFBhc3RlT3BlcmF0aW9uPzogQ2FuY2VsYWJsZVByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgX3Bhc3RlQXNBY3Rpb25Db250ZXh0PzogeyByZWFkb25seSBwcmVmZXJyZWQ/OiBQYXN0ZVByZWZlcmVuY2UgfTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wYXN0ZVByb2dyZXNzTWFuYWdlcjogSW5saW5lUHJvZ3Jlc3NNYW5hZ2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wb3N0UGFzdGVXaWRnZXRNYW5hZ2VyOiBQb3N0RWRpdFdpZGdldE1hbmFnZXI8UGFzdGVFZGl0V2l0aFByb3ZpZGVyPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElCdWxrRWRpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYnVsa0VkaXRTZXJ2aWNlOiBJQnVsa0VkaXRTZXJ2aWNlLFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9lZGl0b3IgPSBlZGl0b3I7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25XaWxsQ29weShlID0+IHRoaXMuaGFuZGxlQ29weShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbldpbGxDdXQoZSA9PiB0aGlzLmhhbmRsZUNvcHkoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25XaWxsUGFzdGUoZSA9PiB0aGlzLmhhbmRsZVBhc3RlKGUpKSk7XG5cblx0XHR0aGlzLl9wYXN0ZVByb2dyZXNzTWFuYWdlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbmxpbmVQcm9ncmVzc01hbmFnZXIoJ3Bhc3RlSW50b0VkaXRvcicsIGVkaXRvciwgaW5zdGFudGlhdGlvblNlcnZpY2UpKTtcblxuXHRcdHRoaXMuX3Bvc3RQYXN0ZVdpZGdldE1hbmFnZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQb3N0RWRpdFdpZGdldE1hbmFnZXIsICdwYXN0ZUludG9FZGl0b3InLCBlZGl0b3IsIHBhc3RlV2lkZ2V0VmlzaWJsZUN0eCxcblx0XHRcdHsgaWQ6IGNoYW5nZVBhc3RlVHlwZUNvbW1hbmRJZCwgbGFiZWw6IGxvY2FsaXplKCdwb3N0UGFzdGVXaWRnZXRUaXRsZScsIFwiU2hvdyBwYXN0ZSBvcHRpb25zLi4uXCIpIH0sXG5cdFx0XHQoKSA9PiBDb3B5UGFzdGVDb250cm9sbGVyLl9jb25maWd1cmVEZWZhdWx0QWN0aW9uID8gW0NvcHlQYXN0ZUNvbnRyb2xsZXIuX2NvbmZpZ3VyZURlZmF1bHRBY3Rpb25dIDogW11cblx0XHQpKTtcblx0fVxuXG5cdHB1YmxpYyBjaGFuZ2VQYXN0ZVR5cGUoKSB7XG5cdFx0dGhpcy5fcG9zdFBhc3RlV2lkZ2V0TWFuYWdlci50cnlTaG93U2VsZWN0b3IoKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBwYXN0ZUFzKHByZWZlcnJlZD86IFBhc3RlUHJlZmVyZW5jZSkge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0NvcHlQYXN0ZUNvbnRyb2xsZXIucGFzdGVBcycpO1xuXHRcdHRoaXMuX2VkaXRvci5mb2N1cygpO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdCZWZvcmUgY2FsbGluZyBlZGl0b3IuYWN0aW9uLmNsaXBib2FyZFBhc3RlQWN0aW9uJyk7XG5cdFx0XHR0aGlzLl9wYXN0ZUFzQWN0aW9uQ29udGV4dCA9IHsgcHJlZmVycmVkIH07XG5cdFx0XHRhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnZWRpdG9yLmFjdGlvbi5jbGlwYm9hcmRQYXN0ZUFjdGlvbicpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9wYXN0ZUFzQWN0aW9uQ29udGV4dCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJXaWRnZXRzKCkge1xuXHRcdHRoaXMuX3Bvc3RQYXN0ZVdpZGdldE1hbmFnZXIuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgaXNQYXN0ZUFzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucGFzdGVBcykuZW5hYmxlZDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBmaW5pc2hlZFBhc3RlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2N1cnJlbnRQYXN0ZU9wZXJhdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQ29weShlOiBJQ2xpcGJvYXJkQ29weUV2ZW50KSB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnQ29weVBhc3RlQ29udHJvbGxlciNoYW5kbGVDb3B5Jyk7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzVGV4dEZvY3VzKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBFeHBsaWNpdGx5IGNsZWFyIHRoZSBjbGlwYm9hcmQgaW50ZXJuYWwgc3RhdGUuXG5cdFx0Ly8gVGhpcyBpcyBuZWVkZWQgYmVjYXVzZSBvbiB3ZWIsIHRoZSBicm93c2VyIGNsaXBib2FyZCBpcyBmYWtlZCBvdXQgdXNpbmcgYW4gaW4tbWVtb3J5IHN0b3JlLlxuXHRcdC8vIFRoaXMgbWVhbnMgdGhlIHJlc291cmNlcyBjbGlwYm9hcmQgaXMgbm90IHByb3Blcmx5IHVwZGF0ZWQgd2hlbiBjb3B5aW5nIGZyb20gdGhlIGVkaXRvci5cblx0XHR0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlLmNsZWFySW50ZXJuYWxTdGF0ZT8uKCk7XG5cblx0XHRpZiAoIXRoaXMuaXNQYXN0ZUFzRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLl9lZGl0b3IuX2dldFZpZXdNb2RlbCgpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGlmICghbW9kZWwgfHwgIXZpZXdNb2RlbCB8fCAhc2VsZWN0aW9ucz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmYXVsdFBhc3RlUGF5bG9hZCA9IHtcblx0XHRcdG11bHRpY3Vyc29yVGV4dDogZS5kYXRhVG9Db3B5Lm11bHRpY3Vyc29yVGV4dCA/PyBudWxsLFxuXHRcdFx0cGFzdGVPbk5ld0xpbmU6IGUuZGF0YVRvQ29weS5pc0Zyb21FbXB0eVNlbGVjdGlvbixcblx0XHRcdG1vZGU6IG51bGxcblx0XHR9O1xuXG5cdFx0Y29uc3QgcHJvdmlkZXJzID0gdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlclxuXHRcdFx0Lm9yZGVyZWQobW9kZWwpXG5cdFx0XHQuZmlsdGVyKHggPT4gISF4LnByZXBhcmVEb2N1bWVudFBhc3RlKTtcblx0XHRpZiAoIXByb3ZpZGVycy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuc2V0Q29weU1ldGFkYXRhKGUuY2xpcGJvYXJkRGF0YSwgeyBkZWZhdWx0UGFzdGVQYXlsb2FkIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGFUcmFuc2ZlciA9IG5ldyBWU0RhdGFUcmFuc2ZlcigpO1xuXHRcdGNvbnN0IHByb3ZpZGVyQ29weU1pbWVUeXBlcyA9IHByb3ZpZGVycy5mbGF0TWFwKHggPT4geC5jb3B5TWltZVR5cGVzID8/IFtdKTtcblxuXHRcdC8vIFNhdmUgb2ZmIGEgaGFuZGxlIHBvaW50aW5nIHRvIGRhdGEgdGhhdCBWUyBDb2RlIG1haW50YWlucy5cblx0XHRjb25zdCBoYW5kbGUgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHR0aGlzLnNldENvcHlNZXRhZGF0YShlLmNsaXBib2FyZERhdGEsIHtcblx0XHRcdGlkOiBoYW5kbGUsXG5cdFx0XHRwcm92aWRlckNvcHlNaW1lVHlwZXMsXG5cdFx0XHRkZWZhdWx0UGFzdGVQYXlsb2FkXG5cdFx0fSk7XG5cblx0XHRjb25zdCBvcGVyYXRpb25zID0gcHJvdmlkZXJzLm1hcCgocHJvdmlkZXIpOiBDb3B5T3BlcmF0aW9uID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHByb3ZpZGVyTWltZVR5cGVzOiBwcm92aWRlci5jb3B5TWltZVR5cGVzLFxuXHRcdFx0XHRvcGVyYXRpb246IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+XG5cdFx0XHRcdFx0cHJvdmlkZXIucHJlcGFyZURvY3VtZW50UGFzdGUhKG1vZGVsLCBlLmRhdGFUb0NvcHkuc291cmNlUmFuZ2VzLCBkYXRhVHJhbnNmZXIsIHRva2VuKVxuXHRcdFx0XHRcdFx0LmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH0pKVxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdENvcHlQYXN0ZUNvbnRyb2xsZXIuX2N1cnJlbnRDb3B5T3BlcmF0aW9uPy5vcGVyYXRpb25zLmZvckVhY2goZW50cnkgPT4gZW50cnkub3BlcmF0aW9uLmNhbmNlbCgpKTtcblx0XHRDb3B5UGFzdGVDb250cm9sbGVyLl9jdXJyZW50Q29weU9wZXJhdGlvbiA9IHsgaGFuZGxlLCBvcGVyYXRpb25zIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZVBhc3RlKGU6IElDbGlwYm9hcmRQYXN0ZUV2ZW50KSB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnQ29weVBhc3RlQ29udHJvbGxlciNoYW5kbGVQYXN0ZSBmb3IgaWQgOiAnLCBlLm1ldGFkYXRhPy5pZCk7XG5cblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNUZXh0Rm9jdXMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGFUcmFuc2ZlciA9IGUudG9FeHRlcm5hbFZTRGF0YVRyYW5zZmVyKCk7XG5cdFx0aWYgKCFkYXRhVHJhbnNmZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZGF0YVRyYW5zZmVyLmRlbGV0ZSh2c2NvZGVDbGlwYm9hcmRNaW1lKTtcblxuXHRcdE1lc3NhZ2VDb250cm9sbGVyLmdldCh0aGlzLl9lZGl0b3IpPy5jbG9zZU1lc3NhZ2UoKTtcblx0XHR0aGlzLl9jdXJyZW50UGFzdGVPcGVyYXRpb24/LmNhbmNlbCgpO1xuXHRcdHRoaXMuX2N1cnJlbnRQYXN0ZU9wZXJhdGlvbiA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0aWYgKCFzZWxlY3Rpb25zPy5sZW5ndGggfHwgIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKFxuXHRcdFx0dGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucmVhZE9ubHkpIC8vIE5ldmVyIGVuYWJsZWQgaWYgZWRpdG9yIGlzIHJlYWRvbmx5LlxuXHRcdFx0fHwgKCF0aGlzLmlzUGFzdGVBc0VuYWJsZWQoKSAmJiAhdGhpcy5fcGFzdGVBc0FjdGlvbkNvbnRleHQpIC8vIE9yIGZlYXR1cmUgZGlzYWJsZWQgKGJ1dCBzdGlsbCBlbmFibGUgaWYgcGFzdGUgd2FzIGV4cGxpY2l0bHkgcmVxdWVzdGVkKVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5mZXRjaENvcHlNZXRhZGF0YShlKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdDb3B5UGFzdGVDb250cm9sbGVyI2hhbmRsZVBhc3RlIHdpdGggbWV0YWRhdGEgOiAnLCBtZXRhZGF0YT8uaWQsICcgYW5kIHRleHQubGVuZ3RoIDogJywgZS5jbGlwYm9hcmREYXRhLmdldERhdGEoJ3RleHQvcGxhaW4nKS5sZW5ndGgpO1xuXG5cdFx0Y29uc3QgZmlsZVR5cGVzID0gQXJyYXkuZnJvbShlLmNsaXBib2FyZERhdGEuZmlsZXMpLm1hcChmaWxlID0+IGZpbGUudHlwZSk7XG5cblx0XHRjb25zdCBhbGxQb3RlbnRpYWxNaW1lVHlwZXMgPSBbXG5cdFx0XHQuLi5lLmNsaXBib2FyZERhdGEudHlwZXMsXG5cdFx0XHQuLi5maWxlVHlwZXMsXG5cdFx0XHQuLi5tZXRhZGF0YT8ucHJvdmlkZXJDb3B5TWltZVR5cGVzID8/IFtdLFxuXHRcdFx0Ly8gVE9ETzogYWx3YXlzIGFkZHMgYHVyaS1saXN0YCBiZWNhdXNlIHRoaXMgZ2V0IHNldCBpZiB0aGVyZSBhcmUgcmVzb3VyY2VzIGluIHRoZSBzeXN0ZW0gY2xpcGJvYXJkLlxuXHRcdFx0Ly8gSG93ZXZlciB3ZSBjYW4gb25seSBjaGVjayB0aGUgc3lzdGVtIGNsaXBib2FyZCBhc3luYy4gRm9yIHRoaXMgZWFybHkgY2hlY2ssIGp1c3QgYWRkIGl0IGluLlxuXHRcdFx0Ly8gV2UgZmlsdGVyIHByb3ZpZGVycyBhZ2FpbiBvbmNlIHdlIGhhdmUgdGhlIGZpbmFsIGRhdGFUcmFuc2ZlciB3ZSB3aWxsIHVzZS5cblx0XHRcdE1pbWVzLnVyaUxpc3QsXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFsbFByb3ZpZGVycyA9IHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXJcblx0XHRcdC5vcmRlcmVkKG1vZGVsKVxuXHRcdFx0LmZpbHRlcihwcm92aWRlciA9PiB7XG5cdFx0XHRcdC8vIEZpbHRlciBvdXQgcHJvdmlkZXJzIHRoYXQgZG9uJ3QgbWF0Y2ggdGhlIHJlcXVlc3RlZCBwYXN0ZSB0eXBlc1xuXHRcdFx0XHRjb25zdCBwcmVmZXJlbmNlID0gdGhpcy5fcGFzdGVBc0FjdGlvbkNvbnRleHQ/LnByZWZlcnJlZDtcblx0XHRcdFx0aWYgKHByZWZlcmVuY2UpIHtcblx0XHRcdFx0XHRpZiAoIXRoaXMucHJvdmlkZXJNYXRjaGVzUHJlZmVyZW5jZShwcm92aWRlciwgcHJlZmVyZW5jZSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBbmQgcHJvdmlkZXJzIHRoYXQgZG9uJ3QgaGFuZGxlIGFueSBvZiBtaW1lIHR5cGVzIGluIHRoZSBjbGlwYm9hcmRcblx0XHRcdFx0cmV0dXJuIHByb3ZpZGVyLnBhc3RlTWltZVR5cGVzPy5zb21lKHR5cGUgPT4gbWF0Y2hlc01pbWVUeXBlKHR5cGUsIGFsbFBvdGVudGlhbE1pbWVUeXBlcykpO1xuXHRcdFx0fSk7XG5cdFx0aWYgKCFhbGxQcm92aWRlcnMubGVuZ3RoKSB7XG5cdFx0XHRpZiAodGhpcy5fcGFzdGVBc0FjdGlvbkNvbnRleHQ/LnByZWZlcnJlZCkge1xuXHRcdFx0XHR0aGlzLnNob3dQYXN0ZUFzTm9FZGl0TWVzc2FnZShzZWxlY3Rpb25zLCB0aGlzLl9wYXN0ZUFzQWN0aW9uQ29udGV4dC5wcmVmZXJyZWQpO1xuXG5cdFx0XHRcdC8vIEFsc28gcHJldmVudCBkZWZhdWx0IHBhc3RlIGZyb20gYXBwbHlpbmdcblx0XHRcdFx0ZS5zZXRIYW5kbGVkKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUHJldmVudCB0aGUgZWRpdG9yJ3MgZGVmYXVsdCBwYXN0ZSBoYW5kbGVyIGZyb20gcnVubmluZy5cblx0XHQvLyBOb3RlIHRoYXQgYWZ0ZXIgdGhpcyBwb2ludCwgd2UgYXJlIGZ1bGx5IHJlc3BvbnNpYmxlIGZvciBoYW5kbGluZyBwYXN0ZS5cblx0XHQvLyBJZiB3ZSBjYW4ndCBwcm92aWRlciBhIHBhc3RlIGZvciBhbnkgcmVhc29uLCB3ZSBuZWVkIHRvIGV4cGxpY2l0bHkgZGVsZWdhdGUgcGFzdGluZyBiYWNrIHRvIHRoZSBlZGl0b3IuXG5cdFx0ZS5zZXRIYW5kbGVkKCk7XG5cblx0XHRpZiAodGhpcy5fcGFzdGVBc0FjdGlvbkNvbnRleHQpIHtcblx0XHRcdHRoaXMuc2hvd1Bhc3RlQXNQaWNrKHRoaXMuX3Bhc3RlQXNBY3Rpb25Db250ZXh0LnByZWZlcnJlZCwgYWxsUHJvdmlkZXJzLCBzZWxlY3Rpb25zLCBkYXRhVHJhbnNmZXIsIG1ldGFkYXRhKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kb1Bhc3RlSW5saW5lKGFsbFByb3ZpZGVycywgc2VsZWN0aW9ucywgZGF0YVRyYW5zZmVyLCBtZXRhZGF0YSwgZS5icm93c2VyRXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvd1Bhc3RlQXNOb0VkaXRNZXNzYWdlKHNlbGVjdGlvbnM6IHJlYWRvbmx5IFNlbGVjdGlvbltdLCBwcmVmZXJlbmNlOiBQYXN0ZVByZWZlcmVuY2UpIHtcblx0XHRjb25zdCBraW5kTGFiZWwgPSAnb25seScgaW4gcHJlZmVyZW5jZVxuXHRcdFx0PyBwcmVmZXJlbmNlLm9ubHkudmFsdWVcblx0XHRcdDogJ3ByZWZlcmVuY2VzJyBpbiBwcmVmZXJlbmNlXG5cdFx0XHRcdD8gKHByZWZlcmVuY2UucHJlZmVyZW5jZXMubGVuZ3RoID8gcHJlZmVyZW5jZS5wcmVmZXJlbmNlcy5tYXAocHJlZmVyZW5jZSA9PiBwcmVmZXJlbmNlLnZhbHVlKS5qb2luKCcsICcpIDogbG9jYWxpemUoJ25vUHJlZmVyZW5jZXMnLCBcImVtcHR5XCIpKVxuXHRcdFx0XHQ6IHByZWZlcmVuY2UucHJvdmlkZXJJZDtcblxuXHRcdE1lc3NhZ2VDb250cm9sbGVyLmdldCh0aGlzLl9lZGl0b3IpPy5zaG93TWVzc2FnZShsb2NhbGl6ZSgncGFzdGVBc0Vycm9yJywgXCJObyBwYXN0ZSBlZGl0cyBmb3IgJ3swfScgZm91bmRcIiwga2luZExhYmVsKSwgc2VsZWN0aW9uc1swXS5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1Bhc3RlSW5saW5lKGFsbFByb3ZpZGVyczogcmVhZG9ubHkgRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlcltdLCBzZWxlY3Rpb25zOiByZWFkb25seSBTZWxlY3Rpb25bXSwgZGF0YVRyYW5zZmVyOiBWU0RhdGFUcmFuc2ZlciwgbWV0YWRhdGE6IENvcHlNZXRhZGF0YSB8IHVuZGVmaW5lZCwgY2xpcGJvYXJkRXZlbnQ6IENsaXBib2FyZEV2ZW50IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnQ29weVBhc3RlQ29udHJvbGxlciNkb1Bhc3RlSW5saW5lJyk7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9yO1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3JTdGF0ZUN0cyA9IG5ldyBFZGl0b3JTdGF0ZUNhbmNlbGxhdGlvblRva2VuU291cmNlKGVkaXRvciwgQ29kZUVkaXRvclN0YXRlRmxhZy5WYWx1ZSB8IENvZGVFZGl0b3JTdGF0ZUZsYWcuU2VsZWN0aW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcCA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKGFzeW5jIChwVG9rZW4pID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX2VkaXRvcjtcblx0XHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBjdHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHBUb2tlbikpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvclN0YXRlQ3RzLnRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IGN0cy5jYW5jZWwoKSkpO1xuXG5cdFx0XHRjb25zdCB0b2tlbiA9IGN0cy50b2tlbjtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMubWVyZ2VJbkRhdGFGcm9tQ29weShhbGxQcm92aWRlcnMsIGRhdGFUcmFuc2ZlciwgbWV0YWRhdGEsIHRva2VuKTtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc3VwcG9ydGVkUHJvdmlkZXJzID0gYWxsUHJvdmlkZXJzLmZpbHRlcihwcm92aWRlciA9PiB0aGlzLmlzU3VwcG9ydGVkUGFzdGVQcm92aWRlcihwcm92aWRlciwgZGF0YVRyYW5zZmVyKSk7XG5cdFx0XHRcdGlmICghc3VwcG9ydGVkUHJvdmlkZXJzLmxlbmd0aFxuXHRcdFx0XHRcdHx8IChzdXBwb3J0ZWRQcm92aWRlcnMubGVuZ3RoID09PSAxICYmIHN1cHBvcnRlZFByb3ZpZGVyc1swXSBpbnN0YW5jZW9mIERlZmF1bHRUZXh0UGFzdGVPckRyb3BFZGl0UHJvdmlkZXIpIC8vIE9ubHkgb3VyIGRlZmF1bHQgdGV4dCBwcm92aWRlciBpcyBhY3RpdmVcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuYXBwbHlEZWZhdWx0UGFzdGVIYW5kbGVyKGRhdGFUcmFuc2ZlciwgbWV0YWRhdGEsIHRva2VuLCBjbGlwYm9hcmRFdmVudCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjb250ZXh0OiBEb2N1bWVudFBhc3RlQ29udGV4dCA9IHtcblx0XHRcdFx0XHR0cmlnZ2VyS2luZDogRG9jdW1lbnRQYXN0ZVRyaWdnZXJLaW5kLkF1dG9tYXRpYyxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBlZGl0U2Vzc2lvbiA9IGF3YWl0IHRoaXMuZ2V0UGFzdGVFZGl0cyhzdXBwb3J0ZWRQcm92aWRlcnMsIGRhdGFUcmFuc2ZlciwgbW9kZWwsIHNlbGVjdGlvbnMsIGNvbnRleHQsIHRva2VuKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRTZXNzaW9uKTtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgdGhlIG9ubHkgZWRpdCByZXR1cm5lZCBpcyBvdXIgZGVmYXVsdCB0ZXh0IGVkaXQsIHVzZSB0aGUgZGVmYXVsdCBwYXN0ZSBoYW5kbGVyXG5cdFx0XHRcdGlmIChlZGl0U2Vzc2lvbi5lZGl0cy5sZW5ndGggPT09IDEgJiYgZWRpdFNlc3Npb24uZWRpdHNbMF0ucHJvdmlkZXIgaW5zdGFuY2VvZiBEZWZhdWx0VGV4dFBhc3RlT3JEcm9wRWRpdFByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuYXBwbHlEZWZhdWx0UGFzdGVIYW5kbGVyKGRhdGFUcmFuc2ZlciwgbWV0YWRhdGEsIHRva2VuLCBjbGlwYm9hcmRFdmVudCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZWRpdFNlc3Npb24uZWRpdHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2FuU2hvd1dpZGdldCA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnBhc3RlQXMpLnNob3dQYXN0ZVNlbGVjdG9yID09PSAnYWZ0ZXJQYXN0ZSc7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3Bvc3RQYXN0ZVdpZGdldE1hbmFnZXIuYXBwbHlFZGl0QW5kU2hvd0lmTmVlZGVkKHNlbGVjdGlvbnMsIHsgYWN0aXZlRWRpdEluZGV4OiB0aGlzLmdldEluaXRpYWxBY3RpdmVFZGl0SW5kZXgobW9kZWwsIGVkaXRTZXNzaW9uLmVkaXRzKSwgYWxsRWRpdHM6IGVkaXRTZXNzaW9uLmVkaXRzIH0sIGNhblNob3dXaWRnZXQsIGFzeW5jIChlZGl0LCByZXNvbHZlVG9rZW4pID0+IHtcblx0XHRcdFx0XHRcdGlmICghZWRpdC5wcm92aWRlci5yZXNvbHZlRG9jdW1lbnRQYXN0ZUVkaXQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVkaXQ7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IHJlc29sdmVQID0gZWRpdC5wcm92aWRlci5yZXNvbHZlRG9jdW1lbnRQYXN0ZUVkaXQoZWRpdCwgcmVzb2x2ZVRva2VuKTtcblx0XHRcdFx0XHRcdGNvbnN0IHNob3dQID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLl9wYXN0ZVByb2dyZXNzTWFuYWdlci5zaG93V2hpbGUoc2VsZWN0aW9uc1swXS5nZXRFbmRQb3NpdGlvbigpLCBsb2NhbGl6ZSgncmVzb2x2ZVByb2Nlc3MnLCBcIlJlc29sdmluZyBwYXN0ZSBlZGl0IGZvciAnezB9Jy4gQ2xpY2sgdG8gY2FuY2VsXCIsIGVkaXQudGl0bGUpLCByYWNlQ2FuY2VsbGF0aW9uKFByb21pc2UucmFjZShbc2hvd1AucCwgcmVzb2x2ZVBdKSwgcmVzb2x2ZVRva2VuKSwge1xuXHRcdFx0XHRcdFx0XHRjYW5jZWw6ICgpID0+IHNob3dQLmNhbmNlbCgpXG5cdFx0XHRcdFx0XHR9LCAwKTtcblxuXHRcdFx0XHRcdFx0aWYgKHJlc29sdmVkKSB7XG5cdFx0XHRcdFx0XHRcdGVkaXQuaW5zZXJ0VGV4dCA9IHJlc29sdmVkLmluc2VydFRleHQ7XG5cdFx0XHRcdFx0XHRcdGVkaXQuYWRkaXRpb25hbEVkaXQgPSByZXNvbHZlZC5hZGRpdGlvbmFsRWRpdDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBlZGl0O1xuXHRcdFx0XHRcdH0sIHRva2VuKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGF3YWl0IHRoaXMuYXBwbHlEZWZhdWx0UGFzdGVIYW5kbGVyKGRhdGFUcmFuc2ZlciwgbWV0YWRhdGEsIHRva2VuLCBjbGlwYm9hcmRFdmVudCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdGlmICh0aGlzLl9jdXJyZW50UGFzdGVPcGVyYXRpb24gPT09IHApIHtcblx0XHRcdFx0XHR0aGlzLl9jdXJyZW50UGFzdGVPcGVyYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3Bhc3RlUHJvZ3Jlc3NNYW5hZ2VyLnNob3dXaGlsZShzZWxlY3Rpb25zWzBdLmdldEVuZFBvc2l0aW9uKCksIGxvY2FsaXplKCdwYXN0ZUludG9FZGl0b3JQcm9ncmVzcycsIFwiUnVubmluZyBwYXN0ZSBoYW5kbGVycy4gQ2xpY2sgdG8gY2FuY2VsIGFuZCBkbyBiYXNpYyBwYXN0ZVwiKSwgcCwge1xuXHRcdFx0Y2FuY2VsOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHAuY2FuY2VsKCk7XG5cdFx0XHRcdGlmIChlZGl0b3JTdGF0ZUN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGF3YWl0IHRoaXMuYXBwbHlEZWZhdWx0UGFzdGVIYW5kbGVyKGRhdGFUcmFuc2ZlciwgbWV0YWRhdGEsIGVkaXRvclN0YXRlQ3RzLnRva2VuLCBjbGlwYm9hcmRFdmVudCk7XG5cdFx0XHR9XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRlZGl0b3JTdGF0ZUN0cy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fY3VycmVudFBhc3RlT3BlcmF0aW9uID0gcDtcblx0fVxuXG5cdHByaXZhdGUgc2hvd1Bhc3RlQXNQaWNrKHByZWZlcmVuY2U6IFBhc3RlUHJlZmVyZW5jZSB8IHVuZGVmaW5lZCwgYWxsUHJvdmlkZXJzOiByZWFkb25seSBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyW10sIHNlbGVjdGlvbnM6IHJlYWRvbmx5IFNlbGVjdGlvbltdLCBkYXRhVHJhbnNmZXI6IFZTRGF0YVRyYW5zZmVyLCBtZXRhZGF0YTogQ29weU1ldGFkYXRhIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnQ29weVBhc3RlQ29udHJvbGxlciNzaG93UGFzdGVBc1BpY2snKTtcblx0XHRjb25zdCBwID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgKHRva2VuKSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9lZGl0b3I7XG5cdFx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgdG9rZW5Tb3VyY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVkaXRvclN0YXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoZWRpdG9yLCBDb2RlRWRpdG9yU3RhdGVGbGFnLlZhbHVlIHwgQ29kZUVkaXRvclN0YXRlRmxhZy5TZWxlY3Rpb24sIHVuZGVmaW5lZCwgdG9rZW4pKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMubWVyZ2VJbkRhdGFGcm9tQ29weShhbGxQcm92aWRlcnMsIGRhdGFUcmFuc2ZlciwgbWV0YWRhdGEsIHRva2VuU291cmNlLnRva2VuKTtcblx0XHRcdFx0aWYgKHRva2VuU291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRmlsdGVyIG91dCBhbnkgcHJvdmlkZXJzIHRoZSBkb24ndCBtYXRjaCB0aGUgZnVsbCBkYXRhIHRyYW5zZmVyIHdlIHdpbGwgc2VuZCB0aGVtLlxuXHRcdFx0XHRsZXQgc3VwcG9ydGVkUHJvdmlkZXJzID0gYWxsUHJvdmlkZXJzLmZpbHRlcihwcm92aWRlciA9PiB0aGlzLmlzU3VwcG9ydGVkUGFzdGVQcm92aWRlcihwcm92aWRlciwgZGF0YVRyYW5zZmVyLCBwcmVmZXJlbmNlKSk7XG5cdFx0XHRcdGlmIChwcmVmZXJlbmNlKSB7XG5cdFx0XHRcdFx0Ly8gV2UgYXJlIGxvb2tpbmcgZm9yIGEgc3BlY2lmaWMgZWRpdFxuXHRcdFx0XHRcdHN1cHBvcnRlZFByb3ZpZGVycyA9IHN1cHBvcnRlZFByb3ZpZGVycy5maWx0ZXIocHJvdmlkZXIgPT4gdGhpcy5wcm92aWRlck1hdGNoZXNQcmVmZXJlbmNlKHByb3ZpZGVyLCBwcmVmZXJlbmNlKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjb250ZXh0OiBEb2N1bWVudFBhc3RlQ29udGV4dCA9IHtcblx0XHRcdFx0XHR0cmlnZ2VyS2luZDogRG9jdW1lbnRQYXN0ZVRyaWdnZXJLaW5kLlBhc3RlQXMsXG5cdFx0XHRcdFx0b25seTogcHJlZmVyZW5jZSAmJiAnb25seScgaW4gcHJlZmVyZW5jZSA/IHByZWZlcmVuY2Uub25seSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fTtcblx0XHRcdFx0bGV0IGVkaXRTZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IHRoaXMuZ2V0UGFzdGVFZGl0cyhzdXBwb3J0ZWRQcm92aWRlcnMsIGRhdGFUcmFuc2ZlciwgbW9kZWwsIHNlbGVjdGlvbnMsIGNvbnRleHQsIHRva2VuU291cmNlLnRva2VuKSk7XG5cdFx0XHRcdGlmICh0b2tlblNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEZpbHRlciBvdXQgYW55IGVkaXRzIHRoYXQgZG9uJ3QgbWF0Y2ggdGhlIHJlcXVlc3RlZCBraW5kXG5cdFx0XHRcdGlmIChwcmVmZXJlbmNlKSB7XG5cdFx0XHRcdFx0ZWRpdFNlc3Npb24gPSB7XG5cdFx0XHRcdFx0XHRlZGl0czogZWRpdFNlc3Npb24uZWRpdHMuZmlsdGVyKGVkaXQgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoJ29ubHknIGluIHByZWZlcmVuY2UpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gcHJlZmVyZW5jZS5vbmx5LmNvbnRhaW5zKGVkaXQua2luZCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoJ3ByZWZlcmVuY2VzJyBpbiBwcmVmZXJlbmNlKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHByZWZlcmVuY2UucHJlZmVyZW5jZXMuc29tZShwcmVmZXJlbmNlID0+IHByZWZlcmVuY2UuY29udGFpbnMoZWRpdC5raW5kKSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHByZWZlcmVuY2UucHJvdmlkZXJJZCA9PT0gZWRpdC5wcm92aWRlci5pZDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0XHRkaXNwb3NlOiBlZGl0U2Vzc2lvbi5kaXNwb3NlXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghZWRpdFNlc3Npb24uZWRpdHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0aWYgKHByZWZlcmVuY2UpIHtcblx0XHRcdFx0XHRcdHRoaXMuc2hvd1Bhc3RlQXNOb0VkaXRNZXNzYWdlKHNlbGVjdGlvbnMsIHByZWZlcmVuY2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgcGlja2VkRWRpdDogRG9jdW1lbnRQYXN0ZUVkaXQgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChwcmVmZXJlbmNlKSB7XG5cdFx0XHRcdFx0cGlja2VkRWRpdCA9IGVkaXRTZXNzaW9uLmVkaXRzLmF0KDApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHR5cGUgSXRlbVdpdGhFZGl0ID0gSVF1aWNrUGlja0l0ZW0gJiB7IGVkaXQ/OiBEb2N1bWVudFBhc3RlRWRpdCB9O1xuXHRcdFx0XHRcdGNvbnN0IGNvbmZpZ3VyZURlZmF1bHRJdGVtOiBJdGVtV2l0aEVkaXQgPSB7XG5cdFx0XHRcdFx0XHRpZDogJ2VkaXRvci5wYXN0ZUFzLmRlZmF1bHQnLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwYXN0ZUFzRGVmYXVsdCcsIFwiQ29uZmlndXJlIGRlZmF1bHQgcGFzdGUgYWN0aW9uXCIpLFxuXHRcdFx0XHRcdFx0ZWRpdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2s8SXRlbVdpdGhFZGl0Pihcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0Li4uZWRpdFNlc3Npb24uZWRpdHMubWFwKChlZGl0KTogSXRlbVdpdGhFZGl0ID0+ICh7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGVkaXQudGl0bGUsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGVkaXQua2luZD8udmFsdWUsXG5cdFx0XHRcdFx0XHRcdFx0ZWRpdCxcblx0XHRcdFx0XHRcdFx0fSkpLFxuXHRcdFx0XHRcdFx0XHQuLi4oQ29weVBhc3RlQ29udHJvbGxlci5fY29uZmlndXJlRGVmYXVsdEFjdGlvbiA/IFtcblx0XHRcdFx0XHRcdFx0XHR1cGNhc3Q8SVF1aWNrUGlja1NlcGFyYXRvcj4oeyB0eXBlOiAnc2VwYXJhdG9yJyB9KSxcblx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogQ29weVBhc3RlQ29udHJvbGxlci5fY29uZmlndXJlRGVmYXVsdEFjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRcdFx0XHRcdGVkaXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdF0gOiBbXSlcblx0XHRcdFx0XHRcdF0sIHtcblx0XHRcdFx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgncGFzdGVBc1BpY2tlclBsYWNlaG9sZGVyJywgXCJTZWxlY3QgUGFzdGUgQWN0aW9uXCIpLFxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0aWYgKHNlbGVjdGVkID09PSBjb25maWd1cmVEZWZhdWx0SXRlbSkge1xuXHRcdFx0XHRcdFx0Q29weVBhc3RlQ29udHJvbGxlci5fY29uZmlndXJlRGVmYXVsdEFjdGlvbj8ucnVuKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cGlja2VkRWRpdCA9IHNlbGVjdGVkPy5lZGl0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFwaWNrZWRFZGl0KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY29tYmluZWRXb3Jrc3BhY2VFZGl0ID0gY3JlYXRlQ29tYmluZWRXb3Jrc3BhY2VFZGl0KG1vZGVsLnVyaSwgc2VsZWN0aW9ucywgcGlja2VkRWRpdCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2J1bGtFZGl0U2VydmljZS5hcHBseShjb21iaW5lZFdvcmtzcGFjZUVkaXQsIHsgZWRpdG9yOiB0aGlzLl9lZGl0b3IgfSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdGlmICh0aGlzLl9jdXJyZW50UGFzdGVPcGVyYXRpb24gPT09IHApIHtcblx0XHRcdFx0XHR0aGlzLl9jdXJyZW50UGFzdGVPcGVyYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3Byb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uV2luZG93LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdwYXN0ZUFzUHJvZ3Jlc3MnLCBcIlJ1bm5pbmcgcGFzdGUgaGFuZGxlcnNcIiksXG5cdFx0fSwgKCkgPT4gcCk7XG5cdH1cblxuXHRwcml2YXRlIHNldENvcHlNZXRhZGF0YShjbGlwYm9hcmREYXRhOiBJV3JpdGFibGVDbGlwYm9hcmREYXRhLCBtZXRhZGF0YTogQ29weU1ldGFkYXRhKSB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnQ29weVBhc3RlQ29udHJvbGxlciNzZXRDb3B5TWV0YWRhdGEgbmV3IGlkIDogJywgbWV0YWRhdGEuaWQpO1xuXHRcdGNsaXBib2FyZERhdGEuc2V0RGF0YSh2c2NvZGVDbGlwYm9hcmRNaW1lLCBKU09OLnN0cmluZ2lmeShtZXRhZGF0YSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBmZXRjaENvcHlNZXRhZGF0YShlOiBJQ2xpcGJvYXJkUGFzdGVFdmVudCk6IENvcHlNZXRhZGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnQ29weVBhc3RlQ29udHJvbGxlciNmZXRjaENvcHlNZXRhZGF0YScpO1xuXG5cdFx0Ly8gUHJlZmVyIHVzaW5nIHRoZSBjbGlwYm9hcmQgZGF0YSB3ZSBzYXZlZCBvZmZcblx0XHRjb25zdCByYXdNZXRhZGF0YSA9IGUuY2xpcGJvYXJkRGF0YS5nZXREYXRhKHZzY29kZUNsaXBib2FyZE1pbWUpO1xuXHRcdGlmIChyYXdNZXRhZGF0YSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIEpTT04ucGFyc2UocmF3TWV0YWRhdGEpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGUubWV0YWRhdGEpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRlZmF1bHRQYXN0ZVBheWxvYWQ6IHtcblx0XHRcdFx0XHRtb2RlOiBlLm1ldGFkYXRhLm1vZGUsXG5cdFx0XHRcdFx0bXVsdGljdXJzb3JUZXh0OiBlLm1ldGFkYXRhLm11bHRpY3Vyc29yVGV4dCA/PyBudWxsLFxuXHRcdFx0XHRcdHBhc3RlT25OZXdMaW5lOiAhIWUubWV0YWRhdGEuaXNGcm9tRW1wdHlTZWxlY3Rpb24sXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1lcmdlSW5EYXRhRnJvbUNvcHkoYWxsUHJvdmlkZXJzOiByZWFkb25seSBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyW10sIGRhdGFUcmFuc2ZlcjogVlNEYXRhVHJhbnNmZXIsIG1ldGFkYXRhOiBDb3B5TWV0YWRhdGEgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0NvcHlQYXN0ZUNvbnRyb2xsZXIjbWVyZ2VJbkRhdGFGcm9tQ29weSB3aXRoIG1ldGFkYXRhIDogJywgbWV0YWRhdGE/LmlkKTtcblx0XHRpZiAobWV0YWRhdGE/LmlkICYmIENvcHlQYXN0ZUNvbnRyb2xsZXIuX2N1cnJlbnRDb3B5T3BlcmF0aW9uPy5oYW5kbGUgPT09IG1ldGFkYXRhLmlkKSB7XG5cdFx0XHQvLyBPbmx5IHJlc29sdmUgcHJvdmlkZXJzIHRoYXQgaGF2ZSBkYXRhIHdlIG1heSBjYXJlIGFib3V0XG5cdFx0XHRjb25zdCB0b1Jlc29sdmUgPSBDb3B5UGFzdGVDb250cm9sbGVyLl9jdXJyZW50Q29weU9wZXJhdGlvbi5vcGVyYXRpb25zXG5cdFx0XHRcdC5maWx0ZXIob3AgPT4gYWxsUHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4gcHJvdmlkZXIucGFzdGVNaW1lVHlwZXMuc29tZSh0eXBlID0+IG1hdGNoZXNNaW1lVHlwZSh0eXBlLCBvcC5wcm92aWRlck1pbWVUeXBlcykpKSlcblx0XHRcdFx0Lm1hcChvcCA9PiBvcC5vcGVyYXRpb24pO1xuXG5cdFx0XHRjb25zdCB0b01lcmdlUmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHRvUmVzb2x2ZSk7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBWYWx1ZXMgZnJvbSBoaWdoZXIgcHJpb3JpdHkgcHJvdmlkZXJzIHNob3VsZCBvdmVyd3JpdGUgdmFsdWVzIGZyb20gbG93ZXIgcHJpb3JpdHkgb25lcy5cblx0XHRcdC8vIFJldmVyc2UgdGhlIGFycmF5IHRvIHNvIHRoYXQgdGhlIGNhbGxzIHRvIGBEYXRhVHJhbnNmZXIucmVwbGFjZWAgbGF0ZXIgd2lsbCBkbyB0aGlzXG5cdFx0XHRmb3IgKGNvbnN0IHRvTWVyZ2VEYXRhIG9mIHRvTWVyZ2VSZXN1bHRzLnJldmVyc2UoKSkge1xuXHRcdFx0XHRpZiAodG9NZXJnZURhdGEpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiB0b01lcmdlRGF0YSkge1xuXHRcdFx0XHRcdFx0ZGF0YVRyYW5zZmVyLnJlcGxhY2Uoa2V5LCB2YWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFkYXRhVHJhbnNmZXIuaGFzKE1pbWVzLnVyaUxpc3QpKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZXMgPSBhd2FpdCB0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlLnJlYWRSZXNvdXJjZXMoKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXNvdXJjZXMubGVuZ3RoKSB7XG5cdFx0XHRcdGRhdGFUcmFuc2Zlci5hcHBlbmQoTWltZXMudXJpTGlzdCwgY3JlYXRlU3RyaW5nRGF0YVRyYW5zZmVySXRlbShVcmlMaXN0LmNyZWF0ZShyZXNvdXJjZXMpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRQYXN0ZUVkaXRzKHByb3ZpZGVyczogcmVhZG9ubHkgRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlcltdLCBkYXRhVHJhbnNmZXI6IFZTRGF0YVRyYW5zZmVyLCBtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogcmVhZG9ubHkgU2VsZWN0aW9uW10sIGNvbnRleHQ6IERvY3VtZW50UGFzdGVDb250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPERvY3VtZW50UGFzdGVXaXRoUHJvdmlkZXJFZGl0c1Nlc3Npb24+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCByYWNlQ2FuY2VsbGF0aW9uKFxuXHRcdFx0UHJvbWlzZS5hbGwocHJvdmlkZXJzLm1hcChhc3luYyBwcm92aWRlciA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdHMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlRG9jdW1lbnRQYXN0ZUVkaXRzPy4obW9kZWwsIHNlbGVjdGlvbnMsIGRhdGFUcmFuc2ZlciwgY29udGV4dCwgdG9rZW4pO1xuXHRcdFx0XHRcdGlmIChlZGl0cykge1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGVkaXRzPy5lZGl0cz8ubWFwKGVkaXQgPT4gKHsgLi4uZWRpdCwgcHJvdmlkZXIgfSkpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5lcnJvcihlcnIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSksXG5cdFx0XHR0b2tlbik7XG5cdFx0Y29uc3QgZWRpdHMgPSBjb2FsZXNjZShyZXN1bHRzID8/IFtdKS5mbGF0KCkuZmlsdGVyKGVkaXQgPT4ge1xuXHRcdFx0cmV0dXJuICFjb250ZXh0Lm9ubHkgfHwgY29udGV4dC5vbmx5LmNvbnRhaW5zKGVkaXQua2luZCk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVkaXRzOiBzb3J0RWRpdHNCeVlpZWxkVG8oZWRpdHMpLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYXBwbHlEZWZhdWx0UGFzdGVIYW5kbGVyKGRhdGFUcmFuc2ZlcjogVlNEYXRhVHJhbnNmZXIsIG1ldGFkYXRhOiBDb3B5TWV0YWRhdGEgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY2xpcGJvYXJkRXZlbnQ6IENsaXBib2FyZEV2ZW50IHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgdGV4dERhdGFUcmFuc2ZlciA9IGRhdGFUcmFuc2Zlci5nZXQoTWltZXMudGV4dCkgPz8gZGF0YVRyYW5zZmVyLmdldCgndGV4dCcpO1xuXHRcdGNvbnN0IHRleHQgPSAoYXdhaXQgdGV4dERhdGFUcmFuc2Zlcj8uYXNTdHJpbmcoKSkgPz8gJyc7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGF5bG9hZDogUGFzdGVQYXlsb2FkID0ge1xuXHRcdFx0Y2xpcGJvYXJkRXZlbnQsXG5cdFx0XHR0ZXh0LFxuXHRcdFx0cGFzdGVPbk5ld0xpbmU6IG1ldGFkYXRhPy5kZWZhdWx0UGFzdGVQYXlsb2FkLnBhc3RlT25OZXdMaW5lID8/IGZhbHNlLFxuXHRcdFx0bXVsdGljdXJzb3JUZXh0OiBtZXRhZGF0YT8uZGVmYXVsdFBhc3RlUGF5bG9hZC5tdWx0aWN1cnNvclRleHQgPz8gbnVsbCxcblx0XHRcdG1vZGU6IG51bGwsXG5cdFx0fTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdDb3B5UGFzdGVDb250cm9sbGVyI2FwcGx5RGVmYXVsdFBhc3RlSGFuZGxlciBmb3IgaWQgOiAnLCBtZXRhZGF0YT8uaWQpO1xuXHRcdHRoaXMuX2VkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuUGFzdGUsIHBheWxvYWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbHRlciBvdXQgcHJvdmlkZXJzIGlmIHRoZXk6XG5cdCAqIC0gRG9uJ3QgaGFuZGxlIGFueSBvZiB0aGUgZGF0YSB0cmFuc2ZlciB0eXBlcyB3ZSBoYXZlXG5cdCAqIC0gRG9uJ3QgbWF0Y2ggdGhlIHByZWZlcnJlZCBwYXN0ZSBraW5kXG5cdCAqL1xuXHRwcml2YXRlIGlzU3VwcG9ydGVkUGFzdGVQcm92aWRlcihwcm92aWRlcjogRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlciwgZGF0YVRyYW5zZmVyOiBWU0RhdGFUcmFuc2ZlciwgcHJlZmVyZW5jZT86IFBhc3RlUHJlZmVyZW5jZSk6IGJvb2xlYW4ge1xuXHRcdGlmICghcHJvdmlkZXIucGFzdGVNaW1lVHlwZXM/LnNvbWUodHlwZSA9PiBkYXRhVHJhbnNmZXIubWF0Y2hlcyh0eXBlKSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gIXByZWZlcmVuY2UgfHwgdGhpcy5wcm92aWRlck1hdGNoZXNQcmVmZXJlbmNlKHByb3ZpZGVyLCBwcmVmZXJlbmNlKTtcblx0fVxuXG5cdHByaXZhdGUgcHJvdmlkZXJNYXRjaGVzUHJlZmVyZW5jZShwcm92aWRlcjogRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlciwgcHJlZmVyZW5jZTogUGFzdGVQcmVmZXJlbmNlKTogYm9vbGVhbiB7XG5cdFx0aWYgKCdvbmx5JyBpbiBwcmVmZXJlbmNlKSB7XG5cdFx0XHRyZXR1cm4gcHJvdmlkZXIucHJvdmlkZWRQYXN0ZUVkaXRLaW5kcy5zb21lKHByb3ZpZGVkS2luZCA9PiBwcmVmZXJlbmNlLm9ubHkuY29udGFpbnMocHJvdmlkZWRLaW5kKSk7XG5cdFx0fSBlbHNlIGlmICgncHJlZmVyZW5jZXMnIGluIHByZWZlcmVuY2UpIHtcblx0XHRcdHJldHVybiBwcm92aWRlci5wcm92aWRlZFBhc3RlRWRpdEtpbmRzLnNvbWUocHJvdmlkZWRLaW5kID0+IHByZWZlcmVuY2UucHJlZmVyZW5jZXMuc29tZShwcmVmZXJyZWRLaW5kID0+IHByZWZlcnJlZEtpbmQuY29udGFpbnMocHJvdmlkZWRLaW5kKSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gcHJvdmlkZXIuaWQgPT09IHByZWZlcmVuY2UucHJvdmlkZXJJZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEluaXRpYWxBY3RpdmVFZGl0SW5kZXgobW9kZWw6IElUZXh0TW9kZWwsIGVkaXRzOiByZWFkb25seSBEb2N1bWVudFBhc3RlRWRpdFtdKTogbnVtYmVyIHtcblx0XHRjb25zdCBwcmVmZXJyZWRQcm92aWRlcnMgPSB0aGlzLl9jb25maWdTZXJ2aWNlLmdldFZhbHVlPFByZWZlcnJlZFBhc3RlQ29uZmlndXJhdGlvbltdPihwYXN0ZUFzUHJlZmVyZW5jZUNvbmZpZywgeyByZXNvdXJjZTogbW9kZWwudXJpIH0pO1xuXHRcdGZvciAoY29uc3QgY29uZmlnIG9mIEFycmF5LmlzQXJyYXkocHJlZmVycmVkUHJvdmlkZXJzKSA/IHByZWZlcnJlZFByb3ZpZGVycyA6IFtdKSB7XG5cdFx0XHRjb25zdCBkZXNpcmVkS2luZCA9IG5ldyBIaWVyYXJjaGljYWxLaW5kKGNvbmZpZyk7XG5cdFx0XHRjb25zdCBlZGl0SW5kZXggPSBlZGl0cy5maW5kSW5kZXgoZWRpdCA9PiBkZXNpcmVkS2luZC5jb250YWlucyhlZGl0LmtpbmQpKTtcblx0XHRcdGlmIChlZGl0SW5kZXggPj0gMCkge1xuXHRcdFx0XHRyZXR1cm4gZWRpdEluZGV4O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiAwO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTRCLHlCQUF5QixpQkFBaUIsd0JBQXdCO0FBQzlGLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLDhCQUF1RCxpQkFBaUIsU0FBUyxzQkFBc0I7QUFDaEgsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxjQUFjO0FBQ3ZC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LE9BQW1CLE9BQTZDO0FBQ2pHLFVBQU0scUJBQXFCLEtBQUssZUFBZSxTQUF3Qyx5QkFBeUIsRUFBRSxVQUFVLE1BQU0sSUFBSSxDQUFDO0FBQ3ZJLGVBQVcsVUFBVSxNQUFNLFFBQVEsa0JBQWtCLElBQUkscUJBQXFCLENBQUMsR0FBRztBQUNqRixZQUFNLGNBQWMsSUFBSSxpQkFBaUIsTUFBTTtBQUMvQyxZQUFNLFlBQVksTUFBTSxVQUFVLFVBQVEsWUFBWSxTQUFTLEtBQUssSUFBSSxDQUFDO0FBQ3pFLFVBQUksYUFBYSxHQUFHO0FBQ25CLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUF2bEJhLG9CQUVXLEtBQUs7QUFGaEIsc0JBQU47QUFBQSxFQW9DSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0E1Q1U7IiwKICAibmFtZXMiOiBbInByZWZlcmVuY2UiLCAiZWRpdG9yIiwgImVkaXRzIl0KfQo=
