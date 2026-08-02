import assert from "assert";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { ChatAgentLocation, ChatModeKind } from "../../../../common/constants.js";
import { ILanguageModelChatMetadata } from "../../../../common/languageModels.js";
import { LocalChatSessionUri } from "../../../../common/model/chatUri.js";
import {
  filterModelsForSession,
  findBestMatchingModel,
  findDefaultModel,
  getAgentHostByokManageModelsIdentifier,
  hasModelsTargetingSession,
  isModelHiddenInPicker,
  isModelSupportedForInlineChat,
  isModelSupportedForMode,
  isModelValidForSession,
  isNewConversation,
  mergeModelsWithCache,
  resolveModelFromSyncState,
  shouldDropAgnosticDraftModel,
  shouldResetModelToDefault,
  shouldResetOnModelListChange,
  shouldRestorePerTypeModelOnSessionSwitch
} from "../../../../browser/widget/input/chatInputModelUtils.js";
function computeAvailableModels(liveModels, cachedModels, contributedVendors, sessionType, currentModeKind, location, resolvedVendors) {
  const merged = mergeModelsWithCache(liveModels, cachedModels, contributedVendors, resolvedVendors);
  merged.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  return filterModelsForSession(merged, sessionType, currentModeKind, location);
}
function createModel(id, name, overrides) {
  return {
    identifier: `copilot/${id}`,
    metadata: {
      extension: new ExtensionIdentifier("test.ext"),
      id,
      name,
      vendor: "copilot",
      version: "1.0",
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
function createDefaultModelForLocation(id, name, location, overrides) {
  return createModel(id, name, {
    isDefaultForLocation: { [location]: true },
    ...overrides
  });
}
function createSessionModel(id, name, sessionType, overrides) {
  return createModel(id, name, {
    targetChatSessionType: sessionType,
    ...overrides
  });
}
function createVendorModel(vendor, id, name, overrides) {
  const model = createModel(id, name, { vendor, family: vendor, isBYOK: true, ...overrides });
  return { identifier: `${vendor}/${id}`, metadata: model.metadata };
}
suite("ChatInputModelUtils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("isModelSupportedForMode", () => {
    test("any model is supported in Ask mode", () => {
      const model = createModel("basic", "Basic", { capabilities: void 0 });
      assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Ask), true);
    });
    test("any model is supported in Edit mode", () => {
      const model = createModel("basic", "Basic", { capabilities: void 0 });
      assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Edit), true);
    });
    test("model with tool calling and agent mode is supported in Agent mode", () => {
      const model = createModel("agent-capable", "Agent-Capable", {
        capabilities: { toolCalling: true, agentMode: true }
      });
      assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Agent), true);
    });
    test("model with tool calling but agentMode=undefined is supported in Agent mode", () => {
      const model = createModel("tool-only", "Tool-Only", {
        capabilities: { toolCalling: true }
      });
      assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Agent), true);
    });
    test("model without tool calling is NOT supported in Agent mode", () => {
      const model = createModel("no-tools", "No-Tools", {
        capabilities: { toolCalling: false }
      });
      assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Agent), false);
    });
    test("model with agentMode=false is NOT supported in Agent mode", () => {
      const model = createModel("no-agent", "No-Agent", {
        capabilities: { toolCalling: true, agentMode: false }
      });
      assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Agent), false);
    });
    test("model with no capabilities is NOT supported in Agent mode", () => {
      const model = createModel("no-caps", "No-Caps", { capabilities: void 0 });
      assert.strictEqual(isModelSupportedForMode(model, ChatModeKind.Agent), false);
    });
  });
  suite("isModelSupportedForInlineChat", () => {
    test("any model is supported when not in EditorInline location", () => {
      const model = createModel("basic", "Basic", { capabilities: void 0 });
      assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.Chat), true);
      assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.Terminal), true);
      assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.Notebook), true);
    });
    test("model with tool calling is supported in EditorInline", () => {
      const model = createModel("tools", "Tools", {
        capabilities: { toolCalling: true }
      });
      assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.EditorInline), true);
    });
    test("model without tool calling is NOT supported in EditorInline", () => {
      const model = createModel("no-tools", "No-Tools", {
        capabilities: { toolCalling: false }
      });
      assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.EditorInline), false);
    });
    test("model with no capabilities is NOT supported in EditorInline", () => {
      const model = createModel("no-caps", "No-Caps", { capabilities: void 0 });
      assert.strictEqual(isModelSupportedForInlineChat(model, ChatAgentLocation.EditorInline), false);
    });
  });
  suite("filterModelsForSession", () => {
    const gpt4o = createModel("gpt-4o", "GPT-4o");
    const claude = createModel("claude", "Claude");
    const notSelectable = createModel("hidden", "Hidden", { isUserSelectable: false });
    const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
    const noToolsModel = createModel("no-tools", "No-Tools", {
      capabilities: { toolCalling: false, agentMode: false }
    });
    test("returns user-selectable general models when no session type set", () => {
      const result = filterModelsForSession(
        [gpt4o, claude, notSelectable],
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt-4o", "claude"]);
    });
    test("returns user-selectable general models for local session type", () => {
      const result = filterModelsForSession(
        [gpt4o, claude, notSelectable],
        "local",
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt-4o", "claude"]);
    });
    test("excludes models targeting a specific session type when in general session", () => {
      const result = filterModelsForSession(
        [gpt4o, claude, cloudModel],
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt-4o", "claude"]);
    });
    test("returns only session-targeted models for a specific session type", () => {
      const result = filterModelsForSession(
        [gpt4o, claude, cloudModel],
        "cloud",
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["cloud-gpt"]);
    });
    test("filters out models incompatible with Agent mode in general session", () => {
      const result = filterModelsForSession(
        [gpt4o, noToolsModel],
        void 0,
        ChatModeKind.Agent,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt-4o"]);
    });
    test.skip("filters by mode for session-targeted models", () => {
      const cloudNoTools = createSessionModel("cloud-basic", "Cloud Basic", "cloud", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      const result = filterModelsForSession(
        [gpt4o, cloudModel, cloudNoTools],
        "cloud",
        ChatModeKind.Agent,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["cloud-gpt"]);
    });
    test("excludes non-selectable models from session-targeted results", () => {
      const cloudHidden = createSessionModel("cloud-hidden", "Cloud Hidden", "cloud", {
        isUserSelectable: false
      });
      const result = filterModelsForSession(
        [cloudModel, cloudHidden],
        "cloud",
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["cloud-gpt"]);
    });
    test("falls back to general models when no models target the session type", () => {
      const result = filterModelsForSession(
        [gpt4o, claude],
        "cloud",
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt-4o", "claude"]);
    });
    test("filters inline chat incompatible models in EditorInline", () => {
      const noToolsSelectable = createModel("no-tools-selectable", "No-Tools-Selectable", {
        capabilities: { toolCalling: false }
      });
      const result = filterModelsForSession(
        [gpt4o, noToolsSelectable],
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.EditorInline
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt-4o"]);
    });
  });
  suite("hasModelsTargetingSession", () => {
    test("returns false when session type is undefined", () => {
      const models = [createModel("gpt", "GPT")];
      assert.strictEqual(hasModelsTargetingSession(models, void 0), false);
    });
    test("returns false when no models target the session type", () => {
      const models = [createModel("gpt", "GPT")];
      assert.strictEqual(hasModelsTargetingSession(models, "cloud"), false);
    });
    test("returns true when a model targets the session type", () => {
      const models = [
        createModel("gpt", "GPT"),
        createSessionModel("cloud-gpt", "Cloud GPT", "cloud")
      ];
      assert.strictEqual(hasModelsTargetingSession(models, "cloud"), true);
    });
    test("returns false for different session type", () => {
      const models = [createSessionModel("cloud-gpt", "Cloud GPT", "cloud")];
      assert.strictEqual(hasModelsTargetingSession(models, "enterprise"), false);
    });
  });
  suite("isModelValidForSession", () => {
    test("general model is valid when no models target the session", () => {
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel];
      assert.strictEqual(isModelValidForSession(generalModel, allModels, "cloud"), true);
    });
    test("session-targeted model is NOT valid when no models target the session type in pool", () => {
      const sessionModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      assert.strictEqual(isModelValidForSession(sessionModel, [generalModel], void 0), false);
    });
    test("session-targeted model IS valid when pool has models targeting that session", () => {
      const sessionModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const allModels = [createModel("gpt", "GPT"), sessionModel];
      assert.strictEqual(isModelValidForSession(sessionModel, allModels, "cloud"), true);
    });
    test("general model is NOT valid when pool has models targeting the session", () => {
      const generalModel = createModel("gpt", "GPT");
      const sessionModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const allModels = [generalModel, sessionModel];
      assert.strictEqual(isModelValidForSession(generalModel, allModels, "cloud"), false);
    });
    test("model targeting wrong session is NOT valid", () => {
      const wrongSessionModel = createSessionModel("ent-gpt", "Enterprise GPT", "enterprise");
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const allModels = [wrongSessionModel, cloudModel];
      assert.strictEqual(isModelValidForSession(wrongSessionModel, allModels, "cloud"), false);
    });
    test("general model is valid when session type is undefined", () => {
      const generalModel = createModel("gpt", "GPT");
      assert.strictEqual(isModelValidForSession(generalModel, [generalModel], void 0), true);
    });
  });
  suite("findBestMatchingModel", () => {
    test("returns undefined when previous is undefined", () => {
      const pool = [createSessionModel("claude-sonnet-4.6", "Claude Sonnet 4.6", "agent-host-copilotcli")];
      assert.strictEqual(findBestMatchingModel(void 0, pool), void 0);
    });
    test("returns undefined for empty pool", () => {
      const prev = createModel("claude-sonnet-4.6", "Claude Sonnet 4.6");
      assert.strictEqual(findBestMatchingModel(prev, []), void 0);
    });
    test("matches across vendors by raw model id (the issue #319583 case)", () => {
      const prev = createModel("claude-sonnet-4.6", "Claude Sonnet 4.6", { vendor: "copilotcli", family: "claude-sonnet-4.6" });
      const target = createSessionModel("claude-sonnet-4.6", "Claude Sonnet 4.6", "agent-host-copilotcli", { family: "claude-sonnet-4.6" });
      const other = createSessionModel("gpt-5", "GPT-5", "agent-host-copilotcli", { family: "gpt-5" });
      assert.strictEqual(findBestMatchingModel(prev, [other, target])?.identifier, target.identifier);
    });
    test("matches by id even when family differs", () => {
      const prev = createModel("claude-sonnet-4.6", "Claude Sonnet 4.6", { family: "claude" });
      const target = createSessionModel("claude-sonnet-4.6", "Other Name", "agent-host-copilotcli", { family: "other" });
      assert.strictEqual(findBestMatchingModel(prev, [target])?.identifier, target.identifier);
    });
    test("prefers id over family when both could match different pool entries", () => {
      const prev = createModel("claude-sonnet-4.6", "Claude Sonnet 4.6", { family: "claude" });
      const familyMatch = createSessionModel("claude-opus-4.7", "Claude Opus 4.7", "agent-host-copilotcli", { family: "claude" });
      const idMatch = createSessionModel("claude-sonnet-4.6", "Claude Sonnet 4.6", "agent-host-copilotcli", { family: "claude-sonnet" });
      assert.strictEqual(findBestMatchingModel(prev, [familyMatch, idMatch])?.identifier, idMatch.identifier);
    });
    test("falls back to name when neither id nor family match", () => {
      const prev = createModel("a", "Claude Sonnet 4.6", { family: "fa" });
      const target = createSessionModel("b", "Claude Sonnet 4.6", "agent-host-copilotcli", { family: "fb" });
      assert.strictEqual(findBestMatchingModel(prev, [target])?.identifier, target.identifier);
    });
    test("returns undefined when nothing matches", () => {
      const prev = createModel("gpt-5", "GPT-5", { family: "gpt-5" });
      const pool = [createSessionModel("claude", "Claude", "agent-host-copilotcli", { family: "claude" })];
      assert.strictEqual(findBestMatchingModel(prev, pool), void 0);
    });
    test("match is case-insensitive", () => {
      const prev = createModel("Claude-Sonnet-4.6", "CLAUDE SONNET 4.6", { family: "CLAUDE-SONNET-4.6" });
      const target = createSessionModel("claude-sonnet-4.6", "claude sonnet 4.6", "agent-host-copilotcli", { family: "claude-sonnet-4.6" });
      assert.strictEqual(findBestMatchingModel(prev, [target])?.identifier, target.identifier);
    });
  });
  suite("findDefaultModel", () => {
    test("returns model marked as default for location", () => {
      const regular = createModel("gpt", "GPT");
      const defaultModel = createDefaultModelForLocation("claude", "Claude", ChatAgentLocation.Chat);
      const result = findDefaultModel([regular, defaultModel], ChatAgentLocation.Chat);
      assert.strictEqual(result?.metadata.id, "claude");
    });
    test("falls back to first model when no default for location", () => {
      const modelA = createModel("gpt", "GPT");
      const modelB = createModel("claude", "Claude");
      const result = findDefaultModel([modelA, modelB], ChatAgentLocation.Chat);
      assert.strictEqual(result?.metadata.id, "gpt");
    });
    test("returns undefined for empty models array", () => {
      const result = findDefaultModel([], ChatAgentLocation.Chat);
      assert.strictEqual(result, void 0);
    });
    test("returns location-specific default when multiple defaults exist", () => {
      const chatDefault = createDefaultModelForLocation("chat-default", "Chat Default", ChatAgentLocation.Chat);
      const terminalDefault = createDefaultModelForLocation("terminal-default", "Terminal Default", ChatAgentLocation.Terminal);
      const result = findDefaultModel([chatDefault, terminalDefault], ChatAgentLocation.Chat);
      assert.strictEqual(result?.metadata.id, "chat-default");
    });
    test("does not pick terminal default when looking for chat default", () => {
      const terminalDefault = createDefaultModelForLocation("terminal-default", "Terminal Default", ChatAgentLocation.Terminal);
      const regular = createModel("gpt", "GPT");
      const result = findDefaultModel([terminalDefault, regular], ChatAgentLocation.Chat);
      assert.strictEqual(result?.metadata.id, "terminal-default");
    });
  });
  suite("shouldResetModelToDefault", () => {
    const defaultContext = {
      location: ChatAgentLocation.Chat,
      currentModeKind: ChatModeKind.Ask,
      sessionType: void 0
    };
    test("should reset when current model is undefined", () => {
      assert.strictEqual(shouldResetModelToDefault(void 0, [], defaultContext, []), true);
    });
    test("should reset when model is no longer available", () => {
      const model = createModel("gpt", "GPT");
      assert.strictEqual(shouldResetModelToDefault(model, [], defaultContext, [model]), true);
    });
    test("should NOT reset when model is available and compatible", () => {
      const model = createModel("gpt", "GPT");
      assert.strictEqual(shouldResetModelToDefault(model, [model], defaultContext, [model]), false);
    });
    test("should reset when model is not supported for current mode", () => {
      const model = createModel("no-tools", "No-Tools", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      const context = { ...defaultContext, currentModeKind: ChatModeKind.Agent };
      assert.strictEqual(shouldResetModelToDefault(model, [model], context, [model]), true);
    });
    test("should reset when model is not supported for inline chat", () => {
      const model = createModel("no-tools", "No-Tools", {
        capabilities: { toolCalling: false }
      });
      const context = {
        ...defaultContext,
        location: ChatAgentLocation.EditorInline
      };
      assert.strictEqual(shouldResetModelToDefault(model, [model], context, [model]), true);
    });
    test("should reset when model is not valid for session", () => {
      const generalModel = createModel("gpt", "GPT");
      const sessionModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const allModels = [generalModel, sessionModel];
      const context = { ...defaultContext, sessionType: "cloud" };
      assert.strictEqual(shouldResetModelToDefault(generalModel, [generalModel], context, allModels), true);
    });
    test("should NOT reset session model in matching session", () => {
      const sessionModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const context = { ...defaultContext, sessionType: "cloud" };
      assert.strictEqual(shouldResetModelToDefault(sessionModel, [sessionModel], context, [sessionModel]), false);
    });
  });
  suite("resolveModelFromSyncState", () => {
    test("keeps current model when same as state model", () => {
      const model = createModel("gpt", "GPT");
      const result = resolveModelFromSyncState(model, model, [model], void 0);
      assert.strictEqual(result.action, "keep");
    });
    test("applies state model when different and valid", () => {
      const current = createModel("gpt", "GPT");
      const stateModel = createModel("claude", "Claude");
      const result = resolveModelFromSyncState(stateModel, current, [current, stateModel], void 0);
      assert.strictEqual(result.action, "apply");
    });
    test("uses default when state model not valid for session", () => {
      const current = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const stateModel = createModel("gpt", "GPT");
      const allModels = [current, stateModel];
      const result = resolveModelFromSyncState(stateModel, current, allModels, "cloud");
      assert.strictEqual(result.action, "default");
    });
    test("applies when current model is undefined", () => {
      const stateModel = createModel("gpt", "GPT");
      const result = resolveModelFromSyncState(stateModel, void 0, [stateModel], void 0);
      assert.strictEqual(result.action, "apply");
    });
    test("applies session model when valid for matching session", () => {
      const sessionModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, sessionModel];
      const result = resolveModelFromSyncState(sessionModel, generalModel, allModels, "cloud");
      assert.strictEqual(result.action, "apply");
    });
    test("returns default when state model does not support current mode", () => {
      const current = createModel("gpt", "GPT");
      const stateModel = createModel("no-tools", "No-Tools", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      const result = resolveModelFromSyncState(stateModel, current, [current, stateModel], void 0, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Agent,
        sessionType: void 0
      });
      assert.strictEqual(result.action, "default");
    });
    test("returns default when state model does not support inline chat", () => {
      const current = createModel("gpt", "GPT");
      const stateModel = createModel("no-tools", "No-Tools", {
        capabilities: { toolCalling: false }
      });
      const result = resolveModelFromSyncState(stateModel, current, [current, stateModel], void 0, {
        location: ChatAgentLocation.EditorInline,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      });
      assert.strictEqual(result.action, "default");
    });
    test("applies when state model supports current mode with context", () => {
      const current = createModel("gpt", "GPT");
      const stateModel = createModel("agent-model", "Agent Model", {
        capabilities: { toolCalling: true, agentMode: true }
      });
      const result = resolveModelFromSyncState(stateModel, current, [current, stateModel], void 0, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Agent,
        sessionType: void 0
      });
      assert.strictEqual(result.action, "apply");
    });
    test("returns default when current and state share an identifier but neither belongs to the new session pool", () => {
      const generalModel = createModel("claude", "Claude");
      const sessionModel = createSessionModel("claude", "Claude", "agent-host-copilotcli");
      const allModels = [generalModel, sessionModel];
      const result = resolveModelFromSyncState(generalModel, generalModel, allModels, "agent-host-copilotcli");
      assert.strictEqual(result.action, "default");
    });
  });
  suite("mergeModelsWithCache", () => {
    test("uses live models when available", () => {
      const liveModel = createModel("gpt", "GPT");
      const cachedModel = createModel("cached-gpt", "Cached GPT");
      const result = mergeModelsWithCache([liveModel], [cachedModel], /* @__PURE__ */ new Set(["copilot"]));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].metadata.id, "gpt");
    });
    test("falls back to cached models when no live models", () => {
      const cachedModel = createModel("cached-gpt", "Cached GPT");
      const result = mergeModelsWithCache([], [cachedModel], /* @__PURE__ */ new Set(["copilot"]));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].metadata.id, "cached-gpt");
    });
    test("merges cached models from vendors not yet resolved", () => {
      const liveModel = createModel("gpt", "GPT");
      const cachedOtherVendor = createModel("other-model", "Other Model", { vendor: "other-vendor" });
      const result = mergeModelsWithCache(
        [liveModel],
        [cachedOtherVendor],
        /* @__PURE__ */ new Set(["copilot", "other-vendor"])
      );
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result.map((m) => m.metadata.id).sort(), ["gpt", "other-model"]);
    });
    test("evicts cached models from vendors no longer contributed", () => {
      const liveModel = createModel("gpt", "GPT");
      const cachedRemovedVendor = createModel("removed-model", "Removed Model", { vendor: "removed-vendor" });
      const result = mergeModelsWithCache(
        [liveModel],
        [cachedRemovedVendor],
        /* @__PURE__ */ new Set(["copilot"])
        // removed-vendor is NOT contributed
      );
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].metadata.id, "gpt");
    });
    test("does not duplicate models from same vendor", () => {
      const liveModel = createModel("gpt", "GPT");
      const cachedSameVendor = createModel("cached-gpt", "Cached GPT");
      const result = mergeModelsWithCache(
        [liveModel],
        [cachedSameVendor],
        /* @__PURE__ */ new Set(["copilot"])
      );
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].metadata.id, "gpt");
    });
    test("handles empty cache and empty live models", () => {
      const result = mergeModelsWithCache([], [], /* @__PURE__ */ new Set());
      assert.deepStrictEqual(result, []);
    });
    test("handles multiple vendors with partial resolution", () => {
      const liveA = createModel("a-model", "A Model", { vendor: "vendor-a" });
      const cachedB = createModel("b-model", "B Model", { vendor: "vendor-b" });
      const cachedC = createModel("c-model", "C Model", { vendor: "vendor-c" });
      const result = mergeModelsWithCache(
        [liveA],
        [cachedB, cachedC],
        /* @__PURE__ */ new Set(["vendor-a", "vendor-b"])
        // vendor-c not contributed
      );
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result.map((m) => m.metadata.vendor).sort(), ["vendor-a", "vendor-b"]);
    });
    test("evicts cached entries for a resolved vendor that returned zero models (BYOK delete)", () => {
      const liveA = createModel("a-model", "A Model", { vendor: "vendor-a" });
      const staleB = createModel("b-model", "B Model", { vendor: "vendor-b" });
      const result = mergeModelsWithCache(
        [liveA],
        [staleB],
        /* @__PURE__ */ new Set(["vendor-a", "vendor-b"]),
        /* @__PURE__ */ new Set(["vendor-a", "vendor-b"])
      );
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].metadata.vendor, "vendor-a");
    });
    test("keeps cached entries for an unresolved vendor (extension reload race)", () => {
      const liveA = createModel("a-model", "A Model", { vendor: "vendor-a" });
      const cachedB = createModel("b-model", "B Model", { vendor: "vendor-b" });
      const result = mergeModelsWithCache(
        [liveA],
        [cachedB],
        /* @__PURE__ */ new Set(["vendor-a", "vendor-b"]),
        /* @__PURE__ */ new Set(["vendor-a"])
        // vendor-b not yet resolved
      );
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result.map((m) => m.metadata.vendor).sort(), ["vendor-a", "vendor-b"]);
    });
    test("evicts cache for a resolved vendor even when all live models are zero", () => {
      const stale = createModel("b-model", "B Model", { vendor: "vendor-b" });
      const result = mergeModelsWithCache(
        [],
        [stale],
        /* @__PURE__ */ new Set(["vendor-b"]),
        /* @__PURE__ */ new Set(["vendor-b"])
      );
      assert.strictEqual(result.length, 0);
    });
    test("preserves full cache when no vendors are contributed yet (startup race)", () => {
      const cachedA = createModel("a-model", "A Model", { vendor: "vendor-a" });
      const cachedB = createModel("b-model", "B Model", { vendor: "vendor-b" });
      const result = mergeModelsWithCache(
        [],
        [cachedA, cachedB],
        /* @__PURE__ */ new Set(),
        /* @__PURE__ */ new Set()
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id).sort(), ["a-model", "b-model"]);
    });
    test("evicts cached agent-host entries when the vendor is resolved with zero live models", () => {
      const liveCopilot = createModel("gpt", "GPT");
      const staleAgentHost = createVendorModel("agent-host-copilotcli", "gpt-5.6-sol", "GPT 5.6 Sol");
      const result = mergeModelsWithCache(
        [liveCopilot],
        [staleAgentHost],
        /* @__PURE__ */ new Set(["copilot", "agent-host-copilotcli"]),
        /* @__PURE__ */ new Set(["copilot", "agent-host-copilotcli"])
      );
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].metadata.vendor, "copilot");
    });
  });
  suite("model switching scenarios", () => {
    test("switching from Ask to Agent mode should reset model without tool support", () => {
      const noToolsModel = createModel("no-tools", "No-Tools", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      const toolModel = createModel("tool-model", "Tool Model");
      const allModels = [noToolsModel, toolModel];
      assert.strictEqual(
        shouldResetModelToDefault(noToolsModel, allModels, {
          location: ChatAgentLocation.Chat,
          currentModeKind: ChatModeKind.Ask,
          sessionType: void 0
        }, allModels),
        false
      );
      assert.strictEqual(
        shouldResetModelToDefault(noToolsModel, allModels, {
          location: ChatAgentLocation.Chat,
          currentModeKind: ChatModeKind.Agent,
          sessionType: void 0
        }, allModels),
        true
      );
    });
    test("switching sessions should reject model from wrong session pool", () => {
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, cloudModel];
      assert.strictEqual(
        isModelValidForSession(cloudModel, allModels, "cloud"),
        true
      );
      assert.strictEqual(
        isModelValidForSession(cloudModel, allModels, void 0),
        false
      );
      assert.strictEqual(
        isModelValidForSession(generalModel, allModels, "cloud"),
        false
      );
      assert.strictEqual(
        isModelValidForSession(generalModel, allModels, void 0),
        true
      );
    });
    test("model removal should trigger reset", () => {
      const gpt = createModel("gpt", "GPT");
      const claude = createModel("claude", "Claude");
      assert.strictEqual(
        shouldResetModelToDefault(gpt, [gpt, claude], {
          location: ChatAgentLocation.Chat,
          currentModeKind: ChatModeKind.Ask,
          sessionType: void 0
        }, [gpt, claude]),
        false
      );
      assert.strictEqual(
        shouldResetModelToDefault(gpt, [claude], {
          location: ChatAgentLocation.Chat,
          currentModeKind: ChatModeKind.Ask,
          sessionType: void 0
        }, [claude]),
        true
      );
    });
    test("syncing model from state respects session boundaries", () => {
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, cloudModel];
      const result = resolveModelFromSyncState(cloudModel, generalModel, allModels, void 0);
      assert.strictEqual(result.action, "default");
    });
    test("syncing model from state applies model when switching to matching session", () => {
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, cloudModel];
      const result = resolveModelFromSyncState(cloudModel, generalModel, allModels, "cloud");
      assert.strictEqual(result.action, "apply");
    });
    test("combining mode switch + session switch validates correctly", () => {
      const cloudToolModel = createSessionModel("cloud-tool", "Cloud Tool", "cloud", {
        capabilities: { toolCalling: true, agentMode: true }
      });
      const cloudNoToolModel = createSessionModel("cloud-basic", "Cloud Basic", "cloud", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      const allCloudModels = [cloudToolModel, cloudNoToolModel];
      assert.strictEqual(
        shouldResetModelToDefault(cloudToolModel, allCloudModels, {
          location: ChatAgentLocation.Chat,
          currentModeKind: ChatModeKind.Agent,
          sessionType: "cloud"
        }, allCloudModels),
        false
      );
      assert.strictEqual(
        shouldResetModelToDefault(cloudNoToolModel, allCloudModels, {
          location: ChatAgentLocation.Chat,
          currentModeKind: ChatModeKind.Agent,
          sessionType: "cloud"
        }, allCloudModels),
        true
      );
    });
  });
  suite("onDidChangeLanguageModels race conditions", () => {
    test("model temporarily removed then re-added loses user choice", () => {
      const gpt = createModel("gpt", "GPT");
      const claude = createModel("claude", "Claude");
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", [gpt, claude]), false);
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", [claude]), true);
      assert.strictEqual(shouldResetOnModelListChange("copilot/claude", [gpt, claude]), false);
    });
    test("model stays when model list refreshes with it still present", () => {
      const gpt = createModel("gpt", "GPT");
      const claude = createModel("claude", "Claude");
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", [gpt, claude]), false);
    });
    test("reset when the selected model is hidden from the available models", () => {
      const gpt = createModel("gpt", "GPT");
      const claude = createModel("claude", "Claude");
      const visibleModels = [gpt, claude].filter((model) => model.identifier !== gpt.identifier);
      assert.strictEqual(shouldResetOnModelListChange(gpt.identifier, visibleModels), true);
    });
    test("reset when current model identifier is undefined", () => {
      const gpt = createModel("gpt", "GPT");
      assert.strictEqual(shouldResetOnModelListChange(void 0, [gpt]), true);
    });
    test("reset when models list is empty", () => {
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", []), true);
    });
    test("cache bridges the gap when live models temporarily unavailable", () => {
      const cachedGpt = createModel("gpt", "GPT");
      const cachedClaude = createModel("claude", "Claude");
      const merged = mergeModelsWithCache([], [cachedGpt, cachedClaude], /* @__PURE__ */ new Set(["copilot"]));
      assert.strictEqual(merged.length, 2);
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", merged), false);
    });
    test("cache kept even for uncontributed vendors when no live models exist", () => {
      const cachedGpt = createModel("gpt", "GPT");
      const merged = mergeModelsWithCache([], [cachedGpt], /* @__PURE__ */ new Set());
      assert.strictEqual(merged.length, 1);
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", merged), false);
    });
    test("cache evicted for uncontributed vendor once live models arrive", () => {
      const cachedGpt = createModel("gpt", "GPT");
      const liveOther = createModel("other", "Other", { vendor: "other-vendor" });
      const merged = mergeModelsWithCache([liveOther], [cachedGpt], /* @__PURE__ */ new Set(["other-vendor"]));
      assert.strictEqual(merged.length, 1);
      assert.strictEqual(merged[0].metadata.id, "other");
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", merged), true);
    });
  });
  suite("full startup pipeline (computeAvailableModels)", () => {
    test("startup with only cached models returns filtered cache", () => {
      const cached = createModel("gpt", "GPT");
      const result = computeAvailableModels(
        [],
        // no live models yet
        [cached],
        /* @__PURE__ */ new Set(["copilot"]),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt"]);
    });
    test("startup with cached models from removed vendor still returns them (no live to compare)", () => {
      const cached = createModel("gpt", "GPT");
      const result = computeAvailableModels(
        [],
        // no live models
        [cached],
        /* @__PURE__ */ new Set(),
        // vendor no longer contributed
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt"]);
    });
    test("live models supersede cached models from same vendor", () => {
      const live = createModel("gpt-new", "GPT New");
      const cached = createModel("gpt-old", "GPT Old");
      const result = computeAvailableModels(
        [live],
        [cached],
        /* @__PURE__ */ new Set(["copilot"]),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt-new"]);
    });
    test("partial vendor resolution keeps unresolved vendors from cache", () => {
      const liveA = createModel("a-model", "A Model", { vendor: "vendor-a" });
      const cachedB = createModel("b-model", "B Model", { vendor: "vendor-b" });
      const result = computeAvailableModels(
        [liveA],
        [cachedB],
        /* @__PURE__ */ new Set(["vendor-a", "vendor-b"]),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id).sort(), ["a-model", "b-model"]);
    });
    test("results are sorted alphabetically by name", () => {
      const modelC = createModel("c", "Charlie");
      const modelA = createModel("a", "Alpha");
      const modelB = createModel("b", "Bravo");
      const result = computeAvailableModels(
        [modelC, modelA, modelB],
        [],
        /* @__PURE__ */ new Set(["copilot"]),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.name), ["Alpha", "Bravo", "Charlie"]);
    });
    test("session-targeted models excluded from general session startup", () => {
      const general = createModel("gpt", "GPT");
      const cloudOnly = createSessionModel("cloud", "Cloud", "cloud");
      const result = computeAvailableModels(
        [general, cloudOnly],
        [],
        /* @__PURE__ */ new Set(["copilot"]),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["gpt"]);
    });
    test("only session-targeted models returned for cloud session startup", () => {
      const general = createModel("gpt", "GPT");
      const cloudOnly = createSessionModel("cloud", "Cloud", "cloud");
      const result = computeAvailableModels(
        [general, cloudOnly],
        [],
        /* @__PURE__ */ new Set(["copilot"]),
        "cloud",
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["cloud"]);
    });
    test("agent mode filters non-tool models during startup", () => {
      const toolModel = createModel("tool", "Tool Model");
      const noToolModel = createModel("no-tool", "No Tool", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      const result = computeAvailableModels(
        [toolModel, noToolModel],
        [],
        /* @__PURE__ */ new Set(["copilot"]),
        void 0,
        ChatModeKind.Agent,
        ChatAgentLocation.Chat
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id), ["tool"]);
    });
    test("startup/extension reload with no contributors yet preserves cache (production path)", () => {
      const cachedA = createModel("a-model", "A Model", { vendor: "vendor-a" });
      const cachedB = createModel("b-model", "B Model", { vendor: "vendor-b" });
      const result = computeAvailableModels(
        [],
        [cachedA, cachedB],
        /* @__PURE__ */ new Set(),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat,
        /* @__PURE__ */ new Set()
      );
      assert.deepStrictEqual(result.map((m) => m.metadata.id).sort(), ["a-model", "b-model"]);
    });
  });
  suite("_syncFromModel edge cases", () => {
    test("sync state with undefined selectedModel keeps current", () => {
      const current = createModel("gpt", "GPT");
      const result = resolveModelFromSyncState(current, current, [current], void 0);
      assert.strictEqual(result.action, "keep");
    });
    test("sync state model from different session does not apply", () => {
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, cloudModel];
      const result = resolveModelFromSyncState(cloudModel, generalModel, allModels, void 0);
      assert.strictEqual(result.action, "default");
    });
    test("sync state with model matching different session type falls back to default", () => {
      const enterpriseModel = createSessionModel("ent-gpt", "Enterprise GPT", "enterprise");
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const allModels = [cloudModel, enterpriseModel];
      const result = resolveModelFromSyncState(enterpriseModel, cloudModel, allModels, "cloud");
      assert.strictEqual(result.action, "default");
    });
    test("sync identical model reference returns keep", () => {
      const model = createModel("gpt", "GPT");
      const result = resolveModelFromSyncState(model, model, [model], void 0);
      assert.strictEqual(result.action, "keep");
    });
    test("sync same identifier but different object returns keep", () => {
      const model1 = createModel("gpt", "GPT");
      const model2 = createModel("gpt", "GPT");
      const result = resolveModelFromSyncState(model1, model2, [model1, model2], void 0);
      assert.strictEqual(result.action, "keep");
    });
  });
  suite("checkModelSupported interaction patterns", () => {
    const askContext = {
      location: ChatAgentLocation.Chat,
      currentModeKind: ChatModeKind.Ask,
      sessionType: void 0
    };
    const agentContext = {
      ...askContext,
      currentModeKind: ChatModeKind.Agent
    };
    test("restored model passes Agent compatibility check", () => {
      const agentModel = createModel("agent-model", "Agent Model", {
        capabilities: { toolCalling: true, agentMode: true }
      });
      assert.strictEqual(shouldResetModelToDefault(agentModel, [agentModel], agentContext, [agentModel]), false);
    });
    test("restored model that fails Agent compatibility resets to an Agent model", () => {
      const askOnlyModel = createModel("ask-only", "Ask Only", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      const agentModel = createModel("agent-model", "Agent Model");
      assert.strictEqual(shouldResetModelToDefault(askOnlyModel, [askOnlyModel, agentModel], agentContext, [askOnlyModel, agentModel]), true);
      const agentCompatibleModels = filterModelsForSession(
        [askOnlyModel, agentModel],
        void 0,
        ChatModeKind.Agent,
        ChatAgentLocation.Chat
      );
      const defaultModel = findDefaultModel(agentCompatibleModels, ChatAgentLocation.Chat);
      assert.strictEqual(defaultModel?.metadata.id, "agent-model");
    });
    test("mode switch triggers checkModelSupported which resets incompatible model", () => {
      const noToolModel = createModel("no-tool", "No Tool", {
        capabilities: { toolCalling: false }
      });
      const toolModel = createModel("tool", "Tool");
      assert.strictEqual(shouldResetModelToDefault(noToolModel, [noToolModel, toolModel], askContext, [noToolModel, toolModel]), false);
      assert.strictEqual(shouldResetModelToDefault(noToolModel, [noToolModel, toolModel], agentContext, [noToolModel, toolModel]), true);
    });
    test("double reset is idempotent", () => {
      const defaultModel = createDefaultModelForLocation("default", "Default", ChatAgentLocation.Chat);
      const otherModel = createModel("other", "Other");
      const allModels = [defaultModel, otherModel];
      const result1 = findDefaultModel(allModels, ChatAgentLocation.Chat);
      assert.strictEqual(result1?.metadata.id, "default");
      const result2 = findDefaultModel(allModels, ChatAgentLocation.Chat);
      assert.strictEqual(result2?.metadata.id, "default");
      assert.strictEqual(shouldResetModelToDefault(result1, allModels, askContext, allModels), false);
    });
  });
  suite("multiple session types and cross-contamination", () => {
    test("model from session A rejected in session B", () => {
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const enterpriseModel = createSessionModel("ent-gpt", "Enterprise GPT", "enterprise");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, cloudModel, enterpriseModel];
      assert.strictEqual(isModelValidForSession(cloudModel, allModels, "enterprise"), false);
      assert.strictEqual(isModelValidForSession(enterpriseModel, allModels, "cloud"), false);
      assert.strictEqual(isModelValidForSession(generalModel, allModels, "cloud"), false);
    });
    test("general model is valid when session type has no targeted models", () => {
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, cloudModel];
      assert.strictEqual(isModelValidForSession(generalModel, allModels, "enterprise"), true);
    });
    test("filterModelsForSession isolates session types correctly", () => {
      const general = createModel("gpt", "GPT");
      const cloud = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const enterprise = createSessionModel("ent-gpt", "Enterprise GPT", "enterprise");
      const allModels = [general, cloud, enterprise];
      const cloudFiltered = filterModelsForSession(allModels, "cloud", ChatModeKind.Ask, ChatAgentLocation.Chat);
      assert.deepStrictEqual(cloudFiltered.map((m) => m.metadata.id), ["cloud-gpt"]);
      const entFiltered = filterModelsForSession(allModels, "enterprise", ChatModeKind.Ask, ChatAgentLocation.Chat);
      assert.deepStrictEqual(entFiltered.map((m) => m.metadata.id), ["ent-gpt"]);
      const generalFiltered = filterModelsForSession(allModels, void 0, ChatModeKind.Ask, ChatAgentLocation.Chat);
      assert.deepStrictEqual(generalFiltered.map((m) => m.metadata.id), ["gpt"]);
    });
    test("switching from cloud to general session resets cloud model", () => {
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud");
      const generalModel = createModel("gpt", "GPT");
      const allModels = [generalModel, cloudModel];
      assert.strictEqual(shouldResetModelToDefault(cloudModel, [cloudModel], {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Ask,
        sessionType: "cloud"
      }, allModels), false);
      assert.strictEqual(shouldResetModelToDefault(cloudModel, [generalModel], {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      }, allModels), true);
    });
  });
  suite("mode with forced model (mode.model property)", () => {
    test("mode forces model \u2014 simulating switchModelByQualifiedName success", () => {
      const gpt = createModel("gpt-4o", "GPT-4o");
      const claude = createModel("claude", "Claude");
      const allModels = [gpt, claude];
      const qualifiedName = "GPT-4o (copilot)";
      const match = allModels.find((m) => ILanguageModelChatMetadata.matchesQualifiedName(qualifiedName, m.metadata));
      assert.strictEqual(match?.metadata.id, "gpt-4o");
    });
    test("mode forces model \u2014 copilot vendor shorthand works", () => {
      const gpt = createModel("gpt-4o", "GPT-4o");
      const match = [gpt].find((m) => ILanguageModelChatMetadata.matchesQualifiedName("GPT-4o", m.metadata));
      assert.strictEqual(match?.metadata.id, "gpt-4o");
    });
    test("mode forces model \u2014 nonexistent model gracefully misses", () => {
      const gpt = createModel("gpt-4o", "GPT-4o");
      const match = [gpt].find((m) => ILanguageModelChatMetadata.matchesQualifiedName("NonExistent (copilot)", m.metadata));
      assert.strictEqual(match, void 0);
    });
    test("mode forces model that is then checked for support", () => {
      const forcedModel = createModel("forced", "Forced", {
        capabilities: { toolCalling: false, agentMode: false }
      });
      assert.strictEqual(shouldResetModelToDefault(forcedModel, [forcedModel], {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Agent,
        sessionType: void 0
      }, [forcedModel]), true);
    });
  });
  suite("EditorInline + mode combined scenarios", () => {
    test("EditorInline + Agent requires both agentMode and toolCalling", () => {
      const partialModel = createModel("partial", "Partial", {
        capabilities: { toolCalling: true, agentMode: false }
      });
      assert.strictEqual(isModelSupportedForMode(partialModel, ChatModeKind.Agent), false);
      assert.strictEqual(isModelSupportedForInlineChat(partialModel, ChatAgentLocation.EditorInline), true);
      assert.strictEqual(shouldResetModelToDefault(partialModel, [partialModel], {
        location: ChatAgentLocation.EditorInline,
        currentModeKind: ChatModeKind.Agent,
        sessionType: void 0
      }, [partialModel]), true);
    });
    test("EditorInline + Ask only requires toolCalling", () => {
      const toolModel = createModel("tool", "Tool");
      assert.strictEqual(shouldResetModelToDefault(toolModel, [toolModel], {
        location: ChatAgentLocation.EditorInline,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      }, [toolModel]), false);
    });
    test("EditorInline + Ask rejects model without toolCalling", () => {
      const noToolModel = createModel("no-tool", "No Tool", {
        capabilities: {}
      });
      assert.strictEqual(shouldResetModelToDefault(noToolModel, [noToolModel], {
        location: ChatAgentLocation.EditorInline,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      }, [noToolModel]), true);
    });
  });
  suite("findDefaultModel edge cases", () => {
    test("when all models are session-targeted and none is default, first model wins", () => {
      const m1 = createSessionModel("s1", "Session 1", "cloud");
      const m2 = createSessionModel("s2", "Session 2", "cloud");
      const result = findDefaultModel([m1, m2], ChatAgentLocation.Chat);
      assert.strictEqual(result?.metadata.id, "s1");
    });
    test("default for one location does not leak to another", () => {
      const chatDefault = createDefaultModelForLocation("chat-def", "Chat Default", ChatAgentLocation.Chat);
      const noDefault = createModel("no-def", "No Default");
      assert.strictEqual(findDefaultModel([noDefault, chatDefault], ChatAgentLocation.Chat)?.metadata.id, "chat-def");
      assert.strictEqual(findDefaultModel([noDefault, chatDefault], ChatAgentLocation.Terminal)?.metadata.id, "no-def");
    });
  });
  suite("realistic multi-step race simulations", () => {
    test("startup: cached model \u2192 live models arrive \u2192 user choice preserved", () => {
      const cachedGpt = createModel("gpt", "GPT");
      const cachedClaude = createModel("claude", "Claude");
      const cachedModels = computeAvailableModels(
        [],
        [cachedGpt, cachedClaude],
        /* @__PURE__ */ new Set(["copilot"]),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", cachedModels), false);
      const liveModels = computeAvailableModels(
        [cachedGpt, cachedClaude],
        [cachedGpt, cachedClaude],
        /* @__PURE__ */ new Set(["copilot"]),
        void 0,
        ChatModeKind.Ask,
        ChatAgentLocation.Chat
      );
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", liveModels), false);
    });
    test("extension reload: selected model flickers out then back", () => {
      const gpt = createModel("gpt", "GPT");
      const claude = createModel("claude", "Claude");
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", [gpt, claude]), false);
      const duringReload = mergeModelsWithCache([], [gpt, claude], /* @__PURE__ */ new Set(["copilot"]));
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", duringReload), false);
      const afterReload = mergeModelsWithCache([gpt, claude], [gpt, claude], /* @__PURE__ */ new Set(["copilot"]));
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", afterReload), false);
    });
    test("extension reload without cache: model lost", () => {
      const gpt = createModel("gpt", "GPT");
      const duringReload = mergeModelsWithCache([], [], /* @__PURE__ */ new Set(["copilot"]));
      assert.strictEqual(duringReload.length, 0);
      assert.strictEqual(shouldResetOnModelListChange("copilot/gpt", duringReload), true);
      const afterReload = mergeModelsWithCache([gpt], [], /* @__PURE__ */ new Set(["copilot"]));
      assert.strictEqual(afterReload.length, 1);
    });
    test("session switch race: mode + session change together", () => {
      const generalDefault = createDefaultModelForLocation("gpt", "GPT", ChatAgentLocation.Chat);
      const cloudModel = createSessionModel("cloud-gpt", "Cloud GPT", "cloud", {
        capabilities: { toolCalling: true, agentMode: true }
      });
      const allModels = [generalDefault, cloudModel];
      assert.strictEqual(shouldResetModelToDefault(generalDefault, [generalDefault], {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Agent,
        sessionType: void 0
      }, allModels), false);
      assert.strictEqual(shouldResetModelToDefault(generalDefault, [cloudModel], {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Agent,
        sessionType: "cloud"
      }, allModels), true);
      const cloudDefault = findDefaultModel([cloudModel], ChatAgentLocation.Chat);
      assert.strictEqual(cloudDefault?.metadata.id, "cloud-gpt");
    });
    test("rapid mode changes: ask \u2192 agent \u2192 ask preserves compatible model", () => {
      const model = createModel("gpt", "GPT");
      const allModels = [model];
      assert.strictEqual(shouldResetModelToDefault(model, allModels, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      }, allModels), false);
      assert.strictEqual(shouldResetModelToDefault(model, allModels, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Agent,
        sessionType: void 0
      }, allModels), false);
      assert.strictEqual(shouldResetModelToDefault(model, allModels, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      }, allModels), false);
    });
    test("rapid mode changes: ask \u2192 agent resets incompatible, then agent \u2192 ask does not restore", () => {
      const noToolModel = createModel("no-tool", "No Tool", {
        capabilities: { toolCalling: false }
      });
      const toolModel = createDefaultModelForLocation("tool", "Tool", ChatAgentLocation.Chat);
      const allModels = [noToolModel, toolModel];
      assert.strictEqual(shouldResetModelToDefault(noToolModel, allModels, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      }, allModels), false);
      assert.strictEqual(shouldResetModelToDefault(noToolModel, allModels, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Agent,
        sessionType: void 0
      }, allModels), true);
      const defaultAfterReset = findDefaultModel(allModels, ChatAgentLocation.Chat);
      assert.strictEqual(defaultAfterReset?.metadata.id, "tool");
      assert.strictEqual(shouldResetModelToDefault(toolModel, allModels, {
        location: ChatAgentLocation.Chat,
        currentModeKind: ChatModeKind.Ask,
        sessionType: void 0
      }, allModels), false);
    });
    test("startup race #321037: Copilot vendor resolves empty before BYOK, restored selection must survive", () => {
      const persistedId = "copilot/claude-opus-4.6-1m";
      const cachedCopilot = [
        createModel("claude-opus-4.6-1m", "Claude Opus 4.6 (1M)"),
        createModel("gpt-5.5", "GPT-5.5")
      ];
      const liveByok = [
        createVendorModel("ollama", "deepseek-v3.1", "DeepSeek V3.1"),
        createVendorModel("cerebras", "zai-glm-4.7", "GLM 4.7")
      ];
      const contributedVendors = /* @__PURE__ */ new Set(["copilot", "ollama", "cerebras"]);
      const resolvedVendors = /* @__PURE__ */ new Set(["copilot", "ollama", "cerebras"]);
      const available = computeAvailableModels(
        liveByok,
        [...cachedCopilot, ...liveByok],
        contributedVendors,
        void 0,
        ChatModeKind.Agent,
        ChatAgentLocation.Chat,
        resolvedVendors
      );
      assert.ok(
        available.some((m) => m.identifier === persistedId),
        "restored Copilot model should remain available while its vendor is still activating"
      );
      assert.strictEqual(
        shouldResetOnModelListChange(persistedId, available),
        false,
        "must not reset the restored Copilot selection during the startup race"
      );
      const fallback = findDefaultModel(available, ChatAgentLocation.Chat);
      assert.notStrictEqual(
        fallback?.metadata.isBYOK,
        true,
        "reset fallback should not be a BYOK model"
      );
    });
  });
  suite("agent-host model restore", () => {
    const sessionType = "agent-host-claude";
    const agnosticAuto = createModel("auto", "Auto");
    const agentHostHaiku = {
      ...createSessionModel("claude-haiku-4.5", "Claude Haiku 4.5", sessionType, { isDefaultForLocation: { [ChatAgentLocation.Chat]: true } }),
      identifier: "agent-host-claude:claude-haiku-4.5"
    };
    const agentHostOpus = {
      ...createSessionModel("claude-opus-4.8", "Claude Opus 4.8", sessionType),
      identifier: "agent-host-claude:claude-opus-4.8"
    };
    const allMerged = [agnosticAuto, agentHostHaiku, agentHostOpus];
    test("restores a remembered per-type model only for a fresh own-pool draft", () => {
      assert.deepStrictEqual([
        shouldRestorePerTypeModelOnSessionSwitch(true, true, false),
        shouldRestorePerTypeModelOnSessionSwitch(true, true, true),
        shouldRestorePerTypeModelOnSessionSwitch(false, true, false),
        shouldRestorePerTypeModelOnSessionSwitch(true, false, false)
      ], [true, false, false, false]);
    });
    test("a started contributed session is never a new conversation, even before its requests load", () => {
      const startedAgentHost = URI.parse("agent-host-copilotcli:/933e7602-f84e-431e-8756-c5e85c8f33d0");
      const untitledAgentHost = URI.parse("agent-host-copilotcli:/untitled-933e7602");
      const localSession = LocalChatSessionUri.getNewSessionUri();
      assert.deepStrictEqual([
        isNewConversation(startedAgentHost, true),
        isNewConversation(startedAgentHost, false),
        isNewConversation(untitledAgentHost, true),
        isNewConversation(untitledAgentHost, false),
        isNewConversation(localSession, true),
        isNewConversation(localSession, false)
      ], [false, false, true, false, true, false]);
    });
    test("drops cross-pool draft models in both directions", () => {
      assert.deepStrictEqual([
        shouldDropAgnosticDraftModel(agnosticAuto, allMerged, sessionType),
        shouldDropAgnosticDraftModel(agentHostOpus, allMerged, void 0),
        shouldDropAgnosticDraftModel(agentHostOpus, allMerged, sessionType)
      ], [true, true, false]);
    });
  });
  suite("BYOK agent-host visibility (isModelHiddenInPicker / getAgentHostByokManageModelsIdentifier)", () => {
    function createAgentHostByokModel(vendor, modelId, manageModelsIdentifier) {
      const sessionType = "agent-host-copilotcli";
      const appendedId = `${vendor}/${modelId}`;
      return {
        identifier: `${sessionType}:${appendedId}`,
        metadata: {
          extension: new ExtensionIdentifier("vscode.chat"),
          id: appendedId,
          name: modelId,
          vendor: sessionType,
          version: "1.0",
          family: appendedId,
          maxInputTokens: 128e3,
          maxOutputTokens: 4096,
          isDefaultForLocation: {},
          isUserSelectable: true,
          targetChatSessionType: sessionType,
          modelGroup: { id: vendor },
          byokModelIdentifier: manageModelsIdentifier,
          capabilities: { toolCalling: true, agentMode: true }
        }
      };
    }
    function createNativeAgentHostModel(modelId) {
      const sessionType = "agent-host-copilotcli";
      return {
        identifier: `${sessionType}:${modelId}`,
        metadata: {
          extension: new ExtensionIdentifier("vscode.chat"),
          id: modelId,
          name: modelId,
          vendor: sessionType,
          version: "1.0",
          family: modelId,
          maxInputTokens: 128e3,
          maxOutputTokens: 4096,
          isDefaultForLocation: {},
          isUserSelectable: true,
          targetChatSessionType: sessionType,
          modelGroup: { id: "copilotcli" },
          capabilities: { toolCalling: true, agentMode: true }
        }
      };
    }
    test("returns the carried Manage Models identifier for a groupless BYOK copy", () => {
      const model = createAgentHostByokModel("anthropic", "claude-sonnet-4", "anthropic/claude-sonnet-4");
      assert.strictEqual(getAgentHostByokManageModelsIdentifier(model.metadata), "anthropic/claude-sonnet-4");
    });
    test("returns the carried grouped identifier verbatim (group name + slashes preserved)", () => {
      const model = createAgentHostByokModel("openrouter", "ai21/jamba-large-1.7", "openrouter/OpenRouter 2/ai21/jamba-large-1.7");
      assert.strictEqual(getAgentHostByokManageModelsIdentifier(model.metadata), "openrouter/OpenRouter 2/ai21/jamba-large-1.7");
    });
    test("returns undefined for native harness models (no carried identifier)", () => {
      const model = createNativeAgentHostModel("claude-haiku-4.5");
      assert.strictEqual(getAgentHostByokManageModelsIdentifier(model.metadata), void 0);
    });
    test("returns undefined for non-agent-host models", () => {
      const model = createModel("gpt-5", "GPT-5");
      assert.strictEqual(getAgentHostByokManageModelsIdentifier(model.metadata), void 0);
    });
    test("hides a grouped BYOK copy via its carried registered identifier", () => {
      const model = createAgentHostByokModel("openrouter", "ai21/jamba-large-1.7", "openrouter/OpenRouter 2/ai21/jamba-large-1.7");
      const hidden = /* @__PURE__ */ new Set(["openrouter/OpenRouter 2/ai21/jamba-large-1.7"]);
      assert.strictEqual(isModelHiddenInPicker(model, (id) => hidden.has(id)), true);
    });
    test("hides a groupless BYOK copy via its carried identifier", () => {
      const model = createAgentHostByokModel("anthropic", "claude-sonnet-4", "anthropic/claude-sonnet-4");
      const hidden = /* @__PURE__ */ new Set(["anthropic/claude-sonnet-4"]);
      assert.strictEqual(isModelHiddenInPicker(model, (id) => hidden.has(id)), true);
    });
    test("shows an agent-host BYOK copy when nothing is hidden", () => {
      const model = createAgentHostByokModel("openrouter", "ai21/jamba-large-1.7", "openrouter/OpenRouter 2/ai21/jamba-large-1.7");
      assert.strictEqual(isModelHiddenInPicker(model, () => false), false);
    });
    test("also hides when the agent-host copy identifier itself is hidden", () => {
      const model = createAgentHostByokModel("anthropic", "claude-sonnet-4", "anthropic/claude-sonnet-4");
      const hidden = /* @__PURE__ */ new Set([model.identifier]);
      assert.strictEqual(isModelHiddenInPicker(model, (id) => hidden.has(id)), true);
    });
    test("filters out a hidden grouped BYOK model but keeps visible peers", () => {
      const visible = createAgentHostByokModel("anthropic", "claude-sonnet-4", "anthropic/claude-sonnet-4");
      const hiddenModel = createAgentHostByokModel("openrouter", "ai21/jamba-large-1.7", "openrouter/OpenRouter 2/ai21/jamba-large-1.7");
      const hidden = /* @__PURE__ */ new Set(["openrouter/OpenRouter 2/ai21/jamba-large-1.7"]);
      const result = [visible, hiddenModel].filter((m) => !isModelHiddenInPicker(m, (id) => hidden.has(id)));
      assert.deepStrictEqual(result.map((m) => m.identifier), ["agent-host-copilotcli:anthropic/claude-sonnet-4"]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXRNb2RlbFV0aWxzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQge1xuXHRmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uLFxuXHRmaW5kQmVzdE1hdGNoaW5nTW9kZWwsXG5cdGZpbmREZWZhdWx0TW9kZWwsXG5cdGdldEFnZW50SG9zdEJ5b2tNYW5hZ2VNb2RlbHNJZGVudGlmaWVyLFxuXHRoYXNNb2RlbHNUYXJnZXRpbmdTZXNzaW9uLFxuXHRpc01vZGVsSGlkZGVuSW5QaWNrZXIsXG5cdGlzTW9kZWxTdXBwb3J0ZWRGb3JJbmxpbmVDaGF0LFxuXHRpc01vZGVsU3VwcG9ydGVkRm9yTW9kZSxcblx0aXNNb2RlbFZhbGlkRm9yU2Vzc2lvbixcblx0aXNOZXdDb252ZXJzYXRpb24sXG5cdG1lcmdlTW9kZWxzV2l0aENhY2hlLFxuXHRyZXNvbHZlTW9kZWxGcm9tU3luY1N0YXRlLFxuXHRzaG91bGREcm9wQWdub3N0aWNEcmFmdE1vZGVsLFxuXHRzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0LFxuXHRzaG91bGRSZXNldE9uTW9kZWxMaXN0Q2hhbmdlLFxuXHRzaG91bGRSZXN0b3JlUGVyVHlwZU1vZGVsT25TZXNzaW9uU3dpdGNoLFxufSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXRNb2RlbFV0aWxzLmpzJztcblxuLyoqXG4gKiBUZXN0IGhlbHBlciB0aGF0IGNvbXBvc2VzIHRoZSBmdWxsIHN0YXJ0dXAgcGlwZWxpbmU6IG1lcmdlIGxpdmUrY2FjaGUgXHUyMTkyIHNvcnQgXHUyMTkyIGZpbHRlciBieSBzZXNzaW9uL21vZGUuXG4gKiBUaGlzIG1pcnJvcnMgd2hhdCBgY2hhdElucHV0UGFydC5nZXRNb2RlbHMoKWAgZG9lcywgYnV0IHdpdGhvdXQgdGhlIHN0b3JhZ2Ugc2lkZSBlZmZlY3RzLlxuICovXG5mdW5jdGlvbiBjb21wdXRlQXZhaWxhYmxlTW9kZWxzKFxuXHRsaXZlTW9kZWxzOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSxcblx0Y2FjaGVkTW9kZWxzOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSxcblx0Y29udHJpYnV0ZWRWZW5kb3JzOiBTZXQ8c3RyaW5nPixcblx0c2Vzc2lvblR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0Y3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQsXG5cdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbixcblx0cmVzb2x2ZWRWZW5kb3JzPzogUmVhZG9ubHlTZXQ8c3RyaW5nPixcbik6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdIHtcblx0Y29uc3QgbWVyZ2VkID0gbWVyZ2VNb2RlbHNXaXRoQ2FjaGUobGl2ZU1vZGVscywgY2FjaGVkTW9kZWxzLCBjb250cmlidXRlZFZlbmRvcnMsIHJlc29sdmVkVmVuZG9ycyk7XG5cdG1lcmdlZC5zb3J0KChhLCBiKSA9PiBhLm1ldGFkYXRhLm5hbWUubG9jYWxlQ29tcGFyZShiLm1ldGFkYXRhLm5hbWUpKTtcblx0cmV0dXJuIGZpbHRlck1vZGVsc0ZvclNlc3Npb24obWVyZ2VkLCBzZXNzaW9uVHlwZSwgY3VycmVudE1vZGVLaW5kLCBsb2NhdGlvbik7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vZGVsKFxuXHRpZDogc3RyaW5nLFxuXHRuYW1lOiBzdHJpbmcsXG5cdG92ZXJyaWRlcz86IFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+LFxuKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHtcblx0cmV0dXJuIHtcblx0XHRpZGVudGlmaWVyOiBgY29waWxvdC8ke2lkfWAsXG5cdFx0bWV0YWRhdGE6IHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QuZXh0JyksXG5cdFx0XHRpZCxcblx0XHRcdG5hbWUsXG5cdFx0XHR2ZW5kb3I6ICdjb3BpbG90Jyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0ZmFtaWx5OiAnY29waWxvdCcsXG5cdFx0XHRtYXhJbnB1dFRva2VuczogMTI4MDAwLFxuXHRcdFx0bWF4T3V0cHV0VG9rZW5zOiA0MDk2LFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdFx0aXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSxcblx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogdHJ1ZSwgYWdlbnRNb2RlOiB0cnVlIH0sXG5cdFx0XHQuLi5vdmVycmlkZXMsXG5cdFx0fSBhcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRGVmYXVsdE1vZGVsRm9yTG9jYXRpb24oXG5cdGlkOiBzdHJpbmcsXG5cdG5hbWU6IHN0cmluZyxcblx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLFxuXHRvdmVycmlkZXM/OiBQYXJ0aWFsPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhPixcbik6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB7XG5cdHJldHVybiBjcmVhdGVNb2RlbChpZCwgbmFtZSwge1xuXHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7IFtsb2NhdGlvbl06IHRydWUgfSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH0pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTZXNzaW9uTW9kZWwoXG5cdGlkOiBzdHJpbmcsXG5cdG5hbWU6IHN0cmluZyxcblx0c2Vzc2lvblR5cGU6IHN0cmluZyxcblx0b3ZlcnJpZGVzPzogUGFydGlhbDxJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YT4sXG4pOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIge1xuXHRyZXR1cm4gY3JlYXRlTW9kZWwoaWQsIG5hbWUsIHtcblx0XHR0YXJnZXRDaGF0U2Vzc2lvblR5cGU6IHNlc3Npb25UeXBlLFxuXHRcdC4uLm92ZXJyaWRlcyxcblx0fSk7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG1vZGVsIHNlcnZlZCBieSBhIHNwZWNpZmljICh0eXBpY2FsbHkgQllPSykgdmVuZG9yLCB3aXRoIHRoZSBpZGVudGlmaWVyIHByZWZpeGVkIGJ5IHRoYXQgdmVuZG9yXG4gKiAoZS5nLiBgb2xsYW1hL2RlZXBzZWVrYCkuIE1pcnJvcnMgaG93IHRoZSBsYW5ndWFnZSBtb2RlbCByZWdpc3RyeSBxdWFsaWZpZXMgbm9uLUNvcGlsb3QgbW9kZWxzLlxuICovXG5mdW5jdGlvbiBjcmVhdGVWZW5kb3JNb2RlbChcblx0dmVuZG9yOiBzdHJpbmcsXG5cdGlkOiBzdHJpbmcsXG5cdG5hbWU6IHN0cmluZyxcblx0b3ZlcnJpZGVzPzogUGFydGlhbDxJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YT4sXG4pOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIge1xuXHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKGlkLCBuYW1lLCB7IHZlbmRvciwgZmFtaWx5OiB2ZW5kb3IsIGlzQllPSzogdHJ1ZSwgLi4ub3ZlcnJpZGVzIH0pO1xuXHRyZXR1cm4geyBpZGVudGlmaWVyOiBgJHt2ZW5kb3J9LyR7aWR9YCwgbWV0YWRhdGE6IG1vZGVsLm1ldGFkYXRhIH07XG59XG5cbnN1aXRlKCdDaGF0SW5wdXRNb2RlbFV0aWxzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdpc01vZGVsU3VwcG9ydGVkRm9yTW9kZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2FueSBtb2RlbCBpcyBzdXBwb3J0ZWQgaW4gQXNrIG1vZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCdiYXNpYycsICdCYXNpYycsIHsgY2FwYWJpbGl0aWVzOiB1bmRlZmluZWQgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFN1cHBvcnRlZEZvck1vZGUobW9kZWwsIENoYXRNb2RlS2luZC5Bc2spLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FueSBtb2RlbCBpcyBzdXBwb3J0ZWQgaW4gRWRpdCBtb2RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgnYmFzaWMnLCAnQmFzaWMnLCB7IGNhcGFiaWxpdGllczogdW5kZWZpbmVkIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxTdXBwb3J0ZWRGb3JNb2RlKG1vZGVsLCBDaGF0TW9kZUtpbmQuRWRpdCksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZWwgd2l0aCB0b29sIGNhbGxpbmcgYW5kIGFnZW50IG1vZGUgaXMgc3VwcG9ydGVkIGluIEFnZW50IG1vZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCdhZ2VudC1jYXBhYmxlJywgJ0FnZW50LUNhcGFibGUnLCB7XG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogdHJ1ZSwgYWdlbnRNb2RlOiB0cnVlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsU3VwcG9ydGVkRm9yTW9kZShtb2RlbCwgQ2hhdE1vZGVLaW5kLkFnZW50KSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbCB3aXRoIHRvb2wgY2FsbGluZyBidXQgYWdlbnRNb2RlPXVuZGVmaW5lZCBpcyBzdXBwb3J0ZWQgaW4gQWdlbnQgbW9kZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoJ3Rvb2wtb25seScsICdUb29sLU9ubHknLCB7XG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogdHJ1ZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFN1cHBvcnRlZEZvck1vZGUobW9kZWwsIENoYXRNb2RlS2luZC5BZ2VudCksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZWwgd2l0aG91dCB0b29sIGNhbGxpbmcgaXMgTk9UIHN1cHBvcnRlZCBpbiBBZ2VudCBtb2RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgnbm8tdG9vbHMnLCAnTm8tVG9vbHMnLCB7XG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogZmFsc2UgfSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxTdXBwb3J0ZWRGb3JNb2RlKG1vZGVsLCBDaGF0TW9kZUtpbmQuQWdlbnQpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbCB3aXRoIGFnZW50TW9kZT1mYWxzZSBpcyBOT1Qgc3VwcG9ydGVkIGluIEFnZW50IG1vZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCduby1hZ2VudCcsICdOby1BZ2VudCcsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiB0cnVlLCBhZ2VudE1vZGU6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsU3VwcG9ydGVkRm9yTW9kZShtb2RlbCwgQ2hhdE1vZGVLaW5kLkFnZW50KSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZWwgd2l0aCBubyBjYXBhYmlsaXRpZXMgaXMgTk9UIHN1cHBvcnRlZCBpbiBBZ2VudCBtb2RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgnbm8tY2FwcycsICdOby1DYXBzJywgeyBjYXBhYmlsaXRpZXM6IHVuZGVmaW5lZCB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsU3VwcG9ydGVkRm9yTW9kZShtb2RlbCwgQ2hhdE1vZGVLaW5kLkFnZW50KSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNNb2RlbFN1cHBvcnRlZEZvcklubGluZUNoYXQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdhbnkgbW9kZWwgaXMgc3VwcG9ydGVkIHdoZW4gbm90IGluIEVkaXRvcklubGluZSBsb2NhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoJ2Jhc2ljJywgJ0Jhc2ljJywgeyBjYXBhYmlsaXRpZXM6IHVuZGVmaW5lZCB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsU3VwcG9ydGVkRm9ySW5saW5lQ2hhdChtb2RlbCwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxTdXBwb3J0ZWRGb3JJbmxpbmVDaGF0KG1vZGVsLCBDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbCksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxTdXBwb3J0ZWRGb3JJbmxpbmVDaGF0KG1vZGVsLCBDaGF0QWdlbnRMb2NhdGlvbi5Ob3RlYm9vayksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZWwgd2l0aCB0b29sIGNhbGxpbmcgaXMgc3VwcG9ydGVkIGluIEVkaXRvcklubGluZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoJ3Rvb2xzJywgJ1Rvb2xzJywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IHRydWUgfSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxTdXBwb3J0ZWRGb3JJbmxpbmVDaGF0KG1vZGVsLCBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vZGVsIHdpdGhvdXQgdG9vbCBjYWxsaW5nIGlzIE5PVCBzdXBwb3J0ZWQgaW4gRWRpdG9ySW5saW5lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgnbm8tdG9vbHMnLCAnTm8tVG9vbHMnLCB7XG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogZmFsc2UgfSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxTdXBwb3J0ZWRGb3JJbmxpbmVDaGF0KG1vZGVsLCBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbCB3aXRoIG5vIGNhcGFiaWxpdGllcyBpcyBOT1Qgc3VwcG9ydGVkIGluIEVkaXRvcklubGluZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoJ25vLWNhcHMnLCAnTm8tQ2FwcycsIHsgY2FwYWJpbGl0aWVzOiB1bmRlZmluZWQgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFN1cHBvcnRlZEZvcklubGluZUNoYXQobW9kZWwsIENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZpbHRlck1vZGVsc0ZvclNlc3Npb24nLCAoKSA9PiB7XG5cblx0XHRjb25zdCBncHQ0byA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJyk7XG5cdFx0Y29uc3QgY2xhdWRlID0gY3JlYXRlTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnKTtcblx0XHRjb25zdCBub3RTZWxlY3RhYmxlID0gY3JlYXRlTW9kZWwoJ2hpZGRlbicsICdIaWRkZW4nLCB7IGlzVXNlclNlbGVjdGFibGU6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IGNsb3VkTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRjb25zdCBub1Rvb2xzTW9kZWwgPSBjcmVhdGVNb2RlbCgnbm8tdG9vbHMnLCAnTm8tVG9vbHMnLCB7XG5cdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IGZhbHNlLCBhZ2VudE1vZGU6IGZhbHNlIH0sXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVzZXItc2VsZWN0YWJsZSBnZW5lcmFsIG1vZGVscyB3aGVuIG5vIHNlc3Npb24gdHlwZSBzZXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uKFxuXHRcdFx0XHRbZ3B0NG8sIGNsYXVkZSwgbm90U2VsZWN0YWJsZV0sXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0Q2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKSwgWydncHQtNG8nLCAnY2xhdWRlJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1c2VyLXNlbGVjdGFibGUgZ2VuZXJhbCBtb2RlbHMgZm9yIGxvY2FsIHNlc3Npb24gdHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlck1vZGVsc0ZvclNlc3Npb24oXG5cdFx0XHRcdFtncHQ0bywgY2xhdWRlLCBub3RTZWxlY3RhYmxlXSxcblx0XHRcdFx0J2xvY2FsJyxcblx0XHRcdFx0Q2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKSwgWydncHQtNG8nLCAnY2xhdWRlJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhjbHVkZXMgbW9kZWxzIHRhcmdldGluZyBhIHNwZWNpZmljIHNlc3Npb24gdHlwZSB3aGVuIGluIGdlbmVyYWwgc2Vzc2lvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlck1vZGVsc0ZvclNlc3Npb24oXG5cdFx0XHRcdFtncHQ0bywgY2xhdWRlLCBjbG91ZE1vZGVsXSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLCBbJ2dwdC00bycsICdjbGF1ZGUnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG9ubHkgc2Vzc2lvbi10YXJnZXRlZCBtb2RlbHMgZm9yIGEgc3BlY2lmaWMgc2Vzc2lvbiB0eXBlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbihcblx0XHRcdFx0W2dwdDRvLCBjbGF1ZGUsIGNsb3VkTW9kZWxdLFxuXHRcdFx0XHQnY2xvdWQnLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLCBbJ2Nsb3VkLWdwdCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbHRlcnMgb3V0IG1vZGVscyBpbmNvbXBhdGlibGUgd2l0aCBBZ2VudCBtb2RlIGluIGdlbmVyYWwgc2Vzc2lvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlck1vZGVsc0ZvclNlc3Npb24oXG5cdFx0XHRcdFtncHQ0bywgbm9Ub29sc01vZGVsXSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCksIFsnZ3B0LTRvJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdC5za2lwKCdmaWx0ZXJzIGJ5IG1vZGUgZm9yIHNlc3Npb24tdGFyZ2V0ZWQgbW9kZWxzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xvdWROb1Rvb2xzID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZC1iYXNpYycsICdDbG91ZCBCYXNpYycsICdjbG91ZCcsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiBmYWxzZSwgYWdlbnRNb2RlOiBmYWxzZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uKFxuXHRcdFx0XHRbZ3B0NG8sIGNsb3VkTW9kZWwsIGNsb3VkTm9Ub29sc10sXG5cdFx0XHRcdCdjbG91ZCcsXG5cdFx0XHRcdENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdCk7XG5cdFx0XHQvLyBTZXNzaW9uLXR5cGUgZmlsdGVyaW5nIGFsc28gY2hlY2tzIG1vZGUgYW5kIGlubGluZSBjaGF0IHN1cHBvcnRcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLCBbJ2Nsb3VkLWdwdCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4Y2x1ZGVzIG5vbi1zZWxlY3RhYmxlIG1vZGVscyBmcm9tIHNlc3Npb24tdGFyZ2V0ZWQgcmVzdWx0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNsb3VkSGlkZGVuID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZC1oaWRkZW4nLCAnQ2xvdWQgSGlkZGVuJywgJ2Nsb3VkJywge1xuXHRcdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbihcblx0XHRcdFx0W2Nsb3VkTW9kZWwsIGNsb3VkSGlkZGVuXSxcblx0XHRcdFx0J2Nsb3VkJyxcblx0XHRcdFx0Q2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKSwgWydjbG91ZC1ncHQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIGdlbmVyYWwgbW9kZWxzIHdoZW4gbm8gbW9kZWxzIHRhcmdldCB0aGUgc2Vzc2lvbiB0eXBlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbihcblx0XHRcdFx0W2dwdDRvLCBjbGF1ZGVdLFxuXHRcdFx0XHQnY2xvdWQnLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLCBbJ2dwdC00bycsICdjbGF1ZGUnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaWx0ZXJzIGlubGluZSBjaGF0IGluY29tcGF0aWJsZSBtb2RlbHMgaW4gRWRpdG9ySW5saW5lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm9Ub29sc1NlbGVjdGFibGUgPSBjcmVhdGVNb2RlbCgnbm8tdG9vbHMtc2VsZWN0YWJsZScsICdOby1Ub29scy1TZWxlY3RhYmxlJywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlck1vZGVsc0ZvclNlc3Npb24oXG5cdFx0XHRcdFtncHQ0bywgbm9Ub29sc1NlbGVjdGFibGVdLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKSwgWydncHQtNG8nXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdoYXNNb2RlbHNUYXJnZXRpbmdTZXNzaW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSB3aGVuIHNlc3Npb24gdHlwZSBpcyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBbY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzTW9kZWxzVGFyZ2V0aW5nU2Vzc2lvbihtb2RlbHMsIHVuZGVmaW5lZCksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2Ugd2hlbiBubyBtb2RlbHMgdGFyZ2V0IHRoZSBzZXNzaW9uIHR5cGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBbY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzTW9kZWxzVGFyZ2V0aW5nU2Vzc2lvbihtb2RlbHMsICdjbG91ZCcpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgd2hlbiBhIG1vZGVsIHRhcmdldHMgdGhlIHNlc3Npb24gdHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVscyA9IFtcblx0XHRcdFx0Y3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZC1ncHQnLCAnQ2xvdWQgR1BUJywgJ2Nsb3VkJyksXG5cdFx0XHRdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc01vZGVsc1RhcmdldGluZ1Nlc3Npb24obW9kZWxzLCAnY2xvdWQnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIGZvciBkaWZmZXJlbnQgc2Vzc2lvbiB0eXBlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gW2NyZWF0ZVNlc3Npb25Nb2RlbCgnY2xvdWQtZ3B0JywgJ0Nsb3VkIEdQVCcsICdjbG91ZCcpXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNNb2RlbHNUYXJnZXRpbmdTZXNzaW9uKG1vZGVscywgJ2VudGVycHJpc2UnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNNb2RlbFZhbGlkRm9yU2Vzc2lvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ2dlbmVyYWwgbW9kZWwgaXMgdmFsaWQgd2hlbiBubyBtb2RlbHMgdGFyZ2V0IHRoZSBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2VuZXJhbE1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtnZW5lcmFsTW9kZWxdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxWYWxpZEZvclNlc3Npb24oZ2VuZXJhbE1vZGVsLCBhbGxNb2RlbHMsICdjbG91ZCcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nlc3Npb24tdGFyZ2V0ZWQgbW9kZWwgaXMgTk9UIHZhbGlkIHdoZW4gbm8gbW9kZWxzIHRhcmdldCB0aGUgc2Vzc2lvbiB0eXBlIGluIHBvb2wnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRcdGNvbnN0IGdlbmVyYWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFZhbGlkRm9yU2Vzc2lvbihzZXNzaW9uTW9kZWwsIFtnZW5lcmFsTW9kZWxdLCB1bmRlZmluZWQpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXNzaW9uLXRhcmdldGVkIG1vZGVsIElTIHZhbGlkIHdoZW4gcG9vbCBoYXMgbW9kZWxzIHRhcmdldGluZyB0aGF0IHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpLCBzZXNzaW9uTW9kZWxdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxWYWxpZEZvclNlc3Npb24oc2Vzc2lvbk1vZGVsLCBhbGxNb2RlbHMsICdjbG91ZCcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dlbmVyYWwgbW9kZWwgaXMgTk9UIHZhbGlkIHdoZW4gcG9vbCBoYXMgbW9kZWxzIHRhcmdldGluZyB0aGUgc2Vzc2lvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGdlbmVyYWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtnZW5lcmFsTW9kZWwsIHNlc3Npb25Nb2RlbF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFZhbGlkRm9yU2Vzc2lvbihnZW5lcmFsTW9kZWwsIGFsbE1vZGVscywgJ2Nsb3VkJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vZGVsIHRhcmdldGluZyB3cm9uZyBzZXNzaW9uIGlzIE5PVCB2YWxpZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHdyb25nU2Vzc2lvbk1vZGVsID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdlbnQtZ3B0JywgJ0VudGVycHJpc2UgR1BUJywgJ2VudGVycHJpc2UnKTtcblx0XHRcdGNvbnN0IGNsb3VkTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFt3cm9uZ1Nlc3Npb25Nb2RlbCwgY2xvdWRNb2RlbF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFZhbGlkRm9yU2Vzc2lvbih3cm9uZ1Nlc3Npb25Nb2RlbCwgYWxsTW9kZWxzLCAnY2xvdWQnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuZXJhbCBtb2RlbCBpcyB2YWxpZCB3aGVuIHNlc3Npb24gdHlwZSBpcyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBnZW5lcmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxWYWxpZEZvclNlc3Npb24oZ2VuZXJhbE1vZGVsLCBbZ2VuZXJhbE1vZGVsXSwgdW5kZWZpbmVkKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmaW5kQmVzdE1hdGNoaW5nTW9kZWwnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHByZXZpb3VzIGlzIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHBvb2wgPSBbY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbGF1ZGUtc29ubmV0LTQuNicsICdDbGF1ZGUgU29ubmV0IDQuNicsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknKV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZEJlc3RNYXRjaGluZ01vZGVsKHVuZGVmaW5lZCwgcG9vbCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgZW1wdHkgcG9vbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHByZXYgPSBjcmVhdGVNb2RlbCgnY2xhdWRlLXNvbm5ldC00LjYnLCAnQ2xhdWRlIFNvbm5ldCA0LjYnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kQmVzdE1hdGNoaW5nTW9kZWwocHJldiwgW10pLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBhY3Jvc3MgdmVuZG9ycyBieSByYXcgbW9kZWwgaWQgKHRoZSBpc3N1ZSAjMzE5NTgzIGNhc2UpJywgKCkgPT4ge1xuXHRcdFx0Ly8gUHJldmlvdXMgc2VsZWN0aW9uIGZyb20gdGhlIGluLWV4dGVuc2lvbiBjb3BpbG90Y2xpIHBhcnRpY2lwYW50LFxuXHRcdFx0Ly8gc3dpdGNoaW5nIHRvIHRoZSBhZ2VudC1ob3N0IHBvb2wgd2hlcmUgdGhlIHNhbWUgbW9kZWwgZXhpc3RzIHdpdGhcblx0XHRcdC8vIGEgZGlmZmVyZW50IGlkZW50aWZpZXIvdmVuZG9yLlxuXHRcdFx0Y29uc3QgcHJldiA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUtc29ubmV0LTQuNicsICdDbGF1ZGUgU29ubmV0IDQuNicsIHsgdmVuZG9yOiAnY29waWxvdGNsaScsIGZhbWlseTogJ2NsYXVkZS1zb25uZXQtNC42JyB9KTtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xhdWRlLXNvbm5ldC00LjYnLCAnQ2xhdWRlIFNvbm5ldCA0LjYnLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJywgeyBmYW1pbHk6ICdjbGF1ZGUtc29ubmV0LTQuNicgfSk7XG5cdFx0XHRjb25zdCBvdGhlciA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnZ3B0LTUnLCAnR1BULTUnLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJywgeyBmYW1pbHk6ICdncHQtNScgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZEJlc3RNYXRjaGluZ01vZGVsKHByZXYsIFtvdGhlciwgdGFyZ2V0XSk/LmlkZW50aWZpZXIsIHRhcmdldC5pZGVudGlmaWVyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgYnkgaWQgZXZlbiB3aGVuIGZhbWlseSBkaWZmZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJldiA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUtc29ubmV0LTQuNicsICdDbGF1ZGUgU29ubmV0IDQuNicsIHsgZmFtaWx5OiAnY2xhdWRlJyB9KTtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xhdWRlLXNvbm5ldC00LjYnLCAnT3RoZXIgTmFtZScsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCB7IGZhbWlseTogJ290aGVyJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kQmVzdE1hdGNoaW5nTW9kZWwocHJldiwgW3RhcmdldF0pPy5pZGVudGlmaWVyLCB0YXJnZXQuaWRlbnRpZmllcik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVmZXJzIGlkIG92ZXIgZmFtaWx5IHdoZW4gYm90aCBjb3VsZCBtYXRjaCBkaWZmZXJlbnQgcG9vbCBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdFx0Ly8gRmFtaWx5IGlzIHNoYXJlZCBhY3Jvc3MgZGlzdGluY3QgbW9kZWxzIChlLmcuIGFsbCBDbGF1ZGUgdmFyaWFudHMgc2hhcmUgYGNsYXVkZWApLFxuXHRcdFx0Ly8gc28gdGhlIGlkIG1hdGNoIG11c3Qgd2luIG92ZXIgdGhlIGZhbWlseSBtYXRjaC5cblx0XHRcdGNvbnN0IHByZXYgPSBjcmVhdGVNb2RlbCgnY2xhdWRlLXNvbm5ldC00LjYnLCAnQ2xhdWRlIFNvbm5ldCA0LjYnLCB7IGZhbWlseTogJ2NsYXVkZScgfSk7XG5cdFx0XHRjb25zdCBmYW1pbHlNYXRjaCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xhdWRlLW9wdXMtNC43JywgJ0NsYXVkZSBPcHVzIDQuNycsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCB7IGZhbWlseTogJ2NsYXVkZScgfSk7XG5cdFx0XHRjb25zdCBpZE1hdGNoID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbGF1ZGUtc29ubmV0LTQuNicsICdDbGF1ZGUgU29ubmV0IDQuNicsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCB7IGZhbWlseTogJ2NsYXVkZS1zb25uZXQnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRCZXN0TWF0Y2hpbmdNb2RlbChwcmV2LCBbZmFtaWx5TWF0Y2gsIGlkTWF0Y2hdKT8uaWRlbnRpZmllciwgaWRNYXRjaC5pZGVudGlmaWVyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gbmFtZSB3aGVuIG5laXRoZXIgaWQgbm9yIGZhbWlseSBtYXRjaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHByZXYgPSBjcmVhdGVNb2RlbCgnYScsICdDbGF1ZGUgU29ubmV0IDQuNicsIHsgZmFtaWx5OiAnZmEnIH0pO1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdiJywgJ0NsYXVkZSBTb25uZXQgNC42JywgJ2FnZW50LWhvc3QtY29waWxvdGNsaScsIHsgZmFtaWx5OiAnZmInIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRCZXN0TWF0Y2hpbmdNb2RlbChwcmV2LCBbdGFyZ2V0XSk/LmlkZW50aWZpZXIsIHRhcmdldC5pZGVudGlmaWVyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbm90aGluZyBtYXRjaGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJldiA9IGNyZWF0ZU1vZGVsKCdncHQtNScsICdHUFQtNScsIHsgZmFtaWx5OiAnZ3B0LTUnIH0pO1xuXHRcdFx0Y29uc3QgcG9vbCA9IFtjcmVhdGVTZXNzaW9uTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJywgeyBmYW1pbHk6ICdjbGF1ZGUnIH0pXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kQmVzdE1hdGNoaW5nTW9kZWwocHJldiwgcG9vbCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaCBpcyBjYXNlLWluc2Vuc2l0aXZlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJldiA9IGNyZWF0ZU1vZGVsKCdDbGF1ZGUtU29ubmV0LTQuNicsICdDTEFVREUgU09OTkVUIDQuNicsIHsgZmFtaWx5OiAnQ0xBVURFLVNPTk5FVC00LjYnIH0pO1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbGF1ZGUtc29ubmV0LTQuNicsICdjbGF1ZGUgc29ubmV0IDQuNicsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCB7IGZhbWlseTogJ2NsYXVkZS1zb25uZXQtNC42JyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kQmVzdE1hdGNoaW5nTW9kZWwocHJldiwgW3RhcmdldF0pPy5pZGVudGlmaWVyLCB0YXJnZXQuaWRlbnRpZmllcik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmaW5kRGVmYXVsdE1vZGVsJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyBtb2RlbCBtYXJrZWQgYXMgZGVmYXVsdCBmb3IgbG9jYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWd1bGFyID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRNb2RlbCA9IGNyZWF0ZURlZmF1bHRNb2RlbEZvckxvY2F0aW9uKCdjbGF1ZGUnLCAnQ2xhdWRlJywgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kRGVmYXVsdE1vZGVsKFtyZWd1bGFyLCBkZWZhdWx0TW9kZWxdLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/Lm1ldGFkYXRhLmlkLCAnY2xhdWRlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIGZpcnN0IG1vZGVsIHdoZW4gbm8gZGVmYXVsdCBmb3IgbG9jYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgbW9kZWxCID0gY3JlYXRlTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmREZWZhdWx0TW9kZWwoW21vZGVsQSwgbW9kZWxCXSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py5tZXRhZGF0YS5pZCwgJ2dwdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGVtcHR5IG1vZGVscyBhcnJheScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmREZWZhdWx0TW9kZWwoW10sIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgbG9jYXRpb24tc3BlY2lmaWMgZGVmYXVsdCB3aGVuIG11bHRpcGxlIGRlZmF1bHRzIGV4aXN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2hhdERlZmF1bHQgPSBjcmVhdGVEZWZhdWx0TW9kZWxGb3JMb2NhdGlvbignY2hhdC1kZWZhdWx0JywgJ0NoYXQgRGVmYXVsdCcsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxEZWZhdWx0ID0gY3JlYXRlRGVmYXVsdE1vZGVsRm9yTG9jYXRpb24oJ3Rlcm1pbmFsLWRlZmF1bHQnLCAnVGVybWluYWwgRGVmYXVsdCcsIENoYXRBZ2VudExvY2F0aW9uLlRlcm1pbmFsKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmREZWZhdWx0TW9kZWwoW2NoYXREZWZhdWx0LCB0ZXJtaW5hbERlZmF1bHRdLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/Lm1ldGFkYXRhLmlkLCAnY2hhdC1kZWZhdWx0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBwaWNrIHRlcm1pbmFsIGRlZmF1bHQgd2hlbiBsb29raW5nIGZvciBjaGF0IGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbERlZmF1bHQgPSBjcmVhdGVEZWZhdWx0TW9kZWxGb3JMb2NhdGlvbigndGVybWluYWwtZGVmYXVsdCcsICdUZXJtaW5hbCBEZWZhdWx0JywgQ2hhdEFnZW50TG9jYXRpb24uVGVybWluYWwpO1xuXHRcdFx0Y29uc3QgcmVndWxhciA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kRGVmYXVsdE1vZGVsKFt0ZXJtaW5hbERlZmF1bHQsIHJlZ3VsYXJdLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdC8vIEZhbGxzIGJhY2sgdG8gZmlyc3QgbW9kZWwgc2luY2Ugbm9uZSBpcyBkZWZhdWx0IGZvciBDaGF0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py5tZXRhZGF0YS5pZCwgJ3Rlcm1pbmFsLWRlZmF1bHQnKTtcblx0XHR9KTtcblxuXHR9KTtcblxuXHRzdWl0ZSgnc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdCcsICgpID0+IHtcblxuXHRcdGNvbnN0IGRlZmF1bHRDb250ZXh0ID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRzZXNzaW9uVHlwZTogdW5kZWZpbmVkLFxuXHRcdH07XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzZXQgd2hlbiBjdXJyZW50IG1vZGVsIGlzIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KHVuZGVmaW5lZCwgW10sIGRlZmF1bHRDb250ZXh0LCBbXSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc2V0IHdoZW4gbW9kZWwgaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KG1vZGVsLCBbXSwgZGVmYXVsdENvbnRleHQsIFttb2RlbF0pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBOT1QgcmVzZXQgd2hlbiBtb2RlbCBpcyBhdmFpbGFibGUgYW5kIGNvbXBhdGlibGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChtb2RlbCwgW21vZGVsXSwgZGVmYXVsdENvbnRleHQsIFttb2RlbF0pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzZXQgd2hlbiBtb2RlbCBpcyBub3Qgc3VwcG9ydGVkIGZvciBjdXJyZW50IG1vZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCduby10b29scycsICdOby1Ub29scycsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiBmYWxzZSwgYWdlbnRNb2RlOiBmYWxzZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0geyAuLi5kZWZhdWx0Q29udGV4dCwgY3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQgfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KG1vZGVsLCBbbW9kZWxdLCBjb250ZXh0LCBbbW9kZWxdKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzZXQgd2hlbiBtb2RlbCBpcyBub3Qgc3VwcG9ydGVkIGZvciBpbmxpbmUgY2hhdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoJ25vLXRvb2xzJywgJ05vLVRvb2xzJywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSB7XG5cdFx0XHRcdC4uLmRlZmF1bHRDb250ZXh0LFxuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lLFxuXHRcdFx0fTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KG1vZGVsLCBbbW9kZWxdLCBjb250ZXh0LCBbbW9kZWxdKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzZXQgd2hlbiBtb2RlbCBpcyBub3QgdmFsaWQgZm9yIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBnZW5lcmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbk1vZGVsID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZC1ncHQnLCAnQ2xvdWQgR1BUJywgJ2Nsb3VkJyk7XG5cdFx0XHRjb25zdCBhbGxNb2RlbHMgPSBbZ2VuZXJhbE1vZGVsLCBzZXNzaW9uTW9kZWxdO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IHsgLi4uZGVmYXVsdENvbnRleHQsIHNlc3Npb25UeXBlOiAnY2xvdWQnIH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChnZW5lcmFsTW9kZWwsIFtnZW5lcmFsTW9kZWxdLCBjb250ZXh0LCBhbGxNb2RlbHMpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBOT1QgcmVzZXQgc2Vzc2lvbiBtb2RlbCBpbiBtYXRjaGluZyBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbk1vZGVsID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZC1ncHQnLCAnQ2xvdWQgR1BUJywgJ2Nsb3VkJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0geyAuLi5kZWZhdWx0Q29udGV4dCwgc2Vzc2lvblR5cGU6ICdjbG91ZCcgfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KHNlc3Npb25Nb2RlbCwgW3Nlc3Npb25Nb2RlbF0sIGNvbnRleHQsIFtzZXNzaW9uTW9kZWxdKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVzb2x2ZU1vZGVsRnJvbVN5bmNTdGF0ZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2tlZXBzIGN1cnJlbnQgbW9kZWwgd2hlbiBzYW1lIGFzIHN0YXRlIG1vZGVsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZU1vZGVsRnJvbVN5bmNTdGF0ZShtb2RlbCwgbW9kZWwsIFttb2RlbF0sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFjdGlvbiwgJ2tlZXAnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGxpZXMgc3RhdGUgbW9kZWwgd2hlbiBkaWZmZXJlbnQgYW5kIHZhbGlkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBzdGF0ZU1vZGVsID0gY3JlYXRlTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVNb2RlbEZyb21TeW5jU3RhdGUoc3RhdGVNb2RlbCwgY3VycmVudCwgW2N1cnJlbnQsIHN0YXRlTW9kZWxdLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hY3Rpb24sICdhcHBseScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBkZWZhdWx0IHdoZW4gc3RhdGUgbW9kZWwgbm90IHZhbGlkIGZvciBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xvdWQtZ3B0JywgJ0Nsb3VkIEdQVCcsICdjbG91ZCcpO1xuXHRcdFx0Y29uc3Qgc3RhdGVNb2RlbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7IC8vIGdlbmVyYWwgbW9kZWwsIG5vdCB2YWxpZCBmb3IgY2xvdWQgc2Vzc2lvblxuXHRcdFx0Y29uc3QgYWxsTW9kZWxzID0gW2N1cnJlbnQsIHN0YXRlTW9kZWxdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZU1vZGVsRnJvbVN5bmNTdGF0ZShzdGF0ZU1vZGVsLCBjdXJyZW50LCBhbGxNb2RlbHMsICdjbG91ZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hY3Rpb24sICdkZWZhdWx0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBsaWVzIHdoZW4gY3VycmVudCBtb2RlbCBpcyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZU1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVNb2RlbEZyb21TeW5jU3RhdGUoc3RhdGVNb2RlbCwgdW5kZWZpbmVkLCBbc3RhdGVNb2RlbF0sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFjdGlvbiwgJ2FwcGx5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBsaWVzIHNlc3Npb24gbW9kZWwgd2hlbiB2YWxpZCBmb3IgbWF0Y2hpbmcgc2Vzc2lvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25Nb2RlbCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xvdWQtZ3B0JywgJ0Nsb3VkIEdQVCcsICdjbG91ZCcpO1xuXHRcdFx0Y29uc3QgZ2VuZXJhbE1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtnZW5lcmFsTW9kZWwsIHNlc3Npb25Nb2RlbF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlTW9kZWxGcm9tU3luY1N0YXRlKHNlc3Npb25Nb2RlbCwgZ2VuZXJhbE1vZGVsLCBhbGxNb2RlbHMsICdjbG91ZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hY3Rpb24sICdhcHBseScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBkZWZhdWx0IHdoZW4gc3RhdGUgbW9kZWwgZG9lcyBub3Qgc3VwcG9ydCBjdXJyZW50IG1vZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IHN0YXRlTW9kZWwgPSBjcmVhdGVNb2RlbCgnbm8tdG9vbHMnLCAnTm8tVG9vbHMnLCB7XG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogZmFsc2UsIGFnZW50TW9kZTogZmFsc2UgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZU1vZGVsRnJvbVN5bmNTdGF0ZShzdGF0ZU1vZGVsLCBjdXJyZW50LCBbY3VycmVudCwgc3RhdGVNb2RlbF0sIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0Y3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdHNlc3Npb25UeXBlOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWN0aW9uLCAnZGVmYXVsdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBkZWZhdWx0IHdoZW4gc3RhdGUgbW9kZWwgZG9lcyBub3Qgc3VwcG9ydCBpbmxpbmUgY2hhdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3Qgc3RhdGVNb2RlbCA9IGNyZWF0ZU1vZGVsKCduby10b29scycsICdOby1Ub29scycsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiBmYWxzZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlTW9kZWxGcm9tU3luY1N0YXRlKHN0YXRlTW9kZWwsIGN1cnJlbnQsIFtjdXJyZW50LCBzdGF0ZU1vZGVsXSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUsXG5cdFx0XHRcdGN1cnJlbnRNb2RlS2luZDogQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0c2Vzc2lvblR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hY3Rpb24sICdkZWZhdWx0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBsaWVzIHdoZW4gc3RhdGUgbW9kZWwgc3VwcG9ydHMgY3VycmVudCBtb2RlIHdpdGggY29udGV4dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3Qgc3RhdGVNb2RlbCA9IGNyZWF0ZU1vZGVsKCdhZ2VudC1tb2RlbCcsICdBZ2VudCBNb2RlbCcsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiB0cnVlLCBhZ2VudE1vZGU6IHRydWUgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZU1vZGVsRnJvbVN5bmNTdGF0ZShzdGF0ZU1vZGVsLCBjdXJyZW50LCBbY3VycmVudCwgc3RhdGVNb2RlbF0sIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0Y3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdHNlc3Npb25UeXBlOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWN0aW9uLCAnYXBwbHknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZGVmYXVsdCB3aGVuIGN1cnJlbnQgYW5kIHN0YXRlIHNoYXJlIGFuIGlkZW50aWZpZXIgYnV0IG5laXRoZXIgYmVsb25ncyB0byB0aGUgbmV3IHNlc3Npb24gcG9vbCcsICgpID0+IHtcblx0XHRcdC8vIFJlZ3Jlc3Npb24gZm9yICMzMTk1ODM6IHN3aXRjaGluZyBmcm9tIGEgZ2VuZXJhbCBwb29sIChgbG9jYWxgKSB0byBhXG5cdFx0XHQvLyBzZXNzaW9uLXRhcmdldGVkIHBvb2wgKGBhZ2VudC1ob3N0LWNvcGlsb3RjbGlgKSB3aGlsZSB0aGUgcGlja2VyXG5cdFx0XHQvLyBzdGlsbCBob2xkcyBhIGdlbmVyYWwgbW9kZWwuIFRoZSBnZW5lcmFsIG1vZGVsJ3MgaWRlbnRpZmllciBtYXRjaGVzXG5cdFx0XHQvLyBib3RoIGBjdXJyZW50TW9kZWxgIGFuZCB0aGUgcGVyc2lzdGVkIGBzdGF0ZU1vZGVsYCwgYnV0IGl0IGlzIG5vdFxuXHRcdFx0Ly8gdmFsaWQgZm9yIHRoZSBuZXcgcG9vbCBcdTIwMTQgdGhlIHJlc29sdmVyIG11c3QgZmFsbCB0aHJvdWdoIHRvXG5cdFx0XHQvLyBgJ2RlZmF1bHQnYCByYXRoZXIgdGhhbiBzaG9ydC1jaXJjdWl0IHRvIGAna2VlcCdgLlxuXHRcdFx0Y29uc3QgZ2VuZXJhbE1vZGVsID0gY3JlYXRlTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnKTtcblx0XHRcdGNvbnN0IHNlc3Npb25Nb2RlbCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknKTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtnZW5lcmFsTW9kZWwsIHNlc3Npb25Nb2RlbF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlTW9kZWxGcm9tU3luY1N0YXRlKGdlbmVyYWxNb2RlbCwgZ2VuZXJhbE1vZGVsLCBhbGxNb2RlbHMsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWN0aW9uLCAnZGVmYXVsdCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbWVyZ2VNb2RlbHNXaXRoQ2FjaGUnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCd1c2VzIGxpdmUgbW9kZWxzIHdoZW4gYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGl2ZU1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGNhY2hlZE1vZGVsID0gY3JlYXRlTW9kZWwoJ2NhY2hlZC1ncHQnLCAnQ2FjaGVkIEdQVCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbWVyZ2VNb2RlbHNXaXRoQ2FjaGUoW2xpdmVNb2RlbF0sIFtjYWNoZWRNb2RlbF0sIG5ldyBTZXQoWydjb3BpbG90J10pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ubWV0YWRhdGEuaWQsICdncHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gY2FjaGVkIG1vZGVscyB3aGVuIG5vIGxpdmUgbW9kZWxzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FjaGVkTW9kZWwgPSBjcmVhdGVNb2RlbCgnY2FjaGVkLWdwdCcsICdDYWNoZWQgR1BUJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBtZXJnZU1vZGVsc1dpdGhDYWNoZShbXSwgW2NhY2hlZE1vZGVsXSwgbmV3IFNldChbJ2NvcGlsb3QnXSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5tZXRhZGF0YS5pZCwgJ2NhY2hlZC1ncHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21lcmdlcyBjYWNoZWQgbW9kZWxzIGZyb20gdmVuZG9ycyBub3QgeWV0IHJlc29sdmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGl2ZU1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGNhY2hlZE90aGVyVmVuZG9yID0gY3JlYXRlTW9kZWwoJ290aGVyLW1vZGVsJywgJ090aGVyIE1vZGVsJywgeyB2ZW5kb3I6ICdvdGhlci12ZW5kb3InIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbWVyZ2VNb2RlbHNXaXRoQ2FjaGUoXG5cdFx0XHRcdFtsaXZlTW9kZWxdLFxuXHRcdFx0XHRbY2FjaGVkT3RoZXJWZW5kb3JdLFxuXHRcdFx0XHRuZXcgU2V0KFsnY29waWxvdCcsICdvdGhlci12ZW5kb3InXSksXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCkuc29ydCgpLCBbJ2dwdCcsICdvdGhlci1tb2RlbCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V2aWN0cyBjYWNoZWQgbW9kZWxzIGZyb20gdmVuZG9ycyBubyBsb25nZXIgY29udHJpYnV0ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsaXZlTW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgY2FjaGVkUmVtb3ZlZFZlbmRvciA9IGNyZWF0ZU1vZGVsKCdyZW1vdmVkLW1vZGVsJywgJ1JlbW92ZWQgTW9kZWwnLCB7IHZlbmRvcjogJ3JlbW92ZWQtdmVuZG9yJyB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG1lcmdlTW9kZWxzV2l0aENhY2hlKFxuXHRcdFx0XHRbbGl2ZU1vZGVsXSxcblx0XHRcdFx0W2NhY2hlZFJlbW92ZWRWZW5kb3JdLFxuXHRcdFx0XHRuZXcgU2V0KFsnY29waWxvdCddKSwgLy8gcmVtb3ZlZC12ZW5kb3IgaXMgTk9UIGNvbnRyaWJ1dGVkXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5tZXRhZGF0YS5pZCwgJ2dwdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgZHVwbGljYXRlIG1vZGVscyBmcm9tIHNhbWUgdmVuZG9yJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGl2ZU1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGNhY2hlZFNhbWVWZW5kb3IgPSBjcmVhdGVNb2RlbCgnY2FjaGVkLWdwdCcsICdDYWNoZWQgR1BUJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBtZXJnZU1vZGVsc1dpdGhDYWNoZShcblx0XHRcdFx0W2xpdmVNb2RlbF0sXG5cdFx0XHRcdFtjYWNoZWRTYW1lVmVuZG9yXSxcblx0XHRcdFx0bmV3IFNldChbJ2NvcGlsb3QnXSksXG5cdFx0XHQpO1xuXHRcdFx0Ly8gQm90aCBhcmUgdmVuZG9yICdjb3BpbG90JywgbGl2ZSB2ZW5kb3IgdGFrZXMgcHJpb3JpdHlcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ubWV0YWRhdGEuaWQsICdncHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZW1wdHkgY2FjaGUgYW5kIGVtcHR5IGxpdmUgbW9kZWxzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbWVyZ2VNb2RlbHNXaXRoQ2FjaGUoW10sIFtdLCBuZXcgU2V0KCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgbXVsdGlwbGUgdmVuZG9ycyB3aXRoIHBhcnRpYWwgcmVzb2x1dGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGxpdmVBID0gY3JlYXRlTW9kZWwoJ2EtbW9kZWwnLCAnQSBNb2RlbCcsIHsgdmVuZG9yOiAndmVuZG9yLWEnIH0pO1xuXHRcdFx0Y29uc3QgY2FjaGVkQiA9IGNyZWF0ZU1vZGVsKCdiLW1vZGVsJywgJ0IgTW9kZWwnLCB7IHZlbmRvcjogJ3ZlbmRvci1iJyB9KTtcblx0XHRcdGNvbnN0IGNhY2hlZEMgPSBjcmVhdGVNb2RlbCgnYy1tb2RlbCcsICdDIE1vZGVsJywgeyB2ZW5kb3I6ICd2ZW5kb3ItYycgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBtZXJnZU1vZGVsc1dpdGhDYWNoZShcblx0XHRcdFx0W2xpdmVBXSxcblx0XHRcdFx0W2NhY2hlZEIsIGNhY2hlZENdLFxuXHRcdFx0XHRuZXcgU2V0KFsndmVuZG9yLWEnLCAndmVuZG9yLWInXSksIC8vIHZlbmRvci1jIG5vdCBjb250cmlidXRlZFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEudmVuZG9yKS5zb3J0KCksIFsndmVuZG9yLWEnLCAndmVuZG9yLWInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdldmljdHMgY2FjaGVkIGVudHJpZXMgZm9yIGEgcmVzb2x2ZWQgdmVuZG9yIHRoYXQgcmV0dXJuZWQgemVybyBtb2RlbHMgKEJZT0sgZGVsZXRlKScsICgpID0+IHtcblx0XHRcdC8vIHZlbmRvci1hIGlzIHJlc29sdmVkIHdpdGggb25lIGxpdmUgbW9kZWw7IHZlbmRvci1iIGlzIHJlc29sdmVkIHdpdGggbm8gbGl2ZSBtb2RlbHNcblx0XHRcdC8vIChlLmcuIHRoZSB1c2VyIHJlbW92ZWQgdGhlaXIgQllPSyBBUEkga2V5KS4gQ2FjaGVkIHZlbmRvci1iIGVudHJpZXMgbXVzdCBOT1Rcblx0XHRcdC8vIHJlc3VycmVjdCB0aG9zZSBtb2RlbHMgaW4gdGhlIHBpY2tlci5cblx0XHRcdGNvbnN0IGxpdmVBID0gY3JlYXRlTW9kZWwoJ2EtbW9kZWwnLCAnQSBNb2RlbCcsIHsgdmVuZG9yOiAndmVuZG9yLWEnIH0pO1xuXHRcdFx0Y29uc3Qgc3RhbGVCID0gY3JlYXRlTW9kZWwoJ2ItbW9kZWwnLCAnQiBNb2RlbCcsIHsgdmVuZG9yOiAndmVuZG9yLWInIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbWVyZ2VNb2RlbHNXaXRoQ2FjaGUoXG5cdFx0XHRcdFtsaXZlQV0sXG5cdFx0XHRcdFtzdGFsZUJdLFxuXHRcdFx0XHRuZXcgU2V0KFsndmVuZG9yLWEnLCAndmVuZG9yLWInXSksXG5cdFx0XHRcdG5ldyBTZXQoWyd2ZW5kb3ItYScsICd2ZW5kb3ItYiddKSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLm1ldGFkYXRhLnZlbmRvciwgJ3ZlbmRvci1hJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdrZWVwcyBjYWNoZWQgZW50cmllcyBmb3IgYW4gdW5yZXNvbHZlZCB2ZW5kb3IgKGV4dGVuc2lvbiByZWxvYWQgcmFjZSknLCAoKSA9PiB7XG5cdFx0XHQvLyB2ZW5kb3ItYiBpcyBjb250cmlidXRlZCBidXQgaXRzIHByb3ZpZGVyIGhhc24ndCBjb21wbGV0ZWQgYSByZXNvbHV0aW9uIHlldFxuXHRcdFx0Ly8gKGUuZy4gZXh0ZW5zaW9uIGlzIG1pZC1yZWxvYWQpLiBDYWNoZSBtdXN0IGJyaWRnZSB0aGUgZ2FwIHNvIHRoZSBwaWNrZXJcblx0XHRcdC8vIGtlZXBzIHNob3dpbmcgdGhlIHVzZXIncyBwcmV2aW91c2x5LXNlZW4gbW9kZWxzLlxuXHRcdFx0Y29uc3QgbGl2ZUEgPSBjcmVhdGVNb2RlbCgnYS1tb2RlbCcsICdBIE1vZGVsJywgeyB2ZW5kb3I6ICd2ZW5kb3ItYScgfSk7XG5cdFx0XHRjb25zdCBjYWNoZWRCID0gY3JlYXRlTW9kZWwoJ2ItbW9kZWwnLCAnQiBNb2RlbCcsIHsgdmVuZG9yOiAndmVuZG9yLWInIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbWVyZ2VNb2RlbHNXaXRoQ2FjaGUoXG5cdFx0XHRcdFtsaXZlQV0sXG5cdFx0XHRcdFtjYWNoZWRCXSxcblx0XHRcdFx0bmV3IFNldChbJ3ZlbmRvci1hJywgJ3ZlbmRvci1iJ10pLFxuXHRcdFx0XHRuZXcgU2V0KFsndmVuZG9yLWEnXSksIC8vIHZlbmRvci1iIG5vdCB5ZXQgcmVzb2x2ZWRcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAobSA9PiBtLm1ldGFkYXRhLnZlbmRvcikuc29ydCgpLCBbJ3ZlbmRvci1hJywgJ3ZlbmRvci1iJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXZpY3RzIGNhY2hlIGZvciBhIHJlc29sdmVkIHZlbmRvciBldmVuIHdoZW4gYWxsIGxpdmUgbW9kZWxzIGFyZSB6ZXJvJywgKCkgPT4ge1xuXHRcdFx0Ly8gRWRnZSBjYXNlOiB0aGUgb25seSByZXNvbHZlZCB2ZW5kb3IgcmV0dXJucyB6ZXJvIG1vZGVscyAodXNlciBkZWxldGVkIGFsbFxuXHRcdFx0Ly8gY29uZmlndXJhdGlvbnMpLiBDYWNoZSBtdXN0IGJlIGlnbm9yZWQgXHUyMDE0IHRoZSBwaWNrZXIgc2hvdWxkIGJlIGVtcHR5LlxuXHRcdFx0Y29uc3Qgc3RhbGUgPSBjcmVhdGVNb2RlbCgnYi1tb2RlbCcsICdCIE1vZGVsJywgeyB2ZW5kb3I6ICd2ZW5kb3ItYicgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBtZXJnZU1vZGVsc1dpdGhDYWNoZShcblx0XHRcdFx0W10sXG5cdFx0XHRcdFtzdGFsZV0sXG5cdFx0XHRcdG5ldyBTZXQoWyd2ZW5kb3ItYiddKSxcblx0XHRcdFx0bmV3IFNldChbJ3ZlbmRvci1iJ10pLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBmdWxsIGNhY2hlIHdoZW4gbm8gdmVuZG9ycyBhcmUgY29udHJpYnV0ZWQgeWV0IChzdGFydHVwIHJhY2UpJywgKCkgPT4ge1xuXHRcdFx0Ly8gRHVyaW5nIHN0YXJ0dXAgb3IgYW4gZXh0ZW5zaW9uIHJlbG9hZCwgdmVuZG9yIGRlc2NyaXB0b3JzIG1heSBub3QgYmVcblx0XHRcdC8vIHJlZ2lzdGVyZWQgeWV0LiBjb250cmlidXRlZFZlbmRvcnMgaXMgZW1wdHkgYW5kIHNvIGlzIHJlc29sdmVkVmVuZG9ycy5cblx0XHRcdC8vIFdlIG11c3QgTk9UIGRyb3AgdGhlIGNhY2hlIFx1MjAxNCB0aGF0IHdvdWxkIHJlc2V0IHRoZSB1c2VyJ3Mgc2VsZWN0ZWQgbW9kZWxcblx0XHRcdC8vIGJlZm9yZSB0aGUgdmVuZG9ycyBjb21lIGJhY2suXG5cdFx0XHRjb25zdCBjYWNoZWRBID0gY3JlYXRlTW9kZWwoJ2EtbW9kZWwnLCAnQSBNb2RlbCcsIHsgdmVuZG9yOiAndmVuZG9yLWEnIH0pO1xuXHRcdFx0Y29uc3QgY2FjaGVkQiA9IGNyZWF0ZU1vZGVsKCdiLW1vZGVsJywgJ0IgTW9kZWwnLCB7IHZlbmRvcjogJ3ZlbmRvci1iJyB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG1lcmdlTW9kZWxzV2l0aENhY2hlKFxuXHRcdFx0XHRbXSxcblx0XHRcdFx0W2NhY2hlZEEsIGNhY2hlZEJdLFxuXHRcdFx0XHRuZXcgU2V0KCksXG5cdFx0XHRcdG5ldyBTZXQoKSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKS5zb3J0KCksIFsnYS1tb2RlbCcsICdiLW1vZGVsJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXZpY3RzIGNhY2hlZCBhZ2VudC1ob3N0IGVudHJpZXMgd2hlbiB0aGUgdmVuZG9yIGlzIHJlc29sdmVkIHdpdGggemVybyBsaXZlIG1vZGVscycsICgpID0+IHtcblx0XHRcdC8vIFRoZSBhZ2VudC1ob3N0IFwiZW1wdHkgaXMgdHJhbnNpZW50XCIgZ3JhY2UgaXMgc2NvcGVkIHRvIHJlc3RvcmUgKnJlc29sdXRpb24qIG9ubHlcblx0XHRcdC8vIChyZXNvbHZlTW9kZWxJZGVudGlmaWVyRnJvbUNhdGFsb2cpOyBpdCBtdXN0IE5PVCByZWxheCBjYWNoZS1yZXRlbnRpb24uIEEgcmVzb2x2ZWRcblx0XHRcdC8vIGFnZW50LWhvc3QgdmVuZG9yIHdpdGggbm8gbGl2ZSBtb2RlbHMgaXMgYXV0aG9yaXRhdGl2ZSBoZXJlLCBzbyBpdHMgY2FjaGUgaXMgZXZpY3RlZFxuXHRcdFx0Ly8gbGlrZSBhbnkgb3RoZXIgdmVuZG9yIFx1MjAxNCBvdGhlcndpc2UgYSByZW1vdmVkL3VuZW50aXRsZWQgYWdlbnQtaG9zdCBtb2RlbCBjb3VsZCBiZVxuXHRcdFx0Ly8gb2ZmZXJlZCBmcm9tIGNhY2hlIChhbmQgdGhlIGlucHV0J3MgXCJubyBtb2RlbHNcIi9zZW5kLWJsb2NrZWQgc3RhdGUgd291bGQgYmUgbWFza2VkKS5cblx0XHRcdGNvbnN0IGxpdmVDb3BpbG90ID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IHN0YWxlQWdlbnRIb3N0ID0gY3JlYXRlVmVuZG9yTW9kZWwoJ2FnZW50LWhvc3QtY29waWxvdGNsaScsICdncHQtNS42LXNvbCcsICdHUFQgNS42IFNvbCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbWVyZ2VNb2RlbHNXaXRoQ2FjaGUoXG5cdFx0XHRcdFtsaXZlQ29waWxvdF0sXG5cdFx0XHRcdFtzdGFsZUFnZW50SG9zdF0sXG5cdFx0XHRcdG5ldyBTZXQoWydjb3BpbG90JywgJ2FnZW50LWhvc3QtY29waWxvdGNsaSddKSxcblx0XHRcdFx0bmV3IFNldChbJ2NvcGlsb3QnLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJ10pLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ubWV0YWRhdGEudmVuZG9yLCAnY29waWxvdCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbW9kZWwgc3dpdGNoaW5nIHNjZW5hcmlvcycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3N3aXRjaGluZyBmcm9tIEFzayB0byBBZ2VudCBtb2RlIHNob3VsZCByZXNldCBtb2RlbCB3aXRob3V0IHRvb2wgc3VwcG9ydCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vVG9vbHNNb2RlbCA9IGNyZWF0ZU1vZGVsKCduby10b29scycsICdOby1Ub29scycsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiBmYWxzZSwgYWdlbnRNb2RlOiBmYWxzZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB0b29sTW9kZWwgPSBjcmVhdGVNb2RlbCgndG9vbC1tb2RlbCcsICdUb29sIE1vZGVsJyk7XG5cdFx0XHRjb25zdCBhbGxNb2RlbHMgPSBbbm9Ub29sc01vZGVsLCB0b29sTW9kZWxdO1xuXG5cdFx0XHQvLyBJbiBBc2sgbW9kZSwgbW9kZWwgaXMgZmluZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KG5vVG9vbHNNb2RlbCwgYWxsTW9kZWxzLCB7XG5cdFx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdFx0Y3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sIGFsbE1vZGVscyksXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gQWZ0ZXIgc3dpdGNoaW5nIHRvIEFnZW50IG1vZGUsIG1vZGVsIHNob3VsZCBiZSByZXNldFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KG5vVG9vbHNNb2RlbCwgYWxsTW9kZWxzLCB7XG5cdFx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdFx0Y3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSwgYWxsTW9kZWxzKSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzd2l0Y2hpbmcgc2Vzc2lvbnMgc2hvdWxkIHJlamVjdCBtb2RlbCBmcm9tIHdyb25nIHNlc3Npb24gcG9vbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNsb3VkTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRcdGNvbnN0IGdlbmVyYWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBhbGxNb2RlbHMgPSBbZ2VuZXJhbE1vZGVsLCBjbG91ZE1vZGVsXTtcblxuXHRcdFx0Ly8gQ2xvdWQgbW9kZWwgaXMgdmFsaWQgaW4gY2xvdWQgc2Vzc2lvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRpc01vZGVsVmFsaWRGb3JTZXNzaW9uKGNsb3VkTW9kZWwsIGFsbE1vZGVscywgJ2Nsb3VkJyksXG5cdFx0XHRcdHRydWUsXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBDbG91ZCBtb2RlbCBpcyBOT1QgdmFsaWQgaW4gZ2VuZXJhbCBzZXNzaW9uIChubyBzZXNzaW9uIHR5cGUpXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGlzTW9kZWxWYWxpZEZvclNlc3Npb24oY2xvdWRNb2RlbCwgYWxsTW9kZWxzLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdCk7XG5cblx0XHRcdC8vIEdlbmVyYWwgbW9kZWwgaXMgTk9UIHZhbGlkIGluIGNsb3VkIHNlc3Npb24gKHdoZW4gY2xvdWQgbW9kZWxzIGV4aXN0KVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRpc01vZGVsVmFsaWRGb3JTZXNzaW9uKGdlbmVyYWxNb2RlbCwgYWxsTW9kZWxzLCAnY2xvdWQnKSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBHZW5lcmFsIG1vZGVsIElTIHZhbGlkIGluIGdlbmVyYWwgc2Vzc2lvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRpc01vZGVsVmFsaWRGb3JTZXNzaW9uKGdlbmVyYWxNb2RlbCwgYWxsTW9kZWxzLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vZGVsIHJlbW92YWwgc2hvdWxkIHRyaWdnZXIgcmVzZXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBncHQgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgY2xhdWRlID0gY3JlYXRlTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnKTtcblxuXHRcdFx0Ly8gSW5pdGlhbGx5IGJvdGggYXZhaWxhYmxlLCBHUFQgaXMgc2VsZWN0ZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0c2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChncHQsIFtncHQsIGNsYXVkZV0sIHtcblx0XHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0XHRjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSwgW2dwdCwgY2xhdWRlXSksXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gR1BUIGlzIHJlbW92ZWQgZnJvbSBhdmFpbGFibGUgbW9kZWxzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQoZ3B0LCBbY2xhdWRlXSwge1xuXHRcdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRcdGN1cnJlbnRNb2RlS2luZDogQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LCBbY2xhdWRlXSksXG5cdFx0XHRcdHRydWUsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3luY2luZyBtb2RlbCBmcm9tIHN0YXRlIHJlc3BlY3RzIHNlc3Npb24gYm91bmRhcmllcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNsb3VkTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRcdGNvbnN0IGdlbmVyYWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBhbGxNb2RlbHMgPSBbZ2VuZXJhbE1vZGVsLCBjbG91ZE1vZGVsXTtcblxuXHRcdFx0Ly8gU3RhdGUgaGFzIGEgY2xvdWQgbW9kZWwsIGJ1dCB3ZSBhcmUgaW4gYSBnZW5lcmFsIHNlc3Npb25cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVNb2RlbEZyb21TeW5jU3RhdGUoY2xvdWRNb2RlbCwgZ2VuZXJhbE1vZGVsLCBhbGxNb2RlbHMsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFjdGlvbiwgJ2RlZmF1bHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N5bmNpbmcgbW9kZWwgZnJvbSBzdGF0ZSBhcHBsaWVzIG1vZGVsIHdoZW4gc3dpdGNoaW5nIHRvIG1hdGNoaW5nIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbG91ZE1vZGVsID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZC1ncHQnLCAnQ2xvdWQgR1BUJywgJ2Nsb3VkJyk7XG5cdFx0XHRjb25zdCBnZW5lcmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgYWxsTW9kZWxzID0gW2dlbmVyYWxNb2RlbCwgY2xvdWRNb2RlbF07XG5cblx0XHRcdC8vIFN0YXRlIGhhcyBhIGNsb3VkIG1vZGVsIGFuZCB3ZSBhcmUgaW4gYSBjbG91ZCBzZXNzaW9uXG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlTW9kZWxGcm9tU3luY1N0YXRlKGNsb3VkTW9kZWwsIGdlbmVyYWxNb2RlbCwgYWxsTW9kZWxzLCAnY2xvdWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWN0aW9uLCAnYXBwbHknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbWJpbmluZyBtb2RlIHN3aXRjaCArIHNlc3Npb24gc3dpdGNoIHZhbGlkYXRlcyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbG91ZFRvb2xNb2RlbCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xvdWQtdG9vbCcsICdDbG91ZCBUb29sJywgJ2Nsb3VkJywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IHRydWUsIGFnZW50TW9kZTogdHJ1ZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjbG91ZE5vVG9vbE1vZGVsID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZC1iYXNpYycsICdDbG91ZCBCYXNpYycsICdjbG91ZCcsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiBmYWxzZSwgYWdlbnRNb2RlOiBmYWxzZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhbGxDbG91ZE1vZGVscyA9IFtjbG91ZFRvb2xNb2RlbCwgY2xvdWROb1Rvb2xNb2RlbF07XG5cblx0XHRcdC8vIEluIGNsb3VkIHNlc3Npb24sIEFnZW50IG1vZGUgXHUyMDE0IHRvb2wgbW9kZWwgaXMgdmFsaWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0c2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChjbG91ZFRvb2xNb2RlbCwgYWxsQ2xvdWRNb2RlbHMsIHtcblx0XHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0XHRjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZTogJ2Nsb3VkJyxcblx0XHRcdFx0fSwgYWxsQ2xvdWRNb2RlbHMpLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdCk7XG5cblx0XHRcdC8vIFRoZSBuby10b29sIG1vZGVsIHNob3VsZCBiZSByZXNldCBpbiBBZ2VudCBtb2RlXG5cdFx0XHQvLyBCb3RoIGZpbHRlck1vZGVsc0ZvclNlc3Npb24gYW5kIHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQgZW5mb3JjZSBtb2RlIHN1cHBvcnRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0c2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChjbG91ZE5vVG9vbE1vZGVsLCBhbGxDbG91ZE1vZGVscywge1xuXHRcdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRcdGN1cnJlbnRNb2RlS2luZDogQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlOiAnY2xvdWQnLFxuXHRcdFx0XHR9LCBhbGxDbG91ZE1vZGVscyksXG5cdFx0XHRcdHRydWUsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyByYWNlIGNvbmRpdGlvbnMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdtb2RlbCB0ZW1wb3JhcmlseSByZW1vdmVkIHRoZW4gcmUtYWRkZWQgbG9zZXMgdXNlciBjaG9pY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBncHQgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgY2xhdWRlID0gY3JlYXRlTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnKTtcblxuXHRcdFx0Ly8gU3RlcCAxOiBVc2VyIGhhcyBHUFQgc2VsZWN0ZWQsIGJvdGggbW9kZWxzIGF2YWlsYWJsZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0T25Nb2RlbExpc3RDaGFuZ2UoJ2NvcGlsb3QvZ3B0JywgW2dwdCwgY2xhdWRlXSksIGZhbHNlKTtcblxuXHRcdFx0Ly8gU3RlcCAyOiBFeHRlbnNpb24gcmVsb2FkcywgR1BUIHRlbXBvcmFyaWx5IGRpc2FwcGVhcnMgZnJvbSBtb2RlbCBsaXN0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSgnY29waWxvdC9ncHQnLCBbY2xhdWRlXSksIHRydWUpO1xuXHRcdFx0Ly8gXHUyMTkyIENoYXRJbnB1dFBhcnQgcmVzZXRzIHRvIGRlZmF1bHQgKENsYXVkZSlcblxuXHRcdFx0Ly8gU3RlcCAzOiBHUFQgY29tZXMgYmFjayBcdTIwMTQgYnV0IHRoZSBoYW5kbGVyIGp1c3QgY2hlY2tzIGlmIGN1cnJlbnQgaXMgc3RpbGwgdmFsaWQuXG5cdFx0XHQvLyBCeSBub3cgdGhlIGN1cnJlbnQgaXMgQ2xhdWRlIChmcm9tIHN0ZXAgMiksIHNvIGl0IHN0YXlzLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0T25Nb2RlbExpc3RDaGFuZ2UoJ2NvcGlsb3QvY2xhdWRlJywgW2dwdCwgY2xhdWRlXSksIGZhbHNlKTtcblx0XHRcdC8vIFx1MjE5MiBVc2VyJ3Mgb3JpZ2luYWwgR1BUIGNob2ljZSBpcyBsb3N0ISBUaGlzIGlzIHRoZSBcInJhbmRvbSBzd2l0Y2hcIiBidWcgcGF0dGVybi5cblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vZGVsIHN0YXlzIHdoZW4gbW9kZWwgbGlzdCByZWZyZXNoZXMgd2l0aCBpdCBzdGlsbCBwcmVzZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ3B0ID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGNsYXVkZSA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUnLCAnQ2xhdWRlJyk7XG5cblx0XHRcdC8vIE1vZGVsIGxpc3QgcmVmcmVzaGVzIGJ1dCBHUFQgaXMgc3RpbGwgdGhlcmVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE9uTW9kZWxMaXN0Q2hhbmdlKCdjb3BpbG90L2dwdCcsIFtncHQsIGNsYXVkZV0pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNldCB3aGVuIHRoZSBzZWxlY3RlZCBtb2RlbCBpcyBoaWRkZW4gZnJvbSB0aGUgYXZhaWxhYmxlIG1vZGVscycsICgpID0+IHtcblx0XHRcdGNvbnN0IGdwdCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBjbGF1ZGUgPSBjcmVhdGVNb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScpO1xuXHRcdFx0Y29uc3QgdmlzaWJsZU1vZGVscyA9IFtncHQsIGNsYXVkZV0uZmlsdGVyKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIgIT09IGdwdC5pZGVudGlmaWVyKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0T25Nb2RlbExpc3RDaGFuZ2UoZ3B0LmlkZW50aWZpZXIsIHZpc2libGVNb2RlbHMpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc2V0IHdoZW4gY3VycmVudCBtb2RlbCBpZGVudGlmaWVyIGlzIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGdwdCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSh1bmRlZmluZWQsIFtncHRdKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNldCB3aGVuIG1vZGVscyBsaXN0IGlzIGVtcHR5JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0T25Nb2RlbExpc3RDaGFuZ2UoJ2NvcGlsb3QvZ3B0JywgW10pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhY2hlIGJyaWRnZXMgdGhlIGdhcCB3aGVuIGxpdmUgbW9kZWxzIHRlbXBvcmFyaWx5IHVuYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FjaGVkR3B0ID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGNhY2hlZENsYXVkZSA9IGNyZWF0ZU1vZGVsKCdjbGF1ZGUnLCAnQ2xhdWRlJyk7XG5cblx0XHRcdC8vIFN0ZXAgMTogRXh0ZW5zaW9uIHVubG9hZGVkLCBubyBsaXZlIG1vZGVscy4gQ2FjaGUgZmlsbHMgdGhlIGdhcC5cblx0XHRcdGNvbnN0IG1lcmdlZCA9IG1lcmdlTW9kZWxzV2l0aENhY2hlKFtdLCBbY2FjaGVkR3B0LCBjYWNoZWRDbGF1ZGVdLCBuZXcgU2V0KFsnY29waWxvdCddKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVyZ2VkLmxlbmd0aCwgMik7XG5cblx0XHRcdC8vIFNlbGVjdGVkIG1vZGVsIGlzIHN0aWxsIGZvdW5kIGluIHRoZSBjYWNoZWQgbGlzdFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0T25Nb2RlbExpc3RDaGFuZ2UoJ2NvcGlsb3QvZ3B0JywgbWVyZ2VkKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FjaGUga2VwdCBldmVuIGZvciB1bmNvbnRyaWJ1dGVkIHZlbmRvcnMgd2hlbiBubyBsaXZlIG1vZGVscyBleGlzdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhY2hlZEdwdCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cblx0XHRcdC8vIFdoZW4gbGl2ZU1vZGVscyBpcyBlbXB0eSwgbWVyZ2VNb2RlbHNXaXRoQ2FjaGUgcmV0dXJucyBBTEwgY2FjaGVkXG5cdFx0XHQvLyBiZWNhdXNlIGl0IGNhbid0IGRpc3Rpbmd1aXNoIFwic3RhcnR1cCBub3QgcmVhZHlcIiBmcm9tIFwidmVuZG9yIHJlbW92ZWRcIlxuXHRcdFx0Y29uc3QgbWVyZ2VkID0gbWVyZ2VNb2RlbHNXaXRoQ2FjaGUoW10sIFtjYWNoZWRHcHRdLCBuZXcgU2V0KCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1lcmdlZC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0T25Nb2RlbExpc3RDaGFuZ2UoJ2NvcGlsb3QvZ3B0JywgbWVyZ2VkKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FjaGUgZXZpY3RlZCBmb3IgdW5jb250cmlidXRlZCB2ZW5kb3Igb25jZSBsaXZlIG1vZGVscyBhcnJpdmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYWNoZWRHcHQgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgbGl2ZU90aGVyID0gY3JlYXRlTW9kZWwoJ290aGVyJywgJ090aGVyJywgeyB2ZW5kb3I6ICdvdGhlci12ZW5kb3InIH0pO1xuXG5cdFx0XHQvLyBPbmNlIGxpdmUgbW9kZWxzIGV4aXN0LCB0aGUgdmVuZG9yIGZpbHRlciBraWNrcyBpblxuXHRcdFx0Y29uc3QgbWVyZ2VkID0gbWVyZ2VNb2RlbHNXaXRoQ2FjaGUoW2xpdmVPdGhlcl0sIFtjYWNoZWRHcHRdLCBuZXcgU2V0KFsnb3RoZXItdmVuZG9yJ10pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZXJnZWQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZXJnZWRbMF0ubWV0YWRhdGEuaWQsICdvdGhlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0T25Nb2RlbExpc3RDaGFuZ2UoJ2NvcGlsb3QvZ3B0JywgbWVyZ2VkKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmdWxsIHN0YXJ0dXAgcGlwZWxpbmUgKGNvbXB1dGVBdmFpbGFibGVNb2RlbHMpJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc3RhcnR1cCB3aXRoIG9ubHkgY2FjaGVkIG1vZGVscyByZXR1cm5zIGZpbHRlcmVkIGNhY2hlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FjaGVkID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVBdmFpbGFibGVNb2RlbHMoXG5cdFx0XHRcdFtdLCAvLyBubyBsaXZlIG1vZGVscyB5ZXRcblx0XHRcdFx0W2NhY2hlZF0sXG5cdFx0XHRcdG5ldyBTZXQoWydjb3BpbG90J10pLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCksIFsnZ3B0J10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RhcnR1cCB3aXRoIGNhY2hlZCBtb2RlbHMgZnJvbSByZW1vdmVkIHZlbmRvciBzdGlsbCByZXR1cm5zIHRoZW0gKG5vIGxpdmUgdG8gY29tcGFyZSknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYWNoZWQgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Ly8gV2hlbiBsaXZlTW9kZWxzIGlzIGVtcHR5LCBtZXJnZU1vZGVsc1dpdGhDYWNoZSByZXR1cm5zIEFMTCBjYWNoZWRcblx0XHRcdC8vIGJlY2F1c2UgaXQgY2Fubm90IHRlbGwgc3RhcnR1cC1kZWxheSBmcm9tIHZlbmRvciByZW1vdmFsXG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQXZhaWxhYmxlTW9kZWxzKFxuXHRcdFx0XHRbXSwgLy8gbm8gbGl2ZSBtb2RlbHNcblx0XHRcdFx0W2NhY2hlZF0sXG5cdFx0XHRcdG5ldyBTZXQoKSwgLy8gdmVuZG9yIG5vIGxvbmdlciBjb250cmlidXRlZFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCksIFsnZ3B0J10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGl2ZSBtb2RlbHMgc3VwZXJzZWRlIGNhY2hlZCBtb2RlbHMgZnJvbSBzYW1lIHZlbmRvcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGxpdmUgPSBjcmVhdGVNb2RlbCgnZ3B0LW5ldycsICdHUFQgTmV3Jyk7XG5cdFx0XHRjb25zdCBjYWNoZWQgPSBjcmVhdGVNb2RlbCgnZ3B0LW9sZCcsICdHUFQgT2xkJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQXZhaWxhYmxlTW9kZWxzKFxuXHRcdFx0XHRbbGl2ZV0sXG5cdFx0XHRcdFtjYWNoZWRdLFxuXHRcdFx0XHRuZXcgU2V0KFsnY29waWxvdCddKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLCBbJ2dwdC1uZXcnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJ0aWFsIHZlbmRvciByZXNvbHV0aW9uIGtlZXBzIHVucmVzb2x2ZWQgdmVuZG9ycyBmcm9tIGNhY2hlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGl2ZUEgPSBjcmVhdGVNb2RlbCgnYS1tb2RlbCcsICdBIE1vZGVsJywgeyB2ZW5kb3I6ICd2ZW5kb3ItYScgfSk7XG5cdFx0XHRjb25zdCBjYWNoZWRCID0gY3JlYXRlTW9kZWwoJ2ItbW9kZWwnLCAnQiBNb2RlbCcsIHsgdmVuZG9yOiAndmVuZG9yLWInIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUF2YWlsYWJsZU1vZGVscyhcblx0XHRcdFx0W2xpdmVBXSxcblx0XHRcdFx0W2NhY2hlZEJdLFxuXHRcdFx0XHRuZXcgU2V0KFsndmVuZG9yLWEnLCAndmVuZG9yLWInXSksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0Q2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKS5zb3J0KCksIFsnYS1tb2RlbCcsICdiLW1vZGVsJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdWx0cyBhcmUgc29ydGVkIGFscGhhYmV0aWNhbGx5IGJ5IG5hbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbEMgPSBjcmVhdGVNb2RlbCgnYycsICdDaGFybGllJyk7XG5cdFx0XHRjb25zdCBtb2RlbEEgPSBjcmVhdGVNb2RlbCgnYScsICdBbHBoYScpO1xuXHRcdFx0Y29uc3QgbW9kZWxCID0gY3JlYXRlTW9kZWwoJ2InLCAnQnJhdm8nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVBdmFpbGFibGVNb2RlbHMoXG5cdFx0XHRcdFttb2RlbEMsIG1vZGVsQSwgbW9kZWxCXSxcblx0XHRcdFx0W10sXG5cdFx0XHRcdG5ldyBTZXQoWydjb3BpbG90J10pLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKG0gPT4gbS5tZXRhZGF0YS5uYW1lKSwgWydBbHBoYScsICdCcmF2bycsICdDaGFybGllJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2Vzc2lvbi10YXJnZXRlZCBtb2RlbHMgZXhjbHVkZWQgZnJvbSBnZW5lcmFsIHNlc3Npb24gc3RhcnR1cCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGdlbmVyYWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgY2xvdWRPbmx5ID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZCcsICdDbG91ZCcsICdjbG91ZCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUF2YWlsYWJsZU1vZGVscyhcblx0XHRcdFx0W2dlbmVyYWwsIGNsb3VkT25seV0sXG5cdFx0XHRcdFtdLFxuXHRcdFx0XHRuZXcgU2V0KFsnY29waWxvdCddKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLCBbJ2dwdCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29ubHkgc2Vzc2lvbi10YXJnZXRlZCBtb2RlbHMgcmV0dXJuZWQgZm9yIGNsb3VkIHNlc3Npb24gc3RhcnR1cCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGdlbmVyYWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgY2xvdWRPbmx5ID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZCcsICdDbG91ZCcsICdjbG91ZCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUF2YWlsYWJsZU1vZGVscyhcblx0XHRcdFx0W2dlbmVyYWwsIGNsb3VkT25seV0sXG5cdFx0XHRcdFtdLFxuXHRcdFx0XHRuZXcgU2V0KFsnY29waWxvdCddKSxcblx0XHRcdFx0J2Nsb3VkJyxcblx0XHRcdFx0Q2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKSwgWydjbG91ZCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FnZW50IG1vZGUgZmlsdGVycyBub24tdG9vbCBtb2RlbHMgZHVyaW5nIHN0YXJ0dXAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sTW9kZWwgPSBjcmVhdGVNb2RlbCgndG9vbCcsICdUb29sIE1vZGVsJyk7XG5cdFx0XHRjb25zdCBub1Rvb2xNb2RlbCA9IGNyZWF0ZU1vZGVsKCduby10b29sJywgJ05vIFRvb2wnLCB7XG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogZmFsc2UsIGFnZW50TW9kZTogZmFsc2UgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUF2YWlsYWJsZU1vZGVscyhcblx0XHRcdFx0W3Rvb2xNb2RlbCwgbm9Ub29sTW9kZWxdLFxuXHRcdFx0XHRbXSxcblx0XHRcdFx0bmV3IFNldChbJ2NvcGlsb3QnXSksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0Q2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLCBbJ3Rvb2wnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdGFydHVwL2V4dGVuc2lvbiByZWxvYWQgd2l0aCBubyBjb250cmlidXRvcnMgeWV0IHByZXNlcnZlcyBjYWNoZSAocHJvZHVjdGlvbiBwYXRoKScsICgpID0+IHtcblx0XHRcdC8vIE1pcnJvcnMgY2hhdElucHV0UGFydC5nZXRBbGxNZXJnZWRNb2RlbHMgYXQgYSBtb21lbnQgd2hlbiBnZXRWZW5kb3JzKClcblx0XHRcdC8vIGlzIHRlbXBvcmFyaWx5IGVtcHR5IChleHRlbnNpb24gaG9zdCByZWxvYWRpbmcpLiByZXNvbHZlZFZlbmRvcnMgaXNcblx0XHRcdC8vIGFsc28gZW1wdHkgYmVjYXVzZSBub3RoaW5nIGhhcyByZXNvbHZlZC4gVGhlIHBpY2tlciBtdXN0IGNvbnRpbnVlIHRvXG5cdFx0XHQvLyBzaG93IGNhY2hlZCBtb2RlbHMgc28gdGhlIHVzZXIncyBzZWxlY3Rpb24gaXNuJ3QgcmVzZXQuXG5cdFx0XHRjb25zdCBjYWNoZWRBID0gY3JlYXRlTW9kZWwoJ2EtbW9kZWwnLCAnQSBNb2RlbCcsIHsgdmVuZG9yOiAndmVuZG9yLWEnIH0pO1xuXHRcdFx0Y29uc3QgY2FjaGVkQiA9IGNyZWF0ZU1vZGVsKCdiLW1vZGVsJywgJ0IgTW9kZWwnLCB7IHZlbmRvcjogJ3ZlbmRvci1iJyB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVBdmFpbGFibGVNb2RlbHMoXG5cdFx0XHRcdFtdLFxuXHRcdFx0XHRbY2FjaGVkQSwgY2FjaGVkQl0sXG5cdFx0XHRcdG5ldyBTZXQoKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRuZXcgU2V0KCksXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCkuc29ydCgpLCBbJ2EtbW9kZWwnLCAnYi1tb2RlbCddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ19zeW5jRnJvbU1vZGVsIGVkZ2UgY2FzZXMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzeW5jIHN0YXRlIHdpdGggdW5kZWZpbmVkIHNlbGVjdGVkTW9kZWwga2VlcHMgY3VycmVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Ly8gV2hlbiBzdGF0ZSBoYXMgbm8gc2VsZWN0ZWRNb2RlbCwgX3N5bmNGcm9tTW9kZWwgc2tpcHMgdGhlIG1vZGVsIHN5bmNcblx0XHRcdC8vICh0aGUgY29kZSBjaGVja3MgYGlmIChzdGF0ZT8uc2VsZWN0ZWRNb2RlbClgKVxuXHRcdFx0Ly8gVGhpcyBtZWFucyB0aGUgY3VycmVudCBtb2RlbCBzdGF5cyBcdTIwMTQgdGVzdCB0aGF0IHJlc29sdmVNb2RlbEZyb21TeW5jU3RhdGVcblx0XHRcdC8vIGNvcnJlY3RseSBpZGVudGlmaWVzIFwia2VlcFwiIGZvciBzYW1lIG1vZGVsXG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlTW9kZWxGcm9tU3luY1N0YXRlKGN1cnJlbnQsIGN1cnJlbnQsIFtjdXJyZW50XSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWN0aW9uLCAna2VlcCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3luYyBzdGF0ZSBtb2RlbCBmcm9tIGRpZmZlcmVudCBzZXNzaW9uIGRvZXMgbm90IGFwcGx5JywgKCkgPT4ge1xuXHRcdFx0Ly8gU2NlbmFyaW86IFVzZXIgaXMgaW4gc2Vzc2lvbiBBIHdpdGggY2xvdWQgbW9kZWwsIHN3aXRjaGVzIHRvIHNlc3Npb24gQiAoZ2VuZXJhbClcblx0XHRcdC8vIFNlc3Npb24gQidzIHN0YXRlIHN0aWxsIGhhcyB0aGUgY2xvdWQgbW9kZWwgcmVmZXJlbmNlXG5cdFx0XHRjb25zdCBjbG91ZE1vZGVsID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZC1ncHQnLCAnQ2xvdWQgR1BUJywgJ2Nsb3VkJyk7XG5cdFx0XHRjb25zdCBnZW5lcmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgYWxsTW9kZWxzID0gW2dlbmVyYWxNb2RlbCwgY2xvdWRNb2RlbF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVNb2RlbEZyb21TeW5jU3RhdGUoY2xvdWRNb2RlbCwgZ2VuZXJhbE1vZGVsLCBhbGxNb2RlbHMsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFjdGlvbiwgJ2RlZmF1bHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N5bmMgc3RhdGUgd2l0aCBtb2RlbCBtYXRjaGluZyBkaWZmZXJlbnQgc2Vzc2lvbiB0eXBlIGZhbGxzIGJhY2sgdG8gZGVmYXVsdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGVudGVycHJpc2VNb2RlbCA9IGNyZWF0ZVNlc3Npb25Nb2RlbCgnZW50LWdwdCcsICdFbnRlcnByaXNlIEdQVCcsICdlbnRlcnByaXNlJyk7XG5cdFx0XHRjb25zdCBjbG91ZE1vZGVsID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZC1ncHQnLCAnQ2xvdWQgR1BUJywgJ2Nsb3VkJyk7XG5cdFx0XHRjb25zdCBhbGxNb2RlbHMgPSBbY2xvdWRNb2RlbCwgZW50ZXJwcmlzZU1vZGVsXTtcblxuXHRcdFx0Ly8gU3RhdGUgaGFzIGVudGVycHJpc2UgbW9kZWwsIGJ1dCB3ZSdyZSBpbiBjbG91ZCBzZXNzaW9uXG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlTW9kZWxGcm9tU3luY1N0YXRlKGVudGVycHJpc2VNb2RlbCwgY2xvdWRNb2RlbCwgYWxsTW9kZWxzLCAnY2xvdWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWN0aW9uLCAnZGVmYXVsdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3luYyBpZGVudGljYWwgbW9kZWwgcmVmZXJlbmNlIHJldHVybnMga2VlcCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdC8vIFNhbWUgb2JqZWN0IHJlZmVyZW5jZVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZU1vZGVsRnJvbVN5bmNTdGF0ZShtb2RlbCwgbW9kZWwsIFttb2RlbF0sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFjdGlvbiwgJ2tlZXAnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N5bmMgc2FtZSBpZGVudGlmaWVyIGJ1dCBkaWZmZXJlbnQgb2JqZWN0IHJldHVybnMga2VlcCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsMSA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBtb2RlbDIgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Ly8gRGlmZmVyZW50IG9iamVjdHMsIHNhbWUgaWRlbnRpZmllclxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZU1vZGVsRnJvbVN5bmNTdGF0ZShtb2RlbDEsIG1vZGVsMiwgW21vZGVsMSwgbW9kZWwyXSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWN0aW9uLCAna2VlcCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY2hlY2tNb2RlbFN1cHBvcnRlZCBpbnRlcmFjdGlvbiBwYXR0ZXJucycsICgpID0+IHtcblxuXHRcdGNvbnN0IGFza0NvbnRleHQgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGN1cnJlbnRNb2RlS2luZDogQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdHNlc3Npb25UeXBlOiB1bmRlZmluZWQsXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFnZW50Q29udGV4dCA9IHtcblx0XHRcdC4uLmFza0NvbnRleHQsXG5cdFx0XHRjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHR9O1xuXG5cdFx0dGVzdCgncmVzdG9yZWQgbW9kZWwgcGFzc2VzIEFnZW50IGNvbXBhdGliaWxpdHkgY2hlY2snLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudE1vZGVsID0gY3JlYXRlTW9kZWwoJ2FnZW50LW1vZGVsJywgJ0FnZW50IE1vZGVsJywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IHRydWUsIGFnZW50TW9kZTogdHJ1ZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChhZ2VudE1vZGVsLCBbYWdlbnRNb2RlbF0sIGFnZW50Q29udGV4dCwgW2FnZW50TW9kZWxdKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdG9yZWQgbW9kZWwgdGhhdCBmYWlscyBBZ2VudCBjb21wYXRpYmlsaXR5IHJlc2V0cyB0byBhbiBBZ2VudCBtb2RlbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGFza09ubHlNb2RlbCA9IGNyZWF0ZU1vZGVsKCdhc2stb25seScsICdBc2sgT25seScsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiBmYWxzZSwgYWdlbnRNb2RlOiBmYWxzZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhZ2VudE1vZGVsID0gY3JlYXRlTW9kZWwoJ2FnZW50LW1vZGVsJywgJ0FnZW50IE1vZGVsJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KGFza09ubHlNb2RlbCwgW2Fza09ubHlNb2RlbCwgYWdlbnRNb2RlbF0sIGFnZW50Q29udGV4dCwgW2Fza09ubHlNb2RlbCwgYWdlbnRNb2RlbF0pLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgYWdlbnRDb21wYXRpYmxlTW9kZWxzID0gZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbihcblx0XHRcdFx0W2Fza09ubHlNb2RlbCwgYWdlbnRNb2RlbF0sIHVuZGVmaW5lZCwgQ2hhdE1vZGVLaW5kLkFnZW50LCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGRlZmF1bHRNb2RlbCA9IGZpbmREZWZhdWx0TW9kZWwoYWdlbnRDb21wYXRpYmxlTW9kZWxzLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZhdWx0TW9kZWw/Lm1ldGFkYXRhLmlkLCAnYWdlbnQtbW9kZWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vZGUgc3dpdGNoIHRyaWdnZXJzIGNoZWNrTW9kZWxTdXBwb3J0ZWQgd2hpY2ggcmVzZXRzIGluY29tcGF0aWJsZSBtb2RlbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vVG9vbE1vZGVsID0gY3JlYXRlTW9kZWwoJ25vLXRvb2wnLCAnTm8gVG9vbCcsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiBmYWxzZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB0b29sTW9kZWwgPSBjcmVhdGVNb2RlbCgndG9vbCcsICdUb29sJyk7XG5cblx0XHRcdC8vIEluIEFzayBtb2RlOiBmaW5lXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChub1Rvb2xNb2RlbCwgW25vVG9vbE1vZGVsLCB0b29sTW9kZWxdLCBhc2tDb250ZXh0LCBbbm9Ub29sTW9kZWwsIHRvb2xNb2RlbF0pLCBmYWxzZSk7XG5cblx0XHRcdC8vIFN3aXRjaCB0byBBZ2VudCBtb2RlOiBub3QgZmluZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQobm9Ub29sTW9kZWwsIFtub1Rvb2xNb2RlbCwgdG9vbE1vZGVsXSwgYWdlbnRDb250ZXh0LCBbbm9Ub29sTW9kZWwsIHRvb2xNb2RlbF0pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvdWJsZSByZXNldCBpcyBpZGVtcG90ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmYXVsdE1vZGVsID0gY3JlYXRlRGVmYXVsdE1vZGVsRm9yTG9jYXRpb24oJ2RlZmF1bHQnLCAnRGVmYXVsdCcsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0Y29uc3Qgb3RoZXJNb2RlbCA9IGNyZWF0ZU1vZGVsKCdvdGhlcicsICdPdGhlcicpO1xuXHRcdFx0Y29uc3QgYWxsTW9kZWxzID0gW2RlZmF1bHRNb2RlbCwgb3RoZXJNb2RlbF07XG5cblx0XHRcdC8vIEZpcnN0IHJlc2V0OiBwaWNrcyBkZWZhdWx0XG5cdFx0XHRjb25zdCByZXN1bHQxID0gZmluZERlZmF1bHRNb2RlbChhbGxNb2RlbHMsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDE/Lm1ldGFkYXRhLmlkLCAnZGVmYXVsdCcpO1xuXG5cdFx0XHQvLyBcIlNlY29uZCByZXNldFwiIFx1MjAxNCBzYW1lIGNhbGwsIHNhbWUgcmVzdWx0XG5cdFx0XHRjb25zdCByZXN1bHQyID0gZmluZERlZmF1bHRNb2RlbChhbGxNb2RlbHMsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDI/Lm1ldGFkYXRhLmlkLCAnZGVmYXVsdCcpO1xuXG5cdFx0XHQvLyBEZWZhdWx0IG1vZGVsIGNvbnRpbnVlcyB0byBwYXNzIHZhbGlkYXRpb25cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KHJlc3VsdDEhLCBhbGxNb2RlbHMsIGFza0NvbnRleHQsIGFsbE1vZGVscyksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ211bHRpcGxlIHNlc3Npb24gdHlwZXMgYW5kIGNyb3NzLWNvbnRhbWluYXRpb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdtb2RlbCBmcm9tIHNlc3Npb24gQSByZWplY3RlZCBpbiBzZXNzaW9uIEInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbG91ZE1vZGVsID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZC1ncHQnLCAnQ2xvdWQgR1BUJywgJ2Nsb3VkJyk7XG5cdFx0XHRjb25zdCBlbnRlcnByaXNlTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2VudC1ncHQnLCAnRW50ZXJwcmlzZSBHUFQnLCAnZW50ZXJwcmlzZScpO1xuXHRcdFx0Y29uc3QgZ2VuZXJhbE1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtnZW5lcmFsTW9kZWwsIGNsb3VkTW9kZWwsIGVudGVycHJpc2VNb2RlbF07XG5cblx0XHRcdC8vIENsb3VkIG1vZGVsIG5vdCB2YWxpZCBpbiBlbnRlcnByaXNlIHNlc3Npb25cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsVmFsaWRGb3JTZXNzaW9uKGNsb3VkTW9kZWwsIGFsbE1vZGVscywgJ2VudGVycHJpc2UnKSwgZmFsc2UpO1xuXHRcdFx0Ly8gRW50ZXJwcmlzZSBtb2RlbCBub3QgdmFsaWQgaW4gY2xvdWQgc2Vzc2lvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxWYWxpZEZvclNlc3Npb24oZW50ZXJwcmlzZU1vZGVsLCBhbGxNb2RlbHMsICdjbG91ZCcpLCBmYWxzZSk7XG5cdFx0XHQvLyBHZW5lcmFsIG1vZGVsIG5vdCB2YWxpZCB3aGVuIHNlc3Npb24tdGFyZ2V0ZWQgbW9kZWxzIGV4aXN0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbFZhbGlkRm9yU2Vzc2lvbihnZW5lcmFsTW9kZWwsIGFsbE1vZGVscywgJ2Nsb3VkJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dlbmVyYWwgbW9kZWwgaXMgdmFsaWQgd2hlbiBzZXNzaW9uIHR5cGUgaGFzIG5vIHRhcmdldGVkIG1vZGVscycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNsb3VkTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRcdGNvbnN0IGdlbmVyYWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBhbGxNb2RlbHMgPSBbZ2VuZXJhbE1vZGVsLCBjbG91ZE1vZGVsXTtcblxuXHRcdFx0Ly8gJ2VudGVycHJpc2UnIHNlc3Npb24gaGFzIG5vIHRhcmdldGVkIG1vZGVsc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxWYWxpZEZvclNlc3Npb24oZ2VuZXJhbE1vZGVsLCBhbGxNb2RlbHMsICdlbnRlcnByaXNlJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbiBpc29sYXRlcyBzZXNzaW9uIHR5cGVzIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRcdGNvbnN0IGdlbmVyYWwgPSBjcmVhdGVNb2RlbCgnZ3B0JywgJ0dQVCcpO1xuXHRcdFx0Y29uc3QgY2xvdWQgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRcdGNvbnN0IGVudGVycHJpc2UgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2VudC1ncHQnLCAnRW50ZXJwcmlzZSBHUFQnLCAnZW50ZXJwcmlzZScpO1xuXHRcdFx0Y29uc3QgYWxsTW9kZWxzID0gW2dlbmVyYWwsIGNsb3VkLCBlbnRlcnByaXNlXTtcblxuXHRcdFx0Y29uc3QgY2xvdWRGaWx0ZXJlZCA9IGZpbHRlck1vZGVsc0ZvclNlc3Npb24oYWxsTW9kZWxzLCAnY2xvdWQnLCBDaGF0TW9kZUtpbmQuQXNrLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xvdWRGaWx0ZXJlZC5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKSwgWydjbG91ZC1ncHQnXSk7XG5cblx0XHRcdGNvbnN0IGVudEZpbHRlcmVkID0gZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbihhbGxNb2RlbHMsICdlbnRlcnByaXNlJywgQ2hhdE1vZGVLaW5kLkFzaywgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudEZpbHRlcmVkLm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLCBbJ2VudC1ncHQnXSk7XG5cblx0XHRcdGNvbnN0IGdlbmVyYWxGaWx0ZXJlZCA9IGZpbHRlck1vZGVsc0ZvclNlc3Npb24oYWxsTW9kZWxzLCB1bmRlZmluZWQsIENoYXRNb2RlS2luZC5Bc2ssIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZW5lcmFsRmlsdGVyZWQubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCksIFsnZ3B0J10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3dpdGNoaW5nIGZyb20gY2xvdWQgdG8gZ2VuZXJhbCBzZXNzaW9uIHJlc2V0cyBjbG91ZCBtb2RlbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNsb3VkTW9kZWwgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ2Nsb3VkLWdwdCcsICdDbG91ZCBHUFQnLCAnY2xvdWQnKTtcblx0XHRcdGNvbnN0IGdlbmVyYWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBhbGxNb2RlbHMgPSBbZ2VuZXJhbE1vZGVsLCBjbG91ZE1vZGVsXTtcblxuXHRcdFx0Ly8gSW4gY2xvdWQgc2Vzc2lvbiwgY2xvdWQgbW9kZWwgaXMgdmFsaWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KGNsb3VkTW9kZWwsIFtjbG91ZE1vZGVsXSwge1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0Y3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRzZXNzaW9uVHlwZTogJ2Nsb3VkJyxcblx0XHRcdH0sIGFsbE1vZGVscyksIGZhbHNlKTtcblxuXHRcdFx0Ly8gU3dpdGNoIHRvIGdlbmVyYWwgc2Vzc2lvbiBcdTIwMTQgY2xvdWQgbW9kZWwgc2hvdWxkIGJlIHJlc2V0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChjbG91ZE1vZGVsLCBbZ2VuZXJhbE1vZGVsXSwge1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0Y3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRzZXNzaW9uVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0fSwgYWxsTW9kZWxzKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtb2RlIHdpdGggZm9yY2VkIG1vZGVsIChtb2RlLm1vZGVsIHByb3BlcnR5KScsICgpID0+IHtcblxuXHRcdHRlc3QoJ21vZGUgZm9yY2VzIG1vZGVsIFx1MjAxNCBzaW11bGF0aW5nIHN3aXRjaE1vZGVsQnlRdWFsaWZpZWROYW1lIHN1Y2Nlc3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBncHQgPSBjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpO1xuXHRcdFx0Y29uc3QgY2xhdWRlID0gY3JlYXRlTW9kZWwoJ2NsYXVkZScsICdDbGF1ZGUnKTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtncHQsIGNsYXVkZV07XG5cblx0XHRcdC8vIFRoZSBhdXRvcnVuIGNhbGxzIHN3aXRjaE1vZGVsQnlRdWFsaWZpZWROYW1lIHdoaWNoIGNoZWNrcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YS5tYXRjaGVzUXVhbGlmaWVkTmFtZVxuXHRcdFx0Ly8gU2ltdWxhdGU6IG1vZGUgd2FudHMgXCJHUFQtNG8gKGNvcGlsb3QpXCJcblx0XHRcdGNvbnN0IHF1YWxpZmllZE5hbWUgPSAnR1BULTRvIChjb3BpbG90KSc7XG5cdFx0XHRjb25zdCBtYXRjaCA9IGFsbE1vZGVscy5maW5kKG0gPT4gSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEubWF0Y2hlc1F1YWxpZmllZE5hbWUocXVhbGlmaWVkTmFtZSwgbS5tZXRhZGF0YSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoPy5tZXRhZGF0YS5pZCwgJ2dwdC00bycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZSBmb3JjZXMgbW9kZWwgXHUyMDE0IGNvcGlsb3QgdmVuZG9yIHNob3J0aGFuZCB3b3JrcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGdwdCA9IGNyZWF0ZU1vZGVsKCdncHQtNG8nLCAnR1BULTRvJyk7XG5cdFx0XHQvLyBGb3IgY29waWxvdCB2ZW5kb3IsIGp1c3QgdGhlIG5hbWUgd29ya3Ncblx0XHRcdGNvbnN0IG1hdGNoID0gW2dwdF0uZmluZChtID0+IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLm1hdGNoZXNRdWFsaWZpZWROYW1lKCdHUFQtNG8nLCBtLm1ldGFkYXRhKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2g/Lm1ldGFkYXRhLmlkLCAnZ3B0LTRvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlIGZvcmNlcyBtb2RlbCBcdTIwMTQgbm9uZXhpc3RlbnQgbW9kZWwgZ3JhY2VmdWxseSBtaXNzZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBncHQgPSBjcmVhdGVNb2RlbCgnZ3B0LTRvJywgJ0dQVC00bycpO1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSBbZ3B0XS5maW5kKG0gPT4gSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEubWF0Y2hlc1F1YWxpZmllZE5hbWUoJ05vbkV4aXN0ZW50IChjb3BpbG90KScsIG0ubWV0YWRhdGEpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vZGUgZm9yY2VzIG1vZGVsIHRoYXQgaXMgdGhlbiBjaGVja2VkIGZvciBzdXBwb3J0JywgKCkgPT4ge1xuXHRcdFx0Ly8gTW9kZSBmb3JjZXMgYSBtb2RlbCwgdGhlbiBjaGVja01vZGVsU3VwcG9ydGVkIHJ1bnNcblx0XHRcdGNvbnN0IGZvcmNlZE1vZGVsID0gY3JlYXRlTW9kZWwoJ2ZvcmNlZCcsICdGb3JjZWQnLCB7XG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogZmFsc2UsIGFnZW50TW9kZTogZmFsc2UgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBNb2RlIGZvcmNlZCB0aGlzIG1vZGVsIGJ1dCB3ZSdyZSBpbiBBZ2VudCBtb2RlIFx1MjAxNCBzaG91bGQgYmUgcmVzZXRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KGZvcmNlZE1vZGVsLCBbZm9yY2VkTW9kZWxdLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0c2Vzc2lvblR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdH0sIFtmb3JjZWRNb2RlbF0pLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0VkaXRvcklubGluZSArIG1vZGUgY29tYmluZWQgc2NlbmFyaW9zJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnRWRpdG9ySW5saW5lICsgQWdlbnQgcmVxdWlyZXMgYm90aCBhZ2VudE1vZGUgYW5kIHRvb2xDYWxsaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFydGlhbE1vZGVsID0gY3JlYXRlTW9kZWwoJ3BhcnRpYWwnLCAnUGFydGlhbCcsIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiB0cnVlLCBhZ2VudE1vZGU6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblx0XHRcdC8vIEZhaWxzIEFnZW50IG1vZGUgY2hlY2tcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsU3VwcG9ydGVkRm9yTW9kZShwYXJ0aWFsTW9kZWwsIENoYXRNb2RlS2luZC5BZ2VudCksIGZhbHNlKTtcblx0XHRcdC8vIFBhc3NlcyBpbmxpbmUgY2hhdCBjaGVjayAoaGFzIHRvb2xDYWxsaW5nKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTW9kZWxTdXBwb3J0ZWRGb3JJbmxpbmVDaGF0KHBhcnRpYWxNb2RlbCwgQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lKSwgdHJ1ZSk7XG5cblx0XHRcdC8vIENvbWJpbmVkOiBzaG91bGQgcmVzZXQgYmVjYXVzZSBBZ2VudCBtb2RlIGZhaWxzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChwYXJ0aWFsTW9kZWwsIFtwYXJ0aWFsTW9kZWxdLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUsXG5cdFx0XHRcdGN1cnJlbnRNb2RlS2luZDogQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0XHRzZXNzaW9uVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0fSwgW3BhcnRpYWxNb2RlbF0pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0VkaXRvcklubGluZSArIEFzayBvbmx5IHJlcXVpcmVzIHRvb2xDYWxsaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbE1vZGVsID0gY3JlYXRlTW9kZWwoJ3Rvb2wnLCAnVG9vbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQodG9vbE1vZGVsLCBbdG9vbE1vZGVsXSwge1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lLFxuXHRcdFx0XHRjdXJyZW50TW9kZUtpbmQ6IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdHNlc3Npb25UeXBlOiB1bmRlZmluZWQsXG5cdFx0XHR9LCBbdG9vbE1vZGVsXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0VkaXRvcklubGluZSArIEFzayByZWplY3RzIG1vZGVsIHdpdGhvdXQgdG9vbENhbGxpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub1Rvb2xNb2RlbCA9IGNyZWF0ZU1vZGVsKCduby10b29sJywgJ05vIFRvb2wnLCB7XG5cdFx0XHRcdGNhcGFiaWxpdGllczoge30sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KG5vVG9vbE1vZGVsLCBbbm9Ub29sTW9kZWxdLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUsXG5cdFx0XHRcdGN1cnJlbnRNb2RlS2luZDogQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0c2Vzc2lvblR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdH0sIFtub1Rvb2xNb2RlbF0pLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZpbmREZWZhdWx0TW9kZWwgZWRnZSBjYXNlcycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3doZW4gYWxsIG1vZGVscyBhcmUgc2Vzc2lvbi10YXJnZXRlZCBhbmQgbm9uZSBpcyBkZWZhdWx0LCBmaXJzdCBtb2RlbCB3aW5zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbTEgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ3MxJywgJ1Nlc3Npb24gMScsICdjbG91ZCcpO1xuXHRcdFx0Y29uc3QgbTIgPSBjcmVhdGVTZXNzaW9uTW9kZWwoJ3MyJywgJ1Nlc3Npb24gMicsICdjbG91ZCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZERlZmF1bHRNb2RlbChbbTEsIG0yXSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py5tZXRhZGF0YS5pZCwgJ3MxJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWZhdWx0IGZvciBvbmUgbG9jYXRpb24gZG9lcyBub3QgbGVhayB0byBhbm90aGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2hhdERlZmF1bHQgPSBjcmVhdGVEZWZhdWx0TW9kZWxGb3JMb2NhdGlvbignY2hhdC1kZWYnLCAnQ2hhdCBEZWZhdWx0JywgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRjb25zdCBub0RlZmF1bHQgPSBjcmVhdGVNb2RlbCgnbm8tZGVmJywgJ05vIERlZmF1bHQnKTtcblxuXHRcdFx0Ly8gRm9yIENoYXQ6IGNoYXREZWZhdWx0IHdpbnNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kRGVmYXVsdE1vZGVsKFtub0RlZmF1bHQsIGNoYXREZWZhdWx0XSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk/Lm1ldGFkYXRhLmlkLCAnY2hhdC1kZWYnKTtcblx0XHRcdC8vIEZvciBUZXJtaW5hbDogbm8gbW9kZWwgaXMgZGVmYXVsdCwgc28gZmlyc3QgbW9kZWwgd2luc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmREZWZhdWx0TW9kZWwoW25vRGVmYXVsdCwgY2hhdERlZmF1bHRdLCBDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbCk/Lm1ldGFkYXRhLmlkLCAnbm8tZGVmJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZWFsaXN0aWMgbXVsdGktc3RlcCByYWNlIHNpbXVsYXRpb25zJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc3RhcnR1cDogY2FjaGVkIG1vZGVsIFx1MjE5MiBsaXZlIG1vZGVscyBhcnJpdmUgXHUyMTkyIHVzZXIgY2hvaWNlIHByZXNlcnZlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhY2hlZEdwdCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBjYWNoZWRDbGF1ZGUgPSBjcmVhdGVNb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScpO1xuXG5cdFx0XHQvLyBTdGVwIDE6IFN0YXJ0dXAgd2l0aCBvbmx5IGNhY2hlLiBVc2VyIGhhZCBHUFQgc2VsZWN0ZWQuXG5cdFx0XHRjb25zdCBjYWNoZWRNb2RlbHMgPSBjb21wdXRlQXZhaWxhYmxlTW9kZWxzKFxuXHRcdFx0XHRbXSxcblx0XHRcdFx0W2NhY2hlZEdwdCwgY2FjaGVkQ2xhdWRlXSxcblx0XHRcdFx0bmV3IFNldChbJ2NvcGlsb3QnXSksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0Q2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdCk7XG5cdFx0XHQvLyBHUFQgaXMgaW4gdGhlIGNhY2hlZCBsaXN0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSgnY29waWxvdC9ncHQnLCBjYWNoZWRNb2RlbHMpLCBmYWxzZSk7XG5cblx0XHRcdC8vIFN0ZXAgMjogTGl2ZSBtb2RlbHMgYXJyaXZlIChzYW1lIG1vZGVscylcblx0XHRcdGNvbnN0IGxpdmVNb2RlbHMgPSBjb21wdXRlQXZhaWxhYmxlTW9kZWxzKFxuXHRcdFx0XHRbY2FjaGVkR3B0LCBjYWNoZWRDbGF1ZGVdLFxuXHRcdFx0XHRbY2FjaGVkR3B0LCBjYWNoZWRDbGF1ZGVdLFxuXHRcdFx0XHRuZXcgU2V0KFsnY29waWxvdCddKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0KTtcblx0XHRcdC8vIEdQVCBzdGlsbCBpbiB0aGUgbGlzdCBcdTIwMTQgbm8gcmVzZXQgbmVlZGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSgnY29waWxvdC9ncHQnLCBsaXZlTW9kZWxzKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0ZW5zaW9uIHJlbG9hZDogc2VsZWN0ZWQgbW9kZWwgZmxpY2tlcnMgb3V0IHRoZW4gYmFjaycsICgpID0+IHtcblx0XHRcdGNvbnN0IGdwdCA9IGNyZWF0ZU1vZGVsKCdncHQnLCAnR1BUJyk7XG5cdFx0XHRjb25zdCBjbGF1ZGUgPSBjcmVhdGVNb2RlbCgnY2xhdWRlJywgJ0NsYXVkZScpO1xuXG5cdFx0XHQvLyBTdGVwIDE6IEdQVCBpcyBzZWxlY3RlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0T25Nb2RlbExpc3RDaGFuZ2UoJ2NvcGlsb3QvZ3B0JywgW2dwdCwgY2xhdWRlXSksIGZhbHNlKTtcblxuXHRcdFx0Ly8gU3RlcCAyOiBFeHRlbnNpb24gcmVsb2FkcywgY29waWxvdCB2ZW5kb3IgaGFzIG5vIGxpdmUgbW9kZWxzXG5cdFx0XHQvLyBCdXQgY2FjaGUgYnJpZGdlcyB0aGUgZ2FwXG5cdFx0XHRjb25zdCBkdXJpbmdSZWxvYWQgPSBtZXJnZU1vZGVsc1dpdGhDYWNoZShbXSwgW2dwdCwgY2xhdWRlXSwgbmV3IFNldChbJ2NvcGlsb3QnXSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0T25Nb2RlbExpc3RDaGFuZ2UoJ2NvcGlsb3QvZ3B0JywgZHVyaW5nUmVsb2FkKSwgZmFsc2UpO1xuXG5cdFx0XHQvLyBTdGVwIDM6IEV4dGVuc2lvbiBmaW5pc2hlcyBsb2FkaW5nLCBsaXZlIG1vZGVscyBiYWNrXG5cdFx0XHRjb25zdCBhZnRlclJlbG9hZCA9IG1lcmdlTW9kZWxzV2l0aENhY2hlKFtncHQsIGNsYXVkZV0sIFtncHQsIGNsYXVkZV0sIG5ldyBTZXQoWydjb3BpbG90J10pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE9uTW9kZWxMaXN0Q2hhbmdlKCdjb3BpbG90L2dwdCcsIGFmdGVyUmVsb2FkKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0ZW5zaW9uIHJlbG9hZCB3aXRob3V0IGNhY2hlOiBtb2RlbCBsb3N0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ3B0ID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTtcblxuXHRcdFx0Ly8gU3RlcCAxOiBHUFQgc2VsZWN0ZWQsIG5vIGNhY2hlXG5cdFx0XHQvLyBTdGVwIDI6IEV4dGVuc2lvbiByZWxvYWRzIHdpdGggbm8gbW9kZWxzIGFuZCBubyBjYWNoZVxuXHRcdFx0Y29uc3QgZHVyaW5nUmVsb2FkID0gbWVyZ2VNb2RlbHNXaXRoQ2FjaGUoW10sIFtdLCBuZXcgU2V0KFsnY29waWxvdCddKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZHVyaW5nUmVsb2FkLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSgnY29waWxvdC9ncHQnLCBkdXJpbmdSZWxvYWQpLCB0cnVlKTtcblx0XHRcdC8vIFx1MjE5MiBNb2RlbCBpcyBsb3N0LCByZXNldCB0byBkZWZhdWx0XG5cblx0XHRcdC8vIFN0ZXAgMzogTW9kZWxzIGNvbWUgYmFjayBidXQgdXNlcidzIGNob2ljZSBpcyBhbHJlYWR5IGdvbmVcblx0XHRcdGNvbnN0IGFmdGVyUmVsb2FkID0gbWVyZ2VNb2RlbHNXaXRoQ2FjaGUoW2dwdF0sIFtdLCBuZXcgU2V0KFsnY29waWxvdCddKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWZ0ZXJSZWxvYWQubGVuZ3RoLCAxKTtcblx0XHRcdC8vIFVzZXIncyBzZWxlY3Rpb24gd2FzIGFscmVhZHkgcmVzZXQgdG8gc29tZXRoaW5nIGVsc2Vcblx0XHRcdC8vIFRoaXMgaXMgZXhwZWN0ZWQgYmVoYXZpb3IgXHUyMDE0IGNhY2hlIGlzIHRoZSBtaXRpZ2F0aW9uXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXNzaW9uIHN3aXRjaCByYWNlOiBtb2RlICsgc2Vzc2lvbiBjaGFuZ2UgdG9nZXRoZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBnZW5lcmFsRGVmYXVsdCA9IGNyZWF0ZURlZmF1bHRNb2RlbEZvckxvY2F0aW9uKCdncHQnLCAnR1BUJywgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRjb25zdCBjbG91ZE1vZGVsID0gY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbG91ZC1ncHQnLCAnQ2xvdWQgR1BUJywgJ2Nsb3VkJywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IHRydWUsIGFnZW50TW9kZTogdHJ1ZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhbGxNb2RlbHMgPSBbZ2VuZXJhbERlZmF1bHQsIGNsb3VkTW9kZWxdO1xuXG5cdFx0XHQvLyBVc2VyIGlzIGluIGdlbmVyYWwgc2Vzc2lvbiB3aXRoIEdQVCBpbiBBZ2VudCBtb2RlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChnZW5lcmFsRGVmYXVsdCwgW2dlbmVyYWxEZWZhdWx0XSwge1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0Y3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdHNlc3Npb25UeXBlOiB1bmRlZmluZWQsXG5cdFx0XHR9LCBhbGxNb2RlbHMpLCBmYWxzZSk7XG5cblx0XHRcdC8vIFN3aXRjaCB0byBjbG91ZCBzZXNzaW9uIFx1MjAxNCBnZW5lcmFsIG1vZGVsIHNob3VsZCBiZSByZXNldFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQoZ2VuZXJhbERlZmF1bHQsIFtjbG91ZE1vZGVsXSwge1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0Y3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdHNlc3Npb25UeXBlOiAnY2xvdWQnLFxuXHRcdFx0fSwgYWxsTW9kZWxzKSwgdHJ1ZSk7XG5cblx0XHRcdC8vIFRoZSBkZWZhdWx0IGZvciBjbG91ZCBzZXNzaW9uIHNob3VsZCBiZSB0aGUgY2xvdWQgbW9kZWxcblx0XHRcdGNvbnN0IGNsb3VkRGVmYXVsdCA9IGZpbmREZWZhdWx0TW9kZWwoW2Nsb3VkTW9kZWxdLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG91ZERlZmF1bHQ/Lm1ldGFkYXRhLmlkLCAnY2xvdWQtZ3B0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyYXBpZCBtb2RlIGNoYW5nZXM6IGFzayBcdTIxOTIgYWdlbnQgXHUyMTkyIGFzayBwcmVzZXJ2ZXMgY29tcGF0aWJsZSBtb2RlbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdCcsICdHUFQnKTsgLy8gQ29tcGF0aWJsZSB3aXRoIGFsbCBtb2Rlc1xuXHRcdFx0Y29uc3QgYWxsTW9kZWxzID0gW21vZGVsXTtcblxuXHRcdFx0Ly8gQXNrIG1vZGU6IGZpbmVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KG1vZGVsLCBhbGxNb2RlbHMsIHtcblx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGN1cnJlbnRNb2RlS2luZDogQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0c2Vzc2lvblR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdH0sIGFsbE1vZGVscyksIGZhbHNlKTtcblxuXHRcdFx0Ly8gXHUyMTkyIEFnZW50IG1vZGU6IG1vZGVsIGhhcyB0b29sQ2FsbGluZywgc3RpbGwgZmluZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQobW9kZWwsIGFsbE1vZGVscywge1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdHNlc3Npb25UeXBlOiB1bmRlZmluZWQsXG5cdFx0XHR9LCBhbGxNb2RlbHMpLCBmYWxzZSk7XG5cblx0XHRcdC8vIFx1MjE5MiBCYWNrIHRvIEFzazogc3RpbGwgZmluZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQobW9kZWwsIGFsbE1vZGVscywge1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRzZXNzaW9uVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0fSwgYWxsTW9kZWxzKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmFwaWQgbW9kZSBjaGFuZ2VzOiBhc2sgXHUyMTkyIGFnZW50IHJlc2V0cyBpbmNvbXBhdGlibGUsIHRoZW4gYWdlbnQgXHUyMTkyIGFzayBkb2VzIG5vdCByZXN0b3JlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm9Ub29sTW9kZWwgPSBjcmVhdGVNb2RlbCgnbm8tdG9vbCcsICdObyBUb29sJywge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHRvb2xNb2RlbCA9IGNyZWF0ZURlZmF1bHRNb2RlbEZvckxvY2F0aW9uKCd0b29sJywgJ1Rvb2wnLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGNvbnN0IGFsbE1vZGVscyA9IFtub1Rvb2xNb2RlbCwgdG9vbE1vZGVsXTtcblxuXHRcdFx0Ly8gQXNrIG1vZGUgd2l0aCBub1Rvb2xNb2RlbDogZmluZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQobm9Ub29sTW9kZWwsIGFsbE1vZGVscywge1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRzZXNzaW9uVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0fSwgYWxsTW9kZWxzKSwgZmFsc2UpO1xuXG5cdFx0XHQvLyBcdTIxOTIgQWdlbnQgbW9kZTogbm9Ub29sTW9kZWwgZmFpbHMsIHJlc2V0IHBpY2tzIGRlZmF1bHQgKHRvb2xNb2RlbClcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRSZXNldE1vZGVsVG9EZWZhdWx0KG5vVG9vbE1vZGVsLCBhbGxNb2RlbHMsIHtcblx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGN1cnJlbnRNb2RlS2luZDogQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0XHRzZXNzaW9uVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0fSwgYWxsTW9kZWxzKSwgdHJ1ZSk7XG5cdFx0XHRjb25zdCBkZWZhdWx0QWZ0ZXJSZXNldCA9IGZpbmREZWZhdWx0TW9kZWwoYWxsTW9kZWxzLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZhdWx0QWZ0ZXJSZXNldD8ubWV0YWRhdGEuaWQsICd0b29sJyk7XG5cblx0XHRcdC8vIFx1MjE5MiBCYWNrIHRvIEFzazogdG9vbE1vZGVsIGlzIGZpbmUgaW4gQXNrIG1vZGUsIHN0YXlzIGFzIHRvb2xNb2RlbFxuXHRcdFx0Ly8gVGhlIG9yaWdpbmFsIG5vVG9vbE1vZGVsIGlzIE5PVCByZXN0b3JlZCBcdTIwMTQgdGhpcyBpcyBleHBlY3RlZCBhbmQgbWF0Y2hlcyBDaGF0SW5wdXRQYXJ0IGJlaGF2aW9yXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdCh0b29sTW9kZWwsIGFsbE1vZGVscywge1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY3VycmVudE1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRzZXNzaW9uVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0fSwgYWxsTW9kZWxzKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gUmVwcm8gZm9yICMzMjEwMzc6IG9uIGZpcnN0IGxhdW5jaCB0aGUgcmVzdG9yZWQgQ29waWxvdCBzZWxlY3Rpb24gaXMgcmVzZXQgdG8gYSBCWU9LIG1vZGVsLiBUaGUgQ29waWxvdFxuXHRcdC8vIHZlbmRvciBkZXBlbmRzIG9uIHRoZSBDb3BpbG90IHRva2VuLCB3aGljaCByb3VuZC10cmlwcyBzbG93ZXIgdGhhbiBmYXN0L2xvY2FsIEJZT0sgcHJvdmlkZXJzIChPbGxhbWEsXG5cdFx0Ly8gQ2VyZWJyYXMpLiBTbyB0aGUgQ29waWxvdCB2ZW5kb3IgcmVzb2x2ZXMgYW4gRU1QVFkgbGl2ZSBsaXN0IGZpcnN0IHdoaWxlIHRoZSBCWU9LIHZlbmRvcnMgYWxyZWFkeSBoYXZlIGxpdmVcblx0XHQvLyBtb2RlbHMuIGBtZXJnZU1vZGVsc1dpdGhDYWNoZWAgdGhlbiB0cmVhdHMgQ29waWxvdCdzIGVtcHR5IHJlc29sdXRpb24gYXMgYXV0aG9yaXRhdGl2ZSBhbmQgZXZpY3RzIHRoZSBjYWNoZWRcblx0XHQvLyBDb3BpbG90IG1vZGVscyB0aGF0IHdlcmUgdXNlZCB0byByZXN0b3JlIHRoZSBzZWxlY3Rpb24gXHUyMDE0IGxlYXZpbmcgb25seSBCWU9LIG1vZGVscywgd2hpY2ggdHJpZ2dlcnMgYVxuXHRcdC8vIHJlc2V0LXRvLWRlZmF1bHQgdGhhdCBjbG9iYmVycyB0aGUgdXNlcidzIHBlcnNpc3RlZCBDb3BpbG90IGNob2ljZS5cblx0XHR0ZXN0KCdzdGFydHVwIHJhY2UgIzMyMTAzNzogQ29waWxvdCB2ZW5kb3IgcmVzb2x2ZXMgZW1wdHkgYmVmb3JlIEJZT0ssIHJlc3RvcmVkIHNlbGVjdGlvbiBtdXN0IHN1cnZpdmUnLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgdXNlcidzIHBlcnNpc3RlZCBjaG9pY2UgKGEgQ29waWxvdCBtb2RlbCkgYW5kIGl0cyBzaWJsaW5ncywgc2VlZGVkIGludG8gdGhlIGNhY2hlIGZyb20gdGhlIHByZXZpb3VzXG5cdFx0XHQvLyBzZXNzaW9uLlxuXHRcdFx0Y29uc3QgcGVyc2lzdGVkSWQgPSAnY29waWxvdC9jbGF1ZGUtb3B1cy00LjYtMW0nO1xuXHRcdFx0Y29uc3QgY2FjaGVkQ29waWxvdCA9IFtcblx0XHRcdFx0Y3JlYXRlTW9kZWwoJ2NsYXVkZS1vcHVzLTQuNi0xbScsICdDbGF1ZGUgT3B1cyA0LjYgKDFNKScpLFxuXHRcdFx0XHRjcmVhdGVNb2RlbCgnZ3B0LTUuNScsICdHUFQtNS41JyksXG5cdFx0XHRdO1xuXG5cdFx0XHQvLyBGYXN0L2xvY2FsIEJZT0sgcHJvdmlkZXJzIHRoYXQgcHVibGlzaCBsaXZlIG1vZGVscyBpbW1lZGlhdGVseS5cblx0XHRcdGNvbnN0IGxpdmVCeW9rID0gW1xuXHRcdFx0XHRjcmVhdGVWZW5kb3JNb2RlbCgnb2xsYW1hJywgJ2RlZXBzZWVrLXYzLjEnLCAnRGVlcFNlZWsgVjMuMScpLFxuXHRcdFx0XHRjcmVhdGVWZW5kb3JNb2RlbCgnY2VyZWJyYXMnLCAnemFpLWdsbS00LjcnLCAnR0xNIDQuNycpLFxuXHRcdFx0XTtcblxuXHRcdFx0Ly8gQ29waWxvdCBjb250cmlidXRlZCBhIHZlbmRvciBidXQgcmVzb2x2ZWQgYW4gRU1QVFkgbGl2ZSBsaXN0ICh0b2tlbiBub3QgcmVhZHkgeWV0KTsgdGhlIEJZT0sgdmVuZG9yc1xuXHRcdFx0Ly8gcmVzb2x2ZWQgd2l0aCBtb2RlbHMuIEFsbCB0aHJlZSBhcmUgdGhlcmVmb3JlIFwicmVzb2x2ZWRcIi5cblx0XHRcdGNvbnN0IGNvbnRyaWJ1dGVkVmVuZG9ycyA9IG5ldyBTZXQoWydjb3BpbG90JywgJ29sbGFtYScsICdjZXJlYnJhcyddKTtcblx0XHRcdGNvbnN0IHJlc29sdmVkVmVuZG9ycyA9IG5ldyBTZXQoWydjb3BpbG90JywgJ29sbGFtYScsICdjZXJlYnJhcyddKTtcblxuXHRcdFx0Y29uc3QgYXZhaWxhYmxlID0gY29tcHV0ZUF2YWlsYWJsZU1vZGVscyhcblx0XHRcdFx0bGl2ZUJ5b2ssXG5cdFx0XHRcdFsuLi5jYWNoZWRDb3BpbG90LCAuLi5saXZlQnlva10sXG5cdFx0XHRcdGNvbnRyaWJ1dGVkVmVuZG9ycyxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdHJlc29sdmVkVmVuZG9ycyxcblx0XHRcdCk7XG5cblx0XHRcdC8vIERFU0lSRUQ6IHRoZSB1c2VyJ3MgcmVzdG9yZWQgQ29waWxvdCBtb2RlbCBpcyBzdGlsbCBzZWxlY3RhYmxlIGR1cmluZyB0aGUgcmFjZSwgc28gbm8gcmVzZXQtdG8tQllPS1xuXHRcdFx0Ly8gaGFwcGVucyBhbmQgdGhlIHBlcnNpc3RlZCBjaG9pY2UgaXMga2VwdC4gQ1VSUkVOVCAoYnVnKTogQ29waWxvdCBjYWNoZSBpcyBldmljdGVkLCBvbmx5IEJZT0sgcmVtYWlucywgdGhlXG5cdFx0XHQvLyBtb2RlbCBpcyBjb25zaWRlcmVkIHVuYXZhaWxhYmxlIGFuZCBnZXRzIHJlc2V0IHRvIGEgQllPSyBkZWZhdWx0LlxuXHRcdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0XHRhdmFpbGFibGUuc29tZShtID0+IG0uaWRlbnRpZmllciA9PT0gcGVyc2lzdGVkSWQpLFxuXHRcdFx0XHQncmVzdG9yZWQgQ29waWxvdCBtb2RlbCBzaG91bGQgcmVtYWluIGF2YWlsYWJsZSB3aGlsZSBpdHMgdmVuZG9yIGlzIHN0aWxsIGFjdGl2YXRpbmcnLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0c2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZShwZXJzaXN0ZWRJZCwgYXZhaWxhYmxlKSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdCdtdXN0IG5vdCByZXNldCB0aGUgcmVzdG9yZWQgQ29waWxvdCBzZWxlY3Rpb24gZHVyaW5nIHRoZSBzdGFydHVwIHJhY2UnLFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gQW5kIHRoZSBmYWxsYmFjayBkZWZhdWx0IG11c3Qgbm90IGJlIGEgQllPSyBtb2RlbCAod2hpY2ggaXMgd2hhdCBnZXRzIHBlcnNpc3RlZCB0b2RheSwgY2xvYmJlcmluZyB0aGUgdXNlclxuXHRcdFx0Ly8gY2hvaWNlIG9uIHRoZSBuZXh0IGxhdW5jaCkuXG5cdFx0XHRjb25zdCBmYWxsYmFjayA9IGZpbmREZWZhdWx0TW9kZWwoYXZhaWxhYmxlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChcblx0XHRcdFx0ZmFsbGJhY2s/Lm1ldGFkYXRhLmlzQllPSyxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0J3Jlc2V0IGZhbGxiYWNrIHNob3VsZCBub3QgYmUgYSBCWU9LIG1vZGVsJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhZ2VudC1ob3N0IG1vZGVsIHJlc3RvcmUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSAnYWdlbnQtaG9zdC1jbGF1ZGUnO1xuXHRcdGNvbnN0IGFnbm9zdGljQXV0byA9IGNyZWF0ZU1vZGVsKCdhdXRvJywgJ0F1dG8nKTtcblx0XHRjb25zdCBhZ2VudEhvc3RIYWlrdTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyID0ge1xuXHRcdFx0Li4uY3JlYXRlU2Vzc2lvbk1vZGVsKCdjbGF1ZGUtaGFpa3UtNC41JywgJ0NsYXVkZSBIYWlrdSA0LjUnLCBzZXNzaW9uVHlwZSwgeyBpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWUgfSB9KSxcblx0XHRcdGlkZW50aWZpZXI6ICdhZ2VudC1ob3N0LWNsYXVkZTpjbGF1ZGUtaGFpa3UtNC41Jyxcblx0XHR9O1xuXHRcdGNvbnN0IGFnZW50SG9zdE9wdXM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciA9IHtcblx0XHRcdC4uLmNyZWF0ZVNlc3Npb25Nb2RlbCgnY2xhdWRlLW9wdXMtNC44JywgJ0NsYXVkZSBPcHVzIDQuOCcsIHNlc3Npb25UeXBlKSxcblx0XHRcdGlkZW50aWZpZXI6ICdhZ2VudC1ob3N0LWNsYXVkZTpjbGF1ZGUtb3B1cy00LjgnLFxuXHRcdH07XG5cdFx0Y29uc3QgYWxsTWVyZ2VkID0gW2Fnbm9zdGljQXV0bywgYWdlbnRIb3N0SGFpa3UsIGFnZW50SG9zdE9wdXNdO1xuXG5cdFx0dGVzdCgncmVzdG9yZXMgYSByZW1lbWJlcmVkIHBlci10eXBlIG1vZGVsIG9ubHkgZm9yIGEgZnJlc2ggb3duLXBvb2wgZHJhZnQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0c2hvdWxkUmVzdG9yZVBlclR5cGVNb2RlbE9uU2Vzc2lvblN3aXRjaCh0cnVlLCB0cnVlLCBmYWxzZSksXG5cdFx0XHRcdHNob3VsZFJlc3RvcmVQZXJUeXBlTW9kZWxPblNlc3Npb25Td2l0Y2godHJ1ZSwgdHJ1ZSwgdHJ1ZSksXG5cdFx0XHRcdHNob3VsZFJlc3RvcmVQZXJUeXBlTW9kZWxPblNlc3Npb25Td2l0Y2goZmFsc2UsIHRydWUsIGZhbHNlKSxcblx0XHRcdFx0c2hvdWxkUmVzdG9yZVBlclR5cGVNb2RlbE9uU2Vzc2lvblN3aXRjaCh0cnVlLCBmYWxzZSwgZmFsc2UpLFxuXHRcdFx0XSwgW3RydWUsIGZhbHNlLCBmYWxzZSwgZmFsc2VdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Egc3RhcnRlZCBjb250cmlidXRlZCBzZXNzaW9uIGlzIG5ldmVyIGEgbmV3IGNvbnZlcnNhdGlvbiwgZXZlbiBiZWZvcmUgaXRzIHJlcXVlc3RzIGxvYWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGFydGVkQWdlbnRIb3N0ID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6LzkzM2U3NjAyLWY4NGUtNDMxZS04NzU2LWM1ZTg1YzhmMzNkMCcpO1xuXHRcdFx0Y29uc3QgdW50aXRsZWRBZ2VudEhvc3QgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdGNsaTovdW50aXRsZWQtOTMzZTc2MDInKTtcblx0XHRcdGNvbnN0IGxvY2FsU2Vzc2lvbiA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZ2V0TmV3U2Vzc2lvblVyaSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0aXNOZXdDb252ZXJzYXRpb24oc3RhcnRlZEFnZW50SG9zdCwgdHJ1ZSksXG5cdFx0XHRcdGlzTmV3Q29udmVyc2F0aW9uKHN0YXJ0ZWRBZ2VudEhvc3QsIGZhbHNlKSxcblx0XHRcdFx0aXNOZXdDb252ZXJzYXRpb24odW50aXRsZWRBZ2VudEhvc3QsIHRydWUpLFxuXHRcdFx0XHRpc05ld0NvbnZlcnNhdGlvbih1bnRpdGxlZEFnZW50SG9zdCwgZmFsc2UpLFxuXHRcdFx0XHRpc05ld0NvbnZlcnNhdGlvbihsb2NhbFNlc3Npb24sIHRydWUpLFxuXHRcdFx0XHRpc05ld0NvbnZlcnNhdGlvbihsb2NhbFNlc3Npb24sIGZhbHNlKSxcblx0XHRcdF0sIFtmYWxzZSwgZmFsc2UsIHRydWUsIGZhbHNlLCB0cnVlLCBmYWxzZV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHJvcHMgY3Jvc3MtcG9vbCBkcmFmdCBtb2RlbHMgaW4gYm90aCBkaXJlY3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdHNob3VsZERyb3BBZ25vc3RpY0RyYWZ0TW9kZWwoYWdub3N0aWNBdXRvLCBhbGxNZXJnZWQsIHNlc3Npb25UeXBlKSxcblx0XHRcdFx0c2hvdWxkRHJvcEFnbm9zdGljRHJhZnRNb2RlbChhZ2VudEhvc3RPcHVzLCBhbGxNZXJnZWQsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHNob3VsZERyb3BBZ25vc3RpY0RyYWZ0TW9kZWwoYWdlbnRIb3N0T3B1cywgYWxsTWVyZ2VkLCBzZXNzaW9uVHlwZSksXG5cdFx0XHRdLCBbdHJ1ZSwgdHJ1ZSwgZmFsc2VdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0JZT0sgYWdlbnQtaG9zdCB2aXNpYmlsaXR5IChpc01vZGVsSGlkZGVuSW5QaWNrZXIgLyBnZXRBZ2VudEhvc3RCeW9rTWFuYWdlTW9kZWxzSWRlbnRpZmllciknLCAoKSA9PiB7XG5cblx0XHQvLyBNaXJyb3JzIHRoZSBhZ2VudC1ob3N0IGNvcHkgcHJvZHVjZWQgYnkgYEFnZW50SG9zdExhbmd1YWdlTW9kZWxQcm92aWRlcmAgYWZ0ZXIgYVxuXHRcdC8vIEJZT0sgbW9kZWwgcm91bmQtdHJpcHMgdGhlIGJyaWRnZTogaXQgaXMgc3VyZmFjZWQgdW5kZXIgdGhlIGFnZW50LWhvc3QgdmVuZG9yIHdpdGhcblx0XHQvLyBgaWRlbnRpZmllciA9IDxhZ2VudC1ob3N0LXZlbmRvcj46PHZlbmRvcj4vPGlkPmAgYW5kIGNhcnJpZXMgdGhlIG9yaWdpbmFsIExNIHNlcnZpY2Vcblx0XHQvLyBpZGVudGlmaWVyIChgYnlva01vZGVsSWRlbnRpZmllcmAsIHRoZSBcIk1hbmFnZSBNb2RlbHNcIiB2aXNpYmlsaXR5IGtleSkgdGhhdCB0aGUgbm9kZVxuXHRcdC8vIGFnZW50IGhvc3QgZm9yd2FyZGVkIGFjcm9zcyB0aGUgYnJpZGdlIHZpYSBgX21ldGFgLlxuXHRcdGZ1bmN0aW9uIGNyZWF0ZUFnZW50SG9zdEJ5b2tNb2RlbCh2ZW5kb3I6IHN0cmluZywgbW9kZWxJZDogc3RyaW5nLCBtYW5hZ2VNb2RlbHNJZGVudGlmaWVyOiBzdHJpbmcpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJztcblx0XHRcdGNvbnN0IGFwcGVuZGVkSWQgPSBgJHt2ZW5kb3J9LyR7bW9kZWxJZH1gO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWRlbnRpZmllcjogYCR7c2Vzc2lvblR5cGV9OiR7YXBwZW5kZWRJZH1gLFxuXHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3ZzY29kZS5jaGF0JyksXG5cdFx0XHRcdFx0aWQ6IGFwcGVuZGVkSWQsXG5cdFx0XHRcdFx0bmFtZTogbW9kZWxJZCxcblx0XHRcdFx0XHR2ZW5kb3I6IHNlc3Npb25UeXBlLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0XHRcdGZhbWlseTogYXBwZW5kZWRJZCxcblx0XHRcdFx0XHRtYXhJbnB1dFRva2VuczogMTI4MDAwLFxuXHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogNDA5Nixcblx0XHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHRcdFx0aXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSxcblx0XHRcdFx0XHR0YXJnZXRDaGF0U2Vzc2lvblR5cGU6IHNlc3Npb25UeXBlLFxuXHRcdFx0XHRcdG1vZGVsR3JvdXA6IHsgaWQ6IHZlbmRvciB9LFxuXHRcdFx0XHRcdGJ5b2tNb2RlbElkZW50aWZpZXI6IG1hbmFnZU1vZGVsc0lkZW50aWZpZXIsXG5cdFx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiB0cnVlLCBhZ2VudE1vZGU6IHRydWUgfSxcblx0XHRcdFx0fSBhcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gQSBuYXRpdmUgaGFybmVzcyBtb2RlbCAoZS5nLiBDb3BpbG90IENMSSdzIG93biBtb2RlbCkgY2FycmllcyBub1xuXHRcdC8vIGBieW9rTW9kZWxJZGVudGlmaWVyYDsgaXQgaXMgdG9nZ2xlZCB1bmRlciBpdHMgb3duIGlkZW50aWZpZXIuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlTmF0aXZlQWdlbnRIb3N0TW9kZWwobW9kZWxJZDogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHtcblx0XHRcdGNvbnN0IHNlc3Npb25UeXBlID0gJ2FnZW50LWhvc3QtY29waWxvdGNsaSc7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZGVudGlmaWVyOiBgJHtzZXNzaW9uVHlwZX06JHttb2RlbElkfWAsXG5cdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndnNjb2RlLmNoYXQnKSxcblx0XHRcdFx0XHRpZDogbW9kZWxJZCxcblx0XHRcdFx0XHRuYW1lOiBtb2RlbElkLFxuXHRcdFx0XHRcdHZlbmRvcjogc2Vzc2lvblR5cGUsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0XHRcdFx0ZmFtaWx5OiBtb2RlbElkLFxuXHRcdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMjgwMDAsXG5cdFx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiA0MDk2LFxuXHRcdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0XHRcdHRhcmdldENoYXRTZXNzaW9uVHlwZTogc2Vzc2lvblR5cGUsXG5cdFx0XHRcdFx0bW9kZWxHcm91cDogeyBpZDogJ2NvcGlsb3RjbGknIH0sXG5cdFx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiB0cnVlLCBhZ2VudE1vZGU6IHRydWUgfSxcblx0XHRcdFx0fSBhcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGVzdCgncmV0dXJucyB0aGUgY2FycmllZCBNYW5hZ2UgTW9kZWxzIGlkZW50aWZpZXIgZm9yIGEgZ3JvdXBsZXNzIEJZT0sgY29weScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlQWdlbnRIb3N0Qnlva01vZGVsKCdhbnRocm9waWMnLCAnY2xhdWRlLXNvbm5ldC00JywgJ2FudGhyb3BpYy9jbGF1ZGUtc29ubmV0LTQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBZ2VudEhvc3RCeW9rTWFuYWdlTW9kZWxzSWRlbnRpZmllcihtb2RlbC5tZXRhZGF0YSksICdhbnRocm9waWMvY2xhdWRlLXNvbm5ldC00Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRoZSBjYXJyaWVkIGdyb3VwZWQgaWRlbnRpZmllciB2ZXJiYXRpbSAoZ3JvdXAgbmFtZSArIHNsYXNoZXMgcHJlc2VydmVkKScsICgpID0+IHtcblx0XHRcdC8vIE9wZW5Sb3V0ZXIgdW5kZXIgYSB1c2VyLWNvbmZpZ3VyZWQgZ3JvdXAgXCJPcGVuUm91dGVyIDJcIjsgdGhlIG1vZGVsIGlkIGl0c2VsZiBoYXMgYSBzbGFzaC5cblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlQWdlbnRIb3N0Qnlva01vZGVsKCdvcGVucm91dGVyJywgJ2FpMjEvamFtYmEtbGFyZ2UtMS43JywgJ29wZW5yb3V0ZXIvT3BlblJvdXRlciAyL2FpMjEvamFtYmEtbGFyZ2UtMS43Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QWdlbnRIb3N0Qnlva01hbmFnZU1vZGVsc0lkZW50aWZpZXIobW9kZWwubWV0YWRhdGEpLCAnb3BlbnJvdXRlci9PcGVuUm91dGVyIDIvYWkyMS9qYW1iYS1sYXJnZS0xLjcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBuYXRpdmUgaGFybmVzcyBtb2RlbHMgKG5vIGNhcnJpZWQgaWRlbnRpZmllciknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU5hdGl2ZUFnZW50SG9zdE1vZGVsKCdjbGF1ZGUtaGFpa3UtNC41Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QWdlbnRIb3N0Qnlva01hbmFnZU1vZGVsc0lkZW50aWZpZXIobW9kZWwubWV0YWRhdGEpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIG5vbi1hZ2VudC1ob3N0IG1vZGVscycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoJ2dwdC01JywgJ0dQVC01Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QWdlbnRIb3N0Qnlva01hbmFnZU1vZGVsc0lkZW50aWZpZXIobW9kZWwubWV0YWRhdGEpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGlkZXMgYSBncm91cGVkIEJZT0sgY29weSB2aWEgaXRzIGNhcnJpZWQgcmVnaXN0ZXJlZCBpZGVudGlmaWVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVBZ2VudEhvc3RCeW9rTW9kZWwoJ29wZW5yb3V0ZXInLCAnYWkyMS9qYW1iYS1sYXJnZS0xLjcnLCAnb3BlbnJvdXRlci9PcGVuUm91dGVyIDIvYWkyMS9qYW1iYS1sYXJnZS0xLjcnKTtcblx0XHRcdC8vIFRoZSB1c2VyIGhpZCB0aGUgbW9kZWwgaW4gTWFuYWdlIE1vZGVscywgd2hpY2ggc3RvcmVkIHRoZSBncm91cGVkIGlkZW50aWZpZXIuXG5cdFx0XHRjb25zdCBoaWRkZW4gPSBuZXcgU2V0KFsnb3BlbnJvdXRlci9PcGVuUm91dGVyIDIvYWkyMS9qYW1iYS1sYXJnZS0xLjcnXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbEhpZGRlbkluUGlja2VyKG1vZGVsLCBpZCA9PiBoaWRkZW4uaGFzKGlkKSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGlkZXMgYSBncm91cGxlc3MgQllPSyBjb3B5IHZpYSBpdHMgY2FycmllZCBpZGVudGlmaWVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVBZ2VudEhvc3RCeW9rTW9kZWwoJ2FudGhyb3BpYycsICdjbGF1ZGUtc29ubmV0LTQnLCAnYW50aHJvcGljL2NsYXVkZS1zb25uZXQtNCcpO1xuXHRcdFx0Y29uc3QgaGlkZGVuID0gbmV3IFNldChbJ2FudGhyb3BpYy9jbGF1ZGUtc29ubmV0LTQnXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbEhpZGRlbkluUGlja2VyKG1vZGVsLCBpZCA9PiBoaWRkZW4uaGFzKGlkKSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3MgYW4gYWdlbnQtaG9zdCBCWU9LIGNvcHkgd2hlbiBub3RoaW5nIGlzIGhpZGRlbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlQWdlbnRIb3N0Qnlva01vZGVsKCdvcGVucm91dGVyJywgJ2FpMjEvamFtYmEtbGFyZ2UtMS43JywgJ29wZW5yb3V0ZXIvT3BlblJvdXRlciAyL2FpMjEvamFtYmEtbGFyZ2UtMS43Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNb2RlbEhpZGRlbkluUGlja2VyKG1vZGVsLCAoKSA9PiBmYWxzZSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Fsc28gaGlkZXMgd2hlbiB0aGUgYWdlbnQtaG9zdCBjb3B5IGlkZW50aWZpZXIgaXRzZWxmIGlzIGhpZGRlbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlQWdlbnRIb3N0Qnlva01vZGVsKCdhbnRocm9waWMnLCAnY2xhdWRlLXNvbm5ldC00JywgJ2FudGhyb3BpYy9jbGF1ZGUtc29ubmV0LTQnKTtcblx0XHRcdGNvbnN0IGhpZGRlbiA9IG5ldyBTZXQoW21vZGVsLmlkZW50aWZpZXJdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01vZGVsSGlkZGVuSW5QaWNrZXIobW9kZWwsIGlkID0+IGhpZGRlbi5oYXMoaWQpKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaWx0ZXJzIG91dCBhIGhpZGRlbiBncm91cGVkIEJZT0sgbW9kZWwgYnV0IGtlZXBzIHZpc2libGUgcGVlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB2aXNpYmxlID0gY3JlYXRlQWdlbnRIb3N0Qnlva01vZGVsKCdhbnRocm9waWMnLCAnY2xhdWRlLXNvbm5ldC00JywgJ2FudGhyb3BpYy9jbGF1ZGUtc29ubmV0LTQnKTtcblx0XHRcdGNvbnN0IGhpZGRlbk1vZGVsID0gY3JlYXRlQWdlbnRIb3N0Qnlva01vZGVsKCdvcGVucm91dGVyJywgJ2FpMjEvamFtYmEtbGFyZ2UtMS43JywgJ29wZW5yb3V0ZXIvT3BlblJvdXRlciAyL2FpMjEvamFtYmEtbGFyZ2UtMS43Jyk7XG5cdFx0XHRjb25zdCBoaWRkZW4gPSBuZXcgU2V0KFsnb3BlbnJvdXRlci9PcGVuUm91dGVyIDIvYWkyMS9qYW1iYS1sYXJnZS0xLjcnXSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBbdmlzaWJsZSwgaGlkZGVuTW9kZWxdLmZpbHRlcihtID0+ICFpc01vZGVsSGlkZGVuSW5QaWNrZXIobSwgaWQgPT4gaGlkZGVuLmhhcyhpZCkpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChtID0+IG0uaWRlbnRpZmllciksIFsnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOmFudGhyb3BpYy9jbGF1ZGUtc29ubmV0LTQnXSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQW1CLG9CQUFvQjtBQUNoRCxTQUFTLGtDQUEyRTtBQUNwRixTQUFTLDJCQUEyQjtBQUNwQztBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBTVAsU0FBUyx1QkFDUixZQUNBLGNBQ0Esb0JBQ0EsYUFDQSxpQkFDQSxVQUNBLGlCQUM0QztBQUM1QyxR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
