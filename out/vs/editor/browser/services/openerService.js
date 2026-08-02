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
import * as dom from "../../../base/browser/dom.js";
import { mainWindow } from "../../../base/browser/window.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { LinkedList } from "../../../base/common/linkedList.js";
import { ResourceMap } from "../../../base/common/map.js";
import { parse } from "../../../base/common/marshalling.js";
import { matchesScheme, matchesSomeScheme, Schemas } from "../../../base/common/network.js";
import { normalizePath } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { ICodeEditorService } from "./codeEditorService.js";
import { ICommandService } from "../../../platform/commands/common/commands.js";
import { EditorOpenSource } from "../../../platform/editor/common/editor.js";
import { extractSelection } from "../../../platform/opener/common/opener.js";
let CommandOpener = class {
  constructor(_commandService) {
    this._commandService = _commandService;
  }
  async open(target, options) {
    if (!matchesScheme(target, Schemas.command)) {
      return false;
    }
    if (!options?.allowCommands) {
      return true;
    }
    if (typeof target === "string") {
      target = URI.parse(target);
    }
    if (Array.isArray(options.allowCommands)) {
      if (!options.allowCommands.includes(target.path)) {
        return true;
      }
    }
    let args = [];
    try {
      args = parse(decodeURIComponent(target.query));
    } catch {
      try {
        args = parse(target.query);
      } catch {
      }
    }
    if (!Array.isArray(args)) {
      args = [args];
    }
    await this._commandService.executeCommand(target.path, ...args);
    return true;
  }
};
CommandOpener = __decorateClass([
  __decorateParam(0, ICommandService)
], CommandOpener);
let EditorOpener = class {
  constructor(_editorService) {
    this._editorService = _editorService;
  }
  async open(target, options) {
    if (typeof target === "string") {
      target = URI.parse(target);
    }
    const { selection, uri } = extractSelection(target);
    target = uri;
    if (target.scheme === Schemas.file) {
      target = normalizePath(target);
    }
    await this._editorService.openCodeEditor(
      {
        resource: target,
        options: {
          selection,
          source: options?.fromUserGesture ? EditorOpenSource.USER : EditorOpenSource.API,
          ...options?.editorOptions
        }
      },
      this._editorService.getFocusedCodeEditor(),
      options?.openToSide
    );
    return true;
  }
};
EditorOpener = __decorateClass([
  __decorateParam(0, ICodeEditorService)
], EditorOpener);
let OpenerService = class {
  constructor(editorService, commandService) {
    this._openers = new LinkedList();
    this._validators = new LinkedList();
    this._resolvers = new LinkedList();
    this._resolvedUriTargets = new ResourceMap((uri) => uri.with({ path: null, fragment: null, query: null }).toString());
    this._externalOpeners = new LinkedList();
    this._defaultExternalOpener = {
      openExternal: async (href) => {
        if (matchesSomeScheme(href, Schemas.http, Schemas.https)) {
          dom.windowOpenNoOpener(href);
        } else {
          mainWindow.location.href = href;
        }
        return true;
      }
    };
    this._openers.push({
      open: async (target, options) => {
        if (options?.openExternal || matchesSomeScheme(target, Schemas.mailto, Schemas.http, Schemas.https, Schemas.vsls)) {
          await this._doOpenExternal(target, options);
          return true;
        }
        return false;
      }
    });
    this._openers.push(new CommandOpener(commandService));
    this._openers.push(new EditorOpener(editorService));
  }
  registerOpener(opener) {
    const remove = this._openers.unshift(opener);
    return { dispose: remove };
  }
  registerValidator(validator) {
    const remove = this._validators.push(validator);
    return { dispose: remove };
  }
  registerExternalUriResolver(resolver) {
    const remove = this._resolvers.push(resolver);
    return { dispose: remove };
  }
  setDefaultExternalOpener(externalOpener) {
    this._defaultExternalOpener = externalOpener;
  }
  registerExternalOpener(opener) {
    const remove = this._externalOpeners.push(opener);
    return { dispose: remove };
  }
  async open(target, options) {
    const targetURI = typeof target === "string" ? URI.parse(target) : target;
    if (targetURI.scheme === Schemas.internal) {
      return false;
    }
    if (!options?.skipValidation) {
      const validationTarget = this._resolvedUriTargets.get(targetURI) ?? target;
      for (const validator of this._validators) {
        if (!await validator.shouldOpen(validationTarget, options)) {
          return false;
        }
      }
    }
    for (const opener of this._openers) {
      const handled = await opener.open(target, options);
      if (handled) {
        return true;
      }
    }
    return false;
  }
  async resolveExternalUri(resource, options) {
    for (const resolver of this._resolvers) {
      try {
        const result = await resolver.resolveExternalUri(resource, options);
        if (result) {
          if (!this._resolvedUriTargets.has(result.resolved)) {
            this._resolvedUriTargets.set(result.resolved, resource);
          }
          return result;
        }
      } catch {
      }
    }
    throw new Error("Could not resolve external URI: " + resource.toString());
  }
  async _doOpenExternal(resource, options) {
    const uri = typeof resource === "string" ? URI.parse(resource) : resource;
    let externalUri;
    try {
      externalUri = (await this.resolveExternalUri(uri, options)).resolved;
    } catch {
      externalUri = uri;
    }
    let href;
    if (typeof resource === "string" && uri.toString() === externalUri.toString()) {
      href = resource;
    } else {
      href = encodeURI(externalUri.toString(true));
    }
    if (options?.allowContributedOpeners) {
      const preferredOpenerId = typeof options?.allowContributedOpeners === "string" ? options?.allowContributedOpeners : void 0;
      for (const opener of this._externalOpeners) {
        const didOpen = await opener.openExternal(href, {
          sourceUri: uri,
          preferredOpenerId
        }, CancellationToken.None);
        if (didOpen) {
          return true;
        }
      }
    }
    return this._defaultExternalOpener.openExternal(href, { sourceUri: uri }, CancellationToken.None);
  }
  dispose() {
    this._validators.clear();
  }
};
OpenerService = __decorateClass([
  __decorateParam(0, ICodeEditorService),
  __decorateParam(1, ICommandService)
], OpenerService);
export {
  OpenerService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL29wZW5lclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBMaW5rZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkTGlzdC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IG1hdGNoZXNTY2hlbWUsIG1hdGNoZXNTb21lU2NoZW1lLCBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcGVuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgZXh0cmFjdFNlbGVjdGlvbiwgSUV4dGVybmFsT3BlbmVyLCBJRXh0ZXJuYWxVcmlSZXNvbHZlciwgSU9wZW5lciwgSU9wZW5lclNlcnZpY2UsIElSZXNvbHZlZEV4dGVybmFsVXJpLCBJVmFsaWRhdG9yLCBPcGVuT3B0aW9ucywgUmVzb2x2ZUV4dGVybmFsVXJpT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcblxuY2xhc3MgQ29tbWFuZE9wZW5lciBpbXBsZW1lbnRzIElPcGVuZXIge1xuXG5cdGNvbnN0cnVjdG9yKEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSkgeyB9XG5cblx0YXN5bmMgb3Blbih0YXJnZXQ6IFVSSSB8IHN0cmluZywgb3B0aW9ucz86IE9wZW5PcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCFtYXRjaGVzU2NoZW1lKHRhcmdldCwgU2NoZW1hcy5jb21tYW5kKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghb3B0aW9ucz8uYWxsb3dDb21tYW5kcykge1xuXHRcdFx0Ly8gc2lsZW50bHkgaWdub3JlIGNvbW1hbmRzIHdoZW4gY29tbWFuZC1saW5rcyBhcmUgZGlzYWJsZWQsIGFsc29cblx0XHRcdC8vIHN1cHByZXNzIG90aGVyIG9wZW5lcnMgYnkgcmV0dXJuaW5nIFRSVUVcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdGFyZ2V0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGFyZ2V0ID0gVVJJLnBhcnNlKHRhcmdldCk7XG5cdFx0fVxuXG5cdFx0aWYgKEFycmF5LmlzQXJyYXkob3B0aW9ucy5hbGxvd0NvbW1hbmRzKSkge1xuXHRcdFx0Ly8gT25seSBhbGxvdyBzcGVjaWZpYyBjb21tYW5kc1xuXHRcdFx0aWYgKCFvcHRpb25zLmFsbG93Q29tbWFuZHMuaW5jbHVkZXModGFyZ2V0LnBhdGgpKSB7XG5cdFx0XHRcdC8vIFN1cHByZXNzIG90aGVyIG9wZW5lcnMgYnkgcmV0dXJuaW5nIFRSVUVcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gZXhlY3V0ZSBhcyBjb21tYW5kXG5cdFx0bGV0IGFyZ3M6IHVua25vd25bXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRhcmdzID0gcGFyc2UoZGVjb2RlVVJJQ29tcG9uZW50KHRhcmdldC5xdWVyeSkpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gaWdub3JlIGFuZCByZXRyeVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXJncyA9IHBhcnNlKHRhcmdldC5xdWVyeSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gaWdub3JlIGVycm9yXG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghQXJyYXkuaXNBcnJheShhcmdzKSkge1xuXHRcdFx0YXJncyA9IFthcmdzXTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQodGFyZ2V0LnBhdGgsIC4uLmFyZ3MpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbmNsYXNzIEVkaXRvck9wZW5lciBpbXBsZW1lbnRzIElPcGVuZXIge1xuXG5cdGNvbnN0cnVjdG9yKEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlKSB7IH1cblxuXHRhc3luYyBvcGVuKHRhcmdldDogVVJJIHwgc3RyaW5nLCBvcHRpb25zOiBPcGVuT3B0aW9ucykge1xuXHRcdGlmICh0eXBlb2YgdGFyZ2V0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGFyZ2V0ID0gVVJJLnBhcnNlKHRhcmdldCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBzZWxlY3Rpb24sIHVyaSB9ID0gZXh0cmFjdFNlbGVjdGlvbih0YXJnZXQpO1xuXHRcdHRhcmdldCA9IHVyaTtcblxuXHRcdGlmICh0YXJnZXQuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdHRhcmdldCA9IG5vcm1hbGl6ZVBhdGgodGFyZ2V0KTsgLy8gd29ya2Fyb3VuZCBmb3Igbm9uLW5vcm1hbGl6ZWQgcGF0aHMgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjk1NClcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5Db2RlRWRpdG9yKFxuXHRcdFx0e1xuXHRcdFx0XHRyZXNvdXJjZTogdGFyZ2V0LFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0c2VsZWN0aW9uLFxuXHRcdFx0XHRcdHNvdXJjZTogb3B0aW9ucz8uZnJvbVVzZXJHZXN0dXJlID8gRWRpdG9yT3BlblNvdXJjZS5VU0VSIDogRWRpdG9yT3BlblNvdXJjZS5BUEksXG5cdFx0XHRcdFx0Li4ub3B0aW9ucz8uZWRpdG9yT3B0aW9uc1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5nZXRGb2N1c2VkQ29kZUVkaXRvcigpLFxuXHRcdFx0b3B0aW9ucz8ub3BlblRvU2lkZVxuXHRcdCk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3BlbmVyU2VydmljZSBpbXBsZW1lbnRzIElPcGVuZXJTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJzID0gbmV3IExpbmtlZExpc3Q8SU9wZW5lcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdmFsaWRhdG9ycyA9IG5ldyBMaW5rZWRMaXN0PElWYWxpZGF0b3I+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVycyA9IG5ldyBMaW5rZWRMaXN0PElFeHRlcm5hbFVyaVJlc29sdmVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlZFVyaVRhcmdldHMgPSBuZXcgUmVzb3VyY2VNYXA8VVJJPih1cmkgPT4gdXJpLndpdGgoeyBwYXRoOiBudWxsLCBmcmFnbWVudDogbnVsbCwgcXVlcnk6IG51bGwgfSkudG9TdHJpbmcoKSk7XG5cblx0cHJpdmF0ZSBfZGVmYXVsdEV4dGVybmFsT3BlbmVyOiBJRXh0ZXJuYWxPcGVuZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVybmFsT3BlbmVycyA9IG5ldyBMaW5rZWRMaXN0PElFeHRlcm5hbE9wZW5lcj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2Vcblx0KSB7XG5cdFx0Ly8gRGVmYXVsdCBleHRlcm5hbCBvcGVuZXIgaXMgZ29pbmcgdGhyb3VnaCB3aW5kb3cub3BlbigpXG5cdFx0dGhpcy5fZGVmYXVsdEV4dGVybmFsT3BlbmVyID0ge1xuXHRcdFx0b3BlbkV4dGVybmFsOiBhc3luYyBocmVmID0+IHtcblx0XHRcdFx0Ly8gZW5zdXJlIHRvIG9wZW4gSFRUUC9IVFRQUyBsaW5rcyBpbnRvIG5ldyB3aW5kb3dzXG5cdFx0XHRcdC8vIHRvIG5vdCB0cmlnZ2VyIGEgbmF2aWdhdGlvbi4gQW55IG90aGVyIGxpbmsgaXNcblx0XHRcdFx0Ly8gc2FmZSB0byBiZSBzZXQgYXMgSFJFRiB0byBwcmV2ZW50IGEgYmxhbmsgd2luZG93XG5cdFx0XHRcdC8vIGZyb20gb3BlbmluZy5cblx0XHRcdFx0aWYgKG1hdGNoZXNTb21lU2NoZW1lKGhyZWYsIFNjaGVtYXMuaHR0cCwgU2NoZW1hcy5odHRwcykpIHtcblx0XHRcdFx0XHRkb20ud2luZG93T3Blbk5vT3BlbmVyKGhyZWYpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG1haW5XaW5kb3cubG9jYXRpb24uaHJlZiA9IGhyZWY7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIERlZmF1bHQgb3BlbmVyOiBhbnkgZXh0ZXJuYWwsIG1haXRvLCBodHRwKHMpLCBjb21tYW5kLCBhbmQgY2F0Y2gtYWxsLWVkaXRvcnNcblx0XHR0aGlzLl9vcGVuZXJzLnB1c2goe1xuXHRcdFx0b3BlbjogYXN5bmMgKHRhcmdldDogVVJJIHwgc3RyaW5nLCBvcHRpb25zPzogT3Blbk9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKG9wdGlvbnM/Lm9wZW5FeHRlcm5hbCB8fCBtYXRjaGVzU29tZVNjaGVtZSh0YXJnZXQsIFNjaGVtYXMubWFpbHRvLCBTY2hlbWFzLmh0dHAsIFNjaGVtYXMuaHR0cHMsIFNjaGVtYXMudnNscykpIHtcblx0XHRcdFx0XHQvLyBvcGVuIGV4dGVybmFsbHlcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9kb09wZW5FeHRlcm5hbCh0YXJnZXQsIG9wdGlvbnMpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9vcGVuZXJzLnB1c2gobmV3IENvbW1hbmRPcGVuZXIoY29tbWFuZFNlcnZpY2UpKTtcblx0XHR0aGlzLl9vcGVuZXJzLnB1c2gobmV3IEVkaXRvck9wZW5lcihlZGl0b3JTZXJ2aWNlKSk7XG5cdH1cblxuXHRyZWdpc3Rlck9wZW5lcihvcGVuZXI6IElPcGVuZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgcmVtb3ZlID0gdGhpcy5fb3BlbmVycy51bnNoaWZ0KG9wZW5lcik7XG5cdFx0cmV0dXJuIHsgZGlzcG9zZTogcmVtb3ZlIH07XG5cdH1cblxuXHRyZWdpc3RlclZhbGlkYXRvcih2YWxpZGF0b3I6IElWYWxpZGF0b3IpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgcmVtb3ZlID0gdGhpcy5fdmFsaWRhdG9ycy5wdXNoKHZhbGlkYXRvcik7XG5cdFx0cmV0dXJuIHsgZGlzcG9zZTogcmVtb3ZlIH07XG5cdH1cblxuXHRyZWdpc3RlckV4dGVybmFsVXJpUmVzb2x2ZXIocmVzb2x2ZXI6IElFeHRlcm5hbFVyaVJlc29sdmVyKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHJlbW92ZSA9IHRoaXMuX3Jlc29sdmVycy5wdXNoKHJlc29sdmVyKTtcblx0XHRyZXR1cm4geyBkaXNwb3NlOiByZW1vdmUgfTtcblx0fVxuXG5cdHNldERlZmF1bHRFeHRlcm5hbE9wZW5lcihleHRlcm5hbE9wZW5lcjogSUV4dGVybmFsT3BlbmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVmYXVsdEV4dGVybmFsT3BlbmVyID0gZXh0ZXJuYWxPcGVuZXI7XG5cdH1cblxuXHRyZWdpc3RlckV4dGVybmFsT3BlbmVyKG9wZW5lcjogSUV4dGVybmFsT3BlbmVyKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHJlbW92ZSA9IHRoaXMuX2V4dGVybmFsT3BlbmVycy5wdXNoKG9wZW5lcik7XG5cdFx0cmV0dXJuIHsgZGlzcG9zZTogcmVtb3ZlIH07XG5cdH1cblxuXHRhc3luYyBvcGVuKHRhcmdldDogVVJJIHwgc3RyaW5nLCBvcHRpb25zPzogT3Blbk9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB0YXJnZXRVUkkgPSB0eXBlb2YgdGFyZ2V0ID09PSAnc3RyaW5nJyA/IFVSSS5wYXJzZSh0YXJnZXQpIDogdGFyZ2V0O1xuXG5cdFx0Ly8gSW50ZXJuYWwgc2NoZW1lcyBhcmUgbm90IG9wZW5hYmxlIGFuZCBtdXN0IGluc3RlYWQgYmUgaGFuZGxlZCBpbiBldmVudCBsaXN0ZW5lcnNcblx0XHRpZiAodGFyZ2V0VVJJLnNjaGVtZSA9PT0gU2NoZW1hcy5pbnRlcm5hbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIGNoZWNrIHdpdGggY29udHJpYnV0ZWQgdmFsaWRhdG9yc1xuXHRcdGlmICghb3B0aW9ucz8uc2tpcFZhbGlkYXRpb24pIHtcblx0XHRcdGNvbnN0IHZhbGlkYXRpb25UYXJnZXQgPSB0aGlzLl9yZXNvbHZlZFVyaVRhcmdldHMuZ2V0KHRhcmdldFVSSSkgPz8gdGFyZ2V0OyAvLyB2YWxpZGF0ZSBhZ2FpbnN0IHRoZSBvcmlnaW5hbCBVUkkgdGhhdCB0aGlzIFVSSSByZXNvbHZlcyB0bywgaWYgb25lIGV4aXN0c1xuXHRcdFx0Zm9yIChjb25zdCB2YWxpZGF0b3Igb2YgdGhpcy5fdmFsaWRhdG9ycykge1xuXHRcdFx0XHRpZiAoIShhd2FpdCB2YWxpZGF0b3Iuc2hvdWxkT3Blbih2YWxpZGF0aW9uVGFyZ2V0LCBvcHRpb25zKSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBjaGVjayB3aXRoIGNvbnRyaWJ1dGVkIG9wZW5lcnNcblx0XHRmb3IgKGNvbnN0IG9wZW5lciBvZiB0aGlzLl9vcGVuZXJzKSB7XG5cdFx0XHRjb25zdCBoYW5kbGVkID0gYXdhaXQgb3BlbmVyLm9wZW4odGFyZ2V0LCBvcHRpb25zKTtcblx0XHRcdGlmIChoYW5kbGVkKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVFeHRlcm5hbFVyaShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogUmVzb2x2ZUV4dGVybmFsVXJpT3B0aW9ucyk6IFByb21pc2U8SVJlc29sdmVkRXh0ZXJuYWxVcmk+IHtcblx0XHRmb3IgKGNvbnN0IHJlc29sdmVyIG9mIHRoaXMuX3Jlc29sdmVycykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzb2x2ZXIucmVzb2x2ZUV4dGVybmFsVXJpKHJlc291cmNlLCBvcHRpb25zKTtcblx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdGlmICghdGhpcy5fcmVzb2x2ZWRVcmlUYXJnZXRzLmhhcyhyZXN1bHQucmVzb2x2ZWQpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZXNvbHZlZFVyaVRhcmdldHMuc2V0KHJlc3VsdC5yZXNvbHZlZCwgcmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gbm9vcFxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IHJlc29sdmUgZXh0ZXJuYWwgVVJJOiAnICsgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb09wZW5FeHRlcm5hbChyZXNvdXJjZTogVVJJIHwgc3RyaW5nLCBvcHRpb25zOiBPcGVuT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Ly90b2RvQGpyaWVrZW4gSUV4dGVybmFsVXJpUmVzb2x2ZXIgc2hvdWxkIHN1cHBvcnQgYHVyaTogVVJJIHwgc3RyaW5nYFxuXHRcdGNvbnN0IHVyaSA9IHR5cGVvZiByZXNvdXJjZSA9PT0gJ3N0cmluZycgPyBVUkkucGFyc2UocmVzb3VyY2UpIDogcmVzb3VyY2U7XG5cdFx0bGV0IGV4dGVybmFsVXJpOiBVUkk7XG5cblx0XHR0cnkge1xuXHRcdFx0ZXh0ZXJuYWxVcmkgPSAoYXdhaXQgdGhpcy5yZXNvbHZlRXh0ZXJuYWxVcmkodXJpLCBvcHRpb25zKSkucmVzb2x2ZWQ7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRleHRlcm5hbFVyaSA9IHVyaTtcblx0XHR9XG5cblx0XHRsZXQgaHJlZjogc3RyaW5nO1xuXHRcdGlmICh0eXBlb2YgcmVzb3VyY2UgPT09ICdzdHJpbmcnICYmIHVyaS50b1N0cmluZygpID09PSBleHRlcm5hbFVyaS50b1N0cmluZygpKSB7XG5cdFx0XHQvLyBvcGVuIHRoZSB1cmwtc3RyaW5nIEFTIElTXG5cdFx0XHRocmVmID0gcmVzb3VyY2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIG9wZW4gVVJJIHVzaW5nIHRoZSB0b1N0cmluZyhub0VuY29kZSkrZW5jb2RlVVJJLXRyaWNrXG5cdFx0XHRocmVmID0gZW5jb2RlVVJJKGV4dGVybmFsVXJpLnRvU3RyaW5nKHRydWUpKTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucz8uYWxsb3dDb250cmlidXRlZE9wZW5lcnMpIHtcblx0XHRcdGNvbnN0IHByZWZlcnJlZE9wZW5lcklkID0gdHlwZW9mIG9wdGlvbnM/LmFsbG93Q29udHJpYnV0ZWRPcGVuZXJzID09PSAnc3RyaW5nJyA/IG9wdGlvbnM/LmFsbG93Q29udHJpYnV0ZWRPcGVuZXJzIDogdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChjb25zdCBvcGVuZXIgb2YgdGhpcy5fZXh0ZXJuYWxPcGVuZXJzKSB7XG5cdFx0XHRcdGNvbnN0IGRpZE9wZW4gPSBhd2FpdCBvcGVuZXIub3BlbkV4dGVybmFsKGhyZWYsIHtcblx0XHRcdFx0XHRzb3VyY2VVcmk6IHVyaSxcblx0XHRcdFx0XHRwcmVmZXJyZWRPcGVuZXJJZCxcblx0XHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGlmIChkaWRPcGVuKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdEV4dGVybmFsT3BlbmVyLm9wZW5FeHRlcm5hbChocmVmLCB7IHNvdXJjZVVyaTogdXJpIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLl92YWxpZGF0b3JzLmNsZWFyKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWUsbUJBQW1CLGVBQWU7QUFDMUQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQWtLO0FBRTNLLElBQU0sZ0JBQU4sTUFBdUM7QUFBQSxFQUV0QyxZQUE4QyxpQkFBa0M7QUFBbEM7QUFBQSxFQUFvQztBQUFBLEVBRWxGLE1BQU0sS0FBSyxRQUFzQixTQUF5QztBQUN6RSxRQUFJLENBQUMsY0FBYyxRQUFRLFFBQVEsT0FBTyxHQUFHO0FBQzVDLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxDQUFDLFNBQVMsZUFBZTtBQUc1QixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksT0FBTyxXQUFXLFVBQVU7QUFDL0IsZUFBUyxJQUFJ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RTtBQUMzRyxlQUFXLFlBQVksS0FBSyxZQUFZO0FBQ3ZDLFVBQUk7QUFDSCxjQUFNLFNBQVMsTUFBTSxTQUFTLG1CQUFtQixVQUFVLE9BQU87QUFDbEUsWUFBSSxRQUFRO0FBQ1gsY0FBSSxDQUFDLEtBQUssb0JBQW9CLElBQUksT0FBTyxRQUFRLEdBQUc7QUFDbkQsaUJBQUssb0JBQW9CLElBQUksT0FBTyxVQUFVLFFBQVE7QUFBQSxVQUN2RDtBQUNBLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0QsUUFBUTtBQUFBLE1BRVI7QUFBQSxJQUNEO0FBRUEsVUFBTSxJQUFJLE1BQU0scUNBQXFDLFNBQVMsU0FBUyxDQUFDO0FBQUEsRUFDekU7QUFBQSxFQUVBLE1BQWMsZ0JBQWdCLFVBQXdCLFNBQW9EO0FBR3pHLFVBQU0sTUFBTSxPQUFPLGFBQWEsV0FBVyxJQUFJLE1BQU0sUUFBUSxJQUFJO0FBQ2pFLFFBQUk7QUFFSixRQUFJO0FBQ0gscUJBQWUsTUFBTSxLQUFLLG1CQUFtQixLQUFLLE9BQU8sR0FBRztBQUFBLElBQzdELFFBQVE7QUFDUCxvQkFBYztBQUFBLElBQ2Y7QUFFQSxRQUFJO0FBQ0osUUFBSSxPQUFPLGFBQWEsWUFBWSxJQUFJLFNBQVMsTUFBTSxZQUFZLFNBQVMsR0FBRztBQUU5RSxhQUFPO0FBQUEsSUFDUixPQUFPO0FBRU4sYUFBTyxVQUFVLFlBQVksU0FBUyxJQUFJLENBQUM7QUFBQSxJQUM1QztBQUVBLFFBQUksU0FBUyx5QkFBeUI7QUFDckMsWUFBTSxvQkFBb0IsT0FBTyxTQUFTLDRCQUE0QixXQUFXLFNBQVMsMEJBQTBCO0FBQ3BILGlCQUFXLFVBQVUsS0FBSyxrQkFBa0I7QUFDM0MsY0FBTSxVQUFVLE1BQU0sT0FBTyxhQUFhLE1BQU07QUFBQSxVQUMvQyxXQUFXO0FBQUEsVUFDWDtBQUFBLFFBQ0QsR0FBRyxrQkFBa0IsSUFBSTtBQUN6QixZQUFJLFNBQVM7QUFDWixpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU8sS0FBSyx1QkFBdUIsYUFBYSxNQUFNLEVBQUUsV0FBVyxJQUFJLEdBQUcsa0JBQWtCLElBQUk7QUFBQSxFQUNqRztBQUFBLEVBRUEsVUFBVTtBQUNULFNBQUssWUFBWSxNQUFNO0FBQUEsRUFDeEI7QUFDRDtBQTlKYSxnQkFBTjtBQUFBLEVBYUo7QUFBQSxFQUNBO0FBQUEsR0FkVTsiLAogICJuYW1lcyI6IFtdCn0K
