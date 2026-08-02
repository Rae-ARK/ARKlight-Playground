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
import * as nls from "../../../../nls.js";
import { IRemoteExplorerService, REMOTE_EXPLORER_TYPE_KEY } from "../../../services/remote/common/remoteExplorerService.js";
import { isStringArray } from "../../../../base/common/types.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { VIEWLET_ID } from "./remoteExplorer.js";
import { getVirtualWorkspaceLocation } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { Disposable, DisposableMap } from "../../../../base/common/lifecycle.js";
const SELECTED_REMOTE_IN_EXPLORER = new RawContextKey("selectedRemoteInExplorer", "");
let SwitchRemoteViewItem = class extends Disposable {
  constructor(contextKeyService, remoteExplorerService, environmentService, storageService, workspaceContextService) {
    super();
    this.contextKeyService = contextKeyService;
    this.remoteExplorerService = remoteExplorerService;
    this.environmentService = environmentService;
    this.storageService = storageService;
    this.workspaceContextService = workspaceContextService;
    this.completedRemotes = this._register(new DisposableMap());
    this.selectedRemoteContext = SELECTED_REMOTE_IN_EXPLORER.bindTo(contextKeyService);
    this.switchRemoteMenu = MenuId.for("workbench.remote.menu.switchRemoteMenu");
    this._register(MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
      submenu: this.switchRemoteMenu,
      title: nls.localize("switchRemote.label", "Switch Remote"),
      group: "navigation",
      when: ContextKeyExpr.equals("viewContainer", VIEWLET_ID),
      order: 1,
      isSelection: true
    }));
    this._register(remoteExplorerService.onDidChangeTargetType((e) => {
      this.select(e);
    }));
  }
  setSelectionForConnection() {
    let isSetForConnection = false;
    if (this.completedRemotes.size > 0) {
      let authority;
      const remoteAuthority = this.environmentService.remoteAuthority;
      let virtualWorkspace;
      if (!remoteAuthority) {
        virtualWorkspace = getVirtualWorkspaceLocation(this.workspaceContextService.getWorkspace())?.scheme;
      }
      isSetForConnection = true;
      const explorerType = remoteAuthority ? [remoteAuthority.split("+")[0]] : virtualWorkspace ? [virtualWorkspace] : this.storageService.get(REMOTE_EXPLORER_TYPE_KEY, StorageScope.WORKSPACE)?.split(",") ?? this.storageService.get(REMOTE_EXPLORER_TYPE_KEY, StorageScope.PROFILE)?.split(",");
      if (explorerType !== void 0) {
        authority = this.getAuthorityForExplorerType(explorerType);
      }
      if (authority) {
        this.select(authority);
      }
    }
    return isSetForConnection;
  }
  select(authority) {
    this.selectedRemoteContext.set(authority[0]);
    this.remoteExplorerService.targetType = authority;
  }
  getAuthorityForExplorerType(explorerType) {
    let authority;
    for (const option of this.completedRemotes) {
      for (const authorityOption of option[1].authority) {
        for (const explorerOption of explorerType) {
          if (authorityOption === explorerOption) {
            authority = option[1].authority;
            break;
          } else if (option[1].virtualWorkspace === explorerOption) {
            authority = option[1].authority;
            break;
          }
        }
      }
    }
    return authority;
  }
  removeOptionItems(views) {
    for (const view of views) {
      if (view.group && view.group.startsWith("targets") && view.remoteAuthority && (!view.when || this.contextKeyService.contextMatchesRules(view.when))) {
        const authority = isStringArray(view.remoteAuthority) ? view.remoteAuthority : [view.remoteAuthority];
        this.completedRemotes.deleteAndDispose(authority[0]);
      }
    }
  }
  createOptionItems(views) {
    const startingCount = this.completedRemotes.size;
    for (const view of views) {
      if (view.group && view.group.startsWith("targets") && view.remoteAuthority && (!view.when || this.contextKeyService.contextMatchesRules(view.when))) {
        const text = view.name;
        const authority = isStringArray(view.remoteAuthority) ? view.remoteAuthority : [view.remoteAuthority];
        if (this.completedRemotes.has(authority[0])) {
          continue;
        }
        const thisCapture = this;
        const action = registerAction2(class extends Action2 {
          constructor() {
            super({
              id: `workbench.action.remoteExplorer.show.${authority[0]}`,
              title: text,
              toggled: SELECTED_REMOTE_IN_EXPLORER.isEqualTo(authority[0]),
              menu: {
                id: thisCapture.switchRemoteMenu
              }
            });
          }
          async run() {
            thisCapture.select(authority);
          }
        });
        this.completedRemotes.set(authority[0], { text: text.value, authority, virtualWorkspace: view.virtualWorkspace, dispose: () => action.dispose() });
      }
    }
    if (this.completedRemotes.size > startingCount) {
      this.setSelectionForConnection();
    }
  }
};
SwitchRemoteViewItem = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IRemoteExplorerService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IWorkspaceContextService)
], SwitchRemoteViewItem);
export {
  SELECTED_REMOTE_IN_EXPLORER,
  SwitchRemoteViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZS9icm93c2VyL2V4cGxvcmVyVmlld0l0ZW1zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCBSRU1PVEVfRVhQTE9SRVJfVFlQRV9LRVkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUV4cGxvcmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0T3B0aW9uSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZWxlY3RCb3gvc2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZ0FycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBWSUVXTEVUX0lEIH0gZnJvbSAnLi9yZW1vdGVFeHBsb3Jlci5qcyc7XG5pbXBvcnQgeyBnZXRWaXJ0dWFsV29ya3NwYWNlTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3ZpcnR1YWxXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbmludGVyZmFjZSBJUmVtb3RlU2VsZWN0SXRlbSBleHRlbmRzIElTZWxlY3RPcHRpb25JdGVtIHtcblx0YXV0aG9yaXR5OiBzdHJpbmdbXTtcblx0dmlydHVhbFdvcmtzcGFjZT86IHN0cmluZztcblx0ZGlzcG9zZSgpOiB2b2lkO1xufVxuXG5leHBvcnQgY29uc3QgU0VMRUNURURfUkVNT1RFX0lOX0VYUExPUkVSID0gbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nPignc2VsZWN0ZWRSZW1vdGVJbkV4cGxvcmVyJywgJycpO1xuXG5leHBvcnQgY2xhc3MgU3dpdGNoUmVtb3RlVmlld0l0ZW0gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBzd2l0Y2hSZW1vdGVNZW51OiBNZW51SWQ7XG5cdHByaXZhdGUgY29tcGxldGVkUmVtb3RlczogRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElSZW1vdGVTZWxlY3RJdGVtPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlbGVjdGVkUmVtb3RlQ29udGV4dDogSUNvbnRleHRLZXk8c3RyaW5nPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVJlbW90ZUV4cGxvcmVyU2VydmljZSBwcml2YXRlIHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc2VsZWN0ZWRSZW1vdGVDb250ZXh0ID0gU0VMRUNURURfUkVNT1RFX0lOX0VYUExPUkVSLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLnN3aXRjaFJlbW90ZU1lbnUgPSBNZW51SWQuZm9yKCd3b3JrYmVuY2gucmVtb3RlLm1lbnUuc3dpdGNoUmVtb3RlTWVudScpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlLCB7XG5cdFx0XHRzdWJtZW51OiB0aGlzLnN3aXRjaFJlbW90ZU1lbnUsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdzd2l0Y2hSZW1vdGUubGFiZWwnLCBcIlN3aXRjaCBSZW1vdGVcIiksXG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyJywgVklFV0xFVF9JRCksXG5cdFx0XHRvcmRlcjogMSxcblx0XHRcdGlzU2VsZWN0aW9uOiB0cnVlXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlbW90ZUV4cGxvcmVyU2VydmljZS5vbkRpZENoYW5nZVRhcmdldFR5cGUoZSA9PiB7XG5cdFx0XHR0aGlzLnNlbGVjdChlKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2VsZWN0aW9uRm9yQ29ubmVjdGlvbigpOiBib29sZWFuIHtcblx0XHRsZXQgaXNTZXRGb3JDb25uZWN0aW9uID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuY29tcGxldGVkUmVtb3Rlcy5zaXplID4gMCkge1xuXHRcdFx0bGV0IGF1dGhvcml0eTogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0XHRsZXQgdmlydHVhbFdvcmtzcGFjZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCFyZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0dmlydHVhbFdvcmtzcGFjZSA9IGdldFZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbih0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKT8uc2NoZW1lO1xuXHRcdFx0fVxuXHRcdFx0aXNTZXRGb3JDb25uZWN0aW9uID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGV4cGxvcmVyVHlwZTogc3RyaW5nW10gfCB1bmRlZmluZWQgPSByZW1vdGVBdXRob3JpdHkgPyBbcmVtb3RlQXV0aG9yaXR5LnNwbGl0KCcrJylbMF1dXG5cdFx0XHRcdDogKHZpcnR1YWxXb3Jrc3BhY2UgPyBbdmlydHVhbFdvcmtzcGFjZV1cblx0XHRcdFx0XHQ6ICh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChSRU1PVEVfRVhQTE9SRVJfVFlQRV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpPy5zcGxpdCgnLCcpID8/IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFJFTU9URV9FWFBMT1JFUl9UWVBFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpPy5zcGxpdCgnLCcpKSk7XG5cdFx0XHRpZiAoZXhwbG9yZXJUeXBlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YXV0aG9yaXR5ID0gdGhpcy5nZXRBdXRob3JpdHlGb3JFeHBsb3JlclR5cGUoZXhwbG9yZXJUeXBlKTtcblx0XHRcdH1cblx0XHRcdGlmIChhdXRob3JpdHkpIHtcblx0XHRcdFx0dGhpcy5zZWxlY3QoYXV0aG9yaXR5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGlzU2V0Rm9yQ29ubmVjdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgc2VsZWN0KGF1dGhvcml0eTogc3RyaW5nW10pIHtcblx0XHR0aGlzLnNlbGVjdGVkUmVtb3RlQ29udGV4dC5zZXQoYXV0aG9yaXR5WzBdKTtcblx0XHR0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50YXJnZXRUeXBlID0gYXV0aG9yaXR5O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBdXRob3JpdHlGb3JFeHBsb3JlclR5cGUoZXhwbG9yZXJUeXBlOiBzdHJpbmdbXSk6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgYXV0aG9yaXR5OiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IG9wdGlvbiBvZiB0aGlzLmNvbXBsZXRlZFJlbW90ZXMpIHtcblx0XHRcdGZvciAoY29uc3QgYXV0aG9yaXR5T3B0aW9uIG9mIG9wdGlvblsxXS5hdXRob3JpdHkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBleHBsb3Jlck9wdGlvbiBvZiBleHBsb3JlclR5cGUpIHtcblx0XHRcdFx0XHRpZiAoYXV0aG9yaXR5T3B0aW9uID09PSBleHBsb3Jlck9wdGlvbikge1xuXHRcdFx0XHRcdFx0YXV0aG9yaXR5ID0gb3B0aW9uWzFdLmF1dGhvcml0eTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAob3B0aW9uWzFdLnZpcnR1YWxXb3Jrc3BhY2UgPT09IGV4cGxvcmVyT3B0aW9uKSB7XG5cdFx0XHRcdFx0XHRhdXRob3JpdHkgPSBvcHRpb25bMV0uYXV0aG9yaXR5O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBhdXRob3JpdHk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlT3B0aW9uSXRlbXModmlld3M6IElWaWV3RGVzY3JpcHRvcltdKSB7XG5cdFx0Zm9yIChjb25zdCB2aWV3IG9mIHZpZXdzKSB7XG5cdFx0XHRpZiAodmlldy5ncm91cCAmJiB2aWV3Lmdyb3VwLnN0YXJ0c1dpdGgoJ3RhcmdldHMnKSAmJiB2aWV3LnJlbW90ZUF1dGhvcml0eSAmJiAoIXZpZXcud2hlbiB8fCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXModmlldy53aGVuKSkpIHtcblx0XHRcdFx0Y29uc3QgYXV0aG9yaXR5ID0gaXNTdHJpbmdBcnJheSh2aWV3LnJlbW90ZUF1dGhvcml0eSkgPyB2aWV3LnJlbW90ZUF1dGhvcml0eSA6IFt2aWV3LnJlbW90ZUF1dGhvcml0eV07XG5cdFx0XHRcdHRoaXMuY29tcGxldGVkUmVtb3Rlcy5kZWxldGVBbmREaXNwb3NlKGF1dGhvcml0eVswXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNyZWF0ZU9wdGlvbkl0ZW1zKHZpZXdzOiBJVmlld0Rlc2NyaXB0b3JbXSkge1xuXHRcdGNvbnN0IHN0YXJ0aW5nQ291bnQgPSB0aGlzLmNvbXBsZXRlZFJlbW90ZXMuc2l6ZTtcblx0XHRmb3IgKGNvbnN0IHZpZXcgb2Ygdmlld3MpIHtcblx0XHRcdGlmICh2aWV3Lmdyb3VwICYmIHZpZXcuZ3JvdXAuc3RhcnRzV2l0aCgndGFyZ2V0cycpICYmIHZpZXcucmVtb3RlQXV0aG9yaXR5ICYmICghdmlldy53aGVuIHx8IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyh2aWV3LndoZW4pKSkge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gdmlldy5uYW1lO1xuXHRcdFx0XHRjb25zdCBhdXRob3JpdHkgPSBpc1N0cmluZ0FycmF5KHZpZXcucmVtb3RlQXV0aG9yaXR5KSA/IHZpZXcucmVtb3RlQXV0aG9yaXR5IDogW3ZpZXcucmVtb3RlQXV0aG9yaXR5XTtcblx0XHRcdFx0aWYgKHRoaXMuY29tcGxldGVkUmVtb3Rlcy5oYXMoYXV0aG9yaXR5WzBdKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHRoaXNDYXB0dXJlID0gdGhpcztcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gcmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbi5yZW1vdGVFeHBsb3Jlci5zaG93LiR7YXV0aG9yaXR5WzBdfWAsXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiB0ZXh0LFxuXHRcdFx0XHRcdFx0XHR0b2dnbGVkOiBTRUxFQ1RFRF9SRU1PVEVfSU5fRVhQTE9SRVIuaXNFcXVhbFRvKGF1dGhvcml0eVswXSksXG5cdFx0XHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogdGhpc0NhcHR1cmUuc3dpdGNoUmVtb3RlTWVudVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdFx0dGhpc0NhcHR1cmUuc2VsZWN0KGF1dGhvcml0eSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5jb21wbGV0ZWRSZW1vdGVzLnNldChhdXRob3JpdHlbMF0sIHsgdGV4dDogdGV4dC52YWx1ZSwgYXV0aG9yaXR5LCB2aXJ0dWFsV29ya3NwYWNlOiB2aWV3LnZpcnR1YWxXb3Jrc3BhY2UsIGRpc3Bvc2U6ICgpID0+IGFjdGlvbi5kaXNwb3NlKCkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLmNvbXBsZXRlZFJlbW90ZXMuc2l6ZSA+IHN0YXJ0aW5nQ291bnQpIHtcblx0XHRcdHRoaXMuc2V0U2VsZWN0aW9uRm9yQ29ubmVjdGlvbigpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyx3QkFBd0IsZ0NBQWdDO0FBR2pFLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLGdCQUE2QixvQkFBb0IscUJBQXFCO0FBQy9FLFNBQVMsU0FBUyxRQUFRLGNBQWMsdUJBQXVCO0FBQy9ELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMs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
