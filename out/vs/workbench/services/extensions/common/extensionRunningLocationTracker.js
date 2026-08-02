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
import { Schemas } from "../../../../base/common/network.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ExtensionIdentifierMap } from "../../../../platform/extensions/common/extensions.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { ExtensionHostKind, ExtensionRunningPreference, determineExtensionHostKinds } from "./extensionHostKind.js";
import { IExtensionManifestPropertiesService } from "./extensionManifestPropertiesService.js";
import { LocalProcessRunningLocation, LocalWebWorkerRunningLocation, RemoteRunningLocation } from "./extensionRunningLocation.js";
import { isProposedApiEnabled } from "./extensions.js";
let ExtensionRunningLocationTracker = class {
  constructor(_registry, _extensionHostKindPicker, _environmentService, _configurationService, _logService, _extensionManifestPropertiesService) {
    this._registry = _registry;
    this._extensionHostKindPicker = _extensionHostKindPicker;
    this._environmentService = _environmentService;
    this._configurationService = _configurationService;
    this._logService = _logService;
    this._extensionManifestPropertiesService = _extensionManifestPropertiesService;
    this._runningLocation = new ExtensionIdentifierMap();
    this._maxLocalProcessAffinity = 0;
    this._maxLocalWebWorkerAffinity = 0;
  }
  get maxLocalProcessAffinity() {
    return this._maxLocalProcessAffinity;
  }
  get maxLocalWebWorkerAffinity() {
    return this._maxLocalWebWorkerAffinity;
  }
  set(extensionId, runningLocation) {
    this._runningLocation.set(extensionId, runningLocation);
  }
  readExtensionKinds(extensionDescription) {
    if (extensionDescription.isUnderDevelopment && this._environmentService.extensionDevelopmentKind) {
      return this._environmentService.extensionDevelopmentKind;
    }
    return this._extensionManifestPropertiesService.getExtensionKind(extensionDescription);
  }
  getRunningLocation(extensionId) {
    return this._runningLocation.get(extensionId) || null;
  }
  filterByRunningLocation(extensions, desiredRunningLocation) {
    return filterExtensionDescriptions(extensions, this._runningLocation, (extRunningLocation) => desiredRunningLocation.equals(extRunningLocation));
  }
  filterByExtensionHostKind(extensions, desiredExtensionHostKind) {
    return filterExtensionDescriptions(extensions, this._runningLocation, (extRunningLocation) => extRunningLocation.kind === desiredExtensionHostKind);
  }
  filterByExtensionHostManager(extensions, extensionHostManager) {
    return filterExtensionDescriptions(extensions, this._runningLocation, (extRunningLocation) => extensionHostManager.representsRunningLocation(extRunningLocation));
  }
  _computeAffinity(inputExtensions, extensionHostKind, isInitialAllocation) {
    const extensions = new ExtensionIdentifierMap();
    for (const extension of inputExtensions) {
      if (extension.main || extension.browser) {
        extensions.set(extension.identifier, extension);
      }
    }
    for (const extension of this._registry.getAllExtensionDescriptions()) {
      if (extension.main || extension.browser) {
        const runningLocation = this._runningLocation.get(extension.identifier);
        if (runningLocation && runningLocation.kind === extensionHostKind) {
          extensions.set(extension.identifier, extension);
        }
      }
    }
    const groups = new ExtensionIdentifierMap();
    let groupNumber = 0;
    for (const [_, extension] of extensions) {
      groups.set(extension.identifier, ++groupNumber);
    }
    const changeGroup = (from, to) => {
      for (const [key, group] of groups) {
        if (group === from) {
          groups.set(key, to);
        }
      }
    };
    for (const [_, extension] of extensions) {
      if (!extension.extensionDependencies) {
        continue;
      }
      const myGroup = groups.get(extension.identifier);
      for (const depId of extension.extensionDependencies) {
        const depGroup = groups.get(depId);
        if (!depGroup) {
          continue;
        }
        if (depGroup === myGroup) {
          continue;
        }
        changeGroup(depGroup, myGroup);
      }
    }
    for (const [_, extension] of extensions) {
      if (!extension.extensionAffinity) {
        continue;
      }
      if (!isProposedApiEnabled(extension, "extensionAffinity")) {
        this._logService.warn(`Extension '${extension.identifier.value}' declares 'extensionAffinity' in its package.json but does not enable the 'extensionAffinity' API proposal. Add '"enabledApiProposals": ["extensionAffinity"]' to the extension's package.json to use this feature.`);
        continue;
      }
      const myGroup = groups.get(extension.identifier);
      for (const colocateId of extension.extensionAffinity) {
        const colocateGroup = groups.get(colocateId);
        if (!colocateGroup) {
          continue;
        }
        if (colocateGroup === myGroup) {
          continue;
        }
        changeGroup(colocateGroup, myGroup);
      }
    }
    const resultingAffinities = /* @__PURE__ */ new Map();
    let lastAffinity = 0;
    for (const [_, extension] of extensions) {
      const runningLocation = this._runningLocation.get(extension.identifier);
      if (runningLocation) {
        const group = groups.get(extension.identifier);
        resultingAffinities.set(group, runningLocation.affinity);
        lastAffinity = Math.max(lastAffinity, runningLocation.affinity);
      }
    }
    if (!this._environmentService.isExtensionDevelopment) {
      const configuredAffinities = this._configurationService.getValue("extensions.experimental.affinity") || {};
      const configuredExtensionIds = Object.keys(configuredAffinities);
      const configuredAffinityToResultingAffinity = /* @__PURE__ */ new Map();
      for (const extensionId of configuredExtensionIds) {
        const configuredAffinity = configuredAffinities[extensionId];
        if (typeof configuredAffinity !== "number" || configuredAffinity <= 0 || Math.floor(configuredAffinity) !== configuredAffinity) {
          this._logService.info(`Ignoring configured affinity for '${extensionId}' because the value is not a positive integer.`);
          continue;
        }
        const group = groups.get(extensionId);
        if (!group) {
          continue;
        }
        const affinity1 = resultingAffinities.get(group);
        if (affinity1) {
          configuredAffinityToResultingAffinity.set(configuredAffinity, affinity1);
          continue;
        }
        const affinity2 = configuredAffinityToResultingAffinity.get(configuredAffinity);
        if (affinity2) {
          resultingAffinities.set(group, affinity2);
          continue;
        }
        if (!isInitialAllocation) {
          this._logService.info(`Ignoring configured affinity for '${extensionId}' because extension host(s) are already running. Reload window.`);
          continue;
        }
        const affinity3 = ++lastAffinity;
        configuredAffinityToResultingAffinity.set(configuredAffinity, affinity3);
        resultingAffinities.set(group, affinity3);
      }
    }
    const result = new ExtensionIdentifierMap();
    for (const extension of inputExtensions) {
      const group = groups.get(extension.identifier) || 0;
      const affinity = resultingAffinities.get(group) || 0;
      result.set(extension.identifier, affinity);
    }
    if (lastAffinity > 0 && isInitialAllocation) {
      for (let affinity = 1; affinity <= lastAffinity; affinity++) {
        const extensionIds = [];
        for (const extension of inputExtensions) {
          if (result.get(extension.identifier) === affinity) {
            extensionIds.push(extension.identifier);
          }
        }
        this._logService.info(`Placing extension(s) ${extensionIds.map((e) => e.value).join(", ")} on a separate extension host.`);
      }
    }
    return { affinities: result, maxAffinity: lastAffinity };
  }
  computeRunningLocation(localExtensions, remoteExtensions, isInitialAllocation) {
    return this._doComputeRunningLocation(this._runningLocation, localExtensions, remoteExtensions, isInitialAllocation).runningLocation;
  }
  _doComputeRunningLocation(existingRunningLocation, localExtensions, remoteExtensions, isInitialAllocation) {
    localExtensions = localExtensions.filter((extension) => !existingRunningLocation.has(extension.identifier));
    remoteExtensions = remoteExtensions.filter((extension) => !existingRunningLocation.has(extension.identifier));
    const extensionHostKinds = determineExtensionHostKinds(
      localExtensions,
      remoteExtensions,
      (extension) => this.readExtensionKinds(extension),
      (extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference) => this._extensionHostKindPicker.pickExtensionHostKind(extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference)
    );
    const extensions = new ExtensionIdentifierMap();
    for (const extension of localExtensions) {
      extensions.set(extension.identifier, extension);
    }
    for (const extension of remoteExtensions) {
      extensions.set(extension.identifier, extension);
    }
    const result = new ExtensionIdentifierMap();
    const localProcessExtensions = [];
    const localWebWorkerExtensions = [];
    for (const [extensionIdKey, extensionHostKind] of extensionHostKinds) {
      let runningLocation = null;
      if (extensionHostKind === ExtensionHostKind.LocalProcess) {
        const extensionDescription = extensions.get(extensionIdKey);
        if (extensionDescription) {
          localProcessExtensions.push(extensionDescription);
        }
      } else if (extensionHostKind === ExtensionHostKind.LocalWebWorker) {
        const extensionDescription = extensions.get(extensionIdKey);
        if (extensionDescription) {
          localWebWorkerExtensions.push(extensionDescription);
        }
      } else if (extensionHostKind === ExtensionHostKind.Remote) {
        runningLocation = new RemoteRunningLocation();
      }
      result.set(extensionIdKey, runningLocation);
    }
    const { affinities, maxAffinity } = this._computeAffinity(localProcessExtensions, ExtensionHostKind.LocalProcess, isInitialAllocation);
    for (const extension of localProcessExtensions) {
      const affinity = affinities.get(extension.identifier) || 0;
      result.set(extension.identifier, new LocalProcessRunningLocation(affinity));
    }
    const { affinities: localWebWorkerAffinities, maxAffinity: maxLocalWebWorkerAffinity } = this._computeAffinity(localWebWorkerExtensions, ExtensionHostKind.LocalWebWorker, isInitialAllocation);
    for (const extension of localWebWorkerExtensions) {
      const affinity = localWebWorkerAffinities.get(extension.identifier) || 0;
      result.set(extension.identifier, new LocalWebWorkerRunningLocation(affinity));
    }
    for (const [extensionIdKey, runningLocation] of existingRunningLocation) {
      if (runningLocation) {
        result.set(extensionIdKey, runningLocation);
      }
    }
    return { runningLocation: result, maxLocalProcessAffinity: maxAffinity, maxLocalWebWorkerAffinity };
  }
  initializeRunningLocation(localExtensions, remoteExtensions) {
    const { runningLocation, maxLocalProcessAffinity, maxLocalWebWorkerAffinity } = this._doComputeRunningLocation(this._runningLocation, localExtensions, remoteExtensions, true);
    this._runningLocation = runningLocation;
    this._maxLocalProcessAffinity = maxLocalProcessAffinity;
    this._maxLocalWebWorkerAffinity = maxLocalWebWorkerAffinity;
  }
  /**
   * Returns the running locations for the removed extensions.
   */
  deltaExtensions(toAdd, toRemove) {
    const removedRunningLocation = new ExtensionIdentifierMap();
    for (const extensionId of toRemove) {
      const extensionKey = extensionId;
      removedRunningLocation.set(extensionKey, this._runningLocation.get(extensionKey) || null);
      this._runningLocation.delete(extensionKey);
    }
    this._updateRunningLocationForAddedExtensions(toAdd);
    return removedRunningLocation;
  }
  /**
   * Update `this._runningLocation` with running locations for newly enabled/installed extensions.
   */
  _updateRunningLocationForAddedExtensions(toAdd) {
    const localProcessExtensions = [];
    const localWebWorkerExtensions = [];
    for (const extension of toAdd) {
      const extensionKind = this.readExtensionKinds(extension);
      const isRemote = extension.extensionLocation.scheme === Schemas.vscodeRemote;
      const extensionHostKind = this._extensionHostKindPicker.pickExtensionHostKind(extension.identifier, extensionKind, !isRemote, isRemote, ExtensionRunningPreference.None);
      let runningLocation = null;
      if (extensionHostKind === ExtensionHostKind.LocalProcess) {
        localProcessExtensions.push(extension);
      } else if (extensionHostKind === ExtensionHostKind.LocalWebWorker) {
        localWebWorkerExtensions.push(extension);
      } else if (extensionHostKind === ExtensionHostKind.Remote) {
        runningLocation = new RemoteRunningLocation();
      }
      this._runningLocation.set(extension.identifier, runningLocation);
    }
    const { affinities } = this._computeAffinity(localProcessExtensions, ExtensionHostKind.LocalProcess, false);
    for (const extension of localProcessExtensions) {
      const affinity = affinities.get(extension.identifier) || 0;
      this._runningLocation.set(extension.identifier, new LocalProcessRunningLocation(affinity));
    }
    const { affinities: webWorkerExtensionsAffinities } = this._computeAffinity(localWebWorkerExtensions, ExtensionHostKind.LocalWebWorker, false);
    for (const extension of localWebWorkerExtensions) {
      const affinity = webWorkerExtensionsAffinities.get(extension.identifier) || 0;
      this._runningLocation.set(extension.identifier, new LocalWebWorkerRunningLocation(affinity));
    }
  }
};
ExtensionRunningLocationTracker = __decorateClass([
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IExtensionManifestPropertiesService)
], ExtensionRunningLocationTracker);
function filterExtensionDescriptions(extensions, runningLocation, predicate) {
  return extensions.filter((ext) => {
    const extRunningLocation = runningLocation.get(ext.identifier);
    return extRunningLocation && predicate(extRunningLocation);
  });
}
function filterExtensionIdentifiers(extensions, runningLocation, predicate) {
  return extensions.filter((ext) => {
    const extRunningLocation = runningLocation.get(ext);
    return extRunningLocation && predicate(extRunningLocation);
  });
}
export {
  ExtensionRunningLocationTracker,
  filterExtensionDescriptions,
  filterExtensionIdentifiers
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25SdW5uaW5nTG9jYXRpb25UcmFja2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIEV4dGVuc2lvbklkZW50aWZpZXJNYXAsIElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVhZE9ubHlFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi9leHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RLaW5kLCBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZSwgSUV4dGVuc2lvbkhvc3RLaW5kUGlja2VyLCBkZXRlcm1pbmVFeHRlbnNpb25Ib3N0S2luZHMgfSBmcm9tICcuL2V4dGVuc2lvbkhvc3RLaW5kLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25Ib3N0TWFuYWdlciB9IGZyb20gJy4vZXh0ZW5zaW9uSG9zdE1hbmFnZXJzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi9leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbiwgTG9jYWxQcm9jZXNzUnVubmluZ0xvY2F0aW9uLCBMb2NhbFdlYldvcmtlclJ1bm5pbmdMb2NhdGlvbiwgUmVtb3RlUnVubmluZ0xvY2F0aW9uIH0gZnJvbSAnLi9leHRlbnNpb25SdW5uaW5nTG9jYXRpb24uanMnO1xuaW1wb3J0IHsgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuL2V4dGVuc2lvbnMuanMnO1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uVHJhY2tlciB7XG5cblx0cHJpdmF0ZSBfcnVubmluZ0xvY2F0aW9uID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8RXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uIHwgbnVsbD4oKTtcblx0cHJpdmF0ZSBfbWF4TG9jYWxQcm9jZXNzQWZmaW5pdHk6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX21heExvY2FsV2ViV29ya2VyQWZmaW5pdHk6IG51bWJlciA9IDA7XG5cblx0cHVibGljIGdldCBtYXhMb2NhbFByb2Nlc3NBZmZpbml0eSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9tYXhMb2NhbFByb2Nlc3NBZmZpbml0eTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgbWF4TG9jYWxXZWJXb3JrZXJBZmZpbml0eSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9tYXhMb2NhbFdlYldvcmtlckFmZmluaXR5O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVnaXN0cnk6IElSZWFkT25seUV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uSG9zdEtpbmRQaWNrZXI6IElFeHRlbnNpb25Ib3N0S2luZFBpY2tlcixcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZTogSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0cHVibGljIHNldChleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgcnVubmluZ0xvY2F0aW9uOiBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24pIHtcblx0XHR0aGlzLl9ydW5uaW5nTG9jYXRpb24uc2V0KGV4dGVuc2lvbklkLCBydW5uaW5nTG9jYXRpb24pO1xuXHR9XG5cblx0cHVibGljIHJlYWRFeHRlbnNpb25LaW5kcyhleHRlbnNpb25EZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogRXh0ZW5zaW9uS2luZFtdIHtcblx0XHRpZiAoZXh0ZW5zaW9uRGVzY3JpcHRpb24uaXNVbmRlckRldmVsb3BtZW50ICYmIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5leHRlbnNpb25EZXZlbG9wbWVudEtpbmQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRLaW5kO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmdldEV4dGVuc2lvbktpbmQoZXh0ZW5zaW9uRGVzY3JpcHRpb24pO1xuXHR9XG5cblx0cHVibGljIGdldFJ1bm5pbmdMb2NhdGlvbihleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcik6IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9ydW5uaW5nTG9jYXRpb24uZ2V0KGV4dGVuc2lvbklkKSB8fCBudWxsO1xuXHR9XG5cblx0cHVibGljIGZpbHRlckJ5UnVubmluZ0xvY2F0aW9uKGV4dGVuc2lvbnM6IHJlYWRvbmx5IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCBkZXNpcmVkUnVubmluZ0xvY2F0aW9uOiBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24pOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSB7XG5cdFx0cmV0dXJuIGZpbHRlckV4dGVuc2lvbkRlc2NyaXB0aW9ucyhleHRlbnNpb25zLCB0aGlzLl9ydW5uaW5nTG9jYXRpb24sIGV4dFJ1bm5pbmdMb2NhdGlvbiA9PiBkZXNpcmVkUnVubmluZ0xvY2F0aW9uLmVxdWFscyhleHRSdW5uaW5nTG9jYXRpb24pKTtcblx0fVxuXG5cdHB1YmxpYyBmaWx0ZXJCeUV4dGVuc2lvbkhvc3RLaW5kKGV4dGVuc2lvbnM6IHJlYWRvbmx5IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCBkZXNpcmVkRXh0ZW5zaW9uSG9zdEtpbmQ6IEV4dGVuc2lvbkhvc3RLaW5kKTogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10ge1xuXHRcdHJldHVybiBmaWx0ZXJFeHRlbnNpb25EZXNjcmlwdGlvbnMoZXh0ZW5zaW9ucywgdGhpcy5fcnVubmluZ0xvY2F0aW9uLCBleHRSdW5uaW5nTG9jYXRpb24gPT4gZXh0UnVubmluZ0xvY2F0aW9uLmtpbmQgPT09IGRlc2lyZWRFeHRlbnNpb25Ib3N0S2luZCk7XG5cdH1cblxuXHRwdWJsaWMgZmlsdGVyQnlFeHRlbnNpb25Ib3N0TWFuYWdlcihleHRlbnNpb25zOiByZWFkb25seSBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSwgZXh0ZW5zaW9uSG9zdE1hbmFnZXI6IElFeHRlbnNpb25Ib3N0TWFuYWdlcik6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdIHtcblx0XHRyZXR1cm4gZmlsdGVyRXh0ZW5zaW9uRGVzY3JpcHRpb25zKGV4dGVuc2lvbnMsIHRoaXMuX3J1bm5pbmdMb2NhdGlvbiwgZXh0UnVubmluZ0xvY2F0aW9uID0+IGV4dGVuc2lvbkhvc3RNYW5hZ2VyLnJlcHJlc2VudHNSdW5uaW5nTG9jYXRpb24oZXh0UnVubmluZ0xvY2F0aW9uKSk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlQWZmaW5pdHkoaW5wdXRFeHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSwgZXh0ZW5zaW9uSG9zdEtpbmQ6IEV4dGVuc2lvbkhvc3RLaW5kLCBpc0luaXRpYWxBbGxvY2F0aW9uOiBib29sZWFuKTogeyBhZmZpbml0aWVzOiBFeHRlbnNpb25JZGVudGlmaWVyTWFwPG51bWJlcj47IG1heEFmZmluaXR5OiBudW1iZXIgfSB7XG5cdFx0Ly8gT25seSBhbmFseXplIGV4dGVuc2lvbnMgdGhhdCBjYW4gZXhlY3V0ZVxuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxJRXh0ZW5zaW9uRGVzY3JpcHRpb24+KCk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgaW5wdXRFeHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLm1haW4gfHwgZXh0ZW5zaW9uLmJyb3dzZXIpIHtcblx0XHRcdFx0ZXh0ZW5zaW9ucy5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEFsc28gYWRkIGV4aXN0aW5nIGV4dGVuc2lvbnMgb2YgdGhlIHNhbWUga2luZCB0aGF0IGNhbiBleGVjdXRlXG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgdGhpcy5fcmVnaXN0cnkuZ2V0QWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zKCkpIHtcblx0XHRcdGlmIChleHRlbnNpb24ubWFpbiB8fCBleHRlbnNpb24uYnJvd3Nlcikge1xuXHRcdFx0XHRjb25zdCBydW5uaW5nTG9jYXRpb24gPSB0aGlzLl9ydW5uaW5nTG9jYXRpb24uZ2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRcdFx0aWYgKHJ1bm5pbmdMb2NhdGlvbiAmJiBydW5uaW5nTG9jYXRpb24ua2luZCA9PT0gZXh0ZW5zaW9uSG9zdEtpbmQpIHtcblx0XHRcdFx0XHRleHRlbnNpb25zLnNldChleHRlbnNpb24uaWRlbnRpZmllciwgZXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEluaXRpYWxseSwgZWFjaCBleHRlbnNpb24gYmVsb25ncyB0byBpdHMgb3duIGdyb3VwXG5cdFx0Y29uc3QgZ3JvdXBzID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8bnVtYmVyPigpO1xuXHRcdGxldCBncm91cE51bWJlciA9IDA7XG5cdFx0Zm9yIChjb25zdCBbXywgZXh0ZW5zaW9uXSBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRncm91cHMuc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLCArK2dyb3VwTnVtYmVyKTtcblx0XHR9XG5cblx0XHRjb25zdCBjaGFuZ2VHcm91cCA9IChmcm9tOiBudW1iZXIsIHRvOiBudW1iZXIpID0+IHtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgZ3JvdXBdIG9mIGdyb3Vwcykge1xuXHRcdFx0XHRpZiAoZ3JvdXAgPT09IGZyb20pIHtcblx0XHRcdFx0XHRncm91cHMuc2V0KGtleSwgdG8pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIFdlIHdpbGwgZ3JvdXAgdGhpbmdzIHRvZ2V0aGVyIHdoZW4gdGhlcmUgYXJlIGRlcGVuZGVuY2llc1xuXHRcdGZvciAoY29uc3QgW18sIGV4dGVuc2lvbl0gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKCFleHRlbnNpb24uZXh0ZW5zaW9uRGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbXlHcm91cCA9IGdyb3Vwcy5nZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIpITtcblx0XHRcdGZvciAoY29uc3QgZGVwSWQgb2YgZXh0ZW5zaW9uLmV4dGVuc2lvbkRlcGVuZGVuY2llcykge1xuXHRcdFx0XHRjb25zdCBkZXBHcm91cCA9IGdyb3Vwcy5nZXQoZGVwSWQpO1xuXHRcdFx0XHRpZiAoIWRlcEdyb3VwKSB7XG5cdFx0XHRcdFx0Ly8gcHJvYmFibHkgY2FuJ3QgZXhlY3V0ZSwgc28gaXQgaGFzIG5vIGltcGFjdFxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGRlcEdyb3VwID09PSBteUdyb3VwKSB7XG5cdFx0XHRcdFx0Ly8gYWxyZWFkeSBpbiB0aGUgc2FtZSBncm91cFxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2hhbmdlR3JvdXAoZGVwR3JvdXAsIG15R3JvdXApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFdlIHdpbGwgYWxzbyBncm91cCB0aGluZ3MgdG9nZXRoZXIgd2hlbiB0aGVyZSBhcmUgZXh0ZW5zaW9uQWZmaW5pdHkgZGVjbGFyYXRpb25zXG5cdFx0Zm9yIChjb25zdCBbXywgZXh0ZW5zaW9uXSBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoIWV4dGVuc2lvbi5leHRlbnNpb25BZmZpbml0eSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnZXh0ZW5zaW9uQWZmaW5pdHknKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYEV4dGVuc2lvbiAnJHtleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX0nIGRlY2xhcmVzICdleHRlbnNpb25BZmZpbml0eScgaW4gaXRzIHBhY2thZ2UuanNvbiBidXQgZG9lcyBub3QgZW5hYmxlIHRoZSAnZXh0ZW5zaW9uQWZmaW5pdHknIEFQSSBwcm9wb3NhbC4gQWRkICdcImVuYWJsZWRBcGlQcm9wb3NhbHNcIjogW1wiZXh0ZW5zaW9uQWZmaW5pdHlcIl0nIHRvIHRoZSBleHRlbnNpb24ncyBwYWNrYWdlLmpzb24gdG8gdXNlIHRoaXMgZmVhdHVyZS5gKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBteUdyb3VwID0gZ3JvdXBzLmdldChleHRlbnNpb24uaWRlbnRpZmllcikhO1xuXHRcdFx0Zm9yIChjb25zdCBjb2xvY2F0ZUlkIG9mIGV4dGVuc2lvbi5leHRlbnNpb25BZmZpbml0eSkge1xuXHRcdFx0XHRjb25zdCBjb2xvY2F0ZUdyb3VwID0gZ3JvdXBzLmdldChjb2xvY2F0ZUlkKTtcblx0XHRcdFx0aWYgKCFjb2xvY2F0ZUdyb3VwKSB7XG5cdFx0XHRcdFx0Ly8gdGhlIGV4dGVuc2lvbiBpcyBub3QgaW5zdGFsbGVkIG9yIGNhbid0IGV4ZWN1dGUsIHNvIGl0IGhhcyBubyBpbXBhY3Rcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjb2xvY2F0ZUdyb3VwID09PSBteUdyb3VwKSB7XG5cdFx0XHRcdFx0Ly8gYWxyZWFkeSBpbiB0aGUgc2FtZSBncm91cFxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2hhbmdlR3JvdXAoY29sb2NhdGVHcm91cCwgbXlHcm91cCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSW5pdGlhbGl6ZSB3aXRoIGV4aXN0aW5nIGFmZmluaXRpZXNcblx0XHRjb25zdCByZXN1bHRpbmdBZmZpbml0aWVzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcblx0XHRsZXQgbGFzdEFmZmluaXR5ID0gMDtcblx0XHRmb3IgKGNvbnN0IFtfLCBleHRlbnNpb25dIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IHJ1bm5pbmdMb2NhdGlvbiA9IHRoaXMuX3J1bm5pbmdMb2NhdGlvbi5nZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0aWYgKHJ1bm5pbmdMb2NhdGlvbikge1xuXHRcdFx0XHRjb25zdCBncm91cCA9IGdyb3Vwcy5nZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIpITtcblx0XHRcdFx0cmVzdWx0aW5nQWZmaW5pdGllcy5zZXQoZ3JvdXAsIHJ1bm5pbmdMb2NhdGlvbi5hZmZpbml0eSk7XG5cdFx0XHRcdGxhc3RBZmZpbml0eSA9IE1hdGgubWF4KGxhc3RBZmZpbml0eSwgcnVubmluZ0xvY2F0aW9uLmFmZmluaXR5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBXaGVuIGRvaW5nIGV4dGVuc2lvbiBob3N0IGRlYnVnZ2luZywgd2Ugd2lsbCBpZ25vcmUgdGhlIGNvbmZpZ3VyZWQgYWZmaW5pdHlcblx0XHQvLyBiZWNhdXNlIHdlIGNhbiBjdXJyZW50bHkgZGVidWcgYSBzaW5nbGUgZXh0ZW5zaW9uIGhvc3Rcblx0XHRpZiAoIXRoaXMuX2Vudmlyb25tZW50U2VydmljZS5pc0V4dGVuc2lvbkRldmVsb3BtZW50KSB7XG5cdFx0XHQvLyBHbyB0aHJvdWdoIGVhY2ggY29uZmlndXJlZCBhZmZpbml0eSBhbmQgdHJ5IHRvIGFjY29tb2RhdGUgaXRcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRBZmZpbml0aWVzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBbZXh0ZW5zaW9uSWQ6IHN0cmluZ106IG51bWJlciB9IHwgdW5kZWZpbmVkPignZXh0ZW5zaW9ucy5leHBlcmltZW50YWwuYWZmaW5pdHknKSB8fCB7fTtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRFeHRlbnNpb25JZHMgPSBPYmplY3Qua2V5cyhjb25maWd1cmVkQWZmaW5pdGllcyk7XG5cdFx0XHRjb25zdCBjb25maWd1cmVkQWZmaW5pdHlUb1Jlc3VsdGluZ0FmZmluaXR5ID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uSWQgb2YgY29uZmlndXJlZEV4dGVuc2lvbklkcykge1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmVkQWZmaW5pdHkgPSBjb25maWd1cmVkQWZmaW5pdGllc1tleHRlbnNpb25JZF07XG5cdFx0XHRcdGlmICh0eXBlb2YgY29uZmlndXJlZEFmZmluaXR5ICE9PSAnbnVtYmVyJyB8fCBjb25maWd1cmVkQWZmaW5pdHkgPD0gMCB8fCBNYXRoLmZsb29yKGNvbmZpZ3VyZWRBZmZpbml0eSkgIT09IGNvbmZpZ3VyZWRBZmZpbml0eSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgSWdub3JpbmcgY29uZmlndXJlZCBhZmZpbml0eSBmb3IgJyR7ZXh0ZW5zaW9uSWR9JyBiZWNhdXNlIHRoZSB2YWx1ZSBpcyBub3QgYSBwb3NpdGl2ZSBpbnRlZ2VyLmApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGdyb3VwID0gZ3JvdXBzLmdldChleHRlbnNpb25JZCk7XG5cdFx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0XHQvLyBUaGUgZXh0ZW5zaW9uIGlzIG5vdCBrbm93biBvciBjYW5ub3QgZXhlY3V0ZSBmb3IgdGhpcyBleHRlbnNpb24gaG9zdCBraW5kXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBhZmZpbml0eTEgPSByZXN1bHRpbmdBZmZpbml0aWVzLmdldChncm91cCk7XG5cdFx0XHRcdGlmIChhZmZpbml0eTEpIHtcblx0XHRcdFx0XHQvLyBBZmZpbml0eSBmb3IgdGhpcyBncm91cCBpcyBhbHJlYWR5IGVzdGFibGlzaGVkXG5cdFx0XHRcdFx0Y29uZmlndXJlZEFmZmluaXR5VG9SZXN1bHRpbmdBZmZpbml0eS5zZXQoY29uZmlndXJlZEFmZmluaXR5LCBhZmZpbml0eTEpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYWZmaW5pdHkyID0gY29uZmlndXJlZEFmZmluaXR5VG9SZXN1bHRpbmdBZmZpbml0eS5nZXQoY29uZmlndXJlZEFmZmluaXR5KTtcblx0XHRcdFx0aWYgKGFmZmluaXR5Mikge1xuXHRcdFx0XHRcdC8vIEFmZmluaXR5IGZvciB0aGlzIGNvbmZpZ3VyYXRpb24gaXMgYWxyZWFkeSBlc3RhYmxpc2hlZFxuXHRcdFx0XHRcdHJlc3VsdGluZ0FmZmluaXRpZXMuc2V0KGdyb3VwLCBhZmZpbml0eTIpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFpc0luaXRpYWxBbGxvY2F0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBJZ25vcmluZyBjb25maWd1cmVkIGFmZmluaXR5IGZvciAnJHtleHRlbnNpb25JZH0nIGJlY2F1c2UgZXh0ZW5zaW9uIGhvc3QocykgYXJlIGFscmVhZHkgcnVubmluZy4gUmVsb2FkIHdpbmRvdy5gKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGFmZmluaXR5MyA9ICsrbGFzdEFmZmluaXR5O1xuXHRcdFx0XHRjb25maWd1cmVkQWZmaW5pdHlUb1Jlc3VsdGluZ0FmZmluaXR5LnNldChjb25maWd1cmVkQWZmaW5pdHksIGFmZmluaXR5Myk7XG5cdFx0XHRcdHJlc3VsdGluZ0FmZmluaXRpZXMuc2V0KGdyb3VwLCBhZmZpbml0eTMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPG51bWJlcj4oKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBpbnB1dEV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IGdyb3VwID0gZ3JvdXBzLmdldChleHRlbnNpb24uaWRlbnRpZmllcikgfHwgMDtcblx0XHRcdGNvbnN0IGFmZmluaXR5ID0gcmVzdWx0aW5nQWZmaW5pdGllcy5nZXQoZ3JvdXApIHx8IDA7XG5cdFx0XHRyZXN1bHQuc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLCBhZmZpbml0eSk7XG5cdFx0fVxuXG5cdFx0aWYgKGxhc3RBZmZpbml0eSA+IDAgJiYgaXNJbml0aWFsQWxsb2NhdGlvbikge1xuXHRcdFx0Zm9yIChsZXQgYWZmaW5pdHkgPSAxOyBhZmZpbml0eSA8PSBsYXN0QWZmaW5pdHk7IGFmZmluaXR5KyspIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWRzOiBFeHRlbnNpb25JZGVudGlmaWVyW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgaW5wdXRFeHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0aWYgKHJlc3VsdC5nZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIpID09PSBhZmZpbml0eSkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSWRzLnB1c2goZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFBsYWNpbmcgZXh0ZW5zaW9uKHMpICR7ZXh0ZW5zaW9uSWRzLm1hcChlID0+IGUudmFsdWUpLmpvaW4oJywgJyl9IG9uIGEgc2VwYXJhdGUgZXh0ZW5zaW9uIGhvc3QuYCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgYWZmaW5pdGllczogcmVzdWx0LCBtYXhBZmZpbml0eTogbGFzdEFmZmluaXR5IH07XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZVJ1bm5pbmdMb2NhdGlvbihsb2NhbEV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCByZW1vdGVFeHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSwgaXNJbml0aWFsQWxsb2NhdGlvbjogYm9vbGVhbik6IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8RXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uIHwgbnVsbD4ge1xuXHRcdHJldHVybiB0aGlzLl9kb0NvbXB1dGVSdW5uaW5nTG9jYXRpb24odGhpcy5fcnVubmluZ0xvY2F0aW9uLCBsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGlzSW5pdGlhbEFsbG9jYXRpb24pLnJ1bm5pbmdMb2NhdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgX2RvQ29tcHV0ZVJ1bm5pbmdMb2NhdGlvbihleGlzdGluZ1J1bm5pbmdMb2NhdGlvbjogRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24gfCBudWxsPiwgbG9jYWxFeHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSwgcmVtb3RlRXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIGlzSW5pdGlhbEFsbG9jYXRpb246IGJvb2xlYW4pOiB7IHJ1bm5pbmdMb2NhdGlvbjogRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24gfCBudWxsPjsgbWF4TG9jYWxQcm9jZXNzQWZmaW5pdHk6IG51bWJlcjsgbWF4TG9jYWxXZWJXb3JrZXJBZmZpbml0eTogbnVtYmVyIH0ge1xuXHRcdC8vIFNraXAgZXh0ZW5zaW9ucyB0aGF0IGhhdmUgYW4gZXhpc3RpbmcgcnVubmluZyBsb2NhdGlvblxuXHRcdGxvY2FsRXh0ZW5zaW9ucyA9IGxvY2FsRXh0ZW5zaW9ucy5maWx0ZXIoZXh0ZW5zaW9uID0+ICFleGlzdGluZ1J1bm5pbmdMb2NhdGlvbi5oYXMoZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRyZW1vdGVFeHRlbnNpb25zID0gcmVtb3RlRXh0ZW5zaW9ucy5maWx0ZXIoZXh0ZW5zaW9uID0+ICFleGlzdGluZ1J1bm5pbmdMb2NhdGlvbi5oYXMoZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbkhvc3RLaW5kcyA9IGRldGVybWluZUV4dGVuc2lvbkhvc3RLaW5kcyhcblx0XHRcdGxvY2FsRXh0ZW5zaW9ucyxcblx0XHRcdHJlbW90ZUV4dGVuc2lvbnMsXG5cdFx0XHQoZXh0ZW5zaW9uKSA9PiB0aGlzLnJlYWRFeHRlbnNpb25LaW5kcyhleHRlbnNpb24pLFxuXHRcdFx0KGV4dGVuc2lvbklkLCBleHRlbnNpb25LaW5kcywgaXNJbnN0YWxsZWRMb2NhbGx5LCBpc0luc3RhbGxlZFJlbW90ZWx5LCBwcmVmZXJlbmNlKSA9PiB0aGlzLl9leHRlbnNpb25Ib3N0S2luZFBpY2tlci5waWNrRXh0ZW5zaW9uSG9zdEtpbmQoZXh0ZW5zaW9uSWQsIGV4dGVuc2lvbktpbmRzLCBpc0luc3RhbGxlZExvY2FsbHksIGlzSW5zdGFsbGVkUmVtb3RlbHksIHByZWZlcmVuY2UpXG5cdFx0KTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxJRXh0ZW5zaW9uRGVzY3JpcHRpb24+KCk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgbG9jYWxFeHRlbnNpb25zKSB7XG5cdFx0XHRleHRlbnNpb25zLnNldChleHRlbnNpb24uaWRlbnRpZmllciwgZXh0ZW5zaW9uKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgcmVtb3RlRXh0ZW5zaW9ucykge1xuXHRcdFx0ZXh0ZW5zaW9ucy5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGV4dGVuc2lvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8RXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uIHwgbnVsbD4oKTtcblx0XHRjb25zdCBsb2NhbFByb2Nlc3NFeHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGxvY2FsV2ViV29ya2VyRXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtleHRlbnNpb25JZEtleSwgZXh0ZW5zaW9uSG9zdEtpbmRdIG9mIGV4dGVuc2lvbkhvc3RLaW5kcykge1xuXHRcdFx0bGV0IHJ1bm5pbmdMb2NhdGlvbjogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uSG9zdEtpbmQgPT09IEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsUHJvY2Vzcykge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25EZXNjcmlwdGlvbiA9IGV4dGVuc2lvbnMuZ2V0KGV4dGVuc2lvbklkS2V5KTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbkRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0bG9jYWxQcm9jZXNzRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbkRlc2NyaXB0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChleHRlbnNpb25Ib3N0S2luZCA9PT0gRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxXZWJXb3JrZXIpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uRGVzY3JpcHRpb24gPSBleHRlbnNpb25zLmdldChleHRlbnNpb25JZEtleSk7XG5cdFx0XHRcdGlmIChleHRlbnNpb25EZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdGxvY2FsV2ViV29ya2VyRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbkRlc2NyaXB0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChleHRlbnNpb25Ib3N0S2luZCA9PT0gRXh0ZW5zaW9uSG9zdEtpbmQuUmVtb3RlKSB7XG5cdFx0XHRcdHJ1bm5pbmdMb2NhdGlvbiA9IG5ldyBSZW1vdGVSdW5uaW5nTG9jYXRpb24oKTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5zZXQoZXh0ZW5zaW9uSWRLZXksIHJ1bm5pbmdMb2NhdGlvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBhZmZpbml0aWVzLCBtYXhBZmZpbml0eSB9ID0gdGhpcy5fY29tcHV0ZUFmZmluaXR5KGxvY2FsUHJvY2Vzc0V4dGVuc2lvbnMsIEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsUHJvY2VzcywgaXNJbml0aWFsQWxsb2NhdGlvbik7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgbG9jYWxQcm9jZXNzRXh0ZW5zaW9ucykge1xuXHRcdFx0Y29uc3QgYWZmaW5pdHkgPSBhZmZpbml0aWVzLmdldChleHRlbnNpb24uaWRlbnRpZmllcikgfHwgMDtcblx0XHRcdHJlc3VsdC5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIG5ldyBMb2NhbFByb2Nlc3NSdW5uaW5nTG9jYXRpb24oYWZmaW5pdHkpKTtcblx0XHR9XG5cdFx0Y29uc3QgeyBhZmZpbml0aWVzOiBsb2NhbFdlYldvcmtlckFmZmluaXRpZXMsIG1heEFmZmluaXR5OiBtYXhMb2NhbFdlYldvcmtlckFmZmluaXR5IH0gPSB0aGlzLl9jb21wdXRlQWZmaW5pdHkobG9jYWxXZWJXb3JrZXJFeHRlbnNpb25zLCBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFdlYldvcmtlciwgaXNJbml0aWFsQWxsb2NhdGlvbik7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgbG9jYWxXZWJXb3JrZXJFeHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBhZmZpbml0eSA9IGxvY2FsV2ViV29ya2VyQWZmaW5pdGllcy5nZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIpIHx8IDA7XG5cdFx0XHRyZXN1bHQuc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLCBuZXcgTG9jYWxXZWJXb3JrZXJSdW5uaW5nTG9jYXRpb24oYWZmaW5pdHkpKTtcblx0XHR9XG5cblx0XHQvLyBBZGQgZXh0ZW5zaW9ucyB0aGF0IGFscmVhZHkgaGF2ZSBhbiBleGlzdGluZyBydW5uaW5nIGxvY2F0aW9uXG5cdFx0Zm9yIChjb25zdCBbZXh0ZW5zaW9uSWRLZXksIHJ1bm5pbmdMb2NhdGlvbl0gb2YgZXhpc3RpbmdSdW5uaW5nTG9jYXRpb24pIHtcblx0XHRcdGlmIChydW5uaW5nTG9jYXRpb24pIHtcblx0XHRcdFx0cmVzdWx0LnNldChleHRlbnNpb25JZEtleSwgcnVubmluZ0xvY2F0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBydW5uaW5nTG9jYXRpb246IHJlc3VsdCwgbWF4TG9jYWxQcm9jZXNzQWZmaW5pdHk6IG1heEFmZmluaXR5LCBtYXhMb2NhbFdlYldvcmtlckFmZmluaXR5OiBtYXhMb2NhbFdlYldvcmtlckFmZmluaXR5IH07XG5cdH1cblxuXHRwdWJsaWMgaW5pdGlhbGl6ZVJ1bm5pbmdMb2NhdGlvbihsb2NhbEV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCByZW1vdGVFeHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IHsgcnVubmluZ0xvY2F0aW9uLCBtYXhMb2NhbFByb2Nlc3NBZmZpbml0eSwgbWF4TG9jYWxXZWJXb3JrZXJBZmZpbml0eSB9ID0gdGhpcy5fZG9Db21wdXRlUnVubmluZ0xvY2F0aW9uKHRoaXMuX3J1bm5pbmdMb2NhdGlvbiwgbG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCB0cnVlKTtcblx0XHR0aGlzLl9ydW5uaW5nTG9jYXRpb24gPSBydW5uaW5nTG9jYXRpb247XG5cdFx0dGhpcy5fbWF4TG9jYWxQcm9jZXNzQWZmaW5pdHkgPSBtYXhMb2NhbFByb2Nlc3NBZmZpbml0eTtcblx0XHR0aGlzLl9tYXhMb2NhbFdlYldvcmtlckFmZmluaXR5ID0gbWF4TG9jYWxXZWJXb3JrZXJBZmZpbml0eTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBydW5uaW5nIGxvY2F0aW9ucyBmb3IgdGhlIHJlbW92ZWQgZXh0ZW5zaW9ucy5cblx0ICovXG5cdHB1YmxpYyBkZWx0YUV4dGVuc2lvbnModG9BZGQ6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCB0b1JlbW92ZTogRXh0ZW5zaW9uSWRlbnRpZmllcltdKTogRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24gfCBudWxsPiB7XG5cdFx0Ly8gUmVtb3ZlIG9sZCBydW5uaW5nIGxvY2F0aW9uXG5cdFx0Y29uc3QgcmVtb3ZlZFJ1bm5pbmdMb2NhdGlvbiA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbiB8IG51bGw+KCk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb25JZCBvZiB0b1JlbW92ZSkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uS2V5ID0gZXh0ZW5zaW9uSWQ7XG5cdFx0XHRyZW1vdmVkUnVubmluZ0xvY2F0aW9uLnNldChleHRlbnNpb25LZXksIHRoaXMuX3J1bm5pbmdMb2NhdGlvbi5nZXQoZXh0ZW5zaW9uS2V5KSB8fCBudWxsKTtcblx0XHRcdHRoaXMuX3J1bm5pbmdMb2NhdGlvbi5kZWxldGUoZXh0ZW5zaW9uS2V5KTtcblx0XHR9XG5cblx0XHQvLyBEZXRlcm1pbmUgbmV3IHJ1bm5pbmcgbG9jYXRpb25cblx0XHR0aGlzLl91cGRhdGVSdW5uaW5nTG9jYXRpb25Gb3JBZGRlZEV4dGVuc2lvbnModG9BZGQpO1xuXG5cdFx0cmV0dXJuIHJlbW92ZWRSdW5uaW5nTG9jYXRpb247XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIGB0aGlzLl9ydW5uaW5nTG9jYXRpb25gIHdpdGggcnVubmluZyBsb2NhdGlvbnMgZm9yIG5ld2x5IGVuYWJsZWQvaW5zdGFsbGVkIGV4dGVuc2lvbnMuXG5cdCAqL1xuXHRwcml2YXRlIF91cGRhdGVSdW5uaW5nTG9jYXRpb25Gb3JBZGRlZEV4dGVuc2lvbnModG9BZGQ6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdKTogdm9pZCB7XG5cdFx0Ly8gRGV0ZXJtaW5lIG5ldyBydW5uaW5nIGxvY2F0aW9uXG5cdFx0Y29uc3QgbG9jYWxQcm9jZXNzRXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10gPSBbXTtcblx0XHRjb25zdCBsb2NhbFdlYldvcmtlckV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgdG9BZGQpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbktpbmQgPSB0aGlzLnJlYWRFeHRlbnNpb25LaW5kcyhleHRlbnNpb24pO1xuXHRcdFx0Y29uc3QgaXNSZW1vdGUgPSBleHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24uc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVJlbW90ZTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbkhvc3RLaW5kID0gdGhpcy5fZXh0ZW5zaW9uSG9zdEtpbmRQaWNrZXIucGlja0V4dGVuc2lvbkhvc3RLaW5kKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBleHRlbnNpb25LaW5kLCAhaXNSZW1vdGUsIGlzUmVtb3RlLCBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZS5Ob25lKTtcblx0XHRcdGxldCBydW5uaW5nTG9jYXRpb246IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbiB8IG51bGwgPSBudWxsO1xuXHRcdFx0aWYgKGV4dGVuc2lvbkhvc3RLaW5kID09PSBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFByb2Nlc3MpIHtcblx0XHRcdFx0bG9jYWxQcm9jZXNzRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHR9IGVsc2UgaWYgKGV4dGVuc2lvbkhvc3RLaW5kID09PSBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFdlYldvcmtlcikge1xuXHRcdFx0XHRsb2NhbFdlYldvcmtlckV4dGVuc2lvbnMucHVzaChleHRlbnNpb24pO1xuXHRcdFx0fSBlbHNlIGlmIChleHRlbnNpb25Ib3N0S2luZCA9PT0gRXh0ZW5zaW9uSG9zdEtpbmQuUmVtb3RlKSB7XG5cdFx0XHRcdHJ1bm5pbmdMb2NhdGlvbiA9IG5ldyBSZW1vdGVSdW5uaW5nTG9jYXRpb24oKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3J1bm5pbmdMb2NhdGlvbi5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHJ1bm5pbmdMb2NhdGlvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBhZmZpbml0aWVzIH0gPSB0aGlzLl9jb21wdXRlQWZmaW5pdHkobG9jYWxQcm9jZXNzRXh0ZW5zaW9ucywgRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzLCBmYWxzZSk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgbG9jYWxQcm9jZXNzRXh0ZW5zaW9ucykge1xuXHRcdFx0Y29uc3QgYWZmaW5pdHkgPSBhZmZpbml0aWVzLmdldChleHRlbnNpb24uaWRlbnRpZmllcikgfHwgMDtcblx0XHRcdHRoaXMuX3J1bm5pbmdMb2NhdGlvbi5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIG5ldyBMb2NhbFByb2Nlc3NSdW5uaW5nTG9jYXRpb24oYWZmaW5pdHkpKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGFmZmluaXRpZXM6IHdlYldvcmtlckV4dGVuc2lvbnNBZmZpbml0aWVzIH0gPSB0aGlzLl9jb21wdXRlQWZmaW5pdHkobG9jYWxXZWJXb3JrZXJFeHRlbnNpb25zLCBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFdlYldvcmtlciwgZmFsc2UpO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGxvY2FsV2ViV29ya2VyRXh0ZW5zaW9ucykge1xuXHRcdFx0Y29uc3QgYWZmaW5pdHkgPSB3ZWJXb3JrZXJFeHRlbnNpb25zQWZmaW5pdGllcy5nZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIpIHx8IDA7XG5cdFx0XHR0aGlzLl9ydW5uaW5nTG9jYXRpb24uc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLCBuZXcgTG9jYWxXZWJXb3JrZXJSdW5uaW5nTG9jYXRpb24oYWZmaW5pdHkpKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbHRlckV4dGVuc2lvbkRlc2NyaXB0aW9ucyhleHRlbnNpb25zOiByZWFkb25seSBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSwgcnVubmluZ0xvY2F0aW9uOiBFeHRlbnNpb25JZGVudGlmaWVyTWFwPEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbiB8IG51bGw+LCBwcmVkaWNhdGU6IChleHRSdW5uaW5nTG9jYXRpb246IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbikgPT4gYm9vbGVhbik6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdIHtcblx0cmV0dXJuIGV4dGVuc2lvbnMuZmlsdGVyKChleHQpID0+IHtcblx0XHRjb25zdCBleHRSdW5uaW5nTG9jYXRpb24gPSBydW5uaW5nTG9jYXRpb24uZ2V0KGV4dC5pZGVudGlmaWVyKTtcblx0XHRyZXR1cm4gZXh0UnVubmluZ0xvY2F0aW9uICYmIHByZWRpY2F0ZShleHRSdW5uaW5nTG9jYXRpb24pO1xuXHR9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbHRlckV4dGVuc2lvbklkZW50aWZpZXJzKGV4dGVuc2lvbnM6IHJlYWRvbmx5IEV4dGVuc2lvbklkZW50aWZpZXJbXSwgcnVubmluZ0xvY2F0aW9uOiBFeHRlbnNpb25JZGVudGlmaWVyTWFwPEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbiB8IG51bGw+LCBwcmVkaWNhdGU6IChleHRSdW5uaW5nTG9jYXRpb246IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbikgPT4gYm9vbGVhbik6IEV4dGVuc2lvbklkZW50aWZpZXJbXSB7XG5cdHJldHVybiBleHRlbnNpb25zLmZpbHRlcigoZXh0KSA9PiB7XG5cdFx0Y29uc3QgZXh0UnVubmluZ0xvY2F0aW9uID0gcnVubmluZ0xvY2F0aW9uLmdldChleHQpO1xuXHRcdHJldHVybiBleHRSdW5uaW5nTG9jYXRpb24gJiYgcHJlZGljYXRlKGV4dFJ1bm5pbmdMb2NhdGlvbik7XG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyw2QkFBNkI7QUFFdEMsU0FBOEIsOEJBQXFEO0FBQ25GLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsb0NBQW9DO0FBRTdDLFNBQVMsbUJBQW1CLDRCQUFzRCxtQ0FBbUM7QUFFckgsU0FBUywyQ0FBMkM7QUFDcEQsU0FBbUMsNkJBQTZCLCtCQUErQiw2QkFBNkI7QUFDNUgsU0FBUyw0QkFBNEI7QUFFOUIsSUFBTSxrQ0FBTixNQUFzQztBQUFBLEVBYzVDLFlBQ2tCLFdBQ0EsMEJBQzhCLHFCQUNQLHVCQUNWLGFBQ3dCLHFDQUNyRDtBQU5nQjtBQUNBO0FBQzhCO0FBQ1A7QUFDVjtBQUN3QjtBQWxCdkQsU0FBUSxtQkFBbUIsSUFBSSx1QkFBd0Q7QUFDdkYsU0FBUSwyQkFBbUM7QUFDM0MsU0FBUSw2QkFBcUM7QUFBQSxFQWlCekM7QUFBQSxFQWZKLElBQVcsMEJBQWtDO0FBQzVDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQVcsNEJBQW9DO0FBQzlDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQVdPLElBQUksYUFBa0MsaUJBQTJDO0FBQ3ZGLFNBQUssaUJBQWlCLElBQUksYUFBYSxlQUFlO0FB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
