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
import { toAction } from "../../../../base/common/actions.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { autorun } from "../../../../base/common/observable.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { IsSessionsWindowContext } from "../../../../workbench/common/contextkeys.js";
import { CHAT_CATEGORY } from "../../../../workbench/contrib/chat/browser/actions/chatActions.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { URI } from "../../../../base/common/uri.js";
import { SessionIsArchivedContext } from "../../../common/contextkeys.js";
const hasWorktreeAndRepositoryContextKey = new RawContextKey("agentSessionHasWorktreeAndRepository", false, {
  type: "boolean",
  description: localize("agentSessionHasWorktreeAndRepository", "True when the active agent session has both a worktree and a parent repository.")
});
let ApplyChangesToParentRepoContribution = class extends Disposable {
  constructor(contextKeyService, sessionsService) {
    super();
    const worktreeAndRepoKey = hasWorktreeAndRepositoryContextKey.bindTo(contextKeyService);
    this._register(autorun((reader) => {
      const activeSession = sessionsService.activeSession.read(reader);
      const folder = activeSession?.workspace.read(reader)?.folders[0];
      const hasWorktreeAndRepo = !!folder?.gitRepository?.workTreeUri;
      worktreeAndRepoKey.set(hasWorktreeAndRepo);
    }));
  }
};
ApplyChangesToParentRepoContribution.ID = "sessions.contrib.applyChangesToParentRepo";
ApplyChangesToParentRepoContribution = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ISessionsService)
], ApplyChangesToParentRepoContribution);
const _ApplyChangesToParentRepoAction = class _ApplyChangesToParentRepoAction extends Action2 {
  constructor() {
    super({
      id: _ApplyChangesToParentRepoAction.ID,
      title: localize2("applyChangesToParentRepo", "Apply Changes to Parent Repository"),
      icon: Codicon.desktopDownload,
      category: CHAT_CATEGORY,
      precondition: ContextKeyExpr.and(
        IsSessionsWindowContext,
        hasWorktreeAndRepositoryContextKey
      ),
      menu: [
        {
          id: MenuId.AgentsChangesPrimaryActionSubMenu,
          group: "navigation",
          order: 2,
          when: ContextKeyExpr.and(
            ContextKeyExpr.false(),
            IsSessionsWindowContext,
            hasWorktreeAndRepositoryContextKey
          )
        }
      ]
    });
  }
  async run(accessor) {
    const sessionsService = accessor.get(ISessionsService);
    const commandService = accessor.get(ICommandService);
    const notificationService = accessor.get(INotificationService);
    const logService = accessor.get(ILogService);
    const openerService = accessor.get(IOpenerService);
    const productService = accessor.get(IProductService);
    const activeSession = sessionsService.activeSession.get();
    const folder = activeSession?.workspace.get()?.folders[0];
    if (!activeSession || !folder?.gitRepository?.workTreeUri) {
      return;
    }
    const worktreeRoot = folder.gitRepository.workTreeUri;
    const repoRoot = folder.root;
    const openFolderAction = toAction({
      id: "applyChangesToParentRepo.openFolder",
      label: localize("openInVSCode", "Open in VS Code"),
      run: () => {
        const scheme = productService.quality === "stable" ? "vscode" : productService.quality === "exploration" ? "vscode-exploration" : "vscode-insiders";
        const params = new URLSearchParams();
        params.set("windowId", "_blank");
        params.set("session", activeSession.resource.toString());
        openerService.open(URI.from({
          scheme,
          authority: Schemas.file,
          path: repoRoot.path,
          query: params.toString()
        }), { openExternal: true });
      }
    });
    try {
      const worktreeBranch = await commandService.executeCommand(
        "_git.revParseAbbrevRef",
        worktreeRoot.fsPath
      );
      if (!worktreeBranch) {
        notificationService.notify({
          severity: Severity.Warning,
          message: localize("applyChangesNoBranch", "Could not determine worktree branch name.")
        });
        return;
      }
      const result = await commandService.executeCommand("_git.mergeBranch", repoRoot.fsPath, worktreeBranch);
      if (!result) {
        logService.warn("[ApplyChangesToParentRepo] No result from merge command");
      } else {
        notificationService.notify({
          severity: Severity.Info,
          message: typeof result === "string" && result.startsWith("Already up to date") ? localize("alreadyUpToDate", "Parent repository is up to date with worktree.") : localize("applyChangesSuccess", "Applied changes to parent repository."),
          actions: { primary: [openFolderAction] }
        });
      }
    } catch (err) {
      logService.error("[ApplyChangesToParentRepo] Failed to apply changes", err);
      notificationService.notify({
        severity: Severity.Warning,
        message: localize("applyChangesConflict", "Failed to apply changes to parent repo. The parent repo may have diverged \u2014 resolve conflicts manually."),
        actions: { primary: [openFolderAction] }
      });
    }
  }
};
_ApplyChangesToParentRepoAction.ID = "chatEditing.applyChangesToParentRepo";
let ApplyChangesToParentRepoAction = _ApplyChangesToParentRepoAction;
registerAction2(ApplyChangesToParentRepoAction);
registerWorkbenchContribution2(ApplyChangesToParentRepoContribution.ID, ApplyChangesToParentRepoContribution, WorkbenchPhase.AfterRestored);
MenuRegistry.appendMenuItem(MenuId.AgentsChangesToolbar, {
  submenu: MenuId.AgentsChangesPrimaryActionSubMenu,
  title: localize2("applyActions", "Apply Actions"),
  group: "navigation",
  order: 1,
  when: ContextKeyExpr.and(
    IsSessionsWindowContext,
    SessionIsArchivedContext.isEqualTo(false)
  )
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYXBwbHlDb21taXRzVG9QYXJlbnRSZXBvL2Jyb3dzZXIvYXBwbHlDaGFuZ2VzVG9QYXJlbnRSZXBvLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuXG5jb25zdCBoYXNXb3JrdHJlZUFuZFJlcG9zaXRvcnlDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2FnZW50U2Vzc2lvbkhhc1dvcmt0cmVlQW5kUmVwb3NpdG9yeScsIGZhbHNlLCB7XG5cdHR5cGU6ICdib29sZWFuJyxcblx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudFNlc3Npb25IYXNXb3JrdHJlZUFuZFJlcG9zaXRvcnknLCBcIlRydWUgd2hlbiB0aGUgYWN0aXZlIGFnZW50IHNlc3Npb24gaGFzIGJvdGggYSB3b3JrdHJlZSBhbmQgYSBwYXJlbnQgcmVwb3NpdG9yeS5cIilcbn0pO1xuXG5jbGFzcyBBcHBseUNoYW5nZXNUb1BhcmVudFJlcG9Db250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3Nlc3Npb25zLmNvbnRyaWIuYXBwbHlDaGFuZ2VzVG9QYXJlbnRSZXBvJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2Ugc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgd29ya3RyZWVBbmRSZXBvS2V5ID0gaGFzV29ya3RyZWVBbmRSZXBvc2l0b3J5Q29udGV4dEtleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGZvbGRlciA9IGFjdGl2ZVNlc3Npb24/LndvcmtzcGFjZS5yZWFkKHJlYWRlcik/LmZvbGRlcnNbMF07XG5cdFx0XHRjb25zdCBoYXNXb3JrdHJlZUFuZFJlcG8gPSAhIWZvbGRlcj8uZ2l0UmVwb3NpdG9yeT8ud29ya1RyZWVVcmk7XG5cdFx0XHR3b3JrdHJlZUFuZFJlcG9LZXkuc2V0KGhhc1dvcmt0cmVlQW5kUmVwbyk7XG5cdFx0fSkpO1xuXHR9XG59XG5cbmNsYXNzIEFwcGx5Q2hhbmdlc1RvUGFyZW50UmVwb0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnY2hhdEVkaXRpbmcuYXBwbHlDaGFuZ2VzVG9QYXJlbnRSZXBvJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQXBwbHlDaGFuZ2VzVG9QYXJlbnRSZXBvQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYXBwbHlDaGFuZ2VzVG9QYXJlbnRSZXBvJywgJ0FwcGx5IENoYW5nZXMgdG8gUGFyZW50IFJlcG9zaXRvcnknKSxcblx0XHRcdGljb246IENvZGljb24uZGVza3RvcERvd25sb2FkLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsXG5cdFx0XHRcdGhhc1dvcmt0cmVlQW5kUmVwb3NpdG9yeUNvbnRleHRLZXksXG5cdFx0XHQpLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudHNDaGFuZ2VzUHJpbWFyeUFjdGlvblN1Yk1lbnUsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5mYWxzZSgpLFxuXHRcdFx0XHRcdFx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsXG5cdFx0XHRcdFx0XHRoYXNXb3JrdHJlZUFuZFJlcG9zaXRvcnlDb250ZXh0S2V5XG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBvcGVuZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJvZHVjdFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGNvbnN0IGZvbGRlciA9IGFjdGl2ZVNlc3Npb24/LndvcmtzcGFjZS5nZXQoKT8uZm9sZGVyc1swXTtcblx0XHRpZiAoIWFjdGl2ZVNlc3Npb24gfHwgIWZvbGRlcj8uZ2l0UmVwb3NpdG9yeT8ud29ya1RyZWVVcmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3b3JrdHJlZVJvb3QgPSBmb2xkZXIuZ2l0UmVwb3NpdG9yeS53b3JrVHJlZVVyaTtcblx0XHRjb25zdCByZXBvUm9vdCA9IGZvbGRlci5yb290O1xuXG5cdFx0Y29uc3Qgb3BlbkZvbGRlckFjdGlvbiA9IHRvQWN0aW9uKHtcblx0XHRcdGlkOiAnYXBwbHlDaGFuZ2VzVG9QYXJlbnRSZXBvLm9wZW5Gb2xkZXInLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdvcGVuSW5WU0NvZGUnLCBcIk9wZW4gaW4gVlMgQ29kZVwiKSxcblx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzY2hlbWUgPSBwcm9kdWN0U2VydmljZS5xdWFsaXR5ID09PSAnc3RhYmxlJ1xuXHRcdFx0XHRcdD8gJ3ZzY29kZSdcblx0XHRcdFx0XHQ6IHByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgPT09ICdleHBsb3JhdGlvbidcblx0XHRcdFx0XHRcdD8gJ3ZzY29kZS1leHBsb3JhdGlvbidcblx0XHRcdFx0XHRcdDogJ3ZzY29kZS1pbnNpZGVycyc7XG5cblx0XHRcdFx0Y29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcygpO1xuXHRcdFx0XHRwYXJhbXMuc2V0KCd3aW5kb3dJZCcsICdfYmxhbmsnKTtcblx0XHRcdFx0cGFyYW1zLnNldCgnc2Vzc2lvbicsIGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRcdFx0b3BlbmVyU2VydmljZS5vcGVuKFVSSS5mcm9tKHtcblx0XHRcdFx0XHRzY2hlbWUsXG5cdFx0XHRcdFx0YXV0aG9yaXR5OiBTY2hlbWFzLmZpbGUsXG5cdFx0XHRcdFx0cGF0aDogcmVwb1Jvb3QucGF0aCxcblx0XHRcdFx0XHRxdWVyeTogcGFyYW1zLnRvU3RyaW5nKCksXG5cdFx0XHRcdH0pLCB7IG9wZW5FeHRlcm5hbDogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBHZXQgdGhlIHdvcmt0cmVlIGJyYW5jaCBuYW1lLiBTaW5jZSB0aGUgd29ya3RyZWUgYW5kIHBhcmVudCByZXBvXG5cdFx0XHQvLyBzaGFyZSB0aGUgc2FtZSBnaXQgb2JqZWN0IHN0b3JlLCB0aGUgcGFyZW50IGNhbiBkaXJlY3RseSByZWZlcmVuY2Vcblx0XHRcdC8vIHRoaXMgYnJhbmNoIGZvciBhIG1lcmdlLlxuXHRcdFx0Y29uc3Qgd29ya3RyZWVCcmFuY2ggPSBhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxzdHJpbmc+KFxuXHRcdFx0XHQnX2dpdC5yZXZQYXJzZUFiYnJldlJlZicsXG5cdFx0XHRcdHdvcmt0cmVlUm9vdC5mc1BhdGhcblx0XHRcdCk7XG5cblx0XHRcdGlmICghd29ya3RyZWVCcmFuY2gpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdhcHBseUNoYW5nZXNOb0JyYW5jaCcsIFwiQ291bGQgbm90IGRldGVybWluZSB3b3JrdHJlZSBicmFuY2ggbmFtZS5cIiksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1lcmdlIHRoZSB3b3JrdHJlZSBicmFuY2ggaW50byB0aGUgcGFyZW50IHJlcG8uXG5cdFx0XHQvLyBUaGlzIGlzIGlkZW1wb3RlbnQ6IGlmIGFscmVhZHkgbWVyZ2VkLCBnaXQgc2F5cyBcIkFscmVhZHkgdXAgdG8gZGF0ZS5cIlxuXHRcdFx0Ly8gSWYgbmV3IGNvbW1pdHMgZXhpc3QsIHRoZXkncmUgYnJvdWdodCBpbi4gSGFuZGxlcyBwYXJ0aWFsIGFwcGxpZXMgbmF0dXJhbGx5LlxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ19naXQubWVyZ2VCcmFuY2gnLCByZXBvUm9vdC5mc1BhdGgsIHdvcmt0cmVlQnJhbmNoKTtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2Uud2FybignW0FwcGx5Q2hhbmdlc1RvUGFyZW50UmVwb10gTm8gcmVzdWx0IGZyb20gbWVyZ2UgY29tbWFuZCcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnICYmIHJlc3VsdC5zdGFydHNXaXRoKCdBbHJlYWR5IHVwIHRvIGRhdGUnKVxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnYWxyZWFkeVVwVG9EYXRlJywgJ1BhcmVudCByZXBvc2l0b3J5IGlzIHVwIHRvIGRhdGUgd2l0aCB3b3JrdHJlZS4nKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYXBwbHlDaGFuZ2VzU3VjY2VzcycsICdBcHBsaWVkIGNoYW5nZXMgdG8gcGFyZW50IHJlcG9zaXRvcnkuJyksXG5cdFx0XHRcdFx0YWN0aW9uczogeyBwcmltYXJ5OiBbb3BlbkZvbGRlckFjdGlvbl0gfVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ1tBcHBseUNoYW5nZXNUb1BhcmVudFJlcG9dIEZhaWxlZCB0byBhcHBseSBjaGFuZ2VzJywgZXJyKTtcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdhcHBseUNoYW5nZXNDb25mbGljdCcsIFwiRmFpbGVkIHRvIGFwcGx5IGNoYW5nZXMgdG8gcGFyZW50IHJlcG8uIFRoZSBwYXJlbnQgcmVwbyBtYXkgaGF2ZSBkaXZlcmdlZCBcdTIwMTQgcmVzb2x2ZSBjb25mbGljdHMgbWFudWFsbHkuXCIpLFxuXHRcdFx0XHRhY3Rpb25zOiB7IHByaW1hcnk6IFtvcGVuRm9sZGVyQWN0aW9uXSB9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKEFwcGx5Q2hhbmdlc1RvUGFyZW50UmVwb0FjdGlvbik7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQXBwbHlDaGFuZ2VzVG9QYXJlbnRSZXBvQ29udHJpYnV0aW9uLklELCBBcHBseUNoYW5nZXNUb1BhcmVudFJlcG9Db250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xuXG4vLyBSZWdpc3RlciB0aGUgYXBwbHkgc3VibWVudSBpbiB0aGUgc2Vzc2lvbiBjaGFuZ2VzIHRvb2xiYXJcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQWdlbnRzQ2hhbmdlc1Rvb2xiYXIsIHtcblx0c3VibWVudTogTWVudUlkLkFnZW50c0NoYW5nZXNQcmltYXJ5QWN0aW9uU3ViTWVudSxcblx0dGl0bGU6IGxvY2FsaXplMignYXBwbHlBY3Rpb25zJywgJ0FwcGx5IEFjdGlvbnMnKSxcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0b3JkZXI6IDEsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dCxc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
