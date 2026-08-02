import assert from "assert";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ILanguageModelChatMetadata } from "../../../common/languageModels.js";
import { ChatModelsViewModel, isLanguageModelProviderEntry, isLanguageModelGroupEntry } from "../../../browser/chatManagement/chatModelsViewModel.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { ChatAgentLocation } from "../../../common/constants.js";
class MockLanguageModelsService {
  constructor() {
    this.vendors = [];
    this.models = /* @__PURE__ */ new Map();
    this.modelsByVendor = /* @__PURE__ */ new Map();
    this.modelGroups = /* @__PURE__ */ new Map();
    this._onDidChangeLanguageModels = new Emitter();
    this.onDidChangeLanguageModels = this._onDidChangeLanguageModels.event;
    this._onDidChangeLanguageModelVendors = new Emitter();
    this.onDidChangeLanguageModelVendors = this._onDidChangeLanguageModelVendors.event;
    this.onDidChangeModelsControlManifest = Event.None;
    this.onDidChangePinnedModels = Event.None;
    this.onDidChangeModelVisibility = Event.None;
    this.restrictedChatParticipants = observableValue("restrictedChatParticipants", /* @__PURE__ */ Object.create(null));
  }
  addVendor(vendor) {
    this.vendors.push(vendor);
    this.modelsByVendor.set(vendor.vendor, []);
    this.modelGroups.set(vendor.vendor, []);
  }
  addModel(vendorId, identifier, metadata) {
    this.models.set(identifier, metadata);
    const models = this.modelsByVendor.get(vendorId) || [];
    models.push(identifier);
    this.modelsByVendor.set(vendorId, models);
    const groups = this.modelGroups.get(vendorId) || [];
    if (groups.length === 0) {
      groups.push({
        group: {
          vendor: vendorId,
          name: this.vendors.find((v) => v.vendor === vendorId)?.displayName || "Default"
        },
        modelIdentifiers: []
      });
    }
    groups[0].modelIdentifiers.push(identifier);
    this.modelGroups.set(vendorId, groups);
  }
  registerLanguageModelProvider(vendor, provider) {
    throw new Error("Method not implemented.");
  }
  deltaLanguageModelChatProviderDescriptors(added, removed) {
    throw new Error("Method not implemented.");
  }
  getVendors() {
    return this.vendors.map((v) => ({ ...v, isDefault: v.vendor === "copilot" }));
  }
  getLanguageModelIds() {
    return Array.from(this.models.keys());
  }
  lookupLanguageModel(identifier) {
    return this.models.get(identifier);
  }
  lookupLanguageModelByQualifiedName(referenceName) {
    for (const [identifier, metadata] of this.models.entries()) {
      if (ILanguageModelChatMetadata.matchesQualifiedName(referenceName, metadata)) {
        return { metadata, identifier };
      }
    }
    return void 0;
  }
  getLanguageModels() {
    const result = [];
    for (const [identifier, metadata] of this.models.entries()) {
      result.push({ identifier, metadata });
    }
    return result;
  }
  setContributedSessionModels() {
  }
  clearContributedSessionModels() {
  }
  async selectLanguageModels(selector) {
    if (selector.vendor) {
      return this.modelsByVendor.get(selector.vendor) || [];
    }
    return Array.from(this.models.keys());
  }
  sendChatRequest() {
    throw new Error("Method not implemented.");
  }
  computeTokenLength() {
    throw new Error("Method not implemented.");
  }
  getModelConfiguration(_modelId) {
    return void 0;
  }
  async setModelConfiguration(_modelId, _values) {
  }
  getModelConfigurationActions(_modelId) {
    return [];
  }
  async configureLanguageModelsProviderGroup(vendorId, name) {
  }
  async renameLanguageModelsProviderGroup(vendorId, providerGroupName) {
  }
  async updateLanguageModelsProviderGroupApiKey(vendorId, providerGroupName) {
  }
  async addLanguageModelsProviderGroupModel(vendorId, providerGroupName) {
  }
  async openLanguageModelsProviderGroupSettings(vendorId, providerGroupName) {
  }
  async configureModel(_modelId) {
  }
  async addLanguageModelsProviderGroup(name, vendorId, configuration) {
  }
  getLanguageModelGroups(vendor) {
    return this.modelGroups.get(vendor) || [];
  }
  hasResolvedVendor(vendor) {
    return this.modelGroups.has(vendor);
  }
  async removeLanguageModelsProviderGroup(vendorId, providerGroupName) {
  }
  async migrateLanguageModelsProviderGroup(languageModelsProviderGroup) {
  }
  getRecentlyUsedModelIds() {
    return [];
  }
  addToRecentlyUsedList() {
  }
  clearRecentlyUsedList() {
  }
  getPinnedModelIds() {
    return [];
  }
  pinModel(_modelIdentifier) {
  }
  unpinModel(_modelIdentifier) {
  }
  isModelPinned(_modelIdentifier) {
    return false;
  }
  isModelHidden(_modelIdentifier) {
    return false;
  }
  isGroupHidden(_vendor, _groupName) {
    return false;
  }
  setModelHidden(_modelIdentifier, _hidden) {
  }
  setGroupHidden(_vendor, _groupName, _hidden) {
  }
  getHiddenModelIds() {
    return [];
  }
  getModelsControlManifest() {
    return { free: {}, paid: {} };
  }
}
suite("ChatModelsViewModel", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let languageModelsService;
  let viewModel;
  setup(async () => {
    languageModelsService = new MockLanguageModelsService();
    languageModelsService.addVendor({
      vendor: "copilot",
      displayName: "GitHub Copilot",
      managementCommand: void 0,
      when: void 0,
      configuration: void 0
    });
    languageModelsService.addVendor({
      vendor: "openai",
      displayName: "OpenAI",
      managementCommand: void 0,
      when: void 0,
      configuration: void 0
    });
    languageModelsService.addModel("copilot", "copilot-gpt-4", {
      extension: new ExtensionIdentifier("github.copilot"),
      id: "gpt-4",
      name: "GPT-4",
      family: "gpt-4",
      version: "1.0",
      vendor: "copilot",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      capabilities: {
        toolCalling: true,
        vision: true,
        agentMode: false
      },
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: true
      }
    });
    languageModelsService.addModel("copilot", "copilot-gpt-4o", {
      extension: new ExtensionIdentifier("github.copilot"),
      id: "gpt-4o",
      name: "GPT-4o",
      family: "gpt-4",
      version: "1.0",
      vendor: "copilot",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      capabilities: {
        toolCalling: true,
        vision: true,
        agentMode: true
      },
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: true
      }
    });
    languageModelsService.addModel("openai", "openai-gpt-3.5", {
      extension: new ExtensionIdentifier("openai.api"),
      id: "gpt-3.5-turbo",
      name: "GPT-3.5 Turbo",
      family: "gpt-3.5",
      version: "1.0",
      vendor: "openai",
      maxInputTokens: 4096,
      maxOutputTokens: 2048,
      isUserSelectable: true,
      capabilities: {
        toolCalling: true,
        vision: false,
        agentMode: false
      },
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: true
      }
    });
    languageModelsService.addModel("openai", "openai-gpt-4-vision", {
      extension: new ExtensionIdentifier("openai.api"),
      id: "gpt-4-vision",
      name: "GPT-4 Vision",
      family: "gpt-4",
      version: "1.0",
      vendor: "openai",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isUserSelectable: false,
      capabilities: {
        toolCalling: false,
        vision: true,
        agentMode: false
      },
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: true
      }
    });
    viewModel = store.add(new ChatModelsViewModel(languageModelsService));
    await viewModel.refresh();
  });
  test("should fetch all models without filters", () => {
    const results = viewModel.filter("");
    assert.strictEqual(results.length, 6);
    const vendors = results.filter(isLanguageModelProviderEntry);
    assert.strictEqual(vendors.length, 2);
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 4);
  });
  test("should filter by provider name (vendor ID and display name)", () => {
    const resultsByCopilotId = viewModel.filter("@provider:copilot");
    assert.strictEqual(resultsByCopilotId.length, 3);
    assert.strictEqual(resultsByCopilotId[0].type, "vendor");
    assert.strictEqual(resultsByCopilotId[0].vendorEntry.vendor.vendor, "copilot");
    assert.strictEqual(resultsByCopilotId[1].type, "model");
    assert.strictEqual(resultsByCopilotId[1].model.identifier, "copilot-gpt-4");
    assert.strictEqual(resultsByCopilotId[2].type, "model");
    assert.strictEqual(resultsByCopilotId[2].model.identifier, "copilot-gpt-4o");
    const resultsByOpenAIName = viewModel.filter("@provider:OpenAI");
    assert.strictEqual(resultsByOpenAIName.length, 3);
    assert.strictEqual(resultsByOpenAIName[0].type, "vendor");
    assert.strictEqual(resultsByOpenAIName[0].vendorEntry.vendor.vendor, "openai");
    assert.strictEqual(resultsByOpenAIName[1].type, "model");
    assert.strictEqual(resultsByOpenAIName[1].model.identifier, "openai-gpt-3.5");
    assert.strictEqual(resultsByOpenAIName[2].type, "model");
    assert.strictEqual(resultsByOpenAIName[2].model.identifier, "openai-gpt-4-vision");
  });
  test("should filter by multiple providers with OR logic", () => {
    const results = viewModel.filter("@provider:copilot @provider:openai");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 4);
  });
  test("should filter by single capability - tools", () => {
    const results = viewModel.filter("@capability:tools");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 3);
    assert.ok(models.every((m) => m.model.metadata.capabilities?.toolCalling === true));
  });
  test("should filter by single capability - vision", () => {
    const results = viewModel.filter("@capability:vision");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 3);
    assert.ok(models.every((m) => m.model.metadata.capabilities?.vision === true));
  });
  test("should filter by single capability - agent", () => {
    const results = viewModel.filter("@capability:agent");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].model.metadata.id, "gpt-4o");
  });
  test("should filter by multiple capabilities with AND logic", () => {
    const results = viewModel.filter("@capability:tools @capability:vision");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 2);
    assert.ok(models.every(
      (m) => m.model.metadata.capabilities?.toolCalling === true && m.model.metadata.capabilities?.vision === true
    ));
  });
  test("should filter by three capabilities with AND logic", () => {
    const results = viewModel.filter("@capability:tools @capability:vision @capability:agent");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].model.metadata.id, "gpt-4o");
  });
  test("should return no results when filtering by incompatible capabilities", () => {
    const results = viewModel.filter("@capability:vision @capability:agent");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].model.metadata.id, "gpt-4o");
  });
  test("should combine provider and capability filters", () => {
    const results = viewModel.filter("@provider:copilot @capability:vision");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 2);
    assert.ok(models.every(
      (m) => m.model.provider.vendor.vendor === "copilot" && m.model.metadata.capabilities?.vision === true
    ));
  });
  test("should filter by text matching model name", () => {
    const results = viewModel.filter("GPT-4o");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].model.metadata.name, "GPT-4o");
    assert.ok(models[0].modelNameMatches);
  });
  test("should filter by text matching model id", () => {
    const results = viewModel.filter("gpt-4o");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].model.identifier, "copilot-gpt-4o");
    assert.ok(models[0].modelIdMatches);
  });
  test("should filter by text matching vendor name", () => {
    const results = viewModel.filter("GitHub");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 2);
    assert.ok(models.every((m) => m.model.provider.group.name === "GitHub Copilot"));
  });
  test("should combine text search with capability filter", () => {
    const results = viewModel.filter("@capability:tools GPT");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 3);
    assert.ok(models.every((m) => m.model.metadata.capabilities?.toolCalling === true));
  });
  test("should handle empty search value", () => {
    const results = viewModel.filter("");
    assert.ok(results.length > 0);
  });
  test("should handle search value with only whitespace", () => {
    const results = viewModel.filter("   ");
    assert.ok(results.length > 0);
  });
  test("should match capability text in free text search", () => {
    const results = viewModel.filter("vision");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.ok(models.length > 0);
    assert.ok(models.every(
      (m) => m.model.metadata.capabilities?.vision === true || m.model.metadata.name.toLowerCase().includes("vision")
    ));
  });
  test("should toggle vendor collapsed state", () => {
    const vendorEntry = viewModel.viewModelEntries.find((r) => isLanguageModelProviderEntry(r) && r.vendorEntry.vendor.vendor === "copilot");
    viewModel.toggleCollapsed(vendorEntry);
    const results = viewModel.filter("");
    const copilotVendor = results.find((r) => isLanguageModelProviderEntry(r) && r.vendorEntry.vendor.vendor === "copilot");
    assert.ok(copilotVendor);
    assert.strictEqual(copilotVendor.collapsed, true);
    const copilotModelsAfterCollapse = results.filter(
      (r) => !isLanguageModelProviderEntry(r) && r.model.provider.vendor.vendor === "copilot"
    );
    assert.strictEqual(copilotModelsAfterCollapse.length, 0);
    viewModel.toggleCollapsed(vendorEntry);
    const resultsAfterExpand = viewModel.filter("");
    const copilotModelsAfterExpand = resultsAfterExpand.filter(
      (r) => !isLanguageModelProviderEntry(r) && r.model.provider.vendor.vendor === "copilot"
    );
    assert.strictEqual(copilotModelsAfterExpand.length, 2);
  });
  test("should handle quoted search strings", () => {
    const results = viewModel.filter('"GPT"');
    assert.ok(Array.isArray(results));
  });
  test("should remove filter keywords from text search", () => {
    const results = viewModel.filter("@provider:copilot @capability:vision GPT");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 2);
    assert.ok(models.every((m) => m.model.provider.vendor.vendor === "copilot"));
  });
  test("should handle case-insensitive capability matching", () => {
    const results1 = viewModel.filter("@capability:TOOLS");
    const results2 = viewModel.filter("@capability:tools");
    const results3 = viewModel.filter("@capability:Tools");
    const models1 = results1.filter((r) => !isLanguageModelProviderEntry(r));
    const models2 = results2.filter((r) => !isLanguageModelProviderEntry(r));
    const models3 = results3.filter((r) => !isLanguageModelProviderEntry(r));
    assert.strictEqual(models1.length, models2.length);
    assert.strictEqual(models2.length, models3.length);
  });
  test("should support toolcalling alias for tools capability", () => {
    const resultsTools = viewModel.filter("@capability:tools");
    const resultsToolCalling = viewModel.filter("@capability:toolcalling");
    const modelsTools = resultsTools.filter((r) => !isLanguageModelProviderEntry(r));
    const modelsToolCalling = resultsToolCalling.filter((r) => !isLanguageModelProviderEntry(r));
    assert.strictEqual(modelsTools.length, modelsToolCalling.length);
  });
  test("should support agentmode alias for agent capability", () => {
    const resultsAgent = viewModel.filter("@capability:agent");
    const resultsAgentMode = viewModel.filter("@capability:agentmode");
    const modelsAgent = resultsAgent.filter((r) => !isLanguageModelProviderEntry(r));
    const modelsAgentMode = resultsAgentMode.filter((r) => !isLanguageModelProviderEntry(r));
    assert.strictEqual(modelsAgent.length, modelsAgentMode.length);
  });
  test("should include matched capabilities in results", () => {
    const results = viewModel.filter("@capability:tools @capability:vision");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.ok(models.length > 0);
    for (const model of models) {
      assert.ok(model.capabilityMatches);
      assert.ok(model.capabilityMatches.length > 0);
      assert.ok(model.capabilityMatches.some((c) => c === "toolCalling" || c === "vision"));
    }
  });
  function createSingleVendorViewModel(includeSecondModel = true) {
    const service = new MockLanguageModelsService();
    service.addVendor({
      vendor: "copilot",
      displayName: "GitHub Copilot",
      managementCommand: void 0,
      when: void 0,
      configuration: void 0
    });
    service.addModel("copilot", "copilot-gpt-4", {
      extension: new ExtensionIdentifier("github.copilot"),
      id: "gpt-4",
      name: "GPT-4",
      family: "gpt-4",
      version: "1.0",
      vendor: "copilot",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      capabilities: {
        toolCalling: true,
        vision: true,
        agentMode: false
      },
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: true
      }
    });
    if (includeSecondModel) {
      service.addModel("copilot", "copilot-gpt-4o", {
        extension: new ExtensionIdentifier("github.copilot"),
        id: "gpt-4o",
        name: "GPT-4o",
        family: "gpt-4",
        version: "1.0",
        vendor: "copilot",
        maxInputTokens: 8192,
        maxOutputTokens: 4096,
        isUserSelectable: true,
        capabilities: {
          toolCalling: true,
          vision: true,
          agentMode: true
        },
        isDefaultForLocation: {
          [ChatAgentLocation.Chat]: true
        }
      });
    }
    const viewModel2 = store.add(new ChatModelsViewModel(service));
    return { service, viewModel: viewModel2 };
  }
  test("should not show vendor header when only one vendor exists", async () => {
    const { viewModel: singleVendorViewModel } = createSingleVendorViewModel();
    await singleVendorViewModel.refresh();
    const results = singleVendorViewModel.filter("");
    const vendors = results.filter(isLanguageModelProviderEntry);
    assert.strictEqual(vendors.length, 0, "Should not show vendor header when only one vendor exists");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 2, "Should show all models");
    assert.ok(models.every((m) => m.model.provider.vendor.vendor === "copilot"));
  });
  test("should show vendor headers when multiple vendors exist", () => {
    const results = viewModel.filter("");
    const vendors = results.filter(isLanguageModelProviderEntry);
    assert.strictEqual(vendors.length, 2, "Should show vendor headers when multiple vendors exist");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 4);
  });
  test("should filter single vendor models by capability", async () => {
    const { viewModel: singleVendorViewModel } = createSingleVendorViewModel();
    await singleVendorViewModel.refresh();
    const results = singleVendorViewModel.filter("@capability:agent");
    const vendors = results.filter(isLanguageModelProviderEntry);
    assert.strictEqual(vendors.length, 0, "Should not show vendor header");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].model.metadata.id, "gpt-4o");
  });
  test("should always place copilot vendor at the top when multiple vendors exist", async () => {
    let results = viewModel.filter("");
    let vendors = results.filter(isLanguageModelProviderEntry);
    assert.strictEqual(vendors[0].vendorEntry.vendor.vendor, "copilot");
    languageModelsService.addVendor({
      vendor: "anthropic",
      displayName: "Anthropic",
      managementCommand: void 0,
      when: void 0,
      configuration: void 0
    });
    languageModelsService.addModel("anthropic", "anthropic-claude", {
      extension: new ExtensionIdentifier("anthropic.api"),
      id: "claude-3",
      name: "Claude 3",
      family: "claude",
      version: "1.0",
      vendor: "anthropic",
      maxInputTokens: 1e5,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      capabilities: {
        toolCalling: true,
        vision: false,
        agentMode: false
      },
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: true
      }
    });
    languageModelsService.addVendor({
      vendor: "azure",
      displayName: "Azure OpenAI",
      managementCommand: void 0,
      when: void 0,
      configuration: void 0
    });
    languageModelsService.addModel("azure", "azure-gpt-4", {
      extension: new ExtensionIdentifier("microsoft.azure"),
      id: "azure-gpt-4",
      name: "Azure GPT-4",
      family: "gpt-4",
      version: "1.0",
      vendor: "azure",
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      capabilities: {
        toolCalling: true,
        vision: false,
        agentMode: false
      },
      isDefaultForLocation: {
        [ChatAgentLocation.Chat]: true
      }
    });
    await viewModel.refresh();
    results = viewModel.filter("");
    vendors = results.filter(isLanguageModelProviderEntry);
    assert.strictEqual(vendors.length, 4);
    assert.strictEqual(vendors[0].vendorEntry.vendor.vendor, "copilot");
    assert.strictEqual(vendors[1].vendorEntry.vendor.vendor, "anthropic");
    assert.strictEqual(vendors[2].vendorEntry.vendor.vendor, "azure");
    assert.strictEqual(vendors[3].vendorEntry.vendor.vendor, "openai");
    results = viewModel.filter("GPT");
    vendors = results.filter(isLanguageModelProviderEntry);
    if (vendors.length > 1) {
      assert.strictEqual(vendors[0].vendorEntry.vendor.vendor, "copilot");
    }
    results = viewModel.filter("@capability:tools");
    vendors = results.filter(isLanguageModelProviderEntry);
    if (vendors.length > 1) {
      assert.strictEqual(vendors[0].vendorEntry.vendor.vendor, "copilot");
    }
  });
  test("should show vendor headers when filtered", () => {
    const results = viewModel.filter("GPT");
    const vendors = results.filter(isLanguageModelProviderEntry);
    assert.ok(vendors.length > 0);
  });
  test("should not show vendor headers when filtered if only one vendor exists", async () => {
    const { viewModel: singleVendorViewModel } = createSingleVendorViewModel();
    await singleVendorViewModel.refresh();
    const results = singleVendorViewModel.filter("GPT");
    const vendors = results.filter(isLanguageModelProviderEntry);
    assert.strictEqual(vendors.length, 0);
  });
  test("should get configured vendors", () => {
    const vendors = viewModel.getConfiguredVendors();
    assert.ok(vendors.length > 0);
    assert.ok(vendors.some((v) => v.vendor.vendor === "copilot"));
    assert.ok(vendors.some((v) => v.vendor.vendor === "openai"));
  });
  test("should return true for shouldRefilter when models not sorted", () => {
    viewModel.filter("");
    assert.strictEqual(viewModel.shouldRefilter(), false);
    const result = viewModel.shouldRefilter();
    assert.strictEqual(typeof result, "boolean");
  });
  test("should collapse all groups and models", () => {
    const results1 = viewModel.filter("");
    let models = results1.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.ok(models.length > 0);
    viewModel.collapseAll();
    const results2 = viewModel.filter("");
    const vendors = results2.filter(isLanguageModelProviderEntry);
    models = results2.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.ok(vendors.length > 0, "Should have vendor headers");
    assert.strictEqual(models.length, 0, "Should have no models visible after collapse all");
  });
  test("should match quoted search strings with filters", () => {
    const results = viewModel.filter('@capability:tools "GPT"');
    assert.ok(Array.isArray(results));
  });
  test("should filter by case-insensitive provider name", () => {
    const results1 = viewModel.filter("@provider:COPILOT");
    const results2 = viewModel.filter("@provider:copilot");
    const results3 = viewModel.filter("@provider:CopiloT");
    const models1 = results1.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    const models2 = results2.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    const models3 = results3.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models1.length, models2.length);
    assert.strictEqual(models2.length, models3.length);
    assert.strictEqual(models1.length, 2);
  });
  test("should handle empty search returning all results", () => {
    const results = viewModel.filter("");
    assert.ok(results.length > 0);
    const vendors = results.filter(isLanguageModelProviderEntry);
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(vendors.length, 2);
    assert.strictEqual(models.length, 4);
  });
  test("should not find matches when searching for non-existent model", () => {
    const results = viewModel.filter("NonExistentModel123");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 0);
  });
  test("should not find matches when filtering by non-existent provider", () => {
    const results = viewModel.filter("@provider:nonexistent");
    const models = results.filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.strictEqual(models.length, 0);
  });
  test("should filter out agent-host BYOK model copies but keep native agent-host models", async () => {
    const service = new MockLanguageModelsService();
    service.addVendor({ vendor: "agent-host-copilotcli", displayName: "Copilot", managementCommand: void 0, when: void 0, configuration: void 0 });
    service.addModel("agent-host-copilotcli", "agent-host-copilotcli:claude-haiku-4.5", {
      extension: new ExtensionIdentifier("vscode.chat"),
      id: "claude-haiku-4.5",
      name: "Claude Haiku 4.5",
      family: "claude-haiku-4.5",
      version: "1.0",
      vendor: "agent-host-copilotcli",
      maxInputTokens: 128e3,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      targetChatSessionType: "agent-host-copilotcli",
      modelGroup: { id: "copilotcli" },
      capabilities: { toolCalling: true, vision: false, agentMode: true },
      isDefaultForLocation: {}
    });
    service.addModel("agent-host-copilotcli", "agent-host-copilotcli:openrouter/aion-labs/aion-3.0", {
      extension: new ExtensionIdentifier("vscode.chat"),
      id: "openrouter/aion-labs/aion-3.0",
      name: "AionLabs: Aion-3.0",
      family: "openrouter/aion-labs/aion-3.0",
      version: "1.0",
      vendor: "agent-host-copilotcli",
      maxInputTokens: 128e3,
      maxOutputTokens: 4096,
      isUserSelectable: true,
      targetChatSessionType: "agent-host-copilotcli",
      modelGroup: { id: "openrouter" },
      byokModelIdentifier: "openrouter/OpenRouter 2/aion-labs/aion-3.0",
      capabilities: { toolCalling: true, vision: false, agentMode: true },
      isDefaultForLocation: {}
    });
    const agentHostViewModel = store.add(new ChatModelsViewModel(service));
    await agentHostViewModel.refresh();
    const models = agentHostViewModel.filter("").filter((r) => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
    assert.deepStrictEqual(models.map((m) => m.model.metadata.id), ["claude-haiku-4.5"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2NoYXRNYW5hZ2VtZW50L2NoYXRNb2RlbHNWaWV3TW9kZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElNb2RlbHNDb250cm9sTWFuaWZlc3QsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIsIElMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyLCBJTGFuZ3VhZ2VNb2RlbENoYXRTZWxlY3RvciwgSUxhbmd1YWdlTW9kZWxzR3JvdXAsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIElVc2VyRnJpZW5kbHlMYW5ndWFnZU1vZGVsLCBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWxzVmlld01vZGVsLCBJTGFuZ3VhZ2VNb2RlbEVudHJ5LCBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnksIGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnksIGlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NoYXRNYW5hZ2VtZW50L2NoYXRNb2RlbHNWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuXG5jbGFzcyBNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIGltcGxlbWVudHMgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHZlbmRvcnM6IElVc2VyRnJpZW5kbHlMYW5ndWFnZU1vZGVsW10gPSBbXTtcblx0cHJpdmF0ZSBtb2RlbHMgPSBuZXcgTWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+KCk7XG5cdHByaXZhdGUgbW9kZWxzQnlWZW5kb3IgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nW10+KCk7XG5cdHByaXZhdGUgbW9kZWxHcm91cHMgPSBuZXcgTWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxzR3JvdXBbXT4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzID0gdGhpcy5fb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxWZW5kb3JzID0gbmV3IEVtaXR0ZXI8cmVhZG9ubHkgc3RyaW5nW10+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbFZlbmRvcnMgPSB0aGlzLl9vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxWZW5kb3JzLmV2ZW50O1xuXG5cdG9uRGlkQ2hhbmdlTW9kZWxzQ29udHJvbE1hbmlmZXN0ID0gRXZlbnQuTm9uZTtcblxuXHRhZGRWZW5kb3IodmVuZG9yOiBJVXNlckZyaWVuZGx5TGFuZ3VhZ2VNb2RlbCk6IHZvaWQge1xuXHRcdHRoaXMudmVuZG9ycy5wdXNoKHZlbmRvcik7XG5cdFx0dGhpcy5tb2RlbHNCeVZlbmRvci5zZXQodmVuZG9yLnZlbmRvciwgW10pO1xuXHRcdHRoaXMubW9kZWxHcm91cHMuc2V0KHZlbmRvci52ZW5kb3IsIFtdKTtcblx0fVxuXG5cdGFkZE1vZGVsKHZlbmRvcklkOiBzdHJpbmcsIGlkZW50aWZpZXI6IHN0cmluZywgbWV0YWRhdGE6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbHMuc2V0KGlkZW50aWZpZXIsIG1ldGFkYXRhKTtcblx0XHRjb25zdCBtb2RlbHMgPSB0aGlzLm1vZGVsc0J5VmVuZG9yLmdldCh2ZW5kb3JJZCkgfHwgW107XG5cdFx0bW9kZWxzLnB1c2goaWRlbnRpZmllcik7XG5cdFx0dGhpcy5tb2RlbHNCeVZlbmRvci5zZXQodmVuZG9ySWQsIG1vZGVscyk7XG5cblx0XHQvLyBBZGQgdG8gbW9kZWwgZ3JvdXBzIC0gY3JlYXRlIGEgc2luZ2xlIGRlZmF1bHQgZ3JvdXAgcGVyIHZlbmRvclxuXHRcdGNvbnN0IGdyb3VwcyA9IHRoaXMubW9kZWxHcm91cHMuZ2V0KHZlbmRvcklkKSB8fCBbXTtcblx0XHRpZiAoZ3JvdXBzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Z3JvdXBzLnB1c2goe1xuXHRcdFx0XHRncm91cDoge1xuXHRcdFx0XHRcdHZlbmRvcjogdmVuZG9ySWQsXG5cdFx0XHRcdFx0bmFtZTogdGhpcy52ZW5kb3JzLmZpbmQodiA9PiB2LnZlbmRvciA9PT0gdmVuZG9ySWQpPy5kaXNwbGF5TmFtZSB8fCAnRGVmYXVsdCdcblx0XHRcdFx0fSxcblx0XHRcdFx0bW9kZWxJZGVudGlmaWVyczogW11cblx0XHRcdH0pO1xuXHRcdH1cblx0XHRncm91cHNbMF0ubW9kZWxJZGVudGlmaWVycy5wdXNoKGlkZW50aWZpZXIpO1xuXHRcdHRoaXMubW9kZWxHcm91cHMuc2V0KHZlbmRvcklkLCBncm91cHMpO1xuXHR9XG5cblx0cmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIodmVuZG9yOiBzdHJpbmcsIHByb3ZpZGVyOiBJTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRkZWx0YUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJEZXNjcmlwdG9ycyhhZGRlZDogSVVzZXJGcmllbmRseUxhbmd1YWdlTW9kZWxbXSwgcmVtb3ZlZDogSVVzZXJGcmllbmRseUxhbmd1YWdlTW9kZWxbXSk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGdldFZlbmRvcnMoKTogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3JbXSB7XG5cdFx0cmV0dXJuIHRoaXMudmVuZG9ycy5tYXAodiA9PiAoeyAuLi52LCBpc0RlZmF1bHQ6IHYudmVuZG9yID09PSAnY29waWxvdCcgfSkpO1xuXHR9XG5cblx0Z2V0TGFuZ3VhZ2VNb2RlbElkcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5tb2RlbHMua2V5cygpKTtcblx0fVxuXG5cdGxvb2t1cExhbmd1YWdlTW9kZWwoaWRlbnRpZmllcjogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLm1vZGVscy5nZXQoaWRlbnRpZmllcik7XG5cdH1cblxuXHRsb29rdXBMYW5ndWFnZU1vZGVsQnlRdWFsaWZpZWROYW1lKHJlZmVyZW5jZU5hbWU6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBbaWRlbnRpZmllciwgbWV0YWRhdGFdIG9mIHRoaXMubW9kZWxzLmVudHJpZXMoKSkge1xuXHRcdFx0aWYgKElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLm1hdGNoZXNRdWFsaWZpZWROYW1lKHJlZmVyZW5jZU5hbWUsIG1ldGFkYXRhKSkge1xuXHRcdFx0XHRyZXR1cm4geyBtZXRhZGF0YSwgaWRlbnRpZmllciB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0TGFuZ3VhZ2VNb2RlbHMoKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtpZGVudGlmaWVyLCBtZXRhZGF0YV0gb2YgdGhpcy5tb2RlbHMuZW50cmllcygpKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7IGlkZW50aWZpZXIsIG1ldGFkYXRhIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0c2V0Q29udHJpYnV0ZWRTZXNzaW9uTW9kZWxzKCk6IHZvaWQge1xuXHR9XG5cblx0Y2xlYXJDb250cmlidXRlZFNlc3Npb25Nb2RlbHMoKTogdm9pZCB7XG5cdH1cblxuXHRhc3luYyBzZWxlY3RMYW5ndWFnZU1vZGVscyhzZWxlY3RvcjogSUxhbmd1YWdlTW9kZWxDaGF0U2VsZWN0b3IpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0aWYgKHNlbGVjdG9yLnZlbmRvcikge1xuXHRcdFx0cmV0dXJuIHRoaXMubW9kZWxzQnlWZW5kb3IuZ2V0KHNlbGVjdG9yLnZlbmRvcikgfHwgW107XG5cdFx0fVxuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMubW9kZWxzLmtleXMoKSk7XG5cdH1cblxuXHRzZW5kQ2hhdFJlcXVlc3QoKTogUHJvbWlzZTxhbnk+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRjb21wdXRlVG9rZW5MZW5ndGgoKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRnZXRNb2RlbENvbmZpZ3VyYXRpb24oX21vZGVsSWQ6IHN0cmluZyk6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgc2V0TW9kZWxDb25maWd1cmF0aW9uKF9tb2RlbElkOiBzdHJpbmcsIF92YWx1ZXM6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+KTogUHJvbWlzZTx2b2lkPiB7XG5cdH1cblxuXHRnZXRNb2RlbENvbmZpZ3VyYXRpb25BY3Rpb25zKF9tb2RlbElkOiBzdHJpbmcpOiBJQWN0aW9uW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFzeW5jIGNvbmZpZ3VyZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCh2ZW5kb3JJZDogc3RyaW5nLCBuYW1lPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdH1cblxuXHRhc3luYyByZW5hbWVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAodmVuZG9ySWQ6IHN0cmluZywgcHJvdmlkZXJHcm91cE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwQXBpS2V5KHZlbmRvcklkOiBzdHJpbmcsIHByb3ZpZGVyR3JvdXBOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0fVxuXG5cdGFzeW5jIGFkZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cE1vZGVsKHZlbmRvcklkOiBzdHJpbmcsIHByb3ZpZGVyR3JvdXBOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0fVxuXG5cdGFzeW5jIG9wZW5MYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBTZXR0aW5ncyh2ZW5kb3JJZDogc3RyaW5nLCBwcm92aWRlckdyb3VwTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdH1cblxuXHRhc3luYyBjb25maWd1cmVNb2RlbChfbW9kZWxJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdH1cblxuXHRhc3luYyBhZGRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAobmFtZTogc3RyaW5nLCB2ZW5kb3JJZDogc3RyaW5nLCBjb25maWd1cmF0aW9uOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHR9XG5cblx0Z2V0TGFuZ3VhZ2VNb2RlbEdyb3Vwcyh2ZW5kb3I6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsc0dyb3VwW10ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsR3JvdXBzLmdldCh2ZW5kb3IpIHx8IFtdO1xuXHR9XG5cblx0aGFzUmVzb2x2ZWRWZW5kb3IodmVuZG9yOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbEdyb3Vwcy5oYXModmVuZG9yKTtcblx0fVxuXG5cdGFzeW5jIHJlbW92ZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCh2ZW5kb3JJZDogc3RyaW5nLCBwcm92aWRlckdyb3VwTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdH1cblxuXHRhc3luYyBtaWdyYXRlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKGxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cDogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0Z2V0UmVjZW50bHlVc2VkTW9kZWxJZHMoKTogc3RyaW5nW10geyByZXR1cm4gW107IH1cblx0YWRkVG9SZWNlbnRseVVzZWRMaXN0KCk6IHZvaWQgeyB9XG5cdGNsZWFyUmVjZW50bHlVc2VkTGlzdCgpOiB2b2lkIHsgfVxuXHRnZXRQaW5uZWRNb2RlbElkcygpOiBzdHJpbmdbXSB7IHJldHVybiBbXTsgfVxuXHRwaW5Nb2RlbChfbW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHR1bnBpbk1vZGVsKF9tb2RlbElkZW50aWZpZXI6IHN0cmluZyk6IHZvaWQgeyB9XG5cdGlzTW9kZWxQaW5uZWQoX21vZGVsSWRlbnRpZmllcjogc3RyaW5nKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRvbkRpZENoYW5nZVBpbm5lZE1vZGVscyA9IEV2ZW50Lk5vbmU7XG5cdGlzTW9kZWxIaWRkZW4oX21vZGVsSWRlbnRpZmllcjogc3RyaW5nKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRpc0dyb3VwSGlkZGVuKF92ZW5kb3I6IHN0cmluZywgX2dyb3VwTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRzZXRNb2RlbEhpZGRlbihfbW9kZWxJZGVudGlmaWVyOiBzdHJpbmcsIF9oaWRkZW46IGJvb2xlYW4pOiB2b2lkIHsgfVxuXHRzZXRHcm91cEhpZGRlbihfdmVuZG9yOiBzdHJpbmcsIF9ncm91cE5hbWU6IHN0cmluZywgX2hpZGRlbjogYm9vbGVhbik6IHZvaWQgeyB9XG5cdGdldEhpZGRlbk1vZGVsSWRzKCk6IHN0cmluZ1tdIHsgcmV0dXJuIFtdOyB9XG5cdG9uRGlkQ2hhbmdlTW9kZWxWaXNpYmlsaXR5ID0gRXZlbnQuTm9uZTtcblx0Z2V0TW9kZWxzQ29udHJvbE1hbmlmZXN0KCk6IElNb2RlbHNDb250cm9sTWFuaWZlc3QgeyByZXR1cm4geyBmcmVlOiB7fSwgcGFpZDoge30gfTsgfVxuXHRyZXN0cmljdGVkQ2hhdFBhcnRpY2lwYW50cyA9IG9ic2VydmFibGVWYWx1ZSgncmVzdHJpY3RlZENoYXRQYXJ0aWNpcGFudHMnLCBPYmplY3QuY3JlYXRlKG51bGwpKTtcbn1cblxuc3VpdGUoJ0NoYXRNb2RlbHNWaWV3TW9kZWwnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IE1vY2tMYW5ndWFnZU1vZGVsc1NlcnZpY2U7XG5cdGxldCB2aWV3TW9kZWw6IENoYXRNb2RlbHNWaWV3TW9kZWw7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZSA9IG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKCk7XG5cblx0XHQvLyBTZXR1cCB0ZXN0IGRhdGFcblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkVmVuZG9yKHtcblx0XHRcdHZlbmRvcjogJ2NvcGlsb3QnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdHaXRIdWIgQ29waWxvdCcsXG5cdFx0XHRtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLFxuXHRcdFx0d2hlbjogdW5kZWZpbmVkLFxuXHRcdFx0Y29uZmlndXJhdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkVmVuZG9yKHtcblx0XHRcdHZlbmRvcjogJ29wZW5haScsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ09wZW5BSScsXG5cdFx0XHRtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLFxuXHRcdFx0d2hlbjogdW5kZWZpbmVkLFxuXHRcdFx0Y29uZmlndXJhdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkTW9kZWwoJ2NvcGlsb3QnLCAnY29waWxvdC1ncHQtNCcsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2dpdGh1Yi5jb3BpbG90JyksXG5cdFx0XHRpZDogJ2dwdC00Jyxcblx0XHRcdG5hbWU6ICdHUFQtNCcsXG5cdFx0XHRmYW1pbHk6ICdncHQtNCcsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdHZlbmRvcjogJ2NvcGlsb3QnLFxuXHRcdFx0bWF4SW5wdXRUb2tlbnM6IDgxOTIsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRcdHRvb2xDYWxsaW5nOiB0cnVlLFxuXHRcdFx0XHR2aXNpb246IHRydWUsXG5cdFx0XHRcdGFnZW50TW9kZTogZmFsc2Vcblx0XHRcdH0sXG5cdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge1xuXHRcdFx0XHRbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWVcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZS5hZGRNb2RlbCgnY29waWxvdCcsICdjb3BpbG90LWdwdC00bycsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2dpdGh1Yi5jb3BpbG90JyksXG5cdFx0XHRpZDogJ2dwdC00bycsXG5cdFx0XHRuYW1lOiAnR1BULTRvJyxcblx0XHRcdGZhbWlseTogJ2dwdC00Jyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0dmVuZG9yOiAnY29waWxvdCcsXG5cdFx0XHRtYXhJbnB1dFRva2VuczogODE5Mixcblx0XHRcdG1heE91dHB1dFRva2VuczogNDA5Nixcblx0XHRcdGlzVXNlclNlbGVjdGFibGU6IHRydWUsXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0dG9vbENhbGxpbmc6IHRydWUsXG5cdFx0XHRcdHZpc2lvbjogdHJ1ZSxcblx0XHRcdFx0YWdlbnRNb2RlOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHtcblx0XHRcdFx0W0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkTW9kZWwoJ29wZW5haScsICdvcGVuYWktZ3B0LTMuNScsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ29wZW5haS5hcGknKSxcblx0XHRcdGlkOiAnZ3B0LTMuNS10dXJibycsXG5cdFx0XHRuYW1lOiAnR1BULTMuNSBUdXJibycsXG5cdFx0XHRmYW1pbHk6ICdncHQtMy41Jyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0dmVuZG9yOiAnb3BlbmFpJyxcblx0XHRcdG1heElucHV0VG9rZW5zOiA0MDk2LFxuXHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAyMDQ4LFxuXHRcdFx0aXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSxcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHR0b29sQ2FsbGluZzogdHJ1ZSxcblx0XHRcdFx0dmlzaW9uOiBmYWxzZSxcblx0XHRcdFx0YWdlbnRNb2RlOiBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7XG5cdFx0XHRcdFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XTogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmFkZE1vZGVsKCdvcGVuYWknLCAnb3BlbmFpLWdwdC00LXZpc2lvbicsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ29wZW5haS5hcGknKSxcblx0XHRcdGlkOiAnZ3B0LTQtdmlzaW9uJyxcblx0XHRcdG5hbWU6ICdHUFQtNCBWaXNpb24nLFxuXHRcdFx0ZmFtaWx5OiAnZ3B0LTQnLFxuXHRcdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0XHR2ZW5kb3I6ICdvcGVuYWknLFxuXHRcdFx0bWF4SW5wdXRUb2tlbnM6IDgxOTIsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiBmYWxzZSxcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHR0b29sQ2FsbGluZzogZmFsc2UsXG5cdFx0XHRcdHZpc2lvbjogdHJ1ZSxcblx0XHRcdFx0YWdlbnRNb2RlOiBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7XG5cdFx0XHRcdFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XTogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dmlld01vZGVsID0gc3RvcmUuYWRkKG5ldyBDaGF0TW9kZWxzVmlld01vZGVsKGxhbmd1YWdlTW9kZWxzU2VydmljZSkpO1xuXG5cdFx0YXdhaXQgdmlld01vZGVsLnJlZnJlc2goKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZldGNoIGFsbCBtb2RlbHMgd2l0aG91dCBmaWx0ZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCcnKTtcblxuXHRcdC8vIFNob3VsZCBoYXZlIDIgdmVuZG9yIGVudHJpZXMgYW5kIDQgbW9kZWwgZW50cmllcyAoZ3JvdXBlZCBieSB2ZW5kb3IpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHMubGVuZ3RoLCA2KTtcblxuXHRcdGNvbnN0IHZlbmRvcnMgPSByZXN1bHRzLmZpbHRlcihpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmVuZG9ycy5sZW5ndGgsIDIpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gcmVzdWx0cy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCA0KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpbHRlciBieSBwcm92aWRlciBuYW1lICh2ZW5kb3IgSUQgYW5kIGRpc3BsYXkgbmFtZSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0c0J5Q29waWxvdElkID0gdmlld01vZGVsLmZpbHRlcignQHByb3ZpZGVyOmNvcGlsb3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0c0J5Q29waWxvdElkLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNCeUNvcGlsb3RJZFswXS50eXBlLCAndmVuZG9yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNCeUNvcGlsb3RJZFswXS52ZW5kb3JFbnRyeS52ZW5kb3IudmVuZG9yLCAnY29waWxvdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzQnlDb3BpbG90SWRbMV0udHlwZSwgJ21vZGVsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNCeUNvcGlsb3RJZFsxXS5tb2RlbC5pZGVudGlmaWVyLCAnY29waWxvdC1ncHQtNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzQnlDb3BpbG90SWRbMl0udHlwZSwgJ21vZGVsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNCeUNvcGlsb3RJZFsyXS5tb2RlbC5pZGVudGlmaWVyLCAnY29waWxvdC1ncHQtNG8nKTtcblxuXHRcdGNvbnN0IHJlc3VsdHNCeU9wZW5BSU5hbWUgPSB2aWV3TW9kZWwuZmlsdGVyKCdAcHJvdmlkZXI6T3BlbkFJJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNCeU9wZW5BSU5hbWUubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0c0J5T3BlbkFJTmFtZVswXS50eXBlLCAndmVuZG9yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNCeU9wZW5BSU5hbWVbMF0udmVuZG9yRW50cnkudmVuZG9yLnZlbmRvciwgJ29wZW5haScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzQnlPcGVuQUlOYW1lWzFdLnR5cGUsICdtb2RlbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzQnlPcGVuQUlOYW1lWzFdLm1vZGVsLmlkZW50aWZpZXIsICdvcGVuYWktZ3B0LTMuNScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzQnlPcGVuQUlOYW1lWzJdLnR5cGUsICdtb2RlbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzQnlPcGVuQUlOYW1lWzJdLm1vZGVsLmlkZW50aWZpZXIsICdvcGVuYWktZ3B0LTQtdmlzaW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBmaWx0ZXIgYnkgbXVsdGlwbGUgcHJvdmlkZXJzIHdpdGggT1IgbG9naWMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHZpZXdNb2RlbC5maWx0ZXIoJ0Bwcm92aWRlcjpjb3BpbG90IEBwcm92aWRlcjpvcGVuYWknKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBmaWx0ZXIgYnkgc2luZ2xlIGNhcGFiaWxpdHkgLSB0b29scycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6dG9vbHMnKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVscy5ldmVyeShtID0+IG0ubW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy50b29sQ2FsbGluZyA9PT0gdHJ1ZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZmlsdGVyIGJ5IHNpbmdsZSBjYXBhYmlsaXR5IC0gdmlzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdAY2FwYWJpbGl0eTp2aXNpb24nKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVscy5ldmVyeShtID0+IG0ubW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy52aXNpb24gPT09IHRydWUpKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpbHRlciBieSBzaW5nbGUgY2FwYWJpbGl0eSAtIGFnZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdAY2FwYWJpbGl0eTphZ2VudCcpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gcmVzdWx0cy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzWzBdLm1vZGVsLm1ldGFkYXRhLmlkLCAnZ3B0LTRvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBmaWx0ZXIgYnkgbXVsdGlwbGUgY2FwYWJpbGl0aWVzIHdpdGggQU5EIGxvZ2ljJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdAY2FwYWJpbGl0eTp0b29scyBAY2FwYWJpbGl0eTp2aXNpb24nKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHQvLyBTaG91bGQgb25seSByZXR1cm4gbW9kZWxzIHRoYXQgaGF2ZSBCT1RIIHRvb2xzIGFuZCB2aXNpb25cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVscy5ldmVyeShtID0+XG5cdFx0XHRtLm1vZGVsLm1ldGFkYXRhLmNhcGFiaWxpdGllcz8udG9vbENhbGxpbmcgPT09IHRydWUgJiZcblx0XHRcdG0ubW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy52aXNpb24gPT09IHRydWVcblx0XHQpKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpbHRlciBieSB0aHJlZSBjYXBhYmlsaXRpZXMgd2l0aCBBTkQgbG9naWMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHZpZXdNb2RlbC5maWx0ZXIoJ0BjYXBhYmlsaXR5OnRvb2xzIEBjYXBhYmlsaXR5OnZpc2lvbiBAY2FwYWJpbGl0eTphZ2VudCcpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gcmVzdWx0cy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdC8vIFNob3VsZCBvbmx5IHJldHVybiBncHQtNG8gd2hpY2ggaGFzIGFsbCB0aHJlZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzWzBdLm1vZGVsLm1ldGFkYXRhLmlkLCAnZ3B0LTRvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gbm8gcmVzdWx0cyB3aGVuIGZpbHRlcmluZyBieSBpbmNvbXBhdGlibGUgY2FwYWJpbGl0aWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdAY2FwYWJpbGl0eTp2aXNpb24gQGNhcGFiaWxpdHk6YWdlbnQnKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHQvLyBPbmx5IGdwdC00byBoYXMgYm90aCB2aXNpb24gYW5kIGFnZW50LCBidXQgZ3B0LTQtdmlzaW9uIGRvZXNuJ3QgaGF2ZSBhZ2VudFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzWzBdLm1vZGVsLm1ldGFkYXRhLmlkLCAnZ3B0LTRvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBjb21iaW5lIHByb3ZpZGVyIGFuZCBjYXBhYmlsaXR5IGZpbHRlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHZpZXdNb2RlbC5maWx0ZXIoJ0Bwcm92aWRlcjpjb3BpbG90IEBjYXBhYmlsaXR5OnZpc2lvbicpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gcmVzdWx0cy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2sobW9kZWxzLmV2ZXJ5KG0gPT5cblx0XHRcdG0ubW9kZWwucHJvdmlkZXIudmVuZG9yLnZlbmRvciA9PT0gJ2NvcGlsb3QnICYmXG5cdFx0XHRtLm1vZGVsLm1ldGFkYXRhLmNhcGFiaWxpdGllcz8udmlzaW9uID09PSB0cnVlXG5cdFx0KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBmaWx0ZXIgYnkgdGV4dCBtYXRjaGluZyBtb2RlbCBuYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdHUFQtNG8nKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsc1swXS5tb2RlbC5tZXRhZGF0YS5uYW1lLCAnR1BULTRvJyk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsc1swXS5tb2RlbE5hbWVNYXRjaGVzKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpbHRlciBieSB0ZXh0IG1hdGNoaW5nIG1vZGVsIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdncHQtNG8nKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsc1swXS5tb2RlbC5pZGVudGlmaWVyLCAnY29waWxvdC1ncHQtNG8nKTtcblx0XHRhc3NlcnQub2sobW9kZWxzWzBdLm1vZGVsSWRNYXRjaGVzKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpbHRlciBieSB0ZXh0IG1hdGNoaW5nIHZlbmRvciBuYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdHaXRIdWInKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVscy5ldmVyeShtID0+IG0ubW9kZWwucHJvdmlkZXIuZ3JvdXAubmFtZSA9PT0gJ0dpdEh1YiBDb3BpbG90JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgY29tYmluZSB0ZXh0IHNlYXJjaCB3aXRoIGNhcGFiaWxpdHkgZmlsdGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdAY2FwYWJpbGl0eTp0b29scyBHUFQnKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHQvLyBTaG91bGQgbWF0Y2ggYWxsIG1vZGVscyB3aXRoIHRvb2xzIGNhcGFiaWxpdHkgYW5kICdHUFQnIGluIG5hbWVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVscy5ldmVyeShtID0+IG0ubW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy50b29sQ2FsbGluZyA9PT0gdHJ1ZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIGVtcHR5IHNlYXJjaCB2YWx1ZScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcignJyk7XG5cblx0XHQvLyBTaG91bGQgcmV0dXJuIGFsbCBtb2RlbHMgZ3JvdXBlZCBieSB2ZW5kb3Jcblx0XHRhc3NlcnQub2socmVzdWx0cy5sZW5ndGggPiAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBzZWFyY2ggdmFsdWUgd2l0aCBvbmx5IHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHZpZXdNb2RlbC5maWx0ZXIoJyAgICcpO1xuXG5cdFx0Ly8gU2hvdWxkIHJldHVybiBhbGwgbW9kZWxzIGdyb3VwZWQgYnkgdmVuZG9yXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdHMubGVuZ3RoID4gMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBtYXRjaCBjYXBhYmlsaXR5IHRleHQgaW4gZnJlZSB0ZXh0IHNlYXJjaCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcigndmlzaW9uJyk7XG5cblx0XHRjb25zdCBtb2RlbHMgPSByZXN1bHRzLmZpbHRlcihyID0+ICFpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpICYmICFpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KHIpKSBhcyBJTGFuZ3VhZ2VNb2RlbEVudHJ5W107XG5cdFx0Ly8gU2hvdWxkIG1hdGNoIG1vZGVscyB0aGF0IGhhdmUgdmlzaW9uIGNhcGFiaWxpdHkgb3IgXCJ2aXNpb25cIiBpbiB0aGVpciBuYW1lXG5cdFx0YXNzZXJ0Lm9rKG1vZGVscy5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQub2sobW9kZWxzLmV2ZXJ5KG0gPT5cblx0XHRcdG0ubW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy52aXNpb24gPT09IHRydWUgfHxcblx0XHRcdG0ubW9kZWwubWV0YWRhdGEubmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCd2aXNpb24nKVxuXHRcdCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgdG9nZ2xlIHZlbmRvciBjb2xsYXBzZWQgc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmVuZG9yRW50cnkgPSB2aWV3TW9kZWwudmlld01vZGVsRW50cmllcy5maW5kKHIgPT4gaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiByLnZlbmRvckVudHJ5LnZlbmRvci52ZW5kb3IgPT09ICdjb3BpbG90JykgYXMgSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5O1xuXHRcdHZpZXdNb2RlbC50b2dnbGVDb2xsYXBzZWQodmVuZG9yRW50cnkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0cyA9IHZpZXdNb2RlbC5maWx0ZXIoJycpO1xuXHRcdGNvbnN0IGNvcGlsb3RWZW5kb3IgPSByZXN1bHRzLmZpbmQociA9PiBpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpICYmIChyIGFzIElMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSkudmVuZG9yRW50cnkudmVuZG9yLnZlbmRvciA9PT0gJ2NvcGlsb3QnKSBhcyBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnk7XG5cdFx0YXNzZXJ0Lm9rKGNvcGlsb3RWZW5kb3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3BpbG90VmVuZG9yLmNvbGxhcHNlZCwgdHJ1ZSk7XG5cblx0XHQvLyBNb2RlbHMgc2hvdWxkIG5vdCBiZSBzaG93biB3aGVuIHZlbmRvciBpcyBjb2xsYXBzZWRcblx0XHRjb25zdCBjb3BpbG90TW9kZWxzQWZ0ZXJDb2xsYXBzZSA9IHJlc3VsdHMuZmlsdGVyKHIgPT5cblx0XHRcdCFpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpICYmIChyIGFzIElMYW5ndWFnZU1vZGVsRW50cnkpLm1vZGVsLnByb3ZpZGVyLnZlbmRvci52ZW5kb3IgPT09ICdjb3BpbG90J1xuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvcGlsb3RNb2RlbHNBZnRlckNvbGxhcHNlLmxlbmd0aCwgMCk7XG5cblx0XHQvLyBUb2dnbGUgYmFja1xuXHRcdHZpZXdNb2RlbC50b2dnbGVDb2xsYXBzZWQodmVuZG9yRW50cnkpO1xuXHRcdGNvbnN0IHJlc3VsdHNBZnRlckV4cGFuZCA9IHZpZXdNb2RlbC5maWx0ZXIoJycpO1xuXHRcdGNvbnN0IGNvcGlsb3RNb2RlbHNBZnRlckV4cGFuZCA9IHJlc3VsdHNBZnRlckV4cGFuZC5maWx0ZXIociA9PlxuXHRcdFx0IWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgKHIgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeSkubW9kZWwucHJvdmlkZXIudmVuZG9yLnZlbmRvciA9PT0gJ2NvcGlsb3QnXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29waWxvdE1vZGVsc0FmdGVyRXhwYW5kLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcXVvdGVkIHNlYXJjaCBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdC8vIFdoZW4gYSBzZWFyY2ggc3RyaW5nIGlzIGZ1bGx5IHF1b3RlZCAoc3RhcnRzIGFuZCBlbmRzIHdpdGggcXVvdGVzKSxcblx0XHQvLyB0aGUgY29tcGxldGVNYXRjaCBmbGFnIGlzIHNldCB0byB0cnVlLCB3aGljaCBjdXJyZW50bHkgc2tpcHMgYWxsIG1hdGNoaW5nXG5cdFx0Ly8gVGhpcyB0ZXN0IHZlcmlmaWVzIHRoZSBxdW90ZXMgYXJlIHByb2Nlc3NlZCB3aXRob3V0IGVycm9yc1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdcIkdQVFwiJyk7XG5cblx0XHQvLyBUaGUgZnVuY3Rpb24gc2hvdWxkIGNvbXBsZXRlIHdpdGhvdXQgZXJyb3Jcblx0XHQvLyBOb3RlOiBjb21wbGV0ZSBtYXRjaCBsb2dpYyAoYm90aCBxdW90ZXMpIGN1cnJlbnRseSBkb2Vzbid0IHBlcmZvcm0gbWF0Y2hpbmdcblx0XHRhc3NlcnQub2soQXJyYXkuaXNBcnJheShyZXN1bHRzKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZW1vdmUgZmlsdGVyIGtleXdvcmRzIGZyb20gdGV4dCBzZWFyY2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHZpZXdNb2RlbC5maWx0ZXIoJ0Bwcm92aWRlcjpjb3BpbG90IEBjYXBhYmlsaXR5OnZpc2lvbiBHUFQnKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHQvLyBTaG91bGQgb25seSBzZWFyY2ggJ0dQVCcgaW4gbW9kZWwgbmFtZXMsIG5vdCB0aGUgZmlsdGVyIGtleXdvcmRzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVscy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5vayhtb2RlbHMuZXZlcnkobSA9PiBtLm1vZGVsLnByb3ZpZGVyLnZlbmRvci52ZW5kb3IgPT09ICdjb3BpbG90JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIGNhc2UtaW5zZW5zaXRpdmUgY2FwYWJpbGl0eSBtYXRjaGluZycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzMSA9IHZpZXdNb2RlbC5maWx0ZXIoJ0BjYXBhYmlsaXR5OlRPT0xTJyk7XG5cdFx0Y29uc3QgcmVzdWx0czIgPSB2aWV3TW9kZWwuZmlsdGVyKCdAY2FwYWJpbGl0eTp0b29scycpO1xuXHRcdGNvbnN0IHJlc3VsdHMzID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6VG9vbHMnKTtcblxuXHRcdGNvbnN0IG1vZGVsczEgPSByZXN1bHRzMS5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSk7XG5cdFx0Y29uc3QgbW9kZWxzMiA9IHJlc3VsdHMyLmZpbHRlcihyID0+ICFpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpKTtcblx0XHRjb25zdCBtb2RlbHMzID0gcmVzdWx0czMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsczEubGVuZ3RoLCBtb2RlbHMyLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsczIubGVuZ3RoLCBtb2RlbHMzLmxlbmd0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBzdXBwb3J0IHRvb2xjYWxsaW5nIGFsaWFzIGZvciB0b29scyBjYXBhYmlsaXR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHNUb29scyA9IHZpZXdNb2RlbC5maWx0ZXIoJ0BjYXBhYmlsaXR5OnRvb2xzJyk7XG5cdFx0Y29uc3QgcmVzdWx0c1Rvb2xDYWxsaW5nID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6dG9vbGNhbGxpbmcnKTtcblxuXHRcdGNvbnN0IG1vZGVsc1Rvb2xzID0gcmVzdWx0c1Rvb2xzLmZpbHRlcihyID0+ICFpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpKTtcblx0XHRjb25zdCBtb2RlbHNUb29sQ2FsbGluZyA9IHJlc3VsdHNUb29sQ2FsbGluZy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzVG9vbHMubGVuZ3RoLCBtb2RlbHNUb29sQ2FsbGluZy5sZW5ndGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc3VwcG9ydCBhZ2VudG1vZGUgYWxpYXMgZm9yIGFnZW50IGNhcGFiaWxpdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0c0FnZW50ID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6YWdlbnQnKTtcblx0XHRjb25zdCByZXN1bHRzQWdlbnRNb2RlID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6YWdlbnRtb2RlJyk7XG5cblx0XHRjb25zdCBtb2RlbHNBZ2VudCA9IHJlc3VsdHNBZ2VudC5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSk7XG5cdFx0Y29uc3QgbW9kZWxzQWdlbnRNb2RlID0gcmVzdWx0c0FnZW50TW9kZS5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxzQWdlbnQubGVuZ3RoLCBtb2RlbHNBZ2VudE1vZGUubGVuZ3RoKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgbWF0Y2hlZCBjYXBhYmlsaXRpZXMgaW4gcmVzdWx0cycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6dG9vbHMgQGNhcGFiaWxpdHk6dmlzaW9uJyk7XG5cblx0XHRjb25zdCBtb2RlbHMgPSByZXN1bHRzLmZpbHRlcihyID0+ICFpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpICYmICFpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KHIpKSBhcyBJTGFuZ3VhZ2VNb2RlbEVudHJ5W107XG5cdFx0YXNzZXJ0Lm9rKG1vZGVscy5sZW5ndGggPiAwKTtcblxuXHRcdGZvciAoY29uc3QgbW9kZWwgb2YgbW9kZWxzKSB7XG5cdFx0XHRhc3NlcnQub2sobW9kZWwuY2FwYWJpbGl0eU1hdGNoZXMpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1vZGVsLmNhcGFiaWxpdHlNYXRjaGVzLmxlbmd0aCA+IDApO1xuXHRcdFx0Ly8gU2hvdWxkIGluY2x1ZGUgYm90aCB0b29sQ2FsbGluZyBhbmQgdmlzaW9uXG5cdFx0XHRhc3NlcnQub2sobW9kZWwuY2FwYWJpbGl0eU1hdGNoZXMuc29tZShjID0+IGMgPT09ICd0b29sQ2FsbGluZycgfHwgYyA9PT0gJ3Zpc2lvbicpKTtcblx0XHR9XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNpbmdsZVZlbmRvclZpZXdNb2RlbChpbmNsdWRlU2Vjb25kTW9kZWw6IGJvb2xlYW4gPSB0cnVlKTogeyBzZXJ2aWNlOiBNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOyB2aWV3TW9kZWw6IENoYXRNb2RlbHNWaWV3TW9kZWwgfSB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKCk7XG5cdFx0c2VydmljZS5hZGRWZW5kb3Ioe1xuXHRcdFx0dmVuZG9yOiAnY29waWxvdCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0dpdEh1YiBDb3BpbG90Jyxcblx0XHRcdG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsXG5cdFx0XHR3aGVuOiB1bmRlZmluZWQsXG5cdFx0XHRjb25maWd1cmF0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblxuXHRcdHNlcnZpY2UuYWRkTW9kZWwoJ2NvcGlsb3QnLCAnY29waWxvdC1ncHQtNCcsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2dpdGh1Yi5jb3BpbG90JyksXG5cdFx0XHRpZDogJ2dwdC00Jyxcblx0XHRcdG5hbWU6ICdHUFQtNCcsXG5cdFx0XHRmYW1pbHk6ICdncHQtNCcsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdHZlbmRvcjogJ2NvcGlsb3QnLFxuXHRcdFx0bWF4SW5wdXRUb2tlbnM6IDgxOTIsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRcdHRvb2xDYWxsaW5nOiB0cnVlLFxuXHRcdFx0XHR2aXNpb246IHRydWUsXG5cdFx0XHRcdGFnZW50TW9kZTogZmFsc2Vcblx0XHRcdH0sXG5cdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge1xuXHRcdFx0XHRbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWVcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChpbmNsdWRlU2Vjb25kTW9kZWwpIHtcblx0XHRcdHNlcnZpY2UuYWRkTW9kZWwoJ2NvcGlsb3QnLCAnY29waWxvdC1ncHQtNG8nLCB7XG5cdFx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2dpdGh1Yi5jb3BpbG90JyksXG5cdFx0XHRcdGlkOiAnZ3B0LTRvJyxcblx0XHRcdFx0bmFtZTogJ0dQVC00bycsXG5cdFx0XHRcdGZhbWlseTogJ2dwdC00Jyxcblx0XHRcdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0XHRcdHZlbmRvcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHRtYXhJbnB1dFRva2VuczogODE5Mixcblx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiA0MDk2LFxuXHRcdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0XHR0b29sQ2FsbGluZzogdHJ1ZSxcblx0XHRcdFx0XHR2aXNpb246IHRydWUsXG5cdFx0XHRcdFx0YWdlbnRNb2RlOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7XG5cdFx0XHRcdFx0W0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHN0b3JlLmFkZChuZXcgQ2hhdE1vZGVsc1ZpZXdNb2RlbChzZXJ2aWNlKSk7XG5cdFx0cmV0dXJuIHsgc2VydmljZSwgdmlld01vZGVsIH07XG5cdH1cblxuXHR0ZXN0KCdzaG91bGQgbm90IHNob3cgdmVuZG9yIGhlYWRlciB3aGVuIG9ubHkgb25lIHZlbmRvciBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB2aWV3TW9kZWw6IHNpbmdsZVZlbmRvclZpZXdNb2RlbCB9ID0gY3JlYXRlU2luZ2xlVmVuZG9yVmlld01vZGVsKCk7XG5cdFx0YXdhaXQgc2luZ2xlVmVuZG9yVmlld01vZGVsLnJlZnJlc2goKTtcblxuXHRcdGNvbnN0IHJlc3VsdHMgPSBzaW5nbGVWZW5kb3JWaWV3TW9kZWwuZmlsdGVyKCcnKTtcblxuXHRcdC8vIFNob3VsZCBoYXZlIG9ubHkgbW9kZWwgZW50cmllcywgbm8gdmVuZG9yIGVudHJ5XG5cdFx0Y29uc3QgdmVuZG9ycyA9IHJlc3VsdHMuZmlsdGVyKGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZW5kb3JzLmxlbmd0aCwgMCwgJ1Nob3VsZCBub3Qgc2hvdyB2ZW5kb3IgaGVhZGVyIHdoZW4gb25seSBvbmUgdmVuZG9yIGV4aXN0cycpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gcmVzdWx0cy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCAyLCAnU2hvdWxkIHNob3cgYWxsIG1vZGVscycpO1xuXHRcdGFzc2VydC5vayhtb2RlbHMuZXZlcnkobSA9PiBtLm1vZGVsLnByb3ZpZGVyLnZlbmRvci52ZW5kb3IgPT09ICdjb3BpbG90JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc2hvdyB2ZW5kb3IgaGVhZGVycyB3aGVuIG11bHRpcGxlIHZlbmRvcnMgZXhpc3QnLCAoKSA9PiB7XG5cdFx0Ly8gVGhpcyBpcyB0aGUgZXhpc3RpbmcgYmVoYXZpb3IgdGVzdFxuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCcnKTtcblxuXHRcdC8vIFNob3VsZCBoYXZlIDIgdmVuZG9yIGVudHJpZXMgYW5kIDQgbW9kZWwgZW50cmllcyAoZ3JvdXBlZCBieSB2ZW5kb3IpXG5cdFx0Y29uc3QgdmVuZG9ycyA9IHJlc3VsdHMuZmlsdGVyKGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZW5kb3JzLmxlbmd0aCwgMiwgJ1Nob3VsZCBzaG93IHZlbmRvciBoZWFkZXJzIHdoZW4gbXVsdGlwbGUgdmVuZG9ycyBleGlzdCcpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gcmVzdWx0cy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCA0KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpbHRlciBzaW5nbGUgdmVuZG9yIG1vZGVscyBieSBjYXBhYmlsaXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgdmlld01vZGVsOiBzaW5nbGVWZW5kb3JWaWV3TW9kZWwgfSA9IGNyZWF0ZVNpbmdsZVZlbmRvclZpZXdNb2RlbCgpO1xuXHRcdGF3YWl0IHNpbmdsZVZlbmRvclZpZXdNb2RlbC5yZWZyZXNoKCk7XG5cblx0XHRjb25zdCByZXN1bHRzID0gc2luZ2xlVmVuZG9yVmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6YWdlbnQnKTtcblxuXHRcdC8vIFNob3VsZCBub3Qgc2hvdyB2ZW5kb3IgaGVhZGVyXG5cdFx0Y29uc3QgdmVuZG9ycyA9IHJlc3VsdHMuZmlsdGVyKGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZW5kb3JzLmxlbmd0aCwgMCwgJ1Nob3VsZCBub3Qgc2hvdyB2ZW5kb3IgaGVhZGVyJyk7XG5cblx0XHQvLyBTaG91bGQgb25seSBzaG93IHRoZSBtb2RlbCB3aXRoIGFnZW50IGNhcGFiaWxpdHlcblx0XHRjb25zdCBtb2RlbHMgPSByZXN1bHRzLmZpbHRlcihyID0+ICFpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpICYmICFpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KHIpKSBhcyBJTGFuZ3VhZ2VNb2RlbEVudHJ5W107XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHNbMF0ubW9kZWwubWV0YWRhdGEuaWQsICdncHQtNG8nKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGFsd2F5cyBwbGFjZSBjb3BpbG90IHZlbmRvciBhdCB0aGUgdG9wIHdoZW4gbXVsdGlwbGUgdmVuZG9ycyBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUZXN0IHdpdGggZGVmYXVsdCBzZXR1cCAoY29waWxvdCBhbmQgb3BlbmFpKVxuXHRcdGxldCByZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcignJyk7XG5cdFx0bGV0IHZlbmRvcnMgPSByZXN1bHRzLmZpbHRlcihpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KSBhcyBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnlbXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmVuZG9yc1swXS52ZW5kb3JFbnRyeS52ZW5kb3IudmVuZG9yLCAnY29waWxvdCcpO1xuXG5cdFx0Ly8gQWRkIG1vcmUgdmVuZG9ycyB0byBlbnN1cmUgc29ydGluZyB3b3JrcyBjb3JyZWN0bHlcblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkVmVuZG9yKHtcblx0XHRcdHZlbmRvcjogJ2FudGhyb3BpYycsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0FudGhyb3BpYycsXG5cdFx0XHRtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLFxuXHRcdFx0d2hlbjogdW5kZWZpbmVkLFxuXHRcdFx0Y29uZmlndXJhdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkTW9kZWwoJ2FudGhyb3BpYycsICdhbnRocm9waWMtY2xhdWRlJywge1xuXHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignYW50aHJvcGljLmFwaScpLFxuXHRcdFx0aWQ6ICdjbGF1ZGUtMycsXG5cdFx0XHRuYW1lOiAnQ2xhdWRlIDMnLFxuXHRcdFx0ZmFtaWx5OiAnY2xhdWRlJyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0dmVuZG9yOiAnYW50aHJvcGljJyxcblx0XHRcdG1heElucHV0VG9rZW5zOiAxMDAwMDAsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRcdHRvb2xDYWxsaW5nOiB0cnVlLFxuXHRcdFx0XHR2aXNpb246IGZhbHNlLFxuXHRcdFx0XHRhZ2VudE1vZGU6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHtcblx0XHRcdFx0W0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkVmVuZG9yKHtcblx0XHRcdHZlbmRvcjogJ2F6dXJlJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnQXp1cmUgT3BlbkFJJyxcblx0XHRcdG1hbmFnZW1lbnRDb21tYW5kOiB1bmRlZmluZWQsXG5cdFx0XHR3aGVuOiB1bmRlZmluZWQsXG5cdFx0XHRjb25maWd1cmF0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblxuXHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZS5hZGRNb2RlbCgnYXp1cmUnLCAnYXp1cmUtZ3B0LTQnLCB7XG5cdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdtaWNyb3NvZnQuYXp1cmUnKSxcblx0XHRcdGlkOiAnYXp1cmUtZ3B0LTQnLFxuXHRcdFx0bmFtZTogJ0F6dXJlIEdQVC00Jyxcblx0XHRcdGZhbWlseTogJ2dwdC00Jyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0dmVuZG9yOiAnYXp1cmUnLFxuXHRcdFx0bWF4SW5wdXRUb2tlbnM6IDgxOTIsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRcdHRvb2xDYWxsaW5nOiB0cnVlLFxuXHRcdFx0XHR2aXNpb246IGZhbHNlLFxuXHRcdFx0XHRhZ2VudE1vZGU6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHtcblx0XHRcdFx0W0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhd2FpdCB2aWV3TW9kZWwucmVmcmVzaCgpO1xuXG5cdFx0Ly8gVGVzdCB3aXRoIGFsbCBmaWx0ZXJzIGFuZCBzZWFyY2hlc1xuXHRcdHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCcnKTtcblx0XHR2ZW5kb3JzID0gcmVzdWx0cy5maWx0ZXIoaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSkgYXMgSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5W107XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZlbmRvcnMubGVuZ3RoLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmVuZG9yc1swXS52ZW5kb3JFbnRyeS52ZW5kb3IudmVuZG9yLCAnY29waWxvdCcpO1xuXHRcdC8vIE90aGVyIHZlbmRvcnMgc2hvdWxkIGJlIGFscGhhYmV0aWNhbGx5IHNvcnRlZDogYW50aHJvcGljLCBhenVyZSwgb3BlbmFpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZlbmRvcnNbMV0udmVuZG9yRW50cnkudmVuZG9yLnZlbmRvciwgJ2FudGhyb3BpYycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZW5kb3JzWzJdLnZlbmRvckVudHJ5LnZlbmRvci52ZW5kb3IsICdhenVyZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZW5kb3JzWzNdLnZlbmRvckVudHJ5LnZlbmRvci52ZW5kb3IsICdvcGVuYWknKTtcblxuXHRcdC8vIFRlc3Qgd2l0aCB0ZXh0IHNlYXJjaFxuXHRcdHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdHUFQnKTtcblx0XHR2ZW5kb3JzID0gcmVzdWx0cy5maWx0ZXIoaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSkgYXMgSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5W107XG5cdFx0aWYgKHZlbmRvcnMubGVuZ3RoID4gMSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZlbmRvcnNbMF0udmVuZG9yRW50cnkudmVuZG9yLnZlbmRvciwgJ2NvcGlsb3QnKTtcblx0XHR9XG5cblx0XHQvLyBUZXN0IHdpdGggY2FwYWJpbGl0eSBmaWx0ZXJcblx0XHRyZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6dG9vbHMnKTtcblx0XHR2ZW5kb3JzID0gcmVzdWx0cy5maWx0ZXIoaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSkgYXMgSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5W107XG5cdFx0aWYgKHZlbmRvcnMubGVuZ3RoID4gMSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZlbmRvcnNbMF0udmVuZG9yRW50cnkudmVuZG9yLnZlbmRvciwgJ2NvcGlsb3QnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBzaG93IHZlbmRvciBoZWFkZXJzIHdoZW4gZmlsdGVyZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHZpZXdNb2RlbC5maWx0ZXIoJ0dQVCcpO1xuXHRcdGNvbnN0IHZlbmRvcnMgPSByZXN1bHRzLmZpbHRlcihpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KTtcblx0XHRhc3NlcnQub2sodmVuZG9ycy5sZW5ndGggPiAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBzaG93IHZlbmRvciBoZWFkZXJzIHdoZW4gZmlsdGVyZWQgaWYgb25seSBvbmUgdmVuZG9yIGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHZpZXdNb2RlbDogc2luZ2xlVmVuZG9yVmlld01vZGVsIH0gPSBjcmVhdGVTaW5nbGVWZW5kb3JWaWV3TW9kZWwoKTtcblx0XHRhd2FpdCBzaW5nbGVWZW5kb3JWaWV3TW9kZWwucmVmcmVzaCgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0cyA9IHNpbmdsZVZlbmRvclZpZXdNb2RlbC5maWx0ZXIoJ0dQVCcpO1xuXHRcdGNvbnN0IHZlbmRvcnMgPSByZXN1bHRzLmZpbHRlcihpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmVuZG9ycy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZ2V0IGNvbmZpZ3VyZWQgdmVuZG9ycycsICgpID0+IHtcblx0XHRjb25zdCB2ZW5kb3JzID0gdmlld01vZGVsLmdldENvbmZpZ3VyZWRWZW5kb3JzKCk7XG5cdFx0YXNzZXJ0Lm9rKHZlbmRvcnMubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHZlbmRvcnMuc29tZSh2ID0+IHYudmVuZG9yLnZlbmRvciA9PT0gJ2NvcGlsb3QnKSk7XG5cdFx0YXNzZXJ0Lm9rKHZlbmRvcnMuc29tZSh2ID0+IHYudmVuZG9yLnZlbmRvciA9PT0gJ29wZW5haScpKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiB0cnVlIGZvciBzaG91bGRSZWZpbHRlciB3aGVuIG1vZGVscyBub3Qgc29ydGVkJywgKCkgPT4ge1xuXHRcdC8vIEFmdGVyIGEgbmV3IGZpbHRlciBjYWxsLCBtb2RlbHMgc2hvdWxkIGJlIHNvcnRlZFxuXHRcdHZpZXdNb2RlbC5maWx0ZXIoJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2hvdWxkUmVmaWx0ZXIoKSwgZmFsc2UpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgdW5zb3J0ZWQgc3RhdGUgYnkgYWNjZXNzaW5nIHByaXZhdGUgcHJvcGVydHkgaW5kaXJlY3RseVxuXHRcdC8vIFRoaXMgaXMgYSBzaW1wbGUgdGVzdCB0aGF0IHNob3VsZFJlZmlsdGVyIHdvcmtzXG5cdFx0Y29uc3QgcmVzdWx0ID0gdmlld01vZGVsLnNob3VsZFJlZmlsdGVyKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHQsICdib29sZWFuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBjb2xsYXBzZSBhbGwgZ3JvdXBzIGFuZCBtb2RlbHMnLCAoKSA9PiB7XG5cdFx0Ly8gRXhwYW5kIGV2ZXJ5dGhpbmcgZmlyc3Rcblx0XHRjb25zdCByZXN1bHRzMSA9IHZpZXdNb2RlbC5maWx0ZXIoJycpO1xuXHRcdGxldCBtb2RlbHMgPSByZXN1bHRzMS5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdGFzc2VydC5vayhtb2RlbHMubGVuZ3RoID4gMCk7XG5cblx0XHQvLyBDb2xsYXBzZSBhbGxcblx0XHR2aWV3TW9kZWwuY29sbGFwc2VBbGwoKTtcblxuXHRcdC8vIEFmdGVyIGNvbGxhcHNlIGFsbCwgb25seSBncm91cC92ZW5kb3IgaGVhZGVycyBzaG91bGQgYmUgc2hvd25cblx0XHRjb25zdCByZXN1bHRzMiA9IHZpZXdNb2RlbC5maWx0ZXIoJycpO1xuXHRcdGNvbnN0IHZlbmRvcnMgPSByZXN1bHRzMi5maWx0ZXIoaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSk7XG5cdFx0bW9kZWxzID0gcmVzdWx0czIuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblxuXHRcdGFzc2VydC5vayh2ZW5kb3JzLmxlbmd0aCA+IDAsICdTaG91bGQgaGF2ZSB2ZW5kb3IgaGVhZGVycycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCAwLCAnU2hvdWxkIGhhdmUgbm8gbW9kZWxzIHZpc2libGUgYWZ0ZXIgY29sbGFwc2UgYWxsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBtYXRjaCBxdW90ZWQgc2VhcmNoIHN0cmluZ3Mgd2l0aCBmaWx0ZXJzJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgdGhhdCBxdW90ZXMgZG9uJ3QgYnJlYWsgd2hlbiBjb21iaW5lZCB3aXRoIG90aGVyIGZpbHRlcnNcblx0XHRjb25zdCByZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcignQGNhcGFiaWxpdHk6dG9vbHMgXCJHUFRcIicpO1xuXHRcdGFzc2VydC5vayhBcnJheS5pc0FycmF5KHJlc3VsdHMpKTtcblx0XHQvLyBTaG91bGQgaGFuZGxlIHdpdGhvdXQgZXJyb3Jcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpbHRlciBieSBjYXNlLWluc2Vuc2l0aXZlIHByb3ZpZGVyIG5hbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0czEgPSB2aWV3TW9kZWwuZmlsdGVyKCdAcHJvdmlkZXI6Q09QSUxPVCcpO1xuXHRcdGNvbnN0IHJlc3VsdHMyID0gdmlld01vZGVsLmZpbHRlcignQHByb3ZpZGVyOmNvcGlsb3QnKTtcblx0XHRjb25zdCByZXN1bHRzMyA9IHZpZXdNb2RlbC5maWx0ZXIoJ0Bwcm92aWRlcjpDb3BpbG9UJyk7XG5cblx0XHRjb25zdCBtb2RlbHMxID0gcmVzdWx0czEuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRjb25zdCBtb2RlbHMyID0gcmVzdWx0czIuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRjb25zdCBtb2RlbHMzID0gcmVzdWx0czMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMxLmxlbmd0aCwgbW9kZWxzMi5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMyLmxlbmd0aCwgbW9kZWxzMy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMxLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgc2VhcmNoIHJldHVybmluZyBhbGwgcmVzdWx0cycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzID0gdmlld01vZGVsLmZpbHRlcignJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdHMubGVuZ3RoID4gMCk7XG5cblx0XHQvLyBTaG91bGQgaW5jbHVkZSB2ZW5kb3IgaGVhZGVycyBhbmQgbW9kZWxzXG5cdFx0Y29uc3QgdmVuZG9ycyA9IHJlc3VsdHMuZmlsdGVyKGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkpO1xuXHRcdGNvbnN0IG1vZGVscyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZW5kb3JzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVscy5sZW5ndGgsIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbm90IGZpbmQgbWF0Y2hlcyB3aGVuIHNlYXJjaGluZyBmb3Igbm9uLWV4aXN0ZW50IG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdOb25FeGlzdGVudE1vZGVsMTIzJyk7XG5cdFx0Y29uc3QgbW9kZWxzID0gcmVzdWx0cy5maWx0ZXIociA9PiAhaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShyKSAmJiAhaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShyKSkgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeVtdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBmaW5kIG1hdGNoZXMgd2hlbiBmaWx0ZXJpbmcgYnkgbm9uLWV4aXN0ZW50IHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB2aWV3TW9kZWwuZmlsdGVyKCdAcHJvdmlkZXI6bm9uZXhpc3RlbnQnKTtcblx0XHRjb25zdCBtb2RlbHMgPSByZXN1bHRzLmZpbHRlcihyID0+ICFpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KHIpICYmICFpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KHIpKSBhcyBJTGFuZ3VhZ2VNb2RlbEVudHJ5W107XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVscy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZmlsdGVyIG91dCBhZ2VudC1ob3N0IEJZT0sgbW9kZWwgY29waWVzIGJ1dCBrZWVwIG5hdGl2ZSBhZ2VudC1ob3N0IG1vZGVscycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBBbiBhZ2VudCBob3N0IChlLmcuIENvcGlsb3QgQ0xJKSBzdXJmYWNlcyB0aGUgdXNlcidzIG93biBCWU9LIG1vZGVscyBhcyBjb3BpZXNcblx0XHQvLyB1bmRlciBpdHMgb3duIHZlbmRvci4gVGhvc2UgY29waWVzIGNhcnJ5IGBieW9rTW9kZWxJZGVudGlmaWVyYCBcdTIwMTQgdGhlIGlkIG9mIHRoZVxuXHRcdC8vIG9yaWdpbmFsIEJZT0sgbW9kZWwgXHUyMDE0IHNvIHRoZXkgbXVzdCBub3QgYXBwZWFyIGluIE1hbmFnZSBNb2RlbHM6IHRoZXkgYWxyZWFkeSBzaG93XG5cdFx0Ly8gdW5kZXIgdGhlaXIgcmVhbCBwcm92aWRlciBncm91cCwgYW5kIGxpc3RpbmcgdGhlbSBhZ2FpbiBkdXBsaWNhdGVzIHRoZSB3aG9sZSBCWU9LXG5cdFx0Ly8gY2F0YWxvZ3VlIHVuZGVyIHRoZSBhZ2VudCBob3N0LlxuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgTW9ja0xhbmd1YWdlTW9kZWxzU2VydmljZSgpO1xuXHRcdHNlcnZpY2UuYWRkVmVuZG9yKHsgdmVuZG9yOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgbWFuYWdlbWVudENvbW1hbmQ6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQgfSk7XG5cblx0XHQvLyBOYXRpdmUgYWdlbnQtaG9zdCBtb2RlbCBcdTIwMTQgbm8gYGJ5b2tNb2RlbElkZW50aWZpZXJgOyBrZXB0LlxuXHRcdHNlcnZpY2UuYWRkTW9kZWwoJ2FnZW50LWhvc3QtY29waWxvdGNsaScsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6Y2xhdWRlLWhhaWt1LTQuNScsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3ZzY29kZS5jaGF0JyksXG5cdFx0XHRpZDogJ2NsYXVkZS1oYWlrdS00LjUnLFxuXHRcdFx0bmFtZTogJ0NsYXVkZSBIYWlrdSA0LjUnLFxuXHRcdFx0ZmFtaWx5OiAnY2xhdWRlLWhhaWt1LTQuNScsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdHZlbmRvcjogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsXG5cdFx0XHRtYXhJbnB1dFRva2VuczogMTI4MDAwLFxuXHRcdFx0bWF4T3V0cHV0VG9rZW5zOiA0MDk2LFxuXHRcdFx0aXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSxcblx0XHRcdHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsXG5cdFx0XHRtb2RlbEdyb3VwOiB7IGlkOiAnY29waWxvdGNsaScgfSxcblx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogdHJ1ZSwgdmlzaW9uOiBmYWxzZSwgYWdlbnRNb2RlOiB0cnVlIH0sXG5cdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0fSk7XG5cblx0XHQvLyBBZ2VudC1ob3N0IEJZT0sgY29weSBcdTIwMTQgY2FycmllcyB0aGUgb3JpZ2luYWwgbW9kZWwgaWRlbnRpZmllcjsgZmlsdGVyZWQgb3V0LlxuXHRcdHNlcnZpY2UuYWRkTW9kZWwoJ2FnZW50LWhvc3QtY29waWxvdGNsaScsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6b3BlbnJvdXRlci9haW9uLWxhYnMvYWlvbi0zLjAnLCB7XG5cdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd2c2NvZGUuY2hhdCcpLFxuXHRcdFx0aWQ6ICdvcGVucm91dGVyL2Fpb24tbGFicy9haW9uLTMuMCcsXG5cdFx0XHRuYW1lOiAnQWlvbkxhYnM6IEFpb24tMy4wJyxcblx0XHRcdGZhbWlseTogJ29wZW5yb3V0ZXIvYWlvbi1sYWJzL2Fpb24tMy4wJyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0dmVuZG9yOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJyxcblx0XHRcdG1heElucHV0VG9rZW5zOiAxMjgwMDAsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0dGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJyxcblx0XHRcdG1vZGVsR3JvdXA6IHsgaWQ6ICdvcGVucm91dGVyJyB9LFxuXHRcdFx0Ynlva01vZGVsSWRlbnRpZmllcjogJ29wZW5yb3V0ZXIvT3BlblJvdXRlciAyL2Fpb24tbGFicy9haW9uLTMuMCcsXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IHRydWUsIHZpc2lvbjogZmFsc2UsIGFnZW50TW9kZTogdHJ1ZSB9LFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWdlbnRIb3N0Vmlld01vZGVsID0gc3RvcmUuYWRkKG5ldyBDaGF0TW9kZWxzVmlld01vZGVsKHNlcnZpY2UpKTtcblx0XHRhd2FpdCBhZ2VudEhvc3RWaWV3TW9kZWwucmVmcmVzaCgpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gYWdlbnRIb3N0Vmlld01vZGVsLmZpbHRlcignJykuZmlsdGVyKHIgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocikgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkocikpIGFzIElMYW5ndWFnZU1vZGVsRW50cnlbXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVscy5tYXAobSA9PiBtLm1vZGVsLm1ldGFkYXRhLmlkKSwgWydjbGF1ZGUtaGFpa3UtNC41J10pO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFFbkIsU0FBUyxTQUFTLGFBQWE7QUFFL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBaUMsa0NBQStPO0FBQ2hSLFNBQVMscUJBQXVFLDhCQUE4QixpQ0FBaUM7QUFDL0ksU0FBUywyQkFBMkI7QUFHcEMsU0FBUyx5QkFBeUI7QUFFbEMsTUFBTSwwQkFBNEQ7QUFBQSxFQUFsRTtBQUdDLFNBQVEsVUFBd0MsQ0FBQztBQUNqRCxTQUFRLFNBQVMsb0JBQUksSUFBd0M7QUFDN0QsU0FBUSxpQkFBaUIsb0JBQUksSUFBc0I7QUFDbkQsU0FBUSxjQUFjLG9CQUFJLElBQW9DO0FBRTlELFNBQWlCLDZCQUE2QixJQUFJLFFBQWdCO0FBQ2xFLFNBQVMsNEJBQTRCLEtBQUssMkJBQTJCO0FBRXJFLFNBQWlCLG1DQUFtQyxJQUFJLFFBQTJCO0FBQ25GLFNBQVMsa0NBQWtDLEtBQUssaUNBQWlDO0FBRWpGLDRDQUFtQyxNQUFNO0FBMkl6QyxtQ0FBMEIsTUFBTTtBQU1oQyxzQ0FBNkIsTUFBTTtBQUVuQyxzQ0FBNkIsZ0JBQWdCLDhCQUE4Qix1QkFBTyxPQUFPLElBQUksQ0FBQztBQUFBO0FBQUEsRUFqSjlGLFVBQVUsUUFBMEM7QUFDbkQsU0FBSyxRQUFRLEtBQUssTUFBTTtBQUN4QixTQUFLLGVBQWUsSUFBSSxPQUFPLFFBQVEsQ0FBQyxDQUFDO0FBQ3pDLFNBQUssWUFBWSxJQUFJLE9BQU8sUUFBUSxDQUFDLENBQUM7QUFBQSxFQUN2QztBQUFBLEVBRUEsU0FBUyxVQUFrQixZQUFvQixVQUE0QztBQUMxRixTQUFLLE9BQU8sSUFBSSxZQUFZLFFBQVE7QUFDcEMsVUFBTSxTQUFTLEtBQUssZUFBZSxJQUFJLFFBQVEsS0FBSyxDQUFDO0FBQ3JELFdBQU8sS0FBSyxVQUFVO0FBQ3RCLFNBQUssZUFBZSxJQUFJLFVBQVUsTUFBTTtBQUd4QyxVQUFNLFNBQVMsS0FBSyxZQUFZLElBQUksUUFBUSxLQUFLLENBQUM7QUFDbEQsUUFBSSxPQUFPLFdBQVcsR0FBRztBQUN4QixhQUFPLEtBQUs7QUFBQSxRQUNYLE9BQU87QUFBQSxVQUNOLFFBQVE7QUFBQSxVQUNSLE1BQU0sS0FBSyxRQUFRLEtBQUssT0FBSyxFQUFFLFdBQVcsUUFBUSxHQUFHLGVBQWU7QUFBQSxRQUNyRTtBQUFBLFFBQ0Esa0JBQWtCLENBQUM7QUFBQSxNQUNwQixDQUFDO0FBQUEsSUFDRjtBQUNBLFdBQU8sQ0FBQyxFQUFFLGlCQUFpQixLQUFLLFVBQVU7QUFDMUMsU0FBSyxZQUFZLElBQUksVUFBVSxNQUFNO0FBQUEsRUFDdEM7QUFBQSxFQUVBLDhCQUE4QixRQUFnQixVQUFtRDtBQUNoRyxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBRUEsMENBQTBDLE9BQXFDLFNBQTZDO0FBQzNILFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxhQUFpRDtBQUNoRCxXQUFPLEtBQUssUUFBUSxJQUFJLFFBQU0sRUFBRSxHQUFHLEdBQUcsV0FBVyxFQUFFLFdBQVcsVUFBVSxFQUFFO0FBQUEsRUFDM0U7QUFBQSxFQUVBLHNCQUFnQztBQUMvQixXQUFPLE1BQU0sS0FBSyxLQUFLLE9BQU8sS0FBSyxDQUFDO0FBQUEsRUFDckM7QUFBQSxFQUVBLG9CQUFvQixZQUE0RDtBQUMvRSxXQUFPLEtBQUssT0FBTyxJQUFJLFVBQVU7QUFBQSxFQUNsQztBQUFBLEVBRUEsbUNBQW1DLGVBQTRFO0FBQzlHLGVBQVcsQ0FBQyxZQUFZLFFBQVEsS0FBSyxLQUFLLE9BQU8sUUFBUSxHQUFHO0FBQzNELFVBQUksMkJBQTJCLHFCQUFxQixlQUFlLFFBQVEsR0FBRztBQUM3RSxlQUFPLEVBQUUsVUFBVSxXQUFXO0FBQUEsTUFDL0I7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLG9CQUErRDtBQUM5RCxVQUFNLFNBQW9ELENBQUM7QUFDM0QsZUFBVyxDQUFDLFlBQVksUUFBUSxLQUFLLEtBQUssT0FBTyxRQUFRLEdBQUc7QUFDM0QsYUFBTyxLQUFLLEVBQUUsWUFBWSxTQUFTLENBQUM7QUFBQSxJQUNyQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSw4QkFBb0M7QUFBQSxFQUNwQztBQUFBLEVBRUEsZ0NBQXNDO0FBQUEsRUFDdEM7QUFBQSxFQUVBLE1BQU0scUJBQXFCLFVBQXlEO0FBQ25GLFFBQUksU0FBUyxRQUFRO0FBQ3BCLGFBQU8sS0FBSyxlQUFlLElBQUksU0FBUyxNQUFNLEtBQUssQ0FBQztBQUFBLElBQ3JEO0FBQ0EsV0FBTyxNQUFNLEtBQUssS0FBSyxPQUFPLEtBQUssQ0FBQztBQUFBLEVBQ3JDO0FBQUEsRUFFQSxrQkFBZ0M7QUFDL0IsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUVBLHFCQUFzQztBQUNyQyxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBRUEsc0JBQXNCLFVBQTBEO0FBQy9FLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLHNCQUFzQixVQUFrQixTQUFvRDtBQUFBLEVBQ2xHO0FBQUEsRUFFQSw2QkFBNkIsVUFBNkI7QUFDekQsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBRUEsTUFBTSxxQ0FBcUMsVUFBa0IsTUFBOEI7QUFBQSxFQUMzRjtBQUFBLEVBRUEsTUFBTSxrQ0FBa0MsVUFBa0IsbUJBQTBDO0FBQUEsRUFDcEc7QUFBQSxFQUVBLE1BQU0sd0NBQXdDLFVBQWtCLG1CQUEwQztBQUFBLEVBQzFHO0FBQUEsRUFFQSxNQUFNLG9DQUFvQyxVQUFrQixtQkFBMEM7QUFBQSxFQUN0RztBQUFBLEVBRUEsTUFBTSx3Q0FBd0MsVUFBa0IsbUJBQTBDO0FBQUEsRUFDMUc7QUFBQSxFQUVBLE1BQU0sZUFBZSxVQUFpQztBQUFBLEVBQ3REO0FBQUEsRUFFQSxNQUFNLCtCQUErQixNQUFjLFVBQWtCLGVBQXNFO0FBQUEsRUFDM0k7QUFBQSxFQUVBLHVCQUF1QixRQUF3QztBQUM5RCxXQUFPLEtBQUssWUFBWSxJQUFJLE1BQU0sS0FBSyxDQUFDO0FBQUEsRUFDekM7QUFBQSxFQUVBLGtCQUFrQixRQUF5QjtBQUMxQyxXQUFPLEtBQUssWUFBWSxJQUFJLE1BQU07QUFBQSxFQUNuQztBQUFBLEVBRUEsTUFBTSxrQ0FBa0MsVUFBa0IsbUJBQTBDO0FBQUEsRUFDcEc7QUFBQSxFQUVBLE1BQU0sbUNBQW1DLDZCQUEwRTtBQUFBLEVBQUU7QUFBQSxFQUVySCwwQkFBb0M7QUFBRSxXQUFPLENBQUM7QUFBQSxFQUFHO0FBQUEsRUFDakQsd0JBQThCO0FBQUEsRUFBRTtBQUFBLEVBQ2hDLHdCQUE4QjtBQUFBLEVBQUU7QUFBQSxFQUNoQyxvQkFBOEI7QUFBRSxXQUFPLENBQUM7QUFBQSxFQUFHO0FBQUEsRUFDM0MsU0FBUyxrQkFBZ0M7QUFBQSxFQUFFO0FBQUEsRUFDM0MsV0FBVyxrQkFBZ0M7QUFBQSxFQUFFO0FBQUEsRUFDN0MsY0FBYyxrQkFBbUM7QUFBRSxXQUFPO0FBQUEsRUFBTztBQUFBLEVBRWpFLGNBQWMsa0JBQW1DO0FBQUUsV0FBTztBQUFBLEVBQU87QUFBQSxFQUNqRSxjQUFjLFNBQWlCLFlBQTZCO0FBQUUsV0FBTztBQUFBLEVBQU87QUFBQSxFQUM1RSxlQUFlLGtCQUEwQixTQUF3QjtBQUFBLEVBQUU7QUFBQSxFQUNuRSxlQUFlLFNBQWlCLFlBQW9CLFNBQXdCO0FBQUEsRUFBRTtBQUFBLEVBQzlFLG9CQUE4QjtBQUFFLFdBQU8sQ0FBQztBQUFBLEVBQUc7QUFBQSxFQUUzQywyQkFBbUQ7QUFBRSxXQUFPLEVBQUUsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLEVBQUU7QUFBQSxFQUFHO0FBRXJGO0FBRUEsTUFBTSx1QkFBdUIsTUFBTTtBQUNsQyxRQUFNLFFBQVEsd0NBQXdDO0FBQ3RELE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSxZQUFZO0FBQ2pCLDRCQUF3QixJQUFJLDBCQUEwQjtBQUd0RCwwQkFBc0IsVUFBVTtBQUFBLE1BQy9CLFFBQVE7QUFBQSxNQUNSLGFBQWE7QUFBQSxNQUNiLG1CQUFtQjtBQUFBLE1BQ25CLE1BQU07QUFBQSxNQUNOLGVBQWU7QUFBQSxJQUNoQixDQUFDO0FBRUQsMEJBQXNCLFVBQVU7QUFBQSxNQUMvQixRQUFRO0FBQUEsTUFDUixhQUFhO0FBQUEsTUFDYixtQkFBbUI7QUFBQSxNQUNuQixNQUFNO0FBQUEsTUFDTixlQUFlO0FBQUEsSUFDaEIsQ0FBQztBQUVELDBCQUFzQixTQUFTLFdBQVcsaUJBQWlCO0FBQUEsTUFDMUQsV0FBVyxJQUFJLG9CQUFvQixnQkFBZ0I7QUFBQSxNQUNuRCxJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixRQUFRO0FBQUEsTUFDUixTQUFTO0FBQUEsTUFDVCxRQUFRO0FBQUEsTUFDUixnQkFBZ0I7QUFBQSxNQUNoQixpQkFBaUI7QUFBQSxNQUNqQixrQkFBa0I7QUFBQSxNQUNsQixjQUFjO0FBQUEsUUFDYixhQUFhO0FBQUEsUUFDYixRQUFRO0FBQUEsUUFDUixXQUFXO0FBQUEsTUFDWjtBQUFBLE1BQ0Esc0JBQXNCO0FBQUEsUUFDckIsQ0FBQyxrQkFBa0IsSUFBSSxHQUFHO0FBQUEsTUFDM0I7QUFBQSxJQUNELENBQUM7QUFFRCwwQkFBc0IsU0FBUyxXQUFXLGtCQUFrQjtBQUFBLE1BQzNELFdBQVcsSUFBSSxvQkFBb0IsZ0JBQWdCO0FBQUEsTUFDbkQsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1IsZ0JBQWdCO0FBQUEsTUFDaEIsaUJBQWlCO0FBQUEsTUFDakIsa0JBQWtCO0FBQUEsTUFDbEIsY0FBYztBQUFBLFFBQ2IsYUFBYTtBQUFBLFFBQ2IsUUFBUTtBQUFBLFFBQ1IsV0FBVztBQUFBLE1BQ1o7QUFBQSxNQUNBLHNCQUFzQjtBQUFBLFFBQ3JCLENBQUMsa0JBQWtCLElBQUksR0FBRztBQUFBLE1BQzNCO0FBQUEsSUFDRCxDQUFDO0FBRUQsMEJBQXNCLFNBQVMsVUFBVSxrQkFBa0I7QUFBQSxNQUMxRCxXQUFXLElBQUksb0JBQW9CLFlBQVk7QUFBQSxNQUMvQyxJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixRQUFRO0FBQUEsTUFDUixTQUFTO0FBQUEsTUFDVCxRQUFRO0FBQUEsTUFDUixnQkFBZ0I7QUFBQSxNQUNoQixpQkFBaUI7QUFBQSxNQUNqQixrQkFBa0I7QUFBQSxNQUNsQixjQUFjO0FBQUEsUUFDYixhQUFhO0FBQUEsUUFDYixRQUFRO0FBQUEsUUFDUixXQUFXO0FBQUEsTUFDWjtBQUFBLE1BQ0Esc0JBQXNCO0FBQUEsUUFDckIsQ0FBQyxrQkFBa0IsSUFBSSxHQUFHO0FBQUEsTUFDM0I7QUFBQSxJQUNELENBQUM7QUFFRCwwQkFBc0IsU0FBUyxVQUFVLHVCQUF1QjtBQUFBLE1BQy9ELFdBQVcsSUFBSSxvQkFBb0IsWUFBWTtBQUFBLE1BQy9DLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxNQUNULFFBQVE7QUFBQSxNQUNSLGdCQUFnQjtBQUFBLE1BQ2hCLGlCQUFpQjtBQUFBLE1BQ2pCLGtCQUFrQjtBQUFBLE1BQ2xCLGNBQWM7QUFBQSxRQUNiLGFBQWE7QUFBQSxRQUNiLFFBQVE7QUFBQSxRQUNSLFdBQVc7QUFBQSxNQUNaO0FBQUEsTUFDQSxzQkFBc0I7QUFBQSxRQUNyQixDQUFDLGtCQUFrQixJQUFJLEdBQUc7QUFBQSxNQUMzQjtBQUFBLElBQ0QsQ0FBQztBQUVELGdCQUFZLE1BQU0sSUFBSSxJQUFJLG9CQUFvQixxQkFBcUIsQ0FBQztBQUVwRSxVQUFNLFVBQVUsUUFBUTtBQUFBLEVBQ3pCLENBQUM7QUFFRCxPQUFLLDJDQUEyQyxNQUFNO0FBQ3JELFVBQU0sVUFBVSxVQUFVLE9BQU8sRUFBRTtBQUduQyxXQUFPLFlBQVksUUFBUSxRQUFRLENBQUM7QUFFcEMsVUFBTSxVQUFVLFFBQVEsT0FBTyw0QkFBNEI7QUFDM0QsV0FBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBRXBDLFVBQU0sU0FBUyxRQUFRLE9BQU8sT0FBSyxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0FBQ3BHLFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUFBLEVBQ3BDLENBQUM7QUFFRCxPQUFLLCtEQUErRCxNQUFNO0FBQ3pFLFVBQU0scUJBQXFCLFVBQVUsT0FBTyxtQkFBbUI7QUFDL0QsV0FBTyxZQUFZLG1CQUFtQixRQUFRLENBQUM7QUFDL0MsV0FBTyxZQUFZLG1CQUFtQixDQUFDLEVBQUUsTUFBTSxRQUFRO0FBQ3ZELFdBQU8sWUFBWSxtQkFBbUIsQ0FBQyxFQUFFLFlBQVksT0FBTyxRQUFRLFNBQVM7QUFDN0UsV0FBTyxZQUFZLG1CQUFtQixDQUFDLEVBQUUsTUFBTSxPQUFPO0FBQ3RELFdBQU8sWUFBWSxtQkFBbUIsQ0FBQyxFQUFFLE1BQU0sWUFBWSxlQUFlO0FBQzFFLFdBQU8sWUFBWSxtQkFBbUIsQ0FBQyxFQUFFLE1BQU0sT0FBTztBQUN0RCxXQUFPLFlBQVksbUJBQW1CLENBQUMsRUFBRSxNQUFNLFlBQVksZ0JBQWdCO0FBRTNFLFVBQU0sc0JBQXNCLFVBQVUsT0FBTyxrQkFBa0I7QUFDL0QsV0FBTyxZQUFZLG9CQUFvQixRQUFRLENBQUM7QUFDaEQsV0FBTyxZQUFZLG9CQUFvQixDQUFDLEVBQUUsTUFBTSxRQUFRO0FBQ3hELFdBQU8sWUFBWSxvQkFBb0IsQ0FBQyxFQUFFLFlBQVksT0FBTyxRQUFRLFFBQVE7QUFDN0UsV0FBTyxZQUFZLG9CQUFvQixDQUFDLEVBQUUsTUFBTSxPQUFPO0FBQ3ZELFdBQU8sWUFBWSxvQkFBb0IsQ0FBQyxFQUFFLE1BQU0sWUFBWSxnQkFBZ0I7QUFDNUUsV0FBTyxZQUFZLG9CQUFvQixDQUFDLEVBQUUsTUFBTSxPQUFPO0FBQ3ZELFdBQU8sWUFBWSxvQkFBb0IsQ0FBQyxFQUFFLE1BQU0sWUFBWSxxQkFBcUI7QUFBQSxFQUNsRixDQUFDO0FBRUQsT0FBSyxxREFBcUQsTUFBTTtBQUMvRCxVQUFNLFVBQVUsVUFBVSxPQUFPLG9DQUFvQztBQUVyRSxVQUFNLFNBQVMsUUFBUSxPQUFPLE9BQUssQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUNwRyxXQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFBQSxFQUNwQyxDQUFDO0FBRUQsT0FBSyw4Q0FBOEMsTUFBTTtBQUN4RCxVQUFNLFVBQVUsVUFBVSxPQUFPLG1CQUFtQjtBQUVwRCxVQUFNLFNBQVMsUUFBUSxPQUFPLE9BQUssQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUNwRyxXQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFDbkMsV0FBTyxHQUFHLE9BQU8sTUFBTSxPQUFLLEVBQUUsTUFBTSxTQUFTLGNBQWMsZ0JBQWdCLElBQUksQ0FBQztBQUFBLEVBQ2pGLENBQUM7QUFFRCxPQUFLLCtDQUErQyxNQUFNO0FBQ3pELFVBQU0sVUFBVSxVQUFVLE9BQU8sb0JBQW9CO0FBRXJELFVBQU0sU0FBUyxRQUFRLE9BQU8sT0FBSyxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0FBQ3BHLFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxXQUFPLEdBQUcsT0FBTyxNQUFNLE9BQUssRUFBRSxNQUFNLFNBQVMsY0FBYyxXQUFXLElBQUksQ0FBQztBQUFBLEVBQzVFLENBQUM7QUFFRCxPQUFLLDhDQUE4QyxNQUFNO0FBQ3hELFVBQU0sVUFBVSxVQUFVLE9BQU8sbUJBQW1CO0FBRXBELFVBQU0sU0FBUyxRQUFRLE9BQU8sT0FBSyxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0FBQ3BHLFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxXQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsTUFBTSxTQUFTLElBQUksUUFBUTtBQUFBLEVBQ3pELENBQUM7QUFFRCxPQUFLLHlEQUF5RCxNQUFNO0FBQ25FLFVBQU0sVUFBVSxVQUFVLE9BQU8sc0NBQXNDO0FBRXZFLFVBQU0sU0FBUyxRQUFRLE9BQU8sT0FBSyxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0FBRXBHLFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxXQUFPLEdBQUcsT0FBTztBQUFBLE1BQU0sT0FDdEIsRUFBRSxNQUFNLFNBQVMsY0FBYyxnQkFBZ0IsUUFDL0MsRUFBRSxNQUFNLFNBQVMsY0FBYyxXQUFXO0FBQUEsSUFDM0MsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsVUFBTSxVQUFVLFVBQVUsT0FBTyx3REFBd0Q7QUFFekYsVUFBTSxTQUFTLFFBQVEsT0FBTyxPQUFLLENBQUMsNkJBQTZCLENBQUMsS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7QUFFcEcsV0FBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQ25DLFdBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxNQUFNLFNBQVMsSUFBSSxRQUFRO0FBQUEsRUFDekQsQ0FBQztBQUVELE9BQUssd0VBQXdFLE1BQU07QUFDbEYsVUFBTSxVQUFVLFVBQVUsT0FBTyxzQ0FBc0M7QUFFdkUsVUFBTSxTQUFTLFFBQVEsT0FBTyxPQUFLLENBQUMsNkJBQTZCLENBQUMsS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7QUFFcEcsV0FBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQ25DLFdBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxNQUFNLFNBQVMsSUFBSSxRQUFRO0FBQUEsRUFDekQsQ0FBQztBQUVELE9BQUssa0RBQWtELE1BQU07QUFDNUQsVUFBTSxVQUFVLFVBQVUsT0FBTyxzQ0FBc0M7QUFFdkUsVUFBTSxTQUFTLFFBQVEsT0FBTyxPQUFLLENBQUMsNkJBQTZCLENBQUMsS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7QUFDcEcsV0FBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQ25DLFdBQU8sR0FBRyxPQUFPO0FBQUEsTUFBTSxPQUN0QixFQUFFLE1BQU0sU0FBUyxPQUFPLFdBQVcsYUFDbkMsRUFBRSxNQUFNLFNBQVMsY0FBYyxXQUFXO0FBQUEsSUFDM0MsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkNBQTZDLE1BQU07QUFDdkQsVUFBTSxVQUFVLFVBQVUsT0FBTyxRQUFRO0FBRXpDLFVBQU0sU0FBUyxRQUFRLE9BQU8sT0FBSyxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0FBQ3BHLFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxXQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsTUFBTSxTQUFTLE1BQU0sUUFBUTtBQUMxRCxXQUFPLEdBQUcsT0FBTyxDQUFDLEVBQUUsZ0JBQWdCO0FBQUEsRUFDckMsQ0FBQztBQUVELE9BQUssMkNBQTJDLE1BQU07QUFDckQsVUFBTSxVQUFVLFVBQVUsT0FBTyxRQUFRO0FBRXpDLFVBQU0sU0FBUyxRQUFRLE9BQU8sT0FBSyxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0FBQ3BHLFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxXQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsTUFBTSxZQUFZLGdCQUFnQjtBQUMvRCxXQUFPLEdBQUcsT0FBTyxDQUFDLEVBQUUsY0FBYztBQUFBLEVBQ25DLENBQUM7QUFFRCxPQUFLLDhDQUE4QyxNQUFNO0FBQ3hELFVBQU0sVUFBVSxVQUFVLE9BQU8sUUFBUTtBQUV6QyxVQUFNLFNBQVMsUUFBUSxPQUFPLE9BQUssQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUNwRyxXQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFDbkMsV0FBTyxHQUFHLE9BQU8sTUFBTSxPQUFLLEVBQUUsTUFBTSxTQUFTLE1BQU0sU0FBUyxnQkFBZ0IsQ0FBQztBQUFBLEVBQzlFLENBQUM7QUFFRCxPQUFLLHFEQUFxRCxNQUFNO0FBQy9ELFVBQU0sVUFBVSxVQUFVLE9BQU8sdUJBQXVCO0FBRXhELFVBQU0sU0FBUyxRQUFRLE9BQU8sT0FBSyxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0FBRXBHLFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxXQUFPLEdBQUcsT0FBTyxNQUFNLE9BQUssRUFBRSxNQUFNLFNBQVMsY0FBYyxnQkFBZ0IsSUFBSSxDQUFDO0FBQUEsRUFDakYsQ0FBQztBQUVELE9BQUssb0NBQW9DLE1BQU07QUFDOUMsVUFBTSxVQUFVLFVBQVUsT0FBTyxFQUFFO0FBR25DLFdBQU8sR0FBRyxRQUFRLFNBQVMsQ0FBQztBQUFBLEVBQzdCLENBQUM7QUFFRCxPQUFLLG1EQUFtRCxNQUFNO0FBQzdELFVBQU0sVUFBVSxVQUFVLE9BQU8sS0FBSztBQUd0QyxXQUFPLEdBQUcsUUFBUSxTQUFTLENBQUM7QUFBQSxFQUM3QixDQUFDO0FBRUQsT0FBSyxvREFBb0QsTUFBTTtBQUM5RCxVQUFNLFVBQVUsVUFBVSxPQUFPLFFBQVE7QUFFekMsVUFBTSxTQUFTLFFBQVEsT0FBTyxPQUFLLENBQUMsNkJBQTZCLENBQUMsS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7QUFFcEcsV0FBTyxHQUFHLE9BQU8sU0FBUyxDQUFDO0FBQzNCLFdBQU8sR0FBRyxPQUFPO0FBQUEsTUFBTSxPQUN0QixFQUFFLE1BQU0sU0FBUyxjQUFjLFdBQVcsUUFDMUMsRUFBRSxNQUFNLFNBQVMsS0FBSyxZQUFZLEVBQUUsU0FBUyxRQUFRO0FBQUEsSUFDdEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssd0NBQXdDLE1BQU07QUFDbEQsVUFBTSxjQUFjLFVBQVUsaUJBQWlCLEtBQUssT0FBSyw2QkFBNkIsQ0FBQyxLQUFLLEVBQUUsWUFBWSxPQUFPLFdBQVcsU0FBUztBQUNySSxjQUFVLGdCQUFnQixXQUFXO0FBRXJDLFVBQU0sVUFBVSxVQUFVLE9BQU8sRUFBRTtBQUNuQyxVQUFNLGdCQUFnQixRQUFRLEtBQUssT0FBSyw2QkFBNkIsQ0FBQyxLQUFNLEVBQWtDLFlBQVksT0FBTyxXQUFXLFNBQVM7QUFDckosV0FBTyxHQUFHLGFBQWE7QUFDdkIsV0FBTyxZQUFZLGNBQWMsV0FBVyxJQUFJO0FBR2hELFVBQU0sNkJBQTZCLFFBQVE7QUFBQSxNQUFPLE9BQ2pELENBQUMsNkJBQTZCLENBQUMsS0FBTSxFQUEwQixNQUFNLFNBQVMsT0FBTyxXQUFXO0FBQUEsSUFDakc7QUFDQSxXQUFPLFlBQVksMkJBQTJCLFFBQVEsQ0FBQztBQUd2RCxjQUFVLGdCQUFnQixXQUFXO0FBQ3JDLFVBQU0scUJBQXFCLFVBQVUsT0FBTyxFQUFFO0FBQzlDLFVBQU0sMkJBQTJCLG1CQUFtQjtBQUFBLE1BQU8sT0FDMUQsQ0FBQyw2QkFBNkIsQ0FBQyxLQUFNLEVBQTBCLE1BQU0sU0FBUyxPQUFPLFdBQVc7QUFBQSxJQUNqRztBQUNBLFdBQU8sWUFBWSx5QkFBeUIsUUFBUSxDQUFDO0FBQUEsRUFDdEQsQ0FBQztBQUVELE9BQUssdUNBQXVDLE1BQU07QUFJakQsVUFBTSxVQUFVLFVBQVUsT0FBTyxPQUFPO0FBSXhDLFdBQU8sR0FBRyxNQUFNLFFBQVEsT0FBTyxDQUFDO0FBQUEsRUFDakMsQ0FBQztBQUVELE9BQUssa0RBQWtELE1BQU07QUFDNUQsVUFBTSxVQUFVLFVBQVUsT0FBTywwQ0FBMEM7QUFFM0UsVUFBTSxTQUFTLFFBQVEsT0FBTyxPQUFLLENBQUMsNkJBQTZCLENBQUMsS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7QUFFcEcsV0FBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQ25DLFdBQU8sR0FBRyxPQUFPLE1BQU0sT0FBSyxFQUFFLE1BQU0sU0FBUyxPQUFPLFdBQVcsU0FBUyxDQUFDO0FBQUEsRUFDMUUsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsVUFBTSxXQUFXLFVBQVUsT0FBTyxtQkFBbUI7QUFDckQsVUFBTSxXQUFXLFVBQVUsT0FBTyxtQkFBbUI7QUFDckQsVUFBTSxXQUFXLFVBQVUsT0FBTyxtQkFBbUI7QUFFckQsVUFBTSxVQUFVLFNBQVMsT0FBTyxPQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztBQUNyRSxVQUFNLFVBQVUsU0FBUyxPQUFPLE9BQUssQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO0FBQ3JFLFVBQU0sVUFBVSxTQUFTLE9BQU8sT0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7QUFFckUsV0FBTyxZQUFZLFFBQVEsUUFBUSxRQUFRLE1BQU07QUFDakQsV0FBTyxZQUFZLFFBQVEsUUFBUSxRQUFRLE1BQU07QUFBQSxFQUNsRCxDQUFDO0FBRUQsT0FBSyx5REFBeUQsTUFBTTtBQUNuRSxVQUFNLGVBQWUsVUFBVSxPQUFPLG1CQUFtQjtBQUN6RCxVQUFNLHFCQUFxQixVQUFVLE9BQU8seUJBQXlCO0FBRXJFLFVBQU0sY0FBYyxhQUFhLE9BQU8sT0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7QUFDN0UsVUFBTSxvQkFBb0IsbUJBQW1CLE9BQU8sT0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7QUFFekYsV0FBTyxZQUFZLFlBQVksUUFBUSxrQkFBa0IsTUFBTTtBQUFBLEVBQ2hFLENBQUM7QUFFRCxPQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFVBQU0sZUFBZSxVQUFVLE9BQU8sbUJBQW1CO0FBQ3pELFVBQU0sbUJBQW1CLFVBQVUsT0FBTyx1QkFBdUI7QUFFakUsVUFBTSxjQUFjLGFBQWEsT0FBTyxPQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztBQUM3RSxVQUFNLGtCQUFrQixpQkFBaUIsT0FBTyxPQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztBQUVyRixXQUFPLFlBQVksWUFBWSxRQUFRLGdCQUFnQixNQUFNO0FBQUEsRUFDOUQsQ0FBQztBQUVELE9BQUssa0RBQWtELE1BQU07QUFDNUQsVUFBTSxVQUFVLFVBQVUsT0FBTyxzQ0FBc0M7QUFFdkUsVUFBTSxTQUFTLFFBQVEsT0FBTyxPQUFLLENBQUMsNkJBQTZCLENBQUMsS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7QUFDcEcsV0FBTyxHQUFHLE9BQU8sU0FBUyxDQUFDO0FBRTNCLGVBQVcsU0FBUyxRQUFRO0FBQzNCLGFBQU8sR0FBRyxNQUFNLGlCQUFpQjtBQUNqQyxhQUFPLEdBQUcsTUFBTSxrQkFBa0IsU0FBUyxDQUFDO0FBRTVDLGFBQU8sR0FBRyxNQUFNLGtCQUFrQixLQUFLLE9BQUssTUFBTSxpQkFBaUIsTUFBTSxRQUFRLENBQUM7QUFBQSxJQUNuRjtBQUFBLEVBQ0QsQ0FBQztBQUVELFdBQVMsNEJBQTRCLHFCQUE4QixNQUE4RTtBQUNoSixVQUFNLFVBQVUsSUFBSSwwQkFBMEI7QUFDOUMsWUFBUSxVQUFVO0FBQUEsTUFDakIsUUFBUTtBQUFBLE1BQ1IsYUFBYTtBQUFBLE1BQ2IsbUJBQW1CO0FBQUEsTUFDbkIsTUFBTTtBQUFBLE1BQ04sZUFBZTtBQUFBLElBQ2hCLENBQUM7QUFFRCxZQUFRLFNBQVMsV0FBVyxpQkFBaUI7QUFBQSxNQUM1QyxXQUFXLElBQUksb0JBQW9CLGdCQUFnQjtBQUFBLE1BQ25ELElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxNQUNULFFBQVE7QUFBQSxNQUNSLGdCQUFnQjtBQUFBLE1BQ2hCLGlCQUFpQjtBQUFBLE1BQ2pCLGtCQUFrQjtBQUFBLE1BQ2xCLGNBQWM7QUFBQSxRQUNiLGFBQWE7QUFBQSxRQUNiLFFBQVE7QUFBQSxRQUNSLFdBQVc7QUFBQSxNQUNaO0FBQUEsTUFDQSxzQkFBc0I7QUFBQSxRQUNyQixDQUFDLGtCQUFrQixJQUFJLEdBQUc7QUFBQSxNQUMzQjtBQUFBLElBQ0QsQ0FBQztBQUVELFFBQUksb0JBQW9CO0FBQ3ZCLGNBQVEsU0FBUyxXQUFXLGtCQUFrQjtBQUFBLFFBQzdDLFdBQVcsSUFBSSxvQkFBb0IsZ0JBQWdCO0FBQUEsUUFDbkQsSUFBSTtBQUFBLFFBQ0osTUFBTTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFFBQ1QsUUFBUTtBQUFBLFFBQ1IsZ0JBQWdCO0FBQUEsUUFDaEIsaUJBQWlCO0FBQUEsUUFDakIsa0JBQWtCO0FBQUEsUUFDbEIsY0FBYztBQUFBLFVBQ2IsYUFBYTtBQUFBLFVBQ2IsUUFBUTtBQUFBLFVBQ1IsV0FBVztBQUFBLFFBQ1o7QUFBQSxRQUNBLHNCQUFzQjtBQUFBLFVBQ3JCLENBQUMsa0JBQWtCLElBQUksR0FBRztBQUFBLFFBQzNCO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUVBLFVBQU1BLGFBQVksTUFBTSxJQUFJLElBQUksb0JBQW9CLE9BQU8sQ0FBQztBQUM1RCxXQUFPLEVBQUUsU0FBUyxXQUFBQSxXQUFVO0FBQUEsRUFDN0I7QUFFQSxPQUFLLDZEQUE2RCxZQUFZO0FBQzdFLFVBQU0sRUFBRSxXQUFXLHNCQUFzQixJQUFJLDRCQUE0QjtBQUN6RSxVQUFNLHNCQUFzQixRQUFRO0FBRXBDLFVBQU0sVUFBVSxzQkFBc0IsT0FBTyxFQUFFO0FBRy9DLFVBQU0sVUFBVSxRQUFRLE9BQU8sNEJBQTRCO0FBQzNELFdBQU8sWUFBWSxRQUFRLFFBQVEsR0FBRywyREFBMkQ7QUFFakcsVUFBTSxTQUFTLFFBQVEsT0FBTyxPQUFLLENBQUMsNkJBQTZCLENBQUMsS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7QUFDcEcsV0FBTyxZQUFZLE9BQU8sUUFBUSxHQUFHLHdCQUF3QjtBQUM3RCxXQUFPLEdBQUcsT0FBTyxNQUFNLE9BQUssRUFBRSxNQUFNLFNBQVMsT0FBTyxXQUFXLFNBQVMsQ0FBQztBQUFBLEVBQzFFLENBQUM7QUFFRCxPQUFLLDBEQUEwRCxNQUFNO0FBRXBFLFVBQU0sVUFBVSxVQUFVLE9BQU8sRUFBRTtBQUduQyxVQUFNLFVBQVUsUUFBUSxPQUFPLDRCQUE0QjtBQUMzRCxXQUFPLFlBQVksUUFBUSxRQUFRLEdBQUcsd0RBQXdEO0FBRTlGLFVBQU0sU0FBUyxRQUFRLE9BQU8sT0FBSyxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0FBQ3BHLFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUFBLEVBQ3BDLENBQUM7QUFFRCxPQUFLLG9EQUFvRCxZQUFZO0FBQ3BFLFVBQU0sRUFBRSxXQUFXLHNCQUFzQixJQUFJLDRCQUE0QjtBQUN6RSxVQUFNLHNCQUFzQixRQUFRO0FBRXBDLFVBQU0sVUFBVSxzQkFBc0IsT0FBTyxtQkFBbUI7QUFHaEUsVUFBTSxVQUFVLFFBQVEsT0FBTyw0QkFBNEI7QUFDM0QsV0FBTyxZQUFZLFFBQVEsUUFBUSxHQUFHLCtCQUErQjtBQUdyRSxVQUFNLFNBQVMsUUFBUSxPQUFPLE9BQUssQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUNwRyxXQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFDbkMsV0FBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLE1BQU0sU0FBUyxJQUFJLFFBQVE7QUFBQSxFQUN6RCxDQUFDO0FBRUQsT0FBSyw2RUFBNkUsWUFBWTtBQUU3RixRQUFJLFVBQVUsVUFBVSxPQUFPLEVBQUU7QUFDakMsUUFBSSxVQUFVLFFBQVEsT0FBTyw0QkFBNEI7QUFDekQsV0FBTyxZQUFZLFFBQVEsQ0FBQyxFQUFFLFlBQVksT0FBTyxRQUFRLFNBQVM7QUFHbEUsMEJBQXNCLFVBQVU7QUFBQSxNQUMvQixRQUFRO0FBQUEsTUFDUixhQUFhO0FBQUEsTUFDYixtQkFBbUI7QUFBQSxNQUNuQixNQUFNO0FBQUEsTUFDTixlQUFlO0FBQUEsSUFDaEIsQ0FBQztBQUVELDBCQUFzQixTQUFTLGFBQWEsb0JBQW9CO0FBQUEsTUFDL0QsV0FBVyxJQUFJLG9CQUFvQixlQUFlO0FBQUEsTUFDbEQsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1IsZ0JBQWdCO0FBQUEsTUFDaEIsaUJBQWlCO0FBQUEsTUFDakIsa0JBQWtCO0FBQUEsTUFDbEIsY0FBYztBQUFBLFFBQ2IsYUFBYTtBQUFBLFFBQ2IsUUFBUTtBQUFBLFFBQ1IsV0FBVztBQUFBLE1BQ1o7QUFBQSxNQUNBLHNCQUFzQjtBQUFBLFFBQ3JCLENBQUMsa0JBQWtCLElBQUksR0FBRztBQUFBLE1BQzNCO0FBQUEsSUFDRCxDQUFDO0FBRUQsMEJBQXNCLFVBQVU7QUFBQSxNQUMvQixRQUFRO0FBQUEsTUFDUixhQUFhO0FBQUEsTUFDYixtQkFBbUI7QUFBQSxNQUNuQixNQUFNO0FBQUEsTUFDTixlQUFlO0FBQUEsSUFDaEIsQ0FBQztBQUVELDBCQUFzQixTQUFTLFNBQVMsZUFBZTtBQUFBLE1BQ3RELFdBQVcsSUFBSSxvQkFBb0IsaUJBQWlCO0FBQUEsTUFDcEQsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1IsZ0JBQWdCO0FBQUEsTUFDaEIsaUJBQWlCO0FBQUEsTUFDakIsa0JBQWtCO0FBQUEsTUFDbEIsY0FBYztBQUFBLFFBQ2IsYUFBYTtBQUFBLFFBQ2IsUUFBUTtBQUFBLFFBQ1IsV0FBVztBQUFBLE1BQ1o7QUFBQSxNQUNBLHNCQUFzQjtBQUFBLFFBQ3JCLENBQUMsa0JBQWtCLElBQUksR0FBRztBQUFBLE1BQzNCO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxVQUFVLFFBQVE7QUFHeEIsY0FBVSxVQUFVLE9BQU8sRUFBRTtBQUM3QixjQUFVLFFBQVEsT0FBTyw0QkFBNEI7QUFDckQsV0FBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLFdBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxZQUFZLE9BQU8sUUFBUSxTQUFTO0FBRWxFLFdBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxZQUFZLE9BQU8sUUFBUSxXQUFXO0FBQ3BFLFdBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxZQUFZLE9BQU8sUUFBUSxPQUFPO0FBQ2hFLFdBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxZQUFZLE9BQU8sUUFBUSxRQUFRO0FBR2pFLGNBQVUsVUFBVSxPQUFPLEtBQUs7QUFDaEMsY0FBVSxRQUFRLE9BQU8sNEJBQTRCO0FBQ3JELFFBQUksUUFBUSxTQUFTLEdBQUc7QUFDdkIsYUFBTyxZQUFZLFFBQVEsQ0FBQyxFQUFFLFlBQVksT0FBTyxRQUFRLFNBQVM7QUFBQSxJQUNuRTtBQUdBLGNBQVUsVUFBVSxPQUFPLG1CQUFtQjtBQUM5QyxjQUFVLFFBQVEsT0FBTyw0QkFBNEI7QUFDckQsUUFBSSxRQUFRLFNBQVMsR0FBRztBQUN2QixhQUFPLFlBQVksUUFBUSxDQUFDLEVBQUUsWUFBWSxPQUFPLFFBQVEsU0FBUztBQUFBLElBQ25FO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw0Q0FBNEMsTUFBTTtBQUN0RCxVQUFNLFVBQVUsVUFBVSxPQUFPLEtBQUs7QUFDdEMsVUFBTSxVQUFVLFFBQVEsT0FBTyw0QkFBNEI7QUFDM0QsV0FBTyxHQUFHLFFBQVEsU0FBUyxDQUFDO0FBQUEsRUFDN0IsQ0FBQztBQUVELE9BQUssMEVBQTBFLFlBQVk7QUFDMUYsVUFBTSxFQUFFLFdBQVcsc0JBQXNCLElBQUksNEJBQTRCO0FBQ3pFLFVBQU0sc0JBQXNCLFFBQVE7QUFFcEMsVUFBTSxVQUFVLHNCQUFzQixPQUFPLEtBQUs7QUFDbEQsVUFBTSxVQUFVLFFBQVEsT0FBTyw0QkFBNEI7QUFDM0QsV0FBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQUEsRUFDckMsQ0FBQztBQUVELE9BQUssaUNBQWlDLE1BQU07QUFDM0MsVUFBTSxVQUFVLFVBQVUscUJBQXFCO0FBQy9DLFdBQU8sR0FBRyxRQUFRLFNBQVMsQ0FBQztBQUM1QixXQUFPLEdBQUcsUUFBUSxLQUFLLE9BQUssRUFBRSxPQUFPLFdBQVcsU0FBUyxDQUFDO0FBQzFELFdBQU8sR0FBRyxRQUFRLEtBQUssT0FBSyxFQUFFLE9BQU8sV0FBVyxRQUFRLENBQUM7QUFBQSxFQUMxRCxDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsTUFBTTtBQUUxRSxjQUFVLE9BQU8sRUFBRTtBQUNuQixXQUFPLFlBQVksVUFBVSxlQUFlLEdBQUcsS0FBSztBQUlwRCxVQUFNLFNBQVMsVUFBVSxlQUFlO0FBQ3hDLFdBQU8sWUFBWSxPQUFPLFFBQVEsU0FBUztBQUFBLEVBQzVDLENBQUM7QUFFRCxPQUFLLHlDQUF5QyxNQUFNO0FBRW5ELFVBQU0sV0FBVyxVQUFVLE9BQU8sRUFBRTtBQUNwQyxRQUFJLFNBQVMsU0FBUyxPQUFPLE9BQUssQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUNuRyxXQUFPLEdBQUcsT0FBTyxTQUFTLENBQUM7QUFHM0IsY0FBVSxZQUFZO0FBR3RCLFVBQU0sV0FBVyxVQUFVLE9BQU8sRUFBRTtBQUNwQyxVQUFNLFVBQVUsU0FBUyxPQUFPLDRCQUE0QjtBQUM1RCxhQUFTLFNBQVMsT0FBTyxPQUFLLENBQUMsNkJBQTZCLENBQUMsS0FBSyxDQUFDLDBCQUEwQixDQUFDLENBQUM7QUFFL0YsV0FBTyxHQUFHLFFBQVEsU0FBUyxHQUFHLDRCQUE0QjtBQUMxRCxXQUFPLFlBQVksT0FBTyxRQUFRLEdBQUcsa0RBQWtEO0FBQUEsRUFDeEYsQ0FBQztBQUVELE9BQUssbURBQW1ELE1BQU07QUFFN0QsVUFBTSxVQUFVLFVBQVUsT0FBTyx5QkFBeUI7QUFDMUQsV0FBTyxHQUFHLE1BQU0sUUFBUSxPQUFPLENBQUM7QUFBQSxFQUVqQyxDQUFDO0FBRUQsT0FBSyxtREFBbUQsTUFBTTtBQUM3RCxVQUFNLFdBQVcsVUFBVSxPQUFPLG1CQUFtQjtBQUNyRCxVQUFNLFdBQVcsVUFBVSxPQUFPLG1CQUFtQjtBQUNyRCxVQUFNLFdBQVcsVUFBVSxPQUFPLG1CQUFtQjtBQUVyRCxVQUFNLFVBQVUsU0FBUyxPQUFPLE9BQUssQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUN0RyxVQUFNLFVBQVUsU0FBUyxPQUFPLE9BQUssQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUN0RyxVQUFNLFVBQVUsU0FBUyxPQUFPLE9BQUssQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUV0RyxXQUFPLFlBQVksUUFBUSxRQUFRLFFBQVEsTUFBTTtBQUNqRCxXQUFPLFlBQVksUUFBUSxRQUFRLFFBQVEsTUFBTTtBQUNqRCxXQUFPLFlBQVksUUFBUSxRQUFRLENBQUM7QUFBQSxFQUNyQyxDQUFDO0FBRUQsT0FBSyxvREFBb0QsTUFBTTtBQUM5RCxVQUFNLFVBQVUsVUFBVSxPQUFPLEVBQUU7QUFDbkMsV0FBTyxHQUFHLFFBQVEsU0FBUyxDQUFDO0FBRzVCLFVBQU0sVUFBVSxRQUFRLE9BQU8sNEJBQTRCO0FBQzNELFVBQU0sU0FBUyxRQUFRLE9BQU8sT0FBSyxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0FBRXBHLFdBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUNwQyxXQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFBQSxFQUNwQyxDQUFDO0FBRUQsT0FBSyxpRUFBaUUsTUFBTTtBQUMzRSxVQUFNLFVBQVUsVUFBVSxPQUFPLHFCQUFxQjtBQUN0RCxVQUFNLFNBQVMsUUFBUSxPQUFPLE9BQUssQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUNwRyxXQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFBQSxFQUNwQyxDQUFDO0FBRUQsT0FBSyxtRUFBbUUsTUFBTTtBQUM3RSxVQUFNLFVBQVUsVUFBVSxPQUFPLHVCQUF1QjtBQUN4RCxVQUFNLFNBQVMsUUFBUSxPQUFPLE9BQUssQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUNwRyxXQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFBQSxFQUNwQyxDQUFDO0FBRUQsT0FBSyxvRkFBb0YsWUFBWTtBQU1wRyxVQUFNLFVBQVUsSUFBSSwwQkFBMEI7QUFDOUMsWUFBUSxVQUFVLEVBQUUsUUFBUSx5QkFBeUIsYUFBYSxXQUFXLG1CQUFtQixRQUFXLE1BQU0sUUFBVyxlQUFlLE9BQVUsQ0FBQztBQUd0SixZQUFRLFNBQVMseUJBQXlCLDBDQUEwQztBQUFBLE1BQ25GLFdBQVcsSUFBSSxvQkFBb0IsYUFBYTtBQUFBLE1BQ2hELElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxNQUNULFFBQVE7QUFBQSxNQUNSLGdCQUFnQjtBQUFBLE1BQ2hCLGlCQUFpQjtBQUFBLE1BQ2pCLGtCQUFrQjtBQUFBLE1BQ2xCLHVCQUF1QjtBQUFBLE1BQ3ZCLFlBQVksRUFBRSxJQUFJLGFBQWE7QUFBQSxNQUMvQixjQUFjLEVBQUUsYUFBYSxNQUFNLFFBQVEsT0FBTyxXQUFXLEtBQUs7QUFBQSxNQUNsRSxzQkFBc0IsQ0FBQztBQUFBLElBQ3hCLENBQUM7QUFHRCxZQUFRLFNBQVMseUJBQXlCLHVEQUF1RDtBQUFBLE1BQ2hHLFdBQVcsSUFBSSxvQkFBb0IsYUFBYTtBQUFBLE1BQ2hELElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxNQUNULFFBQVE7QUFBQSxNQUNSLGdCQUFnQjtBQUFBLE1BQ2hCLGlCQUFpQjtBQUFBLE1BQ2pCLGtCQUFrQjtBQUFBLE1BQ2xCLHVCQUF1QjtBQUFBLE1BQ3ZCLFlBQVksRUFBRSxJQUFJLGFBQWE7QUFBQSxNQUMvQixxQkFBcUI7QUFBQSxNQUNyQixjQUFjLEVBQUUsYUFBYSxNQUFNLFFBQVEsT0FBTyxXQUFXLEtBQUs7QUFBQSxNQUNsRSxzQkFBc0IsQ0FBQztBQUFBLElBQ3hCLENBQUM7QUFFRCxVQUFNLHFCQUFxQixNQUFNLElBQUksSUFBSSxvQkFBb0IsT0FBTyxDQUFDO0FBQ3JFLFVBQU0sbUJBQW1CLFFBQVE7QUFFakMsVUFBTSxTQUFTLG1CQUFtQixPQUFPLEVBQUUsRUFBRSxPQUFPLE9BQUssQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUMxSCxXQUFPLGdCQUFnQixPQUFPLElBQUksT0FBSyxFQUFFLE1BQU0sU0FBUyxFQUFFLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQztBQUFBLEVBQ2xGLENBQUM7QUFFRixDQUFDOyIsCiAgIm5hbWVzIjogWyJ2aWV3TW9kZWwiXQp9Cg==
