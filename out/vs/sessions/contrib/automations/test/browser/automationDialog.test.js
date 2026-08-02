import assert from "assert";
import * as DOM from "../../../../../base/browser/dom.js";
import { DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Action } from "../../../../../base/common/actions.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { GitRefType, IGitService } from "../../../../../workbench/contrib/git/common/gitService.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { AutomationIsolationGroupActionViewItem, canSelectAutomationWorkspace, isAutomationDialogPopupTarget, registerAutomationDialogKeyboardNavigation, resolveAutomationModelIdentifier, updateSaveButtonState } from "../../browser/automationDialog.js";
import { AutomationIsolationModel } from "../../common/isolationGroupModel.js";
const FOLDER = URI.file("/workspace");
function dispatchKey(target, type, key, shiftKey = false) {
  const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true, shiftKey });
  target.dispatchEvent(event);
  return event;
}
class RecordingActionWidgetService extends mock() {
  constructor() {
    super(...arguments);
    this.isVisible = false;
    this.labels = [];
    this.details = [];
    this.ariaLabels = [];
  }
  show(_user, _supportsPreview, items, delegate, _anchor, _container, _actionBarActions, accessibilityProvider, _listOptions) {
    this.isVisible = true;
    this.labels = items.map((item) => item.label ?? "");
    this.details = items.map((item) => item.detail);
    this.ariaLabels = items.map((item) => {
      const label = accessibilityProvider?.getAriaLabel?.(item);
      return typeof label === "string" ? label : label?.get() ?? "";
    });
    this.selectItem = (label) => {
      const item = items.find((candidate) => candidate.label === label)?.item;
      if (item) {
        delegate.onSelect(item);
      }
    };
    this.hideWidget = delegate.onHide;
  }
  updateItems(items, _focusItemId) {
    this.labels = items.map((item) => item.label ?? "");
  }
  focusItemById(_itemId) {
  }
  hide(didCancel) {
    if (!this.isVisible) {
      return;
    }
    this.isVisible = false;
    const onHide = this.hideWidget;
    this.hideWidget = void 0;
    onHide?.(didCancel);
  }
  select(label) {
    this.selectItem?.(label);
  }
}
function createFormState(overrides) {
  return {
    name: "Automation",
    interval: "daily",
    hour: 9,
    minute: 0,
    day: 1,
    isQuickChat: false,
    folderUri: FOLDER,
    providerId: "default-copilot",
    sessionTypeId: "copilotcli",
    isolationMode: "worktree",
    branch: void 0,
    enabled: true,
    ...overrides
  };
}
function createWorkspace(requiresWorkspaceTrust) {
  return {
    uri: FOLDER,
    label: "Workspace",
    icon: Codicon.folder,
    folders: [{ root: FOLDER, workingDirectory: FOLDER, name: "Workspace", description: void 0 }],
    requiresWorkspaceTrust,
    isVirtualWorkspace: false
  };
}
suite("Automation workspace trust", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("rejects an unresolved workspace using the preferred provider", async () => {
    const resolveRequests = [];
    const trustRequests = [];
    const result = await canSelectAutomationWorkspace(
      FOLDER,
      "preferred",
      upcastPartial({
        resolveWorkspace: (folderUri, preferredProviderId) => {
          resolveRequests.push({ folderUri: folderUri.toString(), preferredProviderId });
          return void 0;
        }
      }),
      upcastPartial({
        requestResourcesTrust: async (options) => {
          trustRequests.push(options);
          return true;
        }
      })
    );
    assert.deepStrictEqual({
      result,
      resolveRequests,
      trustRequestCount: trustRequests.length
    }, {
      result: false,
      resolveRequests: [{ folderUri: FOLDER.toString(), preferredProviderId: "preferred" }],
      trustRequestCount: 0
    });
  });
  test("accepts a workspace that does not require trust without prompting", async () => {
    const trustRequests = [];
    const result = await canSelectAutomationWorkspace(
      FOLDER,
      "preferred",
      upcastPartial({
        resolveWorkspace: () => ({ providerId: "preferred", workspace: createWorkspace(false) })
      }),
      upcastPartial({
        requestResourcesTrust: async (options) => {
          trustRequests.push(options);
          return false;
        }
      })
    );
    assert.deepStrictEqual({
      result,
      trustRequestCount: trustRequests.length
    }, {
      result: true,
      trustRequestCount: 0
    });
  });
  for (const trustResult of [true, false, void 0]) {
    test(`returns ${trustResult === true ? "true when trust is granted" : "false when trust is " + (trustResult === false ? "declined" : "cancelled")}`, async () => {
      const trustRequests = [];
      const result = await canSelectAutomationWorkspace(
        FOLDER,
        "preferred",
        upcastPartial({
          resolveWorkspace: () => ({ providerId: "preferred", workspace: createWorkspace(true) })
        }),
        upcastPartial({
          requestResourcesTrust: async (options) => {
            trustRequests.push(options);
            return trustResult;
          }
        })
      );
      assert.deepStrictEqual({
        result,
        trustRequests: trustRequests.map((request) => ({
          uri: request.uri.toString(),
          message: request.message
        }))
      }, {
        result: trustResult === true,
        trustRequests: [{
          uri: FOLDER.toString(),
          message: "An agent session will be able to read files, run commands, and make changes in this folder."
        }]
      });
    });
  }
});
suite("Automation branch picker", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createItem(options) {
    const state = options?.state ?? createFormState();
    const model = new AutomationIsolationModel(state);
    const repositoryState = observableValue("repositoryState", {
      HEAD: { type: GitRefType.Head, name: "main", commit: "abc123" },
      remotes: [],
      mergeChanges: [],
      indexChanges: [],
      workingTreeChanges: [],
      untrackedChanges: []
    });
    const repository = upcastPartial({
      rootUri: FOLDER,
      state: repositoryState,
      getRefs: options?.getRefs ?? (async () => [
        { type: GitRefType.Head, name: "feature/z" },
        { type: GitRefType.Head, name: "main" },
        { type: GitRefType.Head, name: "feature/a" },
        { type: GitRefType.Head, name: "copilot-worktree-generated" }
      ])
    });
    const actionWidgetService = new RecordingActionWidgetService();
    const visible = observableValue("repositoryControlsVisible", options?.visible ?? true);
    let openRepositoryAttempts = 0;
    let providerAvailable = !options?.providerInitiallyUnavailable;
    const sessionTypesChanged = disposables.add(new Emitter());
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IActionWidgetService, actionWidgetService);
    instantiationService.stub(IGitService, upcastPartial({
      openRepository: async () => {
        openRepositoryAttempts++;
        if (options?.failOpenRepositoryOnce && openRepositoryAttempts === 1) {
          throw new Error("failed to open repository");
        }
        return repository;
      }
    }));
    instantiationService.stub(ISessionsManagementService, upcastPartial({
      onDidChangeSessionTypes: sessionTypesChanged.event,
      getSessionTypesForFolder: () => providerAvailable ? [{
        providerId: state.providerId ?? "default-copilot",
        sessionType: {
          id: state.sessionTypeId ?? "copilotcli",
          label: "Copilot",
          icon: Codicon.copilot,
          supportsWorktreeConfiguration: state.sessionTypeId === "copilotcli"
        }
      }] : []
    }));
    instantiationService.stub(ILogService, new NullLogService());
    const action = disposables.add(new Action("test.automationIsolation", "Automation Isolation"));
    const item = disposables.add(instantiationService.createInstance(
      AutomationIsolationGroupActionViewItem,
      action,
      state,
      model,
      model.folderUriObs,
      Event.None,
      options?.revalidate ?? (() => {
      }),
      void 0,
      visible
    ));
    const container = document.createElement("div");
    item.render(container);
    return {
      container,
      state,
      model,
      actionWidgetService,
      getOpenRepositoryAttempts: () => openRepositoryAttempts,
      setProviderAvailable: () => {
        providerAvailable = true;
        sessionTypesChanged.fire();
      }
    };
  }
  test("opens sorted local branches and persists the selected Worktree branch", async () => {
    const { container, model, actionWidgetService } = createItem();
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    trigger.click();
    assert.deepStrictEqual(actionWidgetService.labels, ["feature/a", "feature/z", "main"]);
    actionWidgetService.select("feature/z");
    assert.deepStrictEqual({
      branch: model.persistedBranch,
      expanded: trigger.getAttribute("aria-expanded"),
      disabled: trigger.getAttribute("aria-disabled"),
      role: trigger.getAttribute("role"),
      hasPopup: trigger.getAttribute("aria-haspopup")
    }, {
      branch: "feature/z",
      expanded: "false",
      disabled: "false",
      role: "button",
      hasPopup: "listbox"
    });
  });
  test("keeps an edited branch that is no longer available locally", async () => {
    const { container, model, actionWidgetService } = createItem({
      state: createFormState({ branch: "feature/deleted" })
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    trigger.click();
    assert.deepStrictEqual({
      label: trigger.querySelector(".automation-form-branch-name")?.textContent,
      persistedBranch: model.persistedBranch,
      pickerItems: actionWidgetService.labels,
      ariaLabels: actionWidgetService.ariaLabels
    }, {
      label: "feature/deleted",
      persistedBranch: "feature/deleted",
      pickerItems: ["feature/deleted", "feature/a", "feature/z", "main"],
      ariaLabels: ["feature/deleted, unavailable locally", "feature/a", "feature/z", "main"]
    });
  });
  test("keeps Folder branch status read-only", async () => {
    const { container, actionWidgetService } = createItem({
      state: createFormState({ isolationMode: "workspace", branch: "stale-head" })
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    trigger.click();
    assert.deepStrictEqual({
      label: trigger.querySelector(".automation-form-branch-name")?.textContent,
      disabled: trigger.getAttribute("aria-disabled"),
      hasChevron: !!trigger.querySelector(".codicon-chevron-down"),
      pickerVisible: actionWidgetService.isVisible,
      role: trigger.getAttribute("role"),
      hasPopup: trigger.getAttribute("aria-haspopup"),
      tabIndex: trigger.tabIndex
    }, {
      label: "main",
      disabled: "true",
      hasChevron: false,
      pickerVisible: false,
      role: null,
      hasPopup: null,
      tabIndex: -1
    });
  });
  test("offers retry after a branch load failure", async () => {
    let attempts = 0;
    const { container, actionWidgetService } = createItem({
      getRefs: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error("failed");
        }
        return [{ type: GitRefType.Head, name: "main" }];
      }
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    trigger.click();
    assert.deepStrictEqual(actionWidgetService.labels, ["Retry Loading Branches"]);
    actionWidgetService.select("Retry Loading Branches");
    await timeout(0);
    trigger.click();
    assert.deepStrictEqual({
      attempts,
      labels: actionWidgetService.labels
    }, {
      attempts: 2,
      labels: ["main"]
    });
  });
  test("keeps the picker disabled while branches load and enables it when ready", async () => {
    const refs = new DeferredPromise();
    const { container, actionWidgetService } = createItem({
      getRefs: async () => refs.p
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    trigger.click();
    assert.deepStrictEqual({
      disabled: trigger.getAttribute("aria-disabled"),
      pickerVisible: actionWidgetService.isVisible
    }, {
      disabled: "true",
      pickerVisible: false
    });
    await refs.complete([{ type: GitRefType.Head, name: "main" }]);
    await timeout(0);
    trigger.click();
    assert.deepStrictEqual({
      disabled: trigger.getAttribute("aria-disabled"),
      labels: actionWidgetService.labels
    }, {
      disabled: "false",
      labels: ["main"]
    });
  });
  test("explains that Worktree is unavailable while branches load", async () => {
    const refs = new DeferredPromise();
    const { container } = createItem({
      state: createFormState({ isolationMode: "workspace" }),
      getRefs: async () => refs.p
    });
    await timeout(0);
    const checkbox = container.querySelector(".sessions-chat-isolation-checkbox .monaco-checkbox");
    assert.ok(checkbox);
    assert.deepStrictEqual({
      checked: checkbox.getAttribute("aria-checked"),
      disabled: checkbox.getAttribute("aria-disabled")
    }, {
      checked: "false",
      disabled: "true"
    });
    await refs.complete([{ type: GitRefType.Head, name: "main" }]);
  });
  test("offers retry when opening the repository fails in Folder mode", async () => {
    const { container, actionWidgetService, getOpenRepositoryAttempts } = createItem({
      state: createFormState({ isolationMode: "workspace" }),
      failOpenRepositoryOnce: true
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    trigger.click();
    assert.deepStrictEqual(actionWidgetService.labels, ["Retry Loading Branches"]);
    actionWidgetService.select("Retry Loading Branches");
    await timeout(0);
    assert.deepStrictEqual({
      attempts: getOpenRepositoryAttempts(),
      label: trigger.querySelector(".automation-form-branch-name")?.textContent
    }, {
      attempts: 2,
      label: "main"
    });
  });
  test("resolves providerless session-type picks before gating Worktree configuration", async () => {
    const { container } = createItem({
      state: createFormState({ providerId: void 0 })
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    assert.deepStrictEqual({
      disabled: trigger.getAttribute("aria-disabled"),
      label: trigger.querySelector(".automation-form-branch-name")?.textContent
    }, {
      disabled: "false",
      label: "main"
    });
  });
  test("normalizes unsupported Worktree targets back to Folder mode", async () => {
    const { container, model } = createItem({
      state: createFormState({ sessionTypeId: "claude-code", branch: "feature/saved" })
    });
    await timeout(0);
    const checkbox = container.querySelector(".sessions-chat-isolation-checkbox .monaco-checkbox");
    assert.ok(checkbox);
    assert.deepStrictEqual({
      mode: model.isolationMode,
      branch: model.persistedBranch,
      checked: checkbox.getAttribute("aria-checked")
    }, {
      mode: "workspace",
      branch: void 0,
      checked: "false"
    });
  });
  test("enables Worktree branches for agent-host Copilot CLI", async () => {
    const { container } = createItem({
      state: createFormState({ providerId: "local-agent-host", sessionTypeId: "copilotcli" })
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    assert.deepStrictEqual({
      disabled: trigger.getAttribute("aria-disabled"),
      label: trigger.querySelector(".automation-form-branch-name")?.textContent
    }, {
      disabled: "false",
      label: "main"
    });
  });
  test("preserves Worktree intent while the provider is discovered late", async () => {
    const { container, model, setProviderAvailable } = createItem({
      state: createFormState({ branch: "feature/saved" }),
      providerInitiallyUnavailable: true
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    assert.deepStrictEqual({
      mode: model.isolationMode,
      selectedBranch: model.selectedBranch,
      persistedBranch: model.persistedBranch,
      reason: trigger.getAttribute("aria-label")
    }, {
      mode: "worktree",
      selectedBranch: "feature/saved",
      persistedBranch: void 0,
      reason: "feature/saved. Session capabilities are loading."
    });
    setProviderAvailable();
    assert.deepStrictEqual({
      mode: model.isolationMode,
      persistedBranch: model.persistedBranch,
      disabled: trigger.getAttribute("aria-disabled")
    }, {
      mode: "worktree",
      persistedBranch: "feature/saved",
      disabled: "false"
    });
  });
  test("requires a branch before saving Worktree isolation", () => {
    const state = createFormState({ branch: void 0 });
    const validation = {
      nameError: void 0,
      promptError: void 0,
      folderError: void 0,
      sessionTypeError: void 0,
      branchError: void 0
    };
    const form = document.createElement("form");
    updateSaveButtonState(void 0, state, validation, form, () => "prompt", () => void 0);
    assert.strictEqual(validation.branchError, "A branch is required for Worktree isolation.");
    updateSaveButtonState(void 0, state, validation, form, () => "prompt", () => "main");
    assert.strictEqual(validation.branchError, void 0);
  });
  test("allows a workspace-less target without a folder and still requires a session type", () => {
    const state = createFormState({ isQuickChat: true, folderUri: void 0, isolationMode: void 0, branch: void 0 });
    const validation = {
      nameError: void 0,
      promptError: void 0,
      folderError: void 0,
      sessionTypeError: void 0,
      branchError: void 0
    };
    const form = document.createElement("form");
    updateSaveButtonState(void 0, state, validation, form, () => "prompt", () => void 0);
    const validTarget = { ...validation };
    state.providerId = void 0;
    state.sessionTypeId = void 0;
    updateSaveButtonState(void 0, state, validation, form, () => "prompt", () => void 0);
    assert.deepStrictEqual({
      validTarget,
      missingTarget: validation
    }, {
      validTarget: {
        nameError: void 0,
        promptError: void 0,
        folderError: void 0,
        sessionTypeError: void 0,
        branchError: void 0
      },
      missingTarget: {
        nameError: void 0,
        promptError: void 0,
        folderError: void 0,
        sessionTypeError: "Session type is required.",
        branchError: void 0
      }
    });
  });
  test("allows workspace-backed legacy targets without a provider id", () => {
    const state = createFormState({ providerId: void 0, isolationMode: "workspace" });
    const validation = {
      nameError: void 0,
      promptError: void 0,
      folderError: void 0,
      sessionTypeError: void 0,
      branchError: void 0
    };
    updateSaveButtonState(void 0, state, validation, document.createElement("form"), () => "prompt", () => void 0);
    assert.deepStrictEqual(validation, {
      nameError: void 0,
      promptError: void 0,
      folderError: void 0,
      sessionTypeError: void 0,
      branchError: void 0
    });
  });
  test("hides repository controls for workspace-less targets", async () => {
    const state = createFormState({
      isQuickChat: true,
      folderUri: void 0,
      isolationMode: "worktree",
      branch: "feature/stale"
    });
    const { container, model } = createItem({ state, visible: false });
    await timeout(0);
    assert.deepStrictEqual({
      display: container.style.display,
      ariaHidden: container.getAttribute("aria-hidden"),
      folderUri: model.folderUri,
      isolationMode: state.isolationMode,
      branch: model.persistedBranch
    }, {
      display: "none",
      ariaHidden: "true",
      folderUri: void 0,
      isolationMode: void 0,
      branch: void 0
    });
  });
  test("reloads repository state when returning to workspace mode", async () => {
    const state = createFormState({
      isQuickChat: true,
      folderUri: void 0,
      isolationMode: void 0,
      branch: void 0
    });
    const { container, model, getOpenRepositoryAttempts } = createItem({ state, visible: true });
    await timeout(0);
    assert.strictEqual(getOpenRepositoryAttempts(), 0);
    model.setQuickChat(false, FOLDER);
    await timeout(0);
    assert.deepStrictEqual({
      attempts: getOpenRepositoryAttempts(),
      folderUri: model.folderUri?.toString(),
      branch: container.querySelector(".automation-form-branch-name")?.textContent,
      supportsWorktreeConfiguration: model.supportsWorktreeConfiguration
    }, {
      attempts: 1,
      folderUri: FOLDER.toString(),
      branch: "main",
      supportsWorktreeConfiguration: true
    });
  });
  test("allows focus in mobile picker sheets", () => {
    const sheet = document.createElement("div");
    sheet.classList.add("mobile-picker-sheet");
    const item = sheet.appendChild(document.createElement("button"));
    assert.strictEqual(isAutomationDialogPopupTarget(item), true);
  });
  test("resolves a legacy model identifier to the selected concrete target", () => {
    const legacyIdentifier = "copilotcli/gpt-5.6-sol";
    const concreteIdentifier = "agent-host-copilotcli:gpt-5.6-sol";
    const unrelatedIdentifier = "other/gpt-5.6-sol";
    const modelIds = [legacyIdentifier, unrelatedIdentifier];
    const models = /* @__PURE__ */ new Map([
      [legacyIdentifier, upcastPartial({ id: "gpt-5.6-sol", targetChatSessionType: "copilotcli" })],
      [concreteIdentifier, upcastPartial({ id: "gpt-5.6-sol", targetChatSessionType: "agent-host-copilotcli" })],
      [unrelatedIdentifier, upcastPartial({ id: "gpt-5.6-sol", targetChatSessionType: "other" })]
    ]);
    const languageModelsService = upcastPartial({
      getLanguageModelIds: () => modelIds,
      lookupLanguageModel: (identifier) => models.get(identifier)
    });
    const beforeConcreteTargetArrives = resolveAutomationModelIdentifier(languageModelsService, legacyIdentifier, "copilotcli", "agent-host-copilotcli");
    modelIds.push(concreteIdentifier);
    assert.deepStrictEqual({
      beforeConcreteTargetArrives,
      afterConcreteTargetArrives: resolveAutomationModelIdentifier(languageModelsService, legacyIdentifier, "copilotcli", "agent-host-copilotcli"),
      alreadyConcrete: resolveAutomationModelIdentifier(languageModelsService, concreteIdentifier, "copilotcli", "agent-host-copilotcli"),
      unrelated: resolveAutomationModelIdentifier(languageModelsService, unrelatedIdentifier, "copilotcli", "agent-host-copilotcli")
    }, {
      beforeConcreteTargetArrives: legacyIdentifier,
      afterConcreteTargetArrives: concreteIdentifier,
      alreadyConcrete: concreteIdentifier,
      unrelated: unrelatedIdentifier
    });
  });
});
suite("Automation dialog keyboard navigation", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("cycles through visible dialog controls", () => {
    const container = document.createElement("div");
    document.body.append(container);
    disposables.add({ dispose: () => container.remove() });
    const targetWindow = DOM.getWindow(container);
    const first = container.appendChild(document.createElement("input"));
    const hiddenContainer = container.appendChild(document.createElement("div"));
    hiddenContainer.style.display = "none";
    const hidden = hiddenContainer.appendChild(document.createElement("input"));
    const wrapper = container.appendChild(document.createElement("div"));
    wrapper.tabIndex = 0;
    const second = wrapper.appendChild(document.createElement("button"));
    const third = container.appendChild(document.createElement("button"));
    const navigation = disposables.add(registerAutomationDialogKeyboardNavigation(
      targetWindow,
      () => [first, hidden, wrapper, second, third],
      () => false
    ));
    let downstreamKeyDowns = 0;
    disposables.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_DOWN, () => downstreamKeyDowns++, true));
    navigation.focusFirst();
    dispatchKey(first, "keydown", "Tab");
    second.focus();
    dispatchKey(second, "keydown", "Tab");
    assert.deepStrictEqual({
      activeElement: document.activeElement,
      downstreamKeyDowns
    }, {
      activeElement: third,
      downstreamKeyDowns: 0
    });
  });
  test("leaves popup keydown handling active and suppresses its Escape keyup", () => {
    const container = document.createElement("div");
    document.body.append(container);
    disposables.add({ dispose: () => container.remove() });
    const targetWindow = DOM.getWindow(container);
    const trigger = container.appendChild(document.createElement("button"));
    const popup = container.appendChild(document.createElement("div"));
    const popupInput = popup.appendChild(document.createElement("input"));
    disposables.add(registerAutomationDialogKeyboardNavigation(
      targetWindow,
      () => [trigger],
      (target) => popup.contains(target)
    ));
    let downstreamKeyDowns = 0;
    let downstreamKeyUps = 0;
    disposables.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_DOWN, () => downstreamKeyDowns++, true));
    disposables.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_UP, () => downstreamKeyUps++, true));
    popupInput.focus();
    dispatchKey(popupInput, "keydown", "Escape");
    trigger.focus();
    dispatchKey(trigger, "keyup", "Escape");
    dispatchKey(trigger, "keydown", "Escape");
    dispatchKey(trigger, "keyup", "Escape");
    assert.deepStrictEqual({
      downstreamKeyDowns,
      downstreamKeyUps
    }, {
      downstreamKeyDowns: 2,
      downstreamKeyUps: 1
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYXV0b21hdGlvbnMvdGVzdC9icm93c2VyL2F1dG9tYXRpb25EaWFsb2cudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jaywgdXBjYXN0UGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IElBY3Rpb25MaXN0RGVsZWdhdGUsIElBY3Rpb25MaXN0SXRlbSwgSUFjdGlvbkxpc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJQW5jaG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSwgUmVzb3VyY2VUcnVzdFJlcXVlc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IEdpdFJlZlR5cGUsIElHaXRSZXBvc2l0b3J5LCBJR2l0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2dpdC9jb21tb24vZ2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbldvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uSXNvbGF0aW9uR3JvdXBBY3Rpb25WaWV3SXRlbSwgY2FuU2VsZWN0QXV0b21hdGlvbldvcmtzcGFjZSwgSUZvcm1TdGF0ZSwgSVZhbGlkYXRpb25TdGF0ZSwgaXNBdXRvbWF0aW9uRGlhbG9nUG9wdXBUYXJnZXQsIHJlZ2lzdGVyQXV0b21hdGlvbkRpYWxvZ0tleWJvYXJkTmF2aWdhdGlvbiwgcmVzb2x2ZUF1dG9tYXRpb25Nb2RlbElkZW50aWZpZXIsIHVwZGF0ZVNhdmVCdXR0b25TdGF0ZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYXV0b21hdGlvbkRpYWxvZy5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vaXNvbGF0aW9uR3JvdXBNb2RlbC5qcyc7XG5cbmNvbnN0IEZPTERFUiA9IFVSSS5maWxlKCcvd29ya3NwYWNlJyk7XG5cbmZ1bmN0aW9uIGRpc3BhdGNoS2V5KHRhcmdldDogSFRNTEVsZW1lbnQsIHR5cGU6ICdrZXlkb3duJyB8ICdrZXl1cCcsIGtleTogc3RyaW5nLCBzaGlmdEtleSA9IGZhbHNlKTogS2V5Ym9hcmRFdmVudCB7XG5cdGNvbnN0IGV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQodHlwZSwgeyBrZXksIGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUsIHNoaWZ0S2V5IH0pO1xuXHR0YXJnZXQuZGlzcGF0Y2hFdmVudChldmVudCk7XG5cdHJldHVybiBldmVudDtcbn1cblxuY2xhc3MgUmVjb3JkaW5nQWN0aW9uV2lkZ2V0U2VydmljZSBleHRlbmRzIG1vY2s8SUFjdGlvbldpZGdldFNlcnZpY2U+KCkge1xuXHRvdmVycmlkZSBpc1Zpc2libGUgPSBmYWxzZTtcblx0bGFiZWxzOiByZWFkb25seSBzdHJpbmdbXSA9IFtdO1xuXHRkZXRhaWxzOiBSZWFkb25seUFycmF5PElBY3Rpb25MaXN0SXRlbTx1bmtub3duPlsnZGV0YWlsJ10+ID0gW107XG5cdGFyaWFMYWJlbHM6IHJlYWRvbmx5IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgc2VsZWN0SXRlbTogKChsYWJlbDogc3RyaW5nKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBoaWRlV2lkZ2V0OiAoKGRpZENhbmNlbD86IGJvb2xlYW4pID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIHNob3c8VD4oXG5cdFx0X3VzZXI6IHN0cmluZyxcblx0XHRfc3VwcG9ydHNQcmV2aWV3OiBib29sZWFuLFxuXHRcdGl0ZW1zOiByZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08VD5bXSxcblx0XHRkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxUPixcblx0XHRfYW5jaG9yOiBIVE1MRWxlbWVudCB8IFN0YW5kYXJkTW91c2VFdmVudCB8IElBbmNob3IsXG5cdFx0X2NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQsXG5cdFx0X2FjdGlvbkJhckFjdGlvbnM6IHJlYWRvbmx5IElBY3Rpb25bXSxcblx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI/OiBQYXJ0aWFsPElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPElBY3Rpb25MaXN0SXRlbTxUPj4+LFxuXHRcdF9saXN0T3B0aW9ucz86IElBY3Rpb25MaXN0T3B0aW9ucyxcblx0KTogdm9pZCB7XG5cdFx0dGhpcy5pc1Zpc2libGUgPSB0cnVlO1xuXHRcdHRoaXMubGFiZWxzID0gaXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5sYWJlbCA/PyAnJyk7XG5cdFx0dGhpcy5kZXRhaWxzID0gaXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5kZXRhaWwpO1xuXHRcdHRoaXMuYXJpYUxhYmVscyA9IGl0ZW1zLm1hcChpdGVtID0+IHtcblx0XHRcdGNvbnN0IGxhYmVsID0gYWNjZXNzaWJpbGl0eVByb3ZpZGVyPy5nZXRBcmlhTGFiZWw/LihpdGVtKTtcblx0XHRcdHJldHVybiB0eXBlb2YgbGFiZWwgPT09ICdzdHJpbmcnID8gbGFiZWwgOiBsYWJlbD8uZ2V0KCkgPz8gJyc7XG5cdFx0fSk7XG5cdFx0dGhpcy5zZWxlY3RJdGVtID0gbGFiZWwgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbSA9IGl0ZW1zLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5sYWJlbCA9PT0gbGFiZWwpPy5pdGVtO1xuXHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0ZGVsZWdhdGUub25TZWxlY3QoaXRlbSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLmhpZGVXaWRnZXQgPSBkZWxlZ2F0ZS5vbkhpZGU7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVJdGVtczxUPihpdGVtczogcmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPFQ+W10sIF9mb2N1c0l0ZW1JZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMubGFiZWxzID0gaXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5sYWJlbCA/PyAnJyk7XG5cdH1cblx0b3ZlcnJpZGUgZm9jdXNJdGVtQnlJZChfaXRlbUlkOiBzdHJpbmcpOiB2b2lkIHsgfVxuXG5cdG92ZXJyaWRlIGhpZGUoZGlkQ2FuY2VsPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5pc1Zpc2libGUgPSBmYWxzZTtcblx0XHRjb25zdCBvbkhpZGUgPSB0aGlzLmhpZGVXaWRnZXQ7XG5cdFx0dGhpcy5oaWRlV2lkZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdG9uSGlkZT8uKGRpZENhbmNlbCk7XG5cdH1cblxuXHRzZWxlY3QobGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuc2VsZWN0SXRlbT8uKGxhYmVsKTtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVGb3JtU3RhdGUob3ZlcnJpZGVzPzogUGFydGlhbDxJRm9ybVN0YXRlPik6IElGb3JtU3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdG5hbWU6ICdBdXRvbWF0aW9uJyxcblx0XHRpbnRlcnZhbDogJ2RhaWx5Jyxcblx0XHRob3VyOiA5LFxuXHRcdG1pbnV0ZTogMCxcblx0XHRkYXk6IDEsXG5cdFx0aXNRdWlja0NoYXQ6IGZhbHNlLFxuXHRcdGZvbGRlclVyaTogRk9MREVSLFxuXHRcdHByb3ZpZGVySWQ6ICdkZWZhdWx0LWNvcGlsb3QnLFxuXHRcdHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyxcblx0XHRpc29sYXRpb25Nb2RlOiAnd29ya3RyZWUnLFxuXHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVXb3Jrc3BhY2UocmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogYm9vbGVhbik6IElTZXNzaW9uV29ya3NwYWNlIHtcblx0cmV0dXJuIHtcblx0XHR1cmk6IEZPTERFUixcblx0XHRsYWJlbDogJ1dvcmtzcGFjZScsXG5cdFx0aWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0Zm9sZGVyczogW3sgcm9vdDogRk9MREVSLCB3b3JraW5nRGlyZWN0b3J5OiBGT0xERVIsIG5hbWU6ICdXb3Jrc3BhY2UnLCBkZXNjcmlwdGlvbjogdW5kZWZpbmVkIH1dLFxuXHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3QsXG5cdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0fTtcbn1cblxuc3VpdGUoJ0F1dG9tYXRpb24gd29ya3NwYWNlIHRydXN0JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZWplY3RzIGFuIHVucmVzb2x2ZWQgd29ya3NwYWNlIHVzaW5nIHRoZSBwcmVmZXJyZWQgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb2x2ZVJlcXVlc3RzOiBBcnJheTx7IGZvbGRlclVyaTogc3RyaW5nOyBwcmVmZXJyZWRQcm92aWRlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQgfT4gPSBbXTtcblx0XHRjb25zdCB0cnVzdFJlcXVlc3RzOiBSZXNvdXJjZVRydXN0UmVxdWVzdE9wdGlvbnNbXSA9IFtdO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNhblNlbGVjdEF1dG9tYXRpb25Xb3Jrc3BhY2UoXG5cdFx0XHRGT0xERVIsXG5cdFx0XHQncHJlZmVycmVkJyxcblx0XHRcdHVwY2FzdFBhcnRpYWw8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KHtcblx0XHRcdFx0cmVzb2x2ZVdvcmtzcGFjZTogKGZvbGRlclVyaSwgcHJlZmVycmVkUHJvdmlkZXJJZCkgPT4ge1xuXHRcdFx0XHRcdHJlc29sdmVSZXF1ZXN0cy5wdXNoKHsgZm9sZGVyVXJpOiBmb2xkZXJVcmkudG9TdHJpbmcoKSwgcHJlZmVycmVkUHJvdmlkZXJJZCB9KTtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0XHR1cGNhc3RQYXJ0aWFsPElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlPih7XG5cdFx0XHRcdHJlcXVlc3RSZXNvdXJjZXNUcnVzdDogYXN5bmMgb3B0aW9ucyA9PiB7XG5cdFx0XHRcdFx0dHJ1c3RSZXF1ZXN0cy5wdXNoKG9wdGlvbnMpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0LFxuXHRcdFx0cmVzb2x2ZVJlcXVlc3RzLFxuXHRcdFx0dHJ1c3RSZXF1ZXN0Q291bnQ6IHRydXN0UmVxdWVzdHMubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDogZmFsc2UsXG5cdFx0XHRyZXNvbHZlUmVxdWVzdHM6IFt7IGZvbGRlclVyaTogRk9MREVSLnRvU3RyaW5nKCksIHByZWZlcnJlZFByb3ZpZGVySWQ6ICdwcmVmZXJyZWQnIH1dLFxuXHRcdFx0dHJ1c3RSZXF1ZXN0Q291bnQ6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY2VwdHMgYSB3b3Jrc3BhY2UgdGhhdCBkb2VzIG5vdCByZXF1aXJlIHRydXN0IHdpdGhvdXQgcHJvbXB0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRydXN0UmVxdWVzdHM6IFJlc291cmNlVHJ1c3RSZXF1ZXN0T3B0aW9uc1tdID0gW107XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY2FuU2VsZWN0QXV0b21hdGlvbldvcmtzcGFjZShcblx0XHRcdEZPTERFUixcblx0XHRcdCdwcmVmZXJyZWQnLFxuXHRcdFx0dXBjYXN0UGFydGlhbDxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oe1xuXHRcdFx0XHRyZXNvbHZlV29ya3NwYWNlOiAoKSA9PiAoeyBwcm92aWRlcklkOiAncHJlZmVycmVkJywgd29ya3NwYWNlOiBjcmVhdGVXb3Jrc3BhY2UoZmFsc2UpIH0pLFxuXHRcdFx0fSksXG5cdFx0XHR1cGNhc3RQYXJ0aWFsPElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlPih7XG5cdFx0XHRcdHJlcXVlc3RSZXNvdXJjZXNUcnVzdDogYXN5bmMgb3B0aW9ucyA9PiB7XG5cdFx0XHRcdFx0dHJ1c3RSZXF1ZXN0cy5wdXNoKG9wdGlvbnMpO1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fSxcblx0XHRcdH0pLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdCxcblx0XHRcdHRydXN0UmVxdWVzdENvdW50OiB0cnVzdFJlcXVlc3RzLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IHRydWUsXG5cdFx0XHR0cnVzdFJlcXVlc3RDb3VudDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0Zm9yIChjb25zdCB0cnVzdFJlc3VsdCBvZiBbdHJ1ZSwgZmFsc2UsIHVuZGVmaW5lZF0pIHtcblx0XHR0ZXN0KGByZXR1cm5zICR7dHJ1c3RSZXN1bHQgPT09IHRydWUgPyAndHJ1ZSB3aGVuIHRydXN0IGlzIGdyYW50ZWQnIDogJ2ZhbHNlIHdoZW4gdHJ1c3QgaXMgJyArICh0cnVzdFJlc3VsdCA9PT0gZmFsc2UgPyAnZGVjbGluZWQnIDogJ2NhbmNlbGxlZCcpfWAsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRydXN0UmVxdWVzdHM6IFJlc291cmNlVHJ1c3RSZXF1ZXN0T3B0aW9uc1tdID0gW107XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjYW5TZWxlY3RBdXRvbWF0aW9uV29ya3NwYWNlKFxuXHRcdFx0XHRGT0xERVIsXG5cdFx0XHRcdCdwcmVmZXJyZWQnLFxuXHRcdFx0XHR1cGNhc3RQYXJ0aWFsPElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlPih7XG5cdFx0XHRcdFx0cmVzb2x2ZVdvcmtzcGFjZTogKCkgPT4gKHsgcHJvdmlkZXJJZDogJ3ByZWZlcnJlZCcsIHdvcmtzcGFjZTogY3JlYXRlV29ya3NwYWNlKHRydWUpIH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0dXBjYXN0UGFydGlhbDxJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZT4oe1xuXHRcdFx0XHRcdHJlcXVlc3RSZXNvdXJjZXNUcnVzdDogYXN5bmMgb3B0aW9ucyA9PiB7XG5cdFx0XHRcdFx0XHR0cnVzdFJlcXVlc3RzLnB1c2gob3B0aW9ucyk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1c3RSZXN1bHQ7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHR0cnVzdFJlcXVlc3RzOiB0cnVzdFJlcXVlc3RzLm1hcChyZXF1ZXN0ID0+ICh7XG5cdFx0XHRcdFx0dXJpOiByZXF1ZXN0LnVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHJlcXVlc3QubWVzc2FnZSxcblx0XHRcdFx0fSkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXN1bHQ6IHRydXN0UmVzdWx0ID09PSB0cnVlLFxuXHRcdFx0XHR0cnVzdFJlcXVlc3RzOiBbe1xuXHRcdFx0XHRcdHVyaTogRk9MREVSLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bWVzc2FnZTogJ0FuIGFnZW50IHNlc3Npb24gd2lsbCBiZSBhYmxlIHRvIHJlYWQgZmlsZXMsIHJ1biBjb21tYW5kcywgYW5kIG1ha2UgY2hhbmdlcyBpbiB0aGlzIGZvbGRlci4nLFxuXHRcdFx0XHR9XSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59KTtcblxuc3VpdGUoJ0F1dG9tYXRpb24gYnJhbmNoIHBpY2tlcicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVJdGVtKG9wdGlvbnM/OiB7XG5cdFx0cmVhZG9ubHkgc3RhdGU/OiBJRm9ybVN0YXRlO1xuXHRcdHJlYWRvbmx5IGdldFJlZnM/OiBJR2l0UmVwb3NpdG9yeVsnZ2V0UmVmcyddO1xuXHRcdHJlYWRvbmx5IGZhaWxPcGVuUmVwb3NpdG9yeU9uY2U/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IHByb3ZpZGVySW5pdGlhbGx5VW5hdmFpbGFibGU/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IHJldmFsaWRhdGU/OiAoKSA9PiB2b2lkO1xuXHRcdHJlYWRvbmx5IHZpc2libGU/OiBib29sZWFuO1xuXHR9KToge1xuXHRcdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdFx0cmVhZG9ubHkgc3RhdGU6IElGb3JtU3RhdGU7XG5cdFx0cmVhZG9ubHkgbW9kZWw6IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbDtcblx0XHRyZWFkb25seSBhY3Rpb25XaWRnZXRTZXJ2aWNlOiBSZWNvcmRpbmdBY3Rpb25XaWRnZXRTZXJ2aWNlO1xuXHRcdHJlYWRvbmx5IGdldE9wZW5SZXBvc2l0b3J5QXR0ZW1wdHM6ICgpID0+IG51bWJlcjtcblx0XHRyZWFkb25seSBzZXRQcm92aWRlckF2YWlsYWJsZTogKCkgPT4gdm9pZDtcblx0fSB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBvcHRpb25zPy5zdGF0ZSA/PyBjcmVhdGVGb3JtU3RhdGUoKTtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwoc3RhdGUpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlTdGF0ZSA9IG9ic2VydmFibGVWYWx1ZSgncmVwb3NpdG9yeVN0YXRlJywge1xuXHRcdFx0SEVBRDogeyB0eXBlOiBHaXRSZWZUeXBlLkhlYWQsIG5hbWU6ICdtYWluJywgY29tbWl0OiAnYWJjMTIzJyB9LFxuXHRcdFx0cmVtb3RlczogW10sXG5cdFx0XHRtZXJnZUNoYW5nZXM6IFtdLFxuXHRcdFx0aW5kZXhDaGFuZ2VzOiBbXSxcblx0XHRcdHdvcmtpbmdUcmVlQ2hhbmdlczogW10sXG5cdFx0XHR1bnRyYWNrZWRDaGFuZ2VzOiBbXSxcblx0XHR9KTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdXBjYXN0UGFydGlhbDxJR2l0UmVwb3NpdG9yeT4oe1xuXHRcdFx0cm9vdFVyaTogRk9MREVSLFxuXHRcdFx0c3RhdGU6IHJlcG9zaXRvcnlTdGF0ZSxcblx0XHRcdGdldFJlZnM6IG9wdGlvbnM/LmdldFJlZnMgPz8gKGFzeW5jICgpID0+IFtcblx0XHRcdFx0eyB0eXBlOiBHaXRSZWZUeXBlLkhlYWQsIG5hbWU6ICdmZWF0dXJlL3onIH0sXG5cdFx0XHRcdHsgdHlwZTogR2l0UmVmVHlwZS5IZWFkLCBuYW1lOiAnbWFpbicgfSxcblx0XHRcdFx0eyB0eXBlOiBHaXRSZWZUeXBlLkhlYWQsIG5hbWU6ICdmZWF0dXJlL2EnIH0sXG5cdFx0XHRcdHsgdHlwZTogR2l0UmVmVHlwZS5IZWFkLCBuYW1lOiAnY29waWxvdC13b3JrdHJlZS1nZW5lcmF0ZWQnIH0sXG5cdFx0XHRdKSxcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb25XaWRnZXRTZXJ2aWNlID0gbmV3IFJlY29yZGluZ0FjdGlvbldpZGdldFNlcnZpY2UoKTtcblx0XHRjb25zdCB2aXNpYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCdyZXBvc2l0b3J5Q29udHJvbHNWaXNpYmxlJywgb3B0aW9ucz8udmlzaWJsZSA/PyB0cnVlKTtcblx0XHRsZXQgb3BlblJlcG9zaXRvcnlBdHRlbXB0cyA9IDA7XG5cdFx0bGV0IHByb3ZpZGVyQXZhaWxhYmxlID0gIW9wdGlvbnM/LnByb3ZpZGVySW5pdGlhbGx5VW5hdmFpbGFibGU7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGVzQ2hhbmdlZCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFjdGlvbldpZGdldFNlcnZpY2UsIGFjdGlvbldpZGdldFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUdpdFNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SUdpdFNlcnZpY2U+KHtcblx0XHRcdG9wZW5SZXBvc2l0b3J5OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdG9wZW5SZXBvc2l0b3J5QXR0ZW1wdHMrKztcblx0XHRcdFx0aWYgKG9wdGlvbnM/LmZhaWxPcGVuUmVwb3NpdG9yeU9uY2UgJiYgb3BlblJlcG9zaXRvcnlBdHRlbXB0cyA9PT0gMSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignZmFpbGVkIHRvIG9wZW4gcmVwb3NpdG9yeScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXBvc2l0b3J5O1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgdXBjYXN0UGFydGlhbDxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oe1xuXHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uVHlwZXM6IHNlc3Npb25UeXBlc0NoYW5nZWQuZXZlbnQsXG5cdFx0XHRnZXRTZXNzaW9uVHlwZXNGb3JGb2xkZXI6ICgpID0+IHByb3ZpZGVyQXZhaWxhYmxlID8gW3tcblx0XHRcdFx0cHJvdmlkZXJJZDogc3RhdGUucHJvdmlkZXJJZCA/PyAnZGVmYXVsdC1jb3BpbG90Jyxcblx0XHRcdFx0c2Vzc2lvblR5cGU6IHtcblx0XHRcdFx0XHRpZDogc3RhdGUuc2Vzc2lvblR5cGVJZCA/PyAnY29waWxvdGNsaScsXG5cdFx0XHRcdFx0bGFiZWw6ICdDb3BpbG90Jyxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmNvcGlsb3QsXG5cdFx0XHRcdFx0c3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb246IHN0YXRlLnNlc3Npb25UeXBlSWQgPT09ICdjb3BpbG90Y2xpJyxcblx0XHRcdFx0fSxcblx0XHRcdH1dIDogW10sXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IGFjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKCd0ZXN0LmF1dG9tYXRpb25Jc29sYXRpb24nLCAnQXV0b21hdGlvbiBJc29sYXRpb24nKSk7XG5cdFx0Y29uc3QgaXRlbSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdEF1dG9tYXRpb25Jc29sYXRpb25Hcm91cEFjdGlvblZpZXdJdGVtLFxuXHRcdFx0YWN0aW9uLFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRtb2RlbCxcblx0XHRcdG1vZGVsLmZvbGRlclVyaU9icyxcblx0XHRcdEV2ZW50Lk5vbmUsXG5cdFx0XHRvcHRpb25zPy5yZXZhbGlkYXRlID8/ICgoKSA9PiB7IH0pLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dmlzaWJsZSxcblx0XHQpKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRpdGVtLnJlbmRlcihjb250YWluZXIpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdG1vZGVsLFxuXHRcdFx0YWN0aW9uV2lkZ2V0U2VydmljZSxcblx0XHRcdGdldE9wZW5SZXBvc2l0b3J5QXR0ZW1wdHM6ICgpID0+IG9wZW5SZXBvc2l0b3J5QXR0ZW1wdHMsXG5cdFx0XHRzZXRQcm92aWRlckF2YWlsYWJsZTogKCkgPT4ge1xuXHRcdFx0XHRwcm92aWRlckF2YWlsYWJsZSA9IHRydWU7XG5cdFx0XHRcdHNlc3Npb25UeXBlc0NoYW5nZWQuZmlyZSgpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnb3BlbnMgc29ydGVkIGxvY2FsIGJyYW5jaGVzIGFuZCBwZXJzaXN0cyB0aGUgc2VsZWN0ZWQgV29ya3RyZWUgYnJhbmNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udGFpbmVyLCBtb2RlbCwgYWN0aW9uV2lkZ2V0U2VydmljZSB9ID0gY3JlYXRlSXRlbSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgdHJpZ2dlciA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmF1dG9tYXRpb24tZm9ybS1icmFuY2gtc2xvdCcpO1xuXHRcdGFzc2VydC5vayh0cmlnZ2VyKTtcblxuXHRcdHRyaWdnZXIuY2xpY2soKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbldpZGdldFNlcnZpY2UubGFiZWxzLCBbJ2ZlYXR1cmUvYScsICdmZWF0dXJlL3onLCAnbWFpbiddKTtcblx0XHRhY3Rpb25XaWRnZXRTZXJ2aWNlLnNlbGVjdCgnZmVhdHVyZS96Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJyYW5jaDogbW9kZWwucGVyc2lzdGVkQnJhbmNoLFxuXHRcdFx0ZXhwYW5kZWQ6IHRyaWdnZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJyksXG5cdFx0XHRkaXNhYmxlZDogdHJpZ2dlci5nZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKSxcblx0XHRcdHJvbGU6IHRyaWdnZXIuZ2V0QXR0cmlidXRlKCdyb2xlJyksXG5cdFx0XHRoYXNQb3B1cDogdHJpZ2dlci5nZXRBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnKSxcblx0XHR9LCB7XG5cdFx0XHRicmFuY2g6ICdmZWF0dXJlL3onLFxuXHRcdFx0ZXhwYW5kZWQ6ICdmYWxzZScsXG5cdFx0XHRkaXNhYmxlZDogJ2ZhbHNlJyxcblx0XHRcdHJvbGU6ICdidXR0b24nLFxuXHRcdFx0aGFzUG9wdXA6ICdsaXN0Ym94Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgYW4gZWRpdGVkIGJyYW5jaCB0aGF0IGlzIG5vIGxvbmdlciBhdmFpbGFibGUgbG9jYWxseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRhaW5lciwgbW9kZWwsIGFjdGlvbldpZGdldFNlcnZpY2UgfSA9IGNyZWF0ZUl0ZW0oe1xuXHRcdFx0c3RhdGU6IGNyZWF0ZUZvcm1TdGF0ZSh7IGJyYW5jaDogJ2ZlYXR1cmUvZGVsZXRlZCcgfSksXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCB0cmlnZ2VyID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbi1mb3JtLWJyYW5jaC1zbG90Jyk7XG5cdFx0YXNzZXJ0Lm9rKHRyaWdnZXIpO1xuXG5cdFx0dHJpZ2dlci5jbGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsYWJlbDogdHJpZ2dlci5xdWVyeVNlbGVjdG9yKCcuYXV0b21hdGlvbi1mb3JtLWJyYW5jaC1uYW1lJyk/LnRleHRDb250ZW50LFxuXHRcdFx0cGVyc2lzdGVkQnJhbmNoOiBtb2RlbC5wZXJzaXN0ZWRCcmFuY2gsXG5cdFx0XHRwaWNrZXJJdGVtczogYWN0aW9uV2lkZ2V0U2VydmljZS5sYWJlbHMsXG5cdFx0XHRhcmlhTGFiZWxzOiBhY3Rpb25XaWRnZXRTZXJ2aWNlLmFyaWFMYWJlbHMsXG5cdFx0fSwge1xuXHRcdFx0bGFiZWw6ICdmZWF0dXJlL2RlbGV0ZWQnLFxuXHRcdFx0cGVyc2lzdGVkQnJhbmNoOiAnZmVhdHVyZS9kZWxldGVkJyxcblx0XHRcdHBpY2tlckl0ZW1zOiBbJ2ZlYXR1cmUvZGVsZXRlZCcsICdmZWF0dXJlL2EnLCAnZmVhdHVyZS96JywgJ21haW4nXSxcblx0XHRcdGFyaWFMYWJlbHM6IFsnZmVhdHVyZS9kZWxldGVkLCB1bmF2YWlsYWJsZSBsb2NhbGx5JywgJ2ZlYXR1cmUvYScsICdmZWF0dXJlL3onLCAnbWFpbiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBGb2xkZXIgYnJhbmNoIHN0YXR1cyByZWFkLW9ubHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250YWluZXIsIGFjdGlvbldpZGdldFNlcnZpY2UgfSA9IGNyZWF0ZUl0ZW0oe1xuXHRcdFx0c3RhdGU6IGNyZWF0ZUZvcm1TdGF0ZSh7IGlzb2xhdGlvbk1vZGU6ICd3b3Jrc3BhY2UnLCBicmFuY2g6ICdzdGFsZS1oZWFkJyB9KSxcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHRyaWdnZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hdXRvbWF0aW9uLWZvcm0tYnJhbmNoLXNsb3QnKTtcblx0XHRhc3NlcnQub2sodHJpZ2dlcik7XG5cblx0XHR0cmlnZ2VyLmNsaWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxhYmVsOiB0cmlnZ2VyLnF1ZXJ5U2VsZWN0b3IoJy5hdXRvbWF0aW9uLWZvcm0tYnJhbmNoLW5hbWUnKT8udGV4dENvbnRlbnQsXG5cdFx0XHRkaXNhYmxlZDogdHJpZ2dlci5nZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKSxcblx0XHRcdGhhc0NoZXZyb246ICEhdHJpZ2dlci5xdWVyeVNlbGVjdG9yKCcuY29kaWNvbi1jaGV2cm9uLWRvd24nKSxcblx0XHRcdHBpY2tlclZpc2libGU6IGFjdGlvbldpZGdldFNlcnZpY2UuaXNWaXNpYmxlLFxuXHRcdFx0cm9sZTogdHJpZ2dlci5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSxcblx0XHRcdGhhc1BvcHVwOiB0cmlnZ2VyLmdldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcpLFxuXHRcdFx0dGFiSW5kZXg6IHRyaWdnZXIudGFiSW5kZXgsXG5cdFx0fSwge1xuXHRcdFx0bGFiZWw6ICdtYWluJyxcblx0XHRcdGRpc2FibGVkOiAndHJ1ZScsXG5cdFx0XHRoYXNDaGV2cm9uOiBmYWxzZSxcblx0XHRcdHBpY2tlclZpc2libGU6IGZhbHNlLFxuXHRcdFx0cm9sZTogbnVsbCxcblx0XHRcdGhhc1BvcHVwOiBudWxsLFxuXHRcdFx0dGFiSW5kZXg6IC0xLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvZmZlcnMgcmV0cnkgYWZ0ZXIgYSBicmFuY2ggbG9hZCBmYWlsdXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBhdHRlbXB0cyA9IDA7XG5cdFx0Y29uc3QgeyBjb250YWluZXIsIGFjdGlvbldpZGdldFNlcnZpY2UgfSA9IGNyZWF0ZUl0ZW0oe1xuXHRcdFx0Z2V0UmVmczogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhdHRlbXB0cysrO1xuXHRcdFx0XHRpZiAoYXR0ZW1wdHMgPT09IDEpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2ZhaWxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBbeyB0eXBlOiBHaXRSZWZUeXBlLkhlYWQsIG5hbWU6ICdtYWluJyB9XTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCB0cmlnZ2VyID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbi1mb3JtLWJyYW5jaC1zbG90Jyk7XG5cdFx0YXNzZXJ0Lm9rKHRyaWdnZXIpO1xuXG5cdFx0dHJpZ2dlci5jbGljaygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9uV2lkZ2V0U2VydmljZS5sYWJlbHMsIFsnUmV0cnkgTG9hZGluZyBCcmFuY2hlcyddKTtcblx0XHRhY3Rpb25XaWRnZXRTZXJ2aWNlLnNlbGVjdCgnUmV0cnkgTG9hZGluZyBCcmFuY2hlcycpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0dHJpZ2dlci5jbGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhdHRlbXB0cyxcblx0XHRcdGxhYmVsczogYWN0aW9uV2lkZ2V0U2VydmljZS5sYWJlbHMsXG5cdFx0fSwge1xuXHRcdFx0YXR0ZW1wdHM6IDIsXG5cdFx0XHRsYWJlbHM6IFsnbWFpbiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0aGUgcGlja2VyIGRpc2FibGVkIHdoaWxlIGJyYW5jaGVzIGxvYWQgYW5kIGVuYWJsZXMgaXQgd2hlbiByZWFkeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWZzID0gbmV3IERlZmVycmVkUHJvbWlzZTxBd2FpdGVkPFJldHVyblR5cGU8SUdpdFJlcG9zaXRvcnlbJ2dldFJlZnMnXT4+PigpO1xuXHRcdGNvbnN0IHsgY29udGFpbmVyLCBhY3Rpb25XaWRnZXRTZXJ2aWNlIH0gPSBjcmVhdGVJdGVtKHtcblx0XHRcdGdldFJlZnM6IGFzeW5jICgpID0+IHJlZnMucCxcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHRyaWdnZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hdXRvbWF0aW9uLWZvcm0tYnJhbmNoLXNsb3QnKTtcblx0XHRhc3NlcnQub2sodHJpZ2dlcik7XG5cdFx0dHJpZ2dlci5jbGljaygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzYWJsZWQ6IHRyaWdnZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJyksXG5cdFx0XHRwaWNrZXJWaXNpYmxlOiBhY3Rpb25XaWRnZXRTZXJ2aWNlLmlzVmlzaWJsZSxcblx0XHR9LCB7XG5cdFx0XHRkaXNhYmxlZDogJ3RydWUnLFxuXHRcdFx0cGlja2VyVmlzaWJsZTogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHRhd2FpdCByZWZzLmNvbXBsZXRlKFt7IHR5cGU6IEdpdFJlZlR5cGUuSGVhZCwgbmFtZTogJ21haW4nIH1dKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHRyaWdnZXIuY2xpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzYWJsZWQ6IHRyaWdnZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJyksXG5cdFx0XHRsYWJlbHM6IGFjdGlvbldpZGdldFNlcnZpY2UubGFiZWxzLFxuXHRcdH0sIHtcblx0XHRcdGRpc2FibGVkOiAnZmFsc2UnLFxuXHRcdFx0bGFiZWxzOiBbJ21haW4nXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXhwbGFpbnMgdGhhdCBXb3JrdHJlZSBpcyB1bmF2YWlsYWJsZSB3aGlsZSBicmFuY2hlcyBsb2FkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZnMgPSBuZXcgRGVmZXJyZWRQcm9taXNlPEF3YWl0ZWQ8UmV0dXJuVHlwZTxJR2l0UmVwb3NpdG9yeVsnZ2V0UmVmcyddPj4+KCk7XG5cdFx0Y29uc3QgeyBjb250YWluZXIgfSA9IGNyZWF0ZUl0ZW0oe1xuXHRcdFx0c3RhdGU6IGNyZWF0ZUZvcm1TdGF0ZSh7IGlzb2xhdGlvbk1vZGU6ICd3b3Jrc3BhY2UnIH0pLFxuXHRcdFx0Z2V0UmVmczogYXN5bmMgKCkgPT4gcmVmcy5wLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgY2hlY2tib3ggPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5zZXNzaW9ucy1jaGF0LWlzb2xhdGlvbi1jaGVja2JveCAubW9uYWNvLWNoZWNrYm94Jyk7XG5cdFx0YXNzZXJ0Lm9rKGNoZWNrYm94KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2hlY2tlZDogY2hlY2tib3guZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSxcblx0XHRcdGRpc2FibGVkOiBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKSxcblx0XHR9LCB7XG5cdFx0XHRjaGVja2VkOiAnZmFsc2UnLFxuXHRcdFx0ZGlzYWJsZWQ6ICd0cnVlJyxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHJlZnMuY29tcGxldGUoW3sgdHlwZTogR2l0UmVmVHlwZS5IZWFkLCBuYW1lOiAnbWFpbicgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvZmZlcnMgcmV0cnkgd2hlbiBvcGVuaW5nIHRoZSByZXBvc2l0b3J5IGZhaWxzIGluIEZvbGRlciBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udGFpbmVyLCBhY3Rpb25XaWRnZXRTZXJ2aWNlLCBnZXRPcGVuUmVwb3NpdG9yeUF0dGVtcHRzIH0gPSBjcmVhdGVJdGVtKHtcblx0XHRcdHN0YXRlOiBjcmVhdGVGb3JtU3RhdGUoeyBpc29sYXRpb25Nb2RlOiAnd29ya3NwYWNlJyB9KSxcblx0XHRcdGZhaWxPcGVuUmVwb3NpdG9yeU9uY2U6IHRydWUsXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCB0cmlnZ2VyID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbi1mb3JtLWJyYW5jaC1zbG90Jyk7XG5cdFx0YXNzZXJ0Lm9rKHRyaWdnZXIpO1xuXG5cdFx0dHJpZ2dlci5jbGljaygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9uV2lkZ2V0U2VydmljZS5sYWJlbHMsIFsnUmV0cnkgTG9hZGluZyBCcmFuY2hlcyddKTtcblx0XHRhY3Rpb25XaWRnZXRTZXJ2aWNlLnNlbGVjdCgnUmV0cnkgTG9hZGluZyBCcmFuY2hlcycpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF0dGVtcHRzOiBnZXRPcGVuUmVwb3NpdG9yeUF0dGVtcHRzKCksXG5cdFx0XHRsYWJlbDogdHJpZ2dlci5xdWVyeVNlbGVjdG9yKCcuYXV0b21hdGlvbi1mb3JtLWJyYW5jaC1uYW1lJyk/LnRleHRDb250ZW50LFxuXHRcdH0sIHtcblx0XHRcdGF0dGVtcHRzOiAyLFxuXHRcdFx0bGFiZWw6ICdtYWluJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZXMgcHJvdmlkZXJsZXNzIHNlc3Npb24tdHlwZSBwaWNrcyBiZWZvcmUgZ2F0aW5nIFdvcmt0cmVlIGNvbmZpZ3VyYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250YWluZXIgfSA9IGNyZWF0ZUl0ZW0oe1xuXHRcdFx0c3RhdGU6IGNyZWF0ZUZvcm1TdGF0ZSh7IHByb3ZpZGVySWQ6IHVuZGVmaW5lZCB9KSxcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHRyaWdnZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hdXRvbWF0aW9uLWZvcm0tYnJhbmNoLXNsb3QnKTtcblx0XHRhc3NlcnQub2sodHJpZ2dlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpc2FibGVkOiB0cmlnZ2VyLmdldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcpLFxuXHRcdFx0bGFiZWw6IHRyaWdnZXIucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb24tZm9ybS1icmFuY2gtbmFtZScpPy50ZXh0Q29udGVudCxcblx0XHR9LCB7XG5cdFx0XHRkaXNhYmxlZDogJ2ZhbHNlJyxcblx0XHRcdGxhYmVsOiAnbWFpbicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZXMgdW5zdXBwb3J0ZWQgV29ya3RyZWUgdGFyZ2V0cyBiYWNrIHRvIEZvbGRlciBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udGFpbmVyLCBtb2RlbCB9ID0gY3JlYXRlSXRlbSh7XG5cdFx0XHRzdGF0ZTogY3JlYXRlRm9ybVN0YXRlKHsgc2Vzc2lvblR5cGVJZDogJ2NsYXVkZS1jb2RlJywgYnJhbmNoOiAnZmVhdHVyZS9zYXZlZCcgfSksXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IGNoZWNrYm94ID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuc2Vzc2lvbnMtY2hhdC1pc29sYXRpb24tY2hlY2tib3ggLm1vbmFjby1jaGVja2JveCcpO1xuXHRcdGFzc2VydC5vayhjaGVja2JveCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtb2RlOiBtb2RlbC5pc29sYXRpb25Nb2RlLFxuXHRcdFx0YnJhbmNoOiBtb2RlbC5wZXJzaXN0ZWRCcmFuY2gsXG5cdFx0XHRjaGVja2VkOiBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpLFxuXHRcdH0sIHtcblx0XHRcdG1vZGU6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0YnJhbmNoOiB1bmRlZmluZWQsXG5cdFx0XHRjaGVja2VkOiAnZmFsc2UnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbmFibGVzIFdvcmt0cmVlIGJyYW5jaGVzIGZvciBhZ2VudC1ob3N0IENvcGlsb3QgQ0xJJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udGFpbmVyIH0gPSBjcmVhdGVJdGVtKHtcblx0XHRcdHN0YXRlOiBjcmVhdGVGb3JtU3RhdGUoeyBwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyB9KSxcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHRyaWdnZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hdXRvbWF0aW9uLWZvcm0tYnJhbmNoLXNsb3QnKTtcblx0XHRhc3NlcnQub2sodHJpZ2dlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpc2FibGVkOiB0cmlnZ2VyLmdldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcpLFxuXHRcdFx0bGFiZWw6IHRyaWdnZXIucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb24tZm9ybS1icmFuY2gtbmFtZScpPy50ZXh0Q29udGVudCxcblx0XHR9LCB7XG5cdFx0XHRkaXNhYmxlZDogJ2ZhbHNlJyxcblx0XHRcdGxhYmVsOiAnbWFpbicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBXb3JrdHJlZSBpbnRlbnQgd2hpbGUgdGhlIHByb3ZpZGVyIGlzIGRpc2NvdmVyZWQgbGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRhaW5lciwgbW9kZWwsIHNldFByb3ZpZGVyQXZhaWxhYmxlIH0gPSBjcmVhdGVJdGVtKHtcblx0XHRcdHN0YXRlOiBjcmVhdGVGb3JtU3RhdGUoeyBicmFuY2g6ICdmZWF0dXJlL3NhdmVkJyB9KSxcblx0XHRcdHByb3ZpZGVySW5pdGlhbGx5VW5hdmFpbGFibGU6IHRydWUsXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCB0cmlnZ2VyID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbi1mb3JtLWJyYW5jaC1zbG90Jyk7XG5cdFx0YXNzZXJ0Lm9rKHRyaWdnZXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bW9kZTogbW9kZWwuaXNvbGF0aW9uTW9kZSxcblx0XHRcdHNlbGVjdGVkQnJhbmNoOiBtb2RlbC5zZWxlY3RlZEJyYW5jaCxcblx0XHRcdHBlcnNpc3RlZEJyYW5jaDogbW9kZWwucGVyc2lzdGVkQnJhbmNoLFxuXHRcdFx0cmVhc29uOiB0cmlnZ2VyLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLFxuXHRcdH0sIHtcblx0XHRcdG1vZGU6ICd3b3JrdHJlZScsXG5cdFx0XHRzZWxlY3RlZEJyYW5jaDogJ2ZlYXR1cmUvc2F2ZWQnLFxuXHRcdFx0cGVyc2lzdGVkQnJhbmNoOiB1bmRlZmluZWQsXG5cdFx0XHRyZWFzb246ICdmZWF0dXJlL3NhdmVkLiBTZXNzaW9uIGNhcGFiaWxpdGllcyBhcmUgbG9hZGluZy4nLFxuXHRcdH0pO1xuXG5cdFx0c2V0UHJvdmlkZXJBdmFpbGFibGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bW9kZTogbW9kZWwuaXNvbGF0aW9uTW9kZSxcblx0XHRcdHBlcnNpc3RlZEJyYW5jaDogbW9kZWwucGVyc2lzdGVkQnJhbmNoLFxuXHRcdFx0ZGlzYWJsZWQ6IHRyaWdnZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJyksXG5cdFx0fSwge1xuXHRcdFx0bW9kZTogJ3dvcmt0cmVlJyxcblx0XHRcdHBlcnNpc3RlZEJyYW5jaDogJ2ZlYXR1cmUvc2F2ZWQnLFxuXHRcdFx0ZGlzYWJsZWQ6ICdmYWxzZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVpcmVzIGEgYnJhbmNoIGJlZm9yZSBzYXZpbmcgV29ya3RyZWUgaXNvbGF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlRm9ybVN0YXRlKHsgYnJhbmNoOiB1bmRlZmluZWQgfSk7XG5cdFx0Y29uc3QgdmFsaWRhdGlvbjogSVZhbGlkYXRpb25TdGF0ZSA9IHtcblx0XHRcdG5hbWVFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0cHJvbXB0RXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdGZvbGRlckVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRzZXNzaW9uVHlwZUVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRicmFuY2hFcnJvcjogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0Y29uc3QgZm9ybSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2Zvcm0nKTtcblxuXHRcdHVwZGF0ZVNhdmVCdXR0b25TdGF0ZSh1bmRlZmluZWQsIHN0YXRlLCB2YWxpZGF0aW9uLCBmb3JtLCAoKSA9PiAncHJvbXB0JywgKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsaWRhdGlvbi5icmFuY2hFcnJvciwgJ0EgYnJhbmNoIGlzIHJlcXVpcmVkIGZvciBXb3JrdHJlZSBpc29sYXRpb24uJyk7XG5cblx0XHR1cGRhdGVTYXZlQnV0dG9uU3RhdGUodW5kZWZpbmVkLCBzdGF0ZSwgdmFsaWRhdGlvbiwgZm9ybSwgKCkgPT4gJ3Byb21wdCcsICgpID0+ICdtYWluJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbGlkYXRpb24uYnJhbmNoRXJyb3IsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93cyBhIHdvcmtzcGFjZS1sZXNzIHRhcmdldCB3aXRob3V0IGEgZm9sZGVyIGFuZCBzdGlsbCByZXF1aXJlcyBhIHNlc3Npb24gdHlwZScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUZvcm1TdGF0ZSh7IGlzUXVpY2tDaGF0OiB0cnVlLCBmb2xkZXJVcmk6IHVuZGVmaW5lZCwgaXNvbGF0aW9uTW9kZTogdW5kZWZpbmVkLCBicmFuY2g6IHVuZGVmaW5lZCB9KTtcblx0XHRjb25zdCB2YWxpZGF0aW9uOiBJVmFsaWRhdGlvblN0YXRlID0ge1xuXHRcdFx0bmFtZUVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRwcm9tcHRFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0Zm9sZGVyRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdHNlc3Npb25UeXBlRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdGJyYW5jaEVycm9yOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHRjb25zdCBmb3JtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZm9ybScpO1xuXG5cdFx0dXBkYXRlU2F2ZUJ1dHRvblN0YXRlKHVuZGVmaW5lZCwgc3RhdGUsIHZhbGlkYXRpb24sIGZvcm0sICgpID0+ICdwcm9tcHQnLCAoKSA9PiB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHZhbGlkVGFyZ2V0ID0geyAuLi52YWxpZGF0aW9uIH07XG5cdFx0c3RhdGUucHJvdmlkZXJJZCA9IHVuZGVmaW5lZDtcblx0XHRzdGF0ZS5zZXNzaW9uVHlwZUlkID0gdW5kZWZpbmVkO1xuXHRcdHVwZGF0ZVNhdmVCdXR0b25TdGF0ZSh1bmRlZmluZWQsIHN0YXRlLCB2YWxpZGF0aW9uLCBmb3JtLCAoKSA9PiAncHJvbXB0JywgKCkgPT4gdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dmFsaWRUYXJnZXQsXG5cdFx0XHRtaXNzaW5nVGFyZ2V0OiB2YWxpZGF0aW9uLFxuXHRcdH0sIHtcblx0XHRcdHZhbGlkVGFyZ2V0OiB7XG5cdFx0XHRcdG5hbWVFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRwcm9tcHRFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRmb2xkZXJFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRzZXNzaW9uVHlwZUVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdGJyYW5jaEVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0bWlzc2luZ1RhcmdldDoge1xuXHRcdFx0XHRuYW1lRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0cHJvbXB0RXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0Zm9sZGVyRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2Vzc2lvblR5cGVFcnJvcjogJ1Nlc3Npb24gdHlwZSBpcyByZXF1aXJlZC4nLFxuXHRcdFx0XHRicmFuY2hFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWxsb3dzIHdvcmtzcGFjZS1iYWNrZWQgbGVnYWN5IHRhcmdldHMgd2l0aG91dCBhIHByb3ZpZGVyIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlRm9ybVN0YXRlKHsgcHJvdmlkZXJJZDogdW5kZWZpbmVkLCBpc29sYXRpb25Nb2RlOiAnd29ya3NwYWNlJyB9KTtcblx0XHRjb25zdCB2YWxpZGF0aW9uOiBJVmFsaWRhdGlvblN0YXRlID0ge1xuXHRcdFx0bmFtZUVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRwcm9tcHRFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0Zm9sZGVyRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdHNlc3Npb25UeXBlRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdGJyYW5jaEVycm9yOiB1bmRlZmluZWQsXG5cdFx0fTtcblxuXHRcdHVwZGF0ZVNhdmVCdXR0b25TdGF0ZSh1bmRlZmluZWQsIHN0YXRlLCB2YWxpZGF0aW9uLCBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdmb3JtJyksICgpID0+ICdwcm9tcHQnLCAoKSA9PiB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2YWxpZGF0aW9uLCB7XG5cdFx0XHRuYW1lRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdHByb21wdEVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRmb2xkZXJFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0c2Vzc2lvblR5cGVFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0YnJhbmNoRXJyb3I6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaGlkZXMgcmVwb3NpdG9yeSBjb250cm9scyBmb3Igd29ya3NwYWNlLWxlc3MgdGFyZ2V0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUZvcm1TdGF0ZSh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogdHJ1ZSxcblx0XHRcdGZvbGRlclVyaTogdW5kZWZpbmVkLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmt0cmVlJyxcblx0XHRcdGJyYW5jaDogJ2ZlYXR1cmUvc3RhbGUnLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgY29udGFpbmVyLCBtb2RlbCB9ID0gY3JlYXRlSXRlbSh7IHN0YXRlLCB2aXNpYmxlOiBmYWxzZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXNwbGF5OiBjb250YWluZXIuc3R5bGUuZGlzcGxheSxcblx0XHRcdGFyaWFIaWRkZW46IGNvbnRhaW5lci5nZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJyksXG5cdFx0XHRmb2xkZXJVcmk6IG1vZGVsLmZvbGRlclVyaSxcblx0XHRcdGlzb2xhdGlvbk1vZGU6IHN0YXRlLmlzb2xhdGlvbk1vZGUsXG5cdFx0XHRicmFuY2g6IG1vZGVsLnBlcnNpc3RlZEJyYW5jaCxcblx0XHR9LCB7XG5cdFx0XHRkaXNwbGF5OiAnbm9uZScsXG5cdFx0XHRhcmlhSGlkZGVuOiAndHJ1ZScsXG5cdFx0XHRmb2xkZXJVcmk6IHVuZGVmaW5lZCxcblx0XHRcdGlzb2xhdGlvbk1vZGU6IHVuZGVmaW5lZCxcblx0XHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWxvYWRzIHJlcG9zaXRvcnkgc3RhdGUgd2hlbiByZXR1cm5pbmcgdG8gd29ya3NwYWNlIG1vZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVGb3JtU3RhdGUoe1xuXHRcdFx0aXNRdWlja0NoYXQ6IHRydWUsXG5cdFx0XHRmb2xkZXJVcmk6IHVuZGVmaW5lZCxcblx0XHRcdGlzb2xhdGlvbk1vZGU6IHVuZGVmaW5lZCxcblx0XHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgY29udGFpbmVyLCBtb2RlbCwgZ2V0T3BlblJlcG9zaXRvcnlBdHRlbXB0cyB9ID0gY3JlYXRlSXRlbSh7IHN0YXRlLCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0T3BlblJlcG9zaXRvcnlBdHRlbXB0cygpLCAwKTtcblx0XHRtb2RlbC5zZXRRdWlja0NoYXQoZmFsc2UsIEZPTERFUik7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YXR0ZW1wdHM6IGdldE9wZW5SZXBvc2l0b3J5QXR0ZW1wdHMoKSxcblx0XHRcdGZvbGRlclVyaTogbW9kZWwuZm9sZGVyVXJpPy50b1N0cmluZygpLFxuXHRcdFx0YnJhbmNoOiBjb250YWluZXIucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb24tZm9ybS1icmFuY2gtbmFtZScpPy50ZXh0Q29udGVudCxcblx0XHRcdHN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uOiBtb2RlbC5zdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbixcblx0XHR9LCB7XG5cdFx0XHRhdHRlbXB0czogMSxcblx0XHRcdGZvbGRlclVyaTogRk9MREVSLnRvU3RyaW5nKCksXG5cdFx0XHRicmFuY2g6ICdtYWluJyxcblx0XHRcdHN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGxvd3MgZm9jdXMgaW4gbW9iaWxlIHBpY2tlciBzaGVldHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2hlZXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRzaGVldC5jbGFzc0xpc3QuYWRkKCdtb2JpbGUtcGlja2VyLXNoZWV0Jyk7XG5cdFx0Y29uc3QgaXRlbSA9IHNoZWV0LmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dG9tYXRpb25EaWFsb2dQb3B1cFRhcmdldChpdGVtKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIGEgbGVnYWN5IG1vZGVsIGlkZW50aWZpZXIgdG8gdGhlIHNlbGVjdGVkIGNvbmNyZXRlIHRhcmdldCcsICgpID0+IHtcblx0XHRjb25zdCBsZWdhY3lJZGVudGlmaWVyID0gJ2NvcGlsb3RjbGkvZ3B0LTUuNi1zb2wnO1xuXHRcdGNvbnN0IGNvbmNyZXRlSWRlbnRpZmllciA9ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6Z3B0LTUuNi1zb2wnO1xuXHRcdGNvbnN0IHVucmVsYXRlZElkZW50aWZpZXIgPSAnb3RoZXIvZ3B0LTUuNi1zb2wnO1xuXHRcdGNvbnN0IG1vZGVsSWRzID0gW2xlZ2FjeUlkZW50aWZpZXIsIHVucmVsYXRlZElkZW50aWZpZXJdO1xuXHRcdGNvbnN0IG1vZGVscyA9IG5ldyBNYXA8c3RyaW5nLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YT4oW1xuXHRcdFx0W2xlZ2FjeUlkZW50aWZpZXIsIHVwY2FzdFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+KHsgaWQ6ICdncHQtNS42LXNvbCcsIHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ2NvcGlsb3RjbGknIH0pXSxcblx0XHRcdFtjb25jcmV0ZUlkZW50aWZpZXIsIHVwY2FzdFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+KHsgaWQ6ICdncHQtNS42LXNvbCcsIHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaScgfSldLFxuXHRcdFx0W3VucmVsYXRlZElkZW50aWZpZXIsIHVwY2FzdFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+KHsgaWQ6ICdncHQtNS42LXNvbCcsIHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ290aGVyJyB9KV0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlID0gdXBjYXN0UGFydGlhbDxJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlPih7XG5cdFx0XHRnZXRMYW5ndWFnZU1vZGVsSWRzOiAoKSA9PiBtb2RlbElkcyxcblx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWw6IGlkZW50aWZpZXIgPT4gbW9kZWxzLmdldChpZGVudGlmaWVyKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGJlZm9yZUNvbmNyZXRlVGFyZ2V0QXJyaXZlcyA9IHJlc29sdmVBdXRvbWF0aW9uTW9kZWxJZGVudGlmaWVyKGxhbmd1YWdlTW9kZWxzU2VydmljZSwgbGVnYWN5SWRlbnRpZmllciwgJ2NvcGlsb3RjbGknLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJyk7XG5cdFx0bW9kZWxJZHMucHVzaChjb25jcmV0ZUlkZW50aWZpZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmVDb25jcmV0ZVRhcmdldEFycml2ZXMsXG5cdFx0XHRhZnRlckNvbmNyZXRlVGFyZ2V0QXJyaXZlczogcmVzb2x2ZUF1dG9tYXRpb25Nb2RlbElkZW50aWZpZXIobGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBsZWdhY3lJZGVudGlmaWVyLCAnY29waWxvdGNsaScsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknKSxcblx0XHRcdGFscmVhZHlDb25jcmV0ZTogcmVzb2x2ZUF1dG9tYXRpb25Nb2RlbElkZW50aWZpZXIobGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBjb25jcmV0ZUlkZW50aWZpZXIsICdjb3BpbG90Y2xpJywgJ2FnZW50LWhvc3QtY29waWxvdGNsaScpLFxuXHRcdFx0dW5yZWxhdGVkOiByZXNvbHZlQXV0b21hdGlvbk1vZGVsSWRlbnRpZmllcihsYW5ndWFnZU1vZGVsc1NlcnZpY2UsIHVucmVsYXRlZElkZW50aWZpZXIsICdjb3BpbG90Y2xpJywgJ2FnZW50LWhvc3QtY29waWxvdGNsaScpLFxuXHRcdH0sIHtcblx0XHRcdGJlZm9yZUNvbmNyZXRlVGFyZ2V0QXJyaXZlczogbGVnYWN5SWRlbnRpZmllcixcblx0XHRcdGFmdGVyQ29uY3JldGVUYXJnZXRBcnJpdmVzOiBjb25jcmV0ZUlkZW50aWZpZXIsXG5cdFx0XHRhbHJlYWR5Q29uY3JldGU6IGNvbmNyZXRlSWRlbnRpZmllcixcblx0XHRcdHVucmVsYXRlZDogdW5yZWxhdGVkSWRlbnRpZmllcixcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0F1dG9tYXRpb24gZGlhbG9nIGtleWJvYXJkIG5hdmlnYXRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY3ljbGVzIHRocm91Z2ggdmlzaWJsZSBkaWFsb2cgY29udHJvbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmQoY29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiBjb250YWluZXIucmVtb3ZlKCkgfSk7XG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gRE9NLmdldFdpbmRvdyhjb250YWluZXIpO1xuXHRcdGNvbnN0IGZpcnN0ID0gY29udGFpbmVyLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lucHV0JykpO1xuXHRcdGNvbnN0IGhpZGRlbkNvbnRhaW5lciA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdFx0aGlkZGVuQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0Y29uc3QgaGlkZGVuID0gaGlkZGVuQ29udGFpbmVyLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lucHV0JykpO1xuXHRcdGNvbnN0IHdyYXBwZXIgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JykpO1xuXHRcdHdyYXBwZXIudGFiSW5kZXggPSAwO1xuXHRcdGNvbnN0IHNlY29uZCA9IHdyYXBwZXIuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJykpO1xuXHRcdGNvbnN0IHRoaXJkID0gY29udGFpbmVyLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpKTtcblx0XHRjb25zdCBuYXZpZ2F0aW9uID0gZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyQXV0b21hdGlvbkRpYWxvZ0tleWJvYXJkTmF2aWdhdGlvbihcblx0XHRcdHRhcmdldFdpbmRvdyxcblx0XHRcdCgpID0+IFtmaXJzdCwgaGlkZGVuLCB3cmFwcGVyLCBzZWNvbmQsIHRoaXJkXSxcblx0XHRcdCgpID0+IGZhbHNlLFxuXHRcdCkpO1xuXHRcdGxldCBkb3duc3RyZWFtS2V5RG93bnMgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldFdpbmRvdywgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgKCkgPT4gZG93bnN0cmVhbUtleURvd25zKyssIHRydWUpKTtcblxuXHRcdG5hdmlnYXRpb24uZm9jdXNGaXJzdCgpO1xuXHRcdGRpc3BhdGNoS2V5KGZpcnN0LCAna2V5ZG93bicsICdUYWInKTtcblx0XHRzZWNvbmQuZm9jdXMoKTtcblx0XHRkaXNwYXRjaEtleShzZWNvbmQsICdrZXlkb3duJywgJ1RhYicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhY3RpdmVFbGVtZW50OiBkb2N1bWVudC5hY3RpdmVFbGVtZW50LFxuXHRcdFx0ZG93bnN0cmVhbUtleURvd25zLFxuXHRcdH0sIHtcblx0XHRcdGFjdGl2ZUVsZW1lbnQ6IHRoaXJkLFxuXHRcdFx0ZG93bnN0cmVhbUtleURvd25zOiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsZWF2ZXMgcG9wdXAga2V5ZG93biBoYW5kbGluZyBhY3RpdmUgYW5kIHN1cHByZXNzZXMgaXRzIEVzY2FwZSBrZXl1cCcsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZChjb250YWluZXIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSB9KTtcblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBET00uZ2V0V2luZG93KGNvbnRhaW5lcik7XG5cdFx0Y29uc3QgdHJpZ2dlciA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKSk7XG5cdFx0Y29uc3QgcG9wdXAgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JykpO1xuXHRcdGNvbnN0IHBvcHVwSW5wdXQgPSBwb3B1cC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbnB1dCcpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJBdXRvbWF0aW9uRGlhbG9nS2V5Ym9hcmROYXZpZ2F0aW9uKFxuXHRcdFx0dGFyZ2V0V2luZG93LFxuXHRcdFx0KCkgPT4gW3RyaWdnZXJdLFxuXHRcdFx0dGFyZ2V0ID0+IHBvcHVwLmNvbnRhaW5zKHRhcmdldCksXG5cdFx0KSk7XG5cdFx0bGV0IGRvd25zdHJlYW1LZXlEb3ducyA9IDA7XG5cdFx0bGV0IGRvd25zdHJlYW1LZXlVcHMgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldFdpbmRvdywgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgKCkgPT4gZG93bnN0cmVhbUtleURvd25zKyssIHRydWUpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXRXaW5kb3csIERPTS5FdmVudFR5cGUuS0VZX1VQLCAoKSA9PiBkb3duc3RyZWFtS2V5VXBzKyssIHRydWUpKTtcblxuXHRcdHBvcHVwSW5wdXQuZm9jdXMoKTtcblx0XHRkaXNwYXRjaEtleShwb3B1cElucHV0LCAna2V5ZG93bicsICdFc2NhcGUnKTtcblx0XHR0cmlnZ2VyLmZvY3VzKCk7XG5cdFx0ZGlzcGF0Y2hLZXkodHJpZ2dlciwgJ2tleXVwJywgJ0VzY2FwZScpO1xuXHRcdGRpc3BhdGNoS2V5KHRyaWdnZXIsICdrZXlkb3duJywgJ0VzY2FwZScpO1xuXHRcdGRpc3BhdGNoS2V5KHRyaWdnZXIsICdrZXl1cCcsICdFc2NhcGUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZG93bnN0cmVhbUtleURvd25zLFxuXHRcdFx0ZG93bnN0cmVhbUtleVVwcyxcblx0XHR9LCB7XG5cdFx0XHRkb3duc3RyZWFtS2V5RG93bnM6IDIsXG5cdFx0XHRkb3duc3RyZWFtS2V5VXBzOiAxLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksU0FBUztBQUNyQixTQUFTLGlCQUFpQixlQUFlO0FBRXpDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGNBQXVCO0FBQ2hDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLE1BQU0scUJBQXFCO0FBQ3BDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNEJBQTRCO0FBSXJDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsYUFBYSxzQkFBc0I7QUFHNUMsU0FBUyxZQUE0QixtQkFBbUI7QUFFeEQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx3Q0FBd0MsOEJBQTRELCtCQUErQiw0Q0FBNEMsa0NBQWtDLDZCQUE2QjtBQUN2UCxTQUFTLGdDQUFnQztBQUV6QyxNQUFNLFNBQVMsSUFBSSxLQUFLLFlBQVk7QUFFcEMsU0FBUyxZQUFZLFFBQXFCLE1BQTJCLEtBQWEsV0FBVyxPQUFzQjtBQUNsSCxRQUFNLFFBQVEsSUFBSSxjQUFjLE1BQU0sRUFBRSxLQUFLLFNBQVMsTUFBTSxZQUFZLE1BQU0sU0FBUyxDQUFDO0FBQ3hGLFNBQU8sY0FBYyxLQUFLO0FBQzFCLFNBQU87QUFDUjtBQUVBLE1BQU0scUNBQXFDLEtBQTJCLEVBQUU7QUFBQSxFQUF4RTtBQUFBO0FB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
