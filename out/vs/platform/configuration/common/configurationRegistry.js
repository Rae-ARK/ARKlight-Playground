import { distinct } from "../../../base/common/arrays.js";
import { Emitter } from "../../../base/common/event.js";
import * as types from "../../../base/common/types.js";
import * as nls from "../../../nls.js";
import { getLanguageTagSettingPlainKey } from "./configuration.js";
import { Extensions as JSONExtensions } from "../../jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../registry/common/platform.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import product from "../../product/common/product.js";
var EditPresentationTypes = /* @__PURE__ */ ((EditPresentationTypes2) => {
  EditPresentationTypes2["Multiline"] = "multilineText";
  EditPresentationTypes2["Singleline"] = "singlelineText";
  return EditPresentationTypes2;
})(EditPresentationTypes || {});
const Extensions = {
  Configuration: "base.contributions.configuration"
};
var ConfigurationScope = /* @__PURE__ */ ((ConfigurationScope2) => {
  ConfigurationScope2[ConfigurationScope2["APPLICATION"] = 1] = "APPLICATION";
  ConfigurationScope2[ConfigurationScope2["MACHINE"] = 2] = "MACHINE";
  ConfigurationScope2[ConfigurationScope2["APPLICATION_MACHINE"] = 3] = "APPLICATION_MACHINE";
  ConfigurationScope2[ConfigurationScope2["WINDOW"] = 4] = "WINDOW";
  ConfigurationScope2[ConfigurationScope2["RESOURCE"] = 5] = "RESOURCE";
  ConfigurationScope2[ConfigurationScope2["LANGUAGE_OVERRIDABLE"] = 6] = "LANGUAGE_OVERRIDABLE";
  ConfigurationScope2[ConfigurationScope2["MACHINE_OVERRIDABLE"] = 7] = "MACHINE_OVERRIDABLE";
  return ConfigurationScope2;
})(ConfigurationScope || {});
function isConfigurationDefaultSourceEquals(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (typeof a === "string" || typeof b === "string") {
    return a === b;
  }
  return a.id === b.id;
}
const allSettings = { properties: {}, patternProperties: {} };
const applicationSettings = { properties: {}, patternProperties: {} };
const applicationMachineSettings = { properties: {}, patternProperties: {} };
const machineSettings = { properties: {}, patternProperties: {} };
const machineOverridableSettings = { properties: {}, patternProperties: {} };
const windowSettings = { properties: {}, patternProperties: {} };
const resourceSettings = { properties: {}, patternProperties: {} };
const resourceLanguageSettingsSchemaId = "vscode://schemas/settings/resourceLanguage";
const configurationDefaultsSchemaId = "vscode://schemas/settings/configurationDefaults";
const contributionRegistry = Registry.as(JSONExtensions.JSONContribution);
class ConfigurationRegistry extends Disposable {
  constructor() {
    super();
    this.registeredConfigurationDefaults = [];
    this.overrideIdentifiers = /* @__PURE__ */ new Set();
    this._onDidSchemaChange = this._register(new Emitter());
    this.onDidSchemaChange = this._onDidSchemaChange.event;
    this._onDidUpdateConfiguration = this._register(new Emitter());
    this.onDidUpdateConfiguration = this._onDidUpdateConfiguration.event;
    this.configurationDefaultsOverrides = /* @__PURE__ */ new Map();
    this.defaultLanguageConfigurationOverridesNode = {
      id: "defaultOverrides",
      title: nls.localize("defaultLanguageConfigurationOverrides.title", "Default Language Configuration Overrides"),
      properties: {}
    };
    this.configurationContributors = [this.defaultLanguageConfigurationOverridesNode];
    this.resourceLanguageSettingsSchema = {
      properties: {},
      patternProperties: {},
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    };
    this.configurationProperties = {};
    this.policyConfigurations = /* @__PURE__ */ new Map();
    this.policyReferenceConfigurations = /* @__PURE__ */ new Map();
    this.excludedConfigurationProperties = {};
    contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
    this.registerOverridePropertyPatternKey();
  }
  registerConfiguration(configuration, validate = true) {
    this.registerConfigurations([configuration], validate);
    return configuration;
  }
  registerConfigurations(configurations, validate = true) {
    const properties = /* @__PURE__ */ new Set();
    this.doRegisterConfigurations(configurations, validate, properties);
    contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
    this._onDidSchemaChange.fire();
    this._onDidUpdateConfiguration.fire({ properties });
  }
  deregisterConfigurations(configurations) {
    const properties = /* @__PURE__ */ new Set();
    this.doDeregisterConfigurations(configurations, properties);
    contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
    this._onDidSchemaChange.fire();
    this._onDidUpdateConfiguration.fire({ properties });
  }
  updateConfigurations({ add, remove }) {
    const properties = /* @__PURE__ */ new Set();
    this.doDeregisterConfigurations(remove, properties);
    this.doRegisterConfigurations(add, false, properties);
    contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
    this._onDidSchemaChange.fire();
    this._onDidUpdateConfiguration.fire({ properties });
  }
  registerDefaultConfigurations(configurationDefaults) {
    const properties = /* @__PURE__ */ new Set();
    this.doRegisterDefaultConfigurations(configurationDefaults, properties);
    this._onDidSchemaChange.fire();
    this._onDidUpdateConfiguration.fire({ properties, defaultsOverrides: true });
  }
  doRegisterDefaultConfigurations(configurationDefaults, bucket) {
    this.registeredConfigurationDefaults.push(...configurationDefaults);
    const overrideIdentifiers = [];
    for (const { overrides, source } of configurationDefaults) {
      for (const key in overrides) {
        bucket.add(key);
        const configurationDefaultOverridesForKey = this.configurationDefaultsOverrides.get(key) ?? this.configurationDefaultsOverrides.set(key, { configurationDefaultOverrides: [] }).get(key);
        const value = overrides[key];
        configurationDefaultOverridesForKey.configurationDefaultOverrides.push({ value, source });
        if (OVERRIDE_PROPERTY_REGEX.test(key)) {
          const newDefaultOverride = this.mergeDefaultConfigurationsForOverrideIdentifier(key, value, source, configurationDefaultOverridesForKey.configurationDefaultOverrideValue);
          if (!newDefaultOverride) {
            continue;
          }
          configurationDefaultOverridesForKey.configurationDefaultOverrideValue = newDefaultOverride;
          this.updateDefaultOverrideProperty(key, newDefaultOverride, source);
          overrideIdentifiers.push(...overrideIdentifiersFromKey(key));
        } else {
          const newDefaultOverride = this.mergeDefaultConfigurationsForConfigurationProperty(key, value, source, configurationDefaultOverridesForKey.configurationDefaultOverrideValue);
          if (!newDefaultOverride) {
            continue;
          }
          configurationDefaultOverridesForKey.configurationDefaultOverrideValue = newDefaultOverride;
          const property = this.configurationProperties[key];
          if (property) {
            this.updatePropertyDefaultValue(key, property);
            this.updateSchema(key, property);
          }
        }
      }
    }
    this.doRegisterOverrideIdentifiers(overrideIdentifiers);
  }
  deregisterDefaultConfigurations(defaultConfigurations) {
    const properties = /* @__PURE__ */ new Set();
    this.doDeregisterDefaultConfigurations(defaultConfigurations, properties);
    this._onDidSchemaChange.fire();
    this._onDidUpdateConfiguration.fire({ properties, defaultsOverrides: true });
  }
  doDeregisterDefaultConfigurations(defaultConfigurations, bucket) {
    for (const defaultConfiguration of defaultConfigurations) {
      const index = this.registeredConfigurationDefaults.indexOf(defaultConfiguration);
      if (index !== -1) {
        this.registeredConfigurationDefaults.splice(index, 1);
      }
    }
    for (const { overrides, source } of defaultConfigurations) {
      for (const key in overrides) {
        const configurationDefaultOverridesForKey = this.configurationDefaultsOverrides.get(key);
        if (!configurationDefaultOverridesForKey) {
          continue;
        }
        const index = configurationDefaultOverridesForKey.configurationDefaultOverrides.findIndex((configurationDefaultOverride) => source ? isConfigurationDefaultSourceEquals(configurationDefaultOverride.source, source) : configurationDefaultOverride.value === overrides[key]);
        if (index === -1) {
          continue;
        }
        configurationDefaultOverridesForKey.configurationDefaultOverrides.splice(index, 1);
        if (configurationDefaultOverridesForKey.configurationDefaultOverrides.length === 0) {
          this.configurationDefaultsOverrides.delete(key);
        }
        if (OVERRIDE_PROPERTY_REGEX.test(key)) {
          let configurationDefaultOverrideValue;
          for (const configurationDefaultOverride of configurationDefaultOverridesForKey.configurationDefaultOverrides) {
            configurationDefaultOverrideValue = this.mergeDefaultConfigurationsForOverrideIdentifier(key, configurationDefaultOverride.value, configurationDefaultOverride.source, configurationDefaultOverrideValue);
          }
          if (configurationDefaultOverrideValue && !types.isEmptyObject(configurationDefaultOverrideValue.value)) {
            configurationDefaultOverridesForKey.configurationDefaultOverrideValue = configurationDefaultOverrideValue;
            this.updateDefaultOverrideProperty(key, configurationDefaultOverrideValue, source);
          } else {
            this.configurationDefaultsOverrides.delete(key);
            delete this.configurationProperties[key];
            delete this.defaultLanguageConfigurationOverridesNode.properties[key];
          }
        } else {
          let configurationDefaultOverrideValue;
          for (const configurationDefaultOverride of configurationDefaultOverridesForKey.configurationDefaultOverrides) {
            configurationDefaultOverrideValue = this.mergeDefaultConfigurationsForConfigurationProperty(key, configurationDefaultOverride.value, configurationDefaultOverride.source, configurationDefaultOverrideValue);
          }
          configurationDefaultOverridesForKey.configurationDefaultOverrideValue = configurationDefaultOverrideValue;
          const property = this.configurationProperties[key];
          if (property) {
            this.updatePropertyDefaultValue(key, property);
            this.updateSchema(key, property);
          }
        }
        bucket.add(key);
      }
    }
    this.updateOverridePropertyPatternKey();
  }
  updateDefaultOverrideProperty(key, newDefaultOverride, source) {
    const property = {
      section: {
        id: this.defaultLanguageConfigurationOverridesNode.id,
        title: this.defaultLanguageConfigurationOverridesNode.title,
        order: this.defaultLanguageConfigurationOverridesNode.order,
        extensionInfo: this.defaultLanguageConfigurationOverridesNode.extensionInfo
      },
      type: "object",
      default: newDefaultOverride.value,
      description: nls.localize("defaultLanguageConfiguration.description", "Configure settings to be overridden for {0}.", getLanguageTagSettingPlainKey(key)),
      $ref: resourceLanguageSettingsSchemaId,
      defaultDefaultValue: newDefaultOverride.value,
      source,
      defaultValueSource: source
    };
    this.configurationProperties[key] = property;
    this.defaultLanguageConfigurationOverridesNode.properties[key] = property;
  }
  mergeDefaultConfigurationsForOverrideIdentifier(overrideIdentifier, configurationValueObject, valueSource, existingDefaultOverride) {
    const defaultValue = existingDefaultOverride?.value || {};
    const source = existingDefaultOverride?.source ?? /* @__PURE__ */ new Map();
    if (!(source instanceof Map)) {
      console.error("objectConfigurationSources is not a Map");
      return void 0;
    }
    for (const propertyKey of Object.keys(configurationValueObject)) {
      const propertyDefaultValue = configurationValueObject[propertyKey];
      const isObjectSetting = types.isObject(propertyDefaultValue) && (types.isUndefined(defaultValue[propertyKey]) || types.isObject(defaultValue[propertyKey]));
      if (isObjectSetting) {
        defaultValue[propertyKey] = { ...defaultValue[propertyKey] ?? {}, ...propertyDefaultValue };
        if (valueSource) {
          for (const objectKey in propertyDefaultValue) {
            source.set(`${propertyKey}.${objectKey}`, valueSource);
          }
        }
      } else {
        defaultValue[propertyKey] = propertyDefaultValue;
        if (valueSource) {
          source.set(propertyKey, valueSource);
        } else {
          source.delete(propertyKey);
        }
      }
    }
    return { value: defaultValue, source };
  }
  mergeDefaultConfigurationsForConfigurationProperty(propertyKey, value, valuesSource, existingDefaultOverride) {
    const property = this.configurationProperties[propertyKey];
    const existingDefaultValue = existingDefaultOverride?.value ?? property?.defaultDefaultValue;
    let source = valuesSource;
    const isObjectSetting = types.isObject(value) && (property !== void 0 && property.type === "object" || property === void 0 && (types.isUndefined(existingDefaultValue) || types.isObject(existingDefaultValue)));
    if (isObjectSetting) {
      source = existingDefaultOverride?.source ?? /* @__PURE__ */ new Map();
      if (!(source instanceof Map)) {
        console.error("defaultValueSource is not a Map");
        return void 0;
      }
      for (const objectKey in value) {
        if (valuesSource) {
          source.set(`${propertyKey}.${objectKey}`, valuesSource);
        }
      }
      value = { ...types.isObject(existingDefaultValue) ? existingDefaultValue : {}, ...value };
    }
    return { value, source };
  }
  deltaConfiguration(delta) {
    let defaultsOverrides = false;
    const properties = /* @__PURE__ */ new Set();
    if (delta.removedDefaults) {
      this.doDeregisterDefaultConfigurations(delta.removedDefaults, properties);
      defaultsOverrides = true;
    }
    if (delta.addedDefaults) {
      this.doRegisterDefaultConfigurations(delta.addedDefaults, properties);
      defaultsOverrides = true;
    }
    if (delta.removedConfigurations) {
      this.doDeregisterConfigurations(delta.removedConfigurations, properties);
    }
    if (delta.addedConfigurations) {
      this.doRegisterConfigurations(delta.addedConfigurations, false, properties);
    }
    this._onDidSchemaChange.fire();
    this._onDidUpdateConfiguration.fire({ properties, defaultsOverrides });
  }
  notifyConfigurationSchemaUpdated(...configurations) {
    this._onDidSchemaChange.fire();
  }
  registerOverrideIdentifiers(overrideIdentifiers) {
    this.doRegisterOverrideIdentifiers(overrideIdentifiers);
    this._onDidSchemaChange.fire();
  }
  doRegisterOverrideIdentifiers(overrideIdentifiers) {
    for (const overrideIdentifier of overrideIdentifiers) {
      this.overrideIdentifiers.add(overrideIdentifier);
    }
    this.updateOverridePropertyPatternKey();
  }
  doRegisterConfigurations(configurations, validate, bucket) {
    configurations.forEach((configuration) => {
      this.validateAndRegisterProperties(configuration, validate, configuration.extensionInfo, configuration.restrictedProperties, void 0, bucket);
      this.configurationContributors.push(configuration);
      this.registerJSONConfiguration(configuration);
    });
  }
  doDeregisterConfigurations(configurations, bucket) {
    const deregisterConfiguration = (configuration) => {
      if (configuration.properties) {
        for (const key in configuration.properties) {
          bucket.add(key);
          const property = this.configurationProperties[key];
          if (property?.policy?.name) {
            this.policyConfigurations.delete(property.policy.name);
          }
          if (property?.policyReference?.name) {
            const refs = this.policyReferenceConfigurations.get(property.policyReference.name);
            if (refs) {
              refs.delete(key);
              if (refs.size === 0) {
                this.policyReferenceConfigurations.delete(property.policyReference.name);
              }
            }
          }
          delete this.configurationProperties[key];
          this.removeFromSchema(key, configuration.properties[key]);
        }
      }
      configuration.allOf?.forEach((node) => deregisterConfiguration(node));
    };
    for (const configuration of configurations) {
      deregisterConfiguration(configuration);
      const index = this.configurationContributors.indexOf(configuration);
      if (index !== -1) {
        this.configurationContributors.splice(index, 1);
      }
    }
  }
  validateAndRegisterProperties(configuration, validate = true, extensionInfo, restrictedProperties, scope = 4 /* WINDOW */, bucket) {
    scope = types.isUndefinedOrNull(configuration.scope) ? scope : configuration.scope;
    const properties = configuration.properties;
    if (properties) {
      for (const key in properties) {
        const property = properties[key];
        property.section = {
          id: configuration.id,
          title: configuration.title,
          order: configuration.order,
          extensionInfo: configuration.extensionInfo
        };
        if (validate && validateProperty(key, property, extensionInfo?.id)) {
          delete properties[key];
          continue;
        }
        property.source = extensionInfo;
        property.defaultDefaultValue = properties[key].default;
        this.updatePropertyDefaultValue(key, property);
        if (OVERRIDE_PROPERTY_REGEX.test(key)) {
          property.scope = void 0;
        } else {
          property.scope = types.isUndefinedOrNull(property.scope) ? scope : property.scope;
          property.restricted = types.isUndefinedOrNull(property.restricted) ? !!restrictedProperties?.includes(key) : property.restricted;
        }
        if (property.experiment) {
          if (!property.tags?.some((tag) => tag.toLowerCase() === "onexp")) {
            property.tags = property.tags ?? [];
            property.tags.push("onExP");
          }
        } else if (property.tags?.some((tag) => tag.toLowerCase() === "onexp")) {
          console.error(`Invalid tag 'onExP' found for property '${key}'. Please use 'experiment' property instead.`);
          property.experiment = { mode: "startup" };
        }
        const excluded = properties[key].hasOwnProperty("included") && !properties[key].included;
        const policyName = properties[key].policy?.name;
        const policyReferenceName = properties[key].policyReference?.name;
        if (excluded) {
          this.excludedConfigurationProperties[key] = properties[key];
          if (policyName) {
            this.policyConfigurations.set(policyName, key);
            bucket.add(key);
          }
          if (policyReferenceName) {
            this.addPolicyReferenceConfiguration(policyReferenceName, key);
            bucket.add(key);
          }
          delete properties[key];
        } else {
          bucket.add(key);
          if (policyName) {
            this.policyConfigurations.set(policyName, key);
          }
          if (policyReferenceName) {
            this.addPolicyReferenceConfiguration(policyReferenceName, key);
          }
          this.configurationProperties[key] = properties[key];
          if (!properties[key].deprecationMessage && properties[key].markdownDeprecationMessage) {
            properties[key].deprecationMessage = properties[key].markdownDeprecationMessage;
          }
        }
      }
    }
    const subNodes = configuration.allOf;
    if (subNodes) {
      for (const node of subNodes) {
        this.validateAndRegisterProperties(node, validate, extensionInfo, restrictedProperties, scope, bucket);
      }
    }
  }
  addPolicyReferenceConfiguration(policyName, key) {
    let keys = this.policyReferenceConfigurations.get(policyName);
    if (!keys) {
      keys = /* @__PURE__ */ new Set();
      this.policyReferenceConfigurations.set(policyName, keys);
    }
    keys.add(key);
  }
  // Only for tests
  getConfigurations() {
    return this.configurationContributors;
  }
  getConfigurationProperties() {
    return this.configurationProperties;
  }
  getPolicyConfigurations() {
    return this.policyConfigurations;
  }
  getPolicyReferenceConfigurations() {
    return this.policyReferenceConfigurations;
  }
  getExcludedConfigurationProperties() {
    return this.excludedConfigurationProperties;
  }
  getRegisteredDefaultConfigurations() {
    return [...this.registeredConfigurationDefaults];
  }
  getConfigurationDefaultsOverrides() {
    const configurationDefaultsOverrides = /* @__PURE__ */ new Map();
    for (const [key, value] of this.configurationDefaultsOverrides) {
      if (value.configurationDefaultOverrideValue) {
        configurationDefaultsOverrides.set(key, value.configurationDefaultOverrideValue);
      }
    }
    return configurationDefaultsOverrides;
  }
  registerJSONConfiguration(configuration) {
    const register = (configuration2) => {
      const properties = configuration2.properties;
      if (properties) {
        for (const key in properties) {
          this.updateSchema(key, properties[key]);
        }
      }
      const subNodes = configuration2.allOf;
      subNodes?.forEach(register);
    };
    register(configuration);
  }
  updateSchema(key, property) {
    allSettings.properties[key] = property;
    switch (property.scope) {
      case 1 /* APPLICATION */:
        applicationSettings.properties[key] = property;
        break;
      case 2 /* MACHINE */:
        machineSettings.properties[key] = property;
        break;
      case 3 /* APPLICATION_MACHINE */:
        applicationMachineSettings.properties[key] = property;
        break;
      case 7 /* MACHINE_OVERRIDABLE */:
        machineOverridableSettings.properties[key] = property;
        break;
      case 4 /* WINDOW */:
        windowSettings.properties[key] = property;
        break;
      case 5 /* RESOURCE */:
        resourceSettings.properties[key] = property;
        break;
      case 6 /* LANGUAGE_OVERRIDABLE */:
        resourceSettings.properties[key] = property;
        this.resourceLanguageSettingsSchema.properties[key] = property;
        break;
    }
  }
  removeFromSchema(key, property) {
    delete allSettings.properties[key];
    switch (property.scope) {
      case 1 /* APPLICATION */:
        delete applicationSettings.properties[key];
        break;
      case 2 /* MACHINE */:
        delete machineSettings.properties[key];
        break;
      case 3 /* APPLICATION_MACHINE */:
        delete applicationMachineSettings.properties[key];
        break;
      case 7 /* MACHINE_OVERRIDABLE */:
        delete machineOverridableSettings.properties[key];
        break;
      case 4 /* WINDOW */:
        delete windowSettings.properties[key];
        break;
      case 5 /* RESOURCE */:
      case 6 /* LANGUAGE_OVERRIDABLE */:
        delete resourceSettings.properties[key];
        delete this.resourceLanguageSettingsSchema.properties[key];
        break;
    }
  }
  updateOverridePropertyPatternKey() {
    for (const overrideIdentifier of this.overrideIdentifiers.values()) {
      const overrideIdentifierProperty = `[${overrideIdentifier}]`;
      const resourceLanguagePropertiesSchema = {
        type: "object",
        description: nls.localize("overrideSettings.defaultDescription", "Configure editor settings to be overridden for a language."),
        errorMessage: nls.localize("overrideSettings.errorMessage", "This setting does not support per-language configuration."),
        $ref: resourceLanguageSettingsSchemaId
      };
      this.updatePropertyDefaultValue(overrideIdentifierProperty, resourceLanguagePropertiesSchema);
      allSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
      applicationSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
      applicationMachineSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
      machineSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
      machineOverridableSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
      windowSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
      resourceSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
    }
  }
  registerOverridePropertyPatternKey() {
    const resourceLanguagePropertiesSchema = {
      type: "object",
      description: nls.localize("overrideSettings.defaultDescription", "Configure editor settings to be overridden for a language."),
      errorMessage: nls.localize("overrideSettings.errorMessage", "This setting does not support per-language configuration."),
      $ref: resourceLanguageSettingsSchemaId
    };
    allSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
    applicationSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
    applicationMachineSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
    machineSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
    machineOverridableSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
    windowSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
    resourceSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
    this._onDidSchemaChange.fire();
  }
  updatePropertyDefaultValue(key, property) {
    const configurationdefaultOverride = this.configurationDefaultsOverrides.get(key)?.configurationDefaultOverrideValue;
    let defaultValue = void 0;
    let defaultSource = void 0;
    if (configurationdefaultOverride && (!property.disallowConfigurationDefault || !configurationdefaultOverride.source)) {
      defaultValue = configurationdefaultOverride.value;
      defaultSource = configurationdefaultOverride.source;
    }
    if (types.isUndefined(defaultValue)) {
      defaultValue = property.defaultDefaultValue;
      defaultSource = void 0;
    }
    if (types.isUndefined(defaultValue)) {
      defaultValue = getDefaultValue(property.type);
    }
    property.default = defaultValue;
    property.defaultValueSource = defaultSource;
  }
}
const OVERRIDE_IDENTIFIER_PATTERN = `\\[([^\\]]+)\\]`;
const OVERRIDE_IDENTIFIER_REGEX = new RegExp(OVERRIDE_IDENTIFIER_PATTERN, "g");
const OVERRIDE_PROPERTY_PATTERN = `^(${OVERRIDE_IDENTIFIER_PATTERN})+$`;
const OVERRIDE_PROPERTY_REGEX = new RegExp(OVERRIDE_PROPERTY_PATTERN);
function overrideIdentifiersFromKey(key) {
  const identifiers = [];
  if (OVERRIDE_PROPERTY_REGEX.test(key)) {
    let matches = OVERRIDE_IDENTIFIER_REGEX.exec(key);
    while (matches?.length) {
      const identifier = matches[1].trim();
      if (identifier) {
        identifiers.push(identifier);
      }
      matches = OVERRIDE_IDENTIFIER_REGEX.exec(key);
    }
  }
  return distinct(identifiers);
}
function keyFromOverrideIdentifiers(overrideIdentifiers) {
  return overrideIdentifiers.reduce((result, overrideIdentifier) => `${result}[${overrideIdentifier}]`, "");
}
function getDefaultValue(type) {
  const t = Array.isArray(type) ? type[0] : type;
  switch (t) {
    case "boolean":
      return false;
    case "integer":
    case "number":
      return 0;
    case "string":
      return "";
    case "array":
      return [];
    case "object":
      return {};
    default:
      return null;
  }
}
const configurationRegistry = new ConfigurationRegistry();
Registry.add(Extensions.Configuration, configurationRegistry);
function validateProperty(property, schema, extensionId) {
  if (!property.trim()) {
    return nls.localize("config.property.empty", "Cannot register an empty property");
  }
  if (OVERRIDE_PROPERTY_REGEX.test(property)) {
    return nls.localize("config.property.languageDefault", "Cannot register '{0}'. This matches property pattern '\\\\[.*\\\\]$' for describing language specific editor settings. Use 'configurationDefaults' contribution.", property);
  }
  if (configurationRegistry.getConfigurationProperties()[property] !== void 0 && (!extensionId || !EXTENSION_UNIFICATION_EXTENSION_IDS.has(extensionId.toLowerCase()))) {
    return nls.localize("config.property.duplicate", "Cannot register '{0}'. This property is already registered.", property);
  }
  if (schema.policy && schema.policyReference) {
    return nls.localize("config.policy.bothPolicyAndReference", "Cannot register '{0}'. A setting must not declare both 'policy' and 'policyReference'.", property);
  }
  if (schema.policy?.name && configurationRegistry.getPolicyConfigurations().get(schema.policy?.name) !== void 0) {
    return nls.localize("config.policy.duplicate", "Cannot register '{0}'. The associated policy {1} is already registered with {2}. To attach another setting to the same policy, use 'policyReference'.", property, schema.policy?.name, configurationRegistry.getPolicyConfigurations().get(schema.policy?.name));
  }
  return null;
}
function getScopes() {
  const scopes = [];
  const configurationProperties = configurationRegistry.getConfigurationProperties();
  for (const key of Object.keys(configurationProperties)) {
    scopes.push([key, configurationProperties[key].scope]);
  }
  scopes.push(["launch", 5 /* RESOURCE */]);
  scopes.push(["task", 5 /* RESOURCE */]);
  return scopes;
}
function getAllConfigurationProperties(configurationNode) {
  const result = {};
  for (const configuration of configurationNode) {
    const properties = configuration.properties;
    if (types.isObject(properties)) {
      for (const key in properties) {
        result[key] = properties[key];
      }
    }
    if (configuration.allOf) {
      Object.assign(result, getAllConfigurationProperties(configuration.allOf));
    }
  }
  return result;
}
function parseScope(scope) {
  switch (scope) {
    case "application":
      return 1 /* APPLICATION */;
    case "machine":
      return 2 /* MACHINE */;
    case "resource":
      return 5 /* RESOURCE */;
    case "machine-overridable":
      return 7 /* MACHINE_OVERRIDABLE */;
    case "language-overridable":
      return 6 /* LANGUAGE_OVERRIDABLE */;
    default:
      return 4 /* WINDOW */;
  }
}
const EXTENSION_UNIFICATION_EXTENSION_IDS = new Set(product.defaultChatAgent ? [product.defaultChatAgent.extensionId, product.defaultChatAgent.chatExtensionId].map((id) => id.toLowerCase()) : []);
export {
  ConfigurationScope,
  EXTENSION_UNIFICATION_EXTENSION_IDS,
  EditPresentationTypes,
  Extensions,
  OVERRIDE_PROPERTY_PATTERN,
  OVERRIDE_PROPERTY_REGEX,
  allSettings,
  applicationMachineSettings,
  applicationSettings,
  configurationDefaultsSchemaId,
  getAllConfigurationProperties,
  getDefaultValue,
  getScopes,
  isConfigurationDefaultSourceEquals,
  keyFromOverrideIdentifiers,
  machineOverridableSettings,
  machineSettings,
  overrideIdentifiersFromKey,
  parseScope,
  resourceLanguageSettingsSchemaId,
  resourceSettings,
  validateProperty,
  windowSettings
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZXRMYW5ndWFnZVRhZ1NldHRpbmdQbGFpbktleSB9IGZyb20gJy4vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIEpTT05FeHRlbnNpb25zLCBJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vanNvbnNjaGVtYXMvY29tbW9uL2pzb25Db250cmlidXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJUG9saWN5LCBJUG9saWN5UmVmZXJlbmNlLCBQb2xpY3lOYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5cbmV4cG9ydCBlbnVtIEVkaXRQcmVzZW50YXRpb25UeXBlcyB7XG5cdE11bHRpbGluZSA9ICdtdWx0aWxpbmVUZXh0Jyxcblx0U2luZ2xlbGluZSA9ICdzaW5nbGVsaW5lVGV4dCdcbn1cblxuZXhwb3J0IGNvbnN0IEV4dGVuc2lvbnMgPSB7XG5cdENvbmZpZ3VyYXRpb246ICdiYXNlLmNvbnRyaWJ1dGlvbnMuY29uZmlndXJhdGlvbidcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbmZpZ3VyYXRpb25EZWx0YSB7XG5cdHJlbW92ZWREZWZhdWx0cz86IElDb25maWd1cmF0aW9uRGVmYXVsdHNbXTtcblx0cmVtb3ZlZENvbmZpZ3VyYXRpb25zPzogSUNvbmZpZ3VyYXRpb25Ob2RlW107XG5cdGFkZGVkRGVmYXVsdHM/OiBJQ29uZmlndXJhdGlvbkRlZmF1bHRzW107XG5cdGFkZGVkQ29uZmlndXJhdGlvbnM/OiBJQ29uZmlndXJhdGlvbk5vZGVbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IHtcblxuXHQvKipcblx0ICogUmVnaXN0ZXIgYSBjb25maWd1cmF0aW9uIHRvIHRoZSByZWdpc3RyeS5cblx0ICovXG5cdHJlZ2lzdGVyQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvbk5vZGUpOiBJQ29uZmlndXJhdGlvbk5vZGU7XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVyIG11bHRpcGxlIGNvbmZpZ3VyYXRpb25zIHRvIHRoZSByZWdpc3RyeS5cblx0ICovXG5cdHJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoY29uZmlndXJhdGlvbnM6IElDb25maWd1cmF0aW9uTm9kZVtdLCB2YWxpZGF0ZT86IGJvb2xlYW4pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBEZXJlZ2lzdGVyIG11bHRpcGxlIGNvbmZpZ3VyYXRpb25zIGZyb20gdGhlIHJlZ2lzdHJ5LlxuXHQgKi9cblx0ZGVyZWdpc3RlckNvbmZpZ3VyYXRpb25zKGNvbmZpZ3VyYXRpb25zOiBJQ29uZmlndXJhdGlvbk5vZGVbXSk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIHVwZGF0ZSB0aGUgY29uZmlndXJhdGlvbiByZWdpc3RyeSBieVxuXHQgKiBcdC0gcmVnaXN0ZXJpbmcgdGhlIGNvbmZpZ3VyYXRpb25zIHRvIGFkZFxuXHQgKiBcdC0gZGVyZWlnc3RlcmluZyB0aGUgY29uZmlndXJhdGlvbnMgdG8gcmVtb3ZlXG5cdCAqL1xuXHR1cGRhdGVDb25maWd1cmF0aW9ucyhjb25maWd1cmF0aW9uczogeyBhZGQ6IElDb25maWd1cmF0aW9uTm9kZVtdOyByZW1vdmU6IElDb25maWd1cmF0aW9uTm9kZVtdIH0pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBSZWdpc3RlciBtdWx0aXBsZSBkZWZhdWx0IGNvbmZpZ3VyYXRpb25zIHRvIHRoZSByZWdpc3RyeS5cblx0ICovXG5cdHJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKGRlZmF1bHRDb25maWd1cmF0aW9uczogSUNvbmZpZ3VyYXRpb25EZWZhdWx0c1tdKTogdm9pZDtcblxuXHQvKipcblx0ICogRGVyZWdpc3RlciBtdWx0aXBsZSBkZWZhdWx0IGNvbmZpZ3VyYXRpb25zIGZyb20gdGhlIHJlZ2lzdHJ5LlxuXHQgKi9cblx0ZGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhkZWZhdWx0Q29uZmlndXJhdGlvbnM6IElDb25maWd1cmF0aW9uRGVmYXVsdHNbXSk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEJ1bGsgdXBkYXRlIG9mIHRoZSBjb25maWd1cmF0aW9uIHJlZ2lzdHJ5IChkZWZhdWx0IGFuZCBjb25maWd1cmF0aW9ucywgcmVtb3ZlIGFuZCBhZGQpXG5cdCAqIEBwYXJhbSBkZWx0YVxuXHQgKi9cblx0ZGVsdGFDb25maWd1cmF0aW9uKGRlbHRhOiBJQ29uZmlndXJhdGlvbkRlbHRhKTogdm9pZDtcblxuXHQvKipcblx0ICogUmV0dXJuIHRoZSByZWdpc3RlcmVkIGRlZmF1bHQgY29uZmlndXJhdGlvbnNcblx0ICovXG5cdGdldFJlZ2lzdGVyZWREZWZhdWx0Q29uZmlndXJhdGlvbnMoKTogSUNvbmZpZ3VyYXRpb25EZWZhdWx0c1tdO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm4gdGhlIHJlZ2lzdGVyZWQgY29uZmlndXJhdGlvbiBkZWZhdWx0cyBvdmVycmlkZXNcblx0ICovXG5cdGdldENvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlcygpOiBNYXA8c3RyaW5nLCBJQ29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlPjtcblxuXHQvKipcblx0ICogU2lnbmFsIHRoYXQgdGhlIHNjaGVtYSBvZiBhIGNvbmZpZ3VyYXRpb24gc2V0dGluZyBoYXMgY2hhbmdlcy4gSXQgaXMgY3VycmVudGx5IG9ubHkgc3VwcG9ydGVkIHRvIGNoYW5nZSBlbnVtZXJhdGlvbiB2YWx1ZXMuXG5cdCAqIFByb3BlcnR5IG9yIGRlZmF1bHQgdmFsdWUgY2hhbmdlcyBhcmUgbm90IGFsbG93ZWQuXG5cdCAqL1xuXHRub3RpZnlDb25maWd1cmF0aW9uU2NoZW1hVXBkYXRlZCguLi5jb25maWd1cmF0aW9uczogSUNvbmZpZ3VyYXRpb25Ob2RlW10pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBFdmVudCB0aGF0IGZpcmVzIHdoZW5ldmVyIGEgY29uZmlndXJhdGlvbiBoYXMgYmVlblxuXHQgKiByZWdpc3RlcmVkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRTY2hlbWFDaGFuZ2U6IEV2ZW50PHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBFdmVudCB0aGF0IGZpcmVzIHdoZW5ldmVyIGEgY29uZmlndXJhdGlvbiBoYXMgYmVlblxuXHQgKiByZWdpc3RlcmVkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRVcGRhdGVDb25maWd1cmF0aW9uOiBFdmVudDx7IHByb3BlcnRpZXM6IFJlYWRvbmx5U2V0PHN0cmluZz47IGRlZmF1bHRzT3ZlcnJpZGVzPzogYm9vbGVhbiB9PjtcblxuXHQvKipcblx0ICogUmV0dXJucyBhbGwgY29uZmlndXJhdGlvbiBub2RlcyBjb250cmlidXRlZCB0byB0aGlzIHJlZ2lzdHJ5LlxuXHQgKi9cblx0Z2V0Q29uZmlndXJhdGlvbnMoKTogSUNvbmZpZ3VyYXRpb25Ob2RlW107XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYWxsIGNvbmZpZ3VyYXRpb25zIHNldHRpbmdzIG9mIGFsbCBjb25maWd1cmF0aW9uIG5vZGVzIGNvbnRyaWJ1dGVkIHRvIHRoaXMgcmVnaXN0cnkuXG5cdCAqL1xuXHRnZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpOiBJU3RyaW5nRGljdGlvbmFyeTxJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT47XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIG93bmluZyBzZXR0aW5nIGtleSBwZXIgcG9saWN5IG5hbWUgKGF0IG1vc3Qgb25lIG93bmVyIHBlciBuYW1lKS5cblx0ICovXG5cdGdldFBvbGljeUNvbmZpZ3VyYXRpb25zKCk6IE1hcDxQb2xpY3lOYW1lLCBzdHJpbmc+O1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSByZWZlcmVuY2luZyBzZXR0aW5nIGtleXMgcGVyIHBvbGljeSBuYW1lLlxuXHQgKi9cblx0Z2V0UG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMoKTogTWFwPFBvbGljeU5hbWUsIFNldDxzdHJpbmc+PjtcblxuXHQvKipcblx0ICogUmV0dXJucyBhbGwgZXhjbHVkZWQgY29uZmlndXJhdGlvbnMgc2V0dGluZ3Mgb2YgYWxsIGNvbmZpZ3VyYXRpb24gbm9kZXMgY29udHJpYnV0ZWQgdG8gdGhpcyByZWdpc3RyeS5cblx0ICovXG5cdGdldEV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXMoKTogSVN0cmluZ0RpY3Rpb25hcnk8SVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+O1xuXG5cdC8qKlxuXHQgKiBSZWdpc3RlciB0aGUgaWRlbnRpZmllcnMgZm9yIGVkaXRvciBjb25maWd1cmF0aW9uc1xuXHQgKi9cblx0cmVnaXN0ZXJPdmVycmlkZUlkZW50aWZpZXJzKGlkZW50aWZpZXJzOiBzdHJpbmdbXSk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIENvbmZpZ3VyYXRpb25TY29wZSB7XG5cdC8qKlxuXHQgKiBBcHBsaWNhdGlvbiBzcGVjaWZpYyBjb25maWd1cmF0aW9uLCB3aGljaCBjYW4gYmUgY29uZmlndXJlZCBvbmx5IGluIGRlZmF1bHQgcHJvZmlsZSB1c2VyIHNldHRpbmdzLlxuXHQgKi9cblx0QVBQTElDQVRJT04gPSAxLFxuXHQvKipcblx0ICogTWFjaGluZSBzcGVjaWZpYyBjb25maWd1cmF0aW9uLCB3aGljaCBjYW4gYmUgY29uZmlndXJlZCBvbmx5IGluIGxvY2FsIGFuZCByZW1vdGUgdXNlciBzZXR0aW5ncy5cblx0ICovXG5cdE1BQ0hJTkUsXG5cdC8qKlxuXHQgKiBBbiBhcHBsaWNhdGlvbiBtYWNoaW5lIHNwZWNpZmljIGNvbmZpZ3VyYXRpb24sIHdoaWNoIGNhbiBiZSBjb25maWd1cmVkIG9ubHkgaW4gZGVmYXVsdCBwcm9maWxlIHVzZXIgc2V0dGluZ3MgYW5kIHJlbW90ZSB1c2VyIHNldHRpbmdzLlxuXHQgKi9cblx0QVBQTElDQVRJT05fTUFDSElORSxcblx0LyoqXG5cdCAqIFdpbmRvdyBzcGVjaWZpYyBjb25maWd1cmF0aW9uLCB3aGljaCBjYW4gYmUgY29uZmlndXJlZCBpbiB0aGUgdXNlciBvciB3b3Jrc3BhY2Ugc2V0dGluZ3MuXG5cdCAqL1xuXHRXSU5ET1csXG5cdC8qKlxuXHQgKiBSZXNvdXJjZSBzcGVjaWZpYyBjb25maWd1cmF0aW9uLCB3aGljaCBjYW4gYmUgY29uZmlndXJlZCBpbiB0aGUgdXNlciwgd29ya3NwYWNlIG9yIGZvbGRlciBzZXR0aW5ncy5cblx0ICovXG5cdFJFU09VUkNFLFxuXHQvKipcblx0ICogUmVzb3VyY2Ugc3BlY2lmaWMgY29uZmlndXJhdGlvbiB0aGF0IGNhbiBiZSBjb25maWd1cmVkIGluIGxhbmd1YWdlIHNwZWNpZmljIHNldHRpbmdzXG5cdCAqL1xuXHRMQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0LyoqXG5cdCAqIE1hY2hpbmUgc3BlY2lmaWMgY29uZmlndXJhdGlvbiB0aGF0IGNhbiBhbHNvIGJlIGNvbmZpZ3VyZWQgaW4gd29ya3NwYWNlIG9yIGZvbGRlciBzZXR0aW5ncy5cblx0ICovXG5cdE1BQ0hJTkVfT1ZFUlJJREFCTEUsXG59XG5cblxuZXhwb3J0IGludGVyZmFjZSBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIGV4dGVuZHMgSUpTT05TY2hlbWEge1xuXG5cdHNjb3BlPzogQ29uZmlndXJhdGlvblNjb3BlO1xuXG5cdC8qKlxuXHQgKiBXaGVuIHJlc3RyaWN0ZWQsIHZhbHVlIG9mIHRoaXMgY29uZmlndXJhdGlvbiB3aWxsIGJlIHJlYWQgb25seSBmcm9tIHRydXN0ZWQgc291cmNlcy5cblx0ICogRm9yIGVnLiwgSWYgdGhlIHdvcmtzcGFjZSBpcyBub3QgdHJ1c3RlZCwgdGhlbiB0aGUgdmFsdWUgb2YgdGhpcyBjb25maWd1cmF0aW9uIGlzIG5vdCByZWFkIGZyb20gd29ya3NwYWNlIHNldHRpbmdzIGZpbGUuXG5cdCAqL1xuXHRyZXN0cmljdGVkPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogV2hlbiBgZmFsc2VgIHRoaXMgcHJvcGVydHkgaXMgZXhjbHVkZWQgZnJvbSB0aGUgcmVnaXN0cnkuIERlZmF1bHQgaXMgdG8gaW5jbHVkZS5cblx0ICovXG5cdGluY2x1ZGVkPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogTGlzdCBvZiB0YWdzIGFzc29jaWF0ZWQgdG8gdGhlIHByb3BlcnR5LlxuXHQgKiAgLSBBIHRhZyBjYW4gYmUgdXNlZCBmb3IgZmlsdGVyaW5nXG5cdCAqICAtIFVzZSBgZXhwZXJpbWVudGFsYCB0YWcgZm9yIG1hcmtpbmcgdGhlIHNldHRpbmcgYXMgZXhwZXJpbWVudGFsLlxuXHQgKi9cblx0dGFncz86IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBXaGVuIGVuYWJsZWQgdGhpcyBzZXR0aW5nIGlzIGlnbm9yZWQgZHVyaW5nIHN5bmMgYW5kIHVzZXIgY2FuIG92ZXJyaWRlIHRoaXMuXG5cdCAqL1xuXHRpZ25vcmVTeW5jPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogV2hlbiBlbmFibGVkIHRoaXMgc2V0dGluZyBpcyBpZ25vcmVkIGR1cmluZyBzeW5jIGFuZCB1c2VyIGNhbm5vdCBvdmVycmlkZSB0aGlzLlxuXHQgKi9cblx0ZGlzYWxsb3dTeW5jSWdub3JlPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogRGlzYWxsb3cgZXh0ZW5zaW9ucyB0byBjb250cmlidXRlIGNvbmZpZ3VyYXRpb24gZGVmYXVsdCB2YWx1ZSBmb3IgdGhpcyBzZXR0aW5nLlxuXHQgKi9cblx0ZGlzYWxsb3dDb25maWd1cmF0aW9uRGVmYXVsdD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIExhYmVscyBmb3IgZW51bWVyYXRpb24gaXRlbXNcblx0ICovXG5cdGVudW1JdGVtTGFiZWxzPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIGtleXdvcmRzIHVzZWQgZm9yIHNlYXJjaCBwdXJwb3Nlcy5cblx0ICovXG5cdGtleXdvcmRzPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIFdoZW4gc3BlY2lmaWVkLCBjb250cm9scyB0aGUgcHJlc2VudGF0aW9uIGZvcm1hdCBvZiBzdHJpbmcgc2V0dGluZ3MuXG5cdCAqIE90aGVyd2lzZSwgdGhlIHByZXNlbnRhdGlvbiBmb3JtYXQgZGVmYXVsdHMgdG8gYHNpbmdsZWxpbmVgLlxuXHQgKi9cblx0ZWRpdFByZXNlbnRhdGlvbj86IEVkaXRQcmVzZW50YXRpb25UeXBlcztcblxuXHQvKipcblx0ICogV2hlbiBzcGVjaWZpZWQsIGdpdmVzIGFuIG9yZGVyIG51bWJlciBmb3IgdGhlIHNldHRpbmdcblx0ICogd2l0aGluIHRoZSBzZXR0aW5ncyBlZGl0b3IuIE90aGVyd2lzZSwgdGhlIHNldHRpbmcgaXMgcGxhY2VkIGF0IHRoZSBlbmQuXG5cdCAqL1xuXHRvcmRlcj86IG51bWJlcjtcblxuXHQvKipcblx0ICogV2hlbiBzcGVjaWZpZWQsIHRoaXMgc2V0dGluZydzIHZhbHVlIGNhbiBhbHdheXMgYmUgb3ZlcndyaXR0ZW4gYnlcblx0ICogYSBzeXN0ZW0td2lkZSBwb2xpY3kuIEV4YWN0bHkgb25lIHNldHRpbmcgbWF5ICpvd24qIGEgZ2l2ZW4gcG9saWN5IG5hbWUuXG5cdCAqL1xuXHRwb2xpY3k/OiBJUG9saWN5O1xuXG5cdC8qKlxuXHQgKiBXaGVuIHNwZWNpZmllZCwgdGhpcyBzZXR0aW5nIGlzIGdvdmVybmVkIGJ5IGEgcG9saWN5IG93bmVkIGJ5IGFub3RoZXIgc2V0dGluZy5cblx0ICogQSBzZXR0aW5nIG11c3Qgbm90IGRlY2xhcmUgYm90aCBgcG9saWN5YCBhbmQgYHBvbGljeVJlZmVyZW5jZWAuXG5cdCAqIFRoZSB0eXBlIG11c3QgbWF0Y2ggdGhlIG93bmluZyBzZXR0aW5nIChlbmZvcmNlZCB3aGVuIGV4cG9ydGluZyB0aGUgcG9saWN5IGNhdGFsb2cpLlxuXHQgKi9cblx0cG9saWN5UmVmZXJlbmNlPzogSVBvbGljeVJlZmVyZW5jZTtcblxuXHQvKipcblx0ICogV2hlbiBzcGVjaWZpZWQsIHRoaXMgc2V0dGluZydzIGRlZmF1bHQgdmFsdWUgY2FuIGFsd2F5cyBiZSBvdmVyd3JpdHRlbiBieVxuXHQgKiBhbiBleHBlcmltZW50LlxuXHQgKi9cblx0ZXhwZXJpbWVudD86IHtcblx0XHQvKipcblx0XHQgKiBUaGUgbW9kZSBvZiB0aGUgZXhwZXJpbWVudC5cblx0XHQgKiAtIGBzdGFydHVwYDogVGhlIHNldHRpbmcgdmFsdWUgaXMgdXBkYXRlZCB0byB0aGUgZXhwZXJpbWVudCB2YWx1ZSBvbmx5IG9uIHN0YXJ0dXAuXG5cdFx0ICogLSBgYXV0b2A6IFRoZSBzZXR0aW5nIHZhbHVlIGlzIHVwZGF0ZWQgdG8gdGhlIGV4cGVyaW1lbnQgdmFsdWUgYXV0b21hdGljYWxseSAod2hlbmV2ZXIgdGhlIGV4cGVyaW1lbnQgdmFsdWUgY2hhbmdlcykuXG5cdFx0ICovXG5cdFx0bW9kZTogJ3N0YXJ0dXAnIHwgJ2F1dG8nO1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIG5hbWUgb2YgdGhlIGV4cGVyaW1lbnQuIEJ5IGRlZmF1bHQsIHRoaXMgaXMgYGNvbmZpZy4ke3NldHRpbmdJZH1gXG5cdFx0ICovXG5cdFx0bmFtZT86IHN0cmluZztcblx0fTtcblxuXHQvKipcblx0ICogV2hlbiBzcGVjaWZpZWQsIHByb3ZpZGVzIGNvbmZpZ3VyYXRpb24gb3ZlcnJpZGVzIGZvciB0aGUgQWdlbnRzIHdpbmRvdy5cblx0ICovXG5cdGFnZW50c1dpbmRvdz86IHtcblx0XHQvKipcblx0XHQgKiBPdmVycmlkZSBkZWZhdWx0IHZhbHVlIGZvciB0aGlzIHNldHRpbmcgaW4gdGhlIEFnZW50cyB3aW5kb3cuXG5cdFx0ICovXG5cdFx0ZGVmYXVsdD86IHVua25vd247XG5cblx0XHQvKipcblx0XHQgKiBXaGVuIGB0cnVlYCwgdGhpcyBzZXR0aW5nIGlzIHJlYWQtb25seSBpbiB0aGUgQWdlbnRzIHdpbmRvd1xuXHRcdCAqIGFuZCBjYW5ub3QgYmUgY2hhbmdlZCBieSB0aGUgdXNlci5cblx0XHQgKi9cblx0XHRyZWFkT25seT86IGJvb2xlYW47XG5cdH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvbkluZm8ge1xuXHRpZDogc3RyaW5nO1xuXHRkaXNwbGF5TmFtZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29uZmlndXJhdGlvbk5vZGUge1xuXHRpZD86IHN0cmluZztcblx0b3JkZXI/OiBudW1iZXI7XG5cdHR5cGU/OiBzdHJpbmcgfCBzdHJpbmdbXTtcblx0dGl0bGU/OiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRwcm9wZXJ0aWVzPzogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT47XG5cdGFsbE9mPzogSUNvbmZpZ3VyYXRpb25Ob2RlW107XG5cdHNjb3BlPzogQ29uZmlndXJhdGlvblNjb3BlO1xuXHRleHRlbnNpb25JbmZvPzogSUV4dGVuc2lvbkluZm87XG5cdHJlc3RyaWN0ZWRQcm9wZXJ0aWVzPzogc3RyaW5nW107XG59XG5cbmV4cG9ydCB0eXBlIENvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlID0gSUV4dGVuc2lvbkluZm8gfCBzdHJpbmc7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0NvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlRXF1YWxzKGE6IENvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlIHwgdW5kZWZpbmVkLCBiOiBDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRpZiAoYSA9PT0gYikge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlmICghYSB8fCAhYikge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAodHlwZW9mIGEgPT09ICdzdHJpbmcnIHx8IHR5cGVvZiBiID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBhID09PSBiO1xuXHR9XG5cdHJldHVybiBhLmlkID09PSBiLmlkO1xufVxuXG5leHBvcnQgdHlwZSBDb25maWd1cmF0aW9uRGVmYXVsdFZhbHVlU291cmNlID0gQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2UgfCBNYXA8c3RyaW5nLCBDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZT47XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbmZpZ3VyYXRpb25EZWZhdWx0cyB7XG5cdG92ZXJyaWRlczogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj47XG5cdHNvdXJjZT86IENvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlO1xuXHRkb25vdENhY2hlPzogYm9vbGVhbjtcblx0cHJldmVudEV4cGVyaW1lbnRPdmVycmlkZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCB0eXBlIElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hID0gSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSAmIHtcblx0c2VjdGlvbj86IHtcblx0XHRpZD86IHN0cmluZztcblx0XHR0aXRsZT86IHN0cmluZztcblx0XHRvcmRlcj86IG51bWJlcjtcblx0XHRleHRlbnNpb25JbmZvPzogSUV4dGVuc2lvbkluZm87XG5cdH07XG5cdGRlZmF1bHREZWZhdWx0VmFsdWU/OiB1bmtub3duO1xuXHRzb3VyY2U/OiBDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZTsgLy8gU291cmNlIG9mIHRoZSBQcm9wZXJ0eVxuXHRkZWZhdWx0VmFsdWVTb3VyY2U/OiBDb25maWd1cmF0aW9uRGVmYXVsdFZhbHVlU291cmNlOyAvLyBTb3VyY2Ugb2YgdGhlIERlZmF1bHQgVmFsdWVcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGUge1xuXHRyZWFkb25seSB2YWx1ZTogdW5rbm93bjtcblx0cmVhZG9ubHkgc291cmNlPzogQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2U7ICAvLyBTb3VyY2Ugb2YgdGhlIGRlZmF1bHQgb3ZlcnJpZGVcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlIHtcblx0cmVhZG9ubHkgdmFsdWU6IHVua25vd247XG5cdHJlYWRvbmx5IHNvdXJjZT86IENvbmZpZ3VyYXRpb25EZWZhdWx0VmFsdWVTb3VyY2U7XG59XG5cbmV4cG9ydCBjb25zdCBhbGxTZXR0aW5nczogeyBwcm9wZXJ0aWVzOiBJU3RyaW5nRGljdGlvbmFyeTxJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPjsgcGF0dGVyblByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+IH0gPSB7IHByb3BlcnRpZXM6IHt9LCBwYXR0ZXJuUHJvcGVydGllczoge30gfTtcbmV4cG9ydCBjb25zdCBhcHBsaWNhdGlvblNldHRpbmdzOiB7IHByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+OyBwYXR0ZXJuUHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4gfSA9IHsgcHJvcGVydGllczoge30sIHBhdHRlcm5Qcm9wZXJ0aWVzOiB7fSB9O1xuZXhwb3J0IGNvbnN0IGFwcGxpY2F0aW9uTWFjaGluZVNldHRpbmdzOiB7IHByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+OyBwYXR0ZXJuUHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4gfSA9IHsgcHJvcGVydGllczoge30sIHBhdHRlcm5Qcm9wZXJ0aWVzOiB7fSB9O1xuZXhwb3J0IGNvbnN0IG1hY2hpbmVTZXR0aW5nczogeyBwcm9wZXJ0aWVzOiBJU3RyaW5nRGljdGlvbmFyeTxJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPjsgcGF0dGVyblByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+IH0gPSB7IHByb3BlcnRpZXM6IHt9LCBwYXR0ZXJuUHJvcGVydGllczoge30gfTtcbmV4cG9ydCBjb25zdCBtYWNoaW5lT3ZlcnJpZGFibGVTZXR0aW5nczogeyBwcm9wZXJ0aWVzOiBJU3RyaW5nRGljdGlvbmFyeTxJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPjsgcGF0dGVyblByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+IH0gPSB7IHByb3BlcnRpZXM6IHt9LCBwYXR0ZXJuUHJvcGVydGllczoge30gfTtcbmV4cG9ydCBjb25zdCB3aW5kb3dTZXR0aW5nczogeyBwcm9wZXJ0aWVzOiBJU3RyaW5nRGljdGlvbmFyeTxJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPjsgcGF0dGVyblByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+IH0gPSB7IHByb3BlcnRpZXM6IHt9LCBwYXR0ZXJuUHJvcGVydGllczoge30gfTtcbmV4cG9ydCBjb25zdCByZXNvdXJjZVNldHRpbmdzOiB7IHByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+OyBwYXR0ZXJuUHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4gfSA9IHsgcHJvcGVydGllczoge30sIHBhdHRlcm5Qcm9wZXJ0aWVzOiB7fSB9O1xuXG5leHBvcnQgY29uc3QgcmVzb3VyY2VMYW5ndWFnZVNldHRpbmdzU2NoZW1hSWQgPSAndnNjb2RlOi8vc2NoZW1hcy9zZXR0aW5ncy9yZXNvdXJjZUxhbmd1YWdlJztcbmV4cG9ydCBjb25zdCBjb25maWd1cmF0aW9uRGVmYXVsdHNTY2hlbWFJZCA9ICd2c2NvZGU6Ly9zY2hlbWFzL3NldHRpbmdzL2NvbmZpZ3VyYXRpb25EZWZhdWx0cyc7XG5cbmNvbnN0IGNvbnRyaWJ1dGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUpTT05Db250cmlidXRpb25SZWdpc3RyeT4oSlNPTkV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5cbmNsYXNzIENvbmZpZ3VyYXRpb25SZWdpc3RyeSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlZ2lzdGVyZWRDb25maWd1cmF0aW9uRGVmYXVsdHM6IElDb25maWd1cmF0aW9uRGVmYXVsdHNbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlczogTWFwPHN0cmluZywgeyBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVbXTsgY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlPzogSUNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSB9Pjtcblx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0TGFuZ3VhZ2VDb25maWd1cmF0aW9uT3ZlcnJpZGVzTm9kZTogSUNvbmZpZ3VyYXRpb25Ob2RlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25Db250cmlidXRvcnM6IElDb25maWd1cmF0aW9uTm9kZVtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzOiBJU3RyaW5nRGljdGlvbmFyeTxJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT47XG5cdHByaXZhdGUgcmVhZG9ubHkgcG9saWN5Q29uZmlndXJhdGlvbnM6IE1hcDxQb2xpY3lOYW1lLCBzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb25zOiBNYXA8UG9saWN5TmFtZSwgU2V0PHN0cmluZz4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPjtcblx0cHJpdmF0ZSByZWFkb25seSByZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWE6IElKU09OU2NoZW1hO1xuXHRwcml2YXRlIHJlYWRvbmx5IG92ZXJyaWRlSWRlbnRpZmllcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNjaGVtYUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNjaGVtYUNoYW5nZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZFNjaGVtYUNoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZUNvbmZpZ3VyYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHByb3BlcnRpZXM6IFJlYWRvbmx5U2V0PHN0cmluZz47IGRlZmF1bHRzT3ZlcnJpZGVzPzogYm9vbGVhbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRVcGRhdGVDb25maWd1cmF0aW9uID0gdGhpcy5fb25EaWRVcGRhdGVDb25maWd1cmF0aW9uLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMgPSBuZXcgTWFwKCk7XG5cdFx0dGhpcy5kZWZhdWx0TGFuZ3VhZ2VDb25maWd1cmF0aW9uT3ZlcnJpZGVzTm9kZSA9IHtcblx0XHRcdGlkOiAnZGVmYXVsdE92ZXJyaWRlcycsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdkZWZhdWx0TGFuZ3VhZ2VDb25maWd1cmF0aW9uT3ZlcnJpZGVzLnRpdGxlJywgXCJEZWZhdWx0IExhbmd1YWdlIENvbmZpZ3VyYXRpb24gT3ZlcnJpZGVzXCIpLFxuXHRcdFx0cHJvcGVydGllczoge31cblx0XHR9O1xuXHRcdHRoaXMuY29uZmlndXJhdGlvbkNvbnRyaWJ1dG9ycyA9IFt0aGlzLmRlZmF1bHRMYW5ndWFnZUNvbmZpZ3VyYXRpb25PdmVycmlkZXNOb2RlXTtcblx0XHR0aGlzLnJlc291cmNlTGFuZ3VhZ2VTZXR0aW5nc1NjaGVtYSA9IHtcblx0XHRcdHByb3BlcnRpZXM6IHt9LFxuXHRcdFx0cGF0dGVyblByb3BlcnRpZXM6IHt9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHRydWUsXG5cdFx0XHRhbGxvd1RyYWlsaW5nQ29tbWFzOiB0cnVlLFxuXHRcdFx0YWxsb3dDb21tZW50czogdHJ1ZVxuXHRcdH07XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uUHJvcGVydGllcyA9IHt9O1xuXHRcdHRoaXMucG9saWN5Q29uZmlndXJhdGlvbnMgPSBuZXcgTWFwPFBvbGljeU5hbWUsIHN0cmluZz4oKTtcblx0XHR0aGlzLnBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb25zID0gbmV3IE1hcDxQb2xpY3lOYW1lLCBTZXQ8c3RyaW5nPj4oKTtcblx0XHR0aGlzLmV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXMgPSB7fTtcblxuXHRcdGNvbnRyaWJ1dGlvblJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKHJlc291cmNlTGFuZ3VhZ2VTZXR0aW5nc1NjaGVtYUlkLCB0aGlzLnJlc291cmNlTGFuZ3VhZ2VTZXR0aW5nc1NjaGVtYSk7XG5cdFx0dGhpcy5yZWdpc3Rlck92ZXJyaWRlUHJvcGVydHlQYXR0ZXJuS2V5KCk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uTm9kZSwgdmFsaWRhdGU6IGJvb2xlYW4gPSB0cnVlKTogSUNvbmZpZ3VyYXRpb25Ob2RlIHtcblx0XHR0aGlzLnJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoW2NvbmZpZ3VyYXRpb25dLCB2YWxpZGF0ZSk7XG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJDb25maWd1cmF0aW9ucyhjb25maWd1cmF0aW9uczogSUNvbmZpZ3VyYXRpb25Ob2RlW10sIHZhbGlkYXRlOiBib29sZWFuID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3BlcnRpZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR0aGlzLmRvUmVnaXN0ZXJDb25maWd1cmF0aW9ucyhjb25maWd1cmF0aW9ucywgdmFsaWRhdGUsIHByb3BlcnRpZXMpO1xuXG5cdFx0Y29udHJpYnV0aW9uUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEocmVzb3VyY2VMYW5ndWFnZVNldHRpbmdzU2NoZW1hSWQsIHRoaXMucmVzb3VyY2VMYW5ndWFnZVNldHRpbmdzU2NoZW1hKTtcblx0XHR0aGlzLl9vbkRpZFNjaGVtYUNoYW5nZS5maXJlKCk7XG5cdFx0dGhpcy5fb25EaWRVcGRhdGVDb25maWd1cmF0aW9uLmZpcmUoeyBwcm9wZXJ0aWVzIH0pO1xuXHR9XG5cblx0cHVibGljIGRlcmVnaXN0ZXJDb25maWd1cmF0aW9ucyhjb25maWd1cmF0aW9uczogSUNvbmZpZ3VyYXRpb25Ob2RlW10pOiB2b2lkIHtcblx0XHRjb25zdCBwcm9wZXJ0aWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dGhpcy5kb0RlcmVnaXN0ZXJDb25maWd1cmF0aW9ucyhjb25maWd1cmF0aW9ucywgcHJvcGVydGllcyk7XG5cblx0XHRjb250cmlidXRpb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYShyZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWFJZCwgdGhpcy5yZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWEpO1xuXHRcdHRoaXMuX29uRGlkU2NoZW1hQ2hhbmdlLmZpcmUoKTtcblx0XHR0aGlzLl9vbkRpZFVwZGF0ZUNvbmZpZ3VyYXRpb24uZmlyZSh7IHByb3BlcnRpZXMgfSk7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlQ29uZmlndXJhdGlvbnMoeyBhZGQsIHJlbW92ZSB9OiB7IGFkZDogSUNvbmZpZ3VyYXRpb25Ob2RlW107IHJlbW92ZTogSUNvbmZpZ3VyYXRpb25Ob2RlW10gfSk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3BlcnRpZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR0aGlzLmRvRGVyZWdpc3RlckNvbmZpZ3VyYXRpb25zKHJlbW92ZSwgcHJvcGVydGllcyk7XG5cdFx0dGhpcy5kb1JlZ2lzdGVyQ29uZmlndXJhdGlvbnMoYWRkLCBmYWxzZSwgcHJvcGVydGllcyk7XG5cblx0XHRjb250cmlidXRpb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYShyZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWFJZCwgdGhpcy5yZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWEpO1xuXHRcdHRoaXMuX29uRGlkU2NoZW1hQ2hhbmdlLmZpcmUoKTtcblx0XHR0aGlzLl9vbkRpZFVwZGF0ZUNvbmZpZ3VyYXRpb24uZmlyZSh7IHByb3BlcnRpZXMgfSk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoY29uZmlndXJhdGlvbkRlZmF1bHRzOiBJQ29uZmlndXJhdGlvbkRlZmF1bHRzW10pOiB2b2lkIHtcblx0XHRjb25zdCBwcm9wZXJ0aWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dGhpcy5kb1JlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKGNvbmZpZ3VyYXRpb25EZWZhdWx0cywgcHJvcGVydGllcyk7XG5cdFx0dGhpcy5fb25EaWRTY2hlbWFDaGFuZ2UuZmlyZSgpO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlQ29uZmlndXJhdGlvbi5maXJlKHsgcHJvcGVydGllcywgZGVmYXVsdHNPdmVycmlkZXM6IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIGRvUmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoY29uZmlndXJhdGlvbkRlZmF1bHRzOiBJQ29uZmlndXJhdGlvbkRlZmF1bHRzW10sIGJ1Y2tldDogU2V0PHN0cmluZz4pIHtcblxuXHRcdHRoaXMucmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25EZWZhdWx0cy5wdXNoKC4uLmNvbmZpZ3VyYXRpb25EZWZhdWx0cyk7XG5cblx0XHRjb25zdCBvdmVycmlkZUlkZW50aWZpZXJzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCB7IG92ZXJyaWRlcywgc291cmNlIH0gb2YgY29uZmlndXJhdGlvbkRlZmF1bHRzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBvdmVycmlkZXMpIHtcblx0XHRcdFx0YnVja2V0LmFkZChrZXkpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzRm9yS2V5ID0gdGhpcy5jb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMuZ2V0KGtleSlcblx0XHRcdFx0XHQ/PyB0aGlzLmNvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlcy5zZXQoa2V5LCB7IGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzOiBbXSB9KS5nZXQoa2V5KSE7XG5cblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBvdmVycmlkZXNba2V5XTtcblx0XHRcdFx0Y29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXNGb3JLZXkuY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXMucHVzaCh7IHZhbHVlLCBzb3VyY2UgfSk7XG5cblx0XHRcdFx0Ly8gQ29uZmlndXJhdGlvbiBkZWZhdWx0cyBmb3IgT3ZlcnJpZGUgSWRlbnRpZmllcnNcblx0XHRcdFx0aWYgKE9WRVJSSURFX1BST1BFUlRZX1JFR0VYLnRlc3Qoa2V5KSkge1xuXHRcdFx0XHRcdGNvbnN0IG5ld0RlZmF1bHRPdmVycmlkZSA9IHRoaXMubWVyZ2VEZWZhdWx0Q29uZmlndXJhdGlvbnNGb3JPdmVycmlkZUlkZW50aWZpZXIoa2V5LCB2YWx1ZSBhcyBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiwgc291cmNlLCBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlc0ZvcktleS5jb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUpO1xuXHRcdFx0XHRcdGlmICghbmV3RGVmYXVsdE92ZXJyaWRlKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlc0ZvcktleS5jb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUgPSBuZXdEZWZhdWx0T3ZlcnJpZGU7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVEZWZhdWx0T3ZlcnJpZGVQcm9wZXJ0eShrZXksIG5ld0RlZmF1bHRPdmVycmlkZSwgc291cmNlKTtcblx0XHRcdFx0XHRvdmVycmlkZUlkZW50aWZpZXJzLnB1c2goLi4ub3ZlcnJpZGVJZGVudGlmaWVyc0Zyb21LZXkoa2V5KSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDb25maWd1cmF0aW9uIGRlZmF1bHRzIGZvciBDb25maWd1cmF0aW9uIFByb3BlcnRpZXNcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV3RGVmYXVsdE92ZXJyaWRlID0gdGhpcy5tZXJnZURlZmF1bHRDb25maWd1cmF0aW9uc0ZvckNvbmZpZ3VyYXRpb25Qcm9wZXJ0eShrZXksIHZhbHVlLCBzb3VyY2UsIGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzRm9yS2V5LmNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSk7XG5cdFx0XHRcdFx0aWYgKCFuZXdEZWZhdWx0T3ZlcnJpZGUpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzRm9yS2V5LmNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSA9IG5ld0RlZmF1bHRPdmVycmlkZTtcblx0XHRcdFx0XHRjb25zdCBwcm9wZXJ0eSA9IHRoaXMuY29uZmlndXJhdGlvblByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0XHRpZiAocHJvcGVydHkpIHtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlUHJvcGVydHlEZWZhdWx0VmFsdWUoa2V5LCBwcm9wZXJ0eSk7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVNjaGVtYShrZXksIHByb3BlcnR5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuZG9SZWdpc3Rlck92ZXJyaWRlSWRlbnRpZmllcnMob3ZlcnJpZGVJZGVudGlmaWVycyk7XG5cdH1cblxuXHRwdWJsaWMgZGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhkZWZhdWx0Q29uZmlndXJhdGlvbnM6IElDb25maWd1cmF0aW9uRGVmYXVsdHNbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3BlcnRpZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR0aGlzLmRvRGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhkZWZhdWx0Q29uZmlndXJhdGlvbnMsIHByb3BlcnRpZXMpO1xuXHRcdHRoaXMuX29uRGlkU2NoZW1hQ2hhbmdlLmZpcmUoKTtcblx0XHR0aGlzLl9vbkRpZFVwZGF0ZUNvbmZpZ3VyYXRpb24uZmlyZSh7IHByb3BlcnRpZXMsIGRlZmF1bHRzT3ZlcnJpZGVzOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0RlcmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoZGVmYXVsdENvbmZpZ3VyYXRpb25zOiBJQ29uZmlndXJhdGlvbkRlZmF1bHRzW10sIGJ1Y2tldDogU2V0PHN0cmluZz4pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGRlZmF1bHRDb25maWd1cmF0aW9uIG9mIGRlZmF1bHRDb25maWd1cmF0aW9ucykge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLnJlZ2lzdGVyZWRDb25maWd1cmF0aW9uRGVmYXVsdHMuaW5kZXhPZihkZWZhdWx0Q29uZmlndXJhdGlvbik7XG5cdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25EZWZhdWx0cy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgeyBvdmVycmlkZXMsIHNvdXJjZSB9IG9mIGRlZmF1bHRDb25maWd1cmF0aW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gb3ZlcnJpZGVzKSB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzRm9yS2V5ID0gdGhpcy5jb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMuZ2V0KGtleSk7XG5cdFx0XHRcdGlmICghY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXNGb3JLZXkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXNGb3JLZXkuY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXNcblx0XHRcdFx0XHQuZmluZEluZGV4KGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGUgPT4gc291cmNlID8gaXNDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZUVxdWFscyhjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlLnNvdXJjZSwgc291cmNlKSA6IGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGUudmFsdWUgPT09IG92ZXJyaWRlc1trZXldKTtcblx0XHRcdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXNGb3JLZXkuY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0aWYgKGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzRm9yS2V5LmNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKE9WRVJSSURFX1BST1BFUlRZX1JFR0VYLnRlc3Qoa2V5KSkge1xuXHRcdFx0XHRcdGxldCBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWU6IElDb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlIG9mIGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzRm9yS2V5LmNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzKSB7XG5cdFx0XHRcdFx0XHRjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUgPSB0aGlzLm1lcmdlRGVmYXVsdENvbmZpZ3VyYXRpb25zRm9yT3ZlcnJpZGVJZGVudGlmaWVyKGtleSwgY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZS52YWx1ZSBhcyBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiwgY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZS5zb3VyY2UsIGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUgJiYgIXR5cGVzLmlzRW1wdHlPYmplY3QoY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlLnZhbHVlKSkge1xuXHRcdFx0XHRcdFx0Y29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXNGb3JLZXkuY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlID0gY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlO1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVEZWZhdWx0T3ZlcnJpZGVQcm9wZXJ0eShrZXksIGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSwgc291cmNlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdFx0XHRkZWxldGUgdGhpcy5jb25maWd1cmF0aW9uUHJvcGVydGllc1trZXldO1xuXHRcdFx0XHRcdFx0ZGVsZXRlIHRoaXMuZGVmYXVsdExhbmd1YWdlQ29uZmlndXJhdGlvbk92ZXJyaWRlc05vZGUucHJvcGVydGllcyFba2V5XTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGV0IGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZTogSUNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGUgb2YgY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXNGb3JLZXkuY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXMpIHtcblx0XHRcdFx0XHRcdGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSA9IHRoaXMubWVyZ2VEZWZhdWx0Q29uZmlndXJhdGlvbnNGb3JDb25maWd1cmF0aW9uUHJvcGVydHkoa2V5LCBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlLnZhbHVlLCBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlLnNvdXJjZSwgY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXNGb3JLZXkuY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlID0gY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlO1xuXHRcdFx0XHRcdGNvbnN0IHByb3BlcnR5ID0gdGhpcy5jb25maWd1cmF0aW9uUHJvcGVydGllc1trZXldO1xuXHRcdFx0XHRcdGlmIChwcm9wZXJ0eSkge1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVQcm9wZXJ0eURlZmF1bHRWYWx1ZShrZXksIHByb3BlcnR5KTtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlU2NoZW1hKGtleSwgcHJvcGVydHkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRidWNrZXQuYWRkKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlT3ZlcnJpZGVQcm9wZXJ0eVBhdHRlcm5LZXkoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRGVmYXVsdE92ZXJyaWRlUHJvcGVydHkoa2V5OiBzdHJpbmcsIG5ld0RlZmF1bHRPdmVycmlkZTogSUNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSwgc291cmNlOiBDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3BlcnR5OiBJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHtcblx0XHRcdHNlY3Rpb246IHtcblx0XHRcdFx0aWQ6IHRoaXMuZGVmYXVsdExhbmd1YWdlQ29uZmlndXJhdGlvbk92ZXJyaWRlc05vZGUuaWQsXG5cdFx0XHRcdHRpdGxlOiB0aGlzLmRlZmF1bHRMYW5ndWFnZUNvbmZpZ3VyYXRpb25PdmVycmlkZXNOb2RlLnRpdGxlLFxuXHRcdFx0XHRvcmRlcjogdGhpcy5kZWZhdWx0TGFuZ3VhZ2VDb25maWd1cmF0aW9uT3ZlcnJpZGVzTm9kZS5vcmRlcixcblx0XHRcdFx0ZXh0ZW5zaW9uSW5mbzogdGhpcy5kZWZhdWx0TGFuZ3VhZ2VDb25maWd1cmF0aW9uT3ZlcnJpZGVzTm9kZS5leHRlbnNpb25JbmZvXG5cdFx0XHR9LFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0OiBuZXdEZWZhdWx0T3ZlcnJpZGUudmFsdWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdkZWZhdWx0TGFuZ3VhZ2VDb25maWd1cmF0aW9uLmRlc2NyaXB0aW9uJywgXCJDb25maWd1cmUgc2V0dGluZ3MgdG8gYmUgb3ZlcnJpZGRlbiBmb3IgezB9LlwiLCBnZXRMYW5ndWFnZVRhZ1NldHRpbmdQbGFpbktleShrZXkpKSxcblx0XHRcdCRyZWY6IHJlc291cmNlTGFuZ3VhZ2VTZXR0aW5nc1NjaGVtYUlkLFxuXHRcdFx0ZGVmYXVsdERlZmF1bHRWYWx1ZTogbmV3RGVmYXVsdE92ZXJyaWRlLnZhbHVlLFxuXHRcdFx0c291cmNlLFxuXHRcdFx0ZGVmYXVsdFZhbHVlU291cmNlOiBzb3VyY2Vcblx0XHR9O1xuXHRcdHRoaXMuY29uZmlndXJhdGlvblByb3BlcnRpZXNba2V5XSA9IHByb3BlcnR5O1xuXHRcdHRoaXMuZGVmYXVsdExhbmd1YWdlQ29uZmlndXJhdGlvbk92ZXJyaWRlc05vZGUucHJvcGVydGllcyFba2V5XSA9IHByb3BlcnR5O1xuXHR9XG5cblx0cHJpdmF0ZSBtZXJnZURlZmF1bHRDb25maWd1cmF0aW9uc0Zvck92ZXJyaWRlSWRlbnRpZmllcihvdmVycmlkZUlkZW50aWZpZXI6IHN0cmluZywgY29uZmlndXJhdGlvblZhbHVlT2JqZWN0OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiwgdmFsdWVTb3VyY2U6IENvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlIHwgdW5kZWZpbmVkLCBleGlzdGluZ0RlZmF1bHRPdmVycmlkZTogSUNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSB8IHVuZGVmaW5lZCk6IElDb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRlZmF1bHRWYWx1ZSA9IGV4aXN0aW5nRGVmYXVsdE92ZXJyaWRlPy52YWx1ZSB8fCB7fTtcblx0XHRjb25zdCBzb3VyY2UgPSBleGlzdGluZ0RlZmF1bHRPdmVycmlkZT8uc291cmNlID8/IG5ldyBNYXA8c3RyaW5nLCBDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZT4oKTtcblxuXHRcdC8vIFRoaXMgc2hvdWxkIG5vdCBoYXBwZW5cblx0XHRpZiAoIShzb3VyY2UgaW5zdGFuY2VvZiBNYXApKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdvYmplY3RDb25maWd1cmF0aW9uU291cmNlcyBpcyBub3QgYSBNYXAnKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBwcm9wZXJ0eUtleSBvZiBPYmplY3Qua2V5cyhjb25maWd1cmF0aW9uVmFsdWVPYmplY3QpKSB7XG5cdFx0XHRjb25zdCBwcm9wZXJ0eURlZmF1bHRWYWx1ZSA9IGNvbmZpZ3VyYXRpb25WYWx1ZU9iamVjdFtwcm9wZXJ0eUtleV07XG5cblx0XHRcdGNvbnN0IGlzT2JqZWN0U2V0dGluZyA9IHR5cGVzLmlzT2JqZWN0KHByb3BlcnR5RGVmYXVsdFZhbHVlKSAmJlxuXHRcdFx0XHQodHlwZXMuaXNVbmRlZmluZWQoKGRlZmF1bHRWYWx1ZSBhcyBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPilbcHJvcGVydHlLZXldKSB8fCB0eXBlcy5pc09iamVjdCgoZGVmYXVsdFZhbHVlIGFzIElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+KVtwcm9wZXJ0eUtleV0pKTtcblxuXHRcdFx0Ly8gSWYgdGhlIGRlZmF1bHQgdmFsdWUgaXMgYW4gb2JqZWN0LCBtZXJnZSB0aGUgb2JqZWN0cyBhbmQgc3RvcmUgdGhlIHNvdXJjZSBvZiBlYWNoIGtleXNcblx0XHRcdGlmIChpc09iamVjdFNldHRpbmcpIHtcblx0XHRcdFx0KGRlZmF1bHRWYWx1ZSBhcyBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPilbcHJvcGVydHlLZXldID0geyAuLi4oKGRlZmF1bHRWYWx1ZSBhcyBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPilbcHJvcGVydHlLZXldID8/IHt9KSwgLi4ucHJvcGVydHlEZWZhdWx0VmFsdWUgfTtcblx0XHRcdFx0Ly8gVHJhY2sgdGhlIHNvdXJjZSBvZiBlYWNoIHZhbHVlIGluIHRoZSBvYmplY3Rcblx0XHRcdFx0aWYgKHZhbHVlU291cmNlKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBvYmplY3RLZXkgaW4gcHJvcGVydHlEZWZhdWx0VmFsdWUpIHtcblx0XHRcdFx0XHRcdHNvdXJjZS5zZXQoYCR7cHJvcGVydHlLZXl9LiR7b2JqZWN0S2V5fWAsIHZhbHVlU291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gUHJpbWl0aXZlIHZhbHVlcyBhcmUgb3ZlcnJpZGRlblxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdChkZWZhdWx0VmFsdWUgYXMgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4pW3Byb3BlcnR5S2V5XSA9IHByb3BlcnR5RGVmYXVsdFZhbHVlO1xuXHRcdFx0XHRpZiAodmFsdWVTb3VyY2UpIHtcblx0XHRcdFx0XHRzb3VyY2Uuc2V0KHByb3BlcnR5S2V5LCB2YWx1ZVNvdXJjZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c291cmNlLmRlbGV0ZShwcm9wZXJ0eUtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyB2YWx1ZTogZGVmYXVsdFZhbHVlLCBzb3VyY2UgfTtcblx0fVxuXG5cdHByaXZhdGUgbWVyZ2VEZWZhdWx0Q29uZmlndXJhdGlvbnNGb3JDb25maWd1cmF0aW9uUHJvcGVydHkocHJvcGVydHlLZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIHZhbHVlc1NvdXJjZTogQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2UgfCB1bmRlZmluZWQsIGV4aXN0aW5nRGVmYXVsdE92ZXJyaWRlOiBJQ29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlIHwgdW5kZWZpbmVkKTogSUNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcHJvcGVydHkgPSB0aGlzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW3Byb3BlcnR5S2V5XTtcblx0XHRjb25zdCBleGlzdGluZ0RlZmF1bHRWYWx1ZSA9IGV4aXN0aW5nRGVmYXVsdE92ZXJyaWRlPy52YWx1ZSA/PyBwcm9wZXJ0eT8uZGVmYXVsdERlZmF1bHRWYWx1ZTtcblx0XHRsZXQgc291cmNlOiBDb25maWd1cmF0aW9uRGVmYXVsdFZhbHVlU291cmNlIHwgdW5kZWZpbmVkID0gdmFsdWVzU291cmNlO1xuXG5cdFx0Y29uc3QgaXNPYmplY3RTZXR0aW5nID0gdHlwZXMuaXNPYmplY3QodmFsdWUpICYmXG5cdFx0XHQoXG5cdFx0XHRcdHByb3BlcnR5ICE9PSB1bmRlZmluZWQgJiYgcHJvcGVydHkudHlwZSA9PT0gJ29iamVjdCcgfHxcblx0XHRcdFx0cHJvcGVydHkgPT09IHVuZGVmaW5lZCAmJiAodHlwZXMuaXNVbmRlZmluZWQoZXhpc3RpbmdEZWZhdWx0VmFsdWUpIHx8IHR5cGVzLmlzT2JqZWN0KGV4aXN0aW5nRGVmYXVsdFZhbHVlKSlcblx0XHRcdCk7XG5cblx0XHQvLyBJZiB0aGUgZGVmYXVsdCB2YWx1ZSBpcyBhbiBvYmplY3QsIG1lcmdlIHRoZSBvYmplY3RzIGFuZCBzdG9yZSB0aGUgc291cmNlIG9mIGVhY2gga2V5c1xuXHRcdGlmIChpc09iamVjdFNldHRpbmcpIHtcblx0XHRcdHNvdXJjZSA9IGV4aXN0aW5nRGVmYXVsdE92ZXJyaWRlPy5zb3VyY2UgPz8gbmV3IE1hcDxzdHJpbmcsIENvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlPigpO1xuXG5cdFx0XHQvLyBUaGlzIHNob3VsZCBub3QgaGFwcGVuXG5cdFx0XHRpZiAoIShzb3VyY2UgaW5zdGFuY2VvZiBNYXApKSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ2RlZmF1bHRWYWx1ZVNvdXJjZSBpcyBub3QgYSBNYXAnKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBvYmplY3RLZXkgaW4gKHZhbHVlIGFzIElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+KSkge1xuXHRcdFx0XHRpZiAodmFsdWVzU291cmNlKSB7XG5cdFx0XHRcdFx0c291cmNlLnNldChgJHtwcm9wZXJ0eUtleX0uJHtvYmplY3RLZXl9YCwgdmFsdWVzU291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dmFsdWUgPSB7IC4uLih0eXBlcy5pc09iamVjdChleGlzdGluZ0RlZmF1bHRWYWx1ZSkgPyBleGlzdGluZ0RlZmF1bHRWYWx1ZSA6IHt9KSwgLi4uKHZhbHVlIGFzIElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+KSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHZhbHVlLCBzb3VyY2UgfTtcblx0fVxuXG5cdHB1YmxpYyBkZWx0YUNvbmZpZ3VyYXRpb24oZGVsdGE6IElDb25maWd1cmF0aW9uRGVsdGEpOiB2b2lkIHtcblx0XHQvLyBkZWZhdWx0czogcmVtb3ZlXG5cdFx0bGV0IGRlZmF1bHRzT3ZlcnJpZGVzID0gZmFsc2U7XG5cdFx0Y29uc3QgcHJvcGVydGllcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGlmIChkZWx0YS5yZW1vdmVkRGVmYXVsdHMpIHtcblx0XHRcdHRoaXMuZG9EZXJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKGRlbHRhLnJlbW92ZWREZWZhdWx0cywgcHJvcGVydGllcyk7XG5cdFx0XHRkZWZhdWx0c092ZXJyaWRlcyA9IHRydWU7XG5cdFx0fVxuXHRcdC8vIGRlZmF1bHRzOiBhZGRcblx0XHRpZiAoZGVsdGEuYWRkZWREZWZhdWx0cykge1xuXHRcdFx0dGhpcy5kb1JlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKGRlbHRhLmFkZGVkRGVmYXVsdHMsIHByb3BlcnRpZXMpO1xuXHRcdFx0ZGVmYXVsdHNPdmVycmlkZXMgPSB0cnVlO1xuXHRcdH1cblx0XHQvLyBjb25maWd1cmF0aW9uczogcmVtb3ZlXG5cdFx0aWYgKGRlbHRhLnJlbW92ZWRDb25maWd1cmF0aW9ucykge1xuXHRcdFx0dGhpcy5kb0RlcmVnaXN0ZXJDb25maWd1cmF0aW9ucyhkZWx0YS5yZW1vdmVkQ29uZmlndXJhdGlvbnMsIHByb3BlcnRpZXMpO1xuXHRcdH1cblx0XHQvLyBjb25maWd1cmF0aW9uczogYWRkXG5cdFx0aWYgKGRlbHRhLmFkZGVkQ29uZmlndXJhdGlvbnMpIHtcblx0XHRcdHRoaXMuZG9SZWdpc3RlckNvbmZpZ3VyYXRpb25zKGRlbHRhLmFkZGVkQ29uZmlndXJhdGlvbnMsIGZhbHNlLCBwcm9wZXJ0aWVzKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRTY2hlbWFDaGFuZ2UuZmlyZSgpO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlQ29uZmlndXJhdGlvbi5maXJlKHsgcHJvcGVydGllcywgZGVmYXVsdHNPdmVycmlkZXMgfSk7XG5cdH1cblxuXHRwdWJsaWMgbm90aWZ5Q29uZmlndXJhdGlvblNjaGVtYVVwZGF0ZWQoLi4uY29uZmlndXJhdGlvbnM6IElDb25maWd1cmF0aW9uTm9kZVtdKSB7XG5cdFx0dGhpcy5fb25EaWRTY2hlbWFDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyT3ZlcnJpZGVJZGVudGlmaWVycyhvdmVycmlkZUlkZW50aWZpZXJzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdHRoaXMuZG9SZWdpc3Rlck92ZXJyaWRlSWRlbnRpZmllcnMob3ZlcnJpZGVJZGVudGlmaWVycyk7XG5cdFx0dGhpcy5fb25EaWRTY2hlbWFDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1JlZ2lzdGVyT3ZlcnJpZGVJZGVudGlmaWVycyhvdmVycmlkZUlkZW50aWZpZXJzOiBzdHJpbmdbXSkge1xuXHRcdGZvciAoY29uc3Qgb3ZlcnJpZGVJZGVudGlmaWVyIG9mIG92ZXJyaWRlSWRlbnRpZmllcnMpIHtcblx0XHRcdHRoaXMub3ZlcnJpZGVJZGVudGlmaWVycy5hZGQob3ZlcnJpZGVJZGVudGlmaWVyKTtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVPdmVycmlkZVByb3BlcnR5UGF0dGVybktleSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1JlZ2lzdGVyQ29uZmlndXJhdGlvbnMoY29uZmlndXJhdGlvbnM6IElDb25maWd1cmF0aW9uTm9kZVtdLCB2YWxpZGF0ZTogYm9vbGVhbiwgYnVja2V0OiBTZXQ8c3RyaW5nPik6IHZvaWQge1xuXG5cdFx0Y29uZmlndXJhdGlvbnMuZm9yRWFjaChjb25maWd1cmF0aW9uID0+IHtcblxuXHRcdFx0dGhpcy52YWxpZGF0ZUFuZFJlZ2lzdGVyUHJvcGVydGllcyhjb25maWd1cmF0aW9uLCB2YWxpZGF0ZSwgY29uZmlndXJhdGlvbi5leHRlbnNpb25JbmZvLCBjb25maWd1cmF0aW9uLnJlc3RyaWN0ZWRQcm9wZXJ0aWVzLCB1bmRlZmluZWQsIGJ1Y2tldCk7XG5cblx0XHRcdHRoaXMuY29uZmlndXJhdGlvbkNvbnRyaWJ1dG9ycy5wdXNoKGNvbmZpZ3VyYXRpb24pO1xuXHRcdFx0dGhpcy5yZWdpc3RlckpTT05Db25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb24pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0RlcmVnaXN0ZXJDb25maWd1cmF0aW9ucyhjb25maWd1cmF0aW9uczogSUNvbmZpZ3VyYXRpb25Ob2RlW10sIGJ1Y2tldDogU2V0PHN0cmluZz4pOiB2b2lkIHtcblxuXHRcdGNvbnN0IGRlcmVnaXN0ZXJDb25maWd1cmF0aW9uID0gKGNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uTm9kZSkgPT4ge1xuXHRcdFx0aWYgKGNvbmZpZ3VyYXRpb24ucHJvcGVydGllcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBjb25maWd1cmF0aW9uLnByb3BlcnRpZXMpIHtcblx0XHRcdFx0XHRidWNrZXQuYWRkKGtleSk7XG5cdFx0XHRcdFx0Y29uc3QgcHJvcGVydHkgPSB0aGlzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdFx0aWYgKHByb3BlcnR5Py5wb2xpY3k/Lm5hbWUpIHtcblx0XHRcdFx0XHRcdHRoaXMucG9saWN5Q29uZmlndXJhdGlvbnMuZGVsZXRlKHByb3BlcnR5LnBvbGljeS5uYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHByb3BlcnR5Py5wb2xpY3lSZWZlcmVuY2U/Lm5hbWUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlZnMgPSB0aGlzLnBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb25zLmdldChwcm9wZXJ0eS5wb2xpY3lSZWZlcmVuY2UubmFtZSk7XG5cdFx0XHRcdFx0XHRpZiAocmVmcykge1xuXHRcdFx0XHRcdFx0XHRyZWZzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRcdFx0XHRpZiAocmVmcy5zaXplID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5wb2xpY3lSZWZlcmVuY2VDb25maWd1cmF0aW9ucy5kZWxldGUocHJvcGVydHkucG9saWN5UmVmZXJlbmNlLm5hbWUpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRlbGV0ZSB0aGlzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdFx0dGhpcy5yZW1vdmVGcm9tU2NoZW1hKGtleSwgY29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzW2tleV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25maWd1cmF0aW9uLmFsbE9mPy5mb3JFYWNoKG5vZGUgPT4gZGVyZWdpc3RlckNvbmZpZ3VyYXRpb24obm9kZSkpO1xuXHRcdH07XG5cdFx0Zm9yIChjb25zdCBjb25maWd1cmF0aW9uIG9mIGNvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHRkZXJlZ2lzdGVyQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uKTtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5jb25maWd1cmF0aW9uQ29udHJpYnV0b3JzLmluZGV4T2YoY29uZmlndXJhdGlvbik7XG5cdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvbkNvbnRyaWJ1dG9ycy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVBbmRSZWdpc3RlclByb3BlcnRpZXMoY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Ob2RlLCB2YWxpZGF0ZTogYm9vbGVhbiA9IHRydWUsIGV4dGVuc2lvbkluZm86IElFeHRlbnNpb25JbmZvIHwgdW5kZWZpbmVkLCByZXN0cmljdGVkUHJvcGVydGllczogc3RyaW5nW10gfCB1bmRlZmluZWQsIHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUgPSBDb25maWd1cmF0aW9uU2NvcGUuV0lORE9XLCBidWNrZXQ6IFNldDxzdHJpbmc+KTogdm9pZCB7XG5cdFx0c2NvcGUgPSB0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbChjb25maWd1cmF0aW9uLnNjb3BlKSA/IHNjb3BlIDogY29uZmlndXJhdGlvbi5zY29wZTtcblx0XHRjb25zdCBwcm9wZXJ0aWVzID0gY29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzO1xuXHRcdGlmIChwcm9wZXJ0aWVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBwcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdGNvbnN0IHByb3BlcnR5OiBJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0cHJvcGVydHkuc2VjdGlvbiA9IHtcblx0XHRcdFx0XHRpZDogY29uZmlndXJhdGlvbi5pZCxcblx0XHRcdFx0XHR0aXRsZTogY29uZmlndXJhdGlvbi50aXRsZSxcblx0XHRcdFx0XHRvcmRlcjogY29uZmlndXJhdGlvbi5vcmRlcixcblx0XHRcdFx0XHRleHRlbnNpb25JbmZvOiBjb25maWd1cmF0aW9uLmV4dGVuc2lvbkluZm9cblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKHZhbGlkYXRlICYmIHZhbGlkYXRlUHJvcGVydHkoa2V5LCBwcm9wZXJ0eSwgZXh0ZW5zaW9uSW5mbz8uaWQpKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIHByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByb3BlcnR5LnNvdXJjZSA9IGV4dGVuc2lvbkluZm87XG5cblx0XHRcdFx0Ly8gdXBkYXRlIGRlZmF1bHQgdmFsdWVcblx0XHRcdFx0cHJvcGVydHkuZGVmYXVsdERlZmF1bHRWYWx1ZSA9IHByb3BlcnRpZXNba2V5XS5kZWZhdWx0O1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVByb3BlcnR5RGVmYXVsdFZhbHVlKGtleSwgcHJvcGVydHkpO1xuXG5cdFx0XHRcdC8vIHVwZGF0ZSBzY29wZVxuXHRcdFx0XHRpZiAoT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChrZXkpKSB7XG5cdFx0XHRcdFx0cHJvcGVydHkuc2NvcGUgPSB1bmRlZmluZWQ7IC8vIE5vIHNjb3BlIGZvciBvdmVycmlkYWJsZSBwcm9wZXJ0aWVzIGBbJHtpZGVudGlmaWVyfV1gXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cHJvcGVydHkuc2NvcGUgPSB0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbChwcm9wZXJ0eS5zY29wZSkgPyBzY29wZSA6IHByb3BlcnR5LnNjb3BlO1xuXHRcdFx0XHRcdHByb3BlcnR5LnJlc3RyaWN0ZWQgPSB0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbChwcm9wZXJ0eS5yZXN0cmljdGVkKSA/ICEhcmVzdHJpY3RlZFByb3BlcnRpZXM/LmluY2x1ZGVzKGtleSkgOiBwcm9wZXJ0eS5yZXN0cmljdGVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHByb3BlcnR5LmV4cGVyaW1lbnQpIHtcblx0XHRcdFx0XHRpZiAoIXByb3BlcnR5LnRhZ3M/LnNvbWUodGFnID0+IHRhZy50b0xvd2VyQ2FzZSgpID09PSAnb25leHAnKSkge1xuXHRcdFx0XHRcdFx0cHJvcGVydHkudGFncyA9IHByb3BlcnR5LnRhZ3MgPz8gW107XG5cdFx0XHRcdFx0XHRwcm9wZXJ0eS50YWdzLnB1c2goJ29uRXhQJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKHByb3BlcnR5LnRhZ3M/LnNvbWUodGFnID0+IHRhZy50b0xvd2VyQ2FzZSgpID09PSAnb25leHAnKSkge1xuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoYEludmFsaWQgdGFnICdvbkV4UCcgZm91bmQgZm9yIHByb3BlcnR5ICcke2tleX0nLiBQbGVhc2UgdXNlICdleHBlcmltZW50JyBwcm9wZXJ0eSBpbnN0ZWFkLmApO1xuXHRcdFx0XHRcdHByb3BlcnR5LmV4cGVyaW1lbnQgPSB7IG1vZGU6ICdzdGFydHVwJyB9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZXhjbHVkZWQgPSBwcm9wZXJ0aWVzW2tleV0uaGFzT3duUHJvcGVydHkoJ2luY2x1ZGVkJykgJiYgIXByb3BlcnRpZXNba2V5XS5pbmNsdWRlZDtcblx0XHRcdFx0Y29uc3QgcG9saWN5TmFtZSA9IHByb3BlcnRpZXNba2V5XS5wb2xpY3k/Lm5hbWU7XG5cdFx0XHRcdGNvbnN0IHBvbGljeVJlZmVyZW5jZU5hbWUgPSBwcm9wZXJ0aWVzW2tleV0ucG9saWN5UmVmZXJlbmNlPy5uYW1lO1xuXG5cdFx0XHRcdGlmIChleGNsdWRlZCkge1xuXHRcdFx0XHRcdHRoaXMuZXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllc1trZXldID0gcHJvcGVydGllc1trZXldO1xuXHRcdFx0XHRcdGlmIChwb2xpY3lOYW1lKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnBvbGljeUNvbmZpZ3VyYXRpb25zLnNldChwb2xpY3lOYW1lLCBrZXkpO1xuXHRcdFx0XHRcdFx0YnVja2V0LmFkZChrZXkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocG9saWN5UmVmZXJlbmNlTmFtZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5hZGRQb2xpY3lSZWZlcmVuY2VDb25maWd1cmF0aW9uKHBvbGljeVJlZmVyZW5jZU5hbWUsIGtleSk7XG5cdFx0XHRcdFx0XHRidWNrZXQuYWRkKGtleSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRlbGV0ZSBwcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YnVja2V0LmFkZChrZXkpO1xuXHRcdFx0XHRcdGlmIChwb2xpY3lOYW1lKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnBvbGljeUNvbmZpZ3VyYXRpb25zLnNldChwb2xpY3lOYW1lLCBrZXkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocG9saWN5UmVmZXJlbmNlTmFtZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5hZGRQb2xpY3lSZWZlcmVuY2VDb25maWd1cmF0aW9uKHBvbGljeVJlZmVyZW5jZU5hbWUsIGtleSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblByb3BlcnRpZXNba2V5XSA9IHByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0XHRpZiAoIXByb3BlcnRpZXNba2V5XS5kZXByZWNhdGlvbk1lc3NhZ2UgJiYgcHJvcGVydGllc1trZXldLm1hcmtkb3duRGVwcmVjYXRpb25NZXNzYWdlKSB7XG5cdFx0XHRcdFx0XHQvLyBJZiBub3Qgc2V0LCBkZWZhdWx0IGRlcHJlY2F0aW9uTWVzc2FnZSB0byB0aGUgbWFya2Rvd24gc291cmNlXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzW2tleV0uZGVwcmVjYXRpb25NZXNzYWdlID0gcHJvcGVydGllc1trZXldLm1hcmtkb3duRGVwcmVjYXRpb25NZXNzYWdlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgc3ViTm9kZXMgPSBjb25maWd1cmF0aW9uLmFsbE9mO1xuXHRcdGlmIChzdWJOb2Rlcykge1xuXHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIHN1Yk5vZGVzKSB7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVBbmRSZWdpc3RlclByb3BlcnRpZXMobm9kZSwgdmFsaWRhdGUsIGV4dGVuc2lvbkluZm8sIHJlc3RyaWN0ZWRQcm9wZXJ0aWVzLCBzY29wZSwgYnVja2V0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFkZFBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb24ocG9saWN5TmFtZTogUG9saWN5TmFtZSwga2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRsZXQga2V5cyA9IHRoaXMucG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMuZ2V0KHBvbGljeU5hbWUpO1xuXHRcdGlmICgha2V5cykge1xuXHRcdFx0a2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0dGhpcy5wb2xpY3lSZWZlcmVuY2VDb25maWd1cmF0aW9ucy5zZXQocG9saWN5TmFtZSwga2V5cyk7XG5cdFx0fVxuXHRcdGtleXMuYWRkKGtleSk7XG5cdH1cblxuXHQvLyBPbmx5IGZvciB0ZXN0c1xuXHRnZXRDb25maWd1cmF0aW9ucygpOiBJQ29uZmlndXJhdGlvbk5vZGVbXSB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvbkNvbnRyaWJ1dG9ycztcblx0fVxuXG5cdGdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk6IElTdHJpbmdEaWN0aW9uYXJ5PElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblByb3BlcnRpZXM7XG5cdH1cblxuXHRnZXRQb2xpY3lDb25maWd1cmF0aW9ucygpOiBNYXA8UG9saWN5TmFtZSwgc3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMucG9saWN5Q29uZmlndXJhdGlvbnM7XG5cdH1cblxuXHRnZXRQb2xpY3lSZWZlcmVuY2VDb25maWd1cmF0aW9ucygpOiBNYXA8UG9saWN5TmFtZSwgU2V0PHN0cmluZz4+IHtcblx0XHRyZXR1cm4gdGhpcy5wb2xpY3lSZWZlcmVuY2VDb25maWd1cmF0aW9ucztcblx0fVxuXG5cdGdldEV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXMoKTogSVN0cmluZ0RpY3Rpb25hcnk8SVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+IHtcblx0XHRyZXR1cm4gdGhpcy5leGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzO1xuXHR9XG5cblx0Z2V0UmVnaXN0ZXJlZERlZmF1bHRDb25maWd1cmF0aW9ucygpOiBJQ29uZmlndXJhdGlvbkRlZmF1bHRzW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5yZWdpc3RlcmVkQ29uZmlndXJhdGlvbkRlZmF1bHRzXTtcblx0fVxuXG5cdGdldENvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlcygpOiBNYXA8c3RyaW5nLCBJQ29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzID0gbmV3IE1hcDxzdHJpbmcsIElDb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWU+KCk7XG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgdGhpcy5jb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMpIHtcblx0XHRcdGlmICh2YWx1ZS5jb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUpIHtcblx0XHRcdFx0Y29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzLnNldChrZXksIHZhbHVlLmNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXM7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVySlNPTkNvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Ob2RlKSB7XG5cdFx0Y29uc3QgcmVnaXN0ZXIgPSAoY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Ob2RlKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9wZXJ0aWVzID0gY29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzO1xuXHRcdFx0aWYgKHByb3BlcnRpZXMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gcHJvcGVydGllcykge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlU2NoZW1hKGtleSwgcHJvcGVydGllc1trZXldKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3ViTm9kZXMgPSBjb25maWd1cmF0aW9uLmFsbE9mO1xuXHRcdFx0c3ViTm9kZXM/LmZvckVhY2gocmVnaXN0ZXIpO1xuXHRcdH07XG5cdFx0cmVnaXN0ZXIoY29uZmlndXJhdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNjaGVtYShrZXk6IHN0cmluZywgcHJvcGVydHk6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEpOiB2b2lkIHtcblx0XHRhbGxTZXR0aW5ncy5wcm9wZXJ0aWVzW2tleV0gPSBwcm9wZXJ0eTtcblx0XHRzd2l0Y2ggKHByb3BlcnR5LnNjb3BlKSB7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTjpcblx0XHRcdFx0YXBwbGljYXRpb25TZXR0aW5ncy5wcm9wZXJ0aWVzW2tleV0gPSBwcm9wZXJ0eTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25TY29wZS5NQUNISU5FOlxuXHRcdFx0XHRtYWNoaW5lU2V0dGluZ3MucHJvcGVydGllc1trZXldID0gcHJvcGVydHk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT05fTUFDSElORTpcblx0XHRcdFx0YXBwbGljYXRpb25NYWNoaW5lU2V0dGluZ3MucHJvcGVydGllc1trZXldID0gcHJvcGVydHk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORV9PVkVSUklEQUJMRTpcblx0XHRcdFx0bWFjaGluZU92ZXJyaWRhYmxlU2V0dGluZ3MucHJvcGVydGllc1trZXldID0gcHJvcGVydHk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uU2NvcGUuV0lORE9XOlxuXHRcdFx0XHR3aW5kb3dTZXR0aW5ncy5wcm9wZXJ0aWVzW2tleV0gPSBwcm9wZXJ0eTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRTpcblx0XHRcdFx0cmVzb3VyY2VTZXR0aW5ncy5wcm9wZXJ0aWVzW2tleV0gPSBwcm9wZXJ0eTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRTpcblx0XHRcdFx0cmVzb3VyY2VTZXR0aW5ncy5wcm9wZXJ0aWVzW2tleV0gPSBwcm9wZXJ0eTtcblx0XHRcdFx0dGhpcy5yZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWEucHJvcGVydGllcyFba2V5XSA9IHByb3BlcnR5O1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUZyb21TY2hlbWEoa2V5OiBzdHJpbmcsIHByb3BlcnR5OiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hKTogdm9pZCB7XG5cdFx0ZGVsZXRlIGFsbFNldHRpbmdzLnByb3BlcnRpZXNba2V5XTtcblx0XHRzd2l0Y2ggKHByb3BlcnR5LnNjb3BlKSB7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTjpcblx0XHRcdFx0ZGVsZXRlIGFwcGxpY2F0aW9uU2V0dGluZ3MucHJvcGVydGllc1trZXldO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblNjb3BlLk1BQ0hJTkU6XG5cdFx0XHRcdGRlbGV0ZSBtYWNoaW5lU2V0dGluZ3MucHJvcGVydGllc1trZXldO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OX01BQ0hJTkU6XG5cdFx0XHRcdGRlbGV0ZSBhcHBsaWNhdGlvbk1hY2hpbmVTZXR0aW5ncy5wcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORV9PVkVSUklEQUJMRTpcblx0XHRcdFx0ZGVsZXRlIG1hY2hpbmVPdmVycmlkYWJsZVNldHRpbmdzLnByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25TY29wZS5XSU5ET1c6XG5cdFx0XHRcdGRlbGV0ZSB3aW5kb3dTZXR0aW5ncy5wcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0U6XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRTpcblx0XHRcdFx0ZGVsZXRlIHJlc291cmNlU2V0dGluZ3MucHJvcGVydGllc1trZXldO1xuXHRcdFx0XHRkZWxldGUgdGhpcy5yZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWEucHJvcGVydGllcyFba2V5XTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVPdmVycmlkZVByb3BlcnR5UGF0dGVybktleSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IG92ZXJyaWRlSWRlbnRpZmllciBvZiB0aGlzLm92ZXJyaWRlSWRlbnRpZmllcnMudmFsdWVzKCkpIHtcblx0XHRcdGNvbnN0IG92ZXJyaWRlSWRlbnRpZmllclByb3BlcnR5ID0gYFske292ZXJyaWRlSWRlbnRpZmllcn1dYDtcblx0XHRcdGNvbnN0IHJlc291cmNlTGFuZ3VhZ2VQcm9wZXJ0aWVzU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ292ZXJyaWRlU2V0dGluZ3MuZGVmYXVsdERlc2NyaXB0aW9uJywgXCJDb25maWd1cmUgZWRpdG9yIHNldHRpbmdzIHRvIGJlIG92ZXJyaWRkZW4gZm9yIGEgbGFuZ3VhZ2UuXCIpLFxuXHRcdFx0XHRlcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnb3ZlcnJpZGVTZXR0aW5ncy5lcnJvck1lc3NhZ2UnLCBcIlRoaXMgc2V0dGluZyBkb2VzIG5vdCBzdXBwb3J0IHBlci1sYW5ndWFnZSBjb25maWd1cmF0aW9uLlwiKSxcblx0XHRcdFx0JHJlZjogcmVzb3VyY2VMYW5ndWFnZVNldHRpbmdzU2NoZW1hSWQsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy51cGRhdGVQcm9wZXJ0eURlZmF1bHRWYWx1ZShvdmVycmlkZUlkZW50aWZpZXJQcm9wZXJ0eSwgcmVzb3VyY2VMYW5ndWFnZVByb3BlcnRpZXNTY2hlbWEpO1xuXHRcdFx0YWxsU2V0dGluZ3MucHJvcGVydGllc1tvdmVycmlkZUlkZW50aWZpZXJQcm9wZXJ0eV0gPSByZXNvdXJjZUxhbmd1YWdlUHJvcGVydGllc1NjaGVtYTtcblx0XHRcdGFwcGxpY2F0aW9uU2V0dGluZ3MucHJvcGVydGllc1tvdmVycmlkZUlkZW50aWZpZXJQcm9wZXJ0eV0gPSByZXNvdXJjZUxhbmd1YWdlUHJvcGVydGllc1NjaGVtYTtcblx0XHRcdGFwcGxpY2F0aW9uTWFjaGluZVNldHRpbmdzLnByb3BlcnRpZXNbb3ZlcnJpZGVJZGVudGlmaWVyUHJvcGVydHldID0gcmVzb3VyY2VMYW5ndWFnZVByb3BlcnRpZXNTY2hlbWE7XG5cdFx0XHRtYWNoaW5lU2V0dGluZ3MucHJvcGVydGllc1tvdmVycmlkZUlkZW50aWZpZXJQcm9wZXJ0eV0gPSByZXNvdXJjZUxhbmd1YWdlUHJvcGVydGllc1NjaGVtYTtcblx0XHRcdG1hY2hpbmVPdmVycmlkYWJsZVNldHRpbmdzLnByb3BlcnRpZXNbb3ZlcnJpZGVJZGVudGlmaWVyUHJvcGVydHldID0gcmVzb3VyY2VMYW5ndWFnZVByb3BlcnRpZXNTY2hlbWE7XG5cdFx0XHR3aW5kb3dTZXR0aW5ncy5wcm9wZXJ0aWVzW292ZXJyaWRlSWRlbnRpZmllclByb3BlcnR5XSA9IHJlc291cmNlTGFuZ3VhZ2VQcm9wZXJ0aWVzU2NoZW1hO1xuXHRcdFx0cmVzb3VyY2VTZXR0aW5ncy5wcm9wZXJ0aWVzW292ZXJyaWRlSWRlbnRpZmllclByb3BlcnR5XSA9IHJlc291cmNlTGFuZ3VhZ2VQcm9wZXJ0aWVzU2NoZW1hO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJPdmVycmlkZVByb3BlcnR5UGF0dGVybktleSgpOiB2b2lkIHtcblx0XHRjb25zdCByZXNvdXJjZUxhbmd1YWdlUHJvcGVydGllc1NjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ292ZXJyaWRlU2V0dGluZ3MuZGVmYXVsdERlc2NyaXB0aW9uJywgXCJDb25maWd1cmUgZWRpdG9yIHNldHRpbmdzIHRvIGJlIG92ZXJyaWRkZW4gZm9yIGEgbGFuZ3VhZ2UuXCIpLFxuXHRcdFx0ZXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ292ZXJyaWRlU2V0dGluZ3MuZXJyb3JNZXNzYWdlJywgXCJUaGlzIHNldHRpbmcgZG9lcyBub3Qgc3VwcG9ydCBwZXItbGFuZ3VhZ2UgY29uZmlndXJhdGlvbi5cIiksXG5cdFx0XHQkcmVmOiByZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWFJZCxcblx0XHR9O1xuXHRcdGFsbFNldHRpbmdzLnBhdHRlcm5Qcm9wZXJ0aWVzW09WRVJSSURFX1BST1BFUlRZX1BBVFRFUk5dID0gcmVzb3VyY2VMYW5ndWFnZVByb3BlcnRpZXNTY2hlbWE7XG5cdFx0YXBwbGljYXRpb25TZXR0aW5ncy5wYXR0ZXJuUHJvcGVydGllc1tPVkVSUklERV9QUk9QRVJUWV9QQVRURVJOXSA9IHJlc291cmNlTGFuZ3VhZ2VQcm9wZXJ0aWVzU2NoZW1hO1xuXHRcdGFwcGxpY2F0aW9uTWFjaGluZVNldHRpbmdzLnBhdHRlcm5Qcm9wZXJ0aWVzW09WRVJSSURFX1BST1BFUlRZX1BBVFRFUk5dID0gcmVzb3VyY2VMYW5ndWFnZVByb3BlcnRpZXNTY2hlbWE7XG5cdFx0bWFjaGluZVNldHRpbmdzLnBhdHRlcm5Qcm9wZXJ0aWVzW09WRVJSSURFX1BST1BFUlRZX1BBVFRFUk5dID0gcmVzb3VyY2VMYW5ndWFnZVByb3BlcnRpZXNTY2hlbWE7XG5cdFx0bWFjaGluZU92ZXJyaWRhYmxlU2V0dGluZ3MucGF0dGVyblByb3BlcnRpZXNbT1ZFUlJJREVfUFJPUEVSVFlfUEFUVEVSTl0gPSByZXNvdXJjZUxhbmd1YWdlUHJvcGVydGllc1NjaGVtYTtcblx0XHR3aW5kb3dTZXR0aW5ncy5wYXR0ZXJuUHJvcGVydGllc1tPVkVSUklERV9QUk9QRVJUWV9QQVRURVJOXSA9IHJlc291cmNlTGFuZ3VhZ2VQcm9wZXJ0aWVzU2NoZW1hO1xuXHRcdHJlc291cmNlU2V0dGluZ3MucGF0dGVyblByb3BlcnRpZXNbT1ZFUlJJREVfUFJPUEVSVFlfUEFUVEVSTl0gPSByZXNvdXJjZUxhbmd1YWdlUHJvcGVydGllc1NjaGVtYTtcblx0XHR0aGlzLl9vbkRpZFNjaGVtYUNoYW5nZS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVByb3BlcnR5RGVmYXVsdFZhbHVlKGtleTogc3RyaW5nLCBwcm9wZXJ0eTogSVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uZGVmYXVsdE92ZXJyaWRlID0gdGhpcy5jb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMuZ2V0KGtleSk/LmNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZTtcblx0XHRsZXQgZGVmYXVsdFZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdGxldCBkZWZhdWx0U291cmNlID0gdW5kZWZpbmVkO1xuXHRcdGlmIChjb25maWd1cmF0aW9uZGVmYXVsdE92ZXJyaWRlXG5cdFx0XHQmJiAoIXByb3BlcnR5LmRpc2FsbG93Q29uZmlndXJhdGlvbkRlZmF1bHQgfHwgIWNvbmZpZ3VyYXRpb25kZWZhdWx0T3ZlcnJpZGUuc291cmNlKSAvLyBQcmV2ZW50IG92ZXJyaWRpbmcgdGhlIGRlZmF1bHQgdmFsdWUgaWYgdGhlIHByb3BlcnR5IGlzIGRpc2FsbG93ZWQgdG8gYmUgb3ZlcnJpZGRlbiBieSBjb25maWd1cmF0aW9uIGRlZmF1bHRzIGZyb20gZXh0ZW5zaW9uc1xuXHRcdCkge1xuXHRcdFx0ZGVmYXVsdFZhbHVlID0gY29uZmlndXJhdGlvbmRlZmF1bHRPdmVycmlkZS52YWx1ZTtcblx0XHRcdGRlZmF1bHRTb3VyY2UgPSBjb25maWd1cmF0aW9uZGVmYXVsdE92ZXJyaWRlLnNvdXJjZTtcblx0XHR9XG5cdFx0aWYgKHR5cGVzLmlzVW5kZWZpbmVkKGRlZmF1bHRWYWx1ZSkpIHtcblx0XHRcdGRlZmF1bHRWYWx1ZSA9IHByb3BlcnR5LmRlZmF1bHREZWZhdWx0VmFsdWU7XG5cdFx0XHRkZWZhdWx0U291cmNlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodHlwZXMuaXNVbmRlZmluZWQoZGVmYXVsdFZhbHVlKSkge1xuXHRcdFx0ZGVmYXVsdFZhbHVlID0gZ2V0RGVmYXVsdFZhbHVlKHByb3BlcnR5LnR5cGUpO1xuXHRcdH1cblx0XHRwcm9wZXJ0eS5kZWZhdWx0ID0gZGVmYXVsdFZhbHVlO1xuXHRcdHByb3BlcnR5LmRlZmF1bHRWYWx1ZVNvdXJjZSA9IGRlZmF1bHRTb3VyY2U7XG5cdH1cbn1cblxuY29uc3QgT1ZFUlJJREVfSURFTlRJRklFUl9QQVRURVJOID0gYFxcXFxbKFteXFxcXF1dKylcXFxcXWA7XG5jb25zdCBPVkVSUklERV9JREVOVElGSUVSX1JFR0VYID0gbmV3IFJlZ0V4cChPVkVSUklERV9JREVOVElGSUVSX1BBVFRFUk4sICdnJyk7XG5leHBvcnQgY29uc3QgT1ZFUlJJREVfUFJPUEVSVFlfUEFUVEVSTiA9IGBeKCR7T1ZFUlJJREVfSURFTlRJRklFUl9QQVRURVJOfSkrJGA7XG5leHBvcnQgY29uc3QgT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVggPSBuZXcgUmVnRXhwKE9WRVJSSURFX1BST1BFUlRZX1BBVFRFUk4pO1xuXG5leHBvcnQgZnVuY3Rpb24gb3ZlcnJpZGVJZGVudGlmaWVyc0Zyb21LZXkoa2V5OiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGlkZW50aWZpZXJzOiBzdHJpbmdbXSA9IFtdO1xuXHRpZiAoT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChrZXkpKSB7XG5cdFx0bGV0IG1hdGNoZXMgPSBPVkVSUklERV9JREVOVElGSUVSX1JFR0VYLmV4ZWMoa2V5KTtcblx0XHR3aGlsZSAobWF0Y2hlcz8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBpZGVudGlmaWVyID0gbWF0Y2hlc1sxXS50cmltKCk7XG5cdFx0XHRpZiAoaWRlbnRpZmllcikge1xuXHRcdFx0XHRpZGVudGlmaWVycy5wdXNoKGlkZW50aWZpZXIpO1xuXHRcdFx0fVxuXHRcdFx0bWF0Y2hlcyA9IE9WRVJSSURFX0lERU5USUZJRVJfUkVHRVguZXhlYyhrZXkpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZGlzdGluY3QoaWRlbnRpZmllcnMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24ga2V5RnJvbU92ZXJyaWRlSWRlbnRpZmllcnMob3ZlcnJpZGVJZGVudGlmaWVyczogc3RyaW5nW10pOiBzdHJpbmcge1xuXHRyZXR1cm4gb3ZlcnJpZGVJZGVudGlmaWVycy5yZWR1Y2UoKHJlc3VsdCwgb3ZlcnJpZGVJZGVudGlmaWVyKSA9PiBgJHtyZXN1bHR9WyR7b3ZlcnJpZGVJZGVudGlmaWVyfV1gLCAnJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREZWZhdWx0VmFsdWUodHlwZTogc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQpIHtcblx0Y29uc3QgdCA9IEFycmF5LmlzQXJyYXkodHlwZSkgPyB0eXBlWzBdIDogPHN0cmluZz50eXBlO1xuXHRzd2l0Y2ggKHQpIHtcblx0XHRjYXNlICdib29sZWFuJzpcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRjYXNlICdpbnRlZ2VyJzpcblx0XHRjYXNlICdudW1iZXInOlxuXHRcdFx0cmV0dXJuIDA7XG5cdFx0Y2FzZSAnc3RyaW5nJzpcblx0XHRcdHJldHVybiAnJztcblx0XHRjYXNlICdhcnJheSc6XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0Y2FzZSAnb2JqZWN0Jzpcblx0XHRcdHJldHVybiB7fTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cblxuY29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gbmV3IENvbmZpZ3VyYXRpb25SZWdpc3RyeSgpO1xuUmVnaXN0cnkuYWRkKEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbiwgY29uZmlndXJhdGlvblJlZ2lzdHJ5KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlUHJvcGVydHkocHJvcGVydHk6IHN0cmluZywgc2NoZW1hOiBJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgZXh0ZW5zaW9uSWQ/OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0aWYgKCFwcm9wZXJ0eS50cmltKCkpIHtcblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdjb25maWcucHJvcGVydHkuZW1wdHknLCBcIkNhbm5vdCByZWdpc3RlciBhbiBlbXB0eSBwcm9wZXJ0eVwiKTtcblx0fVxuXHRpZiAoT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChwcm9wZXJ0eSkpIHtcblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdjb25maWcucHJvcGVydHkubGFuZ3VhZ2VEZWZhdWx0JywgXCJDYW5ub3QgcmVnaXN0ZXIgJ3swfScuIFRoaXMgbWF0Y2hlcyBwcm9wZXJ0eSBwYXR0ZXJuICdcXFxcXFxcXFsuKlxcXFxcXFxcXSQnIGZvciBkZXNjcmliaW5nIGxhbmd1YWdlIHNwZWNpZmljIGVkaXRvciBzZXR0aW5ncy4gVXNlICdjb25maWd1cmF0aW9uRGVmYXVsdHMnIGNvbnRyaWJ1dGlvbi5cIiwgcHJvcGVydHkpO1xuXHR9XG5cdGlmIChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVtwcm9wZXJ0eV0gIT09IHVuZGVmaW5lZCAmJiAoIWV4dGVuc2lvbklkIHx8ICFFWFRFTlNJT05fVU5JRklDQVRJT05fRVhURU5TSU9OX0lEUy5oYXMoZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKSkpKSB7XG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnY29uZmlnLnByb3BlcnR5LmR1cGxpY2F0ZScsIFwiQ2Fubm90IHJlZ2lzdGVyICd7MH0nLiBUaGlzIHByb3BlcnR5IGlzIGFscmVhZHkgcmVnaXN0ZXJlZC5cIiwgcHJvcGVydHkpO1xuXHR9XG5cdGlmIChzY2hlbWEucG9saWN5ICYmIHNjaGVtYS5wb2xpY3lSZWZlcmVuY2UpIHtcblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdjb25maWcucG9saWN5LmJvdGhQb2xpY3lBbmRSZWZlcmVuY2UnLCBcIkNhbm5vdCByZWdpc3RlciAnezB9Jy4gQSBzZXR0aW5nIG11c3Qgbm90IGRlY2xhcmUgYm90aCAncG9saWN5JyBhbmQgJ3BvbGljeVJlZmVyZW5jZScuXCIsIHByb3BlcnR5KTtcblx0fVxuXHRpZiAoc2NoZW1hLnBvbGljeT8ubmFtZSAmJiBjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0UG9saWN5Q29uZmlndXJhdGlvbnMoKS5nZXQoc2NoZW1hLnBvbGljeT8ubmFtZSkgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ2NvbmZpZy5wb2xpY3kuZHVwbGljYXRlJywgXCJDYW5ub3QgcmVnaXN0ZXIgJ3swfScuIFRoZSBhc3NvY2lhdGVkIHBvbGljeSB7MX0gaXMgYWxyZWFkeSByZWdpc3RlcmVkIHdpdGggezJ9LiBUbyBhdHRhY2ggYW5vdGhlciBzZXR0aW5nIHRvIHRoZSBzYW1lIHBvbGljeSwgdXNlICdwb2xpY3lSZWZlcmVuY2UnLlwiLCBwcm9wZXJ0eSwgc2NoZW1hLnBvbGljeT8ubmFtZSwgY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldFBvbGljeUNvbmZpZ3VyYXRpb25zKCkuZ2V0KHNjaGVtYS5wb2xpY3k/Lm5hbWUpKTtcblx0fVxuXHRyZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNjb3BlcygpOiBbc3RyaW5nLCBDb25maWd1cmF0aW9uU2NvcGUgfCB1bmRlZmluZWRdW10ge1xuXHRjb25zdCBzY29wZXM6IFtzdHJpbmcsIENvbmZpZ3VyYXRpb25TY29wZSB8IHVuZGVmaW5lZF1bXSA9IFtdO1xuXHRjb25zdCBjb25maWd1cmF0aW9uUHJvcGVydGllcyA9IGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhjb25maWd1cmF0aW9uUHJvcGVydGllcykpIHtcblx0XHRzY29wZXMucHVzaChba2V5LCBjb25maWd1cmF0aW9uUHJvcGVydGllc1trZXldLnNjb3BlXSk7XG5cdH1cblx0c2NvcGVzLnB1c2goWydsYXVuY2gnLCBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0VdKTtcblx0c2NvcGVzLnB1c2goWyd0YXNrJywgQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFXSk7XG5cdHJldHVybiBzY29wZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBbGxDb25maWd1cmF0aW9uUHJvcGVydGllcyhjb25maWd1cmF0aW9uTm9kZTogSUNvbmZpZ3VyYXRpb25Ob2RlW10pOiBJU3RyaW5nRGljdGlvbmFyeTxJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4ge1xuXHRjb25zdCByZXN1bHQ6IElTdHJpbmdEaWN0aW9uYXJ5PElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPiA9IHt9O1xuXHRmb3IgKGNvbnN0IGNvbmZpZ3VyYXRpb24gb2YgY29uZmlndXJhdGlvbk5vZGUpIHtcblx0XHRjb25zdCBwcm9wZXJ0aWVzID0gY29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzO1xuXHRcdGlmICh0eXBlcy5pc09iamVjdChwcm9wZXJ0aWVzKSkge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gcHJvcGVydGllcykge1xuXHRcdFx0XHRyZXN1bHRba2V5XSA9IHByb3BlcnRpZXNba2V5XTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNvbmZpZ3VyYXRpb24uYWxsT2YpIHtcblx0XHRcdE9iamVjdC5hc3NpZ24ocmVzdWx0LCBnZXRBbGxDb25maWd1cmF0aW9uUHJvcGVydGllcyhjb25maWd1cmF0aW9uLmFsbE9mKSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVNjb3BlKHNjb3BlOiBzdHJpbmcpOiBDb25maWd1cmF0aW9uU2NvcGUge1xuXHRzd2l0Y2ggKHNjb3BlKSB7XG5cdFx0Y2FzZSAnYXBwbGljYXRpb24nOlxuXHRcdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTjtcblx0XHRjYXNlICdtYWNoaW5lJzpcblx0XHRcdHJldHVybiBDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORTtcblx0XHRjYXNlICdyZXNvdXJjZSc6XG5cdFx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFO1xuXHRcdGNhc2UgJ21hY2hpbmUtb3ZlcnJpZGFibGUnOlxuXHRcdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25TY29wZS5NQUNISU5FX09WRVJSSURBQkxFO1xuXHRcdGNhc2UgJ2xhbmd1YWdlLW92ZXJyaWRhYmxlJzpcblx0XHRcdHJldHVybiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEU7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBDb25maWd1cmF0aW9uU2NvcGUuV0lORE9XO1xuXHR9XG59XG5cbi8vIFVzZWQgZm9yIGV4dGVuc2lvbiB1bmlmaWNhdGlvbi4gU2hvdWxkIGJlIHJlbW92ZWQgd2hlbiBjb21wbGV0ZS5cbmV4cG9ydCBjb25zdCBFWFRFTlNJT05fVU5JRklDQVRJT05fRVhURU5TSU9OX0lEUzogU2V0PHN0cmluZz4gPSBuZXcgU2V0KHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudCA/IFtwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQuZXh0ZW5zaW9uSWQsIHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudC5jaGF0RXh0ZW5zaW9uSWRdLm1hcChpZCA9PiBpZC50b0xvd2VyQ2FzZSgpKSA6IFtdKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsZUFBc0I7QUFFL0IsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksU0FBUztBQUNyQixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGNBQWMsc0JBQWlEO0FBQ3hFLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsa0JBQWtCO0FBQzNCLE9BQU8sYUFBYTtBQUViLElBQUssd0JBQUwsa0JBQUtBLDJCQUFMO0FBQ04sRUFBQUEsdUJBQUEsZUFBWTtBQUNaLEVBQUFBLHVCQUFBLGdCQUFhO0FBRkYsU0FBQUE7QUFBQSxHQUFBO0FBS0wsTUFBTSxhQUFhO0FBQUEsRUFDekIsZUFBZTtBQUNoQjtBQTRHTyxJQUFXLHFCQUFYLGtCQUFXQyx3QkFBWDtBQUlOLEVBQUFBLHdDQUFBLGlCQUFjLEtBQWQ7QUFJQSxFQUFBQSx3Q0FBQTtBQUlBLEVBQUFBLHdDQUFBO0FBSUEsRUFBQUEsd0NBQUE7QUFJQSxFQUFBQSx3Q0FBQTtBQUlBLEVBQUFBLHdDQUFBO0FBSUEsRUFBQUEsd0NBQUE7QUE1QmlCLFNBQUFBO0FBQUEsR0FBQTtBQStKWCxTQUFTLG1DQUFtQyxHQUEyQyxHQUFvRDtBQUNqSixNQUFJLE1BQU0sR0FBRztBQUNaLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxDQUFDLEtBQUss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QkFBc0IsMkJBQTJCO0FBQ2pGLGFBQVcsT0FBTyxPQUFPLEtBQUssdUJBQXVCLEdBQUc7QUFDdkQsV0FBTyxLQUFLLENBQUMsS0FBSyx3QkFBd0IsR0FBRyxFQUFFLEtBQUssQ0FBQztBQUFBLEVBQ3REO0FBQ0EsU0FBTyxLQUFLLENBQUMsVUFBVSxnQkFBMkIsQ0FBQztBQUNuRCxTQUFPLEtBQUssQ0FBQyxRQUFRLGdCQUEyQixDQUFDO0FBQ2pELFNBQU87QUFDUjtBQUVPLFNBQVMsOEJBQThCLG1CQUFvRztBQUNqSixRQUFNLFNBQW9FLENBQUM7QUFDM0UsYUFBVyxpQkFBaUIsbUJBQW1CO0FBQzlDLFVBQU0sYUFBYSxjQUFjO0FBQ2pDLFFBQUksTUFBTSxTQUFTLFVBQVUsR0FBRztBQUMvQixpQkFBVyxPQUFPLFlBQVk7QUFDN0IsZUFBTyxHQUFHLElBQUksV0FBVyxHQUFHO0FBQUEsTUFDN0I7QUFBQSxJQUNEO0FBQ0EsUUFBSSxjQUFjLE9BQU87QUFDeEIsYUFBTyxPQUFPLFFBQVEsOEJBQThCLGNBQWMsS0FBSyxDQUFDO0FBQUEsSUFDekU7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBRU8sU0FBUyxXQUFXLE9BQW1DO0FBQzdELFVBQVEsT0FBTztBQUFBLElBQ2QsS0FBSztBQUNKLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsS0FBSztBQUNKLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUjtBQUNDLGFBQU87QUFBQSxFQUNUO0FBQ0Q7QUFHTyxNQUFNLHNDQUFtRCxJQUFJLElBQUksUUFBUSxtQkFBbUIsQ0FBQyxRQUFRLGlCQUFpQixhQUFhLFFBQVEsaUJBQWlCLGVBQWUsRUFBRSxJQUFJLFFBQU0sR0FBRyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUM7IiwKICAibmFtZXMiOiBbIkVkaXRQcmVzZW50YXRpb25UeXBlcyIsICJDb25maWd1cmF0aW9uU2NvcGUiLCAiY29uZmlndXJhdGlvbiJdCn0K
