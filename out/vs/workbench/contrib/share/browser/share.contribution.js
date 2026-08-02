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
import "./share.css";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../common/editor.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { WorkspaceFolderCountContext } from "../../../common/contextkeys.js";
import { Extensions } from "../../../common/contributions.js";
import { ShareProviderCountContext, ShareService } from "./shareService.js";
import { IShareService } from "../common/share.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { workbenchConfigurationNodeBase } from "../../../common/configuration.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
const targetMenus = [
  MenuId.EditorContextShare,
  MenuId.SCMResourceContextShare,
  MenuId.OpenEditorsContextShare,
  MenuId.EditorTitleContextShare,
  MenuId.MenubarShare,
  // MenuId.EditorLineNumberContext, // todo@joyceerhl add share
  MenuId.ExplorerContextShare
];
let ShareWorkbenchContribution = class extends Disposable {
  constructor(shareService, configurationService) {
    super();
    this.shareService = shareService;
    this.configurationService = configurationService;
    if (this.configurationService.getValue(ShareWorkbenchContribution.SHARE_ENABLED_SETTING)) {
      this.registerActions();
    }
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ShareWorkbenchContribution.SHARE_ENABLED_SETTING)) {
        const settingValue = this.configurationService.getValue(ShareWorkbenchContribution.SHARE_ENABLED_SETTING);
        if (settingValue === true && this._disposables === void 0) {
          this.registerActions();
        } else if (settingValue === false && this._disposables !== void 0) {
          this._disposables?.clear();
          this._disposables = void 0;
        }
      }
    }));
  }
  dispose() {
    super.dispose();
    this._disposables?.dispose();
  }
  registerActions() {
    var _a;
    if (!this._disposables) {
      this._disposables = new DisposableStore();
    }
    this._disposables.add(
      registerAction2((_a = class extends Action2 {
        constructor() {
          super({
            id: _a.ID,
            title: _a.LABEL,
            f1: true,
            icon: Codicon.linkExternal,
            precondition: ContextKeyExpr.and(ShareProviderCountContext.notEqualsTo(0), WorkspaceFolderCountContext.notEqualsTo(0)),
            keybinding: {
              weight: KeybindingWeight.WorkbenchContrib,
              primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.KeyS
            },
            menu: [
              { id: MenuId.CommandCenter, order: 3 }
            ]
          });
        }
        async run(accessor, ...args) {
          const shareService = accessor.get(IShareService);
          const activeEditor = accessor.get(IEditorService)?.activeEditor;
          const resourceUri = (activeEditor && EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY })) ?? accessor.get(IWorkspaceContextService).getWorkspace().folders[0].uri;
          const clipboardService = accessor.get(IClipboardService);
          const dialogService = accessor.get(IDialogService);
          const urlService = accessor.get(IOpenerService);
          const progressService = accessor.get(IProgressService);
          const selection = accessor.get(ICodeEditorService).getActiveCodeEditor()?.getSelection() ?? void 0;
          const result = await progressService.withProgress({
            location: ProgressLocation.Window,
            detail: localize("generating link", "Generating link...")
          }, async () => shareService.provideShare({ resourceUri, selection }, CancellationToken.None));
          if (result) {
            const uriText = result.toString();
            const isResultText = typeof result === "string";
            await clipboardService.writeText(uriText);
            dialogService.prompt(
              {
                type: Severity.Info,
                message: isResultText ? localize("shareTextSuccess", "Copied text to clipboard!") : localize("shareSuccess", "Copied link to clipboard!"),
                custom: {
                  icon: Codicon.check,
                  markdownDetails: [{
                    markdown: new MarkdownString(`<div aria-label='${uriText}'>${uriText}</div>`, { supportHtml: true }),
                    classes: [isResultText ? "share-dialog-input-text" : "share-dialog-input-link"]
                  }]
                },
                cancelButton: localize("close", "Close"),
                buttons: isResultText ? [] : [{ label: localize("open link", "Open Link"), run: () => {
                  urlService.open(result, { openExternal: true });
                } }]
              }
            );
          }
        }
      }, _a.ID = "workbench.action.share", _a.LABEL = localize2("share", "Share..."), _a))
    );
    const actions = this.shareService.getShareActions();
    for (const menuId of targetMenus) {
      for (const action of actions) {
        this._disposables.add(MenuRegistry.appendMenuItem(menuId, action));
      }
    }
  }
};
ShareWorkbenchContribution.SHARE_ENABLED_SETTING = "workbench.experimental.share.enabled";
ShareWorkbenchContribution = __decorateClass([
  __decorateParam(0, IShareService),
  __decorateParam(1, IConfigurationService)
], ShareWorkbenchContribution);
registerSingleton(IShareService, ShareService, InstantiationType.Delayed);
const workbenchContributionsRegistry = Registry.as(Extensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(ShareWorkbenchContribution, LifecyclePhase.Eventually);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...workbenchConfigurationNodeBase,
  properties: {
    "workbench.experimental.share.enabled": {
      type: "boolean",
      default: false,
      tags: ["experimental"],
      markdownDescription: localize("experimental.share.enabled", "Controls whether to render the Share action next to the command center when {0} is {1}.", "`#window.commandCenter#`", "`true`"),
      restricted: false
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NoYXJlL2Jyb3dzZXIvc2hhcmUuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL3NoYXJlLmNzcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IsIFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBXb3Jrc3BhY2VGb2xkZXJDb3VudENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IFNoYXJlUHJvdmlkZXJDb3VudENvbnRleHQsIFNoYXJlU2VydmljZSB9IGZyb20gJy4vc2hhcmVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTaGFyZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2hhcmUuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoQ29uZmlndXJhdGlvbk5vZGVCYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuY29uc3QgdGFyZ2V0TWVudXMgPSBbXG5cdE1lbnVJZC5FZGl0b3JDb250ZXh0U2hhcmUsXG5cdE1lbnVJZC5TQ01SZXNvdXJjZUNvbnRleHRTaGFyZSxcblx0TWVudUlkLk9wZW5FZGl0b3JzQ29udGV4dFNoYXJlLFxuXHRNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0U2hhcmUsXG5cdE1lbnVJZC5NZW51YmFyU2hhcmUsXG5cdC8vIE1lbnVJZC5FZGl0b3JMaW5lTnVtYmVyQ29udGV4dCwgLy8gdG9kb0Bqb3ljZWVyaGwgYWRkIHNoYXJlXG5cdE1lbnVJZC5FeHBsb3JlckNvbnRleHRTaGFyZVxuXTtcblxuY2xhc3MgU2hhcmVXb3JrYmVuY2hDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBzdGF0aWMgU0hBUkVfRU5BQkxFRF9TRVRUSU5HID0gJ3dvcmtiZW5jaC5leHBlcmltZW50YWwuc2hhcmUuZW5hYmxlZCc7XG5cblx0cHJpdmF0ZSBfZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVNoYXJlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNoYXJlU2VydmljZTogSVNoYXJlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oU2hhcmVXb3JrYmVuY2hDb250cmlidXRpb24uU0hBUkVfRU5BQkxFRF9TRVRUSU5HKSkge1xuXHRcdFx0dGhpcy5yZWdpc3RlckFjdGlvbnMoKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihTaGFyZVdvcmtiZW5jaENvbnRyaWJ1dGlvbi5TSEFSRV9FTkFCTEVEX1NFVFRJTkcpKSB7XG5cdFx0XHRcdGNvbnN0IHNldHRpbmdWYWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oU2hhcmVXb3JrYmVuY2hDb250cmlidXRpb24uU0hBUkVfRU5BQkxFRF9TRVRUSU5HKTtcblx0XHRcdFx0aWYgKHNldHRpbmdWYWx1ZSA9PT0gdHJ1ZSAmJiB0aGlzLl9kaXNwb3NhYmxlcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5yZWdpc3RlckFjdGlvbnMoKTtcblx0XHRcdFx0fSBlbHNlIGlmIChzZXR0aW5nVmFsdWUgPT09IGZhbHNlICYmIHRoaXMuX2Rpc3Bvc2FibGVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9kaXNwb3NhYmxlcz8uY2xlYXIoKTtcblx0XHRcdFx0XHR0aGlzLl9kaXNwb3NhYmxlcyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzPy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQWN0aW9ucygpIHtcblx0XHRpZiAoIXRoaXMuX2Rpc3Bvc2FibGVzKSB7XG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoXG5cdFx0XHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgU2hhcmVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uc2hhcmUnO1xuXHRcdFx0XHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZTIoJ3NoYXJlJywgJ1NoYXJlLi4uJyk7XG5cblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IFNoYXJlQWN0aW9uLklELFxuXHRcdFx0XHRcdFx0dGl0bGU6IFNoYXJlQWN0aW9uLkxBQkVMLFxuXHRcdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmxpbmtFeHRlcm5hbCxcblx0XHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFNoYXJlUHJvdmlkZXJDb3VudENvbnRleHQubm90RXF1YWxzVG8oMCksIFdvcmtzcGFjZUZvbGRlckNvdW50Q29udGV4dC5ub3RFcXVhbHNUbygwKSksXG5cdFx0XHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVMsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bWVudTogW1xuXHRcdFx0XHRcdFx0XHR7IGlkOiBNZW51SWQuQ29tbWFuZENlbnRlciwgb3JkZXI6IDMgfVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRjb25zdCBzaGFyZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNoYXJlU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKT8uYWN0aXZlRWRpdG9yO1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlVXJpID0gKGFjdGl2ZUVkaXRvciAmJiBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGFjdGl2ZUVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pKVxuXHRcdFx0XHRcdFx0Pz8gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSkuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXS51cmk7XG5cdFx0XHRcdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgdXJsU2VydmljZSA9IGFjY2Vzc29yLmdldChJT3BlbmVyU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgcHJvZ3Jlc3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcm9ncmVzc1NlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpLmdldEFjdGl2ZUNvZGVFZGl0b3IoKT8uZ2V0U2VsZWN0aW9uKCkgPz8gdW5kZWZpbmVkO1xuXG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3csXG5cdFx0XHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdnZW5lcmF0aW5nIGxpbmsnLCAnR2VuZXJhdGluZyBsaW5rLi4uJylcblx0XHRcdFx0XHR9LCBhc3luYyAoKSA9PiBzaGFyZVNlcnZpY2UucHJvdmlkZVNoYXJlKHsgcmVzb3VyY2VVcmksIHNlbGVjdGlvbiB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cblx0XHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCB1cmlUZXh0ID0gcmVzdWx0LnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBpc1Jlc3VsdFRleHQgPSB0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJztcblx0XHRcdFx0XHRcdGF3YWl0IGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHVyaVRleHQpO1xuXG5cdFx0XHRcdFx0XHRkaWFsb2dTZXJ2aWNlLnByb21wdChcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0XHRcdFx0bWVzc2FnZTogaXNSZXN1bHRUZXh0ID8gbG9jYWxpemUoJ3NoYXJlVGV4dFN1Y2Nlc3MnLCAnQ29waWVkIHRleHQgdG8gY2xpcGJvYXJkIScpIDogbG9jYWxpemUoJ3NoYXJlU3VjY2VzcycsICdDb3BpZWQgbGluayB0byBjbGlwYm9hcmQhJyksXG5cdFx0XHRcdFx0XHRcdFx0Y3VzdG9tOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmNoZWNrLFxuXHRcdFx0XHRcdFx0XHRcdFx0bWFya2Rvd25EZXRhaWxzOiBbe1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRtYXJrZG93bjogbmV3IE1hcmtkb3duU3RyaW5nKGA8ZGl2IGFyaWEtbGFiZWw9JyR7dXJpVGV4dH0nPiR7dXJpVGV4dH08L2Rpdj5gLCB7IHN1cHBvcnRIdG1sOiB0cnVlIH0pLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjbGFzc2VzOiBbaXNSZXN1bHRUZXh0ID8gJ3NoYXJlLWRpYWxvZy1pbnB1dC10ZXh0JyA6ICdzaGFyZS1kaWFsb2ctaW5wdXQtbGluayddXG5cdFx0XHRcdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0Y2FuY2VsQnV0dG9uOiBsb2NhbGl6ZSgnY2xvc2UnLCAnQ2xvc2UnKSxcblx0XHRcdFx0XHRcdFx0XHRidXR0b25zOiBpc1Jlc3VsdFRleHQgPyBbXSA6IFt7IGxhYmVsOiBsb2NhbGl6ZSgnb3BlbiBsaW5rJywgJ09wZW4gTGluaycpLCBydW46ICgpID0+IHsgdXJsU2VydmljZS5vcGVuKHJlc3VsdCwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSk7IH0gfV1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLnNoYXJlU2VydmljZS5nZXRTaGFyZUFjdGlvbnMoKTtcblx0XHRmb3IgKGNvbnN0IG1lbnVJZCBvZiB0YXJnZXRNZW51cykge1xuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0XHQvLyB0b2RvQGpveWNlZXJobCBhdm9pZCBkdXBsaWNhdGVzXG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0obWVudUlkLCBhY3Rpb24pKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVNoYXJlU2VydmljZSwgU2hhcmVTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbmNvbnN0IHdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KEV4dGVuc2lvbnMuV29ya2JlbmNoKTtcbndvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihTaGFyZVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdC4uLndvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSxcblx0cHJvcGVydGllczoge1xuXHRcdCd3b3JrYmVuY2guZXhwZXJpbWVudGFsLnNoYXJlLmVuYWJsZWQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXhwZXJpbWVudGFsLnNoYXJlLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gcmVuZGVyIHRoZSBTaGFyZSBhY3Rpb24gbmV4dCB0byB0aGUgY29tbWFuZCBjZW50ZXIgd2hlbiB7MH0gaXMgezF9LlwiLCAnYCN3aW5kb3cuY29tbWFuZENlbnRlciNgJywgJ2B0cnVlYCcpLFxuXHRcdFx0cmVzdHJpY3RlZDogZmFsc2UsXG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFB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
