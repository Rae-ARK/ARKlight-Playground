import { ResourceMap, ResourceSet } from "../../../../../../base/common/map.js";
import { dirname, extUriBiasedIgnorePathCase } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize } from "../../../../../../nls.js";
import { observableMemento } from "../../../../../../platform/observable/common/observableMemento.js";
import { StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { ToolConfirmKind } from "../../chatService/chatService.js";
const workspaceAllowlistMemento = observableMemento({
  key: "chat.externalPath.workspaceAllowlist",
  defaultValue: [],
  toStorage: (value) => JSON.stringify(value),
  fromStorage: (value) => {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  }
});
class ChatExternalPathConfirmationContribution {
  constructor(_getPathInfo, _labelService, _findGitRoot, storageService, _pickFolder) {
    this._getPathInfo = _getPathInfo;
    this._labelService = _labelService;
    this._findGitRoot = _findGitRoot;
    this._pickFolder = _pickFolder;
    this.canUseDefaultApprovals = false;
    this._sessionFolderAllowlist = new ResourceMap();
    /** Cache of path URI -> resolved git root URI (or null if not in a repo) */
    this._gitRootCache = new ResourceMap();
    if (storageService) {
      this._workspaceAllowlist = workspaceAllowlistMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE, storageService);
    }
  }
  dispose() {
    this._workspaceAllowlist?.dispose();
  }
  _getWorkspaceFolders() {
    if (!this._workspaceAllowlist) {
      return new ResourceSet();
    }
    const set = new ResourceSet();
    for (const s of this._workspaceAllowlist.get()) {
      try {
        set.add(URI.parse(s));
      } catch {
      }
    }
    return set;
  }
  _setWorkspaceFolders(folders) {
    if (!this._workspaceAllowlist) {
      return;
    }
    const uriStrings = [];
    for (const uri of folders) {
      uriStrings.push(uri.toString());
    }
    this._workspaceAllowlist.set(uriStrings, void 0);
  }
  getPreConfirmAction(ref) {
    const pathInfo = this._getPathInfo(ref);
    if (!pathInfo) {
      return void 0;
    }
    let pathUri;
    try {
      pathUri = URI.file(pathInfo.path);
    } catch {
      return void 0;
    }
    if (ref.workingDirectory) {
      if (extUriBiasedIgnorePathCase.isEqualOrParent(pathUri, ref.workingDirectory)) {
        return { type: ToolConfirmKind.UserAction };
      }
    } else {
      const workspaceFolders = this._getWorkspaceFolders();
      for (const folderUri of workspaceFolders) {
        if (extUriBiasedIgnorePathCase.isEqualOrParent(pathUri, folderUri)) {
          return { type: ToolConfirmKind.UserAction };
        }
      }
    }
    if (ref.chatSessionResource) {
      const sessionFolders = this._sessionFolderAllowlist.get(ref.chatSessionResource);
      if (sessionFolders) {
        for (const folderUri of sessionFolders) {
          if (extUriBiasedIgnorePathCase.isEqualOrParent(pathUri, folderUri)) {
            return { type: ToolConfirmKind.UserAction };
          }
        }
      }
    }
    return void 0;
  }
  getPreConfirmActions(ref) {
    const pathInfo = this._getPathInfo(ref);
    if (!pathInfo || !ref.chatSessionResource) {
      return [];
    }
    let pathUri;
    try {
      pathUri = URI.file(pathInfo.path);
    } catch {
      return [];
    }
    const folderUri = pathInfo.isDirectory ? pathUri : dirname(pathUri);
    const sessionResource = ref.chatSessionResource;
    const actions = [
      {
        label: localize("allowFolderSession", "Allow this folder in this session"),
        detail: localize("allowFolderSessionDetail", "Allow reading files from this folder without further confirmation in this chat session"),
        select: async () => {
          let folders = this._sessionFolderAllowlist.get(sessionResource);
          if (!folders) {
            folders = new ResourceSet();
            this._sessionFolderAllowlist.set(sessionResource, folders);
          }
          folders.add(folderUri);
          return true;
        }
      }
    ];
    if (this._findGitRoot) {
      const findGitRoot = this._findGitRoot;
      const gitRootCache = this._gitRootCache;
      const allowlist = this._sessionFolderAllowlist;
      const cached = gitRootCache.get(pathUri);
      if (cached === null) {
      } else if (cached) {
        actions.push({
          label: localize("allowRepoSession", "Allow all files in this repository for this session"),
          detail: localize("allowRepoSessionDetail", "Allow reading files from {0}", cached.fsPath),
          select: async () => {
            let folders = allowlist.get(sessionResource);
            if (!folders) {
              folders = new ResourceSet();
              allowlist.set(sessionResource, folders);
            }
            folders.add(cached);
            return true;
          }
        });
      } else {
        actions.push({
          label: localize("allowRepoSession", "Allow all files in this repository for this session"),
          detail: localize("allowRepoSessionDetailLookup", "Looks up the containing git repository for this path"),
          select: async () => {
            const gitRootUri = await findGitRoot(pathUri);
            gitRootCache.set(pathUri, gitRootUri ?? null);
            let folders = allowlist.get(sessionResource);
            if (!folders) {
              folders = new ResourceSet();
              allowlist.set(sessionResource, folders);
            }
            folders.add(gitRootUri ?? folderUri);
            return true;
          }
        });
      }
    }
    return actions;
  }
  getManageActions() {
    const items = [];
    const workspaceFolders = this._getWorkspaceFolders();
    for (const folderUri of workspaceFolders) {
      items.push({
        label: this._labelService.getUriLabel(folderUri),
        description: localize("workspaceScope", "Workspace"),
        checked: true,
        onDidChangeChecked: (checked) => {
          if (!checked) {
            workspaceFolders.delete(folderUri);
            this._setWorkspaceFolders(workspaceFolders);
          } else {
            workspaceFolders.add(folderUri);
            this._setWorkspaceFolders(workspaceFolders);
          }
        }
      });
    }
    const allSessionFolders = new ResourceSet();
    for (const [, folders] of this._sessionFolderAllowlist) {
      for (const folder of folders) {
        allSessionFolders.add(folder);
      }
    }
    for (const folderUri of allSessionFolders) {
      const wasInSessions = [...this._sessionFolderAllowlist].filter(([, folders]) => folders.has(folderUri));
      items.push({
        label: this._labelService.getUriLabel(folderUri),
        description: localize("sessionScope", "Session"),
        checked: true,
        onDidChangeChecked: (checked) => {
          if (!checked) {
            for (const [, folders] of wasInSessions) {
              folders.delete(folderUri);
            }
          } else {
            for (const [, folders] of wasInSessions) {
              folders.add(folderUri);
            }
          }
        }
      });
    }
    if (this._pickFolder) {
      const pickFolder = this._pickFolder;
      items.push({
        pickable: false,
        label: localize("addPath", "Add Path..."),
        description: localize("addPathDescription", "Allow a folder in this workspace"),
        onDidOpen: async () => {
          const uri = await pickFolder();
          if (uri) {
            const folders = this._getWorkspaceFolders();
            folders.add(uri);
            this._setWorkspaceFolders(folders);
          }
        }
      });
    }
    return items;
  }
  reset() {
    this._sessionFolderAllowlist.clear();
    this._gitRootCache.clear();
    if (this._workspaceAllowlist) {
      this._workspaceAllowlist.set([], void 0);
    }
  }
}
export {
  ChatExternalPathConfirmationContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9jaGF0RXh0ZXJuYWxQYXRoQ29uZmlybWF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAsIFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IE9ic2VydmFibGVNZW1lbnRvLCBvYnNlcnZhYmxlTWVtZW50byB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL29ic2VydmFibGVNZW1lbnRvLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBDb25maXJtZWRSZWFzb24sIFRvb2xDb25maXJtS2luZCB9IGZyb20gJy4uLy4uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7XG5cdElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkFjdGlvbnMsXG5cdElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbixcblx0SUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uUXVpY2tUcmVlSXRlbSxcblx0SUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmXG59IGZyb20gJy4uL2xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UuanMnO1xuXG5jb25zdCB3b3Jrc3BhY2VBbGxvd2xpc3RNZW1lbnRvID0gb2JzZXJ2YWJsZU1lbWVudG88cmVhZG9ubHkgc3RyaW5nW10+KHtcblx0a2V5OiAnY2hhdC5leHRlcm5hbFBhdGgud29ya3NwYWNlQWxsb3dsaXN0Jyxcblx0ZGVmYXVsdFZhbHVlOiBbXSxcblx0dG9TdG9yYWdlOiB2YWx1ZSA9PiBKU09OLnN0cmluZ2lmeSh2YWx1ZSksXG5cdGZyb21TdG9yYWdlOiB2YWx1ZSA9PiB7XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZSh2YWx1ZSk7XG5cdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkocGFyc2VkKSA/IHBhcnNlZCA6IFtdO1xuXHR9LFxufSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVybmFsUGF0aEluZm8ge1xuXHRwYXRoOiBzdHJpbmc7XG5cdGlzRGlyZWN0b3J5OiBib29sZWFuO1xufVxuXG4vKipcbiAqIENvbmZpcm1hdGlvbiBjb250cmlidXRpb24gZm9yIHJlYWRfZmlsZSBhbmQgbGlzdF9kaXIgdG9vbHMgdGhhdCBhbGxvd3MgdXNlcnMgdG8gYXBwcm92ZVxuICogYWNjZXNzaW5nIHBhdGhzIG91dHNpZGUgdGhlIHdvcmtzcGFjZSwgd2l0aCBhbiBvcHRpb24gdG8gYWxsb3cgYWxsIGFjY2Vzc1xuICogZnJvbSBhIGNvbnRhaW5pbmcgZm9sZGVyIGZvciB0aGUgY3VycmVudCBjaGF0IHNlc3Npb24uXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0RXh0ZXJuYWxQYXRoQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uIGltcGxlbWVudHMgSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uLCBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGNhblVzZURlZmF1bHRBcHByb3ZhbHMgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRm9sZGVyQWxsb3dsaXN0ID0gbmV3IFJlc291cmNlTWFwPFJlc291cmNlU2V0PigpO1xuXHQvKiogQ2FjaGUgb2YgcGF0aCBVUkkgLT4gcmVzb2x2ZWQgZ2l0IHJvb3QgVVJJIChvciBudWxsIGlmIG5vdCBpbiBhIHJlcG8pICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2dpdFJvb3RDYWNoZSA9IG5ldyBSZXNvdXJjZU1hcDxVUkkgfCBudWxsPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VBbGxvd2xpc3Q/OiBPYnNlcnZhYmxlTWVtZW50bzxyZWFkb25seSBzdHJpbmdbXT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0UGF0aEluZm86IChyZWY6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZikgPT4gSUV4dGVybmFsUGF0aEluZm8gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ZpbmRHaXRSb290PzogKHBhdGhVcmk6IFVSSSkgPT4gUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+LFxuXHRcdHN0b3JhZ2VTZXJ2aWNlPzogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BpY2tGb2xkZXI/OiAoKSA9PiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4sXG5cdCkge1xuXHRcdGlmIChzdG9yYWdlU2VydmljZSkge1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlQWxsb3dsaXN0ID0gd29ya3NwYWNlQWxsb3dsaXN0TWVtZW50byhTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3dvcmtzcGFjZUFsbG93bGlzdD8uZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0V29ya3NwYWNlRm9sZGVycygpOiBSZXNvdXJjZVNldCB7XG5cdFx0aWYgKCF0aGlzLl93b3Jrc3BhY2VBbGxvd2xpc3QpIHtcblx0XHRcdHJldHVybiBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHR9XG5cdFx0Y29uc3Qgc2V0ID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0Zm9yIChjb25zdCBzIG9mIHRoaXMuX3dvcmtzcGFjZUFsbG93bGlzdC5nZXQoKSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0c2V0LmFkZChVUkkucGFyc2UocykpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBtYWxmb3JtZWQgVVJJc1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc2V0O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0V29ya3NwYWNlRm9sZGVycyhmb2xkZXJzOiBSZXNvdXJjZVNldCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fd29ya3NwYWNlQWxsb3dsaXN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHVyaVN0cmluZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgZm9sZGVycykge1xuXHRcdFx0dXJpU3RyaW5ncy5wdXNoKHVyaS50b1N0cmluZygpKTtcblx0XHR9XG5cdFx0dGhpcy5fd29ya3NwYWNlQWxsb3dsaXN0LnNldCh1cmlTdHJpbmdzLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Z2V0UHJlQ29uZmlybUFjdGlvbihyZWY6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZik6IENvbmZpcm1lZFJlYXNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcGF0aEluZm8gPSB0aGlzLl9nZXRQYXRoSW5mbyhyZWYpO1xuXHRcdGlmICghcGF0aEluZm8pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gUGFyc2UgdGhlIGZpbGUgcGF0aCB0byBhIFVSSVxuXHRcdGxldCBwYXRoVXJpOiBVUkk7XG5cdFx0dHJ5IHtcblx0XHRcdHBhdGhVcmkgPSBVUkkuZmlsZShwYXRoSW5mby5wYXRoKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiBhIHdvcmtpbmcgZGlyZWN0b3J5IGlzIHNldCAoYWdlbnRzIHdpbmRvdyksIGl0IGlzIHRoZSBzb3VyY2Ugb2YgdHJ1dGhcblx0XHQvLyBmb3IgZGV0ZXJtaW5pbmcgd2hldGhlciBhIHBhdGggaXMgd29ya3NwYWNlLWludGVybmFsLiBPbmx5IGZhbGwgYmFjayB0byB0aGVcblx0XHQvLyB3b3Jrc3BhY2UtbGV2ZWwgYWxsb3dsaXN0IHdoZW4gbm8gd29ya2luZyBkaXJlY3RvcnkgaXMgc3BlY2lmaWVkLlxuXHRcdGlmIChyZWYud29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0aWYgKGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudChwYXRoVXJpLCByZWYud29ya2luZ0RpcmVjdG9yeSkpIHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IHRoaXMuX2dldFdvcmtzcGFjZUZvbGRlcnMoKTtcblx0XHRcdGZvciAoY29uc3QgZm9sZGVyVXJpIG9mIHdvcmtzcGFjZUZvbGRlcnMpIHtcblx0XHRcdFx0aWYgKGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudChwYXRoVXJpLCBmb2xkZXJVcmkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIHNlc3Npb24tbGV2ZWwgYWxsb3dsaXN0XG5cdFx0aWYgKHJlZi5jaGF0U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uRm9sZGVycyA9IHRoaXMuX3Nlc3Npb25Gb2xkZXJBbGxvd2xpc3QuZ2V0KHJlZi5jaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChzZXNzaW9uRm9sZGVycykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGZvbGRlclVyaSBvZiBzZXNzaW9uRm9sZGVycykge1xuXHRcdFx0XHRcdGlmIChleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsT3JQYXJlbnQocGF0aFVyaSwgZm9sZGVyVXJpKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0UHJlQ29uZmlybUFjdGlvbnMocmVmOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25SZWYpOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25BY3Rpb25zW10ge1xuXHRcdGNvbnN0IHBhdGhJbmZvID0gdGhpcy5fZ2V0UGF0aEluZm8ocmVmKTtcblx0XHRpZiAoIXBhdGhJbmZvIHx8ICFyZWYuY2hhdFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIFBhcnNlIHRoZSBwYXRoIHRvIGEgVVJJXG5cdFx0bGV0IHBhdGhVcmk6IFVSSTtcblx0XHR0cnkge1xuXHRcdFx0cGF0aFVyaSA9IFVSSS5maWxlKHBhdGhJbmZvLnBhdGgpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIEZvciBkaXJlY3RvcmllcywgdXNlIHRoZSBwYXRoIGl0c2VsZjsgZm9yIGZpbGVzLCB1c2UgdGhlIHBhcmVudCBkaXJlY3Rvcnlcblx0XHRjb25zdCBmb2xkZXJVcmkgPSBwYXRoSW5mby5pc0RpcmVjdG9yeSA/IHBhdGhVcmkgOiBkaXJuYW1lKHBhdGhVcmkpO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHJlZi5jaGF0U2Vzc2lvblJlc291cmNlO1xuXG5cdFx0Y29uc3QgYWN0aW9uczogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQWN0aW9uc1tdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93Rm9sZGVyU2Vzc2lvbicsICdBbGxvdyB0aGlzIGZvbGRlciBpbiB0aGlzIHNlc3Npb24nKSxcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYWxsb3dGb2xkZXJTZXNzaW9uRGV0YWlsJywgJ0FsbG93IHJlYWRpbmcgZmlsZXMgZnJvbSB0aGlzIGZvbGRlciB3aXRob3V0IGZ1cnRoZXIgY29uZmlybWF0aW9uIGluIHRoaXMgY2hhdCBzZXNzaW9uJyksXG5cdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGxldCBmb2xkZXJzID0gdGhpcy5fc2Vzc2lvbkZvbGRlckFsbG93bGlzdC5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHRpZiAoIWZvbGRlcnMpIHtcblx0XHRcdFx0XHRcdGZvbGRlcnMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25Gb2xkZXJBbGxvd2xpc3Quc2V0KHNlc3Npb25SZXNvdXJjZSwgZm9sZGVycyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvbGRlcnMuYWRkKGZvbGRlclVyaSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Ly8gSWYgYSBnaXQgcm9vdCBmaW5kZXIgaXMgYXZhaWxhYmxlLCBvZmZlciB0byBhbGxvdyB0aGUgZW50aXJlIHJlcG9zaXRvcnlcblx0XHRpZiAodGhpcy5fZmluZEdpdFJvb3QpIHtcblx0XHRcdGNvbnN0IGZpbmRHaXRSb290ID0gdGhpcy5fZmluZEdpdFJvb3Q7XG5cdFx0XHRjb25zdCBnaXRSb290Q2FjaGUgPSB0aGlzLl9naXRSb290Q2FjaGU7XG5cdFx0XHRjb25zdCBhbGxvd2xpc3QgPSB0aGlzLl9zZXNzaW9uRm9sZGVyQWxsb3dsaXN0O1xuXG5cdFx0XHQvLyBDaGVjayBpZiB3ZSBhbHJlYWR5IGtub3cgdGhlIGdpdCByb290IGZvciB0aGlzIHBhdGggKG9yIHRoYXQgdGhlcmUgaXMgbm9uZSlcblx0XHRcdGNvbnN0IGNhY2hlZCA9IGdpdFJvb3RDYWNoZS5nZXQocGF0aFVyaSk7XG5cdFx0XHRpZiAoY2FjaGVkID09PSBudWxsKSB7XG5cdFx0XHRcdC8vIFByZXZpb3VzbHkgcmVzb2x2ZWQ6IG5vdCBpbiBhIGdpdCByZXBvc2l0b3J5LCBkb24ndCBzaG93IHRoZSBvcHRpb25cblx0XHRcdH0gZWxzZSBpZiAoY2FjaGVkKSB7XG5cdFx0XHRcdC8vIFByZXZpb3VzbHkgcmVzb2x2ZWQ6IHNob3cgd2l0aCB0aGUga25vd24gcmVwbyBwYXRoXG5cdFx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhbGxvd1JlcG9TZXNzaW9uJywgJ0FsbG93IGFsbCBmaWxlcyBpbiB0aGlzIHJlcG9zaXRvcnkgZm9yIHRoaXMgc2Vzc2lvbicpLFxuXHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2FsbG93UmVwb1Nlc3Npb25EZXRhaWwnLCAnQWxsb3cgcmVhZGluZyBmaWxlcyBmcm9tIHswfScsIGNhY2hlZC5mc1BhdGgpLFxuXHRcdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0bGV0IGZvbGRlcnMgPSBhbGxvd2xpc3QuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRpZiAoIWZvbGRlcnMpIHtcblx0XHRcdFx0XHRcdFx0Zm9sZGVycyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdFx0XHRcdFx0XHRhbGxvd2xpc3Quc2V0KHNlc3Npb25SZXNvdXJjZSwgZm9sZGVycyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRmb2xkZXJzLmFkZChjYWNoZWQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIE5vdCB5ZXQgcmVzb2x2ZWQ6IHNob3cgdGhlIG9wdGlvbiBhbmQgcmVzb2x2ZSBvbiBzZWxlY3Rpb25cblx0XHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93UmVwb1Nlc3Npb24nLCAnQWxsb3cgYWxsIGZpbGVzIGluIHRoaXMgcmVwb3NpdG9yeSBmb3IgdGhpcyBzZXNzaW9uJyksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYWxsb3dSZXBvU2Vzc2lvbkRldGFpbExvb2t1cCcsICdMb29rcyB1cCB0aGUgY29udGFpbmluZyBnaXQgcmVwb3NpdG9yeSBmb3IgdGhpcyBwYXRoJyksXG5cdFx0XHRcdFx0c2VsZWN0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBnaXRSb290VXJpID0gYXdhaXQgZmluZEdpdFJvb3QocGF0aFVyaSk7XG5cdFx0XHRcdFx0XHRnaXRSb290Q2FjaGUuc2V0KHBhdGhVcmksIGdpdFJvb3RVcmkgPz8gbnVsbCk7XG5cdFx0XHRcdFx0XHRsZXQgZm9sZGVycyA9IGFsbG93bGlzdC5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHRcdGlmICghZm9sZGVycykge1xuXHRcdFx0XHRcdFx0XHRmb2xkZXJzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0XHRcdFx0XHRcdGFsbG93bGlzdC5zZXQoc2Vzc2lvblJlc291cmNlLCBmb2xkZXJzKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdC8vIElmIHdlIGZvdW5kIHRoZSBnaXQgcm9vdCwgYWxsb3cgdGhlIGVudGlyZSByZXBvOyBvdGhlcndpc2UgZmFsbCBiYWNrIHRvIGp1c3QgdGhpcyBmb2xkZXJcblx0XHRcdFx0XHRcdGZvbGRlcnMuYWRkKGdpdFJvb3RVcmkgPz8gZm9sZGVyVXJpKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRnZXRNYW5hZ2VBY3Rpb25zKCk6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvblF1aWNrVHJlZUl0ZW1bXSB7XG5cdFx0Y29uc3QgaXRlbXM6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvblF1aWNrVHJlZUl0ZW1bXSA9IFtdO1xuXG5cdFx0Ly8gV29ya3NwYWNlLWxldmVsIGVudHJpZXMgKHBlcnNpc3RlZClcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gdGhpcy5fZ2V0V29ya3NwYWNlRm9sZGVycygpO1xuXHRcdGZvciAoY29uc3QgZm9sZGVyVXJpIG9mIHdvcmtzcGFjZUZvbGRlcnMpIHtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGZvbGRlclVyaSksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd29ya3NwYWNlU2NvcGUnLCBcIldvcmtzcGFjZVwiKSxcblx0XHRcdFx0Y2hlY2tlZDogdHJ1ZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VDaGVja2VkOiAoY2hlY2tlZCkgPT4ge1xuXHRcdFx0XHRcdGlmICghY2hlY2tlZCkge1xuXHRcdFx0XHRcdFx0d29ya3NwYWNlRm9sZGVycy5kZWxldGUoZm9sZGVyVXJpKTtcblx0XHRcdFx0XHRcdHRoaXMuX3NldFdvcmtzcGFjZUZvbGRlcnMod29ya3NwYWNlRm9sZGVycyk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHdvcmtzcGFjZUZvbGRlcnMuYWRkKGZvbGRlclVyaSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZXRXb3Jrc3BhY2VGb2xkZXJzKHdvcmtzcGFjZUZvbGRlcnMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFNlc3Npb24tbGV2ZWwgZW50cmllcyAoZXBoZW1lcmFsKVxuXHRcdGNvbnN0IGFsbFNlc3Npb25Gb2xkZXJzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0Zm9yIChjb25zdCBbLCBmb2xkZXJzXSBvZiB0aGlzLl9zZXNzaW9uRm9sZGVyQWxsb3dsaXN0KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiBmb2xkZXJzKSB7XG5cdFx0XHRcdGFsbFNlc3Npb25Gb2xkZXJzLmFkZChmb2xkZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGZvbGRlclVyaSBvZiBhbGxTZXNzaW9uRm9sZGVycykge1xuXHRcdFx0Y29uc3Qgd2FzSW5TZXNzaW9ucyA9IFsuLi50aGlzLl9zZXNzaW9uRm9sZGVyQWxsb3dsaXN0XS5maWx0ZXIoKFssIGZvbGRlcnNdKSA9PiBmb2xkZXJzLmhhcyhmb2xkZXJVcmkpKTtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGZvbGRlclVyaSksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2Vzc2lvblNjb3BlJywgXCJTZXNzaW9uXCIpLFxuXHRcdFx0XHRjaGVja2VkOiB0cnVlLFxuXHRcdFx0XHRvbkRpZENoYW5nZUNoZWNrZWQ6IChjaGVja2VkKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFjaGVja2VkKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IFssIGZvbGRlcnNdIG9mIHdhc0luU2Vzc2lvbnMpIHtcblx0XHRcdFx0XHRcdFx0Zm9sZGVycy5kZWxldGUoZm9sZGVyVXJpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBbLCBmb2xkZXJzXSBvZiB3YXNJblNlc3Npb25zKSB7XG5cdFx0XHRcdFx0XHRcdGZvbGRlcnMuYWRkKGZvbGRlclVyaSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gXCJBZGQgUGF0aC4uLlwiIG9wdGlvbiB0byBhZGQgYSBuZXcgd29ya3NwYWNlLWxldmVsIGZvbGRlclxuXHRcdGlmICh0aGlzLl9waWNrRm9sZGVyKSB7XG5cdFx0XHRjb25zdCBwaWNrRm9sZGVyID0gdGhpcy5fcGlja0ZvbGRlcjtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRwaWNrYWJsZTogZmFsc2UsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWRkUGF0aCcsIFwiQWRkIFBhdGguLi5cIiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWRkUGF0aERlc2NyaXB0aW9uJywgXCJBbGxvdyBhIGZvbGRlciBpbiB0aGlzIHdvcmtzcGFjZVwiKSxcblx0XHRcdFx0b25EaWRPcGVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdXJpID0gYXdhaXQgcGlja0ZvbGRlcigpO1xuXHRcdFx0XHRcdGlmICh1cmkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLl9nZXRXb3Jrc3BhY2VGb2xkZXJzKCk7XG5cdFx0XHRcdFx0XHRmb2xkZXJzLmFkZCh1cmkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fc2V0V29ya3NwYWNlRm9sZGVycyhmb2xkZXJzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cdHJlc2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25Gb2xkZXJBbGxvd2xpc3QuY2xlYXIoKTtcblx0XHR0aGlzLl9naXRSb290Q2FjaGUuY2xlYXIoKTtcblx0XHRpZiAodGhpcy5fd29ya3NwYWNlQWxsb3dsaXN0KSB7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VBbGxvd2xpc3Quc2V0KFtdLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLFNBQVMsa0NBQWtDO0FBQ3BELFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUV6QixTQUE0Qix5QkFBeUI7QUFDckQsU0FBMEIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBMEIsdUJBQXVCO0FBUWpELE1BQU0sNEJBQTRCLGtCQUFxQztBQUFBLEVBQ3RFLEtBQUs7QUFBQSxFQUNMLGNBQWMsQ0FBQztB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
