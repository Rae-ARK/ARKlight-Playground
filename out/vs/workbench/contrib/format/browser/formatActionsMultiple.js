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
import { getCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { EditorAction, registerEditorAction } from "../../../../editor/browser/editorExtensions.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import * as nls from "../../../../nls.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { formatDocumentRangesWithProvider, formatDocumentWithProvider, getRealAndSyntheticDocumentFormattersOrdered, FormattingConflicts, FormattingMode, FormattingKind } from "../../../../editor/contrib/format/browser/format.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IExtensionService, toExtension } from "../../../services/extensions/common/extensions.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IWorkbenchExtensionEnablementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { editorConfigurationBaseNode } from "../../../../editor/common/config/editorConfigurationSchema.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { ILanguageStatusService } from "../../../services/languageStatus/common/languageStatusService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { generateUuid } from "../../../../base/common/uuid.js";
let DefaultFormatter = class extends Disposable {
  constructor(_extensionService, _extensionEnablementService, _configService, _notificationService, _dialogService, _quickInputService, _languageService, _languageFeaturesService, _languageStatusService, _editorService) {
    super();
    this._extensionService = _extensionService;
    this._extensionEnablementService = _extensionEnablementService;
    this._configService = _configService;
    this._notificationService = _notificationService;
    this._dialogService = _dialogService;
    this._quickInputService = _quickInputService;
    this._languageService = _languageService;
    this._languageFeaturesService = _languageFeaturesService;
    this._languageStatusService = _languageStatusService;
    this._editorService = _editorService;
    this._languageStatusStore = this._store.add(new DisposableStore());
    this._store.add(this._extensionService.onDidChangeExtensions(this._updateConfigValues, this));
    this._store.add(FormattingConflicts.setFormatterSelector((formatter, document, mode, kind) => this._selectFormatter(formatter, document, mode, kind)));
    this._store.add(_editorService.onDidActiveEditorChange(this._updateStatus, this));
    this._store.add(_languageFeaturesService.documentFormattingEditProvider.onDidChange(this._updateStatus, this));
    this._store.add(_languageFeaturesService.documentRangeFormattingEditProvider.onDidChange(this._updateStatus, this));
    this._store.add(_languageFeaturesService.documentFormattingEditProvider.onDidChange(this._updateConfigValues, this));
    this._store.add(_languageFeaturesService.documentRangeFormattingEditProvider.onDidChange(this._updateConfigValues, this));
    this._store.add(_configService.onDidChangeConfiguration((e) => e.affectsConfiguration(DefaultFormatter.configName) && this._updateStatus()));
    this._updateConfigValues();
  }
  async _updateConfigValues() {
    await this._extensionService.whenInstalledExtensionsRegistered();
    let extensions = [...this._extensionService.extensions];
    const documentFormatters = this._languageFeaturesService.documentFormattingEditProvider.allNoModel();
    const rangeFormatters = this._languageFeaturesService.documentRangeFormattingEditProvider.allNoModel();
    const formatterExtensionIds = /* @__PURE__ */ new Set();
    for (const formatter of documentFormatters) {
      if (formatter.extensionId) {
        formatterExtensionIds.add(ExtensionIdentifier.toKey(formatter.extensionId));
      }
    }
    for (const formatter of rangeFormatters) {
      if (formatter.extensionId) {
        formatterExtensionIds.add(ExtensionIdentifier.toKey(formatter.extensionId));
      }
    }
    extensions = extensions.sort((a, b) => {
      const contributesFormatterA = formatterExtensionIds.has(ExtensionIdentifier.toKey(a.identifier));
      const contributesFormatterB = formatterExtensionIds.has(ExtensionIdentifier.toKey(b.identifier));
      if (contributesFormatterA && !contributesFormatterB) {
        return -1;
      } else if (!contributesFormatterA && contributesFormatterB) {
        return 1;
      }
      const boostA = a.categories?.find((cat) => cat === "Formatters" || cat === "Programming Languages");
      const boostB = b.categories?.find((cat) => cat === "Formatters" || cat === "Programming Languages");
      if (boostA && !boostB) {
        return -1;
      } else if (!boostA && boostB) {
        return 1;
      } else {
        return a.name.localeCompare(b.name);
      }
    });
    DefaultFormatter.extensionIds.length = 0;
    DefaultFormatter.extensionItemLabels.length = 0;
    DefaultFormatter.extensionDescriptions.length = 0;
    DefaultFormatter.extensionIds.push(null);
    DefaultFormatter.extensionItemLabels.push(nls.localize("null", "None"));
    DefaultFormatter.extensionDescriptions.push(nls.localize("nullFormatterDescription", "None"));
    for (const extension of extensions) {
      if (extension.main || extension.browser) {
        DefaultFormatter.extensionIds.push(extension.identifier.value);
        DefaultFormatter.extensionItemLabels.push(extension.displayName ?? "");
        DefaultFormatter.extensionDescriptions.push(extension.description ?? "");
      }
    }
  }
  static _maybeQuotes(s) {
    return s.match(/\s/) ? `'${s}'` : s;
  }
  async _analyzeFormatter(kind, formatter, document) {
    const defaultFormatterId = this._configService.getValue(DefaultFormatter.configName, {
      resource: document.uri,
      overrideIdentifier: document.getLanguageId()
    });
    if (defaultFormatterId) {
      const defaultFormatter = formatter.find((formatter2) => ExtensionIdentifier.equals(formatter2.extensionId, defaultFormatterId));
      if (defaultFormatter) {
        return defaultFormatter;
      }
      const extension = await this._extensionService.getExtension(defaultFormatterId);
      if (extension && this._extensionEnablementService.isEnabled(toExtension(extension))) {
        const langName2 = this._languageService.getLanguageName(document.getLanguageId()) || document.getLanguageId();
        const detail = kind === FormattingKind.File ? nls.localize("miss.1", "Extension '{0}' is configured as formatter but it cannot format '{1}'-files", extension.displayName || extension.name, langName2) : nls.localize("miss.2", "Extension '{0}' is configured as formatter but it can only format '{1}'-files as a whole, not selections or parts of it.", extension.displayName || extension.name, langName2);
        return detail;
      }
    } else if (formatter.length === 1) {
      return formatter[0];
    }
    const langName = this._languageService.getLanguageName(document.getLanguageId()) || document.getLanguageId();
    const message = !defaultFormatterId ? nls.localize("config.needed", "There are multiple formatters for '{0}' files. One of them should be configured as default formatter.", DefaultFormatter._maybeQuotes(langName)) : nls.localize("config.bad", "Extension '{0}' is configured as formatter but not available. Select a different default formatter to continue.", defaultFormatterId);
    return message;
  }
  async _selectFormatter(formatter, document, mode, kind) {
    const formatterOrMessage = await this._analyzeFormatter(kind, formatter, document);
    if (typeof formatterOrMessage !== "string") {
      return formatterOrMessage;
    }
    if (mode !== FormattingMode.Silent) {
      const { confirmed } = await this._dialogService.confirm({
        message: nls.localize("miss", "Configure Default Formatter"),
        detail: formatterOrMessage,
        primaryButton: nls.localize({ key: "do.config", comment: ["&& denotes a mnemonic"] }, "&&Configure...")
      });
      if (confirmed) {
        return this._pickAndPersistDefaultFormatter(formatter, document);
      }
    } else {
      this._notificationService.prompt(
        Severity.Info,
        formatterOrMessage,
        [{ label: nls.localize("do.config.notification", "Configure..."), run: () => this._pickAndPersistDefaultFormatter(formatter, document) }],
        { priority: NotificationPriority.SILENT }
      );
    }
    return void 0;
  }
  async _pickAndPersistDefaultFormatter(formatter, document) {
    const picks = formatter.map((formatter2, index) => {
      return {
        index,
        label: formatter2.displayName || (formatter2.extensionId ? formatter2.extensionId.value : "?"),
        description: formatter2.extensionId && formatter2.extensionId.value
      };
    });
    const langName = this._languageService.getLanguageName(document.getLanguageId()) || document.getLanguageId();
    const pick = await this._quickInputService.pick(picks, { placeHolder: nls.localize("select", "Select a default formatter for '{0}' files", DefaultFormatter._maybeQuotes(langName)) });
    if (!pick || !formatter[pick.index].extensionId) {
      return void 0;
    }
    this._configService.updateValue(DefaultFormatter.configName, formatter[pick.index].extensionId.value, {
      resource: document.uri,
      overrideIdentifier: document.getLanguageId()
    });
    return formatter[pick.index];
  }
  // --- status item
  _updateStatus() {
    this._languageStatusStore.clear();
    const editor = getCodeEditor(this._editorService.activeTextEditorControl);
    if (!editor || !editor.hasModel()) {
      return;
    }
    const document = editor.getModel();
    const formatter = getRealAndSyntheticDocumentFormattersOrdered(this._languageFeaturesService.documentFormattingEditProvider, this._languageFeaturesService.documentRangeFormattingEditProvider, document);
    if (formatter.length === 0) {
      return;
    }
    const cts = new CancellationTokenSource();
    this._languageStatusStore.add(toDisposable(() => cts.dispose(true)));
    this._analyzeFormatter(FormattingKind.File, formatter, document).then((result) => {
      if (cts.token.isCancellationRequested) {
        return;
      }
      if (typeof result !== "string") {
        return;
      }
      const command = { id: `formatter/configure/dfl/${generateUuid()}`, title: nls.localize("do.config.command", "Configure...") };
      this._languageStatusStore.add(CommandsRegistry.registerCommand(command.id, () => this._pickAndPersistDefaultFormatter(formatter, document)));
      this._languageStatusStore.add(this._languageStatusService.addStatus({
        id: "formatter.conflict",
        name: nls.localize("summary", "Formatter Conflicts"),
        selector: { language: document.getLanguageId(), pattern: document.uri.fsPath },
        severity: Severity.Error,
        label: nls.localize("formatter", "Formatting"),
        detail: result,
        busy: false,
        source: "",
        command,
        accessibilityInfo: void 0
      }));
    });
  }
};
DefaultFormatter.configName = "editor.defaultFormatter";
DefaultFormatter.extensionIds = [];
DefaultFormatter.extensionItemLabels = [];
DefaultFormatter.extensionDescriptions = [];
DefaultFormatter = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IWorkbenchExtensionEnablementService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, IQuickInputService),
  __decorateParam(6, ILanguageService),
  __decorateParam(7, ILanguageFeaturesService),
  __decorateParam(8, ILanguageStatusService),
  __decorateParam(9, IEditorService)
], DefaultFormatter);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
  DefaultFormatter,
  LifecyclePhase.Restored
);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...editorConfigurationBaseNode,
  properties: {
    [DefaultFormatter.configName]: {
      description: nls.localize("formatter.default", "Defines a default formatter which takes precedence over all other formatter settings. Must be the identifier of an extension contributing a formatter."),
      type: ["string", "null"],
      default: null,
      enum: DefaultFormatter.extensionIds,
      enumItemLabels: DefaultFormatter.extensionItemLabels,
      markdownEnumDescriptions: DefaultFormatter.extensionDescriptions
    }
  }
});
async function showFormatterPick(accessor, model, formatters) {
  const quickPickService = accessor.get(IQuickInputService);
  const configService = accessor.get(IConfigurationService);
  const languageService = accessor.get(ILanguageService);
  const overrides = { resource: model.uri, overrideIdentifier: model.getLanguageId() };
  const defaultFormatter = configService.getValue(DefaultFormatter.configName, overrides);
  let defaultFormatterPick;
  const picks = formatters.map((provider, index) => {
    const isDefault = ExtensionIdentifier.equals(provider.extensionId, defaultFormatter);
    const pick2 = {
      index,
      label: provider.displayName || "",
      description: isDefault ? nls.localize("def", "(default)") : void 0
    };
    if (isDefault) {
      defaultFormatterPick = pick2;
    }
    return pick2;
  });
  const configurePick = {
    label: nls.localize("config", "Configure Default Formatter...")
  };
  const pick = await quickPickService.pick(
    [...picks, { type: "separator" }, configurePick],
    {
      placeHolder: nls.localize("format.placeHolder", "Select a formatter"),
      activeItem: defaultFormatterPick
    }
  );
  if (!pick) {
    return void 0;
  } else if (pick === configurePick) {
    const langName = languageService.getLanguageName(model.getLanguageId()) || model.getLanguageId();
    const pick2 = await quickPickService.pick(picks, { placeHolder: nls.localize("select", "Select a default formatter for '{0}' files", DefaultFormatter._maybeQuotes(langName)) });
    if (pick2 && formatters[pick2.index].extensionId) {
      configService.updateValue(DefaultFormatter.configName, formatters[pick2.index].extensionId.value, overrides);
    }
    return void 0;
  } else {
    return pick.index;
  }
}
registerEditorAction(class FormatDocumentMultipleAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.formatDocument.multiple",
      label: nls.localize("formatDocument.label.multiple", "Format Document With..."),
      alias: "Format Document...",
      precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasMultipleDocumentFormattingProvider),
      contextMenuOpts: {
        group: "1_modification",
        order: 1.3
      }
    });
  }
  async run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    const instaService = accessor.get(IInstantiationService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const model = editor.getModel();
    const provider = getRealAndSyntheticDocumentFormattersOrdered(languageFeaturesService.documentFormattingEditProvider, languageFeaturesService.documentRangeFormattingEditProvider, model);
    const pick = await instaService.invokeFunction(showFormatterPick, model, provider);
    if (typeof pick === "number") {
      await instaService.invokeFunction(formatDocumentWithProvider, provider[pick], editor, FormattingMode.Explicit, CancellationToken.None);
    }
  }
});
registerEditorAction(class FormatSelectionMultipleAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.formatSelection.multiple",
      label: nls.localize("formatSelection.label.multiple", "Format Selection With..."),
      alias: "Format Code...",
      precondition: ContextKeyExpr.and(ContextKeyExpr.and(EditorContextKeys.writable), EditorContextKeys.hasMultipleDocumentSelectionFormattingProvider),
      contextMenuOpts: {
        when: ContextKeyExpr.and(EditorContextKeys.hasNonEmptySelection),
        group: "1_modification",
        order: 1.31
      }
    });
  }
  async run(accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const instaService = accessor.get(IInstantiationService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const model = editor.getModel();
    let range = editor.getSelection();
    if (range.isEmpty()) {
      range = new Range(range.startLineNumber, 1, range.startLineNumber, model.getLineMaxColumn(range.startLineNumber));
    }
    const provider = languageFeaturesService.documentRangeFormattingEditProvider.ordered(model);
    const pick = await instaService.invokeFunction(showFormatterPick, model, provider);
    if (typeof pick === "number") {
      await instaService.invokeFunction(formatDocumentRangesWithProvider, provider[pick], editor, range, CancellationToken.None, true);
    }
  }
});
export {
  DefaultFormatter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2Zvcm1hdC9icm93c2VyL2Zvcm1hdEFjdGlvbnNNdWx0aXBsZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdldENvZGVFZGl0b3IsIElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIHJlZ2lzdGVyRWRpdG9yQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLCBEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGZvcm1hdERvY3VtZW50UmFuZ2VzV2l0aFByb3ZpZGVyLCBmb3JtYXREb2N1bWVudFdpdGhQcm92aWRlciwgZ2V0UmVhbEFuZFN5bnRoZXRpY0RvY3VtZW50Rm9ybWF0dGVyc09yZGVyZWQsIEZvcm1hdHRpbmdDb25mbGljdHMsIEZvcm1hdHRpbmdNb2RlLCBGb3JtYXR0aW5nS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Zvcm1hdC9icm93c2VyL2Zvcm1hdC5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UsIHRvRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBOb3RpZmljYXRpb25Qcmlvcml0eSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBlZGl0b3JDb25maWd1cmF0aW9uQmFzZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JDb25maWd1cmF0aW9uU2NoZW1hLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU3RhdHVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xhbmd1YWdlU3RhdHVzL2NvbW1vbi9sYW5ndWFnZVN0YXR1c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcblxudHlwZSBGb3JtYXR0aW5nRWRpdFByb3ZpZGVyID0gRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyIHwgRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXI7XG5cbmV4cG9ydCBjbGFzcyBEZWZhdWx0Rm9ybWF0dGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBjb25maWdOYW1lID0gJ2VkaXRvci5kZWZhdWx0Rm9ybWF0dGVyJztcblxuXHRzdGF0aWMgZXh0ZW5zaW9uSWRzOiAoc3RyaW5nIHwgbnVsbClbXSA9IFtdO1xuXHRzdGF0aWMgZXh0ZW5zaW9uSXRlbUxhYmVsczogc3RyaW5nW10gPSBbXTtcblx0c3RhdGljIGV4dGVuc2lvbkRlc2NyaXB0aW9uczogc3RyaW5nW10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVN0YXR1c1N0b3JlID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTdGF0dXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU3RhdHVzU2VydmljZTogSUxhbmd1YWdlU3RhdHVzU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zKHRoaXMuX3VwZGF0ZUNvbmZpZ1ZhbHVlcywgdGhpcykpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChGb3JtYXR0aW5nQ29uZmxpY3RzLnNldEZvcm1hdHRlclNlbGVjdG9yKChmb3JtYXR0ZXIsIGRvY3VtZW50LCBtb2RlLCBraW5kKSA9PiB0aGlzLl9zZWxlY3RGb3JtYXR0ZXIoZm9ybWF0dGVyLCBkb2N1bWVudCwgbW9kZSwga2luZCkpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoX2VkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UodGhpcy5fdXBkYXRlU3RhdHVzLCB0aGlzKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIub25EaWRDaGFuZ2UodGhpcy5fdXBkYXRlU3RhdHVzLCB0aGlzKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlci5vbkRpZENoYW5nZSh0aGlzLl91cGRhdGVTdGF0dXMsIHRoaXMpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlci5vbkRpZENoYW5nZSh0aGlzLl91cGRhdGVDb25maWdWYWx1ZXMsIHRoaXMpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLm9uRGlkQ2hhbmdlKHRoaXMuX3VwZGF0ZUNvbmZpZ1ZhbHVlcywgdGhpcykpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChfY29uZmlnU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKERlZmF1bHRGb3JtYXR0ZXIuY29uZmlnTmFtZSkgJiYgdGhpcy5fdXBkYXRlU3RhdHVzKCkpKTtcblx0XHR0aGlzLl91cGRhdGVDb25maWdWYWx1ZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZUNvbmZpZ1ZhbHVlcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXHRcdGxldCBleHRlbnNpb25zID0gWy4uLnRoaXMuX2V4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9uc107XG5cblx0XHQvLyBHZXQgYWxsIGZvcm1hdHRlciBwcm92aWRlcnMgdG8gaWRlbnRpZnkgd2hpY2ggZXh0ZW5zaW9ucyBhY3R1YWxseSBjb250cmlidXRlIGZvcm1hdHRlcnNcblx0XHRjb25zdCBkb2N1bWVudEZvcm1hdHRlcnMgPSB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIuYWxsTm9Nb2RlbCgpO1xuXHRcdGNvbnN0IHJhbmdlRm9ybWF0dGVycyA9IHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLmFsbE5vTW9kZWwoKTtcblx0XHRjb25zdCBmb3JtYXR0ZXJFeHRlbnNpb25JZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdGZvciAoY29uc3QgZm9ybWF0dGVyIG9mIGRvY3VtZW50Rm9ybWF0dGVycykge1xuXHRcdFx0aWYgKGZvcm1hdHRlci5leHRlbnNpb25JZCkge1xuXHRcdFx0XHRmb3JtYXR0ZXJFeHRlbnNpb25JZHMuYWRkKEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZm9ybWF0dGVyLmV4dGVuc2lvbklkKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZm9ybWF0dGVyIG9mIHJhbmdlRm9ybWF0dGVycykge1xuXHRcdFx0aWYgKGZvcm1hdHRlci5leHRlbnNpb25JZCkge1xuXHRcdFx0XHRmb3JtYXR0ZXJFeHRlbnNpb25JZHMuYWRkKEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZm9ybWF0dGVyLmV4dGVuc2lvbklkKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZXh0ZW5zaW9ucyA9IGV4dGVuc2lvbnMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0Ly8gVWx0aW1hdGUgYm9vc3Q6IGV4dGVuc2lvbnMgdGhhdCBhY3R1YWxseSBjb250cmlidXRlIGZvcm1hdHRlcnNcblx0XHRcdGNvbnN0IGNvbnRyaWJ1dGVzRm9ybWF0dGVyQSA9IGZvcm1hdHRlckV4dGVuc2lvbklkcy5oYXMoRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShhLmlkZW50aWZpZXIpKTtcblx0XHRcdGNvbnN0IGNvbnRyaWJ1dGVzRm9ybWF0dGVyQiA9IGZvcm1hdHRlckV4dGVuc2lvbklkcy5oYXMoRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShiLmlkZW50aWZpZXIpKTtcblxuXHRcdFx0aWYgKGNvbnRyaWJ1dGVzRm9ybWF0dGVyQSAmJiAhY29udHJpYnV0ZXNGb3JtYXR0ZXJCKSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH0gZWxzZSBpZiAoIWNvbnRyaWJ1dGVzRm9ybWF0dGVyQSAmJiBjb250cmlidXRlc0Zvcm1hdHRlckIpIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNlY29uZGFyeSBib29zdDogY2F0ZWdvcnktYmFzZWQgc29ydGluZ1xuXHRcdFx0Y29uc3QgYm9vc3RBID0gYS5jYXRlZ29yaWVzPy5maW5kKGNhdCA9PiBjYXQgPT09ICdGb3JtYXR0ZXJzJyB8fCBjYXQgPT09ICdQcm9ncmFtbWluZyBMYW5ndWFnZXMnKTtcblx0XHRcdGNvbnN0IGJvb3N0QiA9IGIuY2F0ZWdvcmllcz8uZmluZChjYXQgPT4gY2F0ID09PSAnRm9ybWF0dGVycycgfHwgY2F0ID09PSAnUHJvZ3JhbW1pbmcgTGFuZ3VhZ2VzJyk7XG5cblx0XHRcdGlmIChib29zdEEgJiYgIWJvb3N0Qikge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9IGVsc2UgaWYgKCFib29zdEEgJiYgYm9vc3RCKSB7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHREZWZhdWx0Rm9ybWF0dGVyLmV4dGVuc2lvbklkcy5sZW5ndGggPSAwO1xuXHRcdERlZmF1bHRGb3JtYXR0ZXIuZXh0ZW5zaW9uSXRlbUxhYmVscy5sZW5ndGggPSAwO1xuXHRcdERlZmF1bHRGb3JtYXR0ZXIuZXh0ZW5zaW9uRGVzY3JpcHRpb25zLmxlbmd0aCA9IDA7XG5cblx0XHREZWZhdWx0Rm9ybWF0dGVyLmV4dGVuc2lvbklkcy5wdXNoKG51bGwpO1xuXHRcdERlZmF1bHRGb3JtYXR0ZXIuZXh0ZW5zaW9uSXRlbUxhYmVscy5wdXNoKG5scy5sb2NhbGl6ZSgnbnVsbCcsICdOb25lJykpO1xuXHRcdERlZmF1bHRGb3JtYXR0ZXIuZXh0ZW5zaW9uRGVzY3JpcHRpb25zLnB1c2gobmxzLmxvY2FsaXplKCdudWxsRm9ybWF0dGVyRGVzY3JpcHRpb24nLCBcIk5vbmVcIikpO1xuXG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKGV4dGVuc2lvbi5tYWluIHx8IGV4dGVuc2lvbi5icm93c2VyKSB7XG5cdFx0XHRcdERlZmF1bHRGb3JtYXR0ZXIuZXh0ZW5zaW9uSWRzLnB1c2goZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpO1xuXHRcdFx0XHREZWZhdWx0Rm9ybWF0dGVyLmV4dGVuc2lvbkl0ZW1MYWJlbHMucHVzaChleHRlbnNpb24uZGlzcGxheU5hbWUgPz8gJycpO1xuXHRcdFx0XHREZWZhdWx0Rm9ybWF0dGVyLmV4dGVuc2lvbkRlc2NyaXB0aW9ucy5wdXNoKGV4dGVuc2lvbi5kZXNjcmlwdGlvbiA/PyAnJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0c3RhdGljIF9tYXliZVF1b3RlcyhzOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBzLm1hdGNoKC9cXHMvKSA/IGAnJHtzfSdgIDogcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FuYWx5emVGb3JtYXR0ZXI8VCBleHRlbmRzIEZvcm1hdHRpbmdFZGl0UHJvdmlkZXI+KGtpbmQ6IEZvcm1hdHRpbmdLaW5kLCBmb3JtYXR0ZXI6IFRbXSwgZG9jdW1lbnQ6IElUZXh0TW9kZWwpOiBQcm9taXNlPFQgfCBzdHJpbmc+IHtcblx0XHRjb25zdCBkZWZhdWx0Rm9ybWF0dGVySWQgPSB0aGlzLl9jb25maWdTZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oRGVmYXVsdEZvcm1hdHRlci5jb25maWdOYW1lLCB7XG5cdFx0XHRyZXNvdXJjZTogZG9jdW1lbnQudXJpLFxuXHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyOiBkb2N1bWVudC5nZXRMYW5ndWFnZUlkKClcblx0XHR9KTtcblxuXHRcdGlmIChkZWZhdWx0Rm9ybWF0dGVySWQpIHtcblx0XHRcdC8vIGdvb2QgLT4gZm9ybWF0dGVyIGNvbmZpZ3VyZWRcblx0XHRcdGNvbnN0IGRlZmF1bHRGb3JtYXR0ZXIgPSBmb3JtYXR0ZXIuZmluZChmb3JtYXR0ZXIgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZm9ybWF0dGVyLmV4dGVuc2lvbklkLCBkZWZhdWx0Rm9ybWF0dGVySWQpKTtcblx0XHRcdGlmIChkZWZhdWx0Rm9ybWF0dGVyKSB7XG5cdFx0XHRcdC8vIGZvcm1hdHRlciBhdmFpbGFibGVcblx0XHRcdFx0cmV0dXJuIGRlZmF1bHRGb3JtYXR0ZXI7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGJhZCAtPiBmb3JtYXR0ZXIgZ29uZVxuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb24oZGVmYXVsdEZvcm1hdHRlcklkKTtcblx0XHRcdGlmIChleHRlbnNpb24gJiYgdGhpcy5fZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKHRvRXh0ZW5zaW9uKGV4dGVuc2lvbikpKSB7XG5cdFx0XHRcdC8vIGZvcm1hdHRlciBkb2VzIG5vdCB0YXJnZXQgdGhpcyBmaWxlXG5cdFx0XHRcdGNvbnN0IGxhbmdOYW1lID0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlTmFtZShkb2N1bWVudC5nZXRMYW5ndWFnZUlkKCkpIHx8IGRvY3VtZW50LmdldExhbmd1YWdlSWQoKTtcblx0XHRcdFx0Y29uc3QgZGV0YWlsID0ga2luZCA9PT0gRm9ybWF0dGluZ0tpbmQuRmlsZVxuXHRcdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdtaXNzLjEnLCBcIkV4dGVuc2lvbiAnezB9JyBpcyBjb25maWd1cmVkIGFzIGZvcm1hdHRlciBidXQgaXQgY2Fubm90IGZvcm1hdCAnezF9Jy1maWxlc1wiLCBleHRlbnNpb24uZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLm5hbWUsIGxhbmdOYW1lKVxuXHRcdFx0XHRcdDogbmxzLmxvY2FsaXplKCdtaXNzLjInLCBcIkV4dGVuc2lvbiAnezB9JyBpcyBjb25maWd1cmVkIGFzIGZvcm1hdHRlciBidXQgaXQgY2FuIG9ubHkgZm9ybWF0ICd7MX0nLWZpbGVzIGFzIGEgd2hvbGUsIG5vdCBzZWxlY3Rpb25zIG9yIHBhcnRzIG9mIGl0LlwiLCBleHRlbnNpb24uZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLm5hbWUsIGxhbmdOYW1lKTtcblx0XHRcdFx0cmV0dXJuIGRldGFpbDtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSBpZiAoZm9ybWF0dGVyLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Ly8gb2sgLT4gbm90aGluZyBjb25maWd1cmVkIGJ1dCBvbmx5IG9uZSBmb3JtYXR0ZXIgYXZhaWxhYmxlXG5cdFx0XHRyZXR1cm4gZm9ybWF0dGVyWzBdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhbmdOYW1lID0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlTmFtZShkb2N1bWVudC5nZXRMYW5ndWFnZUlkKCkpIHx8IGRvY3VtZW50LmdldExhbmd1YWdlSWQoKTtcblx0XHRjb25zdCBtZXNzYWdlID0gIWRlZmF1bHRGb3JtYXR0ZXJJZFxuXHRcdFx0PyBubHMubG9jYWxpemUoJ2NvbmZpZy5uZWVkZWQnLCBcIlRoZXJlIGFyZSBtdWx0aXBsZSBmb3JtYXR0ZXJzIGZvciAnezB9JyBmaWxlcy4gT25lIG9mIHRoZW0gc2hvdWxkIGJlIGNvbmZpZ3VyZWQgYXMgZGVmYXVsdCBmb3JtYXR0ZXIuXCIsIERlZmF1bHRGb3JtYXR0ZXIuX21heWJlUXVvdGVzKGxhbmdOYW1lKSlcblx0XHRcdDogbmxzLmxvY2FsaXplKCdjb25maWcuYmFkJywgXCJFeHRlbnNpb24gJ3swfScgaXMgY29uZmlndXJlZCBhcyBmb3JtYXR0ZXIgYnV0IG5vdCBhdmFpbGFibGUuIFNlbGVjdCBhIGRpZmZlcmVudCBkZWZhdWx0IGZvcm1hdHRlciB0byBjb250aW51ZS5cIiwgZGVmYXVsdEZvcm1hdHRlcklkKTtcblxuXHRcdHJldHVybiBtZXNzYWdlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VsZWN0Rm9ybWF0dGVyPFQgZXh0ZW5kcyBGb3JtYXR0aW5nRWRpdFByb3ZpZGVyPihmb3JtYXR0ZXI6IFRbXSwgZG9jdW1lbnQ6IElUZXh0TW9kZWwsIG1vZGU6IEZvcm1hdHRpbmdNb2RlLCBraW5kOiBGb3JtYXR0aW5nS2luZCk6IFByb21pc2U8VCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGZvcm1hdHRlck9yTWVzc2FnZSA9IGF3YWl0IHRoaXMuX2FuYWx5emVGb3JtYXR0ZXIoa2luZCwgZm9ybWF0dGVyLCBkb2N1bWVudCk7XG5cdFx0aWYgKHR5cGVvZiBmb3JtYXR0ZXJPck1lc3NhZ2UgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gZm9ybWF0dGVyT3JNZXNzYWdlO1xuXHRcdH1cblxuXHRcdGlmIChtb2RlICE9PSBGb3JtYXR0aW5nTW9kZS5TaWxlbnQpIHtcblx0XHRcdC8vIHJ1bm5pbmcgZnJvbSBhIHVzZXIgYWN0aW9uIC0+IHNob3cgbW9kYWwgZGlhbG9nIHNvIHRoYXQgdXNlcnMgY29uZmlndXJlXG5cdFx0XHQvLyBhIGRlZmF1bHQgZm9ybWF0dGVyXG5cdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdtaXNzJywgXCJDb25maWd1cmUgRGVmYXVsdCBGb3JtYXR0ZXJcIiksXG5cdFx0XHRcdGRldGFpbDogZm9ybWF0dGVyT3JNZXNzYWdlLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBubHMubG9jYWxpemUoeyBrZXk6ICdkby5jb25maWcnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDb25maWd1cmUuLi5cIilcblx0XHRcdH0pO1xuXHRcdFx0aWYgKGNvbmZpcm1lZCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcGlja0FuZFBlcnNpc3REZWZhdWx0Rm9ybWF0dGVyKGZvcm1hdHRlciwgZG9jdW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBubyB1c2VyIGFjdGlvbiAtPiBzaG93IGEgc2lsZW50IG5vdGlmaWNhdGlvbiBhbmQgcHJvY2VlZFxuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdGZvcm1hdHRlck9yTWVzc2FnZSxcblx0XHRcdFx0W3sgbGFiZWw6IG5scy5sb2NhbGl6ZSgnZG8uY29uZmlnLm5vdGlmaWNhdGlvbicsIFwiQ29uZmlndXJlLi4uXCIpLCBydW46ICgpID0+IHRoaXMuX3BpY2tBbmRQZXJzaXN0RGVmYXVsdEZvcm1hdHRlcihmb3JtYXR0ZXIsIGRvY3VtZW50KSB9XSxcblx0XHRcdFx0eyBwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuU0lMRU5UIH1cblx0XHRcdCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9waWNrQW5kUGVyc2lzdERlZmF1bHRGb3JtYXR0ZXI8VCBleHRlbmRzIEZvcm1hdHRpbmdFZGl0UHJvdmlkZXI+KGZvcm1hdHRlcjogVFtdLCBkb2N1bWVudDogSVRleHRNb2RlbCk6IFByb21pc2U8VCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBpY2tzID0gZm9ybWF0dGVyLm1hcCgoZm9ybWF0dGVyLCBpbmRleCk6IElJbmRleGVkUGljayA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpbmRleCxcblx0XHRcdFx0bGFiZWw6IGZvcm1hdHRlci5kaXNwbGF5TmFtZSB8fCAoZm9ybWF0dGVyLmV4dGVuc2lvbklkID8gZm9ybWF0dGVyLmV4dGVuc2lvbklkLnZhbHVlIDogJz8nKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGZvcm1hdHRlci5leHRlbnNpb25JZCAmJiBmb3JtYXR0ZXIuZXh0ZW5zaW9uSWQudmFsdWVcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0Y29uc3QgbGFuZ05hbWUgPSB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VOYW1lKGRvY3VtZW50LmdldExhbmd1YWdlSWQoKSkgfHwgZG9jdW1lbnQuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdGNvbnN0IHBpY2sgPSBhd2FpdCB0aGlzLl9xdWlja0lucHV0U2VydmljZS5waWNrKHBpY2tzLCB7IHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ3NlbGVjdCcsIFwiU2VsZWN0IGEgZGVmYXVsdCBmb3JtYXR0ZXIgZm9yICd7MH0nIGZpbGVzXCIsIERlZmF1bHRGb3JtYXR0ZXIuX21heWJlUXVvdGVzKGxhbmdOYW1lKSkgfSk7XG5cdFx0aWYgKCFwaWNrIHx8ICFmb3JtYXR0ZXJbcGljay5pbmRleF0uZXh0ZW5zaW9uSWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbmZpZ1NlcnZpY2UudXBkYXRlVmFsdWUoRGVmYXVsdEZvcm1hdHRlci5jb25maWdOYW1lLCBmb3JtYXR0ZXJbcGljay5pbmRleF0uZXh0ZW5zaW9uSWQhLnZhbHVlLCB7XG5cdFx0XHRyZXNvdXJjZTogZG9jdW1lbnQudXJpLFxuXHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyOiBkb2N1bWVudC5nZXRMYW5ndWFnZUlkKClcblx0XHR9KTtcblx0XHRyZXR1cm4gZm9ybWF0dGVyW3BpY2suaW5kZXhdO1xuXHR9XG5cblx0Ly8gLS0tIHN0YXR1cyBpdGVtXG5cblx0cHJpdmF0ZSBfdXBkYXRlU3RhdHVzKCkge1xuXHRcdHRoaXMuX2xhbmd1YWdlU3RhdHVzU3RvcmUuY2xlYXIoKTtcblxuXHRcdGNvbnN0IGVkaXRvciA9IGdldENvZGVFZGl0b3IodGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbCk7XG5cdFx0aWYgKCFlZGl0b3IgfHwgIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cblx0XHRjb25zdCBkb2N1bWVudCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IGZvcm1hdHRlciA9IGdldFJlYWxBbmRTeW50aGV0aWNEb2N1bWVudEZvcm1hdHRlcnNPcmRlcmVkKHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlciwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIsIGRvY3VtZW50KTtcblxuXHRcdGlmIChmb3JtYXR0ZXIubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VTdGF0dXNTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cblx0XHR0aGlzLl9hbmFseXplRm9ybWF0dGVyKEZvcm1hdHRpbmdLaW5kLkZpbGUsIGZvcm1hdHRlciwgZG9jdW1lbnQpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiByZXN1bHQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbW1hbmQgPSB7IGlkOiBgZm9ybWF0dGVyL2NvbmZpZ3VyZS9kZmwvJHtnZW5lcmF0ZVV1aWQoKX1gLCB0aXRsZTogbmxzLmxvY2FsaXplKCdkby5jb25maWcuY29tbWFuZCcsIFwiQ29uZmlndXJlLi4uXCIpIH07XG5cdFx0XHR0aGlzLl9sYW5ndWFnZVN0YXR1c1N0b3JlLmFkZChDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChjb21tYW5kLmlkLCAoKSA9PiB0aGlzLl9waWNrQW5kUGVyc2lzdERlZmF1bHRGb3JtYXR0ZXIoZm9ybWF0dGVyLCBkb2N1bWVudCkpKTtcblx0XHRcdHRoaXMuX2xhbmd1YWdlU3RhdHVzU3RvcmUuYWRkKHRoaXMuX2xhbmd1YWdlU3RhdHVzU2VydmljZS5hZGRTdGF0dXMoe1xuXHRcdFx0XHRpZDogJ2Zvcm1hdHRlci5jb25mbGljdCcsXG5cdFx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZSgnc3VtbWFyeScsIFwiRm9ybWF0dGVyIENvbmZsaWN0c1wiKSxcblx0XHRcdFx0c2VsZWN0b3I6IHsgbGFuZ3VhZ2U6IGRvY3VtZW50LmdldExhbmd1YWdlSWQoKSwgcGF0dGVybjogZG9jdW1lbnQudXJpLmZzUGF0aCB9LFxuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2Zvcm1hdHRlcicsIFwiRm9ybWF0dGluZ1wiKSxcblx0XHRcdFx0ZGV0YWlsOiByZXN1bHQsXG5cdFx0XHRcdGJ1c3k6IGZhbHNlLFxuXHRcdFx0XHRzb3VyY2U6ICcnLFxuXHRcdFx0XHRjb21tYW5kLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5SW5mbzogdW5kZWZpbmVkXG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFxuXHREZWZhdWx0Rm9ybWF0dGVyLFxuXHRMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZFxuKTtcblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0Li4uZWRpdG9yQ29uZmlndXJhdGlvbkJhc2VOb2RlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0W0RlZmF1bHRGb3JtYXR0ZXIuY29uZmlnTmFtZV06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2Zvcm1hdHRlci5kZWZhdWx0JywgXCJEZWZpbmVzIGEgZGVmYXVsdCBmb3JtYXR0ZXIgd2hpY2ggdGFrZXMgcHJlY2VkZW5jZSBvdmVyIGFsbCBvdGhlciBmb3JtYXR0ZXIgc2V0dGluZ3MuIE11c3QgYmUgdGhlIGlkZW50aWZpZXIgb2YgYW4gZXh0ZW5zaW9uIGNvbnRyaWJ1dGluZyBhIGZvcm1hdHRlci5cIiksXG5cdFx0XHR0eXBlOiBbJ3N0cmluZycsICdudWxsJ10sXG5cdFx0XHRkZWZhdWx0OiBudWxsLFxuXHRcdFx0ZW51bTogRGVmYXVsdEZvcm1hdHRlci5leHRlbnNpb25JZHMsXG5cdFx0XHRlbnVtSXRlbUxhYmVsczogRGVmYXVsdEZvcm1hdHRlci5leHRlbnNpb25JdGVtTGFiZWxzLFxuXHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBEZWZhdWx0Rm9ybWF0dGVyLmV4dGVuc2lvbkRlc2NyaXB0aW9uc1xuXHRcdH1cblx0fVxufSk7XG5cbmludGVyZmFjZSBJSW5kZXhlZFBpY2sgZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdGluZGV4OiBudW1iZXI7XG59XG5cblxuYXN5bmMgZnVuY3Rpb24gc2hvd0Zvcm1hdHRlclBpY2soYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG1vZGVsOiBJVGV4dE1vZGVsLCBmb3JtYXR0ZXJzOiBGb3JtYXR0aW5nRWRpdFByb3ZpZGVyW10pOiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCBxdWlja1BpY2tTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXG5cdGNvbnN0IG92ZXJyaWRlcyA9IHsgcmVzb3VyY2U6IG1vZGVsLnVyaSwgb3ZlcnJpZGVJZGVudGlmaWVyOiBtb2RlbC5nZXRMYW5ndWFnZUlkKCkgfTtcblx0Y29uc3QgZGVmYXVsdEZvcm1hdHRlciA9IGNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihEZWZhdWx0Rm9ybWF0dGVyLmNvbmZpZ05hbWUsIG92ZXJyaWRlcyk7XG5cblx0bGV0IGRlZmF1bHRGb3JtYXR0ZXJQaWNrOiBJSW5kZXhlZFBpY2sgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3QgcGlja3MgPSBmb3JtYXR0ZXJzLm1hcCgocHJvdmlkZXIsIGluZGV4KSA9PiB7XG5cdFx0Y29uc3QgaXNEZWZhdWx0ID0gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMocHJvdmlkZXIuZXh0ZW5zaW9uSWQsIGRlZmF1bHRGb3JtYXR0ZXIpO1xuXHRcdGNvbnN0IHBpY2s6IElJbmRleGVkUGljayA9IHtcblx0XHRcdGluZGV4LFxuXHRcdFx0bGFiZWw6IHByb3ZpZGVyLmRpc3BsYXlOYW1lIHx8ICcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGlzRGVmYXVsdCA/IG5scy5sb2NhbGl6ZSgnZGVmJywgXCIoZGVmYXVsdClcIikgOiB1bmRlZmluZWQsXG5cdFx0fTtcblxuXHRcdGlmIChpc0RlZmF1bHQpIHtcblx0XHRcdC8vIGF1dG9mb2N1cyBkZWZhdWx0IHBpY2tcblx0XHRcdGRlZmF1bHRGb3JtYXR0ZXJQaWNrID0gcGljaztcblx0XHR9XG5cblx0XHRyZXR1cm4gcGljaztcblx0fSk7XG5cblx0Y29uc3QgY29uZmlndXJlUGljazogSVF1aWNrUGlja0l0ZW0gPSB7XG5cdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnY29uZmlnJywgXCJDb25maWd1cmUgRGVmYXVsdCBGb3JtYXR0ZXIuLi5cIilcblx0fTtcblxuXHRjb25zdCBwaWNrID0gYXdhaXQgcXVpY2tQaWNrU2VydmljZS5waWNrKFsuLi5waWNrcywgeyB0eXBlOiAnc2VwYXJhdG9yJyB9LCBjb25maWd1cmVQaWNrXSxcblx0XHR7XG5cdFx0XHRwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKCdmb3JtYXQucGxhY2VIb2xkZXInLCBcIlNlbGVjdCBhIGZvcm1hdHRlclwiKSxcblx0XHRcdGFjdGl2ZUl0ZW06IGRlZmF1bHRGb3JtYXR0ZXJQaWNrXG5cdFx0fVxuXHQpO1xuXHRpZiAoIXBpY2spIHtcblx0XHQvLyBkaXNtaXNzZWRcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXG5cdH0gZWxzZSBpZiAocGljayA9PT0gY29uZmlndXJlUGljaykge1xuXHRcdC8vIGNvbmZpZyBkZWZhdWx0XG5cdFx0Y29uc3QgbGFuZ05hbWUgPSBsYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VOYW1lKG1vZGVsLmdldExhbmd1YWdlSWQoKSkgfHwgbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdGNvbnN0IHBpY2sgPSBhd2FpdCBxdWlja1BpY2tTZXJ2aWNlLnBpY2socGlja3MsIHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnc2VsZWN0JywgXCJTZWxlY3QgYSBkZWZhdWx0IGZvcm1hdHRlciBmb3IgJ3swfScgZmlsZXNcIiwgRGVmYXVsdEZvcm1hdHRlci5fbWF5YmVRdW90ZXMobGFuZ05hbWUpKSB9KTtcblx0XHRpZiAocGljayAmJiBmb3JtYXR0ZXJzW3BpY2suaW5kZXhdLmV4dGVuc2lvbklkKSB7XG5cdFx0XHRjb25maWdTZXJ2aWNlLnVwZGF0ZVZhbHVlKERlZmF1bHRGb3JtYXR0ZXIuY29uZmlnTmFtZSwgZm9ybWF0dGVyc1twaWNrLmluZGV4XS5leHRlbnNpb25JZCEudmFsdWUsIG92ZXJyaWRlcyk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cblx0fSBlbHNlIHtcblx0XHQvLyBwaWNrZWQgb25lXG5cdFx0cmV0dXJuICg8SUluZGV4ZWRQaWNrPnBpY2spLmluZGV4O1xuXHR9XG5cbn1cblxucmVnaXN0ZXJFZGl0b3JBY3Rpb24oY2xhc3MgRm9ybWF0RG9jdW1lbnRNdWx0aXBsZUFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmZvcm1hdERvY3VtZW50Lm11bHRpcGxlJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2Zvcm1hdERvY3VtZW50LmxhYmVsLm11bHRpcGxlJywgXCJGb3JtYXQgRG9jdW1lbnQgV2l0aC4uLlwiKSxcblx0XHRcdGFsaWFzOiAnRm9ybWF0IERvY3VtZW50Li4uJyxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLCBFZGl0b3JDb250ZXh0S2V5cy5oYXNNdWx0aXBsZURvY3VtZW50Rm9ybWF0dGluZ1Byb3ZpZGVyKSxcblx0XHRcdGNvbnRleHRNZW51T3B0czoge1xuXHRcdFx0XHRncm91cDogJzFfbW9kaWZpY2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEuM1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBnZXRSZWFsQW5kU3ludGhldGljRG9jdW1lbnRGb3JtYXR0ZXJzT3JkZXJlZChsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLCBtb2RlbCk7XG5cdFx0Y29uc3QgcGljayA9IGF3YWl0IGluc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbihzaG93Rm9ybWF0dGVyUGljaywgbW9kZWwsIHByb3ZpZGVyKTtcblx0XHRpZiAodHlwZW9mIHBpY2sgPT09ICdudW1iZXInKSB7XG5cdFx0XHRhd2FpdCBpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZm9ybWF0RG9jdW1lbnRXaXRoUHJvdmlkZXIsIHByb3ZpZGVyW3BpY2tdLCBlZGl0b3IsIEZvcm1hdHRpbmdNb2RlLkV4cGxpY2l0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckVkaXRvckFjdGlvbihjbGFzcyBGb3JtYXRTZWxlY3Rpb25NdWx0aXBsZUFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmZvcm1hdFNlbGVjdGlvbi5tdWx0aXBsZScsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdmb3JtYXRTZWxlY3Rpb24ubGFiZWwubXVsdGlwbGUnLCBcIkZvcm1hdCBTZWxlY3Rpb24gV2l0aC4uLlwiKSxcblx0XHRcdGFsaWFzOiAnRm9ybWF0IENvZGUuLi4nLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlKSwgRWRpdG9yQ29udGV4dEtleXMuaGFzTXVsdGlwbGVEb2N1bWVudFNlbGVjdGlvbkZvcm1hdHRpbmdQcm92aWRlciksXG5cdFx0XHRjb250ZXh0TWVudU9wdHM6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLmhhc05vbkVtcHR5U2VsZWN0aW9uKSxcblx0XHRcdFx0Z3JvdXA6ICcxX21vZGlmaWNhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLjMxXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGluc3RhU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGxldCByYW5nZTogUmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKHJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0cmFuZ2UgPSBuZXcgUmFuZ2UocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAxLCByYW5nZS5zdGFydExpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlci5vcmRlcmVkKG1vZGVsKTtcblx0XHRjb25zdCBwaWNrID0gYXdhaXQgaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHNob3dGb3JtYXR0ZXJQaWNrLCBtb2RlbCwgcHJvdmlkZXIpO1xuXHRcdGlmICh0eXBlb2YgcGljayA9PT0gJ251bWJlcicpIHtcblx0XHRcdGF3YWl0IGluc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbihmb3JtYXREb2N1bWVudFJhbmdlc1dpdGhQcm92aWRlciwgcHJvdmlkZXJbcGlja10sIGVkaXRvciwgcmFuZ2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHRydWUpO1xuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMscUJBQWtDO0FBQzNDLFNBQVMsY0FBYyw0QkFBNEI7QUFDbkQsU0FBUyx5QkFBeUI7QUFFbEMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBDO0FBQ25ELFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLDZCQUErQztBQUN4RCxTQUFTLGtDQUFrQyw0QkFBNEIsOENBQThDLHFCQUFxQixnQkFBZ0Isc0JBQXNCO0FBQ2hMLFNBQVMsYUFBYTtBQUN0QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFpQyxjQUFjLCtCQUErQjtBQUM5RSxTQUFTLGNBQWMsMkJBQW9GO0FBQzNHLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW1CLG1CQUFtQjtBQUMvQyxTQUFTLFlBQVksaUJBQWlCLG9CQUFvQjtBQUMxRCxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLHNCQUFzQixzQkFBc0IsZ0JBQWdCO0FBQ3JFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNENBQTRDO0FBQ3JELFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9CO0FBSXRCLElBQU0sbUJBQU4sY0FBK0IsV0FBNkM7QUFBQSxFQVVsRixZQUNxQyxt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QjtBQUN2RCxVQUFNLDBCQUEwQixTQUFTLElBQUksd0JBQXdCO0FBRXJFLFVBQU0sUUFBUSxPQUFPLFNBQVM7QUFDOUIsUUFBSSxRQUFlLE9BQU8sYUFBYTtBQUN2QyxRQUFJLE1BQU0sUUFBUSxHQUFHO0FBQ3BCLGNBQVEsSUFBSSxNQUFNLE1BQU0saUJBQWlCLEdBQUcsTUFBTSxpQkFBaUIsTUFBTSxpQkFBaUIsTUFBTSxlQUFlLENBQUM7QUFBQSxJQUNqSDtBQUVBLFVBQU0sV0FBVyx3QkFBd0Isb0NBQW9DLFFBQVEsS0FBSztBQUMxRixVQUFNLE9BQU8sTUFBTSxhQUFhLGVBQWUsbUJBQW1CLE9BQU8sUUFBUTtBQUNqRixRQUFJLE9BQU8sU0FBUyxVQUFVO0FBQzdCLFlBQU0sYUFBYSxlQUFlLGtDQUFrQyxTQUFTLElBQUksR0FBRyxRQUFRLE9BQU8sa0JBQWtCLE1BQU0sSUFBSTtBQUFBLElBQ2hJO0FBQUEsRUFDRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbImZvcm1hdHRlciIsICJsYW5nTmFtZSIsICJwaWNrIl0KfQo=
