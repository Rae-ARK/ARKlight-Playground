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
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { raceCancellation } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CancellationError, onUnexpectedError } from "../../../../base/common/errors.js";
import { isMarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import * as nls from "../../../../nls.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ConfigurationScope, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorAction, EditorCommand, EditorContributionInstantiation, registerEditorAction, registerEditorCommand, registerEditorContribution, registerModelAndPositionCommand } from "../../../browser/editorExtensions.js";
import { IBulkEditService } from "../../../browser/services/bulkEditService.js";
import { ICodeEditorService } from "../../../browser/services/codeEditorService.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { NewSymbolNameTriggerKind } from "../../../common/languages.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { ITextResourceConfigurationService } from "../../../common/services/textResourceConfiguration.js";
import { EditSources } from "../../../common/textModelEditSource.js";
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from "../../editorState/browser/editorState.js";
import { MessageController } from "../../message/browser/messageController.js";
import { CONTEXT_RENAME_INPUT_VISIBLE, RenameWidget } from "./renameWidget.js";
class RenameSkeleton {
  constructor(model, position, registry) {
    this.model = model;
    this.position = position;
    this._providerRenameIdx = 0;
    this._providers = registry.ordered(model);
  }
  hasProvider() {
    return this._providers.length > 0;
  }
  async resolveRenameLocation(token) {
    const rejects = [];
    for (this._providerRenameIdx = 0; this._providerRenameIdx < this._providers.length; this._providerRenameIdx++) {
      const provider = this._providers[this._providerRenameIdx];
      if (!provider.resolveRenameLocation) {
        break;
      }
      const res = await provider.resolveRenameLocation(this.model, this.position, token);
      if (!res) {
        continue;
      }
      if (res.rejectReason) {
        rejects.push(res.rejectReason);
        continue;
      }
      return res;
    }
    this._providerRenameIdx = 0;
    const word = this.model.getWordAtPosition(this.position);
    if (!word) {
      return {
        range: Range.fromPositions(this.position),
        text: "",
        rejectReason: rejects.length > 0 ? rejects.join("\n") : void 0
      };
    }
    return {
      range: new Range(this.position.lineNumber, word.startColumn, this.position.lineNumber, word.endColumn),
      text: word.word,
      rejectReason: rejects.length > 0 ? rejects.join("\n") : void 0
    };
  }
  async provideRenameEdits(newName, token) {
    return this._provideRenameEdits(newName, this._providerRenameIdx, [], token);
  }
  async _provideRenameEdits(newName, i, rejects, token) {
    const provider = this._providers[i];
    if (!provider) {
      return {
        edits: [],
        rejectReason: rejects.join("\n")
      };
    }
    const result = await provider.provideRenameEdits(this.model, this.position, newName, token);
    if (!result) {
      return this._provideRenameEdits(newName, i + 1, rejects.concat(nls.localize("no result", "No result.")), token);
    } else if (result.rejectReason) {
      return this._provideRenameEdits(newName, i + 1, rejects.concat(result.rejectReason), token);
    }
    return result;
  }
}
function hasProvider(registry, model) {
  const providers = registry.ordered(model);
  return providers.length > 0;
}
async function prepareRename(registry, model, position, cancellationToken) {
  const skeleton = new RenameSkeleton(model, position, registry);
  return skeleton.resolveRenameLocation(cancellationToken ?? CancellationToken.None);
}
async function rawRename(registry, model, position, newName, cancellationToken) {
  const skeleton = new RenameSkeleton(model, position, registry);
  return skeleton.provideRenameEdits(newName, cancellationToken ?? CancellationToken.None);
}
async function rename(registry, model, position, newName) {
  const skeleton = new RenameSkeleton(model, position, registry);
  const loc = await skeleton.resolveRenameLocation(CancellationToken.None);
  if (loc?.rejectReason) {
    return { edits: [], rejectReason: loc.rejectReason };
  }
  return skeleton.provideRenameEdits(newName, CancellationToken.None);
}
let RenameController = class {
  constructor(editor, _instaService, _notificationService, _bulkEditService, _progressService, _logService, _configService, _languageFeaturesService) {
    this.editor = editor;
    this._instaService = _instaService;
    this._notificationService = _notificationService;
    this._bulkEditService = _bulkEditService;
    this._progressService = _progressService;
    this._logService = _logService;
    this._configService = _configService;
    this._languageFeaturesService = _languageFeaturesService;
    this._disposableStore = new DisposableStore();
    this._cts = new CancellationTokenSource();
    this._renameWidget = this._disposableStore.add(this._instaService.createInstance(RenameWidget, this.editor, ["acceptRenameInput", "acceptRenameInputWithPreview"]));
  }
  static get(editor) {
    return editor.getContribution(RenameController.ID);
  }
  dispose() {
    this._disposableStore.dispose();
    this._cts.dispose(true);
  }
  async run() {
    const trace = this._logService.trace.bind(this._logService, "[rename]");
    this._cts.dispose(true);
    this._cts = new CancellationTokenSource();
    if (!this.editor.hasModel()) {
      trace("editor has no model");
      return void 0;
    }
    const position = this.editor.getPosition();
    const skeleton = new RenameSkeleton(this.editor.getModel(), position, this._languageFeaturesService.renameProvider);
    if (!skeleton.hasProvider()) {
      trace("skeleton has no provider");
      return void 0;
    }
    const cts1 = new EditorStateCancellationTokenSource(this.editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value, void 0, this._cts.token);
    let loc;
    try {
      trace("resolving rename location");
      const resolveLocationOperation = skeleton.resolveRenameLocation(cts1.token);
      this._progressService.showWhile(resolveLocationOperation, 250);
      loc = await resolveLocationOperation;
      trace("resolved rename location");
    } catch (e) {
      if (e instanceof CancellationError) {
        trace("resolve rename location cancelled", JSON.stringify(e, null, "	"));
      } else {
        trace("resolve rename location failed", e instanceof Error ? e : JSON.stringify(e, null, "	"));
        if (typeof e === "string" || isMarkdownString(e)) {
          MessageController.get(this.editor)?.showMessage(e || nls.localize("resolveRenameLocationFailed", "An unknown error occurred while resolving rename location"), position);
        }
      }
      return void 0;
    } finally {
      cts1.dispose();
    }
    if (!loc) {
      trace("returning early - no loc");
      return void 0;
    }
    if (loc.rejectReason) {
      trace(`returning early - rejected with reason: ${loc.rejectReason}`, loc.rejectReason);
      MessageController.get(this.editor)?.showMessage(loc.rejectReason, position);
      return void 0;
    }
    if (cts1.token.isCancellationRequested) {
      trace("returning early - cts1 cancelled");
      return void 0;
    }
    const cts2 = new EditorStateCancellationTokenSource(this.editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value, loc.range, this._cts.token);
    const model = this.editor.getModel();
    const newSymbolNamesProviders = this._languageFeaturesService.newSymbolNamesProvider.all(model);
    const resolvedNewSymbolnamesProviders = await Promise.all(newSymbolNamesProviders.map(async (p) => [p, await p.supportsAutomaticNewSymbolNamesTriggerKind ?? false]));
    const requestRenameSuggestions = (triggerKind, cts) => {
      let providers = resolvedNewSymbolnamesProviders.slice();
      if (triggerKind === NewSymbolNameTriggerKind.Automatic) {
        providers = providers.filter(([_, supportsAutomatic]) => supportsAutomatic);
      }
      return providers.map(([p]) => p.provideNewSymbolNames(model, loc.range, triggerKind, cts));
    };
    trace("creating rename input field and awaiting its result");
    const supportPreview = this._bulkEditService.hasPreviewHandler() && this._configService.getValue(this.editor.getModel().uri, "editor.rename.enablePreview");
    const inputFieldResult = await this._renameWidget.getInput(
      loc.range,
      loc.text,
      supportPreview,
      newSymbolNamesProviders.length > 0 ? requestRenameSuggestions : void 0,
      cts2
    );
    trace("received response from rename input field");
    if (typeof inputFieldResult === "boolean") {
      trace(`returning early - rename input field response - ${inputFieldResult}`);
      if (inputFieldResult) {
        this.editor.focus();
      }
      cts2.dispose();
      return void 0;
    }
    this.editor.focus();
    trace("requesting rename edits");
    const renameOperation = raceCancellation(skeleton.provideRenameEdits(inputFieldResult.newName, cts2.token), cts2.token).then(async (renameResult) => {
      if (!renameResult) {
        trace("returning early - no rename edits result");
        return;
      }
      if (!this.editor.hasModel()) {
        trace("returning early - no model after rename edits are provided");
        return;
      }
      if (renameResult.rejectReason) {
        trace(`returning early - rejected with reason: ${renameResult.rejectReason}`);
        this._notificationService.info(renameResult.rejectReason);
        return;
      }
      this.editor.setSelection(Range.fromPositions(this.editor.getSelection().getPosition()));
      trace("applying edits");
      this._bulkEditService.apply(renameResult, {
        editor: this.editor,
        showPreview: inputFieldResult.wantsPreview,
        label: nls.localize("label", "Renaming '{0}' to '{1}'", loc?.text, inputFieldResult.newName),
        code: "undoredo.rename",
        quotableLabel: nls.localize("quotableLabel", "Renaming {0} to {1}", loc?.text, inputFieldResult.newName),
        respectAutoSaveConfig: true,
        reason: EditSources.rename(loc?.text, inputFieldResult.newName)
      }).then((result) => {
        trace("edits applied");
        if (result.ariaSummary) {
          alert(nls.localize("aria", "Successfully renamed '{0}' to '{1}'. Summary: {2}", loc.text, inputFieldResult.newName, result.ariaSummary));
        }
      }).catch((err) => {
        trace(`error when applying edits ${JSON.stringify(err, null, "	")}`);
        this._notificationService.error(nls.localize("rename.failedApply", "Rename failed to apply edits"));
        this._logService.error(err);
      });
    }, (err) => {
      trace("error when providing rename edits", JSON.stringify(err, null, "	"));
      this._notificationService.error(nls.localize("rename.failed", "Rename failed to compute edits"));
      this._logService.error(err);
    }).finally(() => {
      cts2.dispose();
    });
    trace("returning rename operation");
    this._progressService.showWhile(renameOperation, 250);
    return renameOperation;
  }
  acceptRenameInput(wantsPreview) {
    this._renameWidget.acceptInput(wantsPreview);
  }
  cancelRenameInput() {
    this._renameWidget.cancelInput(true, "cancelRenameInput command");
  }
  focusNextRenameSuggestion() {
    this._renameWidget.focusNextRenameSuggestion();
  }
  focusPreviousRenameSuggestion() {
    this._renameWidget.focusPreviousRenameSuggestion();
  }
};
RenameController.ID = "editor.contrib.renameController";
RenameController = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IBulkEditService),
  __decorateParam(4, IEditorProgressService),
  __decorateParam(5, ILogService),
  __decorateParam(6, ITextResourceConfigurationService),
  __decorateParam(7, ILanguageFeaturesService)
], RenameController);
class RenameAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.rename",
      label: nls.localize2("rename.label", "Rename Symbol"),
      precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasRenameProvider),
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyCode.F2,
        weight: KeybindingWeight.EditorContrib
      },
      contextMenuOpts: {
        group: "1_modification",
        order: 1.1
      },
      canTriggerInlineEdits: true
    });
  }
  runCommand(accessor, args) {
    const editorService = accessor.get(ICodeEditorService);
    const [uri, pos] = Array.isArray(args) && args || [void 0, void 0];
    if (URI.isUri(uri) && Position.isIPosition(pos)) {
      return editorService.openCodeEditor({ resource: uri }, editorService.getActiveCodeEditor()).then((editor) => {
        if (!editor) {
          return;
        }
        editor.setPosition(pos);
        editor.invokeWithinContext((accessor2) => {
          this.reportTelemetry(accessor2, editor);
          return this.run(accessor2, editor);
        });
      }, onUnexpectedError);
    }
    return super.runCommand(accessor, args);
  }
  run(accessor, editor) {
    const logService = accessor.get(ILogService);
    const controller = RenameController.get(editor);
    if (controller) {
      logService.trace("[RenameAction] got controller, running...");
      return controller.run();
    }
    logService.trace("[RenameAction] returning early - controller missing");
    return Promise.resolve();
  }
}
registerEditorContribution(RenameController.ID, RenameController, EditorContributionInstantiation.Lazy);
registerEditorAction(RenameAction);
const RenameCommand = EditorCommand.bindToContribution(RenameController.get);
registerEditorCommand(new RenameCommand({
  id: "acceptRenameInput",
  precondition: CONTEXT_RENAME_INPUT_VISIBLE,
  handler: (x) => x.acceptRenameInput(false),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 99,
    kbExpr: EditorContextKeys.focus,
    primary: KeyCode.Enter
  }
}));
registerEditorCommand(new RenameCommand({
  id: "acceptRenameInputWithPreview",
  precondition: ContextKeyExpr.and(CONTEXT_RENAME_INPUT_VISIBLE, ContextKeyExpr.has("config.editor.rename.enablePreview")),
  handler: (x) => x.acceptRenameInput(true),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 99,
    kbExpr: EditorContextKeys.focus,
    primary: KeyMod.CtrlCmd + KeyCode.Enter
  }
}));
registerEditorCommand(new RenameCommand({
  id: "cancelRenameInput",
  precondition: CONTEXT_RENAME_INPUT_VISIBLE,
  handler: (x) => x.cancelRenameInput(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 99,
    kbExpr: EditorContextKeys.focus,
    primary: KeyCode.Escape,
    secondary: [KeyMod.Shift | KeyCode.Escape]
  }
}));
registerAction2(class FocusNextRenameSuggestion extends Action2 {
  constructor() {
    super({
      id: "focusNextRenameSuggestion",
      title: {
        ...nls.localize2("focusNextRenameSuggestion", "Focus Next Rename Suggestion")
      },
      precondition: CONTEXT_RENAME_INPUT_VISIBLE,
      keybinding: [
        {
          primary: KeyCode.DownArrow,
          weight: KeybindingWeight.EditorContrib + 99
        }
      ]
    });
  }
  run(accessor) {
    const currentEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
    if (!currentEditor) {
      return;
    }
    const controller = RenameController.get(currentEditor);
    if (!controller) {
      return;
    }
    controller.focusNextRenameSuggestion();
  }
});
registerAction2(class FocusPreviousRenameSuggestion extends Action2 {
  constructor() {
    super({
      id: "focusPreviousRenameSuggestion",
      title: {
        ...nls.localize2("focusPreviousRenameSuggestion", "Focus Previous Rename Suggestion")
      },
      precondition: CONTEXT_RENAME_INPUT_VISIBLE,
      keybinding: [
        {
          primary: KeyCode.UpArrow,
          weight: KeybindingWeight.EditorContrib + 99
        }
      ]
    });
  }
  run(accessor) {
    const currentEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
    if (!currentEditor) {
      return;
    }
    const controller = RenameController.get(currentEditor);
    if (!controller) {
      return;
    }
    controller.focusPreviousRenameSuggestion();
  }
});
registerModelAndPositionCommand("_executeDocumentRenameProvider", function(accessor, model, position, ...args) {
  const [newName] = args;
  assertType(typeof newName === "string");
  const { renameProvider } = accessor.get(ILanguageFeaturesService);
  return rename(renameProvider, model, position, newName);
});
registerModelAndPositionCommand("_executePrepareRename", async function(accessor, model, position) {
  const { renameProvider } = accessor.get(ILanguageFeaturesService);
  const skeleton = new RenameSkeleton(model, position, renameProvider);
  const loc = await skeleton.resolveRenameLocation(CancellationToken.None);
  if (loc?.rejectReason) {
    throw new Error(loc.rejectReason);
  }
  return loc;
});
Registry.as(Extensions.Configuration).registerConfiguration({
  id: "editor",
  properties: {
    "editor.rename.enablePreview": {
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      description: nls.localize("enablePreview", "Enable/disable the ability to preview changes before renaming"),
      default: true,
      type: "boolean"
    }
  }
});
export {
  RenameAction,
  hasProvider,
  prepareRename,
  rawRename,
  rename
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3JlbmFtZS9icm93c2VyL3JlbmFtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyByYWNlQ2FuY2VsbGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yLCBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBpc01hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIEVkaXRvckNvbW1hbmQsIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24sIFNlcnZpY2VzQWNjZXNzb3IsIHJlZ2lzdGVyRWRpdG9yQWN0aW9uLCByZWdpc3RlckVkaXRvckNvbW1hbmQsIHJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uLCByZWdpc3Rlck1vZGVsQW5kUG9zaXRpb25Db21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElCdWxrRWRpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IE5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZCwgUmVqZWN0aW9uLCBSZW5hbWVMb2NhdGlvbiwgUmVuYW1lUHJvdmlkZXIsIFdvcmtzcGFjZUVkaXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdFNvdXJjZXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yU3RhdGVGbGFnLCBFZGl0b3JTdGF0ZUNhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yU3RhdGUvYnJvd3Nlci9lZGl0b3JTdGF0ZS5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlQ29udHJvbGxlciB9IGZyb20gJy4uLy4uL21lc3NhZ2UvYnJvd3Nlci9tZXNzYWdlQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBDT05URVhUX1JFTkFNRV9JTlBVVF9WSVNJQkxFLCBSZW5hbWVXaWRnZXQgfSBmcm9tICcuL3JlbmFtZVdpZGdldC5qcyc7XG5cbmNsYXNzIFJlbmFtZVNrZWxldG9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcnM6IFJlbmFtZVByb3ZpZGVyW107XG5cdHByaXZhdGUgX3Byb3ZpZGVyUmVuYW1lSWR4OiBudW1iZXIgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwb3NpdGlvbjogUG9zaXRpb24sXG5cdFx0cmVnaXN0cnk6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PFJlbmFtZVByb3ZpZGVyPlxuXHQpIHtcblx0XHR0aGlzLl9wcm92aWRlcnMgPSByZWdpc3RyeS5vcmRlcmVkKG1vZGVsKTtcblx0fVxuXG5cdGhhc1Byb3ZpZGVyKCkge1xuXHRcdHJldHVybiB0aGlzLl9wcm92aWRlcnMubGVuZ3RoID4gMDtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVSZW5hbWVMb2NhdGlvbih0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlbmFtZUxvY2F0aW9uICYgUmVqZWN0aW9uIHwgdW5kZWZpbmVkPiB7XG5cblx0XHRjb25zdCByZWplY3RzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Zm9yICh0aGlzLl9wcm92aWRlclJlbmFtZUlkeCA9IDA7IHRoaXMuX3Byb3ZpZGVyUmVuYW1lSWR4IDwgdGhpcy5fcHJvdmlkZXJzLmxlbmd0aDsgdGhpcy5fcHJvdmlkZXJSZW5hbWVJZHgrKykge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9wcm92aWRlcnNbdGhpcy5fcHJvdmlkZXJSZW5hbWVJZHhdO1xuXHRcdFx0aWYgKCFwcm92aWRlci5yZXNvbHZlUmVuYW1lTG9jYXRpb24pIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXMgPSBhd2FpdCBwcm92aWRlci5yZXNvbHZlUmVuYW1lTG9jYXRpb24odGhpcy5tb2RlbCwgdGhpcy5wb3NpdGlvbiwgdG9rZW4pO1xuXHRcdFx0aWYgKCFyZXMpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzLnJlamVjdFJlYXNvbikge1xuXHRcdFx0XHRyZWplY3RzLnB1c2gocmVzLnJlamVjdFJlYXNvbik7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlcztcblx0XHR9XG5cblx0XHQvLyB3ZSBhcmUgaGVyZSB3aGVuIG5vIHByb3ZpZGVyIHByZXBhcmVkIGEgbG9jYXRpb24gd2hpY2ggbWVhbnMgd2UgY2FuXG5cdFx0Ly8ganVzdCByZWx5IG9uIHRoZSB3b3JkIHVuZGVyIGN1cnNvciBhbmQgc3RhcnQgd2l0aCB0aGUgZmlyc3QgcHJvdmlkZXJcblx0XHR0aGlzLl9wcm92aWRlclJlbmFtZUlkeCA9IDA7XG5cblx0XHRjb25zdCB3b3JkID0gdGhpcy5tb2RlbC5nZXRXb3JkQXRQb3NpdGlvbih0aGlzLnBvc2l0aW9uKTtcblx0XHRpZiAoIXdvcmQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKHRoaXMucG9zaXRpb24pLFxuXHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdFx0cmVqZWN0UmVhc29uOiByZWplY3RzLmxlbmd0aCA+IDAgPyByZWplY3RzLmpvaW4oJ1xcbicpIDogdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSh0aGlzLnBvc2l0aW9uLmxpbmVOdW1iZXIsIHdvcmQuc3RhcnRDb2x1bW4sIHRoaXMucG9zaXRpb24ubGluZU51bWJlciwgd29yZC5lbmRDb2x1bW4pLFxuXHRcdFx0dGV4dDogd29yZC53b3JkLFxuXHRcdFx0cmVqZWN0UmVhc29uOiByZWplY3RzLmxlbmd0aCA+IDAgPyByZWplY3RzLmpvaW4oJ1xcbicpIDogdW5kZWZpbmVkXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVSZW5hbWVFZGl0cyhuZXdOYW1lOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8V29ya3NwYWNlRWRpdCAmIFJlamVjdGlvbj4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm92aWRlUmVuYW1lRWRpdHMobmV3TmFtZSwgdGhpcy5fcHJvdmlkZXJSZW5hbWVJZHgsIFtdLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wcm92aWRlUmVuYW1lRWRpdHMobmV3TmFtZTogc3RyaW5nLCBpOiBudW1iZXIsIHJlamVjdHM6IHN0cmluZ1tdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFdvcmtzcGFjZUVkaXQgJiBSZWplY3Rpb24+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3Byb3ZpZGVyc1tpXTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRlZGl0czogW10sXG5cdFx0XHRcdHJlamVjdFJlYXNvbjogcmVqZWN0cy5qb2luKCdcXG4nKVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlUmVuYW1lRWRpdHModGhpcy5tb2RlbCwgdGhpcy5wb3NpdGlvbiwgbmV3TmFtZSwgdG9rZW4pO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcHJvdmlkZVJlbmFtZUVkaXRzKG5ld05hbWUsIGkgKyAxLCByZWplY3RzLmNvbmNhdChubHMubG9jYWxpemUoJ25vIHJlc3VsdCcsIFwiTm8gcmVzdWx0LlwiKSksIHRva2VuKTtcblx0XHR9IGVsc2UgaWYgKHJlc3VsdC5yZWplY3RSZWFzb24pIHtcblx0XHRcdHJldHVybiB0aGlzLl9wcm92aWRlUmVuYW1lRWRpdHMobmV3TmFtZSwgaSArIDEsIHJlamVjdHMuY29uY2F0KHJlc3VsdC5yZWplY3RSZWFzb24pLCB0b2tlbik7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc1Byb3ZpZGVyKHJlZ2lzdHJ5OiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxSZW5hbWVQcm92aWRlcj4sIG1vZGVsOiBJVGV4dE1vZGVsKTogYm9vbGVhbiB7XG5cdGNvbnN0IHByb3ZpZGVycyA9IHJlZ2lzdHJ5Lm9yZGVyZWQobW9kZWwpO1xuXHRyZXR1cm4gcHJvdmlkZXJzLmxlbmd0aCA+IDA7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwcmVwYXJlUmVuYW1lKHJlZ2lzdHJ5OiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxSZW5hbWVQcm92aWRlcj4sIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIGNhbmNlbGxhdGlvblRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlbmFtZUxvY2F0aW9uICYgUmVqZWN0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IHNrZWxldG9uID0gbmV3IFJlbmFtZVNrZWxldG9uKG1vZGVsLCBwb3NpdGlvbiwgcmVnaXN0cnkpO1xuXHRyZXR1cm4gc2tlbGV0b24ucmVzb2x2ZVJlbmFtZUxvY2F0aW9uKGNhbmNlbGxhdGlvblRva2VuID8/IENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmF3UmVuYW1lKHJlZ2lzdHJ5OiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxSZW5hbWVQcm92aWRlcj4sIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIG5ld05hbWU6IHN0cmluZywgY2FuY2VsbGF0aW9uVG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8V29ya3NwYWNlRWRpdCAmIFJlamVjdGlvbj4ge1xuXHRjb25zdCBza2VsZXRvbiA9IG5ldyBSZW5hbWVTa2VsZXRvbihtb2RlbCwgcG9zaXRpb24sIHJlZ2lzdHJ5KTtcblx0cmV0dXJuIHNrZWxldG9uLnByb3ZpZGVSZW5hbWVFZGl0cyhuZXdOYW1lLCBjYW5jZWxsYXRpb25Ub2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlbmFtZShyZWdpc3RyeTogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8UmVuYW1lUHJvdmlkZXI+LCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBuZXdOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFdvcmtzcGFjZUVkaXQgJiBSZWplY3Rpb24+IHtcblx0Y29uc3Qgc2tlbGV0b24gPSBuZXcgUmVuYW1lU2tlbGV0b24obW9kZWwsIHBvc2l0aW9uLCByZWdpc3RyeSk7XG5cdGNvbnN0IGxvYyA9IGF3YWl0IHNrZWxldG9uLnJlc29sdmVSZW5hbWVMb2NhdGlvbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0aWYgKGxvYz8ucmVqZWN0UmVhc29uKSB7XG5cdFx0cmV0dXJuIHsgZWRpdHM6IFtdLCByZWplY3RSZWFzb246IGxvYy5yZWplY3RSZWFzb24gfTtcblx0fVxuXHRyZXR1cm4gc2tlbGV0b24ucHJvdmlkZVJlbmFtZUVkaXRzKG5ld05hbWUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xufVxuXG4vLyAtLS0gIHJlZ2lzdGVyIGFjdGlvbnMgYW5kIGNvbW1hbmRzXG5cbmNsYXNzIFJlbmFtZUNvbnRyb2xsZXIgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLnJlbmFtZUNvbnRyb2xsZXInO1xuXG5cdHN0YXRpYyBnZXQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IFJlbmFtZUNvbnRyb2xsZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxSZW5hbWVDb250cm9sbGVyPihSZW5hbWVDb250cm9sbGVyLklEKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmFtZVdpZGdldDogUmVuYW1lV2lkZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgX2N0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElCdWxrRWRpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYnVsa0VkaXRTZXJ2aWNlOiBJQnVsa0VkaXRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2dyZXNzU2VydmljZTogSUVkaXRvclByb2dyZXNzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWdTZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9yZW5hbWVXaWRnZXQgPSB0aGlzLl9kaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW5hbWVXaWRnZXQsIHRoaXMuZWRpdG9yLCBbJ2FjY2VwdFJlbmFtZUlucHV0JywgJ2FjY2VwdFJlbmFtZUlucHV0V2l0aFByZXZpZXcnXSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlU3RvcmUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2N0cy5kaXNwb3NlKHRydWUpO1xuXHR9XG5cblx0YXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgdHJhY2UgPSB0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlLmJpbmQodGhpcy5fbG9nU2VydmljZSwgJ1tyZW5hbWVdJyk7XG5cblx0XHQvLyBzZXQgdXAgY2FuY2VsbGF0aW9uIHRva2VuIHRvIHByZXZlbnQgcmVlbnRyYW50IHJlbmFtZSwgdGhpc1xuXHRcdC8vIGlzIHRoZSBwYXJlbnQgdG8gdGhlIHJlc29sdmUtIGFuZCByZW5hbWUtdG9rZW5zXG5cdFx0dGhpcy5fY3RzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0dGhpcy5fY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHRpZiAoIXRoaXMuZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHRyYWNlKCdlZGl0b3IgaGFzIG5vIG1vZGVsJyk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRjb25zdCBza2VsZXRvbiA9IG5ldyBSZW5hbWVTa2VsZXRvbih0aGlzLmVkaXRvci5nZXRNb2RlbCgpLCBwb3NpdGlvbiwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVuYW1lUHJvdmlkZXIpO1xuXG5cdFx0aWYgKCFza2VsZXRvbi5oYXNQcm92aWRlcigpKSB7XG5cdFx0XHR0cmFjZSgnc2tlbGV0b24gaGFzIG5vIHByb3ZpZGVyJyk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIHBhcnQgMSAtIHJlc29sdmUgcmVuYW1lIGxvY2F0aW9uXG5cdFx0Y29uc3QgY3RzMSA9IG5ldyBFZGl0b3JTdGF0ZUNhbmNlbGxhdGlvblRva2VuU291cmNlKHRoaXMuZWRpdG9yLCBDb2RlRWRpdG9yU3RhdGVGbGFnLlBvc2l0aW9uIHwgQ29kZUVkaXRvclN0YXRlRmxhZy5WYWx1ZSwgdW5kZWZpbmVkLCB0aGlzLl9jdHMudG9rZW4pO1xuXG5cdFx0bGV0IGxvYzogUmVuYW1lTG9jYXRpb24gJiBSZWplY3Rpb24gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHRyYWNlKCdyZXNvbHZpbmcgcmVuYW1lIGxvY2F0aW9uJyk7XG5cdFx0XHRjb25zdCByZXNvbHZlTG9jYXRpb25PcGVyYXRpb24gPSBza2VsZXRvbi5yZXNvbHZlUmVuYW1lTG9jYXRpb24oY3RzMS50b2tlbik7XG5cdFx0XHR0aGlzLl9wcm9ncmVzc1NlcnZpY2Uuc2hvd1doaWxlKHJlc29sdmVMb2NhdGlvbk9wZXJhdGlvbiwgMjUwKTtcblx0XHRcdGxvYyA9IGF3YWl0IHJlc29sdmVMb2NhdGlvbk9wZXJhdGlvbjtcblx0XHRcdHRyYWNlKCdyZXNvbHZlZCByZW5hbWUgbG9jYXRpb24nKTtcblx0XHR9IGNhdGNoIChlOiB1bmtub3duKSB7XG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdHRyYWNlKCdyZXNvbHZlIHJlbmFtZSBsb2NhdGlvbiBjYW5jZWxsZWQnLCBKU09OLnN0cmluZ2lmeShlLCBudWxsLCAnXFx0JykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dHJhY2UoJ3Jlc29sdmUgcmVuYW1lIGxvY2F0aW9uIGZhaWxlZCcsIGUgaW5zdGFuY2VvZiBFcnJvciA/IGUgOiBKU09OLnN0cmluZ2lmeShlLCBudWxsLCAnXFx0JykpO1xuXHRcdFx0XHRpZiAodHlwZW9mIGUgPT09ICdzdHJpbmcnIHx8IGlzTWFya2Rvd25TdHJpbmcoZSkpIHtcblx0XHRcdFx0XHRNZXNzYWdlQ29udHJvbGxlci5nZXQodGhpcy5lZGl0b3IpPy5zaG93TWVzc2FnZShlIHx8IG5scy5sb2NhbGl6ZSgncmVzb2x2ZVJlbmFtZUxvY2F0aW9uRmFpbGVkJywgXCJBbiB1bmtub3duIGVycm9yIG9jY3VycmVkIHdoaWxlIHJlc29sdmluZyByZW5hbWUgbG9jYXRpb25cIiksIHBvc2l0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjdHMxLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRpZiAoIWxvYykge1xuXHRcdFx0dHJhY2UoJ3JldHVybmluZyBlYXJseSAtIG5vIGxvYycpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAobG9jLnJlamVjdFJlYXNvbikge1xuXHRcdFx0dHJhY2UoYHJldHVybmluZyBlYXJseSAtIHJlamVjdGVkIHdpdGggcmVhc29uOiAke2xvYy5yZWplY3RSZWFzb259YCwgbG9jLnJlamVjdFJlYXNvbik7XG5cdFx0XHRNZXNzYWdlQ29udHJvbGxlci5nZXQodGhpcy5lZGl0b3IpPy5zaG93TWVzc2FnZShsb2MucmVqZWN0UmVhc29uLCBwb3NpdGlvbik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChjdHMxLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0cmFjZSgncmV0dXJuaW5nIGVhcmx5IC0gY3RzMSBjYW5jZWxsZWQnKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gcGFydCAyIC0gZG8gcmVuYW1lIGF0IGxvY2F0aW9uXG5cdFx0Y29uc3QgY3RzMiA9IG5ldyBFZGl0b3JTdGF0ZUNhbmNlbGxhdGlvblRva2VuU291cmNlKHRoaXMuZWRpdG9yLCBDb2RlRWRpdG9yU3RhdGVGbGFnLlBvc2l0aW9uIHwgQ29kZUVkaXRvclN0YXRlRmxhZy5WYWx1ZSwgbG9jLnJhbmdlLCB0aGlzLl9jdHMudG9rZW4pO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpOyAvLyBAdWx1Z2Jla25hOiBhc3N1bWVzIGVkaXRvciBzdGlsbCBoYXMgYSBtb2RlbCwgb3RoZXJ3aXNlLCBjdHMxIHNob3VsZCd2ZSBiZWVuIGNhbmNlbGxlZFxuXG5cdFx0Y29uc3QgbmV3U3ltYm9sTmFtZXNQcm92aWRlcnMgPSB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5uZXdTeW1ib2xOYW1lc1Byb3ZpZGVyLmFsbChtb2RlbCk7XG5cblx0XHRjb25zdCByZXNvbHZlZE5ld1N5bWJvbG5hbWVzUHJvdmlkZXJzID0gYXdhaXQgUHJvbWlzZS5hbGwobmV3U3ltYm9sTmFtZXNQcm92aWRlcnMubWFwKGFzeW5jIHAgPT4gW3AsIGF3YWl0IHAuc3VwcG9ydHNBdXRvbWF0aWNOZXdTeW1ib2xOYW1lc1RyaWdnZXJLaW5kID8/IGZhbHNlXSBhcyBjb25zdCkpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdFJlbmFtZVN1Z2dlc3Rpb25zID0gKHRyaWdnZXJLaW5kOiBOZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQsIGN0czogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdGxldCBwcm92aWRlcnMgPSByZXNvbHZlZE5ld1N5bWJvbG5hbWVzUHJvdmlkZXJzLnNsaWNlKCk7XG5cblx0XHRcdGlmICh0cmlnZ2VyS2luZCA9PT0gTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kLkF1dG9tYXRpYykge1xuXHRcdFx0XHRwcm92aWRlcnMgPSBwcm92aWRlcnMuZmlsdGVyKChbXywgc3VwcG9ydHNBdXRvbWF0aWNdKSA9PiBzdXBwb3J0c0F1dG9tYXRpYyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBwcm92aWRlcnMubWFwKChbcCxdKSA9PiBwLnByb3ZpZGVOZXdTeW1ib2xOYW1lcyhtb2RlbCwgbG9jLnJhbmdlLCB0cmlnZ2VyS2luZCwgY3RzKSk7XG5cdFx0fTtcblxuXHRcdHRyYWNlKCdjcmVhdGluZyByZW5hbWUgaW5wdXQgZmllbGQgYW5kIGF3YWl0aW5nIGl0cyByZXN1bHQnKTtcblx0XHRjb25zdCBzdXBwb3J0UHJldmlldyA9IHRoaXMuX2J1bGtFZGl0U2VydmljZS5oYXNQcmV2aWV3SGFuZGxlcigpICYmIHRoaXMuX2NvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4odGhpcy5lZGl0b3IuZ2V0TW9kZWwoKS51cmksICdlZGl0b3IucmVuYW1lLmVuYWJsZVByZXZpZXcnKTtcblx0XHRjb25zdCBpbnB1dEZpZWxkUmVzdWx0ID0gYXdhaXQgdGhpcy5fcmVuYW1lV2lkZ2V0LmdldElucHV0KFxuXHRcdFx0bG9jLnJhbmdlLFxuXHRcdFx0bG9jLnRleHQsXG5cdFx0XHRzdXBwb3J0UHJldmlldyxcblx0XHRcdG5ld1N5bWJvbE5hbWVzUHJvdmlkZXJzLmxlbmd0aCA+IDAgPyByZXF1ZXN0UmVuYW1lU3VnZ2VzdGlvbnMgOiB1bmRlZmluZWQsXG5cdFx0XHRjdHMyXG5cdFx0KTtcblx0XHR0cmFjZSgncmVjZWl2ZWQgcmVzcG9uc2UgZnJvbSByZW5hbWUgaW5wdXQgZmllbGQnKTtcblxuXHRcdC8vIG5vIHJlc3VsdCwgb25seSBoaW50IHRvIGZvY3VzIHRoZSBlZGl0b3Igb3Igbm90XG5cdFx0aWYgKHR5cGVvZiBpbnB1dEZpZWxkUmVzdWx0ID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHRyYWNlKGByZXR1cm5pbmcgZWFybHkgLSByZW5hbWUgaW5wdXQgZmllbGQgcmVzcG9uc2UgLSAke2lucHV0RmllbGRSZXN1bHR9YCk7XG5cdFx0XHRpZiAoaW5wdXRGaWVsZFJlc3VsdCkge1xuXHRcdFx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdFx0Y3RzMi5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cblx0XHR0cmFjZSgncmVxdWVzdGluZyByZW5hbWUgZWRpdHMnKTtcblx0XHRjb25zdCByZW5hbWVPcGVyYXRpb24gPSByYWNlQ2FuY2VsbGF0aW9uKHNrZWxldG9uLnByb3ZpZGVSZW5hbWVFZGl0cyhpbnB1dEZpZWxkUmVzdWx0Lm5ld05hbWUsIGN0czIudG9rZW4pLCBjdHMyLnRva2VuKS50aGVuKGFzeW5jIHJlbmFtZVJlc3VsdCA9PiB7XG5cblx0XHRcdGlmICghcmVuYW1lUmVzdWx0KSB7XG5cdFx0XHRcdHRyYWNlKCdyZXR1cm5pbmcgZWFybHkgLSBubyByZW5hbWUgZWRpdHMgcmVzdWx0Jyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHR0cmFjZSgncmV0dXJuaW5nIGVhcmx5IC0gbm8gbW9kZWwgYWZ0ZXIgcmVuYW1lIGVkaXRzIGFyZSBwcm92aWRlZCcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZW5hbWVSZXN1bHQucmVqZWN0UmVhc29uKSB7XG5cdFx0XHRcdHRyYWNlKGByZXR1cm5pbmcgZWFybHkgLSByZWplY3RlZCB3aXRoIHJlYXNvbjogJHtyZW5hbWVSZXN1bHQucmVqZWN0UmVhc29ufWApO1xuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmluZm8ocmVuYW1lUmVzdWx0LnJlamVjdFJlYXNvbik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gY29sbGFwc2Ugc2VsZWN0aW9uIHRvIGFjdGl2ZSBlbmRcblx0XHRcdHRoaXMuZWRpdG9yLnNldFNlbGVjdGlvbihSYW5nZS5mcm9tUG9zaXRpb25zKHRoaXMuZWRpdG9yLmdldFNlbGVjdGlvbigpLmdldFBvc2l0aW9uKCkpKTtcblxuXHRcdFx0dHJhY2UoJ2FwcGx5aW5nIGVkaXRzJyk7XG5cblx0XHRcdHRoaXMuX2J1bGtFZGl0U2VydmljZS5hcHBseShyZW5hbWVSZXN1bHQsIHtcblx0XHRcdFx0ZWRpdG9yOiB0aGlzLmVkaXRvcixcblx0XHRcdFx0c2hvd1ByZXZpZXc6IGlucHV0RmllbGRSZXN1bHQud2FudHNQcmV2aWV3LFxuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdsYWJlbCcsIFwiUmVuYW1pbmcgJ3swfScgdG8gJ3sxfSdcIiwgbG9jPy50ZXh0LCBpbnB1dEZpZWxkUmVzdWx0Lm5ld05hbWUpLFxuXHRcdFx0XHRjb2RlOiAndW5kb3JlZG8ucmVuYW1lJyxcblx0XHRcdFx0cXVvdGFibGVMYWJlbDogbmxzLmxvY2FsaXplKCdxdW90YWJsZUxhYmVsJywgXCJSZW5hbWluZyB7MH0gdG8gezF9XCIsIGxvYz8udGV4dCwgaW5wdXRGaWVsZFJlc3VsdC5uZXdOYW1lKSxcblx0XHRcdFx0cmVzcGVjdEF1dG9TYXZlQ29uZmlnOiB0cnVlLFxuXHRcdFx0XHRyZWFzb246IEVkaXRTb3VyY2VzLnJlbmFtZShsb2M/LnRleHQsIGlucHV0RmllbGRSZXN1bHQubmV3TmFtZSksXG5cdFx0XHR9KS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdHRyYWNlKCdlZGl0cyBhcHBsaWVkJyk7XG5cdFx0XHRcdGlmIChyZXN1bHQuYXJpYVN1bW1hcnkpIHtcblx0XHRcdFx0XHRhbGVydChubHMubG9jYWxpemUoJ2FyaWEnLCBcIlN1Y2Nlc3NmdWxseSByZW5hbWVkICd7MH0nIHRvICd7MX0nLiBTdW1tYXJ5OiB7Mn1cIiwgbG9jLnRleHQsIGlucHV0RmllbGRSZXN1bHQubmV3TmFtZSwgcmVzdWx0LmFyaWFTdW1tYXJ5KSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRyYWNlKGBlcnJvciB3aGVuIGFwcGx5aW5nIGVkaXRzICR7SlNPTi5zdHJpbmdpZnkoZXJyLCBudWxsLCAnXFx0Jyl9YCk7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobmxzLmxvY2FsaXplKCdyZW5hbWUuZmFpbGVkQXBwbHknLCBcIlJlbmFtZSBmYWlsZWQgdG8gYXBwbHkgZWRpdHNcIikpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHR9KTtcblxuXHRcdH0sIGVyciA9PiB7XG5cdFx0XHR0cmFjZSgnZXJyb3Igd2hlbiBwcm92aWRpbmcgcmVuYW1lIGVkaXRzJywgSlNPTi5zdHJpbmdpZnkoZXJyLCBudWxsLCAnXFx0JykpO1xuXG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgncmVuYW1lLmZhaWxlZCcsIFwiUmVuYW1lIGZhaWxlZCB0byBjb21wdXRlIGVkaXRzXCIpKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblxuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0Y3RzMi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0cmFjZSgncmV0dXJuaW5nIHJlbmFtZSBvcGVyYXRpb24nKTtcblxuXHRcdHRoaXMuX3Byb2dyZXNzU2VydmljZS5zaG93V2hpbGUocmVuYW1lT3BlcmF0aW9uLCAyNTApO1xuXHRcdHJldHVybiByZW5hbWVPcGVyYXRpb247XG5cblx0fVxuXG5cdGFjY2VwdFJlbmFtZUlucHV0KHdhbnRzUHJldmlldzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmFtZVdpZGdldC5hY2NlcHRJbnB1dCh3YW50c1ByZXZpZXcpO1xuXHR9XG5cblx0Y2FuY2VsUmVuYW1lSW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVuYW1lV2lkZ2V0LmNhbmNlbElucHV0KHRydWUsICdjYW5jZWxSZW5hbWVJbnB1dCBjb21tYW5kJyk7XG5cdH1cblxuXHRmb2N1c05leHRSZW5hbWVTdWdnZXN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmFtZVdpZGdldC5mb2N1c05leHRSZW5hbWVTdWdnZXN0aW9uKCk7XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzUmVuYW1lU3VnZ2VzdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW5hbWVXaWRnZXQuZm9jdXNQcmV2aW91c1JlbmFtZVN1Z2dlc3Rpb24oKTtcblx0fVxufVxuXG4vLyAtLS0tIGFjdGlvbiBpbXBsZW1lbnRhdGlvblxuXG5leHBvcnQgY2xhc3MgUmVuYW1lQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24ucmVuYW1lJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdyZW5hbWUubGFiZWwnLCBcIlJlbmFtZSBTeW1ib2xcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSwgRWRpdG9yQ29udGV4dEtleXMuaGFzUmVuYW1lUHJvdmlkZXIpLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkYyLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdGNvbnRleHRNZW51T3B0czoge1xuXHRcdFx0XHRncm91cDogJzFfbW9kaWZpY2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEuMVxuXHRcdFx0fSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bkNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M6IFtVUkksIElQb3NpdGlvbl0pOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IFt1cmksIHBvc10gPSBBcnJheS5pc0FycmF5KGFyZ3MpICYmIGFyZ3MgfHwgW3VuZGVmaW5lZCwgdW5kZWZpbmVkXTtcblxuXHRcdGlmIChVUkkuaXNVcmkodXJpKSAmJiBQb3NpdGlvbi5pc0lQb3NpdGlvbihwb3MpKSB7XG5cdFx0XHRyZXR1cm4gZWRpdG9yU2VydmljZS5vcGVuQ29kZUVkaXRvcih7IHJlc291cmNlOiB1cmkgfSwgZWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCkpLnRoZW4oZWRpdG9yID0+IHtcblx0XHRcdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKHBvcyk7XG5cdFx0XHRcdGVkaXRvci5pbnZva2VXaXRoaW5Db250ZXh0KGFjY2Vzc29yID0+IHtcblx0XHRcdFx0XHR0aGlzLnJlcG9ydFRlbGVtZXRyeShhY2Nlc3NvciwgZWRpdG9yKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5ydW4oYWNjZXNzb3IsIGVkaXRvcik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSwgb25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5ydW5Db21tYW5kKGFjY2Vzc29yLCBhcmdzKTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IFJlbmFtZUNvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cblx0XHRpZiAoY29udHJvbGxlcikge1xuXHRcdFx0bG9nU2VydmljZS50cmFjZSgnW1JlbmFtZUFjdGlvbl0gZ290IGNvbnRyb2xsZXIsIHJ1bm5pbmcuLi4nKTtcblx0XHRcdHJldHVybiBjb250cm9sbGVyLnJ1bigpO1xuXHRcdH1cblx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdbUmVuYW1lQWN0aW9uXSByZXR1cm5pbmcgZWFybHkgLSBjb250cm9sbGVyIG1pc3NpbmcnKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24oUmVuYW1lQ29udHJvbGxlci5JRCwgUmVuYW1lQ29udHJvbGxlciwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5MYXp5KTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFJlbmFtZUFjdGlvbik7XG5cbmNvbnN0IFJlbmFtZUNvbW1hbmQgPSBFZGl0b3JDb21tYW5kLmJpbmRUb0NvbnRyaWJ1dGlvbjxSZW5hbWVDb250cm9sbGVyPihSZW5hbWVDb250cm9sbGVyLmdldCk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgUmVuYW1lQ29tbWFuZCh7XG5cdGlkOiAnYWNjZXB0UmVuYW1lSW5wdXQnLFxuXHRwcmVjb25kaXRpb246IENPTlRFWFRfUkVOQU1FX0lOUFVUX1ZJU0lCTEUsXG5cdGhhbmRsZXI6IHggPT4geC5hY2NlcHRSZW5hbWVJbnB1dChmYWxzZSksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgOTksXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyXG5cdH1cbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBSZW5hbWVDb21tYW5kKHtcblx0aWQ6ICdhY2NlcHRSZW5hbWVJbnB1dFdpdGhQcmV2aWV3Jyxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9SRU5BTUVfSU5QVVRfVklTSUJMRSwgQ29udGV4dEtleUV4cHIuaGFzKCdjb25maWcuZWRpdG9yLnJlbmFtZS5lbmFibGVQcmV2aWV3JykpLFxuXHRoYW5kbGVyOiB4ID0+IHguYWNjZXB0UmVuYW1lSW5wdXQodHJ1ZSksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgOTksXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCArIEtleUNvZGUuRW50ZXJcblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IFJlbmFtZUNvbW1hbmQoe1xuXHRpZDogJ2NhbmNlbFJlbmFtZUlucHV0Jyxcblx0cHJlY29uZGl0aW9uOiBDT05URVhUX1JFTkFNRV9JTlBVVF9WSVNJQkxFLFxuXHRoYW5kbGVyOiB4ID0+IHguY2FuY2VsUmVuYW1lSW5wdXQoKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyA5OSxcblx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuRXNjYXBlXVxuXHR9XG59KSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c05leHRSZW5hbWVTdWdnZXN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZm9jdXNOZXh0UmVuYW1lU3VnZ2VzdGlvbicsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5ubHMubG9jYWxpemUyKCdmb2N1c05leHRSZW5hbWVTdWdnZXN0aW9uJywgXCJGb2N1cyBOZXh0IFJlbmFtZSBTdWdnZXN0aW9uXCIpLFxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9SRU5BTUVfSU5QVVRfVklTSUJMRSxcblx0XHRcdGtleWJpbmRpbmc6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRG93bkFycm93LFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgOTksXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKS5nZXRGb2N1c2VkQ29kZUVkaXRvcigpO1xuXHRcdGlmICghY3VycmVudEVkaXRvcikgeyByZXR1cm47IH1cblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBSZW5hbWVDb250cm9sbGVyLmdldChjdXJyZW50RWRpdG9yKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHsgcmV0dXJuOyB9XG5cblx0XHRjb250cm9sbGVyLmZvY3VzTmV4dFJlbmFtZVN1Z2dlc3Rpb24oKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c1ByZXZpb3VzUmVuYW1lU3VnZ2VzdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2ZvY3VzUHJldmlvdXNSZW5hbWVTdWdnZXN0aW9uJyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLm5scy5sb2NhbGl6ZTIoJ2ZvY3VzUHJldmlvdXNSZW5hbWVTdWdnZXN0aW9uJywgXCJGb2N1cyBQcmV2aW91cyBSZW5hbWUgU3VnZ2VzdGlvblwiKSxcblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfUkVOQU1FX0lOUFVUX1ZJU0lCTEUsXG5cdFx0XHRrZXliaW5kaW5nOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyA5OSxcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudEVkaXRvciA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpLmdldEZvY3VzZWRDb2RlRWRpdG9yKCk7XG5cdFx0aWYgKCFjdXJyZW50RWRpdG9yKSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IFJlbmFtZUNvbnRyb2xsZXIuZ2V0KGN1cnJlbnRFZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikgeyByZXR1cm47IH1cblxuXHRcdGNvbnRyb2xsZXIuZm9jdXNQcmV2aW91c1JlbmFtZVN1Z2dlc3Rpb24oKTtcblx0fVxufSk7XG5cbi8vIC0tLS0gYXBpIGJyaWRnZSBjb21tYW5kXG5cbnJlZ2lzdGVyTW9kZWxBbmRQb3NpdGlvbkNvbW1hbmQoJ19leGVjdXRlRG9jdW1lbnRSZW5hbWVQcm92aWRlcicsIGZ1bmN0aW9uIChhY2Nlc3NvciwgbW9kZWwsIHBvc2l0aW9uLCAuLi5hcmdzKSB7XG5cdGNvbnN0IFtuZXdOYW1lXSA9IGFyZ3M7XG5cdGFzc2VydFR5cGUodHlwZW9mIG5ld05hbWUgPT09ICdzdHJpbmcnKTtcblx0Y29uc3QgeyByZW5hbWVQcm92aWRlciB9ID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiByZW5hbWUocmVuYW1lUHJvdmlkZXIsIG1vZGVsLCBwb3NpdGlvbiwgbmV3TmFtZSk7XG59KTtcblxucmVnaXN0ZXJNb2RlbEFuZFBvc2l0aW9uQ29tbWFuZCgnX2V4ZWN1dGVQcmVwYXJlUmVuYW1lJywgYXN5bmMgZnVuY3Rpb24gKGFjY2Vzc29yLCBtb2RlbCwgcG9zaXRpb24pIHtcblx0Y29uc3QgeyByZW5hbWVQcm92aWRlciB9ID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdGNvbnN0IHNrZWxldG9uID0gbmV3IFJlbmFtZVNrZWxldG9uKG1vZGVsLCBwb3NpdGlvbiwgcmVuYW1lUHJvdmlkZXIpO1xuXHRjb25zdCBsb2MgPSBhd2FpdCBza2VsZXRvbi5yZXNvbHZlUmVuYW1lTG9jYXRpb24oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdGlmIChsb2M/LnJlamVjdFJlYXNvbikge1xuXHRcdHRocm93IG5ldyBFcnJvcihsb2MucmVqZWN0UmVhc29uKTtcblx0fVxuXHRyZXR1cm4gbG9jO1xufSk7XG5cblxuLy90b2RvQGpyaWVrZW4gdXNlIGVkaXRvciBvcHRpb25zIHdvcmxkXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdGlkOiAnZWRpdG9yJyxcblx0cHJvcGVydGllczoge1xuXHRcdCdlZGl0b3IucmVuYW1lLmVuYWJsZVByZXZpZXcnOiB7XG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZW5hYmxlUHJldmlldycsIFwiRW5hYmxlL2Rpc2FibGUgdGhlIGFiaWxpdHkgdG8gcHJldmlldyBjaGFuZ2VzIGJlZm9yZSByZW5hbWluZ1wiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0eXBlOiAnYm9vbGVhbidcblx0XHR9XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVc7QUFDcEIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyxvQkFBb0Is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
