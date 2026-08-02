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
import * as arrays from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { escapeRegExpCharacters, isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { isUndefinedOrNull } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ConfigurationTarget, getLanguageTagSettingPlainKey } from "../../../../platform/configuration/common/configuration.js";
import { ConfigurationScope, EditPresentationTypes, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { USER_LOCAL_AND_REMOTE_SETTINGS } from "../../../../platform/request/common/request.js";
import { APPLICATION_SCOPES, FOLDER_SCOPES, IWorkbenchConfigurationService, LOCAL_MACHINE_SCOPES, REMOTE_MACHINE_SCOPES, WORKSPACE_SCOPES } from "../../../services/configuration/common/configuration.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { SettingMatchType, SettingValueType } from "../../../services/preferences/common/preferences.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { AGENTS_WINDOW_SETTING_TAG, ENABLE_EXTENSION_TOGGLE_SETTINGS, ENABLE_LANGUAGE_FILTER, MODIFIED_SETTING_TAG, POLICY_SETTING_TAG, REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG, compareTwoNullableNumbers, wordifyKey } from "../common/preferences.js";
import { tocData } from "./settingsLayout.js";
const ONLINE_SERVICES_SETTING_TAG = "usesOnlineServices";
class SettingsTreeElement extends Disposable {
  constructor(_id) {
    super();
    this._tabbable = false;
    this._onDidChangeTabbable = this._register(new Emitter());
    this.id = _id;
  }
  get onDidChangeTabbable() {
    return this._onDidChangeTabbable.event;
  }
  get tabbable() {
    return this._tabbable;
  }
  set tabbable(value) {
    this._tabbable = value;
    this._onDidChangeTabbable.fire();
  }
}
class SettingsTreeGroupElement extends SettingsTreeElement {
  constructor(_id, count, label, level, isFirstGroup) {
    super(_id);
    this._childSettingKeys = /* @__PURE__ */ new Set();
    this._children = [];
    this.count = count;
    this.label = label;
    this.level = level;
    this.isFirstGroup = isFirstGroup;
  }
  get children() {
    return this._children;
  }
  set children(newChildren) {
    this._children = newChildren;
    this._childSettingKeys = /* @__PURE__ */ new Set();
    this._children.forEach((child) => {
      if (child instanceof SettingsTreeSettingElement) {
        this._childSettingKeys.add(child.setting.key);
      }
    });
  }
  /**
   * Returns whether this group contains the given child key (to a depth of 1 only)
   */
  containsSetting(key) {
    return this._childSettingKeys.has(key);
  }
}
class SettingsTreeNewExtensionsElement extends SettingsTreeElement {
  constructor(_id, extensionIds) {
    super(_id);
    this.extensionIds = extensionIds;
  }
}
const _SettingsTreeSettingElement = class _SettingsTreeSettingElement extends SettingsTreeElement {
  constructor(setting, parent, settingsTarget, isWorkspaceTrusted, languageFilter, languageService, productService, userDataProfileService, configurationService, isSessionsWindow) {
    super(sanitizeId(parent.id + "_" + setting.key));
    this.settingsTarget = settingsTarget;
    this.isWorkspaceTrusted = isWorkspaceTrusted;
    this.languageFilter = languageFilter;
    this.languageService = languageService;
    this.productService = productService;
    this.userDataProfileService = userDataProfileService;
    this.configurationService = configurationService;
    this.isSessionsWindow = isSessionsWindow;
    this._displayCategory = null;
    this._displayLabel = null;
    /**
     * Whether the setting is configured in the selected scope.
     */
    this.isConfigured = false;
    /**
     * Whether the setting requires trusted target
     */
    this.isUntrusted = false;
    /**
     * Whether the setting is under a policy that blocks all changes.
     */
    this.hasPolicyValue = false;
    /**
     * Whether the setting is read-only in the Agents window.
     */
    this.isAgentsWindowReadOnly = false;
    this.overriddenScopeList = [];
    this.overriddenDefaultsLanguageList = [];
    /**
     * For each language that contributes setting values or default overrides, we can see those values here.
     */
    this.languageOverrideValues = /* @__PURE__ */ new Map();
    this.setting = setting;
    this.parent = parent;
    this.initSettingDescription();
    this.initSettingValueType();
  }
  get displayCategory() {
    if (!this._displayCategory) {
      this.initLabels();
    }
    return this._displayCategory;
  }
  get displayLabel() {
    if (!this._displayLabel) {
      this.initLabels();
    }
    return this._displayLabel;
  }
  initLabels() {
    if (this.setting.title) {
      this._displayLabel = this.setting.title;
      this._displayCategory = this.setting.categoryLabel ?? null;
      return;
    }
    const displayKeyFormat = settingKeyToDisplayFormat(this.setting.key, this.parent.id, this.setting.isLanguageTagSetting);
    this._displayLabel = displayKeyFormat.label;
    this._displayCategory = displayKeyFormat.category;
  }
  initSettingDescription() {
    if (this.setting.description.length > _SettingsTreeSettingElement.MAX_DESC_LINES) {
      const truncatedDescLines = this.setting.description.slice(0, _SettingsTreeSettingElement.MAX_DESC_LINES);
      truncatedDescLines.push("[...]");
      this.description = truncatedDescLines.join("\n");
    } else {
      this.description = this.setting.description.join("\n");
    }
  }
  initSettingValueType() {
    if (isExtensionToggleSetting(this.setting, this.productService)) {
      this.valueType = SettingValueType.ExtensionToggle;
    } else if (this.setting.enum && (!this.setting.type || settingTypeEnumRenderable(this.setting.type))) {
      this.valueType = SettingValueType.Enum;
    } else if (this.setting.type === "string") {
      if (this.setting.editPresentation === EditPresentationTypes.Multiline) {
        this.valueType = SettingValueType.MultilineString;
      } else {
        this.valueType = SettingValueType.String;
      }
    } else if (isExcludeSetting(this.setting)) {
      this.valueType = SettingValueType.Exclude;
    } else if (isIncludeSetting(this.setting)) {
      this.valueType = SettingValueType.Include;
    } else if (this.setting.type === "integer") {
      this.valueType = SettingValueType.Integer;
    } else if (this.setting.type === "number") {
      this.valueType = SettingValueType.Number;
    } else if (this.setting.type === "boolean") {
      this.valueType = SettingValueType.Boolean;
    } else if (this.setting.type === "array" && this.setting.arrayItemType && ["string", "enum", "number", "integer"].includes(this.setting.arrayItemType)) {
      this.valueType = SettingValueType.Array;
    } else if (Array.isArray(this.setting.type) && this.setting.type.includes(SettingValueType.Null) && this.setting.type.length === 2) {
      if (this.setting.type.includes(SettingValueType.Integer)) {
        this.valueType = SettingValueType.NullableInteger;
      } else if (this.setting.type.includes(SettingValueType.Number)) {
        this.valueType = SettingValueType.NullableNumber;
      } else {
        this.valueType = SettingValueType.Complex;
      }
    } else {
      const schemaType = getObjectSettingSchemaType(this.setting);
      if (schemaType) {
        if (this.setting.allKeysAreBoolean) {
          this.valueType = SettingValueType.BooleanObject;
        } else if (schemaType === "simple") {
          this.valueType = SettingValueType.Object;
        } else {
          this.valueType = SettingValueType.ComplexObject;
        }
      } else if (this.setting.isLanguageTagSetting) {
        this.valueType = SettingValueType.LanguageTag;
      } else {
        this.valueType = SettingValueType.Complex;
      }
    }
  }
  inspectSelf() {
    const targetToInspect = this.getTargetToInspect(this.setting);
    const inspectResult = inspectSetting(this.setting.key, targetToInspect, this.languageFilter, this.configurationService);
    this.update(inspectResult, this.isWorkspaceTrusted);
  }
  getTargetToInspect(setting) {
    if (!this.userDataProfileService.currentProfile.isDefault && !this.userDataProfileService.currentProfile.useDefaultFlags?.settings) {
      if (setting.scope === ConfigurationScope.APPLICATION) {
        return ConfigurationTarget.APPLICATION;
      }
      if (this.configurationService.isSettingAppliedForAllProfiles(setting.key) && this.settingsTarget === ConfigurationTarget.USER_LOCAL) {
        return ConfigurationTarget.APPLICATION;
      }
    }
    return this.settingsTarget;
  }
  update(inspectResult, isWorkspaceTrusted) {
    let { isConfigured, inspected, targetSelector, inspectedLanguageOverrides, languageSelector } = inspectResult;
    switch (targetSelector) {
      case "workspaceFolderValue":
      case "workspaceValue":
        this.isUntrusted = !!this.setting.restricted && !isWorkspaceTrusted;
        break;
    }
    let displayValue = isConfigured ? inspected[targetSelector] : inspected.defaultValue;
    const overriddenScopeList = [];
    const overriddenDefaultsLanguageList = [];
    if ((languageSelector || targetSelector !== "workspaceValue") && typeof inspected.workspaceValue !== "undefined") {
      overriddenScopeList.push("workspace:");
    }
    if ((languageSelector || targetSelector !== "userRemoteValue") && typeof inspected.userRemoteValue !== "undefined") {
      overriddenScopeList.push("remote:");
    }
    if ((languageSelector || targetSelector !== "userLocalValue") && typeof inspected.userLocalValue !== "undefined") {
      overriddenScopeList.push("user:");
    }
    if (inspected.overrideIdentifiers) {
      for (const overrideIdentifier of inspected.overrideIdentifiers) {
        const inspectedOverride = inspectedLanguageOverrides.get(overrideIdentifier);
        if (inspectedOverride) {
          if (this.languageService.isRegisteredLanguageId(overrideIdentifier)) {
            if (languageSelector !== overrideIdentifier && typeof inspectedOverride.default?.override !== "undefined") {
              overriddenDefaultsLanguageList.push(overrideIdentifier);
            }
            if ((languageSelector !== overrideIdentifier || targetSelector !== "workspaceValue") && typeof inspectedOverride.workspace?.override !== "undefined") {
              overriddenScopeList.push(`workspace:${overrideIdentifier}`);
            }
            if ((languageSelector !== overrideIdentifier || targetSelector !== "userRemoteValue") && typeof inspectedOverride.userRemote?.override !== "undefined") {
              overriddenScopeList.push(`remote:${overrideIdentifier}`);
            }
            if ((languageSelector !== overrideIdentifier || targetSelector !== "userLocalValue") && typeof inspectedOverride.userLocal?.override !== "undefined") {
              overriddenScopeList.push(`user:${overrideIdentifier}`);
            }
          }
          this.languageOverrideValues.set(overrideIdentifier, inspectedOverride);
        }
      }
    }
    this.overriddenScopeList = overriddenScopeList;
    this.overriddenDefaultsLanguageList = overriddenDefaultsLanguageList;
    this.defaultValueSource = this.setting.nonLanguageSpecificDefaultValueSource;
    if (inspected.policyValue !== void 0) {
      this.hasPolicyValue = true;
      isConfigured = false;
      displayValue = inspected.policyValue;
      this.scopeValue = inspected.policyValue;
      this.defaultValue = inspected.defaultValue;
    } else if (languageSelector && this.languageOverrideValues.has(languageSelector)) {
      const overrideValues = this.languageOverrideValues.get(languageSelector);
      displayValue = (isConfigured ? overrideValues[targetSelector] : overrideValues.defaultValue) ?? displayValue;
      this.scopeValue = isConfigured && overrideValues[targetSelector];
      this.defaultValue = overrideValues.defaultValue ?? inspected.defaultValue;
      const registryValues = Registry.as(Extensions.Configuration).getConfigurationDefaultsOverrides();
      const source = registryValues.get(`[${languageSelector}]`)?.source;
      const overrideValueSource = source instanceof Map ? source.get(this.setting.key) : void 0;
      if (overrideValueSource) {
        this.defaultValueSource = overrideValueSource;
      }
    } else {
      this.scopeValue = isConfigured && inspected[targetSelector];
      this.defaultValue = inspected.defaultValue;
    }
    let hasAgentsWindowOverride = false;
    if (this.isSessionsWindow) {
      const property = Registry.as(Extensions.Configuration).getConfigurationProperties()[this.setting.key];
      hasAgentsWindowOverride = !!property?.agentsWindow;
      this.isAgentsWindowReadOnly = !!property?.agentsWindow?.readOnly;
      if (this.isAgentsWindowReadOnly) {
        isConfigured = false;
      }
    }
    this.value = displayValue;
    this.isConfigured = isConfigured;
    if (isConfigured || this.setting.tags || this.tags || this.setting.restricted || this.hasPolicyValue || hasAgentsWindowOverride) {
      this.tags = /* @__PURE__ */ new Set();
      if (isConfigured) {
        this.tags.add(MODIFIED_SETTING_TAG);
      }
      this.setting.tags?.forEach((tag) => this.tags.add(tag));
      if (this.setting.restricted) {
        this.tags.add(REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG);
      }
      if (this.hasPolicyValue) {
        this.tags.add(POLICY_SETTING_TAG);
      }
      if (hasAgentsWindowOverride) {
        this.tags.add(AGENTS_WINDOW_SETTING_TAG);
      }
    }
  }
  matchesAllTags(tagFilters) {
    if (!tagFilters?.size) {
      return true;
    }
    if (!this.tags) {
      this.inspectSelf();
    }
    if (tagFilters.has("stable")) {
      if (this.tags?.has("preview") || this.tags?.has("experimental")) {
        return false;
      }
      const otherFilters = new Set(Array.from(tagFilters).filter((tag) => tag !== "stable"));
      if (otherFilters.size === 0) {
        return true;
      }
      return !!this.tags?.size && Array.from(otherFilters).every((tag) => this.tags.has(tag));
    }
    return !!this.tags?.size && Array.from(tagFilters).every((tag) => this.tags.has(tag));
  }
  matchesScope(scope, isRemote) {
    const configTarget = URI.isUri(scope) ? ConfigurationTarget.WORKSPACE_FOLDER : scope;
    if (!this.setting.scope) {
      return true;
    }
    if (configTarget === ConfigurationTarget.APPLICATION) {
      return APPLICATION_SCOPES.includes(this.setting.scope);
    }
    if (configTarget === ConfigurationTarget.WORKSPACE_FOLDER) {
      return FOLDER_SCOPES.includes(this.setting.scope);
    }
    if (configTarget === ConfigurationTarget.WORKSPACE) {
      return WORKSPACE_SCOPES.includes(this.setting.scope);
    }
    if (configTarget === ConfigurationTarget.USER_REMOTE) {
      return REMOTE_MACHINE_SCOPES.includes(this.setting.scope) || USER_LOCAL_AND_REMOTE_SETTINGS.includes(this.setting.key);
    }
    if (configTarget === ConfigurationTarget.USER_LOCAL) {
      if (isRemote) {
        return LOCAL_MACHINE_SCOPES.includes(this.setting.scope) || USER_LOCAL_AND_REMOTE_SETTINGS.includes(this.setting.key);
      }
    }
    return true;
  }
  matchesAnyExtension(extensionFilters) {
    if (!extensionFilters || !extensionFilters.size) {
      return true;
    }
    if (!this.setting.extensionInfo) {
      return false;
    }
    return Array.from(extensionFilters).some((extensionId) => extensionId.toLowerCase() === this.setting.extensionInfo.id.toLowerCase());
  }
  matchesAnyFeature(featureFilters) {
    if (!featureFilters || !featureFilters.size) {
      return true;
    }
    if (this.setting.extensionInfo) {
      return false;
    }
    if (featureFilters.has("chat")) {
      const chatFeatures = tocData.children.find((child) => child.id === "chat");
      if (chatFeatures?.children) {
        const patterns = chatFeatures.children.flatMap((feature) => feature.settings ?? []).map((setting) => createSettingMatchRegExp(setting));
        if (patterns.some((pattern) => pattern.test(this.setting.key))) {
          return true;
        }
      }
    }
    const features = tocData.children.find((child) => child.id === "features");
    return Array.from(featureFilters).some((filter) => {
      if (features?.children) {
        const feature = features.children.find((feature2) => "features/" + filter === feature2.id);
        if (feature?.settings) {
          const patterns = feature.settings.map((setting) => createSettingMatchRegExp(setting));
          return patterns.some((pattern) => pattern.test(this.setting.key));
        } else {
          return false;
        }
      } else {
        return false;
      }
    });
  }
  matchesAnyId(idFilters) {
    if (!idFilters || !idFilters.size) {
      return true;
    }
    if (idFilters.has(this.setting.key)) {
      return true;
    }
    for (const filter of idFilters) {
      if (filter.endsWith("*")) {
        const prefix = filter.slice(0, -1);
        if (this.setting.key.startsWith(prefix)) {
          return true;
        }
      }
    }
    return false;
  }
  matchesAllLanguages(languageFilter) {
    if (!languageFilter) {
      return true;
    }
    if (!this.languageService.isRegisteredLanguageId(languageFilter)) {
      return false;
    }
    if (this.setting.scope === ConfigurationScope.LANGUAGE_OVERRIDABLE) {
      return true;
    }
    return false;
  }
};
_SettingsTreeSettingElement.MAX_DESC_LINES = 20;
let SettingsTreeSettingElement = _SettingsTreeSettingElement;
function createSettingMatchRegExp(pattern) {
  pattern = escapeRegExpCharacters(pattern).replace(/\\\*/g, ".*");
  return new RegExp(`^${pattern}$`, "i");
}
let SettingsTreeModel = class {
  constructor(_viewState, _isWorkspaceTrusted, _configurationService, _languageService, _userDataProfileService, _productService, _environmentService) {
    this._viewState = _viewState;
    this._isWorkspaceTrusted = _isWorkspaceTrusted;
    this._configurationService = _configurationService;
    this._languageService = _languageService;
    this._userDataProfileService = _userDataProfileService;
    this._productService = _productService;
    this._environmentService = _environmentService;
    this._treeElementsBySettingName = /* @__PURE__ */ new Map();
  }
  get root() {
    return this._root;
  }
  update(newTocRoot = this._tocRoot) {
    this._treeElementsBySettingName.clear();
    const newRoot = this.createSettingsTreeGroupElement(newTocRoot);
    if (newRoot.children[0] instanceof SettingsTreeGroupElement) {
      newRoot.children[0].isFirstGroup = true;
    }
    if (this._root) {
      this.disposeChildren(this._root.children);
      this._root.children = newRoot.children;
      newRoot.dispose();
    } else {
      this._root = newRoot;
    }
  }
  updateWorkspaceTrust(workspaceTrusted) {
    this._isWorkspaceTrusted = workspaceTrusted;
    this.updateRequireTrustedTargetElements();
  }
  disposeChildren(children) {
    for (const child of children) {
      this.disposeChildAndRecurse(child);
    }
  }
  disposeChildAndRecurse(element) {
    if (element instanceof SettingsTreeGroupElement) {
      this.disposeChildren(element.children);
    }
    element.dispose();
  }
  getElementsByName(name) {
    return this._treeElementsBySettingName.get(name) ?? null;
  }
  updateElementsByName(name) {
    if (!this._treeElementsBySettingName.has(name)) {
      return;
    }
    this.reinspectSettings(this._treeElementsBySettingName.get(name));
  }
  updateRequireTrustedTargetElements() {
    this.reinspectSettings([...this._treeElementsBySettingName.values()].flat().filter((s) => s.isUntrusted));
  }
  reinspectSettings(settings) {
    for (const element of settings) {
      element.inspectSelf();
    }
  }
  createSettingsTreeGroupElement(tocEntry, parent) {
    const depth = parent ? this.getDepth(parent) + 1 : 0;
    const element = new SettingsTreeGroupElement(tocEntry.id, void 0, tocEntry.label, depth, false);
    element.parent = parent;
    const children = [];
    if (tocEntry.settings) {
      const settingChildren = tocEntry.settings.map((s) => this.createSettingsTreeSettingElement(s, element));
      for (const child of settingChildren) {
        if (!child.setting.deprecationMessage) {
          children.push(child);
        } else {
          child.inspectSelf();
          if (child.isConfigured) {
            children.push(child);
          } else {
            child.dispose();
          }
        }
      }
    }
    if (tocEntry.children) {
      const groupChildren = tocEntry.children.map((child) => this.createSettingsTreeGroupElement(child, element));
      children.push(...groupChildren);
    }
    element.children = children;
    return element;
  }
  getDepth(element) {
    if (element.parent) {
      return 1 + this.getDepth(element.parent);
    } else {
      return 0;
    }
  }
  createSettingsTreeSettingElement(setting, parent) {
    const element = new SettingsTreeSettingElement(
      setting,
      parent,
      this._viewState.settingsTarget,
      this._isWorkspaceTrusted,
      this._viewState.languageFilter,
      this._languageService,
      this._productService,
      this._userDataProfileService,
      this._configurationService,
      this._environmentService.isSessionsWindow
    );
    const nameElements = this._treeElementsBySettingName.get(setting.key) ?? [];
    nameElements.push(element);
    this._treeElementsBySettingName.set(setting.key, nameElements);
    return element;
  }
  dispose() {
    this._treeElementsBySettingName.clear();
    this.disposeChildAndRecurse(this._root);
  }
};
SettingsTreeModel = __decorateClass([
  __decorateParam(2, IWorkbenchConfigurationService),
  __decorateParam(3, ILanguageService),
  __decorateParam(4, IUserDataProfileService),
  __decorateParam(5, IProductService),
  __decorateParam(6, IWorkbenchEnvironmentService)
], SettingsTreeModel);
function inspectSetting(key, target, languageFilter, configurationService) {
  const inspectOverrides = URI.isUri(target) ? { resource: target } : void 0;
  const inspected = configurationService.inspect(key, inspectOverrides);
  const targetSelector = target === ConfigurationTarget.APPLICATION ? "applicationValue" : target === ConfigurationTarget.USER_LOCAL ? "userLocalValue" : target === ConfigurationTarget.USER_REMOTE ? "userRemoteValue" : target === ConfigurationTarget.WORKSPACE ? "workspaceValue" : "workspaceFolderValue";
  const targetOverrideSelector = target === ConfigurationTarget.APPLICATION ? "application" : target === ConfigurationTarget.USER_LOCAL ? "userLocal" : target === ConfigurationTarget.USER_REMOTE ? "userRemote" : target === ConfigurationTarget.WORKSPACE ? "workspace" : "workspaceFolder";
  let isConfigured = typeof inspected[targetSelector] !== "undefined";
  const overrideIdentifiers = inspected.overrideIdentifiers;
  const inspectedLanguageOverrides = /* @__PURE__ */ new Map();
  if (languageFilter) {
    isConfigured = false;
  }
  if (overrideIdentifiers) {
    for (const overrideIdentifier of overrideIdentifiers) {
      inspectedLanguageOverrides.set(overrideIdentifier, configurationService.inspect(key, { overrideIdentifier }));
    }
    if (languageFilter) {
      if (inspectedLanguageOverrides.has(languageFilter)) {
        const overrideValue = inspectedLanguageOverrides.get(languageFilter)[targetOverrideSelector]?.override;
        if (typeof overrideValue !== "undefined") {
          isConfigured = true;
        }
      }
    }
  }
  return { isConfigured, inspected, targetSelector, inspectedLanguageOverrides, languageSelector: languageFilter };
}
function sanitizeId(id) {
  return id.replace(/[\.\/]/g, "_");
}
function settingKeyToDisplayFormat(key, groupId = "", isLanguageTagSetting = false) {
  const lastDotIdx = key.lastIndexOf(".");
  let category = "";
  if (lastDotIdx >= 0) {
    category = key.substring(0, lastDotIdx);
    key = key.substring(lastDotIdx + 1);
  }
  groupId = groupId.replace(/\//g, ".");
  category = trimCategoryForGroup(category, groupId);
  category = wordifyKey(category);
  if (isLanguageTagSetting) {
    key = getLanguageTagSettingPlainKey(key);
    key = "$(bracket) " + key;
  }
  const label = wordifyKey(key);
  return { category, label };
}
function trimCategoryForGroup(category, groupId) {
  const doTrim = (forward) => {
    if (!/insiders$/i.test(category)) {
      groupId = groupId.replace(/-?insiders$/i, "");
    }
    const parts = groupId.split(".").map((part) => {
      if (part.replace(/-/g, "").toLowerCase() === category.toLowerCase()) {
        return part.replace(/-/g, "");
      } else {
        return part;
      }
    });
    while (parts.length) {
      const reg = new RegExp(`^${parts.join("\\.")}(\\.|$)`, "i");
      if (reg.test(category)) {
        return category.replace(reg, "");
      }
      if (forward) {
        parts.pop();
      } else {
        parts.shift();
      }
    }
    return null;
  };
  let trimmed = doTrim(true);
  if (trimmed === null) {
    trimmed = doTrim(false);
  }
  if (trimmed === null) {
    trimmed = category;
  }
  return trimmed;
}
function isExtensionToggleSetting(setting, productService) {
  return ENABLE_EXTENSION_TOGGLE_SETTINGS && !!productService.extensionRecommendations && !!setting.displayExtensionId;
}
function isExcludeSetting(setting) {
  return setting.key === "files.exclude" || setting.key === "search.exclude" || setting.key === "workbench.localHistory.exclude" || setting.key === "explorer.autoRevealExclude" || setting.key === "files.readonlyExclude" || setting.key === "files.watcherExclude";
}
function isIncludeSetting(setting) {
  return setting.key === "files.readonlyInclude";
}
function objectSettingSupportsRemoveDefaultValue(key) {
  return key === "workbench.editor.customLabels.patterns";
}
function isSimpleType(type) {
  return type === "string" || type === "boolean" || type === "integer" || type === "number";
}
function getObjectRenderableSchemaType(schema, key) {
  const { type } = schema;
  if (Array.isArray(type)) {
    if (objectSettingSupportsRemoveDefaultValue(key) && type.length === 2) {
      if (type.includes("null") && (type.includes("string") || type.includes("boolean") || type.includes("integer") || type.includes("number"))) {
        return "simple";
      }
    }
    for (const t of type) {
      if (!isSimpleType(t)) {
        return false;
      }
    }
    return "complex";
  }
  if (isSimpleType(type)) {
    return "simple";
  }
  if (type === "array") {
    if (schema.items) {
      const itemSchemas = Array.isArray(schema.items) ? schema.items : [schema.items];
      for (const { type: type2 } of itemSchemas) {
        if (Array.isArray(type2)) {
          for (const t of type2) {
            if (!isSimpleType(t)) {
              return false;
            }
          }
          return "complex";
        }
        if (!isSimpleType(type2)) {
          return false;
        }
        return "complex";
      }
    }
    return false;
  }
  return false;
}
function getObjectSettingSchemaType({
  key,
  type,
  objectProperties,
  objectPatternProperties,
  objectAdditionalProperties
}) {
  if (type !== "object") {
    return false;
  }
  if (isUndefinedOrNull(objectProperties) && isUndefinedOrNull(objectPatternProperties) && isUndefinedOrNull(objectAdditionalProperties)) {
    return false;
  }
  if ((objectAdditionalProperties === true || objectAdditionalProperties === void 0) && !Object.keys(objectPatternProperties ?? {}).includes(".*")) {
    return false;
  }
  const schemas = [...Object.values(objectProperties ?? {}), ...Object.values(objectPatternProperties ?? {})];
  if (objectAdditionalProperties && typeof objectAdditionalProperties === "object") {
    schemas.push(objectAdditionalProperties);
  }
  let schemaType = "simple";
  for (const schema of schemas) {
    for (const subSchema of Array.isArray(schema.anyOf) ? schema.anyOf : [schema]) {
      const subSchemaType = getObjectRenderableSchemaType(subSchema, key);
      if (subSchemaType === false) {
        return false;
      }
      if (subSchemaType === "complex") {
        schemaType = "complex";
      }
    }
  }
  return schemaType;
}
function settingTypeEnumRenderable(_type) {
  const enumRenderableSettingTypes = ["string", "boolean", "null", "integer", "number"];
  const type = Array.isArray(_type) ? _type : [_type];
  return type.every((type2) => enumRenderableSettingTypes.includes(type2));
}
var SearchResultIdx = /* @__PURE__ */ ((SearchResultIdx2) => {
  SearchResultIdx2[SearchResultIdx2["Local"] = 0] = "Local";
  SearchResultIdx2[SearchResultIdx2["Remote"] = 1] = "Remote";
  SearchResultIdx2[SearchResultIdx2["NewExtensions"] = 2] = "NewExtensions";
  SearchResultIdx2[SearchResultIdx2["Embeddings"] = 3] = "Embeddings";
  SearchResultIdx2[SearchResultIdx2["AiSelected"] = 4] = "AiSelected";
  return SearchResultIdx2;
})(SearchResultIdx || {});
let SearchResultModel = class extends SettingsTreeModel {
  constructor(viewState, settingsOrderByTocIndex, isWorkspaceTrusted, configurationService, environmentService, languageService, userDataProfileService, productService) {
    super(viewState, isWorkspaceTrusted, configurationService, languageService, userDataProfileService, productService, environmentService);
    this.environmentService = environmentService;
    this.rawSearchResults = null;
    this.newExtensionSearchResults = null;
    this.searchResultCount = null;
    this.aiFilterEnabled = false;
    this.id = "searchResultModel";
    this.settingsOrderByTocIndex = settingsOrderByTocIndex;
    this.cachedUniqueSearchResults = /* @__PURE__ */ new Map();
    this.update({ id: "searchResultModel", label: "" });
  }
  set showAiResults(show) {
    this.aiFilterEnabled = show;
    this.updateChildren();
  }
  sortResults(filterMatches) {
    if (this.settingsOrderByTocIndex) {
      for (const match of filterMatches) {
        match.setting.internalOrder = this.settingsOrderByTocIndex.get(match.setting.key);
      }
    }
    if (!this._viewState.query) {
      return filterMatches.sort((a, b) => compareTwoNullableNumbers(a.setting.internalOrder, b.setting.internalOrder));
    }
    filterMatches.sort((a, b) => {
      if (a.matchType !== b.matchType) {
        return b.matchType - a.matchType;
      } else if (a.matchType & SettingMatchType.NonContiguousWordsInSettingsLabel || a.matchType & SettingMatchType.ContiguousWordsInSettingsLabel) {
        return b.keyMatchScore - a.keyMatchScore || compareTwoNullableNumbers(a.setting.internalOrder, b.setting.internalOrder);
      } else if (a.matchType === SettingMatchType.RemoteMatch) {
        return b.score - a.score;
      } else {
        return compareTwoNullableNumbers(a.setting.internalOrder, b.setting.internalOrder);
      }
    });
    return arrays.distinct(filterMatches, (match) => match.setting.key);
  }
  getUniqueSearchResults() {
    const cachedResults = this.cachedUniqueSearchResults.get(this.aiFilterEnabled);
    if (cachedResults) {
      return cachedResults;
    }
    if (!this.rawSearchResults) {
      return null;
    }
    let combinedFilterMatches = [];
    if (this.aiFilterEnabled) {
      const aiSelectedKeys = /* @__PURE__ */ new Set();
      const aiSelectedResult = this.rawSearchResults[4 /* AiSelected */];
      if (aiSelectedResult) {
        aiSelectedResult.filterMatches.forEach((m) => aiSelectedKeys.add(m.setting.key));
        combinedFilterMatches = aiSelectedResult.filterMatches;
      }
      const embeddingsResult = this.rawSearchResults[3 /* Embeddings */];
      if (embeddingsResult) {
        embeddingsResult.filterMatches = embeddingsResult.filterMatches.filter((m) => !aiSelectedKeys.has(m.setting.key));
        combinedFilterMatches = combinedFilterMatches.concat(embeddingsResult.filterMatches);
      }
      const result2 = {
        filterMatches: combinedFilterMatches,
        exactMatch: false
      };
      this.cachedUniqueSearchResults.set(true, result2);
      return result2;
    }
    const localMatchKeys = /* @__PURE__ */ new Set();
    const localResult = this.rawSearchResults[0 /* Local */];
    if (localResult) {
      localResult.filterMatches.forEach((m) => localMatchKeys.add(m.setting.key));
      combinedFilterMatches = localResult.filterMatches;
    }
    const remoteResult = this.rawSearchResults[1 /* Remote */];
    if (remoteResult) {
      remoteResult.filterMatches = remoteResult.filterMatches.filter((m) => !localMatchKeys.has(m.setting.key));
      combinedFilterMatches = combinedFilterMatches.concat(remoteResult.filterMatches);
      this.newExtensionSearchResults = this.rawSearchResults[2 /* NewExtensions */];
    }
    combinedFilterMatches = this.sortResults(combinedFilterMatches);
    const result = {
      filterMatches: combinedFilterMatches,
      exactMatch: localResult.exactMatch
      // remote results should never have an exact match
    };
    this.cachedUniqueSearchResults.set(false, result);
    return result;
  }
  getRawResults() {
    return this.rawSearchResults ?? [];
  }
  getUniqueSearchResultSettings() {
    return this.getUniqueSearchResults()?.filterMatches.map((m) => m.setting) ?? [];
  }
  updateChildren() {
    this.update({
      id: "searchResultModel",
      label: "searchResultModel",
      settings: this.getUniqueSearchResultSettings()
    });
    const isRemote = !!this.environmentService.remoteAuthority;
    const newChildren = [];
    for (const child of this.root.children) {
      if (child instanceof SettingsTreeSettingElement && child.matchesAllTags(this._viewState.tagFilters) && child.matchesScope(this._viewState.settingsTarget, isRemote) && child.matchesAnyExtension(this._viewState.extensionFilters) && child.matchesAnyId(this._viewState.idFilters) && child.matchesAnyFeature(this._viewState.featureFilters) && child.matchesAllLanguages(this._viewState.languageFilter)) {
        newChildren.push(child);
      } else {
        child.dispose();
      }
    }
    this.root.children = newChildren;
    this.searchResultCount = this.root.children.length;
    if (this.newExtensionSearchResults?.filterMatches.length) {
      let resultExtensionIds = this.newExtensionSearchResults.filterMatches.map((result) => result.setting).filter((setting) => setting.extensionName && setting.extensionPublisher).map((setting) => `${setting.extensionPublisher}.${setting.extensionName}`);
      resultExtensionIds = arrays.distinct(resultExtensionIds);
      if (resultExtensionIds.length) {
        const newExtElement = new SettingsTreeNewExtensionsElement("newExtensions", resultExtensionIds);
        newExtElement.parent = this._root;
        this._root.children.push(newExtElement);
      }
    }
  }
  setResult(order, result) {
    this.cachedUniqueSearchResults.clear();
    this.newExtensionSearchResults = null;
    if (this.rawSearchResults && order === 0 /* Local */) {
      delete this.rawSearchResults[1 /* Remote */];
    }
    this.rawSearchResults ??= [];
    if (!result) {
      delete this.rawSearchResults[order];
      return;
    }
    this.rawSearchResults[order] = result;
    this.updateChildren();
  }
  getUniqueResultsCount() {
    return this.searchResultCount ?? 0;
  }
};
SearchResultModel = __decorateClass([
  __decorateParam(3, IWorkbenchConfigurationService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, ILanguageService),
  __decorateParam(6, IUserDataProfileService),
  __decorateParam(7, IProductService)
], SearchResultModel);
const tagRegex = /(^|\s)@tag:("([^"]*)"|[^"]\S*)/g;
const extensionRegex = /(^|\s)@ext:("([^"]*)"|[^"]\S*)?/g;
const featureRegex = /(^|\s)@feature:("([^"]*)"|[^"]\S*)?/g;
const idRegex = /(^|\s)@id:("([^"]*)"|[^"]\S*)?/g;
const languageRegex = /(^|\s)@lang:("([^"]*)"|[^"]\S*)?/g;
function parseQuery(query) {
  function getTagsForType(query2, filterRegex, parsedParts) {
    return query2.replace(filterRegex, (_, __, quotedParsedElement, unquotedParsedElement) => {
      const parsedElement = unquotedParsedElement || quotedParsedElement;
      if (parsedElement) {
        parsedParts.push(...parsedElement.split(",").map((s) => s.trim()).filter((s) => !isFalsyOrWhitespace(s)));
      }
      return "";
    });
  }
  const tags = [];
  query = query.replace(tagRegex, (_, __, quotedTag, tag) => {
    tags.push(tag || quotedTag);
    return "";
  });
  query = query.replace(`@${MODIFIED_SETTING_TAG}`, () => {
    tags.push(MODIFIED_SETTING_TAG);
    return "";
  });
  query = query.replace(`@${POLICY_SETTING_TAG}`, () => {
    tags.push(POLICY_SETTING_TAG);
    return "";
  });
  query = query.replace(`@${AGENTS_WINDOW_SETTING_TAG}`, () => {
    tags.push(AGENTS_WINDOW_SETTING_TAG);
    return "";
  });
  query = query.replace(/@stable/g, () => {
    tags.push("stable");
    return "";
  });
  const extensions = [];
  const features = [];
  const ids = [];
  const langs = [];
  query = getTagsForType(query, extensionRegex, extensions);
  query = getTagsForType(query, featureRegex, features);
  query = getTagsForType(query, idRegex, ids);
  if (ENABLE_LANGUAGE_FILTER) {
    query = getTagsForType(query, languageRegex, langs);
  }
  query = query.trim();
  return {
    tags,
    extensionFilters: extensions,
    featureFilters: features,
    idFilters: ids,
    languageFilter: langs.length ? langs[0] : void 0,
    query
  };
}
export {
  ONLINE_SERVICES_SETTING_TAG,
  SearchResultIdx,
  SearchResultModel,
  SettingsTreeElement,
  SettingsTreeGroupElement,
  SettingsTreeModel,
  SettingsTreeNewExtensionsElement,
  SettingsTreeSettingElement,
  inspectSetting,
  objectSettingSupportsRemoveDefaultValue,
  parseQuery,
  sanitizeId,
  settingKeyToDisplayFormat
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIvc2V0dGluZ3NUcmVlTW9kZWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXJyYXlzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMsIGlzRmFsc3lPcldoaXRlc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGlzVW5kZWZpbmVkT3JOdWxsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBnZXRMYW5ndWFnZVRhZ1NldHRpbmdQbGFpbktleSwgSUNvbmZpZ3VyYXRpb25WYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkRlZmF1bHRWYWx1ZVNvdXJjZSwgQ29uZmlndXJhdGlvblNjb3BlLCBFZGl0UHJlc2VudGF0aW9uVHlwZXMsIEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVNFUl9MT0NBTF9BTkRfUkVNT1RFX1NFVFRJTkdTIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBBUFBMSUNBVElPTl9TQ09QRVMsIEZPTERFUl9TQ09QRVMsIElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSwgTE9DQUxfTUFDSElORV9TQ09QRVMsIFJFTU9URV9NQUNISU5FX1NDT1BFUywgV09SS1NQQUNFX1NDT1BFUyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNldHRpbmcsIElTZWFyY2hSZXN1bHQsIElTZXR0aW5nLCBJU2V0dGluZ01hdGNoLCBTZXR0aW5nTWF0Y2hUeXBlLCBTZXR0aW5nVmFsdWVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgQUdFTlRTX1dJTkRPV19TRVRUSU5HX1RBRywgRU5BQkxFX0VYVEVOU0lPTl9UT0dHTEVfU0VUVElOR1MsIEVOQUJMRV9MQU5HVUFHRV9GSUxURVIsIE1PRElGSUVEX1NFVFRJTkdfVEFHLCBQT0xJQ1lfU0VUVElOR19UQUcsIFJFUVVJUkVfVFJVU1RFRF9XT1JLU1BBQ0VfU0VUVElOR19UQUcsIGNvbXBhcmVUd29OdWxsYWJsZU51bWJlcnMsIHdvcmRpZnlLZXkgfSBmcm9tICcuLi9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgU2V0dGluZ3NUYXJnZXQgfSBmcm9tICcuL3ByZWZlcmVuY2VzV2lkZ2V0cy5qcyc7XG5pbXBvcnQgeyBJVE9DRW50cnksIHRvY0RhdGEgfSBmcm9tICcuL3NldHRpbmdzTGF5b3V0LmpzJztcblxuZXhwb3J0IGNvbnN0IE9OTElORV9TRVJWSUNFU19TRVRUSU5HX1RBRyA9ICd1c2VzT25saW5lU2VydmljZXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZXR0aW5nc0VkaXRvclZpZXdTdGF0ZSB7XG5cdHNldHRpbmdzVGFyZ2V0OiBTZXR0aW5nc1RhcmdldDtcblx0cXVlcnk/OiBzdHJpbmc7IC8vIHVzZWQgdG8ga2VlcCB0cmFjayBvZiBsb2FkaW5nIGZyb20gc2V0SW5wdXQgdnMgbG9hZGluZyBmcm9tIGNhY2hlXG5cdHRhZ0ZpbHRlcnM/OiBTZXQ8c3RyaW5nPjtcblx0ZXh0ZW5zaW9uRmlsdGVycz86IFNldDxzdHJpbmc+O1xuXHRmZWF0dXJlRmlsdGVycz86IFNldDxzdHJpbmc+O1xuXHRpZEZpbHRlcnM/OiBTZXQ8c3RyaW5nPjtcblx0bGFuZ3VhZ2VGaWx0ZXI/OiBzdHJpbmc7XG5cdGNhdGVnb3J5RmlsdGVyPzogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50O1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgU2V0dGluZ3NUcmVlRWxlbWVudCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRpZDogc3RyaW5nO1xuXHRwYXJlbnQ/OiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBfdGFiYmFibGUgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRhYmJhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGdldCBvbkRpZENoYW5nZVRhYmJhYmxlKCkgeyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VUYWJiYWJsZS5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKF9pZDogc3RyaW5nKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmlkID0gX2lkO1xuXHR9XG5cblx0Z2V0IHRhYmJhYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl90YWJiYWJsZTtcblx0fVxuXG5cdHNldCB0YWJiYWJsZSh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX3RhYmJhYmxlID0gdmFsdWU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VUYWJiYWJsZS5maXJlKCk7XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgU2V0dGluZ3NUcmVlR3JvdXBDaGlsZCA9IChTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQgfCBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCB8IFNldHRpbmdzVHJlZU5ld0V4dGVuc2lvbnNFbGVtZW50KTtcblxuZXhwb3J0IGNsYXNzIFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCBleHRlbmRzIFNldHRpbmdzVHJlZUVsZW1lbnQge1xuXHRjb3VudD86IG51bWJlcjtcblx0bGFiZWw6IHN0cmluZztcblx0bGV2ZWw6IG51bWJlcjtcblx0aXNGaXJzdEdyb3VwOiBib29sZWFuO1xuXG5cdHByaXZhdGUgX2NoaWxkU2V0dGluZ0tleXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXHRwcml2YXRlIF9jaGlsZHJlbjogU2V0dGluZ3NUcmVlR3JvdXBDaGlsZFtdID0gW107XG5cblx0Z2V0IGNoaWxkcmVuKCk6IFNldHRpbmdzVHJlZUdyb3VwQ2hpbGRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoaWxkcmVuO1xuXHR9XG5cblx0c2V0IGNoaWxkcmVuKG5ld0NoaWxkcmVuOiBTZXR0aW5nc1RyZWVHcm91cENoaWxkW10pIHtcblx0XHR0aGlzLl9jaGlsZHJlbiA9IG5ld0NoaWxkcmVuO1xuXG5cdFx0dGhpcy5fY2hpbGRTZXR0aW5nS2V5cyA9IG5ldyBTZXQoKTtcblx0XHR0aGlzLl9jaGlsZHJlbi5mb3JFYWNoKGNoaWxkID0+IHtcblx0XHRcdGlmIChjaGlsZCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuX2NoaWxkU2V0dGluZ0tleXMuYWRkKGNoaWxkLnNldHRpbmcua2V5KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKF9pZDogc3RyaW5nLCBjb3VudDogbnVtYmVyIHwgdW5kZWZpbmVkLCBsYWJlbDogc3RyaW5nLCBsZXZlbDogbnVtYmVyLCBpc0ZpcnN0R3JvdXA6IGJvb2xlYW4pIHtcblx0XHRzdXBlcihfaWQpO1xuXG5cdFx0dGhpcy5jb3VudCA9IGNvdW50O1xuXHRcdHRoaXMubGFiZWwgPSBsYWJlbDtcblx0XHR0aGlzLmxldmVsID0gbGV2ZWw7XG5cdFx0dGhpcy5pc0ZpcnN0R3JvdXAgPSBpc0ZpcnN0R3JvdXA7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoaXMgZ3JvdXAgY29udGFpbnMgdGhlIGdpdmVuIGNoaWxkIGtleSAodG8gYSBkZXB0aCBvZiAxIG9ubHkpXG5cdCAqL1xuXHRjb250YWluc1NldHRpbmcoa2V5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hpbGRTZXR0aW5nS2V5cy5oYXMoa2V5KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NUcmVlTmV3RXh0ZW5zaW9uc0VsZW1lbnQgZXh0ZW5kcyBTZXR0aW5nc1RyZWVFbGVtZW50IHtcblx0Y29uc3RydWN0b3IoX2lkOiBzdHJpbmcsIHB1YmxpYyByZWFkb25seSBleHRlbnNpb25JZHM6IHN0cmluZ1tdKSB7XG5cdFx0c3VwZXIoX2lkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQgZXh0ZW5kcyBTZXR0aW5nc1RyZWVFbGVtZW50IHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0RFU0NfTElORVMgPSAyMDtcblxuXHRzZXR0aW5nOiBJU2V0dGluZztcblxuXHRwcml2YXRlIF9kaXNwbGF5Q2F0ZWdvcnk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9kaXNwbGF5TGFiZWw6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5cdC8qKlxuXHQgKiBzY29wZVZhbHVlIHx8IGRlZmF1bHRWYWx1ZSwgZm9yIHJlbmRlcmluZyBjb252ZW5pZW5jZS5cblx0ICovXG5cdHZhbHVlOiBhbnk7XG5cblx0LyoqXG5cdCAqIFRoZSB2YWx1ZSBpbiB0aGUgY3VycmVudCBzZXR0aW5ncyBzY29wZS5cblx0ICovXG5cdHNjb3BlVmFsdWU6IGFueTtcblxuXHQvKipcblx0ICogVGhlIGRlZmF1bHQgdmFsdWVcblx0ICovXG5cdGRlZmF1bHRWYWx1ZT86IGFueTtcblxuXHQvKipcblx0ICogVGhlIHNvdXJjZSBvZiB0aGUgZGVmYXVsdCB2YWx1ZSB0byBkaXNwbGF5LlxuXHQgKiBUaGlzIHZhbHVlIGFsc28gYWNjb3VudHMgZm9yIGV4dGVuc2lvbi1jb250cmlidXRlZCBsYW5ndWFnZS1zcGVjaWZpYyBkZWZhdWx0IHZhbHVlIG92ZXJyaWRlcy5cblx0ICovXG5cdGRlZmF1bHRWYWx1ZVNvdXJjZTogQ29uZmlndXJhdGlvbkRlZmF1bHRWYWx1ZVNvdXJjZSB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgc2V0dGluZyBpcyBjb25maWd1cmVkIGluIHRoZSBzZWxlY3RlZCBzY29wZS5cblx0ICovXG5cdGlzQ29uZmlndXJlZCA9IGZhbHNlO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBzZXR0aW5nIHJlcXVpcmVzIHRydXN0ZWQgdGFyZ2V0XG5cdCAqL1xuXHRpc1VudHJ1c3RlZCA9IGZhbHNlO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBzZXR0aW5nIGlzIHVuZGVyIGEgcG9saWN5IHRoYXQgYmxvY2tzIGFsbCBjaGFuZ2VzLlxuXHQgKi9cblx0aGFzUG9saWN5VmFsdWUgPSBmYWxzZTtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgc2V0dGluZyBpcyByZWFkLW9ubHkgaW4gdGhlIEFnZW50cyB3aW5kb3cuXG5cdCAqL1xuXHRpc0FnZW50c1dpbmRvd1JlYWRPbmx5ID0gZmFsc2U7XG5cblx0dGFncz86IFNldDxzdHJpbmc+O1xuXHRvdmVycmlkZGVuU2NvcGVMaXN0OiBzdHJpbmdbXSA9IFtdO1xuXHRvdmVycmlkZGVuRGVmYXVsdHNMYW5ndWFnZUxpc3Q6IHN0cmluZ1tdID0gW107XG5cblx0LyoqXG5cdCAqIEZvciBlYWNoIGxhbmd1YWdlIHRoYXQgY29udHJpYnV0ZXMgc2V0dGluZyB2YWx1ZXMgb3IgZGVmYXVsdCBvdmVycmlkZXMsIHdlIGNhbiBzZWUgdGhvc2UgdmFsdWVzIGhlcmUuXG5cdCAqL1xuXHRsYW5ndWFnZU92ZXJyaWRlVmFsdWVzOiBNYXA8c3RyaW5nLCBJQ29uZmlndXJhdGlvblZhbHVlPHVua25vd24+PiA9IG5ldyBNYXA8c3RyaW5nLCBJQ29uZmlndXJhdGlvblZhbHVlPHVua25vd24+PigpO1xuXG5cdGRlc2NyaXB0aW9uITogc3RyaW5nO1xuXHR2YWx1ZVR5cGUhOiBTZXR0aW5nVmFsdWVUeXBlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHNldHRpbmc6IElTZXR0aW5nLFxuXHRcdHBhcmVudDogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50LFxuXHRcdHJlYWRvbmx5IHNldHRpbmdzVGFyZ2V0OiBTZXR0aW5nc1RhcmdldCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlzV29ya3NwYWNlVHJ1c3RlZDogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmlsdGVyOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaXNTZXNzaW9uc1dpbmRvdzogYm9vbGVhbixcblx0KSB7XG5cdFx0c3VwZXIoc2FuaXRpemVJZChwYXJlbnQuaWQgKyAnXycgKyBzZXR0aW5nLmtleSkpO1xuXHRcdHRoaXMuc2V0dGluZyA9IHNldHRpbmc7XG5cdFx0dGhpcy5wYXJlbnQgPSBwYXJlbnQ7XG5cblx0XHQvLyBNYWtlIHN1cmUgZGVzY3JpcHRpb24gYW5kIHZhbHVlVHlwZSBhcmUgaW5pdGlhbGl6ZWRcblx0XHR0aGlzLmluaXRTZXR0aW5nRGVzY3JpcHRpb24oKTtcblx0XHR0aGlzLmluaXRTZXR0aW5nVmFsdWVUeXBlKCk7XG5cdH1cblxuXHRnZXQgZGlzcGxheUNhdGVnb3J5KCk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLl9kaXNwbGF5Q2F0ZWdvcnkpIHtcblx0XHRcdHRoaXMuaW5pdExhYmVscygpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9kaXNwbGF5Q2F0ZWdvcnkhO1xuXHR9XG5cblx0Z2V0IGRpc3BsYXlMYWJlbCgpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fZGlzcGxheUxhYmVsKSB7XG5cdFx0XHR0aGlzLmluaXRMYWJlbHMoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZGlzcGxheUxhYmVsITtcblx0fVxuXG5cdHByaXZhdGUgaW5pdExhYmVscygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zZXR0aW5nLnRpdGxlKSB7XG5cdFx0XHR0aGlzLl9kaXNwbGF5TGFiZWwgPSB0aGlzLnNldHRpbmcudGl0bGU7XG5cdFx0XHR0aGlzLl9kaXNwbGF5Q2F0ZWdvcnkgPSB0aGlzLnNldHRpbmcuY2F0ZWdvcnlMYWJlbCA/PyBudWxsO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkaXNwbGF5S2V5Rm9ybWF0ID0gc2V0dGluZ0tleVRvRGlzcGxheUZvcm1hdCh0aGlzLnNldHRpbmcua2V5LCB0aGlzLnBhcmVudCEuaWQsIHRoaXMuc2V0dGluZy5pc0xhbmd1YWdlVGFnU2V0dGluZyk7XG5cdFx0dGhpcy5fZGlzcGxheUxhYmVsID0gZGlzcGxheUtleUZvcm1hdC5sYWJlbDtcblx0XHR0aGlzLl9kaXNwbGF5Q2F0ZWdvcnkgPSBkaXNwbGF5S2V5Rm9ybWF0LmNhdGVnb3J5O1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0U2V0dGluZ0Rlc2NyaXB0aW9uKCkge1xuXHRcdGlmICh0aGlzLnNldHRpbmcuZGVzY3JpcHRpb24ubGVuZ3RoID4gU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQuTUFYX0RFU0NfTElORVMpIHtcblx0XHRcdGNvbnN0IHRydW5jYXRlZERlc2NMaW5lcyA9IHRoaXMuc2V0dGluZy5kZXNjcmlwdGlvbi5zbGljZSgwLCBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudC5NQVhfREVTQ19MSU5FUyk7XG5cdFx0XHR0cnVuY2F0ZWREZXNjTGluZXMucHVzaCgnWy4uLl0nKTtcblx0XHRcdHRoaXMuZGVzY3JpcHRpb24gPSB0cnVuY2F0ZWREZXNjTGluZXMuam9pbignXFxuJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZGVzY3JpcHRpb24gPSB0aGlzLnNldHRpbmcuZGVzY3JpcHRpb24uam9pbignXFxuJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpbml0U2V0dGluZ1ZhbHVlVHlwZSgpIHtcblx0XHRpZiAoaXNFeHRlbnNpb25Ub2dnbGVTZXR0aW5nKHRoaXMuc2V0dGluZywgdGhpcy5wcm9kdWN0U2VydmljZSkpIHtcblx0XHRcdHRoaXMudmFsdWVUeXBlID0gU2V0dGluZ1ZhbHVlVHlwZS5FeHRlbnNpb25Ub2dnbGU7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNldHRpbmcuZW51bSAmJiAoIXRoaXMuc2V0dGluZy50eXBlIHx8IHNldHRpbmdUeXBlRW51bVJlbmRlcmFibGUodGhpcy5zZXR0aW5nLnR5cGUpKSkge1xuXHRcdFx0dGhpcy52YWx1ZVR5cGUgPSBTZXR0aW5nVmFsdWVUeXBlLkVudW07XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNldHRpbmcudHlwZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGlmICh0aGlzLnNldHRpbmcuZWRpdFByZXNlbnRhdGlvbiA9PT0gRWRpdFByZXNlbnRhdGlvblR5cGVzLk11bHRpbGluZSkge1xuXHRcdFx0XHR0aGlzLnZhbHVlVHlwZSA9IFNldHRpbmdWYWx1ZVR5cGUuTXVsdGlsaW5lU3RyaW5nO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy52YWx1ZVR5cGUgPSBTZXR0aW5nVmFsdWVUeXBlLlN0cmluZztcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzRXhjbHVkZVNldHRpbmcodGhpcy5zZXR0aW5nKSkge1xuXHRcdFx0dGhpcy52YWx1ZVR5cGUgPSBTZXR0aW5nVmFsdWVUeXBlLkV4Y2x1ZGU7XG5cdFx0fSBlbHNlIGlmIChpc0luY2x1ZGVTZXR0aW5nKHRoaXMuc2V0dGluZykpIHtcblx0XHRcdHRoaXMudmFsdWVUeXBlID0gU2V0dGluZ1ZhbHVlVHlwZS5JbmNsdWRlO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zZXR0aW5nLnR5cGUgPT09ICdpbnRlZ2VyJykge1xuXHRcdFx0dGhpcy52YWx1ZVR5cGUgPSBTZXR0aW5nVmFsdWVUeXBlLkludGVnZXI7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNldHRpbmcudHlwZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMudmFsdWVUeXBlID0gU2V0dGluZ1ZhbHVlVHlwZS5OdW1iZXI7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNldHRpbmcudHlwZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR0aGlzLnZhbHVlVHlwZSA9IFNldHRpbmdWYWx1ZVR5cGUuQm9vbGVhbjtcblx0XHR9IGVsc2UgaWYgKHRoaXMuc2V0dGluZy50eXBlID09PSAnYXJyYXknICYmIHRoaXMuc2V0dGluZy5hcnJheUl0ZW1UeXBlICYmXG5cdFx0XHRbJ3N0cmluZycsICdlbnVtJywgJ251bWJlcicsICdpbnRlZ2VyJ10uaW5jbHVkZXModGhpcy5zZXR0aW5nLmFycmF5SXRlbVR5cGUpKSB7XG5cdFx0XHR0aGlzLnZhbHVlVHlwZSA9IFNldHRpbmdWYWx1ZVR5cGUuQXJyYXk7XG5cdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHRoaXMuc2V0dGluZy50eXBlKSAmJiB0aGlzLnNldHRpbmcudHlwZS5pbmNsdWRlcyhTZXR0aW5nVmFsdWVUeXBlLk51bGwpICYmIHRoaXMuc2V0dGluZy50eXBlLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0aWYgKHRoaXMuc2V0dGluZy50eXBlLmluY2x1ZGVzKFNldHRpbmdWYWx1ZVR5cGUuSW50ZWdlcikpIHtcblx0XHRcdFx0dGhpcy52YWx1ZVR5cGUgPSBTZXR0aW5nVmFsdWVUeXBlLk51bGxhYmxlSW50ZWdlcjtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5zZXR0aW5nLnR5cGUuaW5jbHVkZXMoU2V0dGluZ1ZhbHVlVHlwZS5OdW1iZXIpKSB7XG5cdFx0XHRcdHRoaXMudmFsdWVUeXBlID0gU2V0dGluZ1ZhbHVlVHlwZS5OdWxsYWJsZU51bWJlcjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudmFsdWVUeXBlID0gU2V0dGluZ1ZhbHVlVHlwZS5Db21wbGV4O1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzY2hlbWFUeXBlID0gZ2V0T2JqZWN0U2V0dGluZ1NjaGVtYVR5cGUodGhpcy5zZXR0aW5nKTtcblx0XHRcdGlmIChzY2hlbWFUeXBlKSB7XG5cdFx0XHRcdGlmICh0aGlzLnNldHRpbmcuYWxsS2V5c0FyZUJvb2xlYW4pIHtcblx0XHRcdFx0XHR0aGlzLnZhbHVlVHlwZSA9IFNldHRpbmdWYWx1ZVR5cGUuQm9vbGVhbk9iamVjdDtcblx0XHRcdFx0fSBlbHNlIGlmIChzY2hlbWFUeXBlID09PSAnc2ltcGxlJykge1xuXHRcdFx0XHRcdHRoaXMudmFsdWVUeXBlID0gU2V0dGluZ1ZhbHVlVHlwZS5PYmplY3Q7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy52YWx1ZVR5cGUgPSBTZXR0aW5nVmFsdWVUeXBlLkNvbXBsZXhPYmplY3Q7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodGhpcy5zZXR0aW5nLmlzTGFuZ3VhZ2VUYWdTZXR0aW5nKSB7XG5cdFx0XHRcdHRoaXMudmFsdWVUeXBlID0gU2V0dGluZ1ZhbHVlVHlwZS5MYW5ndWFnZVRhZztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudmFsdWVUeXBlID0gU2V0dGluZ1ZhbHVlVHlwZS5Db21wbGV4O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGluc3BlY3RTZWxmKCkge1xuXHRcdGNvbnN0IHRhcmdldFRvSW5zcGVjdCA9IHRoaXMuZ2V0VGFyZ2V0VG9JbnNwZWN0KHRoaXMuc2V0dGluZyk7XG5cdFx0Y29uc3QgaW5zcGVjdFJlc3VsdCA9IGluc3BlY3RTZXR0aW5nKHRoaXMuc2V0dGluZy5rZXksIHRhcmdldFRvSW5zcGVjdCwgdGhpcy5sYW5ndWFnZUZpbHRlciwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy51cGRhdGUoaW5zcGVjdFJlc3VsdCwgdGhpcy5pc1dvcmtzcGFjZVRydXN0ZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUYXJnZXRUb0luc3BlY3Qoc2V0dGluZzogSVNldHRpbmcpOiBTZXR0aW5nc1RhcmdldCB7XG5cdFx0aWYgKCF0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaXNEZWZhdWx0ICYmICF0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUudXNlRGVmYXVsdEZsYWdzPy5zZXR0aW5ncykge1xuXHRcdFx0aWYgKHNldHRpbmcuc2NvcGUgPT09IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTikge1xuXHRcdFx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5BUFBMSUNBVElPTjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmlzU2V0dGluZ0FwcGxpZWRGb3JBbGxQcm9maWxlcyhzZXR0aW5nLmtleSkgJiYgdGhpcy5zZXR0aW5nc1RhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKSB7XG5cdFx0XHRcdHJldHVybiBDb25maWd1cmF0aW9uVGFyZ2V0LkFQUExJQ0FUSU9OO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5zZXR0aW5nc1RhcmdldDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKGluc3BlY3RSZXN1bHQ6IElJbnNwZWN0UmVzdWx0LCBpc1dvcmtzcGFjZVRydXN0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRsZXQgeyBpc0NvbmZpZ3VyZWQsIGluc3BlY3RlZCwgdGFyZ2V0U2VsZWN0b3IsIGluc3BlY3RlZExhbmd1YWdlT3ZlcnJpZGVzLCBsYW5ndWFnZVNlbGVjdG9yIH0gPSBpbnNwZWN0UmVzdWx0O1xuXG5cdFx0c3dpdGNoICh0YXJnZXRTZWxlY3Rvcikge1xuXHRcdFx0Y2FzZSAnd29ya3NwYWNlRm9sZGVyVmFsdWUnOlxuXHRcdFx0Y2FzZSAnd29ya3NwYWNlVmFsdWUnOlxuXHRcdFx0XHR0aGlzLmlzVW50cnVzdGVkID0gISF0aGlzLnNldHRpbmcucmVzdHJpY3RlZCAmJiAhaXNXb3Jrc3BhY2VUcnVzdGVkO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRsZXQgZGlzcGxheVZhbHVlID0gaXNDb25maWd1cmVkID8gaW5zcGVjdGVkW3RhcmdldFNlbGVjdG9yXSA6IGluc3BlY3RlZC5kZWZhdWx0VmFsdWU7XG5cdFx0Y29uc3Qgb3ZlcnJpZGRlblNjb3BlTGlzdDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBvdmVycmlkZGVuRGVmYXVsdHNMYW5ndWFnZUxpc3Q6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKChsYW5ndWFnZVNlbGVjdG9yIHx8IHRhcmdldFNlbGVjdG9yICE9PSAnd29ya3NwYWNlVmFsdWUnKSAmJiB0eXBlb2YgaW5zcGVjdGVkLndvcmtzcGFjZVZhbHVlICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0b3ZlcnJpZGRlblNjb3BlTGlzdC5wdXNoKCd3b3Jrc3BhY2U6Jyk7XG5cdFx0fVxuXHRcdGlmICgobGFuZ3VhZ2VTZWxlY3RvciB8fCB0YXJnZXRTZWxlY3RvciAhPT0gJ3VzZXJSZW1vdGVWYWx1ZScpICYmIHR5cGVvZiBpbnNwZWN0ZWQudXNlclJlbW90ZVZhbHVlICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0b3ZlcnJpZGRlblNjb3BlTGlzdC5wdXNoKCdyZW1vdGU6Jyk7XG5cdFx0fVxuXHRcdGlmICgobGFuZ3VhZ2VTZWxlY3RvciB8fCB0YXJnZXRTZWxlY3RvciAhPT0gJ3VzZXJMb2NhbFZhbHVlJykgJiYgdHlwZW9mIGluc3BlY3RlZC51c2VyTG9jYWxWYWx1ZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdG92ZXJyaWRkZW5TY29wZUxpc3QucHVzaCgndXNlcjonKTtcblx0XHR9XG5cblx0XHRpZiAoaW5zcGVjdGVkLm92ZXJyaWRlSWRlbnRpZmllcnMpIHtcblx0XHRcdGZvciAoY29uc3Qgb3ZlcnJpZGVJZGVudGlmaWVyIG9mIGluc3BlY3RlZC5vdmVycmlkZUlkZW50aWZpZXJzKSB7XG5cdFx0XHRcdGNvbnN0IGluc3BlY3RlZE92ZXJyaWRlID0gaW5zcGVjdGVkTGFuZ3VhZ2VPdmVycmlkZXMuZ2V0KG92ZXJyaWRlSWRlbnRpZmllcik7XG5cdFx0XHRcdGlmIChpbnNwZWN0ZWRPdmVycmlkZSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLmxhbmd1YWdlU2VydmljZS5pc1JlZ2lzdGVyZWRMYW5ndWFnZUlkKG92ZXJyaWRlSWRlbnRpZmllcikpIHtcblx0XHRcdFx0XHRcdGlmIChsYW5ndWFnZVNlbGVjdG9yICE9PSBvdmVycmlkZUlkZW50aWZpZXIgJiYgdHlwZW9mIGluc3BlY3RlZE92ZXJyaWRlLmRlZmF1bHQ/Lm92ZXJyaWRlICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdFx0XHRvdmVycmlkZGVuRGVmYXVsdHNMYW5ndWFnZUxpc3QucHVzaChvdmVycmlkZUlkZW50aWZpZXIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKChsYW5ndWFnZVNlbGVjdG9yICE9PSBvdmVycmlkZUlkZW50aWZpZXIgfHwgdGFyZ2V0U2VsZWN0b3IgIT09ICd3b3Jrc3BhY2VWYWx1ZScpICYmIHR5cGVvZiBpbnNwZWN0ZWRPdmVycmlkZS53b3Jrc3BhY2U/Lm92ZXJyaWRlICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdFx0XHRvdmVycmlkZGVuU2NvcGVMaXN0LnB1c2goYHdvcmtzcGFjZToke292ZXJyaWRlSWRlbnRpZmllcn1gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICgobGFuZ3VhZ2VTZWxlY3RvciAhPT0gb3ZlcnJpZGVJZGVudGlmaWVyIHx8IHRhcmdldFNlbGVjdG9yICE9PSAndXNlclJlbW90ZVZhbHVlJykgJiYgdHlwZW9mIGluc3BlY3RlZE92ZXJyaWRlLnVzZXJSZW1vdGU/Lm92ZXJyaWRlICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdFx0XHRvdmVycmlkZGVuU2NvcGVMaXN0LnB1c2goYHJlbW90ZToke292ZXJyaWRlSWRlbnRpZmllcn1gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICgobGFuZ3VhZ2VTZWxlY3RvciAhPT0gb3ZlcnJpZGVJZGVudGlmaWVyIHx8IHRhcmdldFNlbGVjdG9yICE9PSAndXNlckxvY2FsVmFsdWUnKSAmJiB0eXBlb2YgaW5zcGVjdGVkT3ZlcnJpZGUudXNlckxvY2FsPy5vdmVycmlkZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRcdFx0b3ZlcnJpZGRlblNjb3BlTGlzdC5wdXNoKGB1c2VyOiR7b3ZlcnJpZGVJZGVudGlmaWVyfWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmxhbmd1YWdlT3ZlcnJpZGVWYWx1ZXMuc2V0KG92ZXJyaWRlSWRlbnRpZmllciwgaW5zcGVjdGVkT3ZlcnJpZGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMub3ZlcnJpZGRlblNjb3BlTGlzdCA9IG92ZXJyaWRkZW5TY29wZUxpc3Q7XG5cdFx0dGhpcy5vdmVycmlkZGVuRGVmYXVsdHNMYW5ndWFnZUxpc3QgPSBvdmVycmlkZGVuRGVmYXVsdHNMYW5ndWFnZUxpc3Q7XG5cblx0XHQvLyBUaGUgdXNlciBtaWdodCBoYXZlIGFkZGVkLCByZW1vdmVkLCBvciBtb2RpZmllZCBhIGxhbmd1YWdlIGZpbHRlcixcblx0XHQvLyBzbyB3ZSByZXNldCB0aGUgZGVmYXVsdCB2YWx1ZSBzb3VyY2UgdG8gdGhlIG5vbi1sYW5ndWFnZS1zcGVjaWZpYyBkZWZhdWx0IHZhbHVlIHNvdXJjZSBmb3Igbm93LlxuXHRcdHRoaXMuZGVmYXVsdFZhbHVlU291cmNlID0gdGhpcy5zZXR0aW5nLm5vbkxhbmd1YWdlU3BlY2lmaWNEZWZhdWx0VmFsdWVTb3VyY2U7XG5cblx0XHRpZiAoaW5zcGVjdGVkLnBvbGljeVZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuaGFzUG9saWN5VmFsdWUgPSB0cnVlO1xuXHRcdFx0aXNDb25maWd1cmVkID0gZmFsc2U7IC8vIFRoZSB1c2VyIGRpZCBub3QgbWFudWFsbHkgY29uZmlndXJlIHRoZSBzZXR0aW5nIHRoZW1zZWx2ZXMuXG5cdFx0XHRkaXNwbGF5VmFsdWUgPSBpbnNwZWN0ZWQucG9saWN5VmFsdWU7XG5cdFx0XHR0aGlzLnNjb3BlVmFsdWUgPSBpbnNwZWN0ZWQucG9saWN5VmFsdWU7XG5cdFx0XHR0aGlzLmRlZmF1bHRWYWx1ZSA9IGluc3BlY3RlZC5kZWZhdWx0VmFsdWU7XG5cdFx0fSBlbHNlIGlmIChsYW5ndWFnZVNlbGVjdG9yICYmIHRoaXMubGFuZ3VhZ2VPdmVycmlkZVZhbHVlcy5oYXMobGFuZ3VhZ2VTZWxlY3RvcikpIHtcblx0XHRcdGNvbnN0IG92ZXJyaWRlVmFsdWVzID0gdGhpcy5sYW5ndWFnZU92ZXJyaWRlVmFsdWVzLmdldChsYW5ndWFnZVNlbGVjdG9yKSE7XG5cdFx0XHQvLyBJbiB0aGUgd29yc3QgY2FzZSwgZ28gYmFjayB0byB1c2luZyB0aGUgcHJldmlvdXMgZGlzcGxheSB2YWx1ZS5cblx0XHRcdC8vIEFsc28sIHNvbWV0aW1lcyB0aGUgb3ZlcnJpZGUgaXMgaW4gdGhlIGZvcm0gb2YgYSBkZWZhdWx0IHZhbHVlIG92ZXJyaWRlLCBzbyBjb25zaWRlciB0aGF0IHNlY29uZC5cblx0XHRcdGRpc3BsYXlWYWx1ZSA9IChpc0NvbmZpZ3VyZWQgPyBvdmVycmlkZVZhbHVlc1t0YXJnZXRTZWxlY3Rvcl0gOiBvdmVycmlkZVZhbHVlcy5kZWZhdWx0VmFsdWUpID8/IGRpc3BsYXlWYWx1ZTtcblx0XHRcdHRoaXMuc2NvcGVWYWx1ZSA9IGlzQ29uZmlndXJlZCAmJiBvdmVycmlkZVZhbHVlc1t0YXJnZXRTZWxlY3Rvcl07XG5cdFx0XHR0aGlzLmRlZmF1bHRWYWx1ZSA9IG92ZXJyaWRlVmFsdWVzLmRlZmF1bHRWYWx1ZSA/PyBpbnNwZWN0ZWQuZGVmYXVsdFZhbHVlO1xuXG5cdFx0XHRjb25zdCByZWdpc3RyeVZhbHVlcyA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikuZ2V0Q29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzKCk7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSByZWdpc3RyeVZhbHVlcy5nZXQoYFske2xhbmd1YWdlU2VsZWN0b3J9XWApPy5zb3VyY2U7XG5cdFx0XHRjb25zdCBvdmVycmlkZVZhbHVlU291cmNlID0gc291cmNlIGluc3RhbmNlb2YgTWFwID8gc291cmNlLmdldCh0aGlzLnNldHRpbmcua2V5KSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChvdmVycmlkZVZhbHVlU291cmNlKSB7XG5cdFx0XHRcdHRoaXMuZGVmYXVsdFZhbHVlU291cmNlID0gb3ZlcnJpZGVWYWx1ZVNvdXJjZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zY29wZVZhbHVlID0gaXNDb25maWd1cmVkICYmIGluc3BlY3RlZFt0YXJnZXRTZWxlY3Rvcl07XG5cdFx0XHR0aGlzLmRlZmF1bHRWYWx1ZSA9IGluc3BlY3RlZC5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXG5cdFx0bGV0IGhhc0FnZW50c1dpbmRvd092ZXJyaWRlID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0Y29uc3QgcHJvcGVydHkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbdGhpcy5zZXR0aW5nLmtleV07XG5cdFx0XHRoYXNBZ2VudHNXaW5kb3dPdmVycmlkZSA9ICEhcHJvcGVydHk/LmFnZW50c1dpbmRvdztcblx0XHRcdHRoaXMuaXNBZ2VudHNXaW5kb3dSZWFkT25seSA9ICEhcHJvcGVydHk/LmFnZW50c1dpbmRvdz8ucmVhZE9ubHk7XG5cdFx0XHRpZiAodGhpcy5pc0FnZW50c1dpbmRvd1JlYWRPbmx5KSB7XG5cdFx0XHRcdGlzQ29uZmlndXJlZCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMudmFsdWUgPSBkaXNwbGF5VmFsdWU7XG5cdFx0dGhpcy5pc0NvbmZpZ3VyZWQgPSBpc0NvbmZpZ3VyZWQ7XG5cdFx0aWYgKGlzQ29uZmlndXJlZCB8fCB0aGlzLnNldHRpbmcudGFncyB8fCB0aGlzLnRhZ3MgfHwgdGhpcy5zZXR0aW5nLnJlc3RyaWN0ZWQgfHwgdGhpcy5oYXNQb2xpY3lWYWx1ZSB8fCBoYXNBZ2VudHNXaW5kb3dPdmVycmlkZSkge1xuXHRcdFx0Ly8gRG9uJ3QgY3JlYXRlIGFuIGVtcHR5IFNldCBmb3IgYWxsIDEwMDAgc2V0dGluZ3MsIG9ubHkgaWYgbmVlZGVkXG5cdFx0XHR0aGlzLnRhZ3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGlmIChpc0NvbmZpZ3VyZWQpIHtcblx0XHRcdFx0dGhpcy50YWdzLmFkZChNT0RJRklFRF9TRVRUSU5HX1RBRyk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuc2V0dGluZy50YWdzPy5mb3JFYWNoKHRhZyA9PiB0aGlzLnRhZ3MhLmFkZCh0YWcpKTtcblxuXHRcdFx0aWYgKHRoaXMuc2V0dGluZy5yZXN0cmljdGVkKSB7XG5cdFx0XHRcdHRoaXMudGFncy5hZGQoUkVRVUlSRV9UUlVTVEVEX1dPUktTUEFDRV9TRVRUSU5HX1RBRyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmhhc1BvbGljeVZhbHVlKSB7XG5cdFx0XHRcdHRoaXMudGFncy5hZGQoUE9MSUNZX1NFVFRJTkdfVEFHKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGhhc0FnZW50c1dpbmRvd092ZXJyaWRlKSB7XG5cdFx0XHRcdHRoaXMudGFncy5hZGQoQUdFTlRTX1dJTkRPV19TRVRUSU5HX1RBRyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0bWF0Y2hlc0FsbFRhZ3ModGFnRmlsdGVycz86IFNldDxzdHJpbmc+KTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0YWdGaWx0ZXJzPy5zaXplKSB7XG5cdFx0XHQvLyBUaGlzIHNldHRpbmcsIHdoaWNoIG1heSBoYXZlIHRhZ3MsXG5cdFx0XHQvLyBtYXRjaGVzIGFnYWluc3QgYSBxdWVyeSB3aXRoIG5vIHRhZ3MuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMudGFncykge1xuXHRcdFx0Ly8gVGhlIHNldHRpbmcgbXVzdCBpbnNwZWN0IGl0c2VsZiB0byBnZXQgdGFnIGluZm9ybWF0aW9uXG5cdFx0XHQvLyBpbmNsdWRpbmcgZm9yIHRoZSBoYXNQb2xpY3kgdGFnLlxuXHRcdFx0dGhpcy5pbnNwZWN0U2VsZigpO1xuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSB0aGUgc3BlY2lhbCAnc3RhYmxlJyB0YWcgZmlsdGVyXG5cdFx0aWYgKHRhZ0ZpbHRlcnMuaGFzKCdzdGFibGUnKSkge1xuXHRcdFx0Ly8gRm9yIHN0YWJsZSBmaWx0ZXIsIGV4Y2x1ZGUgcHJldmlldyBhbmQgZXhwZXJpbWVudGFsIHNldHRpbmdzXG5cdFx0XHRpZiAodGhpcy50YWdzPy5oYXMoJ3ByZXZpZXcnKSB8fCB0aGlzLnRhZ3M/LmhhcygnZXhwZXJpbWVudGFsJykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQ2hlY2sgb3RoZXIgZmlsdGVycyAoZXhjbHVkaW5nICdzdGFibGUnIGl0c2VsZilcblx0XHRcdGNvbnN0IG90aGVyRmlsdGVycyA9IG5ldyBTZXQoQXJyYXkuZnJvbSh0YWdGaWx0ZXJzKS5maWx0ZXIodGFnID0+IHRhZyAhPT0gJ3N0YWJsZScpKTtcblx0XHRcdGlmIChvdGhlckZpbHRlcnMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiAhIXRoaXMudGFncz8uc2l6ZSAmJlxuXHRcdFx0XHRBcnJheS5mcm9tKG90aGVyRmlsdGVycykuZXZlcnkodGFnID0+IHRoaXMudGFncyEuaGFzKHRhZykpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIHRoYXQgdGhlIGZpbHRlciB0YWdzIGFyZSBhIHN1YnNldCBvZiB0aGlzIHNldHRpbmcncyB0YWdzXG5cdFx0cmV0dXJuICEhdGhpcy50YWdzPy5zaXplICYmXG5cdFx0XHRBcnJheS5mcm9tKHRhZ0ZpbHRlcnMpLmV2ZXJ5KHRhZyA9PiB0aGlzLnRhZ3MhLmhhcyh0YWcpKTtcblx0fVxuXG5cdG1hdGNoZXNTY29wZShzY29wZTogU2V0dGluZ3NUYXJnZXQsIGlzUmVtb3RlOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29uZmlnVGFyZ2V0ID0gVVJJLmlzVXJpKHNjb3BlKSA/IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUiA6IHNjb3BlO1xuXG5cdFx0aWYgKCF0aGlzLnNldHRpbmcuc2NvcGUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChjb25maWdUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT04pIHtcblx0XHRcdHJldHVybiBBUFBMSUNBVElPTl9TQ09QRVMuaW5jbHVkZXModGhpcy5zZXR0aW5nLnNjb3BlKTtcblx0XHR9XG5cblx0XHRpZiAoY29uZmlnVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIpIHtcblx0XHRcdHJldHVybiBGT0xERVJfU0NPUEVTLmluY2x1ZGVzKHRoaXMuc2V0dGluZy5zY29wZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbmZpZ1RhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpIHtcblx0XHRcdHJldHVybiBXT1JLU1BBQ0VfU0NPUEVTLmluY2x1ZGVzKHRoaXMuc2V0dGluZy5zY29wZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbmZpZ1RhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSkge1xuXHRcdFx0cmV0dXJuIFJFTU9URV9NQUNISU5FX1NDT1BFUy5pbmNsdWRlcyh0aGlzLnNldHRpbmcuc2NvcGUpIHx8IFVTRVJfTE9DQUxfQU5EX1JFTU9URV9TRVRUSU5HUy5pbmNsdWRlcyh0aGlzLnNldHRpbmcua2V5KTtcblx0XHR9XG5cblx0XHRpZiAoY29uZmlnVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpIHtcblx0XHRcdGlmIChpc1JlbW90ZSkge1xuXHRcdFx0XHRyZXR1cm4gTE9DQUxfTUFDSElORV9TQ09QRVMuaW5jbHVkZXModGhpcy5zZXR0aW5nLnNjb3BlKSB8fCBVU0VSX0xPQ0FMX0FORF9SRU1PVEVfU0VUVElOR1MuaW5jbHVkZXModGhpcy5zZXR0aW5nLmtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRtYXRjaGVzQW55RXh0ZW5zaW9uKGV4dGVuc2lvbkZpbHRlcnM/OiBTZXQ8c3RyaW5nPik6IGJvb2xlYW4ge1xuXHRcdGlmICghZXh0ZW5zaW9uRmlsdGVycyB8fCAhZXh0ZW5zaW9uRmlsdGVycy5zaXplKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuc2V0dGluZy5leHRlbnNpb25JbmZvKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEFycmF5LmZyb20oZXh0ZW5zaW9uRmlsdGVycykuc29tZShleHRlbnNpb25JZCA9PiBleHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpID09PSB0aGlzLnNldHRpbmcuZXh0ZW5zaW9uSW5mbyEuaWQudG9Mb3dlckNhc2UoKSk7XG5cdH1cblxuXHRtYXRjaGVzQW55RmVhdHVyZShmZWF0dXJlRmlsdGVycz86IFNldDxzdHJpbmc+KTogYm9vbGVhbiB7XG5cdFx0aWYgKCFmZWF0dXJlRmlsdGVycyB8fCAhZmVhdHVyZUZpbHRlcnMuc2l6ZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzdHJpY3QgdG8gY29yZSBzZXR0aW5nc1xuXHRcdGlmICh0aGlzLnNldHRpbmcuZXh0ZW5zaW9uSW5mbykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIENoYXQgc2V0dGluZ3MgYXJlIG5vdyBpbiB0aGVpciBvd24gdG9wLWxldmVsIGNhdGVnb3J5XG5cdFx0aWYgKGZlYXR1cmVGaWx0ZXJzLmhhcygnY2hhdCcpKSB7XG5cdFx0XHRjb25zdCBjaGF0RmVhdHVyZXMgPSB0b2NEYXRhLmNoaWxkcmVuIS5maW5kKGNoaWxkID0+IGNoaWxkLmlkID09PSAnY2hhdCcpO1xuXHRcdFx0aWYgKGNoYXRGZWF0dXJlcz8uY2hpbGRyZW4pIHtcblx0XHRcdFx0Y29uc3QgcGF0dGVybnMgPSBjaGF0RmVhdHVyZXMuY2hpbGRyZW5cblx0XHRcdFx0XHQuZmxhdE1hcChmZWF0dXJlID0+IGZlYXR1cmUuc2V0dGluZ3MgPz8gW10pXG5cdFx0XHRcdFx0Lm1hcChzZXR0aW5nID0+IGNyZWF0ZVNldHRpbmdNYXRjaFJlZ0V4cChzZXR0aW5nKSk7XG5cdFx0XHRcdGlmIChwYXR0ZXJucy5zb21lKHBhdHRlcm4gPT4gcGF0dGVybi50ZXN0KHRoaXMuc2V0dGluZy5rZXkpKSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmVhdHVyZXMgPSB0b2NEYXRhLmNoaWxkcmVuIS5maW5kKGNoaWxkID0+IGNoaWxkLmlkID09PSAnZmVhdHVyZXMnKTtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbShmZWF0dXJlRmlsdGVycykuc29tZShmaWx0ZXIgPT4ge1xuXHRcdFx0aWYgKGZlYXR1cmVzPy5jaGlsZHJlbikge1xuXHRcdFx0XHRjb25zdCBmZWF0dXJlID0gZmVhdHVyZXMuY2hpbGRyZW4uZmluZChmZWF0dXJlID0+ICdmZWF0dXJlcy8nICsgZmlsdGVyID09PSBmZWF0dXJlLmlkKTtcblx0XHRcdFx0aWYgKGZlYXR1cmU/LnNldHRpbmdzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGF0dGVybnMgPSBmZWF0dXJlLnNldHRpbmdzLm1hcChzZXR0aW5nID0+IGNyZWF0ZVNldHRpbmdNYXRjaFJlZ0V4cChzZXR0aW5nKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHBhdHRlcm5zLnNvbWUocGF0dGVybiA9PiBwYXR0ZXJuLnRlc3QodGhpcy5zZXR0aW5nLmtleSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0bWF0Y2hlc0FueUlkKGlkRmlsdGVycz86IFNldDxzdHJpbmc+KTogYm9vbGVhbiB7XG5cdFx0aWYgKCFpZEZpbHRlcnMgfHwgIWlkRmlsdGVycy5zaXplKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3IgZXhhY3QgbWF0Y2ggZmlyc3Rcblx0XHRpZiAoaWRGaWx0ZXJzLmhhcyh0aGlzLnNldHRpbmcua2V5KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZm9yIHdpbGRjYXJkIHBhdHRlcm5zIChlbmRpbmcgd2l0aCAuKilcblx0XHRmb3IgKGNvbnN0IGZpbHRlciBvZiBpZEZpbHRlcnMpIHtcblx0XHRcdGlmIChmaWx0ZXIuZW5kc1dpdGgoJyonKSkge1xuXHRcdFx0XHRjb25zdCBwcmVmaXggPSBmaWx0ZXIuc2xpY2UoMCwgLTEpOyAvLyBSZW1vdmUgJyonIHN1ZmZpeFxuXHRcdFx0XHRpZiAodGhpcy5zZXR0aW5nLmtleS5zdGFydHNXaXRoKHByZWZpeCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdG1hdGNoZXNBbGxMYW5ndWFnZXMobGFuZ3VhZ2VGaWx0ZXI/OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoIWxhbmd1YWdlRmlsdGVyKSB7XG5cdFx0XHQvLyBXZSdyZSBub3QgZmlsdGVyaW5nIGJ5IGxhbmd1YWdlLlxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmxhbmd1YWdlU2VydmljZS5pc1JlZ2lzdGVyZWRMYW5ndWFnZUlkKGxhbmd1YWdlRmlsdGVyKSkge1xuXHRcdFx0Ly8gV2UncmUgdHJ5aW5nIHRvIGZpbHRlciBieSBhbiBpbnZhbGlkIGxhbmd1YWdlLlxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFdlIGhhdmUgYSBsYW5ndWFnZSBmaWx0ZXIgaW4gdGhlIHNlYXJjaCB3aWRnZXQgYXQgdGhpcyBwb2ludC5cblx0XHQvLyBXZSBkZWNpZGUgdG8gc2hvdyBhbGwgbGFuZ3VhZ2Ugb3ZlcnJpZGFibGUgc2V0dGluZ3MgdG8gbWFrZSB0aGVcblx0XHQvLyBsYW5nIGZpbHRlciBhY3QgbW9yZSBsaWtlIGEgc2NvcGUgZmlsdGVyLFxuXHRcdC8vIHJhdGhlciB0aGFuIGFkZGluZyBvbiBhbiBpbXBsaWNpdCBAbW9kaWZpZWQgYXMgd2VsbC5cblx0XHRpZiAodGhpcy5zZXR0aW5nLnNjb3BlID09PSBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5cbmZ1bmN0aW9uIGNyZWF0ZVNldHRpbmdNYXRjaFJlZ0V4cChwYXR0ZXJuOiBzdHJpbmcpOiBSZWdFeHAge1xuXHRwYXR0ZXJuID0gZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhwYXR0ZXJuKVxuXHRcdC5yZXBsYWNlKC9cXFxcXFwqL2csICcuKicpO1xuXG5cdHJldHVybiBuZXcgUmVnRXhwKGBeJHtwYXR0ZXJufSRgLCAnaScpO1xufVxuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NUcmVlTW9kZWwgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByb3RlY3RlZCBfcm9vdCE6IFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudDtcblx0cHJpdmF0ZSBfdG9jUm9vdCE6IElUT0NFbnRyeTxJU2V0dGluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyZWVFbGVtZW50c0J5U2V0dGluZ05hbWUgPSBuZXcgTWFwPHN0cmluZywgU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnRbXT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3ZpZXdTdGF0ZTogSVNldHRpbmdzRWRpdG9yVmlld1N0YXRlLFxuXHRcdHByaXZhdGUgX2lzV29ya3NwYWNlVHJ1c3RlZDogYm9vbGVhbixcblx0XHRASVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdGdldCByb290KCk6IFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jvb3Q7XG5cdH1cblxuXHR1cGRhdGUobmV3VG9jUm9vdCA9IHRoaXMuX3RvY1Jvb3QpOiB2b2lkIHtcblx0XHR0aGlzLl90cmVlRWxlbWVudHNCeVNldHRpbmdOYW1lLmNsZWFyKCk7XG5cblx0XHRjb25zdCBuZXdSb290ID0gdGhpcy5jcmVhdGVTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQobmV3VG9jUm9vdCk7XG5cdFx0aWYgKG5ld1Jvb3QuY2hpbGRyZW5bMF0gaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQpIHtcblx0XHRcdCg8U2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50Pm5ld1Jvb3QuY2hpbGRyZW5bMF0pLmlzRmlyc3RHcm91cCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3Jvb3QpIHtcblx0XHRcdHRoaXMuZGlzcG9zZUNoaWxkcmVuKHRoaXMuX3Jvb3QuY2hpbGRyZW4pO1xuXHRcdFx0dGhpcy5fcm9vdC5jaGlsZHJlbiA9IG5ld1Jvb3QuY2hpbGRyZW47XG5cdFx0XHRuZXdSb290LmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcm9vdCA9IG5ld1Jvb3Q7XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlV29ya3NwYWNlVHJ1c3Qod29ya3NwYWNlVHJ1c3RlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2lzV29ya3NwYWNlVHJ1c3RlZCA9IHdvcmtzcGFjZVRydXN0ZWQ7XG5cdFx0dGhpcy51cGRhdGVSZXF1aXJlVHJ1c3RlZFRhcmdldEVsZW1lbnRzKCk7XG5cdH1cblxuXHRwcml2YXRlIGRpc3Bvc2VDaGlsZHJlbihjaGlsZHJlbjogU2V0dGluZ3NUcmVlR3JvdXBDaGlsZFtdKSB7XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuXHRcdFx0dGhpcy5kaXNwb3NlQ2hpbGRBbmRSZWN1cnNlKGNoaWxkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRpc3Bvc2VDaGlsZEFuZFJlY3Vyc2UoZWxlbWVudDogU2V0dGluZ3NUcmVlRWxlbWVudCkge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50KSB7XG5cdFx0XHR0aGlzLmRpc3Bvc2VDaGlsZHJlbihlbGVtZW50LmNoaWxkcmVuKTtcblx0XHR9XG5cblx0XHRlbGVtZW50LmRpc3Bvc2UoKTtcblx0fVxuXG5cdGdldEVsZW1lbnRzQnlOYW1lKG5hbWU6IHN0cmluZyk6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50W10gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJlZUVsZW1lbnRzQnlTZXR0aW5nTmFtZS5nZXQobmFtZSkgPz8gbnVsbDtcblx0fVxuXG5cdHVwZGF0ZUVsZW1lbnRzQnlOYW1lKG5hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdHJlZUVsZW1lbnRzQnlTZXR0aW5nTmFtZS5oYXMobmFtZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnJlaW5zcGVjdFNldHRpbmdzKHRoaXMuX3RyZWVFbGVtZW50c0J5U2V0dGluZ05hbWUuZ2V0KG5hbWUpISk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVJlcXVpcmVUcnVzdGVkVGFyZ2V0RWxlbWVudHMoKTogdm9pZCB7XG5cdFx0dGhpcy5yZWluc3BlY3RTZXR0aW5ncyhbLi4udGhpcy5fdHJlZUVsZW1lbnRzQnlTZXR0aW5nTmFtZS52YWx1ZXMoKV0uZmxhdCgpLmZpbHRlcihzID0+IHMuaXNVbnRydXN0ZWQpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVpbnNwZWN0U2V0dGluZ3Moc2V0dGluZ3M6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50W10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2Ygc2V0dGluZ3MpIHtcblx0XHRcdGVsZW1lbnQuaW5zcGVjdFNlbGYoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCh0b2NFbnRyeTogSVRPQ0VudHJ5PElTZXR0aW5nPiwgcGFyZW50PzogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50KTogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50IHtcblx0XHRjb25zdCBkZXB0aCA9IHBhcmVudCA/IHRoaXMuZ2V0RGVwdGgocGFyZW50KSArIDEgOiAwO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBuZXcgU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50KHRvY0VudHJ5LmlkLCB1bmRlZmluZWQsIHRvY0VudHJ5LmxhYmVsLCBkZXB0aCwgZmFsc2UpO1xuXHRcdGVsZW1lbnQucGFyZW50ID0gcGFyZW50O1xuXG5cdFx0Y29uc3QgY2hpbGRyZW46IFNldHRpbmdzVHJlZUdyb3VwQ2hpbGRbXSA9IFtdO1xuXHRcdGlmICh0b2NFbnRyeS5zZXR0aW5ncykge1xuXHRcdFx0Y29uc3Qgc2V0dGluZ0NoaWxkcmVuID0gdG9jRW50cnkuc2V0dGluZ3MubWFwKHMgPT4gdGhpcy5jcmVhdGVTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudChzLCBlbGVtZW50KSk7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHNldHRpbmdDaGlsZHJlbikge1xuXHRcdFx0XHRpZiAoIWNoaWxkLnNldHRpbmcuZGVwcmVjYXRpb25NZXNzYWdlKSB7XG5cdFx0XHRcdFx0Y2hpbGRyZW4ucHVzaChjaGlsZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y2hpbGQuaW5zcGVjdFNlbGYoKTtcblx0XHRcdFx0XHRpZiAoY2hpbGQuaXNDb25maWd1cmVkKSB7XG5cdFx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKGNoaWxkKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y2hpbGQuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0b2NFbnRyeS5jaGlsZHJlbikge1xuXHRcdFx0Y29uc3QgZ3JvdXBDaGlsZHJlbiA9IHRvY0VudHJ5LmNoaWxkcmVuLm1hcChjaGlsZCA9PiB0aGlzLmNyZWF0ZVNldHRpbmdzVHJlZUdyb3VwRWxlbWVudChjaGlsZCwgZWxlbWVudCkpO1xuXHRcdFx0Y2hpbGRyZW4ucHVzaCguLi5ncm91cENoaWxkcmVuKTtcblx0XHR9XG5cblx0XHRlbGVtZW50LmNoaWxkcmVuID0gY2hpbGRyZW47XG5cblx0XHRyZXR1cm4gZWxlbWVudDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVwdGgoZWxlbWVudDogU2V0dGluZ3NUcmVlRWxlbWVudCk6IG51bWJlciB7XG5cdFx0aWYgKGVsZW1lbnQucGFyZW50KSB7XG5cdFx0XHRyZXR1cm4gMSArIHRoaXMuZ2V0RGVwdGgoZWxlbWVudC5wYXJlbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KHNldHRpbmc6IElTZXR0aW5nLCBwYXJlbnQ6IFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCk6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50IHtcblx0XHRjb25zdCBlbGVtZW50ID0gbmV3IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KFxuXHRcdFx0c2V0dGluZyxcblx0XHRcdHBhcmVudCxcblx0XHRcdHRoaXMuX3ZpZXdTdGF0ZS5zZXR0aW5nc1RhcmdldCxcblx0XHRcdHRoaXMuX2lzV29ya3NwYWNlVHJ1c3RlZCxcblx0XHRcdHRoaXMuX3ZpZXdTdGF0ZS5sYW5ndWFnZUZpbHRlcixcblx0XHRcdHRoaXMuX2xhbmd1YWdlU2VydmljZSxcblx0XHRcdHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fdXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0dGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpO1xuXG5cdFx0Y29uc3QgbmFtZUVsZW1lbnRzID0gdGhpcy5fdHJlZUVsZW1lbnRzQnlTZXR0aW5nTmFtZS5nZXQoc2V0dGluZy5rZXkpID8/IFtdO1xuXHRcdG5hbWVFbGVtZW50cy5wdXNoKGVsZW1lbnQpO1xuXHRcdHRoaXMuX3RyZWVFbGVtZW50c0J5U2V0dGluZ05hbWUuc2V0KHNldHRpbmcua2V5LCBuYW1lRWxlbWVudHMpO1xuXHRcdHJldHVybiBlbGVtZW50O1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLl90cmVlRWxlbWVudHNCeVNldHRpbmdOYW1lLmNsZWFyKCk7XG5cdFx0dGhpcy5kaXNwb3NlQ2hpbGRBbmRSZWN1cnNlKHRoaXMuX3Jvb3QpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJSW5zcGVjdFJlc3VsdCB7XG5cdGlzQ29uZmlndXJlZDogYm9vbGVhbjtcblx0aW5zcGVjdGVkOiBJQ29uZmlndXJhdGlvblZhbHVlPHVua25vd24+O1xuXHR0YXJnZXRTZWxlY3RvcjogJ2FwcGxpY2F0aW9uVmFsdWUnIHwgJ3VzZXJMb2NhbFZhbHVlJyB8ICd1c2VyUmVtb3RlVmFsdWUnIHwgJ3dvcmtzcGFjZVZhbHVlJyB8ICd3b3Jrc3BhY2VGb2xkZXJWYWx1ZSc7XG5cdGluc3BlY3RlZExhbmd1YWdlT3ZlcnJpZGVzOiBNYXA8c3RyaW5nLCBJQ29uZmlndXJhdGlvblZhbHVlPHVua25vd24+Pjtcblx0bGFuZ3VhZ2VTZWxlY3Rvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5zcGVjdFNldHRpbmcoa2V5OiBzdHJpbmcsIHRhcmdldDogU2V0dGluZ3NUYXJnZXQsIGxhbmd1YWdlRmlsdGVyOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UpOiBJSW5zcGVjdFJlc3VsdCB7XG5cdGNvbnN0IGluc3BlY3RPdmVycmlkZXMgPSBVUkkuaXNVcmkodGFyZ2V0KSA/IHsgcmVzb3VyY2U6IHRhcmdldCB9IDogdW5kZWZpbmVkO1xuXHRjb25zdCBpbnNwZWN0ZWQgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KGtleSwgaW5zcGVjdE92ZXJyaWRlcyk7XG5cdGNvbnN0IHRhcmdldFNlbGVjdG9yID0gdGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LkFQUExJQ0FUSU9OID8gJ2FwcGxpY2F0aW9uVmFsdWUnIDpcblx0XHR0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCA/ICd1c2VyTG9jYWxWYWx1ZScgOlxuXHRcdFx0dGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFID8gJ3VzZXJSZW1vdGVWYWx1ZScgOlxuXHRcdFx0XHR0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFID8gJ3dvcmtzcGFjZVZhbHVlJyA6XG5cdFx0XHRcdFx0J3dvcmtzcGFjZUZvbGRlclZhbHVlJztcblx0Y29uc3QgdGFyZ2V0T3ZlcnJpZGVTZWxlY3RvciA9IHRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5BUFBMSUNBVElPTiA/ICdhcHBsaWNhdGlvbicgOlxuXHRcdHRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMID8gJ3VzZXJMb2NhbCcgOlxuXHRcdFx0dGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFID8gJ3VzZXJSZW1vdGUnIDpcblx0XHRcdFx0dGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSA/ICd3b3Jrc3BhY2UnIDpcblx0XHRcdFx0XHQnd29ya3NwYWNlRm9sZGVyJztcblx0bGV0IGlzQ29uZmlndXJlZCA9IHR5cGVvZiBpbnNwZWN0ZWRbdGFyZ2V0U2VsZWN0b3JdICE9PSAndW5kZWZpbmVkJztcblxuXHRjb25zdCBvdmVycmlkZUlkZW50aWZpZXJzID0gaW5zcGVjdGVkLm92ZXJyaWRlSWRlbnRpZmllcnM7XG5cdGNvbnN0IGluc3BlY3RlZExhbmd1YWdlT3ZlcnJpZGVzID0gbmV3IE1hcDxzdHJpbmcsIElDb25maWd1cmF0aW9uVmFsdWU8dW5rbm93bj4+KCk7XG5cblx0Ly8gV2UgbXVzdCByZXNldCBpc0NvbmZpZ3VyZWQgdG8gYmUgZmFsc2UgaWYgbGFuZ3VhZ2VGaWx0ZXIgaXMgc2V0LCBhbmQgbWFudWFsbHlcblx0Ly8gZGV0ZXJtaW5lIHdoZXRoZXIgaXQgY2FuIGJlIHNldCB0byB0cnVlIGxhdGVyLlxuXHRpZiAobGFuZ3VhZ2VGaWx0ZXIpIHtcblx0XHRpc0NvbmZpZ3VyZWQgPSBmYWxzZTtcblx0fVxuXHRpZiAob3ZlcnJpZGVJZGVudGlmaWVycykge1xuXHRcdC8vIFRoZSBzZXR0aW5nIHdlJ3JlIGxvb2tpbmcgYXQgaGFzIGxhbmd1YWdlIG92ZXJyaWRlcy5cblx0XHRmb3IgKGNvbnN0IG92ZXJyaWRlSWRlbnRpZmllciBvZiBvdmVycmlkZUlkZW50aWZpZXJzKSB7XG5cdFx0XHRpbnNwZWN0ZWRMYW5ndWFnZU92ZXJyaWRlcy5zZXQob3ZlcnJpZGVJZGVudGlmaWVyLCBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KGtleSwgeyBvdmVycmlkZUlkZW50aWZpZXIgfSkpO1xuXHRcdH1cblxuXHRcdC8vIEZvciBhbGwgbGFuZ3VhZ2UgZmlsdGVycywgc2VlIGlmIHRoZXJlJ3MgYW4gb3ZlcnJpZGUgZm9yIHRoYXQgZmlsdGVyLlxuXHRcdGlmIChsYW5ndWFnZUZpbHRlcikge1xuXHRcdFx0aWYgKGluc3BlY3RlZExhbmd1YWdlT3ZlcnJpZGVzLmhhcyhsYW5ndWFnZUZpbHRlcikpIHtcblx0XHRcdFx0Y29uc3Qgb3ZlcnJpZGVWYWx1ZSA9IGluc3BlY3RlZExhbmd1YWdlT3ZlcnJpZGVzLmdldChsYW5ndWFnZUZpbHRlcikhW3RhcmdldE92ZXJyaWRlU2VsZWN0b3JdPy5vdmVycmlkZTtcblx0XHRcdFx0aWYgKHR5cGVvZiBvdmVycmlkZVZhbHVlICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdGlzQ29uZmlndXJlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4geyBpc0NvbmZpZ3VyZWQsIGluc3BlY3RlZCwgdGFyZ2V0U2VsZWN0b3IsIGluc3BlY3RlZExhbmd1YWdlT3ZlcnJpZGVzLCBsYW5ndWFnZVNlbGVjdG9yOiBsYW5ndWFnZUZpbHRlciB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2FuaXRpemVJZChpZDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGlkLnJlcGxhY2UoL1tcXC5cXC9dL2csICdfJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KGtleTogc3RyaW5nLCBncm91cElkOiBzdHJpbmcgPSAnJywgaXNMYW5ndWFnZVRhZ1NldHRpbmc6IGJvb2xlYW4gPSBmYWxzZSk6IHsgY2F0ZWdvcnk6IHN0cmluZzsgbGFiZWw6IHN0cmluZyB9IHtcblx0Y29uc3QgbGFzdERvdElkeCA9IGtleS5sYXN0SW5kZXhPZignLicpO1xuXHRsZXQgY2F0ZWdvcnkgPSAnJztcblx0aWYgKGxhc3REb3RJZHggPj0gMCkge1xuXHRcdGNhdGVnb3J5ID0ga2V5LnN1YnN0cmluZygwLCBsYXN0RG90SWR4KTtcblx0XHRrZXkgPSBrZXkuc3Vic3RyaW5nKGxhc3REb3RJZHggKyAxKTtcblx0fVxuXG5cdGdyb3VwSWQgPSBncm91cElkLnJlcGxhY2UoL1xcLy9nLCAnLicpO1xuXHRjYXRlZ29yeSA9IHRyaW1DYXRlZ29yeUZvckdyb3VwKGNhdGVnb3J5LCBncm91cElkKTtcblx0Y2F0ZWdvcnkgPSB3b3JkaWZ5S2V5KGNhdGVnb3J5KTtcblxuXHRpZiAoaXNMYW5ndWFnZVRhZ1NldHRpbmcpIHtcblx0XHRrZXkgPSBnZXRMYW5ndWFnZVRhZ1NldHRpbmdQbGFpbktleShrZXkpO1xuXHRcdGtleSA9ICckKGJyYWNrZXQpICcgKyBrZXk7XG5cdH1cblxuXHRjb25zdCBsYWJlbCA9IHdvcmRpZnlLZXkoa2V5KTtcblx0cmV0dXJuIHsgY2F0ZWdvcnksIGxhYmVsIH07XG59XG5cbi8qKlxuICogUmVtb3ZlcyByZWR1bmRhbnQgc2VjdGlvbnMgb2YgdGhlIGNhdGVnb3J5IGxhYmVsLlxuICogQSByZWR1bmRhbnQgc2VjdGlvbiBpcyBhIHNlY3Rpb24gYWxyZWFkeSByZWZsZWN0ZWQgaW4gdGhlIGdyb3VwSWQuXG4gKlxuICogQHBhcmFtIGNhdGVnb3J5IFRoZSBjYXRlZ29yeSBvZiB0aGUgc3BlY2lmaWMgc2V0dGluZy5cbiAqIEBwYXJhbSBncm91cElkIFRoZSBhdXRob3IgKyBleHRlbnNpb24gSUQuXG4gKiBAcmV0dXJucyBUaGUgbmV3IGNhdGVnb3J5IGxhYmVsIHRvIHVzZS5cbiAqL1xuZnVuY3Rpb24gdHJpbUNhdGVnb3J5Rm9yR3JvdXAoY2F0ZWdvcnk6IHN0cmluZywgZ3JvdXBJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgZG9UcmltID0gKGZvcndhcmQ6IGJvb2xlYW4pID0+IHtcblx0XHQvLyBSZW1vdmUgdGhlIEluc2lkZXJzIHBvcnRpb24gaWYgdGhlIGNhdGVnb3J5IGRvZXNuJ3QgdXNlIGl0LlxuXHRcdGlmICghL2luc2lkZXJzJC9pLnRlc3QoY2F0ZWdvcnkpKSB7XG5cdFx0XHRncm91cElkID0gZ3JvdXBJZC5yZXBsYWNlKC8tP2luc2lkZXJzJC9pLCAnJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnRzID0gZ3JvdXBJZC5zcGxpdCgnLicpXG5cdFx0XHQubWFwKHBhcnQgPT4ge1xuXHRcdFx0XHQvLyBSZW1vdmUgaHlwaGVucywgYnV0IG9ubHkgaWYgdGhhdCByZXN1bHRzIGluIGEgbWF0Y2ggd2l0aCB0aGUgY2F0ZWdvcnkuXG5cdFx0XHRcdGlmIChwYXJ0LnJlcGxhY2UoLy0vZywgJycpLnRvTG93ZXJDYXNlKCkgPT09IGNhdGVnb3J5LnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gcGFydC5yZXBsYWNlKC8tL2csICcnKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gcGFydDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0d2hpbGUgKHBhcnRzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcmVnID0gbmV3IFJlZ0V4cChgXiR7cGFydHMuam9pbignXFxcXC4nKX0oXFxcXC58JClgLCAnaScpO1xuXHRcdFx0aWYgKHJlZy50ZXN0KGNhdGVnb3J5KSkge1xuXHRcdFx0XHRyZXR1cm4gY2F0ZWdvcnkucmVwbGFjZShyZWcsICcnKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGZvcndhcmQpIHtcblx0XHRcdFx0cGFydHMucG9wKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwYXJ0cy5zaGlmdCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9O1xuXG5cdGxldCB0cmltbWVkID0gZG9UcmltKHRydWUpO1xuXHRpZiAodHJpbW1lZCA9PT0gbnVsbCkge1xuXHRcdHRyaW1tZWQgPSBkb1RyaW0oZmFsc2UpO1xuXHR9XG5cblx0aWYgKHRyaW1tZWQgPT09IG51bGwpIHtcblx0XHR0cmltbWVkID0gY2F0ZWdvcnk7XG5cdH1cblxuXHRyZXR1cm4gdHJpbW1lZDtcbn1cblxuZnVuY3Rpb24gaXNFeHRlbnNpb25Ub2dnbGVTZXR0aW5nKHNldHRpbmc6IElTZXR0aW5nLCBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlKTogYm9vbGVhbiB7XG5cdHJldHVybiBFTkFCTEVfRVhURU5TSU9OX1RPR0dMRV9TRVRUSU5HUyAmJlxuXHRcdCEhcHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zICYmXG5cdFx0ISFzZXR0aW5nLmRpc3BsYXlFeHRlbnNpb25JZDtcbn1cblxuZnVuY3Rpb24gaXNFeGNsdWRlU2V0dGluZyhzZXR0aW5nOiBJU2V0dGluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc2V0dGluZy5rZXkgPT09ICdmaWxlcy5leGNsdWRlJyB8fFxuXHRcdHNldHRpbmcua2V5ID09PSAnc2VhcmNoLmV4Y2x1ZGUnIHx8XG5cdFx0c2V0dGluZy5rZXkgPT09ICd3b3JrYmVuY2gubG9jYWxIaXN0b3J5LmV4Y2x1ZGUnIHx8XG5cdFx0c2V0dGluZy5rZXkgPT09ICdleHBsb3Jlci5hdXRvUmV2ZWFsRXhjbHVkZScgfHxcblx0XHRzZXR0aW5nLmtleSA9PT0gJ2ZpbGVzLnJlYWRvbmx5RXhjbHVkZScgfHxcblx0XHRzZXR0aW5nLmtleSA9PT0gJ2ZpbGVzLndhdGNoZXJFeGNsdWRlJztcbn1cblxuZnVuY3Rpb24gaXNJbmNsdWRlU2V0dGluZyhzZXR0aW5nOiBJU2V0dGluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc2V0dGluZy5rZXkgPT09ICdmaWxlcy5yZWFkb25seUluY2x1ZGUnO1xufVxuXG4vLyBUaGUgdmFsdWVzIG9mIHRoZSBmb2xsb3dpbmcgc2V0dGluZ3Mgd2hlbiBhIGRlZmF1bHQgdmFsdWVzIGhhcyBiZWVuIHJlbW92ZWRcbmV4cG9ydCBmdW5jdGlvbiBvYmplY3RTZXR0aW5nU3VwcG9ydHNSZW1vdmVEZWZhdWx0VmFsdWUoa2V5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGtleSA9PT0gJ3dvcmtiZW5jaC5lZGl0b3IuY3VzdG9tTGFiZWxzLnBhdHRlcm5zJztcbn1cblxuZnVuY3Rpb24gaXNTaW1wbGVUeXBlKHR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gdHlwZSA9PT0gJ3N0cmluZycgfHwgdHlwZSA9PT0gJ2Jvb2xlYW4nIHx8IHR5cGUgPT09ICdpbnRlZ2VyJyB8fCB0eXBlID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gZ2V0T2JqZWN0UmVuZGVyYWJsZVNjaGVtYVR5cGUoc2NoZW1hOiBJSlNPTlNjaGVtYSwga2V5OiBzdHJpbmcpOiAnc2ltcGxlJyB8ICdjb21wbGV4JyB8IGZhbHNlIHtcblx0Y29uc3QgeyB0eXBlIH0gPSBzY2hlbWE7XG5cblx0aWYgKEFycmF5LmlzQXJyYXkodHlwZSkpIHtcblx0XHRpZiAob2JqZWN0U2V0dGluZ1N1cHBvcnRzUmVtb3ZlRGVmYXVsdFZhbHVlKGtleSkgJiYgdHlwZS5sZW5ndGggPT09IDIpIHtcblx0XHRcdGlmICh0eXBlLmluY2x1ZGVzKCdudWxsJykgJiYgKHR5cGUuaW5jbHVkZXMoJ3N0cmluZycpIHx8IHR5cGUuaW5jbHVkZXMoJ2Jvb2xlYW4nKSB8fCB0eXBlLmluY2x1ZGVzKCdpbnRlZ2VyJykgfHwgdHlwZS5pbmNsdWRlcygnbnVtYmVyJykpKSB7XG5cdFx0XHRcdHJldHVybiAnc2ltcGxlJztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHQgb2YgdHlwZSkge1xuXHRcdFx0aWYgKCFpc1NpbXBsZVR5cGUodCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gJ2NvbXBsZXgnO1xuXHR9XG5cblx0aWYgKGlzU2ltcGxlVHlwZSh0eXBlKSkge1xuXHRcdHJldHVybiAnc2ltcGxlJztcblx0fVxuXG5cdGlmICh0eXBlID09PSAnYXJyYXknKSB7XG5cdFx0aWYgKHNjaGVtYS5pdGVtcykge1xuXHRcdFx0Y29uc3QgaXRlbVNjaGVtYXMgPSBBcnJheS5pc0FycmF5KHNjaGVtYS5pdGVtcykgPyBzY2hlbWEuaXRlbXMgOiBbc2NoZW1hLml0ZW1zXTtcblx0XHRcdGZvciAoY29uc3QgeyB0eXBlIH0gb2YgaXRlbVNjaGVtYXMpIHtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkodHlwZSkpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHQgb2YgdHlwZSkge1xuXHRcdFx0XHRcdFx0aWYgKCFpc1NpbXBsZVR5cGUodCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gJ2NvbXBsZXgnO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghaXNTaW1wbGVUeXBlKHR5cGUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiAnY29tcGxleCc7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gZ2V0T2JqZWN0U2V0dGluZ1NjaGVtYVR5cGUoe1xuXHRrZXksXG5cdHR5cGUsXG5cdG9iamVjdFByb3BlcnRpZXMsXG5cdG9iamVjdFBhdHRlcm5Qcm9wZXJ0aWVzLFxuXHRvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllc1xufTogSVNldHRpbmcpOiAnc2ltcGxlJyB8ICdjb21wbGV4JyB8IGZhbHNlIHtcblx0aWYgKHR5cGUgIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8gb2JqZWN0IGNhbiBoYXZlIGFueSBzaGFwZVxuXHRpZiAoXG5cdFx0aXNVbmRlZmluZWRPck51bGwob2JqZWN0UHJvcGVydGllcykgJiZcblx0XHRpc1VuZGVmaW5lZE9yTnVsbChvYmplY3RQYXR0ZXJuUHJvcGVydGllcykgJiZcblx0XHRpc1VuZGVmaW5lZE9yTnVsbChvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcylcblx0KSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8gb2JqZWN0QWRkaXRpb25hbFByb3BlcnRpZXMgYWxsb3cgdGhlIHNldHRpbmcgdG8gaGF2ZSBhbnkgc2hhcGUsXG5cdC8vIGJ1dCBpZiB0aGVyZSdzIGEgcGF0dGVybiBwcm9wZXJ0eSB0aGF0IGhhbmRsZXMgZXZlcnl0aGluZywgdGhlbiBldmVyeVxuXHQvLyBwcm9wZXJ0eSB3aWxsIG1hdGNoIHRoYXQgcGF0dGVyblByb3BlcnR5LCBzbyB3ZSBkb24ndCBuZWVkIHRvIGxvb2sgYXRcblx0Ly8gdGhlIHZhbHVlIG9mIG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzIGluIHRoYXQgY2FzZS5cblx0aWYgKChvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcyA9PT0gdHJ1ZSB8fCBvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcyA9PT0gdW5kZWZpbmVkKVxuXHRcdCYmICFPYmplY3Qua2V5cyhvYmplY3RQYXR0ZXJuUHJvcGVydGllcyA/PyB7fSkuaW5jbHVkZXMoJy4qJykpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBzY2hlbWFzID0gWy4uLk9iamVjdC52YWx1ZXMob2JqZWN0UHJvcGVydGllcyA/PyB7fSksIC4uLk9iamVjdC52YWx1ZXMob2JqZWN0UGF0dGVyblByb3BlcnRpZXMgPz8ge30pXTtcblxuXHRpZiAob2JqZWN0QWRkaXRpb25hbFByb3BlcnRpZXMgJiYgdHlwZW9mIG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzID09PSAnb2JqZWN0Jykge1xuXHRcdHNjaGVtYXMucHVzaChvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcyk7XG5cdH1cblxuXHRsZXQgc2NoZW1hVHlwZTogJ3NpbXBsZScgfCAnY29tcGxleCcgfCBmYWxzZSA9ICdzaW1wbGUnO1xuXHRmb3IgKGNvbnN0IHNjaGVtYSBvZiBzY2hlbWFzKSB7XG5cdFx0Zm9yIChjb25zdCBzdWJTY2hlbWEgb2YgQXJyYXkuaXNBcnJheShzY2hlbWEuYW55T2YpID8gc2NoZW1hLmFueU9mIDogW3NjaGVtYV0pIHtcblx0XHRcdGNvbnN0IHN1YlNjaGVtYVR5cGUgPSBnZXRPYmplY3RSZW5kZXJhYmxlU2NoZW1hVHlwZShzdWJTY2hlbWEsIGtleSk7XG5cdFx0XHRpZiAoc3ViU2NoZW1hVHlwZSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHN1YlNjaGVtYVR5cGUgPT09ICdjb21wbGV4Jykge1xuXHRcdFx0XHRzY2hlbWFUeXBlID0gJ2NvbXBsZXgnO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBzY2hlbWFUeXBlO1xufVxuXG5mdW5jdGlvbiBzZXR0aW5nVHlwZUVudW1SZW5kZXJhYmxlKF90eXBlOiBzdHJpbmcgfCBzdHJpbmdbXSkge1xuXHRjb25zdCBlbnVtUmVuZGVyYWJsZVNldHRpbmdUeXBlcyA9IFsnc3RyaW5nJywgJ2Jvb2xlYW4nLCAnbnVsbCcsICdpbnRlZ2VyJywgJ251bWJlciddO1xuXHRjb25zdCB0eXBlID0gQXJyYXkuaXNBcnJheShfdHlwZSkgPyBfdHlwZSA6IFtfdHlwZV07XG5cdHJldHVybiB0eXBlLmV2ZXJ5KHR5cGUgPT4gZW51bVJlbmRlcmFibGVTZXR0aW5nVHlwZXMuaW5jbHVkZXModHlwZSkpO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBTZWFyY2hSZXN1bHRJZHgge1xuXHRMb2NhbCA9IDAsXG5cdFJlbW90ZSA9IDEsXG5cdE5ld0V4dGVuc2lvbnMgPSAyLFxuXHRFbWJlZGRpbmdzID0gMyxcblx0QWlTZWxlY3RlZCA9IDRcbn1cblxuZXhwb3J0IGNsYXNzIFNlYXJjaFJlc3VsdE1vZGVsIGV4dGVuZHMgU2V0dGluZ3NUcmVlTW9kZWwge1xuXHRwcml2YXRlIHJhd1NlYXJjaFJlc3VsdHM6IElTZWFyY2hSZXN1bHRbXSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGNhY2hlZFVuaXF1ZVNlYXJjaFJlc3VsdHM6IE1hcDxib29sZWFuLCBJU2VhcmNoUmVzdWx0IHwgbnVsbD47XG5cdHByaXZhdGUgbmV3RXh0ZW5zaW9uU2VhcmNoUmVzdWx0czogSVNlYXJjaFJlc3VsdCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHNlYXJjaFJlc3VsdENvdW50OiBudW1iZXIgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBzZXR0aW5nc09yZGVyQnlUb2NJbmRleDogTWFwPHN0cmluZywgbnVtYmVyPiB8IG51bGw7XG5cdHByaXZhdGUgYWlGaWx0ZXJFbmFibGVkOiBib29sZWFuID0gZmFsc2U7XG5cblx0cmVhZG9ubHkgaWQgPSAnc2VhcmNoUmVzdWx0TW9kZWwnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHZpZXdTdGF0ZTogSVNldHRpbmdzRWRpdG9yVmlld1N0YXRlLFxuXHRcdHNldHRpbmdzT3JkZXJCeVRvY0luZGV4OiBNYXA8c3RyaW5nLCBudW1iZXI+IHwgbnVsbCxcblx0XHRpc1dvcmtzcGFjZVRydXN0ZWQ6IGJvb2xlYW4sXG5cdFx0QElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHZpZXdTdGF0ZSwgaXNXb3Jrc3BhY2VUcnVzdGVkLCBjb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHR0aGlzLnNldHRpbmdzT3JkZXJCeVRvY0luZGV4ID0gc2V0dGluZ3NPcmRlckJ5VG9jSW5kZXg7XG5cdFx0dGhpcy5jYWNoZWRVbmlxdWVTZWFyY2hSZXN1bHRzID0gbmV3IE1hcCgpO1xuXHRcdHRoaXMudXBkYXRlKHsgaWQ6ICdzZWFyY2hSZXN1bHRNb2RlbCcsIGxhYmVsOiAnJyB9KTtcblx0fVxuXG5cdHNldCBzaG93QWlSZXN1bHRzKHNob3c6IGJvb2xlYW4pIHtcblx0XHR0aGlzLmFpRmlsdGVyRW5hYmxlZCA9IHNob3c7XG5cdFx0dGhpcy51cGRhdGVDaGlsZHJlbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBzb3J0UmVzdWx0cyhmaWx0ZXJNYXRjaGVzOiBJU2V0dGluZ01hdGNoW10pOiBJU2V0dGluZ01hdGNoW10ge1xuXHRcdGlmICh0aGlzLnNldHRpbmdzT3JkZXJCeVRvY0luZGV4KSB7XG5cdFx0XHRmb3IgKGNvbnN0IG1hdGNoIG9mIGZpbHRlck1hdGNoZXMpIHtcblx0XHRcdFx0bWF0Y2guc2V0dGluZy5pbnRlcm5hbE9yZGVyID0gdGhpcy5zZXR0aW5nc09yZGVyQnlUb2NJbmRleC5nZXQobWF0Y2guc2V0dGluZy5rZXkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRoZSBzZWFyY2ggb25seSBoYXMgZmlsdGVycywgc28gd2UgY2FuIHNvcnQgYnkgdGhlIG9yZGVyIGluIHRoZSBUT0MuXG5cdFx0aWYgKCF0aGlzLl92aWV3U3RhdGUucXVlcnkpIHtcblx0XHRcdHJldHVybiBmaWx0ZXJNYXRjaGVzLnNvcnQoKGEsIGIpID0+IGNvbXBhcmVUd29OdWxsYWJsZU51bWJlcnMoYS5zZXR0aW5nLmludGVybmFsT3JkZXIsIGIuc2V0dGluZy5pbnRlcm5hbE9yZGVyKSk7XG5cdFx0fVxuXG5cdFx0Ly8gU29ydCB0aGUgc2V0dGluZ3MgYWNjb3JkaW5nIHRvIHRoZWlyIHJlbGV2YW5jeS5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTk3NzczXG5cdFx0ZmlsdGVyTWF0Y2hlcy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAoYS5tYXRjaFR5cGUgIT09IGIubWF0Y2hUeXBlKSB7XG5cdFx0XHRcdC8vIFNvcnQgYnkgbWF0Y2ggdHlwZSBpZiB0aGUgbWF0Y2ggdHlwZXMgYXJlIG5vdCB0aGUgc2FtZS5cblx0XHRcdFx0Ly8gVGhlIHByaW9yaXR5IG9mIHRoZSBtYXRjaCB0eXBlIGlzIGdpdmVuIGJ5IHRoZSBTZXR0aW5nTWF0Y2hUeXBlIGVudW0uXG5cdFx0XHRcdHJldHVybiBiLm1hdGNoVHlwZSAtIGEubWF0Y2hUeXBlO1xuXHRcdFx0fSBlbHNlIGlmICgoYS5tYXRjaFR5cGUgJiBTZXR0aW5nTWF0Y2hUeXBlLk5vbkNvbnRpZ3VvdXNXb3Jkc0luU2V0dGluZ3NMYWJlbCkgfHwgKGEubWF0Y2hUeXBlICYgU2V0dGluZ01hdGNoVHlwZS5Db250aWd1b3VzV29yZHNJblNldHRpbmdzTGFiZWwpKSB7XG5cdFx0XHRcdC8vIFRoZSBtYXRjaCB0eXBlcyBvZiBhIGFuZCBiIGFyZSB0aGUgc2FtZSBhbmQgY2FuIGJlIHNvcnRlZCBieSB0aGVpciBudW1iZXIgb2YgbWF0Y2hlZCB3b3Jkcy5cblx0XHRcdFx0Ly8gSWYgdGhvc2UgbnVtYmVycyBhcmUgdGhlIHNhbWUsIHNvcnQgYnkgdGhlIG9yZGVyIGluIHRoZSB0YWJsZSBvZiBjb250ZW50cy5cblx0XHRcdFx0cmV0dXJuIChiLmtleU1hdGNoU2NvcmUgLSBhLmtleU1hdGNoU2NvcmUpIHx8IGNvbXBhcmVUd29OdWxsYWJsZU51bWJlcnMoYS5zZXR0aW5nLmludGVybmFsT3JkZXIsIGIuc2V0dGluZy5pbnRlcm5hbE9yZGVyKTtcblx0XHRcdH0gZWxzZSBpZiAoYS5tYXRjaFR5cGUgPT09IFNldHRpbmdNYXRjaFR5cGUuUmVtb3RlTWF0Y2gpIHtcblx0XHRcdFx0Ly8gVGhlIG1hdGNoIHR5cGVzIGFyZSB0aGUgc2FtZSBhbmQgYXJlIFJlbW90ZU1hdGNoLlxuXHRcdFx0XHQvLyBTb3J0IGJ5IHNjb3JlLlxuXHRcdFx0XHRyZXR1cm4gYi5zY29yZSAtIGEuc2NvcmU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBUaGUgbWF0Y2ggdHlwZXMgYXJlIHRoZSBzYW1lIGJ1dCBhcmUgbm90IFJlbW90ZU1hdGNoLlxuXHRcdFx0XHQvLyBTb3J0IGJ5IHRoZWlyIG9yZGVyIGluIHRoZSB0YWJsZSBvZiBjb250ZW50cy5cblx0XHRcdFx0cmV0dXJuIGNvbXBhcmVUd29OdWxsYWJsZU51bWJlcnMoYS5zZXR0aW5nLmludGVybmFsT3JkZXIsIGIuc2V0dGluZy5pbnRlcm5hbE9yZGVyKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIFJlbW92ZSBkdXBsaWNhdGVzLCB3aGljaCBzb21ldGltZXMgb2NjdXIgd2l0aCBzZXR0aW5nc1xuXHRcdC8vIHN1Y2ggYXMgdGhlIGV4cGVyaW1lbnRhbCB0b2dnbGUgc2V0dGluZy5cblx0XHRyZXR1cm4gYXJyYXlzLmRpc3RpbmN0KGZpbHRlck1hdGNoZXMsIChtYXRjaCkgPT4gbWF0Y2guc2V0dGluZy5rZXkpO1xuXHR9XG5cblx0Z2V0VW5pcXVlU2VhcmNoUmVzdWx0cygpOiBJU2VhcmNoUmVzdWx0IHwgbnVsbCB7XG5cdFx0Y29uc3QgY2FjaGVkUmVzdWx0cyA9IHRoaXMuY2FjaGVkVW5pcXVlU2VhcmNoUmVzdWx0cy5nZXQodGhpcy5haUZpbHRlckVuYWJsZWQpO1xuXHRcdGlmIChjYWNoZWRSZXN1bHRzKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkUmVzdWx0cztcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMucmF3U2VhcmNoUmVzdWx0cykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0bGV0IGNvbWJpbmVkRmlsdGVyTWF0Y2hlczogSVNldHRpbmdNYXRjaFtdID0gW107XG5cblx0XHRpZiAodGhpcy5haUZpbHRlckVuYWJsZWQpIHtcblx0XHRcdGNvbnN0IGFpU2VsZWN0ZWRLZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRjb25zdCBhaVNlbGVjdGVkUmVzdWx0ID0gdGhpcy5yYXdTZWFyY2hSZXN1bHRzW1NlYXJjaFJlc3VsdElkeC5BaVNlbGVjdGVkXTtcblx0XHRcdGlmIChhaVNlbGVjdGVkUmVzdWx0KSB7XG5cdFx0XHRcdGFpU2VsZWN0ZWRSZXN1bHQuZmlsdGVyTWF0Y2hlcy5mb3JFYWNoKG0gPT4gYWlTZWxlY3RlZEtleXMuYWRkKG0uc2V0dGluZy5rZXkpKTtcblx0XHRcdFx0Y29tYmluZWRGaWx0ZXJNYXRjaGVzID0gYWlTZWxlY3RlZFJlc3VsdC5maWx0ZXJNYXRjaGVzO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbWJlZGRpbmdzUmVzdWx0ID0gdGhpcy5yYXdTZWFyY2hSZXN1bHRzW1NlYXJjaFJlc3VsdElkeC5FbWJlZGRpbmdzXTtcblx0XHRcdGlmIChlbWJlZGRpbmdzUmVzdWx0KSB7XG5cdFx0XHRcdGVtYmVkZGluZ3NSZXN1bHQuZmlsdGVyTWF0Y2hlcyA9IGVtYmVkZGluZ3NSZXN1bHQuZmlsdGVyTWF0Y2hlcy5maWx0ZXIobSA9PiAhYWlTZWxlY3RlZEtleXMuaGFzKG0uc2V0dGluZy5rZXkpKTtcblx0XHRcdFx0Y29tYmluZWRGaWx0ZXJNYXRjaGVzID0gY29tYmluZWRGaWx0ZXJNYXRjaGVzLmNvbmNhdChlbWJlZGRpbmdzUmVzdWx0LmZpbHRlck1hdGNoZXMpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0ge1xuXHRcdFx0XHRmaWx0ZXJNYXRjaGVzOiBjb21iaW5lZEZpbHRlck1hdGNoZXMsXG5cdFx0XHRcdGV4YWN0TWF0Y2g6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5jYWNoZWRVbmlxdWVTZWFyY2hSZXN1bHRzLnNldCh0cnVlLCByZXN1bHQpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRjb25zdCBsb2NhbE1hdGNoS2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGxvY2FsUmVzdWx0ID0gdGhpcy5yYXdTZWFyY2hSZXN1bHRzW1NlYXJjaFJlc3VsdElkeC5Mb2NhbF07XG5cdFx0aWYgKGxvY2FsUmVzdWx0KSB7XG5cdFx0XHRsb2NhbFJlc3VsdC5maWx0ZXJNYXRjaGVzLmZvckVhY2gobSA9PiBsb2NhbE1hdGNoS2V5cy5hZGQobS5zZXR0aW5nLmtleSkpO1xuXHRcdFx0Y29tYmluZWRGaWx0ZXJNYXRjaGVzID0gbG9jYWxSZXN1bHQuZmlsdGVyTWF0Y2hlcztcblx0XHR9XG5cblx0XHRjb25zdCByZW1vdGVSZXN1bHQgPSB0aGlzLnJhd1NlYXJjaFJlc3VsdHNbU2VhcmNoUmVzdWx0SWR4LlJlbW90ZV07XG5cdFx0aWYgKHJlbW90ZVJlc3VsdCkge1xuXHRcdFx0cmVtb3RlUmVzdWx0LmZpbHRlck1hdGNoZXMgPSByZW1vdGVSZXN1bHQuZmlsdGVyTWF0Y2hlcy5maWx0ZXIobSA9PiAhbG9jYWxNYXRjaEtleXMuaGFzKG0uc2V0dGluZy5rZXkpKTtcblx0XHRcdGNvbWJpbmVkRmlsdGVyTWF0Y2hlcyA9IGNvbWJpbmVkRmlsdGVyTWF0Y2hlcy5jb25jYXQocmVtb3RlUmVzdWx0LmZpbHRlck1hdGNoZXMpO1xuXG5cdFx0XHR0aGlzLm5ld0V4dGVuc2lvblNlYXJjaFJlc3VsdHMgPSB0aGlzLnJhd1NlYXJjaFJlc3VsdHNbU2VhcmNoUmVzdWx0SWR4Lk5ld0V4dGVuc2lvbnNdO1xuXHRcdH1cblx0XHRjb21iaW5lZEZpbHRlck1hdGNoZXMgPSB0aGlzLnNvcnRSZXN1bHRzKGNvbWJpbmVkRmlsdGVyTWF0Y2hlcyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0ge1xuXHRcdFx0ZmlsdGVyTWF0Y2hlczogY29tYmluZWRGaWx0ZXJNYXRjaGVzLFxuXHRcdFx0ZXhhY3RNYXRjaDogbG9jYWxSZXN1bHQuZXhhY3RNYXRjaCAvLyByZW1vdGUgcmVzdWx0cyBzaG91bGQgbmV2ZXIgaGF2ZSBhbiBleGFjdCBtYXRjaFxuXHRcdH07XG5cdFx0dGhpcy5jYWNoZWRVbmlxdWVTZWFyY2hSZXN1bHRzLnNldChmYWxzZSwgcmVzdWx0KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Z2V0UmF3UmVzdWx0cygpOiBJU2VhcmNoUmVzdWx0W10ge1xuXHRcdHJldHVybiB0aGlzLnJhd1NlYXJjaFJlc3VsdHMgPz8gW107XG5cdH1cblxuXHRwcml2YXRlIGdldFVuaXF1ZVNlYXJjaFJlc3VsdFNldHRpbmdzKCk6IElTZXR0aW5nW10ge1xuXHRcdHJldHVybiB0aGlzLmdldFVuaXF1ZVNlYXJjaFJlc3VsdHMoKT8uZmlsdGVyTWF0Y2hlcy5tYXAobSA9PiBtLnNldHRpbmcpID8/IFtdO1xuXHR9XG5cblx0dXBkYXRlQ2hpbGRyZW4oKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGUoe1xuXHRcdFx0aWQ6ICdzZWFyY2hSZXN1bHRNb2RlbCcsXG5cdFx0XHRsYWJlbDogJ3NlYXJjaFJlc3VsdE1vZGVsJyxcblx0XHRcdHNldHRpbmdzOiB0aGlzLmdldFVuaXF1ZVNlYXJjaFJlc3VsdFNldHRpbmdzKClcblx0XHR9KTtcblxuXHRcdC8vIFNhdmUgdGltZSBieSBmaWx0ZXJpbmcgY2hpbGRyZW4gaW4gdGhlIHNlYXJjaCBtb2RlbCBpbnN0ZWFkIG9mIHJlbHlpbmcgb24gdGhlIHRyZWUgZmlsdGVyLCB3aGljaCBzdGlsbCByZXF1aXJlcyBoZWlnaHRzIHRvIGJlIGNhbGN1bGF0ZWQuXG5cdFx0Y29uc3QgaXNSZW1vdGUgPSAhIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblxuXHRcdGNvbnN0IG5ld0NoaWxkcmVuID0gW107XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLnJvb3QuY2hpbGRyZW4pIHtcblx0XHRcdGlmIChjaGlsZCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50XG5cdFx0XHRcdCYmIGNoaWxkLm1hdGNoZXNBbGxUYWdzKHRoaXMuX3ZpZXdTdGF0ZS50YWdGaWx0ZXJzKVxuXHRcdFx0XHQmJiBjaGlsZC5tYXRjaGVzU2NvcGUodGhpcy5fdmlld1N0YXRlLnNldHRpbmdzVGFyZ2V0LCBpc1JlbW90ZSlcblx0XHRcdFx0JiYgY2hpbGQubWF0Y2hlc0FueUV4dGVuc2lvbih0aGlzLl92aWV3U3RhdGUuZXh0ZW5zaW9uRmlsdGVycylcblx0XHRcdFx0JiYgY2hpbGQubWF0Y2hlc0FueUlkKHRoaXMuX3ZpZXdTdGF0ZS5pZEZpbHRlcnMpXG5cdFx0XHRcdCYmIGNoaWxkLm1hdGNoZXNBbnlGZWF0dXJlKHRoaXMuX3ZpZXdTdGF0ZS5mZWF0dXJlRmlsdGVycylcblx0XHRcdFx0JiYgY2hpbGQubWF0Y2hlc0FsbExhbmd1YWdlcyh0aGlzLl92aWV3U3RhdGUubGFuZ3VhZ2VGaWx0ZXIpKSB7XG5cdFx0XHRcdG5ld0NoaWxkcmVuLnB1c2goY2hpbGQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y2hpbGQuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLnJvb3QuY2hpbGRyZW4gPSBuZXdDaGlsZHJlbjtcblx0XHR0aGlzLnNlYXJjaFJlc3VsdENvdW50ID0gdGhpcy5yb290LmNoaWxkcmVuLmxlbmd0aDtcblxuXHRcdGlmICh0aGlzLm5ld0V4dGVuc2lvblNlYXJjaFJlc3VsdHM/LmZpbHRlck1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHRsZXQgcmVzdWx0RXh0ZW5zaW9uSWRzID0gdGhpcy5uZXdFeHRlbnNpb25TZWFyY2hSZXN1bHRzLmZpbHRlck1hdGNoZXNcblx0XHRcdFx0Lm1hcChyZXN1bHQgPT4gKDxJRXh0ZW5zaW9uU2V0dGluZz5yZXN1bHQuc2V0dGluZykpXG5cdFx0XHRcdC5maWx0ZXIoc2V0dGluZyA9PiBzZXR0aW5nLmV4dGVuc2lvbk5hbWUgJiYgc2V0dGluZy5leHRlbnNpb25QdWJsaXNoZXIpXG5cdFx0XHRcdC5tYXAoc2V0dGluZyA9PiBgJHtzZXR0aW5nLmV4dGVuc2lvblB1Ymxpc2hlcn0uJHtzZXR0aW5nLmV4dGVuc2lvbk5hbWV9YCk7XG5cdFx0XHRyZXN1bHRFeHRlbnNpb25JZHMgPSBhcnJheXMuZGlzdGluY3QocmVzdWx0RXh0ZW5zaW9uSWRzKTtcblxuXHRcdFx0aWYgKHJlc3VsdEV4dGVuc2lvbklkcy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgbmV3RXh0RWxlbWVudCA9IG5ldyBTZXR0aW5nc1RyZWVOZXdFeHRlbnNpb25zRWxlbWVudCgnbmV3RXh0ZW5zaW9ucycsIHJlc3VsdEV4dGVuc2lvbklkcyk7XG5cdFx0XHRcdG5ld0V4dEVsZW1lbnQucGFyZW50ID0gdGhpcy5fcm9vdDtcblx0XHRcdFx0dGhpcy5fcm9vdC5jaGlsZHJlbi5wdXNoKG5ld0V4dEVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHNldFJlc3VsdChvcmRlcjogU2VhcmNoUmVzdWx0SWR4LCByZXN1bHQ6IElTZWFyY2hSZXN1bHQgfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5jYWNoZWRVbmlxdWVTZWFyY2hSZXN1bHRzLmNsZWFyKCk7XG5cdFx0dGhpcy5uZXdFeHRlbnNpb25TZWFyY2hSZXN1bHRzID0gbnVsbDtcblxuXHRcdGlmICh0aGlzLnJhd1NlYXJjaFJlc3VsdHMgJiYgb3JkZXIgPT09IFNlYXJjaFJlc3VsdElkeC5Mb2NhbCkge1xuXHRcdFx0Ly8gVG8gcHJldmVudCB0aGUgU2V0dGluZ3MgZWRpdG9yIGZyb20gc2hvd2luZ1xuXHRcdFx0Ly8gc3RhbGUgcmVtb3RlIHJlc3VsdHMgbWlkLXNlYXJjaC5cblx0XHRcdGRlbGV0ZSB0aGlzLnJhd1NlYXJjaFJlc3VsdHNbU2VhcmNoUmVzdWx0SWR4LlJlbW90ZV07XG5cdFx0fVxuXG5cdFx0dGhpcy5yYXdTZWFyY2hSZXN1bHRzID8/PSBbXTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0ZGVsZXRlIHRoaXMucmF3U2VhcmNoUmVzdWx0c1tvcmRlcl07XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yYXdTZWFyY2hSZXN1bHRzW29yZGVyXSA9IHJlc3VsdDtcblx0XHR0aGlzLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdH1cblxuXHRnZXRVbmlxdWVSZXN1bHRzQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5zZWFyY2hSZXN1bHRDb3VudCA/PyAwO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVBhcnNlZFF1ZXJ5IHtcblx0dGFnczogc3RyaW5nW107XG5cdHF1ZXJ5OiBzdHJpbmc7XG5cdGV4dGVuc2lvbkZpbHRlcnM6IHN0cmluZ1tdO1xuXHRpZEZpbHRlcnM6IHN0cmluZ1tdO1xuXHRmZWF0dXJlRmlsdGVyczogc3RyaW5nW107XG5cdGxhbmd1YWdlRmlsdGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmNvbnN0IHRhZ1JlZ2V4ID0gLyhefFxccylAdGFnOihcIihbXlwiXSopXCJ8W15cIl1cXFMqKS9nO1xuY29uc3QgZXh0ZW5zaW9uUmVnZXggPSAvKF58XFxzKUBleHQ6KFwiKFteXCJdKilcInxbXlwiXVxcUyopPy9nO1xuY29uc3QgZmVhdHVyZVJlZ2V4ID0gLyhefFxccylAZmVhdHVyZTooXCIoW15cIl0qKVwifFteXCJdXFxTKik/L2c7XG5jb25zdCBpZFJlZ2V4ID0gLyhefFxccylAaWQ6KFwiKFteXCJdKilcInxbXlwiXVxcUyopPy9nO1xuY29uc3QgbGFuZ3VhZ2VSZWdleCA9IC8oXnxcXHMpQGxhbmc6KFwiKFteXCJdKilcInxbXlwiXVxcUyopPy9nO1xuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VRdWVyeShxdWVyeTogc3RyaW5nKTogSVBhcnNlZFF1ZXJ5IHtcblx0LyoqXG5cdCAqIEEgaGVscGVyIGZ1bmN0aW9uIHRvIHBhcnNlIHRoZSBxdWVyeSBvbiBvbmUgdHlwZSBvZiByZWdleC5cblx0ICpcblx0ICogQHBhcmFtIHF1ZXJ5IFRoZSBzZWFyY2ggcXVlcnlcblx0ICogQHBhcmFtIGZpbHRlclJlZ2V4IFRoZSByZWdleCB0byB1c2Ugb24gdGhlIHF1ZXJ5XG5cdCAqIEBwYXJhbSBwYXJzZWRQYXJ0cyBUaGUgcGFydHMgdGhhdCB0aGUgcmVnZXggcGFyc2VzIG91dCB3aWxsIGJlIGFwcGVuZGVkIHRvIHRoZSBhcnJheSBwYXNzZWQgaW4gaGVyZS5cblx0ICogQHJldHVybnMgVGhlIHF1ZXJ5IHdpdGggdGhlIHBhcnNlZCBwYXJ0cyByZW1vdmVkXG5cdCAqL1xuXHRmdW5jdGlvbiBnZXRUYWdzRm9yVHlwZShxdWVyeTogc3RyaW5nLCBmaWx0ZXJSZWdleDogUmVnRXhwLCBwYXJzZWRQYXJ0czogc3RyaW5nW10pOiBzdHJpbmcge1xuXHRcdHJldHVybiBxdWVyeS5yZXBsYWNlKGZpbHRlclJlZ2V4LCAoXywgX18sIHF1b3RlZFBhcnNlZEVsZW1lbnQsIHVucXVvdGVkUGFyc2VkRWxlbWVudCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyc2VkRWxlbWVudDogc3RyaW5nID0gdW5xdW90ZWRQYXJzZWRFbGVtZW50IHx8IHF1b3RlZFBhcnNlZEVsZW1lbnQ7XG5cdFx0XHRpZiAocGFyc2VkRWxlbWVudCkge1xuXHRcdFx0XHRwYXJzZWRQYXJ0cy5wdXNoKC4uLnBhcnNlZEVsZW1lbnQuc3BsaXQoJywnKS5tYXAocyA9PiBzLnRyaW0oKSkuZmlsdGVyKHMgPT4gIWlzRmFsc3lPcldoaXRlc3BhY2UocykpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiAnJztcblx0XHR9KTtcblx0fVxuXG5cdGNvbnN0IHRhZ3M6IHN0cmluZ1tdID0gW107XG5cdHF1ZXJ5ID0gcXVlcnkucmVwbGFjZSh0YWdSZWdleCwgKF8sIF9fLCBxdW90ZWRUYWcsIHRhZykgPT4ge1xuXHRcdHRhZ3MucHVzaCh0YWcgfHwgcXVvdGVkVGFnKTtcblx0XHRyZXR1cm4gJyc7XG5cdH0pO1xuXG5cdHF1ZXJ5ID0gcXVlcnkucmVwbGFjZShgQCR7TU9ESUZJRURfU0VUVElOR19UQUd9YCwgKCkgPT4ge1xuXHRcdHRhZ3MucHVzaChNT0RJRklFRF9TRVRUSU5HX1RBRyk7XG5cdFx0cmV0dXJuICcnO1xuXHR9KTtcblxuXHRxdWVyeSA9IHF1ZXJ5LnJlcGxhY2UoYEAke1BPTElDWV9TRVRUSU5HX1RBR31gLCAoKSA9PiB7XG5cdFx0dGFncy5wdXNoKFBPTElDWV9TRVRUSU5HX1RBRyk7XG5cdFx0cmV0dXJuICcnO1xuXHR9KTtcblxuXHRxdWVyeSA9IHF1ZXJ5LnJlcGxhY2UoYEAke0FHRU5UU19XSU5ET1dfU0VUVElOR19UQUd9YCwgKCkgPT4ge1xuXHRcdHRhZ3MucHVzaChBR0VOVFNfV0lORE9XX1NFVFRJTkdfVEFHKTtcblx0XHRyZXR1cm4gJyc7XG5cdH0pO1xuXG5cdC8vIEhhbmRsZSBAc3RhYmxlIGJ5IGV4Y2x1ZGluZyBwcmV2aWV3IGFuZCBleHBlcmltZW50YWwgdGFnc1xuXHRxdWVyeSA9IHF1ZXJ5LnJlcGxhY2UoL0BzdGFibGUvZywgKCkgPT4ge1xuXHRcdHRhZ3MucHVzaCgnc3RhYmxlJyk7XG5cdFx0cmV0dXJuICcnO1xuXHR9KTtcblxuXHRjb25zdCBleHRlbnNpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBmZWF0dXJlczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3QgaWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBsYW5nczogc3RyaW5nW10gPSBbXTtcblx0cXVlcnkgPSBnZXRUYWdzRm9yVHlwZShxdWVyeSwgZXh0ZW5zaW9uUmVnZXgsIGV4dGVuc2lvbnMpO1xuXHRxdWVyeSA9IGdldFRhZ3NGb3JUeXBlKHF1ZXJ5LCBmZWF0dXJlUmVnZXgsIGZlYXR1cmVzKTtcblx0cXVlcnkgPSBnZXRUYWdzRm9yVHlwZShxdWVyeSwgaWRSZWdleCwgaWRzKTtcblxuXHRpZiAoRU5BQkxFX0xBTkdVQUdFX0ZJTFRFUikge1xuXHRcdHF1ZXJ5ID0gZ2V0VGFnc0ZvclR5cGUocXVlcnksIGxhbmd1YWdlUmVnZXgsIGxhbmdzKTtcblx0fVxuXG5cdHF1ZXJ5ID0gcXVlcnkudHJpbSgpO1xuXG5cdC8vIEZvciBub3csIG9ubHkgcmV0dXJuIHRoZSBmaXJzdCBmb3VuZCBsYW5ndWFnZSBmaWx0ZXJcblx0cmV0dXJuIHtcblx0XHR0YWdzLFxuXHRcdGV4dGVuc2lvbkZpbHRlcnM6IGV4dGVuc2lvbnMsXG5cdFx0ZmVhdHVyZUZpbHRlcnM6IGZlYXR1cmVzLFxuXHRcdGlkRmlsdGVyczogaWRzLFxuXHRcdGxhbmd1YWdlRmlsdGVyOiBsYW5ncy5sZW5ndGggPyBsYW5nc1swXSA6IHVuZGVmaW5lZCxcblx0XHRxdWVyeSxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsZUFBZTtBQUV4QixTQUFTLGtCQUErQjtBQUN4QyxTQUFTLHdCQUF3QiwyQkFBMkI7QUFDNUQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCLHFDQUEwRDtBQUN4RixTQUEwQyxvQkFBb0IsdUJBQXVCLGtCQUEwQztBQUMvSCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNDQUFzQztBQUMvQyxTQUFTLG9CQUFvQixlQUFlLGdDQUFnQyxzQkFBc0IsdUJBQXVCLHdCQUF3QjtBQUNqSixTQUFTLG9DQUFvQztBQUM3QyxTQUFvRSxrQkFBa0Isd0JBQXdCO0FBQzlHLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMkJBQTJCLGtDQUFrQyx3QkFBd0Isc0JBQXNCLG9CQUFvQix1Q0FBdUMsMkJBQTJCLGtCQUFrQjtBQUU1TixTQUFvQixlQUFlO0FBRTVCLE1BQU0sOEJBQThCO0FBYXBDLE1BQWUsNEJBQTRCLFdBQVc7QUFBQSxFQVM1RCxZQUFZLEtBQWE7QUFDeEIsVUFBTTtBQU5QLFNBQVEsWUFBWTtBQUVwQixTQUFpQix1QkFBdUIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBS3pFLFNBQUssS0FBSztBQUFBLEVBQ1g7QUFBQSxFQUxBLElBQUksc0JBQXNCO0FBQUUsV0FBTyxLQUFLLHFCQUFxQjtBQUFBLEVBQU87QUFBQSxFQU9wRSxJQUFJLFdBQW9CO0FBQ3ZCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksU0FBUyxPQUFnQjtBQUM1QixTQUFLLFlBQVk7QUFDakIs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O0FBQ2pCLE1BQU0saUJBQWlCO0FBQ3ZCLE1BQU0sZUFBZTtBQUNyQixNQUFNLFVBQVU7QUFDaEIsTUFBTSxnQkFBZ0I7QUFFZixTQUFTLFdBQVcsT0FBNkI7QUFTdkQsV0FBUyxlQUFlQyxRQUFlLGFBQXFCLGFBQStCO0FBQzFGLFdBQU9BLE9BQU0sUUFBUSxhQUFhLENBQUMsR0FBRyxJQUFJLHFCQUFxQiwwQkFBMEI7QUFDeEYsWUFBTSxnQkFBd0IseUJBQXlCO0FBQ3ZELFVBQUksZUFBZTtBQUNsQixvQkFBWSxLQUFLLEdBQUcsY0FBYyxNQUFNLEdBQUcsRUFBRSxJQUFJLE9BQUssRUFBRSxLQUFLLENBQUMsRUFBRSxPQUFPLE9BQUssQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUNyRztBQUNBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGO0FBRUEsUUFBTSxPQUFpQixDQUFDO0FBQ3hCLFVBQVEsTUFBTSxRQUFRLFVBQVUsQ0FBQyxHQUFHLElBQUksV0FBVyxRQUFRO0FBQzFELFNBQUssS0FBSyxPQUFPLFNBQVM7QUFDMUIsV0FBTztBQUFBLEVBQ1IsQ0FBQztBQUVELFVBQVEsTUFBTSxRQUFRLElBQUksb0JBQW9CLElBQUksTUFBTTtBQUN2RCxTQUFLLEtBQUssb0JBQW9CO0FBQzlCLFdBQU87QUFBQSxFQUNSLENBQUM7QUFFRCxVQUFRLE1BQU0sUUFBUSxJQUFJLGtCQUFrQixJQUFJLE1BQU07QUFDckQsU0FBSyxLQUFLLGtCQUFrQjtBQUM1QixXQUFPO0FBQUEsRUFDUixDQUFDO0FBRUQsVUFBUSxNQUFNLFFBQVEsSUFBSSx5QkFBeUIsSUFBSSxNQUFNO0FBQzVELFNBQUssS0FBSyx5QkFBeUI7QUFDbkMsV0FBTztBQUFBLEVBQ1IsQ0FBQztBQUdELFVBQVEsTUFBTSxRQUFRLFlBQVksTUFBTTtBQUN2QyxTQUFLLEtBQUssUUFBUTtBQUNsQixXQUFPO0FBQUEsRUFDUixDQUFDO0FBRUQsUUFBTSxhQUF1QixDQUFDO0FBQzlCLFFBQU0sV0FBcUIsQ0FBQztBQUM1QixRQUFNLE1BQWdCLENBQUM7QUFDdkIsUUFBTSxRQUFrQixDQUFDO0FBQ3pCLFVBQVEsZUFBZSxPQUFPLGdCQUFnQixVQUFVO0FBQ3hELFVBQVEsZUFBZSxPQUFPLGNBQWMsUUFBUTtBQUNwRCxVQUFRLGVBQWUsT0FBTyxTQUFTLEdBQUc7QUFFMUMsTUFBSSx3QkFBd0I7QUFDM0IsWUFBUSxlQUFlLE9BQU8sZUFBZSxLQUFLO0FBQUEsRUFDbkQ7QUFFQSxVQUFRLE1BQU0sS0FBSztBQUduQixTQUFPO0FBQUEsSUFDTjtBQUFBLElBQ0Esa0JBQWtCO0FBQUEsSUFDbEIsZ0JBQWdCO0FBQUEsSUFDaEIsV0FBVztBQUFBLElBQ1gsZ0JBQWdCLE1BQU0sU0FBUyxNQUFNLENBQUMsSUFBSTtBQUFBLElBQzFDO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogWyJmZWF0dXJlIiwgInR5cGUiLCAiU2VhcmNoUmVzdWx0SWR4IiwgInJlc3VsdCIsICJxdWVyeSJdCn0K
