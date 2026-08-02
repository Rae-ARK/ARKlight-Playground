import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../../base/test/common/utils.js";
import { Codicon } from "../../../../../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../../../../../base/common/htmlContent.js";
import { ActionListItemKind } from "../../../../../../../../platform/actionWidget/browser/actionList.js";
import { StateType } from "../../../../../../../../platform/update/common/update.js";
import { buildModelPickerItems, getControlModelsForEntitlement, getModelPickerAccessibilityProvider, getModelPickerControlModels } from "../../../../../browser/widget/input/modelPicker/modelPickerItems.js";
import { filterModelsForSession } from "../../../../../browser/widget/input/chatInputModelUtils.js";
import { ChatAgentLocation, ChatModeKind } from "../../../../../common/constants.js";
import { ChatEntitlement } from "../../../../../../../services/chat/common/chatEntitlementService.js";
function createStubEntitlementService(opts) {
  return {
    entitlement: opts?.entitlement ?? ChatEntitlement.Pro,
    sentiment: { completed: true },
    isInternal: opts?.isInternal ?? false,
    anonymous: opts?.anonymous ?? false
  };
}
const stubChatEntitlementService = createStubEntitlementService();
function createModel(id, name, vendor = "copilot") {
  return {
    identifier: `${vendor}-${id}`,
    metadata: {
      id,
      name,
      vendor,
      version: id,
      family: vendor,
      maxInputTokens: 128e3,
      maxOutputTokens: 4096,
      isDefaultForLocation: {}
    }
  };
}
function createAutoModel() {
  return createModel("auto", "Auto", "copilot");
}
function createAgentHostModel(id, name, modelGroup) {
  const vendor = "agent-host-copilotcli";
  return {
    identifier: `${vendor}:${id}`,
    metadata: {
      id,
      name,
      vendor,
      version: "1.0",
      family: id,
      maxInputTokens: 128e3,
      maxOutputTokens: 4096,
      isDefaultForLocation: {},
      targetChatSessionType: vendor,
      modelGroup
    }
  };
}
function getActionItems(items) {
  return items.filter((i) => i.kind === ActionListItemKind.Action);
}
function getActionLabels(items) {
  return getActionItems(items).map((i) => i.label);
}
function getSeparatorCount(items) {
  return items.filter((i) => i.kind === ActionListItemKind.Separator).length;
}
const stubManageModelsAction = {
  id: "manageModels",
  enabled: true,
  checked: false,
  class: void 0,
  tooltip: "Manage Language Models",
  label: "Manage Models...",
  run: () => {
  }
};
const stubLanguageModelsService = { getModelConfigurationActions: () => [], getModelConfiguration: () => void 0, getVendors: () => [], getLanguageModelGroups: () => [] };
function createLanguageModelsServiceStub(vendors) {
  return {
    getModelConfigurationActions: () => [],
    getModelConfiguration: () => void 0,
    getVendors: () => vendors.map((v) => ({ vendor: v.vendor, displayName: v.displayName })),
    getLanguageModelGroups: (vendor) => {
      const v = vendors.find((x) => x.vendor === vendor);
      if (!v) {
        return [];
      }
      return v.groups.map((g) => ({
        group: { vendor: v.vendor, name: g.name },
        modelIdentifiers: g.modelIdentifiers
      }));
    }
  };
}
function callBuild(models, opts = {}) {
  const onSelect = opts.onSelect ?? (() => {
  });
  const entitlementService = opts.entitlementService ?? createStubEntitlementService({
    entitlement: opts.entitlement ?? ChatEntitlement.Pro,
    anonymous: opts.anonymous ?? false
  });
  return buildModelPickerItems({
    models,
    selectedModelId: opts.selectedModelId,
    recentModelIds: opts.recentModelIds ?? [],
    pinnedModelIds: opts.pinnedModelIds ?? [],
    controlModels: opts.controlModels ?? {},
    currentVSCodeVersion: opts.currentVSCodeVersion ?? "1.100.0",
    updateStateType: opts.updateStateType ?? StateType.Idle,
    manageSettingsUrl: opts.manageSettingsUrl,
    manageModelsAction: stubManageModelsAction,
    chatEntitlementService: entitlementService,
    languageModelsService: opts.languageModelsService ?? stubLanguageModelsService,
    openerService: void 0,
    presentation: {
      useGroupedModelPicker: true,
      showUnavailableFeatured: opts.showUnavailableFeatured ?? true,
      showFeatured: opts.showFeatured ?? true,
      showAutoModel: opts.showAutoModel ?? true,
      restrictedMode: opts.restrictedMode ?? false,
      setupRequired: opts.setupRequired ?? false,
      isUBB: false
    },
    actions: {
      onSelect,
      onTogglePin: void 0,
      onConfigure: void 0,
      onRequestTrust: opts.onRequestTrust,
      onRequestSetup: opts.onRequestSetup
    }
  });
}
function createControlManifest() {
  return {
    free: {
      "free-model": { label: "Free Model", featured: true, exists: true }
    },
    paid: {
      "paid-model": { label: "Paid Model", featured: true, exists: true }
    }
  };
}
suite("buildModelPickerItems", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("accessibility provider uses radio semantics for model items", () => {
    const provider = getModelPickerAccessibilityProvider();
    assert.strictEqual(provider.getRole({ kind: ActionListItemKind.Action }), "menuitemradio");
    assert.strictEqual(provider.getRole({ kind: ActionListItemKind.Separator }), "separator");
    assert.strictEqual(provider.getWidgetRole(), "menu");
  });
  test("accessibility provider announces the Restricted Mode Trust action as a plain menuitem (not a radio)", () => {
    const provider = getModelPickerAccessibilityProvider();
    const trust = getActionItems(callBuild([], { restrictedMode: true, onRequestTrust: () => {
    } })).find((a) => a.item?.id === "restrictedModeTrust");
    assert.ok(trust, "expected a Trust Workspace action");
    assert.strictEqual(provider.getRole(trust), "menuitem");
    assert.strictEqual(provider.isChecked(trust), void 0);
  });
  test("accessibility provider announces the Sign In action as a plain menuitem (not a radio)", () => {
    const provider = getModelPickerAccessibilityProvider();
    const signIn = getActionItems(callBuild([], { setupRequired: true, onRequestSetup: () => {
    } })).find((a) => a.item?.id === "setupRequiredSignIn");
    assert.ok(signIn, "expected a Sign In action");
    assert.strictEqual(provider.getRole(signIn), "menuitem");
    assert.strictEqual(provider.isChecked(signIn), void 0);
  });
  test("accessibility provider includes inline source and right-aligned multiplier", () => {
    const provider = getModelPickerAccessibilityProvider();
    assert.strictEqual(provider.getAriaLabel({
      kind: ActionListItemKind.Action,
      label: "Claude Opus 4.7",
      badge: "Copilot",
      description: "15x"
    }), "Claude Opus 4.7, Copilot, 15x");
  });
  test("accessibility provider prefers ariaDescription over description", () => {
    const provider = getModelPickerAccessibilityProvider();
    assert.strictEqual(provider.getAriaLabel({
      kind: ActionListItemKind.Action,
      label: "Claude Sonnet 4.6",
      description: "Copilot",
      ariaDescription: "Medium cost"
    }), "Claude Sonnet 4.6, Medium cost");
  });
  test("auto model always appears first", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const items = callBuild([modelA, auto]);
    const actions = getActionItems(items);
    assert.strictEqual(actions[0].label, "Auto");
  });
  test("empty models list produces auto and manage models entries", () => {
    const items = callBuild([]);
    const actions = getActionItems(items);
    assert.strictEqual(actions.length, 2);
    assert.strictEqual(actions[0].label, "Auto");
    assert.strictEqual(actions[1].item?.id, "manageModels");
  });
  test("showAutoModel=false shows a disabled no-models entry instead of auto", () => {
    const items = callBuild([], { showAutoModel: false });
    const actions = getActionItems(items);
    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions.some((a) => a.label === "Auto"), false);
    assert.strictEqual(actions[0].item?.id, "noModels");
    assert.strictEqual(actions[0].item?.enabled, false);
  });
  test("showAutoModel=false attaches inline upgrade link for Free users", () => {
    const items = callBuild([], { showAutoModel: false, entitlement: ChatEntitlement.Free });
    const actions = getActionItems(items);
    const noModels = actions.find((a) => a.item?.id === "noModels");
    assert.ok(noModels, "expected a no-models entry");
    assert.ok(noModels.description, "expected an upgrade description for Free users");
  });
  test("showAutoModel=false omits upgrade link for paid users", () => {
    const items = callBuild([], { showAutoModel: false, entitlement: ChatEntitlement.Pro });
    const actions = getActionItems(items);
    const noModels = actions.find((a) => a.item?.id === "noModels");
    assert.ok(noModels, "expected a no-models entry");
    assert.strictEqual(noModels.description, void 0);
  });
  test("showAutoModel=false with available models shows the models, not the empty state", () => {
    const items = callBuild([createModel("gpt-4o", "GPT-4o")], { showAutoModel: false });
    const actions = getActionItems(items);
    assert.strictEqual(actions.some((a) => a.item?.id === "noModels"), false);
    assert.strictEqual(actions.some((a) => a.label === "GPT-4o"), true);
  });
  test("restrictedMode shows an explanatory header and a Trust Workspace action instead of auto", () => {
    const items = callBuild([], { restrictedMode: true, onRequestTrust: () => {
    } });
    const actions = getActionItems(items);
    assert.ok(items.some((i) => i.kind === ActionListItemKind.Header && i.label === "Models unavailable while in Restricted mode"));
    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].item?.id, "restrictedModeTrust");
    assert.strictEqual(actions[0].item?.enabled, true);
    assert.strictEqual(actions.some((a) => a.label === "Auto"), false);
    assert.strictEqual(actions.some((a) => a.item?.id === "manageModels"), false);
    assert.strictEqual(actions.some((a) => a.item?.id === "noModels"), false);
  });
  test("restrictedMode Trust action is disabled without a trust callback", () => {
    const items = callBuild([], { restrictedMode: true });
    const trust = getActionItems(items).find((a) => a.item?.id === "restrictedModeTrust");
    assert.strictEqual(trust?.item?.enabled, false);
    assert.strictEqual(trust?.disabled, true);
  });
  test("restrictedMode takes precedence over showAutoModel", () => {
    const items = callBuild([], { restrictedMode: true, showAutoModel: true });
    const actions = getActionItems(items);
    assert.strictEqual(actions.some((a) => a.label === "Auto"), false);
    assert.strictEqual(actions.some((a) => a.item?.id === "restrictedModeTrust"), true);
  });
  test("restrictedMode Trust action invokes the trust callback", () => {
    let trustRequested = 0;
    const items = callBuild([], { restrictedMode: true, onRequestTrust: () => {
      trustRequested++;
    } });
    const trustAction = getActionItems(items).find((a) => a.item?.id === "restrictedModeTrust");
    assert.ok(trustAction, "expected a Trust Workspace action");
    trustAction.item.run();
    assert.strictEqual(trustRequested, 1);
  });
  test("restrictedMode takes precedence even over cached models", () => {
    const items = callBuild([createModel("gpt-4o", "GPT-4o")], { restrictedMode: true });
    const actions = getActionItems(items);
    assert.strictEqual(actions.some((a) => a.label === "GPT-4o"), false);
    assert.strictEqual(actions.some((a) => a.item?.id === "restrictedModeTrust"), true);
  });
  test("setupRequired shows an explanatory header and a Sign In action instead of auto", () => {
    const items = callBuild([], { setupRequired: true, onRequestSetup: () => {
    } });
    const actions = getActionItems(items);
    assert.ok(items.some((i) => i.kind === ActionListItemKind.Header && i.label === "Sign in to use Copilot"));
    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].item?.id, "setupRequiredSignIn");
    assert.strictEqual(actions[0].item?.enabled, true);
    assert.strictEqual(actions.some((a) => a.label === "Auto"), false);
    assert.strictEqual(actions.some((a) => a.item?.id === "manageModels"), false);
  });
  test("setupRequired Sign In action is disabled without a setup callback", () => {
    const items = callBuild([], { setupRequired: true });
    const signIn = getActionItems(items).find((a) => a.item?.id === "setupRequiredSignIn");
    assert.strictEqual(signIn?.item?.enabled, false);
    assert.strictEqual(signIn?.disabled, true);
  });
  test("setupRequired Sign In action invokes the setup callback", () => {
    let setupRequested = 0;
    const items = callBuild([], { setupRequired: true, onRequestSetup: () => {
      setupRequested++;
    } });
    const signIn = getActionItems(items).find((a) => a.item?.id === "setupRequiredSignIn");
    assert.ok(signIn, "expected a Sign In action");
    signIn.item.run();
    assert.strictEqual(setupRequested, 1);
  });
  test("setupRequired takes precedence even over cached models", () => {
    const items = callBuild([createModel("gpt-4o", "GPT-4o")], { setupRequired: true });
    const actions = getActionItems(items);
    assert.strictEqual(actions.some((a) => a.label === "GPT-4o"), false);
    assert.strictEqual(actions.some((a) => a.item?.id === "setupRequiredSignIn"), true);
  });
  test("restrictedMode takes precedence over setupRequired", () => {
    const items = callBuild([], { restrictedMode: true, setupRequired: true, onRequestTrust: () => {
    }, onRequestSetup: () => {
    } });
    const actions = getActionItems(items);
    assert.strictEqual(actions.some((a) => a.item?.id === "restrictedModeTrust"), true);
    assert.strictEqual(actions.some((a) => a.item?.id === "setupRequiredSignIn"), false);
  });
  test("only auto model produces auto and manage models with separator", () => {
    const items = callBuild([createAutoModel()]);
    const actions = getActionItems(items);
    assert.strictEqual(actions.length, 2);
    assert.strictEqual(actions[0].label, "Auto");
    assert.strictEqual(actions[1].item?.id, "manageModels");
    assert.strictEqual(getSeparatorCount(items), 1);
  });
  test("selected model appears in promoted section", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const modelB = createModel("claude", "Claude");
    const items = callBuild([auto, modelA, modelB], {
      selectedModelId: modelA.identifier
    });
    const actions = getActionItems(items);
    assert.strictEqual(actions[0].label, "Auto");
    assert.strictEqual(actions[1].label, "GPT-4o");
    assert.ok(actions[1].item?.checked);
  });
  test("selected model with failing minVSCodeVersion shows as unavailable with reason update", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const items = callBuild([auto, modelA], {
      selectedModelId: modelA.identifier,
      controlModels: {
        "gpt-4o": { label: "GPT-4o", minVSCodeVersion: "2.0.0", exists: true }
      },
      currentVSCodeVersion: "1.90.0"
    });
    const actions = getActionItems(items);
    const promotedItem = actions.find((a) => a.label === "GPT-4o");
    assert.ok(promotedItem);
    assert.strictEqual(promotedItem.disabled, true);
    assert.strictEqual(promotedItem.item?.enabled, false);
  });
  test("recently used models appear in promoted section", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const modelB = createModel("claude", "Claude");
    const modelC = createModel("gemini", "Gemini");
    const items = callBuild([auto, modelA, modelB, modelC], {
      recentModelIds: [modelB.identifier]
    });
    const actions = getActionItems(items);
    assert.strictEqual(actions[0].label, "Auto");
    assert.strictEqual(actions[1].label, "Claude");
  });
  test("model variants sharing metadata ids remain visible across promoted and other sections", () => {
    const auto = createAutoModel();
    const copilotSol = createModel("gpt-5.6-sol", "GPT-5.6 Sol");
    const copilotTerra = createModel("gpt-5.6-terra", "GPT-5.6 Terra");
    const byokSol = createModel("gpt-5.6-sol", "GPT-5.6 Sol", "openai");
    const byokTerra = createModel("gpt-5.6-terra", "GPT-5.6 Terra", "openai");
    const copilotOther = createModel("gpt-5.5", "GPT-5.5");
    const byokOther = createModel("gpt-5.5", "GPT-5.5", "openai");
    const languageModelsService = createLanguageModelsServiceStub([
      { vendor: "copilot", displayName: "Copilot", groups: [] },
      {
        vendor: "openai",
        displayName: "OpenAI",
        groups: [{ name: "OpenAI (Work)", modelIdentifiers: [byokSol.identifier, byokTerra.identifier, byokOther.identifier] }]
      }
    ]);
    const items = callBuild([auto, copilotSol, copilotTerra, copilotOther, byokSol, byokTerra, byokOther], {
      recentModelIds: [copilotSol.identifier, byokSol.identifier, copilotTerra.identifier, byokTerra.identifier],
      languageModelsService
    });
    assert.deepStrictEqual(getActionItems(items).filter((item) => !item.isSectionToggle && item.label !== "Auto" && item.item?.id !== "manageModels").map((item) => ({ id: item.item?.id, section: item.section, provider: item.badge })), [
      { id: copilotSol.identifier, section: void 0, provider: "Copilot" },
      { id: byokSol.identifier, section: void 0, provider: "OpenAI (Work)" },
      { id: copilotTerra.identifier, section: void 0, provider: "Copilot" },
      { id: copilotOther.identifier, section: "other", provider: void 0 },
      { id: byokOther.identifier, section: "other", provider: void 0 },
      { id: byokTerra.identifier, section: "other", provider: void 0 }
    ]);
  });
  test("recently used model not in models list but in controlModels shows as unavailable (upgrade for free user)", () => {
    const auto = createAutoModel();
    const items = callBuild([auto], {
      recentModelIds: ["missing-model"],
      controlModels: {
        "missing-model": { label: "Missing Model", exists: false }
      },
      entitlement: ChatEntitlement.Free
    });
    const actions = getActionItems(items);
    const unavailable = actions.find((a) => a.label === "Missing Model");
    assert.ok(unavailable);
    assert.strictEqual(unavailable.disabled, true);
  });
  test("recently used model not in models list shows as unavailable (update for version mismatch)", () => {
    const auto = createAutoModel();
    const items = callBuild([auto], {
      recentModelIds: ["missing-model"],
      controlModels: {
        "missing-model": { label: "Missing Model", minVSCodeVersion: "2.0.0", exists: false }
      },
      currentVSCodeVersion: "1.90.0"
    });
    const actions = getActionItems(items);
    const unavailable = actions.find((a) => a.label === "Missing Model");
    assert.ok(unavailable);
    assert.strictEqual(unavailable.disabled, true);
  });
  test("recently used model not in models list shows as unavailable (admin for pro user without version issue)", () => {
    const auto = createAutoModel();
    const items = callBuild([auto], {
      recentModelIds: ["missing-model"],
      controlModels: {
        "missing-model": { label: "Missing Model", exists: false }
      }
    });
    const actions = getActionItems(items);
    const unavailable = actions.find((a) => a.label === "Missing Model");
    assert.ok(unavailable);
    assert.strictEqual(unavailable.disabled, true);
  });
  test("featured control models appear in promoted section", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const modelB = createModel("claude", "Claude");
    const items = callBuild([auto, modelA, modelB], {
      controlModels: {
        "gpt-4o": { label: "GPT-4o", featured: true, exists: true }
      }
    });
    const actions = getActionItems(items);
    assert.strictEqual(actions[0].label, "Auto");
    assert.strictEqual(actions[1].label, "GPT-4o");
  });
  test("edu entitlement uses free featured control manifest", () => {
    const manifest = createControlManifest();
    assert.strictEqual(getControlModelsForEntitlement(manifest, ChatEntitlement.EDU), manifest.free);
  });
  test("available targeted models remain featured while entitlement is signed out", () => {
    const auto = createAgentHostModel("auto", "Auto", { id: "copilotcli" });
    const freeFeatured = createAgentHostModel("free-model", "Free Model", { id: "copilotcli" });
    const paidFeatured = createAgentHostModel("paid-model", "Paid Model", { id: "copilotcli" });
    const other = createAgentHostModel("other-model", "Other Model", { id: "copilotcli" });
    const models = [auto, freeFeatured, paidFeatured, other];
    const controlModels = getModelPickerControlModels(createControlManifest(), ChatEntitlement.Unknown, models);
    const actions = getActionItems(callBuild(models, {
      selectedModelId: auto.identifier,
      controlModels,
      entitlement: ChatEntitlement.Unknown
    }));
    assert.deepStrictEqual(actions.map((action) => ({
      label: action.label,
      section: action.section,
      isSectionToggle: action.isSectionToggle
    })), [
      { label: "Auto", section: void 0, isSectionToggle: void 0 },
      { label: "Free Model", section: void 0, isSectionToggle: void 0 },
      { label: "Paid Model", section: void 0, isSectionToggle: void 0 },
      { label: "Other Models", section: "other", isSectionToggle: true },
      { label: "Other Model", section: "other", isSectionToggle: void 0 }
    ]);
  });
  test("signed-out control models exclude unavailable and BYOK models", () => {
    const manifest = {
      free: {
        "available-targeted": { label: "Available Targeted", featured: true, exists: false },
        "unavailable-targeted": { label: "Unavailable Targeted", featured: true, exists: false },
        "byok-model": { label: "BYOK Model", featured: true, exists: true }
      },
      paid: {}
    };
    const availableTargeted = createAgentHostModel("available-targeted", "Available Targeted", { id: "copilotcli" });
    const baseByokModel = createAgentHostModel("byok-model", "BYOK Model", { id: "custom" });
    const byokModel = { ...baseByokModel, metadata: { ...baseByokModel.metadata, byokModelIdentifier: "custom/byok-model" } };
    assert.deepStrictEqual(getModelPickerControlModels(manifest, ChatEntitlement.Unknown, [availableTargeted, byokModel]), {
      "available-targeted": { label: "Available Targeted", featured: true, exists: true }
    });
  });
  test("featured model not in models list shows as unavailable for free users (upgrade)", () => {
    const auto = createAutoModel();
    const items = callBuild([auto], {
      controlModels: {
        "premium-model": { label: "Premium Model", featured: true, exists: false }
      },
      entitlement: ChatEntitlement.Free
    });
    const actions = getActionItems(items);
    const unavailable = actions.find((a) => a.label === "Premium Model");
    assert.ok(unavailable);
    assert.strictEqual(unavailable.disabled, true);
  });
  test("featured model not in models list shows as unavailable for pro users (admin)", () => {
    const auto = createAutoModel();
    const items = callBuild([auto], {
      controlModels: {
        "premium-model": { label: "Premium Model", featured: true, exists: false }
      }
    });
    const actions = getActionItems(items);
    const unavailable = actions.find((a) => a.label === "Premium Model");
    assert.ok(unavailable);
    assert.strictEqual(unavailable.disabled, true);
  });
  test("featured model with minVSCodeVersion shows as unavailable (update) when version too low", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const items = callBuild([auto, modelA], {
      controlModels: {
        "gpt-4o": { label: "GPT-4o", featured: true, minVSCodeVersion: "2.0.0", exists: true }
      },
      currentVSCodeVersion: "1.90.0"
    });
    const actions = getActionItems(items);
    const unavailable = actions.find((a) => a.label === "GPT-4o");
    assert.ok(unavailable);
    assert.strictEqual(unavailable.disabled, true);
  });
  test("non-featured control models do NOT appear in promoted section", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const modelB = createModel("claude", "Claude");
    const items = callBuild([auto, modelA, modelB], {
      controlModels: {
        "gpt-4o": { label: "GPT-4o", featured: false, exists: true }
      }
    });
    const seps = items.filter((i) => i.kind === ActionListItemKind.Separator);
    assert.strictEqual(seps.length, 1);
    const actions = getActionItems(items);
    assert.strictEqual(actions[0].label, "Auto");
    assert.strictEqual(actions[1].isSectionToggle, true);
  });
  test("available promoted models are sorted alphabetically", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const modelB = createModel("claude", "Claude");
    const modelC = createModel("gemini", "Gemini");
    const items = callBuild([auto, modelA, modelB, modelC], {
      recentModelIds: [modelA.identifier, modelB.identifier, modelC.identifier]
    });
    const actions = getActionItems(items);
    assert.strictEqual(actions[1].label, "Claude");
    assert.strictEqual(actions[2].label, "Gemini");
    assert.strictEqual(actions[3].label, "GPT-4o");
  });
  test("unavailable promoted models appear after available ones", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const items = callBuild([auto, modelA], {
      recentModelIds: [modelA.identifier, "missing-model"],
      controlModels: {
        "missing-model": { label: "Missing Model", exists: false }
      },
      entitlement: ChatEntitlement.Free
    });
    const actions = getActionItems(items);
    assert.strictEqual(actions[0].label, "Auto");
    assert.strictEqual(actions[1].label, "GPT-4o");
    assert.ok(!actions[1].disabled);
    assert.strictEqual(actions[2].label, "Missing Model");
    assert.strictEqual(actions[2].disabled, true);
  });
  test("models not in promoted section appear in Other Models section", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const modelB = createModel("claude", "Claude");
    const items = callBuild([auto, modelA, modelB]);
    const actions = getActionItems(items);
    assert.strictEqual(actions[0].label, "Auto");
    assert.strictEqual(actions[1].isSectionToggle, true);
    assert.ok(actions[1].label.includes("Other Models"));
  });
  test("Other Models section includes section toggle", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const items = callBuild([auto, modelA]);
    const toggles = getActionItems(items).filter((i) => i.isSectionToggle);
    assert.strictEqual(toggles.length, 1);
    assert.ok(toggles[0].label.includes("Other Models"));
  });
  test("Other Models section includes Manage Models in toolbar", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const items = callBuild([auto, modelA]);
    const toggle = getActionItems(items).find((i) => i.isSectionToggle);
    assert.ok(toggle);
    assert.ok(toggle.toolbarActions);
    assert.strictEqual(toggle.toolbarActions.length, 1);
    assert.strictEqual(toggle.toolbarActions[0].id, "manageModels");
  });
  test("Other Models with minVSCodeVersion that fails shows as disabled", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const items = callBuild([auto, modelA], {
      controlModels: {
        "gpt-4o": { label: "GPT-4o", minVSCodeVersion: "2.0.0", exists: true }
      },
      currentVSCodeVersion: "1.90.0"
    });
    const actions = getActionItems(items);
    const gptItem = actions.find((a) => a.label === "GPT-4o");
    assert.ok(gptItem);
    assert.strictEqual(gptItem.disabled, true);
  });
  test("Other Models places unavailable models after available models", () => {
    const auto = createAutoModel();
    const availableModel = createModel("zeta", "Zeta");
    const unavailableModel = createModel("alpha", "Alpha");
    const items = callBuild([auto, availableModel, unavailableModel], {
      controlModels: {
        "alpha": { label: "Alpha", minVSCodeVersion: "2.0.0", exists: true }
      },
      currentVSCodeVersion: "1.90.0"
    });
    const actions = getActionItems(items);
    const otherModelLabels = actions.slice(2).map((a) => a.label).filter((l) => !l.includes("Manage Models"));
    assert.deepStrictEqual(otherModelLabels, ["Zeta", "Alpha"]);
    assert.strictEqual(actions.find((a) => a.label === "Alpha")?.disabled, true);
  });
  test("no duplicate models across sections", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const modelB = createModel("claude", "Claude");
    const modelC = createModel("gemini", "Gemini");
    const items = callBuild([auto, modelA, modelB, modelC], {
      selectedModelId: modelA.identifier,
      recentModelIds: [modelA.identifier, modelB.identifier],
      controlModels: {
        "gpt-4o": { label: "GPT-4o", featured: true, exists: true },
        "claude": { label: "Claude", featured: true, exists: true }
      }
    });
    const labels = getActionLabels(items).filter((l) => l !== "Other Models" && !l.includes("Manage Models"));
    const uniqueLabels = new Set(labels);
    assert.strictEqual(labels.length, uniqueLabels.size, `Duplicate labels found: ${labels.join(", ")}`);
  });
  test("auto model is excluded from promoted and other sections", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const items = callBuild([auto, modelA], {
      selectedModelId: auto.identifier,
      recentModelIds: [auto.identifier],
      controlModels: {
        "auto": { label: "Auto", featured: true, exists: true }
      }
    });
    const autoItems = getActionItems(items).filter((a) => a.label === "Auto");
    assert.strictEqual(autoItems.length, 1);
  });
  test("models with no control manifest entries work fine", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const modelB = createModel("claude", "Claude");
    const items = callBuild([auto, modelA, modelB], {
      controlModels: {}
    });
    const actions = getActionItems(items);
    assert.ok(actions.length >= 3);
    assert.strictEqual(actions[0].label, "Auto");
  });
  test("promo model is boosted right after Auto", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const promoModel = createModel("gemini-flash", "Gemini Flash");
    promoModel.metadata = { ...promoModel.metadata, promo: { id: "test-promo-1", discountPercent: 20, endsAt: "2026-07-20T23:59:59Z", message: "Limited time offer" } };
    const items = callBuild([auto, modelA, promoModel]);
    const actions = getActionItems(items);
    assert.strictEqual(actions[0].label, "Auto");
    assert.strictEqual(actions[1].label, "Gemini Flash");
  });
  test("promo model shows discount in description", () => {
    const auto = createAutoModel();
    const promoModel = createModel("gemini-flash", "Gemini Flash");
    promoModel.metadata = { ...promoModel.metadata, promo: { id: "test-promo-2", discountPercent: 30, endsAt: "2026-07-20T23:59:59Z", message: "Summer sale" } };
    const items = callBuild([auto, promoModel]);
    const promoItem = getActionItems(items).find((a) => a.label === "Gemini Flash");
    assert.ok(promoItem);
    const desc = typeof promoItem.item?.description === "string" ? promoItem.item.description : "";
    assert.ok(desc.includes("30%"), `Expected description to contain "30%" but got: ${desc}`);
  });
  test("promo model is not duplicated in Other Models section", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const promoModel = createModel("gemini-flash", "Gemini Flash");
    promoModel.metadata = { ...promoModel.metadata, promo: { id: "test-promo-3", discountPercent: 20, endsAt: "2026-07-20T23:59:59Z", message: "Promo" } };
    const items = callBuild([auto, modelA, promoModel]);
    const allGemini = getActionItems(items).filter((a) => a.label === "Gemini Flash");
    assert.strictEqual(allGemini.length, 1, "Promo model should appear exactly once");
  });
  test("non-positive promo models are featured without discount details", () => {
    const auto = createAutoModel();
    const zeroDiscountModel = createModel("zero-discount", "Zero Discount");
    zeroDiscountModel.metadata = { ...zeroDiscountModel.metadata, promo: { id: "test-promo-zero", discountPercent: 0, endsAt: "2026-07-20T23:59:59Z", message: "Featured model" } };
    const negativeDiscountModel = createModel("negative-discount", "Negative Discount");
    negativeDiscountModel.metadata = { ...negativeDiscountModel.metadata, promo: { id: "test-promo-negative", discountPercent: -10, endsAt: "2026-07-20T23:59:59Z", message: "Featured model" } };
    const manifestFeaturedModel = createModel("manifest-featured", "Manifest Featured");
    const items = callBuild([auto, zeroDiscountModel, negativeDiscountModel, manifestFeaturedModel], {
      controlModels: {
        "manifest-featured": { label: "Manifest Featured", featured: true, exists: true }
      }
    });
    const labels = /* @__PURE__ */ new Set(["Auto", "Zero Discount", "Negative Discount", "Manifest Featured"]);
    const featuredItems = getActionItems(items).filter((item) => labels.has(item.label));
    assert.deepStrictEqual(featuredItems.map((item) => ({ label: item.label, description: item.description })), [
      { label: "Auto", description: void 0 },
      { label: "Manifest Featured", description: void 0 },
      { label: "Negative Discount", description: void 0 },
      { label: "Zero Discount", description: void 0 }
    ]);
  });
  test("Other Models grouped by vendor with separator headers", () => {
    const auto = createAutoModel();
    const modelA = createModel("zebra", "Zebra", "copilot");
    const modelB = createModel("alpha", "Alpha", "other-vendor");
    const modelC = createModel("beta", "Beta", "copilot");
    const items = callBuild([auto, modelA, modelB, modelC]);
    const vendorSeparators = items.filter((i) => i.kind === ActionListItemKind.Separator && i.label);
    assert.strictEqual(vendorSeparators.length, 2);
    assert.strictEqual(vendorSeparators[0].label, "Copilot");
    assert.strictEqual(vendorSeparators[1].label, "Other-vendor");
    const actions = getActionItems(items);
    const otherModelLabels = actions.filter((a) => !a.isSectionToggle && a.section === "other").map((a) => a.label);
    assert.deepStrictEqual(otherModelLabels, ["Beta", "Zebra", "Alpha"]);
  });
  test("single vendor group omits vendor separator header", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o", "copilot");
    const modelB = createModel("claude", "Claude", "copilot");
    const items = callBuild([auto, modelA, modelB]);
    const vendorSeparators = items.filter((i) => i.kind === ActionListItemKind.Separator && i.label);
    assert.strictEqual(vendorSeparators.length, 0);
  });
  test("Other Models splits a single vendor into per-group sections (BYOK)", () => {
    const auto = createAutoModel();
    const gpt41 = createModel("gpt-4.1", "gpt-4.1", "customoai");
    const ossModel = createModel("openai.gpt-oss-120b", "gpt-oss-120b", "customoai");
    const lmService = createLanguageModelsServiceStub([
      {
        vendor: "customoai",
        displayName: "OpenAI Compatible",
        groups: [
          { name: "OpenAI Compatible", modelIdentifiers: [gpt41.identifier] },
          { name: "AWS Bedrock", modelIdentifiers: [ossModel.identifier] }
        ]
      }
    ]);
    const items = callBuild([auto, gpt41, ossModel], { languageModelsService: lmService });
    const labelledSeparators = items.filter((i) => i.kind === ActionListItemKind.Separator && i.label);
    assert.deepStrictEqual(labelledSeparators.map((s) => s.label), ["AWS Bedrock", "OpenAI Compatible"]);
  });
  test("Other Models keeps a single section when a vendor has only one group (BYOK)", () => {
    const auto = createAutoModel();
    const gpt41 = createModel("gpt-4.1", "gpt-4.1", "customoai");
    const lmService = createLanguageModelsServiceStub([
      {
        vendor: "customoai",
        displayName: "OpenAI Compatible",
        groups: [{ name: "OpenAI Compatible", modelIdentifiers: [gpt41.identifier] }]
      }
    ]);
    const items = callBuild([auto, gpt41], { languageModelsService: lmService });
    const labelledSeparators = items.filter((i) => i.kind === ActionListItemKind.Separator && i.label);
    assert.strictEqual(labelledSeparators.length, 0);
  });
  test("promoted models show provider group name when groups disambiguate a single vendor (BYOK)", () => {
    const auto = createAutoModel();
    const gpt41 = createModel("gpt-4.1", "gpt-4.1", "customoai");
    const ossModel = createModel("openai.gpt-oss-120b", "gpt-oss-120b", "customoai");
    const lmService = createLanguageModelsServiceStub([
      {
        vendor: "customoai",
        displayName: "OpenAI Compatible",
        groups: [
          { name: "OpenAI Compatible", modelIdentifiers: [gpt41.identifier] },
          { name: "AWS Bedrock", modelIdentifiers: [ossModel.identifier] }
        ]
      }
    ]);
    const items = callBuild([auto, gpt41, ossModel], {
      recentModelIds: [gpt41.identifier],
      languageModelsService: lmService
    });
    const promoted = getActionItems(items).find((a) => a.label === "gpt-4.1");
    assert.ok(promoted);
    assert.strictEqual(promoted.badge, "OpenAI Compatible");
  });
  test("Other Models splits agent-host models into sections by their modelGroup and labels copilotcli as Copilot", () => {
    const auto = createAutoModel();
    const cli = createAgentHostModel("claude-haiku-4.5", "Claude Haiku 4.5", { id: "copilotcli" });
    const openai = createAgentHostModel("openai/gpt-5-nano", "GPT-5 nano", { id: "openai" });
    const hf = createAgentHostModel("huggingface/gemma", "Gemma", { id: "huggingface" });
    const service = createLanguageModelsServiceStub([
      { vendor: "copilotcli", displayName: "Copilot CLI", groups: [] },
      { vendor: "openai", displayName: "OpenAI", groups: [] },
      { vendor: "huggingface", displayName: "Hugging Face", groups: [] }
    ]);
    const items = callBuild([auto, cli, openai, hf], { languageModelsService: service });
    const labelledSeparators = items.filter((i) => i.kind === ActionListItemKind.Separator && i.label);
    assert.deepStrictEqual(labelledSeparators.map((s) => s.label), ["Copilot", "Hugging Face", "OpenAI"]);
  });
  test("Other Models keeps a single section when agent-host models share one modelGroup", () => {
    const auto = createAutoModel();
    const a = createAgentHostModel("claude-haiku-4.5", "Claude Haiku 4.5", { id: "copilotcli" });
    const b = createAgentHostModel("gpt-5", "GPT-5", { id: "copilotcli" });
    const service = createLanguageModelsServiceStub([{ vendor: "copilotcli", displayName: "Copilot CLI", groups: [] }]);
    const items = callBuild([auto, a, b], { languageModelsService: service });
    const labelledSeparators = items.filter((i) => i.kind === ActionListItemKind.Separator && i.label);
    assert.strictEqual(labelledSeparators.length, 0);
  });
  test("promoted agent-host model shows its modelGroup name as the inline badge", () => {
    const auto = createAutoModel();
    const cli = createAgentHostModel("claude-haiku-4.5", "Claude Haiku 4.5", { id: "copilotcli" });
    const openai = createAgentHostModel("openai/gpt-5-nano", "GPT-5 nano", { id: "openai" });
    const service = createLanguageModelsServiceStub([
      { vendor: "copilotcli", displayName: "Copilot CLI", groups: [] },
      { vendor: "openai", displayName: "OpenAI", groups: [] }
    ]);
    const items = callBuild([auto, cli, openai], { recentModelIds: [openai.identifier], languageModelsService: service });
    const promoted = getActionItems(items).find((a) => a.label === "GPT-5 nano");
    assert.ok(promoted);
    assert.strictEqual(promoted.badge, "OpenAI");
  });
  test("onSelect callback is wired into action items", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    let selectedModel;
    const onSelect = (m) => {
      selectedModel = m;
    };
    const items = callBuild([auto, modelA], { onSelect, entitlementService: stubChatEntitlementService });
    const gptItem = getActionItems(items).find((a) => a.label === "GPT-4o");
    assert.ok(gptItem?.item);
    gptItem.item.run();
    assert.strictEqual(selectedModel?.identifier, modelA.identifier);
  });
  test("selected model is checked, others are not", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const modelB = createModel("claude", "Claude");
    const items = callBuild([auto, modelA, modelB], {
      selectedModelId: modelA.identifier
    });
    const actions = getActionItems(items);
    const autoItem = actions.find((a) => a.label === "Auto");
    const gptItem = actions.find((a) => a.label === "GPT-4o");
    const claudeItem = actions.find((a) => a.label === "Claude");
    assert.ok(!autoItem?.item?.checked);
    assert.ok(gptItem?.item?.checked);
    assert.ok(!claudeItem?.item?.checked);
  });
  test("selected auto model is checked", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const items = callBuild([auto, modelA], {
      selectedModelId: auto.identifier
    });
    const actions = getActionItems(items);
    assert.ok(actions[0].item?.checked);
  });
  test("recently used model resolved by metadata id", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const modelB = createModel("claude", "Claude");
    const items = callBuild([auto, modelA, modelB], {
      recentModelIds: ["claude"]
    });
    const actions = getActionItems(items);
    assert.strictEqual(actions[0].label, "Auto");
    assert.strictEqual(actions[1].label, "Claude");
  });
  test("multiple featured and recent models all promoted correctly", () => {
    const auto = createAutoModel();
    const modelA = createModel("alpha", "Alpha");
    const modelB = createModel("beta", "Beta");
    const modelC = createModel("gamma", "Gamma");
    const modelD = createModel("delta", "Delta");
    const items = callBuild([auto, modelA, modelB, modelC, modelD], {
      recentModelIds: [modelC.identifier],
      controlModels: {
        "alpha": { label: "Alpha", featured: true, exists: true }
      }
    });
    const actions = getActionItems(items);
    assert.strictEqual(actions[0].label, "Auto");
    assert.strictEqual(actions[1].label, "Alpha");
    assert.strictEqual(actions[2].label, "Gamma");
    assert.ok(actions[3].isSectionToggle);
  });
  test("admin unavailable model shows manage settings link in description", () => {
    const auto = createAutoModel();
    const businessEntitlementService = createStubEntitlementService({ entitlement: ChatEntitlement.Business });
    const items = callBuild([auto], {
      recentModelIds: ["missing-model"],
      controlModels: { "missing-model": { label: "Missing Model" } },
      manageSettingsUrl: "https://aka.ms/github-copilot-settings",
      entitlementService: businessEntitlementService
    });
    const adminItem = getActionItems(items).find((a) => a.label === "Missing Model");
    assert.ok(adminItem);
    assert.strictEqual(adminItem.disabled, true);
    const description = adminItem.description;
    assert.ok(description instanceof MarkdownString);
    assert.ok(description.value.includes("https://aka.ms/github-copilot-settings"));
  });
  test("unavailable models keep indentation with blank icon", () => {
    const auto = createAutoModel();
    const items = callBuild([auto], {
      recentModelIds: ["missing-model"],
      controlModels: {
        "missing-model": { label: "Missing Model" }
      },
      entitlement: ChatEntitlement.Free
    });
    const unavailable = getActionItems(items).find((a) => a.label === "Missing Model");
    assert.ok(unavailable);
    assert.strictEqual(unavailable.hideIcon, false);
    assert.strictEqual(unavailable.group?.icon?.id, Codicon.blank.id);
  });
  test("anonymous user sees upgrade description on each unavailable model", () => {
    const auto = createAutoModel();
    const items = callBuild([auto], {
      recentModelIds: ["model-a", "model-b"],
      controlModels: {
        "model-a": { label: "Model A", featured: true, exists: false },
        "model-b": { label: "Model B", featured: true, exists: false }
      },
      anonymous: true,
      entitlement: ChatEntitlement.Unknown
    });
    const actions = getActionItems(items);
    const disabledItems = actions.filter((a) => a.disabled);
    assert.strictEqual(disabledItems.length, 2);
    assert.ok(disabledItems[0].description instanceof MarkdownString);
    assert.ok(disabledItems[0].description.value.includes("Upgrade"));
    assert.ok(disabledItems[1].description instanceof MarkdownString);
    assert.ok(disabledItems[1].description.value.includes("Upgrade"));
  });
  test("free user sees upgrade description on each unavailable model", () => {
    const auto = createAutoModel();
    const items = callBuild([auto], {
      recentModelIds: ["model-a", "model-b"],
      controlModels: {
        "model-a": { label: "Model A", featured: true, exists: false },
        "model-b": { label: "Model B", featured: true, exists: false }
      },
      entitlement: ChatEntitlement.Free
    });
    const actions = getActionItems(items);
    const disabledItems = actions.filter((a) => a.disabled);
    assert.strictEqual(disabledItems.length, 2);
    assert.ok(disabledItems[0].description instanceof MarkdownString);
    assert.ok(disabledItems[0].description.value.includes("Upgrade"));
    assert.ok(disabledItems[1].description instanceof MarkdownString);
    assert.ok(disabledItems[1].description.value.includes("Upgrade"));
  });
  test("anonymous user model selection triggers onSelect normally", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    let selectedModel;
    const onSelect = (m) => {
      selectedModel = m;
    };
    const anonymousEntitlementService = createStubEntitlementService({ entitlement: ChatEntitlement.Unknown, anonymous: true });
    const items = callBuild([auto, modelA], { onSelect, entitlementService: anonymousEntitlementService });
    const gptItem = getActionItems(items).find((a) => a.label === "GPT-4o");
    assert.ok(gptItem?.item);
    gptItem.item.run();
    assert.strictEqual(selectedModel?.identifier, modelA.identifier);
  });
  test("showFeatured=false omits featured models from promoted section", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const modelB = createModel("claude", "Claude");
    const items = callBuild([auto, modelA, modelB], {
      controlModels: {
        "gpt-4o": { label: "GPT-4o", featured: true, exists: true }
      },
      showFeatured: false
    });
    const actions = getActionItems(items);
    assert.strictEqual(actions[0].label, "Auto");
    const promotedLabels = actions.filter((a) => !a.isSectionToggle && a.section !== "other" && a.item?.id !== "manageModels").map((a) => a.label);
    assert.ok(!promotedLabels.includes("GPT-4o"), "GPT-4o should not be in promoted section when showFeatured=false");
  });
  test("showUnavailableFeatured=false omits unavailable featured models from promoted section", () => {
    const auto = createAutoModel();
    const items = callBuild([auto], {
      controlModels: {
        "premium-model": { label: "Premium Model", featured: true, exists: false }
      },
      entitlement: ChatEntitlement.Free,
      showUnavailableFeatured: false
    });
    const actions = getActionItems(items);
    const premiumItem = actions.find((a) => a.label === "Premium Model");
    assert.strictEqual(premiumItem, void 0, "Unavailable featured model should not appear when showUnavailableFeatured=false");
  });
  test("showUnavailableFeatured=false still shows available featured models", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const items = callBuild([auto, modelA], {
      controlModels: {
        "gpt-4o": { label: "GPT-4o", featured: true, exists: true }
      },
      showUnavailableFeatured: false
    });
    const actions = getActionItems(items);
    const gptItem = actions.find((a) => a.label === "GPT-4o");
    assert.ok(gptItem, "Available featured model should appear even when showUnavailableFeatured=false");
  });
  test("showUnavailableFeatured=false with version-gated model allows it in Other Models", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const items = callBuild([auto, modelA], {
      controlModels: {
        "gpt-4o": { label: "GPT-4o", featured: true, minVSCodeVersion: "2.0.0", exists: true }
      },
      showUnavailableFeatured: false
    });
    const actions = getActionItems(items);
    const promotedGpt = actions.find((a) => a.label === "GPT-4o" && a.section !== "other");
    assert.strictEqual(promotedGpt?.disabled, void 0, "Version-gated featured model should not appear as unavailable in promoted when showUnavailableFeatured=false");
    const otherGpt = actions.find((a) => a.label === "GPT-4o" && a.section === "other");
    assert.ok(otherGpt, "Version-gated featured model should appear in Other Models when showUnavailableFeatured=false");
  });
  test("model description includes pricing when set", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    modelA.metadata = { ...modelA.metadata, pricing: "3x", multiplierNumeric: 3 };
    const items = callBuild([auto, modelA]);
    const gptItem = getActionItems(items).find((a) => a.label === "GPT-4o");
    assert.ok(gptItem);
    assert.strictEqual(gptItem.item?.description, "3x");
  });
  test("model description combines detail and pricing", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    modelA.metadata = { ...modelA.metadata, detail: "High", pricing: "3x", multiplierNumeric: 3 };
    const items = callBuild([auto, modelA]);
    const gptItem = getActionItems(items).find((a) => a.label === "GPT-4o");
    assert.ok(gptItem);
    assert.strictEqual(gptItem.item?.description, "High \xB7 3x");
  });
  test("model description hides non-multiplier pricing from description", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    modelA.metadata = { ...modelA.metadata, detail: "Provider", pricing: "In: 2.04 \xB7 Out: 4.34 AICs/1M tokens" };
    const items = callBuild([auto, modelA]);
    const gptItem = getActionItems(items).find((a) => a.label === "GPT-4o");
    assert.ok(gptItem);
    assert.strictEqual(gptItem.item?.description, "Provider");
  });
  test("model description shows multiplier pricing in description", () => {
    const auto = createAutoModel();
    const modelA = createModel("claude", "Claude");
    modelA.metadata = { ...modelA.metadata, pricing: "15x", multiplierNumeric: 15 };
    const items = callBuild([auto, modelA]);
    const claudeItem = getActionItems(items).find((a) => a.label === "Claude");
    assert.ok(claudeItem);
    assert.strictEqual(claudeItem.item?.description, "15x");
  });
  test("model with no pricing and no detail has undefined description", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const items = callBuild([auto, modelA]);
    const gptItem = getActionItems(items).find((a) => a.label === "GPT-4o");
    assert.ok(gptItem);
    assert.strictEqual(gptItem.item?.description, void 0);
  });
  test("model with priceCategory shows ariaDescription with price label", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    modelA.metadata = { ...modelA.metadata, priceCategory: "medium" };
    const items = callBuild([auto, modelA]);
    const gptItem = getActionItems(items).find((a) => a.label === "GPT-4o");
    assert.ok(gptItem);
    assert.strictEqual(gptItem.description, void 0);
    assert.ok(typeof gptItem.ariaDescription === "string");
    assert.ok(!gptItem.ariaDescription.includes("circle"));
  });
  test("model with unknown priceCategory shows no circle indicators", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    modelA.metadata = { ...modelA.metadata, priceCategory: "unknown_tier" };
    const items = callBuild([auto, modelA]);
    const gptItem = getActionItems(items).find((a) => a.label === "GPT-4o");
    assert.ok(gptItem);
    assert.strictEqual(gptItem.item?.description, void 0);
    assert.strictEqual(gptItem.description, void 0);
  });
  test("promoted models show inline vendor label when multiple vendors exist across all models", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o", "copilot");
    modelA.metadata = { ...modelA.metadata, pricing: "15x", multiplierNumeric: 15 };
    const modelB = createModel("claude", "Claude", "anthropic");
    const items = callBuild([auto, modelA, modelB], {
      recentModelIds: [modelA.identifier]
    });
    const actions = getActionItems(items);
    const gptItem = actions.find((a) => a.label === "GPT-4o");
    assert.ok(gptItem);
    assert.strictEqual(gptItem.className, "chat-model-picker-inline-source");
    assert.strictEqual(gptItem.badge, "Copilot");
    assert.strictEqual(gptItem.description, "15x");
  });
  test("promoted models omit inline vendor label when only one vendor exists", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o", "copilot");
    const modelB = createModel("claude", "Claude", "copilot");
    const items = callBuild([auto, modelA, modelB], {
      recentModelIds: [modelA.identifier]
    });
    const actions = getActionItems(items);
    const gptItem = actions.find((a) => a.label === "GPT-4o");
    assert.ok(gptItem);
    assert.strictEqual(gptItem.className, void 0);
    assert.strictEqual(gptItem.badge, void 0);
  });
  test("vendor detail is suppressed in Other Models when multiple vendor groups shown", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o", "copilot");
    modelA.metadata = { ...modelA.metadata, detail: "GitHub Copilot" };
    const modelB = createModel("claude", "Claude", "anthropic");
    modelB.metadata = { ...modelB.metadata, detail: "Anthropic" };
    const items = callBuild([auto, modelA, modelB]);
    const actions = getActionItems(items);
    const gptItem = actions.find((a) => a.label === "GPT-4o");
    assert.ok(gptItem);
    assert.strictEqual(gptItem.item?.description, void 0);
    const claudeItem = actions.find((a) => a.label === "Claude");
    assert.ok(claudeItem);
    assert.strictEqual(claudeItem.item?.description, void 0);
  });
  test("pinned models are grouped by provider and sorted alphabetically", () => {
    const auto = createAutoModel();
    const copilotAlpha = createAgentHostModel("copilot-alpha", "Alpha", { id: "copilotcli" });
    const copilotZeta = createAgentHostModel("copilot-zeta", "Zeta", { id: "copilotcli" });
    const openRouterAlpha = createAgentHostModel("openrouter-alpha", "Alpha", { id: "openrouter" });
    const openRouterZeta = createAgentHostModel("openrouter-zeta", "Zeta", { id: "openrouter" });
    const languageModelsService = createLanguageModelsServiceStub([
      { vendor: "copilotcli", displayName: "Copilot CLI", groups: [] },
      { vendor: "openrouter", displayName: "Open Router", groups: [] }
    ]);
    const items = callBuild([auto, copilotZeta, openRouterZeta, copilotAlpha, openRouterAlpha], {
      pinnedModelIds: [openRouterZeta.identifier, copilotZeta.identifier, openRouterAlpha.identifier, copilotAlpha.identifier],
      languageModelsService
    });
    const pinnedSep = items.find((i) => i.kind === ActionListItemKind.Separator && i.label === "Pinned");
    assert.ok(pinnedSep, "Pinned separator header should exist");
    const pinnedSepIndex = items.indexOf(pinnedSep);
    const nextSeparatorIndex = items.findIndex((item, index) => index > pinnedSepIndex && item.kind === ActionListItemKind.Separator);
    const pinnedItems = items.slice(pinnedSepIndex + 1, nextSeparatorIndex);
    assert.deepStrictEqual(pinnedItems.map((item) => ({ provider: item.badge, name: item.label })), [
      { provider: "Copilot", name: "Alpha" },
      { provider: "Copilot", name: "Zeta" },
      { provider: "Open Router", name: "Alpha" },
      { provider: "Open Router", name: "Zeta" }
    ]);
  });
  test("pinned models do not appear in MRU/promoted section", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const modelB = createModel("claude", "Claude");
    const items = callBuild([auto, modelA, modelB], {
      pinnedModelIds: [modelA.identifier],
      recentModelIds: [modelA.identifier, modelB.identifier]
    });
    const actions = getActionItems(items);
    const gptItems = actions.filter((a) => a.label === "GPT-4o");
    assert.strictEqual(gptItems.length, 1, "Pinned model should appear exactly once");
  });
  test("MRU is capped at 3 after filtering pinned models", () => {
    const auto = createAutoModel();
    const models = [
      auto,
      createModel("m1", "Model 1"),
      createModel("m2", "Model 2"),
      createModel("m3", "Model 3"),
      createModel("m4", "Model 4"),
      createModel("m5", "Model 5")
    ];
    const items = callBuild(models, {
      recentModelIds: [models[1].identifier, models[2].identifier, models[3].identifier, models[4].identifier, models[5].identifier],
      pinnedModelIds: [models[1].identifier]
    });
    const actions = getActionItems(items);
    const promotedLabels = actions.filter((a) => !a.isSectionToggle && a.section !== "other" && a.item?.id !== "manageModels" && a.label !== "Auto" && a.label !== "Model 1").map((a) => a.label);
    assert.ok(promotedLabels.length <= 3, "MRU should be capped at 3");
    assert.ok(!promotedLabels.includes("Model 1"), "Pinned model should not be in MRU");
  });
  test("no pinned section when pinnedModelIds is empty", () => {
    const auto = createAutoModel();
    const modelA = createModel("gpt-4o", "GPT-4o");
    const items = callBuild([auto, modelA], {
      pinnedModelIds: [],
      recentModelIds: [modelA.identifier]
    });
    const pinnedSep = items.find((i) => i.kind === ActionListItemKind.Separator && i.label === "Pinned");
    assert.strictEqual(pinnedSep, void 0, "No pinned separator when there are no pinned models");
  });
});
suite("chat model picker - languageModelChatProvider visibility regression", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createCopilotModel(id, name, overrides = {}) {
    return {
      identifier: `copilot/${id}`,
      metadata: {
        id,
        name,
        vendor: "copilot",
        version: "1.0.0",
        family: "copilot",
        maxInputTokens: 128e3,
        maxOutputTokens: 4096,
        isDefaultForLocation: {},
        isUserSelectable: true,
        capabilities: { toolCalling: true, agentMode: true },
        ...overrides
      }
    };
  }
  function createThirdPartyModel(id, name, overrides = {}) {
    return {
      identifier: `my-vendor/${id}`,
      metadata: {
        id,
        name,
        vendor: "my-vendor",
        version: "1.0.0",
        family: "my-family",
        maxInputTokens: 128e3,
        maxOutputTokens: 4096,
        isDefaultForLocation: {},
        capabilities: { toolCalling: true, agentMode: true },
        ...overrides
      }
    };
  }
  function runPickerPipeline(models, languageModelsService) {
    const filtered = filterModelsForSession(
      models,
      void 0,
      ChatModeKind.Ask,
      ChatAgentLocation.Chat
    );
    const items = callBuild(filtered, { languageModelsService });
    return items.filter(
      (i) => i.kind === ActionListItemKind.Action && !i.isSectionToggle && i.label !== "Auto" && i.item?.id !== "manageModels"
    );
  }
  function buildLmService(vendors) {
    return createLanguageModelsServiceStub(
      vendors.map((v) => ({
        vendor: v.vendor,
        displayName: v.displayName,
        groups: [{ name: v.displayName, modelIdentifiers: v.modelIdentifiers }]
      }))
    );
  }
  test("regression: third-party model with isUserSelectable omitted is shown in the picker", () => {
    const tp = createThirdPartyModel("tp", "TP", { isUserSelectable: void 0 });
    const lmService = buildLmService([
      { vendor: "my-vendor", displayName: "My Vendor", modelIdentifiers: [tp.identifier] }
    ]);
    const labels = runPickerPipeline([tp], lmService).map((i) => i.label);
    assert.deepStrictEqual(
      labels,
      ["TP"],
      "A third-party `languageModelChatProvider` model that omits isUserSelectable must still appear in the picker."
    );
  });
  test("regression: third-party model with isUserSelectable: true is shown in the picker", () => {
    const tp = createThirdPartyModel("tp", "TP", { isUserSelectable: true });
    const lmService = buildLmService([
      { vendor: "my-vendor", displayName: "My Vendor", modelIdentifiers: [tp.identifier] }
    ]);
    const labels = runPickerPipeline([tp], lmService).map((i) => i.label);
    assert.deepStrictEqual(labels, ["TP"]);
  });
  test("regression: third-party model with isUserSelectable: false is hidden from the picker", () => {
    const tp = createThirdPartyModel("tp", "TP", { isUserSelectable: false });
    const lmService = buildLmService([
      { vendor: "my-vendor", displayName: "My Vendor", modelIdentifiers: [tp.identifier] }
    ]);
    const labels = runPickerPipeline([tp], lmService).map((i) => i.label);
    assert.deepStrictEqual(
      labels,
      [],
      "An explicit `isUserSelectable: false` must hide the model regardless of vendor."
    );
  });
  test("regression: copilot internal model (isUserSelectable: false) is hidden from the picker", () => {
    const internal = createCopilotModel("internal", "Internal", { isUserSelectable: false });
    const lmService = buildLmService([
      { vendor: "copilot", displayName: "GitHub Copilot", modelIdentifiers: [internal.identifier] }
    ]);
    const labels = runPickerPipeline([internal], lmService).map((i) => i.label);
    assert.deepStrictEqual(
      labels,
      [],
      "Internal copilot models marked isUserSelectable: false must remain hidden from the picker."
    );
  });
  test("regression: copilot model with omitted isUserSelectable defaults to visible", () => {
    const model = createCopilotModel("public", "Public", { isUserSelectable: void 0 });
    const lmService = buildLmService([
      { vendor: "copilot", displayName: "GitHub Copilot", modelIdentifiers: [model.identifier] }
    ]);
    const labels = runPickerPipeline([model], lmService).map((i) => i.label);
    assert.deepStrictEqual(labels, ["Public"]);
  });
  test("regression: copilot public model (isUserSelectable: true) is shown in the picker", () => {
    const pub = createCopilotModel("gpt-4o", "GPT-4o", { isUserSelectable: true });
    const lmService = buildLmService([
      { vendor: "copilot", displayName: "GitHub Copilot", modelIdentifiers: [pub.identifier] }
    ]);
    const labels = runPickerPipeline([pub], lmService).map((i) => i.label);
    assert.deepStrictEqual(labels, ["GPT-4o"]);
  });
  test("regression: mixed vendors - only explicit isUserSelectable: false models are hidden", () => {
    const copilotPublic = createCopilotModel("gpt-4o", "GPT-4o", { isUserSelectable: true });
    const copilotInternal = createCopilotModel("internal", "Internal", { isUserSelectable: false });
    const tpTrue = createThirdPartyModel("tp-true", "TP True", { isUserSelectable: true });
    const tpFalse = createThirdPartyModel("tp-false", "TP False", { isUserSelectable: false });
    const tpUndefined = createThirdPartyModel("tp-undef", "TP Undef", { isUserSelectable: void 0 });
    const lmService = buildLmService([
      {
        vendor: "copilot",
        displayName: "GitHub Copilot",
        modelIdentifiers: [copilotPublic.identifier, copilotInternal.identifier]
      },
      {
        vendor: "my-vendor",
        displayName: "My Vendor",
        modelIdentifiers: [tpTrue.identifier, tpFalse.identifier, tpUndefined.identifier]
      }
    ]);
    const labels = runPickerPipeline(
      [copilotPublic, copilotInternal, tpTrue, tpFalse, tpUndefined],
      lmService
    ).map((i) => i.label).sort();
    assert.deepStrictEqual(
      labels,
      ["GPT-4o", "TP True", "TP Undef"],
      "Picker must show every model except those with an explicit isUserSelectable: false."
    );
  });
  test("regression: third-party models without explicit opt-out match the configuration view", () => {
    const tpTrue = createThirdPartyModel("tp-true", "TP True", { isUserSelectable: true });
    const tpUndefined = createThirdPartyModel("tp-undef", "TP Undef", { isUserSelectable: void 0 });
    const allThirdParty = [tpTrue, tpUndefined];
    const lmService = buildLmService([
      {
        vendor: "my-vendor",
        displayName: "My Vendor",
        modelIdentifiers: allThirdParty.map((m) => m.identifier)
      }
    ]);
    const configurationView = lmService.getLanguageModelGroups("my-vendor").flatMap((g) => g.modelIdentifiers).sort();
    const picker = runPickerPipeline(allThirdParty, lmService).map((i) => allThirdParty.find((m) => m.metadata.name === i.label).identifier).sort();
    assert.deepStrictEqual(
      picker,
      configurationView,
      "When no third-party model opts out, the picker must show exactly the same models as the configuration view."
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9pbnB1dC9tb2RlbFBpY2tlci9tb2RlbFBpY2tlckl0ZW1zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uTGlzdEl0ZW1LaW5kLCBJQWN0aW9uTGlzdEl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25MaXN0LmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldERyb3Bkb3duLmpzJztcbmltcG9ydCB7IFN0YXRlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VwZGF0ZS9jb21tb24vdXBkYXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkTW9kZWxQaWNrZXJJdGVtcywgZ2V0Q29udHJvbE1vZGVsc0ZvckVudGl0bGVtZW50LCBnZXRNb2RlbFBpY2tlckFjY2Vzc2liaWxpdHlQcm92aWRlciwgZ2V0TW9kZWxQaWNrZXJDb250cm9sTW9kZWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvaW5wdXQvbW9kZWxQaWNrZXIvbW9kZWxQaWNrZXJJdGVtcy5qcyc7XG5pbXBvcnQgeyBmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0TW9kZWxVdGlscy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBJTW9kZWxDb250cm9sRW50cnksIElNb2RlbHNDb250cm9sTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50LCBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuXG5mdW5jdGlvbiBjcmVhdGVTdHViRW50aXRsZW1lbnRTZXJ2aWNlKG9wdHM/OiB7IGVudGl0bGVtZW50PzogQ2hhdEVudGl0bGVtZW50OyBpc0ludGVybmFsPzogYm9vbGVhbjsgYW5vbnltb3VzPzogYm9vbGVhbiB9KTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2Uge1xuXHRyZXR1cm4ge1xuXHRcdGVudGl0bGVtZW50OiBvcHRzPy5lbnRpdGxlbWVudCA/PyBDaGF0RW50aXRsZW1lbnQuUHJvLFxuXHRcdHNlbnRpbWVudDogeyBjb21wbGV0ZWQ6IHRydWUgfSBhcyBJQ2hhdEVudGl0bGVtZW50U2VydmljZVsnc2VudGltZW50J10sXG5cdFx0aXNJbnRlcm5hbDogb3B0cz8uaXNJbnRlcm5hbCA/PyBmYWxzZSxcblx0XHRhbm9ueW1vdXM6IG9wdHM/LmFub255bW91cyA/PyBmYWxzZSxcblx0fSBhcyBJQ2hhdEVudGl0bGVtZW50U2VydmljZTtcbn1cblxuY29uc3Qgc3R1YkNoYXRFbnRpdGxlbWVudFNlcnZpY2UgPSBjcmVhdGVTdHViRW50aXRsZW1lbnRTZXJ2aWNlKCk7XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vZGVsKGlkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgdmVuZG9yID0gJ2NvcGlsb3QnKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHtcblx0cmV0dXJuIHtcblx0XHRpZGVudGlmaWVyOiBgJHt2ZW5kb3J9LSR7aWR9YCxcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0aWQsXG5cdFx0XHRuYW1lLFxuXHRcdFx0dmVuZG9yLFxuXHRcdFx0dmVyc2lvbjogaWQsXG5cdFx0XHRmYW1pbHk6IHZlbmRvcixcblx0XHRcdG1heElucHV0VG9rZW5zOiAxMjgwMDAsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0fSBhcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQXV0b01vZGVsKCk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB7XG5cdHJldHVybiBjcmVhdGVNb2RlbCgnYXV0bycsICdBdXRvJywgJ2NvcGlsb3QnKTtcbn1cblxuLyoqXG4gKiBCdWlsZHMgYW4gYWdlbnQtaG9zdCBtb2RlbDogYWxsIHN1Y2ggbW9kZWxzIHNoYXJlIGEgc2luZ2xlIHZlbmRvciAodGhlXG4gKiBgYWdlbnQtaG9zdC08dHlwZT5gIHNlc3Npb24gdHlwZSkgYnV0IGRlY2xhcmUgdGhlaXIgdXBzdHJlYW0gcHJvdmlkZXInc1xuICogdmVuZG9yIGlkIHZpYSBgbW9kZWxHcm91cGAuIFRoZSBwaWNrZXIgYnVja2V0cyBieSBpdCBhbmQgcmVzb2x2ZXMgdGhlXG4gKiBkaXNwbGF5IG5hbWUgZnJvbSB0aGUgdmVuZG9yIHJlZ2lzdHJ5LlxuICovXG5mdW5jdGlvbiBjcmVhdGVBZ2VudEhvc3RNb2RlbChpZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIG1vZGVsR3JvdXA6IHsgaWQ6IHN0cmluZyB9KTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHtcblx0Y29uc3QgdmVuZG9yID0gJ2FnZW50LWhvc3QtY29waWxvdGNsaSc7XG5cdHJldHVybiB7XG5cdFx0aWRlbnRpZmllcjogYCR7dmVuZG9yfToke2lkfWAsXG5cdFx0bWV0YWRhdGE6IHtcblx0XHRcdGlkLFxuXHRcdFx0bmFtZSxcblx0XHRcdHZlbmRvcixcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0ZmFtaWx5OiBpZCxcblx0XHRcdG1heElucHV0VG9rZW5zOiAxMjgwMDAsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHR0YXJnZXRDaGF0U2Vzc2lvblR5cGU6IHZlbmRvcixcblx0XHRcdG1vZGVsR3JvdXAsXG5cdFx0fSBhcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0fTtcbn1cblxuZnVuY3Rpb24gZ2V0QWN0aW9uSXRlbXMoaXRlbXM6IElBY3Rpb25MaXN0SXRlbTxJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24+W10pOiBJQWN0aW9uTGlzdEl0ZW08SUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uPltdIHtcblx0cmV0dXJuIGl0ZW1zLmZpbHRlcihpID0+IGkua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbik7XG59XG5cbmZ1bmN0aW9uIGdldEFjdGlvbkxhYmVscyhpdGVtczogSUFjdGlvbkxpc3RJdGVtPElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbj5bXSk6IHN0cmluZ1tdIHtcblx0cmV0dXJuIGdldEFjdGlvbkl0ZW1zKGl0ZW1zKS5tYXAoaSA9PiBpLmxhYmVsISk7XG59XG5cbmZ1bmN0aW9uIGdldFNlcGFyYXRvckNvdW50KGl0ZW1zOiBJQWN0aW9uTGlzdEl0ZW08SUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uPltdKTogbnVtYmVyIHtcblx0cmV0dXJuIGl0ZW1zLmZpbHRlcihpID0+IGkua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvcikubGVuZ3RoO1xufVxuXG5jb25zdCBzdHViTWFuYWdlTW9kZWxzQWN0aW9uOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24gPSB7XG5cdGlkOiAnbWFuYWdlTW9kZWxzJyxcblx0ZW5hYmxlZDogdHJ1ZSxcblx0Y2hlY2tlZDogZmFsc2UsXG5cdGNsYXNzOiB1bmRlZmluZWQsXG5cdHRvb2x0aXA6ICdNYW5hZ2UgTGFuZ3VhZ2UgTW9kZWxzJyxcblx0bGFiZWw6ICdNYW5hZ2UgTW9kZWxzLi4uJyxcblx0cnVuOiAoKSA9PiB7IH1cbn07XG5cbmNvbnN0IHN0dWJMYW5ndWFnZU1vZGVsc1NlcnZpY2UgPSB7IGdldE1vZGVsQ29uZmlndXJhdGlvbkFjdGlvbnM6ICgpID0+IFtdLCBnZXRNb2RlbENvbmZpZ3VyYXRpb246ICgpID0+IHVuZGVmaW5lZCwgZ2V0VmVuZG9yczogKCkgPT4gW10sIGdldExhbmd1YWdlTW9kZWxHcm91cHM6ICgpID0+IFtdIH0gYXMgdW5rbm93biBhcyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlO1xuXG4vKipcbiAqIEJ1aWxkcyBhIGBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlYCBzdHViIHRoYXQgc2ltdWxhdGVzIEJZT0sgcHJvdmlkZXJcbiAqIGdyb3VwczogZWFjaCBgdmVuZG9yc2AgZW50cnkgYWR2ZXJ0aXNlcyBvbmUgb3IgbW9yZSB1c2VyLWNvbmZpZ3VyZWRcbiAqIGdyb3VwcyAobWFwcGluZyBncm91cCBuYW1lIHRvIG1vZGVsIGlkZW50aWZpZXJzKS4gVXNlZCB0byBleGVyY2lzZSB0aGVcbiAqIHBpY2tlcidzIGAodmVuZG9yLCBncm91cE5hbWUpYCBidWNrZXRpbmcgd2l0aG91dCBzcGlubmluZyB1cCB0aGUgcmVhbFxuICogc2VydmljZS5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlU3R1Yih2ZW5kb3JzOiB7IHZlbmRvcjogc3RyaW5nOyBkaXNwbGF5TmFtZTogc3RyaW5nOyBncm91cHM6IHsgbmFtZTogc3RyaW5nOyBtb2RlbElkZW50aWZpZXJzOiBzdHJpbmdbXSB9W10gfVtdKTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSB7XG5cdHJldHVybiB7XG5cdFx0Z2V0TW9kZWxDb25maWd1cmF0aW9uQWN0aW9uczogKCkgPT4gW10sXG5cdFx0Z2V0TW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0Z2V0VmVuZG9yczogKCkgPT4gdmVuZG9ycy5tYXAodiA9PiAoeyB2ZW5kb3I6IHYudmVuZG9yLCBkaXNwbGF5TmFtZTogdi5kaXNwbGF5TmFtZSB9KSksXG5cdFx0Z2V0TGFuZ3VhZ2VNb2RlbEdyb3VwczogKHZlbmRvcjogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCB2ID0gdmVuZG9ycy5maW5kKHggPT4geC52ZW5kb3IgPT09IHZlbmRvcik7XG5cdFx0XHRpZiAoIXYpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHYuZ3JvdXBzLm1hcChnID0+ICh7XG5cdFx0XHRcdGdyb3VwOiB7IHZlbmRvcjogdi52ZW5kb3IsIG5hbWU6IGcubmFtZSB9LFxuXHRcdFx0XHRtb2RlbElkZW50aWZpZXJzOiBnLm1vZGVsSWRlbnRpZmllcnMsXG5cdFx0XHR9KSk7XG5cdFx0fSxcblx0fSBhcyB1bmtub3duIGFzIElMYW5ndWFnZU1vZGVsc1NlcnZpY2U7XG59XG5cbmZ1bmN0aW9uIGNhbGxCdWlsZChcblx0bW9kZWxzOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSxcblx0b3B0czoge1xuXHRcdHNlbGVjdGVkTW9kZWxJZD86IHN0cmluZztcblx0XHRyZWNlbnRNb2RlbElkcz86IHN0cmluZ1tdO1xuXHRcdHBpbm5lZE1vZGVsSWRzPzogc3RyaW5nW107XG5cdFx0Y29udHJvbE1vZGVscz86IElTdHJpbmdEaWN0aW9uYXJ5PElNb2RlbENvbnRyb2xFbnRyeT47XG5cdFx0ZW50aXRsZW1lbnQ/OiBDaGF0RW50aXRsZW1lbnQ7XG5cdFx0Y3VycmVudFZTQ29kZVZlcnNpb24/OiBzdHJpbmc7XG5cdFx0dXBkYXRlU3RhdGVUeXBlPzogU3RhdGVUeXBlO1xuXHRcdG1hbmFnZVNldHRpbmdzVXJsPzogc3RyaW5nO1xuXHRcdGFub255bW91cz86IGJvb2xlYW47XG5cdFx0c2hvd1VuYXZhaWxhYmxlRmVhdHVyZWQ/OiBib29sZWFuO1xuXHRcdHNob3dGZWF0dXJlZD86IGJvb2xlYW47XG5cdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlPzogSUxhbmd1YWdlTW9kZWxzU2VydmljZTtcblx0XHRzaG93QXV0b01vZGVsPzogYm9vbGVhbjtcblx0XHRyZXN0cmljdGVkTW9kZT86IGJvb2xlYW47XG5cdFx0b25SZXF1ZXN0VHJ1c3Q/OiAoKSA9PiB2b2lkO1xuXHRcdHNldHVwUmVxdWlyZWQ/OiBib29sZWFuO1xuXHRcdG9uUmVxdWVzdFNldHVwPzogKCkgPT4gdm9pZDtcblx0XHRvblNlbGVjdD86IChtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyKSA9PiB2b2lkO1xuXHRcdGVudGl0bGVtZW50U2VydmljZT86IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlO1xuXHR9ID0ge30sXG4pOiBJQWN0aW9uTGlzdEl0ZW08SUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uPltdIHtcblx0Y29uc3Qgb25TZWxlY3QgPSBvcHRzLm9uU2VsZWN0ID8/ICgoKSA9PiB7IH0pO1xuXHRjb25zdCBlbnRpdGxlbWVudFNlcnZpY2UgPSBvcHRzLmVudGl0bGVtZW50U2VydmljZSA/PyBjcmVhdGVTdHViRW50aXRsZW1lbnRTZXJ2aWNlKHtcblx0XHRlbnRpdGxlbWVudDogb3B0cy5lbnRpdGxlbWVudCA/PyBDaGF0RW50aXRsZW1lbnQuUHJvLFxuXHRcdGFub255bW91czogb3B0cy5hbm9ueW1vdXMgPz8gZmFsc2UsXG5cdH0pO1xuXHRyZXR1cm4gYnVpbGRNb2RlbFBpY2tlckl0ZW1zKHtcblx0XHRtb2RlbHMsXG5cdFx0c2VsZWN0ZWRNb2RlbElkOiBvcHRzLnNlbGVjdGVkTW9kZWxJZCxcblx0XHRyZWNlbnRNb2RlbElkczogb3B0cy5yZWNlbnRNb2RlbElkcyA/PyBbXSxcblx0XHRwaW5uZWRNb2RlbElkczogb3B0cy5waW5uZWRNb2RlbElkcyA/PyBbXSxcblx0XHRjb250cm9sTW9kZWxzOiBvcHRzLmNvbnRyb2xNb2RlbHMgPz8ge30sXG5cdFx0Y3VycmVudFZTQ29kZVZlcnNpb246IG9wdHMuY3VycmVudFZTQ29kZVZlcnNpb24gPz8gJzEuMTAwLjAnLFxuXHRcdHVwZGF0ZVN0YXRlVHlwZTogb3B0cy51cGRhdGVTdGF0ZVR5cGUgPz8gU3RhdGVUeXBlLklkbGUsXG5cdFx0bWFuYWdlU2V0dGluZ3NVcmw6IG9wdHMubWFuYWdlU2V0dGluZ3NVcmwsXG5cdFx0bWFuYWdlTW9kZWxzQWN0aW9uOiBzdHViTWFuYWdlTW9kZWxzQWN0aW9uLFxuXHRcdGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IGVudGl0bGVtZW50U2VydmljZSxcblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IG9wdHMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlID8/IHN0dWJMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0b3BlbmVyU2VydmljZTogdW5kZWZpbmVkLFxuXHRcdHByZXNlbnRhdGlvbjoge1xuXHRcdFx0dXNlR3JvdXBlZE1vZGVsUGlja2VyOiB0cnVlLFxuXHRcdFx0c2hvd1VuYXZhaWxhYmxlRmVhdHVyZWQ6IG9wdHMuc2hvd1VuYXZhaWxhYmxlRmVhdHVyZWQgPz8gdHJ1ZSxcblx0XHRcdHNob3dGZWF0dXJlZDogb3B0cy5zaG93RmVhdHVyZWQgPz8gdHJ1ZSxcblx0XHRcdHNob3dBdXRvTW9kZWw6IG9wdHMuc2hvd0F1dG9Nb2RlbCA/PyB0cnVlLFxuXHRcdFx0cmVzdHJpY3RlZE1vZGU6IG9wdHMucmVzdHJpY3RlZE1vZGUgPz8gZmFsc2UsXG5cdFx0XHRzZXR1cFJlcXVpcmVkOiBvcHRzLnNldHVwUmVxdWlyZWQgPz8gZmFsc2UsXG5cdFx0XHRpc1VCQjogZmFsc2UsXG5cdFx0fSxcblx0XHRhY3Rpb25zOiB7XG5cdFx0XHRvblNlbGVjdCxcblx0XHRcdG9uVG9nZ2xlUGluOiB1bmRlZmluZWQsXG5cdFx0XHRvbkNvbmZpZ3VyZTogdW5kZWZpbmVkLFxuXHRcdFx0b25SZXF1ZXN0VHJ1c3Q6IG9wdHMub25SZXF1ZXN0VHJ1c3QsXG5cdFx0XHRvblJlcXVlc3RTZXR1cDogb3B0cy5vblJlcXVlc3RTZXR1cCxcblx0XHR9LFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQ29udHJvbE1hbmlmZXN0KCk6IElNb2RlbHNDb250cm9sTWFuaWZlc3Qge1xuXHRyZXR1cm4ge1xuXHRcdGZyZWU6IHtcblx0XHRcdCdmcmVlLW1vZGVsJzogeyBsYWJlbDogJ0ZyZWUgTW9kZWwnLCBmZWF0dXJlZDogdHJ1ZSwgZXhpc3RzOiB0cnVlIH0sXG5cdFx0fSxcblx0XHRwYWlkOiB7XG5cdFx0XHQncGFpZC1tb2RlbCc6IHsgbGFiZWw6ICdQYWlkIE1vZGVsJywgZmVhdHVyZWQ6IHRydWUsIGV4aXN0czogdHJ1ZSB9LFxuXHRcdH0sXG5cdH07XG59XG5cbnN1aXRlKCdidWlsZE1vZGVsUGlja2VySXRlbXMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYWNjZXNzaWJpbGl0eSBwcm92aWRlciB1c2VzIHJhZGlvIHNlbWFudGljcyBmb3IgbW9kZWwgaXRlbXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBnZXRNb2RlbFBpY2tlckFjY2Vzc2liaWxpdHlQcm92aWRlcigpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRSb2xlKHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbiB9IGFzIElBY3Rpb25MaXN0SXRlbTxJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24+KSwgJ21lbnVpdGVtcmFkaW8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0Um9sZSh7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IgfSBhcyBJQWN0aW9uTGlzdEl0ZW08SUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uPiksICdzZXBhcmF0b3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0V2lkZ2V0Um9sZSgpLCAnbWVudScpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2Nlc3NpYmlsaXR5IHByb3ZpZGVyIGFubm91bmNlcyB0aGUgUmVzdHJpY3RlZCBNb2RlIFRydXN0IGFjdGlvbiBhcyBhIHBsYWluIG1lbnVpdGVtIChub3QgYSByYWRpbyknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBnZXRNb2RlbFBpY2tlckFjY2Vzc2liaWxpdHlQcm92aWRlcigpO1xuXHRcdGNvbnN0IHRydXN0ID0gZ2V0QWN0aW9uSXRlbXMoY2FsbEJ1aWxkKFtdLCB7IHJlc3RyaWN0ZWRNb2RlOiB0cnVlLCBvblJlcXVlc3RUcnVzdDogKCkgPT4geyB9IH0pKS5maW5kKGEgPT4gYS5pdGVtPy5pZCA9PT0gJ3Jlc3RyaWN0ZWRNb2RlVHJ1c3QnKSE7XG5cdFx0YXNzZXJ0Lm9rKHRydXN0LCAnZXhwZWN0ZWQgYSBUcnVzdCBXb3Jrc3BhY2UgYWN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFJvbGUodHJ1c3QpLCAnbWVudWl0ZW0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuaXNDaGVja2VkKHRydXN0KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnYWNjZXNzaWJpbGl0eSBwcm92aWRlciBhbm5vdW5jZXMgdGhlIFNpZ24gSW4gYWN0aW9uIGFzIGEgcGxhaW4gbWVudWl0ZW0gKG5vdCBhIHJhZGlvKScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGdldE1vZGVsUGlja2VyQWNjZXNzaWJpbGl0eVByb3ZpZGVyKCk7XG5cdFx0Y29uc3Qgc2lnbkluID0gZ2V0QWN0aW9uSXRlbXMoY2FsbEJ1aWxkKFtdLCB7IHNldHVwUmVxdWlyZWQ6IHRydWUsIG9uUmVxdWVzdFNldHVwOiAoKSA9PiB7IH0gfSkpLmZpbmQoYSA9PiBhLml0ZW0/LmlkID09PSAnc2V0dXBSZXF1aXJlZFNpZ25JbicpITtcblx0XHRhc3NlcnQub2soc2lnbkluLCAnZXhwZWN0ZWQgYSBTaWduIEluIGFjdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRSb2xlKHNpZ25JbiksICdtZW51aXRlbScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5pc0NoZWNrZWQoc2lnbkluKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnYWNjZXNzaWJpbGl0eSBwcm92aWRlciBpbmNsdWRlcyBpbmxpbmUgc291cmNlIGFuZCByaWdodC1hbGlnbmVkIG11bHRpcGxpZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBnZXRNb2RlbFBpY2tlckFjY2Vzc2liaWxpdHlQcm92aWRlcigpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRBcmlhTGFiZWwoe1xuXHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdGxhYmVsOiAnQ2xhdWRlIE9wdXMgNC43Jyxcblx0XHRcdGJhZGdlOiAnQ29waWxvdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogJzE1eCcsXG5cdFx0fSBhcyBJQWN0aW9uTGlzdEl0ZW08SUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uPiksICdDbGF1ZGUgT3B1cyA0LjcsIENvcGlsb3QsIDE1eCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2Nlc3NpYmlsaXR5IHByb3ZpZGVyIHByZWZlcnMgYXJpYURlc2NyaXB0aW9uIG92ZXIgZGVzY3JpcHRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBnZXRNb2RlbFBpY2tlckFjY2Vzc2liaWxpdHlQcm92aWRlcigpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRBcmlhTGFiZWwoe1xuXHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdGxhYmVsOiAnQ2xhdWRlIFNvbm5ldCA0LjYnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdDb3BpbG90Jyxcblx0XHRcdGFyaWFEZXNjcmlwdGlvbjogJ01lZGl1bSBjb3N0Jyxcblx0XHR9IGFzIElBY3Rpb25MaXN0SXRlbTxJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24+KSwgJ0NsYXVkZSBTb25uZXQgNC42LCBNZWRpdW0gY29zdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvIG1vZGVsIGFsd2F5cyBhcHBlYXJzIGZpcnN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFttb2RlbEEsIGF1dG9dKTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLmxhYmVsLCAnQXV0bycpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eSBtb2RlbHMgbGlzdCBwcm9kdWNlcyBhdXRvIGFuZCBtYW5hZ2UgbW9kZWxzIGVudHJpZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW10pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS5sYWJlbCwgJ0F1dG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1sxXS5pdGVtPy5pZCwgJ21hbmFnZU1vZGVscycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93QXV0b01vZGVsPWZhbHNlIHNob3dzIGEgZGlzYWJsZWQgbm8tbW9kZWxzIGVudHJ5IGluc3RlYWQgb2YgYXV0bycsICgpID0+IHtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbXSwgeyBzaG93QXV0b01vZGVsOiBmYWxzZSB9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdC8vIEV4YWN0bHkgb25lIGVudHJ5OiB0aGUgZWFybHkgcmV0dXJuIG11c3Qgc3VwcHJlc3MgQXV0byBhbmQgdGhlXG5cdFx0Ly8gc3RhbmRhbG9uZSBcIk1hbmFnZSBNb2RlbHNcIiBhY3Rpb24gKHRoZSBoZWxwZXIgYWx3YXlzIHBhc3NlcyBvbmUpLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMuc29tZShhID0+IGEubGFiZWwgPT09ICdBdXRvJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS5pdGVtPy5pZCwgJ25vTW9kZWxzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0uaXRlbT8uZW5hYmxlZCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93QXV0b01vZGVsPWZhbHNlIGF0dGFjaGVzIGlubGluZSB1cGdyYWRlIGxpbmsgZm9yIEZyZWUgdXNlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW10sIHsgc2hvd0F1dG9Nb2RlbDogZmFsc2UsIGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuRnJlZSB9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdGNvbnN0IG5vTW9kZWxzID0gYWN0aW9ucy5maW5kKGEgPT4gYS5pdGVtPy5pZCA9PT0gJ25vTW9kZWxzJyk7XG5cdFx0YXNzZXJ0Lm9rKG5vTW9kZWxzLCAnZXhwZWN0ZWQgYSBuby1tb2RlbHMgZW50cnknKTtcblx0XHRhc3NlcnQub2sobm9Nb2RlbHMhLmRlc2NyaXB0aW9uLCAnZXhwZWN0ZWQgYW4gdXBncmFkZSBkZXNjcmlwdGlvbiBmb3IgRnJlZSB1c2VycycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93QXV0b01vZGVsPWZhbHNlIG9taXRzIHVwZ3JhZGUgbGluayBmb3IgcGFpZCB1c2VycycsICgpID0+IHtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbXSwgeyBzaG93QXV0b01vZGVsOiBmYWxzZSwgZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Qcm8gfSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKTtcblx0XHRjb25zdCBub01vZGVscyA9IGFjdGlvbnMuZmluZChhID0+IGEuaXRlbT8uaWQgPT09ICdub01vZGVscycpO1xuXHRcdGFzc2VydC5vayhub01vZGVscywgJ2V4cGVjdGVkIGEgbm8tbW9kZWxzIGVudHJ5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vTW9kZWxzIS5kZXNjcmlwdGlvbiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd0F1dG9Nb2RlbD1mYWxzZSB3aXRoIGF2YWlsYWJsZSBtb2RlbHMgc2hvd3MgdGhlIG1vZGVscywgbm90IHRoZSBlbXB0eSBzdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nKV0sIHsgc2hvd0F1dG9Nb2RlbDogZmFsc2UgfSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5zb21lKGEgPT4gYS5pdGVtPy5pZCA9PT0gJ25vTW9kZWxzJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5zb21lKGEgPT4gYS5sYWJlbCA9PT0gJ0dQVC00bycpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdHJpY3RlZE1vZGUgc2hvd3MgYW4gZXhwbGFuYXRvcnkgaGVhZGVyIGFuZCBhIFRydXN0IFdvcmtzcGFjZSBhY3Rpb24gaW5zdGVhZCBvZiBhdXRvJywgKCkgPT4ge1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFtdLCB7IHJlc3RyaWN0ZWRNb2RlOiB0cnVlLCBvblJlcXVlc3RUcnVzdDogKCkgPT4geyB9IH0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcyk7XG5cdFx0Ly8gVGhlIGV4cGxhbmF0aW9uIGlzIGEgbm9uLWludGVyYWN0aXZlIGhlYWRlcjsgb25seSBUcnVzdCBpcyBzZWxlY3RhYmxlLlxuXHRcdGFzc2VydC5vayhpdGVtcy5zb21lKGkgPT4gaS5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuSGVhZGVyICYmIGkubGFiZWwgPT09ICdNb2RlbHMgdW5hdmFpbGFibGUgd2hpbGUgaW4gUmVzdHJpY3RlZCBtb2RlJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0uaXRlbT8uaWQsICdyZXN0cmljdGVkTW9kZVRydXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0uaXRlbT8uZW5hYmxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMuc29tZShhID0+IGEubGFiZWwgPT09ICdBdXRvJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5zb21lKGEgPT4gYS5pdGVtPy5pZCA9PT0gJ21hbmFnZU1vZGVscycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMuc29tZShhID0+IGEuaXRlbT8uaWQgPT09ICdub01vZGVscycpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RyaWN0ZWRNb2RlIFRydXN0IGFjdGlvbiBpcyBkaXNhYmxlZCB3aXRob3V0IGEgdHJ1c3QgY2FsbGJhY2snLCAoKSA9PiB7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW10sIHsgcmVzdHJpY3RlZE1vZGU6IHRydWUgfSk7XG5cdFx0Y29uc3QgdHJ1c3QgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcykuZmluZChhID0+IGEuaXRlbT8uaWQgPT09ICdyZXN0cmljdGVkTW9kZVRydXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0Py5pdGVtPy5lbmFibGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0Py5kaXNhYmxlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RyaWN0ZWRNb2RlIHRha2VzIHByZWNlZGVuY2Ugb3ZlciBzaG93QXV0b01vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFtdLCB7IHJlc3RyaWN0ZWRNb2RlOiB0cnVlLCBzaG93QXV0b01vZGVsOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMuc29tZShhID0+IGEubGFiZWwgPT09ICdBdXRvJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5zb21lKGEgPT4gYS5pdGVtPy5pZCA9PT0gJ3Jlc3RyaWN0ZWRNb2RlVHJ1c3QnKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RyaWN0ZWRNb2RlIFRydXN0IGFjdGlvbiBpbnZva2VzIHRoZSB0cnVzdCBjYWxsYmFjaycsICgpID0+IHtcblx0XHRsZXQgdHJ1c3RSZXF1ZXN0ZWQgPSAwO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFtdLCB7IHJlc3RyaWN0ZWRNb2RlOiB0cnVlLCBvblJlcXVlc3RUcnVzdDogKCkgPT4geyB0cnVzdFJlcXVlc3RlZCsrOyB9IH0pO1xuXHRcdGNvbnN0IHRydXN0QWN0aW9uID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpLmZpbmQoYSA9PiBhLml0ZW0/LmlkID09PSAncmVzdHJpY3RlZE1vZGVUcnVzdCcpO1xuXHRcdGFzc2VydC5vayh0cnVzdEFjdGlvbiwgJ2V4cGVjdGVkIGEgVHJ1c3QgV29ya3NwYWNlIGFjdGlvbicpO1xuXHRcdHRydXN0QWN0aW9uIS5pdGVtIS5ydW4oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ1c3RSZXF1ZXN0ZWQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0cmljdGVkTW9kZSB0YWtlcyBwcmVjZWRlbmNlIGV2ZW4gb3ZlciBjYWNoZWQgbW9kZWxzJywgKCkgPT4ge1xuXHRcdC8vIEluIFJlc3RyaWN0ZWQgTW9kZSB0aGUgcGlja2VyIG1heSBzdGlsbCByZWNlaXZlIG1hY2hpbmUtY2FjaGVkIG1vZGVsc1xuXHRcdC8vIGZyb20gYSBwcmV2aW91cyB0cnVzdGVkIHNlc3Npb247IHRoZSByZXN0cmljdGVkIHN0YXRlIG11c3Qgc3VwcHJlc3Ncblx0XHQvLyB0aGVtIHJhdGhlciB0aGFuIHByZXNlbnQgc3RhbGUsIHVudXNhYmxlIG1vZGVscy5cblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nKV0sIHsgcmVzdHJpY3RlZE1vZGU6IHRydWUgfSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5zb21lKGEgPT4gYS5sYWJlbCA9PT0gJ0dQVC00bycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMuc29tZShhID0+IGEuaXRlbT8uaWQgPT09ICdyZXN0cmljdGVkTW9kZVRydXN0JyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXR1cFJlcXVpcmVkIHNob3dzIGFuIGV4cGxhbmF0b3J5IGhlYWRlciBhbmQgYSBTaWduIEluIGFjdGlvbiBpbnN0ZWFkIG9mIGF1dG8nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW10sIHsgc2V0dXBSZXF1aXJlZDogdHJ1ZSwgb25SZXF1ZXN0U2V0dXA6ICgpID0+IHsgfSB9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdGFzc2VydC5vayhpdGVtcy5zb21lKGkgPT4gaS5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuSGVhZGVyICYmIGkubGFiZWwgPT09ICdTaWduIGluIHRvIHVzZSBDb3BpbG90JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0uaXRlbT8uaWQsICdzZXR1cFJlcXVpcmVkU2lnbkluJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0uaXRlbT8uZW5hYmxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMuc29tZShhID0+IGEubGFiZWwgPT09ICdBdXRvJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5zb21lKGEgPT4gYS5pdGVtPy5pZCA9PT0gJ21hbmFnZU1vZGVscycpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldHVwUmVxdWlyZWQgU2lnbiBJbiBhY3Rpb24gaXMgZGlzYWJsZWQgd2l0aG91dCBhIHNldHVwIGNhbGxiYWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFtdLCB7IHNldHVwUmVxdWlyZWQ6IHRydWUgfSk7XG5cdFx0Y29uc3Qgc2lnbkluID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpLmZpbmQoYSA9PiBhLml0ZW0/LmlkID09PSAnc2V0dXBSZXF1aXJlZFNpZ25JbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaWduSW4/Lml0ZW0/LmVuYWJsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2lnbkluPy5kaXNhYmxlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldHVwUmVxdWlyZWQgU2lnbiBJbiBhY3Rpb24gaW52b2tlcyB0aGUgc2V0dXAgY2FsbGJhY2snLCAoKSA9PiB7XG5cdFx0bGV0IHNldHVwUmVxdWVzdGVkID0gMDtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbXSwgeyBzZXR1cFJlcXVpcmVkOiB0cnVlLCBvblJlcXVlc3RTZXR1cDogKCkgPT4geyBzZXR1cFJlcXVlc3RlZCsrOyB9IH0pO1xuXHRcdGNvbnN0IHNpZ25JbiA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKS5maW5kKGEgPT4gYS5pdGVtPy5pZCA9PT0gJ3NldHVwUmVxdWlyZWRTaWduSW4nKTtcblx0XHRhc3NlcnQub2soc2lnbkluLCAnZXhwZWN0ZWQgYSBTaWduIEluIGFjdGlvbicpO1xuXHRcdHNpZ25JbiEuaXRlbSEucnVuKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldHVwUmVxdWVzdGVkLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0dXBSZXF1aXJlZCB0YWtlcyBwcmVjZWRlbmNlIGV2ZW4gb3ZlciBjYWNoZWQgbW9kZWxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFtjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpXSwgeyBzZXR1cFJlcXVpcmVkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMuc29tZShhID0+IGEubGFiZWwgPT09ICdHUFQtNG8nKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLnNvbWUoYSA9PiBhLml0ZW0/LmlkID09PSAnc2V0dXBSZXF1aXJlZFNpZ25JbicpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdHJpY3RlZE1vZGUgdGFrZXMgcHJlY2VkZW5jZSBvdmVyIHNldHVwUmVxdWlyZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW10sIHsgcmVzdHJpY3RlZE1vZGU6IHRydWUsIHNldHVwUmVxdWlyZWQ6IHRydWUsIG9uUmVxdWVzdFRydXN0OiAoKSA9PiB7IH0sIG9uUmVxdWVzdFNldHVwOiAoKSA9PiB7IH0gfSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5zb21lKGEgPT4gYS5pdGVtPy5pZCA9PT0gJ3Jlc3RyaWN0ZWRNb2RlVHJ1c3QnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMuc29tZShhID0+IGEuaXRlbT8uaWQgPT09ICdzZXR1cFJlcXVpcmVkU2lnbkluJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnb25seSBhdXRvIG1vZGVsIHByb2R1Y2VzIGF1dG8gYW5kIG1hbmFnZSBtb2RlbHMgd2l0aCBzZXBhcmF0b3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2NyZWF0ZUF1dG9Nb2RlbCgpXSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLmxhYmVsLCAnQXV0bycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzFdLml0ZW0/LmlkLCAnbWFuYWdlTW9kZWxzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlcGFyYXRvckNvdW50KGl0ZW1zKSwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdGVkIG1vZGVsIGFwcGVhcnMgaW4gcHJvbW90ZWQgc2VjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWxBID0gY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nKTtcblx0XHRjb25zdCBtb2RlbEIgPSBjcmVhdGVNb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScpO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvLCBtb2RlbEEsIG1vZGVsQl0sIHtcblx0XHRcdHNlbGVjdGVkTW9kZWxJZDogbW9kZWxBLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKTtcblx0XHQvLyBBdXRvIGZpcnN0LCB0aGVuIHNlbGVjdGVkIG1vZGVsIGluIHByb21vdGVkIHNlY3Rpb24sIHRoZW4gcmVtYWluaW5nIGluIG90aGVyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0ubGFiZWwsICdBdXRvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMV0ubGFiZWwsICdHUFQtNG8nKTtcblx0XHRhc3NlcnQub2soYWN0aW9uc1sxXS5pdGVtPy5jaGVja2VkKTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZWN0ZWQgbW9kZWwgd2l0aCBmYWlsaW5nIG1pblZTQ29kZVZlcnNpb24gc2hvd3MgYXMgdW5hdmFpbGFibGUgd2l0aCByZWFzb24gdXBkYXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvLCBtb2RlbEFdLCB7XG5cdFx0XHRzZWxlY3RlZE1vZGVsSWQ6IG1vZGVsQS5pZGVudGlmaWVyLFxuXHRcdFx0Y29udHJvbE1vZGVsczoge1xuXHRcdFx0XHQnZ3B0LTRvJzogeyBsYWJlbDogJ0dQVC00bycsIG1pblZTQ29kZVZlcnNpb246ICcyLjAuMCcsIGV4aXN0czogdHJ1ZSB9LFxuXHRcdFx0fSxcblx0XHRcdGN1cnJlbnRWU0NvZGVWZXJzaW9uOiAnMS45MC4wJyxcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdC8vIFRoZSBwcm9tb3RlZCBzZWN0aW9uIHNob3VsZCBjb250YWluIHRoZSB1bmF2YWlsYWJsZSBtb2RlbFxuXHRcdGNvbnN0IHByb21vdGVkSXRlbSA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwgPT09ICdHUFQtNG8nKTtcblx0XHRhc3NlcnQub2socHJvbW90ZWRJdGVtKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvbW90ZWRJdGVtLmRpc2FibGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvbW90ZWRJdGVtLml0ZW0/LmVuYWJsZWQsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVjZW50bHkgdXNlZCBtb2RlbHMgYXBwZWFyIGluIHByb21vdGVkIHNlY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsQSA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJyk7XG5cdFx0Y29uc3QgbW9kZWxCID0gY3JlYXRlTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnKTtcblx0XHRjb25zdCBtb2RlbEMgPSBjcmVhdGVNb2RlbCgnZ2VtaW5pJywgJ0dlbWluaScpO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvLCBtb2RlbEEsIG1vZGVsQiwgbW9kZWxDXSwge1xuXHRcdFx0cmVjZW50TW9kZWxJZHM6IFttb2RlbEIuaWRlbnRpZmllcl0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKTtcblx0XHQvLyBBdXRvLCB0aGVuIENsYXVkZSAocmVjZW50KSBpbiBwcm9tb3RlZCwgdGhlbiBvdGhlcnNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS5sYWJlbCwgJ0F1dG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1sxXS5sYWJlbCwgJ0NsYXVkZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCB2YXJpYW50cyBzaGFyaW5nIG1ldGFkYXRhIGlkcyByZW1haW4gdmlzaWJsZSBhY3Jvc3MgcHJvbW90ZWQgYW5kIG90aGVyIHNlY3Rpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBjb3BpbG90U29sID0gY3JlYXRlTW9kZWwoJ2dwdC01LjYtc29sJywgJ0dQVC01LjYgU29sJyk7XG5cdFx0Y29uc3QgY29waWxvdFRlcnJhID0gY3JlYXRlTW9kZWwoJ2dwdC01LjYtdGVycmEnLCAnR1BULTUuNiBUZXJyYScpO1xuXHRcdGNvbnN0IGJ5b2tTb2wgPSBjcmVhdGVNb2RlbCgnZ3B0LTUuNi1zb2wnLCAnR1BULTUuNiBTb2wnLCAnb3BlbmFpJyk7XG5cdFx0Y29uc3QgYnlva1RlcnJhID0gY3JlYXRlTW9kZWwoJ2dwdC01LjYtdGVycmEnLCAnR1BULTUuNiBUZXJyYScsICdvcGVuYWknKTtcblx0XHRjb25zdCBjb3BpbG90T3RoZXIgPSBjcmVhdGVNb2RlbCgnZ3B0LTUuNScsICdHUFQtNS41Jyk7XG5cdFx0Y29uc3QgYnlva090aGVyID0gY3JlYXRlTW9kZWwoJ2dwdC01LjUnLCAnR1BULTUuNScsICdvcGVuYWknKTtcblx0XHRjb25zdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UgPSBjcmVhdGVMYW5ndWFnZU1vZGVsc1NlcnZpY2VTdHViKFtcblx0XHRcdHsgdmVuZG9yOiAnY29waWxvdCcsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsIGdyb3VwczogW10gfSxcblx0XHRcdHtcblx0XHRcdFx0dmVuZG9yOiAnb3BlbmFpJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdPcGVuQUknLFxuXHRcdFx0XHRncm91cHM6IFt7IG5hbWU6ICdPcGVuQUkgKFdvcmspJywgbW9kZWxJZGVudGlmaWVyczogW2J5b2tTb2wuaWRlbnRpZmllciwgYnlva1RlcnJhLmlkZW50aWZpZXIsIGJ5b2tPdGhlci5pZGVudGlmaWVyXSB9XSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIGNvcGlsb3RTb2wsIGNvcGlsb3RUZXJyYSwgY29waWxvdE90aGVyLCBieW9rU29sLCBieW9rVGVycmEsIGJ5b2tPdGhlcl0sIHtcblx0XHRcdHJlY2VudE1vZGVsSWRzOiBbY29waWxvdFNvbC5pZGVudGlmaWVyLCBieW9rU29sLmlkZW50aWZpZXIsIGNvcGlsb3RUZXJyYS5pZGVudGlmaWVyLCBieW9rVGVycmEuaWRlbnRpZmllcl0sXG5cdFx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEFjdGlvbkl0ZW1zKGl0ZW1zKVxuXHRcdFx0LmZpbHRlcihpdGVtID0+ICFpdGVtLmlzU2VjdGlvblRvZ2dsZSAmJiBpdGVtLmxhYmVsICE9PSAnQXV0bycgJiYgaXRlbS5pdGVtPy5pZCAhPT0gJ21hbmFnZU1vZGVscycpXG5cdFx0XHQubWFwKGl0ZW0gPT4gKHsgaWQ6IGl0ZW0uaXRlbT8uaWQsIHNlY3Rpb246IGl0ZW0uc2VjdGlvbiwgcHJvdmlkZXI6IGl0ZW0uYmFkZ2UgfSkpLCBbXG5cdFx0XHR7IGlkOiBjb3BpbG90U29sLmlkZW50aWZpZXIsIHNlY3Rpb246IHVuZGVmaW5lZCwgcHJvdmlkZXI6ICdDb3BpbG90JyB9LFxuXHRcdFx0eyBpZDogYnlva1NvbC5pZGVudGlmaWVyLCBzZWN0aW9uOiB1bmRlZmluZWQsIHByb3ZpZGVyOiAnT3BlbkFJIChXb3JrKScgfSxcblx0XHRcdHsgaWQ6IGNvcGlsb3RUZXJyYS5pZGVudGlmaWVyLCBzZWN0aW9uOiB1bmRlZmluZWQsIHByb3ZpZGVyOiAnQ29waWxvdCcgfSxcblx0XHRcdHsgaWQ6IGNvcGlsb3RPdGhlci5pZGVudGlmaWVyLCBzZWN0aW9uOiAnb3RoZXInLCBwcm92aWRlcjogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IGlkOiBieW9rT3RoZXIuaWRlbnRpZmllciwgc2VjdGlvbjogJ290aGVyJywgcHJvdmlkZXI6IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBpZDogYnlva1RlcnJhLmlkZW50aWZpZXIsIHNlY3Rpb246ICdvdGhlcicsIHByb3ZpZGVyOiB1bmRlZmluZWQgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVjZW50bHkgdXNlZCBtb2RlbCBub3QgaW4gbW9kZWxzIGxpc3QgYnV0IGluIGNvbnRyb2xNb2RlbHMgc2hvd3MgYXMgdW5hdmFpbGFibGUgKHVwZ3JhZGUgZm9yIGZyZWUgdXNlciknLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvXSwge1xuXHRcdFx0cmVjZW50TW9kZWxJZHM6IFsnbWlzc2luZy1tb2RlbCddLFxuXHRcdFx0Y29udHJvbE1vZGVsczoge1xuXHRcdFx0XHQnbWlzc2luZy1tb2RlbCc6IHsgbGFiZWw6ICdNaXNzaW5nIE1vZGVsJywgZXhpc3RzOiBmYWxzZSB9LFxuXHRcdFx0fSxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuRnJlZSxcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdGNvbnN0IHVuYXZhaWxhYmxlID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ01pc3NpbmcgTW9kZWwnKTtcblx0XHRhc3NlcnQub2sodW5hdmFpbGFibGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmF2YWlsYWJsZS5kaXNhYmxlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY2VudGx5IHVzZWQgbW9kZWwgbm90IGluIG1vZGVscyBsaXN0IHNob3dzIGFzIHVuYXZhaWxhYmxlICh1cGRhdGUgZm9yIHZlcnNpb24gbWlzbWF0Y2gpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0b10sIHtcblx0XHRcdHJlY2VudE1vZGVsSWRzOiBbJ21pc3NpbmctbW9kZWwnXSxcblx0XHRcdGNvbnRyb2xNb2RlbHM6IHtcblx0XHRcdFx0J21pc3NpbmctbW9kZWwnOiB7IGxhYmVsOiAnTWlzc2luZyBNb2RlbCcsIG1pblZTQ29kZVZlcnNpb246ICcyLjAuMCcsIGV4aXN0czogZmFsc2UgfSxcblx0XHRcdH0sXG5cdFx0XHRjdXJyZW50VlNDb2RlVmVyc2lvbjogJzEuOTAuMCcsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKTtcblx0XHRjb25zdCB1bmF2YWlsYWJsZSA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwgPT09ICdNaXNzaW5nIE1vZGVsJyk7XG5cdFx0YXNzZXJ0Lm9rKHVuYXZhaWxhYmxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5hdmFpbGFibGUuZGlzYWJsZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNlbnRseSB1c2VkIG1vZGVsIG5vdCBpbiBtb2RlbHMgbGlzdCBzaG93cyBhcyB1bmF2YWlsYWJsZSAoYWRtaW4gZm9yIHBybyB1c2VyIHdpdGhvdXQgdmVyc2lvbiBpc3N1ZSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvXSwge1xuXHRcdFx0cmVjZW50TW9kZWxJZHM6IFsnbWlzc2luZy1tb2RlbCddLFxuXHRcdFx0Y29udHJvbE1vZGVsczoge1xuXHRcdFx0XHQnbWlzc2luZy1tb2RlbCc6IHsgbGFiZWw6ICdNaXNzaW5nIE1vZGVsJywgZXhpc3RzOiBmYWxzZSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdGNvbnN0IHVuYXZhaWxhYmxlID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ01pc3NpbmcgTW9kZWwnKTtcblx0XHRhc3NlcnQub2sodW5hdmFpbGFibGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmF2YWlsYWJsZS5kaXNhYmxlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZlYXR1cmVkIGNvbnRyb2wgbW9kZWxzIGFwcGVhciBpbiBwcm9tb3RlZCBzZWN0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpO1xuXHRcdGNvbnN0IG1vZGVsQiA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUnLCAnQ2xhdWRlJyk7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIG1vZGVsQSwgbW9kZWxCXSwge1xuXHRcdFx0Y29udHJvbE1vZGVsczoge1xuXHRcdFx0XHQnZ3B0LTRvJzogeyBsYWJlbDogJ0dQVC00bycsIGZlYXR1cmVkOiB0cnVlLCBleGlzdHM6IHRydWUgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS5sYWJlbCwgJ0F1dG8nKTtcblx0XHQvLyBHUFQtNG8gc2hvdWxkIGJlIGluIHByb21vdGVkIGR1ZSB0byBmZWF0dXJlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzFdLmxhYmVsLCAnR1BULTRvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkdSBlbnRpdGxlbWVudCB1c2VzIGZyZWUgZmVhdHVyZWQgY29udHJvbCBtYW5pZmVzdCcsICgpID0+IHtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGNyZWF0ZUNvbnRyb2xNYW5pZmVzdCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDb250cm9sTW9kZWxzRm9yRW50aXRsZW1lbnQobWFuaWZlc3QsIENoYXRFbnRpdGxlbWVudC5FRFUpLCBtYW5pZmVzdC5mcmVlKTtcblx0fSk7XG5cblx0dGVzdCgnYXZhaWxhYmxlIHRhcmdldGVkIG1vZGVscyByZW1haW4gZmVhdHVyZWQgd2hpbGUgZW50aXRsZW1lbnQgaXMgc2lnbmVkIG91dCcsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQWdlbnRIb3N0TW9kZWwoJ2F1dG8nLCAnQXV0bycsIHsgaWQ6ICdjb3BpbG90Y2xpJyB9KTtcblx0XHRjb25zdCBmcmVlRmVhdHVyZWQgPSBjcmVhdGVBZ2VudEhvc3RNb2RlbCgnZnJlZS1tb2RlbCcsICdGcmVlIE1vZGVsJywgeyBpZDogJ2NvcGlsb3RjbGknIH0pO1xuXHRcdGNvbnN0IHBhaWRGZWF0dXJlZCA9IGNyZWF0ZUFnZW50SG9zdE1vZGVsKCdwYWlkLW1vZGVsJywgJ1BhaWQgTW9kZWwnLCB7IGlkOiAnY29waWxvdGNsaScgfSk7XG5cdFx0Y29uc3Qgb3RoZXIgPSBjcmVhdGVBZ2VudEhvc3RNb2RlbCgnb3RoZXItbW9kZWwnLCAnT3RoZXIgTW9kZWwnLCB7IGlkOiAnY29waWxvdGNsaScgfSk7XG5cdFx0Y29uc3QgbW9kZWxzID0gW2F1dG8sIGZyZWVGZWF0dXJlZCwgcGFpZEZlYXR1cmVkLCBvdGhlcl07XG5cdFx0Y29uc3QgY29udHJvbE1vZGVscyA9IGdldE1vZGVsUGlja2VyQ29udHJvbE1vZGVscyhjcmVhdGVDb250cm9sTWFuaWZlc3QoKSwgQ2hhdEVudGl0bGVtZW50LlVua25vd24sIG1vZGVscyk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkl0ZW1zKGNhbGxCdWlsZChtb2RlbHMsIHtcblx0XHRcdHNlbGVjdGVkTW9kZWxJZDogYXV0by5pZGVudGlmaWVyLFxuXHRcdFx0Y29udHJvbE1vZGVscyxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuVW5rbm93bixcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMubWFwKGFjdGlvbiA9PiAoe1xuXHRcdFx0bGFiZWw6IGFjdGlvbi5sYWJlbCxcblx0XHRcdHNlY3Rpb246IGFjdGlvbi5zZWN0aW9uLFxuXHRcdFx0aXNTZWN0aW9uVG9nZ2xlOiBhY3Rpb24uaXNTZWN0aW9uVG9nZ2xlLFxuXHRcdH0pKSwgW1xuXHRcdFx0eyBsYWJlbDogJ0F1dG8nLCBzZWN0aW9uOiB1bmRlZmluZWQsIGlzU2VjdGlvblRvZ2dsZTogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IGxhYmVsOiAnRnJlZSBNb2RlbCcsIHNlY3Rpb246IHVuZGVmaW5lZCwgaXNTZWN0aW9uVG9nZ2xlOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgbGFiZWw6ICdQYWlkIE1vZGVsJywgc2VjdGlvbjogdW5kZWZpbmVkLCBpc1NlY3Rpb25Ub2dnbGU6IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBsYWJlbDogJ090aGVyIE1vZGVscycsIHNlY3Rpb246ICdvdGhlcicsIGlzU2VjdGlvblRvZ2dsZTogdHJ1ZSB9LFxuXHRcdFx0eyBsYWJlbDogJ090aGVyIE1vZGVsJywgc2VjdGlvbjogJ290aGVyJywgaXNTZWN0aW9uVG9nZ2xlOiB1bmRlZmluZWQgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2lnbmVkLW91dCBjb250cm9sIG1vZGVscyBleGNsdWRlIHVuYXZhaWxhYmxlIGFuZCBCWU9LIG1vZGVscycsICgpID0+IHtcblx0XHRjb25zdCBtYW5pZmVzdDogSU1vZGVsc0NvbnRyb2xNYW5pZmVzdCA9IHtcblx0XHRcdGZyZWU6IHtcblx0XHRcdFx0J2F2YWlsYWJsZS10YXJnZXRlZCc6IHsgbGFiZWw6ICdBdmFpbGFibGUgVGFyZ2V0ZWQnLCBmZWF0dXJlZDogdHJ1ZSwgZXhpc3RzOiBmYWxzZSB9LFxuXHRcdFx0XHQndW5hdmFpbGFibGUtdGFyZ2V0ZWQnOiB7IGxhYmVsOiAnVW5hdmFpbGFibGUgVGFyZ2V0ZWQnLCBmZWF0dXJlZDogdHJ1ZSwgZXhpc3RzOiBmYWxzZSB9LFxuXHRcdFx0XHQnYnlvay1tb2RlbCc6IHsgbGFiZWw6ICdCWU9LIE1vZGVsJywgZmVhdHVyZWQ6IHRydWUsIGV4aXN0czogdHJ1ZSB9LFxuXHRcdFx0fSxcblx0XHRcdHBhaWQ6IHt9LFxuXHRcdH07XG5cdFx0Y29uc3QgYXZhaWxhYmxlVGFyZ2V0ZWQgPSBjcmVhdGVBZ2VudEhvc3RNb2RlbCgnYXZhaWxhYmxlLXRhcmdldGVkJywgJ0F2YWlsYWJsZSBUYXJnZXRlZCcsIHsgaWQ6ICdjb3BpbG90Y2xpJyB9KTtcblx0XHRjb25zdCBiYXNlQnlva01vZGVsID0gY3JlYXRlQWdlbnRIb3N0TW9kZWwoJ2J5b2stbW9kZWwnLCAnQllPSyBNb2RlbCcsIHsgaWQ6ICdjdXN0b20nIH0pO1xuXHRcdGNvbnN0IGJ5b2tNb2RlbCA9IHsgLi4uYmFzZUJ5b2tNb2RlbCwgbWV0YWRhdGE6IHsgLi4uYmFzZUJ5b2tNb2RlbC5tZXRhZGF0YSwgYnlva01vZGVsSWRlbnRpZmllcjogJ2N1c3RvbS9ieW9rLW1vZGVsJyB9IH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldE1vZGVsUGlja2VyQ29udHJvbE1vZGVscyhtYW5pZmVzdCwgQ2hhdEVudGl0bGVtZW50LlVua25vd24sIFthdmFpbGFibGVUYXJnZXRlZCwgYnlva01vZGVsXSksIHtcblx0XHRcdCdhdmFpbGFibGUtdGFyZ2V0ZWQnOiB7IGxhYmVsOiAnQXZhaWxhYmxlIFRhcmdldGVkJywgZmVhdHVyZWQ6IHRydWUsIGV4aXN0czogdHJ1ZSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmZWF0dXJlZCBtb2RlbCBub3QgaW4gbW9kZWxzIGxpc3Qgc2hvd3MgYXMgdW5hdmFpbGFibGUgZm9yIGZyZWUgdXNlcnMgKHVwZ3JhZGUpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0b10sIHtcblx0XHRcdGNvbnRyb2xNb2RlbHM6IHtcblx0XHRcdFx0J3ByZW1pdW0tbW9kZWwnOiB7IGxhYmVsOiAnUHJlbWl1bSBNb2RlbCcsIGZlYXR1cmVkOiB0cnVlLCBleGlzdHM6IGZhbHNlIH0sXG5cdFx0XHR9LFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5GcmVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcyk7XG5cdFx0Y29uc3QgdW5hdmFpbGFibGUgPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsID09PSAnUHJlbWl1bSBNb2RlbCcpO1xuXHRcdGFzc2VydC5vayh1bmF2YWlsYWJsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuYXZhaWxhYmxlLmRpc2FibGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZmVhdHVyZWQgbW9kZWwgbm90IGluIG1vZGVscyBsaXN0IHNob3dzIGFzIHVuYXZhaWxhYmxlIGZvciBwcm8gdXNlcnMgKGFkbWluKScsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG9dLCB7XG5cdFx0XHRjb250cm9sTW9kZWxzOiB7XG5cdFx0XHRcdCdwcmVtaXVtLW1vZGVsJzogeyBsYWJlbDogJ1ByZW1pdW0gTW9kZWwnLCBmZWF0dXJlZDogdHJ1ZSwgZXhpc3RzOiBmYWxzZSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdGNvbnN0IHVuYXZhaWxhYmxlID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ1ByZW1pdW0gTW9kZWwnKTtcblx0XHRhc3NlcnQub2sodW5hdmFpbGFibGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmF2YWlsYWJsZS5kaXNhYmxlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZlYXR1cmVkIG1vZGVsIHdpdGggbWluVlNDb2RlVmVyc2lvbiBzaG93cyBhcyB1bmF2YWlsYWJsZSAodXBkYXRlKSB3aGVuIHZlcnNpb24gdG9vIGxvdycsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWxBID0gY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBXSwge1xuXHRcdFx0Y29udHJvbE1vZGVsczoge1xuXHRcdFx0XHQnZ3B0LTRvJzogeyBsYWJlbDogJ0dQVC00bycsIGZlYXR1cmVkOiB0cnVlLCBtaW5WU0NvZGVWZXJzaW9uOiAnMi4wLjAnLCBleGlzdHM6IHRydWUgfSxcblx0XHRcdH0sXG5cdFx0XHRjdXJyZW50VlNDb2RlVmVyc2lvbjogJzEuOTAuMCcsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKTtcblx0XHRjb25zdCB1bmF2YWlsYWJsZSA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwgPT09ICdHUFQtNG8nKTtcblx0XHRhc3NlcnQub2sodW5hdmFpbGFibGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmF2YWlsYWJsZS5kaXNhYmxlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vbi1mZWF0dXJlZCBjb250cm9sIG1vZGVscyBkbyBOT1QgYXBwZWFyIGluIHByb21vdGVkIHNlY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsQSA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJyk7XG5cdFx0Y29uc3QgbW9kZWxCID0gY3JlYXRlTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBLCBtb2RlbEJdLCB7XG5cdFx0XHRjb250cm9sTW9kZWxzOiB7XG5cdFx0XHRcdCdncHQtNG8nOiB7IGxhYmVsOiAnR1BULTRvJywgZmVhdHVyZWQ6IGZhbHNlLCBleGlzdHM6IHRydWUgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Ly8gV2l0aCBubyBzZWxlY3RlZCwgbm8gcmVjZW50LCBhbmQgbm8gZmVhdHVyZWQsIGJvdGggbW9kZWxzIHNob3VsZCBiZSBpbiBPdGhlclxuXHRcdGNvbnN0IHNlcHMgPSBpdGVtcy5maWx0ZXIoaSA9PiBpLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IpO1xuXHRcdC8vIE9uZSBzZXBhcmF0b3IgYmVmb3JlIE90aGVyIE1vZGVscyBzZWN0aW9uXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLmxhYmVsLCAnQXV0bycpO1xuXHRcdC8vIE5leHQgc2hvdWxkIGJlIFwiT3RoZXIgTW9kZWxzXCIgdG9nZ2xlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMV0uaXNTZWN0aW9uVG9nZ2xlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnYXZhaWxhYmxlIHByb21vdGVkIG1vZGVscyBhcmUgc29ydGVkIGFscGhhYmV0aWNhbGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpO1xuXHRcdGNvbnN0IG1vZGVsQiA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUnLCAnQ2xhdWRlJyk7XG5cdFx0Y29uc3QgbW9kZWxDID0gY3JlYXRlTW9kZWwoJ2dlbWluaScsICdHZW1pbmknKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBLCBtb2RlbEIsIG1vZGVsQ10sIHtcblx0XHRcdHJlY2VudE1vZGVsSWRzOiBbbW9kZWxBLmlkZW50aWZpZXIsIG1vZGVsQi5pZGVudGlmaWVyLCBtb2RlbEMuaWRlbnRpZmllcl0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKTtcblx0XHQvLyBTa2lwIEF1dG8sIHByb21vdGVkIG1vZGVscyBzaG91bGQgYmUgc29ydGVkOiBDbGF1ZGUsIEdlbWluaSwgR1BULTRvXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMV0ubGFiZWwsICdDbGF1ZGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1syXS5sYWJlbCwgJ0dlbWluaScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzNdLmxhYmVsLCAnR1BULTRvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuYXZhaWxhYmxlIHByb21vdGVkIG1vZGVscyBhcHBlYXIgYWZ0ZXIgYXZhaWxhYmxlIG9uZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsQSA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJyk7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIG1vZGVsQV0sIHtcblx0XHRcdHJlY2VudE1vZGVsSWRzOiBbbW9kZWxBLmlkZW50aWZpZXIsICdtaXNzaW5nLW1vZGVsJ10sXG5cdFx0XHRjb250cm9sTW9kZWxzOiB7XG5cdFx0XHRcdCdtaXNzaW5nLW1vZGVsJzogeyBsYWJlbDogJ01pc3NpbmcgTW9kZWwnLCBleGlzdHM6IGZhbHNlIH0sXG5cdFx0XHR9LFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5GcmVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcyk7XG5cdFx0Ly8gQXV0bywgdGhlbiBHUFQtNG8gKGF2YWlsYWJsZSksIHRoZW4gTWlzc2luZyBNb2RlbCAodW5hdmFpbGFibGUpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0ubGFiZWwsICdBdXRvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMV0ubGFiZWwsICdHUFQtNG8nKTtcblx0XHRhc3NlcnQub2soIWFjdGlvbnNbMV0uZGlzYWJsZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzJdLmxhYmVsLCAnTWlzc2luZyBNb2RlbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzJdLmRpc2FibGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWxzIG5vdCBpbiBwcm9tb3RlZCBzZWN0aW9uIGFwcGVhciBpbiBPdGhlciBNb2RlbHMgc2VjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWxBID0gY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nKTtcblx0XHRjb25zdCBtb2RlbEIgPSBjcmVhdGVNb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScpO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvLCBtb2RlbEEsIG1vZGVsQl0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcyk7XG5cdFx0Ly8gQXV0bywgdGhlbiBcIk90aGVyIE1vZGVsc1wiIHRvZ2dsZSwgdGhlbiBtb2RlbHMsIHRoZW4gXCJNYW5hZ2UgTW9kZWxzLi4uXCJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS5sYWJlbCwgJ0F1dG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1sxXS5pc1NlY3Rpb25Ub2dnbGUsIHRydWUpO1xuXHRcdGFzc2VydC5vayhhY3Rpb25zWzFdLmxhYmVsIS5pbmNsdWRlcygnT3RoZXIgTW9kZWxzJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdPdGhlciBNb2RlbHMgc2VjdGlvbiBpbmNsdWRlcyBzZWN0aW9uIHRvZ2dsZScsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWxBID0gY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBXSk7XG5cdFx0Y29uc3QgdG9nZ2xlcyA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKS5maWx0ZXIoaSA9PiBpLmlzU2VjdGlvblRvZ2dsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvZ2dsZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQub2sodG9nZ2xlc1swXS5sYWJlbCEuaW5jbHVkZXMoJ090aGVyIE1vZGVscycpKTtcblx0fSk7XG5cblx0dGVzdCgnT3RoZXIgTW9kZWxzIHNlY3Rpb24gaW5jbHVkZXMgTWFuYWdlIE1vZGVscyBpbiB0b29sYmFyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvLCBtb2RlbEFdKTtcblx0XHRjb25zdCB0b2dnbGUgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcykuZmluZChpID0+IGkuaXNTZWN0aW9uVG9nZ2xlKTtcblx0XHRhc3NlcnQub2sodG9nZ2xlKTtcblx0XHRhc3NlcnQub2sodG9nZ2xlLnRvb2xiYXJBY3Rpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9nZ2xlLnRvb2xiYXJBY3Rpb25zIS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2dnbGUudG9vbGJhckFjdGlvbnMhWzBdLmlkLCAnbWFuYWdlTW9kZWxzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ090aGVyIE1vZGVscyB3aXRoIG1pblZTQ29kZVZlcnNpb24gdGhhdCBmYWlscyBzaG93cyBhcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWxBID0gY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBXSwge1xuXHRcdFx0Y29udHJvbE1vZGVsczoge1xuXHRcdFx0XHQnZ3B0LTRvJzogeyBsYWJlbDogJ0dQVC00bycsIG1pblZTQ29kZVZlcnNpb246ICcyLjAuMCcsIGV4aXN0czogdHJ1ZSB9LFxuXHRcdFx0fSxcblx0XHRcdGN1cnJlbnRWU0NvZGVWZXJzaW9uOiAnMS45MC4wJyxcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdGNvbnN0IGdwdEl0ZW0gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsID09PSAnR1BULTRvJyk7XG5cdFx0YXNzZXJ0Lm9rKGdwdEl0ZW0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncHRJdGVtLmRpc2FibGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnT3RoZXIgTW9kZWxzIHBsYWNlcyB1bmF2YWlsYWJsZSBtb2RlbHMgYWZ0ZXIgYXZhaWxhYmxlIG1vZGVscycsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgYXZhaWxhYmxlTW9kZWwgPSBjcmVhdGVNb2RlbCgnemV0YScsICdaZXRhJyk7XG5cdFx0Y29uc3QgdW5hdmFpbGFibGVNb2RlbCA9IGNyZWF0ZU1vZGVsKCdhbHBoYScsICdBbHBoYScpO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvLCBhdmFpbGFibGVNb2RlbCwgdW5hdmFpbGFibGVNb2RlbF0sIHtcblx0XHRcdGNvbnRyb2xNb2RlbHM6IHtcblx0XHRcdFx0J2FscGhhJzogeyBsYWJlbDogJ0FscGhhJywgbWluVlNDb2RlVmVyc2lvbjogJzIuMC4wJywgZXhpc3RzOiB0cnVlIH0sXG5cdFx0XHR9LFxuXHRcdFx0Y3VycmVudFZTQ29kZVZlcnNpb246ICcxLjkwLjAnLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcyk7XG5cdFx0Y29uc3Qgb3RoZXJNb2RlbExhYmVscyA9IGFjdGlvbnMuc2xpY2UoMikubWFwKGEgPT4gYS5sYWJlbCEpLmZpbHRlcihsID0+ICFsLmluY2x1ZGVzKCdNYW5hZ2UgTW9kZWxzJykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3RoZXJNb2RlbExhYmVscywgWydaZXRhJywgJ0FscGhhJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsID09PSAnQWxwaGEnKT8uZGlzYWJsZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdubyBkdXBsaWNhdGUgbW9kZWxzIGFjcm9zcyBzZWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWxBID0gY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nKTtcblx0XHRjb25zdCBtb2RlbEIgPSBjcmVhdGVNb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScpO1xuXHRcdGNvbnN0IG1vZGVsQyA9IGNyZWF0ZU1vZGVsKCdnZW1pbmknLCAnR2VtaW5pJyk7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIG1vZGVsQSwgbW9kZWxCLCBtb2RlbENdLCB7XG5cdFx0XHRzZWxlY3RlZE1vZGVsSWQ6IG1vZGVsQS5pZGVudGlmaWVyLFxuXHRcdFx0cmVjZW50TW9kZWxJZHM6IFttb2RlbEEuaWRlbnRpZmllciwgbW9kZWxCLmlkZW50aWZpZXJdLFxuXHRcdFx0Y29udHJvbE1vZGVsczoge1xuXHRcdFx0XHQnZ3B0LTRvJzogeyBsYWJlbDogJ0dQVC00bycsIGZlYXR1cmVkOiB0cnVlLCBleGlzdHM6IHRydWUgfSxcblx0XHRcdFx0J2NsYXVkZSc6IHsgbGFiZWw6ICdDbGF1ZGUnLCBmZWF0dXJlZDogdHJ1ZSwgZXhpc3RzOiB0cnVlIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGxhYmVscyA9IGdldEFjdGlvbkxhYmVscyhpdGVtcykuZmlsdGVyKGwgPT4gbCAhPT0gJ090aGVyIE1vZGVscycgJiYgIWwuaW5jbHVkZXMoJ01hbmFnZSBNb2RlbHMnKSk7XG5cdFx0Y29uc3QgdW5pcXVlTGFiZWxzID0gbmV3IFNldChsYWJlbHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbHMubGVuZ3RoLCB1bmlxdWVMYWJlbHMuc2l6ZSwgYER1cGxpY2F0ZSBsYWJlbHMgZm91bmQ6ICR7bGFiZWxzLmpvaW4oJywgJyl9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG8gbW9kZWwgaXMgZXhjbHVkZWQgZnJvbSBwcm9tb3RlZCBhbmQgb3RoZXIgc2VjdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsQSA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJyk7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIG1vZGVsQV0sIHtcblx0XHRcdHNlbGVjdGVkTW9kZWxJZDogYXV0by5pZGVudGlmaWVyLFxuXHRcdFx0cmVjZW50TW9kZWxJZHM6IFthdXRvLmlkZW50aWZpZXJdLFxuXHRcdFx0Y29udHJvbE1vZGVsczoge1xuXHRcdFx0XHQnYXV0byc6IHsgbGFiZWw6ICdBdXRvJywgZmVhdHVyZWQ6IHRydWUsIGV4aXN0czogdHJ1ZSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBhdXRvSXRlbXMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcykuZmlsdGVyKGEgPT4gYS5sYWJlbCA9PT0gJ0F1dG8nKTtcblx0XHQvLyBBdXRvIHNob3VsZCBhcHBlYXIgZXhhY3RseSBvbmNlICh0aGUgZmlyc3QgaXRlbSlcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXV0b0l0ZW1zLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVscyB3aXRoIG5vIGNvbnRyb2wgbWFuaWZlc3QgZW50cmllcyB3b3JrIGZpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsQSA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJyk7XG5cdFx0Y29uc3QgbW9kZWxCID0gY3JlYXRlTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBLCBtb2RlbEJdLCB7XG5cdFx0XHRjb250cm9sTW9kZWxzOiB7fSxcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdGFzc2VydC5vayhhY3Rpb25zLmxlbmd0aCA+PSAzKTsgLy8gQXV0byArIDIgbW9kZWxzIChpbiBvdGhlcikgKyB0b2dnbGUgKyBtYW5hZ2Vcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS5sYWJlbCwgJ0F1dG8nKTtcblx0fSk7XG5cblx0dGVzdCgncHJvbW8gbW9kZWwgaXMgYm9vc3RlZCByaWdodCBhZnRlciBBdXRvJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpO1xuXHRcdGNvbnN0IHByb21vTW9kZWwgPSBjcmVhdGVNb2RlbCgnZ2VtaW5pLWZsYXNoJywgJ0dlbWluaSBGbGFzaCcpO1xuXHRcdHByb21vTW9kZWwubWV0YWRhdGEgPSB7IC4uLnByb21vTW9kZWwubWV0YWRhdGEsIHByb21vOiB7IGlkOiAndGVzdC1wcm9tby0xJywgZGlzY291bnRQZXJjZW50OiAyMCwgZW5kc0F0OiAnMjAyNi0wNy0yMFQyMzo1OTo1OVonLCBtZXNzYWdlOiAnTGltaXRlZCB0aW1lIG9mZmVyJyB9IH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIG1vZGVsQSwgcHJvbW9Nb2RlbF0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcyk7XG5cdFx0Ly8gQXV0byBmaXJzdCwgdGhlbiBwcm9tbyBtb2RlbCBpbW1lZGlhdGVseSBhZnRlclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLmxhYmVsLCAnQXV0bycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzFdLmxhYmVsLCAnR2VtaW5pIEZsYXNoJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb21vIG1vZGVsIHNob3dzIGRpc2NvdW50IGluIGRlc2NyaXB0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBwcm9tb01vZGVsID0gY3JlYXRlTW9kZWwoJ2dlbWluaS1mbGFzaCcsICdHZW1pbmkgRmxhc2gnKTtcblx0XHRwcm9tb01vZGVsLm1ldGFkYXRhID0geyAuLi5wcm9tb01vZGVsLm1ldGFkYXRhLCBwcm9tbzogeyBpZDogJ3Rlc3QtcHJvbW8tMicsIGRpc2NvdW50UGVyY2VudDogMzAsIGVuZHNBdDogJzIwMjYtMDctMjBUMjM6NTk6NTlaJywgbWVzc2FnZTogJ1N1bW1lciBzYWxlJyB9IH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIHByb21vTW9kZWxdKTtcblx0XHRjb25zdCBwcm9tb0l0ZW0gPSBnZXRBY3Rpb25JdGVtcyhpdGVtcykuZmluZChhID0+IGEubGFiZWwgPT09ICdHZW1pbmkgRmxhc2gnKTtcblx0XHRhc3NlcnQub2socHJvbW9JdGVtKTtcblx0XHRjb25zdCBkZXNjID0gdHlwZW9mIHByb21vSXRlbS5pdGVtPy5kZXNjcmlwdGlvbiA9PT0gJ3N0cmluZycgPyBwcm9tb0l0ZW0uaXRlbS5kZXNjcmlwdGlvbiA6ICcnO1xuXHRcdGFzc2VydC5vayhkZXNjLmluY2x1ZGVzKCczMCUnKSwgYEV4cGVjdGVkIGRlc2NyaXB0aW9uIHRvIGNvbnRhaW4gXCIzMCVcIiBidXQgZ290OiAke2Rlc2N9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb21vIG1vZGVsIGlzIG5vdCBkdXBsaWNhdGVkIGluIE90aGVyIE1vZGVscyBzZWN0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpO1xuXHRcdGNvbnN0IHByb21vTW9kZWwgPSBjcmVhdGVNb2RlbCgnZ2VtaW5pLWZsYXNoJywgJ0dlbWluaSBGbGFzaCcpO1xuXHRcdHByb21vTW9kZWwubWV0YWRhdGEgPSB7IC4uLnByb21vTW9kZWwubWV0YWRhdGEsIHByb21vOiB7IGlkOiAndGVzdC1wcm9tby0zJywgZGlzY291bnRQZXJjZW50OiAyMCwgZW5kc0F0OiAnMjAyNi0wNy0yMFQyMzo1OTo1OVonLCBtZXNzYWdlOiAnUHJvbW8nIH0gfSBhcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBLCBwcm9tb01vZGVsXSk7XG5cdFx0Y29uc3QgYWxsR2VtaW5pID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpLmZpbHRlcihhID0+IGEubGFiZWwgPT09ICdHZW1pbmkgRmxhc2gnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWxsR2VtaW5pLmxlbmd0aCwgMSwgJ1Byb21vIG1vZGVsIHNob3VsZCBhcHBlYXIgZXhhY3RseSBvbmNlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vbi1wb3NpdGl2ZSBwcm9tbyBtb2RlbHMgYXJlIGZlYXR1cmVkIHdpdGhvdXQgZGlzY291bnQgZGV0YWlscycsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgemVyb0Rpc2NvdW50TW9kZWwgPSBjcmVhdGVNb2RlbCgnemVyby1kaXNjb3VudCcsICdaZXJvIERpc2NvdW50Jyk7XG5cdFx0emVyb0Rpc2NvdW50TW9kZWwubWV0YWRhdGEgPSB7IC4uLnplcm9EaXNjb3VudE1vZGVsLm1ldGFkYXRhLCBwcm9tbzogeyBpZDogJ3Rlc3QtcHJvbW8temVybycsIGRpc2NvdW50UGVyY2VudDogMCwgZW5kc0F0OiAnMjAyNi0wNy0yMFQyMzo1OTo1OVonLCBtZXNzYWdlOiAnRmVhdHVyZWQgbW9kZWwnIH0gfSBhcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YTtcblx0XHRjb25zdCBuZWdhdGl2ZURpc2NvdW50TW9kZWwgPSBjcmVhdGVNb2RlbCgnbmVnYXRpdmUtZGlzY291bnQnLCAnTmVnYXRpdmUgRGlzY291bnQnKTtcblx0XHRuZWdhdGl2ZURpc2NvdW50TW9kZWwubWV0YWRhdGEgPSB7IC4uLm5lZ2F0aXZlRGlzY291bnRNb2RlbC5tZXRhZGF0YSwgcHJvbW86IHsgaWQ6ICd0ZXN0LXByb21vLW5lZ2F0aXZlJywgZGlzY291bnRQZXJjZW50OiAtMTAsIGVuZHNBdDogJzIwMjYtMDctMjBUMjM6NTk6NTlaJywgbWVzc2FnZTogJ0ZlYXR1cmVkIG1vZGVsJyB9IH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdFx0Y29uc3QgbWFuaWZlc3RGZWF0dXJlZE1vZGVsID0gY3JlYXRlTW9kZWwoJ21hbmlmZXN0LWZlYXR1cmVkJywgJ01hbmlmZXN0IEZlYXR1cmVkJyk7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIHplcm9EaXNjb3VudE1vZGVsLCBuZWdhdGl2ZURpc2NvdW50TW9kZWwsIG1hbmlmZXN0RmVhdHVyZWRNb2RlbF0sIHtcblx0XHRcdGNvbnRyb2xNb2RlbHM6IHtcblx0XHRcdFx0J21hbmlmZXN0LWZlYXR1cmVkJzogeyBsYWJlbDogJ01hbmlmZXN0IEZlYXR1cmVkJywgZmVhdHVyZWQ6IHRydWUsIGV4aXN0czogdHJ1ZSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBsYWJlbHMgPSBuZXcgU2V0KFsnQXV0bycsICdaZXJvIERpc2NvdW50JywgJ05lZ2F0aXZlIERpc2NvdW50JywgJ01hbmlmZXN0IEZlYXR1cmVkJ10pO1xuXHRcdGNvbnN0IGZlYXR1cmVkSXRlbXMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcykuZmlsdGVyKGl0ZW0gPT4gbGFiZWxzLmhhcyhpdGVtLmxhYmVsISkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmZWF0dXJlZEl0ZW1zLm1hcChpdGVtID0+ICh7IGxhYmVsOiBpdGVtLmxhYmVsLCBkZXNjcmlwdGlvbjogaXRlbS5kZXNjcmlwdGlvbiB9KSksIFtcblx0XHRcdHsgbGFiZWw6ICdBdXRvJywgZGVzY3JpcHRpb246IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBsYWJlbDogJ01hbmlmZXN0IEZlYXR1cmVkJywgZGVzY3JpcHRpb246IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBsYWJlbDogJ05lZ2F0aXZlIERpc2NvdW50JywgZGVzY3JpcHRpb246IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBsYWJlbDogJ1plcm8gRGlzY291bnQnLCBkZXNjcmlwdGlvbjogdW5kZWZpbmVkIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ090aGVyIE1vZGVscyBncm91cGVkIGJ5IHZlbmRvciB3aXRoIHNlcGFyYXRvciBoZWFkZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnemVicmEnLCAnWmVicmEnLCAnY29waWxvdCcpO1xuXHRcdGNvbnN0IG1vZGVsQiA9IGNyZWF0ZU1vZGVsKCdhbHBoYScsICdBbHBoYScsICdvdGhlci12ZW5kb3InKTtcblx0XHRjb25zdCBtb2RlbEMgPSBjcmVhdGVNb2RlbCgnYmV0YScsICdCZXRhJywgJ2NvcGlsb3QnKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBLCBtb2RlbEIsIG1vZGVsQ10pO1xuXHRcdC8vIFZlbmRvciBzZXBhcmF0b3JzIHNob3VsZCBiZSBwcmVzZW50IHdpdGggY29ycmVjdCBsYWJlbHNcblx0XHRjb25zdCB2ZW5kb3JTZXBhcmF0b3JzID0gaXRlbXMuZmlsdGVyKGkgPT4gaS5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yICYmIGkubGFiZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZW5kb3JTZXBhcmF0b3JzLmxlbmd0aCwgMik7XG5cdFx0Ly8gVmVuZG9ycyBzb3J0ZWQgYWxwaGFiZXRpY2FsbHkgYnkgZGlzcGxheSBuYW1lXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZlbmRvclNlcGFyYXRvcnNbMF0ubGFiZWwsICdDb3BpbG90Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZlbmRvclNlcGFyYXRvcnNbMV0ubGFiZWwsICdPdGhlci12ZW5kb3InKTtcblx0XHQvLyBNb2RlbHMgd2l0aGluIGVhY2ggdmVuZG9yIGdyb3VwIGFyZSBzb3J0ZWQgYWxwaGFiZXRpY2FsbHlcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdGNvbnN0IG90aGVyTW9kZWxMYWJlbHMgPSBhY3Rpb25zLmZpbHRlcihhID0+ICFhLmlzU2VjdGlvblRvZ2dsZSAmJiBhLnNlY3Rpb24gPT09ICdvdGhlcicpLm1hcChhID0+IGEubGFiZWwhKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG90aGVyTW9kZWxMYWJlbHMsIFsnQmV0YScsICdaZWJyYScsICdBbHBoYSddKTtcblx0fSk7XG5cblx0dGVzdCgnc2luZ2xlIHZlbmRvciBncm91cCBvbWl0cyB2ZW5kb3Igc2VwYXJhdG9yIGhlYWRlcicsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWxBID0gY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nLCAnY29waWxvdCcpO1xuXHRcdGNvbnN0IG1vZGVsQiA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUnLCAnQ2xhdWRlJywgJ2NvcGlsb3QnKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBLCBtb2RlbEJdKTtcblx0XHQvLyBObyB2ZW5kb3Igc2VwYXJhdG9ycyB3aGVuIGFsbCBtb2RlbHMgc2hhcmUgdGhlIHNhbWUgdmVuZG9yXG5cdFx0Y29uc3QgdmVuZG9yU2VwYXJhdG9ycyA9IGl0ZW1zLmZpbHRlcihpID0+IGkua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvciAmJiBpLmxhYmVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmVuZG9yU2VwYXJhdG9ycy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdPdGhlciBNb2RlbHMgc3BsaXRzIGEgc2luZ2xlIHZlbmRvciBpbnRvIHBlci1ncm91cCBzZWN0aW9ucyAoQllPSyknLCAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGVzIGEgQllPSyBzZXR1cCB3aGVyZSBvbmUgdmVuZG9yIChgY3VzdG9tb2FpYCkgYWR2ZXJ0aXNlc1xuXHRcdC8vIHR3byB1c2VyLWNvbmZpZ3VyZWQgcHJvdmlkZXIgZ3JvdXBzLiBUaGUgcGlja2VyIHNob3VsZCBtaXJyb3IgdGhlXG5cdFx0Ly8gbW9kZWwgY29uZmlndXJhdGlvbiB2aWV3IGFuZCByZW5kZXIgb25lIHNlY3Rpb24gcGVyIGdyb3VwIHJhdGhlclxuXHRcdC8vIHRoYW4gY29sbGFwc2luZyB0aGVtIHVuZGVyIHRoZSB2ZW5kb3IgZGlzcGxheSBuYW1lLlxuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBncHQ0MSA9IGNyZWF0ZU1vZGVsKCdncHQtNC4xJywgJ2dwdC00LjEnLCAnY3VzdG9tb2FpJyk7XG5cdFx0Y29uc3Qgb3NzTW9kZWwgPSBjcmVhdGVNb2RlbCgnb3BlbmFpLmdwdC1vc3MtMTIwYicsICdncHQtb3NzLTEyMGInLCAnY3VzdG9tb2FpJyk7XG5cdFx0Y29uc3QgbG1TZXJ2aWNlID0gY3JlYXRlTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlU3R1YihbXG5cdFx0XHR7XG5cdFx0XHRcdHZlbmRvcjogJ2N1c3RvbW9haScsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnT3BlbkFJIENvbXBhdGlibGUnLFxuXHRcdFx0XHRncm91cHM6IFtcblx0XHRcdFx0XHR7IG5hbWU6ICdPcGVuQUkgQ29tcGF0aWJsZScsIG1vZGVsSWRlbnRpZmllcnM6IFtncHQ0MS5pZGVudGlmaWVyXSB9LFxuXHRcdFx0XHRcdHsgbmFtZTogJ0FXUyBCZWRyb2NrJywgbW9kZWxJZGVudGlmaWVyczogW29zc01vZGVsLmlkZW50aWZpZXJdIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvLCBncHQ0MSwgb3NzTW9kZWxdLCB7IGxhbmd1YWdlTW9kZWxzU2VydmljZTogbG1TZXJ2aWNlIH0pO1xuXHRcdGNvbnN0IGxhYmVsbGVkU2VwYXJhdG9ycyA9IGl0ZW1zLmZpbHRlcihpID0+IGkua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvciAmJiBpLmxhYmVsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhYmVsbGVkU2VwYXJhdG9ycy5tYXAocyA9PiBzLmxhYmVsKSwgWydBV1MgQmVkcm9jaycsICdPcGVuQUkgQ29tcGF0aWJsZSddKTtcblx0fSk7XG5cblx0dGVzdCgnT3RoZXIgTW9kZWxzIGtlZXBzIGEgc2luZ2xlIHNlY3Rpb24gd2hlbiBhIHZlbmRvciBoYXMgb25seSBvbmUgZ3JvdXAgKEJZT0spJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBncHQ0MSA9IGNyZWF0ZU1vZGVsKCdncHQtNC4xJywgJ2dwdC00LjEnLCAnY3VzdG9tb2FpJyk7XG5cdFx0Y29uc3QgbG1TZXJ2aWNlID0gY3JlYXRlTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlU3R1YihbXG5cdFx0XHR7XG5cdFx0XHRcdHZlbmRvcjogJ2N1c3RvbW9haScsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnT3BlbkFJIENvbXBhdGlibGUnLFxuXHRcdFx0XHRncm91cHM6IFt7IG5hbWU6ICdPcGVuQUkgQ29tcGF0aWJsZScsIG1vZGVsSWRlbnRpZmllcnM6IFtncHQ0MS5pZGVudGlmaWVyXSB9XSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIGdwdDQxXSwgeyBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IGxtU2VydmljZSB9KTtcblx0XHRjb25zdCBsYWJlbGxlZFNlcGFyYXRvcnMgPSBpdGVtcy5maWx0ZXIoaSA9PiBpLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IgJiYgaS5sYWJlbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsbGVkU2VwYXJhdG9ycy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9tb3RlZCBtb2RlbHMgc2hvdyBwcm92aWRlciBncm91cCBuYW1lIHdoZW4gZ3JvdXBzIGRpc2FtYmlndWF0ZSBhIHNpbmdsZSB2ZW5kb3IgKEJZT0spJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBncHQ0MSA9IGNyZWF0ZU1vZGVsKCdncHQtNC4xJywgJ2dwdC00LjEnLCAnY3VzdG9tb2FpJyk7XG5cdFx0Y29uc3Qgb3NzTW9kZWwgPSBjcmVhdGVNb2RlbCgnb3BlbmFpLmdwdC1vc3MtMTIwYicsICdncHQtb3NzLTEyMGInLCAnY3VzdG9tb2FpJyk7XG5cdFx0Y29uc3QgbG1TZXJ2aWNlID0gY3JlYXRlTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlU3R1YihbXG5cdFx0XHR7XG5cdFx0XHRcdHZlbmRvcjogJ2N1c3RvbW9haScsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnT3BlbkFJIENvbXBhdGlibGUnLFxuXHRcdFx0XHRncm91cHM6IFtcblx0XHRcdFx0XHR7IG5hbWU6ICdPcGVuQUkgQ29tcGF0aWJsZScsIG1vZGVsSWRlbnRpZmllcnM6IFtncHQ0MS5pZGVudGlmaWVyXSB9LFxuXHRcdFx0XHRcdHsgbmFtZTogJ0FXUyBCZWRyb2NrJywgbW9kZWxJZGVudGlmaWVyczogW29zc01vZGVsLmlkZW50aWZpZXJdIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvLCBncHQ0MSwgb3NzTW9kZWxdLCB7XG5cdFx0XHRyZWNlbnRNb2RlbElkczogW2dwdDQxLmlkZW50aWZpZXJdLFxuXHRcdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBsbVNlcnZpY2UsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcHJvbW90ZWQgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcykuZmluZChhID0+IGEubGFiZWwgPT09ICdncHQtNC4xJyk7XG5cdFx0YXNzZXJ0Lm9rKHByb21vdGVkKTtcblx0XHQvLyBCYWRnZSBzaG91bGQgY2FycnkgdGhlIHVzZXItY29uZmlndXJlZCBncm91cCBuYW1lLCBub3QgdGhlIHZlbmRvciBkaXNwbGF5TmFtZS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvbW90ZWQuYmFkZ2UsICdPcGVuQUkgQ29tcGF0aWJsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdPdGhlciBNb2RlbHMgc3BsaXRzIGFnZW50LWhvc3QgbW9kZWxzIGludG8gc2VjdGlvbnMgYnkgdGhlaXIgbW9kZWxHcm91cCBhbmQgbGFiZWxzIGNvcGlsb3RjbGkgYXMgQ29waWxvdCcsICgpID0+IHtcblx0XHQvLyBBZ2VudC1ob3N0IG1vZGVscyBhbGwgc2hhcmUgb25lIHZlbmRvciBidXQgZGVjbGFyZSB0aGVpciB1cHN0cmVhbSBwcm92aWRlcidzXG5cdFx0Ly8gdmVuZG9yIGlkIHZpYSBgbW9kZWxHcm91cGA7IHRoZSBwaWNrZXIgcmVzb2x2ZXMgZWFjaCBncm91cCdzIGRpc3BsYXkgbmFtZSBmcm9tXG5cdFx0Ly8gdGhlIHZlbmRvciByZWdpc3RyeSBhbmQgcmVuZGVycyBvbmUgc2VjdGlvbiBwZXIgcHJvdmlkZXIgaW5zdGVhZCBvZiBjb2xsYXBzaW5nXG5cdFx0Ly8gdGhlbSB1bmRlciB0aGUgc2hhcmVkIHZlbmRvci4gTm8gQllPSyBjb25maWcgZ3JvdXBzIGFyZSByZWdpc3RlcmVkLCBzbyBncm91cGluZ1xuXHRcdC8vIGZhbGxzIHRocm91Z2ggdG8gYG1vZGVsR3JvdXBgLlxuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBjbGkgPSBjcmVhdGVBZ2VudEhvc3RNb2RlbCgnY2xhdWRlLWhhaWt1LTQuNScsICdDbGF1ZGUgSGFpa3UgNC41JywgeyBpZDogJ2NvcGlsb3RjbGknIH0pO1xuXHRcdGNvbnN0IG9wZW5haSA9IGNyZWF0ZUFnZW50SG9zdE1vZGVsKCdvcGVuYWkvZ3B0LTUtbmFubycsICdHUFQtNSBuYW5vJywgeyBpZDogJ29wZW5haScgfSk7XG5cdFx0Y29uc3QgaGYgPSBjcmVhdGVBZ2VudEhvc3RNb2RlbCgnaHVnZ2luZ2ZhY2UvZ2VtbWEnLCAnR2VtbWEnLCB7IGlkOiAnaHVnZ2luZ2ZhY2UnIH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVMYW5ndWFnZU1vZGVsc1NlcnZpY2VTdHViKFtcblx0XHRcdHsgdmVuZG9yOiAnY29waWxvdGNsaScsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCBDTEknLCBncm91cHM6IFtdIH0sXG5cdFx0XHR7IHZlbmRvcjogJ29wZW5haScsIGRpc3BsYXlOYW1lOiAnT3BlbkFJJywgZ3JvdXBzOiBbXSB9LFxuXHRcdFx0eyB2ZW5kb3I6ICdodWdnaW5nZmFjZScsIGRpc3BsYXlOYW1lOiAnSHVnZ2luZyBGYWNlJywgZ3JvdXBzOiBbXSB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvLCBjbGksIG9wZW5haSwgaGZdLCB7IGxhbmd1YWdlTW9kZWxzU2VydmljZTogc2VydmljZSB9KTtcblx0XHRjb25zdCBsYWJlbGxlZFNlcGFyYXRvcnMgPSBpdGVtcy5maWx0ZXIoaSA9PiBpLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IgJiYgaS5sYWJlbCk7XG5cdFx0Ly8gQnVja2V0cyBzb3J0ZWQgYWxwaGFiZXRpY2FsbHkgYnkgcmVzb2x2ZWQgZ3JvdXAgZGlzcGxheSBuYW1lLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFiZWxsZWRTZXBhcmF0b3JzLm1hcChzID0+IHMubGFiZWwpLCBbJ0NvcGlsb3QnLCAnSHVnZ2luZyBGYWNlJywgJ09wZW5BSSddKTtcblx0fSk7XG5cblx0dGVzdCgnT3RoZXIgTW9kZWxzIGtlZXBzIGEgc2luZ2xlIHNlY3Rpb24gd2hlbiBhZ2VudC1ob3N0IG1vZGVscyBzaGFyZSBvbmUgbW9kZWxHcm91cCcsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgYSA9IGNyZWF0ZUFnZW50SG9zdE1vZGVsKCdjbGF1ZGUtaGFpa3UtNC41JywgJ0NsYXVkZSBIYWlrdSA0LjUnLCB7IGlkOiAnY29waWxvdGNsaScgfSk7XG5cdFx0Y29uc3QgYiA9IGNyZWF0ZUFnZW50SG9zdE1vZGVsKCdncHQtNScsICdHUFQtNScsIHsgaWQ6ICdjb3BpbG90Y2xpJyB9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlU3R1YihbeyB2ZW5kb3I6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90IENMSScsIGdyb3VwczogW10gfV0pO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvLCBhLCBiXSwgeyBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IHNlcnZpY2UgfSk7XG5cdFx0Y29uc3QgbGFiZWxsZWRTZXBhcmF0b3JzID0gaXRlbXMuZmlsdGVyKGkgPT4gaS5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yICYmIGkubGFiZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbGxlZFNlcGFyYXRvcnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncHJvbW90ZWQgYWdlbnQtaG9zdCBtb2RlbCBzaG93cyBpdHMgbW9kZWxHcm91cCBuYW1lIGFzIHRoZSBpbmxpbmUgYmFkZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IGNsaSA9IGNyZWF0ZUFnZW50SG9zdE1vZGVsKCdjbGF1ZGUtaGFpa3UtNC41JywgJ0NsYXVkZSBIYWlrdSA0LjUnLCB7IGlkOiAnY29waWxvdGNsaScgfSk7XG5cdFx0Y29uc3Qgb3BlbmFpID0gY3JlYXRlQWdlbnRIb3N0TW9kZWwoJ29wZW5haS9ncHQtNS1uYW5vJywgJ0dQVC01IG5hbm8nLCB7IGlkOiAnb3BlbmFpJyB9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlU3R1YihbXG5cdFx0XHR7IHZlbmRvcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QgQ0xJJywgZ3JvdXBzOiBbXSB9LFxuXHRcdFx0eyB2ZW5kb3I6ICdvcGVuYWknLCBkaXNwbGF5TmFtZTogJ09wZW5BSScsIGdyb3VwczogW10gfSxcblx0XHRdKTtcblx0XHQvLyBNb3JlIHRoYW4gb25lIGdyb3VwIGlzIHByZXNlbnQsIHNvIHByb21vdGVkIG1vZGVscyBzdXJmYWNlIHRoZWlyIGdyb3VwIGlubGluZS5cblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgY2xpLCBvcGVuYWldLCB7IHJlY2VudE1vZGVsSWRzOiBbb3BlbmFpLmlkZW50aWZpZXJdLCBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IHNlcnZpY2UgfSk7XG5cdFx0Y29uc3QgcHJvbW90ZWQgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcykuZmluZChhID0+IGEubGFiZWwgPT09ICdHUFQtNSBuYW5vJyk7XG5cdFx0YXNzZXJ0Lm9rKHByb21vdGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvbW90ZWQuYmFkZ2UsICdPcGVuQUknKTtcblx0fSk7XG5cblx0dGVzdCgnb25TZWxlY3QgY2FsbGJhY2sgaXMgd2lyZWQgaW50byBhY3Rpb24gaXRlbXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsQSA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJyk7XG5cdFx0bGV0IHNlbGVjdGVkTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvblNlbGVjdCA9IChtOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIpID0+IHsgc2VsZWN0ZWRNb2RlbCA9IG07IH07XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIG1vZGVsQV0sIHsgb25TZWxlY3QsIGVudGl0bGVtZW50U2VydmljZTogc3R1YkNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSk7XG5cdFx0Y29uc3QgZ3B0SXRlbSA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKS5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ0dQVC00bycpO1xuXHRcdGFzc2VydC5vayhncHRJdGVtPy5pdGVtKTtcblx0XHRncHRJdGVtLml0ZW0ucnVuKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXIsIG1vZGVsQS5pZGVudGlmaWVyKTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZWN0ZWQgbW9kZWwgaXMgY2hlY2tlZCwgb3RoZXJzIGFyZSBub3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsQSA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJyk7XG5cdFx0Y29uc3QgbW9kZWxCID0gY3JlYXRlTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBLCBtb2RlbEJdLCB7XG5cdFx0XHRzZWxlY3RlZE1vZGVsSWQ6IG1vZGVsQS5pZGVudGlmaWVyLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcyk7XG5cdFx0Y29uc3QgYXV0b0l0ZW0gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsID09PSAnQXV0bycpO1xuXHRcdGNvbnN0IGdwdEl0ZW0gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsID09PSAnR1BULTRvJyk7XG5cdFx0Y29uc3QgY2xhdWRlSXRlbSA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwgPT09ICdDbGF1ZGUnKTtcblx0XHRhc3NlcnQub2soIWF1dG9JdGVtPy5pdGVtPy5jaGVja2VkKTtcblx0XHRhc3NlcnQub2soZ3B0SXRlbT8uaXRlbT8uY2hlY2tlZCk7XG5cdFx0YXNzZXJ0Lm9rKCFjbGF1ZGVJdGVtPy5pdGVtPy5jaGVja2VkKTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZWN0ZWQgYXV0byBtb2RlbCBpcyBjaGVja2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvLCBtb2RlbEFdLCB7XG5cdFx0XHRzZWxlY3RlZE1vZGVsSWQ6IGF1dG8uaWRlbnRpZmllcixcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdGFzc2VydC5vayhhY3Rpb25zWzBdLml0ZW0/LmNoZWNrZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNlbnRseSB1c2VkIG1vZGVsIHJlc29sdmVkIGJ5IG1ldGFkYXRhIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpO1xuXHRcdGNvbnN0IG1vZGVsQiA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUnLCAnQ2xhdWRlJyk7XG5cdFx0Ly8gVXNlIG1ldGFkYXRhIGlkIHJhdGhlciB0aGFuIGlkZW50aWZpZXJcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBLCBtb2RlbEJdLCB7XG5cdFx0XHRyZWNlbnRNb2RlbElkczogWydjbGF1ZGUnXSxcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdC8vIENsYXVkZSBzaG91bGQgYmUgaW4gcHJvbW90ZWQgc2VjdGlvbiAocmlnaHQgYWZ0ZXIgQXV0bylcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS5sYWJlbCwgJ0F1dG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1sxXS5sYWJlbCwgJ0NsYXVkZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBmZWF0dXJlZCBhbmQgcmVjZW50IG1vZGVscyBhbGwgcHJvbW90ZWQgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnYWxwaGEnLCAnQWxwaGEnKTtcblx0XHRjb25zdCBtb2RlbEIgPSBjcmVhdGVNb2RlbCgnYmV0YScsICdCZXRhJyk7XG5cdFx0Y29uc3QgbW9kZWxDID0gY3JlYXRlTW9kZWwoJ2dhbW1hJywgJ0dhbW1hJyk7XG5cdFx0Y29uc3QgbW9kZWxEID0gY3JlYXRlTW9kZWwoJ2RlbHRhJywgJ0RlbHRhJyk7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIG1vZGVsQSwgbW9kZWxCLCBtb2RlbEMsIG1vZGVsRF0sIHtcblx0XHRcdHJlY2VudE1vZGVsSWRzOiBbbW9kZWxDLmlkZW50aWZpZXJdLFxuXHRcdFx0Y29udHJvbE1vZGVsczoge1xuXHRcdFx0XHQnYWxwaGEnOiB7IGxhYmVsOiAnQWxwaGEnLCBmZWF0dXJlZDogdHJ1ZSwgZXhpc3RzOiB0cnVlIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0ubGFiZWwsICdBdXRvJyk7XG5cdFx0Ly8gUHJvbW90ZWQ6IEFscGhhIChmZWF0dXJlZCkgYW5kIEdhbW1hIChyZWNlbnQpIHNvcnRlZCBhbHBoYWJldGljYWxseVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzFdLmxhYmVsLCAnQWxwaGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1syXS5sYWJlbCwgJ0dhbW1hJyk7XG5cdFx0Ly8gVGhlbiBPdGhlciBNb2RlbHMgdG9nZ2xlXG5cdFx0YXNzZXJ0Lm9rKGFjdGlvbnNbM10uaXNTZWN0aW9uVG9nZ2xlKTtcblx0fSk7XG5cblx0dGVzdCgnYWRtaW4gdW5hdmFpbGFibGUgbW9kZWwgc2hvd3MgbWFuYWdlIHNldHRpbmdzIGxpbmsgaW4gZGVzY3JpcHRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IGJ1c2luZXNzRW50aXRsZW1lbnRTZXJ2aWNlID0gY3JlYXRlU3R1YkVudGl0bGVtZW50U2VydmljZSh7IGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuQnVzaW5lc3MgfSk7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG9dLCB7XG5cdFx0XHRyZWNlbnRNb2RlbElkczogWydtaXNzaW5nLW1vZGVsJ10sXG5cdFx0XHRjb250cm9sTW9kZWxzOiB7ICdtaXNzaW5nLW1vZGVsJzogeyBsYWJlbDogJ01pc3NpbmcgTW9kZWwnIH0gYXMgSU1vZGVsQ29udHJvbEVudHJ5IH0sXG5cdFx0XHRtYW5hZ2VTZXR0aW5nc1VybDogJ2h0dHBzOi8vYWthLm1zL2dpdGh1Yi1jb3BpbG90LXNldHRpbmdzJyxcblx0XHRcdGVudGl0bGVtZW50U2VydmljZTogYnVzaW5lc3NFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBhZG1pbkl0ZW0gPSBnZXRBY3Rpb25JdGVtcyhpdGVtcykuZmluZChhID0+IGEubGFiZWwgPT09ICdNaXNzaW5nIE1vZGVsJyk7XG5cdFx0YXNzZXJ0Lm9rKGFkbWluSXRlbSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFkbWluSXRlbS5kaXNhYmxlZCwgdHJ1ZSk7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBhZG1pbkl0ZW0uZGVzY3JpcHRpb247XG5cdFx0YXNzZXJ0Lm9rKGRlc2NyaXB0aW9uIGluc3RhbmNlb2YgTWFya2Rvd25TdHJpbmcpO1xuXHRcdGFzc2VydC5vayhkZXNjcmlwdGlvbi52YWx1ZS5pbmNsdWRlcygnaHR0cHM6Ly9ha2EubXMvZ2l0aHViLWNvcGlsb3Qtc2V0dGluZ3MnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuYXZhaWxhYmxlIG1vZGVscyBrZWVwIGluZGVudGF0aW9uIHdpdGggYmxhbmsgaWNvbicsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG9dLCB7XG5cdFx0XHRyZWNlbnRNb2RlbElkczogWydtaXNzaW5nLW1vZGVsJ10sXG5cdFx0XHRjb250cm9sTW9kZWxzOiB7XG5cdFx0XHRcdCdtaXNzaW5nLW1vZGVsJzogeyBsYWJlbDogJ01pc3NpbmcgTW9kZWwnIH0gYXMgSU1vZGVsQ29udHJvbEVudHJ5LFxuXHRcdFx0fSxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuRnJlZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHVuYXZhaWxhYmxlID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpLmZpbmQoYSA9PiBhLmxhYmVsID09PSAnTWlzc2luZyBNb2RlbCcpO1xuXHRcdGFzc2VydC5vayh1bmF2YWlsYWJsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuYXZhaWxhYmxlLmhpZGVJY29uLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuYXZhaWxhYmxlLmdyb3VwPy5pY29uPy5pZCwgQ29kaWNvbi5ibGFuay5pZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fub255bW91cyB1c2VyIHNlZXMgdXBncmFkZSBkZXNjcmlwdGlvbiBvbiBlYWNoIHVuYXZhaWxhYmxlIG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0b10sIHtcblx0XHRcdHJlY2VudE1vZGVsSWRzOiBbJ21vZGVsLWEnLCAnbW9kZWwtYiddLFxuXHRcdFx0Y29udHJvbE1vZGVsczoge1xuXHRcdFx0XHQnbW9kZWwtYSc6IHsgbGFiZWw6ICdNb2RlbCBBJywgZmVhdHVyZWQ6IHRydWUsIGV4aXN0czogZmFsc2UgfSxcblx0XHRcdFx0J21vZGVsLWInOiB7IGxhYmVsOiAnTW9kZWwgQicsIGZlYXR1cmVkOiB0cnVlLCBleGlzdHM6IGZhbHNlIH0sXG5cdFx0XHR9LFxuXHRcdFx0YW5vbnltb3VzOiB0cnVlLFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Vbmtub3duLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcyk7XG5cdFx0Y29uc3QgZGlzYWJsZWRJdGVtcyA9IGFjdGlvbnMuZmlsdGVyKGEgPT4gYS5kaXNhYmxlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc2FibGVkSXRlbXMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2soZGlzYWJsZWRJdGVtc1swXS5kZXNjcmlwdGlvbiBpbnN0YW5jZW9mIE1hcmtkb3duU3RyaW5nKTtcblx0XHRhc3NlcnQub2soZGlzYWJsZWRJdGVtc1swXS5kZXNjcmlwdGlvbi52YWx1ZS5pbmNsdWRlcygnVXBncmFkZScpKTtcblx0XHRhc3NlcnQub2soZGlzYWJsZWRJdGVtc1sxXS5kZXNjcmlwdGlvbiBpbnN0YW5jZW9mIE1hcmtkb3duU3RyaW5nKTtcblx0XHRhc3NlcnQub2soZGlzYWJsZWRJdGVtc1sxXS5kZXNjcmlwdGlvbi52YWx1ZS5pbmNsdWRlcygnVXBncmFkZScpKTtcblx0fSk7XG5cblx0dGVzdCgnZnJlZSB1c2VyIHNlZXMgdXBncmFkZSBkZXNjcmlwdGlvbiBvbiBlYWNoIHVuYXZhaWxhYmxlIG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0b10sIHtcblx0XHRcdHJlY2VudE1vZGVsSWRzOiBbJ21vZGVsLWEnLCAnbW9kZWwtYiddLFxuXHRcdFx0Y29udHJvbE1vZGVsczoge1xuXHRcdFx0XHQnbW9kZWwtYSc6IHsgbGFiZWw6ICdNb2RlbCBBJywgZmVhdHVyZWQ6IHRydWUsIGV4aXN0czogZmFsc2UgfSxcblx0XHRcdFx0J21vZGVsLWInOiB7IGxhYmVsOiAnTW9kZWwgQicsIGZlYXR1cmVkOiB0cnVlLCBleGlzdHM6IGZhbHNlIH0sXG5cdFx0XHR9LFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5GcmVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcyk7XG5cdFx0Y29uc3QgZGlzYWJsZWRJdGVtcyA9IGFjdGlvbnMuZmlsdGVyKGEgPT4gYS5kaXNhYmxlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc2FibGVkSXRlbXMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2soZGlzYWJsZWRJdGVtc1swXS5kZXNjcmlwdGlvbiBpbnN0YW5jZW9mIE1hcmtkb3duU3RyaW5nKTtcblx0XHRhc3NlcnQub2soZGlzYWJsZWRJdGVtc1swXS5kZXNjcmlwdGlvbi52YWx1ZS5pbmNsdWRlcygnVXBncmFkZScpKTtcblx0XHRhc3NlcnQub2soZGlzYWJsZWRJdGVtc1sxXS5kZXNjcmlwdGlvbiBpbnN0YW5jZW9mIE1hcmtkb3duU3RyaW5nKTtcblx0XHRhc3NlcnQub2soZGlzYWJsZWRJdGVtc1sxXS5kZXNjcmlwdGlvbi52YWx1ZS5pbmNsdWRlcygnVXBncmFkZScpKTtcblx0fSk7XG5cblx0dGVzdCgnYW5vbnltb3VzIHVzZXIgbW9kZWwgc2VsZWN0aW9uIHRyaWdnZXJzIG9uU2VsZWN0IG5vcm1hbGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpO1xuXHRcdGxldCBzZWxlY3RlZE1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb25TZWxlY3QgPSAobTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyKSA9PiB7IHNlbGVjdGVkTW9kZWwgPSBtOyB9O1xuXHRcdGNvbnN0IGFub255bW91c0VudGl0bGVtZW50U2VydmljZSA9IGNyZWF0ZVN0dWJFbnRpdGxlbWVudFNlcnZpY2UoeyBlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlVua25vd24sIGFub255bW91czogdHJ1ZSB9KTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBXSwgeyBvblNlbGVjdCwgZW50aXRsZW1lbnRTZXJ2aWNlOiBhbm9ueW1vdXNFbnRpdGxlbWVudFNlcnZpY2UgfSk7XG5cdFx0Y29uc3QgZ3B0SXRlbSA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKS5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ0dQVC00bycpO1xuXHRcdGFzc2VydC5vayhncHRJdGVtPy5pdGVtKTtcblx0XHRncHRJdGVtLml0ZW0ucnVuKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXIsIG1vZGVsQS5pZGVudGlmaWVyKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd0ZlYXR1cmVkPWZhbHNlIG9taXRzIGZlYXR1cmVkIG1vZGVscyBmcm9tIHByb21vdGVkIHNlY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsQSA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJyk7XG5cdFx0Y29uc3QgbW9kZWxCID0gY3JlYXRlTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBLCBtb2RlbEJdLCB7XG5cdFx0XHRjb250cm9sTW9kZWxzOiB7XG5cdFx0XHRcdCdncHQtNG8nOiB7IGxhYmVsOiAnR1BULTRvJywgZmVhdHVyZWQ6IHRydWUsIGV4aXN0czogdHJ1ZSB9LFxuXHRcdFx0fSxcblx0XHRcdHNob3dGZWF0dXJlZDogZmFsc2UsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKTtcblx0XHQvLyBBdXRvIGZpcnN0LCB0aGVuIE90aGVyIE1vZGVscyB0b2dnbGUsIHRoZW4gbW9kZWxzIGluIG90aGVyIHNlY3Rpb25cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS5sYWJlbCwgJ0F1dG8nKTtcblx0XHQvLyBHUFQtNG8gc2hvdWxkIE5PVCBiZSBwcm9tb3RlZCBcdTIwMTQgaXQgc2hvdWxkIGJlIGluIE90aGVyIE1vZGVsc1xuXHRcdGNvbnN0IHByb21vdGVkTGFiZWxzID0gYWN0aW9ucy5maWx0ZXIoYSA9PiAhYS5pc1NlY3Rpb25Ub2dnbGUgJiYgYS5zZWN0aW9uICE9PSAnb3RoZXInICYmIGEuaXRlbT8uaWQgIT09ICdtYW5hZ2VNb2RlbHMnKS5tYXAoYSA9PiBhLmxhYmVsKTtcblx0XHRhc3NlcnQub2soIXByb21vdGVkTGFiZWxzLmluY2x1ZGVzKCdHUFQtNG8nKSwgJ0dQVC00byBzaG91bGQgbm90IGJlIGluIHByb21vdGVkIHNlY3Rpb24gd2hlbiBzaG93RmVhdHVyZWQ9ZmFsc2UnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd1VuYXZhaWxhYmxlRmVhdHVyZWQ9ZmFsc2Ugb21pdHMgdW5hdmFpbGFibGUgZmVhdHVyZWQgbW9kZWxzIGZyb20gcHJvbW90ZWQgc2VjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG9dLCB7XG5cdFx0XHRjb250cm9sTW9kZWxzOiB7XG5cdFx0XHRcdCdwcmVtaXVtLW1vZGVsJzogeyBsYWJlbDogJ1ByZW1pdW0gTW9kZWwnLCBmZWF0dXJlZDogdHJ1ZSwgZXhpc3RzOiBmYWxzZSB9LFxuXHRcdFx0fSxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuRnJlZSxcblx0XHRcdHNob3dVbmF2YWlsYWJsZUZlYXR1cmVkOiBmYWxzZSxcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdC8vIFByZW1pdW0gTW9kZWwgc2hvdWxkIG5vdCBhcHBlYXIgYXQgYWxsXG5cdFx0Y29uc3QgcHJlbWl1bUl0ZW0gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsID09PSAnUHJlbWl1bSBNb2RlbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVtaXVtSXRlbSwgdW5kZWZpbmVkLCAnVW5hdmFpbGFibGUgZmVhdHVyZWQgbW9kZWwgc2hvdWxkIG5vdCBhcHBlYXIgd2hlbiBzaG93VW5hdmFpbGFibGVGZWF0dXJlZD1mYWxzZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93VW5hdmFpbGFibGVGZWF0dXJlZD1mYWxzZSBzdGlsbCBzaG93cyBhdmFpbGFibGUgZmVhdHVyZWQgbW9kZWxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvLCBtb2RlbEFdLCB7XG5cdFx0XHRjb250cm9sTW9kZWxzOiB7XG5cdFx0XHRcdCdncHQtNG8nOiB7IGxhYmVsOiAnR1BULTRvJywgZmVhdHVyZWQ6IHRydWUsIGV4aXN0czogdHJ1ZSB9LFxuXHRcdFx0fSxcblx0XHRcdHNob3dVbmF2YWlsYWJsZUZlYXR1cmVkOiBmYWxzZSxcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdC8vIEdQVC00byBpcyBhdmFpbGFibGUgYW5kIGZlYXR1cmVkLCBzbyBpdCBzaG91bGQgc3RpbGwgYXBwZWFyIGluIHByb21vdGVkXG5cdFx0Y29uc3QgZ3B0SXRlbSA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwgPT09ICdHUFQtNG8nKTtcblx0XHRhc3NlcnQub2soZ3B0SXRlbSwgJ0F2YWlsYWJsZSBmZWF0dXJlZCBtb2RlbCBzaG91bGQgYXBwZWFyIGV2ZW4gd2hlbiBzaG93VW5hdmFpbGFibGVGZWF0dXJlZD1mYWxzZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93VW5hdmFpbGFibGVGZWF0dXJlZD1mYWxzZSB3aXRoIHZlcnNpb24tZ2F0ZWQgbW9kZWwgYWxsb3dzIGl0IGluIE90aGVyIE1vZGVscycsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWxBID0gY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBXSwge1xuXHRcdFx0Y29udHJvbE1vZGVsczoge1xuXHRcdFx0XHQnZ3B0LTRvJzogeyBsYWJlbDogJ0dQVC00bycsIGZlYXR1cmVkOiB0cnVlLCBtaW5WU0NvZGVWZXJzaW9uOiAnMi4wLjAnLCBleGlzdHM6IHRydWUgfSxcblx0XHRcdH0sXG5cdFx0XHRzaG93VW5hdmFpbGFibGVGZWF0dXJlZDogZmFsc2UsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKTtcblx0XHQvLyBWZXJzaW9uLWdhdGVkIG1vZGVsIHNob3VsZCBub3QgYmUgaW4gcHJvbW90ZWQgc2VjdGlvbiBhcyB1bmF2YWlsYWJsZVxuXHRcdGNvbnN0IHByb21vdGVkR3B0ID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ0dQVC00bycgJiYgYS5zZWN0aW9uICE9PSAnb3RoZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvbW90ZWRHcHQ/LmRpc2FibGVkLCB1bmRlZmluZWQsICdWZXJzaW9uLWdhdGVkIGZlYXR1cmVkIG1vZGVsIHNob3VsZCBub3QgYXBwZWFyIGFzIHVuYXZhaWxhYmxlIGluIHByb21vdGVkIHdoZW4gc2hvd1VuYXZhaWxhYmxlRmVhdHVyZWQ9ZmFsc2UnKTtcblx0XHQvLyBJdCBzaG91bGQgc3RpbGwgYXBwZWFyIGluIE90aGVyIE1vZGVscyBzaW5jZSBpdCB3YXMgbm90IHBsYWNlZFxuXHRcdGNvbnN0IG90aGVyR3B0ID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ0dQVC00bycgJiYgYS5zZWN0aW9uID09PSAnb3RoZXInKTtcblx0XHRhc3NlcnQub2sob3RoZXJHcHQsICdWZXJzaW9uLWdhdGVkIGZlYXR1cmVkIG1vZGVsIHNob3VsZCBhcHBlYXIgaW4gT3RoZXIgTW9kZWxzIHdoZW4gc2hvd1VuYXZhaWxhYmxlRmVhdHVyZWQ9ZmFsc2UnKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgZGVzY3JpcHRpb24gaW5jbHVkZXMgcHJpY2luZyB3aGVuIHNldCcsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWxBID0gY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nKTtcblx0XHRtb2RlbEEubWV0YWRhdGEgPSB7IC4uLm1vZGVsQS5tZXRhZGF0YSwgcHJpY2luZzogJzN4JywgbXVsdGlwbGllck51bWVyaWM6IDMgfSBhcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBXSk7XG5cdFx0Y29uc3QgZ3B0SXRlbSA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKS5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ0dQVC00bycpO1xuXHRcdGFzc2VydC5vayhncHRJdGVtKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3B0SXRlbS5pdGVtPy5kZXNjcmlwdGlvbiwgJzN4Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsIGRlc2NyaXB0aW9uIGNvbWJpbmVzIGRldGFpbCBhbmQgcHJpY2luZycsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWxBID0gY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nKTtcblx0XHRtb2RlbEEubWV0YWRhdGEgPSB7IC4uLm1vZGVsQS5tZXRhZGF0YSwgZGV0YWlsOiAnSGlnaCcsIHByaWNpbmc6ICczeCcsIG11bHRpcGxpZXJOdW1lcmljOiAzIH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIG1vZGVsQV0pO1xuXHRcdGNvbnN0IGdwdEl0ZW0gPSBnZXRBY3Rpb25JdGVtcyhpdGVtcykuZmluZChhID0+IGEubGFiZWwgPT09ICdHUFQtNG8nKTtcblx0XHRhc3NlcnQub2soZ3B0SXRlbSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdwdEl0ZW0uaXRlbT8uZGVzY3JpcHRpb24sICdIaWdoIFx1MDBCNyAzeCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBkZXNjcmlwdGlvbiBoaWRlcyBub24tbXVsdGlwbGllciBwcmljaW5nIGZyb20gZGVzY3JpcHRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsQSA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJyk7XG5cdFx0bW9kZWxBLm1ldGFkYXRhID0geyAuLi5tb2RlbEEubWV0YWRhdGEsIGRldGFpbDogJ1Byb3ZpZGVyJywgcHJpY2luZzogJ0luOiAyLjA0IFx1MDBCNyBPdXQ6IDQuMzQgQUlDcy8xTSB0b2tlbnMnIH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIG1vZGVsQV0pO1xuXHRcdGNvbnN0IGdwdEl0ZW0gPSBnZXRBY3Rpb25JdGVtcyhpdGVtcykuZmluZChhID0+IGEubGFiZWwgPT09ICdHUFQtNG8nKTtcblx0XHRhc3NlcnQub2soZ3B0SXRlbSk7XG5cdFx0Ly8gTm9uLW11bHRpcGxpZXIgcHJpY2luZyBzaG91bGQgbm90IGFwcGVhciBpbiBkZXNjcmlwdGlvblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncHRJdGVtLml0ZW0/LmRlc2NyaXB0aW9uLCAnUHJvdmlkZXInKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgZGVzY3JpcHRpb24gc2hvd3MgbXVsdGlwbGllciBwcmljaW5nIGluIGRlc2NyaXB0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScpO1xuXHRcdG1vZGVsQS5tZXRhZGF0YSA9IHsgLi4ubW9kZWxBLm1ldGFkYXRhLCBwcmljaW5nOiAnMTV4JywgbXVsdGlwbGllck51bWVyaWM6IDE1IH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIG1vZGVsQV0pO1xuXHRcdGNvbnN0IGNsYXVkZUl0ZW0gPSBnZXRBY3Rpb25JdGVtcyhpdGVtcykuZmluZChhID0+IGEubGFiZWwgPT09ICdDbGF1ZGUnKTtcblx0XHRhc3NlcnQub2soY2xhdWRlSXRlbSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsYXVkZUl0ZW0uaXRlbT8uZGVzY3JpcHRpb24sICcxNXgnKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgd2l0aCBubyBwcmljaW5nIGFuZCBubyBkZXRhaWwgaGFzIHVuZGVmaW5lZCBkZXNjcmlwdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWxBID0gY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBXSk7XG5cdFx0Y29uc3QgZ3B0SXRlbSA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKS5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ0dQVC00bycpO1xuXHRcdGFzc2VydC5vayhncHRJdGVtKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3B0SXRlbS5pdGVtPy5kZXNjcmlwdGlvbiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgd2l0aCBwcmljZUNhdGVnb3J5IHNob3dzIGFyaWFEZXNjcmlwdGlvbiB3aXRoIHByaWNlIGxhYmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpO1xuXHRcdG1vZGVsQS5tZXRhZGF0YSA9IHsgLi4ubW9kZWxBLm1ldGFkYXRhLCBwcmljZUNhdGVnb3J5OiAnbWVkaXVtJyB9IGFzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvLCBtb2RlbEFdKTtcblx0XHRjb25zdCBncHRJdGVtID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpLmZpbmQoYSA9PiBhLmxhYmVsID09PSAnR1BULTRvJyk7XG5cdFx0YXNzZXJ0Lm9rKGdwdEl0ZW0pO1xuXHRcdC8vIFByaWNlIGNhdGVnb3J5IGlzIG5vIGxvbmdlciBzaG93biBhcyBjaXJjbGUgaW5kaWNhdG9ycyBpbiB0aGUgZGVzY3JpcHRpb25cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3B0SXRlbS5kZXNjcmlwdGlvbiwgdW5kZWZpbmVkKTtcblx0XHQvLyBhcmlhRGVzY3JpcHRpb24gc2hvdWxkIGJlIGEgcmVhZGFibGUgbGFiZWwgZm9yIHNjcmVlbiByZWFkZXJzXG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBncHRJdGVtLmFyaWFEZXNjcmlwdGlvbiA9PT0gJ3N0cmluZycpO1xuXHRcdGFzc2VydC5vayghZ3B0SXRlbS5hcmlhRGVzY3JpcHRpb24uaW5jbHVkZXMoJ2NpcmNsZScpKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgd2l0aCB1bmtub3duIHByaWNlQ2F0ZWdvcnkgc2hvd3Mgbm8gY2lyY2xlIGluZGljYXRvcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsQSA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJyk7XG5cdFx0bW9kZWxBLm1ldGFkYXRhID0geyAuLi5tb2RlbEEubWV0YWRhdGEsIHByaWNlQ2F0ZWdvcnk6ICd1bmtub3duX3RpZXInIH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIG1vZGVsQV0pO1xuXHRcdGNvbnN0IGdwdEl0ZW0gPSBnZXRBY3Rpb25JdGVtcyhpdGVtcykuZmluZChhID0+IGEubGFiZWwgPT09ICdHUFQtNG8nKTtcblx0XHRhc3NlcnQub2soZ3B0SXRlbSk7XG5cdFx0Ly8gVW5rbm93biBjYXRlZ29yeSBzaG91bGQgZmFsbCB0aHJvdWdoIHRvIG5vcm1hbCBkZXNjcmlwdGlvbiAodW5kZWZpbmVkIHNpbmNlIG5vIGRldGFpbClcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3B0SXRlbS5pdGVtPy5kZXNjcmlwdGlvbiwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3B0SXRlbS5kZXNjcmlwdGlvbiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncHJvbW90ZWQgbW9kZWxzIHNob3cgaW5saW5lIHZlbmRvciBsYWJlbCB3aGVuIG11bHRpcGxlIHZlbmRvcnMgZXhpc3QgYWNyb3NzIGFsbCBtb2RlbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsQSA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJywgJ2NvcGlsb3QnKTtcblx0XHRtb2RlbEEubWV0YWRhdGEgPSB7IC4uLm1vZGVsQS5tZXRhZGF0YSwgcHJpY2luZzogJzE1eCcsIG11bHRpcGxpZXJOdW1lcmljOiAxNSB9IGFzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhO1xuXHRcdGNvbnN0IG1vZGVsQiA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUnLCAnQ2xhdWRlJywgJ2FudGhyb3BpYycpO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvLCBtb2RlbEEsIG1vZGVsQl0sIHtcblx0XHRcdHJlY2VudE1vZGVsSWRzOiBbbW9kZWxBLmlkZW50aWZpZXJdLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRBY3Rpb25JdGVtcyhpdGVtcyk7XG5cdFx0Ly8gR1BULTRvIGlzIHByb21vdGVkIChyZWNlbnQpIGFuZCBzaG91bGQgc2hvdyB0aGUgc291cmNlIGlubGluZSB3aGlsZSBrZWVwaW5nIG11bHRpcGxpZXIgb24gdGhlIHJpZ2h0LlxuXHRcdGNvbnN0IGdwdEl0ZW0gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsID09PSAnR1BULTRvJyk7XG5cdFx0YXNzZXJ0Lm9rKGdwdEl0ZW0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncHRJdGVtLmNsYXNzTmFtZSwgJ2NoYXQtbW9kZWwtcGlja2VyLWlubGluZS1zb3VyY2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3B0SXRlbS5iYWRnZSwgJ0NvcGlsb3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3B0SXRlbS5kZXNjcmlwdGlvbiwgJzE1eCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9tb3RlZCBtb2RlbHMgb21pdCBpbmxpbmUgdmVuZG9yIGxhYmVsIHdoZW4gb25seSBvbmUgdmVuZG9yIGV4aXN0cycsICgpID0+IHtcblx0XHRjb25zdCBhdXRvID0gY3JlYXRlQXV0b01vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWxBID0gY3JlYXRlTW9kZWwoJ2dwdC00bycsICdHUFQtNG8nLCAnY29waWxvdCcpO1xuXHRcdGNvbnN0IG1vZGVsQiA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUnLCAnQ2xhdWRlJywgJ2NvcGlsb3QnKTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBLCBtb2RlbEJdLCB7XG5cdFx0XHRyZWNlbnRNb2RlbElkczogW21vZGVsQS5pZGVudGlmaWVyXSxcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdGNvbnN0IGdwdEl0ZW0gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsID09PSAnR1BULTRvJyk7XG5cdFx0YXNzZXJ0Lm9rKGdwdEl0ZW0pO1xuXHRcdC8vIE5vIHZlbmRvciBsYWJlbCBzaW5jZSBhbGwgbW9kZWxzIGFyZSBmcm9tIHRoZSBzYW1lIHZlbmRvclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncHRJdGVtLmNsYXNzTmFtZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3B0SXRlbS5iYWRnZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgndmVuZG9yIGRldGFpbCBpcyBzdXBwcmVzc2VkIGluIE90aGVyIE1vZGVscyB3aGVuIG11bHRpcGxlIHZlbmRvciBncm91cHMgc2hvd24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsQSA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJywgJ2NvcGlsb3QnKTtcblx0XHRtb2RlbEEubWV0YWRhdGEgPSB7IC4uLm1vZGVsQS5tZXRhZGF0YSwgZGV0YWlsOiAnR2l0SHViIENvcGlsb3QnIH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdFx0Y29uc3QgbW9kZWxCID0gY3JlYXRlTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnLCAnYW50aHJvcGljJyk7XG5cdFx0bW9kZWxCLm1ldGFkYXRhID0geyAuLi5tb2RlbEIubWV0YWRhdGEsIGRldGFpbDogJ0FudGhyb3BpYycgfSBhcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChbYXV0bywgbW9kZWxBLCBtb2RlbEJdKTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdC8vIERldGFpbCBzaG91bGQgYmUgc3VwcHJlc3NlZCBmb3IgbW9kZWxzIGluIHZlbmRvciBncm91cHNcblx0XHRjb25zdCBncHRJdGVtID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ0dQVC00bycpO1xuXHRcdGFzc2VydC5vayhncHRJdGVtKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3B0SXRlbS5pdGVtPy5kZXNjcmlwdGlvbiwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBjbGF1ZGVJdGVtID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ0NsYXVkZScpO1xuXHRcdGFzc2VydC5vayhjbGF1ZGVJdGVtKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xhdWRlSXRlbS5pdGVtPy5kZXNjcmlwdGlvbiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncGlubmVkIG1vZGVscyBhcmUgZ3JvdXBlZCBieSBwcm92aWRlciBhbmQgc29ydGVkIGFscGhhYmV0aWNhbGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBjb3BpbG90QWxwaGEgPSBjcmVhdGVBZ2VudEhvc3RNb2RlbCgnY29waWxvdC1hbHBoYScsICdBbHBoYScsIHsgaWQ6ICdjb3BpbG90Y2xpJyB9KTtcblx0XHRjb25zdCBjb3BpbG90WmV0YSA9IGNyZWF0ZUFnZW50SG9zdE1vZGVsKCdjb3BpbG90LXpldGEnLCAnWmV0YScsIHsgaWQ6ICdjb3BpbG90Y2xpJyB9KTtcblx0XHRjb25zdCBvcGVuUm91dGVyQWxwaGEgPSBjcmVhdGVBZ2VudEhvc3RNb2RlbCgnb3BlbnJvdXRlci1hbHBoYScsICdBbHBoYScsIHsgaWQ6ICdvcGVucm91dGVyJyB9KTtcblx0XHRjb25zdCBvcGVuUm91dGVyWmV0YSA9IGNyZWF0ZUFnZW50SG9zdE1vZGVsKCdvcGVucm91dGVyLXpldGEnLCAnWmV0YScsIHsgaWQ6ICdvcGVucm91dGVyJyB9KTtcblx0XHRjb25zdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UgPSBjcmVhdGVMYW5ndWFnZU1vZGVsc1NlcnZpY2VTdHViKFtcblx0XHRcdHsgdmVuZG9yOiAnY29waWxvdGNsaScsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCBDTEknLCBncm91cHM6IFtdIH0sXG5cdFx0XHR7IHZlbmRvcjogJ29wZW5yb3V0ZXInLCBkaXNwbGF5TmFtZTogJ09wZW4gUm91dGVyJywgZ3JvdXBzOiBbXSB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKFthdXRvLCBjb3BpbG90WmV0YSwgb3BlblJvdXRlclpldGEsIGNvcGlsb3RBbHBoYSwgb3BlblJvdXRlckFscGhhXSwge1xuXHRcdFx0cGlubmVkTW9kZWxJZHM6IFtvcGVuUm91dGVyWmV0YS5pZGVudGlmaWVyLCBjb3BpbG90WmV0YS5pZGVudGlmaWVyLCBvcGVuUm91dGVyQWxwaGEuaWRlbnRpZmllciwgY29waWxvdEFscGhhLmlkZW50aWZpZXJdLFxuXHRcdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBpbm5lZFNlcCA9IGl0ZW1zLmZpbmQoaSA9PiBpLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IgJiYgaS5sYWJlbCA9PT0gJ1Bpbm5lZCcpO1xuXHRcdGFzc2VydC5vayhwaW5uZWRTZXAsICdQaW5uZWQgc2VwYXJhdG9yIGhlYWRlciBzaG91bGQgZXhpc3QnKTtcblx0XHRjb25zdCBwaW5uZWRTZXBJbmRleCA9IGl0ZW1zLmluZGV4T2YocGlubmVkU2VwISk7XG5cdFx0Y29uc3QgbmV4dFNlcGFyYXRvckluZGV4ID0gaXRlbXMuZmluZEluZGV4KChpdGVtLCBpbmRleCkgPT4gaW5kZXggPiBwaW5uZWRTZXBJbmRleCAmJiBpdGVtLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IpO1xuXHRcdGNvbnN0IHBpbm5lZEl0ZW1zID0gaXRlbXMuc2xpY2UocGlubmVkU2VwSW5kZXggKyAxLCBuZXh0U2VwYXJhdG9ySW5kZXgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGlubmVkSXRlbXMubWFwKGl0ZW0gPT4gKHsgcHJvdmlkZXI6IGl0ZW0uYmFkZ2UsIG5hbWU6IGl0ZW0ubGFiZWwgfSkpLCBbXG5cdFx0XHR7IHByb3ZpZGVyOiAnQ29waWxvdCcsIG5hbWU6ICdBbHBoYScgfSxcblx0XHRcdHsgcHJvdmlkZXI6ICdDb3BpbG90JywgbmFtZTogJ1pldGEnIH0sXG5cdFx0XHR7IHByb3ZpZGVyOiAnT3BlbiBSb3V0ZXInLCBuYW1lOiAnQWxwaGEnIH0sXG5cdFx0XHR7IHByb3ZpZGVyOiAnT3BlbiBSb3V0ZXInLCBuYW1lOiAnWmV0YScgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncGlubmVkIG1vZGVscyBkbyBub3QgYXBwZWFyIGluIE1SVS9wcm9tb3RlZCBzZWN0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG8gPSBjcmVhdGVBdXRvTW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpO1xuXHRcdGNvbnN0IG1vZGVsQiA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUnLCAnQ2xhdWRlJyk7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIG1vZGVsQSwgbW9kZWxCXSwge1xuXHRcdFx0cGlubmVkTW9kZWxJZHM6IFttb2RlbEEuaWRlbnRpZmllcl0sXG5cdFx0XHRyZWNlbnRNb2RlbElkczogW21vZGVsQS5pZGVudGlmaWVyLCBtb2RlbEIuaWRlbnRpZmllcl0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkl0ZW1zKGl0ZW1zKTtcblx0XHQvLyBHUFQtNG8gc2hvdWxkIG9ubHkgYXBwZWFyIG9uY2UgKGluIHBpbm5lZCwgbm90IGFnYWluIGluIHByb21vdGVkKVxuXHRcdGNvbnN0IGdwdEl0ZW1zID0gYWN0aW9ucy5maWx0ZXIoYSA9PiBhLmxhYmVsID09PSAnR1BULTRvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdwdEl0ZW1zLmxlbmd0aCwgMSwgJ1Bpbm5lZCBtb2RlbCBzaG91bGQgYXBwZWFyIGV4YWN0bHkgb25jZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdNUlUgaXMgY2FwcGVkIGF0IDMgYWZ0ZXIgZmlsdGVyaW5nIHBpbm5lZCBtb2RlbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVscyA9IFtcblx0XHRcdGF1dG8sXG5cdFx0XHRjcmVhdGVNb2RlbCgnbTEnLCAnTW9kZWwgMScpLFxuXHRcdFx0Y3JlYXRlTW9kZWwoJ20yJywgJ01vZGVsIDInKSxcblx0XHRcdGNyZWF0ZU1vZGVsKCdtMycsICdNb2RlbCAzJyksXG5cdFx0XHRjcmVhdGVNb2RlbCgnbTQnLCAnTW9kZWwgNCcpLFxuXHRcdFx0Y3JlYXRlTW9kZWwoJ201JywgJ01vZGVsIDUnKSxcblx0XHRdO1xuXHRcdGNvbnN0IGl0ZW1zID0gY2FsbEJ1aWxkKG1vZGVscywge1xuXHRcdFx0cmVjZW50TW9kZWxJZHM6IFttb2RlbHNbMV0uaWRlbnRpZmllciwgbW9kZWxzWzJdLmlkZW50aWZpZXIsIG1vZGVsc1szXS5pZGVudGlmaWVyLCBtb2RlbHNbNF0uaWRlbnRpZmllciwgbW9kZWxzWzVdLmlkZW50aWZpZXJdLFxuXHRcdFx0cGlubmVkTW9kZWxJZHM6IFttb2RlbHNbMV0uaWRlbnRpZmllcl0sXG5cdFx0fSk7XG5cdFx0Ly8gTW9kZWwgMSBpcyBwaW5uZWQsIE1SVSBzaG91bGQgYmUgTW9kZWwgMiwgMywgNCAoY2FwcGVkIGF0IDMpLCBNb2RlbCA1IGdvZXMgdG8gT3RoZXJcblx0XHRjb25zdCBhY3Rpb25zID0gZ2V0QWN0aW9uSXRlbXMoaXRlbXMpO1xuXHRcdGNvbnN0IHByb21vdGVkTGFiZWxzID0gYWN0aW9uc1xuXHRcdFx0LmZpbHRlcihhID0+ICFhLmlzU2VjdGlvblRvZ2dsZSAmJiBhLnNlY3Rpb24gIT09ICdvdGhlcicgJiYgYS5pdGVtPy5pZCAhPT0gJ21hbmFnZU1vZGVscycgJiYgYS5sYWJlbCAhPT0gJ0F1dG8nICYmIGEubGFiZWwgIT09ICdNb2RlbCAxJylcblx0XHRcdC5tYXAoYSA9PiBhLmxhYmVsKTtcblx0XHRhc3NlcnQub2socHJvbW90ZWRMYWJlbHMubGVuZ3RoIDw9IDMsICdNUlUgc2hvdWxkIGJlIGNhcHBlZCBhdCAzJyk7XG5cdFx0YXNzZXJ0Lm9rKCFwcm9tb3RlZExhYmVscy5pbmNsdWRlcygnTW9kZWwgMScpLCAnUGlubmVkIG1vZGVsIHNob3VsZCBub3QgYmUgaW4gTVJVJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vIHBpbm5lZCBzZWN0aW9uIHdoZW4gcGlubmVkTW9kZWxJZHMgaXMgZW1wdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0byA9IGNyZWF0ZUF1dG9Nb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsQSA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJyk7XG5cdFx0Y29uc3QgaXRlbXMgPSBjYWxsQnVpbGQoW2F1dG8sIG1vZGVsQV0sIHtcblx0XHRcdHBpbm5lZE1vZGVsSWRzOiBbXSxcblx0XHRcdHJlY2VudE1vZGVsSWRzOiBbbW9kZWxBLmlkZW50aWZpZXJdLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBpbm5lZFNlcCA9IGl0ZW1zLmZpbmQoaSA9PiBpLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IgJiYgaS5sYWJlbCA9PT0gJ1Bpbm5lZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaW5uZWRTZXAsIHVuZGVmaW5lZCwgJ05vIHBpbm5lZCBzZXBhcmF0b3Igd2hlbiB0aGVyZSBhcmUgbm8gcGlubmVkIG1vZGVscycpO1xuXHR9KTtcbn0pO1xuXG4vKipcbiAqIFJlZ3Jlc3Npb24gY292ZXJhZ2UgZm9yIHRoZSBjaGF0IG1vZGVsIHBpY2tlci5cbiAqXG4gKiBHdWFyZHMgdGhlIGVuZC10by1lbmQgcGlja2VyIHBpcGVsaW5lIChgZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbmAgXHUyMTkyXG4gKiBgYnVpbGRNb2RlbFBpY2tlckl0ZW1zYCkgYWdhaW5zdCByZWdyZXNzaW9ucyB3aGVyZSBtb2RlbHMgY29udHJpYnV0ZWQgYnkgYVxuICogYGxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJgIGV4dGVuc2lvbiBzdG9wIGFwcGVhcmluZyBpbiB0aGUgcGlja2VyIGV2ZW5cbiAqIHRob3VnaCB0aGV5IHJlbWFpbiB2aXNpYmxlIGluIHRoZSBtb2RlbCBjb25maWd1cmF0aW9uIHZpZXcuXG4gKlxuICogQmVoYXZpb3IgdW5kZXIgdGVzdDogYG1ldGFkYXRhLmlzVXNlclNlbGVjdGFibGVgIGRlZmF1bHRzIHRvIGB0cnVlYC4gT25seSBhblxuICogZXhwbGljaXQgYGZhbHNlYCBoaWRlcyBhIG1vZGVsIGZyb20gdGhlIHBpY2tlcjsgYm90aCBgdW5kZWZpbmVkYCBhbmQgYHRydWVgXG4gKiBtYWtlIHRoZSBtb2RlbCB2aXNpYmxlLiBUaGlzIHJ1bGUgYXBwbGllcyB1bmlmb3JtbHkgdG8gdGhlIGNvcGlsb3QgdmVuZG9yXG4gKiBhbmQgdG8gdGhpcmQtcGFydHkgYGxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJgIHZlbmRvcnMsIGFuZCBtYXRjaGVzIHdoYXRcbiAqIHRoZSBtb2RlbCBjb25maWd1cmF0aW9uIHZpZXcgc3VyZmFjZXMuXG4gKi9cbnN1aXRlKCdjaGF0IG1vZGVsIHBpY2tlciAtIGxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXIgdmlzaWJpbGl0eSByZWdyZXNzaW9uJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUNvcGlsb3RNb2RlbChcblx0XHRpZDogc3RyaW5nLFxuXHRcdG5hbWU6IHN0cmluZyxcblx0XHRvdmVycmlkZXM6IFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+ID0ge30sXG5cdCk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkZW50aWZpZXI6IGBjb3BpbG90LyR7aWR9YCxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHR2ZW5kb3I6ICdjb3BpbG90Jyxcblx0XHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0ZmFtaWx5OiAnY29waWxvdCcsXG5cdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMjhfMDAwLFxuXHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDRfMDk2LFxuXHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHRcdGlzVXNlclNlbGVjdGFibGU6IHRydWUsXG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogdHJ1ZSwgYWdlbnRNb2RlOiB0cnVlIH0sXG5cdFx0XHRcdC4uLm92ZXJyaWRlcyxcblx0XHRcdH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRoaXJkUGFydHlNb2RlbChcblx0XHRpZDogc3RyaW5nLFxuXHRcdG5hbWU6IHN0cmluZyxcblx0XHRvdmVycmlkZXM6IFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+ID0ge30sXG5cdCk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkZW50aWZpZXI6IGBteS12ZW5kb3IvJHtpZH1gLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdG5hbWUsXG5cdFx0XHRcdHZlbmRvcjogJ215LXZlbmRvcicsXG5cdFx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdGZhbWlseTogJ215LWZhbWlseScsXG5cdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMjhfMDAwLFxuXHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDRfMDk2LFxuXHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogdHJ1ZSwgYWdlbnRNb2RlOiB0cnVlIH0sXG5cdFx0XHRcdC4uLm92ZXJyaWRlcyxcblx0XHRcdH0gYXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSdW5zIHRoZSBmdWxsIHBpY2tlciBwaXBlbGluZSAoYGZpbHRlck1vZGVsc0ZvclNlc3Npb25gIFx1MjE5MlxuXHQgKiBgYnVpbGRNb2RlbFBpY2tlckl0ZW1zYCkgZm9yIGFuIEFzay1tb2RlL0NoYXQtbG9jYXRpb24gc2Vzc2lvbiBhbmRcblx0ICogcmV0dXJucyB0aGUgYWN0aW9uYWJsZSBtb2RlbCBlbnRyaWVzIChleGNsdWRpbmcgdGhlIGF1dG8gZW50cnksIHRoZVxuXHQgKiBcIk90aGVyIE1vZGVsc1wiIHRvZ2dsZSwgc2VwYXJhdG9ycywgYW5kIHRoZSBcIk1hbmFnZSBNb2RlbHMuLi5cIiBlbnRyeSkuXG5cdCAqL1xuXHRmdW5jdGlvbiBydW5QaWNrZXJQaXBlbGluZShcblx0XHRtb2RlbHM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdLFxuXHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0KTogSUFjdGlvbkxpc3RJdGVtPElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbj5bXSB7XG5cdFx0Y29uc3QgZmlsdGVyZWQgPSBmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uKFxuXHRcdFx0bW9kZWxzLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0Q2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0KTtcblx0XHRjb25zdCBpdGVtcyA9IGNhbGxCdWlsZChmaWx0ZXJlZCwgeyBsYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSk7XG5cdFx0cmV0dXJuIGl0ZW1zLmZpbHRlcihpID0+XG5cdFx0XHRpLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24gJiZcblx0XHRcdCFpLmlzU2VjdGlvblRvZ2dsZSAmJlxuXHRcdFx0aS5sYWJlbCAhPT0gJ0F1dG8nICYmXG5cdFx0XHRpLml0ZW0/LmlkICE9PSAnbWFuYWdlTW9kZWxzJ1xuXHRcdCk7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIGEgb25lLWdyb3VwLXBlci12ZW5kb3IgYElMYW5ndWFnZU1vZGVsc1NlcnZpY2VgIHN0dWIgb24gdG9wIG9mXG5cdCAqIHRoZSBmaWxlLWxldmVsIGBjcmVhdGVMYW5ndWFnZU1vZGVsc1NlcnZpY2VTdHViYCBoZWxwZXIuXG5cdCAqL1xuXHRmdW5jdGlvbiBidWlsZExtU2VydmljZShcblx0XHR2ZW5kb3JzOiB7IHZlbmRvcjogc3RyaW5nOyBkaXNwbGF5TmFtZTogc3RyaW5nOyBtb2RlbElkZW50aWZpZXJzOiBzdHJpbmdbXSB9W10sXG5cdCk6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2Uge1xuXHRcdHJldHVybiBjcmVhdGVMYW5ndWFnZU1vZGVsc1NlcnZpY2VTdHViKFxuXHRcdFx0dmVuZG9ycy5tYXAodiA9PiAoe1xuXHRcdFx0XHR2ZW5kb3I6IHYudmVuZG9yLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogdi5kaXNwbGF5TmFtZSxcblx0XHRcdFx0Z3JvdXBzOiBbeyBuYW1lOiB2LmRpc3BsYXlOYW1lLCBtb2RlbElkZW50aWZpZXJzOiB2Lm1vZGVsSWRlbnRpZmllcnMgfV0sXG5cdFx0XHR9KSksXG5cdFx0KTtcblx0fVxuXG5cdHRlc3QoJ3JlZ3Jlc3Npb246IHRoaXJkLXBhcnR5IG1vZGVsIHdpdGggaXNVc2VyU2VsZWN0YWJsZSBvbWl0dGVkIGlzIHNob3duIGluIHRoZSBwaWNrZXInLCAoKSA9PiB7XG5cdFx0Ly8gT3JpZ2luYWwgYnVnOiBhIGBsYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyYCBtb2RlbCB0aGF0IG9taXRzXG5cdFx0Ly8gYGlzVXNlclNlbGVjdGFibGVgIHdhcyB0cmVhdGVkIGFzIGZhbHN5IGFuZCBkcm9wcGVkIGZyb20gdGhlIHBpY2tlclxuXHRcdC8vIGV2ZW4gdGhvdWdoIHRoZSBtb2RlbCBjb25maWd1cmF0aW9uIHZpZXcga2VwdCBzaG93aW5nIGl0LlxuXHRcdGNvbnN0IHRwID0gY3JlYXRlVGhpcmRQYXJ0eU1vZGVsKCd0cCcsICdUUCcsIHsgaXNVc2VyU2VsZWN0YWJsZTogdW5kZWZpbmVkIH0pO1xuXHRcdGNvbnN0IGxtU2VydmljZSA9IGJ1aWxkTG1TZXJ2aWNlKFtcblx0XHRcdHsgdmVuZG9yOiAnbXktdmVuZG9yJywgZGlzcGxheU5hbWU6ICdNeSBWZW5kb3InLCBtb2RlbElkZW50aWZpZXJzOiBbdHAuaWRlbnRpZmllcl0gfSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGxhYmVscyA9IHJ1blBpY2tlclBpcGVsaW5lKFt0cF0sIGxtU2VydmljZSkubWFwKGkgPT4gaS5sYWJlbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGxhYmVscyxcblx0XHRcdFsnVFAnXSxcblx0XHRcdCdBIHRoaXJkLXBhcnR5IGBsYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyYCBtb2RlbCB0aGF0IG9taXRzIGlzVXNlclNlbGVjdGFibGUgbXVzdCBzdGlsbCBhcHBlYXIgaW4gdGhlIHBpY2tlci4nLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ3Jlc3Npb246IHRoaXJkLXBhcnR5IG1vZGVsIHdpdGggaXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSBpcyBzaG93biBpbiB0aGUgcGlja2VyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRwID0gY3JlYXRlVGhpcmRQYXJ0eU1vZGVsKCd0cCcsICdUUCcsIHsgaXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSB9KTtcblx0XHRjb25zdCBsbVNlcnZpY2UgPSBidWlsZExtU2VydmljZShbXG5cdFx0XHR7IHZlbmRvcjogJ215LXZlbmRvcicsIGRpc3BsYXlOYW1lOiAnTXkgVmVuZG9yJywgbW9kZWxJZGVudGlmaWVyczogW3RwLmlkZW50aWZpZXJdIH0sXG5cdFx0XSk7XG5cblx0XHRjb25zdCBsYWJlbHMgPSBydW5QaWNrZXJQaXBlbGluZShbdHBdLCBsbVNlcnZpY2UpLm1hcChpID0+IGkubGFiZWwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFiZWxzLCBbJ1RQJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWdyZXNzaW9uOiB0aGlyZC1wYXJ0eSBtb2RlbCB3aXRoIGlzVXNlclNlbGVjdGFibGU6IGZhbHNlIGlzIGhpZGRlbiBmcm9tIHRoZSBwaWNrZXInLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIGRlZmF1bHQtdG8tdHJ1ZSBydWxlOiBvbmx5IGFuIGV4cGxpY2l0IGBmYWxzZWAgaGlkZXMgYSBtb2RlbC5cblx0XHQvLyBUaGlzIGFwcGxpZXMgdW5pZm9ybWx5IHRvIGNvcGlsb3QgYW5kIHRoaXJkLXBhcnR5IHZlbmRvcnMuXG5cdFx0Y29uc3QgdHAgPSBjcmVhdGVUaGlyZFBhcnR5TW9kZWwoJ3RwJywgJ1RQJywgeyBpc1VzZXJTZWxlY3RhYmxlOiBmYWxzZSB9KTtcblx0XHRjb25zdCBsbVNlcnZpY2UgPSBidWlsZExtU2VydmljZShbXG5cdFx0XHR7IHZlbmRvcjogJ215LXZlbmRvcicsIGRpc3BsYXlOYW1lOiAnTXkgVmVuZG9yJywgbW9kZWxJZGVudGlmaWVyczogW3RwLmlkZW50aWZpZXJdIH0sXG5cdFx0XSk7XG5cblx0XHRjb25zdCBsYWJlbHMgPSBydW5QaWNrZXJQaXBlbGluZShbdHBdLCBsbVNlcnZpY2UpLm1hcChpID0+IGkubGFiZWwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRsYWJlbHMsXG5cdFx0XHRbXSxcblx0XHRcdCdBbiBleHBsaWNpdCBgaXNVc2VyU2VsZWN0YWJsZTogZmFsc2VgIG11c3QgaGlkZSB0aGUgbW9kZWwgcmVnYXJkbGVzcyBvZiB2ZW5kb3IuJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWdyZXNzaW9uOiBjb3BpbG90IGludGVybmFsIG1vZGVsIChpc1VzZXJTZWxlY3RhYmxlOiBmYWxzZSkgaXMgaGlkZGVuIGZyb20gdGhlIHBpY2tlcicsICgpID0+IHtcblx0XHRjb25zdCBpbnRlcm5hbCA9IGNyZWF0ZUNvcGlsb3RNb2RlbCgnaW50ZXJuYWwnLCAnSW50ZXJuYWwnLCB7IGlzVXNlclNlbGVjdGFibGU6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IGxtU2VydmljZSA9IGJ1aWxkTG1TZXJ2aWNlKFtcblx0XHRcdHsgdmVuZG9yOiAnY29waWxvdCcsIGRpc3BsYXlOYW1lOiAnR2l0SHViIENvcGlsb3QnLCBtb2RlbElkZW50aWZpZXJzOiBbaW50ZXJuYWwuaWRlbnRpZmllcl0gfSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGxhYmVscyA9IHJ1blBpY2tlclBpcGVsaW5lKFtpbnRlcm5hbF0sIGxtU2VydmljZSkubWFwKGkgPT4gaS5sYWJlbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGxhYmVscyxcblx0XHRcdFtdLFxuXHRcdFx0J0ludGVybmFsIGNvcGlsb3QgbW9kZWxzIG1hcmtlZCBpc1VzZXJTZWxlY3RhYmxlOiBmYWxzZSBtdXN0IHJlbWFpbiBoaWRkZW4gZnJvbSB0aGUgcGlja2VyLicsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVncmVzc2lvbjogY29waWxvdCBtb2RlbCB3aXRoIG9taXR0ZWQgaXNVc2VyU2VsZWN0YWJsZSBkZWZhdWx0cyB0byB2aXNpYmxlJywgKCkgPT4ge1xuXHRcdC8vIGBpc1VzZXJTZWxlY3RhYmxlYCBkZWZhdWx0cyB0byBgdHJ1ZWAgZm9yIGV2ZXJ5IHZlbmRvciwgc28gYSBjb3BpbG90XG5cdFx0Ly8gbW9kZWwgdGhhdCBvbWl0cyB0aGUgZmxhZyBpcyBub3cgdHJlYXRlZCBhcyB1c2VyLXNlbGVjdGFibGUuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVDb3BpbG90TW9kZWwoJ3B1YmxpYycsICdQdWJsaWMnLCB7IGlzVXNlclNlbGVjdGFibGU6IHVuZGVmaW5lZCB9KTtcblx0XHRjb25zdCBsbVNlcnZpY2UgPSBidWlsZExtU2VydmljZShbXG5cdFx0XHR7IHZlbmRvcjogJ2NvcGlsb3QnLCBkaXNwbGF5TmFtZTogJ0dpdEh1YiBDb3BpbG90JywgbW9kZWxJZGVudGlmaWVyczogW21vZGVsLmlkZW50aWZpZXJdIH0sXG5cdFx0XSk7XG5cblx0XHRjb25zdCBsYWJlbHMgPSBydW5QaWNrZXJQaXBlbGluZShbbW9kZWxdLCBsbVNlcnZpY2UpLm1hcChpID0+IGkubGFiZWwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFiZWxzLCBbJ1B1YmxpYyddKTtcblx0fSk7XG5cblx0dGVzdCgncmVncmVzc2lvbjogY29waWxvdCBwdWJsaWMgbW9kZWwgKGlzVXNlclNlbGVjdGFibGU6IHRydWUpIGlzIHNob3duIGluIHRoZSBwaWNrZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHViID0gY3JlYXRlQ29waWxvdE1vZGVsKCdncHQtNG8nLCAnR1BULTRvJywgeyBpc1VzZXJTZWxlY3RhYmxlOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGxtU2VydmljZSA9IGJ1aWxkTG1TZXJ2aWNlKFtcblx0XHRcdHsgdmVuZG9yOiAnY29waWxvdCcsIGRpc3BsYXlOYW1lOiAnR2l0SHViIENvcGlsb3QnLCBtb2RlbElkZW50aWZpZXJzOiBbcHViLmlkZW50aWZpZXJdIH0sXG5cdFx0XSk7XG5cblx0XHRjb25zdCBsYWJlbHMgPSBydW5QaWNrZXJQaXBlbGluZShbcHViXSwgbG1TZXJ2aWNlKS5tYXAoaSA9PiBpLmxhYmVsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhYmVscywgWydHUFQtNG8nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ3Jlc3Npb246IG1peGVkIHZlbmRvcnMgLSBvbmx5IGV4cGxpY2l0IGlzVXNlclNlbGVjdGFibGU6IGZhbHNlIG1vZGVscyBhcmUgaGlkZGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RQdWJsaWMgPSBjcmVhdGVDb3BpbG90TW9kZWwoJ2dwdC00bycsICdHUFQtNG8nLCB7IGlzVXNlclNlbGVjdGFibGU6IHRydWUgfSk7XG5cdFx0Y29uc3QgY29waWxvdEludGVybmFsID0gY3JlYXRlQ29waWxvdE1vZGVsKCdpbnRlcm5hbCcsICdJbnRlcm5hbCcsIHsgaXNVc2VyU2VsZWN0YWJsZTogZmFsc2UgfSk7XG5cdFx0Y29uc3QgdHBUcnVlID0gY3JlYXRlVGhpcmRQYXJ0eU1vZGVsKCd0cC10cnVlJywgJ1RQIFRydWUnLCB7IGlzVXNlclNlbGVjdGFibGU6IHRydWUgfSk7XG5cdFx0Y29uc3QgdHBGYWxzZSA9IGNyZWF0ZVRoaXJkUGFydHlNb2RlbCgndHAtZmFsc2UnLCAnVFAgRmFsc2UnLCB7IGlzVXNlclNlbGVjdGFibGU6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IHRwVW5kZWZpbmVkID0gY3JlYXRlVGhpcmRQYXJ0eU1vZGVsKCd0cC11bmRlZicsICdUUCBVbmRlZicsIHsgaXNVc2VyU2VsZWN0YWJsZTogdW5kZWZpbmVkIH0pO1xuXG5cdFx0Y29uc3QgbG1TZXJ2aWNlID0gYnVpbGRMbVNlcnZpY2UoW1xuXHRcdFx0e1xuXHRcdFx0XHR2ZW5kb3I6ICdjb3BpbG90Jyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdHaXRIdWIgQ29waWxvdCcsXG5cdFx0XHRcdG1vZGVsSWRlbnRpZmllcnM6IFtjb3BpbG90UHVibGljLmlkZW50aWZpZXIsIGNvcGlsb3RJbnRlcm5hbC5pZGVudGlmaWVyXSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHZlbmRvcjogJ215LXZlbmRvcicsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnTXkgVmVuZG9yJyxcblx0XHRcdFx0bW9kZWxJZGVudGlmaWVyczogW3RwVHJ1ZS5pZGVudGlmaWVyLCB0cEZhbHNlLmlkZW50aWZpZXIsIHRwVW5kZWZpbmVkLmlkZW50aWZpZXJdLFxuXHRcdFx0fSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGxhYmVscyA9IHJ1blBpY2tlclBpcGVsaW5lKFxuXHRcdFx0W2NvcGlsb3RQdWJsaWMsIGNvcGlsb3RJbnRlcm5hbCwgdHBUcnVlLCB0cEZhbHNlLCB0cFVuZGVmaW5lZF0sXG5cdFx0XHRsbVNlcnZpY2UsXG5cdFx0KS5tYXAoaSA9PiBpLmxhYmVsKS5zb3J0KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0bGFiZWxzLFxuXHRcdFx0WydHUFQtNG8nLCAnVFAgVHJ1ZScsICdUUCBVbmRlZiddLFxuXHRcdFx0J1BpY2tlciBtdXN0IHNob3cgZXZlcnkgbW9kZWwgZXhjZXB0IHRob3NlIHdpdGggYW4gZXhwbGljaXQgaXNVc2VyU2VsZWN0YWJsZTogZmFsc2UuJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWdyZXNzaW9uOiB0aGlyZC1wYXJ0eSBtb2RlbHMgd2l0aG91dCBleHBsaWNpdCBvcHQtb3V0IG1hdGNoIHRoZSBjb25maWd1cmF0aW9uIHZpZXcnLCAoKSA9PiB7XG5cdFx0Ly8gV2hhdCB0aGUgbW9kZWwgY29uZmlndXJhdGlvbiB2aWV3IHNob3dzOiBldmVyeSBtb2RlbCBmcm9tXG5cdFx0Ly8gYGdldExhbmd1YWdlTW9kZWxHcm91cHNgLCByZWdhcmRsZXNzIG9mIGBpc1VzZXJTZWxlY3RhYmxlYC5cblx0XHQvLyBXaGF0IHRoZSBwaWNrZXIgc2hvd3M6IHRoZSBzYW1lIHNldCwgbWludXMgbW9kZWxzIHRoYXQgdGhlXG5cdFx0Ly8gZXh0ZW5zaW9uIGV4cGxpY2l0bHkgb3B0ZWQgb3V0IHZpYSBgaXNVc2VyU2VsZWN0YWJsZTogZmFsc2VgLlxuXHRcdGNvbnN0IHRwVHJ1ZSA9IGNyZWF0ZVRoaXJkUGFydHlNb2RlbCgndHAtdHJ1ZScsICdUUCBUcnVlJywgeyBpc1VzZXJTZWxlY3RhYmxlOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHRwVW5kZWZpbmVkID0gY3JlYXRlVGhpcmRQYXJ0eU1vZGVsKCd0cC11bmRlZicsICdUUCBVbmRlZicsIHsgaXNVc2VyU2VsZWN0YWJsZTogdW5kZWZpbmVkIH0pO1xuXHRcdGNvbnN0IGFsbFRoaXJkUGFydHkgPSBbdHBUcnVlLCB0cFVuZGVmaW5lZF07XG5cblx0XHRjb25zdCBsbVNlcnZpY2UgPSBidWlsZExtU2VydmljZShbXG5cdFx0XHR7XG5cdFx0XHRcdHZlbmRvcjogJ215LXZlbmRvcicsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnTXkgVmVuZG9yJyxcblx0XHRcdFx0bW9kZWxJZGVudGlmaWVyczogYWxsVGhpcmRQYXJ0eS5tYXAobSA9PiBtLmlkZW50aWZpZXIpLFxuXHRcdFx0fSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25WaWV3ID0gbG1TZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxHcm91cHMoJ215LXZlbmRvcicpXG5cdFx0XHQuZmxhdE1hcChnID0+IGcubW9kZWxJZGVudGlmaWVycylcblx0XHRcdC5zb3J0KCk7XG5cdFx0Y29uc3QgcGlja2VyID0gcnVuUGlja2VyUGlwZWxpbmUoYWxsVGhpcmRQYXJ0eSwgbG1TZXJ2aWNlKVxuXHRcdFx0Lm1hcChpID0+IGFsbFRoaXJkUGFydHkuZmluZChtID0+IG0ubWV0YWRhdGEubmFtZSA9PT0gaS5sYWJlbCkhLmlkZW50aWZpZXIpXG5cdFx0XHQuc29ydCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBpY2tlcixcblx0XHRcdGNvbmZpZ3VyYXRpb25WaWV3LFxuXHRcdFx0J1doZW4gbm8gdGhpcmQtcGFydHkgbW9kZWwgb3B0cyBvdXQsIHRoZSBwaWNrZXIgbXVzdCBzaG93IGV4YWN0bHkgdGhlIHNhbWUgbW9kZWxzIGFzIHRoZSBjb25maWd1cmF0aW9uIHZpZXcuJyxcblx0XHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZUFBZTtBQUV4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEyQztBQUVwRCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHVCQUF1QixnQ0FBZ0MscUNBQXFDLG1DQUFtQztBQUN4SSxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG1CQUFtQixvQkFBb0I7QUFFaEQsU0FBUyx1QkFBZ0Q7QUFFekQsU0FBUyw2QkFBNkIsTUFBOEc7QUFDbkosU0FBTztBQUFBLElBQ04sYUFBYSxNQUFNLGVBQWUsZ0JBQWdCO0FBQUEsSUFDbEQsV0FBVyxFQUFFLFdBQVcsS0FBSztBQUFBLElBQzdCLFlBQVksTUFBTSxjQUFjO0FBQUEsSUFDaEMsV0FBVyxNQUFNLGFBQWE7QUFBQSxFQUMvQjtBQUNEO0FBRUEsTUFBTSw2QkFBNkIsNkJBQTZCO0FBRWhFLFNBQVMsWUFBWSxJQUFZLE1BQWMsU0FBUyxXQUFvRDtBQUMzRyxTQUFPO0FBQUEsSUFDTixZQUFZLEdBQUcsTUFBTSxJQUFJLEVBQUU7QUFBQSxJQUMzQixVQUFVO0FBQUEsTUFDVDtB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
