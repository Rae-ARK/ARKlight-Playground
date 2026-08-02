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
import { Dialog } from "../../../../base/browser/ui/dialog/dialog.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { defaultDialogStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { createWorkbenchDialogOptions } from "../../../../workbench/browser/parts/dialogs/dialog.js";
import { ILanguageModelsService } from "../../../../workbench/contrib/chat/common/languageModels.js";
import { IHostService } from "../../../../workbench/services/host/browser/host.js";
import { IWorkbenchLayoutService } from "../../../../workbench/services/layout/browser/layoutService.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { isAutomationDialogPopupTarget, registerAutomationDialogKeyboardNavigation, renderForm, updateSaveButtonState } from "./automationDialog.js";
const $ = DOM.$;
const automationDialogAllowableCommands = /* @__PURE__ */ new Set([
  "workbench.action.quit",
  "workbench.action.reloadWindow",
  "copy",
  "cut",
  "paste",
  "editor.action.selectAll",
  "editor.action.clipboardCopyAction",
  "editor.action.clipboardCutAction",
  "editor.action.clipboardPasteAction",
  "hideCodeActionWidget",
  "clearFilterCodeActionWidget",
  "selectPrevCodeAction",
  "selectNextCodeAction",
  "acceptSelectedCodeAction",
  "previewSelectedCodeAction",
  "toggleSectionCodeAction",
  "collapseSectionCodeAction",
  "expandSectionCodeAction",
  "quickInput.next",
  "quickInput.previous",
  "quickInput.accept",
  "quickInput.hide"
]);
let AutomationDialogService = class {
  constructor(instantiationService, contextKeyService, contextViewService, configurationService, languageModelsService, keybindingService, layoutService, logService, productService, hostService, sessionsManagementService, workspaceTrustRequestService) {
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.contextViewService = contextViewService;
    this.configurationService = configurationService;
    this.languageModelsService = languageModelsService;
    this.keybindingService = keybindingService;
    this.layoutService = layoutService;
    this.logService = logService;
    this.productService = productService;
    this.hostService = hostService;
    this.sessionsManagementService = sessionsManagementService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
  }
  async showAutomationDialog(options) {
    const disposables = new DisposableStore();
    const initial = options.existing;
    const isEdit = !!initial;
    const initialTarget = initial?.target;
    const initialWorkspaceTarget = initialTarget?.kind === "workspace" ? initialTarget : void 0;
    const state = {
      name: initial?.name ?? "",
      interval: initial?.schedule.interval ?? "daily",
      hour: initial?.schedule.scheduleHour ?? 9,
      minute: initial?.schedule.scheduleMinute ?? 0,
      day: initial?.schedule.scheduleDay ?? 1,
      isQuickChat: initialTarget?.kind === "quickChat",
      folderUri: initialWorkspaceTarget?.folderUri,
      providerId: initialTarget?.providerId,
      sessionTypeId: initialTarget?.sessionTypeId,
      isolationMode: initialWorkspaceTarget?.isolation.kind === "default" ? void 0 : initialWorkspaceTarget?.isolation.kind === "worktree" ? "worktree" : "workspace",
      branch: initialWorkspaceTarget?.isolation.kind === "worktree" ? initialWorkspaceTarget.isolation.branch : void 0,
      enabled: initial?.enabled ?? true
    };
    const validation = { nameError: void 0, promptError: void 0, folderError: void 0, sessionTypeError: void 0, branchError: void 0 };
    let saveButton;
    let cancelButton;
    let revalidate = () => {
    };
    let getPrompt = () => initial?.prompt ?? "";
    let getMode = () => initial?.mode;
    let getPermissionLevel = () => initial?.permissionLevel;
    let getModelId = () => initial?.modelId;
    let getBranch = () => initialWorkspaceTarget?.isolation.kind === "worktree" ? initialWorkspaceTarget.isolation.branch : void 0;
    let getFocusableElements = () => [];
    let focusFirst = () => {
    };
    const title = isEdit ? localize("automation.dialog.editTitle", "Edit automation") : localize("automation.dialog.createTitle", "New automation");
    const buttonLabels = [
      isEdit ? localize("automation.dialog.save", "Save") : localize("automation.dialog.create", "Create"),
      localize("automation.dialog.cancel", "Cancel")
    ];
    const activeContainer = this.layoutService.activeContainer;
    const dialog = disposables.add(new Dialog(
      activeContainer,
      title,
      buttonLabels,
      createWorkbenchDialogOptions({
        type: "none",
        extraClasses: ["automation-dialog"],
        cancelId: 1,
        isExternalFocusAllowed: isAutomationDialogPopupTarget,
        // textLinkForeground stamps inline styles onto chat input picker chips.
        dialogStyles: { ...defaultDialogStyles, textLinkForeground: void 0 },
        buttonOptions: [
          {
            styleButton: (button) => {
              saveButton = button;
              revalidate();
            }
          },
          {
            styleButton: (button) => {
              cancelButton = button;
            }
          }
        ],
        renderBody: (container) => {
          container.classList.add("automation-dialog-body");
          const titlebar = DOM.append(container, $(".automation-titlebar"));
          titlebar.setAttribute("aria-hidden", "true");
          titlebar.textContent = title;
          const description = DOM.append(container, $(".automation-description"));
          description.textContent = isEdit ? localize("automation.dialog.editDescription", "Update the schedule, prompt, or run target for this automation.") : localize("automation.dialog.createDescription", "Define a prompt that will run on a schedule against the selected target.");
          const formPane = DOM.append(container, $(".automation-form-pane"));
          const form = DOM.append(formPane, $(".automation-form"));
          const handle = renderForm(form, state, disposables, validation, () => revalidate(), this.instantiationService, this.contextKeyService, this.contextViewService, this.configurationService, this.languageModelsService, this.layoutService, this.logService, this.productService, this.sessionsManagementService, this.workspaceTrustRequestService, initial?.prompt ?? "", initial?.mode, initial?.permissionLevel, initial?.modelId);
          getPrompt = handle.getPrompt;
          getMode = handle.getMode;
          getPermissionLevel = handle.getPermissionLevel;
          getModelId = handle.getModelId;
          getBranch = handle.getBranch;
          getFocusableElements = handle.getFocusableElements;
          const keyboardNavigation = disposables.add(registerAutomationDialogKeyboardNavigation(
            DOM.getWindow(container),
            () => [
              ...getFocusableElements(),
              ...saveButton ? [saveButton.element] : [],
              ...cancelButton ? [cancelButton.element] : []
            ],
            isAutomationDialogPopupTarget
          ));
          focusFirst = keyboardNavigation.focusFirst;
          revalidate = () => updateSaveButtonState(saveButton, state, validation, form, getPrompt, getBranch);
          revalidate();
        }
      }, this.keybindingService, this.layoutService, this.hostService, automationDialogAllowableCommands)
    ));
    activeContainer.classList.add("automation-dialog-open");
    disposables.add(toDisposable(() => activeContainer.classList.remove("automation-dialog-open")));
    try {
      const resultPromise = dialog.show();
      focusFirst();
      const result = await resultPromise;
      if (result.button !== 0) {
        return void 0;
      }
      revalidate();
      if (validation.nameError || validation.promptError || validation.folderError || validation.sessionTypeError || validation.branchError) {
        return void 0;
      }
      if (!state.isQuickChat && !state.folderUri || !state.sessionTypeId || state.isQuickChat && !state.providerId) {
        return void 0;
      }
      const schedule = {
        interval: state.interval,
        scheduleHour: state.hour,
        scheduleMinute: state.minute,
        scheduleDay: state.day
      };
      const prompt = getPrompt();
      const mode = getMode();
      const permissionLevel = getPermissionLevel();
      const modelId = getModelId();
      const branch = getBranch();
      const target = createAutomationTarget(state, branch);
      if (!target) {
        return void 0;
      }
      if (isEdit && initial) {
        const patch = {
          name: state.name,
          prompt,
          schedule,
          target,
          modelId: modelId ?? null,
          mode: mode ?? null,
          permissionLevel: permissionLevel ?? null,
          enabled: state.enabled
        };
        return { kind: "update", id: initial.id, value: patch };
      }
      const create = {
        name: state.name,
        prompt,
        schedule,
        target,
        modelId,
        mode,
        permissionLevel,
        enabled: state.enabled
      };
      return { kind: "create", value: create };
    } finally {
      disposables.dispose();
    }
  }
};
AutomationDialogService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ILanguageModelsService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, IWorkbenchLayoutService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IProductService),
  __decorateParam(9, IHostService),
  __decorateParam(10, ISessionsManagementService),
  __decorateParam(11, IWorkspaceTrustRequestService)
], AutomationDialogService);
function createAutomationTarget(state, branch) {
  if (state.isQuickChat) {
    return state.providerId && state.sessionTypeId ? { kind: "quickChat", providerId: state.providerId, sessionTypeId: state.sessionTypeId } : void 0;
  }
  if (!state.folderUri) {
    return void 0;
  }
  const isolation = state.isolationMode === "worktree" ? branch ? { kind: "worktree", branch } : void 0 : state.isolationMode === "workspace" ? { kind: "folder" } : { kind: "default" };
  return isolation ? {
    kind: "workspace",
    folderUri: state.folderUri,
    providerId: state.providerId,
    sessionTypeId: state.sessionTypeId,
    isolation
  } : void 0;
}
export {
  AutomationDialogService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYXV0b21hdGlvbnMvYnJvd3Nlci9hdXRvbWF0aW9uRGlhbG9nU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBEaWFsb2cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZGlhbG9nL2RpYWxvZy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IGRlZmF1bHREaWFsb2dTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlV29ya2JlbmNoRGlhbG9nT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2RpYWxvZ3MvZGlhbG9nLmpzJztcbmltcG9ydCB7IEF1dG9tYXRpb25UYXJnZXQsIElBdXRvbWF0aW9uU2NoZWR1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uLmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uRGlhbG9nUmVzdWx0LCBJQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UsIElTaG93QXV0b21hdGlvbkRpYWxvZ09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uRGlhbG9nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3JlYXRlQXV0b21hdGlvbk9wdGlvbnMsIElVcGRhdGVBdXRvbWF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUZvcm1TdGF0ZSwgSVZhbGlkYXRpb25TdGF0ZSwgaXNBdXRvbWF0aW9uRGlhbG9nUG9wdXBUYXJnZXQsIHJlZ2lzdGVyQXV0b21hdGlvbkRpYWxvZ0tleWJvYXJkTmF2aWdhdGlvbiwgcmVuZGVyRm9ybSwgdXBkYXRlU2F2ZUJ1dHRvblN0YXRlIH0gZnJvbSAnLi9hdXRvbWF0aW9uRGlhbG9nLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5jb25zdCBhdXRvbWF0aW9uRGlhbG9nQWxsb3dhYmxlQ29tbWFuZHMgPSBuZXcgU2V0KFtcblx0J3dvcmtiZW5jaC5hY3Rpb24ucXVpdCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnJlbG9hZFdpbmRvdycsXG5cdCdjb3B5Jyxcblx0J2N1dCcsXG5cdCdwYXN0ZScsXG5cdCdlZGl0b3IuYWN0aW9uLnNlbGVjdEFsbCcsXG5cdCdlZGl0b3IuYWN0aW9uLmNsaXBib2FyZENvcHlBY3Rpb24nLFxuXHQnZWRpdG9yLmFjdGlvbi5jbGlwYm9hcmRDdXRBY3Rpb24nLFxuXHQnZWRpdG9yLmFjdGlvbi5jbGlwYm9hcmRQYXN0ZUFjdGlvbicsXG5cdCdoaWRlQ29kZUFjdGlvbldpZGdldCcsXG5cdCdjbGVhckZpbHRlckNvZGVBY3Rpb25XaWRnZXQnLFxuXHQnc2VsZWN0UHJldkNvZGVBY3Rpb24nLFxuXHQnc2VsZWN0TmV4dENvZGVBY3Rpb24nLFxuXHQnYWNjZXB0U2VsZWN0ZWRDb2RlQWN0aW9uJyxcblx0J3ByZXZpZXdTZWxlY3RlZENvZGVBY3Rpb24nLFxuXHQndG9nZ2xlU2VjdGlvbkNvZGVBY3Rpb24nLFxuXHQnY29sbGFwc2VTZWN0aW9uQ29kZUFjdGlvbicsXG5cdCdleHBhbmRTZWN0aW9uQ29kZUFjdGlvbicsXG5cdCdxdWlja0lucHV0Lm5leHQnLFxuXHQncXVpY2tJbnB1dC5wcmV2aW91cycsXG5cdCdxdWlja0lucHV0LmFjY2VwdCcsXG5cdCdxdWlja0lucHV0LmhpZGUnLFxuXSk7XG5cbi8qKlxuICogT3ducyB0aGUgQXV0b21hdGlvbnMgY3JlYXRlL2VkaXQgZGlhbG9nIGluIHRoZSBzZXNzaW9ucyBsYXllciwgd2hlcmUgdGhlXG4gKiBzZXNzaW9uLXR5cGUgcHJvdmlkZXIgaXQgbmVlZHMgYWxyZWFkeSBsaXZlcy4gVGhlIHdvcmtiZW5jaCBsaXN0IHdpZGdldFxuICogZGVwZW5kcyBvbmx5IG9uIHtAbGluayBJQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2V9LlxuICovXG5leHBvcnQgY2xhc3MgQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UgaW1wbGVtZW50cyBJQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHNob3dBdXRvbWF0aW9uRGlhbG9nKG9wdGlvbnM6IElTaG93QXV0b21hdGlvbkRpYWxvZ09wdGlvbnMpOiBQcm9taXNlPElBdXRvbWF0aW9uRGlhbG9nUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBpbml0aWFsID0gb3B0aW9ucy5leGlzdGluZztcblx0XHRjb25zdCBpc0VkaXQgPSAhIWluaXRpYWw7XG5cdFx0Y29uc3QgaW5pdGlhbFRhcmdldCA9IGluaXRpYWw/LnRhcmdldDtcblx0XHRjb25zdCBpbml0aWFsV29ya3NwYWNlVGFyZ2V0ID0gaW5pdGlhbFRhcmdldD8ua2luZCA9PT0gJ3dvcmtzcGFjZScgPyBpbml0aWFsVGFyZ2V0IDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgc3RhdGU6IElGb3JtU3RhdGUgPSB7XG5cdFx0XHRuYW1lOiBpbml0aWFsPy5uYW1lID8/ICcnLFxuXHRcdFx0aW50ZXJ2YWw6IGluaXRpYWw/LnNjaGVkdWxlLmludGVydmFsID8/ICdkYWlseScsXG5cdFx0XHRob3VyOiBpbml0aWFsPy5zY2hlZHVsZS5zY2hlZHVsZUhvdXIgPz8gOSxcblx0XHRcdG1pbnV0ZTogaW5pdGlhbD8uc2NoZWR1bGUuc2NoZWR1bGVNaW51dGUgPz8gMCxcblx0XHRcdGRheTogaW5pdGlhbD8uc2NoZWR1bGUuc2NoZWR1bGVEYXkgPz8gMSxcblx0XHRcdGlzUXVpY2tDaGF0OiBpbml0aWFsVGFyZ2V0Py5raW5kID09PSAncXVpY2tDaGF0Jyxcblx0XHRcdGZvbGRlclVyaTogaW5pdGlhbFdvcmtzcGFjZVRhcmdldD8uZm9sZGVyVXJpLFxuXHRcdFx0cHJvdmlkZXJJZDogaW5pdGlhbFRhcmdldD8ucHJvdmlkZXJJZCxcblx0XHRcdHNlc3Npb25UeXBlSWQ6IGluaXRpYWxUYXJnZXQ/LnNlc3Npb25UeXBlSWQsXG5cdFx0XHRpc29sYXRpb25Nb2RlOiBpbml0aWFsV29ya3NwYWNlVGFyZ2V0Py5pc29sYXRpb24ua2luZCA9PT0gJ2RlZmF1bHQnXG5cdFx0XHRcdD8gdW5kZWZpbmVkXG5cdFx0XHRcdDogaW5pdGlhbFdvcmtzcGFjZVRhcmdldD8uaXNvbGF0aW9uLmtpbmQgPT09ICd3b3JrdHJlZScgPyAnd29ya3RyZWUnIDogJ3dvcmtzcGFjZScsXG5cdFx0XHRicmFuY2g6IGluaXRpYWxXb3Jrc3BhY2VUYXJnZXQ/Lmlzb2xhdGlvbi5raW5kID09PSAnd29ya3RyZWUnID8gaW5pdGlhbFdvcmtzcGFjZVRhcmdldC5pc29sYXRpb24uYnJhbmNoIDogdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlZDogaW5pdGlhbD8uZW5hYmxlZCA/PyB0cnVlLFxuXHRcdH07XG5cblx0XHRjb25zdCB2YWxpZGF0aW9uOiBJVmFsaWRhdGlvblN0YXRlID0geyBuYW1lRXJyb3I6IHVuZGVmaW5lZCwgcHJvbXB0RXJyb3I6IHVuZGVmaW5lZCwgZm9sZGVyRXJyb3I6IHVuZGVmaW5lZCwgc2Vzc2lvblR5cGVFcnJvcjogdW5kZWZpbmVkLCBicmFuY2hFcnJvcjogdW5kZWZpbmVkIH07XG5cblx0XHRsZXQgc2F2ZUJ1dHRvbjogSUJ1dHRvbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY2FuY2VsQnV0dG9uOiBJQnV0dG9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCByZXZhbGlkYXRlOiAoKSA9PiB2b2lkID0gKCkgPT4geyB9O1xuXHRcdGxldCBnZXRQcm9tcHQ6ICgpID0+IHN0cmluZyA9ICgpID0+IGluaXRpYWw/LnByb21wdCA/PyAnJztcblx0XHRsZXQgZ2V0TW9kZTogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkID0gKCkgPT4gaW5pdGlhbD8ubW9kZTtcblx0XHRsZXQgZ2V0UGVybWlzc2lvbkxldmVsOiAoKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQgPSAoKSA9PiBpbml0aWFsPy5wZXJtaXNzaW9uTGV2ZWw7XG5cdFx0bGV0IGdldE1vZGVsSWQ6ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZCA9ICgpID0+IGluaXRpYWw/Lm1vZGVsSWQ7XG5cdFx0bGV0IGdldEJyYW5jaDogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkID0gKCkgPT4gaW5pdGlhbFdvcmtzcGFjZVRhcmdldD8uaXNvbGF0aW9uLmtpbmQgPT09ICd3b3JrdHJlZScgPyBpbml0aWFsV29ya3NwYWNlVGFyZ2V0Lmlzb2xhdGlvbi5icmFuY2ggOiB1bmRlZmluZWQ7XG5cdFx0bGV0IGdldEZvY3VzYWJsZUVsZW1lbnRzOiAoKSA9PiByZWFkb25seSBIVE1MRWxlbWVudFtdID0gKCkgPT4gW107XG5cdFx0bGV0IGZvY3VzRmlyc3Q6ICgpID0+IHZvaWQgPSAoKSA9PiB7IH07XG5cblx0XHRjb25zdCB0aXRsZSA9IGlzRWRpdFxuXHRcdFx0PyBsb2NhbGl6ZSgnYXV0b21hdGlvbi5kaWFsb2cuZWRpdFRpdGxlJywgXCJFZGl0IGF1dG9tYXRpb25cIilcblx0XHRcdDogbG9jYWxpemUoJ2F1dG9tYXRpb24uZGlhbG9nLmNyZWF0ZVRpdGxlJywgXCJOZXcgYXV0b21hdGlvblwiKTtcblxuXHRcdGNvbnN0IGJ1dHRvbkxhYmVscyA9IFtcblx0XHRcdGlzRWRpdCA/IGxvY2FsaXplKCdhdXRvbWF0aW9uLmRpYWxvZy5zYXZlJywgXCJTYXZlXCIpIDogbG9jYWxpemUoJ2F1dG9tYXRpb24uZGlhbG9nLmNyZWF0ZScsIFwiQ3JlYXRlXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2F1dG9tYXRpb24uZGlhbG9nLmNhbmNlbCcsIFwiQ2FuY2VsXCIpLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3RpdmVDb250YWluZXIgPSB0aGlzLmxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyO1xuXHRcdGNvbnN0IGRpYWxvZyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlhbG9nKFxuXHRcdFx0YWN0aXZlQ29udGFpbmVyLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRidXR0b25MYWJlbHMsXG5cdFx0XHRjcmVhdGVXb3JrYmVuY2hEaWFsb2dPcHRpb25zKHtcblx0XHRcdFx0dHlwZTogJ25vbmUnLFxuXHRcdFx0XHRleHRyYUNsYXNzZXM6IFsnYXV0b21hdGlvbi1kaWFsb2cnXSxcblx0XHRcdFx0Y2FuY2VsSWQ6IDEsXG5cdFx0XHRcdGlzRXh0ZXJuYWxGb2N1c0FsbG93ZWQ6IGlzQXV0b21hdGlvbkRpYWxvZ1BvcHVwVGFyZ2V0LFxuXHRcdFx0XHQvLyB0ZXh0TGlua0ZvcmVncm91bmQgc3RhbXBzIGlubGluZSBzdHlsZXMgb250byBjaGF0IGlucHV0IHBpY2tlciBjaGlwcy5cblx0XHRcdFx0ZGlhbG9nU3R5bGVzOiB7IC4uLmRlZmF1bHREaWFsb2dTdHlsZXMsIHRleHRMaW5rRm9yZWdyb3VuZDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdGJ1dHRvbk9wdGlvbnM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzdHlsZUJ1dHRvbjogYnV0dG9uID0+IHtcblx0XHRcdFx0XHRcdFx0c2F2ZUJ1dHRvbiA9IGJ1dHRvbjtcblx0XHRcdFx0XHRcdFx0cmV2YWxpZGF0ZSgpO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHN0eWxlQnV0dG9uOiBidXR0b24gPT4ge1xuXHRcdFx0XHRcdFx0XHRjYW5jZWxCdXR0b24gPSBidXR0b247XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHJlbmRlckJvZHk6IGNvbnRhaW5lciA9PiB7XG5cdFx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2F1dG9tYXRpb24tZGlhbG9nLWJvZHknKTtcblxuXHRcdFx0XHRcdGNvbnN0IHRpdGxlYmFyID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5hdXRvbWF0aW9uLXRpdGxlYmFyJykpO1xuXHRcdFx0XHRcdHRpdGxlYmFyLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdFx0XHRcdHRpdGxlYmFyLnRleHRDb250ZW50ID0gdGl0bGU7XG5cblx0XHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuYXV0b21hdGlvbi1kZXNjcmlwdGlvbicpKTtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbi50ZXh0Q29udGVudCA9IGlzRWRpdFxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnYXV0b21hdGlvbi5kaWFsb2cuZWRpdERlc2NyaXB0aW9uJywgXCJVcGRhdGUgdGhlIHNjaGVkdWxlLCBwcm9tcHQsIG9yIHJ1biB0YXJnZXQgZm9yIHRoaXMgYXV0b21hdGlvbi5cIilcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2F1dG9tYXRpb24uZGlhbG9nLmNyZWF0ZURlc2NyaXB0aW9uJywgXCJEZWZpbmUgYSBwcm9tcHQgdGhhdCB3aWxsIHJ1biBvbiBhIHNjaGVkdWxlIGFnYWluc3QgdGhlIHNlbGVjdGVkIHRhcmdldC5cIik7XG5cblx0XHRcdFx0XHRjb25zdCBmb3JtUGFuZSA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuYXV0b21hdGlvbi1mb3JtLXBhbmUnKSk7XG5cdFx0XHRcdFx0Y29uc3QgZm9ybSA9IERPTS5hcHBlbmQoZm9ybVBhbmUsICQoJy5hdXRvbWF0aW9uLWZvcm0nKSk7XG5cdFx0XHRcdFx0Y29uc3QgaGFuZGxlID0gcmVuZGVyRm9ybShmb3JtLCBzdGF0ZSwgZGlzcG9zYWJsZXMsIHZhbGlkYXRpb24sICgpID0+IHJldmFsaWRhdGUoKSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCB0aGlzLmxheW91dFNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgdGhpcy5wcm9kdWN0U2VydmljZSwgdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCB0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsIGluaXRpYWw/LnByb21wdCA/PyAnJywgaW5pdGlhbD8ubW9kZSwgaW5pdGlhbD8ucGVybWlzc2lvbkxldmVsLCBpbml0aWFsPy5tb2RlbElkKTtcblx0XHRcdFx0XHRnZXRQcm9tcHQgPSBoYW5kbGUuZ2V0UHJvbXB0O1xuXHRcdFx0XHRcdGdldE1vZGUgPSBoYW5kbGUuZ2V0TW9kZTtcblx0XHRcdFx0XHRnZXRQZXJtaXNzaW9uTGV2ZWwgPSBoYW5kbGUuZ2V0UGVybWlzc2lvbkxldmVsO1xuXHRcdFx0XHRcdGdldE1vZGVsSWQgPSBoYW5kbGUuZ2V0TW9kZWxJZDtcblx0XHRcdFx0XHRnZXRCcmFuY2ggPSBoYW5kbGUuZ2V0QnJhbmNoO1xuXHRcdFx0XHRcdGdldEZvY3VzYWJsZUVsZW1lbnRzID0gaGFuZGxlLmdldEZvY3VzYWJsZUVsZW1lbnRzO1xuXHRcdFx0XHRcdGNvbnN0IGtleWJvYXJkTmF2aWdhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlckF1dG9tYXRpb25EaWFsb2dLZXlib2FyZE5hdmlnYXRpb24oXG5cdFx0XHRcdFx0XHRET00uZ2V0V2luZG93KGNvbnRhaW5lciksXG5cdFx0XHRcdFx0XHQoKSA9PiBbXG5cdFx0XHRcdFx0XHRcdC4uLmdldEZvY3VzYWJsZUVsZW1lbnRzKCksXG5cdFx0XHRcdFx0XHRcdC4uLihzYXZlQnV0dG9uID8gW3NhdmVCdXR0b24uZWxlbWVudF0gOiBbXSksXG5cdFx0XHRcdFx0XHRcdC4uLihjYW5jZWxCdXR0b24gPyBbY2FuY2VsQnV0dG9uLmVsZW1lbnRdIDogW10pLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdGlzQXV0b21hdGlvbkRpYWxvZ1BvcHVwVGFyZ2V0LFxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdGZvY3VzRmlyc3QgPSBrZXlib2FyZE5hdmlnYXRpb24uZm9jdXNGaXJzdDtcblx0XHRcdFx0XHRyZXZhbGlkYXRlID0gKCkgPT4gdXBkYXRlU2F2ZUJ1dHRvblN0YXRlKHNhdmVCdXR0b24sIHN0YXRlLCB2YWxpZGF0aW9uLCBmb3JtLCBnZXRQcm9tcHQsIGdldEJyYW5jaCk7XG5cdFx0XHRcdFx0cmV2YWxpZGF0ZSgpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSwgdGhpcy5rZXliaW5kaW5nU2VydmljZSwgdGhpcy5sYXlvdXRTZXJ2aWNlLCB0aGlzLmhvc3RTZXJ2aWNlLCBhdXRvbWF0aW9uRGlhbG9nQWxsb3dhYmxlQ29tbWFuZHMpLFxuXHRcdCkpO1xuXG5cdFx0YWN0aXZlQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2F1dG9tYXRpb24tZGlhbG9nLW9wZW4nKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFjdGl2ZUNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdhdXRvbWF0aW9uLWRpYWxvZy1vcGVuJykpKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gZGlhbG9nLnNob3coKTtcblx0XHRcdGZvY3VzRmlyc3QoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3VsdFByb21pc2U7XG5cdFx0XHRpZiAocmVzdWx0LmJ1dHRvbiAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Ly8gR3VhcmQgYWdhaW5zdCBzdWJtaXQtd2l0aC1FbnRlciBieXBhc3NpbmcgbGl2ZSB2YWxpZGF0aW9uLlxuXHRcdFx0cmV2YWxpZGF0ZSgpO1xuXHRcdFx0aWYgKHZhbGlkYXRpb24ubmFtZUVycm9yIHx8IHZhbGlkYXRpb24ucHJvbXB0RXJyb3IgfHwgdmFsaWRhdGlvbi5mb2xkZXJFcnJvciB8fCB2YWxpZGF0aW9uLnNlc3Npb25UeXBlRXJyb3IgfHwgdmFsaWRhdGlvbi5icmFuY2hFcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCghc3RhdGUuaXNRdWlja0NoYXQgJiYgIXN0YXRlLmZvbGRlclVyaSkgfHwgIXN0YXRlLnNlc3Npb25UeXBlSWQgfHwgKHN0YXRlLmlzUXVpY2tDaGF0ICYmICFzdGF0ZS5wcm92aWRlcklkKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzY2hlZHVsZTogSUF1dG9tYXRpb25TY2hlZHVsZSA9IHtcblx0XHRcdFx0aW50ZXJ2YWw6IHN0YXRlLmludGVydmFsLFxuXHRcdFx0XHRzY2hlZHVsZUhvdXI6IHN0YXRlLmhvdXIsXG5cdFx0XHRcdHNjaGVkdWxlTWludXRlOiBzdGF0ZS5taW51dGUsXG5cdFx0XHRcdHNjaGVkdWxlRGF5OiBzdGF0ZS5kYXksXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwcm9tcHQgPSBnZXRQcm9tcHQoKTtcblx0XHRcdGNvbnN0IG1vZGUgPSBnZXRNb2RlKCk7XG5cdFx0XHRjb25zdCBwZXJtaXNzaW9uTGV2ZWwgPSBnZXRQZXJtaXNzaW9uTGV2ZWwoKTtcblx0XHRcdGNvbnN0IG1vZGVsSWQgPSBnZXRNb2RlbElkKCk7XG5cdFx0XHRjb25zdCBicmFuY2ggPSBnZXRCcmFuY2goKTtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZUF1dG9tYXRpb25UYXJnZXQoc3RhdGUsIGJyYW5jaCk7XG5cdFx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNFZGl0ICYmIGluaXRpYWwpIHtcblx0XHRcdFx0Y29uc3QgcGF0Y2g6IElVcGRhdGVBdXRvbWF0aW9uT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRuYW1lOiBzdGF0ZS5uYW1lLFxuXHRcdFx0XHRcdHByb21wdCxcblx0XHRcdFx0XHRzY2hlZHVsZSxcblx0XHRcdFx0XHR0YXJnZXQsXG5cdFx0XHRcdFx0bW9kZWxJZDogbW9kZWxJZCA/PyBudWxsLFxuXHRcdFx0XHRcdG1vZGU6IG1vZGUgPz8gbnVsbCxcblx0XHRcdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IHBlcm1pc3Npb25MZXZlbCA/PyBudWxsLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHN0YXRlLmVuYWJsZWQsXG5cdFx0XHRcdH07XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICd1cGRhdGUnLCBpZDogaW5pdGlhbC5pZCwgdmFsdWU6IHBhdGNoIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNyZWF0ZTogSUNyZWF0ZUF1dG9tYXRpb25PcHRpb25zID0ge1xuXHRcdFx0XHRuYW1lOiBzdGF0ZS5uYW1lLFxuXHRcdFx0XHRwcm9tcHQsXG5cdFx0XHRcdHNjaGVkdWxlLFxuXHRcdFx0XHR0YXJnZXQsXG5cdFx0XHRcdG1vZGVsSWQsXG5cdFx0XHRcdG1vZGUsXG5cdFx0XHRcdHBlcm1pc3Npb25MZXZlbCxcblx0XHRcdFx0ZW5hYmxlZDogc3RhdGUuZW5hYmxlZCxcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4geyBraW5kOiAnY3JlYXRlJywgdmFsdWU6IGNyZWF0ZSB9O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUF1dG9tYXRpb25UYXJnZXQoc3RhdGU6IElGb3JtU3RhdGUsIGJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkKTogQXV0b21hdGlvblRhcmdldCB8IHVuZGVmaW5lZCB7XG5cdGlmIChzdGF0ZS5pc1F1aWNrQ2hhdCkge1xuXHRcdHJldHVybiBzdGF0ZS5wcm92aWRlcklkICYmIHN0YXRlLnNlc3Npb25UeXBlSWRcblx0XHRcdD8geyBraW5kOiAncXVpY2tDaGF0JywgcHJvdmlkZXJJZDogc3RhdGUucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogc3RhdGUuc2Vzc2lvblR5cGVJZCB9XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoIXN0YXRlLmZvbGRlclVyaSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgaXNvbGF0aW9uID0gc3RhdGUuaXNvbGF0aW9uTW9kZSA9PT0gJ3dvcmt0cmVlJ1xuXHRcdD8gKGJyYW5jaCA/IHsga2luZDogJ3dvcmt0cmVlJyBhcyBjb25zdCwgYnJhbmNoIH0gOiB1bmRlZmluZWQpXG5cdFx0OiBzdGF0ZS5pc29sYXRpb25Nb2RlID09PSAnd29ya3NwYWNlJ1xuXHRcdFx0PyB7IGtpbmQ6ICdmb2xkZXInIGFzIGNvbnN0IH1cblx0XHRcdDogeyBraW5kOiAnZGVmYXVsdCcgYXMgY29uc3QgfTtcblx0cmV0dXJuIGlzb2xhdGlvblxuXHRcdD8ge1xuXHRcdFx0a2luZDogJ3dvcmtzcGFjZScsXG5cdFx0XHRmb2xkZXJVcmk6IHN0YXRlLmZvbGRlclVyaSxcblx0XHRcdHByb3ZpZGVySWQ6IHN0YXRlLnByb3ZpZGVySWQsXG5cdFx0XHRzZXNzaW9uVHlwZUlkOiBzdGF0ZS5zZXNzaW9uVHlwZUlkLFxuXHRcdFx0aXNvbGF0aW9uLFxuXHRcdH1cblx0XHQ6IHVuZGVmaW5lZDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQVMsY0FBYztB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
