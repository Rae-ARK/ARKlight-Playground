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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { ILoggerService } from "../../../../platform/log/common/log.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { IAICustomizationWorkspaceService } from "../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js";
import { IPromptsService, PromptsStorage } from "../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js";
import { PromptsType } from "../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js";
import { AICustomizationManagementSection } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js";
import { IMcpService } from "../../../../workbench/contrib/mcp/common/mcpTypes.js";
const PROMPT_SECTIONS = [
  { section: AICustomizationManagementSection.Agents, type: PromptsType.agent },
  { section: AICustomizationManagementSection.Skills, type: PromptsType.skill },
  { section: AICustomizationManagementSection.Instructions, type: PromptsType.instructions },
  { section: AICustomizationManagementSection.Hooks, type: PromptsType.hook }
];
let CustomizationsDebugLogContribution = class extends Disposable {
  constructor(loggerService, _promptsService, _workspaceService, _workspaceContextService, _mcpService) {
    super();
    this._promptsService = _promptsService;
    this._workspaceService = _workspaceService;
    this._workspaceContextService = _workspaceContextService;
    this._mcpService = _mcpService;
    this._snapshotDirty = false;
    this._logger = this._register(loggerService.createLogger("customizationsDebug", { name: "Customizations Debug" }));
    this._register(this._promptsService.onDidChangeCustomAgents(() => this._logSnapshot()));
    this._register(this._promptsService.onDidChangeSlashCommands(() => this._logSnapshot()));
    this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._logSnapshot()));
    this._register(autorun((reader) => {
      this._workspaceService.activeProjectRoot.read(reader);
      this._logSnapshot();
    }));
    this._register(autorun((reader) => {
      this._mcpService.servers.read(reader);
      this._logSnapshot();
    }));
  }
  _logSnapshot() {
    if (this._pendingSnapshot) {
      this._snapshotDirty = true;
      return;
    }
    this._pendingSnapshot = this._doLogSnapshot().finally(() => {
      this._pendingSnapshot = void 0;
      if (this._snapshotDirty) {
        this._snapshotDirty = false;
        this._logSnapshot();
      }
    });
  }
  async _doLogSnapshot() {
    const root = this._workspaceService.getActiveProjectRoot()?.fsPath ?? "(none)";
    this._logger.info("");
    this._logger.info("=== Customizations Snapshot ===");
    this._logger.info(`  Root: ${root}`);
    this._logger.info(`  Sections: ${this._workspaceService.managementSections.join(", ")}`);
    this._logger.info("");
    this._logger.info(`  ${"Section".padEnd(16)} ${"Local".padStart(6)} ${"User".padStart(6)} ${"Ext".padStart(6)} ${"Total".padStart(7)}`);
    this._logger.info(`  ${"--------".padEnd(16)} ${"-----".padStart(6)} ${"----".padStart(6)} ${"---".padStart(6)} ${"-----".padStart(7)}`);
    for (const { section, type } of PROMPT_SECTIONS) {
      await this._logSectionRow(section, type);
    }
    this._logger.info("");
    for (const { section, type } of PROMPT_SECTIONS) {
      await this._logSectionDetails(section, type);
    }
    this._logMcpServers();
  }
  _logMcpServers() {
    const servers = this._mcpService.servers.get();
    this._logger.info(`  -- MCP Servers (${servers.length}) --`);
    if (servers.length === 0) {
      this._logger.info("     (none registered)");
    }
    for (const server of servers) {
      const state = server.connectionState.get();
      const stateStr = state?.state ?? "unknown";
      this._logger.info(`     ${server.definition.label} [${stateStr}] id=${server.definition.id}`);
    }
    this._logger.info("");
  }
  async _logSectionRow(section, type) {
    try {
      const [localFiles, userFiles, extensionFiles] = await Promise.all([
        this._promptsService.listPromptFilesForStorage(type, PromptsStorage.local, CancellationToken.None),
        this._promptsService.listPromptFilesForStorage(type, PromptsStorage.user, CancellationToken.None),
        this._promptsService.listPromptFilesForStorage(type, PromptsStorage.extension, CancellationToken.None)
      ]);
      const all = [...localFiles, ...userFiles, ...extensionFiles];
      const local = all.filter((f) => f.storage === PromptsStorage.local).length;
      const user = all.filter((f) => f.storage === PromptsStorage.user).length;
      const ext = all.filter((f) => f.storage === PromptsStorage.extension).length;
      this._logger.info(`  ${section.padEnd(16)} ${String(local).padStart(6)} ${String(user).padStart(6)} ${String(ext).padStart(6)} ${String(all.length).padStart(7)}`);
    } catch {
      this._logger.info(`  ${section.padEnd(16)}  (error)`);
    }
  }
  async _logSectionDetails(section, type) {
    try {
      const sourceFolders = await this._promptsService.getSourceFolders(type);
      if (sourceFolders.length > 0) {
        this._logger.info(`  -- ${section} --`);
        this._logger.info(`     Search paths:`);
        for (const sf of sourceFolders) {
          this._logger.info(`       [${sf.storage}] ${sf.uri.fsPath}`);
        }
      }
      const [localFiles, userFiles, extensionFiles] = await Promise.all([
        this._promptsService.listPromptFilesForStorage(type, PromptsStorage.local, CancellationToken.None),
        this._promptsService.listPromptFilesForStorage(type, PromptsStorage.user, CancellationToken.None),
        this._promptsService.listPromptFilesForStorage(type, PromptsStorage.extension, CancellationToken.None)
      ]);
      const all = [...localFiles, ...userFiles, ...extensionFiles];
      if (all.length > 0) {
        if (sourceFolders.length === 0) {
          this._logger.info(`  -- ${section} --`);
        }
        this._logger.info(`     Found ${all.length} item(s):`);
        for (const f of all) {
          this._logger.info(`       [${f.storage}] ${f.uri.fsPath}`);
        }
      }
      if (sourceFolders.length > 0 || all.length > 0) {
        this._logger.info("");
      }
    } catch {
    }
  }
};
CustomizationsDebugLogContribution.ID = "sessions.customizationsDebugLog";
CustomizationsDebugLogContribution = __decorateClass([
  __decorateParam(0, ILoggerService),
  __decorateParam(1, IPromptsService),
  __decorateParam(2, IAICustomizationWorkspaceService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IMcpService)
], CustomizationsDebugLogContribution);
registerWorkbenchContribution2(
  CustomizationsDebugLogContribution.ID,
  CustomizationsDebugLogContribution,
  WorkbenchPhase.AfterRestored
);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL2N1c3RvbWl6YXRpb25zRGVidWdMb2cuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyLCBJTG9nZ2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9haUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSwgUHJvbXB0c1N0b3JhZ2UsIElQcm9tcHRQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9tY3AvY29tbW9uL21jcFR5cGVzLmpzJztcblxuY29uc3QgUFJPTVBUX1NFQ1RJT05TOiB7IHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uOyB0eXBlOiBQcm9tcHRzVHlwZSB9W10gPSBbXG5cdHsgc2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzLCB0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCB9LFxuXHR7IHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscywgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwgfSxcblx0eyBzZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9LFxuXHR7IHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzLCB0eXBlOiBQcm9tcHRzVHlwZS5ob29rIH0sXG5dO1xuXG5jbGFzcyBDdXN0b21pemF0aW9uc0RlYnVnTG9nQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzZXNzaW9ucy5jdXN0b21pemF0aW9uc0RlYnVnTG9nJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXI6IElMb2dnZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dnZXJTZXJ2aWNlIGxvZ2dlclNlcnZpY2U6IElMb2dnZXJTZXJ2aWNlLFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvbXB0c1NlcnZpY2U6IElQcm9tcHRzU2VydmljZSxcblx0XHRASUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlU2VydmljZTogSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tY3BTZXJ2aWNlOiBJTWNwU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2xvZ2dlciA9IHRoaXMuX3JlZ2lzdGVyKGxvZ2dlclNlcnZpY2UuY3JlYXRlTG9nZ2VyKCdjdXN0b21pemF0aW9uc0RlYnVnJywgeyBuYW1lOiAnQ3VzdG9taXphdGlvbnMgRGVidWcnIH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Byb21wdHNTZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzKCgpID0+IHRoaXMuX2xvZ1NuYXBzaG90KCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9wcm9tcHRzU2VydmljZS5vbkRpZENoYW5nZVNsYXNoQ29tbWFuZHMoKCkgPT4gdGhpcy5fbG9nU25hcHNob3QoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycygoKSA9PiB0aGlzLl9sb2dTbmFwc2hvdCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlU2VydmljZS5hY3RpdmVQcm9qZWN0Um9vdC5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9sb2dTbmFwc2hvdCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9tY3BTZXJ2aWNlLnNlcnZlcnMucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fbG9nU25hcHNob3QoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9wZW5kaW5nU25hcHNob3Q6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NuYXBzaG90RGlydHkgPSBmYWxzZTtcblxuXHRwcml2YXRlIF9sb2dTbmFwc2hvdCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ1NuYXBzaG90KSB7XG5cdFx0XHR0aGlzLl9zbmFwc2hvdERpcnR5ID0gdHJ1ZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ1NuYXBzaG90ID0gdGhpcy5fZG9Mb2dTbmFwc2hvdCgpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1NuYXBzaG90ID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRoaXMuX3NuYXBzaG90RGlydHkpIHtcblx0XHRcdFx0dGhpcy5fc25hcHNob3REaXJ0eSA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl9sb2dTbmFwc2hvdCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9Mb2dTbmFwc2hvdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByb290ID0gdGhpcy5fd29ya3NwYWNlU2VydmljZS5nZXRBY3RpdmVQcm9qZWN0Um9vdCgpPy5mc1BhdGggPz8gJyhub25lKSc7XG5cblx0XHR0aGlzLl9sb2dnZXIuaW5mbygnJyk7XG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oJz09PSBDdXN0b21pemF0aW9ucyBTbmFwc2hvdCA9PT0nKTtcblx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgICBSb290OiAke3Jvb3R9YCk7XG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oYCAgU2VjdGlvbnM6ICR7dGhpcy5fd29ya3NwYWNlU2VydmljZS5tYW5hZ2VtZW50U2VjdGlvbnMuam9pbignLCAnKX1gKTtcblx0XHR0aGlzLl9sb2dnZXIuaW5mbygnJyk7XG5cblx0XHQvLyBIZWFkZXJcblx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgICAkeydTZWN0aW9uJy5wYWRFbmQoMTYpfSAkeydMb2NhbCcucGFkU3RhcnQoNil9ICR7J1VzZXInLnBhZFN0YXJ0KDYpfSAkeydFeHQnLnBhZFN0YXJ0KDYpfSAkeydUb3RhbCcucGFkU3RhcnQoNyl9YCk7XG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oYCAgJHsnLS0tLS0tLS0nLnBhZEVuZCgxNil9ICR7Jy0tLS0tJy5wYWRTdGFydCg2KX0gJHsnLS0tLScucGFkU3RhcnQoNil9ICR7Jy0tLScucGFkU3RhcnQoNil9ICR7Jy0tLS0tJy5wYWRTdGFydCg3KX1gKTtcblxuXHRcdGZvciAoY29uc3QgeyBzZWN0aW9uLCB0eXBlIH0gb2YgUFJPTVBUX1NFQ1RJT05TKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9sb2dTZWN0aW9uUm93KHNlY3Rpb24sIHR5cGUpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKCcnKTtcblxuXHRcdC8vIERldGFpbHMgcGVyIHNlY3Rpb25cblx0XHRmb3IgKGNvbnN0IHsgc2VjdGlvbiwgdHlwZSB9IG9mIFBST01QVF9TRUNUSU9OUykge1xuXHRcdFx0YXdhaXQgdGhpcy5fbG9nU2VjdGlvbkRldGFpbHMoc2VjdGlvbiwgdHlwZSk7XG5cdFx0fVxuXG5cdFx0Ly8gTUNQIFNlcnZlcnNcblx0XHR0aGlzLl9sb2dNY3BTZXJ2ZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9sb2dNY3BTZXJ2ZXJzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlcnZlcnMgPSB0aGlzLl9tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCk7XG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oYCAgLS0gTUNQIFNlcnZlcnMgKCR7c2VydmVycy5sZW5ndGh9KSAtLWApO1xuXHRcdGlmIChzZXJ2ZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oJyAgICAgKG5vbmUgcmVnaXN0ZXJlZCknKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2Ygc2VydmVycykge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzZXJ2ZXIuY29ubmVjdGlvblN0YXRlLmdldCgpO1xuXHRcdFx0Y29uc3Qgc3RhdGVTdHIgPSBzdGF0ZT8uc3RhdGUgPz8gJ3Vua25vd24nO1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYCAgICAgJHtzZXJ2ZXIuZGVmaW5pdGlvbi5sYWJlbH0gWyR7c3RhdGVTdHJ9XSBpZD0ke3NlcnZlci5kZWZpbml0aW9uLmlkfWApO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dnZXIuaW5mbygnJyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9sb2dTZWN0aW9uUm93KHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLCB0eXBlOiBQcm9tcHRzVHlwZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBbbG9jYWxGaWxlcywgdXNlckZpbGVzLCBleHRlbnNpb25GaWxlc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHRoaXMuX3Byb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UodHlwZSwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHR0aGlzLl9wcm9tcHRzU2VydmljZS5saXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlKHR5cGUsIFByb21wdHNTdG9yYWdlLnVzZXIsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHR0aGlzLl9wcm9tcHRzU2VydmljZS5saXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlKHR5cGUsIFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IGFsbDogSVByb21wdFBhdGhbXSA9IFsuLi5sb2NhbEZpbGVzLCAuLi51c2VyRmlsZXMsIC4uLmV4dGVuc2lvbkZpbGVzXTtcblx0XHRcdGNvbnN0IGxvY2FsID0gYWxsLmZpbHRlcihmID0+IGYuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwpLmxlbmd0aDtcblx0XHRcdGNvbnN0IHVzZXIgPSBhbGwuZmlsdGVyKGYgPT4gZi5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS51c2VyKS5sZW5ndGg7XG5cdFx0XHRjb25zdCBleHQgPSBhbGwuZmlsdGVyKGYgPT4gZi5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24pLmxlbmd0aDtcblxuXHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYCAgJHtzZWN0aW9uLnBhZEVuZCgxNil9ICR7U3RyaW5nKGxvY2FsKS5wYWRTdGFydCg2KX0gJHtTdHJpbmcodXNlcikucGFkU3RhcnQoNil9ICR7U3RyaW5nKGV4dCkucGFkU3RhcnQoNil9ICR7U3RyaW5nKGFsbC5sZW5ndGgpLnBhZFN0YXJ0KDcpfWApO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYCAgJHtzZWN0aW9uLnBhZEVuZCgxNil9ICAoZXJyb3IpYCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbG9nU2VjdGlvbkRldGFpbHMoc2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24sIHR5cGU6IFByb21wdHNUeXBlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFNvdXJjZSBmb2xkZXJzIC0gd2hlcmUgd2UgbG9vayBmb3IgZmlsZXNcblx0XHRcdGNvbnN0IHNvdXJjZUZvbGRlcnMgPSBhd2FpdCB0aGlzLl9wcm9tcHRzU2VydmljZS5nZXRTb3VyY2VGb2xkZXJzKHR5cGUpO1xuXHRcdFx0aWYgKHNvdXJjZUZvbGRlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgICAtLSAke3NlY3Rpb259IC0tYCk7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKGAgICAgIFNlYXJjaCBwYXRoczpgKTtcblx0XHRcdFx0Zm9yIChjb25zdCBzZiBvZiBzb3VyY2VGb2xkZXJzKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYCAgICAgICBbJHtzZi5zdG9yYWdlfV0gJHtzZi51cmkuZnNQYXRofWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IFtsb2NhbEZpbGVzLCB1c2VyRmlsZXMsIGV4dGVuc2lvbkZpbGVzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhpcy5fcHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZSh0eXBlLCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdHRoaXMuX3Byb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UodHlwZSwgUHJvbXB0c1N0b3JhZ2UudXNlciwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdHRoaXMuX3Byb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UodHlwZSwgUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgYWxsOiBJUHJvbXB0UGF0aFtdID0gWy4uLmxvY2FsRmlsZXMsIC4uLnVzZXJGaWxlcywgLi4uZXh0ZW5zaW9uRmlsZXNdO1xuXG5cdFx0XHRpZiAoYWxsLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0aWYgKHNvdXJjZUZvbGRlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYCAgLS0gJHtzZWN0aW9ufSAtLWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKGAgICAgIEZvdW5kICR7YWxsLmxlbmd0aH0gaXRlbShzKTpgKTtcblx0XHRcdFx0Zm9yIChjb25zdCBmIG9mIGFsbCkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKGAgICAgICAgWyR7Zi5zdG9yYWdlfV0gJHtmLnVyaS5mc1BhdGh9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHNvdXJjZUZvbGRlcnMubGVuZ3RoID4gMCB8fCBhbGwubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9sb2dnZXIuaW5mbygnJyk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBhbHJlYWR5IGxvZ2dlZCBpbiByb3dcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFxuXHRDdXN0b21pemF0aW9uc0RlYnVnTG9nQ29udHJpYnV0aW9uLklELFxuXHRDdXN0b21pemF0aW9uc0RlYnVnTG9nQ29udHJpYnV0aW9uLFxuXHRXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkLFxuKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQWtCLHNCQUFzQjtBQUN4QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFpQyxnQ0FBZ0Msc0JBQXNCO0FBQ3ZGLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsaUJBQWlCLHNCQUFtQztBQUM3RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHdDQUF3QztBQUNqRCxTQUFTLG1CQUFtQjtBQUU1QixNQUFNLGtCQUFzRjtBQUFBLEVBQzNGLEVBQUUsU0FBUyxpQ0FBaUMsUUFBUSxNQUFNLFlBQVksTUFBTTtBQUFBLEVBQzVFLEVBQUUsU0FBUyxpQ0FBaUMsUUFBUSxNQUFNLFlBQVksTUFBTTtBQUFBLEVBQzVFLEVBQUUsU0FBUyxpQ0FBaUMsY0FBYyxNQUFNLFlBQVksYUFBYTtBQUFBLEVBQ3pGLEVBQUUsU0FBUyxpQ0FBaUMsT0FBTyxNQUFNLFlBQVksS0FBSztBQUMzRTtBQUVBLElBQU0scUNBQU4sY0FBaUQsV0FBNkM7QUFBQSxFQU03RixZQUNpQixlQUNrQixpQkFDaUIsbUJBQ1IsMEJBQ2IsYUFDN0I7QUFDRCxVQUFNO0FBTDRCO0FBQ2lCO0FBQ1I7QUFDYjtBQW1CL0IsU0FBUSxpQkFBaUI7QUFoQnhCLFNBQUssVUFBVSxLQUFLLFVBQVUsY0FBYyxhQUFhLHVCQUF1QixFQUFFLE1BQU0sdUJBQXVCLENBQUMsQ0FBQztBQUVqSCxTQUFLLFVBQVUsS0FBSyxnQkFBZ0Isd0JBQXdCLE1BQU0sS0FBSyxh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
