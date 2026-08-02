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
import { distinct } from "../../../../base/common/arrays.js";
import { matchesBaseContiguousSubString, matchesContiguousSubString, matchesSubString, matchesWords } from "../../../../base/common/filters.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import * as strings from "../../../../base/common/strings.js";
import { TfIdfCalculator } from "../../../../base/common/tfIdf.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IAiSettingsSearchService } from "../../../services/aiSettingsSearch/common/aiSettingsSearch.js";
import { SettingKeyMatchTypes, SettingMatchType } from "../../../services/preferences/common/preferences.js";
import { nullRange } from "../../../services/preferences/common/preferencesModels.js";
import { EMBEDDINGS_SEARCH_PROVIDER_NAME, IPreferencesSearchService, LLM_RANKED_SEARCH_PROVIDER_NAME, STRING_MATCH_SEARCH_PROVIDER_NAME, TF_IDF_SEARCH_PROVIDER_NAME } from "../common/preferences.js";
let PreferencesSearchService = class extends Disposable {
  constructor(instantiationService, configurationService) {
    super();
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
  }
  getLocalSearchProvider(filter) {
    return this.instantiationService.createInstance(LocalSearchProvider, filter);
  }
  get remoteSearchAllowed() {
    const workbenchSettings = this.configurationService.getValue().workbench.settings;
    return workbenchSettings.enableNaturalLanguageSearch;
  }
  getRemoteSearchProvider(filter) {
    if (!this.remoteSearchAllowed) {
      return void 0;
    }
    this._remoteSearchProvider ??= this.instantiationService.createInstance(RemoteSearchProvider);
    this._remoteSearchProvider.setFilter(filter);
    return this._remoteSearchProvider;
  }
  getAiSearchProvider(filter) {
    if (!this.remoteSearchAllowed) {
      return void 0;
    }
    this._aiSearchProvider ??= this.instantiationService.createInstance(AiSearchProvider);
    this._aiSearchProvider.setFilter(filter);
    return this._aiSearchProvider;
  }
};
PreferencesSearchService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IConfigurationService)
], PreferencesSearchService);
function cleanFilter(filter) {
  return filter.replace(/[":]/g, " ").replace(/  /g, " ").trim();
}
let LocalSearchProvider = class {
  constructor(_filter, configurationService) {
    this._filter = _filter;
    this.configurationService = configurationService;
    this._filter = cleanFilter(this._filter);
  }
  searchModel(preferencesModel, token) {
    if (!this._filter) {
      return Promise.resolve(null);
    }
    const settingMatcher = (setting) => {
      let { matches, matchType, keyMatchScore } = new SettingMatches(
        this._filter,
        setting,
        true,
        this.configurationService
      );
      if (matchType === SettingMatchType.None || matches.length === 0) {
        return null;
      }
      if (strings.equalsIgnoreCase(this._filter, setting.key)) {
        matchType = SettingMatchType.ExactMatch;
      }
      return {
        matches,
        matchType,
        keyMatchScore,
        score: 0
        // only used for RemoteSearchProvider matches.
      };
    };
    const filterMatches = preferencesModel.filterSettings(this._filter, this.getGroupFilter(this._filter), settingMatcher);
    const topKeyMatchType = Math.max(...filterMatches.map((m) => m.matchType & SettingKeyMatchTypes));
    const alwaysAllowedMatchTypes = SettingMatchType.DescriptionOrValueMatch | SettingMatchType.LanguageTagSettingMatch;
    const filteredMatches = filterMatches.filter((m) => m.matchType & topKeyMatchType || m.matchType & alwaysAllowedMatchTypes || m.matchType === SettingMatchType.ExactMatch).map((m) => ({ ...m, providerName: STRING_MATCH_SEARCH_PROVIDER_NAME }));
    return Promise.resolve({
      filterMatches: filteredMatches,
      exactMatch: filteredMatches.some((m) => m.matchType === SettingMatchType.ExactMatch)
    });
  }
  getGroupFilter(filter) {
    const regex = strings.createRegExp(filter, false, { global: true });
    return (group) => {
      return group.id !== "defaultOverrides" && regex.test(group.title);
    };
  }
};
LocalSearchProvider = __decorateClass([
  __decorateParam(1, IConfigurationService)
], LocalSearchProvider);
class SettingMatches {
  constructor(searchString, setting, searchDescription, configurationService) {
    this.searchDescription = searchDescription;
    this.configurationService = configurationService;
    this.matchType = SettingMatchType.None;
    /**
     * A match score for key matches to allow comparing key matches against each other.
     * Otherwise, all key matches are treated the same, and sorting is done by ToC order.
     */
    this.keyMatchScore = 0;
    this.matches = distinct(this._findMatchesInSetting(searchString, setting), (match) => `${match.startLineNumber}_${match.startColumn}_${match.endLineNumber}_${match.endColumn}_`);
  }
  _findMatchesInSetting(searchString, setting) {
    const result = this._doFindMatchesInSetting(searchString, setting);
    return result;
  }
  _keyToLabel(settingId) {
    const label = settingId.replace(/[-._]/g, " ").replace(/([a-z]+)([A-Z])/g, "$1 $2").replace(/([A-Za-z]+)(\d+)/g, "$1 $2").replace(/(\d+)([A-Za-z]+)/g, "$1 $2").toLowerCase();
    return label;
  }
  _toAlphaNumeric(s) {
    return s.replace(/[^\p{L}\p{N}]+/gu, "");
  }
  _doFindMatchesInSetting(searchString, setting) {
    const descriptionMatchingWords = /* @__PURE__ */ new Map();
    const keyMatchingWords = /* @__PURE__ */ new Map();
    const valueMatchingWords = /* @__PURE__ */ new Map();
    const settingKeyAsWords = this._keyToLabel(setting.key);
    const queryWords = new Set(searchString.split(" "));
    for (const word of queryWords) {
      const keyMatches = matchesWords(word, settingKeyAsWords, true);
      if (keyMatches?.length) {
        keyMatchingWords.set(word, keyMatches.map((match) => this.toKeyRange(setting, match)));
      }
    }
    if (keyMatchingWords.size === queryWords.size) {
      this.matchType |= SettingMatchType.AllWordsInSettingsLabel;
    } else if (keyMatchingWords.size >= 2) {
      this.matchType |= SettingMatchType.ContiguousWordsInSettingsLabel;
      this.keyMatchScore = keyMatchingWords.size;
    }
    const searchStringAlphaNumeric = this._toAlphaNumeric(searchString);
    const keyAlphaNumeric = this._toAlphaNumeric(setting.key);
    const keyIdMatches = matchesContiguousSubString(searchStringAlphaNumeric, keyAlphaNumeric);
    if (keyIdMatches?.length) {
      keyMatchingWords.set(setting.key, keyIdMatches.map((match) => this.toKeyRange(setting, match)));
      this.matchType |= SettingMatchType.ContiguousQueryInSettingId;
    }
    if (this.matchType === SettingMatchType.None) {
      keyMatchingWords.clear();
      for (const word of queryWords) {
        const keyMatches = matchesWords(word, settingKeyAsWords, false);
        if (keyMatches?.length) {
          keyMatchingWords.set(word, keyMatches.map((match) => this.toKeyRange(setting, match)));
        }
      }
      if (keyMatchingWords.size >= 2 || keyMatchingWords.size === 1 && queryWords.size === 1) {
        this.matchType |= SettingMatchType.NonContiguousWordsInSettingsLabel;
        this.keyMatchScore = keyMatchingWords.size;
      } else {
        const keyIdMatches2 = matchesSubString(searchStringAlphaNumeric, keyAlphaNumeric);
        if (keyIdMatches2?.length) {
          keyMatchingWords.set(setting.key, keyIdMatches2.map((match) => this.toKeyRange(setting, match)));
          this.matchType |= SettingMatchType.NonContiguousQueryInSettingId;
        }
      }
    }
    if (setting.overrides?.length && this.matchType !== SettingMatchType.None) {
      this.matchType = SettingMatchType.LanguageTagSettingMatch;
      const keyRanges2 = keyMatchingWords.size ? Array.from(keyMatchingWords.values()).flat() : [];
      return [...keyRanges2];
    }
    const hasContiguousKeyMatchTypes = this.matchType >= SettingMatchType.ContiguousWordsInSettingsLabel;
    if (this.searchDescription && !hasContiguousKeyMatchTypes) {
      const searchableLines = setting.keywords?.length ? [...setting.description, setting.keywords.join(" ")] : setting.description;
      for (const word of queryWords) {
        for (let lineIndex = 0; lineIndex < searchableLines.length; lineIndex++) {
          const descriptionMatches = matchesBaseContiguousSubString(word, searchableLines[lineIndex]);
          if (descriptionMatches?.length) {
            descriptionMatchingWords.set(word, descriptionMatches.map((match) => this.toDescriptionRange(setting, match, lineIndex)));
          }
        }
      }
      if (descriptionMatchingWords.size === queryWords.size) {
        this.matchType |= SettingMatchType.DescriptionOrValueMatch;
      } else {
        descriptionMatchingWords.clear();
      }
    }
    if (!hasContiguousKeyMatchTypes) {
      if (setting.enum?.length) {
        for (const option of setting.enum) {
          if (typeof option !== "string") {
            continue;
          }
          valueMatchingWords.clear();
          for (const word of queryWords) {
            const valueMatches = matchesContiguousSubString(word, option);
            if (valueMatches?.length) {
              valueMatchingWords.set(word, valueMatches.map((match) => this.toValueRange(setting, match)));
            }
          }
          if (valueMatchingWords.size === queryWords.size) {
            this.matchType |= SettingMatchType.DescriptionOrValueMatch;
            break;
          } else {
            valueMatchingWords.clear();
          }
        }
      } else {
        const settingValue = this.configurationService.getValue(setting.key);
        if (typeof settingValue === "string") {
          for (const word of queryWords) {
            const valueMatches = matchesContiguousSubString(word, settingValue);
            if (valueMatches?.length) {
              valueMatchingWords.set(word, valueMatches.map((match) => this.toValueRange(setting, match)));
            }
          }
          if (valueMatchingWords.size === queryWords.size) {
            this.matchType |= SettingMatchType.DescriptionOrValueMatch;
          } else {
            valueMatchingWords.clear();
          }
        }
      }
    }
    const descriptionRanges = descriptionMatchingWords.size ? Array.from(descriptionMatchingWords.values()).flat() : [];
    const keyRanges = keyMatchingWords.size ? Array.from(keyMatchingWords.values()).flat() : [];
    const valueRanges = valueMatchingWords.size ? Array.from(valueMatchingWords.values()).flat() : [];
    return [...descriptionRanges, ...keyRanges, ...valueRanges];
  }
  toKeyRange(setting, match) {
    return {
      startLineNumber: setting.keyRange.startLineNumber,
      startColumn: setting.keyRange.startColumn + match.start,
      endLineNumber: setting.keyRange.startLineNumber,
      endColumn: setting.keyRange.startColumn + match.end
    };
  }
  toDescriptionRange(setting, match, lineIndex) {
    const descriptionRange = setting.descriptionRanges[lineIndex];
    if (!descriptionRange) {
      return nullRange;
    }
    return {
      startLineNumber: descriptionRange.startLineNumber,
      startColumn: descriptionRange.startColumn + match.start,
      endLineNumber: descriptionRange.endLineNumber,
      endColumn: descriptionRange.startColumn + match.end
    };
  }
  toValueRange(setting, match) {
    return {
      startLineNumber: setting.valueRange.startLineNumber,
      startColumn: setting.valueRange.startColumn + match.start + 1,
      endLineNumber: setting.valueRange.startLineNumber,
      endColumn: setting.valueRange.startColumn + match.end + 1
    };
  }
}
class SettingsRecordProvider {
  constructor() {
    this._settingsRecord = {};
  }
  updateModel(preferencesModel) {
    if (preferencesModel === this._currentPreferencesModel) {
      return;
    }
    this._currentPreferencesModel = preferencesModel;
    this.refresh();
  }
  refresh() {
    this._settingsRecord = {};
    if (!this._currentPreferencesModel) {
      return;
    }
    for (const group of this._currentPreferencesModel.settingsGroups) {
      if (group.id === "mostCommonlyUsed") {
        continue;
      }
      for (const section of group.sections) {
        for (const setting of section.settings) {
          this._settingsRecord[setting.key] = setting;
        }
      }
    }
  }
  getSettingsRecord() {
    return this._settingsRecord;
  }
}
const _EmbeddingsSearchProvider = class _EmbeddingsSearchProvider {
  constructor(_aiSettingsSearchService) {
    this._aiSettingsSearchService = _aiSettingsSearchService;
    this._filter = "";
    this._recordProvider = new SettingsRecordProvider();
  }
  setFilter(filter) {
    this._filter = cleanFilter(filter);
  }
  async searchModel(preferencesModel, token) {
    if (!this._filter || !this._aiSettingsSearchService.isEnabled()) {
      return null;
    }
    this._recordProvider.updateModel(preferencesModel);
    this._aiSettingsSearchService.startSearch(this._filter, token);
    return {
      filterMatches: await this.getEmbeddingsItems(token),
      exactMatch: false
    };
  }
  async getEmbeddingsItems(token) {
    const settingsRecord = this._recordProvider.getSettingsRecord();
    const filterMatches = [];
    const settings = await this._aiSettingsSearchService.getEmbeddingsResults(this._filter, token);
    if (!settings) {
      return [];
    }
    const providerName = EMBEDDINGS_SEARCH_PROVIDER_NAME;
    for (const settingKey of settings) {
      if (filterMatches.length === _EmbeddingsSearchProvider.EMBEDDINGS_SETTINGS_SEARCH_MAX_PICKS) {
        break;
      }
      filterMatches.push({
        setting: settingsRecord[settingKey],
        matches: [settingsRecord[settingKey].range],
        matchType: SettingMatchType.RemoteMatch,
        keyMatchScore: 0,
        score: 0,
        // the results are sorted upstream.
        providerName
      });
    }
    return filterMatches;
  }
};
_EmbeddingsSearchProvider.EMBEDDINGS_SETTINGS_SEARCH_MAX_PICKS = 10;
let EmbeddingsSearchProvider = _EmbeddingsSearchProvider;
const _TfIdfSearchProvider = class _TfIdfSearchProvider {
  constructor() {
    this._filter = "";
    this._documents = [];
    this._settingsRecord = {};
  }
  setFilter(filter) {
    this._filter = cleanFilter(filter);
  }
  keyToLabel(settingId) {
    const label = settingId.replace(/[-._]/g, " ").replace(/([a-z]+)([A-Z])/g, "$1 $2").replace(/([A-Za-z]+)(\d+)/g, "$1 $2").replace(/(\d+)([A-Za-z]+)/g, "$1 $2").toLowerCase();
    return label;
  }
  settingItemToEmbeddingString(item) {
    let result = `Setting Id: ${item.key}
`;
    result += `Label: ${this.keyToLabel(item.key)}
`;
    result += `Description: ${item.description}
`;
    return result;
  }
  async searchModel(preferencesModel, token) {
    if (!this._filter) {
      return null;
    }
    if (this._currentPreferencesModel !== preferencesModel) {
      this._currentPreferencesModel = preferencesModel;
      this._documents = [];
      this._settingsRecord = {};
      for (const group of preferencesModel.settingsGroups) {
        if (group.id === "mostCommonlyUsed") {
          continue;
        }
        for (const section of group.sections) {
          for (const setting of section.settings) {
            this._documents.push({
              key: setting.key,
              textChunks: [this.settingItemToEmbeddingString(setting)]
            });
            this._settingsRecord[setting.key] = setting;
          }
        }
      }
    }
    return {
      filterMatches: await this.getTfIdfItems(token),
      exactMatch: false
    };
  }
  async getTfIdfItems(token) {
    const filterMatches = [];
    const tfIdfCalculator = new TfIdfCalculator();
    tfIdfCalculator.updateDocuments(this._documents);
    const tfIdfRankings = tfIdfCalculator.calculateScores(this._filter, token);
    tfIdfRankings.sort((a, b) => b.score - a.score);
    const maxScore = tfIdfRankings[0].score;
    if (maxScore < _TfIdfSearchProvider.TF_IDF_PRE_NORMALIZE_THRESHOLD) {
      return [];
    }
    for (const info of tfIdfRankings) {
      if (info.score / maxScore < _TfIdfSearchProvider.TF_IDF_POST_NORMALIZE_THRESHOLD || filterMatches.length === _TfIdfSearchProvider.TF_IDF_MAX_PICKS) {
        break;
      }
      const pick = info.key;
      filterMatches.push({
        setting: this._settingsRecord[pick],
        matches: [this._settingsRecord[pick].range],
        matchType: SettingMatchType.RemoteMatch,
        keyMatchScore: 0,
        score: info.score,
        providerName: TF_IDF_SEARCH_PROVIDER_NAME
      });
    }
    return filterMatches;
  }
};
_TfIdfSearchProvider.TF_IDF_PRE_NORMALIZE_THRESHOLD = 50;
_TfIdfSearchProvider.TF_IDF_POST_NORMALIZE_THRESHOLD = 0.7;
_TfIdfSearchProvider.TF_IDF_MAX_PICKS = 5;
let TfIdfSearchProvider = _TfIdfSearchProvider;
class RemoteSearchProvider {
  constructor() {
    this._filter = "";
    this._tfIdfSearchProvider = new TfIdfSearchProvider();
  }
  setFilter(filter) {
    this._filter = filter;
    this._tfIdfSearchProvider.setFilter(filter);
  }
  async searchModel(preferencesModel, token) {
    if (!this._filter) {
      return null;
    }
    const results = await this._tfIdfSearchProvider.searchModel(preferencesModel, token);
    return results;
  }
}
let AiSearchProvider = class {
  constructor(aiSettingsSearchService) {
    this.aiSettingsSearchService = aiSettingsSearchService;
    this._filter = "";
    this._embeddingsSearchProvider = new EmbeddingsSearchProvider(this.aiSettingsSearchService);
    this._recordProvider = new SettingsRecordProvider();
  }
  setFilter(filter) {
    this._filter = filter;
    this._embeddingsSearchProvider.setFilter(filter);
  }
  async searchModel(preferencesModel, token) {
    if (!this._filter || !this.aiSettingsSearchService.isEnabled()) {
      return null;
    }
    this._recordProvider.updateModel(preferencesModel);
    const results = await this._embeddingsSearchProvider.searchModel(preferencesModel, token);
    return results;
  }
  async getLLMRankedResults(token) {
    if (!this._filter || !this.aiSettingsSearchService.isEnabled()) {
      return null;
    }
    const items = await this.getLLMRankedItems(token);
    return {
      filterMatches: items,
      exactMatch: false
    };
  }
  async getLLMRankedItems(token) {
    const settingsRecord = this._recordProvider.getSettingsRecord();
    const filterMatches = [];
    const settings = await this.aiSettingsSearchService.getLLMRankedResults(this._filter, token);
    if (!settings) {
      return [];
    }
    for (const settingKey of settings) {
      if (!settingsRecord[settingKey]) {
        continue;
      }
      filterMatches.push({
        setting: settingsRecord[settingKey],
        matches: [settingsRecord[settingKey].range],
        matchType: SettingMatchType.RemoteMatch,
        keyMatchScore: 0,
        score: 0,
        // the results are sorted upstream.
        providerName: LLM_RANKED_SEARCH_PROVIDER_NAME
      });
    }
    return filterMatches;
  }
};
AiSearchProvider = __decorateClass([
  __decorateParam(0, IAiSettingsSearchService)
], AiSearchProvider);
registerSingleton(IPreferencesSearchService, PreferencesSearchService, InstantiationType.Delayed);
export {
  LocalSearchProvider,
  PreferencesSearchService,
  SettingMatches
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIvcHJlZmVyZW5jZXNTZWFyY2gudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IElNYXRjaCwgbWF0Y2hlc0Jhc2VDb250aWd1b3VzU3ViU3RyaW5nLCBtYXRjaGVzQ29udGlndW91c1N1YlN0cmluZywgbWF0Y2hlc1N1YlN0cmluZywgbWF0Y2hlc1dvcmRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUZklkZkNhbGN1bGF0b3IsIFRmSWRmRG9jdW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90ZklkZi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUFpU2V0dGluZ3NTZWFyY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYWlTZXR0aW5nc1NlYXJjaC9jb21tb24vYWlTZXR0aW5nc1NlYXJjaC5qcyc7XG5pbXBvcnQgeyBJR3JvdXBGaWx0ZXIsIElTZWFyY2hSZXN1bHQsIElTZXR0aW5nLCBJU2V0dGluZ01hdGNoLCBJU2V0dGluZ01hdGNoZXIsIElTZXR0aW5nc0VkaXRvck1vZGVsLCBJU2V0dGluZ3NHcm91cCwgU2V0dGluZ0tleU1hdGNoVHlwZXMsIFNldHRpbmdNYXRjaFR5cGUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgbnVsbFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzTW9kZWxzLmpzJztcbmltcG9ydCB7IEVNQkVERElOR1NfU0VBUkNIX1BST1ZJREVSX05BTUUsIElBaVNlYXJjaFByb3ZpZGVyLCBJUHJlZmVyZW5jZXNTZWFyY2hTZXJ2aWNlLCBJUmVtb3RlU2VhcmNoUHJvdmlkZXIsIElTZWFyY2hQcm92aWRlciwgSVdvcmtiZW5jaFNldHRpbmdzQ29uZmlndXJhdGlvbiwgTExNX1JBTktFRF9TRUFSQ0hfUFJPVklERVJfTkFNRSwgU1RSSU5HX01BVENIX1NFQVJDSF9QUk9WSURFUl9OQU1FLCBURl9JREZfU0VBUkNIX1BST1ZJREVSX05BTUUgfSBmcm9tICcuLi9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFbmRwb2ludERldGFpbHMge1xuXHR1cmxCYXNlPzogc3RyaW5nO1xuXHRrZXk/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBQcmVmZXJlbmNlc1NlYXJjaFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVByZWZlcmVuY2VzU2VhcmNoU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3JlbW90ZVNlYXJjaFByb3ZpZGVyOiBJUmVtb3RlU2VhcmNoUHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FpU2VhcmNoUHJvdmlkZXI6IElBaVNlYXJjaFByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Z2V0TG9jYWxTZWFyY2hQcm92aWRlcihmaWx0ZXI6IHN0cmluZyk6IExvY2FsU2VhcmNoUHJvdmlkZXIge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsU2VhcmNoUHJvdmlkZXIsIGZpbHRlcik7XG5cdH1cblxuXHRwcml2YXRlIGdldCByZW1vdGVTZWFyY2hBbGxvd2VkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHdvcmtiZW5jaFNldHRpbmdzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJV29ya2JlbmNoU2V0dGluZ3NDb25maWd1cmF0aW9uPigpLndvcmtiZW5jaC5zZXR0aW5ncztcblx0XHRyZXR1cm4gd29ya2JlbmNoU2V0dGluZ3MuZW5hYmxlTmF0dXJhbExhbmd1YWdlU2VhcmNoO1xuXHR9XG5cblx0Z2V0UmVtb3RlU2VhcmNoUHJvdmlkZXIoZmlsdGVyOiBzdHJpbmcpOiBJUmVtb3RlU2VhcmNoUHJvdmlkZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5yZW1vdGVTZWFyY2hBbGxvd2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlbW90ZVNlYXJjaFByb3ZpZGVyID8/PSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbW90ZVNlYXJjaFByb3ZpZGVyKTtcblx0XHR0aGlzLl9yZW1vdGVTZWFyY2hQcm92aWRlci5zZXRGaWx0ZXIoZmlsdGVyKTtcblx0XHRyZXR1cm4gdGhpcy5fcmVtb3RlU2VhcmNoUHJvdmlkZXI7XG5cdH1cblxuXHRnZXRBaVNlYXJjaFByb3ZpZGVyKGZpbHRlcjogc3RyaW5nKTogSUFpU2VhcmNoUHJvdmlkZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5yZW1vdGVTZWFyY2hBbGxvd2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX2FpU2VhcmNoUHJvdmlkZXIgPz89IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWlTZWFyY2hQcm92aWRlcik7XG5cdFx0dGhpcy5fYWlTZWFyY2hQcm92aWRlci5zZXRGaWx0ZXIoZmlsdGVyKTtcblx0XHRyZXR1cm4gdGhpcy5fYWlTZWFyY2hQcm92aWRlcjtcblx0fVxufVxuXG5mdW5jdGlvbiBjbGVhbkZpbHRlcihmaWx0ZXI6IHN0cmluZyk6IHN0cmluZyB7XG5cdC8vIFJlbW92ZSBcIiBhbmQgOiB3aGljaCBhcmUgbGlrZWx5IHRvIGJlIGNvcHlwYXN0ZWQgYXMgcGFydCBvZiBhIHNldHRpbmcgbmFtZS5cblx0Ly8gTGVhdmUgb3RoZXIgc3BlY2lhbCBjaGFyYWN0ZXJzIHdoaWNoIHRoZSB1c2VyIG1pZ2h0IHdhbnQgdG8gc2VhcmNoIGZvci5cblx0cmV0dXJuIGZpbHRlclxuXHRcdC5yZXBsYWNlKC9bXCI6XS9nLCAnICcpXG5cdFx0LnJlcGxhY2UoLyAgL2csICcgJylcblx0XHQudHJpbSgpO1xufVxuXG5leHBvcnQgY2xhc3MgTG9jYWxTZWFyY2hQcm92aWRlciBpbXBsZW1lbnRzIElTZWFyY2hQcm92aWRlciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX2ZpbHRlcjogc3RyaW5nLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2ZpbHRlciA9IGNsZWFuRmlsdGVyKHRoaXMuX2ZpbHRlcik7XG5cdH1cblxuXHRzZWFyY2hNb2RlbChwcmVmZXJlbmNlc01vZGVsOiBJU2V0dGluZ3NFZGl0b3JNb2RlbCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoUmVzdWx0IHwgbnVsbD4ge1xuXHRcdGlmICghdGhpcy5fZmlsdGVyKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNldHRpbmdNYXRjaGVyOiBJU2V0dGluZ01hdGNoZXIgPSAoc2V0dGluZzogSVNldHRpbmcpID0+IHtcblx0XHRcdGxldCB7IG1hdGNoZXMsIG1hdGNoVHlwZSwga2V5TWF0Y2hTY29yZSB9ID0gbmV3IFNldHRpbmdNYXRjaGVzKFxuXHRcdFx0XHR0aGlzLl9maWx0ZXIsXG5cdFx0XHRcdHNldHRpbmcsXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Vcblx0XHRcdCk7XG5cdFx0XHRpZiAobWF0Y2hUeXBlID09PSBTZXR0aW5nTWF0Y2hUeXBlLk5vbmUgfHwgbWF0Y2hlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKHRoaXMuX2ZpbHRlciwgc2V0dGluZy5rZXkpKSB7XG5cdFx0XHRcdG1hdGNoVHlwZSA9IFNldHRpbmdNYXRjaFR5cGUuRXhhY3RNYXRjaDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG1hdGNoZXMsXG5cdFx0XHRcdG1hdGNoVHlwZSxcblx0XHRcdFx0a2V5TWF0Y2hTY29yZSxcblx0XHRcdFx0c2NvcmU6IDAgLy8gb25seSB1c2VkIGZvciBSZW1vdGVTZWFyY2hQcm92aWRlciBtYXRjaGVzLlxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZmlsdGVyTWF0Y2hlcyA9IHByZWZlcmVuY2VzTW9kZWwuZmlsdGVyU2V0dGluZ3ModGhpcy5fZmlsdGVyLCB0aGlzLmdldEdyb3VwRmlsdGVyKHRoaXMuX2ZpbHRlciksIHNldHRpbmdNYXRjaGVyKTtcblxuXHRcdC8vIENoZWNrIHRoZSB0b3Aga2V5IG1hdGNoIHR5cGUuXG5cdFx0Y29uc3QgdG9wS2V5TWF0Y2hUeXBlID0gTWF0aC5tYXgoLi4uZmlsdGVyTWF0Y2hlcy5tYXAobSA9PiAobS5tYXRjaFR5cGUgJiBTZXR0aW5nS2V5TWF0Y2hUeXBlcykpKTtcblx0XHQvLyBBbHdheXMgYWxsb3cgZGVzY3JpcHRpb24gbWF0Y2hlcyBhcyBwYXJ0IG9mIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMzk5MzYuXG5cdFx0Y29uc3QgYWx3YXlzQWxsb3dlZE1hdGNoVHlwZXMgPSBTZXR0aW5nTWF0Y2hUeXBlLkRlc2NyaXB0aW9uT3JWYWx1ZU1hdGNoIHwgU2V0dGluZ01hdGNoVHlwZS5MYW5ndWFnZVRhZ1NldHRpbmdNYXRjaDtcblx0XHRjb25zdCBmaWx0ZXJlZE1hdGNoZXMgPSBmaWx0ZXJNYXRjaGVzXG5cdFx0XHQuZmlsdGVyKG0gPT4gKG0ubWF0Y2hUeXBlICYgdG9wS2V5TWF0Y2hUeXBlKSB8fCAobS5tYXRjaFR5cGUgJiBhbHdheXNBbGxvd2VkTWF0Y2hUeXBlcykgfHwgbS5tYXRjaFR5cGUgPT09IFNldHRpbmdNYXRjaFR5cGUuRXhhY3RNYXRjaClcblx0XHRcdC5tYXAobSA9PiAoeyAuLi5tLCBwcm92aWRlck5hbWU6IFNUUklOR19NQVRDSF9TRUFSQ0hfUFJPVklERVJfTkFNRSB9KSk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRmaWx0ZXJNYXRjaGVzOiBmaWx0ZXJlZE1hdGNoZXMsXG5cdFx0XHRleGFjdE1hdGNoOiBmaWx0ZXJlZE1hdGNoZXMuc29tZShtID0+IG0ubWF0Y2hUeXBlID09PSBTZXR0aW5nTWF0Y2hUeXBlLkV4YWN0TWF0Y2gpXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEdyb3VwRmlsdGVyKGZpbHRlcjogc3RyaW5nKTogSUdyb3VwRmlsdGVyIHtcblx0XHRjb25zdCByZWdleCA9IHN0cmluZ3MuY3JlYXRlUmVnRXhwKGZpbHRlciwgZmFsc2UsIHsgZ2xvYmFsOiB0cnVlIH0pO1xuXHRcdHJldHVybiAoZ3JvdXA6IElTZXR0aW5nc0dyb3VwKSA9PiB7XG5cdFx0XHRyZXR1cm4gZ3JvdXAuaWQgIT09ICdkZWZhdWx0T3ZlcnJpZGVzJyAmJiByZWdleC50ZXN0KGdyb3VwLnRpdGxlKTtcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nTWF0Y2hlcyB7XG5cdHJlYWRvbmx5IG1hdGNoZXM6IElSYW5nZVtdO1xuXHRtYXRjaFR5cGU6IFNldHRpbmdNYXRjaFR5cGUgPSBTZXR0aW5nTWF0Y2hUeXBlLk5vbmU7XG5cdC8qKlxuXHQgKiBBIG1hdGNoIHNjb3JlIGZvciBrZXkgbWF0Y2hlcyB0byBhbGxvdyBjb21wYXJpbmcga2V5IG1hdGNoZXMgYWdhaW5zdCBlYWNoIG90aGVyLlxuXHQgKiBPdGhlcndpc2UsIGFsbCBrZXkgbWF0Y2hlcyBhcmUgdHJlYXRlZCB0aGUgc2FtZSwgYW5kIHNvcnRpbmcgaXMgZG9uZSBieSBUb0Mgb3JkZXIuXG5cdCAqL1xuXHRrZXlNYXRjaFNjb3JlOiBudW1iZXIgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHNlYXJjaFN0cmluZzogc3RyaW5nLFxuXHRcdHNldHRpbmc6IElTZXR0aW5nLFxuXHRcdHByaXZhdGUgc2VhcmNoRGVzY3JpcHRpb246IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMubWF0Y2hlcyA9IGRpc3RpbmN0KHRoaXMuX2ZpbmRNYXRjaGVzSW5TZXR0aW5nKHNlYXJjaFN0cmluZywgc2V0dGluZyksIChtYXRjaCkgPT4gYCR7bWF0Y2guc3RhcnRMaW5lTnVtYmVyfV8ke21hdGNoLnN0YXJ0Q29sdW1ufV8ke21hdGNoLmVuZExpbmVOdW1iZXJ9XyR7bWF0Y2guZW5kQ29sdW1ufV9gKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRNYXRjaGVzSW5TZXR0aW5nKHNlYXJjaFN0cmluZzogc3RyaW5nLCBzZXR0aW5nOiBJU2V0dGluZyk6IElSYW5nZVtdIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9kb0ZpbmRNYXRjaGVzSW5TZXR0aW5nKHNlYXJjaFN0cmluZywgc2V0dGluZyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2tleVRvTGFiZWwoc2V0dGluZ0lkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGxhYmVsID0gc2V0dGluZ0lkXG5cdFx0XHQucmVwbGFjZSgvWy0uX10vZywgJyAnKVxuXHRcdFx0LnJlcGxhY2UoLyhbYS16XSspKFtBLVpdKS9nLCAnJDEgJDInKVxuXHRcdFx0LnJlcGxhY2UoLyhbQS1aYS16XSspKFxcZCspL2csICckMSAkMicpXG5cdFx0XHQucmVwbGFjZSgvKFxcZCspKFtBLVphLXpdKykvZywgJyQxICQyJylcblx0XHRcdC50b0xvd2VyQ2FzZSgpO1xuXHRcdHJldHVybiBsYWJlbDtcblx0fVxuXG5cdHByaXZhdGUgX3RvQWxwaGFOdW1lcmljKHM6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHMucmVwbGFjZSgvW15cXHB7TH1cXHB7Tn1dKy9ndSwgJycpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9GaW5kTWF0Y2hlc0luU2V0dGluZyhzZWFyY2hTdHJpbmc6IHN0cmluZywgc2V0dGluZzogSVNldHRpbmcpOiBJUmFuZ2VbXSB7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb25NYXRjaGluZ1dvcmRzOiBNYXA8c3RyaW5nLCBJUmFuZ2VbXT4gPSBuZXcgTWFwPHN0cmluZywgSVJhbmdlW10+KCk7XG5cdFx0Y29uc3Qga2V5TWF0Y2hpbmdXb3JkczogTWFwPHN0cmluZywgSVJhbmdlW10+ID0gbmV3IE1hcDxzdHJpbmcsIElSYW5nZVtdPigpO1xuXHRcdGNvbnN0IHZhbHVlTWF0Y2hpbmdXb3JkczogTWFwPHN0cmluZywgSVJhbmdlW10+ID0gbmV3IE1hcDxzdHJpbmcsIElSYW5nZVtdPigpO1xuXG5cdFx0Ly8gS2V5IChJRCkgc2VhcmNoXG5cdFx0Ly8gRmlyc3QsIHNlYXJjaCBieSB0aGUgc2V0dGluZydzIElEIGFuZCBsYWJlbC5cblx0XHRjb25zdCBzZXR0aW5nS2V5QXNXb3Jkczogc3RyaW5nID0gdGhpcy5fa2V5VG9MYWJlbChzZXR0aW5nLmtleSk7XG5cdFx0Y29uc3QgcXVlcnlXb3JkcyA9IG5ldyBTZXQ8c3RyaW5nPihzZWFyY2hTdHJpbmcuc3BsaXQoJyAnKSk7XG5cdFx0Zm9yIChjb25zdCB3b3JkIG9mIHF1ZXJ5V29yZHMpIHtcblx0XHRcdC8vIENoZWNrIGlmIHRoZSBrZXkgY29udGFpbnMgdGhlIHdvcmQuIFVzZSBjb250aWd1b3VzIHNlYXJjaC5cblx0XHRcdGNvbnN0IGtleU1hdGNoZXMgPSBtYXRjaGVzV29yZHMod29yZCwgc2V0dGluZ0tleUFzV29yZHMsIHRydWUpO1xuXHRcdFx0aWYgKGtleU1hdGNoZXM/Lmxlbmd0aCkge1xuXHRcdFx0XHRrZXlNYXRjaGluZ1dvcmRzLnNldCh3b3JkLCBrZXlNYXRjaGVzLm1hcChtYXRjaCA9PiB0aGlzLnRvS2V5UmFuZ2Uoc2V0dGluZywgbWF0Y2gpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChrZXlNYXRjaGluZ1dvcmRzLnNpemUgPT09IHF1ZXJ5V29yZHMuc2l6ZSkge1xuXHRcdFx0Ly8gQWxsIHdvcmRzIGluIHRoZSBxdWVyeSBtYXRjaGVkIHdpdGggc29tZXRoaW5nIGluIHRoZSBzZXR0aW5nIGtleS5cblx0XHRcdC8vIE1hdGNoZXMgXCJlZGl0IGZvcm1hdCBvbiBwYXN0ZVwiIHRvIFwiZWRpdG9yLmZvcm1hdE9uUGFzdGVcIi5cblx0XHRcdHRoaXMubWF0Y2hUeXBlIHw9IFNldHRpbmdNYXRjaFR5cGUuQWxsV29yZHNJblNldHRpbmdzTGFiZWw7XG5cdFx0fSBlbHNlIGlmIChrZXlNYXRjaGluZ1dvcmRzLnNpemUgPj0gMikge1xuXHRcdFx0Ly8gTWF0Y2hlcyBcImVkaXQgcGFzdGVcIiB0byBcImVkaXRvci5mb3JtYXRPblBhc3RlXCIuXG5cdFx0XHQvLyBUaGUgaWYgc3RhdGVtZW50IHJlZHVjZXMgbm9pc2UgYnkgcHJldmVudGluZyBcImVkaXRvciBmb3JtYXRvbnBhc3RcIiBmcm9tIG1hdGNoaW5nIGFsbCBlZGl0b3Igc2V0dGluZ3MuXG5cdFx0XHR0aGlzLm1hdGNoVHlwZSB8PSBTZXR0aW5nTWF0Y2hUeXBlLkNvbnRpZ3VvdXNXb3Jkc0luU2V0dGluZ3NMYWJlbDtcblx0XHRcdHRoaXMua2V5TWF0Y2hTY29yZSA9IGtleU1hdGNoaW5nV29yZHMuc2l6ZTtcblx0XHR9XG5cdFx0Y29uc3Qgc2VhcmNoU3RyaW5nQWxwaGFOdW1lcmljID0gdGhpcy5fdG9BbHBoYU51bWVyaWMoc2VhcmNoU3RyaW5nKTtcblx0XHRjb25zdCBrZXlBbHBoYU51bWVyaWMgPSB0aGlzLl90b0FscGhhTnVtZXJpYyhzZXR0aW5nLmtleSk7XG5cdFx0Y29uc3Qga2V5SWRNYXRjaGVzID0gbWF0Y2hlc0NvbnRpZ3VvdXNTdWJTdHJpbmcoc2VhcmNoU3RyaW5nQWxwaGFOdW1lcmljLCBrZXlBbHBoYU51bWVyaWMpO1xuXHRcdGlmIChrZXlJZE1hdGNoZXM/Lmxlbmd0aCkge1xuXHRcdFx0Ly8gTWF0Y2hlcyBcImVkaXRvcmZvcm1hdG9ucFwiIHRvIFwiZWRpdG9yLmZvcm1hdG9ucGFzdGVcIi5cblx0XHRcdGtleU1hdGNoaW5nV29yZHMuc2V0KHNldHRpbmcua2V5LCBrZXlJZE1hdGNoZXMubWFwKG1hdGNoID0+IHRoaXMudG9LZXlSYW5nZShzZXR0aW5nLCBtYXRjaCkpKTtcblx0XHRcdHRoaXMubWF0Y2hUeXBlIHw9IFNldHRpbmdNYXRjaFR5cGUuQ29udGlndW91c1F1ZXJ5SW5TZXR0aW5nSWQ7XG5cdFx0fVxuXG5cdFx0Ly8gRmFsbCBiYWNrIHRvIG5vbi1jb250aWd1b3VzIGtleSAoSUQpIHNlYXJjaGVzIGlmIG5vdGhpbmcgbWF0Y2hlZCB5ZXQuXG5cdFx0aWYgKHRoaXMubWF0Y2hUeXBlID09PSBTZXR0aW5nTWF0Y2hUeXBlLk5vbmUpIHtcblx0XHRcdGtleU1hdGNoaW5nV29yZHMuY2xlYXIoKTtcblx0XHRcdGZvciAoY29uc3Qgd29yZCBvZiBxdWVyeVdvcmRzKSB7XG5cdFx0XHRcdGNvbnN0IGtleU1hdGNoZXMgPSBtYXRjaGVzV29yZHMod29yZCwgc2V0dGluZ0tleUFzV29yZHMsIGZhbHNlKTtcblx0XHRcdFx0aWYgKGtleU1hdGNoZXM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdGtleU1hdGNoaW5nV29yZHMuc2V0KHdvcmQsIGtleU1hdGNoZXMubWFwKG1hdGNoID0+IHRoaXMudG9LZXlSYW5nZShzZXR0aW5nLCBtYXRjaCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGtleU1hdGNoaW5nV29yZHMuc2l6ZSA+PSAyIHx8IChrZXlNYXRjaGluZ1dvcmRzLnNpemUgPT09IDEgJiYgcXVlcnlXb3Jkcy5zaXplID09PSAxKSkge1xuXHRcdFx0XHQvLyBNYXRjaGVzIFwiZWRmb3JvbnBhc1wiIHRvIFwiZWRpdG9yLmZvcm1hdE9uUGFzdGVcIi5cblx0XHRcdFx0Ly8gVGhlIGlmIHN0YXRlbWVudCByZWR1Y2VzIG5vaXNlIGJ5IHByZXZlbnRpbmcgXCJlZGl0b3IgZm9tb25wYXN0XCIgZnJvbSBtYXRjaGluZyBhbGwgZWRpdG9yIHNldHRpbmdzLlxuXHRcdFx0XHR0aGlzLm1hdGNoVHlwZSB8PSBTZXR0aW5nTWF0Y2hUeXBlLk5vbkNvbnRpZ3VvdXNXb3Jkc0luU2V0dGluZ3NMYWJlbDtcblx0XHRcdFx0dGhpcy5rZXlNYXRjaFNjb3JlID0ga2V5TWF0Y2hpbmdXb3Jkcy5zaXplO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qga2V5SWRNYXRjaGVzID0gbWF0Y2hlc1N1YlN0cmluZyhzZWFyY2hTdHJpbmdBbHBoYU51bWVyaWMsIGtleUFscGhhTnVtZXJpYyk7XG5cdFx0XHRcdGlmIChrZXlJZE1hdGNoZXM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdC8vIE1hdGNoZXMgXCJlZGZtb25wYXNcIiB0byBcImVkaXRvci5mb3JtYXRPblBhc3RlXCIuXG5cdFx0XHRcdFx0a2V5TWF0Y2hpbmdXb3Jkcy5zZXQoc2V0dGluZy5rZXksIGtleUlkTWF0Y2hlcy5tYXAobWF0Y2ggPT4gdGhpcy50b0tleVJhbmdlKHNldHRpbmcsIG1hdGNoKSkpO1xuXHRcdFx0XHRcdHRoaXMubWF0Y2hUeXBlIHw9IFNldHRpbmdNYXRjaFR5cGUuTm9uQ29udGlndW91c1F1ZXJ5SW5TZXR0aW5nSWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiB0aGUgbWF0Y2ggd2FzIGZvciBhIGxhbmd1YWdlIHRhZyBncm91cCBzZXR0aW5nIHN1Y2ggYXMgW21hcmtkb3duXS5cblx0XHQvLyBJbiBzdWNoIGEgY2FzZSwgbW92ZSB0aGF0IHNldHRpbmcgdG8gYmUgbGFzdC5cblx0XHRpZiAoc2V0dGluZy5vdmVycmlkZXM/Lmxlbmd0aCAmJiAodGhpcy5tYXRjaFR5cGUgIT09IFNldHRpbmdNYXRjaFR5cGUuTm9uZSkpIHtcblx0XHRcdHRoaXMubWF0Y2hUeXBlID0gU2V0dGluZ01hdGNoVHlwZS5MYW5ndWFnZVRhZ1NldHRpbmdNYXRjaDtcblx0XHRcdGNvbnN0IGtleVJhbmdlcyA9IGtleU1hdGNoaW5nV29yZHMuc2l6ZSA/XG5cdFx0XHRcdEFycmF5LmZyb20oa2V5TWF0Y2hpbmdXb3Jkcy52YWx1ZXMoKSkuZmxhdCgpIDogW107XG5cdFx0XHRyZXR1cm4gWy4uLmtleVJhbmdlc107XG5cdFx0fVxuXG5cdFx0Ly8gRGVzY3JpcHRpb24gc2VhcmNoXG5cdFx0Ly8gU2VhcmNoIHRoZSBkZXNjcmlwdGlvbiBpZiB3ZSBmb3VuZCBub24tY29udGlndW91cyBrZXkgbWF0Y2hlcyBhdCBiZXN0LlxuXHRcdGNvbnN0IGhhc0NvbnRpZ3VvdXNLZXlNYXRjaFR5cGVzID0gdGhpcy5tYXRjaFR5cGUgPj0gU2V0dGluZ01hdGNoVHlwZS5Db250aWd1b3VzV29yZHNJblNldHRpbmdzTGFiZWw7XG5cdFx0aWYgKHRoaXMuc2VhcmNoRGVzY3JpcHRpb24gJiYgIWhhc0NvbnRpZ3VvdXNLZXlNYXRjaFR5cGVzKSB7XG5cdFx0XHQvLyBTZWFyY2ggdGhlIGRlc2NyaXB0aW9uIGxpbmVzIGFuZCBhbnkgYWRkaXRpb25hbCBrZXl3b3Jkcy5cblx0XHRcdGNvbnN0IHNlYXJjaGFibGVMaW5lcyA9IHNldHRpbmcua2V5d29yZHM/Lmxlbmd0aFxuXHRcdFx0XHQ/IFsuLi5zZXR0aW5nLmRlc2NyaXB0aW9uLCBzZXR0aW5nLmtleXdvcmRzLmpvaW4oJyAnKV1cblx0XHRcdFx0OiBzZXR0aW5nLmRlc2NyaXB0aW9uO1xuXHRcdFx0Zm9yIChjb25zdCB3b3JkIG9mIHF1ZXJ5V29yZHMpIHtcblx0XHRcdFx0Zm9yIChsZXQgbGluZUluZGV4ID0gMDsgbGluZUluZGV4IDwgc2VhcmNoYWJsZUxpbmVzLmxlbmd0aDsgbGluZUluZGV4KyspIHtcblx0XHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbk1hdGNoZXMgPSBtYXRjaGVzQmFzZUNvbnRpZ3VvdXNTdWJTdHJpbmcod29yZCwgc2VhcmNoYWJsZUxpbmVzW2xpbmVJbmRleF0pO1xuXHRcdFx0XHRcdGlmIChkZXNjcmlwdGlvbk1hdGNoZXM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb25NYXRjaGluZ1dvcmRzLnNldCh3b3JkLCBkZXNjcmlwdGlvbk1hdGNoZXMubWFwKG1hdGNoID0+IHRoaXMudG9EZXNjcmlwdGlvblJhbmdlKHNldHRpbmcsIG1hdGNoLCBsaW5lSW5kZXgpKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZGVzY3JpcHRpb25NYXRjaGluZ1dvcmRzLnNpemUgPT09IHF1ZXJ5V29yZHMuc2l6ZSkge1xuXHRcdFx0XHR0aGlzLm1hdGNoVHlwZSB8PSBTZXR0aW5nTWF0Y2hUeXBlLkRlc2NyaXB0aW9uT3JWYWx1ZU1hdGNoO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gQ2xlYXIgb3V0IHRoZSBtYXRjaCBmb3Igbm93LiBXZSB3YW50IHRvIHJlcXVpcmUgYWxsIHdvcmRzIHRvIG1hdGNoIGluIHRoZSBkZXNjcmlwdGlvbi5cblx0XHRcdFx0ZGVzY3JpcHRpb25NYXRjaGluZ1dvcmRzLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVmFsdWUgc2VhcmNoXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIHZhbHVlIGNvbnRhaW5zIGFsbCB0aGUgd29yZHMuXG5cdFx0Ly8gU2VhcmNoIHRoZSB2YWx1ZXMgaWYgd2UgZm91bmQgbm9uLWNvbnRpZ3VvdXMga2V5IG1hdGNoZXMgYXQgYmVzdC5cblx0XHRpZiAoIWhhc0NvbnRpZ3VvdXNLZXlNYXRjaFR5cGVzKSB7XG5cdFx0XHRpZiAoc2V0dGluZy5lbnVtPy5sZW5ndGgpIHtcblx0XHRcdFx0Ly8gU2VhcmNoIGFsbCBzdHJpbmcgdmFsdWVzIG9mIGVudW1zLlxuXHRcdFx0XHRmb3IgKGNvbnN0IG9wdGlvbiBvZiBzZXR0aW5nLmVudW0pIHtcblx0XHRcdFx0XHRpZiAodHlwZW9mIG9wdGlvbiAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR2YWx1ZU1hdGNoaW5nV29yZHMuY2xlYXIoKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHdvcmQgb2YgcXVlcnlXb3Jkcykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmFsdWVNYXRjaGVzID0gbWF0Y2hlc0NvbnRpZ3VvdXNTdWJTdHJpbmcod29yZCwgb3B0aW9uKTtcblx0XHRcdFx0XHRcdGlmICh2YWx1ZU1hdGNoZXM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHR2YWx1ZU1hdGNoaW5nV29yZHMuc2V0KHdvcmQsIHZhbHVlTWF0Y2hlcy5tYXAobWF0Y2ggPT4gdGhpcy50b1ZhbHVlUmFuZ2Uoc2V0dGluZywgbWF0Y2gpKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh2YWx1ZU1hdGNoaW5nV29yZHMuc2l6ZSA9PT0gcXVlcnlXb3Jkcy5zaXplKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm1hdGNoVHlwZSB8PSBTZXR0aW5nTWF0Y2hUeXBlLkRlc2NyaXB0aW9uT3JWYWx1ZU1hdGNoO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIENsZWFyIG91dCB0aGUgbWF0Y2ggZm9yIG5vdy4gV2Ugd2FudCB0byByZXF1aXJlIGFsbCB3b3JkcyB0byBtYXRjaCBpbiB0aGUgdmFsdWUuXG5cdFx0XHRcdFx0XHR2YWx1ZU1hdGNoaW5nV29yZHMuY2xlYXIoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFNlYXJjaCBzaW5nbGUgc3RyaW5nIHZhbHVlLlxuXHRcdFx0XHRjb25zdCBzZXR0aW5nVmFsdWUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHNldHRpbmcua2V5KTtcblx0XHRcdFx0aWYgKHR5cGVvZiBzZXR0aW5nVmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB3b3JkIG9mIHF1ZXJ5V29yZHMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlTWF0Y2hlcyA9IG1hdGNoZXNDb250aWd1b3VzU3ViU3RyaW5nKHdvcmQsIHNldHRpbmdWYWx1ZSk7XG5cdFx0XHRcdFx0XHRpZiAodmFsdWVNYXRjaGVzPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0dmFsdWVNYXRjaGluZ1dvcmRzLnNldCh3b3JkLCB2YWx1ZU1hdGNoZXMubWFwKG1hdGNoID0+IHRoaXMudG9WYWx1ZVJhbmdlKHNldHRpbmcsIG1hdGNoKSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodmFsdWVNYXRjaGluZ1dvcmRzLnNpemUgPT09IHF1ZXJ5V29yZHMuc2l6ZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5tYXRjaFR5cGUgfD0gU2V0dGluZ01hdGNoVHlwZS5EZXNjcmlwdGlvbk9yVmFsdWVNYXRjaDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gQ2xlYXIgb3V0IHRoZSBtYXRjaCBmb3Igbm93LiBXZSB3YW50IHRvIHJlcXVpcmUgYWxsIHdvcmRzIHRvIG1hdGNoIGluIHRoZSB2YWx1ZS5cblx0XHRcdFx0XHRcdHZhbHVlTWF0Y2hpbmdXb3Jkcy5jbGVhcigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uUmFuZ2VzID0gZGVzY3JpcHRpb25NYXRjaGluZ1dvcmRzLnNpemUgP1xuXHRcdFx0QXJyYXkuZnJvbShkZXNjcmlwdGlvbk1hdGNoaW5nV29yZHMudmFsdWVzKCkpLmZsYXQoKSA6IFtdO1xuXHRcdGNvbnN0IGtleVJhbmdlcyA9IGtleU1hdGNoaW5nV29yZHMuc2l6ZSA/XG5cdFx0XHRBcnJheS5mcm9tKGtleU1hdGNoaW5nV29yZHMudmFsdWVzKCkpLmZsYXQoKSA6IFtdO1xuXHRcdGNvbnN0IHZhbHVlUmFuZ2VzID0gdmFsdWVNYXRjaGluZ1dvcmRzLnNpemUgP1xuXHRcdFx0QXJyYXkuZnJvbSh2YWx1ZU1hdGNoaW5nV29yZHMudmFsdWVzKCkpLmZsYXQoKSA6IFtdO1xuXHRcdHJldHVybiBbLi4uZGVzY3JpcHRpb25SYW5nZXMsIC4uLmtleVJhbmdlcywgLi4udmFsdWVSYW5nZXNdO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0tleVJhbmdlKHNldHRpbmc6IElTZXR0aW5nLCBtYXRjaDogSU1hdGNoKTogSVJhbmdlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzZXR0aW5nLmtleVJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdHN0YXJ0Q29sdW1uOiBzZXR0aW5nLmtleVJhbmdlLnN0YXJ0Q29sdW1uICsgbWF0Y2guc3RhcnQsXG5cdFx0XHRlbmRMaW5lTnVtYmVyOiBzZXR0aW5nLmtleVJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdGVuZENvbHVtbjogc2V0dGluZy5rZXlSYW5nZS5zdGFydENvbHVtbiArIG1hdGNoLmVuZFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHRvRGVzY3JpcHRpb25SYW5nZShzZXR0aW5nOiBJU2V0dGluZywgbWF0Y2g6IElNYXRjaCwgbGluZUluZGV4OiBudW1iZXIpOiBJUmFuZ2Uge1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uUmFuZ2UgPSBzZXR0aW5nLmRlc2NyaXB0aW9uUmFuZ2VzW2xpbmVJbmRleF07XG5cdFx0aWYgKCFkZXNjcmlwdGlvblJhbmdlKSB7XG5cdFx0XHQvLyBUaGlzIGNhc2Ugb2NjdXJzIHdpdGggYWRkZWQgc2V0dGluZ3Mgc3VjaCBhcyB0aGVcblx0XHRcdC8vIG1hbmFnZSBleHRlbnNpb24gc2V0dGluZy5cblx0XHRcdHJldHVybiBudWxsUmFuZ2U7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IGRlc2NyaXB0aW9uUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0c3RhcnRDb2x1bW46IGRlc2NyaXB0aW9uUmFuZ2Uuc3RhcnRDb2x1bW4gKyBtYXRjaC5zdGFydCxcblx0XHRcdGVuZExpbmVOdW1iZXI6IGRlc2NyaXB0aW9uUmFuZ2UuZW5kTGluZU51bWJlcixcblx0XHRcdGVuZENvbHVtbjogZGVzY3JpcHRpb25SYW5nZS5zdGFydENvbHVtbiArIG1hdGNoLmVuZFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHRvVmFsdWVSYW5nZShzZXR0aW5nOiBJU2V0dGluZywgbWF0Y2g6IElNYXRjaCk6IElSYW5nZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogc2V0dGluZy52YWx1ZVJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdHN0YXJ0Q29sdW1uOiBzZXR0aW5nLnZhbHVlUmFuZ2Uuc3RhcnRDb2x1bW4gKyBtYXRjaC5zdGFydCArIDEsXG5cdFx0XHRlbmRMaW5lTnVtYmVyOiBzZXR0aW5nLnZhbHVlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0ZW5kQ29sdW1uOiBzZXR0aW5nLnZhbHVlUmFuZ2Uuc3RhcnRDb2x1bW4gKyBtYXRjaC5lbmQgKyAxXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBTZXR0aW5nc1JlY29yZFByb3ZpZGVyIHtcblx0cHJpdmF0ZSBfc2V0dGluZ3NSZWNvcmQ6IElTdHJpbmdEaWN0aW9uYXJ5PElTZXR0aW5nPiA9IHt9O1xuXHRwcml2YXRlIF9jdXJyZW50UHJlZmVyZW5jZXNNb2RlbDogSVNldHRpbmdzRWRpdG9yTW9kZWwgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoKSB7IH1cblxuXHR1cGRhdGVNb2RlbChwcmVmZXJlbmNlc01vZGVsOiBJU2V0dGluZ3NFZGl0b3JNb2RlbCkge1xuXHRcdGlmIChwcmVmZXJlbmNlc01vZGVsID09PSB0aGlzLl9jdXJyZW50UHJlZmVyZW5jZXNNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2N1cnJlbnRQcmVmZXJlbmNlc01vZGVsID0gcHJlZmVyZW5jZXNNb2RlbDtcblx0XHR0aGlzLnJlZnJlc2goKTtcblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaCgpIHtcblx0XHR0aGlzLl9zZXR0aW5nc1JlY29yZCA9IHt9O1xuXG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50UHJlZmVyZW5jZXNNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5fY3VycmVudFByZWZlcmVuY2VzTW9kZWwuc2V0dGluZ3NHcm91cHMpIHtcblx0XHRcdGlmIChncm91cC5pZCA9PT0gJ21vc3RDb21tb25seVVzZWQnKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIGdyb3VwLnNlY3Rpb25zKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZyBvZiBzZWN0aW9uLnNldHRpbmdzKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2V0dGluZ3NSZWNvcmRbc2V0dGluZy5rZXldID0gc2V0dGluZztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldFNldHRpbmdzUmVjb3JkKCk6IElTdHJpbmdEaWN0aW9uYXJ5PElTZXR0aW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NldHRpbmdzUmVjb3JkO1xuXHR9XG59XG5cbmNsYXNzIEVtYmVkZGluZ3NTZWFyY2hQcm92aWRlciBpbXBsZW1lbnRzIElSZW1vdGVTZWFyY2hQcm92aWRlciB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVNQkVERElOR1NfU0VUVElOR1NfU0VBUkNIX01BWF9QSUNLUyA9IDEwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlY29yZFByb3ZpZGVyOiBTZXR0aW5nc1JlY29yZFByb3ZpZGVyO1xuXHRwcml2YXRlIF9maWx0ZXI6IHN0cmluZyA9ICcnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FpU2V0dGluZ3NTZWFyY2hTZXJ2aWNlOiBJQWlTZXR0aW5nc1NlYXJjaFNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fcmVjb3JkUHJvdmlkZXIgPSBuZXcgU2V0dGluZ3NSZWNvcmRQcm92aWRlcigpO1xuXHR9XG5cblx0c2V0RmlsdGVyKGZpbHRlcjogc3RyaW5nKSB7XG5cdFx0dGhpcy5fZmlsdGVyID0gY2xlYW5GaWx0ZXIoZmlsdGVyKTtcblx0fVxuXG5cdGFzeW5jIHNlYXJjaE1vZGVsKHByZWZlcmVuY2VzTW9kZWw6IElTZXR0aW5nc0VkaXRvck1vZGVsLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZWFyY2hSZXN1bHQgfCBudWxsPiB7XG5cdFx0aWYgKCF0aGlzLl9maWx0ZXIgfHwgIXRoaXMuX2FpU2V0dGluZ3NTZWFyY2hTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWNvcmRQcm92aWRlci51cGRhdGVNb2RlbChwcmVmZXJlbmNlc01vZGVsKTtcblx0XHR0aGlzLl9haVNldHRpbmdzU2VhcmNoU2VydmljZS5zdGFydFNlYXJjaCh0aGlzLl9maWx0ZXIsIHRva2VuKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRmaWx0ZXJNYXRjaGVzOiBhd2FpdCB0aGlzLmdldEVtYmVkZGluZ3NJdGVtcyh0b2tlbiksXG5cdFx0XHRleGFjdE1hdGNoOiBmYWxzZVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEVtYmVkZGluZ3NJdGVtcyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZXR0aW5nTWF0Y2hbXT4ge1xuXHRcdGNvbnN0IHNldHRpbmdzUmVjb3JkID0gdGhpcy5fcmVjb3JkUHJvdmlkZXIuZ2V0U2V0dGluZ3NSZWNvcmQoKTtcblx0XHRjb25zdCBmaWx0ZXJNYXRjaGVzOiBJU2V0dGluZ01hdGNoW10gPSBbXTtcblx0XHRjb25zdCBzZXR0aW5ncyA9IGF3YWl0IHRoaXMuX2FpU2V0dGluZ3NTZWFyY2hTZXJ2aWNlLmdldEVtYmVkZGluZ3NSZXN1bHRzKHRoaXMuX2ZpbHRlciwgdG9rZW4pO1xuXHRcdGlmICghc2V0dGluZ3MpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlck5hbWUgPSBFTUJFRERJTkdTX1NFQVJDSF9QUk9WSURFUl9OQU1FO1xuXHRcdGZvciAoY29uc3Qgc2V0dGluZ0tleSBvZiBzZXR0aW5ncykge1xuXHRcdFx0aWYgKGZpbHRlck1hdGNoZXMubGVuZ3RoID09PSBFbWJlZGRpbmdzU2VhcmNoUHJvdmlkZXIuRU1CRURESU5HU19TRVRUSU5HU19TRUFSQ0hfTUFYX1BJQ0tTKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0ZmlsdGVyTWF0Y2hlcy5wdXNoKHtcblx0XHRcdFx0c2V0dGluZzogc2V0dGluZ3NSZWNvcmRbc2V0dGluZ0tleV0sXG5cdFx0XHRcdG1hdGNoZXM6IFtzZXR0aW5nc1JlY29yZFtzZXR0aW5nS2V5XS5yYW5nZV0sXG5cdFx0XHRcdG1hdGNoVHlwZTogU2V0dGluZ01hdGNoVHlwZS5SZW1vdGVNYXRjaCxcblx0XHRcdFx0a2V5TWF0Y2hTY29yZTogMCxcblx0XHRcdFx0c2NvcmU6IDAsIC8vIHRoZSByZXN1bHRzIGFyZSBzb3J0ZWQgdXBzdHJlYW0uXG5cdFx0XHRcdHByb3ZpZGVyTmFtZVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZpbHRlck1hdGNoZXM7XG5cdH1cbn1cblxuY2xhc3MgVGZJZGZTZWFyY2hQcm92aWRlciBpbXBsZW1lbnRzIElSZW1vdGVTZWFyY2hQcm92aWRlciB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRGX0lERl9QUkVfTk9STUFMSVpFX1RIUkVTSE9MRCA9IDUwO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBURl9JREZfUE9TVF9OT1JNQUxJWkVfVEhSRVNIT0xEID0gMC43O1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBURl9JREZfTUFYX1BJQ0tTID0gNTtcblxuXHRwcml2YXRlIF9jdXJyZW50UHJlZmVyZW5jZXNNb2RlbDogSVNldHRpbmdzRWRpdG9yTW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2ZpbHRlcjogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgX2RvY3VtZW50czogVGZJZGZEb2N1bWVudFtdID0gW107XG5cdHByaXZhdGUgX3NldHRpbmdzUmVjb3JkOiBJU3RyaW5nRGljdGlvbmFyeTxJU2V0dGluZz4gPSB7fTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0fVxuXG5cdHNldEZpbHRlcihmaWx0ZXI6IHN0cmluZykge1xuXHRcdHRoaXMuX2ZpbHRlciA9IGNsZWFuRmlsdGVyKGZpbHRlcik7XG5cdH1cblxuXHRrZXlUb0xhYmVsKHNldHRpbmdJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBsYWJlbCA9IHNldHRpbmdJZFxuXHRcdFx0LnJlcGxhY2UoL1stLl9dL2csICcgJylcblx0XHRcdC5yZXBsYWNlKC8oW2Etel0rKShbQS1aXSkvZywgJyQxICQyJylcblx0XHRcdC5yZXBsYWNlKC8oW0EtWmEtel0rKShcXGQrKS9nLCAnJDEgJDInKVxuXHRcdFx0LnJlcGxhY2UoLyhcXGQrKShbQS1aYS16XSspL2csICckMSAkMicpXG5cdFx0XHQudG9Mb3dlckNhc2UoKTtcblx0XHRyZXR1cm4gbGFiZWw7XG5cdH1cblxuXHRzZXR0aW5nSXRlbVRvRW1iZWRkaW5nU3RyaW5nKGl0ZW06IElTZXR0aW5nKTogc3RyaW5nIHtcblx0XHRsZXQgcmVzdWx0ID0gYFNldHRpbmcgSWQ6ICR7aXRlbS5rZXl9XFxuYDtcblx0XHRyZXN1bHQgKz0gYExhYmVsOiAke3RoaXMua2V5VG9MYWJlbChpdGVtLmtleSl9XFxuYDtcblx0XHRyZXN1bHQgKz0gYERlc2NyaXB0aW9uOiAke2l0ZW0uZGVzY3JpcHRpb259XFxuYDtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgc2VhcmNoTW9kZWwocHJlZmVyZW5jZXNNb2RlbDogSVNldHRpbmdzRWRpdG9yTW9kZWwsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlYXJjaFJlc3VsdCB8IG51bGw+IHtcblx0XHRpZiAoIXRoaXMuX2ZpbHRlcikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRQcmVmZXJlbmNlc01vZGVsICE9PSBwcmVmZXJlbmNlc01vZGVsKSB7XG5cdFx0XHQvLyBSZWZyZXNoIHRoZSBkb2N1bWVudHMgYW5kIHNldHRpbmdzIHJlY29yZFxuXHRcdFx0dGhpcy5fY3VycmVudFByZWZlcmVuY2VzTW9kZWwgPSBwcmVmZXJlbmNlc01vZGVsO1xuXHRcdFx0dGhpcy5fZG9jdW1lbnRzID0gW107XG5cdFx0XHR0aGlzLl9zZXR0aW5nc1JlY29yZCA9IHt9O1xuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBwcmVmZXJlbmNlc01vZGVsLnNldHRpbmdzR3JvdXBzKSB7XG5cdFx0XHRcdGlmIChncm91cC5pZCA9PT0gJ21vc3RDb21tb25seVVzZWQnKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIGdyb3VwLnNlY3Rpb25zKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHNlY3Rpb24uc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2RvY3VtZW50cy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0a2V5OiBzZXR0aW5nLmtleSxcblx0XHRcdFx0XHRcdFx0dGV4dENodW5rczogW3RoaXMuc2V0dGluZ0l0ZW1Ub0VtYmVkZGluZ1N0cmluZyhzZXR0aW5nKV1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0dGhpcy5fc2V0dGluZ3NSZWNvcmRbc2V0dGluZy5rZXldID0gc2V0dGluZztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZmlsdGVyTWF0Y2hlczogYXdhaXQgdGhpcy5nZXRUZklkZkl0ZW1zKHRva2VuKSxcblx0XHRcdGV4YWN0TWF0Y2g6IGZhbHNlXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0VGZJZGZJdGVtcyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZXR0aW5nTWF0Y2hbXT4ge1xuXHRcdGNvbnN0IGZpbHRlck1hdGNoZXM6IElTZXR0aW5nTWF0Y2hbXSA9IFtdO1xuXHRcdGNvbnN0IHRmSWRmQ2FsY3VsYXRvciA9IG5ldyBUZklkZkNhbGN1bGF0b3IoKTtcblx0XHR0ZklkZkNhbGN1bGF0b3IudXBkYXRlRG9jdW1lbnRzKHRoaXMuX2RvY3VtZW50cyk7XG5cdFx0Y29uc3QgdGZJZGZSYW5raW5ncyA9IHRmSWRmQ2FsY3VsYXRvci5jYWxjdWxhdGVTY29yZXModGhpcy5fZmlsdGVyLCB0b2tlbik7XG5cdFx0dGZJZGZSYW5raW5ncy5zb3J0KChhLCBiKSA9PiBiLnNjb3JlIC0gYS5zY29yZSk7XG5cdFx0Y29uc3QgbWF4U2NvcmUgPSB0ZklkZlJhbmtpbmdzWzBdLnNjb3JlO1xuXG5cdFx0aWYgKG1heFNjb3JlIDwgVGZJZGZTZWFyY2hQcm92aWRlci5URl9JREZfUFJFX05PUk1BTElaRV9USFJFU0hPTEQpIHtcblx0XHRcdC8vIFJlamVjdCBhbGwgdGhlIG1hdGNoZXMuXG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBpbmZvIG9mIHRmSWRmUmFua2luZ3MpIHtcblx0XHRcdGlmIChpbmZvLnNjb3JlIC8gbWF4U2NvcmUgPCBUZklkZlNlYXJjaFByb3ZpZGVyLlRGX0lERl9QT1NUX05PUk1BTElaRV9USFJFU0hPTEQgfHwgZmlsdGVyTWF0Y2hlcy5sZW5ndGggPT09IFRmSWRmU2VhcmNoUHJvdmlkZXIuVEZfSURGX01BWF9QSUNLUykge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBpY2sgPSBpbmZvLmtleTtcblx0XHRcdGZpbHRlck1hdGNoZXMucHVzaCh7XG5cdFx0XHRcdHNldHRpbmc6IHRoaXMuX3NldHRpbmdzUmVjb3JkW3BpY2tdLFxuXHRcdFx0XHRtYXRjaGVzOiBbdGhpcy5fc2V0dGluZ3NSZWNvcmRbcGlja10ucmFuZ2VdLFxuXHRcdFx0XHRtYXRjaFR5cGU6IFNldHRpbmdNYXRjaFR5cGUuUmVtb3RlTWF0Y2gsXG5cdFx0XHRcdGtleU1hdGNoU2NvcmU6IDAsXG5cdFx0XHRcdHNjb3JlOiBpbmZvLnNjb3JlLFxuXHRcdFx0XHRwcm92aWRlck5hbWU6IFRGX0lERl9TRUFSQ0hfUFJPVklERVJfTkFNRVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZpbHRlck1hdGNoZXM7XG5cdH1cbn1cblxuY2xhc3MgUmVtb3RlU2VhcmNoUHJvdmlkZXIgaW1wbGVtZW50cyBJUmVtb3RlU2VhcmNoUHJvdmlkZXIge1xuXHRwcml2YXRlIF90ZklkZlNlYXJjaFByb3ZpZGVyOiBUZklkZlNlYXJjaFByb3ZpZGVyO1xuXHRwcml2YXRlIF9maWx0ZXI6IHN0cmluZyA9ICcnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuX3RmSWRmU2VhcmNoUHJvdmlkZXIgPSBuZXcgVGZJZGZTZWFyY2hQcm92aWRlcigpO1xuXHR9XG5cblx0c2V0RmlsdGVyKGZpbHRlcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZmlsdGVyID0gZmlsdGVyO1xuXHRcdHRoaXMuX3RmSWRmU2VhcmNoUHJvdmlkZXIuc2V0RmlsdGVyKGZpbHRlcik7XG5cdH1cblxuXHRhc3luYyBzZWFyY2hNb2RlbChwcmVmZXJlbmNlc01vZGVsOiBJU2V0dGluZ3NFZGl0b3JNb2RlbCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoUmVzdWx0IHwgbnVsbD4ge1xuXHRcdGlmICghdGhpcy5fZmlsdGVyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5fdGZJZGZTZWFyY2hQcm92aWRlci5zZWFyY2hNb2RlbChwcmVmZXJlbmNlc01vZGVsLCB0b2tlbik7XG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH1cbn1cblxuY2xhc3MgQWlTZWFyY2hQcm92aWRlciBpbXBsZW1lbnRzIElBaVNlYXJjaFByb3ZpZGVyIHtcblx0cHJpdmF0ZSByZWFkb25seSBfZW1iZWRkaW5nc1NlYXJjaFByb3ZpZGVyOiBFbWJlZGRpbmdzU2VhcmNoUHJvdmlkZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlY29yZFByb3ZpZGVyOiBTZXR0aW5nc1JlY29yZFByb3ZpZGVyO1xuXHRwcml2YXRlIF9maWx0ZXI6IHN0cmluZyA9ICcnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWlTZXR0aW5nc1NlYXJjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhaVNldHRpbmdzU2VhcmNoU2VydmljZTogSUFpU2V0dGluZ3NTZWFyY2hTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2VtYmVkZGluZ3NTZWFyY2hQcm92aWRlciA9IG5ldyBFbWJlZGRpbmdzU2VhcmNoUHJvdmlkZXIodGhpcy5haVNldHRpbmdzU2VhcmNoU2VydmljZSk7XG5cdFx0dGhpcy5fcmVjb3JkUHJvdmlkZXIgPSBuZXcgU2V0dGluZ3NSZWNvcmRQcm92aWRlcigpO1xuXHR9XG5cblx0c2V0RmlsdGVyKGZpbHRlcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZmlsdGVyID0gZmlsdGVyO1xuXHRcdHRoaXMuX2VtYmVkZGluZ3NTZWFyY2hQcm92aWRlci5zZXRGaWx0ZXIoZmlsdGVyKTtcblx0fVxuXG5cdGFzeW5jIHNlYXJjaE1vZGVsKHByZWZlcmVuY2VzTW9kZWw6IElTZXR0aW5nc0VkaXRvck1vZGVsLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZWFyY2hSZXN1bHQgfCBudWxsPiB7XG5cdFx0aWYgKCF0aGlzLl9maWx0ZXIgfHwgIXRoaXMuYWlTZXR0aW5nc1NlYXJjaFNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlY29yZFByb3ZpZGVyLnVwZGF0ZU1vZGVsKHByZWZlcmVuY2VzTW9kZWwpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLl9lbWJlZGRpbmdzU2VhcmNoUHJvdmlkZXIuc2VhcmNoTW9kZWwocHJlZmVyZW5jZXNNb2RlbCwgdG9rZW4pO1xuXHRcdHJldHVybiByZXN1bHRzO1xuXHR9XG5cblx0YXN5bmMgZ2V0TExNUmFua2VkUmVzdWx0cyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZWFyY2hSZXN1bHQgfCBudWxsPiB7XG5cdFx0aWYgKCF0aGlzLl9maWx0ZXIgfHwgIXRoaXMuYWlTZXR0aW5nc1NlYXJjaFNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5nZXRMTE1SYW5rZWRJdGVtcyh0b2tlbik7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGZpbHRlck1hdGNoZXM6IGl0ZW1zLFxuXHRcdFx0ZXhhY3RNYXRjaDogZmFsc2Vcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRMTE1SYW5rZWRJdGVtcyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZXR0aW5nTWF0Y2hbXT4ge1xuXHRcdGNvbnN0IHNldHRpbmdzUmVjb3JkID0gdGhpcy5fcmVjb3JkUHJvdmlkZXIuZ2V0U2V0dGluZ3NSZWNvcmQoKTtcblx0XHRjb25zdCBmaWx0ZXJNYXRjaGVzOiBJU2V0dGluZ01hdGNoW10gPSBbXTtcblx0XHRjb25zdCBzZXR0aW5ncyA9IGF3YWl0IHRoaXMuYWlTZXR0aW5nc1NlYXJjaFNlcnZpY2UuZ2V0TExNUmFua2VkUmVzdWx0cyh0aGlzLl9maWx0ZXIsIHRva2VuKTtcblx0XHRpZiAoIXNldHRpbmdzKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzZXR0aW5nS2V5IG9mIHNldHRpbmdzKSB7XG5cdFx0XHRpZiAoIXNldHRpbmdzUmVjb3JkW3NldHRpbmdLZXldKSB7XG5cdFx0XHRcdC8vIE5vbi1leGlzdGVudCBzZXR0aW5nLlxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZpbHRlck1hdGNoZXMucHVzaCh7XG5cdFx0XHRcdHNldHRpbmc6IHNldHRpbmdzUmVjb3JkW3NldHRpbmdLZXldLFxuXHRcdFx0XHRtYXRjaGVzOiBbc2V0dGluZ3NSZWNvcmRbc2V0dGluZ0tleV0ucmFuZ2VdLFxuXHRcdFx0XHRtYXRjaFR5cGU6IFNldHRpbmdNYXRjaFR5cGUuUmVtb3RlTWF0Y2gsXG5cdFx0XHRcdGtleU1hdGNoU2NvcmU6IDAsXG5cdFx0XHRcdHNjb3JlOiAwLCAvLyB0aGUgcmVzdWx0cyBhcmUgc29ydGVkIHVwc3RyZWFtLlxuXHRcdFx0XHRwcm92aWRlck5hbWU6IExMTV9SQU5LRURfU0VBUkNIX1BST1ZJREVSX05BTUVcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBmaWx0ZXJNYXRjaGVzO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElQcmVmZXJlbmNlc1NlYXJjaFNlcnZpY2UsIFByZWZlcmVuY2VzU2VhcmNoU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBR3pCLFNBQWlCLGdDQUFnQyw0QkFBNEIsa0JBQWtCLG9CQUFvQjtBQUNuSCxTQUFTLGtCQUFrQjtBQUMzQixZQUFZLGFBQWE7QUFDekIsU0FBUyx1QkFBc0M7QUFFL0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQXNILHNCQUFzQix3QkFBd0I7QUFDcEssU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxpQ0FBb0QsMkJBQW9HLGlDQUFpQyxtQ0FBbUMsbUNBQW1DO0FBT2pRLElBQU0sMkJBQU4sY0FBdUMsV0FBZ0Q7QUFBQSxFQU03RixZQUN5QyxzQkFDQSxzQkFDdkM7QUFDRCxVQUFNO0FBSGtDO0FBQ0E7QUFBQSxFQUd6QztBQUFBLEVBRUEsdUJBQXVCLFFBQXFDO0FBQzNELFdBQU8sS0FBSyxxQkFBcUIsZUFBZSxxQkFBcUIsTUFBTTtBQUFBLEVBQzVFO0FBQUEsRUFFQSxJQUFZLHNCQUErQjtBQUMxQyxVQUFNLG9CQUFvQixLQUFLLHFCQUFxQixTQUEwQyxFQUFFLFVBQVU7QUFDMUcsV0FBTyxrQkFBa0I7QUFBQSxFQUMxQjtBQUFBLEVBRUEsd0JBQXdCLFFBQW1EO0FBQzFFLFFBQUksQ0FBQyxLQUFLLHFCQUFxQjtBQUM5QixhQUFPO0FBQUEsSUFDUjtBQUVBLFNBQUssMEJBQTBCLEtBQUsscUJBQXFCLGVBQWUsb0JBQW9CO0FBQzVGLFNB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
