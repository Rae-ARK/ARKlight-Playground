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
import * as aria from "../../../base/browser/ui/aria/aria.js";
import { Disposable, toDisposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { ICodeEditorService } from "../../browser/services/codeEditorService.js";
import { CodeEditorWidget } from "../../browser/widget/codeEditor/codeEditorWidget.js";
import { InternalEditorAction } from "../../common/editorAction.js";
import { StandaloneKeybindingService, updateConfigurationService } from "./standaloneServices.js";
import { IStandaloneThemeService } from "../common/standaloneTheme.js";
import { MenuId, MenuRegistry } from "../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { INotificationService } from "../../../platform/notification/common/notification.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { IAccessibilityService } from "../../../platform/accessibility/common/accessibility.js";
import { StandaloneCodeEditorNLS } from "../../common/standaloneStrings.js";
import { IClipboardService } from "../../../platform/clipboard/common/clipboardService.js";
import { IEditorProgressService } from "../../../platform/progress/common/progress.js";
import { IModelService } from "../../common/services/model.js";
import { ILanguageService } from "../../common/languages/language.js";
import { StandaloneCodeEditorService } from "./standaloneCodeEditorService.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../common/languages/modesRegistry.js";
import { ILanguageConfigurationService } from "../../common/languages/languageConfigurationRegistry.js";
import { ILanguageFeaturesService } from "../../common/services/languageFeatures.js";
import { DiffEditorWidget } from "../../browser/widget/diffEditor/diffEditorWidget.js";
import { IAccessibilitySignalService } from "../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { mainWindow } from "../../../base/browser/window.js";
import { setHoverDelegateFactory } from "../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../../platform/hover/browser/hover.js";
import { setBaseLayerHoverDelegate } from "../../../base/browser/ui/hover/hoverDelegate2.js";
import { IMarkdownRendererService } from "../../../platform/markdown/browser/markdownRenderer.js";
import { EditorMarkdownCodeBlockRenderer } from "../../browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js";
import { IUserInteractionService } from "../../../platform/userInteraction/browser/userInteractionService.js";
let LAST_GENERATED_COMMAND_ID = 0;
let ariaDomNodeCreated = false;
function createAriaDomNode(parent) {
  if (!parent) {
    if (ariaDomNodeCreated) {
      return;
    }
    ariaDomNodeCreated = true;
  }
  aria.setARIAContainer(parent || mainWindow.document.body);
}
let StandaloneCodeEditor = class extends CodeEditorWidget {
  constructor(domElement, _options, instantiationService, codeEditorService, commandService, contextKeyService, hoverService, keybindingService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService, markdownRendererService, userInteractionService) {
    const options = { ..._options };
    options.ariaLabel = options.ariaLabel || StandaloneCodeEditorNLS.editorViewAccessibleLabel;
    super(domElement, options, {}, instantiationService, codeEditorService, commandService, contextKeyService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService, userInteractionService);
    if (keybindingService instanceof StandaloneKeybindingService) {
      this._standaloneKeybindingService = keybindingService;
    } else {
      this._standaloneKeybindingService = null;
    }
    createAriaDomNode(options.ariaContainerElement);
    setHoverDelegateFactory((placement, enableInstantHover) => instantiationService.createInstance(WorkbenchHoverDelegate, placement, { instantHover: enableInstantHover }, {}));
    setBaseLayerHoverDelegate(hoverService);
    markdownRendererService.setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));
  }
  addCommand(keybinding, handler, context) {
    if (!this._standaloneKeybindingService) {
      console.warn("Cannot add command because the editor is configured with an unrecognized KeybindingService");
      return null;
    }
    const commandId = "DYNAMIC_" + ++LAST_GENERATED_COMMAND_ID;
    const whenExpression = ContextKeyExpr.deserialize(context);
    this._standaloneKeybindingService.addDynamicKeybinding(commandId, keybinding, handler, whenExpression);
    return commandId;
  }
  createContextKey(key, defaultValue) {
    return this._contextKeyService.createKey(key, defaultValue);
  }
  addAction(_descriptor) {
    if (typeof _descriptor.id !== "string" || typeof _descriptor.label !== "string" || typeof _descriptor.run !== "function") {
      throw new Error("Invalid action descriptor, `id`, `label` and `run` are required properties!");
    }
    if (!this._standaloneKeybindingService) {
      console.warn("Cannot add keybinding because the editor is configured with an unrecognized KeybindingService");
      return Disposable.None;
    }
    const id = _descriptor.id;
    const label = _descriptor.label;
    const precondition = ContextKeyExpr.and(
      ContextKeyExpr.equals("editorId", this.getId()),
      ContextKeyExpr.deserialize(_descriptor.precondition)
    );
    const keybindings = _descriptor.keybindings;
    const keybindingsWhen = ContextKeyExpr.and(
      precondition,
      ContextKeyExpr.deserialize(_descriptor.keybindingContext)
    );
    const contextMenuGroupId = _descriptor.contextMenuGroupId || null;
    const contextMenuOrder = _descriptor.contextMenuOrder || 0;
    const run = (_accessor, ...args) => {
      return Promise.resolve(_descriptor.run(this, ...args));
    };
    const toDispose = new DisposableStore();
    const uniqueId = this.getId() + ":" + id;
    toDispose.add(CommandsRegistry.registerCommand(uniqueId, run));
    if (contextMenuGroupId) {
      const menuItem = {
        command: {
          id: uniqueId,
          title: label
        },
        when: precondition,
        group: contextMenuGroupId,
        order: contextMenuOrder
      };
      toDispose.add(MenuRegistry.appendMenuItem(MenuId.EditorContext, menuItem));
    }
    if (Array.isArray(keybindings)) {
      for (const kb of keybindings) {
        toDispose.add(this._standaloneKeybindingService.addDynamicKeybinding(uniqueId, kb, run, keybindingsWhen));
      }
    }
    const internalAction = new InternalEditorAction(
      uniqueId,
      label,
      label,
      void 0,
      precondition,
      (...args) => Promise.resolve(_descriptor.run(this, ...args)),
      this._contextKeyService
    );
    this._actions.set(id, internalAction);
    toDispose.add(toDisposable(() => {
      this._actions.delete(id);
    }));
    return toDispose;
  }
  _triggerCommand(handlerId, payload) {
    if (this._codeEditorService instanceof StandaloneCodeEditorService) {
      try {
        this._codeEditorService.setActiveCodeEditor(this);
        super._triggerCommand(handlerId, payload);
      } finally {
        this._codeEditorService.setActiveCodeEditor(null);
      }
    } else {
      super._triggerCommand(handlerId, payload);
    }
  }
};
StandaloneCodeEditor = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, IAccessibilityService),
  __decorateParam(11, ILanguageConfigurationService),
  __decorateParam(12, ILanguageFeaturesService),
  __decorateParam(13, IMarkdownRendererService),
  __decorateParam(14, IUserInteractionService)
], StandaloneCodeEditor);
let StandaloneEditor = class extends StandaloneCodeEditor {
  constructor(domElement, _options, instantiationService, codeEditorService, commandService, contextKeyService, hoverService, keybindingService, themeService, notificationService, configurationService, accessibilityService, modelService, languageService, languageConfigurationService, languageFeaturesService, markdownRendererService, userInteractionService) {
    const options = { ..._options };
    updateConfigurationService(configurationService, options, false);
    const themeDomRegistration = themeService.registerEditorContainer(domElement);
    if (typeof options.theme === "string") {
      themeService.setTheme(options.theme);
    }
    if (typeof options.autoDetectHighContrast !== "undefined") {
      themeService.setAutoDetectHighContrast(Boolean(options.autoDetectHighContrast));
    }
    const _model = options.model;
    delete options.model;
    super(domElement, options, instantiationService, codeEditorService, commandService, contextKeyService, hoverService, keybindingService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService, markdownRendererService, userInteractionService);
    this._configurationService = configurationService;
    this._standaloneThemeService = themeService;
    this._register(themeDomRegistration);
    let model;
    if (typeof _model === "undefined") {
      const languageId = languageService.getLanguageIdByMimeType(options.language) || options.language || PLAINTEXT_LANGUAGE_ID;
      model = createTextModel(modelService, languageService, options.value || "", languageId, void 0);
      this._ownsModel = true;
    } else {
      model = _model;
      this._ownsModel = false;
    }
    this._attachModel(model);
    if (model) {
      const e = {
        oldModelUrl: null,
        newModelUrl: model.uri
      };
      this._onDidChangeModel.fire(e);
    }
  }
  updateOptions(newOptions) {
    updateConfigurationService(this._configurationService, newOptions, false);
    if (typeof newOptions.theme === "string") {
      this._standaloneThemeService.setTheme(newOptions.theme);
    }
    if (typeof newOptions.autoDetectHighContrast !== "undefined") {
      this._standaloneThemeService.setAutoDetectHighContrast(Boolean(newOptions.autoDetectHighContrast));
    }
    super.updateOptions(newOptions);
  }
  _postDetachModelCleanup(detachedModel) {
    super._postDetachModelCleanup(detachedModel);
    if (detachedModel && this._ownsModel) {
      detachedModel.dispose();
      this._ownsModel = false;
    }
  }
};
StandaloneEditor = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, IStandaloneThemeService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IAccessibilityService),
  __decorateParam(12, IModelService),
  __decorateParam(13, ILanguageService),
  __decorateParam(14, ILanguageConfigurationService),
  __decorateParam(15, ILanguageFeaturesService),
  __decorateParam(16, IMarkdownRendererService),
  __decorateParam(17, IUserInteractionService)
], StandaloneEditor);
let StandaloneDiffEditor2 = class extends DiffEditorWidget {
  constructor(domElement, _options, instantiationService, contextKeyService, codeEditorService, themeService, notificationService, configurationService, contextMenuService, editorProgressService, clipboardService, accessibilitySignalService) {
    const options = { ..._options };
    updateConfigurationService(configurationService, options, true);
    const themeDomRegistration = themeService.registerEditorContainer(domElement);
    if (typeof options.theme === "string") {
      themeService.setTheme(options.theme);
    }
    if (typeof options.autoDetectHighContrast !== "undefined") {
      themeService.setAutoDetectHighContrast(Boolean(options.autoDetectHighContrast));
    }
    super(
      domElement,
      options,
      {},
      contextKeyService,
      instantiationService,
      codeEditorService,
      accessibilitySignalService,
      editorProgressService
    );
    this._configurationService = configurationService;
    this._standaloneThemeService = themeService;
    this._register(themeDomRegistration);
  }
  updateOptions(newOptions) {
    updateConfigurationService(this._configurationService, newOptions, true);
    if (typeof newOptions.theme === "string") {
      this._standaloneThemeService.setTheme(newOptions.theme);
    }
    if (typeof newOptions.autoDetectHighContrast !== "undefined") {
      this._standaloneThemeService.setAutoDetectHighContrast(Boolean(newOptions.autoDetectHighContrast));
    }
    super.updateOptions(newOptions);
  }
  _createInnerEditor(instantiationService, container, options) {
    return instantiationService.createInstance(StandaloneCodeEditor, container, options);
  }
  getOriginalEditor() {
    return super.getOriginalEditor();
  }
  getModifiedEditor() {
    return super.getModifiedEditor();
  }
  addCommand(keybinding, handler, context) {
    return this.getModifiedEditor().addCommand(keybinding, handler, context);
  }
  createContextKey(key, defaultValue) {
    return this.getModifiedEditor().createContextKey(key, defaultValue);
  }
  addAction(descriptor) {
    return this.getModifiedEditor().addAction(descriptor);
  }
};
StandaloneDiffEditor2 = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, ICodeEditorService),
  __decorateParam(5, IStandaloneThemeService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IEditorProgressService),
  __decorateParam(10, IClipboardService),
  __decorateParam(11, IAccessibilitySignalService)
], StandaloneDiffEditor2);
function createTextModel(modelService, languageService, value, languageId, uri) {
  value = value || "";
  if (!languageId) {
    const firstLF = value.indexOf("\n");
    let firstLine = value;
    if (firstLF !== -1) {
      firstLine = value.substring(0, firstLF);
    }
    return doCreateModel(modelService, value, languageService.createByFilepathOrFirstLine(uri || null, firstLine), uri);
  }
  return doCreateModel(modelService, value, languageService.createById(languageId), uri);
}
function doCreateModel(modelService, value, languageSelection, uri) {
  return modelService.createModel(value, languageSelection, uri);
}
export {
  StandaloneCodeEditor,
  StandaloneDiffEditor2,
  StandaloneEditor,
  createTextModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9zdGFuZGFsb25lL2Jyb3dzZXIvc3RhbmRhbG9uZUNvZGVFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhcmlhIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJRGlmZkVkaXRvciwgSURpZmZFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJRGlmZkVkaXRvck9wdGlvbnMsIElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEludGVybmFsRWRpdG9yQWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvckFjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgU3RhbmRhbG9uZUtleWJpbmRpbmdTZXJ2aWNlLCB1cGRhdGVDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4vc3RhbmRhbG9uZVNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3N0YW5kYWxvbmVUaGVtZS5qcyc7XG5pbXBvcnQgeyBJTWVudUl0ZW0sIE1lbnVJZCwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZEhhbmRsZXIsIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBDb250ZXh0S2V5VmFsdWUsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgU3RhbmRhbG9uZUNvZGVFZGl0b3JOTFMgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhbmRhbG9uZVN0cmluZ3MuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFsb25lVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi9zdGFuZGFsb25lVGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VsZWN0aW9uLCBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgU3RhbmRhbG9uZUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi9zdGFuZGFsb25lQ29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9tb2Rlc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvZGlmZkVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgc2V0SG92ZXJEZWxlZ2F0ZUZhY3RvcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSwgV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgc2V0QmFzZUxheWVySG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlMi5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yTWFya2Rvd25Db2RlQmxvY2tSZW5kZXJlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L21hcmtkb3duUmVuZGVyZXIvYnJvd3Nlci9lZGl0b3JNYXJrZG93bkNvZGVCbG9ja1JlbmRlcmVyLmpzJztcbmltcG9ydCB7IElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXNlckludGVyYWN0aW9uL2Jyb3dzZXIvdXNlckludGVyYWN0aW9uU2VydmljZS5qcyc7XG5cbi8qKlxuICogRGVzY3JpcHRpb24gb2YgYW4gYWN0aW9uIGNvbnRyaWJ1dGlvblxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBY3Rpb25EZXNjcmlwdG9yIHtcblx0LyoqXG5cdCAqIEFuIHVuaXF1ZSBpZGVudGlmaWVyIG9mIHRoZSBjb250cmlidXRlZCBhY3Rpb24uXG5cdCAqL1xuXHRpZDogc3RyaW5nO1xuXHQvKipcblx0ICogQSBsYWJlbCBvZiB0aGUgYWN0aW9uIHRoYXQgd2lsbCBiZSBwcmVzZW50ZWQgdG8gdGhlIHVzZXIuXG5cdCAqL1xuXHRsYWJlbDogc3RyaW5nO1xuXHQvKipcblx0ICogUHJlY29uZGl0aW9uIHJ1bGUuIFRoZSB2YWx1ZSBzaG91bGQgYmUgYSBbY29udGV4dCBrZXkgZXhwcmVzc2lvbl0oaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9nZXRzdGFydGVkL2tleWJpbmRpbmdzI193aGVuLWNsYXVzZS1jb250ZXh0cykuXG5cdCAqL1xuXHRwcmVjb25kaXRpb24/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBBbiBhcnJheSBvZiBrZXliaW5kaW5ncyBmb3IgdGhlIGFjdGlvbi5cblx0ICovXG5cdGtleWJpbmRpbmdzPzogbnVtYmVyW107XG5cdC8qKlxuXHQgKiBUaGUga2V5YmluZGluZyBydWxlIChjb25kaXRpb24gb24gdG9wIG9mIHByZWNvbmRpdGlvbikuXG5cdCAqL1xuXHRrZXliaW5kaW5nQ29udGV4dD86IHN0cmluZztcblx0LyoqXG5cdCAqIENvbnRyb2wgaWYgdGhlIGFjdGlvbiBzaG91bGQgc2hvdyB1cCBpbiB0aGUgY29udGV4dCBtZW51IGFuZCB3aGVyZS5cblx0ICogVGhlIGNvbnRleHQgbWVudSBvZiB0aGUgZWRpdG9yIGhhcyB0aGVzZSBkZWZhdWx0OlxuXHQgKiAgIG5hdmlnYXRpb24gLSBUaGUgbmF2aWdhdGlvbiBncm91cCBjb21lcyBmaXJzdCBpbiBhbGwgY2FzZXMuXG5cdCAqICAgMV9tb2RpZmljYXRpb24gLSBUaGlzIGdyb3VwIGNvbWVzIG5leHQgYW5kIGNvbnRhaW5zIGNvbW1hbmRzIHRoYXQgbW9kaWZ5IHlvdXIgY29kZS5cblx0ICogICA5X2N1dGNvcHlwYXN0ZSAtIFRoZSBsYXN0IGRlZmF1bHQgZ3JvdXAgd2l0aCB0aGUgYmFzaWMgZWRpdGluZyBjb21tYW5kcy5cblx0ICogWW91IGNhbiBhbHNvIGNyZWF0ZSB5b3VyIG93biBncm91cC5cblx0ICogRGVmYXVsdHMgdG8gbnVsbCAoZG9uJ3Qgc2hvdyBpbiBjb250ZXh0IG1lbnUpLlxuXHQgKi9cblx0Y29udGV4dE1lbnVHcm91cElkPzogc3RyaW5nO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgb3JkZXIgaW4gdGhlIGNvbnRleHQgbWVudSBncm91cC5cblx0ICovXG5cdGNvbnRleHRNZW51T3JkZXI/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBNZXRob2QgdGhhdCB3aWxsIGJlIGV4ZWN1dGVkIHdoZW4gdGhlIGFjdGlvbiBpcyB0cmlnZ2VyZWQuXG5cdCAqIEBwYXJhbSBlZGl0b3IgVGhlIGVkaXRvciBpbnN0YW5jZSBpcyBwYXNzZWQgaW4gYXMgYSBjb252ZW5pZW5jZVxuXHQgKi9cblx0cnVuKGVkaXRvcjogSUNvZGVFZGl0b3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+O1xufVxuXG4vKipcbiAqIE9wdGlvbnMgd2hpY2ggYXBwbHkgZm9yIGFsbCBlZGl0b3JzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElHbG9iYWxFZGl0b3JPcHRpb25zIHtcblx0LyoqXG5cdCAqIFRoZSBudW1iZXIgb2Ygc3BhY2VzIGEgdGFiIGlzIGVxdWFsIHRvLlxuXHQgKiBUaGlzIHNldHRpbmcgaXMgb3ZlcnJpZGRlbiBiYXNlZCBvbiB0aGUgZmlsZSBjb250ZW50cyB3aGVuIGBkZXRlY3RJbmRlbnRhdGlvbmAgaXMgb24uXG5cdCAqIERlZmF1bHRzIHRvIDQuXG5cdCAqL1xuXHR0YWJTaXplPzogbnVtYmVyO1xuXHQvKipcblx0ICogSW5zZXJ0IHNwYWNlcyB3aGVuIHByZXNzaW5nIGBUYWJgLlxuXHQgKiBUaGlzIHNldHRpbmcgaXMgb3ZlcnJpZGRlbiBiYXNlZCBvbiB0aGUgZmlsZSBjb250ZW50cyB3aGVuIGBkZXRlY3RJbmRlbnRhdGlvbmAgaXMgb24uXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRpbnNlcnRTcGFjZXM/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciBgdGFiU2l6ZWAgYW5kIGBpbnNlcnRTcGFjZXNgIHdpbGwgYmUgYXV0b21hdGljYWxseSBkZXRlY3RlZCB3aGVuIGEgZmlsZSBpcyBvcGVuZWQgYmFzZWQgb24gdGhlIGZpbGUgY29udGVudHMuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRkZXRlY3RJbmRlbnRhdGlvbj86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBSZW1vdmUgdHJhaWxpbmcgYXV0byBpbnNlcnRlZCB3aGl0ZXNwYWNlLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0dHJpbUF1dG9XaGl0ZXNwYWNlPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNwZWNpYWwgaGFuZGxpbmcgZm9yIGxhcmdlIGZpbGVzIHRvIGRpc2FibGUgY2VydGFpbiBtZW1vcnkgaW50ZW5zaXZlIGZlYXR1cmVzLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0bGFyZ2VGaWxlT3B0aW1pemF0aW9ucz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIGNvbXBsZXRpb25zIHNob3VsZCBiZSBjb21wdXRlZCBiYXNlZCBvbiB3b3JkcyBpbiB0aGUgZG9jdW1lbnQuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHR3b3JkQmFzZWRTdWdnZXN0aW9ucz86ICdvZmYnIHwgJ2N1cnJlbnREb2N1bWVudCcgfCAnbWF0Y2hpbmdEb2N1bWVudHMnIHwgJ2FsbERvY3VtZW50cyc7XG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHdvcmQgYmFzZWQgY29tcGxldGlvbnMgc2hvdWxkIGJlIGluY2x1ZGVkIGZyb20gb3BlbmVkIGRvY3VtZW50cyBvZiB0aGUgc2FtZSBsYW5ndWFnZSBvciBhbnkgbGFuZ3VhZ2UuXG5cdCAqL1xuXHR3b3JkQmFzZWRTdWdnZXN0aW9uc09ubHlTYW1lTGFuZ3VhZ2U/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgc2VtYW50aWNIaWdobGlnaHRpbmcgaXMgc2hvd24gZm9yIHRoZSBsYW5ndWFnZXMgdGhhdCBzdXBwb3J0IGl0LlxuXHQgKiB0cnVlOiBzZW1hbnRpY0hpZ2hsaWdodGluZyBpcyBlbmFibGVkIGZvciBhbGwgdGhlbWVzXG5cdCAqIGZhbHNlOiBzZW1hbnRpY0hpZ2hsaWdodGluZyBpcyBkaXNhYmxlZCBmb3IgYWxsIHRoZW1lc1xuXHQgKiAnY29uZmlndXJlZEJ5VGhlbWUnOiBzZW1hbnRpY0hpZ2hsaWdodGluZyBpcyBjb250cm9sbGVkIGJ5IHRoZSBjdXJyZW50IGNvbG9yIHRoZW1lJ3Mgc2VtYW50aWNIaWdobGlnaHRpbmcgc2V0dGluZy5cblx0ICogRGVmYXVsdHMgdG8gJ2J5VGhlbWUnLlxuXHQgKi9cblx0J3NlbWFudGljSGlnaGxpZ2h0aW5nLmVuYWJsZWQnPzogdHJ1ZSB8IGZhbHNlIHwgJ2NvbmZpZ3VyZWRCeVRoZW1lJztcblx0LyoqXG5cdCAqIEtlZXAgcGVlayBlZGl0b3JzIG9wZW4gZXZlbiB3aGVuIGRvdWJsZS1jbGlja2luZyB0aGVpciBjb250ZW50IG9yIHdoZW4gaGl0dGluZyBgRXNjYXBlYC5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRzdGFibGVQZWVrPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIExpbmVzIGFib3ZlIHRoaXMgbGVuZ3RoIHdpbGwgbm90IGJlIHRva2VuaXplZCBmb3IgcGVyZm9ybWFuY2UgcmVhc29ucy5cblx0ICogRGVmYXVsdHMgdG8gMjAwMDAuXG5cdCAqL1xuXHRtYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoPzogbnVtYmVyO1xuXHQvKipcblx0ICogVGhlbWUgdG8gYmUgdXNlZCBmb3IgcmVuZGVyaW5nLlxuXHQgKiBUaGUgY3VycmVudCBvdXQtb2YtdGhlLWJveCBhdmFpbGFibGUgdGhlbWVzIGFyZTogJ3ZzJyAoZGVmYXVsdCksICd2cy1kYXJrJywgJ2hjLWJsYWNrJywgJ2hjLWxpZ2h0Jy5cblx0ICogWW91IGNhbiBjcmVhdGUgY3VzdG9tIHRoZW1lcyB2aWEgYG1vbmFjby5lZGl0b3IuZGVmaW5lVGhlbWVgLlxuXHQgKiBUbyBzd2l0Y2ggYSB0aGVtZSwgdXNlIGBtb25hY28uZWRpdG9yLnNldFRoZW1lYC5cblx0ICogKipOT1RFKio6IFRoZSB0aGVtZSBtaWdodCBiZSBvdmVyd3JpdHRlbiBpZiB0aGUgT1MgaXMgaW4gaGlnaCBjb250cmFzdCBtb2RlLCB1bmxlc3MgYGF1dG9EZXRlY3RIaWdoQ29udHJhc3RgIGlzIHNldCB0byBmYWxzZS5cblx0ICovXG5cdHRoZW1lPzogc3RyaW5nO1xuXHQvKipcblx0ICogSWYgZW5hYmxlZCwgd2lsbCBhdXRvbWF0aWNhbGx5IGNoYW5nZSB0byBoaWdoIGNvbnRyYXN0IHRoZW1lIGlmIHRoZSBPUyBpcyB1c2luZyBhIGhpZ2ggY29udHJhc3QgdGhlbWUuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRhdXRvRGV0ZWN0SGlnaENvbnRyYXN0PzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBUaGUgb3B0aW9ucyB0byBjcmVhdGUgYW4gZWRpdG9yLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTdGFuZGFsb25lRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucyBleHRlbmRzIElFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zLCBJR2xvYmFsRWRpdG9yT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBUaGUgaW5pdGlhbCBtb2RlbCBhc3NvY2lhdGVkIHdpdGggdGhpcyBjb2RlIGVkaXRvci5cblx0ICovXG5cdG1vZGVsPzogSVRleHRNb2RlbCB8IG51bGw7XG5cdC8qKlxuXHQgKiBUaGUgaW5pdGlhbCB2YWx1ZSBvZiB0aGUgYXV0byBjcmVhdGVkIG1vZGVsIGluIHRoZSBlZGl0b3IuXG5cdCAqIFRvIG5vdCBhdXRvbWF0aWNhbGx5IGNyZWF0ZSBhIG1vZGVsLCB1c2UgYG1vZGVsOiBudWxsYC5cblx0ICovXG5cdHZhbHVlPzogc3RyaW5nO1xuXHQvKipcblx0ICogVGhlIGluaXRpYWwgbGFuZ3VhZ2Ugb2YgdGhlIGF1dG8gY3JlYXRlZCBtb2RlbCBpbiB0aGUgZWRpdG9yLlxuXHQgKiBUbyBub3QgYXV0b21hdGljYWxseSBjcmVhdGUgYSBtb2RlbCwgdXNlIGBtb2RlbDogbnVsbGAuXG5cdCAqL1xuXHRsYW5ndWFnZT86IHN0cmluZztcblx0LyoqXG5cdCAqIEluaXRpYWwgdGhlbWUgdG8gYmUgdXNlZCBmb3IgcmVuZGVyaW5nLlxuXHQgKiBUaGUgY3VycmVudCBvdXQtb2YtdGhlLWJveCBhdmFpbGFibGUgdGhlbWVzIGFyZTogJ3ZzJyAoZGVmYXVsdCksICd2cy1kYXJrJywgJ2hjLWJsYWNrJywgJ2hjLWxpZ2h0LlxuXHQgKiBZb3UgY2FuIGNyZWF0ZSBjdXN0b20gdGhlbWVzIHZpYSBgbW9uYWNvLmVkaXRvci5kZWZpbmVUaGVtZWAuXG5cdCAqIFRvIHN3aXRjaCBhIHRoZW1lLCB1c2UgYG1vbmFjby5lZGl0b3Iuc2V0VGhlbWVgLlxuXHQgKiAqKk5PVEUqKjogVGhlIHRoZW1lIG1pZ2h0IGJlIG92ZXJ3cml0dGVuIGlmIHRoZSBPUyBpcyBpbiBoaWdoIGNvbnRyYXN0IG1vZGUsIHVubGVzcyBgYXV0b0RldGVjdEhpZ2hDb250cmFzdGAgaXMgc2V0IHRvIGZhbHNlLlxuXHQgKi9cblx0dGhlbWU/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBJZiBlbmFibGVkLCB3aWxsIGF1dG9tYXRpY2FsbHkgY2hhbmdlIHRvIGhpZ2ggY29udHJhc3QgdGhlbWUgaWYgdGhlIE9TIGlzIHVzaW5nIGEgaGlnaCBjb250cmFzdCB0aGVtZS5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdGF1dG9EZXRlY3RIaWdoQ29udHJhc3Q/OiBib29sZWFuO1xuXHQvKipcblx0ICogQW4gVVJMIHRvIG9wZW4gd2hlbiBDdHJsK0ggKFdpbmRvd3MgYW5kIExpbnV4KSBvciBDbWQrSCAoT1NYKSBpcyBwcmVzc2VkIGluXG5cdCAqIHRoZSBhY2Nlc3NpYmlsaXR5IGhlbHAgZGlhbG9nIGluIHRoZSBlZGl0b3IuXG5cdCAqXG5cdCAqIERlZmF1bHRzIHRvIFwiaHR0cHM6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/bGlua2lkPTg1MjQ1MFwiXG5cdCAqL1xuXHRhY2Nlc3NpYmlsaXR5SGVscFVybD86IHN0cmluZztcblx0LyoqXG5cdCAqIENvbnRhaW5lciBlbGVtZW50IHRvIHVzZSBmb3IgQVJJQSBtZXNzYWdlcy5cblx0ICogRGVmYXVsdHMgdG8gZG9jdW1lbnQuYm9keS5cblx0ICovXG5cdGFyaWFDb250YWluZXJFbGVtZW50PzogSFRNTEVsZW1lbnQ7XG59XG5cbi8qKlxuICogVGhlIG9wdGlvbnMgdG8gY3JlYXRlIGEgZGlmZiBlZGl0b3IuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVN0YW5kYWxvbmVEaWZmRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucyBleHRlbmRzIElEaWZmRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBJbml0aWFsIHRoZW1lIHRvIGJlIHVzZWQgZm9yIHJlbmRlcmluZy5cblx0ICogVGhlIGN1cnJlbnQgb3V0LW9mLXRoZS1ib3ggYXZhaWxhYmxlIHRoZW1lcyBhcmU6ICd2cycgKGRlZmF1bHQpLCAndnMtZGFyaycsICdoYy1ibGFjaycsICdoYy1saWdodC5cblx0ICogWW91IGNhbiBjcmVhdGUgY3VzdG9tIHRoZW1lcyB2aWEgYG1vbmFjby5lZGl0b3IuZGVmaW5lVGhlbWVgLlxuXHQgKiBUbyBzd2l0Y2ggYSB0aGVtZSwgdXNlIGBtb25hY28uZWRpdG9yLnNldFRoZW1lYC5cblx0ICogKipOT1RFKio6IFRoZSB0aGVtZSBtaWdodCBiZSBvdmVyd3JpdHRlbiBpZiB0aGUgT1MgaXMgaW4gaGlnaCBjb250cmFzdCBtb2RlLCB1bmxlc3MgYGF1dG9EZXRlY3RIaWdoQ29udHJhc3RgIGlzIHNldCB0byBmYWxzZS5cblx0ICovXG5cdHRoZW1lPzogc3RyaW5nO1xuXHQvKipcblx0ICogSWYgZW5hYmxlZCwgd2lsbCBhdXRvbWF0aWNhbGx5IGNoYW5nZSB0byBoaWdoIGNvbnRyYXN0IHRoZW1lIGlmIHRoZSBPUyBpcyB1c2luZyBhIGhpZ2ggY29udHJhc3QgdGhlbWUuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRhdXRvRGV0ZWN0SGlnaENvbnRyYXN0PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3RhbmRhbG9uZUNvZGVFZGl0b3IgZXh0ZW5kcyBJQ29kZUVkaXRvciB7XG5cdHVwZGF0ZU9wdGlvbnMobmV3T3B0aW9uczogSUVkaXRvck9wdGlvbnMgJiBJR2xvYmFsRWRpdG9yT3B0aW9ucyk6IHZvaWQ7XG5cdGFkZENvbW1hbmQoa2V5YmluZGluZzogbnVtYmVyLCBoYW5kbGVyOiBJQ29tbWFuZEhhbmRsZXIsIGNvbnRleHQ/OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsO1xuXHRjcmVhdGVDb250ZXh0S2V5PFQgZXh0ZW5kcyBDb250ZXh0S2V5VmFsdWUgPSBDb250ZXh0S2V5VmFsdWU+KGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IFQpOiBJQ29udGV4dEtleTxUPjtcblx0YWRkQWN0aW9uKGRlc2NyaXB0b3I6IElBY3Rpb25EZXNjcmlwdG9yKTogSURpc3Bvc2FibGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0YW5kYWxvbmVEaWZmRWRpdG9yIGV4dGVuZHMgSURpZmZFZGl0b3Ige1xuXHRhZGRDb21tYW5kKGtleWJpbmRpbmc6IG51bWJlciwgaGFuZGxlcjogSUNvbW1hbmRIYW5kbGVyLCBjb250ZXh0Pzogc3RyaW5nKTogc3RyaW5nIHwgbnVsbDtcblx0Y3JlYXRlQ29udGV4dEtleTxUIGV4dGVuZHMgQ29udGV4dEtleVZhbHVlID0gQ29udGV4dEtleVZhbHVlPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlOiBUKTogSUNvbnRleHRLZXk8VD47XG5cdGFkZEFjdGlvbihkZXNjcmlwdG9yOiBJQWN0aW9uRGVzY3JpcHRvcik6IElEaXNwb3NhYmxlO1xuXG5cdGdldE9yaWdpbmFsRWRpdG9yKCk6IElTdGFuZGFsb25lQ29kZUVkaXRvcjtcblx0Z2V0TW9kaWZpZWRFZGl0b3IoKTogSVN0YW5kYWxvbmVDb2RlRWRpdG9yO1xufVxuXG5sZXQgTEFTVF9HRU5FUkFURURfQ09NTUFORF9JRCA9IDA7XG5cbmxldCBhcmlhRG9tTm9kZUNyZWF0ZWQgPSBmYWxzZTtcbi8qKlxuICogQ3JlYXRlIEFSSUEgZG9tIG5vZGUgaW5zaWRlIHBhcmVudCxcbiAqIG9yIG9ubHkgZm9yIHRoZSBmaXJzdCBlZGl0b3IgaW5zdGFudGlhdGlvbiBpbnNpZGUgZG9jdW1lbnQuYm9keS5cbiAqIEBwYXJhbSBwYXJlbnQgY29udGFpbmVyIGVsZW1lbnQgZm9yIEFSSUEgZG9tIG5vZGVcbiAqL1xuZnVuY3Rpb24gY3JlYXRlQXJpYURvbU5vZGUocGFyZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCkge1xuXHRpZiAoIXBhcmVudCkge1xuXHRcdGlmIChhcmlhRG9tTm9kZUNyZWF0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXJpYURvbU5vZGVDcmVhdGVkID0gdHJ1ZTtcblx0fVxuXHRhcmlhLnNldEFSSUFDb250YWluZXIocGFyZW50IHx8IG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keSk7XG59XG5cbi8qKlxuICogQSBjb2RlIGVkaXRvciB0byBiZSB1c2VkIGJvdGggYnkgdGhlIHN0YW5kYWxvbmUgZWRpdG9yIGFuZCB0aGUgc3RhbmRhbG9uZSBkaWZmIGVkaXRvci5cbiAqL1xuZXhwb3J0IGNsYXNzIFN0YW5kYWxvbmVDb2RlRWRpdG9yIGV4dGVuZHMgQ29kZUVkaXRvcldpZGdldCBpbXBsZW1lbnRzIElTdGFuZGFsb25lQ29kZUVkaXRvciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhbmRhbG9uZUtleWJpbmRpbmdTZXJ2aWNlOiBTdGFuZGFsb25lS2V5YmluZGluZ1NlcnZpY2UgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGRvbUVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdF9vcHRpb25zOiBSZWFkb25seTxJU3RhbmRhbG9uZUVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnM+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJVXNlckludGVyYWN0aW9uU2VydmljZSB1c2VySW50ZXJhY3Rpb25TZXJ2aWNlOiBJVXNlckludGVyYWN0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHsgLi4uX29wdGlvbnMgfTtcblx0XHRvcHRpb25zLmFyaWFMYWJlbCA9IG9wdGlvbnMuYXJpYUxhYmVsIHx8IFN0YW5kYWxvbmVDb2RlRWRpdG9yTkxTLmVkaXRvclZpZXdBY2Nlc3NpYmxlTGFiZWw7XG5cdFx0c3VwZXIoZG9tRWxlbWVudCwgb3B0aW9ucywge30sIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb2RlRWRpdG9yU2VydmljZSwgY29tbWFuZFNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIGFjY2Vzc2liaWxpdHlTZXJ2aWNlLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgdXNlckludGVyYWN0aW9uU2VydmljZSk7XG5cblx0XHRpZiAoa2V5YmluZGluZ1NlcnZpY2UgaW5zdGFuY2VvZiBTdGFuZGFsb25lS2V5YmluZGluZ1NlcnZpY2UpIHtcblx0XHRcdHRoaXMuX3N0YW5kYWxvbmVLZXliaW5kaW5nU2VydmljZSA9IGtleWJpbmRpbmdTZXJ2aWNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zdGFuZGFsb25lS2V5YmluZGluZ1NlcnZpY2UgPSBudWxsO1xuXHRcdH1cblxuXHRcdGNyZWF0ZUFyaWFEb21Ob2RlKG9wdGlvbnMuYXJpYUNvbnRhaW5lckVsZW1lbnQpO1xuXG5cdFx0c2V0SG92ZXJEZWxlZ2F0ZUZhY3RvcnkoKHBsYWNlbWVudCwgZW5hYmxlSW5zdGFudEhvdmVyKSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hIb3ZlckRlbGVnYXRlLCBwbGFjZW1lbnQsIHsgaW5zdGFudEhvdmVyOiBlbmFibGVJbnN0YW50SG92ZXIgfSwge30pKTtcblx0XHRzZXRCYXNlTGF5ZXJIb3ZlckRlbGVnYXRlKGhvdmVyU2VydmljZSk7XG5cblx0XHRtYXJrZG93blJlbmRlcmVyU2VydmljZS5zZXREZWZhdWx0Q29kZUJsb2NrUmVuZGVyZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yTWFya2Rvd25Db2RlQmxvY2tSZW5kZXJlcikpO1xuXHR9XG5cblx0cHVibGljIGFkZENvbW1hbmQoa2V5YmluZGluZzogbnVtYmVyLCBoYW5kbGVyOiBJQ29tbWFuZEhhbmRsZXIsIGNvbnRleHQ/OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX3N0YW5kYWxvbmVLZXliaW5kaW5nU2VydmljZSkge1xuXHRcdFx0Y29uc29sZS53YXJuKCdDYW5ub3QgYWRkIGNvbW1hbmQgYmVjYXVzZSB0aGUgZWRpdG9yIGlzIGNvbmZpZ3VyZWQgd2l0aCBhbiB1bnJlY29nbml6ZWQgS2V5YmluZGluZ1NlcnZpY2UnKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBjb21tYW5kSWQgPSAnRFlOQU1JQ18nICsgKCsrTEFTVF9HRU5FUkFURURfQ09NTUFORF9JRCk7XG5cdFx0Y29uc3Qgd2hlbkV4cHJlc3Npb24gPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShjb250ZXh0KTtcblx0XHR0aGlzLl9zdGFuZGFsb25lS2V5YmluZGluZ1NlcnZpY2UuYWRkRHluYW1pY0tleWJpbmRpbmcoY29tbWFuZElkLCBrZXliaW5kaW5nLCBoYW5kbGVyLCB3aGVuRXhwcmVzc2lvbik7XG5cdFx0cmV0dXJuIGNvbW1hbmRJZDtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVDb250ZXh0S2V5PFQgZXh0ZW5kcyBDb250ZXh0S2V5VmFsdWUgPSBDb250ZXh0S2V5VmFsdWU+KGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IFQpOiBJQ29udGV4dEtleTxUPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShrZXksIGRlZmF1bHRWYWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgYWRkQWN0aW9uKF9kZXNjcmlwdG9yOiBJQWN0aW9uRGVzY3JpcHRvcik6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAoKHR5cGVvZiBfZGVzY3JpcHRvci5pZCAhPT0gJ3N0cmluZycpIHx8ICh0eXBlb2YgX2Rlc2NyaXB0b3IubGFiZWwgIT09ICdzdHJpbmcnKSB8fCAodHlwZW9mIF9kZXNjcmlwdG9yLnJ1biAhPT0gJ2Z1bmN0aW9uJykpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhY3Rpb24gZGVzY3JpcHRvciwgYGlkYCwgYGxhYmVsYCBhbmQgYHJ1bmAgYXJlIHJlcXVpcmVkIHByb3BlcnRpZXMhJyk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fc3RhbmRhbG9uZUtleWJpbmRpbmdTZXJ2aWNlKSB7XG5cdFx0XHRjb25zb2xlLndhcm4oJ0Nhbm5vdCBhZGQga2V5YmluZGluZyBiZWNhdXNlIHRoZSBlZGl0b3IgaXMgY29uZmlndXJlZCB3aXRoIGFuIHVucmVjb2duaXplZCBLZXliaW5kaW5nU2VydmljZScpO1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cblx0XHQvLyBSZWFkIGRlc2NyaXB0b3Igb3B0aW9uc1xuXHRcdGNvbnN0IGlkID0gX2Rlc2NyaXB0b3IuaWQ7XG5cdFx0Y29uc3QgbGFiZWwgPSBfZGVzY3JpcHRvci5sYWJlbDtcblx0XHRjb25zdCBwcmVjb25kaXRpb24gPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2VkaXRvcklkJywgdGhpcy5nZXRJZCgpKSxcblx0XHRcdENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKF9kZXNjcmlwdG9yLnByZWNvbmRpdGlvbilcblx0XHQpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdzID0gX2Rlc2NyaXB0b3Iua2V5YmluZGluZ3M7XG5cdFx0Y29uc3Qga2V5YmluZGluZ3NXaGVuID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0cHJlY29uZGl0aW9uLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoX2Rlc2NyaXB0b3Iua2V5YmluZGluZ0NvbnRleHQpXG5cdFx0KTtcblx0XHRjb25zdCBjb250ZXh0TWVudUdyb3VwSWQgPSBfZGVzY3JpcHRvci5jb250ZXh0TWVudUdyb3VwSWQgfHwgbnVsbDtcblx0XHRjb25zdCBjb250ZXh0TWVudU9yZGVyID0gX2Rlc2NyaXB0b3IuY29udGV4dE1lbnVPcmRlciB8fCAwO1xuXHRcdGNvbnN0IHJ1biA9IChfYWNjZXNzb3I/OiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoX2Rlc2NyaXB0b3IucnVuKHRoaXMsIC4uLmFyZ3MpKTtcblx0XHR9O1xuXG5cblx0XHRjb25zdCB0b0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBHZW5lcmF0ZSBhIHVuaXF1ZSBpZCB0byBhbGxvdyB0aGUgc2FtZSBkZXNjcmlwdG9yLmlkIGFjcm9zcyBtdWx0aXBsZSBlZGl0b3IgaW5zdGFuY2VzXG5cdFx0Y29uc3QgdW5pcXVlSWQgPSB0aGlzLmdldElkKCkgKyAnOicgKyBpZDtcblxuXHRcdC8vIFJlZ2lzdGVyIHRoZSBjb21tYW5kXG5cdFx0dG9EaXNwb3NlLmFkZChDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh1bmlxdWVJZCwgcnVuKSk7XG5cblx0XHQvLyBSZWdpc3RlciB0aGUgY29udGV4dCBtZW51IGl0ZW1cblx0XHRpZiAoY29udGV4dE1lbnVHcm91cElkKSB7XG5cdFx0XHRjb25zdCBtZW51SXRlbTogSU1lbnVJdGVtID0ge1xuXHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0aWQ6IHVuaXF1ZUlkLFxuXHRcdFx0XHRcdHRpdGxlOiBsYWJlbFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3aGVuOiBwcmVjb25kaXRpb24sXG5cdFx0XHRcdGdyb3VwOiBjb250ZXh0TWVudUdyb3VwSWQsXG5cdFx0XHRcdG9yZGVyOiBjb250ZXh0TWVudU9yZGVyXG5cdFx0XHR9O1xuXHRcdFx0dG9EaXNwb3NlLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvckNvbnRleHQsIG1lbnVJdGVtKSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIGtleWJpbmRpbmdzXG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoa2V5YmluZGluZ3MpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtiIG9mIGtleWJpbmRpbmdzKSB7XG5cdFx0XHRcdHRvRGlzcG9zZS5hZGQodGhpcy5fc3RhbmRhbG9uZUtleWJpbmRpbmdTZXJ2aWNlLmFkZER5bmFtaWNLZXliaW5kaW5nKHVuaXF1ZUlkLCBrYiwgcnVuLCBrZXliaW5kaW5nc1doZW4pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGaW5hbGx5LCByZWdpc3RlciBhbiBpbnRlcm5hbCBlZGl0b3IgYWN0aW9uXG5cdFx0Y29uc3QgaW50ZXJuYWxBY3Rpb24gPSBuZXcgSW50ZXJuYWxFZGl0b3JBY3Rpb24oXG5cdFx0XHR1bmlxdWVJZCxcblx0XHRcdGxhYmVsLFxuXHRcdFx0bGFiZWwsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRwcmVjb25kaXRpb24sXG5cdFx0XHQoLi4uYXJnczogdW5rbm93bltdKSA9PiBQcm9taXNlLnJlc29sdmUoX2Rlc2NyaXB0b3IucnVuKHRoaXMsIC4uLmFyZ3MpKSxcblx0XHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlXG5cdFx0KTtcblxuXHRcdC8vIFN0b3JlIGl0IHVuZGVyIHRoZSBvcmlnaW5hbCBpZCwgc3VjaCB0aGF0IHRyaWdnZXIgd2l0aCB0aGUgb3JpZ2luYWwgaWQgd2lsbCB3b3JrXG5cdFx0dGhpcy5fYWN0aW9ucy5zZXQoaWQsIGludGVybmFsQWN0aW9uKTtcblx0XHR0b0Rpc3Bvc2UuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9hY3Rpb25zLmRlbGV0ZShpZCk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfdHJpZ2dlckNvbW1hbmQoaGFuZGxlcklkOiBzdHJpbmcsIHBheWxvYWQ6IHVua25vd24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29kZUVkaXRvclNlcnZpY2UgaW5zdGFuY2VvZiBTdGFuZGFsb25lQ29kZUVkaXRvclNlcnZpY2UpIHtcblx0XHRcdC8vIEhlbHAgY29tbWFuZHMgZmluZCB0aGlzIGVkaXRvciBhcyB0aGUgYWN0aXZlIGVkaXRvclxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5fY29kZUVkaXRvclNlcnZpY2Uuc2V0QWN0aXZlQ29kZUVkaXRvcih0aGlzKTtcblx0XHRcdFx0c3VwZXIuX3RyaWdnZXJDb21tYW5kKGhhbmRsZXJJZCwgcGF5bG9hZCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5zZXRBY3RpdmVDb2RlRWRpdG9yKG51bGwpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdXBlci5fdHJpZ2dlckNvbW1hbmQoaGFuZGxlcklkLCBwYXlsb2FkKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN0YW5kYWxvbmVFZGl0b3IgZXh0ZW5kcyBTdGFuZGFsb25lQ29kZUVkaXRvciBpbXBsZW1lbnRzIElTdGFuZGFsb25lQ29kZUVkaXRvciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhbmRhbG9uZVRoZW1lU2VydmljZTogSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2U7XG5cdHByaXZhdGUgX293bnNNb2RlbDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRkb21FbGVtZW50OiBIVE1MRWxlbWVudCxcblx0XHRfb3B0aW9uczogUmVhZG9ubHk8SVN0YW5kYWxvbmVFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zPiB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJU3RhbmRhbG9uZVRoZW1lU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJVXNlckludGVyYWN0aW9uU2VydmljZSB1c2VySW50ZXJhY3Rpb25TZXJ2aWNlOiBJVXNlckludGVyYWN0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHsgLi4uX29wdGlvbnMgfTtcblx0XHR1cGRhdGVDb25maWd1cmF0aW9uU2VydmljZShjb25maWd1cmF0aW9uU2VydmljZSwgb3B0aW9ucywgZmFsc2UpO1xuXHRcdGNvbnN0IHRoZW1lRG9tUmVnaXN0cmF0aW9uID0gKDxTdGFuZGFsb25lVGhlbWVTZXJ2aWNlPnRoZW1lU2VydmljZSkucmVnaXN0ZXJFZGl0b3JDb250YWluZXIoZG9tRWxlbWVudCk7XG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zLnRoZW1lID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhlbWVTZXJ2aWNlLnNldFRoZW1lKG9wdGlvbnMudGhlbWUpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIG9wdGlvbnMuYXV0b0RldGVjdEhpZ2hDb250cmFzdCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoZW1lU2VydmljZS5zZXRBdXRvRGV0ZWN0SGlnaENvbnRyYXN0KEJvb2xlYW4ob3B0aW9ucy5hdXRvRGV0ZWN0SGlnaENvbnRyYXN0KSk7XG5cdFx0fVxuXHRcdGNvbnN0IF9tb2RlbDogSVRleHRNb2RlbCB8IG51bGwgfCB1bmRlZmluZWQgPSBvcHRpb25zLm1vZGVsO1xuXHRcdGRlbGV0ZSBvcHRpb25zLm1vZGVsO1xuXHRcdHN1cGVyKGRvbUVsZW1lbnQsIG9wdGlvbnMsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb2RlRWRpdG9yU2VydmljZSwgY29tbWFuZFNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBob3ZlclNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIGFjY2Vzc2liaWxpdHlTZXJ2aWNlLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIHVzZXJJbnRlcmFjdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UgPSBjb25maWd1cmF0aW9uU2VydmljZTtcblx0XHR0aGlzLl9zdGFuZGFsb25lVGhlbWVTZXJ2aWNlID0gdGhlbWVTZXJ2aWNlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoZW1lRG9tUmVnaXN0cmF0aW9uKTtcblxuXHRcdGxldCBtb2RlbDogSVRleHRNb2RlbCB8IG51bGw7XG5cdFx0aWYgKHR5cGVvZiBfbW9kZWwgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRjb25zdCBsYW5ndWFnZUlkID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlSWRCeU1pbWVUeXBlKG9wdGlvbnMubGFuZ3VhZ2UpIHx8IG9wdGlvbnMubGFuZ3VhZ2UgfHwgUExBSU5URVhUX0xBTkdVQUdFX0lEO1xuXHRcdFx0bW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwobW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIG9wdGlvbnMudmFsdWUgfHwgJycsIGxhbmd1YWdlSWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9vd25zTW9kZWwgPSB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2RlbCA9IF9tb2RlbDtcblx0XHRcdHRoaXMuX293bnNNb2RlbCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX2F0dGFjaE1vZGVsKG1vZGVsKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdGNvbnN0IGU6IElNb2RlbENoYW5nZWRFdmVudCA9IHtcblx0XHRcdFx0b2xkTW9kZWxVcmw6IG51bGwsXG5cdFx0XHRcdG5ld01vZGVsVXJsOiBtb2RlbC51cmlcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZU1vZGVsLmZpcmUoZSk7XG5cdFx0fVxuXHR9XG5cblxuXHRwdWJsaWMgb3ZlcnJpZGUgdXBkYXRlT3B0aW9ucyhuZXdPcHRpb25zOiBSZWFkb25seTxJRWRpdG9yT3B0aW9ucyAmIElHbG9iYWxFZGl0b3JPcHRpb25zPik6IHZvaWQge1xuXHRcdHVwZGF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXdPcHRpb25zLCBmYWxzZSk7XG5cdFx0aWYgKHR5cGVvZiBuZXdPcHRpb25zLnRoZW1lID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5fc3RhbmRhbG9uZVRoZW1lU2VydmljZS5zZXRUaGVtZShuZXdPcHRpb25zLnRoZW1lKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBuZXdPcHRpb25zLmF1dG9EZXRlY3RIaWdoQ29udHJhc3QgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLl9zdGFuZGFsb25lVGhlbWVTZXJ2aWNlLnNldEF1dG9EZXRlY3RIaWdoQ29udHJhc3QoQm9vbGVhbihuZXdPcHRpb25zLmF1dG9EZXRlY3RIaWdoQ29udHJhc3QpKTtcblx0XHR9XG5cdFx0c3VwZXIudXBkYXRlT3B0aW9ucyhuZXdPcHRpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfcG9zdERldGFjaE1vZGVsQ2xlYW51cChkZXRhY2hlZE1vZGVsOiBJVGV4dE1vZGVsKTogdm9pZCB7XG5cdFx0c3VwZXIuX3Bvc3REZXRhY2hNb2RlbENsZWFudXAoZGV0YWNoZWRNb2RlbCk7XG5cdFx0aWYgKGRldGFjaGVkTW9kZWwgJiYgdGhpcy5fb3duc01vZGVsKSB7XG5cdFx0XHRkZXRhY2hlZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX293bnNNb2RlbCA9IGZhbHNlO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3RhbmRhbG9uZURpZmZFZGl0b3IyIGV4dGVuZHMgRGlmZkVkaXRvcldpZGdldCBpbXBsZW1lbnRzIElTdGFuZGFsb25lRGlmZkVkaXRvciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhbmRhbG9uZVRoZW1lU2VydmljZTogSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZG9tRWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdFx0X29wdGlvbnM6IFJlYWRvbmx5PElTdGFuZGFsb25lRGlmZkVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnM+IHwgdW5kZWZpbmVkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJU3RhbmRhbG9uZVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIGVkaXRvclByb2dyZXNzU2VydmljZTogSUVkaXRvclByb2dyZXNzU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTogSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBvcHRpb25zID0geyAuLi5fb3B0aW9ucyB9O1xuXHRcdHVwZGF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBvcHRpb25zLCB0cnVlKTtcblx0XHRjb25zdCB0aGVtZURvbVJlZ2lzdHJhdGlvbiA9ICg8U3RhbmRhbG9uZVRoZW1lU2VydmljZT50aGVtZVNlcnZpY2UpLnJlZ2lzdGVyRWRpdG9yQ29udGFpbmVyKGRvbUVsZW1lbnQpO1xuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucy50aGVtZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoZW1lU2VydmljZS5zZXRUaGVtZShvcHRpb25zLnRoZW1lKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zLmF1dG9EZXRlY3RIaWdoQ29udHJhc3QgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGVtZVNlcnZpY2Uuc2V0QXV0b0RldGVjdEhpZ2hDb250cmFzdChCb29sZWFuKG9wdGlvbnMuYXV0b0RldGVjdEhpZ2hDb250cmFzdCkpO1xuXHRcdH1cblxuXHRcdHN1cGVyKFxuXHRcdFx0ZG9tRWxlbWVudCxcblx0XHRcdG9wdGlvbnMsXG5cdFx0XHR7fSxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRjb2RlRWRpdG9yU2VydmljZSxcblx0XHRcdGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLFxuXHRcdFx0ZWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdCk7XG5cblx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdHRoaXMuX3N0YW5kYWxvbmVUaGVtZVNlcnZpY2UgPSB0aGVtZVNlcnZpY2U7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGVtZURvbVJlZ2lzdHJhdGlvbik7XG5cdH1cblxuXG5cdHB1YmxpYyBvdmVycmlkZSB1cGRhdGVPcHRpb25zKG5ld09wdGlvbnM6IFJlYWRvbmx5PElEaWZmRWRpdG9yT3B0aW9ucyAmIElHbG9iYWxFZGl0b3JPcHRpb25zPik6IHZvaWQge1xuXHRcdHVwZGF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXdPcHRpb25zLCB0cnVlKTtcblx0XHRpZiAodHlwZW9mIG5ld09wdGlvbnMudGhlbWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLl9zdGFuZGFsb25lVGhlbWVTZXJ2aWNlLnNldFRoZW1lKG5ld09wdGlvbnMudGhlbWUpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIG5ld09wdGlvbnMuYXV0b0RldGVjdEhpZ2hDb250cmFzdCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoaXMuX3N0YW5kYWxvbmVUaGVtZVNlcnZpY2Uuc2V0QXV0b0RldGVjdEhpZ2hDb250cmFzdChCb29sZWFuKG5ld09wdGlvbnMuYXV0b0RldGVjdEhpZ2hDb250cmFzdCkpO1xuXHRcdH1cblx0XHRzdXBlci51cGRhdGVPcHRpb25zKG5ld09wdGlvbnMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9jcmVhdGVJbm5lckVkaXRvcihpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250YWluZXI6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBSZWFkb25seTxJRWRpdG9yT3B0aW9ucz4pOiBDb2RlRWRpdG9yV2lkZ2V0IHtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3RhbmRhbG9uZUNvZGVFZGl0b3IsIGNvbnRhaW5lciwgb3B0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0T3JpZ2luYWxFZGl0b3IoKTogSVN0YW5kYWxvbmVDb2RlRWRpdG9yIHtcblx0XHRyZXR1cm4gPFN0YW5kYWxvbmVDb2RlRWRpdG9yPnN1cGVyLmdldE9yaWdpbmFsRWRpdG9yKCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0TW9kaWZpZWRFZGl0b3IoKTogSVN0YW5kYWxvbmVDb2RlRWRpdG9yIHtcblx0XHRyZXR1cm4gPFN0YW5kYWxvbmVDb2RlRWRpdG9yPnN1cGVyLmdldE1vZGlmaWVkRWRpdG9yKCk7XG5cdH1cblxuXHRwdWJsaWMgYWRkQ29tbWFuZChrZXliaW5kaW5nOiBudW1iZXIsIGhhbmRsZXI6IElDb21tYW5kSGFuZGxlciwgY29udGV4dD86IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLmdldE1vZGlmaWVkRWRpdG9yKCkuYWRkQ29tbWFuZChrZXliaW5kaW5nLCBoYW5kbGVyLCBjb250ZXh0KTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVDb250ZXh0S2V5PFQgZXh0ZW5kcyBDb250ZXh0S2V5VmFsdWUgPSBDb250ZXh0S2V5VmFsdWU+KGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IFQpOiBJQ29udGV4dEtleTxUPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0TW9kaWZpZWRFZGl0b3IoKS5jcmVhdGVDb250ZXh0S2V5KGtleSwgZGVmYXVsdFZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBhZGRBY3Rpb24oZGVzY3JpcHRvcjogSUFjdGlvbkRlc2NyaXB0b3IpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0TW9kaWZpZWRFZGl0b3IoKS5hZGRBY3Rpb24oZGVzY3JpcHRvcik7XG5cdH1cbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVRleHRNb2RlbChtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSwgdmFsdWU6IHN0cmluZywgbGFuZ3VhZ2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB1cmk6IFVSSSB8IHVuZGVmaW5lZCk6IElUZXh0TW9kZWwge1xuXHR2YWx1ZSA9IHZhbHVlIHx8ICcnO1xuXHRpZiAoIWxhbmd1YWdlSWQpIHtcblx0XHRjb25zdCBmaXJzdExGID0gdmFsdWUuaW5kZXhPZignXFxuJyk7XG5cdFx0bGV0IGZpcnN0TGluZSA9IHZhbHVlO1xuXHRcdGlmIChmaXJzdExGICE9PSAtMSkge1xuXHRcdFx0Zmlyc3RMaW5lID0gdmFsdWUuc3Vic3RyaW5nKDAsIGZpcnN0TEYpO1xuXHRcdH1cblx0XHRyZXR1cm4gZG9DcmVhdGVNb2RlbChtb2RlbFNlcnZpY2UsIHZhbHVlLCBsYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlGaWxlcGF0aE9yRmlyc3RMaW5lKHVyaSB8fCBudWxsLCBmaXJzdExpbmUpLCB1cmkpO1xuXHR9XG5cdHJldHVybiBkb0NyZWF0ZU1vZGVsKG1vZGVsU2VydmljZSwgdmFsdWUsIGxhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKGxhbmd1YWdlSWQpLCB1cmkpO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5mdW5jdGlvbiBkb0NyZWF0ZU1vZGVsKG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSwgdmFsdWU6IHN0cmluZywgbGFuZ3VhZ2VTZWxlY3Rpb246IElMYW5ndWFnZVNlbGVjdGlvbiwgdXJpOiBVUkkgfCB1bmRlZmluZWQpOiBJVGV4dE1vZGVsIHtcblx0cmV0dXJuIG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCh2YWx1ZSwgbGFuZ3VhZ2VTZWxlY3Rpb24sIHVyaSk7XG59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
