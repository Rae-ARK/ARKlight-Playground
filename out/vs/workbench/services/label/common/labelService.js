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
import { localize } from "../../../../nls.js";
import { URI } from "../../../../base/common/uri.js";
import { Disposable, dispose } from "../../../../base/common/lifecycle.js";
import { posix, sep, win32 } from "../../../../base/common/path.js";
import { Emitter } from "../../../../base/common/event.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IWorkspaceContextService, isWorkspace, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, toWorkspaceIdentifier, WORKSPACE_EXTENSION, isUntitledWorkspace, isTemporaryWorkspace } from "../../../../platform/workspace/common/workspace.js";
import { basenameOrAuthority, basename, joinPath, dirname } from "../../../../base/common/resources.js";
import { tildify, getPathLabel } from "../../../../base/common/labels.js";
import { ILabelService, Verbosity } from "../../../../platform/label/common/label.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { match } from "../../../../base/common/glob.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IPathService } from "../../path/common/pathService.js";
import { isProposedApiEnabled } from "../../extensions/common/extensions.js";
import { OperatingSystem, OS } from "../../../../base/common/platform.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
import { Schemas } from "../../../../base/common/network.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Memento } from "../../../common/memento.js";
const resourceLabelFormattersExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "resourceLabelFormatters",
  jsonSchema: {
    description: localize("vscode.extension.contributes.resourceLabelFormatters", "Contributes resource label formatting rules."),
    type: "array",
    items: {
      type: "object",
      required: ["scheme", "formatting"],
      properties: {
        scheme: {
          type: "string",
          description: localize("vscode.extension.contributes.resourceLabelFormatters.scheme", 'URI scheme on which to match the formatter on. For example "file". Simple glob patterns are supported.')
        },
        authority: {
          type: "string",
          description: localize("vscode.extension.contributes.resourceLabelFormatters.authority", "URI authority on which to match the formatter on. Simple glob patterns are supported.")
        },
        formatting: {
          description: localize("vscode.extension.contributes.resourceLabelFormatters.formatting", "Rules for formatting uri resource labels."),
          type: "object",
          properties: {
            label: {
              type: "string",
              description: localize("vscode.extension.contributes.resourceLabelFormatters.label", "Label rules to display. For example: myLabel:/${path}. ${path}, ${scheme}, ${authority} and ${authoritySuffix} are supported as variables.")
            },
            separator: {
              type: "string",
              description: localize("vscode.extension.contributes.resourceLabelFormatters.separator", "Separator to be used in the uri label display. '/' or '' as an example.")
            },
            stripPathStartingSeparator: {
              type: "boolean",
              description: localize("vscode.extension.contributes.resourceLabelFormatters.stripPathStartingSeparator", "Controls whether `${path}` substitutions should have starting separator characters stripped.")
            },
            tildify: {
              type: "boolean",
              description: localize("vscode.extension.contributes.resourceLabelFormatters.tildify", "Controls if the start of the uri label should be tildified when possible.")
            },
            workspaceSuffix: {
              type: "string",
              description: localize("vscode.extension.contributes.resourceLabelFormatters.formatting.workspaceSuffix", "Suffix appended to the workspace label.")
            }
          }
        }
      }
    }
  }
});
const posixPathSeparatorRegexp = /\//g;
const winPathSeparatorRegexp = /[\\\/]/g;
const labelMatchingRegexp = /\$\{(scheme|authoritySuffix|authority|path|(query)\.(.+?))\}/g;
function hasDriveLetterIgnorePlatform(path) {
  return !!(path && path[2] === ":");
}
let ResourceLabelFormattersHandler = class {
  constructor(labelService) {
    this.formattersDisposables = /* @__PURE__ */ new Map();
    resourceLabelFormattersExtPoint.setHandler((extensions, delta) => {
      for (const added of delta.added) {
        for (const untrustedFormatter of added.value) {
          const formatter = { ...untrustedFormatter };
          if (typeof formatter.formatting.label !== "string") {
            formatter.formatting.label = "${authority}${path}";
          }
          if (typeof formatter.formatting.separator !== `string`) {
            formatter.formatting.separator = sep;
          }
          if (!isProposedApiEnabled(added.description, "contribLabelFormatterWorkspaceTooltip") && formatter.formatting.workspaceTooltip) {
            formatter.formatting.workspaceTooltip = void 0;
          }
          this.formattersDisposables.set(formatter, labelService.registerFormatter(formatter));
        }
      }
      for (const removed of delta.removed) {
        for (const formatter of removed.value) {
          dispose(this.formattersDisposables.get(formatter));
        }
      }
    });
  }
};
ResourceLabelFormattersHandler = __decorateClass([
  __decorateParam(0, ILabelService)
], ResourceLabelFormattersHandler);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ResourceLabelFormattersHandler, LifecyclePhase.Restored);
const FORMATTER_CACHE_SIZE = 50;
let LabelService = class extends Disposable {
  constructor(environmentService, contextService, pathService, remoteAgentService, storageService, lifecycleService) {
    super();
    this.environmentService = environmentService;
    this.contextService = contextService;
    this.pathService = pathService;
    this.remoteAgentService = remoteAgentService;
    this._onDidChangeFormatters = this._register(new Emitter({ leakWarningThreshold: 400, leakWarningName: "LabelService._onDidChangeFormatters" }));
    this.onDidChangeFormatters = this._onDidChangeFormatters.event;
    this.os = OS;
    this.userHome = pathService.defaultUriScheme === Schemas.file ? this.pathService.userHome({ preferLocal: true }) : void 0;
    const memento = this.storedFormattersMemento = new Memento("cachedResourceLabelFormatters2", storageService);
    this.storedFormatters = memento.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
    this.formatters = this.storedFormatters?.formatters?.slice() || [];
    this.resolveRemoteEnvironment();
  }
  async resolveRemoteEnvironment() {
    const env = await this.remoteAgentService.getEnvironment();
    this.os = env?.os ?? OS;
    this.userHome = await this.pathService.userHome();
  }
  findFormatting(resource) {
    let bestResult;
    for (const formatter of this.formatters) {
      if (formatter.scheme === resource.scheme) {
        if (!formatter.authority && (!bestResult || formatter.priority)) {
          bestResult = formatter;
          continue;
        }
        if (!formatter.authority) {
          continue;
        }
        if (match(formatter.authority, resource.authority, { ignoreCase: true }) && (!bestResult?.authority || formatter.authority.length > bestResult.authority.length || formatter.authority.length === bestResult.authority.length && formatter.priority)) {
          bestResult = formatter;
        }
      }
    }
    return bestResult ? bestResult.formatting : void 0;
  }
  getUriLabel(resource, options = {}) {
    let formatting = this.findFormatting(resource);
    if (formatting && options.separator) {
      formatting = { ...formatting, separator: options.separator };
    }
    let label = this.doGetUriLabel(resource, formatting, options);
    if (!formatting && options.separator) {
      label = this.adjustPathSeparators(label, options.separator);
    }
    if (options.appendWorkspaceSuffix && formatting?.workspaceSuffix) {
      label = this.appendWorkspaceSuffix(label, resource);
    }
    return label;
  }
  doGetUriLabel(resource, formatting, options = {}) {
    if (!formatting) {
      return getPathLabel(resource, {
        os: this.os,
        tildify: this.userHome ? { userHome: this.userHome } : void 0,
        relative: options.relative ? {
          noPrefix: options.noPrefix,
          getWorkspace: () => this.contextService.getWorkspace(),
          getWorkspaceFolder: (resource2) => this.contextService.getWorkspaceFolder(resource2)
        } : void 0
      });
    }
    if (options.relative && this.contextService) {
      let folder = this.contextService.getWorkspaceFolder(resource);
      if (!folder) {
        const workspace = this.contextService.getWorkspace();
        const firstFolder = workspace.folders.at(0);
        if (firstFolder && resource.scheme !== firstFolder.uri.scheme && resource.path.startsWith(posix.sep)) {
          folder = this.contextService.getWorkspaceFolder(firstFolder.uri.with({ path: resource.path }));
        }
      }
      if (folder) {
        const folderLabel = this.formatUri(folder.uri, formatting, options.noPrefix);
        let relativeLabel = this.formatUri(resource, formatting, options.noPrefix);
        let overlap = 0;
        while (relativeLabel[overlap] && relativeLabel[overlap] === folderLabel[overlap]) {
          overlap++;
        }
        if (!relativeLabel[overlap] || relativeLabel[overlap] === formatting.separator) {
          relativeLabel = relativeLabel.substring(1 + overlap);
        } else if (overlap === folderLabel.length && folder.uri.path === posix.sep) {
          relativeLabel = relativeLabel.substring(overlap);
        }
        const hasMultipleRoots = this.contextService.getWorkspace().folders.length > 1;
        if (hasMultipleRoots && !options.noPrefix) {
          const rootName = folder?.name ?? basenameOrAuthority(folder.uri);
          relativeLabel = relativeLabel ? `${rootName} \u2022 ${relativeLabel}` : rootName;
        }
        return relativeLabel;
      }
    }
    return this.formatUri(resource, formatting, options.noPrefix);
  }
  getUriBasenameLabel(resource) {
    const formatting = this.findFormatting(resource);
    const label = this.doGetUriLabel(resource, formatting);
    let pathLib;
    if (formatting?.separator === win32.sep) {
      pathLib = win32;
    } else if (formatting?.separator === posix.sep) {
      pathLib = posix;
    } else {
      pathLib = this.os === OperatingSystem.Windows ? win32 : posix;
    }
    return pathLib.basename(label);
  }
  getWorkspaceLabel(workspace, options) {
    if (isWorkspace(workspace)) {
      const identifier = toWorkspaceIdentifier(workspace);
      if (isSingleFolderWorkspaceIdentifier(identifier) || isWorkspaceIdentifier(identifier)) {
        return this.getWorkspaceLabel(identifier, options);
      }
      return "";
    }
    if (URI.isUri(workspace)) {
      return this.doGetSingleFolderWorkspaceLabel(workspace, options);
    }
    if (isSingleFolderWorkspaceIdentifier(workspace)) {
      return this.doGetSingleFolderWorkspaceLabel(workspace.uri, options);
    }
    if (isWorkspaceIdentifier(workspace)) {
      return this.doGetWorkspaceLabel(workspace.configPath, options);
    }
    return "";
  }
  doGetWorkspaceLabel(workspaceUri, options) {
    if (isUntitledWorkspace(workspaceUri, this.environmentService)) {
      return localize("untitledWorkspace", "Untitled (Workspace)");
    }
    if (isTemporaryWorkspace(workspaceUri)) {
      return localize("temporaryWorkspace", "Workspace");
    }
    let filename = basename(workspaceUri);
    if (filename.endsWith(WORKSPACE_EXTENSION)) {
      filename = filename.substr(0, filename.length - WORKSPACE_EXTENSION.length - 1);
    }
    let label;
    switch (options?.verbose) {
      case Verbosity.SHORT:
        label = filename;
        break;
      case Verbosity.LONG:
        label = localize("workspaceNameVerbose", "{0} (Workspace)", this.getUriLabel(joinPath(dirname(workspaceUri), filename)));
        break;
      case Verbosity.MEDIUM:
      default:
        label = localize("workspaceName", "{0} (Workspace)", filename);
        break;
    }
    if (options?.verbose === Verbosity.SHORT) {
      return label;
    }
    return this.appendWorkspaceSuffix(label, workspaceUri);
  }
  doGetSingleFolderWorkspaceLabel(folderUri, options) {
    let label;
    switch (options?.verbose) {
      case Verbosity.LONG:
        label = this.getUriLabel(folderUri);
        break;
      case Verbosity.SHORT:
      case Verbosity.MEDIUM:
      default:
        label = basename(folderUri) || posix.sep;
        break;
    }
    if (options?.verbose === Verbosity.SHORT) {
      return label;
    }
    return this.appendWorkspaceSuffix(label, folderUri);
  }
  getSeparator(scheme, authority) {
    const formatter = this.findFormatting(URI.from({ scheme, authority }));
    return formatter?.separator || posix.sep;
  }
  getHostLabel(scheme, authority) {
    const formatter = this.findFormatting(URI.from({ scheme, authority }));
    return formatter?.workspaceSuffix || authority || "";
  }
  getHostTooltip(scheme, authority) {
    const formatter = this.findFormatting(URI.from({ scheme, authority }));
    return formatter?.workspaceTooltip;
  }
  registerCachedFormatter(formatter) {
    const list = this.storedFormatters.formatters ??= [];
    let replace = list.findIndex((f) => f.scheme === formatter.scheme && f.authority === formatter.authority);
    if (replace === -1 && list.length >= FORMATTER_CACHE_SIZE) {
      replace = FORMATTER_CACHE_SIZE - 1;
    }
    if (replace === -1) {
      list.unshift(formatter);
    } else {
      for (let i = replace; i > 0; i--) {
        list[i] = list[i - 1];
      }
      list[0] = formatter;
    }
    this.storedFormattersMemento.saveMemento();
    return this.registerFormatter(formatter);
  }
  registerFormatter(formatter) {
    this.formatters.push(formatter);
    this._onDidChangeFormatters.fire({ scheme: formatter.scheme });
    return {
      dispose: () => {
        this.formatters = this.formatters.filter((f) => f !== formatter);
        this._onDidChangeFormatters.fire({ scheme: formatter.scheme });
      }
    };
  }
  formatUri(resource, formatting, forceNoTildify) {
    let label = formatting.label.replace(labelMatchingRegexp, (match2, token, qsToken, qsValue) => {
      switch (token) {
        case "scheme":
          return resource.scheme;
        case "authority":
          return resource.authority;
        case "authoritySuffix": {
          const i = resource.authority.indexOf("+");
          return i === -1 ? resource.authority : resource.authority.slice(i + 1);
        }
        case "path": {
          let pathValue = resource.path;
          if (formatting.stripPathSegments) {
            let pos = 0;
            for (let i = 0; i < formatting.stripPathSegments; i++) {
              const next = pathValue.indexOf("/", pos + 1);
              if (next === -1) {
                break;
              }
              pos = next;
            }
            pathValue = pathValue.substring(pos);
          }
          return formatting.stripPathStartingSeparator ? pathValue.slice(pathValue[0] === formatting.separator ? 1 : 0) : pathValue;
        }
        default: {
          if (qsToken === "query") {
            const { query } = resource;
            if (query && query[0] === "{" && query[query.length - 1] === "}") {
              try {
                return JSON.parse(query)[qsValue] || "";
              } catch {
              }
            }
          }
          return "";
        }
      }
    });
    if (formatting.normalizeDriveLetter && hasDriveLetterIgnorePlatform(label)) {
      label = label.charAt(1).toUpperCase() + label.substr(2);
    }
    if (formatting.tildify && !forceNoTildify) {
      if (this.userHome) {
        label = tildify(label, this.userHome.fsPath, this.os);
      }
    }
    if (formatting.authorityPrefix && resource.authority) {
      label = formatting.authorityPrefix + label;
    }
    return this.adjustPathSeparators(label, formatting.separator);
  }
  adjustPathSeparators(label, separator) {
    return label.replace(this.os === OperatingSystem.Windows ? winPathSeparatorRegexp : posixPathSeparatorRegexp, separator);
  }
  appendWorkspaceSuffix(label, uri) {
    const formatting = this.findFormatting(uri);
    const suffix = formatting && typeof formatting.workspaceSuffix === "string" ? formatting.workspaceSuffix : void 0;
    return suffix ? `${label} [${suffix}]` : label;
  }
};
LabelService = __decorateClass([
  __decorateParam(0, IWorkbenchEnvironmentService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IPathService),
  __decorateParam(3, IRemoteAgentService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, ILifecycleService)
], LabelService);
registerSingleton(ILabelService, LabelService, InstantiationType.Delayed);
export {
  LabelService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYWJlbC9jb21tb24vbGFiZWxTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHBvc2l4LCBzZXAsIHdpbjMyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlLCBpc1dvcmtzcGFjZSwgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIsIGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgaXNXb3Jrc3BhY2VJZGVudGlmaWVyLCBJV29ya3NwYWNlSWRlbnRpZmllciwgdG9Xb3Jrc3BhY2VJZGVudGlmaWVyLCBXT1JLU1BBQ0VfRVhURU5TSU9OLCBpc1VudGl0bGVkV29ya3NwYWNlLCBpc1RlbXBvcmFyeVdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lT3JBdXRob3JpdHksIGJhc2VuYW1lLCBqb2luUGF0aCwgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyB0aWxkaWZ5LCBnZXRQYXRoTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSwgUmVzb3VyY2VMYWJlbEZvcm1hdHRlciwgUmVzb3VyY2VMYWJlbEZvcm1hdHRpbmcsIElGb3JtYXR0ZXJDaGFuZ2VFdmVudCwgVmVyYm9zaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBtYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtLCBPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgTWVtZW50byB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tZW1lbnRvLmpzJztcblxuY29uc3QgcmVzb3VyY2VMYWJlbEZvcm1hdHRlcnNFeHRQb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PFJlc291cmNlTGFiZWxGb3JtYXR0ZXJbXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ3Jlc291cmNlTGFiZWxGb3JtYXR0ZXJzJyxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5yZXNvdXJjZUxhYmVsRm9ybWF0dGVycycsICdDb250cmlidXRlcyByZXNvdXJjZSBsYWJlbCBmb3JtYXR0aW5nIHJ1bGVzLicpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cmVxdWlyZWQ6IFsnc2NoZW1lJywgJ2Zvcm1hdHRpbmcnXSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0c2NoZW1lOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnJlc291cmNlTGFiZWxGb3JtYXR0ZXJzLnNjaGVtZScsICdVUkkgc2NoZW1lIG9uIHdoaWNoIHRvIG1hdGNoIHRoZSBmb3JtYXR0ZXIgb24uIEZvciBleGFtcGxlIFwiZmlsZVwiLiBTaW1wbGUgZ2xvYiBwYXR0ZXJucyBhcmUgc3VwcG9ydGVkLicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhdXRob3JpdHk6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMucmVzb3VyY2VMYWJlbEZvcm1hdHRlcnMuYXV0aG9yaXR5JywgJ1VSSSBhdXRob3JpdHkgb24gd2hpY2ggdG8gbWF0Y2ggdGhlIGZvcm1hdHRlciBvbi4gU2ltcGxlIGdsb2IgcGF0dGVybnMgYXJlIHN1cHBvcnRlZC4nKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9ybWF0dGluZzoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5yZXNvdXJjZUxhYmVsRm9ybWF0dGVycy5mb3JtYXR0aW5nJywgXCJSdWxlcyBmb3IgZm9ybWF0dGluZyB1cmkgcmVzb3VyY2UgbGFiZWxzLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRsYWJlbDoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnJlc291cmNlTGFiZWxGb3JtYXR0ZXJzLmxhYmVsJywgXCJMYWJlbCBydWxlcyB0byBkaXNwbGF5LiBGb3IgZXhhbXBsZTogbXlMYWJlbDovJHtwYXRofS4gJHtwYXRofSwgJHtzY2hlbWV9LCAke2F1dGhvcml0eX0gYW5kICR7YXV0aG9yaXR5U3VmZml4fSBhcmUgc3VwcG9ydGVkIGFzIHZhcmlhYmxlcy5cIilcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzZXBhcmF0b3I6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5yZXNvdXJjZUxhYmVsRm9ybWF0dGVycy5zZXBhcmF0b3InLCBcIlNlcGFyYXRvciB0byBiZSB1c2VkIGluIHRoZSB1cmkgbGFiZWwgZGlzcGxheS4gJy8nIG9yICdcXCcgYXMgYW4gZXhhbXBsZS5cIilcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzdHJpcFBhdGhTdGFydGluZ1NlcGFyYXRvcjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5yZXNvdXJjZUxhYmVsRm9ybWF0dGVycy5zdHJpcFBhdGhTdGFydGluZ1NlcGFyYXRvcicsIFwiQ29udHJvbHMgd2hldGhlciBgJHtwYXRofWAgc3Vic3RpdHV0aW9ucyBzaG91bGQgaGF2ZSBzdGFydGluZyBzZXBhcmF0b3IgY2hhcmFjdGVycyBzdHJpcHBlZC5cIilcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR0aWxkaWZ5OiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnJlc291cmNlTGFiZWxGb3JtYXR0ZXJzLnRpbGRpZnknLCBcIkNvbnRyb2xzIGlmIHRoZSBzdGFydCBvZiB0aGUgdXJpIGxhYmVsIHNob3VsZCBiZSB0aWxkaWZpZWQgd2hlbiBwb3NzaWJsZS5cIilcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2VTdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5yZXNvdXJjZUxhYmVsRm9ybWF0dGVycy5mb3JtYXR0aW5nLndvcmtzcGFjZVN1ZmZpeCcsIFwiU3VmZml4IGFwcGVuZGVkIHRvIHRoZSB3b3Jrc3BhY2UgbGFiZWwuXCIpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuY29uc3QgcG9zaXhQYXRoU2VwYXJhdG9yUmVnZXhwID0gL1xcLy9nOyAvLyBvbiBVbml4LCBiYWNrc2xhc2ggaXMgYSB2YWxpZCBmaWxlbmFtZSBjaGFyYWN0ZXJcbmNvbnN0IHdpblBhdGhTZXBhcmF0b3JSZWdleHAgPSAvW1xcXFxcXC9dL2c7IC8vIG9uIFdpbmRvd3MsIG5laXRoZXIgc2xhc2ggbm9yIGJhY2tzbGFzaCBhcmUgdmFsaWQgZmlsZW5hbWUgY2hhcmFjdGVyc1xuY29uc3QgbGFiZWxNYXRjaGluZ1JlZ2V4cCA9IC9cXCRcXHsoc2NoZW1lfGF1dGhvcml0eVN1ZmZpeHxhdXRob3JpdHl8cGF0aHwocXVlcnkpXFwuKC4rPykpXFx9L2c7XG5cbmZ1bmN0aW9uIGhhc0RyaXZlTGV0dGVySWdub3JlUGxhdGZvcm0ocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAhIShwYXRoICYmIHBhdGhbMl0gPT09ICc6Jyk7XG59XG5cbmNsYXNzIFJlc291cmNlTGFiZWxGb3JtYXR0ZXJzSGFuZGxlciBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZm9ybWF0dGVyc0Rpc3Bvc2FibGVzID0gbmV3IE1hcDxSZXNvdXJjZUxhYmVsRm9ybWF0dGVyLCBJRGlzcG9zYWJsZT4oKTtcblxuXHRjb25zdHJ1Y3RvcihASUxhYmVsU2VydmljZSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UpIHtcblx0XHRyZXNvdXJjZUxhYmVsRm9ybWF0dGVyc0V4dFBvaW50LnNldEhhbmRsZXIoKGV4dGVuc2lvbnMsIGRlbHRhKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGFkZGVkIG9mIGRlbHRhLmFkZGVkKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdW50cnVzdGVkRm9ybWF0dGVyIG9mIGFkZGVkLnZhbHVlKSB7XG5cblx0XHRcdFx0XHQvLyBXZSBjYW5ub3QgdHJ1c3QgdGhhdCB0aGUgZm9ybWF0dGVyIGFzIGl0IGNvbWVzIGZyb20gYW4gZXh0ZW5zaW9uXG5cdFx0XHRcdFx0Ly8gYWRoZXJlcyB0byBvdXIgaW50ZXJmYWNlLCBzbyBmb3IgdGhlIHJlcXVpcmVkIHByb3BlcnRpZXMgd2UgZmlsbFxuXHRcdFx0XHRcdC8vIGluIHNvbWUgZGVmYXVsdHMgaWYgbWlzc2luZy5cblxuXHRcdFx0XHRcdGNvbnN0IGZvcm1hdHRlciA9IHsgLi4udW50cnVzdGVkRm9ybWF0dGVyIH07XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBmb3JtYXR0ZXIuZm9ybWF0dGluZy5sYWJlbCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGZvcm1hdHRlci5mb3JtYXR0aW5nLmxhYmVsID0gJyR7YXV0aG9yaXR5fSR7cGF0aH0nO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodHlwZW9mIGZvcm1hdHRlci5mb3JtYXR0aW5nLnNlcGFyYXRvciAhPT0gYHN0cmluZ2ApIHtcblx0XHRcdFx0XHRcdGZvcm1hdHRlci5mb3JtYXR0aW5nLnNlcGFyYXRvciA9IHNlcDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIWlzUHJvcG9zZWRBcGlFbmFibGVkKGFkZGVkLmRlc2NyaXB0aW9uLCAnY29udHJpYkxhYmVsRm9ybWF0dGVyV29ya3NwYWNlVG9vbHRpcCcpICYmIGZvcm1hdHRlci5mb3JtYXR0aW5nLndvcmtzcGFjZVRvb2x0aXApIHtcblx0XHRcdFx0XHRcdGZvcm1hdHRlci5mb3JtYXR0aW5nLndvcmtzcGFjZVRvb2x0aXAgPSB1bmRlZmluZWQ7IC8vIHdvcmtzcGFjZVRvb2x0aXAgaXMgb25seSBwcm9wb3NlZFxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuZm9ybWF0dGVyc0Rpc3Bvc2FibGVzLnNldChmb3JtYXR0ZXIsIGxhYmVsU2VydmljZS5yZWdpc3RlckZvcm1hdHRlcihmb3JtYXR0ZXIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHJlbW92ZWQgb2YgZGVsdGEucmVtb3ZlZCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGZvcm1hdHRlciBvZiByZW1vdmVkLnZhbHVlKSB7XG5cdFx0XHRcdFx0ZGlzcG9zZSh0aGlzLmZvcm1hdHRlcnNEaXNwb3NhYmxlcy5nZXQoZm9ybWF0dGVyKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFJlc291cmNlTGFiZWxGb3JtYXR0ZXJzSGFuZGxlciwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuXG5jb25zdCBGT1JNQVRURVJfQ0FDSEVfU0laRSA9IDUwO1xuXG5pbnRlcmZhY2UgSVN0b3JlZEZvcm1hdHRlcnMge1xuXHRmb3JtYXR0ZXJzPzogUmVzb3VyY2VMYWJlbEZvcm1hdHRlcltdO1xuXHRpPzogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgTGFiZWxTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElMYWJlbFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgZm9ybWF0dGVyczogUmVzb3VyY2VMYWJlbEZvcm1hdHRlcltdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRm9ybWF0dGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElGb3JtYXR0ZXJDaGFuZ2VFdmVudD4oeyBsZWFrV2FybmluZ1RocmVzaG9sZDogNDAwLCBsZWFrV2FybmluZ05hbWU6ICdMYWJlbFNlcnZpY2UuX29uRGlkQ2hhbmdlRm9ybWF0dGVycycgfSkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZvcm1hdHRlcnMgPSB0aGlzLl9vbkRpZENoYW5nZUZvcm1hdHRlcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzdG9yZWRGb3JtYXR0ZXJzTWVtZW50bzogTWVtZW50bzxJU3RvcmVkRm9ybWF0dGVycz47XG5cdHByaXZhdGUgcmVhZG9ubHkgc3RvcmVkRm9ybWF0dGVyczogSVN0b3JlZEZvcm1hdHRlcnM7XG5cdHByaXZhdGUgb3M6IE9wZXJhdGluZ1N5c3RlbTtcblx0cHJpdmF0ZSB1c2VySG9tZTogVVJJIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBGaW5kIHNvbWUgbWVhbmluZ2Z1bCBkZWZhdWx0cyB1bnRpbCB0aGUgcmVtb3RlIGVudmlyb25tZW50XG5cdFx0Ly8gaXMgcmVzb2x2ZWQsIGJ5IHRha2luZyB0aGUgY3VycmVudCBPUyB3ZSBhcmUgcnVubmluZyBpblxuXHRcdC8vIGFuZCBieSB0YWtpbmcgdGhlIGxvY2FsIGB1c2VySG9tZWAgaWYgd2UgcnVuIG9uIGEgbG9jYWxcblx0XHQvLyBmaWxlIHNjaGVtZS5cblx0XHR0aGlzLm9zID0gT1M7XG5cdFx0dGhpcy51c2VySG9tZSA9IHBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/IHRoaXMucGF0aFNlcnZpY2UudXNlckhvbWUoeyBwcmVmZXJMb2NhbDogdHJ1ZSB9KSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IG1lbWVudG8gPSB0aGlzLnN0b3JlZEZvcm1hdHRlcnNNZW1lbnRvID0gbmV3IE1lbWVudG8oJ2NhY2hlZFJlc291cmNlTGFiZWxGb3JtYXR0ZXJzMicsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLnN0b3JlZEZvcm1hdHRlcnMgPSBtZW1lbnRvLmdldE1lbWVudG8oU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0dGhpcy5mb3JtYXR0ZXJzID0gdGhpcy5zdG9yZWRGb3JtYXR0ZXJzPy5mb3JtYXR0ZXJzPy5zbGljZSgpIHx8IFtdO1xuXG5cdFx0Ly8gUmVtb3RlIGVudmlyb25tZW50IGlzIHBvdGVudGlhbGx5IGxvbmcgcnVubmluZ1xuXHRcdHRoaXMucmVzb2x2ZVJlbW90ZUVudmlyb25tZW50KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVSZW1vdGVFbnZpcm9ubWVudCgpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIE9TXG5cdFx0Y29uc3QgZW52ID0gYXdhaXQgdGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKTtcblx0XHR0aGlzLm9zID0gZW52Py5vcyA/PyBPUztcblxuXHRcdC8vIFVzZXIgaG9tZVxuXHRcdHRoaXMudXNlckhvbWUgPSBhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLnVzZXJIb21lKCk7XG5cdH1cblxuXHRmaW5kRm9ybWF0dGluZyhyZXNvdXJjZTogVVJJKTogUmVzb3VyY2VMYWJlbEZvcm1hdHRpbmcgfCB1bmRlZmluZWQge1xuXHRcdGxldCBiZXN0UmVzdWx0OiBSZXNvdXJjZUxhYmVsRm9ybWF0dGVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChjb25zdCBmb3JtYXR0ZXIgb2YgdGhpcy5mb3JtYXR0ZXJzKSB7XG5cdFx0XHRpZiAoZm9ybWF0dGVyLnNjaGVtZSA9PT0gcmVzb3VyY2Uuc2NoZW1lKSB7XG5cdFx0XHRcdGlmICghZm9ybWF0dGVyLmF1dGhvcml0eSAmJiAoIWJlc3RSZXN1bHQgfHwgZm9ybWF0dGVyLnByaW9yaXR5KSkge1xuXHRcdFx0XHRcdGJlc3RSZXN1bHQgPSBmb3JtYXR0ZXI7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWZvcm1hdHRlci5hdXRob3JpdHkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChtYXRjaChmb3JtYXR0ZXIuYXV0aG9yaXR5LCByZXNvdXJjZS5hdXRob3JpdHksIHsgaWdub3JlQ2FzZTogdHJ1ZSB9KSAmJlxuXHRcdFx0XHRcdChcblx0XHRcdFx0XHRcdCFiZXN0UmVzdWx0Py5hdXRob3JpdHkgfHxcblx0XHRcdFx0XHRcdGZvcm1hdHRlci5hdXRob3JpdHkubGVuZ3RoID4gYmVzdFJlc3VsdC5hdXRob3JpdHkubGVuZ3RoIHx8XG5cdFx0XHRcdFx0XHQoKGZvcm1hdHRlci5hdXRob3JpdHkubGVuZ3RoID09PSBiZXN0UmVzdWx0LmF1dGhvcml0eS5sZW5ndGgpICYmIGZvcm1hdHRlci5wcmlvcml0eSlcblx0XHRcdFx0XHQpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGJlc3RSZXN1bHQgPSBmb3JtYXR0ZXI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gYmVzdFJlc3VsdCA/IGJlc3RSZXN1bHQuZm9ybWF0dGluZyA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldFVyaUxhYmVsKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IHsgcmVsYXRpdmU/OiBib29sZWFuOyBub1ByZWZpeD86IGJvb2xlYW47IHNlcGFyYXRvcj86ICcvJyB8ICdcXFxcJzsgYXBwZW5kV29ya3NwYWNlU3VmZml4PzogYm9vbGVhbiB9ID0ge30pOiBzdHJpbmcge1xuXHRcdGxldCBmb3JtYXR0aW5nID0gdGhpcy5maW5kRm9ybWF0dGluZyhyZXNvdXJjZSk7XG5cdFx0aWYgKGZvcm1hdHRpbmcgJiYgb3B0aW9ucy5zZXBhcmF0b3IpIHtcblx0XHRcdC8vIG1peGluIHNlcGFyYXRvciBpZiBkZWZpbmVkIGZyb20gdGhlIG91dHNpZGVcblx0XHRcdGZvcm1hdHRpbmcgPSB7IC4uLmZvcm1hdHRpbmcsIHNlcGFyYXRvcjogb3B0aW9ucy5zZXBhcmF0b3IgfTtcblx0XHR9XG5cblx0XHRsZXQgbGFiZWwgPSB0aGlzLmRvR2V0VXJpTGFiZWwocmVzb3VyY2UsIGZvcm1hdHRpbmcsIG9wdGlvbnMpO1xuXG5cdFx0Ly8gV2l0aG91dCBmb3JtYXR0aW5nIHdlIHN0aWxsIG5lZWQgdG8gc3VwcG9ydCB0aGUgc2VwYXJhdG9yXG5cdFx0Ly8gYXMgcHJvdmlkZWQgaW4gb3B0aW9ucyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzMDAxOSlcblx0XHRpZiAoIWZvcm1hdHRpbmcgJiYgb3B0aW9ucy5zZXBhcmF0b3IpIHtcblx0XHRcdGxhYmVsID0gdGhpcy5hZGp1c3RQYXRoU2VwYXJhdG9ycyhsYWJlbCwgb3B0aW9ucy5zZXBhcmF0b3IpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLmFwcGVuZFdvcmtzcGFjZVN1ZmZpeCAmJiBmb3JtYXR0aW5nPy53b3Jrc3BhY2VTdWZmaXgpIHtcblx0XHRcdGxhYmVsID0gdGhpcy5hcHBlbmRXb3Jrc3BhY2VTdWZmaXgobGFiZWwsIHJlc291cmNlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbGFiZWw7XG5cdH1cblxuXHRwcml2YXRlIGRvR2V0VXJpTGFiZWwocmVzb3VyY2U6IFVSSSwgZm9ybWF0dGluZz86IFJlc291cmNlTGFiZWxGb3JtYXR0aW5nLCBvcHRpb25zOiB7IHJlbGF0aXZlPzogYm9vbGVhbjsgbm9QcmVmaXg/OiBib29sZWFuIH0gPSB7fSk6IHN0cmluZyB7XG5cdFx0aWYgKCFmb3JtYXR0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZ2V0UGF0aExhYmVsKHJlc291cmNlLCB7XG5cdFx0XHRcdG9zOiB0aGlzLm9zLFxuXHRcdFx0XHR0aWxkaWZ5OiB0aGlzLnVzZXJIb21lID8geyB1c2VySG9tZTogdGhpcy51c2VySG9tZSB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZWxhdGl2ZTogb3B0aW9ucy5yZWxhdGl2ZSA/IHtcblx0XHRcdFx0XHRub1ByZWZpeDogb3B0aW9ucy5ub1ByZWZpeCxcblx0XHRcdFx0XHRnZXRXb3Jrc3BhY2U6ICgpID0+IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCksXG5cdFx0XHRcdFx0Z2V0V29ya3NwYWNlRm9sZGVyOiByZXNvdXJjZSA9PiB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihyZXNvdXJjZSlcblx0XHRcdFx0fSA6IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVsYXRpdmUgbGFiZWxcblx0XHRpZiAob3B0aW9ucy5yZWxhdGl2ZSAmJiB0aGlzLmNvbnRleHRTZXJ2aWNlKSB7XG5cdFx0XHRsZXQgZm9sZGVyID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIocmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFmb2xkZXIpIHtcblxuXHRcdFx0XHQvLyBJdCBpcyBwb3NzaWJsZSB0aGF0IHRoZSByZXNvdXJjZSB3ZSB3YW50IHRvIHJlc29sdmUgdGhlXG5cdFx0XHRcdC8vIHdvcmtzcGFjZSBmb2xkZXIgZm9yIGlzIG5vdCB1c2luZyB0aGUgc2FtZSBzY2hlbWUgYXNcblx0XHRcdFx0Ly8gdGhlIGZvbGRlcnMgaW4gdGhlIHdvcmtzcGFjZSwgc28gd2UgaGVscCBieSB0cnlpbmcgYWdhaW5cblx0XHRcdFx0Ly8gdG8gcmVzb2x2ZSBhIHdvcmtzcGFjZSBmb2xkZXIgYnkgdHJ5aW5nIGFnYWluIHdpdGggYVxuXHRcdFx0XHQvLyBzY2hlbWUgdGhhdCBpcyB3b3Jrc3BhY2UgY29udGFpbmVkLlxuXG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0XHRcdGNvbnN0IGZpcnN0Rm9sZGVyID0gd29ya3NwYWNlLmZvbGRlcnMuYXQoMCk7XG5cdFx0XHRcdGlmIChmaXJzdEZvbGRlciAmJiByZXNvdXJjZS5zY2hlbWUgIT09IGZpcnN0Rm9sZGVyLnVyaS5zY2hlbWUgJiYgcmVzb3VyY2UucGF0aC5zdGFydHNXaXRoKHBvc2l4LnNlcCkpIHtcblx0XHRcdFx0XHRmb2xkZXIgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihmaXJzdEZvbGRlci51cmkud2l0aCh7IHBhdGg6IHJlc291cmNlLnBhdGggfSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmb2xkZXIpIHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyTGFiZWwgPSB0aGlzLmZvcm1hdFVyaShmb2xkZXIudXJpLCBmb3JtYXR0aW5nLCBvcHRpb25zLm5vUHJlZml4KTtcblxuXHRcdFx0XHRsZXQgcmVsYXRpdmVMYWJlbCA9IHRoaXMuZm9ybWF0VXJpKHJlc291cmNlLCBmb3JtYXR0aW5nLCBvcHRpb25zLm5vUHJlZml4KTtcblx0XHRcdFx0bGV0IG92ZXJsYXAgPSAwO1xuXHRcdFx0XHR3aGlsZSAocmVsYXRpdmVMYWJlbFtvdmVybGFwXSAmJiByZWxhdGl2ZUxhYmVsW292ZXJsYXBdID09PSBmb2xkZXJMYWJlbFtvdmVybGFwXSkge1xuXHRcdFx0XHRcdG92ZXJsYXArKztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghcmVsYXRpdmVMYWJlbFtvdmVybGFwXSB8fCByZWxhdGl2ZUxhYmVsW292ZXJsYXBdID09PSBmb3JtYXR0aW5nLnNlcGFyYXRvcikge1xuXHRcdFx0XHRcdHJlbGF0aXZlTGFiZWwgPSByZWxhdGl2ZUxhYmVsLnN1YnN0cmluZygxICsgb3ZlcmxhcCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAob3ZlcmxhcCA9PT0gZm9sZGVyTGFiZWwubGVuZ3RoICYmIGZvbGRlci51cmkucGF0aCA9PT0gcG9zaXguc2VwKSB7XG5cdFx0XHRcdFx0cmVsYXRpdmVMYWJlbCA9IHJlbGF0aXZlTGFiZWwuc3Vic3RyaW5nKG92ZXJsYXApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gYWx3YXlzIHNob3cgcm9vdCBiYXNlbmFtZSBpZiB0aGVyZSBhcmUgbXVsdGlwbGUgZm9sZGVyc1xuXHRcdFx0XHRjb25zdCBoYXNNdWx0aXBsZVJvb3RzID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLmxlbmd0aCA+IDE7XG5cdFx0XHRcdGlmIChoYXNNdWx0aXBsZVJvb3RzICYmICFvcHRpb25zLm5vUHJlZml4KSB7XG5cdFx0XHRcdFx0Y29uc3Qgcm9vdE5hbWUgPSBmb2xkZXI/Lm5hbWUgPz8gYmFzZW5hbWVPckF1dGhvcml0eShmb2xkZXIudXJpKTtcblx0XHRcdFx0XHRyZWxhdGl2ZUxhYmVsID0gcmVsYXRpdmVMYWJlbCA/IGAke3Jvb3ROYW1lfSBcdTIwMjIgJHtyZWxhdGl2ZUxhYmVsfWAgOiByb290TmFtZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiByZWxhdGl2ZUxhYmVsO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFic29sdXRlIGxhYmVsXG5cdFx0cmV0dXJuIHRoaXMuZm9ybWF0VXJpKHJlc291cmNlLCBmb3JtYXR0aW5nLCBvcHRpb25zLm5vUHJlZml4KTtcblx0fVxuXG5cdGdldFVyaUJhc2VuYW1lTGFiZWwocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZm9ybWF0dGluZyA9IHRoaXMuZmluZEZvcm1hdHRpbmcocmVzb3VyY2UpO1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5kb0dldFVyaUxhYmVsKHJlc291cmNlLCBmb3JtYXR0aW5nKTtcblxuXHRcdGxldCBwYXRoTGliOiB0eXBlb2Ygd2luMzIgfCB0eXBlb2YgcG9zaXg7XG5cdFx0aWYgKGZvcm1hdHRpbmc/LnNlcGFyYXRvciA9PT0gd2luMzIuc2VwKSB7XG5cdFx0XHRwYXRoTGliID0gd2luMzI7XG5cdFx0fSBlbHNlIGlmIChmb3JtYXR0aW5nPy5zZXBhcmF0b3IgPT09IHBvc2l4LnNlcCkge1xuXHRcdFx0cGF0aExpYiA9IHBvc2l4O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwYXRoTGliID0gKHRoaXMub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSA/IHdpbjMyIDogcG9zaXg7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBhdGhMaWIuYmFzZW5hbWUobGFiZWwpO1xuXHR9XG5cblx0Z2V0V29ya3NwYWNlTGFiZWwod29ya3NwYWNlOiBJV29ya3NwYWNlIHwgSVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciB8IFVSSSwgb3B0aW9ucz86IHsgdmVyYm9zZTogVmVyYm9zaXR5IH0pOiBzdHJpbmcge1xuXHRcdGlmIChpc1dvcmtzcGFjZSh3b3Jrc3BhY2UpKSB7XG5cdFx0XHRjb25zdCBpZGVudGlmaWVyID0gdG9Xb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZSk7XG5cdFx0XHRpZiAoaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKGlkZW50aWZpZXIpIHx8IGlzV29ya3NwYWNlSWRlbnRpZmllcihpZGVudGlmaWVyKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRXb3Jrc3BhY2VMYWJlbChpZGVudGlmaWVyLCBvcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdC8vIFdvcmtzcGFjZTogU2luZ2xlIEZvbGRlciAoYXMgVVJJKVxuXHRcdGlmIChVUkkuaXNVcmkod29ya3NwYWNlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9HZXRTaW5nbGVGb2xkZXJXb3Jrc3BhY2VMYWJlbCh3b3Jrc3BhY2UsIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdC8vIFdvcmtzcGFjZTogU2luZ2xlIEZvbGRlciAoYXMgd29ya3NwYWNlIGlkZW50aWZpZXIpXG5cdFx0aWYgKGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcih3b3Jrc3BhY2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb0dldFNpbmdsZUZvbGRlcldvcmtzcGFjZUxhYmVsKHdvcmtzcGFjZS51cmksIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdC8vIFdvcmtzcGFjZTogTXVsdGkgUm9vdFxuXHRcdGlmIChpc1dvcmtzcGFjZUlkZW50aWZpZXIod29ya3NwYWNlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9HZXRXb3Jrc3BhY2VMYWJlbCh3b3Jrc3BhY2UuY29uZmlnUGF0aCwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0dldFdvcmtzcGFjZUxhYmVsKHdvcmtzcGFjZVVyaTogVVJJLCBvcHRpb25zPzogeyB2ZXJib3NlOiBWZXJib3NpdHkgfSk6IHN0cmluZyB7XG5cblx0XHQvLyBXb3Jrc3BhY2U6IFVudGl0bGVkXG5cdFx0aWYgKGlzVW50aXRsZWRXb3Jrc3BhY2Uod29ya3NwYWNlVXJpLCB0aGlzLmVudmlyb25tZW50U2VydmljZSkpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgndW50aXRsZWRXb3Jrc3BhY2UnLCBcIlVudGl0bGVkIChXb3Jrc3BhY2UpXCIpO1xuXHRcdH1cblxuXHRcdC8vIFdvcmtzcGFjZTogVGVtcG9yYXJ5XG5cdFx0aWYgKGlzVGVtcG9yYXJ5V29ya3NwYWNlKHdvcmtzcGFjZVVyaSkpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgndGVtcG9yYXJ5V29ya3NwYWNlJywgXCJXb3Jrc3BhY2VcIik7XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3NwYWNlOiBTYXZlZFxuXHRcdGxldCBmaWxlbmFtZSA9IGJhc2VuYW1lKHdvcmtzcGFjZVVyaSk7XG5cdFx0aWYgKGZpbGVuYW1lLmVuZHNXaXRoKFdPUktTUEFDRV9FWFRFTlNJT04pKSB7XG5cdFx0XHRmaWxlbmFtZSA9IGZpbGVuYW1lLnN1YnN0cigwLCBmaWxlbmFtZS5sZW5ndGggLSBXT1JLU1BBQ0VfRVhURU5TSU9OLmxlbmd0aCAtIDEpO1xuXHRcdH1cblxuXHRcdGxldCBsYWJlbDogc3RyaW5nO1xuXHRcdHN3aXRjaCAob3B0aW9ucz8udmVyYm9zZSkge1xuXHRcdFx0Y2FzZSBWZXJib3NpdHkuU0hPUlQ6XG5cdFx0XHRcdGxhYmVsID0gZmlsZW5hbWU7IC8vIHNraXAgc3VmZml4IGZvciBzaG9ydCBsYWJlbFxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgVmVyYm9zaXR5LkxPTkc6XG5cdFx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ3dvcmtzcGFjZU5hbWVWZXJib3NlJywgXCJ7MH0gKFdvcmtzcGFjZSlcIiwgdGhpcy5nZXRVcmlMYWJlbChqb2luUGF0aChkaXJuYW1lKHdvcmtzcGFjZVVyaSksIGZpbGVuYW1lKSkpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgVmVyYm9zaXR5Lk1FRElVTTpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ3dvcmtzcGFjZU5hbWUnLCBcInswfSAoV29ya3NwYWNlKVwiLCBmaWxlbmFtZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy52ZXJib3NlID09PSBWZXJib3NpdHkuU0hPUlQpIHtcblx0XHRcdHJldHVybiBsYWJlbDsgLy8gc2tpcCBzdWZmaXggZm9yIHNob3J0IGxhYmVsXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuYXBwZW5kV29ya3NwYWNlU3VmZml4KGxhYmVsLCB3b3Jrc3BhY2VVcmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0dldFNpbmdsZUZvbGRlcldvcmtzcGFjZUxhYmVsKGZvbGRlclVyaTogVVJJLCBvcHRpb25zPzogeyB2ZXJib3NlOiBWZXJib3NpdHkgfSk6IHN0cmluZyB7XG5cdFx0bGV0IGxhYmVsOiBzdHJpbmc7XG5cdFx0c3dpdGNoIChvcHRpb25zPy52ZXJib3NlKSB7XG5cdFx0XHRjYXNlIFZlcmJvc2l0eS5MT05HOlxuXHRcdFx0XHRsYWJlbCA9IHRoaXMuZ2V0VXJpTGFiZWwoZm9sZGVyVXJpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFZlcmJvc2l0eS5TSE9SVDpcblx0XHRcdGNhc2UgVmVyYm9zaXR5Lk1FRElVTTpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGxhYmVsID0gYmFzZW5hbWUoZm9sZGVyVXJpKSB8fCBwb3NpeC5zZXA7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy52ZXJib3NlID09PSBWZXJib3NpdHkuU0hPUlQpIHtcblx0XHRcdHJldHVybiBsYWJlbDsgLy8gc2tpcCBzdWZmaXggZm9yIHNob3J0IGxhYmVsXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuYXBwZW5kV29ya3NwYWNlU3VmZml4KGxhYmVsLCBmb2xkZXJVcmkpO1xuXHR9XG5cblx0Z2V0U2VwYXJhdG9yKHNjaGVtZTogc3RyaW5nLCBhdXRob3JpdHk/OiBzdHJpbmcpOiAnLycgfCAnXFxcXCcge1xuXHRcdGNvbnN0IGZvcm1hdHRlciA9IHRoaXMuZmluZEZvcm1hdHRpbmcoVVJJLmZyb20oeyBzY2hlbWUsIGF1dGhvcml0eSB9KSk7XG5cblx0XHRyZXR1cm4gZm9ybWF0dGVyPy5zZXBhcmF0b3IgfHwgcG9zaXguc2VwO1xuXHR9XG5cblx0Z2V0SG9zdExhYmVsKHNjaGVtZTogc3RyaW5nLCBhdXRob3JpdHk/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGZvcm1hdHRlciA9IHRoaXMuZmluZEZvcm1hdHRpbmcoVVJJLmZyb20oeyBzY2hlbWUsIGF1dGhvcml0eSB9KSk7XG5cblx0XHRyZXR1cm4gZm9ybWF0dGVyPy53b3Jrc3BhY2VTdWZmaXggfHwgYXV0aG9yaXR5IHx8ICcnO1xuXHR9XG5cblx0Z2V0SG9zdFRvb2x0aXAoc2NoZW1lOiBzdHJpbmcsIGF1dGhvcml0eT86IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZm9ybWF0dGVyID0gdGhpcy5maW5kRm9ybWF0dGluZyhVUkkuZnJvbSh7IHNjaGVtZSwgYXV0aG9yaXR5IH0pKTtcblxuXHRcdHJldHVybiBmb3JtYXR0ZXI/LndvcmtzcGFjZVRvb2x0aXA7XG5cdH1cblxuXHRyZWdpc3RlckNhY2hlZEZvcm1hdHRlcihmb3JtYXR0ZXI6IFJlc291cmNlTGFiZWxGb3JtYXR0ZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgbGlzdCA9IHRoaXMuc3RvcmVkRm9ybWF0dGVycy5mb3JtYXR0ZXJzID8/PSBbXTtcblxuXHRcdGxldCByZXBsYWNlID0gbGlzdC5maW5kSW5kZXgoZiA9PiBmLnNjaGVtZSA9PT0gZm9ybWF0dGVyLnNjaGVtZSAmJiBmLmF1dGhvcml0eSA9PT0gZm9ybWF0dGVyLmF1dGhvcml0eSk7XG5cdFx0aWYgKHJlcGxhY2UgPT09IC0xICYmIGxpc3QubGVuZ3RoID49IEZPUk1BVFRFUl9DQUNIRV9TSVpFKSB7XG5cdFx0XHRyZXBsYWNlID0gRk9STUFUVEVSX0NBQ0hFX1NJWkUgLSAxOyAvLyBhdCBtYXggY2FwYWNpdHksIHJlcGxhY2UgdGhlIGxhc3QgZWxlbWVudFxuXHRcdH1cblxuXHRcdGlmIChyZXBsYWNlID09PSAtMSkge1xuXHRcdFx0bGlzdC51bnNoaWZ0KGZvcm1hdHRlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZvciAobGV0IGkgPSByZXBsYWNlOyBpID4gMDsgaS0tKSB7XG5cdFx0XHRcdGxpc3RbaV0gPSBsaXN0W2kgLSAxXTtcblx0XHRcdH1cblx0XHRcdGxpc3RbMF0gPSBmb3JtYXR0ZXI7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdG9yZWRGb3JtYXR0ZXJzTWVtZW50by5zYXZlTWVtZW50bygpO1xuXG5cdFx0cmV0dXJuIHRoaXMucmVnaXN0ZXJGb3JtYXR0ZXIoZm9ybWF0dGVyKTtcblx0fVxuXG5cdHJlZ2lzdGVyRm9ybWF0dGVyKGZvcm1hdHRlcjogUmVzb3VyY2VMYWJlbEZvcm1hdHRlcik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLmZvcm1hdHRlcnMucHVzaChmb3JtYXR0ZXIpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRm9ybWF0dGVycy5maXJlKHsgc2NoZW1lOiBmb3JtYXR0ZXIuc2NoZW1lIH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5mb3JtYXR0ZXJzID0gdGhpcy5mb3JtYXR0ZXJzLmZpbHRlcihmID0+IGYgIT09IGZvcm1hdHRlcik7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRm9ybWF0dGVycy5maXJlKHsgc2NoZW1lOiBmb3JtYXR0ZXIuc2NoZW1lIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGZvcm1hdFVyaShyZXNvdXJjZTogVVJJLCBmb3JtYXR0aW5nOiBSZXNvdXJjZUxhYmVsRm9ybWF0dGluZywgZm9yY2VOb1RpbGRpZnk/OiBib29sZWFuKTogc3RyaW5nIHtcblx0XHRsZXQgbGFiZWwgPSBmb3JtYXR0aW5nLmxhYmVsLnJlcGxhY2UobGFiZWxNYXRjaGluZ1JlZ2V4cCwgKG1hdGNoLCB0b2tlbiwgcXNUb2tlbiwgcXNWYWx1ZSkgPT4ge1xuXHRcdFx0c3dpdGNoICh0b2tlbikge1xuXHRcdFx0XHRjYXNlICdzY2hlbWUnOiByZXR1cm4gcmVzb3VyY2Uuc2NoZW1lO1xuXHRcdFx0XHRjYXNlICdhdXRob3JpdHknOiByZXR1cm4gcmVzb3VyY2UuYXV0aG9yaXR5O1xuXHRcdFx0XHRjYXNlICdhdXRob3JpdHlTdWZmaXgnOiB7XG5cdFx0XHRcdFx0Y29uc3QgaSA9IHJlc291cmNlLmF1dGhvcml0eS5pbmRleE9mKCcrJyk7XG5cdFx0XHRcdFx0cmV0dXJuIGkgPT09IC0xID8gcmVzb3VyY2UuYXV0aG9yaXR5IDogcmVzb3VyY2UuYXV0aG9yaXR5LnNsaWNlKGkgKyAxKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdwYXRoJzoge1xuXHRcdFx0XHRcdGxldCBwYXRoVmFsdWUgPSByZXNvdXJjZS5wYXRoO1xuXHRcdFx0XHRcdGlmIChmb3JtYXR0aW5nLnN0cmlwUGF0aFNlZ21lbnRzKSB7XG5cdFx0XHRcdFx0XHRsZXQgcG9zID0gMDtcblx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZm9ybWF0dGluZy5zdHJpcFBhdGhTZWdtZW50czsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG5leHQgPSBwYXRoVmFsdWUuaW5kZXhPZignLycsIHBvcyArIDEpO1xuXHRcdFx0XHRcdFx0XHRpZiAobmV4dCA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRwb3MgPSBuZXh0O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cGF0aFZhbHVlID0gcGF0aFZhbHVlLnN1YnN0cmluZyhwb3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZm9ybWF0dGluZy5zdHJpcFBhdGhTdGFydGluZ1NlcGFyYXRvclxuXHRcdFx0XHRcdFx0PyBwYXRoVmFsdWUuc2xpY2UocGF0aFZhbHVlWzBdID09PSBmb3JtYXR0aW5nLnNlcGFyYXRvciA/IDEgOiAwKVxuXHRcdFx0XHRcdFx0OiBwYXRoVmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdGlmIChxc1Rva2VuID09PSAncXVlcnknKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB7IHF1ZXJ5IH0gPSByZXNvdXJjZTtcblx0XHRcdFx0XHRcdGlmIChxdWVyeSAmJiBxdWVyeVswXSA9PT0gJ3snICYmIHF1ZXJ5W3F1ZXJ5Lmxlbmd0aCAtIDFdID09PSAnfScpIHtcblx0XHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShxdWVyeSlbcXNWYWx1ZV0gfHwgJyc7XG5cdFx0XHRcdFx0XHRcdH0gY2F0Y2ggeyB9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBjb252ZXJ0IFxcYzpcXHNvbWV0aGluZyA9PiBDOlxcc29tZXRoaW5nXG5cdFx0aWYgKGZvcm1hdHRpbmcubm9ybWFsaXplRHJpdmVMZXR0ZXIgJiYgaGFzRHJpdmVMZXR0ZXJJZ25vcmVQbGF0Zm9ybShsYWJlbCkpIHtcblx0XHRcdGxhYmVsID0gbGFiZWwuY2hhckF0KDEpLnRvVXBwZXJDYXNlKCkgKyBsYWJlbC5zdWJzdHIoMik7XG5cdFx0fVxuXG5cdFx0aWYgKGZvcm1hdHRpbmcudGlsZGlmeSAmJiAhZm9yY2VOb1RpbGRpZnkpIHtcblx0XHRcdGlmICh0aGlzLnVzZXJIb21lKSB7XG5cdFx0XHRcdGxhYmVsID0gdGlsZGlmeShsYWJlbCwgdGhpcy51c2VySG9tZS5mc1BhdGgsIHRoaXMub3MpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChmb3JtYXR0aW5nLmF1dGhvcml0eVByZWZpeCAmJiByZXNvdXJjZS5hdXRob3JpdHkpIHtcblx0XHRcdGxhYmVsID0gZm9ybWF0dGluZy5hdXRob3JpdHlQcmVmaXggKyBsYWJlbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5hZGp1c3RQYXRoU2VwYXJhdG9ycyhsYWJlbCwgZm9ybWF0dGluZy5zZXBhcmF0b3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGp1c3RQYXRoU2VwYXJhdG9ycyhsYWJlbDogc3RyaW5nLCBzZXBhcmF0b3I6ICcvJyB8ICdcXFxcJyB8ICcnKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbGFiZWwucmVwbGFjZSh0aGlzLm9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyA/IHdpblBhdGhTZXBhcmF0b3JSZWdleHAgOiBwb3NpeFBhdGhTZXBhcmF0b3JSZWdleHAsIHNlcGFyYXRvcik7XG5cdH1cblxuXHRwcml2YXRlIGFwcGVuZFdvcmtzcGFjZVN1ZmZpeChsYWJlbDogc3RyaW5nLCB1cmk6IFVSSSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZm9ybWF0dGluZyA9IHRoaXMuZmluZEZvcm1hdHRpbmcodXJpKTtcblx0XHRjb25zdCBzdWZmaXggPSBmb3JtYXR0aW5nICYmICh0eXBlb2YgZm9ybWF0dGluZy53b3Jrc3BhY2VTdWZmaXggPT09ICdzdHJpbmcnKSA/IGZvcm1hdHRpbmcud29ya3NwYWNlU3VmZml4IDogdW5kZWZpbmVkO1xuXG5cdFx0cmV0dXJuIHN1ZmZpeCA/IGAke2xhYmVsfSBbJHtzdWZmaXh9XWAgOiBsYWJlbDtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJTGFiZWxTZXJ2aWNlLCBMYWJlbFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBc0IsWUFBWSxlQUFlO0FBQ2pELFNBQVMsT0FBTyxLQUFLLGFBQWE7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsY0FBYywyQkFBb0Y7QUFDM0csU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUywwQkFBc0MsYUFBK0MsbUNBQW1DLHVCQUE2Qyx1QkFBdUIscUJBQXFCLHFCQUFxQiw0QkFBNEI7QUFDM1EsU0FBUyxxQkFBcUIsVUFBVSxVQUFVLGVBQWU7QUFDakUsU0FBUyxTQUFTLG9CQUFvQjtBQUN0QyxTQUFTLGVBQXVGLGlCQUFpQjtBQUNqSCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGlCQUFpQixVQUFVO0FBQ3BDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLGVBQWU7QUFFeEIsTUFBTSxrQ0FBa0MsbUJBQW1CLHVCQUFpRDtBQUFBLEVBQzNHLGdCQUFnQjtBQUFBLEVBQ2hCLFlBQVk7QUFB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
