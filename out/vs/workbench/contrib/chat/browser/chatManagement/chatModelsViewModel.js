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
import { distinct } from "../../../../../base/common/arrays.js";
import { or, matchesCamelCase, matchesWords, matchesBaseContiguousSubString } from "../../../../../base/common/filters.js";
import { Emitter } from "../../../../../base/common/event.js";
import { ILanguageModelChatMetadata, ILanguageModelsService } from "../../../chat/common/languageModels.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
const MODEL_ENTRY_TEMPLATE_ID = "model.entry.template";
const VENDOR_ENTRY_TEMPLATE_ID = "vendor.entry.template";
const GROUP_ENTRY_TEMPLATE_ID = "group.entry.template";
const wordFilter = or(matchesBaseContiguousSubString, matchesWords);
const CAPABILITY_REGEX = /@capability:\s*([^\s]+)/gi;
const PROVIDER_REGEX = /@provider:\s*((".+?")|([^\s]+))/gi;
const SEARCH_SUGGESTIONS = {
  FILTER_TYPES: [
    "@provider:",
    "@capability:"
  ],
  CAPABILITIES: [
    "@capability:tools",
    "@capability:vision",
    "@capability:agent"
  ]
};
function isLanguageModelProviderEntry(entry) {
  return entry.type === "vendor";
}
function isLanguageModelGroupEntry(entry) {
  return entry.type === "group";
}
function isStatusEntry(entry) {
  return entry.type === "status";
}
var ChatModelGroup = /* @__PURE__ */ ((ChatModelGroup2) => {
  ChatModelGroup2["Vendor"] = "vendor";
  return ChatModelGroup2;
})(ChatModelGroup || {});
let ChatModelsViewModel = class extends Disposable {
  constructor(languageModelsService) {
    super();
    this.languageModelsService = languageModelsService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._onDidChangeGrouping = this._register(new Emitter());
    this.onDidChangeGrouping = this._onDidChangeGrouping.event;
    this.languageModelGroupStatuses = [];
    this.languageModelGroups = [];
    this.collapsedGroups = /* @__PURE__ */ new Set();
    this.searchValue = "";
    this.modelsSorted = false;
    this._groupBy = "vendor" /* Vendor */;
    this._viewModelEntries = [];
    this.languageModels = [];
    this._register(this.languageModelsService.onDidChangeLanguageModels((vendor) => this.refreshVendor(vendor)));
    this._register(this.languageModelsService.onDidChangeModelVisibility(() => this.refreshVisibility()));
  }
  get groupBy() {
    return this._groupBy;
  }
  set groupBy(groupBy) {
    if (this._groupBy !== groupBy) {
      this._groupBy = groupBy;
      this.collapsedGroups.clear();
      this.languageModelGroups = this.groupModels(this.languageModels);
      this.doFilter();
      this._onDidChangeGrouping.fire(groupBy);
    }
  }
  get viewModelEntries() {
    return this._viewModelEntries;
  }
  splice(at, removed, added) {
    this._viewModelEntries.splice(at, removed, ...added);
    if (this.selectedEntry) {
      this.selectedEntry = this._viewModelEntries.find((entry) => entry.id === this.selectedEntry?.id);
    }
    this._onDidChange.fire({ at, removed, added });
  }
  shouldRefilter() {
    return !this.modelsSorted;
  }
  filter(searchValue) {
    if (searchValue !== this.searchValue) {
      this.searchValue = searchValue;
      this.collapsedGroups.clear();
      if (!this.modelsSorted) {
        this.languageModelGroups = this.groupModels(this.languageModels);
      }
      this.doFilter();
    }
    return this.viewModelEntries;
  }
  doFilter() {
    const viewModelEntries = [];
    const shouldShowGroupHeaders = this.languageModelGroups.length > 1;
    for (const group of this.languageModelGroups) {
      if (this.collapsedGroups.has(group.group.id)) {
        group.group.collapsed = true;
        if (shouldShowGroupHeaders) {
          viewModelEntries.push(group.group);
        }
        continue;
      }
      const groupEntries = [];
      if (group.status) {
        groupEntries.push(group.status);
      }
      groupEntries.push(...this.filterModels(group.models, this.searchValue));
      if (groupEntries.length > 0) {
        group.group.collapsed = false;
        if (shouldShowGroupHeaders) {
          viewModelEntries.push(group.group);
        }
        viewModelEntries.push(...groupEntries);
      }
    }
    this.splice(0, this._viewModelEntries.length, viewModelEntries);
  }
  filterModels(modelEntries, searchValue) {
    const providerNames = [];
    let providerMatch;
    PROVIDER_REGEX.lastIndex = 0;
    while ((providerMatch = PROVIDER_REGEX.exec(searchValue)) !== null) {
      const providerName = providerMatch[2] ? providerMatch[2].substring(1, providerMatch[2].length - 1) : providerMatch[3];
      providerNames.push(providerName);
    }
    if (providerNames.length > 0) {
      searchValue = searchValue.replace(PROVIDER_REGEX, "");
    }
    const capabilities = [];
    let capabilityMatch;
    CAPABILITY_REGEX.lastIndex = 0;
    while ((capabilityMatch = CAPABILITY_REGEX.exec(searchValue)) !== null) {
      capabilities.push(capabilityMatch[1].toLowerCase());
    }
    if (capabilities.length > 0) {
      searchValue = searchValue.replace(CAPABILITY_REGEX, "");
    }
    const quoteAtFirstChar = searchValue.charAt(0) === '"';
    const quoteAtLastChar = searchValue.charAt(searchValue.length - 1) === '"';
    const completeMatch = quoteAtFirstChar && quoteAtLastChar;
    if (quoteAtFirstChar) {
      searchValue = searchValue.substring(1);
    }
    if (quoteAtLastChar) {
      searchValue = searchValue.substring(0, searchValue.length - 1);
    }
    searchValue = searchValue.trim();
    const result = [];
    const words = searchValue.split(" ");
    const lowerProviders = providerNames.map((p) => p.toLowerCase().trim());
    for (const modelEntry of modelEntries) {
      if (lowerProviders.length > 0) {
        const matchesProvider = lowerProviders.some(
          (provider) => modelEntry.provider.vendor.vendor.toLowerCase() === provider || modelEntry.provider.vendor.displayName.toLowerCase() === provider
        );
        if (!matchesProvider) {
          continue;
        }
      }
      let matchedCapabilities = [];
      if (capabilities.length > 0) {
        if (!modelEntry.metadata.capabilities) {
          continue;
        }
        let matchesAll = true;
        for (const capability of capabilities) {
          const matchedForThisCapability = this.getMatchingCapabilities(modelEntry, capability);
          if (matchedForThisCapability.length === 0) {
            matchesAll = false;
            break;
          }
          matchedCapabilities.push(...matchedForThisCapability);
        }
        if (!matchesAll) {
          continue;
        }
        matchedCapabilities = distinct(matchedCapabilities);
      }
      let modelMatches;
      if (searchValue) {
        modelMatches = new ModelItemMatches(modelEntry, searchValue, words, completeMatch);
        if (!modelMatches.modelNameMatches && !modelMatches.modelIdMatches && !modelMatches.providerMatches && !modelMatches.capabilityMatches) {
          continue;
        }
      }
      const modelId = this.getModelId(modelEntry);
      result.push({
        type: "model",
        id: modelId,
        templateId: MODEL_ENTRY_TEMPLATE_ID,
        model: modelEntry,
        modelNameMatches: modelMatches?.modelNameMatches || void 0,
        modelIdMatches: modelMatches?.modelIdMatches || void 0,
        providerMatches: modelMatches?.providerMatches || void 0,
        capabilityMatches: matchedCapabilities.length ? matchedCapabilities : void 0
      });
    }
    return result;
  }
  getMatchingCapabilities(modelEntry, capability) {
    const matchedCapabilities = [];
    if (!modelEntry.metadata.capabilities) {
      return matchedCapabilities;
    }
    switch (capability) {
      case "tools":
      case "toolcalling":
        if (modelEntry.metadata.capabilities.toolCalling === true) {
          matchedCapabilities.push("toolCalling");
        }
        break;
      case "vision":
        if (modelEntry.metadata.capabilities.vision === true) {
          matchedCapabilities.push("vision");
        }
        break;
      case "agent":
      case "agentmode":
        if (modelEntry.metadata.capabilities.agentMode === true) {
          matchedCapabilities.push("agentMode");
        }
        break;
      default:
        if (modelEntry.metadata.capabilities.editTools) {
          for (const tool of modelEntry.metadata.capabilities.editTools) {
            if (tool.toLowerCase().includes(capability)) {
              matchedCapabilities.push(tool);
            }
          }
        }
        break;
    }
    return matchedCapabilities;
  }
  groupModels(languageModels) {
    const result = [];
    if (this.groupBy === "vendor" /* Vendor */) {
      for (const model of languageModels) {
        const groupId = this.getProviderGroupId(model.provider.group);
        let group = result.find((group2) => group2.group.id === groupId);
        if (!group) {
          group = {
            group: this.createLanguageModelProviderEntry(model.provider),
            models: []
          };
          result.push(group);
        }
        group.models.push(model);
      }
      for (const statusGroup of this.languageModelGroupStatuses) {
        const groupId = this.getProviderGroupId(statusGroup.provider.group);
        let group = result.find((group2) => group2.group.id === groupId);
        if (!group) {
          group = {
            group: this.createLanguageModelProviderEntry(statusGroup.provider),
            models: []
          };
          result.push(group);
        }
        group.status = {
          id: `status.${group.group.id}`,
          type: "status",
          ...statusGroup.status
        };
      }
      result.sort((a, b) => {
        if (a.models[0]?.provider.vendor.isDefault) {
          return -1;
        }
        if (b.models[0]?.provider.vendor.isDefault) {
          return 1;
        }
        return a.group.label.localeCompare(b.group.label);
      });
    }
    for (const group of result) {
      group.models.sort((a, b) => {
        if (a.provider.vendor.isDefault && b.provider.vendor.isDefault) {
          return a.metadata.name.localeCompare(b.metadata.name);
        }
        if (a.provider.vendor.isDefault) {
          return -1;
        }
        if (b.provider.vendor.isDefault) {
          return 1;
        }
        if (a.provider.group.name === b.provider.group.name) {
          return a.metadata.name.localeCompare(b.metadata.name);
        }
        return a.provider.group.name.localeCompare(b.provider.group.name);
      });
    }
    this.modelsSorted = true;
    return result;
  }
  createLanguageModelProviderEntry(provider) {
    const id = this.getProviderGroupId(provider.group);
    return {
      type: "vendor",
      id,
      label: provider.group.name,
      templateId: VENDOR_ENTRY_TEMPLATE_ID,
      collapsed: this.collapsedGroups.has(id),
      hidden: this.languageModelsService.isGroupHidden(provider.group.vendor, provider.group.name),
      vendorEntry: {
        group: provider.group,
        vendor: provider.vendor
      }
    };
  }
  getVendors() {
    return [...this.languageModelsService.getVendors()].sort((a, b) => {
      if (a.isDefault) {
        return -1;
      }
      if (b.isDefault) {
        return 1;
      }
      return a.displayName.localeCompare(b.displayName);
    });
  }
  async refresh() {
    await this.languageModelsService.selectLanguageModels({});
    await this.refreshAllVendors();
  }
  async refreshAllVendors() {
    this.languageModels = [];
    this.languageModelGroupStatuses = [];
    for (const vendor of this.getVendors()) {
      this.addVendorModels(vendor);
    }
    this.languageModelGroups = this.groupModels(this.languageModels);
    this.doFilter();
  }
  refreshVendor(vendorId) {
    const vendor = this.getVendors().find((v) => v.vendor === vendorId);
    if (!vendor) {
      return;
    }
    this.languageModels = this.languageModels.filter((m) => m.provider.vendor.vendor !== vendorId);
    this.languageModelGroupStatuses = this.languageModelGroupStatuses.filter((s) => s.provider.vendor.vendor !== vendorId);
    this.addVendorModels(vendor);
    this.languageModelGroups = this.groupModels(this.languageModels);
    this.doFilter();
  }
  addVendorModels(vendor) {
    const models = [];
    const languageModelsGroups = this.languageModelsService.getLanguageModelGroups(vendor.vendor);
    for (const group of languageModelsGroups) {
      const provider = {
        group: group.group ?? {
          vendor: vendor.vendor,
          name: vendor.displayName
        },
        vendor
      };
      if (group.status) {
        this.languageModelGroupStatuses.push({
          provider,
          status: {
            message: group.status.message,
            severity: group.status.severity
          }
        });
      }
      for (const identifier of group.modelIdentifiers) {
        const metadata = this.languageModelsService.lookupLanguageModel(identifier);
        if (!metadata) {
          continue;
        }
        if (vendor.isDefault && metadata.id === "auto") {
          continue;
        }
        if (ILanguageModelChatMetadata.getAgentHostByokManageModelsIdentifier(metadata) !== void 0) {
          continue;
        }
        models.push({
          identifier,
          metadata,
          provider,
          hidden: this.languageModelsService.isModelHidden(identifier)
        });
      }
    }
    this.languageModels.push(...models.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)));
  }
  getModelsForGroup(group) {
    if (isLanguageModelProviderEntry(group)) {
      return this.languageModels.filter(
        (m) => this.getProviderGroupId(m.provider.group) === group.id
      );
    }
    return this.languageModels;
  }
  toggleModelHidden(entry) {
    this.languageModelsService.setModelHidden(entry.model.identifier, !entry.model.hidden);
  }
  toggleGroupHidden(entry) {
    this.languageModelsService.setGroupHidden(entry.vendorEntry.group.vendor, entry.vendorEntry.group.name, !entry.hidden);
  }
  setModelsHidden(entries, hidden) {
    for (const entry of entries) {
      this.languageModelsService.setModelHidden(entry.model.identifier, hidden);
    }
  }
  refreshVisibility() {
    for (const model of this.languageModels) {
      model.hidden = this.languageModelsService.isModelHidden(model.identifier);
    }
    this.languageModelGroups = this.groupModels(this.languageModels);
    this.doFilter();
  }
  getModelId(modelEntry) {
    return `${modelEntry.provider.group.name}.${modelEntry.identifier}.${modelEntry.metadata.version}`;
  }
  getProviderGroupId(group) {
    return `${group.vendor}-${group.name}`;
  }
  toggleCollapsed(viewModelEntry) {
    const id = isLanguageModelGroupEntry(viewModelEntry) ? viewModelEntry.id : isLanguageModelProviderEntry(viewModelEntry) ? viewModelEntry.id : void 0;
    if (!id) {
      return;
    }
    this.selectedEntry = viewModelEntry;
    if (!this.collapsedGroups.delete(id)) {
      this.collapsedGroups.add(id);
    }
    this.doFilter();
  }
  collapseAll() {
    this.collapsedGroups.clear();
    for (const entry of this.viewModelEntries) {
      if (isLanguageModelProviderEntry(entry) || isLanguageModelGroupEntry(entry)) {
        this.collapsedGroups.add(entry.id);
      }
    }
    this.doFilter();
  }
  getConfiguredVendors() {
    const result = [];
    const seenVendors = /* @__PURE__ */ new Set();
    for (const modelEntry of this.languageModels) {
      if (!seenVendors.has(modelEntry.provider.group.name)) {
        seenVendors.add(modelEntry.provider.group.name);
        result.push(modelEntry.provider);
      }
    }
    return result;
  }
};
ChatModelsViewModel = __decorateClass([
  __decorateParam(0, ILanguageModelsService)
], ChatModelsViewModel);
class ModelItemMatches {
  constructor(modelEntry, searchValue, words, completeMatch) {
    this.modelNameMatches = null;
    this.modelIdMatches = null;
    this.providerMatches = null;
    this.capabilityMatches = null;
    if (!completeMatch) {
      this.modelNameMatches = modelEntry.metadata.name ? this.matches(searchValue, modelEntry.metadata.name, (word, wordToMatchAgainst) => matchesWords(word, wordToMatchAgainst, true), words) : null;
      this.modelIdMatches = this.matches(searchValue, modelEntry.metadata.id, or(matchesWords, matchesCamelCase), words);
      this.providerMatches = this.matches(searchValue, modelEntry.provider.group.name, (word, wordToMatchAgainst) => matchesWords(word, wordToMatchAgainst, true), words);
      if (modelEntry.metadata.capabilities) {
        const capabilityStrings = [];
        if (modelEntry.metadata.capabilities.toolCalling) {
          capabilityStrings.push("tools", "toolCalling");
        }
        if (modelEntry.metadata.capabilities.vision) {
          capabilityStrings.push("vision");
        }
        if (modelEntry.metadata.capabilities.agentMode) {
          capabilityStrings.push("agent", "agentMode");
        }
        if (modelEntry.metadata.capabilities.editTools) {
          capabilityStrings.push(...modelEntry.metadata.capabilities.editTools);
        }
        const capabilityString = capabilityStrings.join(" ");
        if (capabilityString) {
          this.capabilityMatches = this.matches(searchValue, capabilityString, or(matchesWords, matchesCamelCase), words);
        }
      }
    }
  }
  matches(searchValue, wordToMatchAgainst, wordMatchesFilter, words) {
    let matches = searchValue ? wordFilter(searchValue, wordToMatchAgainst) : null;
    if (!matches) {
      matches = this.matchesWords(words, wordToMatchAgainst, wordMatchesFilter);
    }
    if (matches) {
      matches = this.filterAndSort(matches);
    }
    return matches;
  }
  matchesWords(words, wordToMatchAgainst, wordMatchesFilter) {
    let matches = [];
    for (const word of words) {
      const wordMatches = wordMatchesFilter(word, wordToMatchAgainst);
      if (wordMatches) {
        matches = [...matches || [], ...wordMatches];
      } else {
        matches = null;
        break;
      }
    }
    return matches;
  }
  filterAndSort(matches) {
    return distinct(matches, ((a) => a.start + "." + a.end)).filter((match) => !matches.some((m) => !(m.start === match.start && m.end === match.end) && (m.start <= match.start && m.end >= match.end))).sort((a, b) => a.start - b.start);
  }
}
export {
  ChatModelGroup,
  ChatModelsViewModel,
  GROUP_ENTRY_TEMPLATE_ID,
  MODEL_ENTRY_TEMPLATE_ID,
  SEARCH_SUGGESTIONS,
  VENDOR_ENTRY_TEMPLATE_ID,
  isLanguageModelGroupEntry,
  isLanguageModelProviderEntry,
  isStatusEntry
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0TWFuYWdlbWVudC9jaGF0TW9kZWxzVmlld01vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgSU1hdGNoLCBJRmlsdGVyLCBvciwgbWF0Y2hlc0NhbWVsQ2FzZSwgbWF0Y2hlc1dvcmRzLCBtYXRjaGVzQmFzZUNvbnRpZ3VvdXNTdWJTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3IsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcblxuZXhwb3J0IGNvbnN0IE1PREVMX0VOVFJZX1RFTVBMQVRFX0lEID0gJ21vZGVsLmVudHJ5LnRlbXBsYXRlJztcbmV4cG9ydCBjb25zdCBWRU5ET1JfRU5UUllfVEVNUExBVEVfSUQgPSAndmVuZG9yLmVudHJ5LnRlbXBsYXRlJztcbmV4cG9ydCBjb25zdCBHUk9VUF9FTlRSWV9URU1QTEFURV9JRCA9ICdncm91cC5lbnRyeS50ZW1wbGF0ZSc7XG5cbmNvbnN0IHdvcmRGaWx0ZXIgPSBvcihtYXRjaGVzQmFzZUNvbnRpZ3VvdXNTdWJTdHJpbmcsIG1hdGNoZXNXb3Jkcyk7XG5jb25zdCBDQVBBQklMSVRZX1JFR0VYID0gL0BjYXBhYmlsaXR5OlxccyooW15cXHNdKykvZ2k7XG5jb25zdCBQUk9WSURFUl9SRUdFWCA9IC9AcHJvdmlkZXI6XFxzKigoXCIuKz9cIil8KFteXFxzXSspKS9naTtcblxuZXhwb3J0IGNvbnN0IFNFQVJDSF9TVUdHRVNUSU9OUyA9IHtcblx0RklMVEVSX1RZUEVTOiBbXG5cdFx0J0Bwcm92aWRlcjonLFxuXHRcdCdAY2FwYWJpbGl0eTonLFxuXHRdLFxuXHRDQVBBQklMSVRJRVM6IFtcblx0XHQnQGNhcGFiaWxpdHk6dG9vbHMnLFxuXHRcdCdAY2FwYWJpbGl0eTp2aXNpb24nLFxuXHRcdCdAY2FwYWJpbGl0eTphZ2VudCdcblx0XSxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlTW9kZWxQcm92aWRlciB7XG5cdHZlbmRvcjogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3I7XG5cdGdyb3VwOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMYW5ndWFnZU1vZGVsIGV4dGVuZHMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHtcblx0cHJvdmlkZXI6IElMYW5ndWFnZU1vZGVsUHJvdmlkZXI7XG5cdGhpZGRlbjogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbEVudHJ5IHtcblx0dHlwZTogJ21vZGVsJztcblx0aWQ6IHN0cmluZztcblx0dGVtcGxhdGVJZDogc3RyaW5nO1xuXHRtb2RlbDogSUxhbmd1YWdlTW9kZWw7XG5cdHByb3ZpZGVyTWF0Y2hlcz86IElNYXRjaFtdO1xuXHRtb2RlbE5hbWVNYXRjaGVzPzogSU1hdGNoW107XG5cdG1vZGVsSWRNYXRjaGVzPzogSU1hdGNoW107XG5cdGNhcGFiaWxpdHlNYXRjaGVzPzogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlTW9kZWxHcm91cEVudHJ5IHtcblx0dHlwZTogJ2dyb3VwJztcblx0aWQ6IHN0cmluZztcblx0bGFiZWw6IHN0cmluZztcblx0Y29sbGFwc2VkOiBib29sZWFuO1xuXHR0ZW1wbGF0ZUlkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5IHtcblx0dHlwZTogJ3ZlbmRvcic7XG5cdGlkOiBzdHJpbmc7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdHRlbXBsYXRlSWQ6IHN0cmluZztcblx0Y29sbGFwc2VkOiBib29sZWFuO1xuXHRoaWRkZW46IGJvb2xlYW47XG5cdHZlbmRvckVudHJ5OiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdGF0dXNFbnRyeSB7XG5cdHR5cGU6ICdzdGF0dXMnO1xuXHRpZDogc3RyaW5nO1xuXHRtZXNzYWdlOiBzdHJpbmc7XG5cdHNldmVyaXR5OiBTZXZlcml0eTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VNb2RlbEVudHJpZXNHcm91cCB7XG5cdGdyb3VwOiBJTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkgfCBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnk7XG5cdG1vZGVsczogSUxhbmd1YWdlTW9kZWxbXTtcblx0c3RhdHVzPzogSVN0YXR1c0VudHJ5O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShlbnRyeTogSVZpZXdNb2RlbEVudHJ5KTogZW50cnkgaXMgSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5IHtcblx0cmV0dXJuIGVudHJ5LnR5cGUgPT09ICd2ZW5kb3InO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShlbnRyeTogSVZpZXdNb2RlbEVudHJ5KTogZW50cnkgaXMgSUxhbmd1YWdlTW9kZWxHcm91cEVudHJ5IHtcblx0cmV0dXJuIGVudHJ5LnR5cGUgPT09ICdncm91cCc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0YXR1c0VudHJ5KGVudHJ5OiBJVmlld01vZGVsRW50cnkpOiBlbnRyeSBpcyBJU3RhdHVzRW50cnkge1xuXHRyZXR1cm4gZW50cnkudHlwZSA9PT0gJ3N0YXR1cyc7XG59XG5cbmV4cG9ydCB0eXBlIElWaWV3TW9kZWxFbnRyeSA9IElMYW5ndWFnZU1vZGVsRW50cnkgfCBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkgfCBJTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkgfCBJU3RhdHVzRW50cnk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZpZXdNb2RlbENoYW5nZUV2ZW50IHtcblx0YXQ6IG51bWJlcjtcblx0cmVtb3ZlZDogbnVtYmVyO1xuXHRhZGRlZDogSVZpZXdNb2RlbEVudHJ5W107XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIENoYXRNb2RlbEdyb3VwIHtcblx0VmVuZG9yID0gJ3ZlbmRvcicsXG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0TW9kZWxzVmlld01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVmlld01vZGVsQ2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlR3JvdXBpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxDaGF0TW9kZWxHcm91cD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlR3JvdXBpbmcgPSB0aGlzLl9vbkRpZENoYW5nZUdyb3VwaW5nLmV2ZW50O1xuXG5cdHByaXZhdGUgbGFuZ3VhZ2VNb2RlbHM6IElMYW5ndWFnZU1vZGVsW107XG5cdHByaXZhdGUgbGFuZ3VhZ2VNb2RlbEdyb3VwU3RhdHVzZXM6IEFycmF5PHsgcHJvdmlkZXI6IElMYW5ndWFnZU1vZGVsUHJvdmlkZXI7IHN0YXR1czogeyBzZXZlcml0eTogU2V2ZXJpdHk7IG1lc3NhZ2U6IHN0cmluZyB9IH0+ID0gW107XG5cdHByaXZhdGUgbGFuZ3VhZ2VNb2RlbEdyb3VwczogSUxhbmd1YWdlTW9kZWxFbnRyaWVzR3JvdXBbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29sbGFwc2VkR3JvdXBzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgc2VhcmNoVmFsdWU6IHN0cmluZyA9ICcnO1xuXHRwcml2YXRlIG1vZGVsc1NvcnRlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX2dyb3VwQnk6IENoYXRNb2RlbEdyb3VwID0gQ2hhdE1vZGVsR3JvdXAuVmVuZG9yO1xuXHRnZXQgZ3JvdXBCeSgpOiBDaGF0TW9kZWxHcm91cCB7IHJldHVybiB0aGlzLl9ncm91cEJ5OyB9XG5cdHNldCBncm91cEJ5KGdyb3VwQnk6IENoYXRNb2RlbEdyb3VwKSB7XG5cdFx0aWYgKHRoaXMuX2dyb3VwQnkgIT09IGdyb3VwQnkpIHtcblx0XHRcdHRoaXMuX2dyb3VwQnkgPSBncm91cEJ5O1xuXHRcdFx0dGhpcy5jb2xsYXBzZWRHcm91cHMuY2xlYXIoKTtcblx0XHRcdHRoaXMubGFuZ3VhZ2VNb2RlbEdyb3VwcyA9IHRoaXMuZ3JvdXBNb2RlbHModGhpcy5sYW5ndWFnZU1vZGVscyk7XG5cdFx0XHR0aGlzLmRvRmlsdGVyKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUdyb3VwaW5nLmZpcmUoZ3JvdXBCeSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5sYW5ndWFnZU1vZGVscyA9IFtdO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHModmVuZG9yID0+IHRoaXMucmVmcmVzaFZlbmRvcih2ZW5kb3IpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2Uub25EaWRDaGFuZ2VNb2RlbFZpc2liaWxpdHkoKCkgPT4gdGhpcy5yZWZyZXNoVmlzaWJpbGl0eSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3TW9kZWxFbnRyaWVzOiBJVmlld01vZGVsRW50cnlbXSA9IFtdO1xuXHRnZXQgdmlld01vZGVsRW50cmllcygpOiByZWFkb25seSBJVmlld01vZGVsRW50cnlbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXdNb2RlbEVudHJpZXM7XG5cdH1cblx0cHJpdmF0ZSBzcGxpY2UoYXQ6IG51bWJlciwgcmVtb3ZlZDogbnVtYmVyLCBhZGRlZDogSVZpZXdNb2RlbEVudHJ5W10pOiB2b2lkIHtcblx0XHR0aGlzLl92aWV3TW9kZWxFbnRyaWVzLnNwbGljZShhdCwgcmVtb3ZlZCwgLi4uYWRkZWQpO1xuXHRcdGlmICh0aGlzLnNlbGVjdGVkRW50cnkpIHtcblx0XHRcdHRoaXMuc2VsZWN0ZWRFbnRyeSA9IHRoaXMuX3ZpZXdNb2RlbEVudHJpZXMuZmluZChlbnRyeSA9PiBlbnRyeS5pZCA9PT0gdGhpcy5zZWxlY3RlZEVudHJ5Py5pZCk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBhdCwgcmVtb3ZlZCwgYWRkZWQgfSk7XG5cdH1cblxuXHRzZWxlY3RlZEVudHJ5OiBJVmlld01vZGVsRW50cnkgfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIHNob3VsZFJlZmlsdGVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5tb2RlbHNTb3J0ZWQ7XG5cdH1cblxuXHRmaWx0ZXIoc2VhcmNoVmFsdWU6IHN0cmluZyk6IHJlYWRvbmx5IElWaWV3TW9kZWxFbnRyeVtdIHtcblx0XHRpZiAoc2VhcmNoVmFsdWUgIT09IHRoaXMuc2VhcmNoVmFsdWUpIHtcblx0XHRcdHRoaXMuc2VhcmNoVmFsdWUgPSBzZWFyY2hWYWx1ZTtcblx0XHRcdHRoaXMuY29sbGFwc2VkR3JvdXBzLmNsZWFyKCk7XG5cdFx0XHRpZiAoIXRoaXMubW9kZWxzU29ydGVkKSB7XG5cdFx0XHRcdHRoaXMubGFuZ3VhZ2VNb2RlbEdyb3VwcyA9IHRoaXMuZ3JvdXBNb2RlbHModGhpcy5sYW5ndWFnZU1vZGVscyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRvRmlsdGVyKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbEVudHJpZXM7XG5cdH1cblxuXHRwcml2YXRlIGRvRmlsdGVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdNb2RlbEVudHJpZXM6IElWaWV3TW9kZWxFbnRyeVtdID0gW107XG5cdFx0Y29uc3Qgc2hvdWxkU2hvd0dyb3VwSGVhZGVycyA9IHRoaXMubGFuZ3VhZ2VNb2RlbEdyb3Vwcy5sZW5ndGggPiAxO1xuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmxhbmd1YWdlTW9kZWxHcm91cHMpIHtcblx0XHRcdGlmICh0aGlzLmNvbGxhcHNlZEdyb3Vwcy5oYXMoZ3JvdXAuZ3JvdXAuaWQpKSB7XG5cdFx0XHRcdGdyb3VwLmdyb3VwLmNvbGxhcHNlZCA9IHRydWU7XG5cdFx0XHRcdGlmIChzaG91bGRTaG93R3JvdXBIZWFkZXJzKSB7XG5cdFx0XHRcdFx0dmlld01vZGVsRW50cmllcy5wdXNoKGdyb3VwLmdyb3VwKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZ3JvdXBFbnRyaWVzOiBJVmlld01vZGVsRW50cnlbXSA9IFtdO1xuXHRcdFx0aWYgKGdyb3VwLnN0YXR1cykge1xuXHRcdFx0XHRncm91cEVudHJpZXMucHVzaChncm91cC5zdGF0dXMpO1xuXHRcdFx0fVxuXG5cdFx0XHRncm91cEVudHJpZXMucHVzaCguLi50aGlzLmZpbHRlck1vZGVscyhncm91cC5tb2RlbHMsIHRoaXMuc2VhcmNoVmFsdWUpKTtcblxuXHRcdFx0aWYgKGdyb3VwRW50cmllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGdyb3VwLmdyb3VwLmNvbGxhcHNlZCA9IGZhbHNlO1xuXHRcdFx0XHRpZiAoc2hvdWxkU2hvd0dyb3VwSGVhZGVycykge1xuXHRcdFx0XHRcdHZpZXdNb2RlbEVudHJpZXMucHVzaChncm91cC5ncm91cCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dmlld01vZGVsRW50cmllcy5wdXNoKC4uLmdyb3VwRW50cmllcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuc3BsaWNlKDAsIHRoaXMuX3ZpZXdNb2RlbEVudHJpZXMubGVuZ3RoLCB2aWV3TW9kZWxFbnRyaWVzKTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyTW9kZWxzKG1vZGVsRW50cmllczogSUxhbmd1YWdlTW9kZWxbXSwgc2VhcmNoVmFsdWU6IHN0cmluZyk6IElWaWV3TW9kZWxFbnRyeVtdIHtcblx0XHRjb25zdCBwcm92aWRlck5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBwcm92aWRlck1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXHRcdFBST1ZJREVSX1JFR0VYLmxhc3RJbmRleCA9IDA7XG5cdFx0d2hpbGUgKChwcm92aWRlck1hdGNoID0gUFJPVklERVJfUkVHRVguZXhlYyhzZWFyY2hWYWx1ZSkpICE9PSBudWxsKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlck5hbWUgPSBwcm92aWRlck1hdGNoWzJdID8gcHJvdmlkZXJNYXRjaFsyXS5zdWJzdHJpbmcoMSwgcHJvdmlkZXJNYXRjaFsyXS5sZW5ndGggLSAxKSA6IHByb3ZpZGVyTWF0Y2hbM107XG5cdFx0XHRwcm92aWRlck5hbWVzLnB1c2gocHJvdmlkZXJOYW1lKTtcblx0XHR9XG5cdFx0aWYgKHByb3ZpZGVyTmFtZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0c2VhcmNoVmFsdWUgPSBzZWFyY2hWYWx1ZS5yZXBsYWNlKFBST1ZJREVSX1JFR0VYLCAnJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FwYWJpbGl0aWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBjYXBhYmlsaXR5TWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdFx0Q0FQQUJJTElUWV9SRUdFWC5sYXN0SW5kZXggPSAwO1xuXHRcdHdoaWxlICgoY2FwYWJpbGl0eU1hdGNoID0gQ0FQQUJJTElUWV9SRUdFWC5leGVjKHNlYXJjaFZhbHVlKSkgIT09IG51bGwpIHtcblx0XHRcdGNhcGFiaWxpdGllcy5wdXNoKGNhcGFiaWxpdHlNYXRjaFsxXS50b0xvd2VyQ2FzZSgpKTtcblx0XHR9XG5cdFx0aWYgKGNhcGFiaWxpdGllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRzZWFyY2hWYWx1ZSA9IHNlYXJjaFZhbHVlLnJlcGxhY2UoQ0FQQUJJTElUWV9SRUdFWCwgJycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1b3RlQXRGaXJzdENoYXIgPSBzZWFyY2hWYWx1ZS5jaGFyQXQoMCkgPT09ICdcIic7XG5cdFx0Y29uc3QgcXVvdGVBdExhc3RDaGFyID0gc2VhcmNoVmFsdWUuY2hhckF0KHNlYXJjaFZhbHVlLmxlbmd0aCAtIDEpID09PSAnXCInO1xuXHRcdGNvbnN0IGNvbXBsZXRlTWF0Y2ggPSBxdW90ZUF0Rmlyc3RDaGFyICYmIHF1b3RlQXRMYXN0Q2hhcjtcblx0XHRpZiAocXVvdGVBdEZpcnN0Q2hhcikge1xuXHRcdFx0c2VhcmNoVmFsdWUgPSBzZWFyY2hWYWx1ZS5zdWJzdHJpbmcoMSk7XG5cdFx0fVxuXHRcdGlmIChxdW90ZUF0TGFzdENoYXIpIHtcblx0XHRcdHNlYXJjaFZhbHVlID0gc2VhcmNoVmFsdWUuc3Vic3RyaW5nKDAsIHNlYXJjaFZhbHVlLmxlbmd0aCAtIDEpO1xuXHRcdH1cblx0XHRzZWFyY2hWYWx1ZSA9IHNlYXJjaFZhbHVlLnRyaW0oKTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSVZpZXdNb2RlbEVudHJ5W10gPSBbXTtcblx0XHRjb25zdCB3b3JkcyA9IHNlYXJjaFZhbHVlLnNwbGl0KCcgJyk7XG5cdFx0Y29uc3QgbG93ZXJQcm92aWRlcnMgPSBwcm92aWRlck5hbWVzLm1hcChwID0+IHAudG9Mb3dlckNhc2UoKS50cmltKCkpO1xuXG5cdFx0Zm9yIChjb25zdCBtb2RlbEVudHJ5IG9mIG1vZGVsRW50cmllcykge1xuXHRcdFx0aWYgKGxvd2VyUHJvdmlkZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgbWF0Y2hlc1Byb3ZpZGVyID0gbG93ZXJQcm92aWRlcnMuc29tZShwcm92aWRlciA9PlxuXHRcdFx0XHRcdG1vZGVsRW50cnkucHJvdmlkZXIudmVuZG9yLnZlbmRvci50b0xvd2VyQ2FzZSgpID09PSBwcm92aWRlciB8fFxuXHRcdFx0XHRcdG1vZGVsRW50cnkucHJvdmlkZXIudmVuZG9yLmRpc3BsYXlOYW1lLnRvTG93ZXJDYXNlKCkgPT09IHByb3ZpZGVyXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGlmICghbWF0Y2hlc1Byb3ZpZGVyKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gRmlsdGVyIGJ5IGNhcGFiaWxpdGllc1xuXHRcdFx0bGV0IG1hdGNoZWRDYXBhYmlsaXRpZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRpZiAoY2FwYWJpbGl0aWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0aWYgKCFtb2RlbEVudHJ5Lm1ldGFkYXRhLmNhcGFiaWxpdGllcykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCBtYXRjaGVzQWxsID0gdHJ1ZTtcblx0XHRcdFx0Zm9yIChjb25zdCBjYXBhYmlsaXR5IG9mIGNhcGFiaWxpdGllcykge1xuXHRcdFx0XHRcdGNvbnN0IG1hdGNoZWRGb3JUaGlzQ2FwYWJpbGl0eSA9IHRoaXMuZ2V0TWF0Y2hpbmdDYXBhYmlsaXRpZXMobW9kZWxFbnRyeSwgY2FwYWJpbGl0eSk7XG5cdFx0XHRcdFx0aWYgKG1hdGNoZWRGb3JUaGlzQ2FwYWJpbGl0eS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdG1hdGNoZXNBbGwgPSBmYWxzZTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRtYXRjaGVkQ2FwYWJpbGl0aWVzLnB1c2goLi4ubWF0Y2hlZEZvclRoaXNDYXBhYmlsaXR5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIW1hdGNoZXNBbGwpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtYXRjaGVkQ2FwYWJpbGl0aWVzID0gZGlzdGluY3QobWF0Y2hlZENhcGFiaWxpdGllcyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpbHRlciBieSB0ZXh0XG5cdFx0XHRsZXQgbW9kZWxNYXRjaGVzOiBNb2RlbEl0ZW1NYXRjaGVzIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHNlYXJjaFZhbHVlKSB7XG5cdFx0XHRcdG1vZGVsTWF0Y2hlcyA9IG5ldyBNb2RlbEl0ZW1NYXRjaGVzKG1vZGVsRW50cnksIHNlYXJjaFZhbHVlLCB3b3JkcywgY29tcGxldGVNYXRjaCk7XG5cdFx0XHRcdGlmICghbW9kZWxNYXRjaGVzLm1vZGVsTmFtZU1hdGNoZXMgJiYgIW1vZGVsTWF0Y2hlcy5tb2RlbElkTWF0Y2hlcyAmJiAhbW9kZWxNYXRjaGVzLnByb3ZpZGVyTWF0Y2hlcyAmJiAhbW9kZWxNYXRjaGVzLmNhcGFiaWxpdHlNYXRjaGVzKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9kZWxJZCA9IHRoaXMuZ2V0TW9kZWxJZChtb2RlbEVudHJ5KTtcblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0dHlwZTogJ21vZGVsJyxcblx0XHRcdFx0aWQ6IG1vZGVsSWQsXG5cdFx0XHRcdHRlbXBsYXRlSWQ6IE1PREVMX0VOVFJZX1RFTVBMQVRFX0lELFxuXHRcdFx0XHRtb2RlbDogbW9kZWxFbnRyeSxcblx0XHRcdFx0bW9kZWxOYW1lTWF0Y2hlczogbW9kZWxNYXRjaGVzPy5tb2RlbE5hbWVNYXRjaGVzIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0bW9kZWxJZE1hdGNoZXM6IG1vZGVsTWF0Y2hlcz8ubW9kZWxJZE1hdGNoZXMgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRwcm92aWRlck1hdGNoZXM6IG1vZGVsTWF0Y2hlcz8ucHJvdmlkZXJNYXRjaGVzIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0Y2FwYWJpbGl0eU1hdGNoZXM6IG1hdGNoZWRDYXBhYmlsaXRpZXMubGVuZ3RoID8gbWF0Y2hlZENhcGFiaWxpdGllcyA6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYXRjaGluZ0NhcGFiaWxpdGllcyhtb2RlbEVudHJ5OiBJTGFuZ3VhZ2VNb2RlbCwgY2FwYWJpbGl0eTogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IG1hdGNoZWRDYXBhYmlsaXRpZXM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKCFtb2RlbEVudHJ5Lm1ldGFkYXRhLmNhcGFiaWxpdGllcykge1xuXHRcdFx0cmV0dXJuIG1hdGNoZWRDYXBhYmlsaXRpZXM7XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChjYXBhYmlsaXR5KSB7XG5cdFx0XHRjYXNlICd0b29scyc6XG5cdFx0XHRjYXNlICd0b29sY2FsbGluZyc6XG5cdFx0XHRcdGlmIChtb2RlbEVudHJ5Lm1ldGFkYXRhLmNhcGFiaWxpdGllcy50b29sQ2FsbGluZyA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdG1hdGNoZWRDYXBhYmlsaXRpZXMucHVzaCgndG9vbENhbGxpbmcnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3Zpc2lvbic6XG5cdFx0XHRcdGlmIChtb2RlbEVudHJ5Lm1ldGFkYXRhLmNhcGFiaWxpdGllcy52aXNpb24gPT09IHRydWUpIHtcblx0XHRcdFx0XHRtYXRjaGVkQ2FwYWJpbGl0aWVzLnB1c2goJ3Zpc2lvbicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnYWdlbnQnOlxuXHRcdFx0Y2FzZSAnYWdlbnRtb2RlJzpcblx0XHRcdFx0aWYgKG1vZGVsRW50cnkubWV0YWRhdGEuY2FwYWJpbGl0aWVzLmFnZW50TW9kZSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdG1hdGNoZWRDYXBhYmlsaXRpZXMucHVzaCgnYWdlbnRNb2RlJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHQvLyBDaGVjayBlZGl0IHRvb2xzXG5cdFx0XHRcdGlmIChtb2RlbEVudHJ5Lm1ldGFkYXRhLmNhcGFiaWxpdGllcy5lZGl0VG9vbHMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgbW9kZWxFbnRyeS5tZXRhZGF0YS5jYXBhYmlsaXRpZXMuZWRpdFRvb2xzKSB7XG5cdFx0XHRcdFx0XHRpZiAodG9vbC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGNhcGFiaWxpdHkpKSB7XG5cdFx0XHRcdFx0XHRcdG1hdGNoZWRDYXBhYmlsaXRpZXMucHVzaCh0b29sKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdHJldHVybiBtYXRjaGVkQ2FwYWJpbGl0aWVzO1xuXHR9XG5cblx0cHJpdmF0ZSBncm91cE1vZGVscyhsYW5ndWFnZU1vZGVsczogSUxhbmd1YWdlTW9kZWxbXSk6IElMYW5ndWFnZU1vZGVsRW50cmllc0dyb3VwW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUxhbmd1YWdlTW9kZWxFbnRyaWVzR3JvdXBbXSA9IFtdO1xuXHRcdGlmICh0aGlzLmdyb3VwQnkgPT09IENoYXRNb2RlbEdyb3VwLlZlbmRvcikge1xuXHRcdFx0Zm9yIChjb25zdCBtb2RlbCBvZiBsYW5ndWFnZU1vZGVscykge1xuXHRcdFx0XHRjb25zdCBncm91cElkID0gdGhpcy5nZXRQcm92aWRlckdyb3VwSWQobW9kZWwucHJvdmlkZXIuZ3JvdXApO1xuXHRcdFx0XHRsZXQgZ3JvdXAgPSByZXN1bHQuZmluZChncm91cCA9PiBncm91cC5ncm91cC5pZCA9PT0gZ3JvdXBJZCk7XG5cdFx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0XHRncm91cCA9IHtcblx0XHRcdFx0XHRcdGdyb3VwOiB0aGlzLmNyZWF0ZUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KG1vZGVsLnByb3ZpZGVyKSxcblx0XHRcdFx0XHRcdG1vZGVsczogW10sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChncm91cCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Z3JvdXAubW9kZWxzLnB1c2gobW9kZWwpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBzdGF0dXNHcm91cCBvZiB0aGlzLmxhbmd1YWdlTW9kZWxHcm91cFN0YXR1c2VzKSB7XG5cdFx0XHRcdGNvbnN0IGdyb3VwSWQgPSB0aGlzLmdldFByb3ZpZGVyR3JvdXBJZChzdGF0dXNHcm91cC5wcm92aWRlci5ncm91cCk7XG5cdFx0XHRcdGxldCBncm91cCA9IHJlc3VsdC5maW5kKGdyb3VwID0+IGdyb3VwLmdyb3VwLmlkID09PSBncm91cElkKTtcblx0XHRcdFx0aWYgKCFncm91cCkge1xuXHRcdFx0XHRcdGdyb3VwID0ge1xuXHRcdFx0XHRcdFx0Z3JvdXA6IHRoaXMuY3JlYXRlTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkoc3RhdHVzR3JvdXAucHJvdmlkZXIpLFxuXHRcdFx0XHRcdFx0bW9kZWxzOiBbXSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGdyb3VwKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRncm91cC5zdGF0dXMgPSB7XG5cdFx0XHRcdFx0aWQ6IGBzdGF0dXMuJHtncm91cC5ncm91cC5pZH1gLFxuXHRcdFx0XHRcdHR5cGU6ICdzdGF0dXMnLFxuXHRcdFx0XHRcdC4uLnN0YXR1c0dyb3VwLnN0YXR1cyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRcdGlmIChhLm1vZGVsc1swXT8ucHJvdmlkZXIudmVuZG9yLmlzRGVmYXVsdCkgeyByZXR1cm4gLTE7IH1cblx0XHRcdFx0aWYgKGIubW9kZWxzWzBdPy5wcm92aWRlci52ZW5kb3IuaXNEZWZhdWx0KSB7IHJldHVybiAxOyB9XG5cdFx0XHRcdHJldHVybiBhLmdyb3VwLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5ncm91cC5sYWJlbCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiByZXN1bHQpIHtcblx0XHRcdGdyb3VwLm1vZGVscy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRcdGlmIChhLnByb3ZpZGVyLnZlbmRvci5pc0RlZmF1bHQgJiYgYi5wcm92aWRlci52ZW5kb3IuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGEubWV0YWRhdGEubmFtZS5sb2NhbGVDb21wYXJlKGIubWV0YWRhdGEubmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGEucHJvdmlkZXIudmVuZG9yLmlzRGVmYXVsdCkgeyByZXR1cm4gLTE7IH1cblx0XHRcdFx0aWYgKGIucHJvdmlkZXIudmVuZG9yLmlzRGVmYXVsdCkgeyByZXR1cm4gMTsgfVxuXHRcdFx0XHRpZiAoYS5wcm92aWRlci5ncm91cC5uYW1lID09PSBiLnByb3ZpZGVyLmdyb3VwLm5hbWUpIHtcblx0XHRcdFx0XHRyZXR1cm4gYS5tZXRhZGF0YS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5tZXRhZGF0YS5uYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYS5wcm92aWRlci5ncm91cC5uYW1lLmxvY2FsZUNvbXBhcmUoYi5wcm92aWRlci5ncm91cC5uYW1lKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHR0aGlzLm1vZGVsc1NvcnRlZCA9IHRydWU7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkocHJvdmlkZXI6IElMYW5ndWFnZU1vZGVsUHJvdmlkZXIpOiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkge1xuXHRcdGNvbnN0IGlkID0gdGhpcy5nZXRQcm92aWRlckdyb3VwSWQocHJvdmlkZXIuZ3JvdXApO1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAndmVuZG9yJyxcblx0XHRcdGlkLFxuXHRcdFx0bGFiZWw6IHByb3ZpZGVyLmdyb3VwLm5hbWUsXG5cdFx0XHR0ZW1wbGF0ZUlkOiBWRU5ET1JfRU5UUllfVEVNUExBVEVfSUQsXG5cdFx0XHRjb2xsYXBzZWQ6IHRoaXMuY29sbGFwc2VkR3JvdXBzLmhhcyhpZCksXG5cdFx0XHRoaWRkZW46IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmlzR3JvdXBIaWRkZW4ocHJvdmlkZXIuZ3JvdXAudmVuZG9yLCBwcm92aWRlci5ncm91cC5uYW1lKSxcblx0XHRcdHZlbmRvckVudHJ5OiB7XG5cdFx0XHRcdGdyb3VwOiBwcm92aWRlci5ncm91cCxcblx0XHRcdFx0dmVuZG9yOiBwcm92aWRlci52ZW5kb3Jcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdGdldFZlbmRvcnMoKTogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3JbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRWZW5kb3JzKCldLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGlmIChhLmlzRGVmYXVsdCkgeyByZXR1cm4gLTE7IH1cblx0XHRcdGlmIChiLmlzRGVmYXVsdCkgeyByZXR1cm4gMTsgfVxuXHRcdFx0cmV0dXJuIGEuZGlzcGxheU5hbWUubG9jYWxlQ29tcGFyZShiLmRpc3BsYXlOYW1lKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJlZnJlc2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2Uuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoe30pO1xuXHRcdGF3YWl0IHRoaXMucmVmcmVzaEFsbFZlbmRvcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVmcmVzaEFsbFZlbmRvcnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sYW5ndWFnZU1vZGVscyA9IFtdO1xuXHRcdHRoaXMubGFuZ3VhZ2VNb2RlbEdyb3VwU3RhdHVzZXMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IHZlbmRvciBvZiB0aGlzLmdldFZlbmRvcnMoKSkge1xuXHRcdFx0dGhpcy5hZGRWZW5kb3JNb2RlbHModmVuZG9yKTtcblx0XHR9XG5cdFx0dGhpcy5sYW5ndWFnZU1vZGVsR3JvdXBzID0gdGhpcy5ncm91cE1vZGVscyh0aGlzLmxhbmd1YWdlTW9kZWxzKTtcblx0XHR0aGlzLmRvRmlsdGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hWZW5kb3IodmVuZG9ySWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHZlbmRvciA9IHRoaXMuZ2V0VmVuZG9ycygpLmZpbmQodiA9PiB2LnZlbmRvciA9PT0gdmVuZG9ySWQpO1xuXHRcdGlmICghdmVuZG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIGV4aXN0aW5nIG1vZGVscyBmb3IgdGhpcyB2ZW5kb3Jcblx0XHR0aGlzLmxhbmd1YWdlTW9kZWxzID0gdGhpcy5sYW5ndWFnZU1vZGVscy5maWx0ZXIobSA9PiBtLnByb3ZpZGVyLnZlbmRvci52ZW5kb3IgIT09IHZlbmRvcklkKTtcblx0XHR0aGlzLmxhbmd1YWdlTW9kZWxHcm91cFN0YXR1c2VzID0gdGhpcy5sYW5ndWFnZU1vZGVsR3JvdXBTdGF0dXNlcy5maWx0ZXIocyA9PiBzLnByb3ZpZGVyLnZlbmRvci52ZW5kb3IgIT09IHZlbmRvcklkKTtcblxuXHRcdC8vIEFkZCB1cGRhdGVkIG1vZGVscyBmb3IgdGhpcyB2ZW5kb3Jcblx0XHR0aGlzLmFkZFZlbmRvck1vZGVscyh2ZW5kb3IpO1xuXHRcdHRoaXMubGFuZ3VhZ2VNb2RlbEdyb3VwcyA9IHRoaXMuZ3JvdXBNb2RlbHModGhpcy5sYW5ndWFnZU1vZGVscyk7XG5cdFx0dGhpcy5kb0ZpbHRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRWZW5kb3JNb2RlbHModmVuZG9yOiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvcik6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsczogSUxhbmd1YWdlTW9kZWxbXSA9IFtdO1xuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzR3JvdXBzID0gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbEdyb3Vwcyh2ZW5kb3IudmVuZG9yKTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGxhbmd1YWdlTW9kZWxzR3JvdXBzKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlcjogSUxhbmd1YWdlTW9kZWxQcm92aWRlciA9IHtcblx0XHRcdFx0Z3JvdXA6IGdyb3VwLmdyb3VwID8/IHtcblx0XHRcdFx0XHR2ZW5kb3I6IHZlbmRvci52ZW5kb3IsXG5cdFx0XHRcdFx0bmFtZTogdmVuZG9yLmRpc3BsYXlOYW1lXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZlbmRvclxuXHRcdFx0fTtcblx0XHRcdGlmIChncm91cC5zdGF0dXMpIHtcblx0XHRcdFx0dGhpcy5sYW5ndWFnZU1vZGVsR3JvdXBTdGF0dXNlcy5wdXNoKHtcblx0XHRcdFx0XHRwcm92aWRlcixcblx0XHRcdFx0XHRzdGF0dXM6IHtcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGdyb3VwLnN0YXR1cy5tZXNzYWdlLFxuXHRcdFx0XHRcdFx0c2V2ZXJpdHk6IGdyb3VwLnN0YXR1cy5zZXZlcml0eVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGlkZW50aWZpZXIgb2YgZ3JvdXAubW9kZWxJZGVudGlmaWVycykge1xuXHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwoaWRlbnRpZmllcik7XG5cdFx0XHRcdGlmICghbWV0YWRhdGEpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodmVuZG9yLmlzRGVmYXVsdCAmJiBtZXRhZGF0YS5pZCA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQWdlbnQtaG9zdCBCWU9LIG1vZGVscyBhcmUgY29waWVzIG9mIHRoZSB1c2VyJ3Mgb3duIEJZT0sgbW9kZWxzIHN1cmZhY2VkXG5cdFx0XHRcdC8vIGJ5IGFuIGFnZW50IGhvc3QgKGUuZy4gQ29waWxvdCBDTEkpLiBUaGV5IGFscmVhZHkgYXBwZWFyIHVuZGVyIHRoZWlyIHJlYWxcblx0XHRcdFx0Ly8gcHJvdmlkZXIgZ3JvdXAsIHNvIGxpc3RpbmcgdGhlbSBhZ2FpbiB1bmRlciB0aGUgYWdlbnQtaG9zdCB2ZW5kb3Igd291bGRcblx0XHRcdFx0Ly8gZHVwbGljYXRlIHRoZSBlbnRpcmUgQllPSyBjYXRhbG9ndWUgKGUuZy4gaHVuZHJlZHMgb2YgT3BlblJvdXRlciBtb2RlbHNcblx0XHRcdFx0Ly8gdW5kZXIgXCJDb3BpbG90XCIpLiBTa2lwIHRoZW0gaGVyZS5cblx0XHRcdFx0aWYgKElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLmdldEFnZW50SG9zdEJ5b2tNYW5hZ2VNb2RlbHNJZGVudGlmaWVyKG1ldGFkYXRhKSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0bW9kZWxzLnB1c2goe1xuXHRcdFx0XHRcdGlkZW50aWZpZXIsXG5cdFx0XHRcdFx0bWV0YWRhdGEsXG5cdFx0XHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRcdFx0aGlkZGVuOiB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5pc01vZGVsSGlkZGVuKGlkZW50aWZpZXIpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5sYW5ndWFnZU1vZGVscy5wdXNoKC4uLm1vZGVscy5zb3J0KChhLCBiKSA9PiBhLm1ldGFkYXRhLm5hbWUubG9jYWxlQ29tcGFyZShiLm1ldGFkYXRhLm5hbWUpKSk7XG5cdH1cblxuXHRnZXRNb2RlbHNGb3JHcm91cChncm91cDogSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5IHwgSUxhbmd1YWdlTW9kZWxHcm91cEVudHJ5KTogSUxhbmd1YWdlTW9kZWxbXSB7XG5cdFx0aWYgKGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkoZ3JvdXApKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5sYW5ndWFnZU1vZGVscy5maWx0ZXIobSA9PlxuXHRcdFx0XHR0aGlzLmdldFByb3ZpZGVyR3JvdXBJZChtLnByb3ZpZGVyLmdyb3VwKSA9PT0gZ3JvdXAuaWRcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Ly8gcmV0dXJuIGFsbCBtb2RlbHMgdW5ncm91cGVkXG5cdFx0cmV0dXJuIHRoaXMubGFuZ3VhZ2VNb2RlbHM7XG5cdH1cblxuXHR0b2dnbGVNb2RlbEhpZGRlbihlbnRyeTogSUxhbmd1YWdlTW9kZWxFbnRyeSk6IHZvaWQge1xuXHRcdHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNldE1vZGVsSGlkZGVuKGVudHJ5Lm1vZGVsLmlkZW50aWZpZXIsICFlbnRyeS5tb2RlbC5oaWRkZW4pO1xuXHR9XG5cblx0dG9nZ2xlR3JvdXBIaWRkZW4oZW50cnk6IElMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSk6IHZvaWQge1xuXHRcdHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNldEdyb3VwSGlkZGVuKGVudHJ5LnZlbmRvckVudHJ5Lmdyb3VwLnZlbmRvciwgZW50cnkudmVuZG9yRW50cnkuZ3JvdXAubmFtZSwgIWVudHJ5LmhpZGRlbik7XG5cdH1cblxuXHRzZXRNb2RlbHNIaWRkZW4oZW50cmllczogcmVhZG9ubHkgSUxhbmd1YWdlTW9kZWxFbnRyeVtdLCBoaWRkZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNldE1vZGVsSGlkZGVuKGVudHJ5Lm1vZGVsLmlkZW50aWZpZXIsIGhpZGRlbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoVmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIHRoaXMubGFuZ3VhZ2VNb2RlbHMpIHtcblx0XHRcdG1vZGVsLmhpZGRlbiA9IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmlzTW9kZWxIaWRkZW4obW9kZWwuaWRlbnRpZmllcik7XG5cdFx0fVxuXHRcdC8vIFJlYnVpbGQgZ3JvdXBzIHNvIHByb3ZpZGVyL2dyb3VwIGhlYWRlciBgaGlkZGVuYCByZWZsZWN0cyB0aGUgbmV3IHN0YXRlLlxuXHRcdHRoaXMubGFuZ3VhZ2VNb2RlbEdyb3VwcyA9IHRoaXMuZ3JvdXBNb2RlbHModGhpcy5sYW5ndWFnZU1vZGVscyk7XG5cdFx0dGhpcy5kb0ZpbHRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNb2RlbElkKG1vZGVsRW50cnk6IElMYW5ndWFnZU1vZGVsKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7bW9kZWxFbnRyeS5wcm92aWRlci5ncm91cC5uYW1lfS4ke21vZGVsRW50cnkuaWRlbnRpZmllcn0uJHttb2RlbEVudHJ5Lm1ldGFkYXRhLnZlcnNpb259YDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UHJvdmlkZXJHcm91cElkKGdyb3VwOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7Z3JvdXAudmVuZG9yfS0ke2dyb3VwLm5hbWV9YDtcblx0fVxuXG5cdHRvZ2dsZUNvbGxhcHNlZCh2aWV3TW9kZWxFbnRyeTogSVZpZXdNb2RlbEVudHJ5KTogdm9pZCB7XG5cdFx0Y29uc3QgaWQgPSBpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KHZpZXdNb2RlbEVudHJ5KSA/IHZpZXdNb2RlbEVudHJ5LmlkIDogaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSh2aWV3TW9kZWxFbnRyeSkgPyB2aWV3TW9kZWxFbnRyeS5pZCA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIWlkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuc2VsZWN0ZWRFbnRyeSA9IHZpZXdNb2RlbEVudHJ5O1xuXHRcdGlmICghdGhpcy5jb2xsYXBzZWRHcm91cHMuZGVsZXRlKGlkKSkge1xuXHRcdFx0dGhpcy5jb2xsYXBzZWRHcm91cHMuYWRkKGlkKTtcblx0XHR9XG5cdFx0dGhpcy5kb0ZpbHRlcigpO1xuXHR9XG5cblx0Y29sbGFwc2VBbGwoKTogdm9pZCB7XG5cdFx0dGhpcy5jb2xsYXBzZWRHcm91cHMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMudmlld01vZGVsRW50cmllcykge1xuXHRcdFx0aWYgKGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkoZW50cnkpIHx8IGlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkoZW50cnkpKSB7XG5cdFx0XHRcdHRoaXMuY29sbGFwc2VkR3JvdXBzLmFkZChlbnRyeS5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuZG9GaWx0ZXIoKTtcblx0fVxuXG5cdGdldENvbmZpZ3VyZWRWZW5kb3JzKCk6IElMYW5ndWFnZU1vZGVsUHJvdmlkZXJbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyW10gPSBbXTtcblx0XHRjb25zdCBzZWVuVmVuZG9ycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgbW9kZWxFbnRyeSBvZiB0aGlzLmxhbmd1YWdlTW9kZWxzKSB7XG5cdFx0XHRpZiAoIXNlZW5WZW5kb3JzLmhhcyhtb2RlbEVudHJ5LnByb3ZpZGVyLmdyb3VwLm5hbWUpKSB7XG5cdFx0XHRcdHNlZW5WZW5kb3JzLmFkZChtb2RlbEVudHJ5LnByb3ZpZGVyLmdyb3VwLm5hbWUpO1xuXHRcdFx0XHRyZXN1bHQucHVzaChtb2RlbEVudHJ5LnByb3ZpZGVyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5jbGFzcyBNb2RlbEl0ZW1NYXRjaGVzIHtcblxuXHRyZWFkb25seSBtb2RlbE5hbWVNYXRjaGVzOiBJTWF0Y2hbXSB8IG51bGwgPSBudWxsO1xuXHRyZWFkb25seSBtb2RlbElkTWF0Y2hlczogSU1hdGNoW10gfCBudWxsID0gbnVsbDtcblx0cmVhZG9ubHkgcHJvdmlkZXJNYXRjaGVzOiBJTWF0Y2hbXSB8IG51bGwgPSBudWxsO1xuXHRyZWFkb25seSBjYXBhYmlsaXR5TWF0Y2hlczogSU1hdGNoW10gfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihtb2RlbEVudHJ5OiBJTGFuZ3VhZ2VNb2RlbCwgc2VhcmNoVmFsdWU6IHN0cmluZywgd29yZHM6IHN0cmluZ1tdLCBjb21wbGV0ZU1hdGNoOiBib29sZWFuKSB7XG5cdFx0aWYgKCFjb21wbGV0ZU1hdGNoKSB7XG5cdFx0XHQvLyBNYXRjaCBhZ2FpbnN0IG1vZGVsIG5hbWVcblx0XHRcdHRoaXMubW9kZWxOYW1lTWF0Y2hlcyA9IG1vZGVsRW50cnkubWV0YWRhdGEubmFtZSA/XG5cdFx0XHRcdHRoaXMubWF0Y2hlcyhzZWFyY2hWYWx1ZSwgbW9kZWxFbnRyeS5tZXRhZGF0YS5uYW1lLCAod29yZCwgd29yZFRvTWF0Y2hBZ2FpbnN0KSA9PiBtYXRjaGVzV29yZHMod29yZCwgd29yZFRvTWF0Y2hBZ2FpbnN0LCB0cnVlKSwgd29yZHMpIDpcblx0XHRcdFx0bnVsbDtcblxuXHRcdFx0dGhpcy5tb2RlbElkTWF0Y2hlcyA9IHRoaXMubWF0Y2hlcyhzZWFyY2hWYWx1ZSwgbW9kZWxFbnRyeS5tZXRhZGF0YS5pZCwgb3IobWF0Y2hlc1dvcmRzLCBtYXRjaGVzQ2FtZWxDYXNlKSwgd29yZHMpO1xuXG5cdFx0XHQvLyBNYXRjaCBhZ2FpbnN0IHZlbmRvciBkaXNwbGF5IG5hbWVcblx0XHRcdHRoaXMucHJvdmlkZXJNYXRjaGVzID0gdGhpcy5tYXRjaGVzKHNlYXJjaFZhbHVlLCBtb2RlbEVudHJ5LnByb3ZpZGVyLmdyb3VwLm5hbWUsICh3b3JkLCB3b3JkVG9NYXRjaEFnYWluc3QpID0+IG1hdGNoZXNXb3Jkcyh3b3JkLCB3b3JkVG9NYXRjaEFnYWluc3QsIHRydWUpLCB3b3Jkcyk7XG5cblx0XHRcdC8vIE1hdGNoIGFnYWluc3QgY2FwYWJpbGl0aWVzXG5cdFx0XHRpZiAobW9kZWxFbnRyeS5tZXRhZGF0YS5jYXBhYmlsaXRpZXMpIHtcblx0XHRcdFx0Y29uc3QgY2FwYWJpbGl0eVN0cmluZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdGlmIChtb2RlbEVudHJ5Lm1ldGFkYXRhLmNhcGFiaWxpdGllcy50b29sQ2FsbGluZykge1xuXHRcdFx0XHRcdGNhcGFiaWxpdHlTdHJpbmdzLnB1c2goJ3Rvb2xzJywgJ3Rvb2xDYWxsaW5nJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1vZGVsRW50cnkubWV0YWRhdGEuY2FwYWJpbGl0aWVzLnZpc2lvbikge1xuXHRcdFx0XHRcdGNhcGFiaWxpdHlTdHJpbmdzLnB1c2goJ3Zpc2lvbicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtb2RlbEVudHJ5Lm1ldGFkYXRhLmNhcGFiaWxpdGllcy5hZ2VudE1vZGUpIHtcblx0XHRcdFx0XHRjYXBhYmlsaXR5U3RyaW5ncy5wdXNoKCdhZ2VudCcsICdhZ2VudE1vZGUnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobW9kZWxFbnRyeS5tZXRhZGF0YS5jYXBhYmlsaXRpZXMuZWRpdFRvb2xzKSB7XG5cdFx0XHRcdFx0Y2FwYWJpbGl0eVN0cmluZ3MucHVzaCguLi5tb2RlbEVudHJ5Lm1ldGFkYXRhLmNhcGFiaWxpdGllcy5lZGl0VG9vbHMpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY2FwYWJpbGl0eVN0cmluZyA9IGNhcGFiaWxpdHlTdHJpbmdzLmpvaW4oJyAnKTtcblx0XHRcdFx0aWYgKGNhcGFiaWxpdHlTdHJpbmcpIHtcblx0XHRcdFx0XHR0aGlzLmNhcGFiaWxpdHlNYXRjaGVzID0gdGhpcy5tYXRjaGVzKHNlYXJjaFZhbHVlLCBjYXBhYmlsaXR5U3RyaW5nLCBvcihtYXRjaGVzV29yZHMsIG1hdGNoZXNDYW1lbENhc2UpLCB3b3Jkcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG1hdGNoZXMoc2VhcmNoVmFsdWU6IHN0cmluZyB8IG51bGwsIHdvcmRUb01hdGNoQWdhaW5zdDogc3RyaW5nLCB3b3JkTWF0Y2hlc0ZpbHRlcjogSUZpbHRlciwgd29yZHM6IHN0cmluZ1tdKTogSU1hdGNoW10gfCBudWxsIHtcblx0XHRsZXQgbWF0Y2hlcyA9IHNlYXJjaFZhbHVlID8gd29yZEZpbHRlcihzZWFyY2hWYWx1ZSwgd29yZFRvTWF0Y2hBZ2FpbnN0KSA6IG51bGw7XG5cdFx0aWYgKCFtYXRjaGVzKSB7XG5cdFx0XHRtYXRjaGVzID0gdGhpcy5tYXRjaGVzV29yZHMod29yZHMsIHdvcmRUb01hdGNoQWdhaW5zdCwgd29yZE1hdGNoZXNGaWx0ZXIpO1xuXHRcdH1cblx0XHRpZiAobWF0Y2hlcykge1xuXHRcdFx0bWF0Y2hlcyA9IHRoaXMuZmlsdGVyQW5kU29ydChtYXRjaGVzKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1hdGNoZXM7XG5cdH1cblxuXHRwcml2YXRlIG1hdGNoZXNXb3Jkcyh3b3Jkczogc3RyaW5nW10sIHdvcmRUb01hdGNoQWdhaW5zdDogc3RyaW5nLCB3b3JkTWF0Y2hlc0ZpbHRlcjogSUZpbHRlcik6IElNYXRjaFtdIHwgbnVsbCB7XG5cdFx0bGV0IG1hdGNoZXM6IElNYXRjaFtdIHwgbnVsbCA9IFtdO1xuXHRcdGZvciAoY29uc3Qgd29yZCBvZiB3b3Jkcykge1xuXHRcdFx0Y29uc3Qgd29yZE1hdGNoZXMgPSB3b3JkTWF0Y2hlc0ZpbHRlcih3b3JkLCB3b3JkVG9NYXRjaEFnYWluc3QpO1xuXHRcdFx0aWYgKHdvcmRNYXRjaGVzKSB7XG5cdFx0XHRcdG1hdGNoZXMgPSBbLi4uKG1hdGNoZXMgfHwgW10pLCAuLi53b3JkTWF0Y2hlc107XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtYXRjaGVzID0gbnVsbDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBtYXRjaGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJBbmRTb3J0KG1hdGNoZXM6IElNYXRjaFtdKTogSU1hdGNoW10ge1xuXHRcdHJldHVybiBkaXN0aW5jdChtYXRjaGVzLCAoYSA9PiBhLnN0YXJ0ICsgJy4nICsgYS5lbmQpKVxuXHRcdFx0LmZpbHRlcihtYXRjaCA9PiAhbWF0Y2hlcy5zb21lKG0gPT4gIShtLnN0YXJ0ID09PSBtYXRjaC5zdGFydCAmJiBtLmVuZCA9PT0gbWF0Y2guZW5kKSAmJiAobS5zdGFydCA8PSBtYXRjaC5zdGFydCAmJiBtLmVuZCA+PSBtYXRjaC5lbmQpKSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLnN0YXJ0IC0gYi5zdGFydCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBMEIsSUFBSSxrQkFBa0IsY0FBYyxzQ0FBc0M7QUFDcEcsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsNEJBQTRCLDhCQUF5RztBQUM5SSxTQUFTLGtCQUFrQjtBQUlwQixNQUFNLDBCQUEwQjtBQUNoQyxNQUFNLDJCQUEyQjtBQUNqQyxNQUFNLDBCQUEwQjtBQUV2QyxNQUFNLGFBQWEsR0FBRyxnQ0FBZ0MsWUFBWTtBQUNsRSxNQUFNLG1CQUFtQjtBQUN6QixNQUFNLGlCQUFpQjtBQUVoQixNQUFNLHFCQUFxQjtBQUFBLEVBQ2pDLGNBQWM7QUFBQSxJQUNiO0FBQUEsSUFDQTtBQUFBLEVBQ0Q7QUFBQSxFQUNBLGNBQWM7QUFBQSxJQUNiO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNEO0FBQ0Q7QUFzRE8sU0FBUyw2QkFBNkIsT0FBOEQ7QUFDMUcsU0FBTyxNQUFNLFNBQVM7QUFDdkI7QUFFTyxTQUFTLDBCQUEwQixPQUEyRDtBQUNwRyxTQUFPLE1BQU0sU0FBUztBQUN2QjtBQUVPLFNBQVMsY0FBYyxPQUErQztBQUM1RSxTQUFPLE1BQU0sU0FBUztBQUN2QjtBQVVPLElBQVcsaUJBQVgsa0JBQVdBLG9CQUFYO0FBQ04sRUFBQUEsZ0JBQUEsWUFBUztBQURRLFNBQUFBO0FBQUEsR0FBQTtBQUlYLElBQU0sc0JBQU4sY0FBa0MsV0FBVztBQUFBLEVB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QztBQUNyQyxZQUFJLFdBQVcsU0FBUyxhQUFhLGFBQWE7QUFDakQsNEJBQWtCLEtBQUssU0FBUyxhQUFhO0FBQUEsUUFDOUM7QUFDQSxZQUFJLFdBQVcsU0FBUyxhQUFhLFFBQVE7QUFDNUMsNEJBQWtCLEtBQUssUUFBUTtBQUFBLFFBQ2hDO0FBQ0EsWUFBSSxXQUFXLFNBQVMsYUFBYSxXQUFXO0FBQy9DLDRCQUFrQixLQUFLLFNBQVMsV0FBVztBQUFBLFFBQzVDO0FBQ0EsWUFBSSxXQUFXLFNBQVMsYUFBYSxXQUFXO0FBQy9DLDRCQUFrQixLQUFLLEdBQUcsV0FBVyxTQUFTLGFBQWEsU0FBUztBQUFBLFFBQ3JFO0FBRUEsY0FBTSxtQkFBbUIsa0JBQWtCLEtBQUssR0FBRztBQUNuRCxZQUFJLGtCQUFrQjtBQUNyQixlQUFLLG9CQUFvQixLQUFLLFFBQVEsYUFBYSxrQkFBa0IsR0FBRyxjQUFjLGdCQUFnQixHQUFHLEtBQUs7QUFBQSxRQUMvRztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsUUFBUSxhQUE0QixvQkFBNEIsbUJBQTRCLE9BQWtDO0FBQ3JJLFFBQUksVUFBVSxjQUFjLFdBQVcsYUFBYSxrQkFBa0IsSUFBSTtBQUMxRSxRQUFJLENBQUMsU0FBUztBQUNiLGdCQUFVLEtBQUssYUFBYSxPQUFPLG9CQUFvQixpQkFBaUI7QUFBQSxJQUN6RTtBQUNBLFFBQUksU0FBUztBQUNaLGdCQUFVLEtBQUssY0FBYyxPQUFPO0FBQUEsSUFDckM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsYUFBYSxPQUFpQixvQkFBNEIsbUJBQTZDO0FBQzlHLFFBQUksVUFBMkIsQ0FBQztBQUNoQyxlQUFXLFFBQVEsT0FBTztBQUN6QixZQUFNLGNBQWMsa0JBQWtCLE1BQU0sa0JBQWtCO0FBQzlELFVBQUksYUFBYTtBQUNoQixrQkFBVSxDQUFDLEdBQUksV0FBVyxDQUFDLEdBQUksR0FBRyxXQUFXO0FBQUEsTUFDOUMsT0FBTztBQUNOLGtCQUFVO0FBQ1Y7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxjQUFjLFNBQTZCO0FBQ2xELFdBQU8sU0FBUyxVQUFVLE9BQUssRUFBRSxRQUFRLE1BQU0sRUFBRSxJQUFJLEVBQ25ELE9BQU8sV0FBUyxDQUFDLFFBQVEsS0FBSyxPQUFLLEVBQUUsRUFBRSxVQUFVLE1BQU0sU0FBUyxFQUFFLFFBQVEsTUFBTSxTQUFTLEVBQUUsU0FBUyxNQUFNLFNBQVMsRUFBRSxPQUFPLE1BQU0sSUFBSSxDQUFDLEVBQ3ZJLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxRQUFRLEVBQUUsS0FBSztBQUFBLEVBQ25DO0FBQ0Q7IiwKICAibmFtZXMiOiBbIkNoYXRNb2RlbEdyb3VwIiwgImdyb3VwIl0KfQo=
