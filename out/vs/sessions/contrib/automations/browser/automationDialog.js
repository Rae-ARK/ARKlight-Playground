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
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { InputBox } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { SelectBox } from "../../../../base/browser/ui/selectBox/selectBox.js";
import { Checkbox } from "../../../../base/browser/ui/toggle/toggle.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, constObservable, derived } from "../../../../base/common/observable.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ActionListItemKind } from "../../../../platform/actionWidget/browser/actionList.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { defaultCheckboxStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { hasNativeContextMenu } from "../../../../platform/window/common/window.js";
import { WorkspacePicker } from "../../chat/browser/sessionWorkspacePicker.js";
import { BranchPicker } from "../../chat/browser/branchPicker.js";
import { MobileSessionTypePicker } from "../../chat/browser/mobile/mobileSessionTypePicker.js";
import { isMobilePickerSheetTarget } from "../../../browser/parts/mobile/mobilePickerSheet.js";
import { SESSION_WORKSPACE_GROUP_LOCAL } from "../../../services/sessions/common/session.js";
import { IGitService } from "../../../../workbench/contrib/git/common/gitService.js";
import { DAYS_OF_WEEK } from "../../../../workbench/contrib/chat/common/automations/schedule.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { ChatAgentLocation, isChatPermissionLevel } from "../../../../workbench/contrib/chat/common/constants.js";
import { ChatInputPart } from "../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js";
import { isModeConsideredBuiltIn } from "../../../../workbench/contrib/chat/browser/widget/input/modePickerActionItem.js";
import { AutomationIsolationModel, normalizeAutomationBranchNames } from "../common/isolationGroupModel.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { showMobileWorkspacePickerSheet, shouldUseMobileWorkspacePickerSheet } from "../../chat/browser/mobile/mobileWorkspacePickerSheet.js";
const $ = DOM.$;
const INTERVALS = [
  { value: "manual", label: localize("automation.interval.manual", "Manual") },
  { value: "hourly", label: localize("automation.interval.hourly", "Hourly") },
  { value: "daily", label: localize("automation.interval.daily", "Daily") },
  { value: "weekly", label: localize("automation.interval.weekly", "Weekly") }
];
function isAutomationDialogPopupTarget(relatedTarget) {
  return isMobilePickerSheetTarget(relatedTarget) || !!relatedTarget.closest(
    ".context-view, .quick-input-widget, .monaco-menu-container, .monaco-hover, .monaco-hover-content"
  );
}
async function canSelectAutomationWorkspace(folderUri, preferredProviderId, sessionsManagementService, workspaceTrustRequestService) {
  const resolved = sessionsManagementService.resolveWorkspace(folderUri, preferredProviderId);
  if (!resolved) {
    return false;
  }
  if (!resolved.workspace.requiresWorkspaceTrust) {
    return true;
  }
  return !!await workspaceTrustRequestService.requestResourcesTrust({
    uri: folderUri,
    message: localize("automation.form.trustFolderMessage", "An agent session will be able to read files, run commands, and make changes in this folder.")
  });
}
function registerAutomationDialogKeyboardNavigation(targetWindow, getFocusableElements, isPopupTarget) {
  const store = new DisposableStore();
  let suppressPopupEscapeKeyUp = false;
  const visibleFocusableElements = () => getFocusableElements().filter((element) => {
    if (!element.isConnected || element.tabIndex < 0 || element.hasAttribute("disabled")) {
      return false;
    }
    for (let current = element; current; current = current.parentElement) {
      if (current.hidden || current.getAttribute("aria-hidden") === "true") {
        return false;
      }
      const style = targetWindow.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
    }
    return true;
  });
  store.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_DOWN, (event) => {
    const target = event.target;
    if (target instanceof targetWindow.HTMLElement && isPopupTarget(target)) {
      suppressPopupEscapeKeyUp = event.key === "Escape";
      return;
    }
    suppressPopupEscapeKeyUp = false;
    if (event.key !== "Tab") {
      return;
    }
    const focusableElements = visibleFocusableElements();
    if (focusableElements.length === 0) {
      return;
    }
    const activeElement = targetWindow.document.activeElement;
    let focusedIndex = focusableElements.findIndex((element) => element === activeElement);
    if (focusedIndex < 0) {
      focusedIndex = focusableElements.findIndex((element) => !!activeElement && element.contains(activeElement));
    }
    if (focusedIndex < 0) {
      focusedIndex = event.shiftKey ? 0 : -1;
    }
    const nextIndex = event.shiftKey ? (focusedIndex - 1 + focusableElements.length) % focusableElements.length : (focusedIndex + 1) % focusableElements.length;
    event.preventDefault();
    event.stopImmediatePropagation();
    focusableElements[nextIndex].focus();
  }, true));
  store.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_UP, (event) => {
    if (event.key === "Escape" && suppressPopupEscapeKeyUp) {
      suppressPopupEscapeKeyUp = false;
      event.stopImmediatePropagation();
      return;
    }
    suppressPopupEscapeKeyUp = false;
  }, true));
  return {
    focusFirst: () => visibleFocusableElements()[0]?.focus(),
    dispose: () => store.dispose()
  };
}
function resolveAutomationModelIdentifier(languageModelsService, identifier, logicalSessionType, modelTarget) {
  if (!logicalSessionType || !modelTarget) {
    return identifier;
  }
  const sourceModel = languageModelsService.lookupLanguageModel(identifier);
  if (sourceModel?.targetChatSessionType !== logicalSessionType) {
    return identifier;
  }
  return languageModelsService.getLanguageModelIds().find((candidateIdentifier) => {
    const candidate = languageModelsService.lookupLanguageModel(candidateIdentifier);
    return candidate?.targetChatSessionType === modelTarget && candidate.id === sourceModel.id;
  }) ?? identifier;
}
const AUTOMATIONS_HARNESS_CHIP_ACTION_ID = "workbench.action.chat.renderAutomationsHarnessChip";
const AUTOMATIONS_WORKSPACE_PICKER_ACTION_ID = "workbench.action.chat.renderAutomationsWorkspacePicker";
const AUTOMATIONS_ISOLATION_GROUP_ACTION_ID = "workbench.action.chat.renderAutomationsIsolationGroup";
function setAutomationControlVisible(container, visible) {
  container.style.display = visible ? "" : "none";
  if (visible) {
    container.removeAttribute("aria-hidden");
  } else {
    container.setAttribute("aria-hidden", "true");
  }
}
let AutomationIsolationGroupActionViewItem = class extends BaseActionViewItem {
  constructor(action, state, isolationModel, workspaceFolder, onDidChangeTarget, revalidate, options, visible, gitService, sessionsManagementService, pickerLogService, instantiationService) {
    super(void 0, action, options);
    this.state = state;
    this.isolationModel = isolationModel;
    this.workspaceFolder = workspaceFolder;
    this.onDidChangeTarget = onDidChangeTarget;
    this.revalidate = revalidate;
    this.visible = visible;
    this.gitService = gitService;
    this.sessionsManagementService = sessionsManagementService;
    this.pickerLogService = pickerLogService;
    this.renderDisposables = this._register(new DisposableStore());
    this.branchRepoDisposable = this._register(new MutableDisposable());
    this.branchRequest = this._register(new MutableDisposable());
    this.branchRequestId = 0;
    this.branchLoadState = "noFolder";
    this.branches = [];
    this.worktreeCapabilityResolved = false;
    this.branchPicker = this._register(instantiationService.createInstance(BranchPicker, {
      user: "automationBranchPicker",
      slotClassName: "automation-form-branch-picker-slot",
      triggerClassName: "automation-form-branch-slot",
      labelClassName: "automation-form-branch-name",
      descriptionClassName: "automation-form-branch-description",
      keepDisabledFocusable: true,
      renderDisabledAsStatic: true,
      ariaLive: "polite",
      onSelectBranch: (branch) => {
        this.isolationModel.selectBranch(branch);
        this.renderBranchControl();
      },
      onRetry: () => {
        void this.reloadRepository(this.isolationModel.folderUri);
      },
      isolation: {
        label: localize("automation.form.isolation.worktree", "New Worktree"),
        ariaLabel: localize("automation.form.isolation.checkboxAriaLabel", "Worktree isolation"),
        onToggle: (checked) => {
          this.isolationModel.selectIsolationMode(checked ? "worktree" : "workspace");
          this.renderBranchControl();
        }
      }
    }));
  }
  render(container) {
    this.renderDisposables.clear();
    this.branchRepoDisposable.clear();
    this.cancelBranchRequest();
    DOM.clearNode(container);
    container.style.marginLeft = "auto";
    const visible = this.visible;
    if (visible) {
      this.renderDisposables.add(autorun((reader) => {
        setAutomationControlVisible(container, visible.read(reader));
      }));
    }
    const isolationGroup = DOM.append(container, $("span.automation-form-isolation-group"));
    this.branchPicker.render(isolationGroup);
    this.refreshTargetCapability();
    this.renderBranchControl();
    this.renderDisposables.add(autorun((reader) => {
      const folderUri = this.workspaceFolder.read(reader);
      this.refreshTargetAndRender();
      void this.reloadRepository(folderUri);
    }));
    this.renderDisposables.add(this.onDidChangeTarget(() => {
      this.refreshTargetAndRender();
    }));
    this.renderDisposables.add(this.sessionsManagementService.onDidChangeSessionTypes(() => this.refreshTargetAndRender()));
    this.renderDisposables.add({
      dispose: () => {
        this.cancelBranchRequest();
      }
    });
  }
  refreshTargetCapability() {
    const folderUri = this.isolationModel.folderUri;
    const sessionTypeId = this.state.sessionTypeId;
    if (!folderUri || !sessionTypeId) {
      this.worktreeCapabilityResolved = false;
      this.isolationModel.setSupportsWorktreeConfiguration(false);
      return;
    }
    const sessionType = this.sessionsManagementService.getSessionTypesForFolder(folderUri).find(
      (candidate) => candidate.sessionType.id === sessionTypeId && (this.state.providerId === void 0 || candidate.providerId === this.state.providerId)
    )?.sessionType;
    if (!sessionType) {
      this.worktreeCapabilityResolved = false;
      this.isolationModel.setSupportsWorktreeConfiguration(false);
      return;
    }
    this.worktreeCapabilityResolved = true;
    const supportsWorktreeConfiguration = sessionType.supportsWorktreeConfiguration === true;
    this.isolationModel.setSupportsWorktreeConfiguration(supportsWorktreeConfiguration);
    if (!supportsWorktreeConfiguration && this.isolationModel.isolationMode === "worktree") {
      this.isolationModel.selectIsolationMode("workspace");
    }
  }
  refreshTargetAndRender() {
    this.refreshTargetCapability();
    this.renderBranchControl();
  }
  renderBranchControl() {
    const presentation = this.getBranchPresentation();
    const canOpen = this.canOpenBranchPicker();
    const selectedBranch = this.isolationModel.selectedBranch ?? this.isolationModel.headBranch;
    const branches = this.branches.map((branch) => ({
      name: branch,
      selected: branch === selectedBranch
    }));
    if (selectedBranch && !this.branches.includes(selectedBranch)) {
      branches.unshift({
        name: selectedBranch,
        selected: true,
        unavailable: true
      });
    }
    const worktreeUnavailableReason = this.getWorktreeUnavailableReason();
    const isolationState = worktreeUnavailableReason === void 0 ? "enabled" : "disabled";
    this.branchPicker.update({
      label: presentation.label,
      branches,
      status: this.branchLoadState === "loadingRepository" || this.branchLoadState === "loadingBranches" ? "loading" : this.branchLoadState === "error" ? "error" : this.branchLoadState === "ready" ? "ready" : "empty",
      canOpen,
      disabledReason: presentation.reason,
      missing: presentation.missing,
      showChevron: this.isolationModel.branchPickerAvailable || this.branchLoadState === "error",
      isolation: {
        checked: this.isolationModel.isolationMode === "worktree",
        state: isolationState,
        disabledReason: worktreeUnavailableReason
      }
    });
    this.revalidate();
  }
  getBranchPresentation() {
    const displayBranch = this.isolationModel.displayBranch;
    if (!this.isolationModel.folderUri) {
      return {
        label: localize("automation.form.branch.unknown", "\u2014"),
        reason: localize("automation.form.branch.noFolderReason", "Select a folder to determine its Git branch."),
        missing: true
      };
    }
    if (!this.worktreeCapabilityResolved) {
      return {
        label: displayBranch ?? localize("automation.form.branch.unknown", "\u2014"),
        reason: localize("automation.form.branch.capabilityLoadingReason", "Session capabilities are loading."),
        missing: !displayBranch
      };
    }
    if (!this.isolationModel.supportsWorktreeConfiguration) {
      return {
        label: displayBranch ?? localize("automation.form.branch.unknown", "\u2014"),
        reason: localize("automation.form.branch.unsupportedReason", "The selected session type does not support Worktree branch configuration."),
        missing: !displayBranch
      };
    }
    if (this.branchLoadState === "error") {
      return {
        label: displayBranch ?? localize("automation.form.branch.loadError", "Unable to load branches"),
        reason: localize("automation.form.branch.loadErrorReason", "Open the branch picker to retry loading local branches."),
        missing: !displayBranch
      };
    }
    if (this.isolationModel.isolationMode !== "worktree") {
      return {
        label: displayBranch ?? this.detachedCommit ?? localize("automation.form.branch.unknown", "\u2014"),
        reason: localize("automation.form.branch.folderModeReason", "Select Worktree to choose a branch."),
        missing: !displayBranch && !this.detachedCommit
      };
    }
    switch (this.branchLoadState) {
      case "loadingRepository":
      case "loadingBranches":
        return {
          label: displayBranch ?? localize("automation.form.branch.loading", "Loading branches\u2026"),
          reason: localize("automation.form.branch.loadingReason", "Local branches are loading."),
          missing: !displayBranch
        };
      case "noRepository":
        return {
          label: displayBranch ?? localize("automation.form.branch.noRepo", "no git repo"),
          reason: localize("automation.form.branch.noRepoReason", "No Git repository was found for the selected folder."),
          missing: !displayBranch
        };
      case "empty":
        return {
          label: displayBranch ?? localize("automation.form.branch.noBranches", "No local branches"),
          reason: localize("automation.form.branch.noBranchesReason", "No local branches were found in this repository."),
          missing: !displayBranch
        };
      case "ready":
        return {
          label: displayBranch ?? localize("automation.form.branch.select", "Select branch"),
          reason: localize("automation.form.branch.chooseReason", "Choose the local branch to use as the Worktree base."),
          missing: !displayBranch
        };
      case "noFolder":
        return {
          label: localize("automation.form.branch.unknown", "\u2014"),
          reason: localize("automation.form.branch.noFolderReason", "Select a folder to determine its Git branch."),
          missing: true
        };
    }
  }
  canOpenBranchPicker() {
    if (this.branchLoadState === "error") {
      return !!this.isolationModel.folderUri && this.worktreeCapabilityResolved && this.isolationModel.supportsWorktreeConfiguration;
    }
    return this.isolationModel.branchPickerAvailable && this.branchLoadState !== "noFolder" && this.branchLoadState !== "noRepository" && this.branchLoadState !== "loadingRepository" && this.branchLoadState !== "loadingBranches";
  }
  getWorktreeUnavailableReason() {
    if (!this.isolationModel.folderUri) {
      return localize("automation.form.isolation.worktreeNoFolder", "Select a folder to use Worktree isolation.");
    }
    if (!this.worktreeCapabilityResolved) {
      return localize("automation.form.branch.capabilityLoadingReason", "Session capabilities are loading.");
    }
    if (!this.isolationModel.supportsWorktreeConfiguration) {
      return localize("automation.form.isolation.worktreeUnavailable", "Not supported by the selected session type");
    }
    if (this.isolationModel.selectedBranch) {
      return void 0;
    }
    switch (this.branchLoadState) {
      case "loadingRepository":
      case "loadingBranches":
        return localize("automation.form.branch.loadingReason", "Local branches are loading.");
      case "noRepository":
        return localize("automation.form.branch.noRepoReason", "No Git repository was found for the selected folder.");
      case "error":
        return localize("automation.form.branch.loadErrorReason", "Open the branch picker to retry loading local branches.");
      case "empty":
        return localize("automation.form.branch.noBranchesReason", "No local branches were found in this repository.");
      case "ready":
        return this.branches.length > 0 ? void 0 : localize("automation.form.branch.noBranchesReason", "No local branches were found in this repository.");
      case "noFolder":
        return localize("automation.form.isolation.worktreeNoFolder", "Select a folder to use Worktree isolation.");
    }
  }
  cancelBranchRequest() {
    this.branchRequest.value?.cancel();
    this.branchRequest.clear();
  }
  async reloadRepository(folder) {
    const requestId = ++this.branchRequestId;
    this.cancelBranchRequest();
    this.branchRepoDisposable.clear();
    this.repository = void 0;
    this.branches = [];
    this.detachedCommit = void 0;
    if (!folder) {
      this.branchLoadState = "noFolder";
      this.isolationModel.setHeadBranch(void 0);
      this.renderBranchControl();
      return;
    }
    this.branchLoadState = "loadingRepository";
    this.renderBranchControl();
    const cts = new CancellationTokenSource();
    this.branchRequest.value = cts;
    let repo;
    try {
      repo = await this.gitService.openRepository(folder);
    } catch (error) {
      if (requestId !== this.branchRequestId || cts.token.isCancellationRequested) {
        return;
      }
      this.pickerLogService.error("[AutomationDialog] Failed to open Git repository for branch selection.", error);
      this.branchLoadState = "error";
      this.renderBranchControl();
      return;
    }
    if (requestId !== this.branchRequestId || cts.token.isCancellationRequested) {
      return;
    }
    if (!repo) {
      this.branchLoadState = "noRepository";
      this.renderBranchControl();
      return;
    }
    this.repository = repo;
    const watcher = new DisposableStore();
    watcher.add(autorun((reader) => {
      const head = repo.state.read(reader).HEAD;
      if (head?.commit && head.name) {
        this.detachedCommit = void 0;
        this.isolationModel.setHeadBranch(head.name);
      } else if (head?.commit) {
        this.detachedCommit = localize("automation.form.branch.detached", "({0})", head.commit.slice(0, 7));
        this.isolationModel.setHeadBranch(void 0);
      } else {
        this.detachedCommit = void 0;
        this.isolationModel.setHeadBranch(void 0);
      }
      this.renderBranchControl();
    }));
    this.branchRepoDisposable.value = watcher;
    this.branchLoadState = "loadingBranches";
    this.renderBranchControl();
    try {
      const refs = await repo.getRefs({ pattern: "refs/heads" }, cts.token);
      if (requestId !== this.branchRequestId || cts.token.isCancellationRequested || this.repository !== repo) {
        return;
      }
      this.branches = normalizeAutomationBranchNames(refs.map((ref) => ref.name));
      this.branchLoadState = this.branches.length > 0 ? "ready" : "empty";
    } catch (error) {
      if (requestId !== this.branchRequestId || cts.token.isCancellationRequested) {
        return;
      }
      this.pickerLogService.error("[AutomationDialog] Failed to load local branches.", error);
      this.branchLoadState = "error";
    }
    this.renderBranchControl();
  }
};
AutomationIsolationGroupActionViewItem = __decorateClass([
  __decorateParam(8, IGitService),
  __decorateParam(9, ISessionsManagementService),
  __decorateParam(10, ILogService),
  __decorateParam(11, IInstantiationService)
], AutomationIsolationGroupActionViewItem);
class AutomationPickerActionViewItem extends BaseActionViewItem {
  constructor(action, renderPicker, visible, options) {
    super(void 0, action, options);
    this.renderPicker = renderPicker;
    this.visible = visible;
    this.visibilityWatch = this._register(new MutableDisposable());
  }
  render(container) {
    super.render(container);
    DOM.clearNode(container);
    this.renderPicker(container);
    const visible = this.visible;
    this.visibilityWatch.value = visible ? autorun((reader) => {
      setAutomationControlVisible(container, visible.read(reader));
    }) : void 0;
  }
}
registerAction2(class OpenAutomationsHarnessChipAction extends Action2 {
  constructor() {
    super({
      id: AUTOMATIONS_HARNESS_CHIP_ACTION_ID,
      title: localize2("automation.form.harnessChip.action", "Automations Harness Chip"),
      f1: false,
      precondition: ChatContextKeys.enabled,
      menu: [{
        id: MenuId.ChatInputSecondary,
        group: "navigation",
        order: -1,
        when: ChatContextKeys.inAutomationsDialog
      }]
    });
  }
  async run() {
  }
});
registerAction2(class OpenAutomationsWorkspacePickerAction extends Action2 {
  constructor() {
    super({
      id: AUTOMATIONS_WORKSPACE_PICKER_ACTION_ID,
      title: localize2("automation.form.workspacePicker.action", "Automations Workspace Picker"),
      f1: false,
      precondition: ChatContextKeys.enabled,
      menu: [{
        id: MenuId.ChatInputSecondary,
        group: "navigation",
        order: 0,
        when: ChatContextKeys.inAutomationsDialog
      }]
    });
  }
  async run() {
  }
});
registerAction2(class OpenAutomationsIsolationGroupAction extends Action2 {
  constructor() {
    super({
      id: AUTOMATIONS_ISOLATION_GROUP_ACTION_ID,
      title: localize2("automation.form.isolationGroup.action", "Automations Isolation Group"),
      f1: false,
      precondition: ChatContextKeys.enabled,
      menu: [{
        id: MenuId.ChatInputSecondary,
        group: "navigation",
        order: 2,
        when: ChatContextKeys.inAutomationsDialog
      }]
    });
  }
  async run() {
  }
});
function renderForm(form, state, disposables, validation, revalidate, instantiationService, contextKeyService, contextViewService, configurationService, languageModelsService, layoutService, logService, productService, sessionsManagementService, workspaceTrustRequestService, initialPrompt, initialMode, initialPermissionLevel, initialModelId) {
  const nameRow = DOM.append(form, $(".automation-form-row"));
  DOM.append(nameRow, $("span.automation-form-label", void 0, localize("automation.form.name", "Name")));
  const nameInputContainer = DOM.append(nameRow, $(".automation-form-input-host"));
  const nameInput = disposables.add(new InputBox(nameInputContainer, contextViewService, {
    inputBoxStyles: defaultInputBoxStyles,
    placeholder: localize("automation.form.namePlaceholder", "e.g. Morning standup notes"),
    ariaLabel: localize("automation.form.name", "Name")
  }));
  nameInput.value = state.name;
  disposables.add(nameInput.onDidChange((value) => {
    state.name = value;
    revalidate();
  }));
  const scheduleRow = DOM.append(form, $(".automation-form-row.automation-form-schedule-row"));
  const useCustomDrawn = !hasNativeContextMenu(configurationService);
  const intervalGroup = DOM.append(scheduleRow, $(".automation-form-schedule-group"));
  DOM.append(intervalGroup, $("label.automation-form-label", void 0, localize("automation.form.interval", "Schedule")));
  const intervalOptions = INTERVALS.map((item) => ({ text: item.label }));
  const intervalIndex = Math.max(0, INTERVALS.findIndex((item) => item.value === state.interval));
  const intervalSelect = disposables.add(new SelectBox(
    intervalOptions,
    intervalIndex,
    contextViewService,
    defaultSelectBoxStyles,
    { ariaLabel: localize("automation.form.interval", "Schedule"), useCustomDrawn }
  ));
  const intervalSelectContainer = DOM.append(intervalGroup, $(".automation-form-schedule-select-container"));
  intervalSelect.render(intervalSelectContainer);
  const timeGroup = DOM.append(scheduleRow, $(".automation-form-schedule-group.automation-form-time-group"));
  DOM.append(timeGroup, $("label.automation-form-label", void 0, localize("automation.form.time", "Time")));
  const timeOptions = buildTimeOptions();
  const initialTimeIndex = nearestTimeOptionIndex(state.hour, state.minute);
  state.hour = timeOptions[initialTimeIndex].hour;
  state.minute = timeOptions[initialTimeIndex].minute;
  const timeSelect = disposables.add(new SelectBox(
    timeOptions.map((opt) => ({ text: opt.label })),
    initialTimeIndex,
    contextViewService,
    defaultSelectBoxStyles,
    { ariaLabel: localize("automation.form.time", "Time"), useCustomDrawn }
  ));
  const timeSelectContainer = DOM.append(timeGroup, $(".automation-form-schedule-select-container.automation-form-time-select-container"));
  timeSelect.render(timeSelectContainer);
  disposables.add(timeSelect.onDidSelect((e) => {
    const opt = timeOptions[e.index];
    state.hour = opt.hour;
    state.minute = opt.minute;
  }));
  const dayGroup = DOM.append(scheduleRow, $(".automation-form-schedule-group.automation-form-day-group"));
  DOM.append(dayGroup, $("label.automation-form-label", void 0, localize("automation.form.day", "Day of week")));
  const dayOptions = DAYS_OF_WEEK.map((d) => ({ text: d }));
  const daySelect = disposables.add(new SelectBox(
    dayOptions,
    Math.min(Math.max(state.day, 0), DAYS_OF_WEEK.length - 1),
    contextViewService,
    defaultSelectBoxStyles,
    { ariaLabel: localize("automation.form.day", "Day of week"), useCustomDrawn }
  ));
  const daySelectContainer = DOM.append(dayGroup, $(".automation-form-schedule-select-container"));
  daySelect.render(daySelectContainer);
  disposables.add(daySelect.onDidSelect((e) => {
    state.day = e.index;
  }));
  const applyIntervalVisibility = () => {
    const showTime = state.interval === "daily" || state.interval === "weekly";
    const showDay = state.interval === "weekly";
    timeGroup.style.display = showTime ? "" : "none";
    dayGroup.style.display = showDay ? "" : "none";
  };
  applyIntervalVisibility();
  disposables.add(intervalSelect.onDidSelect((e) => {
    state.interval = INTERVALS[e.index].value;
    applyIntervalVisibility();
  }));
  const isolationModel = new AutomationIsolationModel(state);
  const workspaceControlsVisible = derived((reader) => !isolationModel.isQuickChatObs.read(reader));
  const sessionTypePicker = disposables.add(instantiationService.createInstance(MobileSessionTypePicker, constObservable(void 0), { persistSelection: false, telemetrySource: "AutomationSessionTypePicker", showChevron: false }));
  sessionTypePicker.setQuickChatSource(isolationModel.isQuickChatObs);
  sessionTypePicker.setFolderSource(isolationModel.folderUriObs, {
    initialPick: state.sessionTypeId ? { providerId: state.providerId, sessionTypeId: state.sessionTypeId } : void 0,
    preserveUnavailableInitialPick: true
  });
  const onDidChangeSessionType = disposables.add(new Emitter());
  const onDidChangeSessionTarget = disposables.add(new Emitter());
  const sessionTypeDelegate = {
    getActiveSessionProvider: () => sessionTypePicker.modelTargetChatSessionType.get(),
    onDidChangeActiveSessionProvider: onDidChangeSessionType.event
  };
  const syncStateFromPicker = () => {
    const pick = sessionTypePicker.selectedPick;
    state.providerId = pick?.providerId;
    state.sessionTypeId = pick?.sessionTypeId;
    onDidChangeSessionTarget.fire();
  };
  disposables.add(autorun((reader) => {
    const modelTarget = sessionTypePicker.modelTargetChatSessionType.read(reader);
    if (modelTarget) {
      onDidChangeSessionType.fire(modelTarget);
    }
  }));
  syncStateFromPicker();
  disposables.add(sessionTypePicker.onDidChangeSelectedPick(() => {
    syncStateFromPicker();
    revalidate();
  }));
  const workspacePicker = disposables.add(instantiationService.createInstance(MobileAutomationsWorkspacePicker, {
    canSelectWorkspace: (folderUri, preferredProviderId) => canSelectAutomationWorkspace(folderUri, preferredProviderId, sessionsManagementService, workspaceTrustRequestService)
  }));
  workspacePicker.setTargetModel(isolationModel);
  workspacePicker.setLayoutService(layoutService);
  if (state.folderUri) {
    workspacePicker.setSelectedWorkspace(state.folderUri, { fireEvent: false, persist: false });
  }
  disposables.add(workspacePicker.onDidSelectWorkspace((uri) => {
    if (isolationModel.setWorkspace(uri)) {
      revalidate();
    }
  }));
  if (!state.isQuickChat && !state.folderUri && workspacePicker.selectedFolderUri) {
    isolationModel.setWorkspace(workspacePicker.selectedFolderUri);
  }
  disposables.add(autorun((reader) => {
    isolationModel.isQuickChatObs.read(reader);
    revalidate();
  }));
  const promptRow = DOM.append(form, $(".automation-form-row"));
  DOM.append(promptRow, $("label.automation-form-label", void 0, localize("automation.form.prompt", "Prompt")));
  const promptHost = DOM.append(promptRow, $(".automation-form-prompt-host.interactive-session"));
  const chatInputStyles = {
    overlayBackground: "var(--vscode-input-background)",
    listForeground: "var(--vscode-foreground)",
    listBackground: "var(--vscode-input-background)"
  };
  const chatInputOptions = {
    renderFollowups: false,
    renderInputToolbarBelowInput: false,
    renderWorkingSet: false,
    enableImplicitContext: false,
    supportsChangingModes: true,
    hideCustomChatModes: true,
    suppressModePreferredModel: true,
    suppressModelPersistence: true,
    menus: {
      executeToolbar: MenuId.AutomationsDialogInput,
      telemetrySource: "automations.dialog"
    },
    widgetViewKindTag: "automations-dialog",
    inputEditorMinLines: 3,
    // The dialog renders the composer flush with its form column (the
    // `.interactive-input-part` margin is zeroed in CSS), so there is no
    // outer horizontal gutter. Without this, ChatInputPart would still
    // reserve the default 24px margin and lay the editor out too narrow,
    // leaving its scrollbar floating ~24px in from the right wall.
    inputPartHorizontalPadding: 0,
    sessionTypePickerDelegate: sessionTypeDelegate,
    secondaryToolbarActionViewItemProvider: (action, itemOptions) => {
      if (action.id === AUTOMATIONS_HARNESS_CHIP_ACTION_ID) {
        return new AutomationPickerActionViewItem(action, (container) => sessionTypePicker.render(container), void 0, itemOptions);
      }
      if (action.id === AUTOMATIONS_WORKSPACE_PICKER_ACTION_ID) {
        return new AutomationPickerActionViewItem(action, (container) => {
          container.classList.add("chat-input-picker-item");
          workspacePicker.render(container);
        }, void 0, itemOptions);
      }
      if (action.id === AUTOMATIONS_ISOLATION_GROUP_ACTION_ID) {
        const item = instantiationService.createInstance(
          AutomationIsolationGroupActionViewItem,
          action,
          state,
          isolationModel,
          isolationModel.folderUriObs,
          onDidChangeSessionTarget.event,
          revalidate,
          itemOptions,
          workspaceControlsVisible
        );
        return item;
      }
      return void 0;
    }
  };
  const stubWidget = {
    onDidChangeViewModel: Event.None,
    viewModel: void 0,
    contribs: [],
    location: ChatAgentLocation.Chat,
    viewContext: {},
    lockToCodingAgent: () => {
    },
    unlockFromCodingAgent: () => {
    }
  };
  const scopedContextKeyService = disposables.add(contextKeyService.createScoped(promptHost));
  ChatContextKeys.location.bindTo(scopedContextKeyService).set(ChatAgentLocation.Chat);
  ChatContextKeys.inChatSession.bindTo(scopedContextKeyService).set(true);
  ChatContextKeys.inAutomationsDialog.bindTo(scopedContextKeyService).set(true);
  const scopedInstantiationService = disposables.add(
    instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]))
  );
  const chatInput = disposables.add(
    scopedInstantiationService.createInstance(ChatInputPart, ChatAgentLocation.Chat, chatInputOptions, chatInputStyles, false)
  );
  chatInput.render(promptHost, initialPrompt, stubWidget);
  chatInput.inputEditor.updateOptions({ placeholder: localize("automation.form.prompt.placeholder", "Describe what you want to automate") });
  if (initialMode) {
    const getUnfilteredInitialMode = () => {
      const modes = chatInput.currentChatModesObs.get();
      return modes.findModeById(initialMode) ?? modes.findModeByName(initialMode);
    };
    const isHiddenCustomInitialMode = () => {
      const mode = getUnfilteredInitialMode();
      return !!mode && chatInputOptions.hideCustomChatModes && !isModeConsideredBuiltIn(mode, productService);
    };
    if (isHiddenCustomInitialMode()) {
      logService.trace(`[AutomationDialog] Skipping hidden custom initial mode "${initialMode}". Falling back to the default mode.`);
    } else {
      chatInput.setChatMode(
        initialMode,
        /* storeSelection */
        false
      );
    }
    if (chatInput.currentModeObs.get().id !== initialMode && !isHiddenCustomInitialMode()) {
      const baseline = chatInput.currentModeObs.get().id;
      const retry = disposables.add(new MutableDisposable());
      const tryApply = () => {
        if (chatInput.currentModeObs.get().id !== baseline) {
          retry.clear();
          return;
        }
        if (isHiddenCustomInitialMode()) {
          logService.trace(`[AutomationDialog] Skipping hidden custom initial mode "${initialMode}" after modes updated. Falling back to the default mode.`);
          retry.clear();
          return;
        }
        const modes = chatInput.currentChatModesObs.get();
        if (modes.findModeById(initialMode) || modes.findModeByName(initialMode)) {
          chatInput.setChatMode(
            initialMode,
            /* storeSelection */
            false
          );
          if (chatInput.currentModeObs.get().id === initialMode) {
            retry.clear();
          }
        }
      };
      retry.value = autorun((reader) => {
        const modes = chatInput.currentChatModesObs.read(reader);
        reader.store.add(modes.onDidChange(tryApply));
        tryApply();
      });
    }
  }
  if (initialPermissionLevel && isChatPermissionLevel(initialPermissionLevel)) {
    chatInput.setPermissionLevel(initialPermissionLevel);
  }
  chatInput.resetLanguageModelToDefault();
  const resolveInitialModelId = () => initialModelId ? resolveAutomationModelIdentifier(
    languageModelsService,
    initialModelId,
    state.sessionTypeId,
    sessionTypePicker.modelTargetChatSessionType.get()
  ) : void 0;
  const resolvedInitialModelId = resolveInitialModelId();
  if (resolvedInitialModelId && !chatInput.switchModelByIdentifier(
    resolvedInitialModelId,
    /* storeSelection */
    false
  )) {
    const baseline = chatInput.selectedLanguageModel.get()?.identifier;
    const retry = disposables.add(new MutableDisposable());
    retry.value = Event.any(
      languageModelsService.onDidChangeLanguageModels,
      Event.fromObservableLight(sessionTypePicker.modelTargetChatSessionType)
    )(() => {
      if (chatInput.selectedLanguageModel.get()?.identifier !== baseline) {
        retry.clear();
        return;
      }
      const modelIdentifier = resolveInitialModelId();
      if (modelIdentifier && chatInput.switchModelByIdentifier(
        modelIdentifier,
        /* storeSelection */
        false
      )) {
        retry.clear();
      }
    });
  }
  disposables.add(chatInput.inputEditor.onDidChangeModelContent(() => {
    revalidate();
  }));
  chatInput.layout(580);
  queueMicrotask(() => {
    if (!disposables.isDisposed) {
      chatInput.layout(580);
    }
  });
  const resizeObserver = disposables.add(new DOM.DisposableResizeObserver("automationDialog.promptHost", (entries) => {
    for (const entry of entries) {
      const width = entry.contentRect.width;
      if (width > 0) {
        chatInput.layout(width);
      }
    }
  }, DOM.getWindow(promptHost)));
  disposables.add(resizeObserver.observe(promptHost));
  const enabledRow = DOM.append(form, $(".automation-form-row.automation-form-checkbox-row"));
  const enabledLabelText = localize("automation.form.enabled", "Enabled (the scheduler runs this automation when due)");
  const enabledCheckbox = disposables.add(new Checkbox(enabledLabelText, state.enabled, defaultCheckboxStyles));
  DOM.append(enabledRow, enabledCheckbox.domNode);
  const enabledLabel = DOM.append(enabledRow, $("span.automation-form-checkbox-label", void 0, enabledLabelText));
  const setEnabled = (value) => {
    if (enabledCheckbox.checked !== value) {
      enabledCheckbox.checked = value;
    }
    state.enabled = value;
  };
  disposables.add(enabledCheckbox.onChange(() => {
    state.enabled = enabledCheckbox.checked;
  }));
  disposables.add(DOM.addStandardDisposableListener(enabledLabel, "click", () => {
    setEnabled(!enabledCheckbox.checked);
  }));
  return {
    getPrompt: () => chatInput.inputEditor.getValue(),
    getMode: () => chatInput.currentModeObs.get().id,
    getPermissionLevel: () => chatInput.currentPermissionLevelObs.get(),
    getModelId: () => chatInput.selectedLanguageModel.get()?.identifier,
    getBranch: () => isolationModel.persistedBranch,
    getFocusableElements: () => {
      return Array.from(form.querySelectorAll("input, select, textarea, button, a[href], [tabindex]"));
    }
  };
}
function buildTimeOptions() {
  const options = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const period = hour < 12 ? "AM" : "PM";
      const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const minuteText = minute.toString().padStart(2, "0");
      options.push({
        hour,
        minute,
        label: `${hour12}:${minuteText} ${period}`
      });
    }
  }
  return options;
}
function nearestTimeOptionIndex(hour, minute) {
  const safeHour = Math.max(0, Math.min(23, hour | 0));
  const safeMinute = Math.max(0, Math.min(59, minute | 0));
  const slot = Math.round(safeMinute / 15) % 4;
  const carriedHour = safeMinute >= 53 && slot === 0 ? (safeHour + 1) % 24 : safeHour;
  return carriedHour * 4 + slot;
}
function updateSaveButtonState(saveButton, state, validation, form, getPrompt, getBranch) {
  validation.nameError = state.name.trim() === "" ? localize("automation.form.nameRequired", "Name is required.") : void 0;
  validation.promptError = getPrompt().trim() === "" ? localize("automation.form.promptRequired", "Prompt is required.") : void 0;
  validation.folderError = !state.folderUri && !state.isQuickChat ? localize("automation.form.folderRequired", "Workspace folder is required.") : void 0;
  validation.sessionTypeError = !state.sessionTypeId || state.isQuickChat && !state.providerId ? localize("automation.form.sessionTypeRequired", "Session type is required.") : void 0;
  validation.branchError = !state.isQuickChat && state.isolationMode === "worktree" && !getBranch() ? localize("automation.form.branchRequired", "A branch is required for Worktree isolation.") : void 0;
  const valid = !validation.nameError && !validation.promptError && !validation.folderError && !validation.sessionTypeError && !validation.branchError;
  if (saveButton) {
    saveButton.enabled = valid;
  }
  form.classList.toggle("automation-form-invalid", !valid);
}
class AutomationsWorkspacePicker extends WorkspacePicker {
  constructor() {
    super(...arguments);
    this.targetModelWatch = this._register(new MutableDisposable());
  }
  setTargetModel(model) {
    this.targetModel = model;
    this.targetModelWatch.value = autorun((reader) => {
      model.isQuickChatObs.read(reader);
      this._updateTriggerLabel();
    });
  }
  _showTabs() {
    return false;
  }
  _shouldPersistSelection() {
    return false;
  }
  _buildItems() {
    const items = super._buildItems();
    const noWorkspace = {
      kind: ActionListItemKind.Action,
      label: localize("automation.form.noWorkspace", "No workspace"),
      description: localize("automation.form.noWorkspace.description", "Run without a backing workspace"),
      group: { title: "", icon: Codicon.commentDiscussion },
      item: {
        checked: this.targetModel?.isQuickChat || void 0,
        run: () => this.targetModel?.setQuickChat(true)
      }
    };
    return items.length > 0 ? [noWorkspace, { kind: ActionListItemKind.Separator, label: "" }, ...items] : [noWorkspace];
  }
  async _dispatchPickerItem(item) {
    const applied = await super._dispatchPickerItem(item);
    const selectedFolder = this.selectedFolderUri;
    if (applied && selectedFolder && (item.folderUri || item.browseActionIndex !== void 0)) {
      this.targetModel?.setQuickChat(false, selectedFolder);
    }
    return applied;
  }
  _isSelectedFolder(folderUri) {
    return !this.targetModel?.isQuickChat && super._isSelectedFolder(folderUri);
  }
  _renderTriggerLabel(trigger) {
    DOM.clearNode(trigger);
    const workspace = this.selectedResolved?.workspace;
    const noWorkspace = this.targetModel?.isQuickChat === true;
    const label = noWorkspace ? localize("automation.form.noWorkspace", "No workspace") : workspace?.label ?? localize("pickWorkspace", "workspace");
    const icon = noWorkspace ? Codicon.commentDiscussion : workspace?.icon ?? Codicon.project;
    trigger.setAttribute("aria-label", workspace || noWorkspace ? localize("automation.form.workspacePicker.selectedAriaLabel", "Automation target, {0}", label) : localize("automation.form.workspacePicker.pickAriaLabel", "Pick a workspace for this automation"));
    const renderedIcon = DOM.append(trigger, renderIcon(icon));
    renderedIcon.setAttribute("aria-hidden", "true");
    DOM.append(trigger, $("span.sessions-chat-dropdown-label", void 0, label));
    const chevron = DOM.append(trigger, renderIcon(Codicon.chevronDownCompact));
    chevron.classList.add("sessions-chat-dropdown-chevron");
    chevron.setAttribute("aria-hidden", "true");
  }
  _getAllBrowseActions() {
    return super._getAllBrowseActions().filter((a) => a.group === SESSION_WORKSPACE_GROUP_LOCAL);
  }
}
class MobileAutomationsWorkspacePicker extends AutomationsWorkspacePicker {
  setLayoutService(layoutService) {
    this.layoutService = layoutService;
  }
  showPicker(force = false, anchor) {
    const triggerElement = anchor ?? this._triggerElement;
    if (!triggerElement || !this.layoutService || !shouldUseMobileWorkspacePickerSheet(this.layoutService)) {
      super.showPicker(force, anchor);
      return;
    }
    void showMobileWorkspacePickerSheet(
      this.layoutService,
      triggerElement,
      this._buildItems(),
      (item) => {
        void this._dispatchPickerItem(item);
      },
      this._getAllBrowseActions()
    );
  }
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "workbench.action.chat.automationsDialog.insertNewline",
  weight: KeybindingWeight.EditorContrib + 100,
  when: ContextKeyExpr.and(
    EditorContextKeys.textInputFocus,
    ChatContextKeys.inAutomationsDialog
  ),
  primary: KeyCode.Enter,
  handler: (accessor) => {
    const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
    editor?.trigger("keyboard", "type", { text: "\n" });
  }
});
export {
  AutomationIsolationGroupActionViewItem,
  AutomationsWorkspacePicker,
  MobileAutomationsWorkspacePicker,
  canSelectAutomationWorkspace,
  isAutomationDialogPopupTarget,
  registerAutomationDialogKeyboardNavigation,
  renderForm,
  resolveAutomationModelIdentifier,
  updateSaveButtonState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYXV0b21hdGlvbnMvYnJvd3Nlci9hdXRvbWF0aW9uRGlhbG9nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQmFzZUFjdGlvblZpZXdJdGVtLCBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSUJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IElucHV0Qm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IElTZWxlY3RPcHRpb25JdGVtLCBTZWxlY3RCb3ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2VsZWN0Qm94L3NlbGVjdEJveC5qcyc7XG5pbXBvcnQgeyBDaGVja2JveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEFjdGlvbkxpc3RJdGVtS2luZCwgSUFjdGlvbkxpc3RJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q2hlY2tib3hTdHlsZXMsIGRlZmF1bHRJbnB1dEJveFN0eWxlcywgZGVmYXVsdFNlbGVjdEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBoYXNOYXRpdmVDb250ZXh0TWVudSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VQaWNrZXJJdGVtLCBXb3Jrc3BhY2VQaWNrZXIgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvc2Vzc2lvbldvcmtzcGFjZVBpY2tlci5qcyc7XG5pbXBvcnQgeyBCcmFuY2hQaWNrZXIsIElCcmFuY2hQaWNrZXJCcmFuY2ggfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvYnJhbmNoUGlja2VyLmpzJztcbmltcG9ydCB7IE1vYmlsZVNlc3Npb25UeXBlUGlja2VyIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL21vYmlsZS9tb2JpbGVTZXNzaW9uVHlwZVBpY2tlci5qcyc7XG5pbXBvcnQgeyBpc01vYmlsZVBpY2tlclNoZWV0VGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9tb2JpbGUvbW9iaWxlUGlja2VyU2hlZXQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24sIElTZXNzaW9uV29ya3NwYWNlQnJvd3NlQWN0aW9uLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9MT0NBTCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElHaXRSZXBvc2l0b3J5LCBJR2l0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2dpdC9jb21tb24vZ2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uSW50ZXJ2YWwgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uLmpzJztcbmltcG9ydCB7IERBWVNfT0ZfV0VFSyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL3NjaGVkdWxlLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgaXNDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElTZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0UGFydCwgSUNoYXRJbnB1dFBhcnRPcHRpb25zLCBJQ2hhdElucHV0U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXRQYXJ0LmpzJztcbmltcG9ydCB7IGlzTW9kZUNvbnNpZGVyZWRCdWlsdEluIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9tb2RlUGlja2VyQWN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbCwgbm9ybWFsaXplQXV0b21hdGlvbkJyYW5jaE5hbWVzIH0gZnJvbSAnLi4vY29tbW9uL2lzb2xhdGlvbkdyb3VwTW9kZWwuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IHNob3dNb2JpbGVXb3Jrc3BhY2VQaWNrZXJTaGVldCwgc2hvdWxkVXNlTW9iaWxlV29ya3NwYWNlUGlja2VyU2hlZXQgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvbW9iaWxlL21vYmlsZVdvcmtzcGFjZVBpY2tlclNoZWV0LmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5jb25zdCBJTlRFUlZBTFM6IHsgcmVhZG9ubHkgdmFsdWU6IEF1dG9tYXRpb25JbnRlcnZhbDsgcmVhZG9ubHkgbGFiZWw6IHN0cmluZyB9W10gPSBbXG5cdHsgdmFsdWU6ICdtYW51YWwnLCBsYWJlbDogbG9jYWxpemUoJ2F1dG9tYXRpb24uaW50ZXJ2YWwubWFudWFsJywgXCJNYW51YWxcIikgfSxcblx0eyB2YWx1ZTogJ2hvdXJseScsIGxhYmVsOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5pbnRlcnZhbC5ob3VybHknLCBcIkhvdXJseVwiKSB9LFxuXHR7IHZhbHVlOiAnZGFpbHknLCBsYWJlbDogbG9jYWxpemUoJ2F1dG9tYXRpb24uaW50ZXJ2YWwuZGFpbHknLCBcIkRhaWx5XCIpIH0sXG5cdHsgdmFsdWU6ICd3ZWVrbHknLCBsYWJlbDogbG9jYWxpemUoJ2F1dG9tYXRpb24uaW50ZXJ2YWwud2Vla2x5JywgXCJXZWVrbHlcIikgfSxcbl07XG5cbi8vIFBpY2tlciBwb3B1cHMgbW91bnQgb3V0c2lkZSB0aGUgZGlhbG9nLCBzbyBhbGxvdyB0aGVpciBmb2N1cyB0YXJnZXRzIHRocm91Z2ggaXRzIGZvY3VzIHRyYXAuXG5leHBvcnQgZnVuY3Rpb24gaXNBdXRvbWF0aW9uRGlhbG9nUG9wdXBUYXJnZXQocmVsYXRlZFRhcmdldDogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzTW9iaWxlUGlja2VyU2hlZXRUYXJnZXQocmVsYXRlZFRhcmdldCkgfHwgISFyZWxhdGVkVGFyZ2V0LmNsb3Nlc3QoXG5cdFx0Jy5jb250ZXh0LXZpZXcsIC5xdWljay1pbnB1dC13aWRnZXQsIC5tb25hY28tbWVudS1jb250YWluZXIsIC5tb25hY28taG92ZXIsIC5tb25hY28taG92ZXItY29udGVudCdcblx0KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNhblNlbGVjdEF1dG9tYXRpb25Xb3Jrc3BhY2UoXG5cdGZvbGRlclVyaTogVVJJLFxuXHRwcmVmZXJyZWRQcm92aWRlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHR3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSxcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRjb25zdCByZXNvbHZlZCA9IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UucmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmksIHByZWZlcnJlZFByb3ZpZGVySWQpO1xuXHRpZiAoIXJlc29sdmVkKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICghcmVzb2x2ZWQud29ya3NwYWNlLnJlcXVpcmVzV29ya3NwYWNlVHJ1c3QpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gISFhd2FpdCB3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RSZXNvdXJjZXNUcnVzdCh7XG5cdFx0dXJpOiBmb2xkZXJVcmksXG5cdFx0bWVzc2FnZTogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS50cnVzdEZvbGRlck1lc3NhZ2UnLCBcIkFuIGFnZW50IHNlc3Npb24gd2lsbCBiZSBhYmxlIHRvIHJlYWQgZmlsZXMsIHJ1biBjb21tYW5kcywgYW5kIG1ha2UgY2hhbmdlcyBpbiB0aGlzIGZvbGRlci5cIiksXG5cdH0pO1xufVxuXG5pbnRlcmZhY2UgSUF1dG9tYXRpb25EaWFsb2dLZXlib2FyZE5hdmlnYXRpb24gZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdGZvY3VzRmlyc3QoKTogdm9pZDtcbn1cblxuLyoqIEtlZXBzIGtleWJvYXJkIGZvY3VzIHdpdGhpbiB0aGUgQXV0b21hdGlvbnMgZm9ybSB3aGlsZSBhbGxvd2luZyBvd25lZCBwb3B1cHMgdG8gaGFuZGxlIEVzY2FwZSBmaXJzdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckF1dG9tYXRpb25EaWFsb2dLZXlib2FyZE5hdmlnYXRpb24oXG5cdHRhcmdldFdpbmRvdzogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXMsXG5cdGdldEZvY3VzYWJsZUVsZW1lbnRzOiAoKSA9PiByZWFkb25seSBIVE1MRWxlbWVudFtdLFxuXHRpc1BvcHVwVGFyZ2V0OiAodGFyZ2V0OiBIVE1MRWxlbWVudCkgPT4gYm9vbGVhbixcbik6IElBdXRvbWF0aW9uRGlhbG9nS2V5Ym9hcmROYXZpZ2F0aW9uIHtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBzdXBwcmVzc1BvcHVwRXNjYXBlS2V5VXAgPSBmYWxzZTtcblxuXHRjb25zdCB2aXNpYmxlRm9jdXNhYmxlRWxlbWVudHMgPSAoKTogcmVhZG9ubHkgSFRNTEVsZW1lbnRbXSA9PiBnZXRGb2N1c2FibGVFbGVtZW50cygpLmZpbHRlcihlbGVtZW50ID0+IHtcblx0XHRpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQgfHwgZWxlbWVudC50YWJJbmRleCA8IDAgfHwgZWxlbWVudC5oYXNBdHRyaWJ1dGUoJ2Rpc2FibGVkJykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgY3VycmVudDogSFRNTEVsZW1lbnQgfCBudWxsID0gZWxlbWVudDsgY3VycmVudDsgY3VycmVudCA9IGN1cnJlbnQucGFyZW50RWxlbWVudCkge1xuXHRcdFx0aWYgKGN1cnJlbnQuaGlkZGVuIHx8IGN1cnJlbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicpID09PSAndHJ1ZScpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3R5bGUgPSB0YXJnZXRXaW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShjdXJyZW50KTtcblx0XHRcdGlmIChzdHlsZS5kaXNwbGF5ID09PSAnbm9uZScgfHwgc3R5bGUudmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSk7XG5cblx0c3RvcmUuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0V2luZG93LCBET00uRXZlbnRUeXBlLktFWV9ET1dOLCAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQ7XG5cdFx0aWYgKHRhcmdldCBpbnN0YW5jZW9mIHRhcmdldFdpbmRvdy5IVE1MRWxlbWVudCAmJiBpc1BvcHVwVGFyZ2V0KHRhcmdldCkpIHtcblx0XHRcdHN1cHByZXNzUG9wdXBFc2NhcGVLZXlVcCA9IGV2ZW50LmtleSA9PT0gJ0VzY2FwZSc7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHN1cHByZXNzUG9wdXBFc2NhcGVLZXlVcCA9IGZhbHNlO1xuXHRcdGlmIChldmVudC5rZXkgIT09ICdUYWInKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXNhYmxlRWxlbWVudHMgPSB2aXNpYmxlRm9jdXNhYmxlRWxlbWVudHMoKTtcblx0XHRpZiAoZm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSB0YXJnZXRXaW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcblx0XHRsZXQgZm9jdXNlZEluZGV4ID0gZm9jdXNhYmxlRWxlbWVudHMuZmluZEluZGV4KGVsZW1lbnQgPT4gZWxlbWVudCA9PT0gYWN0aXZlRWxlbWVudCk7XG5cdFx0aWYgKGZvY3VzZWRJbmRleCA8IDApIHtcblx0XHRcdGZvY3VzZWRJbmRleCA9IGZvY3VzYWJsZUVsZW1lbnRzLmZpbmRJbmRleChlbGVtZW50ID0+ICEhYWN0aXZlRWxlbWVudCAmJiBlbGVtZW50LmNvbnRhaW5zKGFjdGl2ZUVsZW1lbnQpKTtcblx0XHR9XG5cdFx0aWYgKGZvY3VzZWRJbmRleCA8IDApIHtcblx0XHRcdGZvY3VzZWRJbmRleCA9IGV2ZW50LnNoaWZ0S2V5ID8gMCA6IC0xO1xuXHRcdH1cblx0XHRjb25zdCBuZXh0SW5kZXggPSBldmVudC5zaGlmdEtleVxuXHRcdFx0PyAoZm9jdXNlZEluZGV4IC0gMSArIGZvY3VzYWJsZUVsZW1lbnRzLmxlbmd0aCkgJSBmb2N1c2FibGVFbGVtZW50cy5sZW5ndGhcblx0XHRcdDogKGZvY3VzZWRJbmRleCArIDEpICUgZm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoO1xuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cdFx0Zm9jdXNhYmxlRWxlbWVudHNbbmV4dEluZGV4XS5mb2N1cygpO1xuXHR9LCB0cnVlKSk7XG5cblx0c3RvcmUuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0V2luZG93LCBET00uRXZlbnRUeXBlLktFWV9VUCwgKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0aWYgKGV2ZW50LmtleSA9PT0gJ0VzY2FwZScgJiYgc3VwcHJlc3NQb3B1cEVzY2FwZUtleVVwKSB7XG5cdFx0XHRzdXBwcmVzc1BvcHVwRXNjYXBlS2V5VXAgPSBmYWxzZTtcblx0XHRcdGV2ZW50LnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzdXBwcmVzc1BvcHVwRXNjYXBlS2V5VXAgPSBmYWxzZTtcblx0fSwgdHJ1ZSkpO1xuXG5cdHJldHVybiB7XG5cdFx0Zm9jdXNGaXJzdDogKCkgPT4gdmlzaWJsZUZvY3VzYWJsZUVsZW1lbnRzKClbMF0/LmZvY3VzKCksXG5cdFx0ZGlzcG9zZTogKCkgPT4gc3RvcmUuZGlzcG9zZSgpLFxuXHR9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGb3JtU3RhdGUge1xuXHRuYW1lOiBzdHJpbmc7XG5cdGludGVydmFsOiBBdXRvbWF0aW9uSW50ZXJ2YWw7XG5cdGhvdXI6IG51bWJlcjtcblx0bWludXRlOiBudW1iZXI7XG5cdGRheTogbnVtYmVyO1xuXHRpc1F1aWNrQ2hhdDogYm9vbGVhbjtcblx0Zm9sZGVyVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByb3ZpZGVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0c2Vzc2lvblR5cGVJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRpc29sYXRpb25Nb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRlbmFibGVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElWYWxpZGF0aW9uU3RhdGUge1xuXHRuYW1lRXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJvbXB0RXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Zm9sZGVyRXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0c2Vzc2lvblR5cGVFcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRicmFuY2hFcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgSVJlbmRlckZvcm1IYW5kbGUge1xuXHRyZWFkb25seSBnZXRQcm9tcHQ6ICgpID0+IHN0cmluZztcblx0cmVhZG9ubHkgZ2V0TW9kZTogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBnZXRQZXJtaXNzaW9uTGV2ZWw6ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZ2V0TW9kZWxJZDogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBnZXRCcmFuY2g6ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZ2V0Rm9jdXNhYmxlRWxlbWVudHM6ICgpID0+IHJlYWRvbmx5IEhUTUxFbGVtZW50W107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlQXV0b21hdGlvbk1vZGVsSWRlbnRpZmllcihcblx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBQaWNrPElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsICdnZXRMYW5ndWFnZU1vZGVsSWRzJyB8ICdsb29rdXBMYW5ndWFnZU1vZGVsJz4sXG5cdGlkZW50aWZpZXI6IHN0cmluZyxcblx0bG9naWNhbFNlc3Npb25UeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdG1vZGVsVGFyZ2V0OiBzdHJpbmcgfCB1bmRlZmluZWQsXG4pOiBzdHJpbmcge1xuXHRpZiAoIWxvZ2ljYWxTZXNzaW9uVHlwZSB8fCAhbW9kZWxUYXJnZXQpIHtcblx0XHRyZXR1cm4gaWRlbnRpZmllcjtcblx0fVxuXHRjb25zdCBzb3VyY2VNb2RlbCA9IGxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKGlkZW50aWZpZXIpO1xuXHRpZiAoc291cmNlTW9kZWw/LnRhcmdldENoYXRTZXNzaW9uVHlwZSAhPT0gbG9naWNhbFNlc3Npb25UeXBlKSB7XG5cdFx0cmV0dXJuIGlkZW50aWZpZXI7XG5cdH1cblx0cmV0dXJuIGxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRMYW5ndWFnZU1vZGVsSWRzKCkuZmluZChjYW5kaWRhdGVJZGVudGlmaWVyID0+IHtcblx0XHRjb25zdCBjYW5kaWRhdGUgPSBsYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChjYW5kaWRhdGVJZGVudGlmaWVyKTtcblx0XHRyZXR1cm4gY2FuZGlkYXRlPy50YXJnZXRDaGF0U2Vzc2lvblR5cGUgPT09IG1vZGVsVGFyZ2V0ICYmIGNhbmRpZGF0ZS5pZCA9PT0gc291cmNlTW9kZWwuaWQ7XG5cdH0pID8/IGlkZW50aWZpZXI7XG59XG5cbmNvbnN0IEFVVE9NQVRJT05TX0hBUk5FU1NfQ0hJUF9BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJlbmRlckF1dG9tYXRpb25zSGFybmVzc0NoaXAnO1xuY29uc3QgQVVUT01BVElPTlNfV09SS1NQQUNFX1BJQ0tFUl9BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJlbmRlckF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyJztcbmNvbnN0IEFVVE9NQVRJT05TX0lTT0xBVElPTl9HUk9VUF9BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJlbmRlckF1dG9tYXRpb25zSXNvbGF0aW9uR3JvdXAnO1xuXG50eXBlIEJyYW5jaExvYWRTdGF0ZSA9ICdub0ZvbGRlcicgfCAnbG9hZGluZ1JlcG9zaXRvcnknIHwgJ25vUmVwb3NpdG9yeScgfCAnbG9hZGluZ0JyYW5jaGVzJyB8ICdyZWFkeScgfCAnZW1wdHknIHwgJ2Vycm9yJztcblxuZnVuY3Rpb24gc2V0QXV0b21hdGlvbkNvbnRyb2xWaXNpYmxlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSB2aXNpYmxlID8gJycgOiAnbm9uZSc7XG5cdGlmICh2aXNpYmxlKSB7XG5cdFx0Y29udGFpbmVyLnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nKTtcblx0fSBlbHNlIHtcblx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEF1dG9tYXRpb25Jc29sYXRpb25Hcm91cEFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYnJhbmNoUmVwb0Rpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGJyYW5jaFJlcXVlc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXHRwcml2YXRlIGJyYW5jaFJlcXVlc3RJZCA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgYnJhbmNoUGlja2VyOiBCcmFuY2hQaWNrZXI7XG5cdHByaXZhdGUgYnJhbmNoTG9hZFN0YXRlOiBCcmFuY2hMb2FkU3RhdGUgPSAnbm9Gb2xkZXInO1xuXHRwcml2YXRlIHJlcG9zaXRvcnk6IElHaXRSZXBvc2l0b3J5IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGJyYW5jaGVzOiByZWFkb25seSBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIGRldGFjaGVkQ29tbWl0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgd29ya3RyZWVDYXBhYmlsaXR5UmVzb2x2ZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzdGF0ZTogSUZvcm1TdGF0ZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlzb2xhdGlvbk1vZGVsOiBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VGb2xkZXI6IElPYnNlcnZhYmxlPFVSSSB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvbkRpZENoYW5nZVRhcmdldDogRXZlbnQ8dm9pZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZXZhbGlkYXRlOiAoKSA9PiB2b2lkLFxuXHRcdG9wdGlvbnM6IElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlzaWJsZTogSU9ic2VydmFibGU8Ym9vbGVhbj4gfCB1bmRlZmluZWQsXG5cdFx0QElHaXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZ2l0U2VydmljZTogSUdpdFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGlja2VyTG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0dGhpcy5icmFuY2hQaWNrZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCcmFuY2hQaWNrZXIsIHtcblx0XHRcdHVzZXI6ICdhdXRvbWF0aW9uQnJhbmNoUGlja2VyJyxcblx0XHRcdHNsb3RDbGFzc05hbWU6ICdhdXRvbWF0aW9uLWZvcm0tYnJhbmNoLXBpY2tlci1zbG90Jyxcblx0XHRcdHRyaWdnZXJDbGFzc05hbWU6ICdhdXRvbWF0aW9uLWZvcm0tYnJhbmNoLXNsb3QnLFxuXHRcdFx0bGFiZWxDbGFzc05hbWU6ICdhdXRvbWF0aW9uLWZvcm0tYnJhbmNoLW5hbWUnLFxuXHRcdFx0ZGVzY3JpcHRpb25DbGFzc05hbWU6ICdhdXRvbWF0aW9uLWZvcm0tYnJhbmNoLWRlc2NyaXB0aW9uJyxcblx0XHRcdGtlZXBEaXNhYmxlZEZvY3VzYWJsZTogdHJ1ZSxcblx0XHRcdHJlbmRlckRpc2FibGVkQXNTdGF0aWM6IHRydWUsXG5cdFx0XHRhcmlhTGl2ZTogJ3BvbGl0ZScsXG5cdFx0XHRvblNlbGVjdEJyYW5jaDogYnJhbmNoID0+IHtcblx0XHRcdFx0dGhpcy5pc29sYXRpb25Nb2RlbC5zZWxlY3RCcmFuY2goYnJhbmNoKTtcblx0XHRcdFx0dGhpcy5yZW5kZXJCcmFuY2hDb250cm9sKCk7XG5cdFx0XHR9LFxuXHRcdFx0b25SZXRyeTogKCkgPT4ge1xuXHRcdFx0XHR2b2lkIHRoaXMucmVsb2FkUmVwb3NpdG9yeSh0aGlzLmlzb2xhdGlvbk1vZGVsLmZvbGRlclVyaSk7XG5cdFx0XHR9LFxuXHRcdFx0aXNvbGF0aW9uOiB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmlzb2xhdGlvbi53b3JrdHJlZScsIFwiTmV3IFdvcmt0cmVlXCIpLFxuXHRcdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uaXNvbGF0aW9uLmNoZWNrYm94QXJpYUxhYmVsJywgXCJXb3JrdHJlZSBpc29sYXRpb25cIiksXG5cdFx0XHRcdG9uVG9nZ2xlOiBjaGVja2VkID0+IHtcblx0XHRcdFx0XHR0aGlzLmlzb2xhdGlvbk1vZGVsLnNlbGVjdElzb2xhdGlvbk1vZGUoY2hlY2tlZCA/ICd3b3JrdHJlZScgOiAnd29ya3NwYWNlJyk7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJCcmFuY2hDb250cm9sKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuYnJhbmNoUmVwb0Rpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR0aGlzLmNhbmNlbEJyYW5jaFJlcXVlc3QoKTtcblx0XHRET00uY2xlYXJOb2RlKGNvbnRhaW5lcik7XG5cdFx0Y29udGFpbmVyLnN0eWxlLm1hcmdpbkxlZnQgPSAnYXV0byc7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IHRoaXMudmlzaWJsZTtcblx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRzZXRBdXRvbWF0aW9uQ29udHJvbFZpc2libGUoY29udGFpbmVyLCB2aXNpYmxlLnJlYWQocmVhZGVyKSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNvbGF0aW9uR3JvdXAgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnc3Bhbi5hdXRvbWF0aW9uLWZvcm0taXNvbGF0aW9uLWdyb3VwJykpO1xuXHRcdHRoaXMuYnJhbmNoUGlja2VyLnJlbmRlcihpc29sYXRpb25Hcm91cCk7XG5cblx0XHR0aGlzLnJlZnJlc2hUYXJnZXRDYXBhYmlsaXR5KCk7XG5cdFx0dGhpcy5yZW5kZXJCcmFuY2hDb250cm9sKCk7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZm9sZGVyVXJpID0gdGhpcy53b3Jrc3BhY2VGb2xkZXIucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5yZWZyZXNoVGFyZ2V0QW5kUmVuZGVyKCk7XG5cdFx0XHR2b2lkIHRoaXMucmVsb2FkUmVwb3NpdG9yeShmb2xkZXJVcmkpO1xuXHRcdH0pKTtcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkQ2hhbmdlVGFyZ2V0KCgpID0+IHtcblx0XHRcdHRoaXMucmVmcmVzaFRhcmdldEFuZFJlbmRlcigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZCh0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMoKCkgPT4gdGhpcy5yZWZyZXNoVGFyZ2V0QW5kUmVuZGVyKCkpKTtcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZCh7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY2FuY2VsQnJhbmNoUmVxdWVzdCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoVGFyZ2V0Q2FwYWJpbGl0eSgpOiB2b2lkIHtcblx0XHRjb25zdCBmb2xkZXJVcmkgPSB0aGlzLmlzb2xhdGlvbk1vZGVsLmZvbGRlclVyaTtcblx0XHRjb25zdCBzZXNzaW9uVHlwZUlkID0gdGhpcy5zdGF0ZS5zZXNzaW9uVHlwZUlkO1xuXHRcdGlmICghZm9sZGVyVXJpIHx8ICFzZXNzaW9uVHlwZUlkKSB7XG5cdFx0XHR0aGlzLndvcmt0cmVlQ2FwYWJpbGl0eVJlc29sdmVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLmlzb2xhdGlvbk1vZGVsLnNldFN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uKGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvblR5cGVzRm9yRm9sZGVyKGZvbGRlclVyaSkuZmluZChjYW5kaWRhdGUgPT5cblx0XHRcdGNhbmRpZGF0ZS5zZXNzaW9uVHlwZS5pZCA9PT0gc2Vzc2lvblR5cGVJZFxuXHRcdFx0JiYgKHRoaXMuc3RhdGUucHJvdmlkZXJJZCA9PT0gdW5kZWZpbmVkIHx8IGNhbmRpZGF0ZS5wcm92aWRlcklkID09PSB0aGlzLnN0YXRlLnByb3ZpZGVySWQpXG5cdFx0KT8uc2Vzc2lvblR5cGU7XG5cdFx0aWYgKCFzZXNzaW9uVHlwZSkge1xuXHRcdFx0dGhpcy53b3JrdHJlZUNhcGFiaWxpdHlSZXNvbHZlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5pc29sYXRpb25Nb2RlbC5zZXRTdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbihmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMud29ya3RyZWVDYXBhYmlsaXR5UmVzb2x2ZWQgPSB0cnVlO1xuXHRcdGNvbnN0IHN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uID0gc2Vzc2lvblR5cGUuc3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb24gPT09IHRydWU7XG5cdFx0dGhpcy5pc29sYXRpb25Nb2RlbC5zZXRTdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbihzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbik7XG5cdFx0aWYgKCFzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbiAmJiB0aGlzLmlzb2xhdGlvbk1vZGVsLmlzb2xhdGlvbk1vZGUgPT09ICd3b3JrdHJlZScpIHtcblx0XHRcdHRoaXMuaXNvbGF0aW9uTW9kZWwuc2VsZWN0SXNvbGF0aW9uTW9kZSgnd29ya3NwYWNlJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoVGFyZ2V0QW5kUmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMucmVmcmVzaFRhcmdldENhcGFiaWxpdHkoKTtcblx0XHR0aGlzLnJlbmRlckJyYW5jaENvbnRyb2woKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQnJhbmNoQ29udHJvbCgpOiB2b2lkIHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSB0aGlzLmdldEJyYW5jaFByZXNlbnRhdGlvbigpO1xuXHRcdGNvbnN0IGNhbk9wZW4gPSB0aGlzLmNhbk9wZW5CcmFuY2hQaWNrZXIoKTtcblx0XHRjb25zdCBzZWxlY3RlZEJyYW5jaCA9IHRoaXMuaXNvbGF0aW9uTW9kZWwuc2VsZWN0ZWRCcmFuY2ggPz8gdGhpcy5pc29sYXRpb25Nb2RlbC5oZWFkQnJhbmNoO1xuXHRcdGNvbnN0IGJyYW5jaGVzOiBJQnJhbmNoUGlja2VyQnJhbmNoW10gPSB0aGlzLmJyYW5jaGVzLm1hcChicmFuY2ggPT4gKHtcblx0XHRcdG5hbWU6IGJyYW5jaCxcblx0XHRcdHNlbGVjdGVkOiBicmFuY2ggPT09IHNlbGVjdGVkQnJhbmNoLFxuXHRcdH0pKTtcblx0XHRpZiAoc2VsZWN0ZWRCcmFuY2ggJiYgIXRoaXMuYnJhbmNoZXMuaW5jbHVkZXMoc2VsZWN0ZWRCcmFuY2gpKSB7XG5cdFx0XHRicmFuY2hlcy51bnNoaWZ0KHtcblx0XHRcdFx0bmFtZTogc2VsZWN0ZWRCcmFuY2gsXG5cdFx0XHRcdHNlbGVjdGVkOiB0cnVlLFxuXHRcdFx0XHR1bmF2YWlsYWJsZTogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRjb25zdCB3b3JrdHJlZVVuYXZhaWxhYmxlUmVhc29uID0gdGhpcy5nZXRXb3JrdHJlZVVuYXZhaWxhYmxlUmVhc29uKCk7XG5cdFx0Y29uc3QgaXNvbGF0aW9uU3RhdGU6ICdlbmFibGVkJyB8ICdkaXNhYmxlZCcgfCAnaGlkZGVuJyA9XG5cdFx0XHR3b3JrdHJlZVVuYXZhaWxhYmxlUmVhc29uID09PSB1bmRlZmluZWQgPyAnZW5hYmxlZCcgOiAnZGlzYWJsZWQnO1xuXG5cdFx0dGhpcy5icmFuY2hQaWNrZXIudXBkYXRlKHtcblx0XHRcdGxhYmVsOiBwcmVzZW50YXRpb24ubGFiZWwsXG5cdFx0XHRicmFuY2hlcyxcblx0XHRcdHN0YXR1czogdGhpcy5icmFuY2hMb2FkU3RhdGUgPT09ICdsb2FkaW5nUmVwb3NpdG9yeScgfHwgdGhpcy5icmFuY2hMb2FkU3RhdGUgPT09ICdsb2FkaW5nQnJhbmNoZXMnXG5cdFx0XHRcdD8gJ2xvYWRpbmcnXG5cdFx0XHRcdDogdGhpcy5icmFuY2hMb2FkU3RhdGUgPT09ICdlcnJvcidcblx0XHRcdFx0XHQ/ICdlcnJvcidcblx0XHRcdFx0XHQ6IHRoaXMuYnJhbmNoTG9hZFN0YXRlID09PSAncmVhZHknXG5cdFx0XHRcdFx0XHQ/ICdyZWFkeSdcblx0XHRcdFx0XHRcdDogJ2VtcHR5Jyxcblx0XHRcdGNhbk9wZW4sXG5cdFx0XHRkaXNhYmxlZFJlYXNvbjogcHJlc2VudGF0aW9uLnJlYXNvbixcblx0XHRcdG1pc3Npbmc6IHByZXNlbnRhdGlvbi5taXNzaW5nLFxuXHRcdFx0c2hvd0NoZXZyb246IHRoaXMuaXNvbGF0aW9uTW9kZWwuYnJhbmNoUGlja2VyQXZhaWxhYmxlIHx8IHRoaXMuYnJhbmNoTG9hZFN0YXRlID09PSAnZXJyb3InLFxuXHRcdFx0aXNvbGF0aW9uOiB7XG5cdFx0XHRcdGNoZWNrZWQ6IHRoaXMuaXNvbGF0aW9uTW9kZWwuaXNvbGF0aW9uTW9kZSA9PT0gJ3dvcmt0cmVlJyxcblx0XHRcdFx0c3RhdGU6IGlzb2xhdGlvblN0YXRlLFxuXHRcdFx0XHRkaXNhYmxlZFJlYXNvbjogd29ya3RyZWVVbmF2YWlsYWJsZVJlYXNvbixcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0dGhpcy5yZXZhbGlkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEJyYW5jaFByZXNlbnRhdGlvbigpOiB7IHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7IHJlYWRvbmx5IHJlYXNvbjogc3RyaW5nOyByZWFkb25seSBtaXNzaW5nOiBib29sZWFuIH0ge1xuXHRcdGNvbnN0IGRpc3BsYXlCcmFuY2ggPSB0aGlzLmlzb2xhdGlvbk1vZGVsLmRpc3BsYXlCcmFuY2g7XG5cdFx0aWYgKCF0aGlzLmlzb2xhdGlvbk1vZGVsLmZvbGRlclVyaSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLnVua25vd24nLCBcIlx1MjAxNFwiKSxcblx0XHRcdFx0cmVhc29uOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC5ub0ZvbGRlclJlYXNvbicsIFwiU2VsZWN0IGEgZm9sZGVyIHRvIGRldGVybWluZSBpdHMgR2l0IGJyYW5jaC5cIiksXG5cdFx0XHRcdG1pc3Npbmc6IHRydWUsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAoIXRoaXMud29ya3RyZWVDYXBhYmlsaXR5UmVzb2x2ZWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsOiBkaXNwbGF5QnJhbmNoID8/IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLnVua25vd24nLCBcIlx1MjAxNFwiKSxcblx0XHRcdFx0cmVhc29uOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC5jYXBhYmlsaXR5TG9hZGluZ1JlYXNvbicsIFwiU2Vzc2lvbiBjYXBhYmlsaXRpZXMgYXJlIGxvYWRpbmcuXCIpLFxuXHRcdFx0XHRtaXNzaW5nOiAhZGlzcGxheUJyYW5jaCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmICghdGhpcy5pc29sYXRpb25Nb2RlbC5zdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbikge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IGRpc3BsYXlCcmFuY2ggPz8gbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2gudW5rbm93bicsIFwiXHUyMDE0XCIpLFxuXHRcdFx0XHRyZWFzb246IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLnVuc3VwcG9ydGVkUmVhc29uJywgXCJUaGUgc2VsZWN0ZWQgc2Vzc2lvbiB0eXBlIGRvZXMgbm90IHN1cHBvcnQgV29ya3RyZWUgYnJhbmNoIGNvbmZpZ3VyYXRpb24uXCIpLFxuXHRcdFx0XHRtaXNzaW5nOiAhZGlzcGxheUJyYW5jaCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmICh0aGlzLmJyYW5jaExvYWRTdGF0ZSA9PT0gJ2Vycm9yJykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IGRpc3BsYXlCcmFuY2ggPz8gbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2gubG9hZEVycm9yJywgXCJVbmFibGUgdG8gbG9hZCBicmFuY2hlc1wiKSxcblx0XHRcdFx0cmVhc29uOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC5sb2FkRXJyb3JSZWFzb24nLCBcIk9wZW4gdGhlIGJyYW5jaCBwaWNrZXIgdG8gcmV0cnkgbG9hZGluZyBsb2NhbCBicmFuY2hlcy5cIiksXG5cdFx0XHRcdG1pc3Npbmc6ICFkaXNwbGF5QnJhbmNoLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuaXNvbGF0aW9uTW9kZWwuaXNvbGF0aW9uTW9kZSAhPT0gJ3dvcmt0cmVlJykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IGRpc3BsYXlCcmFuY2ggPz8gdGhpcy5kZXRhY2hlZENvbW1pdCA/PyBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC51bmtub3duJywgXCJcdTIwMTRcIiksXG5cdFx0XHRcdHJlYXNvbjogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2guZm9sZGVyTW9kZVJlYXNvbicsIFwiU2VsZWN0IFdvcmt0cmVlIHRvIGNob29zZSBhIGJyYW5jaC5cIiksXG5cdFx0XHRcdG1pc3Npbmc6ICFkaXNwbGF5QnJhbmNoICYmICF0aGlzLmRldGFjaGVkQ29tbWl0LFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0c3dpdGNoICh0aGlzLmJyYW5jaExvYWRTdGF0ZSkge1xuXHRcdFx0Y2FzZSAnbG9hZGluZ1JlcG9zaXRvcnknOlxuXHRcdFx0Y2FzZSAnbG9hZGluZ0JyYW5jaGVzJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRsYWJlbDogZGlzcGxheUJyYW5jaCA/PyBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC5sb2FkaW5nJywgXCJMb2FkaW5nIGJyYW5jaGVzXHUyMDI2XCIpLFxuXHRcdFx0XHRcdHJlYXNvbjogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2gubG9hZGluZ1JlYXNvbicsIFwiTG9jYWwgYnJhbmNoZXMgYXJlIGxvYWRpbmcuXCIpLFxuXHRcdFx0XHRcdG1pc3Npbmc6ICFkaXNwbGF5QnJhbmNoLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAnbm9SZXBvc2l0b3J5Jzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRsYWJlbDogZGlzcGxheUJyYW5jaCA/PyBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC5ub1JlcG8nLCBcIm5vIGdpdCByZXBvXCIpLFxuXHRcdFx0XHRcdHJlYXNvbjogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2gubm9SZXBvUmVhc29uJywgXCJObyBHaXQgcmVwb3NpdG9yeSB3YXMgZm91bmQgZm9yIHRoZSBzZWxlY3RlZCBmb2xkZXIuXCIpLFxuXHRcdFx0XHRcdG1pc3Npbmc6ICFkaXNwbGF5QnJhbmNoLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAnZW1wdHknOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxhYmVsOiBkaXNwbGF5QnJhbmNoID8/IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLm5vQnJhbmNoZXMnLCBcIk5vIGxvY2FsIGJyYW5jaGVzXCIpLFxuXHRcdFx0XHRcdHJlYXNvbjogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2gubm9CcmFuY2hlc1JlYXNvbicsIFwiTm8gbG9jYWwgYnJhbmNoZXMgd2VyZSBmb3VuZCBpbiB0aGlzIHJlcG9zaXRvcnkuXCIpLFxuXHRcdFx0XHRcdG1pc3Npbmc6ICFkaXNwbGF5QnJhbmNoLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAncmVhZHknOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxhYmVsOiBkaXNwbGF5QnJhbmNoID8/IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLnNlbGVjdCcsIFwiU2VsZWN0IGJyYW5jaFwiKSxcblx0XHRcdFx0XHRyZWFzb246IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLmNob29zZVJlYXNvbicsIFwiQ2hvb3NlIHRoZSBsb2NhbCBicmFuY2ggdG8gdXNlIGFzIHRoZSBXb3JrdHJlZSBiYXNlLlwiKSxcblx0XHRcdFx0XHRtaXNzaW5nOiAhZGlzcGxheUJyYW5jaCxcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgJ25vRm9sZGVyJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2gudW5rbm93bicsIFwiXHUyMDE0XCIpLFxuXHRcdFx0XHRcdHJlYXNvbjogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2gubm9Gb2xkZXJSZWFzb24nLCBcIlNlbGVjdCBhIGZvbGRlciB0byBkZXRlcm1pbmUgaXRzIEdpdCBicmFuY2guXCIpLFxuXHRcdFx0XHRcdG1pc3Npbmc6IHRydWUsXG5cdFx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjYW5PcGVuQnJhbmNoUGlja2VyKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmJyYW5jaExvYWRTdGF0ZSA9PT0gJ2Vycm9yJykge1xuXHRcdFx0cmV0dXJuICEhdGhpcy5pc29sYXRpb25Nb2RlbC5mb2xkZXJVcmkgJiYgdGhpcy53b3JrdHJlZUNhcGFiaWxpdHlSZXNvbHZlZCAmJiB0aGlzLmlzb2xhdGlvbk1vZGVsLnN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5pc29sYXRpb25Nb2RlbC5icmFuY2hQaWNrZXJBdmFpbGFibGVcblx0XHRcdCYmIHRoaXMuYnJhbmNoTG9hZFN0YXRlICE9PSAnbm9Gb2xkZXInXG5cdFx0XHQmJiB0aGlzLmJyYW5jaExvYWRTdGF0ZSAhPT0gJ25vUmVwb3NpdG9yeSdcblx0XHRcdCYmIHRoaXMuYnJhbmNoTG9hZFN0YXRlICE9PSAnbG9hZGluZ1JlcG9zaXRvcnknXG5cdFx0XHQmJiB0aGlzLmJyYW5jaExvYWRTdGF0ZSAhPT0gJ2xvYWRpbmdCcmFuY2hlcyc7XG5cdH1cblxuXHRwcml2YXRlIGdldFdvcmt0cmVlVW5hdmFpbGFibGVSZWFzb24oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuaXNvbGF0aW9uTW9kZWwuZm9sZGVyVXJpKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5pc29sYXRpb24ud29ya3RyZWVOb0ZvbGRlcicsIFwiU2VsZWN0IGEgZm9sZGVyIHRvIHVzZSBXb3JrdHJlZSBpc29sYXRpb24uXCIpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMud29ya3RyZWVDYXBhYmlsaXR5UmVzb2x2ZWQpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC5jYXBhYmlsaXR5TG9hZGluZ1JlYXNvbicsIFwiU2Vzc2lvbiBjYXBhYmlsaXRpZXMgYXJlIGxvYWRpbmcuXCIpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuaXNvbGF0aW9uTW9kZWwuc3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmlzb2xhdGlvbi53b3JrdHJlZVVuYXZhaWxhYmxlJywgXCJOb3Qgc3VwcG9ydGVkIGJ5IHRoZSBzZWxlY3RlZCBzZXNzaW9uIHR5cGVcIik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmlzb2xhdGlvbk1vZGVsLnNlbGVjdGVkQnJhbmNoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRzd2l0Y2ggKHRoaXMuYnJhbmNoTG9hZFN0YXRlKSB7XG5cdFx0XHRjYXNlICdsb2FkaW5nUmVwb3NpdG9yeSc6XG5cdFx0XHRjYXNlICdsb2FkaW5nQnJhbmNoZXMnOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2gubG9hZGluZ1JlYXNvbicsIFwiTG9jYWwgYnJhbmNoZXMgYXJlIGxvYWRpbmcuXCIpO1xuXHRcdFx0Y2FzZSAnbm9SZXBvc2l0b3J5Jzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLm5vUmVwb1JlYXNvbicsIFwiTm8gR2l0IHJlcG9zaXRvcnkgd2FzIGZvdW5kIGZvciB0aGUgc2VsZWN0ZWQgZm9sZGVyLlwiKTtcblx0XHRcdGNhc2UgJ2Vycm9yJzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLmxvYWRFcnJvclJlYXNvbicsIFwiT3BlbiB0aGUgYnJhbmNoIHBpY2tlciB0byByZXRyeSBsb2FkaW5nIGxvY2FsIGJyYW5jaGVzLlwiKTtcblx0XHRcdGNhc2UgJ2VtcHR5Jzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLm5vQnJhbmNoZXNSZWFzb24nLCBcIk5vIGxvY2FsIGJyYW5jaGVzIHdlcmUgZm91bmQgaW4gdGhpcyByZXBvc2l0b3J5LlwiKTtcblx0XHRcdGNhc2UgJ3JlYWR5Jzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuYnJhbmNoZXMubGVuZ3RoID4gMFxuXHRcdFx0XHRcdD8gdW5kZWZpbmVkXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC5ub0JyYW5jaGVzUmVhc29uJywgXCJObyBsb2NhbCBicmFuY2hlcyB3ZXJlIGZvdW5kIGluIHRoaXMgcmVwb3NpdG9yeS5cIik7XG5cdFx0XHRjYXNlICdub0ZvbGRlcic6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmlzb2xhdGlvbi53b3JrdHJlZU5vRm9sZGVyJywgXCJTZWxlY3QgYSBmb2xkZXIgdG8gdXNlIFdvcmt0cmVlIGlzb2xhdGlvbi5cIik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjYW5jZWxCcmFuY2hSZXF1ZXN0KCk6IHZvaWQge1xuXHRcdHRoaXMuYnJhbmNoUmVxdWVzdC52YWx1ZT8uY2FuY2VsKCk7XG5cdFx0dGhpcy5icmFuY2hSZXF1ZXN0LmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbG9hZFJlcG9zaXRvcnkoZm9sZGVyOiBVUkkgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXF1ZXN0SWQgPSArK3RoaXMuYnJhbmNoUmVxdWVzdElkO1xuXHRcdHRoaXMuY2FuY2VsQnJhbmNoUmVxdWVzdCgpO1xuXHRcdHRoaXMuYnJhbmNoUmVwb0Rpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR0aGlzLnJlcG9zaXRvcnkgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5icmFuY2hlcyA9IFtdO1xuXHRcdHRoaXMuZGV0YWNoZWRDb21taXQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKCFmb2xkZXIpIHtcblx0XHRcdHRoaXMuYnJhbmNoTG9hZFN0YXRlID0gJ25vRm9sZGVyJztcblx0XHRcdHRoaXMuaXNvbGF0aW9uTW9kZWwuc2V0SGVhZEJyYW5jaCh1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5yZW5kZXJCcmFuY2hDb250cm9sKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuYnJhbmNoTG9hZFN0YXRlID0gJ2xvYWRpbmdSZXBvc2l0b3J5Jztcblx0XHR0aGlzLnJlbmRlckJyYW5jaENvbnRyb2woKTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLmJyYW5jaFJlcXVlc3QudmFsdWUgPSBjdHM7XG5cdFx0bGV0IHJlcG86IElHaXRSZXBvc2l0b3J5IHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXBvID0gYXdhaXQgdGhpcy5naXRTZXJ2aWNlLm9wZW5SZXBvc2l0b3J5KGZvbGRlcik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChyZXF1ZXN0SWQgIT09IHRoaXMuYnJhbmNoUmVxdWVzdElkIHx8IGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnBpY2tlckxvZ1NlcnZpY2UuZXJyb3IoJ1tBdXRvbWF0aW9uRGlhbG9nXSBGYWlsZWQgdG8gb3BlbiBHaXQgcmVwb3NpdG9yeSBmb3IgYnJhbmNoIHNlbGVjdGlvbi4nLCBlcnJvcik7XG5cdFx0XHR0aGlzLmJyYW5jaExvYWRTdGF0ZSA9ICdlcnJvcic7XG5cdFx0XHR0aGlzLnJlbmRlckJyYW5jaENvbnRyb2woKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHJlcXVlc3RJZCAhPT0gdGhpcy5icmFuY2hSZXF1ZXN0SWQgfHwgY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghcmVwbykge1xuXHRcdFx0dGhpcy5icmFuY2hMb2FkU3RhdGUgPSAnbm9SZXBvc2l0b3J5Jztcblx0XHRcdHRoaXMucmVuZGVyQnJhbmNoQ29udHJvbCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnJlcG9zaXRvcnkgPSByZXBvO1xuXHRcdGNvbnN0IHdhdGNoZXIgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0d2F0Y2hlci5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaGVhZCA9IHJlcG8uc3RhdGUucmVhZChyZWFkZXIpLkhFQUQ7XG5cdFx0XHRpZiAoaGVhZD8uY29tbWl0ICYmIGhlYWQubmFtZSkge1xuXHRcdFx0XHR0aGlzLmRldGFjaGVkQ29tbWl0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLmlzb2xhdGlvbk1vZGVsLnNldEhlYWRCcmFuY2goaGVhZC5uYW1lKTtcblx0XHRcdH0gZWxzZSBpZiAoaGVhZD8uY29tbWl0KSB7XG5cdFx0XHRcdHRoaXMuZGV0YWNoZWRDb21taXQgPSBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC5kZXRhY2hlZCcsIFwiKHswfSlcIiwgaGVhZC5jb21taXQuc2xpY2UoMCwgNykpO1xuXHRcdFx0XHR0aGlzLmlzb2xhdGlvbk1vZGVsLnNldEhlYWRCcmFuY2godW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZGV0YWNoZWRDb21taXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuaXNvbGF0aW9uTW9kZWwuc2V0SGVhZEJyYW5jaCh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZW5kZXJCcmFuY2hDb250cm9sKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuYnJhbmNoUmVwb0Rpc3Bvc2FibGUudmFsdWUgPSB3YXRjaGVyO1xuXHRcdHRoaXMuYnJhbmNoTG9hZFN0YXRlID0gJ2xvYWRpbmdCcmFuY2hlcyc7XG5cdFx0dGhpcy5yZW5kZXJCcmFuY2hDb250cm9sKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlZnMgPSBhd2FpdCByZXBvLmdldFJlZnMoeyBwYXR0ZXJuOiAncmVmcy9oZWFkcycgfSwgY3RzLnRva2VuKTtcblx0XHRcdGlmIChyZXF1ZXN0SWQgIT09IHRoaXMuYnJhbmNoUmVxdWVzdElkIHx8IGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCB0aGlzLnJlcG9zaXRvcnkgIT09IHJlcG8pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5icmFuY2hlcyA9IG5vcm1hbGl6ZUF1dG9tYXRpb25CcmFuY2hOYW1lcyhyZWZzLm1hcChyZWYgPT4gcmVmLm5hbWUpKTtcblx0XHRcdHRoaXMuYnJhbmNoTG9hZFN0YXRlID0gdGhpcy5icmFuY2hlcy5sZW5ndGggPiAwID8gJ3JlYWR5JyA6ICdlbXB0eSc7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChyZXF1ZXN0SWQgIT09IHRoaXMuYnJhbmNoUmVxdWVzdElkIHx8IGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnBpY2tlckxvZ1NlcnZpY2UuZXJyb3IoJ1tBdXRvbWF0aW9uRGlhbG9nXSBGYWlsZWQgdG8gbG9hZCBsb2NhbCBicmFuY2hlcy4nLCBlcnJvcik7XG5cdFx0XHR0aGlzLmJyYW5jaExvYWRTdGF0ZSA9ICdlcnJvcic7XG5cdFx0fVxuXHRcdHRoaXMucmVuZGVyQnJhbmNoQ29udHJvbCgpO1xuXHR9XG59XG5cbi8qKlxuICogUmVuZGVycyBhIGRpYWxvZy1vd25lZCBwaWNrZXIgaW50byBhIGNoYXQgaW5wdXQgc2Vjb25kYXJ5LXRvb2xiYXIgc2xvdC4gVGhlXG4gKiBwaWNrZXIgaW5zdGFuY2UgaXMgb3duZWQgYnkgdGhlIGRpYWxvZyAocmVnaXN0ZXJlZCBvbiBpdHMgZGlzcG9zYWJsZXMpOyB0aGlzXG4gKiB2aWV3IGl0ZW0gb25seSBpbmplY3RzIHRoZSBwaWNrZXIncyBET00gaW50byB0aGUgdG9vbGJhciBjb250YWluZXIgdmlhIHRoZVxuICogc3VwcGxpZWQge0BsaW5rIHJlbmRlclBpY2tlcn0gY2FsbGJhY2suXG4gKi9cbmNsYXNzIEF1dG9tYXRpb25QaWNrZXJBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgdmlzaWJpbGl0eVdhdGNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJQaWNrZXI6IChjb250YWluZXI6IEhUTUxFbGVtZW50KSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlzaWJsZTogSU9ic2VydmFibGU8Ym9vbGVhbj4gfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9ucz86IElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdERPTS5jbGVhck5vZGUoY29udGFpbmVyKTtcblx0XHR0aGlzLnJlbmRlclBpY2tlcihjb250YWluZXIpO1xuXHRcdGNvbnN0IHZpc2libGUgPSB0aGlzLnZpc2libGU7XG5cdFx0dGhpcy52aXNpYmlsaXR5V2F0Y2gudmFsdWUgPSB2aXNpYmxlID8gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0c2V0QXV0b21hdGlvbkNvbnRyb2xWaXNpYmxlKGNvbnRhaW5lciwgdmlzaWJsZS5yZWFkKHJlYWRlcikpO1xuXHRcdH0pIDogdW5kZWZpbmVkO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBPcGVuQXV0b21hdGlvbnNIYXJuZXNzQ2hpcEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQVVUT01BVElPTlNfSEFSTkVTU19DSElQX0FDVElPTl9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2F1dG9tYXRpb24uZm9ybS5oYXJuZXNzQ2hpcC5hY3Rpb24nLCBcIkF1dG9tYXRpb25zIEhhcm5lc3MgQ2hpcFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IC0xLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuaW5BdXRvbWF0aW9uc0RpYWxvZyxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4geyAvKiBoYW5kbGVkIGJ5IGFjdGlvbiB2aWV3IGl0ZW0gKi8gfVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBPcGVuQXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFVVE9NQVRJT05TX1dPUktTUEFDRV9QSUNLRVJfQUNUSU9OX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYXV0b21hdGlvbi5mb3JtLndvcmtzcGFjZVBpY2tlci5hY3Rpb24nLCBcIkF1dG9tYXRpb25zIFdvcmtzcGFjZSBQaWNrZXJcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuaW5BdXRvbWF0aW9uc0RpYWxvZyxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4geyAvKiBoYW5kbGVkIGJ5IGFjdGlvbiB2aWV3IGl0ZW0gKi8gfVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBPcGVuQXV0b21hdGlvbnNJc29sYXRpb25Hcm91cEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQVVUT01BVElPTlNfSVNPTEFUSU9OX0dST1VQX0FDVElPTl9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2F1dG9tYXRpb24uZm9ybS5pc29sYXRpb25Hcm91cC5hY3Rpb24nLCBcIkF1dG9tYXRpb25zIElzb2xhdGlvbiBHcm91cFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5pbkF1dG9tYXRpb25zRGlhbG9nLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7IC8qIGhhbmRsZWQgYnkgYWN0aW9uIHZpZXcgaXRlbSAqLyB9XG59KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckZvcm0oXG5cdGZvcm06IEhUTUxFbGVtZW50LFxuXHRzdGF0ZTogSUZvcm1TdGF0ZSxcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0dmFsaWRhdGlvbjogSVZhbGlkYXRpb25TdGF0ZSxcblx0cmV2YWxpZGF0ZTogKCkgPT4gdm9pZCxcblx0aW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0Y29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0Y29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0cHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdHdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHRpbml0aWFsUHJvbXB0OiBzdHJpbmcsXG5cdGluaXRpYWxNb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdGluaXRpYWxQZXJtaXNzaW9uTGV2ZWw6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0aW5pdGlhbE1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcbik6IElSZW5kZXJGb3JtSGFuZGxlIHtcblx0Y29uc3QgbmFtZVJvdyA9IERPTS5hcHBlbmQoZm9ybSwgJCgnLmF1dG9tYXRpb24tZm9ybS1yb3cnKSk7XG5cdERPTS5hcHBlbmQobmFtZVJvdywgJCgnc3Bhbi5hdXRvbWF0aW9uLWZvcm0tbGFiZWwnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0ubmFtZScsIFwiTmFtZVwiKSkpO1xuXHRjb25zdCBuYW1lSW5wdXRDb250YWluZXIgPSBET00uYXBwZW5kKG5hbWVSb3csICQoJy5hdXRvbWF0aW9uLWZvcm0taW5wdXQtaG9zdCcpKTtcblx0Y29uc3QgbmFtZUlucHV0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbnB1dEJveChuYW1lSW5wdXRDb250YWluZXIsIGNvbnRleHRWaWV3U2VydmljZSwge1xuXHRcdGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXMsXG5cdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0ubmFtZVBsYWNlaG9sZGVyJywgXCJlLmcuIE1vcm5pbmcgc3RhbmR1cCBub3Rlc1wiKSxcblx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0ubmFtZScsIFwiTmFtZVwiKSxcblx0fSkpO1xuXHRuYW1lSW5wdXQudmFsdWUgPSBzdGF0ZS5uYW1lO1xuXHRkaXNwb3NhYmxlcy5hZGQobmFtZUlucHV0Lm9uRGlkQ2hhbmdlKHZhbHVlID0+IHtcblx0XHRzdGF0ZS5uYW1lID0gdmFsdWU7XG5cdFx0cmV2YWxpZGF0ZSgpO1xuXHR9KSk7XG5cblx0Y29uc3Qgc2NoZWR1bGVSb3cgPSBET00uYXBwZW5kKGZvcm0sICQoJy5hdXRvbWF0aW9uLWZvcm0tcm93LmF1dG9tYXRpb24tZm9ybS1zY2hlZHVsZS1yb3cnKSk7XG5cdGNvbnN0IHVzZUN1c3RvbURyYXduID0gIWhhc05hdGl2ZUNvbnRleHRNZW51KGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRjb25zdCBpbnRlcnZhbEdyb3VwID0gRE9NLmFwcGVuZChzY2hlZHVsZVJvdywgJCgnLmF1dG9tYXRpb24tZm9ybS1zY2hlZHVsZS1ncm91cCcpKTtcblx0RE9NLmFwcGVuZChpbnRlcnZhbEdyb3VwLCAkKCdsYWJlbC5hdXRvbWF0aW9uLWZvcm0tbGFiZWwnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uaW50ZXJ2YWwnLCBcIlNjaGVkdWxlXCIpKSk7XG5cdGNvbnN0IGludGVydmFsT3B0aW9uczogSVNlbGVjdE9wdGlvbkl0ZW1bXSA9IElOVEVSVkFMUy5tYXAoaXRlbSA9PiAoeyB0ZXh0OiBpdGVtLmxhYmVsIH0pKTtcblx0Y29uc3QgaW50ZXJ2YWxJbmRleCA9IE1hdGgubWF4KDAsIElOVEVSVkFMUy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtLnZhbHVlID09PSBzdGF0ZS5pbnRlcnZhbCkpO1xuXHRjb25zdCBpbnRlcnZhbFNlbGVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2VsZWN0Qm94KFxuXHRcdGludGVydmFsT3B0aW9ucyxcblx0XHRpbnRlcnZhbEluZGV4LFxuXHRcdGNvbnRleHRWaWV3U2VydmljZSxcblx0XHRkZWZhdWx0U2VsZWN0Qm94U3R5bGVzLFxuXHRcdHsgYXJpYUxhYmVsOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmludGVydmFsJywgXCJTY2hlZHVsZVwiKSwgdXNlQ3VzdG9tRHJhd24gfSxcblx0KSk7XG5cdGNvbnN0IGludGVydmFsU2VsZWN0Q29udGFpbmVyID0gRE9NLmFwcGVuZChpbnRlcnZhbEdyb3VwLCAkKCcuYXV0b21hdGlvbi1mb3JtLXNjaGVkdWxlLXNlbGVjdC1jb250YWluZXInKSk7XG5cdGludGVydmFsU2VsZWN0LnJlbmRlcihpbnRlcnZhbFNlbGVjdENvbnRhaW5lcik7XG5cblx0Y29uc3QgdGltZUdyb3VwID0gRE9NLmFwcGVuZChzY2hlZHVsZVJvdywgJCgnLmF1dG9tYXRpb24tZm9ybS1zY2hlZHVsZS1ncm91cC5hdXRvbWF0aW9uLWZvcm0tdGltZS1ncm91cCcpKTtcblx0RE9NLmFwcGVuZCh0aW1lR3JvdXAsICQoJ2xhYmVsLmF1dG9tYXRpb24tZm9ybS1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS50aW1lJywgXCJUaW1lXCIpKSk7XG5cdGNvbnN0IHRpbWVPcHRpb25zID0gYnVpbGRUaW1lT3B0aW9ucygpO1xuXHRjb25zdCBpbml0aWFsVGltZUluZGV4ID0gbmVhcmVzdFRpbWVPcHRpb25JbmRleChzdGF0ZS5ob3VyLCBzdGF0ZS5taW51dGUpO1xuXHRzdGF0ZS5ob3VyID0gdGltZU9wdGlvbnNbaW5pdGlhbFRpbWVJbmRleF0uaG91cjtcblx0c3RhdGUubWludXRlID0gdGltZU9wdGlvbnNbaW5pdGlhbFRpbWVJbmRleF0ubWludXRlO1xuXHRjb25zdCB0aW1lU2VsZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZWxlY3RCb3goXG5cdFx0dGltZU9wdGlvbnMubWFwKG9wdCA9PiAoeyB0ZXh0OiBvcHQubGFiZWwgfSBzYXRpc2ZpZXMgSVNlbGVjdE9wdGlvbkl0ZW0pKSxcblx0XHRpbml0aWFsVGltZUluZGV4LFxuXHRcdGNvbnRleHRWaWV3U2VydmljZSxcblx0XHRkZWZhdWx0U2VsZWN0Qm94U3R5bGVzLFxuXHRcdHsgYXJpYUxhYmVsOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLnRpbWUnLCBcIlRpbWVcIiksIHVzZUN1c3RvbURyYXduIH0sXG5cdCkpO1xuXHRjb25zdCB0aW1lU2VsZWN0Q29udGFpbmVyID0gRE9NLmFwcGVuZCh0aW1lR3JvdXAsICQoJy5hdXRvbWF0aW9uLWZvcm0tc2NoZWR1bGUtc2VsZWN0LWNvbnRhaW5lci5hdXRvbWF0aW9uLWZvcm0tdGltZS1zZWxlY3QtY29udGFpbmVyJykpO1xuXHR0aW1lU2VsZWN0LnJlbmRlcih0aW1lU2VsZWN0Q29udGFpbmVyKTtcblx0ZGlzcG9zYWJsZXMuYWRkKHRpbWVTZWxlY3Qub25EaWRTZWxlY3QoZSA9PiB7XG5cdFx0Y29uc3Qgb3B0ID0gdGltZU9wdGlvbnNbZS5pbmRleF07XG5cdFx0c3RhdGUuaG91ciA9IG9wdC5ob3VyO1xuXHRcdHN0YXRlLm1pbnV0ZSA9IG9wdC5taW51dGU7XG5cdH0pKTtcblxuXHRjb25zdCBkYXlHcm91cCA9IERPTS5hcHBlbmQoc2NoZWR1bGVSb3csICQoJy5hdXRvbWF0aW9uLWZvcm0tc2NoZWR1bGUtZ3JvdXAuYXV0b21hdGlvbi1mb3JtLWRheS1ncm91cCcpKTtcblx0RE9NLmFwcGVuZChkYXlHcm91cCwgJCgnbGFiZWwuYXV0b21hdGlvbi1mb3JtLWxhYmVsJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmRheScsIFwiRGF5IG9mIHdlZWtcIikpKTtcblx0Y29uc3QgZGF5T3B0aW9uczogSVNlbGVjdE9wdGlvbkl0ZW1bXSA9IERBWVNfT0ZfV0VFSy5tYXAoZCA9PiAoeyB0ZXh0OiBkIH0pKTtcblx0Y29uc3QgZGF5U2VsZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZWxlY3RCb3goXG5cdFx0ZGF5T3B0aW9ucyxcblx0XHRNYXRoLm1pbihNYXRoLm1heChzdGF0ZS5kYXksIDApLCBEQVlTX09GX1dFRUsubGVuZ3RoIC0gMSksXG5cdFx0Y29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdGRlZmF1bHRTZWxlY3RCb3hTdHlsZXMsXG5cdFx0eyBhcmlhTGFiZWw6IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uZGF5JywgXCJEYXkgb2Ygd2Vla1wiKSwgdXNlQ3VzdG9tRHJhd24gfSxcblx0KSk7XG5cdGNvbnN0IGRheVNlbGVjdENvbnRhaW5lciA9IERPTS5hcHBlbmQoZGF5R3JvdXAsICQoJy5hdXRvbWF0aW9uLWZvcm0tc2NoZWR1bGUtc2VsZWN0LWNvbnRhaW5lcicpKTtcblx0ZGF5U2VsZWN0LnJlbmRlcihkYXlTZWxlY3RDb250YWluZXIpO1xuXHRkaXNwb3NhYmxlcy5hZGQoZGF5U2VsZWN0Lm9uRGlkU2VsZWN0KGUgPT4ge1xuXHRcdHN0YXRlLmRheSA9IGUuaW5kZXg7XG5cdH0pKTtcblxuXHRjb25zdCBhcHBseUludGVydmFsVmlzaWJpbGl0eSA9ICgpID0+IHtcblx0XHRjb25zdCBzaG93VGltZSA9IHN0YXRlLmludGVydmFsID09PSAnZGFpbHknIHx8IHN0YXRlLmludGVydmFsID09PSAnd2Vla2x5Jztcblx0XHRjb25zdCBzaG93RGF5ID0gc3RhdGUuaW50ZXJ2YWwgPT09ICd3ZWVrbHknO1xuXHRcdHRpbWVHcm91cC5zdHlsZS5kaXNwbGF5ID0gc2hvd1RpbWUgPyAnJyA6ICdub25lJztcblx0XHRkYXlHcm91cC5zdHlsZS5kaXNwbGF5ID0gc2hvd0RheSA/ICcnIDogJ25vbmUnO1xuXHR9O1xuXHRhcHBseUludGVydmFsVmlzaWJpbGl0eSgpO1xuXHRkaXNwb3NhYmxlcy5hZGQoaW50ZXJ2YWxTZWxlY3Qub25EaWRTZWxlY3QoZSA9PiB7XG5cdFx0c3RhdGUuaW50ZXJ2YWwgPSBJTlRFUlZBTFNbZS5pbmRleF0udmFsdWU7XG5cdFx0YXBwbHlJbnRlcnZhbFZpc2liaWxpdHkoKTtcblx0fSkpO1xuXG5cdC8vIFRoZSBwaWNrZXIgaXMgYXV0aG9yaXRhdGl2ZSBmb3IgdGhlIHNlc3Npb24gdHlwZVxuXHRjb25zdCBpc29sYXRpb25Nb2RlbCA9IG5ldyBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwoc3RhdGUpO1xuXHRjb25zdCB3b3Jrc3BhY2VDb250cm9sc1Zpc2libGUgPSBkZXJpdmVkKHJlYWRlciA9PiAhaXNvbGF0aW9uTW9kZWwuaXNRdWlja0NoYXRPYnMucmVhZChyZWFkZXIpKTtcblx0Y29uc3Qgc2Vzc2lvblR5cGVQaWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9iaWxlU2Vzc2lvblR5cGVQaWNrZXIsIGNvbnN0T2JzZXJ2YWJsZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4odW5kZWZpbmVkKSwgeyBwZXJzaXN0U2VsZWN0aW9uOiBmYWxzZSwgdGVsZW1ldHJ5U291cmNlOiAnQXV0b21hdGlvblNlc3Npb25UeXBlUGlja2VyJywgc2hvd0NoZXZyb246IGZhbHNlIH0pKTtcblx0c2Vzc2lvblR5cGVQaWNrZXIuc2V0UXVpY2tDaGF0U291cmNlKGlzb2xhdGlvbk1vZGVsLmlzUXVpY2tDaGF0T2JzKTtcblx0c2Vzc2lvblR5cGVQaWNrZXIuc2V0Rm9sZGVyU291cmNlKGlzb2xhdGlvbk1vZGVsLmZvbGRlclVyaU9icywge1xuXHRcdGluaXRpYWxQaWNrOiBzdGF0ZS5zZXNzaW9uVHlwZUlkXG5cdFx0XHQ/IHsgcHJvdmlkZXJJZDogc3RhdGUucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogc3RhdGUuc2Vzc2lvblR5cGVJZCB9XG5cdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRwcmVzZXJ2ZVVuYXZhaWxhYmxlSW5pdGlhbFBpY2s6IHRydWUsXG5cdH0pO1xuXHQvLyBUaGUgZGlhbG9nIGhhcyBubyBzZXNzaW9uLCBzbyB0aGUgaW5wdXQgcGFydCByZWFkcyB0aGUgYWN0aXZlIHNlc3Npb24gdHlwZSBmcm9tIHRoZSBwaWNrZXIgdmlhIHRoaXMgZGVsZWdhdGUuXG5cdGNvbnN0IG9uRGlkQ2hhbmdlU2Vzc2lvblR5cGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8QWdlbnRTZXNzaW9uVGFyZ2V0PigpKTtcblx0Y29uc3Qgb25EaWRDaGFuZ2VTZXNzaW9uVGFyZ2V0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRjb25zdCBzZXNzaW9uVHlwZURlbGVnYXRlOiBJU2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZSA9IHtcblx0XHRnZXRBY3RpdmVTZXNzaW9uUHJvdmlkZXI6ICgpID0+IHNlc3Npb25UeXBlUGlja2VyLm1vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlLmdldCgpLFxuXHRcdG9uRGlkQ2hhbmdlQWN0aXZlU2Vzc2lvblByb3ZpZGVyOiBvbkRpZENoYW5nZVNlc3Npb25UeXBlLmV2ZW50LFxuXHR9O1xuXHRjb25zdCBzeW5jU3RhdGVGcm9tUGlja2VyID0gKCkgPT4ge1xuXHRcdGNvbnN0IHBpY2sgPSBzZXNzaW9uVHlwZVBpY2tlci5zZWxlY3RlZFBpY2s7XG5cdFx0c3RhdGUucHJvdmlkZXJJZCA9IHBpY2s/LnByb3ZpZGVySWQ7XG5cdFx0c3RhdGUuc2Vzc2lvblR5cGVJZCA9IHBpY2s/LnNlc3Npb25UeXBlSWQ7XG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9uVGFyZ2V0LmZpcmUoKTtcblx0fTtcblx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRjb25zdCBtb2RlbFRhcmdldCA9IHNlc3Npb25UeXBlUGlja2VyLm1vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAobW9kZWxUYXJnZXQpIHtcblx0XHRcdG9uRGlkQ2hhbmdlU2Vzc2lvblR5cGUuZmlyZShtb2RlbFRhcmdldCk7XG5cdFx0fVxuXHR9KSk7XG5cdC8vIFNlZWQgc3RhdGUgZnJvbSB0aGUgcGlja2VyJ3MgaW5pdGlhbCBkZWZhdWx0IChlZGl0OiBzYXZlZCB0eXBlOyBjcmVhdGU6IGZvbGRlciBkZWZhdWx0KS5cblx0c3luY1N0YXRlRnJvbVBpY2tlcigpO1xuXHQvLyBDb3ZlcnMgYm90aCBleHBsaWNpdCB1c2VyIHBpY2tzIGFuZCByZWNvbXB1dGVzIChlLmcuIGFuIGFnZW50IGhvc3Rcblx0Ly8gYWR2ZXJ0aXNpbmcgaXRzIHNlc3Npb24gdHlwZXMgYWZ0ZXIgdGhlIGRpYWxvZyBvcGVuZWQpLCBzbyB0aGUgc2F2ZWRcblx0Ly8gYXV0b21hdGlvbiBhbHdheXMgbWF0Y2hlcyB0aGUgY2hpcCB0aGUgcGlja2VyIGRpc3BsYXlzLlxuXHRkaXNwb3NhYmxlcy5hZGQoc2Vzc2lvblR5cGVQaWNrZXIub25EaWRDaGFuZ2VTZWxlY3RlZFBpY2soKCkgPT4ge1xuXHRcdHN5bmNTdGF0ZUZyb21QaWNrZXIoKTtcblx0XHRyZXZhbGlkYXRlKCk7XG5cdH0pKTtcblxuXHRjb25zdCB3b3Jrc3BhY2VQaWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9iaWxlQXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXIsIHtcblx0XHRjYW5TZWxlY3RXb3Jrc3BhY2U6IChmb2xkZXJVcmksIHByZWZlcnJlZFByb3ZpZGVySWQpID0+XG5cdFx0XHRjYW5TZWxlY3RBdXRvbWF0aW9uV29ya3NwYWNlKGZvbGRlclVyaSwgcHJlZmVycmVkUHJvdmlkZXJJZCwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSksXG5cdH0pKTtcblx0d29ya3NwYWNlUGlja2VyLnNldFRhcmdldE1vZGVsKGlzb2xhdGlvbk1vZGVsKTtcblx0d29ya3NwYWNlUGlja2VyLnNldExheW91dFNlcnZpY2UobGF5b3V0U2VydmljZSk7XG5cblx0aWYgKHN0YXRlLmZvbGRlclVyaSkge1xuXHRcdHdvcmtzcGFjZVBpY2tlci5zZXRTZWxlY3RlZFdvcmtzcGFjZShzdGF0ZS5mb2xkZXJVcmksIHsgZmlyZUV2ZW50OiBmYWxzZSwgcGVyc2lzdDogZmFsc2UgfSk7XG5cdH1cblxuXHRkaXNwb3NhYmxlcy5hZGQod29ya3NwYWNlUGlja2VyLm9uRGlkU2VsZWN0V29ya3NwYWNlKHVyaSA9PiB7XG5cdFx0aWYgKGlzb2xhdGlvbk1vZGVsLnNldFdvcmtzcGFjZSh1cmkpKSB7XG5cdFx0XHRyZXZhbGlkYXRlKCk7XG5cdFx0fVxuXHR9KSk7XG5cblx0aWYgKCFzdGF0ZS5pc1F1aWNrQ2hhdCAmJiAhc3RhdGUuZm9sZGVyVXJpICYmIHdvcmtzcGFjZVBpY2tlci5zZWxlY3RlZEZvbGRlclVyaSkge1xuXHRcdGlzb2xhdGlvbk1vZGVsLnNldFdvcmtzcGFjZSh3b3Jrc3BhY2VQaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmkpO1xuXHR9XG5cblx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRpc29sYXRpb25Nb2RlbC5pc1F1aWNrQ2hhdE9icy5yZWFkKHJlYWRlcik7XG5cdFx0cmV2YWxpZGF0ZSgpO1xuXHR9KSk7XG5cblx0Y29uc3QgcHJvbXB0Um93ID0gRE9NLmFwcGVuZChmb3JtLCAkKCcuYXV0b21hdGlvbi1mb3JtLXJvdycpKTtcblx0RE9NLmFwcGVuZChwcm9tcHRSb3csICQoJ2xhYmVsLmF1dG9tYXRpb24tZm9ybS1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5wcm9tcHQnLCBcIlByb21wdFwiKSkpO1xuXHRjb25zdCBwcm9tcHRIb3N0ID0gRE9NLmFwcGVuZChwcm9tcHRSb3csICQoJy5hdXRvbWF0aW9uLWZvcm0tcHJvbXB0LWhvc3QuaW50ZXJhY3RpdmUtc2Vzc2lvbicpKTtcblxuXHRjb25zdCBjaGF0SW5wdXRTdHlsZXM6IElDaGF0SW5wdXRTdHlsZXMgPSB7XG5cdFx0b3ZlcmxheUJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtaW5wdXQtYmFja2dyb3VuZCknLFxuXHRcdGxpc3RGb3JlZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWZvcmVncm91bmQpJyxcblx0XHRsaXN0QmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1pbnB1dC1iYWNrZ3JvdW5kKScsXG5cdH07XG5cblx0Y29uc3QgY2hhdElucHV0T3B0aW9uczogSUNoYXRJbnB1dFBhcnRPcHRpb25zID0ge1xuXHRcdHJlbmRlckZvbGxvd3VwczogZmFsc2UsXG5cdFx0cmVuZGVySW5wdXRUb29sYmFyQmVsb3dJbnB1dDogZmFsc2UsXG5cdFx0cmVuZGVyV29ya2luZ1NldDogZmFsc2UsXG5cdFx0ZW5hYmxlSW1wbGljaXRDb250ZXh0OiBmYWxzZSxcblx0XHRzdXBwb3J0c0NoYW5naW5nTW9kZXM6IHRydWUsXG5cdFx0aGlkZUN1c3RvbUNoYXRNb2RlczogdHJ1ZSxcblx0XHRzdXBwcmVzc01vZGVQcmVmZXJyZWRNb2RlbDogdHJ1ZSxcblx0XHRzdXBwcmVzc01vZGVsUGVyc2lzdGVuY2U6IHRydWUsXG5cdFx0bWVudXM6IHtcblx0XHRcdGV4ZWN1dGVUb29sYmFyOiBNZW51SWQuQXV0b21hdGlvbnNEaWFsb2dJbnB1dCxcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2F1dG9tYXRpb25zLmRpYWxvZycsXG5cdFx0fSxcblx0XHR3aWRnZXRWaWV3S2luZFRhZzogJ2F1dG9tYXRpb25zLWRpYWxvZycsXG5cdFx0aW5wdXRFZGl0b3JNaW5MaW5lczogMyxcblx0XHQvLyBUaGUgZGlhbG9nIHJlbmRlcnMgdGhlIGNvbXBvc2VyIGZsdXNoIHdpdGggaXRzIGZvcm0gY29sdW1uICh0aGVcblx0XHQvLyBgLmludGVyYWN0aXZlLWlucHV0LXBhcnRgIG1hcmdpbiBpcyB6ZXJvZWQgaW4gQ1NTKSwgc28gdGhlcmUgaXMgbm9cblx0XHQvLyBvdXRlciBob3Jpem9udGFsIGd1dHRlci4gV2l0aG91dCB0aGlzLCBDaGF0SW5wdXRQYXJ0IHdvdWxkIHN0aWxsXG5cdFx0Ly8gcmVzZXJ2ZSB0aGUgZGVmYXVsdCAyNHB4IG1hcmdpbiBhbmQgbGF5IHRoZSBlZGl0b3Igb3V0IHRvbyBuYXJyb3csXG5cdFx0Ly8gbGVhdmluZyBpdHMgc2Nyb2xsYmFyIGZsb2F0aW5nIH4yNHB4IGluIGZyb20gdGhlIHJpZ2h0IHdhbGwuXG5cdFx0aW5wdXRQYXJ0SG9yaXpvbnRhbFBhZGRpbmc6IDAsXG5cdFx0c2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZTogc2Vzc2lvblR5cGVEZWxlZ2F0ZSxcblx0XHRzZWNvbmRhcnlUb29sYmFyQWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgaXRlbU9wdGlvbnMpID0+IHtcblx0XHRcdGlmIChhY3Rpb24uaWQgPT09IEFVVE9NQVRJT05TX0hBUk5FU1NfQ0hJUF9BQ1RJT05fSUQpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBBdXRvbWF0aW9uUGlja2VyQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBjb250YWluZXIgPT4gc2Vzc2lvblR5cGVQaWNrZXIucmVuZGVyKGNvbnRhaW5lciksIHVuZGVmaW5lZCwgaXRlbU9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gQVVUT01BVElPTlNfV09SS1NQQUNFX1BJQ0tFUl9BQ1RJT05fSUQpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBBdXRvbWF0aW9uUGlja2VyQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBjb250YWluZXIgPT4ge1xuXHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LWlucHV0LXBpY2tlci1pdGVtJyk7XG5cdFx0XHRcdFx0d29ya3NwYWNlUGlja2VyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdFx0XHR9LCB1bmRlZmluZWQsIGl0ZW1PcHRpb25zKTtcblx0XHRcdH1cblx0XHRcdGlmIChhY3Rpb24uaWQgPT09IEFVVE9NQVRJT05TX0lTT0xBVElPTl9HUk9VUF9BQ1RJT05fSUQpIHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdEF1dG9tYXRpb25Jc29sYXRpb25Hcm91cEFjdGlvblZpZXdJdGVtLFxuXHRcdFx0XHRcdGFjdGlvbixcblx0XHRcdFx0XHRzdGF0ZSxcblx0XHRcdFx0XHRpc29sYXRpb25Nb2RlbCxcblx0XHRcdFx0XHRpc29sYXRpb25Nb2RlbC5mb2xkZXJVcmlPYnMsXG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uVGFyZ2V0LmV2ZW50LFxuXHRcdFx0XHRcdHJldmFsaWRhdGUsXG5cdFx0XHRcdFx0aXRlbU9wdGlvbnMsXG5cdFx0XHRcdFx0d29ya3NwYWNlQ29udHJvbHNWaXNpYmxlLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSxcblx0fTtcblxuXHQvLyBNaW5pbWFsIHN1YnNldCBvZiBJQ2hhdFdpZGdldCBuZWVkZWQgYnkgQ2hhdElucHV0UGFydCBpbiBkaWFsb2cgY29udGV4dFxuXHR0eXBlIElNaW5pbWFsQ2hhdFdpZGdldCA9IFBpY2s8SUNoYXRXaWRnZXQsICdvbkRpZENoYW5nZVZpZXdNb2RlbCcgfCAndmlld01vZGVsJyB8ICdjb250cmlicycgfCAnbG9jYXRpb24nIHwgJ3ZpZXdDb250ZXh0JyB8ICdsb2NrVG9Db2RpbmdBZ2VudCcgfCAndW5sb2NrRnJvbUNvZGluZ0FnZW50Jz47XG5cblx0Y29uc3Qgc3R1YldpZGdldDogSU1pbmltYWxDaGF0V2lkZ2V0ID0ge1xuXHRcdG9uRGlkQ2hhbmdlVmlld01vZGVsOiBFdmVudC5Ob25lLFxuXHRcdHZpZXdNb2RlbDogdW5kZWZpbmVkLFxuXHRcdGNvbnRyaWJzOiBbXSxcblx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHR2aWV3Q29udGV4dDoge30sXG5cdFx0bG9ja1RvQ29kaW5nQWdlbnQ6ICgpID0+IHsgfSxcblx0XHR1bmxvY2tGcm9tQ29kaW5nQWdlbnQ6ICgpID0+IHsgfSxcblx0fTtcblxuXHQvLyBCaW5kIGNvbnRleHQga2V5cyByZXF1aXJlZCBieSBjaGF0IGlucHV0IHRvb2xiYXIgYHdoZW5gIGNsYXVzZXMuXG5cdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChwcm9tcHRIb3N0KSk7XG5cdENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5iaW5kVG8oc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpLnNldChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0Q2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb24uYmluZFRvKHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cdENoYXRDb250ZXh0S2V5cy5pbkF1dG9tYXRpb25zRGlhbG9nLmJpbmRUbyhzY29wZWRDb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpO1xuXHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2VdKSlcblx0KTtcblxuXHRjb25zdCBjaGF0SW5wdXQgPSBkaXNwb3NhYmxlcy5hZGQoXG5cdFx0c2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdElucHV0UGFydCwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2hhdElucHV0T3B0aW9ucywgY2hhdElucHV0U3R5bGVzLCBmYWxzZSksXG5cdCk7XG5cdGNoYXRJbnB1dC5yZW5kZXIocHJvbXB0SG9zdCwgaW5pdGlhbFByb21wdCwgc3R1YldpZGdldCBhcyBJQ2hhdFdpZGdldCk7XG5cdGNoYXRJbnB1dC5pbnB1dEVkaXRvci51cGRhdGVPcHRpb25zKHsgcGxhY2Vob2xkZXI6IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0ucHJvbXB0LnBsYWNlaG9sZGVyJywgXCJEZXNjcmliZSB3aGF0IHlvdSB3YW50IHRvIGF1dG9tYXRlXCIpIH0pO1xuXG5cdGlmIChpbml0aWFsTW9kZSkge1xuXHRcdGNvbnN0IGdldFVuZmlsdGVyZWRJbml0aWFsTW9kZSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVzID0gY2hhdElucHV0LmN1cnJlbnRDaGF0TW9kZXNPYnMuZ2V0KCk7XG5cdFx0XHRyZXR1cm4gbW9kZXMuZmluZE1vZGVCeUlkKGluaXRpYWxNb2RlKSA/PyBtb2Rlcy5maW5kTW9kZUJ5TmFtZShpbml0aWFsTW9kZSk7XG5cdFx0fTtcblx0XHRjb25zdCBpc0hpZGRlbkN1c3RvbUluaXRpYWxNb2RlID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZSA9IGdldFVuZmlsdGVyZWRJbml0aWFsTW9kZSgpO1xuXHRcdFx0cmV0dXJuICEhbW9kZSAmJiBjaGF0SW5wdXRPcHRpb25zLmhpZGVDdXN0b21DaGF0TW9kZXMgJiYgIWlzTW9kZUNvbnNpZGVyZWRCdWlsdEluKG1vZGUsIHByb2R1Y3RTZXJ2aWNlKTtcblx0XHR9O1xuXG5cdFx0aWYgKGlzSGlkZGVuQ3VzdG9tSW5pdGlhbE1vZGUoKSkge1xuXHRcdFx0bG9nU2VydmljZS50cmFjZShgW0F1dG9tYXRpb25EaWFsb2ddIFNraXBwaW5nIGhpZGRlbiBjdXN0b20gaW5pdGlhbCBtb2RlIFwiJHtpbml0aWFsTW9kZX1cIi4gRmFsbGluZyBiYWNrIHRvIHRoZSBkZWZhdWx0IG1vZGUuYCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNoYXRJbnB1dC5zZXRDaGF0TW9kZShpbml0aWFsTW9kZSwgLyogc3RvcmVTZWxlY3Rpb24gKi8gZmFsc2UpO1xuXHRcdH1cblx0XHQvLyBSZXRyeSBvbiBjb2xkLXN0YXJ0IHdoZW4gZXh0ZW5zaW9uLWNvbnRyaWJ1dGVkIG1vZGVzIGFycml2ZSBsYXRlLlxuXHRcdGlmIChjaGF0SW5wdXQuY3VycmVudE1vZGVPYnMuZ2V0KCkuaWQgIT09IGluaXRpYWxNb2RlICYmICFpc0hpZGRlbkN1c3RvbUluaXRpYWxNb2RlKCkpIHtcblx0XHRcdGNvbnN0IGJhc2VsaW5lID0gY2hhdElucHV0LmN1cnJlbnRNb2RlT2JzLmdldCgpLmlkO1xuXHRcdFx0Y29uc3QgcmV0cnkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0XHRcdGNvbnN0IHRyeUFwcGx5ID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAoY2hhdElucHV0LmN1cnJlbnRNb2RlT2JzLmdldCgpLmlkICE9PSBiYXNlbGluZSkge1xuXHRcdFx0XHRcdHJldHJ5LmNsZWFyKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpc0hpZGRlbkN1c3RvbUluaXRpYWxNb2RlKCkpIHtcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKGBbQXV0b21hdGlvbkRpYWxvZ10gU2tpcHBpbmcgaGlkZGVuIGN1c3RvbSBpbml0aWFsIG1vZGUgXCIke2luaXRpYWxNb2RlfVwiIGFmdGVyIG1vZGVzIHVwZGF0ZWQuIEZhbGxpbmcgYmFjayB0byB0aGUgZGVmYXVsdCBtb2RlLmApO1xuXHRcdFx0XHRcdHJldHJ5LmNsZWFyKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG1vZGVzID0gY2hhdElucHV0LmN1cnJlbnRDaGF0TW9kZXNPYnMuZ2V0KCk7XG5cdFx0XHRcdGlmIChtb2Rlcy5maW5kTW9kZUJ5SWQoaW5pdGlhbE1vZGUpIHx8IG1vZGVzLmZpbmRNb2RlQnlOYW1lKGluaXRpYWxNb2RlKSkge1xuXHRcdFx0XHRcdGNoYXRJbnB1dC5zZXRDaGF0TW9kZShpbml0aWFsTW9kZSwgLyogc3RvcmVTZWxlY3Rpb24gKi8gZmFsc2UpO1xuXHRcdFx0XHRcdGlmIChjaGF0SW5wdXQuY3VycmVudE1vZGVPYnMuZ2V0KCkuaWQgPT09IGluaXRpYWxNb2RlKSB7XG5cdFx0XHRcdFx0XHRyZXRyeS5jbGVhcigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHJldHJ5LnZhbHVlID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlcyA9IGNoYXRJbnB1dC5jdXJyZW50Q2hhdE1vZGVzT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChtb2Rlcy5vbkRpZENoYW5nZSh0cnlBcHBseSkpO1xuXHRcdFx0XHR0cnlBcHBseSgpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cdGlmIChpbml0aWFsUGVybWlzc2lvbkxldmVsICYmIGlzQ2hhdFBlcm1pc3Npb25MZXZlbChpbml0aWFsUGVybWlzc2lvbkxldmVsKSkge1xuXHRcdGNoYXRJbnB1dC5zZXRQZXJtaXNzaW9uTGV2ZWwoaW5pdGlhbFBlcm1pc3Npb25MZXZlbCk7XG5cdH1cblx0Ly8gT24gZWRpdCwgYXBwbHkgdGhlIHNhdmVkIG1vZGVsIHdpdGggbGF0ZS1hcnJpdmFsIHJldHJ5IGlmIG5lZWRlZC5cblx0Y2hhdElucHV0LnJlc2V0TGFuZ3VhZ2VNb2RlbFRvRGVmYXVsdCgpO1xuXG5cdGNvbnN0IHJlc29sdmVJbml0aWFsTW9kZWxJZCA9ICgpID0+IGluaXRpYWxNb2RlbElkID8gcmVzb2x2ZUF1dG9tYXRpb25Nb2RlbElkZW50aWZpZXIoXG5cdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdGluaXRpYWxNb2RlbElkLFxuXHRcdHN0YXRlLnNlc3Npb25UeXBlSWQsXG5cdFx0c2Vzc2lvblR5cGVQaWNrZXIubW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGUuZ2V0KCksXG5cdCkgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IHJlc29sdmVkSW5pdGlhbE1vZGVsSWQgPSByZXNvbHZlSW5pdGlhbE1vZGVsSWQoKTtcblx0aWYgKHJlc29sdmVkSW5pdGlhbE1vZGVsSWQgJiYgIWNoYXRJbnB1dC5zd2l0Y2hNb2RlbEJ5SWRlbnRpZmllcihyZXNvbHZlZEluaXRpYWxNb2RlbElkLCAvKiBzdG9yZVNlbGVjdGlvbiAqLyBmYWxzZSkpIHtcblx0XHRjb25zdCBiYXNlbGluZSA9IGNoYXRJbnB1dC5zZWxlY3RlZExhbmd1YWdlTW9kZWwuZ2V0KCk/LmlkZW50aWZpZXI7XG5cdFx0Y29uc3QgcmV0cnkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0XHRyZXRyeS52YWx1ZSA9IEV2ZW50LmFueShcblx0XHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZS5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzLFxuXHRcdFx0RXZlbnQuZnJvbU9ic2VydmFibGVMaWdodChzZXNzaW9uVHlwZVBpY2tlci5tb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZSksXG5cdFx0KSgoKSA9PiB7XG5cdFx0XHRpZiAoY2hhdElucHV0LnNlbGVjdGVkTGFuZ3VhZ2VNb2RlbC5nZXQoKT8uaWRlbnRpZmllciAhPT0gYmFzZWxpbmUpIHtcblx0XHRcdFx0cmV0cnkuY2xlYXIoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbW9kZWxJZGVudGlmaWVyID0gcmVzb2x2ZUluaXRpYWxNb2RlbElkKCk7XG5cdFx0XHRpZiAobW9kZWxJZGVudGlmaWVyICYmIGNoYXRJbnB1dC5zd2l0Y2hNb2RlbEJ5SWRlbnRpZmllcihtb2RlbElkZW50aWZpZXIsIC8qIHN0b3JlU2VsZWN0aW9uICovIGZhbHNlKSkge1xuXHRcdFx0XHRyZXRyeS5jbGVhcigpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0ZGlzcG9zYWJsZXMuYWRkKGNoYXRJbnB1dC5pbnB1dEVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB7XG5cdFx0cmV2YWxpZGF0ZSgpO1xuXHR9KSk7XG5cblx0Y2hhdElucHV0LmxheW91dCg1ODApO1xuXHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0aWYgKCFkaXNwb3NhYmxlcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRjaGF0SW5wdXQubGF5b3V0KDU4MCk7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25zdCByZXNpemVPYnNlcnZlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRE9NLkRpc3Bvc2FibGVSZXNpemVPYnNlcnZlcignYXV0b21hdGlvbkRpYWxvZy5wcm9tcHRIb3N0JywgZW50cmllcyA9PiB7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRjb25zdCB3aWR0aCA9IGVudHJ5LmNvbnRlbnRSZWN0LndpZHRoO1xuXHRcdFx0aWYgKHdpZHRoID4gMCkge1xuXHRcdFx0XHRjaGF0SW5wdXQubGF5b3V0KHdpZHRoKTtcblx0XHRcdH1cblx0XHR9XG5cdH0sIERPTS5nZXRXaW5kb3cocHJvbXB0SG9zdCkpKTtcblx0ZGlzcG9zYWJsZXMuYWRkKHJlc2l6ZU9ic2VydmVyLm9ic2VydmUocHJvbXB0SG9zdCkpO1xuXG5cdGNvbnN0IGVuYWJsZWRSb3cgPSBET00uYXBwZW5kKGZvcm0sICQoJy5hdXRvbWF0aW9uLWZvcm0tcm93LmF1dG9tYXRpb24tZm9ybS1jaGVja2JveC1yb3cnKSk7XG5cdGNvbnN0IGVuYWJsZWRMYWJlbFRleHQgPSBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmVuYWJsZWQnLCBcIkVuYWJsZWQgKHRoZSBzY2hlZHVsZXIgcnVucyB0aGlzIGF1dG9tYXRpb24gd2hlbiBkdWUpXCIpO1xuXHRjb25zdCBlbmFibGVkQ2hlY2tib3ggPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoZWNrYm94KGVuYWJsZWRMYWJlbFRleHQsIHN0YXRlLmVuYWJsZWQsIGRlZmF1bHRDaGVja2JveFN0eWxlcykpO1xuXHRET00uYXBwZW5kKGVuYWJsZWRSb3csIGVuYWJsZWRDaGVja2JveC5kb21Ob2RlKTtcblx0Y29uc3QgZW5hYmxlZExhYmVsID0gRE9NLmFwcGVuZChlbmFibGVkUm93LCAkKCdzcGFuLmF1dG9tYXRpb24tZm9ybS1jaGVja2JveC1sYWJlbCcsIHVuZGVmaW5lZCwgZW5hYmxlZExhYmVsVGV4dCkpO1xuXHRjb25zdCBzZXRFbmFibGVkID0gKHZhbHVlOiBib29sZWFuKSA9PiB7XG5cdFx0aWYgKGVuYWJsZWRDaGVja2JveC5jaGVja2VkICE9PSB2YWx1ZSkge1xuXHRcdFx0ZW5hYmxlZENoZWNrYm94LmNoZWNrZWQgPSB2YWx1ZTtcblx0XHR9XG5cdFx0c3RhdGUuZW5hYmxlZCA9IHZhbHVlO1xuXHR9O1xuXHRkaXNwb3NhYmxlcy5hZGQoZW5hYmxlZENoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IHtcblx0XHRzdGF0ZS5lbmFibGVkID0gZW5hYmxlZENoZWNrYm94LmNoZWNrZWQ7XG5cdH0pKTtcblx0ZGlzcG9zYWJsZXMuYWRkKERPTS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihlbmFibGVkTGFiZWwsICdjbGljaycsICgpID0+IHtcblx0XHRzZXRFbmFibGVkKCFlbmFibGVkQ2hlY2tib3guY2hlY2tlZCk7XG5cdH0pKTtcblxuXHRyZXR1cm4ge1xuXHRcdGdldFByb21wdDogKCkgPT4gY2hhdElucHV0LmlucHV0RWRpdG9yLmdldFZhbHVlKCksXG5cdFx0Z2V0TW9kZTogKCkgPT4gY2hhdElucHV0LmN1cnJlbnRNb2RlT2JzLmdldCgpLmlkLFxuXHRcdGdldFBlcm1pc3Npb25MZXZlbDogKCkgPT4gY2hhdElucHV0LmN1cnJlbnRQZXJtaXNzaW9uTGV2ZWxPYnMuZ2V0KCksXG5cdFx0Z2V0TW9kZWxJZDogKCkgPT4gY2hhdElucHV0LnNlbGVjdGVkTGFuZ3VhZ2VNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHRnZXRCcmFuY2g6ICgpID0+IGlzb2xhdGlvbk1vZGVsLnBlcnNpc3RlZEJyYW5jaCxcblx0XHRnZXRGb2N1c2FibGVFbGVtZW50czogKCkgPT4ge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4IC0tIHRoZSBkaWFsb2cgb3ducyB0aGlzIGZvcm0gc3VidHJlZSBhbmQgc3VwcGxpZXMgaXRzIGR5bmFtaWMgZm9jdXMgb3JkZXIuXG5cdFx0XHRyZXR1cm4gQXJyYXkuZnJvbShmb3JtLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCdpbnB1dCwgc2VsZWN0LCB0ZXh0YXJlYSwgYnV0dG9uLCBhW2hyZWZdLCBbdGFiaW5kZXhdJykpO1xuXHRcdH0sXG5cdH07XG59XG5cbmludGVyZmFjZSBJVGltZU9wdGlvbiB7XG5cdHJlYWRvbmx5IGhvdXI6IG51bWJlcjtcblx0cmVhZG9ubHkgbWludXRlOiBudW1iZXI7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkVGltZU9wdGlvbnMoKTogcmVhZG9ubHkgSVRpbWVPcHRpb25bXSB7XG5cdGNvbnN0IG9wdGlvbnM6IElUaW1lT3B0aW9uW10gPSBbXTtcblx0Zm9yIChsZXQgaG91ciA9IDA7IGhvdXIgPCAyNDsgaG91cisrKSB7XG5cdFx0Zm9yIChsZXQgbWludXRlID0gMDsgbWludXRlIDwgNjA7IG1pbnV0ZSArPSAxNSkge1xuXHRcdFx0Y29uc3QgcGVyaW9kID0gaG91ciA8IDEyID8gJ0FNJyA6ICdQTSc7XG5cdFx0XHRjb25zdCBob3VyMTIgPSBob3VyID09PSAwID8gMTIgOiAoaG91ciA+IDEyID8gaG91ciAtIDEyIDogaG91cik7XG5cdFx0XHRjb25zdCBtaW51dGVUZXh0ID0gbWludXRlLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKTtcblx0XHRcdG9wdGlvbnMucHVzaCh7XG5cdFx0XHRcdGhvdXIsXG5cdFx0XHRcdG1pbnV0ZSxcblx0XHRcdFx0bGFiZWw6IGAke2hvdXIxMn06JHttaW51dGVUZXh0fSAke3BlcmlvZH1gLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBvcHRpb25zO1xufVxuXG5mdW5jdGlvbiBuZWFyZXN0VGltZU9wdGlvbkluZGV4KGhvdXI6IG51bWJlciwgbWludXRlOiBudW1iZXIpOiBudW1iZXIge1xuXHRjb25zdCBzYWZlSG91ciA9IE1hdGgubWF4KDAsIE1hdGgubWluKDIzLCBob3VyIHwgMCkpO1xuXHRjb25zdCBzYWZlTWludXRlID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oNTksIG1pbnV0ZSB8IDApKTtcblx0Y29uc3Qgc2xvdCA9IE1hdGgucm91bmQoc2FmZU1pbnV0ZSAvIDE1KSAlIDQ7XG5cdGNvbnN0IGNhcnJpZWRIb3VyID0gc2FmZU1pbnV0ZSA+PSA1MyAmJiBzbG90ID09PSAwID8gKHNhZmVIb3VyICsgMSkgJSAyNCA6IHNhZmVIb3VyO1xuXHRyZXR1cm4gY2FycmllZEhvdXIgKiA0ICsgc2xvdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZVNhdmVCdXR0b25TdGF0ZShcblx0c2F2ZUJ1dHRvbjogSUJ1dHRvbiB8IHVuZGVmaW5lZCxcblx0c3RhdGU6IElGb3JtU3RhdGUsXG5cdHZhbGlkYXRpb246IElWYWxpZGF0aW9uU3RhdGUsXG5cdGZvcm06IEhUTUxFbGVtZW50LFxuXHRnZXRQcm9tcHQ6ICgpID0+IHN0cmluZyxcblx0Z2V0QnJhbmNoOiAoKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQsXG4pOiB2b2lkIHtcblx0dmFsaWRhdGlvbi5uYW1lRXJyb3IgPSBzdGF0ZS5uYW1lLnRyaW0oKSA9PT0gJydcblx0XHQ/IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0ubmFtZVJlcXVpcmVkJywgXCJOYW1lIGlzIHJlcXVpcmVkLlwiKVxuXHRcdDogdW5kZWZpbmVkO1xuXHR2YWxpZGF0aW9uLnByb21wdEVycm9yID0gZ2V0UHJvbXB0KCkudHJpbSgpID09PSAnJ1xuXHRcdD8gbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5wcm9tcHRSZXF1aXJlZCcsIFwiUHJvbXB0IGlzIHJlcXVpcmVkLlwiKVxuXHRcdDogdW5kZWZpbmVkO1xuXHR2YWxpZGF0aW9uLmZvbGRlckVycm9yID0gIXN0YXRlLmZvbGRlclVyaVxuXHRcdCYmICFzdGF0ZS5pc1F1aWNrQ2hhdFxuXHRcdD8gbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5mb2xkZXJSZXF1aXJlZCcsIFwiV29ya3NwYWNlIGZvbGRlciBpcyByZXF1aXJlZC5cIilcblx0XHQ6IHVuZGVmaW5lZDtcblx0dmFsaWRhdGlvbi5zZXNzaW9uVHlwZUVycm9yID0gIXN0YXRlLnNlc3Npb25UeXBlSWQgfHwgKHN0YXRlLmlzUXVpY2tDaGF0ICYmICFzdGF0ZS5wcm92aWRlcklkKVxuXHRcdD8gbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5zZXNzaW9uVHlwZVJlcXVpcmVkJywgXCJTZXNzaW9uIHR5cGUgaXMgcmVxdWlyZWQuXCIpXG5cdFx0OiB1bmRlZmluZWQ7XG5cdHZhbGlkYXRpb24uYnJhbmNoRXJyb3IgPSAhc3RhdGUuaXNRdWlja0NoYXQgJiYgc3RhdGUuaXNvbGF0aW9uTW9kZSA9PT0gJ3dvcmt0cmVlJyAmJiAhZ2V0QnJhbmNoKClcblx0XHQ/IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoUmVxdWlyZWQnLCBcIkEgYnJhbmNoIGlzIHJlcXVpcmVkIGZvciBXb3JrdHJlZSBpc29sYXRpb24uXCIpXG5cdFx0OiB1bmRlZmluZWQ7XG5cblx0Y29uc3QgdmFsaWQgPSAhdmFsaWRhdGlvbi5uYW1lRXJyb3IgJiYgIXZhbGlkYXRpb24ucHJvbXB0RXJyb3IgJiYgIXZhbGlkYXRpb24uZm9sZGVyRXJyb3IgJiYgIXZhbGlkYXRpb24uc2Vzc2lvblR5cGVFcnJvciAmJiAhdmFsaWRhdGlvbi5icmFuY2hFcnJvcjtcblx0aWYgKHNhdmVCdXR0b24pIHtcblx0XHRzYXZlQnV0dG9uLmVuYWJsZWQgPSB2YWxpZDtcblx0fVxuXHRmb3JtLmNsYXNzTGlzdC50b2dnbGUoJ2F1dG9tYXRpb24tZm9ybS1pbnZhbGlkJywgIXZhbGlkKTtcbn1cblxuLy8gTG9jYWwtb25seSB3b3Jrc3BhY2UgcGlja2VyOiBoaWRlcyBjYXRlZ29yeSB0YWJzIGFuZCBub24tbG9jYWwgYnJvd3NlIGFjdGlvbnMuXG5leHBvcnQgY2xhc3MgQXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXIgZXh0ZW5kcyBXb3Jrc3BhY2VQaWNrZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IHRhcmdldE1vZGVsV2F0Y2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIHRhcmdldE1vZGVsOiBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwgfCB1bmRlZmluZWQ7XG5cblx0c2V0VGFyZ2V0TW9kZWwobW9kZWw6IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbCk6IHZvaWQge1xuXHRcdHRoaXMudGFyZ2V0TW9kZWwgPSBtb2RlbDtcblx0XHR0aGlzLnRhcmdldE1vZGVsV2F0Y2gudmFsdWUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRtb2RlbC5pc1F1aWNrQ2hhdE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyTGFiZWwoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfc2hvd1RhYnMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9zaG91bGRQZXJzaXN0U2VsZWN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfYnVpbGRJdGVtcygpOiBJQWN0aW9uTGlzdEl0ZW08SVdvcmtzcGFjZVBpY2tlckl0ZW0+W10ge1xuXHRcdGNvbnN0IGl0ZW1zID0gc3VwZXIuX2J1aWxkSXRlbXMoKTtcblx0XHRjb25zdCBub1dvcmtzcGFjZTogSUFjdGlvbkxpc3RJdGVtPElXb3Jrc3BhY2VQaWNrZXJJdGVtPiA9IHtcblx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5ub1dvcmtzcGFjZScsIFwiTm8gd29ya3NwYWNlXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0ubm9Xb3Jrc3BhY2UuZGVzY3JpcHRpb24nLCBcIlJ1biB3aXRob3V0IGEgYmFja2luZyB3b3Jrc3BhY2VcIiksXG5cdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb246IENvZGljb24uY29tbWVudERpc2N1c3Npb24gfSxcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0Y2hlY2tlZDogdGhpcy50YXJnZXRNb2RlbD8uaXNRdWlja0NoYXQgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMudGFyZ2V0TW9kZWw/LnNldFF1aWNrQ2hhdCh0cnVlKSxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRyZXR1cm4gaXRlbXMubGVuZ3RoID4gMFxuXHRcdFx0PyBbbm9Xb3Jrc3BhY2UsIHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvciwgbGFiZWw6ICcnIH0sIC4uLml0ZW1zXVxuXHRcdFx0OiBbbm9Xb3Jrc3BhY2VdO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9kaXNwYXRjaFBpY2tlckl0ZW0oaXRlbTogSVdvcmtzcGFjZVBpY2tlckl0ZW0pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBhcHBsaWVkID0gYXdhaXQgc3VwZXIuX2Rpc3BhdGNoUGlja2VySXRlbShpdGVtKTtcblx0XHRjb25zdCBzZWxlY3RlZEZvbGRlciA9IHRoaXMuc2VsZWN0ZWRGb2xkZXJVcmk7XG5cdFx0aWYgKGFwcGxpZWQgJiYgc2VsZWN0ZWRGb2xkZXIgJiYgKGl0ZW0uZm9sZGVyVXJpIHx8IGl0ZW0uYnJvd3NlQWN0aW9uSW5kZXggIT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdHRoaXMudGFyZ2V0TW9kZWw/LnNldFF1aWNrQ2hhdChmYWxzZSwgc2VsZWN0ZWRGb2xkZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gYXBwbGllZDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfaXNTZWxlY3RlZEZvbGRlcihmb2xkZXJVcmk6IFVSSSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy50YXJnZXRNb2RlbD8uaXNRdWlja0NoYXQgJiYgc3VwZXIuX2lzU2VsZWN0ZWRGb2xkZXIoZm9sZGVyVXJpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfcmVuZGVyVHJpZ2dlckxhYmVsKHRyaWdnZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0RE9NLmNsZWFyTm9kZSh0cmlnZ2VyKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLnNlbGVjdGVkUmVzb2x2ZWQ/LndvcmtzcGFjZTtcblx0XHRjb25zdCBub1dvcmtzcGFjZSA9IHRoaXMudGFyZ2V0TW9kZWw/LmlzUXVpY2tDaGF0ID09PSB0cnVlO1xuXHRcdGNvbnN0IGxhYmVsID0gbm9Xb3Jrc3BhY2Vcblx0XHRcdD8gbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5ub1dvcmtzcGFjZScsIFwiTm8gd29ya3NwYWNlXCIpXG5cdFx0XHQ6IHdvcmtzcGFjZT8ubGFiZWwgPz8gbG9jYWxpemUoJ3BpY2tXb3Jrc3BhY2UnLCBcIndvcmtzcGFjZVwiKTtcblx0XHRjb25zdCBpY29uID0gbm9Xb3Jrc3BhY2UgPyBDb2RpY29uLmNvbW1lbnREaXNjdXNzaW9uIDogd29ya3NwYWNlPy5pY29uID8/IENvZGljb24ucHJvamVjdDtcblxuXHRcdHRyaWdnZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgd29ya3NwYWNlIHx8IG5vV29ya3NwYWNlXG5cdFx0XHQ/IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0ud29ya3NwYWNlUGlja2VyLnNlbGVjdGVkQXJpYUxhYmVsJywgXCJBdXRvbWF0aW9uIHRhcmdldCwgezB9XCIsIGxhYmVsKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLndvcmtzcGFjZVBpY2tlci5waWNrQXJpYUxhYmVsJywgXCJQaWNrIGEgd29ya3NwYWNlIGZvciB0aGlzIGF1dG9tYXRpb25cIikpO1xuXG5cdFx0Y29uc3QgcmVuZGVyZWRJY29uID0gRE9NLmFwcGVuZCh0cmlnZ2VyLCByZW5kZXJJY29uKGljb24pKTtcblx0XHRyZW5kZXJlZEljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0RE9NLmFwcGVuZCh0cmlnZ2VyLCAkKCdzcGFuLnNlc3Npb25zLWNoYXQtZHJvcGRvd24tbGFiZWwnLCB1bmRlZmluZWQsIGxhYmVsKSk7XG5cdFx0Y29uc3QgY2hldnJvbiA9IERPTS5hcHBlbmQodHJpZ2dlciwgcmVuZGVySWNvbihDb2RpY29uLmNoZXZyb25Eb3duQ29tcGFjdCkpO1xuXHRcdGNoZXZyb24uY2xhc3NMaXN0LmFkZCgnc2Vzc2lvbnMtY2hhdC1kcm9wZG93bi1jaGV2cm9uJyk7XG5cdFx0Y2hldnJvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZ2V0QWxsQnJvd3NlQWN0aW9ucygpOiBJU2Vzc2lvbldvcmtzcGFjZUJyb3dzZUFjdGlvbltdIHtcblx0XHRyZXR1cm4gc3VwZXIuX2dldEFsbEJyb3dzZUFjdGlvbnMoKS5maWx0ZXIoYSA9PiBhLmdyb3VwID09PSBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9MT0NBTCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vYmlsZUF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyIGV4dGVuZHMgQXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXIge1xuXHRwcml2YXRlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXG5cdHNldExheW91dFNlcnZpY2UobGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UpOiB2b2lkIHtcblx0XHR0aGlzLmxheW91dFNlcnZpY2UgPSBsYXlvdXRTZXJ2aWNlO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2hvd1BpY2tlcihmb3JjZSA9IGZhbHNlLCBhbmNob3I/OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHRyaWdnZXJFbGVtZW50ID0gYW5jaG9yID8/IHRoaXMuX3RyaWdnZXJFbGVtZW50O1xuXHRcdGlmICghdHJpZ2dlckVsZW1lbnQgfHwgIXRoaXMubGF5b3V0U2VydmljZSB8fCAhc2hvdWxkVXNlTW9iaWxlV29ya3NwYWNlUGlja2VyU2hlZXQodGhpcy5sYXlvdXRTZXJ2aWNlKSkge1xuXHRcdFx0c3VwZXIuc2hvd1BpY2tlcihmb3JjZSwgYW5jaG9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dm9pZCBzaG93TW9iaWxlV29ya3NwYWNlUGlja2VyU2hlZXQoXG5cdFx0XHR0aGlzLmxheW91dFNlcnZpY2UsXG5cdFx0XHR0cmlnZ2VyRWxlbWVudCxcblx0XHRcdHRoaXMuX2J1aWxkSXRlbXMoKSxcblx0XHRcdGl0ZW0gPT4geyB2b2lkIHRoaXMuX2Rpc3BhdGNoUGlja2VySXRlbShpdGVtKTsgfSxcblx0XHRcdHRoaXMuX2dldEFsbEJyb3dzZUFjdGlvbnMoKSxcblx0XHQpO1xuXHR9XG59XG5cbi8vIE1ha2UgRW50ZXIgaW5zZXJ0IGEgbmV3bGluZSBpbiB0aGUgZGlhbG9nJ3MgZWRpdG9yIChvdmVycmlkZXMgQ2hhdFN1Ym1pdEFjdGlvbikuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYXV0b21hdGlvbnNEaWFsb2cuaW5zZXJ0TmV3bGluZScsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgMTAwLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0RWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0Q2hhdENvbnRleHRLZXlzLmluQXV0b21hdGlvbnNEaWFsb2csXG5cdCksXG5cdHByaW1hcnk6IEtleUNvZGUuRW50ZXIsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpLmdldEZvY3VzZWRDb2RlRWRpdG9yKCk7XG5cdFx0ZWRpdG9yPy50cmlnZ2VyKCdrZXlib2FyZCcsICd0eXBlJywgeyB0ZXh0OiAnXFxuJyB9KTtcblx0fSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUywwQkFBc0Q7QUFDL0QsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBNEIsaUJBQWlCO0FBQzdDLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBOEIseUJBQXlCO0FBQ2hFLFNBQVMsU0FBUyxpQkFBaUIsZUFBNEI7QUFFL0QsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUywwQkFBMkM7QUFFcEQsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBRW5ELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCLHdCQUF3QjtBQUN0RCxTQUFTLG1CQUFtQjtBQUc1QixTQUFTLHVCQUF1Qix1QkFBdUIsOEJBQThCO0FBQ3JGLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQStCLHVCQUF1QjtBQUN0RCxTQUFTLG9CQUF5QztBQUNsRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFrRCxxQ0FBcUM7QUFDdkYsU0FBeUIsbUJBQW1CO0FBRTVDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsbUJBQW1CLDZCQUE2QjtBQUd6RCxTQUFTLHFCQUE4RDtBQUN2RSxTQUFTLCtCQUErQjtBQUV4QyxTQUFTLDBCQUEwQixzQ0FBc0M7QUFDekUsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxnQ0FBZ0MsMkNBQTJDO0FBRXBGLE1BQU0sSUFBSSxJQUFJO0FBRWQsTUFBTSxZQUE4RTtBQUFBLEVBQ25GLEVBQUUsT0FBTyxVQUFVLE9BQU8sU0FBUyw4QkFBOEIsUUFBUSxFQUFFO0FBQUEsRUFDM0UsRUFBRSxPQUFPLFVBQVUsT0FBTyxTQUFTLDhCQUE4QixRQUFRLEVBQUU7QUFBQSxFQUMzRSxFQUFFLE9BQU8sU0FBUyxPQUFPLFNBQVMsNkJBQTZCLE9BQU8sRUFBRTtBQUFBLEVBQ3hFLEVBQUUsT0FBTyxVQUFVLE9BQU8sU0FBUyw4QkFBOEIsUUFBUSxFQUFFO0FBQzVFO0FBR08sU0FBUyw4QkFBOEIsZUFBcUM7QUFDbEYsU0FBTywwQkFBMEIsYUFBYSxLQUFLLENBQUMsQ0FBQyxjQUFjO0FBQUEsSUFDbEU7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxlQUFzQiw2QkFDckIsV0FDQSxxQkFDQSwyQkFDQSw4QkFDbUI7QUFDbkIsUUFBTSxXQUFXLDBCQUEwQixpQkFBaUIsV0FBVyxtQkFBbUI7QUFDMUYsTUFBSSxDQUFDLFVBQVU7QUFDZCxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksQ0FBQyxTQUFTLFVBQVUsd0JBQXdCO0FBQy9DLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxDQUFDLENBQUMsTUFBTSw2QkFBNkIsc0JBQXNCO0FBQUEsSUFDakUsS0FBSztBQUFBLElBQ0wsU0FBUyxTQUFTLHNDQUFzQyw2RkFBNkY7QUFBQSxFQUN0SixDQUFDO0FBQ0Y7QUFPTyxTQUFTLDJDQUNmLGNBQ0Esc0JBQ0EsZUFDc0M7QUFDdEMsUUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLE1BQUksMkJBQTJCO0FBRS9CLFFBQU0sMkJBQTJCLE1BQThCLHFCQUFxQixFQUFFLE9BQU8sYUFBVztBQUN2RyxRQUFJLENBQUMsUUFBUSxlQUFlLFFBQVEsV0FBVyxLQUFLLFFBQVEsYUFBYSxVQUFVLEdBQUc7QUFDckYsYUFBTztBQUFBLElBQ1I7QUFDQSxhQUFTLFVBQThCLFNBQVMsU0FBUyxVQUFVLFFBQVEsZUFBZTtBQUN6RixVQUFJLFFBQVEsVUFBVSxRQUFRLGFBQWEsYUFBYSxNQUFNLFFBQVE7QUFDckUsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLFFBQVEsYUFBYSxpQkFBaUIsT0FBTztBQUNuRCxVQUFJLE1BQU0sWUFBWSxVQUFVLE1BQU0sZUFBZSxVQUFVO0FBQzlELGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSLENBQUM7QUFFRCxRQUFNLElBQUksSUFBSSxzQkFBc0IsY0FBYyxJQUFJLFVBQVUsVUFBVSxDQUFDLFVBQXlCO0FBQ25HLFVBQU0sU0FBUyxNQUFNO0FBQ3JCLFFBQUksa0JBQWtCLGFBQWEsZUFBZSxjQUFjLE1BQU0sR0FBRztBQUN4RSxpQ0FBMkIsTUFBTSxRQUFRO0FBQ3pDO0FBQUEsSUFDRDtBQUNBLCtCQUEyQjtBQUMzQixRQUFJLE1BQU0sUUFBUSxPQUFPO0FBQ3hCO0FBQUEsSUFDRDtBQUVBLFVBQU0sb0JBQW9CLHlCQUF5QjtBQUNuRCxRQUFJLGtCQUFrQixXQUFXLEdBQUc7QUFDbkM7QUFBQSxJQUNEO0FBQ0EsVUFBTSxnQkFBZ0IsYUFBYSxTQUFTO0FBQzVDLFFBQUksZUFBZSxrQkFBa0IsVUFBVSxhQUFXLFlBQVksYUFBYTtBQUNuRixRQUFJLGVBQWUsR0FBRztBQUNyQixxQkFBZSxrQkFBa0IsVUFBVSxhQUFXLENBQUMsQ0FBQyxpQkFBaUIsUUFBUSxTQUFTLGFBQWEsQ0FBQztBQUFBLElBQ3pHO0FBQ0EsUUFBSSxlQUFlLEdBQUc7QUFDckIscUJBQWUsTUFBTSxXQUFXLElBQUk7QUFBQSxJQUNyQztBQUNBLFVBQU0sWUFBWSxNQUFNLFlBQ3BCLGVBQWUsSUFBSSxrQkFBa0IsVUFBVSxrQkFBa0IsVUFDakUsZUFBZSxLQUFLLGtCQUFrQjtBQUMxQyxVQUFNLGVBQWU7QUFDckIsVUFBTSx5QkFBeUI7QUFDL0Isc0JBQWtCLFNBQVMsRUFBRSxNQUFNO0FBQUEsRUFDcEMsR0FBRyxJQUFJLENBQUM7QUFFUixRQUFNLElBQUksSUFBSSxzQkFBc0IsY0FBYyxJQUFJLFVBQVUsUUFBUSxDQUFDLFVBQXlCO0FBQ2pHLFFBQUksTUFBTSxRQUFRLFlBQVksMEJBQTBCO0FBQ3ZELGlDQUEyQjtBQUMzQixZQUFNLHlCQUF5QjtBQUMvQjtBQUFBLElBQ0Q7QUFDQSwrQkFBMkI7QUFBQSxFQUM1QixHQUFHLElBQUksQ0FBQztBQUVSLFNBQU87QUFBQSxJQUNOLFlBQVksTUFBTSx5QkFBeUIsRUFBRSxDQUFDLEdBQUcsTUFBTTtBQUFBLElBQ3ZELFNBQVMsTUFBTSxNQUFNLFFBQVE7QUFBQSxFQUM5QjtBQUNEO0FBa0NPLFNBQVMsaUNBQ2YsdUJBQ0EsWUFDQSxvQkFDQSxhQUNTO0FBQ1QsTUFBSSxDQUFDLHNCQUFzQixDQUFDLGFBQWE7QUFDeEMsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLGNBQWMsc0JBQXNCLG9CQUFvQixVQUFVO0FBQ3hFLE1BQUksYUFBYSwwQkFBMEIsb0JBQW9CO0FBQzlELFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxzQkFBc0Isb0JBQW9CLEVBQUUsS0FBSyx5QkFBdUI7QUFDOUUsVUFBTSxZQUFZLHNCQUFzQixvQkFBb0IsbUJBQW1CO0FBQy9FLFdBQU8sV0FBVywwQkFBMEIsZUFBZSxVQUFVLE9BQU8sWUFBWTtBQUFBLEVBQ3pGLENBQUMsS0FBSztBQUNQO0FBRUEsTUFBTSxxQ0FBcUM7QUFDM0MsTUFBTSx5Q0FBeUM7QUFDL0MsTUFBTSx3Q0FBd0M7QUFJOUMsU0FBUyw0QkFBNEIsV0FBd0IsU0FBd0I7QUFDcEYsWUFBVSxNQUFNLFVBQVUsVUFBVSxLQUFLO0FBQ3pDLE1BQUksU0FBUztBQUNaLGNBQVUsZ0JBQWdCLGFBQWE7QUFBQSxFQUN4QyxPQUFPO0FBQ04sY0FBVSxhQUFhLGVBQWUsTUFBTTtBQUFBLEVBQzdDO0FBQ0Q7QUFFTyxJQUFNLHlDQUFOLGNBQXFELG1CQUFtQjtBQUFBLEVBWTlFLFlBQ0MsUUFDaUIsT0FDQSxnQkFDQSxpQkFDQSxtQkFDQSxZQUNqQixTQUNpQixTQUNhLFlBQ2UsMkJBQ2Ysa0JBQ1Asc0JBQ3RCO0FBQ0QsVUFBTSxRQUFXLFFBQVEsT0FBTztBQVpmO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFFQTtBQUNhO0FBQ2U7QUFDZjtBQXRCL0IsU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBQ3pFLFNBQWlCLHVCQUF1QixLQUFLLFVBQVUsSUFBSSxrQkFBK0IsQ0FBQztBQUMzRixTQUFpQixnQkFBZ0IsS0FBSyxVQUFVLElBQUksa0JBQTJDLENBQUM7QUFDaEcsU0FBUSxrQkFBa0I7QUFFMUIsU0FBUSxrQkFBbUM7QUFFM0MsU0FBUSxXQUE4QixDQUFDO0FBRXZDLFNBQVEsNkJBQTZCO0FBaUJwQyxTQUFLLGVBQWUsS0FBSyxVQUFVLHFCQUFxQixlQUFlLGNBQWM7QUFBQSxNQUNwRixNQUFNO0FBQUEsTUFDTixlQUFlO0FBQUEsTUFDZixrQkFBa0I7QUFBQSxNQUNsQixnQkFBZ0I7QUFBQSxNQUNoQixzQkFBc0I7QUFBQSxNQUN0Qix1QkFBdUI7QUFBQSxNQUN2Qix3QkFBd0I7QUFBQSxNQUN4QixVQUFVO0FBQUEsTUFDVixnQkFBZ0IsWUFBVTtBQUN6QixhQUFLLGVBQWUsYUFBYSxNQUFNO0FBQ3ZDLGFBQUssb0JBQW9CO0FBQUEsTUFDMUI7QUFBQSxNQUNBLFNBQVMsTUFBTTtBQUNkLGFBQUssS0FBSyxpQkFBaUIsS0FBSyxlQUFlLFNBQVM7QUFBQSxNQUN6RDtBQUFBLE1BQ0EsV0FBVztBQUFBLFFBQ1YsT0FBTyxTQUFTLHNDQUFzQyxjQUFjO0FBQUEsUUFDcEUsV0FBVyxTQUFTLCtDQUErQyxvQkFBb0I7QUFBQSxRQUN2RixVQUFVLGFBQVc7QUFDcEIsZUFBSyxlQUFlLG9CQUFvQixVQUFVLGFBQWEsV0FBVztBQUMxRSxlQUFLLG9CQUFvQjtBQUFBLFFBQzFCO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVMsT0FBTyxXQUE4QjtBQUM3QyxTQUFLLGtCQUFrQixNQUFNO0FBQzdCLFNBQUsscUJBQXFCLE1BQU07QUFDaEMsU0FBSyxvQkFBb0I7QUFDekIsUUFBSSxVQUFVLFNBQVM7QUFDdkIsY0FBVSxNQUFNLGFBQWE7QUFDN0IsVUFBTSxVQUFVLEtBQUs7QUFDckIsUUFBSSxTQUFTO0FBQ1osV0FBSyxrQkFBa0IsSUFBSSxRQUFRLFlBQVU7QUFDNUMsb0NBQTRCLFdBQVcsUUFBUSxLQUFLLE1BQU0sQ0FBQztBQUFBLE1BQzVELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFFQSxVQUFNLGlCQUFpQixJQUFJLE9BQU8sV0FBVyxFQUFFLHNDQUFzQyxDQUFDO0FBQ3RGLFNBQUssYUFBYSxPQUFPLGNBQWM7QUFFdkMsU0FBSyx3QkFBd0I7QUFDN0IsU0FBSyxvQkFBb0I7QUFDekIsU0FBSyxrQkFBa0IsSUFBSSxRQUFRLFlBQVU7QUFDNUMsWUFBTSxZQUFZLEtBQUssZ0JBQWdCLEtBQUssTUFBTTtBQUNsRCxXQUFLLHVCQUF1QjtBQUM1QixXQUFLLEtBQUssaUJBQWlCLFNBQVM7QUFBQSxJQUNyQyxDQUFDLENBQUM7QUFDRixTQUFLLGtCQUFrQixJQUFJLEtBQUssa0JBQWtCLE1BQU07QUFDdkQsV0FBSyx1QkFBdUI7QUFBQSxJQUM3QixDQUFDLENBQUM7QUFDRixTQUFLLGtCQUFrQixJQUFJLEtBQUssMEJBQTBCLHdCQUF3QixNQUFNLEtBQUssdUJBQXVCLENBQUMsQ0FBQztBQUN0SCxTQUFLLGtCQUFrQixJQUFJO0FBQUEsTUFDMUIsU0FBUyxNQUFNO0FBQ2QsYUFBSyxvQkFBb0I7QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLDBCQUFnQztBQUN2QyxVQUFNLFlBQVksS0FBSyxlQUFlO0FBQ3RDLFVBQU0sZ0JBQWdCLEtBQUssTUFBTTtBQUNqQyxRQUFJLENBQUMsYUFBYSxDQUFDLGVBQWU7QUFDakMsV0FBSyw2QkFBNkI7QUFDbEMsV0FBSyxlQUFlLGlDQUFpQyxLQUFLO0FBQzFEO0FBQUEsSUFDRDtBQUNBLFVBQU0sY0FBYyxLQUFLLDBCQUEwQix5QkFBeUIsU0FBUyxFQUFFO0FBQUEsTUFBSyxlQUMzRixVQUFVLFlBQVksT0FBTyxrQkFDekIsS0FBSyxNQUFNLGVBQWUsVUFBYSxVQUFVLGVBQWUsS0FBSyxNQUFNO0FBQUEsSUFDaEYsR0FBRztBQUNILFFBQUksQ0FBQyxhQUFhO0FBQ2pCLFdBQUssNkJBQTZCO0FBQ2xDLFdBQUssZUFBZSxpQ0FBaUMsS0FBSztBQUMxRDtBQUFBLElBQ0Q7QUFDQSxTQUFLLDZCQUE2QjtBQUNsQyxVQUFNLGdDQUFnQyxZQUFZLGtDQUFrQztBQUNwRixTQUFLLGVBQWUsaUNBQWlDLDZCQUE2QjtBQUNsRixRQUFJLENBQUMsaUNBQWlDLEtBQUssZUFBZSxrQkFBa0IsWUFBWTtBQUN2RixXQUFLLGVBQWUsb0JBQW9CLFdBQVc7QUFBQSxJQUNwRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHlCQUErQjtBQUN0QyxTQUFLLHdCQUF3QjtBQUM3QixTQUFLLG9CQUFvQjtBQUFBLEVBQzFCO0FBQUEsRUFFUSxzQkFBNEI7QUFDbkMsVUFBTSxlQUFlLEtBQUssc0JBQXNCO0FBQ2hELFVBQU0sVUFBVSxLQUFLLG9CQUFvQjtBQUN6QyxVQUFNLGlCQUFpQixLQUFLLGVBQWUsa0JBQWtCLEtBQUssZUFBZTtBQUNqRixVQUFNLFdBQWtDLEtBQUssU0FBUyxJQUFJLGFBQVc7QUFBQSxNQUNwRSxNQUFNO0FBQUEsTUFDTixVQUFVLFdBQVc7QUFBQSxJQUN0QixFQUFFO0FBQ0YsUUFBSSxrQkFBa0IsQ0FBQyxLQUFLLFNBQVMsU0FBUyxjQUFjLEdBQUc7QUFDOUQsZUFBUyxRQUFRO0FBQUEsUUFDaEIsTUFBTTtBQUFBLFFBQ04sVUFBVTtBQUFBLFFBQ1YsYUFBYTtBQUFBLE1BQ2QsQ0FBQztBQUFBLElBQ0Y7QUFDQSxVQUFNLDRCQUE0QixLQUFLLDZCQUE2QjtBQUNwRSxVQUFNLGlCQUNMLDhCQUE4QixTQUFZLFlBQVk7QUFFdkQsU0FBSyxhQUFhLE9BQU87QUFBQSxNQUN4QixPQUFPLGFBQWE7QUFBQSxNQUNwQjtBQUFBLE1BQ0EsUUFBUSxLQUFLLG9CQUFvQix1QkFBdUIsS0FBSyxvQkFBb0Isb0JBQzlFLFlBQ0EsS0FBSyxvQkFBb0IsVUFDeEIsVUFDQSxLQUFLLG9CQUFvQixVQUN4QixVQUNBO0FBQUEsTUFDTDtBQUFBLE1BQ0EsZ0JBQWdCLGFBQWE7QUFBQSxNQUM3QixTQUFTLGFBQWE7QUFBQSxNQUN0QixhQUFhLEtBQUssZUFBZSx5QkFBeUIsS0FBSyxvQkFBb0I7QUFBQSxNQUNuRixXQUFXO0FBQUEsUUFDVixTQUFTLEtBQUssZUFBZSxrQkFBa0I7QUFBQSxRQUMvQyxPQUFPO0FBQUEsUUFDUCxnQkFBZ0I7QUFBQSxNQUNqQjtBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssV0FBVztBQUFBLEVBQ2pCO0FBQUEsRUFFUSx3QkFBd0c7QUFDL0csVUFBTSxnQkFBZ0IsS0FBSyxlQUFlO0FBQzFDLFFBQUksQ0FBQyxLQUFLLGVBQWUsV0FBVztBQUNuQyxhQUFPO0FBQUEsUUFDTixPQUFPLFNBQVMsa0NBQWtDLFFBQUc7QUFBQSxRQUNyRCxRQUFRLFNBQVMseUNBQXlDLDhDQUE4QztBQUFBLFFBQ3hHLFNBQVM7QUFBQSxNQUNWO0FBQUEsSUFDRDtBQUNBLFFBQUksQ0FBQyxLQUFLLDRCQUE0QjtBQUNyQyxhQUFPO0FBQUEsUUFDTixPQUFPLGlCQUFpQixTQUFTLGtDQUFrQyxRQUFHO0FBQUEsUUFDdEUsUUFBUSxTQUFTLGtEQUFrRCxtQ0FBbUM7QUFBQSxRQUN0RyxTQUFTLENBQUM7QUFBQSxNQUNYO0FBQUEsSUFDRDtBQUNBLFFBQUksQ0FBQyxLQUFLLGVBQWUsK0JBQStCO0FBQ3ZELGFBQU87QUFBQSxRQUNOLE9BQU8saUJBQWlCLFNBQVMsa0NBQWtDLFFBQUc7QUFBQSxRQUN0RSxRQUFRLFNBQVMsNENBQTRDLDJFQUEyRTtBQUFBLFFBQ3hJLFNBQVMsQ0FBQztBQUFBLE1BQ1g7QUFBQSxJQUNEO0FBQ0EsUUFBSSxLQUFLLG9CQUFvQixTQUFTO0FBQ3JDLGFBQU87QUFBQSxRQUNOLE9BQU8saUJBQWlCLFNBQVMsb0NBQW9DLHlCQUF5QjtBQUFBLFFBQzlGLFFBQVEsU0FBUywwQ0FBMEMseURBQXlEO0FBQUEsUUFDcEgsU0FBUyxDQUFDO0FBQUEsTUFDWDtBQUFBLElBQ0Q7QUFDQSxRQUFJLEtBQUssZUFBZSxrQkFBa0IsWUFBWTtBQUNyRCxhQUFPO0FBQUEsUUFDTixPQUFPLGlCQUFpQixLQUFLLGtCQUFrQixTQUFTLGtDQUFrQyxRQUFHO0FBQUEsUUFDN0YsUUFBUSxTQUFTLDJDQUEyQyxxQ0FBcUM7QUFBQSxRQUNqRyxTQUFTLENBQUMsaUJBQWlCLENBQUMsS0FBSztBQUFBLE1BQ2xDO0FBQUEsSUFDRDtBQUNBLFlBQVEsS0FBSyxpQkFBaUI7QUFBQSxNQUM3QixLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQ0osZUFBTztBQUFBLFVBQ04sT0FBTyxpQkFBaUIsU0FBUyxrQ0FBa0Msd0JBQW1CO0FBQUEsVUFDdEYsUUFBUSxTQUFTLHdDQUF3Qyw2QkFBNkI7QUFBQSxVQUN0RixTQUFTLENBQUM7QUFBQSxRQUNYO0FBQUEsTUFDRCxLQUFLO0FBQ0osZUFBTztBQUFBLFVBQ04sT0FBTyxpQkFBaUIsU0FBUyxpQ0FBaUMsYUFBYTtBQUFBLFVBQy9FLFFBQVEsU0FBUyx1Q0FBdUMsc0RBQXNEO0FBQUEsVUFDOUcsU0FBUyxDQUFDO0FBQUEsUUFDWDtBQUFBLE1BQ0QsS0FBSztBQUNKLGVBQU87QUFBQSxVQUNOLE9BQU8saUJBQWlCLFNBQVMscUNBQXFDLG1CQUFtQjtBQUFBLFVBQ3pGLFFBQVEsU0FBUywyQ0FBMkMsa0RBQWtEO0FBQUEsVUFDOUcsU0FBUyxDQUFDO0FBQUEsUUFDWDtBQUFBLE1BQ0QsS0FBSztBQUNKLGVBQU87QUFBQSxVQUNOLE9BQU8saUJBQWlCLFNBQVMsaUNBQWlDLGVBQWU7QUFBQSxVQUNqRixRQUFRLFNBQVMsdUNBQXVDLHNEQUFzRDtBQUFBLFVBQzlHLFNBQVMsQ0FBQztBQUFBLFFBQ1g7QUFBQSxNQUNELEtBQUs7QUFDSixlQUFPO0FBQUEsVUFDTixPQUFPLFNBQVMsa0NBQWtDLFFBQUc7QUFBQSxVQUNyRCxRQUFRLFNBQVMseUNBQXlDLDhDQUE4QztBQUFBLFVBQ3hHLFNBQVM7QUFBQSxRQUNWO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHNCQUErQjtBQUN0QyxRQUFJLEtBQUssb0JBQW9CLFNBQVM7QUFDckMsYUFBTyxDQUFDLENBQUMsS0FBSyxlQUFlLGFBQWEsS0FBSyw4QkFBOEIsS0FBSyxlQUFlO0FBQUEsSUFDbEc7QUFDQSxXQUFPLEtBQUssZUFBZSx5QkFDdkIsS0FBSyxvQkFBb0IsY0FDekIsS0FBSyxvQkFBb0Isa0JBQ3pCLEtBQUssb0JBQW9CLHVCQUN6QixLQUFLLG9CQUFvQjtBQUFBLEVBQzlCO0FBQUEsRUFFUSwrQkFBbUQ7QUFDMUQsUUFBSSxDQUFDLEtBQUssZUFBZSxXQUFXO0FBQ25DLGFBQU8sU0FBUyw4Q0FBOEMsNENBQTRDO0FBQUEsSUFDM0c7QUFDQSxRQUFJLENBQUMsS0FBSyw0QkFBNEI7QUFDckMsYUFBTyxTQUFTLGtEQUFrRCxtQ0FBbUM7QUFBQSxJQUN0RztBQUNBLFFBQUksQ0FBQyxLQUFLLGVBQWUsK0JBQStCO0FBQ3ZELGFBQU8sU0FBUyxpREFBaUQsNENBQTRDO0FBQUEsSUFDOUc7QUFDQSxRQUFJLEtBQUssZUFBZSxnQkFBZ0I7QUFDdkMsYUFBTztBQUFBLElBQ1I7QUFDQSxZQUFRLEtBQUssaUJBQWlCO0FBQUEsTUFDN0IsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUNKLGVBQU8sU0FBUyx3Q0FBd0MsNkJBQTZCO0FBQUEsTUFDdEYsS0FBSztBQUNKLGVBQU8sU0FBUyx1Q0FBdUMsc0RBQXNEO0FBQUEsTUFDOUcsS0FBSztBQUNKLGVBQU8sU0FBUywwQ0FBMEMseURBQXlEO0FBQUEsTUFDcEgsS0FBSztBQUNKLGVBQU8sU0FBUywyQ0FBMkMsa0RBQWtEO0FBQUEsTUFDOUcsS0FBSztBQUNKLGVBQU8sS0FBSyxTQUFTLFNBQVMsSUFDM0IsU0FDQSxTQUFTLDJDQUEyQyxrREFBa0Q7QUFBQSxNQUMxRyxLQUFLO0FBQ0osZUFBTyxTQUFTLDhDQUE4Qyw0Q0FBNEM7QUFBQSxJQUM1RztBQUFBLEVBQ0Q7QUFBQSxFQUVRLHNCQUE0QjtBQUNuQyxTQUFLLGNBQWMsT0FBTyxPQUFPO0FBQ2pDLFNBQUssY0FBYyxNQUFNO0FBQUEsRUFDMUI7QUFBQSxFQUVBLE1BQWMsaUJBQWlCLFFBQXdDO0FBQ3RFLFVBQU0sWUFBWSxFQUFFLEtBQUs7QUFDekIsU0FBSyxvQkFBb0I7QUFDekIsU0FBSyxxQkFBcUIsTUFBTTtBQUNoQyxTQUFLLGFBQWE7QUFDbEIsU0FBSyxXQUFXLENBQUM7QUFDakIsU0FBSyxpQkFBaUI7QUFDdEIsUUFBSSxDQUFDLFFBQVE7QUFDWixXQUFLLGtCQUFrQjtBQUN2QixXQUFLLGVBQWUsY0FBYyxNQUFTO0FBQzNDLFdBQUssb0JBQW9CO0FBQ3pCO0FBQUEsSUFDRDtBQUNBLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssb0JBQW9CO0FBQ3pCLFVBQU0sTUFBTSxJQUFJLHdCQUF3QjtBQUN4QyxTQUFLLGNBQWMsUUFBUTtBQUMzQixRQUFJO0FBQ0osUUFBSTtBQUNILGFBQU8sTUFBTSxLQUFLLFdBQVcsZUFBZSxNQUFNO0FBQUEsSUFDbkQsU0FBUyxPQUFPO0FBQ2YsVUFBSSxjQUFjLEtBQUssbUJBQW1CLElBQUksTUFBTSx5QkFBeUI7QUFDNUU7QUFBQSxNQUNEO0FBQ0EsV0FBSyxpQkFBaUIsTUFBTSwwRUFBMEUsS0FBSztBQUMzRyxXQUFLLGtCQUFrQjtBQUN2QixXQUFLLG9CQUFvQjtBQUN6QjtBQUFBLElBQ0Q7QUFDQSxRQUFJLGNBQWMsS0FBSyxtQkFBbUIsSUFBSSxNQUFNLHlCQUF5QjtBQUM1RTtBQUFBLElBQ0Q7QUFDQSxRQUFJLENBQUMsTUFBTTtBQUNWLFdBQUssa0JBQWtCO0FBQ3ZCLFdBQUssb0JBQW9CO0FBQ3pCO0FBQUEsSUFDRDtBQUNBLFNBQUssYUFBYTtBQUNsQixVQUFNLFVBQVUsSUFBSSxnQkFBZ0I7QUFDcEMsWUFBUSxJQUFJLFFBQVEsWUFBVTtBQUM3QixZQUFNLE9BQU8sS0FBSyxNQUFNLEtBQUssTUFBTSxFQUFFO0FBQ3JDLFVBQUksTUFBTSxVQUFVLEtBQUssTUFBTTtBQUM5QixhQUFLLGlCQUFpQjtBQUN0QixhQUFLLGVBQWUsY0FBYyxLQUFLLElBQUk7QUFBQSxNQUM1QyxXQUFXLE1BQU0sUUFBUTtBQUN4QixhQUFLLGlCQUFpQixTQUFTLG1DQUFtQyxTQUFTLEtBQUssT0FBTyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0FBQ2xHLGFBQUssZUFBZSxjQUFjLE1BQVM7QUFBQSxNQUM1QyxPQUFPO0FBQ04sYUFBSyxpQkFBaUI7QUFDdEIsYUFBSyxlQUFlLGNBQWMsTUFBUztBQUFBLE1BQzVDO0FBQ0EsV0FBSyxvQkFBb0I7QUFBQSxJQUMxQixDQUFDLENBQUM7QUFDRixTQUFLLHFCQUFxQixRQUFRO0FBQ2xDLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssb0JBQW9CO0FBQ3pCLFFBQUk7QUFDSCxZQUFNLE9BQU8sTUFBTSxLQUFLLFFBQVEsRUFBRSxTQUFTLGFBQWEsR0FBRyxJQUFJLEtBQUs7QUFDcEUsVUFBSSxjQUFjLEtBQUssbUJBQW1CLElBQUksTUFBTSwyQkFBMkIsS0FBSyxlQUFlLE1BQU07QUFDeEc7QUFBQSxNQUNEO0FBQ0EsV0FBSyxXQUFXLCtCQUErQixLQUFLLElBQUksU0FBTyxJQUFJLElBQUksQ0FBQztBQUN4RSxXQUFLLGtCQUFrQixLQUFLLFNBQVMsU0FBUyxJQUFJLFVBQVU7QUFBQSxJQUM3RCxTQUFTLE9BQU87QUFDZixVQUFJLGNBQWMsS0FBSyxtQkFBbUIsSUFBSSxNQUFNLHlCQUF5QjtBQUM1RTtBQUFBLE1BQ0Q7QUFDQSxXQUFLLGlCQUFpQixNQUFNLHFEQUFxRCxLQUFLO0FBQ3RGLFdBQUssa0JBQWtCO0FBQUEsSUFDeEI7QUFDQSxTQUFLLG9CQUFvQjtBQUFBLEVBQzFCO0FBQ0Q7QUFoV2EseUNBQU47QUFBQSxFQXFCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBeEJVO0FBd1diLE1BQU0sdUNBQXVDLG1CQUFtQjtBQUFBLEVBRy9ELFlBQ0MsUUFDaUIsY0FDQSxTQUNqQixTQUNDO0FBQ0QsVUFBTSxRQUFXLFFBQVEsT0FBTztBQUpmO0FBQ0E7QUFMbEIsU0FBaUIsa0JBQWtCLEtBQUssVUFBVSxJQUFJLGtCQUErQixDQUFDO0FBQUEsRUFTdEY7QUFBQSxFQUVTLE9BQU8sV0FBOEI7QUFDN0MsVUFBTSxPQUFPLFNBQVM7QUFDdEIsUUFBSSxVQUFVLFNBQVM7QUFDdkIsU0FBSyxhQUFhLFNBQVM7QUFDM0IsVUFBTSxVQUFVLEtBQUs7QUFDckIsU0FBSyxnQkFBZ0IsUUFBUSxVQUFVLFFBQVEsWUFBVTtBQUN4RCxrQ0FBNEIsV0FBVyxRQUFRLEtBQUssTUFBTSxDQUFDO0FBQUEsSUFDNUQsQ0FBQyxJQUFJO0FBQUEsRUFDTjtBQUNEO0FBRUEsZ0JBQWdCLE1BQU0seUNBQXlDLFFBQVE7QUFBQSxFQUN0RSxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLHNDQUFzQywwQkFBMEI7QUFBQSxNQUNqRixJQUFJO0FBQUEsTUFDSixjQUFjLGdCQUFnQjtBQUFBLE1BQzlCLE1BQU0sQ0FBQztBQUFBLFFBQ04sSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNLGdCQUFnQjtBQUFBLE1BQ3ZCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFlLE1BQXFCO0FBQUEsRUFBb0M7QUFDekUsQ0FBQztBQUVELGdCQUFnQixNQUFNLDZDQUE2QyxRQUFRO0FBQUEsRUFDMUUsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSwwQ0FBMEMsOEJBQThCO0FBQUEsTUFDekYsSUFBSTtBQUFBLE1BQ0osY0FBYyxnQkFBZ0I7QUFBQSxNQUM5QixNQUFNLENBQUM7QUFBQSxRQUNOLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxnQkFBZ0I7QUFBQSxNQUN2QixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBZSxNQUFxQjtBQUFBLEVBQW9DO0FBQ3pFLENBQUM7QUFFRCxnQkFBZ0IsTUFBTSw0Q0FBNEMsUUFBUTtBQUFBLEVBQ3pFLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUseUNBQXlDLDZCQUE2QjtBQUFBLE1BQ3ZGLElBQUk7QUFBQSxNQUNKLGNBQWMsZ0JBQWdCO0FBQUEsTUFDOUIsTUFBTSxDQUFDO0FBQUEsUUFDTixJQUFJLE9BQU87QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLE1BQU0sZ0JBQWdCO0FBQUEsTUFDdkIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWUsTUFBcUI7QUFBQSxFQUFvQztBQUN6RSxDQUFDO0FBRU0sU0FBUyxXQUNmLE1BQ0EsT0FDQSxhQUNBLFlBQ0EsWUFDQSxzQkFDQSxtQkFDQSxvQkFDQSxzQkFDQSx1QkFDQSxlQUNBLFlBQ0EsZ0JBQ0EsMkJBQ0EsOEJBQ0EsZUFDQSxhQUNBLHdCQUNBLGdCQUNvQjtBQUNwQixRQUFNLFVBQVUsSUFBSSxPQUFPLE1BQU0sRUFBRSxzQkFBc0IsQ0FBQztBQUMxRCxNQUFJLE9BQU8sU0FBUyxFQUFFLDhCQUE4QixRQUFXLFNBQVMsd0JBQXdCLE1BQU0sQ0FBQyxDQUFDO0FBQ3hHLFFBQU0scUJBQXFCLElBQUksT0FBTyxTQUFTLEVBQUUsNkJBQTZCLENBQUM7QUFDL0UsUUFBTSxZQUFZLFlBQVksSUFBSSxJQUFJLFNBQVMsb0JBQW9CLG9CQUFvQjtBQUFBLElBQ3RGLGdCQUFnQjtBQUFBLElBQ2hCLGFBQWEsU0FBUyxtQ0FBbUMsNEJBQTRCO0FBQUEsSUFDckYsV0FBVyxTQUFTLHdCQUF3QixNQUFNO0FBQUEsRUFDbkQsQ0FBQyxDQUFDO0FBQ0YsWUFBVSxRQUFRLE1BQU07QUFDeEIsY0FBWSxJQUFJLFVBQVUsWUFBWSxXQUFTO0FBQzlDLFVBQU0sT0FBTztBQUNiLGVBQVc7QUFBQSxFQUNaLENBQUMsQ0FBQztBQUVGLFFBQU0sY0FBYyxJQUFJLE9BQU8sTUFBTSxFQUFFLG1EQUFtRCxDQUFDO0FBQzNGLFFBQU0saUJBQWlCLENBQUMscUJBQXFCLG9CQUFvQjtBQUVqRSxRQUFNLGdCQUFnQixJQUFJLE9BQU8sYUFBYSxFQUFFLGlDQUFpQyxDQUFDO0FBQ2xGLE1BQUksT0FBTyxlQUFlLEVBQUUsK0JBQStCLFFBQVcsU0FBUyw0QkFBNEIsVUFBVSxDQUFDLENBQUM7QUFDdkgsUUFBTSxrQkFBdUMsVUFBVSxJQUFJLFdBQVMsRUFBRSxNQUFNLEtBQUssTUFBTSxFQUFFO0FBQ3pGLFFBQU0sZ0JBQWdCLEtBQUssSUFBSSxHQUFHLFVBQVUsVUFBVSxVQUFRLEtBQUssVUFBVSxNQUFNLFFBQVEsQ0FBQztBQUM1RixRQUFNLGlCQUFpQixZQUFZLElBQUksSUFBSTtBQUFBLElBQzFDO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQSxFQUFFLFdBQVcsU0FBUyw0QkFBNEIsVUFBVSxHQUFHLGVBQWU7QUFBQSxFQUMvRSxDQUFDO0FBQ0QsUUFBTSwwQkFBMEIsSUFBSSxPQUFPLGVBQWUsRUFBRSw0Q0FBNEMsQ0FBQztBQUN6RyxpQkFBZSxPQUFPLHVCQUF1QjtBQUU3QyxRQUFNLFlBQVksSUFBSSxPQUFPLGFBQWEsRUFBRSw0REFBNEQsQ0FBQztBQUN6RyxNQUFJLE9BQU8sV0FBVyxFQUFFLCtCQUErQixRQUFXLFNBQVMsd0JBQXdCLE1BQU0sQ0FBQyxDQUFDO0FBQzNHLFFBQU0sY0FBYyxpQkFBaUI7QUFDckMsUUFBTSxtQkFBbUIsdUJBQXVCLE1BQU0sTUFBTSxNQUFNLE1BQU07QUFDeEUsUUFBTSxPQUFPLFlBQVksZ0JBQWdCLEVBQUU7QUFDM0MsUUFBTSxTQUFTLFlBQVksZ0JBQWdCLEVBQUU7QUFDN0MsUUFBTSxhQUFhLFlBQVksSUFBSSxJQUFJO0FBQUEsSUFDdEMsWUFBWSxJQUFJLFVBQVEsRUFBRSxNQUFNLElBQUksTUFBTSxFQUE4QjtBQUFBLElBQ3hFO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBLEVBQUUsV0FBVyxTQUFTLHdCQUF3QixNQUFNLEdBQUcsZUFBZTtBQUFBLEVBQ3ZFLENBQUM7QUFDRCxRQUFNLHNCQUFzQixJQUFJLE9BQU8sV0FBVyxFQUFFLGtGQUFrRixDQUFDO0FBQ3ZJLGFBQVcsT0FBTyxtQkFBbUI7QUFDckMsY0FBWSxJQUFJLFdBQVcsWUFBWSxPQUFLO0FBQzNDLFVBQU0sTUFBTSxZQUFZLEVBQUUsS0FBSztBQUMvQixVQUFNLE9BQU8sSUFBSTtBQUNqQixVQUFNLFNBQVMsSUFBSTtBQUFBLEVBQ3BCLENBQUMsQ0FBQztBQUVGLFFBQU0sV0FBVyxJQUFJLE9BQU8sYUFBYSxFQUFFLDJEQUEyRCxDQUFDO0FBQ3ZHLE1BQUksT0FBTyxVQUFVLEVBQUUsK0JBQStCLFFBQVcsU0FBUyx1QkFBdUIsYUFBYSxDQUFDLENBQUM7QUFDaEgsUUFBTSxhQUFrQyxhQUFhLElBQUksUUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFO0FBQzNFLFFBQU0sWUFBWSxZQUFZLElBQUksSUFBSTtBQUFBLElBQ3JDO0FBQUEsSUFDQSxLQUFLLElBQUksS0FBSyxJQUFJLE1BQU0sS0FBSyxDQUFDLEdBQUcsYUFBYSxTQUFTLENBQUM7QUFBQSxJQUN4RDtBQUFBLElBQ0E7QUFBQSxJQUNBLEVBQUUsV0FBVyxTQUFTLHVCQUF1QixhQUFhLEdBQUcsZUFBZTtBQUFBLEVBQzdFLENBQUM7QUFDRCxRQUFNLHFCQUFxQixJQUFJLE9BQU8sVUFBVSxFQUFFLDRDQUE0QyxDQUFDO0FBQy9GLFlBQVUsT0FBTyxrQkFBa0I7QUFDbkMsY0FBWSxJQUFJLFVBQVUsWUFBWSxPQUFLO0FBQzFDLFVBQU0sTUFBTSxFQUFFO0FBQUEsRUFDZixDQUFDLENBQUM7QUFFRixRQUFNLDBCQUEwQixNQUFNO0FBQ3JDLFVBQU0sV0FBVyxNQUFNLGFBQWEsV0FBVyxNQUFNLGFBQWE7QUFDbEUsVUFBTSxVQUFVLE1BQU0sYUFBYTtBQUNuQyxjQUFVLE1BQU0sVUFBVSxXQUFXLEtBQUs7QUFDMUMsYUFBUyxNQUFNLFVBQVUsVUFBVSxLQUFLO0FBQUEsRUFDekM7QUFDQSwwQkFBd0I7QUFDeEIsY0FBWSxJQUFJLGVBQWUsWUFBWSxPQUFLO0FBQy9DLFVBQU0sV0FBVyxVQUFVLEVBQUUsS0FBSyxFQUFFO0FBQ3BDLDRCQUF3QjtBQUFBLEVBQ3pCLENBQUMsQ0FBQztBQUdGLFFBQU0saUJBQWlCLElBQUkseUJBQXlCLEtBQUs7QUFDekQsUUFBTSwyQkFBMkIsUUFBUSxZQUFVLENBQUMsZUFBZSxlQUFlLEtBQUssTUFBTSxDQUFDO0FBQzlGLFFBQU0sb0JBQW9CLFlBQVksSUFBSSxxQkFBcUIsZUFBZSx5QkFBeUIsZ0JBQXNDLE1BQVMsR0FBRyxFQUFFLGtCQUFrQixPQUFPLGlCQUFpQiwrQkFBK0IsYUFBYSxNQUFNLENBQUMsQ0FBQztBQUN6UCxvQkFBa0IsbUJBQW1CLGVBQWUsY0FBYztBQUNsRSxvQkFBa0IsZ0JBQWdCLGVBQWUsY0FBYztBQUFBLElBQzlELGFBQWEsTUFBTSxnQkFDaEIsRUFBRSxZQUFZLE1BQU0sWUFBWSxlQUFlLE1BQU0sY0FBYyxJQUNuRTtBQUFBLElBQ0gsZ0NBQWdDO0FBQUEsRUFDakMsQ0FBQztBQUVELFFBQU0seUJBQXlCLFlBQVksSUFBSSxJQUFJLFFBQTRCLENBQUM7QUFDaEYsUUFBTSwyQkFBMkIsWUFBWSxJQUFJLElBQUksUUFBYyxDQUFDO0FBQ3BFLFFBQU0sc0JBQWtEO0FBQUEsSUFDdkQsMEJBQTBCLE1BQU0sa0JBQWtCLDJCQUEyQixJQUFJO0FBQUEsSUFDakYsa0NBQWtDLHVCQUF1QjtBQUFBLEVBQzFEO0FBQ0EsUUFBTSxzQkFBc0IsTUFBTTtBQUNqQyxVQUFNLE9BQU8sa0JBQWtCO0FBQy9CLFVBQU0sYUFBYSxNQUFNO0FBQ3pCLFVBQU0sZ0JBQWdCLE1BQU07QUFDNUIsNkJBQXlCLEtBQUs7QUFBQSxFQUMvQjtBQUNBLGNBQVksSUFBSSxRQUFRLFlBQVU7QUFDakMsVUFBTSxjQUFjLGtCQUFrQiwyQkFBMkIsS0FBSyxNQUFNO0FBQzVFLFFBQUksYUFBYTtBQUNoQiw2QkFBdUIsS0FBSyxXQUFXO0FBQUEsSUFDeEM7QUFBQSxFQUNELENBQUMsQ0FBQztBQUVGLHNCQUFvQjtBQUlwQixjQUFZLElBQUksa0JBQWtCLHdCQUF3QixNQUFNO0FBQy9ELHdCQUFvQjtBQUNwQixlQUFXO0FBQUEsRUFDWixDQUFDLENBQUM7QUFFRixRQUFNLGtCQUFrQixZQUFZLElBQUkscUJBQXFCLGVBQWUsa0NBQWtDO0FBQUEsSUFDN0csb0JBQW9CLENBQUMsV0FBVyx3QkFDL0IsNkJBQTZCLFdBQVcscUJBQXFCLDJCQUEyQiw0QkFBNEI7QUFBQSxFQUN0SCxDQUFDLENBQUM7QUFDRixrQkFBZ0IsZUFBZSxjQUFjO0FBQzdDLGtCQUFnQixpQkFBaUIsYUFBYTtBQUU5QyxNQUFJLE1BQU0sV0FBVztBQUNwQixvQkFBZ0IscUJBQXFCLE1BQU0sV0FBVyxFQUFFLFdBQVcsT0FBTyxTQUFTLE1BQU0sQ0FBQztBQUFBLEVBQzNGO0FBRUEsY0FBWSxJQUFJLGdCQUFnQixxQkFBcUIsU0FBTztBQUMzRCxRQUFJLGVBQWUsYUFBYSxHQUFHLEdBQUc7QUFDckMsaUJBQVc7QUFBQSxJQUNaO0FBQUEsRUFDRCxDQUFDLENBQUM7QUFFRixNQUFJLENBQUMsTUFBTSxlQUFlLENBQUMsTUFBTSxhQUFhLGdCQUFnQixtQkFBbUI7QUFDaEYsbUJBQWUsYUFBYSxnQkFBZ0IsaUJBQWlCO0FBQUEsRUFDOUQ7QUFFQSxjQUFZLElBQUksUUFBUSxZQUFVO0FBQ2pDLG1CQUFlLGVBQWUsS0FBSyxNQUFNO0FBQ3pDLGVBQVc7QUFBQSxFQUNaLENBQUMsQ0FBQztBQUVGLFFBQU0sWUFBWSxJQUFJLE9BQU8sTUFBTSxFQUFFLHNCQUFzQixDQUFDO0FBQzVELE1BQUksT0FBTyxXQUFXLEVBQUUsK0JBQStCLFFBQVcsU0FBUywwQkFBMEIsUUFBUSxDQUFDLENBQUM7QUFDL0csUUFBTSxhQUFhLElBQUksT0FBTyxXQUFXLEVBQUUsa0RBQWtELENBQUM7QUFFOUYsUUFBTSxrQkFBb0M7QUFBQSxJQUN6QyxtQkFBbUI7QUFBQSxJQUNuQixnQkFBZ0I7QUFBQSxJQUNoQixnQkFBZ0I7QUFBQSxFQUNqQjtBQUVBLFFBQU0sbUJBQTBDO0FBQUEsSUFDL0MsaUJBQWlCO0FBQUEsSUFDakIsOEJBQThCO0FBQUEsSUFDOUIsa0JBQWtCO0FBQUEsSUFDbEIsdUJBQXVCO0FBQUEsSUFDdkIsdUJBQXVCO0FBQUEsSUFDdkIscUJBQXFCO0FBQUEsSUFDckIsNEJBQTRCO0FBQUEsSUFDNUIsMEJBQTBCO0FBQUEsSUFDMUIsT0FBTztBQUFBLE1BQ04sZ0JBQWdCLE9BQU87QUFBQSxNQUN2QixpQkFBaUI7QUFBQSxJQUNsQjtBQUFBLElBQ0EsbUJBQW1CO0FBQUEsSUFDbkIscUJBQXFCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBTXJCLDRCQUE0QjtBQUFBLElBQzVCLDJCQUEyQjtBQUFBLElBQzNCLHdDQUF3QyxDQUFDLFFBQVEsZ0JBQWdCO0FBQ2hFLFVBQUksT0FBTyxPQUFPLG9DQUFvQztBQUNyRCxlQUFPLElBQUksK0JBQStCLFFBQVEsZUFBYSxrQkFBa0IsT0FBTyxTQUFTLEdBQUcsUUFBVyxXQUFXO0FBQUEsTUFDM0g7QUFDQSxVQUFJLE9BQU8sT0FBTyx3Q0FBd0M7QUFDekQsZUFBTyxJQUFJLCtCQUErQixRQUFRLGVBQWE7QUFDOUQsb0JBQVUsVUFBVSxJQUFJLHdCQUF3QjtBQUNoRCwwQkFBZ0IsT0FBTyxTQUFTO0FBQUEsUUFDakMsR0FBRyxRQUFXLFdBQVc7QUFBQSxNQUMxQjtBQUNBLFVBQUksT0FBTyxPQUFPLHVDQUF1QztBQUN4RCxjQUFNLE9BQU8scUJBQXFCO0FBQUEsVUFDakM7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBLGVBQWU7QUFBQSxVQUNmLHlCQUF5QjtBQUFBLFVBQ3pCO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFLQSxRQUFNLGFBQWlDO0FBQUEsSUFDdEMsc0JBQXNCLE1BQU07QUFBQSxJQUM1QixXQUFXO0FBQUEsSUFDWCxVQUFVLENBQUM7QUFBQSxJQUNYLFVBQVUsa0JBQWtCO0FBQUEsSUFDNUIsYUFBYSxDQUFDO0FBQUEsSUFDZCxtQkFBbUIsTUFBTTtBQUFBLElBQUU7QUFBQSxJQUMzQix1QkFBdUIsTUFBTTtBQUFBLElBQUU7QUFBQSxFQUNoQztBQUdBLFFBQU0sMEJBQTBCLFlBQVksSUFBSSxrQkFBa0IsYUFBYSxVQUFVLENBQUM7QUFDMUYsa0JBQWdCLFNBQVMsT0FBTyx1QkFBdUIsRUFBRSxJQUFJLGtCQUFrQixJQUFJO0FBQ25GLGtCQUFnQixjQUFjLE9BQU8sdUJBQXVCLEVBQUUsSUFBSSxJQUFJO0FBQ3RFLGtCQUFnQixvQkFBb0IsT0FBTyx1QkFBdUIsRUFBRSxJQUFJLElBQUk7QUFDNUUsUUFBTSw2QkFBNkIsWUFBWTtBQUFBLElBQzlDLHFCQUFxQixZQUFZLElBQUksa0JBQWtCLENBQUMsb0JBQW9CLHVCQUF1QixDQUFDLENBQUM7QUFBQSxFQUN0RztBQUVBLFFBQU0sWUFBWSxZQUFZO0FBQUEsSUFDN0IsMkJBQTJCLGVBQWUsZUFBZSxrQkFBa0IsTUFBTSxrQkFBa0IsaUJBQWlCLEtBQUs7QUFBQSxFQUMxSDtBQUNBLFlBQVUsT0FBTyxZQUFZLGVBQWUsVUFBeUI7QUFDckUsWUFBVSxZQUFZLGNBQWMsRUFBRSxhQUFhLFNBQVMsc0NBQXNDLG9DQUFvQyxFQUFFLENBQUM7QUFFekksTUFBSSxhQUFhO0FBQ2hCLFVBQU0sMkJBQTJCLE1BQU07QUFDdEMsWUFBTSxRQUFRLFVBQVUsb0JBQW9CLElBQUk7QUFDaEQsYUFBTyxNQUFNLGFBQWEsV0FBVyxLQUFLLE1BQU0sZUFBZSxXQUFXO0FBQUEsSUFDM0U7QUFDQSxVQUFNLDRCQUE0QixNQUFNO0FBQ3ZDLFlBQU0sT0FBTyx5QkFBeUI7QUFDdEMsYUFBTyxDQUFDLENBQUMsUUFBUSxpQkFBaUIsdUJBQXVCLENBQUMsd0JBQXdCLE1BQU0sY0FBYztBQUFBLElBQ3ZHO0FBRUEsUUFBSSwwQkFBMEIsR0FBRztBQUNoQyxpQkFBVyxNQUFNLDJEQUEyRCxXQUFXLHNDQUFzQztBQUFBLElBQzlILE9BQU87QUFDTixnQkFBVTtBQUFBLFFBQVk7QUFBQTtBQUFBLFFBQWtDO0FBQUEsTUFBSztBQUFBLElBQzlEO0FBRUEsUUFBSSxVQUFVLGVBQWUsSUFBSSxFQUFFLE9BQU8sZUFBZSxDQUFDLDBCQUEwQixHQUFHO0FBQ3RGLFlBQU0sV0FBVyxVQUFVLGVBQWUsSUFBSSxFQUFFO0FBQ2hELFlBQU0sUUFBUSxZQUFZLElBQUksSUFBSSxrQkFBK0IsQ0FBQztBQUNsRSxZQUFNLFdBQVcsTUFBTTtBQUN0QixZQUFJLFVBQVUsZUFBZSxJQUFJLEVBQUUsT0FBTyxVQUFVO0FBQ25ELGdCQUFNLE1BQU07QUFDWjtBQUFBLFFBQ0Q7QUFDQSxZQUFJLDBCQUEwQixHQUFHO0FBQ2hDLHFCQUFXLE1BQU0sMkRBQTJELFdBQVcsMERBQTBEO0FBQ2pKLGdCQUFNLE1BQU07QUFDWjtBQUFBLFFBQ0Q7QUFDQSxjQUFNLFFBQVEsVUFBVSxvQkFBb0IsSUFBSTtBQUNoRCxZQUFJLE1BQU0sYUFBYSxXQUFXLEtBQUssTUFBTSxlQUFlLFdBQVcsR0FBRztBQUN6RSxvQkFBVTtBQUFBLFlBQVk7QUFBQTtBQUFBLFlBQWtDO0FBQUEsVUFBSztBQUM3RCxjQUFJLFVBQVUsZUFBZSxJQUFJLEVBQUUsT0FBTyxhQUFhO0FBQ3RELGtCQUFNLE1BQU07QUFBQSxVQUNiO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFFBQVEsUUFBUSxZQUFVO0FBQy9CLGNBQU0sUUFBUSxVQUFVLG9CQUFvQixLQUFLLE1BQU07QUFDdkQsZUFBTyxNQUFNLElBQUksTUFBTSxZQUFZLFFBQVEsQ0FBQztBQUM1QyxpQkFBUztBQUFBLE1BQ1YsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0EsTUFBSSwwQkFBMEIsc0JBQXNCLHNCQUFzQixHQUFHO0FBQzVFLGNBQVUsbUJBQW1CLHNCQUFzQjtBQUFBLEVBQ3BEO0FBRUEsWUFBVSw0QkFBNEI7QUFFdEMsUUFBTSx3QkFBd0IsTUFBTSxpQkFBaUI7QUFBQSxJQUNwRDtBQUFBLElBQ0E7QUFBQSxJQUNBLE1BQU07QUFBQSxJQUNOLGtCQUFrQiwyQkFBMkIsSUFBSTtBQUFBLEVBQ2xELElBQUk7QUFDSixRQUFNLHlCQUF5QixzQkFBc0I7QUFDckQsTUFBSSwwQkFBMEIsQ0FBQyxVQUFVO0FBQUEsSUFBd0I7QUFBQTtBQUFBLElBQTZDO0FBQUEsRUFBSyxHQUFHO0FBQ3JILFVBQU0sV0FBVyxVQUFVLHNCQUFzQixJQUFJLEdBQUc7QUFDeEQsVUFBTSxRQUFRLFlBQVksSUFBSSxJQUFJLGtCQUErQixDQUFDO0FBQ2xFLFVBQU0sUUFBUSxNQUFNO0FBQUEsTUFDbkIsc0JBQXNCO0FBQUEsTUFDdEIsTUFBTSxvQkFBb0Isa0JBQWtCLDBCQUEwQjtBQUFBLElBQ3ZFLEVBQUUsTUFBTTtBQUNQLFVBQUksVUFBVSxzQkFBc0IsSUFBSSxHQUFHLGVBQWUsVUFBVTtBQUNuRSxjQUFNLE1BQU07QUFDWjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLGtCQUFrQixzQkFBc0I7QUFDOUMsVUFBSSxtQkFBbUIsVUFBVTtBQUFBLFFBQXdCO0FBQUE7QUFBQSxRQUFzQztBQUFBLE1BQUssR0FBRztBQUN0RyxjQUFNLE1BQU07QUFBQSxNQUNiO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUVBLGNBQVksSUFBSSxVQUFVLFlBQVksd0JBQXdCLE1BQU07QUFDbkUsZUFBVztBQUFBLEVBQ1osQ0FBQyxDQUFDO0FBRUYsWUFBVSxPQUFPLEdBQUc7QUFDcEIsaUJBQWUsTUFBTTtBQUNwQixRQUFJLENBQUMsWUFBWSxZQUFZO0FBQzVCLGdCQUFVLE9BQU8sR0FBRztBQUFBLElBQ3JCO0FBQUEsRUFDRCxDQUFDO0FBRUQsUUFBTSxpQkFBaUIsWUFBWSxJQUFJLElBQUksSUFBSSx5QkFBeUIsK0JBQStCLGFBQVc7QUFDakgsZUFBVyxTQUFTLFNBQVM7QUFDNUIsWUFBTSxRQUFRLE1BQU0sWUFBWTtBQUNoQyxVQUFJLFFBQVEsR0FBRztBQUNkLGtCQUFVLE9BQU8sS0FBSztBQUFBLE1BQ3ZCO0FBQUEsSUFDRDtBQUFBLEVBQ0QsR0FBRyxJQUFJLFVBQVUsVUFBVSxDQUFDLENBQUM7QUFDN0IsY0FBWSxJQUFJLGVBQWUsUUFBUSxVQUFVLENBQUM7QUFFbEQsUUFBTSxhQUFhLElBQUksT0FBTyxNQUFNLEVBQUUsbURBQW1ELENBQUM7QUFDMUYsUUFBTSxtQkFBbUIsU0FBUywyQkFBMkIsdURBQXVEO0FBQ3BILFFBQU0sa0JBQWtCLFlBQVksSUFBSSxJQUFJLFNBQVMsa0JBQWtCLE1BQU0sU0FBUyxxQkFBcUIsQ0FBQztBQUM1RyxNQUFJLE9BQU8sWUFBWSxnQkFBZ0IsT0FBTztBQUM5QyxRQUFNLGVBQWUsSUFBSSxPQUFPLFlBQVksRUFBRSx1Q0FBdUMsUUFBVyxnQkFBZ0IsQ0FBQztBQUNqSCxRQUFNLGFBQWEsQ0FBQyxVQUFtQjtBQUN0QyxRQUFJLGdCQUFnQixZQUFZLE9BQU87QUFDdEMsc0JBQWdCLFVBQVU7QUFBQSxJQUMzQjtBQUNBLFVBQU0sVUFBVTtBQUFBLEVBQ2pCO0FBQ0EsY0FBWSxJQUFJLGdCQUFnQixTQUFTLE1BQU07QUFDOUMsVUFBTSxVQUFVLGdCQUFnQjtBQUFBLEVBQ2pDLENBQUMsQ0FBQztBQUNGLGNBQVksSUFBSSxJQUFJLDhCQUE4QixjQUFjLFNBQVMsTUFBTTtBQUM5RSxlQUFXLENBQUMsZ0JBQWdCLE9BQU87QUFBQSxFQUNwQyxDQUFDLENBQUM7QUFFRixTQUFPO0FBQUEsSUFDTixXQUFXLE1BQU0sVUFBVSxZQUFZLFNBQVM7QUFBQSxJQUNoRCxTQUFTLE1BQU0sVUFBVSxlQUFlLElBQUksRUFBRTtBQUFBLElBQzlDLG9CQUFvQixNQUFNLFVBQVUsMEJBQTBCLElBQUk7QUFBQSxJQUNsRSxZQUFZLE1BQU0sVUFBVSxzQkFBc0IsSUFBSSxHQUFHO0FBQUEsSUFDekQsV0FBVyxNQUFNLGVBQWU7QUFBQSxJQUNoQyxzQkFBc0IsTUFBTTtBQUUzQixhQUFPLE1BQU0sS0FBSyxLQUFLLGlCQUE4QixzREFBc0QsQ0FBQztBQUFBLElBQzdHO0FBQUEsRUFDRDtBQUNEO0FBUUEsU0FBUyxtQkFBMkM7QUFDbkQsUUFBTSxVQUF5QixDQUFDO0FBQ2hDLFdBQVMsT0FBTyxHQUFHLE9BQU8sSUFBSSxRQUFRO0FBQ3JDLGFBQVMsU0FBUyxHQUFHLFNBQVMsSUFBSSxVQUFVLElBQUk7QUFDL0MsWUFBTSxTQUFTLE9BQU8sS0FBSyxPQUFPO0FBQ2xDLFlBQU0sU0FBUyxTQUFTLElBQUksS0FBTSxPQUFPLEtBQUssT0FBTyxLQUFLO0FBQzFELFlBQU0sYUFBYSxPQUFPLFNBQVMsRUFBRSxTQUFTLEdBQUcsR0FBRztBQUNwRCxjQUFRLEtBQUs7QUFBQSxRQUNaO0FBQUEsUUFDQTtBQUFBLFFBQ0EsT0FBTyxHQUFHLE1BQU0sSUFBSSxVQUFVLElBQUksTUFBTTtBQUFBLE1BQ3pDLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsdUJBQXVCLE1BQWMsUUFBd0I7QUFDckUsUUFBTSxXQUFXLEtBQUssSUFBSSxHQUFHLEtBQUssSUFBSSxJQUFJLE9BQU8sQ0FBQyxDQUFDO0FBQ25ELFFBQU0sYUFBYSxLQUFLLElBQUksR0FBRyxLQUFLLElBQUksSUFBSSxTQUFTLENBQUMsQ0FBQztBQUN2RCxRQUFNLE9BQU8sS0FBSyxNQUFNLGFBQWEsRUFBRSxJQUFJO0FBQzNDLFFBQU0sY0FBYyxjQUFjLE1BQU0sU0FBUyxLQUFLLFdBQVcsS0FBSyxLQUFLO0FBQzNFLFNBQU8sY0FBYyxJQUFJO0FBQzFCO0FBRU8sU0FBUyxzQkFDZixZQUNBLE9BQ0EsWUFDQSxNQUNBLFdBQ0EsV0FDTztBQUNQLGFBQVcsWUFBWSxNQUFNLEtBQUssS0FBSyxNQUFNLEtBQzFDLFNBQVMsZ0NBQWdDLG1CQUFtQixJQUM1RDtBQUNILGFBQVcsY0FBYyxVQUFVLEVBQUUsS0FBSyxNQUFNLEtBQzdDLFNBQVMsa0NBQWtDLHFCQUFxQixJQUNoRTtBQUNILGFBQVcsY0FBYyxDQUFDLE1BQU0sYUFDNUIsQ0FBQyxNQUFNLGNBQ1IsU0FBUyxrQ0FBa0MsK0JBQStCLElBQzFFO0FBQ0gsYUFBVyxtQkFBbUIsQ0FBQyxNQUFNLGlCQUFrQixNQUFNLGVBQWUsQ0FBQyxNQUFNLGFBQ2hGLFNBQVMsdUNBQXVDLDJCQUEyQixJQUMzRTtBQUNILGFBQVcsY0FBYyxDQUFDLE1BQU0sZUFBZSxNQUFNLGtCQUFrQixjQUFjLENBQUMsVUFBVSxJQUM3RixTQUFTLGtDQUFrQyw4Q0FBOEMsSUFDekY7QUFFSCxRQUFNLFFBQVEsQ0FBQyxXQUFXLGFBQWEsQ0FBQyxXQUFXLGVBQWUsQ0FBQyxXQUFXLGVBQWUsQ0FBQyxXQUFXLG9CQUFvQixDQUFDLFdBQVc7QUFDekksTUFBSSxZQUFZO0FBQ2YsZUFBVyxVQUFVO0FBQUEsRUFDdEI7QUFDQSxPQUFLLFVBQVUsT0FBTywyQkFBMkIsQ0FBQyxLQUFLO0FBQ3hEO0FBR08sTUFBTSxtQ0FBbUMsZ0JBQWdCO0FBQUEsRUFBekQ7QUFBQTtBQUNOLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxrQkFBK0IsQ0FBQztBQUFBO0FBQUEsRUFHdkYsZUFBZSxPQUF1QztBQUNyRCxTQUFLLGNBQWM7QUFDbkIsU0FBSyxpQkFBaUIsUUFBUSxRQUFRLFlBQVU7QUFDL0MsWUFBTSxlQUFlLEtBQUssTUFBTTtBQUNoQyxXQUFLLG9CQUFvQjtBQUFBLElBQzFCLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFbUIsWUFBcUI7QUFDdkMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVtQiwwQkFBbUM7QUFDckQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVtQixjQUF1RDtBQUN6RSxVQUFNLFFBQVEsTUFBTSxZQUFZO0FBQ2hDLFVBQU0sY0FBcUQ7QUFBQSxNQUMxRCxNQUFNLG1CQUFtQjtBQUFBLE1BQ3pCLE9BQU8sU0FBUywrQkFBK0IsY0FBYztBQUFBLE1BQzdELGFBQWEsU0FBUywyQ0FBMkMsaUNBQWlDO0FBQUEsTUFDbEcsT0FBTyxFQUFFLE9BQU8sSUFBSSxNQUFNLFFBQVEsa0JBQWtCO0FBQUEsTUFDcEQsTUFBTTtBQUFBLFFBQ0wsU0FBUyxLQUFLLGFBQWEsZUFBZTtBQUFBLFFBQzFDLEtBQUssTUFBTSxLQUFLLGFBQWEsYUFBYSxJQUFJO0FBQUEsTUFDL0M7QUFBQSxJQUNEO0FBQ0EsV0FBTyxNQUFNLFNBQVMsSUFDbkIsQ0FBQyxhQUFhLEVBQUUsTUFBTSxtQkFBbUIsV0FBVyxPQUFPLEdBQUcsR0FBRyxHQUFHLEtBQUssSUFDekUsQ0FBQyxXQUFXO0FBQUEsRUFDaEI7QUFBQSxFQUVBLE1BQXlCLG9CQUFvQixNQUE4QztBQUMxRixVQUFNLFVBQVUsTUFBTSxNQUFNLG9CQUFvQixJQUFJO0FBQ3BELFVBQU0saUJBQWlCLEtBQUs7QUFDNUIsUUFBSSxXQUFXLG1CQUFtQixLQUFLLGFBQWEsS0FBSyxzQkFBc0IsU0FBWTtBQUMxRixXQUFLLGFBQWEsYUFBYSxPQUFPLGNBQWM7QUFBQSxJQUNyRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFbUIsa0JBQWtCLFdBQXFDO0FBQ3pFLFdBQU8sQ0FBQyxLQUFLLGFBQWEsZUFBZSxNQUFNLGtCQUFrQixTQUFTO0FBQUEsRUFDM0U7QUFBQSxFQUVtQixvQkFBb0IsU0FBNEI7QUFDbEUsUUFBSSxVQUFVLE9BQU87QUFDckIsVUFBTSxZQUFZLEtBQUssa0JBQWtCO0FBQ3pDLFVBQU0sY0FBYyxLQUFLLGFBQWEsZ0JBQWdCO0FBQ3RELFVBQU0sUUFBUSxjQUNYLFNBQVMsK0JBQStCLGNBQWMsSUFDdEQsV0FBVyxTQUFTLFNBQVMsaUJBQWlCLFdBQVc7QUFDNUQsVUFBTSxPQUFPLGNBQWMsUUFBUSxvQkFBb0IsV0FBVyxRQUFRLFFBQVE7QUFFbEYsWUFBUSxhQUFhLGNBQWMsYUFBYSxjQUM3QyxTQUFTLHFEQUFxRCwwQkFBMEIsS0FBSyxJQUM3RixTQUFTLGlEQUFpRCxzQ0FBc0MsQ0FBQztBQUVwRyxVQUFNLGVBQWUsSUFBSSxPQUFPLFNBQVMsV0FBVyxJQUFJLENBQUM7QUFDekQsaUJBQWEsYUFBYSxlQUFlLE1BQU07QUFDL0MsUUFBSSxPQUFPLFNBQVMsRUFBRSxxQ0FBcUMsUUFBVyxLQUFLLENBQUM7QUFDNUUsVUFBTSxVQUFVLElBQUksT0FBTyxTQUFTLFdBQVcsUUFBUSxrQkFBa0IsQ0FBQztBQUMxRSxZQUFRLFVBQVUsSUFBSSxnQ0FBZ0M7QUFDdEQsWUFBUSxhQUFhLGVBQWUsTUFBTTtBQUFBLEVBQzNDO0FBQUEsRUFFbUIsdUJBQXdEO0FBQzFFLFdBQU8sTUFBTSxxQkFBcUIsRUFBRSxPQUFPLE9BQUssRUFBRSxVQUFVLDZCQUE2QjtBQUFBLEVBQzFGO0FBQ0Q7QUFFTyxNQUFNLHlDQUF5QywyQkFBMkI7QUFBQSxFQUdoRixpQkFBaUIsZUFBOEM7QUFDOUQsU0FBSyxnQkFBZ0I7QUFBQSxFQUN0QjtBQUFBLEVBRVMsV0FBVyxRQUFRLE9BQU8sUUFBNEI7QUFDOUQsVUFBTSxpQkFBaUIsVUFBVSxLQUFLO0FBQ3RDLFFBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLGlCQUFpQixDQUFDLG9DQUFvQyxLQUFLLGFBQWEsR0FBRztBQUN2RyxZQUFNLFdBQVcsT0FBTyxNQUFNO0FBQzlCO0FBQUEsSUFDRDtBQUNBLFNBQUs7QUFBQSxNQUNKLEtBQUs7QUFBQSxNQUNMO0FBQUEsTUFDQSxLQUFLLFlBQVk7QUFBQSxNQUNqQixVQUFRO0FBQUUsYUFBSyxLQUFLLG9CQUFvQixJQUFJO0FBQUEsTUFBRztBQUFBLE1BQy9DLEtBQUsscUJBQXFCO0FBQUEsSUFDM0I7QUFBQSxFQUNEO0FBQ0Q7QUFHQSxvQkFBb0IsaUNBQWlDO0FBQUEsRUFDcEQsSUFBSTtBQUFBLEVBQ0osUUFBUSxpQkFBaUIsZ0JBQWdCO0FBQUEsRUFDekMsTUFBTSxlQUFlO0FBQUEsSUFDcEIsa0JBQWtCO0FBQUEsSUFDbEIsZ0JBQWdCO0FBQUEsRUFDakI7QUFBQSxFQUNBLFNBQVMsUUFBUTtBQUFBLEVBQ2pCLFNBQVMsQ0FBQyxhQUFhO0FBQ3RCLFVBQU0sU0FBUyxTQUFTLElBQUksa0JBQWtCLEVBQUUscUJBQXFCO0FBQ3JFLFlBQVEsUUFBUSxZQUFZLFFBQVEsRUFBRSxNQUFNLEtBQUssQ0FBQztBQUFBLEVBQ25EO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
