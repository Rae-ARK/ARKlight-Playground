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
import { Lazy } from "../../../base/common/lazy.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import * as path from "../../../base/common/path.js";
import * as process from "../../../base/common/process.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { IExtHostDocumentsAndEditors } from "./extHostDocumentsAndEditors.js";
import { IExtHostEditorTabs } from "./extHostEditorTabs.js";
import { IExtHostExtensionService } from "./extHostExtensionService.js";
import { CustomEditorTabInput, NotebookDiffEditorTabInput, NotebookEditorTabInput, TextDiffTabInput, TextTabInput } from "./extHostTypes.js";
import { IExtHostWorkspace } from "./extHostWorkspace.js";
import { AbstractVariableResolverService } from "../../services/configurationResolver/common/variableResolver.js";
import { IExtHostConfiguration } from "./extHostConfiguration.js";
const IExtHostVariableResolverProvider = createDecorator("IExtHostVariableResolverProvider");
class ExtHostVariableResolverService extends AbstractVariableResolverService {
  constructor(extensionService, workspaceService, editorService, editorTabs, configProvider, context, homeDir) {
    function getActiveUri() {
      if (editorService) {
        const activeEditor = editorService.activeEditor();
        if (activeEditor) {
          return activeEditor.document.uri;
        }
        const activeTab = editorTabs.tabGroups.all.find((group) => group.isActive)?.activeTab;
        if (activeTab !== void 0) {
          if (activeTab.input instanceof TextDiffTabInput || activeTab.input instanceof NotebookDiffEditorTabInput) {
            return activeTab.input.modified;
          } else if (activeTab.input instanceof TextTabInput || activeTab.input instanceof NotebookEditorTabInput || activeTab.input instanceof CustomEditorTabInput) {
            return activeTab.input.uri;
          }
        }
      }
      return void 0;
    }
    super({
      getFolderUri: (folderName) => {
        const found = context.folders.filter((f) => f.name === folderName);
        if (found && found.length > 0) {
          return found[0].uri;
        }
        return void 0;
      },
      getWorkspaceFolderCount: () => {
        return context.folders.length;
      },
      getConfigurationValue: (folderUri, section) => {
        return configProvider.getConfiguration(void 0, folderUri).get(section);
      },
      getAppRoot: () => {
        return process.cwd();
      },
      getExecPath: () => {
        return process.env["VSCODE_EXEC_PATH"];
      },
      getFilePath: () => {
        const activeUri = getActiveUri();
        if (activeUri) {
          return path.normalize(activeUri.fsPath);
        }
        return void 0;
      },
      getWorkspaceFolderPathForFile: () => {
        if (workspaceService) {
          const activeUri = getActiveUri();
          if (activeUri) {
            const ws = workspaceService.getWorkspaceFolder(activeUri);
            if (ws) {
              return path.normalize(ws.uri.fsPath);
            }
          }
        }
        return void 0;
      },
      getSelectedText: () => {
        if (editorService) {
          const activeEditor = editorService.activeEditor();
          if (activeEditor && !activeEditor.selection.isEmpty) {
            return activeEditor.document.getText(activeEditor.selection);
          }
        }
        return void 0;
      },
      getLineNumber: () => {
        if (editorService) {
          const activeEditor = editorService.activeEditor();
          if (activeEditor) {
            return String(activeEditor.selection.end.line + 1);
          }
        }
        return void 0;
      },
      getColumnNumber: () => {
        if (editorService) {
          const activeEditor = editorService.activeEditor();
          if (activeEditor) {
            return String(activeEditor.selection.end.character + 1);
          }
        }
        return void 0;
      },
      getExtension: (id) => {
        return extensionService.getExtension(id);
      }
    }, void 0, homeDir ? Promise.resolve(homeDir) : void 0, Promise.resolve(process.env));
  }
}
let ExtHostVariableResolverProviderService = class extends Disposable {
  constructor(extensionService, workspaceService, editorService, configurationService, editorTabs) {
    super();
    this.extensionService = extensionService;
    this.workspaceService = workspaceService;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.editorTabs = editorTabs;
    this._resolver = new Lazy(async () => {
      const configProvider = await this.configurationService.getConfigProvider();
      const folders = await this.workspaceService.getWorkspaceFolders2() || [];
      const dynamic = { folders };
      this._register(this.workspaceService.onDidChangeWorkspace(async (e) => {
        dynamic.folders = await this.workspaceService.getWorkspaceFolders2() || [];
      }));
      return new ExtHostVariableResolverService(
        this.extensionService,
        this.workspaceService,
        this.editorService,
        this.editorTabs,
        configProvider,
        dynamic,
        this.homeDir()
      );
    });
  }
  getResolver() {
    return this._resolver.value;
  }
  homeDir() {
    return void 0;
  }
};
ExtHostVariableResolverProviderService = __decorateClass([
  __decorateParam(0, IExtHostExtensionService),
  __decorateParam(1, IExtHostWorkspace),
  __decorateParam(2, IExtHostDocumentsAndEditors),
  __decorateParam(3, IExtHostConfiguration),
  __decorateParam(4, IExtHostEditorTabs)
], ExtHostVariableResolverProviderService);
export {
  ExtHostVariableResolverProviderService,
  IExtHostVariableResolverProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RWYXJpYWJsZVJlc29sdmVyU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCAqIGFzIHByb2Nlc3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgfSBmcm9tICcuL2V4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0RWRpdG9yVGFicyB9IGZyb20gJy4vZXh0SG9zdEVkaXRvclRhYnMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0RXh0ZW5zaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21FZGl0b3JUYWJJbnB1dCwgTm90ZWJvb2tEaWZmRWRpdG9yVGFiSW5wdXQsIE5vdGVib29rRWRpdG9yVGFiSW5wdXQsIFRleHREaWZmVGFiSW5wdXQsIFRleHRUYWJJbnB1dCB9IGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0V29ya3NwYWNlIH0gZnJvbSAnLi9leHRIb3N0V29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RWYXJpYWJsZVJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vdmFyaWFibGVSZXNvbHZlci5qcyc7XG5pbXBvcnQgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IEV4dEhvc3RDb25maWdQcm92aWRlciwgSUV4dEhvc3RDb25maWd1cmF0aW9uIH0gZnJvbSAnLi9leHRIb3N0Q29uZmlndXJhdGlvbi5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dEhvc3RWYXJpYWJsZVJlc29sdmVyUHJvdmlkZXIge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGdldFJlc29sdmVyKCk6IFByb21pc2U8SUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2U+O1xufVxuXG5leHBvcnQgY29uc3QgSUV4dEhvc3RWYXJpYWJsZVJlc29sdmVyUHJvdmlkZXIgPSBjcmVhdGVEZWNvcmF0b3I8SUV4dEhvc3RWYXJpYWJsZVJlc29sdmVyUHJvdmlkZXI+KCdJRXh0SG9zdFZhcmlhYmxlUmVzb2x2ZXJQcm92aWRlcicpO1xuXG5pbnRlcmZhY2UgRHluYW1pY0NvbnRleHQge1xuXHRmb2xkZXJzOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyW107XG59XG5cbmNsYXNzIEV4dEhvc3RWYXJpYWJsZVJlc29sdmVyU2VydmljZSBleHRlbmRzIEFic3RyYWN0VmFyaWFibGVSZXNvbHZlclNlcnZpY2Uge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dGVuc2lvblNlcnZpY2U6IElFeHRIb3N0RXh0ZW5zaW9uU2VydmljZSxcblx0XHR3b3Jrc3BhY2VTZXJ2aWNlOiBJRXh0SG9zdFdvcmtzcGFjZSxcblx0XHRlZGl0b3JTZXJ2aWNlOiBJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMsXG5cdFx0ZWRpdG9yVGFiczogSUV4dEhvc3RFZGl0b3JUYWJzLFxuXHRcdGNvbmZpZ1Byb3ZpZGVyOiBFeHRIb3N0Q29uZmlnUHJvdmlkZXIsXG5cdFx0Y29udGV4dDogRHluYW1pY0NvbnRleHQsXG5cdFx0aG9tZURpcjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHQpIHtcblx0XHRmdW5jdGlvbiBnZXRBY3RpdmVVcmkoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRcdGlmIChlZGl0b3JTZXJ2aWNlKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yKCk7XG5cdFx0XHRcdGlmIChhY3RpdmVFZGl0b3IpIHtcblx0XHRcdFx0XHRyZXR1cm4gYWN0aXZlRWRpdG9yLmRvY3VtZW50LnVyaTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBhY3RpdmVUYWIgPSBlZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwuZmluZChncm91cCA9PiBncm91cC5pc0FjdGl2ZSk/LmFjdGl2ZVRhYjtcblx0XHRcdFx0aWYgKGFjdGl2ZVRhYiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Ly8gUmVzb2x2ZSBhIHJlc291cmNlIGZyb20gdGhlIHRhYlxuXHRcdFx0XHRcdGlmIChhY3RpdmVUYWIuaW5wdXQgaW5zdGFuY2VvZiBUZXh0RGlmZlRhYklucHV0IHx8IGFjdGl2ZVRhYi5pbnB1dCBpbnN0YW5jZW9mIE5vdGVib29rRGlmZkVkaXRvclRhYklucHV0KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYWN0aXZlVGFiLmlucHV0Lm1vZGlmaWVkO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoYWN0aXZlVGFiLmlucHV0IGluc3RhbmNlb2YgVGV4dFRhYklucHV0IHx8IGFjdGl2ZVRhYi5pbnB1dCBpbnN0YW5jZW9mIE5vdGVib29rRWRpdG9yVGFiSW5wdXQgfHwgYWN0aXZlVGFiLmlucHV0IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yVGFiSW5wdXQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBhY3RpdmVUYWIuaW5wdXQudXJpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRzdXBlcih7XG5cdFx0XHRnZXRGb2xkZXJVcmk6IChmb2xkZXJOYW1lOiBzdHJpbmcpOiBVUkkgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRjb25zdCBmb3VuZCA9IGNvbnRleHQuZm9sZGVycy5maWx0ZXIoZiA9PiBmLm5hbWUgPT09IGZvbGRlck5hbWUpO1xuXHRcdFx0XHRpZiAoZm91bmQgJiYgZm91bmQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHJldHVybiBmb3VuZFswXS51cmk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRnZXRXb3Jrc3BhY2VGb2xkZXJDb3VudDogKCk6IG51bWJlciA9PiB7XG5cdFx0XHRcdHJldHVybiBjb250ZXh0LmZvbGRlcnMubGVuZ3RoO1xuXHRcdFx0fSxcblx0XHRcdGdldENvbmZpZ3VyYXRpb25WYWx1ZTogKGZvbGRlclVyaTogVVJJIHwgdW5kZWZpbmVkLCBzZWN0aW9uOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gY29uZmlnUHJvdmlkZXIuZ2V0Q29uZmlndXJhdGlvbih1bmRlZmluZWQsIGZvbGRlclVyaSkuZ2V0PHN0cmluZz4oc2VjdGlvbik7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0QXBwUm9vdDogKCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdHJldHVybiBwcm9jZXNzLmN3ZCgpO1xuXHRcdFx0fSxcblx0XHRcdGdldEV4ZWNQYXRoOiAoKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0cmV0dXJuIHByb2Nlc3MuZW52WydWU0NPREVfRVhFQ19QQVRIJ107XG5cdFx0XHR9LFxuXHRcdFx0Z2V0RmlsZVBhdGg6ICgpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRjb25zdCBhY3RpdmVVcmkgPSBnZXRBY3RpdmVVcmkoKTtcblx0XHRcdFx0aWYgKGFjdGl2ZVVyaSkge1xuXHRcdFx0XHRcdHJldHVybiBwYXRoLm5vcm1hbGl6ZShhY3RpdmVVcmkuZnNQYXRoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGdldFdvcmtzcGFjZUZvbGRlclBhdGhGb3JGaWxlOiAoKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0aWYgKHdvcmtzcGFjZVNlcnZpY2UpIHtcblx0XHRcdFx0XHRjb25zdCBhY3RpdmVVcmkgPSBnZXRBY3RpdmVVcmkoKTtcblx0XHRcdFx0XHRpZiAoYWN0aXZlVXJpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB3cyA9IHdvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKGFjdGl2ZVVyaSk7XG5cdFx0XHRcdFx0XHRpZiAod3MpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHBhdGgubm9ybWFsaXplKHdzLnVyaS5mc1BhdGgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGdldFNlbGVjdGVkVGV4dDogKCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGlmIChlZGl0b3JTZXJ2aWNlKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IoKTtcblx0XHRcdFx0XHRpZiAoYWN0aXZlRWRpdG9yICYmICFhY3RpdmVFZGl0b3Iuc2VsZWN0aW9uLmlzRW1wdHkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBhY3RpdmVFZGl0b3IuZG9jdW1lbnQuZ2V0VGV4dChhY3RpdmVFZGl0b3Iuc2VsZWN0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRnZXRMaW5lTnVtYmVyOiAoKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0aWYgKGVkaXRvclNlcnZpY2UpIHtcblx0XHRcdFx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcigpO1xuXHRcdFx0XHRcdGlmIChhY3RpdmVFZGl0b3IpIHtcblx0XHRcdFx0XHRcdHJldHVybiBTdHJpbmcoYWN0aXZlRWRpdG9yLnNlbGVjdGlvbi5lbmQubGluZSArIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGdldENvbHVtbk51bWJlcjogKCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGlmIChlZGl0b3JTZXJ2aWNlKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IoKTtcblx0XHRcdFx0XHRpZiAoYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gU3RyaW5nKGFjdGl2ZUVkaXRvci5zZWxlY3Rpb24uZW5kLmNoYXJhY3RlciArIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGdldEV4dGVuc2lvbjogKGlkKSA9PiB7XG5cdFx0XHRcdHJldHVybiBleHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbihpZCk7XG5cdFx0XHR9LFxuXHRcdH0sIHVuZGVmaW5lZCwgaG9tZURpciA/IFByb21pc2UucmVzb2x2ZShob21lRGlyKSA6IHVuZGVmaW5lZCwgUHJvbWlzZS5yZXNvbHZlKHByb2Nlc3MuZW52KSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RWYXJpYWJsZVJlc29sdmVyUHJvdmlkZXJTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRIb3N0VmFyaWFibGVSZXNvbHZlclByb3ZpZGVyIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZXIgPSBuZXcgTGF6eShhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnUHJvdmlkZXIgPSBhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldENvbmZpZ1Byb3ZpZGVyKCk7XG5cdFx0Y29uc3QgZm9sZGVycyA9IGF3YWl0IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXJzMigpIHx8IFtdO1xuXG5cdFx0Y29uc3QgZHluYW1pYzogRHluYW1pY0NvbnRleHQgPSB7IGZvbGRlcnMgfTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZVNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2UoYXN5bmMgZSA9PiB7XG5cdFx0XHRkeW5hbWljLmZvbGRlcnMgPSBhd2FpdCB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyczIoKSB8fCBbXTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gbmV3IEV4dEhvc3RWYXJpYWJsZVJlc29sdmVyU2VydmljZShcblx0XHRcdHRoaXMuZXh0ZW5zaW9uU2VydmljZSxcblx0XHRcdHRoaXMud29ya3NwYWNlU2VydmljZSxcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZSxcblx0XHRcdHRoaXMuZWRpdG9yVGFicyxcblx0XHRcdGNvbmZpZ1Byb3ZpZGVyLFxuXHRcdFx0ZHluYW1pYyxcblx0XHRcdHRoaXMuaG9tZURpcigpLFxuXHRcdCk7XG5cdH0pO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0SG9zdEV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0SG9zdEV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElFeHRIb3N0V29ya3NwYWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSUV4dEhvc3RXb3Jrc3BhY2UsXG5cdFx0QElFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyxcblx0XHRASUV4dEhvc3RDb25maWd1cmF0aW9uIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElFeHRIb3N0Q29uZmlndXJhdGlvbixcblx0XHRASUV4dEhvc3RFZGl0b3JUYWJzIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yVGFiczogSUV4dEhvc3RFZGl0b3JUYWJzLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHVibGljIGdldFJlc29sdmVyKCk6IFByb21pc2U8SUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2U+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZXIudmFsdWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgaG9tZURpcigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsa0JBQWtCO0FBQzNCLFlBQVksVUFBVTtBQUN0QixZQUFZLGFBQWE7QUFFekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxzQkFBc0IsNEJBQTRCLHdCQUF3QixrQkFBa0Isb0JBQW9CO0FBQ3pILFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsdUNBQXVDO0FBRWhELFNBQWdDLDZCQUE2QjtBQU90RCxNQUFNLG1DQUFtQyxnQkFBa0Qsa0NBQWtDO0FBTXBJLE1BQU0sdUNBQXVDLGdDQUFnQztBQUFBLEVBRTVFLFlBQ0Msa0JBQ0Esa0JBQ0EsZUFDQSxZQUNBLGdCQUNBLFNBQ0EsU0FDQztBQUNELGFBQVMsZUFBZ0M7QUFDeEMsVUFBSSxlQUFlO0FBQ2xCLGNBQU0sZUFBZSxjQUFjLGFBQWE7QUFDaEQsWUFBSSxjQUFjO0FBQ2pCLGlCQUFPLGFBQWEsU0FBUztBQUFBLFFBQzlCO0FBQ0EsY0FBTSxZQUFZLFdBQVcsVUFBVSxJQUFJLEtBQUssV0FBUyxNQUFNLFFBQVEsR0FBRztBQUMxRSxZQUFJLGNBQWMsUUFBVztBQUU1QixjQUFJLFVBQVUsaUJBQWlCLG9CQUFvQixVQUFVLGlCQUFpQiw0QkFBNEI7QUFDekcsbUJBQU8sVUFBVSxNQUFNO0FBQUEsVUFDeEIsV0FBVyxVQUFVLGlCQUFpQixnQkFBZ0IsVUFBVSxpQkFBaUIsMEJBQTBCLFVBQVUsaUJBQWlCLHNCQUFzQjtBQUMzSixtQkFBTyxVQUFVLE1BQU07QUFBQSxVQUN4QjtBQUFBLFFBQ0Q7QUFBQSxNQUNE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
