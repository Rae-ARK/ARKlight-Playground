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
import { SequencerByKey, timeout } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { CancellationError, getErrorMessage, isCancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { hash } from "../../../../base/common/hash.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { equals } from "../../../../base/common/objects.js";
import Severity from "../../../../base/common/severity.js";
import { format, isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { SubmenuAction } from "../../../../base/common/actions.js";
import { isObject, isString } from "../../../../base/common/types.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService, NeverShowAgainScope } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { asJson, IRequestService } from "../../../../platform/request/common/request.js";
import { IQuickInputService, QuickInputHideReason } from "../../../../platform/quickinput/common/quickInput.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { ChatContextKeys } from "./actions/chatContextKeys.js";
import { ILanguageModelsConfigurationService } from "./languageModelsConfiguration.js";
const COPILOT_VENDOR_ID = "copilot";
function isLanguageModelVendorAbsenceConclusive(vendor, hasLiveModels, hasResolved) {
  return hasLiveModels || hasResolved && vendor !== COPILOT_VENDOR_ID;
}
const BUILT_IN_BYOK_VENDOR_IDS = /* @__PURE__ */ new Set([
  "openai",
  "anthropic",
  "gemini",
  "ollama",
  "openrouter",
  "azure",
  "xai",
  "customoai",
  "customendpoint"
]);
const THIRD_PARTY_PROVIDER_TELEMETRY_NAME = "3p-extension";
const BUILT_IN_BYOK_EXTENSION_IDS = [
  "github.copilot-chat",
  "github.copilot"
];
function getByokProviderTelemetryName(vendor, extension) {
  if (!vendor || vendor === COPILOT_VENDOR_ID) {
    return void 0;
  }
  if (BUILT_IN_BYOK_VENDOR_IDS.has(vendor) && extension && BUILT_IN_BYOK_EXTENSION_IDS.some((id) => ExtensionIdentifier.equals(extension, id))) {
    return vendor;
  }
  return THIRD_PARTY_PROVIDER_TELEMETRY_NAME;
}
var ChatMessageRole = /* @__PURE__ */ ((ChatMessageRole2) => {
  ChatMessageRole2[ChatMessageRole2["System"] = 0] = "System";
  ChatMessageRole2[ChatMessageRole2["User"] = 1] = "User";
  ChatMessageRole2[ChatMessageRole2["Assistant"] = 2] = "Assistant";
  return ChatMessageRole2;
})(ChatMessageRole || {});
var LanguageModelPartAudience = /* @__PURE__ */ ((LanguageModelPartAudience2) => {
  LanguageModelPartAudience2[LanguageModelPartAudience2["Assistant"] = 0] = "Assistant";
  LanguageModelPartAudience2[LanguageModelPartAudience2["User"] = 1] = "User";
  LanguageModelPartAudience2[LanguageModelPartAudience2["Extension"] = 2] = "Extension";
  return LanguageModelPartAudience2;
})(LanguageModelPartAudience || {});
var ChatImageMimeType = /* @__PURE__ */ ((ChatImageMimeType2) => {
  ChatImageMimeType2["PNG"] = "image/png";
  ChatImageMimeType2["JPEG"] = "image/jpeg";
  ChatImageMimeType2["GIF"] = "image/gif";
  ChatImageMimeType2["WEBP"] = "image/webp";
  ChatImageMimeType2["BMP"] = "image/bmp";
  return ChatImageMimeType2;
})(ChatImageMimeType || {});
var ImageDetailLevel = /* @__PURE__ */ ((ImageDetailLevel2) => {
  ImageDetailLevel2["Low"] = "low";
  ImageDetailLevel2["High"] = "high";
  return ImageDetailLevel2;
})(ImageDetailLevel || {});
var ILanguageModelChatMetadata;
((ILanguageModelChatMetadata2) => {
  function suitableForAgentMode(metadata) {
    const supportsToolsAgent = typeof metadata.capabilities?.agentMode === "undefined" || metadata.capabilities.agentMode;
    return supportsToolsAgent && !!metadata.capabilities?.toolCalling;
  }
  ILanguageModelChatMetadata2.suitableForAgentMode = suitableForAgentMode;
  function asQualifiedName(metadata) {
    return `${metadata.name} (${metadata.vendor})`;
  }
  ILanguageModelChatMetadata2.asQualifiedName = asQualifiedName;
  function matchesQualifiedName(name, metadata) {
    if (metadata.vendor === COPILOT_VENDOR_ID && name === metadata.name) {
      return true;
    }
    return name === asQualifiedName(metadata);
  }
  ILanguageModelChatMetadata2.matchesQualifiedName = matchesQualifiedName;
  function hasPromoDiscount(metadata) {
    return !!metadata.promo && metadata.promo.discountPercent > 0;
  }
  ILanguageModelChatMetadata2.hasPromoDiscount = hasPromoDiscount;
  ILanguageModelChatMetadata2.autoModelSelectionDocsUrl = "https://docs.github.com/en/copilot/concepts/models/auto-model-selection";
  function getAutoModelDescription(discountPercent) {
    const base = localize("autoModel.description", "Auto routes based on your task and real-time system health and model performance.");
    const learnMore = localize("autoModel.learnMore", "[Learn More]({0})", ILanguageModelChatMetadata2.autoModelSelectionDocsUrl);
    if (typeof discountPercent === "number" && discountPercent > 0) {
      const discount = localize("autoModel.discount", "Models routed via auto receive a {0}% discount.", discountPercent);
      return `${base} ${discount} ${learnMore}`;
    }
    return `${base} ${learnMore}`;
  }
  ILanguageModelChatMetadata2.getAutoModelDescription = getAutoModelDescription;
  function getAgentHostByokManageModelsIdentifier(metadata) {
    return metadata.byokModelIdentifier;
  }
  ILanguageModelChatMetadata2.getAgentHostByokManageModelsIdentifier = getAgentHostByokManageModelsIdentifier;
})(ILanguageModelChatMetadata || (ILanguageModelChatMetadata = {}));
async function getTextResponseFromStream(response) {
  let responseText = "";
  const streaming = (async () => {
    if (!response?.stream) {
      return;
    }
    for await (const part of response.stream) {
      if (Array.isArray(part)) {
        for (const item of part) {
          if (item.type === "text") {
            responseText += item.value;
          }
        }
      } else if (part.type === "text") {
        responseText += part.value;
      }
    }
  })();
  try {
    await Promise.all([response.result, streaming]);
    return responseText;
  } catch (err) {
    if (responseText) {
      return responseText;
    }
    throw err;
  }
}
function isILanguageModelChatSelector(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value;
  return (obj.name === void 0 || typeof obj.name === "string") && (obj.id === void 0 || typeof obj.id === "string") && (obj.vendor === void 0 || typeof obj.vendor === "string") && (obj.version === void 0 || typeof obj.version === "string") && (obj.family === void 0 || typeof obj.family === "string") && (obj.tokens === void 0 || typeof obj.tokens === "number") && (obj.extension === void 0 || typeof obj.extension === "object");
}
const ILanguageModelsService = createDecorator("ILanguageModelsService");
function getLanguageModelProviderDisplayName(languageModelsService, vendor) {
  if (vendor === "copilotcli") {
    return localize("chat.languageModelProvider.copilot", "Copilot");
  }
  const descriptor = languageModelsService.getVendors().find((candidate) => candidate.vendor === vendor);
  return descriptor?.displayName ?? vendor.charAt(0).toUpperCase() + vendor.slice(1);
}
function getLanguageModelDisplayNameWithProvider(model, languageModelsService) {
  const { metadata } = model;
  if (!metadata.isBYOK && !metadata.byokModelIdentifier) {
    return metadata.name;
  }
  const originalIdentifier = metadata.byokModelIdentifier ?? model.identifier;
  const originalMetadata = metadata.byokModelIdentifier ? languageModelsService.lookupLanguageModel(originalIdentifier) : metadata;
  const providerVendor = originalMetadata?.vendor ?? metadata.modelGroup?.id ?? metadata.vendor;
  const providerName = getLanguageModelProviderDisplayName(languageModelsService, providerVendor);
  const groupName = languageModelsService.getLanguageModelGroups(providerVendor).find((group) => group.modelIdentifiers.includes(originalIdentifier))?.group?.name;
  return groupName && groupName !== providerName ? localize("chat.languageModelNameWithProviderAndGroup", "{0}/{1}/{2}", providerName, groupName, metadata.name) : localize("chat.languageModelNameWithProvider", "{0}/{1}", providerName, metadata.name);
}
const languageModelChatProviderType = {
  type: "object",
  required: ["vendor", "displayName"],
  properties: {
    vendor: {
      type: "string",
      description: localize("vscode.extension.contributes.languageModels.vendor", "A globally unique vendor of language model chat provider.")
    },
    displayName: {
      type: "string",
      description: localize("vscode.extension.contributes.languageModels.displayName", "The display name of the language model chat provider.")
    },
    configuration: {
      type: "object",
      description: localize("vscode.extension.contributes.languageModels.configuration", "Configuration options for the language model chat provider."),
      anyOf: [
        {
          $ref: "http://json-schema.org/draft-07/schema#"
        },
        {
          properties: {
            properties: {
              type: "object",
              additionalProperties: {
                $ref: "http://json-schema.org/draft-07/schema#",
                properties: {
                  secret: {
                    type: "boolean",
                    description: localize("vscode.extension.contributes.languageModels.configuration.secret", "Whether the property is a secret.")
                  }
                }
              }
            },
            additionalProperties: {
              $ref: "http://json-schema.org/draft-07/schema#",
              properties: {
                secret: {
                  type: "boolean",
                  description: localize("vscode.extension.contributes.languageModels.configuration.secret", "Whether the property is a secret.")
                }
              }
            }
          }
        }
      ]
    },
    managementCommand: {
      type: "string",
      description: localize("vscode.extension.contributes.languageModels.managementCommand", "A command to manage the language model chat provider, e.g. 'Manage Copilot models'. This is used in the chat model picker. If not provided, a gear icon is not rendered during vendor selection."),
      deprecated: true,
      deprecationMessage: localize("vscode.extension.contributes.languageModels.managementCommand.deprecated", "The managementCommand property is deprecated and will be removed in a future release. Use the new configuration property instead.")
    },
    deprecation: {
      type: "object",
      description: localize("vscode.extension.contributes.languageModels.deprecation", "Marks this language model chat provider as deprecated. When set, the Manage Models view renders the provider with a link pointing to a replacement."),
      properties: {
        link: {
          type: "string",
          description: localize("vscode.extension.contributes.languageModels.deprecation.link", "A URL opened when the user clicks the deprecation link shown next to the provider name. Use a 'vscode:extension/<publisher>.<name>' URI to open a replacement extension in the Extensions view.")
        }
      }
    },
    when: {
      type: "string",
      description: localize("vscode.extension.contributes.languageModels.when", "Condition which must be true to show this language model chat provider in the Manage Models list.")
    }
  }
};
function resolveProviderDeprecationLink(link, urlProtocol) {
  const uri = URI.parse(link);
  return uri.scheme === Schemas.vscode && urlProtocol ? uri.with({ scheme: urlProtocol }) : uri;
}
const languageModelChatProviderExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "languageModelChatProviders",
  jsonSchema: {
    description: localize("vscode.extension.contributes.languageModelChatProviders", "Contribute language model chat providers of a specific vendor."),
    oneOf: [
      languageModelChatProviderType,
      {
        type: "array",
        items: languageModelChatProviderType
      }
    ]
  },
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      yield `onLanguageModelChatProvider:${contrib.vendor}`;
    }
  }
});
const CHAT_MODEL_RECENTLY_USED_STORAGE_KEY = "chatModelRecentlyUsed";
const CHAT_MODEL_PINNED_STORAGE_KEY = "chatModelPinned";
const CHAT_MODEL_VISIBILITY_STORAGE_KEY = "chatModelVisibility";
const AUTO_MODEL_IDENTIFIER = "copilot/auto";
function isAutoLanguageModel(model) {
  return model?.metadata.id === "auto" || model?.identifier === AUTO_MODEL_IDENTIFIER;
}
const CHAT_PARTICIPANT_NAME_REGISTRY_STORAGE_KEY = "chat.participantNameRegistry";
const CHAT_MODELS_CONTROL_STORAGE_KEY = "chat.modelsControl";
function createModelConfigurationActions(schema, currentConfig, setValue) {
  if (!schema?.properties) {
    return [];
  }
  const actions = [];
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    if (!propSchema.enum || !Array.isArray(propSchema.enum) || propSchema.enum.length < 1) {
      continue;
    }
    const currentValue = currentConfig[key] ?? propSchema.default;
    const label = (typeof propSchema.title === "string" ? propSchema.title : void 0) ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (s) => s.toUpperCase());
    const defaultValue = propSchema.default;
    const enumItemLabels = propSchema.enumItemLabels;
    const enumDescriptions = propSchema.enumDescriptions;
    const enumActions = propSchema.enum.map((value, index) => {
      const itemLabel = enumItemLabels?.[index] ?? String(value);
      const displayLabel = value === defaultValue ? localize("models.enumDefault", "{0} (default)", itemLabel) : itemLabel;
      const tooltip = enumDescriptions?.[index] ?? "";
      return {
        id: `configureModel.${key}.${value}`,
        label: displayLabel,
        class: void 0,
        enabled: true,
        tooltip,
        checked: currentValue === value,
        run: () => setValue(key, value)
      };
    });
    actions.push(new SubmenuAction(`configureModel.${key}`, label, enumActions));
  }
  return actions;
}
let LanguageModelsService = class {
  constructor(_extensionService, _logService, _storageService, _contextKeyService, _languageModelsConfigurationService, _quickInputService, _secretStorageService, _productService, _requestService, _notificationService, _openerService, _telemetryService) {
    this._extensionService = _extensionService;
    this._logService = _logService;
    this._storageService = _storageService;
    this._contextKeyService = _contextKeyService;
    this._languageModelsConfigurationService = _languageModelsConfigurationService;
    this._quickInputService = _quickInputService;
    this._secretStorageService = _secretStorageService;
    this._productService = _productService;
    this._requestService = _requestService;
    this._notificationService = _notificationService;
    this._openerService = _openerService;
    this._telemetryService = _telemetryService;
    this._store = new DisposableStore();
    this._providers = /* @__PURE__ */ new Map();
    this._vendors = /* @__PURE__ */ new Map();
    /** Vendors for which a deprecation notice has already been shown this session. */
    this._deprecationNoticeShownVendors = /* @__PURE__ */ new Set();
    this._onDidChangeLanguageModelVendors = this._store.add(new Emitter());
    this.onDidChangeLanguageModelVendors = this._onDidChangeLanguageModelVendors.event;
    this._modelsGroups = /* @__PURE__ */ new Map();
    this._modelCache = /* @__PURE__ */ new Map();
    this._resolveLMSequencer = new SequencerByKey();
    this._modelConfigurations = /* @__PURE__ */ new Map();
    this._onLanguageModelChange = this._store.add(new Emitter());
    this.onDidChangeLanguageModels = this._onLanguageModelChange.event;
    this._recentlyUsedModelIds = [];
    this._pinnedModelIds = [];
    this._hiddenModelIds = /* @__PURE__ */ new Set();
    this._onDidChangeModelsControlManifest = this._store.add(new Emitter());
    this.onDidChangeModelsControlManifest = this._onDidChangeModelsControlManifest.event;
    this._onDidChangePinnedModels = this._store.add(new Emitter());
    this.onDidChangePinnedModels = this._onDidChangePinnedModels.event;
    this._onDidChangeModelVisibility = this._store.add(new Emitter());
    this.onDidChangeModelVisibility = this._onDidChangeModelVisibility.event;
    this._modelsControlManifest = { free: {}, paid: {} };
    this._chatControlDisposed = false;
    this._restrictedChatParticipants = observableValue(this, /* @__PURE__ */ Object.create(null));
    this.restrictedChatParticipants = this._restrictedChatParticipants;
    this._hasUserSelectableModels = ChatContextKeys.languageModelsAreUserSelectable.bindTo(_contextKeyService);
    this._hasNonCopilotUserSelectableModels = ChatContextKeys.nonCopilotLanguageModelsAreUserSelectable.bindTo(_contextKeyService);
    this._recentlyUsedModelIds = this._readRecentlyUsedModels();
    this._pinnedModelIds = this._readPinnedModels();
    this._readVisibility();
    this._initChatControlData();
    this._store.add(this.onDidChangeLanguageModels(() => {
      let hasUserSelectable = false;
      let hasNonCopilotUserSelectable = false;
      for (const model of this._modelCache.values()) {
        if (model.isUserSelectable === false) {
          continue;
        }
        hasUserSelectable = true;
        if (model.vendor !== COPILOT_VENDOR_ID) {
          hasNonCopilotUserSelectable = true;
          break;
        }
      }
      this._hasUserSelectableModels.set(hasUserSelectable);
      this._hasNonCopilotUserSelectableModels.set(hasNonCopilotUserSelectable);
      this._refreshModelsControlManifest();
    }));
    this._store.add(this._languageModelsConfigurationService.onDidChangeLanguageModelGroups((changedGroups) => this._onDidChangeLanguageModelGroups(changedGroups)));
    this._store.add(languageModelChatProviderExtensionPoint.setHandler((extensions, { added, removed }) => {
      const addedVendors = [];
      const removedVendors = [];
      for (const extension of added) {
        for (const item of Iterable.wrap(extension.value)) {
          if (this._vendors.has(item.vendor)) {
            extension.collector.error(localize("vscode.extension.contributes.languageModels.vendorAlreadyRegistered", "The vendor '{0}' is already registered and cannot be registered twice", item.vendor));
            continue;
          }
          if (isFalsyOrWhitespace(item.vendor)) {
            extension.collector.error(localize("vscode.extension.contributes.languageModels.emptyVendor", "The vendor field cannot be empty."));
            continue;
          }
          if (item.vendor.trim() !== item.vendor) {
            extension.collector.error(localize("vscode.extension.contributes.languageModels.whitespaceVendor", "The vendor field cannot start or end with whitespace."));
            continue;
          }
          addedVendors.push(item);
        }
      }
      for (const extension of removed) {
        for (const item of Iterable.wrap(extension.value)) {
          removedVendors.push(item);
        }
      }
      this.deltaLanguageModelChatProviderDescriptors(addedVendors, removedVendors);
    }));
  }
  deltaLanguageModelChatProviderDescriptors(added, removed) {
    const addedVendorIds = [];
    const removedVendorIds = [];
    for (const item of added) {
      if (this._vendors.has(item.vendor)) {
        this._logService.error(`The vendor '${item.vendor}' is already registered and cannot be registered twice`);
        continue;
      }
      if (isFalsyOrWhitespace(item.vendor)) {
        this._logService.error("The vendor field cannot be empty.");
        continue;
      }
      if (item.vendor.trim() !== item.vendor) {
        this._logService.error("The vendor field cannot start or end with whitespace.");
        continue;
      }
      const vendor = {
        vendor: item.vendor,
        displayName: item.displayName,
        configuration: item.configuration,
        managementCommand: item.managementCommand,
        deprecation: item.deprecation,
        when: item.when,
        isDefault: item.vendor === COPILOT_VENDOR_ID
      };
      this._vendors.set(item.vendor, vendor);
      addedVendorIds.push(item.vendor);
    }
    for (const item of removed) {
      this._vendors.delete(item.vendor);
      this._providers.delete(item.vendor);
      this._clearModelCache(item.vendor);
      this._modelsGroups.delete(item.vendor);
      removedVendorIds.push(item.vendor);
    }
    for (const [vendor, _] of this._providers) {
      if (!this._vendors.has(vendor)) {
        this._providers.delete(vendor);
      }
    }
    if (addedVendorIds.length > 0 || removedVendorIds.length > 0) {
      this._onDidChangeLanguageModelVendors.fire([...addedVendorIds, ...removedVendorIds]);
      if (removedVendorIds.length > 0) {
        for (const vendor of removedVendorIds) {
          this._onLanguageModelChange.fire(vendor);
        }
      }
    }
  }
  async _onDidChangeLanguageModelGroups(changedGroups) {
    const changedVendors = new Set(changedGroups.map((g) => g.vendor));
    await Promise.all(Array.from(changedVendors).map((vendor) => this._resolveAllLanguageModels(vendor, true)));
  }
  getVendors() {
    return Array.from(this._vendors.values()).filter((vendor) => {
      if (!vendor.when) {
        return true;
      }
      const whenClause = ContextKeyExpr.deserialize(vendor.when);
      return whenClause ? this._contextKeyService.contextMatchesRules(whenClause) : false;
    });
  }
  getLanguageModelIds() {
    return Array.from(this._modelCache.keys());
  }
  lookupLanguageModel(modelIdentifier) {
    return this._modelCache.get(modelIdentifier);
  }
  lookupLanguageModelByQualifiedName(referenceName) {
    for (const [identifier, model] of this._modelCache.entries()) {
      if (ILanguageModelChatMetadata.matchesQualifiedName(referenceName, model)) {
        return { metadata: model, identifier };
      }
    }
    return void 0;
  }
  async _resolveAllLanguageModels(vendorId, silent) {
    const vendor = this._vendors.get(vendorId);
    if (!vendor) {
      return;
    }
    let provider = this._providers.get(vendorId);
    if (!provider) {
      await this._extensionService.activateByEvent(`onLanguageModelChatProvider:${vendorId}`);
      provider = this._providers.get(vendorId);
    }
    if (!provider) {
      this._logService.warn(`[LM] No provider registered for vendor ${vendorId}`);
      return;
    }
    return this._resolveLMSequencer.queue(vendorId, async () => {
      const allModels = [];
      const languageModelsGroups = [];
      try {
        const models = await provider.provideLanguageModelChatInfo({ silent }, CancellationToken.None);
        if (models.length) {
          allModels.push(...models);
          const modelIdentifiers = [];
          for (const m of models) {
            if (vendor.isDefault) {
              if (m.metadata.isUserSelectable !== false) {
                modelIdentifiers.push(m.identifier);
              } else {
                this._logService.trace(`[LM] Skipping model ${m.identifier} from model picker as it is not user selectable.`);
              }
            } else {
              modelIdentifiers.push(m.identifier);
            }
          }
          languageModelsGroups.push({ modelIdentifiers });
        }
      } catch (error) {
        languageModelsGroups.push({
          modelIdentifiers: [],
          status: {
            message: getErrorMessage(error),
            severity: Severity.Error
          }
        });
      }
      const groups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
      const perModelConfigurations = /* @__PURE__ */ new Map();
      for (const group of groups) {
        if (group.vendor !== vendorId) {
          continue;
        }
        if (!vendor.configuration && allModels.length > 0) {
          if (group.settings) {
            for (const model of allModels) {
              const modelConfig = group.settings[model.metadata.id];
              if (modelConfig) {
                perModelConfigurations.set(model.identifier, { ...modelConfig });
              }
            }
          }
          languageModelsGroups.push({ group, modelIdentifiers: [] });
          continue;
        }
        const configuration = await this._resolveConfiguration(group, vendor.configuration);
        try {
          const models = await provider.provideLanguageModelChatInfo({ group: group.name, silent, configuration }, CancellationToken.None);
          if (models.length) {
            for (let i = 0; i < models.length; i++) {
              if (!models[i].metadata.detail) {
                models[i] = { ...models[i], metadata: { ...models[i].metadata, detail: group.name } };
              }
            }
            allModels.push(...models);
            languageModelsGroups.push({ group, modelIdentifiers: models.map((m) => m.identifier) });
          }
          if (group.settings) {
            for (const model of models) {
              const modelConfig = group.settings[model.metadata.id];
              if (modelConfig) {
                perModelConfigurations.set(model.identifier, { ...modelConfig });
              }
            }
          }
        } catch (error) {
          languageModelsGroups.push({
            group,
            modelIdentifiers: [],
            status: {
              message: getErrorMessage(error),
              severity: Severity.Error
            }
          });
        }
      }
      const wasResolved = this._modelsGroups.has(vendorId);
      const oldGroups = this._modelsGroups.get(vendorId) ?? [];
      this._modelsGroups.set(vendorId, languageModelsGroups);
      const oldModels = this._clearModelCache(vendorId);
      let hasChanges = !wasResolved;
      for (const model of allModels) {
        if (this._modelCache.has(model.identifier)) {
          this._logService.warn(`[LM] Model ${model.identifier} is already registered. Skipping.`);
          continue;
        }
        this._modelCache.set(model.identifier, model.metadata);
        hasChanges = hasChanges || !equals(oldModels.get(model.identifier), model.metadata);
        oldModels.delete(model.identifier);
      }
      this._logService.trace(`[LM] Resolved language models for vendor ${vendorId}`, allModels);
      hasChanges = hasChanges || oldModels.size > 0;
      if (!hasChanges) {
        hasChanges = this._hasGroupStructureChanged(oldGroups, languageModelsGroups);
      }
      this._clearModelConfigurations(vendorId);
      for (const [identifier, config] of perModelConfigurations) {
        if (this._modelCache.has(identifier)) {
          this._modelConfigurations.set(identifier, config);
        }
      }
      if (hasChanges) {
        this._onLanguageModelChange.fire(vendorId);
      } else {
        this._logService.trace(`[LM] No changes in language models for vendor ${vendorId}`);
      }
    });
  }
  _hasGroupStructureChanged(oldGroups, newGroups) {
    if (oldGroups.length !== newGroups.length) {
      return true;
    }
    for (let i = 0; i < oldGroups.length; i++) {
      const oldGroup = oldGroups[i];
      const newGroup = newGroups[i];
      if (oldGroup.group?.name !== newGroup.group?.name || oldGroup.group?.vendor !== newGroup.group?.vendor || oldGroup.status?.message !== newGroup.status?.message || oldGroup.status?.severity !== newGroup.status?.severity || oldGroup.modelIdentifiers.length !== newGroup.modelIdentifiers.length) {
        return true;
      }
    }
    return false;
  }
  getLanguageModelGroups(vendor) {
    return this._modelsGroups.get(vendor) ?? [];
  }
  hasResolvedVendor(vendor) {
    return this._modelsGroups.has(vendor);
  }
  async selectLanguageModels(selector) {
    if (selector.vendor) {
      await this._resolveAllLanguageModels(selector.vendor, true);
    } else {
      const allVendors = Array.from(this._vendors.keys());
      await Promise.all(allVendors.map((vendor) => this._resolveAllLanguageModels(vendor, true)));
    }
    const result = [];
    for (const [internalModelIdentifier, model] of this._modelCache) {
      if ((selector.vendor === void 0 || model.vendor === selector.vendor) && (selector.family === void 0 || model.family === selector.family) && (selector.version === void 0 || model.version === selector.version) && (selector.id === void 0 || model.id === selector.id)) {
        result.push(internalModelIdentifier);
      }
    }
    this._logService.trace("[LM] selected language models", selector, result);
    return result;
  }
  registerLanguageModelProvider(vendor, provider) {
    this._logService.trace("[LM] registering language model provider", vendor, provider);
    if (!this._vendors.has(vendor)) {
      throw new Error(`Chat model provider uses UNKNOWN vendor ${vendor}.`);
    }
    if (this._providers.has(vendor)) {
      throw new Error(`Chat model provider for vendor ${vendor} is already registered.`);
    }
    this._providers.set(vendor, provider);
    const modelChangeListener = provider.onDidChange(() => {
      this._resolveAllLanguageModels(vendor, true);
    });
    return toDisposable(() => {
      this._logService.trace("[LM] UNregistered language model provider", vendor);
      this._clearModelCache(vendor);
      this._modelsGroups.delete(vendor);
      this._providers.delete(vendor);
      modelChangeListener.dispose();
    });
  }
  async sendChatRequest(modelId, from, messages, options, token) {
    const metadata = this._modelCache.get(modelId);
    const provider = this._providers.get(metadata?.vendor || "");
    if (!provider) {
      throw new Error(`Chat provider for model ${modelId} is not registered.`);
    }
    if (metadata) {
      this._logProviderUsageTelemetry(metadata);
      this._maybeShowProviderDeprecationNotice(metadata);
    }
    const configuration = this.getModelConfiguration(modelId);
    const mergedOptions = configuration ? { ...options, configuration: { ...configuration, ...options.configuration } } : options;
    return provider.sendChatRequest(modelId, messages, from, mergedOptions, token);
  }
  /**
   * When a chat request is made against a deprecated provider (one that contributes a
   * `deprecation.link`), prompt the user once per session to install the replacement
   * extension. The notification can be dismissed, and offers a "Don't Show Again" choice that
   * is persisted across sessions via the notification service's `neverShowAgain` support.
   */
  _maybeShowProviderDeprecationNotice(metadata) {
    const vendor = this._vendors.get(metadata.vendor);
    const link = vendor?.deprecation?.link;
    if (!link) {
      return;
    }
    if (this._deprecationNoticeShownVendors.has(metadata.vendor)) {
      return;
    }
    this._deprecationNoticeShownVendors.add(metadata.vendor);
    const providerName = (vendor.displayName || metadata.vendor).replace(/\s*\(deprecated\)\s*$/i, "");
    this._notificationService.prompt(
      Severity.Info,
      localize("chat.providerDeprecation.message", "The internal {0} language model provider is being deprecated. Please migrate to the official extension.", providerName),
      [{
        label: localize("chat.providerDeprecation.install", "Install Extension"),
        run: () => {
          this._openerService.open(resolveProviderDeprecationLink(link, this._productService.urlProtocol));
        }
      }],
      {
        neverShowAgain: { id: `chat.providerDeprecation.${metadata.vendor}`, scope: NeverShowAgainScope.APPLICATION }
      }
    );
  }
  /**
   * Reports which in-built BYOK provider (or third-party extension) backs a model request. First-party
   * Copilot models are intentionally not reported here (see {@link getByokProviderTelemetryName}).
   */
  _logProviderUsageTelemetry(metadata) {
    const provider = getByokProviderTelemetryName(metadata?.vendor, metadata?.extension);
    if (!provider) {
      return;
    }
    this._telemetryService.publicLog2("chat.languageModelRequest", {
      provider,
      isBYOK: !!metadata?.isBYOK
    });
  }
  _resolveModelConfigurationWithDefaults(modelId, metadata) {
    const userConfig = this._modelConfigurations.get(modelId);
    const schema = metadata?.configurationSchema;
    if (!schema?.properties && !userConfig) {
      return void 0;
    }
    const defaults = {};
    if (schema?.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (propSchema.default !== void 0) {
          defaults[key] = propSchema.default;
        }
      }
    }
    if (!userConfig && Object.keys(defaults).length === 0) {
      return void 0;
    }
    return { ...defaults, ...userConfig };
  }
  computeTokenLength(modelId, message, token) {
    const model = this._modelCache.get(modelId);
    if (!model) {
      throw new Error(`Chat model ${modelId} could not be found.`);
    }
    const provider = this._providers.get(model.vendor);
    if (!provider) {
      throw new Error(`Chat provider for model ${modelId} is not registered.`);
    }
    return provider.provideTokenCount(modelId, message, token);
  }
  getModelConfiguration(modelId) {
    const metadata = this._modelCache.get(modelId);
    return this._resolveModelConfigurationWithDefaults(modelId, metadata);
  }
  async setModelConfiguration(modelId, values) {
    const metadata = this._modelCache.get(modelId);
    if (!metadata) {
      return;
    }
    const allGroups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
    let group;
    group = allGroups.find((g) => g.vendor === metadata.vendor && g.settings?.[metadata.id] !== void 0);
    if (!group) {
      const vendorGroups = this._modelsGroups.get(metadata.vendor);
      const containingGroup = vendorGroups?.find((vg) => vg.modelIdentifiers.includes(modelId) && vg.group)?.group;
      if (containingGroup) {
        group = allGroups.find((g) => g.vendor === containingGroup.vendor && g.name === containingGroup.name) ?? containingGroup;
      }
    }
    if (!group) {
      group = allGroups.find((g) => g.vendor === metadata.vendor);
    }
    const existingConfig = this._modelConfigurations.get(modelId) ?? {};
    const updatedConfig = { ...existingConfig, ...values };
    const schema = metadata.configurationSchema;
    if (schema?.properties) {
      for (const [key, value] of Object.entries(updatedConfig)) {
        const propSchema = schema.properties[key];
        if (propSchema?.default !== void 0 && propSchema.default === value) {
          delete updatedConfig[key];
        }
      }
    }
    if (group) {
      const existingSettings = group.settings ?? {};
      let updatedSettings;
      if (Object.keys(updatedConfig).length === 0) {
        updatedSettings = { ...existingSettings };
        delete updatedSettings[metadata.id];
      } else {
        updatedSettings = { ...existingSettings, [metadata.id]: updatedConfig };
      }
      const updatedGroup = {
        ...group,
        settings: Object.keys(updatedSettings).length > 0 ? updatedSettings : void 0
      };
      if (!updatedGroup.settings && Object.keys(updatedGroup).filter((k) => k !== "name" && k !== "vendor" && k !== "range" && k !== "modelsRange" && k !== "settings").length === 0) {
        await this._languageModelsConfigurationService.removeLanguageModelsProviderGroup(group);
      } else {
        await this._languageModelsConfigurationService.updateLanguageModelsProviderGroup(group, updatedGroup);
      }
    } else if (Object.keys(updatedConfig).length > 0) {
      const vendor = this._vendors.get(metadata.vendor);
      if (!vendor) {
        return;
      }
      const newGroup = {
        name: vendor.displayName,
        vendor: metadata.vendor,
        settings: { [metadata.id]: updatedConfig }
      };
      await this._languageModelsConfigurationService.addLanguageModelsProviderGroup(newGroup);
    }
    if (Object.keys(updatedConfig).length > 0) {
      this._modelConfigurations.set(modelId, updatedConfig);
    } else {
      this._modelConfigurations.delete(modelId);
    }
    this._onLanguageModelChange.fire(metadata.vendor);
  }
  getModelConfigurationActions(modelId) {
    const metadata = this._modelCache.get(modelId);
    const currentConfig = this._modelConfigurations.get(modelId) ?? {};
    return createModelConfigurationActions(
      metadata?.configurationSchema,
      currentConfig,
      (key, value) => this.setModelConfiguration(modelId, { [key]: value })
    );
  }
  async configureLanguageModelsProviderGroup(vendorId, providerGroupName) {
    const vendor = this.getVendors().find(({ vendor: vendor2 }) => vendor2 === vendorId);
    if (!vendor) {
      throw new Error(`Vendor ${vendorId} not found.`);
    }
    if (vendor.managementCommand) {
      await this._resolveAllLanguageModels(vendor.vendor, false);
      return;
    }
    const languageModelProviderGroups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
    const existing = languageModelProviderGroups.find((g) => g.vendor === vendorId && g.name === providerGroupName);
    const name = await this.promptForName(languageModelProviderGroups, vendor, existing);
    if (!name) {
      return;
    }
    const existingConfiguration = existing ? await this._resolveConfiguration(existing, vendor.configuration) : void 0;
    try {
      const configuration = vendor.configuration ? await this.promptForConfiguration(name, vendor.configuration, existingConfiguration) : void 0;
      if (vendor.configuration && !configuration) {
        return;
      }
      const languageModelProviderGroup = await this._resolveLanguageModelProviderGroup(name, vendorId, configuration, vendor.configuration);
      const saved = existing ? await this._languageModelsConfigurationService.updateLanguageModelsProviderGroup(existing, languageModelProviderGroup) : await this._languageModelsConfigurationService.addLanguageModelsProviderGroup(languageModelProviderGroup);
      if (vendor.configuration && this.requireConfiguring(vendor.configuration)) {
        const snippet = this.getSnippetForFirstUnconfiguredProperty(configuration ?? {}, vendor.configuration);
        await this._languageModelsConfigurationService.configureLanguageModels({ group: saved, snippet });
      }
    } catch (error) {
      if (isCancellationError(error)) {
        return;
      }
      throw error;
    }
  }
  async renameLanguageModelsProviderGroup(vendorId, providerGroupName) {
    const vendor = this.getVendors().find(({ vendor: vendor2 }) => vendor2 === vendorId);
    if (!vendor) {
      throw new Error(`Vendor ${vendorId} not found.`);
    }
    const languageModelProviderGroups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
    const existing = languageModelProviderGroups.find((group) => group.vendor === vendorId && group.name === providerGroupName);
    if (!existing) {
      throw new Error(`Language model provider group ${providerGroupName} for vendor ${vendorId} not found.`);
    }
    const name = await this.promptForName(languageModelProviderGroups, vendor, existing);
    if (!name || name === existing.name) {
      return;
    }
    await this._languageModelsConfigurationService.updateLanguageModelsProviderGroup(existing, { ...existing, name });
  }
  async updateLanguageModelsProviderGroupApiKey(vendorId, providerGroupName) {
    const vendor = this.getVendors().find(({ vendor: vendor2 }) => vendor2 === vendorId);
    const schema = vendor?.configuration;
    const apiKeySchema = schema?.properties?.apiKey;
    if (!vendor || !schema || !apiKeySchema) {
      return;
    }
    const existing = this._languageModelsConfigurationService.getLanguageModelsProviderGroups().find((group) => group.vendor === vendorId && group.name === providerGroupName);
    if (!existing) {
      throw new Error(`Language model provider group ${providerGroupName} for vendor ${vendorId} not found.`);
    }
    try {
      const existingConfiguration = await this._resolveConfiguration(existing, schema);
      const apiKey = await this.promptForValue(existing.name, "apiKey", apiKeySchema, !!schema.required?.includes("apiKey"), existingConfiguration);
      if (apiKey === void 0 || apiKey === existingConfiguration.apiKey) {
        return;
      }
      const configuration = { ...existingConfiguration, apiKey };
      const updated = {
        ...await this._resolveLanguageModelProviderGroup(existing.name, vendorId, configuration, schema),
        settings: existing.settings
      };
      await this._languageModelsConfigurationService.updateLanguageModelsProviderGroup(existing, updated);
      await this._deleteSecretsInConfiguration(existing, schema);
    } catch (error) {
      if (isCancellationError(error)) {
        return;
      }
      throw error;
    }
  }
  async addLanguageModelsProviderGroupModel(vendorId, providerGroupName) {
    const vendor = this.getVendors().find(({ vendor: vendor2 }) => vendor2 === vendorId);
    const schema = vendor?.configuration;
    const modelsSchema = schema?.properties?.models;
    if (!vendor || !modelsSchema) {
      return;
    }
    const group = this._languageModelsConfigurationService.getLanguageModelsProviderGroups().find((group2) => group2.vendor === vendorId && group2.name === providerGroupName);
    if (!group) {
      throw new Error(`Language model provider group ${providerGroupName} for vendor ${vendorId} not found.`);
    }
    const hasModels = Array.isArray(group.models);
    const snippet = hasModels ? this.getSnippetForArrayItem(modelsSchema) : this.getSnippetForProperty("models", modelsSchema);
    if (!snippet) {
      return;
    }
    await this._languageModelsConfigurationService.configureLanguageModels({
      group,
      snippet,
      snippetTarget: hasModels ? "models" : "group"
    });
  }
  async openLanguageModelsProviderGroupSettings(vendorId, providerGroupName) {
    const group = this._languageModelsConfigurationService.getLanguageModelsProviderGroups().find((group2) => group2.vendor === vendorId && group2.name === providerGroupName);
    if (!group) {
      throw new Error(`Language model provider group ${providerGroupName} for vendor ${vendorId} not found.`);
    }
    await this._languageModelsConfigurationService.configureLanguageModels({ group });
  }
  async configureModel(modelId) {
    const metadata = this._modelCache.get(modelId);
    if (!metadata || !metadata.configurationSchema) {
      return;
    }
    const vendorGroups = this._modelsGroups.get(metadata.vendor);
    let group;
    if (vendorGroups) {
      for (const vg of vendorGroups) {
        if (vg.modelIdentifiers.includes(modelId) && vg.group) {
          group = vg.group;
          break;
        }
      }
    }
    if (!group) {
      const vendor = this.getVendors().find((v) => v.vendor === metadata.vendor);
      if (!vendor) {
        return;
      }
      const groupName = vendor.displayName;
      const newGroup = { name: groupName, vendor: metadata.vendor, settings: { [metadata.id]: {} } };
      group = await this._languageModelsConfigurationService.addLanguageModelsProviderGroup(newGroup);
      await this._resolveAllLanguageModels(metadata.vendor, true);
    }
    const snippet = this._getModelConfigurationSnippet(metadata.id, metadata.configurationSchema);
    await this._languageModelsConfigurationService.configureLanguageModels({ group, snippet });
  }
  _getModelConfigurationSnippet(modelId, schema) {
    const properties = [];
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (propSchema.defaultSnippets?.[0]) {
          const snippet = propSchema.defaultSnippets[0];
          let bodyText = snippet.bodyText ?? JSON.stringify(snippet.body, null, "			");
          bodyText = bodyText.replace(/"(\^[^"]*)"/g, (_, value) => value.substring(1));
          properties.push(`			"${key}": ${bodyText}`);
        } else if (propSchema.default !== void 0) {
          properties.push(`			"${key}": ${JSON.stringify(propSchema.default)}`);
        } else {
          properties.push(`			"${key}": \${${key}}`);
        }
      }
    }
    const modelContent = properties.length > 0 ? `{
${properties.join(",\n")}
		}` : "{\n			$0\n		}";
    return `"settings": {
		"${modelId}": ${modelContent}
	}`;
  }
  async addLanguageModelsProviderGroup(name, vendorId, configuration) {
    const vendor = this.getVendors().find(({ vendor: vendor2 }) => vendor2 === vendorId);
    if (!vendor) {
      throw new Error(`Vendor ${vendorId} not found.`);
    }
    const languageModelProviderGroup = await this._resolveLanguageModelProviderGroup(name, vendorId, configuration, vendor.configuration);
    await this._languageModelsConfigurationService.addLanguageModelsProviderGroup(languageModelProviderGroup);
  }
  async removeLanguageModelsProviderGroup(vendorId, providerGroupName) {
    const vendor = this.getVendors().find(({ vendor: vendor2 }) => vendor2 === vendorId);
    if (!vendor) {
      throw new Error(`Vendor ${vendorId} not found.`);
    }
    const languageModelProviderGroups = this._languageModelsConfigurationService.getLanguageModelsProviderGroups();
    const existing = languageModelProviderGroups.find((g) => g.vendor === vendorId && g.name === providerGroupName);
    if (!existing) {
      throw new Error(`Language model provider group ${providerGroupName} for vendor ${vendorId} not found.`);
    }
    await this._deleteSecretsInConfiguration(existing, vendor.configuration);
    await this._languageModelsConfigurationService.removeLanguageModelsProviderGroup(existing);
  }
  requireConfiguring(schema) {
    if (schema.additionalProperties) {
      return true;
    }
    if (!schema.properties) {
      return false;
    }
    for (const property of Object.keys(schema.properties)) {
      if (!this.canPromptForProperty(schema.properties[property])) {
        return true;
      }
    }
    return false;
  }
  getSnippetForFirstUnconfiguredProperty(configuration, schema) {
    if (!schema.properties) {
      return void 0;
    }
    for (const property of Object.keys(schema.properties)) {
      if (configuration[property] === void 0) {
        const propertySchema = schema.properties[property];
        const snippet = this.getSnippetForProperty(property, propertySchema);
        if (snippet) {
          return snippet;
        }
      }
    }
    return void 0;
  }
  getSnippetForProperty(property, propertySchema) {
    const bodyText = this.getDefaultSnippetBodyText(propertySchema);
    return bodyText ? `"${property}": ${bodyText}` : void 0;
  }
  getSnippetForArrayItem(propertySchema) {
    return this.getDefaultSnippetBodyText(propertySchema, true);
  }
  getDefaultSnippetBodyText(propertySchema, arrayItem = false) {
    const snippet = propertySchema.defaultSnippets?.[0];
    if (!snippet) {
      return void 0;
    }
    const bodyText = arrayItem ? Array.isArray(snippet.body) && snippet.body.length > 0 ? JSON.stringify(snippet.body[0], null, "	") : void 0 : snippet.bodyText ?? JSON.stringify(snippet.body, null, "	");
    if (!bodyText) {
      return void 0;
    }
    return bodyText.replace(/"(\^[^"]*)"/g, (_, value) => value.substring(1));
  }
  async promptForName(languageModelProviderGroups, vendor, existing) {
    let providerGroupName = existing?.name;
    if (!providerGroupName) {
      providerGroupName = vendor.displayName;
      let count = 1;
      while (languageModelProviderGroups.some((g) => g.vendor === vendor.vendor && g.name === providerGroupName)) {
        count++;
        providerGroupName = `${vendor.displayName} ${count}`;
      }
    }
    let result;
    const disposables = new DisposableStore();
    try {
      await new Promise((resolve) => {
        const inputBox = disposables.add(this._quickInputService.createInputBox());
        inputBox.title = localize("configureLanguageModelGroup", "Group Name");
        inputBox.placeholder = localize("languageModelGroupName", "Enter a name for the group");
        inputBox.value = providerGroupName;
        inputBox.ignoreFocusOut = true;
        disposables.add(inputBox.onDidChangeValue((value) => {
          if (!value) {
            inputBox.validationMessage = localize("enterName", "Please enter a name");
            inputBox.severity = Severity.Error;
            return;
          }
          if (languageModelProviderGroups.some((group) => group !== existing && group.vendor === vendor.vendor && group.name === value)) {
            inputBox.validationMessage = localize("nameExists", "A language models group with this name already exists");
            inputBox.severity = Severity.Error;
            return;
          }
          inputBox.validationMessage = void 0;
          inputBox.severity = Severity.Ignore;
        }));
        disposables.add(inputBox.onDidAccept(async () => {
          result = inputBox.value;
          inputBox.hide();
        }));
        disposables.add(inputBox.onDidHide(() => resolve()));
        inputBox.show();
      });
    } finally {
      disposables.dispose();
    }
    return result;
  }
  async promptForConfiguration(groupName, configuration, existing) {
    if (!configuration.properties) {
      return;
    }
    const result = existing ? { ...existing } : {};
    for (const property of Object.keys(configuration.properties)) {
      const propertySchema = configuration.properties[property];
      const required = !!configuration.required?.includes(property);
      const value = await this.promptForValue(groupName, property, propertySchema, required, existing);
      if (value !== void 0) {
        result[property] = value;
      }
    }
    return result;
  }
  async promptForValue(groupName, property, propertySchema, required, existing) {
    if (!propertySchema) {
      return void 0;
    }
    if (!this.canPromptForProperty(propertySchema)) {
      return void 0;
    }
    if (propertySchema.type === "array" && propertySchema.items && !Array.isArray(propertySchema.items) && propertySchema.items.enum) {
      const selectedItems = await this.promptForArray(groupName, property, propertySchema);
      if (selectedItems === void 0) {
        return void 0;
      }
      return selectedItems;
    }
    if (propertySchema.type === "string" && Array.isArray(propertySchema.enum) && propertySchema.enum.length > 0) {
      return this.promptForEnum(groupName, property, propertySchema, existing);
    }
    const value = await this.promptForInput(groupName, property, propertySchema, required, existing);
    if (value === void 0) {
      return void 0;
    }
    return value;
  }
  canPromptForProperty(propertySchema) {
    if (!propertySchema || typeof propertySchema === "boolean") {
      return false;
    }
    if (propertySchema.type === "array" && propertySchema.items && !Array.isArray(propertySchema.items) && propertySchema.items.enum) {
      return true;
    }
    if (propertySchema.type === "string" || propertySchema.type === "number" || propertySchema.type === "integer" || propertySchema.type === "boolean") {
      return true;
    }
    return false;
  }
  getDescriptionPlaintext(propertySchema) {
    if (propertySchema.description) {
      return propertySchema.description;
    }
    const md = propertySchema.markdownDescription;
    if (!md) {
      return void 0;
    }
    return md.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  }
  async promptForArray(groupName, property, propertySchema) {
    if (!propertySchema.items || Array.isArray(propertySchema.items) || !propertySchema.items.enum) {
      return void 0;
    }
    const items = propertySchema.items.enum;
    const disposables = new DisposableStore();
    try {
      return await new Promise((resolve) => {
        const quickPick = disposables.add(this._quickInputService.createQuickPick());
        quickPick.title = `${groupName}: ${propertySchema.title ?? property}`;
        quickPick.items = items.map((item) => ({ label: item }));
        quickPick.placeholder = this.getDescriptionPlaintext(propertySchema) ?? localize("selectValue", "Select value for {0}", property);
        quickPick.canSelectMany = true;
        quickPick.ignoreFocusOut = true;
        disposables.add(quickPick.onDidAccept(() => {
          resolve(quickPick.selectedItems.map((item) => item.label));
          quickPick.hide();
        }));
        disposables.add(quickPick.onDidHide(() => {
          resolve(void 0);
        }));
        quickPick.show();
      });
    } finally {
      disposables.dispose();
    }
  }
  async promptForEnum(groupName, property, propertySchema, existing) {
    const values = propertySchema.enum;
    if (!Array.isArray(values) || values.length === 0) {
      return void 0;
    }
    const enumDescriptions = propertySchema.enumDescriptions;
    const enumItemLabels = Array.isArray(propertySchema.enumItemLabels) ? propertySchema.enumItemLabels : void 0;
    const initial = existing?.[property] !== void 0 ? String(existing[property]) : propertySchema.default !== void 0 ? String(propertySchema.default) : void 0;
    const items = values.map((value, index) => ({
      label: enumItemLabels?.[index] ?? String(value),
      description: enumDescriptions?.[index],
      id: String(value)
    }));
    const disposables = new DisposableStore();
    try {
      return await new Promise((resolve) => {
        const quickPick = disposables.add(this._quickInputService.createQuickPick());
        quickPick.title = `${groupName}: ${propertySchema.title ?? property}`;
        quickPick.items = items;
        quickPick.placeholder = this.getDescriptionPlaintext(propertySchema) ?? localize("selectValue", "Select value for {0}", property);
        quickPick.ignoreFocusOut = true;
        if (initial !== void 0) {
          const match = items.find((item) => item.id === initial);
          if (match) {
            quickPick.activeItems = [match];
          }
        }
        disposables.add(quickPick.onDidAccept(() => {
          const selected = quickPick.selectedItems[0];
          resolve(selected?.id);
          quickPick.hide();
        }));
        disposables.add(quickPick.onDidHide(() => {
          resolve(void 0);
        }));
        quickPick.show();
      });
    } finally {
      disposables.dispose();
    }
  }
  async promptForInput(groupName, property, propertySchema, required, existing) {
    const disposables = new DisposableStore();
    try {
      const validate = (value2) => {
        if (!value2 && required) {
          return localize("valueRequired", "Value is required");
        }
        return void 0;
      };
      const value = await new Promise((resolve, reject) => {
        const inputBox = disposables.add(this._quickInputService.createInputBox());
        inputBox.title = `${groupName}: ${propertySchema.title ?? property}`;
        inputBox.placeholder = localize("enterValue", "Enter value for {0}", property);
        inputBox.password = !!propertySchema.secret;
        inputBox.ignoreFocusOut = true;
        if (existing?.[property]) {
          inputBox.value = String(existing?.[property]);
        } else if (propertySchema.default) {
          inputBox.value = String(propertySchema.default);
        }
        const promptText = this.getDescriptionPlaintext(propertySchema);
        if (promptText) {
          inputBox.prompt = promptText;
        }
        disposables.add(inputBox.onDidChangeValue((value2) => {
          const message = validate(value2);
          if (message) {
            inputBox.validationMessage = message;
            inputBox.severity = Severity.Error;
          } else {
            inputBox.validationMessage = void 0;
            inputBox.severity = Severity.Ignore;
          }
        }));
        disposables.add(inputBox.onDidAccept(() => {
          const message = validate(inputBox.value);
          if (message) {
            inputBox.validationMessage = message;
            inputBox.severity = Severity.Error;
            return;
          }
          resolve(inputBox.value);
          inputBox.hide();
        }));
        disposables.add(inputBox.onDidHide((e) => {
          if (e.reason === QuickInputHideReason.Gesture) {
            reject(new CancellationError());
          } else {
            resolve(void 0);
          }
        }));
        inputBox.show();
      });
      if (!value) {
        return void 0;
      }
      if (propertySchema.type === "number" || propertySchema.type === "integer") {
        return Number(value);
      } else if (propertySchema.type === "boolean") {
        return value === "true";
      } else {
        return value;
      }
    } finally {
      disposables.dispose();
    }
  }
  encodeSecretKey(property) {
    return format(LanguageModelsService.SECRET_INPUT, property);
  }
  decodeSecretKey(secretInput) {
    if (!isString(secretInput)) {
      return void 0;
    }
    return secretInput.substring(secretInput.indexOf(":") + 1, secretInput.length - 1);
  }
  _clearModelCache(vendor) {
    const removed = /* @__PURE__ */ new Map();
    for (const [id, model] of this._modelCache.entries()) {
      if (model.vendor === vendor) {
        removed.set(id, model);
        this._modelCache.delete(id);
      }
    }
    return removed;
  }
  _clearModelConfigurations(vendor) {
    for (const [id] of this._modelConfigurations) {
      if (this._modelCache.get(id)?.vendor === vendor || id.startsWith(`${vendor}/`)) {
        this._modelConfigurations.delete(id);
      }
    }
  }
  async _resolveConfiguration(group, schema) {
    if (!schema) {
      return {};
    }
    const result = {};
    for (const key in group) {
      if (key === "vendor" || key === "name" || key === "range" || key === "modelsRange" || key === "settings") {
        continue;
      }
      let value = group[key];
      if (schema.properties?.[key]?.secret) {
        const secretKey = this.decodeSecretKey(value);
        value = secretKey ? await this._secretStorageService.get(secretKey) : void 0;
      }
      result[key] = value;
    }
    return result;
  }
  async _resolveLanguageModelProviderGroup(name, vendor, configuration, schema) {
    if (!schema) {
      return { name, vendor };
    }
    const result = {};
    for (const key in configuration) {
      let value = configuration[key];
      if (schema.properties?.[key]?.secret && isString(value)) {
        const secretKey = `${LanguageModelsService.SECRET_KEY_PREFIX}${hash(generateUuid()).toString(16)}`;
        await this._secretStorageService.set(secretKey, key === "apiKey" ? value.trim() : value);
        value = this.encodeSecretKey(secretKey);
      }
      result[key] = value;
    }
    return { name, vendor, ...result };
  }
  async _deleteSecretsInConfiguration(group, schema) {
    if (!schema) {
      return;
    }
    const { vendor, name, range, modelsRange, ...configuration } = group;
    for (const key in configuration) {
      const value = group[key];
      if (schema.properties?.[key]?.secret) {
        const secretKey = this.decodeSecretKey(value);
        if (secretKey) {
          await this._secretStorageService.delete(secretKey);
        }
      }
    }
  }
  async migrateLanguageModelsProviderGroup(languageModelsProviderGroup) {
    const { vendor, name, ...configuration } = languageModelsProviderGroup;
    if (!this._vendors.get(vendor)) {
      throw new Error(`Vendor ${vendor} not found.`);
    }
    await this._extensionService.activateByEvent(`onLanguageModelChatProvider:${vendor}`);
    const provider = this._providers.get(vendor);
    if (!provider) {
      throw new Error(`Chat model provider for vendor ${vendor} is not registered.`);
    }
    await provider.provideLanguageModelChatInfo({ group: name, silent: false, configuration }, CancellationToken.None);
    await this.addLanguageModelsProviderGroup(name, vendor, configuration);
  }
  //#region Recently used models
  _readRecentlyUsedModels() {
    return this._storageService.getObject(CHAT_MODEL_RECENTLY_USED_STORAGE_KEY, StorageScope.PROFILE, []);
  }
  _saveRecentlyUsedModels() {
    this._storageService.store(CHAT_MODEL_RECENTLY_USED_STORAGE_KEY, this._recentlyUsedModelIds, StorageScope.PROFILE, StorageTarget.USER);
  }
  getRecentlyUsedModelIds() {
    return this._recentlyUsedModelIds.filter((id) => this._modelCache.has(id) && id !== AUTO_MODEL_IDENTIFIER).slice(0, 4);
  }
  addToRecentlyUsedList(modelIdentifier) {
    if (modelIdentifier === AUTO_MODEL_IDENTIFIER) {
      return;
    }
    const index = this._recentlyUsedModelIds.indexOf(modelIdentifier);
    if (index !== -1) {
      this._recentlyUsedModelIds.splice(index, 1);
    }
    this._recentlyUsedModelIds.unshift(modelIdentifier);
    if (this._recentlyUsedModelIds.length > 20) {
      this._recentlyUsedModelIds.length = 20;
    }
    this._saveRecentlyUsedModels();
  }
  clearRecentlyUsedList() {
    this._recentlyUsedModelIds = [];
    this._saveRecentlyUsedModels();
  }
  //#endregion
  //#region Pinned models
  _readPinnedModels() {
    return this._storageService.getObject(CHAT_MODEL_PINNED_STORAGE_KEY, StorageScope.PROFILE, []);
  }
  _savePinnedModels() {
    this._storageService.store(CHAT_MODEL_PINNED_STORAGE_KEY, this._pinnedModelIds, StorageScope.PROFILE, StorageTarget.USER);
  }
  getPinnedModelIds() {
    return this._pinnedModelIds.filter((id) => id !== AUTO_MODEL_IDENTIFIER && this._modelCache.has(id));
  }
  pinModel(modelIdentifier) {
    if (modelIdentifier === AUTO_MODEL_IDENTIFIER || this._pinnedModelIds.includes(modelIdentifier)) {
      return;
    }
    this._pinnedModelIds.push(modelIdentifier);
    this._savePinnedModels();
    this._onDidChangePinnedModels.fire();
  }
  unpinModel(modelIdentifier) {
    const index = this._pinnedModelIds.indexOf(modelIdentifier);
    if (index === -1) {
      return;
    }
    this._pinnedModelIds.splice(index, 1);
    this._savePinnedModels();
    this._onDidChangePinnedModels.fire();
  }
  isModelPinned(modelIdentifier) {
    return modelIdentifier !== AUTO_MODEL_IDENTIFIER && this._pinnedModelIds.includes(modelIdentifier);
  }
  //#endregion
  //#region Model visibility
  _getGroupNameForVendor(vendor) {
    return this._vendors.get(vendor)?.displayName ?? vendor;
  }
  _getModelIdsInGroup(vendor, groupName) {
    const vendorGroups = this._modelsGroups.get(vendor);
    if (!vendorGroups) {
      return [];
    }
    const result = [];
    const fallbackName = this._getGroupNameForVendor(vendor);
    for (const g of vendorGroups) {
      const name = g.group?.name ?? fallbackName;
      if (name === groupName) {
        for (const id of g.modelIdentifiers) {
          const metadata = this._modelCache.get(id);
          if (metadata && ILanguageModelChatMetadata.getAgentHostByokManageModelsIdentifier(metadata) !== void 0) {
            continue;
          }
          result.push(id);
        }
      }
    }
    return result;
  }
  _readVisibility() {
    const raw = this._storageService.getObject(CHAT_MODEL_VISIBILITY_STORAGE_KEY, StorageScope.PROFILE, {});
    this._hiddenModelIds = new Set(Array.isArray(raw?.hiddenModels) ? raw.hiddenModels : []);
  }
  _saveVisibility() {
    this._storageService.store(
      CHAT_MODEL_VISIBILITY_STORAGE_KEY,
      { hiddenModels: Array.from(this._hiddenModelIds) },
      StorageScope.PROFILE,
      StorageTarget.USER
    );
  }
  isGroupHidden(vendor, groupName) {
    const modelIds = this._getModelIdsInGroup(vendor, groupName);
    return modelIds.length > 0 && modelIds.every((id) => this._hiddenModelIds.has(id));
  }
  isModelHidden(modelIdentifier) {
    return this._hiddenModelIds.has(modelIdentifier);
  }
  setGroupHidden(vendor, groupName, hidden) {
    let changed = false;
    const modelIds = this._getModelIdsInGroup(vendor, groupName);
    for (const id of modelIds) {
      if (hidden) {
        if (!this._hiddenModelIds.has(id)) {
          this._hiddenModelIds.add(id);
          changed = true;
        }
      } else if (this._hiddenModelIds.delete(id)) {
        changed = true;
      }
    }
    if (changed) {
      this._saveVisibility();
      this._onDidChangeModelVisibility.fire();
    }
  }
  setModelHidden(modelIdentifier, hidden) {
    let changed = false;
    if (hidden) {
      if (!this._hiddenModelIds.has(modelIdentifier)) {
        this._hiddenModelIds.add(modelIdentifier);
        changed = true;
      }
    } else if (this._hiddenModelIds.delete(modelIdentifier)) {
      changed = true;
    }
    if (changed) {
      this._saveVisibility();
      this._onDidChangeModelVisibility.fire();
    }
  }
  getHiddenModelIds() {
    return Array.from(this._hiddenModelIds);
  }
  //#endregion
  //#region Models control manifest
  getModelsControlManifest() {
    return this._modelsControlManifest;
  }
  _setModelsControlManifest(response) {
    this._modelsControlRawResponse = response;
    this._refreshModelsControlManifest();
  }
  _refreshModelsControlManifest() {
    const response = this._modelsControlRawResponse;
    const free = {};
    const paid = {};
    if (response?.free) {
      const freeEntries = Array.isArray(response.free) ? response.free : Object.values(response.free);
      for (const entry of freeEntries) {
        if (!entry || !isObject(entry)) {
          continue;
        }
        free[entry.id] = { label: entry.label, featured: entry.featured, exists: this._modelCache.has(`copilot/${entry.id}`) };
      }
    }
    if (response?.paid) {
      const paidEntries = Array.isArray(response.paid) ? response.paid : Object.values(response.paid);
      for (const entry of paidEntries) {
        if (!entry || !isObject(entry)) {
          continue;
        }
        paid[entry.id] = { label: entry.label, featured: entry.featured, minVSCodeVersion: entry.minVSCodeVersion, exists: this._modelCache.has(`copilot/${entry.id}`) };
      }
    }
    this._modelsControlManifest = { free, paid };
    this._onDidChangeModelsControlManifest.fire(this._modelsControlManifest);
  }
  //#region Chat control data
  _initChatControlData() {
    this._chatControlUrl = this._productService.chatParticipantRegistry;
    if (!this._chatControlUrl) {
      return;
    }
    const raw = this._storageService.get(CHAT_PARTICIPANT_NAME_REGISTRY_STORAGE_KEY, StorageScope.APPLICATION);
    try {
      this._restrictedChatParticipants.set(JSON.parse(raw ?? "{}"), void 0);
    } catch (err) {
      this._storageService.remove(CHAT_PARTICIPANT_NAME_REGISTRY_STORAGE_KEY, StorageScope.APPLICATION);
    }
    const rawModels = this._storageService.get(CHAT_MODELS_CONTROL_STORAGE_KEY, StorageScope.APPLICATION);
    try {
      const models = JSON.parse(rawModels ?? "{}");
      if (isObject(models)) {
        this._setModelsControlManifest(models);
      }
    } catch (err) {
      this._storageService.remove(CHAT_MODELS_CONTROL_STORAGE_KEY, StorageScope.APPLICATION);
    }
    this._refreshChatControlData();
  }
  _refreshChatControlData() {
    if (this._chatControlDisposed) {
      return;
    }
    this._fetchChatControlData().catch((err) => this._logService.warn("Failed to fetch chat control data", err)).then(() => timeout(5 * 60 * 1e3)).then(() => this._refreshChatControlData());
  }
  async _fetchChatControlData() {
    this._logService.trace("[LM] Fetching chat control data from", this._chatControlUrl);
    let context;
    try {
      context = await this._requestService.request({ type: "GET", url: this._chatControlUrl, callSite: "languageModels.fetchChatControlData" }, CancellationToken.None);
    } catch (err) {
      this._logService.warn("[LM] Failed to request chat control data", getErrorMessage(err));
      return;
    }
    if (context.res.statusCode !== 200) {
      this._logService.warn(`[LM] Chat control data request failed with status ${context.res.statusCode}`);
      return;
    }
    let result;
    try {
      result = await asJson(context);
    } catch (err) {
      this._logService.warn("[LM] Failed to parse chat control response", getErrorMessage(err));
      return;
    }
    this._logService.trace("[LM] Received chat control response", result ? Object.keys(result) : "null");
    if (!result || result.version !== 1) {
      this._logService.warn("[LM] Unexpected chat control response version", result?.version);
      return;
    }
    const registry = result.restrictedChatParticipants;
    this._restrictedChatParticipants.set(registry, void 0);
    this._storageService.store(CHAT_PARTICIPANT_NAME_REGISTRY_STORAGE_KEY, JSON.stringify(registry), StorageScope.APPLICATION, StorageTarget.MACHINE);
    if (result.models) {
      this._logService.trace("[LM] Updating models control manifest", { freeCount: Object.keys(result.models.free ?? {}).length, paidCount: Object.keys(result.models.paid ?? {}).length });
      this._setModelsControlManifest(result.models);
      this._storageService.store(CHAT_MODELS_CONTROL_STORAGE_KEY, JSON.stringify(result.models), StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
  }
  //#endregion
  dispose() {
    this._chatControlDisposed = true;
    this._store.dispose();
    this._providers.clear();
  }
};
LanguageModelsService.SECRET_KEY_PREFIX = "chat.lm.secret.";
LanguageModelsService.SECRET_INPUT = "${input:{0}}";
LanguageModelsService = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, ILanguageModelsConfigurationService),
  __decorateParam(5, IQuickInputService),
  __decorateParam(6, ISecretStorageService),
  __decorateParam(7, IProductService),
  __decorateParam(8, IRequestService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, IOpenerService),
  __decorateParam(11, ITelemetryService)
], LanguageModelsService);
export {
  COPILOT_VENDOR_ID,
  ChatImageMimeType,
  ChatMessageRole,
  ILanguageModelChatMetadata,
  ILanguageModelsService,
  ImageDetailLevel,
  LanguageModelPartAudience,
  LanguageModelsService,
  THIRD_PARTY_PROVIDER_TELEMETRY_NAME,
  createModelConfigurationActions,
  getByokProviderTelemetryName,
  getLanguageModelDisplayNameWithProvider,
  getLanguageModelProviderDisplayName,
  getTextResponseFromStream,
  isAutoLanguageModel,
  isILanguageModelChatSelector,
  isLanguageModelVendorAbsenceConclusive,
  languageModelChatProviderExtensionPoint,
  resolveProviderDeprecationLink
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2VxdWVuY2VyQnlLZXksIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yLCBnZXRFcnJvck1lc3NhZ2UsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hLCBUeXBlRnJvbUpzb25TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBmb3JtYXQsIGlzRmFsc3lPcldoaXRlc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBTdWJtZW51QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCwgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBOZXZlclNob3dBZ2FpblNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBhc0pzb24sIElSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgUXVpY2tJbnB1dEhpZGVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTZWNyZXRTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NlY3JldHMvY29tbW9uL3NlY3JldHMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCwgSUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuL2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvbi5qcyc7XG5cbi8qKlxuICogVmVuZG9yIGlkIHVzZWQgZm9yIHRoZSBidWlsdC1pbiBHaXRIdWIgQ29waWxvdCBsYW5ndWFnZSBtb2RlbCBwcm92aWRlci4gVHJlYXRlZCBhcyB0aGUgZGVmYXVsdFxuICogdmVuZG9yIGFjcm9zcyB0aGUgY2hhdCBzdGFjayAoc2VlIGBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvci5pc0RlZmF1bHRgKS5cbiAqL1xuZXhwb3J0IGNvbnN0IENPUElMT1RfVkVORE9SX0lEID0gJ2NvcGlsb3QnO1xuXG4vKiogV2hldGhlciBhIG1pc3NpbmcgbW9kZWwgaXMgY29uY2x1c2l2ZWx5IGFic2VudCBmcm9tIGEgdmVuZG9yJ3MgbGl2ZSBtb2RlbCBsaXN0LiBFbXB0eSBDb3BpbG90IHJlc3VsdHMgcmVtYWluIHRyYW5zaWVudCB3aGlsZSB0b2tlbi1iYWNrZWQgZGlzY292ZXJ5IGNvbXBsZXRlcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0xhbmd1YWdlTW9kZWxWZW5kb3JBYnNlbmNlQ29uY2x1c2l2ZSh2ZW5kb3I6IHN0cmluZywgaGFzTGl2ZU1vZGVsczogYm9vbGVhbiwgaGFzUmVzb2x2ZWQ6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0cmV0dXJuIGhhc0xpdmVNb2RlbHMgfHwgKGhhc1Jlc29sdmVkICYmIHZlbmRvciAhPT0gQ09QSUxPVF9WRU5ET1JfSUQpO1xufVxuXG4vKipcbiAqIFZlbmRvciBpZHMgb2YgdGhlIEJZT0sgbGFuZ3VhZ2UtbW9kZWwgcHJvdmlkZXJzIHRoYXQgc2hpcCBpbi1idWlsdCB3aXRoIHRoZSBHaXRIdWIgQ29waWxvdCBDaGF0XG4gKiBleHRlbnNpb24uIEVhY2ggcHJvdmlkZXIncyB2ZW5kb3IgaWQgaXMgYHByb3ZpZGVyTmFtZS50b0xvd2VyQ2FzZSgpYCAoc2VlXG4gKiBgZXh0ZW5zaW9ucy9jb3BpbG90L3NyYy9leHRlbnNpb24vYnlvay92c2NvZGUtbm9kZS8qUHJvdmlkZXIudHNgKS4gVGhpcyBsaXN0IGlzIGludGVudGlvbmFsbHlcbiAqIGhhcmRjb2RlZDogdGhlIGluLWJ1aWx0IHByb3ZpZGVyIHNldCBpcyBzdGFibGUgYW5kIGtub3duIGFoZWFkIG9mIHRpbWUsIHdoaWNoIGxldHMgdXMgcmVwb3J0IHRoZXNlXG4gKiBwcm92aWRlcnMgYnkgbmFtZSB3aGlsZSBidWNrZXRpbmcgZXZlcnkgb3RoZXIgKHRoaXJkLXBhcnR5KSBwcm92aWRlciBhcyBgM3AtZXh0ZW5zaW9uYC5cbiAqL1xuY29uc3QgQlVJTFRfSU5fQllPS19WRU5ET1JfSURTID0gbmV3IFNldDxzdHJpbmc+KFtcblx0J29wZW5haScsXG5cdCdhbnRocm9waWMnLFxuXHQnZ2VtaW5pJyxcblx0J29sbGFtYScsXG5cdCdvcGVucm91dGVyJyxcblx0J2F6dXJlJyxcblx0J3hhaScsXG5cdCdjdXN0b21vYWknLFxuXHQnY3VzdG9tZW5kcG9pbnQnLFxuXSk7XG5cbi8qKlxuICogQnVja2V0IHJlcG9ydGVkIGZvciBhbnkgbm9uLUNvcGlsb3QgcHJvdmlkZXIgdGhhdCBpcyBub3QgYW4gaW4tYnVpbHQgQllPSyBwcm92aWRlciwgaS5lLiBhIG1vZGVsXG4gKiBjb250cmlidXRlZCBieSBhIHRoaXJkLXBhcnR5IGV4dGVuc2lvbi4gV2UgbmV2ZXIgcmVwb3J0IHRoZSB0aGlyZC1wYXJ0eSB2ZW5kb3IgaWQgZGlyZWN0bHkgdG8gYXZvaWRcbiAqIGxvZ2dpbmcgcG90ZW50aWFsbHkgaWRlbnRpZnlpbmcgdmFsdWVzLlxuICovXG5leHBvcnQgY29uc3QgVEhJUkRfUEFSVFlfUFJPVklERVJfVEVMRU1FVFJZX05BTUUgPSAnM3AtZXh0ZW5zaW9uJztcblxuY29uc3QgQlVJTFRfSU5fQllPS19FWFRFTlNJT05fSURTID0gW1xuXHQnZ2l0aHViLmNvcGlsb3QtY2hhdCcsXG5cdCdnaXRodWIuY29waWxvdCcsXG5dO1xuXG4vKipcbiAqIE5vcm1hbGl6ZXMgYSBub24tQ29waWxvdCBtb2RlbCB2ZW5kb3IgaW50byBhIG5vbi1pZGVudGlmeWluZyBwcm92aWRlciBuYW1lIHN1aXRhYmxlIGZvciB0ZWxlbWV0cnk6XG4gKiB0aGUgaW4tYnVpbHQgQllPSyB2ZW5kb3IgaWQgKGUuZy4gYG9wZW5haWAsIGBvbGxhbWFgKSB3aGVuIGNvbnRyaWJ1dGVkIGJ5IHRoZSBidWlsdC1pbiBDb3BpbG90XG4gKiBleHRlbnNpb25zLCBvciB7QGxpbmsgVEhJUkRfUEFSVFlfUFJPVklERVJfVEVMRU1FVFJZX05BTUV9IG90aGVyd2lzZS4gUmV0dXJucyBgdW5kZWZpbmVkYCBmb3IgdGhlXG4gKiBmaXJzdC1wYXJ0eSBDb3BpbG90IHZlbmRvciAob3Igbm8gdmVuZG9yKSBzbyBjYWxsZXJzIHNraXAgbG9nZ2luZyBmaXJzdC1wYXJ0eSB1c2FnZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEJ5b2tQcm92aWRlclRlbGVtZXRyeU5hbWUodmVuZG9yOiBzdHJpbmcgfCB1bmRlZmluZWQsIGV4dGVuc2lvbjogRXh0ZW5zaW9uSWRlbnRpZmllciB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghdmVuZG9yIHx8IHZlbmRvciA9PT0gQ09QSUxPVF9WRU5ET1JfSUQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChCVUlMVF9JTl9CWU9LX1ZFTkRPUl9JRFMuaGFzKHZlbmRvcikgJiYgZXh0ZW5zaW9uICYmIEJVSUxUX0lOX0JZT0tfRVhURU5TSU9OX0lEUy5zb21lKGlkID0+IEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGV4dGVuc2lvbiwgaWQpKSkge1xuXHRcdHJldHVybiB2ZW5kb3I7XG5cdH1cblx0cmV0dXJuIFRISVJEX1BBUlRZX1BST1ZJREVSX1RFTEVNRVRSWV9OQU1FO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBDaGF0TWVzc2FnZVJvbGUge1xuXHRTeXN0ZW0sXG5cdFVzZXIsXG5cdEFzc2lzdGFudCxcbn1cblxuZXhwb3J0IGVudW0gTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZSB7XG5cdEFzc2lzdGFudCA9IDAsXG5cdFVzZXIgPSAxLFxuXHRFeHRlbnNpb24gPSAyLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0TWVzc2FnZVRleHRQYXJ0IHtcblx0dHlwZTogJ3RleHQnO1xuXHR2YWx1ZTogc3RyaW5nO1xuXHRhdWRpZW5jZT86IExhbmd1YWdlTW9kZWxQYXJ0QXVkaWVuY2VbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdE1lc3NhZ2VJbWFnZVBhcnQge1xuXHR0eXBlOiAnaW1hZ2VfdXJsJztcblx0dmFsdWU6IElDaGF0SW1hZ2VVUkxQYXJ0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0TWVzc2FnZVRoaW5raW5nUGFydCB7XG5cdHR5cGU6ICd0aGlua2luZyc7XG5cdHZhbHVlOiBzdHJpbmcgfCBzdHJpbmdbXTtcblx0aWQ/OiBzdHJpbmc7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdG1ldGFkYXRhPzogeyByZWFkb25seSBba2V5OiBzdHJpbmddOiBhbnkgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdE1lc3NhZ2VEYXRhUGFydCB7XG5cdHR5cGU6ICdkYXRhJztcblx0bWltZVR5cGU6IHN0cmluZztcblx0ZGF0YTogVlNCdWZmZXI7XG5cdGF1ZGllbmNlPzogTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0SW1hZ2VVUkxQYXJ0IHtcblx0LyoqXG5cdCAqIFRoZSBpbWFnZSdzIE1JTUUgdHlwZSAoZS5nLiwgXCJpbWFnZS9wbmdcIiwgXCJpbWFnZS9qcGVnXCIpLlxuXHQgKi9cblx0bWltZVR5cGU6IENoYXRJbWFnZU1pbWVUeXBlO1xuXG5cdC8qKlxuXHQgKiBUaGUgcmF3IGJpbmFyeSBkYXRhIG9mIHRoZSBpbWFnZSwgZW5jb2RlZCBhcyBhIFVpbnQ4QXJyYXkuIE5vdGU6IGRvIG5vdCB1c2UgYmFzZTY0IGVuY29kaW5nLiBNYXhpbXVtIGltYWdlIHNpemUgaXMgNU1CLlxuXHQgKi9cblx0ZGF0YTogVlNCdWZmZXI7XG59XG5cbi8qKlxuICogRW51bSBmb3Igc3VwcG9ydGVkIGltYWdlIE1JTUUgdHlwZXMuXG4gKi9cbmV4cG9ydCBlbnVtIENoYXRJbWFnZU1pbWVUeXBlIHtcblx0UE5HID0gJ2ltYWdlL3BuZycsXG5cdEpQRUcgPSAnaW1hZ2UvanBlZycsXG5cdEdJRiA9ICdpbWFnZS9naWYnLFxuXHRXRUJQID0gJ2ltYWdlL3dlYnAnLFxuXHRCTVAgPSAnaW1hZ2UvYm1wJyxcbn1cblxuLyoqXG4gKiBTcGVjaWZpZXMgdGhlIGRldGFpbCBsZXZlbCBvZiB0aGUgaW1hZ2UuXG4gKi9cbmV4cG9ydCBlbnVtIEltYWdlRGV0YWlsTGV2ZWwge1xuXHRMb3cgPSAnbG93Jyxcblx0SGlnaCA9ICdoaWdoJ1xufVxuXG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRNZXNzYWdlVG9vbFJlc3VsdFBhcnQge1xuXHR0eXBlOiAndG9vbF9yZXN1bHQnO1xuXHR0b29sQ2FsbElkOiBzdHJpbmc7XG5cdHZhbHVlOiAoSUNoYXRSZXNwb25zZVRleHRQYXJ0IHwgSUNoYXRSZXNwb25zZVByb21wdFRzeFBhcnQgfCBJQ2hhdFJlc3BvbnNlRGF0YVBhcnQpW107XG5cdGlzRXJyb3I/OiBib29sZWFuO1xufVxuXG5leHBvcnQgdHlwZSBJQ2hhdE1lc3NhZ2VQYXJ0ID0gSUNoYXRNZXNzYWdlVGV4dFBhcnQgfCBJQ2hhdE1lc3NhZ2VUb29sUmVzdWx0UGFydCB8IElDaGF0UmVzcG9uc2VUb29sVXNlUGFydCB8IElDaGF0TWVzc2FnZUltYWdlUGFydCB8IElDaGF0TWVzc2FnZURhdGFQYXJ0IHwgSUNoYXRNZXNzYWdlVGhpbmtpbmdQYXJ0O1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0TWVzc2FnZSB7XG5cdHJlYWRvbmx5IG5hbWU/OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHJvbGU6IENoYXRNZXNzYWdlUm9sZTtcblx0cmVhZG9ubHkgY29udGVudDogSUNoYXRNZXNzYWdlUGFydFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVzcG9uc2VUZXh0UGFydCB7XG5cdHR5cGU6ICd0ZXh0Jztcblx0dmFsdWU6IHN0cmluZztcblx0YXVkaWVuY2U/OiBMYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXNwb25zZVByb21wdFRzeFBhcnQge1xuXHR0eXBlOiAncHJvbXB0X3RzeCc7XG5cdHZhbHVlOiB1bmtub3duO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVzcG9uc2VEYXRhUGFydCB7XG5cdHR5cGU6ICdkYXRhJztcblx0bWltZVR5cGU6IHN0cmluZztcblx0ZGF0YTogVlNCdWZmZXI7XG5cdGF1ZGllbmNlPzogTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVzcG9uc2VUb29sVXNlUGFydCB7XG5cdHR5cGU6ICd0b29sX3VzZSc7XG5cdG5hbWU6IHN0cmluZztcblx0dG9vbENhbGxJZDogc3RyaW5nO1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRwYXJhbWV0ZXJzOiBhbnk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXNwb25zZVRoaW5raW5nUGFydCB7XG5cdHR5cGU6ICd0aGlua2luZyc7XG5cdHZhbHVlOiBzdHJpbmcgfCBzdHJpbmdbXTtcblx0aWQ/OiBzdHJpbmc7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdG1ldGFkYXRhPzogeyByZWFkb25seSBba2V5OiBzdHJpbmddOiBhbnkgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlc3BvbnNlUHVsbFJlcXVlc3RQYXJ0IHtcblx0dHlwZTogJ3B1bGxSZXF1ZXN0Jztcblx0dXJpOiBVUkk7XG5cdHRpdGxlOiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdGF1dGhvcjogc3RyaW5nO1xuXHRsaW5rVGFnOiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIElDaGF0UmVzcG9uc2VQYXJ0ID0gSUNoYXRSZXNwb25zZVRleHRQYXJ0IHwgSUNoYXRSZXNwb25zZVRvb2xVc2VQYXJ0IHwgSUNoYXRSZXNwb25zZURhdGFQYXJ0IHwgSUNoYXRSZXNwb25zZVRoaW5raW5nUGFydDtcblxuZXhwb3J0IHR5cGUgSUV4dGVuZGVkQ2hhdFJlc3BvbnNlUGFydCA9IElDaGF0UmVzcG9uc2VQdWxsUmVxdWVzdFBhcnQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlTW9kZWxDb25maWd1cmF0aW9uU2NoZW1hIGV4dGVuZHMgSUpTT05TY2hlbWEge1xuXHRwcm9wZXJ0aWVzPzoge1xuXHRcdFtrZXk6IHN0cmluZ106IElKU09OU2NoZW1hICYge1xuXHRcdFx0LyoqIFdoZW4gc2V0IHRvIGAnbmF2aWdhdGlvbidgLCB0aGUgcHJvcGVydHkgaXMgc2hvd24gYXMgYSBwcmltYXJ5IGFjdGlvbiBpbiB0aGUgbW9kZWwgcGlja2VyLiAqL1xuXHRcdFx0Z3JvdXA/OiBzdHJpbmc7XG5cdFx0XHQvKiogTGFiZWxzIGZvciBlbnVtIHZhbHVlcy4gSWYgcHJvdmlkZWQsIHRoZXNlIGFyZSBzaG93biBpbnN0ZWFkIG9mIHRoZSByYXcgZW51bSB2YWx1ZXMuICovXG5cdFx0XHRlbnVtSXRlbUxhYmVscz86IHN0cmluZ1tdO1xuXHRcdH07XG5cdH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEge1xuXHRyZWFkb25seSBleHRlbnNpb246IEV4dGVuc2lvbklkZW50aWZpZXI7XG5cblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSB2ZW5kb3I6IHN0cmluZztcblx0cmVhZG9ubHkgdmVyc2lvbjogc3RyaW5nO1xuXHRyZWFkb25seSB0b29sdGlwPzogc3RyaW5nO1xuXHRyZWFkb25seSBkZXRhaWw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG11bHRpcGxpZXJOdW1lcmljPzogbnVtYmVyO1xuXHRyZWFkb25seSBpc0JZT0s/OiBib29sZWFuO1xuXHRyZWFkb25seSBwcmljaW5nPzogc3RyaW5nO1xuXHRyZWFkb25seSBpbnB1dENvc3Q/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGNhY2hlQ29zdD86IG51bWJlcjtcblx0cmVhZG9ubHkgY2FjaGVXcml0ZUNvc3Q/OiBudW1iZXI7XG5cdHJlYWRvbmx5IG91dHB1dENvc3Q/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxvbmdDb250ZXh0SW5wdXRDb3N0PzogbnVtYmVyO1xuXHRyZWFkb25seSBsb25nQ29udGV4dENhY2hlQ29zdD86IG51bWJlcjtcblx0cmVhZG9ubHkgbG9uZ0NvbnRleHRDYWNoZVdyaXRlQ29zdD86IG51bWJlcjtcblx0cmVhZG9ubHkgbG9uZ0NvbnRleHRPdXRwdXRDb3N0PzogbnVtYmVyO1xuXHRyZWFkb25seSBwcmljZUNhdGVnb3J5Pzogc3RyaW5nO1xuXHRyZWFkb25seSBjYXRlZ29yeT86IHN0cmluZztcblx0cmVhZG9ubHkgZmFtaWx5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1heElucHV0VG9rZW5zOiBudW1iZXI7XG5cdHJlYWRvbmx5IG1heE91dHB1dFRva2VuczogbnVtYmVyO1xuXG5cdHJlYWRvbmx5IGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7IFtLIGluIENoYXRBZ2VudExvY2F0aW9uXT86IGJvb2xlYW4gfTtcblx0cmVhZG9ubHkgaXNVc2VyU2VsZWN0YWJsZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHN0YXR1c0ljb24/OiBUaGVtZUljb247XG5cdHJlYWRvbmx5IGF1dGg/OiB7XG5cdFx0cmVhZG9ubHkgcHJvdmlkZXJMYWJlbDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGFjY291bnRMYWJlbD86IHN0cmluZztcblx0fTtcblx0cmVhZG9ubHkgY2FwYWJpbGl0aWVzPzoge1xuXHRcdHJlYWRvbmx5IHZpc2lvbj86IGJvb2xlYW47XG5cdFx0cmVhZG9ubHkgdG9vbENhbGxpbmc/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IGFnZW50TW9kZT86IGJvb2xlYW47XG5cdFx0cmVhZG9ubHkgZWRpdFRvb2xzPzogUmVhZG9ubHlBcnJheTxzdHJpbmc+O1xuXHR9O1xuXHQvKipcblx0ICogV2hlbiBzZXQsIHRoaXMgbW9kZWwgaXMgb25seSBzaG93biBpbiB0aGUgbW9kZWwgcGlja2VyIGZvciB0aGUgc3BlY2lmaWVkIGNoYXQgc2Vzc2lvbiB0eXBlLlxuXHQgKiBNb2RlbHMgd2l0aCB0aGlzIHByb3BlcnR5IGFyZSBleGNsdWRlZCBmcm9tIHRoZSBnZW5lcmFsIG1vZGVsIHBpY2tlciBhbmQgb25seSBhcHBlYXJcblx0ICogd2hlbiB0aGUgdXNlciBpcyBpbiBhIHNlc3Npb24gbWF0Y2hpbmcgdGhpcyB0eXBlLlxuXHQgKi9cblx0cmVhZG9ubHkgdGFyZ2V0Q2hhdFNlc3Npb25UeXBlPzogc3RyaW5nO1xuXHQvKipcblx0ICogT3B0aW9uYWwgZ3JvdXBpbmcgaGludCBmb3IgdGhlIG1vZGVsIHBpY2tlci4gV2hlbiBzZXQsIHRoZSBwaWNrZXIgYnVja2V0cyB0aGlzIG1vZGVsXG5cdCAqIHVuZGVyIGEgc3ViLWdyb3VwIHdpdGhpbiBpdHMgdmVuZG9yLCBpZGVudGlmaWVkIGJ5IHRoaXMgdmVuZG9yIGlkIFx1MjAxNCBlLmcuIGFnZW50LWhvc3QgbW9kZWxzLFxuXHQgKiB3aGljaCBhbGwgc2hhcmUgb25lIHZlbmRvciwgZ3JvdXBlZCBieSB0aGVpciB1cHN0cmVhbSBwcm92aWRlciBcdTIwMTQgaW5zdGVhZCBvZiBhIHNpbmdsZVxuXHQgKiB2ZW5kb3Itd2lkZSBidWNrZXQuIFRoZSBkaXNwbGF5IG5hbWUgaXMgcmVzb2x2ZWQgZnJvbSB0aGUgdmVuZG9yIHJlZ2lzdHJ5XG5cdCAqICh7QGxpbmsgSUxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRWZW5kb3JzfSksIHRoZSBzYW1lIHNvdXJjZSB1c2VkIGZvciBldmVyeSBvdGhlciB2ZW5kb3IuXG5cdCAqIFByZXNlbnRhdGlvbi1vbmx5OyBpdCBkb2VzIG5vdCBhZmZlY3QgbW9kZWwgc2VsZWN0aW9uIG9yIHJvdXRpbmcuXG5cdCAqL1xuXHRyZWFkb25seSBtb2RlbEdyb3VwPzogeyByZWFkb25seSBpZDogc3RyaW5nIH07XG5cdC8qKlxuXHQgKiBGb3IgYW4gYWdlbnQtaG9zdCBjb3B5IG9mIGFuIGV4dGVuc2lvbi1wcm92aWRlZCBCWU9LIG1vZGVsLCB0aGUgaWRlbnRpZmllciB0aGVcblx0ICogb3JpZ2luYWwgbW9kZWwgaXMgcmVnaXN0ZXJlZCB1bmRlciBpbiB0aGUgcmVuZGVyZXIncyBMTSBzZXJ2aWNlXG5cdCAqIChgdG9Nb2RlbElkZW50aWZpZXIodmVuZG9yLCBncm91cCwgaWQpYCBcdTIwMTQgYDx2ZW5kb3I+Lzxncm91cD4vPGlkPmAgb3IgYDx2ZW5kb3I+LzxpZD5gKS5cblx0ICogVGhpcyBpcyBleGFjdGx5IHRoZSBpZCB0aGUgXCJNYW5hZ2UgTW9kZWxzXCIgdmlldyBrZXlzIHZpc2liaWxpdHkgYnk7IGl0IGlzIGNhcnJpZWRcblx0ICogYWNyb3NzIHRoZSBhZ2VudC1ob3N0IGJyaWRnZSBhbmQgc3VyZmFjZWQgaGVyZSBzbyB0aGUgbW9kZWwgcGlja2VyIGNhbiBob25vdXIgdGhlXG5cdCAqIG1vZGVsJ3MgdmlzaWJpbGl0eSB0b2dnbGUuIEFic2VudCBmb3IgbmF0aXZlIGFnZW50LWhvc3QgbW9kZWxzIGFuZCBub24tYWdlbnQtaG9zdFxuXHQgKiBtb2RlbHMuXG5cdCAqL1xuXHRyZWFkb25seSBieW9rTW9kZWxJZGVudGlmaWVyPzogc3RyaW5nO1xuXHQvKipcblx0ICogQW4gb3B0aW9uYWwgSlNPTiBzY2hlbWEgZGVzY3JpYmluZyB0aGUgcGVyLW1vZGVsIGNvbmZpZ3VyYXRpb24gb3B0aW9ucy5cblx0ICogVXNlZCB0byB2YWxpZGF0ZSB1c2VyLXByb3ZpZGVkIHBlci1tb2RlbCBjb25maWd1cmF0aW9uIGluIGBjaGF0TGFuZ3VhZ2VNb2RlbHMuanNvbmAuXG5cdCAqL1xuXHRyZWFkb25seSBjb25maWd1cmF0aW9uU2NoZW1hPzogSUxhbmd1YWdlTW9kZWxDb25maWd1cmF0aW9uU2NoZW1hO1xuXHQvKipcblx0ICogT3B0aW9uYWwgd2FybmluZyB0ZXh0IHRvIGRpc3BsYXkgaW4gdGhlIG1vZGVsIHBpY2tlciBob3ZlciBhcyBhIHdhcm5pbmcgYmFubmVyLlxuXHQgKiBUaGUga2V5cyBhcmUgd2FybmluZyBjYXRlZ29yaWVzIChlLmcuIFwiZGF0YV9yZXRlbnRpb25cIikgYW5kIHRoZSB2YWx1ZXMgYXJlIG1hcmtkb3duIHN0cmluZ3MuXG5cdCAqL1xuXHRyZWFkb25seSB3YXJuaW5nVGV4dD86IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz47XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBwcm9tb3Rpb25hbCBpbmZvcm1hdGlvbiBmb3IgdGhpcyBtb2RlbC4gUG9zaXRpdmUgZGlzY291bnRzIHN1cmZhY2Vcblx0ICogcHJvbW90aW9uYWwgVUk7IG5vbi1wb3NpdGl2ZSBkaXNjb3VudHMgb25seSBmZWF0dXJlIHRoZSBtb2RlbCBpbiB0aGUgcGlja2VyLlxuXHQgKi9cblx0cmVhZG9ubHkgcHJvbW8/OiB7XG5cdFx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0XHRyZWFkb25seSBkaXNjb3VudFBlcmNlbnQ6IG51bWJlcjtcblx0XHRyZWFkb25seSBlbmRzQXQ6IHN0cmluZztcblx0XHRyZWFkb25seSBtZXNzYWdlOiBzdHJpbmc7XG5cdH07XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEge1xuXHRleHBvcnQgZnVuY3Rpb24gc3VpdGFibGVGb3JBZ2VudE1vZGUobWV0YWRhdGE6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc3VwcG9ydHNUb29sc0FnZW50ID0gdHlwZW9mIG1ldGFkYXRhLmNhcGFiaWxpdGllcz8uYWdlbnRNb2RlID09PSAndW5kZWZpbmVkJyB8fCBtZXRhZGF0YS5jYXBhYmlsaXRpZXMuYWdlbnRNb2RlO1xuXHRcdHJldHVybiBzdXBwb3J0c1Rvb2xzQWdlbnQgJiYgISFtZXRhZGF0YS5jYXBhYmlsaXRpZXM/LnRvb2xDYWxsaW5nO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGFzUXVhbGlmaWVkTmFtZShtZXRhZGF0YTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHttZXRhZGF0YS5uYW1lfSAoJHttZXRhZGF0YS52ZW5kb3J9KWA7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gbWF0Y2hlc1F1YWxpZmllZE5hbWUobmFtZTogc3RyaW5nLCBtZXRhZGF0YTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEpOiBib29sZWFuIHtcblx0XHRpZiAobWV0YWRhdGEudmVuZG9yID09PSBDT1BJTE9UX1ZFTkRPUl9JRCAmJiBuYW1lID09PSBtZXRhZGF0YS5uYW1lKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIG5hbWUgPT09IGFzUXVhbGlmaWVkTmFtZShtZXRhZGF0YSk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaGFzUHJvbW9EaXNjb3VudChtZXRhZGF0YTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEpOiBtZXRhZGF0YSBpcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSAmIHsgcmVhZG9ubHkgcHJvbW86IE5vbk51bGxhYmxlPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhWydwcm9tbyddPiB9IHtcblx0XHRyZXR1cm4gISFtZXRhZGF0YS5wcm9tbyAmJiBtZXRhZGF0YS5wcm9tby5kaXNjb3VudFBlcmNlbnQgPiAwO1xuXHR9XG5cblx0LyoqXG5cdCAqIERvY3VtZW50YXRpb24gbGluayBleHBsYWluaW5nIGhvdyBBdXRvIG1vZGVsIHNlbGVjdGlvbiB3b3Jrcy5cblx0ICogTk9URTogQWxzbyBkZWZpbmVkIGluIGV4dGVuc2lvbnMvY29waWxvdC9zcmMvZXh0ZW5zaW9uL2NvbnZlcnNhdGlvbi9jb21tb24vbGFuZ3VhZ2VNb2RlbEFjY2Vzcy50cyBcdTIwMTQga2VlcCBpbiBzeW5jLlxuXHQgKi9cblx0ZXhwb3J0IGNvbnN0IGF1dG9Nb2RlbFNlbGVjdGlvbkRvY3NVcmwgPSAnaHR0cHM6Ly9kb2NzLmdpdGh1Yi5jb20vZW4vY29waWxvdC9jb25jZXB0cy9tb2RlbHMvYXV0by1tb2RlbC1zZWxlY3Rpb24nO1xuXG5cdC8qKlxuXHQgKiBCdWlsZHMgdGhlIHNoYXJlZCBkZXNjcmlwdGlvbiBzaG93biBmb3IgdGhlIEF1dG8gbW9kZWwsIHJlbmRlcmVkIGFzIE1hcmtkb3duXG5cdCAqIChpdCBjb250YWlucyBhIFwiTGVhcm4gTW9yZVwiIGxpbmspLiBUaGUgZGlzY291bnQgc2VudGVuY2UgaXMgb25seSBpbmNsdWRlZFxuXHQgKiB3aGVuIGEgcG9zaXRpdmUgZGlzY291bnQgaXMgcHJvdmlkZWQuXG5cdCAqXG5cdCAqIEBwYXJhbSBkaXNjb3VudFBlcmNlbnQgV2hvbGUtbnVtYmVyIHBlcmNlbnRhZ2UgKGUuZy4gYDEwYCBmb3IgMTAlKS4gV2hlblxuXHQgKiBvbWl0dGVkIG9yIG5vdCBwb3NpdGl2ZSwgdGhlIGRpc2NvdW50IHNlbnRlbmNlIGlzIGxlZnQgb3V0IGVudGlyZWx5LlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGdldEF1dG9Nb2RlbERlc2NyaXB0aW9uKGRpc2NvdW50UGVyY2VudD86IG51bWJlcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgYmFzZSA9IGxvY2FsaXplKCdhdXRvTW9kZWwuZGVzY3JpcHRpb24nLCBcIkF1dG8gcm91dGVzIGJhc2VkIG9uIHlvdXIgdGFzayBhbmQgcmVhbC10aW1lIHN5c3RlbSBoZWFsdGggYW5kIG1vZGVsIHBlcmZvcm1hbmNlLlwiKTtcblx0XHRjb25zdCBsZWFybk1vcmUgPSBsb2NhbGl6ZSgnYXV0b01vZGVsLmxlYXJuTW9yZScsIFwiW0xlYXJuIE1vcmVdKHswfSlcIiwgYXV0b01vZGVsU2VsZWN0aW9uRG9jc1VybCk7XG5cdFx0aWYgKHR5cGVvZiBkaXNjb3VudFBlcmNlbnQgPT09ICdudW1iZXInICYmIGRpc2NvdW50UGVyY2VudCA+IDApIHtcblx0XHRcdGNvbnN0IGRpc2NvdW50ID0gbG9jYWxpemUoJ2F1dG9Nb2RlbC5kaXNjb3VudCcsIFwiTW9kZWxzIHJvdXRlZCB2aWEgYXV0byByZWNlaXZlIGEgezB9JSBkaXNjb3VudC5cIiwgZGlzY291bnRQZXJjZW50KTtcblx0XHRcdHJldHVybiBgJHtiYXNlfSAke2Rpc2NvdW50fSAke2xlYXJuTW9yZX1gO1xuXHRcdH1cblx0XHRyZXR1cm4gYCR7YmFzZX0gJHtsZWFybk1vcmV9YDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgXCJNYW5hZ2UgTW9kZWxzXCIgaWRlbnRpZmllciB0aGF0IGFuIGFnZW50LWhvc3QgY29weSBvZiBhbiBleHRlbnNpb24tcHJvdmlkZWRcblx0ICogQllPSyBtb2RlbCBpcyB0b2dnbGVkIHVuZGVyLCBvciBgdW5kZWZpbmVkYCB3aGVuIHRoZSBtb2RlbCBpcyBub3Qgc3VjaCBhIGNvcHkuXG5cdCAqXG5cdCAqIEFnZW50LWhvc3QgQllPSyBtb2RlbHMgbWFrZSBhIHJvdW5kIHRyaXAgdGhhdCByZXdyaXRlcyB0aGVpciBpZCAodGhlIG5vZGUgYWdlbnQgaG9zdFxuXHQgKiByZS1hZHZlcnRpc2VzIHRoZSBleHRlbnNpb24gbW9kZWwgdW5kZXIgdGhlIGFnZW50LWhvc3QgdmVuZG9yKS4gVGhlaXIgb3JpZ2luYWwgTE1cblx0ICogc2VydmljZSBpZGVudGlmaWVyIFx1MjAxNCBgdG9Nb2RlbElkZW50aWZpZXIodmVuZG9yLCBncm91cCwgaWQpYCwgaS5lLiBgPHZlbmRvcj4vPGdyb3VwPi88aWQ+YFxuXHQgKiBvciBgPHZlbmRvcj4vPGlkPmAsIHdoaWNoIGlzIHdoYXQgdGhlIE1hbmFnZSBNb2RlbHMgdmlldyBzdG9yZXMgd2hlbiBoaWRpbmcgdGhlIG1vZGVsIFx1MjAxNFxuXHQgKiBpcyBjYXJyaWVkIGFjcm9zcyB0aGUgYnJpZGdlIGFuZCBzdXJmYWNlZCBvbiB7QGxpbmsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEuYnlva01vZGVsSWRlbnRpZmllcn0uXG5cdCAqIFRoaXMgcmV0dXJucyBpdCwgc28gY2FsbGVycyBjYW4gbWF0Y2ggdGhlIGNvcHkgYWdhaW5zdCB0aGUgdXNlcidzIHZpc2liaWxpdHkgdG9nZ2xlcy5cblx0ICpcblx0ICogUmV0dXJucyBgdW5kZWZpbmVkYCBmb3IgbW9kZWxzIHRoYXQgYXJlIG5vdCBhZ2VudC1ob3N0IEJZT0sgY29waWVzIChuYXRpdmUgaGFybmVzc1xuXHQgKiBtb2RlbHMgYW5kIG5vbi1hZ2VudC1ob3N0IG1vZGVscyksIHdoaWNoIGFyZSBtYXRjaGVkIGJ5IHRoZWlyIG93biBpZGVudGlmaWVyIGluc3RlYWQuXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gZ2V0QWdlbnRIb3N0Qnlva01hbmFnZU1vZGVsc0lkZW50aWZpZXIobWV0YWRhdGE6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gbWV0YWRhdGEuYnlva01vZGVsSWRlbnRpZmllcjtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlIHtcblx0c3RyZWFtOiBBc3luY0l0ZXJhYmxlPElDaGF0UmVzcG9uc2VQYXJ0IHwgSUNoYXRSZXNwb25zZVBhcnRbXT47XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdHJlc3VsdDogUHJvbWlzZTxhbnk+O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0VGV4dFJlc3BvbnNlRnJvbVN0cmVhbShyZXNwb25zZTogSUxhbmd1YWdlTW9kZWxDaGF0UmVzcG9uc2UpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRsZXQgcmVzcG9uc2VUZXh0ID0gJyc7XG5cdGNvbnN0IHN0cmVhbWluZyA9IChhc3luYyAoKSA9PiB7XG5cdFx0aWYgKCFyZXNwb25zZT8uc3RyZWFtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciBhd2FpdCAoY29uc3QgcGFydCBvZiByZXNwb25zZS5zdHJlYW0pIHtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHBhcnQpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBwYXJ0KSB7XG5cdFx0XHRcdFx0aWYgKGl0ZW0udHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdFx0XHRyZXNwb25zZVRleHQgKz0gaXRlbS52YWx1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAocGFydC50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0cmVzcG9uc2VUZXh0ICs9IHBhcnQudmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KSgpO1xuXG5cdHRyeSB7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3Jlc3BvbnNlLnJlc3VsdCwgc3RyZWFtaW5nXSk7XG5cdFx0cmV0dXJuIHJlc3BvbnNlVGV4dDtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0aWYgKHJlc3BvbnNlVGV4dCkge1xuXHRcdFx0cmV0dXJuIHJlc3BvbnNlVGV4dDtcblx0XHR9XG5cdFx0dGhyb3cgZXJyO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXIge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD47XG5cdHByb3ZpZGVMYW5ndWFnZU1vZGVsQ2hhdEluZm8ob3B0aW9uczogSUxhbmd1YWdlTW9kZWxDaGF0SW5mb09wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10+O1xuXHRzZW5kQ2hhdFJlcXVlc3QobW9kZWxJZDogc3RyaW5nLCBtZXNzYWdlczogSUNoYXRNZXNzYWdlW10sIGZyb206IEV4dGVuc2lvbklkZW50aWZpZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM6IElMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElMYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlPjtcblx0cHJvdmlkZVRva2VuQ291bnQobW9kZWxJZDogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcgfCBJQ2hhdE1lc3NhZ2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bnVtYmVyPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbENoYXQge1xuXHRtZXRhZGF0YTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdHNlbmRDaGF0UmVxdWVzdChtZXNzYWdlczogSUNoYXRNZXNzYWdlW10sIGZyb206IEV4dGVuc2lvbklkZW50aWZpZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM6IElMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElMYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlPjtcblx0cHJvdmlkZVRva2VuQ291bnQobWVzc2FnZTogc3RyaW5nIHwgSUNoYXRNZXNzYWdlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPG51bWJlcj47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlTW9kZWxDaGF0U2VsZWN0b3Ige1xuXHRyZWFkb25seSBuYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBpZD86IHN0cmluZztcblx0cmVhZG9ubHkgdmVuZG9yPzogc3RyaW5nO1xuXHRyZWFkb25seSB2ZXJzaW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBmYW1pbHk/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRva2Vucz86IG51bWJlcjtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uPzogRXh0ZW5zaW9uSWRlbnRpZmllcjtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gaXNJTGFuZ3VhZ2VNb2RlbENoYXRTZWxlY3Rvcih2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIElMYW5ndWFnZU1vZGVsQ2hhdFNlbGVjdG9yIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3Qgb2JqID0gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdHJldHVybiAoXG5cdFx0KG9iai5uYW1lID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIG9iai5uYW1lID09PSAnc3RyaW5nJykgJiZcblx0XHQob2JqLmlkID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIG9iai5pZCA9PT0gJ3N0cmluZycpICYmXG5cdFx0KG9iai52ZW5kb3IgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2Ygb2JqLnZlbmRvciA9PT0gJ3N0cmluZycpICYmXG5cdFx0KG9iai52ZXJzaW9uID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIG9iai52ZXJzaW9uID09PSAnc3RyaW5nJykgJiZcblx0XHQob2JqLmZhbWlseSA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBvYmouZmFtaWx5ID09PSAnc3RyaW5nJykgJiZcblx0XHQob2JqLnRva2VucyA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBvYmoudG9rZW5zID09PSAnbnVtYmVyJykgJiZcblx0XHQob2JqLmV4dGVuc2lvbiA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBvYmouZXh0ZW5zaW9uID09PSAnb2JqZWN0Jylcblx0KTtcbn1cblxuZXhwb3J0IGNvbnN0IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUxhbmd1YWdlTW9kZWxzU2VydmljZT4oJ0lMYW5ndWFnZU1vZGVsc1NlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIge1xuXHRtZXRhZGF0YTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdGlkZW50aWZpZXI6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbENoYXRJbmZvT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGdyb3VwPzogc3RyaW5nO1xuXHRyZWFkb25seSBzaWxlbnQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvbmZpZ3VyYXRpb24/OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0T3B0aW9ucyB7XG5cdHJlYWRvbmx5IG1vZGVsT3B0aW9ucz86IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+O1xuXHRyZWFkb25seSBjb25maWd1cmF0aW9uPzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj47XG5cdHJlYWRvbmx5IGluY2x1ZGVFbmNyeXB0ZWRUaGlua2luZz86IGJvb2xlYW47XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdHJlYWRvbmx5IFtuYW1lOiBzdHJpbmddOiBhbnk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlTW9kZWxzR3JvdXAge1xuXHRyZWFkb25seSBncm91cD86IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXA7XG5cdHJlYWRvbmx5IG1vZGVsSWRlbnRpZmllcnM6IHN0cmluZ1tdO1xuXHRyZWFkb25seSBzdGF0dXM/OiB7XG5cdFx0cmVhZG9ubHkgbWVzc2FnZTogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHNldmVyaXR5OiBTZXZlcml0eTtcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsVmVuZG9yczogRXZlbnQ8cmVhZG9ubHkgc3RyaW5nW10+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzOiBFdmVudDxzdHJpbmc+O1xuXG5cdGdldExhbmd1YWdlTW9kZWxJZHMoKTogc3RyaW5nW107XG5cblx0Z2V0VmVuZG9ycygpOiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvcltdO1xuXG5cdGxvb2t1cExhbmd1YWdlTW9kZWwobW9kZWxJZDogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEZpbmQgYSBtb2RlbCBieSBpdHMgcXVhbGlmaWVkIG5hbWUuIFRoZSBxdWFsaWZpZWQgbmFtZSBpcyB3aGF0IGlzIHVzZWQgaW4gcHJvbXB0IGFuZCBhZ2VudCBmaWxlcyBhbmQgaXMgaW4gdGhlIGZvcm1hdCBcIk1vZGVsIE5hbWUgKFZlbmRvcilcIi5cblx0ICovXG5cdGxvb2t1cExhbmd1YWdlTW9kZWxCeVF1YWxpZmllZE5hbWUocXVhbGlmaWVkTmFtZTogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkO1xuXG5cdGdldExhbmd1YWdlTW9kZWxHcm91cHModmVuZG9yOiBzdHJpbmcpOiBJTGFuZ3VhZ2VNb2RlbHNHcm91cFtdO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGdpdmVuIHZlbmRvcidzIHByb3ZpZGVyIGhhcyBjb21wbGV0ZWQgYXQgbGVhc3Qgb25lXG5cdCAqIG1vZGVsIHJlc29sdXRpb24gc2luY2UgcmVnaXN0cmF0aW9uLiBBIGBmYWxzZWAgcmVzdWx0IGluZGljYXRlcyB0aGVcblx0ICogdmVuZG9yIGlzIHN0aWxsIGluIGEgc3RhcnR1cC9yZWxvYWQgcmFjZSB3aGVyZSBpdHMgbW9kZWwgbGlzdCBpc24ndCB5ZXRcblx0ICogYXV0aG9yaXRhdGl2ZSBcdTIwMTQgY2FsbGVycyBjYW4gZmFsbCBiYWNrIHRvIGEgY2FjaGVkIGxpc3QgaW4gdGhhdCBjYXNlLlxuXHQgKi9cblx0aGFzUmVzb2x2ZWRWZW5kb3IodmVuZG9yOiBzdHJpbmcpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBHaXZlbiBhIHNlbGVjdG9yLCByZXR1cm5zIGEgbGlzdCBvZiBtb2RlbCBpZGVudGlmaWVyc1xuXHQgKiBAcGFyYW0gc2VsZWN0b3IgVGhlIHNlbGVjdG9yIHRvIGxvb2t1cCBmb3IgbGFuZ3VhZ2UgbW9kZWxzLiBJZiB0aGUgc2VsZWN0b3IgaXMgZW1wdHksIGFsbCBsYW5ndWFnZSBtb2RlbHMgYXJlIHJldHVybmVkLlxuXHQgKi9cblx0c2VsZWN0TGFuZ3VhZ2VNb2RlbHMoc2VsZWN0b3I6IElMYW5ndWFnZU1vZGVsQ2hhdFNlbGVjdG9yKTogUHJvbWlzZTxzdHJpbmdbXT47XG5cblx0cmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIodmVuZG9yOiBzdHJpbmcsIHByb3ZpZGVyOiBJTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcik6IElEaXNwb3NhYmxlO1xuXG5cdGRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKGFkZGVkOiBJVXNlckZyaWVuZGx5TGFuZ3VhZ2VNb2RlbFtdLCByZW1vdmVkOiBJVXNlckZyaWVuZGx5TGFuZ3VhZ2VNb2RlbFtdKTogdm9pZDtcblxuXHRzZW5kQ2hhdFJlcXVlc3QobW9kZWxJZDogc3RyaW5nLCBmcm9tOiBFeHRlbnNpb25JZGVudGlmaWVyIHwgdW5kZWZpbmVkLCBtZXNzYWdlczogSUNoYXRNZXNzYWdlW10sIG9wdGlvbnM6IElMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElMYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlPjtcblxuXHRjb21wdXRlVG9rZW5MZW5ndGgobW9kZWxJZDogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcgfCBJQ2hhdE1lc3NhZ2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bnVtYmVyPjtcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgcmVzb2x2ZWQgcGVyLW1vZGVsIGNvbmZpZ3VyYXRpb24gZm9yIHRoZSBnaXZlbiBtb2RlbCBpZGVudGlmaWVyLlxuXHQgKiBJbmNsdWRlcyBzY2hlbWEgZGVmYXVsdHMgd2l0aCB1c2VyIG92ZXJyaWRlcyBhcHBsaWVkIG9uIHRvcC5cblx0ICogUmV0dXJucyB1bmRlZmluZWQgaWYgdGhlIG1vZGVsIGhhcyBubyBjb25maWd1cmF0aW9uIHNjaGVtYSBhbmQgbm8gdXNlciBjb25maWcuXG5cdCAqL1xuXHRnZXRNb2RlbENvbmZpZ3VyYXRpb24obW9kZWxJZDogc3RyaW5nKTogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIHBlci1tb2RlbCBjb25maWd1cmF0aW9uIGZvciB0aGUgZ2l2ZW4gbW9kZWwuXG5cdCAqIE1lcmdlcyB0aGUgcHJvdmlkZWQgdmFsdWVzIGludG8gdGhlIGV4aXN0aW5nIGNvbmZpZ3VyYXRpb24uXG5cdCAqL1xuXHRzZXRNb2RlbENvbmZpZ3VyYXRpb24obW9kZWxJZDogc3RyaW5nLCB2YWx1ZXM6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+KTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogUmV0dXJucyBhY3Rpb25zIGZvciBjb25maWd1cmluZyB0aGUgZ2l2ZW4gbW9kZWwgYmFzZWQgb24gaXRzIGNvbmZpZ3VyYXRpb24gc2NoZW1hLlxuXHQgKiBGb3IgZW51bSBwcm9wZXJ0aWVzLCByZXR1cm5zIHN1Ym1lbnUgYWN0aW9ucyB3aXRoIGNoZWNrYWJsZSB2YWx1ZXMuXG5cdCAqIFJldHVybnMgYW4gZW1wdHkgYXJyYXkgaWYgdGhlIG1vZGVsIGhhcyBubyBjb25maWd1cmF0aW9uIHNjaGVtYS5cblx0ICovXG5cdGdldE1vZGVsQ29uZmlndXJhdGlvbkFjdGlvbnMobW9kZWxJZDogc3RyaW5nKTogSUFjdGlvbltdO1xuXG5cdGFkZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cChuYW1lOiBzdHJpbmcsIHZlbmRvcklkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPjtcblxuXHRyZW1vdmVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAodmVuZG9ySWQ6IHN0cmluZywgcHJvdmlkZXJHcm91cE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cblx0Y29uZmlndXJlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKHZlbmRvcklkOiBzdHJpbmcsIG5hbWU/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdHJlbmFtZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCh2ZW5kb3JJZDogc3RyaW5nLCBwcm92aWRlckdyb3VwTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblxuXHR1cGRhdGVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBBcGlLZXkodmVuZG9ySWQ6IHN0cmluZywgcHJvdmlkZXJHcm91cE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cblx0YWRkTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwTW9kZWwodmVuZG9ySWQ6IHN0cmluZywgcHJvdmlkZXJHcm91cE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cblx0b3Blbkxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cFNldHRpbmdzKHZlbmRvcklkOiBzdHJpbmcsIHByb3ZpZGVyR3JvdXBOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBPcGVucyB0aGUgbGFuZ3VhZ2UgbW9kZWxzIGNvbmZpZ3VyYXRpb24gZmlsZSBhbmQgbmF2aWdhdGVzIHRvXG5cdCAqIG9yIGNyZWF0ZXMgdGhlIHBlci1tb2RlbCBjb25maWd1cmF0aW9uIGZvciB0aGUgZ2l2ZW4gbW9kZWwuXG5cdCAqL1xuXHRjb25maWd1cmVNb2RlbChtb2RlbElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdG1pZ3JhdGVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAobGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbW9zdCByZWNlbnRseSB1c2VkIG1vZGVsIGlkZW50aWZpZXJzLCBvcmRlcmVkIGJ5IG1vc3QtcmVjZW50LWZpcnN0LlxuXHQgKiBAcGFyYW0gbWF4Q291bnQgTWF4aW11bSBudW1iZXIgb2YgZW50cmllcyB0byByZXR1cm4gKGRlZmF1bHQgNykuXG5cdCAqL1xuXHRnZXRSZWNlbnRseVVzZWRNb2RlbElkcygpOiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogUmVjb3JkcyB0aGF0IGEgbW9kZWwgd2FzIHVzZWQsIHVwZGF0aW5nIHRoZSByZWNlbnRseSB1c2VkIGxpc3QuXG5cdCAqL1xuXHRhZGRUb1JlY2VudGx5VXNlZExpc3QobW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBDbGVhcnMgdGhlIHJlY2VudGx5IHVzZWQgbW9kZWwgbGlzdC5cblx0ICovXG5cdGNsZWFyUmVjZW50bHlVc2VkTGlzdCgpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBwaW5uZWQgbW9kZWwgaWRlbnRpZmllcnMsIGluIHRoZSBvcmRlciB0aGV5IHdlcmUgcGlubmVkLlxuXHQgKi9cblx0Z2V0UGlubmVkTW9kZWxJZHMoKTogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIFBpbnMgYSBtb2RlbCBzbyBpdCBhcHBlYXJzIGluIHRoZSBwaW5uZWQgc2VjdGlvbiBvZiB0aGUgbW9kZWwgcGlja2VyLlxuXHQgKi9cblx0cGluTW9kZWwobW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBVbnBpbnMgYSBtb2RlbCwgcmVtb3ZpbmcgaXQgZnJvbSB0aGUgcGlubmVkIHNlY3Rpb24uXG5cdCAqL1xuXHR1bnBpbk1vZGVsKG1vZGVsSWRlbnRpZmllcjogc3RyaW5nKTogdm9pZDtcblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSBnaXZlbiBtb2RlbCBpcyBwaW5uZWQuXG5cdCAqL1xuXHRpc01vZGVsUGlubmVkKG1vZGVsSWRlbnRpZmllcjogc3RyaW5nKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogRmlyZXMgd2hlbiB0aGUgcGlubmVkIG1vZGVscyBsaXN0IGNoYW5nZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVBpbm5lZE1vZGVsczogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUgZ2l2ZW4gbW9kZWwgaXMgaGlkZGVuIGZyb20gdGhlIGNoYXQgbW9kZWwgcGlja2VyLlxuXHQgKi9cblx0aXNNb2RlbEhpZGRlbihtb2RlbElkZW50aWZpZXI6IHN0cmluZyk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciBldmVyeSByZXNvbHZlZCBtb2RlbCBpbiB0aGUgZ2l2ZW4gKHZlbmRvciwgZ3JvdXBOYW1lKVxuXHQgKiBidWNrZXQgaXMgaGlkZGVuIGZyb20gdGhlIGNoYXQgbW9kZWwgcGlja2VyLlxuXHQgKi9cblx0aXNHcm91cEhpZGRlbih2ZW5kb3I6IHN0cmluZywgZ3JvdXBOYW1lOiBzdHJpbmcpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBIaWRlIG9yIHNob3cgYSBzaW5nbGUgbW9kZWwgaW4gdGhlIGNoYXQgbW9kZWwgcGlja2VyLlxuXHQgKi9cblx0c2V0TW9kZWxIaWRkZW4obW9kZWxJZGVudGlmaWVyOiBzdHJpbmcsIGhpZGRlbjogYm9vbGVhbik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEhpZGUgb3Igc2hvdyBldmVyeSBtb2RlbCBpbiBhICh2ZW5kb3IsIGdyb3VwTmFtZSkgYnVja2V0LlxuXHQgKi9cblx0c2V0R3JvdXBIaWRkZW4odmVuZG9yOiBzdHJpbmcsIGdyb3VwTmFtZTogc3RyaW5nLCBoaWRkZW46IGJvb2xlYW4pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBwZXJzaXN0ZWQgcGVyLW1vZGVsIGhpZGRlbiBpZGVudGlmaWVycy5cblx0ICovXG5cdGdldEhpZGRlbk1vZGVsSWRzKCk6IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuIGFueSBtb2RlbCBvciBncm91cCB2aXNpYmlsaXR5IHN0YXRlIGNoYW5nZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1vZGVsVmlzaWJpbGl0eTogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIG1vZGVscyBmcm9tIHRoZSBjb250cm9sIG1hbmlmZXN0LFxuXHQgKiBzZXBhcmF0ZWQgaW50byBmcmVlIGFuZCBwYWlkIHRpZXJzLlxuXHQgKi9cblx0Z2V0TW9kZWxzQ29udHJvbE1hbmlmZXN0KCk6IElNb2RlbHNDb250cm9sTWFuaWZlc3Q7XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW4gbW9kZWxzIGNvbnRyb2wgbWFuaWZlc3QgY2hhbmdlcy5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxzQ29udHJvbE1hbmlmZXN0OiBFdmVudDxJTW9kZWxzQ29udHJvbE1hbmlmZXN0PjtcblxuXHQvKipcblx0ICogT2JzZXJ2YWJsZSBtYXAgb2YgcmVzdHJpY3RlZCBjaGF0IHBhcnRpY2lwYW50IG5hbWVzIHRvIGFsbG93ZWQgZXh0ZW5zaW9uIHB1Ymxpc2hlci9JRHMuXG5cdCAqIEZldGNoZWQgZnJvbSB0aGUgY2hhdCBjb250cm9sIG1hbmlmZXN0LlxuXHQgKi9cblx0cmVhZG9ubHkgcmVzdHJpY3RlZENoYXRQYXJ0aWNpcGFudHM6IElPYnNlcnZhYmxlPHsgW25hbWU6IHN0cmluZ106IHN0cmluZ1tdIH0+O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGlzcGxheU5hbWUobGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCB2ZW5kb3I6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICh2ZW5kb3IgPT09ICdjb3BpbG90Y2xpJykge1xuXHRcdC8vIEB2cml0YW50MjQ6IFRoaXMgaXMgdGVtcG9yYXJ5IHVudGlsIHdlIGhhdmUgZGlzdGluY3QgdmVuZG9ycyBmb3IgQ29waWxvdCBDTEkgYW5kIENvcGlsb3QgQ2hhdC5cblx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQubGFuZ3VhZ2VNb2RlbFByb3ZpZGVyLmNvcGlsb3QnLCBcIkNvcGlsb3RcIik7XG5cdH1cblx0Y29uc3QgZGVzY3JpcHRvciA9IGxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRWZW5kb3JzKCkuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnZlbmRvciA9PT0gdmVuZG9yKTtcblx0cmV0dXJuIGRlc2NyaXB0b3I/LmRpc3BsYXlOYW1lID8/IHZlbmRvci5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHZlbmRvci5zbGljZSgxKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldExhbmd1YWdlTW9kZWxEaXNwbGF5TmFtZVdpdGhQcm92aWRlcihtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyLCBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UpOiBzdHJpbmcge1xuXHRjb25zdCB7IG1ldGFkYXRhIH0gPSBtb2RlbDtcblx0aWYgKCFtZXRhZGF0YS5pc0JZT0sgJiYgIW1ldGFkYXRhLmJ5b2tNb2RlbElkZW50aWZpZXIpIHtcblx0XHRyZXR1cm4gbWV0YWRhdGEubmFtZTtcblx0fVxuXG5cdGNvbnN0IG9yaWdpbmFsSWRlbnRpZmllciA9IG1ldGFkYXRhLmJ5b2tNb2RlbElkZW50aWZpZXIgPz8gbW9kZWwuaWRlbnRpZmllcjtcblx0Y29uc3Qgb3JpZ2luYWxNZXRhZGF0YSA9IG1ldGFkYXRhLmJ5b2tNb2RlbElkZW50aWZpZXIgPyBsYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChvcmlnaW5hbElkZW50aWZpZXIpIDogbWV0YWRhdGE7XG5cdGNvbnN0IHByb3ZpZGVyVmVuZG9yID0gb3JpZ2luYWxNZXRhZGF0YT8udmVuZG9yID8/IG1ldGFkYXRhLm1vZGVsR3JvdXA/LmlkID8/IG1ldGFkYXRhLnZlbmRvcjtcblx0Y29uc3QgcHJvdmlkZXJOYW1lID0gZ2V0TGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGlzcGxheU5hbWUobGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBwcm92aWRlclZlbmRvcik7XG5cdGNvbnN0IGdyb3VwTmFtZSA9IGxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRMYW5ndWFnZU1vZGVsR3JvdXBzKHByb3ZpZGVyVmVuZG9yKVxuXHRcdC5maW5kKGdyb3VwID0+IGdyb3VwLm1vZGVsSWRlbnRpZmllcnMuaW5jbHVkZXMob3JpZ2luYWxJZGVudGlmaWVyKSlcblx0XHQ/Lmdyb3VwPy5uYW1lO1xuXHRyZXR1cm4gZ3JvdXBOYW1lICYmIGdyb3VwTmFtZSAhPT0gcHJvdmlkZXJOYW1lXG5cdFx0PyBsb2NhbGl6ZSgnY2hhdC5sYW5ndWFnZU1vZGVsTmFtZVdpdGhQcm92aWRlckFuZEdyb3VwJywgXCJ7MH0vezF9L3syfVwiLCBwcm92aWRlck5hbWUsIGdyb3VwTmFtZSwgbWV0YWRhdGEubmFtZSlcblx0XHQ6IGxvY2FsaXplKCdjaGF0Lmxhbmd1YWdlTW9kZWxOYW1lV2l0aFByb3ZpZGVyJywgXCJ7MH0vezF9XCIsIHByb3ZpZGVyTmFtZSwgbWV0YWRhdGEubmFtZSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1vZGVsQ29udHJvbEVudHJ5IHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgZmVhdHVyZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBtaW5WU0NvZGVWZXJzaW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBleGlzdHM6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1vZGVsc0NvbnRyb2xNYW5pZmVzdCB7XG5cdHJlYWRvbmx5IGZyZWU6IElTdHJpbmdEaWN0aW9uYXJ5PElNb2RlbENvbnRyb2xFbnRyeT47XG5cdHJlYWRvbmx5IHBhaWQ6IElTdHJpbmdEaWN0aW9uYXJ5PElNb2RlbENvbnRyb2xFbnRyeT47XG59XG5cbmNvbnN0IGxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJUeXBlID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cmVxdWlyZWQ6IFsndmVuZG9yJywgJ2Rpc3BsYXlOYW1lJ10sXG5cdHByb3BlcnRpZXM6IHtcblx0XHR2ZW5kb3I6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlTW9kZWxzLnZlbmRvcicsIFwiQSBnbG9iYWxseSB1bmlxdWUgdmVuZG9yIG9mIGxhbmd1YWdlIG1vZGVsIGNoYXQgcHJvdmlkZXIuXCIpXG5cdFx0fSxcblx0XHRkaXNwbGF5TmFtZToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VNb2RlbHMuZGlzcGxheU5hbWUnLCBcIlRoZSBkaXNwbGF5IG5hbWUgb2YgdGhlIGxhbmd1YWdlIG1vZGVsIGNoYXQgcHJvdmlkZXIuXCIpXG5cdFx0fSxcblx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5sYW5ndWFnZU1vZGVscy5jb25maWd1cmF0aW9uJywgXCJDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIHRoZSBsYW5ndWFnZSBtb2RlbCBjaGF0IHByb3ZpZGVyLlwiKSxcblx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQkcmVmOiAnaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNy9zY2hlbWEjJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHQkcmVmOiAnaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNy9zY2hlbWEjJyxcblx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRzZWNyZXQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VNb2RlbHMuY29uZmlndXJhdGlvbi5zZWNyZXQnLCBcIldoZXRoZXIgdGhlIHByb3BlcnR5IGlzIGEgc2VjcmV0LlwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdCRyZWY6ICdodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA3L3NjaGVtYSMnLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0c2VjcmV0OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VNb2RlbHMuY29uZmlndXJhdGlvbi5zZWNyZXQnLCBcIldoZXRoZXIgdGhlIHByb3BlcnR5IGlzIGEgc2VjcmV0LlwiKVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXG5cdFx0fSxcblx0XHRtYW5hZ2VtZW50Q29tbWFuZDoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VNb2RlbHMubWFuYWdlbWVudENvbW1hbmQnLCBcIkEgY29tbWFuZCB0byBtYW5hZ2UgdGhlIGxhbmd1YWdlIG1vZGVsIGNoYXQgcHJvdmlkZXIsIGUuZy4gJ01hbmFnZSBDb3BpbG90IG1vZGVscycuIFRoaXMgaXMgdXNlZCBpbiB0aGUgY2hhdCBtb2RlbCBwaWNrZXIuIElmIG5vdCBwcm92aWRlZCwgYSBnZWFyIGljb24gaXMgbm90IHJlbmRlcmVkIGR1cmluZyB2ZW5kb3Igc2VsZWN0aW9uLlwiKSxcblx0XHRcdGRlcHJlY2F0ZWQ6IHRydWUsXG5cdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlTW9kZWxzLm1hbmFnZW1lbnRDb21tYW5kLmRlcHJlY2F0ZWQnLCBcIlRoZSBtYW5hZ2VtZW50Q29tbWFuZCBwcm9wZXJ0eSBpcyBkZXByZWNhdGVkIGFuZCB3aWxsIGJlIHJlbW92ZWQgaW4gYSBmdXR1cmUgcmVsZWFzZS4gVXNlIHRoZSBuZXcgY29uZmlndXJhdGlvbiBwcm9wZXJ0eSBpbnN0ZWFkLlwiKVxuXHRcdH0sXG5cdFx0ZGVwcmVjYXRpb246IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlTW9kZWxzLmRlcHJlY2F0aW9uJywgXCJNYXJrcyB0aGlzIGxhbmd1YWdlIG1vZGVsIGNoYXQgcHJvdmlkZXIgYXMgZGVwcmVjYXRlZC4gV2hlbiBzZXQsIHRoZSBNYW5hZ2UgTW9kZWxzIHZpZXcgcmVuZGVycyB0aGUgcHJvdmlkZXIgd2l0aCBhIGxpbmsgcG9pbnRpbmcgdG8gYSByZXBsYWNlbWVudC5cIiksXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGxpbms6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VNb2RlbHMuZGVwcmVjYXRpb24ubGluaycsIFwiQSBVUkwgb3BlbmVkIHdoZW4gdGhlIHVzZXIgY2xpY2tzIHRoZSBkZXByZWNhdGlvbiBsaW5rIHNob3duIG5leHQgdG8gdGhlIHByb3ZpZGVyIG5hbWUuIFVzZSBhICd2c2NvZGU6ZXh0ZW5zaW9uLzxwdWJsaXNoZXI+LjxuYW1lPicgVVJJIHRvIG9wZW4gYSByZXBsYWNlbWVudCBleHRlbnNpb24gaW4gdGhlIEV4dGVuc2lvbnMgdmlldy5cIilcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0d2hlbjoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VNb2RlbHMud2hlbicsIFwiQ29uZGl0aW9uIHdoaWNoIG11c3QgYmUgdHJ1ZSB0byBzaG93IHRoaXMgbGFuZ3VhZ2UgbW9kZWwgY2hhdCBwcm92aWRlciBpbiB0aGUgTWFuYWdlIE1vZGVscyBsaXN0LlwiKVxuXHRcdH1cblx0fVxufSBhcyBjb25zdCBzYXRpc2ZpZXMgSUpTT05TY2hlbWE7XG5cbmV4cG9ydCB0eXBlIElVc2VyRnJpZW5kbHlMYW5ndWFnZU1vZGVsID0gT21pdDxUeXBlRnJvbUpzb25TY2hlbWE8dHlwZW9mIGxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJUeXBlPiwgJ2RlcHJlY2F0aW9uJz4gJiB7XG5cdC8qKlxuXHQgKiBNYXJrcyBhIHByb3ZpZGVyIGFzIGRlcHJlY2F0ZWQuIFRoZSBNYW5hZ2UgTW9kZWxzIHZpZXcgcmVuZGVycyBhIGxpbmtcblx0ICogKHBvaW50aW5nIHRvIGEgcmVwbGFjZW1lbnQsIGUuZy4gYSBgdnNjb2RlOmV4dGVuc2lvbi88cHVibGlzaGVyPi48bmFtZT5gIFVSSSlcblx0ICogbmV4dCB0byB0aGUgcHJvdmlkZXIgbmFtZS4gT3B0aW9uYWwgc28gZXhpc3RpbmcgcHJvdmlkZXIgZGVzY3JpcHRvcnMgYXJlIHVuYWZmZWN0ZWQuXG5cdCAqL1xuXHRyZWFkb25seSBkZXByZWNhdGlvbj86IHsgcmVhZG9ubHkgbGluaz86IHN0cmluZyB9O1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvciBleHRlbmRzIElVc2VyRnJpZW5kbHlMYW5ndWFnZU1vZGVsIHtcblx0cmVhZG9ubHkgaXNEZWZhdWx0OiBib29sZWFuO1xufVxuXG4vKipcbiAqIFJlc29sdmVzIGEgcHJvdmlkZXIgYGRlcHJlY2F0aW9uLmxpbmtgIGZvciBvcGVuaW5nIGluc2lkZSB0aGUgY3VycmVudCBidWlsZC4gQ29udHJpYnV0aW9ucyBwb2ludFxuICogYXQgdGhlIHJlcGxhY2VtZW50IGV4dGVuc2lvbiB3aXRoIGEgc3RhYmxlIGB2c2NvZGU6ZXh0ZW5zaW9uLzxpZD5gIFVSSSwgYnV0IHRoZSBVUkwgc2VydmljZSBvbmx5XG4gKiByb3V0ZXMgVVJJcyB3aG9zZSBzY2hlbWUgbWF0Y2hlcyB0aGlzIGJ1aWxkJ3MgYHVybFByb3RvY29sYCAoZS5nLiBgY29kZS1vc3NgLCBgdnNjb2RlLWluc2lkZXJzYCkuXG4gKiBUaGUgYHZzY29kZTpgIHNjaGVtZSBpcyB0aGVyZWZvcmUgcmV3cml0dGVuIHRvIHRoZSBjdXJyZW50IHByb3RvY29sIHNvIHRoZSBleHRlbnNpb25zIFVSTCBoYW5kbGVyXG4gKiBvcGVucyB0aGUgZXh0ZW5zaW9uOyB3aXRob3V0IHRoaXMgdGhlIG9wZW5lciBmYWxscyBiYWNrIHRvIHRyZWF0aW5nIHRoZSBVUkkgYXMgYSAobm9uLWV4aXN0ZW50KVxuICogZmlsZSByZXNvdXJjZSBhbmQgZmFpbHMuIE90aGVyIHNjaGVtZXMgKGh0dHAocyksIGNvbW1hbmQpIGFyZSByZXR1cm5lZCB1bmNoYW5nZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlUHJvdmlkZXJEZXByZWNhdGlvbkxpbmsobGluazogc3RyaW5nLCB1cmxQcm90b2NvbDogc3RyaW5nIHwgdW5kZWZpbmVkKTogVVJJIHtcblx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKGxpbmspO1xuXHRyZXR1cm4gdXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGUgJiYgdXJsUHJvdG9jb2wgPyB1cmkud2l0aCh7IHNjaGVtZTogdXJsUHJvdG9jb2wgfSkgOiB1cmk7XG59XG5cbmV4cG9ydCBjb25zdCBsYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyRXh0ZW5zaW9uUG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJVXNlckZyaWVuZGx5TGFuZ3VhZ2VNb2RlbCB8IElVc2VyRnJpZW5kbHlMYW5ndWFnZU1vZGVsW10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdsYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVycycsXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcnMnLCBcIkNvbnRyaWJ1dGUgbGFuZ3VhZ2UgbW9kZWwgY2hhdCBwcm92aWRlcnMgb2YgYSBzcGVjaWZpYyB2ZW5kb3IuXCIpLFxuXHRcdG9uZU9mOiBbXG5cdFx0XHRsYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyVHlwZSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0aXRlbXM6IGxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJUeXBlXG5cdFx0XHR9XG5cdFx0XVxuXHR9LFxuXHRhY3RpdmF0aW9uRXZlbnRzR2VuZXJhdG9yOiBmdW5jdGlvbiogKGNvbnRyaWJzOiByZWFkb25seSBJVXNlckZyaWVuZGx5TGFuZ3VhZ2VNb2RlbFtdKSB7XG5cdFx0Zm9yIChjb25zdCBjb250cmliIG9mIGNvbnRyaWJzKSB7XG5cdFx0XHR5aWVsZCBgb25MYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyOiR7Y29udHJpYi52ZW5kb3J9YDtcblx0XHR9XG5cdH1cbn0pO1xuXG5jb25zdCBDSEFUX01PREVMX1JFQ0VOVExZX1VTRURfU1RPUkFHRV9LRVkgPSAnY2hhdE1vZGVsUmVjZW50bHlVc2VkJztcbmNvbnN0IENIQVRfTU9ERUxfUElOTkVEX1NUT1JBR0VfS0VZID0gJ2NoYXRNb2RlbFBpbm5lZCc7XG5jb25zdCBDSEFUX01PREVMX1ZJU0lCSUxJVFlfU1RPUkFHRV9LRVkgPSAnY2hhdE1vZGVsVmlzaWJpbGl0eSc7XG5cbi8qKlxuICogVGhlIGlkZW50aWZpZXIgZm9yIHRoZSBBdXRvIG1vZGVsIHdoaWNoIGR5bmFtaWNhbGx5IHJvdXRlcyB0byB0aGUgYmVzdCBiYWNrZW5kLlxuICogQXV0byBzaG91bGQgbmV2ZXIgYXBwZWFyIGluIHVzZXItY3VyYXRlZCBsaXN0cyAoTVJVLCBwaW5uZWQpLlxuICovXG5jb25zdCBBVVRPX01PREVMX0lERU5USUZJRVIgPSAnY29waWxvdC9hdXRvJztcblxuZXhwb3J0IGZ1bmN0aW9uIGlzQXV0b0xhbmd1YWdlTW9kZWwobW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gbW9kZWw/Lm1ldGFkYXRhLmlkID09PSAnYXV0bycgfHwgbW9kZWw/LmlkZW50aWZpZXIgPT09IEFVVE9fTU9ERUxfSURFTlRJRklFUjtcbn1cblxuY29uc3QgQ0hBVF9QQVJUSUNJUEFOVF9OQU1FX1JFR0lTVFJZX1NUT1JBR0VfS0VZID0gJ2NoYXQucGFydGljaXBhbnROYW1lUmVnaXN0cnknO1xuY29uc3QgQ0hBVF9NT0RFTFNfQ09OVFJPTF9TVE9SQUdFX0tFWSA9ICdjaGF0Lm1vZGVsc0NvbnRyb2wnO1xuXG5pbnRlcmZhY2UgSUNoYXRDb250cm9sUmVzcG9uc2Uge1xuXHRyZWFkb25seSB2ZXJzaW9uOiBudW1iZXI7XG5cdHJlYWRvbmx5IHJlc3RyaWN0ZWRDaGF0UGFydGljaXBhbnRzOiB7IFtuYW1lOiBzdHJpbmddOiBzdHJpbmdbXSB9O1xuXHRyZWFkb25seSBtb2RlbHM/OiB7XG5cdFx0cmVhZG9ubHkgZnJlZT86IFJlY29yZDxzdHJpbmcsIHsgcmVhZG9ubHkgbGFiZWw6IHN0cmluZzsgcmVhZG9ubHkgZmVhdHVyZWQ/OiBib29sZWFuIH0+O1xuXHRcdHJlYWRvbmx5IHBhaWQ/OiBSZWNvcmQ8c3RyaW5nLCB7IHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7IHJlYWRvbmx5IGZlYXR1cmVkPzogYm9vbGVhbjsgcmVhZG9ubHkgbWluVlNDb2RlVmVyc2lvbj86IHN0cmluZyB9Pjtcblx0fTtcbn1cblxuLyoqXG4gKiBCdWlsZHMgdGhlIHBlci1tb2RlbCBjb25maWd1cmF0aW9uIHN1Ym1lbnUgYWN0aW9ucyBmcm9tIGEgbW9kZWwnc1xuICoge0BsaW5rIElMYW5ndWFnZU1vZGVsQ29uZmlndXJhdGlvblNjaGVtYX0uIFRoZSBjdXJyZW50IHZhbHVlIGlzIHJlYWQgZnJvbVxuICogYGN1cnJlbnRDb25maWdgIGFuZCBzZWxlY3Rpb25zIGFyZSByb3V0ZWQgdGhyb3VnaCBgc2V0VmFsdWVgLCBhbGxvd2luZyB0aGVcbiAqIGNhbGxlciB0byBkZWNpZGUgd2hldGhlciBjaGFuZ2VzIGFwcGx5IGdsb2JhbGx5IG9yIHRvIGEgcGVyLWVkaXRvciBvdmVycmlkZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1vZGVsQ29uZmlndXJhdGlvbkFjdGlvbnMoXG5cdHNjaGVtYTogSUxhbmd1YWdlTW9kZWxDb25maWd1cmF0aW9uU2NoZW1hIHwgdW5kZWZpbmVkLFxuXHRjdXJyZW50Q29uZmlnOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPixcblx0c2V0VmFsdWU6IChrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pID0+IHZvaWQsXG4pOiBJQWN0aW9uW10ge1xuXHRpZiAoIXNjaGVtYT8ucHJvcGVydGllcykge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgW2tleSwgcHJvcFNjaGVtYV0gb2YgT2JqZWN0LmVudHJpZXMoc2NoZW1hLnByb3BlcnRpZXMpKSB7XG5cdFx0aWYgKCFwcm9wU2NoZW1hLmVudW0gfHwgIUFycmF5LmlzQXJyYXkocHJvcFNjaGVtYS5lbnVtKSB8fCBwcm9wU2NoZW1hLmVudW0ubGVuZ3RoIDwgMSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGN1cnJlbnRDb25maWdba2V5XSA/PyBwcm9wU2NoZW1hLmRlZmF1bHQ7XG5cdFx0Y29uc3QgbGFiZWwgPSAodHlwZW9mIHByb3BTY2hlbWEudGl0bGUgPT09ICdzdHJpbmcnID8gcHJvcFNjaGVtYS50aXRsZSA6IHVuZGVmaW5lZClcblx0XHRcdD8/IGtleS5yZXBsYWNlKC8oW2Etel0pKFtBLVpdKS9nLCAnJDEgJDInKVxuXHRcdFx0XHQucmVwbGFjZSgvXi4vLCBzID0+IHMudG9VcHBlckNhc2UoKSk7XG5cdFx0Y29uc3QgZGVmYXVsdFZhbHVlID0gcHJvcFNjaGVtYS5kZWZhdWx0O1xuXHRcdGNvbnN0IGVudW1JdGVtTGFiZWxzID0gcHJvcFNjaGVtYS5lbnVtSXRlbUxhYmVscztcblx0XHRjb25zdCBlbnVtRGVzY3JpcHRpb25zID0gcHJvcFNjaGVtYS5lbnVtRGVzY3JpcHRpb25zO1xuXHRcdGNvbnN0IGVudW1BY3Rpb25zOiBJQWN0aW9uW10gPSBwcm9wU2NoZW1hLmVudW0ubWFwKCh2YWx1ZTogdW5rbm93biwgaW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbUxhYmVsID0gZW51bUl0ZW1MYWJlbHM/LltpbmRleF0gPz8gU3RyaW5nKHZhbHVlKTtcblx0XHRcdGNvbnN0IGRpc3BsYXlMYWJlbCA9IHZhbHVlID09PSBkZWZhdWx0VmFsdWUgPyBsb2NhbGl6ZSgnbW9kZWxzLmVudW1EZWZhdWx0JywgXCJ7MH0gKGRlZmF1bHQpXCIsIGl0ZW1MYWJlbCkgOiBpdGVtTGFiZWw7XG5cdFx0XHRjb25zdCB0b29sdGlwID0gZW51bURlc2NyaXB0aW9ucz8uW2luZGV4XSA/PyAnJztcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiBgY29uZmlndXJlTW9kZWwuJHtrZXl9LiR7dmFsdWV9YCxcblx0XHRcdFx0bGFiZWw6IGRpc3BsYXlMYWJlbCxcblx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0dG9vbHRpcCxcblx0XHRcdFx0Y2hlY2tlZDogY3VycmVudFZhbHVlID09PSB2YWx1ZSxcblx0XHRcdFx0cnVuOiAoKSA9PiBzZXRWYWx1ZShrZXksIHZhbHVlKVxuXHRcdFx0fTtcblx0XHR9KTtcblx0XHRhY3Rpb25zLnB1c2gobmV3IFN1Ym1lbnVBY3Rpb24oYGNvbmZpZ3VyZU1vZGVsLiR7a2V5fWAsIGxhYmVsLCBlbnVtQWN0aW9ucykpO1xuXHR9XG5cblx0cmV0dXJuIGFjdGlvbnM7XG59XG5cbmV4cG9ydCBjbGFzcyBMYW5ndWFnZU1vZGVsc1NlcnZpY2UgaW1wbGVtZW50cyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHN0YXRpYyBTRUNSRVRfS0VZX1BSRUZJWCA9ICdjaGF0LmxtLnNlY3JldC4nO1xuXHRwcml2YXRlIHN0YXRpYyBTRUNSRVRfSU5QVVQgPSAnJHtpbnB1dDp7MH19JztcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIElMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92ZW5kb3JzID0gbmV3IE1hcDxzdHJpbmcsIElMYW5ndWFnZU1vZGVsUHJvdmlkZXJEZXNjcmlwdG9yPigpO1xuXG5cdC8qKiBWZW5kb3JzIGZvciB3aGljaCBhIGRlcHJlY2F0aW9uIG5vdGljZSBoYXMgYWxyZWFkeSBiZWVuIHNob3duIHRoaXMgc2Vzc2lvbi4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZGVwcmVjYXRpb25Ob3RpY2VTaG93blZlbmRvcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxWZW5kb3JzID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHN0cmluZ1tdPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsVmVuZG9ycyA9IHRoaXMuX29uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbFZlbmRvcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxzR3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIElMYW5ndWFnZU1vZGVsc0dyb3VwW10+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVMTVNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXJCeUtleTxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsQ29uZmlndXJhdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc1VzZXJTZWxlY3RhYmxlTW9kZWxzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzTm9uQ29waWxvdFVzZXJTZWxlY3RhYmxlTW9kZWxzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkxhbmd1YWdlTW9kZWxDaGFuZ2UgPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsczogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uTGFuZ3VhZ2VNb2RlbENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9yZWNlbnRseVVzZWRNb2RlbElkczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBfcGlubmVkTW9kZWxJZHM6IHN0cmluZ1tdID0gW107XG5cblx0cHJpdmF0ZSBfaGlkZGVuTW9kZWxJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1vZGVsc0NvbnRyb2xNYW5pZmVzdCA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRW1pdHRlcjxJTW9kZWxzQ29udHJvbE1hbmlmZXN0PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbHNDb250cm9sTWFuaWZlc3QgPSB0aGlzLl9vbkRpZENoYW5nZU1vZGVsc0NvbnRyb2xNYW5pZmVzdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVBpbm5lZE1vZGVscyA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQaW5uZWRNb2RlbHMgPSB0aGlzLl9vbkRpZENoYW5nZVBpbm5lZE1vZGVscy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1vZGVsVmlzaWJpbGl0eSA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbFZpc2liaWxpdHkgPSB0aGlzLl9vbkRpZENoYW5nZU1vZGVsVmlzaWJpbGl0eS5ldmVudDtcblxuXHRwcml2YXRlIF9tb2RlbHNDb250cm9sTWFuaWZlc3Q6IElNb2RlbHNDb250cm9sTWFuaWZlc3QgPSB7IGZyZWU6IHt9LCBwYWlkOiB7fSB9O1xuXHRwcml2YXRlIF9tb2RlbHNDb250cm9sUmF3UmVzcG9uc2U6IElDaGF0Q29udHJvbFJlc3BvbnNlWydtb2RlbHMnXSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9jaGF0Q29udHJvbFVybDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jaGF0Q29udHJvbERpc3Bvc2VkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVzdHJpY3RlZENoYXRQYXJ0aWNpcGFudHMgPSBvYnNlcnZhYmxlVmFsdWU8eyBbbmFtZTogc3RyaW5nXTogc3RyaW5nW10gfT4odGhpcywgT2JqZWN0LmNyZWF0ZShudWxsKSk7XG5cdHJlYWRvbmx5IHJlc3RyaWN0ZWRDaGF0UGFydGljaXBhbnRzOiBJT2JzZXJ2YWJsZTx7IFtuYW1lOiBzdHJpbmddOiBzdHJpbmdbXSB9PiA9IHRoaXMuX3Jlc3RyaWN0ZWRDaGF0UGFydGljaXBhbnRzO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2VjcmV0U3RvcmFnZVNlcnZpY2U6IElTZWNyZXRTdG9yYWdlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9oYXNVc2VyU2VsZWN0YWJsZU1vZGVscyA9IENoYXRDb250ZXh0S2V5cy5sYW5ndWFnZU1vZGVsc0FyZVVzZXJTZWxlY3RhYmxlLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc05vbkNvcGlsb3RVc2VyU2VsZWN0YWJsZU1vZGVscyA9IENoYXRDb250ZXh0S2V5cy5ub25Db3BpbG90TGFuZ3VhZ2VNb2RlbHNBcmVVc2VyU2VsZWN0YWJsZS5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWNlbnRseVVzZWRNb2RlbElkcyA9IHRoaXMuX3JlYWRSZWNlbnRseVVzZWRNb2RlbHMoKTtcblx0XHR0aGlzLl9waW5uZWRNb2RlbElkcyA9IHRoaXMuX3JlYWRQaW5uZWRNb2RlbHMoKTtcblx0XHR0aGlzLl9yZWFkVmlzaWJpbGl0eSgpO1xuXHRcdHRoaXMuX2luaXRDaGF0Q29udHJvbERhdGEoKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMoKCkgPT4ge1xuXHRcdFx0bGV0IGhhc1VzZXJTZWxlY3RhYmxlID0gZmFsc2U7XG5cdFx0XHRsZXQgaGFzTm9uQ29waWxvdFVzZXJTZWxlY3RhYmxlID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIHRoaXMuX21vZGVsQ2FjaGUudmFsdWVzKCkpIHtcblx0XHRcdFx0aWYgKG1vZGVsLmlzVXNlclNlbGVjdGFibGUgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aGFzVXNlclNlbGVjdGFibGUgPSB0cnVlO1xuXHRcdFx0XHRpZiAobW9kZWwudmVuZG9yICE9PSBDT1BJTE9UX1ZFTkRPUl9JRCkge1xuXHRcdFx0XHRcdGhhc05vbkNvcGlsb3RVc2VyU2VsZWN0YWJsZSA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2hhc1VzZXJTZWxlY3RhYmxlTW9kZWxzLnNldChoYXNVc2VyU2VsZWN0YWJsZSk7XG5cdFx0XHR0aGlzLl9oYXNOb25Db3BpbG90VXNlclNlbGVjdGFibGVNb2RlbHMuc2V0KGhhc05vbkNvcGlsb3RVc2VyU2VsZWN0YWJsZSk7XG5cdFx0XHR0aGlzLl9yZWZyZXNoTW9kZWxzQ29udHJvbE1hbmlmZXN0KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbEdyb3VwcyhjaGFuZ2VkR3JvdXBzID0+IHRoaXMuX29uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbEdyb3VwcyhjaGFuZ2VkR3JvdXBzKSkpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKGxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXJFeHRlbnNpb25Qb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zLCB7IGFkZGVkLCByZW1vdmVkIH0pID0+IHtcblx0XHRcdGNvbnN0IGFkZGVkVmVuZG9yczogSVVzZXJGcmllbmRseUxhbmd1YWdlTW9kZWxbXSA9IFtdO1xuXHRcdFx0Y29uc3QgcmVtb3ZlZFZlbmRvcnM6IElVc2VyRnJpZW5kbHlMYW5ndWFnZU1vZGVsW10gPSBbXTtcblxuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgYWRkZWQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIEl0ZXJhYmxlLndyYXAoZXh0ZW5zaW9uLnZhbHVlKSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLl92ZW5kb3JzLmhhcyhpdGVtLnZlbmRvcikpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VNb2RlbHMudmVuZG9yQWxyZWFkeVJlZ2lzdGVyZWQnLCBcIlRoZSB2ZW5kb3IgJ3swfScgaXMgYWxyZWFkeSByZWdpc3RlcmVkIGFuZCBjYW5ub3QgYmUgcmVnaXN0ZXJlZCB0d2ljZVwiLCBpdGVtLnZlbmRvcikpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChpc0ZhbHN5T3JXaGl0ZXNwYWNlKGl0ZW0udmVuZG9yKSkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5sYW5ndWFnZU1vZGVscy5lbXB0eVZlbmRvcicsIFwiVGhlIHZlbmRvciBmaWVsZCBjYW5ub3QgYmUgZW1wdHkuXCIpKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaXRlbS52ZW5kb3IudHJpbSgpICE9PSBpdGVtLnZlbmRvcikge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5sYW5ndWFnZU1vZGVscy53aGl0ZXNwYWNlVmVuZG9yJywgXCJUaGUgdmVuZG9yIGZpZWxkIGNhbm5vdCBzdGFydCBvciBlbmQgd2l0aCB3aGl0ZXNwYWNlLlwiKSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YWRkZWRWZW5kb3JzLnB1c2goaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgcmVtb3ZlZCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgSXRlcmFibGUud3JhcChleHRlbnNpb24udmFsdWUpKSB7XG5cdFx0XHRcdFx0cmVtb3ZlZFZlbmRvcnMucHVzaChpdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKGFkZGVkVmVuZG9ycywgcmVtb3ZlZFZlbmRvcnMpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKGFkZGVkOiBJVXNlckZyaWVuZGx5TGFuZ3VhZ2VNb2RlbFtdLCByZW1vdmVkOiBJVXNlckZyaWVuZGx5TGFuZ3VhZ2VNb2RlbFtdKTogdm9pZCB7XG5cdFx0Y29uc3QgYWRkZWRWZW5kb3JJZHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcmVtb3ZlZFZlbmRvcklkczogc3RyaW5nW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBhZGRlZCkge1xuXHRcdFx0aWYgKHRoaXMuX3ZlbmRvcnMuaGFzKGl0ZW0udmVuZG9yKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBUaGUgdmVuZG9yICcke2l0ZW0udmVuZG9yfScgaXMgYWxyZWFkeSByZWdpc3RlcmVkIGFuZCBjYW5ub3QgYmUgcmVnaXN0ZXJlZCB0d2ljZWApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0ZhbHN5T3JXaGl0ZXNwYWNlKGl0ZW0udmVuZG9yKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdUaGUgdmVuZG9yIGZpZWxkIGNhbm5vdCBiZSBlbXB0eS4nKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXRlbS52ZW5kb3IudHJpbSgpICE9PSBpdGVtLnZlbmRvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdUaGUgdmVuZG9yIGZpZWxkIGNhbm5vdCBzdGFydCBvciBlbmQgd2l0aCB3aGl0ZXNwYWNlLicpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZlbmRvcjogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3IgPSB7XG5cdFx0XHRcdHZlbmRvcjogaXRlbS52ZW5kb3IsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBpdGVtLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiBpdGVtLmNvbmZpZ3VyYXRpb24sXG5cdFx0XHRcdG1hbmFnZW1lbnRDb21tYW5kOiBpdGVtLm1hbmFnZW1lbnRDb21tYW5kLFxuXHRcdFx0XHRkZXByZWNhdGlvbjogaXRlbS5kZXByZWNhdGlvbixcblx0XHRcdFx0d2hlbjogaXRlbS53aGVuLFxuXHRcdFx0XHRpc0RlZmF1bHQ6IGl0ZW0udmVuZG9yID09PSBDT1BJTE9UX1ZFTkRPUl9JRFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3ZlbmRvcnMuc2V0KGl0ZW0udmVuZG9yLCB2ZW5kb3IpO1xuXHRcdFx0YWRkZWRWZW5kb3JJZHMucHVzaChpdGVtLnZlbmRvcik7XG5cdFx0XHQvLyBIYXZlIHNvbWUgbW9kZWxzIHdlIHdhbnQgZnJvbSB0aGlzIHZlbmRvciwgc28gYWN0aXZhdGUgdGhlIGV4dGVuc2lvblxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiByZW1vdmVkKSB7XG5cdFx0XHR0aGlzLl92ZW5kb3JzLmRlbGV0ZShpdGVtLnZlbmRvcik7XG5cdFx0XHR0aGlzLl9wcm92aWRlcnMuZGVsZXRlKGl0ZW0udmVuZG9yKTtcblx0XHRcdHRoaXMuX2NsZWFyTW9kZWxDYWNoZShpdGVtLnZlbmRvcik7XG5cdFx0XHR0aGlzLl9tb2RlbHNHcm91cHMuZGVsZXRlKGl0ZW0udmVuZG9yKTtcblx0XHRcdHJlbW92ZWRWZW5kb3JJZHMucHVzaChpdGVtLnZlbmRvcik7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBbdmVuZG9yLCBfXSBvZiB0aGlzLl9wcm92aWRlcnMpIHtcblx0XHRcdGlmICghdGhpcy5fdmVuZG9ycy5oYXModmVuZG9yKSkge1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlcnMuZGVsZXRlKHZlbmRvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGFkZGVkVmVuZG9ySWRzLmxlbmd0aCA+IDAgfHwgcmVtb3ZlZFZlbmRvcklkcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxWZW5kb3JzLmZpcmUoWy4uLmFkZGVkVmVuZG9ySWRzLCAuLi5yZW1vdmVkVmVuZG9ySWRzXSk7XG5cdFx0XHRpZiAocmVtb3ZlZFZlbmRvcklkcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdmVuZG9yIG9mIHJlbW92ZWRWZW5kb3JJZHMpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkxhbmd1YWdlTW9kZWxDaGFuZ2UuZmlyZSh2ZW5kb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsR3JvdXBzKGNoYW5nZWRHcm91cHM6IHJlYWRvbmx5IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYW5nZWRWZW5kb3JzID0gbmV3IFNldChjaGFuZ2VkR3JvdXBzLm1hcChnID0+IGcudmVuZG9yKSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoQXJyYXkuZnJvbShjaGFuZ2VkVmVuZG9ycykubWFwKHZlbmRvciA9PiB0aGlzLl9yZXNvbHZlQWxsTGFuZ3VhZ2VNb2RlbHModmVuZG9yLCB0cnVlKSkpO1xuXHR9XG5cblx0Z2V0VmVuZG9ycygpOiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvcltdIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLl92ZW5kb3JzLnZhbHVlcygpKVxuXHRcdFx0LmZpbHRlcih2ZW5kb3IgPT4ge1xuXHRcdFx0XHRpZiAoIXZlbmRvci53aGVuKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7IC8vIE5vIHdoZW4gY2xhdXNlIG1lYW5zIGFsd2F5cyB2aXNpYmxlXG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgd2hlbkNsYXVzZSA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKHZlbmRvci53aGVuKTtcblx0XHRcdFx0cmV0dXJuIHdoZW5DbGF1c2UgPyB0aGlzLl9jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHdoZW5DbGF1c2UpIDogZmFsc2U7XG5cdFx0XHR9KTtcblx0fVxuXG5cdGdldExhbmd1YWdlTW9kZWxJZHMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX21vZGVsQ2FjaGUua2V5cygpKTtcblx0fVxuXG5cdGxvb2t1cExhbmd1YWdlTW9kZWwobW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsQ2FjaGUuZ2V0KG1vZGVsSWRlbnRpZmllcik7XG5cdH1cblxuXHRsb29rdXBMYW5ndWFnZU1vZGVsQnlRdWFsaWZpZWROYW1lKHJlZmVyZW5jZU5hbWU6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBbaWRlbnRpZmllciwgbW9kZWxdIG9mIHRoaXMuX21vZGVsQ2FjaGUuZW50cmllcygpKSB7XG5cdFx0XHRpZiAoSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEubWF0Y2hlc1F1YWxpZmllZE5hbWUocmVmZXJlbmNlTmFtZSwgbW9kZWwpKSB7XG5cdFx0XHRcdHJldHVybiB7IG1ldGFkYXRhOiBtb2RlbCwgaWRlbnRpZmllciB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUFsbExhbmd1YWdlTW9kZWxzKHZlbmRvcklkOiBzdHJpbmcsIHNpbGVudDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgdmVuZG9yID0gdGhpcy5fdmVuZG9ycy5nZXQodmVuZG9ySWQpO1xuXG5cdFx0aWYgKCF2ZW5kb3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiBhIHByb3ZpZGVyIGlzIGFscmVhZHkgcmVnaXN0ZXJlZCAoZS5nLiBhIHJlbmRlcmVyLXNpZGUgcHJvdmlkZXJcblx0XHQvLyBzdWNoIGFzIHRoZSBhZ2VudCBob3N0KSwgc2tpcCB0aGUgYWN0aXZhdGlvbiB3YWl0IFx1MjAxNCB0aGVyZSdzIG5vdGhpbmdcblx0XHQvLyBtb3JlIGZvciBhbiBleHRlbnNpb24gdG8gY29udHJpYnV0ZSwgYW5kIHdhaXRpbmcgd291bGQgYmxvY2sgb25cblx0XHQvLyBleHRlbnNpb24gaG9zdCBzdGFydHVwIHVubmVjZXNzYXJpbHkuXG5cdFx0bGV0IHByb3ZpZGVyID0gdGhpcy5fcHJvdmlkZXJzLmdldCh2ZW5kb3JJZCk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0Ly8gQWN0aXZhdGUgZXh0ZW5zaW9ucyBiZWZvcmUgcmVxdWVzdGluZyB0byByZXNvbHZlIHRoZSBtb2RlbHNcblx0XHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvbkxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXI6JHt2ZW5kb3JJZH1gKTtcblx0XHRcdHByb3ZpZGVyID0gdGhpcy5fcHJvdmlkZXJzLmdldCh2ZW5kb3JJZCk7XG5cdFx0fVxuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0xNXSBObyBwcm92aWRlciByZWdpc3RlcmVkIGZvciB2ZW5kb3IgJHt2ZW5kb3JJZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZUxNU2VxdWVuY2VyLnF1ZXVlKHZlbmRvcklkLCBhc3luYyAoKSA9PiB7XG5cblx0XHRcdGNvbnN0IGFsbE1vZGVsczogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10gPSBbXTtcblx0XHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzR3JvdXBzOiBJTGFuZ3VhZ2VNb2RlbHNHcm91cFtdID0gW107XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVscyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVMYW5ndWFnZU1vZGVsQ2hhdEluZm8oeyBzaWxlbnQgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGlmIChtb2RlbHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0YWxsTW9kZWxzLnB1c2goLi4ubW9kZWxzKTtcblx0XHRcdFx0XHRjb25zdCBtb2RlbElkZW50aWZpZXJzID0gW107XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBtIG9mIG1vZGVscykge1xuXHRcdFx0XHRcdFx0aWYgKHZlbmRvci5pc0RlZmF1bHQpIHtcblx0XHRcdFx0XHRcdFx0Ly8gU3BlY2lhbCBjYXNlIGZvciBjb3BpbG90IG1vZGVscyAtIHRoZXkgYXJlIGFsbCB1c2VyIHNlbGVjdGFibGUgdW5sZXNzIG1hcmtlZCBvdGhlcndpc2Vcblx0XHRcdFx0XHRcdFx0aWYgKG0ubWV0YWRhdGEuaXNVc2VyU2VsZWN0YWJsZSAhPT0gZmFsc2UpIHtcblx0XHRcdFx0XHRcdFx0XHRtb2RlbElkZW50aWZpZXJzLnB1c2gobS5pZGVudGlmaWVyKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbTE1dIFNraXBwaW5nIG1vZGVsICR7bS5pZGVudGlmaWVyfSBmcm9tIG1vZGVsIHBpY2tlciBhcyBpdCBpcyBub3QgdXNlciBzZWxlY3RhYmxlLmApO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRtb2RlbElkZW50aWZpZXJzLnB1c2gobS5pZGVudGlmaWVyKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGFuZ3VhZ2VNb2RlbHNHcm91cHMucHVzaCh7IG1vZGVsSWRlbnRpZmllcnMgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGxhbmd1YWdlTW9kZWxzR3JvdXBzLnB1c2goe1xuXHRcdFx0XHRcdG1vZGVsSWRlbnRpZmllcnM6IFtdLFxuXHRcdFx0XHRcdHN0YXR1czoge1xuXHRcdFx0XHRcdFx0bWVzc2FnZTogZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSxcblx0XHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvclxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGdyb3VwcyA9IHRoaXMuX2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcygpO1xuXHRcdFx0Y29uc3QgcGVyTW9kZWxDb25maWd1cmF0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPj4oKTtcblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cdFx0XHRcdGlmIChncm91cC52ZW5kb3IgIT09IHZlbmRvcklkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBGb3IgdmVuZG9ycyB3aXRob3V0IGEgY29uZmlndXJhdGlvbiBzY2hlbWEgd2hvc2UgbW9kZWxzIHdlcmUgYWxyZWFkeVxuXHRcdFx0XHQvLyByZXNvbHZlZCBpbiB0aGUgaW5pdGlhbCAoZ3JvdXBsZXNzKSBsb2FkLCBncm91cHMgb25seSBjYXJyeSBwZXItbW9kZWxcblx0XHRcdFx0Ly8gc2V0dGluZ3MgYW5kIHNob3VsZCBub3QgdHJpZ2dlciBhIHNlcGFyYXRlIG1vZGVsIHJlc29sdXRpb24gY2FsbC5cblx0XHRcdFx0Ly8gSW5zdGVhZCwgYXBwbHkgdGhlIHBlci1tb2RlbCBjb25maWcgdG8gdGhlIGFscmVhZHktcmVzb2x2ZWQgbW9kZWxzLlxuXHRcdFx0XHRpZiAoIXZlbmRvci5jb25maWd1cmF0aW9uICYmIGFsbE1vZGVscy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0aWYgKGdyb3VwLnNldHRpbmdzKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIGFsbE1vZGVscykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBtb2RlbENvbmZpZyA9IGdyb3VwLnNldHRpbmdzW21vZGVsLm1ldGFkYXRhLmlkXTtcblx0XHRcdFx0XHRcdFx0aWYgKG1vZGVsQ29uZmlnKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gU3RvcmUgcmF3IGNvbmZpZyAod2l0aG91dCByZXNvbHZpbmcgc2VjcmV0cykgdG8gYXZvaWQgbGVha2luZyBzZWNyZXRzIG9uIHBlcnNpc3Rcblx0XHRcdFx0XHRcdFx0XHRwZXJNb2RlbENvbmZpZ3VyYXRpb25zLnNldChtb2RlbC5pZGVudGlmaWVyLCB7IC4uLm1vZGVsQ29uZmlnIH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxhbmd1YWdlTW9kZWxzR3JvdXBzLnB1c2goeyBncm91cCwgbW9kZWxJZGVudGlmaWVyczogW10gfSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUNvbmZpZ3VyYXRpb24oZ3JvdXAsIHZlbmRvci5jb25maWd1cmF0aW9uKTtcblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVscyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVMYW5ndWFnZU1vZGVsQ2hhdEluZm8oeyBncm91cDogZ3JvdXAubmFtZSwgc2lsZW50LCBjb25maWd1cmF0aW9uIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRcdGlmIChtb2RlbHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHQvLyBQcm92aWRlIGEgc2Vuc2libGUgZGVmYXVsdCBmb3IgYG1ldGFkYXRhLmRldGFpbGAgc28gdGhhdFxuXHRcdFx0XHRcdFx0Ly8gbXVsdGlwbGUgaW5zdGFuY2VzIG9mIHRoZSBzYW1lIHZlbmRvciAoZS5nLiBtdWx0aXBsZVxuXHRcdFx0XHRcdFx0Ly8gT2xsYW1hIHNlcnZlcnMpIGFyZSBkaXN0aW5ndWlzaGFibGUgaW4gdGhlIG1vZGVsIHBpY2tlci5cblx0XHRcdFx0XHRcdC8vIFByb3ZpZGVycyB0aGF0IHN1cHBseSB0aGVpciBvd24gYGRldGFpbGAga2VlcCBpdDsgd2hlblxuXHRcdFx0XHRcdFx0Ly8gdGhlIHByb3ZpZGVyIGRvZXMgbm90IHNldCBvbmUsIGZhbGwgYmFjayB0byB0aGUgdXNlci1cblx0XHRcdFx0XHRcdC8vIGNvbmZpZ3VyZWQgZ3JvdXAgbmFtZS5cblx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbW9kZWxzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghbW9kZWxzW2ldLm1ldGFkYXRhLmRldGFpbCkge1xuXHRcdFx0XHRcdFx0XHRcdG1vZGVsc1tpXSA9IHsgLi4ubW9kZWxzW2ldLCBtZXRhZGF0YTogeyAuLi5tb2RlbHNbaV0ubWV0YWRhdGEsIGRldGFpbDogZ3JvdXAubmFtZSB9IH07XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGFsbE1vZGVscy5wdXNoKC4uLm1vZGVscyk7XG5cdFx0XHRcdFx0XHRsYW5ndWFnZU1vZGVsc0dyb3Vwcy5wdXNoKHsgZ3JvdXAsIG1vZGVsSWRlbnRpZmllcnM6IG1vZGVscy5tYXAobSA9PiBtLmlkZW50aWZpZXIpIH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIENvbGxlY3QgcGVyLW1vZGVsIGNvbmZpZ3VyYXRpb25zIGZyb20gdGhlIGdyb3VwXG5cdFx0XHRcdFx0aWYgKGdyb3VwLnNldHRpbmdzKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIG1vZGVscykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBtb2RlbENvbmZpZyA9IGdyb3VwLnNldHRpbmdzW21vZGVsLm1ldGFkYXRhLmlkXTtcblx0XHRcdFx0XHRcdFx0aWYgKG1vZGVsQ29uZmlnKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gU3RvcmUgcmF3IGNvbmZpZyAod2l0aG91dCByZXNvbHZpbmcgc2VjcmV0cykgdG8gYXZvaWQgbGVha2luZyBzZWNyZXRzIG9uIHBlcnNpc3Rcblx0XHRcdFx0XHRcdFx0XHRwZXJNb2RlbENvbmZpZ3VyYXRpb25zLnNldChtb2RlbC5pZGVudGlmaWVyLCB7IC4uLm1vZGVsQ29uZmlnIH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGxhbmd1YWdlTW9kZWxzR3JvdXBzLnB1c2goe1xuXHRcdFx0XHRcdFx0Z3JvdXAsXG5cdFx0XHRcdFx0XHRtb2RlbElkZW50aWZpZXJzOiBbXSxcblx0XHRcdFx0XHRcdHN0YXR1czoge1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpLFxuXHRcdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3Jcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB3YXNSZXNvbHZlZCA9IHRoaXMuX21vZGVsc0dyb3Vwcy5oYXModmVuZG9ySWQpO1xuXHRcdFx0Y29uc3Qgb2xkR3JvdXBzID0gdGhpcy5fbW9kZWxzR3JvdXBzLmdldCh2ZW5kb3JJZCkgPz8gW107XG5cdFx0XHR0aGlzLl9tb2RlbHNHcm91cHMuc2V0KHZlbmRvcklkLCBsYW5ndWFnZU1vZGVsc0dyb3Vwcyk7XG5cdFx0XHRjb25zdCBvbGRNb2RlbHMgPSB0aGlzLl9jbGVhck1vZGVsQ2FjaGUodmVuZG9ySWQpO1xuXHRcdFx0bGV0IGhhc0NoYW5nZXMgPSAhd2FzUmVzb2x2ZWQ7XG5cdFx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIGFsbE1vZGVscykge1xuXHRcdFx0XHRpZiAodGhpcy5fbW9kZWxDYWNoZS5oYXMobW9kZWwuaWRlbnRpZmllcikpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtMTV0gTW9kZWwgJHttb2RlbC5pZGVudGlmaWVyfSBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQuIFNraXBwaW5nLmApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX21vZGVsQ2FjaGUuc2V0KG1vZGVsLmlkZW50aWZpZXIsIG1vZGVsLm1ldGFkYXRhKTtcblx0XHRcdFx0aGFzQ2hhbmdlcyA9IGhhc0NoYW5nZXMgfHwgIWVxdWFscyhvbGRNb2RlbHMuZ2V0KG1vZGVsLmlkZW50aWZpZXIpLCBtb2RlbC5tZXRhZGF0YSk7XG5cdFx0XHRcdG9sZE1vZGVscy5kZWxldGUobW9kZWwuaWRlbnRpZmllcik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbTE1dIFJlc29sdmVkIGxhbmd1YWdlIG1vZGVscyBmb3IgdmVuZG9yICR7dmVuZG9ySWR9YCwgYWxsTW9kZWxzKTtcblx0XHRcdGhhc0NoYW5nZXMgPSBoYXNDaGFuZ2VzIHx8IG9sZE1vZGVscy5zaXplID4gMDtcblxuXHRcdFx0Ly8gQWxzbyBkZXRlY3QgZ3JvdXAgc3RydWN0dXJlIGNoYW5nZXMgKGFkZGVkL3JlbW92ZWQgZ3JvdXBzLCBzdGF0dXMgY2hhbmdlcylcblx0XHRcdC8vIHNvIHRoZSBVSSB1cGRhdGVzIGV2ZW4gd2hlbiBpbmRpdmlkdWFsIG1vZGVscyBoYXZlbid0IGNoYW5nZWRcblx0XHRcdGlmICghaGFzQ2hhbmdlcykge1xuXHRcdFx0XHRoYXNDaGFuZ2VzID0gdGhpcy5faGFzR3JvdXBTdHJ1Y3R1cmVDaGFuZ2VkKG9sZEdyb3VwcywgbGFuZ3VhZ2VNb2RlbHNHcm91cHMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBVcGRhdGUgcGVyLW1vZGVsIGNvbmZpZ3VyYXRpb25zIGZvciB0aGlzIHZlbmRvclxuXHRcdFx0dGhpcy5fY2xlYXJNb2RlbENvbmZpZ3VyYXRpb25zKHZlbmRvcklkKTtcblx0XHRcdGZvciAoY29uc3QgW2lkZW50aWZpZXIsIGNvbmZpZ10gb2YgcGVyTW9kZWxDb25maWd1cmF0aW9ucykge1xuXHRcdFx0XHRpZiAodGhpcy5fbW9kZWxDYWNoZS5oYXMoaWRlbnRpZmllcikpIHtcblx0XHRcdFx0XHR0aGlzLl9tb2RlbENvbmZpZ3VyYXRpb25zLnNldChpZGVudGlmaWVyLCBjb25maWcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChoYXNDaGFuZ2VzKSB7XG5cdFx0XHRcdHRoaXMuX29uTGFuZ3VhZ2VNb2RlbENoYW5nZS5maXJlKHZlbmRvcklkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtMTV0gTm8gY2hhbmdlcyBpbiBsYW5ndWFnZSBtb2RlbHMgZm9yIHZlbmRvciAke3ZlbmRvcklkfWApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFzR3JvdXBTdHJ1Y3R1cmVDaGFuZ2VkKG9sZEdyb3VwczogcmVhZG9ubHkgSUxhbmd1YWdlTW9kZWxzR3JvdXBbXSwgbmV3R3JvdXBzOiByZWFkb25seSBJTGFuZ3VhZ2VNb2RlbHNHcm91cFtdKTogYm9vbGVhbiB7XG5cdFx0aWYgKG9sZEdyb3Vwcy5sZW5ndGggIT09IG5ld0dyb3Vwcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG9sZEdyb3Vwcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3Qgb2xkR3JvdXAgPSBvbGRHcm91cHNbaV07XG5cdFx0XHRjb25zdCBuZXdHcm91cCA9IG5ld0dyb3Vwc1tpXTtcblx0XHRcdGlmIChvbGRHcm91cC5ncm91cD8ubmFtZSAhPT0gbmV3R3JvdXAuZ3JvdXA/Lm5hbWVcblx0XHRcdFx0fHwgb2xkR3JvdXAuZ3JvdXA/LnZlbmRvciAhPT0gbmV3R3JvdXAuZ3JvdXA/LnZlbmRvclxuXHRcdFx0XHR8fCBvbGRHcm91cC5zdGF0dXM/Lm1lc3NhZ2UgIT09IG5ld0dyb3VwLnN0YXR1cz8ubWVzc2FnZVxuXHRcdFx0XHR8fCBvbGRHcm91cC5zdGF0dXM/LnNldmVyaXR5ICE9PSBuZXdHcm91cC5zdGF0dXM/LnNldmVyaXR5XG5cdFx0XHRcdHx8IG9sZEdyb3VwLm1vZGVsSWRlbnRpZmllcnMubGVuZ3RoICE9PSBuZXdHcm91cC5tb2RlbElkZW50aWZpZXJzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Z2V0TGFuZ3VhZ2VNb2RlbEdyb3Vwcyh2ZW5kb3I6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsc0dyb3VwW10ge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbHNHcm91cHMuZ2V0KHZlbmRvcikgPz8gW107XG5cdH1cblxuXHRoYXNSZXNvbHZlZFZlbmRvcih2ZW5kb3I6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbHNHcm91cHMuaGFzKHZlbmRvcik7XG5cdH1cblxuXHRhc3luYyBzZWxlY3RMYW5ndWFnZU1vZGVscyhzZWxlY3RvcjogSUxhbmd1YWdlTW9kZWxDaGF0U2VsZWN0b3IpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cblx0XHRpZiAoc2VsZWN0b3IudmVuZG9yKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZXNvbHZlQWxsTGFuZ3VhZ2VNb2RlbHMoc2VsZWN0b3IudmVuZG9yLCB0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgYWxsVmVuZG9ycyA9IEFycmF5LmZyb20odGhpcy5fdmVuZG9ycy5rZXlzKCkpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoYWxsVmVuZG9ycy5tYXAodmVuZG9yID0+IHRoaXMuX3Jlc29sdmVBbGxMYW5ndWFnZU1vZGVscyh2ZW5kb3IsIHRydWUpKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBbaW50ZXJuYWxNb2RlbElkZW50aWZpZXIsIG1vZGVsXSBvZiB0aGlzLl9tb2RlbENhY2hlKSB7XG5cdFx0XHRpZiAoKHNlbGVjdG9yLnZlbmRvciA9PT0gdW5kZWZpbmVkIHx8IG1vZGVsLnZlbmRvciA9PT0gc2VsZWN0b3IudmVuZG9yKVxuXHRcdFx0XHQmJiAoc2VsZWN0b3IuZmFtaWx5ID09PSB1bmRlZmluZWQgfHwgbW9kZWwuZmFtaWx5ID09PSBzZWxlY3Rvci5mYW1pbHkpXG5cdFx0XHRcdCYmIChzZWxlY3Rvci52ZXJzaW9uID09PSB1bmRlZmluZWQgfHwgbW9kZWwudmVyc2lvbiA9PT0gc2VsZWN0b3IudmVyc2lvbilcblx0XHRcdFx0JiYgKHNlbGVjdG9yLmlkID09PSB1bmRlZmluZWQgfHwgbW9kZWwuaWQgPT09IHNlbGVjdG9yLmlkKSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChpbnRlcm5hbE1vZGVsSWRlbnRpZmllcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW0xNXSBzZWxlY3RlZCBsYW5ndWFnZSBtb2RlbHMnLCBzZWxlY3RvciwgcmVzdWx0KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRyZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcih2ZW5kb3I6IHN0cmluZywgcHJvdmlkZXI6IElMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tMTV0gcmVnaXN0ZXJpbmcgbGFuZ3VhZ2UgbW9kZWwgcHJvdmlkZXInLCB2ZW5kb3IsIHByb3ZpZGVyKTtcblxuXHRcdGlmICghdGhpcy5fdmVuZG9ycy5oYXModmVuZG9yKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDaGF0IG1vZGVsIHByb3ZpZGVyIHVzZXMgVU5LTk9XTiB2ZW5kb3IgJHt2ZW5kb3J9LmApO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fcHJvdmlkZXJzLmhhcyh2ZW5kb3IpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENoYXQgbW9kZWwgcHJvdmlkZXIgZm9yIHZlbmRvciAke3ZlbmRvcn0gaXMgYWxyZWFkeSByZWdpc3RlcmVkLmApO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Byb3ZpZGVycy5zZXQodmVuZG9yLCBwcm92aWRlcik7XG5cblx0XHRjb25zdCBtb2RlbENoYW5nZUxpc3RlbmVyID0gcHJvdmlkZXIub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVzb2x2ZUFsbExhbmd1YWdlTW9kZWxzKHZlbmRvciwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tMTV0gVU5yZWdpc3RlcmVkIGxhbmd1YWdlIG1vZGVsIHByb3ZpZGVyJywgdmVuZG9yKTtcblx0XHRcdHRoaXMuX2NsZWFyTW9kZWxDYWNoZSh2ZW5kb3IpO1xuXHRcdFx0dGhpcy5fbW9kZWxzR3JvdXBzLmRlbGV0ZSh2ZW5kb3IpO1xuXHRcdFx0dGhpcy5fcHJvdmlkZXJzLmRlbGV0ZSh2ZW5kb3IpO1xuXHRcdFx0bW9kZWxDaGFuZ2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBzZW5kQ2hhdFJlcXVlc3QobW9kZWxJZDogc3RyaW5nLCBmcm9tOiBFeHRlbnNpb25JZGVudGlmaWVyIHwgdW5kZWZpbmVkLCBtZXNzYWdlczogSUNoYXRNZXNzYWdlW10sIG9wdGlvbnM6IElMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElMYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlPiB7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLl9tb2RlbENhY2hlLmdldChtb2RlbElkKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3Byb3ZpZGVycy5nZXQobWV0YWRhdGE/LnZlbmRvciB8fCAnJyk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDaGF0IHByb3ZpZGVyIGZvciBtb2RlbCAke21vZGVsSWR9IGlzIG5vdCByZWdpc3RlcmVkLmApO1xuXHRcdH1cblx0XHRpZiAobWV0YWRhdGEpIHtcblx0XHRcdHRoaXMuX2xvZ1Byb3ZpZGVyVXNhZ2VUZWxlbWV0cnkobWV0YWRhdGEpO1xuXHRcdFx0dGhpcy5fbWF5YmVTaG93UHJvdmlkZXJEZXByZWNhdGlvbk5vdGljZShtZXRhZGF0YSk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB0aGlzLmdldE1vZGVsQ29uZmlndXJhdGlvbihtb2RlbElkKTtcblx0XHRjb25zdCBtZXJnZWRPcHRpb25zID0gY29uZmlndXJhdGlvbiA/IHsgLi4ub3B0aW9ucywgY29uZmlndXJhdGlvbjogeyAuLi5jb25maWd1cmF0aW9uLCAuLi5vcHRpb25zLmNvbmZpZ3VyYXRpb24gfSB9IDogb3B0aW9ucztcblx0XHRyZXR1cm4gcHJvdmlkZXIuc2VuZENoYXRSZXF1ZXN0KG1vZGVsSWQsIG1lc3NhZ2VzLCBmcm9tLCBtZXJnZWRPcHRpb25zLCB0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogV2hlbiBhIGNoYXQgcmVxdWVzdCBpcyBtYWRlIGFnYWluc3QgYSBkZXByZWNhdGVkIHByb3ZpZGVyIChvbmUgdGhhdCBjb250cmlidXRlcyBhXG5cdCAqIGBkZXByZWNhdGlvbi5saW5rYCksIHByb21wdCB0aGUgdXNlciBvbmNlIHBlciBzZXNzaW9uIHRvIGluc3RhbGwgdGhlIHJlcGxhY2VtZW50XG5cdCAqIGV4dGVuc2lvbi4gVGhlIG5vdGlmaWNhdGlvbiBjYW4gYmUgZGlzbWlzc2VkLCBhbmQgb2ZmZXJzIGEgXCJEb24ndCBTaG93IEFnYWluXCIgY2hvaWNlIHRoYXRcblx0ICogaXMgcGVyc2lzdGVkIGFjcm9zcyBzZXNzaW9ucyB2aWEgdGhlIG5vdGlmaWNhdGlvbiBzZXJ2aWNlJ3MgYG5ldmVyU2hvd0FnYWluYCBzdXBwb3J0LlxuXHQgKi9cblx0cHJpdmF0ZSBfbWF5YmVTaG93UHJvdmlkZXJEZXByZWNhdGlvbk5vdGljZShtZXRhZGF0YTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEpOiB2b2lkIHtcblx0XHRjb25zdCB2ZW5kb3IgPSB0aGlzLl92ZW5kb3JzLmdldChtZXRhZGF0YS52ZW5kb3IpO1xuXHRcdGNvbnN0IGxpbmsgPSB2ZW5kb3I/LmRlcHJlY2F0aW9uPy5saW5rO1xuXHRcdGlmICghbGluaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZGVwcmVjYXRpb25Ob3RpY2VTaG93blZlbmRvcnMuaGFzKG1ldGFkYXRhLnZlbmRvcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGVwcmVjYXRpb25Ob3RpY2VTaG93blZlbmRvcnMuYWRkKG1ldGFkYXRhLnZlbmRvcik7XG5cblx0XHRjb25zdCBwcm92aWRlck5hbWUgPSAodmVuZG9yLmRpc3BsYXlOYW1lIHx8IG1ldGFkYXRhLnZlbmRvcikucmVwbGFjZSgvXFxzKlxcKGRlcHJlY2F0ZWRcXClcXHMqJC9pLCAnJyk7XG5cdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRTZXZlcml0eS5JbmZvLFxuXHRcdFx0bG9jYWxpemUoJ2NoYXQucHJvdmlkZXJEZXByZWNhdGlvbi5tZXNzYWdlJywgXCJUaGUgaW50ZXJuYWwgezB9IGxhbmd1YWdlIG1vZGVsIHByb3ZpZGVyIGlzIGJlaW5nIGRlcHJlY2F0ZWQuIFBsZWFzZSBtaWdyYXRlIHRvIHRoZSBvZmZpY2lhbCBleHRlbnNpb24uXCIsIHByb3ZpZGVyTmFtZSksXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXQucHJvdmlkZXJEZXByZWNhdGlvbi5pbnN0YWxsJywgXCJJbnN0YWxsIEV4dGVuc2lvblwiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiB7IHRoaXMuX29wZW5lclNlcnZpY2Uub3BlbihyZXNvbHZlUHJvdmlkZXJEZXByZWNhdGlvbkxpbmsobGluaywgdGhpcy5fcHJvZHVjdFNlcnZpY2UudXJsUHJvdG9jb2wpKTsgfVxuXHRcdFx0fV0sXG5cdFx0XHR7XG5cdFx0XHRcdG5ldmVyU2hvd0FnYWluOiB7IGlkOiBgY2hhdC5wcm92aWRlckRlcHJlY2F0aW9uLiR7bWV0YWRhdGEudmVuZG9yfWAsIHNjb3BlOiBOZXZlclNob3dBZ2FpblNjb3BlLkFQUExJQ0FUSU9OIH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlcG9ydHMgd2hpY2ggaW4tYnVpbHQgQllPSyBwcm92aWRlciAob3IgdGhpcmQtcGFydHkgZXh0ZW5zaW9uKSBiYWNrcyBhIG1vZGVsIHJlcXVlc3QuIEZpcnN0LXBhcnR5XG5cdCAqIENvcGlsb3QgbW9kZWxzIGFyZSBpbnRlbnRpb25hbGx5IG5vdCByZXBvcnRlZCBoZXJlIChzZWUge0BsaW5rIGdldEJ5b2tQcm92aWRlclRlbGVtZXRyeU5hbWV9KS5cblx0ICovXG5cdHByaXZhdGUgX2xvZ1Byb3ZpZGVyVXNhZ2VUZWxlbWV0cnkobWV0YWRhdGE6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBnZXRCeW9rUHJvdmlkZXJUZWxlbWV0cnlOYW1lKG1ldGFkYXRhPy52ZW5kb3IsIG1ldGFkYXRhPy5leHRlbnNpb24pO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHlwZSBMYW5ndWFnZU1vZGVsUmVxdWVzdEV2ZW50ID0ge1xuXHRcdFx0cHJvdmlkZXI6IHN0cmluZztcblx0XHRcdGlzQllPSzogYm9vbGVhbjtcblx0XHR9O1xuXHRcdHR5cGUgTGFuZ3VhZ2VNb2RlbFJlcXVlc3RDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdHByb3ZpZGVyOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnTm9ybWFsaXplZCBub24tQ29waWxvdCBtb2RlbCBwcm92aWRlcjogYW4gaW4tYnVpbHQgQllPSyB2ZW5kb3IgaWQgKGZvciBtb2RlbHMgY29udHJpYnV0ZWQgYnkgdGhlIGJ1aWx0LWluIENvcGlsb3QgZXh0ZW5zaW9ucykgb3IgXCIzcC1leHRlbnNpb25cIiBmb3IgYW55IHRoaXJkLXBhcnR5IGV4dGVuc2lvbiBwcm92aWRlci4nIH07XG5cdFx0XHRpc0JZT0s6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBtb2RlbCBpcyBhIEJZT0sgbW9kZWwuJyB9O1xuXHRcdFx0b3duZXI6ICd2cml0YW50MjQnO1xuXHRcdFx0Y29tbWVudDogJ1RyYWNrcyB3aGljaCBub24tQ29waWxvdCBsYW5ndWFnZS1tb2RlbCBwcm92aWRlciBpcyB1c2VkIHBlciByZXF1ZXN0IHRvIHVuZGVyc3RhbmQgYWRvcHRpb24gb2YgaW4tYnVpbHQgQ29waWxvdCBCWU9LIHByb3ZpZGVycyB2cyB0aGlyZC1wYXJ0eSBleHRlbnNpb24gcHJvdmlkZXJzLic7XG5cdFx0fTtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8TGFuZ3VhZ2VNb2RlbFJlcXVlc3RFdmVudCwgTGFuZ3VhZ2VNb2RlbFJlcXVlc3RDbGFzc2lmaWNhdGlvbj4oJ2NoYXQubGFuZ3VhZ2VNb2RlbFJlcXVlc3QnLCB7XG5cdFx0XHRwcm92aWRlcixcblx0XHRcdGlzQllPSzogISFtZXRhZGF0YT8uaXNCWU9LLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZU1vZGVsQ29uZmlndXJhdGlvbldpdGhEZWZhdWx0cyhtb2RlbElkOiBzdHJpbmcsIG1ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB8IHVuZGVmaW5lZCk6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB1c2VyQ29uZmlnID0gdGhpcy5fbW9kZWxDb25maWd1cmF0aW9ucy5nZXQobW9kZWxJZCk7XG5cdFx0Y29uc3Qgc2NoZW1hID0gbWV0YWRhdGE/LmNvbmZpZ3VyYXRpb25TY2hlbWE7XG5cblx0XHRpZiAoIXNjaGVtYT8ucHJvcGVydGllcyAmJiAhdXNlckNvbmZpZykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBTdGFydCB3aXRoIHNjaGVtYSBkZWZhdWx0c1xuXHRcdGNvbnN0IGRlZmF1bHRzOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiA9IHt9O1xuXHRcdGlmIChzY2hlbWE/LnByb3BlcnRpZXMpIHtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgcHJvcFNjaGVtYV0gb2YgT2JqZWN0LmVudHJpZXMoc2NoZW1hLnByb3BlcnRpZXMpKSB7XG5cdFx0XHRcdGlmIChwcm9wU2NoZW1hLmRlZmF1bHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGRlZmF1bHRzW2tleV0gPSBwcm9wU2NoZW1hLmRlZmF1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXVzZXJDb25maWcgJiYgT2JqZWN0LmtleXMoZGVmYXVsdHMpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBVc2VyIGNvbmZpZyBvdmVycmlkZXMgZGVmYXVsdHNcblx0XHRyZXR1cm4geyAuLi5kZWZhdWx0cywgLi4udXNlckNvbmZpZyB9O1xuXHR9XG5cblx0Y29tcHV0ZVRva2VuTGVuZ3RoKG1vZGVsSWQ6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nIHwgSUNoYXRNZXNzYWdlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWxDYWNoZS5nZXQobW9kZWxJZCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDaGF0IG1vZGVsICR7bW9kZWxJZH0gY291bGQgbm90IGJlIGZvdW5kLmApO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3Byb3ZpZGVycy5nZXQobW9kZWwudmVuZG9yKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENoYXQgcHJvdmlkZXIgZm9yIG1vZGVsICR7bW9kZWxJZH0gaXMgbm90IHJlZ2lzdGVyZWQuYCk7XG5cdFx0fVxuXHRcdHJldHVybiBwcm92aWRlci5wcm92aWRlVG9rZW5Db3VudChtb2RlbElkLCBtZXNzYWdlLCB0b2tlbik7XG5cdH1cblxuXHRnZXRNb2RlbENvbmZpZ3VyYXRpb24obW9kZWxJZDogc3RyaW5nKTogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fbW9kZWxDYWNoZS5nZXQobW9kZWxJZCk7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVNb2RlbENvbmZpZ3VyYXRpb25XaXRoRGVmYXVsdHMobW9kZWxJZCwgbWV0YWRhdGEpO1xuXHR9XG5cblx0YXN5bmMgc2V0TW9kZWxDb25maWd1cmF0aW9uKG1vZGVsSWQ6IHN0cmluZywgdmFsdWVzOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fbW9kZWxDYWNoZS5nZXQobW9kZWxJZCk7XG5cdFx0aWYgKCFtZXRhZGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEZpbmQgdGhlIGdyb3VwIGZyb20gdGhlIGNvbmZpZ3VyYXRpb24gc2VydmljZSAoc291cmNlIG9mIHRydXRoKVxuXHRcdGNvbnN0IGFsbEdyb3VwcyA9IHRoaXMuX2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcygpO1xuXHRcdGxldCBncm91cDogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIEZpcnN0IHRyeSB0byBmaW5kIGEgZ3JvdXAgdGhhdCBhbHJlYWR5IGhhcyBjb25maWcgZm9yIHRoaXMgbW9kZWwuXG5cdFx0Z3JvdXAgPSBhbGxHcm91cHMuZmluZChnID0+IGcudmVuZG9yID09PSBtZXRhZGF0YS52ZW5kb3IgJiYgZy5zZXR0aW5ncz8uW21ldGFkYXRhLmlkXSAhPT0gdW5kZWZpbmVkKTtcblxuXHRcdC8vIE90aGVyd2lzZSBmaW5kIHRoZSBncm91cCB0aGF0IGFjdHVhbGx5ICpkZWZpbmVzKiB0aGlzIG1vZGVsLiBTZXZlcmFsXG5cdFx0Ly8gZ3JvdXBzIGNhbiBzaGFyZSB0aGUgc2FtZSBgdmVuZG9yYCAoZS5nLiBtdWx0aXBsZSBgY3VzdG9tZW5kcG9pbnRgXG5cdFx0Ly8gcHJvdmlkZXJzIGxpa2UgRGVlcFNlZWsgYW5kIE15Q3VzdG9tKSwgc28gbWF0Y2hpbmcgYnkgdmVuZG9yIGFsb25lIHdvdWxkXG5cdFx0Ly8gd3JpdGUgdGhlIGNvbmZpZyB0byB0aGUgZmlyc3QgZ3JvdXAgb2YgdGhhdCB2ZW5kb3IgXHUyMDE0IG5vdCB0aGUgb25lIHRoZVxuXHRcdC8vIG1vZGVsIGJlbG9uZ3MgdG8uIFJlc29sdmUgdmlhIHRoZSBtb2RlbFx1MjE5Mmdyb3VwIG1hcCBpbnN0ZWFkLiBTZWUgIzMyMjg3Mi5cblx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRjb25zdCB2ZW5kb3JHcm91cHMgPSB0aGlzLl9tb2RlbHNHcm91cHMuZ2V0KG1ldGFkYXRhLnZlbmRvcik7XG5cdFx0XHRjb25zdCBjb250YWluaW5nR3JvdXAgPSB2ZW5kb3JHcm91cHM/LmZpbmQodmcgPT4gdmcubW9kZWxJZGVudGlmaWVycy5pbmNsdWRlcyhtb2RlbElkKSAmJiB2Zy5ncm91cCk/Lmdyb3VwO1xuXHRcdFx0aWYgKGNvbnRhaW5pbmdHcm91cCkge1xuXHRcdFx0XHRncm91cCA9IGFsbEdyb3Vwcy5maW5kKGcgPT4gZy52ZW5kb3IgPT09IGNvbnRhaW5pbmdHcm91cC52ZW5kb3IgJiYgZy5uYW1lID09PSBjb250YWluaW5nR3JvdXAubmFtZSkgPz8gY29udGFpbmluZ0dyb3VwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFzIGEgbGFzdCByZXNvcnQgKG1vZGVsIG5vdCB5ZXQgcmVzb2x2ZWQgaW50byBhbnkgZ3JvdXApLCBmYWxsIGJhY2sgdG9cblx0XHQvLyBhbnkgZ3JvdXAgZm9yIHRoaXMgdmVuZG9yLlxuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdGdyb3VwID0gYWxsR3JvdXBzLmZpbmQoZyA9PiBnLnZlbmRvciA9PT0gbWV0YWRhdGEudmVuZG9yKTtcblx0XHR9XG5cblx0XHQvLyBNZXJnZSBuZXcgdmFsdWVzIGludG8gZXhpc3RpbmcgY29uZmlnLCByZW1vdmluZyBwcm9wZXJ0aWVzIHNldCB0byB0aGVpciBzY2hlbWEgZGVmYXVsdFxuXHRcdGNvbnN0IGV4aXN0aW5nQ29uZmlnID0gdGhpcy5fbW9kZWxDb25maWd1cmF0aW9ucy5nZXQobW9kZWxJZCkgPz8ge307XG5cdFx0Y29uc3QgdXBkYXRlZENvbmZpZyA9IHsgLi4uZXhpc3RpbmdDb25maWcsIC4uLnZhbHVlcyB9O1xuXHRcdGNvbnN0IHNjaGVtYSA9IG1ldGFkYXRhLmNvbmZpZ3VyYXRpb25TY2hlbWE7XG5cdFx0aWYgKHNjaGVtYT8ucHJvcGVydGllcykge1xuXHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXModXBkYXRlZENvbmZpZykpIHtcblx0XHRcdFx0Y29uc3QgcHJvcFNjaGVtYSA9IHNjaGVtYS5wcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdGlmIChwcm9wU2NoZW1hPy5kZWZhdWx0ICE9PSB1bmRlZmluZWQgJiYgcHJvcFNjaGVtYS5kZWZhdWx0ID09PSB2YWx1ZSkge1xuXHRcdFx0XHRcdGRlbGV0ZSB1cGRhdGVkQ29uZmlnW2tleV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZ3JvdXApIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nU2V0dGluZ3MgPSAoZ3JvdXAuc2V0dGluZ3MgYXMgSVN0cmluZ0RpY3Rpb25hcnk8SVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4+IHwgdW5kZWZpbmVkKSA/PyB7fTtcblx0XHRcdGxldCB1cGRhdGVkU2V0dGluZ3M6IElTdHJpbmdEaWN0aW9uYXJ5PElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+Pjtcblx0XHRcdGlmIChPYmplY3Qua2V5cyh1cGRhdGVkQ29uZmlnKS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dXBkYXRlZFNldHRpbmdzID0geyAuLi5leGlzdGluZ1NldHRpbmdzIH07XG5cdFx0XHRcdGRlbGV0ZSB1cGRhdGVkU2V0dGluZ3NbbWV0YWRhdGEuaWRdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dXBkYXRlZFNldHRpbmdzID0geyAuLi5leGlzdGluZ1NldHRpbmdzLCBbbWV0YWRhdGEuaWRdOiB1cGRhdGVkQ29uZmlnIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cGRhdGVkR3JvdXA6IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAgPSB7XG5cdFx0XHRcdC4uLmdyb3VwLFxuXHRcdFx0XHRzZXR0aW5nczogT2JqZWN0LmtleXModXBkYXRlZFNldHRpbmdzKS5sZW5ndGggPiAwID8gdXBkYXRlZFNldHRpbmdzIDogdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdFx0aWYgKCF1cGRhdGVkR3JvdXAuc2V0dGluZ3MgJiYgT2JqZWN0LmtleXModXBkYXRlZEdyb3VwKS5maWx0ZXIoayA9PiBrICE9PSAnbmFtZScgJiYgayAhPT0gJ3ZlbmRvcicgJiYgayAhPT0gJ3JhbmdlJyAmJiBrICE9PSAnbW9kZWxzUmFuZ2UnICYmIGsgIT09ICdzZXR0aW5ncycpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHQvLyBSZW1vdmUgdGhlIGdyb3VwIGVudGlyZWx5IGlmIGl0IG9ubHkgaGFkIG1vZGVsIGNvbmZpZ1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlbW92ZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cChncm91cCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cChncm91cCwgdXBkYXRlZEdyb3VwKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKE9iamVjdC5rZXlzKHVwZGF0ZWRDb25maWcpLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIE9ubHkgY3JlYXRlIGEgbmV3IGdyb3VwIGlmIHRoZXJlJ3Mgbm9uLWRlZmF1bHQgY29uZmlnXG5cdFx0XHQvLyBVc2UgX3ZlbmRvcnMgZGlyZWN0bHkgaW5zdGVhZCBvZiBnZXRWZW5kb3JzKCkgd2hpY2ggZmlsdGVycyBieSBgd2hlbmAgY2xhdXNlLFxuXHRcdFx0Ly8gYmVjYXVzZSB3ZSBuZWVkIHRvIHN0b3JlIGNvbmZpZyBmb3IgYWxsIHZlbmRvcnMgcmVnYXJkbGVzcyBvZiBVSSB2aXNpYmlsaXR5LlxuXHRcdFx0Y29uc3QgdmVuZG9yID0gdGhpcy5fdmVuZG9ycy5nZXQobWV0YWRhdGEudmVuZG9yKTtcblx0XHRcdGlmICghdmVuZG9yKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5ld0dyb3VwOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwID0ge1xuXHRcdFx0XHRuYW1lOiB2ZW5kb3IuZGlzcGxheU5hbWUsXG5cdFx0XHRcdHZlbmRvcjogbWV0YWRhdGEudmVuZG9yLFxuXHRcdFx0XHRzZXR0aW5nczogeyBbbWV0YWRhdGEuaWRdOiB1cGRhdGVkQ29uZmlnIH1cblx0XHRcdH07XG5cdFx0XHRhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmFkZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cChuZXdHcm91cCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRoZSBpbi1tZW1vcnkgY2FjaGVcblx0XHRpZiAoT2JqZWN0LmtleXModXBkYXRlZENvbmZpZykubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fbW9kZWxDb25maWd1cmF0aW9ucy5zZXQobW9kZWxJZCwgdXBkYXRlZENvbmZpZyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX21vZGVsQ29uZmlndXJhdGlvbnMuZGVsZXRlKG1vZGVsSWQpO1xuXHRcdH1cblxuXHRcdC8vIE5vdGlmeSBsaXN0ZW5lcnMgc28gVUkgKGUuZy4sIG1vZGVsIHBpY2tlciBsYWJlbCkgdXBkYXRlc1xuXHRcdHRoaXMuX29uTGFuZ3VhZ2VNb2RlbENoYW5nZS5maXJlKG1ldGFkYXRhLnZlbmRvcik7XG5cdH1cblxuXHRnZXRNb2RlbENvbmZpZ3VyYXRpb25BY3Rpb25zKG1vZGVsSWQ6IHN0cmluZyk6IElBY3Rpb25bXSB7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLl9tb2RlbENhY2hlLmdldChtb2RlbElkKTtcblx0XHRjb25zdCBjdXJyZW50Q29uZmlnID0gdGhpcy5fbW9kZWxDb25maWd1cmF0aW9ucy5nZXQobW9kZWxJZCkgPz8ge307XG5cdFx0cmV0dXJuIGNyZWF0ZU1vZGVsQ29uZmlndXJhdGlvbkFjdGlvbnMoXG5cdFx0XHRtZXRhZGF0YT8uY29uZmlndXJhdGlvblNjaGVtYSxcblx0XHRcdGN1cnJlbnRDb25maWcsXG5cdFx0XHQoa2V5LCB2YWx1ZSkgPT4gdGhpcy5zZXRNb2RlbENvbmZpZ3VyYXRpb24obW9kZWxJZCwgeyBba2V5XTogdmFsdWUgfSlcblx0XHQpO1xuXHR9XG5cblx0YXN5bmMgY29uZmlndXJlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKHZlbmRvcklkOiBzdHJpbmcsIHByb3ZpZGVyR3JvdXBOYW1lPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCB2ZW5kb3IgPSB0aGlzLmdldFZlbmRvcnMoKS5maW5kKCh7IHZlbmRvciB9KSA9PiB2ZW5kb3IgPT09IHZlbmRvcklkKTtcblx0XHRpZiAoIXZlbmRvcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBWZW5kb3IgJHt2ZW5kb3JJZH0gbm90IGZvdW5kLmApO1xuXHRcdH1cblxuXHRcdGlmICh2ZW5kb3IubWFuYWdlbWVudENvbW1hbmQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Jlc29sdmVBbGxMYW5ndWFnZU1vZGVscyh2ZW5kb3IudmVuZG9yLCBmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXBzID0gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKCk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBsYW5ndWFnZU1vZGVsUHJvdmlkZXJHcm91cHMuZmluZChnID0+IGcudmVuZG9yID09PSB2ZW5kb3JJZCAmJiBnLm5hbWUgPT09IHByb3ZpZGVyR3JvdXBOYW1lKTtcblxuXHRcdGNvbnN0IG5hbWUgPSBhd2FpdCB0aGlzLnByb21wdEZvck5hbWUobGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXBzLCB2ZW5kb3IsIGV4aXN0aW5nKTtcblx0XHRpZiAoIW5hbWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBleGlzdGluZ0NvbmZpZ3VyYXRpb24gPSBleGlzdGluZyA/IGF3YWl0IHRoaXMuX3Jlc29sdmVDb25maWd1cmF0aW9uKGV4aXN0aW5nLCB2ZW5kb3IuY29uZmlndXJhdGlvbikgOiB1bmRlZmluZWQ7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IHZlbmRvci5jb25maWd1cmF0aW9uID8gYXdhaXQgdGhpcy5wcm9tcHRGb3JDb25maWd1cmF0aW9uKG5hbWUsIHZlbmRvci5jb25maWd1cmF0aW9uLCBleGlzdGluZ0NvbmZpZ3VyYXRpb24pIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHZlbmRvci5jb25maWd1cmF0aW9uICYmICFjb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXAgPSBhd2FpdCB0aGlzLl9yZXNvbHZlTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXAobmFtZSwgdmVuZG9ySWQsIGNvbmZpZ3VyYXRpb24sIHZlbmRvci5jb25maWd1cmF0aW9uKTtcblx0XHRcdGNvbnN0IHNhdmVkID0gZXhpc3Rpbmdcblx0XHRcdFx0PyBhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cChleGlzdGluZywgbGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXApXG5cdFx0XHRcdDogYXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS5hZGRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAobGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXApO1xuXG5cdFx0XHRpZiAodmVuZG9yLmNvbmZpZ3VyYXRpb24gJiYgdGhpcy5yZXF1aXJlQ29uZmlndXJpbmcodmVuZG9yLmNvbmZpZ3VyYXRpb24pKSB7XG5cdFx0XHRcdGNvbnN0IHNuaXBwZXQgPSB0aGlzLmdldFNuaXBwZXRGb3JGaXJzdFVuY29uZmlndXJlZFByb3BlcnR5KGNvbmZpZ3VyYXRpb24gPz8ge30sIHZlbmRvci5jb25maWd1cmF0aW9uKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS5jb25maWd1cmVMYW5ndWFnZU1vZGVscyh7IGdyb3VwOiBzYXZlZCwgc25pcHBldCB9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlbmFtZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCh2ZW5kb3JJZDogc3RyaW5nLCBwcm92aWRlckdyb3VwTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdmVuZG9yID0gdGhpcy5nZXRWZW5kb3JzKCkuZmluZCgoeyB2ZW5kb3IgfSkgPT4gdmVuZG9yID09PSB2ZW5kb3JJZCk7XG5cdFx0aWYgKCF2ZW5kb3IpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVmVuZG9yICR7dmVuZG9ySWR9IG5vdCBmb3VuZC5gKTtcblx0XHR9XG5cblx0XHRjb25zdCBsYW5ndWFnZU1vZGVsUHJvdmlkZXJHcm91cHMgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMoKTtcblx0XHRjb25zdCBleGlzdGluZyA9IGxhbmd1YWdlTW9kZWxQcm92aWRlckdyb3Vwcy5maW5kKGdyb3VwID0+IGdyb3VwLnZlbmRvciA9PT0gdmVuZG9ySWQgJiYgZ3JvdXAubmFtZSA9PT0gcHJvdmlkZXJHcm91cE5hbWUpO1xuXHRcdGlmICghZXhpc3RpbmcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTGFuZ3VhZ2UgbW9kZWwgcHJvdmlkZXIgZ3JvdXAgJHtwcm92aWRlckdyb3VwTmFtZX0gZm9yIHZlbmRvciAke3ZlbmRvcklkfSBub3QgZm91bmQuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmFtZSA9IGF3YWl0IHRoaXMucHJvbXB0Rm9yTmFtZShsYW5ndWFnZU1vZGVsUHJvdmlkZXJHcm91cHMsIHZlbmRvciwgZXhpc3RpbmcpO1xuXHRcdGlmICghbmFtZSB8fCBuYW1lID09PSBleGlzdGluZy5uYW1lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAoZXhpc3RpbmcsIHsgLi4uZXhpc3RpbmcsIG5hbWUgfSk7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBBcGlLZXkodmVuZG9ySWQ6IHN0cmluZywgcHJvdmlkZXJHcm91cE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZlbmRvciA9IHRoaXMuZ2V0VmVuZG9ycygpLmZpbmQoKHsgdmVuZG9yIH0pID0+IHZlbmRvciA9PT0gdmVuZG9ySWQpO1xuXHRcdGNvbnN0IHNjaGVtYSA9IHZlbmRvcj8uY29uZmlndXJhdGlvbiBhcyBJSlNPTlNjaGVtYSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhcGlLZXlTY2hlbWEgPSBzY2hlbWE/LnByb3BlcnRpZXM/LmFwaUtleTtcblx0XHRpZiAoIXZlbmRvciB8fCAhc2NoZW1hIHx8ICFhcGlLZXlTY2hlbWEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcygpLmZpbmQoZ3JvdXAgPT4gZ3JvdXAudmVuZG9yID09PSB2ZW5kb3JJZCAmJiBncm91cC5uYW1lID09PSBwcm92aWRlckdyb3VwTmFtZSk7XG5cdFx0aWYgKCFleGlzdGluZykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBMYW5ndWFnZSBtb2RlbCBwcm92aWRlciBncm91cCAke3Byb3ZpZGVyR3JvdXBOYW1lfSBmb3IgdmVuZG9yICR7dmVuZG9ySWR9IG5vdCBmb3VuZC5gKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdDb25maWd1cmF0aW9uID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUNvbmZpZ3VyYXRpb24oZXhpc3RpbmcsIHNjaGVtYSk7XG5cdFx0XHRjb25zdCBhcGlLZXkgPSBhd2FpdCB0aGlzLnByb21wdEZvclZhbHVlKGV4aXN0aW5nLm5hbWUsICdhcGlLZXknLCBhcGlLZXlTY2hlbWEsICEhc2NoZW1hLnJlcXVpcmVkPy5pbmNsdWRlcygnYXBpS2V5JyksIGV4aXN0aW5nQ29uZmlndXJhdGlvbik7XG5cdFx0XHRpZiAoYXBpS2V5ID09PSB1bmRlZmluZWQgfHwgYXBpS2V5ID09PSBleGlzdGluZ0NvbmZpZ3VyYXRpb24uYXBpS2V5KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IHsgLi4uZXhpc3RpbmdDb25maWd1cmF0aW9uLCBhcGlLZXkgfTtcblx0XHRcdGNvbnN0IHVwZGF0ZWQgPSB7XG5cdFx0XHRcdC4uLmF3YWl0IHRoaXMuX3Jlc29sdmVMYW5ndWFnZU1vZGVsUHJvdmlkZXJHcm91cChleGlzdGluZy5uYW1lLCB2ZW5kb3JJZCwgY29uZmlndXJhdGlvbiwgc2NoZW1hKSxcblx0XHRcdFx0c2V0dGluZ3M6IGV4aXN0aW5nLnNldHRpbmdzXG5cdFx0XHR9O1xuXHRcdFx0YXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAoZXhpc3RpbmcsIHVwZGF0ZWQpO1xuXHRcdFx0YXdhaXQgdGhpcy5fZGVsZXRlU2VjcmV0c0luQ29uZmlndXJhdGlvbihleGlzdGluZywgc2NoZW1hKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGFkZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cE1vZGVsKHZlbmRvcklkOiBzdHJpbmcsIHByb3ZpZGVyR3JvdXBOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2ZW5kb3IgPSB0aGlzLmdldFZlbmRvcnMoKS5maW5kKCh7IHZlbmRvciB9KSA9PiB2ZW5kb3IgPT09IHZlbmRvcklkKTtcblx0XHRjb25zdCBzY2hlbWEgPSB2ZW5kb3I/LmNvbmZpZ3VyYXRpb24gYXMgSUpTT05TY2hlbWEgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbW9kZWxzU2NoZW1hID0gc2NoZW1hPy5wcm9wZXJ0aWVzPy5tb2RlbHM7XG5cdFx0aWYgKCF2ZW5kb3IgfHwgIW1vZGVsc1NjaGVtYSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKCkuZmluZChncm91cCA9PiBncm91cC52ZW5kb3IgPT09IHZlbmRvcklkICYmIGdyb3VwLm5hbWUgPT09IHByb3ZpZGVyR3JvdXBOYW1lKTtcblx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYExhbmd1YWdlIG1vZGVsIHByb3ZpZGVyIGdyb3VwICR7cHJvdmlkZXJHcm91cE5hbWV9IGZvciB2ZW5kb3IgJHt2ZW5kb3JJZH0gbm90IGZvdW5kLmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc01vZGVscyA9IEFycmF5LmlzQXJyYXkoZ3JvdXAubW9kZWxzKTtcblx0XHRjb25zdCBzbmlwcGV0ID0gaGFzTW9kZWxzID8gdGhpcy5nZXRTbmlwcGV0Rm9yQXJyYXlJdGVtKG1vZGVsc1NjaGVtYSkgOiB0aGlzLmdldFNuaXBwZXRGb3JQcm9wZXJ0eSgnbW9kZWxzJywgbW9kZWxzU2NoZW1hKTtcblx0XHRpZiAoIXNuaXBwZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZ3VyZUxhbmd1YWdlTW9kZWxzKHtcblx0XHRcdGdyb3VwLFxuXHRcdFx0c25pcHBldCxcblx0XHRcdHNuaXBwZXRUYXJnZXQ6IGhhc01vZGVscyA/ICdtb2RlbHMnIDogJ2dyb3VwJ1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgb3Blbkxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cFNldHRpbmdzKHZlbmRvcklkOiBzdHJpbmcsIHByb3ZpZGVyR3JvdXBOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuX2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcygpLmZpbmQoZ3JvdXAgPT4gZ3JvdXAudmVuZG9yID09PSB2ZW5kb3JJZCAmJiBncm91cC5uYW1lID09PSBwcm92aWRlckdyb3VwTmFtZSk7XG5cdFx0aWYgKCFncm91cCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBMYW5ndWFnZSBtb2RlbCBwcm92aWRlciBncm91cCAke3Byb3ZpZGVyR3JvdXBOYW1lfSBmb3IgdmVuZG9yICR7dmVuZG9ySWR9IG5vdCBmb3VuZC5gKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZ3VyZUxhbmd1YWdlTW9kZWxzKHsgZ3JvdXAgfSk7XG5cdH1cblxuXHRhc3luYyBjb25maWd1cmVNb2RlbChtb2RlbElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuX21vZGVsQ2FjaGUuZ2V0KG1vZGVsSWQpO1xuXHRcdGlmICghbWV0YWRhdGEgfHwgIW1ldGFkYXRhLmNvbmZpZ3VyYXRpb25TY2hlbWEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBGaW5kIHRoZSBncm91cCB0aGF0IGNvbnRhaW5zIHRoaXMgbW9kZWxcblx0XHRjb25zdCB2ZW5kb3JHcm91cHMgPSB0aGlzLl9tb2RlbHNHcm91cHMuZ2V0KG1ldGFkYXRhLnZlbmRvcik7XG5cdFx0bGV0IGdyb3VwOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh2ZW5kb3JHcm91cHMpIHtcblx0XHRcdGZvciAoY29uc3Qgdmcgb2YgdmVuZG9yR3JvdXBzKSB7XG5cdFx0XHRcdGlmICh2Zy5tb2RlbElkZW50aWZpZXJzLmluY2x1ZGVzKG1vZGVsSWQpICYmIHZnLmdyb3VwKSB7XG5cdFx0XHRcdFx0Z3JvdXAgPSB2Zy5ncm91cDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBtb2RlbCBkb2Vzbid0IGJlbG9uZyB0byBhbnkgY29uZmlndXJlZCBncm91cCwgY3JlYXRlIG9uZVxuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdGNvbnN0IHZlbmRvciA9IHRoaXMuZ2V0VmVuZG9ycygpLmZpbmQodiA9PiB2LnZlbmRvciA9PT0gbWV0YWRhdGEudmVuZG9yKTtcblx0XHRcdGlmICghdmVuZG9yKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGdyb3VwTmFtZSA9IHZlbmRvci5kaXNwbGF5TmFtZTtcblx0XHRcdGNvbnN0IG5ld0dyb3VwOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwID0geyBuYW1lOiBncm91cE5hbWUsIHZlbmRvcjogbWV0YWRhdGEudmVuZG9yLCBzZXR0aW5nczogeyBbbWV0YWRhdGEuaWRdOiB7fSB9IH07XG5cdFx0XHRncm91cCA9IGF3YWl0IHRoaXMuX2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UuYWRkTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKG5ld0dyb3VwKTtcblx0XHRcdGF3YWl0IHRoaXMuX3Jlc29sdmVBbGxMYW5ndWFnZU1vZGVscyhtZXRhZGF0YS52ZW5kb3IsIHRydWUpO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIGEgc25pcHBldCBmb3IgdGhlIG1vZGVsJ3MgY29uZmlndXJhdGlvbiBzY2hlbWFcblx0XHRjb25zdCBzbmlwcGV0ID0gdGhpcy5fZ2V0TW9kZWxDb25maWd1cmF0aW9uU25pcHBldChtZXRhZGF0YS5pZCwgbWV0YWRhdGEuY29uZmlndXJhdGlvblNjaGVtYSk7XG5cdFx0YXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS5jb25maWd1cmVMYW5ndWFnZU1vZGVscyh7IGdyb3VwLCBzbmlwcGV0IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TW9kZWxDb25maWd1cmF0aW9uU25pcHBldChtb2RlbElkOiBzdHJpbmcsIHNjaGVtYTogSUxhbmd1YWdlTW9kZWxDb25maWd1cmF0aW9uU2NoZW1hKTogc3RyaW5nIHtcblx0XHRjb25zdCBwcm9wZXJ0aWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmIChzY2hlbWEucHJvcGVydGllcykge1xuXHRcdFx0Zm9yIChjb25zdCBba2V5LCBwcm9wU2NoZW1hXSBvZiBPYmplY3QuZW50cmllcyhzY2hlbWEucHJvcGVydGllcykpIHtcblx0XHRcdFx0aWYgKHByb3BTY2hlbWEuZGVmYXVsdFNuaXBwZXRzPy5bMF0pIHtcblx0XHRcdFx0XHRjb25zdCBzbmlwcGV0ID0gcHJvcFNjaGVtYS5kZWZhdWx0U25pcHBldHNbMF07XG5cdFx0XHRcdFx0bGV0IGJvZHlUZXh0ID0gc25pcHBldC5ib2R5VGV4dCA/PyBKU09OLnN0cmluZ2lmeShzbmlwcGV0LmJvZHksIG51bGwsICdcXHRcXHRcXHQnKTtcblx0XHRcdFx0XHRib2R5VGV4dCA9IGJvZHlUZXh0LnJlcGxhY2UoL1wiKFxcXlteXCJdKilcIi9nLCAoXywgdmFsdWUpID0+IHZhbHVlLnN1YnN0cmluZygxKSk7XG5cdFx0XHRcdFx0cHJvcGVydGllcy5wdXNoKGBcXHRcXHRcXHRcIiR7a2V5fVwiOiAke2JvZHlUZXh0fWApO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHByb3BTY2hlbWEuZGVmYXVsdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cHJvcGVydGllcy5wdXNoKGBcXHRcXHRcXHRcIiR7a2V5fVwiOiAke0pTT04uc3RyaW5naWZ5KHByb3BTY2hlbWEuZGVmYXVsdCl9YCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cHJvcGVydGllcy5wdXNoKGBcXHRcXHRcXHRcIiR7a2V5fVwiOiAkXFx7JHtrZXl9XFx9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgbW9kZWxDb250ZW50ID0gcHJvcGVydGllcy5sZW5ndGggPiAwXG5cdFx0XHQ/IGB7XFxuJHtwcm9wZXJ0aWVzLmpvaW4oJyxcXG4nKX1cXG5cXHRcXHR9YFxuXHRcdFx0OiAne1xcblxcdFxcdFxcdCQwXFxuXFx0XFx0fSc7XG5cdFx0cmV0dXJuIGBcInNldHRpbmdzXCI6IHtcXG5cXHRcXHRcIiR7bW9kZWxJZH1cIjogJHttb2RlbENvbnRlbnR9XFxuXFx0fWA7XG5cdH1cblxuXHRhc3luYyBhZGRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAobmFtZTogc3RyaW5nLCB2ZW5kb3JJZDogc3RyaW5nLCBjb25maWd1cmF0aW9uOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZlbmRvciA9IHRoaXMuZ2V0VmVuZG9ycygpLmZpbmQoKHsgdmVuZG9yIH0pID0+IHZlbmRvciA9PT0gdmVuZG9ySWQpO1xuXHRcdGlmICghdmVuZG9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFZlbmRvciAke3ZlbmRvcklkfSBub3QgZm91bmQuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXAgPSBhd2FpdCB0aGlzLl9yZXNvbHZlTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXAobmFtZSwgdmVuZG9ySWQsIGNvbmZpZ3VyYXRpb24sIHZlbmRvci5jb25maWd1cmF0aW9uKTtcblx0XHRhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmFkZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cChsYW5ndWFnZU1vZGVsUHJvdmlkZXJHcm91cCk7XG5cdH1cblxuXHRhc3luYyByZW1vdmVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAodmVuZG9ySWQ6IHN0cmluZywgcHJvdmlkZXJHcm91cE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZlbmRvciA9IHRoaXMuZ2V0VmVuZG9ycygpLmZpbmQoKHsgdmVuZG9yIH0pID0+IHZlbmRvciA9PT0gdmVuZG9ySWQpO1xuXHRcdGlmICghdmVuZG9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFZlbmRvciAke3ZlbmRvcklkfSBub3QgZm91bmQuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXBzID0gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKCk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBsYW5ndWFnZU1vZGVsUHJvdmlkZXJHcm91cHMuZmluZChnID0+IGcudmVuZG9yID09PSB2ZW5kb3JJZCAmJiBnLm5hbWUgPT09IHByb3ZpZGVyR3JvdXBOYW1lKTtcblxuXHRcdGlmICghZXhpc3RpbmcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTGFuZ3VhZ2UgbW9kZWwgcHJvdmlkZXIgZ3JvdXAgJHtwcm92aWRlckdyb3VwTmFtZX0gZm9yIHZlbmRvciAke3ZlbmRvcklkfSBub3QgZm91bmQuYCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fZGVsZXRlU2VjcmV0c0luQ29uZmlndXJhdGlvbihleGlzdGluZywgdmVuZG9yLmNvbmZpZ3VyYXRpb24pO1xuXHRcdGF3YWl0IHRoaXMuX2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UucmVtb3ZlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKGV4aXN0aW5nKTtcblx0fVxuXG5cdHByaXZhdGUgcmVxdWlyZUNvbmZpZ3VyaW5nKHNjaGVtYTogSUpTT05TY2hlbWEpOiBib29sZWFuIHtcblx0XHRpZiAoc2NoZW1hLmFkZGl0aW9uYWxQcm9wZXJ0aWVzKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFzY2hlbWEucHJvcGVydGllcykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHByb3BlcnR5IG9mIE9iamVjdC5rZXlzKHNjaGVtYS5wcm9wZXJ0aWVzKSkge1xuXHRcdFx0aWYgKCF0aGlzLmNhblByb21wdEZvclByb3BlcnR5KHNjaGVtYS5wcm9wZXJ0aWVzW3Byb3BlcnR5XSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U25pcHBldEZvckZpcnN0VW5jb25maWd1cmVkUHJvcGVydHkoY29uZmlndXJhdGlvbjogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4sIHNjaGVtYTogSUpTT05TY2hlbWEpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghc2NoZW1hLnByb3BlcnRpZXMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcHJvcGVydHkgb2YgT2JqZWN0LmtleXMoc2NoZW1hLnByb3BlcnRpZXMpKSB7XG5cdFx0XHRpZiAoY29uZmlndXJhdGlvbltwcm9wZXJ0eV0gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBwcm9wZXJ0eVNjaGVtYSA9IHNjaGVtYS5wcm9wZXJ0aWVzW3Byb3BlcnR5XTtcblx0XHRcdFx0Y29uc3Qgc25pcHBldCA9IHRoaXMuZ2V0U25pcHBldEZvclByb3BlcnR5KHByb3BlcnR5LCBwcm9wZXJ0eVNjaGVtYSk7XG5cdFx0XHRcdGlmIChzbmlwcGV0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHNuaXBwZXQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U25pcHBldEZvclByb3BlcnR5KHByb3BlcnR5OiBzdHJpbmcsIHByb3BlcnR5U2NoZW1hOiBJSlNPTlNjaGVtYSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYm9keVRleHQgPSB0aGlzLmdldERlZmF1bHRTbmlwcGV0Qm9keVRleHQocHJvcGVydHlTY2hlbWEpO1xuXHRcdHJldHVybiBib2R5VGV4dCA/IGBcIiR7cHJvcGVydHl9XCI6ICR7Ym9keVRleHR9YCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U25pcHBldEZvckFycmF5SXRlbShwcm9wZXJ0eVNjaGVtYTogSUpTT05TY2hlbWEpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdldERlZmF1bHRTbmlwcGV0Qm9keVRleHQocHJvcGVydHlTY2hlbWEsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREZWZhdWx0U25pcHBldEJvZHlUZXh0KHByb3BlcnR5U2NoZW1hOiBJSlNPTlNjaGVtYSwgYXJyYXlJdGVtID0gZmFsc2UpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNuaXBwZXQgPSBwcm9wZXJ0eVNjaGVtYS5kZWZhdWx0U25pcHBldHM/LlswXTtcblx0XHRpZiAoIXNuaXBwZXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYm9keVRleHQgPSBhcnJheUl0ZW1cblx0XHRcdD8gQXJyYXkuaXNBcnJheShzbmlwcGV0LmJvZHkpICYmIHNuaXBwZXQuYm9keS5sZW5ndGggPiAwID8gSlNPTi5zdHJpbmdpZnkoc25pcHBldC5ib2R5WzBdLCBudWxsLCAnXFx0JykgOiB1bmRlZmluZWRcblx0XHRcdDogc25pcHBldC5ib2R5VGV4dCA/PyBKU09OLnN0cmluZ2lmeShzbmlwcGV0LmJvZHksIG51bGwsICdcXHQnKTtcblx0XHRpZiAoIWJvZHlUZXh0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBib2R5VGV4dC5yZXBsYWNlKC9cIihcXF5bXlwiXSopXCIvZywgKF8sIHZhbHVlKSA9PiB2YWx1ZS5zdWJzdHJpbmcoMSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwcm9tcHRGb3JOYW1lKGxhbmd1YWdlTW9kZWxQcm92aWRlckdyb3VwczogcmVhZG9ubHkgSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cFtdLCB2ZW5kb3I6IElVc2VyRnJpZW5kbHlMYW5ndWFnZU1vZGVsLCBleGlzdGluZzogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IHByb3ZpZGVyR3JvdXBOYW1lID0gZXhpc3Rpbmc/Lm5hbWU7XG5cdFx0aWYgKCFwcm92aWRlckdyb3VwTmFtZSkge1xuXHRcdFx0cHJvdmlkZXJHcm91cE5hbWUgPSB2ZW5kb3IuZGlzcGxheU5hbWU7XG5cdFx0XHRsZXQgY291bnQgPSAxO1xuXHRcdFx0d2hpbGUgKGxhbmd1YWdlTW9kZWxQcm92aWRlckdyb3Vwcy5zb21lKGcgPT4gZy52ZW5kb3IgPT09IHZlbmRvci52ZW5kb3IgJiYgZy5uYW1lID09PSBwcm92aWRlckdyb3VwTmFtZSkpIHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdFx0cHJvdmlkZXJHcm91cE5hbWUgPSBgJHt2ZW5kb3IuZGlzcGxheU5hbWV9ICR7Y291bnR9YDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgcmVzdWx0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnB1dEJveCA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9xdWlja0lucHV0U2VydmljZS5jcmVhdGVJbnB1dEJveCgpKTtcblx0XHRcdFx0aW5wdXRCb3gudGl0bGUgPSBsb2NhbGl6ZSgnY29uZmlndXJlTGFuZ3VhZ2VNb2RlbEdyb3VwJywgXCJHcm91cCBOYW1lXCIpO1xuXHRcdFx0XHRpbnB1dEJveC5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdsYW5ndWFnZU1vZGVsR3JvdXBOYW1lJywgXCJFbnRlciBhIG5hbWUgZm9yIHRoZSBncm91cFwiKTtcblx0XHRcdFx0aW5wdXRCb3gudmFsdWUgPSBwcm92aWRlckdyb3VwTmFtZTtcblx0XHRcdFx0aW5wdXRCb3guaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChpbnB1dEJveC5vbkRpZENoYW5nZVZhbHVlKHZhbHVlID0+IHtcblx0XHRcdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdFx0XHRpbnB1dEJveC52YWxpZGF0aW9uTWVzc2FnZSA9IGxvY2FsaXplKCdlbnRlck5hbWUnLCBcIlBsZWFzZSBlbnRlciBhIG5hbWVcIik7XG5cdFx0XHRcdFx0XHRpbnB1dEJveC5zZXZlcml0eSA9IFNldmVyaXR5LkVycm9yO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobGFuZ3VhZ2VNb2RlbFByb3ZpZGVyR3JvdXBzLnNvbWUoZ3JvdXAgPT4gZ3JvdXAgIT09IGV4aXN0aW5nICYmIGdyb3VwLnZlbmRvciA9PT0gdmVuZG9yLnZlbmRvciAmJiBncm91cC5uYW1lID09PSB2YWx1ZSkpIHtcblx0XHRcdFx0XHRcdGlucHV0Qm94LnZhbGlkYXRpb25NZXNzYWdlID0gbG9jYWxpemUoJ25hbWVFeGlzdHMnLCBcIkEgbGFuZ3VhZ2UgbW9kZWxzIGdyb3VwIHdpdGggdGhpcyBuYW1lIGFscmVhZHkgZXhpc3RzXCIpO1xuXHRcdFx0XHRcdFx0aW5wdXRCb3guc2V2ZXJpdHkgPSBTZXZlcml0eS5FcnJvcjtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aW5wdXRCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aW5wdXRCb3guc2V2ZXJpdHkgPSBTZXZlcml0eS5JZ25vcmU7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0Qm94Lm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRyZXN1bHQgPSBpbnB1dEJveC52YWx1ZTtcblx0XHRcdFx0XHRpbnB1dEJveC5oaWRlKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0Qm94Lm9uRGlkSGlkZSgoKSA9PiByZXNvbHZlKCkpKTtcblx0XHRcdFx0aW5wdXRCb3guc2hvdygpO1xuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcHJvbXB0Rm9yQ29uZmlndXJhdGlvbihncm91cE5hbWU6IHN0cmluZywgY29uZmlndXJhdGlvbjogSUpTT05TY2hlbWEsIGV4aXN0aW5nOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIWNvbmZpZ3VyYXRpb24ucHJvcGVydGllcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gPSBleGlzdGluZyA/IHsgLi4uZXhpc3RpbmcgfSA6IHt9O1xuXG5cdFx0Zm9yIChjb25zdCBwcm9wZXJ0eSBvZiBPYmplY3Qua2V5cyhjb25maWd1cmF0aW9uLnByb3BlcnRpZXMpKSB7XG5cdFx0XHRjb25zdCBwcm9wZXJ0eVNjaGVtYSA9IGNvbmZpZ3VyYXRpb24ucHJvcGVydGllc1twcm9wZXJ0eV07XG5cdFx0XHRjb25zdCByZXF1aXJlZCA9ICEhY29uZmlndXJhdGlvbi5yZXF1aXJlZD8uaW5jbHVkZXMocHJvcGVydHkpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLnByb21wdEZvclZhbHVlKGdyb3VwTmFtZSwgcHJvcGVydHksIHByb3BlcnR5U2NoZW1hLCByZXF1aXJlZCwgZXhpc3RpbmcpO1xuXHRcdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmVzdWx0W3Byb3BlcnR5XSA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHByb21wdEZvclZhbHVlKGdyb3VwTmFtZTogc3RyaW5nLCBwcm9wZXJ0eTogc3RyaW5nLCBwcm9wZXJ0eVNjaGVtYTogSUpTT05TY2hlbWEgfCB1bmRlZmluZWQsIHJlcXVpcmVkOiBib29sZWFuLCBleGlzdGluZzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCB1bmRlZmluZWQpOiBQcm9taXNlPHVua25vd24gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXByb3BlcnR5U2NoZW1hKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5jYW5Qcm9tcHRGb3JQcm9wZXJ0eShwcm9wZXJ0eVNjaGVtYSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHByb3BlcnR5U2NoZW1hLnR5cGUgPT09ICdhcnJheScgJiYgcHJvcGVydHlTY2hlbWEuaXRlbXMgJiYgIUFycmF5LmlzQXJyYXkocHJvcGVydHlTY2hlbWEuaXRlbXMpICYmIHByb3BlcnR5U2NoZW1hLml0ZW1zLmVudW0pIHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkSXRlbXMgPSBhd2FpdCB0aGlzLnByb21wdEZvckFycmF5KGdyb3VwTmFtZSwgcHJvcGVydHksIHByb3BlcnR5U2NoZW1hKTtcblx0XHRcdGlmIChzZWxlY3RlZEl0ZW1zID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBzZWxlY3RlZEl0ZW1zO1xuXHRcdH1cblxuXHRcdGlmIChwcm9wZXJ0eVNjaGVtYS50eXBlID09PSAnc3RyaW5nJyAmJiBBcnJheS5pc0FycmF5KHByb3BlcnR5U2NoZW1hLmVudW0pICYmIHByb3BlcnR5U2NoZW1hLmVudW0ubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMucHJvbXB0Rm9yRW51bShncm91cE5hbWUsIHByb3BlcnR5LCBwcm9wZXJ0eVNjaGVtYSwgZXhpc3RpbmcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5wcm9tcHRGb3JJbnB1dChncm91cE5hbWUsIHByb3BlcnR5LCBwcm9wZXJ0eVNjaGVtYSwgcmVxdWlyZWQsIGV4aXN0aW5nKTtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIGNhblByb21wdEZvclByb3BlcnR5KHByb3BlcnR5U2NoZW1hOiBJSlNPTlNjaGVtYSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmICghcHJvcGVydHlTY2hlbWEgfHwgdHlwZW9mIHByb3BlcnR5U2NoZW1hID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAocHJvcGVydHlTY2hlbWEudHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wZXJ0eVNjaGVtYS5pdGVtcyAmJiAhQXJyYXkuaXNBcnJheShwcm9wZXJ0eVNjaGVtYS5pdGVtcykgJiYgcHJvcGVydHlTY2hlbWEuaXRlbXMuZW51bSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHByb3BlcnR5U2NoZW1hLnR5cGUgPT09ICdzdHJpbmcnIHx8IHByb3BlcnR5U2NoZW1hLnR5cGUgPT09ICdudW1iZXInIHx8IHByb3BlcnR5U2NoZW1hLnR5cGUgPT09ICdpbnRlZ2VyJyB8fCBwcm9wZXJ0eVNjaGVtYS50eXBlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVzY3JpcHRpb25QbGFpbnRleHQocHJvcGVydHlTY2hlbWE6IElKU09OU2NoZW1hKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocHJvcGVydHlTY2hlbWEuZGVzY3JpcHRpb24pIHtcblx0XHRcdHJldHVybiBwcm9wZXJ0eVNjaGVtYS5kZXNjcmlwdGlvbjtcblx0XHR9XG5cdFx0Y29uc3QgbWQgPSBwcm9wZXJ0eVNjaGVtYS5tYXJrZG93bkRlc2NyaXB0aW9uO1xuXHRcdGlmICghbWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIFF1aWNrIGlucHV0IHJlbmRlcnMgcGxhaW4gdGV4dCBvbmx5LiBTdHJpcCB0aGUgaW5saW5lIG1hcmtkb3duIGZlYXR1cmVzIHVzZWQgYnlcblx0XHQvLyBvdXIgc2NoZW1hcyAoaW5saW5lIGNvZGUsIGJvbGQvaXRhbGljLCBsaW5rcykgc28gdXNlcnMgc2VlIHJlYWRhYmxlIGhlbHAuXG5cdFx0cmV0dXJuIG1kXG5cdFx0XHQucmVwbGFjZSgvYChbXmBdKylgL2csICckMScpXG5cdFx0XHQucmVwbGFjZSgvXFwqXFwqKFteKl0rKVxcKlxcKi9nLCAnJDEnKVxuXHRcdFx0LnJlcGxhY2UoL1xcKihbXipdKylcXCovZywgJyQxJylcblx0XHRcdC5yZXBsYWNlKC9cXFsoW15cXF1dKylcXF1cXChbXildK1xcKS9nLCAnJDEnKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcHJvbXB0Rm9yQXJyYXkoZ3JvdXBOYW1lOiBzdHJpbmcsIHByb3BlcnR5OiBzdHJpbmcsIHByb3BlcnR5U2NoZW1hOiBJSlNPTlNjaGVtYSk6IFByb21pc2U8c3RyaW5nW10gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXByb3BlcnR5U2NoZW1hLml0ZW1zIHx8IEFycmF5LmlzQXJyYXkocHJvcGVydHlTY2hlbWEuaXRlbXMpIHx8ICFwcm9wZXJ0eVNjaGVtYS5pdGVtcy5lbnVtKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBpdGVtcyA9IHByb3BlcnR5U2NoZW1hLml0ZW1zLmVudW07XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmdbXSB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHF1aWNrUGljayA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2soKSk7XG5cdFx0XHRcdHF1aWNrUGljay50aXRsZSA9IGAke2dyb3VwTmFtZX06ICR7cHJvcGVydHlTY2hlbWEudGl0bGUgPz8gcHJvcGVydHl9YDtcblx0XHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gaXRlbXMubWFwKGl0ZW0gPT4gKHsgbGFiZWw6IGl0ZW0gfSkpO1xuXHRcdFx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSB0aGlzLmdldERlc2NyaXB0aW9uUGxhaW50ZXh0KHByb3BlcnR5U2NoZW1hKSA/PyBsb2NhbGl6ZSgnc2VsZWN0VmFsdWUnLCBcIlNlbGVjdCB2YWx1ZSBmb3IgezB9XCIsIHByb3BlcnR5KTtcblx0XHRcdFx0cXVpY2tQaWNrLmNhblNlbGVjdE1hbnkgPSB0cnVlO1xuXHRcdFx0XHRxdWlja1BpY2suaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRcdHJlc29sdmUocXVpY2tQaWNrLnNlbGVjdGVkSXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5sYWJlbCkpO1xuXHRcdFx0XHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHByb21wdEZvckVudW0oZ3JvdXBOYW1lOiBzdHJpbmcsIHByb3BlcnR5OiBzdHJpbmcsIHByb3BlcnR5U2NoZW1hOiBJSlNPTlNjaGVtYSAmIHsgZW51bUl0ZW1MYWJlbHM/OiBzdHJpbmdbXSB9LCBleGlzdGluZzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHZhbHVlcyA9IHByb3BlcnR5U2NoZW1hLmVudW07XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHZhbHVlcykgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZW51bURlc2NyaXB0aW9ucyA9IHByb3BlcnR5U2NoZW1hLmVudW1EZXNjcmlwdGlvbnM7XG5cdFx0Y29uc3QgZW51bUl0ZW1MYWJlbHMgPSBBcnJheS5pc0FycmF5KHByb3BlcnR5U2NoZW1hLmVudW1JdGVtTGFiZWxzKSA/IHByb3BlcnR5U2NoZW1hLmVudW1JdGVtTGFiZWxzIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGluaXRpYWwgPSBleGlzdGluZz8uW3Byb3BlcnR5XSAhPT0gdW5kZWZpbmVkID8gU3RyaW5nKGV4aXN0aW5nW3Byb3BlcnR5XSkgOiAocHJvcGVydHlTY2hlbWEuZGVmYXVsdCAhPT0gdW5kZWZpbmVkID8gU3RyaW5nKHByb3BlcnR5U2NoZW1hLmRlZmF1bHQpIDogdW5kZWZpbmVkKTtcblx0XHRjb25zdCBpdGVtczogSVF1aWNrUGlja0l0ZW1bXSA9IHZhbHVlcy5tYXAoKHZhbHVlLCBpbmRleCkgPT4gKHtcblx0XHRcdGxhYmVsOiBlbnVtSXRlbUxhYmVscz8uW2luZGV4XSA/PyBTdHJpbmcodmFsdWUpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGVudW1EZXNjcmlwdGlvbnM/LltpbmRleF0sXG5cdFx0XHRpZDogU3RyaW5nKHZhbHVlKVxuXHRcdH0pKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IG5ldyBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHF1aWNrUGljayA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0+KCkpO1xuXHRcdFx0XHRxdWlja1BpY2sudGl0bGUgPSBgJHtncm91cE5hbWV9OiAke3Byb3BlcnR5U2NoZW1hLnRpdGxlID8/IHByb3BlcnR5fWA7XG5cdFx0XHRcdHF1aWNrUGljay5pdGVtcyA9IGl0ZW1zO1xuXHRcdFx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSB0aGlzLmdldERlc2NyaXB0aW9uUGxhaW50ZXh0KHByb3BlcnR5U2NoZW1hKSA/PyBsb2NhbGl6ZSgnc2VsZWN0VmFsdWUnLCBcIlNlbGVjdCB2YWx1ZSBmb3IgezB9XCIsIHByb3BlcnR5KTtcblx0XHRcdFx0cXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRcdFx0aWYgKGluaXRpYWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbnN0IG1hdGNoID0gaXRlbXMuZmluZChpdGVtID0+IGl0ZW0uaWQgPT09IGluaXRpYWwpO1xuXHRcdFx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRcdFx0cXVpY2tQaWNrLmFjdGl2ZUl0ZW1zID0gW21hdGNoXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3RlZCA9IHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdO1xuXHRcdFx0XHRcdHJlc29sdmUoc2VsZWN0ZWQ/LmlkKTtcblx0XHRcdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwcm9tcHRGb3JJbnB1dChncm91cE5hbWU6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgcHJvcGVydHlTY2hlbWE6IElKU09OU2NoZW1hLCByZXF1aXJlZDogYm9vbGVhbiwgZXhpc3Rpbmc6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgdW5kZWZpbmVkKTogUHJvbWlzZTxzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHZhbGlkYXRlID0gKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRpZiAoIXZhbHVlICYmIHJlcXVpcmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd2YWx1ZVJlcXVpcmVkJywgXCJWYWx1ZSBpcyByZXF1aXJlZFwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5wdXRCb3ggPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlSW5wdXRCb3goKSk7XG5cdFx0XHRcdGlucHV0Qm94LnRpdGxlID0gYCR7Z3JvdXBOYW1lfTogJHtwcm9wZXJ0eVNjaGVtYS50aXRsZSA/PyBwcm9wZXJ0eX1gO1xuXHRcdFx0XHRpbnB1dEJveC5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdlbnRlclZhbHVlJywgXCJFbnRlciB2YWx1ZSBmb3IgezB9XCIsIHByb3BlcnR5KTtcblx0XHRcdFx0aW5wdXRCb3gucGFzc3dvcmQgPSAhIXByb3BlcnR5U2NoZW1hLnNlY3JldDtcblx0XHRcdFx0aW5wdXRCb3guaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdFx0XHRpZiAoZXhpc3Rpbmc/Lltwcm9wZXJ0eV0pIHtcblx0XHRcdFx0XHRpbnB1dEJveC52YWx1ZSA9IFN0cmluZyhleGlzdGluZz8uW3Byb3BlcnR5XSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocHJvcGVydHlTY2hlbWEuZGVmYXVsdCkge1xuXHRcdFx0XHRcdGlucHV0Qm94LnZhbHVlID0gU3RyaW5nKHByb3BlcnR5U2NoZW1hLmRlZmF1bHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHByb21wdFRleHQgPSB0aGlzLmdldERlc2NyaXB0aW9uUGxhaW50ZXh0KHByb3BlcnR5U2NoZW1hKTtcblx0XHRcdFx0aWYgKHByb21wdFRleHQpIHtcblx0XHRcdFx0XHRpbnB1dEJveC5wcm9tcHQgPSBwcm9tcHRUZXh0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0Qm94Lm9uRGlkQ2hhbmdlVmFsdWUodmFsdWUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSB2YWxpZGF0ZSh2YWx1ZSk7XG5cdFx0XHRcdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdGlucHV0Qm94LnZhbGlkYXRpb25NZXNzYWdlID0gbWVzc2FnZTtcblx0XHRcdFx0XHRcdGlucHV0Qm94LnNldmVyaXR5ID0gU2V2ZXJpdHkuRXJyb3I7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGlucHV0Qm94LnZhbGlkYXRpb25NZXNzYWdlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0aW5wdXRCb3guc2V2ZXJpdHkgPSBTZXZlcml0eS5JZ25vcmU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0Qm94Lm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gdmFsaWRhdGUoaW5wdXRCb3gudmFsdWUpO1xuXHRcdFx0XHRcdGlmIChtZXNzYWdlKSB7XG5cdFx0XHRcdFx0XHRpbnB1dEJveC52YWxpZGF0aW9uTWVzc2FnZSA9IG1lc3NhZ2U7XG5cdFx0XHRcdFx0XHRpbnB1dEJveC5zZXZlcml0eSA9IFNldmVyaXR5LkVycm9yO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXNvbHZlKGlucHV0Qm94LnZhbHVlKTtcblx0XHRcdFx0XHRpbnB1dEJveC5oaWRlKCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXRCb3gub25EaWRIaWRlKChlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUucmVhc29uID09PSBRdWlja0lucHV0SGlkZVJlYXNvbi5HZXN0dXJlKSB7XG5cdFx0XHRcdFx0XHRyZWplY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0aW5wdXRCb3guc2hvdygpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gVXNlciBjYW5jZWxsZWRcblx0XHRcdH1cblxuXHRcdFx0aWYgKHByb3BlcnR5U2NoZW1hLnR5cGUgPT09ICdudW1iZXInIHx8IHByb3BlcnR5U2NoZW1hLnR5cGUgPT09ICdpbnRlZ2VyJykge1xuXHRcdFx0XHRyZXR1cm4gTnVtYmVyKHZhbHVlKTtcblx0XHRcdH0gZWxzZSBpZiAocHJvcGVydHlTY2hlbWEudHlwZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdHJldHVybiB2YWx1ZSA9PT0gJ3RydWUnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0fVxuXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGVuY29kZVNlY3JldEtleShwcm9wZXJ0eTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZm9ybWF0KExhbmd1YWdlTW9kZWxzU2VydmljZS5TRUNSRVRfSU5QVVQsIHByb3BlcnR5KTtcblx0fVxuXG5cdHByaXZhdGUgZGVjb2RlU2VjcmV0S2V5KHNlY3JldElucHV0OiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWlzU3RyaW5nKHNlY3JldElucHV0KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHNlY3JldElucHV0LnN1YnN0cmluZyhzZWNyZXRJbnB1dC5pbmRleE9mKCc6JykgKyAxLCBzZWNyZXRJbnB1dC5sZW5ndGggLSAxKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyTW9kZWxDYWNoZSh2ZW5kb3I6IHN0cmluZyk6IE1hcDxzdHJpbmcsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhPiB7XG5cdFx0Y29uc3QgcmVtb3ZlZCA9IG5ldyBNYXA8c3RyaW5nLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YT4oKTtcblx0XHRmb3IgKGNvbnN0IFtpZCwgbW9kZWxdIG9mIHRoaXMuX21vZGVsQ2FjaGUuZW50cmllcygpKSB7XG5cdFx0XHRpZiAobW9kZWwudmVuZG9yID09PSB2ZW5kb3IpIHtcblx0XHRcdFx0cmVtb3ZlZC5zZXQoaWQsIG1vZGVsKTtcblx0XHRcdFx0dGhpcy5fbW9kZWxDYWNoZS5kZWxldGUoaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVtb3ZlZDtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyTW9kZWxDb25maWd1cmF0aW9ucyh2ZW5kb3I6IHN0cmluZyk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW2lkXSBvZiB0aGlzLl9tb2RlbENvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHRpZiAodGhpcy5fbW9kZWxDYWNoZS5nZXQoaWQpPy52ZW5kb3IgPT09IHZlbmRvciB8fCBpZC5zdGFydHNXaXRoKGAke3ZlbmRvcn0vYCkpIHtcblx0XHRcdFx0dGhpcy5fbW9kZWxDb25maWd1cmF0aW9ucy5kZWxldGUoaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVDb25maWd1cmF0aW9uKGdyb3VwOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwLCBzY2hlbWE6IElKU09OU2NoZW1hIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPj4ge1xuXHRcdGlmICghc2NoZW1hKSB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiA9IHt9O1xuXHRcdGZvciAoY29uc3Qga2V5IGluIGdyb3VwKSB7XG5cdFx0XHRpZiAoa2V5ID09PSAndmVuZG9yJyB8fCBrZXkgPT09ICduYW1lJyB8fCBrZXkgPT09ICdyYW5nZScgfHwga2V5ID09PSAnbW9kZWxzUmFuZ2UnIHx8IGtleSA9PT0gJ3NldHRpbmdzJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGxldCB2YWx1ZSA9IGdyb3VwW2tleV07XG5cdFx0XHRpZiAoc2NoZW1hLnByb3BlcnRpZXM/LltrZXldPy5zZWNyZXQpIHtcblx0XHRcdFx0Y29uc3Qgc2VjcmV0S2V5ID0gdGhpcy5kZWNvZGVTZWNyZXRLZXkodmFsdWUpO1xuXHRcdFx0XHR2YWx1ZSA9IHNlY3JldEtleSA/IGF3YWl0IHRoaXMuX3NlY3JldFN0b3JhZ2VTZXJ2aWNlLmdldChzZWNyZXRLZXkpIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0W2tleV0gPSB2YWx1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUxhbmd1YWdlTW9kZWxQcm92aWRlckdyb3VwKG5hbWU6IHN0cmluZywgdmVuZG9yOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgdW5kZWZpbmVkLCBzY2hlbWE6IElKU09OU2NoZW1hIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwPiB7XG5cdFx0aWYgKCFzY2hlbWEpIHtcblx0XHRcdHJldHVybiB7IG5hbWUsIHZlbmRvciB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IGtleSBpbiBjb25maWd1cmF0aW9uKSB7XG5cdFx0XHRsZXQgdmFsdWUgPSBjb25maWd1cmF0aW9uW2tleV07XG5cdFx0XHRpZiAoc2NoZW1hLnByb3BlcnRpZXM/LltrZXldPy5zZWNyZXQgJiYgaXNTdHJpbmcodmFsdWUpKSB7XG5cdFx0XHRcdGNvbnN0IHNlY3JldEtleSA9IGAke0xhbmd1YWdlTW9kZWxzU2VydmljZS5TRUNSRVRfS0VZX1BSRUZJWH0ke2hhc2goZ2VuZXJhdGVVdWlkKCkpLnRvU3RyaW5nKDE2KX1gO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zZWNyZXRTdG9yYWdlU2VydmljZS5zZXQoc2VjcmV0S2V5LCBrZXkgPT09ICdhcGlLZXknID8gdmFsdWUudHJpbSgpIDogdmFsdWUpO1xuXHRcdFx0XHR2YWx1ZSA9IHRoaXMuZW5jb2RlU2VjcmV0S2V5KHNlY3JldEtleSk7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHRba2V5XSA9IHZhbHVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IG5hbWUsIHZlbmRvciwgLi4ucmVzdWx0IH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kZWxldGVTZWNyZXRzSW5Db25maWd1cmF0aW9uKGdyb3VwOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwLCBzY2hlbWE6IElKU09OU2NoZW1hIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFzY2hlbWEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IHZlbmRvciwgbmFtZSwgcmFuZ2UsIG1vZGVsc1JhbmdlLCAuLi5jb25maWd1cmF0aW9uIH0gPSBncm91cDtcblx0XHRmb3IgKGNvbnN0IGtleSBpbiBjb25maWd1cmF0aW9uKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGdyb3VwW2tleV07XG5cdFx0XHRpZiAoc2NoZW1hLnByb3BlcnRpZXM/LltrZXldPy5zZWNyZXQpIHtcblx0XHRcdFx0Y29uc3Qgc2VjcmV0S2V5ID0gdGhpcy5kZWNvZGVTZWNyZXRLZXkodmFsdWUpO1xuXHRcdFx0XHRpZiAoc2VjcmV0S2V5KSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fc2VjcmV0U3RvcmFnZVNlcnZpY2UuZGVsZXRlKHNlY3JldEtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBtaWdyYXRlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKGxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cDogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgdmVuZG9yLCBuYW1lLCAuLi5jb25maWd1cmF0aW9uIH0gPSBsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXA7XG5cdFx0aWYgKCF0aGlzLl92ZW5kb3JzLmdldCh2ZW5kb3IpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFZlbmRvciAke3ZlbmRvcn0gbm90IGZvdW5kLmApO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvbkxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXI6JHt2ZW5kb3J9YCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9wcm92aWRlcnMuZ2V0KHZlbmRvcik7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDaGF0IG1vZGVsIHByb3ZpZGVyIGZvciB2ZW5kb3IgJHt2ZW5kb3J9IGlzIG5vdCByZWdpc3RlcmVkLmApO1xuXHRcdH1cblxuXHRcdGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVMYW5ndWFnZU1vZGVsQ2hhdEluZm8oeyBncm91cDogbmFtZSwgc2lsZW50OiBmYWxzZSwgY29uZmlndXJhdGlvbiB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGF3YWl0IHRoaXMuYWRkTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKG5hbWUsIHZlbmRvciwgY29uZmlndXJhdGlvbik7XG5cdH1cblxuXHQvLyNyZWdpb24gUmVjZW50bHkgdXNlZCBtb2RlbHNcblxuXHRwcml2YXRlIF9yZWFkUmVjZW50bHlVc2VkTW9kZWxzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0T2JqZWN0PHN0cmluZ1tdPihDSEFUX01PREVMX1JFQ0VOVExZX1VTRURfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBbXSk7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlUmVjZW50bHlVc2VkTW9kZWxzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKENIQVRfTU9ERUxfUkVDRU5UTFlfVVNFRF9TVE9SQUdFX0tFWSwgdGhpcy5fcmVjZW50bHlVc2VkTW9kZWxJZHMsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0Z2V0UmVjZW50bHlVc2VkTW9kZWxJZHMoKTogc3RyaW5nW10ge1xuXHRcdC8vIEZpbHRlciB0byBvbmx5IGluY2x1ZGUgbW9kZWxzIHRoYXQgc3RpbGwgZXhpc3QgaW4gdGhlIGNhY2hlXG5cdFx0cmV0dXJuIHRoaXMuX3JlY2VudGx5VXNlZE1vZGVsSWRzXG5cdFx0XHQuZmlsdGVyKGlkID0+IHRoaXMuX21vZGVsQ2FjaGUuaGFzKGlkKSAmJiBpZCAhPT0gQVVUT19NT0RFTF9JREVOVElGSUVSKVxuXHRcdFx0LnNsaWNlKDAsIDQpO1xuXHR9XG5cblx0YWRkVG9SZWNlbnRseVVzZWRMaXN0KG1vZGVsSWRlbnRpZmllcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKG1vZGVsSWRlbnRpZmllciA9PT0gQVVUT19NT0RFTF9JREVOVElGSUVSKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIGlmIGFscmVhZHkgcHJlc2VudCAodG8gbW92ZSB0byBmcm9udClcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX3JlY2VudGx5VXNlZE1vZGVsSWRzLmluZGV4T2YobW9kZWxJZGVudGlmaWVyKTtcblx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLl9yZWNlbnRseVVzZWRNb2RlbElkcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdH1cblx0XHQvLyBBZGQgdG8gZnJvbnRcblx0XHR0aGlzLl9yZWNlbnRseVVzZWRNb2RlbElkcy51bnNoaWZ0KG1vZGVsSWRlbnRpZmllcik7XG5cdFx0Ly8gQ2FwIGF0IGEgcmVhc29uYWJsZSBtYXggdG8gYXZvaWQgdW5ib3VuZGVkIGdyb3d0aFxuXHRcdGlmICh0aGlzLl9yZWNlbnRseVVzZWRNb2RlbElkcy5sZW5ndGggPiAyMCkge1xuXHRcdFx0dGhpcy5fcmVjZW50bHlVc2VkTW9kZWxJZHMubGVuZ3RoID0gMjA7XG5cdFx0fVxuXHRcdHRoaXMuX3NhdmVSZWNlbnRseVVzZWRNb2RlbHMoKTtcblx0fVxuXG5cdGNsZWFyUmVjZW50bHlVc2VkTGlzdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWNlbnRseVVzZWRNb2RlbElkcyA9IFtdO1xuXHRcdHRoaXMuX3NhdmVSZWNlbnRseVVzZWRNb2RlbHMoKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBQaW5uZWQgbW9kZWxzXG5cblx0cHJpdmF0ZSBfcmVhZFBpbm5lZE1vZGVscygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdDxzdHJpbmdbXT4oQ0hBVF9NT0RFTF9QSU5ORURfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBbXSk7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlUGlubmVkTW9kZWxzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKENIQVRfTU9ERUxfUElOTkVEX1NUT1JBR0VfS0VZLCB0aGlzLl9waW5uZWRNb2RlbElkcywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRnZXRQaW5uZWRNb2RlbElkcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Bpbm5lZE1vZGVsSWRzLmZpbHRlcihpZCA9PiBpZCAhPT0gQVVUT19NT0RFTF9JREVOVElGSUVSICYmIHRoaXMuX21vZGVsQ2FjaGUuaGFzKGlkKSk7XG5cdH1cblxuXHRwaW5Nb2RlbChtb2RlbElkZW50aWZpZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChtb2RlbElkZW50aWZpZXIgPT09IEFVVE9fTU9ERUxfSURFTlRJRklFUiB8fCB0aGlzLl9waW5uZWRNb2RlbElkcy5pbmNsdWRlcyhtb2RlbElkZW50aWZpZXIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Bpbm5lZE1vZGVsSWRzLnB1c2gobW9kZWxJZGVudGlmaWVyKTtcblx0XHR0aGlzLl9zYXZlUGlubmVkTW9kZWxzKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQaW5uZWRNb2RlbHMuZmlyZSgpO1xuXHR9XG5cblx0dW5waW5Nb2RlbChtb2RlbElkZW50aWZpZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fcGlubmVkTW9kZWxJZHMuaW5kZXhPZihtb2RlbElkZW50aWZpZXIpO1xuXHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGlubmVkTW9kZWxJZHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHR0aGlzLl9zYXZlUGlubmVkTW9kZWxzKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQaW5uZWRNb2RlbHMuZmlyZSgpO1xuXHR9XG5cblx0aXNNb2RlbFBpbm5lZChtb2RlbElkZW50aWZpZXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBtb2RlbElkZW50aWZpZXIgIT09IEFVVE9fTU9ERUxfSURFTlRJRklFUiAmJiB0aGlzLl9waW5uZWRNb2RlbElkcy5pbmNsdWRlcyhtb2RlbElkZW50aWZpZXIpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIE1vZGVsIHZpc2liaWxpdHlcblxuXHRwcml2YXRlIF9nZXRHcm91cE5hbWVGb3JWZW5kb3IodmVuZG9yOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl92ZW5kb3JzLmdldCh2ZW5kb3IpPy5kaXNwbGF5TmFtZSA/PyB2ZW5kb3I7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRNb2RlbElkc0luR3JvdXAodmVuZG9yOiBzdHJpbmcsIGdyb3VwTmFtZTogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHZlbmRvckdyb3VwcyA9IHRoaXMuX21vZGVsc0dyb3Vwcy5nZXQodmVuZG9yKTtcblx0XHRpZiAoIXZlbmRvckdyb3Vwcykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgZmFsbGJhY2tOYW1lID0gdGhpcy5fZ2V0R3JvdXBOYW1lRm9yVmVuZG9yKHZlbmRvcik7XG5cdFx0Zm9yIChjb25zdCBnIG9mIHZlbmRvckdyb3Vwcykge1xuXHRcdFx0Y29uc3QgbmFtZSA9IGcuZ3JvdXA/Lm5hbWUgPz8gZmFsbGJhY2tOYW1lO1xuXHRcdFx0aWYgKG5hbWUgPT09IGdyb3VwTmFtZSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGcubW9kZWxJZGVudGlmaWVycykge1xuXHRcdFx0XHRcdC8vIEV4Y2x1ZGUgYWdlbnQtaG9zdCBCWU9LIGNvcGllcy4gVGhleSBhcmUgbm90IHNob3duIGFzIHJvd3MgaW4gdGhpc1xuXHRcdFx0XHRcdC8vIGdyb3VwICh0aGV5IHN1cmZhY2UgdW5kZXIgdGhlaXIgcmVhbCBwcm92aWRlciksIHNvIGdyb3VwLWxldmVsXG5cdFx0XHRcdFx0Ly8gdmlzaWJpbGl0eSB0b2dnbGVzIChgaXNHcm91cEhpZGRlbmAgLyBgc2V0R3JvdXBIaWRkZW5gKSBtdXN0IG5vdFxuXHRcdFx0XHRcdC8vIHRvdWNoIHRoZW0gXHUyMDE0IG90aGVyd2lzZSBoaWRpbmcgdGhlIGFnZW50LWhvc3QgZ3JvdXAgd291bGQgZmxpcCB0aGVcblx0XHRcdFx0XHQvLyBoaWRkZW4gc3RhdGUgb2YgdGhlc2UgY29waWVzIGluIHRoZSB1bmRlcmx5aW5nIG1vZGVsIHNldCBldmVuIHRob3VnaFxuXHRcdFx0XHRcdC8vIHRoZSBVSSBuZXZlciBsaXN0cyB0aGVtIGhlcmUuIFRoZWlyIHZpc2liaWxpdHkgaXMgb3duZWQgYnkgdGhlIHJlYWxcblx0XHRcdFx0XHQvLyBwcm92aWRlciByb3cgYW5kIGhvbm91cmVkIGluIHRoZSBwaWNrZXIgdmlhIHRoZSByZWNvbnN0cnVjdGVkIGlkLlxuXHRcdFx0XHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fbW9kZWxDYWNoZS5nZXQoaWQpO1xuXHRcdFx0XHRcdGlmIChtZXRhZGF0YSAmJiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YS5nZXRBZ2VudEhvc3RCeW9rTWFuYWdlTW9kZWxzSWRlbnRpZmllcihtZXRhZGF0YSkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZFZpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0T2JqZWN0PHsgaGlkZGVuTW9kZWxzPzogc3RyaW5nW10gfT4oQ0hBVF9NT0RFTF9WSVNJQklMSVRZX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwge30pO1xuXHRcdHRoaXMuX2hpZGRlbk1vZGVsSWRzID0gbmV3IFNldChBcnJheS5pc0FycmF5KHJhdz8uaGlkZGVuTW9kZWxzKSA/IHJhdy5oaWRkZW5Nb2RlbHMgOiBbXSk7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlVmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdENIQVRfTU9ERUxfVklTSUJJTElUWV9TVE9SQUdFX0tFWSxcblx0XHRcdHsgaGlkZGVuTW9kZWxzOiBBcnJheS5mcm9tKHRoaXMuX2hpZGRlbk1vZGVsSWRzKSB9LFxuXHRcdFx0U3RvcmFnZVNjb3BlLlBST0ZJTEUsXG5cdFx0XHRTdG9yYWdlVGFyZ2V0LlVTRVIsXG5cdFx0KTtcblx0fVxuXG5cdGlzR3JvdXBIaWRkZW4odmVuZG9yOiBzdHJpbmcsIGdyb3VwTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbW9kZWxJZHMgPSB0aGlzLl9nZXRNb2RlbElkc0luR3JvdXAodmVuZG9yLCBncm91cE5hbWUpO1xuXHRcdHJldHVybiBtb2RlbElkcy5sZW5ndGggPiAwICYmIG1vZGVsSWRzLmV2ZXJ5KGlkID0+IHRoaXMuX2hpZGRlbk1vZGVsSWRzLmhhcyhpZCkpO1xuXHR9XG5cblx0aXNNb2RlbEhpZGRlbihtb2RlbElkZW50aWZpZXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9oaWRkZW5Nb2RlbElkcy5oYXMobW9kZWxJZGVudGlmaWVyKTtcblx0fVxuXG5cdHNldEdyb3VwSGlkZGVuKHZlbmRvcjogc3RyaW5nLCBncm91cE5hbWU6IHN0cmluZywgaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRjb25zdCBtb2RlbElkcyA9IHRoaXMuX2dldE1vZGVsSWRzSW5Hcm91cCh2ZW5kb3IsIGdyb3VwTmFtZSk7XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBtb2RlbElkcykge1xuXHRcdFx0aWYgKGhpZGRlbikge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2hpZGRlbk1vZGVsSWRzLmhhcyhpZCkpIHtcblx0XHRcdFx0XHR0aGlzLl9oaWRkZW5Nb2RlbElkcy5hZGQoaWQpO1xuXHRcdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2hpZGRlbk1vZGVsSWRzLmRlbGV0ZShpZCkpIHtcblx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLl9zYXZlVmlzaWJpbGl0eSgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbFZpc2liaWxpdHkuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHNldE1vZGVsSGlkZGVuKG1vZGVsSWRlbnRpZmllcjogc3RyaW5nLCBoaWRkZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdGlmIChoaWRkZW4pIHtcblx0XHRcdGlmICghdGhpcy5faGlkZGVuTW9kZWxJZHMuaGFzKG1vZGVsSWRlbnRpZmllcikpIHtcblx0XHRcdFx0dGhpcy5faGlkZGVuTW9kZWxJZHMuYWRkKG1vZGVsSWRlbnRpZmllcik7XG5cdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGhpcy5faGlkZGVuTW9kZWxJZHMuZGVsZXRlKG1vZGVsSWRlbnRpZmllcikpIHtcblx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0dGhpcy5fc2F2ZVZpc2liaWxpdHkoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxWaXNpYmlsaXR5LmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRnZXRIaWRkZW5Nb2RlbElkcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5faGlkZGVuTW9kZWxJZHMpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIE1vZGVscyBjb250cm9sIG1hbmlmZXN0XG5cblx0Z2V0TW9kZWxzQ29udHJvbE1hbmlmZXN0KCk6IElNb2RlbHNDb250cm9sTWFuaWZlc3Qge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbHNDb250cm9sTWFuaWZlc3Q7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRNb2RlbHNDb250cm9sTWFuaWZlc3QocmVzcG9uc2U6IElDaGF0Q29udHJvbFJlc3BvbnNlWydtb2RlbHMnXSk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsc0NvbnRyb2xSYXdSZXNwb25zZSA9IHJlc3BvbnNlO1xuXHRcdHRoaXMuX3JlZnJlc2hNb2RlbHNDb250cm9sTWFuaWZlc3QoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hNb2RlbHNDb250cm9sTWFuaWZlc3QoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSB0aGlzLl9tb2RlbHNDb250cm9sUmF3UmVzcG9uc2U7XG5cdFx0Y29uc3QgZnJlZTogSVN0cmluZ0RpY3Rpb25hcnk8SU1vZGVsQ29udHJvbEVudHJ5PiA9IHt9O1xuXHRcdGNvbnN0IHBhaWQ6IElTdHJpbmdEaWN0aW9uYXJ5PElNb2RlbENvbnRyb2xFbnRyeT4gPSB7fTtcblxuXHRcdGlmIChyZXNwb25zZT8uZnJlZSkge1xuXHRcdFx0Y29uc3QgZnJlZUVudHJpZXMgPSBBcnJheS5pc0FycmF5KHJlc3BvbnNlLmZyZWUpID8gcmVzcG9uc2UuZnJlZSA6IE9iamVjdC52YWx1ZXMocmVzcG9uc2UuZnJlZSk7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGZyZWVFbnRyaWVzKSB7XG5cdFx0XHRcdGlmICghZW50cnkgfHwgIWlzT2JqZWN0KGVudHJ5KSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZyZWVbZW50cnkuaWRdID0geyBsYWJlbDogZW50cnkubGFiZWwsIGZlYXR1cmVkOiBlbnRyeS5mZWF0dXJlZCwgZXhpc3RzOiB0aGlzLl9tb2RlbENhY2hlLmhhcyhgY29waWxvdC8ke2VudHJ5LmlkfWApIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHJlc3BvbnNlPy5wYWlkKSB7XG5cdFx0XHRjb25zdCBwYWlkRW50cmllcyA9IEFycmF5LmlzQXJyYXkocmVzcG9uc2UucGFpZCkgPyByZXNwb25zZS5wYWlkIDogT2JqZWN0LnZhbHVlcyhyZXNwb25zZS5wYWlkKTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgcGFpZEVudHJpZXMpIHtcblx0XHRcdFx0aWYgKCFlbnRyeSB8fCAhaXNPYmplY3QoZW50cnkpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cGFpZFtlbnRyeS5pZF0gPSB7IGxhYmVsOiBlbnRyeS5sYWJlbCwgZmVhdHVyZWQ6IGVudHJ5LmZlYXR1cmVkLCBtaW5WU0NvZGVWZXJzaW9uOiBlbnRyeS5taW5WU0NvZGVWZXJzaW9uLCBleGlzdHM6IHRoaXMuX21vZGVsQ2FjaGUuaGFzKGBjb3BpbG90LyR7ZW50cnkuaWR9YCkgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9tb2RlbHNDb250cm9sTWFuaWZlc3QgPSB7IGZyZWUsIHBhaWQgfTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZU1vZGVsc0NvbnRyb2xNYW5pZmVzdC5maXJlKHRoaXMuX21vZGVsc0NvbnRyb2xNYW5pZmVzdCk7XG5cdH1cblxuXHQvLyNyZWdpb24gQ2hhdCBjb250cm9sIGRhdGFcblx0cHJpdmF0ZSBfaW5pdENoYXRDb250cm9sRGF0YSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGF0Q29udHJvbFVybCA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmNoYXRQYXJ0aWNpcGFudFJlZ2lzdHJ5O1xuXHRcdGlmICghdGhpcy5fY2hhdENvbnRyb2xVcmwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZXN0b3JlIHBhcnRpY2lwYW50IHJlZ2lzdHJ5IGZyb20gc3RvcmFnZVxuXHRcdGNvbnN0IHJhdyA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChDSEFUX1BBUlRJQ0lQQU5UX05BTUVfUkVHSVNUUllfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX3Jlc3RyaWN0ZWRDaGF0UGFydGljaXBhbnRzLnNldChKU09OLnBhcnNlKHJhdyA/PyAne30nKSwgdW5kZWZpbmVkKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShDSEFUX1BBUlRJQ0lQQU5UX05BTUVfUkVHSVNUUllfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzdG9yZSBtb2RlbHMgY29udHJvbCBtYW5pZmVzdCBmcm9tIHN0b3JhZ2Vcblx0XHRjb25zdCByYXdNb2RlbHMgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoQ0hBVF9NT0RFTFNfQ09OVFJPTF9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gSlNPTi5wYXJzZShyYXdNb2RlbHMgPz8gJ3t9Jyk7XG5cdFx0XHRpZiAoaXNPYmplY3QobW9kZWxzKSkge1xuXHRcdFx0XHR0aGlzLl9zZXRNb2RlbHNDb250cm9sTWFuaWZlc3QobW9kZWxzKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShDSEFUX01PREVMU19DT05UUk9MX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZnJlc2hDaGF0Q29udHJvbERhdGEoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hDaGF0Q29udHJvbERhdGEoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NoYXRDb250cm9sRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9mZXRjaENoYXRDb250cm9sRGF0YSgpXG5cdFx0XHQuY2F0Y2goZXJyID0+IHRoaXMuX2xvZ1NlcnZpY2Uud2FybignRmFpbGVkIHRvIGZldGNoIGNoYXQgY29udHJvbCBkYXRhJywgZXJyKSlcblx0XHRcdC50aGVuKCgpID0+IHRpbWVvdXQoNSAqIDYwICogMTAwMCkpIC8vIGV2ZXJ5IDUgbWludXRlc1xuXHRcdFx0LnRoZW4oKCkgPT4gdGhpcy5fcmVmcmVzaENoYXRDb250cm9sRGF0YSgpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZldGNoQ2hhdENvbnRyb2xEYXRhKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tMTV0gRmV0Y2hpbmcgY2hhdCBjb250cm9sIGRhdGEgZnJvbScsIHRoaXMuX2NoYXRDb250cm9sVXJsKTtcblxuXHRcdGxldCBjb250ZXh0O1xuXHRcdHRyeSB7XG5cdFx0XHRjb250ZXh0ID0gYXdhaXQgdGhpcy5fcmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7IHR5cGU6ICdHRVQnLCB1cmw6IHRoaXMuX2NoYXRDb250cm9sVXJsISwgY2FsbFNpdGU6ICdsYW5ndWFnZU1vZGVscy5mZXRjaENoYXRDb250cm9sRGF0YScgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tMTV0gRmFpbGVkIHRvIHJlcXVlc3QgY2hhdCBjb250cm9sIGRhdGEnLCBnZXRFcnJvck1lc3NhZ2UoZXJyKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbTE1dIENoYXQgY29udHJvbCBkYXRhIHJlcXVlc3QgZmFpbGVkIHdpdGggc3RhdHVzICR7Y29udGV4dC5yZXMuc3RhdHVzQ29kZX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgcmVzdWx0OiBJQ2hhdENvbnRyb2xSZXNwb25zZSB8IG51bGw7XG5cdFx0dHJ5IHtcblx0XHRcdHJlc3VsdCA9IGF3YWl0IGFzSnNvbjxJQ2hhdENvbnRyb2xSZXNwb25zZT4oY29udGV4dCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tMTV0gRmFpbGVkIHRvIHBhcnNlIGNoYXQgY29udHJvbCByZXNwb25zZScsIGdldEVycm9yTWVzc2FnZShlcnIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbTE1dIFJlY2VpdmVkIGNoYXQgY29udHJvbCByZXNwb25zZScsIHJlc3VsdCA/IE9iamVjdC5rZXlzKHJlc3VsdCkgOiAnbnVsbCcpO1xuXG5cdFx0aWYgKCFyZXN1bHQgfHwgcmVzdWx0LnZlcnNpb24gIT09IDEpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW0xNXSBVbmV4cGVjdGVkIGNoYXQgY29udHJvbCByZXNwb25zZSB2ZXJzaW9uJywgcmVzdWx0Py52ZXJzaW9uKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgcmVzdHJpY3RlZCBjaGF0IHBhcnRpY2lwYW50c1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gcmVzdWx0LnJlc3RyaWN0ZWRDaGF0UGFydGljaXBhbnRzO1xuXHRcdHRoaXMuX3Jlc3RyaWN0ZWRDaGF0UGFydGljaXBhbnRzLnNldChyZWdpc3RyeSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShDSEFUX1BBUlRJQ0lQQU5UX05BTUVfUkVHSVNUUllfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KHJlZ2lzdHJ5KSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0Ly8gVXBkYXRlIG1vZGVscyBjb250cm9sIG1hbmlmZXN0XG5cdFx0aWYgKHJlc3VsdC5tb2RlbHMpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tMTV0gVXBkYXRpbmcgbW9kZWxzIGNvbnRyb2wgbWFuaWZlc3QnLCB7IGZyZWVDb3VudDogT2JqZWN0LmtleXMocmVzdWx0Lm1vZGVscy5mcmVlID8/IHt9KS5sZW5ndGgsIHBhaWRDb3VudDogT2JqZWN0LmtleXMocmVzdWx0Lm1vZGVscy5wYWlkID8/IHt9KS5sZW5ndGggfSk7XG5cdFx0XHR0aGlzLl9zZXRNb2RlbHNDb250cm9sTWFuaWZlc3QocmVzdWx0Lm1vZGVscyk7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShDSEFUX01PREVMU19DT05UUk9MX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeShyZXN1bHQubW9kZWxzKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fY2hhdENvbnRyb2xEaXNwb3NlZCA9IHRydWU7XG5cdFx0dGhpcy5fc3RvcmUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Byb3ZpZGVycy5jbGVhcigpO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0IsZUFBZTtBQUV4QyxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLG1CQUFtQixpQkFBaUIsMkJBQTJCO0FBQ3hFLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsaUJBQThCLG9CQUFvQjtBQUMzRCxTQUFzQix1QkFBdUI7QUFDN0MsU0FBUyxjQUFjO0FBQ3ZCLE9BQU8sY0FBYztBQUNyQixTQUFTLFFBQVEsMkJBQTJCO0FBRTVDLFNBQWtCLHFCQUFxQjtBQUN2QyxTQUFTLFVBQVUsZ0JBQWdCO0FBQ25DLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBNkIsMEJBQTBCO0FBQ2hFLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCLDJCQUEyQjtBQUMxRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFFBQVEsdUJBQXVCO0FBQ3hDLFNBQVMsb0JBQW9DLDRCQUE0QjtBQUN6RSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNs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bEIsV0FBSyxZQUFZLE1BQU0seUNBQXlDLEVBQUUsV0FBVyxPQUFPLEtBQUssT0FBTyxPQUFPLFFBQVEsQ0FBQyxDQUFDLEVBQUUsUUFBUSxXQUFXLE9BQU8sS0FBSyxPQUFPLE9BQU8sUUFBUSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUM7QUFDcEwsV0FBSywwQkFBMEIsT0FBTyxNQUFNO0FBQzVDLFdBQUssZ0JBQWdCLE1BQU0saUNBQWlDLEtBQUssVUFBVSxPQUFPLE1BQU0sR0FBRyxhQUFhLGFBQWEsY0FBYyxPQUFPO0FBQUEsSUFDM0k7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUlBLFVBQVU7QUFDVCxTQUFLLHVCQUF1QjtBQUM1QixTQUFLLE9BQU8sUUFBUTtBQUNwQixTQUFLLFdBQVcsTUFBTTtBQUFBLEVBQ3ZCO0FBRUQ7QUFsbURhLHNCQUVHLG9CQUFvQjtBQUZ2QixzQkFHRyxlQUFlO0FBSGxCLHdCQUFOO0FBQUEsRUFvREo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBL0RVOyIsCiAgIm5hbWVzIjogWyJDaGF0TWVzc2FnZVJvbGUiLCAiTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZSIsICJDaGF0SW1hZ2VNaW1lVHlwZSIsICJJbWFnZURldGFpbExldmVsIiwgIklMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIiwgInZlbmRvciIsICJncm91cCIsICJ2YWx1ZSJdCn0K
