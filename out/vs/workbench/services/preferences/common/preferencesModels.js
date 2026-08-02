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
import { coalesce } from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { visit } from "../../../../base/common/json.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Range } from "../../../../editor/common/core/range.js";
import { Selection } from "../../../../editor/common/core/selection.js";
import * as nls from "../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ConfigurationScope, Extensions, OVERRIDE_PROPERTY_REGEX } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorModel } from "../../../common/editor/editorModel.js";
import { SettingMatchType } from "./preferences.js";
import { FOLDER_SCOPES, WORKSPACE_SCOPES } from "../../configuration/common/configuration.js";
import { createValidator } from "./preferencesValidation.js";
import { isString } from "../../../../base/common/types.js";
const nullRange = { startLineNumber: -1, startColumn: -1, endLineNumber: -1, endColumn: -1 };
function isNullRange(range) {
  return range.startLineNumber === -1 && range.startColumn === -1 && range.endLineNumber === -1 && range.endColumn === -1;
}
function fixSettingLinks(text) {
  return text.replace(/`#([^#`]*)#`/g, (_, settingName) => `\`${settingName}\``);
}
class AbstractSettingsModel extends EditorModel {
  constructor() {
    super(...arguments);
    this._currentResultGroups = /* @__PURE__ */ new Map();
  }
  updateResultGroup(id, resultGroup) {
    if (resultGroup) {
      this._currentResultGroups.set(id, resultGroup);
    } else {
      this._currentResultGroups.delete(id);
    }
    this.removeDuplicateResults();
    return this.update();
  }
  /**
   * Remove duplicates between result groups, preferring results in earlier groups
   */
  removeDuplicateResults() {
    const settingKeys = /* @__PURE__ */ new Set();
    [...this._currentResultGroups.keys()].sort((a, b) => this._currentResultGroups.get(a).order - this._currentResultGroups.get(b).order).forEach((groupId) => {
      const group = this._currentResultGroups.get(groupId);
      group.result.filterMatches = group.result.filterMatches.filter((s) => !settingKeys.has(s.setting.key));
      group.result.filterMatches.forEach((s) => settingKeys.add(s.setting.key));
    });
  }
  filterSettings(filter, groupFilter, settingMatcher) {
    const allGroups = this.filterGroups;
    const filterMatches = [];
    for (const group of allGroups) {
      const groupMatched = groupFilter(group);
      for (const section of group.sections) {
        for (const setting of section.settings) {
          const settingMatchResult = settingMatcher(setting, group);
          if (groupMatched || settingMatchResult) {
            filterMatches.push({
              setting,
              matches: settingMatchResult && settingMatchResult.matches,
              matchType: settingMatchResult?.matchType ?? SettingMatchType.None,
              keyMatchScore: settingMatchResult?.keyMatchScore ?? 0,
              score: settingMatchResult?.score ?? 0
            });
          }
        }
      }
    }
    return filterMatches;
  }
  getPreference(key) {
    for (const group of this.settingsGroups) {
      for (const section of group.sections) {
        for (const setting of section.settings) {
          if (key === setting.key) {
            return setting;
          }
        }
      }
    }
    return void 0;
  }
  collectMetadata(groups) {
    const metadata = /* @__PURE__ */ Object.create(null);
    let hasMetadata = false;
    groups.forEach((g) => {
      if (g.result.metadata) {
        metadata[g.id] = g.result.metadata;
        hasMetadata = true;
      }
    });
    return hasMetadata ? metadata : null;
  }
  get filterGroups() {
    return this.settingsGroups;
  }
}
class SettingsEditorModel extends AbstractSettingsModel {
  constructor(reference, _configurationTarget) {
    super();
    this._configurationTarget = _configurationTarget;
    this._onDidChangeGroups = this._register(new Emitter());
    this.onDidChangeGroups = this._onDidChangeGroups.event;
    this.settingsModel = reference.object.textEditorModel;
    this._register(this.onWillDispose(() => reference.dispose()));
    this._register(this.settingsModel.onDidChangeContent(() => {
      this._settingsGroups = void 0;
      this._onDidChangeGroups.fire();
    }));
  }
  get uri() {
    return this.settingsModel.uri;
  }
  get configurationTarget() {
    return this._configurationTarget;
  }
  get settingsGroups() {
    if (!this._settingsGroups) {
      this.parse();
    }
    return this._settingsGroups;
  }
  get content() {
    return this.settingsModel.getValue();
  }
  isSettingsProperty(property, previousParents) {
    return previousParents.length === 0;
  }
  parse() {
    this._settingsGroups = parse(this.settingsModel, (property, previousParents) => this.isSettingsProperty(property, previousParents));
  }
  update() {
    const resultGroups = [...this._currentResultGroups.values()];
    if (!resultGroups.length) {
      return void 0;
    }
    const filteredSettings = [];
    const matches = [];
    resultGroups.forEach((group) => {
      group.result.filterMatches.forEach((filterMatch) => {
        filteredSettings.push(filterMatch.setting);
        if (filterMatch.matches) {
          matches.push(...filterMatch.matches);
        }
      });
    });
    let filteredGroup;
    const modelGroup = this.settingsGroups[0];
    if (modelGroup) {
      filteredGroup = {
        id: modelGroup.id,
        range: modelGroup.range,
        sections: [{
          settings: filteredSettings
        }],
        title: modelGroup.title,
        titleRange: modelGroup.titleRange,
        order: modelGroup.order,
        extensionInfo: modelGroup.extensionInfo
      };
    }
    const metadata = this.collectMetadata(resultGroups);
    return {
      allGroups: this.settingsGroups,
      filteredGroups: filteredGroup ? [filteredGroup] : [],
      matches,
      metadata: metadata ?? void 0
    };
  }
}
let Settings2EditorModel = class extends AbstractSettingsModel {
  constructor(_defaultSettings, configurationService) {
    super();
    this._defaultSettings = _defaultSettings;
    this._onDidChangeGroups = this._register(new Emitter());
    this.onDidChangeGroups = this._onDidChangeGroups.event;
    this.additionalGroups = [];
    this.dirty = false;
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.source === ConfigurationTarget.DEFAULT) {
        this.dirty = true;
        this._onDidChangeGroups.fire();
      }
    }));
    this._register(Registry.as(Extensions.Configuration).onDidSchemaChange((e) => {
      this.dirty = true;
      this._onDidChangeGroups.fire();
    }));
  }
  /** Doesn't include the "Commonly Used" group */
  get filterGroups() {
    return this.settingsGroups.slice(1);
  }
  get settingsGroups() {
    const groups = this._defaultSettings.getSettingsGroups(this.dirty);
    this.dirty = false;
    return [...groups, ...this.additionalGroups];
  }
  /** For programmatically added groups outside of registered configurations */
  setAdditionalGroups(groups) {
    this.additionalGroups = groups;
  }
  update() {
    throw new Error("Not supported");
  }
};
Settings2EditorModel = __decorateClass([
  __decorateParam(1, IConfigurationService)
], Settings2EditorModel);
function parse(model, isSettingsProperty) {
  const settings = [];
  let overrideSetting = null;
  let currentProperty = null;
  let currentParent = [];
  const previousParents = [];
  let settingsPropertyIndex = -1;
  const range = {
    startLineNumber: 0,
    startColumn: 0,
    endLineNumber: 0,
    endColumn: 0
  };
  function onValue(value, offset, length) {
    if (Array.isArray(currentParent)) {
      currentParent.push(value);
    } else if (currentProperty) {
      currentParent[currentProperty] = value;
    }
    if (previousParents.length === settingsPropertyIndex + 1 || previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null) {
      const setting = previousParents.length === settingsPropertyIndex + 1 ? settings[settings.length - 1] : overrideSetting.overrides[overrideSetting.overrides.length - 1];
      if (setting) {
        const valueStartPosition = model.getPositionAt(offset);
        const valueEndPosition = model.getPositionAt(offset + length);
        setting.value = value;
        setting.valueRange = {
          startLineNumber: valueStartPosition.lineNumber,
          startColumn: valueStartPosition.column,
          endLineNumber: valueEndPosition.lineNumber,
          endColumn: valueEndPosition.column
        };
        setting.range = Object.assign(setting.range, {
          endLineNumber: valueEndPosition.lineNumber,
          endColumn: valueEndPosition.column
        });
      }
    }
  }
  const visitor = {
    onObjectBegin: (offset, length) => {
      if (isSettingsProperty(currentProperty, previousParents)) {
        settingsPropertyIndex = previousParents.length;
        const position = model.getPositionAt(offset);
        range.startLineNumber = position.lineNumber;
        range.startColumn = position.column;
      }
      const object = {};
      onValue(object, offset, length);
      currentParent = object;
      currentProperty = null;
      previousParents.push(currentParent);
    },
    onObjectProperty: (name, offset, length) => {
      currentProperty = name;
      if (previousParents.length === settingsPropertyIndex + 1 || previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null) {
        const settingStartPosition = model.getPositionAt(offset);
        const setting = {
          description: [],
          descriptionIsMarkdown: false,
          key: name,
          keyRange: {
            startLineNumber: settingStartPosition.lineNumber,
            startColumn: settingStartPosition.column + 1,
            endLineNumber: settingStartPosition.lineNumber,
            endColumn: settingStartPosition.column + length
          },
          range: {
            startLineNumber: settingStartPosition.lineNumber,
            startColumn: settingStartPosition.column,
            endLineNumber: 0,
            endColumn: 0
          },
          value: null,
          valueRange: nullRange,
          descriptionRanges: [],
          overrides: [],
          overrideOf: overrideSetting ?? void 0
        };
        if (previousParents.length === settingsPropertyIndex + 1) {
          settings.push(setting);
          if (OVERRIDE_PROPERTY_REGEX.test(name)) {
            overrideSetting = setting;
          }
        } else {
          overrideSetting.overrides.push(setting);
        }
      }
    },
    onObjectEnd: (offset, length) => {
      currentParent = previousParents.pop();
      if (settingsPropertyIndex !== -1 && (previousParents.length === settingsPropertyIndex + 1 || previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null)) {
        const setting = previousParents.length === settingsPropertyIndex + 1 ? settings[settings.length - 1] : overrideSetting.overrides[overrideSetting.overrides.length - 1];
        if (setting) {
          const valueEndPosition = model.getPositionAt(offset + length);
          setting.valueRange = Object.assign(setting.valueRange, {
            endLineNumber: valueEndPosition.lineNumber,
            endColumn: valueEndPosition.column
          });
          setting.range = Object.assign(setting.range, {
            endLineNumber: valueEndPosition.lineNumber,
            endColumn: valueEndPosition.column
          });
        }
        if (previousParents.length === settingsPropertyIndex + 1) {
          overrideSetting = null;
        }
      }
      if (previousParents.length === settingsPropertyIndex) {
        const position = model.getPositionAt(offset);
        range.endLineNumber = position.lineNumber;
        range.endColumn = position.column;
        settingsPropertyIndex = -1;
      }
    },
    onArrayBegin: (offset, length) => {
      const array = [];
      onValue(array, offset, length);
      previousParents.push(currentParent);
      currentParent = array;
      currentProperty = null;
    },
    onArrayEnd: (offset, length) => {
      currentParent = previousParents.pop();
      if (previousParents.length === settingsPropertyIndex + 1 || previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null) {
        const setting = previousParents.length === settingsPropertyIndex + 1 ? settings[settings.length - 1] : overrideSetting.overrides[overrideSetting.overrides.length - 1];
        if (setting) {
          const valueEndPosition = model.getPositionAt(offset + length);
          setting.valueRange = Object.assign(setting.valueRange, {
            endLineNumber: valueEndPosition.lineNumber,
            endColumn: valueEndPosition.column
          });
          setting.range = Object.assign(setting.range, {
            endLineNumber: valueEndPosition.lineNumber,
            endColumn: valueEndPosition.column
          });
        }
      }
    },
    onLiteralValue: onValue,
    onError: (error) => {
      const setting = settings[settings.length - 1];
      if (setting && (isNullRange(setting.range) || isNullRange(setting.keyRange) || isNullRange(setting.valueRange))) {
        settings.pop();
      }
    }
  };
  if (!model.isDisposed()) {
    visit(model.getValue(), visitor);
  }
  return settings.length > 0 ? [{
    id: model.isDisposed() ? "" : model.id,
    sections: [
      {
        settings
      }
    ],
    title: "",
    titleRange: nullRange,
    range
  }] : [];
}
class WorkspaceConfigurationEditorModel extends SettingsEditorModel {
  constructor() {
    super(...arguments);
    this._configurationGroups = [];
  }
  get configurationGroups() {
    return this._configurationGroups;
  }
  parse() {
    super.parse();
    this._configurationGroups = parse(this.settingsModel, (property, previousParents) => previousParents.length === 0);
  }
  isSettingsProperty(property, previousParents) {
    return property === "settings" && previousParents.length === 1;
  }
}
class DefaultSettings extends Disposable {
  constructor(_mostCommonlyUsedSettingsKeys, target, configurationService) {
    super();
    this._mostCommonlyUsedSettingsKeys = _mostCommonlyUsedSettingsKeys;
    this.target = target;
    this.configurationService = configurationService;
    this._settingsByName = /* @__PURE__ */ new Map();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.source === ConfigurationTarget.DEFAULT) {
        this.reset();
        this._onDidChange.fire();
      }
    }));
  }
  getContent(forceUpdate = false) {
    if (!this._content || forceUpdate) {
      this.initialize();
    }
    return this._content;
  }
  getContentWithoutMostCommonlyUsed(forceUpdate = false) {
    if (!this._contentWithoutMostCommonlyUsed || forceUpdate) {
      this.initialize();
    }
    return this._contentWithoutMostCommonlyUsed;
  }
  getSettingsGroups(forceUpdate = false) {
    if (!this._allSettingsGroups || forceUpdate) {
      this.initialize();
    }
    return this._allSettingsGroups;
  }
  initialize() {
    this._allSettingsGroups = this.parse();
    this._content = this.toContent(this._allSettingsGroups, 0);
    this._contentWithoutMostCommonlyUsed = this.toContent(this._allSettingsGroups, 1);
  }
  reset() {
    this._content = void 0;
    this._contentWithoutMostCommonlyUsed = void 0;
    this._allSettingsGroups = void 0;
  }
  parse() {
    const settingsGroups = this.getRegisteredGroups();
    this.initAllSettingsMap(settingsGroups);
    const mostCommonlyUsed = this.getMostCommonlyUsedSettings();
    return [mostCommonlyUsed, ...settingsGroups];
  }
  getRegisteredGroups() {
    const registry = Registry.as(Extensions.Configuration);
    const allConfigurations = { ...registry.getConfigurationProperties() };
    const excludedConfigurations = registry.getExcludedConfigurationProperties();
    for (const policyKey of this.configurationService.keys().policy ?? []) {
      const policyConfiguration = excludedConfigurations[policyKey];
      if (policyConfiguration) {
        allConfigurations[policyKey] = policyConfiguration;
      }
    }
    const groups = this.removeEmptySettingsGroups(this.parseProperties(allConfigurations).sort(this.compareGroups));
    return this.sortGroups(groups);
  }
  sortGroups(groups) {
    groups.forEach((group) => {
      group.sections.forEach((section) => {
        section.settings.sort((a, b) => a.key.localeCompare(b.key));
      });
    });
    return groups;
  }
  initAllSettingsMap(allSettingsGroups) {
    this._settingsByName = /* @__PURE__ */ new Map();
    for (const group of allSettingsGroups) {
      for (const section of group.sections) {
        for (const setting of section.settings) {
          this._settingsByName.set(setting.key, setting);
        }
      }
    }
  }
  getMostCommonlyUsedSettings() {
    const settings = coalesce(this._mostCommonlyUsedSettingsKeys.map((key) => {
      const setting = this._settingsByName.get(key);
      if (setting) {
        return {
          description: setting.description,
          key: setting.key,
          value: setting.value,
          keyRange: nullRange,
          range: nullRange,
          valueRange: nullRange,
          overrides: [],
          scope: ConfigurationScope.RESOURCE,
          type: setting.type,
          enum: setting.enum,
          enumDescriptions: setting.enumDescriptions,
          descriptionRanges: []
        };
      }
      return null;
    }));
    return {
      id: "mostCommonlyUsed",
      range: nullRange,
      title: nls.localize("commonlyUsed", "Commonly Used"),
      titleRange: nullRange,
      sections: [
        {
          settings
        }
      ]
    };
  }
  parseProperties(properties) {
    const result = [];
    const byTitle = /* @__PURE__ */ new Map();
    const byId = /* @__PURE__ */ new Map();
    for (const [key, property] of Object.entries(properties)) {
      if (!property.section) {
        continue;
      }
      let settingsGroup;
      if (property.section.title) {
        const groups = byTitle.get(property.section.title);
        if (groups) {
          const extensionId = property.section.extensionInfo?.id;
          settingsGroup = groups.find((g) => g.extensionInfo?.id === extensionId);
        }
      }
      if (!settingsGroup && property.section.id) {
        const groups = byId.get(property.section.id);
        if (groups) {
          const extensionId = property.section.extensionInfo?.id;
          settingsGroup = groups.find((g) => g.extensionInfo?.id === extensionId && !g.title);
        }
        if (settingsGroup && !settingsGroup?.title && property.section.title) {
          settingsGroup.title = property.section.title;
          const byTitleGroups = byTitle.get(property.section.title);
          if (byTitleGroups) {
            byTitleGroups.push(settingsGroup);
          } else {
            byTitle.set(property.section.title, [settingsGroup]);
          }
        }
      }
      if (!settingsGroup) {
        settingsGroup = { sections: [{ title: property.section.title, settings: [] }], id: property.section.id || "", title: property.section.title ?? "", titleRange: nullRange, order: property.section.order, range: nullRange, extensionInfo: isString(property.source) ? void 0 : property.source };
        result.push(settingsGroup);
        if (property.section.title) {
          const byTitleGroups = byTitle.get(property.section.title);
          if (byTitleGroups) {
            byTitleGroups.push(settingsGroup);
          } else {
            byTitle.set(property.section.title, [settingsGroup]);
          }
        }
        if (property.section.id) {
          const byIdGroups = byId.get(property.section.id);
          if (byIdGroups) {
            byIdGroups.push(settingsGroup);
          } else {
            byId.set(property.section.id, [settingsGroup]);
          }
        }
      }
      const setting = this.parseSetting(key, property);
      if (setting) {
        settingsGroup.sections[0].settings.push(setting);
      }
    }
    return result;
  }
  removeEmptySettingsGroups(settingsGroups) {
    const result = [];
    for (const settingsGroup of settingsGroups) {
      settingsGroup.sections = settingsGroup.sections.filter((section) => section.settings.length > 0);
      if (settingsGroup.sections.length) {
        result.push(settingsGroup);
      }
    }
    return result;
  }
  parseSetting(key, prop) {
    if (!this.matchesScope(prop)) {
      return void 0;
    }
    const value = prop.default;
    let description = prop.markdownDescription || prop.description || "";
    if (typeof description !== "string") {
      description = "";
    }
    const descriptionLines = description.split("\n");
    const overrides = OVERRIDE_PROPERTY_REGEX.test(key) ? this.parseOverrideSettings(prop.default) : [];
    let listItemType;
    if (prop.type === "array" && prop.items && !Array.isArray(prop.items) && prop.items.type) {
      if (prop.items.enum) {
        listItemType = "enum";
      } else if (!Array.isArray(prop.items.type)) {
        listItemType = prop.items.type;
      }
    }
    const objectProperties = prop.type === "object" ? prop.properties : void 0;
    const objectPatternProperties = prop.type === "object" ? prop.patternProperties : void 0;
    const objectAdditionalProperties = prop.type === "object" ? prop.additionalProperties : void 0;
    const propertyNames = prop.type === "object" ? prop.propertyNames : void 0;
    let enumToUse = prop.enum;
    let enumDescriptions = prop.markdownEnumDescriptions ?? prop.enumDescriptions;
    let enumDescriptionsAreMarkdown = !!prop.markdownEnumDescriptions;
    if (listItemType === "enum" && !Array.isArray(prop.items)) {
      enumToUse = prop.items.enum;
      enumDescriptions = prop.items.markdownEnumDescriptions ?? prop.items.enumDescriptions;
      enumDescriptionsAreMarkdown = !!prop.items.markdownEnumDescriptions;
    }
    let allKeysAreBoolean = false;
    if (prop.type === "object" && !prop.additionalProperties && prop.properties && Object.keys(prop.properties).length) {
      allKeysAreBoolean = Object.keys(prop.properties).every((key2) => {
        return prop.properties[key2].type === "boolean";
      });
    }
    let isLanguageTagSetting = false;
    if (OVERRIDE_PROPERTY_REGEX.test(key)) {
      isLanguageTagSetting = true;
    }
    let defaultValueSource;
    if (!isLanguageTagSetting) {
      const registeredConfigurationProp = prop;
      if (registeredConfigurationProp && registeredConfigurationProp.defaultValueSource) {
        defaultValueSource = registeredConfigurationProp.defaultValueSource;
      }
    }
    if (!enumToUse && (prop.enumItemLabels || enumDescriptions || enumDescriptionsAreMarkdown)) {
      console.error(`The setting ${key} has enum-related fields, but doesn't have an enum field. This setting may render improperly in the Settings editor.`);
    }
    return {
      key,
      value,
      description: descriptionLines,
      descriptionIsMarkdown: !!prop.markdownDescription,
      keywords: prop.keywords,
      range: nullRange,
      keyRange: nullRange,
      valueRange: nullRange,
      descriptionRanges: [],
      overrides,
      scope: prop.scope,
      type: prop.type,
      arrayItemType: listItemType,
      objectProperties,
      objectPatternProperties,
      objectAdditionalProperties,
      propertyNames,
      enum: enumToUse,
      enumDescriptions,
      enumDescriptionsAreMarkdown,
      enumItemLabels: prop.enumItemLabels,
      uniqueItems: prop.uniqueItems,
      tags: prop.tags,
      disallowSyncIgnore: prop.disallowSyncIgnore,
      restricted: prop.restricted,
      extensionInfo: isString(prop.source) ? void 0 : prop.source,
      deprecationMessage: prop.markdownDeprecationMessage || prop.deprecationMessage,
      deprecationMessageIsMarkdown: !!prop.markdownDeprecationMessage,
      validator: createValidator(prop),
      allKeysAreBoolean,
      editPresentation: prop.editPresentation,
      order: prop.order,
      nonLanguageSpecificDefaultValueSource: defaultValueSource,
      isLanguageTagSetting,
      categoryLabel: (isString(prop.source) ? void 0 : prop.source?.id) === prop.section?.id ? prop.title : prop.section?.id
    };
  }
  parseOverrideSettings(overrideSettings) {
    return Object.keys(overrideSettings).map((key) => ({
      key,
      value: overrideSettings[key],
      description: [],
      descriptionIsMarkdown: false,
      range: nullRange,
      keyRange: nullRange,
      valueRange: nullRange,
      descriptionRanges: [],
      overrides: []
    }));
  }
  matchesScope(property) {
    if (!property.scope) {
      return true;
    }
    if (this.target === ConfigurationTarget.WORKSPACE_FOLDER) {
      return FOLDER_SCOPES.indexOf(property.scope) !== -1;
    }
    if (this.target === ConfigurationTarget.WORKSPACE) {
      return WORKSPACE_SCOPES.indexOf(property.scope) !== -1;
    }
    return true;
  }
  compareGroups(c1, c2) {
    if (typeof c1?.order !== "number") {
      return 1;
    }
    if (typeof c2?.order !== "number") {
      return -1;
    }
    if (c1.order === c2.order) {
      const title1 = c1.title || "";
      const title2 = c2.title || "";
      return title1.localeCompare(title2);
    }
    return c1.order - c2.order;
  }
  toContent(settingsGroups, startIndex) {
    const builder = new SettingsContentBuilder();
    for (let i = startIndex; i < settingsGroups.length; i++) {
      builder.pushGroup(settingsGroups[i], i === startIndex, i === settingsGroups.length - 1);
    }
    return builder.getContent();
  }
}
class DefaultSettingsEditorModel extends AbstractSettingsModel {
  constructor(_uri, reference, defaultSettings) {
    super();
    this._uri = _uri;
    this.defaultSettings = defaultSettings;
    this._onDidChangeGroups = this._register(new Emitter());
    this.onDidChangeGroups = this._onDidChangeGroups.event;
    this._register(defaultSettings.onDidChange(() => this._onDidChangeGroups.fire()));
    this._model = reference.object.textEditorModel;
    this._register(this.onWillDispose(() => reference.dispose()));
  }
  get uri() {
    return this._uri;
  }
  get target() {
    return this.defaultSettings.target;
  }
  get settingsGroups() {
    return this.defaultSettings.getSettingsGroups();
  }
  get filterGroups() {
    return this.settingsGroups.slice(1);
  }
  update() {
    if (this._model.isDisposed()) {
      return void 0;
    }
    const resultGroups = [...this._currentResultGroups.values()].sort((a, b) => a.order - b.order);
    const nonEmptyResultGroups = resultGroups.filter((group) => group.result.filterMatches.length);
    const startLine = this.settingsGroups.at(-1).range.endLineNumber + 2;
    const { settingsGroups: filteredGroups, matches } = this.writeResultGroups(nonEmptyResultGroups, startLine);
    const metadata = this.collectMetadata(resultGroups);
    return resultGroups.length ? {
      allGroups: this.settingsGroups,
      filteredGroups,
      matches,
      metadata: metadata ?? void 0
    } : void 0;
  }
  /**
   * Translate the ISearchResultGroups to text, and write it to the editor model
   */
  writeResultGroups(groups, startLine) {
    const contentBuilderOffset = startLine - 1;
    const builder = new SettingsContentBuilder(contentBuilderOffset);
    const settingsGroups = [];
    const matches = [];
    if (groups.length) {
      builder.pushLine(",");
      groups.forEach((resultGroup) => {
        const settingsGroup = this.getGroup(resultGroup);
        settingsGroups.push(settingsGroup);
        matches.push(...this.writeSettingsGroupToBuilder(builder, settingsGroup, resultGroup.result.filterMatches));
      });
    }
    const groupContent = builder.getContent() + "\n";
    const groupEndLine = this._model.getLineCount();
    const cursorPosition = new Selection(startLine, 1, startLine, 1);
    const edit = {
      text: groupContent,
      forceMoveMarkers: true,
      range: new Range(startLine, 1, groupEndLine, 1)
    };
    this._model.pushEditOperations([cursorPosition], [edit], () => [cursorPosition]);
    const tokenizeTo = Math.min(startLine + 60, this._model.getLineCount());
    this._model.tokenization.forceTokenization(tokenizeTo);
    return { matches, settingsGroups };
  }
  writeSettingsGroupToBuilder(builder, settingsGroup, filterMatches) {
    filterMatches = filterMatches.map((filteredMatch) => {
      return {
        setting: filteredMatch.setting,
        score: filteredMatch.score,
        matchType: filteredMatch.matchType,
        keyMatchScore: filteredMatch.keyMatchScore,
        matches: filteredMatch.matches && filteredMatch.matches.map((match) => {
          return new Range(
            match.startLineNumber - filteredMatch.setting.range.startLineNumber,
            match.startColumn,
            match.endLineNumber - filteredMatch.setting.range.startLineNumber,
            match.endColumn
          );
        })
      };
    });
    builder.pushGroup(settingsGroup);
    const fixedMatches = filterMatches.map((m) => m.matches || []).flatMap((settingMatches, i) => {
      const setting = settingsGroup.sections[0].settings[i];
      return settingMatches.map((range) => {
        return new Range(
          range.startLineNumber + setting.range.startLineNumber,
          range.startColumn,
          range.endLineNumber + setting.range.startLineNumber,
          range.endColumn
        );
      });
    });
    return fixedMatches;
  }
  copySetting(setting) {
    return {
      description: setting.description,
      scope: setting.scope,
      type: setting.type,
      enum: setting.enum,
      enumDescriptions: setting.enumDescriptions,
      key: setting.key,
      value: setting.value,
      range: setting.range,
      overrides: [],
      overrideOf: setting.overrideOf,
      tags: setting.tags,
      deprecationMessage: setting.deprecationMessage,
      keyRange: nullRange,
      valueRange: nullRange,
      descriptionIsMarkdown: void 0,
      descriptionRanges: []
    };
  }
  getPreference(key) {
    for (const group of this.settingsGroups) {
      for (const section of group.sections) {
        for (const setting of section.settings) {
          if (setting.key === key) {
            return setting;
          }
        }
      }
    }
    return void 0;
  }
  getGroup(resultGroup) {
    return {
      id: resultGroup.id,
      range: nullRange,
      title: resultGroup.label,
      titleRange: nullRange,
      sections: [
        {
          settings: resultGroup.result.filterMatches.map((m) => this.copySetting(m.setting))
        }
      ]
    };
  }
}
class SettingsContentBuilder {
  constructor(_rangeOffset = 0) {
    this._rangeOffset = _rangeOffset;
    this._contentByLines = [];
  }
  get lineCountWithOffset() {
    return this._contentByLines.length + this._rangeOffset;
  }
  get lastLine() {
    return this._contentByLines[this._contentByLines.length - 1] || "";
  }
  pushLine(...lineText) {
    this._contentByLines.push(...lineText);
  }
  pushGroup(settingsGroups, isFirst, isLast) {
    this._contentByLines.push(isFirst ? "[{" : "{");
    const lastSetting = this._pushGroup(settingsGroups, "  ");
    if (lastSetting) {
      const lineIdx = lastSetting.range.endLineNumber - this._rangeOffset;
      const content = this._contentByLines[lineIdx - 2];
      this._contentByLines[lineIdx - 2] = content.substring(0, content.length - 1);
    }
    this._contentByLines.push(isLast ? "}]" : "},");
  }
  _pushGroup(group, indent) {
    let lastSetting = null;
    const groupStart = this.lineCountWithOffset + 1;
    for (const section of group.sections) {
      if (section.title) {
        this.addDescription([section.title], indent, this._contentByLines);
      }
      if (section.settings.length) {
        for (const setting of section.settings) {
          this.pushSetting(setting, indent);
          lastSetting = setting;
        }
      }
    }
    group.range = { startLineNumber: groupStart, startColumn: 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length };
    return lastSetting;
  }
  getContent() {
    return this._contentByLines.join("\n");
  }
  pushSetting(setting, indent) {
    const settingStart = this.lineCountWithOffset + 1;
    this.pushSettingDescription(setting, indent);
    let preValueContent = indent;
    const keyString = JSON.stringify(setting.key);
    preValueContent += keyString;
    setting.keyRange = { startLineNumber: this.lineCountWithOffset + 1, startColumn: preValueContent.indexOf(setting.key) + 1, endLineNumber: this.lineCountWithOffset + 1, endColumn: setting.key.length };
    preValueContent += ": ";
    const valueStart = this.lineCountWithOffset + 1;
    this.pushValue(setting, preValueContent, indent);
    setting.valueRange = { startLineNumber: valueStart, startColumn: preValueContent.length + 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length + 1 };
    this._contentByLines[this._contentByLines.length - 1] += ",";
    this._contentByLines.push("");
    setting.range = { startLineNumber: settingStart, startColumn: 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length };
  }
  pushSettingDescription(setting, indent) {
    setting.descriptionRanges = [];
    const descriptionPreValue = indent + "// ";
    const deprecationMessageLines = setting.deprecationMessage?.split(/\n/g) ?? [];
    for (let line of [...deprecationMessageLines, ...setting.description]) {
      line = fixSettingLinks(line);
      this._contentByLines.push(descriptionPreValue + line);
      setting.descriptionRanges.push({ startLineNumber: this.lineCountWithOffset, startColumn: this.lastLine.indexOf(line) + 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length });
    }
    if (setting.enum && setting.enumDescriptions?.some((desc) => !!desc)) {
      setting.enumDescriptions.forEach((desc, i) => {
        const displayEnum = escapeInvisibleChars(String(setting.enum[i]));
        const line = desc ? `${displayEnum}: ${fixSettingLinks(desc)}` : displayEnum;
        const lines = line.split(/\n/g);
        lines[0] = " - " + lines[0];
        this._contentByLines.push(...lines.map((l) => `${indent}// ${l}`));
        setting.descriptionRanges.push({ startLineNumber: this.lineCountWithOffset, startColumn: this.lastLine.indexOf(line) + 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length });
      });
    }
  }
  pushValue(setting, preValueConent, indent) {
    const valueString = JSON.stringify(setting.value, null, indent);
    if (valueString && typeof setting.value === "object") {
      if (setting.overrides && setting.overrides.length) {
        this._contentByLines.push(preValueConent + " {");
        for (const subSetting of setting.overrides) {
          this.pushSetting(subSetting, indent + indent);
          this._contentByLines.pop();
        }
        const lastSetting = setting.overrides[setting.overrides.length - 1];
        const content = this._contentByLines[lastSetting.range.endLineNumber - 2];
        this._contentByLines[lastSetting.range.endLineNumber - 2] = content.substring(0, content.length - 1);
        this._contentByLines.push(indent + "}");
      } else {
        const mulitLineValue = valueString.split("\n");
        this._contentByLines.push(preValueConent + mulitLineValue[0]);
        for (let i = 1; i < mulitLineValue.length; i++) {
          this._contentByLines.push(indent + mulitLineValue[i]);
        }
      }
    } else {
      this._contentByLines.push(preValueConent + valueString);
    }
  }
  addDescription(description, indent, result) {
    for (const line of description) {
      result.push(indent + "// " + line);
    }
  }
}
class RawSettingsContentBuilder extends SettingsContentBuilder {
  constructor(indent = "	") {
    super(0);
    this.indent = indent;
  }
  pushGroup(settingsGroups) {
    this._pushGroup(settingsGroups, this.indent);
  }
}
class DefaultRawSettingsEditorModel extends Disposable {
  constructor(defaultSettings) {
    super();
    this.defaultSettings = defaultSettings;
    this._content = null;
    this._onDidContentChanged = this._register(new Emitter());
    this.onDidContentChanged = this._onDidContentChanged.event;
    this._register(defaultSettings.onDidChange(() => {
      this._content = null;
      this._onDidContentChanged.fire();
    }));
  }
  get content() {
    if (this._content === null) {
      const builder = new RawSettingsContentBuilder();
      builder.pushLine("{");
      for (const settingsGroup of this.defaultSettings.getRegisteredGroups()) {
        builder.pushGroup(settingsGroup);
      }
      builder.pushLine("}");
      this._content = builder.getContent();
    }
    return this._content;
  }
}
function escapeInvisibleChars(enumValue) {
  return enumValue && enumValue.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}
