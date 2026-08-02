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
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { deepClone, equals } from "../../../base/common/objects.js";
import { isEmptyObject, isString } from "../../../base/common/types.js";
import { ConfigurationModel } from "./configurationModels.js";
import { Extensions } from "./configurationRegistry.js";
import { ILogService, NullLogService } from "../../log/common/log.js";
import { IPolicyService } from "../../policy/common/policy.js";
import { Registry } from "../../registry/common/platform.js";
import { getErrorMessage } from "../../../base/common/errors.js";
import * as json from "../../../base/common/json.js";
class DefaultConfiguration extends Disposable {
  constructor(logService) {
    super();
    this.logService = logService;
    this._onDidChangeConfiguration = this._register(new Emitter());
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this._configurationModel = ConfigurationModel.createEmptyModel(logService);
  }
  get configurationModel() {
    return this._configurationModel;
  }
  async initialize() {
    this.resetConfigurationModel();
    this._register(Registry.as(Extensions.Configuration).onDidUpdateConfiguration(({ properties, defaultsOverrides }) => this.onDidUpdateConfiguration(Array.from(properties), defaultsOverrides)));
    return this.configurationModel;
  }
  reload() {
    this.resetConfigurationModel();
    return this.configurationModel;
  }
  onDidUpdateConfiguration(properties, defaultsOverrides) {
    this.updateConfigurationModel(properties, Registry.as(Extensions.Configuration).getConfigurationProperties());
    this._onDidChangeConfiguration.fire({ defaults: this.configurationModel, properties });
  }
  getConfigurationDefaultOverrides() {
    return {};
  }
  resetConfigurationModel() {
    this._configurationModel = ConfigurationModel.createEmptyModel(this.logService);
    const properties = Registry.as(Extensions.Configuration).getConfigurationProperties();
    this.updateConfigurationModel(Object.keys(properties), properties);
  }
  updateConfigurationModel(properties, configurationProperties) {
    const configurationDefaultsOverrides = this.getConfigurationDefaultOverrides();
    for (const key of properties) {
      const defaultOverrideValue = configurationDefaultsOverrides[key];
      const propertySchema = configurationProperties[key];
      if (defaultOverrideValue !== void 0) {
        this._configurationModel.setValue(key, defaultOverrideValue);
      } else if (propertySchema) {
        this._configurationModel.setValue(key, this.getDefaultValue(key, propertySchema));
      } else {
        this._configurationModel.removeValue(key);
      }
    }
  }
  getDefaultValue(_key, propertySchema) {
    return deepClone(propertySchema.default);
  }
}
class NullPolicyConfiguration {
  constructor() {
    this.onDidChangeConfiguration = Event.None;
    this.configurationModel = ConfigurationModel.createEmptyModel(new NullLogService());
  }
  async initialize() {
    return this.configurationModel;
  }
}
let PolicyConfiguration = class extends Disposable {
  constructor(defaultConfiguration, policyService, logService) {
    super();
    this.defaultConfiguration = defaultConfiguration;
    this.policyService = policyService;
    this.logService = logService;
    this._onDidChangeConfiguration = this._register(new Emitter());
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    /** Last definition submitted per policy name; avoids redundant re-registration. */
    this._submittedPolicyDefinitions = /* @__PURE__ */ new Map();
    /** Maps each policy-controlled setting key to its policy name, so removed keys can be re-resolved. */
    this._policyNameByKey = /* @__PURE__ */ new Map();
    this._configurationModel = ConfigurationModel.createEmptyModel(this.logService);
    this.configurationRegistry = Registry.as(Extensions.Configuration);
  }
  get configurationModel() {
    return this._configurationModel;
  }
  async initialize() {
    this.logService.trace("PolicyConfiguration#initialize");
    this.update(await this.updatePolicyDefinitions(this.defaultConfiguration.configurationModel.keys), false);
    this.update(await this.updatePolicyDefinitions(Object.keys(this.configurationRegistry.getExcludedConfigurationProperties())), false);
    this._register(this.policyService.onDidChange((policyNames) => this.onDidChangePolicies(policyNames)));
    this._register(this.defaultConfiguration.onDidChangeConfiguration(async ({ properties }) => this.update(await this.updatePolicyDefinitions(properties), true)));
    return this._configurationModel;
  }
  toPolicyDefinitionType(configType, policyName) {
    const configTypes = Array.isArray(configType) ? configType : [configType];
    const supportedTypes = configTypes.filter((type) => type === "string" || type === "number" || type === "array" || type === "object" || type === "boolean");
    if (supportedTypes.length === 0) {
      this.logService.warn(`PolicyConfiguration#updatePolicyDefinitions - policy '${policyName}' has unsupported type '${configType}'`);
      return void 0;
    }
    return supportedTypes.includes("number") ? "number" : supportedTypes.includes("boolean") ? "boolean" : "string";
  }
  async updatePolicyDefinitions(properties) {
    this.logService.trace("PolicyConfiguration#updatePolicyDefinitions", properties);
    const keys = [];
    const policyNames = /* @__PURE__ */ new Set();
    const configurationProperties = this.configurationRegistry.getConfigurationProperties();
    const excludedConfigurationProperties = this.configurationRegistry.getExcludedConfigurationProperties();
    for (const key of properties) {
      const config = configurationProperties[key] ?? excludedConfigurationProperties[key];
      if (!config) {
        keys.push(key);
        const removedPolicyName = this._policyNameByKey.get(key);
        if (removedPolicyName !== void 0) {
          this._policyNameByKey.delete(key);
          policyNames.add(removedPolicyName);
        }
        continue;
      }
      const policyName = config.policy?.name ?? config.policyReference?.name;
      if (policyName) {
        keys.push(key);
        policyNames.add(policyName);
        this._policyNameByKey.set(key, policyName);
      }
    }
    const changedDefinitions = {};
    for (const policyName of policyNames) {
      const definition = this.resolvePolicyDefinition(policyName);
      if (definition && !this.isSamePolicyDefinition(this._submittedPolicyDefinitions.get(policyName), definition)) {
        this._submittedPolicyDefinitions.set(policyName, definition);
        changedDefinitions[policyName] = definition;
      }
    }
    if (!isEmptyObject(changedDefinitions)) {
      await this.policyService.updatePolicyDefinitions(changedDefinitions);
    }
    return keys;
  }
  isSamePolicyDefinition(a, b) {
    return !!a && a.type === b.type && a.value === b.value && a.managedSettings === b.managedSettings && a.restrictedValue === b.restrictedValue;
  }
  /** Resolve the authoritative definition: owner wins; references provide a bare type fallback. */
  resolvePolicyDefinition(policyName) {
    const configurationProperties = this.configurationRegistry.getConfigurationProperties();
    const excludedConfigurationProperties = this.configurationRegistry.getExcludedConfigurationProperties();
    const ownerKey = this.configurationRegistry.getPolicyConfigurations().get(policyName);
    if (ownerKey !== void 0) {
      const config = configurationProperties[ownerKey] ?? excludedConfigurationProperties[ownerKey];
      if (config?.policy) {
        const type = this.toPolicyDefinitionType(config.type, policyName);
        const { value, managedSettings, restrictedValue } = config.policy;
        return type ? { type, value, managedSettings, restrictedValue } : void 0;
      }
    }
    const referenceKeys = this.configurationRegistry.getPolicyReferenceConfigurations().get(policyName);
    for (const referenceKey of referenceKeys ?? []) {
      const config = configurationProperties[referenceKey] ?? excludedConfigurationProperties[referenceKey];
      if (config?.policyReference) {
        const type = this.toPolicyDefinitionType(config.type, policyName);
        return type ? { type } : void 0;
      }
    }
    return void 0;
  }
  onDidChangePolicies(policyNames) {
    this.logService.trace("PolicyConfiguration#onDidChangePolicies", policyNames);
    const policyConfigurations = this.configurationRegistry.getPolicyConfigurations();
    const policyReferenceConfigurations = this.configurationRegistry.getPolicyReferenceConfigurations();
    const keys = [];
    for (const policyName of policyNames) {
      const owner = policyConfigurations.get(policyName);
      if (owner) {
        keys.push(owner);
      }
      const references = policyReferenceConfigurations.get(policyName);
      if (references) {
        keys.push(...references);
      }
    }
    this.update(keys, true);
  }
  update(keys, trigger) {
    this.logService.trace("PolicyConfiguration#update", keys);
    const configurationProperties = this.configurationRegistry.getConfigurationProperties();
    const excludedConfigurationProperties = this.configurationRegistry.getExcludedConfigurationProperties();
    const changed = [];
    const wasEmpty = this._configurationModel.isEmpty();
    for (const key of keys) {
      const property = configurationProperties[key] ?? excludedConfigurationProperties[key];
      const policyName = property?.policy?.name ?? property?.policyReference?.name;
      if (policyName) {
        let policyValue = this.policyService.getPolicyValue(policyName);
        const acceptsStringType = Array.isArray(property.type) ? property.type.includes("string") : property.type === "string";
        if (isString(policyValue) && !acceptsStringType) {
          try {
            policyValue = this.parse(policyValue);
          } catch (e) {
            this.logService.error(`Error parsing policy value ${policyName}:`, getErrorMessage(e));
            continue;
          }
        }
        if (wasEmpty ? policyValue !== void 0 : !equals(this._configurationModel.getValue(key), policyValue)) {
          changed.push([key, policyValue]);
        }
      } else {
        if (this._configurationModel.getValue(key) !== void 0) {
          changed.push([key, void 0]);
        }
      }
    }
    if (changed.length) {
      this.logService.trace("PolicyConfiguration#changed", changed);
      const old = this._configurationModel;
      this._configurationModel = ConfigurationModel.createEmptyModel(this.logService);
      for (const key of old.keys) {
        this._configurationModel.setValue(key, old.getValue(key));
      }
      for (const [key, policyValue] of changed) {
        if (policyValue === void 0) {
          this._configurationModel.removeValue(key);
        } else {
          this._configurationModel.setValue(key, policyValue);
        }
      }
      if (trigger) {
        this._onDidChangeConfiguration.fire(this._configurationModel);
      }
    }
  }
  parse(content) {
    let raw = {};
    let currentProperty = null;
    let currentParent = [];
    const previousParents = [];
    const parseErrors = [];
    function onValue(value) {
      if (Array.isArray(currentParent)) {
        currentParent.push(value);
      } else if (currentProperty !== null) {
        if (currentParent[currentProperty] !== void 0) {
          throw new Error(`Duplicate property found: ${currentProperty}`);
        }
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
      json.visit(content, visitor);
      raw = currentParent[0] || raw;
    }
    if (parseErrors.length > 0) {
      throw new Error(parseErrors.map((e) => getErrorMessage(e.error)).join("\n"));
    }
    return raw;
  }
};
PolicyConfiguration = __decorateClass([
  __decorateParam(1, IPolicyService),
  __decorateParam(2, ILogService)
], PolicyConfiguration);
export {
  DefaultConfiguration,
  NullPolicyConfiguration,
  PolicyConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGVlcENsb25lLCBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGlzRW1wdHlPYmplY3QsIGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbk1vZGVsIH0gZnJvbSAnLi9jb25maWd1cmF0aW9uTW9kZWxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnksIElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIH0gZnJvbSAnLi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVBvbGljeVNlcnZpY2UsIFBvbGljeURlZmluaXRpb24sIFBvbGljeVZhbHVlIH0gZnJvbSAnLi4vLi4vcG9saWN5L2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCAqIGFzIGpzb24gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBQb2xpY3lOYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcblxuZXhwb3J0IGNsYXNzIERlZmF1bHRDb25maWd1cmF0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBkZWZhdWx0czogQ29uZmlndXJhdGlvbk1vZGVsOyBwcm9wZXJ0aWVzOiBzdHJpbmdbXSB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgX2NvbmZpZ3VyYXRpb25Nb2RlbDogQ29uZmlndXJhdGlvbk1vZGVsO1xuXHRnZXQgY29uZmlndXJhdGlvbk1vZGVsKCk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25Nb2RlbDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25Nb2RlbCA9IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpO1xuXHR9XG5cblx0YXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbD4ge1xuXHRcdHRoaXMucmVzZXRDb25maWd1cmF0aW9uTW9kZWwoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLm9uRGlkVXBkYXRlQ29uZmlndXJhdGlvbigoeyBwcm9wZXJ0aWVzLCBkZWZhdWx0c092ZXJyaWRlcyB9KSA9PiB0aGlzLm9uRGlkVXBkYXRlQ29uZmlndXJhdGlvbihBcnJheS5mcm9tKHByb3BlcnRpZXMpLCBkZWZhdWx0c092ZXJyaWRlcykpKTtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uTW9kZWw7XG5cdH1cblxuXHRyZWxvYWQoKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHR0aGlzLnJlc2V0Q29uZmlndXJhdGlvbk1vZGVsKCk7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvbk1vZGVsO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9uRGlkVXBkYXRlQ29uZmlndXJhdGlvbihwcm9wZXJ0aWVzOiBzdHJpbmdbXSwgZGVmYXVsdHNPdmVycmlkZXM/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVDb25maWd1cmF0aW9uTW9kZWwocHJvcGVydGllcywgUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZmlyZSh7IGRlZmF1bHRzOiB0aGlzLmNvbmZpZ3VyYXRpb25Nb2RlbCwgcHJvcGVydGllcyB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRDb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlcygpOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0cHJpdmF0ZSByZXNldENvbmZpZ3VyYXRpb25Nb2RlbCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uTW9kZWwgPSBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbCh0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHByb3BlcnRpZXMgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdFx0dGhpcy51cGRhdGVDb25maWd1cmF0aW9uTW9kZWwoT2JqZWN0LmtleXMocHJvcGVydGllcyksIHByb3BlcnRpZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb25maWd1cmF0aW9uTW9kZWwocHJvcGVydGllczogc3RyaW5nW10sIGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzOiBJU3RyaW5nRGljdGlvbmFyeTxJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4pOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMgPSB0aGlzLmdldENvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzKCk7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgcHJvcGVydGllcykge1xuXHRcdFx0Y29uc3QgZGVmYXVsdE92ZXJyaWRlVmFsdWUgPSBjb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXNba2V5XTtcblx0XHRcdGNvbnN0IHByb3BlcnR5U2NoZW1hID0gY29uZmlndXJhdGlvblByb3BlcnRpZXNba2V5XTtcblx0XHRcdGlmIChkZWZhdWx0T3ZlcnJpZGVWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25Nb2RlbC5zZXRWYWx1ZShrZXksIGRlZmF1bHRPdmVycmlkZVZhbHVlKTtcblx0XHRcdH0gZWxzZSBpZiAocHJvcGVydHlTY2hlbWEpIHtcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbk1vZGVsLnNldFZhbHVlKGtleSwgdGhpcy5nZXREZWZhdWx0VmFsdWUoa2V5LCBwcm9wZXJ0eVNjaGVtYSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbk1vZGVsLnJlbW92ZVZhbHVlKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGdldERlZmF1bHRWYWx1ZShfa2V5OiBzdHJpbmcsIHByb3BlcnR5U2NoZW1hOiBJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSk6IHVua25vd24ge1xuXHRcdHJldHVybiBkZWVwQ2xvbmUocHJvcGVydHlTY2hlbWEuZGVmYXVsdCk7XG5cdH1cblxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQb2xpY3lDb25maWd1cmF0aW9uIHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uOiBFdmVudDxDb25maWd1cmF0aW9uTW9kZWw+O1xuXHRyZWFkb25seSBjb25maWd1cmF0aW9uTW9kZWw6IENvbmZpZ3VyYXRpb25Nb2RlbDtcblx0aW5pdGlhbGl6ZSgpOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbD47XG59XG5cbmV4cG9ydCBjbGFzcyBOdWxsUG9saWN5Q29uZmlndXJhdGlvbiBpbXBsZW1lbnRzIElQb2xpY3lDb25maWd1cmF0aW9uIHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgY29uZmlndXJhdGlvbk1vZGVsID0gQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRhc3luYyBpbml0aWFsaXplKCkgeyByZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uTW9kZWw7IH1cbn1cblxudHlwZSBQYXJzZWRUeXBlID0gSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCBBcnJheTx1bmtub3duPjtcblxuZXhwb3J0IGNsYXNzIFBvbGljeUNvbmZpZ3VyYXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVBvbGljeUNvbmZpZ3VyYXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPENvbmZpZ3VyYXRpb25Nb2RlbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25SZWdpc3RyeTogSUNvbmZpZ3VyYXRpb25SZWdpc3RyeTtcblxuXHRwcml2YXRlIF9jb25maWd1cmF0aW9uTW9kZWw6IENvbmZpZ3VyYXRpb25Nb2RlbDtcblx0Z2V0IGNvbmZpZ3VyYXRpb25Nb2RlbCgpIHsgcmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25Nb2RlbDsgfVxuXG5cdC8qKiBMYXN0IGRlZmluaXRpb24gc3VibWl0dGVkIHBlciBwb2xpY3kgbmFtZTsgYXZvaWRzIHJlZHVuZGFudCByZS1yZWdpc3RyYXRpb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1Ym1pdHRlZFBvbGljeURlZmluaXRpb25zID0gbmV3IE1hcDxQb2xpY3lOYW1lLCBQb2xpY3lEZWZpbml0aW9uPigpO1xuXG5cdC8qKiBNYXBzIGVhY2ggcG9saWN5LWNvbnRyb2xsZWQgc2V0dGluZyBrZXkgdG8gaXRzIHBvbGljeSBuYW1lLCBzbyByZW1vdmVkIGtleXMgY2FuIGJlIHJlLXJlc29sdmVkLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wb2xpY3lOYW1lQnlLZXkgPSBuZXcgTWFwPHN0cmluZywgUG9saWN5TmFtZT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRDb25maWd1cmF0aW9uOiBEZWZhdWx0Q29uZmlndXJhdGlvbixcblx0XHRASVBvbGljeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwb2xpY3lTZXJ2aWNlOiBJUG9saWN5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25Nb2RlbCA9IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKHRoaXMubG9nU2VydmljZSk7XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHR9XG5cblx0YXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnUG9saWN5Q29uZmlndXJhdGlvbiNpbml0aWFsaXplJyk7XG5cblx0XHR0aGlzLnVwZGF0ZShhd2FpdCB0aGlzLnVwZGF0ZVBvbGljeURlZmluaXRpb25zKHRoaXMuZGVmYXVsdENvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLmtleXMpLCBmYWxzZSk7XG5cdFx0dGhpcy51cGRhdGUoYXdhaXQgdGhpcy51cGRhdGVQb2xpY3lEZWZpbml0aW9ucyhPYmplY3Qua2V5cyh0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRFeGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCkpKSwgZmFsc2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucG9saWN5U2VydmljZS5vbkRpZENoYW5nZShwb2xpY3lOYW1lcyA9PiB0aGlzLm9uRGlkQ2hhbmdlUG9saWNpZXMocG9saWN5TmFtZXMpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWZhdWx0Q29uZmlndXJhdGlvbi5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oYXN5bmMgKHsgcHJvcGVydGllcyB9KSA9PiB0aGlzLnVwZGF0ZShhd2FpdCB0aGlzLnVwZGF0ZVBvbGljeURlZmluaXRpb25zKHByb3BlcnRpZXMpLCB0cnVlKSkpO1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uTW9kZWw7XG5cdH1cblxuXHRwcml2YXRlIHRvUG9saWN5RGVmaW5pdGlvblR5cGUoY29uZmlnVHlwZTogdW5rbm93biwgcG9saWN5TmFtZTogUG9saWN5TmFtZSk6ICdzdHJpbmcnIHwgJ251bWJlcicgfCAnYm9vbGVhbicgfCB1bmRlZmluZWQge1xuXHRcdC8vIGBjb25maWdUeXBlYCBtYXkgYmUgYSBzaW5nbGUgdHlwZSBvciBhIHVuaW9uIChlLmcuIGBbJ2FycmF5JywgJ251bGwnXWApLlxuXHRcdC8vIE5vcm1hbGl6ZSB0byBhbiBhcnJheSBhbmQga2VlcCBvbmx5IHRoZSB0eXBlcyB3ZSBjYW4gcmVwcmVzZW50IGFzIHBvbGljaWVzLlxuXHRcdGNvbnN0IGNvbmZpZ1R5cGVzID0gQXJyYXkuaXNBcnJheShjb25maWdUeXBlKSA/IGNvbmZpZ1R5cGUgOiBbY29uZmlnVHlwZV07XG5cdFx0Y29uc3Qgc3VwcG9ydGVkVHlwZXMgPSBjb25maWdUeXBlcy5maWx0ZXIodHlwZSA9PiB0eXBlID09PSAnc3RyaW5nJyB8fCB0eXBlID09PSAnbnVtYmVyJyB8fCB0eXBlID09PSAnYXJyYXknIHx8IHR5cGUgPT09ICdvYmplY3QnIHx8IHR5cGUgPT09ICdib29sZWFuJyk7XG5cdFx0aWYgKHN1cHBvcnRlZFR5cGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFBvbGljeUNvbmZpZ3VyYXRpb24jdXBkYXRlUG9saWN5RGVmaW5pdGlvbnMgLSBwb2xpY3kgJyR7cG9saWN5TmFtZX0nIGhhcyB1bnN1cHBvcnRlZCB0eXBlICcke2NvbmZpZ1R5cGV9J2ApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cHBvcnRlZFR5cGVzLmluY2x1ZGVzKCdudW1iZXInKSA/ICdudW1iZXInIDogc3VwcG9ydGVkVHlwZXMuaW5jbHVkZXMoJ2Jvb2xlYW4nKSA/ICdib29sZWFuJyA6ICdzdHJpbmcnO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVQb2xpY3lEZWZpbml0aW9ucyhwcm9wZXJ0aWVzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1BvbGljeUNvbmZpZ3VyYXRpb24jdXBkYXRlUG9saWN5RGVmaW5pdGlvbnMnLCBwcm9wZXJ0aWVzKTtcblx0XHRjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHBvbGljeU5hbWVzID0gbmV3IFNldDxQb2xpY3lOYW1lPigpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRjb25zdCBleGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0RXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgcHJvcGVydGllcykge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gY29uZmlndXJhdGlvblByb3BlcnRpZXNba2V5XSA/PyBleGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRpZiAoIWNvbmZpZykge1xuXHRcdFx0XHRrZXlzLnB1c2goa2V5KTsgLy8gZGVyZWdpc3RlcmVkIFx1MjAxNCB1cGRhdGUoKSB3aWxsIGNsZWFyIHRoaXMga2V5J3MgYXBwbGllZCBwb2xpY3kgdmFsdWVcblx0XHRcdFx0Y29uc3QgcmVtb3ZlZFBvbGljeU5hbWUgPSB0aGlzLl9wb2xpY3lOYW1lQnlLZXkuZ2V0KGtleSk7XG5cdFx0XHRcdGlmIChyZW1vdmVkUG9saWN5TmFtZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fcG9saWN5TmFtZUJ5S2V5LmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRcdHBvbGljeU5hbWVzLmFkZChyZW1vdmVkUG9saWN5TmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwb2xpY3lOYW1lID0gY29uZmlnLnBvbGljeT8ubmFtZSA/PyBjb25maWcucG9saWN5UmVmZXJlbmNlPy5uYW1lO1xuXHRcdFx0aWYgKHBvbGljeU5hbWUpIHtcblx0XHRcdFx0a2V5cy5wdXNoKGtleSk7XG5cdFx0XHRcdHBvbGljeU5hbWVzLmFkZChwb2xpY3lOYW1lKTtcblx0XHRcdFx0dGhpcy5fcG9saWN5TmFtZUJ5S2V5LnNldChrZXksIHBvbGljeU5hbWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNoYW5nZWREZWZpbml0aW9uczogSVN0cmluZ0RpY3Rpb25hcnk8UG9saWN5RGVmaW5pdGlvbj4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IHBvbGljeU5hbWUgb2YgcG9saWN5TmFtZXMpIHtcblx0XHRcdGNvbnN0IGRlZmluaXRpb24gPSB0aGlzLnJlc29sdmVQb2xpY3lEZWZpbml0aW9uKHBvbGljeU5hbWUpO1xuXHRcdFx0aWYgKGRlZmluaXRpb24gJiYgIXRoaXMuaXNTYW1lUG9saWN5RGVmaW5pdGlvbih0aGlzLl9zdWJtaXR0ZWRQb2xpY3lEZWZpbml0aW9ucy5nZXQocG9saWN5TmFtZSksIGRlZmluaXRpb24pKSB7XG5cdFx0XHRcdHRoaXMuX3N1Ym1pdHRlZFBvbGljeURlZmluaXRpb25zLnNldChwb2xpY3lOYW1lLCBkZWZpbml0aW9uKTtcblx0XHRcdFx0Y2hhbmdlZERlZmluaXRpb25zW3BvbGljeU5hbWVdID0gZGVmaW5pdGlvbjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWlzRW1wdHlPYmplY3QoY2hhbmdlZERlZmluaXRpb25zKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5wb2xpY3lTZXJ2aWNlLnVwZGF0ZVBvbGljeURlZmluaXRpb25zKGNoYW5nZWREZWZpbml0aW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGtleXM7XG5cdH1cblxuXHRwcml2YXRlIGlzU2FtZVBvbGljeURlZmluaXRpb24oYTogUG9saWN5RGVmaW5pdGlvbiB8IHVuZGVmaW5lZCwgYjogUG9saWN5RGVmaW5pdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIWEgJiYgYS50eXBlID09PSBiLnR5cGUgJiYgYS52YWx1ZSA9PT0gYi52YWx1ZSAmJiBhLm1hbmFnZWRTZXR0aW5ncyA9PT0gYi5tYW5hZ2VkU2V0dGluZ3MgJiYgYS5yZXN0cmljdGVkVmFsdWUgPT09IGIucmVzdHJpY3RlZFZhbHVlO1xuXHR9XG5cblx0LyoqIFJlc29sdmUgdGhlIGF1dGhvcml0YXRpdmUgZGVmaW5pdGlvbjogb3duZXIgd2luczsgcmVmZXJlbmNlcyBwcm92aWRlIGEgYmFyZSB0eXBlIGZhbGxiYWNrLiAqL1xuXHRwcml2YXRlIHJlc29sdmVQb2xpY3lEZWZpbml0aW9uKHBvbGljeU5hbWU6IFBvbGljeU5hbWUpOiBQb2xpY3lEZWZpbml0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUHJvcGVydGllcyA9IHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdFx0Y29uc3QgZXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllcyA9IHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldEV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblxuXHRcdGNvbnN0IG93bmVyS2V5ID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0UG9saWN5Q29uZmlndXJhdGlvbnMoKS5nZXQocG9saWN5TmFtZSk7XG5cdFx0aWYgKG93bmVyS2V5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW293bmVyS2V5XSA/PyBleGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW293bmVyS2V5XTtcblx0XHRcdGlmIChjb25maWc/LnBvbGljeSkge1xuXHRcdFx0XHRjb25zdCB0eXBlID0gdGhpcy50b1BvbGljeURlZmluaXRpb25UeXBlKGNvbmZpZy50eXBlLCBwb2xpY3lOYW1lKTtcblx0XHRcdFx0Y29uc3QgeyB2YWx1ZSwgbWFuYWdlZFNldHRpbmdzLCByZXN0cmljdGVkVmFsdWUgfSA9IGNvbmZpZy5wb2xpY3k7XG5cdFx0XHRcdHJldHVybiB0eXBlID8geyB0eXBlLCB2YWx1ZSwgbWFuYWdlZFNldHRpbmdzLCByZXN0cmljdGVkVmFsdWUgfSA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZWZlcmVuY2VLZXlzID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0UG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMoKS5nZXQocG9saWN5TmFtZSk7XG5cdFx0Zm9yIChjb25zdCByZWZlcmVuY2VLZXkgb2YgcmVmZXJlbmNlS2V5cyA/PyBbXSkge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gY29uZmlndXJhdGlvblByb3BlcnRpZXNbcmVmZXJlbmNlS2V5XSA/PyBleGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW3JlZmVyZW5jZUtleV07XG5cdFx0XHRpZiAoY29uZmlnPy5wb2xpY3lSZWZlcmVuY2UpIHtcblx0XHRcdFx0Y29uc3QgdHlwZSA9IHRoaXMudG9Qb2xpY3lEZWZpbml0aW9uVHlwZShjb25maWcudHlwZSwgcG9saWN5TmFtZSk7XG5cdFx0XHRcdHJldHVybiB0eXBlID8geyB0eXBlIH0gOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VQb2xpY2llcyhwb2xpY3lOYW1lczogcmVhZG9ubHkgUG9saWN5TmFtZVtdKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdQb2xpY3lDb25maWd1cmF0aW9uI29uRGlkQ2hhbmdlUG9saWNpZXMnLCBwb2xpY3lOYW1lcyk7XG5cdFx0Y29uc3QgcG9saWN5Q29uZmlndXJhdGlvbnMgPSB0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRQb2xpY3lDb25maWd1cmF0aW9ucygpO1xuXHRcdGNvbnN0IHBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb25zID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0UG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMoKTtcblx0XHRjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcG9saWN5TmFtZSBvZiBwb2xpY3lOYW1lcykge1xuXHRcdFx0Y29uc3Qgb3duZXIgPSBwb2xpY3lDb25maWd1cmF0aW9ucy5nZXQocG9saWN5TmFtZSk7XG5cdFx0XHRpZiAob3duZXIpIHtcblx0XHRcdFx0a2V5cy5wdXNoKG93bmVyKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlZmVyZW5jZXMgPSBwb2xpY3lSZWZlcmVuY2VDb25maWd1cmF0aW9ucy5nZXQocG9saWN5TmFtZSk7XG5cdFx0XHRpZiAocmVmZXJlbmNlcykge1xuXHRcdFx0XHRrZXlzLnB1c2goLi4ucmVmZXJlbmNlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlKGtleXMsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGUoa2V5czogc3RyaW5nW10sIHRyaWdnZXI6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1BvbGljeUNvbmZpZ3VyYXRpb24jdXBkYXRlJywga2V5cyk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblByb3BlcnRpZXMgPSB0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdGNvbnN0IGV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXMgPSB0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRFeGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdFx0Y29uc3QgY2hhbmdlZDogW3N0cmluZywgdW5rbm93bl1bXSA9IFtdO1xuXHRcdGNvbnN0IHdhc0VtcHR5ID0gdGhpcy5fY29uZmlndXJhdGlvbk1vZGVsLmlzRW1wdHkoKTtcblxuXHRcdGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcblx0XHRcdGNvbnN0IHByb3BlcnR5ID0gY29uZmlndXJhdGlvblByb3BlcnRpZXNba2V5XSA/PyBleGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRjb25zdCBwb2xpY3lOYW1lID0gcHJvcGVydHk/LnBvbGljeT8ubmFtZSA/PyBwcm9wZXJ0eT8ucG9saWN5UmVmZXJlbmNlPy5uYW1lO1xuXHRcdFx0aWYgKHBvbGljeU5hbWUpIHtcblx0XHRcdFx0bGV0IHBvbGljeVZhbHVlOiBQb2xpY3lWYWx1ZSB8IFBhcnNlZFR5cGUgfCB1bmRlZmluZWQgPSB0aGlzLnBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUocG9saWN5TmFtZSk7XG5cdFx0XHRcdC8vIGBwcm9wZXJ0eS50eXBlYCBtYXkgYmUgYSBzaW5nbGUgdHlwZSBvciBhIHVuaW9uIChlLmcuIGBbJ2FycmF5JywgJ251bGwnXWApLlxuXHRcdFx0XHQvLyBBIHN0cmluZyBwb2xpY3kgdmFsdWUgY2FycmllcyBhIEpTT04gcGF5bG9hZCB0aGF0IG11c3QgYmUgcGFyc2VkIHVubGVzcyB0aGVcblx0XHRcdFx0Ly8gc2V0dGluZyBpdHNlbGYgaXMgKG9yIGNhbiBiZSkgYSBwbGFpbiBzdHJpbmcuXG5cdFx0XHRcdGNvbnN0IGFjY2VwdHNTdHJpbmdUeXBlID0gQXJyYXkuaXNBcnJheShwcm9wZXJ0eS50eXBlKSA/IHByb3BlcnR5LnR5cGUuaW5jbHVkZXMoJ3N0cmluZycpIDogcHJvcGVydHkudHlwZSA9PT0gJ3N0cmluZyc7XG5cdFx0XHRcdGlmIChpc1N0cmluZyhwb2xpY3lWYWx1ZSkgJiYgIWFjY2VwdHNTdHJpbmdUeXBlKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHBvbGljeVZhbHVlID0gdGhpcy5wYXJzZShwb2xpY3lWYWx1ZSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciBwYXJzaW5nIHBvbGljeSB2YWx1ZSAke3BvbGljeU5hbWV9OmAsIGdldEVycm9yTWVzc2FnZShlKSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHdhc0VtcHR5ID8gcG9saWN5VmFsdWUgIT09IHVuZGVmaW5lZCA6ICFlcXVhbHModGhpcy5fY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKGtleSksIHBvbGljeVZhbHVlKSkge1xuXHRcdFx0XHRcdGNoYW5nZWQucHVzaChba2V5LCBwb2xpY3lWYWx1ZV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKGtleSkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNoYW5nZWQucHVzaChba2V5LCB1bmRlZmluZWRdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjaGFuZ2VkLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdQb2xpY3lDb25maWd1cmF0aW9uI2NoYW5nZWQnLCBjaGFuZ2VkKTtcblx0XHRcdGNvbnN0IG9sZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25Nb2RlbDtcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25Nb2RlbCA9IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKHRoaXMubG9nU2VydmljZSk7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBvbGQua2V5cykge1xuXHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uTW9kZWwuc2V0VmFsdWUoa2V5LCBvbGQuZ2V0VmFsdWUoa2V5KSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHBvbGljeVZhbHVlXSBvZiBjaGFuZ2VkKSB7XG5cdFx0XHRcdGlmIChwb2xpY3lWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbk1vZGVsLnJlbW92ZVZhbHVlKGtleSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbk1vZGVsLnNldFZhbHVlKGtleSwgcG9saWN5VmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAodHJpZ2dlcikge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZmlyZSh0aGlzLl9jb25maWd1cmF0aW9uTW9kZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcGFyc2UoY29udGVudDogc3RyaW5nKTogUGFyc2VkVHlwZSB7XG5cdFx0bGV0IHJhdzogUGFyc2VkVHlwZSA9IHt9O1xuXHRcdGxldCBjdXJyZW50UHJvcGVydHk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBjdXJyZW50UGFyZW50OiBQYXJzZWRUeXBlID0gW107XG5cdFx0Y29uc3QgcHJldmlvdXNQYXJlbnRzOiBBcnJheTxQYXJzZWRUeXBlPiA9IFtdO1xuXHRcdGNvbnN0IHBhcnNlRXJyb3JzOiBqc29uLlBhcnNlRXJyb3JbXSA9IFtdO1xuXG5cdFx0ZnVuY3Rpb24gb25WYWx1ZSh2YWx1ZTogdW5rbm93bikge1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoY3VycmVudFBhcmVudCkpIHtcblx0XHRcdFx0Y3VycmVudFBhcmVudC5wdXNoKHZhbHVlKTtcblx0XHRcdH0gZWxzZSBpZiAoY3VycmVudFByb3BlcnR5ICE9PSBudWxsKSB7XG5cdFx0XHRcdGlmIChjdXJyZW50UGFyZW50W2N1cnJlbnRQcm9wZXJ0eV0gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRHVwbGljYXRlIHByb3BlcnR5IGZvdW5kOiAke2N1cnJlbnRQcm9wZXJ0eX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjdXJyZW50UGFyZW50W2N1cnJlbnRQcm9wZXJ0eV0gPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB2aXNpdG9yOiBqc29uLkpTT05WaXNpdG9yID0ge1xuXHRcdFx0b25PYmplY3RCZWdpbjogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYmplY3QgPSB7fTtcblx0XHRcdFx0b25WYWx1ZShvYmplY3QpO1xuXHRcdFx0XHRwcmV2aW91c1BhcmVudHMucHVzaChjdXJyZW50UGFyZW50KTtcblx0XHRcdFx0Y3VycmVudFBhcmVudCA9IG9iamVjdDtcblx0XHRcdFx0Y3VycmVudFByb3BlcnR5ID0gbnVsbDtcblx0XHRcdH0sXG5cdFx0XHRvbk9iamVjdFByb3BlcnR5OiAobmFtZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGN1cnJlbnRQcm9wZXJ0eSA9IG5hbWU7XG5cdFx0XHR9LFxuXHRcdFx0b25PYmplY3RFbmQ6ICgpID0+IHtcblx0XHRcdFx0Y3VycmVudFBhcmVudCA9IHByZXZpb3VzUGFyZW50cy5wb3AoKSE7XG5cdFx0XHR9LFxuXHRcdFx0b25BcnJheUJlZ2luOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGFycmF5OiB1bmtub3duW10gPSBbXTtcblx0XHRcdFx0b25WYWx1ZShhcnJheSk7XG5cdFx0XHRcdHByZXZpb3VzUGFyZW50cy5wdXNoKGN1cnJlbnRQYXJlbnQpO1xuXHRcdFx0XHRjdXJyZW50UGFyZW50ID0gYXJyYXk7XG5cdFx0XHRcdGN1cnJlbnRQcm9wZXJ0eSA9IG51bGw7XG5cdFx0XHR9LFxuXHRcdFx0b25BcnJheUVuZDogKCkgPT4ge1xuXHRcdFx0XHRjdXJyZW50UGFyZW50ID0gcHJldmlvdXNQYXJlbnRzLnBvcCgpITtcblx0XHRcdH0sXG5cdFx0XHRvbkxpdGVyYWxWYWx1ZTogb25WYWx1ZSxcblx0XHRcdG9uRXJyb3I6IChlcnJvcjoganNvbi5QYXJzZUVycm9yQ29kZSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdHBhcnNlRXJyb3JzLnB1c2goeyBlcnJvciwgb2Zmc2V0LCBsZW5ndGggfSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRqc29uLnZpc2l0KGNvbnRlbnQsIHZpc2l0b3IpO1xuXHRcdFx0cmF3ID0gKGN1cnJlbnRQYXJlbnRbMF0gYXMgUGFyc2VkVHlwZSB8IHVuZGVmaW5lZCkgfHwgcmF3O1xuXHRcdH1cblxuXHRcdGlmIChwYXJzZUVycm9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IocGFyc2VFcnJvcnMubWFwKGUgPT4gZ2V0RXJyb3JNZXNzYWdlKGUuZXJyb3IpKS5qb2luKCdcXG4nKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJhdztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVcsY0FBYztBQUNsQyxTQUFTLGVBQWUsZ0JBQWdCO0FBQ3hDLFNBQVMsMEJB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
