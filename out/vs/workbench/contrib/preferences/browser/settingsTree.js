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
import { BrowserFeatures } from "../../../../base/browser/canIUse.js";
import * as DOM from "../../../../base/browser/dom.js";
import * as domStylesheetsJs from "../../../../base/browser/domStylesheets.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { SimpleIconLabel } from "../../../../base/browser/ui/iconLabel/simpleIconLabel.js";
import { InputBox } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { CachedListVirtualDelegate } from "../../../../base/browser/ui/list/list.js";
import { DefaultStyleController } from "../../../../base/browser/ui/list/listWidget.js";
import { SelectBox } from "../../../../base/browser/ui/selectBox/selectBox.js";
import { Toggle, unthemedToggleStyles } from "../../../../base/browser/ui/toggle/toggle.js";
import { ToolBar } from "../../../../base/browser/ui/toolbar/toolbar.js";
import { RenderIndentGuides } from "../../../../base/browser/ui/tree/abstractTree.js";
import { ObjectTreeModel } from "../../../../base/browser/ui/tree/objectTreeModel.js";
import { TreeVisibility } from "../../../../base/browser/ui/tree/tree.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { distinct } from "../../../../base/common/arrays.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, isDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { isIOS } from "../../../../base/common/platform.js";
import { escapeRegExpCharacters } from "../../../../base/common/strings.js";
import { isDefined, isUndefinedOrNull } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { localize } from "../../../../nls.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService, getLanguageTagSettingPlainKey } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IListService, WorkbenchObjectTree } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { defaultButtonStyles, getInputBoxStyle, getListStyles, getSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { editorBackground, foreground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { getIgnoredSettings } from "../../../../platform/userDataSync/common/settingsMerge.js";
import { IUserDataSyncEnablementService, getDefaultIgnoredSettings } from "../../../../platform/userDataSync/common/userDataSync.js";
import { hasNativeContextMenu } from "../../../../platform/window/common/window.js";
import { APPLICATION_SCOPES, APPLY_ALL_PROFILES_SETTING, IWorkbenchConfigurationService } from "../../../services/configuration/common/configuration.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { SETTINGS_AUTHORITY, SettingValueType } from "../../../services/preferences/common/preferences.js";
import { getInvalidTypeError } from "../../../services/preferences/common/preferencesValidation.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { LANGUAGE_SETTING_TAG, SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU, compareTwoNullableNumbers } from "../common/preferences.js";
import { settingsNumberInputBackground, settingsNumberInputBorder, settingsNumberInputForeground, settingsSelectBackground, settingsSelectBorder, settingsSelectForeground, settingsSelectListBorder, settingsTextInputBackground, settingsTextInputBorder, settingsTextInputForeground } from "../common/settingsEditorColorRegistry.js";
import { settingsMoreActionIcon } from "./preferencesIcons.js";
import { SettingsTreeIndicatorsLabel, getIndicatorsLabelAriaLabel } from "./settingsEditorSettingIndicators.js";
import { SettingsTreeGroupElement, SettingsTreeNewExtensionsElement, SettingsTreeSettingElement, inspectSetting, objectSettingSupportsRemoveDefaultValue, settingKeyToDisplayFormat } from "./settingsTreeModels.js";
import { ExcludeSettingWidget, IncludeSettingWidget, ListSettingWidget, ObjectSettingCheckboxWidget, ObjectSettingDropdownWidget } from "./settingsWidgets.js";
const $ = DOM.$;
const multiGroupTocSettings = /* @__PURE__ */ new Set([
  "accessibility.signals.chatUserActionRequired",
  "accessibility.signals.chatResponseReceived"
]);
function getIncludeExcludeDisplayValue(element) {
  const elementDefaultValue = typeof element.defaultValue === "object" ? element.defaultValue ?? {} : {};
  const data = element.isConfigured ? { ...elementDefaultValue, ...element.scopeValue } : elementDefaultValue;
  return Object.keys(data).filter((key) => !!data[key]).map((key) => {
    const defaultValue = elementDefaultValue[key];
    let source;
    if (defaultValue === data[key] && element.setting.type === "object" && element.defaultValueSource instanceof Map) {
      const defaultSource = element.defaultValueSource.get(`${element.setting.key}.${key}`);
      source = typeof defaultSource === "string" ? defaultSource : defaultSource?.displayName;
    }
    const value = data[key];
    const sibling = typeof value === "boolean" ? void 0 : value.when;
    return {
      value: {
        type: "string",
        data: key
      },
      sibling,
      elementType: element.valueType,
      source
    };
  });
}
function areAllPropertiesDefined(properties, itemsToDisplay) {
  const staticProperties = new Set(properties);
  itemsToDisplay.forEach(({ key }) => staticProperties.delete(key.data));
  return staticProperties.size === 0;
}
function getEnumOptionsFromSchema(schema) {
  if (schema.anyOf) {
    return schema.anyOf.map(getEnumOptionsFromSchema).flat();
  }
  const enumDescriptions = schema.enumDescriptions ?? [];
  return (schema.enum ?? []).map((value, idx) => {
    const description = idx < enumDescriptions.length ? enumDescriptions[idx] : void 0;
    return { value, description };
  });
}
function getObjectValueType(schema) {
  if (schema.anyOf) {
    const subTypes = schema.anyOf.map(getObjectValueType);
    if (subTypes.some((type) => type === "enum")) {
      return "enum";
    }
    return "string";
  }
  if (schema.type === "boolean") {
    return "boolean";
  } else if (schema.type === "string" && isDefined(schema.enum) && schema.enum.length > 0) {
    return "enum";
  } else {
    return "string";
  }
}
function getObjectEntryValueDisplayValue(type, data, options) {
  if (type === "boolean") {
    return { type, data: !!data };
  } else if (type === "enum") {
    return { type, data: "" + data, options };
  } else {
    return { type, data: "" + data };
  }
}
function getObjectDisplayValue(element) {
  const elementDefaultValue = typeof element.defaultValue === "object" ? element.defaultValue ?? {} : {};
  const elementScopeValue = typeof element.scopeValue === "object" ? element.scopeValue ?? {} : {};
  const data = element.isConfigured ? { ...elementDefaultValue, ...elementScopeValue } : element.hasPolicyValue || element.isAgentsWindowReadOnly ? element.scopeValue : elementDefaultValue;
  const { objectProperties, objectPatternProperties, objectAdditionalProperties } = element.setting;
  const patternsAndSchemas = Object.entries(objectPatternProperties ?? {}).map(([pattern, schema]) => ({
    pattern: new RegExp(pattern),
    schema
  }));
  const wellDefinedKeyEnumOptions = Object.entries(objectProperties ?? {}).map(
    ([key, schema]) => ({ value: key, description: schema.description })
  );
  return Object.keys(data).map((key) => {
    const defaultValue = elementDefaultValue[key];
    let source;
    if (defaultValue === data[key] && element.setting.type === "object" && element.defaultValueSource instanceof Map) {
      const defaultSource = element.defaultValueSource.get(`${element.setting.key}.${key}`);
      source = typeof defaultSource === "string" ? defaultSource : defaultSource?.displayName;
    }
    if (isDefined(objectProperties) && key in objectProperties) {
      const valueEnumOptions = getEnumOptionsFromSchema(objectProperties[key]);
      return {
        key: {
          type: "enum",
          data: key,
          options: wellDefinedKeyEnumOptions
        },
        value: getObjectEntryValueDisplayValue(getObjectValueType(objectProperties[key]), data[key], valueEnumOptions),
        keyDescription: objectProperties[key].description,
        removable: isUndefinedOrNull(defaultValue),
        resetable: !isUndefinedOrNull(defaultValue),
        source
      };
    }
    const removable = defaultValue === void 0 || objectSettingSupportsRemoveDefaultValue(element.setting.key);
    const resetable = !!defaultValue && defaultValue !== data[key];
    const schema = patternsAndSchemas.find(({ pattern }) => pattern.test(key))?.schema;
    if (schema) {
      const valueEnumOptions = getEnumOptionsFromSchema(schema);
      return {
        key: { type: "string", data: key },
        value: getObjectEntryValueDisplayValue(getObjectValueType(schema), data[key], valueEnumOptions),
        keyDescription: schema.description,
        removable,
        resetable,
        source
      };
    }
    const additionalValueEnums = getEnumOptionsFromSchema(
      typeof objectAdditionalProperties === "boolean" ? {} : objectAdditionalProperties ?? {}
    );
    return {
      key: { type: "string", data: key },
      value: getObjectEntryValueDisplayValue(
        typeof objectAdditionalProperties === "object" ? getObjectValueType(objectAdditionalProperties) : "string",
        data[key],
        additionalValueEnums
      ),
      keyDescription: typeof objectAdditionalProperties === "object" ? objectAdditionalProperties.description : void 0,
      removable,
      resetable,
      source
    };
  }).filter((item) => !isUndefinedOrNull(item.value.data));
}
function getBoolObjectDisplayValue(element) {
  const elementDefaultValue = typeof element.defaultValue === "object" ? element.defaultValue ?? {} : {};
  const elementScopeValue = typeof element.scopeValue === "object" ? element.scopeValue ?? {} : {};
  const data = element.isConfigured ? { ...elementDefaultValue, ...elementScopeValue } : elementDefaultValue;
  const { objectProperties } = element.setting;
  const displayValues = [];
  for (const key in objectProperties) {
    const defaultValue = elementDefaultValue[key];
    let source;
    if (defaultValue === data[key] && element.setting.type === "object" && element.defaultValueSource instanceof Map) {
      const defaultSource = element.defaultValueSource.get(key);
      source = typeof defaultSource === "string" ? defaultSource : defaultSource?.displayName;
    }
    displayValues.push({
      key: {
        type: "string",
        data: key
      },
      value: {
        type: "boolean",
        data: !!data[key]
      },
      keyDescription: objectProperties[key].description,
      removable: false,
      resetable: true,
      source
    });
  }
  return displayValues;
}
function createArraySuggester(element) {
  return (keys, idx) => {
    const enumOptions = [];
    if (element.setting.enum) {
      element.setting.enum.forEach((key, i) => {
        if (!element.setting.uniqueItems || idx !== void 0 && key === keys[idx] || !keys.includes(key)) {
          const description = element.setting.enumDescriptions?.[i];
          enumOptions.push({ value: key, description });
        }
      });
    }
    return enumOptions.length > 0 ? { type: "enum", data: enumOptions[0].value, options: enumOptions } : void 0;
  };
}
function createObjectKeySuggester(element) {
  const { objectProperties } = element.setting;
  const allStaticKeys = Object.keys(objectProperties ?? {});
  return (keys) => {
    const existingKeys = new Set(keys);
    const enumOptions = [];
    allStaticKeys.forEach((staticKey) => {
      if (!existingKeys.has(staticKey)) {
        enumOptions.push({ value: staticKey, description: objectProperties[staticKey].description });
      }
    });
    return enumOptions.length > 0 ? { type: "enum", data: enumOptions[0].value, options: enumOptions } : void 0;
  };
}
function createObjectValueSuggester(element) {
  const { objectProperties, objectPatternProperties, objectAdditionalProperties } = element.setting;
  const patternsAndSchemas = Object.entries(objectPatternProperties ?? {}).map(([pattern, schema]) => ({
    pattern: new RegExp(pattern),
    schema
  }));
  return (key) => {
    let suggestedSchema;
    if (isDefined(objectProperties) && key in objectProperties) {
      suggestedSchema = objectProperties[key];
    }
    const patternSchema = suggestedSchema ?? patternsAndSchemas.find(({ pattern }) => pattern.test(key))?.schema;
    if (isDefined(patternSchema)) {
      suggestedSchema = patternSchema;
    } else if (isDefined(objectAdditionalProperties) && typeof objectAdditionalProperties === "object") {
      suggestedSchema = objectAdditionalProperties;
    }
    if (isDefined(suggestedSchema)) {
      const type = getObjectValueType(suggestedSchema);
      if (type === "boolean") {
        return { type, data: suggestedSchema.default ?? true };
      } else if (type === "enum") {
        const options = getEnumOptionsFromSchema(suggestedSchema);
        return { type, data: suggestedSchema.default ?? options[0].value, options };
      } else {
        return { type, data: suggestedSchema.default ?? "" };
      }
    }
    return;
  };
}
function isNonNullableNumericType(type) {
  return type === "number" || type === "integer";
}
function parseNumericObjectValues(dataElement, v) {
  const newRecord = {};
  for (const key in v) {
    let keyMatchesNumericProperty;
    const patternProperties = dataElement.setting.objectPatternProperties;
    const properties = dataElement.setting.objectProperties;
    const additionalProperties = dataElement.setting.objectAdditionalProperties;
    if (properties) {
      for (const propKey in properties) {
        if (propKey === key) {
          keyMatchesNumericProperty = isNonNullableNumericType(properties[propKey].type);
          break;
        }
      }
    }
    if (keyMatchesNumericProperty === void 0 && patternProperties) {
      for (const patternKey in patternProperties) {
        if (key.match(patternKey)) {
          keyMatchesNumericProperty = isNonNullableNumericType(patternProperties[patternKey].type);
          break;
        }
      }
    }
    if (keyMatchesNumericProperty === void 0 && additionalProperties && typeof additionalProperties !== "boolean") {
      if (isNonNullableNumericType(additionalProperties.type)) {
        keyMatchesNumericProperty = true;
      }
    }
    newRecord[key] = keyMatchesNumericProperty ? Number(v[key]) : v[key];
  }
  return newRecord;
}
function getListDisplayValue(element) {
  if (!element.value || !Array.isArray(element.value)) {
    return [];
  }
  if (element.setting.arrayItemType === "enum") {
    let enumOptions = [];
    if (element.setting.enum) {
      enumOptions = element.setting.enum.map((setting, i) => {
        return {
          value: setting,
          description: element.setting.enumDescriptions?.[i]
        };
      });
    }
    return element.value.map((key) => {
      return {
        value: {
          type: "enum",
          data: key,
          options: enumOptions
        }
      };
    });
  } else {
    return element.value.map((key) => {
      return {
        value: {
          type: "string",
          data: key
        }
      };
    });
  }
}
function getShowAddButtonList(dataElement, listDisplayValue) {
  if (dataElement.setting.enum && dataElement.setting.uniqueItems) {
    return dataElement.setting.enum.length - listDisplayValue.length > 0;
  } else {
    return true;
  }
}
function resolveSettingsTree(tocData, coreSettingsGroups, filter, logService) {
  const allSettings = getFlatSettings(coreSettingsGroups);
  return {
    tree: _resolveSettingsTree(tocData, allSettings, filter, logService),
    leftoverSettings: allSettings
  };
}
function resolveConfiguredUntrustedSettings(groups, target, languageFilter, configurationService) {
  const allSettings = getFlatSettings(groups);
  return [...allSettings].filter((setting) => setting.restricted && inspectSetting(setting.key, target, languageFilter, configurationService).isConfigured);
}
async function createTocTreeForExtensionSettings(extensionService, groups, filter) {
  const extGroupTree = /* @__PURE__ */ new Map();
  const addEntryToTree = (extensionId, extensionName, childEntry) => {
    if (!extGroupTree.has(extensionId)) {
      const rootEntry = {
        id: extensionId,
        label: extensionName,
        children: []
      };
      extGroupTree.set(extensionId, rootEntry);
    }
    extGroupTree.get(extensionId).children.push(childEntry);
  };
  const processGroupEntry = async (group) => {
    const flatSettings = group.sections.map((section) => section.settings).flat();
    const settings = filter ? getMatchingSettings(new Set(flatSettings), filter) : flatSettings;
    sortSettings(settings);
    const extensionId = group.extensionInfo.id;
    const extension = await extensionService.getExtension(extensionId);
    const extensionName = extension?.displayName ?? extension?.name ?? extensionId;
    const settingGroupId = group.id && group.id !== extensionId ? group.id : group.title;
    const childEntry = {
      id: settingGroupId,
      label: group.title,
      order: group.order,
      settings
    };
    addEntryToTree(extensionId, extensionName, childEntry);
  };
  const processPromises = groups.map((g) => processGroupEntry(g));
  return Promise.all(processPromises).then(() => {
    const extGroups = [];
    for (const extensionRootEntry of extGroupTree.values()) {
      if (extensionRootEntry.children.length === 1) {
        extGroups.push({
          id: extensionRootEntry.id,
          label: extensionRootEntry.children[0].label,
          settings: extensionRootEntry.children[0].settings
        });
      } else {
        extensionRootEntry.children.sort((a, b) => {
          return compareTwoNullableNumbers(a.order, b.order);
        });
        const ungroupedChild = extensionRootEntry.children.find((child) => child.label === extensionRootEntry.label);
        if (ungroupedChild && !ungroupedChild.children) {
          const groupedChildren = extensionRootEntry.children.filter((child) => child !== ungroupedChild);
          extGroups.push({
            id: extensionRootEntry.id,
            label: extensionRootEntry.label,
            settings: ungroupedChild.settings,
            children: groupedChildren
          });
        } else {
          extGroups.push(extensionRootEntry);
        }
      }
    }
    extGroups.sort((a, b) => a.label.localeCompare(b.label));
    return {
      id: "extensions",
      label: localize("extensions", "Extensions"),
      children: extGroups
    };
  });
}
function _resolveSettingsTree(tocData, allSettings, filter, logService) {
  let children;
  if (tocData.children) {
    children = tocData.children.filter((child) => child.hide !== true).map((child) => _resolveSettingsTree(child, allSettings, filter, logService)).filter((child) => child.children?.length || child.settings?.length);
  }
  let settings;
  if (filter || tocData.settings) {
    settings = getMatchingSettings(allSettings, {
      include: {
        keyPatterns: [...filter?.include?.keyPatterns ?? [], ...tocData.settings ?? []],
        tags: filter?.include?.tags ? [...filter.include.tags] : []
      },
      exclude: filter?.exclude ?? {}
    });
    sortSettings(settings);
  }
  if (!children && !settings) {
    throw new Error(`TOC node has no child groups or settings: ${tocData.id}`);
  }
  return {
    id: tocData.id,
    label: tocData.label,
    children,
    settings
  };
}
function sortSettings(settings) {
  const SETTING_STATUS_NORMAL = 0;
  const SETTING_STATUS_PREVIEW = 1;
  const SETTING_STATUS_EXPERIMENTAL = 2;
  const getExperimentalStatus = (setting) => {
    if (setting.tags?.includes("experimental")) {
      return SETTING_STATUS_EXPERIMENTAL;
    } else if (setting.tags?.includes("preview")) {
      return SETTING_STATUS_PREVIEW;
    }
    return SETTING_STATUS_NORMAL;
  };
  settings.sort((a, b) => {
    const experimentalStatusA = getExperimentalStatus(a);
    const experimentalStatusB = getExperimentalStatus(b);
    if (experimentalStatusA !== experimentalStatusB) {
      return experimentalStatusA - experimentalStatusB;
    }
    const orderComparison = compareTwoNullableNumbers(a.order, b.order);
    return orderComparison !== 0 ? orderComparison : a.key.localeCompare(b.key);
  });
}
function getMatchingSettings(allSettings, filter) {
  const result = [];
  allSettings.forEach((setting) => {
    let shouldInclude = false;
    let shouldExclude = false;
    if (filter.include?.keyPatterns) {
      shouldInclude = filter.include.keyPatterns.some((pattern) => {
        if (pattern.startsWith("@tag:")) {
          const tagName = pattern.substring(5);
          return setting.tags?.includes(tagName);
        } else {
          return settingMatches(setting, pattern);
        }
      });
    } else {
      shouldInclude = true;
    }
    if (shouldInclude && filter.include?.tags?.length) {
      shouldInclude = filter.include.tags.some((tag) => setting.tags?.includes(tag));
    }
    if (filter.exclude?.keyPatterns) {
      shouldExclude = filter.exclude.keyPatterns.some((pattern) => {
        if (pattern.startsWith("@tag:")) {
          const tagName = pattern.substring(5);
          return setting.tags?.includes(tagName);
        } else {
          return settingMatches(setting, pattern);
        }
      });
    }
    if (!shouldExclude && filter.exclude?.tags?.length) {
      shouldExclude = filter.exclude.tags.some((tag) => setting.tags?.includes(tag));
    }
    if (shouldInclude && !shouldExclude) {
      result.push(setting);
      if (!multiGroupTocSettings.has(setting.key)) {
        allSettings.delete(setting);
      }
    }
  });
  return result;
}
const settingPatternCache = /* @__PURE__ */ new Map();
function createSettingMatchRegExp(pattern) {
  pattern = escapeRegExpCharacters(pattern).replace(/\\\*/g, ".*");
  return new RegExp(`^${pattern}$`, "i");
}
function settingMatches(s, pattern) {
  let regExp = settingPatternCache.get(pattern);
  if (!regExp) {
    regExp = createSettingMatchRegExp(pattern);
    settingPatternCache.set(pattern, regExp);
  }
  return regExp.test(s.key);
}
function getFlatSettings(settingsGroups) {
  const result = /* @__PURE__ */ new Set();
  for (const group of settingsGroups) {
    for (const section of group.sections) {
      for (const s of section.settings) {
        if (!s.overrides || !s.overrides.length) {
          result.add(s);
        }
      }
    }
  }
  return result;
}
const SETTINGS_TEXT_TEMPLATE_ID = "settings.text.template";
const SETTINGS_MULTILINE_TEXT_TEMPLATE_ID = "settings.multilineText.template";
const SETTINGS_NUMBER_TEMPLATE_ID = "settings.number.template";
const SETTINGS_ENUM_TEMPLATE_ID = "settings.enum.template";
const SETTINGS_BOOL_TEMPLATE_ID = "settings.bool.template";
const SETTINGS_ARRAY_TEMPLATE_ID = "settings.array.template";
const SETTINGS_EXCLUDE_TEMPLATE_ID = "settings.exclude.template";
const SETTINGS_INCLUDE_TEMPLATE_ID = "settings.include.template";
const SETTINGS_OBJECT_TEMPLATE_ID = "settings.object.template";
const SETTINGS_BOOL_OBJECT_TEMPLATE_ID = "settings.boolObject.template";
const SETTINGS_COMPLEX_TEMPLATE_ID = "settings.complex.template";
const SETTINGS_COMPLEX_OBJECT_TEMPLATE_ID = "settings.complexObject.template";
const SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID = "settings.newExtensions.template";
const SETTINGS_ELEMENT_TEMPLATE_ID = "settings.group.template";
const SETTINGS_EXTENSION_TOGGLE_TEMPLATE_ID = "settings.extensionToggle.template";
function removeChildrenFromTabOrder(node) {
  const focusableElements = node.querySelectorAll(`
		[tabindex="0"],
		input:not([tabindex="-1"]),
		select:not([tabindex="-1"]),
		textarea:not([tabindex="-1"]),
		a:not([tabindex="-1"]),
		button:not([tabindex="-1"]),
		area:not([tabindex="-1"])
	`);
  focusableElements.forEach((element) => {
    element.setAttribute(AbstractSettingRenderer.ELEMENT_FOCUSABLE_ATTR, "true");
    element.setAttribute("tabindex", "-1");
  });
}
function addChildrenToTabOrder(node) {
  const focusableElements = node.querySelectorAll(
    `[${AbstractSettingRenderer.ELEMENT_FOCUSABLE_ATTR}="true"]`
  );
  focusableElements.forEach((element) => {
    element.removeAttribute(AbstractSettingRenderer.ELEMENT_FOCUSABLE_ATTR);
    element.setAttribute("tabindex", "0");
  });
}
let AbstractSettingRenderer = class extends Disposable {
  constructor(settingActions, disposableActionFactory, _themeService, _contextViewService, _openerService, _instantiationService, _commandService, _contextMenuService, _keybindingService, _configService, _extensionsService, _extensionsWorkbenchService, _productService, _telemetryService, _hoverService, _markdownRendererService) {
    super();
    this.settingActions = settingActions;
    this.disposableActionFactory = disposableActionFactory;
    this._themeService = _themeService;
    this._contextViewService = _contextViewService;
    this._openerService = _openerService;
    this._instantiationService = _instantiationService;
    this._commandService = _commandService;
    this._contextMenuService = _contextMenuService;
    this._keybindingService = _keybindingService;
    this._configService = _configService;
    this._extensionsService = _extensionsService;
    this._extensionsWorkbenchService = _extensionsWorkbenchService;
    this._productService = _productService;
    this._telemetryService = _telemetryService;
    this._hoverService = _hoverService;
    this._markdownRendererService = _markdownRendererService;
    this._onDidClickOverrideElement = this._register(new Emitter());
    this.onDidClickOverrideElement = this._onDidClickOverrideElement.event;
    this._onDidChangeSetting = this._register(new Emitter());
    this.onDidChangeSetting = this._onDidChangeSetting.event;
    this._onDidOpenSettings = this._register(new Emitter());
    this.onDidOpenSettings = this._onDidOpenSettings.event;
    this._onDidClickSettingLink = this._register(new Emitter());
    this.onDidClickSettingLink = this._onDidClickSettingLink.event;
    this._onDidFocusSetting = this._register(new Emitter());
    this.onDidFocusSetting = this._onDidFocusSetting.event;
    this._onDidChangeIgnoredSettings = this._register(new Emitter());
    this.onDidChangeIgnoredSettings = this._onDidChangeIgnoredSettings.event;
    this._onDidChangeSettingHeight = this._register(new Emitter());
    this.onDidChangeSettingHeight = this._onDidChangeSettingHeight.event;
    this._onApplyFilter = this._register(new Emitter());
    this.onApplyFilter = this._onApplyFilter.event;
    this.ignoredSettings = getIgnoredSettings(getDefaultIgnoredSettings(), this._configService);
    this._register(this._configService.onDidChangeConfiguration((e) => {
      this.ignoredSettings = getIgnoredSettings(getDefaultIgnoredSettings(), this._configService);
      this._onDidChangeIgnoredSettings.fire();
    }));
  }
  renderCommonTemplate(tree, _container, typeClass) {
    _container.classList.add("setting-item");
    _container.classList.add("setting-item-" + typeClass);
    const toDispose = new DisposableStore();
    const container = DOM.append(_container, $(AbstractSettingRenderer.CONTENTS_SELECTOR));
    container.classList.add("settings-row-inner-container");
    const titleElement = DOM.append(container, $(".setting-item-title"));
    const labelCategoryContainer = DOM.append(titleElement, $(".setting-item-cat-label-container"));
    const categoryElement = DOM.append(labelCategoryContainer, $("span.setting-item-category"));
    const labelElementContainer = DOM.append(labelCategoryContainer, $("span.setting-item-label"));
    const labelElement = toDispose.add(new SimpleIconLabel(labelElementContainer));
    const indicatorsLabel = toDispose.add(this._instantiationService.createInstance(SettingsTreeIndicatorsLabel, titleElement));
    const descriptionElement = DOM.append(container, $(".setting-item-description"));
    const modifiedIndicatorElement = DOM.append(container, $(".setting-item-modified-indicator"));
    toDispose.add(this._hoverService.setupDelayedHover(modifiedIndicatorElement, {
      content: localize("modified", "The setting has been configured in the current scope.")
    }));
    const valueElement = DOM.append(container, $(".setting-item-value"));
    const controlElement = DOM.append(valueElement, $("div.setting-item-control"));
    const deprecationWarningElement = DOM.append(container, $(".setting-item-deprecation-message"));
    const toolbarContainer = DOM.append(container, $(".setting-toolbar-container"));
    const toolbar = toDispose.add(this.renderSettingToolbar(toolbarContainer));
    const template = {
      toDispose,
      elementDisposables: toDispose.add(new DisposableStore()),
      containerElement: container,
      categoryElement,
      labelElement,
      descriptionElement,
      controlElement,
      deprecationWarningElement,
      indicatorsLabel,
      toolbar
    };
    toDispose.add(DOM.addDisposableListener(controlElement, DOM.EventType.MOUSE_DOWN, (e) => e.stopPropagation()));
    toDispose.add(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_ENTER, (e) => container.classList.add("mouseover")));
    toDispose.add(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_LEAVE, (e) => container.classList.remove("mouseover")));
    return template;
  }
  addSettingElementFocusHandler(template) {
    const focusTracker = DOM.trackFocus(template.containerElement);
    template.toDispose.add(focusTracker);
    template.toDispose.add(focusTracker.onDidBlur(() => {
      if (template.containerElement.classList.contains("focused")) {
        template.containerElement.classList.remove("focused");
      }
    }));
    template.toDispose.add(focusTracker.onDidFocus(() => {
      template.containerElement.classList.add("focused");
      if (template.context) {
        this._onDidFocusSetting.fire(template.context);
      }
    }));
  }
  renderSettingToolbar(container) {
    const toggleMenuTitle = this._keybindingService.appendKeybinding(
      localize("settingsContextMenuTitle", "More Actions... "),
      SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU
    );
    const toolbar = new ToolBar(container, this._contextMenuService, {
      toggleMenuTitle,
      renderDropdownAsChildElement: !isIOS,
      moreIcon: settingsMoreActionIcon
    });
    return toolbar;
  }
  renderSettingElement(node, index, template) {
    const element = node.element;
    element.inspectSelf();
    template.context = element;
    template.toolbar.context = element;
    const actions = this.disposableActionFactory(element.setting, element.settingsTarget);
    actions.forEach((a) => isDisposable(a) && template.elementDisposables.add(a));
    template.toolbar.setActions([], [...this.settingActions, ...actions]);
    const setting = element.setting;
    template.containerElement.classList.toggle("is-configured", element.isConfigured);
    template.containerElement.setAttribute(AbstractSettingRenderer.SETTING_KEY_ATTR, element.setting.key);
    template.containerElement.setAttribute(AbstractSettingRenderer.SETTING_ID_ATTR, element.id);
    const titleTooltip = setting.key + (element.isConfigured ? " - Modified" : "");
    template.categoryElement.textContent = element.displayCategory ? element.displayCategory + ": " : "";
    template.elementDisposables.add(this._hoverService.setupDelayedHover(template.categoryElement, { content: titleTooltip }));
    template.labelElement.text = element.displayLabel;
    template.labelElement.title = titleTooltip;
    template.descriptionElement.innerText = "";
    if (element.setting.descriptionIsMarkdown) {
      const renderedDescription = this.renderSettingMarkdown(element, template.containerElement, element.description, template.elementDisposables);
      template.descriptionElement.appendChild(renderedDescription);
    } else {
      template.descriptionElement.innerText = element.description;
    }
    template.indicatorsLabel.updateScopeOverrides(element, this._onDidClickOverrideElement, this._onApplyFilter);
    template.elementDisposables.add(this._configService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(APPLY_ALL_PROFILES_SETTING)) {
        template.indicatorsLabel.updateScopeOverrides(element, this._onDidClickOverrideElement, this._onApplyFilter);
      }
    }));
    const onChange = (value) => this._onDidChangeSetting.fire({
      key: element.setting.key,
      value,
      type: template.context.valueType,
      manualReset: false,
      scope: element.setting.scope
    });
    const deprecationText = element.setting.deprecationMessage || "";
    if (deprecationText && element.setting.deprecationMessageIsMarkdown) {
      template.deprecationWarningElement.innerText = "";
      template.deprecationWarningElement.appendChild(this.renderSettingMarkdown(element, template.containerElement, element.setting.deprecationMessage, template.elementDisposables));
    } else {
      template.deprecationWarningElement.innerText = deprecationText;
    }
    template.deprecationWarningElement.prepend($(".codicon.codicon-error"));
    template.containerElement.classList.toggle("is-deprecated", !!deprecationText);
    this.renderValue(element, template, onChange);
    template.indicatorsLabel.updateWorkspaceTrust(element);
    template.indicatorsLabel.updateSyncIgnored(element, this.ignoredSettings);
    template.indicatorsLabel.updateDefaultOverrideIndicator(element);
    template.indicatorsLabel.updatePreviewIndicator(element);
    template.indicatorsLabel.updateAdvancedIndicator(element);
    template.elementDisposables.add(this.onDidChangeIgnoredSettings(() => {
      template.indicatorsLabel.updateSyncIgnored(element, this.ignoredSettings);
    }));
    this.updateSettingTabbable(element, template);
    template.elementDisposables.add(element.onDidChangeTabbable(() => {
      this.updateSettingTabbable(element, template);
    }));
  }
  updateSettingTabbable(element, template) {
    if (element.tabbable) {
      addChildrenToTabOrder(template.containerElement);
    } else {
      removeChildrenFromTabOrder(template.containerElement);
    }
  }
  renderSettingMarkdown(element, container, text, disposables) {
    text = fixSettingLinks(text);
    const renderedMarkdown = disposables.add(this._markdownRendererService.render({ value: text, isTrusted: true }, {
      actionHandler: (content) => {
        if (content.startsWith("#")) {
          const e = {
            source: element,
            targetKey: content.substring(1)
          };
          this._onDidClickSettingLink.fire(e);
        } else {
          this._openerService.open(content, { allowCommands: true }).catch(onUnexpectedError);
        }
      },
      asyncRenderCallback: () => {
        const height = container.clientHeight;
        if (height) {
          this._onDidChangeSettingHeight.fire({ element, height });
        }
      }
    }));
    renderedMarkdown.element.classList.add("setting-item-markdown");
    cleanRenderedMarkdown(renderedMarkdown.element);
    return renderedMarkdown.element;
  }
  disposeTemplate(template) {
    template.toDispose.dispose();
  }
  disposeElement(_element, _index, template) {
    template.elementDisposables?.clear();
  }
};
AbstractSettingRenderer.CONTROL_CLASS = "setting-control-focus-target";
AbstractSettingRenderer.CONTROL_SELECTOR = "." + AbstractSettingRenderer.CONTROL_CLASS;
AbstractSettingRenderer.CONTENTS_CLASS = "setting-item-contents";
AbstractSettingRenderer.CONTENTS_SELECTOR = "." + AbstractSettingRenderer.CONTENTS_CLASS;
AbstractSettingRenderer.ALL_ROWS_SELECTOR = ".monaco-list-row";
AbstractSettingRenderer.SETTING_KEY_ATTR = "data-key";
AbstractSettingRenderer.SETTING_ID_ATTR = "data-id";
AbstractSettingRenderer.ELEMENT_FOCUSABLE_ATTR = "data-focusable";
AbstractSettingRenderer = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IContextViewService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IKeybindingService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IExtensionService),
  __decorateParam(11, IExtensionsWorkbenchService),
  __decorateParam(12, IProductService),
  __decorateParam(13, ITelemetryService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, IMarkdownRendererService)
], AbstractSettingRenderer);
class SettingGroupRenderer {
  constructor() {
    this.templateId = SETTINGS_ELEMENT_TEMPLATE_ID;
  }
  renderTemplate(container) {
    container.classList.add("group-title");
    const template = {
      parent: container,
      toDispose: new DisposableStore()
    };
    return template;
  }
  renderElement(element, index, templateData) {
    templateData.parent.innerText = "";
    const labelElement = DOM.append(templateData.parent, $("div.settings-group-title-label.settings-row-inner-container"));
    labelElement.classList.add(`settings-group-level-${element.element.level}`);
    labelElement.textContent = element.element.label;
    if (element.element.isFirstGroup) {
      labelElement.classList.add("settings-group-first");
    }
  }
  disposeTemplate(templateData) {
    templateData.toDispose.dispose();
  }
}
let SettingNewExtensionsRenderer = class {
  constructor(_commandService) {
    this._commandService = _commandService;
    this.templateId = SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const toDispose = new DisposableStore();
    container.classList.add("setting-item-new-extensions");
    const button = new Button(container, { title: true, ...defaultButtonStyles });
    toDispose.add(button);
    toDispose.add(button.onDidClick(() => {
      if (template.context) {
        this._commandService.executeCommand("workbench.extensions.action.showExtensionsWithIds", template.context.extensionIds);
      }
    }));
    button.label = localize("newExtensionsButtonLabel", "Show matching extensions");
    button.element.classList.add("settings-new-extensions-button");
    const template = {
      button,
      toDispose
    };
    return template;
  }
  renderElement(element, index, templateData) {
    templateData.context = element.element;
  }
  disposeTemplate(template) {
    template.toDispose.dispose();
  }
};
SettingNewExtensionsRenderer = __decorateClass([
  __decorateParam(0, ICommandService)
], SettingNewExtensionsRenderer);
const _SettingComplexRenderer = class _SettingComplexRenderer extends AbstractSettingRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_COMPLEX_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const common = this.renderCommonTemplate(null, container, "complex");
    const openSettingsButton = DOM.append(common.controlElement, $("a.edit-in-settings-button"));
    openSettingsButton.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    openSettingsButton.role = "button";
    const validationErrorMessageElement = $(".setting-item-validation-message");
    common.containerElement.appendChild(validationErrorMessageElement);
    const template = {
      ...common,
      button: openSettingsButton,
      validationErrorMessageElement
    };
    this.addSettingElementFocusHandler(template);
    return template;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    const plainKey = getLanguageTagSettingPlainKey(dataElement.setting.key);
    const editLanguageSettingLabel = localize("editLanguageSettingLabel", "Edit settings for {0}", plainKey);
    const isLanguageTagSetting = dataElement.setting.isLanguageTagSetting;
    template.button.textContent = isLanguageTagSetting ? editLanguageSettingLabel : _SettingComplexRenderer.EDIT_IN_JSON_LABEL;
    const onClickOrKeydown = (e) => {
      if (isLanguageTagSetting) {
        this._onApplyFilter.fire(`@${LANGUAGE_SETTING_TAG}${plainKey.replaceAll(" ", "")}`);
      } else {
        this._onDidOpenSettings.fire(dataElement.setting.key);
      }
      e.preventDefault();
      e.stopPropagation();
    };
    template.elementDisposables.add(DOM.addDisposableListener(template.button, DOM.EventType.CLICK, (e) => {
      onClickOrKeydown(e);
    }));
    template.elementDisposables.add(DOM.addDisposableListener(template.button, DOM.EventType.KEY_DOWN, (e) => {
      const ev = new StandardKeyboardEvent(e);
      if (ev.equals(KeyCode.Space) || ev.equals(KeyCode.Enter)) {
        onClickOrKeydown(e);
      }
    }));
    this.renderValidations(dataElement, template);
    if (isLanguageTagSetting) {
      template.button.setAttribute("aria-label", editLanguageSettingLabel);
    } else {
      template.button.setAttribute("aria-label", `${_SettingComplexRenderer.EDIT_IN_JSON_LABEL}: ${dataElement.setting.key}`);
    }
  }
  renderValidations(dataElement, template) {
    const errMsg = dataElement.isConfigured && getInvalidTypeError(dataElement.value, dataElement.setting.type);
    if (errMsg) {
      template.containerElement.classList.add("invalid-input");
      template.validationErrorMessageElement.innerText = errMsg;
      return;
    }
    template.containerElement.classList.remove("invalid-input");
  }
};
_SettingComplexRenderer.EDIT_IN_JSON_LABEL = localize("editInSettingsJson", "Edit in settings.json");
let SettingComplexRenderer = _SettingComplexRenderer;
class SettingComplexObjectRenderer extends SettingComplexRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_COMPLEX_OBJECT_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const common = this.renderCommonTemplate(null, container, "list");
    const objectSettingWidget = common.toDispose.add(this._instantiationService.createInstance(ObjectSettingDropdownWidget, common.controlElement));
    objectSettingWidget.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    const openSettingsButton = DOM.append(DOM.append(common.controlElement, $(".complex-object-edit-in-settings-button-container")), $("a.complex-object.edit-in-settings-button"));
    openSettingsButton.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    openSettingsButton.role = "button";
    const validationErrorMessageElement = $(".setting-item-validation-message");
    common.containerElement.appendChild(validationErrorMessageElement);
    const template = {
      ...common,
      button: openSettingsButton,
      validationErrorMessageElement,
      objectSettingWidget
    };
    this.addSettingElementFocusHandler(template);
    return template;
  }
  renderValue(dataElement, template, onChange) {
    const items = getObjectDisplayValue(dataElement);
    template.objectSettingWidget.setValue(items, {
      settingKey: dataElement.setting.key,
      showAddButton: false,
      isReadOnly: true
    });
    template.button.parentElement?.classList.toggle("hide", dataElement.hasPolicyValue || dataElement.isAgentsWindowReadOnly);
    super.renderValue(dataElement, template, onChange);
  }
}
class SettingArrayRenderer extends AbstractSettingRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_ARRAY_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const common = this.renderCommonTemplate(null, container, "list");
    const descriptionElement = common.containerElement.querySelector(".setting-item-description");
    const validationErrorMessageElement = $(".setting-item-validation-message");
    descriptionElement.after(validationErrorMessageElement);
    const listWidget = this._instantiationService.createInstance(ListSettingWidget, common.controlElement);
    listWidget.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    common.toDispose.add(listWidget);
    const template = {
      ...common,
      listWidget,
      validationErrorMessageElement
    };
    this.addSettingElementFocusHandler(template);
    common.toDispose.add(
      listWidget.onDidChangeList((e) => {
        const newList = this.computeNewList(template, e);
        template.onChange?.(newList);
      })
    );
    return template;
  }
  computeNewList(template, e) {
    if (template.context) {
      let newValue = [];
      if (Array.isArray(template.context.scopeValue)) {
        newValue = [...template.context.scopeValue];
      } else if (Array.isArray(template.context.value)) {
        newValue = [...template.context.value];
      }
      if (e.type === "move") {
        const sourceIndex = e.sourceIndex;
        const targetIndex = e.targetIndex;
        const splicedElem = newValue.splice(sourceIndex, 1)[0];
        newValue.splice(targetIndex, 0, splicedElem);
      } else if (e.type === "remove" || e.type === "reset") {
        newValue.splice(e.targetIndex, 1);
      } else if (e.type === "change") {
        const itemValueData = e.newItem.value.data.toString();
        if (e.targetIndex > -1) {
          newValue[e.targetIndex] = itemValueData;
        } else {
          newValue.push(itemValueData);
        }
      } else if (e.type === "add") {
        newValue.push(e.newItem.value.data.toString());
      }
      if (template.context.defaultValue && Array.isArray(template.context.defaultValue) && template.context.defaultValue.length === newValue.length && template.context.defaultValue.join() === newValue.join()) {
        return void 0;
      }
      return newValue;
    }
    return void 0;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    const value = getListDisplayValue(dataElement);
    const keySuggester = dataElement.setting.enum ? createArraySuggester(dataElement) : void 0;
    template.listWidget.setValue(value, {
      showAddButton: getShowAddButtonList(dataElement, value),
      keySuggester
    });
    template.context = dataElement;
    template.elementDisposables.add(toDisposable(() => {
      template.listWidget.cancelEdit();
    }));
    template.onChange = (v) => {
      if (v && !renderArrayValidations(dataElement, template, v, false)) {
        const itemType = dataElement.setting.arrayItemType;
        const arrToSave = isNonNullableNumericType(itemType) ? v.map((a) => +a) : v;
        onChange(arrToSave);
      } else {
        onChange(v);
      }
    };
    renderArrayValidations(dataElement, template, value.map((v) => v.value.data.toString()), true);
  }
}
class AbstractSettingObjectRenderer extends AbstractSettingRenderer {
  renderTemplateWithWidget(common, widget) {
    widget.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    common.toDispose.add(widget);
    const descriptionElement = common.containerElement.querySelector(".setting-item-description");
    const validationErrorMessageElement = $(".setting-item-validation-message");
    descriptionElement.after(validationErrorMessageElement);
    const template = {
      ...common,
      validationErrorMessageElement
    };
    if (widget instanceof ObjectSettingCheckboxWidget) {
      template.objectCheckboxWidget = widget;
    } else {
      template.objectDropdownWidget = widget;
    }
    this.addSettingElementFocusHandler(template);
    return template;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
}
class SettingObjectRenderer extends AbstractSettingObjectRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_OBJECT_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const common = this.renderCommonTemplate(null, container, "list");
    const widget = this._instantiationService.createInstance(ObjectSettingDropdownWidget, common.controlElement);
    const template = this.renderTemplateWithWidget(common, widget);
    common.toDispose.add(widget.onDidChangeList((e) => {
      this.onDidChangeObject(template, e);
    }));
    return template;
  }
  onDidChangeObject(template, e) {
    const widget = template.objectDropdownWidget;
    if (template.context) {
      const settingSupportsRemoveDefault = objectSettingSupportsRemoveDefaultValue(template.context.setting.key);
      const defaultValue = typeof template.context.defaultValue === "object" ? template.context.defaultValue ?? {} : {};
      const scopeValue = typeof template.context.scopeValue === "object" ? template.context.scopeValue ?? {} : {};
      const newValue = { ...template.context.scopeValue };
      const newItems = [];
      widget.items.forEach((item, idx) => {
        if ((e.type === "change" || e.type === "move") && e.targetIndex === idx) {
          if (e.originalItem.key.data !== e.newItem.key.data && settingSupportsRemoveDefault && e.originalItem.key.data in defaultValue) {
            newValue[e.originalItem.key.data] = null;
          } else {
            delete newValue[e.originalItem.key.data];
          }
          newValue[e.newItem.key.data] = e.newItem.value.data;
          newItems.push(e.newItem);
        } else if (e.type !== "change" && e.type !== "move" || e.newItem.key.data !== item.key.data) {
          newValue[item.key.data] = item.value.data;
          newItems.push(item);
        }
      });
      if (e.type === "remove" || e.type === "reset") {
        const objectKey = e.originalItem.key.data;
        const removingDefaultValue = e.type === "remove" && settingSupportsRemoveDefault && defaultValue[objectKey] === e.originalItem.value.data;
        if (removingDefaultValue) {
          newValue[objectKey] = null;
        } else {
          delete newValue[objectKey];
        }
        const itemToDelete = newItems.findIndex((item) => item.key.data === objectKey);
        const defaultItemValue = defaultValue[objectKey];
        if (removingDefaultValue || isUndefinedOrNull(defaultValue[objectKey]) && itemToDelete > -1) {
          newItems.splice(itemToDelete, 1);
        } else if (!removingDefaultValue && itemToDelete > -1) {
          newItems[itemToDelete].value.data = defaultItemValue;
        }
      } else if (e.type === "add") {
        newValue[e.newItem.key.data] = e.newItem.value.data;
        newItems.push(e.newItem);
      }
      Object.entries(newValue).forEach(([key, value]) => {
        if (scopeValue[key] !== value && defaultValue[key] === value && !(settingSupportsRemoveDefault && value === null)) {
          delete newValue[key];
        }
      });
      const newObject = Object.keys(newValue).length === 0 ? void 0 : newValue;
      template.objectDropdownWidget.setValue(newItems);
      template.onChange?.(newObject);
    }
  }
  renderValue(dataElement, template, onChange) {
    const items = getObjectDisplayValue(dataElement);
    const { key, objectProperties, objectPatternProperties, objectAdditionalProperties, propertyNames } = dataElement.setting;
    template.objectDropdownWidget.setValue(items, {
      settingKey: key,
      showAddButton: objectAdditionalProperties === false ? !areAllPropertiesDefined(Object.keys(objectProperties ?? {}), items) || isDefined(objectPatternProperties) : true,
      keySuggester: createObjectKeySuggester(dataElement),
      valueSuggester: createObjectValueSuggester(dataElement),
      propertyNames
    });
    template.context = dataElement;
    template.elementDisposables.add(toDisposable(() => {
      template.objectDropdownWidget.cancelEdit();
    }));
    template.onChange = (v) => {
      if (v && !renderArrayValidations(dataElement, template, v, false)) {
        const parsedRecord = parseNumericObjectValues(dataElement, v);
        onChange(parsedRecord);
      } else {
        onChange(v);
      }
    };
    renderArrayValidations(dataElement, template, dataElement.value, true);
  }
}
class SettingBoolObjectRenderer extends AbstractSettingObjectRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_BOOL_OBJECT_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const common = this.renderCommonTemplate(null, container, "list");
    const widget = this._instantiationService.createInstance(ObjectSettingCheckboxWidget, common.controlElement);
    const template = this.renderTemplateWithWidget(common, widget);
    common.toDispose.add(widget.onDidChangeList((e) => {
      this.onDidChangeObject(template, e);
    }));
    return template;
  }
  onDidChangeObject(template, e) {
    if (template.context) {
      const widget = template.objectCheckboxWidget;
      const defaultValue = typeof template.context.defaultValue === "object" ? template.context.defaultValue ?? {} : {};
      const scopeValue = typeof template.context.scopeValue === "object" ? template.context.scopeValue ?? {} : {};
      const newValue = { ...template.context.scopeValue };
      const newItems = [];
      if (e.type !== "change") {
        console.warn("Unexpected event type", e.type, "for bool object setting", template.context.setting.key);
        return;
      }
      widget.items.forEach((item, idx) => {
        if (e.targetIndex === idx) {
          newValue[e.newItem.key.data] = e.newItem.value.data;
          newItems.push(e.newItem);
        } else if (e.newItem.key.data !== item.key.data) {
          newValue[item.key.data] = item.value.data;
          newItems.push(item);
        }
      });
      Object.entries(newValue).forEach(([key, value]) => {
        if (scopeValue[key] !== value && defaultValue[key] === value) {
          delete newValue[key];
        }
      });
      const newObject = Object.keys(newValue).length === 0 ? void 0 : newValue;
      template.objectCheckboxWidget.setValue(newItems);
      template.onChange?.(newObject);
      this._onDidFocusSetting.fire(template.context);
    }
  }
  renderValue(dataElement, template, onChange) {
    const items = getBoolObjectDisplayValue(dataElement);
    const { key } = dataElement.setting;
    template.objectCheckboxWidget.setValue(items, {
      settingKey: key
    });
    template.context = dataElement;
    template.onChange = (v) => {
      onChange(v);
    };
  }
}
class SettingIncludeExcludeRenderer extends AbstractSettingRenderer {
  renderTemplate(container) {
    const common = this.renderCommonTemplate(null, container, "list");
    const includeExcludeWidget = this._instantiationService.createInstance(this.isExclude() ? ExcludeSettingWidget : IncludeSettingWidget, common.controlElement);
    includeExcludeWidget.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    common.toDispose.add(includeExcludeWidget);
    const template = {
      ...common,
      includeExcludeWidget
    };
    this.addSettingElementFocusHandler(template);
    common.toDispose.add(includeExcludeWidget.onDidChangeList((e) => this.onDidChangeIncludeExclude(template, e)));
    return template;
  }
  onDidChangeIncludeExclude(template, e) {
    if (template.context) {
      let sortKeys2 = function(obj) {
        const sortedKeys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
        const retVal = {};
        for (const key of sortedKeys) {
          retVal[key] = obj[key];
        }
        return retVal;
      };
      var sortKeys = sortKeys2;
      const newValue = { ...template.context.scopeValue };
      if (e.type !== "add") {
        if (e.originalItem.value.data.toString() in template.context.defaultValue) {
          newValue[e.originalItem.value.data.toString()] = false;
        } else {
          delete newValue[e.originalItem.value.data.toString()];
        }
      }
      if (e.type === "change" || e.type === "add" || e.type === "move") {
        if (e.newItem.value.data.toString() in template.context.defaultValue && !e.newItem.sibling) {
          delete newValue[e.newItem.value.data.toString()];
        } else {
          newValue[e.newItem.value.data.toString()] = e.newItem.sibling ? { when: e.newItem.sibling } : true;
        }
      }
      this._onDidChangeSetting.fire({
        key: template.context.setting.key,
        value: Object.keys(newValue).length === 0 ? void 0 : sortKeys2(newValue),
        type: template.context.valueType,
        manualReset: false,
        scope: template.context.setting.scope
      });
    }
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    const value = getIncludeExcludeDisplayValue(dataElement);
    template.includeExcludeWidget.setValue(value, { isReadOnly: dataElement.hasPolicyValue || dataElement.isAgentsWindowReadOnly });
    template.context = dataElement;
    template.elementDisposables.add(toDisposable(() => {
      template.includeExcludeWidget.cancelEdit();
    }));
  }
}
class SettingExcludeRenderer extends SettingIncludeExcludeRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_EXCLUDE_TEMPLATE_ID;
  }
  isExclude() {
    return true;
  }
}
class SettingIncludeRenderer extends SettingIncludeExcludeRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_INCLUDE_TEMPLATE_ID;
  }
  isExclude() {
    return false;
  }
}
const settingsInputBoxStyles = getInputBoxStyle({
  inputBackground: settingsTextInputBackground,
  inputForeground: settingsTextInputForeground,
  inputBorder: settingsTextInputBorder
});
class AbstractSettingTextRenderer extends AbstractSettingRenderer {
  constructor() {
    super(...arguments);
    this.MULTILINE_MAX_HEIGHT = 150;
  }
  renderTemplate(_container, useMultiline) {
    const common = this.renderCommonTemplate(null, _container, "text");
    const validationErrorMessageElement = DOM.append(common.containerElement, $(".setting-item-validation-message"));
    const inputBoxOptions = {
      flexibleHeight: useMultiline,
      flexibleWidth: false,
      flexibleMaxHeight: this.MULTILINE_MAX_HEIGHT,
      inputBoxStyles: settingsInputBoxStyles
    };
    const inputBox = new InputBox(common.controlElement, this._contextViewService, inputBoxOptions);
    common.toDispose.add(inputBox);
    common.toDispose.add(
      inputBox.onDidChange((e) => {
        template.onChange?.(e);
      })
    );
    common.toDispose.add(inputBox);
    inputBox.inputElement.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    inputBox.inputElement.tabIndex = 0;
    const template = {
      ...common,
      inputBox,
      validationErrorMessageElement
    };
    this.addSettingElementFocusHandler(template);
    return template;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    template.onChange = void 0;
    template.inputBox.value = dataElement.value;
    template.inputBox.setEnabled(!dataElement.hasPolicyValue && !dataElement.isAgentsWindowReadOnly);
    template.inputBox.setAriaLabel(dataElement.setting.key);
    template.onChange = (value) => {
      if (!renderValidations(dataElement, template, false)) {
        onChange(value);
      }
    };
    renderValidations(dataElement, template, true);
  }
}
class SettingTextRenderer extends AbstractSettingTextRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_TEXT_TEMPLATE_ID;
  }
  renderTemplate(_container) {
    const template = super.renderTemplate(_container, false);
    template.toDispose.add(DOM.addStandardDisposableListener(template.inputBox.inputElement, DOM.EventType.KEY_DOWN, (e) => {
      if (e.equals(KeyCode.UpArrow) || e.equals(KeyCode.DownArrow)) {
        e.preventDefault();
      }
    }));
    return template;
  }
}
class SettingMultilineTextRenderer extends AbstractSettingTextRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_MULTILINE_TEXT_TEMPLATE_ID;
  }
  renderTemplate(_container) {
    return super.renderTemplate(_container, true);
  }
  renderValue(dataElement, template, onChange) {
    const onChangeOverride = (value) => {
      dataElement.value = value;
      onChange(value);
    };
    super.renderValue(dataElement, template, onChangeOverride);
    template.elementDisposables.add(
      template.inputBox.onDidHeightChange((e) => {
        const height = template.containerElement.clientHeight;
        if (height) {
          this._onDidChangeSettingHeight.fire({
            element: dataElement,
            height: template.containerElement.clientHeight
          });
        }
      })
    );
    template.inputBox.layout();
  }
}
class SettingEnumRenderer extends AbstractSettingRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_ENUM_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const common = this.renderCommonTemplate(null, container, "enum");
    const styles = getSelectBoxStyles({
      selectBackground: settingsSelectBackground,
      selectForeground: settingsSelectForeground,
      selectBorder: settingsSelectBorder,
      selectListBorder: settingsSelectListBorder
    });
    const selectBox = new SelectBox([], 0, this._contextViewService, styles, {
      useCustomDrawn: !hasNativeContextMenu(this._configService) || !(isIOS && BrowserFeatures.pointerEvents)
    });
    common.toDispose.add(selectBox);
    selectBox.render(common.controlElement);
    const selectElement = common.controlElement.querySelector("select");
    if (selectElement) {
      selectElement.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
      selectElement.tabIndex = 0;
    }
    common.toDispose.add(
      selectBox.onDidSelect((e) => {
        template.onChange?.(e.index);
      })
    );
    const enumDescriptionElement = common.containerElement.insertBefore($(".setting-item-enumDescription"), common.descriptionElement.nextSibling);
    const template = {
      ...common,
      selectBox,
      selectElement,
      enumDescriptionElement
    };
    this.addSettingElementFocusHandler(template);
    return template;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    const enumItemLabels = dataElement.setting.enumItemLabels ? [...dataElement.setting.enumItemLabels] : [];
    const enumDescriptions = dataElement.setting.enumDescriptions ? [...dataElement.setting.enumDescriptions] : [];
    const settingEnum = [...dataElement.setting.enum];
    const enumDescriptionsAreMarkdown = dataElement.setting.enumDescriptionsAreMarkdown;
    const disposables = new DisposableStore();
    template.elementDisposables.add(disposables);
    let createdDefault = false;
    if (!settingEnum.includes(dataElement.defaultValue)) {
      settingEnum.unshift(dataElement.defaultValue);
      enumDescriptions.unshift("");
      enumItemLabels.unshift("");
      createdDefault = true;
    }
    const stringifiedDefaultValue = escapeInvisibleChars(String(dataElement.defaultValue));
    const displayOptions = settingEnum.map(String).map(escapeInvisibleChars).map((data, index) => {
      const description = enumDescriptions[index] && (enumDescriptionsAreMarkdown ? fixSettingLinks(enumDescriptions[index], false) : enumDescriptions[index]);
      return {
        text: enumItemLabels[index] ? enumItemLabels[index] : data,
        detail: enumItemLabels[index] ? data : "",
        description,
        descriptionIsMarkdown: enumDescriptionsAreMarkdown,
        descriptionMarkdownActionHandler: (content) => {
          this._openerService.open(content).catch(onUnexpectedError);
        },
        decoratorRight: data === stringifiedDefaultValue || createdDefault && index === 0 ? localize("settings.Default", "default") : ""
      };
    });
    template.selectBox.setOptions(displayOptions);
    template.selectBox.setAriaLabel(dataElement.setting.key);
    template.selectBox.setEnabled(!dataElement.hasPolicyValue && !dataElement.isAgentsWindowReadOnly);
    let idx = settingEnum.indexOf(dataElement.value);
    if (idx === -1) {
      idx = 0;
    }
    template.onChange = void 0;
    template.selectBox.select(idx);
    template.onChange = (idx2) => {
      if (createdDefault && idx2 === 0) {
        onChange(dataElement.defaultValue);
      } else {
        onChange(settingEnum[idx2]);
      }
    };
    template.enumDescriptionElement.innerText = "";
  }
}
const settingsNumberInputBoxStyles = getInputBoxStyle({
  inputBackground: settingsNumberInputBackground,
  inputForeground: settingsNumberInputForeground,
  inputBorder: settingsNumberInputBorder
});
class SettingNumberRenderer extends AbstractSettingRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_NUMBER_TEMPLATE_ID;
  }
  renderTemplate(_container) {
    const common = super.renderCommonTemplate(null, _container, "number");
    const validationErrorMessageElement = DOM.append(common.containerElement, $(".setting-item-validation-message"));
    const inputBox = new InputBox(common.controlElement, this._contextViewService, { type: "number", inputBoxStyles: settingsNumberInputBoxStyles });
    common.toDispose.add(inputBox);
    common.toDispose.add(
      inputBox.onDidChange((e) => {
        template.onChange?.(e);
      })
    );
    common.toDispose.add(inputBox);
    inputBox.inputElement.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    inputBox.inputElement.tabIndex = 0;
    const template = {
      ...common,
      inputBox,
      validationErrorMessageElement
    };
    this.addSettingElementFocusHandler(template);
    return template;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    const numParseFn = dataElement.valueType === "integer" || dataElement.valueType === "nullable-integer" ? parseInt : parseFloat;
    const nullNumParseFn = dataElement.valueType === "nullable-integer" || dataElement.valueType === "nullable-number" ? ((v) => v === "" ? null : numParseFn(v)) : numParseFn;
    template.onChange = void 0;
    template.inputBox.value = typeof dataElement.value === "number" ? dataElement.value.toString() : "";
    template.inputBox.step = dataElement.valueType.includes("integer") ? "1" : "any";
    template.inputBox.setAriaLabel(dataElement.setting.key);
    template.inputBox.setEnabled(!dataElement.hasPolicyValue && !dataElement.isAgentsWindowReadOnly);
    template.onChange = (value) => {
      if (!renderValidations(dataElement, template, false)) {
        onChange(nullNumParseFn(value));
      }
    };
    renderValidations(dataElement, template, true);
  }
}
class SettingBoolRenderer extends AbstractSettingRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_BOOL_TEMPLATE_ID;
  }
  renderTemplate(_container) {
    _container.classList.add("setting-item");
    _container.classList.add("setting-item-bool");
    const toDispose = new DisposableStore();
    const container = DOM.append(_container, $(AbstractSettingRenderer.CONTENTS_SELECTOR));
    container.classList.add("settings-row-inner-container");
    const titleElement = DOM.append(container, $(".setting-item-title"));
    const categoryElement = DOM.append(titleElement, $("span.setting-item-category"));
    const labelElementContainer = DOM.append(titleElement, $("span.setting-item-label"));
    const labelElement = toDispose.add(new SimpleIconLabel(labelElementContainer));
    const indicatorsLabel = toDispose.add(this._instantiationService.createInstance(SettingsTreeIndicatorsLabel, titleElement));
    const descriptionAndValueElement = DOM.append(container, $(".setting-item-value-description"));
    const controlElement = DOM.append(descriptionAndValueElement, $(".setting-item-bool-control"));
    const descriptionElement = DOM.append(descriptionAndValueElement, $(".setting-item-description"));
    const modifiedIndicatorElement = DOM.append(container, $(".setting-item-modified-indicator"));
    toDispose.add(this._hoverService.setupDelayedHover(modifiedIndicatorElement, {
      content: localize("modified", "The setting has been configured in the current scope.")
    }));
    const deprecationWarningElement = DOM.append(container, $(".setting-item-deprecation-message"));
    const checkbox = new Toggle({ icon: Codicon.check, actionClassName: "setting-value-checkbox", isChecked: true, title: "", ...unthemedToggleStyles });
    controlElement.appendChild(checkbox.domNode);
    toDispose.add(checkbox);
    toDispose.add(checkbox.onChange(() => {
      template.onChange(checkbox.checked);
    }));
    checkbox.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    const toolbarContainer = DOM.append(container, $(".setting-toolbar-container"));
    const toolbar = this.renderSettingToolbar(toolbarContainer);
    toDispose.add(toolbar);
    const template = {
      toDispose,
      elementDisposables: toDispose.add(new DisposableStore()),
      containerElement: container,
      categoryElement,
      labelElement,
      controlElement,
      checkbox,
      descriptionElement,
      deprecationWarningElement,
      indicatorsLabel,
      toolbar
    };
    this.addSettingElementFocusHandler(template);
    toDispose.add(DOM.addDisposableListener(controlElement, "mousedown", (e) => e.stopPropagation()));
    toDispose.add(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_ENTER, (e) => container.classList.add("mouseover")));
    toDispose.add(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_LEAVE, (e) => container.classList.remove("mouseover")));
    return template;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    template.onChange = void 0;
    template.checkbox.checked = dataElement.value;
    if (dataElement.hasPolicyValue || dataElement.isAgentsWindowReadOnly) {
      template.checkbox.disable();
      template.descriptionElement.classList.add("disabled");
    } else {
      template.checkbox.enable();
      template.descriptionElement.classList.remove("disabled");
      template.elementDisposables.add(DOM.addDisposableListener(template.descriptionElement, DOM.EventType.MOUSE_DOWN, (e) => {
        const targetElement = e.target instanceof Element ? e.target : null;
        if (!targetElement || !targetElement.closest("a")) {
          template.checkbox.checked = !template.checkbox.checked;
          template.onChange(template.checkbox.checked);
        }
        DOM.EventHelper.stop(e);
      }));
    }
    template.checkbox.setTitle(dataElement.setting.key);
    template.onChange = onChange;
  }
}
class SettingsExtensionToggleRenderer extends AbstractSettingRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_EXTENSION_TOGGLE_TEMPLATE_ID;
    this._onDidDismissExtensionSetting = this._register(new Emitter());
    this.onDidDismissExtensionSetting = this._onDidDismissExtensionSetting.event;
  }
  renderTemplate(_container) {
    const common = super.renderCommonTemplate(null, _container, "extension-toggle");
    const actionButton = new Button(common.containerElement, {
      title: false,
      ...defaultButtonStyles
    });
    actionButton.element.classList.add("setting-item-extension-toggle-button");
    actionButton.label = localize("showExtension", "Show Extension");
    const dismissButton = new Button(common.containerElement, {
      title: false,
      secondary: true,
      ...defaultButtonStyles
    });
    dismissButton.element.classList.add("setting-item-extension-dismiss-button");
    dismissButton.label = localize("dismiss", "Dismiss");
    const template = {
      ...common,
      actionButton,
      dismissButton
    };
    this.addSettingElementFocusHandler(template);
    return template;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    template.elementDisposables.clear();
    const extensionId = dataElement.setting.displayExtensionId;
    template.elementDisposables.add(template.actionButton.onDidClick(async () => {
      this._telemetryService.publicLog2("ManageExtensionClick", { extensionId });
      this._commandService.executeCommand("extension.open", extensionId);
    }));
    template.elementDisposables.add(template.dismissButton.onDidClick(async () => {
      this._telemetryService.publicLog2("DismissExtensionClick", { extensionId });
      this._onDidDismissExtensionSetting.fire(extensionId);
    }));
  }
}
let SettingTreeRenderers = class extends Disposable {
  constructor(_instantiationService, _contextMenuService, _contextViewService, _userDataSyncEnablementService) {
    super();
    this._instantiationService = _instantiationService;
    this._contextMenuService = _contextMenuService;
    this._contextViewService = _contextViewService;
    this._userDataSyncEnablementService = _userDataSyncEnablementService;
    this._onDidChangeSetting = this._register(new Emitter());
    this.settingActions = [
      new Action("settings.resetSetting", localize("resetSettingLabel", "Reset Setting"), void 0, void 0, async (context) => {
        if (context instanceof SettingsTreeSettingElement) {
          if (!context.isUntrusted) {
            this._onDidChangeSetting.fire({
              key: context.setting.key,
              value: void 0,
              type: context.setting.type,
              manualReset: true,
              scope: context.setting.scope
            });
          }
        }
      }),
      new Separator(),
      this._instantiationService.createInstance(CopySettingIdAction),
      this._instantiationService.createInstance(CopySettingAsJSONAction),
      this._instantiationService.createInstance(CopySettingAsURLAction)
    ];
    const actionFactory = (setting, settingTarget) => this.getActionsForSetting(setting, settingTarget);
    const emptyActionFactory = (_) => [];
    const extensionRenderer = this._instantiationService.createInstance(SettingsExtensionToggleRenderer, [], emptyActionFactory);
    const settingRenderers = [
      this._instantiationService.createInstance(SettingBoolRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingNumberRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingArrayRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingComplexRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingComplexObjectRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingTextRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingMultilineTextRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingExcludeRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingIncludeRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingEnumRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingObjectRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingBoolObjectRenderer, this.settingActions, actionFactory),
      extensionRenderer
    ];
    this.onDidClickOverrideElement = Event.any(...settingRenderers.map((r) => r.onDidClickOverrideElement));
    this.onDidChangeSetting = Event.any(
      ...settingRenderers.map((r) => r.onDidChangeSetting),
      this._onDidChangeSetting.event
    );
    this.onDidDismissExtensionSetting = extensionRenderer.onDidDismissExtensionSetting;
    this.onDidOpenSettings = Event.any(...settingRenderers.map((r) => r.onDidOpenSettings));
    this.onDidClickSettingLink = Event.any(...settingRenderers.map((r) => r.onDidClickSettingLink));
    this.onDidFocusSetting = Event.any(...settingRenderers.map((r) => r.onDidFocusSetting));
    this.onDidChangeSettingHeight = Event.any(...settingRenderers.map((r) => r.onDidChangeSettingHeight));
    this.onApplyFilter = Event.any(...settingRenderers.map((r) => r.onApplyFilter));
    this.allRenderers = [
      ...settingRenderers,
      this._instantiationService.createInstance(SettingGroupRenderer),
      this._instantiationService.createInstance(SettingNewExtensionsRenderer)
    ];
  }
  getActionsForSetting(setting, settingTarget) {
    const actions = [];
    if (!(setting.scope && APPLICATION_SCOPES.includes(setting.scope)) && settingTarget === ConfigurationTarget.USER_LOCAL) {
      actions.push(this._instantiationService.createInstance(ApplySettingToAllProfilesAction, setting));
    }
    if (this._userDataSyncEnablementService.isEnabled() && !setting.disallowSyncIgnore) {
      actions.push(this._instantiationService.createInstance(SyncSettingAction, setting));
    }
    if (actions.length) {
      actions.splice(0, 0, new Separator());
    }
    return actions;
  }
  cancelSuggesters() {
    this._contextViewService.hideContextView();
  }
  showContextMenu(element, settingDOMElement) {
    const toolbarElement = settingDOMElement.querySelector(".monaco-toolbar");
    if (toolbarElement) {
      this._contextMenuService.showContextMenu({
        getActions: () => this.settingActions,
        getAnchor: () => toolbarElement,
        getActionsContext: () => element
      });
    }
  }
  getSettingDOMElementForDOMElement(domElement) {
    const parent = DOM.findParentWithClass(domElement, AbstractSettingRenderer.CONTENTS_CLASS);
    if (parent) {
      return parent;
    }
    return null;
  }
  getDOMElementsForSettingKey(treeContainer, key) {
    return treeContainer.querySelectorAll(`[${AbstractSettingRenderer.SETTING_KEY_ATTR}="${key}"]`);
  }
  getKeyForDOMElementInSetting(element) {
    const settingElement = this.getSettingDOMElementForDOMElement(element);
    return settingElement && settingElement.getAttribute(AbstractSettingRenderer.SETTING_KEY_ATTR);
  }
  getIdForDOMElementInSetting(element) {
    const settingElement = this.getSettingDOMElementForDOMElement(element);
    return settingElement && settingElement.getAttribute(AbstractSettingRenderer.SETTING_ID_ATTR);
  }
  dispose() {
    super.dispose();
    this.settingActions.forEach((action) => {
      if (isDisposable(action)) {
        action.dispose();
      }
    });
    this.allRenderers.forEach((renderer) => {
      if (isDisposable(renderer)) {
        renderer.dispose();
      }
    });
  }
};
SettingTreeRenderers = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IUserDataSyncEnablementService)
], SettingTreeRenderers);
function renderValidations(dataElement, template, calledOnStartup) {
  if (dataElement.setting.validator) {
    const errMsg = dataElement.setting.validator(template.inputBox.value);
    if (errMsg) {
      template.containerElement.classList.add("invalid-input");
      template.validationErrorMessageElement.innerText = errMsg;
      const validationError = localize("validationError", "Validation Error.");
      template.inputBox.inputElement.parentElement.setAttribute("aria-label", [validationError, errMsg].join(" "));
      if (!calledOnStartup) {
        aria.status(validationError + " " + errMsg);
      }
      return true;
    } else {
      template.inputBox.inputElement.parentElement.removeAttribute("aria-label");
    }
  }
  template.containerElement.classList.remove("invalid-input");
  return false;
}
function renderArrayValidations(dataElement, template, value, calledOnStartup) {
  template.containerElement.classList.add("invalid-input");
  if (dataElement.setting.validator) {
    const errMsg = dataElement.setting.validator(value);
    if (errMsg && errMsg !== "") {
      template.containerElement.classList.add("invalid-input");
      template.validationErrorMessageElement.innerText = errMsg;
      const validationError = localize("validationError", "Validation Error.");
      template.containerElement.setAttribute("aria-label", [dataElement.setting.key, validationError, errMsg].join(" "));
      if (!calledOnStartup) {
        aria.status(validationError + " " + errMsg);
      }
      return true;
    } else {
      template.containerElement.setAttribute("aria-label", dataElement.setting.key);
      template.containerElement.classList.remove("invalid-input");
    }
  }
  return false;
}
function cleanRenderedMarkdown(element) {
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes.item(i);
    const tagName = child.tagName && child.tagName.toLowerCase();
    if (tagName === "img") {
      child.remove();
    } else {
      cleanRenderedMarkdown(child);
    }
  }
}
function fixSettingLinks(text, linkify = true) {
  return text.replace(/`#([^#\s`]+)#`|'#([^#\s']+)#'/g, (match, backticksGroup, quotesGroup) => {
    const settingKey = backticksGroup ?? quotesGroup;
    const targetDisplayFormat = settingKeyToDisplayFormat(settingKey);
    const targetName = `${targetDisplayFormat.category}: ${targetDisplayFormat.label}`;
    return linkify ? `[${targetName}](#${settingKey} "${settingKey}")` : `"${targetName}"`;
  });
}
function escapeInvisibleChars(enumValue) {
  return enumValue && enumValue.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}
let SettingsTreeFilter = class {
  constructor(viewState, isFilteringGroups, environmentService) {
    this.viewState = viewState;
    this.isFilteringGroups = isFilteringGroups;
    this.environmentService = environmentService;
  }
  filter(element, parentVisibility) {
    if (this.viewState.categoryFilter && element instanceof SettingsTreeSettingElement) {
      if (!this.settingContainedInGroup(element.setting, this.viewState.categoryFilter)) {
        return false;
      }
    }
    if (element instanceof SettingsTreeSettingElement && this.viewState.settingsTarget !== ConfigurationTarget.USER_LOCAL) {
      const isRemote = !!this.environmentService.remoteAuthority;
      if (!element.matchesScope(this.viewState.settingsTarget, isRemote)) {
        return false;
      }
    }
    if (element instanceof SettingsTreeGroupElement) {
      if (this.isFilteringGroups && this.viewState.categoryFilter) {
        if (!this.groupIsRelatedToCategory(element, this.viewState.categoryFilter)) {
          return false;
        }
        return TreeVisibility.Recurse;
      }
      if (typeof element.count === "number") {
        return element.count > 0;
      }
      return TreeVisibility.Recurse;
    }
    if (element instanceof SettingsTreeNewExtensionsElement) {
      if (this.viewState.tagFilters?.size || this.viewState.categoryFilter) {
        return false;
      }
    }
    return true;
  }
  settingContainedInGroup(setting, group) {
    return group.children.some((child) => {
      if (child instanceof SettingsTreeGroupElement) {
        return this.settingContainedInGroup(setting, child);
      } else if (child instanceof SettingsTreeSettingElement) {
        return child.setting.key === setting.key;
      } else {
        return false;
      }
    });
  }
  /**
   * Checks if a group is related to the filtered category.
   * A group is related if it's the category itself, a descendant of it, or an ancestor of it.
   */
  groupIsRelatedToCategory(group, category) {
    if (group.id === category.id) {
      return true;
    }
    let parent = group.parent;
    while (parent) {
      if (parent.id === category.id) {
        return true;
      }
      parent = parent.parent;
    }
    let categoryParent = category.parent;
    while (categoryParent) {
      if (categoryParent.id === group.id) {
        return true;
      }
      categoryParent = categoryParent.parent;
    }
    return false;
  }
};
SettingsTreeFilter = __decorateClass([
  __decorateParam(2, IWorkbenchEnvironmentService)
], SettingsTreeFilter);
class SettingsTreeDelegate extends CachedListVirtualDelegate {
  getTemplateId(element) {
    if (element instanceof SettingsTreeGroupElement) {
      return SETTINGS_ELEMENT_TEMPLATE_ID;
    }
    if (element instanceof SettingsTreeSettingElement) {
      if (element.valueType === SettingValueType.ExtensionToggle) {
        return SETTINGS_EXTENSION_TOGGLE_TEMPLATE_ID;
      }
      const invalidTypeError = element.isConfigured && getInvalidTypeError(element.value, element.setting.type);
      if (invalidTypeError) {
        return SETTINGS_COMPLEX_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.Boolean) {
        return SETTINGS_BOOL_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.Integer || element.valueType === SettingValueType.Number || element.valueType === SettingValueType.NullableInteger || element.valueType === SettingValueType.NullableNumber) {
        return SETTINGS_NUMBER_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.MultilineString) {
        return SETTINGS_MULTILINE_TEXT_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.String) {
        return SETTINGS_TEXT_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.Enum) {
        return SETTINGS_ENUM_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.Array) {
        return SETTINGS_ARRAY_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.Exclude) {
        return SETTINGS_EXCLUDE_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.Include) {
        return SETTINGS_INCLUDE_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.Object) {
        return SETTINGS_OBJECT_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.BooleanObject) {
        return SETTINGS_BOOL_OBJECT_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.ComplexObject) {
        return SETTINGS_COMPLEX_OBJECT_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.LanguageTag) {
        return SETTINGS_COMPLEX_TEMPLATE_ID;
      }
      return SETTINGS_COMPLEX_TEMPLATE_ID;
    }
    if (element instanceof SettingsTreeNewExtensionsElement) {
      return SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID;
    }
    throw new Error("unknown element type: " + element);
  }
  hasDynamicHeight(element) {
    return !(element instanceof SettingsTreeGroupElement);
  }
  estimateHeight(element) {
    if (element instanceof SettingsTreeGroupElement) {
      return 42;
    }
    return element instanceof SettingsTreeSettingElement && element.valueType === SettingValueType.Boolean ? 78 : 104;
  }
}
class NonCollapsibleObjectTreeModel extends ObjectTreeModel {
  isCollapsible(element) {
    return false;
  }
  setCollapsed(element, collapsed, recursive) {
    return false;
  }
}
class SettingsTreeAccessibilityProvider {
  constructor(configurationService, languageService, userDataProfilesService) {
    this.configurationService = configurationService;
    this.languageService = languageService;
    this.userDataProfilesService = userDataProfilesService;
  }
  getAriaLabel(element) {
    if (element instanceof SettingsTreeSettingElement) {
      const ariaLabelSections = [];
      ariaLabelSections.push(`${element.displayCategory} ${element.displayLabel}.`);
      if (element.isConfigured) {
        const modifiedText = localize("settings.Modified", "Modified.");
        ariaLabelSections.push(modifiedText);
      }
      const indicatorsLabelAriaLabel = getIndicatorsLabelAriaLabel(element, this.configurationService, this.userDataProfilesService, this.languageService);
      if (indicatorsLabelAriaLabel.length) {
        ariaLabelSections.push(`${indicatorsLabelAriaLabel}.`);
      }
      const descriptionWithoutSettingLinks = renderAsPlaintext({ value: fixSettingLinks(element.description, false) });
      if (descriptionWithoutSettingLinks.length) {
        ariaLabelSections.push(descriptionWithoutSettingLinks);
      }
      return ariaLabelSections.join(" ");
    } else if (element instanceof SettingsTreeGroupElement) {
      return element.label;
    } else {
      return element.id;
    }
  }
  getWidgetAriaLabel() {
    return localize("settings", "Settings");
  }
}
let SettingsTree = class extends WorkbenchObjectTree {
  constructor(container, viewState, renderers, contextKeyService, listService, configurationService, instantiationService, languageService, userDataProfilesService) {
    super(
      "SettingsTree",
      container,
      new SettingsTreeDelegate(),
      renderers,
      {
        horizontalScrolling: false,
        supportDynamicHeights: true,
        scrollToActiveElement: true,
        identityProvider: {
          getId(e) {
            return e.id;
          }
        },
        accessibilityProvider: new SettingsTreeAccessibilityProvider(configurationService, languageService, userDataProfilesService),
        styleController: (id) => new DefaultStyleController(domStylesheetsJs.createStyleSheet(container), id),
        filter: instantiationService.createInstance(SettingsTreeFilter, viewState, true),
        smoothScrolling: configurationService.getValue("workbench.list.smoothScrolling"),
        multipleSelectionSupport: false,
        findWidgetEnabled: false,
        renderIndentGuides: RenderIndentGuides.None,
        transformOptimization: false
        // Disable transform optimization #177470
      },
      instantiationService,
      contextKeyService,
      listService,
      configurationService
    );
    this.getHTMLElement().classList.add("settings-editor-tree");
    this.style(getListStyles({
      listBackground: editorBackground,
      listActiveSelectionBackground: editorBackground,
      listActiveSelectionForeground: foreground,
      listFocusAndSelectionBackground: editorBackground,
      listFocusAndSelectionForeground: foreground,
      listFocusBackground: editorBackground,
      listFocusForeground: foreground,
      listHoverForeground: foreground,
      listHoverBackground: editorBackground,
      listHoverOutline: editorBackground,
      listFocusOutline: editorBackground,
      listInactiveSelectionBackground: editorBackground,
      listInactiveSelectionForeground: foreground,
      listInactiveFocusBackground: editorBackground,
      listInactiveFocusOutline: editorBackground,
      treeIndentGuidesStroke: void 0,
      treeInactiveIndentGuidesStroke: void 0
    }));
    this.disposables.add(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("workbench.list.smoothScrolling")) {
        this.updateOptions({
          smoothScrolling: configurationService.getValue("workbench.list.smoothScrolling")
        });
      }
    }));
  }
  createModel(user, options) {
    return new NonCollapsibleObjectTreeModel(user, options);
  }
};
SettingsTree = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IListService),
  __decorateParam(5, IWorkbenchConfigurationService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, ILanguageService),
  __decorateParam(8, IUserDataProfilesService)
], SettingsTree);
let CopySettingIdAction = class extends Action {
  constructor(clipboardService) {
    super(CopySettingIdAction.ID, CopySettingIdAction.LABEL);
    this.clipboardService = clipboardService;
  }
  async run(context) {
    if (context) {
      await this.clipboardService.writeText(context.setting.key);
    }
    return Promise.resolve(void 0);
  }
};
CopySettingIdAction.ID = "settings.copySettingId";
CopySettingIdAction.LABEL = localize("copySettingIdLabel", "Copy Setting ID");
CopySettingIdAction = __decorateClass([
  __decorateParam(0, IClipboardService)
], CopySettingIdAction);
let CopySettingAsJSONAction = class extends Action {
  constructor(clipboardService) {
    super(CopySettingAsJSONAction.ID, CopySettingAsJSONAction.LABEL);
    this.clipboardService = clipboardService;
  }
  async run(context) {
    if (context) {
      const jsonResult = `"${context.setting.key}": ${JSON.stringify(context.value, void 0, "  ")}`;
      await this.clipboardService.writeText(jsonResult);
    }
    return Promise.resolve(void 0);
  }
};
CopySettingAsJSONAction.ID = "settings.copySettingAsJSON";
CopySettingAsJSONAction.LABEL = localize("copySettingAsJSONLabel", "Copy Setting as JSON");
CopySettingAsJSONAction = __decorateClass([
  __decorateParam(0, IClipboardService)
], CopySettingAsJSONAction);
let CopySettingAsURLAction = class extends Action {
  constructor(clipboardService, productService) {
    super(CopySettingAsURLAction.ID, CopySettingAsURLAction.LABEL);
    this.clipboardService = clipboardService;
    this.productService = productService;
  }
  async run(context) {
    if (context) {
      const settingKey = context.setting.key;
      const product = this.productService.urlProtocol;
      const uri = URI.from({ scheme: product, authority: SETTINGS_AUTHORITY, path: `/${settingKey}` }, true);
      await this.clipboardService.writeText(uri.toString());
    }
    return Promise.resolve(void 0);
  }
};
CopySettingAsURLAction.ID = "settings.copySettingAsURL";
CopySettingAsURLAction.LABEL = localize("copySettingAsURLLabel", "Copy Setting as URL");
CopySettingAsURLAction = __decorateClass([
  __decorateParam(0, IClipboardService),
  __decorateParam(1, IProductService)
], CopySettingAsURLAction);
let SyncSettingAction = class extends Action {
  constructor(setting, configService) {
    super(SyncSettingAction.ID, SyncSettingAction.LABEL);
    this.setting = setting;
    this.configService = configService;
    this._register(Event.filter(configService.onDidChangeConfiguration, (e) => e.affectsConfiguration("settingsSync.ignoredSettings"))(() => this.update()));
    this.update();
  }
  async update() {
    const ignoredSettings = getIgnoredSettings(getDefaultIgnoredSettings(), this.configService);
    this.checked = !ignoredSettings.includes(this.setting.key);
  }
  async run() {
    let currentValue = [...this.configService.getValue("settingsSync.ignoredSettings")];
    currentValue = currentValue.filter((v) => v !== this.setting.key && v !== `-${this.setting.key}`);
    const defaultIgnoredSettings = getDefaultIgnoredSettings();
    const isDefaultIgnored = defaultIgnoredSettings.includes(this.setting.key);
    const askedToSync = !this.checked;
    if (askedToSync && isDefaultIgnored) {
      currentValue.push(`-${this.setting.key}`);
    }
    if (!askedToSync && !isDefaultIgnored) {
      currentValue.push(this.setting.key);
    }
    this.configService.updateValue("settingsSync.ignoredSettings", currentValue.length ? currentValue : void 0, ConfigurationTarget.USER);
    return Promise.resolve(void 0);
  }
};
SyncSettingAction.ID = "settings.stopSyncingSetting";
SyncSettingAction.LABEL = localize("stopSyncingSetting", "Sync This Setting");
SyncSettingAction = __decorateClass([
  __decorateParam(1, IConfigurationService)
], SyncSettingAction);
let ApplySettingToAllProfilesAction = class extends Action {
  constructor(setting, configService) {
    super(ApplySettingToAllProfilesAction.ID, ApplySettingToAllProfilesAction.LABEL);
    this.setting = setting;
    this.configService = configService;
    this._register(Event.filter(configService.onDidChangeConfiguration, (e) => e.affectsConfiguration(APPLY_ALL_PROFILES_SETTING))(() => this.update()));
    this.update();
  }
  update() {
    const allProfilesSettings = this.configService.getValue(APPLY_ALL_PROFILES_SETTING);
    this.checked = allProfilesSettings.includes(this.setting.key);
  }
  async run() {
    const value = this.configService.getValue(APPLY_ALL_PROFILES_SETTING) ?? [];
    if (this.checked) {
      const idx = value.indexOf(this.setting.key);
      if (idx !== -1) {
        value.splice(idx, 1);
      }
    } else {
      value.push(this.setting.key);
    }
    const newValue = distinct(value);
    if (this.checked) {
      await this.configService.updateValue(this.setting.key, this.configService.inspect(this.setting.key).application?.value, ConfigurationTarget.USER_LOCAL);
      await this.configService.updateValue(APPLY_ALL_PROFILES_SETTING, newValue.length ? newValue : void 0, ConfigurationTarget.USER_LOCAL);
    } else {
      await this.configService.updateValue(APPLY_ALL_PROFILES_SETTING, newValue.length ? newValue : void 0, ConfigurationTarget.USER_LOCAL);
      await this.configService.updateValue(this.setting.key, this.configService.inspect(this.setting.key).userLocal?.value, ConfigurationTarget.USER_LOCAL);
    }
  }
};
ApplySettingToAllProfilesAction.ID = "settings.applyToAllProfiles";
ApplySettingToAllProfilesAction.LABEL = localize("applyToAllProfiles", "Apply Setting to all Profiles");
ApplySettingToAllProfilesAction = __decorateClass([
  __decorateParam(1, IWorkbenchConfigurationService)
], ApplySettingToAllProfilesAction);
export {
  AbstractSettingRenderer,
  NonCollapsibleObjectTreeModel,
  SettingComplexRenderer,
  SettingNewExtensionsRenderer,
  SettingTreeRenderers,
  SettingsTree,
  SettingsTreeFilter,
  createSettingMatchRegExp,
  createTocTreeForExtensionSettings,
  resolveConfiguredUntrustedSettings,
  resolveSettingsTree
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIvc2V0dGluZ3NUcmVlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQnJvd3NlckZlYXR1cmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2NhbklVc2UuanMnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgZG9tU3R5bGVzaGVldHNKcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCAqIGFzIGFyaWEgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBTaW1wbGVJY29uTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL3NpbXBsZUljb25MYWJlbC5qcyc7XG5pbXBvcnQgeyBJSW5wdXRPcHRpb25zLCBJbnB1dEJveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBDYWNoZWRMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0U3R5bGVDb250cm9sbGVyLCBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVNlbGVjdE9wdGlvbkl0ZW0sIFNlbGVjdEJveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZWxlY3RCb3gvc2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IFRvZ2dsZSwgdW50aGVtZWRUb2dnbGVTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Rvb2xiYXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBSZW5kZXJJbmRlbnRHdWlkZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hYnN0cmFjdFRyZWUuanMnO1xuaW1wb3J0IHsgSU9iamVjdFRyZWVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvb2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBPYmplY3RUcmVlTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9vYmplY3RUcmVlTW9kZWwuanMnO1xuaW1wb3J0IHsgSVRyZWVGaWx0ZXIsIElUcmVlTW9kZWwsIElUcmVlTm9kZSwgSVRyZWVSZW5kZXJlciwgVHJlZUZpbHRlclJlc3VsdCwgVHJlZVZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgaXNEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNJT1MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQsIGlzVW5kZWZpbmVkT3JOdWxsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSwgZ2V0TGFuZ3VhZ2VUYWdTZXR0aW5nUGxhaW5LZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIFdvcmtiZW5jaE9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcywgZ2V0SW5wdXRCb3hTdHlsZSwgZ2V0TGlzdFN0eWxlcywgZ2V0U2VsZWN0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGVkaXRvckJhY2tncm91bmQsIGZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBnZXRJZ25vcmVkU2V0dGluZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3NldHRpbmdzTWVyZ2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCBnZXREZWZhdWx0SWdub3JlZFNldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgaGFzTmF0aXZlQ29udGV4dE1lbnUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBBUFBMSUNBVElPTl9TQ09QRVMsIEFQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HLCBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJU2V0dGluZywgSVNldHRpbmdzR3JvdXAsIFNFVFRJTkdTX0FVVEhPUklUWSwgU2V0dGluZ1ZhbHVlVHlwZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBnZXRJbnZhbGlkVHlwZUVycm9yIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzVmFsaWRhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IExBTkdVQUdFX1NFVFRJTkdfVEFHLCBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9TSE9XX0NPTlRFWFRfTUVOVSwgY29tcGFyZVR3b051bGxhYmxlTnVtYmVycyB9IGZyb20gJy4uL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBzZXR0aW5nc051bWJlcklucHV0QmFja2dyb3VuZCwgc2V0dGluZ3NOdW1iZXJJbnB1dEJvcmRlciwgc2V0dGluZ3NOdW1iZXJJbnB1dEZvcmVncm91bmQsIHNldHRpbmdzU2VsZWN0QmFja2dyb3VuZCwgc2V0dGluZ3NTZWxlY3RCb3JkZXIsIHNldHRpbmdzU2VsZWN0Rm9yZWdyb3VuZCwgc2V0dGluZ3NTZWxlY3RMaXN0Qm9yZGVyLCBzZXR0aW5nc1RleHRJbnB1dEJhY2tncm91bmQsIHNldHRpbmdzVGV4dElucHV0Qm9yZGVyLCBzZXR0aW5nc1RleHRJbnB1dEZvcmVncm91bmQgfSBmcm9tICcuLi9jb21tb24vc2V0dGluZ3NFZGl0b3JDb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHNldHRpbmdzTW9yZUFjdGlvbkljb24gfSBmcm9tICcuL3ByZWZlcmVuY2VzSWNvbnMuanMnO1xuaW1wb3J0IHsgU2V0dGluZ3NUYXJnZXQgfSBmcm9tICcuL3ByZWZlcmVuY2VzV2lkZ2V0cy5qcyc7XG5pbXBvcnQgeyBJU2V0dGluZ092ZXJyaWRlQ2xpY2tFdmVudCwgU2V0dGluZ3NUcmVlSW5kaWNhdG9yc0xhYmVsLCBnZXRJbmRpY2F0b3JzTGFiZWxBcmlhTGFiZWwgfSBmcm9tICcuL3NldHRpbmdzRWRpdG9yU2V0dGluZ0luZGljYXRvcnMuanMnO1xuaW1wb3J0IHsgSVRPQ0VudHJ5LCBJVE9DRmlsdGVyIH0gZnJvbSAnLi9zZXR0aW5nc0xheW91dC5qcyc7XG5pbXBvcnQgeyBJU2V0dGluZ3NFZGl0b3JWaWV3U3RhdGUsIFNldHRpbmdzVHJlZUVsZW1lbnQsIFNldHRpbmdzVHJlZUdyb3VwQ2hpbGQsIFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCwgU2V0dGluZ3NUcmVlTmV3RXh0ZW5zaW9uc0VsZW1lbnQsIFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBpbnNwZWN0U2V0dGluZywgb2JqZWN0U2V0dGluZ1N1cHBvcnRzUmVtb3ZlRGVmYXVsdFZhbHVlLCBzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0IH0gZnJvbSAnLi9zZXR0aW5nc1RyZWVNb2RlbHMuanMnO1xuaW1wb3J0IHsgRXhjbHVkZVNldHRpbmdXaWRnZXQsIElCb29sT2JqZWN0RGF0YUl0ZW0sIElJbmNsdWRlRXhjbHVkZURhdGFJdGVtLCBJTGlzdERhdGFJdGVtLCBJT2JqZWN0RGF0YUl0ZW0sIElPYmplY3RFbnVtT3B0aW9uLCBJT2JqZWN0S2V5U3VnZ2VzdGVyLCBJT2JqZWN0VmFsdWVTdWdnZXN0ZXIsIEluY2x1ZGVTZXR0aW5nV2lkZ2V0LCBMaXN0U2V0dGluZ1dpZGdldCwgT2JqZWN0U2V0dGluZ0NoZWNrYm94V2lkZ2V0LCBPYmplY3RTZXR0aW5nRHJvcGRvd25XaWRnZXQsIE9iamVjdFZhbHVlLCBTZXR0aW5nTGlzdEV2ZW50IH0gZnJvbSAnLi9zZXR0aW5nc1dpZGdldHMuanMnO1xuXG5jb25zdCAkID0gRE9NLiQ7XG5cbmNvbnN0IG11bHRpR3JvdXBUb2NTZXR0aW5ncyA9IG5ldyBTZXQoW1xuXHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRVc2VyQWN0aW9uUmVxdWlyZWQnLFxuXHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRSZXNwb25zZVJlY2VpdmVkJ1xuXSk7XG5cbmZ1bmN0aW9uIGdldEluY2x1ZGVFeGNsdWRlRGlzcGxheVZhbHVlKGVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KTogSUluY2x1ZGVFeGNsdWRlRGF0YUl0ZW1bXSB7XG5cdGNvbnN0IGVsZW1lbnREZWZhdWx0VmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0gdHlwZW9mIGVsZW1lbnQuZGVmYXVsdFZhbHVlID09PSAnb2JqZWN0J1xuXHRcdD8gZWxlbWVudC5kZWZhdWx0VmFsdWUgPz8ge31cblx0XHQ6IHt9O1xuXG5cdGNvbnN0IGRhdGEgPSBlbGVtZW50LmlzQ29uZmlndXJlZCA/XG5cdFx0eyAuLi5lbGVtZW50RGVmYXVsdFZhbHVlLCAuLi5lbGVtZW50LnNjb3BlVmFsdWUgfSA6XG5cdFx0ZWxlbWVudERlZmF1bHRWYWx1ZTtcblxuXHRyZXR1cm4gT2JqZWN0LmtleXMoZGF0YSlcblx0XHQuZmlsdGVyKGtleSA9PiAhIWRhdGFba2V5XSlcblx0XHQubWFwKGtleSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0VmFsdWUgPSBlbGVtZW50RGVmYXVsdFZhbHVlW2tleV07XG5cblx0XHRcdC8vIEdldCBzb3VyY2UgaWYgaXQncyBhIGRlZmF1bHQgdmFsdWVcblx0XHRcdGxldCBzb3VyY2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChkZWZhdWx0VmFsdWUgPT09IGRhdGFba2V5XSAmJiBlbGVtZW50LnNldHRpbmcudHlwZSA9PT0gJ29iamVjdCcgJiYgZWxlbWVudC5kZWZhdWx0VmFsdWVTb3VyY2UgaW5zdGFuY2VvZiBNYXApIHtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdFNvdXJjZSA9IGVsZW1lbnQuZGVmYXVsdFZhbHVlU291cmNlLmdldChgJHtlbGVtZW50LnNldHRpbmcua2V5fS4ke2tleX1gKTtcblx0XHRcdFx0c291cmNlID0gdHlwZW9mIGRlZmF1bHRTb3VyY2UgPT09ICdzdHJpbmcnID8gZGVmYXVsdFNvdXJjZSA6IGRlZmF1bHRTb3VyY2U/LmRpc3BsYXlOYW1lO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB2YWx1ZSA9IGRhdGFba2V5XTtcblx0XHRcdGNvbnN0IHNpYmxpbmcgPSB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJyA/IHVuZGVmaW5lZCA6IHZhbHVlLndoZW47XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRhdGE6IGtleVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzaWJsaW5nLFxuXHRcdFx0XHRlbGVtZW50VHlwZTogZWxlbWVudC52YWx1ZVR5cGUsXG5cdFx0XHRcdHNvdXJjZVxuXHRcdFx0fTtcblx0XHR9KTtcbn1cblxuZnVuY3Rpb24gYXJlQWxsUHJvcGVydGllc0RlZmluZWQocHJvcGVydGllczogc3RyaW5nW10sIGl0ZW1zVG9EaXNwbGF5OiBJT2JqZWN0RGF0YUl0ZW1bXSk6IGJvb2xlYW4ge1xuXHRjb25zdCBzdGF0aWNQcm9wZXJ0aWVzID0gbmV3IFNldChwcm9wZXJ0aWVzKTtcblx0aXRlbXNUb0Rpc3BsYXkuZm9yRWFjaCgoeyBrZXkgfSkgPT4gc3RhdGljUHJvcGVydGllcy5kZWxldGUoa2V5LmRhdGEpKTtcblx0cmV0dXJuIHN0YXRpY1Byb3BlcnRpZXMuc2l6ZSA9PT0gMDtcbn1cblxuZnVuY3Rpb24gZ2V0RW51bU9wdGlvbnNGcm9tU2NoZW1hKHNjaGVtYTogSUpTT05TY2hlbWEpOiBJT2JqZWN0RW51bU9wdGlvbltdIHtcblx0aWYgKHNjaGVtYS5hbnlPZikge1xuXHRcdHJldHVybiBzY2hlbWEuYW55T2YubWFwKGdldEVudW1PcHRpb25zRnJvbVNjaGVtYSkuZmxhdCgpO1xuXHR9XG5cblx0Y29uc3QgZW51bURlc2NyaXB0aW9ucyA9IHNjaGVtYS5lbnVtRGVzY3JpcHRpb25zID8/IFtdO1xuXG5cdHJldHVybiAoc2NoZW1hLmVudW0gPz8gW10pLm1hcCgodmFsdWUsIGlkeCkgPT4ge1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gaWR4IDwgZW51bURlc2NyaXB0aW9ucy5sZW5ndGhcblx0XHRcdD8gZW51bURlc2NyaXB0aW9uc1tpZHhdXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdHJldHVybiB7IHZhbHVlLCBkZXNjcmlwdGlvbiB9O1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gZ2V0T2JqZWN0VmFsdWVUeXBlKHNjaGVtYTogSUpTT05TY2hlbWEpOiBPYmplY3RWYWx1ZVsndHlwZSddIHtcblx0aWYgKHNjaGVtYS5hbnlPZikge1xuXHRcdGNvbnN0IHN1YlR5cGVzID0gc2NoZW1hLmFueU9mLm1hcChnZXRPYmplY3RWYWx1ZVR5cGUpO1xuXHRcdGlmIChzdWJUeXBlcy5zb21lKHR5cGUgPT4gdHlwZSA9PT0gJ2VudW0nKSkge1xuXHRcdFx0cmV0dXJuICdlbnVtJztcblx0XHR9XG5cdFx0cmV0dXJuICdzdHJpbmcnO1xuXHR9XG5cblx0aWYgKHNjaGVtYS50eXBlID09PSAnYm9vbGVhbicpIHtcblx0XHRyZXR1cm4gJ2Jvb2xlYW4nO1xuXHR9IGVsc2UgaWYgKHNjaGVtYS50eXBlID09PSAnc3RyaW5nJyAmJiBpc0RlZmluZWQoc2NoZW1hLmVudW0pICYmIHNjaGVtYS5lbnVtLmxlbmd0aCA+IDApIHtcblx0XHRyZXR1cm4gJ2VudW0nO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiAnc3RyaW5nJztcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRPYmplY3RFbnRyeVZhbHVlRGlzcGxheVZhbHVlKHR5cGU6IE9iamVjdFZhbHVlWyd0eXBlJ10sIGRhdGE6IHVua25vd24sIG9wdGlvbnM6IElPYmplY3RFbnVtT3B0aW9uW10pOiBPYmplY3RWYWx1ZSB7XG5cdGlmICh0eXBlID09PSAnYm9vbGVhbicpIHtcblx0XHRyZXR1cm4geyB0eXBlLCBkYXRhOiAhIWRhdGEgfTtcblx0fSBlbHNlIGlmICh0eXBlID09PSAnZW51bScpIHtcblx0XHRyZXR1cm4geyB0eXBlLCBkYXRhOiAnJyArIGRhdGEsIG9wdGlvbnMgfTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4geyB0eXBlLCBkYXRhOiAnJyArIGRhdGEgfTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRPYmplY3REaXNwbGF5VmFsdWUoZWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpOiBJT2JqZWN0RGF0YUl0ZW1bXSB7XG5cdGNvbnN0IGVsZW1lbnREZWZhdWx0VmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0gdHlwZW9mIGVsZW1lbnQuZGVmYXVsdFZhbHVlID09PSAnb2JqZWN0J1xuXHRcdD8gZWxlbWVudC5kZWZhdWx0VmFsdWUgPz8ge31cblx0XHQ6IHt9O1xuXG5cdGNvbnN0IGVsZW1lbnRTY29wZVZhbHVlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHR5cGVvZiBlbGVtZW50LnNjb3BlVmFsdWUgPT09ICdvYmplY3QnXG5cdFx0PyBlbGVtZW50LnNjb3BlVmFsdWUgPz8ge31cblx0XHQ6IHt9O1xuXG5cdGNvbnN0IGRhdGEgPSBlbGVtZW50LmlzQ29uZmlndXJlZCA/XG5cdFx0eyAuLi5lbGVtZW50RGVmYXVsdFZhbHVlLCAuLi5lbGVtZW50U2NvcGVWYWx1ZSB9IDpcblx0XHRlbGVtZW50Lmhhc1BvbGljeVZhbHVlIHx8IGVsZW1lbnQuaXNBZ2VudHNXaW5kb3dSZWFkT25seSA/IGVsZW1lbnQuc2NvcGVWYWx1ZSA6XG5cdFx0XHRlbGVtZW50RGVmYXVsdFZhbHVlO1xuXG5cdGNvbnN0IHsgb2JqZWN0UHJvcGVydGllcywgb2JqZWN0UGF0dGVyblByb3BlcnRpZXMsIG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzIH0gPSBlbGVtZW50LnNldHRpbmc7XG5cdGNvbnN0IHBhdHRlcm5zQW5kU2NoZW1hcyA9IE9iamVjdFxuXHRcdC5lbnRyaWVzKG9iamVjdFBhdHRlcm5Qcm9wZXJ0aWVzID8/IHt9KVxuXHRcdC5tYXAoKFtwYXR0ZXJuLCBzY2hlbWFdKSA9PiAoe1xuXHRcdFx0cGF0dGVybjogbmV3IFJlZ0V4cChwYXR0ZXJuKSxcblx0XHRcdHNjaGVtYVxuXHRcdH0pKTtcblxuXHRjb25zdCB3ZWxsRGVmaW5lZEtleUVudW1PcHRpb25zID0gT2JqZWN0LmVudHJpZXMob2JqZWN0UHJvcGVydGllcyA/PyB7fSkubWFwKFxuXHRcdChba2V5LCBzY2hlbWFdKSA9PiAoeyB2YWx1ZToga2V5LCBkZXNjcmlwdGlvbjogc2NoZW1hLmRlc2NyaXB0aW9uIH0pXG5cdCk7XG5cblx0cmV0dXJuIE9iamVjdC5rZXlzKGRhdGEpLm1hcChrZXkgPT4ge1xuXHRcdGNvbnN0IGRlZmF1bHRWYWx1ZSA9IGVsZW1lbnREZWZhdWx0VmFsdWVba2V5XTtcblxuXHRcdC8vIEdldCBzb3VyY2UgaWYgaXQncyBhIGRlZmF1bHQgdmFsdWVcblx0XHRsZXQgc291cmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGRlZmF1bHRWYWx1ZSA9PT0gZGF0YVtrZXldICYmIGVsZW1lbnQuc2V0dGluZy50eXBlID09PSAnb2JqZWN0JyAmJiBlbGVtZW50LmRlZmF1bHRWYWx1ZVNvdXJjZSBpbnN0YW5jZW9mIE1hcCkge1xuXHRcdFx0Y29uc3QgZGVmYXVsdFNvdXJjZSA9IGVsZW1lbnQuZGVmYXVsdFZhbHVlU291cmNlLmdldChgJHtlbGVtZW50LnNldHRpbmcua2V5fS4ke2tleX1gKTtcblx0XHRcdHNvdXJjZSA9IHR5cGVvZiBkZWZhdWx0U291cmNlID09PSAnc3RyaW5nJyA/IGRlZmF1bHRTb3VyY2UgOiBkZWZhdWx0U291cmNlPy5kaXNwbGF5TmFtZTtcblx0XHR9XG5cblx0XHRpZiAoaXNEZWZpbmVkKG9iamVjdFByb3BlcnRpZXMpICYmIGtleSBpbiBvYmplY3RQcm9wZXJ0aWVzKSB7XG5cdFx0XHRjb25zdCB2YWx1ZUVudW1PcHRpb25zID0gZ2V0RW51bU9wdGlvbnNGcm9tU2NoZW1hKG9iamVjdFByb3BlcnRpZXNba2V5XSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRrZXk6IHtcblx0XHRcdFx0XHR0eXBlOiAnZW51bScsXG5cdFx0XHRcdFx0ZGF0YToga2V5LFxuXHRcdFx0XHRcdG9wdGlvbnM6IHdlbGxEZWZpbmVkS2V5RW51bU9wdGlvbnMsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZhbHVlOiBnZXRPYmplY3RFbnRyeVZhbHVlRGlzcGxheVZhbHVlKGdldE9iamVjdFZhbHVlVHlwZShvYmplY3RQcm9wZXJ0aWVzW2tleV0pLCBkYXRhW2tleV0sIHZhbHVlRW51bU9wdGlvbnMpLFxuXHRcdFx0XHRrZXlEZXNjcmlwdGlvbjogb2JqZWN0UHJvcGVydGllc1trZXldLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRyZW1vdmFibGU6IGlzVW5kZWZpbmVkT3JOdWxsKGRlZmF1bHRWYWx1ZSksXG5cdFx0XHRcdHJlc2V0YWJsZTogIWlzVW5kZWZpbmVkT3JOdWxsKGRlZmF1bHRWYWx1ZSksXG5cdFx0XHRcdHNvdXJjZVxuXHRcdFx0fSBzYXRpc2ZpZXMgSU9iamVjdERhdGFJdGVtO1xuXHRcdH1cblxuXHRcdC8vIFRoZSByb3cgaXMgcmVtb3ZhYmxlIGlmIGl0IGRvZXNuJ3QgaGF2ZSBhIGRlZmF1bHQgdmFsdWUgYXNzaWduZWQgb3IgdGhlIHNldHRpbmcgc3VwcG9ydHMgcmVtb3ZpbmcgdGhlIGRlZmF1bHQgdmFsdWUuXG5cdFx0Ly8gSWYgYSBkZWZhdWx0IHZhbHVlIGlzIGFzc2lnbmVkIGFuZCB0aGUgdXNlciBtb2RpZmllZCB0aGUgZGVmYXVsdCwgaXQgY2FuIGJlIHJlc2V0IGJhY2sgdG8gdGhlIGRlZmF1bHQuXG5cdFx0Y29uc3QgcmVtb3ZhYmxlID0gZGVmYXVsdFZhbHVlID09PSB1bmRlZmluZWQgfHwgb2JqZWN0U2V0dGluZ1N1cHBvcnRzUmVtb3ZlRGVmYXVsdFZhbHVlKGVsZW1lbnQuc2V0dGluZy5rZXkpO1xuXHRcdGNvbnN0IHJlc2V0YWJsZSA9ICEhZGVmYXVsdFZhbHVlICYmIGRlZmF1bHRWYWx1ZSAhPT0gZGF0YVtrZXldO1xuXHRcdGNvbnN0IHNjaGVtYSA9IHBhdHRlcm5zQW5kU2NoZW1hcy5maW5kKCh7IHBhdHRlcm4gfSkgPT4gcGF0dGVybi50ZXN0KGtleSkpPy5zY2hlbWE7XG5cdFx0aWYgKHNjaGVtYSkge1xuXHRcdFx0Y29uc3QgdmFsdWVFbnVtT3B0aW9ucyA9IGdldEVudW1PcHRpb25zRnJvbVNjaGVtYShzY2hlbWEpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2V5OiB7IHR5cGU6ICdzdHJpbmcnLCBkYXRhOiBrZXkgfSxcblx0XHRcdFx0dmFsdWU6IGdldE9iamVjdEVudHJ5VmFsdWVEaXNwbGF5VmFsdWUoZ2V0T2JqZWN0VmFsdWVUeXBlKHNjaGVtYSksIGRhdGFba2V5XSwgdmFsdWVFbnVtT3B0aW9ucyksXG5cdFx0XHRcdGtleURlc2NyaXB0aW9uOiBzY2hlbWEuZGVzY3JpcHRpb24sXG5cdFx0XHRcdHJlbW92YWJsZSxcblx0XHRcdFx0cmVzZXRhYmxlLFxuXHRcdFx0XHRzb3VyY2Vcblx0XHRcdH0gc2F0aXNmaWVzIElPYmplY3REYXRhSXRlbTtcblx0XHR9XG5cblx0XHRjb25zdCBhZGRpdGlvbmFsVmFsdWVFbnVtcyA9IGdldEVudW1PcHRpb25zRnJvbVNjaGVtYShcblx0XHRcdHR5cGVvZiBvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcyA9PT0gJ2Jvb2xlYW4nXG5cdFx0XHRcdD8ge31cblx0XHRcdFx0OiBvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcyA/PyB7fVxuXHRcdCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0a2V5OiB7IHR5cGU6ICdzdHJpbmcnLCBkYXRhOiBrZXkgfSxcblx0XHRcdHZhbHVlOiBnZXRPYmplY3RFbnRyeVZhbHVlRGlzcGxheVZhbHVlKFxuXHRcdFx0XHR0eXBlb2Ygb2JqZWN0QWRkaXRpb25hbFByb3BlcnRpZXMgPT09ICdvYmplY3QnID8gZ2V0T2JqZWN0VmFsdWVUeXBlKG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzKSA6ICdzdHJpbmcnLFxuXHRcdFx0XHRkYXRhW2tleV0sXG5cdFx0XHRcdGFkZGl0aW9uYWxWYWx1ZUVudW1zLFxuXHRcdFx0KSxcblx0XHRcdGtleURlc2NyaXB0aW9uOiB0eXBlb2Ygb2JqZWN0QWRkaXRpb25hbFByb3BlcnRpZXMgPT09ICdvYmplY3QnID8gb2JqZWN0QWRkaXRpb25hbFByb3BlcnRpZXMuZGVzY3JpcHRpb24gOiB1bmRlZmluZWQsXG5cdFx0XHRyZW1vdmFibGUsXG5cdFx0XHRyZXNldGFibGUsXG5cdFx0XHRzb3VyY2Vcblx0XHR9IHNhdGlzZmllcyBJT2JqZWN0RGF0YUl0ZW07XG5cdH0pLmZpbHRlcihpdGVtID0+ICFpc1VuZGVmaW5lZE9yTnVsbChpdGVtLnZhbHVlLmRhdGEpKTtcbn1cblxuZnVuY3Rpb24gZ2V0Qm9vbE9iamVjdERpc3BsYXlWYWx1ZShlbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCk6IElCb29sT2JqZWN0RGF0YUl0ZW1bXSB7XG5cdGNvbnN0IGVsZW1lbnREZWZhdWx0VmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0gdHlwZW9mIGVsZW1lbnQuZGVmYXVsdFZhbHVlID09PSAnb2JqZWN0J1xuXHRcdD8gZWxlbWVudC5kZWZhdWx0VmFsdWUgPz8ge31cblx0XHQ6IHt9O1xuXG5cdGNvbnN0IGVsZW1lbnRTY29wZVZhbHVlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHR5cGVvZiBlbGVtZW50LnNjb3BlVmFsdWUgPT09ICdvYmplY3QnXG5cdFx0PyBlbGVtZW50LnNjb3BlVmFsdWUgPz8ge31cblx0XHQ6IHt9O1xuXG5cdGNvbnN0IGRhdGEgPSBlbGVtZW50LmlzQ29uZmlndXJlZCA/XG5cdFx0eyAuLi5lbGVtZW50RGVmYXVsdFZhbHVlLCAuLi5lbGVtZW50U2NvcGVWYWx1ZSB9IDpcblx0XHRlbGVtZW50RGVmYXVsdFZhbHVlO1xuXG5cdGNvbnN0IHsgb2JqZWN0UHJvcGVydGllcyB9ID0gZWxlbWVudC5zZXR0aW5nO1xuXHRjb25zdCBkaXNwbGF5VmFsdWVzOiBJQm9vbE9iamVjdERhdGFJdGVtW10gPSBbXTtcblx0Zm9yIChjb25zdCBrZXkgaW4gb2JqZWN0UHJvcGVydGllcykge1xuXHRcdGNvbnN0IGRlZmF1bHRWYWx1ZSA9IGVsZW1lbnREZWZhdWx0VmFsdWVba2V5XTtcblxuXHRcdC8vIEdldCBzb3VyY2UgaWYgaXQncyBhIGRlZmF1bHQgdmFsdWVcblx0XHRsZXQgc291cmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGRlZmF1bHRWYWx1ZSA9PT0gZGF0YVtrZXldICYmIGVsZW1lbnQuc2V0dGluZy50eXBlID09PSAnb2JqZWN0JyAmJiBlbGVtZW50LmRlZmF1bHRWYWx1ZVNvdXJjZSBpbnN0YW5jZW9mIE1hcCkge1xuXHRcdFx0Y29uc3QgZGVmYXVsdFNvdXJjZSA9IGVsZW1lbnQuZGVmYXVsdFZhbHVlU291cmNlLmdldChrZXkpO1xuXHRcdFx0c291cmNlID0gdHlwZW9mIGRlZmF1bHRTb3VyY2UgPT09ICdzdHJpbmcnID8gZGVmYXVsdFNvdXJjZSA6IGRlZmF1bHRTb3VyY2U/LmRpc3BsYXlOYW1lO1xuXHRcdH1cblxuXHRcdGRpc3BsYXlWYWx1ZXMucHVzaCh7XG5cdFx0XHRrZXk6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRhdGE6IGtleVxuXHRcdFx0fSxcblx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGF0YTogISFkYXRhW2tleV1cblx0XHRcdH0sXG5cdFx0XHRrZXlEZXNjcmlwdGlvbjogb2JqZWN0UHJvcGVydGllc1trZXldLmRlc2NyaXB0aW9uLFxuXHRcdFx0cmVtb3ZhYmxlOiBmYWxzZSxcblx0XHRcdHJlc2V0YWJsZTogdHJ1ZSxcblx0XHRcdHNvdXJjZVxuXHRcdH0pO1xuXHR9XG5cdHJldHVybiBkaXNwbGF5VmFsdWVzO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVBcnJheVN1Z2dlc3RlcihlbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCk6IElPYmplY3RLZXlTdWdnZXN0ZXIge1xuXHRyZXR1cm4gKGtleXMsIGlkeCkgPT4ge1xuXHRcdGNvbnN0IGVudW1PcHRpb25zOiBJT2JqZWN0RW51bU9wdGlvbltdID0gW107XG5cblx0XHRpZiAoZWxlbWVudC5zZXR0aW5nLmVudW0pIHtcblx0XHRcdGVsZW1lbnQuc2V0dGluZy5lbnVtLmZvckVhY2goKGtleSwgaSkgPT4ge1xuXHRcdFx0XHQvLyBpbmNsdWRlIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgdmFsdWUsIGV2ZW4gaWYgdW5pcXVlSXRlbXMgaXMgdHJ1ZVxuXHRcdFx0XHRpZiAoIWVsZW1lbnQuc2V0dGluZy51bmlxdWVJdGVtcyB8fCAoaWR4ICE9PSB1bmRlZmluZWQgJiYga2V5ID09PSBrZXlzW2lkeF0pIHx8ICFrZXlzLmluY2x1ZGVzKGtleSkpIHtcblx0XHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGVsZW1lbnQuc2V0dGluZy5lbnVtRGVzY3JpcHRpb25zPy5baV07XG5cdFx0XHRcdFx0ZW51bU9wdGlvbnMucHVzaCh7IHZhbHVlOiBrZXksIGRlc2NyaXB0aW9uIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZW51bU9wdGlvbnMubGVuZ3RoID4gMFxuXHRcdFx0PyB7IHR5cGU6ICdlbnVtJywgZGF0YTogZW51bU9wdGlvbnNbMF0udmFsdWUsIG9wdGlvbnM6IGVudW1PcHRpb25zIH1cblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVPYmplY3RLZXlTdWdnZXN0ZXIoZWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpOiBJT2JqZWN0S2V5U3VnZ2VzdGVyIHtcblx0Y29uc3QgeyBvYmplY3RQcm9wZXJ0aWVzIH0gPSBlbGVtZW50LnNldHRpbmc7XG5cdGNvbnN0IGFsbFN0YXRpY0tleXMgPSBPYmplY3Qua2V5cyhvYmplY3RQcm9wZXJ0aWVzID8/IHt9KTtcblxuXHRyZXR1cm4ga2V5cyA9PiB7XG5cdFx0Y29uc3QgZXhpc3RpbmdLZXlzID0gbmV3IFNldChrZXlzKTtcblx0XHRjb25zdCBlbnVtT3B0aW9uczogSU9iamVjdEVudW1PcHRpb25bXSA9IFtdO1xuXG5cdFx0YWxsU3RhdGljS2V5cy5mb3JFYWNoKHN0YXRpY0tleSA9PiB7XG5cdFx0XHRpZiAoIWV4aXN0aW5nS2V5cy5oYXMoc3RhdGljS2V5KSkge1xuXHRcdFx0XHRlbnVtT3B0aW9ucy5wdXNoKHsgdmFsdWU6IHN0YXRpY0tleSwgZGVzY3JpcHRpb246IG9iamVjdFByb3BlcnRpZXMhW3N0YXRpY0tleV0uZGVzY3JpcHRpb24gfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZW51bU9wdGlvbnMubGVuZ3RoID4gMFxuXHRcdFx0PyB7IHR5cGU6ICdlbnVtJywgZGF0YTogZW51bU9wdGlvbnNbMF0udmFsdWUsIG9wdGlvbnM6IGVudW1PcHRpb25zIH1cblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVPYmplY3RWYWx1ZVN1Z2dlc3RlcihlbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCk6IElPYmplY3RWYWx1ZVN1Z2dlc3RlciB7XG5cdGNvbnN0IHsgb2JqZWN0UHJvcGVydGllcywgb2JqZWN0UGF0dGVyblByb3BlcnRpZXMsIG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzIH0gPSBlbGVtZW50LnNldHRpbmc7XG5cblx0Y29uc3QgcGF0dGVybnNBbmRTY2hlbWFzID0gT2JqZWN0XG5cdFx0LmVudHJpZXMob2JqZWN0UGF0dGVyblByb3BlcnRpZXMgPz8ge30pXG5cdFx0Lm1hcCgoW3BhdHRlcm4sIHNjaGVtYV0pID0+ICh7XG5cdFx0XHRwYXR0ZXJuOiBuZXcgUmVnRXhwKHBhdHRlcm4pLFxuXHRcdFx0c2NoZW1hXG5cdFx0fSkpO1xuXG5cdHJldHVybiAoa2V5OiBzdHJpbmcpID0+IHtcblx0XHRsZXQgc3VnZ2VzdGVkU2NoZW1hOiBJSlNPTlNjaGVtYSB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChpc0RlZmluZWQob2JqZWN0UHJvcGVydGllcykgJiYga2V5IGluIG9iamVjdFByb3BlcnRpZXMpIHtcblx0XHRcdHN1Z2dlc3RlZFNjaGVtYSA9IG9iamVjdFByb3BlcnRpZXNba2V5XTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXR0ZXJuU2NoZW1hID0gc3VnZ2VzdGVkU2NoZW1hID8/IHBhdHRlcm5zQW5kU2NoZW1hcy5maW5kKCh7IHBhdHRlcm4gfSkgPT4gcGF0dGVybi50ZXN0KGtleSkpPy5zY2hlbWE7XG5cblx0XHRpZiAoaXNEZWZpbmVkKHBhdHRlcm5TY2hlbWEpKSB7XG5cdFx0XHRzdWdnZXN0ZWRTY2hlbWEgPSBwYXR0ZXJuU2NoZW1hO1xuXHRcdH0gZWxzZSBpZiAoaXNEZWZpbmVkKG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzKSAmJiB0eXBlb2Ygb2JqZWN0QWRkaXRpb25hbFByb3BlcnRpZXMgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRzdWdnZXN0ZWRTY2hlbWEgPSBvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcztcblx0XHR9XG5cblx0XHRpZiAoaXNEZWZpbmVkKHN1Z2dlc3RlZFNjaGVtYSkpIHtcblx0XHRcdGNvbnN0IHR5cGUgPSBnZXRPYmplY3RWYWx1ZVR5cGUoc3VnZ2VzdGVkU2NoZW1hKTtcblxuXHRcdFx0aWYgKHR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlLCBkYXRhOiBzdWdnZXN0ZWRTY2hlbWEuZGVmYXVsdCA/PyB0cnVlIH07XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGUgPT09ICdlbnVtJykge1xuXHRcdFx0XHRjb25zdCBvcHRpb25zID0gZ2V0RW51bU9wdGlvbnNGcm9tU2NoZW1hKHN1Z2dlc3RlZFNjaGVtYSk7XG5cdFx0XHRcdHJldHVybiB7IHR5cGUsIGRhdGE6IHN1Z2dlc3RlZFNjaGVtYS5kZWZhdWx0ID8/IG9wdGlvbnNbMF0udmFsdWUsIG9wdGlvbnMgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGUsIGRhdGE6IHN1Z2dlc3RlZFNjaGVtYS5kZWZhdWx0ID8/ICcnIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuO1xuXHR9O1xufVxuXG5mdW5jdGlvbiBpc05vbk51bGxhYmxlTnVtZXJpY1R5cGUodHlwZTogdW5rbm93bik6IHR5cGUgaXMgJ251bWJlcicgfCAnaW50ZWdlcicge1xuXHRyZXR1cm4gdHlwZSA9PT0gJ251bWJlcicgfHwgdHlwZSA9PT0gJ2ludGVnZXInO1xufVxuXG5mdW5jdGlvbiBwYXJzZU51bWVyaWNPYmplY3RWYWx1ZXMoZGF0YUVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCB2OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0Y29uc3QgbmV3UmVjb3JkOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRmb3IgKGNvbnN0IGtleSBpbiB2KSB7XG5cdFx0Ly8gU2V0IHRvIHRydWUvZmFsc2Ugb25jZSB3ZSdyZSBzdXJlIG9mIHRoZSBhbnN3ZXJcblx0XHRsZXQga2V5TWF0Y2hlc051bWVyaWNQcm9wZXJ0eTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwYXR0ZXJuUHJvcGVydGllcyA9IGRhdGFFbGVtZW50LnNldHRpbmcub2JqZWN0UGF0dGVyblByb3BlcnRpZXM7XG5cdFx0Y29uc3QgcHJvcGVydGllcyA9IGRhdGFFbGVtZW50LnNldHRpbmcub2JqZWN0UHJvcGVydGllcztcblx0XHRjb25zdCBhZGRpdGlvbmFsUHJvcGVydGllcyA9IGRhdGFFbGVtZW50LnNldHRpbmcub2JqZWN0QWRkaXRpb25hbFByb3BlcnRpZXM7XG5cblx0XHQvLyBNYXRjaCB0aGUgY3VycmVudCByZWNvcmQga2V5IGFnYWluc3QgdGhlIHByb3BlcnRpZXMgb2YgdGhlIG9iamVjdFxuXHRcdGlmIChwcm9wZXJ0aWVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHByb3BLZXkgaW4gcHJvcGVydGllcykge1xuXHRcdFx0XHRpZiAocHJvcEtleSA9PT0ga2V5KSB7XG5cdFx0XHRcdFx0a2V5TWF0Y2hlc051bWVyaWNQcm9wZXJ0eSA9IGlzTm9uTnVsbGFibGVOdW1lcmljVHlwZShwcm9wZXJ0aWVzW3Byb3BLZXldLnR5cGUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChrZXlNYXRjaGVzTnVtZXJpY1Byb3BlcnR5ID09PSB1bmRlZmluZWQgJiYgcGF0dGVyblByb3BlcnRpZXMpIHtcblx0XHRcdGZvciAoY29uc3QgcGF0dGVybktleSBpbiBwYXR0ZXJuUHJvcGVydGllcykge1xuXHRcdFx0XHRpZiAoa2V5Lm1hdGNoKHBhdHRlcm5LZXkpKSB7XG5cdFx0XHRcdFx0a2V5TWF0Y2hlc051bWVyaWNQcm9wZXJ0eSA9IGlzTm9uTnVsbGFibGVOdW1lcmljVHlwZShwYXR0ZXJuUHJvcGVydGllc1twYXR0ZXJuS2V5XS50eXBlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoa2V5TWF0Y2hlc051bWVyaWNQcm9wZXJ0eSA9PT0gdW5kZWZpbmVkICYmIGFkZGl0aW9uYWxQcm9wZXJ0aWVzICYmIHR5cGVvZiBhZGRpdGlvbmFsUHJvcGVydGllcyAhPT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRpZiAoaXNOb25OdWxsYWJsZU51bWVyaWNUeXBlKGFkZGl0aW9uYWxQcm9wZXJ0aWVzLnR5cGUpKSB7XG5cdFx0XHRcdGtleU1hdGNoZXNOdW1lcmljUHJvcGVydHkgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRuZXdSZWNvcmRba2V5XSA9IGtleU1hdGNoZXNOdW1lcmljUHJvcGVydHkgPyBOdW1iZXIodltrZXldKSA6IHZba2V5XTtcblx0fVxuXHRyZXR1cm4gbmV3UmVjb3JkO1xufVxuXG5mdW5jdGlvbiBnZXRMaXN0RGlzcGxheVZhbHVlKGVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KTogSUxpc3REYXRhSXRlbVtdIHtcblx0aWYgKCFlbGVtZW50LnZhbHVlIHx8ICFBcnJheS5pc0FycmF5KGVsZW1lbnQudmFsdWUpKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0aWYgKGVsZW1lbnQuc2V0dGluZy5hcnJheUl0ZW1UeXBlID09PSAnZW51bScpIHtcblx0XHRsZXQgZW51bU9wdGlvbnM6IElPYmplY3RFbnVtT3B0aW9uW10gPSBbXTtcblx0XHRpZiAoZWxlbWVudC5zZXR0aW5nLmVudW0pIHtcblx0XHRcdGVudW1PcHRpb25zID0gZWxlbWVudC5zZXR0aW5nLmVudW0ubWFwKChzZXR0aW5nLCBpKSA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dmFsdWU6IHNldHRpbmcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGVsZW1lbnQuc2V0dGluZy5lbnVtRGVzY3JpcHRpb25zPy5baV1cblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gZWxlbWVudC52YWx1ZS5tYXAoKGtleTogc3RyaW5nKSA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRcdHR5cGU6ICdlbnVtJyxcblx0XHRcdFx0XHRkYXRhOiBrZXksXG5cdFx0XHRcdFx0b3B0aW9uczogZW51bU9wdGlvbnNcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9KTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gZWxlbWVudC52YWx1ZS5tYXAoKGtleTogc3RyaW5nKSA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRhdGE6IGtleVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFNob3dBZGRCdXR0b25MaXN0KGRhdGFFbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbGlzdERpc3BsYXlWYWx1ZTogSUxpc3REYXRhSXRlbVtdKTogYm9vbGVhbiB7XG5cdGlmIChkYXRhRWxlbWVudC5zZXR0aW5nLmVudW0gJiYgZGF0YUVsZW1lbnQuc2V0dGluZy51bmlxdWVJdGVtcykge1xuXHRcdHJldHVybiBkYXRhRWxlbWVudC5zZXR0aW5nLmVudW0ubGVuZ3RoIC0gbGlzdERpc3BsYXlWYWx1ZS5sZW5ndGggPiAwO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlU2V0dGluZ3NUcmVlKHRvY0RhdGE6IElUT0NFbnRyeTxzdHJpbmc+LCBjb3JlU2V0dGluZ3NHcm91cHM6IElTZXR0aW5nc0dyb3VwW10sIGZpbHRlcjogSVRPQ0ZpbHRlciB8IHVuZGVmaW5lZCwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiB7IHRyZWU6IElUT0NFbnRyeTxJU2V0dGluZz47IGxlZnRvdmVyU2V0dGluZ3M6IFNldDxJU2V0dGluZz4gfSB7XG5cdGNvbnN0IGFsbFNldHRpbmdzID0gZ2V0RmxhdFNldHRpbmdzKGNvcmVTZXR0aW5nc0dyb3Vwcyk7XG5cdHJldHVybiB7XG5cdFx0dHJlZTogX3Jlc29sdmVTZXR0aW5nc1RyZWUodG9jRGF0YSwgYWxsU2V0dGluZ3MsIGZpbHRlciwgbG9nU2VydmljZSksXG5cdFx0bGVmdG92ZXJTZXR0aW5nczogYWxsU2V0dGluZ3Ncblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVDb25maWd1cmVkVW50cnVzdGVkU2V0dGluZ3MoZ3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdLCB0YXJnZXQ6IFNldHRpbmdzVGFyZ2V0LCBsYW5ndWFnZUZpbHRlcjogc3RyaW5nIHwgdW5kZWZpbmVkLCBjb25maWd1cmF0aW9uU2VydmljZTogSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlKTogSVNldHRpbmdbXSB7XG5cdGNvbnN0IGFsbFNldHRpbmdzID0gZ2V0RmxhdFNldHRpbmdzKGdyb3Vwcyk7XG5cdHJldHVybiBbLi4uYWxsU2V0dGluZ3NdLmZpbHRlcihzZXR0aW5nID0+IHNldHRpbmcucmVzdHJpY3RlZCAmJiBpbnNwZWN0U2V0dGluZyhzZXR0aW5nLmtleSwgdGFyZ2V0LCBsYW5ndWFnZUZpbHRlciwgY29uZmlndXJhdGlvblNlcnZpY2UpLmlzQ29uZmlndXJlZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVUb2NUcmVlRm9yRXh0ZW5zaW9uU2V0dGluZ3MoZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsIGdyb3VwczogSVNldHRpbmdzR3JvdXBbXSwgZmlsdGVyOiBJVE9DRmlsdGVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJVE9DRW50cnk8SVNldHRpbmc+PiB7XG5cdGNvbnN0IGV4dEdyb3VwVHJlZSA9IG5ldyBNYXA8c3RyaW5nLCBJVE9DRW50cnk8SVNldHRpbmc+PigpO1xuXHRjb25zdCBhZGRFbnRyeVRvVHJlZSA9IChleHRlbnNpb25JZDogc3RyaW5nLCBleHRlbnNpb25OYW1lOiBzdHJpbmcsIGNoaWxkRW50cnk6IElUT0NFbnRyeTxJU2V0dGluZz4pID0+IHtcblx0XHRpZiAoIWV4dEdyb3VwVHJlZS5oYXMoZXh0ZW5zaW9uSWQpKSB7XG5cdFx0XHRjb25zdCByb290RW50cnkgPSB7XG5cdFx0XHRcdGlkOiBleHRlbnNpb25JZCxcblx0XHRcdFx0bGFiZWw6IGV4dGVuc2lvbk5hbWUsXG5cdFx0XHRcdGNoaWxkcmVuOiBbXVxuXHRcdFx0fTtcblx0XHRcdGV4dEdyb3VwVHJlZS5zZXQoZXh0ZW5zaW9uSWQsIHJvb3RFbnRyeSk7XG5cdFx0fVxuXHRcdGV4dEdyb3VwVHJlZS5nZXQoZXh0ZW5zaW9uSWQpIS5jaGlsZHJlbiEucHVzaChjaGlsZEVudHJ5KTtcblx0fTtcblx0Y29uc3QgcHJvY2Vzc0dyb3VwRW50cnkgPSBhc3luYyAoZ3JvdXA6IElTZXR0aW5nc0dyb3VwKSA9PiB7XG5cdFx0Y29uc3QgZmxhdFNldHRpbmdzID0gZ3JvdXAuc2VjdGlvbnMubWFwKHNlY3Rpb24gPT4gc2VjdGlvbi5zZXR0aW5ncykuZmxhdCgpO1xuXHRcdGNvbnN0IHNldHRpbmdzID0gZmlsdGVyID8gZ2V0TWF0Y2hpbmdTZXR0aW5ncyhuZXcgU2V0KGZsYXRTZXR0aW5ncyksIGZpbHRlcikgOiBmbGF0U2V0dGluZ3M7XG5cdFx0c29ydFNldHRpbmdzKHNldHRpbmdzKTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbklkID0gZ3JvdXAuZXh0ZW5zaW9uSW5mbyEuaWQ7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb24oZXh0ZW5zaW9uSWQpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbk5hbWUgPSBleHRlbnNpb24/LmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbj8ubmFtZSA/PyBleHRlbnNpb25JZDtcblxuXHRcdC8vIFRoZXJlIGNvdWxkIGJlIG11bHRpcGxlIGdyb3VwcyB3aXRoIHRoZSBzYW1lIGV4dGVuc2lvbiBpZCB0aGF0IGFsbCBiZWxvbmcgdG8gdGhlIHNhbWUgZXh0ZW5zaW9uLlxuXHRcdC8vIFRvIGF2b2lkIGhpZ2hsaWdodGluZyBhbGwgZ3JvdXBzIHVwb24gZXhwYW5kaW5nIHRoZSBleHRlbnNpb24ncyBUb0MgZW50cnksXG5cdFx0Ly8gdXNlIHRoZSBncm91cCBJRCBvbmx5IGlmIGl0IGlzIG5vbi1lbXB0eSBhbmQgaXNuJ3QgdGhlIGV4dGVuc2lvbiBJRC5cblx0XHQvLyBSZWYgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI0MTUyMS5cblx0XHRjb25zdCBzZXR0aW5nR3JvdXBJZCA9IChncm91cC5pZCAmJiBncm91cC5pZCAhPT0gZXh0ZW5zaW9uSWQpID8gZ3JvdXAuaWQgOiBncm91cC50aXRsZTtcblxuXHRcdGNvbnN0IGNoaWxkRW50cnk6IElUT0NFbnRyeTxJU2V0dGluZz4gPSB7XG5cdFx0XHRpZDogc2V0dGluZ0dyb3VwSWQsXG5cdFx0XHRsYWJlbDogZ3JvdXAudGl0bGUsXG5cdFx0XHRvcmRlcjogZ3JvdXAub3JkZXIsXG5cdFx0XHRzZXR0aW5nc1xuXHRcdH07XG5cdFx0YWRkRW50cnlUb1RyZWUoZXh0ZW5zaW9uSWQsIGV4dGVuc2lvbk5hbWUsIGNoaWxkRW50cnkpO1xuXHR9O1xuXG5cdGNvbnN0IHByb2Nlc3NQcm9taXNlcyA9IGdyb3Vwcy5tYXAoZyA9PiBwcm9jZXNzR3JvdXBFbnRyeShnKSk7XG5cdHJldHVybiBQcm9taXNlLmFsbChwcm9jZXNzUHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuXHRcdGNvbnN0IGV4dEdyb3VwczogSVRPQ0VudHJ5PElTZXR0aW5nPltdID0gW107XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb25Sb290RW50cnkgb2YgZXh0R3JvdXBUcmVlLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uUm9vdEVudHJ5LmNoaWxkcmVuIS5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0Ly8gVGhlcmUgaXMgYSBzaW5nbGUgY2F0ZWdvcnkgZm9yIHRoaXMgZXh0ZW5zaW9uLlxuXHRcdFx0XHQvLyBQdXNoIGEgZmxhdHRlbmVkIHNldHRpbmcuXG5cdFx0XHRcdGV4dEdyb3Vwcy5wdXNoKHtcblx0XHRcdFx0XHRpZDogZXh0ZW5zaW9uUm9vdEVudHJ5LmlkLFxuXHRcdFx0XHRcdGxhYmVsOiBleHRlbnNpb25Sb290RW50cnkuY2hpbGRyZW4hWzBdLmxhYmVsLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBleHRlbnNpb25Sb290RW50cnkuY2hpbGRyZW4hWzBdLnNldHRpbmdzXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gU29ydCB0aGUgY2F0ZWdvcmllcy5cblx0XHRcdFx0Ly8gTGVhdmUgdGhlIHVuZGVmaW5lZCBvcmRlciBjYXRlZ29yaWVzIHVudG91Y2hlZC5cblx0XHRcdFx0ZXh0ZW5zaW9uUm9vdEVudHJ5LmNoaWxkcmVuIS5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIGNvbXBhcmVUd29OdWxsYWJsZU51bWJlcnMoYS5vcmRlciwgYi5vcmRlcik7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIElmIHRoZXJlIGlzIGEgY2F0ZWdvcnkgdGhhdCBtYXRjaGVzIHRoZSBzZXR0aW5nIG5hbWUsXG5cdFx0XHRcdC8vIGFkZCB0aGUgc2V0dGluZ3MgaW4gbWFudWFsbHkgYXMgXCJ1bmdyb3VwZWRcIiBzZXR0aW5ncy5cblx0XHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzNzI1OVxuXHRcdFx0XHRjb25zdCB1bmdyb3VwZWRDaGlsZCA9IGV4dGVuc2lvblJvb3RFbnRyeS5jaGlsZHJlbiEuZmluZChjaGlsZCA9PiBjaGlsZC5sYWJlbCA9PT0gZXh0ZW5zaW9uUm9vdEVudHJ5LmxhYmVsKTtcblx0XHRcdFx0aWYgKHVuZ3JvdXBlZENoaWxkICYmICF1bmdyb3VwZWRDaGlsZC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGNvbnN0IGdyb3VwZWRDaGlsZHJlbiA9IGV4dGVuc2lvblJvb3RFbnRyeS5jaGlsZHJlbiEuZmlsdGVyKGNoaWxkID0+IGNoaWxkICE9PSB1bmdyb3VwZWRDaGlsZCk7XG5cdFx0XHRcdFx0ZXh0R3JvdXBzLnB1c2goe1xuXHRcdFx0XHRcdFx0aWQ6IGV4dGVuc2lvblJvb3RFbnRyeS5pZCxcblx0XHRcdFx0XHRcdGxhYmVsOiBleHRlbnNpb25Sb290RW50cnkubGFiZWwsXG5cdFx0XHRcdFx0XHRzZXR0aW5nczogdW5ncm91cGVkQ2hpbGQuc2V0dGluZ3MsXG5cdFx0XHRcdFx0XHRjaGlsZHJlbjogZ3JvdXBlZENoaWxkcmVuXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gUHVzaCBhbGwgdGhlIGdyb3VwcyBhcy1pcy5cblx0XHRcdFx0XHRleHRHcm91cHMucHVzaChleHRlbnNpb25Sb290RW50cnkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU29ydCB0aGUgb3V0ZXJtb3N0IHNldHRpbmdzLlxuXHRcdGV4dEdyb3Vwcy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiAnZXh0ZW5zaW9ucycsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2V4dGVuc2lvbnMnLCBcIkV4dGVuc2lvbnNcIiksXG5cdFx0XHRjaGlsZHJlbjogZXh0R3JvdXBzXG5cdFx0fTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIF9yZXNvbHZlU2V0dGluZ3NUcmVlKHRvY0RhdGE6IElUT0NFbnRyeTxzdHJpbmc+LCBhbGxTZXR0aW5nczogU2V0PElTZXR0aW5nPiwgZmlsdGVyOiBJVE9DRmlsdGVyIHwgdW5kZWZpbmVkLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IElUT0NFbnRyeTxJU2V0dGluZz4ge1xuXHRsZXQgY2hpbGRyZW46IElUT0NFbnRyeTxJU2V0dGluZz5bXSB8IHVuZGVmaW5lZDtcblx0aWYgKHRvY0RhdGEuY2hpbGRyZW4pIHtcblx0XHRjaGlsZHJlbiA9IHRvY0RhdGEuY2hpbGRyZW5cblx0XHRcdC5maWx0ZXIoY2hpbGQgPT4gY2hpbGQuaGlkZSAhPT0gdHJ1ZSlcblx0XHRcdC5tYXAoY2hpbGQgPT4gX3Jlc29sdmVTZXR0aW5nc1RyZWUoY2hpbGQsIGFsbFNldHRpbmdzLCBmaWx0ZXIsIGxvZ1NlcnZpY2UpKVxuXHRcdFx0LmZpbHRlcihjaGlsZCA9PiBjaGlsZC5jaGlsZHJlbj8ubGVuZ3RoIHx8IGNoaWxkLnNldHRpbmdzPy5sZW5ndGgpO1xuXHR9XG5cblx0bGV0IHNldHRpbmdzOiBJU2V0dGluZ1tdIHwgdW5kZWZpbmVkO1xuXHRpZiAoZmlsdGVyIHx8IHRvY0RhdGEuc2V0dGluZ3MpIHtcblx0XHRzZXR0aW5ncyA9IGdldE1hdGNoaW5nU2V0dGluZ3MoYWxsU2V0dGluZ3MsIHtcblx0XHRcdGluY2x1ZGU6IHtcblx0XHRcdFx0a2V5UGF0dGVybnM6IFsuLi5maWx0ZXI/LmluY2x1ZGU/LmtleVBhdHRlcm5zID8/IFtdLCAuLi50b2NEYXRhLnNldHRpbmdzID8/IFtdXSxcblx0XHRcdFx0dGFnczogZmlsdGVyPy5pbmNsdWRlPy50YWdzID8gWy4uLmZpbHRlci5pbmNsdWRlLnRhZ3NdIDogW11cblx0XHRcdH0sXG5cdFx0XHRleGNsdWRlOiBmaWx0ZXI/LmV4Y2x1ZGUgPz8ge31cblx0XHR9KTtcblx0XHRzb3J0U2V0dGluZ3Moc2V0dGluZ3MpO1xuXHR9XG5cblx0aWYgKCFjaGlsZHJlbiAmJiAhc2V0dGluZ3MpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFRPQyBub2RlIGhhcyBubyBjaGlsZCBncm91cHMgb3Igc2V0dGluZ3M6ICR7dG9jRGF0YS5pZH1gKTtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0aWQ6IHRvY0RhdGEuaWQsXG5cdFx0bGFiZWw6IHRvY0RhdGEubGFiZWwsXG5cdFx0Y2hpbGRyZW4sXG5cdFx0c2V0dGluZ3Ncblx0fTtcbn1cblxuLyoqXG4gKiBTb3J0IHNldHRpbmdzIHNvIHRoYXQgcHJldmlldyBhbmQgZXhwZXJpbWVudGFsIHNldHRpbmdzIGFyZSBkZXByaW9yaXRpemVkLlxuICogV2l0aGluIGVhY2ggdGllciwgc29ydCB0aGUgc2V0dGluZ3MgYnkgb3JkZXIsIHRoZW4gYWxwaGFiZXRpY2FsbHkuXG4gKi9cbmZ1bmN0aW9uIHNvcnRTZXR0aW5ncyhzZXR0aW5nczogSVNldHRpbmdbXSk6IHZvaWQge1xuXHRjb25zdCBTRVRUSU5HX1NUQVRVU19OT1JNQUwgPSAwO1xuXHRjb25zdCBTRVRUSU5HX1NUQVRVU19QUkVWSUVXID0gMTtcblx0Y29uc3QgU0VUVElOR19TVEFUVVNfRVhQRVJJTUVOVEFMID0gMjtcblxuXHRjb25zdCBnZXRFeHBlcmltZW50YWxTdGF0dXMgPSAoc2V0dGluZzogSVNldHRpbmcpID0+IHtcblx0XHRpZiAoc2V0dGluZy50YWdzPy5pbmNsdWRlcygnZXhwZXJpbWVudGFsJykpIHtcblx0XHRcdHJldHVybiBTRVRUSU5HX1NUQVRVU19FWFBFUklNRU5UQUw7XG5cdFx0fSBlbHNlIGlmIChzZXR0aW5nLnRhZ3M/LmluY2x1ZGVzKCdwcmV2aWV3JykpIHtcblx0XHRcdHJldHVybiBTRVRUSU5HX1NUQVRVU19QUkVWSUVXO1xuXHRcdH1cblx0XHRyZXR1cm4gU0VUVElOR19TVEFUVVNfTk9STUFMO1xuXHR9O1xuXG5cdHNldHRpbmdzLnNvcnQoKGEsIGIpID0+IHtcblx0XHRjb25zdCBleHBlcmltZW50YWxTdGF0dXNBID0gZ2V0RXhwZXJpbWVudGFsU3RhdHVzKGEpO1xuXHRcdGNvbnN0IGV4cGVyaW1lbnRhbFN0YXR1c0IgPSBnZXRFeHBlcmltZW50YWxTdGF0dXMoYik7XG5cdFx0aWYgKGV4cGVyaW1lbnRhbFN0YXR1c0EgIT09IGV4cGVyaW1lbnRhbFN0YXR1c0IpIHtcblx0XHRcdHJldHVybiBleHBlcmltZW50YWxTdGF0dXNBIC0gZXhwZXJpbWVudGFsU3RhdHVzQjtcblx0XHR9XG5cblx0XHRjb25zdCBvcmRlckNvbXBhcmlzb24gPSBjb21wYXJlVHdvTnVsbGFibGVOdW1iZXJzKGEub3JkZXIsIGIub3JkZXIpO1xuXHRcdHJldHVybiBvcmRlckNvbXBhcmlzb24gIT09IDAgPyBvcmRlckNvbXBhcmlzb24gOiBhLmtleS5sb2NhbGVDb21wYXJlKGIua2V5KTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGdldE1hdGNoaW5nU2V0dGluZ3MoYWxsU2V0dGluZ3M6IFNldDxJU2V0dGluZz4sIGZpbHRlcjogSVRPQ0ZpbHRlcik6IElTZXR0aW5nW10ge1xuXHRjb25zdCByZXN1bHQ6IElTZXR0aW5nW10gPSBbXTtcblxuXHRhbGxTZXR0aW5ncy5mb3JFYWNoKHNldHRpbmcgPT4ge1xuXHRcdGxldCBzaG91bGRJbmNsdWRlID0gZmFsc2U7XG5cdFx0bGV0IHNob3VsZEV4Y2x1ZGUgPSBmYWxzZTtcblxuXHRcdC8vIENoZWNrIGluY2x1ZGUgZmlsdGVyc1xuXHRcdGlmIChmaWx0ZXIuaW5jbHVkZT8ua2V5UGF0dGVybnMpIHtcblx0XHRcdHNob3VsZEluY2x1ZGUgPSBmaWx0ZXIuaW5jbHVkZS5rZXlQYXR0ZXJucy5zb21lKHBhdHRlcm4gPT4ge1xuXHRcdFx0XHRpZiAocGF0dGVybi5zdGFydHNXaXRoKCdAdGFnOicpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGFnTmFtZSA9IHBhdHRlcm4uc3Vic3RyaW5nKDUpO1xuXHRcdFx0XHRcdHJldHVybiBzZXR0aW5nLnRhZ3M/LmluY2x1ZGVzKHRhZ05hbWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBzZXR0aW5nTWF0Y2hlcyhzZXR0aW5nLCBwYXR0ZXJuKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNob3VsZEluY2x1ZGUgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChzaG91bGRJbmNsdWRlICYmIGZpbHRlci5pbmNsdWRlPy50YWdzPy5sZW5ndGgpIHtcblx0XHRcdHNob3VsZEluY2x1ZGUgPSBmaWx0ZXIuaW5jbHVkZS50YWdzLnNvbWUodGFnID0+IHNldHRpbmcudGFncz8uaW5jbHVkZXModGFnKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZXhjbHVkZSBmaWx0ZXJzICh0YWtlcyBwcmVjZWRlbmNlKVxuXHRcdGlmIChmaWx0ZXIuZXhjbHVkZT8ua2V5UGF0dGVybnMpIHtcblx0XHRcdHNob3VsZEV4Y2x1ZGUgPSBmaWx0ZXIuZXhjbHVkZS5rZXlQYXR0ZXJucy5zb21lKHBhdHRlcm4gPT4ge1xuXHRcdFx0XHRpZiAocGF0dGVybi5zdGFydHNXaXRoKCdAdGFnOicpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGFnTmFtZSA9IHBhdHRlcm4uc3Vic3RyaW5nKDUpO1xuXHRcdFx0XHRcdHJldHVybiBzZXR0aW5nLnRhZ3M/LmluY2x1ZGVzKHRhZ05hbWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBzZXR0aW5nTWF0Y2hlcyhzZXR0aW5nLCBwYXR0ZXJuKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFzaG91bGRFeGNsdWRlICYmIGZpbHRlci5leGNsdWRlPy50YWdzPy5sZW5ndGgpIHtcblx0XHRcdHNob3VsZEV4Y2x1ZGUgPSBmaWx0ZXIuZXhjbHVkZS50YWdzLnNvbWUodGFnID0+IHNldHRpbmcudGFncz8uaW5jbHVkZXModGFnKSk7XG5cdFx0fVxuXG5cdFx0Ly8gSW5jbHVkZSBpZiBtYXRjaGVzIGluY2x1ZGUgZmlsdGVyIGFuZCBkb2Vzbid0IG1hdGNoIGV4Y2x1ZGUgZmlsdGVyXG5cdFx0aWYgKHNob3VsZEluY2x1ZGUgJiYgIXNob3VsZEV4Y2x1ZGUpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHNldHRpbmcpO1xuXHRcdFx0aWYgKCFtdWx0aUdyb3VwVG9jU2V0dGluZ3MuaGFzKHNldHRpbmcua2V5KSkge1xuXHRcdFx0XHRhbGxTZXR0aW5ncy5kZWxldGUoc2V0dGluZyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5jb25zdCBzZXR0aW5nUGF0dGVybkNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFJlZ0V4cD4oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNldHRpbmdNYXRjaFJlZ0V4cChwYXR0ZXJuOiBzdHJpbmcpOiBSZWdFeHAge1xuXHRwYXR0ZXJuID0gZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhwYXR0ZXJuKVxuXHRcdC5yZXBsYWNlKC9cXFxcXFwqL2csICcuKicpO1xuXG5cdHJldHVybiBuZXcgUmVnRXhwKGBeJHtwYXR0ZXJufSRgLCAnaScpO1xufVxuXG5mdW5jdGlvbiBzZXR0aW5nTWF0Y2hlcyhzOiBJU2V0dGluZywgcGF0dGVybjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGxldCByZWdFeHAgPSBzZXR0aW5nUGF0dGVybkNhY2hlLmdldChwYXR0ZXJuKTtcblx0aWYgKCFyZWdFeHApIHtcblx0XHRyZWdFeHAgPSBjcmVhdGVTZXR0aW5nTWF0Y2hSZWdFeHAocGF0dGVybik7XG5cdFx0c2V0dGluZ1BhdHRlcm5DYWNoZS5zZXQocGF0dGVybiwgcmVnRXhwKTtcblx0fVxuXG5cdHJldHVybiByZWdFeHAudGVzdChzLmtleSk7XG59XG5cbmZ1bmN0aW9uIGdldEZsYXRTZXR0aW5ncyhzZXR0aW5nc0dyb3VwczogSVNldHRpbmdzR3JvdXBbXSkge1xuXHRjb25zdCByZXN1bHQ6IFNldDxJU2V0dGluZz4gPSBuZXcgU2V0KCk7XG5cblx0Zm9yIChjb25zdCBncm91cCBvZiBzZXR0aW5nc0dyb3Vwcykge1xuXHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiBncm91cC5zZWN0aW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBzIG9mIHNlY3Rpb24uc2V0dGluZ3MpIHtcblx0XHRcdFx0aWYgKCFzLm92ZXJyaWRlcyB8fCAhcy5vdmVycmlkZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmVzdWx0LmFkZChzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmludGVyZmFjZSBJRGlzcG9zYWJsZVRlbXBsYXRlIHtcblx0cmVhZG9ubHkgdG9EaXNwb3NlOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmludGVyZmFjZSBJU2V0dGluZ0l0ZW1UZW1wbGF0ZTxUID0gYW55PiBleHRlbmRzIElEaXNwb3NhYmxlVGVtcGxhdGUge1xuXHRvbkNoYW5nZT86ICh2YWx1ZTogVCkgPT4gdm9pZDtcblxuXHRjb250ZXh0PzogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQ7XG5cdGNvbnRhaW5lckVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRjYXRlZ29yeUVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRsYWJlbEVsZW1lbnQ6IFNpbXBsZUljb25MYWJlbDtcblx0ZGVzY3JpcHRpb25FbGVtZW50OiBIVE1MRWxlbWVudDtcblx0Y29udHJvbEVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRkZXByZWNhdGlvbldhcm5pbmdFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0aW5kaWNhdG9yc0xhYmVsOiBTZXR0aW5nc1RyZWVJbmRpY2F0b3JzTGFiZWw7XG5cdHRvb2xiYXI6IFRvb2xCYXI7XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5pbnRlcmZhY2UgSVNldHRpbmdCb29sSXRlbVRlbXBsYXRlIGV4dGVuZHMgSVNldHRpbmdJdGVtVGVtcGxhdGU8Ym9vbGVhbj4ge1xuXHRjaGVja2JveDogVG9nZ2xlO1xufVxuXG5pbnRlcmZhY2UgSVNldHRpbmdFeHRlbnNpb25Ub2dnbGVJdGVtVGVtcGxhdGUgZXh0ZW5kcyBJU2V0dGluZ0l0ZW1UZW1wbGF0ZTx1bmRlZmluZWQ+IHtcblx0YWN0aW9uQnV0dG9uOiBCdXR0b247XG5cdGRpc21pc3NCdXR0b246IEJ1dHRvbjtcbn1cblxuaW50ZXJmYWNlIElTZXR0aW5nVGV4dEl0ZW1UZW1wbGF0ZSBleHRlbmRzIElTZXR0aW5nSXRlbVRlbXBsYXRlPHN0cmluZz4ge1xuXHRpbnB1dEJveDogSW5wdXRCb3g7XG5cdHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50OiBIVE1MRWxlbWVudDtcbn1cblxudHlwZSBJU2V0dGluZ051bWJlckl0ZW1UZW1wbGF0ZSA9IElTZXR0aW5nVGV4dEl0ZW1UZW1wbGF0ZTtcblxuaW50ZXJmYWNlIElTZXR0aW5nRW51bUl0ZW1UZW1wbGF0ZSBleHRlbmRzIElTZXR0aW5nSXRlbVRlbXBsYXRlPG51bWJlcj4ge1xuXHRzZWxlY3RCb3g6IFNlbGVjdEJveDtcblx0c2VsZWN0RWxlbWVudDogSFRNTFNlbGVjdEVsZW1lbnQgfCBudWxsO1xuXHRlbnVtRGVzY3JpcHRpb25FbGVtZW50OiBIVE1MRWxlbWVudDtcbn1cblxuaW50ZXJmYWNlIElTZXR0aW5nQ29tcGxleEl0ZW1UZW1wbGF0ZSBleHRlbmRzIElTZXR0aW5nSXRlbVRlbXBsYXRlPHZvaWQ+IHtcblx0YnV0dG9uOiBIVE1MRWxlbWVudDtcblx0dmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnQ6IEhUTUxFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSVNldHRpbmdDb21wbGV4T2JqZWN0SXRlbVRlbXBsYXRlIGV4dGVuZHMgSVNldHRpbmdDb21wbGV4SXRlbVRlbXBsYXRlIHtcblx0b2JqZWN0U2V0dGluZ1dpZGdldDogT2JqZWN0U2V0dGluZ0Ryb3Bkb3duV2lkZ2V0O1xufVxuXG5pbnRlcmZhY2UgSVNldHRpbmdMaXN0SXRlbVRlbXBsYXRlIGV4dGVuZHMgSVNldHRpbmdJdGVtVGVtcGxhdGU8c3RyaW5nW10gfCB1bmRlZmluZWQ+IHtcblx0bGlzdFdpZGdldDogTGlzdFNldHRpbmdXaWRnZXQ8SUxpc3REYXRhSXRlbT47XG5cdHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50OiBIVE1MRWxlbWVudDtcbn1cblxuaW50ZXJmYWNlIElTZXR0aW5nSW5jbHVkZUV4Y2x1ZGVJdGVtVGVtcGxhdGUgZXh0ZW5kcyBJU2V0dGluZ0l0ZW1UZW1wbGF0ZTx2b2lkPiB7XG5cdGluY2x1ZGVFeGNsdWRlV2lkZ2V0OiBMaXN0U2V0dGluZ1dpZGdldDxJSW5jbHVkZUV4Y2x1ZGVEYXRhSXRlbT47XG59XG5cbmludGVyZmFjZSBJU2V0dGluZ09iamVjdEl0ZW1UZW1wbGF0ZSBleHRlbmRzIElTZXR0aW5nSXRlbVRlbXBsYXRlPFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkPiB7XG5cdG9iamVjdERyb3Bkb3duV2lkZ2V0PzogT2JqZWN0U2V0dGluZ0Ryb3Bkb3duV2lkZ2V0O1xuXHRvYmplY3RDaGVja2JveFdpZGdldD86IE9iamVjdFNldHRpbmdDaGVja2JveFdpZGdldDtcblx0dmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnQ6IEhUTUxFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSVNldHRpbmdOZXdFeHRlbnNpb25zVGVtcGxhdGUgZXh0ZW5kcyBJRGlzcG9zYWJsZVRlbXBsYXRlIHtcblx0YnV0dG9uOiBCdXR0b247XG5cdGNvbnRleHQ/OiBTZXR0aW5nc1RyZWVOZXdFeHRlbnNpb25zRWxlbWVudDtcbn1cblxuaW50ZXJmYWNlIElHcm91cFRpdGxlVGVtcGxhdGUgZXh0ZW5kcyBJRGlzcG9zYWJsZVRlbXBsYXRlIHtcblx0Y29udGV4dD86IFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudDtcblx0cGFyZW50OiBIVE1MRWxlbWVudDtcbn1cblxuY29uc3QgU0VUVElOR1NfVEVYVF9URU1QTEFURV9JRCA9ICdzZXR0aW5ncy50ZXh0LnRlbXBsYXRlJztcbmNvbnN0IFNFVFRJTkdTX01VTFRJTElORV9URVhUX1RFTVBMQVRFX0lEID0gJ3NldHRpbmdzLm11bHRpbGluZVRleHQudGVtcGxhdGUnO1xuY29uc3QgU0VUVElOR1NfTlVNQkVSX1RFTVBMQVRFX0lEID0gJ3NldHRpbmdzLm51bWJlci50ZW1wbGF0ZSc7XG5jb25zdCBTRVRUSU5HU19FTlVNX1RFTVBMQVRFX0lEID0gJ3NldHRpbmdzLmVudW0udGVtcGxhdGUnO1xuY29uc3QgU0VUVElOR1NfQk9PTF9URU1QTEFURV9JRCA9ICdzZXR0aW5ncy5ib29sLnRlbXBsYXRlJztcbmNvbnN0IFNFVFRJTkdTX0FSUkFZX1RFTVBMQVRFX0lEID0gJ3NldHRpbmdzLmFycmF5LnRlbXBsYXRlJztcbmNvbnN0IFNFVFRJTkdTX0VYQ0xVREVfVEVNUExBVEVfSUQgPSAnc2V0dGluZ3MuZXhjbHVkZS50ZW1wbGF0ZSc7XG5jb25zdCBTRVRUSU5HU19JTkNMVURFX1RFTVBMQVRFX0lEID0gJ3NldHRpbmdzLmluY2x1ZGUudGVtcGxhdGUnO1xuY29uc3QgU0VUVElOR1NfT0JKRUNUX1RFTVBMQVRFX0lEID0gJ3NldHRpbmdzLm9iamVjdC50ZW1wbGF0ZSc7XG5jb25zdCBTRVRUSU5HU19CT09MX09CSkVDVF9URU1QTEFURV9JRCA9ICdzZXR0aW5ncy5ib29sT2JqZWN0LnRlbXBsYXRlJztcbmNvbnN0IFNFVFRJTkdTX0NPTVBMRVhfVEVNUExBVEVfSUQgPSAnc2V0dGluZ3MuY29tcGxleC50ZW1wbGF0ZSc7XG5jb25zdCBTRVRUSU5HU19DT01QTEVYX09CSkVDVF9URU1QTEFURV9JRCA9ICdzZXR0aW5ncy5jb21wbGV4T2JqZWN0LnRlbXBsYXRlJztcbmNvbnN0IFNFVFRJTkdTX05FV19FWFRFTlNJT05TX1RFTVBMQVRFX0lEID0gJ3NldHRpbmdzLm5ld0V4dGVuc2lvbnMudGVtcGxhdGUnO1xuY29uc3QgU0VUVElOR1NfRUxFTUVOVF9URU1QTEFURV9JRCA9ICdzZXR0aW5ncy5ncm91cC50ZW1wbGF0ZSc7XG5jb25zdCBTRVRUSU5HU19FWFRFTlNJT05fVE9HR0xFX1RFTVBMQVRFX0lEID0gJ3NldHRpbmdzLmV4dGVuc2lvblRvZ2dsZS50ZW1wbGF0ZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNldHRpbmdDaGFuZ2VFdmVudCB7XG5cdGtleTogc3RyaW5nO1xuXHR2YWx1ZTogdW5rbm93bjsgLy8gdW5kZWZpbmVkID0+IHJlc2V0L3VuY29uZmlndXJlXG5cdHR5cGU6IFNldHRpbmdWYWx1ZVR5cGUgfCBTZXR0aW5nVmFsdWVUeXBlW107XG5cdG1hbnVhbFJlc2V0OiBib29sZWFuO1xuXHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXR0aW5nTGlua0NsaWNrRXZlbnQge1xuXHRzb3VyY2U6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50O1xuXHR0YXJnZXRLZXk6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gcmVtb3ZlQ2hpbGRyZW5Gcm9tVGFiT3JkZXIobm9kZTogRWxlbWVudCk6IHZvaWQge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0Y29uc3QgZm9jdXNhYmxlRWxlbWVudHMgPSBub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoYFxuXHRcdFt0YWJpbmRleD1cIjBcIl0sXG5cdFx0aW5wdXQ6bm90KFt0YWJpbmRleD1cIi0xXCJdKSxcblx0XHRzZWxlY3Q6bm90KFt0YWJpbmRleD1cIi0xXCJdKSxcblx0XHR0ZXh0YXJlYTpub3QoW3RhYmluZGV4PVwiLTFcIl0pLFxuXHRcdGE6bm90KFt0YWJpbmRleD1cIi0xXCJdKSxcblx0XHRidXR0b246bm90KFt0YWJpbmRleD1cIi0xXCJdKSxcblx0XHRhcmVhOm5vdChbdGFiaW5kZXg9XCItMVwiXSlcblx0YCk7XG5cblx0Zm9jdXNhYmxlRWxlbWVudHMuZm9yRWFjaChlbGVtZW50ID0+IHtcblx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZShBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5FTEVNRU5UX0ZPQ1VTQUJMRV9BVFRSLCAndHJ1ZScpO1xuXHRcdGVsZW1lbnQuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICctMScpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gYWRkQ2hpbGRyZW5Ub1RhYk9yZGVyKG5vZGU6IEVsZW1lbnQpOiB2b2lkIHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdGNvbnN0IGZvY3VzYWJsZUVsZW1lbnRzID0gbm9kZS5xdWVyeVNlbGVjdG9yQWxsKFxuXHRcdGBbJHtBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5FTEVNRU5UX0ZPQ1VTQUJMRV9BVFRSfT1cInRydWVcIl1gXG5cdCk7XG5cblx0Zm9jdXNhYmxlRWxlbWVudHMuZm9yRWFjaChlbGVtZW50ID0+IHtcblx0XHRlbGVtZW50LnJlbW92ZUF0dHJpYnV0ZShBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5FTEVNRU5UX0ZPQ1VTQUJMRV9BVFRSKTtcblx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXHR9KTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIZWlnaHRDaGFuZ2VQYXJhbXMge1xuXHRlbGVtZW50OiBTZXR0aW5nc1RyZWVFbGVtZW50O1xuXHRoZWlnaHQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8U2V0dGluZ3NUcmVlRWxlbWVudCwgbmV2ZXIsIGFueT4ge1xuXHQvKiogVG8gb3ZlcnJpZGUgKi9cblx0YWJzdHJhY3QgZ2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nO1xuXG5cdHN0YXRpYyByZWFkb25seSBDT05UUk9MX0NMQVNTID0gJ3NldHRpbmctY29udHJvbC1mb2N1cy10YXJnZXQnO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ09OVFJPTF9TRUxFQ1RPUiA9ICcuJyArIHRoaXMuQ09OVFJPTF9DTEFTUztcblx0c3RhdGljIHJlYWRvbmx5IENPTlRFTlRTX0NMQVNTID0gJ3NldHRpbmctaXRlbS1jb250ZW50cyc7XG5cdHN0YXRpYyByZWFkb25seSBDT05URU5UU19TRUxFQ1RPUiA9ICcuJyArIHRoaXMuQ09OVEVOVFNfQ0xBU1M7XG5cdHN0YXRpYyByZWFkb25seSBBTExfUk9XU19TRUxFQ1RPUiA9ICcubW9uYWNvLWxpc3Qtcm93JztcblxuXHRzdGF0aWMgcmVhZG9ubHkgU0VUVElOR19LRVlfQVRUUiA9ICdkYXRhLWtleSc7XG5cdHN0YXRpYyByZWFkb25seSBTRVRUSU5HX0lEX0FUVFIgPSAnZGF0YS1pZCc7XG5cdHN0YXRpYyByZWFkb25seSBFTEVNRU5UX0ZPQ1VTQUJMRV9BVFRSID0gJ2RhdGEtZm9jdXNhYmxlJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsaWNrT3ZlcnJpZGVFbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNldHRpbmdPdmVycmlkZUNsaWNrRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsaWNrT3ZlcnJpZGVFbGVtZW50OiBFdmVudDxJU2V0dGluZ092ZXJyaWRlQ2xpY2tFdmVudD4gPSB0aGlzLl9vbkRpZENsaWNrT3ZlcnJpZGVFbGVtZW50LmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VTZXR0aW5nID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNldHRpbmdDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2V0dGluZzogRXZlbnQ8SVNldHRpbmdDaGFuZ2VFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZVNldHRpbmcuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZE9wZW5TZXR0aW5ncyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkT3BlblNldHRpbmdzOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRPcGVuU2V0dGluZ3MuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbGlja1NldHRpbmdMaW5rID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNldHRpbmdMaW5rQ2xpY2tFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2tTZXR0aW5nTGluazogRXZlbnQ8SVNldHRpbmdMaW5rQ2xpY2tFdmVudD4gPSB0aGlzLl9vbkRpZENsaWNrU2V0dGluZ0xpbmsuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZEZvY3VzU2V0dGluZyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRGb2N1c1NldHRpbmc6IEV2ZW50PFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50PiA9IHRoaXMuX29uRGlkRm9jdXNTZXR0aW5nLmV2ZW50O1xuXG5cdHByaXZhdGUgaWdub3JlZFNldHRpbmdzOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJZ25vcmVkU2V0dGluZ3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJZ25vcmVkU2V0dGluZ3M6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VJZ25vcmVkU2V0dGluZ3MuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNldHRpbmdIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxIZWlnaHRDaGFuZ2VQYXJhbXM+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNldHRpbmdIZWlnaHQ6IEV2ZW50PEhlaWdodENoYW5nZVBhcmFtcz4gPSB0aGlzLl9vbkRpZENoYW5nZVNldHRpbmdIZWlnaHQuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkFwcGx5RmlsdGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25BcHBseUZpbHRlcjogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uQXBwbHlGaWx0ZXIuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZXR0aW5nQWN0aW9uczogSUFjdGlvbltdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZUFjdGlvbkZhY3Rvcnk6IChzZXR0aW5nOiBJU2V0dGluZywgc2V0dGluZ1RhcmdldDogU2V0dGluZ3NUYXJnZXQpID0+IElBY3Rpb25bXSxcblx0XHRASVRoZW1lU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY29uZmlnU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2V4dGVuc2lvbnNTZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmlnbm9yZWRTZXR0aW5ncyA9IGdldElnbm9yZWRTZXR0aW5ncyhnZXREZWZhdWx0SWdub3JlZFNldHRpbmdzKCksIHRoaXMuX2NvbmZpZ1NlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ1NlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0dGhpcy5pZ25vcmVkU2V0dGluZ3MgPSBnZXRJZ25vcmVkU2V0dGluZ3MoZ2V0RGVmYXVsdElnbm9yZWRTZXR0aW5ncygpLCB0aGlzLl9jb25maWdTZXJ2aWNlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSWdub3JlZFNldHRpbmdzLmZpcmUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRhYnN0cmFjdCByZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogYW55O1xuXG5cdGFic3RyYWN0IHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBuZXZlcj4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogdW5rbm93bik6IHZvaWQ7XG5cblx0cHJvdGVjdGVkIHJlbmRlckNvbW1vblRlbXBsYXRlKHRyZWU6IHVua25vd24sIF9jb250YWluZXI6IEhUTUxFbGVtZW50LCB0eXBlQ2xhc3M6IHN0cmluZyk6IElTZXR0aW5nSXRlbVRlbXBsYXRlIHtcblx0XHRfY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3NldHRpbmctaXRlbScpO1xuXHRcdF9jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc2V0dGluZy1pdGVtLScgKyB0eXBlQ2xhc3MpO1xuXG5cdFx0Y29uc3QgdG9EaXNwb3NlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gRE9NLmFwcGVuZChfY29udGFpbmVyLCAkKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLkNPTlRFTlRTX1NFTEVDVE9SKSk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3NldHRpbmdzLXJvdy1pbm5lci1jb250YWluZXInKTtcblx0XHRjb25zdCB0aXRsZUVsZW1lbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNldHRpbmctaXRlbS10aXRsZScpKTtcblx0XHRjb25zdCBsYWJlbENhdGVnb3J5Q29udGFpbmVyID0gRE9NLmFwcGVuZCh0aXRsZUVsZW1lbnQsICQoJy5zZXR0aW5nLWl0ZW0tY2F0LWxhYmVsLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBjYXRlZ29yeUVsZW1lbnQgPSBET00uYXBwZW5kKGxhYmVsQ2F0ZWdvcnlDb250YWluZXIsICQoJ3NwYW4uc2V0dGluZy1pdGVtLWNhdGVnb3J5JykpO1xuXHRcdGNvbnN0IGxhYmVsRWxlbWVudENvbnRhaW5lciA9IERPTS5hcHBlbmQobGFiZWxDYXRlZ29yeUNvbnRhaW5lciwgJCgnc3Bhbi5zZXR0aW5nLWl0ZW0tbGFiZWwnKSk7XG5cdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gdG9EaXNwb3NlLmFkZChuZXcgU2ltcGxlSWNvbkxhYmVsKGxhYmVsRWxlbWVudENvbnRhaW5lcikpO1xuXHRcdGNvbnN0IGluZGljYXRvcnNMYWJlbCA9IHRvRGlzcG9zZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ3NUcmVlSW5kaWNhdG9yc0xhYmVsLCB0aXRsZUVsZW1lbnQpKTtcblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uRWxlbWVudCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJykpO1xuXHRcdGNvbnN0IG1vZGlmaWVkSW5kaWNhdG9yRWxlbWVudCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2V0dGluZy1pdGVtLW1vZGlmaWVkLWluZGljYXRvcicpKTtcblx0XHR0b0Rpc3Bvc2UuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcihtb2RpZmllZEluZGljYXRvckVsZW1lbnQsIHtcblx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplKCdtb2RpZmllZCcsIFwiVGhlIHNldHRpbmcgaGFzIGJlZW4gY29uZmlndXJlZCBpbiB0aGUgY3VycmVudCBzY29wZS5cIilcblx0XHR9KSk7XG5cblx0XHRjb25zdCB2YWx1ZUVsZW1lbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNldHRpbmctaXRlbS12YWx1ZScpKTtcblx0XHRjb25zdCBjb250cm9sRWxlbWVudCA9IERPTS5hcHBlbmQodmFsdWVFbGVtZW50LCAkKCdkaXYuc2V0dGluZy1pdGVtLWNvbnRyb2wnKSk7XG5cblx0XHRjb25zdCBkZXByZWNhdGlvbldhcm5pbmdFbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZXR0aW5nLWl0ZW0tZGVwcmVjYXRpb24tbWVzc2FnZScpKTtcblxuXHRcdGNvbnN0IHRvb2xiYXJDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNldHRpbmctdG9vbGJhci1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgdG9vbGJhciA9IHRvRGlzcG9zZS5hZGQodGhpcy5yZW5kZXJTZXR0aW5nVG9vbGJhcih0b29sYmFyQ29udGFpbmVyKSk7XG5cblx0XHRjb25zdCB0ZW1wbGF0ZTogSVNldHRpbmdJdGVtVGVtcGxhdGUgPSB7XG5cdFx0XHR0b0Rpc3Bvc2UsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXM6IHRvRGlzcG9zZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKSxcblxuXHRcdFx0Y29udGFpbmVyRWxlbWVudDogY29udGFpbmVyLFxuXHRcdFx0Y2F0ZWdvcnlFbGVtZW50LFxuXHRcdFx0bGFiZWxFbGVtZW50LFxuXHRcdFx0ZGVzY3JpcHRpb25FbGVtZW50LFxuXHRcdFx0Y29udHJvbEVsZW1lbnQsXG5cdFx0XHRkZXByZWNhdGlvbldhcm5pbmdFbGVtZW50LFxuXHRcdFx0aW5kaWNhdG9yc0xhYmVsLFxuXHRcdFx0dG9vbGJhclxuXHRcdH07XG5cblx0XHQvLyBQcmV2ZW50IGNsaWNrcyBmcm9tIGJlaW5nIGhhbmRsZWQgYnkgbGlzdFxuXHRcdHRvRGlzcG9zZS5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250cm9sRWxlbWVudCwgRE9NLkV2ZW50VHlwZS5NT1VTRV9ET1dOLCBlID0+IGUuc3RvcFByb3BhZ2F0aW9uKCkpKTtcblxuXHRcdHRvRGlzcG9zZS5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aXRsZUVsZW1lbnQsIERPTS5FdmVudFR5cGUuTU9VU0VfRU5URVIsIGUgPT4gY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21vdXNlb3ZlcicpKSk7XG5cdFx0dG9EaXNwb3NlLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRpdGxlRWxlbWVudCwgRE9NLkV2ZW50VHlwZS5NT1VTRV9MRUFWRSwgZSA9PiBjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnbW91c2VvdmVyJykpKTtcblxuXHRcdHJldHVybiB0ZW1wbGF0ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBhZGRTZXR0aW5nRWxlbWVudEZvY3VzSGFuZGxlcih0ZW1wbGF0ZTogSVNldHRpbmdJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSBET00udHJhY2tGb2N1cyh0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50KTtcblx0XHR0ZW1wbGF0ZS50b0Rpc3Bvc2UuYWRkKGZvY3VzVHJhY2tlcik7XG5cdFx0dGVtcGxhdGUudG9EaXNwb3NlLmFkZChmb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHtcblx0XHRcdGlmICh0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZm9jdXNlZCcpKSB7XG5cdFx0XHRcdHRlbXBsYXRlLmNvbnRhaW5lckVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZm9jdXNlZCcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRlbXBsYXRlLnRvRGlzcG9zZS5hZGQoZm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4ge1xuXHRcdFx0dGVtcGxhdGUuY29udGFpbmVyRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdmb2N1c2VkJyk7XG5cblx0XHRcdGlmICh0ZW1wbGF0ZS5jb250ZXh0KSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkRm9jdXNTZXR0aW5nLmZpcmUodGVtcGxhdGUuY29udGV4dCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlclNldHRpbmdUb29sYmFyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBUb29sQmFyIHtcblx0XHRjb25zdCB0b2dnbGVNZW51VGl0bGUgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKFxuXHRcdFx0bG9jYWxpemUoJ3NldHRpbmdzQ29udGV4dE1lbnVUaXRsZScsIFwiTW9yZSBBY3Rpb25zLi4uIFwiKSxcblx0XHRcdFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX1NIT1dfQ09OVEVYVF9NRU5VKTtcblxuXHRcdGNvbnN0IHRvb2xiYXIgPSBuZXcgVG9vbEJhcihjb250YWluZXIsIHRoaXMuX2NvbnRleHRNZW51U2VydmljZSwge1xuXHRcdFx0dG9nZ2xlTWVudVRpdGxlLFxuXHRcdFx0cmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudDogIWlzSU9TLFxuXHRcdFx0bW9yZUljb246IHNldHRpbmdzTW9yZUFjdGlvbkljb25cblx0XHR9KTtcblx0XHRyZXR1cm4gdG9vbGJhcjtcblx0fVxuXG5cdHByb3RlY3RlZCByZW5kZXJTZXR0aW5nRWxlbWVudChub2RlOiBJVHJlZU5vZGU8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElTZXR0aW5nSXRlbVRlbXBsYXRlIHwgSVNldHRpbmdCb29sSXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IG5vZGUuZWxlbWVudDtcblxuXHRcdC8vIFRoZSBlbGVtZW50IG11c3QgaW5zcGVjdCBpdHNlbGYgdG8gZ2V0IGluZm9ybWF0aW9uIGZvclxuXHRcdC8vIHRoZSBtb2RpZmllZCBpbmRpY2F0b3IgYW5kIHRoZSBvdmVycmlkZGVuIFNldHRpbmdzIGluZGljYXRvcnMuXG5cdFx0ZWxlbWVudC5pbnNwZWN0U2VsZigpO1xuXG5cdFx0dGVtcGxhdGUuY29udGV4dCA9IGVsZW1lbnQ7XG5cdFx0dGVtcGxhdGUudG9vbGJhci5jb250ZXh0ID0gZWxlbWVudDtcblx0XHRjb25zdCBhY3Rpb25zID0gdGhpcy5kaXNwb3NhYmxlQWN0aW9uRmFjdG9yeShlbGVtZW50LnNldHRpbmcsIGVsZW1lbnQuc2V0dGluZ3NUYXJnZXQpO1xuXHRcdGFjdGlvbnMuZm9yRWFjaChhID0+IGlzRGlzcG9zYWJsZShhKSAmJiB0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGEpKTtcblx0XHR0ZW1wbGF0ZS50b29sYmFyLnNldEFjdGlvbnMoW10sIFsuLi50aGlzLnNldHRpbmdBY3Rpb25zLCAuLi5hY3Rpb25zXSk7XG5cblx0XHRjb25zdCBzZXR0aW5nID0gZWxlbWVudC5zZXR0aW5nO1xuXG5cdFx0dGVtcGxhdGUuY29udGFpbmVyRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdpcy1jb25maWd1cmVkJywgZWxlbWVudC5pc0NvbmZpZ3VyZWQpO1xuXHRcdHRlbXBsYXRlLmNvbnRhaW5lckVsZW1lbnQuc2V0QXR0cmlidXRlKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLlNFVFRJTkdfS0VZX0FUVFIsIGVsZW1lbnQuc2V0dGluZy5rZXkpO1xuXHRcdHRlbXBsYXRlLmNvbnRhaW5lckVsZW1lbnQuc2V0QXR0cmlidXRlKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLlNFVFRJTkdfSURfQVRUUiwgZWxlbWVudC5pZCk7XG5cblx0XHRjb25zdCB0aXRsZVRvb2x0aXAgPSBzZXR0aW5nLmtleSArIChlbGVtZW50LmlzQ29uZmlndXJlZCA/ICcgLSBNb2RpZmllZCcgOiAnJyk7XG5cdFx0dGVtcGxhdGUuY2F0ZWdvcnlFbGVtZW50LnRleHRDb250ZW50ID0gZWxlbWVudC5kaXNwbGF5Q2F0ZWdvcnkgPyAoZWxlbWVudC5kaXNwbGF5Q2F0ZWdvcnkgKyAnOiAnKSA6ICcnO1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRlbXBsYXRlLmNhdGVnb3J5RWxlbWVudCwgeyBjb250ZW50OiB0aXRsZVRvb2x0aXAgfSkpO1xuXG5cdFx0dGVtcGxhdGUubGFiZWxFbGVtZW50LnRleHQgPSBlbGVtZW50LmRpc3BsYXlMYWJlbDtcblx0XHR0ZW1wbGF0ZS5sYWJlbEVsZW1lbnQudGl0bGUgPSB0aXRsZVRvb2x0aXA7XG5cblx0XHR0ZW1wbGF0ZS5kZXNjcmlwdGlvbkVsZW1lbnQuaW5uZXJUZXh0ID0gJyc7XG5cdFx0aWYgKGVsZW1lbnQuc2V0dGluZy5kZXNjcmlwdGlvbklzTWFya2Rvd24pIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVkRGVzY3JpcHRpb24gPSB0aGlzLnJlbmRlclNldHRpbmdNYXJrZG93bihlbGVtZW50LCB0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50LCBlbGVtZW50LmRlc2NyaXB0aW9uLCB0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMpO1xuXHRcdFx0dGVtcGxhdGUuZGVzY3JpcHRpb25FbGVtZW50LmFwcGVuZENoaWxkKHJlbmRlcmVkRGVzY3JpcHRpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZS5kZXNjcmlwdGlvbkVsZW1lbnQuaW5uZXJUZXh0ID0gZWxlbWVudC5kZXNjcmlwdGlvbjtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZS5pbmRpY2F0b3JzTGFiZWwudXBkYXRlU2NvcGVPdmVycmlkZXMoZWxlbWVudCwgdGhpcy5fb25EaWRDbGlja092ZXJyaWRlRWxlbWVudCwgdGhpcy5fb25BcHBseUZpbHRlcik7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLl9jb25maWdTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEFQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HKSkge1xuXHRcdFx0XHR0ZW1wbGF0ZS5pbmRpY2F0b3JzTGFiZWwudXBkYXRlU2NvcGVPdmVycmlkZXMoZWxlbWVudCwgdGhpcy5fb25EaWRDbGlja092ZXJyaWRlRWxlbWVudCwgdGhpcy5fb25BcHBseUZpbHRlcik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgb25DaGFuZ2UgPSAodmFsdWU6IHVua25vd24pID0+IHRoaXMuX29uRGlkQ2hhbmdlU2V0dGluZy5maXJlKHtcblx0XHRcdGtleTogZWxlbWVudC5zZXR0aW5nLmtleSxcblx0XHRcdHZhbHVlLFxuXHRcdFx0dHlwZTogdGVtcGxhdGUuY29udGV4dCEudmFsdWVUeXBlLFxuXHRcdFx0bWFudWFsUmVzZXQ6IGZhbHNlLFxuXHRcdFx0c2NvcGU6IGVsZW1lbnQuc2V0dGluZy5zY29wZVxuXHRcdH0pO1xuXHRcdGNvbnN0IGRlcHJlY2F0aW9uVGV4dCA9IGVsZW1lbnQuc2V0dGluZy5kZXByZWNhdGlvbk1lc3NhZ2UgfHwgJyc7XG5cdFx0aWYgKGRlcHJlY2F0aW9uVGV4dCAmJiBlbGVtZW50LnNldHRpbmcuZGVwcmVjYXRpb25NZXNzYWdlSXNNYXJrZG93bikge1xuXHRcdFx0dGVtcGxhdGUuZGVwcmVjYXRpb25XYXJuaW5nRWxlbWVudC5pbm5lclRleHQgPSAnJztcblx0XHRcdHRlbXBsYXRlLmRlcHJlY2F0aW9uV2FybmluZ0VsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5yZW5kZXJTZXR0aW5nTWFya2Rvd24oZWxlbWVudCwgdGVtcGxhdGUuY29udGFpbmVyRWxlbWVudCwgZWxlbWVudC5zZXR0aW5nLmRlcHJlY2F0aW9uTWVzc2FnZSEsIHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZS5kZXByZWNhdGlvbldhcm5pbmdFbGVtZW50LmlubmVyVGV4dCA9IGRlcHJlY2F0aW9uVGV4dDtcblx0XHR9XG5cdFx0dGVtcGxhdGUuZGVwcmVjYXRpb25XYXJuaW5nRWxlbWVudC5wcmVwZW5kKCQoJy5jb2RpY29uLmNvZGljb24tZXJyb3InKSk7XG5cdFx0dGVtcGxhdGUuY29udGFpbmVyRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdpcy1kZXByZWNhdGVkJywgISFkZXByZWNhdGlvblRleHQpO1xuXG5cdFx0dGhpcy5yZW5kZXJWYWx1ZShlbGVtZW50LCA8SVNldHRpbmdJdGVtVGVtcGxhdGU+dGVtcGxhdGUsIG9uQ2hhbmdlKTtcblxuXHRcdHRlbXBsYXRlLmluZGljYXRvcnNMYWJlbC51cGRhdGVXb3Jrc3BhY2VUcnVzdChlbGVtZW50KTtcblx0XHR0ZW1wbGF0ZS5pbmRpY2F0b3JzTGFiZWwudXBkYXRlU3luY0lnbm9yZWQoZWxlbWVudCwgdGhpcy5pZ25vcmVkU2V0dGluZ3MpO1xuXHRcdHRlbXBsYXRlLmluZGljYXRvcnNMYWJlbC51cGRhdGVEZWZhdWx0T3ZlcnJpZGVJbmRpY2F0b3IoZWxlbWVudCk7XG5cdFx0dGVtcGxhdGUuaW5kaWNhdG9yc0xhYmVsLnVwZGF0ZVByZXZpZXdJbmRpY2F0b3IoZWxlbWVudCk7XG5cdFx0dGVtcGxhdGUuaW5kaWNhdG9yc0xhYmVsLnVwZGF0ZUFkdmFuY2VkSW5kaWNhdG9yKGVsZW1lbnQpO1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5vbkRpZENoYW5nZUlnbm9yZWRTZXR0aW5ncygoKSA9PiB7XG5cdFx0XHR0ZW1wbGF0ZS5pbmRpY2F0b3JzTGFiZWwudXBkYXRlU3luY0lnbm9yZWQoZWxlbWVudCwgdGhpcy5pZ25vcmVkU2V0dGluZ3MpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMudXBkYXRlU2V0dGluZ1RhYmJhYmxlKGVsZW1lbnQsIHRlbXBsYXRlKTtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGVsZW1lbnQub25EaWRDaGFuZ2VUYWJiYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZVNldHRpbmdUYWJiYWJsZShlbGVtZW50LCB0ZW1wbGF0ZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTZXR0aW5nVGFiYmFibGUoZWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIHRlbXBsYXRlOiBJU2V0dGluZ0l0ZW1UZW1wbGF0ZSB8IElTZXR0aW5nQm9vbEl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGlmIChlbGVtZW50LnRhYmJhYmxlKSB7XG5cdFx0XHRhZGRDaGlsZHJlblRvVGFiT3JkZXIodGVtcGxhdGUuY29udGFpbmVyRWxlbWVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlbW92ZUNoaWxkcmVuRnJvbVRhYk9yZGVyKHRlbXBsYXRlLmNvbnRhaW5lckVsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyU2V0dGluZ01hcmtkb3duKGVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBjb250YWluZXI6IEhUTUxFbGVtZW50LCB0ZXh0OiBzdHJpbmcsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBIVE1MRWxlbWVudCB7XG5cdFx0Ly8gUmV3cml0ZSBgI2VkaXRvci5mb250U2l6ZSNgIHRvIGxpbmsgZm9ybWF0XG5cdFx0dGV4dCA9IGZpeFNldHRpbmdMaW5rcyh0ZXh0KTtcblxuXHRcdGNvbnN0IHJlbmRlcmVkTWFya2Rvd24gPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5fbWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKHsgdmFsdWU6IHRleHQsIGlzVHJ1c3RlZDogdHJ1ZSB9LCB7XG5cdFx0XHRhY3Rpb25IYW5kbGVyOiAoY29udGVudDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGlmIChjb250ZW50LnN0YXJ0c1dpdGgoJyMnKSkge1xuXHRcdFx0XHRcdGNvbnN0IGU6IElTZXR0aW5nTGlua0NsaWNrRXZlbnQgPSB7XG5cdFx0XHRcdFx0XHRzb3VyY2U6IGVsZW1lbnQsXG5cdFx0XHRcdFx0XHR0YXJnZXRLZXk6IGNvbnRlbnQuc3Vic3RyaW5nKDEpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENsaWNrU2V0dGluZ0xpbmsuZmlyZShlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4oY29udGVudCwgeyBhbGxvd0NvbW1hbmRzOiB0cnVlIH0pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFzeW5jUmVuZGVyQ2FsbGJhY2s6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaGVpZ2h0ID0gY29udGFpbmVyLmNsaWVudEhlaWdodDtcblx0XHRcdFx0aWYgKGhlaWdodCkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2V0dGluZ0hlaWdodC5maXJlKHsgZWxlbWVudCwgaGVpZ2h0IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdHJlbmRlcmVkTWFya2Rvd24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzZXR0aW5nLWl0ZW0tbWFya2Rvd24nKTtcblx0XHRjbGVhblJlbmRlcmVkTWFya2Rvd24ocmVuZGVyZWRNYXJrZG93bi5lbGVtZW50KTtcblx0XHRyZXR1cm4gcmVuZGVyZWRNYXJrZG93bi5lbGVtZW50O1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IHJlbmRlclZhbHVlKGRhdGFFbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgdGVtcGxhdGU6IElTZXR0aW5nSXRlbVRlbXBsYXRlLCBvbkNoYW5nZTogKHZhbHVlOiB1bmtub3duKSA9PiB2b2lkKTogdm9pZDtcblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGU6IElEaXNwb3NhYmxlVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS50b0Rpc3Bvc2UuZGlzcG9zZSgpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoX2VsZW1lbnQ6IElUcmVlTm9kZTxTZXR0aW5nc1RyZWVFbGVtZW50PiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBJRGlzcG9zYWJsZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0KHRlbXBsYXRlIGFzIElTZXR0aW5nSXRlbVRlbXBsYXRlKS5lbGVtZW50RGlzcG9zYWJsZXM/LmNsZWFyKCk7XG5cdH1cbn1cblxuY2xhc3MgU2V0dGluZ0dyb3VwUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCwgbmV2ZXIsIElHcm91cFRpdGxlVGVtcGxhdGU+IHtcblx0dGVtcGxhdGVJZCA9IFNFVFRJTkdTX0VMRU1FTlRfVEVNUExBVEVfSUQ7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElHcm91cFRpdGxlVGVtcGxhdGUge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdncm91cC10aXRsZScpO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGU6IElHcm91cFRpdGxlVGVtcGxhdGUgPSB7XG5cdFx0XHRwYXJlbnQ6IGNvbnRhaW5lcixcblx0XHRcdHRvRGlzcG9zZTogbmV3IERpc3Bvc2FibGVTdG9yZSgpXG5cdFx0fTtcblxuXHRcdHJldHVybiB0ZW1wbGF0ZTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCwgbmV2ZXI+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElHcm91cFRpdGxlVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEucGFyZW50LmlubmVyVGV4dCA9ICcnO1xuXHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IERPTS5hcHBlbmQodGVtcGxhdGVEYXRhLnBhcmVudCwgJCgnZGl2LnNldHRpbmdzLWdyb3VwLXRpdGxlLWxhYmVsLnNldHRpbmdzLXJvdy1pbm5lci1jb250YWluZXInKSk7XG5cdFx0bGFiZWxFbGVtZW50LmNsYXNzTGlzdC5hZGQoYHNldHRpbmdzLWdyb3VwLWxldmVsLSR7ZWxlbWVudC5lbGVtZW50LmxldmVsfWApO1xuXHRcdGxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9IGVsZW1lbnQuZWxlbWVudC5sYWJlbDtcblxuXHRcdGlmIChlbGVtZW50LmVsZW1lbnQuaXNGaXJzdEdyb3VwKSB7XG5cdFx0XHRsYWJlbEVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnc2V0dGluZ3MtZ3JvdXAtZmlyc3QnKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJR3JvdXBUaXRsZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRvRGlzcG9zZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNldHRpbmdOZXdFeHRlbnNpb25zUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNldHRpbmdzVHJlZU5ld0V4dGVuc2lvbnNFbGVtZW50LCBuZXZlciwgSVNldHRpbmdOZXdFeHRlbnNpb25zVGVtcGxhdGU+IHtcblx0dGVtcGxhdGVJZCA9IFNFVFRJTkdTX05FV19FWFRFTlNJT05TX1RFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVNldHRpbmdOZXdFeHRlbnNpb25zVGVtcGxhdGUge1xuXHRcdGNvbnN0IHRvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzZXR0aW5nLWl0ZW0tbmV3LWV4dGVuc2lvbnMnKTtcblxuXHRcdGNvbnN0IGJ1dHRvbiA9IG5ldyBCdXR0b24oY29udGFpbmVyLCB7IHRpdGxlOiB0cnVlLCAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzIH0pO1xuXHRcdHRvRGlzcG9zZS5hZGQoYnV0dG9uKTtcblx0XHR0b0Rpc3Bvc2UuYWRkKGJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdGlmICh0ZW1wbGF0ZS5jb250ZXh0KSB7XG5cdFx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2hvd0V4dGVuc2lvbnNXaXRoSWRzJywgdGVtcGxhdGUuY29udGV4dC5leHRlbnNpb25JZHMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRidXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnbmV3RXh0ZW5zaW9uc0J1dHRvbkxhYmVsJywgXCJTaG93IG1hdGNoaW5nIGV4dGVuc2lvbnNcIik7XG5cdFx0YnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnc2V0dGluZ3MtbmV3LWV4dGVuc2lvbnMtYnV0dG9uJyk7XG5cblx0XHRjb25zdCB0ZW1wbGF0ZTogSVNldHRpbmdOZXdFeHRlbnNpb25zVGVtcGxhdGUgPSB7XG5cdFx0XHRidXR0b24sXG5cdFx0XHR0b0Rpc3Bvc2Vcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHRlbXBsYXRlO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8U2V0dGluZ3NUcmVlTmV3RXh0ZW5zaW9uc0VsZW1lbnQsIG5ldmVyPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJU2V0dGluZ05ld0V4dGVuc2lvbnNUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5jb250ZXh0ID0gZWxlbWVudC5lbGVtZW50O1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlOiBJRGlzcG9zYWJsZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUudG9EaXNwb3NlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2V0dGluZ0NvbXBsZXhSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXIsIElTZXR0aW5nQ29tcGxleEl0ZW1UZW1wbGF0ZT4ge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFRElUX0lOX0pTT05fTEFCRUwgPSBsb2NhbGl6ZSgnZWRpdEluU2V0dGluZ3NKc29uJywgXCJFZGl0IGluIHNldHRpbmdzLmpzb25cIik7XG5cblx0dGVtcGxhdGVJZCA9IFNFVFRJTkdTX0NPTVBMRVhfVEVNUExBVEVfSUQ7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZXR0aW5nQ29tcGxleEl0ZW1UZW1wbGF0ZSB7XG5cdFx0Y29uc3QgY29tbW9uID0gdGhpcy5yZW5kZXJDb21tb25UZW1wbGF0ZShudWxsLCBjb250YWluZXIsICdjb21wbGV4Jyk7XG5cblx0XHRjb25zdCBvcGVuU2V0dGluZ3NCdXR0b24gPSBET00uYXBwZW5kKGNvbW1vbi5jb250cm9sRWxlbWVudCwgJCgnYS5lZGl0LWluLXNldHRpbmdzLWJ1dHRvbicpKTtcblx0XHRvcGVuU2V0dGluZ3NCdXR0b24uY2xhc3NMaXN0LmFkZChBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5DT05UUk9MX0NMQVNTKTtcblx0XHRvcGVuU2V0dGluZ3NCdXR0b24ucm9sZSA9ICdidXR0b24nO1xuXG5cdFx0Y29uc3QgdmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnQgPSAkKCcuc2V0dGluZy1pdGVtLXZhbGlkYXRpb24tbWVzc2FnZScpO1xuXHRcdGNvbW1vbi5jb250YWluZXJFbGVtZW50LmFwcGVuZENoaWxkKHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50KTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlOiBJU2V0dGluZ0NvbXBsZXhJdGVtVGVtcGxhdGUgPSB7XG5cdFx0XHQuLi5jb21tb24sXG5cdFx0XHRidXR0b246IG9wZW5TZXR0aW5nc0J1dHRvbixcblx0XHRcdHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50XG5cdFx0fTtcblxuXHRcdHRoaXMuYWRkU2V0dGluZ0VsZW1lbnRGb2N1c0hhbmRsZXIodGVtcGxhdGUpO1xuXG5cdFx0cmV0dXJuIHRlbXBsYXRlO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJU2V0dGluZ0NvbXBsZXhJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJTZXR0aW5nRWxlbWVudChlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdHByb3RlY3RlZCByZW5kZXJWYWx1ZShkYXRhRWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIHRlbXBsYXRlOiBJU2V0dGluZ0NvbXBsZXhJdGVtVGVtcGxhdGUsIG9uQ2hhbmdlOiAodmFsdWU6IHN0cmluZykgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IHBsYWluS2V5ID0gZ2V0TGFuZ3VhZ2VUYWdTZXR0aW5nUGxhaW5LZXkoZGF0YUVsZW1lbnQuc2V0dGluZy5rZXkpO1xuXHRcdGNvbnN0IGVkaXRMYW5ndWFnZVNldHRpbmdMYWJlbCA9IGxvY2FsaXplKCdlZGl0TGFuZ3VhZ2VTZXR0aW5nTGFiZWwnLCBcIkVkaXQgc2V0dGluZ3MgZm9yIHswfVwiLCBwbGFpbktleSk7XG5cdFx0Y29uc3QgaXNMYW5ndWFnZVRhZ1NldHRpbmcgPSBkYXRhRWxlbWVudC5zZXR0aW5nLmlzTGFuZ3VhZ2VUYWdTZXR0aW5nO1xuXHRcdHRlbXBsYXRlLmJ1dHRvbi50ZXh0Q29udGVudCA9IGlzTGFuZ3VhZ2VUYWdTZXR0aW5nXG5cdFx0XHQ/IGVkaXRMYW5ndWFnZVNldHRpbmdMYWJlbFxuXHRcdFx0OiBTZXR0aW5nQ29tcGxleFJlbmRlcmVyLkVESVRfSU5fSlNPTl9MQUJFTDtcblxuXHRcdGNvbnN0IG9uQ2xpY2tPcktleWRvd24gPSAoZTogVUlFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGlzTGFuZ3VhZ2VUYWdTZXR0aW5nKSB7XG5cdFx0XHRcdHRoaXMuX29uQXBwbHlGaWx0ZXIuZmlyZShgQCR7TEFOR1VBR0VfU0VUVElOR19UQUd9JHtwbGFpbktleS5yZXBsYWNlQWxsKCcgJywgJycpfWApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fb25EaWRPcGVuU2V0dGluZ3MuZmlyZShkYXRhRWxlbWVudC5zZXR0aW5nLmtleSk7XG5cdFx0XHR9XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH07XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRlbXBsYXRlLmJ1dHRvbiwgRE9NLkV2ZW50VHlwZS5DTElDSywgKGUpID0+IHtcblx0XHRcdG9uQ2xpY2tPcktleWRvd24oZSk7XG5cdFx0fSkpO1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0ZW1wbGF0ZS5idXR0b24sIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIChlKSA9PiB7XG5cdFx0XHRjb25zdCBldiA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXYuZXF1YWxzKEtleUNvZGUuU3BhY2UpIHx8IGV2LmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHRvbkNsaWNrT3JLZXlkb3duKGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMucmVuZGVyVmFsaWRhdGlvbnMoZGF0YUVsZW1lbnQsIHRlbXBsYXRlKTtcblxuXHRcdGlmIChpc0xhbmd1YWdlVGFnU2V0dGluZykge1xuXHRcdFx0dGVtcGxhdGUuYnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGVkaXRMYW5ndWFnZVNldHRpbmdMYWJlbCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlLmJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBgJHtTZXR0aW5nQ29tcGxleFJlbmRlcmVyLkVESVRfSU5fSlNPTl9MQUJFTH06ICR7ZGF0YUVsZW1lbnQuc2V0dGluZy5rZXl9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJWYWxpZGF0aW9ucyhkYXRhRWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIHRlbXBsYXRlOiBJU2V0dGluZ0NvbXBsZXhJdGVtVGVtcGxhdGUpIHtcblx0XHRjb25zdCBlcnJNc2cgPSBkYXRhRWxlbWVudC5pc0NvbmZpZ3VyZWQgJiYgZ2V0SW52YWxpZFR5cGVFcnJvcihkYXRhRWxlbWVudC52YWx1ZSwgZGF0YUVsZW1lbnQuc2V0dGluZy50eXBlKTtcblx0XHRpZiAoZXJyTXNnKSB7XG5cdFx0XHR0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ludmFsaWQtaW5wdXQnKTtcblx0XHRcdHRlbXBsYXRlLnZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50LmlubmVyVGV4dCA9IGVyck1zZztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2ludmFsaWQtaW5wdXQnKTtcblx0fVxufVxuXG5jbGFzcyBTZXR0aW5nQ29tcGxleE9iamVjdFJlbmRlcmVyIGV4dGVuZHMgU2V0dGluZ0NvbXBsZXhSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyLCBJU2V0dGluZ0NvbXBsZXhPYmplY3RJdGVtVGVtcGxhdGU+IHtcblxuXHRvdmVycmlkZSB0ZW1wbGF0ZUlkID0gU0VUVElOR1NfQ09NUExFWF9PQkpFQ1RfVEVNUExBVEVfSUQ7XG5cblx0b3ZlcnJpZGUgcmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZXR0aW5nQ29tcGxleE9iamVjdEl0ZW1UZW1wbGF0ZSB7XG5cdFx0Y29uc3QgY29tbW9uID0gdGhpcy5yZW5kZXJDb21tb25UZW1wbGF0ZShudWxsLCBjb250YWluZXIsICdsaXN0Jyk7XG5cblx0XHRjb25zdCBvYmplY3RTZXR0aW5nV2lkZ2V0ID0gY29tbW9uLnRvRGlzcG9zZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoT2JqZWN0U2V0dGluZ0Ryb3Bkb3duV2lkZ2V0LCBjb21tb24uY29udHJvbEVsZW1lbnQpKTtcblx0XHRvYmplY3RTZXR0aW5nV2lkZ2V0LmRvbU5vZGUuY2xhc3NMaXN0LmFkZChBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5DT05UUk9MX0NMQVNTKTtcblxuXHRcdGNvbnN0IG9wZW5TZXR0aW5nc0J1dHRvbiA9IERPTS5hcHBlbmQoRE9NLmFwcGVuZChjb21tb24uY29udHJvbEVsZW1lbnQsICQoJy5jb21wbGV4LW9iamVjdC1lZGl0LWluLXNldHRpbmdzLWJ1dHRvbi1jb250YWluZXInKSksICQoJ2EuY29tcGxleC1vYmplY3QuZWRpdC1pbi1zZXR0aW5ncy1idXR0b24nKSk7XG5cdFx0b3BlblNldHRpbmdzQnV0dG9uLmNsYXNzTGlzdC5hZGQoQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIuQ09OVFJPTF9DTEFTUyk7XG5cdFx0b3BlblNldHRpbmdzQnV0dG9uLnJvbGUgPSAnYnV0dG9uJztcblxuXHRcdGNvbnN0IHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50ID0gJCgnLnNldHRpbmctaXRlbS12YWxpZGF0aW9uLW1lc3NhZ2UnKTtcblx0XHRjb21tb24uY29udGFpbmVyRWxlbWVudC5hcHBlbmRDaGlsZCh2YWxpZGF0aW9uRXJyb3JNZXNzYWdlRWxlbWVudCk7XG5cblx0XHRjb25zdCB0ZW1wbGF0ZTogSVNldHRpbmdDb21wbGV4T2JqZWN0SXRlbVRlbXBsYXRlID0ge1xuXHRcdFx0Li4uY29tbW9uLFxuXHRcdFx0YnV0dG9uOiBvcGVuU2V0dGluZ3NCdXR0b24sXG5cdFx0XHR2YWxpZGF0aW9uRXJyb3JNZXNzYWdlRWxlbWVudCxcblx0XHRcdG9iamVjdFNldHRpbmdXaWRnZXRcblx0XHR9O1xuXG5cdFx0dGhpcy5hZGRTZXR0aW5nRWxlbWVudEZvY3VzSGFuZGxlcih0ZW1wbGF0ZSk7XG5cblx0XHRyZXR1cm4gdGVtcGxhdGU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyVmFsdWUoZGF0YUVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCB0ZW1wbGF0ZTogSVNldHRpbmdDb21wbGV4T2JqZWN0SXRlbVRlbXBsYXRlLCBvbkNoYW5nZTogKHZhbHVlOiBzdHJpbmcpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCBpdGVtcyA9IGdldE9iamVjdERpc3BsYXlWYWx1ZShkYXRhRWxlbWVudCk7XG5cdFx0dGVtcGxhdGUub2JqZWN0U2V0dGluZ1dpZGdldC5zZXRWYWx1ZShpdGVtcywge1xuXHRcdFx0c2V0dGluZ0tleTogZGF0YUVsZW1lbnQuc2V0dGluZy5rZXksXG5cdFx0XHRzaG93QWRkQnV0dG9uOiBmYWxzZSxcblx0XHRcdGlzUmVhZE9ubHk6IHRydWUsXG5cdFx0fSk7XG5cdFx0dGVtcGxhdGUuYnV0dG9uLnBhcmVudEVsZW1lbnQ/LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGUnLCBkYXRhRWxlbWVudC5oYXNQb2xpY3lWYWx1ZSB8fCBkYXRhRWxlbWVudC5pc0FnZW50c1dpbmRvd1JlYWRPbmx5KTtcblx0XHRzdXBlci5yZW5kZXJWYWx1ZShkYXRhRWxlbWVudCwgdGVtcGxhdGUsIG9uQ2hhbmdlKTtcblx0fVxufVxuXG5jbGFzcyBTZXR0aW5nQXJyYXlSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXIsIElTZXR0aW5nTGlzdEl0ZW1UZW1wbGF0ZT4ge1xuXHR0ZW1wbGF0ZUlkID0gU0VUVElOR1NfQVJSQVlfVEVNUExBVEVfSUQ7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZXR0aW5nTGlzdEl0ZW1UZW1wbGF0ZSB7XG5cdFx0Y29uc3QgY29tbW9uID0gdGhpcy5yZW5kZXJDb21tb25UZW1wbGF0ZShudWxsLCBjb250YWluZXIsICdsaXN0Jyk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZGVzY3JpcHRpb25FbGVtZW50ID0gY29tbW9uLmNvbnRhaW5lckVsZW1lbnQucXVlcnlTZWxlY3RvcignLnNldHRpbmctaXRlbS1kZXNjcmlwdGlvbicpITtcblx0XHRjb25zdCB2YWxpZGF0aW9uRXJyb3JNZXNzYWdlRWxlbWVudCA9ICQoJy5zZXR0aW5nLWl0ZW0tdmFsaWRhdGlvbi1tZXNzYWdlJyk7XG5cdFx0ZGVzY3JpcHRpb25FbGVtZW50LmFmdGVyKHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50KTtcblxuXHRcdGNvbnN0IGxpc3RXaWRnZXQgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMaXN0U2V0dGluZ1dpZGdldCwgY29tbW9uLmNvbnRyb2xFbGVtZW50KTtcblx0XHRsaXN0V2lkZ2V0LmRvbU5vZGUuY2xhc3NMaXN0LmFkZChBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5DT05UUk9MX0NMQVNTKTtcblx0XHRjb21tb24udG9EaXNwb3NlLmFkZChsaXN0V2lkZ2V0KTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlOiBJU2V0dGluZ0xpc3RJdGVtVGVtcGxhdGUgPSB7XG5cdFx0XHQuLi5jb21tb24sXG5cdFx0XHRsaXN0V2lkZ2V0LFxuXHRcdFx0dmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnRcblx0XHR9O1xuXG5cdFx0dGhpcy5hZGRTZXR0aW5nRWxlbWVudEZvY3VzSGFuZGxlcih0ZW1wbGF0ZSk7XG5cblx0XHRjb21tb24udG9EaXNwb3NlLmFkZChcblx0XHRcdGxpc3RXaWRnZXQub25EaWRDaGFuZ2VMaXN0KGUgPT4ge1xuXHRcdFx0XHRjb25zdCBuZXdMaXN0ID0gdGhpcy5jb21wdXRlTmV3TGlzdCh0ZW1wbGF0ZSwgZSk7XG5cdFx0XHRcdHRlbXBsYXRlLm9uQ2hhbmdlPy4obmV3TGlzdCk7XG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHRyZXR1cm4gdGVtcGxhdGU7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVOZXdMaXN0KHRlbXBsYXRlOiBJU2V0dGluZ0xpc3RJdGVtVGVtcGxhdGUsIGU6IFNldHRpbmdMaXN0RXZlbnQ8SUxpc3REYXRhSXRlbT4pOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRlbXBsYXRlLmNvbnRleHQpIHtcblx0XHRcdGxldCBuZXdWYWx1ZTogc3RyaW5nW10gPSBbXTtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHRlbXBsYXRlLmNvbnRleHQuc2NvcGVWYWx1ZSkpIHtcblx0XHRcdFx0bmV3VmFsdWUgPSBbLi4udGVtcGxhdGUuY29udGV4dC5zY29wZVZhbHVlXTtcblx0XHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh0ZW1wbGF0ZS5jb250ZXh0LnZhbHVlKSkge1xuXHRcdFx0XHRuZXdWYWx1ZSA9IFsuLi50ZW1wbGF0ZS5jb250ZXh0LnZhbHVlXTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUudHlwZSA9PT0gJ21vdmUnKSB7XG5cdFx0XHRcdC8vIEEgZHJhZyBhbmQgZHJvcCBvY2N1cnJlZFxuXHRcdFx0XHRjb25zdCBzb3VyY2VJbmRleCA9IGUuc291cmNlSW5kZXg7XG5cdFx0XHRcdGNvbnN0IHRhcmdldEluZGV4ID0gZS50YXJnZXRJbmRleDtcblx0XHRcdFx0Y29uc3Qgc3BsaWNlZEVsZW0gPSBuZXdWYWx1ZS5zcGxpY2Uoc291cmNlSW5kZXgsIDEpWzBdO1xuXHRcdFx0XHRuZXdWYWx1ZS5zcGxpY2UodGFyZ2V0SW5kZXgsIDAsIHNwbGljZWRFbGVtKTtcblx0XHRcdH0gZWxzZSBpZiAoZS50eXBlID09PSAncmVtb3ZlJyB8fCBlLnR5cGUgPT09ICdyZXNldCcpIHtcblx0XHRcdFx0bmV3VmFsdWUuc3BsaWNlKGUudGFyZ2V0SW5kZXgsIDEpO1xuXHRcdFx0fSBlbHNlIGlmIChlLnR5cGUgPT09ICdjaGFuZ2UnKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW1WYWx1ZURhdGEgPSBlLm5ld0l0ZW0udmFsdWUuZGF0YS50b1N0cmluZygpO1xuXG5cdFx0XHRcdC8vIFVwZGF0ZSB2YWx1ZVxuXHRcdFx0XHRpZiAoZS50YXJnZXRJbmRleCA+IC0xKSB7XG5cdFx0XHRcdFx0bmV3VmFsdWVbZS50YXJnZXRJbmRleF0gPSBpdGVtVmFsdWVEYXRhO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEZvciBzb21lIHJlYXNvbiwgd2UgYXJlIHVwZGF0aW5nIGFuZCBjYW5ub3QgZmluZCBvcmlnaW5hbCB2YWx1ZVxuXHRcdFx0XHQvLyBKdXN0IGFwcGVuZCB0aGUgdmFsdWUgaW4gdGhpcyBjYXNlXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdG5ld1ZhbHVlLnB1c2goaXRlbVZhbHVlRGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoZS50eXBlID09PSAnYWRkJykge1xuXHRcdFx0XHRuZXdWYWx1ZS5wdXNoKGUubmV3SXRlbS52YWx1ZS5kYXRhLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoXG5cdFx0XHRcdHRlbXBsYXRlLmNvbnRleHQuZGVmYXVsdFZhbHVlICYmXG5cdFx0XHRcdEFycmF5LmlzQXJyYXkodGVtcGxhdGUuY29udGV4dC5kZWZhdWx0VmFsdWUpICYmXG5cdFx0XHRcdHRlbXBsYXRlLmNvbnRleHQuZGVmYXVsdFZhbHVlLmxlbmd0aCA9PT0gbmV3VmFsdWUubGVuZ3RoICYmXG5cdFx0XHRcdHRlbXBsYXRlLmNvbnRleHQuZGVmYXVsdFZhbHVlLmpvaW4oKSA9PT0gbmV3VmFsdWUuam9pbigpXG5cdFx0XHQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXdWYWx1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJU2V0dGluZ0xpc3RJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJTZXR0aW5nRWxlbWVudChlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdHByb3RlY3RlZCByZW5kZXJWYWx1ZShkYXRhRWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIHRlbXBsYXRlOiBJU2V0dGluZ0xpc3RJdGVtVGVtcGxhdGUsIG9uQ2hhbmdlOiAodmFsdWU6IHN0cmluZ1tdIHwgbnVtYmVyW10gfCB1bmRlZmluZWQpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCB2YWx1ZSA9IGdldExpc3REaXNwbGF5VmFsdWUoZGF0YUVsZW1lbnQpO1xuXHRcdGNvbnN0IGtleVN1Z2dlc3RlciA9IGRhdGFFbGVtZW50LnNldHRpbmcuZW51bSA/IGNyZWF0ZUFycmF5U3VnZ2VzdGVyKGRhdGFFbGVtZW50KSA6IHVuZGVmaW5lZDtcblx0XHR0ZW1wbGF0ZS5saXN0V2lkZ2V0LnNldFZhbHVlKHZhbHVlLCB7XG5cdFx0XHRzaG93QWRkQnV0dG9uOiBnZXRTaG93QWRkQnV0dG9uTGlzdChkYXRhRWxlbWVudCwgdmFsdWUpLFxuXHRcdFx0a2V5U3VnZ2VzdGVyXG5cdFx0fSk7XG5cdFx0dGVtcGxhdGUuY29udGV4dCA9IGRhdGFFbGVtZW50O1xuXG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGVtcGxhdGUubGlzdFdpZGdldC5jYW5jZWxFZGl0KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGVtcGxhdGUub25DaGFuZ2UgPSAodjogc3RyaW5nW10gfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdGlmICh2ICYmICFyZW5kZXJBcnJheVZhbGlkYXRpb25zKGRhdGFFbGVtZW50LCB0ZW1wbGF0ZSwgdiwgZmFsc2UpKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW1UeXBlID0gZGF0YUVsZW1lbnQuc2V0dGluZy5hcnJheUl0ZW1UeXBlO1xuXHRcdFx0XHRjb25zdCBhcnJUb1NhdmUgPSBpc05vbk51bGxhYmxlTnVtZXJpY1R5cGUoaXRlbVR5cGUpID8gdi5tYXAoYSA9PiArYSkgOiB2O1xuXHRcdFx0XHRvbkNoYW5nZShhcnJUb1NhdmUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gU2F2ZSB0aGUgc2V0dGluZyB1bnBhcnNlZCBhbmQgY29udGFpbmluZyB0aGUgZXJyb3JzLlxuXHRcdFx0XHQvLyByZW5kZXJBcnJheVZhbGlkYXRpb25zIHdpbGwgcmVuZGVyIHJlbGV2YW50IGVycm9yIG1lc3NhZ2VzLlxuXHRcdFx0XHRvbkNoYW5nZSh2KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cmVuZGVyQXJyYXlWYWxpZGF0aW9ucyhkYXRhRWxlbWVudCwgdGVtcGxhdGUsIHZhbHVlLm1hcCh2ID0+IHYudmFsdWUuZGF0YS50b1N0cmluZygpKSwgdHJ1ZSk7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RTZXR0aW5nT2JqZWN0UmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdFNldHRpbmdSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyLCBJU2V0dGluZ09iamVjdEl0ZW1UZW1wbGF0ZT4ge1xuXG5cdHByb3RlY3RlZCByZW5kZXJUZW1wbGF0ZVdpdGhXaWRnZXQoY29tbW9uOiBJU2V0dGluZ0l0ZW1UZW1wbGF0ZSwgd2lkZ2V0OiBPYmplY3RTZXR0aW5nQ2hlY2tib3hXaWRnZXQgfCBPYmplY3RTZXR0aW5nRHJvcGRvd25XaWRnZXQpOiBJU2V0dGluZ09iamVjdEl0ZW1UZW1wbGF0ZSB7XG5cdFx0d2lkZ2V0LmRvbU5vZGUuY2xhc3NMaXN0LmFkZChBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5DT05UUk9MX0NMQVNTKTtcblx0XHRjb21tb24udG9EaXNwb3NlLmFkZCh3aWRnZXQpO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZGVzY3JpcHRpb25FbGVtZW50ID0gY29tbW9uLmNvbnRhaW5lckVsZW1lbnQucXVlcnlTZWxlY3RvcignLnNldHRpbmctaXRlbS1kZXNjcmlwdGlvbicpITtcblx0XHRjb25zdCB2YWxpZGF0aW9uRXJyb3JNZXNzYWdlRWxlbWVudCA9ICQoJy5zZXR0aW5nLWl0ZW0tdmFsaWRhdGlvbi1tZXNzYWdlJyk7XG5cdFx0ZGVzY3JpcHRpb25FbGVtZW50LmFmdGVyKHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50KTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlOiBJU2V0dGluZ09iamVjdEl0ZW1UZW1wbGF0ZSA9IHtcblx0XHRcdC4uLmNvbW1vbixcblx0XHRcdHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50XG5cdFx0fTtcblx0XHRpZiAod2lkZ2V0IGluc3RhbmNlb2YgT2JqZWN0U2V0dGluZ0NoZWNrYm94V2lkZ2V0KSB7XG5cdFx0XHR0ZW1wbGF0ZS5vYmplY3RDaGVja2JveFdpZGdldCA9IHdpZGdldDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGUub2JqZWN0RHJvcGRvd25XaWRnZXQgPSB3aWRnZXQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5hZGRTZXR0aW5nRWxlbWVudEZvY3VzSGFuZGxlcih0ZW1wbGF0ZSk7XG5cdFx0cmV0dXJuIHRlbXBsYXRlO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJU2V0dGluZ09iamVjdEl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlclNldHRpbmdFbGVtZW50KGVsZW1lbnQsIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdPYmplY3RSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0U2V0dGluZ09iamVjdFJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXIsIElTZXR0aW5nT2JqZWN0SXRlbVRlbXBsYXRlPiB7XG5cdG92ZXJyaWRlIHRlbXBsYXRlSWQgPSBTRVRUSU5HU19PQkpFQ1RfVEVNUExBVEVfSUQ7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZXR0aW5nT2JqZWN0SXRlbVRlbXBsYXRlIHtcblx0XHRjb25zdCBjb21tb24gPSB0aGlzLnJlbmRlckNvbW1vblRlbXBsYXRlKG51bGwsIGNvbnRhaW5lciwgJ2xpc3QnKTtcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShPYmplY3RTZXR0aW5nRHJvcGRvd25XaWRnZXQsIGNvbW1vbi5jb250cm9sRWxlbWVudCk7XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSB0aGlzLnJlbmRlclRlbXBsYXRlV2l0aFdpZGdldChjb21tb24sIHdpZGdldCk7XG5cdFx0Y29tbW9uLnRvRGlzcG9zZS5hZGQod2lkZ2V0Lm9uRGlkQ2hhbmdlTGlzdChlID0+IHtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VPYmplY3QodGVtcGxhdGUsIGUpO1xuXHRcdH0pKTtcblx0XHRyZXR1cm4gdGVtcGxhdGU7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlT2JqZWN0KHRlbXBsYXRlOiBJU2V0dGluZ09iamVjdEl0ZW1UZW1wbGF0ZSwgZTogU2V0dGluZ0xpc3RFdmVudDxJT2JqZWN0RGF0YUl0ZW0+KTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGVtcGxhdGUub2JqZWN0RHJvcGRvd25XaWRnZXQhO1xuXHRcdGlmICh0ZW1wbGF0ZS5jb250ZXh0KSB7XG5cdFx0XHRjb25zdCBzZXR0aW5nU3VwcG9ydHNSZW1vdmVEZWZhdWx0ID0gb2JqZWN0U2V0dGluZ1N1cHBvcnRzUmVtb3ZlRGVmYXVsdFZhbHVlKHRlbXBsYXRlLmNvbnRleHQuc2V0dGluZy5rZXkpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdFZhbHVlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHR5cGVvZiB0ZW1wbGF0ZS5jb250ZXh0LmRlZmF1bHRWYWx1ZSA9PT0gJ29iamVjdCdcblx0XHRcdFx0PyB0ZW1wbGF0ZS5jb250ZXh0LmRlZmF1bHRWYWx1ZSA/PyB7fVxuXHRcdFx0XHQ6IHt9O1xuXG5cdFx0XHRjb25zdCBzY29wZVZhbHVlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHR5cGVvZiB0ZW1wbGF0ZS5jb250ZXh0LnNjb3BlVmFsdWUgPT09ICdvYmplY3QnXG5cdFx0XHRcdD8gdGVtcGxhdGUuY29udGV4dC5zY29wZVZhbHVlID8/IHt9XG5cdFx0XHRcdDoge307XG5cblx0XHRcdGNvbnN0IG5ld1ZhbHVlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHsgLi4udGVtcGxhdGUuY29udGV4dC5zY29wZVZhbHVlIH07IC8vIEluaXRpYWxpemUgd2l0aCBzY29wZWQgdmFsdWVzIGFzIHJlbW92ZWQgZGVmYXVsdCB2YWx1ZXMgYXJlIG5vdCByZW5kZXJlZFxuXHRcdFx0Y29uc3QgbmV3SXRlbXM6IElPYmplY3REYXRhSXRlbVtdID0gW107XG5cblx0XHRcdHdpZGdldC5pdGVtcy5mb3JFYWNoKChpdGVtLCBpZHgpID0+IHtcblx0XHRcdFx0Ly8gSXRlbSB3YXMgdXBkYXRlZFxuXHRcdFx0XHRpZiAoKGUudHlwZSA9PT0gJ2NoYW5nZScgfHwgZS50eXBlID09PSAnbW92ZScpICYmIGUudGFyZ2V0SW5kZXggPT09IGlkeCkge1xuXHRcdFx0XHRcdC8vIElmIHRoZSBrZXkgb2YgdGhlIGRlZmF1bHQgdmFsdWUgaXMgY2hhbmdlZCwgcmVtb3ZlIHRoZSBkZWZhdWx0IHZhbHVlXG5cdFx0XHRcdFx0aWYgKGUub3JpZ2luYWxJdGVtLmtleS5kYXRhICE9PSBlLm5ld0l0ZW0ua2V5LmRhdGEgJiYgc2V0dGluZ1N1cHBvcnRzUmVtb3ZlRGVmYXVsdCAmJiBlLm9yaWdpbmFsSXRlbS5rZXkuZGF0YSBpbiBkZWZhdWx0VmFsdWUpIHtcblx0XHRcdFx0XHRcdG5ld1ZhbHVlW2Uub3JpZ2luYWxJdGVtLmtleS5kYXRhXSA9IG51bGw7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGRlbGV0ZSBuZXdWYWx1ZVtlLm9yaWdpbmFsSXRlbS5rZXkuZGF0YV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG5ld1ZhbHVlW2UubmV3SXRlbS5rZXkuZGF0YV0gPSBlLm5ld0l0ZW0udmFsdWUuZGF0YTtcblx0XHRcdFx0XHRuZXdJdGVtcy5wdXNoKGUubmV3SXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQWxsIHJlbWFpbmluZyBpdGVtcywgYnV0IHNraXAgdGhlIG9uZSB0aGF0IHdlIGp1c3QgdXBkYXRlZFxuXHRcdFx0XHRlbHNlIGlmICgoZS50eXBlICE9PSAnY2hhbmdlJyAmJiBlLnR5cGUgIT09ICdtb3ZlJykgfHwgZS5uZXdJdGVtLmtleS5kYXRhICE9PSBpdGVtLmtleS5kYXRhKSB7XG5cdFx0XHRcdFx0bmV3VmFsdWVbaXRlbS5rZXkuZGF0YV0gPSBpdGVtLnZhbHVlLmRhdGE7XG5cdFx0XHRcdFx0bmV3SXRlbXMucHVzaChpdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEl0ZW0gd2FzIGRlbGV0ZWRcblx0XHRcdGlmIChlLnR5cGUgPT09ICdyZW1vdmUnIHx8IGUudHlwZSA9PT0gJ3Jlc2V0Jykge1xuXHRcdFx0XHRjb25zdCBvYmplY3RLZXkgPSBlLm9yaWdpbmFsSXRlbS5rZXkuZGF0YTtcblx0XHRcdFx0Y29uc3QgcmVtb3ZpbmdEZWZhdWx0VmFsdWUgPSBlLnR5cGUgPT09ICdyZW1vdmUnICYmIHNldHRpbmdTdXBwb3J0c1JlbW92ZURlZmF1bHQgJiYgZGVmYXVsdFZhbHVlW29iamVjdEtleV0gPT09IGUub3JpZ2luYWxJdGVtLnZhbHVlLmRhdGE7XG5cdFx0XHRcdGlmIChyZW1vdmluZ0RlZmF1bHRWYWx1ZSkge1xuXHRcdFx0XHRcdG5ld1ZhbHVlW29iamVjdEtleV0gPSBudWxsO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRlbGV0ZSBuZXdWYWx1ZVtvYmplY3RLZXldO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaXRlbVRvRGVsZXRlID0gbmV3SXRlbXMuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS5rZXkuZGF0YSA9PT0gb2JqZWN0S2V5KTtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdEl0ZW1WYWx1ZSA9IGRlZmF1bHRWYWx1ZVtvYmplY3RLZXldIGFzIHN0cmluZyB8IGJvb2xlYW47XG5cblx0XHRcdFx0Ly8gSXRlbSBkb2VzIG5vdCBoYXZlIGEgZGVmYXVsdCBvciBkZWZhdWx0IGlzIGJpbmcgcmVtb3ZlZFxuXHRcdFx0XHRpZiAocmVtb3ZpbmdEZWZhdWx0VmFsdWUgfHwgaXNVbmRlZmluZWRPck51bGwoZGVmYXVsdFZhbHVlW29iamVjdEtleV0pICYmIGl0ZW1Ub0RlbGV0ZSA+IC0xKSB7XG5cdFx0XHRcdFx0bmV3SXRlbXMuc3BsaWNlKGl0ZW1Ub0RlbGV0ZSwgMSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIXJlbW92aW5nRGVmYXVsdFZhbHVlICYmIGl0ZW1Ub0RlbGV0ZSA+IC0xKSB7XG5cdFx0XHRcdFx0bmV3SXRlbXNbaXRlbVRvRGVsZXRlXS52YWx1ZS5kYXRhID0gZGVmYXVsdEl0ZW1WYWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gTmV3IGl0ZW0gd2FzIGFkZGVkXG5cdFx0XHRlbHNlIGlmIChlLnR5cGUgPT09ICdhZGQnKSB7XG5cdFx0XHRcdG5ld1ZhbHVlW2UubmV3SXRlbS5rZXkuZGF0YV0gPSBlLm5ld0l0ZW0udmFsdWUuZGF0YTtcblx0XHRcdFx0bmV3SXRlbXMucHVzaChlLm5ld0l0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRPYmplY3QuZW50cmllcyhuZXdWYWx1ZSkuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XG5cdFx0XHRcdC8vIHZhbHVlIGZyb20gdGhlIHNjb3BlIGhhcyBjaGFuZ2VkIGJhY2sgdG8gdGhlIGRlZmF1bHRcblx0XHRcdFx0aWYgKHNjb3BlVmFsdWVba2V5XSAhPT0gdmFsdWUgJiYgZGVmYXVsdFZhbHVlW2tleV0gPT09IHZhbHVlICYmICEoc2V0dGluZ1N1cHBvcnRzUmVtb3ZlRGVmYXVsdCAmJiB2YWx1ZSA9PT0gbnVsbCkpIHtcblx0XHRcdFx0XHRkZWxldGUgbmV3VmFsdWVba2V5XTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IG5ld09iamVjdCA9IE9iamVjdC5rZXlzKG5ld1ZhbHVlKS5sZW5ndGggPT09IDAgPyB1bmRlZmluZWQgOiBuZXdWYWx1ZTtcblx0XHRcdHRlbXBsYXRlLm9iamVjdERyb3Bkb3duV2lkZ2V0IS5zZXRWYWx1ZShuZXdJdGVtcyk7XG5cdFx0XHR0ZW1wbGF0ZS5vbkNoYW5nZT8uKG5ld09iamVjdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlclZhbHVlKGRhdGFFbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgdGVtcGxhdGU6IElTZXR0aW5nT2JqZWN0SXRlbVRlbXBsYXRlLCBvbkNoYW5nZTogKHZhbHVlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW1zID0gZ2V0T2JqZWN0RGlzcGxheVZhbHVlKGRhdGFFbGVtZW50KTtcblx0XHRjb25zdCB7IGtleSwgb2JqZWN0UHJvcGVydGllcywgb2JqZWN0UGF0dGVyblByb3BlcnRpZXMsIG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzLCBwcm9wZXJ0eU5hbWVzIH0gPSBkYXRhRWxlbWVudC5zZXR0aW5nO1xuXG5cdFx0dGVtcGxhdGUub2JqZWN0RHJvcGRvd25XaWRnZXQhLnNldFZhbHVlKGl0ZW1zLCB7XG5cdFx0XHRzZXR0aW5nS2V5OiBrZXksXG5cdFx0XHRzaG93QWRkQnV0dG9uOiBvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcyA9PT0gZmFsc2Vcblx0XHRcdFx0PyAoXG5cdFx0XHRcdFx0IWFyZUFsbFByb3BlcnRpZXNEZWZpbmVkKE9iamVjdC5rZXlzKG9iamVjdFByb3BlcnRpZXMgPz8ge30pLCBpdGVtcykgfHxcblx0XHRcdFx0XHRpc0RlZmluZWQob2JqZWN0UGF0dGVyblByb3BlcnRpZXMpXG5cdFx0XHRcdClcblx0XHRcdFx0OiB0cnVlLFxuXHRcdFx0a2V5U3VnZ2VzdGVyOiBjcmVhdGVPYmplY3RLZXlTdWdnZXN0ZXIoZGF0YUVsZW1lbnQpLFxuXHRcdFx0dmFsdWVTdWdnZXN0ZXI6IGNyZWF0ZU9iamVjdFZhbHVlU3VnZ2VzdGVyKGRhdGFFbGVtZW50KSxcblx0XHRcdHByb3BlcnR5TmFtZXNcblx0XHR9KTtcblxuXHRcdHRlbXBsYXRlLmNvbnRleHQgPSBkYXRhRWxlbWVudDtcblxuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRlbXBsYXRlLm9iamVjdERyb3Bkb3duV2lkZ2V0IS5jYW5jZWxFZGl0KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGVtcGxhdGUub25DaGFuZ2UgPSAodjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdGlmICh2ICYmICFyZW5kZXJBcnJheVZhbGlkYXRpb25zKGRhdGFFbGVtZW50LCB0ZW1wbGF0ZSwgdiwgZmFsc2UpKSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZFJlY29yZCA9IHBhcnNlTnVtZXJpY09iamVjdFZhbHVlcyhkYXRhRWxlbWVudCwgdik7XG5cdFx0XHRcdG9uQ2hhbmdlKHBhcnNlZFJlY29yZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBTYXZlIHRoZSBzZXR0aW5nIHVucGFyc2VkIGFuZCBjb250YWluaW5nIHRoZSBlcnJvcnMuXG5cdFx0XHRcdC8vIHJlbmRlckFycmF5VmFsaWRhdGlvbnMgd2lsbCByZW5kZXIgcmVsZXZhbnQgZXJyb3IgbWVzc2FnZXMuXG5cdFx0XHRcdG9uQ2hhbmdlKHYpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0cmVuZGVyQXJyYXlWYWxpZGF0aW9ucyhkYXRhRWxlbWVudCwgdGVtcGxhdGUsIGRhdGFFbGVtZW50LnZhbHVlLCB0cnVlKTtcblx0fVxufVxuXG5jbGFzcyBTZXR0aW5nQm9vbE9iamVjdFJlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RTZXR0aW5nT2JqZWN0UmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBuZXZlciwgSVNldHRpbmdPYmplY3RJdGVtVGVtcGxhdGU+IHtcblx0b3ZlcnJpZGUgdGVtcGxhdGVJZCA9IFNFVFRJTkdTX0JPT0xfT0JKRUNUX1RFTVBMQVRFX0lEO1xuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2V0dGluZ09iamVjdEl0ZW1UZW1wbGF0ZSB7XG5cdFx0Y29uc3QgY29tbW9uID0gdGhpcy5yZW5kZXJDb21tb25UZW1wbGF0ZShudWxsLCBjb250YWluZXIsICdsaXN0Jyk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoT2JqZWN0U2V0dGluZ0NoZWNrYm94V2lkZ2V0LCBjb21tb24uY29udHJvbEVsZW1lbnQpO1xuXHRcdGNvbnN0IHRlbXBsYXRlID0gdGhpcy5yZW5kZXJUZW1wbGF0ZVdpdGhXaWRnZXQoY29tbW9uLCB3aWRnZXQpO1xuXHRcdGNvbW1vbi50b0Rpc3Bvc2UuYWRkKHdpZGdldC5vbkRpZENoYW5nZUxpc3QoZSA9PiB7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlT2JqZWN0KHRlbXBsYXRlLCBlKTtcblx0XHR9KSk7XG5cdFx0cmV0dXJuIHRlbXBsYXRlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9uRGlkQ2hhbmdlT2JqZWN0KHRlbXBsYXRlOiBJU2V0dGluZ09iamVjdEl0ZW1UZW1wbGF0ZSwgZTogU2V0dGluZ0xpc3RFdmVudDxJQm9vbE9iamVjdERhdGFJdGVtPik6IHZvaWQge1xuXHRcdGlmICh0ZW1wbGF0ZS5jb250ZXh0KSB7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSB0ZW1wbGF0ZS5vYmplY3RDaGVja2JveFdpZGdldCE7XG5cdFx0XHRjb25zdCBkZWZhdWx0VmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0gdHlwZW9mIHRlbXBsYXRlLmNvbnRleHQuZGVmYXVsdFZhbHVlID09PSAnb2JqZWN0J1xuXHRcdFx0XHQ/IHRlbXBsYXRlLmNvbnRleHQuZGVmYXVsdFZhbHVlID8/IHt9XG5cdFx0XHRcdDoge307XG5cblx0XHRcdGNvbnN0IHNjb3BlVmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0gdHlwZW9mIHRlbXBsYXRlLmNvbnRleHQuc2NvcGVWYWx1ZSA9PT0gJ29iamVjdCdcblx0XHRcdFx0PyB0ZW1wbGF0ZS5jb250ZXh0LnNjb3BlVmFsdWUgPz8ge31cblx0XHRcdFx0OiB7fTtcblxuXHRcdFx0Y29uc3QgbmV3VmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0geyAuLi50ZW1wbGF0ZS5jb250ZXh0LnNjb3BlVmFsdWUgfTsgLy8gSW5pdGlhbGl6ZSB3aXRoIHNjb3BlZCB2YWx1ZXMgYXMgcmVtb3ZlZCBkZWZhdWx0IHZhbHVlcyBhcmUgbm90IHJlbmRlcmVkXG5cdFx0XHRjb25zdCBuZXdJdGVtczogSUJvb2xPYmplY3REYXRhSXRlbVtdID0gW107XG5cblx0XHRcdGlmIChlLnR5cGUgIT09ICdjaGFuZ2UnKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybignVW5leHBlY3RlZCBldmVudCB0eXBlJywgZS50eXBlLCAnZm9yIGJvb2wgb2JqZWN0IHNldHRpbmcnLCB0ZW1wbGF0ZS5jb250ZXh0LnNldHRpbmcua2V5KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR3aWRnZXQuaXRlbXMuZm9yRWFjaCgoaXRlbSwgaWR4KSA9PiB7XG5cdFx0XHRcdC8vIEl0ZW0gd2FzIHVwZGF0ZWRcblx0XHRcdFx0aWYgKGUudGFyZ2V0SW5kZXggPT09IGlkeCkge1xuXHRcdFx0XHRcdG5ld1ZhbHVlW2UubmV3SXRlbS5rZXkuZGF0YV0gPSBlLm5ld0l0ZW0udmFsdWUuZGF0YTtcblx0XHRcdFx0XHRuZXdJdGVtcy5wdXNoKGUubmV3SXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQWxsIHJlbWFpbmluZyBpdGVtcywgYnV0IHNraXAgdGhlIG9uZSB0aGF0IHdlIGp1c3QgdXBkYXRlZFxuXHRcdFx0XHRlbHNlIGlmIChlLm5ld0l0ZW0ua2V5LmRhdGEgIT09IGl0ZW0ua2V5LmRhdGEpIHtcblx0XHRcdFx0XHRuZXdWYWx1ZVtpdGVtLmtleS5kYXRhXSA9IGl0ZW0udmFsdWUuZGF0YTtcblx0XHRcdFx0XHRuZXdJdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0T2JqZWN0LmVudHJpZXMobmV3VmFsdWUpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuXHRcdFx0XHQvLyB2YWx1ZSBmcm9tIHRoZSBzY29wZSBoYXMgY2hhbmdlZCBiYWNrIHRvIHRoZSBkZWZhdWx0XG5cdFx0XHRcdGlmIChzY29wZVZhbHVlW2tleV0gIT09IHZhbHVlICYmIGRlZmF1bHRWYWx1ZVtrZXldID09PSB2YWx1ZSkge1xuXHRcdFx0XHRcdGRlbGV0ZSBuZXdWYWx1ZVtrZXldO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgbmV3T2JqZWN0ID0gT2JqZWN0LmtleXMobmV3VmFsdWUpLmxlbmd0aCA9PT0gMCA/IHVuZGVmaW5lZCA6IG5ld1ZhbHVlO1xuXHRcdFx0dGVtcGxhdGUub2JqZWN0Q2hlY2tib3hXaWRnZXQhLnNldFZhbHVlKG5ld0l0ZW1zKTtcblx0XHRcdHRlbXBsYXRlLm9uQ2hhbmdlPy4obmV3T2JqZWN0KTtcblxuXHRcdFx0Ly8gRm9jdXMgdGhpcyBzZXR0aW5nIGV4cGxpY2l0bHksIGluIGNhc2Ugd2Ugd2VyZSBwcmV2aW91c2x5XG5cdFx0XHQvLyBmb2N1c2VkIG9uIGFub3RoZXIgc2V0dGluZyBhbmQgY2xpY2tlZCBhIGNoZWNrYm94L3ZhbHVlIGNvbnRhaW5lclxuXHRcdFx0Ly8gZm9yIHRoaXMgc2V0dGluZy5cblx0XHRcdHRoaXMuX29uRGlkRm9jdXNTZXR0aW5nLmZpcmUodGVtcGxhdGUuY29udGV4dCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlclZhbHVlKGRhdGFFbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgdGVtcGxhdGU6IElTZXR0aW5nT2JqZWN0SXRlbVRlbXBsYXRlLCBvbkNoYW5nZTogKHZhbHVlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW1zID0gZ2V0Qm9vbE9iamVjdERpc3BsYXlWYWx1ZShkYXRhRWxlbWVudCk7XG5cdFx0Y29uc3QgeyBrZXkgfSA9IGRhdGFFbGVtZW50LnNldHRpbmc7XG5cblx0XHR0ZW1wbGF0ZS5vYmplY3RDaGVja2JveFdpZGdldCEuc2V0VmFsdWUoaXRlbXMsIHtcblx0XHRcdHNldHRpbmdLZXk6IGtleVxuXHRcdH0pO1xuXG5cdFx0dGVtcGxhdGUuY29udGV4dCA9IGRhdGFFbGVtZW50O1xuXHRcdHRlbXBsYXRlLm9uQ2hhbmdlID0gKHY6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRvbkNoYW5nZSh2KTtcblx0XHR9O1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIFNldHRpbmdJbmNsdWRlRXhjbHVkZVJlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBuZXZlciwgSVNldHRpbmdJbmNsdWRlRXhjbHVkZUl0ZW1UZW1wbGF0ZT4ge1xuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBpc0V4Y2x1ZGUoKTogYm9vbGVhbjtcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVNldHRpbmdJbmNsdWRlRXhjbHVkZUl0ZW1UZW1wbGF0ZSB7XG5cdFx0Y29uc3QgY29tbW9uID0gdGhpcy5yZW5kZXJDb21tb25UZW1wbGF0ZShudWxsLCBjb250YWluZXIsICdsaXN0Jyk7XG5cblx0XHRjb25zdCBpbmNsdWRlRXhjbHVkZVdpZGdldCA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKHRoaXMuaXNFeGNsdWRlKCkgPyBFeGNsdWRlU2V0dGluZ1dpZGdldCA6IEluY2x1ZGVTZXR0aW5nV2lkZ2V0LCBjb21tb24uY29udHJvbEVsZW1lbnQpO1xuXHRcdGluY2x1ZGVFeGNsdWRlV2lkZ2V0LmRvbU5vZGUuY2xhc3NMaXN0LmFkZChBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5DT05UUk9MX0NMQVNTKTtcblx0XHRjb21tb24udG9EaXNwb3NlLmFkZChpbmNsdWRlRXhjbHVkZVdpZGdldCk7XG5cblx0XHRjb25zdCB0ZW1wbGF0ZTogSVNldHRpbmdJbmNsdWRlRXhjbHVkZUl0ZW1UZW1wbGF0ZSA9IHtcblx0XHRcdC4uLmNvbW1vbixcblx0XHRcdGluY2x1ZGVFeGNsdWRlV2lkZ2V0XG5cdFx0fTtcblxuXHRcdHRoaXMuYWRkU2V0dGluZ0VsZW1lbnRGb2N1c0hhbmRsZXIodGVtcGxhdGUpO1xuXG5cdFx0Y29tbW9uLnRvRGlzcG9zZS5hZGQoaW5jbHVkZUV4Y2x1ZGVXaWRnZXQub25EaWRDaGFuZ2VMaXN0KGUgPT4gdGhpcy5vbkRpZENoYW5nZUluY2x1ZGVFeGNsdWRlKHRlbXBsYXRlLCBlKSkpO1xuXG5cdFx0cmV0dXJuIHRlbXBsYXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUluY2x1ZGVFeGNsdWRlKHRlbXBsYXRlOiBJU2V0dGluZ0luY2x1ZGVFeGNsdWRlSXRlbVRlbXBsYXRlLCBlOiBTZXR0aW5nTGlzdEV2ZW50PElMaXN0RGF0YUl0ZW0+KTogdm9pZCB7XG5cdFx0aWYgKHRlbXBsYXRlLmNvbnRleHQpIHtcblx0XHRcdGNvbnN0IG5ld1ZhbHVlID0geyAuLi50ZW1wbGF0ZS5jb250ZXh0LnNjb3BlVmFsdWUgfTtcblxuXHRcdFx0Ly8gZmlyc3QgZGVsZXRlIHRoZSBleGlzdGluZyBlbnRyeSwgaWYgcHJlc2VudFxuXHRcdFx0aWYgKGUudHlwZSAhPT0gJ2FkZCcpIHtcblx0XHRcdFx0aWYgKGUub3JpZ2luYWxJdGVtLnZhbHVlLmRhdGEudG9TdHJpbmcoKSBpbiB0ZW1wbGF0ZS5jb250ZXh0LmRlZmF1bHRWYWx1ZSkge1xuXHRcdFx0XHRcdC8vIGRlbGV0ZSBhIGRlZmF1bHQgYnkgb3ZlcnJpZGluZyBpdFxuXHRcdFx0XHRcdG5ld1ZhbHVlW2Uub3JpZ2luYWxJdGVtLnZhbHVlLmRhdGEudG9TdHJpbmcoKV0gPSBmYWxzZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkZWxldGUgbmV3VmFsdWVbZS5vcmlnaW5hbEl0ZW0udmFsdWUuZGF0YS50b1N0cmluZygpXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyB0aGVuIGFkZCB0aGUgbmV3IG9yIHVwZGF0ZWQgZW50cnksIGlmIHByZXNlbnRcblx0XHRcdGlmIChlLnR5cGUgPT09ICdjaGFuZ2UnIHx8IGUudHlwZSA9PT0gJ2FkZCcgfHwgZS50eXBlID09PSAnbW92ZScpIHtcblx0XHRcdFx0aWYgKGUubmV3SXRlbS52YWx1ZS5kYXRhLnRvU3RyaW5nKCkgaW4gdGVtcGxhdGUuY29udGV4dC5kZWZhdWx0VmFsdWUgJiYgIWUubmV3SXRlbS5zaWJsaW5nKSB7XG5cdFx0XHRcdFx0Ly8gYWRkIGEgZGVmYXVsdCBieSBkZWxldGluZyBpdHMgb3ZlcnJpZGVcblx0XHRcdFx0XHRkZWxldGUgbmV3VmFsdWVbZS5uZXdJdGVtLnZhbHVlLmRhdGEudG9TdHJpbmcoKV07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bmV3VmFsdWVbZS5uZXdJdGVtLnZhbHVlLmRhdGEudG9TdHJpbmcoKV0gPSBlLm5ld0l0ZW0uc2libGluZyA/IHsgd2hlbjogZS5uZXdJdGVtLnNpYmxpbmcgfSA6IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZnVuY3Rpb24gc29ydEtleXM8VCBleHRlbmRzIG9iamVjdD4ob2JqOiBUKSB7XG5cdFx0XHRcdGNvbnN0IHNvcnRlZEtleXMgPSBPYmplY3Qua2V5cyhvYmopXG5cdFx0XHRcdFx0LnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSkgYXMgQXJyYXk8a2V5b2YgVD47XG5cblx0XHRcdFx0Y29uc3QgcmV0VmFsOiBQYXJ0aWFsPFQ+ID0ge307XG5cdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIHNvcnRlZEtleXMpIHtcblx0XHRcdFx0XHRyZXRWYWxba2V5XSA9IG9ialtrZXldO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXRWYWw7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2V0dGluZy5maXJlKHtcblx0XHRcdFx0a2V5OiB0ZW1wbGF0ZS5jb250ZXh0LnNldHRpbmcua2V5LFxuXHRcdFx0XHR2YWx1ZTogT2JqZWN0LmtleXMobmV3VmFsdWUpLmxlbmd0aCA9PT0gMCA/IHVuZGVmaW5lZCA6IHNvcnRLZXlzKG5ld1ZhbHVlKSxcblx0XHRcdFx0dHlwZTogdGVtcGxhdGUuY29udGV4dC52YWx1ZVR5cGUsXG5cdFx0XHRcdG1hbnVhbFJlc2V0OiBmYWxzZSxcblx0XHRcdFx0c2NvcGU6IHRlbXBsYXRlLmNvbnRleHQuc2V0dGluZy5zY29wZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJU2V0dGluZ0luY2x1ZGVFeGNsdWRlSXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyU2V0dGluZ0VsZW1lbnQoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVyVmFsdWUoZGF0YUVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCB0ZW1wbGF0ZTogSVNldHRpbmdJbmNsdWRlRXhjbHVkZUl0ZW1UZW1wbGF0ZSwgb25DaGFuZ2U6ICh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSBnZXRJbmNsdWRlRXhjbHVkZURpc3BsYXlWYWx1ZShkYXRhRWxlbWVudCk7XG5cdFx0dGVtcGxhdGUuaW5jbHVkZUV4Y2x1ZGVXaWRnZXQuc2V0VmFsdWUodmFsdWUsIHsgaXNSZWFkT25seTogZGF0YUVsZW1lbnQuaGFzUG9saWN5VmFsdWUgfHwgZGF0YUVsZW1lbnQuaXNBZ2VudHNXaW5kb3dSZWFkT25seSB9KTtcblx0XHR0ZW1wbGF0ZS5jb250ZXh0ID0gZGF0YUVsZW1lbnQ7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGVtcGxhdGUuaW5jbHVkZUV4Y2x1ZGVXaWRnZXQuY2FuY2VsRWRpdCgpO1xuXHRcdH0pKTtcblx0fVxufVxuXG5jbGFzcyBTZXR0aW5nRXhjbHVkZVJlbmRlcmVyIGV4dGVuZHMgU2V0dGluZ0luY2x1ZGVFeGNsdWRlUmVuZGVyZXIge1xuXHR0ZW1wbGF0ZUlkID0gU0VUVElOR1NfRVhDTFVERV9URU1QTEFURV9JRDtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgaXNFeGNsdWRlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdJbmNsdWRlUmVuZGVyZXIgZXh0ZW5kcyBTZXR0aW5nSW5jbHVkZUV4Y2x1ZGVSZW5kZXJlciB7XG5cdHRlbXBsYXRlSWQgPSBTRVRUSU5HU19JTkNMVURFX1RFTVBMQVRFX0lEO1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpc0V4Y2x1ZGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmNvbnN0IHNldHRpbmdzSW5wdXRCb3hTdHlsZXMgPSBnZXRJbnB1dEJveFN0eWxlKHtcblx0aW5wdXRCYWNrZ3JvdW5kOiBzZXR0aW5nc1RleHRJbnB1dEJhY2tncm91bmQsXG5cdGlucHV0Rm9yZWdyb3VuZDogc2V0dGluZ3NUZXh0SW5wdXRGb3JlZ3JvdW5kLFxuXHRpbnB1dEJvcmRlcjogc2V0dGluZ3NUZXh0SW5wdXRCb3JkZXJcbn0pO1xuXG5hYnN0cmFjdCBjbGFzcyBBYnN0cmFjdFNldHRpbmdUZXh0UmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdFNldHRpbmdSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyLCBJU2V0dGluZ1RleHRJdGVtVGVtcGxhdGU+IHtcblx0cHJpdmF0ZSByZWFkb25seSBNVUxUSUxJTkVfTUFYX0hFSUdIVCA9IDE1MDtcblxuXHRyZW5kZXJUZW1wbGF0ZShfY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdXNlTXVsdGlsaW5lPzogYm9vbGVhbik6IElTZXR0aW5nVGV4dEl0ZW1UZW1wbGF0ZSB7XG5cdFx0Y29uc3QgY29tbW9uID0gdGhpcy5yZW5kZXJDb21tb25UZW1wbGF0ZShudWxsLCBfY29udGFpbmVyLCAndGV4dCcpO1xuXHRcdGNvbnN0IHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50ID0gRE9NLmFwcGVuZChjb21tb24uY29udGFpbmVyRWxlbWVudCwgJCgnLnNldHRpbmctaXRlbS12YWxpZGF0aW9uLW1lc3NhZ2UnKSk7XG5cblx0XHRjb25zdCBpbnB1dEJveE9wdGlvbnM6IElJbnB1dE9wdGlvbnMgPSB7XG5cdFx0XHRmbGV4aWJsZUhlaWdodDogdXNlTXVsdGlsaW5lLFxuXHRcdFx0ZmxleGlibGVXaWR0aDogZmFsc2UsXG5cdFx0XHRmbGV4aWJsZU1heEhlaWdodDogdGhpcy5NVUxUSUxJTkVfTUFYX0hFSUdIVCxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBzZXR0aW5nc0lucHV0Qm94U3R5bGVzXG5cdFx0fTtcblx0XHRjb25zdCBpbnB1dEJveCA9IG5ldyBJbnB1dEJveChjb21tb24uY29udHJvbEVsZW1lbnQsIHRoaXMuX2NvbnRleHRWaWV3U2VydmljZSwgaW5wdXRCb3hPcHRpb25zKTtcblx0XHRjb21tb24udG9EaXNwb3NlLmFkZChpbnB1dEJveCk7XG5cdFx0Y29tbW9uLnRvRGlzcG9zZS5hZGQoXG5cdFx0XHRpbnB1dEJveC5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdFx0dGVtcGxhdGUub25DaGFuZ2U/LihlKTtcblx0XHRcdH0pKTtcblx0XHRjb21tb24udG9EaXNwb3NlLmFkZChpbnB1dEJveCk7XG5cdFx0aW5wdXRCb3guaW5wdXRFbGVtZW50LmNsYXNzTGlzdC5hZGQoQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIuQ09OVFJPTF9DTEFTUyk7XG5cdFx0aW5wdXRCb3guaW5wdXRFbGVtZW50LnRhYkluZGV4ID0gMDtcblxuXHRcdGNvbnN0IHRlbXBsYXRlOiBJU2V0dGluZ1RleHRJdGVtVGVtcGxhdGUgPSB7XG5cdFx0XHQuLi5jb21tb24sXG5cdFx0XHRpbnB1dEJveCxcblx0XHRcdHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50XG5cdFx0fTtcblxuXHRcdHRoaXMuYWRkU2V0dGluZ0VsZW1lbnRGb2N1c0hhbmRsZXIodGVtcGxhdGUpO1xuXG5cdFx0cmV0dXJuIHRlbXBsYXRlO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJU2V0dGluZ1RleHRJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJTZXR0aW5nRWxlbWVudChlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdHByb3RlY3RlZCByZW5kZXJWYWx1ZShkYXRhRWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIHRlbXBsYXRlOiBJU2V0dGluZ1RleHRJdGVtVGVtcGxhdGUsIG9uQ2hhbmdlOiAodmFsdWU6IHN0cmluZykgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLm9uQ2hhbmdlID0gdW5kZWZpbmVkO1xuXHRcdHRlbXBsYXRlLmlucHV0Qm94LnZhbHVlID0gZGF0YUVsZW1lbnQudmFsdWU7XG5cdFx0dGVtcGxhdGUuaW5wdXRCb3guc2V0RW5hYmxlZCghZGF0YUVsZW1lbnQuaGFzUG9saWN5VmFsdWUgJiYgIWRhdGFFbGVtZW50LmlzQWdlbnRzV2luZG93UmVhZE9ubHkpO1xuXHRcdHRlbXBsYXRlLmlucHV0Qm94LnNldEFyaWFMYWJlbChkYXRhRWxlbWVudC5zZXR0aW5nLmtleSk7XG5cdFx0dGVtcGxhdGUub25DaGFuZ2UgPSB2YWx1ZSA9PiB7XG5cdFx0XHRpZiAoIXJlbmRlclZhbGlkYXRpb25zKGRhdGFFbGVtZW50LCB0ZW1wbGF0ZSwgZmFsc2UpKSB7XG5cdFx0XHRcdG9uQ2hhbmdlKHZhbHVlKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cmVuZGVyVmFsaWRhdGlvbnMoZGF0YUVsZW1lbnQsIHRlbXBsYXRlLCB0cnVlKTtcblx0fVxufVxuXG5jbGFzcyBTZXR0aW5nVGV4dFJlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RTZXR0aW5nVGV4dFJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXIsIElTZXR0aW5nVGV4dEl0ZW1UZW1wbGF0ZT4ge1xuXHR0ZW1wbGF0ZUlkID0gU0VUVElOR1NfVEVYVF9URU1QTEFURV9JRDtcblxuXHRvdmVycmlkZSByZW5kZXJUZW1wbGF0ZShfY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZXR0aW5nVGV4dEl0ZW1UZW1wbGF0ZSB7XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSBzdXBlci5yZW5kZXJUZW1wbGF0ZShfY29udGFpbmVyLCBmYWxzZSk7XG5cblx0XHQvLyBUT0RPQDlhdDg6IGxpc3RXaWRnZXQgZmlsdGVycyBvdXQgYWxsIGtleSBldmVudHMgZnJvbSBpbnB1dCBib3hlcywgc28gd2UgbmVlZCB0byBjb21lIHVwIHdpdGggYSBiZXR0ZXIgd2F5XG5cdFx0Ly8gRGlzYWJsZSBBcnJvd1VwIGFuZCBBcnJvd0Rvd24gYmVoYXZpb3VyIGluIGZhdm9yIG9mIGxpc3QgbmF2aWdhdGlvblxuXHRcdHRlbXBsYXRlLnRvRGlzcG9zZS5hZGQoRE9NLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRlbXBsYXRlLmlucHV0Qm94LmlucHV0RWxlbWVudCwgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5VcEFycm93KSB8fCBlLmVxdWFscyhLZXlDb2RlLkRvd25BcnJvdykpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiB0ZW1wbGF0ZTtcblx0fVxufVxuXG5jbGFzcyBTZXR0aW5nTXVsdGlsaW5lVGV4dFJlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RTZXR0aW5nVGV4dFJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXIsIElTZXR0aW5nVGV4dEl0ZW1UZW1wbGF0ZT4ge1xuXHR0ZW1wbGF0ZUlkID0gU0VUVElOR1NfTVVMVElMSU5FX1RFWFRfVEVNUExBVEVfSUQ7XG5cblx0b3ZlcnJpZGUgcmVuZGVyVGVtcGxhdGUoX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2V0dGluZ1RleHRJdGVtVGVtcGxhdGUge1xuXHRcdHJldHVybiBzdXBlci5yZW5kZXJUZW1wbGF0ZShfY29udGFpbmVyLCB0cnVlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJWYWx1ZShkYXRhRWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIHRlbXBsYXRlOiBJU2V0dGluZ1RleHRJdGVtVGVtcGxhdGUsIG9uQ2hhbmdlOiAodmFsdWU6IHN0cmluZykgPT4gdm9pZCkge1xuXHRcdGNvbnN0IG9uQ2hhbmdlT3ZlcnJpZGUgPSAodmFsdWU6IHN0cmluZykgPT4ge1xuXHRcdFx0Ly8gRW5zdXJlIHRoZSBtb2RlbCBpcyB1cCB0byBkYXRlIHNpbmNlIGEgZGlmZmVyZW50IHZhbHVlIHdpbGwgYmUgcmVuZGVyZWQgYXMgZGlmZmVyZW50IGhlaWdodCB3aGVuIHByb2JpbmcgdGhlIGhlaWdodC5cblx0XHRcdGRhdGFFbGVtZW50LnZhbHVlID0gdmFsdWU7XG5cdFx0XHRvbkNoYW5nZSh2YWx1ZSk7XG5cdFx0fTtcblx0XHRzdXBlci5yZW5kZXJWYWx1ZShkYXRhRWxlbWVudCwgdGVtcGxhdGUsIG9uQ2hhbmdlT3ZlcnJpZGUpO1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoXG5cdFx0XHR0ZW1wbGF0ZS5pbnB1dEJveC5vbkRpZEhlaWdodENoYW5nZShlID0+IHtcblx0XHRcdFx0Y29uc3QgaGVpZ2h0ID0gdGVtcGxhdGUuY29udGFpbmVyRWxlbWVudC5jbGllbnRIZWlnaHQ7XG5cdFx0XHRcdC8vIERvbid0IGZpcmUgZXZlbnQgaWYgaGVpZ2h0IGlzIHJlcG9ydGVkIGFzIDAsXG5cdFx0XHRcdC8vIHdoaWNoIHNvbWV0aW1lcyBoYXBwZW5zIHdoZW4gY2xpY2tpbmcgb250byBhIG5ldyBzZXR0aW5nLlxuXHRcdFx0XHRpZiAoaGVpZ2h0KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXR0aW5nSGVpZ2h0LmZpcmUoe1xuXHRcdFx0XHRcdFx0ZWxlbWVudDogZGF0YUVsZW1lbnQsXG5cdFx0XHRcdFx0XHRoZWlnaHQ6IHRlbXBsYXRlLmNvbnRhaW5lckVsZW1lbnQuY2xpZW50SGVpZ2h0XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblx0XHR0ZW1wbGF0ZS5pbnB1dEJveC5sYXlvdXQoKTtcblx0fVxufVxuXG5jbGFzcyBTZXR0aW5nRW51bVJlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBuZXZlciwgSVNldHRpbmdFbnVtSXRlbVRlbXBsYXRlPiB7XG5cdHRlbXBsYXRlSWQgPSBTRVRUSU5HU19FTlVNX1RFTVBMQVRFX0lEO1xuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2V0dGluZ0VudW1JdGVtVGVtcGxhdGUge1xuXHRcdGNvbnN0IGNvbW1vbiA9IHRoaXMucmVuZGVyQ29tbW9uVGVtcGxhdGUobnVsbCwgY29udGFpbmVyLCAnZW51bScpO1xuXG5cdFx0Y29uc3Qgc3R5bGVzID0gZ2V0U2VsZWN0Qm94U3R5bGVzKHtcblx0XHRcdHNlbGVjdEJhY2tncm91bmQ6IHNldHRpbmdzU2VsZWN0QmFja2dyb3VuZCxcblx0XHRcdHNlbGVjdEZvcmVncm91bmQ6IHNldHRpbmdzU2VsZWN0Rm9yZWdyb3VuZCxcblx0XHRcdHNlbGVjdEJvcmRlcjogc2V0dGluZ3NTZWxlY3RCb3JkZXIsXG5cdFx0XHRzZWxlY3RMaXN0Qm9yZGVyOiBzZXR0aW5nc1NlbGVjdExpc3RCb3JkZXJcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlbGVjdEJveCA9IG5ldyBTZWxlY3RCb3goW10sIDAsIHRoaXMuX2NvbnRleHRWaWV3U2VydmljZSwgc3R5bGVzLCB7XG5cdFx0XHR1c2VDdXN0b21EcmF3bjogIWhhc05hdGl2ZUNvbnRleHRNZW51KHRoaXMuX2NvbmZpZ1NlcnZpY2UpIHx8ICEoaXNJT1MgJiYgQnJvd3NlckZlYXR1cmVzLnBvaW50ZXJFdmVudHMpXG5cdFx0fSk7XG5cblx0XHRjb21tb24udG9EaXNwb3NlLmFkZChzZWxlY3RCb3gpO1xuXHRcdHNlbGVjdEJveC5yZW5kZXIoY29tbW9uLmNvbnRyb2xFbGVtZW50KTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBzZWxlY3RFbGVtZW50ID0gY29tbW9uLmNvbnRyb2xFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdCcpO1xuXHRcdGlmIChzZWxlY3RFbGVtZW50KSB7XG5cdFx0XHRzZWxlY3RFbGVtZW50LmNsYXNzTGlzdC5hZGQoQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIuQ09OVFJPTF9DTEFTUyk7XG5cdFx0XHRzZWxlY3RFbGVtZW50LnRhYkluZGV4ID0gMDtcblx0XHR9XG5cblx0XHRjb21tb24udG9EaXNwb3NlLmFkZChcblx0XHRcdHNlbGVjdEJveC5vbkRpZFNlbGVjdChlID0+IHtcblx0XHRcdFx0dGVtcGxhdGUub25DaGFuZ2U/LihlLmluZGV4KTtcblx0XHRcdH0pKTtcblxuXHRcdGNvbnN0IGVudW1EZXNjcmlwdGlvbkVsZW1lbnQgPSBjb21tb24uY29udGFpbmVyRWxlbWVudC5pbnNlcnRCZWZvcmUoJCgnLnNldHRpbmctaXRlbS1lbnVtRGVzY3JpcHRpb24nKSwgY29tbW9uLmRlc2NyaXB0aW9uRWxlbWVudC5uZXh0U2libGluZyk7XG5cblx0XHRjb25zdCB0ZW1wbGF0ZTogSVNldHRpbmdFbnVtSXRlbVRlbXBsYXRlID0ge1xuXHRcdFx0Li4uY29tbW9uLFxuXHRcdFx0c2VsZWN0Qm94LFxuXHRcdFx0c2VsZWN0RWxlbWVudCxcblx0XHRcdGVudW1EZXNjcmlwdGlvbkVsZW1lbnRcblx0XHR9O1xuXG5cdFx0dGhpcy5hZGRTZXR0aW5nRWxlbWVudEZvY3VzSGFuZGxlcih0ZW1wbGF0ZSk7XG5cblx0XHRyZXR1cm4gdGVtcGxhdGU7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXI+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTZXR0aW5nRW51bUl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlclNldHRpbmdFbGVtZW50KGVsZW1lbnQsIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlclZhbHVlKGRhdGFFbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgdGVtcGxhdGU6IElTZXR0aW5nRW51bUl0ZW1UZW1wbGF0ZSwgb25DaGFuZ2U6ICh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Ly8gTWFrZSBzaGFsbG93IGNvcGllcyBoZXJlIHNvIHRoYXQgd2UgZG9uJ3QgbW9kaWZ5IHRoZSBhY3R1YWwgZGF0YUVsZW1lbnQgbGF0ZXJcblx0XHRjb25zdCBlbnVtSXRlbUxhYmVscyA9IGRhdGFFbGVtZW50LnNldHRpbmcuZW51bUl0ZW1MYWJlbHMgPyBbLi4uZGF0YUVsZW1lbnQuc2V0dGluZy5lbnVtSXRlbUxhYmVsc10gOiBbXTtcblx0XHRjb25zdCBlbnVtRGVzY3JpcHRpb25zID0gZGF0YUVsZW1lbnQuc2V0dGluZy5lbnVtRGVzY3JpcHRpb25zID8gWy4uLmRhdGFFbGVtZW50LnNldHRpbmcuZW51bURlc2NyaXB0aW9uc10gOiBbXTtcblx0XHRjb25zdCBzZXR0aW5nRW51bSA9IFsuLi5kYXRhRWxlbWVudC5zZXR0aW5nLmVudW0hXTtcblx0XHRjb25zdCBlbnVtRGVzY3JpcHRpb25zQXJlTWFya2Rvd24gPSBkYXRhRWxlbWVudC5zZXR0aW5nLmVudW1EZXNjcmlwdGlvbnNBcmVNYXJrZG93bjtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZXMpO1xuXG5cdFx0bGV0IGNyZWF0ZWREZWZhdWx0ID0gZmFsc2U7XG5cdFx0aWYgKCFzZXR0aW5nRW51bS5pbmNsdWRlcyhkYXRhRWxlbWVudC5kZWZhdWx0VmFsdWUpKSB7XG5cdFx0XHQvLyBBZGQgYSBuZXcgcG90ZW50aWFsbHkgYmxhbmsgZGVmYXVsdCBzZXR0aW5nXG5cdFx0XHRzZXR0aW5nRW51bS51bnNoaWZ0KGRhdGFFbGVtZW50LmRlZmF1bHRWYWx1ZSk7XG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zLnVuc2hpZnQoJycpO1xuXHRcdFx0ZW51bUl0ZW1MYWJlbHMudW5zaGlmdCgnJyk7XG5cdFx0XHRjcmVhdGVkRGVmYXVsdCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gVXNlIFN0cmluZyBjb25zdHJ1Y3RvciBpbiBjYXNlIG9mIG51bGwgb3IgdW5kZWZpbmVkIHZhbHVlc1xuXHRcdGNvbnN0IHN0cmluZ2lmaWVkRGVmYXVsdFZhbHVlID0gZXNjYXBlSW52aXNpYmxlQ2hhcnMoU3RyaW5nKGRhdGFFbGVtZW50LmRlZmF1bHRWYWx1ZSkpO1xuXHRcdGNvbnN0IGRpc3BsYXlPcHRpb25zOiBJU2VsZWN0T3B0aW9uSXRlbVtdID0gc2V0dGluZ0VudW1cblx0XHRcdC5tYXAoU3RyaW5nKVxuXHRcdFx0Lm1hcChlc2NhcGVJbnZpc2libGVDaGFycylcblx0XHRcdC5tYXAoKGRhdGEsIGluZGV4KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gKGVudW1EZXNjcmlwdGlvbnNbaW5kZXhdICYmIChlbnVtRGVzY3JpcHRpb25zQXJlTWFya2Rvd24gPyBmaXhTZXR0aW5nTGlua3MoZW51bURlc2NyaXB0aW9uc1tpbmRleF0sIGZhbHNlKSA6IGVudW1EZXNjcmlwdGlvbnNbaW5kZXhdKSk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dGV4dDogZW51bUl0ZW1MYWJlbHNbaW5kZXhdID8gZW51bUl0ZW1MYWJlbHNbaW5kZXhdIDogZGF0YSxcblx0XHRcdFx0XHRkZXRhaWw6IGVudW1JdGVtTGFiZWxzW2luZGV4XSA/IGRhdGEgOiAnJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdFx0XHRkZXNjcmlwdGlvbklzTWFya2Rvd246IGVudW1EZXNjcmlwdGlvbnNBcmVNYXJrZG93bixcblx0XHRcdFx0XHRkZXNjcmlwdGlvbk1hcmtkb3duQWN0aW9uSGFuZGxlcjogKGNvbnRlbnQpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX29wZW5lclNlcnZpY2Uub3Blbihjb250ZW50KS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRkZWNvcmF0b3JSaWdodDogKCgoZGF0YSA9PT0gc3RyaW5naWZpZWREZWZhdWx0VmFsdWUpIHx8IChjcmVhdGVkRGVmYXVsdCAmJiBpbmRleCA9PT0gMCkpID8gbG9jYWxpemUoJ3NldHRpbmdzLkRlZmF1bHQnLCBcImRlZmF1bHRcIikgOiAnJylcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVNlbGVjdE9wdGlvbkl0ZW07XG5cdFx0XHR9KTtcblxuXHRcdHRlbXBsYXRlLnNlbGVjdEJveC5zZXRPcHRpb25zKGRpc3BsYXlPcHRpb25zKTtcblx0XHR0ZW1wbGF0ZS5zZWxlY3RCb3guc2V0QXJpYUxhYmVsKGRhdGFFbGVtZW50LnNldHRpbmcua2V5KTtcblx0XHR0ZW1wbGF0ZS5zZWxlY3RCb3guc2V0RW5hYmxlZCghZGF0YUVsZW1lbnQuaGFzUG9saWN5VmFsdWUgJiYgIWRhdGFFbGVtZW50LmlzQWdlbnRzV2luZG93UmVhZE9ubHkpO1xuXG5cdFx0bGV0IGlkeCA9IHNldHRpbmdFbnVtLmluZGV4T2YoZGF0YUVsZW1lbnQudmFsdWUpO1xuXHRcdGlmIChpZHggPT09IC0xKSB7XG5cdFx0XHRpZHggPSAwO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlLm9uQ2hhbmdlID0gdW5kZWZpbmVkO1xuXHRcdHRlbXBsYXRlLnNlbGVjdEJveC5zZWxlY3QoaWR4KTtcblx0XHR0ZW1wbGF0ZS5vbkNoYW5nZSA9IChpZHgpID0+IHtcblx0XHRcdGlmIChjcmVhdGVkRGVmYXVsdCAmJiBpZHggPT09IDApIHtcblx0XHRcdFx0b25DaGFuZ2UoZGF0YUVsZW1lbnQuZGVmYXVsdFZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9uQ2hhbmdlKHNldHRpbmdFbnVtW2lkeF0pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0ZW1wbGF0ZS5lbnVtRGVzY3JpcHRpb25FbGVtZW50LmlubmVyVGV4dCA9ICcnO1xuXHR9XG59XG5cbmNvbnN0IHNldHRpbmdzTnVtYmVySW5wdXRCb3hTdHlsZXMgPSBnZXRJbnB1dEJveFN0eWxlKHtcblx0aW5wdXRCYWNrZ3JvdW5kOiBzZXR0aW5nc051bWJlcklucHV0QmFja2dyb3VuZCxcblx0aW5wdXRGb3JlZ3JvdW5kOiBzZXR0aW5nc051bWJlcklucHV0Rm9yZWdyb3VuZCxcblx0aW5wdXRCb3JkZXI6IHNldHRpbmdzTnVtYmVySW5wdXRCb3JkZXJcbn0pO1xuXG5jbGFzcyBTZXR0aW5nTnVtYmVyUmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdFNldHRpbmdSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyLCBJU2V0dGluZ051bWJlckl0ZW1UZW1wbGF0ZT4ge1xuXHR0ZW1wbGF0ZUlkID0gU0VUVElOR1NfTlVNQkVSX1RFTVBMQVRFX0lEO1xuXG5cdHJlbmRlclRlbXBsYXRlKF9jb250YWluZXI6IEhUTUxFbGVtZW50KTogSVNldHRpbmdOdW1iZXJJdGVtVGVtcGxhdGUge1xuXHRcdGNvbnN0IGNvbW1vbiA9IHN1cGVyLnJlbmRlckNvbW1vblRlbXBsYXRlKG51bGwsIF9jb250YWluZXIsICdudW1iZXInKTtcblx0XHRjb25zdCB2YWxpZGF0aW9uRXJyb3JNZXNzYWdlRWxlbWVudCA9IERPTS5hcHBlbmQoY29tbW9uLmNvbnRhaW5lckVsZW1lbnQsICQoJy5zZXR0aW5nLWl0ZW0tdmFsaWRhdGlvbi1tZXNzYWdlJykpO1xuXG5cdFx0Y29uc3QgaW5wdXRCb3ggPSBuZXcgSW5wdXRCb3goY29tbW9uLmNvbnRyb2xFbGVtZW50LCB0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UsIHsgdHlwZTogJ251bWJlcicsIGlucHV0Qm94U3R5bGVzOiBzZXR0aW5nc051bWJlcklucHV0Qm94U3R5bGVzIH0pO1xuXHRcdGNvbW1vbi50b0Rpc3Bvc2UuYWRkKGlucHV0Qm94KTtcblx0XHRjb21tb24udG9EaXNwb3NlLmFkZChcblx0XHRcdGlucHV0Qm94Lm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHR0ZW1wbGF0ZS5vbkNoYW5nZT8uKGUpO1xuXHRcdFx0fSkpO1xuXHRcdGNvbW1vbi50b0Rpc3Bvc2UuYWRkKGlucHV0Qm94KTtcblx0XHRpbnB1dEJveC5pbnB1dEVsZW1lbnQuY2xhc3NMaXN0LmFkZChBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5DT05UUk9MX0NMQVNTKTtcblx0XHRpbnB1dEJveC5pbnB1dEVsZW1lbnQudGFiSW5kZXggPSAwO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGU6IElTZXR0aW5nTnVtYmVySXRlbVRlbXBsYXRlID0ge1xuXHRcdFx0Li4uY29tbW9uLFxuXHRcdFx0aW5wdXRCb3gsXG5cdFx0XHR2YWxpZGF0aW9uRXJyb3JNZXNzYWdlRWxlbWVudFxuXHRcdH07XG5cblx0XHR0aGlzLmFkZFNldHRpbmdFbGVtZW50Rm9jdXNIYW5kbGVyKHRlbXBsYXRlKTtcblxuXHRcdHJldHVybiB0ZW1wbGF0ZTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBuZXZlcj4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVNldHRpbmdOdW1iZXJJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJTZXR0aW5nRWxlbWVudChlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdHByb3RlY3RlZCByZW5kZXJWYWx1ZShkYXRhRWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIHRlbXBsYXRlOiBJU2V0dGluZ051bWJlckl0ZW1UZW1wbGF0ZSwgb25DaGFuZ2U6ICh2YWx1ZTogbnVtYmVyIHwgbnVsbCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IG51bVBhcnNlRm4gPSAoZGF0YUVsZW1lbnQudmFsdWVUeXBlID09PSAnaW50ZWdlcicgfHwgZGF0YUVsZW1lbnQudmFsdWVUeXBlID09PSAnbnVsbGFibGUtaW50ZWdlcicpXG5cdFx0XHQ/IHBhcnNlSW50IDogcGFyc2VGbG9hdDtcblxuXHRcdGNvbnN0IG51bGxOdW1QYXJzZUZuID0gKGRhdGFFbGVtZW50LnZhbHVlVHlwZSA9PT0gJ251bGxhYmxlLWludGVnZXInIHx8IGRhdGFFbGVtZW50LnZhbHVlVHlwZSA9PT0gJ251bGxhYmxlLW51bWJlcicpXG5cdFx0XHQ/ICgodjogc3RyaW5nKSA9PiB2ID09PSAnJyA/IG51bGwgOiBudW1QYXJzZUZuKHYpKSA6IG51bVBhcnNlRm47XG5cblx0XHR0ZW1wbGF0ZS5vbkNoYW5nZSA9IHVuZGVmaW5lZDtcblx0XHR0ZW1wbGF0ZS5pbnB1dEJveC52YWx1ZSA9IHR5cGVvZiBkYXRhRWxlbWVudC52YWx1ZSA9PT0gJ251bWJlcicgP1xuXHRcdFx0ZGF0YUVsZW1lbnQudmFsdWUudG9TdHJpbmcoKSA6ICcnO1xuXHRcdHRlbXBsYXRlLmlucHV0Qm94LnN0ZXAgPSBkYXRhRWxlbWVudC52YWx1ZVR5cGUuaW5jbHVkZXMoJ2ludGVnZXInKSA/ICcxJyA6ICdhbnknO1xuXHRcdHRlbXBsYXRlLmlucHV0Qm94LnNldEFyaWFMYWJlbChkYXRhRWxlbWVudC5zZXR0aW5nLmtleSk7XG5cdFx0dGVtcGxhdGUuaW5wdXRCb3guc2V0RW5hYmxlZCghZGF0YUVsZW1lbnQuaGFzUG9saWN5VmFsdWUgJiYgIWRhdGFFbGVtZW50LmlzQWdlbnRzV2luZG93UmVhZE9ubHkpO1xuXHRcdHRlbXBsYXRlLm9uQ2hhbmdlID0gdmFsdWUgPT4ge1xuXHRcdFx0aWYgKCFyZW5kZXJWYWxpZGF0aW9ucyhkYXRhRWxlbWVudCwgdGVtcGxhdGUsIGZhbHNlKSkge1xuXHRcdFx0XHRvbkNoYW5nZShudWxsTnVtUGFyc2VGbih2YWx1ZSkpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyZW5kZXJWYWxpZGF0aW9ucyhkYXRhRWxlbWVudCwgdGVtcGxhdGUsIHRydWUpO1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdCb29sUmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdFNldHRpbmdSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyLCBJU2V0dGluZ0Jvb2xJdGVtVGVtcGxhdGU+IHtcblx0dGVtcGxhdGVJZCA9IFNFVFRJTkdTX0JPT0xfVEVNUExBVEVfSUQ7XG5cblx0cmVuZGVyVGVtcGxhdGUoX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2V0dGluZ0Jvb2xJdGVtVGVtcGxhdGUge1xuXHRcdF9jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc2V0dGluZy1pdGVtJyk7XG5cdFx0X2NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzZXR0aW5nLWl0ZW0tYm9vbCcpO1xuXG5cdFx0Y29uc3QgdG9EaXNwb3NlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gRE9NLmFwcGVuZChfY29udGFpbmVyLCAkKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLkNPTlRFTlRTX1NFTEVDVE9SKSk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3NldHRpbmdzLXJvdy1pbm5lci1jb250YWluZXInKTtcblxuXHRcdGNvbnN0IHRpdGxlRWxlbWVudCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2V0dGluZy1pdGVtLXRpdGxlJykpO1xuXHRcdGNvbnN0IGNhdGVnb3J5RWxlbWVudCA9IERPTS5hcHBlbmQodGl0bGVFbGVtZW50LCAkKCdzcGFuLnNldHRpbmctaXRlbS1jYXRlZ29yeScpKTtcblx0XHRjb25zdCBsYWJlbEVsZW1lbnRDb250YWluZXIgPSBET00uYXBwZW5kKHRpdGxlRWxlbWVudCwgJCgnc3Bhbi5zZXR0aW5nLWl0ZW0tbGFiZWwnKSk7XG5cdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gdG9EaXNwb3NlLmFkZChuZXcgU2ltcGxlSWNvbkxhYmVsKGxhYmVsRWxlbWVudENvbnRhaW5lcikpO1xuXHRcdGNvbnN0IGluZGljYXRvcnNMYWJlbCA9IHRvRGlzcG9zZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ3NUcmVlSW5kaWNhdG9yc0xhYmVsLCB0aXRsZUVsZW1lbnQpKTtcblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uQW5kVmFsdWVFbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZXR0aW5nLWl0ZW0tdmFsdWUtZGVzY3JpcHRpb24nKSk7XG5cdFx0Y29uc3QgY29udHJvbEVsZW1lbnQgPSBET00uYXBwZW5kKGRlc2NyaXB0aW9uQW5kVmFsdWVFbGVtZW50LCAkKCcuc2V0dGluZy1pdGVtLWJvb2wtY29udHJvbCcpKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbkVsZW1lbnQgPSBET00uYXBwZW5kKGRlc2NyaXB0aW9uQW5kVmFsdWVFbGVtZW50LCAkKCcuc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJykpO1xuXHRcdGNvbnN0IG1vZGlmaWVkSW5kaWNhdG9yRWxlbWVudCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2V0dGluZy1pdGVtLW1vZGlmaWVkLWluZGljYXRvcicpKTtcblx0XHR0b0Rpc3Bvc2UuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcihtb2RpZmllZEluZGljYXRvckVsZW1lbnQsIHtcblx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplKCdtb2RpZmllZCcsIFwiVGhlIHNldHRpbmcgaGFzIGJlZW4gY29uZmlndXJlZCBpbiB0aGUgY3VycmVudCBzY29wZS5cIilcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkZXByZWNhdGlvbldhcm5pbmdFbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZXR0aW5nLWl0ZW0tZGVwcmVjYXRpb24tbWVzc2FnZScpKTtcblxuXHRcdGNvbnN0IGNoZWNrYm94ID0gbmV3IFRvZ2dsZSh7IGljb246IENvZGljb24uY2hlY2ssIGFjdGlvbkNsYXNzTmFtZTogJ3NldHRpbmctdmFsdWUtY2hlY2tib3gnLCBpc0NoZWNrZWQ6IHRydWUsIHRpdGxlOiAnJywgLi4udW50aGVtZWRUb2dnbGVTdHlsZXMgfSk7XG5cdFx0Y29udHJvbEVsZW1lbnQuYXBwZW5kQ2hpbGQoY2hlY2tib3guZG9tTm9kZSk7XG5cdFx0dG9EaXNwb3NlLmFkZChjaGVja2JveCk7XG5cdFx0dG9EaXNwb3NlLmFkZChjaGVja2JveC5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0ZW1wbGF0ZS5vbkNoYW5nZSEoY2hlY2tib3guY2hlY2tlZCk7XG5cdFx0fSkpO1xuXG5cdFx0Y2hlY2tib3guZG9tTm9kZS5jbGFzc0xpc3QuYWRkKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLkNPTlRST0xfQ0xBU1MpO1xuXHRcdGNvbnN0IHRvb2xiYXJDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNldHRpbmctdG9vbGJhci1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgdG9vbGJhciA9IHRoaXMucmVuZGVyU2V0dGluZ1Rvb2xiYXIodG9vbGJhckNvbnRhaW5lcik7XG5cdFx0dG9EaXNwb3NlLmFkZCh0b29sYmFyKTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlOiBJU2V0dGluZ0Jvb2xJdGVtVGVtcGxhdGUgPSB7XG5cdFx0XHR0b0Rpc3Bvc2UsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXM6IHRvRGlzcG9zZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKSxcblxuXHRcdFx0Y29udGFpbmVyRWxlbWVudDogY29udGFpbmVyLFxuXHRcdFx0Y2F0ZWdvcnlFbGVtZW50LFxuXHRcdFx0bGFiZWxFbGVtZW50LFxuXHRcdFx0Y29udHJvbEVsZW1lbnQsXG5cdFx0XHRjaGVja2JveCxcblx0XHRcdGRlc2NyaXB0aW9uRWxlbWVudCxcblx0XHRcdGRlcHJlY2F0aW9uV2FybmluZ0VsZW1lbnQsXG5cdFx0XHRpbmRpY2F0b3JzTGFiZWwsXG5cdFx0XHR0b29sYmFyXG5cdFx0fTtcblxuXHRcdHRoaXMuYWRkU2V0dGluZ0VsZW1lbnRGb2N1c0hhbmRsZXIodGVtcGxhdGUpO1xuXG5cdFx0Ly8gUHJldmVudCBjbGlja3MgZnJvbSBiZWluZyBoYW5kbGVkIGJ5IGxpc3Rcblx0XHR0b0Rpc3Bvc2UuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY29udHJvbEVsZW1lbnQsICdtb3VzZWRvd24nLCAoZTogSU1vdXNlRXZlbnQpID0+IGUuc3RvcFByb3BhZ2F0aW9uKCkpKTtcblx0XHR0b0Rpc3Bvc2UuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGl0bGVFbGVtZW50LCBET00uRXZlbnRUeXBlLk1PVVNFX0VOVEVSLCBlID0+IGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb3VzZW92ZXInKSkpO1xuXHRcdHRvRGlzcG9zZS5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aXRsZUVsZW1lbnQsIERPTS5FdmVudFR5cGUuTU9VU0VfTEVBVkUsIGUgPT4gY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ21vdXNlb3ZlcicpKSk7XG5cblx0XHRyZXR1cm4gdGVtcGxhdGU7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXI+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTZXR0aW5nQm9vbEl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlclNldHRpbmdFbGVtZW50KGVsZW1lbnQsIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlclZhbHVlKGRhdGFFbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgdGVtcGxhdGU6IElTZXR0aW5nQm9vbEl0ZW1UZW1wbGF0ZSwgb25DaGFuZ2U6ICh2YWx1ZTogYm9vbGVhbikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLm9uQ2hhbmdlID0gdW5kZWZpbmVkO1xuXHRcdHRlbXBsYXRlLmNoZWNrYm94LmNoZWNrZWQgPSBkYXRhRWxlbWVudC52YWx1ZTtcblx0XHRpZiAoZGF0YUVsZW1lbnQuaGFzUG9saWN5VmFsdWUgfHwgZGF0YUVsZW1lbnQuaXNBZ2VudHNXaW5kb3dSZWFkT25seSkge1xuXHRcdFx0dGVtcGxhdGUuY2hlY2tib3guZGlzYWJsZSgpO1xuXHRcdFx0dGVtcGxhdGUuZGVzY3JpcHRpb25FbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlLmNoZWNrYm94LmVuYWJsZSgpO1xuXHRcdFx0dGVtcGxhdGUuZGVzY3JpcHRpb25FbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2Rpc2FibGVkJyk7XG5cblx0XHRcdC8vIE5lZWQgdG8gbGlzdGVuIGZvciBtb3VzZSBjbGlja3Mgb24gZGVzY3JpcHRpb24gYW5kIHRvZ2dsZSBjaGVja2JveCAtIHVzZSB0YXJnZXQgSUQgZm9yIHNhZmV0eVxuXHRcdFx0Ly8gQWxzbyBoYXZlIHRvIGlnbm9yZSBlbWJlZGRlZCBsaW5rcyAtIHVzZSBjbG9zZXN0KCdhJykgdG8gaGFuZGxlIGNsaWNrcyBvbiBjaGlsZCBlbGVtZW50cyBvZiBsaW5rcyAoZS5nLiBTVkcgaWNvbnMgaW5zaWRlIDxhPiB0YWdzKVxuXHRcdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRlbXBsYXRlLmRlc2NyaXB0aW9uRWxlbWVudCwgRE9NLkV2ZW50VHlwZS5NT1VTRV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRFbGVtZW50OiBFbGVtZW50IHwgbnVsbCA9IGUudGFyZ2V0IGluc3RhbmNlb2YgRWxlbWVudCA/IGUudGFyZ2V0IDogbnVsbDtcblxuXHRcdFx0XHQvLyBUb2dnbGUgdGFyZ2V0IGNoZWNrYm94XG5cdFx0XHRcdGlmICghdGFyZ2V0RWxlbWVudCB8fCAhdGFyZ2V0RWxlbWVudC5jbG9zZXN0KCdhJykpIHtcblx0XHRcdFx0XHR0ZW1wbGF0ZS5jaGVja2JveC5jaGVja2VkID0gIXRlbXBsYXRlLmNoZWNrYm94LmNoZWNrZWQ7XG5cdFx0XHRcdFx0dGVtcGxhdGUub25DaGFuZ2UhKHRlbXBsYXRlLmNoZWNrYm94LmNoZWNrZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdERPTS5FdmVudEhlbHBlci5zdG9wKGUpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0ZW1wbGF0ZS5jaGVja2JveC5zZXRUaXRsZShkYXRhRWxlbWVudC5zZXR0aW5nLmtleSk7XG5cdFx0dGVtcGxhdGUub25DaGFuZ2UgPSBvbkNoYW5nZTtcblx0fVxufVxuXG50eXBlIE1hbmFnZUV4dGVuc2lvbkNsaWNrVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24gPSB7XG5cdGV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGV4dGVuc2lvbiB0aGUgdXNlciB3ZW50IHRvIG1hbmFnZS4nIH07XG5cdG93bmVyOiAncnpoYW8yNzEnO1xuXHRjb21tZW50OiAnRXZlbnQgdXNlZCB0byBnYWluIGluc2lnaHRzIGludG8gd2hlbiB1c2VycyBpbnRlcmFjdCB3aXRoIGFuIGV4dGVuc2lvbiBtYW5hZ2VtZW50IHNldHRpbmcnO1xufTtcblxuY2xhc3MgU2V0dGluZ3NFeHRlbnNpb25Ub2dnbGVSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXIsIElTZXR0aW5nRXh0ZW5zaW9uVG9nZ2xlSXRlbVRlbXBsYXRlPiB7XG5cdHRlbXBsYXRlSWQgPSBTRVRUSU5HU19FWFRFTlNJT05fVE9HR0xFX1RFTVBMQVRFX0lEO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzbWlzc0V4dGVuc2lvblNldHRpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZERpc21pc3NFeHRlbnNpb25TZXR0aW5nID0gdGhpcy5fb25EaWREaXNtaXNzRXh0ZW5zaW9uU2V0dGluZy5ldmVudDtcblxuXHRyZW5kZXJUZW1wbGF0ZShfY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZXR0aW5nRXh0ZW5zaW9uVG9nZ2xlSXRlbVRlbXBsYXRlIHtcblx0XHRjb25zdCBjb21tb24gPSBzdXBlci5yZW5kZXJDb21tb25UZW1wbGF0ZShudWxsLCBfY29udGFpbmVyLCAnZXh0ZW5zaW9uLXRvZ2dsZScpO1xuXG5cdFx0Y29uc3QgYWN0aW9uQnV0dG9uID0gbmV3IEJ1dHRvbihjb21tb24uY29udGFpbmVyRWxlbWVudCwge1xuXHRcdFx0dGl0bGU6IGZhbHNlLFxuXHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlc1xuXHRcdH0pO1xuXHRcdGFjdGlvbkJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3NldHRpbmctaXRlbS1leHRlbnNpb24tdG9nZ2xlLWJ1dHRvbicpO1xuXHRcdGFjdGlvbkJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdzaG93RXh0ZW5zaW9uJywgXCJTaG93IEV4dGVuc2lvblwiKTtcblxuXHRcdGNvbnN0IGRpc21pc3NCdXR0b24gPSBuZXcgQnV0dG9uKGNvbW1vbi5jb250YWluZXJFbGVtZW50LCB7XG5cdFx0XHR0aXRsZTogZmFsc2UsXG5cdFx0XHRzZWNvbmRhcnk6IHRydWUsXG5cdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzXG5cdFx0fSk7XG5cdFx0ZGlzbWlzc0J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3NldHRpbmctaXRlbS1leHRlbnNpb24tZGlzbWlzcy1idXR0b24nKTtcblx0XHRkaXNtaXNzQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2Rpc21pc3MnLCBcIkRpc21pc3NcIik7XG5cblx0XHRjb25zdCB0ZW1wbGF0ZTogSVNldHRpbmdFeHRlbnNpb25Ub2dnbGVJdGVtVGVtcGxhdGUgPSB7XG5cdFx0XHQuLi5jb21tb24sXG5cdFx0XHRhY3Rpb25CdXR0b24sXG5cdFx0XHRkaXNtaXNzQnV0dG9uXG5cdFx0fTtcblxuXHRcdHRoaXMuYWRkU2V0dGluZ0VsZW1lbnRGb2N1c0hhbmRsZXIodGVtcGxhdGUpO1xuXG5cdFx0cmV0dXJuIHRlbXBsYXRlO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJU2V0dGluZ0V4dGVuc2lvblRvZ2dsZUl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlclNldHRpbmdFbGVtZW50KGVsZW1lbnQsIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlclZhbHVlKGRhdGFFbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgdGVtcGxhdGU6IElTZXR0aW5nRXh0ZW5zaW9uVG9nZ2xlSXRlbVRlbXBsYXRlLCBvbkNoYW5nZTogKF86IHVuZGVmaW5lZCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBkYXRhRWxlbWVudC5zZXR0aW5nLmRpc3BsYXlFeHRlbnNpb25JZCE7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0ZW1wbGF0ZS5hY3Rpb25CdXR0b24ub25EaWRDbGljayhhc3luYyAoKSA9PiB7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8eyBleHRlbnNpb25JZDogU3RyaW5nIH0sIE1hbmFnZUV4dGVuc2lvbkNsaWNrVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24+KCdNYW5hZ2VFeHRlbnNpb25DbGljaycsIHsgZXh0ZW5zaW9uSWQgfSk7XG5cdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnZXh0ZW5zaW9uLm9wZW4nLCBleHRlbnNpb25JZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0ZW1wbGF0ZS5kaXNtaXNzQnV0dG9uLm9uRGlkQ2xpY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHsgZXh0ZW5zaW9uSWQ6IFN0cmluZyB9LCBNYW5hZ2VFeHRlbnNpb25DbGlja1RlbGVtZXRyeUNsYXNzaWZpY2F0aW9uPignRGlzbWlzc0V4dGVuc2lvbkNsaWNrJywgeyBleHRlbnNpb25JZCB9KTtcblx0XHRcdHRoaXMuX29uRGlkRGlzbWlzc0V4dGVuc2lvblNldHRpbmcuZmlyZShleHRlbnNpb25JZCk7XG5cdFx0fSkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nVHJlZVJlbmRlcmVycyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyZWFkb25seSBvbkRpZENsaWNrT3ZlcnJpZGVFbGVtZW50OiBFdmVudDxJU2V0dGluZ092ZXJyaWRlQ2xpY2tFdmVudD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZXR0aW5nID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNldHRpbmdDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2V0dGluZzogRXZlbnQ8SVNldHRpbmdDaGFuZ2VFdmVudD47XG5cblx0cmVhZG9ubHkgb25EaWREaXNtaXNzRXh0ZW5zaW9uU2V0dGluZzogRXZlbnQ8c3RyaW5nPjtcblxuXHRyZWFkb25seSBvbkRpZE9wZW5TZXR0aW5nczogRXZlbnQ8c3RyaW5nPjtcblxuXHRyZWFkb25seSBvbkRpZENsaWNrU2V0dGluZ0xpbms6IEV2ZW50PElTZXR0aW5nTGlua0NsaWNrRXZlbnQ+O1xuXG5cdHJlYWRvbmx5IG9uRGlkRm9jdXNTZXR0aW5nOiBFdmVudDxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudD47XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXR0aW5nSGVpZ2h0OiBFdmVudDxIZWlnaHRDaGFuZ2VQYXJhbXM+O1xuXG5cdHJlYWRvbmx5IG9uQXBwbHlGaWx0ZXI6IEV2ZW50PHN0cmluZz47XG5cblx0cmVhZG9ubHkgYWxsUmVuZGVyZXJzOiBJVHJlZVJlbmRlcmVyPFNldHRpbmdzVHJlZUVsZW1lbnQsIG5ldmVyLCBhbnk+W107XG5cblx0cHJpdmF0ZSByZWFkb25seSBzZXR0aW5nQWN0aW9uczogSUFjdGlvbltdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnNldHRpbmdBY3Rpb25zID0gW1xuXHRcdFx0bmV3IEFjdGlvbignc2V0dGluZ3MucmVzZXRTZXR0aW5nJywgbG9jYWxpemUoJ3Jlc2V0U2V0dGluZ0xhYmVsJywgXCJSZXNldCBTZXR0aW5nXCIpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgYXN5bmMgY29udGV4dCA9PiB7XG5cdFx0XHRcdGlmIChjb250ZXh0IGluc3RhbmNlb2YgU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpIHtcblx0XHRcdFx0XHRpZiAoIWNvbnRleHQuaXNVbnRydXN0ZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2V0dGluZy5maXJlKHtcblx0XHRcdFx0XHRcdFx0a2V5OiBjb250ZXh0LnNldHRpbmcua2V5LFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiBjb250ZXh0LnNldHRpbmcudHlwZSBhcyBTZXR0aW5nVmFsdWVUeXBlLFxuXHRcdFx0XHRcdFx0XHRtYW51YWxSZXNldDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0c2NvcGU6IGNvbnRleHQuc2V0dGluZy5zY29wZVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHRcdG5ldyBTZXBhcmF0b3IoKSxcblx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvcHlTZXR0aW5nSWRBY3Rpb24pLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29weVNldHRpbmdBc0pTT05BY3Rpb24pLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29weVNldHRpbmdBc1VSTEFjdGlvbiksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdGlvbkZhY3RvcnkgPSAoc2V0dGluZzogSVNldHRpbmcsIHNldHRpbmdUYXJnZXQ6IFNldHRpbmdzVGFyZ2V0KSA9PiB0aGlzLmdldEFjdGlvbnNGb3JTZXR0aW5nKHNldHRpbmcsIHNldHRpbmdUYXJnZXQpO1xuXHRcdGNvbnN0IGVtcHR5QWN0aW9uRmFjdG9yeSA9IChfOiBJU2V0dGluZykgPT4gW107XG5cdFx0Y29uc3QgZXh0ZW5zaW9uUmVuZGVyZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nc0V4dGVuc2lvblRvZ2dsZVJlbmRlcmVyLCBbXSwgZW1wdHlBY3Rpb25GYWN0b3J5KTtcblx0XHRjb25zdCBzZXR0aW5nUmVuZGVyZXJzID0gW1xuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ0Jvb2xSZW5kZXJlciwgdGhpcy5zZXR0aW5nQWN0aW9ucywgYWN0aW9uRmFjdG9yeSksXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nTnVtYmVyUmVuZGVyZXIsIHRoaXMuc2V0dGluZ0FjdGlvbnMsIGFjdGlvbkZhY3RvcnkpLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ0FycmF5UmVuZGVyZXIsIHRoaXMuc2V0dGluZ0FjdGlvbnMsIGFjdGlvbkZhY3RvcnkpLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ0NvbXBsZXhSZW5kZXJlciwgdGhpcy5zZXR0aW5nQWN0aW9ucywgYWN0aW9uRmFjdG9yeSksXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nQ29tcGxleE9iamVjdFJlbmRlcmVyLCB0aGlzLnNldHRpbmdBY3Rpb25zLCBhY3Rpb25GYWN0b3J5KSxcblx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdUZXh0UmVuZGVyZXIsIHRoaXMuc2V0dGluZ0FjdGlvbnMsIGFjdGlvbkZhY3RvcnkpLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ011bHRpbGluZVRleHRSZW5kZXJlciwgdGhpcy5zZXR0aW5nQWN0aW9ucywgYWN0aW9uRmFjdG9yeSksXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nRXhjbHVkZVJlbmRlcmVyLCB0aGlzLnNldHRpbmdBY3Rpb25zLCBhY3Rpb25GYWN0b3J5KSxcblx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdJbmNsdWRlUmVuZGVyZXIsIHRoaXMuc2V0dGluZ0FjdGlvbnMsIGFjdGlvbkZhY3RvcnkpLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ0VudW1SZW5kZXJlciwgdGhpcy5zZXR0aW5nQWN0aW9ucywgYWN0aW9uRmFjdG9yeSksXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nT2JqZWN0UmVuZGVyZXIsIHRoaXMuc2V0dGluZ0FjdGlvbnMsIGFjdGlvbkZhY3RvcnkpLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ0Jvb2xPYmplY3RSZW5kZXJlciwgdGhpcy5zZXR0aW5nQWN0aW9ucywgYWN0aW9uRmFjdG9yeSksXG5cdFx0XHRleHRlbnNpb25SZW5kZXJlclxuXHRcdF07XG5cblx0XHR0aGlzLm9uRGlkQ2xpY2tPdmVycmlkZUVsZW1lbnQgPSBFdmVudC5hbnkoLi4uc2V0dGluZ1JlbmRlcmVycy5tYXAociA9PiByLm9uRGlkQ2xpY2tPdmVycmlkZUVsZW1lbnQpKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlU2V0dGluZyA9IEV2ZW50LmFueShcblx0XHRcdC4uLnNldHRpbmdSZW5kZXJlcnMubWFwKHIgPT4gci5vbkRpZENoYW5nZVNldHRpbmcpLFxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXR0aW5nLmV2ZW50XG5cdFx0KTtcblx0XHR0aGlzLm9uRGlkRGlzbWlzc0V4dGVuc2lvblNldHRpbmcgPSBleHRlbnNpb25SZW5kZXJlci5vbkRpZERpc21pc3NFeHRlbnNpb25TZXR0aW5nO1xuXHRcdHRoaXMub25EaWRPcGVuU2V0dGluZ3MgPSBFdmVudC5hbnkoLi4uc2V0dGluZ1JlbmRlcmVycy5tYXAociA9PiByLm9uRGlkT3BlblNldHRpbmdzKSk7XG5cdFx0dGhpcy5vbkRpZENsaWNrU2V0dGluZ0xpbmsgPSBFdmVudC5hbnkoLi4uc2V0dGluZ1JlbmRlcmVycy5tYXAociA9PiByLm9uRGlkQ2xpY2tTZXR0aW5nTGluaykpO1xuXHRcdHRoaXMub25EaWRGb2N1c1NldHRpbmcgPSBFdmVudC5hbnkoLi4uc2V0dGluZ1JlbmRlcmVycy5tYXAociA9PiByLm9uRGlkRm9jdXNTZXR0aW5nKSk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZVNldHRpbmdIZWlnaHQgPSBFdmVudC5hbnkoLi4uc2V0dGluZ1JlbmRlcmVycy5tYXAociA9PiByLm9uRGlkQ2hhbmdlU2V0dGluZ0hlaWdodCkpO1xuXHRcdHRoaXMub25BcHBseUZpbHRlciA9IEV2ZW50LmFueSguLi5zZXR0aW5nUmVuZGVyZXJzLm1hcChyID0+IHIub25BcHBseUZpbHRlcikpO1xuXG5cdFx0dGhpcy5hbGxSZW5kZXJlcnMgPSBbXG5cdFx0XHQuLi5zZXR0aW5nUmVuZGVyZXJzLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ0dyb3VwUmVuZGVyZXIpLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ05ld0V4dGVuc2lvbnNSZW5kZXJlciksXG5cdFx0XTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aW9uc0ZvclNldHRpbmcoc2V0dGluZzogSVNldHRpbmcsIHNldHRpbmdUYXJnZXQ6IFNldHRpbmdzVGFyZ2V0KTogSUFjdGlvbltdIHtcblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRpZiAoIShzZXR0aW5nLnNjb3BlICYmIEFQUExJQ0FUSU9OX1NDT1BFUy5pbmNsdWRlcyhzZXR0aW5nLnNjb3BlKSkgJiYgc2V0dGluZ1RhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2godGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQXBwbHlTZXR0aW5nVG9BbGxQcm9maWxlc0FjdGlvbiwgc2V0dGluZykpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkgJiYgIXNldHRpbmcuZGlzYWxsb3dTeW5jSWdub3JlKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2godGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3luY1NldHRpbmdBY3Rpb24sIHNldHRpbmcpKTtcblx0XHR9XG5cdFx0aWYgKGFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRhY3Rpb25zLnNwbGljZSgwLCAwLCBuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gYWN0aW9ucztcblx0fVxuXG5cdGNhbmNlbFN1Z2dlc3RlcnMoKSB7XG5cdFx0dGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLmhpZGVDb250ZXh0VmlldygpO1xuXHR9XG5cblx0c2hvd0NvbnRleHRNZW51KGVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBzZXR0aW5nRE9NRWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCB0b29sYmFyRWxlbWVudCA9IHNldHRpbmdET01FbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tdG9vbGJhcicpO1xuXHRcdGlmICh0b29sYmFyRWxlbWVudCkge1xuXHRcdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHRoaXMuc2V0dGluZ0FjdGlvbnMsXG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gPEhUTUxFbGVtZW50PnRvb2xiYXJFbGVtZW50LFxuXHRcdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gZWxlbWVudFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0U2V0dGluZ0RPTUVsZW1lbnRGb3JET01FbGVtZW50KGRvbUVsZW1lbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQgfCBudWxsIHtcblx0XHRjb25zdCBwYXJlbnQgPSBET00uZmluZFBhcmVudFdpdGhDbGFzcyhkb21FbGVtZW50LCBBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5DT05URU5UU19DTEFTUyk7XG5cdFx0aWYgKHBhcmVudCkge1xuXHRcdFx0cmV0dXJuIHBhcmVudDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGdldERPTUVsZW1lbnRzRm9yU2V0dGluZ0tleSh0cmVlQ29udGFpbmVyOiBIVE1MRWxlbWVudCwga2V5OiBzdHJpbmcpOiBOb2RlTGlzdE9mPEhUTUxFbGVtZW50PiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0cmV0dXJuIHRyZWVDb250YWluZXIucXVlcnlTZWxlY3RvckFsbChgWyR7QWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIuU0VUVElOR19LRVlfQVRUUn09XCIke2tleX1cIl1gKTtcblx0fVxuXG5cdGdldEtleUZvckRPTUVsZW1lbnRJblNldHRpbmcoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRjb25zdCBzZXR0aW5nRWxlbWVudCA9IHRoaXMuZ2V0U2V0dGluZ0RPTUVsZW1lbnRGb3JET01FbGVtZW50KGVsZW1lbnQpO1xuXHRcdHJldHVybiBzZXR0aW5nRWxlbWVudCAmJiBzZXR0aW5nRWxlbWVudC5nZXRBdHRyaWJ1dGUoQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIuU0VUVElOR19LRVlfQVRUUik7XG5cdH1cblxuXHRnZXRJZEZvckRPTUVsZW1lbnRJblNldHRpbmcoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRjb25zdCBzZXR0aW5nRWxlbWVudCA9IHRoaXMuZ2V0U2V0dGluZ0RPTUVsZW1lbnRGb3JET01FbGVtZW50KGVsZW1lbnQpO1xuXHRcdHJldHVybiBzZXR0aW5nRWxlbWVudCAmJiBzZXR0aW5nRWxlbWVudC5nZXRBdHRyaWJ1dGUoQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIuU0VUVElOR19JRF9BVFRSKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuc2V0dGluZ0FjdGlvbnMuZm9yRWFjaChhY3Rpb24gPT4ge1xuXHRcdFx0aWYgKGlzRGlzcG9zYWJsZShhY3Rpb24pKSB7XG5cdFx0XHRcdGFjdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5hbGxSZW5kZXJlcnMuZm9yRWFjaChyZW5kZXJlciA9PiB7XG5cdFx0XHRpZiAoaXNEaXNwb3NhYmxlKHJlbmRlcmVyKSkge1xuXHRcdFx0XHRyZW5kZXJlci5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuLyoqXG4gKiBWYWxpZGF0ZSBhbmQgcmVuZGVyIGFueSBlcnJvciBtZXNzYWdlLiBSZXR1cm5zIHRydWUgaWYgdGhlIHZhbHVlIGlzIGludmFsaWQuXG4gKi9cbmZ1bmN0aW9uIHJlbmRlclZhbGlkYXRpb25zKGRhdGFFbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgdGVtcGxhdGU6IElTZXR0aW5nVGV4dEl0ZW1UZW1wbGF0ZSwgY2FsbGVkT25TdGFydHVwOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdGlmIChkYXRhRWxlbWVudC5zZXR0aW5nLnZhbGlkYXRvcikge1xuXHRcdGNvbnN0IGVyck1zZyA9IGRhdGFFbGVtZW50LnNldHRpbmcudmFsaWRhdG9yKHRlbXBsYXRlLmlucHV0Qm94LnZhbHVlKTtcblx0XHRpZiAoZXJyTXNnKSB7XG5cdFx0XHR0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ludmFsaWQtaW5wdXQnKTtcblx0XHRcdHRlbXBsYXRlLnZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50LmlubmVyVGV4dCA9IGVyck1zZztcblx0XHRcdGNvbnN0IHZhbGlkYXRpb25FcnJvciA9IGxvY2FsaXplKCd2YWxpZGF0aW9uRXJyb3InLCBcIlZhbGlkYXRpb24gRXJyb3IuXCIpO1xuXHRcdFx0dGVtcGxhdGUuaW5wdXRCb3guaW5wdXRFbGVtZW50LnBhcmVudEVsZW1lbnQhLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIFt2YWxpZGF0aW9uRXJyb3IsIGVyck1zZ10uam9pbignICcpKTtcblx0XHRcdGlmICghY2FsbGVkT25TdGFydHVwKSB7IGFyaWEuc3RhdHVzKHZhbGlkYXRpb25FcnJvciArICcgJyArIGVyck1zZyk7IH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZS5pbnB1dEJveC5pbnB1dEVsZW1lbnQucGFyZW50RWxlbWVudCEucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG5cdFx0fVxuXHR9XG5cdHRlbXBsYXRlLmNvbnRhaW5lckVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnaW52YWxpZC1pbnB1dCcpO1xuXHRyZXR1cm4gZmFsc2U7XG59XG5cbi8qKlxuICogVmFsaWRhdGUgYW5kIHJlbmRlciBhbnkgZXJyb3IgbWVzc2FnZSBmb3IgYXJyYXlzLiBSZXR1cm5zIHRydWUgaWYgdGhlIHZhbHVlIGlzIGludmFsaWQuXG4gKi9cbmZ1bmN0aW9uIHJlbmRlckFycmF5VmFsaWRhdGlvbnMoXG5cdGRhdGFFbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCxcblx0dGVtcGxhdGU6IElTZXR0aW5nTGlzdEl0ZW1UZW1wbGF0ZSB8IElTZXR0aW5nT2JqZWN0SXRlbVRlbXBsYXRlLFxuXHR2YWx1ZTogc3RyaW5nW10gfCBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCxcblx0Y2FsbGVkT25TdGFydHVwOiBib29sZWFuXG4pOiBib29sZWFuIHtcblx0dGVtcGxhdGUuY29udGFpbmVyRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpbnZhbGlkLWlucHV0Jyk7XG5cdGlmIChkYXRhRWxlbWVudC5zZXR0aW5nLnZhbGlkYXRvcikge1xuXHRcdGNvbnN0IGVyck1zZyA9IGRhdGFFbGVtZW50LnNldHRpbmcudmFsaWRhdG9yKHZhbHVlKTtcblx0XHRpZiAoZXJyTXNnICYmIGVyck1zZyAhPT0gJycpIHtcblx0XHRcdHRlbXBsYXRlLmNvbnRhaW5lckVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaW52YWxpZC1pbnB1dCcpO1xuXHRcdFx0dGVtcGxhdGUudmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnQuaW5uZXJUZXh0ID0gZXJyTXNnO1xuXHRcdFx0Y29uc3QgdmFsaWRhdGlvbkVycm9yID0gbG9jYWxpemUoJ3ZhbGlkYXRpb25FcnJvcicsIFwiVmFsaWRhdGlvbiBFcnJvci5cIik7XG5cdFx0XHR0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIFtkYXRhRWxlbWVudC5zZXR0aW5nLmtleSwgdmFsaWRhdGlvbkVycm9yLCBlcnJNc2ddLmpvaW4oJyAnKSk7XG5cdFx0XHRpZiAoIWNhbGxlZE9uU3RhcnR1cCkgeyBhcmlhLnN0YXR1cyh2YWxpZGF0aW9uRXJyb3IgKyAnICcgKyBlcnJNc2cpOyB9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGUuY29udGFpbmVyRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBkYXRhRWxlbWVudC5zZXR0aW5nLmtleSk7XG5cdFx0XHR0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2ludmFsaWQtaW5wdXQnKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBjbGVhblJlbmRlcmVkTWFya2Rvd24oZWxlbWVudDogTm9kZSk6IHZvaWQge1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnQuY2hpbGROb2Rlcy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGNoaWxkID0gZWxlbWVudC5jaGlsZE5vZGVzLml0ZW0oaSk7XG5cblx0XHRjb25zdCB0YWdOYW1lID0gKDxFbGVtZW50PmNoaWxkKS50YWdOYW1lICYmICg8RWxlbWVudD5jaGlsZCkudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuXHRcdGlmICh0YWdOYW1lID09PSAnaW1nJykge1xuXHRcdFx0Y2hpbGQucmVtb3ZlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNsZWFuUmVuZGVyZWRNYXJrZG93bihjaGlsZCk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGZpeFNldHRpbmdMaW5rcyh0ZXh0OiBzdHJpbmcsIGxpbmtpZnkgPSB0cnVlKTogc3RyaW5nIHtcblx0cmV0dXJuIHRleHQucmVwbGFjZSgvYCMoW14jXFxzYF0rKSNgfCcjKFteI1xccyddKykjJy9nLCAobWF0Y2gsIGJhY2t0aWNrc0dyb3VwLCBxdW90ZXNHcm91cCkgPT4ge1xuXHRcdGNvbnN0IHNldHRpbmdLZXk6IHN0cmluZyA9IGJhY2t0aWNrc0dyb3VwID8/IHF1b3Rlc0dyb3VwO1xuXHRcdGNvbnN0IHRhcmdldERpc3BsYXlGb3JtYXQgPSBzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KHNldHRpbmdLZXkpO1xuXHRcdGNvbnN0IHRhcmdldE5hbWUgPSBgJHt0YXJnZXREaXNwbGF5Rm9ybWF0LmNhdGVnb3J5fTogJHt0YXJnZXREaXNwbGF5Rm9ybWF0LmxhYmVsfWA7XG5cdFx0cmV0dXJuIGxpbmtpZnkgP1xuXHRcdFx0YFske3RhcmdldE5hbWV9XSgjJHtzZXR0aW5nS2V5fSBcIiR7c2V0dGluZ0tleX1cIilgIDpcblx0XHRcdGBcIiR7dGFyZ2V0TmFtZX1cImA7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBlc2NhcGVJbnZpc2libGVDaGFycyhlbnVtVmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBlbnVtVmFsdWUgJiYgZW51bVZhbHVlXG5cdFx0LnJlcGxhY2UoL1xcbi9nLCAnXFxcXG4nKVxuXHRcdC5yZXBsYWNlKC9cXHIvZywgJ1xcXFxyJyk7XG59XG5cblxuZXhwb3J0IGNsYXNzIFNldHRpbmdzVHJlZUZpbHRlciBpbXBsZW1lbnRzIElUcmVlRmlsdGVyPFNldHRpbmdzVHJlZUVsZW1lbnQ+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSB2aWV3U3RhdGU6IElTZXR0aW5nc0VkaXRvclZpZXdTdGF0ZSxcblx0XHRwcml2YXRlIGlzRmlsdGVyaW5nR3JvdXBzOiBib29sZWFuLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGZpbHRlcihlbGVtZW50OiBTZXR0aW5nc1RyZWVFbGVtZW50LCBwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSk6IFRyZWVGaWx0ZXJSZXN1bHQ8dm9pZD4ge1xuXHRcdC8vIEZpbHRlciBkdXJpbmcgc2VhcmNoXG5cdFx0aWYgKHRoaXMudmlld1N0YXRlLmNhdGVnb3J5RmlsdGVyICYmIGVsZW1lbnQgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCkge1xuXHRcdFx0aWYgKCF0aGlzLnNldHRpbmdDb250YWluZWRJbkdyb3VwKGVsZW1lbnQuc2V0dGluZywgdGhpcy52aWV3U3RhdGUuY2F0ZWdvcnlGaWx0ZXIpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBOb24tdXNlciBzY29wZSBzZWxlY3RlZFxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQgJiYgdGhpcy52aWV3U3RhdGUuc2V0dGluZ3NUYXJnZXQgIT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCkge1xuXHRcdFx0Y29uc3QgaXNSZW1vdGUgPSAhIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0XHRcdGlmICghZWxlbWVudC5tYXRjaGVzU2NvcGUodGhpcy52aWV3U3RhdGUuc2V0dGluZ3NUYXJnZXQsIGlzUmVtb3RlKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gR3JvdXAgd2l0aCBubyB2aXNpYmxlIGNoaWxkcmVuXG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQpIHtcblx0XHRcdC8vIFdoZW4gZmlsdGVyaW5nIHRvIGEgc3BlY2lmaWMgY2F0ZWdvcnksIG9ubHkgc2hvdyB0aGF0IGNhdGVnb3J5IGFuZCBpdHMgZGVzY2VuZGFudHNcblx0XHRcdGlmICh0aGlzLmlzRmlsdGVyaW5nR3JvdXBzICYmIHRoaXMudmlld1N0YXRlLmNhdGVnb3J5RmlsdGVyKSB7XG5cdFx0XHRcdGlmICghdGhpcy5ncm91cElzUmVsYXRlZFRvQ2F0ZWdvcnkoZWxlbWVudCwgdGhpcy52aWV3U3RhdGUuY2F0ZWdvcnlGaWx0ZXIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEZvciBncm91cHMgcmVsYXRlZCB0byB0aGUgY2F0ZWdvcnksIHNraXAgdGhlIGNvdW50IGNoZWNrIGFuZCByZWN1cnNlXG5cdFx0XHRcdC8vIHRvIGxldCBjaGlsZCBzZXR0aW5ncyBiZSBmaWx0ZXJlZFxuXHRcdFx0XHRyZXR1cm4gVHJlZVZpc2liaWxpdHkuUmVjdXJzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHR5cGVvZiBlbGVtZW50LmNvdW50ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRyZXR1cm4gZWxlbWVudC5jb3VudCA+IDA7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlO1xuXHRcdH1cblxuXHRcdC8vIEZpbHRlcmVkIFwibmV3IGV4dGVuc2lvbnNcIiBidXR0b25cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZU5ld0V4dGVuc2lvbnNFbGVtZW50KSB7XG5cdFx0XHRpZiAodGhpcy52aWV3U3RhdGUudGFnRmlsdGVycz8uc2l6ZSB8fCB0aGlzLnZpZXdTdGF0ZS5jYXRlZ29yeUZpbHRlcikge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHNldHRpbmdDb250YWluZWRJbkdyb3VwKHNldHRpbmc6IElTZXR0aW5nLCBncm91cDogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGdyb3VwLmNoaWxkcmVuLnNvbWUoY2hpbGQgPT4ge1xuXHRcdFx0aWYgKGNoaWxkIGluc3RhbmNlb2YgU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNldHRpbmdDb250YWluZWRJbkdyb3VwKHNldHRpbmcsIGNoaWxkKTtcblx0XHRcdH0gZWxzZSBpZiAoY2hpbGQgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCkge1xuXHRcdFx0XHRyZXR1cm4gY2hpbGQuc2V0dGluZy5rZXkgPT09IHNldHRpbmcua2V5O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyBpZiBhIGdyb3VwIGlzIHJlbGF0ZWQgdG8gdGhlIGZpbHRlcmVkIGNhdGVnb3J5LlxuXHQgKiBBIGdyb3VwIGlzIHJlbGF0ZWQgaWYgaXQncyB0aGUgY2F0ZWdvcnkgaXRzZWxmLCBhIGRlc2NlbmRhbnQgb2YgaXQsIG9yIGFuIGFuY2VzdG9yIG9mIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBncm91cElzUmVsYXRlZFRvQ2F0ZWdvcnkoZ3JvdXA6IFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCwgY2F0ZWdvcnk6IFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdC8vIENoZWNrIGlmIHRoaXMgZ3JvdXAgaXMgdGhlIGNhdGVnb3J5IGl0c2VsZlxuXHRcdGlmIChncm91cC5pZCA9PT0gY2F0ZWdvcnkuaWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoaXMgZ3JvdXAgaXMgYSBkZXNjZW5kYW50IG9mIHRoZSBjYXRlZ29yeVxuXHRcdGxldCBwYXJlbnQgPSBncm91cC5wYXJlbnQ7XG5cdFx0d2hpbGUgKHBhcmVudCkge1xuXHRcdFx0aWYgKHBhcmVudC5pZCA9PT0gY2F0ZWdvcnkuaWQpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRwYXJlbnQgPSBwYXJlbnQucGFyZW50O1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoaXMgZ3JvdXAgaXMgYW4gYW5jZXN0b3Igb2YgdGhlIGNhdGVnb3J5XG5cdFx0bGV0IGNhdGVnb3J5UGFyZW50ID0gY2F0ZWdvcnkucGFyZW50O1xuXHRcdHdoaWxlIChjYXRlZ29yeVBhcmVudCkge1xuXHRcdFx0aWYgKGNhdGVnb3J5UGFyZW50LmlkID09PSBncm91cC5pZCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNhdGVnb3J5UGFyZW50ID0gY2F0ZWdvcnlQYXJlbnQucGFyZW50O1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5jbGFzcyBTZXR0aW5nc1RyZWVEZWxlZ2F0ZSBleHRlbmRzIENhY2hlZExpc3RWaXJ0dWFsRGVsZWdhdGU8U2V0dGluZ3NUcmVlR3JvdXBDaGlsZD4ge1xuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50IHwgU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQgfCBTZXR0aW5nc1RyZWVOZXdFeHRlbnNpb25zRWxlbWVudCk6IHN0cmluZyB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBTRVRUSU5HU19FTEVNRU5UX1RFTVBMQVRFX0lEO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpIHtcblx0XHRcdGlmIChlbGVtZW50LnZhbHVlVHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5FeHRlbnNpb25Ub2dnbGUpIHtcblx0XHRcdFx0cmV0dXJuIFNFVFRJTkdTX0VYVEVOU0lPTl9UT0dHTEVfVEVNUExBVEVfSUQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGludmFsaWRUeXBlRXJyb3IgPSBlbGVtZW50LmlzQ29uZmlndXJlZCAmJiBnZXRJbnZhbGlkVHlwZUVycm9yKGVsZW1lbnQudmFsdWUsIGVsZW1lbnQuc2V0dGluZy50eXBlKTtcblx0XHRcdGlmIChpbnZhbGlkVHlwZUVycm9yKSB7XG5cdFx0XHRcdHJldHVybiBTRVRUSU5HU19DT01QTEVYX1RFTVBMQVRFX0lEO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWxlbWVudC52YWx1ZVR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuQm9vbGVhbikge1xuXHRcdFx0XHRyZXR1cm4gU0VUVElOR1NfQk9PTF9URU1QTEFURV9JRDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVsZW1lbnQudmFsdWVUeXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLkludGVnZXIgfHxcblx0XHRcdFx0ZWxlbWVudC52YWx1ZVR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuTnVtYmVyIHx8XG5cdFx0XHRcdGVsZW1lbnQudmFsdWVUeXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLk51bGxhYmxlSW50ZWdlciB8fFxuXHRcdFx0XHRlbGVtZW50LnZhbHVlVHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5OdWxsYWJsZU51bWJlcikge1xuXHRcdFx0XHRyZXR1cm4gU0VUVElOR1NfTlVNQkVSX1RFTVBMQVRFX0lEO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWxlbWVudC52YWx1ZVR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuTXVsdGlsaW5lU3RyaW5nKSB7XG5cdFx0XHRcdHJldHVybiBTRVRUSU5HU19NVUxUSUxJTkVfVEVYVF9URU1QTEFURV9JRDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVsZW1lbnQudmFsdWVUeXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLlN0cmluZykge1xuXHRcdFx0XHRyZXR1cm4gU0VUVElOR1NfVEVYVF9URU1QTEFURV9JRDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVsZW1lbnQudmFsdWVUeXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLkVudW0pIHtcblx0XHRcdFx0cmV0dXJuIFNFVFRJTkdTX0VOVU1fVEVNUExBVEVfSUQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlbGVtZW50LnZhbHVlVHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5BcnJheSkge1xuXHRcdFx0XHRyZXR1cm4gU0VUVElOR1NfQVJSQVlfVEVNUExBVEVfSUQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlbGVtZW50LnZhbHVlVHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5FeGNsdWRlKSB7XG5cdFx0XHRcdHJldHVybiBTRVRUSU5HU19FWENMVURFX1RFTVBMQVRFX0lEO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWxlbWVudC52YWx1ZVR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuSW5jbHVkZSkge1xuXHRcdFx0XHRyZXR1cm4gU0VUVElOR1NfSU5DTFVERV9URU1QTEFURV9JRDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVsZW1lbnQudmFsdWVUeXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLk9iamVjdCkge1xuXHRcdFx0XHRyZXR1cm4gU0VUVElOR1NfT0JKRUNUX1RFTVBMQVRFX0lEO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWxlbWVudC52YWx1ZVR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuQm9vbGVhbk9iamVjdCkge1xuXHRcdFx0XHRyZXR1cm4gU0VUVElOR1NfQk9PTF9PQkpFQ1RfVEVNUExBVEVfSUQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlbGVtZW50LnZhbHVlVHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5Db21wbGV4T2JqZWN0KSB7XG5cdFx0XHRcdHJldHVybiBTRVRUSU5HU19DT01QTEVYX09CSkVDVF9URU1QTEFURV9JRDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVsZW1lbnQudmFsdWVUeXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLkxhbmd1YWdlVGFnKSB7XG5cdFx0XHRcdHJldHVybiBTRVRUSU5HU19DT01QTEVYX1RFTVBMQVRFX0lEO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gU0VUVElOR1NfQ09NUExFWF9URU1QTEFURV9JRDtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZU5ld0V4dGVuc2lvbnNFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gU0VUVElOR1NfTkVXX0VYVEVOU0lPTlNfVEVNUExBVEVfSUQ7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCd1bmtub3duIGVsZW1lbnQgdHlwZTogJyArIGVsZW1lbnQpO1xuXHR9XG5cblx0aGFzRHluYW1pY0hlaWdodChlbGVtZW50OiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQgfCBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCB8IFNldHRpbmdzVHJlZU5ld0V4dGVuc2lvbnNFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEoZWxlbWVudCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZXN0aW1hdGVIZWlnaHQoZWxlbWVudDogU2V0dGluZ3NUcmVlR3JvdXBDaGlsZCk6IG51bWJlciB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQpIHtcblx0XHRcdHJldHVybiA0Mjtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWxlbWVudCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50ICYmIGVsZW1lbnQudmFsdWVUeXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLkJvb2xlYW4gPyA3OCA6IDEwNDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTm9uQ29sbGFwc2libGVPYmplY3RUcmVlTW9kZWw8VD4gZXh0ZW5kcyBPYmplY3RUcmVlTW9kZWw8VD4ge1xuXHRvdmVycmlkZSBpc0NvbGxhcHNpYmxlKGVsZW1lbnQ6IFQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRDb2xsYXBzZWQoZWxlbWVudDogVCwgY29sbGFwc2VkPzogYm9vbGVhbiwgcmVjdXJzaXZlPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5jbGFzcyBTZXR0aW5nc1RyZWVBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxTZXR0aW5nc1RyZWVFbGVtZW50PiB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSwgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkge1xuXHR9XG5cblx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IFNldHRpbmdzVHJlZUVsZW1lbnQpIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KSB7XG5cdFx0XHRjb25zdCBhcmlhTGFiZWxTZWN0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGFyaWFMYWJlbFNlY3Rpb25zLnB1c2goYCR7ZWxlbWVudC5kaXNwbGF5Q2F0ZWdvcnl9ICR7ZWxlbWVudC5kaXNwbGF5TGFiZWx9LmApO1xuXG5cdFx0XHRpZiAoZWxlbWVudC5pc0NvbmZpZ3VyZWQpIHtcblx0XHRcdFx0Y29uc3QgbW9kaWZpZWRUZXh0ID0gbG9jYWxpemUoJ3NldHRpbmdzLk1vZGlmaWVkJywgJ01vZGlmaWVkLicpO1xuXHRcdFx0XHRhcmlhTGFiZWxTZWN0aW9ucy5wdXNoKG1vZGlmaWVkVGV4dCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGluZGljYXRvcnNMYWJlbEFyaWFMYWJlbCA9IGdldEluZGljYXRvcnNMYWJlbEFyaWFMYWJlbChlbGVtZW50LCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCB0aGlzLmxhbmd1YWdlU2VydmljZSk7XG5cdFx0XHRpZiAoaW5kaWNhdG9yc0xhYmVsQXJpYUxhYmVsLmxlbmd0aCkge1xuXHRcdFx0XHRhcmlhTGFiZWxTZWN0aW9ucy5wdXNoKGAke2luZGljYXRvcnNMYWJlbEFyaWFMYWJlbH0uYCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uV2l0aG91dFNldHRpbmdMaW5rcyA9IHJlbmRlckFzUGxhaW50ZXh0KHsgdmFsdWU6IGZpeFNldHRpbmdMaW5rcyhlbGVtZW50LmRlc2NyaXB0aW9uLCBmYWxzZSkgfSk7XG5cdFx0XHRpZiAoZGVzY3JpcHRpb25XaXRob3V0U2V0dGluZ0xpbmtzLmxlbmd0aCkge1xuXHRcdFx0XHRhcmlhTGFiZWxTZWN0aW9ucy5wdXNoKGRlc2NyaXB0aW9uV2l0aG91dFNldHRpbmdMaW5rcyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYXJpYUxhYmVsU2VjdGlvbnMuam9pbignICcpO1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQubGFiZWw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBlbGVtZW50LmlkO1xuXHRcdH1cblx0fVxuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3NldHRpbmdzJywgXCJTZXR0aW5nc1wiKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NUcmVlIGV4dGVuZHMgV29ya2JlbmNoT2JqZWN0VHJlZTxTZXR0aW5nc1RyZWVFbGVtZW50PiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0dmlld1N0YXRlOiBJU2V0dGluZ3NFZGl0b3JWaWV3U3RhdGUsXG5cdFx0cmVuZGVyZXJzOiBJVHJlZVJlbmRlcmVyPGFueSwgdm9pZCwgYW55PltdLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxpc3RTZXJ2aWNlIGxpc3RTZXJ2aWNlOiBJTGlzdFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCdTZXR0aW5nc1RyZWUnLCBjb250YWluZXIsXG5cdFx0XHRuZXcgU2V0dGluZ3NUcmVlRGVsZWdhdGUoKSxcblx0XHRcdHJlbmRlcmVycyxcblx0XHRcdHtcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdHN1cHBvcnREeW5hbWljSGVpZ2h0czogdHJ1ZSxcblx0XHRcdFx0c2Nyb2xsVG9BY3RpdmVFbGVtZW50OiB0cnVlLFxuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0SWQoZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGUuaWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IG5ldyBTZXR0aW5nc1RyZWVBY2Nlc3NpYmlsaXR5UHJvdmlkZXIoY29uZmlndXJhdGlvblNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLFxuXHRcdFx0XHRzdHlsZUNvbnRyb2xsZXI6IGlkID0+IG5ldyBEZWZhdWx0U3R5bGVDb250cm9sbGVyKGRvbVN0eWxlc2hlZXRzSnMuY3JlYXRlU3R5bGVTaGVldChjb250YWluZXIpLCBpZCksXG5cdFx0XHRcdGZpbHRlcjogaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ3NUcmVlRmlsdGVyLCB2aWV3U3RhdGUsIHRydWUpLFxuXHRcdFx0XHRzbW9vdGhTY3JvbGxpbmc6IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCd3b3JrYmVuY2gubGlzdC5zbW9vdGhTY3JvbGxpbmcnKSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0ZmluZFdpZGdldEVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRyZW5kZXJJbmRlbnRHdWlkZXM6IFJlbmRlckluZGVudEd1aWRlcy5Ob25lLFxuXHRcdFx0XHR0cmFuc2Zvcm1PcHRpbWl6YXRpb246IGZhbHNlIC8vIERpc2FibGUgdHJhbnNmb3JtIG9wdGltaXphdGlvbiAjMTc3NDcwXG5cdFx0XHR9LFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZSxcblx0XHRcdGxpc3RTZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0KTtcblxuXHRcdHRoaXMuZ2V0SFRNTEVsZW1lbnQoKS5jbGFzc0xpc3QuYWRkKCdzZXR0aW5ncy1lZGl0b3ItdHJlZScpO1xuXG5cdFx0dGhpcy5zdHlsZShnZXRMaXN0U3R5bGVzKHtcblx0XHRcdGxpc3RCYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0bGlzdEFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRsaXN0QWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZDogZm9yZWdyb3VuZCxcblx0XHRcdGxpc3RGb2N1c0FuZFNlbGVjdGlvbkJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRsaXN0Rm9jdXNBbmRTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRcdFx0bGlzdEZvY3VzQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdGxpc3RGb2N1c0ZvcmVncm91bmQ6IGZvcmVncm91bmQsXG5cdFx0XHRsaXN0SG92ZXJGb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRcdFx0bGlzdEhvdmVyQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdGxpc3RIb3Zlck91dGxpbmU6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRsaXN0Rm9jdXNPdXRsaW5lOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0bGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmQ6IGZvcmVncm91bmQsXG5cdFx0XHRsaXN0SW5hY3RpdmVGb2N1c0JhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRsaXN0SW5hY3RpdmVGb2N1c091dGxpbmU6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHR0cmVlSW5kZW50R3VpZGVzU3Ryb2tlOiB1bmRlZmluZWQsXG5cdFx0XHR0cmVlSW5hY3RpdmVJbmRlbnRHdWlkZXNTdHJva2U6IHVuZGVmaW5lZCxcblx0XHR9KSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignd29ya2JlbmNoLmxpc3Quc21vb3RoU2Nyb2xsaW5nJykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0XHRzbW9vdGhTY3JvbGxpbmc6IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCd3b3JrYmVuY2gubGlzdC5zbW9vdGhTY3JvbGxpbmcnKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlTW9kZWwodXNlcjogc3RyaW5nLCBvcHRpb25zOiBJT2JqZWN0VHJlZU9wdGlvbnM8U2V0dGluZ3NUcmVlRWxlbWVudCB8IG51bGwsIHZvaWQ+KTogSVRyZWVNb2RlbDxTZXR0aW5nc1RyZWVHcm91cENoaWxkIHwgbnVsbCwgdm9pZCwgU2V0dGluZ3NUcmVlR3JvdXBDaGlsZCB8IG51bGw+IHtcblx0XHRyZXR1cm4gbmV3IE5vbkNvbGxhcHNpYmxlT2JqZWN0VHJlZU1vZGVsPFNldHRpbmdzVHJlZUdyb3VwQ2hpbGQ+KHVzZXIsIG9wdGlvbnMpO1xuXHR9XG59XG5cbmNsYXNzIENvcHlTZXR0aW5nSWRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnc2V0dGluZ3MuY29weVNldHRpbmdJZCc7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCdjb3B5U2V0dGluZ0lkTGFiZWwnLCBcIkNvcHkgU2V0dGluZyBJRFwiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihDb3B5U2V0dGluZ0lkQWN0aW9uLklELCBDb3B5U2V0dGluZ0lkQWN0aW9uLkxBQkVMKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihjb250ZXh0OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChjb250ZXh0KSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGNvbnRleHQuc2V0dGluZy5rZXkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxufVxuXG5jbGFzcyBDb3B5U2V0dGluZ0FzSlNPTkFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzZXR0aW5ncy5jb3B5U2V0dGluZ0FzSlNPTic7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCdjb3B5U2V0dGluZ0FzSlNPTkxhYmVsJywgXCJDb3B5IFNldHRpbmcgYXMgSlNPTlwiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihDb3B5U2V0dGluZ0FzSlNPTkFjdGlvbi5JRCwgQ29weVNldHRpbmdBc0pTT05BY3Rpb24uTEFCRUwpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGNvbnRleHQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGNvbnRleHQpIHtcblx0XHRcdGNvbnN0IGpzb25SZXN1bHQgPSBgXCIke2NvbnRleHQuc2V0dGluZy5rZXl9XCI6ICR7SlNPTi5zdHJpbmdpZnkoY29udGV4dC52YWx1ZSwgdW5kZWZpbmVkLCAnICAnKX1gO1xuXHRcdFx0YXdhaXQgdGhpcy5jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChqc29uUmVzdWx0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuY2xhc3MgQ29weVNldHRpbmdBc1VSTEFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzZXR0aW5ncy5jb3B5U2V0dGluZ0FzVVJMJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2NvcHlTZXR0aW5nQXNVUkxMYWJlbCcsIFwiQ29weSBTZXR0aW5nIGFzIFVSTFwiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoQ29weVNldHRpbmdBc1VSTEFjdGlvbi5JRCwgQ29weVNldHRpbmdBc1VSTEFjdGlvbi5MQUJFTCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oY29udGV4dDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoY29udGV4dCkge1xuXHRcdFx0Y29uc3Qgc2V0dGluZ0tleSA9IGNvbnRleHQuc2V0dGluZy5rZXk7XG5cdFx0XHRjb25zdCBwcm9kdWN0ID0gdGhpcy5wcm9kdWN0U2VydmljZS51cmxQcm90b2NvbDtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBwcm9kdWN0LCBhdXRob3JpdHk6IFNFVFRJTkdTX0FVVEhPUklUWSwgcGF0aDogYC8ke3NldHRpbmdLZXl9YCB9LCB0cnVlKTtcblx0XHRcdGF3YWl0IHRoaXMuY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodXJpLnRvU3RyaW5nKCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxufVxuXG5jbGFzcyBTeW5jU2V0dGluZ0FjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzZXR0aW5ncy5zdG9wU3luY2luZ1NldHRpbmcnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnc3RvcFN5bmNpbmdTZXR0aW5nJywgXCJTeW5jIFRoaXMgU2V0dGluZ1wiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNldHRpbmc6IElTZXR0aW5nLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFN5bmNTZXR0aW5nQWN0aW9uLklELCBTeW5jU2V0dGluZ0FjdGlvbi5MQUJFTCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZmlsdGVyKGNvbmZpZ1NlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3NldHRpbmdzU3luYy5pZ25vcmVkU2V0dGluZ3MnKSkoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRhc3luYyB1cGRhdGUoKSB7XG5cdFx0Y29uc3QgaWdub3JlZFNldHRpbmdzID0gZ2V0SWdub3JlZFNldHRpbmdzKGdldERlZmF1bHRJZ25vcmVkU2V0dGluZ3MoKSwgdGhpcy5jb25maWdTZXJ2aWNlKTtcblx0XHR0aGlzLmNoZWNrZWQgPSAhaWdub3JlZFNldHRpbmdzLmluY2x1ZGVzKHRoaXMuc2V0dGluZy5rZXkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIGZpcnN0IHJlbW92ZSB0aGUgY3VycmVudCBzZXR0aW5nIGNvbXBsZXRlbHkgZnJvbSBpZ25vcmVkIHNldHRpbmdzXG5cdFx0bGV0IGN1cnJlbnRWYWx1ZSA9IFsuLi50aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nW10+KCdzZXR0aW5nc1N5bmMuaWdub3JlZFNldHRpbmdzJyldO1xuXHRcdGN1cnJlbnRWYWx1ZSA9IGN1cnJlbnRWYWx1ZS5maWx0ZXIodiA9PiB2ICE9PSB0aGlzLnNldHRpbmcua2V5ICYmIHYgIT09IGAtJHt0aGlzLnNldHRpbmcua2V5fWApO1xuXG5cdFx0Y29uc3QgZGVmYXVsdElnbm9yZWRTZXR0aW5ncyA9IGdldERlZmF1bHRJZ25vcmVkU2V0dGluZ3MoKTtcblx0XHRjb25zdCBpc0RlZmF1bHRJZ25vcmVkID0gZGVmYXVsdElnbm9yZWRTZXR0aW5ncy5pbmNsdWRlcyh0aGlzLnNldHRpbmcua2V5KTtcblx0XHRjb25zdCBhc2tlZFRvU3luYyA9ICF0aGlzLmNoZWNrZWQ7XG5cblx0XHQvLyBJZiBhc2tlZCB0byBzeW5jLCB0aGVuIGFkZCBvbmx5IGlmIGl0IGlzIGlnbm9yZWQgYnkgZGVmYXVsdFxuXHRcdGlmIChhc2tlZFRvU3luYyAmJiBpc0RlZmF1bHRJZ25vcmVkKSB7XG5cdFx0XHRjdXJyZW50VmFsdWUucHVzaChgLSR7dGhpcy5zZXR0aW5nLmtleX1gKTtcblx0XHR9XG5cblx0XHQvLyBJZiBhc2tlZCBub3QgdG8gc3luYywgdGhlbiBhZGQgb25seSBpZiBpdCBpcyBub3QgaWdub3JlZCBieSBkZWZhdWx0XG5cdFx0aWYgKCFhc2tlZFRvU3luYyAmJiAhaXNEZWZhdWx0SWdub3JlZCkge1xuXHRcdFx0Y3VycmVudFZhbHVlLnB1c2godGhpcy5zZXR0aW5nLmtleSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb25maWdTZXJ2aWNlLnVwZGF0ZVZhbHVlKCdzZXR0aW5nc1N5bmMuaWdub3JlZFNldHRpbmdzJywgY3VycmVudFZhbHVlLmxlbmd0aCA/IGN1cnJlbnRWYWx1ZSA6IHVuZGVmaW5lZCwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG59XG5cbmNsYXNzIEFwcGx5U2V0dGluZ1RvQWxsUHJvZmlsZXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnc2V0dGluZ3MuYXBwbHlUb0FsbFByb2ZpbGVzJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2FwcGx5VG9BbGxQcm9maWxlcycsIFwiQXBwbHkgU2V0dGluZyB0byBhbGwgUHJvZmlsZXNcIik7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZXR0aW5nOiBJU2V0dGluZyxcblx0XHRASVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlnU2VydmljZTogSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihBcHBseVNldHRpbmdUb0FsbFByb2ZpbGVzQWN0aW9uLklELCBBcHBseVNldHRpbmdUb0FsbFByb2ZpbGVzQWN0aW9uLkxBQkVMKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIoY29uZmlnU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBUFBMWV9BTExfUFJPRklMRVNfU0VUVElORykpKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCkge1xuXHRcdGNvbnN0IGFsbFByb2ZpbGVzU2V0dGluZ3MgPSB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nW10+KEFQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HKTtcblx0XHR0aGlzLmNoZWNrZWQgPSBhbGxQcm9maWxlc1NldHRpbmdzLmluY2x1ZGVzKHRoaXMuc2V0dGluZy5rZXkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIGZpcnN0IHJlbW92ZSB0aGUgY3VycmVudCBzZXR0aW5nIGNvbXBsZXRlbHkgZnJvbSBpZ25vcmVkIHNldHRpbmdzXG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nW10+KEFQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HKSA/PyBbXTtcblxuXHRcdGlmICh0aGlzLmNoZWNrZWQpIHtcblx0XHRcdGNvbnN0IGlkeCA9IHZhbHVlLmluZGV4T2YodGhpcy5zZXR0aW5nLmtleSk7XG5cdFx0XHRpZiAoaWR4ICE9PSAtMSkge1xuXHRcdFx0XHR2YWx1ZS5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFsdWUucHVzaCh0aGlzLnNldHRpbmcua2V5KTtcblx0XHR9XG5cblx0XHRjb25zdCBuZXdWYWx1ZSA9IGRpc3RpbmN0KHZhbHVlKTtcblx0XHRpZiAodGhpcy5jaGVja2VkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbmZpZ1NlcnZpY2UudXBkYXRlVmFsdWUodGhpcy5zZXR0aW5nLmtleSwgdGhpcy5jb25maWdTZXJ2aWNlLmluc3BlY3QodGhpcy5zZXR0aW5nLmtleSkuYXBwbGljYXRpb24/LnZhbHVlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpO1xuXHRcdFx0YXdhaXQgdGhpcy5jb25maWdTZXJ2aWNlLnVwZGF0ZVZhbHVlKEFQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HLCBuZXdWYWx1ZS5sZW5ndGggPyBuZXdWYWx1ZSA6IHVuZGVmaW5lZCwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5jb25maWdTZXJ2aWNlLnVwZGF0ZVZhbHVlKEFQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HLCBuZXdWYWx1ZS5sZW5ndGggPyBuZXdWYWx1ZSA6IHVuZGVmaW5lZCwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKTtcblx0XHRcdGF3YWl0IHRoaXMuY29uZmlnU2VydmljZS51cGRhdGVWYWx1ZSh0aGlzLnNldHRpbmcua2V5LCB0aGlzLmNvbmZpZ1NlcnZpY2UuaW5zcGVjdCh0aGlzLnNldHRpbmcua2V5KS51c2VyTG9jYWw/LnZhbHVlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpO1xuXHRcdH1cblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFlBQVksU0FBUztBQUNyQixZQUFZLHNCQUFzQjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUVsQyxZQUFZLFVBQVU7QUFDdEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXdCLGdCQUFnQjtBQUN4QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDhCQUEwRDtBQUNuRSxTQUE0QixpQkFBaUI7QUFDN0MsU0FBUyxRQUFRLDRCQUE0QjtBQUM3QyxTQUFTLGVBQWU7QUFDeEIsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBOEUsc0JBQXNCO0FBQ3BHLFNBQVMsUUFBaUIsaUJBQWlCO0FBQzNDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYTtBQUUvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUFpQixjQUFjLG9CQUFvQjtBQUN4RSxTQUFTLGFBQWE7QUFDdEIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxXQUFXLHlCQUF5QjtBQUM3QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMs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
