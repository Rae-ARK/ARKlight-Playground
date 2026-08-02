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
import { mixin, deepClone } from "../../../base/common/objects.js";
import { Emitter } from "../../../base/common/event.js";
import { IExtHostWorkspace } from "./extHostWorkspace.js";
import { MainContext } from "./extHost.protocol.js";
import { ConfigurationTarget as ExtHostConfigurationTarget } from "./extHostTypes.js";
import { ConfigurationTarget } from "../../../platform/configuration/common/configuration.js";
import { Configuration, ConfigurationChangeEvent } from "../../../platform/configuration/common/configurationModels.js";
import { ConfigurationScope, OVERRIDE_PROPERTY_REGEX } from "../../../platform/configuration/common/configurationRegistry.js";
import { isObject } from "../../../base/common/types.js";
import { Barrier } from "../../../base/common/async.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { URI } from "../../../base/common/uri.js";
function lookUp(tree, key) {
  if (key) {
    const parts = key.split(".");
    let node = tree;
    for (let i = 0; node && i < parts.length; i++) {
      node = node[parts[i]];
    }
    return node;
  }
  return void 0;
}
function isUri(thing) {
  return thing instanceof URI;
}
function isResourceLanguage(thing) {
  return isObject(thing) && thing.uri instanceof URI && !!thing.languageId && typeof thing.languageId === "string";
}
function isLanguage(thing) {
  return isObject(thing) && !thing.uri && !!thing.languageId && typeof thing.languageId === "string";
}
function isWorkspaceFolder(thing) {
  return isObject(thing) && thing.uri instanceof URI && (!thing.name || typeof thing.name === "string") && (!thing.index || typeof thing.index === "number");
}
function scopeToOverrides(scope) {
  if (isUri(scope)) {
    return { resource: scope };
  }
  if (isResourceLanguage(scope)) {
    return { resource: scope.uri, overrideIdentifier: scope.languageId };
  }
  if (isLanguage(scope)) {
    return { overrideIdentifier: scope.languageId };
  }
  if (isWorkspaceFolder(scope)) {
    return { resource: scope.uri };
  }
  if (scope === null) {
    return { resource: null };
  }
  return void 0;
}
let ExtHostConfiguration = class {
  constructor(extHostRpc, extHostWorkspace, logService) {
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadConfiguration);
    this._extHostWorkspace = extHostWorkspace;
    this._logService = logService;
    this._barrier = new Barrier();
    this._actual = null;
  }
  getConfigProvider() {
    return this._barrier.wait().then((_) => this._actual);
  }
  $initializeConfiguration(data) {
    this._actual = new ExtHostConfigProvider(this._proxy, this._extHostWorkspace, data, this._logService);
    this._extHostWorkspace.$setConfigProvider(this._actual);
    this._barrier.open();
  }
  $acceptConfigurationChanged(data, change) {
    this.getConfigProvider().then((provider) => provider.$acceptConfigurationChanged(data, change));
  }
};
ExtHostConfiguration = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostWorkspace),
  __decorateParam(2, ILogService)
], ExtHostConfiguration);
class ExtHostConfigProvider {
  constructor(proxy, extHostWorkspace, data, logService) {
    this._onDidChangeConfiguration = new Emitter();
    this._proxy = proxy;
    this._logService = logService;
    this._extHostWorkspace = extHostWorkspace;
    this._configuration = Configuration.parse(data, logService);
    this._configurationScopes = this._toMap(data.configurationScopes);
  }
  get onDidChangeConfiguration() {
    return this._onDidChangeConfiguration && this._onDidChangeConfiguration.event;
  }
  $acceptConfigurationChanged(data, change) {
    const previous = { data: this._configuration.toData(), workspace: this._extHostWorkspace.workspace };
    this._configuration = Configuration.parse(data, this._logService);
    this._configurationScopes = this._toMap(data.configurationScopes);
    this._onDidChangeConfiguration.fire(this._toConfigurationChangeEvent(change, previous));
  }
  getConfiguration(section, scope, extensionDescription) {
    const overrides = scopeToOverrides(scope) || {};
    const config = this._toReadonlyValue(this._configuration.getValue(section, overrides, this._extHostWorkspace.workspace));
    if (section) {
      this._validateConfigurationAccess(section, overrides, extensionDescription?.identifier);
    }
    function parseConfigurationTarget(arg) {
      if (arg === void 0 || arg === null) {
        return null;
      }
      if (typeof arg === "boolean") {
        return arg ? ConfigurationTarget.USER : ConfigurationTarget.WORKSPACE;
      }
      switch (arg) {
        case ExtHostConfigurationTarget.Global:
          return ConfigurationTarget.USER;
        case ExtHostConfigurationTarget.Workspace:
          return ConfigurationTarget.WORKSPACE;
        case ExtHostConfigurationTarget.WorkspaceFolder:
          return ConfigurationTarget.WORKSPACE_FOLDER;
      }
    }
    const result = {
      has(key) {
        return typeof lookUp(config, key) !== "undefined";
      },
      get: (key, defaultValue) => {
        this._validateConfigurationAccess(section ? `${section}.${key}` : key, overrides, extensionDescription?.identifier);
        let result2 = lookUp(config, key);
        if (typeof result2 === "undefined") {
          result2 = defaultValue;
        } else {
          let clonedConfig = void 0;
          const cloneOnWriteProxy = (target, accessor) => {
            if (isObject(target)) {
              let clonedTarget = void 0;
              const cloneTarget = () => {
                clonedConfig = clonedConfig ? clonedConfig : deepClone(config);
                clonedTarget = clonedTarget ? clonedTarget : lookUp(clonedConfig, accessor);
              };
              return new Proxy(target, {
                get: (target2, property) => {
                  if (typeof property === "string" && property.toLowerCase() === "tojson") {
                    cloneTarget();
                    return () => clonedTarget;
                  }
                  if (clonedConfig) {
                    clonedTarget = clonedTarget ? clonedTarget : lookUp(clonedConfig, accessor);
                    return clonedTarget[property];
                  }
                  const result3 = target2[property];
                  if (typeof property === "string") {
                    return cloneOnWriteProxy(result3, `${accessor}.${property}`);
                  }
                  return result3;
                },
                set: (_target, property, value) => {
                  cloneTarget();
                  if (clonedTarget) {
                    clonedTarget[property] = value;
                  }
                  return true;
                },
                deleteProperty: (_target, property) => {
                  cloneTarget();
                  if (clonedTarget) {
                    delete clonedTarget[property];
                  }
                  return true;
                },
                defineProperty: (_target, property, descriptor) => {
                  cloneTarget();
                  if (clonedTarget) {
                    Object.defineProperty(clonedTarget, property, descriptor);
                  }
                  return true;
                }
              });
            }
            if (Array.isArray(target)) {
              return deepClone(target);
            }
            return target;
          };
          result2 = cloneOnWriteProxy(result2, key);
        }
        return result2;
      },
      update: (key, value, extHostConfigurationTarget, scopeToLanguage) => {
        key = section ? `${section}.${key}` : key;
        const target = parseConfigurationTarget(extHostConfigurationTarget);
        if (value !== void 0) {
          return this._proxy.$updateConfigurationOption(target, key, value, overrides, scopeToLanguage);
        } else {
          return this._proxy.$removeConfigurationOption(target, key, overrides, scopeToLanguage);
        }
      },
      inspect: (key) => {
        key = section ? `${section}.${key}` : key;
        const config2 = this._configuration.inspect(key, overrides, this._extHostWorkspace.workspace);
        if (config2) {
          return {
            key,
            defaultValue: deepClone(config2.policy?.value ?? config2.default?.value),
            globalLocalValue: deepClone(config2.userLocal?.value),
            globalRemoteValue: deepClone(config2.userRemote?.value),
            globalValue: deepClone(config2.user?.value ?? config2.application?.value),
            workspaceValue: deepClone(config2.workspace?.value),
            workspaceFolderValue: deepClone(config2.workspaceFolder?.value),
            defaultLanguageValue: deepClone(config2.default?.override),
            globalLocalLanguageValue: deepClone(config2.userLocal?.override),
            globalRemoteLanguageValue: deepClone(config2.userRemote?.override),
            globalLanguageValue: deepClone(config2.user?.override ?? config2.application?.override),
            workspaceLanguageValue: deepClone(config2.workspace?.override),
            workspaceFolderLanguageValue: deepClone(config2.workspaceFolder?.override),
            languageIds: deepClone(config2.overrideIdentifiers)
          };
        }
        return void 0;
      }
    };
    if (typeof config === "object") {
      mixin(result, config, false);
    }
    return Object.freeze(result);
  }
  _toReadonlyValue(result) {
    const readonlyProxy = (target) => {
      return isObject(target) ? new Proxy(target, {
        get: (target2, property) => readonlyProxy(target2[property]),
        set: (_target, property, _value) => {
          throw new Error(`TypeError: Cannot assign to read only property '${String(property)}' of object`);
        },
        deleteProperty: (_target, property) => {
          throw new Error(`TypeError: Cannot delete read only property '${String(property)}' of object`);
        },
        defineProperty: (_target, property) => {
          throw new Error(`TypeError: Cannot define property '${String(property)}' for a readonly object`);
        },
        setPrototypeOf: (_target) => {
          throw new Error(`TypeError: Cannot set prototype for a readonly object`);
        },
        isExtensible: () => false,
        preventExtensions: () => true
      }) : target;
    };
    return readonlyProxy(result);
  }
  _validateConfigurationAccess(key, overrides, extensionId) {
    const scope = OVERRIDE_PROPERTY_REGEX.test(key) ? ConfigurationScope.RESOURCE : this._configurationScopes.get(key);
    const extensionIdText = extensionId ? `[${extensionId.value}] ` : "";
    if (ConfigurationScope.RESOURCE === scope) {
      if (typeof overrides?.resource === "undefined") {
        this._logService.warn(`${extensionIdText}Accessing a resource scoped configuration without providing a resource is not expected. To get the effective value for '${key}', provide the URI of a resource or 'null' for any resource.`);
      }
      return;
    }
    if (ConfigurationScope.WINDOW === scope) {
      if (overrides?.resource) {
        this._logService.warn(`${extensionIdText}Accessing a window scoped configuration for a resource is not expected. To associate '${key}' to a resource, define its scope to 'resource' in configuration contributions in 'package.json'.`);
      }
      return;
    }
  }
  _toConfigurationChangeEvent(change, previous) {
    const event = new ConfigurationChangeEvent(change, previous, this._configuration, this._extHostWorkspace.workspace, this._logService);
    return Object.freeze({
      affectsConfiguration: (section, scope) => event.affectsConfiguration(section, scopeToOverrides(scope))
    });
  }
  _toMap(scopes) {
    return scopes.reduce((result, scope) => {
      result.set(scope[0], scope[1]);
      return result;
    }, /* @__PURE__ */ new Map());
  }
}
const IExtHostConfiguration = createDecorator("IExtHostConfiguration");
export {
  ExtHostConfigProvider,
  ExtHostConfiguration,
  IExtHostConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RDb25maWd1cmF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbWl4aW4sIGRlZXBDbG9uZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgRXh0SG9zdFdvcmtzcGFjZSwgSUV4dEhvc3RXb3Jrc3BhY2UgfSBmcm9tICcuL2V4dEhvc3RXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbmZpZ3VyYXRpb25TaGFwZSwgTWFpblRocmVhZENvbmZpZ3VyYXRpb25TaGFwZSwgSUNvbmZpZ3VyYXRpb25Jbml0RGF0YSwgTWFpbkNvbnRleHQgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCBhcyBFeHRIb3N0Q29uZmlndXJhdGlvblRhcmdldCB9IGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uQ2hhbmdlLCBJQ29uZmlndXJhdGlvbkRhdGEsIElDb25maWd1cmF0aW9uT3ZlcnJpZGVzIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uLCBDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uTW9kZWxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVggfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgaXNPYmplY3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEJhcnJpZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuXG5mdW5jdGlvbiBsb29rVXAodHJlZTogdW5rbm93biwga2V5OiBzdHJpbmcpIHtcblx0aWYgKGtleSkge1xuXHRcdGNvbnN0IHBhcnRzID0ga2V5LnNwbGl0KCcuJyk7XG5cdFx0bGV0IG5vZGUgPSB0cmVlO1xuXHRcdGZvciAobGV0IGkgPSAwOyBub2RlICYmIGkgPCBwYXJ0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0bm9kZSA9IChub2RlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwYXJ0c1tpXV07XG5cdFx0fVxuXHRcdHJldHVybiBub2RlO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCB0eXBlIENvbmZpZ3VyYXRpb25JbnNwZWN0PFQ+ID0ge1xuXHRrZXk6IHN0cmluZztcblxuXHRkZWZhdWx0VmFsdWU/OiBUO1xuXHRnbG9iYWxMb2NhbFZhbHVlPzogVDtcblx0Z2xvYmFsUmVtb3RlVmFsdWU/OiBUO1xuXHRnbG9iYWxWYWx1ZT86IFQ7XG5cdHdvcmtzcGFjZVZhbHVlPzogVDtcblx0d29ya3NwYWNlRm9sZGVyVmFsdWU/OiBUO1xuXG5cdGRlZmF1bHRMYW5ndWFnZVZhbHVlPzogVDtcblx0Z2xvYmFsTG9jYWxMYW5ndWFnZVZhbHVlPzogVDtcblx0Z2xvYmFsUmVtb3RlTGFuZ3VhZ2VWYWx1ZT86IFQ7XG5cdGdsb2JhbExhbmd1YWdlVmFsdWU/OiBUO1xuXHR3b3Jrc3BhY2VMYW5ndWFnZVZhbHVlPzogVDtcblx0d29ya3NwYWNlRm9sZGVyTGFuZ3VhZ2VWYWx1ZT86IFQ7XG5cblx0bGFuZ3VhZ2VJZHM/OiBzdHJpbmdbXTtcbn07XG5cbmZ1bmN0aW9uIGlzVXJpKHRoaW5nOiB1bmtub3duKTogdGhpbmcgaXMgdnNjb2RlLlVyaSB7XG5cdHJldHVybiB0aGluZyBpbnN0YW5jZW9mIFVSSTtcbn1cblxuZnVuY3Rpb24gaXNSZXNvdXJjZUxhbmd1YWdlKHRoaW5nOiB1bmtub3duKTogdGhpbmcgaXMgeyB1cmk6IFVSSTsgbGFuZ3VhZ2VJZDogc3RyaW5nIH0ge1xuXHRyZXR1cm4gaXNPYmplY3QodGhpbmcpXG5cdFx0JiYgKHRoaW5nIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS51cmkgaW5zdGFuY2VvZiBVUklcblx0XHQmJiAhISh0aGluZyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikubGFuZ3VhZ2VJZFxuXHRcdCYmIHR5cGVvZiAodGhpbmcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmxhbmd1YWdlSWQgPT09ICdzdHJpbmcnO1xufVxuXG5mdW5jdGlvbiBpc0xhbmd1YWdlKHRoaW5nOiB1bmtub3duKTogdGhpbmcgaXMgeyBsYW5ndWFnZUlkOiBzdHJpbmcgfSB7XG5cdHJldHVybiBpc09iamVjdCh0aGluZylcblx0XHQmJiAhKHRoaW5nIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS51cmlcblx0XHQmJiAhISh0aGluZyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikubGFuZ3VhZ2VJZFxuXHRcdCYmIHR5cGVvZiAodGhpbmcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmxhbmd1YWdlSWQgPT09ICdzdHJpbmcnO1xufVxuXG5mdW5jdGlvbiBpc1dvcmtzcGFjZUZvbGRlcih0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIge1xuXHRyZXR1cm4gaXNPYmplY3QodGhpbmcpXG5cdFx0JiYgKHRoaW5nIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS51cmkgaW5zdGFuY2VvZiBVUklcblx0XHQmJiAoISh0aGluZyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikubmFtZSB8fCB0eXBlb2YgKHRoaW5nIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5uYW1lID09PSAnc3RyaW5nJylcblx0XHQmJiAoISh0aGluZyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikuaW5kZXggfHwgdHlwZW9mICh0aGluZyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikuaW5kZXggPT09ICdudW1iZXInKTtcbn1cblxuZnVuY3Rpb24gc2NvcGVUb092ZXJyaWRlcyhzY29wZTogdnNjb2RlLkNvbmZpZ3VyYXRpb25TY29wZSB8IHVuZGVmaW5lZCB8IG51bGwpOiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyB8IHVuZGVmaW5lZCB7XG5cdGlmIChpc1VyaShzY29wZSkpIHtcblx0XHRyZXR1cm4geyByZXNvdXJjZTogc2NvcGUgfTtcblx0fVxuXHRpZiAoaXNSZXNvdXJjZUxhbmd1YWdlKHNjb3BlKSkge1xuXHRcdHJldHVybiB7IHJlc291cmNlOiBzY29wZS51cmksIG92ZXJyaWRlSWRlbnRpZmllcjogc2NvcGUubGFuZ3VhZ2VJZCB9O1xuXHR9XG5cdGlmIChpc0xhbmd1YWdlKHNjb3BlKSkge1xuXHRcdHJldHVybiB7IG92ZXJyaWRlSWRlbnRpZmllcjogc2NvcGUubGFuZ3VhZ2VJZCB9O1xuXHR9XG5cdGlmIChpc1dvcmtzcGFjZUZvbGRlcihzY29wZSkpIHtcblx0XHRyZXR1cm4geyByZXNvdXJjZTogc2NvcGUudXJpIH07XG5cdH1cblx0aWYgKHNjb3BlID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIHsgcmVzb3VyY2U6IG51bGwgfTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdENvbmZpZ3VyYXRpb24gaW1wbGVtZW50cyBFeHRIb3N0Q29uZmlndXJhdGlvblNoYXBlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IE1haW5UaHJlYWRDb25maWd1cmF0aW9uU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0V29ya3NwYWNlOiBFeHRIb3N0V29ya3NwYWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9iYXJyaWVyOiBCYXJyaWVyO1xuXHRwcml2YXRlIF9hY3R1YWw6IEV4dEhvc3RDb25maWdQcm92aWRlciB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2UsXG5cdFx0QElFeHRIb3N0V29ya3NwYWNlIGV4dEhvc3RXb3Jrc3BhY2U6IElFeHRIb3N0V29ya3NwYWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0UnBjLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRDb25maWd1cmF0aW9uKTtcblx0XHR0aGlzLl9leHRIb3N0V29ya3NwYWNlID0gZXh0SG9zdFdvcmtzcGFjZTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlID0gbG9nU2VydmljZTtcblx0XHR0aGlzLl9iYXJyaWVyID0gbmV3IEJhcnJpZXIoKTtcblx0XHR0aGlzLl9hY3R1YWwgPSBudWxsO1xuXHR9XG5cblx0cHVibGljIGdldENvbmZpZ1Byb3ZpZGVyKCk6IFByb21pc2U8RXh0SG9zdENvbmZpZ1Byb3ZpZGVyPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2JhcnJpZXIud2FpdCgpLnRoZW4oXyA9PiB0aGlzLl9hY3R1YWwhKTtcblx0fVxuXG5cdCRpbml0aWFsaXplQ29uZmlndXJhdGlvbihkYXRhOiBJQ29uZmlndXJhdGlvbkluaXREYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0dWFsID0gbmV3IEV4dEhvc3RDb25maWdQcm92aWRlcih0aGlzLl9wcm94eSwgdGhpcy5fZXh0SG9zdFdvcmtzcGFjZSwgZGF0YSwgdGhpcy5fbG9nU2VydmljZSk7XG5cdFx0Ly8gUHVzaCB0aGUgY29uZmlnIHByb3ZpZGVyIGludG8gRXh0SG9zdFdvcmtzcGFjZSBzbyBpdCBjYW4gcmVhZCBzZXR0aW5ncyBzeW5jaHJvbm91c2x5XG5cdFx0Ly8gKERJIGN5Y2xlOiBFeHRIb3N0Q29uZmlndXJhdGlvbiBkZXBlbmRzIG9uIEV4dEhvc3RXb3Jrc3BhY2UsIHNvIHdlIGNhbm5vdCBpbmplY3QgdGhlIHJldmVyc2UpLlxuXHRcdHRoaXMuX2V4dEhvc3RXb3Jrc3BhY2UuJHNldENvbmZpZ1Byb3ZpZGVyKHRoaXMuX2FjdHVhbCk7XG5cdFx0dGhpcy5fYmFycmllci5vcGVuKCk7XG5cdH1cblxuXHQkYWNjZXB0Q29uZmlndXJhdGlvbkNoYW5nZWQoZGF0YTogSUNvbmZpZ3VyYXRpb25Jbml0RGF0YSwgY2hhbmdlOiBJQ29uZmlndXJhdGlvbkNoYW5nZSk6IHZvaWQge1xuXHRcdHRoaXMuZ2V0Q29uZmlnUHJvdmlkZXIoKS50aGVuKHByb3ZpZGVyID0+IHByb3ZpZGVyLiRhY2NlcHRDb25maWd1cmF0aW9uQ2hhbmdlZChkYXRhLCBjaGFuZ2UpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdENvbmZpZ1Byb3ZpZGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gPSBuZXcgRW1pdHRlcjx2c2NvZGUuQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogTWFpblRocmVhZENvbmZpZ3VyYXRpb25TaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfZXh0SG9zdFdvcmtzcGFjZTogRXh0SG9zdFdvcmtzcGFjZTtcblx0cHJpdmF0ZSBfY29uZmlndXJhdGlvblNjb3BlczogTWFwPHN0cmluZywgQ29uZmlndXJhdGlvblNjb3BlIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSBfY29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbjtcblx0cHJpdmF0ZSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2U7XG5cblx0Y29uc3RydWN0b3IocHJveHk6IE1haW5UaHJlYWRDb25maWd1cmF0aW9uU2hhcGUsIGV4dEhvc3RXb3Jrc3BhY2U6IEV4dEhvc3RXb3Jrc3BhY2UsIGRhdGE6IElDb25maWd1cmF0aW9uSW5pdERhdGEsIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKSB7XG5cdFx0dGhpcy5fcHJveHkgPSBwcm94eTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlID0gbG9nU2VydmljZTtcblx0XHR0aGlzLl9leHRIb3N0V29ya3NwYWNlID0gZXh0SG9zdFdvcmtzcGFjZTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uID0gQ29uZmlndXJhdGlvbi5wYXJzZShkYXRhLCBsb2dTZXJ2aWNlKTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2NvcGVzID0gdGhpcy5fdG9NYXAoZGF0YS5jb25maWd1cmF0aW9uU2NvcGVzKTtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKTogRXZlbnQ8dnNjb2RlLkNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gJiYgdGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLmV2ZW50O1xuXHR9XG5cblx0JGFjY2VwdENvbmZpZ3VyYXRpb25DaGFuZ2VkKGRhdGE6IElDb25maWd1cmF0aW9uSW5pdERhdGEsIGNoYW5nZTogSUNvbmZpZ3VyYXRpb25DaGFuZ2UpIHtcblx0XHRjb25zdCBwcmV2aW91cyA9IHsgZGF0YTogdGhpcy5fY29uZmlndXJhdGlvbi50b0RhdGEoKSwgd29ya3NwYWNlOiB0aGlzLl9leHRIb3N0V29ya3NwYWNlLndvcmtzcGFjZSB9O1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24gPSBDb25maWd1cmF0aW9uLnBhcnNlKGRhdGEsIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TY29wZXMgPSB0aGlzLl90b01hcChkYXRhLmNvbmZpZ3VyYXRpb25TY29wZXMpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5maXJlKHRoaXMuX3RvQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KGNoYW5nZSwgcHJldmlvdXMpKTtcblx0fVxuXG5cdGdldENvbmZpZ3VyYXRpb24oc2VjdGlvbj86IHN0cmluZywgc2NvcGU/OiB2c2NvZGUuQ29uZmlndXJhdGlvblNjb3BlIHwgbnVsbCwgZXh0ZW5zaW9uRGVzY3JpcHRpb24/OiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiB2c2NvZGUuV29ya3NwYWNlQ29uZmlndXJhdGlvbiB7XG5cdFx0Y29uc3Qgb3ZlcnJpZGVzID0gc2NvcGVUb092ZXJyaWRlcyhzY29wZSkgfHwge307XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fdG9SZWFkb25seVZhbHVlKHRoaXMuX2NvbmZpZ3VyYXRpb24uZ2V0VmFsdWUoc2VjdGlvbiwgb3ZlcnJpZGVzLCB0aGlzLl9leHRIb3N0V29ya3NwYWNlLndvcmtzcGFjZSkpO1xuXG5cdFx0aWYgKHNlY3Rpb24pIHtcblx0XHRcdHRoaXMuX3ZhbGlkYXRlQ29uZmlndXJhdGlvbkFjY2VzcyhzZWN0aW9uLCBvdmVycmlkZXMsIGV4dGVuc2lvbkRlc2NyaXB0aW9uPy5pZGVudGlmaWVyKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBwYXJzZUNvbmZpZ3VyYXRpb25UYXJnZXQoYXJnOiBib29sZWFuIHwgRXh0SG9zdENvbmZpZ3VyYXRpb25UYXJnZXQpOiBDb25maWd1cmF0aW9uVGFyZ2V0IHwgbnVsbCB7XG5cdFx0XHRpZiAoYXJnID09PSB1bmRlZmluZWQgfHwgYXJnID09PSBudWxsKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiBhcmcgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRyZXR1cm4gYXJnID8gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSIDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U7XG5cdFx0XHR9XG5cblx0XHRcdHN3aXRjaCAoYXJnKSB7XG5cdFx0XHRcdGNhc2UgRXh0SG9zdENvbmZpZ3VyYXRpb25UYXJnZXQuR2xvYmFsOiByZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSO1xuXHRcdFx0XHRjYXNlIEV4dEhvc3RDb25maWd1cmF0aW9uVGFyZ2V0LldvcmtzcGFjZTogcmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFO1xuXHRcdFx0XHRjYXNlIEV4dEhvc3RDb25maWd1cmF0aW9uVGFyZ2V0LldvcmtzcGFjZUZvbGRlcjogcmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IHZzY29kZS5Xb3Jrc3BhY2VDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0aGFzKGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiB0eXBlb2YgbG9va1VwKGNvbmZpZywga2V5KSAhPT0gJ3VuZGVmaW5lZCc7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0OiA8VD4oa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZT86IFQpID0+IHtcblx0XHRcdFx0dGhpcy5fdmFsaWRhdGVDb25maWd1cmF0aW9uQWNjZXNzKHNlY3Rpb24gPyBgJHtzZWN0aW9ufS4ke2tleX1gIDoga2V5LCBvdmVycmlkZXMsIGV4dGVuc2lvbkRlc2NyaXB0aW9uPy5pZGVudGlmaWVyKTtcblx0XHRcdFx0bGV0IHJlc3VsdDogdW5rbm93biA9IGxvb2tVcChjb25maWcsIGtleSk7XG5cdFx0XHRcdGlmICh0eXBlb2YgcmVzdWx0ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdHJlc3VsdCA9IGRlZmF1bHRWYWx1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsZXQgY2xvbmVkQ29uZmlnOiB1bmtub3duIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IGNsb25lT25Xcml0ZVByb3h5ID0gKHRhcmdldDogdW5rbm93biwgYWNjZXNzb3I6IHN0cmluZyk6IHVua25vd24gPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGlzT2JqZWN0KHRhcmdldCkpIHtcblx0XHRcdFx0XHRcdFx0bGV0IGNsb25lZFRhcmdldDogdW5rbm93biB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2xvbmVUYXJnZXQgPSAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Y2xvbmVkQ29uZmlnID0gY2xvbmVkQ29uZmlnID8gY2xvbmVkQ29uZmlnIDogZGVlcENsb25lKGNvbmZpZyk7XG5cdFx0XHRcdFx0XHRcdFx0Y2xvbmVkVGFyZ2V0ID0gY2xvbmVkVGFyZ2V0ID8gY2xvbmVkVGFyZ2V0IDogbG9va1VwKGNsb25lZENvbmZpZywgYWNjZXNzb3IpO1xuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbmV3IFByb3h5KHRhcmdldCwge1xuXHRcdFx0XHRcdFx0XHRcdGdldDogKHRhcmdldDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHByb3BlcnR5OiBQcm9wZXJ0eUtleSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBwcm9wZXJ0eSA9PT0gJ3N0cmluZycgJiYgcHJvcGVydHkudG9Mb3dlckNhc2UoKSA9PT0gJ3RvanNvbicpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y2xvbmVUYXJnZXQoKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuICgpID0+IGNsb25lZFRhcmdldDtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdGlmIChjbG9uZWRDb25maWcpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y2xvbmVkVGFyZ2V0ID0gY2xvbmVkVGFyZ2V0ID8gY2xvbmVkVGFyZ2V0IDogbG9va1VwKGNsb25lZENvbmZpZywgYWNjZXNzb3IpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gKGNsb25lZFRhcmdldCBhcyBSZWNvcmQ8UHJvcGVydHlLZXksIHVua25vd24+KVtwcm9wZXJ0eV07XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSAodGFyZ2V0IGFzIFJlY29yZDxQcm9wZXJ0eUtleSwgdW5rbm93bj4pW3Byb3BlcnR5XTtcblx0XHRcdFx0XHRcdFx0XHRcdGlmICh0eXBlb2YgcHJvcGVydHkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBjbG9uZU9uV3JpdGVQcm94eShyZXN1bHQsIGAke2FjY2Vzc29yfS4ke3Byb3BlcnR5fWApO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHNldDogKF90YXJnZXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBwcm9wZXJ0eTogUHJvcGVydHlLZXksIHZhbHVlOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjbG9uZVRhcmdldCgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKGNsb25lZFRhcmdldCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQoY2xvbmVkVGFyZ2V0IGFzIFJlY29yZDxQcm9wZXJ0eUtleSwgdW5rbm93bj4pW3Byb3BlcnR5XSA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRkZWxldGVQcm9wZXJ0eTogKF90YXJnZXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBwcm9wZXJ0eTogUHJvcGVydHlLZXkpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdGNsb25lVGFyZ2V0KCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoY2xvbmVkVGFyZ2V0KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlbGV0ZSAoY2xvbmVkVGFyZ2V0IGFzIFJlY29yZDxQcm9wZXJ0eUtleSwgdW5rbm93bj4pW3Byb3BlcnR5XTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0ZGVmaW5lUHJvcGVydHk6IChfdGFyZ2V0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgcHJvcGVydHk6IFByb3BlcnR5S2V5LCBkZXNjcmlwdG9yOiBQcm9wZXJ0eURlc2NyaXB0b3IpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdGNsb25lVGFyZ2V0KCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoY2xvbmVkVGFyZ2V0KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShjbG9uZWRUYXJnZXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHByb3BlcnR5LCBkZXNjcmlwdG9yKTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh0YXJnZXQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBkZWVwQ2xvbmUodGFyZ2V0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiB0YXJnZXQ7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRyZXN1bHQgPSBjbG9uZU9uV3JpdGVQcm94eShyZXN1bHQsIGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0sXG5cdFx0XHR1cGRhdGU6IChrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIGV4dEhvc3RDb25maWd1cmF0aW9uVGFyZ2V0OiBFeHRIb3N0Q29uZmlndXJhdGlvblRhcmdldCB8IGJvb2xlYW4sIHNjb3BlVG9MYW5ndWFnZT86IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0a2V5ID0gc2VjdGlvbiA/IGAke3NlY3Rpb259LiR7a2V5fWAgOiBrZXk7XG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IHBhcnNlQ29uZmlndXJhdGlvblRhcmdldChleHRIb3N0Q29uZmlndXJhdGlvblRhcmdldCk7XG5cdFx0XHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiR1cGRhdGVDb25maWd1cmF0aW9uT3B0aW9uKHRhcmdldCwga2V5LCB2YWx1ZSwgb3ZlcnJpZGVzLCBzY29wZVRvTGFuZ3VhZ2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcmVtb3ZlQ29uZmlndXJhdGlvbk9wdGlvbih0YXJnZXQsIGtleSwgb3ZlcnJpZGVzLCBzY29wZVRvTGFuZ3VhZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0aW5zcGVjdDogPFQ+KGtleTogc3RyaW5nKTogQ29uZmlndXJhdGlvbkluc3BlY3Q8VD4gfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRrZXkgPSBzZWN0aW9uID8gYCR7c2VjdGlvbn0uJHtrZXl9YCA6IGtleTtcblx0XHRcdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fY29uZmlndXJhdGlvbi5pbnNwZWN0PFQ+KGtleSwgb3ZlcnJpZGVzLCB0aGlzLl9leHRIb3N0V29ya3NwYWNlLndvcmtzcGFjZSk7XG5cdFx0XHRcdGlmIChjb25maWcpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0a2V5LFxuXG5cdFx0XHRcdFx0XHRkZWZhdWx0VmFsdWU6IGRlZXBDbG9uZShjb25maWcucG9saWN5Py52YWx1ZSA/PyBjb25maWcuZGVmYXVsdD8udmFsdWUpLFxuXHRcdFx0XHRcdFx0Z2xvYmFsTG9jYWxWYWx1ZTogZGVlcENsb25lKGNvbmZpZy51c2VyTG9jYWw/LnZhbHVlKSxcblx0XHRcdFx0XHRcdGdsb2JhbFJlbW90ZVZhbHVlOiBkZWVwQ2xvbmUoY29uZmlnLnVzZXJSZW1vdGU/LnZhbHVlKSxcblx0XHRcdFx0XHRcdGdsb2JhbFZhbHVlOiBkZWVwQ2xvbmUoY29uZmlnLnVzZXI/LnZhbHVlID8/IGNvbmZpZy5hcHBsaWNhdGlvbj8udmFsdWUpLFxuXHRcdFx0XHRcdFx0d29ya3NwYWNlVmFsdWU6IGRlZXBDbG9uZShjb25maWcud29ya3NwYWNlPy52YWx1ZSksXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXJWYWx1ZTogZGVlcENsb25lKGNvbmZpZy53b3Jrc3BhY2VGb2xkZXI/LnZhbHVlKSxcblxuXHRcdFx0XHRcdFx0ZGVmYXVsdExhbmd1YWdlVmFsdWU6IGRlZXBDbG9uZShjb25maWcuZGVmYXVsdD8ub3ZlcnJpZGUpLFxuXHRcdFx0XHRcdFx0Z2xvYmFsTG9jYWxMYW5ndWFnZVZhbHVlOiBkZWVwQ2xvbmUoY29uZmlnLnVzZXJMb2NhbD8ub3ZlcnJpZGUpLFxuXHRcdFx0XHRcdFx0Z2xvYmFsUmVtb3RlTGFuZ3VhZ2VWYWx1ZTogZGVlcENsb25lKGNvbmZpZy51c2VyUmVtb3RlPy5vdmVycmlkZSksXG5cdFx0XHRcdFx0XHRnbG9iYWxMYW5ndWFnZVZhbHVlOiBkZWVwQ2xvbmUoY29uZmlnLnVzZXI/Lm92ZXJyaWRlID8/IGNvbmZpZy5hcHBsaWNhdGlvbj8ub3ZlcnJpZGUpLFxuXHRcdFx0XHRcdFx0d29ya3NwYWNlTGFuZ3VhZ2VWYWx1ZTogZGVlcENsb25lKGNvbmZpZy53b3Jrc3BhY2U/Lm92ZXJyaWRlKSxcblx0XHRcdFx0XHRcdHdvcmtzcGFjZUZvbGRlckxhbmd1YWdlVmFsdWU6IGRlZXBDbG9uZShjb25maWcud29ya3NwYWNlRm9sZGVyPy5vdmVycmlkZSksXG5cblx0XHRcdFx0XHRcdGxhbmd1YWdlSWRzOiBkZWVwQ2xvbmUoY29uZmlnLm92ZXJyaWRlSWRlbnRpZmllcnMpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAodHlwZW9mIGNvbmZpZyA9PT0gJ29iamVjdCcpIHtcblx0XHRcdG1peGluKHJlc3VsdCwgY29uZmlnLCBmYWxzZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIE9iamVjdC5mcmVlemUocmVzdWx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3RvUmVhZG9ubHlWYWx1ZShyZXN1bHQ6IHVua25vd24pOiB1bmtub3duIHtcblx0XHRjb25zdCByZWFkb25seVByb3h5ID0gKHRhcmdldDogdW5rbm93bik6IHVua25vd24gPT4ge1xuXHRcdFx0cmV0dXJuIGlzT2JqZWN0KHRhcmdldCkgP1xuXHRcdFx0XHRuZXcgUHJveHkodGFyZ2V0LCB7XG5cdFx0XHRcdFx0Z2V0OiAodGFyZ2V0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgcHJvcGVydHk6IFByb3BlcnR5S2V5KSA9PiByZWFkb25seVByb3h5KCh0YXJnZXQgYXMgUmVjb3JkPFByb3BlcnR5S2V5LCB1bmtub3duPilbcHJvcGVydHldKSxcblx0XHRcdFx0XHRzZXQ6IChfdGFyZ2V0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgcHJvcGVydHk6IFByb3BlcnR5S2V5LCBfdmFsdWU6IHVua25vd24pID0+IHsgdGhyb3cgbmV3IEVycm9yKGBUeXBlRXJyb3I6IENhbm5vdCBhc3NpZ24gdG8gcmVhZCBvbmx5IHByb3BlcnR5ICcke1N0cmluZyhwcm9wZXJ0eSl9JyBvZiBvYmplY3RgKTsgfSxcblx0XHRcdFx0XHRkZWxldGVQcm9wZXJ0eTogKF90YXJnZXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBwcm9wZXJ0eTogUHJvcGVydHlLZXkpID0+IHsgdGhyb3cgbmV3IEVycm9yKGBUeXBlRXJyb3I6IENhbm5vdCBkZWxldGUgcmVhZCBvbmx5IHByb3BlcnR5ICcke1N0cmluZyhwcm9wZXJ0eSl9JyBvZiBvYmplY3RgKTsgfSxcblx0XHRcdFx0XHRkZWZpbmVQcm9wZXJ0eTogKF90YXJnZXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBwcm9wZXJ0eTogUHJvcGVydHlLZXkpID0+IHsgdGhyb3cgbmV3IEVycm9yKGBUeXBlRXJyb3I6IENhbm5vdCBkZWZpbmUgcHJvcGVydHkgJyR7U3RyaW5nKHByb3BlcnR5KX0nIGZvciBhIHJlYWRvbmx5IG9iamVjdGApOyB9LFxuXHRcdFx0XHRcdHNldFByb3RvdHlwZU9mOiAoX3RhcmdldDogdW5rbm93bikgPT4geyB0aHJvdyBuZXcgRXJyb3IoYFR5cGVFcnJvcjogQ2Fubm90IHNldCBwcm90b3R5cGUgZm9yIGEgcmVhZG9ubHkgb2JqZWN0YCk7IH0sXG5cdFx0XHRcdFx0aXNFeHRlbnNpYmxlOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0XHRwcmV2ZW50RXh0ZW5zaW9uczogKCkgPT4gdHJ1ZVxuXHRcdFx0XHR9KSA6IHRhcmdldDtcblx0XHR9O1xuXHRcdHJldHVybiByZWFkb25seVByb3h5KHJlc3VsdCk7XG5cdH1cblxuXHRwcml2YXRlIF92YWxpZGF0ZUNvbmZpZ3VyYXRpb25BY2Nlc3Moa2V5OiBzdHJpbmcsIG92ZXJyaWRlcz86IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzLCBleHRlbnNpb25JZD86IEV4dGVuc2lvbklkZW50aWZpZXIpOiB2b2lkIHtcblx0XHRjb25zdCBzY29wZSA9IE9WRVJSSURFX1BST1BFUlRZX1JFR0VYLnRlc3Qoa2V5KSA/IENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRSA6IHRoaXMuX2NvbmZpZ3VyYXRpb25TY29wZXMuZ2V0KGtleSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWRUZXh0ID0gZXh0ZW5zaW9uSWQgPyBgWyR7ZXh0ZW5zaW9uSWQudmFsdWV9XSBgIDogJyc7XG5cdFx0aWYgKENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRSA9PT0gc2NvcGUpIHtcblx0XHRcdGlmICh0eXBlb2Ygb3ZlcnJpZGVzPy5yZXNvdXJjZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke2V4dGVuc2lvbklkVGV4dH1BY2Nlc3NpbmcgYSByZXNvdXJjZSBzY29wZWQgY29uZmlndXJhdGlvbiB3aXRob3V0IHByb3ZpZGluZyBhIHJlc291cmNlIGlzIG5vdCBleHBlY3RlZC4gVG8gZ2V0IHRoZSBlZmZlY3RpdmUgdmFsdWUgZm9yICcke2tleX0nLCBwcm92aWRlIHRoZSBVUkkgb2YgYSByZXNvdXJjZSBvciAnbnVsbCcgZm9yIGFueSByZXNvdXJjZS5gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKENvbmZpZ3VyYXRpb25TY29wZS5XSU5ET1cgPT09IHNjb3BlKSB7XG5cdFx0XHRpZiAob3ZlcnJpZGVzPy5yZXNvdXJjZSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7ZXh0ZW5zaW9uSWRUZXh0fUFjY2Vzc2luZyBhIHdpbmRvdyBzY29wZWQgY29uZmlndXJhdGlvbiBmb3IgYSByZXNvdXJjZSBpcyBub3QgZXhwZWN0ZWQuIFRvIGFzc29jaWF0ZSAnJHtrZXl9JyB0byBhIHJlc291cmNlLCBkZWZpbmUgaXRzIHNjb3BlIHRvICdyZXNvdXJjZScgaW4gY29uZmlndXJhdGlvbiBjb250cmlidXRpb25zIGluICdwYWNrYWdlLmpzb24nLmApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RvQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KGNoYW5nZTogSUNvbmZpZ3VyYXRpb25DaGFuZ2UsIHByZXZpb3VzOiB7IGRhdGE6IElDb25maWd1cmF0aW9uRGF0YTsgd29ya3NwYWNlOiBXb3Jrc3BhY2UgfCB1bmRlZmluZWQgfSk6IHZzY29kZS5Db25maWd1cmF0aW9uQ2hhbmdlRXZlbnQge1xuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IENvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudChjaGFuZ2UsIHByZXZpb3VzLCB0aGlzLl9jb25maWd1cmF0aW9uLCB0aGlzLl9leHRIb3N0V29ya3NwYWNlLndvcmtzcGFjZSwgdGhpcy5fbG9nU2VydmljZSk7XG5cdFx0cmV0dXJuIE9iamVjdC5mcmVlemUoe1xuXHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IChzZWN0aW9uOiBzdHJpbmcsIHNjb3BlPzogdnNjb2RlLkNvbmZpZ3VyYXRpb25TY29wZSkgPT4gZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oc2VjdGlvbiwgc2NvcGVUb092ZXJyaWRlcyhzY29wZSkpXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF90b01hcChzY29wZXM6IFtzdHJpbmcsIENvbmZpZ3VyYXRpb25TY29wZSB8IHVuZGVmaW5lZF1bXSk6IE1hcDxzdHJpbmcsIENvbmZpZ3VyYXRpb25TY29wZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBzY29wZXMucmVkdWNlKChyZXN1bHQsIHNjb3BlKSA9PiB7IHJlc3VsdC5zZXQoc2NvcGVbMF0sIHNjb3BlWzFdKTsgcmV0dXJuIHJlc3VsdDsgfSwgbmV3IE1hcDxzdHJpbmcsIENvbmZpZ3VyYXRpb25TY29wZSB8IHVuZGVmaW5lZD4oKSk7XG5cdH1cblxufVxuXG5leHBvcnQgY29uc3QgSUV4dEhvc3RDb25maWd1cmF0aW9uID0gY3JlYXRlRGVjb3JhdG9yPElFeHRIb3N0Q29uZmlndXJhdGlvbj4oJ0lFeHRIb3N0Q29uZmlndXJhdGlvbicpO1xuZXhwb3J0IGludGVyZmFjZSBJRXh0SG9zdENvbmZpZ3VyYXRpb24gZXh0ZW5kcyBFeHRIb3N0Q29uZmlndXJhdGlvbiB7IH1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxPQUFPLGlCQUFpQjtBQUNqQyxTQUFnQixlQUFlO0FBRS9CLFNBQTJCLHlCQUF5QjtBQUNwRCxTQUEwRixtQkFBbUI7QUFDN0csU0FBUyx1QkFBdUIsa0NBQWtDO0FBQ2xFLFNBQVMsMkJBQThGO0FBQ3ZHLFNBQVMsZUFBZSxnQ0FBZ0M7QUFDeEQsU0FBUyxv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QUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDRCQUE0QixRQUE4QixVQUEyRztBQUM1SyxVQUFNLFFBQVEsSUFBSSx5QkFBeUIsUUFBUSxVQUFVLEtBQUssZ0JBQWdCLEtBQUssa0JBQWtCLFdBQVcsS0FBSyxXQUFXO0FBQ3BJLFdBQU8sT0FBTyxPQUFPO0FBQUEsTUFDcEIsc0JBQXNCLENBQUMsU0FBaUIsVUFBc0MsTUFBTSxxQkFBcUIsU0FBUyxpQkFBaUIsS0FBSyxDQUFDO0FBQUEsSUFDMUksQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLE9BQU8sUUFBaUc7QUFDL0csV0FBTyxPQUFPLE9BQU8sQ0FBQyxRQUFRLFVBQVU7QUFBRSxhQUFPLElBQUksTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUM7QUFBRyxhQUFPO0FBQUEsSUFBUSxHQUFHLG9CQUFJLElBQTRDLENBQUM7QUFBQSxFQUM5STtBQUVEO0FBRU8sTUFBTSx3QkFBd0IsZ0JBQXVDLHVCQUF1QjsiLAogICJuYW1lcyI6IFsicmVzdWx0IiwgInRhcmdldCIsICJjb25maWciXQp9Cg==
