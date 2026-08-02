import "./media/actions.css";
import { localize, localize2 } from "../../../nls.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { DomEmitter } from "../../../base/browser/event.js";
import { Color } from "../../../base/common/color.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { toDisposable, dispose, DisposableStore, setDisposableTracker, DisposableTracker } from "../../../base/common/lifecycle.js";
import { getDomNodePagePosition, append, $, getActiveDocument, onDidRegisterWindow, getWindows } from "../../../base/browser/dom.js";
import { createCSSRule, createStyleSheet } from "../../../base/browser/domStylesheets.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../platform/contextkey/common/contextkey.js";
import { StandardKeyboardEvent } from "../../../base/browser/keyboardEvent.js";
import { RunOnceScheduler } from "../../../base/common/async.js";
import { ILayoutService } from "../../../platform/layout/browser/layoutService.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { registerAction2, Action2, MenuRegistry } from "../../../platform/actions/common/actions.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../platform/storage/common/storage.js";
import { clamp } from "../../../base/common/numbers.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { Extensions as ConfigurationExtensions } from "../../../platform/configuration/common/configurationRegistry.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { IWorkingCopyService } from "../../services/workingCopy/common/workingCopyService.js";
import { Categories } from "../../../platform/action/common/actionCommonCategories.js";
import { IWorkingCopyBackupService } from "../../services/workingCopy/common/workingCopyBackup.js";
import { ResultKind } from "../../../platform/keybinding/common/keybindingResolver.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { IOutputService } from "../../services/output/common/output.js";
import { windowLogId } from "../../services/log/common/logConstants.js";
import { ByteSize } from "../../../platform/files/common/files.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { IUserDataProfileService } from "../../services/userDataProfile/common/userDataProfile.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import product from "../../../platform/product/common/product.js";
import { CommandsRegistry } from "../../../platform/commands/common/commands.js";
import { IEnvironmentService } from "../../../platform/environment/common/environment.js";
import { IProductService } from "../../../platform/product/common/productService.js";
import { IDefaultAccountService } from "../../../platform/defaultAccount/common/defaultAccount.js";
import { IAuthenticationService } from "../../services/authentication/common/authentication.js";
import { IAuthenticationAccessService } from "../../services/authentication/browser/authenticationAccessService.js";
import { IPolicyService } from "../../../platform/policy/common/policy.js";
import { COPILOT_ENABLED_PLUGINS_KEY, COPILOT_EXTRA_MARKETPLACES_KEY, COPILOT_STRICT_MARKETPLACES_KEY, INativeManagedSettingsService, IFileManagedSettingsService, MANAGED_SETTINGS_CHANNELS, normalizeManagedSettings, projectManagedSettings, pickManagedSettings } from "../../../platform/policy/common/copilotManagedSettings.js";
import { APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, AccountPolicyGateState, AccountPolicyGateUnsatisfiedReason, IAccountPolicyGateService } from "../../services/policies/common/accountPolicyService.js";
import { adaptManagedSettings } from "../../services/accounts/browser/managedSettings.js";
import { isObject } from "../../../base/common/types.js";
import * as json from "../../../base/common/json.js";
import { getParseErrorMessage } from "../../../base/common/jsonErrorMessages.js";
import { IAgentHostService } from "../../../platform/agentHost/common/agentService.js";
import { IAgentHostEnablementService } from "../../../platform/agentHost/common/agentHostEnablementService.js";
class InspectContextKeysAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.inspectContextKeys",
      title: localize2("inspect context keys", "Inspect Context Keys"),
      category: Categories.Developer,
      f1: true
    });
  }
  run(accessor) {
    const contextKeyService = accessor.get(IContextKeyService);
    const disposables = new DisposableStore();
    const stylesheet = createStyleSheet(void 0, void 0, disposables);
    createCSSRule("*", "cursor: crosshair !important;", stylesheet);
    const hoverFeedback = document.createElement("div");
    const activeDocument = getActiveDocument();
    activeDocument.body.appendChild(hoverFeedback);
    disposables.add(toDisposable(() => hoverFeedback.remove()));
    hoverFeedback.style.position = "absolute";
    hoverFeedback.style.pointerEvents = "none";
    hoverFeedback.style.backgroundColor = "rgba(255, 0, 0, 0.5)";
    hoverFeedback.style.zIndex = "1000";
    const onMouseMove = disposables.add(new DomEmitter(activeDocument, "mousemove", true));
    disposables.add(onMouseMove.event((e) => {
      const target = e.target;
      const position = getDomNodePagePosition(target);
      hoverFeedback.style.top = `${position.top}px`;
      hoverFeedback.style.left = `${position.left}px`;
      hoverFeedback.style.width = `${position.width}px`;
      hoverFeedback.style.height = `${position.height}px`;
    }));
    const onMouseDown = disposables.add(new DomEmitter(activeDocument, "mousedown", true));
    Event.once(onMouseDown.event)((e) => {
      e.preventDefault();
      e.stopPropagation();
    }, null, disposables);
    const onMouseUp = disposables.add(new DomEmitter(activeDocument, "mouseup", true));
    Event.once(onMouseUp.event)((e) => {
      e.preventDefault();
      e.stopPropagation();
      const context = contextKeyService.getContext(e.target);
      console.log(context.collectAllValues());
      dispose(disposables);
    }, null, disposables);
  }
}
class ToggleScreencastModeAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleScreencastMode",
      title: localize2("toggle screencast mode", "Toggle Screencast Mode"),
      category: Categories.Developer,
      f1: true
    });
  }
  run(accessor) {
    if (ToggleScreencastModeAction.disposable) {
      ToggleScreencastModeAction.disposable.dispose();
      ToggleScreencastModeAction.disposable = void 0;
      return;
    }
    const layoutService = accessor.get(ILayoutService);
    const configurationService = accessor.get(IConfigurationService);
    const keybindingService = accessor.get(IKeybindingService);
    const disposables = new DisposableStore();
    const container = layoutService.activeContainer;
    const mouseMarker = append(container, $(".screencast-mouse"));
    disposables.add(toDisposable(() => mouseMarker.remove()));
    const keyboardMarker = append(container, $(".screencast-keyboard"));
    disposables.add(toDisposable(() => keyboardMarker.remove()));
    const onMouseDown = disposables.add(new Emitter());
    const onMouseUp = disposables.add(new Emitter());
    const onMouseMove = disposables.add(new Emitter());
    function registerContainerListeners(container2, windowDisposables) {
      const listeners = new DisposableStore();
      listeners.add(listeners.add(new DomEmitter(container2, "mousedown", true)).event((e) => onMouseDown.fire(e)));
      listeners.add(listeners.add(new DomEmitter(container2, "mouseup", true)).event((e) => onMouseUp.fire(e)));
      listeners.add(listeners.add(new DomEmitter(container2, "mousemove", true)).event((e) => onMouseMove.fire(e)));
      windowDisposables.add(listeners);
      disposables.add(toDisposable(() => windowDisposables.delete(listeners)));
      disposables.add(listeners);
    }
    for (const { window, disposables: disposables2 } of getWindows()) {
      registerContainerListeners(layoutService.getContainer(window), disposables2);
    }
    disposables.add(onDidRegisterWindow(({ window, disposables: disposables2 }) => registerContainerListeners(layoutService.getContainer(window), disposables2)));
    disposables.add(layoutService.onDidChangeActiveContainer(() => {
      layoutService.activeContainer.appendChild(mouseMarker);
      layoutService.activeContainer.appendChild(keyboardMarker);
    }));
    const updateMouseIndicatorColor = () => {
      mouseMarker.style.borderColor = Color.fromHex(configurationService.getValue("screencastMode.mouseIndicatorColor")).toString();
    };
    let mouseIndicatorSize;
    const updateMouseIndicatorSize = () => {
      mouseIndicatorSize = clamp(configurationService.getValue("screencastMode.mouseIndicatorSize") || 20, 20, 100);
      mouseMarker.style.height = `${mouseIndicatorSize}px`;
      mouseMarker.style.width = `${mouseIndicatorSize}px`;
    };
    updateMouseIndicatorColor();
    updateMouseIndicatorSize();
    disposables.add(onMouseDown.event((e) => {
      mouseMarker.style.top = `${e.clientY - mouseIndicatorSize / 2}px`;
      mouseMarker.style.left = `${e.clientX - mouseIndicatorSize / 2}px`;
      mouseMarker.style.display = "block";
      mouseMarker.style.transform = `scale(${1})`;
      mouseMarker.style.transition = "transform 0.1s";
      const mouseMoveListener = onMouseMove.event((e2) => {
        mouseMarker.style.top = `${e2.clientY - mouseIndicatorSize / 2}px`;
        mouseMarker.style.left = `${e2.clientX - mouseIndicatorSize / 2}px`;
        mouseMarker.style.transform = `scale(${0.8})`;
      });
      Event.once(onMouseUp.event)(() => {
        mouseMarker.style.display = "none";
        mouseMoveListener.dispose();
      });
    }));
    const updateKeyboardFontSize = () => {
      keyboardMarker.style.fontSize = `${clamp(configurationService.getValue("screencastMode.fontSize") || 56, 20, 100)}px`;
    };
    const updateKeyboardMarker = () => {
      keyboardMarker.style.bottom = `${clamp(configurationService.getValue("screencastMode.verticalOffset") || 0, 0, 90)}%`;
    };
    let keyboardMarkerTimeout;
    const updateKeyboardMarkerTimeout = () => {
      keyboardMarkerTimeout = clamp(configurationService.getValue("screencastMode.keyboardOverlayTimeout") || 800, 500, 5e3);
    };
    updateKeyboardFontSize();
    updateKeyboardMarker();
    updateKeyboardMarkerTimeout();
    disposables.add(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("screencastMode.verticalOffset")) {
        updateKeyboardMarker();
      }
      if (e.affectsConfiguration("screencastMode.fontSize")) {
        updateKeyboardFontSize();
      }
      if (e.affectsConfiguration("screencastMode.keyboardOverlayTimeout")) {
        updateKeyboardMarkerTimeout();
      }
      if (e.affectsConfiguration("screencastMode.mouseIndicatorColor")) {
        updateMouseIndicatorColor();
      }
      if (e.affectsConfiguration("screencastMode.mouseIndicatorSize")) {
        updateMouseIndicatorSize();
      }
    }));
    const onKeyDown = disposables.add(new Emitter());
    const onCompositionStart = disposables.add(new Emitter());
    const onCompositionUpdate = disposables.add(new Emitter());
    const onCompositionEnd = disposables.add(new Emitter());
    function registerWindowListeners(window, windowDisposables) {
      const listeners = new DisposableStore();
      listeners.add(listeners.add(new DomEmitter(window, "keydown", true)).event((e) => onKeyDown.fire(e)));
      listeners.add(listeners.add(new DomEmitter(window, "compositionstart", true)).event((e) => onCompositionStart.fire(e)));
      listeners.add(listeners.add(new DomEmitter(window, "compositionupdate", true)).event((e) => onCompositionUpdate.fire(e)));
      listeners.add(listeners.add(new DomEmitter(window, "compositionend", true)).event((e) => onCompositionEnd.fire(e)));
      windowDisposables.add(listeners);
      disposables.add(toDisposable(() => windowDisposables.delete(listeners)));
      disposables.add(listeners);
    }
    for (const { window, disposables: disposables2 } of getWindows()) {
      registerWindowListeners(window, disposables2);
    }
    disposables.add(onDidRegisterWindow(({ window, disposables: disposables2 }) => registerWindowListeners(window, disposables2)));
    let length = 0;
    let composing = void 0;
    let imeBackSpace = false;
    const clearKeyboardScheduler = disposables.add(new RunOnceScheduler(() => {
      keyboardMarker.textContent = "";
      composing = void 0;
      length = 0;
    }, keyboardMarkerTimeout));
    disposables.add(onCompositionStart.event((e) => {
      imeBackSpace = true;
    }));
    disposables.add(onCompositionUpdate.event((e) => {
      if (e.data && imeBackSpace) {
        if (length > 20) {
          keyboardMarker.innerText = "";
          length = 0;
        }
        composing = composing ?? append(keyboardMarker, $("span.key"));
        composing.textContent = e.data;
      } else if (imeBackSpace) {
        keyboardMarker.innerText = "";
        append(keyboardMarker, $("span.key", {}, `Backspace`));
      }
      clearKeyboardScheduler.schedule(keyboardMarkerTimeout);
    }));
    disposables.add(onCompositionEnd.event((e) => {
      composing = void 0;
      length++;
    }));
    disposables.add(onKeyDown.event((e) => {
      if (e.key === "Process" || /[\uac00-\ud787\u3131-\u314e\u314f-\u3163\u3041-\u3094\u30a1-\u30f4\u30fc\u3005\u3006\u3024\u4e00-\u9fa5]/u.test(e.key)) {
        if (e.code === "Backspace") {
          imeBackSpace = true;
        } else if (!e.code.includes("Key")) {
          composing = void 0;
          imeBackSpace = false;
        } else {
          imeBackSpace = true;
        }
        clearKeyboardScheduler.schedule(keyboardMarkerTimeout);
        return;
      }
      if (e.isComposing) {
        return;
      }
      const options = configurationService.getValue("screencastMode.keyboardOptions");
      const event = new StandardKeyboardEvent(e);
      const shortcut = keybindingService.softDispatch(event, event.target);
      if (shortcut.kind === ResultKind.KbFound && shortcut.commandId && !(options.showSingleEditorCursorMoves ?? true) && ["cursorLeft", "cursorRight", "cursorUp", "cursorDown"].includes(shortcut.commandId)) {
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || length > 20 || event.keyCode === KeyCode.Backspace || event.keyCode === KeyCode.Escape || event.keyCode === KeyCode.UpArrow || event.keyCode === KeyCode.DownArrow || event.keyCode === KeyCode.LeftArrow || event.keyCode === KeyCode.RightArrow) {
        keyboardMarker.innerText = "";
        length = 0;
      }
      const keybinding = keybindingService.resolveKeyboardEvent(event);
      const commandDetails = this._isKbFound(shortcut) && shortcut.commandId ? this.getCommandDetails(shortcut.commandId) : void 0;
      let commandAndGroupLabel = commandDetails?.title;
      let keyLabel = keybinding.getLabel();
      if (commandDetails) {
        if ((options.showCommandGroups ?? false) && commandDetails.category) {
          commandAndGroupLabel = `${commandDetails.category}: ${commandAndGroupLabel} `;
        }
        if (this._isKbFound(shortcut) && shortcut.commandId) {
          const keybindings = keybindingService.lookupKeybindings(shortcut.commandId).filter((k) => k.getLabel()?.endsWith(keyLabel ?? ""));
          if (keybindings.length > 0) {
            keyLabel = keybindings[keybindings.length - 1].getLabel();
          }
        }
      }
      if ((options.showCommands ?? true) && commandAndGroupLabel) {
        append(keyboardMarker, $("span.title", {}, `${commandAndGroupLabel} `));
      }
      if ((options.showKeys ?? true) || (options.showKeybindings ?? true) && this._isKbFound(shortcut)) {
        keyLabel = keyLabel?.replace("UpArrow", "\u2191")?.replace("DownArrow", "\u2193")?.replace("LeftArrow", "\u2190")?.replace("RightArrow", "\u2192");
        append(keyboardMarker, $("span.key", {}, keyLabel ?? ""));
      }
      length++;
      clearKeyboardScheduler.schedule(keyboardMarkerTimeout);
    }));
    ToggleScreencastModeAction.disposable = disposables;
  }
  _isKbFound(resolutionResult) {
    return resolutionResult.kind === ResultKind.KbFound;
  }
  getCommandDetails(commandId) {
    const fromMenuRegistry = MenuRegistry.getCommand(commandId);
    if (fromMenuRegistry) {
      return {
        title: typeof fromMenuRegistry.title === "string" ? fromMenuRegistry.title : fromMenuRegistry.title.value,
        category: fromMenuRegistry.category ? typeof fromMenuRegistry.category === "string" ? fromMenuRegistry.category : fromMenuRegistry.category.value : void 0
      };
    }
    const fromCommandsRegistry = CommandsRegistry.getCommand(commandId);
    if (fromCommandsRegistry?.metadata?.description) {
      return { title: typeof fromCommandsRegistry.metadata.description === "string" ? fromCommandsRegistry.metadata.description : fromCommandsRegistry.metadata.description.value };
    }
    return void 0;
  }
}
class LogStorageAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.logStorage",
      title: localize2({ key: "logStorage", comment: ["A developer only action to log the contents of the storage for the current window."] }, "Log Storage Database Contents"),
      category: Categories.Developer,
      f1: true
    });
  }
  run(accessor) {
    const storageService = accessor.get(IStorageService);
    const dialogService = accessor.get(IDialogService);
    storageService.log();
    dialogService.info(localize("storageLogDialogMessage", "The storage database contents have been logged to the developer tools."), localize("storageLogDialogDetails", "Open developer tools from the menu and select the Console tab."));
  }
}
class LogWorkingCopiesAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.logWorkingCopies",
      title: localize2({ key: "logWorkingCopies", comment: ["A developer only action to log the working copies that exist."] }, "Log Working Copies"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const workingCopyService = accessor.get(IWorkingCopyService);
    const workingCopyBackupService = accessor.get(IWorkingCopyBackupService);
    const logService = accessor.get(ILogService);
    const outputService = accessor.get(IOutputService);
    const backups = await workingCopyBackupService.getBackups();
    const msg = [
      ``,
      `[Working Copies]`,
      ...workingCopyService.workingCopies.length > 0 ? workingCopyService.workingCopies.map((workingCopy) => `${workingCopy.isDirty() ? "\u25CF " : ""}${workingCopy.resource.toString(true)} (typeId: ${workingCopy.typeId || "<no typeId>"})`) : ["<none>"],
      ``,
      `[Backups]`,
      ...backups.length > 0 ? backups.map((backup) => `${backup.resource.toString(true)} (typeId: ${backup.typeId || "<no typeId>"})`) : ["<none>"]
    ];
    logService.info(msg.join("\n"));
    outputService.showChannel(windowLogId, true);
  }
}
const _RemoveLargeStorageEntriesAction = class _RemoveLargeStorageEntriesAction extends Action2 {
  // 16kb
  constructor() {
    super({
      id: "workbench.action.removeLargeStorageDatabaseEntries",
      title: localize2("removeLargeStorageDatabaseEntries", "Remove Large Storage Database Entries..."),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const storageService = accessor.get(IStorageService);
    const quickInputService = accessor.get(IQuickInputService);
    const userDataProfileService = accessor.get(IUserDataProfileService);
    const dialogService = accessor.get(IDialogService);
    const environmentService = accessor.get(IEnvironmentService);
    const items = [];
    for (const scope of [StorageScope.APPLICATION, StorageScope.PROFILE, StorageScope.WORKSPACE]) {
      if (scope === StorageScope.PROFILE && userDataProfileService.currentProfile.isDefault) {
        continue;
      }
      for (const target of [StorageTarget.MACHINE, StorageTarget.USER]) {
        for (const key of storageService.keys(scope, target)) {
          const value = storageService.get(key, scope);
          if (value && (!environmentService.isBuilt || value.length > _RemoveLargeStorageEntriesAction.SIZE_THRESHOLD)) {
            items.push({
              key,
              scope,
              target,
              size: value.length,
              label: key,
              description: ByteSize.formatSize(value.length),
              detail: localize("largeStorageItemDetail", "Scope: {0}, Target: {1}", scope === StorageScope.APPLICATION ? localize("global", "Global") : scope === StorageScope.PROFILE ? localize("profile", "Profile") : localize("workspace", "Workspace"), target === StorageTarget.MACHINE ? localize("machine", "Machine") : localize("user", "User"))
            });
          }
        }
      }
    }
    items.sort((itemA, itemB) => itemB.size - itemA.size);
    const selectedItems = await new Promise((resolve) => {
      const disposables = new DisposableStore();
      const picker = disposables.add(quickInputService.createQuickPick());
      picker.items = items;
      picker.canSelectMany = true;
      picker.ok = false;
      picker.customButton = true;
      picker.hideCheckAll = true;
      picker.customLabel = localize("removeLargeStorageEntriesPickerButton", "Remove");
      picker.placeholder = localize("removeLargeStorageEntriesPickerPlaceholder", "Select large entries to remove from storage");
      if (items.length === 0) {
        picker.description = localize("removeLargeStorageEntriesPickerDescriptionNoEntries", "There are no large storage entries to remove.");
      }
      picker.show();
      disposables.add(picker.onDidCustom(() => {
        resolve(picker.selectedItems);
        picker.hide();
      }));
      disposables.add(picker.onDidHide(() => disposables.dispose()));
    });
    if (selectedItems.length === 0) {
      return;
    }
    const { confirmed } = await dialogService.confirm({
      type: "warning",
      message: localize("removeLargeStorageEntriesConfirmRemove", "Do you want to remove the selected storage entries from the database?"),
      detail: localize("removeLargeStorageEntriesConfirmRemoveDetail", "{0}\n\nThis action is irreversible and may result in data loss!", selectedItems.map((item) => item.label).join("\n")),
      primaryButton: localize({ key: "removeLargeStorageEntriesButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Remove")
    });
    if (!confirmed) {
      return;
    }
    const scopesToOptimize = /* @__PURE__ */ new Set();
    for (const item of selectedItems) {
      storageService.remove(item.key, item.scope);
      scopesToOptimize.add(item.scope);
    }
    for (const scope of scopesToOptimize) {
      await storageService.optimize(scope);
    }
  }
};
_RemoveLargeStorageEntriesAction.SIZE_THRESHOLD = 1024 * 16;
let RemoveLargeStorageEntriesAction = _RemoveLargeStorageEntriesAction;
let tracker = void 0;
let trackedDisposables = /* @__PURE__ */ new Set();
const DisposablesSnapshotStateContext = new RawContextKey("dirtyWorkingCopies", "stopped");
class StartTrackDisposables extends Action2 {
  constructor() {
    super({
      id: "workbench.action.startTrackDisposables",
      title: localize2("startTrackDisposables", "Start Tracking Disposables"),
      category: Categories.Developer,
      f1: true,
      precondition: ContextKeyExpr.and(DisposablesSnapshotStateContext.isEqualTo("pending").negate(), DisposablesSnapshotStateContext.isEqualTo("started").negate())
    });
  }
  run(accessor) {
    const disposablesSnapshotStateContext = DisposablesSnapshotStateContext.bindTo(accessor.get(IContextKeyService));
    disposablesSnapshotStateContext.set("started");
    trackedDisposables.clear();
    tracker = new DisposableTracker();
    setDisposableTracker(tracker);
  }
}
class SnapshotTrackedDisposables extends Action2 {
  constructor() {
    super({
      id: "workbench.action.snapshotTrackedDisposables",
      title: localize2("snapshotTrackedDisposables", "Snapshot Tracked Disposables"),
      category: Categories.Developer,
      f1: true,
      precondition: DisposablesSnapshotStateContext.isEqualTo("started")
    });
  }
  run(accessor) {
    const disposablesSnapshotStateContext = DisposablesSnapshotStateContext.bindTo(accessor.get(IContextKeyService));
    disposablesSnapshotStateContext.set("pending");
    trackedDisposables = new Set(tracker?.computeLeakingDisposables(1e3)?.leaks.map((disposable) => disposable.value));
  }
}
class StopTrackDisposables extends Action2 {
  constructor() {
    super({
      id: "workbench.action.stopTrackDisposables",
      title: localize2("stopTrackDisposables", "Stop Tracking Disposables"),
      category: Categories.Developer,
      f1: true,
      precondition: DisposablesSnapshotStateContext.isEqualTo("pending")
    });
  }
  run(accessor) {
    const editorService = accessor.get(IEditorService);
    const disposablesSnapshotStateContext = DisposablesSnapshotStateContext.bindTo(accessor.get(IContextKeyService));
    disposablesSnapshotStateContext.set("stopped");
    if (tracker) {
      const disposableLeaks = /* @__PURE__ */ new Set();
      for (const disposable of new Set(tracker.computeLeakingDisposables(1e3)?.leaks) ?? []) {
        if (trackedDisposables.has(disposable.value)) {
          disposableLeaks.add(disposable);
        }
      }
      const leaks = tracker.computeLeakingDisposables(1e3, Array.from(disposableLeaks));
      if (leaks) {
        editorService.openEditor({ resource: void 0, contents: leaks.details });
      }
    }
    setDisposableTracker(null);
    tracker = void 0;
    trackedDisposables.clear();
  }
}
function managedSettingsSourceLabel(source) {
  switch (source) {
    case "server":
      return "GitHub Server API";
    case "nativeMdm":
      return "Native MDM";
    case "file":
      return "File (managed-settings.json)";
    case "none":
      return "None (no managed settings active)";
  }
}
function managedSettingsSourceShortLabel(source) {
  switch (source) {
    case "server":
      return "Server";
    case "nativeMdm":
      return "Native MDM";
    case "file":
      return "File";
    case "none":
      return "None";
  }
}
function jsonBlock(value) {
  return "```json\n" + JSON.stringify(value ?? {}, null, 2) + "\n```\n\n";
}
function managedSettingsPipeline(rawLabel, raw, normalized, projected, rawUnavailableMessage) {
  let content = `**${rawLabel}**

`;
  content += raw === void 0 ? `*${rawUnavailableMessage ?? "Unavailable"}*

` : jsonBlock(raw);
  content += "**Normalized bag**\n\n";
  content += jsonBlock(normalized);
  content += "**VS Code policy projection**\n\n";
  content += jsonBlock(projected);
  return content;
}
function managedValueCell(value) {
  if (value === void 0) {
    return "\u2014";
  }
  return `\`${JSON.stringify(value).replace(/\|/g, "\\|")}\``;
}
const PROPERTY_VALUE_TABLE_HEADER = "| Property | Value |\n|----------|-------|\n";
class PolicyDiagnosticsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.showPolicyDiagnostics",
      title: localize2("policyDiagnostics", "Policy Diagnostics"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const configurationService = accessor.get(IConfigurationService);
    const productService = accessor.get(IProductService);
    const defaultAccountService = accessor.get(IDefaultAccountService);
    const authenticationService = accessor.get(IAuthenticationService);
    const authenticationAccessService = accessor.get(IAuthenticationAccessService);
    const policyService = accessor.get(IPolicyService);
    const accountPolicyGateService = accessor.get(IAccountPolicyGateService);
    const agentHostService = accessor.get(IAgentHostService);
    const agentHostEnablementService = accessor.get(IAgentHostEnablementService);
    let nativeManagedSettingsService;
    try {
      nativeManagedSettingsService = accessor.get(INativeManagedSettingsService);
    } catch {
    }
    let fileManagedSettingsService;
    try {
      fileManagedSettingsService = accessor.get(IFileManagedSettingsService);
    } catch {
    }
    const configurationRegistry2 = Registry.as(ConfigurationExtensions.Configuration);
    let content = "# VS Code Policy Diagnostics\n\n";
    content += "*WARNING: This file may contain sensitive information.*\n\n";
    content += "## System Information\n\n";
    content += PROPERTY_VALUE_TABLE_HEADER;
    content += `| Generated | ${(/* @__PURE__ */ new Date()).toISOString()} |
`;
    content += `| Product | ${productService.nameLong} ${productService.version} |
`;
    content += `| Commit | ${productService.commit || "n/a"} |

`;
    content += "## Account Information\n\n";
    try {
      const account = await defaultAccountService.getDefaultAccount();
      const sensitiveKeys = ["sessionId", "analytics_tracking_id"];
      if (account) {
        let username = "Unknown";
        let accountLabel = "Unknown";
        try {
          const providerIds = authenticationService.getProviderIds();
          for (const providerId of providerIds) {
            const sessions = await authenticationService.getSessions(providerId);
            const matchingSession = sessions.find((session) => session.id === account.sessionId);
            if (matchingSession) {
              username = matchingSession.account.id;
              accountLabel = matchingSession.account.label;
              break;
            }
          }
        } catch (error) {
        }
        content += "### Default Account Summary\n\n";
        content += `**Account ID/Username**: ${username}

`;
        content += `**Account Label**: ${accountLabel}

`;
        content += "### Detailed Account Properties\n\n";
        content += PROPERTY_VALUE_TABLE_HEADER;
        for (const [key, value] of Object.entries(account)) {
          if (value !== void 0 && value !== null) {
            let displayValue;
            if (sensitiveKeys.includes(key)) {
              displayValue = "***";
            } else if (typeof value === "object") {
              displayValue = JSON.stringify(value);
            } else {
              displayValue = String(value);
            }
            content += `| ${key} | ${displayValue} |
`;
          }
        }
        const policyData = defaultAccountService.policyData;
        content += `| policyData | ${policyData ? JSON.stringify(policyData) : "No Policy Data"} |
`;
        content += "\n";
      } else {
        content += "*No default account configured*\n\n";
      }
    } catch (error) {
      content += `*Error retrieving account information: ${error}*

`;
    }
    content += "## Account Policy Gate\n\n";
    try {
      const gateInfo = accountPolicyGateService.gateInfo;
      const approvedOrgsRaw = policyService.getPolicyValue(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME);
      content += PROPERTY_VALUE_TABLE_HEADER;
      content += `| State | \`${gateInfo.state}\` |
`;
      content += `| Reason | ${gateInfo.reason ? `\`${gateInfo.reason}\`` : "*n/a*"} |
`;
      content += `| ${APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME} | ${approvedOrgsRaw !== void 0 ? `\`${String(approvedOrgsRaw)}\`` : "*not set*"} |
`;
      content += "\n";
      content += "**Legend**\n\n";
      content += "- `inactive`: gate disabled (no approved orgs configured) \u2014 policies behave as account data dictates.\n";
      content += "- `satisfied`: gate active and approved \u2014 account policy values flow normally.\n";
      content += "- `restricted`: gate active and not satisfied \u2014 opted-in policies forced to their restricted value.\n";
      content += "  - `noAccount`: no default account signed in.\n";
      content += "  - `wrongProvider`: signed in with a non-GitHub provider.\n";
      content += "  - `orgNotApproved`: signed in but account is not a member of any approved organization.\n";
      content += "  - `policyNotResolved`: signed in to an approved org but account-side policy data has not yet been fetched.\n\n";
    } catch (error) {
      content += `*Error retrieving account policy gate info: ${error}*

`;
    }
    content += "## Managed Settings\n\n";
    const activeManagedSettingSources = /* @__PURE__ */ new Map();
    try {
      const policyData = defaultAccountService.policyData;
      const serverManagedSettings = policyData?.managedSettings ?? {};
      const nativeManagedSettings = nativeManagedSettingsService?.managedSettings ?? {};
      const fileManagedSettings = fileManagedSettingsService?.managedSettings ?? {};
      const fileRawManagedSettings = fileManagedSettingsService?.rawManagedSettings;
      const declaredDefinitions = {};
      for (const property of [...Object.values(configurationRegistry2.getConfigurationProperties()), ...Object.values(configurationRegistry2.getExcludedConfigurationProperties())]) {
        const declared = property.policy?.managedSettings;
        if (declared) {
          Object.assign(declaredDefinitions, declared);
        }
      }
      const pick = pickManagedSettings(nativeManagedSettings, serverManagedSettings, fileManagedSettings);
      content += `**Active sources** (in precedence order): ${pick.activeSources.length > 0 ? pick.activeSources.map(managedSettingsSourceLabel).join(", ") : managedSettingsSourceLabel("none")}

`;
      content += "*Precedence is resolved per key: native MDM wins over the server endpoint, which wins over the file on disk. A key left unset by a higher channel is still filled in by a lower one.*\n\n";
      const parseErrors = [];
      const projectChannel = (channel, values) => projectManagedSettings(
        values,
        declaredDefinitions,
        (message) => parseErrors.push({ stage: `${channel}: project`, message })
      );
      const channelContributes = (channel) => pick.activeSources.includes(channel);
      const nativeProjected = projectChannel("nativeMdm", nativeManagedSettings);
      const serverProjected = projectChannel("server", serverManagedSettings);
      const fileProjected = projectChannel("file", fileManagedSettings);
      const effective = projectManagedSettings(pick.values, declaredDefinitions, (message) => parseErrors.push({ stage: "effective: project", message }));
      content += "### VS Code Managed-Settings Schema\n\n";
      content += "*Only keys declared here can reach VS Code policy callbacks. Runtime-owned keys may still be enforced by the Copilot runtime even when absent from the projections below.*\n\n";
      content += jsonBlock(declaredDefinitions);
      content += "### Native MDM\n\n";
      content += PROPERTY_VALUE_TABLE_HEADER;
      content += `| Available | ${nativeManagedSettingsService ? "yes" : "no"} |
`;
      content += `| Contributes winning keys | ${channelContributes("nativeMdm") ? "yes" : "no"} |

`;
      if (nativeManagedSettingsService) {
        content += "*The native policy watcher exposes only declared scalar keys, so its source values are already definition-scoped and canonical.*\n\n";
        content += managedSettingsPipeline("Source values (definition-scoped)", nativeManagedSettings, nativeManagedSettings, nativeProjected);
      }
      content += "### GitHub Server API\n\n";
      content += PROPERTY_VALUE_TABLE_HEADER;
      content += "| Endpoint | `/copilot_internal/managed_settings` |\n";
      const fetchStatus = defaultAccountService.managedSettingsFetchStatus;
      content += `| Last fetch | ${fetchStatus === null ? "*never*" : `\`${fetchStatus}\``} |
`;
      const fetchedAt = defaultAccountService.managedSettingsFetchedAt;
      content += `| Last successful fetch | ${fetchedAt ? new Date(fetchedAt).toLocaleString() : "*n/a*"} |
`;
      content += `| Contributes winning keys | ${channelContributes("server") ? "yes" : "no"} |

`;
      const rawResponse = defaultAccountService.managedSettingsRawResponse;
      if (isObject(rawResponse)) {
        adaptManagedSettings(rawResponse, (message) => parseErrors.push({ stage: "adapt", message }));
      }
      content += managedSettingsPipeline(
        "Raw response (last successful fetch)",
        isObject(rawResponse) ? rawResponse : void 0,
        serverManagedSettings,
        serverProjected,
        "No successful managed-settings response has been captured."
      );
      content += "### File (managed-settings.json)\n\n";
      content += PROPERTY_VALUE_TABLE_HEADER;
      content += `| Available | ${fileManagedSettingsService ? "yes" : "no"} |
`;
      content += `| Contributes winning keys | ${channelContributes("file") ? "yes" : "no"} |

`;
      if (fileManagedSettingsService) {
        if (fileRawManagedSettings) {
          normalizeManagedSettings(fileRawManagedSettings, (message) => parseErrors.push({ stage: "file: normalize", message }));
        }
        content += managedSettingsPipeline("Raw parsed file", fileRawManagedSettings, fileManagedSettings, fileProjected);
      }
      content += "### Effective Resolution\n\n";
      content += "**Merged normalized bag**\n\n";
      content += jsonBlock(pick.values);
      content += "**Effective VS Code policy bag**\n\n";
      content += jsonBlock(effective);
      content += "**Per-key precedence**\n\n";
      if (pick.resolutions.size > 0) {
        content += "| Key | Effective | Winning Source | Native MDM | Server | File |\n";
        content += "|-----|-----------|----------------|------------|--------|------|\n";
        const channelValue = (resolution, channel) => {
          const contribution = resolution.contributions.find((c) => c.channel === channel);
          if (!contribution) {
            return "\u2014";
          }
          const cell = managedValueCell(contribution.value);
          return channel === resolution.source ? cell : `~~${cell}~~`;
        };
        for (const key of [...pick.resolutions.keys()].sort()) {
          const resolution = pick.resolutions.get(key);
          content += `| ${key} | ${managedValueCell(resolution.value)} | ${managedSettingsSourceShortLabel(resolution.source)} | ${channelValue(resolution, "nativeMdm")} | ${channelValue(resolution, "server")} | ${channelValue(resolution, "file")} |
`;
        }
        content += "\n";
        content += "*Struck-through values were supplied by a channel but overridden by a higher-precedence channel for that key.*\n\n";
      } else {
        content += "*No managed-settings keys are supplied by any channel.*\n\n";
      }
      content += "### Agent Runtime Resolution\n\n";
      content += "*Resolved independently by each provider through its own SDK/runtime. This may include runtime-owned keys that VS Code does not declare as configuration policies.*\n\n";
      if (!agentHostEnablementService.enabled.get()) {
        content += "*Agent Host is disabled; runtime managed-settings diagnostics were not queried.*\n\n";
      } else {
        try {
          const runtimeDiagnostics = await agentHostService.getManagedSettingsDiagnostics();
          if (runtimeDiagnostics.length === 0) {
            content += "*No agent provider exposes managed-settings diagnostics.*\n\n";
          }
          for (const diagnostic of runtimeDiagnostics) {
            content += `#### ${diagnostic.provider}

`;
            if (diagnostic.error) {
              content += `*Probe failed: ${diagnostic.error}*

`;
            } else {
              content += jsonBlock(diagnostic.snapshot);
            }
          }
        } catch (error) {
          content += `*Agent runtime diagnostics unavailable: ${error}*

`;
        }
      }
      for (const key of Object.keys(effective)) {
        const resolution = pick.resolutions.get(key);
        if (resolution) {
          activeManagedSettingSources.set(key, resolution.source);
        }
      }
      for (const key of [COPILOT_ENABLED_PLUGINS_KEY, COPILOT_STRICT_MARKETPLACES_KEY, COPILOT_EXTRA_MARKETPLACES_KEY]) {
        const value = effective[key];
        if (typeof value !== "string") {
          continue;
        }
        const jsonErrors = [];
        json.parse(value, jsonErrors);
        for (const e of jsonErrors) {
          parseErrors.push({ stage: "parse", message: `${key} @ offset ${e.offset}: ${getParseErrorMessage(e.error)}` });
        }
      }
      content += `### Normalization and Parse Issues (${parseErrors.length})

`;
      if (parseErrors.length > 0) {
        content += "| Stage | Message |\n";
        content += "|-------|---------|\n";
        for (const { stage, message } of parseErrors) {
          content += `| ${stage} | ${message.replace(/\|/g, "\\|")} |
`;
        }
        content += "\n";
      } else {
        content += "*None.*\n\n";
      }
    } catch (error) {
      content += `*Error rendering managed settings diagnostics: ${error}*

`;
    }
    content += "## Policy-Controlled Settings\n\n";
    const policyConfigurations = configurationRegistry2.getPolicyConfigurations();
    const policyReferenceConfigurations = configurationRegistry2.getPolicyReferenceConfigurations();
    const configurationProperties = configurationRegistry2.getConfigurationProperties();
    const excludedProperties = configurationRegistry2.getExcludedConfigurationProperties();
    if (policyConfigurations.size > 0 || policyReferenceConfigurations.size > 0) {
      const appliedPolicy = [];
      const notAppliedPolicy = [];
      const collectPolicySetting = (policyName, settingKey) => {
        const property = configurationProperties[settingKey] ?? excludedProperties[settingKey];
        if (property) {
          const inspectValue = configurationService.inspect(settingKey);
          const settingInfo = {
            name: policyName,
            key: settingKey,
            property,
            inspection: inspectValue
          };
          if (inspectValue.policyValue !== void 0) {
            appliedPolicy.push(settingInfo);
          } else {
            notAppliedPolicy.push(settingInfo);
          }
        }
      };
      for (const [policyName, settingKey] of policyConfigurations) {
        collectPolicySetting(policyName, settingKey);
      }
      for (const [policyName, settingKeys] of policyReferenceConfigurations) {
        for (const settingKey of settingKeys) {
          collectPolicySetting(policyName, settingKey);
        }
      }
      const policySourceMemo = /* @__PURE__ */ new Map();
      const getPolicySource = (policyName) => {
        if (policySourceMemo.has(policyName)) {
          return policySourceMemo.get(policyName);
        }
        try {
          const policyServiceConstructorName = policyService.constructor.name;
          if (policyServiceConstructorName === "MultiplexPolicyService") {
            const multiplexService = policyService;
            if (multiplexService.policyServices) {
              const componentServices = multiplexService.policyServices;
              for (const service of componentServices) {
                if (service.getPolicyValue && service.getPolicyValue(policyName) !== void 0) {
                  policySourceMemo.set(policyName, service.constructor.name);
                  return service.constructor.name;
                }
              }
            }
          }
          return "";
        } catch {
          return "Unknown";
        }
      };
      const gateInfo = accountPolicyGateService.gateInfo;
      const gateRestricted = gateInfo.state === AccountPolicyGateState.Restricted && gateInfo.reason !== AccountPolicyGateUnsatisfiedReason.PolicyNotResolved;
      const getRefinedPolicySource = (item) => {
        const declaredKeys = item.property.policy?.managedSettings ? Object.keys(item.property.policy.managedSettings) : [];
        if (!gateRestricted) {
          const winningSources = /* @__PURE__ */ new Set();
          for (const key of declaredKeys) {
            const source = activeManagedSettingSources.get(key);
            if (source) {
              winningSources.add(source);
            }
          }
          if (winningSources.size > 0) {
            const ordered = MANAGED_SETTINGS_CHANNELS.filter((channel) => winningSources.has(channel));
            return `Managed Settings: ${ordered.map(managedSettingsSourceShortLabel).join(", ")}`;
          }
        }
        return getPolicySource(item.name);
      };
      content += "### Applied Policy\n\n";
      appliedPolicy.sort((a, b) => getRefinedPolicySource(a).localeCompare(getRefinedPolicySource(b)) || a.name.localeCompare(b.name));
      if (appliedPolicy.length > 0) {
        content += "| Setting Key | Policy Name | Policy Source | Managed Settings | Default Value | Current Value | Policy Value |\n";
        content += "|-------------|-------------|---------------|------------------|---------------|---------------|-------------|\n";
        for (const setting of appliedPolicy) {
          const defaultValue = JSON.stringify(setting.property.default);
          const currentValue = JSON.stringify(setting.inspection.value);
          const policyValue = JSON.stringify(setting.inspection.policyValue);
          const policySource = getRefinedPolicySource(setting);
          const managedSettingsKeys = setting.property.policy?.managedSettings ? Object.keys(setting.property.policy.managedSettings).join(", ") : "";
          content += `| ${setting.key} | ${setting.name} | ${policySource} | ${managedSettingsKeys || "*n/a*"} | \`${defaultValue}\` | \`${currentValue}\` | \`${policyValue}\` |
`;
        }
        content += "\n";
      } else {
        content += "*No settings are currently controlled by policies*\n\n";
      }
      content += "###  Non-applied Policy\n\n";
      if (notAppliedPolicy.length > 0) {
        content += "| Setting Key | Policy Name  \n";
        content += "|-------------|-------------|\n";
        for (const setting of notAppliedPolicy) {
          content += `| ${setting.key} | ${setting.name}|
`;
        }
        content += "\n";
      } else {
        content += "*All policy-controllable settings are currently being enforced*\n\n";
      }
    } else {
      content += "*No policy-controlled settings found*\n\n";
    }
    content += "## Authentication Information\n\n";
    try {
      const providerIds = authenticationService.getProviderIds();
      if (providerIds.length > 0) {
        content += "### Authentication Providers\n\n";
        content += "| Provider ID | Sessions | Accounts |\n";
        content += "|-------------|----------|----------|\n";
        for (const providerId of providerIds) {
          try {
            const sessions = await authenticationService.getSessions(providerId);
            const accounts = sessions.map((session) => session.account);
            const uniqueAccounts = Array.from(new Set(accounts.map((account) => account.label)));
            content += `| ${providerId} | ${sessions.length} | ${uniqueAccounts.join(", ") || "None"} |
`;
          } catch (error) {
            content += `| ${providerId} | Error | ${error} |
`;
          }
        }
        content += "\n";
        content += "### Detailed Session Information\n\n";
        for (const providerId of providerIds) {
          try {
            const sessions = await authenticationService.getSessions(providerId);
            if (sessions.length > 0) {
              content += `#### ${providerId}

`;
              content += "| Account | Scopes | Extensions with Access |\n";
              content += "|---------|--------|------------------------|\n";
              for (const session of sessions) {
                const accountName = session.account.label;
                const scopes = session.scopes.join(", ") || "Default";
                try {
                  const allowedExtensions = authenticationAccessService.readAllowedExtensions(providerId, accountName);
                  const extensionNames = allowedExtensions.filter((ext) => ext.allowed !== false).map((ext) => `${ext.name}${ext.trusted ? " (trusted)" : ""}`).join(", ") || "None";
                  content += `| ${accountName} | ${scopes} | ${extensionNames} |
`;
                } catch (error) {
                  content += `| ${accountName} | ${scopes} | Error: ${error} |
`;
                }
              }
              content += "\n";
            }
          } catch (error) {
            content += `#### ${providerId}
*Error retrieving sessions: ${error}*

`;
          }
        }
      } else {
        content += "*No authentication providers found*\n\n";
      }
    } catch (error) {
      content += `*Error retrieving authentication information: ${error}*

`;
    }
    await editorService.openEditor({
      resource: void 0,
      contents: content,
      languageId: "markdown",
      options: { pinned: true }
    });
  }
}
class SyncAccountPolicyAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.syncAccountPolicy",
      title: localize2("syncAccountPolicy", "Sync Account Policy"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const defaultAccountService = accessor.get(IDefaultAccountService);
    const dialogService = accessor.get(IDialogService);
    const logService = accessor.get(ILogService);
    try {
      logService.info("[DefaultAccount] Manually syncing account policy");
      await defaultAccountService.refresh({ forceRefresh: true });
      await dialogService.info(localize("syncAccountPolicy.success", "Account policy has been synced."));
    } catch (error) {
      logService.error("[DefaultAccount] Failed to sync account policy", error);
      await dialogService.error(
        localize("syncAccountPolicy.error", "Failed to sync account policy."),
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
registerAction2(InspectContextKeysAction);
registerAction2(ToggleScreencastModeAction);
registerAction2(LogStorageAction);
registerAction2(LogWorkingCopiesAction);
registerAction2(RemoveLargeStorageEntriesAction);
registerAction2(PolicyDiagnosticsAction);
registerAction2(SyncAccountPolicyAction);
if (!product.commit) {
  registerAction2(StartTrackDisposables);
  registerAction2(SnapshotTrackedDisposables);
  registerAction2(StopTrackDisposables);
}
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  id: "screencastMode",
  order: 9,
  title: localize("screencastModeConfigurationTitle", "Screencast Mode"),
  type: "object",
  properties: {
    "screencastMode.verticalOffset": {
      type: "number",
      default: 20,
      minimum: 0,
      maximum: 90,
      description: localize("screencastMode.location.verticalPosition", "Controls the vertical offset of the screencast mode overlay from the bottom as a percentage of the workbench height.")
    },
    "screencastMode.fontSize": {
      type: "number",
      default: 56,
      minimum: 20,
      maximum: 100,
      description: localize("screencastMode.fontSize", "Controls the font size (in pixels) of the screencast mode keyboard.")
    },
    "screencastMode.keyboardOptions": {
      type: "object",
      description: localize("screencastMode.keyboardOptions.description", "Options for customizing the keyboard overlay in screencast mode."),
      properties: {
        "showKeys": {
          type: "boolean",
          default: true,
          description: localize("screencastMode.keyboardOptions.showKeys", "Show raw keys.")
        },
        "showKeybindings": {
          type: "boolean",
          default: true,
          description: localize("screencastMode.keyboardOptions.showKeybindings", "Show keyboard shortcuts.")
        },
        "showCommands": {
          type: "boolean",
          default: true,
          description: localize("screencastMode.keyboardOptions.showCommands", "Show command names.")
        },
        "showCommandGroups": {
          type: "boolean",
          default: false,
          description: localize("screencastMode.keyboardOptions.showCommandGroups", "Show command group names, when commands are also shown.")
        },
        "showSingleEditorCursorMoves": {
          type: "boolean",
          default: true,
          description: localize("screencastMode.keyboardOptions.showSingleEditorCursorMoves", "Show single editor cursor move commands.")
        }
      },
      default: {
        "showKeys": true,
        "showKeybindings": true,
        "showCommands": true,
        "showCommandGroups": false,
        "showSingleEditorCursorMoves": true
      },
      additionalProperties: false
    },
    "screencastMode.keyboardOverlayTimeout": {
      type: "number",
      default: 800,
      minimum: 500,
      maximum: 5e3,
      description: localize("screencastMode.keyboardOverlayTimeout", "Controls how long (in milliseconds) the keyboard overlay is shown in screencast mode.")
    },
    "screencastMode.mouseIndicatorColor": {
      type: "string",
      format: "color-hex",
      default: "#FF0000",
      description: localize("screencastMode.mouseIndicatorColor", "Controls the color in hex (#RGB, #RGBA, #RRGGBB or #RRGGBBAA) of the mouse indicator in screencast mode.")
    },
    "screencastMode.mouseIndicatorSize": {
      type: "number",
      default: 20,
      minimum: 20,
      maximum: 100,
      description: localize("screencastMode.mouseIndicatorSize", "Controls the size (in pixels) of the mouse indicator in screencast mode.")
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL2FjdGlvbnMvZGV2ZWxvcGVyQWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9hY3Rpb25zLmNzcyc7XG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBEb21FbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2V2ZW50LmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlLCBkaXNwb3NlLCBEaXNwb3NhYmxlU3RvcmUsIHNldERpc3Bvc2FibGVUcmFja2VyLCBEaXNwb3NhYmxlVHJhY2tlciwgRGlzcG9zYWJsZUluZm8gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbiwgYXBwZW5kLCAkLCBnZXRBY3RpdmVEb2N1bWVudCwgb25EaWRSZWdpc3RlcldpbmRvdywgZ2V0V2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgY3JlYXRlQ1NTUnVsZSwgY3JlYXRlU3R5bGVTaGVldCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2Jyb3dzZXIvY29udGV4dEtleVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFjdGlvbjIsIEFjdGlvbjIsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUJhY2t1cC5qcyc7XG5pbXBvcnQgeyBSZXNvbHV0aW9uUmVzdWx0LCBSZXN1bHRLaW5kIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ1Jlc29sdmVyLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJT3V0cHV0U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL291dHB1dC9jb21tb24vb3V0cHV0LmpzJztcbmltcG9ydCB7IHdpbmRvd0xvZ0lkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvbG9nL2NvbW1vbi9sb2dDb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQnl0ZVNpemUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQb2xpY3lTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcG9saWN5L2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9FTkFCTEVEX1BMVUdJTlNfS0VZLCBDT1BJTE9UX0VYVFJBX01BUktFVFBMQUNFU19LRVksIENPUElMT1RfU1RSSUNUX01BUktFVFBMQUNFU19LRVksIElOYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLCBJRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UsIElNYW5hZ2VkU2V0dGluZ1Jlc29sdXRpb24sIE1BTkFHRURfU0VUVElOR1NfQ0hBTk5FTFMsIE1hbmFnZWRTZXR0aW5nc0NoYW5uZWwsIE1hbmFnZWRTZXR0aW5nc1NvdXJjZSwgbm9ybWFsaXplTWFuYWdlZFNldHRpbmdzLCBwcm9qZWN0TWFuYWdlZFNldHRpbmdzLCBwaWNrTWFuYWdlZFNldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcG9saWN5L2NvbW1vbi9jb3BpbG90TWFuYWdlZFNldHRpbmdzLmpzJztcbmltcG9ydCB7IElNYW5hZ2VkU2V0dGluZ1BvbGljeURlZmluaXRpb24sIE1hbmFnZWRTZXR0aW5nVmFsdWUsIE1hbmFnZWRTZXR0aW5nc0RhdGEgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgQVBQUk9WRURfQUNDT1VOVF9PUkdBTklaQVRJT05TX1BPTElDWV9OQU1FLCBBY2NvdW50UG9saWN5R2F0ZVN0YXRlLCBBY2NvdW50UG9saWN5R2F0ZVVuc2F0aXNmaWVkUmVhc29uLCBJQWNjb3VudFBvbGljeUdhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvcG9saWNpZXMvY29tbW9uL2FjY291bnRQb2xpY3lTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFkYXB0TWFuYWdlZFNldHRpbmdzLCBJTWFuYWdlZFNldHRpbmdzUmVzcG9uc2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hY2NvdW50cy9icm93c2VyL21hbmFnZWRTZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAqIGFzIGpzb24gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBnZXRQYXJzZUVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25FcnJvck1lc3NhZ2VzLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5qcyc7XG5cbmNsYXNzIEluc3BlY3RDb250ZXh0S2V5c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5pbnNwZWN0Q29udGV4dEtleXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW5zcGVjdCBjb250ZXh0IGtleXMnLCAnSW5zcGVjdCBDb250ZXh0IEtleXMnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBzdHlsZXNoZWV0ID0gY3JlYXRlU3R5bGVTaGVldCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGNyZWF0ZUNTU1J1bGUoJyonLCAnY3Vyc29yOiBjcm9zc2hhaXIgIWltcG9ydGFudDsnLCBzdHlsZXNoZWV0KTtcblxuXHRcdGNvbnN0IGhvdmVyRmVlZGJhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb25zdCBhY3RpdmVEb2N1bWVudCA9IGdldEFjdGl2ZURvY3VtZW50KCk7XG5cdFx0YWN0aXZlRG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChob3ZlckZlZWRiYWNrKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGhvdmVyRmVlZGJhY2sucmVtb3ZlKCkpKTtcblxuXHRcdGhvdmVyRmVlZGJhY2suc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdGhvdmVyRmVlZGJhY2suc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJztcblx0XHRob3ZlckZlZWRiYWNrLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICdyZ2JhKDI1NSwgMCwgMCwgMC41KSc7XG5cdFx0aG92ZXJGZWVkYmFjay5zdHlsZS56SW5kZXggPSAnMTAwMCc7XG5cblx0XHRjb25zdCBvbk1vdXNlTW92ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcihhY3RpdmVEb2N1bWVudCwgJ21vdXNlbW92ZScsIHRydWUpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQob25Nb3VzZU1vdmUuZXZlbnQoZSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbih0YXJnZXQpO1xuXG5cdFx0XHRob3ZlckZlZWRiYWNrLnN0eWxlLnRvcCA9IGAke3Bvc2l0aW9uLnRvcH1weGA7XG5cdFx0XHRob3ZlckZlZWRiYWNrLnN0eWxlLmxlZnQgPSBgJHtwb3NpdGlvbi5sZWZ0fXB4YDtcblx0XHRcdGhvdmVyRmVlZGJhY2suc3R5bGUud2lkdGggPSBgJHtwb3NpdGlvbi53aWR0aH1weGA7XG5cdFx0XHRob3ZlckZlZWRiYWNrLnN0eWxlLmhlaWdodCA9IGAke3Bvc2l0aW9uLmhlaWdodH1weGA7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgb25Nb3VzZURvd24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIoYWN0aXZlRG9jdW1lbnQsICdtb3VzZWRvd24nLCB0cnVlKSk7XG5cdFx0RXZlbnQub25jZShvbk1vdXNlRG93bi5ldmVudCkoZSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgfSwgbnVsbCwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3Qgb25Nb3VzZVVwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKGFjdGl2ZURvY3VtZW50LCAnbW91c2V1cCcsIHRydWUpKTtcblx0XHRFdmVudC5vbmNlKG9uTW91c2VVcC5ldmVudCkoZSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkgYXMgQ29udGV4dDtcblx0XHRcdGNvbnNvbGUubG9nKGNvbnRleHQuY29sbGVjdEFsbFZhbHVlcygpKTtcblxuXHRcdFx0ZGlzcG9zZShkaXNwb3NhYmxlcyk7XG5cdFx0fSwgbnVsbCwgZGlzcG9zYWJsZXMpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJU2NyZWVuY2FzdEtleWJvYXJkT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHNob3dLZXlzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2hvd0tleWJpbmRpbmdzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2hvd0NvbW1hbmRzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2hvd0NvbW1hbmRHcm91cHM/OiBib29sZWFuO1xuXHRyZWFkb25seSBzaG93U2luZ2xlRWRpdG9yQ3Vyc29yTW92ZXM/OiBib29sZWFuO1xufVxuXG5jbGFzcyBUb2dnbGVTY3JlZW5jYXN0TW9kZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlU2NyZWVuY2FzdE1vZGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlIHNjcmVlbmNhc3QgbW9kZScsICdUb2dnbGUgU2NyZWVuY2FzdCBNb2RlJyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0aWYgKFRvZ2dsZVNjcmVlbmNhc3RNb2RlQWN0aW9uLmRpc3Bvc2FibGUpIHtcblx0XHRcdFRvZ2dsZVNjcmVlbmNhc3RNb2RlQWN0aW9uLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0VG9nZ2xlU2NyZWVuY2FzdE1vZGVBY3Rpb24uZGlzcG9zYWJsZSA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYXlvdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyO1xuXG5cdFx0Y29uc3QgbW91c2VNYXJrZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuc2NyZWVuY2FzdC1tb3VzZScpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG1vdXNlTWFya2VyLnJlbW92ZSgpKSk7XG5cblx0XHRjb25zdCBrZXlib2FyZE1hcmtlciA9IGFwcGVuZChjb250YWluZXIsICQoJy5zY3JlZW5jYXN0LWtleWJvYXJkJykpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ga2V5Ym9hcmRNYXJrZXIucmVtb3ZlKCkpKTtcblxuXHRcdGNvbnN0IG9uTW91c2VEb3duID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPE1vdXNlRXZlbnQ+KCkpO1xuXHRcdGNvbnN0IG9uTW91c2VVcCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxNb3VzZUV2ZW50PigpKTtcblx0XHRjb25zdCBvbk1vdXNlTW92ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxNb3VzZUV2ZW50PigpKTtcblxuXHRcdGZ1bmN0aW9uIHJlZ2lzdGVyQ29udGFpbmVyTGlzdGVuZXJzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHdpbmRvd0Rpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGxpc3RlbmVycyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0bGlzdGVuZXJzLmFkZChsaXN0ZW5lcnMuYWRkKG5ldyBEb21FbWl0dGVyKGNvbnRhaW5lciwgJ21vdXNlZG93bicsIHRydWUpKS5ldmVudChlID0+IG9uTW91c2VEb3duLmZpcmUoZSkpKTtcblx0XHRcdGxpc3RlbmVycy5hZGQobGlzdGVuZXJzLmFkZChuZXcgRG9tRW1pdHRlcihjb250YWluZXIsICdtb3VzZXVwJywgdHJ1ZSkpLmV2ZW50KGUgPT4gb25Nb3VzZVVwLmZpcmUoZSkpKTtcblx0XHRcdGxpc3RlbmVycy5hZGQobGlzdGVuZXJzLmFkZChuZXcgRG9tRW1pdHRlcihjb250YWluZXIsICdtb3VzZW1vdmUnLCB0cnVlKSkuZXZlbnQoZSA9PiBvbk1vdXNlTW92ZS5maXJlKGUpKSk7XG5cblx0XHRcdHdpbmRvd0Rpc3Bvc2FibGVzLmFkZChsaXN0ZW5lcnMpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB3aW5kb3dEaXNwb3NhYmxlcy5kZWxldGUobGlzdGVuZXJzKSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGlzdGVuZXJzKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHsgd2luZG93LCBkaXNwb3NhYmxlcyB9IG9mIGdldFdpbmRvd3MoKSkge1xuXHRcdFx0cmVnaXN0ZXJDb250YWluZXJMaXN0ZW5lcnMobGF5b3V0U2VydmljZS5nZXRDb250YWluZXIod2luZG93KSwgZGlzcG9zYWJsZXMpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVzLmFkZChvbkRpZFJlZ2lzdGVyV2luZG93KCh7IHdpbmRvdywgZGlzcG9zYWJsZXMgfSkgPT4gcmVnaXN0ZXJDb250YWluZXJMaXN0ZW5lcnMobGF5b3V0U2VydmljZS5nZXRDb250YWluZXIod2luZG93KSwgZGlzcG9zYWJsZXMpKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGF5b3V0U2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZUNvbnRhaW5lcigoKSA9PiB7XG5cdFx0XHRsYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lci5hcHBlbmRDaGlsZChtb3VzZU1hcmtlcik7XG5cdFx0XHRsYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lci5hcHBlbmRDaGlsZChrZXlib2FyZE1hcmtlcik7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlTW91c2VJbmRpY2F0b3JDb2xvciA9ICgpID0+IHtcblx0XHRcdG1vdXNlTWFya2VyLnN0eWxlLmJvcmRlckNvbG9yID0gQ29sb3IuZnJvbUhleChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdzY3JlZW5jYXN0TW9kZS5tb3VzZUluZGljYXRvckNvbG9yJykpLnRvU3RyaW5nKCk7XG5cdFx0fTtcblxuXHRcdGxldCBtb3VzZUluZGljYXRvclNpemU6IG51bWJlcjtcblx0XHRjb25zdCB1cGRhdGVNb3VzZUluZGljYXRvclNpemUgPSAoKSA9PiB7XG5cdFx0XHRtb3VzZUluZGljYXRvclNpemUgPSBjbGFtcChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdzY3JlZW5jYXN0TW9kZS5tb3VzZUluZGljYXRvclNpemUnKSB8fCAyMCwgMjAsIDEwMCk7XG5cblx0XHRcdG1vdXNlTWFya2VyLnN0eWxlLmhlaWdodCA9IGAke21vdXNlSW5kaWNhdG9yU2l6ZX1weGA7XG5cdFx0XHRtb3VzZU1hcmtlci5zdHlsZS53aWR0aCA9IGAke21vdXNlSW5kaWNhdG9yU2l6ZX1weGA7XG5cdFx0fTtcblxuXHRcdHVwZGF0ZU1vdXNlSW5kaWNhdG9yQ29sb3IoKTtcblx0XHR1cGRhdGVNb3VzZUluZGljYXRvclNpemUoKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChvbk1vdXNlRG93bi5ldmVudChlID0+IHtcblx0XHRcdG1vdXNlTWFya2VyLnN0eWxlLnRvcCA9IGAke2UuY2xpZW50WSAtIG1vdXNlSW5kaWNhdG9yU2l6ZSAvIDJ9cHhgO1xuXHRcdFx0bW91c2VNYXJrZXIuc3R5bGUubGVmdCA9IGAke2UuY2xpZW50WCAtIG1vdXNlSW5kaWNhdG9yU2l6ZSAvIDJ9cHhgO1xuXHRcdFx0bW91c2VNYXJrZXIuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0XHRtb3VzZU1hcmtlci5zdHlsZS50cmFuc2Zvcm0gPSBgc2NhbGUoJHsxfSlgO1xuXHRcdFx0bW91c2VNYXJrZXIuc3R5bGUudHJhbnNpdGlvbiA9ICd0cmFuc2Zvcm0gMC4xcyc7XG5cblx0XHRcdGNvbnN0IG1vdXNlTW92ZUxpc3RlbmVyID0gb25Nb3VzZU1vdmUuZXZlbnQoZSA9PiB7XG5cdFx0XHRcdG1vdXNlTWFya2VyLnN0eWxlLnRvcCA9IGAke2UuY2xpZW50WSAtIG1vdXNlSW5kaWNhdG9yU2l6ZSAvIDJ9cHhgO1xuXHRcdFx0XHRtb3VzZU1hcmtlci5zdHlsZS5sZWZ0ID0gYCR7ZS5jbGllbnRYIC0gbW91c2VJbmRpY2F0b3JTaXplIC8gMn1weGA7XG5cdFx0XHRcdG1vdXNlTWFya2VyLnN0eWxlLnRyYW5zZm9ybSA9IGBzY2FsZSgkey44fSlgO1xuXHRcdFx0fSk7XG5cblx0XHRcdEV2ZW50Lm9uY2Uob25Nb3VzZVVwLmV2ZW50KSgoKSA9PiB7XG5cdFx0XHRcdG1vdXNlTWFya2VyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdG1vdXNlTW92ZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHVwZGF0ZUtleWJvYXJkRm9udFNpemUgPSAoKSA9PiB7XG5cdFx0XHRrZXlib2FyZE1hcmtlci5zdHlsZS5mb250U2l6ZSA9IGAke2NsYW1wKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ3NjcmVlbmNhc3RNb2RlLmZvbnRTaXplJykgfHwgNTYsIDIwLCAxMDApfXB4YDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdXBkYXRlS2V5Ym9hcmRNYXJrZXIgPSAoKSA9PiB7XG5cdFx0XHRrZXlib2FyZE1hcmtlci5zdHlsZS5ib3R0b20gPSBgJHtjbGFtcChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdzY3JlZW5jYXN0TW9kZS52ZXJ0aWNhbE9mZnNldCcpIHx8IDAsIDAsIDkwKX0lYDtcblx0XHR9O1xuXG5cdFx0bGV0IGtleWJvYXJkTWFya2VyVGltZW91dCE6IG51bWJlcjtcblx0XHRjb25zdCB1cGRhdGVLZXlib2FyZE1hcmtlclRpbWVvdXQgPSAoKSA9PiB7XG5cdFx0XHRrZXlib2FyZE1hcmtlclRpbWVvdXQgPSBjbGFtcChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdzY3JlZW5jYXN0TW9kZS5rZXlib2FyZE92ZXJsYXlUaW1lb3V0JykgfHwgODAwLCA1MDAsIDUwMDApO1xuXHRcdH07XG5cblx0XHR1cGRhdGVLZXlib2FyZEZvbnRTaXplKCk7XG5cdFx0dXBkYXRlS2V5Ym9hcmRNYXJrZXIoKTtcblx0XHR1cGRhdGVLZXlib2FyZE1hcmtlclRpbWVvdXQoKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2NyZWVuY2FzdE1vZGUudmVydGljYWxPZmZzZXQnKSkge1xuXHRcdFx0XHR1cGRhdGVLZXlib2FyZE1hcmtlcigpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2NyZWVuY2FzdE1vZGUuZm9udFNpemUnKSkge1xuXHRcdFx0XHR1cGRhdGVLZXlib2FyZEZvbnRTaXplKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY3JlZW5jYXN0TW9kZS5rZXlib2FyZE92ZXJsYXlUaW1lb3V0JykpIHtcblx0XHRcdFx0dXBkYXRlS2V5Ym9hcmRNYXJrZXJUaW1lb3V0KCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY3JlZW5jYXN0TW9kZS5tb3VzZUluZGljYXRvckNvbG9yJykpIHtcblx0XHRcdFx0dXBkYXRlTW91c2VJbmRpY2F0b3JDb2xvcigpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2NyZWVuY2FzdE1vZGUubW91c2VJbmRpY2F0b3JTaXplJykpIHtcblx0XHRcdFx0dXBkYXRlTW91c2VJbmRpY2F0b3JTaXplKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgb25LZXlEb3duID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPEtleWJvYXJkRXZlbnQ+KCkpO1xuXHRcdGNvbnN0IG9uQ29tcG9zaXRpb25TdGFydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxDb21wb3NpdGlvbkV2ZW50PigpKTtcblx0XHRjb25zdCBvbkNvbXBvc2l0aW9uVXBkYXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPENvbXBvc2l0aW9uRXZlbnQ+KCkpO1xuXHRcdGNvbnN0IG9uQ29tcG9zaXRpb25FbmQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8Q29tcG9zaXRpb25FdmVudD4oKSk7XG5cblx0XHRmdW5jdGlvbiByZWdpc3RlcldpbmRvd0xpc3RlbmVycyh3aW5kb3c6IFdpbmRvdywgd2luZG93RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdFx0Y29uc3QgbGlzdGVuZXJzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRsaXN0ZW5lcnMuYWRkKGxpc3RlbmVycy5hZGQobmV3IERvbUVtaXR0ZXIod2luZG93LCAna2V5ZG93bicsIHRydWUpKS5ldmVudChlID0+IG9uS2V5RG93bi5maXJlKGUpKSk7XG5cdFx0XHRsaXN0ZW5lcnMuYWRkKGxpc3RlbmVycy5hZGQobmV3IERvbUVtaXR0ZXIod2luZG93LCAnY29tcG9zaXRpb25zdGFydCcsIHRydWUpKS5ldmVudChlID0+IG9uQ29tcG9zaXRpb25TdGFydC5maXJlKGUpKSk7XG5cdFx0XHRsaXN0ZW5lcnMuYWRkKGxpc3RlbmVycy5hZGQobmV3IERvbUVtaXR0ZXIod2luZG93LCAnY29tcG9zaXRpb251cGRhdGUnLCB0cnVlKSkuZXZlbnQoZSA9PiBvbkNvbXBvc2l0aW9uVXBkYXRlLmZpcmUoZSkpKTtcblx0XHRcdGxpc3RlbmVycy5hZGQobGlzdGVuZXJzLmFkZChuZXcgRG9tRW1pdHRlcih3aW5kb3csICdjb21wb3NpdGlvbmVuZCcsIHRydWUpKS5ldmVudChlID0+IG9uQ29tcG9zaXRpb25FbmQuZmlyZShlKSkpO1xuXG5cdFx0XHR3aW5kb3dEaXNwb3NhYmxlcy5hZGQobGlzdGVuZXJzKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gd2luZG93RGlzcG9zYWJsZXMuZGVsZXRlKGxpc3RlbmVycykpKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxpc3RlbmVycyk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB7IHdpbmRvdywgZGlzcG9zYWJsZXMgfSBvZiBnZXRXaW5kb3dzKCkpIHtcblx0XHRcdHJlZ2lzdGVyV2luZG93TGlzdGVuZXJzKHdpbmRvdywgZGlzcG9zYWJsZXMpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVzLmFkZChvbkRpZFJlZ2lzdGVyV2luZG93KCh7IHdpbmRvdywgZGlzcG9zYWJsZXMgfSkgPT4gcmVnaXN0ZXJXaW5kb3dMaXN0ZW5lcnMod2luZG93LCBkaXNwb3NhYmxlcykpKTtcblxuXHRcdGxldCBsZW5ndGggPSAwO1xuXHRcdGxldCBjb21wb3Npbmc6IEVsZW1lbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGltZUJhY2tTcGFjZSA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgY2xlYXJLZXlib2FyZFNjaGVkdWxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRrZXlib2FyZE1hcmtlci50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0Y29tcG9zaW5nID0gdW5kZWZpbmVkO1xuXHRcdFx0bGVuZ3RoID0gMDtcblx0XHR9LCBrZXlib2FyZE1hcmtlclRpbWVvdXQpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChvbkNvbXBvc2l0aW9uU3RhcnQuZXZlbnQoZSA9PiB7XG5cdFx0XHRpbWVCYWNrU3BhY2UgPSB0cnVlO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChvbkNvbXBvc2l0aW9uVXBkYXRlLmV2ZW50KGUgPT4ge1xuXHRcdFx0aWYgKGUuZGF0YSAmJiBpbWVCYWNrU3BhY2UpIHtcblx0XHRcdFx0aWYgKGxlbmd0aCA+IDIwKSB7XG5cdFx0XHRcdFx0a2V5Ym9hcmRNYXJrZXIuaW5uZXJUZXh0ID0gJyc7XG5cdFx0XHRcdFx0bGVuZ3RoID0gMDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb21wb3NpbmcgPSBjb21wb3NpbmcgPz8gYXBwZW5kKGtleWJvYXJkTWFya2VyLCAkKCdzcGFuLmtleScpKTtcblx0XHRcdFx0Y29tcG9zaW5nLnRleHRDb250ZW50ID0gZS5kYXRhO1xuXHRcdFx0fSBlbHNlIGlmIChpbWVCYWNrU3BhY2UpIHtcblx0XHRcdFx0a2V5Ym9hcmRNYXJrZXIuaW5uZXJUZXh0ID0gJyc7XG5cdFx0XHRcdGFwcGVuZChrZXlib2FyZE1hcmtlciwgJCgnc3Bhbi5rZXknLCB7fSwgYEJhY2tzcGFjZWApKTtcblx0XHRcdH1cblx0XHRcdGNsZWFyS2V5Ym9hcmRTY2hlZHVsZXIuc2NoZWR1bGUoa2V5Ym9hcmRNYXJrZXJUaW1lb3V0KTtcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQob25Db21wb3NpdGlvbkVuZC5ldmVudChlID0+IHtcblx0XHRcdGNvbXBvc2luZyA9IHVuZGVmaW5lZDtcblx0XHRcdGxlbmd0aCsrO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChvbktleURvd24uZXZlbnQoZSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdQcm9jZXNzJyB8fCAvW1xcdWFjMDAtXFx1ZDc4N1xcdTMxMzEtXFx1MzE0ZVxcdTMxNGYtXFx1MzE2M1xcdTMwNDEtXFx1MzA5NFxcdTMwYTEtXFx1MzBmNFxcdTMwZmNcXHUzMDA1XFx1MzAwNlxcdTMwMjRcXHU0ZTAwLVxcdTlmYTVdL3UudGVzdChlLmtleSkpIHtcblx0XHRcdFx0aWYgKGUuY29kZSA9PT0gJ0JhY2tzcGFjZScpIHtcblx0XHRcdFx0XHRpbWVCYWNrU3BhY2UgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFlLmNvZGUuaW5jbHVkZXMoJ0tleScpKSB7XG5cdFx0XHRcdFx0Y29tcG9zaW5nID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGltZUJhY2tTcGFjZSA9IGZhbHNlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGltZUJhY2tTcGFjZSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2xlYXJLZXlib2FyZFNjaGVkdWxlci5zY2hlZHVsZShrZXlib2FyZE1hcmtlclRpbWVvdXQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmlzQ29tcG9zaW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTY3JlZW5jYXN0S2V5Ym9hcmRPcHRpb25zPignc2NyZWVuY2FzdE1vZGUua2V5Ym9hcmRPcHRpb25zJyk7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRjb25zdCBzaG9ydGN1dCA9IGtleWJpbmRpbmdTZXJ2aWNlLnNvZnREaXNwYXRjaChldmVudCwgZXZlbnQudGFyZ2V0KTtcblxuXHRcdFx0Ly8gSGlkZSB0aGUgc2luZ2xlIGFycm93IGtleSBwcmVzc2VkXG5cdFx0XHRpZiAoc2hvcnRjdXQua2luZCA9PT0gUmVzdWx0S2luZC5LYkZvdW5kICYmIHNob3J0Y3V0LmNvbW1hbmRJZCAmJiAhKG9wdGlvbnMuc2hvd1NpbmdsZUVkaXRvckN1cnNvck1vdmVzID8/IHRydWUpICYmIChcblx0XHRcdFx0WydjdXJzb3JMZWZ0JywgJ2N1cnNvclJpZ2h0JywgJ2N1cnNvclVwJywgJ2N1cnNvckRvd24nXS5pbmNsdWRlcyhzaG9ydGN1dC5jb21tYW5kSWQpKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKFxuXHRcdFx0XHRldmVudC5jdHJsS2V5IHx8IGV2ZW50LmFsdEtleSB8fCBldmVudC5tZXRhS2V5IHx8IGV2ZW50LnNoaWZ0S2V5XG5cdFx0XHRcdHx8IGxlbmd0aCA+IDIwXG5cdFx0XHRcdHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuQmFja3NwYWNlIHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRXNjYXBlXG5cdFx0XHRcdHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuVXBBcnJvdyB8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkRvd25BcnJvd1xuXHRcdFx0XHR8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkxlZnRBcnJvdyB8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlJpZ2h0QXJyb3dcblx0XHRcdCkge1xuXHRcdFx0XHRrZXlib2FyZE1hcmtlci5pbm5lclRleHQgPSAnJztcblx0XHRcdFx0bGVuZ3RoID0gMDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IGtleWJpbmRpbmdTZXJ2aWNlLnJlc29sdmVLZXlib2FyZEV2ZW50KGV2ZW50KTtcblx0XHRcdGNvbnN0IGNvbW1hbmREZXRhaWxzID0gKHRoaXMuX2lzS2JGb3VuZChzaG9ydGN1dCkgJiYgc2hvcnRjdXQuY29tbWFuZElkKSA/IHRoaXMuZ2V0Q29tbWFuZERldGFpbHMoc2hvcnRjdXQuY29tbWFuZElkKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0bGV0IGNvbW1hbmRBbmRHcm91cExhYmVsID0gY29tbWFuZERldGFpbHM/LnRpdGxlO1xuXHRcdFx0bGV0IGtleUxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsID0ga2V5YmluZGluZy5nZXRMYWJlbCgpO1xuXG5cdFx0XHRpZiAoY29tbWFuZERldGFpbHMpIHtcblx0XHRcdFx0aWYgKChvcHRpb25zLnNob3dDb21tYW5kR3JvdXBzID8/IGZhbHNlKSAmJiBjb21tYW5kRGV0YWlscy5jYXRlZ29yeSkge1xuXHRcdFx0XHRcdGNvbW1hbmRBbmRHcm91cExhYmVsID0gYCR7Y29tbWFuZERldGFpbHMuY2F0ZWdvcnl9OiAke2NvbW1hbmRBbmRHcm91cExhYmVsfSBgO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuX2lzS2JGb3VuZChzaG9ydGN1dCkgJiYgc2hvcnRjdXQuY29tbWFuZElkKSB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5YmluZGluZ3MgPSBrZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5ncyhzaG9ydGN1dC5jb21tYW5kSWQpXG5cdFx0XHRcdFx0XHQuZmlsdGVyKGsgPT4gay5nZXRMYWJlbCgpPy5lbmRzV2l0aChrZXlMYWJlbCA/PyAnJykpO1xuXG5cdFx0XHRcdFx0aWYgKGtleWJpbmRpbmdzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGtleUxhYmVsID0ga2V5YmluZGluZ3Nba2V5YmluZGluZ3MubGVuZ3RoIC0gMV0uZ2V0TGFiZWwoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKChvcHRpb25zLnNob3dDb21tYW5kcyA/PyB0cnVlKSAmJiBjb21tYW5kQW5kR3JvdXBMYWJlbCkge1xuXHRcdFx0XHRhcHBlbmQoa2V5Ym9hcmRNYXJrZXIsICQoJ3NwYW4udGl0bGUnLCB7fSwgYCR7Y29tbWFuZEFuZEdyb3VwTGFiZWx9IGApKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKChvcHRpb25zLnNob3dLZXlzID8/IHRydWUpIHx8ICgob3B0aW9ucy5zaG93S2V5YmluZGluZ3MgPz8gdHJ1ZSkgJiYgdGhpcy5faXNLYkZvdW5kKHNob3J0Y3V0KSkpIHtcblx0XHRcdFx0Ly8gRml4IGxhYmVsIGZvciBhcnJvdyBrZXlzXG5cdFx0XHRcdGtleUxhYmVsID0ga2V5TGFiZWw/LnJlcGxhY2UoJ1VwQXJyb3cnLCAnXHUyMTkxJylcblx0XHRcdFx0XHQ/LnJlcGxhY2UoJ0Rvd25BcnJvdycsICdcdTIxOTMnKVxuXHRcdFx0XHRcdD8ucmVwbGFjZSgnTGVmdEFycm93JywgJ1x1MjE5MCcpXG5cdFx0XHRcdFx0Py5yZXBsYWNlKCdSaWdodEFycm93JywgJ1x1MjE5MicpO1xuXG5cdFx0XHRcdGFwcGVuZChrZXlib2FyZE1hcmtlciwgJCgnc3Bhbi5rZXknLCB7fSwga2V5TGFiZWwgPz8gJycpKTtcblx0XHRcdH1cblxuXHRcdFx0bGVuZ3RoKys7XG5cdFx0XHRjbGVhcktleWJvYXJkU2NoZWR1bGVyLnNjaGVkdWxlKGtleWJvYXJkTWFya2VyVGltZW91dCk7XG5cdFx0fSkpO1xuXG5cdFx0VG9nZ2xlU2NyZWVuY2FzdE1vZGVBY3Rpb24uZGlzcG9zYWJsZSA9IGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNLYkZvdW5kKHJlc29sdXRpb25SZXN1bHQ6IFJlc29sdXRpb25SZXN1bHQpOiByZXNvbHV0aW9uUmVzdWx0IGlzIHsga2luZDogUmVzdWx0S2luZC5LYkZvdW5kOyBjb21tYW5kSWQ6IHN0cmluZyB8IG51bGw7IGNvbW1hbmRBcmdzOiB1bmtub3duOyBpc0J1YmJsZTogYm9vbGVhbiB9IHtcblx0XHRyZXR1cm4gcmVzb2x1dGlvblJlc3VsdC5raW5kID09PSBSZXN1bHRLaW5kLktiRm91bmQ7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbW1hbmREZXRhaWxzKGNvbW1hbmRJZDogc3RyaW5nKTogeyB0aXRsZTogc3RyaW5nOyBjYXRlZ29yeT86IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmcm9tTWVudVJlZ2lzdHJ5ID0gTWVudVJlZ2lzdHJ5LmdldENvbW1hbmQoY29tbWFuZElkKTtcblxuXHRcdGlmIChmcm9tTWVudVJlZ2lzdHJ5KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0aXRsZTogdHlwZW9mIGZyb21NZW51UmVnaXN0cnkudGl0bGUgPT09ICdzdHJpbmcnID8gZnJvbU1lbnVSZWdpc3RyeS50aXRsZSA6IGZyb21NZW51UmVnaXN0cnkudGl0bGUudmFsdWUsXG5cdFx0XHRcdGNhdGVnb3J5OiBmcm9tTWVudVJlZ2lzdHJ5LmNhdGVnb3J5ID8gKHR5cGVvZiBmcm9tTWVudVJlZ2lzdHJ5LmNhdGVnb3J5ID09PSAnc3RyaW5nJyA/IGZyb21NZW51UmVnaXN0cnkuY2F0ZWdvcnkgOiBmcm9tTWVudVJlZ2lzdHJ5LmNhdGVnb3J5LnZhbHVlKSA6IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBmcm9tQ29tbWFuZHNSZWdpc3RyeSA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChjb21tYW5kSWQpO1xuXG5cdFx0aWYgKGZyb21Db21tYW5kc1JlZ2lzdHJ5Py5tZXRhZGF0YT8uZGVzY3JpcHRpb24pIHtcblx0XHRcdHJldHVybiB7IHRpdGxlOiB0eXBlb2YgZnJvbUNvbW1hbmRzUmVnaXN0cnkubWV0YWRhdGEuZGVzY3JpcHRpb24gPT09ICdzdHJpbmcnID8gZnJvbUNvbW1hbmRzUmVnaXN0cnkubWV0YWRhdGEuZGVzY3JpcHRpb24gOiBmcm9tQ29tbWFuZHNSZWdpc3RyeS5tZXRhZGF0YS5kZXNjcmlwdGlvbi52YWx1ZSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuY2xhc3MgTG9nU3RvcmFnZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5sb2dTdG9yYWdlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoeyBrZXk6ICdsb2dTdG9yYWdlJywgY29tbWVudDogWydBIGRldmVsb3BlciBvbmx5IGFjdGlvbiB0byBsb2cgdGhlIGNvbnRlbnRzIG9mIHRoZSBzdG9yYWdlIGZvciB0aGUgY3VycmVudCB3aW5kb3cuJ10gfSwgXCJMb2cgU3RvcmFnZSBEYXRhYmFzZSBDb250ZW50c1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXG5cdFx0c3RvcmFnZVNlcnZpY2UubG9nKCk7XG5cblx0XHRkaWFsb2dTZXJ2aWNlLmluZm8obG9jYWxpemUoJ3N0b3JhZ2VMb2dEaWFsb2dNZXNzYWdlJywgXCJUaGUgc3RvcmFnZSBkYXRhYmFzZSBjb250ZW50cyBoYXZlIGJlZW4gbG9nZ2VkIHRvIHRoZSBkZXZlbG9wZXIgdG9vbHMuXCIpLCBsb2NhbGl6ZSgnc3RvcmFnZUxvZ0RpYWxvZ0RldGFpbHMnLCBcIk9wZW4gZGV2ZWxvcGVyIHRvb2xzIGZyb20gdGhlIG1lbnUgYW5kIHNlbGVjdCB0aGUgQ29uc29sZSB0YWIuXCIpKTtcblx0fVxufVxuXG5jbGFzcyBMb2dXb3JraW5nQ29waWVzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmxvZ1dvcmtpbmdDb3BpZXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMih7IGtleTogJ2xvZ1dvcmtpbmdDb3BpZXMnLCBjb21tZW50OiBbJ0EgZGV2ZWxvcGVyIG9ubHkgYWN0aW9uIHRvIGxvZyB0aGUgd29ya2luZyBjb3BpZXMgdGhhdCBleGlzdC4nXSB9LCBcIkxvZyBXb3JraW5nIENvcGllc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3JraW5nQ29weVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtpbmdDb3B5U2VydmljZSk7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IG91dHB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYmFja3VwcyA9IGF3YWl0IHdvcmtpbmdDb3B5QmFja3VwU2VydmljZS5nZXRCYWNrdXBzKCk7XG5cblx0XHRjb25zdCBtc2cgPSBbXG5cdFx0XHRgYCxcblx0XHRcdGBbV29ya2luZyBDb3BpZXNdYCxcblx0XHRcdC4uLih3b3JraW5nQ29weVNlcnZpY2Uud29ya2luZ0NvcGllcy5sZW5ndGggPiAwKSA/XG5cdFx0XHRcdHdvcmtpbmdDb3B5U2VydmljZS53b3JraW5nQ29waWVzLm1hcCh3b3JraW5nQ29weSA9PiBgJHt3b3JraW5nQ29weS5pc0RpcnR5KCkgPyAnXHUyNUNGICcgOiAnJ30ke3dvcmtpbmdDb3B5LnJlc291cmNlLnRvU3RyaW5nKHRydWUpfSAodHlwZUlkOiAke3dvcmtpbmdDb3B5LnR5cGVJZCB8fCAnPG5vIHR5cGVJZD4nfSlgKSA6XG5cdFx0XHRcdFsnPG5vbmU+J10sXG5cdFx0XHRgYCxcblx0XHRcdGBbQmFja3Vwc11gLFxuXHRcdFx0Li4uKGJhY2t1cHMubGVuZ3RoID4gMCkgP1xuXHRcdFx0XHRiYWNrdXBzLm1hcChiYWNrdXAgPT4gYCR7YmFja3VwLnJlc291cmNlLnRvU3RyaW5nKHRydWUpfSAodHlwZUlkOiAke2JhY2t1cC50eXBlSWQgfHwgJzxubyB0eXBlSWQ+J30pYCkgOlxuXHRcdFx0XHRbJzxub25lPiddLFxuXHRcdF07XG5cblx0XHRsb2dTZXJ2aWNlLmluZm8obXNnLmpvaW4oJ1xcbicpKTtcblxuXHRcdG91dHB1dFNlcnZpY2Uuc2hvd0NoYW5uZWwod2luZG93TG9nSWQsIHRydWUpO1xuXHR9XG59XG5cbmNsYXNzIFJlbW92ZUxhcmdlU3RvcmFnZUVudHJpZXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRwcml2YXRlIHN0YXRpYyBTSVpFX1RIUkVTSE9MRCA9IDEwMjQgKiAxNjsgLy8gMTZrYlxuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5yZW1vdmVMYXJnZVN0b3JhZ2VEYXRhYmFzZUVudHJpZXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVtb3ZlTGFyZ2VTdG9yYWdlRGF0YWJhc2VFbnRyaWVzJywgJ1JlbW92ZSBMYXJnZSBTdG9yYWdlIERhdGFiYXNlIEVudHJpZXMuLi4nKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdFx0aW50ZXJmYWNlIElTdG9yYWdlSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0XHRcdHJlYWRvbmx5IGtleTogc3RyaW5nO1xuXHRcdFx0cmVhZG9ubHkgc2NvcGU6IFN0b3JhZ2VTY29wZTtcblx0XHRcdHJlYWRvbmx5IHRhcmdldDogU3RvcmFnZVRhcmdldDtcblx0XHRcdHJlYWRvbmx5IHNpemU6IG51bWJlcjtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtczogSVN0b3JhZ2VJdGVtW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3Qgc2NvcGUgb2YgW1N0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0VdKSB7XG5cdFx0XHRpZiAoc2NvcGUgPT09IFN0b3JhZ2VTY29wZS5QUk9GSUxFICYmIHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBhdm9pZCBkdXBsaWNhdGVzXG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgdGFyZ2V0IG9mIFtTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIFN0b3JhZ2VUYXJnZXQuVVNFUl0pIHtcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2Ygc3RvcmFnZVNlcnZpY2Uua2V5cyhzY29wZSwgdGFyZ2V0KSkge1xuXHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gc3RvcmFnZVNlcnZpY2UuZ2V0KGtleSwgc2NvcGUpO1xuXHRcdFx0XHRcdGlmICh2YWx1ZSAmJiAoIWVudmlyb25tZW50U2VydmljZS5pc0J1aWx0IC8qIHNob3cgYWxsIGtleXMgaW4gZGV2ICovIHx8IHZhbHVlLmxlbmd0aCA+IFJlbW92ZUxhcmdlU3RvcmFnZUVudHJpZXNBY3Rpb24uU0laRV9USFJFU0hPTEQpKSB7XG5cdFx0XHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0a2V5LFxuXHRcdFx0XHRcdFx0XHRzY29wZSxcblx0XHRcdFx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHRcdFx0XHRzaXplOiB2YWx1ZS5sZW5ndGgsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBrZXksXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBCeXRlU2l6ZS5mb3JtYXRTaXplKHZhbHVlLmxlbmd0aCksXG5cdFx0XHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2xhcmdlU3RvcmFnZUl0ZW1EZXRhaWwnLCBcIlNjb3BlOiB7MH0sIFRhcmdldDogezF9XCIsIHNjb3BlID09PSBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04gPyBsb2NhbGl6ZSgnZ2xvYmFsJywgXCJHbG9iYWxcIikgOiBzY29wZSA9PT0gU3RvcmFnZVNjb3BlLlBST0ZJTEUgPyBsb2NhbGl6ZSgncHJvZmlsZScsIFwiUHJvZmlsZVwiKSA6IGxvY2FsaXplKCd3b3Jrc3BhY2UnLCBcIldvcmtzcGFjZVwiKSwgdGFyZ2V0ID09PSBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUgPyBsb2NhbGl6ZSgnbWFjaGluZScsIFwiTWFjaGluZVwiKSA6IGxvY2FsaXplKCd1c2VyJywgXCJVc2VyXCIpKSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGl0ZW1zLnNvcnQoKGl0ZW1BLCBpdGVtQikgPT4gaXRlbUIuc2l6ZSAtIGl0ZW1BLnNpemUpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtcyA9IGF3YWl0IG5ldyBQcm9taXNlPHJlYWRvbmx5IElTdG9yYWdlSXRlbVtdPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRjb25zdCBwaWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElTdG9yYWdlSXRlbT4oKSk7XG5cdFx0XHRwaWNrZXIuaXRlbXMgPSBpdGVtcztcblx0XHRcdHBpY2tlci5jYW5TZWxlY3RNYW55ID0gdHJ1ZTtcblx0XHRcdHBpY2tlci5vayA9IGZhbHNlO1xuXHRcdFx0cGlja2VyLmN1c3RvbUJ1dHRvbiA9IHRydWU7XG5cdFx0XHRwaWNrZXIuaGlkZUNoZWNrQWxsID0gdHJ1ZTtcblx0XHRcdHBpY2tlci5jdXN0b21MYWJlbCA9IGxvY2FsaXplKCdyZW1vdmVMYXJnZVN0b3JhZ2VFbnRyaWVzUGlja2VyQnV0dG9uJywgXCJSZW1vdmVcIik7XG5cdFx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgncmVtb3ZlTGFyZ2VTdG9yYWdlRW50cmllc1BpY2tlclBsYWNlaG9sZGVyJywgXCJTZWxlY3QgbGFyZ2UgZW50cmllcyB0byByZW1vdmUgZnJvbSBzdG9yYWdlXCIpO1xuXG5cdFx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHBpY2tlci5kZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdyZW1vdmVMYXJnZVN0b3JhZ2VFbnRyaWVzUGlja2VyRGVzY3JpcHRpb25Ob0VudHJpZXMnLCBcIlRoZXJlIGFyZSBubyBsYXJnZSBzdG9yYWdlIGVudHJpZXMgdG8gcmVtb3ZlLlwiKTtcblx0XHRcdH1cblxuXHRcdFx0cGlja2VyLnNob3coKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEN1c3RvbSgoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUocGlja2VyLnNlbGVjdGVkSXRlbXMpO1xuXHRcdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkSGlkZSgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpKTtcblx0XHR9KTtcblxuXHRcdGlmIChzZWxlY3RlZEl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3JlbW92ZUxhcmdlU3RvcmFnZUVudHJpZXNDb25maXJtUmVtb3ZlJywgXCJEbyB5b3Ugd2FudCB0byByZW1vdmUgdGhlIHNlbGVjdGVkIHN0b3JhZ2UgZW50cmllcyBmcm9tIHRoZSBkYXRhYmFzZT9cIiksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdyZW1vdmVMYXJnZVN0b3JhZ2VFbnRyaWVzQ29uZmlybVJlbW92ZURldGFpbCcsIFwiezB9XFxuXFxuVGhpcyBhY3Rpb24gaXMgaXJyZXZlcnNpYmxlIGFuZCBtYXkgcmVzdWx0IGluIGRhdGEgbG9zcyFcIiwgc2VsZWN0ZWRJdGVtcy5tYXAoaXRlbSA9PiBpdGVtLmxhYmVsKS5qb2luKCdcXG4nKSksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ3JlbW92ZUxhcmdlU3RvcmFnZUVudHJpZXNCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlbW92ZVwiKVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzY29wZXNUb09wdGltaXplID0gbmV3IFNldDxTdG9yYWdlU2NvcGU+KCk7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHNlbGVjdGVkSXRlbXMpIHtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShpdGVtLmtleSwgaXRlbS5zY29wZSk7XG5cdFx0XHRzY29wZXNUb09wdGltaXplLmFkZChpdGVtLnNjb3BlKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNjb3BlIG9mIHNjb3Blc1RvT3B0aW1pemUpIHtcblx0XHRcdGF3YWl0IHN0b3JhZ2VTZXJ2aWNlLm9wdGltaXplKHNjb3BlKTtcblx0XHR9XG5cdH1cbn1cblxubGV0IHRyYWNrZXI6IERpc3Bvc2FibGVUcmFja2VyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xubGV0IHRyYWNrZWREaXNwb3NhYmxlcyA9IG5ldyBTZXQ8SURpc3Bvc2FibGU+KCk7XG5cbmNvbnN0IERpc3Bvc2FibGVzU25hcHNob3RTdGF0ZUNvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTwnc3RhcnRlZCcgfCAncGVuZGluZycgfCAnc3RvcHBlZCc+KCdkaXJ0eVdvcmtpbmdDb3BpZXMnLCAnc3RvcHBlZCcpO1xuXG5jbGFzcyBTdGFydFRyYWNrRGlzcG9zYWJsZXMgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc3RhcnRUcmFja0Rpc3Bvc2FibGVzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3N0YXJ0VHJhY2tEaXNwb3NhYmxlcycsICdTdGFydCBUcmFja2luZyBEaXNwb3NhYmxlcycpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChEaXNwb3NhYmxlc1NuYXBzaG90U3RhdGVDb250ZXh0LmlzRXF1YWxUbygncGVuZGluZycpLm5lZ2F0ZSgpLCBEaXNwb3NhYmxlc1NuYXBzaG90U3RhdGVDb250ZXh0LmlzRXF1YWxUbygnc3RhcnRlZCcpLm5lZ2F0ZSgpKVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXNTbmFwc2hvdFN0YXRlQ29udGV4dCA9IERpc3Bvc2FibGVzU25hcHNob3RTdGF0ZUNvbnRleHQuYmluZFRvKGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRkaXNwb3NhYmxlc1NuYXBzaG90U3RhdGVDb250ZXh0LnNldCgnc3RhcnRlZCcpO1xuXG5cdFx0dHJhY2tlZERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHR0cmFja2VyID0gbmV3IERpc3Bvc2FibGVUcmFja2VyKCk7XG5cdFx0c2V0RGlzcG9zYWJsZVRyYWNrZXIodHJhY2tlcik7XG5cdH1cbn1cblxuY2xhc3MgU25hcHNob3RUcmFja2VkRGlzcG9zYWJsZXMgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc25hcHNob3RUcmFja2VkRGlzcG9zYWJsZXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc25hcHNob3RUcmFja2VkRGlzcG9zYWJsZXMnLCAnU25hcHNob3QgVHJhY2tlZCBEaXNwb3NhYmxlcycpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IERpc3Bvc2FibGVzU25hcHNob3RTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCdzdGFydGVkJylcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzU25hcHNob3RTdGF0ZUNvbnRleHQgPSBEaXNwb3NhYmxlc1NuYXBzaG90U3RhdGVDb250ZXh0LmJpbmRUbyhhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0ZGlzcG9zYWJsZXNTbmFwc2hvdFN0YXRlQ29udGV4dC5zZXQoJ3BlbmRpbmcnKTtcblxuXHRcdHRyYWNrZWREaXNwb3NhYmxlcyA9IG5ldyBTZXQodHJhY2tlcj8uY29tcHV0ZUxlYWtpbmdEaXNwb3NhYmxlcygxMDAwKT8ubGVha3MubWFwKGRpc3Bvc2FibGUgPT4gZGlzcG9zYWJsZS52YWx1ZSkpO1xuXHR9XG59XG5cbmNsYXNzIFN0b3BUcmFja0Rpc3Bvc2FibGVzIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnN0b3BUcmFja0Rpc3Bvc2FibGVzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3N0b3BUcmFja0Rpc3Bvc2FibGVzJywgJ1N0b3AgVHJhY2tpbmcgRGlzcG9zYWJsZXMnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBEaXNwb3NhYmxlc1NuYXBzaG90U3RhdGVDb250ZXh0LmlzRXF1YWxUbygncGVuZGluZycpXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzU25hcHNob3RTdGF0ZUNvbnRleHQgPSBEaXNwb3NhYmxlc1NuYXBzaG90U3RhdGVDb250ZXh0LmJpbmRUbyhhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0ZGlzcG9zYWJsZXNTbmFwc2hvdFN0YXRlQ29udGV4dC5zZXQoJ3N0b3BwZWQnKTtcblxuXHRcdGlmICh0cmFja2VyKSB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlTGVha3MgPSBuZXcgU2V0PERpc3Bvc2FibGVJbmZvPigpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGRpc3Bvc2FibGUgb2YgbmV3IFNldCh0cmFja2VyLmNvbXB1dGVMZWFraW5nRGlzcG9zYWJsZXMoMTAwMCk/LmxlYWtzKSA/PyBbXSkge1xuXHRcdFx0XHRpZiAodHJhY2tlZERpc3Bvc2FibGVzLmhhcyhkaXNwb3NhYmxlLnZhbHVlKSkge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVMZWFrcy5hZGQoZGlzcG9zYWJsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGVha3MgPSB0cmFja2VyLmNvbXB1dGVMZWFraW5nRGlzcG9zYWJsZXMoMTAwMCwgQXJyYXkuZnJvbShkaXNwb3NhYmxlTGVha3MpKTtcblx0XHRcdGlmIChsZWFrcykge1xuXHRcdFx0XHRlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdW5kZWZpbmVkLCBjb250ZW50czogbGVha3MuZGV0YWlscyB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzZXREaXNwb3NhYmxlVHJhY2tlcihudWxsKTtcblx0XHR0cmFja2VyID0gdW5kZWZpbmVkO1xuXHRcdHRyYWNrZWREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG59XG5cbi8qKiBIdW1hbi1yZWFkYWJsZSBsYWJlbCBmb3IgYSBtYW5hZ2VkLXNldHRpbmdzIHtAbGluayBNYW5hZ2VkU2V0dGluZ3NTb3VyY2V9IGluIHRoZSBkaWFnbm9zdGljcyByZXBvcnQuICovXG5mdW5jdGlvbiBtYW5hZ2VkU2V0dGluZ3NTb3VyY2VMYWJlbChzb3VyY2U6IE1hbmFnZWRTZXR0aW5nc1NvdXJjZSk6IHN0cmluZyB7XG5cdHN3aXRjaCAoc291cmNlKSB7XG5cdFx0Y2FzZSAnc2VydmVyJzogcmV0dXJuICdHaXRIdWIgU2VydmVyIEFQSSc7XG5cdFx0Y2FzZSAnbmF0aXZlTWRtJzogcmV0dXJuICdOYXRpdmUgTURNJztcblx0XHRjYXNlICdmaWxlJzogcmV0dXJuICdGaWxlIChtYW5hZ2VkLXNldHRpbmdzLmpzb24pJztcblx0XHRjYXNlICdub25lJzogcmV0dXJuICdOb25lIChubyBtYW5hZ2VkIHNldHRpbmdzIGFjdGl2ZSknO1xuXHR9XG59XG5cbi8qKiBDb21wYWN0IGxhYmVsIGZvciB0aGUgXCJQb2xpY3kgU291cmNlXCIgY29sdW1uLCB3aGVyZSB0aGUgYWRqYWNlbnQgXCJNYW5hZ2VkIFNldHRpbmdzXCIgY29sdW1uIGFscmVhZHkgbGlzdHMgdGhlIGtleS4gKi9cbmZ1bmN0aW9uIG1hbmFnZWRTZXR0aW5nc1NvdXJjZVNob3J0TGFiZWwoc291cmNlOiBNYW5hZ2VkU2V0dGluZ3NTb3VyY2UpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKHNvdXJjZSkge1xuXHRcdGNhc2UgJ3NlcnZlcic6IHJldHVybiAnU2VydmVyJztcblx0XHRjYXNlICduYXRpdmVNZG0nOiByZXR1cm4gJ05hdGl2ZSBNRE0nO1xuXHRcdGNhc2UgJ2ZpbGUnOiByZXR1cm4gJ0ZpbGUnO1xuXHRcdGNhc2UgJ25vbmUnOiByZXR1cm4gJ05vbmUnO1xuXHR9XG59XG5cbi8qKiBSZW5kZXIgYSB2YWx1ZSBhcyBhIGZlbmNlZCBKU09OIGNvZGUgYmxvY2sgZm9yIHRoZSBkaWFnbm9zdGljcyByZXBvcnQuICovXG5mdW5jdGlvbiBqc29uQmxvY2sodmFsdWU6IHVua25vd24pOiBzdHJpbmcge1xuXHRyZXR1cm4gJ2BgYGpzb25cXG4nICsgSlNPTi5zdHJpbmdpZnkodmFsdWUgPz8ge30sIG51bGwsIDIpICsgJ1xcbmBgYFxcblxcbic7XG59XG5cbmZ1bmN0aW9uIG1hbmFnZWRTZXR0aW5nc1BpcGVsaW5lKHJhd0xhYmVsOiBzdHJpbmcsIHJhdzogdW5rbm93biB8IHVuZGVmaW5lZCwgbm9ybWFsaXplZDogTWFuYWdlZFNldHRpbmdzRGF0YSwgcHJvamVjdGVkOiBNYW5hZ2VkU2V0dGluZ3NEYXRhLCByYXdVbmF2YWlsYWJsZU1lc3NhZ2U/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgY29udGVudCA9IGAqKiR7cmF3TGFiZWx9KipcXG5cXG5gO1xuXHRjb250ZW50ICs9IHJhdyA9PT0gdW5kZWZpbmVkID8gYCoke3Jhd1VuYXZhaWxhYmxlTWVzc2FnZSA/PyAnVW5hdmFpbGFibGUnfSpcXG5cXG5gIDoganNvbkJsb2NrKHJhdyk7XG5cdGNvbnRlbnQgKz0gJyoqTm9ybWFsaXplZCBiYWcqKlxcblxcbic7XG5cdGNvbnRlbnQgKz0ganNvbkJsb2NrKG5vcm1hbGl6ZWQpO1xuXHRjb250ZW50ICs9ICcqKlZTIENvZGUgcG9saWN5IHByb2plY3Rpb24qKlxcblxcbic7XG5cdGNvbnRlbnQgKz0ganNvbkJsb2NrKHByb2plY3RlZCk7XG5cdHJldHVybiBjb250ZW50O1xufVxuXG4vKiogUmVuZGVyIGEgbWFuYWdlZC1zZXR0aW5ncyB2YWx1ZSBmb3IgYSBNYXJrZG93biB0YWJsZSBjZWxsOiBjb21wYWN0IEpTT04gd2l0aCBwaXBlcyBlc2NhcGVkLCBvciBhIGRhc2ggd2hlbiBhYnNlbnQuICovXG5mdW5jdGlvbiBtYW5hZ2VkVmFsdWVDZWxsKHZhbHVlOiBNYW5hZ2VkU2V0dGluZ1ZhbHVlIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gJ1x1MjAxNCc7XG5cdH1cblx0cmV0dXJuIGBcXGAke0pTT04uc3RyaW5naWZ5KHZhbHVlKS5yZXBsYWNlKC9cXHwvZywgJ1xcXFx8Jyl9XFxgYDtcbn1cblxuLyoqIEhlYWRlciByb3cgKyBzZXBhcmF0b3IgZm9yIHRoZSByZXBvcnQncyB0d28tY29sdW1uIGBQcm9wZXJ0eSB8IFZhbHVlYCB0YWJsZXMuICovXG5jb25zdCBQUk9QRVJUWV9WQUxVRV9UQUJMRV9IRUFERVIgPSAnfCBQcm9wZXJ0eSB8IFZhbHVlIHxcXG58LS0tLS0tLS0tLXwtLS0tLS0tfFxcbic7XG5cbmNsYXNzIFBvbGljeURpYWdub3N0aWNzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnNob3dQb2xpY3lEaWFnbm9zdGljcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdwb2xpY3lEaWFnbm9zdGljcycsICdQb2xpY3kgRGlhZ25vc3RpY3MnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcm9kdWN0U2VydmljZSk7XG5cdFx0Y29uc3QgZGVmYXVsdEFjY291bnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWZhdWx0QWNjb3VudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQXV0aGVudGljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSk7XG5cdFx0Y29uc3QgcG9saWN5U2VydmljZSA9IGFjY2Vzc29yLmdldChJUG9saWN5U2VydmljZSk7XG5cdFx0Y29uc3QgYWNjb3VudFBvbGljeUdhdGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBY2NvdW50UG9saWN5R2F0ZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGFnZW50SG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFnZW50SG9zdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSk7XG5cdFx0Ly8gTmF0aXZlIE1ETSBpcyBhIGRlc2t0b3Atb25seSBjaGFubmVsLCByZWdpc3RlcmVkIGluIHRoZSByZW5kZXJlciBzZXJ2aWNlIGNvbGxlY3Rpb24gb25cblx0XHQvLyBkZXNrdG9wIGFuZCBBZ2VudHMgd2luZG93cyBidXQgYWJzZW50IGluIHdlYi4gUmVzb2x2ZSBpdCBub3csIHN5bmNocm9ub3VzbHksIGJlY2F1c2UgdGhlXG5cdFx0Ly8gYWNjZXNzb3IgaXMgb25seSB2YWxpZCBiZWZvcmUgdGhlIGZpcnN0IGBhd2FpdGAgYmVsb3cuXG5cdFx0bGV0IG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2U6IElOYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRuYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIG5vIG5hdGl2ZSBNRE0gY2hhbm5lbCBpbiB0aGlzIHdpbmRvdyAoZS5nLiB3ZWIpXG5cdFx0fVxuXHRcdC8vIEZpbGUtYmFzZWQgbWFuYWdlZCBzZXR0aW5ncyBpcyBsaWtld2lzZSBhIGRlc2t0b3Atb25seSBjaGFubmVsIHJlZ2lzdGVyZWQgaW4gdGhlIHJlbmRlcmVyXG5cdFx0Ly8gc2VydmljZSBjb2xsZWN0aW9uIG9uIGRlc2t0b3AgYW5kIEFnZW50cyB3aW5kb3dzLCBhYnNlbnQgaW4gd2ViLlxuXHRcdGxldCBmaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZTogSUZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRmaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gbm8gZmlsZSBjaGFubmVsIGluIHRoaXMgd2luZG93IChlLmcuIHdlYilcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblxuXHRcdGxldCBjb250ZW50ID0gJyMgVlMgQ29kZSBQb2xpY3kgRGlhZ25vc3RpY3NcXG5cXG4nO1xuXHRcdGNvbnRlbnQgKz0gJypXQVJOSU5HOiBUaGlzIGZpbGUgbWF5IGNvbnRhaW4gc2Vuc2l0aXZlIGluZm9ybWF0aW9uLipcXG5cXG4nO1xuXHRcdGNvbnRlbnQgKz0gJyMjIFN5c3RlbSBJbmZvcm1hdGlvblxcblxcbic7XG5cdFx0Y29udGVudCArPSBQUk9QRVJUWV9WQUxVRV9UQUJMRV9IRUFERVI7XG5cdFx0Y29udGVudCArPSBgfCBHZW5lcmF0ZWQgfCAke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKX0gfFxcbmA7XG5cdFx0Y29udGVudCArPSBgfCBQcm9kdWN0IHwgJHtwcm9kdWN0U2VydmljZS5uYW1lTG9uZ30gJHtwcm9kdWN0U2VydmljZS52ZXJzaW9ufSB8XFxuYDtcblx0XHRjb250ZW50ICs9IGB8IENvbW1pdCB8ICR7cHJvZHVjdFNlcnZpY2UuY29tbWl0IHx8ICduL2EnfSB8XFxuXFxuYDtcblxuXHRcdC8vIEFjY291bnQgaW5mb3JtYXRpb25cblx0XHRjb250ZW50ICs9ICcjIyBBY2NvdW50IEluZm9ybWF0aW9uXFxuXFxuJztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWNjb3VudCA9IGF3YWl0IGRlZmF1bHRBY2NvdW50U2VydmljZS5nZXREZWZhdWx0QWNjb3VudCgpO1xuXHRcdFx0Y29uc3Qgc2Vuc2l0aXZlS2V5cyA9IFsnc2Vzc2lvbklkJywgJ2FuYWx5dGljc190cmFja2luZ19pZCddO1xuXHRcdFx0aWYgKGFjY291bnQpIHtcblx0XHRcdFx0Ly8gVHJ5IHRvIGdldCB1c2VybmFtZS9kaXNwbGF5IGluZm8gZnJvbSB0aGUgYXV0aGVudGljYXRpb24gc2Vzc2lvblxuXHRcdFx0XHRsZXQgdXNlcm5hbWUgPSAnVW5rbm93bic7XG5cdFx0XHRcdGxldCBhY2NvdW50TGFiZWwgPSAnVW5rbm93bic7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJvdmlkZXJJZHMgPSBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXJJZHMoKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVySWQgb2YgcHJvdmlkZXJJZHMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKHByb3ZpZGVySWQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbWF0Y2hpbmdTZXNzaW9uID0gc2Vzc2lvbnMuZmluZChzZXNzaW9uID0+IHNlc3Npb24uaWQgPT09IGFjY291bnQuc2Vzc2lvbklkKTtcblx0XHRcdFx0XHRcdGlmIChtYXRjaGluZ1Nlc3Npb24pIHtcblx0XHRcdFx0XHRcdFx0dXNlcm5hbWUgPSBtYXRjaGluZ1Nlc3Npb24uYWNjb3VudC5pZDtcblx0XHRcdFx0XHRcdFx0YWNjb3VudExhYmVsID0gbWF0Y2hpbmdTZXNzaW9uLmFjY291bnQubGFiZWw7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHQvLyBGYWxsYmFjayB0byBqdXN0IHNlc3Npb24gaW5mb1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29udGVudCArPSAnIyMjIERlZmF1bHQgQWNjb3VudCBTdW1tYXJ5XFxuXFxuJztcblx0XHRcdFx0Y29udGVudCArPSBgKipBY2NvdW50IElEL1VzZXJuYW1lKio6ICR7dXNlcm5hbWV9XFxuXFxuYDtcblx0XHRcdFx0Y29udGVudCArPSBgKipBY2NvdW50IExhYmVsKio6ICR7YWNjb3VudExhYmVsfVxcblxcbmA7XG5cblx0XHRcdFx0Y29udGVudCArPSAnIyMjIERldGFpbGVkIEFjY291bnQgUHJvcGVydGllc1xcblxcbic7XG5cdFx0XHRcdGNvbnRlbnQgKz0gUFJPUEVSVFlfVkFMVUVfVEFCTEVfSEVBREVSO1xuXG5cdFx0XHRcdC8vIEl0ZXJhdGUgdGhyb3VnaCBhbGwgcHJvcGVydGllcyBvZiB0aGUgYWNjb3VudCBvYmplY3Rcblx0XHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoYWNjb3VudCkpIHtcblx0XHRcdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0bGV0IGRpc3BsYXlWYWx1ZTogc3RyaW5nO1xuXG5cdFx0XHRcdFx0XHQvLyBNYXNrIHNlbnNpdGl2ZSBpbmZvcm1hdGlvblxuXHRcdFx0XHRcdFx0aWYgKHNlbnNpdGl2ZUtleXMuaW5jbHVkZXMoa2V5KSkge1xuXHRcdFx0XHRcdFx0XHRkaXNwbGF5VmFsdWUgPSAnKioqJztcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdFx0XHRkaXNwbGF5VmFsdWUgPSBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRkaXNwbGF5VmFsdWUgPSBTdHJpbmcodmFsdWUpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb250ZW50ICs9IGB8ICR7a2V5fSB8ICR7ZGlzcGxheVZhbHVlfSB8XFxuYDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcG9saWN5RGF0YSA9IGRlZmF1bHRBY2NvdW50U2VydmljZS5wb2xpY3lEYXRhO1xuXHRcdFx0XHRjb250ZW50ICs9IGB8IHBvbGljeURhdGEgfCAke3BvbGljeURhdGEgPyBKU09OLnN0cmluZ2lmeShwb2xpY3lEYXRhKSA6ICdObyBQb2xpY3kgRGF0YSd9IHxcXG5gO1xuXHRcdFx0XHRjb250ZW50ICs9ICdcXG4nO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udGVudCArPSAnKk5vIGRlZmF1bHQgYWNjb3VudCBjb25maWd1cmVkKlxcblxcbic7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnRlbnQgKz0gYCpFcnJvciByZXRyaWV2aW5nIGFjY291bnQgaW5mb3JtYXRpb246ICR7ZXJyb3J9KlxcblxcbmA7XG5cdFx0fVxuXG5cdFx0Ly8gQWNjb3VudCBQb2xpY3kgR2F0ZSAoZm9yY2VzIEFJIGZlYXR1cmVzIG9mZiB1bnRpbCBhbiBhZG1pbi1hcHByb3ZlZFxuXHRcdC8vIEdpdEh1YiBhY2NvdW50IGlzIHNpZ25lZCBpbiBBTkQgaXRzIGFjY291bnQtc2lkZSBwb2xpY3kgZGF0YSBoYXMgcmVzb2x2ZWQpLlxuXHRcdGNvbnRlbnQgKz0gJyMjIEFjY291bnQgUG9saWN5IEdhdGVcXG5cXG4nO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBnYXRlSW5mbyA9IGFjY291bnRQb2xpY3lHYXRlU2VydmljZS5nYXRlSW5mbztcblx0XHRcdGNvbnN0IGFwcHJvdmVkT3Jnc1JhdyA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoQVBQUk9WRURfQUNDT1VOVF9PUkdBTklaQVRJT05TX1BPTElDWV9OQU1FKTtcblx0XHRcdGNvbnRlbnQgKz0gUFJPUEVSVFlfVkFMVUVfVEFCTEVfSEVBREVSO1xuXHRcdFx0Y29udGVudCArPSBgfCBTdGF0ZSB8IFxcYCR7Z2F0ZUluZm8uc3RhdGV9XFxgIHxcXG5gO1xuXHRcdFx0Y29udGVudCArPSBgfCBSZWFzb24gfCAke2dhdGVJbmZvLnJlYXNvbiA/IGBcXGAke2dhdGVJbmZvLnJlYXNvbn1cXGBgIDogJypuL2EqJ30gfFxcbmA7XG5cdFx0XHRjb250ZW50ICs9IGB8ICR7QVBQUk9WRURfQUNDT1VOVF9PUkdBTklaQVRJT05TX1BPTElDWV9OQU1FfSB8ICR7YXBwcm92ZWRPcmdzUmF3ICE9PSB1bmRlZmluZWQgPyBgXFxgJHtTdHJpbmcoYXBwcm92ZWRPcmdzUmF3KX1cXGBgIDogJypub3Qgc2V0Kid9IHxcXG5gO1xuXHRcdFx0Y29udGVudCArPSAnXFxuJztcblx0XHRcdGNvbnRlbnQgKz0gJyoqTGVnZW5kKipcXG5cXG4nO1xuXHRcdFx0Y29udGVudCArPSAnLSBgaW5hY3RpdmVgOiBnYXRlIGRpc2FibGVkIChubyBhcHByb3ZlZCBvcmdzIGNvbmZpZ3VyZWQpIFx1MjAxNCBwb2xpY2llcyBiZWhhdmUgYXMgYWNjb3VudCBkYXRhIGRpY3RhdGVzLlxcbic7XG5cdFx0XHRjb250ZW50ICs9ICctIGBzYXRpc2ZpZWRgOiBnYXRlIGFjdGl2ZSBhbmQgYXBwcm92ZWQgXHUyMDE0IGFjY291bnQgcG9saWN5IHZhbHVlcyBmbG93IG5vcm1hbGx5Llxcbic7XG5cdFx0XHRjb250ZW50ICs9ICctIGByZXN0cmljdGVkYDogZ2F0ZSBhY3RpdmUgYW5kIG5vdCBzYXRpc2ZpZWQgXHUyMDE0IG9wdGVkLWluIHBvbGljaWVzIGZvcmNlZCB0byB0aGVpciByZXN0cmljdGVkIHZhbHVlLlxcbic7XG5cdFx0XHRjb250ZW50ICs9ICcgIC0gYG5vQWNjb3VudGA6IG5vIGRlZmF1bHQgYWNjb3VudCBzaWduZWQgaW4uXFxuJztcblx0XHRcdGNvbnRlbnQgKz0gJyAgLSBgd3JvbmdQcm92aWRlcmA6IHNpZ25lZCBpbiB3aXRoIGEgbm9uLUdpdEh1YiBwcm92aWRlci5cXG4nO1xuXHRcdFx0Y29udGVudCArPSAnICAtIGBvcmdOb3RBcHByb3ZlZGA6IHNpZ25lZCBpbiBidXQgYWNjb3VudCBpcyBub3QgYSBtZW1iZXIgb2YgYW55IGFwcHJvdmVkIG9yZ2FuaXphdGlvbi5cXG4nO1xuXHRcdFx0Y29udGVudCArPSAnICAtIGBwb2xpY3lOb3RSZXNvbHZlZGA6IHNpZ25lZCBpbiB0byBhbiBhcHByb3ZlZCBvcmcgYnV0IGFjY291bnQtc2lkZSBwb2xpY3kgZGF0YSBoYXMgbm90IHlldCBiZWVuIGZldGNoZWQuXFxuXFxuJztcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29udGVudCArPSBgKkVycm9yIHJldHJpZXZpbmcgYWNjb3VudCBwb2xpY3kgZ2F0ZSBpbmZvOiAke2Vycm9yfSpcXG5cXG5gO1xuXHRcdH1cblxuXHRcdGNvbnRlbnQgKz0gJyMjIE1hbmFnZWQgU2V0dGluZ3NcXG5cXG4nO1xuXHRcdC8vIENhcHR1cmVkIGZyb20gdGhlIE1hbmFnZWQgU2V0dGluZ3Mgc2VjdGlvbiBiZWxvdyBzbyB0aGUgUG9saWN5LUNvbnRyb2xsZWQgU2V0dGluZ3MgdGFibGVcblx0XHQvLyBjYW4gYXR0cmlidXRlIGVhY2ggbWFuYWdlZC1zZXR0aW5ncy1kcml2ZW4gcG9saWN5IHRvIHRoZSBkZWxpdmVyeSBjaGFubmVsIHRoYXQgYWN0dWFsbHlcblx0XHQvLyB3b24gaXRzIGtleSAocGVyLWtleSBwcmVjZWRlbmNlKSwgaW5zdGVhZCBvZiB0aGUgZ2VuZXJpYyBBY2NvdW50UG9saWN5U2VydmljZSB0aGF0IGhvc3RzXG5cdFx0Ly8gdGhlIHByb2plY3Rpb24uIE1hcHMgYSB3aW5uaW5nIG1hbmFnZWQtc2V0dGluZ3Mga2V5IC0+IHRoZSBjaGFubmVsIHRoYXQgc3VwcGxpZWQgaXQuXG5cdFx0Y29uc3QgYWN0aXZlTWFuYWdlZFNldHRpbmdTb3VyY2VzID0gbmV3IE1hcDxzdHJpbmcsIE1hbmFnZWRTZXR0aW5nc0NoYW5uZWw+KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBvbGljeURhdGEgPSBkZWZhdWx0QWNjb3VudFNlcnZpY2UucG9saWN5RGF0YTtcblx0XHRcdGNvbnN0IHNlcnZlck1hbmFnZWRTZXR0aW5ncyA9IHBvbGljeURhdGE/Lm1hbmFnZWRTZXR0aW5ncyA/PyB7fTtcblxuXHRcdFx0Y29uc3QgbmF0aXZlTWFuYWdlZFNldHRpbmdzID0gbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZT8ubWFuYWdlZFNldHRpbmdzID8/IHt9O1xuXHRcdFx0Y29uc3QgZmlsZU1hbmFnZWRTZXR0aW5ncyA9IGZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlPy5tYW5hZ2VkU2V0dGluZ3MgPz8ge307XG5cdFx0XHRjb25zdCBmaWxlUmF3TWFuYWdlZFNldHRpbmdzID0gZmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2U/LnJhd01hbmFnZWRTZXR0aW5ncztcblxuXHRcdFx0Y29uc3QgZGVjbGFyZWREZWZpbml0aW9uczogUmVjb3JkPHN0cmluZywgSU1hbmFnZWRTZXR0aW5nUG9saWN5RGVmaW5pdGlvbj4gPSB7fTtcblx0XHRcdGZvciAoY29uc3QgcHJvcGVydHkgb2YgWy4uLk9iamVjdC52YWx1ZXMoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCkpLCAuLi5PYmplY3QudmFsdWVzKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRFeGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCkpXSkge1xuXHRcdFx0XHRjb25zdCBkZWNsYXJlZCA9IHByb3BlcnR5LnBvbGljeT8ubWFuYWdlZFNldHRpbmdzO1xuXHRcdFx0XHRpZiAoZGVjbGFyZWQpIHtcblx0XHRcdFx0XHRPYmplY3QuYXNzaWduKGRlY2xhcmVkRGVmaW5pdGlvbnMsIGRlY2xhcmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXVzZSB0aGUgZXhhY3QgcGVyLWtleSByZXNvbHV0aW9uIHRoYXQgcG9saWN5IGV2YWx1YXRpb24gYXBwbGllcyBzbyB0aGlzIHJlcG9ydCBjYW5cblx0XHRcdC8vIG5ldmVyIGRyaWZ0IGZyb20gd2hhdCBBY2NvdW50UG9saWN5U2VydmljZSBhY3R1YWxseSBlbmZvcmNlcy5cblx0XHRcdGNvbnN0IHBpY2sgPSBwaWNrTWFuYWdlZFNldHRpbmdzKG5hdGl2ZU1hbmFnZWRTZXR0aW5ncywgc2VydmVyTWFuYWdlZFNldHRpbmdzLCBmaWxlTWFuYWdlZFNldHRpbmdzKTtcblxuXHRcdFx0Y29udGVudCArPSBgKipBY3RpdmUgc291cmNlcyoqIChpbiBwcmVjZWRlbmNlIG9yZGVyKTogJHtwaWNrLmFjdGl2ZVNvdXJjZXMubGVuZ3RoID4gMCA/IHBpY2suYWN0aXZlU291cmNlcy5tYXAobWFuYWdlZFNldHRpbmdzU291cmNlTGFiZWwpLmpvaW4oJywgJykgOiBtYW5hZ2VkU2V0dGluZ3NTb3VyY2VMYWJlbCgnbm9uZScpfVxcblxcbmA7XG5cdFx0XHRjb250ZW50ICs9ICcqUHJlY2VkZW5jZSBpcyByZXNvbHZlZCBwZXIga2V5OiBuYXRpdmUgTURNIHdpbnMgb3ZlciB0aGUgc2VydmVyIGVuZHBvaW50LCB3aGljaCB3aW5zIG92ZXIgdGhlIGZpbGUgb24gZGlzay4gQSBrZXkgbGVmdCB1bnNldCBieSBhIGhpZ2hlciBjaGFubmVsIGlzIHN0aWxsIGZpbGxlZCBpbiBieSBhIGxvd2VyIG9uZS4qXFxuXFxuJztcblxuXHRcdFx0Ly8gQ29sbGVjdCBub24tZmF0YWwgaXNzdWVzIGZyb20gZXZlcnkgbWFuYWdlZC1zZXR0aW5ncyBwYXJzaW5nL25vcm1hbGl6YXRpb24gY2FsbGJhY2tcblx0XHRcdC8vIChhZGFwdCwgcHJvamVjdGlvbiwgSlNPTiBwYXlsb2FkKSBzbyB0aGUgcmVwb3J0IGV4cGxhaW5zICp3aHkqIGEga2V5IHdhcyBkcm9wcGVkLlxuXHRcdFx0Ly8ganNvbmMtc3R5bGU6IGFjY3VtdWxhdGUgZXZlcnkgZXJyb3IgaW5zdGVhZCBvZiBmYWlsaW5nIG9uIHRoZSBmaXJzdC5cblx0XHRcdGNvbnN0IHBhcnNlRXJyb3JzOiB7IHN0YWdlOiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZyB9W10gPSBbXTtcblx0XHRcdGNvbnN0IHByb2plY3RDaGFubmVsID0gKGNoYW5uZWw6IE1hbmFnZWRTZXR0aW5nc0NoYW5uZWwsIHZhbHVlczogTWFuYWdlZFNldHRpbmdzRGF0YSk6IE1hbmFnZWRTZXR0aW5nc0RhdGEgPT4gcHJvamVjdE1hbmFnZWRTZXR0aW5ncyhcblx0XHRcdFx0dmFsdWVzLFxuXHRcdFx0XHRkZWNsYXJlZERlZmluaXRpb25zLFxuXHRcdFx0XHRtZXNzYWdlID0+IHBhcnNlRXJyb3JzLnB1c2goeyBzdGFnZTogYCR7Y2hhbm5lbH06IHByb2plY3RgLCBtZXNzYWdlIH0pXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBXaGV0aGVyIGEgY2hhbm5lbCBzdXBwbGllZCBhdCBsZWFzdCBvbmUgKndpbm5pbmcqIGtleSBpbiB0aGUgcGVyLWtleSByZXNvbHV0aW9uLlxuXHRcdFx0Y29uc3QgY2hhbm5lbENvbnRyaWJ1dGVzID0gKGNoYW5uZWw6IE1hbmFnZWRTZXR0aW5nc0NoYW5uZWwpID0+IHBpY2suYWN0aXZlU291cmNlcy5pbmNsdWRlcyhjaGFubmVsKTtcblx0XHRcdGNvbnN0IG5hdGl2ZVByb2plY3RlZCA9IHByb2plY3RDaGFubmVsKCduYXRpdmVNZG0nLCBuYXRpdmVNYW5hZ2VkU2V0dGluZ3MpO1xuXHRcdFx0Y29uc3Qgc2VydmVyUHJvamVjdGVkID0gcHJvamVjdENoYW5uZWwoJ3NlcnZlcicsIHNlcnZlck1hbmFnZWRTZXR0aW5ncyk7XG5cdFx0XHRjb25zdCBmaWxlUHJvamVjdGVkID0gcHJvamVjdENoYW5uZWwoJ2ZpbGUnLCBmaWxlTWFuYWdlZFNldHRpbmdzKTtcblx0XHRcdGNvbnN0IGVmZmVjdGl2ZSA9IHByb2plY3RNYW5hZ2VkU2V0dGluZ3MocGljay52YWx1ZXMsIGRlY2xhcmVkRGVmaW5pdGlvbnMsIG1lc3NhZ2UgPT4gcGFyc2VFcnJvcnMucHVzaCh7IHN0YWdlOiAnZWZmZWN0aXZlOiBwcm9qZWN0JywgbWVzc2FnZSB9KSk7XG5cblx0XHRcdGNvbnRlbnQgKz0gJyMjIyBWUyBDb2RlIE1hbmFnZWQtU2V0dGluZ3MgU2NoZW1hXFxuXFxuJztcblx0XHRcdGNvbnRlbnQgKz0gJypPbmx5IGtleXMgZGVjbGFyZWQgaGVyZSBjYW4gcmVhY2ggVlMgQ29kZSBwb2xpY3kgY2FsbGJhY2tzLiBSdW50aW1lLW93bmVkIGtleXMgbWF5IHN0aWxsIGJlIGVuZm9yY2VkIGJ5IHRoZSBDb3BpbG90IHJ1bnRpbWUgZXZlbiB3aGVuIGFic2VudCBmcm9tIHRoZSBwcm9qZWN0aW9ucyBiZWxvdy4qXFxuXFxuJztcblx0XHRcdGNvbnRlbnQgKz0ganNvbkJsb2NrKGRlY2xhcmVkRGVmaW5pdGlvbnMpO1xuXG5cdFx0XHQvLyBTZWN0aW9ucyBhcmUgbGlzdGVkIGluIHByZWNlZGVuY2Ugb3JkZXIgKGhpZ2hlc3QgZmlyc3QpOiBuYXRpdmUgTURNIHdpbnMgb3ZlciB0aGVcblx0XHRcdC8vIHNlcnZlciBlbmRwb2ludCwgd2hpY2ggaW4gdHVybiB3aW5zIG92ZXIgdGhlIGZpbGUgb24gZGlzay5cblx0XHRcdGNvbnRlbnQgKz0gJyMjIyBOYXRpdmUgTURNXFxuXFxuJztcblx0XHRcdGNvbnRlbnQgKz0gUFJPUEVSVFlfVkFMVUVfVEFCTEVfSEVBREVSO1xuXHRcdFx0Y29udGVudCArPSBgfCBBdmFpbGFibGUgfCAke25hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgPyAneWVzJyA6ICdubyd9IHxcXG5gO1xuXHRcdFx0Y29udGVudCArPSBgfCBDb250cmlidXRlcyB3aW5uaW5nIGtleXMgfCAke2NoYW5uZWxDb250cmlidXRlcygnbmF0aXZlTWRtJykgPyAneWVzJyA6ICdubyd9IHxcXG5cXG5gO1xuXHRcdFx0aWYgKG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UpIHtcblx0XHRcdFx0Y29udGVudCArPSAnKlRoZSBuYXRpdmUgcG9saWN5IHdhdGNoZXIgZXhwb3NlcyBvbmx5IGRlY2xhcmVkIHNjYWxhciBrZXlzLCBzbyBpdHMgc291cmNlIHZhbHVlcyBhcmUgYWxyZWFkeSBkZWZpbml0aW9uLXNjb3BlZCBhbmQgY2Fub25pY2FsLipcXG5cXG4nO1xuXHRcdFx0XHRjb250ZW50ICs9IG1hbmFnZWRTZXR0aW5nc1BpcGVsaW5lKCdTb3VyY2UgdmFsdWVzIChkZWZpbml0aW9uLXNjb3BlZCknLCBuYXRpdmVNYW5hZ2VkU2V0dGluZ3MsIG5hdGl2ZU1hbmFnZWRTZXR0aW5ncywgbmF0aXZlUHJvamVjdGVkKTtcblx0XHRcdH1cblxuXHRcdFx0Y29udGVudCArPSAnIyMjIEdpdEh1YiBTZXJ2ZXIgQVBJXFxuXFxuJztcblx0XHRcdGNvbnRlbnQgKz0gUFJPUEVSVFlfVkFMVUVfVEFCTEVfSEVBREVSO1xuXHRcdFx0Y29udGVudCArPSAnfCBFbmRwb2ludCB8IGAvY29waWxvdF9pbnRlcm5hbC9tYW5hZ2VkX3NldHRpbmdzYCB8XFxuJztcblx0XHRcdGNvbnN0IGZldGNoU3RhdHVzID0gZGVmYXVsdEFjY291bnRTZXJ2aWNlLm1hbmFnZWRTZXR0aW5nc0ZldGNoU3RhdHVzO1xuXHRcdFx0Y29udGVudCArPSBgfCBMYXN0IGZldGNoIHwgJHtmZXRjaFN0YXR1cyA9PT0gbnVsbCA/ICcqbmV2ZXIqJyA6IGBcXGAke2ZldGNoU3RhdHVzfVxcYGB9IHxcXG5gO1xuXHRcdFx0Y29uc3QgZmV0Y2hlZEF0ID0gZGVmYXVsdEFjY291bnRTZXJ2aWNlLm1hbmFnZWRTZXR0aW5nc0ZldGNoZWRBdDtcblx0XHRcdGNvbnRlbnQgKz0gYHwgTGFzdCBzdWNjZXNzZnVsIGZldGNoIHwgJHtmZXRjaGVkQXQgPyBuZXcgRGF0ZShmZXRjaGVkQXQpLnRvTG9jYWxlU3RyaW5nKCkgOiAnKm4vYSonfSB8XFxuYDtcblx0XHRcdGNvbnRlbnQgKz0gYHwgQ29udHJpYnV0ZXMgd2lubmluZyBrZXlzIHwgJHtjaGFubmVsQ29udHJpYnV0ZXMoJ3NlcnZlcicpID8gJ3llcycgOiAnbm8nfSB8XFxuXFxuYDtcblxuXHRcdFx0Y29uc3QgcmF3UmVzcG9uc2UgPSBkZWZhdWx0QWNjb3VudFNlcnZpY2UubWFuYWdlZFNldHRpbmdzUmF3UmVzcG9uc2U7XG5cdFx0XHRpZiAoaXNPYmplY3QocmF3UmVzcG9uc2UpKSB7XG5cdFx0XHRcdGFkYXB0TWFuYWdlZFNldHRpbmdzKHJhd1Jlc3BvbnNlIGFzIElNYW5hZ2VkU2V0dGluZ3NSZXNwb25zZSwgbWVzc2FnZSA9PiBwYXJzZUVycm9ycy5wdXNoKHsgc3RhZ2U6ICdhZGFwdCcsIG1lc3NhZ2UgfSkpO1xuXHRcdFx0fVxuXHRcdFx0Y29udGVudCArPSBtYW5hZ2VkU2V0dGluZ3NQaXBlbGluZShcblx0XHRcdFx0J1JhdyByZXNwb25zZSAobGFzdCBzdWNjZXNzZnVsIGZldGNoKScsXG5cdFx0XHRcdGlzT2JqZWN0KHJhd1Jlc3BvbnNlKSA/IHJhd1Jlc3BvbnNlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzZXJ2ZXJNYW5hZ2VkU2V0dGluZ3MsXG5cdFx0XHRcdHNlcnZlclByb2plY3RlZCxcblx0XHRcdFx0J05vIHN1Y2Nlc3NmdWwgbWFuYWdlZC1zZXR0aW5ncyByZXNwb25zZSBoYXMgYmVlbiBjYXB0dXJlZC4nXG5cdFx0XHQpO1xuXG5cdFx0XHRjb250ZW50ICs9ICcjIyMgRmlsZSAobWFuYWdlZC1zZXR0aW5ncy5qc29uKVxcblxcbic7XG5cdFx0XHRjb250ZW50ICs9IFBST1BFUlRZX1ZBTFVFX1RBQkxFX0hFQURFUjtcblx0XHRcdGNvbnRlbnQgKz0gYHwgQXZhaWxhYmxlIHwgJHtmaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZSA/ICd5ZXMnIDogJ25vJ30gfFxcbmA7XG5cdFx0XHRjb250ZW50ICs9IGB8IENvbnRyaWJ1dGVzIHdpbm5pbmcga2V5cyB8ICR7Y2hhbm5lbENvbnRyaWJ1dGVzKCdmaWxlJykgPyAneWVzJyA6ICdubyd9IHxcXG5cXG5gO1xuXHRcdFx0aWYgKGZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKSB7XG5cdFx0XHRcdGlmIChmaWxlUmF3TWFuYWdlZFNldHRpbmdzKSB7XG5cdFx0XHRcdFx0bm9ybWFsaXplTWFuYWdlZFNldHRpbmdzKGZpbGVSYXdNYW5hZ2VkU2V0dGluZ3MsIG1lc3NhZ2UgPT4gcGFyc2VFcnJvcnMucHVzaCh7IHN0YWdlOiAnZmlsZTogbm9ybWFsaXplJywgbWVzc2FnZSB9KSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGVudCArPSBtYW5hZ2VkU2V0dGluZ3NQaXBlbGluZSgnUmF3IHBhcnNlZCBmaWxlJywgZmlsZVJhd01hbmFnZWRTZXR0aW5ncywgZmlsZU1hbmFnZWRTZXR0aW5ncywgZmlsZVByb2plY3RlZCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFBlci1rZXkgcmVzb2x1dGlvbjogd2hhdCBlYWNoIGNoYW5uZWwgc3VwcGxpZWQsIHdoaWNoIHdvbiwgYW5kIChzdHJ1Y2sgdGhyb3VnaCkgd2hpY2hcblx0XHRcdC8vIHdlcmUgb3ZlcnJpZGRlbiBcdTIwMTQgdGhlIGF1dGhvcml0YXRpdmUgXCJ3aGF0IGNhbWUgZnJvbSB3aGVyZSwgd2hhdCdzIGVmZmVjdGl2ZSwgYW5kIHdoeVwiLlxuXHRcdFx0Y29udGVudCArPSAnIyMjIEVmZmVjdGl2ZSBSZXNvbHV0aW9uXFxuXFxuJztcblx0XHRcdGNvbnRlbnQgKz0gJyoqTWVyZ2VkIG5vcm1hbGl6ZWQgYmFnKipcXG5cXG4nO1xuXHRcdFx0Y29udGVudCArPSBqc29uQmxvY2socGljay52YWx1ZXMpO1xuXHRcdFx0Y29udGVudCArPSAnKipFZmZlY3RpdmUgVlMgQ29kZSBwb2xpY3kgYmFnKipcXG5cXG4nO1xuXHRcdFx0Y29udGVudCArPSBqc29uQmxvY2soZWZmZWN0aXZlKTtcblx0XHRcdGNvbnRlbnQgKz0gJyoqUGVyLWtleSBwcmVjZWRlbmNlKipcXG5cXG4nO1xuXHRcdFx0aWYgKHBpY2sucmVzb2x1dGlvbnMuc2l6ZSA+IDApIHtcblx0XHRcdFx0Y29udGVudCArPSAnfCBLZXkgfCBFZmZlY3RpdmUgfCBXaW5uaW5nIFNvdXJjZSB8IE5hdGl2ZSBNRE0gfCBTZXJ2ZXIgfCBGaWxlIHxcXG4nO1xuXHRcdFx0XHRjb250ZW50ICs9ICd8LS0tLS18LS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS18LS0tLS0tLS18LS0tLS0tfFxcbic7XG5cdFx0XHRcdGNvbnN0IGNoYW5uZWxWYWx1ZSA9IChyZXNvbHV0aW9uOiBJTWFuYWdlZFNldHRpbmdSZXNvbHV0aW9uLCBjaGFubmVsOiBNYW5hZ2VkU2V0dGluZ3NDaGFubmVsKTogc3RyaW5nID0+IHtcblx0XHRcdFx0XHRjb25zdCBjb250cmlidXRpb24gPSByZXNvbHV0aW9uLmNvbnRyaWJ1dGlvbnMuZmluZChjID0+IGMuY2hhbm5lbCA9PT0gY2hhbm5lbCk7XG5cdFx0XHRcdFx0aWYgKCFjb250cmlidXRpb24pIHtcblx0XHRcdFx0XHRcdHJldHVybiAnXHUyMDE0Jztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gU3RyaWtlIHRocm91Z2ggb3ZlcnJpZGRlbiBjb250cmlidXRpb25zIHNvIHRoZSByZXBvcnQgZXhwbGFpbnMgKndoeSogdGhleSBkb24ndCBhcHBseS5cblx0XHRcdFx0XHRjb25zdCBjZWxsID0gbWFuYWdlZFZhbHVlQ2VsbChjb250cmlidXRpb24udmFsdWUpO1xuXHRcdFx0XHRcdHJldHVybiBjaGFubmVsID09PSByZXNvbHV0aW9uLnNvdXJjZSA/IGNlbGwgOiBgfn4ke2NlbGx9fn5gO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBbLi4ucGljay5yZXNvbHV0aW9ucy5rZXlzKCldLnNvcnQoKSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc29sdXRpb24gPSBwaWNrLnJlc29sdXRpb25zLmdldChrZXkpITtcblx0XHRcdFx0XHRjb250ZW50ICs9IGB8ICR7a2V5fSB8ICR7bWFuYWdlZFZhbHVlQ2VsbChyZXNvbHV0aW9uLnZhbHVlKX0gfCAke21hbmFnZWRTZXR0aW5nc1NvdXJjZVNob3J0TGFiZWwocmVzb2x1dGlvbi5zb3VyY2UpfSB8ICR7Y2hhbm5lbFZhbHVlKHJlc29sdXRpb24sICduYXRpdmVNZG0nKX0gfCAke2NoYW5uZWxWYWx1ZShyZXNvbHV0aW9uLCAnc2VydmVyJyl9IHwgJHtjaGFubmVsVmFsdWUocmVzb2x1dGlvbiwgJ2ZpbGUnKX0gfFxcbmA7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGVudCArPSAnXFxuJztcblx0XHRcdFx0Y29udGVudCArPSAnKlN0cnVjay10aHJvdWdoIHZhbHVlcyB3ZXJlIHN1cHBsaWVkIGJ5IGEgY2hhbm5lbCBidXQgb3ZlcnJpZGRlbiBieSBhIGhpZ2hlci1wcmVjZWRlbmNlIGNoYW5uZWwgZm9yIHRoYXQga2V5LipcXG5cXG4nO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udGVudCArPSAnKk5vIG1hbmFnZWQtc2V0dGluZ3Mga2V5cyBhcmUgc3VwcGxpZWQgYnkgYW55IGNoYW5uZWwuKlxcblxcbic7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnRlbnQgKz0gJyMjIyBBZ2VudCBSdW50aW1lIFJlc29sdXRpb25cXG5cXG4nO1xuXHRcdFx0Y29udGVudCArPSAnKlJlc29sdmVkIGluZGVwZW5kZW50bHkgYnkgZWFjaCBwcm92aWRlciB0aHJvdWdoIGl0cyBvd24gU0RLL3J1bnRpbWUuIFRoaXMgbWF5IGluY2x1ZGUgcnVudGltZS1vd25lZCBrZXlzIHRoYXQgVlMgQ29kZSBkb2VzIG5vdCBkZWNsYXJlIGFzIGNvbmZpZ3VyYXRpb24gcG9saWNpZXMuKlxcblxcbic7XG5cdFx0XHRpZiAoIWFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmVuYWJsZWQuZ2V0KCkpIHtcblx0XHRcdFx0Y29udGVudCArPSAnKkFnZW50IEhvc3QgaXMgZGlzYWJsZWQ7IHJ1bnRpbWUgbWFuYWdlZC1zZXR0aW5ncyBkaWFnbm9zdGljcyB3ZXJlIG5vdCBxdWVyaWVkLipcXG5cXG4nO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBydW50aW1lRGlhZ25vc3RpY3MgPSBhd2FpdCBhZ2VudEhvc3RTZXJ2aWNlLmdldE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzKCk7XG5cdFx0XHRcdFx0aWYgKHJ1bnRpbWVEaWFnbm9zdGljcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdGNvbnRlbnQgKz0gJypObyBhZ2VudCBwcm92aWRlciBleHBvc2VzIG1hbmFnZWQtc2V0dGluZ3MgZGlhZ25vc3RpY3MuKlxcblxcbic7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvciAoY29uc3QgZGlhZ25vc3RpYyBvZiBydW50aW1lRGlhZ25vc3RpY3MpIHtcblx0XHRcdFx0XHRcdGNvbnRlbnQgKz0gYCMjIyMgJHtkaWFnbm9zdGljLnByb3ZpZGVyfVxcblxcbmA7XG5cdFx0XHRcdFx0XHRpZiAoZGlhZ25vc3RpYy5lcnJvcikge1xuXHRcdFx0XHRcdFx0XHRjb250ZW50ICs9IGAqUHJvYmUgZmFpbGVkOiAke2RpYWdub3N0aWMuZXJyb3J9KlxcblxcbmA7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb250ZW50ICs9IGpzb25CbG9jayhkaWFnbm9zdGljLnNuYXBzaG90KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0Y29udGVudCArPSBgKkFnZW50IHJ1bnRpbWUgZGlhZ25vc3RpY3MgdW5hdmFpbGFibGU6ICR7ZXJyb3J9KlxcblxcbmA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVtZW1iZXIgd2hpY2ggbWFuYWdlZC1zZXR0aW5ncyBrZXlzIGFjdHVhbGx5IHJlYWNoZWQgcG9saWN5IGV2YWx1YXRpb24sIGFuZCBmcm9tIHdoaWNoXG5cdFx0XHQvLyBjaGFubmVsIHdvbiBlYWNoLCBzbyB0aGUgUG9saWN5LUNvbnRyb2xsZWQgU2V0dGluZ3MgdGFibGUgY2FuIGF0dHJpYnV0ZSB0aGVtIGFjY3VyYXRlbHkuXG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhlZmZlY3RpdmUpKSB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdXRpb24gPSBwaWNrLnJlc29sdXRpb25zLmdldChrZXkpO1xuXHRcdFx0XHRpZiAocmVzb2x1dGlvbikge1xuXHRcdFx0XHRcdGFjdGl2ZU1hbmFnZWRTZXR0aW5nU291cmNlcy5zZXQoa2V5LCByZXNvbHV0aW9uLnNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSlNPTiBwYXlsb2FkczogdGhlIHN0cnVjdHVyZWQga2V5cyBjYXJyeSBhIEpTT04gc3RyaW5nIHRoYXQgUG9saWN5Q29uZmlndXJhdGlvbiBwYXJzZXNcblx0XHRcdC8vIGJhY2sgaW50byB0aGUgb2JqZWN0L2FycmF5LXR5cGVkIHNldHRpbmcgb24gcmVhZC4gUmUtcGFyc2UgZXhhY3RseSB0aG9zZSBrZXlzIHdpdGggdGhlXG5cdFx0XHQvLyBzYW1lIGpzb25jIHBhcnNlciBzbyBhIG1hbGZvcm1lZCB2YWx1ZSBzdXJmYWNlcyBoZXJlIGluc3RlYWQgb2YgYmVpbmcgc2lsZW50bHkgcmVqZWN0ZWQuXG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBbQ09QSUxPVF9FTkFCTEVEX1BMVUdJTlNfS0VZLCBDT1BJTE9UX1NUUklDVF9NQVJLRVRQTEFDRVNfS0VZLCBDT1BJTE9UX0VYVFJBX01BUktFVFBMQUNFU19LRVldKSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gZWZmZWN0aXZlW2tleV07XG5cdFx0XHRcdGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QganNvbkVycm9yczoganNvbi5QYXJzZUVycm9yW10gPSBbXTtcblx0XHRcdFx0anNvbi5wYXJzZSh2YWx1ZSwganNvbkVycm9ycyk7XG5cdFx0XHRcdGZvciAoY29uc3QgZSBvZiBqc29uRXJyb3JzKSB7XG5cdFx0XHRcdFx0cGFyc2VFcnJvcnMucHVzaCh7IHN0YWdlOiAncGFyc2UnLCBtZXNzYWdlOiBgJHtrZXl9IEAgb2Zmc2V0ICR7ZS5vZmZzZXR9OiAke2dldFBhcnNlRXJyb3JNZXNzYWdlKGUuZXJyb3IpfWAgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29udGVudCArPSBgIyMjIE5vcm1hbGl6YXRpb24gYW5kIFBhcnNlIElzc3VlcyAoJHtwYXJzZUVycm9ycy5sZW5ndGh9KVxcblxcbmA7XG5cdFx0XHRpZiAocGFyc2VFcnJvcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb250ZW50ICs9ICd8IFN0YWdlIHwgTWVzc2FnZSB8XFxuJztcblx0XHRcdFx0Y29udGVudCArPSAnfC0tLS0tLS18LS0tLS0tLS0tfFxcbic7XG5cdFx0XHRcdGZvciAoY29uc3QgeyBzdGFnZSwgbWVzc2FnZSB9IG9mIHBhcnNlRXJyb3JzKSB7XG5cdFx0XHRcdFx0Y29udGVudCArPSBgfCAke3N0YWdlfSB8ICR7bWVzc2FnZS5yZXBsYWNlKC9cXHwvZywgJ1xcXFx8Jyl9IHxcXG5gO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRlbnQgKz0gJ1xcbic7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb250ZW50ICs9ICcqTm9uZS4qXFxuXFxuJztcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29udGVudCArPSBgKkVycm9yIHJlbmRlcmluZyBtYW5hZ2VkIHNldHRpbmdzIGRpYWdub3N0aWNzOiAke2Vycm9yfSpcXG5cXG5gO1xuXHRcdH1cblxuXHRcdGNvbnRlbnQgKz0gJyMjIFBvbGljeS1Db250cm9sbGVkIFNldHRpbmdzXFxuXFxuJztcblxuXHRcdGNvbnN0IHBvbGljeUNvbmZpZ3VyYXRpb25zID0gY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldFBvbGljeUNvbmZpZ3VyYXRpb25zKCk7XG5cdFx0Y29uc3QgcG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMgPSBjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0UG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMoKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUHJvcGVydGllcyA9IGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdGNvbnN0IGV4Y2x1ZGVkUHJvcGVydGllcyA9IGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRFeGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cblx0XHRpZiAocG9saWN5Q29uZmlndXJhdGlvbnMuc2l6ZSA+IDAgfHwgcG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMuc2l6ZSA+IDApIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRjb25zdCBhcHBsaWVkUG9saWN5OiBBcnJheTx7IG5hbWU6IHN0cmluZzsga2V5OiBzdHJpbmc7IHByb3BlcnR5OiBhbnk7IGluc3BlY3Rpb246IGFueSB9PiA9IFtdO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdGNvbnN0IG5vdEFwcGxpZWRQb2xpY3k6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBrZXk6IHN0cmluZzsgcHJvcGVydHk6IGFueTsgaW5zcGVjdGlvbjogYW55IH0+ID0gW107XG5cblx0XHRcdGNvbnN0IGNvbGxlY3RQb2xpY3lTZXR0aW5nID0gKHBvbGljeU5hbWU6IHN0cmluZywgc2V0dGluZ0tleTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHByb3BlcnR5ID0gY29uZmlndXJhdGlvblByb3BlcnRpZXNbc2V0dGluZ0tleV0gPz8gZXhjbHVkZWRQcm9wZXJ0aWVzW3NldHRpbmdLZXldO1xuXHRcdFx0XHRpZiAocHJvcGVydHkpIHtcblx0XHRcdFx0XHRjb25zdCBpbnNwZWN0VmFsdWUgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KHNldHRpbmdLZXkpO1xuXHRcdFx0XHRcdGNvbnN0IHNldHRpbmdJbmZvID0ge1xuXHRcdFx0XHRcdFx0bmFtZTogcG9saWN5TmFtZSxcblx0XHRcdFx0XHRcdGtleTogc2V0dGluZ0tleSxcblx0XHRcdFx0XHRcdHByb3BlcnR5LFxuXHRcdFx0XHRcdFx0aW5zcGVjdGlvbjogaW5zcGVjdFZhbHVlXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdGlmIChpbnNwZWN0VmFsdWUucG9saWN5VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0YXBwbGllZFBvbGljeS5wdXNoKHNldHRpbmdJbmZvKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bm90QXBwbGllZFBvbGljeS5wdXNoKHNldHRpbmdJbmZvKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGZvciAoY29uc3QgW3BvbGljeU5hbWUsIHNldHRpbmdLZXldIG9mIHBvbGljeUNvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHRcdGNvbGxlY3RQb2xpY3lTZXR0aW5nKHBvbGljeU5hbWUsIHNldHRpbmdLZXkpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBbcG9saWN5TmFtZSwgc2V0dGluZ0tleXNdIG9mIHBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZ0tleSBvZiBzZXR0aW5nS2V5cykge1xuXHRcdFx0XHRcdGNvbGxlY3RQb2xpY3lTZXR0aW5nKHBvbGljeU5hbWUsIHNldHRpbmdLZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRyeSB0byBkZXRlY3Qgd2hlcmUgdGhlIHBvbGljeSBjYW1lIGZyb21cblx0XHRcdGNvbnN0IHBvbGljeVNvdXJjZU1lbW8gPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdFx0Y29uc3QgZ2V0UG9saWN5U291cmNlID0gKHBvbGljeU5hbWU6IHN0cmluZyk6IHN0cmluZyA9PiB7XG5cdFx0XHRcdGlmIChwb2xpY3lTb3VyY2VNZW1vLmhhcyhwb2xpY3lOYW1lKSkge1xuXHRcdFx0XHRcdHJldHVybiBwb2xpY3lTb3VyY2VNZW1vLmdldChwb2xpY3lOYW1lKSE7XG5cdFx0XHRcdH1cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBwb2xpY3lTZXJ2aWNlQ29uc3RydWN0b3JOYW1lID0gcG9saWN5U2VydmljZS5jb25zdHJ1Y3Rvci5uYW1lO1xuXHRcdFx0XHRcdGlmIChwb2xpY3lTZXJ2aWNlQ29uc3RydWN0b3JOYW1lID09PSAnTXVsdGlwbGV4UG9saWN5U2VydmljZScpIHtcblx0XHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0cywgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdFx0XHRcdFx0Y29uc3QgbXVsdGlwbGV4U2VydmljZSA9IHBvbGljeVNlcnZpY2UgYXMgYW55O1xuXHRcdFx0XHRcdFx0aWYgKG11bHRpcGxleFNlcnZpY2UucG9saWN5U2VydmljZXMpIHtcblx0XHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdFx0XHRcdFx0Y29uc3QgY29tcG9uZW50U2VydmljZXMgPSBtdWx0aXBsZXhTZXJ2aWNlLnBvbGljeVNlcnZpY2VzIGFzIFJlYWRvbmx5QXJyYXk8YW55Pjtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBzZXJ2aWNlIG9mIGNvbXBvbmVudFNlcnZpY2VzKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHNlcnZpY2UuZ2V0UG9saWN5VmFsdWUgJiYgc2VydmljZS5nZXRQb2xpY3lWYWx1ZShwb2xpY3lOYW1lKSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRwb2xpY3lTb3VyY2VNZW1vLnNldChwb2xpY3lOYW1lLCBzZXJ2aWNlLmNvbnN0cnVjdG9yLm5hbWUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHNlcnZpY2UuY29uc3RydWN0b3IubmFtZTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRyZXR1cm4gJ1Vua25vd24nO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBBIG1hbmFnZWQtc2V0dGluZ3MtZHJpdmVuIHBvbGljeSBpcyBob3N0ZWQgYnkgQWNjb3VudFBvbGljeVNlcnZpY2UgYnV0IGl0cyB2YWx1ZSByZWFsbHlcblx0XHRcdC8vIG9yaWdpbmF0ZXMgZnJvbSBhIGRlbGl2ZXJ5IGNoYW5uZWwgKHNlcnZlciAvIG5hdGl2ZSBNRE0gLyBmaWxlKS4gV2l0aCBwZXIta2V5IHByZWNlZGVuY2Vcblx0XHRcdC8vIGEgcG9saWN5J3MgZGVjbGFyZWQga2V5cyBjYW4gZXZlbiByZXNvbHZlIHRvIGRpZmZlcmVudCBjaGFubmVscywgc28gYXR0cmlidXRlIGl0IHRvIHRoZVxuXHRcdFx0Ly8gY2hhbm5lbChzKSB0aGF0IGFjdHVhbGx5IHdvbiBpdHMgZGVjbGFyZWQga2V5cy4gV2hlbiB0aGUgQWNjb3VudCBQb2xpY3kgR2F0ZSBpcyBhY3RpdmVseVxuXHRcdFx0Ly8gcmVzdHJpY3RpbmcsIHRoZSB2YWx1ZSBjb21lcyBmcm9tIHRoZSBnYXRlJ3MgcmVzdHJpY3RlZCB2YWx1ZSAod2hpY2ggb3ZlcnJpZGVzIG1hbmFnZWRcblx0XHRcdC8vIHNldHRpbmdzKSwgc28gZG9uJ3QgY3JlZGl0IGFueSBjaGFubmVsIGluIHRoYXQgY2FzZS5cblx0XHRcdGNvbnN0IGdhdGVJbmZvID0gYWNjb3VudFBvbGljeUdhdGVTZXJ2aWNlLmdhdGVJbmZvO1xuXHRcdFx0Y29uc3QgZ2F0ZVJlc3RyaWN0ZWQgPSBnYXRlSW5mby5zdGF0ZSA9PT0gQWNjb3VudFBvbGljeUdhdGVTdGF0ZS5SZXN0cmljdGVkXG5cdFx0XHRcdCYmIGdhdGVJbmZvLnJlYXNvbiAhPT0gQWNjb3VudFBvbGljeUdhdGVVbnNhdGlzZmllZFJlYXNvbi5Qb2xpY3lOb3RSZXNvbHZlZDtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRjb25zdCBnZXRSZWZpbmVkUG9saWN5U291cmNlID0gKGl0ZW06IHsgbmFtZTogc3RyaW5nOyBwcm9wZXJ0eTogYW55IH0pOiBzdHJpbmcgPT4ge1xuXHRcdFx0XHRjb25zdCBkZWNsYXJlZEtleXMgPSBpdGVtLnByb3BlcnR5LnBvbGljeT8ubWFuYWdlZFNldHRpbmdzID8gT2JqZWN0LmtleXMoaXRlbS5wcm9wZXJ0eS5wb2xpY3kubWFuYWdlZFNldHRpbmdzKSA6IFtdO1xuXHRcdFx0XHRpZiAoIWdhdGVSZXN0cmljdGVkKSB7XG5cdFx0XHRcdFx0Y29uc3Qgd2lubmluZ1NvdXJjZXMgPSBuZXcgU2V0PE1hbmFnZWRTZXR0aW5nc0NoYW5uZWw+KCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgZGVjbGFyZWRLZXlzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzb3VyY2UgPSBhY3RpdmVNYW5hZ2VkU2V0dGluZ1NvdXJjZXMuZ2V0KGtleSk7XG5cdFx0XHRcdFx0XHRpZiAoc291cmNlKSB7XG5cdFx0XHRcdFx0XHRcdHdpbm5pbmdTb3VyY2VzLmFkZChzb3VyY2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAod2lubmluZ1NvdXJjZXMuc2l6ZSA+IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IG9yZGVyZWQgPSBNQU5BR0VEX1NFVFRJTkdTX0NIQU5ORUxTLmZpbHRlcihjaGFubmVsID0+IHdpbm5pbmdTb3VyY2VzLmhhcyhjaGFubmVsKSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYE1hbmFnZWQgU2V0dGluZ3M6ICR7b3JkZXJlZC5tYXAobWFuYWdlZFNldHRpbmdzU291cmNlU2hvcnRMYWJlbCkuam9pbignLCAnKX1gO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZ2V0UG9saWN5U291cmNlKGl0ZW0ubmFtZSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb250ZW50ICs9ICcjIyMgQXBwbGllZCBQb2xpY3lcXG5cXG4nO1xuXHRcdFx0YXBwbGllZFBvbGljeS5zb3J0KChhLCBiKSA9PiBnZXRSZWZpbmVkUG9saWN5U291cmNlKGEpLmxvY2FsZUNvbXBhcmUoZ2V0UmVmaW5lZFBvbGljeVNvdXJjZShiKSkgfHwgYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKSk7XG5cdFx0XHRpZiAoYXBwbGllZFBvbGljeS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnRlbnQgKz0gJ3wgU2V0dGluZyBLZXkgfCBQb2xpY3kgTmFtZSB8IFBvbGljeSBTb3VyY2UgfCBNYW5hZ2VkIFNldHRpbmdzIHwgRGVmYXVsdCBWYWx1ZSB8IEN1cnJlbnQgVmFsdWUgfCBQb2xpY3kgVmFsdWUgfFxcbic7XG5cdFx0XHRcdGNvbnRlbnQgKz0gJ3wtLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS18XFxuJztcblxuXHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2YgYXBwbGllZFBvbGljeSkge1xuXHRcdFx0XHRcdGNvbnN0IGRlZmF1bHRWYWx1ZSA9IEpTT04uc3RyaW5naWZ5KHNldHRpbmcucHJvcGVydHkuZGVmYXVsdCk7XG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudFZhbHVlID0gSlNPTi5zdHJpbmdpZnkoc2V0dGluZy5pbnNwZWN0aW9uLnZhbHVlKTtcblx0XHRcdFx0XHRjb25zdCBwb2xpY3lWYWx1ZSA9IEpTT04uc3RyaW5naWZ5KHNldHRpbmcuaW5zcGVjdGlvbi5wb2xpY3lWYWx1ZSk7XG5cdFx0XHRcdFx0Y29uc3QgcG9saWN5U291cmNlID0gZ2V0UmVmaW5lZFBvbGljeVNvdXJjZShzZXR0aW5nKTtcblx0XHRcdFx0XHRjb25zdCBtYW5hZ2VkU2V0dGluZ3NLZXlzID0gc2V0dGluZy5wcm9wZXJ0eS5wb2xpY3k/Lm1hbmFnZWRTZXR0aW5ncyA/IE9iamVjdC5rZXlzKHNldHRpbmcucHJvcGVydHkucG9saWN5Lm1hbmFnZWRTZXR0aW5ncykuam9pbignLCAnKSA6ICcnO1xuXG5cdFx0XHRcdFx0Y29udGVudCArPSBgfCAke3NldHRpbmcua2V5fSB8ICR7c2V0dGluZy5uYW1lfSB8ICR7cG9saWN5U291cmNlfSB8ICR7bWFuYWdlZFNldHRpbmdzS2V5cyB8fCAnKm4vYSonfSB8IFxcYCR7ZGVmYXVsdFZhbHVlfVxcYCB8IFxcYCR7Y3VycmVudFZhbHVlfVxcYCB8IFxcYCR7cG9saWN5VmFsdWV9XFxgIHxcXG5gO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRlbnQgKz0gJ1xcbic7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb250ZW50ICs9ICcqTm8gc2V0dGluZ3MgYXJlIGN1cnJlbnRseSBjb250cm9sbGVkIGJ5IHBvbGljaWVzKlxcblxcbic7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnRlbnQgKz0gJyMjIyAgTm9uLWFwcGxpZWQgUG9saWN5XFxuXFxuJztcblx0XHRcdGlmIChub3RBcHBsaWVkUG9saWN5Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29udGVudCArPSAnfCBTZXR0aW5nIEtleSB8IFBvbGljeSBOYW1lICBcXG4nO1xuXHRcdFx0XHRjb250ZW50ICs9ICd8LS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tfFxcbic7XG5cblx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIG5vdEFwcGxpZWRQb2xpY3kpIHtcblxuXHRcdFx0XHRcdGNvbnRlbnQgKz0gYHwgJHtzZXR0aW5nLmtleX0gfCAke3NldHRpbmcubmFtZX18XFxuYDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250ZW50ICs9ICdcXG4nO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udGVudCArPSAnKkFsbCBwb2xpY3ktY29udHJvbGxhYmxlIHNldHRpbmdzIGFyZSBjdXJyZW50bHkgYmVpbmcgZW5mb3JjZWQqXFxuXFxuJztcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udGVudCArPSAnKk5vIHBvbGljeS1jb250cm9sbGVkIHNldHRpbmdzIGZvdW5kKlxcblxcbic7XG5cdFx0fVxuXG5cdFx0Ly8gQXV0aGVudGljYXRpb24gZGlhZ25vc3RpY3Ncblx0XHRjb250ZW50ICs9ICcjIyBBdXRoZW50aWNhdGlvbiBJbmZvcm1hdGlvblxcblxcbic7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVySWRzID0gYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVySWRzKCk7XG5cblx0XHRcdGlmIChwcm92aWRlcklkcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnRlbnQgKz0gJyMjIyBBdXRoZW50aWNhdGlvbiBQcm92aWRlcnNcXG5cXG4nO1xuXHRcdFx0XHRjb250ZW50ICs9ICd8IFByb3ZpZGVyIElEIHwgU2Vzc2lvbnMgfCBBY2NvdW50cyB8XFxuJztcblx0XHRcdFx0Y29udGVudCArPSAnfC0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLXwtLS0tLS0tLS0tfFxcbic7XG5cblx0XHRcdFx0Zm9yIChjb25zdCBwcm92aWRlcklkIG9mIHByb3ZpZGVySWRzKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKHByb3ZpZGVySWQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgYWNjb3VudHMgPSBzZXNzaW9ucy5tYXAoc2Vzc2lvbiA9PiBzZXNzaW9uLmFjY291bnQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgdW5pcXVlQWNjb3VudHMgPSBBcnJheS5mcm9tKG5ldyBTZXQoYWNjb3VudHMubWFwKGFjY291bnQgPT4gYWNjb3VudC5sYWJlbCkpKTtcblxuXHRcdFx0XHRcdFx0Y29udGVudCArPSBgfCAke3Byb3ZpZGVySWR9IHwgJHtzZXNzaW9ucy5sZW5ndGh9IHwgJHt1bmlxdWVBY2NvdW50cy5qb2luKCcsICcpIHx8ICdOb25lJ30gfFxcbmA7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdGNvbnRlbnQgKz0gYHwgJHtwcm92aWRlcklkfSB8IEVycm9yIHwgJHtlcnJvcn0gfFxcbmA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRlbnQgKz0gJ1xcbic7XG5cblx0XHRcdFx0Ly8gRGV0YWlsZWQgc2Vzc2lvbiBpbmZvcm1hdGlvblxuXHRcdFx0XHRjb250ZW50ICs9ICcjIyMgRGV0YWlsZWQgU2Vzc2lvbiBJbmZvcm1hdGlvblxcblxcbic7XG5cdFx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXJJZCBvZiBwcm92aWRlcklkcykge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkKTtcblxuXHRcdFx0XHRcdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0Y29udGVudCArPSBgIyMjIyAke3Byb3ZpZGVySWR9XFxuXFxuYDtcblx0XHRcdFx0XHRcdFx0Y29udGVudCArPSAnfCBBY2NvdW50IHwgU2NvcGVzIHwgRXh0ZW5zaW9ucyB3aXRoIEFjY2VzcyB8XFxuJztcblx0XHRcdFx0XHRcdFx0Y29udGVudCArPSAnfC0tLS0tLS0tLXwtLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS18XFxuJztcblxuXHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBhY2NvdW50TmFtZSA9IHNlc3Npb24uYWNjb3VudC5sYWJlbDtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBzY29wZXMgPSBzZXNzaW9uLnNjb3Blcy5qb2luKCcsICcpIHx8ICdEZWZhdWx0JztcblxuXHRcdFx0XHRcdFx0XHRcdC8vIEdldCBleHRlbnNpb25zIHdpdGggYWNjZXNzIHRvIHRoaXMgYWNjb3VudFxuXHRcdFx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBhbGxvd2VkRXh0ZW5zaW9ucyA9IGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnMocHJvdmlkZXJJZCwgYWNjb3VudE5hbWUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uTmFtZXMgPSBhbGxvd2VkRXh0ZW5zaW9uc1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQuZmlsdGVyKGV4dCA9PiBleHQuYWxsb3dlZCAhPT0gZmFsc2UpXG5cdFx0XHRcdFx0XHRcdFx0XHRcdC5tYXAoZXh0ID0+IGAke2V4dC5uYW1lfSR7ZXh0LnRydXN0ZWQgPyAnICh0cnVzdGVkKScgOiAnJ31gKVxuXHRcdFx0XHRcdFx0XHRcdFx0XHQuam9pbignLCAnKSB8fCAnTm9uZSc7XG5cblx0XHRcdFx0XHRcdFx0XHRcdGNvbnRlbnQgKz0gYHwgJHthY2NvdW50TmFtZX0gfCAke3Njb3Blc30gfCAke2V4dGVuc2lvbk5hbWVzfSB8XFxuYDtcblx0XHRcdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29udGVudCArPSBgfCAke2FjY291bnROYW1lfSB8ICR7c2NvcGVzfSB8IEVycm9yOiAke2Vycm9yfSB8XFxuYDtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y29udGVudCArPSAnXFxuJztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0Y29udGVudCArPSBgIyMjIyAke3Byb3ZpZGVySWR9XFxuKkVycm9yIHJldHJpZXZpbmcgc2Vzc2lvbnM6ICR7ZXJyb3J9KlxcblxcbmA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb250ZW50ICs9ICcqTm8gYXV0aGVudGljYXRpb24gcHJvdmlkZXJzIGZvdW5kKlxcblxcbic7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnRlbnQgKz0gYCpFcnJvciByZXRyaWV2aW5nIGF1dGhlbnRpY2F0aW9uIGluZm9ybWF0aW9uOiAke2Vycm9yfSpcXG5cXG5gO1xuXHRcdH1cblxuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0Y29udGVudHM6IGNvbnRlbnQsXG5cdFx0XHRsYW5ndWFnZUlkOiAnbWFya2Rvd24nLFxuXHRcdFx0b3B0aW9uczogeyBwaW5uZWQ6IHRydWUsIH1cblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBTeW5jQWNjb3VudFBvbGljeUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5zeW5jQWNjb3VudFBvbGljeScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzeW5jQWNjb3VudFBvbGljeScsICdTeW5jIEFjY291bnQgUG9saWN5JyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVmYXVsdEFjY291bnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWZhdWx0QWNjb3VudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGxvZ1NlcnZpY2UuaW5mbygnW0RlZmF1bHRBY2NvdW50XSBNYW51YWxseSBzeW5jaW5nIGFjY291bnQgcG9saWN5Jyk7XG5cdFx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCh7IGZvcmNlUmVmcmVzaDogdHJ1ZSB9KTtcblx0XHRcdGF3YWl0IGRpYWxvZ1NlcnZpY2UuaW5mbyhsb2NhbGl6ZSgnc3luY0FjY291bnRQb2xpY3kuc3VjY2VzcycsIFwiQWNjb3VudCBwb2xpY3kgaGFzIGJlZW4gc3luY2VkLlwiKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ1tEZWZhdWx0QWNjb3VudF0gRmFpbGVkIHRvIHN5bmMgYWNjb3VudCBwb2xpY3knLCBlcnJvcik7XG5cdFx0XHRhd2FpdCBkaWFsb2dTZXJ2aWNlLmVycm9yKFxuXHRcdFx0XHRsb2NhbGl6ZSgnc3luY0FjY291bnRQb2xpY3kuZXJyb3InLCBcIkZhaWxlZCB0byBzeW5jIGFjY291bnQgcG9saWN5LlwiKSxcblx0XHRcdFx0ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxufVxuXG4vLyAtLS0gQWN0aW9ucyBSZWdpc3RyYXRpb25cbnJlZ2lzdGVyQWN0aW9uMihJbnNwZWN0Q29udGV4dEtleXNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZVNjcmVlbmNhc3RNb2RlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihMb2dTdG9yYWdlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihMb2dXb3JraW5nQ29waWVzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihSZW1vdmVMYXJnZVN0b3JhZ2VFbnRyaWVzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihQb2xpY3lEaWFnbm9zdGljc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU3luY0FjY291bnRQb2xpY3lBY3Rpb24pO1xuaWYgKCFwcm9kdWN0LmNvbW1pdCkge1xuXHRyZWdpc3RlckFjdGlvbjIoU3RhcnRUcmFja0Rpc3Bvc2FibGVzKTtcblx0cmVnaXN0ZXJBY3Rpb24yKFNuYXBzaG90VHJhY2tlZERpc3Bvc2FibGVzKTtcblx0cmVnaXN0ZXJBY3Rpb24yKFN0b3BUcmFja0Rpc3Bvc2FibGVzKTtcbn1cblxuLy8gLS0tIENvbmZpZ3VyYXRpb25cblxuLy8gU2NyZWVuIENhc3QgTW9kZVxuY29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0aWQ6ICdzY3JlZW5jYXN0TW9kZScsXG5cdG9yZGVyOiA5LFxuXHR0aXRsZTogbG9jYWxpemUoJ3NjcmVlbmNhc3RNb2RlQ29uZmlndXJhdGlvblRpdGxlJywgXCJTY3JlZW5jYXN0IE1vZGVcIiksXG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0J3NjcmVlbmNhc3RNb2RlLnZlcnRpY2FsT2Zmc2V0Jzoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZWZhdWx0OiAyMCxcblx0XHRcdG1pbmltdW06IDAsXG5cdFx0XHRtYXhpbXVtOiA5MCxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NyZWVuY2FzdE1vZGUubG9jYXRpb24udmVydGljYWxQb3NpdGlvbicsIFwiQ29udHJvbHMgdGhlIHZlcnRpY2FsIG9mZnNldCBvZiB0aGUgc2NyZWVuY2FzdCBtb2RlIG92ZXJsYXkgZnJvbSB0aGUgYm90dG9tIGFzIGEgcGVyY2VudGFnZSBvZiB0aGUgd29ya2JlbmNoIGhlaWdodC5cIilcblx0XHR9LFxuXHRcdCdzY3JlZW5jYXN0TW9kZS5mb250U2l6ZSc6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogNTYsXG5cdFx0XHRtaW5pbXVtOiAyMCxcblx0XHRcdG1heGltdW06IDEwMCxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NyZWVuY2FzdE1vZGUuZm9udFNpemUnLCBcIkNvbnRyb2xzIHRoZSBmb250IHNpemUgKGluIHBpeGVscykgb2YgdGhlIHNjcmVlbmNhc3QgbW9kZSBrZXlib2FyZC5cIilcblx0XHR9LFxuXHRcdCdzY3JlZW5jYXN0TW9kZS5rZXlib2FyZE9wdGlvbnMnOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NyZWVuY2FzdE1vZGUua2V5Ym9hcmRPcHRpb25zLmRlc2NyaXB0aW9uJywgXCJPcHRpb25zIGZvciBjdXN0b21pemluZyB0aGUga2V5Ym9hcmQgb3ZlcmxheSBpbiBzY3JlZW5jYXN0IG1vZGUuXCIpLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHQnc2hvd0tleXMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY3JlZW5jYXN0TW9kZS5rZXlib2FyZE9wdGlvbnMuc2hvd0tleXMnLCBcIlNob3cgcmF3IGtleXMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdzaG93S2V5YmluZGluZ3MnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY3JlZW5jYXN0TW9kZS5rZXlib2FyZE9wdGlvbnMuc2hvd0tleWJpbmRpbmdzJywgXCJTaG93IGtleWJvYXJkIHNob3J0Y3V0cy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J3Nob3dDb21tYW5kcyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NjcmVlbmNhc3RNb2RlLmtleWJvYXJkT3B0aW9ucy5zaG93Q29tbWFuZHMnLCBcIlNob3cgY29tbWFuZCBuYW1lcy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J3Nob3dDb21tYW5kR3JvdXBzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NjcmVlbmNhc3RNb2RlLmtleWJvYXJkT3B0aW9ucy5zaG93Q29tbWFuZEdyb3VwcycsIFwiU2hvdyBjb21tYW5kIGdyb3VwIG5hbWVzLCB3aGVuIGNvbW1hbmRzIGFyZSBhbHNvIHNob3duLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnc2hvd1NpbmdsZUVkaXRvckN1cnNvck1vdmVzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NyZWVuY2FzdE1vZGUua2V5Ym9hcmRPcHRpb25zLnNob3dTaW5nbGVFZGl0b3JDdXJzb3JNb3ZlcycsIFwiU2hvdyBzaW5nbGUgZWRpdG9yIGN1cnNvciBtb3ZlIGNvbW1hbmRzLlwiKVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHQnc2hvd0tleXMnOiB0cnVlLFxuXHRcdFx0XHQnc2hvd0tleWJpbmRpbmdzJzogdHJ1ZSxcblx0XHRcdFx0J3Nob3dDb21tYW5kcyc6IHRydWUsXG5cdFx0XHRcdCdzaG93Q29tbWFuZEdyb3Vwcyc6IGZhbHNlLFxuXHRcdFx0XHQnc2hvd1NpbmdsZUVkaXRvckN1cnNvck1vdmVzJzogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZVxuXHRcdH0sXG5cdFx0J3NjcmVlbmNhc3RNb2RlLmtleWJvYXJkT3ZlcmxheVRpbWVvdXQnOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlZmF1bHQ6IDgwMCxcblx0XHRcdG1pbmltdW06IDUwMCxcblx0XHRcdG1heGltdW06IDUwMDAsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NjcmVlbmNhc3RNb2RlLmtleWJvYXJkT3ZlcmxheVRpbWVvdXQnLCBcIkNvbnRyb2xzIGhvdyBsb25nIChpbiBtaWxsaXNlY29uZHMpIHRoZSBrZXlib2FyZCBvdmVybGF5IGlzIHNob3duIGluIHNjcmVlbmNhc3QgbW9kZS5cIilcblx0XHR9LFxuXHRcdCdzY3JlZW5jYXN0TW9kZS5tb3VzZUluZGljYXRvckNvbG9yJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRmb3JtYXQ6ICdjb2xvci1oZXgnLFxuXHRcdFx0ZGVmYXVsdDogJyNGRjAwMDAnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY3JlZW5jYXN0TW9kZS5tb3VzZUluZGljYXRvckNvbG9yJywgXCJDb250cm9scyB0aGUgY29sb3IgaW4gaGV4ICgjUkdCLCAjUkdCQSwgI1JSR0dCQiBvciAjUlJHR0JCQUEpIG9mIHRoZSBtb3VzZSBpbmRpY2F0b3IgaW4gc2NyZWVuY2FzdCBtb2RlLlwiKVxuXHRcdH0sXG5cdFx0J3NjcmVlbmNhc3RNb2RlLm1vdXNlSW5kaWNhdG9yU2l6ZSc6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogMjAsXG5cdFx0XHRtaW5pbXVtOiAyMCxcblx0XHRcdG1heGltdW06IDEwMCxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NyZWVuY2FzdE1vZGUubW91c2VJbmRpY2F0b3JTaXplJywgXCJDb250cm9scyB0aGUgc2l6ZSAoaW4gcGl4ZWxzKSBvZiB0aGUgbW91c2UgaW5kaWNhdG9yIGluIHNjcmVlbmNhc3QgbW9kZS5cIilcblx0XHR9LFxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU87QUFFUCxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0JBQWtCO0FBQzNCLFNB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
