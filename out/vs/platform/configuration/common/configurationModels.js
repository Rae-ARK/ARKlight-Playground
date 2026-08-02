import * as arrays from "../../../base/common/arrays.js";
import { Emitter, Event } from "../../../base/common/event.js";
import * as json from "../../../base/common/json.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { getOrSet, ResourceMap } from "../../../base/common/map.js";
import * as objects from "../../../base/common/objects.js";
import * as types from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { addToValueTree, getConfigurationValue, removeFromValueTree, toValuesTree } from "./configuration.js";
import { ConfigurationScope, Extensions, overrideIdentifiersFromKey, OVERRIDE_PROPERTY_REGEX } from "./configurationRegistry.js";
import { FileOperation } from "../../files/common/files.js";
import { Registry } from "../../registry/common/platform.js";
function freeze(data) {
  return Object.isFrozen(data) ? data : objects.deepFreeze(data);
}
class ConfigurationModel {
  constructor(_contents, _keys, _overrides, _raw, logService) {
    this._contents = _contents;
    this._keys = _keys;
    this._overrides = _overrides;
    this._raw = _raw;
    this.logService = logService;
    this.overrideConfigurations = /* @__PURE__ */ new Map();
  }
  static createEmptyModel(logService) {
    return new ConfigurationModel({}, [], [], void 0, logService);
  }
  get rawConfiguration() {
    if (!this._rawConfiguration) {
      if (this._raw) {
        const rawConfigurationModels = (Array.isArray(this._raw) ? this._raw : [this._raw]).map((raw) => {
          if (raw instanceof ConfigurationModel) {
            return raw;
          }
          const parser = new ConfigurationModelParser("", this.logService);
          parser.parseRaw(raw);
          return parser.configurationModel;
        });
        this._rawConfiguration = rawConfigurationModels.reduce((previous, current) => current === previous ? current : previous.merge(current), rawConfigurationModels[0]);
      } else {
        this._rawConfiguration = this;
      }
    }
    return this._rawConfiguration;
  }
  get contents() {
    return this._contents;
  }
  get overrides() {
    return this._overrides;
  }
  get keys() {
    return this._keys;
  }
  get raw() {
    if (!this._raw) {
      return void 0;
    }
    if (Array.isArray(this._raw) && this._raw.every((raw) => raw instanceof ConfigurationModel)) {
      return void 0;
    }
    return this._raw;
  }
  isEmpty() {
    return this._keys.length === 0 && Object.keys(this._contents).length === 0 && this._overrides.length === 0;
  }
  getValue(section) {
    return section ? getConfigurationValue(this.contents, section) : this.contents;
  }
  inspect(section, overrideIdentifier) {
    const that = this;
    return {
      get value() {
        return freeze(that.rawConfiguration.getValue(section));
      },
      get override() {
        return overrideIdentifier ? freeze(that.rawConfiguration.getOverrideValue(section, overrideIdentifier)) : void 0;
      },
      get merged() {
        return freeze(overrideIdentifier ? that.rawConfiguration.override(overrideIdentifier).getValue(section) : that.rawConfiguration.getValue(section));
      },
      get overrides() {
        const overrides = [];
        for (const { contents, identifiers, keys } of that.rawConfiguration.overrides) {
          const value = new ConfigurationModel(contents, keys, [], void 0, that.logService).getValue(section);
          if (value !== void 0) {
            overrides.push({ identifiers, value });
          }
        }
        return overrides.length ? freeze(overrides) : void 0;
      }
    };
  }
  getOverrideValue(section, overrideIdentifier) {
    const overrideContents = this.getContentsForOverrideIdentifer(overrideIdentifier);
    return overrideContents ? section ? getConfigurationValue(overrideContents, section) : overrideContents : void 0;
  }
  getKeysForOverrideIdentifier(identifier) {
    const keys = [];
    for (const override of this.overrides) {
      if (override.identifiers.includes(identifier)) {
        keys.push(...override.keys);
      }
    }
    return arrays.distinct(keys);
  }
  getAllOverrideIdentifiers() {
    const result = [];
    for (const override of this.overrides) {
      result.push(...override.identifiers);
    }
    return arrays.distinct(result);
  }
  override(identifier) {
    let overrideConfigurationModel = this.overrideConfigurations.get(identifier);
    if (!overrideConfigurationModel) {
      overrideConfigurationModel = this.createOverrideConfigurationModel(identifier);
      this.overrideConfigurations.set(identifier, overrideConfigurationModel);
    }
    return overrideConfigurationModel;
  }
  merge(...others) {
    const contents = objects.deepClone(this.contents);
    const overrides = objects.deepClone(this.overrides);
    const keys = [...this.keys];
    const raws = this._raw ? Array.isArray(this._raw) ? [...this._raw] : [this._raw] : [this];
    for (const other of others) {
      raws.push(...other._raw ? Array.isArray(other._raw) ? other._raw : [other._raw] : [other]);
      if (other.isEmpty()) {
        continue;
      }
      this.mergeContents(contents, other.contents);
      for (const otherOverride of other.overrides) {
        const [override] = overrides.filter((o) => arrays.equals(o.identifiers, otherOverride.identifiers));
        if (override) {
          this.mergeContents(override.contents, otherOverride.contents);
          override.keys.push(...otherOverride.keys);
          override.keys = arrays.distinct(override.keys);
        } else {
          overrides.push(objects.deepClone(otherOverride));
        }
      }
      for (const key of other.keys) {
        if (keys.indexOf(key) === -1) {
          keys.push(key);
        }
      }
    }
    return new ConfigurationModel(contents, keys, overrides, !raws.length || raws.every((raw) => raw instanceof ConfigurationModel) ? void 0 : raws, this.logService);
  }
  createOverrideConfigurationModel(identifier) {
    const overrideContents = this.getContentsForOverrideIdentifer(identifier);
    if (!overrideContents || typeof overrideContents !== "object" || !Object.keys(overrideContents).length) {
      return this;
    }
    const contents = {};
    for (const key of arrays.distinct([...Object.keys(this.contents), ...Object.keys(overrideContents)])) {
      let contentsForKey = this.contents[key];
      const overrideContentsForKey = overrideContents[key];
      if (overrideContentsForKey) {
        if (typeof contentsForKey === "object" && typeof overrideContentsForKey === "object") {
          contentsForKey = objects.deepClone(contentsForKey);
          this.mergeContents(contentsForKey, overrideContentsForKey);
        } else {
          contentsForKey = overrideContentsForKey;
        }
      }
      contents[key] = contentsForKey;
    }
    return new ConfigurationModel(contents, this.keys, this.overrides, void 0, this.logService);
  }
  mergeContents(source, target) {
    for (const key of Object.keys(target)) {
      if (key in source) {
        if (types.isObject(source[key]) && types.isObject(target[key])) {
          this.mergeContents(source[key], target[key]);
          continue;
        }
      }
      source[key] = objects.deepClone(target[key]);
    }
  }
  getContentsForOverrideIdentifer(identifier) {
    let contentsForIdentifierOnly = null;
    let contents = null;
    const mergeContents = (contentsToMerge) => {
      if (contentsToMerge) {
        if (contents) {
          this.mergeContents(contents, contentsToMerge);
        } else {
          contents = objects.deepClone(contentsToMerge);
        }
      }
    };
    for (const override of this.overrides) {
      if (override.identifiers.length === 1 && override.identifiers[0] === identifier) {
        contentsForIdentifierOnly = override.contents;
      } else if (override.identifiers.includes(identifier)) {
        mergeContents(override.contents);
      }
    }
    mergeContents(contentsForIdentifierOnly);
    return contents;
  }
  toJSON() {
    return {
      contents: this.contents,
      overrides: this.overrides,
      keys: this.keys
    };
  }
  // Update methods
  addValue(key, value) {
    this.updateValue(key, value, true);
  }
  setValue(key, value) {
    this.updateValue(key, value, false);
  }
  removeValue(key) {
    const index = this.keys.indexOf(key);
    if (index === -1) {
      return;
    }
    this.keys.splice(index, 1);
    removeFromValueTree(this.contents, key);
    if (OVERRIDE_PROPERTY_REGEX.test(key)) {
      this.overrides.splice(this.overrides.findIndex((o) => arrays.equals(o.identifiers, overrideIdentifiersFromKey(key))), 1);
    }
  }
  updateValue(key, value, add) {
    addToValueTree(this.contents, key, value, (e) => this.logService.error(e));
    add = add || this.keys.indexOf(key) === -1;
    if (add) {
      this.keys.push(key);
    }
    if (OVERRIDE_PROPERTY_REGEX.test(key)) {
      const overrideContents = this.contents[key];
      const identifiers = overrideIdentifiersFromKey(key);
      const override = {
        identifiers,
        keys: Object.keys(overrideContents),
        contents: toValuesTree(overrideContents, (message) => this.logService.error(message))
      };
      const index = this.overrides.findIndex((o) => arrays.equals(o.identifiers, identifiers));
      if (index !== -1) {
        this.overrides[index] = override;
      } else {
        this.overrides.push(override);
      }
    }
  }
}
class ConfigurationModelParser {
  constructor(_name, logService) {
    this._name = _name;
    this.logService = logService;
    this._raw = null;
    this._configurationModel = null;
    this._restrictedConfigurations = [];
    this._parseErrors = [];
  }
  get configurationModel() {
    return this._configurationModel || ConfigurationModel.createEmptyModel(this.logService);
  }
  get restrictedConfigurations() {
    return this._restrictedConfigurations;
  }
  get errors() {
    return this._parseErrors;
  }
  parse(content, options) {
    if (!types.isUndefinedOrNull(content)) {
      const raw = this.doParseContent(content);
      this.parseRaw(raw, options);
    }
  }
  reparse(options) {
    if (this._raw) {
      this.parseRaw(this._raw, options);
    }
  }
  parseRaw(raw, options) {
    this._raw = raw;
    const { contents, keys, overrides, restricted, hasExcludedProperties } = this.doParseRaw(raw, options);
    this._configurationModel = new ConfigurationModel(contents, keys, overrides, hasExcludedProperties ? [raw] : void 0, this.logService);
    this._restrictedConfigurations = restricted || [];
  }
  doParseContent(content) {
    let raw = {};
    let currentProperty = null;
    let currentParent = [];
    const previousParents = [];
    const parseErrors = [];
    function onValue(value) {
      if (Array.isArray(currentParent)) {
        currentParent.push(value);
      } else if (currentProperty !== null) {
        currentParent[currentProperty] = value;
      }
    }
    const visitor = {
      onObjectBegin: () => {
        const object = {};
        onValue(object);
        previousParents.push(currentParent);
        currentParent = object;
        currentProperty = null;
      },
      onObjectProperty: (name) => {
        currentProperty = name;
      },
      onObjectEnd: () => {
        currentParent = previousParents.pop();
      },
      onArrayBegin: () => {
        const array = [];
        onValue(array);
        previousParents.push(currentParent);
        currentParent = array;
        currentProperty = null;
      },
      onArrayEnd: () => {
        currentParent = previousParents.pop();
      },
      onLiteralValue: onValue,
      onError: (error, offset, length) => {
        parseErrors.push({ error, offset, length });
      }
    };
    if (content) {
      try {
        json.visit(content, visitor);
        raw = currentParent[0] || {};
      } catch (e) {
        this.logService.error(`Error while parsing settings file ${this._name}: ${e}`);
        this._parseErrors = [e];
      }
    }
    return raw;
  }
  doParseRaw(raw, options) {
    const registry = Registry.as(Extensions.Configuration);
    const configurationProperties = registry.getConfigurationProperties();
    const excludedConfigurationProperties = registry.getExcludedConfigurationProperties();
    const filtered = this.filter(raw, configurationProperties, excludedConfigurationProperties, true, options);
    raw = filtered.raw;
    const contents = toValuesTree(raw, (message) => this.logService.error(`Conflict in settings file ${this._name}: ${message}`));
    const keys = Object.keys(raw);
    const overrides = this.toOverrides(raw, (message) => this.logService.error(`Conflict in settings file ${this._name}: ${message}`));
    return { contents, keys, overrides, restricted: filtered.restricted, hasExcludedProperties: filtered.hasExcludedProperties };
  }
  filter(properties, configurationProperties, excludedConfigurationProperties, filterOverriddenProperties, options) {
    let hasExcludedProperties = false;
    if (!options?.scopes && !options?.skipRestricted && !options?.skipUnregistered && !options?.exclude?.length) {
      return { raw: properties, restricted: [], hasExcludedProperties };
    }
    const raw = {};
    const restricted = [];
    for (const key in properties) {
      if (OVERRIDE_PROPERTY_REGEX.test(key) && filterOverriddenProperties) {
        const result = this.filter(properties[key], configurationProperties, excludedConfigurationProperties, false, options);
        raw[key] = result.raw;
        hasExcludedProperties = hasExcludedProperties || result.hasExcludedProperties;
        restricted.push(...result.restricted);
      } else {
        const propertySchema = configurationProperties[key];
        if (propertySchema?.restricted) {
          restricted.push(key);
        }
        if (this.shouldInclude(key, propertySchema, excludedConfigurationProperties, options)) {
          raw[key] = properties[key];
        } else {
          hasExcludedProperties = true;
        }
      }
    }
    return { raw, restricted, hasExcludedProperties };
  }
  shouldInclude(key, propertySchema, excludedConfigurationProperties, options) {
    if (options.exclude?.includes(key)) {
      return false;
    }
    if (options.include?.includes(key)) {
      return true;
    }
    if (options.skipRestricted && propertySchema?.restricted) {
      return false;
    }
    if (options.skipUnregistered && !propertySchema) {
      return false;
    }
    const schema = propertySchema ?? excludedConfigurationProperties[key];
    const scope = schema ? typeof schema.scope !== "undefined" ? schema.scope : ConfigurationScope.WINDOW : void 0;
    if (scope === void 0 || options.scopes === void 0) {
      return true;
    }
    return options.scopes.includes(scope);
  }
  toOverrides(raw, conflictReporter) {
    const overrides = [];
    for (const key of Object.keys(raw)) {
      if (OVERRIDE_PROPERTY_REGEX.test(key)) {
        const overrideRaw = {};
        const rawKey = raw[key];
        for (const keyInOverrideRaw in rawKey) {
          overrideRaw[keyInOverrideRaw] = rawKey[keyInOverrideRaw];
        }
        overrides.push({
          identifiers: overrideIdentifiersFromKey(key),
          keys: Object.keys(overrideRaw),
          contents: toValuesTree(overrideRaw, conflictReporter)
        });
      }
    }
    return overrides;
  }
}
class UserSettings extends Disposable {
  constructor(userSettingsResource, parseOptions, extUri, fileService, logService) {
    super();
    this.userSettingsResource = userSettingsResource;
    this.parseOptions = parseOptions;
    this.fileService = fileService;
    this.logService = logService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.parser = new ConfigurationModelParser(this.userSettingsResource.toString(), logService);
    this._register(this.fileService.watch(extUri.dirname(this.userSettingsResource)));
    this._register(this.fileService.watch(this.userSettingsResource));
    this._register(Event.any(
      Event.filter(this.fileService.onDidFilesChange, (e) => e.contains(this.userSettingsResource)),
      Event.filter(this.fileService.onDidRunOperation, (e) => (e.isOperation(FileOperation.CREATE) || e.isOperation(FileOperation.COPY) || e.isOperation(FileOperation.DELETE) || e.isOperation(FileOperation.WRITE)) && extUri.isEqual(e.resource, userSettingsResource))
    )(() => this._onDidChange.fire()));
  }
  async loadConfiguration() {
    try {
      const content = await this.fileService.readFile(this.userSettingsResource);
      this.parser.parse(content.value.toString() || "{}", this.parseOptions);
      return this.parser.configurationModel;
    } catch (e) {
      return ConfigurationModel.createEmptyModel(this.logService);
    }
  }
  reparse(parseOptions) {
    if (parseOptions) {
      this.parseOptions = parseOptions;
    }
    this.parser.reparse(this.parseOptions);
    return this.parser.configurationModel;
  }
  getRestrictedSettings() {
    return this.parser.restrictedConfigurations;
  }
}
class ConfigurationInspectValue {
  constructor(key, overrides, _value, overrideIdentifiers, defaultConfiguration, policyConfiguration, applicationConfiguration, userConfiguration, localUserConfiguration, remoteUserConfiguration, workspaceConfiguration, folderConfigurationModel, memoryConfigurationModel) {
    this.key = key;
    this.overrides = overrides;
    this._value = _value;
    this.overrideIdentifiers = overrideIdentifiers;
    this.defaultConfiguration = defaultConfiguration;
    this.policyConfiguration = policyConfiguration;
    this.applicationConfiguration = applicationConfiguration;
    this.userConfiguration = userConfiguration;
    this.localUserConfiguration = localUserConfiguration;
    this.remoteUserConfiguration = remoteUserConfiguration;
    this.workspaceConfiguration = workspaceConfiguration;
    this.folderConfigurationModel = folderConfigurationModel;
    this.memoryConfigurationModel = memoryConfigurationModel;
  }
  get value() {
    return freeze(this._value);
  }
  toInspectValue(inspectValue) {
    return inspectValue?.value !== void 0 || inspectValue?.override !== void 0 || inspectValue?.overrides !== void 0 ? inspectValue : void 0;
  }
  get defaultInspectValue() {
    if (!this._defaultInspectValue) {
      this._defaultInspectValue = this.defaultConfiguration.inspect(this.key, this.overrides.overrideIdentifier);
    }
    return this._defaultInspectValue;
  }
  get defaultValue() {
    return this.defaultInspectValue.merged;
  }
  get default() {
    return this.toInspectValue(this.defaultInspectValue);
  }
  get policyInspectValue() {
    if (this._policyInspectValue === void 0) {
      this._policyInspectValue = this.policyConfiguration ? this.policyConfiguration.inspect(this.key) : null;
    }
    return this._policyInspectValue;
  }
  get policyValue() {
    return this.policyInspectValue?.merged;
  }
  get policy() {
    return this.policyInspectValue?.value !== void 0 ? { value: this.policyInspectValue.value } : void 0;
  }
  get applicationInspectValue() {
    if (this._applicationInspectValue === void 0) {
      this._applicationInspectValue = this.applicationConfiguration ? this.applicationConfiguration.inspect(this.key) : null;
    }
    return this._applicationInspectValue;
  }
  get applicationValue() {
    return this.applicationInspectValue?.merged;
  }
  get application() {
    return this.toInspectValue(this.applicationInspectValue);
  }
  get userInspectValue() {
    if (!this._userInspectValue) {
      this._userInspectValue = this.userConfiguration.inspect(this.key, this.overrides.overrideIdentifier);
    }
    return this._userInspectValue;
  }
  get userValue() {
    return this.userInspectValue.merged;
  }
  get user() {
    return this.toInspectValue(this.userInspectValue);
  }
  get userLocalInspectValue() {
    if (!this._userLocalInspectValue) {
      this._userLocalInspectValue = this.localUserConfiguration.inspect(this.key, this.overrides.overrideIdentifier);
    }
    return this._userLocalInspectValue;
  }
  get userLocalValue() {
    return this.userLocalInspectValue.merged;
  }
  get userLocal() {
    return this.toInspectValue(this.userLocalInspectValue);
  }
  get userRemoteInspectValue() {
    if (!this._userRemoteInspectValue) {
      this._userRemoteInspectValue = this.remoteUserConfiguration.inspect(this.key, this.overrides.overrideIdentifier);
    }
    return this._userRemoteInspectValue;
  }
  get userRemoteValue() {
    return this.userRemoteInspectValue.merged;
  }
  get userRemote() {
    return this.toInspectValue(this.userRemoteInspectValue);
  }
  get workspaceInspectValue() {
    if (this._workspaceInspectValue === void 0) {
      this._workspaceInspectValue = this.workspaceConfiguration ? this.workspaceConfiguration.inspect(this.key, this.overrides.overrideIdentifier) : null;
    }
    return this._workspaceInspectValue;
  }
  get workspaceValue() {
    return this.workspaceInspectValue?.merged;
  }
  get workspace() {
    return this.toInspectValue(this.workspaceInspectValue);
  }
  get workspaceFolderInspectValue() {
    if (this._workspaceFolderInspectValue === void 0) {
      this._workspaceFolderInspectValue = this.folderConfigurationModel ? this.folderConfigurationModel.inspect(this.key, this.overrides.overrideIdentifier) : null;
    }
    return this._workspaceFolderInspectValue;
  }
  get workspaceFolderValue() {
    return this.workspaceFolderInspectValue?.merged;
  }
  get workspaceFolder() {
    return this.toInspectValue(this.workspaceFolderInspectValue);
  }
  get memoryInspectValue() {
    if (this._memoryInspectValue === void 0) {
      this._memoryInspectValue = this.memoryConfigurationModel.inspect(this.key, this.overrides.overrideIdentifier);
    }
    return this._memoryInspectValue;
  }
  get memoryValue() {
    return this.memoryInspectValue.merged;
  }
  get memory() {
    return this.toInspectValue(this.memoryInspectValue);
  }
}
class Configuration {
  constructor(_defaultConfiguration, _policyConfiguration, _applicationConfiguration, _localUserConfiguration, _remoteUserConfiguration, _workspaceConfiguration, _folderConfigurations, _memoryConfiguration, _memoryConfigurationByResource, logService) {
    this._defaultConfiguration = _defaultConfiguration;
    this._policyConfiguration = _policyConfiguration;
    this._applicationConfiguration = _applicationConfiguration;
    this._localUserConfiguration = _localUserConfiguration;
    this._remoteUserConfiguration = _remoteUserConfiguration;
    this._workspaceConfiguration = _workspaceConfiguration;
    this._folderConfigurations = _folderConfigurations;
    this._memoryConfiguration = _memoryConfiguration;
    this._memoryConfigurationByResource = _memoryConfigurationByResource;
    this.logService = logService;
    this._workspaceConsolidatedConfiguration = null;
    this._foldersConsolidatedConfigurations = new ResourceMap();
    this._userConfiguration = null;
  }
  getValue(section, overrides, workspace) {
    const consolidateConfigurationModel = this.getConsolidatedConfigurationModel(section, overrides, workspace);
    return consolidateConfigurationModel.getValue(section);
  }
  updateValue(key, value, overrides = {}) {
    let memoryConfiguration;
    if (overrides.resource) {
      memoryConfiguration = this._memoryConfigurationByResource.get(overrides.resource);
      if (!memoryConfiguration) {
        memoryConfiguration = ConfigurationModel.createEmptyModel(this.logService);
        this._memoryConfigurationByResource.set(overrides.resource, memoryConfiguration);
      }
    } else {
      memoryConfiguration = this._memoryConfiguration;
    }
    if (value === void 0) {
      memoryConfiguration.removeValue(key);
    } else {
      memoryConfiguration.setValue(key, value);
    }
    if (!overrides.resource) {
      this._workspaceConsolidatedConfiguration = null;
    }
  }
  inspect(key, overrides, workspace) {
    const consolidateConfigurationModel = this.getConsolidatedConfigurationModel(key, overrides, workspace);
    const folderConfigurationModel = this.getFolderConfigurationModelForResource(overrides.resource, workspace);
    const memoryConfigurationModel = overrides.resource ? this._memoryConfigurationByResource.get(overrides.resource) || this._memoryConfiguration : this._memoryConfiguration;
    const overrideIdentifiers = /* @__PURE__ */ new Set();
    for (const override of consolidateConfigurationModel.overrides) {
      for (const overrideIdentifier of override.identifiers) {
        if (consolidateConfigurationModel.getOverrideValue(key, overrideIdentifier) !== void 0) {
          overrideIdentifiers.add(overrideIdentifier);
        }
      }
    }
    return new ConfigurationInspectValue(
      key,
      overrides,
      consolidateConfigurationModel.getValue(key),
      overrideIdentifiers.size ? [...overrideIdentifiers] : void 0,
      this._defaultConfiguration,
      this._policyConfiguration.isEmpty() ? void 0 : this._policyConfiguration,
      this.applicationConfiguration.isEmpty() ? void 0 : this.applicationConfiguration,
      this.userConfiguration,
      this.localUserConfiguration,
      this.remoteUserConfiguration,
      workspace ? this._workspaceConfiguration : void 0,
      folderConfigurationModel ? folderConfigurationModel : void 0,
      memoryConfigurationModel
    );
  }
  keys(workspace) {
    const folderConfigurationModel = this.getFolderConfigurationModelForResource(void 0, workspace);
    return {
      default: this._defaultConfiguration.keys.slice(0),
      policy: this._policyConfiguration.keys.slice(0),
      user: this.userConfiguration.keys.slice(0),
      workspace: this._workspaceConfiguration.keys.slice(0),
      workspaceFolder: folderConfigurationModel ? folderConfigurationModel.keys.slice(0) : []
    };
  }
  updateDefaultConfiguration(defaultConfiguration) {
    this._defaultConfiguration = defaultConfiguration;
    this._workspaceConsolidatedConfiguration = null;
    this._foldersConsolidatedConfigurations.clear();
  }
  updatePolicyConfiguration(policyConfiguration) {
    this._policyConfiguration = policyConfiguration;
  }
  updateApplicationConfiguration(applicationConfiguration) {
    this._applicationConfiguration = applicationConfiguration;
    this._workspaceConsolidatedConfiguration = null;
    this._foldersConsolidatedConfigurations.clear();
  }
  updateLocalUserConfiguration(localUserConfiguration) {
    this._localUserConfiguration = localUserConfiguration;
    this._userConfiguration = null;
    this._workspaceConsolidatedConfiguration = null;
    this._foldersConsolidatedConfigurations.clear();
  }
  updateRemoteUserConfiguration(remoteUserConfiguration) {
    this._remoteUserConfiguration = remoteUserConfiguration;
    this._userConfiguration = null;
    this._workspaceConsolidatedConfiguration = null;
    this._foldersConsolidatedConfigurations.clear();
  }
  updateWorkspaceConfiguration(workspaceConfiguration) {
    this._workspaceConfiguration = workspaceConfiguration;
    this._workspaceConsolidatedConfiguration = null;
    this._foldersConsolidatedConfigurations.clear();
  }
  updateFolderConfiguration(resource, configuration) {
    this._folderConfigurations.set(resource, configuration);
    this._foldersConsolidatedConfigurations.delete(resource);
  }
  deleteFolderConfiguration(resource) {
    this.folderConfigurations.delete(resource);
    this._foldersConsolidatedConfigurations.delete(resource);
  }
  compareAndUpdateDefaultConfiguration(defaults, keys) {
    const overrides = [];
    if (!keys) {
      const { added, updated, removed } = compare(this._defaultConfiguration, defaults);
      keys = [...added, ...updated, ...removed];
    }
    for (const key of keys) {
      for (const overrideIdentifier of overrideIdentifiersFromKey(key)) {
        const fromKeys = this._defaultConfiguration.getKeysForOverrideIdentifier(overrideIdentifier);
        const toKeys = defaults.getKeysForOverrideIdentifier(overrideIdentifier);
        const keys2 = [
          ...toKeys.filter((key2) => fromKeys.indexOf(key2) === -1),
          ...fromKeys.filter((key2) => toKeys.indexOf(key2) === -1),
          ...fromKeys.filter((key2) => !objects.equals(this._defaultConfiguration.override(overrideIdentifier).getValue(key2), defaults.override(overrideIdentifier).getValue(key2)))
        ];
        overrides.push([overrideIdentifier, keys2]);
      }
    }
    this.updateDefaultConfiguration(defaults);
    return { keys, overrides };
  }
  compareAndUpdatePolicyConfiguration(policyConfiguration) {
    const { added, updated, removed } = compare(this._policyConfiguration, policyConfiguration);
    const keys = [...added, ...updated, ...removed];
    if (keys.length) {
      this.updatePolicyConfiguration(policyConfiguration);
    }
    return { keys, overrides: [] };
  }
  compareAndUpdateApplicationConfiguration(application) {
    const { added, updated, removed, overrides } = compare(this.applicationConfiguration, application);
    const keys = [...added, ...updated, ...removed];
    if (keys.length) {
      this.updateApplicationConfiguration(application);
    }
    return { keys, overrides };
  }
  compareAndUpdateLocalUserConfiguration(user) {
    const { added, updated, removed, overrides } = compare(this.localUserConfiguration, user);
    const keys = [...added, ...updated, ...removed];
    if (keys.length) {
      this.updateLocalUserConfiguration(user);
    }
    return { keys, overrides };
  }
  compareAndUpdateRemoteUserConfiguration(user) {
    const { added, updated, removed, overrides } = compare(this.remoteUserConfiguration, user);
    const keys = [...added, ...updated, ...removed];
    if (keys.length) {
      this.updateRemoteUserConfiguration(user);
    }
    return { keys, overrides };
  }
  compareAndUpdateWorkspaceConfiguration(workspaceConfiguration) {
    const { added, updated, removed, overrides } = compare(this.workspaceConfiguration, workspaceConfiguration);
    const keys = [...added, ...updated, ...removed];
    if (keys.length) {
      this.updateWorkspaceConfiguration(workspaceConfiguration);
    }
    return { keys, overrides };
  }
  compareAndUpdateFolderConfiguration(resource, folderConfiguration) {
    const currentFolderConfiguration = this.folderConfigurations.get(resource);
    const { added, updated, removed, overrides } = compare(currentFolderConfiguration, folderConfiguration);
    const keys = [...added, ...updated, ...removed];
    if (keys.length || !currentFolderConfiguration) {
      this.updateFolderConfiguration(resource, folderConfiguration);
    }
    return { keys, overrides };
  }
  compareAndDeleteFolderConfiguration(folder) {
    const folderConfig = this.folderConfigurations.get(folder);
    if (!folderConfig) {
      throw new Error("Unknown folder");
    }
    this.deleteFolderConfiguration(folder);
    const { added, updated, removed, overrides } = compare(folderConfig, void 0);
    return { keys: [...added, ...updated, ...removed], overrides };
  }
  get defaults() {
    return this._defaultConfiguration;
  }
  get applicationConfiguration() {
    return this._applicationConfiguration;
  }
  get userConfiguration() {
    if (!this._userConfiguration) {
      if (this._remoteUserConfiguration.isEmpty()) {
        this._userConfiguration = this._localUserConfiguration;
      } else {
        const merged = this._localUserConfiguration.merge(this._remoteUserConfiguration);
        this._userConfiguration = new ConfigurationModel(merged.contents, merged.keys, merged.overrides, void 0, this.logService);
      }
    }
    return this._userConfiguration;
  }
  get localUserConfiguration() {
    return this._localUserConfiguration;
  }
  get remoteUserConfiguration() {
    return this._remoteUserConfiguration;
  }
  get workspaceConfiguration() {
    return this._workspaceConfiguration;
  }
  get folderConfigurations() {
    return this._folderConfigurations;
  }
  getConsolidatedConfigurationModel(section, overrides, workspace) {
    let configurationModel = this.getConsolidatedConfigurationModelForResource(overrides, workspace);
    if (overrides.overrideIdentifier) {
      configurationModel = configurationModel.override(overrides.overrideIdentifier);
    }
    if (!this._policyConfiguration.isEmpty() && this._policyConfiguration.getValue(section) !== void 0) {
      configurationModel = configurationModel.merge();
      for (const key of this._policyConfiguration.keys) {
        configurationModel.setValue(key, this._policyConfiguration.getValue(key));
      }
    }
    return configurationModel;
  }
  getConsolidatedConfigurationModelForResource({ resource }, workspace) {
    let consolidateConfiguration = this.getWorkspaceConsolidatedConfiguration();
    if (workspace && resource) {
      const root = workspace.getFolder(resource);
      if (root) {
        consolidateConfiguration = this.getFolderConsolidatedConfiguration(root.uri) || consolidateConfiguration;
      }
      const memoryConfigurationForResource = this._memoryConfigurationByResource.get(resource);
      if (memoryConfigurationForResource) {
        consolidateConfiguration = consolidateConfiguration.merge(memoryConfigurationForResource);
      }
    }
    return consolidateConfiguration;
  }
  getWorkspaceConsolidatedConfiguration() {
    if (!this._workspaceConsolidatedConfiguration) {
      this._workspaceConsolidatedConfiguration = this._defaultConfiguration.merge(this.applicationConfiguration, this.userConfiguration, this._workspaceConfiguration, this._memoryConfiguration);
    }
    return this._workspaceConsolidatedConfiguration;
  }
  getFolderConsolidatedConfiguration(folder) {
    let folderConsolidatedConfiguration = this._foldersConsolidatedConfigurations.get(folder);
    if (!folderConsolidatedConfiguration) {
      const workspaceConsolidateConfiguration = this.getWorkspaceConsolidatedConfiguration();
      const folderConfiguration = this._folderConfigurations.get(folder);
      if (folderConfiguration) {
        folderConsolidatedConfiguration = workspaceConsolidateConfiguration.merge(folderConfiguration);
        this._foldersConsolidatedConfigurations.set(folder, folderConsolidatedConfiguration);
      } else {
        folderConsolidatedConfiguration = workspaceConsolidateConfiguration;
      }
    }
    return folderConsolidatedConfiguration;
  }
  getFolderConfigurationModelForResource(resource, workspace) {
    if (workspace && resource) {
      const root = workspace.getFolder(resource);
      if (root) {
        return this._folderConfigurations.get(root.uri);
      }
    }
    return void 0;
  }
  toData() {
    return {
      defaults: {
        contents: this._defaultConfiguration.contents,
        overrides: this._defaultConfiguration.overrides,
        keys: this._defaultConfiguration.keys
      },
      policy: {
        contents: this._policyConfiguration.contents,
        overrides: this._policyConfiguration.overrides,
        keys: this._policyConfiguration.keys
      },
      application: {
        contents: this.applicationConfiguration.contents,
        overrides: this.applicationConfiguration.overrides,
        keys: this.applicationConfiguration.keys,
        raw: Array.isArray(this.applicationConfiguration.raw) ? void 0 : this.applicationConfiguration.raw
      },
      userLocal: {
        contents: this.localUserConfiguration.contents,
        overrides: this.localUserConfiguration.overrides,
        keys: this.localUserConfiguration.keys,
        raw: Array.isArray(this.localUserConfiguration.raw) ? void 0 : this.localUserConfiguration.raw
      },
      userRemote: {
        contents: this.remoteUserConfiguration.contents,
        overrides: this.remoteUserConfiguration.overrides,
        keys: this.remoteUserConfiguration.keys,
        raw: Array.isArray(this.remoteUserConfiguration.raw) ? void 0 : this.remoteUserConfiguration.raw
      },
      workspace: {
        contents: this._workspaceConfiguration.contents,
        overrides: this._workspaceConfiguration.overrides,
        keys: this._workspaceConfiguration.keys
      },
      folders: [...this._folderConfigurations.keys()].reduce((result, folder) => {
        const { contents, overrides, keys } = this._folderConfigurations.get(folder);
        result.push([folder, { contents, overrides, keys }]);
        return result;
      }, [])
    };
  }
  allKeys() {
    const keys = /* @__PURE__ */ new Set();
    this._defaultConfiguration.keys.forEach((key) => keys.add(key));
    this.userConfiguration.keys.forEach((key) => keys.add(key));
    this._workspaceConfiguration.keys.forEach((key) => keys.add(key));
    this._folderConfigurations.forEach((folderConfiguration) => folderConfiguration.keys.forEach((key) => keys.add(key)));
    return [...keys.values()];
  }
  allOverrideIdentifiers() {
    const keys = /* @__PURE__ */ new Set();
    this._defaultConfiguration.getAllOverrideIdentifiers().forEach((key) => keys.add(key));
    this.userConfiguration.getAllOverrideIdentifiers().forEach((key) => keys.add(key));
    this._workspaceConfiguration.getAllOverrideIdentifiers().forEach((key) => keys.add(key));
    this._folderConfigurations.forEach((folderConfiguration) => folderConfiguration.getAllOverrideIdentifiers().forEach((key) => keys.add(key)));
    return [...keys.values()];
  }
  getAllKeysForOverrideIdentifier(overrideIdentifier) {
    const keys = /* @__PURE__ */ new Set();
    this._defaultConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach((key) => keys.add(key));
    this.userConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach((key) => keys.add(key));
    this._workspaceConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach((key) => keys.add(key));
    this._folderConfigurations.forEach((folderConfiguration) => folderConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach((key) => keys.add(key)));
    return [...keys.values()];
  }
  static parse(data, logService) {
    const defaultConfiguration = this.parseConfigurationModel(data.defaults, logService);
    const policyConfiguration = this.parseConfigurationModel(data.policy, logService);
    const applicationConfiguration = this.parseConfigurationModel(data.application, logService);
    const userLocalConfiguration = this.parseConfigurationModel(data.userLocal, logService);
    const userRemoteConfiguration = this.parseConfigurationModel(data.userRemote, logService);
    const workspaceConfiguration = this.parseConfigurationModel(data.workspace, logService);
    const folders = data.folders.reduce((result, value) => {
      result.set(URI.revive(value[0]), this.parseConfigurationModel(value[1], logService));
      return result;
    }, new ResourceMap());
    return new Configuration(
      defaultConfiguration,
      policyConfiguration,
      applicationConfiguration,
      userLocalConfiguration,
      userRemoteConfiguration,
      workspaceConfiguration,
      folders,
      ConfigurationModel.createEmptyModel(logService),
      new ResourceMap(),
      logService
    );
  }
  static parseConfigurationModel(model, logService) {
    return new ConfigurationModel(model.contents, model.keys, model.overrides, model.raw, logService);
  }
}
function mergeChanges(...changes) {
  if (changes.length === 0) {
    return { keys: [], overrides: [] };
  }
  if (changes.length === 1) {
    return changes[0];
  }
  const keysSet = /* @__PURE__ */ new Set();
  const overridesMap = /* @__PURE__ */ new Map();
  for (const change of changes) {
    change.keys.forEach((key) => keysSet.add(key));
    change.overrides.forEach(([identifier, keys]) => {
      const result = getOrSet(overridesMap, identifier, /* @__PURE__ */ new Set());
      keys.forEach((key) => result.add(key));
    });
  }
  const overrides = [];
  overridesMap.forEach((keys, identifier) => overrides.push([identifier, [...keys.values()]]));
  return { keys: [...keysSet.values()], overrides };
}
class ConfigurationChangeEvent {
  constructor(change, previous, currentConfiguraiton, currentWorkspace, logService) {
    this.change = change;
    this.previous = previous;
    this.currentConfiguraiton = currentConfiguraiton;
    this.currentWorkspace = currentWorkspace;
    this.logService = logService;
    this._marker = "\n";
    this._markerCode1 = this._marker.charCodeAt(0);
    this._markerCode2 = ".".charCodeAt(0);
    this.affectedKeys = /* @__PURE__ */ new Set();
    this._previousConfiguration = void 0;
    for (const key of change.keys) {
      this.affectedKeys.add(key);
    }
    for (const [, keys] of change.overrides) {
      for (const key of keys) {
        this.affectedKeys.add(key);
      }
    }
    this._affectsConfigStr = this._marker;
    for (const key of this.affectedKeys) {
      this._affectsConfigStr += key + this._marker;
    }
  }
  get previousConfiguration() {
    if (!this._previousConfiguration && this.previous) {
      this._previousConfiguration = Configuration.parse(this.previous.data, this.logService);
    }
    return this._previousConfiguration;
  }
  affectsConfiguration(section, overrides) {
    const needle = this._marker + section;
    const idx = this._affectsConfigStr.indexOf(needle);
    if (idx < 0) {
      return false;
    }
    const pos = idx + needle.length;
    if (pos >= this._affectsConfigStr.length) {
      return false;
    }
    const code = this._affectsConfigStr.charCodeAt(pos);
    if (code !== this._markerCode1 && code !== this._markerCode2) {
      return false;
    }
    if (overrides) {
      const value1 = this.previousConfiguration ? this.previousConfiguration.getValue(section, overrides, this.previous?.workspace) : void 0;
      const value2 = this.currentConfiguraiton.getValue(section, overrides, this.currentWorkspace);
      return !objects.equals(value1, value2);
    }
    return true;
  }
}
function compare(from, to) {
  const { added, removed, updated } = compareConfigurationContents(to?.rawConfiguration, from?.rawConfiguration);
  const overrides = [];
  const fromOverrideIdentifiers = from?.getAllOverrideIdentifiers() || [];
  const toOverrideIdentifiers = to?.getAllOverrideIdentifiers() || [];
  if (to) {
    const addedOverrideIdentifiers = toOverrideIdentifiers.filter((key) => !fromOverrideIdentifiers.includes(key));
    for (const identifier of addedOverrideIdentifiers) {
      overrides.push([identifier, to.getKeysForOverrideIdentifier(identifier)]);
    }
  }
  if (from) {
    const removedOverrideIdentifiers = fromOverrideIdentifiers.filter((key) => !toOverrideIdentifiers.includes(key));
    for (const identifier of removedOverrideIdentifiers) {
      overrides.push([identifier, from.getKeysForOverrideIdentifier(identifier)]);
    }
  }
  if (to && from) {
    for (const identifier of fromOverrideIdentifiers) {
      if (toOverrideIdentifiers.includes(identifier)) {
        const result = compareConfigurationContents({ contents: from.getOverrideValue(void 0, identifier) || {}, keys: from.getKeysForOverrideIdentifier(identifier) }, { contents: to.getOverrideValue(void 0, identifier) || {}, keys: to.getKeysForOverrideIdentifier(identifier) });
        overrides.push([identifier, [...result.added, ...result.removed, ...result.updated]]);
      }
    }
  }
  return { added, removed, updated, overrides };
}
function compareConfigurationContents(to, from) {
  const added = to ? from ? to.keys.filter((key) => from.keys.indexOf(key) === -1) : [...to.keys] : [];
  const removed = from ? to ? from.keys.filter((key) => to.keys.indexOf(key) === -1) : [...from.keys] : [];
  const updated = [];
  if (to && from) {
    for (const key of from.keys) {
      if (to.keys.indexOf(key) !== -1) {
        const value1 = getConfigurationValue(from.contents, key);
        const value2 = getConfigurationValue(to.contents, key);
        if (!objects.equals(value1, value2)) {
          updated.push(key);
        }
      }
    }
  }
  return { added, removed, updated };
}
export {
  Configuration,
  ConfigurationChangeEvent,
  ConfigurationModel,
  ConfigurationModelParser,
  UserSettings,
  mergeChanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25Nb2RlbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhcnJheXMgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgKiBhcyBqc29uIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBnZXRPclNldCwgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0ICogYXMgb2JqZWN0cyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IElFeHRVcmkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGFkZFRvVmFsdWVUcmVlLCBDb25maWd1cmF0aW9uVGFyZ2V0LCBnZXRDb25maWd1cmF0aW9uVmFsdWUsIElDb25maWd1cmF0aW9uQ2hhbmdlLCBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCBJQ29uZmlndXJhdGlvbkNvbXBhcmVSZXN1bHQsIElDb25maWd1cmF0aW9uRGF0YSwgSUNvbmZpZ3VyYXRpb25Nb2RlbCwgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMsIElDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzLCBJQ29uZmlndXJhdGlvblZhbHVlLCBJSW5zcGVjdFZhbHVlLCBJT3ZlcnJpZGVzLCByZW1vdmVGcm9tVmFsdWVUcmVlLCB0b1ZhbHVlc1RyZWUgfSBmcm9tICcuL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBvdmVycmlkZUlkZW50aWZpZXJzRnJvbUtleSwgT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgsIElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIH0gZnJvbSAnLi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbiwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuXG5mdW5jdGlvbiBmcmVlemU8VD4oZGF0YTogVCk6IFQge1xuXHRyZXR1cm4gT2JqZWN0LmlzRnJvemVuKGRhdGEpID8gZGF0YSA6IG9iamVjdHMuZGVlcEZyZWV6ZShkYXRhKTtcbn1cblxudHlwZSBJbnNwZWN0VmFsdWU8Vj4gPSBJSW5zcGVjdFZhbHVlPFY+ICYgeyBtZXJnZWQ/OiBWIH07XG5cbmV4cG9ydCBjbGFzcyBDb25maWd1cmF0aW9uTW9kZWwgaW1wbGVtZW50cyBJQ29uZmlndXJhdGlvbk1vZGVsIHtcblxuXHRzdGF0aWMgY3JlYXRlRW1wdHlNb2RlbChsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0cmV0dXJuIG5ldyBDb25maWd1cmF0aW9uTW9kZWwoe30sIFtdLCBbXSwgdW5kZWZpbmVkLCBsb2dTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgb3ZlcnJpZGVDb25maWd1cmF0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBDb25maWd1cmF0aW9uTW9kZWw+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudHM6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2tleXM6IHN0cmluZ1tdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX292ZXJyaWRlczogSU92ZXJyaWRlc1tdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JhdzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCBSZWFkb25seUFycmF5PElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgQ29uZmlndXJhdGlvbk1vZGVsPiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHR9XG5cblx0cHJpdmF0ZSBfcmF3Q29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsIHwgdW5kZWZpbmVkO1xuXHRnZXQgcmF3Q29uZmlndXJhdGlvbigpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdGlmICghdGhpcy5fcmF3Q29uZmlndXJhdGlvbikge1xuXHRcdFx0aWYgKHRoaXMuX3Jhdykge1xuXHRcdFx0XHRjb25zdCByYXdDb25maWd1cmF0aW9uTW9kZWxzID0gKEFycmF5LmlzQXJyYXkodGhpcy5fcmF3KSA/IHRoaXMuX3JhdyA6IFt0aGlzLl9yYXddKS5tYXAocmF3ID0+IHtcblx0XHRcdFx0XHRpZiAocmF3IGluc3RhbmNlb2YgQ29uZmlndXJhdGlvbk1vZGVsKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmF3O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBwYXJzZXIgPSBuZXcgQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyKCcnLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRcdHBhcnNlci5wYXJzZVJhdyhyYXcpO1xuXHRcdFx0XHRcdHJldHVybiBwYXJzZXIuY29uZmlndXJhdGlvbk1vZGVsO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5fcmF3Q29uZmlndXJhdGlvbiA9IHJhd0NvbmZpZ3VyYXRpb25Nb2RlbHMucmVkdWNlKChwcmV2aW91cywgY3VycmVudCkgPT4gY3VycmVudCA9PT0gcHJldmlvdXMgPyBjdXJyZW50IDogcHJldmlvdXMubWVyZ2UoY3VycmVudCksIHJhd0NvbmZpZ3VyYXRpb25Nb2RlbHNbMF0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gcmF3IGlzIHNhbWUgYXMgY3VycmVudFxuXHRcdFx0XHR0aGlzLl9yYXdDb25maWd1cmF0aW9uID0gdGhpcztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Jhd0NvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRnZXQgY29udGVudHMoKTogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4ge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZW50cztcblx0fVxuXG5cdGdldCBvdmVycmlkZXMoKTogSU92ZXJyaWRlc1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fb3ZlcnJpZGVzO1xuXHR9XG5cblx0Z2V0IGtleXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9rZXlzO1xuXHR9XG5cblx0Z2V0IHJhdygpOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+W10gfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fcmF3KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoQXJyYXkuaXNBcnJheSh0aGlzLl9yYXcpICYmIHRoaXMuX3Jhdy5ldmVyeShyYXcgPT4gcmF3IGluc3RhbmNlb2YgQ29uZmlndXJhdGlvbk1vZGVsKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3JhdyBhcyBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+W107XG5cdH1cblxuXHRpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9rZXlzLmxlbmd0aCA9PT0gMCAmJiBPYmplY3Qua2V5cyh0aGlzLl9jb250ZW50cykubGVuZ3RoID09PSAwICYmIHRoaXMuX292ZXJyaWRlcy5sZW5ndGggPT09IDA7XG5cdH1cblxuXHRnZXRWYWx1ZTxWPihzZWN0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBWIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gc2VjdGlvbiA/IGdldENvbmZpZ3VyYXRpb25WYWx1ZTxWPih0aGlzLmNvbnRlbnRzLCBzZWN0aW9uKSA6IHRoaXMuY29udGVudHMgYXMgVjtcblx0fVxuXG5cdGluc3BlY3Q8Vj4oc2VjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCBvdmVycmlkZUlkZW50aWZpZXI/OiBzdHJpbmcgfCBudWxsKTogSW5zcGVjdFZhbHVlPFY+IHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0IHZhbHVlKCkge1xuXHRcdFx0XHRyZXR1cm4gZnJlZXplKHRoYXQucmF3Q29uZmlndXJhdGlvbi5nZXRWYWx1ZTxWPihzZWN0aW9uKSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG92ZXJyaWRlKCkge1xuXHRcdFx0XHRyZXR1cm4gb3ZlcnJpZGVJZGVudGlmaWVyID8gZnJlZXplKHRoYXQucmF3Q29uZmlndXJhdGlvbi5nZXRPdmVycmlkZVZhbHVlPFY+KHNlY3Rpb24sIG92ZXJyaWRlSWRlbnRpZmllcikpIDogdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGdldCBtZXJnZWQoKSB7XG5cdFx0XHRcdHJldHVybiBmcmVlemUob3ZlcnJpZGVJZGVudGlmaWVyID8gdGhhdC5yYXdDb25maWd1cmF0aW9uLm92ZXJyaWRlKG92ZXJyaWRlSWRlbnRpZmllcikuZ2V0VmFsdWU8Vj4oc2VjdGlvbikgOiB0aGF0LnJhd0NvbmZpZ3VyYXRpb24uZ2V0VmFsdWU8Vj4oc2VjdGlvbikpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBvdmVycmlkZXMoKSB7XG5cdFx0XHRcdGNvbnN0IG92ZXJyaWRlczogeyByZWFkb25seSBpZGVudGlmaWVyczogc3RyaW5nW107IHJlYWRvbmx5IHZhbHVlOiBWIH1bXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHsgY29udGVudHMsIGlkZW50aWZpZXJzLCBrZXlzIH0gb2YgdGhhdC5yYXdDb25maWd1cmF0aW9uLm92ZXJyaWRlcykge1xuXHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gbmV3IENvbmZpZ3VyYXRpb25Nb2RlbChjb250ZW50cywga2V5cywgW10sIHVuZGVmaW5lZCwgdGhhdC5sb2dTZXJ2aWNlKS5nZXRWYWx1ZTxWPihzZWN0aW9uKTtcblx0XHRcdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGVzLnB1c2goeyBpZGVudGlmaWVycywgdmFsdWUgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBvdmVycmlkZXMubGVuZ3RoID8gZnJlZXplKG92ZXJyaWRlcykgOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGdldE92ZXJyaWRlVmFsdWU8Vj4oc2VjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCBvdmVycmlkZUlkZW50aWZpZXI6IHN0cmluZyk6IFYgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG92ZXJyaWRlQ29udGVudHMgPSB0aGlzLmdldENvbnRlbnRzRm9yT3ZlcnJpZGVJZGVudGlmZXIob3ZlcnJpZGVJZGVudGlmaWVyKTtcblx0XHRyZXR1cm4gb3ZlcnJpZGVDb250ZW50c1xuXHRcdFx0PyBzZWN0aW9uID8gZ2V0Q29uZmlndXJhdGlvblZhbHVlPFY+KG92ZXJyaWRlQ29udGVudHMsIHNlY3Rpb24pIDogb3ZlcnJpZGVDb250ZW50cyBhcyBWXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldEtleXNGb3JPdmVycmlkZUlkZW50aWZpZXIoaWRlbnRpZmllcjogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBvdmVycmlkZSBvZiB0aGlzLm92ZXJyaWRlcykge1xuXHRcdFx0aWYgKG92ZXJyaWRlLmlkZW50aWZpZXJzLmluY2x1ZGVzKGlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdGtleXMucHVzaCguLi5vdmVycmlkZS5rZXlzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGFycmF5cy5kaXN0aW5jdChrZXlzKTtcblx0fVxuXG5cdGdldEFsbE92ZXJyaWRlSWRlbnRpZmllcnMoKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IG92ZXJyaWRlIG9mIHRoaXMub3ZlcnJpZGVzKSB7XG5cdFx0XHRyZXN1bHQucHVzaCguLi5vdmVycmlkZS5pZGVudGlmaWVycyk7XG5cdFx0fVxuXHRcdHJldHVybiBhcnJheXMuZGlzdGluY3QocmVzdWx0KTtcblx0fVxuXG5cdG92ZXJyaWRlKGlkZW50aWZpZXI6IHN0cmluZyk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0bGV0IG92ZXJyaWRlQ29uZmlndXJhdGlvbk1vZGVsID0gdGhpcy5vdmVycmlkZUNvbmZpZ3VyYXRpb25zLmdldChpZGVudGlmaWVyKTtcblx0XHRpZiAoIW92ZXJyaWRlQ29uZmlndXJhdGlvbk1vZGVsKSB7XG5cdFx0XHRvdmVycmlkZUNvbmZpZ3VyYXRpb25Nb2RlbCA9IHRoaXMuY3JlYXRlT3ZlcnJpZGVDb25maWd1cmF0aW9uTW9kZWwoaWRlbnRpZmllcik7XG5cdFx0XHR0aGlzLm92ZXJyaWRlQ29uZmlndXJhdGlvbnMuc2V0KGlkZW50aWZpZXIsIG92ZXJyaWRlQ29uZmlndXJhdGlvbk1vZGVsKTtcblx0XHR9XG5cdFx0cmV0dXJuIG92ZXJyaWRlQ29uZmlndXJhdGlvbk1vZGVsO1xuXHR9XG5cblx0bWVyZ2UoLi4ub3RoZXJzOiBDb25maWd1cmF0aW9uTW9kZWxbXSk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0Y29uc3QgY29udGVudHMgPSBvYmplY3RzLmRlZXBDbG9uZSh0aGlzLmNvbnRlbnRzKTtcblx0XHRjb25zdCBvdmVycmlkZXMgPSBvYmplY3RzLmRlZXBDbG9uZSh0aGlzLm92ZXJyaWRlcyk7XG5cdFx0Y29uc3Qga2V5cyA9IFsuLi50aGlzLmtleXNdO1xuXHRcdGNvbnN0IHJhd3MgPSB0aGlzLl9yYXcgPyBBcnJheS5pc0FycmF5KHRoaXMuX3JhdykgPyBbLi4udGhpcy5fcmF3XSA6IFt0aGlzLl9yYXddIDogW3RoaXNdO1xuXG5cdFx0Zm9yIChjb25zdCBvdGhlciBvZiBvdGhlcnMpIHtcblx0XHRcdHJhd3MucHVzaCguLi4ob3RoZXIuX3JhdyA/IEFycmF5LmlzQXJyYXkob3RoZXIuX3JhdykgPyBvdGhlci5fcmF3IDogW290aGVyLl9yYXddIDogW290aGVyXSkpO1xuXHRcdFx0aWYgKG90aGVyLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMubWVyZ2VDb250ZW50cyhjb250ZW50cywgb3RoZXIuY29udGVudHMpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IG90aGVyT3ZlcnJpZGUgb2Ygb3RoZXIub3ZlcnJpZGVzKSB7XG5cdFx0XHRcdGNvbnN0IFtvdmVycmlkZV0gPSBvdmVycmlkZXMuZmlsdGVyKG8gPT4gYXJyYXlzLmVxdWFscyhvLmlkZW50aWZpZXJzLCBvdGhlck92ZXJyaWRlLmlkZW50aWZpZXJzKSk7XG5cdFx0XHRcdGlmIChvdmVycmlkZSkge1xuXHRcdFx0XHRcdHRoaXMubWVyZ2VDb250ZW50cyhvdmVycmlkZS5jb250ZW50cywgb3RoZXJPdmVycmlkZS5jb250ZW50cyk7XG5cdFx0XHRcdFx0b3ZlcnJpZGUua2V5cy5wdXNoKC4uLm90aGVyT3ZlcnJpZGUua2V5cyk7XG5cdFx0XHRcdFx0b3ZlcnJpZGUua2V5cyA9IGFycmF5cy5kaXN0aW5jdChvdmVycmlkZS5rZXlzKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRvdmVycmlkZXMucHVzaChvYmplY3RzLmRlZXBDbG9uZShvdGhlck92ZXJyaWRlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIG90aGVyLmtleXMpIHtcblx0XHRcdFx0aWYgKGtleXMuaW5kZXhPZihrZXkpID09PSAtMSkge1xuXHRcdFx0XHRcdGtleXMucHVzaChrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKGNvbnRlbnRzLCBrZXlzLCBvdmVycmlkZXMsICFyYXdzLmxlbmd0aCB8fCByYXdzLmV2ZXJ5KHJhdyA9PiByYXcgaW5zdGFuY2VvZiBDb25maWd1cmF0aW9uTW9kZWwpID8gdW5kZWZpbmVkIDogcmF3cywgdGhpcy5sb2dTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlT3ZlcnJpZGVDb25maWd1cmF0aW9uTW9kZWwoaWRlbnRpZmllcjogc3RyaW5nKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRjb25zdCBvdmVycmlkZUNvbnRlbnRzID0gdGhpcy5nZXRDb250ZW50c0Zvck92ZXJyaWRlSWRlbnRpZmVyKGlkZW50aWZpZXIpO1xuXG5cdFx0aWYgKCFvdmVycmlkZUNvbnRlbnRzIHx8IHR5cGVvZiBvdmVycmlkZUNvbnRlbnRzICE9PSAnb2JqZWN0JyB8fCAhT2JqZWN0LmtleXMob3ZlcnJpZGVDb250ZW50cykubGVuZ3RoKSB7XG5cdFx0XHQvLyBJZiB0aGVyZSBhcmUgbm8gdmFsaWQgb3ZlcnJpZGVzLCByZXR1cm4gc2VsZlxuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudHM6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+ID0ge307XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgYXJyYXlzLmRpc3RpbmN0KFsuLi5PYmplY3Qua2V5cyh0aGlzLmNvbnRlbnRzKSwgLi4uT2JqZWN0LmtleXMob3ZlcnJpZGVDb250ZW50cyldKSkge1xuXG5cdFx0XHRsZXQgY29udGVudHNGb3JLZXkgPSB0aGlzLmNvbnRlbnRzW2tleV07XG5cdFx0XHRjb25zdCBvdmVycmlkZUNvbnRlbnRzRm9yS2V5ID0gb3ZlcnJpZGVDb250ZW50c1trZXldO1xuXG5cdFx0XHQvLyBJZiB0aGVyZSBhcmUgb3ZlcnJpZGUgY29udGVudHMgZm9yIHRoZSBrZXksIGNsb25lIGFuZCBtZXJnZSBvdGhlcndpc2UgdXNlIGJhc2UgY29udGVudHNcblx0XHRcdGlmIChvdmVycmlkZUNvbnRlbnRzRm9yS2V5KSB7XG5cdFx0XHRcdC8vIENsb25lIGFuZCBtZXJnZSBvbmx5IGlmIGJhc2UgY29udGVudHMgYW5kIG92ZXJyaWRlIGNvbnRlbnRzIGFyZSBvZiB0eXBlIG9iamVjdCBvdGhlcndpc2UganVzdCBvdmVycmlkZVxuXHRcdFx0XHRpZiAodHlwZW9mIGNvbnRlbnRzRm9yS2V5ID09PSAnb2JqZWN0JyAmJiB0eXBlb2Ygb3ZlcnJpZGVDb250ZW50c0ZvcktleSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRjb250ZW50c0ZvcktleSA9IG9iamVjdHMuZGVlcENsb25lKGNvbnRlbnRzRm9yS2V5KTtcblx0XHRcdFx0XHR0aGlzLm1lcmdlQ29udGVudHMoY29udGVudHNGb3JLZXkgYXMgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4sIG92ZXJyaWRlQ29udGVudHNGb3JLZXkgYXMgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnRlbnRzRm9yS2V5ID0gb3ZlcnJpZGVDb250ZW50c0ZvcktleTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb250ZW50c1trZXldID0gY29udGVudHNGb3JLZXk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBDb25maWd1cmF0aW9uTW9kZWwoY29udGVudHMsIHRoaXMua2V5cywgdGhpcy5vdmVycmlkZXMsIHVuZGVmaW5lZCwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgbWVyZ2VDb250ZW50cyhzb3VyY2U6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+LCB0YXJnZXQ6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModGFyZ2V0KSkge1xuXHRcdFx0aWYgKGtleSBpbiBzb3VyY2UpIHtcblx0XHRcdFx0aWYgKHR5cGVzLmlzT2JqZWN0KHNvdXJjZVtrZXldKSAmJiB0eXBlcy5pc09iamVjdCh0YXJnZXRba2V5XSkpIHtcblx0XHRcdFx0XHR0aGlzLm1lcmdlQ29udGVudHMoc291cmNlW2tleV0gYXMgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4sIHRhcmdldFtrZXldIGFzIElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+KTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0c291cmNlW2tleV0gPSBvYmplY3RzLmRlZXBDbG9uZSh0YXJnZXRba2V5XSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb250ZW50c0Zvck92ZXJyaWRlSWRlbnRpZmVyKGlkZW50aWZpZXI6IHN0cmluZyk6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgbnVsbCB7XG5cdFx0bGV0IGNvbnRlbnRzRm9ySWRlbnRpZmllck9ubHk6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IGNvbnRlbnRzOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IG51bGwgPSBudWxsO1xuXHRcdGNvbnN0IG1lcmdlQ29udGVudHMgPSAoY29udGVudHNUb01lcmdlOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IG51bGwpID0+IHtcblx0XHRcdGlmIChjb250ZW50c1RvTWVyZ2UpIHtcblx0XHRcdFx0aWYgKGNvbnRlbnRzKSB7XG5cdFx0XHRcdFx0dGhpcy5tZXJnZUNvbnRlbnRzKGNvbnRlbnRzLCBjb250ZW50c1RvTWVyZ2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnRlbnRzID0gb2JqZWN0cy5kZWVwQ2xvbmUoY29udGVudHNUb01lcmdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Zm9yIChjb25zdCBvdmVycmlkZSBvZiB0aGlzLm92ZXJyaWRlcykge1xuXHRcdFx0aWYgKG92ZXJyaWRlLmlkZW50aWZpZXJzLmxlbmd0aCA9PT0gMSAmJiBvdmVycmlkZS5pZGVudGlmaWVyc1swXSA9PT0gaWRlbnRpZmllcikge1xuXHRcdFx0XHRjb250ZW50c0ZvcklkZW50aWZpZXJPbmx5ID0gb3ZlcnJpZGUuY29udGVudHM7XG5cdFx0XHR9IGVsc2UgaWYgKG92ZXJyaWRlLmlkZW50aWZpZXJzLmluY2x1ZGVzKGlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdG1lcmdlQ29udGVudHMob3ZlcnJpZGUuY29udGVudHMpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBNZXJnZSBjb250ZW50cyBvZiB0aGUgaWRlbnRpZmllciBvbmx5IGF0IHRoZSBlbmQgdG8gdGFrZSBwcmVjZWRlbmNlLlxuXHRcdG1lcmdlQ29udGVudHMoY29udGVudHNGb3JJZGVudGlmaWVyT25seSk7XG5cdFx0cmV0dXJuIGNvbnRlbnRzO1xuXHR9XG5cblx0dG9KU09OKCk6IElDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50czogdGhpcy5jb250ZW50cyxcblx0XHRcdG92ZXJyaWRlczogdGhpcy5vdmVycmlkZXMsXG5cdFx0XHRrZXlzOiB0aGlzLmtleXNcblx0XHR9O1xuXHR9XG5cblx0Ly8gVXBkYXRlIG1ldGhvZHNcblxuXHRwdWJsaWMgYWRkVmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVWYWx1ZShrZXksIHZhbHVlLCB0cnVlKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRWYWx1ZShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZVZhbHVlKGtleSwgdmFsdWUsIGZhbHNlKTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVWYWx1ZShrZXk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5rZXlzLmluZGV4T2Yoa2V5KTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMua2V5cy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdHJlbW92ZUZyb21WYWx1ZVRyZWUodGhpcy5jb250ZW50cywga2V5KTtcblx0XHRpZiAoT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChrZXkpKSB7XG5cdFx0XHR0aGlzLm92ZXJyaWRlcy5zcGxpY2UodGhpcy5vdmVycmlkZXMuZmluZEluZGV4KG8gPT4gYXJyYXlzLmVxdWFscyhvLmlkZW50aWZpZXJzLCBvdmVycmlkZUlkZW50aWZpZXJzRnJvbUtleShrZXkpKSksIDEpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBhZGQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRhZGRUb1ZhbHVlVHJlZSh0aGlzLmNvbnRlbnRzLCBrZXksIHZhbHVlLCBlID0+IHRoaXMubG9nU2VydmljZS5lcnJvcihlKSk7XG5cdFx0YWRkID0gYWRkIHx8IHRoaXMua2V5cy5pbmRleE9mKGtleSkgPT09IC0xO1xuXHRcdGlmIChhZGQpIHtcblx0XHRcdHRoaXMua2V5cy5wdXNoKGtleSk7XG5cdFx0fVxuXHRcdGlmIChPVkVSUklERV9QUk9QRVJUWV9SRUdFWC50ZXN0KGtleSkpIHtcblx0XHRcdGNvbnN0IG92ZXJyaWRlQ29udGVudHMgPSB0aGlzLmNvbnRlbnRzW2tleV0gYXMgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj47XG5cdFx0XHRjb25zdCBpZGVudGlmaWVycyA9IG92ZXJyaWRlSWRlbnRpZmllcnNGcm9tS2V5KGtleSk7XG5cdFx0XHRjb25zdCBvdmVycmlkZSA9IHtcblx0XHRcdFx0aWRlbnRpZmllcnMsXG5cdFx0XHRcdGtleXM6IE9iamVjdC5rZXlzKG92ZXJyaWRlQ29udGVudHMpLFxuXHRcdFx0XHRjb250ZW50czogdG9WYWx1ZXNUcmVlKG92ZXJyaWRlQ29udGVudHMsIG1lc3NhZ2UgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKG1lc3NhZ2UpKSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMub3ZlcnJpZGVzLmZpbmRJbmRleChvID0+IGFycmF5cy5lcXVhbHMoby5pZGVudGlmaWVycywgaWRlbnRpZmllcnMpKTtcblx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0dGhpcy5vdmVycmlkZXNbaW5kZXhdID0gb3ZlcnJpZGU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm92ZXJyaWRlcy5wdXNoKG92ZXJyaWRlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zIHtcblx0c2tpcFVucmVnaXN0ZXJlZD86IGJvb2xlYW47XG5cdHNjb3Blcz86IENvbmZpZ3VyYXRpb25TY29wZVtdO1xuXHRza2lwUmVzdHJpY3RlZD86IGJvb2xlYW47XG5cdGluY2x1ZGU/OiBzdHJpbmdbXTtcblx0ZXhjbHVkZT86IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyIHtcblxuXHRwcml2YXRlIF9yYXc6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2NvbmZpZ3VyYXRpb25Nb2RlbDogQ29uZmlndXJhdGlvbk1vZGVsIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX3Jlc3RyaWN0ZWRDb25maWd1cmF0aW9uczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBfcGFyc2VFcnJvcnM6IGpzb24uUGFyc2VFcnJvcltdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9uYW1lOiBzdHJpbmcsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkgeyB9XG5cblx0Z2V0IGNvbmZpZ3VyYXRpb25Nb2RlbCgpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uTW9kZWwgfHwgQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwodGhpcy5sb2dTZXJ2aWNlKTtcblx0fVxuXG5cdGdldCByZXN0cmljdGVkQ29uZmlndXJhdGlvbnMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9yZXN0cmljdGVkQ29uZmlndXJhdGlvbnM7XG5cdH1cblxuXHRnZXQgZXJyb3JzKCk6IGpzb24uUGFyc2VFcnJvcltdIHtcblx0XHRyZXR1cm4gdGhpcy5fcGFyc2VFcnJvcnM7XG5cdH1cblxuXHRwdWJsaWMgcGFyc2UoY29udGVudDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IENvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnMpOiB2b2lkIHtcblx0XHRpZiAoIXR5cGVzLmlzVW5kZWZpbmVkT3JOdWxsKGNvbnRlbnQpKSB7XG5cdFx0XHRjb25zdCByYXcgPSB0aGlzLmRvUGFyc2VDb250ZW50KGNvbnRlbnQpO1xuXHRcdFx0dGhpcy5wYXJzZVJhdyhyYXcsIG9wdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZXBhcnNlKG9wdGlvbnM6IENvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnMpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcmF3KSB7XG5cdFx0XHR0aGlzLnBhcnNlUmF3KHRoaXMuX3Jhdywgb3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHBhcnNlUmF3KHJhdzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4sIG9wdGlvbnM/OiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5fcmF3ID0gcmF3O1xuXHRcdGNvbnN0IHsgY29udGVudHMsIGtleXMsIG92ZXJyaWRlcywgcmVzdHJpY3RlZCwgaGFzRXhjbHVkZWRQcm9wZXJ0aWVzIH0gPSB0aGlzLmRvUGFyc2VSYXcocmF3LCBvcHRpb25zKTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uTW9kZWwgPSBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKGNvbnRlbnRzLCBrZXlzLCBvdmVycmlkZXMsIGhhc0V4Y2x1ZGVkUHJvcGVydGllcyA/IFtyYXddIDogdW5kZWZpbmVkIC8qIHJhdyBoYXMgbm90IGNoYW5nZWQgKi8sIHRoaXMubG9nU2VydmljZSk7XG5cdFx0dGhpcy5fcmVzdHJpY3RlZENvbmZpZ3VyYXRpb25zID0gcmVzdHJpY3RlZCB8fCBbXTtcblx0fVxuXG5cdHByaXZhdGUgZG9QYXJzZUNvbnRlbnQoY29udGVudDogc3RyaW5nKTogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4ge1xuXHRcdGxldCByYXc6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+ID0ge307XG5cdFx0bGV0IGN1cnJlbnRQcm9wZXJ0eTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IGN1cnJlbnRQYXJlbnQ6IHVua25vd25bXSB8IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+ID0gW107XG5cdFx0Y29uc3QgcHJldmlvdXNQYXJlbnRzOiAodW5rbm93bltdIHwgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4pW10gPSBbXTtcblx0XHRjb25zdCBwYXJzZUVycm9yczoganNvbi5QYXJzZUVycm9yW10gPSBbXTtcblxuXHRcdGZ1bmN0aW9uIG9uVmFsdWUodmFsdWU6IHVua25vd24pIHtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGN1cnJlbnRQYXJlbnQpKSB7XG5cdFx0XHRcdGN1cnJlbnRQYXJlbnQucHVzaCh2YWx1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGN1cnJlbnRQcm9wZXJ0eSAhPT0gbnVsbCkge1xuXHRcdFx0XHRjdXJyZW50UGFyZW50W2N1cnJlbnRQcm9wZXJ0eV0gPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB2aXNpdG9yOiBqc29uLkpTT05WaXNpdG9yID0ge1xuXHRcdFx0b25PYmplY3RCZWdpbjogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSB7fTtcblx0XHRcdFx0b25WYWx1ZShvYmplY3QpO1xuXHRcdFx0XHRwcmV2aW91c1BhcmVudHMucHVzaChjdXJyZW50UGFyZW50KTtcblx0XHRcdFx0Y3VycmVudFBhcmVudCA9IG9iamVjdDtcblx0XHRcdFx0Y3VycmVudFByb3BlcnR5ID0gbnVsbDtcblx0XHRcdH0sXG5cdFx0XHRvbk9iamVjdFByb3BlcnR5OiAobmFtZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGN1cnJlbnRQcm9wZXJ0eSA9IG5hbWU7XG5cdFx0XHR9LFxuXHRcdFx0b25PYmplY3RFbmQ6ICgpID0+IHtcblx0XHRcdFx0Y3VycmVudFBhcmVudCA9IHByZXZpb3VzUGFyZW50cy5wb3AoKSE7XG5cdFx0XHR9LFxuXHRcdFx0b25BcnJheUJlZ2luOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGFycmF5OiB1bmtub3duW10gPSBbXTtcblx0XHRcdFx0b25WYWx1ZShhcnJheSk7XG5cdFx0XHRcdHByZXZpb3VzUGFyZW50cy5wdXNoKGN1cnJlbnRQYXJlbnQpO1xuXHRcdFx0XHRjdXJyZW50UGFyZW50ID0gYXJyYXk7XG5cdFx0XHRcdGN1cnJlbnRQcm9wZXJ0eSA9IG51bGw7XG5cdFx0XHR9LFxuXHRcdFx0b25BcnJheUVuZDogKCkgPT4ge1xuXHRcdFx0XHRjdXJyZW50UGFyZW50ID0gcHJldmlvdXNQYXJlbnRzLnBvcCgpITtcblx0XHRcdH0sXG5cdFx0XHRvbkxpdGVyYWxWYWx1ZTogb25WYWx1ZSxcblx0XHRcdG9uRXJyb3I6IChlcnJvcjoganNvbi5QYXJzZUVycm9yQ29kZSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdHBhcnNlRXJyb3JzLnB1c2goeyBlcnJvciwgb2Zmc2V0LCBsZW5ndGggfSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0anNvbi52aXNpdChjb250ZW50LCB2aXNpdG9yKTtcblx0XHRcdFx0cmF3ID0gKGN1cnJlbnRQYXJlbnRbMF0gYXMgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4pIHx8IHt9O1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHdoaWxlIHBhcnNpbmcgc2V0dGluZ3MgZmlsZSAke3RoaXMuX25hbWV9OiAke2V9YCk7XG5cdFx0XHRcdHRoaXMuX3BhcnNlRXJyb3JzID0gW2UgYXMganNvbi5QYXJzZUVycm9yXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmF3O1xuXHR9XG5cblx0cHJvdGVjdGVkIGRvUGFyc2VSYXcocmF3OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiwgb3B0aW9ucz86IENvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnMpOiBJQ29uZmlndXJhdGlvbk1vZGVsICYgeyByZXN0cmljdGVkPzogc3RyaW5nW107IGhhc0V4Y2x1ZGVkUHJvcGVydGllcz86IGJvb2xlYW4gfSB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0gcmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRjb25zdCBleGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0gcmVnaXN0cnkuZ2V0RXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdGNvbnN0IGZpbHRlcmVkID0gdGhpcy5maWx0ZXIocmF3LCBjb25maWd1cmF0aW9uUHJvcGVydGllcywgZXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllcywgdHJ1ZSwgb3B0aW9ucyk7XG5cdFx0cmF3ID0gZmlsdGVyZWQucmF3O1xuXHRcdGNvbnN0IGNvbnRlbnRzID0gdG9WYWx1ZXNUcmVlKHJhdywgbWVzc2FnZSA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYENvbmZsaWN0IGluIHNldHRpbmdzIGZpbGUgJHt0aGlzLl9uYW1lfTogJHttZXNzYWdlfWApKTtcblx0XHRjb25zdCBrZXlzID0gT2JqZWN0LmtleXMocmF3KTtcblx0XHRjb25zdCBvdmVycmlkZXMgPSB0aGlzLnRvT3ZlcnJpZGVzKHJhdywgbWVzc2FnZSA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYENvbmZsaWN0IGluIHNldHRpbmdzIGZpbGUgJHt0aGlzLl9uYW1lfTogJHttZXNzYWdlfWApKTtcblx0XHRyZXR1cm4geyBjb250ZW50cywga2V5cywgb3ZlcnJpZGVzLCByZXN0cmljdGVkOiBmaWx0ZXJlZC5yZXN0cmljdGVkLCBoYXNFeGNsdWRlZFByb3BlcnRpZXM6IGZpbHRlcmVkLmhhc0V4Y2x1ZGVkUHJvcGVydGllcyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXIocHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4sIGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzOiBJU3RyaW5nRGljdGlvbmFyeTxJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4sIGV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPiwgZmlsdGVyT3ZlcnJpZGRlblByb3BlcnRpZXM6IGJvb2xlYW4sIG9wdGlvbnM/OiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zKTogeyByYXc6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+OyByZXN0cmljdGVkOiBzdHJpbmdbXTsgaGFzRXhjbHVkZWRQcm9wZXJ0aWVzOiBib29sZWFuIH0ge1xuXHRcdGxldCBoYXNFeGNsdWRlZFByb3BlcnRpZXMgPSBmYWxzZTtcblx0XHRpZiAoIW9wdGlvbnM/LnNjb3BlcyAmJiAhb3B0aW9ucz8uc2tpcFJlc3RyaWN0ZWQgJiYgIW9wdGlvbnM/LnNraXBVbnJlZ2lzdGVyZWQgJiYgIW9wdGlvbnM/LmV4Y2x1ZGU/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHsgcmF3OiBwcm9wZXJ0aWVzLCByZXN0cmljdGVkOiBbXSwgaGFzRXhjbHVkZWRQcm9wZXJ0aWVzIH07XG5cdFx0fVxuXHRcdGNvbnN0IHJhdzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gPSB7fTtcblx0XHRjb25zdCByZXN0cmljdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qga2V5IGluIHByb3BlcnRpZXMpIHtcblx0XHRcdGlmIChPVkVSUklERV9QUk9QRVJUWV9SRUdFWC50ZXN0KGtleSkgJiYgZmlsdGVyT3ZlcnJpZGRlblByb3BlcnRpZXMpIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5maWx0ZXIocHJvcGVydGllc1trZXldIGFzIElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+LCBjb25maWd1cmF0aW9uUHJvcGVydGllcywgZXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllcywgZmFsc2UsIG9wdGlvbnMpO1xuXHRcdFx0XHRyYXdba2V5XSA9IHJlc3VsdC5yYXc7XG5cdFx0XHRcdGhhc0V4Y2x1ZGVkUHJvcGVydGllcyA9IGhhc0V4Y2x1ZGVkUHJvcGVydGllcyB8fCByZXN1bHQuaGFzRXhjbHVkZWRQcm9wZXJ0aWVzO1xuXHRcdFx0XHRyZXN0cmljdGVkLnB1c2goLi4ucmVzdWx0LnJlc3RyaWN0ZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcHJvcGVydHlTY2hlbWEgPSBjb25maWd1cmF0aW9uUHJvcGVydGllc1trZXldO1xuXHRcdFx0XHRpZiAocHJvcGVydHlTY2hlbWE/LnJlc3RyaWN0ZWQpIHtcblx0XHRcdFx0XHRyZXN0cmljdGVkLnB1c2goa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5zaG91bGRJbmNsdWRlKGtleSwgcHJvcGVydHlTY2hlbWEsIGV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXMsIG9wdGlvbnMpKSB7XG5cdFx0XHRcdFx0cmF3W2tleV0gPSBwcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aGFzRXhjbHVkZWRQcm9wZXJ0aWVzID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyByYXcsIHJlc3RyaWN0ZWQsIGhhc0V4Y2x1ZGVkUHJvcGVydGllcyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRJbmNsdWRlKGtleTogc3RyaW5nLCBwcm9wZXJ0eVNjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB8IHVuZGVmaW5lZCwgZXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8SVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+LCBvcHRpb25zOiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zKTogYm9vbGVhbiB7XG5cdFx0aWYgKG9wdGlvbnMuZXhjbHVkZT8uaW5jbHVkZXMoa2V5KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLmluY2x1ZGU/LmluY2x1ZGVzKGtleSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLnNraXBSZXN0cmljdGVkICYmIHByb3BlcnR5U2NoZW1hPy5yZXN0cmljdGVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuc2tpcFVucmVnaXN0ZXJlZCAmJiAhcHJvcGVydHlTY2hlbWEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBzY2hlbWEgPSBwcm9wZXJ0eVNjaGVtYSA/PyBleGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2tleV07XG5cdFx0Y29uc3Qgc2NvcGUgPSBzY2hlbWEgPyB0eXBlb2Ygc2NoZW1hLnNjb3BlICE9PSAndW5kZWZpbmVkJyA/IHNjaGVtYS5zY29wZSA6IENvbmZpZ3VyYXRpb25TY29wZS5XSU5ET1cgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHNjb3BlID09PSB1bmRlZmluZWQgfHwgb3B0aW9ucy5zY29wZXMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG9wdGlvbnMuc2NvcGVzLmluY2x1ZGVzKHNjb3BlKTtcblx0fVxuXG5cdHByaXZhdGUgdG9PdmVycmlkZXMocmF3OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiwgY29uZmxpY3RSZXBvcnRlcjogKG1lc3NhZ2U6IHN0cmluZykgPT4gdm9pZCk6IElPdmVycmlkZXNbXSB7XG5cdFx0Y29uc3Qgb3ZlcnJpZGVzOiBJT3ZlcnJpZGVzW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhyYXcpKSB7XG5cdFx0XHRpZiAoT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChrZXkpKSB7XG5cdFx0XHRcdGNvbnN0IG92ZXJyaWRlUmF3OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiA9IHt9O1xuXHRcdFx0XHRjb25zdCByYXdLZXkgPSByYXdba2V5XSBhcyBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPjtcblx0XHRcdFx0Zm9yIChjb25zdCBrZXlJbk92ZXJyaWRlUmF3IGluIHJhd0tleSkge1xuXHRcdFx0XHRcdG92ZXJyaWRlUmF3W2tleUluT3ZlcnJpZGVSYXddID0gcmF3S2V5W2tleUluT3ZlcnJpZGVSYXddO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG92ZXJyaWRlcy5wdXNoKHtcblx0XHRcdFx0XHRpZGVudGlmaWVyczogb3ZlcnJpZGVJZGVudGlmaWVyc0Zyb21LZXkoa2V5KSxcblx0XHRcdFx0XHRrZXlzOiBPYmplY3Qua2V5cyhvdmVycmlkZVJhdyksXG5cdFx0XHRcdFx0Y29udGVudHM6IHRvVmFsdWVzVHJlZShvdmVycmlkZVJhdywgY29uZmxpY3RSZXBvcnRlcilcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvdmVycmlkZXM7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgVXNlclNldHRpbmdzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwYXJzZXI6IENvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlcjtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZTogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHVzZXJTZXR0aW5nc1Jlc291cmNlOiBVUkksXG5cdFx0cHJvdGVjdGVkIHBhcnNlT3B0aW9uczogQ29uZmlndXJhdGlvblBhcnNlT3B0aW9ucyxcblx0XHRleHRVcmk6IElFeHRVcmksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5wYXJzZXIgPSBuZXcgQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyKHRoaXMudXNlclNldHRpbmdzUmVzb3VyY2UudG9TdHJpbmcoKSwgbG9nU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS53YXRjaChleHRVcmkuZGlybmFtZSh0aGlzLnVzZXJTZXR0aW5nc1Jlc291cmNlKSkpO1xuXHRcdC8vIEFsc28gbGlzdGVuIHRvIHRoZSByZXNvdXJjZSBpbmNhc2UgdGhlIHJlc291cmNlIGlzIGEgc3ltbGluayAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTgxMzRcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVTZXJ2aWNlLndhdGNoKHRoaXMudXNlclNldHRpbmdzUmVzb3VyY2UpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoXG5cdFx0XHRFdmVudC5maWx0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlLCBlID0+IGUuY29udGFpbnModGhpcy51c2VyU2V0dGluZ3NSZXNvdXJjZSkpLFxuXHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24sIGUgPT4gKGUuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5DUkVBVEUpIHx8IGUuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5DT1BZKSB8fCBlLmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uREVMRVRFKSB8fCBlLmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uV1JJVEUpKSAmJiBleHRVcmkuaXNFcXVhbChlLnJlc291cmNlLCB1c2VyU2V0dGluZ3NSZXNvdXJjZSkpXG5cdFx0KSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZS5maXJlKCkpKTtcblx0fVxuXG5cdGFzeW5jIGxvYWRDb25maWd1cmF0aW9uKCk6IFByb21pc2U8Q29uZmlndXJhdGlvbk1vZGVsPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRoaXMudXNlclNldHRpbmdzUmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5wYXJzZXIucGFyc2UoY29udGVudC52YWx1ZS50b1N0cmluZygpIHx8ICd7fScsIHRoaXMucGFyc2VPcHRpb25zKTtcblx0XHRcdHJldHVybiB0aGlzLnBhcnNlci5jb25maWd1cmF0aW9uTW9kZWw7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKHRoaXMubG9nU2VydmljZSk7XG5cdFx0fVxuXHR9XG5cblx0cmVwYXJzZShwYXJzZU9wdGlvbnM/OiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRpZiAocGFyc2VPcHRpb25zKSB7XG5cdFx0XHR0aGlzLnBhcnNlT3B0aW9ucyA9IHBhcnNlT3B0aW9ucztcblx0XHR9XG5cdFx0dGhpcy5wYXJzZXIucmVwYXJzZSh0aGlzLnBhcnNlT3B0aW9ucyk7XG5cdFx0cmV0dXJuIHRoaXMucGFyc2VyLmNvbmZpZ3VyYXRpb25Nb2RlbDtcblx0fVxuXG5cdGdldFJlc3RyaWN0ZWRTZXR0aW5ncygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMucGFyc2VyLnJlc3RyaWN0ZWRDb25maWd1cmF0aW9ucztcblx0fVxufVxuXG5jbGFzcyBDb25maWd1cmF0aW9uSW5zcGVjdFZhbHVlPFY+IGltcGxlbWVudHMgSUNvbmZpZ3VyYXRpb25WYWx1ZTxWPiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBrZXk6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdmFsdWU6IFYgfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgb3ZlcnJpZGVJZGVudGlmaWVyczogc3RyaW5nW10gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0Q29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcG9saWN5Q29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYXBwbGljYXRpb25Db25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1c2VyQ29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9jYWxVc2VyQ29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlVXNlckNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZvbGRlckNvbmZpZ3VyYXRpb25Nb2RlbDogQ29uZmlndXJhdGlvbk1vZGVsIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWVtb3J5Q29uZmlndXJhdGlvbk1vZGVsOiBDb25maWd1cmF0aW9uTW9kZWxcblx0KSB7XG5cdH1cblxuXHRnZXQgdmFsdWUoKTogViB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGZyZWV6ZSh0aGlzLl92YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHRvSW5zcGVjdFZhbHVlKGluc3BlY3RWYWx1ZTogSUluc3BlY3RWYWx1ZTxWPiB8IHVuZGVmaW5lZCB8IG51bGwpOiBJSW5zcGVjdFZhbHVlPFY+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gaW5zcGVjdFZhbHVlPy52YWx1ZSAhPT0gdW5kZWZpbmVkIHx8IGluc3BlY3RWYWx1ZT8ub3ZlcnJpZGUgIT09IHVuZGVmaW5lZCB8fCBpbnNwZWN0VmFsdWU/Lm92ZXJyaWRlcyAhPT0gdW5kZWZpbmVkID8gaW5zcGVjdFZhbHVlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVmYXVsdEluc3BlY3RWYWx1ZTogSW5zcGVjdFZhbHVlPFY+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCBkZWZhdWx0SW5zcGVjdFZhbHVlKCk6IEluc3BlY3RWYWx1ZTxWPiB7XG5cdFx0aWYgKCF0aGlzLl9kZWZhdWx0SW5zcGVjdFZhbHVlKSB7XG5cdFx0XHR0aGlzLl9kZWZhdWx0SW5zcGVjdFZhbHVlID0gdGhpcy5kZWZhdWx0Q29uZmlndXJhdGlvbi5pbnNwZWN0PFY+KHRoaXMua2V5LCB0aGlzLm92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdEluc3BlY3RWYWx1ZTtcblx0fVxuXG5cdGdldCBkZWZhdWx0VmFsdWUoKTogViB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZGVmYXVsdEluc3BlY3RWYWx1ZS5tZXJnZWQ7XG5cdH1cblxuXHRnZXQgZGVmYXVsdCgpOiBJSW5zcGVjdFZhbHVlPFY+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy50b0luc3BlY3RWYWx1ZSh0aGlzLmRlZmF1bHRJbnNwZWN0VmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcG9saWN5SW5zcGVjdFZhbHVlOiBJbnNwZWN0VmFsdWU8Vj4gfCB1bmRlZmluZWQgfCBudWxsO1xuXHRwcml2YXRlIGdldCBwb2xpY3lJbnNwZWN0VmFsdWUoKTogSW5zcGVjdFZhbHVlPFY+IHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX3BvbGljeUluc3BlY3RWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9wb2xpY3lJbnNwZWN0VmFsdWUgPSB0aGlzLnBvbGljeUNvbmZpZ3VyYXRpb24gPyB0aGlzLnBvbGljeUNvbmZpZ3VyYXRpb24uaW5zcGVjdDxWPih0aGlzLmtleSkgOiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcG9saWN5SW5zcGVjdFZhbHVlO1xuXHR9XG5cblx0Z2V0IHBvbGljeVZhbHVlKCk6IFYgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnBvbGljeUluc3BlY3RWYWx1ZT8ubWVyZ2VkO1xuXHR9XG5cblx0Z2V0IHBvbGljeSgpOiBJSW5zcGVjdFZhbHVlPFY+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5wb2xpY3lJbnNwZWN0VmFsdWU/LnZhbHVlICE9PSB1bmRlZmluZWQgPyB7IHZhbHVlOiB0aGlzLnBvbGljeUluc3BlY3RWYWx1ZS52YWx1ZSB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbGljYXRpb25JbnNwZWN0VmFsdWU6IEluc3BlY3RWYWx1ZTxWPiB8IHVuZGVmaW5lZCB8IG51bGw7XG5cdHByaXZhdGUgZ2V0IGFwcGxpY2F0aW9uSW5zcGVjdFZhbHVlKCk6IEluc3BlY3RWYWx1ZTxWPiB8IG51bGwge1xuXHRcdGlmICh0aGlzLl9hcHBsaWNhdGlvbkluc3BlY3RWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9hcHBsaWNhdGlvbkluc3BlY3RWYWx1ZSA9IHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uID8gdGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24uaW5zcGVjdDxWPih0aGlzLmtleSkgOiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYXBwbGljYXRpb25JbnNwZWN0VmFsdWU7XG5cdH1cblxuXHRnZXQgYXBwbGljYXRpb25WYWx1ZSgpOiBWIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5hcHBsaWNhdGlvbkluc3BlY3RWYWx1ZT8ubWVyZ2VkO1xuXHR9XG5cblx0Z2V0IGFwcGxpY2F0aW9uKCk6IElJbnNwZWN0VmFsdWU8Vj4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnRvSW5zcGVjdFZhbHVlKHRoaXMuYXBwbGljYXRpb25JbnNwZWN0VmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXNlckluc3BlY3RWYWx1ZTogSW5zcGVjdFZhbHVlPFY+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCB1c2VySW5zcGVjdFZhbHVlKCk6IEluc3BlY3RWYWx1ZTxWPiB7XG5cdFx0aWYgKCF0aGlzLl91c2VySW5zcGVjdFZhbHVlKSB7XG5cdFx0XHR0aGlzLl91c2VySW5zcGVjdFZhbHVlID0gdGhpcy51c2VyQ29uZmlndXJhdGlvbi5pbnNwZWN0PFY+KHRoaXMua2V5LCB0aGlzLm92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdXNlckluc3BlY3RWYWx1ZTtcblx0fVxuXG5cdGdldCB1c2VyVmFsdWUoKTogViB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckluc3BlY3RWYWx1ZS5tZXJnZWQ7XG5cdH1cblxuXHRnZXQgdXNlcigpOiBJSW5zcGVjdFZhbHVlPFY+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy50b0luc3BlY3RWYWx1ZSh0aGlzLnVzZXJJbnNwZWN0VmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXNlckxvY2FsSW5zcGVjdFZhbHVlOiBJbnNwZWN0VmFsdWU8Vj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IHVzZXJMb2NhbEluc3BlY3RWYWx1ZSgpOiBJbnNwZWN0VmFsdWU8Vj4ge1xuXHRcdGlmICghdGhpcy5fdXNlckxvY2FsSW5zcGVjdFZhbHVlKSB7XG5cdFx0XHR0aGlzLl91c2VyTG9jYWxJbnNwZWN0VmFsdWUgPSB0aGlzLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24uaW5zcGVjdDxWPih0aGlzLmtleSwgdGhpcy5vdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3VzZXJMb2NhbEluc3BlY3RWYWx1ZTtcblx0fVxuXG5cdGdldCB1c2VyTG9jYWxWYWx1ZSgpOiBWIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy51c2VyTG9jYWxJbnNwZWN0VmFsdWUubWVyZ2VkO1xuXHR9XG5cblx0Z2V0IHVzZXJMb2NhbCgpOiBJSW5zcGVjdFZhbHVlPFY+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy50b0luc3BlY3RWYWx1ZSh0aGlzLnVzZXJMb2NhbEluc3BlY3RWYWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF91c2VyUmVtb3RlSW5zcGVjdFZhbHVlOiBJbnNwZWN0VmFsdWU8Vj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IHVzZXJSZW1vdGVJbnNwZWN0VmFsdWUoKTogSW5zcGVjdFZhbHVlPFY+IHtcblx0XHRpZiAoIXRoaXMuX3VzZXJSZW1vdGVJbnNwZWN0VmFsdWUpIHtcblx0XHRcdHRoaXMuX3VzZXJSZW1vdGVJbnNwZWN0VmFsdWUgPSB0aGlzLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uLmluc3BlY3Q8Vj4odGhpcy5rZXksIHRoaXMub3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcik7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl91c2VyUmVtb3RlSW5zcGVjdFZhbHVlO1xuXHR9XG5cblx0Z2V0IHVzZXJSZW1vdGVWYWx1ZSgpOiBWIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy51c2VyUmVtb3RlSW5zcGVjdFZhbHVlLm1lcmdlZDtcblx0fVxuXG5cdGdldCB1c2VyUmVtb3RlKCk6IElJbnNwZWN0VmFsdWU8Vj4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnRvSW5zcGVjdFZhbHVlKHRoaXMudXNlclJlbW90ZUluc3BlY3RWYWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF93b3Jrc3BhY2VJbnNwZWN0VmFsdWU6IEluc3BlY3RWYWx1ZTxWPiB8IHVuZGVmaW5lZCB8IG51bGw7XG5cdHByaXZhdGUgZ2V0IHdvcmtzcGFjZUluc3BlY3RWYWx1ZSgpOiBJbnNwZWN0VmFsdWU8Vj4gfCBudWxsIHtcblx0XHRpZiAodGhpcy5fd29ya3NwYWNlSW5zcGVjdFZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZUluc3BlY3RWYWx1ZSA9IHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbiA/IHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5pbnNwZWN0PFY+KHRoaXMua2V5LCB0aGlzLm92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXIpIDogbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtzcGFjZUluc3BlY3RWYWx1ZTtcblx0fVxuXG5cdGdldCB3b3Jrc3BhY2VWYWx1ZSgpOiBWIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VJbnNwZWN0VmFsdWU/Lm1lcmdlZDtcblx0fVxuXG5cdGdldCB3b3Jrc3BhY2UoKTogSUluc3BlY3RWYWx1ZTxWPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudG9JbnNwZWN0VmFsdWUodGhpcy53b3Jrc3BhY2VJbnNwZWN0VmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd29ya3NwYWNlRm9sZGVySW5zcGVjdFZhbHVlOiBJbnNwZWN0VmFsdWU8Vj4gfCB1bmRlZmluZWQgfCBudWxsO1xuXHRwcml2YXRlIGdldCB3b3Jrc3BhY2VGb2xkZXJJbnNwZWN0VmFsdWUoKTogSW5zcGVjdFZhbHVlPFY+IHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX3dvcmtzcGFjZUZvbGRlckluc3BlY3RWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VGb2xkZXJJbnNwZWN0VmFsdWUgPSB0aGlzLmZvbGRlckNvbmZpZ3VyYXRpb25Nb2RlbCA/IHRoaXMuZm9sZGVyQ29uZmlndXJhdGlvbk1vZGVsLmluc3BlY3Q8Vj4odGhpcy5rZXksIHRoaXMub3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcikgOiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlRm9sZGVySW5zcGVjdFZhbHVlO1xuXHR9XG5cblx0Z2V0IHdvcmtzcGFjZUZvbGRlclZhbHVlKCk6IFYgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZUZvbGRlckluc3BlY3RWYWx1ZT8ubWVyZ2VkO1xuXHR9XG5cblx0Z2V0IHdvcmtzcGFjZUZvbGRlcigpOiBJSW5zcGVjdFZhbHVlPFY+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy50b0luc3BlY3RWYWx1ZSh0aGlzLndvcmtzcGFjZUZvbGRlckluc3BlY3RWYWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9tZW1vcnlJbnNwZWN0VmFsdWU6IEluc3BlY3RWYWx1ZTxWPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgbWVtb3J5SW5zcGVjdFZhbHVlKCk6IEluc3BlY3RWYWx1ZTxWPiB7XG5cdFx0aWYgKHRoaXMuX21lbW9yeUluc3BlY3RWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9tZW1vcnlJbnNwZWN0VmFsdWUgPSB0aGlzLm1lbW9yeUNvbmZpZ3VyYXRpb25Nb2RlbC5pbnNwZWN0PFY+KHRoaXMua2V5LCB0aGlzLm92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbWVtb3J5SW5zcGVjdFZhbHVlO1xuXHR9XG5cblx0Z2V0IG1lbW9yeVZhbHVlKCk6IFYgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLm1lbW9yeUluc3BlY3RWYWx1ZS5tZXJnZWQ7XG5cdH1cblxuXHRnZXQgbWVtb3J5KCk6IElJbnNwZWN0VmFsdWU8Vj4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnRvSW5zcGVjdFZhbHVlKHRoaXMubWVtb3J5SW5zcGVjdFZhbHVlKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBDb25maWd1cmF0aW9uIHtcblxuXHRwcml2YXRlIF93b3Jrc3BhY2VDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfZm9sZGVyc0NvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb25zID0gbmV3IFJlc291cmNlTWFwPENvbmZpZ3VyYXRpb25Nb2RlbD4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9kZWZhdWx0Q29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsLFxuXHRcdHByaXZhdGUgX3BvbGljeUNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCxcblx0XHRwcml2YXRlIF9hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCxcblx0XHRwcml2YXRlIF9sb2NhbFVzZXJDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwsXG5cdFx0cHJpdmF0ZSBfcmVtb3RlVXNlckNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCxcblx0XHRwcml2YXRlIF93b3Jrc3BhY2VDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwsXG5cdFx0cHJpdmF0ZSBfZm9sZGVyQ29uZmlndXJhdGlvbnM6IFJlc291cmNlTWFwPENvbmZpZ3VyYXRpb25Nb2RlbD4sXG5cdFx0cHJpdmF0ZSBfbWVtb3J5Q29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsLFxuXHRcdHByaXZhdGUgX21lbW9yeUNvbmZpZ3VyYXRpb25CeVJlc291cmNlOiBSZXNvdXJjZU1hcDxDb25maWd1cmF0aW9uTW9kZWw+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdH1cblxuXHRnZXRWYWx1ZShzZWN0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsIG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMsIHdvcmtzcGFjZTogV29ya3NwYWNlIHwgdW5kZWZpbmVkKTogdW5rbm93biB7XG5cdFx0Y29uc3QgY29uc29saWRhdGVDb25maWd1cmF0aW9uTW9kZWwgPSB0aGlzLmdldENvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb25Nb2RlbChzZWN0aW9uLCBvdmVycmlkZXMsIHdvcmtzcGFjZSk7XG5cdFx0cmV0dXJuIGNvbnNvbGlkYXRlQ29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKHNlY3Rpb24pO1xuXHR9XG5cblx0dXBkYXRlVmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBvdmVycmlkZXM6IElDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzID0ge30pOiB2b2lkIHtcblx0XHRsZXQgbWVtb3J5Q29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChvdmVycmlkZXMucmVzb3VyY2UpIHtcblx0XHRcdG1lbW9yeUNvbmZpZ3VyYXRpb24gPSB0aGlzLl9tZW1vcnlDb25maWd1cmF0aW9uQnlSZXNvdXJjZS5nZXQob3ZlcnJpZGVzLnJlc291cmNlKTtcblx0XHRcdGlmICghbWVtb3J5Q29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRtZW1vcnlDb25maWd1cmF0aW9uID0gQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwodGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdFx0dGhpcy5fbWVtb3J5Q29uZmlndXJhdGlvbkJ5UmVzb3VyY2Uuc2V0KG92ZXJyaWRlcy5yZXNvdXJjZSwgbWVtb3J5Q29uZmlndXJhdGlvbik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1lbW9yeUNvbmZpZ3VyYXRpb24gPSB0aGlzLl9tZW1vcnlDb25maWd1cmF0aW9uO1xuXHRcdH1cblxuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRtZW1vcnlDb25maWd1cmF0aW9uLnJlbW92ZVZhbHVlKGtleSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1lbW9yeUNvbmZpZ3VyYXRpb24uc2V0VmFsdWUoa2V5LCB2YWx1ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFvdmVycmlkZXMucmVzb3VyY2UpIHtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZUNvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb24gPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdGluc3BlY3Q8Qz4oa2V5OiBzdHJpbmcsIG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMsIHdvcmtzcGFjZTogV29ya3NwYWNlIHwgdW5kZWZpbmVkKTogSUNvbmZpZ3VyYXRpb25WYWx1ZTxDPiB7XG5cdFx0Y29uc3QgY29uc29saWRhdGVDb25maWd1cmF0aW9uTW9kZWwgPSB0aGlzLmdldENvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb25Nb2RlbChrZXksIG92ZXJyaWRlcywgd29ya3NwYWNlKTtcblx0XHRjb25zdCBmb2xkZXJDb25maWd1cmF0aW9uTW9kZWwgPSB0aGlzLmdldEZvbGRlckNvbmZpZ3VyYXRpb25Nb2RlbEZvclJlc291cmNlKG92ZXJyaWRlcy5yZXNvdXJjZSwgd29ya3NwYWNlKTtcblx0XHRjb25zdCBtZW1vcnlDb25maWd1cmF0aW9uTW9kZWwgPSBvdmVycmlkZXMucmVzb3VyY2UgPyB0aGlzLl9tZW1vcnlDb25maWd1cmF0aW9uQnlSZXNvdXJjZS5nZXQob3ZlcnJpZGVzLnJlc291cmNlKSB8fCB0aGlzLl9tZW1vcnlDb25maWd1cmF0aW9uIDogdGhpcy5fbWVtb3J5Q29uZmlndXJhdGlvbjtcblx0XHRjb25zdCBvdmVycmlkZUlkZW50aWZpZXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBvdmVycmlkZSBvZiBjb25zb2xpZGF0ZUNvbmZpZ3VyYXRpb25Nb2RlbC5vdmVycmlkZXMpIHtcblx0XHRcdGZvciAoY29uc3Qgb3ZlcnJpZGVJZGVudGlmaWVyIG9mIG92ZXJyaWRlLmlkZW50aWZpZXJzKSB7XG5cdFx0XHRcdGlmIChjb25zb2xpZGF0ZUNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRPdmVycmlkZVZhbHVlKGtleSwgb3ZlcnJpZGVJZGVudGlmaWVyKSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVycy5hZGQob3ZlcnJpZGVJZGVudGlmaWVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgQ29uZmlndXJhdGlvbkluc3BlY3RWYWx1ZTxDPihcblx0XHRcdGtleSxcblx0XHRcdG92ZXJyaWRlcyxcblx0XHRcdGNvbnNvbGlkYXRlQ29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlPEM+KGtleSksXG5cdFx0XHRvdmVycmlkZUlkZW50aWZpZXJzLnNpemUgPyBbLi4ub3ZlcnJpZGVJZGVudGlmaWVyc10gOiB1bmRlZmluZWQsXG5cdFx0XHR0aGlzLl9kZWZhdWx0Q29uZmlndXJhdGlvbixcblx0XHRcdHRoaXMuX3BvbGljeUNvbmZpZ3VyYXRpb24uaXNFbXB0eSgpID8gdW5kZWZpbmVkIDogdGhpcy5fcG9saWN5Q29uZmlndXJhdGlvbixcblx0XHRcdHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uLmlzRW1wdHkoKSA/IHVuZGVmaW5lZCA6IHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uLFxuXHRcdFx0dGhpcy51c2VyQ29uZmlndXJhdGlvbixcblx0XHRcdHRoaXMubG9jYWxVc2VyQ29uZmlndXJhdGlvbixcblx0XHRcdHRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24sXG5cdFx0XHR3b3Jrc3BhY2UgPyB0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uIDogdW5kZWZpbmVkLFxuXHRcdFx0Zm9sZGVyQ29uZmlndXJhdGlvbk1vZGVsID8gZm9sZGVyQ29uZmlndXJhdGlvbk1vZGVsIDogdW5kZWZpbmVkLFxuXHRcdFx0bWVtb3J5Q29uZmlndXJhdGlvbk1vZGVsXG5cdFx0KTtcblxuXHR9XG5cblx0a2V5cyh3b3Jrc3BhY2U6IFdvcmtzcGFjZSB8IHVuZGVmaW5lZCk6IHtcblx0XHRkZWZhdWx0OiBzdHJpbmdbXTtcblx0XHRwb2xpY3k6IHN0cmluZ1tdO1xuXHRcdHVzZXI6IHN0cmluZ1tdO1xuXHRcdHdvcmtzcGFjZTogc3RyaW5nW107XG5cdFx0d29ya3NwYWNlRm9sZGVyOiBzdHJpbmdbXTtcblx0fSB7XG5cdFx0Y29uc3QgZm9sZGVyQ29uZmlndXJhdGlvbk1vZGVsID0gdGhpcy5nZXRGb2xkZXJDb25maWd1cmF0aW9uTW9kZWxGb3JSZXNvdXJjZSh1bmRlZmluZWQsIHdvcmtzcGFjZSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRlZmF1bHQ6IHRoaXMuX2RlZmF1bHRDb25maWd1cmF0aW9uLmtleXMuc2xpY2UoMCksXG5cdFx0XHRwb2xpY3k6IHRoaXMuX3BvbGljeUNvbmZpZ3VyYXRpb24ua2V5cy5zbGljZSgwKSxcblx0XHRcdHVzZXI6IHRoaXMudXNlckNvbmZpZ3VyYXRpb24ua2V5cy5zbGljZSgwKSxcblx0XHRcdHdvcmtzcGFjZTogdGhpcy5fd29ya3NwYWNlQ29uZmlndXJhdGlvbi5rZXlzLnNsaWNlKDApLFxuXHRcdFx0d29ya3NwYWNlRm9sZGVyOiBmb2xkZXJDb25maWd1cmF0aW9uTW9kZWwgPyBmb2xkZXJDb25maWd1cmF0aW9uTW9kZWwua2V5cy5zbGljZSgwKSA6IFtdXG5cdFx0fTtcblx0fVxuXG5cdHVwZGF0ZURlZmF1bHRDb25maWd1cmF0aW9uKGRlZmF1bHRDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl9kZWZhdWx0Q29uZmlndXJhdGlvbiA9IGRlZmF1bHRDb25maWd1cmF0aW9uO1xuXHRcdHRoaXMuX3dvcmtzcGFjZUNvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb24gPSBudWxsO1xuXHRcdHRoaXMuX2ZvbGRlcnNDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9ucy5jbGVhcigpO1xuXHR9XG5cblx0dXBkYXRlUG9saWN5Q29uZmlndXJhdGlvbihwb2xpY3lDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl9wb2xpY3lDb25maWd1cmF0aW9uID0gcG9saWN5Q29uZmlndXJhdGlvbjtcblx0fVxuXG5cdHVwZGF0ZUFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbihhcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCk6IHZvaWQge1xuXHRcdHRoaXMuX2FwcGxpY2F0aW9uQ29uZmlndXJhdGlvbiA9IGFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbjtcblx0XHR0aGlzLl93b3Jrc3BhY2VDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uID0gbnVsbDtcblx0XHR0aGlzLl9mb2xkZXJzQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbnMuY2xlYXIoKTtcblx0fVxuXG5cdHVwZGF0ZUxvY2FsVXNlckNvbmZpZ3VyYXRpb24obG9jYWxVc2VyQ29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9jYWxVc2VyQ29uZmlndXJhdGlvbiA9IGxvY2FsVXNlckNvbmZpZ3VyYXRpb247XG5cdFx0dGhpcy5fdXNlckNvbmZpZ3VyYXRpb24gPSBudWxsO1xuXHRcdHRoaXMuX3dvcmtzcGFjZUNvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb24gPSBudWxsO1xuXHRcdHRoaXMuX2ZvbGRlcnNDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9ucy5jbGVhcigpO1xuXHR9XG5cblx0dXBkYXRlUmVtb3RlVXNlckNvbmZpZ3VyYXRpb24ocmVtb3RlVXNlckNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbW90ZVVzZXJDb25maWd1cmF0aW9uID0gcmVtb3RlVXNlckNvbmZpZ3VyYXRpb247XG5cdFx0dGhpcy5fdXNlckNvbmZpZ3VyYXRpb24gPSBudWxsO1xuXHRcdHRoaXMuX3dvcmtzcGFjZUNvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb24gPSBudWxsO1xuXHRcdHRoaXMuX2ZvbGRlcnNDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9ucy5jbGVhcigpO1xuXHR9XG5cblx0dXBkYXRlV29ya3NwYWNlQ29uZmlndXJhdGlvbih3b3Jrc3BhY2VDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uID0gd29ya3NwYWNlQ29uZmlndXJhdGlvbjtcblx0XHR0aGlzLl93b3Jrc3BhY2VDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uID0gbnVsbDtcblx0XHR0aGlzLl9mb2xkZXJzQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbnMuY2xlYXIoKTtcblx0fVxuXG5cdHVwZGF0ZUZvbGRlckNvbmZpZ3VyYXRpb24ocmVzb3VyY2U6IFVSSSwgY29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsKTogdm9pZCB7XG5cdFx0dGhpcy5fZm9sZGVyQ29uZmlndXJhdGlvbnMuc2V0KHJlc291cmNlLCBjb25maWd1cmF0aW9uKTtcblx0XHR0aGlzLl9mb2xkZXJzQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbnMuZGVsZXRlKHJlc291cmNlKTtcblx0fVxuXG5cdGRlbGV0ZUZvbGRlckNvbmZpZ3VyYXRpb24ocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuZm9sZGVyQ29uZmlndXJhdGlvbnMuZGVsZXRlKHJlc291cmNlKTtcblx0XHR0aGlzLl9mb2xkZXJzQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbnMuZGVsZXRlKHJlc291cmNlKTtcblx0fVxuXG5cdGNvbXBhcmVBbmRVcGRhdGVEZWZhdWx0Q29uZmlndXJhdGlvbihkZWZhdWx0czogQ29uZmlndXJhdGlvbk1vZGVsLCBrZXlzPzogc3RyaW5nW10pOiBJQ29uZmlndXJhdGlvbkNoYW5nZSB7XG5cdFx0Y29uc3Qgb3ZlcnJpZGVzOiBbc3RyaW5nLCBzdHJpbmdbXV1bXSA9IFtdO1xuXHRcdGlmICgha2V5cykge1xuXHRcdFx0Y29uc3QgeyBhZGRlZCwgdXBkYXRlZCwgcmVtb3ZlZCB9ID0gY29tcGFyZSh0aGlzLl9kZWZhdWx0Q29uZmlndXJhdGlvbiwgZGVmYXVsdHMpO1xuXHRcdFx0a2V5cyA9IFsuLi5hZGRlZCwgLi4udXBkYXRlZCwgLi4ucmVtb3ZlZF07XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcblx0XHRcdGZvciAoY29uc3Qgb3ZlcnJpZGVJZGVudGlmaWVyIG9mIG92ZXJyaWRlSWRlbnRpZmllcnNGcm9tS2V5KGtleSkpIHtcblx0XHRcdFx0Y29uc3QgZnJvbUtleXMgPSB0aGlzLl9kZWZhdWx0Q29uZmlndXJhdGlvbi5nZXRLZXlzRm9yT3ZlcnJpZGVJZGVudGlmaWVyKG92ZXJyaWRlSWRlbnRpZmllcik7XG5cdFx0XHRcdGNvbnN0IHRvS2V5cyA9IGRlZmF1bHRzLmdldEtleXNGb3JPdmVycmlkZUlkZW50aWZpZXIob3ZlcnJpZGVJZGVudGlmaWVyKTtcblx0XHRcdFx0Y29uc3Qga2V5cyA9IFtcblx0XHRcdFx0XHQuLi50b0tleXMuZmlsdGVyKGtleSA9PiBmcm9tS2V5cy5pbmRleE9mKGtleSkgPT09IC0xKSxcblx0XHRcdFx0XHQuLi5mcm9tS2V5cy5maWx0ZXIoa2V5ID0+IHRvS2V5cy5pbmRleE9mKGtleSkgPT09IC0xKSxcblx0XHRcdFx0XHQuLi5mcm9tS2V5cy5maWx0ZXIoa2V5ID0+ICFvYmplY3RzLmVxdWFscyh0aGlzLl9kZWZhdWx0Q29uZmlndXJhdGlvbi5vdmVycmlkZShvdmVycmlkZUlkZW50aWZpZXIpLmdldFZhbHVlKGtleSksIGRlZmF1bHRzLm92ZXJyaWRlKG92ZXJyaWRlSWRlbnRpZmllcikuZ2V0VmFsdWUoa2V5KSkpXG5cdFx0XHRcdF07XG5cdFx0XHRcdG92ZXJyaWRlcy5wdXNoKFtvdmVycmlkZUlkZW50aWZpZXIsIGtleXNdKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy51cGRhdGVEZWZhdWx0Q29uZmlndXJhdGlvbihkZWZhdWx0cyk7XG5cdFx0cmV0dXJuIHsga2V5cywgb3ZlcnJpZGVzIH07XG5cdH1cblxuXHRjb21wYXJlQW5kVXBkYXRlUG9saWN5Q29uZmlndXJhdGlvbihwb2xpY3lDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwpOiBJQ29uZmlndXJhdGlvbkNoYW5nZSB7XG5cdFx0Y29uc3QgeyBhZGRlZCwgdXBkYXRlZCwgcmVtb3ZlZCB9ID0gY29tcGFyZSh0aGlzLl9wb2xpY3lDb25maWd1cmF0aW9uLCBwb2xpY3lDb25maWd1cmF0aW9uKTtcblx0XHRjb25zdCBrZXlzID0gWy4uLmFkZGVkLCAuLi51cGRhdGVkLCAuLi5yZW1vdmVkXTtcblx0XHRpZiAoa2V5cy5sZW5ndGgpIHtcblx0XHRcdHRoaXMudXBkYXRlUG9saWN5Q29uZmlndXJhdGlvbihwb2xpY3lDb25maWd1cmF0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsga2V5cywgb3ZlcnJpZGVzOiBbXSB9O1xuXHR9XG5cblx0Y29tcGFyZUFuZFVwZGF0ZUFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbihhcHBsaWNhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsKTogSUNvbmZpZ3VyYXRpb25DaGFuZ2Uge1xuXHRcdGNvbnN0IHsgYWRkZWQsIHVwZGF0ZWQsIHJlbW92ZWQsIG92ZXJyaWRlcyB9ID0gY29tcGFyZSh0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbiwgYXBwbGljYXRpb24pO1xuXHRcdGNvbnN0IGtleXMgPSBbLi4uYWRkZWQsIC4uLnVwZGF0ZWQsIC4uLnJlbW92ZWRdO1xuXHRcdGlmIChrZXlzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy51cGRhdGVBcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24oYXBwbGljYXRpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4geyBrZXlzLCBvdmVycmlkZXMgfTtcblx0fVxuXG5cdGNvbXBhcmVBbmRVcGRhdGVMb2NhbFVzZXJDb25maWd1cmF0aW9uKHVzZXI6IENvbmZpZ3VyYXRpb25Nb2RlbCk6IElDb25maWd1cmF0aW9uQ2hhbmdlIHtcblx0XHRjb25zdCB7IGFkZGVkLCB1cGRhdGVkLCByZW1vdmVkLCBvdmVycmlkZXMgfSA9IGNvbXBhcmUodGhpcy5sb2NhbFVzZXJDb25maWd1cmF0aW9uLCB1c2VyKTtcblx0XHRjb25zdCBrZXlzID0gWy4uLmFkZGVkLCAuLi51cGRhdGVkLCAuLi5yZW1vdmVkXTtcblx0XHRpZiAoa2V5cy5sZW5ndGgpIHtcblx0XHRcdHRoaXMudXBkYXRlTG9jYWxVc2VyQ29uZmlndXJhdGlvbih1c2VyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsga2V5cywgb3ZlcnJpZGVzIH07XG5cdH1cblxuXHRjb21wYXJlQW5kVXBkYXRlUmVtb3RlVXNlckNvbmZpZ3VyYXRpb24odXNlcjogQ29uZmlndXJhdGlvbk1vZGVsKTogSUNvbmZpZ3VyYXRpb25DaGFuZ2Uge1xuXHRcdGNvbnN0IHsgYWRkZWQsIHVwZGF0ZWQsIHJlbW92ZWQsIG92ZXJyaWRlcyB9ID0gY29tcGFyZSh0aGlzLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uLCB1c2VyKTtcblx0XHRjb25zdCBrZXlzID0gWy4uLmFkZGVkLCAuLi51cGRhdGVkLCAuLi5yZW1vdmVkXTtcblx0XHRpZiAoa2V5cy5sZW5ndGgpIHtcblx0XHRcdHRoaXMudXBkYXRlUmVtb3RlVXNlckNvbmZpZ3VyYXRpb24odXNlcik7XG5cdFx0fVxuXHRcdHJldHVybiB7IGtleXMsIG92ZXJyaWRlcyB9O1xuXHR9XG5cblx0Y29tcGFyZUFuZFVwZGF0ZVdvcmtzcGFjZUNvbmZpZ3VyYXRpb24od29ya3NwYWNlQ29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsKTogSUNvbmZpZ3VyYXRpb25DaGFuZ2Uge1xuXHRcdGNvbnN0IHsgYWRkZWQsIHVwZGF0ZWQsIHJlbW92ZWQsIG92ZXJyaWRlcyB9ID0gY29tcGFyZSh0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24sIHdvcmtzcGFjZUNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IGtleXMgPSBbLi4uYWRkZWQsIC4uLnVwZGF0ZWQsIC4uLnJlbW92ZWRdO1xuXHRcdGlmIChrZXlzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy51cGRhdGVXb3Jrc3BhY2VDb25maWd1cmF0aW9uKHdvcmtzcGFjZUNvbmZpZ3VyYXRpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4geyBrZXlzLCBvdmVycmlkZXMgfTtcblx0fVxuXG5cdGNvbXBhcmVBbmRVcGRhdGVGb2xkZXJDb25maWd1cmF0aW9uKHJlc291cmNlOiBVUkksIGZvbGRlckNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCk6IElDb25maWd1cmF0aW9uQ2hhbmdlIHtcblx0XHRjb25zdCBjdXJyZW50Rm9sZGVyQ29uZmlndXJhdGlvbiA9IHRoaXMuZm9sZGVyQ29uZmlndXJhdGlvbnMuZ2V0KHJlc291cmNlKTtcblx0XHRjb25zdCB7IGFkZGVkLCB1cGRhdGVkLCByZW1vdmVkLCBvdmVycmlkZXMgfSA9IGNvbXBhcmUoY3VycmVudEZvbGRlckNvbmZpZ3VyYXRpb24sIGZvbGRlckNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IGtleXMgPSBbLi4uYWRkZWQsIC4uLnVwZGF0ZWQsIC4uLnJlbW92ZWRdO1xuXHRcdGlmIChrZXlzLmxlbmd0aCB8fCAhY3VycmVudEZvbGRlckNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdHRoaXMudXBkYXRlRm9sZGVyQ29uZmlndXJhdGlvbihyZXNvdXJjZSwgZm9sZGVyQ29uZmlndXJhdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiB7IGtleXMsIG92ZXJyaWRlcyB9O1xuXHR9XG5cblx0Y29tcGFyZUFuZERlbGV0ZUZvbGRlckNvbmZpZ3VyYXRpb24oZm9sZGVyOiBVUkkpOiBJQ29uZmlndXJhdGlvbkNoYW5nZSB7XG5cdFx0Y29uc3QgZm9sZGVyQ29uZmlnID0gdGhpcy5mb2xkZXJDb25maWd1cmF0aW9ucy5nZXQoZm9sZGVyKTtcblx0XHRpZiAoIWZvbGRlckNvbmZpZykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGZvbGRlcicpO1xuXHRcdH1cblx0XHR0aGlzLmRlbGV0ZUZvbGRlckNvbmZpZ3VyYXRpb24oZm9sZGVyKTtcblx0XHRjb25zdCB7IGFkZGVkLCB1cGRhdGVkLCByZW1vdmVkLCBvdmVycmlkZXMgfSA9IGNvbXBhcmUoZm9sZGVyQ29uZmlnLCB1bmRlZmluZWQpO1xuXHRcdHJldHVybiB7IGtleXM6IFsuLi5hZGRlZCwgLi4udXBkYXRlZCwgLi4ucmVtb3ZlZF0sIG92ZXJyaWRlcyB9O1xuXHR9XG5cblx0Z2V0IGRlZmF1bHRzKCk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHRDb25maWd1cmF0aW9uO1xuXHR9XG5cblx0Z2V0IGFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbigpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdHJldHVybiB0aGlzLl9hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRwcml2YXRlIF91c2VyQ29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsIHwgbnVsbCA9IG51bGw7XG5cdGdldCB1c2VyQ29uZmlndXJhdGlvbigpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdGlmICghdGhpcy5fdXNlckNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdGlmICh0aGlzLl9yZW1vdGVVc2VyQ29uZmlndXJhdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0dGhpcy5fdXNlckNvbmZpZ3VyYXRpb24gPSB0aGlzLl9sb2NhbFVzZXJDb25maWd1cmF0aW9uO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbWVyZ2VkID0gdGhpcy5fbG9jYWxVc2VyQ29uZmlndXJhdGlvbi5tZXJnZSh0aGlzLl9yZW1vdGVVc2VyQ29uZmlndXJhdGlvbik7XG5cdFx0XHRcdHRoaXMuX3VzZXJDb25maWd1cmF0aW9uID0gbmV3IENvbmZpZ3VyYXRpb25Nb2RlbChtZXJnZWQuY29udGVudHMsIG1lcmdlZC5rZXlzLCBtZXJnZWQub3ZlcnJpZGVzLCB1bmRlZmluZWQsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl91c2VyQ29uZmlndXJhdGlvbjtcblx0fVxuXG5cdGdldCBsb2NhbFVzZXJDb25maWd1cmF0aW9uKCk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xvY2FsVXNlckNvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRnZXQgcmVtb3RlVXNlckNvbmZpZ3VyYXRpb24oKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVtb3RlVXNlckNvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRnZXQgd29ya3NwYWNlQ29uZmlndXJhdGlvbigpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uO1xuXHR9XG5cblx0Z2V0IGZvbGRlckNvbmZpZ3VyYXRpb25zKCk6IFJlc291cmNlTWFwPENvbmZpZ3VyYXRpb25Nb2RlbD4ge1xuXHRcdHJldHVybiB0aGlzLl9mb2xkZXJDb25maWd1cmF0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29uc29saWRhdGVkQ29uZmlndXJhdGlvbk1vZGVsKHNlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCwgb3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcywgd29ya3NwYWNlOiBXb3Jrc3BhY2UgfCB1bmRlZmluZWQpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdGxldCBjb25maWd1cmF0aW9uTW9kZWwgPSB0aGlzLmdldENvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb25Nb2RlbEZvclJlc291cmNlKG92ZXJyaWRlcywgd29ya3NwYWNlKTtcblx0XHRpZiAob3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcikge1xuXHRcdFx0Y29uZmlndXJhdGlvbk1vZGVsID0gY29uZmlndXJhdGlvbk1vZGVsLm92ZXJyaWRlKG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXIpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3BvbGljeUNvbmZpZ3VyYXRpb24uaXNFbXB0eSgpICYmIHRoaXMuX3BvbGljeUNvbmZpZ3VyYXRpb24uZ2V0VmFsdWUoc2VjdGlvbikgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gY2xvbmUgYnkgbWVyZ2luZ1xuXHRcdFx0Y29uZmlndXJhdGlvbk1vZGVsID0gY29uZmlndXJhdGlvbk1vZGVsLm1lcmdlKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiB0aGlzLl9wb2xpY3lDb25maWd1cmF0aW9uLmtleXMpIHtcblx0XHRcdFx0Y29uZmlndXJhdGlvbk1vZGVsLnNldFZhbHVlKGtleSwgdGhpcy5fcG9saWN5Q29uZmlndXJhdGlvbi5nZXRWYWx1ZShrZXkpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25Nb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29uc29saWRhdGVkQ29uZmlndXJhdGlvbk1vZGVsRm9yUmVzb3VyY2UoeyByZXNvdXJjZSB9OiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcywgd29ya3NwYWNlOiBXb3Jrc3BhY2UgfCB1bmRlZmluZWQpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdGxldCBjb25zb2xpZGF0ZUNvbmZpZ3VyYXRpb24gPSB0aGlzLmdldFdvcmtzcGFjZUNvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb24oKTtcblxuXHRcdGlmICh3b3Jrc3BhY2UgJiYgcmVzb3VyY2UpIHtcblx0XHRcdGNvbnN0IHJvb3QgPSB3b3Jrc3BhY2UuZ2V0Rm9sZGVyKHJlc291cmNlKTtcblx0XHRcdGlmIChyb290KSB7XG5cdFx0XHRcdGNvbnNvbGlkYXRlQ29uZmlndXJhdGlvbiA9IHRoaXMuZ2V0Rm9sZGVyQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbihyb290LnVyaSkgfHwgY29uc29saWRhdGVDb25maWd1cmF0aW9uO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWVtb3J5Q29uZmlndXJhdGlvbkZvclJlc291cmNlID0gdGhpcy5fbWVtb3J5Q29uZmlndXJhdGlvbkJ5UmVzb3VyY2UuZ2V0KHJlc291cmNlKTtcblx0XHRcdGlmIChtZW1vcnlDb25maWd1cmF0aW9uRm9yUmVzb3VyY2UpIHtcblx0XHRcdFx0Y29uc29saWRhdGVDb25maWd1cmF0aW9uID0gY29uc29saWRhdGVDb25maWd1cmF0aW9uLm1lcmdlKG1lbW9yeUNvbmZpZ3VyYXRpb25Gb3JSZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbnNvbGlkYXRlQ29uZmlndXJhdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgZ2V0V29ya3NwYWNlQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbigpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdGlmICghdGhpcy5fd29ya3NwYWNlQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbikge1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbiA9IHRoaXMuX2RlZmF1bHRDb25maWd1cmF0aW9uLm1lcmdlKHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uLCB0aGlzLnVzZXJDb25maWd1cmF0aW9uLCB0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uLCB0aGlzLl9tZW1vcnlDb25maWd1cmF0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtzcGFjZUNvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRwcml2YXRlIGdldEZvbGRlckNvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb24oZm9sZGVyOiBVUkkpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdGxldCBmb2xkZXJDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uID0gdGhpcy5fZm9sZGVyc0NvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb25zLmdldChmb2xkZXIpO1xuXHRcdGlmICghZm9sZGVyQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbikge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlQ29uc29saWRhdGVDb25maWd1cmF0aW9uID0gdGhpcy5nZXRXb3Jrc3BhY2VDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRjb25zdCBmb2xkZXJDb25maWd1cmF0aW9uID0gdGhpcy5fZm9sZGVyQ29uZmlndXJhdGlvbnMuZ2V0KGZvbGRlcik7XG5cdFx0XHRpZiAoZm9sZGVyQ29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRmb2xkZXJDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uID0gd29ya3NwYWNlQ29uc29saWRhdGVDb25maWd1cmF0aW9uLm1lcmdlKGZvbGRlckNvbmZpZ3VyYXRpb24pO1xuXHRcdFx0XHR0aGlzLl9mb2xkZXJzQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbnMuc2V0KGZvbGRlciwgZm9sZGVyQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb2xkZXJDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uID0gd29ya3NwYWNlQ29uc29saWRhdGVDb25maWd1cmF0aW9uO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZm9sZGVyQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Rm9sZGVyQ29uZmlndXJhdGlvbk1vZGVsRm9yUmVzb3VyY2UocmVzb3VyY2U6IFVSSSB8IG51bGwgfCB1bmRlZmluZWQsIHdvcmtzcGFjZTogV29ya3NwYWNlIHwgdW5kZWZpbmVkKTogQ29uZmlndXJhdGlvbk1vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAod29ya3NwYWNlICYmIHJlc291cmNlKSB7XG5cdFx0XHRjb25zdCByb290ID0gd29ya3NwYWNlLmdldEZvbGRlcihyZXNvdXJjZSk7XG5cdFx0XHRpZiAocm9vdCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZm9sZGVyQ29uZmlndXJhdGlvbnMuZ2V0KHJvb3QudXJpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHRvRGF0YSgpOiBJQ29uZmlndXJhdGlvbkRhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHRkZWZhdWx0czoge1xuXHRcdFx0XHRjb250ZW50czogdGhpcy5fZGVmYXVsdENvbmZpZ3VyYXRpb24uY29udGVudHMsXG5cdFx0XHRcdG92ZXJyaWRlczogdGhpcy5fZGVmYXVsdENvbmZpZ3VyYXRpb24ub3ZlcnJpZGVzLFxuXHRcdFx0XHRrZXlzOiB0aGlzLl9kZWZhdWx0Q29uZmlndXJhdGlvbi5rZXlzLFxuXHRcdFx0fSxcblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRjb250ZW50czogdGhpcy5fcG9saWN5Q29uZmlndXJhdGlvbi5jb250ZW50cyxcblx0XHRcdFx0b3ZlcnJpZGVzOiB0aGlzLl9wb2xpY3lDb25maWd1cmF0aW9uLm92ZXJyaWRlcyxcblx0XHRcdFx0a2V5czogdGhpcy5fcG9saWN5Q29uZmlndXJhdGlvbi5rZXlzXG5cdFx0XHR9LFxuXHRcdFx0YXBwbGljYXRpb246IHtcblx0XHRcdFx0Y29udGVudHM6IHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uLmNvbnRlbnRzLFxuXHRcdFx0XHRvdmVycmlkZXM6IHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uLm92ZXJyaWRlcyxcblx0XHRcdFx0a2V5czogdGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24ua2V5cyxcblx0XHRcdFx0cmF3OiBBcnJheS5pc0FycmF5KHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uLnJhdykgPyB1bmRlZmluZWQgOiB0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbi5yYXdcblx0XHRcdH0sXG5cdFx0XHR1c2VyTG9jYWw6IHtcblx0XHRcdFx0Y29udGVudHM6IHRoaXMubG9jYWxVc2VyQ29uZmlndXJhdGlvbi5jb250ZW50cyxcblx0XHRcdFx0b3ZlcnJpZGVzOiB0aGlzLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24ub3ZlcnJpZGVzLFxuXHRcdFx0XHRrZXlzOiB0aGlzLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24ua2V5cyxcblx0XHRcdFx0cmF3OiBBcnJheS5pc0FycmF5KHRoaXMubG9jYWxVc2VyQ29uZmlndXJhdGlvbi5yYXcpID8gdW5kZWZpbmVkIDogdGhpcy5sb2NhbFVzZXJDb25maWd1cmF0aW9uLnJhd1xuXHRcdFx0fSxcblx0XHRcdHVzZXJSZW1vdGU6IHtcblx0XHRcdFx0Y29udGVudHM6IHRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24uY29udGVudHMsXG5cdFx0XHRcdG92ZXJyaWRlczogdGhpcy5yZW1vdGVVc2VyQ29uZmlndXJhdGlvbi5vdmVycmlkZXMsXG5cdFx0XHRcdGtleXM6IHRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24ua2V5cyxcblx0XHRcdFx0cmF3OiBBcnJheS5pc0FycmF5KHRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24ucmF3KSA/IHVuZGVmaW5lZCA6IHRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24ucmF3XG5cdFx0XHR9LFxuXHRcdFx0d29ya3NwYWNlOiB7XG5cdFx0XHRcdGNvbnRlbnRzOiB0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uLmNvbnRlbnRzLFxuXHRcdFx0XHRvdmVycmlkZXM6IHRoaXMuX3dvcmtzcGFjZUNvbmZpZ3VyYXRpb24ub3ZlcnJpZGVzLFxuXHRcdFx0XHRrZXlzOiB0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uLmtleXNcblx0XHRcdH0sXG5cdFx0XHRmb2xkZXJzOiBbLi4udGhpcy5fZm9sZGVyQ29uZmlndXJhdGlvbnMua2V5cygpXS5yZWR1Y2U8W1VyaUNvbXBvbmVudHMsIElDb25maWd1cmF0aW9uTW9kZWxdW10+KChyZXN1bHQsIGZvbGRlcikgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGNvbnRlbnRzLCBvdmVycmlkZXMsIGtleXMgfSA9IHRoaXMuX2ZvbGRlckNvbmZpZ3VyYXRpb25zLmdldChmb2xkZXIpITtcblx0XHRcdFx0cmVzdWx0LnB1c2goW2ZvbGRlciwgeyBjb250ZW50cywgb3ZlcnJpZGVzLCBrZXlzIH1dKTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0sIFtdKVxuXHRcdH07XG5cdH1cblxuXHRhbGxLZXlzKCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBrZXlzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdHRoaXMuX2RlZmF1bHRDb25maWd1cmF0aW9uLmtleXMuZm9yRWFjaChrZXkgPT4ga2V5cy5hZGQoa2V5KSk7XG5cdFx0dGhpcy51c2VyQ29uZmlndXJhdGlvbi5rZXlzLmZvckVhY2goa2V5ID0+IGtleXMuYWRkKGtleSkpO1xuXHRcdHRoaXMuX3dvcmtzcGFjZUNvbmZpZ3VyYXRpb24ua2V5cy5mb3JFYWNoKGtleSA9PiBrZXlzLmFkZChrZXkpKTtcblx0XHR0aGlzLl9mb2xkZXJDb25maWd1cmF0aW9ucy5mb3JFYWNoKGZvbGRlckNvbmZpZ3VyYXRpb24gPT4gZm9sZGVyQ29uZmlndXJhdGlvbi5rZXlzLmZvckVhY2goa2V5ID0+IGtleXMuYWRkKGtleSkpKTtcblx0XHRyZXR1cm4gWy4uLmtleXMudmFsdWVzKCldO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFsbE92ZXJyaWRlSWRlbnRpZmllcnMoKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IGtleXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dGhpcy5fZGVmYXVsdENvbmZpZ3VyYXRpb24uZ2V0QWxsT3ZlcnJpZGVJZGVudGlmaWVycygpLmZvckVhY2goa2V5ID0+IGtleXMuYWRkKGtleSkpO1xuXHRcdHRoaXMudXNlckNvbmZpZ3VyYXRpb24uZ2V0QWxsT3ZlcnJpZGVJZGVudGlmaWVycygpLmZvckVhY2goa2V5ID0+IGtleXMuYWRkKGtleSkpO1xuXHRcdHRoaXMuX3dvcmtzcGFjZUNvbmZpZ3VyYXRpb24uZ2V0QWxsT3ZlcnJpZGVJZGVudGlmaWVycygpLmZvckVhY2goa2V5ID0+IGtleXMuYWRkKGtleSkpO1xuXHRcdHRoaXMuX2ZvbGRlckNvbmZpZ3VyYXRpb25zLmZvckVhY2goZm9sZGVyQ29uZmlndXJhdGlvbiA9PiBmb2xkZXJDb25maWd1cmF0aW9uLmdldEFsbE92ZXJyaWRlSWRlbnRpZmllcnMoKS5mb3JFYWNoKGtleSA9PiBrZXlzLmFkZChrZXkpKSk7XG5cdFx0cmV0dXJuIFsuLi5rZXlzLnZhbHVlcygpXTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRBbGxLZXlzRm9yT3ZlcnJpZGVJZGVudGlmaWVyKG92ZXJyaWRlSWRlbnRpZmllcjogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IGtleXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dGhpcy5fZGVmYXVsdENvbmZpZ3VyYXRpb24uZ2V0S2V5c0Zvck92ZXJyaWRlSWRlbnRpZmllcihvdmVycmlkZUlkZW50aWZpZXIpLmZvckVhY2goa2V5ID0+IGtleXMuYWRkKGtleSkpO1xuXHRcdHRoaXMudXNlckNvbmZpZ3VyYXRpb24uZ2V0S2V5c0Zvck92ZXJyaWRlSWRlbnRpZmllcihvdmVycmlkZUlkZW50aWZpZXIpLmZvckVhY2goa2V5ID0+IGtleXMuYWRkKGtleSkpO1xuXHRcdHRoaXMuX3dvcmtzcGFjZUNvbmZpZ3VyYXRpb24uZ2V0S2V5c0Zvck92ZXJyaWRlSWRlbnRpZmllcihvdmVycmlkZUlkZW50aWZpZXIpLmZvckVhY2goa2V5ID0+IGtleXMuYWRkKGtleSkpO1xuXHRcdHRoaXMuX2ZvbGRlckNvbmZpZ3VyYXRpb25zLmZvckVhY2goZm9sZGVyQ29uZmlndXJhdGlvbiA9PiBmb2xkZXJDb25maWd1cmF0aW9uLmdldEtleXNGb3JPdmVycmlkZUlkZW50aWZpZXIob3ZlcnJpZGVJZGVudGlmaWVyKS5mb3JFYWNoKGtleSA9PiBrZXlzLmFkZChrZXkpKSk7XG5cdFx0cmV0dXJuIFsuLi5rZXlzLnZhbHVlcygpXTtcblx0fVxuXG5cdHN0YXRpYyBwYXJzZShkYXRhOiBJQ29uZmlndXJhdGlvbkRhdGEsIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKTogQ29uZmlndXJhdGlvbiB7XG5cdFx0Y29uc3QgZGVmYXVsdENvbmZpZ3VyYXRpb24gPSB0aGlzLnBhcnNlQ29uZmlndXJhdGlvbk1vZGVsKGRhdGEuZGVmYXVsdHMsIGxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHBvbGljeUNvbmZpZ3VyYXRpb24gPSB0aGlzLnBhcnNlQ29uZmlndXJhdGlvbk1vZGVsKGRhdGEucG9saWN5LCBsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBhcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gPSB0aGlzLnBhcnNlQ29uZmlndXJhdGlvbk1vZGVsKGRhdGEuYXBwbGljYXRpb24sIGxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHVzZXJMb2NhbENvbmZpZ3VyYXRpb24gPSB0aGlzLnBhcnNlQ29uZmlndXJhdGlvbk1vZGVsKGRhdGEudXNlckxvY2FsLCBsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCB1c2VyUmVtb3RlQ29uZmlndXJhdGlvbiA9IHRoaXMucGFyc2VDb25maWd1cmF0aW9uTW9kZWwoZGF0YS51c2VyUmVtb3RlLCBsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb25maWd1cmF0aW9uID0gdGhpcy5wYXJzZUNvbmZpZ3VyYXRpb25Nb2RlbChkYXRhLndvcmtzcGFjZSwgbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgZm9sZGVyczogUmVzb3VyY2VNYXA8Q29uZmlndXJhdGlvbk1vZGVsPiA9IGRhdGEuZm9sZGVycy5yZWR1Y2UoKHJlc3VsdCwgdmFsdWUpID0+IHtcblx0XHRcdHJlc3VsdC5zZXQoVVJJLnJldml2ZSh2YWx1ZVswXSksIHRoaXMucGFyc2VDb25maWd1cmF0aW9uTW9kZWwodmFsdWVbMV0sIGxvZ1NlcnZpY2UpKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSwgbmV3IFJlc291cmNlTWFwPENvbmZpZ3VyYXRpb25Nb2RlbD4oKSk7XG5cdFx0cmV0dXJuIG5ldyBDb25maWd1cmF0aW9uKFxuXHRcdFx0ZGVmYXVsdENvbmZpZ3VyYXRpb24sXG5cdFx0XHRwb2xpY3lDb25maWd1cmF0aW9uLFxuXHRcdFx0YXBwbGljYXRpb25Db25maWd1cmF0aW9uLFxuXHRcdFx0dXNlckxvY2FsQ29uZmlndXJhdGlvbixcblx0XHRcdHVzZXJSZW1vdGVDb25maWd1cmF0aW9uLFxuXHRcdFx0d29ya3NwYWNlQ29uZmlndXJhdGlvbixcblx0XHRcdGZvbGRlcnMsXG5cdFx0XHRDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChsb2dTZXJ2aWNlKSxcblx0XHRcdG5ldyBSZXNvdXJjZU1hcDxDb25maWd1cmF0aW9uTW9kZWw+KCksXG5cdFx0XHRsb2dTZXJ2aWNlXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHBhcnNlQ29uZmlndXJhdGlvbk1vZGVsKG1vZGVsOiBJQ29uZmlndXJhdGlvbk1vZGVsLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0cmV0dXJuIG5ldyBDb25maWd1cmF0aW9uTW9kZWwobW9kZWwuY29udGVudHMsIG1vZGVsLmtleXMsIG1vZGVsLm92ZXJyaWRlcywgbW9kZWwucmF3LCBsb2dTZXJ2aWNlKTtcblx0fVxuXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUNoYW5nZXMoLi4uY2hhbmdlczogSUNvbmZpZ3VyYXRpb25DaGFuZ2VbXSk6IElDb25maWd1cmF0aW9uQ2hhbmdlIHtcblx0aWYgKGNoYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHsga2V5czogW10sIG92ZXJyaWRlczogW10gfTtcblx0fVxuXHRpZiAoY2hhbmdlcy5sZW5ndGggPT09IDEpIHtcblx0XHRyZXR1cm4gY2hhbmdlc1swXTtcblx0fVxuXHRjb25zdCBrZXlzU2V0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IG92ZXJyaWRlc01hcCA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcblx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhbmdlcykge1xuXHRcdGNoYW5nZS5rZXlzLmZvckVhY2goa2V5ID0+IGtleXNTZXQuYWRkKGtleSkpO1xuXHRcdGNoYW5nZS5vdmVycmlkZXMuZm9yRWFjaCgoW2lkZW50aWZpZXIsIGtleXNdKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRPclNldChvdmVycmlkZXNNYXAsIGlkZW50aWZpZXIsIG5ldyBTZXQ8c3RyaW5nPigpKTtcblx0XHRcdGtleXMuZm9yRWFjaChrZXkgPT4gcmVzdWx0LmFkZChrZXkpKTtcblx0XHR9KTtcblx0fVxuXHRjb25zdCBvdmVycmlkZXM6IFtzdHJpbmcsIHN0cmluZ1tdXVtdID0gW107XG5cdG92ZXJyaWRlc01hcC5mb3JFYWNoKChrZXlzLCBpZGVudGlmaWVyKSA9PiBvdmVycmlkZXMucHVzaChbaWRlbnRpZmllciwgWy4uLmtleXMudmFsdWVzKCldXSkpO1xuXHRyZXR1cm4geyBrZXlzOiBbLi4ua2V5c1NldC52YWx1ZXMoKV0sIG92ZXJyaWRlcyB9O1xufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IGltcGxlbWVudHMgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbWFya2VyID0gJ1xcbic7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21hcmtlckNvZGUxID0gdGhpcy5fbWFya2VyLmNoYXJDb2RlQXQoMCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21hcmtlckNvZGUyID0gJy4nLmNoYXJDb2RlQXQoMCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FmZmVjdHNDb25maWdTdHI6IHN0cmluZztcblxuXHRyZWFkb25seSBhZmZlY3RlZEtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0c291cmNlITogQ29uZmlndXJhdGlvblRhcmdldDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjaGFuZ2U6IElDb25maWd1cmF0aW9uQ2hhbmdlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJldmlvdXM6IHsgd29ya3NwYWNlPzogV29ya3NwYWNlOyBkYXRhOiBJQ29uZmlndXJhdGlvbkRhdGEgfSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGN1cnJlbnRDb25maWd1cmFpdG9uOiBDb25maWd1cmF0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY3VycmVudFdvcmtzcGFjZTogV29ya3NwYWNlIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgY2hhbmdlLmtleXMpIHtcblx0XHRcdHRoaXMuYWZmZWN0ZWRLZXlzLmFkZChrZXkpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IFssIGtleXNdIG9mIGNoYW5nZS5vdmVycmlkZXMpIHtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcblx0XHRcdFx0dGhpcy5hZmZlY3RlZEtleXMuYWRkKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRXhhbXBsZTogJ1xcbmZvby5iYXJcXG5hYmMuZGVmXFxuJ1xuXHRcdHRoaXMuX2FmZmVjdHNDb25maWdTdHIgPSB0aGlzLl9tYXJrZXI7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgdGhpcy5hZmZlY3RlZEtleXMpIHtcblx0XHRcdHRoaXMuX2FmZmVjdHNDb25maWdTdHIgKz0ga2V5ICsgdGhpcy5fbWFya2VyO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3ByZXZpb3VzQ29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Z2V0IHByZXZpb3VzQ29uZmlndXJhdGlvbigpOiBDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX3ByZXZpb3VzQ29uZmlndXJhdGlvbiAmJiB0aGlzLnByZXZpb3VzKSB7XG5cdFx0XHR0aGlzLl9wcmV2aW91c0NvbmZpZ3VyYXRpb24gPSBDb25maWd1cmF0aW9uLnBhcnNlKHRoaXMucHJldmlvdXMuZGF0YSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3ByZXZpb3VzQ29uZmlndXJhdGlvbjtcblx0fVxuXG5cdGFmZmVjdHNDb25maWd1cmF0aW9uKHNlY3Rpb246IHN0cmluZywgb3ZlcnJpZGVzPzogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpOiBib29sZWFuIHtcblx0XHQvLyB3ZSBoYXZlIG9uZSBsYXJnZSBzdHJpbmcgd2l0aCBhbGwga2V5cyB0aGF0IGhhdmUgY2hhbmdlZC4gd2UgcGFkIChtYXJrZXIpIHRoZSBzZWN0aW9uXG5cdFx0Ly8gYW5kIGNoZWNrIHRoYXQgZWl0aGVyIGZpbmQgaXQgcGFkZGVkIG9yIGJlZm9yZSBhIHNlZ21lbnQgY2hhcmFjdGVyXG5cdFx0Y29uc3QgbmVlZGxlID0gdGhpcy5fbWFya2VyICsgc2VjdGlvbjtcblx0XHRjb25zdCBpZHggPSB0aGlzLl9hZmZlY3RzQ29uZmlnU3RyLmluZGV4T2YobmVlZGxlKTtcblx0XHRpZiAoaWR4IDwgMCkge1xuXHRcdFx0Ly8gTk9UOiAobWFya2VyICsgc2VjdGlvbilcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcG9zID0gaWR4ICsgbmVlZGxlLmxlbmd0aDtcblx0XHRpZiAocG9zID49IHRoaXMuX2FmZmVjdHNDb25maWdTdHIubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGNvZGUgPSB0aGlzLl9hZmZlY3RzQ29uZmlnU3RyLmNoYXJDb2RlQXQocG9zKTtcblx0XHRpZiAoY29kZSAhPT0gdGhpcy5fbWFya2VyQ29kZTEgJiYgY29kZSAhPT0gdGhpcy5fbWFya2VyQ29kZTIpIHtcblx0XHRcdC8vIE5PVDogc2VjdGlvbiArIChtYXJrZXIgfCBzZWdtZW50KVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAob3ZlcnJpZGVzKSB7XG5cdFx0XHRjb25zdCB2YWx1ZTEgPSB0aGlzLnByZXZpb3VzQ29uZmlndXJhdGlvbiA/IHRoaXMucHJldmlvdXNDb25maWd1cmF0aW9uLmdldFZhbHVlKHNlY3Rpb24sIG92ZXJyaWRlcywgdGhpcy5wcmV2aW91cz8ud29ya3NwYWNlKSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHZhbHVlMiA9IHRoaXMuY3VycmVudENvbmZpZ3VyYWl0b24uZ2V0VmFsdWUoc2VjdGlvbiwgb3ZlcnJpZGVzLCB0aGlzLmN1cnJlbnRXb3Jrc3BhY2UpO1xuXHRcdFx0cmV0dXJuICFvYmplY3RzLmVxdWFscyh2YWx1ZTEsIHZhbHVlMik7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmUoZnJvbTogQ29uZmlndXJhdGlvbk1vZGVsIHwgdW5kZWZpbmVkLCB0bzogQ29uZmlndXJhdGlvbk1vZGVsIHwgdW5kZWZpbmVkKTogSUNvbmZpZ3VyYXRpb25Db21wYXJlUmVzdWx0IHtcblx0Y29uc3QgeyBhZGRlZCwgcmVtb3ZlZCwgdXBkYXRlZCB9ID0gY29tcGFyZUNvbmZpZ3VyYXRpb25Db250ZW50cyh0bz8ucmF3Q29uZmlndXJhdGlvbiwgZnJvbT8ucmF3Q29uZmlndXJhdGlvbik7XG5cdGNvbnN0IG92ZXJyaWRlczogW3N0cmluZywgc3RyaW5nW11dW10gPSBbXTtcblxuXHRjb25zdCBmcm9tT3ZlcnJpZGVJZGVudGlmaWVycyA9IGZyb20/LmdldEFsbE92ZXJyaWRlSWRlbnRpZmllcnMoKSB8fCBbXTtcblx0Y29uc3QgdG9PdmVycmlkZUlkZW50aWZpZXJzID0gdG8/LmdldEFsbE92ZXJyaWRlSWRlbnRpZmllcnMoKSB8fCBbXTtcblxuXHRpZiAodG8pIHtcblx0XHRjb25zdCBhZGRlZE92ZXJyaWRlSWRlbnRpZmllcnMgPSB0b092ZXJyaWRlSWRlbnRpZmllcnMuZmlsdGVyKGtleSA9PiAhZnJvbU92ZXJyaWRlSWRlbnRpZmllcnMuaW5jbHVkZXMoa2V5KSk7XG5cdFx0Zm9yIChjb25zdCBpZGVudGlmaWVyIG9mIGFkZGVkT3ZlcnJpZGVJZGVudGlmaWVycykge1xuXHRcdFx0b3ZlcnJpZGVzLnB1c2goW2lkZW50aWZpZXIsIHRvLmdldEtleXNGb3JPdmVycmlkZUlkZW50aWZpZXIoaWRlbnRpZmllcildKTtcblx0XHR9XG5cdH1cblxuXHRpZiAoZnJvbSkge1xuXHRcdGNvbnN0IHJlbW92ZWRPdmVycmlkZUlkZW50aWZpZXJzID0gZnJvbU92ZXJyaWRlSWRlbnRpZmllcnMuZmlsdGVyKGtleSA9PiAhdG9PdmVycmlkZUlkZW50aWZpZXJzLmluY2x1ZGVzKGtleSkpO1xuXHRcdGZvciAoY29uc3QgaWRlbnRpZmllciBvZiByZW1vdmVkT3ZlcnJpZGVJZGVudGlmaWVycykge1xuXHRcdFx0b3ZlcnJpZGVzLnB1c2goW2lkZW50aWZpZXIsIGZyb20uZ2V0S2V5c0Zvck92ZXJyaWRlSWRlbnRpZmllcihpZGVudGlmaWVyKV0pO1xuXHRcdH1cblx0fVxuXG5cdGlmICh0byAmJiBmcm9tKSB7XG5cdFx0Zm9yIChjb25zdCBpZGVudGlmaWVyIG9mIGZyb21PdmVycmlkZUlkZW50aWZpZXJzKSB7XG5cdFx0XHRpZiAodG9PdmVycmlkZUlkZW50aWZpZXJzLmluY2x1ZGVzKGlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXBhcmVDb25maWd1cmF0aW9uQ29udGVudHMoeyBjb250ZW50czogZnJvbS5nZXRPdmVycmlkZVZhbHVlKHVuZGVmaW5lZCwgaWRlbnRpZmllcikgfHwge30sIGtleXM6IGZyb20uZ2V0S2V5c0Zvck92ZXJyaWRlSWRlbnRpZmllcihpZGVudGlmaWVyKSB9LCB7IGNvbnRlbnRzOiB0by5nZXRPdmVycmlkZVZhbHVlKHVuZGVmaW5lZCwgaWRlbnRpZmllcikgfHwge30sIGtleXM6IHRvLmdldEtleXNGb3JPdmVycmlkZUlkZW50aWZpZXIoaWRlbnRpZmllcikgfSk7XG5cdFx0XHRcdG92ZXJyaWRlcy5wdXNoKFtpZGVudGlmaWVyLCBbLi4ucmVzdWx0LmFkZGVkLCAuLi5yZXN1bHQucmVtb3ZlZCwgLi4ucmVzdWx0LnVwZGF0ZWRdXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHsgYWRkZWQsIHJlbW92ZWQsIHVwZGF0ZWQsIG92ZXJyaWRlcyB9O1xufVxuXG5mdW5jdGlvbiBjb21wYXJlQ29uZmlndXJhdGlvbkNvbnRlbnRzKHRvOiB7IGtleXM6IHN0cmluZ1tdOyBjb250ZW50czogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfSB8IHVuZGVmaW5lZCwgZnJvbTogeyBrZXlzOiBzdHJpbmdbXTsgY29udGVudHM6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IH0gfCB1bmRlZmluZWQpIHtcblx0Y29uc3QgYWRkZWQgPSB0b1xuXHRcdD8gZnJvbSA/IHRvLmtleXMuZmlsdGVyKGtleSA9PiBmcm9tLmtleXMuaW5kZXhPZihrZXkpID09PSAtMSkgOiBbLi4udG8ua2V5c11cblx0XHQ6IFtdO1xuXHRjb25zdCByZW1vdmVkID0gZnJvbVxuXHRcdD8gdG8gPyBmcm9tLmtleXMuZmlsdGVyKGtleSA9PiB0by5rZXlzLmluZGV4T2Yoa2V5KSA9PT0gLTEpIDogWy4uLmZyb20ua2V5c11cblx0XHQ6IFtdO1xuXHRjb25zdCB1cGRhdGVkOiBzdHJpbmdbXSA9IFtdO1xuXG5cdGlmICh0byAmJiBmcm9tKSB7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgZnJvbS5rZXlzKSB7XG5cdFx0XHRpZiAodG8ua2V5cy5pbmRleE9mKGtleSkgIT09IC0xKSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlMSA9IGdldENvbmZpZ3VyYXRpb25WYWx1ZShmcm9tLmNvbnRlbnRzLCBrZXkpO1xuXHRcdFx0XHRjb25zdCB2YWx1ZTIgPSBnZXRDb25maWd1cmF0aW9uVmFsdWUodG8uY29udGVudHMsIGtleSk7XG5cdFx0XHRcdGlmICghb2JqZWN0cy5lcXVhbHModmFsdWUxLCB2YWx1ZTIpKSB7XG5cdFx0XHRcdFx0dXBkYXRlZC5wdXNoKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHsgYWRkZWQsIHJlbW92ZWQsIHVwZGF0ZWQgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUV4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixZQUFZLFVBQVU7QUFDdEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxVQUFVLG1CQUFtQjtBQUN0QyxZQUFZLGFBQWE7QUFFekIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxnQkFBcUMsdUJBQXNQLHFCQUFxQixvQkFBb0I7QUFDN1UsU0FBUyxvQkFBb0IsWUFBa0UsNEJBQTRCLCtCQUF1RTtBQUNsTSxTQUFTLHFCQUFtQztBQUU1QyxTQUFTLGdCQUFnQjtBQUd6QixTQUFTLE9BQVUsTUFBWTtBQUM5QixTQUFPLE9BQU8sU0FBUyxJQUFJLElBQUksT0FBTyxRQUFRLFdBQVcs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