function defaultKeybindingsContents(keybindingService) {
  const defaultsHeader = "// " + nls.localize("defaultKeybindingsHeader", "Override key bindings by placing them into your key bindings file.");
  return defaultsHeader + "\n" + keybindingService.getDefaultKeybindingsContent();
}
let DefaultKeybindingsEditorModel = class {
  constructor(_uri, keybindingService) {
    this._uri = _uri;
    this.keybindingService = keybindingService;
  }
  get uri() {
    return this._uri;
  }
  get content() {
    if (!this._content) {
      this._content = defaultKeybindingsContents(this.keybindingService);
    }
    return this._content;
  }
  getPreference() {
    return null;
  }
  dispose() {
  }
};
DefaultKeybindingsEditorModel = __decorateClass([
  __decorateParam(1, IKeybindingService)
], DefaultKeybindingsEditorModel);
export {
  DefaultKeybindingsEditorModel,
  DefaultRawSettingsEditorModel,
  DefaultSettings,
  DefaultSettingsEditorModel,
  Settings2EditorModel,
  SettingsEditorModel,
  WorkspaceConfigurationEditorModel,
  defaultKeybindingsContents,
  fixSettingLinks,
  nullRange
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXNNb2RlbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSlNPTlZpc2l0b3IsIHZpc2l0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSVNpbmdsZUVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25EZWZhdWx0VmFsdWVTb3VyY2UsIENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25Ob2RlLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgSUZpbHRlck1ldGFkYXRhLCBJRmlsdGVyUmVzdWx0LCBJR3JvdXBGaWx0ZXIsIElLZXliaW5kaW5nc0VkaXRvck1vZGVsLCBJU2VhcmNoUmVzdWx0R3JvdXAsIElTZXR0aW5nLCBJU2V0dGluZ01hdGNoLCBJU2V0dGluZ01hdGNoZXIsIElTZXR0aW5nc0VkaXRvck1vZGVsLCBJU2V0dGluZ3NHcm91cCwgU2V0dGluZ01hdGNoVHlwZSB9IGZyb20gJy4vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgRk9MREVSX1NDT1BFUywgV09SS1NQQUNFX1NDT1BFUyB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlVmFsaWRhdG9yIH0gZnJvbSAnLi9wcmVmZXJlbmNlc1ZhbGlkYXRpb24uanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbmV4cG9ydCBjb25zdCBudWxsUmFuZ2U6IElSYW5nZSA9IHsgc3RhcnRMaW5lTnVtYmVyOiAtMSwgc3RhcnRDb2x1bW46IC0xLCBlbmRMaW5lTnVtYmVyOiAtMSwgZW5kQ29sdW1uOiAtMSB9O1xuZnVuY3Rpb24gaXNOdWxsUmFuZ2UocmFuZ2U6IElSYW5nZSk6IGJvb2xlYW4geyByZXR1cm4gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSAtMSAmJiByYW5nZS5zdGFydENvbHVtbiA9PT0gLTEgJiYgcmFuZ2UuZW5kTGluZU51bWJlciA9PT0gLTEgJiYgcmFuZ2UuZW5kQ29sdW1uID09PSAtMTsgfVxuXG4vKipcbiAqIFN0cmlwcyBWUyBDb2RlJ3MgY3VzdG9tIGAjc2V0dGluZ0lkI2AgbGluayBzeW50YXggZnJvbSBhIG1hcmtkb3duIHN0cmluZyBzbyB0aGUgc2V0dGluZyBrZXlcbiAqIHJlbWFpbnMgYXMgaW5saW5lIGNvZGUgKGUuZy4gYGAgYHNldHRpbmdJZGAgYGApLiBVc2VmdWwgZm9yIGNvbnRleHRzIHRoYXQgZG9uJ3QgcmVuZGVyIG1hcmtkb3duIGxpbmtzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZml4U2V0dGluZ0xpbmtzKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiB0ZXh0LnJlcGxhY2UoL2AjKFteI2BdKikjYC9nLCAoXywgc2V0dGluZ05hbWUpID0+IGBcXGAke3NldHRpbmdOYW1lfVxcYGApO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBBYnN0cmFjdFNldHRpbmdzTW9kZWwgZXh0ZW5kcyBFZGl0b3JNb2RlbCB7XG5cblx0cHJvdGVjdGVkIF9jdXJyZW50UmVzdWx0R3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIElTZWFyY2hSZXN1bHRHcm91cD4oKTtcblxuXHR1cGRhdGVSZXN1bHRHcm91cChpZDogc3RyaW5nLCByZXN1bHRHcm91cDogSVNlYXJjaFJlc3VsdEdyb3VwIHwgdW5kZWZpbmVkKTogSUZpbHRlclJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHJlc3VsdEdyb3VwKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50UmVzdWx0R3JvdXBzLnNldChpZCwgcmVzdWx0R3JvdXApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50UmVzdWx0R3JvdXBzLmRlbGV0ZShpZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW1vdmVEdXBsaWNhdGVSZXN1bHRzKCk7XG5cdFx0cmV0dXJuIHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlIGR1cGxpY2F0ZXMgYmV0d2VlbiByZXN1bHQgZ3JvdXBzLCBwcmVmZXJyaW5nIHJlc3VsdHMgaW4gZWFybGllciBncm91cHNcblx0ICovXG5cdHByaXZhdGUgcmVtb3ZlRHVwbGljYXRlUmVzdWx0cygpOiB2b2lkIHtcblx0XHRjb25zdCBzZXR0aW5nS2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFsuLi50aGlzLl9jdXJyZW50UmVzdWx0R3JvdXBzLmtleXMoKV1cblx0XHRcdC5zb3J0KChhLCBiKSA9PiB0aGlzLl9jdXJyZW50UmVzdWx0R3JvdXBzLmdldChhKSEub3JkZXIgLSB0aGlzLl9jdXJyZW50UmVzdWx0R3JvdXBzLmdldChiKSEub3JkZXIpXG5cdFx0XHQuZm9yRWFjaChncm91cElkID0+IHtcblx0XHRcdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLl9jdXJyZW50UmVzdWx0R3JvdXBzLmdldChncm91cElkKSE7XG5cdFx0XHRcdGdyb3VwLnJlc3VsdC5maWx0ZXJNYXRjaGVzID0gZ3JvdXAucmVzdWx0LmZpbHRlck1hdGNoZXMuZmlsdGVyKHMgPT4gIXNldHRpbmdLZXlzLmhhcyhzLnNldHRpbmcua2V5KSk7XG5cdFx0XHRcdGdyb3VwLnJlc3VsdC5maWx0ZXJNYXRjaGVzLmZvckVhY2gocyA9PiBzZXR0aW5nS2V5cy5hZGQocy5zZXR0aW5nLmtleSkpO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRmaWx0ZXJTZXR0aW5ncyhmaWx0ZXI6IHN0cmluZywgZ3JvdXBGaWx0ZXI6IElHcm91cEZpbHRlciwgc2V0dGluZ01hdGNoZXI6IElTZXR0aW5nTWF0Y2hlcik6IElTZXR0aW5nTWF0Y2hbXSB7XG5cdFx0Y29uc3QgYWxsR3JvdXBzID0gdGhpcy5maWx0ZXJHcm91cHM7XG5cblx0XHRjb25zdCBmaWx0ZXJNYXRjaGVzOiBJU2V0dGluZ01hdGNoW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGFsbEdyb3Vwcykge1xuXHRcdFx0Y29uc3QgZ3JvdXBNYXRjaGVkID0gZ3JvdXBGaWx0ZXIoZ3JvdXApO1xuXHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIGdyb3VwLnNlY3Rpb25zKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZyBvZiBzZWN0aW9uLnNldHRpbmdzKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2V0dGluZ01hdGNoUmVzdWx0ID0gc2V0dGluZ01hdGNoZXIoc2V0dGluZywgZ3JvdXApO1xuXG5cdFx0XHRcdFx0aWYgKGdyb3VwTWF0Y2hlZCB8fCBzZXR0aW5nTWF0Y2hSZXN1bHQpIHtcblx0XHRcdFx0XHRcdGZpbHRlck1hdGNoZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHNldHRpbmcsXG5cdFx0XHRcdFx0XHRcdG1hdGNoZXM6IHNldHRpbmdNYXRjaFJlc3VsdCAmJiBzZXR0aW5nTWF0Y2hSZXN1bHQubWF0Y2hlcyxcblx0XHRcdFx0XHRcdFx0bWF0Y2hUeXBlOiBzZXR0aW5nTWF0Y2hSZXN1bHQ/Lm1hdGNoVHlwZSA/PyBTZXR0aW5nTWF0Y2hUeXBlLk5vbmUsXG5cdFx0XHRcdFx0XHRcdGtleU1hdGNoU2NvcmU6IHNldHRpbmdNYXRjaFJlc3VsdD8ua2V5TWF0Y2hTY29yZSA/PyAwLFxuXHRcdFx0XHRcdFx0XHRzY29yZTogc2V0dGluZ01hdGNoUmVzdWx0Py5zY29yZSA/PyAwXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmlsdGVyTWF0Y2hlcztcblx0fVxuXG5cdGdldFByZWZlcmVuY2Uoa2V5OiBzdHJpbmcpOiBJU2V0dGluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLnNldHRpbmdzR3JvdXBzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2YgZ3JvdXAuc2VjdGlvbnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHNlY3Rpb24uc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRpZiAoa2V5ID09PSBzZXR0aW5nLmtleSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHNldHRpbmc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCBjb2xsZWN0TWV0YWRhdGEoZ3JvdXBzOiBJU2VhcmNoUmVzdWx0R3JvdXBbXSk6IElTdHJpbmdEaWN0aW9uYXJ5PElGaWx0ZXJNZXRhZGF0YT4gfCBudWxsIHtcblx0XHRjb25zdCBtZXRhZGF0YSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0bGV0IGhhc01ldGFkYXRhID0gZmFsc2U7XG5cdFx0Z3JvdXBzLmZvckVhY2goZyA9PiB7XG5cdFx0XHRpZiAoZy5yZXN1bHQubWV0YWRhdGEpIHtcblx0XHRcdFx0bWV0YWRhdGFbZy5pZF0gPSBnLnJlc3VsdC5tZXRhZGF0YTtcblx0XHRcdFx0aGFzTWV0YWRhdGEgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGhhc01ldGFkYXRhID8gbWV0YWRhdGEgOiBudWxsO1xuXHR9XG5cblxuXHRwcm90ZWN0ZWQgZ2V0IGZpbHRlckdyb3VwcygpOiBJU2V0dGluZ3NHcm91cFtdIHtcblx0XHRyZXR1cm4gdGhpcy5zZXR0aW5nc0dyb3Vwcztcblx0fVxuXG5cdGFic3RyYWN0IHNldHRpbmdzR3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdO1xuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCB1cGRhdGUoKTogSUZpbHRlclJlc3VsdCB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIFNldHRpbmdzRWRpdG9yTW9kZWwgZXh0ZW5kcyBBYnN0cmFjdFNldHRpbmdzTW9kZWwgaW1wbGVtZW50cyBJU2V0dGluZ3NFZGl0b3JNb2RlbCB7XG5cblx0cHJpdmF0ZSBfc2V0dGluZ3NHcm91cHM6IElTZXR0aW5nc0dyb3VwW10gfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBzZXR0aW5nc01vZGVsOiBJVGV4dE1vZGVsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlR3JvdXBzOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlR3JvdXBzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlR3JvdXBzLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKHJlZmVyZW5jZTogSVJlZmVyZW5jZTxJVGV4dEVkaXRvck1vZGVsPiwgcHJpdmF0ZSBfY29uZmlndXJhdGlvblRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5zZXR0aW5nc01vZGVsID0gcmVmZXJlbmNlLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwhO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25XaWxsRGlzcG9zZSgoKSA9PiByZWZlcmVuY2UuZGlzcG9zZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXR0aW5nc01vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9zZXR0aW5nc0dyb3VwcyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlR3JvdXBzLmZpcmUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRnZXQgdXJpKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuc2V0dGluZ3NNb2RlbC51cmk7XG5cdH1cblxuXHRnZXQgY29uZmlndXJhdGlvblRhcmdldCgpOiBDb25maWd1cmF0aW9uVGFyZ2V0IHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblRhcmdldDtcblx0fVxuXG5cdGdldCBzZXR0aW5nc0dyb3VwcygpOiBJU2V0dGluZ3NHcm91cFtdIHtcblx0XHRpZiAoIXRoaXMuX3NldHRpbmdzR3JvdXBzKSB7XG5cdFx0XHR0aGlzLnBhcnNlKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zZXR0aW5nc0dyb3VwcyE7XG5cdH1cblxuXHRnZXQgY29udGVudCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnNldHRpbmdzTW9kZWwuZ2V0VmFsdWUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBpc1NldHRpbmdzUHJvcGVydHkocHJvcGVydHk6IHN0cmluZywgcHJldmlvdXNQYXJlbnRzOiBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBwcmV2aW91c1BhcmVudHMubGVuZ3RoID09PSAwOyAvLyBTZXR0aW5ncyBpcyByb290XG5cdH1cblxuXHRwcm90ZWN0ZWQgcGFyc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0dGluZ3NHcm91cHMgPSBwYXJzZSh0aGlzLnNldHRpbmdzTW9kZWwsIChwcm9wZXJ0eTogc3RyaW5nLCBwcmV2aW91c1BhcmVudHM6IHN0cmluZ1tdKTogYm9vbGVhbiA9PiB0aGlzLmlzU2V0dGluZ3NQcm9wZXJ0eShwcm9wZXJ0eSwgcHJldmlvdXNQYXJlbnRzKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlKCk6IElGaWx0ZXJSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlc3VsdEdyb3VwcyA9IFsuLi50aGlzLl9jdXJyZW50UmVzdWx0R3JvdXBzLnZhbHVlcygpXTtcblx0XHRpZiAoIXJlc3VsdEdyb3Vwcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gVHJhbnNmb3JtIHJlc3VsdEdyb3VwcyBpbnRvIElGaWx0ZXJSZXN1bHQgLSBJU2V0dGluZyByYW5nZXMgYXJlIGFscmVhZHkgY29ycmVjdCBoZXJlXG5cdFx0Y29uc3QgZmlsdGVyZWRTZXR0aW5nczogSVNldHRpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IG1hdGNoZXM6IElSYW5nZVtdID0gW107XG5cdFx0cmVzdWx0R3JvdXBzLmZvckVhY2goZ3JvdXAgPT4ge1xuXHRcdFx0Z3JvdXAucmVzdWx0LmZpbHRlck1hdGNoZXMuZm9yRWFjaChmaWx0ZXJNYXRjaCA9PiB7XG5cdFx0XHRcdGZpbHRlcmVkU2V0dGluZ3MucHVzaChmaWx0ZXJNYXRjaC5zZXR0aW5nKTtcblx0XHRcdFx0aWYgKGZpbHRlck1hdGNoLm1hdGNoZXMpIHtcblx0XHRcdFx0XHRtYXRjaGVzLnB1c2goLi4uZmlsdGVyTWF0Y2gubWF0Y2hlcyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGZpbHRlcmVkR3JvdXA6IElTZXR0aW5nc0dyb3VwIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG1vZGVsR3JvdXAgPSB0aGlzLnNldHRpbmdzR3JvdXBzWzBdOyAvLyBFZGl0YWJsZSBtb2RlbCBoYXMgb25lIG9yIHplcm8gZ3JvdXBzXG5cdFx0aWYgKG1vZGVsR3JvdXApIHtcblx0XHRcdGZpbHRlcmVkR3JvdXAgPSB7XG5cdFx0XHRcdGlkOiBtb2RlbEdyb3VwLmlkLFxuXHRcdFx0XHRyYW5nZTogbW9kZWxHcm91cC5yYW5nZSxcblx0XHRcdFx0c2VjdGlvbnM6IFt7XG5cdFx0XHRcdFx0c2V0dGluZ3M6IGZpbHRlcmVkU2V0dGluZ3Ncblx0XHRcdFx0fV0sXG5cdFx0XHRcdHRpdGxlOiBtb2RlbEdyb3VwLnRpdGxlLFxuXHRcdFx0XHR0aXRsZVJhbmdlOiBtb2RlbEdyb3VwLnRpdGxlUmFuZ2UsXG5cdFx0XHRcdG9yZGVyOiBtb2RlbEdyb3VwLm9yZGVyLFxuXHRcdFx0XHRleHRlbnNpb25JbmZvOiBtb2RlbEdyb3VwLmV4dGVuc2lvbkluZm9cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLmNvbGxlY3RNZXRhZGF0YShyZXN1bHRHcm91cHMpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRhbGxHcm91cHM6IHRoaXMuc2V0dGluZ3NHcm91cHMsXG5cdFx0XHRmaWx0ZXJlZEdyb3VwczogZmlsdGVyZWRHcm91cCA/IFtmaWx0ZXJlZEdyb3VwXSA6IFtdLFxuXHRcdFx0bWF0Y2hlcyxcblx0XHRcdG1ldGFkYXRhOiBtZXRhZGF0YSA/PyB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nczJFZGl0b3JNb2RlbCBleHRlbmRzIEFic3RyYWN0U2V0dGluZ3NNb2RlbCBpbXBsZW1lbnRzIElTZXR0aW5nc0VkaXRvck1vZGVsIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VHcm91cHM6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VHcm91cHM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VHcm91cHMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBhZGRpdGlvbmFsR3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdID0gW107XG5cdHByaXZhdGUgZGlydHkgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9kZWZhdWx0U2V0dGluZ3M6IERlZmF1bHRTZXR0aW5ncyxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5zb3VyY2UgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVCkge1xuXHRcdFx0XHR0aGlzLmRpcnR5ID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VHcm91cHMuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLm9uRGlkU2NoZW1hQ2hhbmdlKGUgPT4ge1xuXHRcdFx0dGhpcy5kaXJ0eSA9IHRydWU7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUdyb3Vwcy5maXJlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqIERvZXNuJ3QgaW5jbHVkZSB0aGUgXCJDb21tb25seSBVc2VkXCIgZ3JvdXAgKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldCBmaWx0ZXJHcm91cHMoKTogSVNldHRpbmdzR3JvdXBbXSB7XG5cdFx0cmV0dXJuIHRoaXMuc2V0dGluZ3NHcm91cHMuc2xpY2UoMSk7XG5cdH1cblxuXHRnZXQgc2V0dGluZ3NHcm91cHMoKTogSVNldHRpbmdzR3JvdXBbXSB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gdGhpcy5fZGVmYXVsdFNldHRpbmdzLmdldFNldHRpbmdzR3JvdXBzKHRoaXMuZGlydHkpO1xuXHRcdHRoaXMuZGlydHkgPSBmYWxzZTtcblx0XHRyZXR1cm4gWy4uLmdyb3VwcywgLi4udGhpcy5hZGRpdGlvbmFsR3JvdXBzXTtcblx0fVxuXG5cdC8qKiBGb3IgcHJvZ3JhbW1hdGljYWxseSBhZGRlZCBncm91cHMgb3V0c2lkZSBvZiByZWdpc3RlcmVkIGNvbmZpZ3VyYXRpb25zICovXG5cdHNldEFkZGl0aW9uYWxHcm91cHMoZ3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdKSB7XG5cdFx0dGhpcy5hZGRpdGlvbmFsR3JvdXBzID0gZ3JvdXBzO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZSgpOiBJRmlsdGVyUmVzdWx0IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTtcblx0fVxufVxuXG5mdW5jdGlvbiBwYXJzZShtb2RlbDogSVRleHRNb2RlbCwgaXNTZXR0aW5nc1Byb3BlcnR5OiAoY3VycmVudFByb3BlcnR5OiBzdHJpbmcsIHByZXZpb3VzUGFyZW50czogc3RyaW5nW10pID0+IGJvb2xlYW4pOiBJU2V0dGluZ3NHcm91cFtdIHtcblx0Y29uc3Qgc2V0dGluZ3M6IElTZXR0aW5nW10gPSBbXTtcblx0bGV0IG92ZXJyaWRlU2V0dGluZzogSVNldHRpbmcgfCBudWxsID0gbnVsbDtcblxuXHRsZXQgY3VycmVudFByb3BlcnR5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0bGV0IGN1cnJlbnRQYXJlbnQ6IGFueSA9IFtdO1xuXHRjb25zdCBwcmV2aW91c1BhcmVudHM6IGFueVtdID0gW107XG5cdGxldCBzZXR0aW5nc1Byb3BlcnR5SW5kZXg6IG51bWJlciA9IC0xO1xuXHRjb25zdCByYW5nZSA9IHtcblx0XHRzdGFydExpbmVOdW1iZXI6IDAsXG5cdFx0c3RhcnRDb2x1bW46IDAsXG5cdFx0ZW5kTGluZU51bWJlcjogMCxcblx0XHRlbmRDb2x1bW46IDBcblx0fTtcblxuXHRmdW5jdGlvbiBvblZhbHVlKHZhbHVlOiBhbnksIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGN1cnJlbnRQYXJlbnQpKSB7XG5cdFx0XHQoPGFueVtdPmN1cnJlbnRQYXJlbnQpLnB1c2godmFsdWUpO1xuXHRcdH0gZWxzZSBpZiAoY3VycmVudFByb3BlcnR5KSB7XG5cdFx0XHRjdXJyZW50UGFyZW50W2N1cnJlbnRQcm9wZXJ0eV0gPSB2YWx1ZTtcblx0XHR9XG5cdFx0aWYgKHByZXZpb3VzUGFyZW50cy5sZW5ndGggPT09IHNldHRpbmdzUHJvcGVydHlJbmRleCArIDEgfHwgKHByZXZpb3VzUGFyZW50cy5sZW5ndGggPT09IHNldHRpbmdzUHJvcGVydHlJbmRleCArIDIgJiYgb3ZlcnJpZGVTZXR0aW5nICE9PSBudWxsKSkge1xuXHRcdFx0Ly8gc2V0dGluZ3MgdmFsdWUgc3RhcnRlZFxuXHRcdFx0Y29uc3Qgc2V0dGluZyA9IHByZXZpb3VzUGFyZW50cy5sZW5ndGggPT09IHNldHRpbmdzUHJvcGVydHlJbmRleCArIDEgPyBzZXR0aW5nc1tzZXR0aW5ncy5sZW5ndGggLSAxXSA6IG92ZXJyaWRlU2V0dGluZyEub3ZlcnJpZGVzIVtvdmVycmlkZVNldHRpbmchLm92ZXJyaWRlcyEubGVuZ3RoIC0gMV07XG5cdFx0XHRpZiAoc2V0dGluZykge1xuXHRcdFx0XHRjb25zdCB2YWx1ZVN0YXJ0UG9zaXRpb24gPSBtb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCk7XG5cdFx0XHRcdGNvbnN0IHZhbHVlRW5kUG9zaXRpb24gPSBtb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCArIGxlbmd0aCk7XG5cdFx0XHRcdHNldHRpbmcudmFsdWUgPSB2YWx1ZTtcblx0XHRcdFx0c2V0dGluZy52YWx1ZVJhbmdlID0ge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogdmFsdWVTdGFydFBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IHZhbHVlU3RhcnRQb3NpdGlvbi5jb2x1bW4sXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdmFsdWVFbmRQb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogdmFsdWVFbmRQb3NpdGlvbi5jb2x1bW5cblx0XHRcdFx0fTtcblx0XHRcdFx0c2V0dGluZy5yYW5nZSA9IE9iamVjdC5hc3NpZ24oc2V0dGluZy5yYW5nZSwge1xuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHZhbHVlRW5kUG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdFx0XHRlbmRDb2x1bW46IHZhbHVlRW5kUG9zaXRpb24uY29sdW1uXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRjb25zdCB2aXNpdG9yOiBKU09OVmlzaXRvciA9IHtcblx0XHRvbk9iamVjdEJlZ2luOiAob2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRpZiAoaXNTZXR0aW5nc1Byb3BlcnR5KGN1cnJlbnRQcm9wZXJ0eSEsIHByZXZpb3VzUGFyZW50cykpIHtcblx0XHRcdFx0Ly8gU2V0dGluZ3Mgc3RhcnRlZFxuXHRcdFx0XHRzZXR0aW5nc1Byb3BlcnR5SW5kZXggPSBwcmV2aW91c1BhcmVudHMubGVuZ3RoO1xuXHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IG1vZGVsLmdldFBvc2l0aW9uQXQob2Zmc2V0KTtcblx0XHRcdFx0cmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdFx0cmFuZ2Uuc3RhcnRDb2x1bW4gPSBwb3NpdGlvbi5jb2x1bW47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBvYmplY3QgPSB7fTtcblx0XHRcdG9uVmFsdWUob2JqZWN0LCBvZmZzZXQsIGxlbmd0aCk7XG5cdFx0XHRjdXJyZW50UGFyZW50ID0gb2JqZWN0O1xuXHRcdFx0Y3VycmVudFByb3BlcnR5ID0gbnVsbDtcblx0XHRcdHByZXZpb3VzUGFyZW50cy5wdXNoKGN1cnJlbnRQYXJlbnQpO1xuXHRcdH0sXG5cdFx0b25PYmplY3RQcm9wZXJ0eTogKG5hbWU6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRjdXJyZW50UHJvcGVydHkgPSBuYW1lO1xuXHRcdFx0aWYgKHByZXZpb3VzUGFyZW50cy5sZW5ndGggPT09IHNldHRpbmdzUHJvcGVydHlJbmRleCArIDEgfHwgKHByZXZpb3VzUGFyZW50cy5sZW5ndGggPT09IHNldHRpbmdzUHJvcGVydHlJbmRleCArIDIgJiYgb3ZlcnJpZGVTZXR0aW5nICE9PSBudWxsKSkge1xuXHRcdFx0XHQvLyBzZXR0aW5nIHN0YXJ0ZWRcblx0XHRcdFx0Y29uc3Qgc2V0dGluZ1N0YXJ0UG9zaXRpb24gPSBtb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCk7XG5cdFx0XHRcdGNvbnN0IHNldHRpbmc6IElTZXR0aW5nID0ge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBbXSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbklzTWFya2Rvd246IGZhbHNlLFxuXHRcdFx0XHRcdGtleTogbmFtZSxcblx0XHRcdFx0XHRrZXlSYW5nZToge1xuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzZXR0aW5nU3RhcnRQb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IHNldHRpbmdTdGFydFBvc2l0aW9uLmNvbHVtbiArIDEsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBzZXR0aW5nU3RhcnRQb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiBzZXR0aW5nU3RhcnRQb3NpdGlvbi5jb2x1bW4gKyBsZW5ndGhcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHNldHRpbmdTdGFydFBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogc2V0dGluZ1N0YXJ0UG9zaXRpb24uY29sdW1uLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogMFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dmFsdWU6IG51bGwsXG5cdFx0XHRcdFx0dmFsdWVSYW5nZTogbnVsbFJhbmdlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uUmFuZ2VzOiBbXSxcblx0XHRcdFx0XHRvdmVycmlkZXM6IFtdLFxuXHRcdFx0XHRcdG92ZXJyaWRlT2Y6IG92ZXJyaWRlU2V0dGluZyA/PyB1bmRlZmluZWQsXG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmIChwcmV2aW91c1BhcmVudHMubGVuZ3RoID09PSBzZXR0aW5nc1Byb3BlcnR5SW5kZXggKyAxKSB7XG5cdFx0XHRcdFx0c2V0dGluZ3MucHVzaChzZXR0aW5nKTtcblx0XHRcdFx0XHRpZiAoT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChuYW1lKSkge1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGVTZXR0aW5nID0gc2V0dGluZztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGVTZXR0aW5nIS5vdmVycmlkZXMhLnB1c2goc2V0dGluZyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdG9uT2JqZWN0RW5kOiAob2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRjdXJyZW50UGFyZW50ID0gcHJldmlvdXNQYXJlbnRzLnBvcCgpO1xuXHRcdFx0aWYgKHNldHRpbmdzUHJvcGVydHlJbmRleCAhPT0gLTEgJiYgKHByZXZpb3VzUGFyZW50cy5sZW5ndGggPT09IHNldHRpbmdzUHJvcGVydHlJbmRleCArIDEgfHwgKHByZXZpb3VzUGFyZW50cy5sZW5ndGggPT09IHNldHRpbmdzUHJvcGVydHlJbmRleCArIDIgJiYgb3ZlcnJpZGVTZXR0aW5nICE9PSBudWxsKSkpIHtcblx0XHRcdFx0Ly8gc2V0dGluZyBlbmRlZFxuXHRcdFx0XHRjb25zdCBzZXR0aW5nID0gcHJldmlvdXNQYXJlbnRzLmxlbmd0aCA9PT0gc2V0dGluZ3NQcm9wZXJ0eUluZGV4ICsgMSA/IHNldHRpbmdzW3NldHRpbmdzLmxlbmd0aCAtIDFdIDogb3ZlcnJpZGVTZXR0aW5nIS5vdmVycmlkZXMhW292ZXJyaWRlU2V0dGluZyEub3ZlcnJpZGVzIS5sZW5ndGggLSAxXTtcblx0XHRcdFx0aWYgKHNldHRpbmcpIHtcblx0XHRcdFx0XHRjb25zdCB2YWx1ZUVuZFBvc2l0aW9uID0gbW9kZWwuZ2V0UG9zaXRpb25BdChvZmZzZXQgKyBsZW5ndGgpO1xuXHRcdFx0XHRcdHNldHRpbmcudmFsdWVSYW5nZSA9IE9iamVjdC5hc3NpZ24oc2V0dGluZy52YWx1ZVJhbmdlLCB7XG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB2YWx1ZUVuZFBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHZhbHVlRW5kUG9zaXRpb24uY29sdW1uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0c2V0dGluZy5yYW5nZSA9IE9iamVjdC5hc3NpZ24oc2V0dGluZy5yYW5nZSwge1xuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdmFsdWVFbmRQb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB2YWx1ZUVuZFBvc2l0aW9uLmNvbHVtblxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHByZXZpb3VzUGFyZW50cy5sZW5ndGggPT09IHNldHRpbmdzUHJvcGVydHlJbmRleCArIDEpIHtcblx0XHRcdFx0XHRvdmVycmlkZVNldHRpbmcgPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJldmlvdXNQYXJlbnRzLmxlbmd0aCA9PT0gc2V0dGluZ3NQcm9wZXJ0eUluZGV4KSB7XG5cdFx0XHRcdC8vIHNldHRpbmdzIGVuZGVkXG5cdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gbW9kZWwuZ2V0UG9zaXRpb25BdChvZmZzZXQpO1xuXHRcdFx0XHRyYW5nZS5lbmRMaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdFx0cmFuZ2UuZW5kQ29sdW1uID0gcG9zaXRpb24uY29sdW1uO1xuXHRcdFx0XHRzZXR0aW5nc1Byb3BlcnR5SW5kZXggPSAtMTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdG9uQXJyYXlCZWdpbjogKG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0Y29uc3QgYXJyYXk6IGFueVtdID0gW107XG5cdFx0XHRvblZhbHVlKGFycmF5LCBvZmZzZXQsIGxlbmd0aCk7XG5cdFx0XHRwcmV2aW91c1BhcmVudHMucHVzaChjdXJyZW50UGFyZW50KTtcblx0XHRcdGN1cnJlbnRQYXJlbnQgPSBhcnJheTtcblx0XHRcdGN1cnJlbnRQcm9wZXJ0eSA9IG51bGw7XG5cdFx0fSxcblx0XHRvbkFycmF5RW5kOiAob2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRjdXJyZW50UGFyZW50ID0gcHJldmlvdXNQYXJlbnRzLnBvcCgpO1xuXHRcdFx0aWYgKHByZXZpb3VzUGFyZW50cy5sZW5ndGggPT09IHNldHRpbmdzUHJvcGVydHlJbmRleCArIDEgfHwgKHByZXZpb3VzUGFyZW50cy5sZW5ndGggPT09IHNldHRpbmdzUHJvcGVydHlJbmRleCArIDIgJiYgb3ZlcnJpZGVTZXR0aW5nICE9PSBudWxsKSkge1xuXHRcdFx0XHQvLyBzZXR0aW5nIHZhbHVlIGVuZGVkXG5cdFx0XHRcdGNvbnN0IHNldHRpbmcgPSBwcmV2aW91c1BhcmVudHMubGVuZ3RoID09PSBzZXR0aW5nc1Byb3BlcnR5SW5kZXggKyAxID8gc2V0dGluZ3Nbc2V0dGluZ3MubGVuZ3RoIC0gMV0gOiBvdmVycmlkZVNldHRpbmchLm92ZXJyaWRlcyFbb3ZlcnJpZGVTZXR0aW5nIS5vdmVycmlkZXMhLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRpZiAoc2V0dGluZykge1xuXHRcdFx0XHRcdGNvbnN0IHZhbHVlRW5kUG9zaXRpb24gPSBtb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCArIGxlbmd0aCk7XG5cdFx0XHRcdFx0c2V0dGluZy52YWx1ZVJhbmdlID0gT2JqZWN0LmFzc2lnbihzZXR0aW5nLnZhbHVlUmFuZ2UsIHtcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHZhbHVlRW5kUG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdmFsdWVFbmRQb3NpdGlvbi5jb2x1bW5cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRzZXR0aW5nLnJhbmdlID0gT2JqZWN0LmFzc2lnbihzZXR0aW5nLnJhbmdlLCB7XG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB2YWx1ZUVuZFBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHZhbHVlRW5kUG9zaXRpb24uY29sdW1uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdG9uTGl0ZXJhbFZhbHVlOiBvblZhbHVlLFxuXHRcdG9uRXJyb3I6IChlcnJvcikgPT4ge1xuXHRcdFx0Y29uc3Qgc2V0dGluZyA9IHNldHRpbmdzW3NldHRpbmdzLmxlbmd0aCAtIDFdO1xuXHRcdFx0aWYgKHNldHRpbmcgJiYgKGlzTnVsbFJhbmdlKHNldHRpbmcucmFuZ2UpIHx8IGlzTnVsbFJhbmdlKHNldHRpbmcua2V5UmFuZ2UpIHx8IGlzTnVsbFJhbmdlKHNldHRpbmcudmFsdWVSYW5nZSkpKSB7XG5cdFx0XHRcdHNldHRpbmdzLnBvcCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblx0aWYgKCFtb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHR2aXNpdChtb2RlbC5nZXRWYWx1ZSgpLCB2aXNpdG9yKTtcblx0fVxuXHRyZXR1cm4gc2V0dGluZ3MubGVuZ3RoID4gMCA/IFt7XG5cdFx0aWQ6IG1vZGVsLmlzRGlzcG9zZWQoKSA/ICcnIDogbW9kZWwuaWQsXG5cdFx0c2VjdGlvbnM6IFtcblx0XHRcdHtcblx0XHRcdFx0c2V0dGluZ3Ncblx0XHRcdH1cblx0XHRdLFxuXHRcdHRpdGxlOiAnJyxcblx0XHR0aXRsZVJhbmdlOiBudWxsUmFuZ2UsXG5cdFx0cmFuZ2Vcblx0fSBzYXRpc2ZpZXMgSVNldHRpbmdzR3JvdXBdIDogW107XG59XG5cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VDb25maWd1cmF0aW9uRWRpdG9yTW9kZWwgZXh0ZW5kcyBTZXR0aW5nc0VkaXRvck1vZGVsIHtcblxuXHRwcml2YXRlIF9jb25maWd1cmF0aW9uR3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdID0gW107XG5cblx0Z2V0IGNvbmZpZ3VyYXRpb25Hcm91cHMoKTogSVNldHRpbmdzR3JvdXBbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25Hcm91cHM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcGFyc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIucGFyc2UoKTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uR3JvdXBzID0gcGFyc2UodGhpcy5zZXR0aW5nc01vZGVsLCAocHJvcGVydHk6IHN0cmluZywgcHJldmlvdXNQYXJlbnRzOiBzdHJpbmdbXSk6IGJvb2xlYW4gPT4gcHJldmlvdXNQYXJlbnRzLmxlbmd0aCA9PT0gMCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgaXNTZXR0aW5nc1Byb3BlcnR5KHByb3BlcnR5OiBzdHJpbmcsIHByZXZpb3VzUGFyZW50czogc3RyaW5nW10pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gcHJvcGVydHkgPT09ICdzZXR0aW5ncycgJiYgcHJldmlvdXNQYXJlbnRzLmxlbmd0aCA9PT0gMTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBEZWZhdWx0U2V0dGluZ3MgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9hbGxTZXR0aW5nc0dyb3VwczogSVNldHRpbmdzR3JvdXBbXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29udGVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb250ZW50V2l0aG91dE1vc3RDb21tb25seVVzZWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2V0dGluZ3NCeU5hbWUgPSBuZXcgTWFwPHN0cmluZywgSVNldHRpbmc+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2U6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfbW9zdENvbW1vbmx5VXNlZFNldHRpbmdzS2V5czogc3RyaW5nW10sXG5cdFx0cmVhZG9ubHkgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LFxuXHRcdHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5zb3VyY2UgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVCkge1xuXHRcdFx0XHR0aGlzLnJlc2V0KCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRnZXRDb250ZW50KGZvcmNlVXBkYXRlID0gZmFsc2UpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fY29udGVudCB8fCBmb3JjZVVwZGF0ZSkge1xuXHRcdFx0dGhpcy5pbml0aWFsaXplKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRlbnQhO1xuXHR9XG5cblx0Z2V0Q29udGVudFdpdGhvdXRNb3N0Q29tbW9ubHlVc2VkKGZvcmNlVXBkYXRlID0gZmFsc2UpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fY29udGVudFdpdGhvdXRNb3N0Q29tbW9ubHlVc2VkIHx8IGZvcmNlVXBkYXRlKSB7XG5cdFx0XHR0aGlzLmluaXRpYWxpemUoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fY29udGVudFdpdGhvdXRNb3N0Q29tbW9ubHlVc2VkITtcblx0fVxuXG5cdGdldFNldHRpbmdzR3JvdXBzKGZvcmNlVXBkYXRlID0gZmFsc2UpOiBJU2V0dGluZ3NHcm91cFtdIHtcblx0XHRpZiAoIXRoaXMuX2FsbFNldHRpbmdzR3JvdXBzIHx8IGZvcmNlVXBkYXRlKSB7XG5cdFx0XHR0aGlzLmluaXRpYWxpemUoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fYWxsU2V0dGluZ3NHcm91cHMhO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FsbFNldHRpbmdzR3JvdXBzID0gdGhpcy5wYXJzZSgpO1xuXHRcdHRoaXMuX2NvbnRlbnQgPSB0aGlzLnRvQ29udGVudCh0aGlzLl9hbGxTZXR0aW5nc0dyb3VwcywgMCk7XG5cdFx0dGhpcy5fY29udGVudFdpdGhvdXRNb3N0Q29tbW9ubHlVc2VkID0gdGhpcy50b0NvbnRlbnQodGhpcy5fYWxsU2V0dGluZ3NHcm91cHMsIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNldCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250ZW50ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2NvbnRlbnRXaXRob3V0TW9zdENvbW1vbmx5VXNlZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9hbGxTZXR0aW5nc0dyb3VwcyA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgcGFyc2UoKTogSVNldHRpbmdzR3JvdXBbXSB7XG5cdFx0Y29uc3Qgc2V0dGluZ3NHcm91cHMgPSB0aGlzLmdldFJlZ2lzdGVyZWRHcm91cHMoKTtcblx0XHR0aGlzLmluaXRBbGxTZXR0aW5nc01hcChzZXR0aW5nc0dyb3Vwcyk7XG5cdFx0Y29uc3QgbW9zdENvbW1vbmx5VXNlZCA9IHRoaXMuZ2V0TW9zdENvbW1vbmx5VXNlZFNldHRpbmdzKCk7XG5cdFx0cmV0dXJuIFttb3N0Q29tbW9ubHlVc2VkLCAuLi5zZXR0aW5nc0dyb3Vwc107XG5cdH1cblxuXHRnZXRSZWdpc3RlcmVkR3JvdXBzKCk6IElTZXR0aW5nc0dyb3VwW10ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0XHRjb25zdCBhbGxDb25maWd1cmF0aW9uczogSVN0cmluZ0RpY3Rpb25hcnk8SVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+ID0geyAuLi5yZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpIH07XG5cdFx0Y29uc3QgZXhjbHVkZWRDb25maWd1cmF0aW9ucyA9IHJlZ2lzdHJ5LmdldEV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblxuXHRcdGZvciAoY29uc3QgcG9saWN5S2V5IG9mIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uua2V5cygpLnBvbGljeSA/PyBbXSkge1xuXHRcdFx0Y29uc3QgcG9saWN5Q29uZmlndXJhdGlvbiA9IGV4Y2x1ZGVkQ29uZmlndXJhdGlvbnNbcG9saWN5S2V5XTtcblx0XHRcdGlmIChwb2xpY3lDb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdGFsbENvbmZpZ3VyYXRpb25zW3BvbGljeUtleV0gPSBwb2xpY3lDb25maWd1cmF0aW9uO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGdyb3VwcyA9IHRoaXMucmVtb3ZlRW1wdHlTZXR0aW5nc0dyb3Vwcyh0aGlzLnBhcnNlUHJvcGVydGllcyhhbGxDb25maWd1cmF0aW9ucykuc29ydCh0aGlzLmNvbXBhcmVHcm91cHMpKTtcblx0XHRyZXR1cm4gdGhpcy5zb3J0R3JvdXBzKGdyb3Vwcyk7XG5cdH1cblxuXHRwcml2YXRlIHNvcnRHcm91cHMoZ3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdKTogSVNldHRpbmdzR3JvdXBbXSB7XG5cdFx0Z3JvdXBzLmZvckVhY2goZ3JvdXAgPT4ge1xuXHRcdFx0Z3JvdXAuc2VjdGlvbnMuZm9yRWFjaChzZWN0aW9uID0+IHtcblx0XHRcdFx0c2VjdGlvbi5zZXR0aW5ncy5zb3J0KChhLCBiKSA9PiBhLmtleS5sb2NhbGVDb21wYXJlKGIua2V5KSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBncm91cHM7XG5cdH1cblxuXHRwcml2YXRlIGluaXRBbGxTZXR0aW5nc01hcChhbGxTZXR0aW5nc0dyb3VwczogSVNldHRpbmdzR3JvdXBbXSk6IHZvaWQge1xuXHRcdHRoaXMuX3NldHRpbmdzQnlOYW1lID0gbmV3IE1hcDxzdHJpbmcsIElTZXR0aW5nPigpO1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgYWxsU2V0dGluZ3NHcm91cHMpIHtcblx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiBncm91cC5zZWN0aW9ucykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2VjdGlvbi5zZXR0aW5ncykge1xuXHRcdFx0XHRcdHRoaXMuX3NldHRpbmdzQnlOYW1lLnNldChzZXR0aW5nLmtleSwgc2V0dGluZyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldE1vc3RDb21tb25seVVzZWRTZXR0aW5ncygpOiBJU2V0dGluZ3NHcm91cCB7XG5cdFx0Y29uc3Qgc2V0dGluZ3MgPSBjb2FsZXNjZSh0aGlzLl9tb3N0Q29tbW9ubHlVc2VkU2V0dGluZ3NLZXlzLm1hcChrZXkgPT4ge1xuXHRcdFx0Y29uc3Qgc2V0dGluZyA9IHRoaXMuX3NldHRpbmdzQnlOYW1lLmdldChrZXkpO1xuXHRcdFx0aWYgKHNldHRpbmcpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogc2V0dGluZy5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRrZXk6IHNldHRpbmcua2V5LFxuXHRcdFx0XHRcdHZhbHVlOiBzZXR0aW5nLnZhbHVlLFxuXHRcdFx0XHRcdGtleVJhbmdlOiBudWxsUmFuZ2UsXG5cdFx0XHRcdFx0cmFuZ2U6IG51bGxSYW5nZSxcblx0XHRcdFx0XHR2YWx1ZVJhbmdlOiBudWxsUmFuZ2UsXG5cdFx0XHRcdFx0b3ZlcnJpZGVzOiBbXSxcblx0XHRcdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFLFxuXHRcdFx0XHRcdHR5cGU6IHNldHRpbmcudHlwZSxcblx0XHRcdFx0XHRlbnVtOiBzZXR0aW5nLmVudW0sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogc2V0dGluZy5lbnVtRGVzY3JpcHRpb25zLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uUmFuZ2VzOiBbXVxuXHRcdFx0XHR9IHNhdGlzZmllcyBJU2V0dGluZztcblx0XHRcdH1cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogJ21vc3RDb21tb25seVVzZWQnLFxuXHRcdFx0cmFuZ2U6IG51bGxSYW5nZSxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NvbW1vbmx5VXNlZCcsIFwiQ29tbW9ubHkgVXNlZFwiKSxcblx0XHRcdHRpdGxlUmFuZ2U6IG51bGxSYW5nZSxcblx0XHRcdHNlY3Rpb25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzZXR0aW5nc1xuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSBzYXRpc2ZpZXMgSVNldHRpbmdzR3JvdXA7XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlUHJvcGVydGllcyhwcm9wZXJ0aWVzOiBJU3RyaW5nRGljdGlvbmFyeTxJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4pOiBJU2V0dGluZ3NHcm91cFtdIHtcblx0XHRjb25zdCByZXN1bHQ6IElTZXR0aW5nc0dyb3VwW10gPSBbXTtcblx0XHRjb25zdCBieVRpdGxlID0gbmV3IE1hcDxzdHJpbmcsIElTZXR0aW5nc0dyb3VwW10+KCk7XG5cdFx0Y29uc3QgYnlJZCA9IG5ldyBNYXA8c3RyaW5nLCBJU2V0dGluZ3NHcm91cFtdPigpO1xuXHRcdGZvciAoY29uc3QgW2tleSwgcHJvcGVydHldIG9mIE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpKSB7XG5cdFx0XHRpZiAoIXByb3BlcnR5LnNlY3Rpb24pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBzZXR0aW5nc0dyb3VwOiBJU2V0dGluZ3NHcm91cCB8IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKHByb3BlcnR5LnNlY3Rpb24udGl0bGUpIHtcblx0XHRcdFx0Y29uc3QgZ3JvdXBzID0gYnlUaXRsZS5nZXQocHJvcGVydHkuc2VjdGlvbi50aXRsZSk7XG5cdFx0XHRcdGlmIChncm91cHMpIHtcblx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IHByb3BlcnR5LnNlY3Rpb24uZXh0ZW5zaW9uSW5mbz8uaWQ7XG5cdFx0XHRcdFx0c2V0dGluZ3NHcm91cCA9IGdyb3Vwcy5maW5kKGcgPT4gZy5leHRlbnNpb25JbmZvPy5pZCA9PT0gZXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghc2V0dGluZ3NHcm91cCAmJiBwcm9wZXJ0eS5zZWN0aW9uLmlkKSB7XG5cdFx0XHRcdGNvbnN0IGdyb3VwcyA9IGJ5SWQuZ2V0KHByb3BlcnR5LnNlY3Rpb24uaWQpO1xuXHRcdFx0XHRpZiAoZ3JvdXBzKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBwcm9wZXJ0eS5zZWN0aW9uLmV4dGVuc2lvbkluZm8/LmlkO1xuXHRcdFx0XHRcdHNldHRpbmdzR3JvdXAgPSBncm91cHMuZmluZChnID0+IGcuZXh0ZW5zaW9uSW5mbz8uaWQgPT09IGV4dGVuc2lvbklkICYmICFnLnRpdGxlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc2V0dGluZ3NHcm91cCAmJiAhc2V0dGluZ3NHcm91cD8udGl0bGUgJiYgcHJvcGVydHkuc2VjdGlvbi50aXRsZSkge1xuXHRcdFx0XHRcdHNldHRpbmdzR3JvdXAudGl0bGUgPSBwcm9wZXJ0eS5zZWN0aW9uLnRpdGxlO1xuXHRcdFx0XHRcdGNvbnN0IGJ5VGl0bGVHcm91cHMgPSBieVRpdGxlLmdldChwcm9wZXJ0eS5zZWN0aW9uLnRpdGxlKTtcblx0XHRcdFx0XHRpZiAoYnlUaXRsZUdyb3Vwcykge1xuXHRcdFx0XHRcdFx0YnlUaXRsZUdyb3Vwcy5wdXNoKHNldHRpbmdzR3JvdXApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRieVRpdGxlLnNldChwcm9wZXJ0eS5zZWN0aW9uLnRpdGxlLCBbc2V0dGluZ3NHcm91cF0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXNldHRpbmdzR3JvdXApIHtcblx0XHRcdFx0c2V0dGluZ3NHcm91cCA9IHsgc2VjdGlvbnM6IFt7IHRpdGxlOiBwcm9wZXJ0eS5zZWN0aW9uLnRpdGxlLCBzZXR0aW5nczogW10gfV0sIGlkOiBwcm9wZXJ0eS5zZWN0aW9uLmlkIHx8ICcnLCB0aXRsZTogcHJvcGVydHkuc2VjdGlvbi50aXRsZSA/PyAnJywgdGl0bGVSYW5nZTogbnVsbFJhbmdlLCBvcmRlcjogcHJvcGVydHkuc2VjdGlvbi5vcmRlciwgcmFuZ2U6IG51bGxSYW5nZSwgZXh0ZW5zaW9uSW5mbzogaXNTdHJpbmcocHJvcGVydHkuc291cmNlKSA/IHVuZGVmaW5lZCA6IHByb3BlcnR5LnNvdXJjZSB9O1xuXHRcdFx0XHRyZXN1bHQucHVzaChzZXR0aW5nc0dyb3VwKTtcblx0XHRcdFx0aWYgKHByb3BlcnR5LnNlY3Rpb24udGl0bGUpIHtcblx0XHRcdFx0XHRjb25zdCBieVRpdGxlR3JvdXBzID0gYnlUaXRsZS5nZXQocHJvcGVydHkuc2VjdGlvbi50aXRsZSk7XG5cdFx0XHRcdFx0aWYgKGJ5VGl0bGVHcm91cHMpIHtcblx0XHRcdFx0XHRcdGJ5VGl0bGVHcm91cHMucHVzaChzZXR0aW5nc0dyb3VwKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YnlUaXRsZS5zZXQocHJvcGVydHkuc2VjdGlvbi50aXRsZSwgW3NldHRpbmdzR3JvdXBdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHByb3BlcnR5LnNlY3Rpb24uaWQpIHtcblx0XHRcdFx0XHRjb25zdCBieUlkR3JvdXBzID0gYnlJZC5nZXQocHJvcGVydHkuc2VjdGlvbi5pZCk7XG5cdFx0XHRcdFx0aWYgKGJ5SWRHcm91cHMpIHtcblx0XHRcdFx0XHRcdGJ5SWRHcm91cHMucHVzaChzZXR0aW5nc0dyb3VwKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YnlJZC5zZXQocHJvcGVydHkuc2VjdGlvbi5pZCwgW3NldHRpbmdzR3JvdXBdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2V0dGluZyA9IHRoaXMucGFyc2VTZXR0aW5nKGtleSwgcHJvcGVydHkpO1xuXHRcdFx0aWYgKHNldHRpbmcpIHtcblx0XHRcdFx0c2V0dGluZ3NHcm91cC5zZWN0aW9uc1swXS5zZXR0aW5ncy5wdXNoKHNldHRpbmcpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVFbXB0eVNldHRpbmdzR3JvdXBzKHNldHRpbmdzR3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdKTogSVNldHRpbmdzR3JvdXBbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJU2V0dGluZ3NHcm91cFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBzZXR0aW5nc0dyb3VwIG9mIHNldHRpbmdzR3JvdXBzKSB7XG5cdFx0XHRzZXR0aW5nc0dyb3VwLnNlY3Rpb25zID0gc2V0dGluZ3NHcm91cC5zZWN0aW9ucy5maWx0ZXIoc2VjdGlvbiA9PiBzZWN0aW9uLnNldHRpbmdzLmxlbmd0aCA+IDApO1xuXHRcdFx0aWYgKHNldHRpbmdzR3JvdXAuc2VjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHNldHRpbmdzR3JvdXApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZVNldHRpbmcoa2V5OiBzdHJpbmcsIHByb3A6IElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hKTogSVNldHRpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5tYXRjaGVzU2NvcGUocHJvcCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFsdWUgPSBwcm9wLmRlZmF1bHQ7XG5cdFx0bGV0IGRlc2NyaXB0aW9uID0gKHByb3AubWFya2Rvd25EZXNjcmlwdGlvbiB8fCBwcm9wLmRlc2NyaXB0aW9uIHx8ICcnKTtcblx0XHRpZiAodHlwZW9mIGRlc2NyaXB0aW9uICE9PSAnc3RyaW5nJykge1xuXHRcdFx0ZGVzY3JpcHRpb24gPSAnJztcblx0XHR9XG5cdFx0Y29uc3QgZGVzY3JpcHRpb25MaW5lcyA9IGRlc2NyaXB0aW9uLnNwbGl0KCdcXG4nKTtcblx0XHRjb25zdCBvdmVycmlkZXMgPSBPVkVSUklERV9QUk9QRVJUWV9SRUdFWC50ZXN0KGtleSkgPyB0aGlzLnBhcnNlT3ZlcnJpZGVTZXR0aW5ncyhwcm9wLmRlZmF1bHQpIDogW107XG5cdFx0bGV0IGxpc3RJdGVtVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChwcm9wLnR5cGUgPT09ICdhcnJheScgJiYgcHJvcC5pdGVtcyAmJiAhQXJyYXkuaXNBcnJheShwcm9wLml0ZW1zKSAmJiBwcm9wLml0ZW1zLnR5cGUpIHtcblx0XHRcdGlmIChwcm9wLml0ZW1zLmVudW0pIHtcblx0XHRcdFx0bGlzdEl0ZW1UeXBlID0gJ2VudW0nO1xuXHRcdFx0fSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShwcm9wLml0ZW1zLnR5cGUpKSB7XG5cdFx0XHRcdGxpc3RJdGVtVHlwZSA9IHByb3AuaXRlbXMudHlwZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBvYmplY3RQcm9wZXJ0aWVzID0gcHJvcC50eXBlID09PSAnb2JqZWN0JyA/IHByb3AucHJvcGVydGllcyA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvYmplY3RQYXR0ZXJuUHJvcGVydGllcyA9IHByb3AudHlwZSA9PT0gJ29iamVjdCcgPyBwcm9wLnBhdHRlcm5Qcm9wZXJ0aWVzIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzID0gcHJvcC50eXBlID09PSAnb2JqZWN0JyA/IHByb3AuYWRkaXRpb25hbFByb3BlcnRpZXMgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcHJvcGVydHlOYW1lcyA9IHByb3AudHlwZSA9PT0gJ29iamVjdCcgPyBwcm9wLnByb3BlcnR5TmFtZXMgOiB1bmRlZmluZWQ7XG5cblx0XHRsZXQgZW51bVRvVXNlID0gcHJvcC5lbnVtO1xuXHRcdGxldCBlbnVtRGVzY3JpcHRpb25zID0gcHJvcC5tYXJrZG93bkVudW1EZXNjcmlwdGlvbnMgPz8gcHJvcC5lbnVtRGVzY3JpcHRpb25zO1xuXHRcdGxldCBlbnVtRGVzY3JpcHRpb25zQXJlTWFya2Rvd24gPSAhIXByb3AubWFya2Rvd25FbnVtRGVzY3JpcHRpb25zO1xuXHRcdGlmIChsaXN0SXRlbVR5cGUgPT09ICdlbnVtJyAmJiAhQXJyYXkuaXNBcnJheShwcm9wLml0ZW1zKSkge1xuXHRcdFx0ZW51bVRvVXNlID0gcHJvcC5pdGVtcyEuZW51bTtcblx0XHRcdGVudW1EZXNjcmlwdGlvbnMgPSBwcm9wLml0ZW1zIS5tYXJrZG93bkVudW1EZXNjcmlwdGlvbnMgPz8gcHJvcC5pdGVtcyEuZW51bURlc2NyaXB0aW9ucztcblx0XHRcdGVudW1EZXNjcmlwdGlvbnNBcmVNYXJrZG93biA9ICEhcHJvcC5pdGVtcyEubWFya2Rvd25FbnVtRGVzY3JpcHRpb25zO1xuXHRcdH1cblxuXHRcdGxldCBhbGxLZXlzQXJlQm9vbGVhbiA9IGZhbHNlO1xuXHRcdGlmIChwcm9wLnR5cGUgPT09ICdvYmplY3QnICYmICFwcm9wLmFkZGl0aW9uYWxQcm9wZXJ0aWVzICYmIHByb3AucHJvcGVydGllcyAmJiBPYmplY3Qua2V5cyhwcm9wLnByb3BlcnRpZXMpLmxlbmd0aCkge1xuXHRcdFx0YWxsS2V5c0FyZUJvb2xlYW4gPSBPYmplY3Qua2V5cyhwcm9wLnByb3BlcnRpZXMpLmV2ZXJ5KGtleSA9PiB7XG5cdFx0XHRcdHJldHVybiBwcm9wLnByb3BlcnRpZXMhW2tleV0udHlwZSA9PT0gJ2Jvb2xlYW4nO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0bGV0IGlzTGFuZ3VhZ2VUYWdTZXR0aW5nID0gZmFsc2U7XG5cdFx0aWYgKE9WRVJSSURFX1BST1BFUlRZX1JFR0VYLnRlc3Qoa2V5KSkge1xuXHRcdFx0aXNMYW5ndWFnZVRhZ1NldHRpbmcgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGxldCBkZWZhdWx0VmFsdWVTb3VyY2U6IENvbmZpZ3VyYXRpb25EZWZhdWx0VmFsdWVTb3VyY2UgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCFpc0xhbmd1YWdlVGFnU2V0dGluZykge1xuXHRcdFx0Y29uc3QgcmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wID0gcHJvcCBhcyBJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYTtcblx0XHRcdGlmIChyZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3AgJiYgcmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wLmRlZmF1bHRWYWx1ZVNvdXJjZSkge1xuXHRcdFx0XHRkZWZhdWx0VmFsdWVTb3VyY2UgPSByZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3AuZGVmYXVsdFZhbHVlU291cmNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghZW51bVRvVXNlICYmIChwcm9wLmVudW1JdGVtTGFiZWxzIHx8IGVudW1EZXNjcmlwdGlvbnMgfHwgZW51bURlc2NyaXB0aW9uc0FyZU1hcmtkb3duKSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcihgVGhlIHNldHRpbmcgJHtrZXl9IGhhcyBlbnVtLXJlbGF0ZWQgZmllbGRzLCBidXQgZG9lc24ndCBoYXZlIGFuIGVudW0gZmllbGQuIFRoaXMgc2V0dGluZyBtYXkgcmVuZGVyIGltcHJvcGVybHkgaW4gdGhlIFNldHRpbmdzIGVkaXRvci5gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0a2V5LFxuXHRcdFx0dmFsdWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogZGVzY3JpcHRpb25MaW5lcyxcblx0XHRcdGRlc2NyaXB0aW9uSXNNYXJrZG93bjogISFwcm9wLm1hcmtkb3duRGVzY3JpcHRpb24sXG5cdFx0XHRrZXl3b3JkczogcHJvcC5rZXl3b3Jkcyxcblx0XHRcdHJhbmdlOiBudWxsUmFuZ2UsXG5cdFx0XHRrZXlSYW5nZTogbnVsbFJhbmdlLFxuXHRcdFx0dmFsdWVSYW5nZTogbnVsbFJhbmdlLFxuXHRcdFx0ZGVzY3JpcHRpb25SYW5nZXM6IFtdLFxuXHRcdFx0b3ZlcnJpZGVzLFxuXHRcdFx0c2NvcGU6IHByb3Auc2NvcGUsXG5cdFx0XHR0eXBlOiBwcm9wLnR5cGUsXG5cdFx0XHRhcnJheUl0ZW1UeXBlOiBsaXN0SXRlbVR5cGUsXG5cdFx0XHRvYmplY3RQcm9wZXJ0aWVzLFxuXHRcdFx0b2JqZWN0UGF0dGVyblByb3BlcnRpZXMsXG5cdFx0XHRvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcyxcblx0XHRcdHByb3BlcnR5TmFtZXMsXG5cdFx0XHRlbnVtOiBlbnVtVG9Vc2UsXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBlbnVtRGVzY3JpcHRpb25zLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uc0FyZU1hcmtkb3duOiBlbnVtRGVzY3JpcHRpb25zQXJlTWFya2Rvd24sXG5cdFx0XHRlbnVtSXRlbUxhYmVsczogcHJvcC5lbnVtSXRlbUxhYmVscyxcblx0XHRcdHVuaXF1ZUl0ZW1zOiBwcm9wLnVuaXF1ZUl0ZW1zLFxuXHRcdFx0dGFnczogcHJvcC50YWdzLFxuXHRcdFx0ZGlzYWxsb3dTeW5jSWdub3JlOiBwcm9wLmRpc2FsbG93U3luY0lnbm9yZSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHByb3AucmVzdHJpY3RlZCxcblx0XHRcdGV4dGVuc2lvbkluZm86IGlzU3RyaW5nKHByb3Auc291cmNlKSA/IHVuZGVmaW5lZCA6IHByb3Auc291cmNlLFxuXHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBwcm9wLm1hcmtkb3duRGVwcmVjYXRpb25NZXNzYWdlIHx8IHByb3AuZGVwcmVjYXRpb25NZXNzYWdlLFxuXHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlSXNNYXJrZG93bjogISFwcm9wLm1hcmtkb3duRGVwcmVjYXRpb25NZXNzYWdlLFxuXHRcdFx0dmFsaWRhdG9yOiBjcmVhdGVWYWxpZGF0b3IocHJvcCksXG5cdFx0XHRhbGxLZXlzQXJlQm9vbGVhbixcblx0XHRcdGVkaXRQcmVzZW50YXRpb246IHByb3AuZWRpdFByZXNlbnRhdGlvbixcblx0XHRcdG9yZGVyOiBwcm9wLm9yZGVyLFxuXHRcdFx0bm9uTGFuZ3VhZ2VTcGVjaWZpY0RlZmF1bHRWYWx1ZVNvdXJjZTogZGVmYXVsdFZhbHVlU291cmNlLFxuXHRcdFx0aXNMYW5ndWFnZVRhZ1NldHRpbmcsXG5cdFx0XHRjYXRlZ29yeUxhYmVsOiAoaXNTdHJpbmcocHJvcC5zb3VyY2UpID8gdW5kZWZpbmVkIDogcHJvcC5zb3VyY2U/LmlkKSA9PT0gcHJvcC5zZWN0aW9uPy5pZCA/IHByb3AudGl0bGUgOiBwcm9wLnNlY3Rpb24/LmlkXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VPdmVycmlkZVNldHRpbmdzKG92ZXJyaWRlU2V0dGluZ3M6IGFueSk6IElTZXR0aW5nW10ge1xuXHRcdHJldHVybiBPYmplY3Qua2V5cyhvdmVycmlkZVNldHRpbmdzKS5tYXAoKGtleSkgPT4gKHtcblx0XHRcdGtleSxcblx0XHRcdHZhbHVlOiBvdmVycmlkZVNldHRpbmdzW2tleV0sXG5cdFx0XHRkZXNjcmlwdGlvbjogW10sXG5cdFx0XHRkZXNjcmlwdGlvbklzTWFya2Rvd246IGZhbHNlLFxuXHRcdFx0cmFuZ2U6IG51bGxSYW5nZSxcblx0XHRcdGtleVJhbmdlOiBudWxsUmFuZ2UsXG5cdFx0XHR2YWx1ZVJhbmdlOiBudWxsUmFuZ2UsXG5cdFx0XHRkZXNjcmlwdGlvblJhbmdlczogW10sXG5cdFx0XHRvdmVycmlkZXM6IFtdXG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXRjaGVzU2NvcGUocHJvcGVydHk6IElDb25maWd1cmF0aW9uTm9kZSk6IGJvb2xlYW4ge1xuXHRcdGlmICghcHJvcGVydHkuc2NvcGUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy50YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUikge1xuXHRcdFx0cmV0dXJuIEZPTERFUl9TQ09QRVMuaW5kZXhPZihwcm9wZXJ0eS5zY29wZSkgIT09IC0xO1xuXHRcdH1cblx0XHRpZiAodGhpcy50YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKSB7XG5cdFx0XHRyZXR1cm4gV09SS1NQQUNFX1NDT1BFUy5pbmRleE9mKHByb3BlcnR5LnNjb3BlKSAhPT0gLTE7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wYXJlR3JvdXBzKGMxOiBJU2V0dGluZ3NHcm91cCwgYzI6IElTZXR0aW5nc0dyb3VwKTogbnVtYmVyIHtcblx0XHRpZiAodHlwZW9mIGMxPy5vcmRlciAhPT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGMyPy5vcmRlciAhPT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0aWYgKGMxLm9yZGVyID09PSBjMi5vcmRlcikge1xuXHRcdFx0Y29uc3QgdGl0bGUxID0gYzEudGl0bGUgfHwgJyc7XG5cdFx0XHRjb25zdCB0aXRsZTIgPSBjMi50aXRsZSB8fCAnJztcblx0XHRcdHJldHVybiB0aXRsZTEubG9jYWxlQ29tcGFyZSh0aXRsZTIpO1xuXHRcdH1cblx0XHRyZXR1cm4gYzEub3JkZXIgLSBjMi5vcmRlcjtcblx0fVxuXG5cdHByaXZhdGUgdG9Db250ZW50KHNldHRpbmdzR3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdLCBzdGFydEluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgU2V0dGluZ3NDb250ZW50QnVpbGRlcigpO1xuXHRcdGZvciAobGV0IGkgPSBzdGFydEluZGV4OyBpIDwgc2V0dGluZ3NHcm91cHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGJ1aWxkZXIucHVzaEdyb3VwKHNldHRpbmdzR3JvdXBzW2ldLCBpID09PSBzdGFydEluZGV4LCBpID09PSBzZXR0aW5nc0dyb3Vwcy5sZW5ndGggLSAxKTtcblx0XHR9XG5cdFx0cmV0dXJuIGJ1aWxkZXIuZ2V0Q29udGVudCgpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIERlZmF1bHRTZXR0aW5nc0VkaXRvck1vZGVsIGV4dGVuZHMgQWJzdHJhY3RTZXR0aW5nc01vZGVsIGltcGxlbWVudHMgSVNldHRpbmdzRWRpdG9yTW9kZWwge1xuXG5cdHByaXZhdGUgX21vZGVsOiBJVGV4dE1vZGVsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlR3JvdXBzOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlR3JvdXBzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlR3JvdXBzLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX3VyaTogVVJJLFxuXHRcdHJlZmVyZW5jZTogSVJlZmVyZW5jZTxJVGV4dEVkaXRvck1vZGVsPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRTZXR0aW5nczogRGVmYXVsdFNldHRpbmdzXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihkZWZhdWx0U2V0dGluZ3Mub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VHcm91cHMuZmlyZSgpKSk7XG5cdFx0dGhpcy5fbW9kZWwgPSByZWZlcmVuY2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbCE7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbldpbGxEaXNwb3NlKCgpID0+IHJlZmVyZW5jZS5kaXNwb3NlKCkpKTtcblx0fVxuXG5cdGdldCB1cmkoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5fdXJpO1xuXHR9XG5cblx0Z2V0IHRhcmdldCgpOiBDb25maWd1cmF0aW9uVGFyZ2V0IHtcblx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0U2V0dGluZ3MudGFyZ2V0O1xuXHR9XG5cblx0Z2V0IHNldHRpbmdzR3JvdXBzKCk6IElTZXR0aW5nc0dyb3VwW10ge1xuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRTZXR0aW5ncy5nZXRTZXR0aW5nc0dyb3VwcygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldCBmaWx0ZXJHcm91cHMoKTogSVNldHRpbmdzR3JvdXBbXSB7XG5cdFx0Ly8gRG9uJ3QgbG9vayBhdCBcImNvbW1vbmx5IHVzZWRcIiBmb3IgZmlsdGVyXG5cdFx0cmV0dXJuIHRoaXMuc2V0dGluZ3NHcm91cHMuc2xpY2UoMSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlKCk6IElGaWx0ZXJSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9tb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gR3JhYiBjdXJyZW50IHJlc3VsdCBncm91cHMsIG9ubHkgcmVuZGVyIG5vbi1lbXB0eSBncm91cHNcblx0XHRjb25zdCByZXN1bHRHcm91cHMgPSBbLi4udGhpcy5fY3VycmVudFJlc3VsdEdyb3Vwcy52YWx1ZXMoKV1cblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLm9yZGVyIC0gYi5vcmRlcik7XG5cdFx0Y29uc3Qgbm9uRW1wdHlSZXN1bHRHcm91cHMgPSByZXN1bHRHcm91cHMuZmlsdGVyKGdyb3VwID0+IGdyb3VwLnJlc3VsdC5maWx0ZXJNYXRjaGVzLmxlbmd0aCk7XG5cblx0XHRjb25zdCBzdGFydExpbmUgPSB0aGlzLnNldHRpbmdzR3JvdXBzLmF0KC0xKSEucmFuZ2UuZW5kTGluZU51bWJlciArIDI7XG5cdFx0Y29uc3QgeyBzZXR0aW5nc0dyb3VwczogZmlsdGVyZWRHcm91cHMsIG1hdGNoZXMgfSA9IHRoaXMud3JpdGVSZXN1bHRHcm91cHMobm9uRW1wdHlSZXN1bHRHcm91cHMsIHN0YXJ0TGluZSk7XG5cblx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuY29sbGVjdE1ldGFkYXRhKHJlc3VsdEdyb3Vwcyk7XG5cdFx0cmV0dXJuIHJlc3VsdEdyb3Vwcy5sZW5ndGggP1xuXHRcdFx0e1xuXHRcdFx0XHRhbGxHcm91cHM6IHRoaXMuc2V0dGluZ3NHcm91cHMsXG5cdFx0XHRcdGZpbHRlcmVkR3JvdXBzLFxuXHRcdFx0XHRtYXRjaGVzLFxuXHRcdFx0XHRtZXRhZGF0YTogbWV0YWRhdGEgPz8gdW5kZWZpbmVkXG5cdFx0XHR9IDpcblx0XHRcdHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFuc2xhdGUgdGhlIElTZWFyY2hSZXN1bHRHcm91cHMgdG8gdGV4dCwgYW5kIHdyaXRlIGl0IHRvIHRoZSBlZGl0b3IgbW9kZWxcblx0ICovXG5cdHByaXZhdGUgd3JpdGVSZXN1bHRHcm91cHMoZ3JvdXBzOiBJU2VhcmNoUmVzdWx0R3JvdXBbXSwgc3RhcnRMaW5lOiBudW1iZXIpOiB7IG1hdGNoZXM6IElSYW5nZVtdOyBzZXR0aW5nc0dyb3VwczogSVNldHRpbmdzR3JvdXBbXSB9IHtcblx0XHRjb25zdCBjb250ZW50QnVpbGRlck9mZnNldCA9IHN0YXJ0TGluZSAtIDE7XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBTZXR0aW5nc0NvbnRlbnRCdWlsZGVyKGNvbnRlbnRCdWlsZGVyT2Zmc2V0KTtcblxuXHRcdGNvbnN0IHNldHRpbmdzR3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdID0gW107XG5cdFx0Y29uc3QgbWF0Y2hlczogSVJhbmdlW10gPSBbXTtcblx0XHRpZiAoZ3JvdXBzLmxlbmd0aCkge1xuXHRcdFx0YnVpbGRlci5wdXNoTGluZSgnLCcpO1xuXHRcdFx0Z3JvdXBzLmZvckVhY2gocmVzdWx0R3JvdXAgPT4ge1xuXHRcdFx0XHRjb25zdCBzZXR0aW5nc0dyb3VwID0gdGhpcy5nZXRHcm91cChyZXN1bHRHcm91cCk7XG5cdFx0XHRcdHNldHRpbmdzR3JvdXBzLnB1c2goc2V0dGluZ3NHcm91cCk7XG5cdFx0XHRcdG1hdGNoZXMucHVzaCguLi50aGlzLndyaXRlU2V0dGluZ3NHcm91cFRvQnVpbGRlcihidWlsZGVyLCBzZXR0aW5nc0dyb3VwLCByZXN1bHRHcm91cC5yZXN1bHQuZmlsdGVyTWF0Y2hlcykpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gbm90ZTogMS1pbmRleGVkIGxpbmUgbnVtYmVycyBoZXJlXG5cdFx0Y29uc3QgZ3JvdXBDb250ZW50ID0gYnVpbGRlci5nZXRDb250ZW50KCkgKyAnXFxuJztcblx0XHRjb25zdCBncm91cEVuZExpbmUgPSB0aGlzLl9tb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCBjdXJzb3JQb3NpdGlvbiA9IG5ldyBTZWxlY3Rpb24oc3RhcnRMaW5lLCAxLCBzdGFydExpbmUsIDEpO1xuXHRcdGNvbnN0IGVkaXQ6IElTaW5nbGVFZGl0T3BlcmF0aW9uID0ge1xuXHRcdFx0dGV4dDogZ3JvdXBDb250ZW50LFxuXHRcdFx0Zm9yY2VNb3ZlTWFya2VyczogdHJ1ZSxcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2Uoc3RhcnRMaW5lLCAxLCBncm91cEVuZExpbmUsIDEpXG5cdFx0fTtcblxuXHRcdHRoaXMuX21vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhbY3Vyc29yUG9zaXRpb25dLCBbZWRpdF0sICgpID0+IFtjdXJzb3JQb3NpdGlvbl0pO1xuXG5cdFx0Ly8gRm9yY2UgdG9rZW5pemF0aW9uIG5vdyAtIG90aGVyd2lzZSBpdCBtYXkgYmUgc2xpZ2h0bHkgZGVsYXllZCwgY2F1c2luZyBhIGZsYXNoIG9mIHdoaXRlIHRleHRcblx0XHRjb25zdCB0b2tlbml6ZVRvID0gTWF0aC5taW4oc3RhcnRMaW5lICsgNjAsIHRoaXMuX21vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHR0aGlzLl9tb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24odG9rZW5pemVUbyk7XG5cblx0XHRyZXR1cm4geyBtYXRjaGVzLCBzZXR0aW5nc0dyb3VwcyB9O1xuXHR9XG5cblx0cHJpdmF0ZSB3cml0ZVNldHRpbmdzR3JvdXBUb0J1aWxkZXIoYnVpbGRlcjogU2V0dGluZ3NDb250ZW50QnVpbGRlciwgc2V0dGluZ3NHcm91cDogSVNldHRpbmdzR3JvdXAsIGZpbHRlck1hdGNoZXM6IElTZXR0aW5nTWF0Y2hbXSk6IElSYW5nZVtdIHtcblx0XHRmaWx0ZXJNYXRjaGVzID0gZmlsdGVyTWF0Y2hlc1xuXHRcdFx0Lm1hcChmaWx0ZXJlZE1hdGNoID0+IHtcblx0XHRcdFx0Ly8gRml4IG1hdGNoIHJhbmdlcyB0byBvZmZzZXQgZnJvbSBzZXR0aW5nIHN0YXJ0IGxpbmVcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzZXR0aW5nOiBmaWx0ZXJlZE1hdGNoLnNldHRpbmcsXG5cdFx0XHRcdFx0c2NvcmU6IGZpbHRlcmVkTWF0Y2guc2NvcmUsXG5cdFx0XHRcdFx0bWF0Y2hUeXBlOiBmaWx0ZXJlZE1hdGNoLm1hdGNoVHlwZSxcblx0XHRcdFx0XHRrZXlNYXRjaFNjb3JlOiBmaWx0ZXJlZE1hdGNoLmtleU1hdGNoU2NvcmUsXG5cdFx0XHRcdFx0bWF0Y2hlczogZmlsdGVyZWRNYXRjaC5tYXRjaGVzICYmIGZpbHRlcmVkTWF0Y2gubWF0Y2hlcy5tYXAobWF0Y2ggPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBSYW5nZShcblx0XHRcdFx0XHRcdFx0bWF0Y2guc3RhcnRMaW5lTnVtYmVyIC0gZmlsdGVyZWRNYXRjaC5zZXR0aW5nLnJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdFx0bWF0Y2guc3RhcnRDb2x1bW4sXG5cdFx0XHRcdFx0XHRcdG1hdGNoLmVuZExpbmVOdW1iZXIgLSBmaWx0ZXJlZE1hdGNoLnNldHRpbmcucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0XHRtYXRjaC5lbmRDb2x1bW4pO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblxuXHRcdGJ1aWxkZXIucHVzaEdyb3VwKHNldHRpbmdzR3JvdXApO1xuXG5cdFx0Ly8gYnVpbGRlciBoYXMgcmV3cml0dGVuIHNldHRpbmdzIHJhbmdlcywgZml4IG1hdGNoIHJhbmdlc1xuXHRcdGNvbnN0IGZpeGVkTWF0Y2hlcyA9IGZpbHRlck1hdGNoZXNcblx0XHRcdC5tYXAobSA9PiBtLm1hdGNoZXMgfHwgW10pXG5cdFx0XHQuZmxhdE1hcCgoc2V0dGluZ01hdGNoZXMsIGkpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2V0dGluZyA9IHNldHRpbmdzR3JvdXAuc2VjdGlvbnNbMF0uc2V0dGluZ3NbaV07XG5cdFx0XHRcdHJldHVybiBzZXR0aW5nTWF0Y2hlcy5tYXAocmFuZ2UgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgUmFuZ2UoXG5cdFx0XHRcdFx0XHRyYW5nZS5zdGFydExpbmVOdW1iZXIgKyBzZXR0aW5nLnJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdHJhbmdlLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRcdFx0cmFuZ2UuZW5kTGluZU51bWJlciArIHNldHRpbmcucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0cmFuZ2UuZW5kQ29sdW1uKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdHJldHVybiBmaXhlZE1hdGNoZXM7XG5cdH1cblxuXHRwcml2YXRlIGNvcHlTZXR0aW5nKHNldHRpbmc6IElTZXR0aW5nKTogSVNldHRpbmcge1xuXHRcdHJldHVybiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogc2V0dGluZy5kZXNjcmlwdGlvbixcblx0XHRcdHNjb3BlOiBzZXR0aW5nLnNjb3BlLFxuXHRcdFx0dHlwZTogc2V0dGluZy50eXBlLFxuXHRcdFx0ZW51bTogc2V0dGluZy5lbnVtLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogc2V0dGluZy5lbnVtRGVzY3JpcHRpb25zLFxuXHRcdFx0a2V5OiBzZXR0aW5nLmtleSxcblx0XHRcdHZhbHVlOiBzZXR0aW5nLnZhbHVlLFxuXHRcdFx0cmFuZ2U6IHNldHRpbmcucmFuZ2UsXG5cdFx0XHRvdmVycmlkZXM6IFtdLFxuXHRcdFx0b3ZlcnJpZGVPZjogc2V0dGluZy5vdmVycmlkZU9mLFxuXHRcdFx0dGFnczogc2V0dGluZy50YWdzLFxuXHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBzZXR0aW5nLmRlcHJlY2F0aW9uTWVzc2FnZSxcblx0XHRcdGtleVJhbmdlOiBudWxsUmFuZ2UsXG5cdFx0XHR2YWx1ZVJhbmdlOiBudWxsUmFuZ2UsXG5cdFx0XHRkZXNjcmlwdGlvbklzTWFya2Rvd246IHVuZGVmaW5lZCxcblx0XHRcdGRlc2NyaXB0aW9uUmFuZ2VzOiBbXVxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBnZXRQcmVmZXJlbmNlKGtleTogc3RyaW5nKTogSVNldHRpbmcgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5zZXR0aW5nc0dyb3Vwcykge1xuXHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIGdyb3VwLnNlY3Rpb25zKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZyBvZiBzZWN0aW9uLnNldHRpbmdzKSB7XG5cdFx0XHRcdFx0aWYgKHNldHRpbmcua2V5ID09PSBrZXkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBzZXR0aW5nO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRHcm91cChyZXN1bHRHcm91cDogSVNlYXJjaFJlc3VsdEdyb3VwKTogSVNldHRpbmdzR3JvdXAge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogcmVzdWx0R3JvdXAuaWQsXG5cdFx0XHRyYW5nZTogbnVsbFJhbmdlLFxuXHRcdFx0dGl0bGU6IHJlc3VsdEdyb3VwLmxhYmVsLFxuXHRcdFx0dGl0bGVSYW5nZTogbnVsbFJhbmdlLFxuXHRcdFx0c2VjdGlvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNldHRpbmdzOiByZXN1bHRHcm91cC5yZXN1bHQuZmlsdGVyTWF0Y2hlcy5tYXAobSA9PiB0aGlzLmNvcHlTZXR0aW5nKG0uc2V0dGluZykpXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdzQ29udGVudEJ1aWxkZXIge1xuXHRwcml2YXRlIF9jb250ZW50QnlMaW5lczogc3RyaW5nW107XG5cblx0cHJpdmF0ZSBnZXQgbGluZUNvdW50V2l0aE9mZnNldCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZW50QnlMaW5lcy5sZW5ndGggKyB0aGlzLl9yYW5nZU9mZnNldDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGxhc3RMaW5lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRlbnRCeUxpbmVzW3RoaXMuX2NvbnRlbnRCeUxpbmVzLmxlbmd0aCAtIDFdIHx8ICcnO1xuXHR9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBfcmFuZ2VPZmZzZXQgPSAwKSB7XG5cdFx0dGhpcy5fY29udGVudEJ5TGluZXMgPSBbXTtcblx0fVxuXG5cdHB1c2hMaW5lKC4uLmxpbmVUZXh0OiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRlbnRCeUxpbmVzLnB1c2goLi4ubGluZVRleHQpO1xuXHR9XG5cblx0cHVzaEdyb3VwKHNldHRpbmdzR3JvdXBzOiBJU2V0dGluZ3NHcm91cCwgaXNGaXJzdD86IGJvb2xlYW4sIGlzTGFzdD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9jb250ZW50QnlMaW5lcy5wdXNoKGlzRmlyc3QgPyAnW3snIDogJ3snKTtcblx0XHRjb25zdCBsYXN0U2V0dGluZyA9IHRoaXMuX3B1c2hHcm91cChzZXR0aW5nc0dyb3VwcywgJyAgJyk7XG5cblx0XHRpZiAobGFzdFNldHRpbmcpIHtcblx0XHRcdC8vIFN0cmlwIHRoZSBjb21tYSBmcm9tIHRoZSBsYXN0IHNldHRpbmdcblx0XHRcdGNvbnN0IGxpbmVJZHggPSBsYXN0U2V0dGluZy5yYW5nZS5lbmRMaW5lTnVtYmVyIC0gdGhpcy5fcmFuZ2VPZmZzZXQ7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gdGhpcy5fY29udGVudEJ5TGluZXNbbGluZUlkeCAtIDJdO1xuXHRcdFx0dGhpcy5fY29udGVudEJ5TGluZXNbbGluZUlkeCAtIDJdID0gY29udGVudC5zdWJzdHJpbmcoMCwgY29udGVudC5sZW5ndGggLSAxKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jb250ZW50QnlMaW5lcy5wdXNoKGlzTGFzdCA/ICd9XScgOiAnfSwnKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfcHVzaEdyb3VwKGdyb3VwOiBJU2V0dGluZ3NHcm91cCwgaW5kZW50OiBzdHJpbmcpOiBJU2V0dGluZyB8IG51bGwge1xuXHRcdGxldCBsYXN0U2V0dGluZzogSVNldHRpbmcgfCBudWxsID0gbnVsbDtcblx0XHRjb25zdCBncm91cFN0YXJ0ID0gdGhpcy5saW5lQ291bnRXaXRoT2Zmc2V0ICsgMTtcblx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2YgZ3JvdXAuc2VjdGlvbnMpIHtcblx0XHRcdGlmIChzZWN0aW9uLnRpdGxlKSB7XG5cdFx0XHRcdHRoaXMuYWRkRGVzY3JpcHRpb24oW3NlY3Rpb24udGl0bGVdLCBpbmRlbnQsIHRoaXMuX2NvbnRlbnRCeUxpbmVzKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNlY3Rpb24uc2V0dGluZ3MubGVuZ3RoKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZyBvZiBzZWN0aW9uLnNldHRpbmdzKSB7XG5cdFx0XHRcdFx0dGhpcy5wdXNoU2V0dGluZyhzZXR0aW5nLCBpbmRlbnQpO1xuXHRcdFx0XHRcdGxhc3RTZXR0aW5nID0gc2V0dGluZztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0fVxuXHRcdGdyb3VwLnJhbmdlID0geyBzdGFydExpbmVOdW1iZXI6IGdyb3VwU3RhcnQsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiB0aGlzLmxpbmVDb3VudFdpdGhPZmZzZXQsIGVuZENvbHVtbjogdGhpcy5sYXN0TGluZS5sZW5ndGggfTtcblx0XHRyZXR1cm4gbGFzdFNldHRpbmc7XG5cdH1cblxuXHRnZXRDb250ZW50KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRlbnRCeUxpbmVzLmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBwdXNoU2V0dGluZyhzZXR0aW5nOiBJU2V0dGluZywgaW5kZW50OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzZXR0aW5nU3RhcnQgPSB0aGlzLmxpbmVDb3VudFdpdGhPZmZzZXQgKyAxO1xuXG5cdFx0dGhpcy5wdXNoU2V0dGluZ0Rlc2NyaXB0aW9uKHNldHRpbmcsIGluZGVudCk7XG5cblx0XHRsZXQgcHJlVmFsdWVDb250ZW50ID0gaW5kZW50O1xuXHRcdGNvbnN0IGtleVN0cmluZyA9IEpTT04uc3RyaW5naWZ5KHNldHRpbmcua2V5KTtcblx0XHRwcmVWYWx1ZUNvbnRlbnQgKz0ga2V5U3RyaW5nO1xuXHRcdHNldHRpbmcua2V5UmFuZ2UgPSB7IHN0YXJ0TGluZU51bWJlcjogdGhpcy5saW5lQ291bnRXaXRoT2Zmc2V0ICsgMSwgc3RhcnRDb2x1bW46IHByZVZhbHVlQ29udGVudC5pbmRleE9mKHNldHRpbmcua2V5KSArIDEsIGVuZExpbmVOdW1iZXI6IHRoaXMubGluZUNvdW50V2l0aE9mZnNldCArIDEsIGVuZENvbHVtbjogc2V0dGluZy5rZXkubGVuZ3RoIH07XG5cblx0XHRwcmVWYWx1ZUNvbnRlbnQgKz0gJzogJztcblx0XHRjb25zdCB2YWx1ZVN0YXJ0ID0gdGhpcy5saW5lQ291bnRXaXRoT2Zmc2V0ICsgMTtcblx0XHR0aGlzLnB1c2hWYWx1ZShzZXR0aW5nLCBwcmVWYWx1ZUNvbnRlbnQsIGluZGVudCk7XG5cblx0XHRzZXR0aW5nLnZhbHVlUmFuZ2UgPSB7IHN0YXJ0TGluZU51bWJlcjogdmFsdWVTdGFydCwgc3RhcnRDb2x1bW46IHByZVZhbHVlQ29udGVudC5sZW5ndGggKyAxLCBlbmRMaW5lTnVtYmVyOiB0aGlzLmxpbmVDb3VudFdpdGhPZmZzZXQsIGVuZENvbHVtbjogdGhpcy5sYXN0TGluZS5sZW5ndGggKyAxIH07XG5cdFx0dGhpcy5fY29udGVudEJ5TGluZXNbdGhpcy5fY29udGVudEJ5TGluZXMubGVuZ3RoIC0gMV0gKz0gJywnO1xuXHRcdHRoaXMuX2NvbnRlbnRCeUxpbmVzLnB1c2goJycpO1xuXHRcdHNldHRpbmcucmFuZ2UgPSB7IHN0YXJ0TGluZU51bWJlcjogc2V0dGluZ1N0YXJ0LCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogdGhpcy5saW5lQ291bnRXaXRoT2Zmc2V0LCBlbmRDb2x1bW46IHRoaXMubGFzdExpbmUubGVuZ3RoIH07XG5cdH1cblxuXHRwcml2YXRlIHB1c2hTZXR0aW5nRGVzY3JpcHRpb24oc2V0dGluZzogSVNldHRpbmcsIGluZGVudDogc3RyaW5nKTogdm9pZCB7XG5cdFx0c2V0dGluZy5kZXNjcmlwdGlvblJhbmdlcyA9IFtdO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uUHJlVmFsdWUgPSBpbmRlbnQgKyAnLy8gJztcblx0XHRjb25zdCBkZXByZWNhdGlvbk1lc3NhZ2VMaW5lcyA9IHNldHRpbmcuZGVwcmVjYXRpb25NZXNzYWdlPy5zcGxpdCgvXFxuL2cpID8/IFtdO1xuXHRcdGZvciAobGV0IGxpbmUgb2YgWy4uLmRlcHJlY2F0aW9uTWVzc2FnZUxpbmVzLCAuLi5zZXR0aW5nLmRlc2NyaXB0aW9uXSkge1xuXHRcdFx0bGluZSA9IGZpeFNldHRpbmdMaW5rcyhsaW5lKTtcblxuXHRcdFx0dGhpcy5fY29udGVudEJ5TGluZXMucHVzaChkZXNjcmlwdGlvblByZVZhbHVlICsgbGluZSk7XG5cdFx0XHRzZXR0aW5nLmRlc2NyaXB0aW9uUmFuZ2VzLnB1c2goeyBzdGFydExpbmVOdW1iZXI6IHRoaXMubGluZUNvdW50V2l0aE9mZnNldCwgc3RhcnRDb2x1bW46IHRoaXMubGFzdExpbmUuaW5kZXhPZihsaW5lKSArIDEsIGVuZExpbmVOdW1iZXI6IHRoaXMubGluZUNvdW50V2l0aE9mZnNldCwgZW5kQ29sdW1uOiB0aGlzLmxhc3RMaW5lLmxlbmd0aCB9KTtcblx0XHR9XG5cblx0XHRpZiAoc2V0dGluZy5lbnVtICYmIHNldHRpbmcuZW51bURlc2NyaXB0aW9ucz8uc29tZShkZXNjID0+ICEhZGVzYykpIHtcblx0XHRcdHNldHRpbmcuZW51bURlc2NyaXB0aW9ucy5mb3JFYWNoKChkZXNjLCBpKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpc3BsYXlFbnVtID0gZXNjYXBlSW52aXNpYmxlQ2hhcnMoU3RyaW5nKHNldHRpbmcuZW51bSFbaV0pKTtcblx0XHRcdFx0Y29uc3QgbGluZSA9IGRlc2MgP1xuXHRcdFx0XHRcdGAke2Rpc3BsYXlFbnVtfTogJHtmaXhTZXR0aW5nTGlua3MoZGVzYyl9YCA6XG5cdFx0XHRcdFx0ZGlzcGxheUVudW07XG5cblx0XHRcdFx0Y29uc3QgbGluZXMgPSBsaW5lLnNwbGl0KC9cXG4vZyk7XG5cdFx0XHRcdGxpbmVzWzBdID0gJyAtICcgKyBsaW5lc1swXTtcblx0XHRcdFx0dGhpcy5fY29udGVudEJ5TGluZXMucHVzaCguLi5saW5lcy5tYXAobCA9PiBgJHtpbmRlbnR9Ly8gJHtsfWApKTtcblxuXHRcdFx0XHRzZXR0aW5nLmRlc2NyaXB0aW9uUmFuZ2VzLnB1c2goeyBzdGFydExpbmVOdW1iZXI6IHRoaXMubGluZUNvdW50V2l0aE9mZnNldCwgc3RhcnRDb2x1bW46IHRoaXMubGFzdExpbmUuaW5kZXhPZihsaW5lKSArIDEsIGVuZExpbmVOdW1iZXI6IHRoaXMubGluZUNvdW50V2l0aE9mZnNldCwgZW5kQ29sdW1uOiB0aGlzLmxhc3RMaW5lLmxlbmd0aCB9KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcHVzaFZhbHVlKHNldHRpbmc6IElTZXR0aW5nLCBwcmVWYWx1ZUNvbmVudDogc3RyaW5nLCBpbmRlbnQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHZhbHVlU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkoc2V0dGluZy52YWx1ZSwgbnVsbCwgaW5kZW50KTtcblx0XHRpZiAodmFsdWVTdHJpbmcgJiYgKHR5cGVvZiBzZXR0aW5nLnZhbHVlID09PSAnb2JqZWN0JykpIHtcblx0XHRcdGlmIChzZXR0aW5nLm92ZXJyaWRlcyAmJiBzZXR0aW5nLm92ZXJyaWRlcy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fY29udGVudEJ5TGluZXMucHVzaChwcmVWYWx1ZUNvbmVudCArICcgeycpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHN1YlNldHRpbmcgb2Ygc2V0dGluZy5vdmVycmlkZXMpIHtcblx0XHRcdFx0XHR0aGlzLnB1c2hTZXR0aW5nKHN1YlNldHRpbmcsIGluZGVudCArIGluZGVudCk7XG5cdFx0XHRcdFx0dGhpcy5fY29udGVudEJ5TGluZXMucG9wKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbGFzdFNldHRpbmcgPSBzZXR0aW5nLm92ZXJyaWRlc1tzZXR0aW5nLm92ZXJyaWRlcy5sZW5ndGggLSAxXTtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IHRoaXMuX2NvbnRlbnRCeUxpbmVzW2xhc3RTZXR0aW5nLnJhbmdlLmVuZExpbmVOdW1iZXIgLSAyXTtcblx0XHRcdFx0dGhpcy5fY29udGVudEJ5TGluZXNbbGFzdFNldHRpbmcucmFuZ2UuZW5kTGluZU51bWJlciAtIDJdID0gY29udGVudC5zdWJzdHJpbmcoMCwgY29udGVudC5sZW5ndGggLSAxKTtcblx0XHRcdFx0dGhpcy5fY29udGVudEJ5TGluZXMucHVzaChpbmRlbnQgKyAnfScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbXVsaXRMaW5lVmFsdWUgPSB2YWx1ZVN0cmluZy5zcGxpdCgnXFxuJyk7XG5cdFx0XHRcdHRoaXMuX2NvbnRlbnRCeUxpbmVzLnB1c2gocHJlVmFsdWVDb25lbnQgKyBtdWxpdExpbmVWYWx1ZVswXSk7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAxOyBpIDwgbXVsaXRMaW5lVmFsdWUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHR0aGlzLl9jb250ZW50QnlMaW5lcy5wdXNoKGluZGVudCArIG11bGl0TGluZVZhbHVlW2ldKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jb250ZW50QnlMaW5lcy5wdXNoKHByZVZhbHVlQ29uZW50ICsgdmFsdWVTdHJpbmcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWRkRGVzY3JpcHRpb24oZGVzY3JpcHRpb246IHN0cmluZ1tdLCBpbmRlbnQ6IHN0cmluZywgcmVzdWx0OiBzdHJpbmdbXSkge1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBkZXNjcmlwdGlvbikge1xuXHRcdFx0cmVzdWx0LnB1c2goaW5kZW50ICsgJy8vICcgKyBsaW5lKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgUmF3U2V0dGluZ3NDb250ZW50QnVpbGRlciBleHRlbmRzIFNldHRpbmdzQ29udGVudEJ1aWxkZXIge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgaW5kZW50OiBzdHJpbmcgPSAnXFx0Jykge1xuXHRcdHN1cGVyKDApO1xuXHR9XG5cblx0b3ZlcnJpZGUgcHVzaEdyb3VwKHNldHRpbmdzR3JvdXBzOiBJU2V0dGluZ3NHcm91cCk6IHZvaWQge1xuXHRcdHRoaXMuX3B1c2hHcm91cChzZXR0aW5nc0dyb3VwcywgdGhpcy5pbmRlbnQpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIERlZmF1bHRSYXdTZXR0aW5nc0VkaXRvck1vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfY29udGVudDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDb250ZW50Q2hhbmdlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENvbnRlbnRDaGFuZ2VkID0gdGhpcy5fb25EaWRDb250ZW50Q2hhbmdlZC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGRlZmF1bHRTZXR0aW5nczogRGVmYXVsdFNldHRpbmdzKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihkZWZhdWx0U2V0dGluZ3Mub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29udGVudCA9IG51bGw7XG5cdFx0XHR0aGlzLl9vbkRpZENvbnRlbnRDaGFuZ2VkLmZpcmUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRnZXQgY29udGVudCgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLl9jb250ZW50ID09PSBudWxsKSB7XG5cdFx0XHRjb25zdCBidWlsZGVyID0gbmV3IFJhd1NldHRpbmdzQ29udGVudEJ1aWxkZXIoKTtcblx0XHRcdGJ1aWxkZXIucHVzaExpbmUoJ3snKTtcblx0XHRcdGZvciAoY29uc3Qgc2V0dGluZ3NHcm91cCBvZiB0aGlzLmRlZmF1bHRTZXR0aW5ncy5nZXRSZWdpc3RlcmVkR3JvdXBzKCkpIHtcblx0XHRcdFx0YnVpbGRlci5wdXNoR3JvdXAoc2V0dGluZ3NHcm91cCk7XG5cdFx0XHR9XG5cdFx0XHRidWlsZGVyLnB1c2hMaW5lKCd9Jyk7XG5cdFx0XHR0aGlzLl9jb250ZW50ID0gYnVpbGRlci5nZXRDb250ZW50KCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jb250ZW50O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGVzY2FwZUludmlzaWJsZUNoYXJzKGVudW1WYWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGVudW1WYWx1ZSAmJiBlbnVtVmFsdWVcblx0XHQucmVwbGFjZSgvXFxuL2csICdcXFxcbicpXG5cdFx0LnJlcGxhY2UoL1xcci9nLCAnXFxcXHInKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlZmF1bHRLZXliaW5kaW5nc0NvbnRlbnRzKGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UpOiBzdHJpbmcge1xuXHRjb25zdCBkZWZhdWx0c0hlYWRlciA9ICcvLyAnICsgbmxzLmxvY2FsaXplKCdkZWZhdWx0S2V5YmluZGluZ3NIZWFkZXInLCBcIk92ZXJyaWRlIGtleSBiaW5kaW5ncyBieSBwbGFjaW5nIHRoZW0gaW50byB5b3VyIGtleSBiaW5kaW5ncyBmaWxlLlwiKTtcblx0cmV0dXJuIGRlZmF1bHRzSGVhZGVyICsgJ1xcbicgKyBrZXliaW5kaW5nU2VydmljZS5nZXREZWZhdWx0S2V5YmluZGluZ3NDb250ZW50KCk7XG59XG5cbmV4cG9ydCBjbGFzcyBEZWZhdWx0S2V5YmluZGluZ3NFZGl0b3JNb2RlbCBpbXBsZW1lbnRzIElLZXliaW5kaW5nc0VkaXRvck1vZGVsPGFueT4ge1xuXG5cdHByaXZhdGUgX2NvbnRlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIF91cmk6IFVSSSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSkge1xuXHR9XG5cblx0Z2V0IHVyaSgpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLl91cmk7XG5cdH1cblxuXHRnZXQgY29udGVudCgpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fY29udGVudCkge1xuXHRcdFx0dGhpcy5fY29udGVudCA9IGRlZmF1bHRLZXliaW5kaW5nc0NvbnRlbnRzKHRoaXMua2V5YmluZGluZ1NlcnZpY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY29udGVudDtcblx0fVxuXG5cdGdldFByZWZlcmVuY2UoKTogYW55IHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Ly8gTm90IGRpc3Bvc2FibGVcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGVBQXNCO0FBQy9CLFNBQXNCLGFBQWE7QUFDbkMsU0FBUyxrQkFBOEI7QUFFdkMsU0FBaUIsYUFBYTtBQUM5QixTQUFTLGlCQUFpQjtBQUkxQixZQUFZLFNBQVM7QUFDckIsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQTBDLG9CQUFvQixZQUFnRywrQkFBK0I7QUFDN0wsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBb0wsd0JBQXdCO0FBQzVNLFNBQVMsZUFBZSx3QkFBd0I7QUFDaEQsU0FBUyx1QkFBdUI7QUFD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VUFBVSxnQkFBc0M7QUFDeEQsU0FBSyxXQUFXLGdCQUFnQixLQUFLLE1BQU07QUFBQSxFQUM1QztBQUVEO0FBRU8sTUFBTSxzQ0FBc0MsV0FBVztBQUFBLEVBTzdELFlBQW9CLGlCQUFrQztBQUNyRCxVQUFNO0FBRGE7QUFMcEIsU0FBUSxXQUEwQjtBQUVsQyxTQUFpQix1QkFBdUIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQzFFLFNBQVMsc0JBQXNCLEtBQUsscUJBQXFCO0FBSXhELFNBQUssVUFBVSxnQkFBZ0IsWUFBWSxNQUFNO0FBQ2hELFdBQUssV0FBVztBQUNoQixXQUFLLHFCQUFxQixLQUFLO0FBQUEsSUFDaEMsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsSUFBSSxVQUFrQjtBQUNyQixRQUFJLEtBQUssYUFBYSxNQUFNO0FBQzNCLFlBQU0sVUFBVSxJQUFJLDBCQUEwQjtBQUM5QyxjQUFRLFNBQVMsR0FBRztBQUNwQixpQkFBVyxpQkFBaUIsS0FBSyxnQkFBZ0Isb0JBQW9CLEdBQUc7QUFDdkUsZ0JBQVEsVUFBVSxhQUFhO0FBQUEsTUFDaEM7QUFDQSxjQUFRLFNBQVMsR0FBRztBQUNwQixXQUFLLFdBQVcsUUFBUSxXQUFXO0FBQUEsSUFDcEM7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQ0Q7QUFFQSxTQUFTLHFCQUFxQixXQUEyQjtBQUN4RCxTQUFPLGFBQWEsVUFDbEIsUUFBUSxPQUFPLEtBQUssRUFDcEIsUUFBUSxPQUFPLEtBQUs7QUFDdkI7QUFFTyxTQUFTLDJCQUEyQixtQkFBK0M7QUFDekYsUUFBTSxpQkFBaUIsUUFBUSxJQUFJLFNBQVMsNEJBQTRCLG9FQUFvRTtBQUM1SSxTQUFPLGlCQUFpQixPQUFPLGtCQUFrQiw2QkFBNkI7QUFDL0U7QUFFTyxJQUFNLGdDQUFOLE1BQTRFO0FBQUEsRUFJbEYsWUFBb0IsTUFDa0IsbUJBQXVDO0FBRHpEO0FBQ2tCO0FBQUEsRUFDdEM7QUFBQSxFQUVBLElBQUksTUFBVztBQUNkLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksVUFBa0I7QUFDckIsUUFBSSxDQUFDLEtBQUssVUFBVTtBQUNuQixXQUFLLFdBQVcsMkJBQTJCLEtBQUssaUJBQWlCO0FBQUEsSUFDbEU7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxnQkFBcUI7QUFDcEIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFVBQWdCO0FBQUEsRUFFaEI7QUFDRDtBQTFCYSxnQ0FBTjtBQUFBLEVBS0o7QUFBQSxHQUxVOyIsCiAgIm5hbWVzIjogWyJrZXkiXQp9Cg==
